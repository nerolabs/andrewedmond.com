#!/usr/bin/env node
/* ==========================================================================
   build.mjs — dependency-free static site generator for andrewedmond.com.

   Reads:   content/pages/*.md   page copy, as named front-matter slots
            notes/_posts/*.md    Lab Notes
            blog/_posts/*.md     the July–August blog posts
   Writes:  _site/               the whole deployable site (gitignored)

   Every build also checks the content: required front matter, photos that
   exist, LinkedIn URLs, unique slugs, and every internal link. Any problem
   fails the build, so a bad note never reaches the live site.

   No npm dependencies. Run with:  node build.mjs
   Preview with:                   python3 -m http.server -d _site 8765
   Authoring guide: content/README.md (Lab Notes, page copy), blog/README.md
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

// Borehole's "Hire us" page. It ships on Borehole's side the day we cut over.
// TODO(cutover): map the old home anchors to its sections once Borehole names them.
const BOREHOLE_HIRE = "https://borehole.dev/hire-us";
// TODO(Kit): the form's action URL once Andrew has signed up. Until then the
// sign-up block shows LinkedIn and RSS instead of a form.
const KIT_FORM_ACTION = "";

// Old URLs that now live elsewhere. Each gets a redirect page.
const REDIRECTS = {
  "/fractional/": BOREHOLE_HIRE,
  "/advisory/": "/work-with-me/#advisory",
};
// The old home page's section anchors. Browsers never send #fragments to the
// server, so no host can redirect them; a script on the new home page does.
const OLD_HOME_ANCHORS = {
  summary: BOREHOLE_HIRE,
  framework: BOREHOLE_HIRE,
  scope: BOREHOLE_HIRE,
  evidence: BOREHOLE_HIRE,
  background: BOREHOLE_HIRE,
  contact: "/work-with-me/",
};
// Files and folders copied into _site as they are.
const STATIC = ["CNAME", "favicon.svg", "apple-touch-icon.png", "og.png", "assets", "blog/assets", "notes/assets"];

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
   Deliberately small: supports exactly what essays here use — headings,
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

function readingTime(md) {
  const words = md.replace(/[#>*_`\-\[\]()!]/g, " ").split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
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
const OPTIONAL_SLOTS = { studio: ["intro"] };

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
const BLOG_FIELDS = ["title", "slug", "date", "series", "seriesShort", "dek", "description", "hero", "heroAlt", "heroCaption"];

function loadPosts(dir, kind) {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return [];
  const posts = [];
  const slugs = new Set();
  for (const file of readdirSync(abs).filter((f) => f.endsWith(".md")).sort()) {
    const where = `${dir}/${file}`;
    const { meta, body } = parseFrontMatter(readFileSync(join(abs, file), "utf8"), where);
    const required = kind === "note" ? NOTE_REQUIRED : ["title", "slug", "date"];
    const allowed = kind === "note" ? [...NOTE_REQUIRED, ...NOTE_OPTIONAL] : BLOG_FIELDS;
    for (const k of required) if (!meta[k]) fail(where, `front matter needs "${k}"`);
    for (const k of Object.keys(meta)) if (!allowed.includes(k)) fail(where, `unknown front-matter field "${k}" (check the spelling)`);
    if (meta.slug && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(meta.slug)) fail(where, `slug "${meta.slug}" must be lowercase words joined by hyphens`);
    if (meta.slug && slugs.has(meta.slug)) fail(where, `slug "${meta.slug}" is already used`);
    slugs.add(meta.slug);
    if (meta.date && (!/^\d{4}-\d{2}-\d{2}$/.test(meta.date) || isNaN(new Date(meta.date)))) fail(where, `date "${meta.date}" must be YYYY-MM-DD`);
    if (kind === "note") {
      if (meta.date && meta.slug && file !== `${meta.date}-${meta.slug}.md`) fail(where, `file name must be ${meta.date}-${meta.slug}.md`);
      if (meta.linkedin && !/^https:\/\/(www\.)?linkedin\.com\/\S+$/.test(meta.linkedin)) fail(where, `linkedin must be a https://www.linkedin.com/... URL`);
      if (meta.photo) {
        if (!/^\/notes\/assets\/[^/]+\.(jpe?g|png|webp)$/i.test(meta.photo)) fail(where, `photo must be /notes/assets/<file>.jpg (or .png, .webp)`);
        else if (!existsSync(join(ROOT, meta.photo))) fail(where, `photo ${meta.photo} doesn't exist`);
        else if (statSync(join(ROOT, meta.photo)).size > 600 * 1024) warn(where, `photo ${meta.photo} is over 600 KB; aim for under 400 KB`);
      }
      if (/^\s*</m.test(body)) warn(where, "raw HTML in the body; ask the build before using it");
    }
    posts.push({ kind, file, meta, body, html: renderMarkdown(body), mins: readingTime(body) });
  }
  // newest first
  return posts.sort((a, b) => (a.meta.date < b.meta.date ? 1 : a.meta.date > b.meta.date ? -1 : 0));
}

const postUrl = (p) => `/${p.kind === "note" ? "notes" : "blog"}/${p.meta.slug}/`;

/* ------------------------------------------------------------- page chrome */
const NAV = [
  ["/notes/", "Lab Notes"],
  ["/blog/", "Blog"],
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
    document.querySelectorAll('form.signup-form').forEach(function(f){
      f.addEventListener('submit', function(){ cap('signup_submit', {page:page}); });
    });
  })();
