# Rules Engine Architecture & DSL Refactor Specification

## 1. Purpose

Refactor the MTG rules engine into a structured, extensible architecture capable of supporting significantly more of the Magic: The Gathering Comprehensive Rules without central modules growing proportionally with every new mechanic.

The architecture separates three fundamentally different concerns:

```text
STATE
"What is the game currently doing?"
        ↓
Match Statechart
```

```text
PROCEDURE
"What rules process or player interaction is currently in progress?"
        ↓
Procedure Runtime
```

```text
PROGRAM
"What does this spell or ability mean?"
        ↓
Rules AST + Rule VM
```

The central architectural principle is:

> The Match is a state machine.  
> Rules procedures are resumable workflows.  
> Card abilities are programs.

The current implementation already contains primitive forms of all three. The refactor MUST evolve those existing concepts rather than replace the engine with a full rewrite.

The card rules DSL is redesigned first, in [dsl-redesign.md](dsl-redesign.md). The runtime described here consumes that DSL's Core AST.

## Normative language

- **MUST** marks an invariant (§3) or a Comprehensive Rules correctness requirement of the target state.
- **SHOULD** marks the intended design. Deviations need a reason recorded in the relevant issue or ADR.
- **OPTIONAL (deferred)** marks a design that is kept on record but not scheduled until a supported card needs it.

---

# 2. Normative rules target

The implementation SHOULD target the current Magic Comprehensive Rules.

The architecture is specifically designed around the following major rule areas:

- CR 101 — Golden Rules and APNAP choices
- CR 115 — Targets
- CR 116 — Special Actions
- CR 117 — Timing and Priority
- CR 118 — Costs
- CR 400 — Zones and object identity
- CR 500–514 — Turn structure
- CR 601 — Casting spells
- CR 602 — Activating abilities
- CR 603 — Triggered abilities
- CR 605 — Mana abilities
- CR 608 — Resolving spells and abilities
- CR 609 — Effects
- CR 611–613 — Continuous effects
- CR 614–616 — Replacement and prevention effects
- CR 703 — Turn-based actions
- CR 704 — State-based actions
- CR 733 — Illegal actions
- CR 800+ — Multiplayer rules
- CR 903 — Commander

The architecture MUST allow card-specific rules to override baseline game rules where the Comprehensive Rules permit them.

---

# 3. Architectural invariants

The following are non-negotiable.

## Server authority

The server is the only authoritative rules executor.

Browsers submit intentions and choices. They never decide authoritative:

- legality;
- target validity;
- costs;
- resolution;
- Priority;
- triggers;
- state-based actions;
- outcomes.

## Persistence

Any rules process that pauses for player input MUST be represented entirely by serializable Match state.

The following must work:

```text
execute
→ suspend
→ persist
→ disconnect
→ restore
→ answer
→ resume
```

without repeating completed rules operations.

## Atomicity

Rejected commands MUST leave authoritative Match state unchanged.

Cost payment MUST either completely succeed or commit nothing.

## Determinism

Given:

```text
MatchState
+ MatchAction
+ explicit randomness
```

rules execution SHOULD produce the same result.

## Declarative cards

Cards SHOULD compose reusable Magic semantics.

Prefer:

```json
{
  "kind": "draw",
  "count": 2
}
```

over:

```json
{
  "kind": "execute-special-card"
}
```

## Semantic boundaries

The engine MUST distinguish:

- actions taken with Priority;
- special actions;
- turn-based actions;
- state-based actions;
- casting/activation procedures;
- Stack resolution;
- resolution-time choices;
- replacement/prevention choices;
- trigger placement;
- mana ability windows.

These may share persistence infrastructure, but they are not equivalent rules events.

---

# 4. Target architecture

```text
                       Browser
                          |
                          v
                  Room / MatchService
                          |
                          v
                     RulesEngine
                          |
                          v
                   Game Statechart
                          |
          +---------------+----------------+
          |               |                |
          v               v                v
      Priority       Turn Runtime    Procedure Runtime
          |                                |
          |                        +-------+-------+
          |                        |               |
          v                        v               v
  Priority Actions          Stack Proposal    Other Procedures
          |                        |
          |                        v
          |                   Stack Object
          |                        |
          +------------------------+
                          |
                          v
                Stack Resolution Runtime
                          |
                +---------+---------+
                |                   |
                v                   v
          Permanent Path          Rule VM
                                      |
                                      v
                               Semantic Effects
                                      |
                                      v
                                 Event Runtime
                                      |
                        +-------------+-------------+
                        |                           |
                        v                           v
                Replacement /                State Mutation
                  Prevention                        |
                        |                           v
                        +------------------> Trigger Runtime
                                                    |
                                                    v
                                           Priority Checkpoint
                                                    |
                                    +---------------+---------------+
                                    |                               |
                                    v                               v
                            State-Based Actions             Trigger Placement
                                    |                               |
                                    +---------------+---------------+
                                                    |
                                                    v
                                                 Priority
```

---

# 5. RulesEngine

`RulesEngine` SHOULD become an orchestration façade.

Its responsibilities are:

- map participants to Match Players;
- reject actions after Match completion;
- identify the current rules mode;
- dispatch commands;
- invoke the Game Statechart;
- coordinate subsystem transitions;
- expose shared domain services.

It SHOULD NOT remain responsible for directly implementing every:

- effect;
- cost;
- combat choice;
- trigger;
- state-based action;
- continuous effect;
- special action.

Target shape:

```ts
class RulesEngine {
  constructor(
    readonly context: RulesContext,
    readonly game: GameStatechart,
    readonly procedures: ProcedureRuntime,
    readonly resolution: StackResolutionRuntime,
    readonly checkpoint: PriorityCheckpoint,
  ) {}

  apply(
    participant: Participant,
    action: MatchAction,
  ): void {
    this.game.dispatch(
      this.context,
      participant,
      action,
    );
  }
}
```

---

# 6. RulesContext

Subsystems SHOULD depend on a shared domain context instead of the complete `RulesEngine`.

The context is split into a read-only query view and a mutator, so that a subsystem's dependencies show whether it can change game state. Legality queries, the characteristics engine, selectors and cost planning receive only `RulesQuery`.

```ts
interface RulesQuery {
  readonly match: Readonly<MatchState>;
  readonly catalog: Catalog;

  object(id: ObjectId): GameObject;

  zone(
    kind: ZoneKind,
    playerId?: PlayerId,
  ): ZoneState;

  owner(
    object: GameObject,
  ): PlayerId;

  effective(
    object: GameObject,
  ): Characteristics;

  matches(
    object: GameObject,
    predicate: Predicate,
    playerId: PlayerId,
    source?: ObjectReference,
  ): boolean;
}

interface RulesMutator {
  readonly query: RulesQuery;

  propose(
    event: SemanticEvent,
  ): EventResult;
}
```

Elsewhere in this document, `RulesContext` means a `RulesMutator` (which carries its query view). Interfaces that only read state take `RulesQuery`.

`move` is not exposed directly. Zone changes go through `propose` so that replacement effects and trigger observation always see them (§41). Until the replacement runtime exists, `propose` applies the event unchanged.

The context is a domain façade, not an attempt to make the model immutable.

---

# 7. Match Statechart

