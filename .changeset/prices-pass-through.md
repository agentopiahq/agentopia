---
'agentopiahq': minor
---

The usage board now gets its model prices from agentopia.town, which passes models.dev's price list through, and goes to models.dev directly when agentopia.town can't be reached, then to the copy it kept and the prices built in, as before. The request names the CLI's version, OS and architecture, and nothing else. `AGENTOPIA_PRICES_URL` points it at another address.
