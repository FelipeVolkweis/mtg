# 09: Calculate continuous characteristics and Counters

**What to build:** Make artifact counts, creature bonuses, and Counters affect the effective characteristics displayed and used by rules.

**Blocked by:** 08: Collect triggers and create tokens.

**Status:** ready-for-agent

- [x] Represent active Continuous Effects separately from printed Card Characteristics, retaining sources, applicability, and typed changes.
- [x] Derive effective characteristics centrally with correct ordering and rules classification rather than storing layer labels on every card.
- [x] Support controlled-object counts, self/other exclusions, characteristic-defining values, additive bonuses, and Counter effects.
- [x] Author Chief of the Foundry, Master of Etherium, Steel Overseer, and the relevant stat formulas of Darksteel Juggernaut and Broodstar; incomplete additional abilities keep a card unimplemented.
- [x] Recalculate effective values when sources or recipients enter or leave and preserve appropriate current or last-known values for consumers.
- [x] Apply state-based checks at prescribed checkpoints rather than between every instruction of resolution.
- [x] Expose effective characteristics and Counter results through existing card views and verify interacting sources through player commands.
- [x] Maintain extensible typed changes for later base-stat, type, granted-ability, and duration slices without introducing per-card executable functions.

## Comments

Implemented on 2026-10-04 through the agreed command/player-view seam.

Source-linked Continuous Effects remain separate from printed characteristics. Central calculation composes defining artifact counts, other-object bonuses and Counters. Chief, Master and Overseer are supported; Juggernaut and Broodstar retain partial formulas and remain unimplemented. Checkpoints handle simultaneous zero-toughness deaths, token cleanup and opposing stat counters after complete resolution. Player views hide private sources and display effective stats.

Validation: typechecking passed; the full suite passed all 88 acceptance tests,
including five rules browser tests. Standards review: 0 actionable findings.
Spec review: 0 actionable findings, including the payment-cancellation follow-up.
See `docs/rules-automation.md` and the rules acceptance tests.
