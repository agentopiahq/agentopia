import {
  AgentopiaEvent,
  LEAD_WORKER,
  OFFICE_IDLE_LIFE,
  Rng,
  ToolKind,
  ToolStatus,
} from '@agentopia/core';

/**
 * The hero's office is a little busier than a real one: two more residents
 * than the usual four, so a first look always finds someone up to something.
 */
export const HERO_IDLE_LIFE = {
  ...OFFICE_IDLE_LIFE,
  residents: OFFICE_IDLE_LIFE.residents + 2,
} as const;

/**
 * The mock sessions the marketing site's hero plays.
 *
 * Up to three agents work at once, each on a task drawn from `HERO_TASKS`:
 * a session opens, works through a turn or three (reading round the code, a
 * helper or two filing in, a walk over to the human for approval, edits, a
 * test run that sometimes fails first), then ends, and a while later another
 * task takes its place. Everything is drawn from an injected `Rng`, so a
 * seed replays the same office and a visit with a new seed sees a new one.
 *
 * It is endless and lazy: `HeroScript.due` writes each session a turn at a
 * time, a little ahead of the clock, on the script's own timeline.
 */

/** When the first event lands, so the script has an origin of its own. */
export const HERO_EPOCH = 1_000_000;
/** How many agents can be at work at once. */
export const HERO_SLOTS = 3;

/** One task an agent might be given, and what working on it touches. */
export interface HeroTask {
  /** The session's name, as its desk shows it. */
  name: string;
  /** What the human asks for. */
  prompt: string;
  read: readonly string[];
  search: readonly string[];
  edit: readonly string[];
  /** The command that checks the work. */
  test: string;
  /** Docs worth looking up on the way, if any. */
  fetch?: string;
  /** What the agent says when it is done. */
  done: string;
}

