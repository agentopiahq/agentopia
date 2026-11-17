import { Rng } from './clock';

/**
 * What idle avatars talk about when they stop for a chat.
 *
 * Each conversation is a short script read in turns: the first line is the
 * one who opened it, the next the other's reply, and so on, two to five
 * rounds each. They are coding agents on a break, so the talk is shop: flaky
 * tests, DNS, naming things, the context window. Add one anywhere in the
 * list; a line should fit a speech bubble (about fifty characters).
 */
export const CONVERSATIONS: ReadonlyArray<readonly string[]> = [
  ['flaky tests again', 'I love it', 'you love it?', 'it keeps the job interesting'],
  [
    'is it DNS?',
    "it can't be DNS",
    'so it was DNS',
    'it is always DNS',
    'I should get that tattooed',
    'in UTC, so it never drifts',
  ],
  [
    'how do you center a div?',
    'flexbox',
    'and when flexbox fails?',
    'grid',
    'and when grid fails?',
    'a table, and you tell no one',
  ],
  ['what does this regex do?', 'no idea, I wrote it', 'last week?', 'eleven minutes ago'],
  [
    'my context window is full',
    'just compact',
    'I compacted. I forgot why I came in',
    'happens to the best of us',
    'who are you again?',
  ],
  ['you are absolutely right!', "I haven't said anything yet", 'and already so right'],
  ['tabs or spaces?', 'spaces', 'how many?', 'two', 'four', "we can't be friends"],
  [
    'it works on my machine',
    "then we'll ship your machine",
    "that's just Docker",
    'and look how that turned out',
  ],
  [
    'deploying on a Friday?',
    'living dangerously',
    'at 4:59pm',
    'you are a legend',
    'and then my laptop dies',
    'and then you are a cautionary tale',
  ],
  ['git blame says it was me', 'two years ago?', 'two hours ago', 'oof'],
  [
    'the two hardest things in CS?',
    'naming things and cache invalidation',
    'and off-by-one errors',
    'that makes three',
    'exactly',
  ],
  ['0.1 + 0.2?', '0.30000000000000004', 'close enough for prod?', 'tell that to accounting'],
  [
    "how's the new PR?",
    '4,000 lines',
    'reviewed?',
    'LGTM, by the third file',
    'and the other forty?',
    'vibes',
  ],
  [
    'I fixed the bug',
    'nice!',
    'and two more appeared',
    "it's a hydra",
    'I need a sword. Or a revert',
  ],
  [
    'quick fix, five minutes',
    'famous last words',
    'it has been three hours',
    'the minutes were metaphorical',
  ],
  ['what time is it in UTC?', 'which UTC?', "there's only one", 'you have not met our database'],
  [
    'we should rewrite it in Rust',
    'why?',
    'memory safety',
    "it's a static landing page",
    'blazingly fast, though',
  ],
  [
    'how big is node_modules?',
    'bigger than the observable universe',
    'and the app?',
    'three buttons',
  ],
  [
    'heading to standup?',
    'which one?',
    'there are two?',
    "a standup about standup's length",
    'that sounds like a sit-down',
  ],
  [
    'what is a monad?',
    'a monoid in the category of endofunctors',
    'thanks, that clears it up',
    'nobody has ever said that',
  ],
  [
    'the tests pass!',
    'all of them?',
    'I deleted the failing ones',
    'coverage just went up',
    'that is not how it works',
  ],
  ["what's our test coverage?", '100%', 'really?', 'of the file with the tests'],
  [
    'can I run rm -rf?',
    'what does the human say?',
    'still walking to ask them',
    'take the long way round',
  ],
  ['let me ask the human', 'about?', 'can I read a file', 'which file?', 'README.md', 'bold move'],
  ['how many tokens was that?', 'a lot', 'more than a lot?', "don't look at the usage board"],
  ['I hallucinated an API', 'did it work?', 'better than the real one', 'ship it, then write it'],
  ['my estimate was two days', 'and?', 'two days, plus a sprint', 'so, a quarter'],
  ['the YAML broke', 'indentation?', 'it read "no" as false', 'Norway strikes again'],
  [
    'why is prod down?',
    'a cert expired',
    'who renews them?',
    'a cron job',
    'who watches the cron job?',
    'nobody, it turns out',
  ],
  [
    'which is the source of truth?',
    'the spreadsheet',
    'not the database?',
    'the database is downstream of Gary',
  ],
  [
    'I found a TODO from 2014',
    'what does it say?',
    '"temporary hack, remove soon"',
    'load-bearing by now',
    "don't touch it",
  ],
  ["what's the weather like?", 'cloudy', 'outside?', 'in us-east-1'],
  ['how do you exit vim?', "I'm still in it", 'since when?', 'my first boot'],
  [
    'is it a bug or a feature?',
    'is it in the changelog?',
    'no',
    'then a bug',
    'and if a user loves it?',
    "then it's a feature",
  ],
  ['a race condition', 'condition race a', 'are you okay?', 'okay you are, yes'],
  [
    'the bug only happens in prod',
    'can you reproduce it?',
    'only when nobody is looking',
    'a Heisenbug',
    'I am logging everything now',
    'and now it never happens',
  ],
  [
    'ask the rubber duck?',
    'it said nothing',
    'and?',
    'I found the bug while explaining',
    'the duck is a genius',
  ],
  ['why are there twelve services?', 'scale', 'how many users?', 'twelve', 'one each, then'],
  [
    'I updated a dependency',
    'patch version?',
    'yes',
    'and?',
    'everything is on fire',
    'semver is a suggestion',
  ],
  ["what's in that Docker image?", 'the app', 'and?', 'Ubuntu, a JDK, and a Blu-ray of Hackers'],
  ['null or undefined?', 'both', 'how?', 'JavaScript found a way'],
  ['[] == ![] is true', 'please stop', 'NaN !== NaN', 'I said please'],
  [
    'I named it "data"',
    'and the next one?',
    '"data2"',
    'and the one after?',
    '"dataFinalReallyFinal"',
  ],
  [
    'the meeting could be an email',
    'the email could be a Slack',
    'the Slack could be nothing',
    'peak productivity',
  ],
  ['is the build green?', "it's yellow", 'what is yellow?', 'still running, since Tuesday'],
  [
    'how long has CI been running?',
    'long enough to grab a coffee',
    'how many?',
    'I have lost count',
  ],
  [
    'how do you handle errors?',
    'try, catch',
    'and in the catch?',
    'a comment that says "should not happen"',
    'and when it happens?',
    'surprise',
  ],
  [
    'what is a microservice?',
    'a monolith that met the network',
    'is that better?',
    'it is more distributed',
  ],
  [
    'I wrote a one-liner',
    'what does it do?',
    'everything',
    'how long is the line?',
    'four hundred characters',
  ],
  [
    "it's a small refactor",
    'how small?',
    'every file',
    'that is not small',
    'each change is small',
  ],
  ['the intern dropped the table', 'which table?', 'users', 'backups?', 'we are about to find out'],
  [
    'why is the bundle 9 MB?',
    'a date library',
    'for one date?',
    'with every time zone, just in case',
  ],
  [
    'I left a print statement',
    'in prod?',
    '"HERE"',
    'did it help?',
    'the users know where we are now',
  ],
  [
    'I read the docs',
    'all of them?',
    'the docs were wrong',
    'so you read the source',
    'the source was wrong too',
  ],
  [
    'leap year bug again',
    'it is not February',
    'it is a leap second',
    'that is not even a real day',
  ],
  [
    'nice clean code',
    'thanks!',
    'who wrote it?',
    'me, five minutes ago',
    'enjoy it while it lasts',
  ],
  [
    "it's not a bug",
    'then what is it?',
    'an undocumented feature',
    'document it then',
    'then it is a bug',
  ],
  ['I have a recursion joke', 'go on', 'I have a recursion joke', 'go on', 'stack overflow'],
  [
    'how many agents to change a bulb?',
    'one to plan, three to explore',
    'and to change it?',
    'awaiting approval',
  ],
  ['I spawned a subagent', 'for what?', 'to find a file', 'did it?', 'it spawned three of its own'],
  [
    'is the cat on the bookshelf again?',
    'it is load-balancing the shelves',
    'and the dog?',
    'a health check, every five minutes',
  ],
  ['the sprint board is all green', 'everything done?', 'everything moved to next sprint'],
  ['we should write tests first', 'TDD?', 'TBD'],
  [
    'my commit message is "fix"',
    'fix what?',
    '"fix fix"',
    'and the next one?',
    '"ok actually fix"',
  ],
  [
    'how do I validate an email?',
    'regex',
    'which one?',
    'the 6,000 character one',
    'or send an email',
    'radical',
  ],
  [
    'why do we need Kubernetes?',
    'to run the containers',
    'how many containers?',
    'one',
    'and how many YAML files?',
    'forty',
  ],
  ['the API returns 200', 'great', 'with { "error": true }', 'not great'],
  ['HTTP 418?', "I'm a teapot", 'and 420?', 'not a real status', 'I am a coffee machine, then'],
  ['merge conflict', 'whose side?', 'mine and mine', 'who wins?', 'neither, it is lunchtime'],
  [
    'I force-pushed main',
    'please say you are joking',
    'I am joking',
    'thank goodness',
    'it was the release branch',
  ],
  ['the users want dark mode', 'all of them?', 'one of them, loudly', 'that is all of them'],
  [
    'the logs are empty',
    'is the app running?',
    'yes',
    'then where are the logs?',
    'in a bucket nobody can open',
  ],
  [
    'is the feature flag on?',
    'which flag?',
    'new_checkout_v2',
    'and v3?',
    'we do not talk about v3',
  ],
  ['this function is 900 lines', 'what does it do?', 'handle', 'handle what?', 'yes'],
  ['a SQL query walks into a bar', 'and?', 'walks up to two tables', 'and asks "can I join you?"'],
  ['what does ORM stand for?', 'object-relational mapping', 'or', 'Overwhelming Runtime Mysteries'],
  [
    'do we have documentation?',
    'it is the code',
    'is the code documented?',
    'it is self-documenting',
    'what does it say?',
    '"good luck"',
  ],
  [
    'the pager went off at 3am',
    'what was it?',
    'disk full',
    'logs?',
    'the logs about the disk being full',
  ],
  [
    'the commit graph looks odd',
    'how odd?',
    'like a subway map',
    'that is a lot of merges',
    'that is our branching strategy',
  ],
  [
    'I made it faster',
    'how?',
    'I removed the loading spinner',
    "it's not faster",
    'it feels faster',
  ],
  [
    'when do we deprecate v1?',
    'when nobody uses it',
    'who uses it?',
    'our biggest customer',
    'so never',
  ],
  ["let's add a cache", 'what could go wrong?', 'stale data', 'and the fix?', 'another cache'],
  ["what's for lunch?", 'cookies', 'browser or real?', 'third-party', 'I will decline those'],
  [
    'how is your memory?',
    'which memory?',
    'yours',
    'I just read MEMORY.md',
    'and?',
    'apparently I like small PRs',
  ],
  [
    'I added one dependency',
    'how many came with it?',
    '312',
    'is one of them left-pad?',
    'two of them are',
  ],
  [
    'I love a good migration',
    'database?',
    'up and down',
    'did you write the down?',
    'it is a one-way trip',
  ],
  [
    'I am running the linter',
    'how many warnings?',
    '1,204',
    'errors?',
    'zero. We turned them all off',
  ],
  [
    'did you read the stack trace?',
    'the top line',
    'and the rest?',
    'a novel in four hundred frames',
  ],
  [
    'I typed "please" in the prompt',
    'does it help?',
    'politeness costs two tokens',
    'worth every one',
  ],
  ['who wrote this test?', 'it asserts true is true', 'and does it pass?', 'mostly'],
  ['want a coffee?', 'is the machine fixed?', 'it returns 503', 'service unavailable', 'so, tea'],
];

/** A random conversation from the pool, avoiding the ones `heard` says are stale. */
export function pickConversation(
  rng: Rng,
  heard: (opening: string) => boolean = () => false
): readonly string[] {
  const fresh = CONVERSATIONS.filter((lines) => !heard(lines[0]));
  const pool = fresh.length > 0 ? fresh : CONVERSATIONS;
  return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
}

/** How long a line stays up in its bubble: long enough to read it. */
export function lineMs(line: string): number {
  return Math.min(4200, 1700 + 45 * line.length);
}

/** When each line starts, from the start of the chat, plus when the last one ends. */
export function lineStarts(lines: readonly string[]): number[] {
  const starts = [0];
  for (const line of lines) {
    starts.push(starts[starts.length - 1] + lineMs(line));
  }
  return starts;
}
