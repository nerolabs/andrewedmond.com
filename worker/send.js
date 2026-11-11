// Sending a Lab Note. Only the "Send Lab Note" workflow can call this (worker/oidc.js), and nothing runs on a schedule.
// - preview: one email to MAIL_TEST_TO, from any run of the workflow. No approval needed; no subscriber is mailed.
// - everyone: every active subscriber, only from the job in the lab-notes-email environment, which waits for
//   Andrew's approval in GitHub. GitHub keeps who approved and when; the run id is recorded here in `sends`.
// Each call sends at most LIMIT emails and reports how many remain; the workflow calls again until none do.
// A delivery row is claimed before its email goes, so a repeated or overlapping run never mails anyone twice.
import { loadNoteEmail, sendNoteBatch, sendNotePreview } from "./email.js";
import { SEND_ENVIRONMENT } from "./oidc.js";

export const LIMIT = 50;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export async function send(env, body, claims) {
  const slug = String(body.slug || "");
  if (!SLUG.test(slug)) return [400, { error: "Bad slug." }];
  const note = await loadNoteEmail(env, slug);
  if (!note) return [404, { error: `No Lab Note "${slug}" on the site. Publish it before sending.` }];

  if (body.audience === "preview") {
    await sendNotePreview(env, note);
    return [200, { ok: true, preview: env.MAIL_TEST_TO, remaining: 0 }];
  }
  if (body.audience !== "everyone") return [400, { error: 'audience must be "preview" or "everyone".' }];
  if (claims.environment !== SEND_ENVIRONMENT) {
    return [403, { error: `Sending to everyone needs the ${SEND_ENVIRONMENT} environment, which Andrew approves.` }];
  }

  await env.DB.prepare("INSERT OR IGNORE INTO sends (slug, run_id, actor) VALUES (?, ?, ?)")
    .bind(slug, String(claims.run_id), claims.actor || null).run();

  const { results: due } = await env.DB.prepare(
    `SELECT s.id, s.email, s.token FROM subscribers s
     WHERE s.status = 'active' AND NOT EXISTS (SELECT 1 FROM deliveries d WHERE d.subscriber_id = s.id AND d.slug = ?)
     ORDER BY s.id LIMIT ?`,
  ).bind(slug, LIMIT).all();

  // Claim first: a row another run already claimed is skipped.
  const claimed = [];
  for (const s of due) {
    const r = await env.DB.prepare("INSERT OR IGNORE INTO deliveries (subscriber_id, slug, status) VALUES (?, ?, 'claimed')")
      .bind(s.id, slug).run();
    if (r.meta.changes) claimed.push(s);
  }

  let sent = 0;
  let failed = 0;
  if (claimed.length) {
    try {
      const ids = await sendNoteBatch(env, note, claimed);
      await env.DB.batch(claimed.map((s, i) =>
        env.DB.prepare("UPDATE deliveries SET status = 'sent', resend_id = ?, at = datetime('now') WHERE subscriber_id = ? AND slug = ?")
          .bind(ids[i] || null, s.id, slug)));
      sent = claimed.length;
    } catch (e) {
      // Leave them marked failed rather than retrying blindly: a failed batch may have partly sent.
      await env.DB.batch(claimed.map((s) =>
        env.DB.prepare("UPDATE deliveries SET status = 'failed', error = ?, at = datetime('now') WHERE subscriber_id = ? AND slug = ?")
          .bind(String(e.message).slice(0, 300), s.id, slug)));
      failed = claimed.length;
      console.error(`send ${slug} batch failed: ${e.message}`);
    }
  }

  const left = await env.DB.prepare(
    `SELECT count(*) AS n FROM subscribers s WHERE s.status = 'active'
     AND NOT EXISTS (SELECT 1 FROM deliveries d WHERE d.subscriber_id = s.id AND d.slug = ?)`,
  ).bind(slug).first();
  return [failed ? 502 : 200, { ok: !failed, sent, failed, remaining: left.n }];
}
