---
status: accepted
---

# Reusable room decklists

Each Room Participant owns private Decklists stored independently of a Match and reusable for later Matches. Starting a Match creates fresh Card Instances without mutating or revealing the saved list, so Match progress cannot corrupt the reusable Decklist.

[ADR-0016](0016-rules-automated-commander-and-practice.md) supersedes the original two-to-four-ready-player and manual shuffle/draw procedures: released Commander Matches start with two ready humans, or the sole ready human starts Solo Practice, with opening procedures enforced by the engine.
