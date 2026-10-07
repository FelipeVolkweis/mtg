# Card Rules DSL Redesign

## 1. Purpose

Redesign the authored card rules DSL (`src/shared/rules.ts`, `catalog/definitions/*.json`) before the runtime refactor in [rules-engine-refactor.md](rules-engine-refactor.md) builds a compiler, VM and handlers on top of it.

The current DSL is readable and strictly validated, but it grew one card at a time around the 67 implemented definitions (of 783). The runtime plan's goal, "adding a new card normally requires only card JSON", is not reachable with the current shape: most unimplemented cards need a new field or effect kind.

This document defines:

- the problems with the current DSL, with evidence;
- design rules that every DSL construct MUST satisfy;
- the target authored AST (version 2);
- a mapping from every current construct to version 2;
- an expressiveness test set drawn from unimplemented catalog cards;
- the migration path for existing definitions.

---

# 2. Problems with the current DSL

Counts are from `catalog/definitions/` at the time of writing.

## 2.1 One-off constructs

Several effect kinds and ability fields exist for exactly one card:

| Construct | Only user | What it really is |
|---|---|---|
| `tap-attached` effect | Fall from Favor | `tap` of a selector (the enchanted creature) |
| `monarchUntap` field | Fall from Favor | game-rule effect: untap restriction with a condition |
| `redirect-attack` effect | Misleading Signpost | combat primitive: reselect an attacker's defender |
| `tap-choice` effect | Myr Battlesphere | `tap` of a player-chosen set, binding the count |
| `pay-mana` + `counter-event` | Kappa Cannoneer (Ward), Mind's Eye | "may pay / unless pays" control flow; Ward is a keyword |
| `alternative` effect (discard-only) | Thirst for Knowledge | a general "choose one" control-flow node |
| `improvise` field | Kappa Cannoneer | keyword (cost-payment rule) |
| `attackCost` field | Propaganda | game-rule effect: attack tax |
| `castingPermission` field | Shimmer Myr | game-rule effect: cast as though it had flash |
| `maximumHandSize` field | Thought Vessel | game-rule effect: maximum hand size |
| `aura` field | Fall from Favor | the Enchant keyword |
| `animate-source` with `recipient: "target"` | Whirler Rogue | the name says "source" but it applies an until-end-of-turn effect to a target |

General primitives that are rare only because few cards are implemented (`sacrifice`, `sequence`, `damage`) are not problems.

## 2.2 Ability shape

`rulesAbilitySchema` is one object with about 17 optional fields shared by every ability kind. The ability `kind` (`spell`, `activated`, `triggered`, `static`) lives outside `rules`, so kind and shape are validated separately. A static ability carries meaningless `costs: []` and `effects: []`.

About 150 lines of `superRefine` re-implement what a discriminated union would give for free:

- "mana abilities must only produce mana and cannot target";
- "state triggers require a source counter threshold";
- "grouped triggers require damage events";
- "each-player selections require a sacrifice set";
- "exile links require an exile operation".

Each rule exists because a field is valid only for certain values of another field.

## 2.3 Flag-driven effects

`movement` combines `kind: move | destroy | exile | sacrifice` with `subject: source | target | set | choice` and the flags `optional`, `eachPlayer`, `link`, `bind` and `destination`.

- `subject` mixes targeting, rules-defined sets and player choice. Those are distinct Magic concepts.
- Destroy and sacrifice are different rules events (indestructible and regeneration apply to one only) but share one schema.
- `eachPlayer` is legal only for sacrifice with a set.
- `optional` is a "may" control-flow construct encoded as a flag.

## 2.4 Narrow values, conditions and filters

- **Bindings** are numbers only (`Record<string, number>`). Object results are tracked through `link` strings.
- **Values** include one-offs (`handSize: "you"`, `greatestManaValue`) and the magic string `"commander-colors"`.
- **Conditions** in `if` are only `{binding, atLeast}`. "If you attacked this turn" (Raid) can't be written.
- **Filters** are flat boolean flags (`attacking`, `untapped`, `colored`, `colorless`, `attached`, `nontoken`, `damagedBySource`) with no and/or/not.
  - `types` means any-of, `allTypes` means all-of, `excludeTypes` means none-of: three fields for one missing combinator.
  - `manaValue` takes a value but no operator, so "mana value ≤ Alesha's power" can't be written.

## 2.5 Targets and modes

An ability has at most one `target`, an object filter. There are no player targets, no multiple target clauses, no "up to N" and no modes. `damage` accepts only `target` or `defender` as recipient.

## 2.6 Triggers

One `trigger` object carries `ordinal`, `grouped`, `step`, `combat`, `recipientKind`, `counter` and `atLeast`, each meaningful for some events only.

- `step` is a raw `stepIndex` number (Misleading Signpost uses `5`).
- `state` triggers can only mean "source has ≥ N counters".
- There is a `dies` event but no general zone-change trigger ("put into a graveyard from the battlefield", "leaves the battlefield").

## 2.7 Hard-coded vocabularies

- Tokens: `z.enum(["thopter", "myr", "germ"])`. A new token means a schema change.
- Counters on `add-counters`: `["+1/+1", "-1/-1"]`, while costs already accept any counter string (`page`).
- Keywords: an 11-value enum that mixes real keywords (Flying, Flash) with non-keywords (`"Must attack"`, `"Unblockable"`, `"Cannot be blocked by Walls"`), with behavior in engine code (`hasKeyword`).
- `enter-tapped` is listed as an effect of a static ability. It is a replacement effect.

## 2.8 Consequence

Every card in the expressiveness set (§8) is blocked by at least one of the issues above, not by missing engine runtime.

---

# 3. Design rules

These rules are normative for the authored AST and every future addition.

