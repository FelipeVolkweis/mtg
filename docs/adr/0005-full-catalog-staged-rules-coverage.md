---
status: accepted
---

# Full catalog with staged rules coverage

The Card Catalog targets the full card pool through incremental set imports into a game-specific model, while catalog availability remains separate from executable rules coverage. Importing a card, form, or keyword does not make its behavior supported; behavior requires authored rules data and validation. Released Match support is defined by [ADR-0016](0016-rules-automated-commander-and-practice.md).

Card Definitions use versioned data and Oracle identity as specified by [ADR-0014](0014-versioned-card-catalog-records.md) and [ADR-0015](0015-oracle-identity-for-card-definitions.md). Card-form modeling constraints live in [Card model guidance](../card-model.md).
