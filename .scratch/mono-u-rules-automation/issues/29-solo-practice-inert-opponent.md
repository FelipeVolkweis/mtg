# 29: Restore solo practice with an inert opponent

**What to build:** Let one human start and continue a rules-enforced practice Match against an inert opponent.

**Blocked by:** 24: Track draws and apply draw-related player effects; 28: Complete monarch and Commander rules.

**Status:** ready-for-agent

- [ ] Retain a one-human Room start while creating an inert practice opponent as an additional Match Player in the same rules engine.
- [ ] Automatically pass the practice opponent's Priority opportunities without automatically passing for the human.
- [ ] Make no proactive practice-opponent casts or activations and do not introduce a strategic AI.
- [ ] Provide a coherent practice configuration and Library so required drawing does not cause an immediate empty-Library loss.
- [ ] Route required practice-opponent choices through the shared choice machinery under the solo practice controller and preserve relevant private-view policies.
- [ ] Allow normal attacks, monarch behavior, opponent-draw triggers, and opponent-facing effects against the practice seat.
- [ ] Verify restart recovery, normal game outcomes, spectator permissions, and replacement consent for the real human participant.
