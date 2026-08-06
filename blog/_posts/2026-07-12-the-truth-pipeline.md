---
title: The truth pipeline
slug: the-truth-pipeline
date: 2026-07-12
series: Get Camino build log · 4 of 10
seriesShort: Camino 4/10
dek: For an app that tells people what the law requires of them, being right can't be a value on a poster. It has to be a system that refuses to ship the alternative.
description: How a three-step pipeline — source at scale, ground in primary sources, gate the build — turns hallucination from a prompt problem into a systems problem.
---

<figure class="field-card">
<figcaption class="fc-head"><span class="fc-kicker">Right is a process</span><span class="fc-sub">How a fact earns its way into Get Camino</span></figcaption>
<ol class="fc-steplist">
<li><span class="fc-num">01</span><div><h4>Source at scale</h4><p>15 hours of expert webinar transcripts, mined by parallel agents. The catalog grows to 60 obligations.</p><p class="fc-note">Fast and broad — but not yet trustworthy.</p></div></li>
<li><span class="fc-num">02</span><div><h4>Ground in primary sources</h4><p>28 uncited obligations re-verified against the law itself: the BOE, the tax agency, the DGT.</p><p class="fc-note">Caught: a penalty the courts had struck down. A form that no longer exists.</p></div></li>
<li><span class="fc-num">03</span><div><h4>Gate the build</h4><p>No page may state a number its cited source doesn't carry. The lint fails the deploy.</p><p class="fc-note">First run: caught a violation before any user saw it.</p></div></li>
</ol>
</figure>

My app tells people what the Spanish government requires of them. "Mostly right" isn't a quality bar here — a wrong fact is someone missing a residency deadline.

So the most important system in Get Camino isn't a feature. It's the process that decides what's true.

**Step 1 — Source at scale.** Claude mined 15 hours of expert webinar transcripts with parallel agents, growing the catalog to 60 obligations. Fast, broad — and not yet trustworthy.

**Step 2 — Ground everything.** 28 of those obligations arrived without primary citations. Every single one got re-verified against the actual source: the BOE, the tax agency, the DGT. Not blogs quoting blogs. The law itself.

That pass caught two things no prompt would have: a penalty that a court had struck down (still cited all over the expat internet), and a form that had been abolished. The web remembers rules that no longer exist. An AI trained on the web remembers them too.

**Step 3 — Make truth a build gate.** The honesty rule — no page may state a number its cited source doesn't carry — stopped being a value and became a lint that fails the deploy. On its first run it caught a violation before any user ever saw it.

Here's the lesson I'd offer every leader shipping LLM products: hallucination is not a prompt-engineering problem. It's a systems-design problem. You don't ask the model to be honest. You build a pipeline where dishonesty can't ship.

AI collapsed the cost of drafting 60 obligations. It did nothing to collapse the cost of one of them being wrong.
