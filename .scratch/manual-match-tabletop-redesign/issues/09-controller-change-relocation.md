# 09: Controller Change Relocation

**What to build:** When a participant explicitly changes a permanent's Controller, that permanent appears in the new Controller's Player Area while retaining its Owner. Moving it visually between areas never changes Controller by itself.

**Blocked by:** 02: Shared Two-Player Areas.

**Status:** ready-for-agent

- [ ] An explicit Change controller action moves a Battlefield permanent to the new Controller's Player Area and preserves its Owner and other game state.
- [ ] The relocation is one synchronized shared layout result visible to every participant, including after reconnecting.
- [ ] Dragging a permanent across Player Areas changes only its position, even when it ends in another player's area.
- [ ] Existing Manual Match permissions for public Game Objects remain in effect.
- [ ] Browser-level and focused Match-action tests cover control changes, Owner preservation, placement-only drags, and revision ordering.
