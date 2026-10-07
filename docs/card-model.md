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

## Match relationships

The relationships below describe modeling capacity. Under proposed [ADR-0018](adr/0018-runtime-model-carries-supported-capacity.md), only those used by supported cards stay in the runtime model: meld, face-down state, Battle Protector, stickers, Opening-Hand Actions, Captured Copiable Values and variant Zones become catalog-level capacity until a supported card needs them. See [card-model-refactor.md](plans/card-model-refactor.md).

Card Instances preserve identity and Owner across Game Object lifetimes; Zone changes generally create fresh Game Objects with rule-specific exceptions. Meld can relate multiple Instances to one Object. Attachments and Object Links are separate relationships. Ability Game Objects have no Card Instance and can retain source references, variable bindings, and relevant Object Links.

Casting Records retain source Zone, choices, and payment facts and remain available when later objects need them. Objects put onto the Battlefield without casting have no Casting Record. Opening-Hand Actions retain whether they occurred and their result. Face-Down State retains underlying identity, applicable characteristics, turning procedures, and inspection permissions. Battle Protector is distinct from Owner and Controller.

Sticker Sheets and Definitions remain separate catalog concepts; availability and ordered placements are Match relationships rather than base characteristics. Supplementary decks and shared variant Zones remain modeling capacity, including multiple active Planes; Scheme lifecycle and Vanguard setup were excluded from the initial design. Future mechanics need explicit sample review and executable validation before release eligibility.

## Sources

- [Git-Versioned Card Catalog issue](https://github.com/FelipeVolkweis/mtg/issues/7): imported/authored ownership and release records.
- [Shared model](../src/shared/model.ts) and [rules model](../src/shared/rules.ts): implemented structures.

The former glossary suggestion to choose specialized Zone subclasses was implementation guidance, not a domain definition or a new architectural decision. Consult [zones.ts](../src/server/match/zones.ts) when changing Zone behavior.
