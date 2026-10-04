# 03: Advance turns through explicit Priority passes

**What to build:** Make turn progression, basic turn procedures, and explicit human Priority passes work through shared state and visible player controls.

**Blocked by:** 02: Configure Commander Matches.

**Status:** ready-for-agent

- [x] Advance active player, phases, and steps through rules rather than arbitrary manual Turn State edits.
- [x] Perform untapping, required drawing, first-turn draw handling, and ordinary cleanup at their prescribed times.
- [x] Show whose Priority it is and provide an explicit pass control only to the authorized human Match Player.
- [x] Advance an empty Stack or end a step only after the required pass sequence; reset passes when a legal intervening action requires it.
- [x] Handle checkpoints for waiting triggers and state-based actions without granting Priority in steps that do not normally provide it.
- [x] Expire ordinary mana pools and reset relevant turn markers at the appropriate transitions as those state fields are introduced.
- [x] Verify ordered server revisions, out-of-turn rejection, private draws, and turn progression through the command/view seam.

## Comments

Implemented on 2026-10-04 through the server command/player-view seam, with browser coverage for shared controls and persisted choices. See [rules automation notes](../../../docs/rules-automation.md), `tests/rules.spec.ts`, and `tests/rules-ui.spec.ts`.

Validation: typechecking passed. The full acceptance run passed 59/60; the catalog fixture-size assertion was corrected and its file passed 2/2 on rerun. Post-review rules, browser, and identity checks passed 35/35. Standards review found no hard violations; both duplication findings were fixed. Spec review found no substantive gaps within tickets 01–06.
