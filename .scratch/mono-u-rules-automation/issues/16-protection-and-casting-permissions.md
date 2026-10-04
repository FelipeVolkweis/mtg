# 16: Enforce protection and casting permissions

**What to build:** Enforce target protection, indestructible destruction behavior, and card-granted casting permissions.

**Blocked by:** 13: Resolve destruction, exile, and mass sacrifice.

**Status:** ready-for-agent

- [ ] Represent granted abilities and source-based casting permissions as typed behavior integrated with legality checks.
- [ ] Implement hexproof against opponent-controlled spells and abilities and update target eligibility when grants change.
- [ ] Implement indestructible without preventing sacrifice, exile, return, or other distinct removal actions.
- [ ] Implement flash and Shimmer Myr's artifact casting permission through the normal casting procedure and explicit Priority.
- [ ] Author Darksteel Citadel's remaining behavior and the relevant protections/permissions of Darksteel Juggernaut and Research Thief; keep unfinished combat abilities unimplemented.
- [ ] Verify grants ending on source removal, permitted and prohibited targets, destruction interactions, and instant-speed casting through shared controls.
