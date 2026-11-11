// Sign-up, confirm and unsubscribe for Lab Notes by email. Double opt-in: a sign-up waits in `signups` until its
// confirm click, and only then becomes a subscriber. Responses never say whether an address is already subscribed.
import { sendConfirm } from "./email.js";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOKEN = /^[0-9a-f]{64}$/;
const RESEND_AFTER_MINUTES = 10; // a second sign-up for the same address within this window sends no second email

export const newToken = () => [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, "0")).join("");

async function turnstileOk(env, token, ip) {
  if (!token || !env.TURNSTILE_SECRET_KEY) return false;
  const form = new FormData();
  form.append("secret", env.TURNSTILE_SECRET_KEY);
  form.append("response", token);
  if (ip) form.append("remoteip", ip);
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
  const out = await res.json().catch(() => ({}));
  return out.success === true;
}

// POST /api/subscribe {email, consent, turnstile}
export async function subscribe(env, body, request) {
  const email = String(body.email || "").trim().toLowerCase();
  if (email.length > 254 || !EMAIL.test(email)) return [400, { error: "Please enter a valid email address." }];
  if (!(await turnstileOk(env, body.turnstile, request.headers.get("CF-Connecting-IP")))) {
    return [400, { error: "We couldn't check you're not a bot. Please try again." }];
  }
  const consent = String(body.consent || "").slice(0, 500);

  // Housekeeping the privacy notice promises: unconfirmed sign-ups go after 7 days.
  await env.DB.prepare("DELETE FROM signups WHERE confirmed_at IS NULL AND created_at < datetime('now', '-7 days')").run();

  const active = await env.DB.prepare("SELECT 1 FROM subscribers WHERE email = ? AND status = 'active'").bind(email).first();
  if (active) return [200, { ok: true }]; // already in: same answer, no email
  const recent = await env.DB.prepare(
    `SELECT 1 FROM signups WHERE email = ? AND confirmed_at IS NULL AND created_at > datetime('now', '-${RESEND_AFTER_MINUTES} minutes')`,
  ).bind(email).first();
  if (recent) return [200, { ok: true }];

  const token = newToken();
  await env.DB.prepare("INSERT INTO signups (token, email, consent) VALUES (?, ?, ?)").bind(token, email, consent).run();
  try {
    await sendConfirm(env, email, token);
  } catch (e) {
    console.error(`confirm email failed: ${e.message}`);
    return [502, { error: "We couldn't send the confirmation email. Please try again later." }];
  }
  return [200, { ok: true }];
}

// POST /api/confirm {t}: sent by /confirm/ when it opens, so a mail scanner fetching the link doesn't confirm.
export async function confirm(env, body) {
  const t = String(body.t || "");
  if (!TOKEN.test(t)) return [400, { error: "This link isn't valid." }];
  const s = await env.DB.prepare("SELECT * FROM signups WHERE token = ?").bind(t).first();
  if (!s) return [404, { error: "This link has expired. Please sign up again." }];
  if (s.confirmed_at) return [200, { ok: true, already: true }];
  if (Date.parse(s.created_at + "Z") < Date.now() - 7 * 86400_000) return [410, { error: "This link has expired. Please sign up again." }];

  const existing = await env.DB.prepare("SELECT id, token FROM subscribers WHERE email = ?").bind(s.email).first();
  let id;
  if (existing) {
    await env.DB.prepare("UPDATE subscribers SET status = 'active', confirmed_at = datetime('now'), unsubscribed_at = NULL WHERE id = ?")
      .bind(existing.id).run();
    id = existing.id;
  } else {
    const r = await env.DB.prepare("INSERT INTO subscribers (email, token, status, confirmed_at) VALUES (?, ?, 'active', datetime('now'))")
      .bind(s.email, newToken()).run();
    id = r.meta.last_row_id;
  }
  await env.DB.batch([
    env.DB.prepare("INSERT INTO consent_log (subscriber_id, kind, text) VALUES (?, 'subscribe', ?)").bind(id, s.consent),
    env.DB.prepare("UPDATE signups SET confirmed_at = datetime('now') WHERE token = ?").bind(t),
  ]);
  return [200, { ok: true }];
}

// POST /api/unsubscribe {t} from /unsubscribe/, or POST /api/unsubscribe?t=... as a mail client's one-click.
export async function unsubscribe(env, t) {
  t = String(t || "");
  if (!TOKEN.test(t)) return [400, { error: "This link isn't valid." }];
  const sub = await env.DB.prepare("SELECT id, status FROM subscribers WHERE token = ?").bind(t).first();
  if (!sub) return [200, { ok: true }]; // nothing to do; don't reveal anything
  if (sub.status === "active") {
    await env.DB.batch([
      env.DB.prepare("UPDATE subscribers SET status = 'unsubscribed', unsubscribed_at = datetime('now') WHERE id = ?").bind(sub.id),
      env.DB.prepare("INSERT INTO consent_log (subscriber_id, kind) VALUES (?, 'unsubscribe')").bind(sub.id),
    ]);
  }
  return [200, { ok: true }];
}
