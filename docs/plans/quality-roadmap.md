# Code Quality Roadmap

The execution order for the code quality refactors found in the October 2026 review: thirteen issues in six waves, each issue one pull request that leaves the code better and every gate green.

Issues are numbered **Q1–Q13** so they never collide with [roadmap.md](roadmap.md) issue numbers.

## How the waves work

One agent works at a time. A wave groups issues that touch disjoint files, so **within a wave the issues can be done in any order** and none has to rebase onto another. **A wave starts only when every issue of the previous wave is merged.**

| Wave | Issues | Why they are grouped |
|---|---|---|
| 0 | Q1, Q2 | Cheap and isolated; Q1 shrinks `room-upgrade.ts` before later issues bump the snapshot version, Q2 makes the gates enforced. |
| 1 | Q3 | Renames imports in nearly every file, so it runs alone. |
| 2 | Q4, Q5, Q6, Q7 | Separate areas: error handling, persistence, support checks, client. |
| 3 | Q8, Q9 | Q8 rewrites the engine core after Q4; Q9 rewrites the gateway after Q4 and Q5. |
| 4 | Q10, Q11 | Q10 changes the stored state shape; Q11 caches over Q8's structure. |
| 5 | Q12, Q13 | Comment edits and small cleanups scattered everywhere; last, so they never cause rebases. |

Critical path: Q1 → Q3 → Q4 → Q8 → Q11.

## Work loop

1. **Branch** `quality/q<n>-<slug>` from `main`.
2. **Read** the issue's *Read* line and `CONTEXT.md` for every domain term you name. If the work conflicts with an ADR, stop and report the conflict.
3. **Plan** in plan mode and get approval before editing.
4. **Test first:** each checklist item starts with a failing test, or a recorded check (grep, inventory) when it isn't testable.
5. **Gates:** `npm run gates` is green. `npm test` is also green when the issue touches `src/client/`, `match-view.ts`, `room.service.ts`, `room.gateway.ts` or persistence. Run `npm test` from a copy outside `.claude/worktrees` (the Playwright UI suite 404s on paths containing a dot).
6. **Pull request:** tick the checklist, show how each item was checked, and write `Closes #<issue>`.

Behavior stays the same unless an issue says otherwise. A test whose expectation changes is classified **Change** in the pull request, with the reason.

**Stored shape changes** (Q8, Q10) bump `currentSnapshotVersion` and add one upgrade step in `room-upgrade.ts`, tested with a captured Room document of the previous version.

---

## Wave 0

### Q1. Delete the unreachable Room upgrade chain

- **Issue:** #92
- **Depends:** none
- **Read:** ADR-0019; `src/server/room/room-upgrade.ts`; `RoomService.onModuleInit`
- **Scope:** `room-upgrade.ts`, `lift-v1-effects.ts`, `tests/rules/room-upgrade.spec.ts`, `tests/fixtures/rooms-v1/`
- **Why:** `RoomService.onModuleInit` deletes every Room below snapshot version 7 at startup, so upgrade steps 1→6 and all of `lift-v1-effects.ts` can't run in production. About 1,200 source lines, a 776-line test and ~15k fixture lines exist only for tests.
- **Done when:**
  - [ ] `lift-v1-effects.ts` and upgrade steps 2–7 are deleted; `upgradeRoom` accepts version 7 and rejects older or newer versions with a clear error;
  - [ ] `tests/fixtures/rooms-v1/` and the tests that use it are deleted; a test covers the version 7 baseline and the rejection;
  - [ ] `grep -rn "lift-v1\|rooms-v1" src tests` is empty;
  - [ ] gates and `npm test` are green.

### Q2. Continuous integration and lint

- **Issue:** #93
- **Depends:** none
- **Read:** `package.json` scripts; `compose.yaml`
- **Scope:** `.github/workflows/`, a typescript-eslint config, `package.json`
- **Why:** `npm run gates` exists but nothing runs it; much of this code is written by agents.
- **Done when:**
  - [ ] a GitHub Actions workflow runs `npm run gates` and `npm test` (with a Postgres service) on every pull request and on `main`;
  - [ ] `npm run lint` runs typescript-eslint with type information, including `no-floating-promises` and `no-misused-promises`, and is part of `npm run gates`;
  - [ ] lint passes on the current code: rules that would need wide fixes are set to `warn`, and each is listed in the pull request with its hit count (Q13 fixes them).

