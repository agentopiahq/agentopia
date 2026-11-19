// The changelog generator: @changesets/changelog-github, but it never thanks the
// people listed in `noThanks` (the repository's own maintainers), only outside
// contributors. Configured in config.json as
//   ["./changelog.mjs", { "repo": "owner/name", "noThanks": ["login"] }]
// The other options pass through to changelog-github untouched. The version
// headings' dates are not written here (Changesets writes the heading itself);
// scripts/date-changelogs.mjs adds them after `changeset version`.
import github from '@changesets/changelog-github';

const THANKS = / Thanks ((?:\[@[^\]]+\]\([^)]+\)(?:, )?)+)!/;
const USER = /\[@([^\]]+)\]\([^)]+\)/g;

/** Drops every login in `noThanks` from a release line's "Thanks …!", and the
 * whole clause when nobody is left. Logins compare case-insensitively. */
export function withoutThanks(line, noThanks) {
  const skip = new Set(noThanks.map((login) => login.toLowerCase()));
  return line.replace(THANKS, (_, users) => {
    const kept = [...users.matchAll(USER)]
      .filter(([, login]) => !skip.has(login.toLowerCase()))
      .map(([link]) => link);
    return kept.length ? ` Thanks ${kept.join(', ')}!` : '';
  });
}

function split(options) {
  const { noThanks = [], ...rest } = options ?? {};
  return { noThanks, rest };
}

export default {
  getDependencyReleaseLine: (changesets, dependenciesUpdated, options) =>
    github.getDependencyReleaseLine(changesets, dependenciesUpdated, split(options).rest),
  getReleaseLine: async (changeset, type, options) => {
    const { noThanks, rest } = split(options);
    return withoutThanks(await github.getReleaseLine(changeset, type, rest), noThanks);
  },
};
