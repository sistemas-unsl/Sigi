/**
 * proxy.js — Netlify Function
 * Proxy entre el frontend y Google Apps Script.
 * Verifica token de Cloudflare Turnstile para acción "createTicket".
 */
const APPS_SCRIPT_URL = String(
  process.env.APPS_SCRIPT_URL ||
  "https://script.google.com/macros/s/AKfycbyt01Oa0d2850A9Q7sW2C6zd5jg05UihidlUNd6fnvJYHA5feDSz6SMlFkS_DmzqyML/exec"
).trim();

const TURNSTILE_SECRET = String(process.env.TURNSTILE_SECRET || "0x4AAAAAACpsf2v_wX8P6Se84BbCDT151DE").trim();

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

    /* ── Reenviar a Apps Script ── */
    const resp = await fetch(APPS_SCRIPT_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(parsed)
    });

    const text = await resp.text();
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      body: text
    };

  } catch (err) {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      body: JSON.stringify({ ok: false, error: String(err && err.message ? err.message : err) })
    };
  }
}
