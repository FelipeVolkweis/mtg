# 27: Resolve triggered mana and colorless bonuses

**What to build:** Complete Forsaken Monument's colorless synergies, including additional mana during mana production.

**Blocked by:** 09: Calculate continuous characteristics and Counters.

**Status:** ready-for-agent

- [x] Author its colorless-creature continuous bonus with reusable color and controller filters.
- [x] Recognize tapping a permanent for colorless mana and add the specified additional quantity through triggered mana-ability rules.
- [x] Resolve triggered mana at the correct time without incorrectly placing ordinary Stack objects or exposing a new response window.
- [x] Author its colorless-spell cast trigger and life gain using shared trigger and player-effect operations.
- [x] Compose additional mana with preproduced-mana and cast-then-produce payment flows and the deterministic spending policy.
- [x] Verify multi-unit production, changes in source applicability, cast trigger timing, life gain versus damage, and public/private views through commands.

## Comments

Implemented on 2026-10-05 through the agreed Match command/participant-view and
browser-control seams.

Completed Forsaken Monument with a colorless-creature continuous bonus,
immediate additional colorless mana and a stacked colorless-cast life-gain
trigger. Checks cover multi-unit production, payment composition, effective
characteristics and event timing without a triggered-mana response window.

See `docs/rules-automation.md` for behavior. Verification and the independent
Standards/Spec reviews are recorded in `../review-26-30.md`.