The Match Statechart answers:

> What category of rules processing happens next?

Conceptually:

```text
Match
├── Setup
│   ├── StartingPlayer
│   ├── CommanderSetup
│   ├── Shuffle
│   ├── DrawOpeningHands
│   ├── Mulligans
│   └── PregameActions
│
├── Playing
│   ├── Turn
│   ├── Priority
│   ├── Procedure
│   ├── StackResolution
│   └── PriorityCheckpoint
│
└── Complete
```

This SHOULD be hierarchical rather than a single flat FSM.

The engine SHOULD initially derive high-level state from existing Match fields rather than introduce a competing persisted state variable.

---

# 8. Rules action categories

The engine MUST explicitly distinguish the categories below.

## Priority actions

Actions normally initiated while a player has Priority:

- cast a spell;
- activate a non-mana activated ability;
- take an available special action;
- pass Priority.

## Mana abilities

Mana abilities may be activated in additional windows, including while casting/activating something that requires mana or when another rule/effect requests mana payment.

They are not ordinary Stack interactions.

## Turn-based actions

Automatically performed by game rules at particular turn steps.

Examples:

- draw-step draw;
- declaring attackers;
- declaring blockers;
- assigning combat damage;
- cleanup operations.

They occur outside ordinary Priority action dispatch.

## State-based actions

Automatically checked at the Priority checkpoint.

They do not use the Stack.

## Resolution choices

A resolving spell or ability may require players to make decisions.

No player has Priority during these decisions.

## Replacement/prevention choices

A proposed event may require a player to select among competing applicable replacement/prevention effects.

No Priority is granted while this decision is made.

These distinctions MUST remain visible in the architecture.

---

# 9. Turn Runtime

Turn steps SHOULD be represented as named domain values.

```ts
type TurnStep =
  | "untap"
  | "upkeep"
  | "draw"
  | "precombat-main"
  | "begin-combat"
  | "declare-attackers"
  | "declare-blockers"
  | "combat-damage"
  | "end-combat"
  | "postcombat-main"
  | "end"
  | "cleanup";
```

Existing numeric `stepIndex` values MAY remain during migration with a mapping layer.

Turn Runtime owns:

- step transitions;
- phase transitions;
- turn-based actions;
- mana-pool expiration;
- determining when Priority would next be granted.

Turn Runtime MUST NOT directly bypass the Priority Checkpoint when a player would receive Priority.

---

# 10. Priority Runtime

Priority SHOULD have a dedicated subsystem.

```ts
type PriorityResult =
  | {
      kind: "next-player";
      playerId: PlayerId;
    }
  | {
      kind: "resolve-stack";
    }
  | {
      kind: "end-step-or-phase";
    };
```

Passing works conceptually as:

```text
Player passes
      |
      v
All players passed in succession?
      |
   +--+--+
   |     |
  no    yes
   |     |
   v     v
next   Stack nonempty?
player   |
       +-+-+
       |   |
      yes  no
       |   |
       v   v
    resolve end step/phase
```

Any player action that interrupts the succession of passes resets that succession.

---

# 11. Priority Checkpoint

This is a first-class architectural component.

Whenever a player **would receive Priority**, the engine MUST run the Priority Checkpoint first.

Conceptually:

```text
WOULD RECEIVE PRIORITY
        |
        v
CHECK ALL SBAs
        |
        v
perform applicable SBAs simultaneously
        |
        v
did anything happen?
   yes--+
        |
        +------> CHECK SBAs AGAIN
        |
       no
        |
        v
PLACE WAITING TRIGGERS
        |
        v
did SBA/trigger work occur?
   yes--+
        |
        +------> CHECK SBAs AGAIN
        |
       no
        |
        v
GRANT PRIORITY
```

This loop MUST continue until:

```text
no applicable SBA
AND
no trigger waiting for placement
```

Only then is Priority granted.

State-based actions MUST NOT normally run in the middle of a resolving spell or ability.

---

# 12. Procedure Runtime

A Procedure represents a resumable rules process.

Procedures include, among others:

```text
cast
activate
trigger-placement
trigger-order
trigger-target
replacement-choice
state-based-choice
cleanup-discard
declare-attackers
attack-payment
declare-blockers
combat-damage
commander-return
resolution-choice
```

Every Procedure MUST:

- contain serializable state;
- identify the responsible player;
- use a current procedure ID;
- revalidate answers;
- survive process restarts;
- never require an in-memory callback.

Suggested interface:

```ts
interface ProcedureHandler<
  P extends PendingProcedure
> {
  handle(
    ctx: RulesContext,
    procedure: P,
    action: MatchAction,
  ): ProcedureResult;
}
```

```ts
type ProcedureResult =
  | { kind: "continue" }
  | { kind: "await-input" }
  | { kind: "complete" }
  | { kind: "rollback" };
```

---

# 13. Unified Stack Proposal Procedure

Casting spells and activating abilities share most of the same Comprehensive Rules process.

They SHOULD therefore share a reusable:

```text
StackProposalProcedure
```

specialized into:

```text
SpellProposal
ActivatedAbilityProposal
```

The process MUST follow CR 601/602 ordering.

---

# 14. Casting procedure

Casting MUST conceptually proceed as follows:

```text
BEGIN CAST
    |
    v
MOVE CARD TO STACK
    |
    v
ANNOUNCE CAST CHOICES
    |
    ├── modes
    ├── alternative cost
    ├── additional costs
    ├── X / variables
    ├── hybrid choices
    └── Phyrexian choices
    |
    v
CHOOSE TARGETS
    |
    v
CHOOSE DISTRIBUTIONS / DIVISIONS
    |
    v
CHECK PROPOSAL LEGALITY
    |
    v
DETERMINE TOTAL COST
    |
    v
LOCK TOTAL COST
    |
    v
MANA ABILITY WINDOW
    |
    v
PAY TOTAL COST
    |
    v
FINALIZE CAST
    |
    v
CAST TRIGGERS BECOME WAITING
    |
    v
PRIORITY CHECKPOINT
```

The important architectural implication is:

> The card becomes a provisional Stack Game Object at the beginning of casting, not only after payment succeeds.

The pending procedure therefore refers to the Stack object being proposed.

---

# 15. Activated abilities

Activation follows the same general procedure.

Before choices and payment:

```text
source ability
      |
      v
create Ability Game Object on Stack
```

Then reuse the casting procedure from the announcement stage onward.

Conceptually:

```text
BEGIN ACTIVATION
      |
      v
CREATE STACK ABILITY
      |
      v
ANNOUNCE CHOICES
      |
      v
TARGETS
      |
      v
DISTRIBUTION
      |
      v
LEGALITY
      |
      v
LOCK COST
      |
      v
MANA WINDOW
      |
      v
PAY
      |
      v
FINALIZE
```

Mana abilities are handled separately.

---

# 16. Illegal actions and rollback

Do not model CR legality failure as a generic user cancellation.

Distinguish:

```text
UI cancel before committing a rules action
```

from:

```text
rollback of an illegal proposed action
```

If a casting/activation proposal becomes illegal while being performed, the rules state must return to the state before the proposal began.

The existing MatchService transaction/copy boundary SHOULD be exploited for this.

A proposal can execute against a transactional working state:

