# Stack holds spells and abilities

The Stack is an ordered Zone of Game Objects, not a collection limited to card copies. A spell Game Object can reference its Card Instance, while an activated or triggered ability can be on the Stack without a Card Instance, as described in [Comprehensive Rules sections 405.1–405.2](https://magic.wizards.com/en/rules). This supports the Magic rules model while leaving ability creation and resolution manual until automation is added.
