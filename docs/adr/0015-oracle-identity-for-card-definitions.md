---
status: accepted
---

# Join card definitions across printings by Oracle identity

For imported cards with a Scryfall Oracle ID, use that ID to join Card Printings to one Card Definition and to associate separately authored rules data with it. Keep the card's canonical name as its human-readable Decklist label and the printing ID as the identity of a specific edition. This avoids joining distinct cards solely because they share a name while allowing all printings of Crypt Ghast, for example, to share one rules interpretation. Special layouts without a card-level Oracle ID require an explicit identity mapping.
