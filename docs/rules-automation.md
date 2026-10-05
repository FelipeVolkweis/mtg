# Rules automation: complete mono-U release

Commander requires a selected legendary creature commander, exactly 100 cards,
singleton nonbasic cards, compatible Color Identity, and complete authored
automation support. The mono-U sample resolves locally to 100 physical cards and
67 supported Card Definitions; Sai and Padeem can lead it, while Graaz cannot lead
the unchanged blue Decklist. Two ready humans start mirror Matches; one ready
human starts solo practice against an inert opponent. Manual gameplay has been
retired, while legacy Match snapshots require player consent for replacement.

`MatchService.execute` is the server-owned gameplay command boundary. Transport,
authorization, stale-revision checks, database transactions, and participant views
remain in Room. Execution runs on a copy and publishes accepted state atomically;
rejected commands leave resources, choices and revisions unchanged. The same
boundary returns accepted, rejected, or pending results. Scenario construction is
restricted to test code; there is no player-accessible fixture command.

The agreed testing seam is the command/player-view boundary. Acceptance tests use
isolated fully supported Decklists and authored release card definitions. Browser
coverage uses the same WebSocket commands and shared choice controls as players.
Rules views conceal both Libraries, reveal each Hand only to its player, and show
pending procedure details and legal choices only to the player answering them
or the solo practice controller handling the practice seat.

Card Abilities may contain a validated `rules` composition. It describes costs,
Object Filters, targets and semantic effects. Imported keywords and legacy
primitive envelopes do not imply execution support. Complete definitions retain
binary automation status. Ornithopter of Paradise now supports its mana ability and flying. The catalog importer preserves
these separately owned authored fields.

Opening procedures remove commanders before shuffling, draw seven, and use London
mulligans. Two-player games have no multiplayer free mulligan. Keeping requires
one selected bottomed card per mulligan. The chosen or randomly selected starting
player skips their first draw. Untap and ordinary cleanup provide no Priority;
cleanup waits for the active player's private discard selection if needed. Empty
combat skips declare blockers and combat damage. Checkpoints precede Priority;
this slice handles life and failed draws, with further state-based actions and
trigger handling added alongside the mechanics that require them.

The casting procedure locks its total cost before payment. Players explicitly
choose mana abilities before casting or inside the payment window. Automatic pool
spending reserves specific colors and colorless requirements first, then pays
generic costs from colored pools in descending remaining quantity, exhausting each
pool in order, and finally colorless. Equal colored quantities use W, U, B, R, G
order. Ineligible restricted mana is excluded; unspent restrictions persist.
Ordinary mana expires on step transitions. No source is activated automatically.

Targets are selected before payment and revalidated during resolution. Spells and
Ability Game Objects remain distinct. Activated costs are checked in authored
order before committing resources. Tap-symbol costs enforce creature control
since the beginning of the controller's most recent turn; selecting an untapped
creature for a separate tap cost does not impose that restriction. Paid ability
objects capture their effects and targets so sacrificed or discarded sources do
not prevent resolution. Casting Records retain source Zone and mana spent, and
Card Instance identity persists across fresh Game Object identities.

Pending casts, targets, activations and cleanup choices are ordinary persisted
Match data. Reconnection restores their procedure identifiers and authorized
choices; revision and identifier checks prevent duplicate completion. Cancelling
an unfinished procedure pays none of its costs. Separately completed mana
abilities remain completed, with their mana in the player's pool.

Ordered spell resolution persists a queue of remaining instructions and numeric
bindings. Authored sequences, result-bound quantities and conditions share this
interpreter. Discard alternatives declare whether complete performance is
required: Thirst for Knowledge permits one artifact only when that option can be
completed, otherwise discarding as many of the requested two cards as possible.
Pull from Tomorrow chooses X before locking its mana cost, records that value in
its Casting Record, draws X, then offers a discard from the updated Hand. Zero
quantities and impossible discards complete without a prompt.

Resolution retains its source on the Stack and grants no Priority while a player
answers. Each new choice receives a fresh identifier; the private prompt supplies
its responding player, labels, requested and legal quantities, eligible card IDs
and explanatory context. The progress queue and bindings stay server-private.
Insufficient Library contents do not interrupt later instructions: the failed-draw
checkpoint runs only after resolution completes. Browser reconnect tests restore
both cards' choices from persisted Room state without repeating draws.

