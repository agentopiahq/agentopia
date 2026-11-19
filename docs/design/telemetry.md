# Design: lightweight CLI telemetry

Status: proposed, not built. Target: the release after launch.

## Should this wait?

Yes. Launch without it. Nothing the CLI does today depends on it, and adding it changes
what the privacy policy promises ("The Software itself does not collect or transmit
personal information"), which deserves its own release and changelog entry. Until then,
npm's download counts (`api.npmjs.org/downloads/point/last-week/agentopiahq`) and GitHub
stars are the usage signal.

One piece is worth doing soon, before the rest: the [pricing pass-through](#pricing-pass-through)
puts models.dev behind agentopia.town, so the provider can change without a CLI release and
its request count is a rough daily-active signal with no id at all.

Shipped later, auto-update (in progress) carries telemetry to existing installs without
them running a new install step. That is why the first-run notice below is keyed to "this
home has never seen the notice", not to a fresh install.

## Goals

1. How often agentopia is used: daily and weekly active installs.
2. Which commands are run, and how often.
3. Which errors people hit, with enough to fix them.

Non-goals: anything about what an agent did. No prompts, tool calls, file names, paths,
session ids, bus contents, transcript or usage figures, hostnames, usernames, or emails,
ever. The hook emitter (`plugins/*/hooks/emit.mjs`) sends nothing: it stays zero-import and
offline. The viewer sends nothing.

## What is sent

Three events, each a small fixed-shape JSON object. Anything not in the schema is dropped,
on the CLI and again at the endpoint.

Common to every event:

| Field        | Example          | Notes                                                                |
| ------------ | ---------------- | -------------------------------------------------------------------- |
| `install`    | random UUID      | See [Install id](#anonymous-install-id)                              |
| `version`    | `0.3.0`          | CLI version                                                          |
| `os`, `arch` | `darwin`,`arm64` | `process.platform`, `process.arch`                                   |
| `node`       | `22`             | Major version only                                                   |
| `via`        | `npx`            | `npx`, `global`, `store` (auto-updated copy); a checkout never sends |
| `harnesses`  | `["claude"]`     | Harness ids with the plugin installed                                |

Events:

- **`command`**, once per CLI run, at exit: `name` (from a fixed list: `start`, `status`,
  `stop`, `watch`, `install`, `uninstall`, `doctor`, `help`, `version`, `update`, a harness
  id for `agentopia claude`, or `unknown`; never the typed text), `exit` (code), and
  `ms` (bucketed: `<1s`, `<10s`, `<1m`, `<1h`, `1h+`). Flags are not sent.
- **`office_day`**, once per local day from the office server, if it ran that day. Most use
  is the background office plus hooks, with no CLI command at all, so command counts alone
  would undercount badly. Carries bucketed counts only: `sessions` (`0`, `1`, `2-5`, `6-20`,
  `20+`), `peak_desks` (`1`, `2-4`, `5-8`), `viewer_opened` (boolean).
- **`error`**, for an uncaught exception or a known failure: `kind` (our own stable code,
  such as `port_in_use`, `viewer_missing`, `plugin_missing`, `uncaught`), `code` (Node's
  `err.code`, such as `ENOENT`), `name` (`err.name`) and a scrubbed `stack`. See
  [Errors](#error-scrubbing).

## Opt-out

On by default with a disclosure, as Next.js, Turborepo and Astro do. Turned off by any of:

- `AGENTOPIA_TELEMETRY=0` (or `false`, `off`, `no`), parsed exactly like
  `AGENTOPIA_AUTO_UPDATE`. Share the parser: both become `envOff(name)` in one module.
- `DO_NOT_TRACK=1`, the cross-tool convention.
- `agentopia telemetry off`, which writes `"telemetry": false` to `~/.agentopia/prefs.json`.
  `agentopia telemetry on` and `agentopia telemetry status` (what is on, and why) to match.
- CI: the same check `autoUpdateOff` already makes (`CI` set and not `0`/`false`).
- A checkout (`isCheckout`), so development and tests never send.

An environment "off" always beats the config. `prefs.json` writes must merge keys:
`setDeclined` today rewrites the whole file with only `declinedInstall`, and would wipe
`telemetry`.

`AGENTOPIA_TELEMETRY_DEBUG=1` prints each event to stderr instead of sending it, so anyone
can see exactly what would leave their machine.

## First-run disclosure

The first CLI run in a home that has not shown the notice prints, to stderr:

```
agentopia collects anonymous usage data: which commands run, how often, and the
errors they hit. Never paths, prompts or anything from your sessions.
Turn it off with `agentopia telemetry off` or AGENTOPIA_TELEMETRY=0.
Details: https://www.agentopia.town/privacy#telemetry
```

It records `noticeShownAt` in `~/.agentopia/telemetry.json`, and **that run sends
nothing**: the first event goes out on a later run, after the person has had the chance to
opt out. The detached office server never prints the notice and sends nothing until it has
been shown by a foreground command (`start` shows it before it detaches).

## Anonymous install id

A `crypto.randomUUID()` made on first use and kept in `~/.agentopia/telemetry.json`. Not
derived from the machine, user, MAC address or anything else, so it cannot be linked to a
person. One per agentopia home (so `AGENTOPIA_HOME` gives a separate id). `agentopia
telemetry off` deletes it; turning telemetry back on makes a new one.

## Sending

The rule: **a command never waits on the network.**

- Each event is appended to `~/.agentopia/telemetry/queue.jsonl` (synchronous, a few
  microseconds), capped at 500 lines, oldest dropped. The queue is also something a person
  can read.
- The office server flushes the queue every hour while it runs, in one batched `POST`.
- With no office running, a command flushes in the background when the oldest line is over
  a day old: an unref'd `fetch` with a 2 s timeout, so the process can exit before it
  finishes. A lost batch is fine.
- After an auto-update handoff, only the copy that actually runs the command records it, so
  nothing is counted twice.

## Backend

| Option                            | Usage counts                       | Errors                                         | Cost to CLI                                                         | Notes                                                             |
| --------------------------------- | ---------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------- |
| PostHog (hosted)                  | Strong: trends, uniques, retention | Yes (error tracking, `$exception` events)      | None: a plain `fetch` to its capture API, no SDK                    | Generous free tier; IP discard and GeoIP off are project settings |
| Sentry                            | Weak                               | Best in class: grouping, source maps, releases | `@sentry/node` is large and slows startup; raw envelopes are fiddly | Connector exists; strong for errors only                          |
| Self-hosted (Vercel route + Neon) | Whatever SQL gives you             | Roll your own grouping                         | None                                                                | Full control, but dashboards are on you                           |
| Vercel Web Analytics              | Page views only                    | No                                             | —                                                                   | Not built for server events                                       |

### Recommendation

**CLI → a first-party endpoint on agentopia.town → PostHog.**

- `POST https://www.agentopia.town/api/telemetry`: a route handler in `apps/web` (already
  on Vercel). It checks the body against the same schema the CLI uses (shared from
  `@agentopia/core`, which stays pure: types and a validator only), caps the body at 64 KB,
  drops the IP, adds only the coarse country from Vercel's `x-vercel-ip-country` header, and
  forwards the batch to PostHog's batch capture API with person profiles off.
- Why a relay rather than PostHog directly: the backend can change (or fan errors out to
  Sentry) without a CLI release, the endpoint enforces the schema even for old CLIs, the
  privacy policy names one first-party destination, and a first-party domain is less
  likely to be blocked than an analytics one.
- PostHog covers both usage and errors in one place. Upload each release's source map to it
  (the CLI is one esbuild bundle, so frames are `index.mjs:line:col`) so stacks resolve.
  Move errors to Sentry only if PostHog's error grouping proves too thin; the relay makes
  that a server-side change.

## Error scrubbing

Error messages are where private data hides (`ENOENT: no such file or directory, open
'/Users/<name>/work/secret-project/...'`), so the message is **never sent**. What is sent:

- `kind`, `code` and `name`, as above.
- The stack, frame by frame: keep the function name and `file:line:col` only for frames in
  agentopia's own bundle, with the file reduced to its basename; every other frame becomes
  `<external>`. No paths survive.
- A final redaction pass over every string field anyway: home directory, any absolute path,
  emails, anything shaped like a token (long base64/hex runs), replaced with `<redacted>`.

`kind` is what makes errors useful without messages: the known failures (`port_in_use`,
`viewer_missing`, a failed install step) get named codes where they are already handled.

## Pricing pass-through

The office server fetches `https://models.dev/api.json` (`apps/cli/src/usage/prices.ts`) at
most once a day, when a viewer asks for `/api/usage`, and keeps the providers it needs in
`~/.agentopia/cache/models.dev.json`. Put agentopia.town in front of it:

- `GET https://www.agentopia.town/api/prices`: a route handler in `apps/web` that fetches
  models.dev, cuts the file down to the providers the harnesses use (models.dev's file is
  every provider; the CLI already keeps only a few), and returns them in the same shape.
- Cache in the function (Next's data cache, for example `next: { revalidate: 86400 }`), not at the CDN:
  models.dev is then hit about once a day in total, while every CLI request still invokes the
  function, so it can be counted. A CDN cache would hide most requests from the logs.
- The CLI asks agentopia.town first and falls back to models.dev directly, then to the
  cached copy, then to the bundled tables, as now. Never throws, never holds up usage. A
  `User-Agent: agentopia/<version> (<os>; <arch>)` header gives the version spread.
- `AGENTOPIA_PRICES_URL` overrides the endpoint (tests, mirrors), like `AGENTOPIA_REGISTRY`.
- The provider can then change (or several be merged) in `apps/web` without a CLI release.

As a usage signal it is passive and rough: one request per running office per day, only
when the office is opened in a browser, with no id, so it counts active offices per day and
their versions, not people, commands or retention. It needs no opt-out of its own (it is a
functional request the CLI makes anyway, and turning telemetry off does not stop it), but
it must be disclosed: the request carries the IP, which Vercel's request logs keep for a
short time. The handler stores nothing and never logs the IP itself. With telemetry built,
it remains the floor signal from people who opted out.

Keep the npm update check going straight to the registry: it fetches code, and integrity is
easier to reason about with nobody in the middle.

## Privacy policy and docs

Before telemetry ships (and with the pricing pass-through, for the outbound-request part):

- Rewrite "The software runs locally" in `apps/web/src/legal/privacy.md`: session
  recordings still never leave the machine, and a new "Anonymous usage data" section (with a
  `#telemetry` anchor for the notice) lists exactly the fields above, the random install id,
  the processors (Vercel, PostHog), retention (12 months), and every opt-out.
- List the CLI's other outbound requests: npm (update checks), and agentopia.town/models.dev
  (prices), each with the IP they carry.
- Replace "The Software itself does not collect or transmit personal information" with what
  is now true. Bump "Last Updated".
- A random install id with the IP dropped is pseudonymous at most; treat it as personal data
  under GDPR anyway, on legitimate interest, with the opt-out as the objection mechanism.
  Have it read over before shipping; this is not legal advice.
- `apps/cli/README.md` gets a "Telemetry" section; the release gets a `minor` changeset that
  says telemetry is new and how to turn it off.

## Code layout

- `packages/core/src/telemetry/`: the event schema, its validator and the scrubber. Pure,
  so both the CLI and `apps/web` use them.
- `apps/cli/src/telemetry/`: `resolve.ts` (on or off, and why), `notice.ts`, `queue.ts`,
  `flush.ts`, and the `agentopia telemetry` command. `main()` records the `command` event;
  the server records `office_day` and flushes.
- `apps/web/src/app/api/telemetry/route.ts` and `apps/web/src/app/api/prices/route.ts`.

Tests: `it.each` tables over the opt-out resolution (each env var, prefs, CI, checkout),
the scrubber (paths, home dir, emails, tokens, external frames), the schema dropping
unknown fields and unknown command names, the notice showing once and suppressing that
run's send, the queue cap, and the prices fallback order.

## Rollout

1. Pricing pass-through and the policy's outbound-requests paragraph. Small, and useful on
   its own.
2. Telemetry behind the notice, `AGENTOPIA_TELEMETRY_DEBUG`, the relay and PostHog, with
   the policy rewrite, in one `minor` release.
3. Watch a week of data; add named `kind`s for the errors that show up as `uncaught`.