</script>`;

let CSS_VERSION = "1";
let KICKER = "";

const HEAD = ({ title, desc, path, og, current, extraHead = "" }) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${escAttr(desc)}">
<meta name="theme-color" content="#211C18">
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
${extraHead}${POSTHOG}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,340;0,9..144,420;0,9..144,560;1,9..144,340;1,9..144,420&family=Mulish:ital,wght@0,400;0,500;0,600;1,400&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/site.css?v=${CSS_VERSION}">
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<div class="sheet">
  <header class="masthead">
    <div class="brand">
      <a class="monogram" aria-hidden="true" tabindex="-1" href="/">AE</a>
      <div class="wordmark">
        <span class="name"><a href="/">${esc(AUTHOR)}</a></span>
        <p class="kicker">${esc(KICKER)}</p>
      </div>
    </div>
    <nav class="site-nav" aria-label="Site">
      ${NAV.map(([href, label]) => `<a href="${href}"${current === href ? ' aria-current="page"' : ""}>${label}</a>`).join("\n      ")}
    </nav>
  </header>`;

const FOOT = `
  <footer>
    <span>${esc(AUTHOR)} · Jerez, Spain</span>
    <span><a href="${LINKEDIN}">LinkedIn</a> · <a href="/feed.xml">RSS</a></span>
  </footer>
</div>
${EVENTS}
</body>
</html>`;

// The Lab Notes sign-up. A plain form that posts to Kit: no Kit script, so
// the site stays cookieless. Until Kit exists it points to LinkedIn and RSS.
let HOME = { meta: {} };
function signup() {
  const action = KIT_FORM_ACTION
    ? `<form class="signup-form" action="${escAttr(KIT_FORM_ACTION)}" method="post">
        <label class="sr-only" for="signup-email">Email address</label>
        <input id="signup-email" type="email" name="email_address" required autocomplete="email" placeholder="you@example.com">
        <button type="submit">${esc(HOME.meta.button)}</button>
      </form>`
    : `<p class="signup-fallback">Email sign-up opens soon. Meanwhile: <a class="link" href="${LINKEDIN}">LinkedIn</a> or <a class="link" href="/feed.xml">RSS</a>.</p>`;
  return `
    <section class="signup" aria-label="Get Lab Notes by email">
      <p class="signup-line">${inline(HOME.meta.signup)}</p>
      ${action}
    </section>`;
}

