# Changesets

Every change that users of the published CLI should hear about gets a changeset:

```sh
yarn changeset
```

Pick `agentopiahq`, choose the bump,
and write one or two sentences for the changelog. Commit the generated file with the
change. Internal packages are private and never versioned.

To release, run the Release workflow (`.github/workflows/release.yaml`) by hand: Actions >
Release > Run workflow, on `main`. It gathers the pending changesets into a "Version
packages" pull request that bumps `agentopiahq` and writes `apps/cli/CHANGELOG.md`, and
runs Check and Storybook on it. Run it again to fold in changesets merged since. Merging
that pull request publishes it to npm, pushes the `agentopiahq@x.y.z` tag and creates
the GitHub release, with no further step.
Ordinary pushes to `main` never open a release pull request, and a push that edits
`apps/cli/package.json` without bumping the version publishes nothing.

The changelog is written by `.changeset/changelog.mjs`, which is
`@changesets/changelog-github` except that it never thanks the logins in `noThanks`
(`config.json`; the maintainers), only outside contributors. `yarn version-packages`
then dates each new version's heading (`## 0.2.0 - 2026-11-18`) with
`scripts/changelogs.mjs`, in the Release workflow's `TZ` (Pacific), so the date is
the day the version pull request was last refreshed.
The Changesets action can only find an undated heading, so the workflow creates the GitHub
releases and writes the version pull request's description itself, with
`scripts/release-notes.mjs`.
