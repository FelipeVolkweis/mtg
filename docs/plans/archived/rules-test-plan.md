# Rules Engine Test Plan

## 1. Purpose

This document defines how the existing `rules.spec.ts` suite should evolve during the Rules Engine architecture refactor.

The current suite is a valuable characterization and integration suite. It already covers many of the most important rules-engine guarantees:

- server-authoritative command execution;
- atomic failed commands;
- persisted procedures;
- reconnect and serialization behavior;
- hidden-information boundaries;
- casting and payment;
- Stack resolution;
- target validation and revalidation;
- triggers and trigger ordering;
- combat;
- cleanup;
- Commander-specific behavior;
- continuous effects;
- source-object disappearance;
- Card Instance vs. Game Object identity.

The goal is **not** to discard this coverage.

The goal is to separate:

1. behavioral contracts that must remain stable;
2. implementation details that should move into subsystem tests;
3. behavior that intentionally changes as the engine becomes more Comprehensive-Rules aligned.

The test migration should happen incrementally alongside the engine refactor.

---

# 2. Core testing principle

Every existing test should be classified as one of:

```text
PRESERVE
Behavior is externally meaningful and should remain valid.

MOVE
Behavior remains valid, but assertions about internal implementation
should move into a lower-level subsystem test.

CHANGE
The current test encodes behavior intentionally changed by the
CR-aligned architecture.
```

Do not require every existing test to pass unchanged.

Instead require:

> Every existing test is explicitly classified as Preserve, Move, or Change, and no behavioral coverage is silently lost.

---

# 3. Preserve the existing suite initially

Before major Rules Engine refactoring:

1. Keep the current suite green.
2. Rename or treat it as a characterization suite.
3. Do not immediately rewrite all tests to match the target architecture.
4. Add focused tests around each subsystem before extracting that subsystem.

Recommended temporary name:

```text
tests/rules/rules.characterization.spec.ts
```

The characterization suite protects against accidental regressions while internal architecture is changing.

## 3.1 Fast runner (prerequisite)

`tests/rules.spec.ts` already runs in memory: it constructs `MatchService` directly and uses no database. It still runs under Playwright, though, and `playwright.config.ts` starts a `webServer` that builds the app and connects to Postgres before any test runs.

The rules suites run with `npm run test:rules`: a separate Playwright config (`playwright.rules.config.ts`) with no `webServer` and no `globalSetup`. It keeps the existing `@playwright/test` API, so no test changes were needed. The rules suite runs in about 10 seconds without Postgres. It also picks up `tests/rules/**/*.spec.ts`, where the split suite and subsystem tests go.

## 3.2 Round-trip mode

`npm run test:rules:round-trip` sets `ROUND_TRIP=1`. `tests/support/round-trip.ts` then wraps `MatchService.execute()`: before and after every command it checks that the Match is JSON-safe (no `Map`, `Set`, `Date`, class instances, `BigInt`, functions, non-finite numbers or `undefined` array items) and replaces it with a JSON round trip of itself, as the Room store does. `tests/rules-round-trip.spec.ts` tests the check and proves the hook is active. Both modes are part of `npm run gates`.

This covers most of the persistence matrix (§31) automatically: any pending procedure, resolution or trigger batch that holds non-serializable data, or behaves differently after a restore, fails an existing test. The explicit persistence tests in §31 remain for interruption points the suite doesn't reach.

## 3.3 Current coupling

Measured in `tests/rules.spec.ts` (161 tests, counting parameterized cases) at the time of writing:

| Coupling | Count | Impact |
|---|---|---|
| Assertions on `pending.stage` | 3 | Low. Move them to procedure tests (§7). |
| `cancel-procedure` uses | 5 | Low. Classify each against the decided cancel semantics (§13). |
| Assertions on internal runtime fields (`triggerPlacement`, `waitingTriggers`, `resolving`, `remaining`) | 7 | Low. Move to runtime tests (§8). |
| Direct reads or writes of `match.objects`, `match.zones`, `match.rules`, `stepIndex` | ~233 lines | **High.** Mostly scenario setup. Replace with the Scenario Builder and `force` helpers (§15–16) before large extractions. |
| Inline version 1 rule definitions | ~32 | Medium. Migrated together with the catalog (dsl-redesign.md §9). |

