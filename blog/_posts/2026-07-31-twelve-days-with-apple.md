---
title: Twelve days with Apple's reviewers
slug: twelve-days-with-apple
date: 2026-07-31
series: Get Camino build log · 9 of 10
seriesShort: Camino 9/10
dek: The strictest external review most software ever gets, against a codebase largely written by AI. What four rounds actually caught — and what they didn't.
description: The App Store review gauntlet round by round — a real defect, three AI questions answered by design, a caption edit — and why the standards, not the tooling, were the reason it survived.
---

<figure class="field-card">
<figcaption class="fc-head"><span class="fc-kicker">Twelve days, four rounds</span><span class="fc-sub">The only code-adjacent change: one word, in one caption</span></figcaption>
<ol class="fc-steplist">
<li><span class="fc-num">01</span><div><h4>A real defect</h4><p>A "coming soon to Google Play" pill rendered inside the iOS binary. Now gated web-only, with a regression test.</p></div></li>
<li><span class="fc-num">02</span><div><h4>Three AI questions</h4><p>In-house? Third-party models? Where's consent? Answered in writing — nothing to change, designed in on day one.</p></div></li>
<li><span class="fc-num">03</span><div><h4>One word</h4><p>"Free" in a caption was ruled a price reference. One caption edit.</p></div></li>
<li><span class="fc-num">04</span><div><h4>Silence — then approval</h4></div></li>
</ol>
</figure>

Apple's reviewers spent twelve days going through the app I built in a week. Across four rounds, the only code-adjacent change they demanded was one word, in one screenshot caption.

Get Camino is live on the App Store. Here's what the gauntlet actually looked like — because "we shipped" is the least useful part of the story.

**Round 1 — a real defect, and mine.** The home page's "coming soon to Google Play" pill was rendering inside the iOS binary. Fair rejection. The fix wasn't to delete the pill: the whole band is now gated web-only, with a regression test so rival-store copy can never re-enter a native build again. Fix the class, not the instance.

**Round 2 — no defect.** Three written questions about the AI: is it in-house, does user data reach third-party models, where exactly do users consent? Answered in writing — hybrid architecture, conversation text only (no names, no emails), consent disclosed in Lola's first message. Nothing to change, because those answers were designed in on day one, not assembled for the reviewer.

**Round 3 — one word.** The word "free" in a screenshot caption was ruled a price reference, plus a questionnaire about paid subscriptions the app doesn't have. One caption edit.

**Round 4 — silence.** Then approval.

The detail I keep thinking about: the reviewer is a user too. Our monitoring flagged a sign-in failure on their device (review devices aren't signed into iCloud), and we triaged it exactly like any other user's — recognized, ruled harmless, left on watch. No special case, because there shouldn't be one.

Twelve days of the strictest external review most software ever gets, against a codebase largely written by AI. One caption.

The tooling wrote the code. The standards were the reason it survived contact.
