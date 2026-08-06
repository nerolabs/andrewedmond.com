---
title: The most productive day was the day nothing got built
slug: invariants-before-features
date: 2026-07-08
series: Get Camino build log · 2 of 10
seriesShort: Camino 2/10
dek: Four rules, written before a single screen — and why invariants matter more when features cost minutes, not sprints.
description: The four invariants behind Get Camino, set before any code was written, and how each one kept absorbing new surfaces as the product grew.
---

<figure class="field-card">
<figcaption class="fc-head"><span class="fc-kicker">Four invariants</span><span class="fc-sub">Written before a single screen</span></figcaption>
<ol class="fc-steplist">
<li><span class="fc-num">01</span><div><h4>Deterministic engine</h4><p>Same profile in, same plan out. No model in that loop.</p></div></li>
<li><span class="fc-num">02</span><div><h4>Derived interview</h4><p>Questions come from the obligation catalog — they can't drift from the data that answers them.</p></div></li>
<li><span class="fc-num">03</span><div><h4>Lola never invents</h4><p>The guide explains, sequences, and encourages. She cannot originate a claim.</p></div></li>
<li><span class="fc-num">04</span><div><h4>Plan is a pure function</h4><p>A user's plan follows from their profile. No hidden state.</p></div></li>
</ol>
</figure>

The most productive day of the build was the day nothing got built.

Before Claude Code wrote a single screen of Get Camino, we wrote the four invariants above — rules the product must never violate, no matter how fast features arrive.

Here's why this matters *more* in the AI era, not less: when features cost minutes instead of sprints, the bottleneck stops being "can we build it" and becomes "will it still be true after we do." An AI will happily generate you a confident liar at incredible speed. Invariants are the difference.

The payoff showed up in surfaces that didn't exist when the rules were written. When Spanish localization landed, invariant #3 extended to translations automatically. When guide pages shipped, it hardened into a build gate: any page whose prose contains a number its cited source doesn't carry fails the deploy. That lint caught its first violation before a user ever saw it.

An invariant that keeps absorbing new surfaces is how you know it was architecture, not ceremony.

Your teams are about to move faster than your review processes can follow. The answer isn't more review. It's fewer, harder rules — written before the speed arrives.