Semantic entering, casting, and Zone-change events retain controllers, owners and
pre-change effective characteristics. Battlefield-to-Graveyard events collect
death triggers using the sources present before the move; other destinations do
not count as deaths. Triggered Ability Game Objects capture their effect data and
event context independently of their source. Event context is server-private and
lasts with waiting triggers or their Stack objects, without an action history.

Triggers wait throughout payment and suspended resolution. At a Priority
checkpoint, state-based actions repeat until stable, then waiting triggers are
placed in active-player/nonactive-player order. Each player orders their own
simultaneous triggers from bottom to top through a persisted choice.
New triggers generated while selecting targets wait in a separate batch until
the current batch is completely placed; both batches survive suspended choices
and remain server-private. Cancelling a
cast retains completed mana activations and places their waiting triggers at the
restored Priority opportunity. Browser coverage verifies trigger-order recovery.

Shared Thopter and Myr descriptors create independent token Game Objects with
explicit characteristics, an owner and controller, and no Card Instance.
Thopters carry enforced flying.
Ichor Wellspring, Vedalken Archmage, Sai and Foundry of the Consuls have authored
trigger, draw and token behavior.

Active Continuous Effects retain their source ability, controller, applicability,
filter and typed changes separately from printed Card Characteristics. A shared
calculator applies characteristic-defining stats before additive bonuses and
Counters, with live controlled-object counts and self/other exclusions. Player
views show effective stats and Counters and omit hidden continuous sources.
Chief of the Foundry, Master of Etherium and Steel Overseer are supported.
Zero-toughness creatures leave at checkpoints after complete resolution, including
simultaneous deaths; opposite stat counters cancel and departed tokens cease to
exist. Pre-change effective values remain available in event context.

Generic cost modifiers compose source-local affinity with source-based discounts
using shared filters, count/sum expressions and chosen values. Etherium Sculptor,
Foundry Inspector, Tamiyo's Logbook and Thoughtcast are supported. Costs lock after
variables and targets are chosen and before payment; subsequent mana activations
and source removals preserve that amount. Reductions clamp generic costs at zero
and leave colored requirements unchanged. Both preproduced mana and production
during payment use the same locked cost.

Darksteel Juggernaut, Broodstar, Memory Guardian, Spire Golem and Thought Monitor
now combine their authored stats, affinity and entry behavior with enforced
flying, indestructible or attack requirements and are implemented. The complete
mono-U Decklist remains ineligible until the remaining slices are delivered.

Private Library inspection persists the looked-at object IDs and choice stage only
in the resolving procedure. Its controller can select bottomed cards and order
the remaining top cards without revealing the Library to another player. Tome's
page-counter costs collect a distinct state trigger at Priority checkpoints;
waiting or stacked instances prevent duplicates. Its activation remains pending
independently of its source, and the exile result controls its life gain.
Tapped-entry replacements run whenever an effect puts a card onto the Battlefield.

Shared movement filters distinguish owners and controllers, public Graveyards,
nontoken objects, opponents, colors and type unions. Returning an artifact is a
cost, separate from resolution-time selection from the updated Hand. Card
Instances survive fresh Game Object lifetimes with reset counters, status, links
and Attachments. Spellbomb, Buried Ruin, Myr Retriever and Transmuter are supported.

Destruction, exile and sacrifice have separate semantics. Destruction respects
indestructible characteristics; sacrifice does not. Disk snapshots its complete
union before simultaneous destruction. All Is Dust collects each player's colored
permanent selection, then sacrifices every selection together. Death-trigger
sources and effective pre-change values survive simultaneous departures. Meteor
Golem and Lantern use target choices when their entry triggers reach the Stack;
targets are revalidated at resolution. Target selection and trigger ordering
resume without granting Priority midway through Stack placement.

Equipment Attachments are separate from Object Links. Sorcery-timed equip targets
controlled creatures, and living weapon creates a black 0/0 Phyrexian Germ before
attaching Nettlecyst. State-based checks wait until both instructions finish.
Equipment bonuses count each artifact/enchantment once, update as the board
changes and stop when their source leaves. Adaptive Omnitool combines equip and its artifact-count bonus with private
attack-time inspection and optional revealed artifact retrieval.

