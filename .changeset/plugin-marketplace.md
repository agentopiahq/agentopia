---
'agentopiahq': minor
---

The agentopia plugin can now be installed from Claude Code itself: `/plugin install agentopia --marketplace agentopiahq/agentopia`. `agentopia start`, `install` and the `agentopia claude` wrapper treat that install as the plugin being in, so they no longer add a second copy, and `agentopia doctor` warns when both are installed.
