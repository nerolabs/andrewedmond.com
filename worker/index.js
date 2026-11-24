// andrewedmond.com: serves the static build (_site/, via the ASSETS binding) and the Lab Notes email API.
// The Worker runs first on every request (wrangler.toml), so redirects, 410s and security headers apply everywhere.
import { verifyGithub } from "./oidc.js";
import { send } from "./send.js";
import { confirm, subscribe, unsubscribe } from "./subscribe.js";

const WWW = "www.andrewedmond.com";
// Keep in step with BOREHOLE_HIRE in build.mjs, which the home page's old-anchor script uses.
const BOREHOLE_HIRE = "https://borehole.dev/hire-us";
// Old URLs that live elsewhere now. Real 301s, which GitHub Pages couldn't send.
const REDIRECTS = {
  "/fractional/": BOREHOLE_HIRE,
  "/advisory/": "/work-with-me/#advisory",
  // HANDOFF.md was renamed on 24 Nov 2026 (Andrew: more handoffs will follow). Paths are matched with a trailing slash.
  "/tools/handoff/": "/tools/mac-organizer-handoff/",
  "/tools/handoff/HANDOFF.md/": "/tools/mac-organizer-handoff/MAC_ORGANIZER_HANDOFF.md",
};
// The blog was retired on 11 Nov 2026 (Andrew). 410 tells search engines it's gone on purpose.
const GONE = /^\/blog(\/|$)/;
// Tool files (e.g. the Mac organizer handoff). Each successful GET adds one to that day's count.
const TOOL_FILE = /^\/tools\/[a-z0-9-]+\/[^/]+\.md$/;

const HEADERS = {
  "Strict-Transport-Security": "max-age=31536000",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

function secure(res) {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(HEADERS)) out.headers.set(k, v);
  return out;
}

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

async function readJson(request) {
  const text = await request.text();
  if (text.length > 10_000) return null;
  try { return JSON.parse(text || "{}"); } catch { return null; }
}

async function api(request, env, url) {
  const route = `${request.method} ${url.pathname}`;
  if (route === "POST /api/unsubscribe" && url.searchParams.has("t")) {
    // A mail client's one-click unsubscribe (RFC 8058): form-encoded body, token in the URL.
    return json(...(await unsubscribe(env, url.searchParams.get("t"))));
  }
  if (route === "POST /api/send") {
    const claims = await verifyGithub(request.headers.get("Authorization"));
    if (!claims) return json(401, { error: "Unauthorized." });
    const body = await readJson(request);
    if (!body) return json(400, { error: "Bad request." });
    const [status, out] = await send(env, body, claims);
    console.log(`send ${body.slug} ${body.audience} run ${claims.run_id}: ${JSON.stringify(out)}`);
    return json(status, out);
  }
  const handlers = {
    "POST /api/subscribe": (body) => subscribe(env, body, request),
    "POST /api/confirm": (body) => confirm(env, body),
    "POST /api/unsubscribe": (body) => unsubscribe(env, body.t),
  };
  const handler = handlers[route];
  if (!handler) return json(404, { error: "Not found." });
  const body = await readJson(request);
  if (!body) return json(400, { error: "Bad request." });
  try {
    return json(...(await handler(body)));
  } catch (e) {
    console.error(`${route} failed: ${e.stack || e.message}`);
    return json(500, { error: "Something went wrong. Please try again later." });
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    // Bare domain and plain http go to https://www. (Skipped under `wrangler dev --var DEV:1`, which serves http.)
    if (!env.DEV && (url.hostname === "andrewedmond.com" || url.protocol === "http:")) {
      url.hostname = WWW;
      url.protocol = "https:";
      return Response.redirect(url.toString(), 301);
    }
    if (url.pathname.startsWith("/api/")) return secure(await api(request, env, url));

    const path = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
    if (REDIRECTS[path]) return Response.redirect(new URL(REDIRECTS[path], url).toString(), 301);
    if (url.pathname.startsWith("/_email/")) return secure(await notFound(env, url, 404)); // read by the Worker only
    if (GONE.test(url.pathname)) return secure(await notFound(env, url, 410));

    const res = await env.ASSETS.fetch(request);
    if (request.method === "GET" && res.status === 200 && TOOL_FILE.test(url.pathname)) {
      ctx.waitUntil(countDownload(env, url.pathname, request.headers.get("User-Agent") || ""));
    }
    return secure(res);
  },
};

// Downloads are counted, never attributed: the day, the file and a rough kind of client, nothing about the person.
async function countDownload(env, path, ua) {
  const agent = /bot|crawl|spider|slurp|preview|facebookexternalhit|linkedin/i.test(ua) ? "bot"
    : /^Mozilla\//.test(ua) ? "browser" : "script";
  try {
    await env.DB.prepare(
      "INSERT INTO downloads (day, path, agent, n) VALUES (date('now'), ?, ?, 1) ON CONFLICT (day, path, agent) DO UPDATE SET n = n + 1",
    ).bind(path, agent).run();
  } catch (e) {
    console.error("download count failed", e);
  }
}

// The site's 404 page, with the given status.
async function notFound(env, url, status) {
  const page = await env.ASSETS.fetch(new Request(new URL("/404.html", url)));
  return new Response(page.body, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}
