/**
 * proxy.js — Netlify Function
 * Proxy entre el frontend y Google Apps Script.
 * Verifica token de Cloudflare Turnstile para acción "createTicket".
 */
const APPS_SCRIPT_URL = String(
  process.env.APPS_SCRIPT_URL ||
  "https://script.google.com/macros/s/AKfycbzha0CA5bQjOTmcdlqboDV57M1QIM4VrsPqzTMfhqy0A5X37g3pkPJISqjcRDUyL2KV/exec"
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

    /* ── Verificación Turnstile: solo para createTicket ── */
    if (action === "createTicket") {
      const tsToken = String((parsed.payload && parsed.payload.cfTurnstileToken) || "").trim();

      if (!tsToken) {
        return {
          statusCode: 200,
          headers: { "Content-Type": "application/json", ...CORS_HEADERS },
          body: JSON.stringify({ ok: false, error: "Verificación de seguridad requerida." })
        };
      }

      const cfVerify = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `secret=${encodeURIComponent(TURNSTILE_SECRET)}&response=${encodeURIComponent(tsToken)}`
      });

      const cfResult = await cfVerify.json();

      if (!cfResult.success) {
        return {
          statusCode: 200,
          headers: { "Content-Type": "application/json", ...CORS_HEADERS },
          body: JSON.stringify({ ok: false, error: "Verificación de seguridad fallida. Recargá la página e intentá nuevamente." })
        };
      }

      if (parsed.payload) delete parsed.payload.cfTurnstileToken;
    }

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
