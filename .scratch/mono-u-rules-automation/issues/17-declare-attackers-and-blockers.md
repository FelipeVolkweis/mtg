# 17: Declare attackers and blockers legally

**What to build:** Provide legal attack and block declaration controls with combat Priority windows and current effective characteristics.

**Blocked by:** 09: Calculate continuous characteristics and Counters.

**Status:** ready-for-agent

- [ ] Track attackers, defending players or permanents, blockers, and combat participation in shared Match state.
- [ ] Enforce attack eligibility, creature timing restrictions, tapping requirements, legal defenders, and blocker eligibility.
- [ ] Implement flying and basic unblockability restrictions using the same effective-characteristic and legality mechanisms.
- [ ] Allow the appropriate players to complete attack and block declarations through shared controls and explicit Priority passes.
- [ ] Use current characteristics and preserve legal attack/block choices when board state changes before the applicable declaration.
- [ ] Verify illegal declarations, unauthorized controls, private information boundaries, and visible combat state through the command/view seam.
- [ ] Author flying for applicable supported definitions, but keep any card with other unfinished behavior unimplemented.
