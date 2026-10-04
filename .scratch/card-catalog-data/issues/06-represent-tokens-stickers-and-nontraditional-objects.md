# 06: Represent tokens, stickers, and nontraditional objects

**What to build:** Let a Manual Match represent tokens, stickers, and nontraditional card objects with the separate Catalog and Match data they need, while leaving their procedures manual.

**Blocked by:**

- Card Catalog and Rules-Ready Data #02: Import complete card forms and characteristics
- Card Catalog and Rules-Ready Data #04: Store structured Effects and rules context
- Card Catalog and Rules-Ready Data #05: Retain card-specific state in a Match

**Status:** ready-for-agent

- [ ] Reusable Token Definitions exist separately from Card Definitions for predefined Comprehensive Rules tokens, using the applicable Card Characteristics and Card Component model.
- [ ] Token-creation data can refer to a Token Definition and retain effect-specific additions or modifications. Custom tokens can use explicit characteristics or copy-based descriptors; each created token is a Game Object without a Card Instance.
- [ ] Manual Matches can represent emblems, Dungeons, planes, phenomena, conspiracies, Attractions, and Contraptions, including required special Zones or supplementary decks.
- [ ] A variant area can hold multiple active objects of the same kind when allowed, including multiple active Planes for Planechase/Spatial Merging.
- [ ] Sticker Sheets and Sticker Definitions remain separate from Card Definitions, Card Components, and Card Characteristics. Sticker Definitions retain kind, printed value, and ticket cost when applicable; ability stickers can refer to shared Card Ability data.
- [ ] Match data records which Sticker Sheets each Match Player can use and ordered Sticker Placements on Game Objects. Placing a sticker does not add fields to or rewrite the base card record.
- [ ] Participants can inspect and modify the required manual object and sticker state; mechanics and variant procedures are not executed.
- [ ] Scheme and Vanguard play procedures, setup modifiers, and lifecycle are not added.
- [ ] Behavior checks verify token templates/custom tokens, multiple active Plane objects, special Zone/supplementary deck representation, and Sticker Placement independence from base Card Characteristics.