The Scenario Builder is therefore the largest single cost of the test migration, and it comes first.

---

# 4. Target test structure

The eventual suite should be split by responsibility.

```text
tests/rules/
├── integration/
│   ├── setup.spec.ts
│   ├── priority.spec.ts
│   ├── casting.spec.ts
│   ├── activation.spec.ts
│   ├── resolution.spec.ts
│   ├── triggers.spec.ts
│   ├── state-based.spec.ts
│   ├── continuous-effects.spec.ts
│   ├── combat.spec.ts
│   ├── commander.spec.ts
│   ├── hidden-information.spec.ts
│   └── persistence.spec.ts
│
├── compiler/
│   ├── validation.spec.ts
│   ├── normalization.spec.ts
│   ├── targets.spec.ts
│   ├── selectors.spec.ts
│   └── bindings.spec.ts
│
├── procedures/
│   ├── stack-proposal.spec.ts
│   ├── cleanup.spec.ts
│   ├── trigger-placement.spec.ts
│   ├── replacement-choice.spec.ts
│   └── state-based-choice.spec.ts
│
├── vm/
│   ├── execution.spec.ts
│   ├── suspension.spec.ts
│   ├── serialization.spec.ts
│   ├── bindings.spec.ts
│   └── effects/
│       ├── draw.spec.ts
│       ├── damage.spec.ts
│       ├── move.spec.ts
│       ├── discard.spec.ts
│       ├── create-token.spec.ts
│       └── ...
│
├── costs/
│   ├── determination.spec.ts
│   ├── planning.spec.ts
│   ├── ordering.spec.ts
│   ├── payment.spec.ts
│   └── handlers/
│
├── priority/
│   └── checkpoint.spec.ts
│
├── events/
│   ├── event-runtime.spec.ts
│   └── replacement-runtime.spec.ts
│
├── state-based/
│   └── rules/
│
├── continuous/
│   ├── characteristics.spec.ts
│   ├── layers.spec.ts
│   └── game-rule-effects.spec.ts
│
└── cards/
    ├── supported-cards.spec.ts
    └── card-smoke.spec.ts
```

The exact directory names are less important than separating architectural boundaries.

---

# 5. Integration tests

Integration tests should continue exercising the public multiplayer boundary:

```text
MatchService.execute()
```

They should verify observable game behavior rather than private subsystem structure.

Integration tests should cover:

- legal and illegal commands;
- player authority;
- Priority;
- Stack behavior;
- player-facing prompts;
- hidden information;
- state projection;
- serialization and reconnect;
- revision safety;
- game outcomes.

These tests are especially valuable because they exercise the same command and projection path used by browser clients.

---

# 6. What existing tests should be preserved

The majority of the current suite should remain as regression coverage.

Examples of behavior worth preserving include:

## Atomic command failure

Rejected commands must not partially mutate state.

Examples:

- failed mana payment preserves mana;
- failed payment does not tap a permanent;
- rejected selections do not increment revision;
- stale procedure IDs do not modify state.

## Persistent procedures

Any pending choice must survive:

```text
serialize
→ deserialize
→ answer
→ resume
```

without replaying completed operations.

## Hidden information

Tests should continue verifying:

- private Hands remain private;
- Library information remains private;
- private resolution choices are visible only to the correct player;
- another player cannot answer a private procedure.

## Stack independence from sources

Activated and triggered abilities must continue working after their source leaves the expected Zone.

Examples include:

- sacrifice-source activated abilities;
- cycling;
- Ward;
- death triggers.

## Game Object identity

Tests should continue verifying that relevant Zone changes create a new Game Object while preserving Card Instance identity.

## Target legality

Preserve tests for:

