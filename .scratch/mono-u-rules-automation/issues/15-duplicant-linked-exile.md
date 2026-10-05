# 15: Resolve linked exile through Duplicant

**What to build:** Make Duplicant's optional exile and linked characteristic changes follow the particular card it exiled.

**Blocked by:** 13: Resolve destruction, exile, and mass sacrifice.

**Status:** ready-for-agent

- [x] Author an entry trigger with the correct nontoken-creature target and an optional exile action.
- [x] Record an Object Link to the affected card independently of Attachments and retain the relationship required by the continuous ability.
- [x] Derive power, toughness, and creature types from the applicable linked creature card while retaining Shapeshifter as instructed.
- [x] Honor source identity, subsequent Zone changes, no-card/no-creature outcomes, and repeated entry as distinct object lifetimes.
- [x] Verify legal decline, illegal targets on resolution, linked characteristic changes, and unrelated exiled cards through the player interface.
- [x] Persist and restore the link and relevant captured context without adding card-name branches to the engine.

## Comments

Implemented on 2026-10-04 through the agreed command/player-view seam.

Implemented optional targeted nontoken exile and persisted Object Links. Duplicant derives current linked creature-card stats and creature types in Exile, retains Shapeshifter, and resets its relationship across lifetimes.

Validation: typechecking passed; the final full suite passed all 109 acceptance
tests, including seven rules browser tests. Standards review: two duplication
findings fixed, no remaining findings. Spec review: no findings. See
[`review-11-15.md`](../review-11-15.md) and `docs/rules-automation.md`.
