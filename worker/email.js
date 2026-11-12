// Email through Resend. A sending-only key scoped to andrewedmond.com (MFL request #220), so the Worker can send and
// nothing else. Without a key, sending fails loudly rather than pretending to succeed.

const RESEND = "https://api.resend.com";

export const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const unsubscribeUrl = (env, token) => `${env.SITE_URL}/unsubscribe/?t=${token}`;

// Gmail and Yahoo require one-click unsubscribe for list mail: a POST to this URL unsubscribes without a page.
function listHeaders(env, token) {
  return {
    "List-Unsubscribe": `<${env.SITE_URL}/api/unsubscribe?t=${token}>, <mailto:${env.MAIL_REPLY_TO}?subject=unsubscribe>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

async function resend(env, path, payload) {
  if (!env.RESEND_API_KEY) throw new Error("RESEND_API_KEY is not set");
  const res = await fetch(`${RESEND}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`resend ${res.status}: ${body.message || body.name || "error"}`);
  return body;
}

/* ---------------------------------------------------------- confirmation */
export function confirmEmail(env, token) {
  const url = `${env.SITE_URL}/confirm/?t=${token}`;
  const html = `<div style="font-family:Georgia,serif;font-size:17px;line-height:1.55;color:#211C18;max-width:560px">
<p>Please confirm you'd like Lab Notes by email: each new note, about what I built, what broke and what it taught me.</p>
<p><a href="${esc(url)}" style="display:inline-block;background:#211C18;color:#EDE7DC;padding:12px 22px;border-radius:3px;text-decoration:none;font-family:Arial,sans-serif;font-size:15px">Confirm my subscription</a></p>
<p style="font-size:14px;color:#6b6157">The link works for 7 days. If you didn't ask for this, ignore this email and nothing happens.</p>
<p style="font-size:14px;color:#6b6157">Andrew Edmond · <a href="${esc(env.SITE_URL)}" style="color:#6b6157">andrewedmond.com</a></p>
</div>`;
  const text = `Please confirm you'd like Lab Notes by email: each new note, about what I built, what broke and what it taught me.

Confirm: ${url}

The link works for 7 days. If you didn't ask for this, ignore this email and nothing happens.

Andrew Edmond · andrewedmond.com`;
  return { subject: "Confirm your Lab Notes subscription", html, text };
}

export async function sendConfirm(env, to, token) {
  const m = confirmEmail(env, token);
  return resend(env, "/emails", { from: env.MAIL_FROM, reply_to: env.MAIL_REPLY_TO, to: [to], ...m });
}

/* ------------------------------------------------------------ Lab Notes */
// build.mjs writes each note's email to _site/_email/<slug>.html and .txt (and .json for the subject). The
// placeholder {{UNSUBSCRIBE_URL}} is filled per recipient here.
export async function loadNoteEmail(env, slug) {
  const get = async (ext) => {
    const res = await env.ASSETS.fetch(new Request(`${env.SITE_URL}/_email/${slug}.${ext}`));
    return res.ok ? res.text() : null;
  };
  const [html, text, meta] = await Promise.all([get("html"), get("txt"), get("json")]);
  if (!html || !text || !meta) return null;
  return { html, text, subject: JSON.parse(meta).subject };
}

function personalise(env, note, sub) {
  const url = unsubscribeUrl(env, sub.token);
  return {
    from: env.MAIL_FROM,
    reply_to: env.MAIL_REPLY_TO,
    to: [sub.email],
    subject: note.subject,
    html: note.html.replaceAll("{{UNSUBSCRIBE_URL}}", esc(url)).replaceAll("{{POSTAL_ADDRESS}}", esc(env.MAIL_POSTAL_ADDRESS)),
    text: note.text.replaceAll("{{UNSUBSCRIBE_URL}}", url).replaceAll("{{POSTAL_ADDRESS}}", env.MAIL_POSTAL_ADDRESS),
    headers: listHeaders(env, sub.token),
  };
}

// Up to 100 emails per Resend batch call. Returns Resend's ids in the same order as `subs`.
export async function sendNoteBatch(env, note, subs) {
  const out = await resend(env, "/emails/batch", subs.map((s) => personalise(env, note, s)));
  return (out.data || []).map((d) => d.id);
}

// A preview to MAIL_TEST_TO. Its unsubscribe link is inert (no subscriber has the token "preview").
export async function sendNotePreview(env, note) {
  const msg = personalise(env, note, { email: env.MAIL_TEST_TO, token: "preview" });
  return resend(env, "/emails", { ...msg, subject: `[Preview] ${note.subject}` });
}