```text
base MatchState
      |
      v
proposal working copy
      |
   +--+--+
   |     |
 legal illegal
   |     |
   v     v
commit rollback
```

This is preferable to manually undoing arbitrary mutations.

## Cancel semantics (decided)

The current `cancel-procedure` action is a **UI abort**, not a rules concept.

- A player may abort their own casting or activation proposal at any stage **before the total cost is locked** (CR 601.2f / 602.2b). The working copy is discarded, and the Match is exactly as it was before the proposal began.
- Mana abilities activated during an aborted proposal are discarded with the working copy, the same as an illegal-proposal rollback.
- After the cost is locked, abort is no longer offered. The only way out is completing payment or a **rules rollback** because the proposal can't legally be completed.
- Turn-based procedures (declare attackers or blockers, combat damage, cleanup discard), resolution choices, trigger ordering and targeting, replacement choices and state-based choices cannot be aborted. This matches the current exclusion list in `RulesEngine.apply()`.
- `attack-payment` abort returns to declaring attackers, as today.

Tests that use `cancel-procedure` are classified Change in the characterization file headers (`tests/rules/characterization/`) and rechecked against this rule in roadmap issue 10.

---

# 17. Special Action Runtime

Playing a land SHOULD not remain a unique hard-coded exception.

Introduce:

```ts
interface SpecialActionHandler {
  available(
    ctx: RulesContext,
    playerId: PlayerId,
  ): boolean;

  execute(
    ctx: RulesContext,
    playerId: PlayerId,
    input: SpecialActionInput,
  ): void;
}
```

Examples of Special Actions include:

- playing a land;
- turning certain face-down permanents face up;
- Companion;
- Foretell;
- Suspend-related actions;
- effects explicitly defining special actions.

The architecture does not need to implement every category immediately.

It MUST provide the extension point.

---

# 18. Card definitions and authored Rules AST

The card JSON remains the authoring language, but its rules schema is redesigned before the runtime refactor. The current schema grew around individual cards: one-off effect kinds and flags, an ability shape of optional fields, flag-based filters, single object targets and hard-coded token and keyword enums. See [dsl-redesign.md](dsl-redesign.md) for the evidence, the design rules and the version 2 authored AST.

Not all card JSON is executable AST.

```text
Card Definition
├── Metadata
├── Printed Characteristics
└── Abilities
    ├── Ability Declaration
    └── Rules AST
```

The executable rules program primarily begins under:

```text
ability.rules
```

Example (version 2):

```json
{
  "id": "bounce",
  "kind": "activated",
  "costs": [
    { "kind": "mana", "symbols": ["{U}"] },
    { "kind": "sacrifice-source" }
  ],
  "targets": [
    { "id": "creature", "filter": { "zone": "battlefield", "type": "Creature" } }
  ],
  "effects": [
    { "kind": "move", "objects": { "target": "creature" }, "to": "hand" }
  ]
}
```

The version 1 form (`"target": {...}`, `"subject": "target"`) is accepted only during migration (dsl-redesign.md §9).

---

# 19. Rules Compiler

Introduce an explicit compilation pipeline:

```text
Card JSON
    |
    v
Schema Validation
    |
    v
Authored Rules AST
    |
    v
Semantic Validation
    |
    v
Normalization / Desugaring
    |
    v
Core Rules AST
    |
    v
Rule VM
```

The authored AST is optimized for card authors.

The Core AST is optimized for rigorous rules execution.

---

# 20. Semantic validation

The compiler SHOULD detect invalid definitions before a Match starts.

Examples:

```text
invalid ability/zone combination
unknown effect kind
invalid selector
unknown token descriptor
target reference does not exist
binding read before definition
movement without destination
mana ability requiring targets
mana ability interacting with Library illegally
invalid source reference
unsupported rule construct
```

For example, an ability declared as a spell but configured to apply only from the Battlefield should fail validation.

---

# 21. Core Rules AST

The compiler may expand concise authored syntax.

For example:

```json
{
  "kind": "move",
  "subject": "target",
  "destination": "hand"
}
```

may normalize conceptually into:

```ts
{
  kind: "move",

  subject: {
    kind: "target-ref",
    targetId: "target-0",
  },

  destination: {
    zone: "hand",
    player: {
      kind: "owner-of-subject",
    },
  },
}
```

Authors should not need to write this low-level structure manually.

---

# 22. Target declarations

Targets MUST be modeled as distinct target clauses.

This matters because Magic distinguishes multiple objects chosen for one instance of "target" from multiple separate instances of the word "target."

Recommended model:

```ts
interface TargetDeclaration {
  id: string;

  min: number;
  max: number;

  filter: TargetFilter;
}
```

Example:

```json
{
  "targets": [
    {
      "id": "artifact",
      "min": 1,
      "max": 1,
      "filter": {
        "zone": "battlefield",
        "types": ["Artifact"]
      }
    },
    {
      "id": "creature",
      "min": 1,
      "max": 1,
      "filter": {
        "zone": "battlefield",
        "types": ["Creature"]
      }
    }
  ]
}
```

Effects then use explicit references:

```json
{
  "kind": "destroy",
  "subject": {
    "target": "artifact"
  }
}
```

Backward compatibility MAY normalize:

```text
target
```

into:

```text
target-0
```

for simple existing definitions.

---

# 23. Selectors

Non-target object selection SHOULD use a distinct Selector AST.

Potential selectors include:

```text
Source
Target
AllMatching
Chosen
Created
EventObject
Attached
Linked
Binding
```

Example:

```ts
type ObjectSelector =
  | {
      kind: "source";
    }
  | {
      kind: "target";
      targetId: string;
    }
  | {
      kind: "all";
      filter: ObjectFilter;
    }
  | {
      kind: "binding";
      name: string;
    };
```

This prevents conflating:

```text
targeting
```

with:

```text
objects affected during resolution
```

which are distinct MTG concepts.

---

# 24. Set semantics

Set effects MUST preserve simultaneous semantics.

For example:

```text
Return all attacking creatures
```

is represented as:

```text
Move(AllMatching(...))
```

rather than semantically becoming:

```text
for each object:
    move object
```

The implementation may iterate internally, but it MUST:

1. determine the complete affected set;
2. capture required pre-change information;
3. process the movement as one simultaneous rules event where required.

This is necessary for:

- deaths;
- simultaneous sacrifice;
- destruction;
- trigger detection;
- replacement effects.

---

# 25. Control-flow AST

The Rules DSL may contain structural nodes such as:

```text
sequence
if
alternative
may
choose
for-each-player
```

These should affect VM execution structure instead of adding boolean flags to unrelated effect types.

Prefer:

```json
{
  "kind": "for-each-player",
  "order": "APNAP",
  "effect": {
    ...
  }
}
```

over continuously adding fields such as:

```text
eachPlayer
optional
repeat
simultaneous
```

to arbitrary semantic effects.

---

# 26. APNAP Choice Runtime

CR APNAP semantics are broader than trigger ordering.

Introduce reusable infrastructure for:

```text
multiple players need to choose
        |
        v
active player chooses
        |
        v
nonactive players choose in turn order
        |
        v
all chosen actions happen simultaneously
```

This MAY be used by:

- resolving effects;
- replacement effects;
- state-based choices;
- multiplayer mechanics.

