# Security Policy

## Supported Versions

Security fixes go into the **latest released version** of `agentopiahq` (and
its alias `@agentopia/cli`). If you are running an older version, please
upgrade before reporting an issue.

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Email [contact@agentopia.town](mailto:contact@agentopia.town) with:

- A description of the issue and its impact
- Steps to reproduce (proof-of-concept code is helpful)
- The version or commit you tested against
- Your name or handle if you'd like to be credited in the disclosure

Agentopia's office server binds to `127.0.0.1` and reads only local files, so
reports about it reaching beyond the local machine, about the hook emitter, or
about what the server serves from `~/.agentopia` are especially welcome.

Please give us a reasonable amount of time to investigate and release a fix
before any public disclosure.
