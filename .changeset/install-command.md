---
'agentopiahq': minor
'@agentopia/cli': minor
---

Add `agentopia install` and `agentopia uninstall`. `install` installs the agentopia plugin into Claude Code (from a local marketplace under `~/.agentopia`), whose hooks then record every session, plain `claude` and the desktop app's included, not only ones started with `agentopia claude`. It keeps itself current when the CLI is upgraded. `agentopia doctor` now says when plain sessions aren't being recorded, and `agentopia watch` points to `install` when the plugin is missing.
