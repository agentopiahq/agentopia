import { StateStorage } from './interact';

/**
 * The sessions this viewer has sent home from their desks, remembered across
 * reloads. A harness does not always say goodbye — archiving a Claude Code
 * thread fires no hook — so a desk can be cleared by hand, and a reload
 * within the server's floor window would otherwise seat the session again.
 * Each entry is a bus and the newest event time the dismissal holds through
 * (`Director.dismiss`); anything newer brings the session back regardless.
 * Like the room's pieces, this is the viewer's own and never reaches core's
 * state on its own: the page hands it back to the director on load.
 */

const STORAGE_KEY = 'agentopia.office.dismissed.v1';
/** Enough for every desk several times over; the oldest are forgotten first. */
export const DISMISSED_KEPT = 32;

/** Every remembered dismissal, as [bus, held through]. Never throws. */
export function loadDismissed(storage: StateStorage | null): Array<[string, number]> {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return [];
    }
    return Object.entries(parsed as Record<string, unknown>).filter(
      (entry): entry is [string, number] => typeof entry[1] === 'number'
    );
  } catch {
    return [];
  }
}

/** Remember one more, keeping the `DISMISSED_KEPT` most recent. Never throws. */
export function rememberDismissed(
  storage: StateStorage | null,
  bus: string,
  through: number
): void {
  const kept = new Map(loadDismissed(storage));
  kept.set(bus, Math.max(through, kept.get(bus) ?? through));
  const newest = [...kept].sort((a, b) => b[1] - a[1]).slice(0, DISMISSED_KEPT);
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(newest)));
  } catch {
    // Out of space or blocked: the desk still clears, it just will not be remembered.
  }
}
