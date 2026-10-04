# 08: Quick Card Actions

**What to build:** Routine card actions happen beside the selected card: click to select, double-click or T to toggle tapped state, and use a nearby menu for common actions. The detailed inspector remains available for less common state changes.

**Blocked by:** 02: Shared Two-Player Areas.

**Status:** ready-for-agent

- [ ] Clicking selects a card without moving it; dragging still moves it only after pointer release.
- [ ] Double-clicking a permanent or pressing T with it selected toggles tapped state and synchronizes the result.
- [ ] T does not fire while a text input, select, textarea, or other editable control has focus.
- [ ] A contextual card menu exposes common manual actions, and the detailed inspector remains reachable for uncommon state.
- [ ] Browser-level tests cover pointer and keyboard actions, including prevention of accidental actions while editing text.
