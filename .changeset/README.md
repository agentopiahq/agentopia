# Changesets

Every change that users of the published CLI should hear about gets a changeset:

```sh
yarn changeset
```

Pick `@agentopia/cli` (the `agentopia-town` alias always moves with it), choose the bump,
and write one or two sentences for the changelog. Commit the generated file with the
change. Internal packages are private and never versioned.

On every push to `main`, the Release workflow (`.github/workflows/release.yaml`) gathers
pending changesets into a "Version packages" pull request that bumps both packages and
writes `apps/cli/CHANGELOG.md`. Merging that pull request publishes both packages to npm
and creates the GitHub releases.
