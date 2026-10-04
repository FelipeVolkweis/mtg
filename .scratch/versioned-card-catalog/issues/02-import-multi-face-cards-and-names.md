# 02: Handle multi-face cards and card names

**What to build:** A maintainer can import set cards whose gameplay characteristics belong to multiple faces or alternative forms, and players can still find rules-recognized card names without making unimported cards Decklist-eligible. Distinct Oracle identities remain distinct even when their names match.

**Blocked by:** 01: Import a set into per-card JSON.

**Status:** ready-for-agent

- [ ] Representative multi-face records retain their layout, face names, face-specific characteristics, and relationships in one Card Definition per Oracle identity.
- [ ] Layouts without a card-level Oracle ID use an explicit, stable identity mapping; no name-based fallback merges unrelated Card Definitions.
- [ ] Two different Oracle identities with the same canonical name remain distinct, while printings of one Oracle identity still share one Card Definition.
- [ ] The full Card Name Directory has a released representation independent of the imported Card Catalog, including applicable alternate and composite names; directory membership alone does not make an unimported card available to a Decklist.
- [ ] A fixture import and catalog/name lookup verify the representative card forms and name relationships through the existing high-level acceptance seam.
