# 05: Retain card-specific state in a Match

**What to build:** Let a Manual Match retain choices, cast facts, face state, and other card-specific values that future Card Abilities may refer to, without checking or applying those rules.

**Blocked by:**

- Multiplayer Magic Tabletop #05: Track manual table state
- Card Catalog and Rules-Ready Data #04: Store structured Effects and rules context

**Status:** ready-for-agent

- [ ] A spell Game Object has a Casting Record containing its source Zone and applicable choices/payment facts: chosen X, modes or fused split-card halves, alternative/additional costs, and colors of mana spent.
- [ ] A Casting Record remains available when a spell resolves into a permanent if a Card Ability or rule needs it. An object put onto the Battlefield without being cast has no Casting Record.
- [ ] A chosen card name can be any name, whether or not it is in the local Card Name Directory. Chosen values and applicable variable bindings such as `X = N` are stored on the relevant Game Object or Ability Game Object.
- [ ] Match state retains each double-faced Game Object's chosen/current face and any melded composite face. Face choices and face changes remain manual.
- [ ] Face-Down State retains the underlying object where applicable, source/mode, shown characteristics, turn-up procedure, and inspection permissions; participant views redact unauthorized identity.
- [ ] Match setup can record Opening-Hand Actions taken after mulligans and before the first turn, including the action and its resulting state, without checking eligibility.
- [ ] Typed Rules State can retain applicable statuses and designations with distinct value shapes; counters remain separate.
- [ ] A Battle Game Object records its Protector as a Match Player distinct from its Owner and Controller; a Manual Match does not enforce Protector eligibility.
- [ ] A melded Game Object can combine two Card Instances while each instance retains its identity and Owner.
- [ ] Copiable Values are captured in immutable records with copy exceptions. Copied Game Objects do not depend on later state of the source; identical captures may share a record, while different exceptions use distinct records.
- [ ] Attachments and Object Links are separate relationships. An Object Link may connect a source Game Object and relevant Card Ability to one or more related Game Objects.
- [ ] Match data stores these records without evaluating Card Abilities or Effects, changing copied characteristics, or enforcing face-down procedures.
- [ ] Behavior checks cover Casting Record retention, chosen names absent from the Catalog, X bindings, redacted face-down views, copied-value independence, Object Links distinct from Attachments, and manually recorded Opening-Hand Actions.
