---
status: accepted
---

# Use TypeScript across a React and NestJS application

Use TypeScript with React/Vite for the browser, NestJS for the modular backend, native WebSockets for Match updates, and PostgreSQL for Room and active Match snapshots, deployed together through Docker Compose. Shared contracts and NestJS modules suit the growing rules code while keeping one application deployment; the trade-off is framework overhead and explicit reconnect/resynchronization behavior instead of transport replay. [ADR-0014](0014-versioned-card-catalog-records.md) keeps the released Card Catalog in Git-tracked JSON rather than PostgreSQL.
