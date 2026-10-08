# Rules engine

The rules engine runs rules-enforced Commander Matches and Solo Practice. It
applies legal gameplay actions to Match state, advances turn procedures, resolves
spells and abilities, and records choices that must be completed by a Match
Player. Its behavior comes from the engine code and validated, authored Card
Ability data; it does not interpret Oracle Text as executable rules.

The engine models a supported portion of Magic. Catalog availability is separate
from rules support: a Card Definition is eligible for a Commander Decklist only
when its automation status and all of its abilities satisfy the rules support
checks. The catalog importer preserves authored fields but does not mark imported
cards as implemented. See [ADR-0005](adr/0005-full-catalog-staged-rules-coverage.md)
and [ADR-0016](adr/0016-rules-automated-commander-and-practice.md).

## Boundaries

| Area                                                                                                                                  | Responsibility                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [MatchService](../src/server/match/match.service.ts)                                                                                  | Validates Commander setup, creates initial Match state, and executes gameplay commands on a clone. It publishes the clone for accepted commands and returns accepted, pending, or rejected results.                                   |
| [RulesEngine](../src/server/match/rules-engine.ts)                                                                                    | Validates and applies gameplay actions, produces legal actions, manages Priority and the Stack, and advances turn procedures and checkpoints.                                                                                         |
| [Card DSL](../src/shared/card-dsl.ts)                                                                                                 | Defines the card vocabulary (colors, mana types, zone kinds, characteristics), the version 2 definition file (`imported` and `authored` sections) and the Zod schemas for authored abilities: selectors, predicates, values, targets, effects, costs, triggers, grants and keywords. It imports no other shared module. |
| [Rules Compiler](../src/server/rules/compiler.ts) and [support check](../src/server/rules/support.ts)                                 | The compiler validates and desugars authored abilities into the Core AST the engine runs. The support check names any Core construct the current runtime can't run.                                                                   |
| [Ability readers](../src/server/rules/abilities.ts)                                                                                   | Answer what the engine asks of a Core ability: its target clause, costs, mana production, trigger subject, intervening-if, keywords, static grants and continuous effects.                                                            |
| [Rules context](../src/server/rules/context.ts) and [event runtime](../src/server/rules/events/event-runtime.ts)                      | `RulesQuery` (read-only view) and `RulesMutator.propose`: every zone change, draw, damage event, life change and object creation is proposed, applied and reported to trigger observation.                                            |
| [Priority Checkpoint](../src/server/rules/priority/priority-checkpoint.ts)                                                            | Every Priority grant runs it: state-based actions until none applies, then waiting triggers onto the Stack, repeated until stable, then Priority. A choice suspends it with its progress in `rules.checkpoint`.                       |
| [State-Based Rules](../src/server/rules/state-based/registry.ts)                                                                      | One rule object per state-based action, evaluated against the same state; the runtime performs all their changes as one simultaneous event, and a rule may require a choice.                                                          |
| [Trigger Runtime](../src/server/rules/triggers/trigger-runtime.ts) and [placement](../src/server/rules/triggers/trigger-placement.ts) | Event and state observers match each source's Core trigger and record waiting triggers; placement puts a batch on the Stack in two parts, each in APNAP order, with ordering and target choices.                                      |
| [Stack Resolution Runtime](../src/server/rules/stack/stack-resolution.ts)                                                             | The resolution envelope for the top Stack object: intervening-if, target revalidation, then the permanent-spell path or the Rule VM, then Stack cleanup.                                                                              |
| [Rule VM](../src/server/rules/vm/rule-vm.ts)                                                                                          | Runs a resolving instruction program: frames with program counters and typed bindings, persisted in `rules.resolving`, suspending for choices and resuming without replay.                                                            |
| [Stack Proposal Procedure](../src/server/rules/proposals/stack-proposal.ts)                                                           | Casting and activation (CR 601/602): the spell or ability is on the Stack from the start, X and targets are chosen, the total cost is locked, mana abilities may be activated, then the cost is paid. Rollback restores the Match from before the proposal. |
| [Cost Runtime](../src/server/rules/costs/cost-runtime.ts)                                                                             | Determines the total cost (printed cost, X, commander tax, reductions), then plans every cost component through one handler per Core cost kind and commits the whole payment or nothing. |
| [Procedure Registry](../src/server/rules/procedures/registry.ts)                                                                      | One handler per pending procedure kind: its input, abort and reversal when it has them, its mana window, options and projected prompt. `RulesEngine.apply` dispatches through it. |
| [Effect handlers](../src/server/rules/vm/effects/registry.ts)                                                                         | One handler per Core effect kind, dispatched through a registry. Each handler runs its instruction, hands back nested instructions (run in a new VM frame), or suspends for a choice; it also reports at load time what it can't run. |
| [Runtime Match state](../src/shared/rules-state.ts)                                                                                   | Defines the persisted Match state: players, Zones and Game Objects, pending procedures, the Rule VM's execution state, continuous effects in force, the rules state, and the Match actions players send. [model.ts](../src/shared/model.ts) holds the catalog, Deck, Room and view types and imports both. |
| [Match view](../src/server/match/match-view.ts)                                                                                       | Builds each participant's projection of Match state, including visible objects, legal actions, and any choice details that participant may see.                                                                                       |
| [Commander support gate](../src/server/match/commander.ts)                                                                            | Validates Commander Decklist rules and checks that each Card Definition has implemented, supported behavior.                                                                                                                          |