A rule like:

```text
Each player sacrifices a creature.
```

therefore differs from:

```text
All colored permanents are sacrificed.
```

The former requires per-player choices before simultaneous action.

The latter may determine the complete set directly.

---

# 27. Values and bindings

Rules values form another AST family.

Example:

```ts
type RulesValue =
  | number
  | {
      binding: string;
    }
  | {
      count: ObjectSelector;
    }
  | {
      sum: RulesValue[];
    }
  | {
      handSize: PlayerReference;
    };
```

Bindings represent execution results such as:

```text
X
cardsDrawn
objectsMoved
objectsTapped
manaPaid
selectedCount
```

They MUST be persisted with VM state.

---

# 28. Stack Resolution Runtime

Do not make `RuleVM` responsible for the entire concept of resolving a Stack object.

Introduce:

```text
StackResolutionRuntime
```

It owns the CR-level resolution envelope.

Conceptually:

```text
TOP STACK OBJECT
      |
      v
TRIGGERED ABILITY?
      |
      └─ check intervening-if if applicable
      |
      v
REVALIDATE TARGETS
      |
      v
all required targets illegal?
      |
   +--+--+
   |     |
  yes    no
   |     |
   v     v
fail   determine object category
resolve      |
          +--+----------------+
          |                   |
          v                   v
Instant/Sorcery/Ability   Permanent Spell
          |                   |
          v                   v
        Rule VM          Permanent Resolution
```

---

# 29. Instant, sorcery, and ability resolution

For an instant, sorcery, or ability:

1. check intervening conditions where applicable;
2. revalidate all targets;
3. determine whether the object resolves;
4. execute instructions through Rule VM;
5. allow required resolution-time choices without granting Priority;
6. complete the appropriate Stack cleanup;
7. proceed toward the next Priority Checkpoint.

Effects generally perform as much as possible unless rules or wording require otherwise.

This principle belongs in effect semantics, not in cost semantics.

---

# 30. Permanent spell resolution

Permanent spells SHOULD have a distinct resolution path.

A normal permanent spell does not need an arbitrary empty effect program whose final instruction says "enter the Battlefield."

Its resolution is semantically:

```text
Permanent Spell
      |
      v
target legality if applicable
      |
      v
ENTER BATTLEFIELD EVENT
      |
      v
Replacement processing
      |
      v
Permanent exists on Battlefield
```

Aura and other specialized permanent-spell cases can extend this path.

---

# 31. Rule VM

`RuleVM` executes the Core Rules AST for resolving effects.

It MUST:

- execute instructions sequentially;
- support nested programs;
- support selectors;
- support bindings;
- support conditions;
- suspend for required choices;
- serialize execution state;
- resume without replay;
- remain deterministic.

It MUST NOT own:

- turn progression;
- Priority;
- network transport;
- normal Stack proposal;
- state-based checkpoints.

---

# 32. VM execution state

Target representation:

```ts
interface RuleExecution {
  stackObjectId: ObjectId;
  controllerId: PlayerId;

  frames: ExecutionFrame[];

  bindings: Record<
    string,
    RuntimeValue
  >;
}
```

```ts
interface ExecutionFrame {
  instructions: CoreEffect[];
  pc: number;

  locals?: Record<
    string,
    RuntimeValue
  >;
}
```

This replaces increasingly complex mutation of:

```text
remaining[]
```

with explicit execution frames and program counters.

---

# 33. VM results

```ts
type ExecutionResult =
  | {
      kind: "continue";
    }
  | {
      kind: "suspend";
      procedure: PendingProcedure;
    }
  | {
      kind: "complete";
    };
```

Main loop:

```ts
while (!finished(execution)) {
  const instruction =
    currentInstruction(execution);

  const handler =
    handlers[instruction.kind];

  const result =
    handler.execute(
      instruction,
      context,
      execution,
    );

  if (result.kind === "suspend")
    return result;

  advance(execution);
}
```

---

# 34. Effect Handler Registry

Every Core effect type SHOULD have an independent handler.

```ts
interface EffectHandler<
  E extends CoreEffect
> {
  execute(
    effect: E,
    ctx: EffectContext,
  ): ExecutionResult;
}
```

Example:

```text
effects/
├── draw.ts
├── discard.ts
├── damage.ts
├── move.ts
├── destroy.ts
├── sacrifice.ts
├── exile.ts
├── create-token.ts
├── add-mana.ts
├── add-counters.ts
├── attach.ts
├── conditional.ts
└── sequence.ts
```

Adding an effect SHOULD require:

```text
AST type
+ compiler support
+ handler
+ tests
```

not another central branch.

---

# 35. Cost AST

Costs form a separate DSL family from effects.

Examples include:

```text
Mana
Life
TapSource
TapObjects
CounterSource
SacrificeSource
Sacrifice
DiscardSource
Discard
Return
Crew
Improvise
```

The distinction between cost and effect is fundamental.

## Cost

Must be fully payable.

## Effect

Normally performs as much as possible.

Do not implement both through the same generic "perform operation" abstraction.

---

# 36. Cost Runtime

Cost payment SHOULD use:

```text
determine
→ plan
→ validate complete payment
→ order
→ commit
```

Interface:

```ts
interface CostHandler<
  C extends RuleCost
> {
  plan(
    cost: C,
    ctx: CostContext,
  ): CostPlan;
}
```

Cost plans SHOULD preferably contain data rather than callbacks.

```ts
type CostMutation =
  | {
      kind: "tap";
      objectId: ObjectId;
    }
  | {
      kind: "move";
      objectId: ObjectId;
      destination: ZoneReference;
    }
  | {
      kind: "pay-life";
      playerId: PlayerId;
      amount: number;
    };
```

---

# 37. Cost ordering

Do not permanently commit costs in authored JSON order.

The player paying a spell/ability's total cost generally chooses the order in which eligible cost components are paid, subject to the CR's special ordering rules for costs involving randomness or moving Library objects to public zones.

Therefore:

```ts
interface CostPlan {
  components: PayableCostComponent[];

  ordering:
    | "player-choice"
    | "rules-forced";
}
```

If payment order cannot affect game semantics, the UI MAY automatically choose an order.

If it can matter, a persisted procedure must collect the player's ordering.

**OPTIONAL (deferred).** No supported card has costs whose payment order changes the outcome. The Cost Runtime pays components in a fixed, rules-valid order and keeps the `ordering` field so a payment-order procedure can be added when a card needs it.

---

# 38. Cost locking

Total cost determination follows:

```text
mana cost OR alternative cost
        +
additional costs
        +
cost increases
        -
cost reductions
        |
        v
other direct total-cost adjustments
        |
        v
LOCK COST
```

After this point, changes to the game cannot modify that total cost.

The Mana Ability Window then occurs before payment.

---

# 39. Mana Ability Runtime

Mana abilities require dedicated classification and execution.

Activated mana abilities must be validated according to their actual CR criteria, including that they:

- require no target;
- could produce mana;
- are not loyalty abilities;
- do not move cards into or out of a Library through their cost/effect.

Triggered mana abilities have separate criteria.

Mana abilities:

- resolve immediately;
- normally do not use the Stack;
- may occur inside permitted mana-payment windows.

