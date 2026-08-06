---
title: What makes an AI-built app "real"
slug: the-bar-for-ai-built-software
date: 2026-07-05
series: Get Camino build log · 1 of 10
seriesShort: Camino 1/10
dek: Before the story of what I built, the standard I refused to ship without — and why it's the standard, not the tooling, that separates a product from a demo.
description: The checklist I refused to ship without — real users, full pipelines, tests in CI, monitoring, rate limiting, security headers, and a citation on every claim.
---

<figure class="field-card">
<figcaption class="fc-head"><span class="fc-kicker">The bar</span><span class="fc-sub">No credit unless the app cleared every line</span></figcaption>
<ul class="fc-checklist">
<li>Real users on a real domain, full dev / staging / prod pipelines</li>
<li>English and Spanish — plus German, Italian, French</li>
<li>Unit, integration, and end-to-end tests in CI</li>
<li>Error monitoring with uptime paging</li>
<li>Rate limiting verified against live traffic</li>
<li>Staged environments with deploy guardrails</li>
<li>Security headers checked in production</li>
<li>A citation on every claim, enforced by a build gate</li>
</ul>
</figure>

"Executive builds an app with AI" is a genre now. Most of them are demos.

So before I tell you about mine, here's the bar I held myself to — the eight lines above, and not one of them optional. A polished demo clears maybe three.

That bar is met. Get Camino, a relocation guide for people moving to Spain, is live on the web today, with iOS and Android in app-store review.

Here's the part that should get your attention: I hadn't written production code in 15 years. I built this in under a week with Claude Code and Anthropic's Fable model, with some Opus 4.8 thrown in.

And here's the part that keeps it honest: the week was fast because of thirty years of engineering judgment, not despite it. AI collapsed the cost of typing. It did nothing to collapse the cost of being wrong — that part was still my job.

In the notes that follow, I break the build down into leadership lessons for the AI era, with receipts: the architecture invariants, the truth pipeline, the ops story, the testing story, and the bug my wife found that three builds had survived.
