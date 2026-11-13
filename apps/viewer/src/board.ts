/**
 * What is on the sprint board: a title, a tag in the corner, sticky notes in
 * four columns, the burndown chart, and whatever has been drawn on it in
 * marker. Pure data and pure edits, so the office's drawing of the board and
 * the editor that opens over it read and write the same thing.
 */

export const COLUMN_HEADS = ['TO DO', 'DOING', 'REVIEW', 'DONE'] as const;

/** The sticky notes' colours, in the order new notes take them. */
export const NOTE_COLOURS = ['#f6d26b', '#f3a6b8', '#9fcbe8', '#b8d6a0'] as const;

export interface BoardNote {
  text: string;
  color: string;
}

export interface BoardContent {
  title: string;
  /** The aside in the top right corner, in red marker. */
  tag: string;
  /** One list of notes per column, top to bottom. */
  columns: BoardNote[][];
  /** Whether the burndown chart is still drawn in the review column's foot. */
  chart: boolean;
  /** The marker drawing, as a PNG data URL, or null for a clean board. */
  ink: string | null;
}

/** Freehand marker strokes are drawn on a canvas this many units across and high. */
export const INK_W = 980;
export const INK_H = 400;

const note = (text: string, i: number): BoardNote => ({
  text,
  color: NOTE_COLOURS[i % NOTE_COLOURS.length],
});

/** The board the office starts with: sprint 14, half done. */
export const DEFAULT_BOARD: BoardContent = {
  title: 'Sprint 14',
  tag: 'ship it!',
  columns: [
    ['Dark mode', 'Export to CSV', 'Faster search', 'Onboarding tour', 'Fix flaky test'].map(note),
    ['Billing page', 'Retry webhooks', 'Audit log'].map((t, i) => note(t, i + 1)),
    ['Rate limits', 'Docs refresh'].map((t, i) => note(t, i + 2)),
    ['Login bug', 'New logo', 'Status page', 'SSO'].map((t, i) => note(t, i + 3)),
  ],
  chart: true,
  ink: null,
};

/** How many notes the office's drawing of a column can show. */
export function shownNotes(board: BoardContent, column: number): number {
  const cap = column === 2 && board.chart ? 4 : 6;
  return Math.min(cap, board.columns[column]?.length ?? 0);
}

const clean = (text: unknown, max: number): string =>
  typeof text === 'string' ? text.slice(0, max) : '';

/** A board from anything — a stored copy that may be stale or damaged — never throwing. */
export function normalizeBoard(raw: unknown): BoardContent {
  if (!raw || typeof raw !== 'object') {
    return DEFAULT_BOARD;
  }
  const r = raw as Record<string, unknown>;
  const columns = COLUMN_HEADS.map((_, c) => {
    const col = Array.isArray(r.columns) ? r.columns[c] : undefined;
    if (!Array.isArray(col)) {
      return [];
    }
    return col
      .filter((n): n is Record<string, unknown> => Boolean(n) && typeof n === 'object')
      .slice(0, 40)
      .map((n, i) => ({
        text: clean(n.text, 80),
        color:
          typeof n.color === 'string' && /^#[0-9a-f]{6}$/i.test(n.color)
            ? n.color
            : NOTE_COLOURS[i % NOTE_COLOURS.length],
      }));
  });
  return {
    title: clean(r.title, 40),
    tag: clean(r.tag, 24),
    columns,
    chart: r.chart !== false,
    ink: typeof r.ink === 'string' && r.ink.startsWith('data:image/png') ? r.ink : null,
  };
}

const withColumns = (board: BoardContent, columns: BoardNote[][]): BoardContent => ({
  ...board,
  columns,
});

/** A new note at the foot of a column, in the next colour. */
export function addNote(board: BoardContent, column: number, text = ''): BoardContent {
  const count = board.columns.reduce((sum, col) => sum + col.length, 0);
  return withColumns(
    board,
    board.columns.map((col, c) => (c === column ? [...col, note(text, count)] : col))
  );
}

export function removeNote(board: BoardContent, column: number, index: number): BoardContent {
  return withColumns(
    board,
    board.columns.map((col, c) => (c === column ? col.filter((_, i) => i !== index) : col))
  );
}

export function editNote(
  board: BoardContent,
  column: number,
  index: number,
  text: string
): BoardContent {
  return withColumns(
    board,
    board.columns.map((col, c) =>
      c === column ? col.map((n, i) => (i === index ? { ...n, text: text.slice(0, 80) } : n)) : col
    )
  );
}

/** Move a note to another column (or within one), at an index there; past the end appends. */
export function moveNote(
  board: BoardContent,
  from: { column: number; index: number },
  to: { column: number; index: number }
): BoardContent {
  const moving = board.columns[from.column]?.[from.index];
  if (!moving) {
    return board;
  }
  const without = board.columns.map((col, c) =>
    c === from.column ? col.filter((_, i) => i !== from.index) : col
  );
  // Removing first shifts the target down by one when it sits after the source.
  const at =
    from.column === to.column && to.index > from.index ? to.index - 1 : Math.max(0, to.index);
  return withColumns(
    board,
    without.map((col, c) =>
      c === to.column ? [...col.slice(0, at), moving, ...col.slice(at)] : col
    )
  );
}

/** The board wiped clean: no notes, no chart, no marker, no title. */
export function wipeBoard(): BoardContent {
  return { title: '', tag: '', columns: COLUMN_HEADS.map(() => []), chart: false, ink: null };
}
