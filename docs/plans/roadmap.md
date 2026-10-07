# Rules Engine Refactor Roadmap

The execution order for the rules engine, card DSL and card model refactor: ten issues, each one pull request that leaves the engine better and every gate green.

This file owns order, scope and done criteria. The specifications live in four plans, cited by section:

| Plan | Cited as |
|---|---|
| [rules-engine-refactor.md](rules-engine-refactor.md), runtime architecture | **RE §n** |
| [dsl-redesign.md](dsl-redesign.md), authored rules AST v2 and compiler | **DSL §n** |
| [card-model-refactor.md](card-model-refactor.md), catalog v2 and runtime model cleanup | **CM §n** |
| [rules-test-plan.md](rules-test-plan.md), test structure and migration | **TP §n** |

## Work loop

One issue per branch and pull request. A large issue may take several sessions.

1. **Branch** `refactor/<n>-<slug>` from `main`.
2. **Read** the sections in the issue's *Read* line, not whole plans, plus `CONTEXT.md` for every domain term you name. If the work conflicts with an ADR, stop and report the conflict.
3. **Plan** in plan mode and get approval before editing. The approved plan turns the issue's checklist into the session task list.
4. **Test first:** each checklist item starts with a failing test, or with a recorded check for items that aren't testable (greps, inventories).
5. **Gates:** `npm run gates` is green. `npm test` is also green when the issue touches `src/client/`, `match-view.ts`, `object-visibility.ts`, `room.service.ts` or persistence.
6. **Pull request:** tick the checklist, show how each item was checked, and write `Closes #<issue>`. Plan corrections found along the way go in the same pull request.

When a session ends before the issue is done, commit the work in progress on the branch and comment on the issue with the state of the checklist and the next step.

Behavior stays the same through issue 9. A test whose expectation changes is classified **Change** (TP §2) in the pull request, with the reason.

## Gates

`npm run gates` is the one command. Issue 1 creates it, and each issue that adds a gate appends to it.

| Gate | Added by | Checks |
|---|---|---|
| types | issue 1 | `npm run typecheck` |
| rules | issue 1 | the rules suite on the fast runner, with no web server or Postgres |
| round-trip | issue 1 | the rules suite with state saved and restored after every command |
| catalog | issue 4 (fixtures), issue 6 (whole catalog) | every definition compiles; every `implemented` definition compiles to an executable form |
| expressiveness | issue 5 | the DSL §8 test cards compile |

`npm test` is the full Playwright suite (browser, recovery, persistence). It needs Postgres: `docker compose up -d db`.

## Ordering principles

- **Feedback before change:** the fast test loop comes first, because every later issue depends on it.
- **Delete before restructuring:** dead runtime fields go before the engine is reorganized.
- **Schema before engine:** handlers, the VM and the checkpoint are written once, against the DSL v2 Core AST.
- **Seam before handlers:** `propose` exists before the effect handlers that call it.
- **Automatic rules before proposals:** casting is the only player-visible change, so it comes last.

Issues touching the same hotspot (`rules-engine.ts`, `resolution.ts`, `src/shared/rules.ts`, `src/shared/model.ts`) run in sequence. Issue 3 can run in parallel with issues 4 and 5.

---

## Issues

### 1. Fast test loop

- **Issue:** #64
- **Depends:** none
- **Read:** TP §3.1, §3.2
- **Scope:** test configuration, `package.json` scripts, a harness around `MatchService.execute`
- **Done when:**
  - [ ] `npm run test:rules` runs `tests/rules.spec.ts` with no web server and no Postgres, and passes the same tests as `npm test`;
  - [ ] a round-trip flag saves and restores the authoritative state after every command, and the rules suite passes with it on. Any failure it reveals is fixed or filed as a bug and skipped with a link;
  - [ ] `npm run gates` runs types, rules and round-trip;
  - [ ] TP §3.1 records the runner choice.

### 2. Scenario builder and characterization split

