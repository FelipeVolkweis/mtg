---
status: accepted
---

# Version card catalog records as per-card JSON

The released Card Catalog consists of Git-tracked JSON: one Card Definition file per Oracle identity with selected imported gameplay fields, current Oracle Text, authored structured Card Abilities, and binary automation status, plus small records for printing identity, set, and artwork. A set import updates only source-owned fields and creates `unimplemented` placeholders; reviewers explicitly mark complete card behavior `implemented`, including keyword abilities whose imported names alone do not make them executable. The application reads these files directly instead of maintaining a second persistent catalog in PostgreSQL, so card changes are reviewable alongside the shared engine primitives that interpret them. A default Printing remains available for Decklists that do not request an exact edition.
