# Mono-G port

Porting `sample-decklists/mono-g.md` (69 distinct cards) to authored abilities
and to the rules engine. The deck needed constructs the card DSL could not
express and runtime the engine did not have. The port ran in two phases: first
it extended the DSL and compiler and authored every card; then it gave the
runtime each form, so every card is `implemented` and the deck passes
Commander setup in mirror and practice matches.

## Where the port stands

- **Authored:** all 69 cards have their abilities in `catalog/definitions/`
  (basic lands and vanilla creatures have none to author).
- **Implemented:** all 69. `tests/rules/catalog/mono-g.spec.ts` pins that, and
  that the 100-card list resolves, passes `automationEligible` for every card
  and sets up a match.
- **Tests:** each mechanic has a gameplay test in
  `tests/rules/characterization/mono-g-*.spec.ts` (combat, values, triggers,
  grants, mana, effects, library, targets, layers); the support check and the
  compiler have theirs in `tests/rules/compiler/mono-g-*.spec.ts`.

## New DSL constructs

Each is one CR concept ([card-model.md](../card-model.md#card-dsl) rule 1). All
compile, are tagged with their layer where CR 613 applies, and run.

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
| Effect `fight` (`pairing: "distinct"`) | the fight keyword action (CR 701.12) | Ezuri's Predation |
| Effect `add-mana` | mana added by an effect | Hulking Raptor |
| Effect `apply-replacement` | a temporary prevention effect (CR 615) | Arachnogenesis |
| Event pattern `would-be-dealt-damage` with `source` and `combat` | which damage a prevention covers | Arachnogenesis |
| Damage `excessTo` | excess damage dealt elsewhere (CR 120.4a) | Ram Through |
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
| Counter kind `stun` | stun counters (CR 122.1g) | Pugnacious Hammerskull |
| Tokens `spider-1-2-green-reach`, `phyrexian-beast-4-4-green` | tokens | Arasta, Arachnogenesis, Ezuri's Predation |

## What the runtime gained

Beyond running each construct above, the deck needed forms the DSL already
had and the runtime did not run. Where each lives:

- **Combat keywords.** Trample, deathtouch and lifelink are runtime keywords.
  `Combat.damageChoices` offers a trampler the defender as a recipient with
  the lethal damage each blocker needs first (`DamageChoice.trample`) and
  validates the split (CR 702.19b). Deathtouch marks a damaged creature for the
  state-based rule (`rules.deathtouchDamaged`, CR 704.5h); lifelink gains the
  life as damage is dealt (`EventRuntime.damage`, CR 702.15b).
- **Tokens.** Beast, Spider and Phyrexian Beast ([tokens.ts](../../src/server/match/tokens.ts)).
- **Targets and modes.** Any number of target clauses, each with a count
  (`targets.ts`); modes chosen at casting or as a trigger goes on the Stack;
  escalate; damage divided among the targets as the spell is cast; the legal
  targets are re-read per clause on resolution. The prompt panel has forms for
  modes, several targets, the gift promise and dividing damage.
- **Filters and conditions.** `power`, `toughness`, specific colors,
  `counters`, `keyword`, `commander` and `attacking` predicates; any condition
  the evaluator decides as a static, intervening-if or activation condition
  (`Walker.condition`); the optional-cost condition `paid`.
- **Triggers.** The beginning of the first main phase, of combat and of the end
  step (as the upkeep was); `blocks`; a damage trigger whose recipient is a
  predicate (Enrage).
- **Rules grants.** `cant-attack`, `cant-block`, `max-blockers`, block
  restrictions by a predicate and additional land plays, read where the player
  acts and gated by their ability's condition.
- **Effects.** `may` around any instruction, `add-mana`, `fight`, `play`,
  `apply-replacement`, continuous changes that set types or colors, remove or
  grant abilities, or double power and toughness.
- **Library.** Reveal until a match, look-and-put-onto-the-battlefield and
  hideaway; a face-down exiled card is hidden from other players in the view.
- **Layers.** Timestamps (CR 613.7), type-changing effects that wait for the
  effect that makes an object a creature (CR 613.8), and `abilitiesOf`.
- **Casting.** A gift promise, free casts during a resolution, escalate.
- **Smaller engine fixes.** An `apply-continuous` locks its values once, before
  any object changes (CR 611.2c); stun counters replace untapping
  (CR 122.1g); the VM remembers last known controller and owner.

## Notes

- Gigantosaurus and Terrian, World Tyrant have empty Oracle text in the
  imported data, so they are authored as vanilla creatures. If the importer's
  data for Terrian is incomplete, fix the import, then author the ability.
- Playing a land from exile with Mosswort Bridge needs a land play left, as if
  it were played from the Hand; it ignores timing.
- Layer dependencies (CR 613.8) are handled for type-changing effects only; a
  condition on a static ability reads base characteristics.
- A granted ability must not be static; the support check says so.
- The rooms' stored shape gained only optional fields (`timestamp`,
  `targets`, `division`, `preventions`, `deathtouchDamaged`, `status.faceDown`
  and the like), so `currentSnapshotVersion` is unchanged.