The compiler SHOULD either derive mana-ability status or validate an authored:

```json
"manaAbility": true
```

annotation.

---

# 40. Semantic Event Runtime

Important game changes SHOULD be represented as semantic events.

Examples:

```text
CastEvent
EnterEvent
ZoneChangeEvent
DrawEvent
AttackEvent
DamageEvent
TargetEvent
ManaEvent
```

Events may retain:

- source;
- affected object;
- player;
- controller;
- owner;
- previous Zone;
- destination Zone;
- pre-change characteristics;
- relevant post-change characteristics;
- damage metadata.

Semantic events are rules data, not UI telemetry.

---

# 41. Proposed events

Where replacement or prevention can apply, mutation should begin as a proposed event.

```text
Rules operation
      |
      v
Proposed Event
      |
      v
Replacement / Prevention Runtime
      |
      v
Final Event
      |
      v
Mutation
      |
      v
Trigger Observation
```

Examples:

```text
would enter Battlefield
would be destroyed
would go to Graveyard
would draw
would deal damage
```

---

# 42. Replacement and Prevention Runtime

Replacement/prevention effects MUST operate before the affected event occurs.

When multiple applicable effects compete:

```text
find applicable effects
       |
       v
determine required chooser
       |
       v
one applicable?
   +---+---+
   |       |
  yes     no
   |       |
   v       v
apply   SUSPEND
        choice procedure
             |
             v
        player chooses
             |
             v
        apply selected
```

After one replacement applies, applicable effects must be evaluated again against the modified event.

Therefore replacement processing is itself resumable.

No Priority is granted while resolving these decisions.

---

# 43. Trigger Runtime

Trigger Runtime SHOULD contain at least:

```text
TriggerRuntime
├── EventTriggerObserver
└── StateTriggerObserver
```

Not every trigger corresponds to a discrete semantic event.

State triggers observe game state becoming true.

Triggered abilities that trigger during casting, resolution, replacement processing, or other actions become waiting triggers. They are not immediately put on the Stack.

---

# 44. Trigger Placement

Trigger placement happens as part of the Priority Checkpoint.

The current CR requires a two-part process when multiple abilities have triggered since the previous Priority opportunity.

Conceptually:

```text
WAITING TRIGGERS
       |
       v
PART 1
triggers whose condition
isn't another ability triggering
       |
       v
APNAP placement
       |
       v
PART 2
remaining triggers
       |
       v
APNAP placement
```

For each player:

```text
one trigger?
    |
    +--> place

multiple triggers?
    |
    v
TriggerOrderProcedure
```

New triggers generated during this process form subsequent waiting work and do not corrupt the batch currently being ordered.

---

# 45. Putting triggered abilities on the Stack

Trigger placement may itself require choices such as:

- mode;
- targets;
- variable target counts;
- divisions/distributions.

Therefore use a reusable:

```text
PutTriggeredAbilityOnStackProcedure
```

which may share lower-level components with `StackProposalProcedure` without treating the triggered ability as "cast."

---

# 46. State-Based Action Runtime

State-based actions SHOULD become independent Rule Objects.

```ts
interface StateBasedRule {
  evaluate(
    ctx: RulesContext,
  ): StateBasedResult;
}
```

```ts
type StateBasedResult =
  | {
      kind: "none";
    }
  | {
      kind: "changes";
      changes: StateBasedChange[];
    }
  | {
      kind: "choice";
      procedure: PendingProcedure;
    };
```

Examples:

```text
ZeroToughness
LethalDamage
AuraLegality
EquipmentLegality
CounterCancellation
TokenCeasesToExist
ZeroLifeLoss
FailedDrawLoss
CommanderDamageLoss
LegendRule
```

---

# 47. State-based choices

Not all SBAs can be represented as automatic changes.

For example, some state-based actions require a player choice.

Therefore the Priority Checkpoint itself must be suspendable:

```text
PriorityCheckpoint
      |
      v
SBA requires choice
      |
      v
StateBasedChoiceProcedure
      |
      v
persist / reconnect
      |
      v
answer
      |
      v
resume same checkpoint
```

Priority MUST NOT be granted midway through this process.

---

# 48. Simultaneous SBA handling

For each SBA check:

1. evaluate the complete current game state;
2. determine every applicable SBA;
3. obtain any required choices according to the rules;
4. perform applicable SBAs simultaneously as one rules event;
5. repeat the SBA check.

For example, lethal creatures are determined before any member of that simultaneous set is moved.

---

# 49. Characteristics Engine

Effective characteristics remain centralized.

Rules code SHOULD use:

```text
effective(object)
```

rather than directly inspecting printed characteristics whenever continuous effects can matter.

---

# 50. Continuous Effects Runtime

Do not make `CharacteristicsCalculator` responsible for every kind of continuous effect.

Split the domain into:

```text
ContinuousEffectRuntime
├── CharacteristicsEngine
├── PlayerEffectEngine
└── GameRuleEffectEngine
```

## CharacteristicsEngine

Computes object characteristics.

## PlayerEffectEngine

Computes continuous effects applying directly to players.

## GameRuleEffectEngine

Answers rules questions modified by continuous effects.

Examples:

```text
Can this spell be cast?
Can this object attack?
Can this object block?
Can this player play another land?
What is the maximum hand size?
What does this spell cost?
Can this player lose?
Can this object be targeted?
```

---

# 51. Continuous-effect layers

Characteristics MUST eventually support the CR layer model.

At minimum the architecture must allow:

```text
Layer 1 — copiable values
Layer 2 — control
Layer 3 — text
Layer 4 — type
Layer 5 — color
Layer 6 — abilities
Layer 7 — power/toughness
```

including:

- relevant sublayers;
- timestamps;
- dependencies.

Do not encode every layer immediately.

Do ensure the architecture does not prevent later implementation.

---

# 52. Rules legality queries

Centralize questions such as:

```ts
canCast(...)
canActivate(...)
canPlayLand(...)
canAttack(...)
canBlock(...)
canTarget(...)
canPay(...)
```

These queries SHOULD compose:

```text
baseline CR rule
      |
      v
permissions
      |
      v
restrictions
      |
      v
continuous game-rule effects
```

The system MUST support Magic's fundamental rule that a prohibition generally wins over an allowance when both apply.

---

# 53. Combat Runtime

Combat remains a dedicated domain subsystem.

```text
combat/
├── combat-runtime.ts
├── combat-legality.ts
├── attackers-procedure.ts
├── attack-cost-procedure.ts
├── blockers-procedure.ts
└── damage-procedure.ts
```

Combat declarations are turn-based actions.

They do not originate from normal Priority.

Flow:

```text
Turn Runtime
     |
     v
Declare Attackers turn-based action
     |
     v
Attacker Procedure
     |
     v
Priority Checkpoint
     |
     v
Priority
```

The same applies to blockers and combat damage.

---

# 54. Object identity

The existing distinction between:

```text
Card Instance
```

and:

```text
Game Object
```

MUST be preserved.

A Zone change normally creates a new Game Object.

The physical Card Instance may persist.

Runtime code MUST NOT assume an Object ID remains valid after a Zone transition.

---

# 55. Rules references to objects

The engine should eventually distinguish:

