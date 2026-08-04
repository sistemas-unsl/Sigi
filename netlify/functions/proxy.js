/**
 * proxy.js — Netlify Function
 * Proxy entre el frontend y Google Apps Script.
 */
import https from "node:https";

const APPS_SCRIPT_TIMEOUT_MS = 20000;

// Esta es la implementacion 136 verificada del proyecto recuperado.
// Se fija para que Netlify no use una variable antigua o con caracteres mal copiados.
const APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbyE9JOHKGZeMMU3NxhOuqQOdMm7FgGLfXhibHBZQGobJLG0kDEN4ebgAP207Czy3AQk/exec";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "" };
  }

  try {
    const body   = event.body || "{}";
    const parsed = JSON.parse(body);

    /* ── Reenviar a Apps Script ── */
    const result = await postToAppsScript(parsed);
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      body: result
    };

  } catch (err) {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      body: JSON.stringify({ ok: false, error: String(err && err.message ? err.message : err) })
    };
  }
}

async function postToAppsScript(parsed) {
  try {
    const body = JSON.stringify(parsed);
    let resp = await requestText(APPS_SCRIPT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body)
      },
      body
    });

    // Apps Script procesa el POST y responde con un 302 a googleusercontent.
    // Seguimos ese salto de forma explicita: el fetch de Netlify puede quedar
    // esperando en este punto, aun cuando Apps Script ya termino la ejecucion.
    if (resp.statusCode >= 300 && resp.statusCode < 400 && resp.headers.location) {
      resp = await requestText(resp.headers.location);
    }

    const trimmed = resp.body.trim();

    if (resp.statusCode >= 200 && resp.statusCode < 300 && (trimmed.startsWith("{") || trimmed.startsWith("["))) {
      return trimmed;
    }

    return JSON.stringify({
      ok: false,
      error: `Apps Script devolvió una respuesta no JSON (${resp.statusCode}).`
    });
  } catch (err) {
    return JSON.stringify({
      ok: false,
      error: String(err && err.message ? err.message : err)
    });
  }
}

function requestText(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: options.method || "GET",
      headers: options.headers || {},
      timeout: APPS_SCRIPT_TIMEOUT_MS
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({
        statusCode: res.statusCode || 0,
        headers: res.headers,
        body: Buffer.concat(chunks).toString("utf8")
      }));
    });

    req.on("timeout", () => req.destroy(new Error("Apps Script agotó el tiempo de respuesta.")));
    req.on("error", reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}
