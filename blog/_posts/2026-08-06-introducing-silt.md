---
title: You shouldn't have to pick two
slug: introducing-silt
date: 2026-08-06
series: Building in the open
dek: Announcing silt — an encrypted storage network built to hold privacy, accountability, and Sybil-resistance at once. Including the one keystone problem we haven't solved.
description: silt is a distributed, encrypted storage network built to keep three things systems usually trade against each other — with an honest account of what's closed, what's held in tension, and what's still open.
---

<figure class="field-card">
<figcaption class="fc-head"><span class="fc-kicker">The bet</span><span class="fc-sub">Most systems hold two of these. silt is built to hold all three.</span></figcaption>
<ol class="fc-steplist">
<li><span class="fc-num">◆</span><div><h4>Privacy</h4><p>Your files — and even your access patterns — stay yours. KYC-and-logging systems give this up.</p></div></li>
<li><span class="fc-num">◆</span><div><h4>Accountability</h4><p>Bad actors can still be held responsible. Fully anonymous systems give this up.</p></div></li>
<li><span class="fc-num">◆</span><div><h4>Sybil-resistance</h4><p>One actor can't cheaply forge thousands of identities and seize the network. Open systems give this up.</p></div></li>
</ol>
</figure>

Almost every system that stores your data quietly makes you give up one of three things: your privacy, the ability to hold bad actors accountable, or resistance to being overrun by fake identities. Pick two. That's not a law of nature — it's just where the trade-offs usually land.

silt is a bet that you can keep all three.

## What silt is

silt is a distributed, encrypted storage network. Your files are encrypted and erasure-coded — split into redundant shards spread across many independent operators — so that no single operator can read your data, and no single operator losing shards can lose your file. Trust between strangers is established without a token or a coin: through reputation and quorum, not a cryptocurrency.

It's early, and we're building it in the open. That means sharing the thinking — including the parts we haven't finished.

## The turn

For a while, the work was a losing loop. Design a mechanism to stop fake identities; the red team breaks it; design a stronger one; they break it again. It turns out that loop is unwinnable by construction — a result from 2002 (Douceur) shows no single primitive can be Sybil-proof in an open system with no permanent central authority. We weren't failing to find the answer. We were asking a question that has none.

The unlock wasn't a better lock. It was changing the win condition. You don't *prevent* fake identities — you *re-price* them. You make forging *N* identities cost as much as honestly being *N* operators. You hold the corner with composition and economics, not with a single magic primitive.

When you keep losing the same fight, it's worth checking whether the game is winnable before you grind harder.

## How we keep ourselves honest

In a system people are asked to trust, the most dangerous thing you can say is "solved." A false "solved" is the failure that gets someone hurt. So we track every claim in one of three buckets — **closed**, **held-in-tension** (bounded and documented, but not eliminated), and **open** — and the list of things we *haven't* solved is a first-class artifact, maintained as carefully as the code.

Precision about your limits isn't humility theater. For anything built on trust, it's the core engineering discipline.

## Where we actually are

Not shipped. This is a design-and-early-build announcement, not a launch. The hard conceptual questions are largely closed or explicitly bounded — the core thesis is written down as a falsifiable claim and stress-tested against an adversarial process.

And one keystone primitive is still open — and I can tell you exactly what it is. We can't yet cryptographically bind a stored shard to a single identity, so we're deliberate about where an operator's standing comes from. We know what's missing and why. Naming that out loud is the point, not a slip.

## Build blind, then reconcile

One more lesson, because it's how the rest got done. The work runs as separate streams that stay blind to each other on purpose: one that builds, one that only tries to break, and one that goes deep on the theory. They don't coordinate in real time — they're reconciled afterward. Keeping them blind kills the groupthink where whoever built a thing also grades it. Disagreement between the streams isn't friction; it's the most valuable output.

They were run as orchestrated AI agents, with a human owning the decision ledger and the honesty calls. But the discipline is the point, not the tooling.

## What's next

We're building silt in the open at [silthq.com](https://silthq.com). No sign-up, nothing to buy yet — just the work, and an honest account of what's closed, what's held, and what's still open. If that's the kind of thing you like to watch get built, follow along.
