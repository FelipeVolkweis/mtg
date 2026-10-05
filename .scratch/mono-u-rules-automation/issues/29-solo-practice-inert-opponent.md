# 29: Restore solo practice with an inert opponent

**What to build:** Let one human start and continue a rules-enforced practice Match against an inert opponent.

**Blocked by:** 24: Track draws and apply draw-related player effects; 28: Complete monarch and Commander rules.

**Status:** ready-for-agent

- [x] Retain a one-human Room start while creating an inert practice opponent as an additional Match Player in the same rules engine.
- [x] Automatically pass the practice opponent's Priority opportunities without automatically passing for the human.
- [x] Make no proactive practice-opponent casts or activations and do not introduce a strategic AI.
- [x] Provide a coherent practice configuration and Library so required drawing does not cause an immediate empty-Library loss.
- [x] Route required practice-opponent choices through the shared choice machinery under the solo practice controller and preserve relevant private-view policies.
- [x] Allow normal attacks, monarch behavior, opponent-draw triggers, and opponent-facing effects against the practice seat.
- [x] Verify restart recovery, normal game outcomes, spectator permissions, and replacement consent for the real human participant.

## Comments

Implemented on 2026-10-05 through the agreed Match command/participant-view and
browser-control seams.

Restored one-human rules practice with a mirrored supported opponent Library,
automatic opponent Priority passes and human-controlled required choices.
The practice seat takes no proactive actions. Checks cover private views,
spectators, normal outcomes, restart recovery and human replacement consent.

See `docs/rules-automation.md` for behavior. Verification and the independent
Standards/Spec reviews are recorded in `../review-26-30.md`.
