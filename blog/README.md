# Blog — authoring & build

A tiny, dependency-free static blog. You write Markdown; one script renders it
into HTML that matches the site, and regenerates the RSS feed.

## Write a post

Create `blog/_posts/<date>-<slug>.md`:

```markdown
---
title: The most productive day was the day nothing got built
slug: invariants-before-features
date: 2026-07-02
series: Get Camino build log · 2 of 10
seriesShort: Camino 2/10
dek: Four rules, written before a single screen. Why invariants matter more when features cost minutes.
description: One-line summary for the index card, RSS, and social previews.
hero: /blog/assets/camino-2-invariants.png
heroAlt: Editorial graphic — the four Get Camino invariants
heroCaption: The four invariants, set on day one.
---

Body in Markdown. Blank line between paragraphs.

## Supported Markdown

- `## h2`, `### h3`
- **bold**, *italic*, `code`
- `- ` unordered lists, `1. ` ordered lists
- `> ` blockquotes (render as pull quotes)
- `---` horizontal rule
- `[text](url)` links, `![alt](/path "caption")` images (become figures)
```

### Front-matter fields

| field | required | purpose |
|-------|----------|---------|
| `title` | ✅ | post title (page + index + RSS) |
| `slug` | ✅ | URL: `/blog/<slug>/` |
| `date` | ✅ | `YYYY-MM-DD`; drives ordering + RSS |
| `description` | recommended | index card, RSS, social preview |
| `dek` | optional | italic standfirst under the title |
| `series` | optional | eyebrow label on the post |
| `seriesShort` | optional | small label under the date on the index |
| `hero` / `heroAlt` / `heroCaption` | optional | lead image |

The Markdown renderer is intentionally small (see `build.mjs`). It covers what
essays need; extend it deliberately if a post needs more.

## Build

```bash
node blog/build.mjs
```

Generates `blog/index.html`, `blog/<slug>/index.html`, and `/feed.xml`.
Commit those generated files along with the Markdown — GitHub Pages serves them
as-is (no CI build step). Re-run after any edit.

## Workflow for co-authored posts

1. A source project hands over a draft as Markdown (a "post idea").
2. We edit it together into `_posts/<date>-<slug>.md` with front-matter.
3. `node blog/build.mjs` → review locally → commit.
