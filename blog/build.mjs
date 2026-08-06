#!/usr/bin/env node
/* ==========================================================================
   blog/build.mjs — dependency-free static blog generator.

   Reads:   blog/_posts/*.md   (Markdown + YAML-ish front-matter)
   Writes:  blog/index.html            (the blog index)
            blog/<slug>/index.html      (one page per post)
            feed.xml                    (RSS 2.0, at the site root)

   No npm dependencies. Run with:  node blog/build.mjs
   Authoring guide: blog/README.md
   ========================================================================== */

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");            // repo root
const POSTS_DIR = join(__dirname, "_posts");
const SITE = "https://www.andrewedmond.com";
const AUTHOR = "Andrew Edmond";
const LINKEDIN = "https://www.linkedin.com/in/andrewedmond";

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

/* --------------------------------------------------- front-matter parsing */
function parseFrontMatter(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error("Missing front-matter fence (--- ... ---)");
  const meta = {};
  for (const line of m[1].split("\n")) {
    if (!line.trim()) continue;
    const i = line.indexOf(":");
    if (i === -1) continue;
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
  let s = text
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

/* ------------------------------------------------------------- page chrome */
const HEAD = ({ title, desc, canonical, og }) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${escAttr(desc)}">
<meta name="theme-color" content="#211C18">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="${og?.type || "website"}">
<meta property="og:url" content="${canonical}">
<meta property="og:title" content="${escAttr(title)}">
<meta property="og:description" content="${escAttr(desc)}">
<meta property="og:image" content="${og?.image || SITE + "/og.png"}">
<meta name="twitter:card" content="summary_large_image">
<link rel="alternate" type="application/rss+xml" title="${escAttr(AUTHOR)} — Blog" href="${SITE}/feed.xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,340;0,9..144,420;0,9..144,560;1,9..144,340;1,9..144,420&family=Mulish:ital,wght@0,400;0,500;0,600;1,400&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/blog/assets/blog.css?v=1">
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<div class="sheet">
  <header class="masthead">
    <div class="brand">
      <a class="monogram" aria-hidden="true" href="/">AE</a>
      <div class="wordmark">
        <span class="name"><a href="/">Andrew Edmond</a></span>
        <p class="kicker">Independent buy-side technical due diligence</p>
      </div>
    </div>
    <p class="meta"><a href="${LINKEDIN}">linkedin.com/in/andrewedmond ↗</a><br>Southern Spain · Remote &amp; onsite</p>
  </header>`;

const FOOT = `
  <footer>
    <span>${esc(AUTHOR)}</span>
    <span><a href="/">andrewedmond.com</a> · <a href="/feed.xml">RSS</a></span>
    <span>Southern Spain · Remote &amp; onsite</span>
  </footer>
</div>
</body>
</html>`;

/* ------------------------------------------------------------------- build */
function build() {
  if (!existsSync(POSTS_DIR)) { console.error("No _posts directory."); process.exit(1); }
  const files = readdirSync(POSTS_DIR).filter((f) => f.endsWith(".md"));
  const posts = files.map((file) => {
    const raw = readFileSync(join(POSTS_DIR, file), "utf8");
    const { meta, body } = parseFrontMatter(raw);
    if (!meta.title || !meta.date || !meta.slug) {
      throw new Error(`${file}: front-matter needs title, date, slug`);
    }
    return { file, meta, body, html: renderMarkdown(body), mins: readingTime(body) };
  });

  // newest first
  posts.sort((a, b) => (a.meta.date < b.meta.date ? 1 : a.meta.date > b.meta.date ? -1 : 0));

  // chronological (oldest first) for prev/next within a series
  const chrono = [...posts].reverse();

  /* ---- per-post pages ---- */
  for (let i = 0; i < chrono.length; i++) {
    const p = chrono[i];
    const prev = chrono[i - 1]; // older → "earlier in the series"
    const next = chrono[i + 1]; // newer → "next"
    const url = `${SITE}/blog/${p.meta.slug}/`;

    const hero = p.meta.hero
      ? `<figure class="article-hero"><img src="${escAttr(p.meta.hero)}" alt="${escAttr(p.meta.heroAlt || p.meta.title)}">` +
        (p.meta.heroCaption ? `<figcaption>${inline(p.meta.heroCaption)}</figcaption>` : "") + `</figure>`
      : "";

    const series = p.meta.series
      ? `<p class="eyebrow">${esc(p.meta.series)}</p>` : `<p class="eyebrow">Blog</p>`;

    const nav = [
      prev ? `<a class="prev" href="/blog/${prev.meta.slug}/"><span class="np-label">← Earlier</span><span class="np-title">${esc(prev.meta.title)}</span></a>` : "<span></span>",
      next ? `<a class="next" href="/blog/${next.meta.slug}/"><span class="np-label">Next →</span><span class="np-title">${esc(next.meta.title)}</span></a>` : "",
    ].join("\n    ");

    const page =
      HEAD({
        title: `${p.meta.title} — ${AUTHOR}`,
        desc: p.meta.description || "",
        canonical: url,
        og: { type: "article", image: p.meta.hero ? SITE + p.meta.hero : undefined },
      }) +
`
  <main id="main" class="article">
    <a class="back" href="/blog/">← All posts</a>
    <div class="article-head">
      ${series}
      <h1 class="article-title">${esc(p.meta.title)}</h1>
    </div>
    ${p.meta.dek ? `<p class="article-dek">${inline(p.meta.dek)}</p>` : ""}
    <p class="article-meta"><span>${humanDate(p.meta.date)}</span><span class="dot">·</span><span>${p.mins} min read</span></p>
    ${hero}
    <div class="prose">
${p.html}
    </div>
    <div class="article-cta">
      This is one post from a longer build log. If you&#39;re weighing an AI-built codebase, <a class="link" href="/">that&#39;s the work I do</a> — or find me on <a class="link" href="${LINKEDIN}">LinkedIn</a>.
    </div>
    <nav class="post-nav">
    ${nav}
    </nav>
  </main>` +
      FOOT;

    const outDir = join(__dirname, p.meta.slug);
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, "index.html"), page);
  }

  /* ---- index ---- */
  const items = posts.map((p) => `
    <li class="post-item">
      <div class="p-date">${humanDate(p.meta.date)}${p.meta.seriesShort ? `<span class="p-series">${esc(p.meta.seriesShort)}</span>` : ""}</div>
      <div>
        <h2><a href="/blog/${p.meta.slug}/">${esc(p.meta.title)}</a></h2>
        <p class="p-dek">${esc(p.meta.description || p.meta.dek || "")}</p>
        <a class="link p-more" href="/blog/${p.meta.slug}/">Read →</a>
      </div>
    </li>`).join("");

  const indexPage =
    HEAD({
      title: `Blog — ${AUTHOR}`,
      desc: "Notes on building and assessing AI-era software — architecture, truth pipelines, testing, and operations, with receipts.",
      canonical: `${SITE}/blog/`,
    }) +
`
  <main id="main">
    <div class="blog-intro divider-top">
      <p class="eyebrow" style="padding-top:2.5rem">Blog</p>
      <h1>Building and assessing <span class="em">AI-era software.</span></h1>
      <p>Notes from the work — architecture invariants, truth pipelines, testing, and operations. Written with receipts. <a class="link" href="/feed.xml">RSS →</a></p>
    </div>
    <ul class="post-list">${items}
    </ul>
  </main>` +
    FOOT;

  writeFileSync(join(__dirname, "index.html"), indexPage);

  /* ---- RSS ---- */
  const feedItems = posts.map((p) => {
    const url = `${SITE}/blog/${p.meta.slug}/`;
    return `    <item>
      <title>${esc(p.meta.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <pubDate>${rfc822(p.meta.date)}</pubDate>
      <description>${esc(p.meta.description || p.meta.dek || "")}</description>
    </item>`;
  }).join("\n");

  const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(AUTHOR)} — Blog</title>
    <link>${SITE}/blog/</link>
    <atom:link href="${SITE}/feed.xml" rel="self" type="application/rss+xml"/>
    <description>Notes on building and assessing AI-era software.</description>
    <language>en</language>
    <lastBuildDate>${rfc822(posts[0].meta.date)}</lastBuildDate>
${feedItems}
  </channel>
</rss>
`;
  writeFileSync(join(ROOT, "feed.xml"), feed);

  console.log(`Built ${posts.length} posts → blog/index.html, blog/<slug>/, feed.xml`);
}

build();