```ts
type ObjectReference =
  | CurrentObjectReference
  | CardInstanceReference
  | LastKnownInformationReference
  | EventObjectReference
  | LinkedObjectReference;
```

This makes the intended semantics explicit.

For example:

```text
"that card"
```

may require a Card Instance or linked-new-object relationship.

```text
"its power when it died"
```

requires last known information.

```text
"target creature"
```

normally refers to the current targeted Game Object.

---

# 56. Last known information

Rules events SHOULD capture sufficient snapshots for cases where the source or affected object no longer exists in the expected Zone.

This is particularly important for:

- leave-the-Battlefield triggers;
- death triggers;
- source characteristics of abilities;
- damage sources that subsequently moved;
- target legality checks where source information is required.

Snapshots should be semantic and intentional, not indiscriminate copies of the entire Match.

---

# 57. Hidden information

Hidden information MUST remain protected server-side.

Never use:

```text
send everything
+
hide it in the UI
```

as a privacy model.

Player projections must control visibility for:

- Library;
- Hand;
- face-down objects;
- private inspections;
- private choices;
- pending procedures.

Internal VM information such as frames and server-only bindings should not automatically enter the participant view.

## Client and projection impact

Several refactor steps change what the browser receives. Each is planned together with the client change, not after it.

Today `matchView()` (`src/server/match/match-view.ts`) sends the acting player the whole `PendingProcedure` (`...pending`, including the authored `ability`), one flat `legalTargetIds` list and `selectionOptions`. Other players get only `waiting: { playerId, kind }`. The client (`src/client/RulesBoard.tsx`) keys menus on `pending.id` and `pending.stage`.

| Change | Server projection | Client |
|---|---|---|
| DSL version 2 (M1) | Stop spreading the authored `ability` into the view. Send a projected prompt instead: what is being asked, options and labels. | Read prompts, not ability internals. |
| Multiple target clauses (M1–M2) | Legal targets per clause id, replacing the flat `legalTargetIds`. | Target selection per clause, including player targets. |
| Modes (M2) | A mode-choice prompt with min/max. | Mode picker. |
| Provisional stack spell (M4) | The spell is on the stack and visible to every player during casting (CR 601.2a). Controller-only choices (selections not yet public) stay in the acting player's prompt. `object-visibility.ts` treats the provisional spell as public. | Show the proposed spell on the stack for all players, with a "being cast" state. Abort is offered only before cost lock. |
| Procedure kinds and stages (M2–M4) | The projected prompt exposes a stable `promptKind`, not internal stage names. | Key menus on `procedureId` and `promptKind`. |

Hidden-information tests (test plan §33) cover each row from the acting player's view and from an opponent's view.

---

# 58. Persistence model

Persist data, not executable runtime objects.

Persist:

```text
AST nodes
Object IDs
Card Instance IDs
player IDs
procedure IDs
procedure stages
target selections
cost selections
program counters
VM frames
bindings
trigger batches
event snapshots
replacement progress
checkpoint progress
```

Do not persist:

```text
callbacks
closures
Promises
function references
iterators
class instances
```

A process restart must reconstruct the runtime from:

```text
MatchState
+
Catalog
```

---

# 59. Randomness

Random operations SHOULD eventually use an injected source:

```ts
interface RandomSource {
  integer(
    maxExclusive: number,
  ): number;
}
```

Production can use cryptographically appropriate randomness.

Tests can inject deterministic results.

This enables:

- deterministic tests;
- bug reproduction;
- Match replay tooling;
- scenario debugging.

---

# 60. Error model

Introduce typed rules errors.

```ts
class RulesError
  extends Error {
  constructor(
    readonly code: RulesErrorCode,
    message: string,
  ) {
    super(message);
  }
}
```

Possible codes:

```text
NOT_YOUR_PRIORITY
INVALID_TARGET
INVALID_PROCEDURE
STALE_PROCEDURE
CANNOT_PAY_COST
INVALID_SELECTION
ILLEGAL_TIMING
ILLEGAL_ACTION
UNSUPPORTED_RULE
INVALID_CARD_DEFINITION
```

Rules errors are domain errors.

Transport layers decide how they are exposed to clients.

---

# 61. Existing card definitions

The current examples SHOULD remain expressible with little or no additional verbosity.

## Aether Spellbomb

Required semantics:

```text
Activated Ability
├── Mana Cost
├── Sacrifice Source
├── Target Creature
└── Move Target to owner's Hand
```

and:

```text
Activated Ability
├── Mana Cost
├── Sacrifice Source
└── Draw
```

No Aether Spellbomb-specific handler should exist.

## Aetherize

Required semantics:

```text
Move
└── AllMatching
    ├── Battlefield
    ├── Creature
    └── Attacking
       ↓
owner's Hand
```

The movement remains a semantic set operation.

## Sai, Master Thopterist

Required semantics:

```text
Cast Trigger
├── Artifact spell
├── controlled by you
└── Create Thopter
```

plus:

```text
Activated Ability
├── Mana Cost
├── Sacrifice two Artifacts you control
└── Draw
```

## Mind Stone

Required semantics:

```text
Mana Ability
├── Tap Source
└── Add C
```

plus:

```text
Activated Ability
├── Mana Cost
├── Tap Source
├── Sacrifice Source
└── Draw
```

## All Is Dust

Required semantics:

```text
Sacrifice
└── AllMatching
    ├── Battlefield
    └── Colored
```

The complete affected set can be determined before the simultaneous sacrifice.

Its card definition should also satisfy static ability/Zone validation performed by the compiler.

---

# 62. Proposed module structure

```text
rules/
├── engine/
│   ├── rules-engine.ts
│   ├── rules-context.ts
│   └── game-statechart.ts
│
├── turn/
│   ├── turn-runtime.ts
│   └── steps/
│
├── priority/
│   ├── priority-runtime.ts
│   └── priority-checkpoint.ts
│
├── actions/
│   ├── priority-actions.ts
│   └── special-actions/
│
├── procedures/
│   ├── procedure-runtime.ts
│   ├── stack-proposal/
│   ├── cleanup/
│   ├── combat/
│   ├── triggers/
│   ├── replacements/
│   └── state-based/
│
├── compiler/
│   ├── rules-compiler.ts
│   ├── validation.ts
│   ├── normalize-targets.ts
│   ├── normalize-selectors.ts
│   └── normalize-values.ts
│
├── resolution/
│   └── stack-resolution-runtime.ts
│
├── vm/
│   ├── rule-vm.ts
│   ├── execution-state.ts
│   └── effects/
│
├── costs/
│   ├── cost-runtime.ts
│   └── handlers/
│
├── events/
│   ├── event-runtime.ts
│   ├── semantic-events.ts
│   ├── replacements.ts
│   └── prevention.ts
│
├── triggers/
│   ├── trigger-runtime.ts
│   └── trigger-placement.ts
│
├── state-based/
│   ├── state-based-runtime.ts
│   └── rules/
│
├── continuous/
│   ├── characteristics/
│   ├── player-effects/
│   └── game-rule-effects/
│
├── combat/
├── objects/
├── zones/
└── commander/
```

Exact directories are secondary to ownership boundaries.

---

# 63. Migration strategy

The refactor MUST remain incremental.

