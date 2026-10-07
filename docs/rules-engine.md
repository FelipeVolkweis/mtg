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

| Area | Responsibility |
| --- | --- |
| [MatchService](../src/server/match/match.service.ts) | Validates Commander setup, creates initial Match state, and executes gameplay commands on a clone. It publishes the clone for accepted commands and returns accepted, pending, or rejected results. |
| [RulesEngine](../src/server/match/rules-engine.ts) | Validates and applies gameplay actions, produces legal actions, manages Priority and the Stack, and advances turn procedures and checkpoints. |
| [Card DSL v2](../src/shared/rules-v2.ts) | Defines the version 2 definition file (`imported` and `authored` sections) and the Zod schemas for authored abilities: selectors, predicates, values, targets, effects, costs, triggers, grants and keywords. |
| [Rules Compiler](../src/server/rules/compiler.ts) and [down-compiler](../src/server/rules/down-compiler.ts) | Validate and desugar authored abilities into the Core AST, then lower it into the runtime shapes the engine executes today. |
| [Shared rules model](../src/shared/rules.ts) | Defines the runtime ability shape the down-compiler emits, pending procedures, and persisted rules state. |
| [Match view](../src/server/match/match-view.ts) | Builds each participant's projection of Match state, including visible objects, legal actions, and any choice details that participant may see. |
| [Commander support gate](../src/server/match/commander.ts) | Validates Commander Decklist rules and checks that each Card Definition has implemented, schema-valid, supported behavior. |

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
4. Down-compile the Core AST into `CardAbility.rules`, the shapes the engine
   executes. An implemented card that uses a construct the current runtime
   can't run fails the load; an unimplemented one loads without runtime
   abilities.

The catalog gate (`tests/rules/compiler/catalog-gate.spec.ts`) compiles every
definition and down-compiles every implemented one. Publishing writes each
definition back as its version 2 file, so reading and republishing the catalog
reproduces it byte for byte. The down-compiler is temporary: the effect
handlers and the rule VM read the Core AST directly once they exist.

Commander setup calls `automationEligible` for every card in the selected
Decklist. It requires an implemented Card Definition, a supported card form,
valid runtime rules for each ability, and an authored implementation for each
keyword. A keyword or Oracle Text alone does not make a behavior executable. Unsupported cards are reported during setup rather than
being silently accepted with partial behavior.

This is a curated rules implementation, not a complete Comprehensive Rules
engine. New card support requires both an authored composition that compiles,
down-compiles and passes the support checks, and engine code that performs its
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
5. After all Match Players pass Priority, the top Stack object resolves. The
   [Resolution](../src/server/match/resolution.ts) interpreter processes its
   ordered effects and bindings. It can pause for a private selection or payment
   and resume from persisted progress; the Match does not receive Priority in
   the middle of that resolution.
6. Zone changes, attacks, draws, damage, and other modeled events are collected
   by the [trigger system](../src/server/match/triggers.ts). At checkpoints the
   engine applies state-based changes, gathers waiting triggers, asks for
   trigger ordering or targets when required, and then restores Priority. The
   [combat system](../src/server/match/combat.ts) handles declarations, attack
   costs, blockers, and damage assignments as persisted procedures.

The engine uses fresh Game Object identities when objects change Zones while
Card Instance identity remains stable. Semantic events retain the object owner,
controller, and relevant pre-change characteristics needed by triggered
abilities. These distinctions let the engine handle such cases as a source
leaving before its ability resolves or simultaneous objects changing Zones.

## Main collaborators

The core engine delegates focused rules work to these modules:

- [game-objects.ts](../src/server/match/game-objects.ts) and
  [zones.ts](../src/server/match/zones.ts) create Game Objects, move them between
  Zones, preserve Card Instance identity, and operate on Libraries.
- [characteristics.ts](../src/server/match/characteristics.ts) calculates
  effective characteristics and evaluates shared Object Filters.
- [mana.ts](../src/server/match/mana.ts) parses mana costs and applies the
  engine's mana-pool spending policy.
- [combat.ts](../src/server/match/combat.ts) persists combat declarations,
  payments, and damage assignments.
- [triggers.ts](../src/server/match/triggers.ts) collects semantic events,
  creates triggered Ability Game Objects, and handles trigger ordering and
  target choices.
- [resolution.ts](../src/server/match/resolution.ts) runs persisted effect
  sequences; [object-effects.ts](../src/server/match/object-effects.ts) handles
  shared object-selection and movement effects.
- [commander-rules.ts](../src/server/match/commander-rules.ts) handles Commander
  replacement choices and return procedures; [tokens.ts](../src/server/match/tokens.ts)
  supplies supported token characteristics.
- [match-players.ts](../src/server/match/match-players.ts) maps Room Participants
  to Match Players, including the human-controlled Practice Opponent seat.

The runtime dependency used for rules-schema validation is `zod`. The engine and
its collaborators otherwise use shared project types and local rules modules;
there is no external Magic rules engine package in
[package.json](../package.json).

## Persisted choices and private information

Pending procedures, trigger queues, combat state, resolving effects, mana pools,
and other gameplay data are stored on `MatchState.rules`. A pending procedure
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