/* ------------------------------------------------------------------ pages */
function articlePage(p, list) {
  const i = list.indexOf(p);
  const older = list[i + 1];
  const newer = list[i - 1];
  const isNote = p.kind === "note";
  const path = postUrl(p);

  const heroSrc = isNote ? p.meta.photo : p.meta.hero;
  const heroAlt = isNote ? p.meta.photoAlt : p.meta.heroAlt || p.meta.title;
  const hero = heroSrc
    ? `<figure class="article-hero"><img src="${escAttr(heroSrc)}" alt="${escAttr(heroAlt)}">` +
      (p.meta.heroCaption ? `<figcaption>${inline(p.meta.heroCaption)}</figcaption>` : "") + `</figure>`
    : "";
  const eyebrow = isNote ? "Lab Note" : p.meta.series || "Blog";
  const meta = isNote
    ? `<span>${humanDate(p.meta.date)}</span>`
    : `<span>${humanDate(p.meta.date)}</span><span class="dot">·</span><span>${p.mins} min read</span>`;
  const comment = isNote
    ? `<p class="li-comment"><a class="link" href="${escAttr(p.meta.linkedin)}">Comment on LinkedIn →</a></p>` : "";

  const nav = [
    older ? `<a class="prev" href="${postUrl(older)}"><span class="np-label">← Earlier</span><span class="np-title">${esc(older.meta.title)}</span></a>` : "<span></span>",
    newer ? `<a class="next" href="${postUrl(newer)}"><span class="np-label">Next →</span><span class="np-title">${esc(newer.meta.title)}</span></a>` : "",
  ].join("\n    ");

  return HEAD({
    title: `${p.meta.title} — ${AUTHOR}`,
    desc: p.meta.description || "",
    path,
    og: { type: "article", image: heroSrc },
    current: isNote ? "/notes/" : "/blog/",
  }) + `
  <main id="main" class="article">
    <a class="back" href="${isNote ? "/notes/" : "/blog/"}">← ${isNote ? "All Lab Notes" : "All posts"}</a>
    <div class="article-head">
      <p class="eyebrow">${esc(eyebrow)}</p>
      <h1 class="article-title">${esc(p.meta.title)}</h1>
    </div>
    ${p.meta.dek ? `<p class="article-dek">${inline(p.meta.dek)}</p>` : ""}
    <p class="article-meta">${meta}</p>
    ${hero}
    <div class="prose">
${p.html}
    </div>
    ${comment}
    ${signup()}
    ${older || newer ? `<nav class="post-nav" aria-label="More ${isNote ? "notes" : "posts"}">
    ${nav}
    </nav>` : ""}
  </main>` + FOOT;
}

function postList(list) {
  return list.map((p) => `
    <li class="post-item">
      <div class="p-date">${humanDate(p.meta.date)}${p.meta.seriesShort ? `<span class="p-series">${esc(p.meta.seriesShort)}</span>` : ""}</div>
      <div>
        <h2><a href="${postUrl(p)}">${esc(p.meta.title)}</a></h2>
        <p class="p-dek">${esc(p.meta.description || p.meta.dek || "")}</p>
        <a class="link p-more" href="${postUrl(p)}">Read →</a>
      </div>
    </li>`).join("");
}

function brandList(brands, cls) {
  return `<ul class="${cls}">${brands.map((b) => `
      <li>
        <h3><a href="${escAttr(b.url)}">${esc(b.name)}</a></h3>
        <p>${inline(b.line)}</p>
        <a class="host" href="${escAttr(b.url)}">${esc(b.host)} ↗</a>
      </li>`).join("")}
    </ul>`;
}

function latestCard(p) {
  const img = p.kind === "note" ? p.meta.photo : p.meta.hero;
  const alt = p.kind === "note" ? p.meta.photoAlt : p.meta.heroAlt || "";
  return `
      <article class="latest-card${img ? "" : " no-img"}">
        ${img ? `<a class="latest-img" href="${postUrl(p)}" tabindex="-1" aria-hidden="true"><img src="${escAttr(img)}" alt="${escAttr(alt)}" loading="lazy"></a>` : ""}
        <div>
          <p class="p-date">${humanDate(p.meta.date)}</p>
          <h3><a href="${postUrl(p)}">${esc(p.meta.title)}</a></h3>
          <p class="p-dek">${esc(p.meta.description || p.meta.dek || "")}</p>
          <a class="link" href="${postUrl(p)}">Read the note →</a>
        </div>
      </article>`;
}