/** Real work, the sort a team hands its agents on a weekday. */
export const HERO_TASKS: readonly HeroTask[] = [
  {
    name: 'fix the flaky checkout test',
    prompt: 'the checkout e2e test is flaky again',
    read: ['tests/e2e/checkout.spec.ts', 'src/cart/useCart.ts'],
    search: ['waitForResponse', 'cart:updated'],
    edit: ['tests/e2e/checkout.spec.ts'],
    test: 'yarn playwright test checkout --repeat-each 20',
    done: 'it waits for the cart now: 20/20 green',
  },
  {
    name: 'add dark mode to settings',
    prompt: 'add a dark mode toggle to settings',
    read: ['src/settings/Settings.tsx', 'src/theme/tokens.css'],
    search: ['prefers-color-scheme', 'useTheme'],
    edit: ['src/theme/tokens.css', 'src/settings/ThemeToggle.tsx'],
    test: 'yarn test settings',
    done: 'dark mode is in, and it follows the OS',
  },
  {
    name: 'migrate auth to PKCE',
    prompt: 'move our OAuth flow over to PKCE',
    read: ['src/auth/oauth.ts', 'src/auth/callback.ts'],
    search: ['client_secret', 'code_verifier'],
    edit: ['src/auth/oauth.ts', 'src/auth/pkce.ts'],
    test: 'yarn test auth',
    fetch: 'datatracker.ietf.org/doc/html/rfc7636',
    done: 'login uses PKCE; no secret in the browser',
  },
  {
    name: 'upgrade to Next.js 16',
    prompt: "let's get onto Next.js 16",
    read: ['package.json', 'next.config.ts', 'app/layout.tsx'],
    search: ['getServerSideProps', 'next/legacy'],
    edit: ['package.json', 'next.config.ts', 'app/blog/page.tsx'],
    test: 'yarn build',
    fetch: 'nextjs.org/docs/app/guides/upgrading',
    done: 'on Next 16, and the build is green',
  },
  {
    name: 'paginate the orders API',
    prompt: '/api/orders times out for big accounts',
    read: ['src/api/orders.ts', 'src/db/orders.sql.ts'],
    search: ['SELECT * FROM orders', 'limit'],
    edit: ['src/api/orders.ts', 'src/db/orders.sql.ts'],
    test: 'yarn test api/orders',
    done: 'cursor pagination, 50 a page',
  },
  {
    name: 'speed up product search',
    prompt: 'search takes four seconds, why?',
    read: ['src/search/query.ts', 'db/schema.prisma'],
    search: ['ILIKE', 'searchProducts'],
    edit: ['db/migrations/0042_search_index.sql', 'src/search/query.ts'],
    test: 'yarn bench search',
    done: 'a trigram index: 4.1s down to 38ms',
  },
  {
    name: 'fix invoice time zones',
    prompt: 'invoices show the wrong date for Sydney',
    read: ['src/billing/invoice.ts', 'src/lib/dates.ts'],
    search: ['toLocaleDateString', 'new Date('],
    edit: ['src/billing/invoice.ts'],
    test: 'TZ=Australia/Sydney yarn test billing',
    done: "dates use the account's time zone now",
  },
  {
    name: 'rate-limit the login endpoint',
    prompt: 'someone is hammering /api/login',
    read: ['src/api/login.ts', 'src/middleware/index.ts'],
    search: ['rateLimit', 'x-forwarded-for'],
    edit: ['src/middleware/rateLimit.ts', 'src/api/login.ts'],
    test: 'yarn test middleware',
    done: '5 tries a minute per IP, then a 429',
  },
  {
    name: 'write the quickstart',
    prompt: 'the README needs a real quickstart',
    read: ['README.md', 'package.json', 'docs/install.md'],
    search: ['"scripts"', 'process.env'],
    edit: ['README.md'],
    test: 'yarn docs:check-links',
    done: 'quickstart is in, five steps to running',
  },
  {
    name: 'refactor the Stripe webhook',
    prompt: 'the Stripe webhook handler is a mess',
    read: ['src/payments/webhook.ts', 'src/payments/events.ts'],
    search: ['switch (event.type)', 'invoice.paid'],
    edit: ['src/payments/webhook.ts', 'src/payments/handlers.ts'],
    test: 'yarn test payments',
    fetch: 'docs.stripe.com/webhooks',
    done: 'one handler per event, all covered',
  },
  {
    name: 'add CSV export to reports',
    prompt: 'finance wants reports as CSV',
    read: ['src/reports/ReportTable.tsx', 'src/api/reports.ts'],
    search: ['exportPdf', 'Content-Disposition'],
    edit: ['src/api/reports.ts', 'src/reports/ExportButton.tsx'],
    test: 'yarn test reports',
    done: 'Export CSV is next to Export PDF',
  },
  {
    name: 'fix the websocket memory leak',
    prompt: 'the realtime server grows 1 GB a day',
    read: ['server/realtime.ts', 'server/rooms.ts'],
    search: ["on('close'", 'subscribers'],
    edit: ['server/rooms.ts'],
    test: 'yarn test:soak realtime',
    done: 'rooms unsubscribe on close; memory is flat',
  },
  {
    name: 'translate the app to German',
    prompt: 'we launch in Germany next month',
    read: ['src/i18n/en.json', 'src/i18n/index.ts'],
    search: ["t('", 'defaultMessage'],
    edit: ['src/i18n/de.json', 'src/i18n/index.ts'],
    test: 'yarn i18n:check',
    done: 'de.json is complete, 412 strings',
  },
  {
    name: 'retry failed S3 uploads',
    prompt: 'uploads fail now and then with a 503',
    read: ['src/storage/s3.ts'],
    search: ['PutObjectCommand', 'catch (err)'],
    edit: ['src/storage/s3.ts', 'src/lib/retry.ts'],
    test: 'yarn test storage',
    done: 'retries with backoff, three times',
  },
  {
    name: 'fix N+1 on the dashboard',
    prompt: 'the dashboard makes 300 queries',
    read: ['src/dashboard/loader.ts', 'src/db/projects.ts'],
    search: ['findMany', 'for (const project'],
    edit: ['src/dashboard/loader.ts'],
    test: 'yarn test dashboard',
    done: '300 queries down to 3',
  },
  {
    name: 'fix the Docker build',
    prompt: 'the Docker build broke on main',
    read: ['Dockerfile', '.dockerignore', 'package.json'],
    search: ['node:18', 'COPY . .'],
    edit: ['Dockerfile'],
    test: 'docker build -t app .',
    done: 'builds again, and the image is 60% smaller',
  },
  {
    name: 'set up error tracking',
    prompt: 'we have no idea when prod errors',
    read: ['src/main.tsx', 'src/server.ts'],
    search: ['console.error', 'ErrorBoundary'],
    edit: ['src/instrument.ts', 'src/main.tsx'],
    test: 'yarn build',
    fetch: 'docs.sentry.io/platforms/javascript',
    done: 'errors and traces report to Sentry',
  },
  {
    name: 'make the navbar accessible',
    prompt: "the navbar can't be used with a keyboard",
    read: ['src/components/Navbar.tsx'],
    search: ['onClick', 'aria-'],
    edit: ['src/components/Navbar.tsx', 'src/components/Menu.tsx'],
    test: 'yarn test:a11y',
    done: 'tab, arrows and escape all work',
  },
  {
    name: 'triage red CI on main',
    prompt: 'CI has been red since this morning',
    read: ['.github/workflows/ci.yml', 'jest.config.ts'],
    search: ['FAIL', 'toMatchSnapshot'],
    edit: ['src/components/__snapshots__/Card.test.tsx.snap'],
    test: 'yarn test --ci',
    done: 'a stale snapshot; main is green again',
  },
  {
    name: 'move cron jobs to a queue',
    prompt: 'the nightly jobs keep overlapping',
    read: ['jobs/cron.ts', 'jobs/sendDigests.ts'],
    search: ['setInterval', 'schedule('],
    edit: ['jobs/queue.ts', 'jobs/sendDigests.ts'],
    test: 'yarn test jobs',
    done: 'jobs run once each, through the queue',
  },
  {
    name: 'test the price calculator',
    prompt: 'the price calculator has no tests',
    read: ['src/pricing/calculate.ts'],
    search: ['discount', 'Math.round'],
    edit: ['src/pricing/calculate.test.ts'],
    test: 'yarn test pricing --coverage',
    done: '27 cases, and a rounding bug found',
  },
  {
    name: 'fix the pagination off-by-one',
    prompt: 'page 2 repeats the last row of page 1',
    read: ['src/components/Pager.tsx', 'src/api/list.ts'],
    search: ['offset', 'page - 1'],
    edit: ['src/api/list.ts'],
    test: 'yarn test list',
    done: 'offset was page * size + 1',
  },
  {
    name: 'debounce the search box',
    prompt: 'every keystroke fires a search request',
    read: ['src/search/SearchBox.tsx'],
    search: ['onChange', 'useDebounce'],
    edit: ['src/search/SearchBox.tsx', 'src/hooks/useDebounce.ts'],
    test: 'yarn test search',
    done: 'one request per pause, 250ms',
  },
  {
    name: 'rename Customer to Account',
    prompt: 'product renamed Customer to Account',
    read: ['src/models/customer.ts', 'db/schema.prisma'],
    search: ['Customer', 'customerId'],
    edit: ['src/models/account.ts', 'db/schema.prisma', 'src/api/accounts.ts'],
    test: 'yarn typecheck',
    done: '184 renames, types all check',
  },
  {
    name: 'add OpenTelemetry tracing',
    prompt: "we can't see where requests spend time",
    read: ['src/server.ts', 'src/db/client.ts'],
    search: ['express()', 'pg.Pool'],
    edit: ['src/tracing.ts', 'src/server.ts'],
    test: 'yarn test server',
    fetch: 'opentelemetry.io/docs/languages/js',
    done: 'traces for HTTP and every query',
  },
  {
    name: 'fix uploads on Safari',
    prompt: 'image upload is broken on Safari',
    read: ['src/upload/Dropzone.tsx', 'src/upload/resize.ts'],
    search: ['createImageBitmap', 'HEIC'],
    edit: ['src/upload/resize.ts'],
    test: 'yarn test upload',
    done: 'HEIC converts first; Safari works',
  },
  {
    name: 'prune unused dependencies',
    prompt: 'our install takes forever',
    read: ['package.json', 'yarn.lock'],
    search: ['moment', 'lodash'],
    edit: ['package.json', 'src/lib/dates.ts'],
    test: 'yarn build && yarn test',
    done: '14 packages gone, install is 40% faster',
  },
  {
    name: 'flag the new onboarding',
    prompt: 'put the new onboarding behind a flag',
    read: ['src/onboarding/Flow.tsx', 'src/flags.ts'],
    search: ['isEnabled(', 'new_onboarding'],
    edit: ['src/flags.ts', 'src/onboarding/Flow.tsx'],
    test: 'yarn test onboarding',
    done: 'new_onboarding is off by default',
  },
  {
    name: 'fix the password reset email',
    prompt: 'password reset emails never arrive',
    read: ['src/auth/reset.ts', 'src/mail/send.ts'],
    search: ['RESET_URL', 'sendMail'],
    edit: ['src/auth/reset.ts', '.env.example'],
    test: 'yarn test auth/reset',
    done: 'the link pointed at localhost in prod',
  },
  {
    name: 'cache the pricing page',
    prompt: 'the pricing page hits the DB every view',
    read: ['app/pricing/page.tsx', 'src/db/plans.ts'],
    search: ['fetchPlans', 'revalidate'],
    edit: ['app/pricing/page.tsx'],
    test: 'yarn build',
    done: 'cached for an hour, revalidated on change',
  },
];

