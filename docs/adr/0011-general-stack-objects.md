---
status: accepted
---

# Stack holds spells and abilities

The Stack is an ordered Zone of Game Objects rather than a collection limited to card copies. Spell Game Objects can reference Card Instances; activated and triggered Ability Game Objects exist independently of Card Instances, allowing both kinds to share ordering and resolution procedures.

[ADR-0016](0016-rules-automated-commander-and-practice.md) supersedes this ADR's original manual Priority and resolution policy. The general object model remains accepted; current Matches track explicit human Priority passes and resolve supported authored behavior through the rules engine.
