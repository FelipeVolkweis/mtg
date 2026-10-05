# 12: Move objects through costs and resolving effects

**What to build:** Let players bounce and retrieve cards, including returning an artifact to pay Master Transmuter and selecting it again during resolution.

**Blocked by:** 07: Resolve ordered effects with suspended choices; 08: Collect triggers and create tokens.

**Status:** ready-for-agent

- [x] Compose Zone movement, ownership/controller relationships, source/destination filters, and target or resolution-time object selection.
- [x] Author AEther Spellbomb, Buried Ruin, Myr Retriever, and Master Transmuter through reusable costs and effects.
- [x] Keep return-to-Hand costs separate from effects and distinguish casting from putting a card directly onto the Battlefield.
- [x] Retain Card Instance identity while creating new Game Object identities and resetting applicable object state on Zone changes.
- [x] Preserve source and pre-change information needed by death triggers and source-independent Ability Game Objects.
- [x] Verify returning Ichor Wellspring as payment causes no Graveyard trigger, selecting it from Hand is legal during resolution, and its reentry creates a new object and entry trigger.
- [x] Verify optional decline, unavailable choices, owner-directed destinations, hidden Hand selection, and resumed resolution without duplicated moves.

## Comments

Implemented on 2026-10-04 through the agreed command/player-view seam.

Implemented reusable return costs and owner-directed movement, public Graveyard targets and private resolution-time Hand selection. Spellbomb, Buried Ruin, Myr Retriever and Transmuter are authored. Wellspring can return as payment and reenter with its retained Card Instance and a fresh Game Object/entry trigger.

Validation: typechecking passed; the final full suite passed all 109 acceptance
tests, including seven rules browser tests. Standards review: two duplication
findings fixed, no remaining findings. Spec review: no findings. See
[`review-11-15.md`](../review-11-15.md) and `docs/rules-automation.md`.
