/**
 * proxy.js — Netlify Function
 * Proxy entre el frontend y Google Apps Script.
 */
const APPS_SCRIPT_TIMEOUT_MS = 20000;

const APPS_SCRIPT_URL = String(process.env.APPS_SCRIPT_URL || "").trim();

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
  if (!APPS_SCRIPT_URL) {
    return JSON.stringify({ ok: false, error: "Falta configurar APPS_SCRIPT_URL en Netlify." });
  }

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
