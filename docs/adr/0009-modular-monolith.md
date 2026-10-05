---
status: accepted
---

# Start as a modular monolith

The first deployment uses one backend and one database, organized into modules with explicit interfaces and clear ownership of their data. Room owns participants, invitations, and saved decklists; Match owns match players, card instances, zones, and actions; Card Catalog owns card definitions, printings, and imports. Rules behavior starts inside Match until it has a substantive independent interface. This keeps local development and deployment simple while preserving seams that can support separate processes or database scaling later if actual usage requires them.
