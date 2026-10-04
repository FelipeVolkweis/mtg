# 06: Pay activated costs and resolve draw abilities

**What to build:** Let players choose and pay activated costs, then resolve draw and mana abilities even when payment removes the source.

**Blocked by:** 05: Choose targets and resolve counterspells.

**Status:** ready-for-agent

- [x] Compose typed mana, tap, sacrifice, discard, and life costs with reusable object selections and semantic draw effects.
- [x] Preserve the distinction between tap-symbol costs and tapping selected untapped objects, including applicable creature restrictions.
- [x] Create Ability Game Objects with sufficient source information to resolve after their source is sacrificed or changes Zones.
- [x] Support the applicable activations of Mind Stone, Hedron Archive, Silver Myr, Palladium Myr, Ornithopter of Paradise, Arcane Signet, and War Room.
- [x] Support cycling from Hand for Lonely Sandbar and Remote Isle; their tapped-entry behavior remains required before their definitions become fully implemented.
- [x] Calculate War Room's life payment and Arcane Signet's permitted colors from recorded commander Color Identity, wherever the commander currently is.
- [x] Validate complete costs and legal payment order; reversed illegal actions must not create effects, triggers, or duplicated resources.
- [x] Verify shared payment controls, private draws, source-independent resolution, and resuming a pending activation through the command/view seam.

## Comments

Implemented on 2026-10-04 through the server command/player-view seam, with browser coverage for shared controls and persisted choices. See [rules automation notes](../../../docs/rules-automation.md), `tests/rules.spec.ts`, and `tests/rules-ui.spec.ts`.

Validation: typechecking passed. The full acceptance run passed 59/60; the catalog fixture-size assertion was corrected and its file passed 2/2 on rerun. Post-review rules, browser, and identity checks passed 35/35. Standards review found no hard violations; both duplication findings were fixed. Spec review found no substantive gaps within tickets 01–06.