function redirectPage(target) {
  const abs = absUrl(target);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>This page has moved</title>
<link rel="canonical" href="${escAttr(abs)}">
<meta http-equiv="refresh" content="0; url=${escAttr(target)}">
<script>location.replace(${JSON.stringify(target)});</script>
<style>body{background:#211C18;color:#EDE7DC;font:1.05rem/1.6 system-ui,sans-serif;padding:3rem 1.5rem}a{color:#C2A15A}</style>
</head>
<body>
<p>This page has moved to <a href="${escAttr(target)}">${esc(abs)}</a>.</p>
</body>
</html>
`;
}

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
  const brands = parseBrands(STUDIO.body, "content/pages/studio.md");
  KICKER = HOME.meta.kicker || "";

  const notes = loadPosts("notes/_posts", "note");
  const blog = loadPosts("blog/_posts", "blog");
  if (!notes.length) warn("notes/_posts", "no Lab Notes yet; the home page shows the newest blog post instead");
  if (!KIT_FORM_ACTION) warn("build.mjs", "KIT_FORM_ACTION is empty; the sign-up block shows LinkedIn and RSS instead of a form");

  if (errors.length) return report(); // don't render half-valid content

  /* ---- articles ---- */
  for (const p of notes) write(`notes/${p.meta.slug}/index.html`, articlePage(p, notes));
  for (const p of blog) write(`blog/${p.meta.slug}/index.html`, articlePage(p, blog));

  /* ---- home ---- */
  const latest = notes[0] || blog[0];
  const anchorScript = `<script>(function(){var m=${JSON.stringify(OLD_HOME_ANCHORS)};var h=location.hash.slice(1);if(m.hasOwnProperty(h))location.replace(m[h]);})();</script>\n`;
  write("index.html", HEAD({
    title: `${AUTHOR} — Lab Notes`,
    desc: HOME.meta.description,
    path: "/",
    current: "/",
    extraHead: anchorScript,
  }) + `
  <main id="main" class="home">
    <section class="hero">
      <h1 class="sr-only">${esc(AUTHOR)} — Lab Notes</h1>
      <p class="lede">${inline(HOME.meta.intro)}</p>
    </section>
    ${signup()}
    <section class="home-section divider-top" aria-labelledby="latest-h">
      <h2 class="eyebrow" id="latest-h">${notes.length ? "Latest Lab Note" : "Latest from the lab"}</h2>
      ${latestCard(latest)}
      <p class="more"><a class="link" href="${notes.length ? "/notes/" : "/blog/"}">${notes.length ? "All Lab Notes →" : "All posts →"}</a></p>
    </section>
    <section class="home-section divider-top" aria-labelledby="studio-h">
      <h2 class="eyebrow" id="studio-h">The studio</h2>
      ${brandList(brands, "brands")}
    </section>
    <section class="home-section divider-top" aria-labelledby="wwm-h">
      <h2 class="eyebrow" id="wwm-h">Work with me</h2>
      <div class="wwm">
        <div>
          <h3>${esc(WWM.meta.diligenceTitle)}</h3>
          <p><a class="link" href="${escAttr(BOREHOLE_HIRE)}">${esc(WWM.meta.diligenceCta)} →</a></p>
        </div>
        <div>
          <h3>${esc(WWM.meta.advisoryTitle)}</h3>
          <p><a class="link" href="/work-with-me/#advisory">About advisory →</a></p>
        </div>
      </div>
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
    <div class="blog-intro divider-top">
      <p class="eyebrow" style="padding-top:2.5rem">Lab Notes</p>
      <h1>Notes from <span class="em">the lab.</span></h1>
      <p>${inline(HOME.meta.signup)} <a class="link" href="/feed.xml">RSS →</a></p>
    </div>
    ${notes.length ? `<ul class="post-list">${postList(notes)}
    </ul>` : `<p class="empty">The first Lab Notes arrive here soon.</p>`}
    <p class="more"><a class="link" href="/blog/">Earlier notes: the blog, July–August 2026 →</a></p>
    ${signup()}
  </main>` + FOOT);

  /* ---- blog index (URL unchanged) ---- */
  write("blog/index.html", HEAD({
    title: `Blog — ${AUTHOR}`,
    desc: "Notes on building and assessing AI-era software — architecture, truth pipelines, testing, and operations, with receipts.",
    path: "/blog/",
    current: "/blog/",
  }) + `
  <main id="main">
    <div class="blog-intro divider-top">
      <p class="eyebrow" style="padding-top:2.5rem">Blog</p>
      <h1>Building and assessing <span class="em">AI-era software.</span></h1>
      <p>Notes from the work — architecture invariants, truth pipelines, testing, and operations. Written with receipts. <a class="link" href="/feed.xml">RSS →</a></p>
    </div>
    <ul class="post-list">${postList(blog)}
    </ul>
  </main>` + FOOT);

  /* ---- studio ---- */
  write("studio/index.html", HEAD({
    title: `Studio — ${AUTHOR}`,
    desc: STUDIO.meta.description,
    path: "/studio/",
    current: "/studio/",
  }) + `
  <main id="main">
    <div class="blog-intro divider-top">
      <p class="eyebrow" style="padding-top:2.5rem">Studio</p>
      <h1>The <span class="em">studio.</span></h1>
      ${STUDIO.meta.intro ? `<p>${inline(STUDIO.meta.intro)}</p>` : ""}
    </div>
    ${brandList(brands, "brands brands-page")}
  </main>` + FOOT);

  /* ---- work with me ---- */
  write("work-with-me/index.html", HEAD({
    title: `Work with me — ${AUTHOR}`,
    desc: WWM.meta.description,
    path: "/work-with-me/",
    current: "/work-with-me/",
  }) + `
  <main id="main">
    <div class="blog-intro divider-top">
      <p class="eyebrow" style="padding-top:2.5rem">Work with me</p>
      <h1>Work <span class="em">with me.</span></h1>
    </div>
    <section class="wwm-item" id="diligence">
      <h2>${esc(WWM.meta.diligenceTitle)}</h2>
      <p>${inline(WWM.meta.diligence)}</p>
      <p><a class="link" href="${escAttr(BOREHOLE_HIRE)}">${esc(WWM.meta.diligenceCta)} →</a></p>
    </section>
    <section class="wwm-item" id="advisory">
      <h2>${esc(WWM.meta.advisoryTitle)}</h2>
      <p>${inline(WWM.meta.advisory)}</p>
      <p><a class="link" href="mailto:${escAttr(WWM.meta.email)}">${esc(WWM.meta.email)}</a></p>
    </section>
  </main>` + FOOT);

  /* ---- 404 ---- */
  write("404.html", HEAD({
    title: `Not found — ${AUTHOR}`,
    desc: "This page doesn't exist.",
    path: "/404.html",
  }).replace('<link rel="canonical"', '<meta name="robots" content="noindex">\n<link rel="canonical"') + `
  <main id="main">
    <div class="blog-intro divider-top">
      <p class="eyebrow" style="padding-top:2.5rem">Not found</p>
      <h1>Nothing <span class="em">here.</span></h1>
      <p>Try <a class="link" href="/notes/">Lab Notes</a>, <a class="link" href="/blog/">the blog</a> or <a class="link" href="/">the home page</a>.</p>
    </div>
  </main>` + FOOT);

  /* ---- redirects ---- */
  for (const [from, to] of Object.entries(REDIRECTS)) write(`${from}index.html`, redirectPage(to));

  /* ---- RSS: notes and blog together, newest first ---- */
  const all = [...notes, ...blog].sort((a, b) => (a.meta.date < b.meta.date ? 1 : a.meta.date > b.meta.date ? -1 : 0));
  const feedItems = all.map((p) => {
    const url = SITE + postUrl(p);
    return `    <item>
      <title>${esc(p.meta.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <pubDate>${rfc822(p.meta.date)}</pubDate>
      <description>${esc(p.meta.description || p.meta.dek || "")}</description>
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
    <lastBuildDate>${rfc822(all[0].meta.date)}</lastBuildDate>
${feedItems}
  </channel>
</rss>
`);

  /* ---- sitemap + robots ---- */
  const pages = ["/", "/notes/", "/blog/", "/studio/", "/work-with-me/", ...all.map(postUrl)];
  write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map((p) => `  <url><loc>${SITE}${p}</loc></url>`).join("\n")}
</urlset>
`);
  write("robots.txt", `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);

  checkLinks();
  report(notes.length, blog.length);
}

function report(nNotes, nBlog) {
  for (const w of warnings) console.warn(`warning  ${w}`);
  if (errors.length) {
    for (const e of errors) console.error(`error    ${e}`);
    console.error(`\nBuild failed: ${errors.length} error(s). Nothing was published.`);
    process.exit(1);
  }
  console.log(`Built ${nNotes} Lab Notes and ${nBlog} blog posts → _site/`);
}

build();
