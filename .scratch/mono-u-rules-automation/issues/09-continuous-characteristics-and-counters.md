# 09: Calculate continuous characteristics and Counters

**What to build:** Make artifact counts, creature bonuses, and Counters affect the effective characteristics displayed and used by rules.

**Blocked by:** 08: Collect triggers and create tokens.

**Status:** ready-for-agent

- [ ] Represent active Continuous Effects separately from printed Card Characteristics, retaining sources, applicability, and typed changes.
- [ ] Derive effective characteristics centrally with correct ordering and rules classification rather than storing layer labels on every card.
- [ ] Support controlled-object counts, self/other exclusions, characteristic-defining values, additive bonuses, and Counter effects.
- [ ] Author Chief of the Foundry, Master of Etherium, Steel Overseer, and the relevant stat formulas of Darksteel Juggernaut and Broodstar; incomplete additional abilities keep a card unimplemented.
- [ ] Recalculate effective values when sources or recipients enter or leave and preserve appropriate current or last-known values for consumers.
- [ ] Apply state-based checks at prescribed checkpoints rather than between every instruction of resolution.
- [ ] Expose effective characteristics and Counter results through existing card views and verify interacting sources through player commands.
- [ ] Maintain extensible typed changes for later base-stat, type, granted-ability, and duration slices without introducing per-card executable functions.