- **Issue:** #65
- **Depends:** 1
- **Read:** TP §3.3, §15, §16, §34, §38, §4
- **Scope:** `tests/support/`, `tests/rules.spec.ts` → `tests/rules/characterization/*.spec.ts`
- **Done when:**
  - [ ] the Scenario Builder and the `force` helpers from TP §16 exist, with their own tests;
  - [ ] tests are moved into domain files (TP §4 names), with the test count unchanged;
  - [ ] setup uses the builder and helpers, with no direct writes to `match.objects`, `match.zones`, `match.rules` or `stepIndex` left;
  - [ ] each file has a header table classifying its tests as Preserve, Move or Change (TP §2);
  - [ ] gates are green.

### 3. Runtime model cleanup

- **Issue:** #66
- **Depends:** 1
- **Read:** CM §2.2, §4, §5, §7, §8; ADR-0018
- **Scope:** `src/shared/model.ts`, `game-objects.ts`, `match-view.ts`, `object-visibility.ts`, `combat.ts`, `characteristics.ts`, `room.service.ts`, the client readers of removed fields
- **Done when:**
  - [ ] `RoomState.snapshotVersion` exists and `upgradeRoom` runs on load, tested with captured version 1 room documents (mid-casting, mid-resolution, tokens, stack abilities);
  - [ ] `GameObject.ownerId` is required and set at creation; `grep -n "ownerId ??" src` is empty;
  - [ ] every field CM §8 marks removed is gone from types and code, the `position` action is removed, and `upgradeRoom` strips them;
  - [ ] `cannotBeCountered` is a `force` helper in its one test;
  - [ ] gates and `npm test` are green.

### 4. DSL v2 schema, registries and compiler

- **Issue:** #67
- **Depends:** 1
- **Read:** DSL §3, §4, §7, §4.11; RE §19–21; TP §17
- **Scope:** a new v2 schema module beside `src/shared/rules.ts`, `catalog/tokens/`, the counter registry, a new compiler module. No consumers yet.
- **Done when:**
  - [ ] every DSL §4 type has a zod schema, each union branch is unit-tested, and every DSL §5 example parses;
  - [ ] Thopter, Myr and Germ are token definitions, the counter registry covers current cards, and unknown references fail;
  - [ ] validation, desugaring, keyword expansion (DSL §4.10) and layer tagging are each tested without constructing a Match;
  - [ ] the catalog gate runs on v2 fixtures.

### 5. Migration toolchain · human review

- **Issue:** #68
- **Depends:** 4
- **Read:** DSL §6, §8, §9; CM §3.3, §6, §7; TP §17
- **Scope:** `tests/fixtures/dsl-expressiveness/`, the derivation function in `src/server/catalog/`, the migration script, the down-compiler (Core AST → current runtime shapes). No catalog file is written.
- **Done when:**
  - [ ] the 26 DSL §8 cards are written in v2 and compile; AST gaps found are fixed in DSL §4 and the schema; the expressiveness gate is added;
  - [ ] derived name, mana value, keywords, Oracle text and type line equal the stored values for all 783 definitions, plus one fixture per layout in `supportedLayouts`;
  - [ ] the migration dry run over all definitions and the inline test definitions reports zero unmapped constructs, is idempotent, and its diff report is attached to the pull request;
  - [ ] for every implemented card, the script's output compiled and down-compiled equals the current runtime shapes (golden test); unsupported constructs fail with a clear error.
- **Human review:** the 26 card definitions match their Oracle text.

### 6. Catalog flip and version 1 removal · human review

- **Issue:** #69
- **Depends:** 2, 3, 5
- **Read:** CM §3, §3.4, §6; DSL §2.2, §9
- **Scope:** `catalog/definitions/`, `catalog-files.ts`, `catalog.service.ts`, the catalog loading path, inline test definitions, `src/shared/rules.ts`, `docs/rules-engine.md`
- **Done when:**
  - [ ] definitions are `catalogVersion: 2` files with `imported` and `authored` sections;
  - [ ] the reader and importer use v2; the engine loads through compiler → down-compiler; re-importing leaves `authored` unchanged;
  - [ ] the v1 schema, its `superRefine`, the dead ability types and the v1 loader are gone;
  - [ ] `docs/rules-engine.md` describes the v2 pipeline;
  - [ ] the catalog gate covers the whole catalog; gates and `npm test` are green.
