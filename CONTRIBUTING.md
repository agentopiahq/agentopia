# Contributing to Agentopia

Thanks for your interest in contributing! For small fixes, feel free to open a
pull request directly. For anything larger, please open an issue first so we
can agree on the approach before you start work.

## Getting set up

Agentopia is a Turborepo monorepo on Yarn 4 workspaces and needs Node 20+.

```sh
yarn install
yarn --cwd apps/cli build # build the agentopia binary
yarn agentopia watch      # the office, showing every live session
```

Before you open a pull request, run:

```sh
yarn lint
yarn typecheck
yarn test
yarn format:write
```

Read [`ARCHITECTURE.md`](ARCHITECTURE.md) before changing how things fit
together: several decisions that look arbitrary (the zero-import hook emitter,
`plugins/` living outside the workspace, injected clocks and randomness) are
load-bearing. [`AGENTS.md`](AGENTS.md) has the repo map, the commands and the
testing conventions, and is written for people as much as for coding agents.

If your change is one users of the CLI should hear about, add a changeset with
`yarn changeset`.

## License and Contributor License Agreement

Agentopia is licensed under the [MIT License](LICENSE). By contributing, you
agree that your contributions will be licensed under the same terms.

Before your first pull request can be merged, you must sign our
[Contributor License Agreement](CLA.md). The CLA grants the maintainer the
rights needed to distribute and, if ever necessary, relicense the project. You
keep the copyright in your contributions.

**You sign as part of your first pull request, with no separate sign-up step.**
In that pull request:

1. Add your GitHub username (lowercase, as `- username`) to the end of the
   Contributors list in [`.github/contributors.md`](.github/contributors.md).
   That file's Description says that adding your username is agreement to the
   CLA, so the edit is itself the signature.
2. Open the pull request from your own GitHub account. The merged commit is
   your electronic signature.

The **CLA Check** then passes for that pull request and all your future ones.

## Code of Conduct

By taking part in this project you agree to abide by our
[Code of Conduct](CODE_OF_CONDUCT.md). Report violations to
[contact@agentopia.town](mailto:contact@agentopia.town).

## Reporting security issues

Please do not open a public issue for a security vulnerability. Email
[contact@agentopia.town](mailto:contact@agentopia.town) instead; see
[`SECURITY.md`](SECURITY.md) for details.

## Questions?

- [GitHub Issues](https://github.com/agentopiahq/agentopia/issues) for bug
  reports and feature requests.
- [contact@agentopia.town](mailto:contact@agentopia.town) for anything else.
- [agentopia.town](https://www.agentopia.town) to see the office in action.

---

This guide and the CLA process are adapted from the
[Elmo](https://github.com/elmohq/elmo) project (MIT License).