/** A tool call to make: what kind, its detail, and whether this run of it fails. */
type Call = [ToolKind, string, boolean?];

/** A follow-up the human sends once the first turn is done. */
interface FollowUp {
  prompt: string;
  calls: (t: HeroTask) => Call[];
  done: string;
}

const FOLLOW_UPS: readonly FollowUp[] = [
  {
    prompt: 'looks good, open a PR',
    calls: (t) => [
      ['execute', 'git status'],
      ['execute', `git commit -m "${t.name}"`],
      ['execute', 'git push -u origin HEAD'],
      ['execute', 'gh pr create --draft'],
    ],
    done: 'draft PR is up',
  },
  {
    prompt: 'can you add a test for that?',
    calls: (t) => [
      ['read', t.edit[0]],
      ['edit', t.edit[0].replace(/(\.\w+)$/, '.test$1')],
      ['execute', t.test],
    ],
    done: 'test added, and it passes',
  },
  {
    prompt: 'lint is failing on CI',
    calls: (t) => [
      ['execute', 'yarn lint', true],
      ['edit', t.edit[t.edit.length - 1]],
      ['execute', 'yarn lint'],
    ],
    done: 'lint is clean',
  },
  {
    prompt: 'also update the changelog',
    calls: () => [
      ['read', 'CHANGELOG.md'],
      ['edit', 'CHANGELOG.md'],
    ],
    done: 'changelog updated',
  },
  {
    prompt: 'run the whole suite once more',
    calls: () => [['execute', 'yarn test']],
    done: 'all 1,284 tests pass',
  },
  {
    prompt: 'any edge cases we missed?',
    calls: (t) => [
      ['think', 'edge cases'],
      ['search', t.search[t.search.length - 1]],
      ['edit', t.edit[0]],
      ['execute', t.test],
    ],
    done: 'covered empty input and retries',
  },
];

