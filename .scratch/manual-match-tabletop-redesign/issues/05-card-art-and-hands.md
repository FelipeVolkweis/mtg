# 05: Card Art and Clear Hands

**What to build:** The table displays Card Printing artwork for visible cards, provides a full-card preview while Alt is held over a card, and keeps the local Hand available along the bottom. Opponents' Hands show only counts and concealed backs colored within each opponent's Player Area color family.

**Blocked by:** 02: Shared Two-Player Areas.

**Status:** ready-for-agent

- [ ] Visible cards display their available Card Printing artwork, including the current face, with a readable fallback when artwork is absent or fails to load.
- [ ] Holding Alt while hovering over a visible card shows its full image; releasing Alt or leaving the card closes the preview.
- [ ] The local Hand stays available along the bottom while viewing and navigating the Battlefield.
- [ ] Opponent Hands show counts and concealed backs in a related but distinguishable hue or shade; no hidden identity or artwork leaks through cards or previews.
- [ ] Names and readable contrast remain available alongside player colors.
- [ ] Browser-level tests cover the preview, fallback, Hand presentation, and privacy from both participant perspectives.
