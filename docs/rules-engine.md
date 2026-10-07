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
| [Card DSL v2](../src/shared/rules-v2.ts)                                                                                              | Defines the version 2 definition file (`imported` and `authored` sections) and the Zod schemas for authored abilities: selectors, predicates, values, targets, effects, costs, triggers, grants and keywords.                         |
| [Rules Compiler](../src/server/rules/compiler.ts) and [support check](../src/server/rules/support.ts)                                 | The compiler validates and desugars authored abilities into the Core AST the engine runs. The support check names any Core construct the current runtime can't run.                                                                   |
| [Ability readers](../src/server/rules/abilities.ts)                                                                                   | Answer what the engine asks of a Core ability: its target clause, costs, mana production, trigger subject, intervening-if, keywords, static grants and continuous effects.                                                            |
| [Rules context](../src/server/rules/context.ts) and [event runtime](../src/server/rules/events/event-runtime.ts)                      | `RulesQuery` (read-only view) and `RulesMutator.propose`: every zone change, draw, damage event, life change and object creation is proposed, applied and reported to trigger observation.                                            |
| [Priority Checkpoint](../src/server/rules/priority/priority-checkpoint.ts)                                                            | Every Priority grant runs it: state-based actions until none applies, then waiting triggers onto the Stack, repeated until stable, then Priority. A choice suspends it with its progress in `rules.checkpoint`.                       |
| [State-Based Rules](../src/server/rules/state-based/registry.ts)                                                                      | One rule object per state-based action, evaluated against the same state; the runtime performs all their changes as one simultaneous event, and a rule may require a choice.                                                          |
| [Trigger Runtime](../src/server/rules/triggers/trigger-runtime.ts) and [placement](../src/server/rules/triggers/trigger-placement.ts) | Event and state observers match each source's Core trigger and record waiting triggers; placement puts a batch on the Stack in two parts, each in APNAP order, with ordering and target choices.                                      |
| [Stack Resolution Runtime](../src/server/rules/stack/stack-resolution.ts)                                                             | The resolution envelope for the top Stack object: intervening-if, target revalidation, then the permanent-spell path or the Rule VM, then Stack cleanup.                                                                              |
| [Rule VM](../src/server/rules/vm/rule-vm.ts)                                                                                          | Runs a resolving instruction program: frames with program counters and typed bindings, persisted in `rules.resolving`, suspending for choices and resuming without replay.                                                            |
| [Effect handlers](../src/server/rules/vm/effects/registry.ts)                                                                         | One handler per Core effect kind, dispatched through a registry. Each handler runs its instruction, hands back nested instructions (run in a new VM frame), or suspends for a choice; it also reports at load time what it can't run. |
| [Shared rules model](../src/shared/rules.ts)                                                                                          | Defines pending procedures, the Rule VM's execution state, continuous effects in force, and persisted rules state.                                                                                                                    |
| [Match view](../src/server/match/match-view.ts)                                                                                       | Builds each participant's projection of Match state, including visible objects, legal actions, and any choice details that participant may see.                                                                                       |
| [Commander support gate](../src/server/match/commander.ts)                                                                            | Validates Commander Decklist rules and checks that each Card Definition has implemented, supported behavior.                                                                                                                          |

Room code owns transport, participant authorization, revision checks, and
database persistence. `MatchService.execute` receives a participant and action
after those checks. A normal rejected action discards the mutated clone. A
Commander replacement choice is a special pending procedure that preserves the
interrupted command for resumption after the choice.

## Authored rules and coverage

Each Card Definition is one `catalogVersion: 2` file in `catalog/definitions/`
with two sections ([card model plan §3](plans/card-model-refactor.md)):

- `imported`: the form, Card Components, Color Identity and default Printing. A
  set import writes only this section.
- `authored`: the automation status and the card's abilities in the rules DSL
  version 2 ([DSL plan §4](plans/dsl-redesign.md)). Reviewers own it; a diff
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
   compiler's Core abilities directly (`CardDefinition.abilities`); the
   effect handler registry confirms it can run each effect. An implemented
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
4. Casting a spell or activating an ability can suspend for a variable, target,
   or cost payment. The engine locks the cost before payment, lets the Match
   Player activate mana abilities explicitly, and then places a spell or
   Ability Game Object on the Stack. Casting Records, chosen values, targets,
   and captured ability data are stored with the relevant Game Object.
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
  engine's mana-pool spending policy.
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
resolution queues hold Core AST effects since Room snapshot version 3;
[upgradeRoom](../src/server/room/room-upgrade.ts) lifts the version 1 effects
of older Rooms ([lift-v1-effects.ts](../src/server/room/lift-v1-effects.ts)). A pending procedure
contains the responsible Match Player, its stage, a fresh identifier, and the
legal selection data needed to validate its answer. This lets the Room persist
and restore an interrupted Match without replaying completed instructions.

The Match view is a filtered projection, not the raw server state. It hides
Library contents and opponent Hands, keeps resolution queues and event context
server-side, and sends detailed pending choices only to the Match Player who
answers them. Other participants receive only the pending-choice summary needed
to know whose action is awaited. Solo Practice routes required Practice
Opponent choices to the human controller while leaving that seat's Priority
passes automatic.
