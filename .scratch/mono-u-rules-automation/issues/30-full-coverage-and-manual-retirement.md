# 30: Verify full mono-U coverage and retire manual gameplay

**What to build:** Release complete mono-U mirror Matches and solo practice while removing manual gameplay and preserving Room and Decklist continuity.

**Blocked by:** 15: Resolve linked exile through Duplicant; 20: Compose attack requirements and payments; 21: Resolve attack-time payments and damage; 22: Resolve attack-triggered selection and redirection; 25: Evaluate conditional grants and upkeep triggers; 26: Pay improvise and resolve ward; 27: Resolve triggered mana and colorless bonuses; 29: Restore solo practice with an inert opponent.

**Status:** ready-for-agent

- [ ] Audit the parent coverage checklist: all 100 physical cards and 67 distinct definitions resolve locally, every ability/keyword is authored and tested, and each complete definition is explicitly marked implemented.
- [ ] Complete and verify any remaining compositions, including Launch Mishap, AEtherize, Whirler Rogue, Thought Monitor, Memory Guardian, Spire Golem, and Broodstar, using the approved shared primitives.
- [ ] Play representative full-deck mirror sequences and the specified cross-card scenarios, including Transmuter/Wellspring, Tome at three counters, Graaz with Equipment/Counters, grouped combat triggers, and payment modifiers.
- [ ] Verify server restart or disconnect during casting, resolution selection, and trigger ordering without duplicate costs/effects or private-information disclosure.
- [ ] Remove manual gameplay routes, unrestricted mutation commands, manual mode controls, and tests that require bypassing rules; retain useful table presentation and navigation.
- [ ] Preserve Rooms and saved Decklists, identify legacy manual active Matches as requiring replacement, and enforce existing player consent rather than silently converting or deleting state.
- [ ] Verify unsupported cards are rejected at setup and imported facts or keywords cannot bypass automation eligibility.
- [ ] Update domain documentation and superseding ADRs for automated play, explicit Priority, and solo practice while preserving server authority, catalog ownership, and persisted-session decisions.
- [ ] Run the appropriate acceptance and browser checks for two-human mirror Matches and solo practice; the release passes only when the entire selected pool is supported.
