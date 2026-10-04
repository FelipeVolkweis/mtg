# 07: Resolve ordered effects with suspended choices

**What to build:** Let players resolve sequences whose later choices depend on earlier results, including variable draws and alternative discards.

**Blocked by:** 06: Pay activated costs and resolve draw abilities.

**Status:** ready-for-agent

- [x] Extend typed authored compositions with ordered sequences, alternatives, conditions, bound results, and chosen Variable Values.
- [x] Support Pull From Tomorrow's chosen X and draw-then-discard behavior and Thirst for Knowledge's draw-then-alternative-discard behavior.
- [x] Generate later options from the state after earlier instructions, permitting newly drawn cards to be selected.
- [x] Supply the responding player, legal quantity and eligibility constraints, and private explanatory context through shared choice controls.
- [x] Resolve instructions as far as their rules permit when Library or Hand contents are insufficient; distinguish impossible choices from partially possible effects.
- [x] Persist the resolution position and bindings, reject stale answers, and resume without duplicating completed instructions.
- [x] Preserve hidden information and do not grant Priority merely because resolution waits for a choice.
- [x] Verify both cards through real casting and resolution commands, including reconnects and insufficient-card scenarios.

## Comments

Implemented on 2026-10-04 through the agreed command/player-view seam, with
browser reconnect coverage for both spells. Authored sequences, numeric result
bindings, conditions, chosen X and discard alternatives resolve through persisted
Match progress. See `docs/rules-automation.md` and the rules acceptance tests.

Validation: typechecking passed; all 69 acceptance tests passed, including four
rules browser tests. Standards review: no documented breaches or actionable
baseline smells. Spec review: no actionable gaps within ticket 07.
