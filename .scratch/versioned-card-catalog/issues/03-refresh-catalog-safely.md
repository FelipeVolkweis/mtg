# 03: Refresh imports without losing authored abilities

**What to build:** A maintainer can re-import a set to refresh Scryfall-owned gameplay facts while retaining authored Card Abilities and the reviewed automation status. Repeating or failing an import does not damage the released Card Catalog.

**Blocked by:** 01: Import a set into per-card JSON.

**Status:** ready-for-agent

- [ ] Re-importing a changed source record updates only source-owned Card Definition and Card Printing fields; authored Card Ability data and `implemented` or `unimplemented` status stay exactly as reviewed.
- [ ] A nonempty authored ability list does not implicitly change status, and a newly encountered Oracle identity still receives its own `unimplemented` placeholder.
- [ ] The authored area can retain representative primitive-composed Card Ability data, including a keyword with a typed nonmana cost, without treating the imported keyword name as executable behavior.
- [ ] Re-importing unchanged source data adds no duplicate definitions, printings, or placeholders and produces no needless catalog diff.
- [ ] A failed fetch, truncated response, malformed card, or failed validation leaves the previously complete catalog usable and unchanged; no partial set is published.
- [ ] The import fetches and validates the complete set before publishing changes, and the public import acceptance seam verifies preservation and failure behavior against an isolated test catalog.
