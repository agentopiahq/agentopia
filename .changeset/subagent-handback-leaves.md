---
'agentopiahq': patch
---

Helpers now leave the office when their subagent finishes, even when the agent never says goodbye. Some subagents (the web fetcher, for one) fire no stop hook, so their helper used to stay at the desk for the rest of the session; agentopia now takes the subagent handing its report back as the end of its work.
