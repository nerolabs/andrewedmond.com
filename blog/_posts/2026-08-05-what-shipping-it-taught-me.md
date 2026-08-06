---
title: What shipping it taught me
slug: what-shipping-it-taught-me
date: 2026-08-05
series: Get Camino build log · 10 of 10
seriesShort: Camino 10/10
dek: Ten notes on: what held up, what I'd change, and why the typing got cheap but the judgment never did.
description: The last note in the series — what held up (skills, invariants, truth as a build gate), what I'd do differently (instrument sooner, kill features faster), and the honest headline.
---

<figure class="field-card">
<figcaption class="fc-head"><span class="fc-kicker">What shipping it taught me</span><span class="fc-sub">Ten notes, one honest headline</span></figcaption>
<div class="fc-ledger">
<div><h4>What held up</h4><ul><li>Decades of engineering judgment</li><li>Rules written before the first screen</li><li>Truth as a build gate, not a value</li></ul></div>
<div><h4>What I'd do differently</h4><ul><li>Instrument on day one, not day six</li><li>Kill features faster</li><li>More grace for techniques learned on the way</li></ul></div>
</div>
</figure>

Ten notes ago I said I hadn't written production code in 15 years, and that I'd built and shipped a real product anyway. It's live on the App Store now. This is the last note in the series, so: what it actually taught me, and what I'd do differently.

**What held up:**

- The engineering skills built up over decades mattered. AI wrote the code faster and better than I would have — but the judgment I applied along the way was critical to the outcome.
- Writing the rules before the first screen. The invariants I set on day one were the same questions Apple asked in review three weeks later. Nothing was assembled for the reviewer, because it had been decided already.
- Treating truth as a build gate, not a value. "Be accurate" is a poster. A lint that fails the deploy is a system.

**What I'd do differently:**

- I'd give myself more grace for not knowing all the "cutting edge" AI techniques I ended up learning on the way — skills, grill-me sessions, efficient use of persona-bound agents. I didn't have *those* specific skills on day one. I do now.
- I'd instrument on day one, not day six. I spent a week improving things based on my own taste. The funnel had a different opinion, and it was right — I'd already shipped opinions I could have measured.
- I'd kill features faster. Retiring Lola's voice took three weeks longer than the evidence did.

The honest headline: AI didn't make me a better engineer. It removed the cost of my rustiness. Everything that made this ship — knowing what to verify, what to sequence, what to refuse — came from decades of watching software go wrong. The typing got cheap. The judgment didn't.

Thank you to Trevor Salmon, who was building RooTrue.ie with the same tools in the same season, and whose generosity got me over the early walls.
