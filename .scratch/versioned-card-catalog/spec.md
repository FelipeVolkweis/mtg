# Git-Versioned Card Catalog

Status: ready-for-agent

## Problem Statement

The maintainer currently imports a set into a PostgreSQL catalog that is separate from the application's Git revision. A fresh installation can receive different card data from Scryfall, and card-data changes cannot be reviewed alongside the code that will eventually interpret structured Card Abilities. The current importer also stores only a subset of the gameplay data needed for that work. The maintainer needs a local, reviewable Card Catalog that can grow one set at a time while leaving authored ability behavior intact when source facts are refreshed.

## Solution

Import a Scryfall set into Git-tracked, game-specific JSON. Store one Card Definition file per Oracle identity, containing selected current Oracle gameplay fields and a separate area for authored primitive-based Card Ability data. New definitions begin with a machine-queryable `unimplemented` status; a reviewer explicitly marks a fully covered card `implemented`. Store small Card Printing records for edition identity, set, collector number, artwork link, and their Card Definition relationship. The application reads the released JSON directly for catalog lookup, Decklist resolution, and Match creation. Maintainers review catalog changes before releasing them.

## User Stories

1. As a maintainer, I want to import one set by code, so that I can grow the available card pool deliberately.
2. As a maintainer, I want each imported Card Definition in its own JSON file keyed by Oracle identity, so that one card's changes are easy to find and review.
3. As a maintainer, I want the importer to retain only gameplay-relevant Scryfall fields, so that source records do not fill the repository with prices, rankings, and vendor data.
4. As a maintainer, I want current Oracle Text kept with the Card Definition's ability placeholder, so that the source wording and authored interpretation can be inspected together.
5. As a maintainer, I want the importer to parse card types, supertypes, and subtypes, so that game logic can consume them as structured characteristics.
6. As a maintainer, I want card layouts and faces preserved, so that multi-faced cards retain their distinct characteristics and names.
7. As a maintainer, I want an import to create an `unimplemented` placeholder for every new Card Definition, so that automation work can be discovered without hand-creating files.
8. As a card-data author, I want to query Card Definition files by automation status, so that I or an LLM can find cards awaiting implementation.
9. As a card-data author, I want Card Abilities expressed through reusable engine primitives in JSON, so that behavior is reviewable without separate executable code for every card.
10. As a card-data author, I want missing reusable primitives added to shared engine code, so that multiple cards can use the same behavior.
11. As a card-data author, I want imported keyword names retained as source facts, so that I can identify keyword abilities without treating the names alone as executable behavior.
12. As a card-data author, I want keyword costs, conditions, and effects represented as implementable Card Abilities, so that a cost such as Ward—Blight 2 can be modeled without assuming all Ward costs are mana.
13. As a card-data author, I want an incomplete card to remain `unimplemented`, so that partially authored data is not mistaken for full rules support.
14. As a reviewer, I want to set `implemented` explicitly after reviewing the card's required behavior, so that a nonempty ability list never implies complete support.
15. As a maintainer, I want a re-import to update only imported fields, so that manually authored abilities and automation status survive source refreshes.
16. As a maintainer, I want re-importing unchanged source data to leave the Card Catalog unchanged, so that retries do not produce noisy diffs or duplicate definitions.
17. As a maintainer, I want a failed fetch, validation, or import to preserve the last complete catalog, so that an interruption does not leave half an imported set.
18. As a maintainer, I want printings of one Oracle identity linked to one Card Definition, so that reprints share current gameplay characteristics and authored rules data.
19. As a maintainer, I want distinct Oracle identities kept distinct even when names match, so that name collisions do not merge unrelated records.
20. As a player, I want a Card Printing's image and set retained, so that I can still see and select the imported edition.
21. As a player, I want Decklist text to resolve against the released local Card Catalog, so that a successful Decklist contains only imported Card Definitions and printings.
22. As a player, I want an exact printing request to remain exact and an omitted printing to use a designated default, so that existing Decklist behavior remains predictable.
23. As a player, I want Manual Matches to use every imported card without a live Scryfall lookup, so that manual play works regardless of automation status or provider availability.
24. As a player, I want Rules-Automated Matches to admit only supported cards, so that an imported keyword or placeholder does not promise behavior the engine cannot provide.
25. As a player, I want the full Card Name Directory to remain separate from Decklist eligibility, so that rules-recognized names can be chosen without making unimported cards playable.
26. As a deployer, I want a reviewed Git revision to determine the runtime Card Catalog, so that application code and card data are released together.
27. As a deployer, I want catalog lookup to read released JSON without a second persistent PostgreSQL catalog, so that deployment does not require synchronizing two catalog copies.

## Implementation Decisions

