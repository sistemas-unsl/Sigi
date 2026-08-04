/**
 * proxy.js — Netlify Function
 * Proxy entre el frontend y Google Apps Script.
 */
const APPS_SCRIPT_TIMEOUT_MS = 20000;

// Esta es la implementacion 135 verificada del proyecto recuperado.
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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), APPS_SCRIPT_TIMEOUT_MS);

  try {
    const resp = await fetch(APPS_SCRIPT_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(parsed),
      signal:  controller.signal
    });

    const text = await resp.text();
    const trimmed = text.trim();

    if (resp.ok && (trimmed.startsWith("{") || trimmed.startsWith("["))) {
      return trimmed;
    }

    return JSON.stringify({
      ok: false,
      error: `Apps Script devolvió una respuesta no JSON (${resp.status}).`
    });
  } catch (err) {
    return JSON.stringify({
      ok: false,
      error: controller.signal.aborted
        ? "Apps Script agotó el tiempo de respuesta."
        : String(err && err.message ? err.message : err)
    });
  } finally {
    clearTimeout(timeout);
  }
}
