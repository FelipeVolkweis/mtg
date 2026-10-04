# 13: Resolve destruction, exile, and mass sacrifice

**What to build:** Resolve single-target and mass removal with distinct destruction, exile, and sacrifice semantics.

**Blocked by:** 09: Calculate continuous characteristics and Counters; 12: Move objects through costs and resolving effects.

**Status:** ready-for-agent

- [ ] Add reusable semantic destruction, exile, and sacrifice operations and eligible-set selection without treating them as indistinguishable raw moves.
- [ ] Author Meteor Golem, Soul-Guide Lantern, Nevinyrral's Disk, and All Is Dust using shared filters and operations.
- [ ] Support opponent relationships, nonland and color filters, each-player selections, union sets without duplicate objects, and required simultaneous behavior.
- [ ] Retain pre-change information and source references needed for resulting triggers when several objects leave together.
- [ ] Do not conflate removal of a source with cancellation of its already pending ability or effect.
- [ ] Provide authorized target/choice controls and visible removal results while preserving hidden Zone contents.
- [ ] Verify source removal, resulting death triggers, filtered mass effects, and partially possible instructions; later indestructible behavior must compose with these operations.
