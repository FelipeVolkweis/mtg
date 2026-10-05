# 25: Evaluate conditional grants and upkeep triggers

**What to build:** Complete Padeem, Shimmer Dragon, and Thopter Spy Network through reusable conditions and continuous grants.

**Blocked by:** 16: Enforce protection and casting permissions; 23: Track combat history and grouped triggers.

**Status:** ready-for-agent

- [x] Author Padeem's controlled-artifact hexproof grant and upkeep condition comparing the greatest artifact mana value, including ties.
- [x] Check intervening conditions at their required trigger and resolution times using current appropriate values.
- [x] Complete Thopter Spy Network's conditional upkeep Thopter creation alongside its grouped combat trigger.
- [x] Author Shimmer Dragon's flying, artifact-count conditional hexproof, two-untapped-artifact tap cost, and draw activation.
- [x] Update eligibility and grants when artifact counts or source presence change without mutating printed characteristics.
- [x] Verify tied maxima, conditions changing before resolution, grants appearing/disappearing, and the difference between selected-object tap costs and tap-symbol costs.

## Comments

Implemented on 2026-10-05 through the agreed Match command/participant-view and
browser-control seams.

Completed Padeem conditional upkeep and artifact hexproof, Network conditional
upkeep tokens, and Dragon conditional hexproof plus selected-artifact tap/draw.
Checks exercise tied/no/smaller artifact maxima, intervening-condition changes,
live grants and newly controlled objects used for selected tap costs.

See `docs/rules-automation.md` for behavior and staged coverage. Verification and
review are recorded in `../review-21-25.md`.
