---
title: The code was correct. The platform didn't care.
slug: operational-excellence-with-ai
date: 2026-07-15
series: Get Camino build log · 5 of 10
seriesShort: Camino 5/10
dek: Four production lessons an AI wrote the fixes for in minutes — and would never have known to look for. Operational excellence is customer obsession by another name.
description: Four production ops lessons from an AI build — in-memory counters on serverless, wide-open CORS defaults, a staging DB baked into prod, and dead source links.
---

<figure class="field-card">
<figcaption class="fc-head"><span class="fc-kicker">Measured before believing</span><span class="fc-sub">Platform defaults the code review didn't catch</span></figcaption>
<div class="fc-stats">
<div class="fc-stat"><span class="fc-figure">70→0</span><span class="fc-label">requests in a burst, zero throttles — the limiter's counters lived in memory on a serverless runtime that recycles workers</span></div>
<div class="fc-stat"><span class="fc-figure">CORS</span><span class="fc-label">default answer was wide open to any origin — now pinned to our own, checked in production</span></div>
<div class="fc-stat"><span class="fc-figure">55</span><span class="fc-label">official source links fetched and verified; two had quietly died</span></div>
</div>
</figure>

Our rate limiter passed review. Then seventy requests in a burst produced zero throttles.

This is why, when you build with AI, scrutiny on operational excellence matters so much. A live engineering team makes these same mistakes. Obsessing over operational excellence *is* obsessing over customers — as much as any UX or feature polish.

The code was correct. The platform didn't care. The counters lived in memory, and the serverless runtime quietly recycles workers — so the limiter was resetting itself all day. The fix was durable database counters, which now trip at exactly their limit. Verified against the real production runtime, not against the docs.

That was the week's real ops lesson, and it repeated three times:

- The platform's default CORS answer was wide open — any website could call our AI endpoint from a stranger's browser. Now pinned to our own origins, checked in production.
- One early build silently baked the staging database into production. The fix became a permanent guard: the deploy script sources the pulled env, wipes caches, and prints exactly what it baked.
- All 55 official source links got fetched and checked against their steps. Two failed honestly — one government portal had been retired, and one link dumped visitors on a cookie wall. Both now point where they should.

Measured before believing. The platform you deploy on is a set of facts, not a set of promises — and an AI collaborator inherits your platform's defaults exactly as cheerfully as it inherits your intentions.

The AI wrote every one of these fixes in minutes. Knowing to burst-test the limiter, read the CORS headers in production, and print what the deploy baked — that judgment was the slow part, and it's decades older than the tooling.
