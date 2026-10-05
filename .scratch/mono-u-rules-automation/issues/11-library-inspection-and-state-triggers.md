# 11: Inspect Libraries and handle state triggers

**What to build:** Resolve private Library inspection and Mazemind Tome while applying tapped-entry replacements at entry time.

**Blocked by:** 07: Resolve ordered effects with suspended choices; 08: Collect triggers and create tokens; 09: Calculate continuous characteristics and Counters.

**Status:** ready-for-agent

- [x] Support reusable private look/select/order operations and scry, with authorized views and legal no-selection outcomes.
- [x] Author Mazemind Tome's scry/draw activations, page-counter costs, fourth-counter state trigger, self-exile, and success-dependent life gain.
- [x] Keep state triggers distinct from event triggers and state-based actions, preventing duplicate pending instances of the same state trigger.
- [x] Verify activation at three page counters creates the correct pending activation and exile trigger and still resolves correctly if its source leaves.
- [x] Apply tapped-entry replacement behavior for Lonely Sandbar, Remote Isle, and Nevinyrral's Disk during entry, including entry caused by an effect.
- [x] Honor 'if you do' by using the actual result of the prerequisite action rather than a remembered player intention.
- [x] Resume private Library choices after reconnecting without repeating inspection or exposing hidden contents to other players.

## Comments

Implemented on 2026-10-04 through the agreed command/player-view seam.

Implemented private resumable Library inspection, scry, page-counter costs and distinct state triggers. Tome activation and success-bound exile/life gain remain independent of the source. Entry replacements apply to land play, casting and effect-based entry.

Validation: typechecking passed; the final full suite passed all 109 acceptance
tests, including seven rules browser tests. Standards review: two duplication
findings fixed, no remaining findings. Spec review: no findings. See
[`review-11-15.md`](../review-11-15.md) and `docs/rules-automation.md`.