## Wave 1

### Q3. Name the shared modules for what they hold

- **Issue:** #94
- **Depends:** Q1
- **Read:** `src/shared/rules.ts`, `src/shared/rules-v2.ts`, `src/shared/model.ts`
- **Scope:** `src/shared/`, and import lines across `src/` and `tests/`
- **Why:** `rules-v2.ts` is the card DSL, and `rules.ts` is the runtime Match state left behind when the version 1 schema was removed; the names say neither. `manaTypes`/`ManaType` is declared in both, `ZoneKind` in `model.ts` and `rules-v2.ts`, and the color enum is written out four more times in `model.ts`. `rules.ts` and `model.ts` import each other through inline `import()` types.
- **Done when:**
  - [ ] `rules-v2.ts` is `card-dsl.ts` and `rules.ts` is `rules-state.ts`; no file keeps the old names;
  - [ ] colors, mana types and zone kinds each have one definition, and every schema (`characteristicSchema`, `matchActionSchema`) uses it;
  - [ ] no inline `import("./…")` types remain in `src/shared/`, and no import cycle between shared modules remains;
  - [ ] `docs/rules-engine.md`, `docs/card-model.md` and `CONTEXT.md` name the new files;
  - [ ] gates and `npm test` are green. Behavior is unchanged.

## Wave 2

### Q4. A player-facing error type

- **Issue:** #95
- **Depends:** Q3
- **Read:** `MatchService.execute`; `RoomService.command`; `RoomGateway.command`; `CommanderReplacement` in `commander-rules.ts`
- **Scope:** `match.service.ts`, `room.service.ts`, `room.gateway.ts`, and the `throw` sites under `src/server/match/` and `src/server/rules/`
- **Why:** every `Error` message reaches the player and none is logged, so a bug looks like an illegal move and an internal message (or a `TypeError`) is shown on screen.
- **Done when:**
  - [ ] a `RuleViolation` error carries messages meant for players; every rule-check `throw` uses it (inventory recorded in the pull request);
  - [ ] any other error is logged with the Match id and the action, and the player sees a generic message; a test forces an internal error and checks both;
  - [ ] `TabletopError` and `RuleViolation` are the only errors whose text reaches a client;
  - [ ] the commander replacement no longer uses an exception for control flow, or the pull request records why it stays (with a test of the replay path);
  - [ ] `RulesEngine.apply` no longer returns a value nothing reads, and `notice` in `execute` is either produced or removed;
  - [ ] gates and `npm test` are green.

### Q5. Schema migrations

- **Issue:** #96
- **Depends:** Q1
- **Read:** `src/server/storage/database.ts`; `RoomService.onModuleInit`; ADR-0012
- **Scope:** `database.ts`, `room.service.ts` (`onModuleInit` only), a new `migrations/` directory, `Dockerfile` if the files must ship
- **Why:** tables are created with `CREATE TABLE IF NOT EXISTS` on every boot, and a destructive `DELETE`/`UPDATE` of Room data runs on every boot inside a service.
- **Done when:**
  - [ ] numbered SQL migrations run once each, recorded in a `schema_migrations` table, in one transaction per migration;
  - [ ] migration 1 is the current schema and is a no-op against an existing database (tested against a database created by the old code);
  - [ ] the version-7 Room purge is a migration, not boot code; the rematch-confirmation reset stays at boot, documented as a runtime rule, not a migration;
  - [ ] an ADR records the migration approach;
  - [ ] gates and `npm test` are green.

### Q6. One source of truth for runtime support