Phases are grouped into milestones. Each milestone leaves the engine shippable and better than before, so the refactor can pause after any milestone. Phases within a milestone may overlap.

The executable order, with issue dependencies and completion criteria, is [roadmap.md](roadmap.md). This section explains what each milestone delivers and why.

```text
M1  Foundations           test runner, DSL v2, compiler
M2  Execution             effect handlers, Rule VM, Stack Resolution Runtime
M3  Automatic rules       Priority Checkpoint, SBA registry, Trigger Runtime
M4  Proposals             Cost Runtime, casting/activation, Procedure Registry, client
Later (card-driven)       replacements, game-rule effects, layers, statechart
```

Milestone M3 comes before M4 because state-based actions and trigger placement are the most correctness-sensitive code today, while casting is the only milestone that changes player-visible behavior.

---

## Milestone M1 — Foundations

**Outcome:** card authoring is safer and more expressive. Runtime behavior is unchanged.

### Phase 1 — Test runner and characterization

See the test plan (Phases 0–1). The rules suite gets a fast runner without the Playwright web server, and a mode that serializes and restores state after every command.

### Phase 2 — Redesign the authored DSL

Implement version 2 of the authored AST from [dsl-redesign.md](dsl-redesign.md):

```text
Ability union (spell / activated / mana / triggered / static / replacement / keyword)
TargetClause and Modes
Selector
Predicate
Value and Condition
Cost
Effect
Trigger
StaticGrant and Replacement
Token and counter registries
```

Migrate the existing definitions with the script in dsl-redesign.md §9.

In the same migration, apply the [card model refactor](card-model-refactor.md):
- definition files get `imported` and `authored` sections and stop storing derived fields;
- the runtime model drops unsupported and manual-mode fields (ADR-0018);
- `GameObject.ownerId` becomes required;
- room snapshots gain a version and a load-time upgrade.

Do not alter Match rules behavior.

### Phase 3 — Rules Compiler and Core AST

Add:

```text
Authored AST (v2)
      |
      v
RulesCompiler
      |
      v
Core AST
      |
      v
down-compiler to current runtime shapes (temporary)
```

The compiler validates references and context, expands keywords and shorthand, and tags continuous changes with their layer.

Until M2 lands, the down-compiler lowers the Core AST into the shapes the current `Resolution` and `RulesEngine` already execute. Cards that use constructs the current runtime can't run stay unimplemented.

---

## Milestone M2 — Execution

**Outcome:** adding an effect means adding a handler. Resolution is resumable through explicit frames.

### Phase 4 — Event seam

Introduce `RulesMutator.propose(event)` (§6). Initially it applies the event unchanged and reports it to trigger observation.

Route existing zone changes, draws, damage and life changes through it. Effect handlers written in Phase 5 call `propose` instead of mutating directly, so they don't need rewriting when the replacement runtime arrives.

Capture last-known-information snapshots (§56) in zone-change events here, because bindings and selectors in the VM depend on them.

### Phase 5 — Extract effect handlers

Replace the central effect-kind dispatcher in `resolution.ts` with handlers that consume the Core AST.

```text
vm/effects/
├── draw.ts
├── damage.ts
├── move.ts
├── destroy.ts
├── discard.ts
├── create-token.ts
└── ...
```

Keep the current persisted resolution queue initially. The down-compiler from Phase 3 shrinks as handlers replace it.

### Phase 6 — Introduce Rule VM

Wrap the existing:

```text
remaining
bindings
resume
```

behavior in `RuleVM`.

Then evolve toward:

```text
frames
+
program counters
+
typed bindings (numbers and object sets)
```

without changing card semantics.

### Phase 7 — Introduce Stack Resolution Runtime

Move CR-level resolution logic outside the VM.

Separate:

```text
Instant / Sorcery / Ability
```

from:

```text
Permanent Spell
```

and centralize target and intervening-if checks.

**As built (roadmap issue 8):** `src/server/rules/vm/rule-vm.ts` holds the VM. `RulesState.resolving` is a `RuleExecution` (§32): frames with program counters, typed bindings (`number`, `objects`, `player`) and the waiting handler's state. A handler's nested instructions run in a new frame; the parent's program counter advances first, so nothing re-runs after a restore. `src/server/rules/stack/stack-resolution.ts` is the Stack Resolution Runtime: intervening-if, "some target still legal", then the permanent path (enter, Aura attach) or the VM, then cleanup. Snapshot version 4 turns a version 3 queue into one frame with the waiting instruction at its program counter. Tests: `tests/rules/vm/{execution,bindings,suspension,serialization}.spec.ts` (TP §18) and `tests/rules/procedures/stack-resolution.spec.ts` (TP §22).

---

## Milestone M3 — Automatic rules

**Outcome:** every Priority grant passes one checkpoint. State-based actions and triggers are independently testable.

### Phase 8 — Priority Checkpoint

Centralize:

```text
state-based actions
trigger placement
repeat-until-stable
Priority grant
```

behind `PriorityCheckpoint`.

Every path that grants Priority MUST go through it. Inventory the current callers first (`pass`, combat, commander, cleanup, setup).

### Phase 9 — State-Based Rule Registry

Extract individual SBAs from the existing `RulesEngine.checkpoint()` implementation.

Add support for suspendable SBA choices.

### Phase 10 — Trigger Runtime

Centralize:

- event triggers;
- state triggers;
- waiting triggers;
- two-part APNAP placement;
- triggered-ability Stack setup.

---

## Milestone M4 — Proposals

**Outcome:** casting and activation follow CR 601/602, with atomic rollback. This is the milestone that changes player-visible behavior.

### Phase 11 — Extract Cost Runtime

Split payment into:

```text
cost determination
planning
validation
commit
```

Add independent Cost Handlers.

Preserve existing successful payment behavior while removing central cost branching. Player-chosen payment order is deferred (§37).

### Phase 12 — Refactor casting and activation

Introduce `StackProposalProcedure`.

Change casting so the proposed spell becomes a provisional Stack object at the start of CR 601.2a.

Change activation so the ability object is created at the start of CR 602.2a.

Use transactional rollback for failed proposals. Apply the cancel semantics from §16.

Ship the projection and client changes from §57 in the same change.

### Phase 13 — Procedure Registry

Move pending-procedure dispatch out of `RulesEngine.apply()` and `RulesEngine.input()`.

Migrate:

```text
cast
activate
resolution
trigger choices
combat
cleanup
commander choices
```

into registered handlers.

---

## Later — card-driven

Schedule each of these when a card in the target pool needs it. The DSL can already express the cards (dsl-redesign.md §8). These phases add the runtime support.

### Event and replacement runtime

Move from the pass-through `propose` (Phase 4) to:

```text
proposed event
→ replacements/prevention
→ mutation
→ trigger observation
```

Start with `enter-tapped`, which supported cards already use, then life-gain and damage modification.

### Game Rule Effects

Introduce centralized legality queries (§52) and the game-rule grants from the DSL (`cast-timing`, `attack-tax`, `maximum-hand-size`, `untap-restriction` and others).

### Continuous-effect layering

Expand characteristic evaluation toward CR 613 layers as supported cards require those interactions.

### Game Statechart (OPTIONAL, deferred)

Once lower-level boundaries are stable, consider extracting:

