# Domain Docs

Guidance for using the repository's domain documentation.

## Domain documentation

`CONTEXT.md` defines the project's canonical domain terminology and model.

Consult it when the task involves domain concepts, gameplay behavior,
cards, matches, rules, or game state.

Architectural decisions live in `docs/adr/`.
Consult relevant ADRs when the task touches an architectural decision.

If these files don't exist, proceed silently. Do not suggest creating
them unless durable domain knowledge or an architectural decision
actually needs to be recorded.

## Structure

/
├── CONTEXT.md
├── docs/adr/
└── src/

## Use the glossary's vocabulary

When naming domain concepts in code, tests, issues, or documentation,
use the terminology defined in `CONTEXT.md`.

Do not introduce synonyms for concepts already defined there.

If a necessary concept is missing, determine whether it represents
a genuine domain-model gap before introducing new terminology.

## Flag ADR conflicts

If a proposed change conflicts with an existing ADR, surface the
conflict explicitly rather than silently overriding the decision.