- **Issue:** #97
- **Depends:** Q3
- **Read:** `src/server/rules/support.ts`; `vm/effects/registry.ts`; `abilities.ts`; dsl-redesign.md §9
- **Scope:** `support.ts`, `abilities.ts`, the effect, trigger, cost and static registries
- **Why:** `support.ts` is a 558-line allow-list kept apart from the code that runs each construct; only effects tie the two together through `unsupported`. Separately, `same()` compares ASTs with `JSON.stringify` (key-order dependent) to recognize meanings such as `{ is: "source" }`, and `choosesX` finds X by searching a serialized string.
- **Done when:**
  - [ ] triggers, costs, statics, replacements and keywords each declare support next to their runtime code, the way effect handlers do; `support.ts` only walks the ability and asks them;
  - [ ] a test fails when a Core kind has a runtime handler but no support declaration, or the reverse;
  - [ ] `same()` and string searches over serialized ASTs are gone; structural predicates (`isSourceSelector`, a value walker for X) replace them, with unit tests;
  - [ ] the catalog gate accepts and rejects exactly the same definitions as before (recorded in the pull request);
  - [ ] gates are green.

### Q7. Split the board components

- **Issue:** #98
- **Depends:** Q3
- **Read:** `src/client/RulesBoard.tsx`, `RulesTabletop.tsx`, `style.css`
- **Scope:** `src/client/` only. Turn-step logic stays where it is; Q8 changes it.
- **Why:** `RulesBoard.tsx` (966 lines) and `RulesTabletop.tsx` (778) mix layout, menus, drag and drop and prompts; card sizing is imperative DOM math with pixel constants in `useLayoutEffect`; `style.css` is one 2,318-line file.
- **Done when:**
  - [ ] each of the two components is split so that no client file exceeds about 400 lines; extracted pieces are named for what they render (stack, hand, battlefield group, prompt panel);
  - [ ] card sizing lives in one hook with named constants, or moves to CSS (grid or container queries) where that gives the same layout;
  - [ ] `style.css` is split per component;
  - [ ] `npm test` (UI suite) is green with no screenshot or behavior change.

## Wave 3

### Q8. Named turn steps and a smaller RulesEngine

- **Issue:** #99
- **Depends:** Q4
- **Read:** `src/server/match/rules-engine.ts`; `turnSteps` in the card DSL; `phaseSteps` in `model.ts`; `RulesTabletop.tsx`
- **Scope:** `rules-engine.ts`, `combat.ts`, `model.ts`, `room-upgrade.ts`, `match-view.ts`, the client's step readers
- **Why:** `RulesEngine` is an 853-line object with about 45 methods that every subsystem receives through `new X(this)`. Steps are raw indexes (`stepIndex === 11`, `[3, 9]`) on the server and the client, with three representations of steps in total.
- **Done when:**
  - [ ] `MatchState.turn.step` is a `TurnStep` name; `stepIndex` is gone; `phaseSteps` is derived from `turnSteps`; the snapshot version is bumped with an upgrade step;
  - [ ] `grep -rn "stepIndex" src` is empty;
  - [ ] turn structure (begin turn, advance step, cleanup, next turn) and action listing (`actions()`) move out of `RulesEngine` into their own modules that take `RulesQuery`/`RulesMutator`, not the engine; the pull request lists what remains on `RulesEngine` and why;
  - [ ] `lastManaSpent` is returned from `pay`, not stored on the engine;
  - [ ] gates and `npm test` are green. Behavior is unchanged.

### Q9. Gateway reads and broadcasts

- **Issue:** #100
- **Depends:** Q4, Q5
- **Read:** `src/server/room/room.gateway.ts`; `RoomService.command`, `view`, `viewer`, `disconnect`
- **Scope:** `room.gateway.ts`, `room.service.ts`
- **Why:** each command reads the Room three times and sends the acting client its view twice; the expiry timer rebroadcasts full views to every live Room every ≤30s even when nothing changed; `disconnect` swallows errors silently.
- **Done when:**
  - [ ] a command reads the Room once; the views for it and its broadcast are projected from the saved state; the acting client receives one view;
  - [ ] the expiry timer broadcasts only to Rooms whose state or connection presence changed;
  - [ ] `disconnect` logs failures instead of discarding them;
  - [ ] an ADR (or ADR-0008 update) records that connections and rate limits are in-memory, so the server runs as a single instance;
  - [ ] gates and `npm test` are green.

## Wave 4