```text
setup
turn flow
Priority
Stack resolution
cleanup
```

from `RulesEngine`.

This phase is optional. If deriving the high-level state from existing Match fields (§7) stays simple after M4, skip it.

---

# 64. Testing strategy

Testing SHOULD follow the architectural boundaries.

## Compiler tests

Test:

```text
valid authored AST
invalid AST combinations
target normalization
selector normalization
binding validation
ability/Zone validation
mana-ability validation
```

## Effect Handler tests

Every Effect Handler gets isolated tests.

## Cost Handler tests

Every Cost Handler gets isolated tests.

## VM tests

Test:

```text
sequences
nested frames
conditions
bindings
suspend
resume
serialization
no instruction replay
```

## Stack proposal tests

Test every casting stage independently.

Especially:

```text
Stack object creation
mode choice
X
targets
distribution
cost lock
mana window
payment
rollback
final cast event
```

## Resolution tests

Test:

```text
target revalidation
all targets illegal
partially legal targets
intervening-if
permanent resolution
ability resolution
```

## Priority Checkpoint tests

Test:

```text
SBA
repeat SBA
trigger placement
SBA caused by trigger placement
trigger caused by SBA
eventual Priority
```

## Persistence tests

Serialize and restore during:

```text
casting
target selection
cost payment
resolution choice
replacement choice
SBA choice
trigger ordering
trigger targets
attack declaration
block declaration
damage assignment
cleanup
```

---

# 65. Acceptance criteria

The architecture refactor is complete when the criteria below hold. Each milestone is complete when its own criteria hold:

- **M1:** 9, 10, 11, 12, 18, 31, 35, 36.
- **M2:** 13, 14, 15, 19, 29.
- **M3:** 3, 22, 23, 24, 25.
- **M4:** 4, 5, 6, 7, 16, 32.
- **Card-driven:** 2, 8, 17, 20, 21, 26, 27. These are met when the phase that delivers them is scheduled.

Criteria 1, 28, 30, 33 and 34 apply to every milestone.

1. `RulesEngine` primarily coordinates domain runtimes.

2. Match flow is explicit.

3. Every path granting Priority uses `PriorityCheckpoint`.

4. Casting follows CR 601 ordering.

5. Activation follows CR 602 ordering.

6. Proposed spells/abilities exist on the Stack during their proposal procedure.

7. Illegal proposals can roll back atomically.

8. Special actions are extensible through their own registry.

9. Card JSON is formally an Authored Rules AST, version 2 from dsl-redesign.md.

10. A compiler validates and normalizes Authored AST into Core AST.

11. Targets are represented as explicit target clauses.

12. Non-target affected-object selection uses Selector AST nodes.

13. VM execution is persistent and resumable.

14. `Resolution` no longer grows a central effect-kind conditional.

15. Effects are independently registered handlers.

16. Costs are independently registered handlers.

17. Cost payment supports rule-correct payment ordering. (Deferred, §37.)

18. Mana abilities are validated according to their special CR requirements.

19. Permanent spells and instant/sorcery/ability resolution have distinct resolution paths.

20. Proposed events can pass through replacement/prevention processing before mutation.

21. Replacement/prevention selection can suspend and resume.

22. Event and state triggers are represented distinctly.

23. Trigger placement supports the current two-part APNAP process.

24. State-based actions are independent Rule Objects.

25. SBA evaluation can suspend for required choices without granting Priority.

26. Continuous-effect architecture supports CR layers, timestamps, and dependencies.

27. Continuous game-rule effects have an architectural home separate from object characteristics.

28. Game Object identity remains separate from Card Instance identity.

29. Last known information is modeled intentionally.

30. Hidden information remains server-authoritative.

31. Existing supported cards behave equivalently unless the old behavior conflicts with the Comprehensive Rules. Concretely: the characterization suite passes, with every changed expectation classified as Change in the test plan, and every `automationStatus: "implemented"` definition compiles to an executable form.

32. Existing reconnect guarantees remain intact.

33. Adding a new card using existing semantic primitives normally requires only card JSON.

34. Adding a new reusable rule mechanic normally requires adding a compiler/runtime primitive rather than editing central engine dispatchers.

35. The DSL follows the design rules in dsl-redesign.md §3. No effect kind, ability field or keyword exists for a single card's wording.

36. Every card in the expressiveness test set (dsl-redesign.md §8) is written in the authored AST and passes the compiler.

---

# 66. Contributor workflow

When implementing a card:

```text
Can existing DSL primitives express it?
            |
       +----+----+
       |         |
      yes        no
       |         |
       v         v
 author JSON   What reusable Magic
               semantic is missing?
                    |
                    v
               choose subsystem
                    |
        +-----------+-----------+
        |           |           |
      Effect       Cost      Procedure /
      Handler     Handler      Rule
        |           |           |
        +-----------+-----------+
                    |
                    v
             extend AST if needed
                    |
                    v
             compiler validation
                    |
                    v
                tests
                    |
                    v
              author JSON
```

When extending the AST, apply the design rules in dsl-redesign.md §3: a new kind must name a Comprehensive Rules concept, and no field may be valid only for some values of another field.

Do not begin by asking:

> Where can I add a special case for this card?

Instead ask:

> Which reusable Comprehensive Rules concept is missing from the engine?

---

# 67. Final execution model

```text
                         PLAYER COMMAND
                               |
                               v
                        GAME STATECHART
                               |
              +----------------+----------------+
              |                                 |
              v                                 v
       PRIORITY ACTION                    TURN-BASED ACTION
              |                                 |
      +-------+-------+                         |
      |       |       |                         |
      v       v       v                         v
    Cast   Activate  Special                Combat/etc.
      |       |       |                         |
      +-------+-------+-------------------------+
                      |
                      v
               PROCEDURE RUNTIME
                      |
               [may suspend]
                      |
                      v
              STACK / GAME ACTION
                      |
                      v
            STACK RESOLUTION RUNTIME
                      |
              +-------+-------+
              |               |
              v               v
          RULE VM       PERMANENT PATH
              |               |
              +-------+-------+
                      |
                      v
               PROPOSED EVENT
                      |
                      v
             REPLACEMENT / PREVENTION
                 [may suspend]
                      |
                      v
                  MUTATION
                      |
                      v
             TRIGGER OBSERVATION
                      |
                      v
           WOULD RECEIVE PRIORITY
                      |
                      v
             PRIORITY CHECKPOINT
                      |
            +---------+---------+
            |                   |
            v                   v
          SBAs          TRIGGER PLACEMENT
      [may suspend]        [may suspend]
            |                   |
            +---------+---------+
                      |
                    repeat
                      |
                      v
                 state stable
                      |
                      v
                   PRIORITY
```

The architecture deliberately does **not** model all of Magic as one giant finite-state machine.

Instead:

```text
Match lifecycle
=
Hierarchical Statechart
```

```text
Rules interactions that may pause
=
Persisted Procedures
```

```text
Card semantics
=
Typed Rules AST + Persistent Rule VM
```

```text
Automatic rules enforcement
=
Events + Replacements + Triggers + State-Based Rules
```

This separation provides a path from the current rules engine toward broad Comprehensive Rules support while keeping individual mechanics isolated, testable, persistent, and composable.