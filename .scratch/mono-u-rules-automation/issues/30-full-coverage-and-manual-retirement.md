# 30: Verify full mono-U coverage and retire manual gameplay

**What to build:** Release complete mono-U mirror Matches and solo practice while removing manual gameplay and preserving Room and Decklist continuity.

**Blocked by:** 15: Resolve linked exile through Duplicant; 20: Compose attack requirements and payments; 21: Resolve attack-time payments and damage; 22: Resolve attack-triggered selection and redirection; 25: Evaluate conditional grants and upkeep triggers; 26: Pay improvise and resolve ward; 27: Resolve triggered mana and colorless bonuses; 29: Restore solo practice with an inert opponent.

**Status:** ready-for-agent

- [x] Audit the parent coverage checklist: all 100 physical cards and 67 distinct definitions resolve locally, every ability/keyword is authored and tested, and each complete definition is explicitly marked implemented.
- [x] Complete and verify any remaining compositions, including Launch Mishap, AEtherize, Whirler Rogue, Thought Monitor, Memory Guardian, Spire Golem, and Broodstar, using the approved shared primitives.
- [x] Play representative full-deck mirror sequences and the specified cross-card scenarios, including Transmuter/Wellspring, Tome at three counters, Graaz with Equipment/Counters, grouped combat triggers, and payment modifiers.
- [x] Verify server restart or disconnect during casting, resolution selection, and trigger ordering without duplicate costs/effects or private-information disclosure.
- [x] Remove manual gameplay routes, unrestricted mutation commands, manual mode controls, and tests that require bypassing rules; retain useful table presentation and navigation.
- [x] Preserve Rooms and saved Decklists, identify legacy manual active Matches as requiring replacement, and enforce existing player consent rather than silently converting or deleting state.
- [x] Verify unsupported cards are rejected at setup and imported facts or keywords cannot bypass automation eligibility.
- [x] Update domain documentation and superseding ADRs for automated play, explicit Priority, and solo practice while preserving server authority, catalog ownership, and persisted-session decisions.
- [x] Run the appropriate acceptance and browser checks for two-human mirror Matches and solo practice; the release passes only when the entire selected pool is supported.

## Comments

Implemented on 2026-10-05 through the agreed Match command/participant-view and
browser-control seams.

Completed Launch Mishap, AEtherize and Whirler Rogue, and verified the full
100-card / 67-definition release pool in mirror and practice setup. All
selected definitions have authored rules and explicit implemented status.
Eligibility rejects empty keyword envelopes. Removed manual gameplay controls
and unrestricted protocol actions while preserving saved Decklists, Rooms and
consent-based replacement of legacy Matches. Updated CONTEXT, README and
superseding ADRs. Browser and restart checks cover casting, resolution, trigger
ordering, private choices, duplicate-effect prevention and practice delegation.

See `docs/rules-automation.md` for behavior. Verification and the independent
Standards/Spec reviews are recorded in `../review-26-30.md`.