- illegal target rejection;
- target type restrictions;
- target revalidation on resolution;
- all-targets-illegal behavior;
- counterspells distinguishing spells from Ability Game Objects.

## Cost locking

Preserve tests showing that total costs are locked after the proper CR stage and do not change during the mana-ability window.

## Trigger ordering

Preserve behavioral tests for:

- simultaneous trigger ordering;
- APNAP ordering;
- triggers outliving their source;
- trigger batches;
- reconnect during trigger choices.

## Combat

Preserve tests for:

- attacker legality;
- blocker legality;
- blocked-state persistence;
- combat damage;
- commander damage;
- combat-related triggers.

## Cleanup

Preserve tests for:

- discard-to-hand-size;
- removal of marked damage;
- expiration of temporary effects;
- exceptional cleanup Priority;
- repeated cleanup where required.

---

# 7. Tests that should move down a layer

Some current assertions test useful behavior but are overly coupled to the current implementation.

These assertions should move into subsystem tests.

## Pending stage names

Avoid integration assertions such as:

```ts
expect(pending.stage).toBe("targets");
```

The integration test should instead assert:

- the player is being asked for a target;
- the legal target set is correct;
- invalid answers are rejected;
- valid answers advance the procedure.

The exact state:

```text
ChoosingTargets
```

or:

```text
stage = "targets"
```

belongs in:

```text
procedures/stack-proposal.spec.ts
```

---

# 8. Internal runtime fields

Avoid integration tests asserting implementation fields such as:

```text
triggerPlacement
remaining
program counter
VM frame layout
internal procedure variant names
```

unless those fields are intentionally part of the persisted public contract.

Instead:

```text
Integration:
    verify resulting Stack and player choices.

Runtime unit test:
    verify internal trigger batch representation.
```

This makes internal refactors possible without weakening rules coverage.

---

# 9. `totalCost` assertions

`totalCost` may remain in integration tests if it is deliberately exposed to the acting player for payment UI.

For example:

```text
Thoughtcast
printed cost = {4}{U}
two applicable reductions
displayed locked cost = {2}{U}
```

is valid integration behavior.

However, the same rule should also be tested directly in:

```text
costs/determination.spec.ts
```

This allows failures to be localized to:

```text
Cost Runtime
```

rather than the entire Match integration path.

---

# 10. Existing behavior that must intentionally change

Some tests encode assumptions that conflict with the CR-aligned target architecture.

These tests should be rewritten, not preserved unchanged.

---

# 11. Pending spells become Stack objects immediately

The current implementation may keep a spell effectively in its old Zone until casting is completed.

The CR-aligned architecture changes this.

At the beginning of casting:

```text
card in Hand
    ↓
provisional spell Game Object on Stack
```

The casting procedure then continues with:

```text
choices
targets
cost determination
mana window
payment
finalization
```

Therefore tests that expect:

```text
Stack count == 0
```

while a spell is being cast must change.

New expected behavior:

```text
Stack:
    provisional spell
```

Private casting choices remain private.

---

# 12. Hidden information during casting

A spell being cast is public because it is on the Stack.

The procedure used to complete casting may still contain private information.

Tests should therefore verify:

```text
Opponent CAN see:
    spell on Stack

Opponent CANNOT see:
    controller-only pending procedure data
    private selections not required to be public

Opponent CANNOT:
    answer the casting procedure
```

This replaces tests that treat the pending spell itself as hidden.

---

# 13. Cancellation semantics

Existing tests use:

```text
cancel-procedure
```

during casting/payment.

The semantics are decided in rules-engine-refactor.md §16 ("Cancel semantics"): `cancel-procedure` is a UI abort, available on the player's own casting or activation proposal only before the total cost is locked. It is never available for turn-based, resolution, trigger, replacement or state-based procedures.

The distinction:

## UI abort

A product-level convenience action that aborts an unfinished local proposal before it becomes an accepted game action.

## Rules rollback

Rollback caused because a proposed action cannot legally be completed.

The latter should follow the rules architecture and use transactional Match state where possible.