1. **One CR concept per kind.** Every ability kind, effect kind, cost kind, trigger event and game-rule effect names a Comprehensive Rules concept. A kind that exists for one card's wording is not allowed.
2. **No dependent fields.** If a field is valid only for some values of another field, split the type into a discriminated union.
3. **Choices are selectors.** Player choices during resolution are expressed as `choose` selectors, never as effect flags.
4. **Control flow is structural.** "May", "if you do", "unless", "choose one", "for each player" and sequencing are control-flow nodes, not flags on effects.
5. **Durations are explicit.** Temporary effects state their duration (`end-of-turn`, `while-source-on-battlefield`, `until` an event).
6. **Vocabularies are data.** Tokens, counter kinds and keywords are catalog data validated against registries, not schema enums.
7. **Shorthand must desugar.** Concise authored syntax is allowed only when the compiler can expand it deterministically into the Core AST.
8. **Unsupported means unimplemented.** If a card can't be expressed with existing primitives, it stays `automationStatus: "unimplemented"` until the missing CR concept is added. A card-specific escape hatch is not allowed.

---

# 4. Target authored AST (version 2)

Types are written in TypeScript notation. The implemented schema is `src/shared/rules-v2.ts` (roadmap issue 4), and it is the source of truth: where this section and the schema differ, the schema wins. Decisions made while implementing it are recorded below in each subsection, marked **As built**.

## 4.1 Abilities

```ts
type Ability =
  | SpellAbility
  | ActivatedAbility
  | ManaAbility
  | TriggeredAbility
  | StaticAbility
  | ReplacementAbility
  | KeywordAbility;

interface AbilityBase {
  id: string;
  origin: "printed" | "granted";
  description?: string;          // Oracle wording for display
}

interface SpellAbility extends AbilityBase {
  kind: "spell";
  targets?: TargetClause[];
  modes?: Modes;                 // exclusive with top-level effects
  effects?: Effect[];
}

interface ActivatedAbility extends AbilityBase {
  kind: "activated";
  costs: Cost[];
  timing?: "sorcery";
  limit?: { perTurn: number };   // replaces oncePerTurn
  activeFrom?: ZoneKind;         // default battlefield
  targets?: TargetClause[];
  modes?: Modes;
  effects?: Effect[];
}

interface ManaAbility extends AbilityBase {
  kind: "mana";
  activation:
    | { costs: Cost[] }                  // activated mana ability
    | { trigger: ManaTrigger };          // triggered mana ability
  produce: ManaProduction;
}

interface TriggeredAbility extends AbilityBase {
  kind: "triggered";
  trigger: Trigger;
  interveningIf?: Condition;     // CR 603.4
  targets?: TargetClause[];
  modes?: Modes;
  effects?: Effect[];
}

interface StaticAbility extends AbilityBase {
  kind: "static";
  activeFrom?: ZoneKind;         // default battlefield; "stack" for this-spell cost changes
  condition?: Condition;         // "as long as ..."
  characteristicDefining?: true; // CR 604.3
  grants: StaticGrant[];
}

interface ReplacementAbility extends AbilityBase {
  kind: "replacement";
  activeFrom?: ZoneKind;
  event: EventPattern;           // the event that "would" happen
  replace: Replacement;
}

interface KeywordAbility extends AbilityBase {
  kind: "keyword";
  keyword: Keyword;              // see §4.10
}
```

The mana-ability criteria from CR 605 (no targets, could produce mana, not a loyalty ability, no library interaction) are checked by the compiler, not trusted from an authored flag.

**As built:** `origin` is optional (it defaults to printed). `ManaProduction` is:

```ts
interface ManaProduction {
  quantity: number;
  colors: ManaType[] | { commanderColors: PlayerRef };
  restriction?: { use?: "cast" | "activate"; spellTypes?: string[] };
}
```

## 4.2 Selectors

Selectors choose objects or players. They are distinct from targets (§4.5) and from predicates (§4.3).

```ts
type Selector =
  | "source"                                   // this object
  | { target: string }                         // a target clause id
  | { all: Predicate }                         // every matching object, as one set
  | { choose: Choice }                         // chosen during resolution
  | { binding: string }                        // result of an earlier instruction
  | { event: "object" | "source" | "player" }  // the triggering or replaced event
  | { attachedTo: Selector }                   // what the selected object is attached to
  | { attachedBy: Selector }                   // objects attached to the selection
  | { linked: string }                         // linked-ability relationship
  | { attackedBy: Selector };                  // defender of an attacking creature

interface Choice {
  chooser?: PlayerRef;           // default: controller of the ability
  from: Predicate;
  count: number | { min: number; max?: number };
}

type PlayerRef =
  | "you"
  | "opponents"
  | "each-player"
  | "active-player"
  | { target: string }
  | { controllerOf: Selector }
  | { ownerOf: Selector }
  | { event: "player" }
  | { binding: string };
```

String shorthand: `"source"` for the source, `"target"` for the single target clause `target-0`.

## 4.3 Predicates

Predicates describe eligibility. An object with several keys means "all of these". Arrays inside a key mean "any of these".

```ts
type Predicate =
  | { and: Predicate[] }
  | { or: Predicate[] }
  | { not: Predicate }
  | PredicateFields;

interface PredicateFields {
  zone?: ZoneKind;
  object?: "card" | "spell" | "permanent" | "token" | "player";
  type?: string | string[];
  subtype?: string | string[];
  supertype?: string | string[];
  color?: Color | Color[] | "any" | "colorless";
  controller?: PlayerRef;
  owner?: PlayerRef;
  status?: Status | Status[];    // "tapped" | "untapped" | "attacking" | "blocking" | "attached" | ...
  is?: Selector;                 // identity, e.g. { not: { is: "source" } } for "another"
  manaValue?: Comparison;
  power?: Comparison;
  toughness?: Comparison;
  counters?: { kind: string; count: Comparison };
  dealtDamageBy?: Selector;      // replaces damagedBySource
  player?: PlayerRef;            // matches a player (target clauses)
}

type Comparison =
  | Value
  | { "<": Value } | { "<=": Value } | { "=": Value }
  | { ">=": Value } | { ">": Value };
```