### Q10. Typed numbers and per-turn state

- **Issue:** #101
- **Depends:** Q8
- **Read:** `src/shared/rules-state.ts`; `MatchPlayer` and `Counter` in `model.ts`; `event-runtime.ts`; `evaluate.ts`; ADR-0018
- **Scope:** `model.ts`, `rules-state.ts`, `room-upgrade.ts`, the engine readers and writers of life, counters and per-turn fields, the client displays
- **Why:** life and counter quantities are strings: `event-runtime.ts` adds with `BigInt` while `evaluate.ts` reads with `Number()`. `RulesState` has about 30 optional fields; per-turn fields are reset one by one, so a new one is easy to forget.
- **Done when:**
  - [ ] `MatchPlayer.life` and `Counter.quantity` are numbers, with one arithmetic path; power and toughness stay strings (`*`);
  - [ ] per-turn fields (`landsPlayed`, `drawsThisTurn`, `activationUsage`, `damageEvents`, and any other reset at turn start) live in one `RulesState.thisTurn` object replaced as a whole at turn start;
  - [ ] each remaining optional `RulesState` field has a doc comment saying when it is present;
  - [ ] the snapshot version is bumped with an upgrade step;
  - [ ] gates and `npm test` are green. Behavior is unchanged.

### Q11. Cache effective characteristics

- **Issue:** #102
- **Depends:** Q8
- **Read:** `src/server/match/characteristics.ts`; `vm/evaluate.ts`; the action listing module from Q8
- **Scope:** `characteristics.ts`, `rules-engine.ts`, `evaluate.ts`
- **Why:** `effective()` reruns the layer system and builds a new `Evaluator` on every call, inside nested loops in action listing and `legalTargets`; zone lookups are linear scans.
- **Done when:**
  - [ ] effective characteristics are computed once per object per state change, invalidated by every mutation through `propose` and by continuous-effect changes; a test shows a stale read is impossible after each mutation kind;
  - [ ] zone lookups by kind and owner are constant time;
  - [ ] a benchmark test (four players, 40 permanents each) records the action-listing time before and after;
  - [ ] gates are green. Behavior is unchanged.

## Wave 5

### Q12. Living docs instead of plan references

- **Issue:** #103
- **Depends:** every earlier wave
- **Read:** `docs/plans/`; `docs/rules-engine.md`; `docs/card-model.md`
- **Scope:** `docs/`, comments across `src/`, `AGENTS.md`
- **Why:** the refactor roadmap is finished, yet about 6,600 lines of plans remain and about 29 code comments cite "rules-engine-refactor.md §n", "CM §n" or "issue n"; those references rot as the plans drift.
- **Done when:**
  - [ ] what is still true in the four plans is in `docs/rules-engine.md` and `docs/card-model.md`;
  - [ ] the plans and both roadmaps move to `docs/plans/archived/`;
  - [ ] `grep -rnE "§[0-9]|issue [0-9]|refactor\.md" src` is empty; comments cite CR rules or the living docs;
  - [ ] `AGENTS.md` points at the living docs.

### Q13. Small cleanups

- **Issue:** #104
- **Depends:** every earlier wave except Q12
- **Read:** the review notes below
- **Scope:** scattered
- **Done when:**
  - [ ] the lint rules Q2 set to `warn` are fixed and set to `error`;
  - [ ] intrinsic basic-land mana abilities come from the catalog or a named rules module, not `RulesEngine.abilities()`;
  - [ ] the Monarch is a designation with a typed source, not the `"monarch"` id sentinel;
  - [ ] the trivial `RulesEngine.owner()` wrapper is gone;
  - [ ] duplicate fixtures between `tests/fixtures/dsl-v2/` and `tests/fixtures/dsl-expressiveness/` are merged;
  - [ ] gates and `npm test` are green.

---

## Tracking

Each issue above becomes a GitHub issue titled `Quality Q<n>: <title>`. Its body links to its section here, lists `Blocked by: #<issue>` for each dependency, and carries `ready-for-agent`. Each issue's number is listed under its heading.

This file is the source of truth for scope. If an issue body and this file disagree, update the issue.
