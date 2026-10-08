# Mono-G port

Porting `sample-decklists/mono-g.md` (69 distinct cards) to authored
abilities. The deck needed constructs the card DSL could not express, so this
port first extended the DSL and compiler, then authored every card. The runtime
runs 24 of the cards today; the rest compile, fail the runtime
support check by name, and stay `unimplemented` (design rule 8 in
[card-model.md](../card-model.md#card-dsl)).

## Where the port stands

- **Authored:** all 69 cards have their abilities in `catalog/definitions/`
  (basic lands and vanilla creatures have none to author).
- **Implemented (24):** Beast Whisperer, Birds of Paradise, Commander's Sphere, Curious Altisaur, Dungrove Elder, Elvish Mystic, Forest, Fyndhorn Elves, Gigantosaurus, Harmonize, Llanowar Elves, Llanowar Tribe, Regal Imperiosaur, Rogue's Passage, Scavenger Grounds, Scavenging Ooze, Sol Ring, Swiftfoot Boots, Tamiyo's Safekeeping, Terrian, World Tyrant, Thrashing Brontodon, Tranquil Thicket, Verdant Sun's Avatar, War Room. Sol Ring and War Room were
  already implemented; the other 22 are new and covered by
  `tests/rules/characterization/mono-g.spec.ts`.
- **Waiting on the runtime (45):** pinned by name in
  `tests/rules/catalog/mono-g.spec.ts`. Implementing one moves it out of that
  list, flips its `automationStatus`, and adds the gameplay test.

A Commander deck is playable only when every card is implemented, so the deck
stays unplayable until the pinned list is empty.

## New DSL constructs

Each is one CR concept ([card-model.md](../card-model.md#card-dsl) rule 1). All
compile, are tagged with their layer where CR 613 applies, and are rejected by
the runtime support check with their own name. Compiler tests:
`tests/rules/compiler/mono-g-constructs.spec.ts`; support tests:
`mono-g-support.spec.ts`.

| Construct | CR concept | Cards |
| --- | --- | --- |
| Predicate `commander: true` | the commander designation (CR 903.3) | Witch's Clinic, Tangleweave Armor |
| Predicate `keyword` | has a keyword ability | Whiptongue Hydra, Ram Through |
| Predicate `attacking: <player>` | attacking a player (CR 506.3) | Arachnogenesis |
| Predicate `counters` without a `kind` | has a counter of any kind | Rishkar, Peema Renegade |
| Value `total` | sum of a stat over a set | Surrak, the Hunt Caller; Ghalta; Mosswort Bridge |
| Value `product` | multiplication | Shamanic Revelation |
| Value `atCast` | determined as the spell is cast (CR 601.2) | Monstrous Onslaught |
| Activated and mana ability `activateOnlyIf` | an activation restriction (CR 602.5b) | Bonders' Enclave, Whisperer of the Wilds |
| Mana ability `instead` | "if …, add … instead" | Ilysian Caryatid |
| Effect `play` (`payment: "free"`) | play or cast without paying the mana cost (CR 118.9) | Mosswort Bridge, Rishkar's Expertise |
| Effect `fight` (`pairing: "distinct"`) | the fight keyword action | Ezuri's Predation |
| Effect `add-mana` | mana added by an effect | Hulking Raptor |
| Effect `apply-replacement` | a temporary replacement or prevention effect (CR 614, 615) | Arachnogenesis |
| Event pattern `would-be-dealt-damage` with `source` and `combat` | which damage a prevention covers | Arachnogenesis |
| Damage `excessTo` | excess damage dealt elsewhere (CR 702.19) | Ram Through |
| Damage `divide` | damage divided as you choose (CR 601.2d) | Monstrous Onslaught |
| Library sequence `count: { until }` | reveal until a card matches | Clifftop Lookout |
| Library sequence `select.linkAs` and destination `faceDown` | exile face down, linked to the source (hideaway) | Mosswort Bridge |
| Continuous change `set-types`, `set-colors`, `remove-abilities` | layers 4, 5 and 6 | Kenrith's Transformation |
| Continuous change `grant-ability` | layer 6 | Rishkar, Peema Renegade |
| Continuous change `double-stats` | the double keyword action, layer 7c | Unnatural Growth |
| Grant `cant-attack` | an attack restriction | Rhonas the Indomitable |
| Grant `max-blockers` | "can't be blocked by more than one creature" | Challenger Troll |
| Grant `additional-land-plays` | extra land plays (CR 305.2) | Loot, Exuberant Explorer |
| Trigger `blocks` | a creature blocks | Elder Gargaroth |
| Keyword `gift` | the gift promise, read by `{ paid: "gift" }` | Scrapshooter |
| Counter kind `stun` | stun counters (CR 122) | Pugnacious Hammerskull |
| Tokens `spider-1-2-green-reach`, `phyrexian-beast-4-4-green` | tokens | Arasta, Arachnogenesis, Ezuri's Predation |

## What the runtime still needs

Beyond the constructs above, several cards use DSL the runtime already
compiles but does not run. These are the runtime work, grouped by what they
share:

- **Combat keywords:** trample (damage assignment with excess), deathtouch and
  lifelink are not runtime keywords. Eleven cards use trample.
- **Tokens:** the runtime supplies characteristics only for the tokens it
  already uses; Beast, Spider and Phyrexian Beast need entries
  ([tokens.ts](../../src/server/match/tokens.ts)).
- **Targets and modes:** more than one target clause, a target clause with a
  count, modes and escalate.
- **Filters and values:** `power` and specific-color predicates in triggers,
  grants and cost modifiers; intervening-if forms other than a number comparison; a static condition
  other than a number comparison.
- **Triggers:** step triggers for begin-combat, first main phase and end step;
  a damage trigger whose recipient is a predicate (Enrage); `blocks`.
- **Spell and ability details:** `may` around an effect other than a move,
  destroy, exile or sacrifice; a block restriction other than by Walls; a
  library sequence other than scry and "select to hand".

Every construct in the previous table also needs its runtime: the support
check lists the form, the evaluator runs it, and a gameplay test covers it.
Two safeguards keep a half-supported form from running with part of its text
ignored: the support check scans every ability for the value forms and
predicate fields the evaluator does not run (`unrunForm` in
[ast.ts](../../src/server/rules/ast.ts)), and the evaluator throws on them. When
the runtime learns a form, remove it from `unrunValueForms` or
`unrunPredicateFields`.

## Cards waiting on the runtime

The support check stops at the first unsupported construct per ability, so a
card can need more than the one listed.

| Card | First thing the runtime can't run |
| --- | --- |
| Arachnogenesis | predicate field attacking |
| Arasta of the Endless Web | The spider-1-2-green-reach token |
| Beast Within | The beast-3-3-green token |
| Bite Down | More than one target clause |
| Bonders' Enclave | An activation restriction |
| Carnage Tyrant | The trample keyword |
| Challenger Troll | The max-blockers grant |
| Clifftop Lookout | This library sequence |
| Collective Resistance | The escalate keyword; Modes |
| Colossal Majesty | An intervening-if other than value ≥ value |
| Elder Gargaroth | The trample keyword; Modes; The blocks trigger |
| Elemental Bond | predicate field power |
| Ezuri's Predation | The phyrexian-beast-4-4-green token |
| Garruk's Packleader | predicate field power |
| Garruk's Uprising | An intervening-if other than value ≥ value; The trample keyword; predicate field power |
| Ghalta, Primal Hunger | The total value; The trample keyword |
| Goreclaw, Terror of Qal Sisma | predicate field power; The trample keyword |
| Hulking Raptor | A precombat-main step trigger |
| Ilysian Caryatid | An instead mana production |
| Kenrith's Transformation | The remove-abilities change |
| Loot, Exuberant Explorer | The additional-land-plays grant; This library sequence |
| Managorger Hydra | The trample keyword |
| Monstrous Onslaught | The atCast value |
| Mosswort Bridge | This library sequence; The total value |
| Overwhelming Stampede | The trample keyword |
| Paradise Druid | A static condition other than value ≥ number |
| Pugnacious Hammerskull | An intervening-if other than value ≥ value |
| Ram Through | predicate field keyword |
| Rhonas the Indomitable | The deathtouch keyword; The cant-attack grant; The trample keyword |
| Rhonas's Monument | A specific color; The trample keyword |
| Ripjaw Raptor | A damage trigger with a recipient predicate |
| Rishkar's Expertise | A may other than an optional move, destroy, exile or sacrifice |
| Rishkar, Peema Renegade | A target clause with a count; The grant-ability change |
| Scrapshooter | The gift keyword; An intervening-if other than value ≥ value |
| Shamanic Revelation | The product value |
| Steel Leaf Champion | A block restriction other than by Walls |
| Surrak and Goreclaw | The trample keyword; The trample keyword |
| Surrak, the Hunt Caller | The total value |
| Tangleweave Armor | predicate field commander |
| Thickest in the Thicket | A end step trigger |
| Unnatural Growth | A begin-combat step trigger |
| Whiptongue Hydra | predicate field keyword |
| Whisperer of the Wilds | An activation restriction |
| Witch's Clinic | predicate field commander |
| Yeva, Nature's Herald | A specific color |

## Notes

- Gigantosaurus and Terrian, World Tyrant have empty Oracle text in the
  imported data, so they are authored as vanilla creatures. If the importer's
  data for Terrian is incomplete, fix the import, then author the ability.
