# 02: Shared Two-Player Areas

**What to build:** A two-player Manual Match shows one shared Battlefield as two face-to-face Player Areas, with the viewer's area nearest the bottom. Players can freely place and move cards, and both views agree on each card's shared position. Distinct player accents and names make the areas recognizable.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] A two-player Match presents two Player Areas within one Battlefield Zone; each viewer sees their own area nearest the bottom.
- [ ] Player accents are distinct from each other and independent of Magic colors and Color Identity; names remain visible.
- [ ] Cards can be placed freely, and a drag commits on release to one shared Battlefield Layout that appears consistently in both participant views.
- [ ] Dragging across Player Areas changes placement only, without changing Controller or Owner.
- [ ] Existing persisted Battlefield cards and positions remain visible when an active Match loads under the new layout.
- [ ] Browser-level and focused shared-position tests cover synchronized placement, viewer perspective, and preserved public-card permissions.