Room code owns transport, participant authorization, revision checks, and
database persistence. `MatchService.execute` receives a participant and action
after those checks. A normal rejected action discards the mutated clone. A
rule check that refuses an action throws a
[`RuleViolation`](../src/server/rules/rule-violation.ts), whose message is
written for the player and shown to them; any other error is a bug, logged with
the Match id and the action, and the player sees a generic message. Only a
`RuleViolation` or a Room's `TabletopError` carries text to a client
([player-errors.ts](../src/server/room/player-errors.ts)). A Commander
replacement choice is a special pending procedure that preserves the
interrupted command for resumption after the choice: the action is rolled back
and replayed with the answer (see `CommanderReplacement`).

## Authored rules and coverage

Each Card Definition is one `catalogVersion: 2` file in `catalog/definitions/`
with two sections ([Card Definition files](card-model.md#card-definition-files)):

- `imported`: the form, Card Components, Color Identity and default Printing. A
  set import writes only this section.
- `authored`: the automation status and the card's abilities in the
  [card DSL](card-model.md#card-dsl) version 2. Reviewers own it; a diff
  here is a rules change, and a set import never touches it.

The file stores no derived values. The
[catalog reader](../src/server/catalog/catalog-files.ts) loads each file in
four steps:

1. Parse the file against `cardDefinitionFileSchema`.
2. Derive the canonical name, mana value, keywords, Oracle Text and type lines
   from the components ([derive.ts](../src/server/catalog/derive.ts)).
3. Compile the authored abilities with the Rules Compiler, which checks
   references (targets, bindings, X, links, tokens, counters), expands macro
   keywords and tags layers. An authoring error fails the load with the card
   name and the path.
4. Check the Core AST against the runtime
   ([support.ts](../src/server/rules/support.ts)). The engine runs the
   compiler's Core abilities directly (`CardDefinition.abilities`). The
   support check only walks the ability: each effect, trigger, cost, static
   grant, replacement and keyword registry entry declares, next to its
   runtime code, which forms it runs, and a kind with no entry is rejected
   (`tests/rules/compiler/support-coverage.spec.ts`). An implemented
   card that uses a construct the current runtime can't run fails the load;
   an unimplemented one loads without runtime abilities.

The catalog gate (`tests/rules/compiler/catalog-gate.spec.ts`) compiles every
definition and runs the support check on every implemented one. Publishing
writes each definition back as its version 2 file, so reading and republishing
the catalog reproduces it byte for byte.

Commander setup calls `automationEligible` for every card in the selected
Decklist. It requires an implemented Card Definition, a supported card form,
supported effects in each ability, and an authored implementation for each
keyword. A keyword or Oracle Text alone does not make a behavior executable. Unsupported cards are reported during setup rather than
being silently accepted with partial behavior.

This is a curated rules implementation, not a complete Comprehensive Rules
engine. New card support requires both an authored composition that compiles and
passes the support checks, and engine code that performs its
costs, choices, events, and effects correctly.

## Command and resolution flow

1. `MatchService.createCommander` checks the Decklists, creates Match Players,
   marks each Commander Card Instance, moves commanders to the Command Zone,
   shuffles Libraries, and draws opening Hands. Solo Practice uses the same
   engine with an inert Practice Opponent and a mirror Decklist.
2. For each gameplay command, `MatchService.execute` clones the Match and calls
   `RulesEngine.apply`. The engine checks the acting Match Player, Match outcome,
   current Priority or pending procedure, and the requested action. Accepted
   changes are published together; a pending result identifies the Match Player
   who must answer.
3. `RulesEngine.actions` derives the actions currently available to a Match
   Player. Most gameplay actions require Priority. A pending procedure instead
   accepts only the designated choice or payment, identified by its current
   procedure ID. Match views use the same action generation for the browser.
4. Casting a spell moves the card to the Stack at once (CR 601.2a), and
   activating an ability creates its Ability Game Object there (CR 602.2a).
   The [Stack Proposal Procedure](../src/server/rules/proposals/stack-proposal.ts)
   then suspends for X and targets, determines and locks the total cost
   through the [Cost Runtime](../src/server/rules/costs/cost-runtime.ts), lets
   the Match Player activate mana abilities explicitly, and pays. Payment
   finalizes the proposal: the spell is cast (cast triggers wait) or the
   ability activated. The pending procedure keeps a snapshot of the Match from
   before the proposal began. `cancel-procedure` aborts before the cost is
   locked; after that, `reverse-proposal` rolls back a proposal its player
   can't pay, mana abilities included. The Proposal Record (source Zone,
   chosen values, mana spent) stays with the object, including onto the
   Battlefield.
5. After all Match Players pass Priority, the top Stack object resolves
   through the [Stack Resolution Runtime](../src/server/rules/stack/stack-resolution.ts).
   A triggered ability's intervening-if is checked again and targets are
   revalidated; an object whose condition is false or whose targets are all
   illegal leaves the Stack without effect. A permanent spell enters the
   Battlefield (an Aura attaches to its target) without an effect program.
   An instant, sorcery or ability runs its Core AST instructions in the
   [Rule VM](../src/server/rules/vm/rule-vm.ts), dispatching each through the
   effect handler registry. Handlers evaluate selectors, predicates, values
   and conditions with the [evaluator](../src/server/rules/vm/evaluate.ts),
   change the game only through `propose` (or object state such as tapping
   and counters), and name results as typed number or object-set bindings.
   Nested instructions run in a new frame. A handler can suspend for a
   private selection or payment: its frame's program counter stays on it and
   its state persists in `resolving.waiting`, so the answer resumes it and
   nothing before it runs again. The Match does not receive Priority in the
   middle of that resolution.
6. Zone changes, attacks, draws, damage, and other modeled events are
   reported to the [Trigger Runtime](../src/server/rules/triggers/trigger-runtime.ts),
   which records waiting triggers. Whenever a player would receive Priority,
   the [Priority Checkpoint](../src/server/rules/priority/priority-checkpoint.ts)
   performs state-based actions, puts waiting triggers on the Stack (asking
   for trigger order or targets when required), repeats until the game is
   stable, and only then grants Priority. The
   [combat system](../src/server/match/combat.ts) handles declarations, attack
   costs, blockers, and damage assignments as persisted procedures.

The engine uses fresh Game Object identities when objects change Zones while
Card Instance identity remains stable. Semantic events retain the object owner,
controller, and relevant pre-change characteristics needed by triggered
abilities; a zone-change event also carries the object's last known
information (characteristics, controller, counters, attachment, tapped). These distinctions let the engine handle such cases as a source
leaving before its ability resolves or simultaneous objects changing Zones.

## Main collaborators

The core engine delegates focused rules work to these modules:

- [game-objects.ts](../src/server/match/game-objects.ts) and
  [zones.ts](../src/server/match/zones.ts) create Game Objects, move them between
  Zones, preserve Card Instance identity, and operate on Libraries. Rules code
  moves objects only through `propose`.
- [characteristics.ts](../src/server/match/characteristics.ts) calculates
  effective characteristics and evaluates shared Object Filters.
- [mana.ts](../src/server/match/mana.ts) parses mana costs and applies the
  engine's mana-pool spending policy; the
  [Cost Runtime](../src/server/rules/costs/) spends mana through it for
  casting, activation, attack costs and resolution payments.
- [combat.ts](../src/server/match/combat.ts) persists combat declarations,
  payments, and damage assignments.
- [state-based/](../src/server/rules/state-based/) holds the State-Based
  Rules and the runtime that performs them; [triggers/](../src/server/rules/triggers/)
  observes events and state, and puts triggered abilities on the Stack.
- [resolution.ts](../src/server/match/resolution.ts) runs persisted Core AST
  instruction queues through the
  [effect handlers](../src/server/rules/vm/effects/).
- [commander-rules.ts](../src/server/match/commander-rules.ts) handles the
  Commander's Hand and Library replacement (a Graveyard or exile return is a
  state-based choice); [tokens.ts](../src/server/match/tokens.ts)
  supplies supported token characteristics.
- [match-players.ts](../src/server/match/match-players.ts) maps Room Participants
  to Match Players, including the human-controlled Practice Opponent seat.

The runtime dependency used for rules-schema validation is `zod`. The engine and
its collaborators otherwise use shared project types and local rules modules;
there is no external Magic rules engine package in
[package.json](../package.json).

## Persisted choices and private information

Pending procedures, trigger queues, combat state, resolving effects, mana pools,
and other gameplay data are stored on `MatchState.rules`. Stored abilities and
resolution queues hold Core AST effects. A Room document carries its
`snapshotVersion`. Rooms stored below the current version (10) are deleted at
startup, and [upgradeRoom](../src/server/room/room-upgrade.ts) refuses any
other version: during development the database is reset whenever the stored
shape changes, so a change to the stored shape bumps `currentSnapshotVersion`
and adds no upgrade step. A pending procedure
contains the responsible Match Player, its stage, a fresh identifier, and the
legal selection data needed to validate its answer; a cast or activation also
holds its rollback snapshot. This lets the Room persist
and restore an interrupted Match without replaying completed instructions.

The Match view is a filtered projection, not the raw server state. It hides
Library contents and opponent Hands, keeps resolution queues and event context
server-side, and sends only the responsible Match Player a projected prompt:
a stable `promptKind`, a title, options with labels, legal targets per target
clause, the locked cost and whether abort or reversal is offered. Authored
abilities, stage names and rollback snapshots never cross the transport.
Other participants receive only whose choice is awaited and its prompt kind.
A spell or ability being proposed is public on the Stack, marked `beingCast`. Solo Practice routes required Practice
Opponent choices to the human controller while leaving that seat's Priority
passes automatic.

## Rules tests

The rules suite (`npm run test:rules`, `tests/rules/`) runs Match commands in
memory, without a web server or database. `npm run test:rules:round-trip` runs
it again with `ROUND_TRIP=1`: [round-trip.ts](../tests/support/round-trip.ts)
checks before and after every command that the Match is JSON-safe and replaces
it with a JSON round trip of itself, as the Room store does. Both runs are part
of `npm run gates`.

- `tests/rules/characterization/` holds externally meaningful behavior by
  area (casting, combat, triggers, hidden information, commander, …). Its
  tests set games up with [rules-game.ts](../tests/support/rules-game.ts)
  (`rulesGame`, `triggerGame`, `seed`) and reach states that commands can't
  reach with the [force helpers](../tests/support/force.ts), never by writing
  Match state directly.
- The other folders test one runtime each: compiler, costs, events, priority,
  procedures, state-based rules, triggers and the Rule VM with its effect
  handlers. [procedure-scenarios.ts](../tests/support/procedure-scenarios.ts)
  reaches every pending procedure kind, so each kind is tested for stale ids,
  save and restore, and what each player sees.
- A refactor classifies each changed test: **Preserve** (still valid as is),
  **Move** (the assertion belongs in a lower-level test) or **Change** (the
  behavior changes on purpose, with the reason).
