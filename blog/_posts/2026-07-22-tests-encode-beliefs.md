---
title: Tests encode beliefs, and beliefs can be wrong at scale
slug: tests-encode-beliefs
date: 2026-07-22
series: Get Camino build log · 7 of 10
seriesShort: Camino 7/10
dek: Everyone brags that the robots test their app. The part that matters more: a test suite can be perfectly green and loyal to the wrong answer — and four of mine were.
description: The robots test the app — real magic-link sign-in, a 181-profile matrix in CI — and the night an audit found tests loyally protecting the wrong answers.
---

<figure class="field-card">
<figcaption class="fc-head"><span class="fc-kicker">Tests encode beliefs</span><span class="fc-sub">One family bug report. Then the whole rule engine got audited.</span></figcaption>
<div class="fc-stats">
<div class="fc-stat"><span class="fc-figure">181 × 16</span><span class="fc-label">generated profiles × classes of expectation, checked against realistic households</span></div>
<div class="fc-stat"><span class="fc-figure">15</span><span class="fc-label">findings in one night — ten fixed and deployed before morning</span></div>
<div class="fc-stat"><span class="fc-figure">4</span><span class="fc-label">existing tests were asserting bugs as correct behavior — green, and loyal to the wrong answer</span></div>
</div>
</figure>

The robots test my app: sixteen end-to-end journeys against the live staging site on every deploy — "twelve tests, twelve seconds" when the suite first landed. It grew. That's what test suites are supposed to do.

Sign-in runs through the real magic-link machinery — no test backdoor, because a test-only backdoor would be testing the backdoor. The suite's very first run caught a React hydration error firing on every page load. Humans had scrolled past it for days.

That's the part every AI-build post brags about. Here's the part that matters more: tests encode beliefs, and beliefs can be wrong at scale.

When a family tester found the engine giving a Spanish citizen the foreign-national registration form, we didn't just fix the bug. We audited every rule in the catalog against 181 generated profiles and 16 classes of expectation. Fifteen findings in one night.

The uncomfortable four: four existing tests were *asserting* bugs as correct behavior — green checkmarks faithfully protecting the wrong answer. One test persona, modeled on the exact household that reported the bug, had the bug baked into its expectations. The suite wasn't lying. It was loyal to what we'd believed when we wrote it.

So the audit became infrastructure: the 181-profile matrix now runs in CI on every push, and any fix that changes behavior starts by grepping the tests for assertions that encode the old behavior.

Today: roughly 4,100 lines of test code against 14,500 of application code. The AI wrote most of both, in minutes each. Deciding what the tests should believe — and re-interrogating those beliefs when reality disagreed — that stayed human.

Hand-testing stops scaling exactly when the product starts working. So does trusting your own test suite.