Tests involving cancellation must be reviewed individually and classified as:

```text
product behavior
```

or:

```text
CR illegal-action rollback behavior
```

Do not let current cancellation semantics become an accidental rules contract.

As built (roadmap issue 10): before cost lock the UI abort is `cancel-procedure`; after it the rules rollback is `reverse-proposal` (rules-engine-refactor.md §16). Characterization tests that left a locked cast now use `reverse-proposal`.

---

# 14. Transactional proposal tests

The new `StackProposalProcedure` should have explicit rollback tests.

Examples:

```text
Given:
    spell moved provisionally onto Stack

When:
    proposal becomes illegal

Then:
    Stack object is removed
    card returns to original state
    unpaid costs remain unpaid
    target/mode choices disappear
    authoritative Match remains unchanged
```

Where independent mana abilities or other actions occurred during the proposal, behavior must match the chosen CR rollback semantics.

---

# 15. Scenario Builder

The current suite frequently creates scenarios by directly modifying:

```text
match.objects
match.zones
match.rules
turn.stepIndex
mana
temporaryEffects
catalog definitions
```

This is useful but strongly couples tests to MatchState structure.

**As built (issue #65).** The Scenario Builder is the shared fixture module `tests/support/rules-game.ts`, not a fluent `scenario()` API:

- `rulesGame()` starts a two-player Commander Match from the released catalog, with both opening hands kept and the active player holding Priority in the first main phase. It returns `{ service, catalog, room, match, command, seed }`.
- `seed(name, zone, seat)` puts a named card into a Hand or onto the Battlefield (it calls `force.card`).
- `triggerGame()` adds `view`, `pass`, `answer` and `handCount` helpers on top of `rulesGame()`.
- `commanderFixture()`, `emptyRoom()` and `emptyCatalog` build Rooms and Catalogs for setup tests.

Every characterization test already used `rulesGame()`, so promoting it kept the test diff small. A fluent builder can be layered on top later if setup code grows again.

The Scenario Builder SHOULD operate at semantic game-state level rather than exposing storage details.

---

# 16. Force helpers

Some rules tests need to construct states that would be tedious or impossible to reach through normal commands.

**As built (issue #65):** `tests/support/force.ts` exports a `force` object of free functions that take the Match (or the object) as their first argument, so they work on any Match value, including restored copies:

| Helper | Sets |
|---|---|
| `force.mana(match, playerId, pool)` | merges amounts into a mana pool |
| `force.step(match, step)` | the turn step, by name (`"cleanup"`, `"declare-attackers"`, …) |
| `force.activePlayer`, `force.priority` | the active player and Priority |
| `force.card(match, definition, zone, playerId)` | a new Card Instance and Game Object in a Zone |
| `force.move`, `force.zoneContents`, `force.clearZone`, `force.addObject` | Zone membership, keeping object identity |
| `force.counters`, `force.attach`, `force.controller` | object state |
| `force.controlledSince`, `force.commander` | continuous control and commander designation |
| `force.rules(match, patch)` | one-off rules-state fields (monarch, marked damage, temporary effects, combat, …) |

`tests/rules/scenario.spec.ts` tests each helper. The characterization suite contains no direct writes to `match.objects`, `match.zones`, `match.rules` or `turn.stepIndex`.

Using `force` in the name communicates:

> This setup intentionally bypasses ordinary game actions.

This is preferable to raw mutation scattered throughout tests.

---

# 17. Rules Compiler tests

The existing suite primarily tests authored rules by running complete Matches.

The new architecture needs focused compiler tests.

Test:

## Structural validation

```text
valid authored ability
invalid authored ability
unknown effect kind
unknown cost kind
```

## Semantic validation

Examples:

```text
spell ability with incompatible applicable Zone
mana ability with a target
unknown target reference
unknown binding
binding used before definition
invalid selector
invalid token descriptor
```

## Normalization

Test:

```text
single target
→ named target-0

subject = "target"
→ TargetReference(target-0)

subject = "set" + filter
→ AllMatching selector

destination = "hand"
→ owner-relative Hand destination
```

Also test keyword expansion (`affinity`, `ward`, `cycling`, `equip`, `crew`, `kicker`) and layer tagging of continuous changes.

## DSL expressiveness

Every card in the expressiveness test set (dsl-redesign.md §8) has a version 2 definition in `tests/fixtures/dsl-expressiveness/`. The test compiles each one and asserts:

- it passes schema and semantic validation;
- it uses no construct outside the documented AST.

Runtime support is not required. This test tracks whether the DSL can describe the cards, independently of whether the engine can run them.

## DSL migration

For the version 1 → version 2 migration script:

- every implemented definition migrates without manual-review markers, or appears in the script's explicit hand-written list;
- migrating twice produces the same output;
- the Core AST of each migrated definition, down-compiled to the current runtime shapes, matches the shapes the current engine executes for the version 1 definition (golden comparison);
- the characterization suite passes on migrated definitions.

Compiler tests should not require constructing a Match.

---

# 18. Rule VM tests

Rule VM tests should use synthetic semantic programs rather than named cards wherever practical.

Example:

```ts
program([
  draw(1, { bind: "drawn" }),
  discard(1, { bind: "discarded" }),
  ifValue(
    atLeast(binding("discarded"), 1),
    [
      draw(binding("drawn")),
    ],
  ),
]);
```

Test:

- sequential execution;
- nested frames;
- branch execution;
- bindings;
- suspension;
- resume;
- serialization;
- no replay;
- fresh procedure ID after each new suspension.

The current nested-sequence integration behavior should be retained as an end-to-end smoke test, while the underlying semantics move into focused VM tests.

---

# 19. Effect Handler tests

Each semantic effect should be independently testable.

Examples:

```text
Draw
Damage
Move
Destroy
Sacrifice
Exile
CreateToken
AddCounters
AddMana
Attach
```

Tests should verify the semantic primitive itself rather than rely on one particular card.

For example:

```text
Move(AllMatching(attacking creatures), OwnerHand)
```

is the primitive underlying Aetherize.

Test that primitive directly.

Then retain one Aetherize integration test proving that the card definition compiles and invokes it correctly.

---

# 20. Cost Runtime tests

Test cost mechanics separately from complete card flows.

Required areas:

## Determination

```text
printed mana cost
alternative costs
additional costs
increases
reductions
minimums
Commander tax
Affinity
```

## Locking

Verify that changes during the mana ability window do not change the locked total.

## Planning

Verify legal selected objects and mutually compatible cost components.

## Atomicity

If any component cannot be paid:

```text
nothing is committed
```

## Ordering

Where payment order matters, test the player-choice ordering procedure.

## Mana spending

Test:

- colored requirements;
- generic spending;
- restricted mana;
- deterministic automatic choices where semantics are equivalent.

---

# 21. Stack Proposal Procedure tests

Create focused tests for CR 601/602 transitions.

For spells:

```text
Start
→ put spell on Stack
→ choose modes
→ choose alternative/additional costs
→ choose X
→ choose targets
→ choose distributions
→ legality check
→ determine and lock total cost
→ mana window
→ pay
→ finalize cast
```

For activated abilities:

```text
Start
→ create Ability Game Object
→ same proposal stages
→ finalize activation
```

Each transition should have:

- successful transition tests;
- invalid-answer tests;
- stale-procedure tests;
- serialization/recovery tests.

---

# 22. Stack Resolution Runtime tests

Test resolution independently from VM instruction semantics.

Required cases:

```text
no targets
one legal target
all targets illegal
some targets legal
intervening-if true
intervening-if false
permanent spell resolution
instant/sorcery resolution
Ability Game Object resolution
```

Permanent resolution should be tested separately from arbitrary effect-program execution.

---

# 23. Priority Checkpoint tests

The new checkpoint is important enough to deserve direct combinatorial tests.

Test:

```text
stable state
→ grant Priority
```

```text
SBA
→ state stable
→ grant Priority
```

```text
SBA
→ causes another SBA
→ repeat
→ Priority
```

```text
SBA
→ creates trigger
→ trigger placement
→ Priority
```

```text
trigger placement
→ causes new SBA
→ repeat checkpoint
```

```text
SBA requires choice
→ suspend
→ serialize
→ restore
→ answer
→ resume checkpoint
→ Priority
```

No test should permit Priority to appear before the checkpoint is stable.

---

# 24. Trigger Runtime tests

Split trigger testing into:

## Event triggers

Test matching against semantic events.

## State triggers

Test conditions becoming true independently of event emission.

## Trigger batching

Test:

- current batch;
- new triggers generated during placement;
- next batch behavior.

## Two-part trigger placement

Test the current CR trigger-placement process.

## APNAP

Test multiplayer placement order.

## Per-player ordering

Test simultaneous triggers controlled by one player.

## Trigger Stack setup

Test triggered abilities requiring:

- targets;
- modes;
- divisions.

---

# 25. Replacement and prevention tests

The new architecture introduces a replacement/prevention runtime that the current suite does not deeply isolate.

Required tests:

```text
single replacement
```

```text
multiple applicable replacements
→ affected player chooses
```

```text
apply one replacement
→ event changes
→ applicable set recalculated
```

```text
replacement prevents event entirely
```

```text
multiple players choose
→ APNAP
```

```text
replacement choice suspends
→ serialize
→ restore
→ continue
```

Replacement tests should operate on proposed semantic events, not through card-specific branches.

---

# 26. State-Based Action tests

Each SBA should have isolated tests.

Examples:

```text
zero toughness
lethal damage
Aura legality
Equipment legality
+1/+1 and -1/-1 cancellation
token ceases to exist
zero life
failed draw
commander damage
legend rule
```

For automatic SBAs, test resulting simultaneous changes.

For choice-based SBAs, test:

```text
SBA detects required choice
→ Procedure
→ answer
→ resume same checkpoint
```

---

# 27. Continuous-effect tests

Separate:

```text
CharacteristicsEngine
PlayerEffectEngine
GameRuleEffectEngine
```

Test characteristics independently from legality rules.

Examples:

## Characteristics

```text
type changes
keyword grants
power/toughness
counters
timestamps
dependencies
```

## Game Rule Effects

```text
casting restriction
casting permission
attack restriction
block restriction
land-play modification
maximum hand size
cost modification
can't lose
can't be targeted
```

Avoid making every continuous-effect test depend on a complete card scenario.

---

# 28. Combat tests

Keep integration coverage, but move detailed legality into focused tests.

Test separately:

```text
eligible attackers
attack requirements
attack restrictions
attack costs
Vigilance
defender choice
eligible blockers
Flying / Reach
blocked-state persistence
combat damage assignment
multi-blocker division
commander combat damage
```

Turn-runtime tests should verify that combat procedures begin as turn-based actions rather than Priority actions.

---

# 29. Card acceptance tests

Named-card tests should remain, but become thinner.

Their purpose is:

> Verify that a real authored card compiles to and composes the expected semantic primitives.

For example:

```text
Aetherize:
    authored definition compiles
    resolves by moving all attacking creatures
```

The generic mechanics themselves should already be tested in:

```text
compiler/
vm/
costs/
events/
combat/
```

This allows card coverage to scale to hundreds or thousands of cards without duplicating full engine tests for every primitive.

---

# 30. Supported-card catalog tests

Keep catalog-wide validation tests.

For every card marked:

```text
automationStatus = implemented
```

verify:

```text
schema valid
semantic compiler valid
all referenced handlers exist
all referenced token definitions exist
all target/binding references resolve
```

A card should not be considered implemented merely because its JSON parses.

---

# 31. Persistence matrix

Persistence is a core engine requirement.

Maintain explicit tests that serialize and restore at every rules interruption.

Required suspension points:

```text
mulligan
cast mode choice
cast X choice
target selection
cost selection
payment
payment ordering
resolution choice
replacement choice
SBA choice
trigger ordering
trigger target selection
declare attackers
attack payment
declare blockers
combat damage assignment
cleanup discard
Commander choice
```

For every suspension:

```text
serialize
→ restore
→ answer
→ continue
```

must produce the same logical result as uninterrupted execution.

---

# 32. Stale procedure matrix

Every newly exposed player choice gets a fresh procedure ID.

For every Procedure type, test:

```text
answer old ID
→ rejected
→ no mutation
```

This is especially important when one resolving instruction creates multiple sequential choices.

---

# 33. Hidden-information matrix

Every private procedure should be tested from:

```text
acting player's view
opponent's view
```

Verify:

```text
acting player sees permitted options
opponent sees no private option IDs
opponent cannot infer hidden card IDs through serialized JSON
opponent cannot answer procedure
```

For public information such as a spell already on the Stack, verify that it remains visible to opponents even while its controller has private pending choices.

---

# 34. Test helper migration

Common helpers from the current suite should be extracted into test infrastructure.

Likely helpers include:

```text
create Commander game
seed card
seed permanent
set mana
pass Priority
pass all players
answer pending procedure
serialize/restore Match
project player view
```

Do this before splitting large blocks of tests.

This minimizes mechanical duplication.

---

# 35. Avoid excessive mocking

Rules subsystem tests should prefer small real domain state over mocking every dependency.

Useful fakes include:

```text
deterministic RandomSource
small Catalog
small MatchState
```

Avoid mocking:

```text
every zone operation
every object lookup
every event
```

because rules correctness often depends on subsystem interaction.

---

# 36. Test levels

Use roughly four levels.

## Level 1 — Primitive unit tests

Fast and numerous.

```text
compiler
filters
selectors
values
effect handlers
cost handlers
SBA rules
```

## Level 2 — Runtime tests

```text
RuleVM
CostRuntime
TriggerRuntime
PriorityCheckpoint
ReplacementRuntime
StackProposalProcedure
```

## Level 3 — Domain integration tests

```text
casting
resolution
combat
cleanup
Commander
```

using real MatchState and runtime composition.

## Level 4 — MatchService acceptance tests

Fewer tests.

Exercise:

```text
MatchAction
→ server
→ authoritative state
→ player view
```

including hidden information and persistence.

---

# 37. Migration sequence

Migrate the test suite alongside the architecture. Phases follow the milestones in rules-engine-refactor.md §63. The executable order is [roadmap.md](roadmap.md); its issues name the test-plan sections they implement.

## Milestone M1 — Foundations

### Phase 0

Keep current `rules.spec.ts` green.

Treat it as characterization coverage.

### Phase 1

Add the fast runner (§3.1) and round-trip mode (§3.2).

Extract test helpers and the Scenario Builder. Replace direct `match.*` setup in the characterization suite with builder and `force` calls (§3.3).

Do not change rules behavior.

### Phase 2

Add compiler, DSL expressiveness and DSL migration tests (§17) before introducing the version 2 schema and the Rules Compiler.

Migrate catalog-validation assertions and the inline version 1 definitions in tests.

Before deleting the stored derived fields, add the card model tests (card-model-refactor.md §7):
- derivation reproduces the stored values for all definitions, plus one fixture per multi-face layout;
- re-importing leaves `authored` unchanged;
- version 1 room snapshots upgrade and continue;
- every Game Object has an owner.

## Milestone M2 — Execution

### Phase 3

Add event-seam tests: every zone change, draw, damage and life change goes through `propose` and is seen by trigger observation.

### Phase 4

Add Effect Handler tests.

Then extract effect handlers from `Resolution`.

Keep integration tests green.

### Phase 5

Add Rule VM tests.

Then move resolution execution behind the VM.

### Phase 6

Add Stack Resolution Runtime tests (§22).

## Milestone M3 — Automatic rules

### Phase 7

Add Priority Checkpoint and SBA tests.

Then centralize Priority grants and extract the SBA registry.

### Phase 8

Add Trigger Runtime tests.

Then migrate trigger placement and APNAP handling.

## Milestone M4 — Proposals

### Phase 9

Add Cost Runtime tests.

Then extract payment handling.

### Phase 10

Add Stack Proposal tests.

Then refactor casting/activation to CR 601/602 order.

At this phase, rewrite tests that expect pending spells not to exist on the Stack, and add hidden-information tests for the provisional stack spell (§12, §33).

### Phase 11

Add Procedure Runtime tests.

Then remove procedure-kind branching from the central engine.

## Card-driven phases

### Event and replacement runtime

Add Event and Replacement Runtime tests.

Then centralize proposed-event processing.

### Game Rule Effects

Add Game Rule Effects tests.

Then migrate legality queries.

## Final

Split the remaining characterization suite into domain integration and card acceptance files.

Delete the monolithic file only after every case has been accounted for.

---

# 38. Per-test migration checklist

When moving an existing test, ask:

### 1. What behavior is actually being protected?

Example:

```text
"pending.stage === targets"
```

may really mean:

```text
the player must choose a target before payment
```

Preserve the latter.

### 2. Is the assertion externally observable?

If yes:

```text
keep in integration
```

If no:

```text
move to subsystem test
```

### 3. Does the behavior conflict with the CR-aligned architecture?

If yes:

```text
rewrite expectation
```

Do not preserve a bug as a compatibility contract.

### 4. Is the named card important?

If the card is only being used to exercise a generic primitive:

```text
add primitive test
+
keep one card smoke test
```

### 5. Does the test cover reconnect or privacy?

If yes, preserve an integration-level version.

These are system-level guarantees.

---

# 39. Coverage requirements during migration

At no point should a subsystem extraction reduce coverage of its existing behavior.

Before removing old implementation code:

1. identify existing characterization tests covering it;
2. add focused subsystem tests;
3. run old and new tests together;
4. perform the refactor;
5. keep relevant integration tests;
6. remove redundant characterization assertions only afterward.

---

# 40. Definition of done

The test refactor is complete when:

1. Every original test has been classified as Preserve, Move, or Change.

2. No original behavioral scenario has disappeared without an explicit reason.

3. `rules.spec.ts` no longer acts as the only source of rules coverage.

4. The Rules Compiler has focused tests, including the DSL expressiveness set and the version 1 → version 2 migration.

5. Every Effect Handler has focused tests.

6. Every Cost Handler has focused tests.

7. Rule VM suspension/resume is directly tested.

8. Stack Proposal CR 601/602 transitions are directly tested.

9. Priority Checkpoint repeat-until-stable behavior is directly tested.

10. State-based actions are directly tested.

11. Trigger batching and APNAP placement are directly tested.

12. Replacement/prevention processing is directly tested.

13. Persistence is tested at every important interruption point.

14. Hidden information is tested independently from ordinary rules behavior.

15. Integration tests no longer depend unnecessarily on internal field names or runtime representation.

16. Named-card tests primarily validate composition, not the implementation of every primitive.

17. The Scenario Builder isolates tests from incidental MatchState layout.

18. Test failures identify the subsystem responsible more clearly than the current monolithic suite.

19. The MatchService acceptance suite remains as the final guarantee that all subsystems compose correctly for browser multiplayer.

---

# 41. Final testing model

The desired testing pyramid is:

```text
                    Card / Match Acceptance
                     relatively few tests
                           /\
                          /  \
                         /    \
                 Domain Integration
              casting / triggers / combat
                      /          \
                     /            \
               Runtime / Procedure Tests
            VM / Cost / Priority / Events
                  /                  \
                 /                    \
          Primitive Rules Unit Tests
     Compiler / Handlers / SBA / Filters
```

The existing suite should be treated as the source of truth for current supported behavior during migration.

The target is not to reduce rules coverage.

The target is to move that coverage to the architectural level where each rule can be understood, tested, and extended independently.