A bare value in a comparison means equality.

## 4.4 Values and conditions

```ts
type Value =
  | number
  | { variable: "X" }
  | { binding: string }                        // number binding
  | { count: Selector }                        // size of a set
  | { sum: Value[] }
  | { stat: { of: Selector; name: "power" | "toughness" | "manaValue" } }
  | { greatest: { of: Selector; name: "power" | "toughness" | "manaValue" } }
  | { cardsIn: { zone: ZoneKind; player: PlayerRef } }
  | { lifeTotal: PlayerRef }
  | { commanderColors: PlayerRef }
  | { eventAmount: true }                      // "that much"
  | { if: Condition; then: Value; else: Value };

type Condition =
  | { and: Condition[] }
  | { or: Condition[] }
  | { not: Condition }
  | { compare: [Value, "<" | "<=" | "=" | ">=" | ">", Value] }
  | { exists: Selector }
  | { matches: { selector: Selector; predicate: Predicate } }
  | { happened: { event: TurnFact; player?: PlayerRef; during: "this-turn" } }
  | { paid: string }                           // an optional cost id, e.g. "kicker"
  | { monarch: PlayerRef }
  | { didPerform: string };                    // binding of an earlier optional instruction

type TurnFact = "attacks" | "casts" | "draws" | "gains-life" | "loses-life" | "land-played";
```

Bindings are typed. A binding produced by an object-moving instruction is an object set; by `draw`, `discard` or `pay`, a number. `{ count: { binding } }` turns an object binding into a number. The compiler checks types and scope.

**As built:**
- object results: `move`, `destroy`, `sacrifice`, `exile`, `counter`, `tap`, `untap`, `create-token`, `search`, `library-sequence`;
- number results: `draw`, `discard`, `gain-life`, `lose-life`, `damage`, `add-counters`, `remove-counters`;
- `may` binds a flag (did the player do it), read by `didPerform`; other instructions cannot bind.
- Scope is sequential. A binding defined inside an `if`, `may`, `may-pay` or `choose-one` branch is visible only inside that branch.
- `for-each-player` defines the player binding `player` inside its body, read as `{ binding: "player" }`.

## 4.5 Targets and modes

```ts
interface TargetClause {
  id: string;
  count?: number | { min: number; max: number };   // default 1
  filter: Predicate;             // may match players via { player: ... }
}

interface Modes {
  choose: number | { min: number; max: number };
  options: {
    id: string;
    label: string;
    targets?: TargetClause[];
    effects: Effect[];
  }[];
}
```

Shorthand: `"anyTarget": true` desugars to the CR definition of "any target" (creature, player, planeswalker or battle). The single legacy `target` field desugars to one clause with id `target-0`.

## 4.6 Effects

Each kind is one CR concept. Every effect may carry `bind` to name its result.

```ts
type Effect =
  // zone changes (all produce zone-change semantic events)
  | { kind: "move"; objects: Selector; to: Destination }
  | { kind: "destroy"; objects: Selector }
  | { kind: "sacrifice"; objects: Selector }
  | { kind: "exile"; objects: Selector; until?: EventPattern; linkAs?: string }   // CR 610.3
  | { kind: "counter"; objects: Selector }
  | { kind: "library-sequence"; player: PlayerRef; count: Value;
      operation: "look" | "reveal";
      select?: { filter?: Predicate; max: number; to: Destination; reveal?: boolean };
      rest: { to: Destination; order: "random" | "any" | "keep" } }
  | { kind: "search"; player: PlayerRef; zone: "library"; filter: Predicate;
      count: { min: number; max: number }; to: Destination }
  | { kind: "shuffle"; player: PlayerRef }
  // players
  | { kind: "draw"; player?: PlayerRef; count: Value }
  | { kind: "discard"; player?: PlayerRef; count: Value; filter?: Predicate }
  | { kind: "gain-life"; player?: PlayerRef; amount: Value }
  | { kind: "lose-life"; player: PlayerRef; amount: Value }
  | { kind: "become-monarch"; player: PlayerRef }
  // objects
  | { kind: "damage"; amount: Value; to: Selector | PlayerRef; source?: Selector }
  | { kind: "tap"; objects: Selector }
  | { kind: "untap"; objects: Selector }
  | { kind: "add-counters"; objects: Selector; counter: string; count: Value }
  | { kind: "remove-counters"; objects: Selector; counter: string; count: Value }
  | { kind: "attach"; object?: Selector; to: Selector }
  | { kind: "create-token"; token: string; count?: Value; controller?: PlayerRef; tapped?: true }
  | { kind: "apply-continuous"; objects: Selector; changes: ContinuousChange[]; duration: Duration }
  | { kind: "apply-grant"; grant: StaticGrant; duration: Duration }   // a game-rule effect for a duration
  | { kind: "scry"; player?: PlayerRef; count: Value }                 // keyword action; desugars to library-sequence
  | { kind: "reselect-defender"; attacker: Selector }
  | { kind: "create-delayed-trigger"; trigger: Trigger; effects: Effect[] }
  // control flow
  | { kind: "sequence"; effects: Effect[] }
  | { kind: "if"; condition: Condition; then: Effect[]; else?: Effect[] }
  | { kind: "may"; player?: PlayerRef; effects: Effect[]; bind?: string }
  | { kind: "may-pay"; player?: PlayerRef; costs: Cost[]; then?: Effect[]; else?: Effect[] }
  | { kind: "choose-one"; chooser?: PlayerRef;
      options: { id: string; label: string; available?: Condition; effects: Effect[] }[] }
  | { kind: "for-each-player"; players: PlayerRef; order: "APNAP"; effects: Effect[] };

type Destination =
  | ZoneKind                                   // shorthand: owner's zone of that kind
  | { zone: ZoneKind; player?: PlayerRef; position?: "top" | "bottom";
      tapped?: true; controller?: PlayerRef };

type Duration = "end-of-turn" | "while-source-on-battlefield" | { until: EventPattern };
```

