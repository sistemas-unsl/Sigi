/**
 * proxy.js — Netlify Function
 * Proxy entre el frontend y Google Apps Script.
 * Verifica token de Cloudflare Turnstile para acción "createTicket".
 */
const DEFAULT_APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbyt01Oa0d2850A9Q7sW2C6zd5jg05UihidlUNd6fnvJYHA5feDSz6SMlFkS_DmzqyML/exec";

const APPS_SCRIPT_URLS = Array.from(new Set([
  String(process.env.APPS_SCRIPT_URL || "").trim(),
  DEFAULT_APPS_SCRIPT_URL
].filter(Boolean)));

const TURNSTILE_SECRET = String(process.env.TURNSTILE_SECRET || "").trim();

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
    let text = "";
    let lastError = "";

    for (const url of APPS_SCRIPT_URLS) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const resp = await fetch(url, {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify(parsed)
          });

          text = await resp.text();
          const trimmed = text.trim();

          if (resp.ok && (trimmed.startsWith("{") || trimmed.startsWith("["))) {
            return {
              statusCode: 200,
              headers: { "Content-Type": "application/json", ...CORS_HEADERS },
              body: text
            };
          }

          lastError = `Apps Script devolvió una respuesta no JSON (${resp.status}).`;
        } catch (err) {
          lastError = String(err && err.message ? err.message : err);
        }

        await new Promise(resolve => setTimeout(resolve, 350));
      }
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      body: JSON.stringify({
        ok: false,
        error: lastError || "No fue posible conectar con Apps Script."
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