const HELPER_TYPES = ['Explore', 'Explore', 'Plan', 'general-purpose'] as const;

/** One event of a session, at an offset into the chunk being written. */
interface Beat {
  at: number;
  event: Omit<AgentopiaEvent, 'ts' | 'session'>;
}

const between = (rng: Rng, lo: number, hi: number): number => Math.round(lo + (hi - lo) * rng());

function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))];
}

/** Writes one turn of a session, as beats at offsets from the turn's start. */
class TurnWriter {
  readonly beats: Beat[] = [];
  private count = 0;

  constructor(
    private readonly rng: Rng,
    private readonly id: string
  ) {}

  emit(at: number, event: Beat['event']): void {
    this.beats.push({ at, event });
  }

  /** A tool call from `at`, returning when it ends. */
  call(at: number, [kind, detail, fail]: Call, worker = LEAD_WORKER): number {
    const ms = kind === 'execute' ? between(this.rng, 2600, 4200) : between(this.rng, 1700, 3200);
    const id = `${this.id}-${worker}-${this.count++}`;
    const tool = (status: ToolStatus): NonNullable<AgentopiaEvent['tool']> => ({
      id,
      name: kind,
      kind,
      detail,
      status,
    });
    this.emit(at, { kind: 'tool.start', worker, tool: tool('in_progress') });
    this.emit(at + ms, { kind: 'tool.end', worker, tool: tool(fail ? 'failed' : 'completed') });
    return at + ms;
  }

