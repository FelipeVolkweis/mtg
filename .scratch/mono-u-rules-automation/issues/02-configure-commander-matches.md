# 02: Configure Commander Matches

**What to build:** Let two Room Participants configure a Commander Match, designate commanders, validate their Decklists, and complete opening procedures through the application.

**Blocked by:** 01: Prepare the rules command interface.

**Status:** ready-for-agent

- [ ] Expose Commander format selection and commander selection from each selected Decklist before shuffling or opening draws.
- [ ] Validate commander eligibility, Color Identity, relevant Decklist construction, and complete automation eligibility; explain unsupported cards without treating imported keywords as implemented behavior.
- [ ] Record commander designation on Card Instances, place selected commanders in the Command Zone, and keep both players' instances and Libraries independent.
- [ ] Apply Commander starting life, starting-player selection, opening-hand draws, and legal mulligans with private player views.
- [ ] Verify Sai and Padeem eligibility and reject Graaz for the unchanged blue sample without branching on card names in setup code.
- [ ] Use isolated fully supported fixtures to verify early setup while the production mono-U pool is incomplete; do not mark unfinished production definitions implemented.
- [ ] Persist setup choices and preserve the existing consent requirements for replacing active Matches.
