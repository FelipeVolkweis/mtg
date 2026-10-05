---
status: accepted
---

# Local card catalog for play

The game stores card information in its own model and reads that model during play; Scryfall is an import and update source rather than a per-card runtime dependency. This avoids requiring live card lookups during a match and provides structured data suited to authored rules behavior.