- Keep Scryfall as the initial import and update source. The maintainer command imports one set code per run, and its output is reviewed in Git before release. There are no live per-card provider lookups during a Match.
- Store one Card Definition JSON file per Oracle identity. Use Scryfall's printing ID for a specific Card Printing and Oracle identity to join printings and authored behavior; keep canonical name as the Decklist label. Layouts without a card-level Oracle ID need an explicit identity mapping rather than a name-based fallback.
- Keep the Card Definition's current Oracle Text, selected imported gameplay fields, authored ability data, and binary automation status in that card's file. The importer owns only imported fields; it must not modify authored data or status when refreshing source fields.
- The initial source-field boundary includes Oracle identity, canonical name, layout and faces, Oracle Text, keywords, mana cost and mana value, parsed supertypes/types/subtypes, colors and color indicator, Color Identity, and applicable power, toughness, loyalty, and defense. Preserve necessary face relationships and card-form metadata. Exclude prices, rankings, vendor links, and cosmetic printing fields from this first import.
- Keep Card Printing data separate and small: printing identity, set code, collector number, artwork link, and Card Definition reference. One designated default printing serves a Decklist entry without an exact printing. Gameplay characteristics come from the Card Definition, not a default printing.
- Create a Card Definition file with `unimplemented` status for each newly encountered Oracle identity. The only automation states are `unimplemented` and `implemented`. Partial work stays `unimplemented`; a reviewer sets `implemented` explicitly after all required behavior is covered.
- Treat imported keyword names as facts about the card, not executable Card Abilities. Keyword and nonkeyword behavior use the same structured Card Ability model. Shared engine primitives implement reusable rules, while the card's authored data composes them with typed costs, conditions, and effects. A missing primitive leaves the card `unimplemented`.
- Re-imports must be idempotent and change only affected card and printing records. Fetch and validate the complete set before publishing file changes; a failed operation preserves the previous complete catalog and authored fields.
- The runtime catalog loader reads and validates the released JSON files for catalog lookup, Decklist resolution, and Match creation. Remove the PostgreSQL catalog as a runtime source of truth while retaining PostgreSQL for Room and Match state.
- Preserve the independently available Card Name Directory and its separation from locally imported Decklist eligibility. Its released representation may be separate from the per-card files.
- Keep Catalog availability separate from rules automation coverage: imported cards remain usable in Manual Matches, and only cards with supported behavior enter a Rules-Automated Match.
- This spec changes catalog storage and authoring structure; it does not implement the rules engine or fill ability data for the imported card pool.

## Testing Decisions

- Use one high-level contract seam: run the maintainer import against a local Scryfall fixture, then inspect the produced released JSON and the catalog as seen by its Decklist and Match consumers. The existing catalog acceptance test already exercises import, re-import, failed-provider preservation, catalog lookup, and name lookup through this seam; extend it instead of testing private parsers or filesystem helpers independently.
- Run file-writing tests against an isolated temporary catalog root, never the repository's reviewed catalog files. Validate the emitted card and printing records as public output, and verify that the application can read those files without a PostgreSQL catalog row or live Scryfall access.
- Test one new Oracle identity, two printings sharing one Oracle identity, distinct Oracle identities sharing a name, and representative multi-face data. Verify stable identifiers, parsed types, imported fields, artwork links, exact-printing lookup, default-printing lookup, and Decklist rejection of unavailable cards.
- Re-import after adding authored ability data and marking a card `implemented`; change an imported source field and verify that only source-owned fields update. Re-import unchanged data and verify no duplicate card or placeholder and no needless file diff.
- Simulate a failed fetch, truncated bulk response, malformed source card, and failed validation. The previously released catalog must remain usable through the same consumers after each failure.
- Verify that new cards start `unimplemented`, a nonempty ability list does not change status automatically, and imported keywords—including a keyword with an unsupported nonmana cost—do not count as automated behavior.
- Keep tests focused on externally visible catalog and play eligibility behavior. Representative rules structures may be validated through catalog output, but executing individual primitives belongs to future rules-engine tests.

## Out of Scope

- Implementing rules primitives, completing per-card ability JSON, or making Rules-Automated Matches playable.
- Automatic translation of Oracle prose or keyword parameters into executable behavior.
- Historical printed wording, printing-specific gameplay overrides, and detailed handling of edition differences beyond retained printing identity and art.
- Pinning active Matches to catalog revisions and automatic review flags when imported Oracle Text changes.
- Migrating preexisting persisted Rooms, Decklists, or Matches that refer to the current random Card Definition IDs; plan that separately before an existing installation adopts the new catalog.
- Scheduled imports, background refresh, or live Scryfall lookups during play.

## Further Notes

- This spec refines the [Card Catalog and Rules-Ready Data](../card-catalog-data/spec.md) effort and follows [ADR-0014](../../docs/adr/0014-versioned-card-catalog-records.md) and [ADR-0015](../../docs/adr/0015-oracle-identity-for-card-definitions.md). The current implementation writes one PostgreSQL JSON document and creates random Card Definition IDs; changing those consumers is part of this feature.
- The current provider fixture does not contain Oracle IDs or keyword fields; extend it to exercise the new contract.
