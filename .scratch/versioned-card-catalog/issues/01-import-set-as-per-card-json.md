# 01: Import a set into per-card JSON

**What to build:** A maintainer can import one Scryfall set and review the resulting Card Definitions and Card Printings in Git. Each new, ordinary Card Definition is identified by Oracle ID, contains selected current gameplay facts and Oracle Text, and starts with an empty authored Card Ability area and explicit `unimplemented` status. A small Card Printing record retains the set, collector number, image link, printing ID, and Card Definition reference. Unsupported card forms fail visibly rather than being silently misrepresented.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Importing a fixture set through the maintainer command creates one Card Definition per Oracle ID and a Card Printing for each imported printing; two printings with one Oracle ID share one definition.
- [ ] A new definition retains canonical name, current Oracle Text, imported keywords, mana cost and value, parsed supertypes/types/subtypes, colors, color indicator, Color Identity, and applicable power, toughness, loyalty, and defense. Unrelated Scryfall fields are omitted.
- [ ] Every new definition has an empty authored Card Ability area and explicit `unimplemented` status; imported keywords alone do not create executable abilities or mark a card `implemented`.
- [ ] Printing records retain only the edition identity and display data needed by the catalog, including a usable image link; each Card Definition has a designated default printing.
- [ ] The per-card automation status can be queried to find definitions awaiting implementation.
- [ ] The command reports an unsupported card form or missing Oracle identity without publishing a misleading partial result.
- [ ] The import is verified through the public command and its emitted catalog files using an isolated test catalog, without changing the repository's reviewed catalog during tests.
