# Interactive UI implementation review

Compared the implementation with starting commit `77784da68cd97279deae60fd2d251fa7c36778cb` and the agreed [spec](spec.md). Reviewed the staged/working-tree change before the requested final commit, with independent standards and spec reviewers.

## Standards

No hard documented-standard violations or actionable baseline code smells remain. Vocabulary follows CONTEXT.md, and ADR-0017 explicitly replaces free placement for this UI. Presentation helpers centralize type precedence, pile equivalence, printing selection, zone ordering, and engine-provided actions. No server rules or shared-model files changed.

The optional concern about immediate-only attachment rendering was addressed with recursive attachment rendering and ancestor protection.

## Spec

Two findings were reproduced through browser tests and corrected:

- Stack details lost source identification after sacrifice-cost sources departed. Details now use the authorized source snapshot for source name and text.
- Clicking unrelated cards did not collapse expanded piles. Outside clicks now retain only the clicked pile, while active assignments and menu interactions preserve the relevant expansion.

The reviewer rechecked both fixes and found no regression or outstanding spec findings. Private information and delegated Solo Practice choices remain governed by the existing participant view and engine procedures.

Further verification made cards and player targets visibly disabled while a command is awaiting acknowledgement, synchronized procedure-draft resets before interaction, and prevented stale menus from reappearing after a procedure ends. The spec reviewer rechecked the menu transition handling. Migrated combat checks explicitly await the declaration prompt; the restart check now awaits Keep Hand acknowledgement before capturing its comparison snapshot.

## Validation

Typechecking, the production build, focused browser checks, and the final full suite of **183 tests** pass. Timing-sensitive targeting and combat checks also passed three repeated runs each.

Final review findings: Standards **0**; Spec **0**.
