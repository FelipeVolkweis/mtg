# Card model guidance

Read when changing Card Catalog or Game Object structures. These are modeling constraints retained from the original card review, not a claim that every represented mechanic is executable. Current release behavior is defined by the [Mono-U Rules Automation issue](https://github.com/FelipeVolkweis/mtg/issues/4); the glossary defines names and the [ADR index](adr/README.md) records decisions and their supersessions.

## Card forms and characteristics

Every Card Component and Alternative Characteristics record uses the same characteristic field model. Printed faces and independently playable halves are Components; Adventure, Omen, Prototype, and Preparation contexts use Alternative Characteristics. Partial alternatives inherit omitted values where the rules leave them unchanged; full alternatives treat omitted values as absent. Preserve double-faced form kind (modal, nonmodal, or meld), face names, and meld composite relationships. Use the front-face name as the canonical Decklist label.

Keep Card Definition gameplay data independent of artwork and default Printing selection (ADR-0014/0015). The Card Name Directory includes alternate and composite names independently of set imports and Decklist eligibility. A named choice need not require a locally imported Card Definition.

## Authored abilities and effects

Retain ability origin and relationships among abilities, including shared conditions and related characteristic changes. Printed Oracle Text is source wording; authored structured abilities describe behavior. Imported keywords and placeholder ability structures do not establish automation support. A keyword representing multiple rules abilities needs each applicable behavior and Zone; Saga chapters carry chapter numbers, with the final chapter derived from the greatest applicable number.

Characteristic-defining abilities remain static abilities declaring their outputs and value sources. Printed stat markers such as `*` remain characteristic values, without reverse references from those fields to formulas. Variable sources describe references, parameters, and determination timing as data; Match bindings retain determined values. Mana symbols and quantities use ordered typed data.

Effects contain ordered semantic parts. Continuous Effects retain source ability, recipients, typed changes, duration, and applicability separately from printed characteristics; rules automation derives layer classifications from those changes. Granted abilities preserve their source and applicable relationship. Object Filters describe eligibility; the using trigger, target, condition, or effect owns characteristic-check timing and last known information. Zone Change Conditions distinguish would-move replacements from completed-move triggers; their actions remain separate.

A Library Sequence records source Zone, operation, stop predicate, selected/rest handling, ordering, and no-match behavior. Reveal, look, and exile remain distinct operations. Captured Copiable Values include exceptions and use immutable characteristic records independent of later changes to the original; each copy retains its own Counters, status, and Attachments.

## Card Definition files

Each Card Definition is one `catalogVersion: 2` file in `catalog/definitions/`, keyed by Oracle identity (ADR-0015), with two sections. The schema is `cardDefinitionFileSchema` in [card-dsl.ts](../src/shared/card-dsl.ts).

- `imported`: the card form (one of the layouts the importer accepts), the Card Components' characteristics, the Color Identity and the default Printing. A set import writes only this section; a diff here is a data refresh. Imported keywords are facts, not rules support (ADR-0005).
- `authored`: the automation status and the abilities in the card DSL. Reviewers own it; a diff here is a rules change, and a set import never touches it.

The file stores no derived value. The [catalog reader](../src/server/catalog/catalog-files.ts) derives them when it loads the file ([derive.ts](../src/server/catalog/derive.ts)), and `CardDefinition` keeps them as fields:

| Value | Rule |
|---|---|
| canonical name | the front face name; split cards join face names with ` // ` |
| mana value | per form: `split` and `room` combine both halves; `transform`, `modal_dfc` and `flip` use the front face; `reversible_card` faces have no combined value |
| keywords | the union over components |
| Oracle Text | component rules text joined with ` // ` |
| type line | `supertypes types — subtypes` per component |

Tokens are definitions in `catalog/tokens/` with the same characteristics and ability model, referenced by id. Counter kinds come from a registry; counters with rules meaning (`+1/+1`, `-1/-1`) carry it there ([registries.ts](../src/server/rules/registries.ts)).

## Card DSL

Authored abilities are the card DSL, version 2 ([card-dsl.ts](../src/shared/card-dsl.ts)). The [Rules Compiler](../src/server/rules/compiler.ts) turns them into the Core AST the engine runs. These design rules hold for every addition:

1. **One CR concept per kind.** Every ability, effect, cost and trigger kind names a Comprehensive Rules concept, never one card's wording.
2. **No dependent fields.** A field valid only for some values of another field means the type is a discriminated union.
3. **Choices are selectors.** A choice during resolution is a `choose` selector, not an effect flag.
4. **Control flow is structural.** "May", "if you do", "unless", "choose one", "for each player" and sequencing are control-flow nodes.
5. **Durations are explicit.** A temporary effect states its duration.
6. **Vocabularies are data.** Tokens, counter kinds and keywords are validated against registries, not schema enums.
7. **Shorthand must desugar.** Concise syntax exists only where the compiler expands it deterministically.
8. **Unsupported means unimplemented.** A card the primitives can't express stays `automationStatus: "unimplemented"` until the missing CR concept is added; there is no card-specific escape hatch.

The compiler validates the schema; resolves references (targets, binding names and types, links, tokens, counter kinds, keywords); checks context (event selectors only in triggered or replacement abilities, `X` only where a cost has `{X}`, CR 605 mana-ability criteria); desugars shorthand and macro keywords (affinity, ward, cycling, equip, crew, living weapon); and tags every continuous change with its CR 613 layer. Keywords that change how a card is cast or paid for (enchant, improvise, kicker, escalate, flashback) stay keyword abilities, read by the casting and cost runtimes. Rule keywords such as flying are lowercase properties the engine checks directly. The fixtures in `tests/fixtures/dsl-expressiveness/` show the DSL across a fixed set of 26 cards. A deck port that needs a concept the DSL lacks adds it to the DSL and compiler first; the card then compiles and stays unimplemented until the runtime runs it ([Mono-G port](plans/mono-g-port.md)).

## Match relationships

The relationships below describe modeling capacity. Under proposed [ADR-0018](adr/0018-runtime-model-carries-supported-capacity.md), only those used by supported cards stay in the runtime model: meld, face-down state, Battle Protector, stickers, Opening-Hand Actions, Captured Copiable Values and variant Zones become catalog-level capacity until a supported card needs them. A removed field returns only with a supported card whose rules need it, a rules test that sets it through gameplay, and a decision on who sees it in the Match view.

Card Instances preserve identity and Owner across Game Object lifetimes; Zone changes generally create fresh Game Objects with rule-specific exceptions. Meld can relate multiple Instances to one Object. Attachments and Object Links are separate relationships. Ability Game Objects have no Card Instance and can retain source references, variable bindings, and relevant Object Links.

Casting Records retain source Zone, choices, and payment facts and remain available when later objects need them. Objects put onto the Battlefield without casting have no Casting Record. Opening-Hand Actions retain whether they occurred and their result. Face-Down State retains underlying identity, applicable characteristics, turning procedures, and inspection permissions. Battle Protector is distinct from Owner and Controller.

Sticker Sheets and Definitions remain separate catalog concepts; availability and ordered placements are Match relationships rather than base characteristics. Supplementary decks and shared variant Zones remain modeling capacity, including multiple active Planes; Scheme lifecycle and Vanguard setup were excluded from the initial design. Future mechanics need explicit sample review and executable validation before release eligibility.

## Sources

- [Git-Versioned Card Catalog issue](https://github.com/FelipeVolkweis/mtg/issues/7): imported/authored ownership and release records.
- [Card DSL](../src/shared/card-dsl.ts) (card vocabulary, definition file and authored abilities), [runtime Match state](../src/shared/rules-state.ts) and [shared model](../src/shared/model.ts) (catalog, Deck, Room and view types): implemented structures.

The former glossary suggestion to choose specialized Zone subclasses was implementation guidance, not a domain definition or a new architectural decision. Consult [zones.ts](../src/server/match/zones.ts) when changing Zone behavior.
