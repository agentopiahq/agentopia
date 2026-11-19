/**
 * Features that are built but switched off for now.
 *
 * `SESSION_VIEWS`: one session's own view, with the play bar (`?session=<id>`,
 * `?replay`). Off, the floor offers no way in: a desk's name opens only its
 * context breakdown, and the breakdown has no "watch replay". The view itself
 * still works for anyone who opens its URL (the CLI's hidden
 * `agentopia watch <session>`, `yarn replay`). Turn it on to bring the links back.
 */
export const SESSION_VIEWS = false;
