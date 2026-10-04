# 12: Move objects through costs and resolving effects

**What to build:** Let players bounce and retrieve cards, including returning an artifact to pay Master Transmuter and selecting it again during resolution.

**Blocked by:** 07: Resolve ordered effects with suspended choices; 08: Collect triggers and create tokens.

**Status:** ready-for-agent

- [ ] Compose Zone movement, ownership/controller relationships, source/destination filters, and target or resolution-time object selection.
- [ ] Author AEther Spellbomb, Buried Ruin, Myr Retriever, and Master Transmuter through reusable costs and effects.
- [ ] Keep return-to-Hand costs separate from effects and distinguish casting from putting a card directly onto the Battlefield.
- [ ] Retain Card Instance identity while creating new Game Object identities and resetting applicable object state on Zone changes.
- [ ] Preserve source and pre-change information needed by death triggers and source-independent Ability Game Objects.
- [ ] Verify returning Ichor Wellspring as payment causes no Graveyard trigger, selecting it from Hand is legal during resolution, and its reentry creates a new object and entry trigger.
- [ ] Verify optional decline, unavailable choices, owner-directed destinations, hidden Hand selection, and resumed resolution without duplicated moves.
