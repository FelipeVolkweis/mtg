# 03: Store structured Card Abilities

**What to build:** Preserve Card Abilities as rules-aligned structured data alongside their printed text, including relationships among abilities, without executing them in a Manual Match.

**Blocked by:** Card Catalog and Rules-Ready Data #02: Import complete card forms and characteristics

**Status:** ready-for-agent

- [ ] A Card Ability record retains its kind and rules text plus applicable trigger, condition, cost, mode, target, variable value, choice, replacement behavior, delayed triggered ability, effect, and references to card/Match context.
- [ ] Triggered abilities distinguish event triggers from state triggers and retain the corresponding event or game-state condition as data.
- [ ] Ability origin distinguishes printed, granted, and rules-derived abilities. Rules-derived abilities can reference reusable rules data instead of being duplicated on every Card Definition.
- [ ] Keywords such as flying, haste, and trample use the common Card Ability model. A printed keyword can link to separate records for each ability defined by the Comprehensive Rules, retaining each applicable Zone and behavior.
- [ ] Preserve linked ability structures for Class level bars, Leveler and Station thresholds, Cases, and Saga chapters; grouped chapter symbols remain separate abilities and a Saga's final chapter is derived from the highest applicable chapter number.
- [ ] Variable Value Source is declarative data that records its source, references, parameters, and Comprehensive Rules timing, not an executable function. Match-time values can be retained as bindings such as `X = N` on the relevant Game Object or Ability Game Object.
- [ ] Reusable rules data can represent intrinsic mana abilities of the five basic land types and Saga lore-counter/sacrifice behavior.
- [ ] Structured data can retain contextual references such as the current Controller's Commander and its Color Identity.
- [ ] Manual Matches store Card Ability data and preserve the rules text without evaluating triggers, calculating variables, or applying abilities.
- [ ] Representative data verifies a state trigger, characteristic-defining ability, multi-part keyword such as Flashback, Saga chapters, and a linked conditional ability structure.