  /** Calls one after another, a breath between each, returning when the last ends. */
  sequence(at: number, calls: readonly Call[], worker = LEAD_WORKER): number {
    let t = at;
    for (const c of calls) {
      t = this.call(t, c, worker) + between(this.rng, 250, 700);
    }
    return t;
  }

  /** The first one, two or (up to `most`) of a list, in order. */
  some<T>(items: readonly T[], most: number): T[] {
    return items.slice(0, Math.min(items.length, 1 + Math.floor(this.rng() * most)));
  }

  /** The first turn on a task: look round, maybe delegate and ask, change it, test it. */
  firstTurn(t: HeroTask, helpers: { next: number }): number {
    const rng = this.rng;
    this.emit(0, { kind: 'turn.user', worker: LEAD_WORKER, meta: { text: t.prompt } });
    const look: Call[] = [
      ...this.some(t.read, 2).map((p): Call => ['read', p]),
      ...this.some(t.search, 2).map((q): Call => ['search', q]),
    ];
    let at = this.sequence(900, rng() < 0.5 ? look : [...look].reverse());

    if (rng() < 0.55) {
      // Helpers file in to dig while the lead thinks it through.
      const count = rng() < 0.3 ? 2 : 1;
      let until = this.call(at + 600, ['think', 'plan the change']);
      for (let i = 0; i < count; i++) {
        const helper = `helper-${this.id}-${helpers.next++}`;
        const start = at + i * 700;
        this.emit(start, {
          kind: 'worker.start',
          worker: helper,
          workerType: pick(rng, HELPER_TYPES),
        });
        const digs: Call[] = [
          ['search', pick(rng, t.search)],
          ['read', pick(rng, t.read)],
          ...(rng() < 0.5 ? [['read', pick(rng, t.edit)] as Call] : []),
        ];
        const done = this.sequence(start + 800, digs, helper);
        this.emit(done + 300, { kind: 'worker.stop', worker: helper });
        until = Math.max(until, done + 300);
      }
      at = until + 700;
    } else if (rng() < 0.6) {
      at = this.call(at, ['think', 'plan the change']) + 500;
    }

    if (t.fetch && rng() < 0.6) {
      at = this.call(at, ['fetch', t.fetch]) + 500;
    }

    if (rng() < 0.4) {
      // Something it wants a yes for: the lead walks over and asks.
      this.emit(at, { kind: 'approval.request', worker: LEAD_WORKER });
      at += between(rng, 4500, 6000);
    }

    at = this.sequence(
      at,
      this.some(t.edit, 3).map((p): Call => ['edit', p])
    );
    if (rng() < 0.4) {
      // Red first, then a fix, then green.
      at = this.sequence(at, [
        ['execute', t.test, true],
        ['read', t.edit[0]],
        ['edit', t.edit[0]],
      ]);
    }
    at = this.call(at, ['execute', t.test]) + 600;
    this.emit(at, { kind: 'turn.stop', worker: LEAD_WORKER, meta: { text: t.done } });
    return at;
  }

  /** A follow-up turn on the same task. */
  followUp(t: HeroTask, f: FollowUp): number {
    this.emit(0, { kind: 'turn.user', worker: LEAD_WORKER, meta: { text: f.prompt } });
    let at = 900;
    if (this.rng() < 0.12) {
      // A long session files its context away first.
      this.emit(at, { kind: 'context.compact', worker: LEAD_WORKER });
      at += between(this.rng, 4000, 5500);
      this.emit(at, { kind: 'context.compacted', worker: LEAD_WORKER });
      at += 600;
    }
    at = this.sequence(at, f.calls(t)) + 300;
    this.emit(at, { kind: 'turn.stop', worker: LEAD_WORKER, meta: { text: f.done } });
    return at;
  }
}

interface SlotSession {
  id: string;
  bus: string;
  task: HeroTask;
  /** How many turns it will run, and how many it has. */
  turns: number;
  done: number;
}

/** One desk's worth of work: its session, if any, and how far it is written. */
interface Slot {
  /** Script time up to which this slot is written. */
  cursor: number;
  session: SlotSession | null;
}

/** An event and the bus it belongs on: what the director ingests. */
export interface HeroEvent {
  bus: string;
  event: AgentopiaEvent;
}

