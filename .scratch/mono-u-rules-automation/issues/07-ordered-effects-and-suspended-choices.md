# 07: Resolve ordered effects with suspended choices

**What to build:** Let players resolve sequences whose later choices depend on earlier results, including variable draws and alternative discards.

**Blocked by:** 06: Pay activated costs and resolve draw abilities.

**Status:** ready-for-agent

- [ ] Extend typed authored compositions with ordered sequences, alternatives, conditions, bound results, and chosen Variable Values.
- [ ] Support Pull From Tomorrow's chosen X and draw-then-discard behavior and Thirst for Knowledge's draw-then-alternative-discard behavior.
- [ ] Generate later options from the state after earlier instructions, permitting newly drawn cards to be selected.
- [ ] Supply the responding player, legal quantity and eligibility constraints, and private explanatory context through shared choice controls.
- [ ] Resolve instructions as far as their rules permit when Library or Hand contents are insufficient; distinguish impossible choices from partially possible effects.
- [ ] Persist the resolution position and bindings, reject stale answers, and resume without duplicating completed instructions.
- [ ] Preserve hidden information and do not grant Priority merely because resolution waits for a choice.
- [ ] Verify both cards through real casting and resolution commands, including reconnects and insufficient-card scenarios.
