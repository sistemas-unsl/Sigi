/**
 * proxy.js — Netlify Function
 * Proxy entre el frontend y Google Apps Script.
 */
const FALLBACK_APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbzZ3XAmopGRNX80MJw5R5rsp48662WjXjGie9t28tI5mlq-Ww5Y_SjXjQ5uJtGNGWg/exec";

const APPS_SCRIPT_URLS = Array.from(new Set([
  process.env.APPS_SCRIPT_URL,
  FALLBACK_APPS_SCRIPT_URL
].map(url => String(url || "").trim()).filter(Boolean)));

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
    const result = await postToFirstJsonAppsScript(parsed);
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

async function postToFirstJsonAppsScript(parsed) {
  let lastError = "No fue posible conectar con Apps Script.";

  for (const url of APPS_SCRIPT_URLS) {
    try {
      const resp = await fetch(url, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(parsed)
      });

      const text = await resp.text();
      const trimmed = text.trim();

      if (resp.ok && (trimmed.startsWith("{") || trimmed.startsWith("["))) {
        return trimmed;
      }

      lastError = `Apps Script devolvió una respuesta no JSON (${resp.status}).`;
    } catch (err) {
      lastError = String(err && err.message ? err.message : err);
    }
  }

  return JSON.stringify({ ok: false, error: lastError });
}
