# Stack holds spells and abilities

_Superseded by [ADR-0016](0016-rules-automated-commander-and-practice.md)._

The Stack is an ordered Zone of Game Objects, not a collection limited to card copies. A spell Game Object can reference its Card Instance, while an activated or triggered ability can be on the Stack without a Card Instance, as described in [Comprehensive Rules sections 405.1–405.2](https://magic.wizards.com/en/rules). Manual Matches do not formally track Priority or pass sequences; participants coordinate Stack resolution themselves. Keep the model extensible so a later rules module can represent whose Priority it is and which players have passed. This supports the Magic rules model while leaving ability creation and resolution manual until automation is added.
