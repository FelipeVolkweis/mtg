# 02: Import complete card forms and characteristics

**What to build:** Extend locally imported Card Definitions to preserve the complete game-specific Card Characteristics model across ordinary, multi-part, and context-specific card forms.

**Blocked by:** Card Catalog and Rules-Ready Data #01: Import a local card set

**Status:** ready-for-agent

- [ ] Each imported Card Definition carries all applicable rules characteristics and printed card data, including name, mana cost, colors/color indicator, supertypes/types/subtypes, rules text/ability collection, power, toughness, loyalty, defense, symbols, quantities, and card-form metadata.
- [ ] A field that does not apply is absent rather than replaced with a fabricated value; uncommon applicable fields are not discarded for convenience.
- [ ] Each Card Definition has one or more Card Components using the same Card Characteristics field model. Component relationships represent applicable double-faced, split, Room, meld, and other multi-part forms.
- [ ] Double-faced forms distinguish modal double-faced, nonmodal double-faced, and meld; full characteristics are retained for each face and the melded composite form.
- [ ] Alternative Characteristics use the shared field model and declare partial or full composition. Partial values inherit only what the Comprehensive Rules leave unchanged; omitted values in a full alternative remain absent.
- [ ] Card Definition Color Identity is distinct from current color. Printed variable markers such as `*` and `1+*` remain in Card Characteristics, while a characteristic-defining Card Ability can declare the value source.
- [ ] Ordered typed mana symbols and quantities are preserved for mana costs. Same-named printings share one Card Definition and alternate printings do not override its gameplay characteristics.
- [ ] Imported characteristic data is available through local catalog lookup and is consumed by Decklist/Match card views.
- [ ] Model examples verify an ability-free creature, Tarmogoyf, Walking Ballista, a modal double-faced card, a split or Room card, a meld pair, Phyrexian Fleshgorger's partial Prototype values, Bonecrusher Giant's full Stomp alternative, Omen spells, and Preparation spell-copy characteristics.