Set semantics (runtime plan §24) apply to every effect whose `objects` selector can match more than one object.

**As built:** `apply-grant` holds rule-modifying effects that last for a duration, such as "can't be blocked this turn" (Whirler Rogue, Kappa Cannoneer). They aren't characteristics, so they don't belong in `apply-continuous`.

## 4.7 Costs

Costs keep their current kinds, with one change: object costs take a predicate and default to "you control, on the battlefield" where the rules require it (you can only sacrifice your own permanents).

```ts
type Cost =
  | { kind: "mana"; symbols: ManaSymbol[] }
  | { kind: "tap-source" } | { kind: "untap-source" }
  | { kind: "sacrifice-source" } | { kind: "discard-source" } | { kind: "exile-source" }
  | { kind: "life"; amount: Value }
  | { kind: "counter-source"; counter: string; count: number; operation: "put" | "remove" }
  | { kind: "tap" | "sacrifice" | "discard" | "return" | "exile"; count: number; filter: Predicate }
  | { kind: "tap-total-power"; power: number; filter: Predicate };   // crew: "tap creatures with total power N"
```

**As built:** implied filters are added when the predicate doesn't already constrain them. `tap`, `sacrifice`, `return` and `tap-total-power` default to the battlefield and you as controller; `discard` defaults to your hand; `exile` must name its Zone.

`crew`, `improvise`, `kicker`, `escalate` and `flashback` are keywords (§4.10) that expand into costs or cost options.

## 4.8 Triggers

```ts
type Trigger =
  | { event: "zone-change"; object: Predicate | Selector; from?: ZoneKind; to?: ZoneKind }
  | { event: "enters"; object: Predicate | Selector }                    // zone-change to battlefield
  | { event: "dies"; object: Predicate | Selector }                      // battlefield to graveyard, creature
  | { event: "cast"; spell: Predicate; caster?: PlayerRef }
  | { event: "attacks"; attacker: Predicate | Selector }
  | { event: "deals-damage"; source: Predicate | Selector;
      to?: "player" | "object" | Predicate; combat?: boolean; batch?: "one-or-more" }
  | { event: "draws"; player: PlayerRef; nth?: number }
  | { event: "step"; step: TurnStep; player?: PlayerRef | "next" }        // named steps, not stepIndex
  | { event: "becomes-target"; object: Predicate | Selector; by?: PlayerRef }
  | { event: "gains-life"; player: PlayerRef }
  | { event: "loses-life"; player: PlayerRef }
  | { event: "state"; condition: Condition };                             // state trigger

type ManaTrigger = { event: "tapped-for-mana"; object: Predicate; produced?: ManaType };
```

`enters` and `dies` are shorthand for `zone-change`. Leaves-the-battlefield triggers look back in time (CR 603.10). The runtime uses last known information for the object and its attachments.

**As built:** `zone-change` and `enters` take an optional `during: TurnStep` for triggers that only fire in one step ("enters during the declare attackers step", Misleading Signpost).

## 4.9 Static grants and replacements

```ts
type StaticGrant =
  | { kind: "continuous"; objects: Selector; changes: ContinuousChange[] }
  | { kind: "cost-modifier"; applies: "this" | { spells: Predicate } | { abilitiesOf: Selector };
      reduce?: Value; increase?: Value; condition?: Condition }
  // game-rule effects (runtime plan §50, GameRuleEffectEngine)
  | { kind: "cast-timing"; spells: Predicate; as: "flash" }
  | { kind: "play-permission"; objects: Selector; duration: Duration }
  | { kind: "maximum-hand-size"; player: PlayerRef; value: Value | "unlimited" }
  | { kind: "attack-tax"; defender: PlayerRef; costPerAttacker: Cost[] }
  | { kind: "block-tax"; costPerBlocker: Cost[] }
  | { kind: "attack-requirement"; objects: Selector }                 // "attacks each combat if able"
  | { kind: "block-restriction"; objects: Selector; by?: Predicate }  // "can't be blocked (by Walls)"
  | { kind: "cant-block"; objects: Selector }
  | { kind: "cant-be-countered"; spells: "this" | Predicate }       // "can't be countered"
  | { kind: "untap-restriction"; objects: Selector; unless?: Condition };

type ContinuousChange =
  | { kind: "add-types"; types?: string[]; subtypes?: string[] }
  | { kind: "set-base-stats"; power: Value; toughness: Value }
  | { kind: "add-stats"; power: Value; toughness: Value }
  | { kind: "define-stats"; power: Value; toughness: Value }   // characteristic-defining only
  | { kind: "grant-keyword"; keyword: Keyword }
  | { kind: "gain-control"; player: PlayerRef }
  | { kind: "copy-linked"; link: string; retainSubtypes: string[] };

type EventPattern =
  | { event: "would-enter"; object: Selector | Predicate }
  | { event: "would-gain-life"; player: PlayerRef }
  | { event: "would-draw"; player: PlayerRef }
  | { event: "would-be-dealt-damage"; recipient: Selector | Predicate }
  | { event: "leaves-battlefield"; object: Selector };   // for "until" durations

type Replacement =
  | { kind: "enter-tapped" }
  | { kind: "modify-amount"; add: Value }
  | { kind: "prevent" }
  | { kind: "instead"; effects: Effect[] };
```

Each `ContinuousChange` maps to a CR 613 layer. The compiler records the layer, so the characteristics engine doesn't infer it.

**As built** (`layer` field): `gain-control` 2, `add-types` 4, `grant-keyword` 6, `define-stats` 7a, `set-base-stats` 7b, `add-stats` 7c, `copy-linked` 4 and 7b (it sets creature types and base power and toughness).

## 4.10 Keywords

Keywords come in two classes.

