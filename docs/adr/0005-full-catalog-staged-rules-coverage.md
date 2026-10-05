---
status: accepted
---

# Full catalog with staged rules coverage

The Card Catalog targets the full card pool through incremental set imports into a game-specific model, while catalog availability remains separate from executable rules coverage. Modeling a card form or importing a keyword does not make its behavior supported; staged authorship and validation allow the catalog to grow ahead of the engine rather than requiring full rules coverage before importing cards.

This decision is partly superseded: [ADR-0014](0014-versioned-card-catalog-records.md) replaces printing-derived gameplay characteristics with versioned Card Definition data, [ADR-0015](0015-oracle-identity-for-card-definitions.md) replaces name-based identity with Oracle identity, and [ADR-0016](0016-rules-automated-commander-and-practice.md) retires manual play and restricts released Matches to supported cards. Full coverage remains a long-term direction rather than the current release scope.

Card-form modeling constraints live in [Card model guidance](../card-model.md). The original sample review remains in [card-model-review.md](../../.scratch/multiplayer-manual-tabletop/card-model-review.md); it records design exploration rather than present automation support.