- **Human review:** the diff report and a sample of migrated files. On merge, ADR-0018 becomes `accepted` and its index row is updated.

### 7. Event seam and effect handlers

- **Issue:** #70
- **Depends:** 6
- **Read:** RE §6, §34, §40, §41, §56; TP §19
- **Scope:** `RulesQuery` and `RulesMutator`, `propose` as a pass-through, the effect handler registry, `resolution.ts`
- **Done when:**
  - [ ] zone changes, draws, damage and life changes go through `propose`, with last-known-information snapshots on zone-change events; no direct zone mutation remains outside it (grep recorded in the pull request);
  - [ ] every effect kind dispatches through the registry from the Core AST, with isolated tests per kind (zone changes, object effects, interactive effects);
  - [ ] the effect-kind branches are gone from `resolution.ts`, and the down-compiler no longer lowers effects.

### 8. Rule VM and Stack Resolution Runtime

- **Issue:** #71
- **Depends:** 7
- **Read:** RE §28–33; TP §18, §22
- **Scope:** `vm/`, `ResolutionProgress`, the resolution envelope, the permanent-spell path
- **Done when:**
  - [ ] frames, program counters and typed bindings replace `remaining`; TP §18 tests pass, including no replay after restore;
  - [ ] `upgradeRoom` converts in-flight version 1 resolutions, or the pull request records why they are rejected;
  - [ ] target revalidation, intervening-if and the permanent path pass TP §22;
  - [ ] the down-compiler is deleted.

### 9. Automatic rules

- **Issue:** #72
- **Depends:** 8
- **Read:** RE §11, §43–48; TP §23, §24, §26
- **Scope:** `PriorityCheckpoint`, the State-Based Rule registry, `triggers.ts`
- **Done when:**
  - [ ] the pull request lists every Priority grant site, and each goes through the checkpoint; TP §23 passes;
  - [ ] `RulesEngine.checkpoint()` has no SBA logic left; each SBA has isolated tests; a synthetic choice-requiring SBA suspends, survives restore and resumes;
  - [ ] event and state triggers, waiting batches and two-part APNAP placement pass TP §24, using the v2 trigger union.

### 10. Proposals · human review

- **Issue:** #73
- **Depends:** 9
- **Read:** RE §12–16, §35–39, §57 ("Client and projection impact"); CM §4.2 (Proposal Record); TP §11–14, §20, §21, §31–33
- **Scope:** cost handlers, `pay()` and `lockCost()`, `match-view.ts` prompts, the client prompt UI, `StackProposalProcedure`, `RulesEngine.apply()` and `input()`
- **Done when:**
  - [ ] cost determination, locking, planning and commit are handlers; `pay()` and `lockCost()` have no cost-kind branching; TP §20 passes;
  - [ ] the acting player receives projected prompts (`promptKind`, legal targets per clause), and the client reads only prompts; TP §33 passes;
  - [ ] spells and abilities are on the stack from the start of the proposal; rollback and the RE §16 cancel semantics pass TP §14 and §21; the Proposal Record replaces `variables` and `casting`;
  - [ ] `apply()` and `input()` have no procedure-kind branching; each procedure has stale-ID and restore tests (TP §31, §32);
  - [ ] Change-classified tests are rewritten; gates and `npm test` are green.
- **Human review:** UX of prompts and of the spell being cast. The plan step may split this issue into a server half and a UI half.

---

## Card-driven work

After issue 10, work continues one card per issue: "Support <card>". A human chooses the card, normally from DSL §8. Its pull request adds the reusable runtime concepts the card needs (replacement effects, game-rule effects, layers, modes and multiple targets, delayed triggers), marks the card `implemented` and adds its acceptance test (TP §29).

The Game Statechart (RE §63, "Later") is optional and is scheduled only on a human's decision.

## Tracking

Each issue above becomes a GitHub issue titled `Refactor <n>: <title>`. Its body links to its section here, lists `Blocked by: #<issue>` for each dependency, and carries `ready-for-agent`, or `ready-for-human` for the human-review issues (`docs/agents/issue-tracker.md`). Each issue's number is listed under its heading above.

This file is the source of truth for scope. If an issue body and this file disagree, update the issue.