- **Rule keywords** are properties the engine checks directly: flying, reach, first strike, double strike, deathtouch, lifelink, trample, haste, vigilance, defender, indestructible, hexproof, flash.
- **Macro keywords** expand at compile time into ordinary abilities, costs or grants.

| Keyword | Expands to |
|---|---|
| `{ name: "affinity", for: Predicate }` | static `cost-modifier` on `this`, reduce by count of matching permanents you control |
| `{ name: "ward", costs: Cost[] }` | triggered: `becomes-target` by an opponent → `may-pay` by event player, else `counter` event source |
| `{ name: "cycling", costs: Cost[] }` | activated from hand: costs + `discard-source` → draw 1 |
| `{ name: "equip", costs: Cost[] }` | activated, sorcery timing, one target creature you control → `attach` |
| `{ name: "crew", power: number }` | activated: tap creatures with total power N → `apply-continuous` add types until end of turn |
| `{ name: "enchant", filter: Predicate }` | aura targeting on cast, plus aura legality state-based action |
| `{ name: "improvise" }` | cost-payment option for the cost runtime |
| `{ name: "kicker", costs: Cost[] }` | optional additional cost with id `kicker`, readable via `{ paid: "kicker" }` |
| `{ name: "escalate", costs: Cost[] }` | additional cost per mode beyond the first |
| `{ name: "flashback", costs: Cost[] }` | cast permission from graveyard with alternative cost, plus exile replacement |
| `{ name: "living-weapon" }` | triggered on enter: create Germ, attach to it |
| `{ name: "scry", count: number }` (keyword action) | `library-sequence` look, any to bottom, rest on top in any order |

`"Must attack"`, `"Unblockable"` and `"Cannot be blocked by Walls"` are not keywords. They become `attack-requirement` and `block-restriction` grants.

**As built:** affinity, ward, cycling, equip, crew and living weapon expand into ordinary abilities. Enchant, improvise, kicker, escalate and flashback stay keyword abilities in the Core AST. They change how a card is cast or paid for, which the casting and cost runtimes read directly; abilities can't express that. Rule keywords are lowercase (`"first strike"`).

## 4.11 Tokens and counters

- **Tokens** are definitions in `catalog/tokens/*.json`, with the same characteristics and ability model as cards, referenced by id (`"thopter-1-1-flying"`, `"food"`, `"treasure"`). The compiler checks the reference. **As built:** `src/server/rules/registries.ts` reads them. Thopter, Myr, Germ, Treasure, Food, Beast and Zombie exist (`thopter-1-1-flying`, `myr-1-1`, `phyrexian-germ-0-0`, `treasure`, `food`, `beast-3-3-green`, `zombie-2-2-black`).
- **Counter kinds** come from a registry (`+1/+1`, `-1/-1`, `page`, `loyalty`, …). Counters with rules meaning (`+1/+1`, `-1/-1`) carry it in the registry, not in the effect schema.

---

# 5. Worked examples

## Aetherize (implemented)

```json
[
  {
    "id": "return-attackers",
    "kind": "spell",
    "effects": [
      {
        "kind": "move",
        "objects": { "all": { "zone": "battlefield", "type": "Creature", "status": "attacking" } },
        "to": "hand"
      }
    ]
  }
]
```

## Sai, Master Thopterist (implemented)

```json
[
  {
    "id": "artifact-cast",
    "kind": "triggered",
    "trigger": { "event": "cast", "spell": { "type": "Artifact" }, "caster": "you" },
    "effects": [{ "kind": "create-token", "token": "thopter-1-1-flying" }]
  },
  {
    "id": "draw",
    "kind": "activated",
    "costs": [
      { "kind": "mana", "symbols": ["{1}", "{U}"] },
      { "kind": "sacrifice", "count": 2, "filter": { "type": "Artifact" } }
    ],
    "effects": [{ "kind": "draw", "count": 1 }]
  }
]
```

## Thoughtcast (implemented)

```json
[
  { "id": "affinity", "kind": "keyword", "keyword": { "name": "affinity", "for": { "type": "Artifact" } } },
  { "id": "draw", "kind": "spell", "effects": [{ "kind": "draw", "count": 2 }] }
]
```

## Austere Command (unimplemented today)

```json
[
  {
    "id": "modes",
    "kind": "spell",
    "modes": {
      "choose": 2,
      "options": [
        { "id": "artifacts", "label": "Destroy all artifacts.",
          "effects": [{ "kind": "destroy", "objects": { "all": { "zone": "battlefield", "type": "Artifact" } } }] },
        { "id": "enchantments", "label": "Destroy all enchantments.",
          "effects": [{ "kind": "destroy", "objects": { "all": { "zone": "battlefield", "type": "Enchantment" } } }] },
        { "id": "small", "label": "Destroy all creatures with mana value 3 or less.",
          "effects": [{ "kind": "destroy", "objects": { "all": { "zone": "battlefield", "type": "Creature", "manaValue": { "<=": 3 } } } }] },
        { "id": "large", "label": "Destroy all creatures with mana value 4 or greater.",
          "effects": [{ "kind": "destroy", "objects": { "all": { "zone": "battlefield", "type": "Creature", "manaValue": { ">=": 4 } } } }] }
      ]
    }
  }
]
```

## Alesha, Who Laughs at Fate (unimplemented today)

```json
[
  { "id": "first-strike", "kind": "keyword", "keyword": "first strike" },
  {
    "id": "attack-counter",
    "kind": "triggered",
    "trigger": { "event": "attacks", "attacker": "source" },
    "effects": [{ "kind": "add-counters", "objects": "source", "counter": "+1/+1", "count": 1 }]
  },
  {
    "id": "raid",
    "kind": "triggered",
    "trigger": { "event": "step", "step": "end", "player": "you" },
    "interveningIf": { "happened": { "event": "attacks", "player": "you", "during": "this-turn" } },
    "targets": [
      {
        "id": "creature",
        "filter": {
          "zone": "graveyard", "owner": "you", "object": "card", "type": "Creature",
          "manaValue": { "<=": { "stat": { "of": "source", "name": "power" } } }
        }
      }
    ],
    "effects": [{ "kind": "move", "objects": { "target": "creature" }, "to": { "zone": "battlefield", "controller": "you" } }]
  }
]
```

