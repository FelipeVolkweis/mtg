# Rules automation: tickets 01–06

Commander is available alongside the temporary Tabletop compatibility path. The
first six rules slices require two ready Room Participants, a selected legendary
creature commander in each Decklist, exactly 100 cards, singleton nonbasic cards,
compatible Color Identity, and complete authored automation support. The mono-U
sample still contains unsupported cards and is deliberately rejected. Sai and
Padeem satisfy commander eligibility; their full behavior belongs to later
slices. Graaz cannot lead the unchanged blue Decklist. Solo automated practice,
combat, triggers, commander tax and commander return choices belong to later
tickets. The existing Tabletop remains available until ticket 30 removes it.

`MatchService.execute` is the server-owned gameplay command boundary. Transport,
authorization, stale-revision checks, database transactions, and participant views
remain in Room. Execution runs on a copy and publishes accepted state atomically;
rejected commands leave resources, choices and revisions unchanged. The same
boundary returns accepted, rejected, or pending results. Scenario construction is
restricted to test code; there is no player-accessible fixture command.

The agreed testing seam is the command/player-view boundary. Acceptance tests use
isolated fully supported Decklists and authored release card definitions. Browser
coverage uses the same WebSocket commands and shared choice controls as players.
Rules views conceal both Libraries, reveal each Hand only to its player, and show
pending procedure details and legal choices only to the player answering them.

Card Abilities may contain a validated `rules` composition. It describes costs,
Object Filters, targets and semantic effects. Imported keywords and legacy
primitive envelopes do not imply execution support. Complete definitions retain
binary automation status; Ornithopter of Paradise has authored mana behavior but
remains unimplemented until flying is enforced. The catalog importer preserves
these separately owned authored fields.

Opening procedures remove commanders before shuffling, draw seven, and use London
mulligans. Two-player games have no multiplayer free mulligan. Keeping requires
one selected bottomed card per mulligan. The chosen or randomly selected starting
player skips their first draw. Untap and ordinary cleanup provide no Priority;
cleanup waits for the active player's private discard selection if needed. Empty
combat skips declare blockers and combat damage. Checkpoints precede Priority;
this slice handles life and failed draws, with further state-based actions and
trigger handling added alongside the mechanics that require them.

The casting procedure locks its total cost before payment. Players explicitly
choose mana abilities before casting or inside the payment window. Automatic pool
spending reserves specific colors and colorless requirements first, then pays
generic costs from colored pools in descending remaining quantity, exhausting each
pool in order, and finally colorless. Equal colored quantities use W, U, B, R, G
order. Ineligible restricted mana is excluded; unspent restrictions persist.
Ordinary mana expires on step transitions. No source is activated automatically.

Targets are selected before payment and revalidated during resolution. Spells and
Ability Game Objects remain distinct. Activated costs are checked in authored
order before committing resources. Tap-symbol costs enforce creature control
since the beginning of the controller's most recent turn; selecting an untapped
creature for a separate tap cost does not impose that restriction. Paid ability
objects capture their effects and targets so sacrificed or discarded sources do
not prevent resolution. Casting Records retain source Zone and mana spent, and
Card Instance identity persists across fresh Game Object identities.

Pending casts, targets, activations and cleanup choices are ordinary persisted
Match data. Reconnection restores their procedure identifiers and authorized
choices; revision and identifier checks prevent duplicate completion. Cancelling
an unfinished procedure pays none of its costs. Separately completed mana
abilities remain completed, with their mana in the player's pool.