Duplicant's optional nontoken-creature exile records the new Exile object's ID in
an Object Link. Its continuous ability reads that creature card's current
characteristics in Exile, retaining Shapeshifter; unrelated exiled cards do not
apply. Departed linked cards and new Duplicant lifetimes do not reuse an old link.
The link is persisted with Match state and projected only through visible objects.

Combat declarations are persisted turn-based choices at the start of the declare
attackers and declare blockers steps, followed by ordinary Priority windows.
Only the declaring player sees the legal choices. Shared Combat state records
attackers, defending players or permanents, blockers and whether an attacker was
blocked. Effective creature types, controller, tapped state, control timing,
flying, reach, unblockability and Wall restrictions govern legality. Changing
characteristics before declaration changes the available choices. Departing
creatures leave combat; an attacker whose blockers leave stays blocked.

At combat damage, players divide an attacker's power among multiple blockers.
Single-recipient assignments are automatic, and blocker damage is simultaneous
with attacker damage. The current rules permit arbitrary division among multiple
blockers without a damage assignment order ([Wizards Foundations update](https://magic.wizards.com/en/news/announcements/foundations-update-bulletin)).
Damage events retain source identity and characteristics, controller, recipient,
amount, combat status and turn for later consumers, expiring at the next turn. Damage is distinct from life
loss; both combat and resolving noncombat effects use the same operation. Damage
marks persist on creatures until cleanup or departure. Indestructible prevents
destruction and lethal-damage death, while zero toughness, sacrifice, exile and
bounce retain their distinct semantics. Checkpoints apply simultaneous creature
deaths, failed-draw losses and zero-life losses, and completed Matches stop
Priority and further gameplay.

Typed keyword grants participate in effective characteristics and opponent
hexproof target legality, including revalidation during resolution. Costs and
untargeted effects do not target. Flash and source-based artifact casting
permission use the normal casting/payment procedure and require Priority.
Darksteel Citadel, Shimmer Myr and Research Thief are fully implemented. Research
Thief combines flash and flying with individual combat-damage draw triggers.

Crew selects untapped controlled creatures by total effective power. It can use
newly controlled creatures and remains separate from tap-symbol costs. The
resolved ability adds Artifact and Creature types until end of turn, preserving
Vehicle stats and subtypes, Counters and other changes. Equipment uses effective
creature types when attaching and detaches at a checkpoint if animation ends. The Vehicle's own attack
and tap-symbol timing is checked independently. Cultivator's Caravan, Thopter Fabricator and Skysovereign are complete, including
flying, crew and their draw or entry/attack triggers.

Propaganda opens a per-attacker mana payment using the existing source controls.
No attackers are tapped or declared before the complete payment succeeds;
cancelling returns to attacker selection and retains completed mana activations.
Restricted casting/activation mana cannot pay attack costs. Required attackers
may decline attacks when every legal defender requires optional payment. Graaz
adds Juggernaut types and sets other creatures' base stats to 5/3 before additive
bonuses and Counters, including on crewed Vehicles. Its requirements and Wall
restriction follow those effective types.

Cleanup discards first, then removes damage and temporary effects together. If
state-based actions or triggers require Priority, cleanup waits, offers Priority,
and repeats after the Stack clears before advancing to the next turn. Persisted
choices retain their identifiers across reconnects, including attack payment and
combat damage assignments.
Discarded commanders receive their Command Zone return choice during cleanup,
before the next turn's untap. An accepted return requires Priority and repeated
cleanup; a declined return alone does not.

Attack declarations emit one event per declared creature. Battlesphere creates
four Myr on entry; its attack trigger offers any number of eligible untapped Myr,
binds the tapped count, applies a fixed temporary power bonus, and deals separate
noncombat damage to its current defending player or planeswalker at resolution.
If Battlesphere leaves combat first, its trigger retains the last defending
recipient, including any redirection, and still deals that damage if the
recipient remains eligible.
A departed recipient receives no damage. Skysovereign's entry and attack triggers
choose opposing creatures or planeswalkers and revalidate them before damage.

Omnitool inspects at most six Library cards privately, permits declining an artifact
selection, reveals a selected artifact in Hand to every participant, and randomly
bottoms the rest. The server retains known revealed Hand identities until those
objects leave; the browser displays only those known cards to opponents. Signpost
has flash and blue mana; entering during declare attackers permits a targeted,
optional legal defender reselection. The same destination filter supplies the
prompt and validates the answer. Reselection preserves the declared attack and
does not emit another attack event.

Damage trigger collection distinguishes individual sources from grouped
one-or-more events within a simultaneous damage batch, separately for each damaged
player. Research Thief draws per qualifying creature; Spy Network draws per damaged
player. Hellkite's chosen-X destruction reads only current-turn combat recipients
at resolution and matches their nonland permanents' mana values. Activation usage
belongs to the source Game Object and ability. Both usage and damage attribution
reset each turn; a fresh Game Object does not inherit them. Its power activation
uses the same temporary-effect machinery.

Draw instructions emit an event for each successfully drawn card, recording each
player's turn ordinal without performing state-based checks midway through
resolution. Fabricator triggers on the second draw. Scrawling Crawler draws for each
player at its controller's upkeep and applies life loss for opponents' draws.
Psychosis Crawler derives live Hand-size stats and causes each opponent to lose
life on its controller's draws. Temporary zero toughness between resolving
instructions does not cause premature death.

Mind's Eye suspends resolution for a private optional mana payment. Players can
activate mana abilities in that payment window; automatic pool allocation follows
the existing spending policy and excludes mana restricted to casting/activation.
Pay and Decline are distinct browser controls. The result binding controls the
follow-up draw, and persisted choice identifiers prevent duplicate completion.
Thought Vessel's no-maximum-Hand-size grant applies only while its controller has
that source on the Battlefield.

Padeem grants controlled artifacts hexproof and compares live greatest artifact
mana values, including ties and requiring an actual controlled artifact. Its
upkeep condition and Spy Network's controlled-artifact upkeep condition are
checked both when triggering and when resolving. Shimmer Dragon's conditional
hexproof follows the live four-artifact threshold. Its draw cost selects two
untapped artifacts and can use newly controlled artifacts, independently of
creature tap-symbol restrictions. Printed characteristics remain unchanged.

Improvise offers explicit untapped artifact selections for generic payment after
costs are locked. It composes with artifact reducers and pool spending without
producing mana; invalid quantities, duplicate objects, or tapped artifacts leave
all payment resources unchanged. Cannoneer gains a Counter and temporary
unblockability on each controlled-artifact entry. Ward captures the responsible
Stack object when opposing targeting occurs, uses normal trigger ordering, and
opens a separate optional payment for that object's controller; the trigger
outlives its source and counters the captured object on decline.

Forsaken Monument grants +2/+2 to controlled colorless creatures, adds one
colorless mana for each applicable permanent tap for colorless mana immediately
without a Stack object, and gains two life through an ordinary colorless-cast
trigger. Mana production composes with both supported payment workflows.

Fall from Favor casts with a creature target and attaches before its entry
trigger taps that creature and crowns its controller. The enchanted creature's
untap restriction compares its own controller with the current monarch. Monarch
end-step draws and combat transfers are ordinary designation triggers controlled
by the monarch when they trigger, with the damaging creature's controller as the
transfer beneficiary; APNAP ordering applies alongside card triggers.

Commander designation belongs to the Card Instance across Zones. Command Zone
casts increment tax counts and add two generic mana per earlier Command Zone
cast before reductions and payment locking. Hand/Library return choices replace
movement and retain the interrupted command and original Priority for atomic
resumption; Graveyard/Exile returns are offered after movement at the checkpoint.
Combat damage is accumulated separately for each commander Card Instance and
recipient; 21 damage produces a Commander-specific loss at the checkpoint.

Solo practice uses a supported mirror Decklist and its own Library, commander,
Hand, and Life Total. The human's Priority never passes automatically. Required
practice-seat choices are delegated through the same authorization policy used
for command execution and participant views. Spectators remain read-only.
Practice-seat passes, procedures, and results are persisted with the Match;
replacement consent includes only real human Match Players.

Launch Mishap, Aetherize, and Whirler Rogue complete the remaining authored pool.
Eligibility requires the complete implemented definition and supported validated
compositions; imported keywords and empty authored mechanic envelopes cannot
substitute for Improvise or Ward behavior. Existing Rooms and Decklists are
preserved, and the browser exposes legacy replacement without arbitrary state
mutation. ADR-0016 records the superseding gameplay decision.