Runtime needs: a per-turn fact record for `happened` (the engine already tracks `drawsThisTurn` and `damageEvents`), and last known information for Alesha's power if she has left the battlefield.

## Blasphemous Act (unimplemented today)

```json
[
  {
    "id": "cost-reduction",
    "kind": "static",
    "activeFrom": "stack",
    "grants": [
      { "kind": "cost-modifier", "applies": "this",
        "reduce": { "count": { "all": { "zone": "battlefield", "type": "Creature" } } } }
    ]
  },
  {
    "id": "damage",
    "kind": "spell",
    "effects": [{ "kind": "damage", "amount": 13, "to": { "all": { "zone": "battlefield", "type": "Creature" } } }]
  }
]
```

## Migrated one-offs

**Fall from Favor** (`aura`, `tap-attached`, `monarchUntap`):

```json
[
  { "id": "enchant", "kind": "keyword", "keyword": { "name": "enchant", "filter": { "type": "Creature" } } },
  {
    "id": "enters",
    "kind": "triggered",
    "trigger": { "event": "enters", "object": "source" },
    "effects": [
      { "kind": "tap", "objects": { "attachedTo": "source" } },
      { "kind": "become-monarch", "player": "you" }
    ]
  },
  {
    "id": "untap-lock",
    "kind": "static",
    "grants": [
      { "kind": "untap-restriction", "objects": { "attachedTo": "source" },
        "unless": { "monarch": { "controllerOf": { "attachedTo": "source" } } } }
    ]
  }
]
```

**Myr Battlesphere** attack trigger (`tap-choice`, `animate-source`, `recipient: "defender"`):

```json
{
  "id": "attack",
  "kind": "triggered",
  "trigger": { "event": "attacks", "attacker": "source" },
  "effects": [
    { "kind": "tap", "bind": "tapped",
      "objects": { "choose": { "from": { "zone": "battlefield", "controller": "you", "subtype": "Myr", "status": "untapped" },
                               "count": { "min": 0 } } } },
    { "kind": "apply-continuous", "objects": "source", "duration": "end-of-turn",
      "changes": [{ "kind": "add-stats", "power": { "count": { "binding": "tapped" } }, "toughness": 0 }] },
    { "kind": "damage", "amount": { "count": { "binding": "tapped" } }, "to": { "attackedBy": "source" } }
  ]
}
```

**Thirst for Knowledge** (`alternative` with `requireComplete`):

```json
{
  "id": "draw-discard",
  "kind": "spell",
  "effects": [
    { "kind": "draw", "count": 3 },
    {
      "kind": "choose-one",
      "options": [
        { "id": "artifact", "label": "Discard an artifact card",
          "available": { "exists": { "all": { "zone": "hand", "owner": "you", "type": "Artifact" } } },
          "effects": [{ "kind": "discard", "count": 1, "filter": { "type": "Artifact" } }] },
        { "id": "cards", "label": "Discard two cards",
          "effects": [{ "kind": "discard", "count": 2 }] }
      ]
    }
  ]
}
```

**Kappa Cannoneer** Ward (`pay-mana` + `counter-event`) becomes `{ "kind": "keyword", "keyword": { "name": "ward", "costs": [{ "kind": "mana", "symbols": ["{4}"] }] } }`.

---

# 6. Mapping from the current DSL

Every current construct maps to version 2 or is dropped.

## 6.1 Ability fields

| Current | Version 2 |
|---|---|
| `kind` (outside `rules`) | ability union discriminator |
| `costs`, `effects` | same, only on kinds that have them |
| `target` | `targets: [{ id: "target-0", filter }]` |
| `trigger` | `Trigger` union (§4.8) |
| `intervening` | `interveningIf: Condition` |
| `manaAbility: true` | `kind: "mana"`, criteria checked by the compiler |
| `timing: "sorcery"` | `timing: "sorcery"` |
| `oncePerTurn` | `limit: { perTurn: 1 }` |
| `chosenVariables: ["X"]` | inferred from `{X}` in costs, read with `{ variable: "X" }` |
| `continuous` | static `grants: [{ kind: "continuous" }]` with `condition` on the ability |
| `continuous.characteristicDefining` | `characteristicDefining: true` on the static ability |
| `costModifiers` | static `cost-modifier` grant, or `affinity` keyword. On an activated ability (`use: "activate"`): a separate static ability `<id>-cost` with `applies: { abilitiesOf: "source" }` |
| `keyword` | `kind: "keyword"` |
| `aura` | `enchant` keyword |
| `improvise` | `improvise` keyword |
| `attackCost` | `attack-tax` grant |
| `castingPermission` | `cast-timing` grant |
| `maximumHandSize` | `maximum-hand-size` grant |
| `monarchUntap` | `untap-restriction` grant with `monarch` condition |

## 6.2 Effects

