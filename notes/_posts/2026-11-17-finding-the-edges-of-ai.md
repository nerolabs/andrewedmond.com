---
title: Finding the edges of AI
slug: finding-the-edges-of-ai
date: 2026-11-17
linkedin: https://www.linkedin.com/feed/update/urn:li:activity:7528501081086029825/
photo: /notes/assets/finding-the-edges-of-ai.jpg
photoAlt: Andrew at his desk, with silt's website and its GitHub repository on his monitors.
description: Camino taught me that AI makes simple things fast. silt, a storage network with no central servers, showed me where its limits are.
---

Weekly Lab Notes (Nov 17): This summer I learned to build with AI. Then, I tried to get AI to make something I thought was impossible for a human, though maybe possible for a machine.

In June I hadn't written production code in 15 years. Get Camino, a guide for people moving to Spain, was my classroom. Twenty-five days after the first line of code, it was on the App Store. I wrote extensively about it on LinkedIn.

So, feeling somewhat confident, I raised the scope by an order of magnitude, to see how far we could go. I set out to build something I've been dreaming of for 20 years since GridNetworks - a storage network with no central servers. Files spread across strangers' machines, encrypted, with a chain that rewards honest storage and a consensus process for takedowns, a trust layer that was built in that modern 2026 academic computer science research still hasn't fully solved. These days we'd call it BitTorrent + Bitcoin: totally distributed, decentralized, high trust file storage. I called it "silt".

For two months, many hours a day, I built it with AI. 1,193 commits. 216,787 lines of Go, 70% of them tests. AI co-wrote 98.9% of the code, and I tirelessly code reviewed, gave feedback, and problem solved, across five frontier models from two frontier labs, and at the end ... an eight-agent team. I yelled at my AI more than once. I even switched to voice input when I got really frustrated at it, just to literally "get it off my chest"

On 22 September I shelved it, throwing away months of effort as "can't do it". I found either my limits, or AI's limits. The distributed storage network was actually pretty easy - I have a prototype of it up and running today. The decentralized trust layer broke me, and broke every AI effort I threw at it.

Building a full distributed trust layer for storage networks without money incentives is hard, maybe impossible, but I had fooled myself to thinking it was working, for a short time, anyway. I asked AI to go past the current academic research on the topic, and it did, but not by very far. BTW, you would not believe the amount of academic research in this space!

As I/we learned, the system was so complex that the AI didn't just... write bugs. It told me, confidently, that they were fixed. This wasn't normal AI hallucination though, this was a project SO complex that AI itself couldn't keep the problem in it's own working space well enough to see the shape of what we were attempting to build.

Camino taught me that AI makes simple things fast. silt taught me that AI has it's limits, but I'm glad I found the edges of where those limits lie. I do plan to go back to the project in a year or two to see if future AI models can actually solve the problem.

Have you pushed AI building to it's limits?

Still building.
