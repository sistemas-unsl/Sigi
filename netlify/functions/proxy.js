/**
 * proxy.js — Netlify Function
 * Proxy entre el frontend y Google Apps Script.
 * Verifica token de Cloudflare Turnstile para acción "createTicket".
 */
const DEFAULT_APPS_SCRIPT_URL =
  String(process.env.APPS_SCRIPT_URL || "").trim() ||
  "https://script.google.com/macros/s/AKfycbzskCljxx7SuU4CdXrM0X7YnM0f2SHzVAri4t44SleAMFYns50RTYU-0JbKJTlfea2Y/exec";

const APPS_SCRIPT_URLS = Array.from(new Set([
  DEFAULT_APPS_SCRIPT_URL
].filter(Boolean)));

const TURNSTILE_SECRET = String(process.env.TURNSTILE_SECRET || "").trim();
const APPS_SCRIPT_TIMEOUT_MS = Number(process.env.APPS_SCRIPT_TIMEOUT_MS || 25000);

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
    const action = String(parsed.action || "").trim();

    /* ── Verificación Turnstile deshabilitada a solicitud del usuario ── */

    /* ── Reenviar a Apps Script ──
       Si Netlify tiene una APPS_SCRIPT_URL migrada y rota, probamos el deploy
       operativo conocido. Google a veces responde HTML de Drive ante problemas
       de permisos; el frontend siempre debe recibir JSON. */
    const retryableActions = new Set([
      "login",
      "getUserContext",
      "listTickets",
      "listPersonalByArea",
      "consultarEstado",
      "health"
    ]);

    const result = retryableActions.has(action)
      ? await firstValidAppsScriptResponse(parsed, action)
      : await singleAppsScriptResponse(parsed, action);

    if (result.ok) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
        body: result.text
      };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      body: JSON.stringify({
        ok: false,
        error: result.error || "No fue posible conectar con Apps Script."
      })
    };

  } catch (err) {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      body: JSON.stringify({ ok: false, error: String(err && err.message ? err.message : err) })
    };
  }
}

async function singleAppsScriptResponse(parsed, action) {
  const url = APPS_SCRIPT_URLS[0];

  try {
    const result = await postToAppsScript(url, parsed);
    return validateAppsScriptResponse(result, action);
  } catch (err) {
    return { ok: false, error: normalizeProxyError(err) };
  }
}

async function firstValidAppsScriptResponse(parsed, action) {
  const pending = APPS_SCRIPT_URLS.map((url, index) =>
    postToAppsScript(url, parsed)
      .then(result => ({ index, ...validateAppsScriptResponse(result, action) }))
      .catch(err => ({ index, ok: false, error: normalizeProxyError(err) }))
  );

  const errors = [];

  while (pending.length) {
    const settled = await Promise.race(pending.map((promise, index) => promise.then(value => ({ value, index }))));
    pending.splice(settled.index, 1);

    if (settled.value.ok) return settled.value;
    errors.push(settled.value.error);
  }

  return { ok: false, error: errors.find(Boolean) || "No fue posible conectar con Apps Script." };
}

function validateAppsScriptResponse(result, action) {
  const resp = result.resp;
  const text = result.text || "";
  const trimmed = text.trim();

  if (resp.ok && (trimmed.startsWith("{") || trimmed.startsWith("["))) {
    const json = tryParseJson(trimmed);
    if (shouldIgnoreAppsScriptJson(json, action)) {
      return { ok: false, error: json.error || "La implementacion no reconoce la accion." };
    }

    return { ok: true, text };
  }

  return { ok: false, error: `Apps Script devolvió una respuesta no JSON (${resp.status}).` };
}

async function postToAppsScript(url, parsed) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), APPS_SCRIPT_TIMEOUT_MS);

  try {
    const resp = await fetch(url, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(parsed),
      signal:  controller.signal
    });

    return {
      resp,
      text: await resp.text()
    };
  } finally {
    clearTimeout(timer);
  }
}

function normalizeProxyError(err) {
  if (err && err.name === "AbortError") {
    return "Tiempo agotado al conectar con Apps Script.";
  }

  return String(err && err.message ? err.message : err);
}

function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch (err) {
    return null;
  }
}

function shouldIgnoreAppsScriptJson(json, action) {
  if (!json || json.ok !== false) return false;

  const err = String(json.error || "").toLowerCase();
  if (action === "health" && err.includes("acción inválida")) return true;
  if (action === "health" && err.includes("accion inválida")) return true;
  if (action === "health" && err.includes("accion invalida")) return true;

  return false;
}