| Current | Version 2 |
|---|---|
| `draw`, `discard`, `gain-life`, `lose-life`, `damage` | same kinds, with selectors and `PlayerRef` |
| `damage.recipient: "defender"` | `to: { attackedBy: "source" }` |
| `move` / `destroy` / `exile` / `sacrifice` with `subject` | separate kinds with `objects: Selector` |
| `subject: "set"` + `filter` | `{ all: Predicate }` |
| `subject: "choice"` + `filter` | `{ choose: { from, count } }` |
| `optional: true` | wrap in `may` |
| `eachPlayer: true` | `for-each-player` with a `choose` selector |
| `link` | `exile.linkAs`, read with `{ linked }` |
| `counter-target` | `counter` with `{ target }` |
| `counter-event` | `counter` with `{ event: "source" }` (usually via `ward`) |
| `pay-mana` + `if` | `may-pay` with `then` / `else` |
| `tap-choice` | `tap` with a `choose` selector and `bind` |
| `tap-attached` | `tap` with `{ attachedTo: "source" }` |
| `alternative` | `choose-one` |
| `animate-source` | `apply-continuous` with an explicit selector and duration |
| `inspect` | `library-sequence` (or `scry` keyword action) |
| `create-token` (enum) | `create-token` with a token definition id |
| `add-counters` (enum) | `add-counters` with a registered counter kind |
| `add-mana` | `ManaAbility.produce` |
| `attach` | `attach` with selectors |
| `become-monarch` | `become-monarch` |
| `redirect-attack` | `reselect-defender` |
| `enter-tapped` | `replacement` ability with `enter-tapped` |
| `sequence`, `if` | `sequence`, `if` with a general `Condition` |

## 6.3 Filters, values and triggers

| Current | Version 2 |
|---|---|
| `zone` | `zone` |
| `controller` / `owner: "you" \| "opponent"` | `controller` / `owner` with a `PlayerRef` (`"you"`, `"opponents"`) |
| `subtypes` | `subtype: [...]` |
| `types` (any of) | `type: [...]` |
| `allTypes` | `and` of `type` |
| `excludeTypes` | `not` of `type` |
| `self: "only" / "exclude"` | `is: "source"` / `not: { is: "source" }`. `{ zone: "battlefield", self: "only" }` as a trigger subject or effect object is the `"source"` selector |
| `kind: "spell" / "card" / "permanent"` | `object` |
| `colored` / `colorless` | `color: "any"` / `color: "colorless"` |
| `untapped`, `attacking` | `status` |
| `attached` | `is: { attachedTo: "source" }` (version 1 means "the object the source is attached to", not a status) |
| `nontoken` | `not: { object: "token" }` |
| `damagedBySource` | `dealtDamageBy: "source"` |
| `manaValue: Value` | `manaValue: Comparison` |
| `handSize: "you"` | `{ cardsIn: { zone: "hand", player: "you" } }` |
| `greatestManaValue` | `{ greatest: { of, name: "manaValue" } }` |
| `"commander-colors"` | `{ commanderColors: "you" }` |
| `trigger.event: "upkeep"` | `{ event: "step", step: "upkeep" }` |
| `trigger.step` on an `enter` trigger | `enters.during` with the named step |
| `trigger.event: "dies"` | `zone-change` from battlefield to graveyard. Version 1 doesn't check for a creature, so it is not the `dies` shorthand |
| `trigger.ordinal` | `draws.nth` |
| `trigger.grouped` | `deals-damage.batch: "one-or-more"` |
| `trigger.combat`, `recipientKind` | `deals-damage.combat`, `to` |
| `trigger.event: "state"` + `counter` + `atLeast` | `{ event: "state", condition }` |
| `trigger.event: "mana"` | `ManaAbility` with a `tapped-for-mana` trigger |
| `trigger.event: "target"` | `becomes-target` |
| `player: "event-player"` / `"event-controller"` | `{ event: "player" }` / `{ controllerOf: { event: "object" } }` |
| `player: "opponents"` / `"each"` | `"opponents"` / `"each-player"` |

## 6.4 Costs and continuous changes

| Current | Version 2 |
|---|---|
| `mana`, `tap-source`, `sacrifice-source`, `discard-source`, `life` | same kinds; `life.amount` takes a `Value` |
| `counter-source` | `counter-source` with `operation: "put"` |
| `tap` / `sacrifice` / `discard` / `return` with `count` + `filter` | same kinds, `filter` is a `Predicate` |
| `crew` cost | `crew` keyword (§4.10) |
| `costModifiers[].component: "generic"` | `cost-modifier.reduce` (generic only, as today) |
| `maximumHandSize: "unlimited"` | `maximum-hand-size` with `value: "unlimited"` |
| `add-types`, `add-stats`, `define-stats`, `grant-keyword` | same change kinds |
| `set-stats` | `set-base-stats` (the name states it sets base power and toughness, layer 7b) |
| `linked-characteristics` | `copy-linked` |

---

# 7. Compiler responsibilities

The compiler sits between the authored AST and the Core AST in the runtime plan (§19–21).

1. **Schema validation:** zod discriminated unions. Most current `superRefine` rules disappear because the types make them unrepresentable.
2. **Reference checks:** target ids, binding names and types, `linked` names, token ids, counter kinds and keywords all resolve.
3. **Context checks:** `{ event: … }` selectors only inside triggered or replacement abilities; `{ variable: "X" }` only when a cost contains `{X}`, or in a `cost-modifier` with `applies: "this"` on a card whose mana cost contains `{X}` (X is chosen before the total cost is determined, CR 601.2b and 601.2f; found in roadmap issue 6); `activeFrom` legal for the ability kind.
4. **CR-derived checks:** mana-ability criteria (CR 605); spell abilities only resolve from the stack; characteristic-defining abilities only define the source's own characteristics.
5. **Desugaring:** string shorthand, `enters` / `dies`, the legacy single `target`, implicit owner destinations, implicit "you control" on sacrifice costs, and macro keyword expansion.
6. **Layer tagging:** every `ContinuousChange` is tagged with its CR 613 layer.


**As built:** `compileCard(source, registries)` in `src/server/rules/compiler.ts`. It returns Core abilities, or a list of errors with paths into the card. The Core AST uses the authored types with the invariants listed at the top of that file (no shorthand, normalized triggers and destinations, expanded keywords, layer tags). Tests: `tests/rules/compiler/`.
---

# 8. Expressiveness test set

A card from this set is "expressible" when its full Oracle text can be written in version 2 without a card-specific kind. A missing general CR concept is allowed: it is listed and becomes engine work. The set is fixed so progress can be measured. Add to it; don't remove from it.

