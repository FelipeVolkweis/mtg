# 20: Compose attack requirements and payments

**What to build:** Make Propaganda and Juggernaut attack requirements work together with Graaz's continuous changes.

**Blocked by:** 18: Apply combat damage and determine outcomes.

**Status:** ready-for-agent

- [x] Author Propaganda's per-attacker payment and expose legal payment choices through the existing mana and selection controls.
- [x] Enforce applicable attack requirements and restrictions without requiring a player to pay an optional attack cost merely to satisfy a requirement.
- [x] Author Darksteel Juggernaut's attack requirement and Graaz's Juggernaut attack and Wall-blocking rules.
- [x] Apply Graaz's other-creature base 5/3 and added Juggernaut type through typed continuous changes and proper derived ordering.
- [x] Preserve additive bonuses, Equipment effects, and Counters alongside base-stat and type changes.
- [x] Verify paid/unpaid attacks, multiple attackers, legal blocks, and Graaz with artifact bonuses through the player interface.

## Comments

Implemented on 2026-10-04 through the agreed Match command/participant-view and
browser-control seams. See `docs/rules-automation.md` for behavior and staged
card coverage. Verification and review are recorded in `../review-16-20.md`.
