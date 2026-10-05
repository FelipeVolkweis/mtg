# 13: Resolve destruction, exile, and mass sacrifice

**What to build:** Resolve single-target and mass removal with distinct destruction, exile, and sacrifice semantics.

**Blocked by:** 09: Calculate continuous characteristics and Counters; 12: Move objects through costs and resolving effects.

**Status:** ready-for-agent

- [x] Add reusable semantic destruction, exile, and sacrifice operations and eligible-set selection without treating them as indistinguishable raw moves.
- [x] Author Meteor Golem, Soul-Guide Lantern, Nevinyrral's Disk, and All Is Dust using shared filters and operations.
- [x] Support opponent relationships, nonland and color filters, each-player selections, union sets without duplicate objects, and required simultaneous behavior.
- [x] Retain pre-change information and source references needed for resulting triggers when several objects leave together.
- [x] Do not conflate removal of a source with cancellation of its already pending ability or effect.
- [x] Provide authorized target/choice controls and visible removal results while preserving hidden Zone contents.
- [x] Verify source removal, resulting death triggers, filtered mass effects, and partially possible instructions; later indestructible behavior must compose with these operations.

## Comments

Implemented on 2026-10-04 through the agreed command/player-view seam.

Implemented semantic destruction, exile and sacrifice, opponent/nonland/color filters and simultaneous sets with pre-change snapshots. Disk, Meteor Golem, Lantern and All Is Dust are authored; each-player sacrifice choices resume before the common move.

Validation: typechecking passed; the final full suite passed all 109 acceptance
tests, including seven rules browser tests. Standards review: two duplication
findings fixed, no remaining findings. Spec review: no findings. See
[`review-11-15.md`](../review-11-15.md) and `docs/rules-automation.md`.
