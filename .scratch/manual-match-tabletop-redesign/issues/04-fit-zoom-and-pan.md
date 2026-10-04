# 04: Fit, Zoom, and Pan the Table

**What to build:** A Match Player can see the table in a laptop viewport without scrolling the page, zoom with the wheel, pan with Space-drag, and return to the full overview with Fit table. Navigation changes only that viewer's camera, leaving shared card positions unchanged.

**Blocked by:** 02: Shared Two-Player Areas.

**Status:** ready-for-agent

- [ ] The initial Match table fits a laptop viewport without document-level scrolling; overlay or drawer content may scroll internally.
- [ ] Wheel zoom and Space-drag pan work without triggering a card move, and Fit table restores the full overview.
- [ ] Zoom and pan are local to the viewer and do not change Match revisions or another participant's view.
- [ ] Card dragging remains accurate at nondefault zoom and pan and still commits only on release.
- [ ] Browser-level tests cover navigation and the absence of page scrolling; focused placement tests cover the shared position contract.
