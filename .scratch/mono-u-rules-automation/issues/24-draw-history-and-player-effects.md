# 24: Track draws and apply draw-related player effects

**What to build:** Make per-turn draw history and draw-related life or Hand-size behavior work through the existing resolution machinery.

**Blocked by:** 19: Crew Vehicles and expire temporary changes.

**Status:** ready-for-agent

- [ ] Record draw ordinals for each player and trigger Thopter Fabricator only on that player's second draw each turn, completing its token and crew behavior.
- [ ] Author Scrawling Crawler's upkeep each-player draw and opponent-draw life loss, and Psychosis Crawler's live Hand-size stats and each-opponent life loss.
- [ ] Keep each draw within a multi-card instruction observable to triggers without running state-based actions between every resolving instruction.
- [ ] Author Mind's Eye's opponent-draw trigger, optional mana payment during resolution, and success-dependent draw.
- [ ] Complete Thought Vessel's maximum Hand size modification and use it during cleanup.
- [ ] Distinguish mana payment during an effect from casting payment and preserve automatic allocation from the existing pool.
- [ ] Verify draw ordinals across turns, life loss versus damage, temporary zero toughness during resolution, private choices, and recovery without duplicate draws.
