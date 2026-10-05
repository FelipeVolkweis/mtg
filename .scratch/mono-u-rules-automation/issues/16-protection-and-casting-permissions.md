# 16: Enforce protection and casting permissions

**What to build:** Enforce target protection, indestructible destruction behavior, and card-granted casting permissions.

**Blocked by:** 13: Resolve destruction, exile, and mass sacrifice.

**Status:** ready-for-agent

- [x] Represent granted abilities and source-based casting permissions as typed behavior integrated with legality checks.
- [x] Implement hexproof against opponent-controlled spells and abilities and update target eligibility when grants change.
- [x] Implement indestructible without preventing sacrifice, exile, return, or other distinct removal actions.
- [x] Implement flash and Shimmer Myr's artifact casting permission through the normal casting procedure and explicit Priority.
- [x] Author Darksteel Citadel's remaining behavior and the relevant protections/permissions of Darksteel Juggernaut and Research Thief; keep unfinished combat abilities unimplemented.
- [x] Verify grants ending on source removal, permitted and prohibited targets, destruction interactions, and instant-speed casting through shared controls.

## Comments

Implemented on 2026-10-04 through the agreed Match command/participant-view and
browser-control seams. See `docs/rules-automation.md` for behavior and staged
card coverage. Verification and review are recorded in `../review-16-20.md`.
