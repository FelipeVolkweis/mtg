# 04: Store structured Effects and rules context

**What to build:** Store ordered, typed Effect data and the rules context it needs so future automation can interpret card text without adding execution behavior to the Manual Match.

**Blocked by:** Card Catalog and Rules-Ready Data #03: Store structured Card Abilities

**Status:** ready-for-agent

- [ ] Effect is used in its Comprehensive Rules sense. Ordered structured parts preserve relationships to Game Objects and relevant characteristics, while the card's rules text remains available.
- [ ] Represent one-shot, continuous, replacement, prevention, and delayed-triggered behavior as distinct data forms.
- [ ] Continuous Effects retain their source ability, affected Game Objects or Object Filter, typed semantic changes, value sources, duration, and applicability. Their changes do not overwrite printed Card Characteristics.
- [ ] Card data does not store layer or sublayer labels; future rules automation derives those classifications from typed changes.
- [ ] An Object Filter expresses eligible Game Objects by kind, characteristics, Zone, or relationship to Match Players. It stays independent of the time at which a condition or effect inspects characteristics.
- [ ] Replacement and triggered abilities share a Zone Change Condition that records the moving object, source/destination Zones, and whether a move would occur or has occurred. A Zone Change Condition can refer to an Object Filter.
- [ ] Replacement action data remains distinct from its condition; a triggered ability's effect remains distinct from its trigger condition. Pre-change and last-known-information timing are recorded at the use site.
- [ ] Data supports current information and last known information where the Comprehensive Rules require them, without adding a generic Match event history or event snapshot.
- [ ] A reusable Library Sequence records source Zone, operation, stop predicate, handling and order of selected/remaining cards, and no-match behavior.
- [ ] Representative data verifies Progenitus versus Emrakul, the Aeons Torn; Blood Artist versus Scavenging Ooze; Leyline of the Void versus Rest in Peace; Opalescence versus Humility; and Snapcaster Mage/Sword of Fire and Ice grants, without evaluating their effects.