| Card | Needs |
|---|---|
| Austere Command | modes (choose 2), predicate comparators |
| Alesha, Who Laughs at Fate | named step trigger, `happened` turn fact, comparator with a stat value, LKI |
| Blasphemous Act | this-spell cost modifier, damage to a set |
| Chain Reaction | damage to a set, `count` value |
| Breath Weapon | damage to a set, `not` predicate |
| Beast Within | `create-token` with `controller: { controllerOf: target }` (LKI) |
| An Offer You Can't Refuse | counter, token controller from target, token definitions (Treasure) |
| Bake into a Pie | destroy target, token definition (Food) |
| Boros Charm | modes, player-or-planeswalker target, `apply-continuous` until end of turn |
| Collective Resistance | modes (min 1, max 3), `escalate` keyword |
| Charming Prince | modes, `scry`, `create-delayed-trigger` |
| Burst Lightning | `anyTarget`, `kicker` keyword, `{ if: { paid: "kicker" } }` value |
| Banishing Light | `exile` with `until` (CR 610.3) |
| Angelic Destiny | `enchant`, several continuous changes, `dies` trigger on the enchanted creature (look back in time) |
| Confiscate | `gain-control` continuous change (layer 2) |
| Angel of Vitality | `replacement` with `modify-amount` on `would-gain-life`, static `condition` on life total |
| Ajani's Pridemate | `gains-life` trigger |
| Bloodthirsty Conqueror | `loses-life` trigger, `eventAmount` value |
| Archangel of Tithes | `attack-tax` and `block-tax` with a source-status condition |
| Arcane Epiphany | cost modifier with a `condition` |
| Bitter Reunion | `may` + `didPerform` ("if you do"), `apply-continuous` haste to a set |
| Count on Luck | `library-sequence` exile, `play-permission` until end of turn |
| Circuitous Route | `search` with `or` predicate, tapped destination, `shuffle` |
| Chaos Warp | move to library + shuffle, reveal top, `if` on the revealed card |
| Bojuka Bog | `enter-tapped` replacement, player target, exile a player's graveyard |
| Army of the Damned | `create-token` tapped ×13, `flashback` keyword |

Acceptance: every card in the table is written out in version 2 in `tests/fixtures/dsl-expressiveness/` and passes the compiler. Engine support follows as runtime milestones land.

**As built:** the 26 files are in `tests/fixtures/dsl-expressiveness/`; `tests/rules/compiler/expressiveness.spec.ts` is the gate. The `imported` sections come from the migration of the catalog files. Writing them needed one AST change (`during` on `enters`, §4.8, found by the migration) and four token definitions. Two readings to check in review: Archangel of Tithes' `attack-tax` with `defender: "you"` covers "you or planeswalkers you control"; Count on Luck exiles with a `library-sequence` whose `rest` goes to exile, then grants `play-permission` for the bound cards.

---

# 9. Migration

1. **Version the schema.** Definitions gain `"catalogVersion": 2`. The loader accepts version 1 and version 2 during migration. This migration is shared with the [card model refactor](card-model-refactor.md) (§6 there), which also restructures the definition file into `imported` and `authored` sections and stops storing derived fields. The 783 files are rewritten once.
2. **Write the migration script** (`src/server/catalog/migrate-rules-v2.ts`).
   - Mechanical for the common cases (§6).
   - Hand-written for the one-offs in §2.1.
   - Emits a diff report per card and fails on any construct it can't map.
   - Inline rule definitions in tests (about 32 in `tests/rules/characterization/`, 4 in `tests/catalog.spec.ts`) are not run through the script. They are rewritten to version 2 by hand in the same change as the catalog (roadmap issue 6).
3. **Down-compile for the current runtime.** Until the VM and handlers from runtime milestone M2 exist, the compiler lowers the version 2 Core AST into the current runtime shapes. Constructs the current runtime can't run (modes, multiple targets, replacements) make the card fail to load as implemented, which keeps the engine untouched in M1.
4. **Verify.**
   - The characterization suite passes on migrated definitions.
   - The catalog-wide compile test covers all 783 definitions.
   - Every card with `automationStatus: "implemented"` still compiles to an executable form.
5. **Remove version 1** once no definition uses it.

**As built:** `src/server/catalog/migrate-rules-v2.ts` maps what the engine runs today, not the Oracle text. `migrateDefinition` takes a version 1 file and returns a version 2 file plus notes, or the unmapped constructs with their paths. It checks the stored derived values first (CM §6) and returns version 2 input unchanged. `npx tsx --tsconfig tsconfig.server.json src/server/catalog/migrate-rules-v2.ts [catalog root]` is the dry run: it prints the diff report and writes no file. Macro keywords are recognized when an ability is exactly their expansion (ward, cycling, equip, crew, living weapon, affinity). The down-compiler is `src/server/rules/down-compiler.ts`. `tests/rules/compiler/down-compile.spec.ts` is the golden test; it compares the ability fields the engine reads (id, kind, description, an activated ability's zone, rules). The ability-level `keyword` and `origin` are never read.

**As built (roadmap issue 6):** the script rewrote the 783 files once and was then deleted with the version 1 schema and loader; it remains in the history of issue 5's branch. The engine loads the catalog through compiler → down-compiler (`definitionFromFile` in `src/server/catalog/catalog-files.ts`). Before the rewrite, the version 1 runtime abilities of the implemented cards were captured in `tests/fixtures/golden/v1-runtime-abilities.json`; the golden test now compares the loaded catalog against that fixture. The `superRefine` of the runtime ability schema is gone (the compiler validates authored abilities); the runtime schema itself goes with the down-compiler in issue 8. Inline test definitions are authored in version 2 through `tests/support/authored.ts`.

---

# 10. Out of scope

- Implementing runtime support for the new CR concepts in §8. That is runtime milestone work.
- Changing the card characteristics model (`docs/card-model.md`), except adding token definitions.
- Oracle-text parsing or automatic card authoring.