/** How far ahead of the clock sessions are written, ms. */
const LOOKAHEAD_MS = 60_000;

/** The endless, randomized demo: every event due by a time, from every agent. */
export class HeroScript {
  private readonly slots: Slot[];
  private pending: HeroEvent[] = [];
  private sessions = 0;
  private readonly helpers = { next: 0 };
  /** Tasks not yet given out this round, so none comes back until the rest have had a go. */
  private deck: HeroTask[] = [];

  constructor(
    private readonly rng: Rng,
    epoch = HERO_EPOCH
  ) {
    // The first agent is at it from the start; the others turn up in a while.
    this.slots = Array.from({ length: HERO_SLOTS }, (_, i) => ({
      cursor: i === 0 ? epoch : epoch + between(rng, 5000, 15_000) * i * i,
      session: null,
    }));
  }

  /** Every event due by `t`, oldest first, each once. */
  due(t: number): HeroEvent[] {
    let wrote = false;
    for (const slot of this.slots) {
      while (slot.cursor <= t + LOOKAHEAD_MS) {
        this.advance(slot);
        wrote = true;
      }
    }
    if (wrote) {
      // Stable: events at one instant keep the order they were written in.
      this.pending.sort((a, b) => a.event.ts - b.event.ts);
    }
    let n = 0;
    while (n < this.pending.length && this.pending[n].event.ts <= t) {
      n += 1;
    }
    return this.pending.splice(0, n);
  }

  /** The next task, never one already at a desk. */
  private draw(): HeroTask {
    const busy = new Set(this.slots.map((s) => s.session?.task));
    if (this.deck.every((x) => busy.has(x))) {
      this.deck = HERO_TASKS.filter((x) => !busy.has(x));
    }
    const free = this.deck.filter((x) => !busy.has(x));
    const chosen = pick(this.rng, free);
    this.deck = this.deck.filter((x) => x !== chosen);
    return chosen;
  }

  /** Write a slot's next chunk: a session opening with its first turn, a follow-up, or its end. */
  private advance(slot: Slot): void {
    const rng = this.rng;
    const session = slot.session;
    if (session === null) {
      const n = this.sessions++;
      const t = this.draw();
      // Mostly a turn or two; now and then a longer haul.
      const r = rng();
      const opened: SlotSession = {
        id: `s-hero-${n}`,
        bus: `hero-${n}`,
        task: t,
        turns: r < 0.45 ? 1 : r < 0.85 ? 2 : 3,
        done: 1,
      };
      slot.session = opened;
      const writer = new TurnWriter(rng, `${n}-0`);
      writer.emit(-1200, {
        kind: 'session.start',
        worker: LEAD_WORKER,
        meta: { sessionName: t.name },
      });
      const end = writer.firstTurn(t, this.helpers);
      this.write(opened, writer, slot.cursor);
      // A breather before what comes next: now and then long enough that the
      // lead gets up from the desk to do something else.
      slot.cursor +=
        end + (rng() < 0.3 ? between(rng, 22_000, 30_000) : between(rng, 4000, 12_000));
      return;
    }
    if (session.done < session.turns) {
      const writer = new TurnWriter(rng, `${numberOf(session)}-${session.done}`);
      const end = writer.followUp(session.task, pick(rng, FOLLOW_UPS));
      this.write(session, writer, slot.cursor);
      session.done += 1;
      slot.cursor += end + between(rng, 4000, 12_000);
      return;
    }
    // Done: the session ends, its lead stays on in the office, and the desk
    // sits empty a while before the next task. The first desk never for long.
    this.pending.push({
      bus: session.bus,
      event: { ts: slot.cursor, kind: 'session.end', session: session.id, worker: LEAD_WORKER },
    });
    slot.session = null;
    const first = slot === this.slots[0];
    slot.cursor += first ? between(rng, 3000, 9000) : between(rng, 8000, 45_000);
  }

  private write(session: SlotSession, writer: TurnWriter, start: number): void {
    for (const { at, event } of writer.beats) {
      this.pending.push({
        bus: session.bus,
        event: { ...event, ts: start + at, session: session.id },
      });
    }
  }
}

/** The session's number, from its bus. */
const numberOf = (session: SlotSession): string => session.bus.slice('hero-'.length);
