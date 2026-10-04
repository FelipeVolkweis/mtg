# 04: Serve catalog and Decklists from released JSON

**What to build:** Players can search the released Card Catalog and save Decklists using the Git-tracked JSON selected for the running application. A Decklist entry resolves only to an imported Card Definition and printing; a separate full Card Name Directory remains searchable for rules-name choices.

**Blocked by:** 02: Handle multi-face cards and card names.

**Status:** ready-for-agent

- [ ] Catalog lookup and Decklist validation load and validate the released Card Definitions and Card Printings directly, without reading a PostgreSQL catalog row or making a live Scryfall request.
- [ ] An exact printing request resolves to that printing, while an omitted printing selects the designated default for the Card Definition.
- [ ] Decklist text rejects cards or printings absent from the imported catalog, including names found only in the full Card Name Directory.
- [ ] Catalog search and rules-name lookup retain their player-visible behavior, including relevant face and alternate names.
- [ ] The application acceptance seam exercises a fixture-produced catalog through catalog and Decklist consumers with no PostgreSQL catalog row.
