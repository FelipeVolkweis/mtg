# 01: Import a local card set

**What to build:** Let a maintainer import one card set by set code so its cards are available locally to Decklists and Matches, without requiring live card lookups during play.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] A maintainer can run a command with one set code and import that set's Card Definitions and Card Printings.
- [ ] Same-named regular-Magic printings resolve to one Card Definition; one imported Card Printing is designated as the default, and an exact printing remains identifiable by set code and collector number.
- [ ] A full Card Name Directory is available independently of per-set imports and maps canonical, alternate, face, and composite names to the appropriate card data without making an unimported Card Definition eligible for a Decklist.
- [ ] Further set-code imports can incrementally grow the local catalog toward the full Scryfall card pool; set imports can add names missing from the independent Card Name Directory.
- [ ] Re-importing a set does not duplicate or corrupt records. A failed fetch/import leaves the latest successful local catalog usable.
- [ ] Catalog lookup returns only locally imported Card Definitions and printings for Decklist resolution; no live provider lookup is needed during a Match.
- [ ] An integration test verifies successful import, idempotent re-import, failed-import preservation, and lookup through the local catalog boundary.
