# 28: Complete monarch and Commander rules

**What to build:** Make Fall from Favor, monarch behavior, and Commander-specific casting, return, and damage rules work end to end.

**Blocked by:** 10: Compose casting and activation discounts; 13: Resolve destruction, exile, and mass sacrifice; 14: Attach Equipment and resolve living weapon; 18: Apply combat damage and determine outcomes.

**Status:** ready-for-agent

- [ ] Author Fall from Favor as an Aura with legal creature targeting, Attachment, entry tap, and monarch acquisition.
- [ ] Track the current monarch and implement the associated end-step draw and combat-damage transfer through shared rules behavior.
- [ ] Apply its monarch-dependent untap restriction during the enchanted creature controller's untap procedure.
- [ ] Apply commander tax to casts from the Command Zone and retain commander designation through every applicable Zone change.
- [ ] Provide command-zone return choices with the different rules procedures for Graveyard/Exile versus Hand/Library movement.
- [ ] Track combat damage from each commander and apply Commander-specific losses at the correct checkpoint.
- [ ] Verify tax with cost reducers, return choices after destruction and bounce, monarch transfer/draw, Aura removal, and effective untap behavior.
- [ ] Persist designation, counts, damage, and pending return choices without making Sai or Padeem special engine cases.
