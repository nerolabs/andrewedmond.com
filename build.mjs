#!/usr/bin/env node
/* ==========================================================================
   build.mjs — dependency-free static site generator for andrewedmond.com.

   Reads:   content/pages/*.md   page copy, as named front-matter slots
            notes/_posts/*.md    Lab Notes
   Writes:  _site/               the whole deployable site (gitignored)

   Every build also checks the content: required front matter, photos that
   exist, LinkedIn URLs, unique slugs, and every internal link. Any problem
   fails the build, so a bad note never reaches the live site.

   No npm dependencies. Run with:  node build.mjs
   Preview with:                   python3 -m http.server -d _site 8765
   Authoring guide: content/README.md (Lab Notes, page copy)
   ========================================================================== */

import {
  readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, rmSync, cpSync, statSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT = join(ROOT, "_site");
const SITE = "https://www.andrewedmond.com";
const AUTHOR = "Andrew Edmond";
const LINKEDIN = "https://www.linkedin.com/in/andrewedmond";
const POSTHOG_KEY = "phc_BMejvK5GHnQV9qCFDDEHWrhjuZfbqV86JzVY5oScUgBu"; // project 237800, EU

// Borehole's "Hire us" page, where the diligence practice now lives. Keep in
// step with worker/index.js, which 301s /fractional/ there.
const BOREHOLE_HIRE = "https://borehole.dev/hire-us";
// Cloudflare Turnstile, the sign-up form's spam check. The site key is public.
// A local build can use Cloudflare's always-pass test key instead.
const TURNSTILE_SITE_KEY = process.env.TURNSTILE_SITE_KEY || "0x4AAAAAAF8yD_4JzlmVxipx";
// The old home page's section anchors. Browsers never send #fragments to the
// server, so no host can redirect them; a script on the new home page does.
// The section ids on Borehole's side come from the Borehole build (11 Nov).
const OLD_HOME_ANCHORS = {
  summary: BOREHOLE_HIRE,
  framework: `${BOREHOLE_HIRE}#dimensions`,
  scope: `${BOREHOLE_HIRE}#engagements`,
  evidence: `${BOREHOLE_HIRE}#who`,
  background: `${BOREHOLE_HIRE}#who`,
  contact: "/work-with-me/",
};
// Files and folders copied into _site as they are.
const STATIC = ["favicon.svg", "apple-touch-icon.png", "og.png", "assets", "notes/assets"];

/* ------------------------------------------------------------ check report */
const errors = [];
const warnings = [];
const fail = (where, msg) => errors.push(`${where}: ${msg}`);
const warn = (where, msg) => warnings.push(`${where}: ${msg}`);

/* ----------------------------------------------------------------- helpers */
const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const escAttr = (s) => esc(s).replace(/'/g, "&#39;");

// RFC-822 date for RSS, computed without locale surprises.
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function rfc822(dateStr) {
  const d = new Date(dateStr + "T09:00:00Z");
  const p = (n) => String(n).padStart(2, "0");
  return `${DOW[d.getUTCDay()]}, ${p(d.getUTCDate())} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()} 09:00:00 +0000`;
}
function humanDate(dateStr) {
  const d = new Date(dateStr + "T09:00:00Z");
  return `${MON[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}
const absUrl = (path) => (/^https?:\/\//.test(path) ? path : SITE + path);

function write(path, content) {
  const file = join(OUT, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

/* --------------------------------------------------- front-matter parsing */
function parseFrontMatter(raw, where) {
  const m = raw.replace(/\r\n/g, "\n").match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) { fail(where, "missing front-matter fence (--- ... ---)"); return { meta: {}, body: "" }; }
  const meta = {};
  for (const line of m[1].split("\n")) {
    if (!line.trim()) continue;
    const i = line.indexOf(":");
    if (i === -1) { fail(where, `front-matter line has no "key:": ${line}`); continue; }
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    meta[key] = val;
  }
  return { meta, body: m[2] };
}

/* --------------------------------------------------------- markdown → html
   Deliberately small: supports exactly what notes here use — headings,
   paragraphs, bold/italic/code, links, images, ordered & unordered lists,
   blockquotes, horizontal rules. Extend consciously if a post needs more. */

// Typographic pass — runs on raw text BEFORE escaping and never on URLs
// (links/images are stashed first). Curly quotes, dashes, ellipses.
function smart(x) {
  return x
    .replace(/---/g, "—")
    .replace(/--/g, "–")
    .replace(/\.\.\./g, "…")
    .replace(/"([^"]*)"/g, "“$1”")
    .replace(/(\w)'(\w)/g, "$1’$2")
    .replace(/'/g, "’");
}
// bold → italic → code, on already-escaped text
function emph(x) {
  return x
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}
// Inline pass. Links/images are stashed as @@S<n>@@ tokens (a marker that
// never appears in prose) so typography/escaping/emphasis can't corrupt URLs.
function inline(text) {
  const stash = [];
  const T = (html) => { stash.push(html); return `@@S${stash.length - 1}@@`; };
  let s = String(text)
    .replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g,
      (_, alt, src, title) => T(`<img src="${escAttr(src)}" alt="${escAttr(alt)}"${title ? ` title="${escAttr(title)}"` : ""}>`))
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g,
      (_, t, href) => T(`<a href="${escAttr(href)}">${emph(esc(smart(t)))}</a>`));
  s = emph(esc(smart(s)));
  return s.replace(/@@S(\d+)@@/g, (_, i) => stash[+i]);
}

function renderMarkdown(md) {
  const blocks = md.replace(/\r\n/g, "\n").trim().split(/\n{2,}/);
  const out = [];
  for (const raw of blocks) {
    const block = raw.replace(/\n+$/, "");
    if (!block.trim()) continue;
    const lines = block.split("\n");

    // raw HTML block (passthrough) — native figures/cards authored in the post
    if (block.trimStart().startsWith("<")) { out.push(block); continue; }

    // horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(block.trim())) { out.push("<hr>"); continue; }

    // heading
    const h = block.match(/^(#{1,4})\s+(.*)$/);
    if (h && lines.length === 1) { const n = h[1].length; out.push(`<h${n}>${inline(h[2])}</h${n}>`); continue; }

    // standalone image  ![alt](src "caption")  → figure
    const img = block.match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)$/);
    if (img) {
      const [, alt, src, cap] = img;
      out.push(
        `<figure><img src="${escAttr(src)}" alt="${escAttr(alt)}">` +
        (cap ? `<figcaption>${inline(cap)}</figcaption>` : "") + `</figure>`
      );
      continue;
    }

    // blockquote (every line starts with >)
    if (lines.every((l) => /^>\s?/.test(l))) {
      const inner = inline(lines.map((l) => l.replace(/^>\s?/, "")).join(" "));
      out.push(`<blockquote><p>${inner}</p></blockquote>`);
      continue;
    }

    // unordered list
    if (lines.every((l) => /^[-*]\s+/.test(l))) {
      const items = lines.map((l) => `<li>${inline(l.replace(/^[-*]\s+/, ""))}</li>`).join("");
      out.push(`<ul>${items}</ul>`);
      continue;
    }

    // ordered list
    if (lines.every((l) => /^\d+\.\s+/.test(l))) {
      const items = lines.map((l) => `<li>${inline(l.replace(/^\d+\.\s+/, ""))}</li>`).join("");
      out.push(`<ol>${items}</ol>`);
      continue;
    }

    // paragraph (soft-wrap newlines to spaces)
    out.push(`<p>${inline(lines.join(" "))}</p>`);
  }
  return out.join("\n");
}

/* ------------------------------------------------------------ content load */
function loadPage(name, required) {
  const file = join(ROOT, "content/pages", `${name}.md`);
  const where = relative(ROOT, file);
  if (!existsSync(file)) { fail(where, "file missing"); return { meta: {}, body: "" }; }
  const page = parseFrontMatter(readFileSync(file, "utf8"), where);
  for (const k of required) if (!page.meta[k]) fail(where, `slot "${k}" is empty`);
  const unknown = Object.keys(page.meta).filter((k) => !required.includes(k) && !OPTIONAL_SLOTS[name]?.includes(k));
  for (const k of unknown) fail(where, `unknown slot "${k}" (check the spelling)`);
  return page;
}
const OPTIONAL_SLOTS = { studio: ["intro"], privacy: [] };

// Studio brands: one Markdown list item per brand, "- [Name](https://url): one line".
function parseBrands(body, where) {
  const brands = [];
  for (const line of body.split("\n")) {
    if (!line.trim()) continue;
    const m = line.match(/^[-*]\s+\[([^\]]+)\]\((https:\/\/[^)\s]+)\):\s+(.+)$/);
    if (!m) { fail(where, `brand line must look like "- [Name](https://url): one line": ${line}`); continue; }
    brands.push({ name: m[1], url: m[2], line: m[3], host: new URL(m[2]).host.replace(/^www\./, "") });
  }
  if (!brands.length) fail(where, "no brands listed");
  return brands;
}

const NOTE_REQUIRED = ["title", "slug", "date", "linkedin", "photo", "photoAlt", "description"];
const NOTE_OPTIONAL = ["dek"];

function loadNotes(dir) {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return [];
  const notes = [];
  const slugs = new Set();
  for (const file of readdirSync(abs).filter((f) => f.endsWith(".md")).sort()) {
    const where = `${dir}/${file}`;
    const { meta, body } = parseFrontMatter(readFileSync(join(abs, file), "utf8"), where);
    for (const k of NOTE_REQUIRED) if (!meta[k]) fail(where, `front matter needs "${k}"`);
    for (const k of Object.keys(meta)) if (![...NOTE_REQUIRED, ...NOTE_OPTIONAL].includes(k)) fail(where, `unknown front-matter field "${k}" (check the spelling)`);
    if (meta.slug && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(meta.slug)) fail(where, `slug "${meta.slug}" must be lowercase words joined by hyphens`);
    if (meta.slug && slugs.has(meta.slug)) fail(where, `slug "${meta.slug}" is already used`);
    slugs.add(meta.slug);
    if (meta.date && (!/^\d{4}-\d{2}-\d{2}$/.test(meta.date) || isNaN(new Date(meta.date)))) fail(where, `date "${meta.date}" must be YYYY-MM-DD`);
    if (meta.date && meta.slug && file !== `${meta.date}-${meta.slug}.md`) fail(where, `file name must be ${meta.date}-${meta.slug}.md`);
    if (meta.linkedin && !/^https:\/\/(www\.)?linkedin\.com\/\S+$/.test(meta.linkedin)) fail(where, `linkedin must be a https://www.linkedin.com/... URL`);
    if (meta.photo) {
      if (!/^\/notes\/assets\/[^/]+\.(jpe?g|png|webp)$/i.test(meta.photo)) fail(where, `photo must be /notes/assets/<file>.jpg (or .png, .webp)`);
      else if (!existsSync(join(ROOT, meta.photo))) fail(where, `photo ${meta.photo} doesn't exist`);
      else if (statSync(join(ROOT, meta.photo)).size > 600 * 1024) warn(where, `photo ${meta.photo} is over 600 KB; aim for under 400 KB`);
    }
    if (/^\s*</m.test(body)) warn(where, "raw HTML in the body; ask the build before using it");
    notes.push({ file, meta, body, html: renderMarkdown(body) });
  }
  // newest first
  return notes.sort((a, b) => (a.meta.date < b.meta.date ? 1 : a.meta.date > b.meta.date ? -1 : 0));
}

const postUrl = (p) => `/notes/${p.meta.slug}/`;

/* ------------------------------------------------------------- page chrome */
const NAV = [
  ["/notes/", "Lab Notes"],
  ["/studio/", "Studio"],
  ["/work-with-me/", "Work with me"],
];

const POSTHOG = `<!-- PostHog (EU cloud) — cookieless: memory persistence, session recording off; no consent banner needed -->
<script>
!function(t,e){var o,n,p,r;e.__SV||(window.posthog && window.posthog.__loaded)||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister identify reset get_distinct_id get_session_id set_config opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
posthog.init('${POSTHOG_KEY}', {
  api_host: 'https://eu.i.posthog.com',
  defaults: '2026-05-30',
  persistence: 'memory',
  disable_session_recording: true,
  person_profiles: 'identified_only'
})
</script>`;

// Conversion signals, the same on every page: e-mail clicks, outbound clicks
// (Borehole, the studio's brands, LinkedIn), and Lab Notes sign-ups.
const EVENTS = `<script>
  (function(){
    function cap(name, props){ if(window.posthog && posthog.capture) posthog.capture(name, props); }
    var page = location.pathname;
    document.addEventListener('click', function(e){
      var a = e.target.closest && e.target.closest('a[href]');
      if (!a) return;
      var href = a.getAttribute('href');
      if (href.indexOf('mailto:') === 0) cap('cta_click', {cta:'email', page:page});
      else if (/^https?:/.test(href) && a.host !== location.host) cap('outbound_click', {host:a.host.replace(/^www\\./,''), href:href, page:page});
    });
  })();
</script>`;

// The Lab Notes sign-up: posts to the Worker's /api/subscribe. Turnstile loads
// only when someone focuses the email field, so most page views never fetch it.
const SIGNUP_SCRIPT = () => `<script>
  (function(){
    document.querySelectorAll('[data-labnotes-reset]').forEach(function(b){
      b.addEventListener('click', function(){
        if (window.labnotes) labnotes(null);
        var i = document.getElementById('signup-email'); if (i) i.focus();
      });
    });
    var forms = document.querySelectorAll('form.signup-form');
    if (!forms.length) return;
    var CONSENT = ${JSON.stringify(consentText()).replace(/</g, "\\u003c")};
    var loading = null;
    function loadTurnstile(){
      if (loading) return loading;
      loading = new Promise(function(resolve, reject){
        window.__aeTurnstile = resolve;
        var s = document.createElement('script');
        s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=__aeTurnstile';
        s.async = true; s.onerror = reject;
        document.head.appendChild(s);
      });
      return loading;
    }
    forms.forEach(function(f){
      var input = f.querySelector('input[type=email]'), button = f.querySelector('button');
      var box = f.querySelector('.signup-check'), status = f.parentNode.querySelector('.signup-status');
      var token = null, widget = null, waiting = [];
      function prepare(){
        return loadTurnstile().then(function(){
          if (widget !== null) return;
          widget = turnstile.render(box, {
            sitekey: '${TURNSTILE_SITE_KEY}', appearance: 'interaction-only', theme: 'dark',
            callback: function(t){ token = t; waiting.splice(0).forEach(function(w){ w(t); }); },
            'expired-callback': function(){ token = null; }
          });
        });
      }
      function fail(msg){ status.textContent = msg; button.disabled = false; if (widget !== null) { turnstile.reset(widget); token = null; } }
      input.addEventListener('focus', function(){ prepare().catch(function(){}); }, {once: true});
      f.addEventListener('submit', function(e){
        e.preventDefault();
        if (!input.value || !input.checkValidity()) { status.textContent = 'Please enter a valid email address.'; input.focus(); return; }
        button.disabled = true; status.textContent = 'Sending…';
        var got = prepare().then(function(){
          return token || new Promise(function(resolve, reject){ waiting.push(resolve); setTimeout(reject, 20000); });
        });
        got.then(function(t){
          return fetch('/api/subscribe', {method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({email: input.value, consent: CONSENT, turnstile: t})});
        }).then(function(r){ return r.json().then(function(b){ return {ok: r.ok, b: b}; }); })
        .then(function(x){
          if (!x.ok) return fail(x.b.error || 'Something went wrong. Please try again.');
          status.textContent = ''; button.disabled = false; f.reset();
          if (widget !== null) { turnstile.reset(widget); token = null; }
          if (window.labnotes) labnotes('pending');
          if (window.posthog && posthog.capture) posthog.capture('signup_submit', {page: location.pathname});
        }).catch(function(){ fail('Something went wrong. Please try again.'); });
      });
    });
  })();
</script>`;

// Remembers on this device that the visitor signed up, so the sign-up box says so instead of asking again.
// Holds only "subscribed" or "pending:<time>", never an email; set by the visitor's own sign-up or confirm
// click, cleared on unsubscribe. A user-requested interface setting, described on /privacy/.
const LIST_STATE = `<script>
(function(){
  try {
    var v = localStorage.getItem('labnotes'), s = null;
    if (v === 'subscribed') s = v;
    else if (v && v.indexOf('pending:') === 0 && Date.now() - Number(v.slice(8)) < 7 * 864e5) s = 'pending';
    else if (v) localStorage.removeItem('labnotes');
    if (s) document.documentElement.setAttribute('data-labnotes', s);
  } catch (e) {}
  window.labnotes = function(state){
    try {
      if (state) localStorage.setItem('labnotes', state === 'pending' ? 'pending:' + Date.now() : state);
      else localStorage.removeItem('labnotes');
    } catch (e) {}
    if (state) document.documentElement.setAttribute('data-labnotes', state);
    else document.documentElement.removeAttribute('data-labnotes');
  };
})();
</script>
`;
let CSS_VERSION = "1";
let KICKER = "";

const HEAD = ({ title, desc, path, og, current, extraHead = "" }) => {
  const home = current === "/";
  const name = home
    ? `<h1 class="name"><a href="/">${esc(AUTHOR)}</a></h1>`
    : `<p class="name"><a href="/">${esc(AUTHOR)}</a></p>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${escAttr(desc)}">
<meta name="theme-color" content="#ECE1C8">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="canonical" href="${SITE}${path}">
<meta property="og:type" content="${og?.type || "website"}">
<meta property="og:url" content="${SITE}${path}">
<meta property="og:title" content="${escAttr(title)}">
<meta property="og:description" content="${escAttr(desc)}">
<meta property="og:image" content="${og?.image ? absUrl(og.image) : SITE + "/og.png"}">
<meta name="twitter:card" content="summary_large_image">
<link rel="alternate" type="application/rss+xml" title="${escAttr(AUTHOR)} — Lab Notes" href="${SITE}/feed.xml">
${extraHead}${LIST_STATE}${POSTHOG}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@600;800;900&family=Big+Shoulders+Stencil+Display:wght@800&family=Zilla+Slab:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/site.css?v=${CSS_VERSION}">
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="mast${home ? "" : " mast--compact"}">
  <div class="wrap">
    <div class="mast-row">
      <div>
        <p class="kicker">${esc(KICKER)}</p>
        ${name}
      </div>
      <nav class="nav" aria-label="Site">
        <ul>
          ${NAV.map(([href, label]) => `<li><a href="${href}"${current === href ? ' aria-current="page"' : ""}><span class="tape">${label}</span></a></li>`).join("\n          ")}
        </ul>
      </nav>
    </div>
  </div>
</header>`;
};

const FOOT_HTML = () => `
<footer class="foot">
  <div class="wrap">
    <p>${esc(AUTHOR)} · Jerez, Spain</p>
    <ul>
      <li><a href="${LINKEDIN}">LinkedIn</a></li>
      <li><a href="/feed.xml">RSS</a></li>
      <li><a href="/privacy/">Privacy</a></li>
    </ul>
  </div>
</footer>
${EVENTS}
${SIGNUP_SCRIPT()}
</body>
</html>`;
let FOOT = ""; // set once the home page's copy is loaded (the sign-up script needs it)

// The Lab Notes sign-up block. The consent text the Worker records is the
// sign-up line plus the small print, exactly as shown.
let HOME = { meta: {} };
const SMALL_PRINT = "Double opt-in: we'll email you a link to confirm. Unsubscribe any time.";
const consentText = () => `${HOME.meta.signup} ${SMALL_PRINT}`;
function signup() {
  return `
    <section class="order" aria-label="Lab Notes by email">
      <span class="clip" aria-hidden="true"></span>
      <div class="order-new">
        <h2>${esc(HOME.meta.button)}</h2>
        <p>${inline(HOME.meta.signup)}</p>
        <form class="signup-form" action="/api/subscribe" method="post" novalidate>
          <label for="signup-email">Email address</label>
          <div class="field">
            <input id="signup-email" type="email" name="email" required autocomplete="email" placeholder="you@example.com">
            <button type="submit">${esc(HOME.meta.button)}</button>
          </div>
          <div class="signup-check"></div>
        </form>
        <p class="signup-status" role="status" aria-live="polite"></p>
        <p class="fine">${esc(SMALL_PRINT)} <a href="/privacy/">Privacy</a>. <a href="/feed.xml">Prefer RSS?</a></p>
      </div>
      <div class="order-pending">
        <h2>Check your inbox</h2>
        <p>I've sent you a link to confirm. Click it and you're on the list. It works for 7 days.</p>
        <p class="fine">Nothing there? Check your spam folder, or <button type="button" class="linkbtn" data-labnotes-reset>sign up again</button>.</p>
      </div>
      <div class="order-done">
        <h2>You're on the list</h2>
        <p>Lab Notes lands in your inbox every Tuesday. Every email has an unsubscribe link.</p>
        <p class="fine"><a href="/notes/">Read past notes</a>. Different address? <button type="button" class="linkbtn" data-labnotes-reset>Sign it up</button>.</p>
      </div>
    </section>`;
}

/* ------------------------------------------------------------ note emails
   Light and plain, with inline styles: email clients ignore stylesheets and
   many render dark backgrounds badly. The Worker fills {{UNSUBSCRIBE_URL}} and
   {{POSTAL_ADDRESS}} per send. */
const MAIL = {
  ink: "#211C18", soft: "#5f574e", faint: "#8E8477", gold: "#8a6a2c", rule: "#e4ddd2",
  serif: "Georgia,'Times New Roman',serif", sans: "Arial,Helvetica,sans-serif",
};
function emailBody(html) {
  const abs = (u) => (u.startsWith("/") ? SITE + u : u);
  return html
    .replace(/(href|src)="([^"]*)"/g, (_, a, u) => `${a}="${abs(u)}"`)
    .replace(/<p>/g, `<p style="margin:0 0 18px">`)
    .replace(/<h2>/g, `<h2 style="font-family:${MAIL.serif};font-weight:normal;font-size:23px;line-height:1.25;margin:30px 0 12px;color:${MAIL.ink}">`)
    .replace(/<h3>/g, `<h3 style="font-family:${MAIL.serif};font-size:19px;margin:24px 0 10px;color:${MAIL.ink}">`)
    .replace(/<a href=/g, `<a style="color:${MAIL.gold}" href=`)
    .replace(/<(ul|ol)>/g, `<$1 style="margin:0 0 18px;padding-left:22px">`)
    .replace(/<li>/g, `<li style="margin:0 0 8px">`)
    .replace(/<blockquote>/g, `<blockquote style="margin:0 0 18px;padding-left:16px;border-left:3px solid ${MAIL.gold};font-style:italic;color:${MAIL.soft}">`)
    .replace(/<img /g, `<img style="max-width:100%;height:auto" `)
    .replace(/<hr>/g, `<hr style="border:0;border-top:1px solid ${MAIL.rule};margin:28px 0">`);
}
function noteEmailHtml(p) {
  const url = SITE + postUrl(p);
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(p.meta.title)}</title></head>
<body style="margin:0;padding:0;background:#f4f1ec">
<div style="display:none;max-height:0;overflow:hidden">${esc(p.meta.description)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ec"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid ${MAIL.rule}">
<tr><td style="padding:28px 32px 8px;font-family:${MAIL.sans};font-size:12px;letter-spacing:2px;text-transform:uppercase;color:${MAIL.gold}">Lab Notes · Andrew Edmond</td></tr>
<tr><td style="padding:0 32px">
<h1 style="font-family:${MAIL.serif};font-weight:normal;font-size:30px;line-height:1.15;margin:8px 0 8px;color:${MAIL.ink}">${esc(p.meta.title)}</h1>
<p style="font-family:${MAIL.sans};font-size:13px;color:${MAIL.faint};margin:0 0 22px">${humanDate(p.meta.date)}</p>
</td></tr>
<tr><td style="padding:0 32px 22px"><a href="${url}"><img src="${SITE}${p.meta.photo}" alt="${escAttr(p.meta.photoAlt)}" width="536" style="display:block;width:100%;max-width:536px;height:auto;border:1px solid ${MAIL.rule}"></a></td></tr>
<tr><td style="padding:0 32px;font-family:${MAIL.serif};font-size:18px;line-height:1.6;color:${MAIL.ink}">
${emailBody(p.html)}
</td></tr>
<tr><td style="padding:6px 32px 30px;font-family:${MAIL.sans};font-size:15px">
<a href="${url}" style="color:${MAIL.gold}">Read it on the site</a> &nbsp;·&nbsp; <a href="${escAttr(p.meta.linkedin)}" style="color:${MAIL.gold}">Comment on LinkedIn</a>
</td></tr>
</table>
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px"><tr><td style="padding:18px 32px;font-family:${MAIL.sans};font-size:12px;line-height:1.6;color:${MAIL.faint}">
You're getting this because you signed up for Lab Notes at <a href="${SITE}/" style="color:${MAIL.faint}">andrewedmond.com</a>. <a href="{{UNSUBSCRIBE_URL}}" style="color:${MAIL.faint}">Unsubscribe</a>.<br>{{POSTAL_ADDRESS}}
</td></tr></table>
</td></tr></table>
</body>
</html>
`;
}
function noteEmailText(p) {
  const abs = (u) => (u.startsWith("/") ? SITE + u : u);
  const body = p.body.replace(/\r\n/g, "\n").trim()
    .replace(/^!\[[^\]]*\]\([^)]*\)\s*$/gm, "")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => `${t} (${abs(u)})`)
    .replace(/^#{1,4}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1").replace(/(^|[^*])\*([^*\n]+)\*/g, "$1$2").replace(/`([^`]+)`/g, "$1")
    .replace(/\n{3,}/g, "\n\n");
  return `LAB NOTES · ANDREW EDMOND

${p.meta.title}
${humanDate(p.meta.date)}

${body}

Read it on the site: ${SITE}${postUrl(p)}
Comment on LinkedIn: ${p.meta.linkedin}

--
You're getting this because you signed up for Lab Notes at andrewedmond.com.
Unsubscribe: {{UNSUBSCRIBE_URL}}
{{POSTAL_ADDRESS}}
`;
}

/* ------------------------------------------------------------------ pages */
// A pinned print: how every note photo is shown (natural shape, never cropped).
const print = (p, cls = "") =>
  `<figure class="print${cls}"><span class="pin l" aria-hidden="true"></span><span class="pin r" aria-hidden="true"></span><img src="${escAttr(p.meta.photo)}" width="1200" height="630" alt="${escAttr(p.meta.photoAlt)}"></figure>`;
const dateTag = (p) => `<time datetime="${p.meta.date}">${humanDate(p.meta.date)}</time>`;

function notePage(p, list) {
  const i = list.indexOf(p);
  const older = list[i + 1];
  const newer = list[i - 1];
  const nav = [
    older ? `<a class="prevnext-item" href="${postUrl(older)}"><span class="tape">← Earlier</span><span class="prevnext-title">${esc(older.meta.title)}</span></a>` : "",
    newer ? `<a class="prevnext-item next" href="${postUrl(newer)}"><span class="tape">Next →</span><span class="prevnext-title">${esc(newer.meta.title)}</span></a>` : "",
  ].join("\n      ");

  return HEAD({
    title: `${p.meta.title} — ${AUTHOR}`,
    desc: p.meta.description,
    path: postUrl(p),
    og: { type: "article", image: p.meta.photo },
    current: "/notes/",
  }) + `
<main id="main">
  <article class="wrap reading">
    <header class="note-head">
      <p class="back"><a href="/notes/">← All Lab Notes</a></p>
      <p class="note-date"><span class="tape">Lab Note</span> ${dateTag(p)}</p>
      <h1>${esc(p.meta.title)}</h1>
      ${p.meta.dek ? `<p class="dek">${inline(p.meta.dek)}</p>` : ""}
    </header>
    ${print(p, " print--wide")}
    <div class="prose">
${p.html}
    </div>
    <p class="li-comment"><a class="btn" href="${escAttr(p.meta.linkedin)}">Comment on LinkedIn →</a></p>
    ${signup()}
    ${older || newer ? `<nav class="prevnext" aria-label="More Lab Notes">
      ${nav}
    </nav>` : ""}
  </article>
</main>` + FOOT;
}

function postList(list) {
  return list.map((p) => `
    <li class="log-item">
      <a class="log-thumb" href="${postUrl(p)}" tabindex="-1" aria-hidden="true">${print(p, " print--thumb")}</a>
      <div>
        <p class="note-date">${dateTag(p)}</p>
        <h2><a href="${postUrl(p)}">${esc(p.meta.title)}</a></h2>
        <p class="log-desc">${esc(p.meta.description)}</p>
        <a class="plain" href="${postUrl(p)}">Read the note →</a>
      </div>
    </li>`).join("");
}

// The studio's brands as shipping tags on a pegboard; the first (the studio itself) is the big yellow parent tag.
function pegboard(brands, intro, headingTag = "h2") {
  const tags = brands.map((b) => `
        <li class="tag">
          <svg viewBox="0 0 80 58" aria-hidden="true"><path d="M40 4 L28 42 M40 4 L52 42" stroke="#2A2620" stroke-width="2" fill="none"/></svg>
          <div class="tag-in"><div class="card"><span class="hole" aria-hidden="true"></span>
            <h3>${esc(b.name)}</h3>
            <p>${inline(b.line)}</p>
            <a href="${escAttr(b.url)}">${esc(b.host)}</a>
          </div></div>
        </li>`).join("");
  return `
    <div class="board">
      <div class="board-head">
        <${headingTag} id="studio-h" class="tape">The studio</${headingTag}>
        ${intro ? `<p class="board-intro">${inline(intro)}</p>` : ""}
      </div>
      <ul class="tags">${tags}
      </ul>
    </div>`;
}

function latestCard(p) {
  return `
      <article class="note">
        <a class="note-print" href="${postUrl(p)}" tabindex="-1" aria-hidden="true">${print(p)}</a>
        <div>
          <p class="note-date">${dateTag(p)}</p>
          <h3><a href="${postUrl(p)}">${esc(p.meta.title)}</a></h3>
          <p class="note-desc">${esc(p.meta.description)}</p>
          <div class="links">
            <a class="btn" href="${postUrl(p)}">Read the note →</a>
            <a class="plain" href="/notes/">All Lab Notes →</a>
          </div>
        </div>
      </article>`;
}

// Inner pages open with a label-tape title on a shelf.
const shelfTitle = (title, id = "") => `<div class="shelf"><h1${id ? ` id="${id}"` : ""} class="tape tape--lg">${esc(title)}</h1></div>`;
const drawers = (WWM, withIds) => `
    <div class="drawers">
      <section class="drawer"${withIds ? ' id="diligence"' : ""}>
        <div class="holder"><h3>${esc(WWM.meta.diligenceTitle)}</h3></div>
        <p>${inline(WWM.meta.diligence)}</p>
        <a href="${escAttr(BOREHOLE_HIRE)}">${esc(WWM.meta.diligenceCta)} →</a>
      </section>
      <section class="drawer"${withIds ? ' id="advisory"' : ""}>
        <div class="holder"><h3>${esc(WWM.meta.advisoryTitle)}</h3></div>
        <p>${inline(WWM.meta.advisory)}</p>
        <a href="mailto:${escAttr(WWM.meta.email)}">${esc(WWM.meta.email)}</a>
      </section>
    </div>`;

/* --------------------------------------------------------------- link check */
function checkLinks() {
  const html = [];
  const walk = (dir) => {
    for (const f of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, f.name);
      if (f.isDirectory()) walk(p);
      else if (f.name.endsWith(".html")) html.push(p);
    }
  };
  walk(OUT);
  for (const file of html) {
    const src = readFileSync(file, "utf8");
    for (const [, url] of src.matchAll(/\s(?:href|src)="(\/(?!\/)[^"]*)"/g)) {
      const path = decodeURI(url.split(/[?#]/)[0]);
      const target = join(OUT, path);
      const ok = path.endsWith("/") ? existsSync(join(target, "index.html")) : existsSync(target);
      if (!ok) fail(relative(OUT, file), `broken internal link ${url}`);
    }
  }
}

/* ------------------------------------------------------------------- build */
function build() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  for (const s of STATIC) {
    if (existsSync(join(ROOT, s))) cpSync(join(ROOT, s), join(OUT, s), { recursive: true });
    else if (!s.endsWith("/assets")) fail(s, "static file missing"); // asset folders may be empty
  }
  CSS_VERSION = createHash("sha256").update(readFileSync(join(ROOT, "assets/site.css"))).digest("hex").slice(0, 10);

  HOME = loadPage("home", ["kicker", "intro", "signup", "button", "description"]);
  const WWM = loadPage("work-with-me", ["diligenceTitle", "diligence", "diligenceCta", "advisoryTitle", "advisory", "email", "description"]);
  const STUDIO = loadPage("studio", ["description"]);
  const PRIVACY = loadPage("privacy", ["description"]);
  const brands = parseBrands(STUDIO.body, "content/pages/studio.md");
  KICKER = HOME.meta.kicker || "";

  const notes = loadNotes("notes/_posts");
  if (!notes.length) fail("notes/_posts", "the site needs at least one Lab Note");
  FOOT = FOOT_HTML();

  if (errors.length) return report(); // don't render half-valid content

  /* ---- articles ---- */
  for (const p of notes) write(`notes/${p.meta.slug}/index.html`, notePage(p, notes));

  /* ---- home ---- */
  const anchorScript = `<script>(function(){var m=${JSON.stringify(OLD_HOME_ANCHORS)};var h=location.hash.slice(1);if(m.hasOwnProperty(h))location.replace(m[h]);})();</script>\n`;
  write("index.html", HEAD({
    title: `${AUTHOR} — Lab Notes`,
    desc: HOME.meta.description,
    path: "/",
    current: "/",
    extraHead: anchorScript,
  }) + `
<main id="main">
  <section class="wrap bench" aria-label="Introduction">
    <p class="lede">${inline(HOME.meta.intro)}</p>
    ${signup()}
  </section>
  <section class="wrap latest" aria-labelledby="latest-h">
    <div class="shelf"><h2 id="latest-h" class="tape">Latest note</h2></div>
    ${latestCard(notes[0])}
  </section>
  <section class="wrap studio" aria-labelledby="studio-h">
    ${pegboard(brands, STUDIO.meta.intro)}
  </section>
  <section class="wrap work" aria-labelledby="work-h">
    <div class="shelf"><h2 id="work-h" class="tape">Work with me</h2></div>
    ${drawers(WWM, false)}
  </section>
</main>` + FOOT);

  /* ---- notes index ---- */
  write("notes/index.html", HEAD({
    title: `Lab Notes — ${AUTHOR}`,
    desc: HOME.meta.signup,
    path: "/notes/",
    current: "/notes/",
  }) + `
<main id="main">
  <section class="wrap page" aria-labelledby="notes-h">
    ${shelfTitle("Lab Notes", "notes-h")}
    <p class="page-intro">${inline(HOME.meta.signup)} <a href="/feed.xml">RSS →</a></p>
    <ul class="log">${postList(notes)}
    </ul>
    ${signup()}
  </section>
</main>` + FOOT);

  /* ---- studio ---- */
  write("studio/index.html", HEAD({
    title: `Studio — ${AUTHOR}`,
    desc: STUDIO.meta.description,
    path: "/studio/",
    current: "/studio/",
  }) + `
<main id="main">
  <section class="wrap page studio" aria-labelledby="studio-h">
    ${pegboard(brands, STUDIO.meta.intro, "h1")}
  </section>
</main>` + FOOT);

  /* ---- work with me ---- */
  write("work-with-me/index.html", HEAD({
    title: `Work with me — ${AUTHOR}`,
    desc: WWM.meta.description,
    path: "/work-with-me/",
    current: "/work-with-me/",
  }) + `
<main id="main">
  <section class="wrap page work" aria-labelledby="work-h">
    ${shelfTitle("Work with me", "work-h")}
    ${drawers(WWM, true)}
  </section>
</main>` + FOOT);

  /* ---- privacy ---- */
  write("privacy/index.html", HEAD({
    title: `Privacy — ${AUTHOR}`,
    desc: PRIVACY.meta.description,
    path: "/privacy/",
  }) + `
<main id="main">
  <article class="wrap page reading">
    ${shelfTitle("Privacy")}
    <div class="prose">
${renderMarkdown(PRIVACY.body)}
    </div>
  </article>
</main>` + FOOT);

  /* ---- confirm + unsubscribe (linked from emails; not indexed) ---- */
  const actionPage = (path, eyebrow, title, intro, script) => write(`${path.slice(1)}index.html`, HEAD({
    title: `${title} — ${AUTHOR}`,
    desc: title,
    path,
  }).replace('<link rel="canonical"', '<meta name="robots" content="noindex">\n<link rel="canonical"') + `
<main id="main">
  <section class="wrap page">
    <div class="shelf"><p class="tape">${eyebrow}</p></div>
    <h1 class="big">${title}</h1>
    <p id="action-status" class="page-intro" role="status" aria-live="polite">${intro}</p>
  </section>
</main>
<script>
  (function(){
    var t = new URLSearchParams(location.search).get('t') || '';
    var status = document.getElementById('action-status');
    function post(path){
      return fetch(path, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({t: t})})
        .then(function(r){ return r.json().then(function(b){ return {ok: r.ok, b: b}; }); });
    }
    ${script}
  })();
</script>` + FOOT);

  actionPage("/confirm/", "Lab Notes", "Confirming…", "One moment.", `
    post('/api/confirm').then(function(x){
      if (x.ok && window.labnotes) labnotes('subscribed');
      document.querySelector('h1').textContent = x.ok ? 'You’re subscribed.' : 'That didn’t work.';
      status.textContent = x.ok ? 'Lab Notes will arrive by email every Tuesday. Every email has an unsubscribe link.' : (x.b.error || 'Please try again.');
    }).catch(function(){ status.textContent = 'Something went wrong. Please try the link again.'; });`);

  actionPage("/unsubscribe/", "Lab Notes", "Unsubscribe", "Stop getting Lab Notes by email? <button type=\"button\" id=\"unsub\" class=\"btn\">Unsubscribe</button>", `
    document.getElementById('unsub').addEventListener('click', function(){
      status.textContent = 'One moment.';
      post('/api/unsubscribe').then(function(x){
        if (x.ok && window.labnotes) labnotes(null);
        document.querySelector('h1').textContent = x.ok ? 'You’re unsubscribed.' : 'That didn’t work.';
        status.textContent = x.ok ? 'You won’t get Lab Notes by email any more. They stay here on the site.' : (x.b.error || 'Please try again.');
      }).catch(function(){ status.textContent = 'Something went wrong. Please try again.'; });
    });`);

  /* ---- each note's email, read by the Worker when a send runs (never served publicly) ---- */
  for (const p of notes) {
    write(`_email/${p.meta.slug}.html`, noteEmailHtml(p));
    write(`_email/${p.meta.slug}.txt`, noteEmailText(p));
    write(`_email/${p.meta.slug}.json`, JSON.stringify({ subject: p.meta.title }) + "\n");
  }

  /* ---- 404 ---- */
  write("404.html", HEAD({
    title: `Not found — ${AUTHOR}`,
    desc: "This page doesn't exist.",
    path: "/404.html",
  }).replace('<link rel="canonical"', '<meta name="robots" content="noindex">\n<link rel="canonical"') + `
<main id="main">
  <section class="wrap page">
    <div class="shelf"><p class="tape">Not found</p></div>
    <h1 class="big">Nothing here.</h1>
    <p class="page-intro">The old blog has been retired. New writing is in <a href="/notes/">Lab Notes</a>, or start at <a href="/">the home page</a>.</p>
  </section>
</main>` + FOOT);


  /* ---- RSS: Lab Notes, newest first ---- */
  const feedItems = notes.map((p) => {
    const url = SITE + postUrl(p);
    return `    <item>
      <title>${esc(p.meta.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <pubDate>${rfc822(p.meta.date)}</pubDate>
      <description>${esc(p.meta.description)}</description>
    </item>`;
  }).join("\n");
  write("feed.xml", `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(AUTHOR)} — Lab Notes</title>
    <link>${SITE}/</link>
    <atom:link href="${SITE}/feed.xml" rel="self" type="application/rss+xml"/>
    <description>${esc(HOME.meta.signup)}</description>
    <language>en</language>
    <lastBuildDate>${rfc822(notes[0].meta.date)}</lastBuildDate>
${feedItems}
  </channel>
</rss>
`);

  /* ---- sitemap + robots ---- */
  const pages = ["/", "/notes/", "/studio/", "/work-with-me/", "/privacy/", ...notes.map(postUrl)];
  write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map((p) => `  <url><loc>${SITE}${p}</loc></url>`).join("\n")}
</urlset>
`);
  write("robots.txt", `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);

  checkLinks();
  report(notes.length);
}

function report(nNotes) {
  for (const w of warnings) console.warn(`warning  ${w}`);
  if (errors.length) {
    for (const e of errors) console.error(`error    ${e}`);
    console.error(`\nBuild failed: ${errors.length} error(s). Nothing was published.`);
    process.exit(1);
  }
  console.log(`Built ${nNotes} Lab Notes → _site/`);
}

build();
