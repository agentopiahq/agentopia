---
'agentopiahq': minor
'@agentopia/cli': minor
---

`agentopia start` is the one command to get going. It offers to install the agentopia plugin into Claude Code if it isn't there yet (`--yes` installs without asking), then serves the office in the background, so it stays open after you close the terminal. `agentopia status` says whether it is running and where, and `agentopia stop` stops it. There is one office at a time: `agentopia watch` and `agentopia claude` open the one already running instead of starting another, and a newer agentopia replaces an older one's office. The office also keeps serving the viewer it started with when agentopia is upgraded underneath it.
