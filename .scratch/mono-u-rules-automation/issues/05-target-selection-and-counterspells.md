# 05: Choose targets and resolve counterspells

**What to build:** Let players cast targeted instants and respond to spells using shared target controls and correctly resolving Counterspell and Negate.

**Blocked by:** 04: Play lands, produce mana, and cast permanents.

**Status:** ready-for-agent

- [ ] Represent reusable target declarations and Object Filters as typed authored data, including spell and noncreature-spell filters.
- [ ] Show authorized legal targets through shared controls and record selected targets in the pending casting procedure.
- [ ] Support instant casting and responses without bypassing explicit Priority passes or normal payment.
- [ ] Revalidate targets during resolution and follow the rules when targets become illegal or the targeted spell cannot be countered.
- [ ] Counter the selected spell with correct Zone movement and object identity; distinguish the spell from Ability Game Objects on the Stack.
- [ ] Author and verify complete Counterspell and Negate behavior, preserving binary automation status.
- [ ] Test target filtering, Stack order, illegal/stale selections, resolution outcomes, and reconnecting during target selection through the player interface.
