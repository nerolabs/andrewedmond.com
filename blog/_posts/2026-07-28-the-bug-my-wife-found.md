---
title: The bug my wife found
slug: the-bug-my-wife-found
date: 2026-07-28
series: Get Camino build log · 8 of 10
seriesShort: Camino 8/10
dek: A ducked-audio bug that three builds had survived, the smallest turn-taking fix — and the far harder call to delete the feature it lived in.
description: A ducked-audio bug that survived multiple builds, the turn-taking fix, and the harder decision — retiring Lola's voice because the observed experience never fit.
---

<figure class="fc-quote">
<p>Sunk cost is not a product argument. The verdict was in the watching, not in the effort.</p>
<p class="fc-attrib">Three weeks in, we retired Lola's voice entirely</p>
</figure>

The most precise bug report of the build didn't come from the AI, the tests, or the simulator. It came from my wife.

Five rounds of family testing — real relatives, real phones — and round four produced a diagnosis worthy of a QA veteran (she is one): Lola's voice wasn't broken, it was *ducked*. Opening the microphone lowered her volume, and the duck was never released — so everything after went quiet. The bug had survived multiple builds, because in a simulator with no real microphone session, it doesn't exist.

The fix was explicit turn-taking: opening the mic cuts Lola's line outright; every later line plays at full volume. Round five added the companion rule I now apply everywhere — every waiting state needs an exit. No spinner lives past 35 seconds. The mic cue appears only when the mic is actually hot, because fast talkers were losing their first words to a cue that lied.

And then the honest ending: three weeks in, we retired Lola's voice entirely.

Not because the engineering failed — the server proxying, the caching, the turn-taking all worked. Because the *observed* experience never fit. Watching real people tap briskly through a three-minute interview, the spoken voice was theater: charming in the demo, skipped in reality. Dictation stayed; performance went.

Killing it stung. The sunk engineering argued loudly for keeping it. Sunk cost is not a product argument — the verdict was in the watching, not in the effort.

AI made the feature cheap to build. It made it exactly zero percent easier to admit the feature shouldn't exist.
