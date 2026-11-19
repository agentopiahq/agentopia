---
'agentopiahq': minor
---

agentopia now updates itself. The office checks npm every few hours, downloads a new release into `~/.agentopia/versions` (checked against npm's integrity hash), and switches over once no session is in the middle of a turn, going back if the new version won't start. Open tabs offer a reload, with a link to what changed. `agentopia update` (or `upgrade`) updates straight away, `--check` only says whether there is a new version, and `AGENTOPIA_AUTO_UPDATE=0` turns the automatic download off.
