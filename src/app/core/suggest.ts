/**
 * Pure helpers for the item type-ahead. No NativeScript / Firebase imports so they can be
 * unit-tested with plain Node (`npm test`).
 */

export interface Suggestible {
  name: string;
  nameLower: string;
  count: number;
  lastUsed: number;
}

/** Collapse whitespace and case so "  Oat  Milk" and "oat milk" are the same item. */
export function normalizeName(name: string): string {
  return (name ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Firestore-safe document id for a normalised item name. */
export function historyKey(name: string): string {
  const key = normalizeName(name).replace(/[\/.#$\[\]]/g, '_');
  return key.length > 0 ? key.slice(0, 200) : '_';
}

/** Tidy user input for display: trim/collapse whitespace and capitalise the first letter. */
export function displayName(name: string): string {
  const s = (name ?? '').trim().replace(/\s+/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Rank history entries against what the user has typed.
 *
 * - matches are case-insensitive substring matches on any word
 * - names that start with the query beat word-prefix matches, which beat mid-word matches
 * - ties are broken by how often the item was bought, then by recency
 * - anything in `exclude` (normalised names already on the list) is skipped
 * - with an empty query the most frequently bought items are returned ("buy again")
 */
export function rankSuggestions<T extends Suggestible>(history: readonly T[], query: string, exclude: ReadonlySet<string>, limit: number): T[] {
  const q = normalizeName(query);
  const scored: { entry: T; score: number }[] = [];

  for (const entry of history) {
    if (exclude.has(entry.nameLower)) continue;
    let score: number;
    if (!q) {
      score = 0;
    } else if (entry.nameLower === q) {
      continue; // exact match - nothing to complete
    } else if (entry.nameLower.startsWith(q)) {
      score = 3;
    } else if (entry.nameLower.includes(' ' + q)) {
      score = 2;
    } else if (entry.nameLower.includes(q)) {
      score = 1;
    } else {
      continue;
    }
    scored.push({ entry, score });
  }

  scored.sort((a, b) => b.score - a.score || b.entry.count - a.entry.count || b.entry.lastUsed - a.entry.lastUsed || a.entry.nameLower.localeCompare(b.entry.nameLower));
  return scored.slice(0, limit).map((s) => s.entry);
}

/** Very small email sanity check for the share sheet. */
export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((value ?? '').trim());
}
