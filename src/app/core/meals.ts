/**
 * Meal-plan helpers: which Wednesday the household is ordering for (Perth), whether both
 * people said yes, and how that meal's ingredients land on the shared list.
 *
 * No NativeScript / Firebase imports — unit-tested with plain Node (`npm test`).
 * The Firestore shape these operate on is documented in the README.
 * Name tidying matches `suggest.ts`; the Perth offset matches `reminder-time.ts`.
 */

/** Wednesday, matching `Date#getDay` / the reminder weekday numbers. */
export const ORDER_WEEKDAY = 3;

/** AWST is UTC+8 with no daylight saving — same offset as `AWST_OFFSET_MINUTES`. */
const AWST_OFFSET_MS = 8 * 60 * 60_000;

/** Auto-add checks each current member. Past this, security rules refuse the claim. */
export const MAX_MATCH_MEMBERS = 8;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export type MealVote = 'yes' | 'no';
export type MealState = 'agreed' | 'pending' | 'rejected';

export interface MealIngredient {
  name: string;
  quantity: string;
}

/** One card in `lists/{listId}/mealPlans/{weekId}/meals/{mealId}`. */
export interface MealIdea {
  id: string;
  title: string;
  description: string;
  ingredients: MealIngredient[];
  estCostAud: number | null;
  vegetarian: boolean;
  source: string;
  notes: string;
  sort: number;
  votes: Record<string, MealVote>;
  /** Set when the ingredients were written onto the shopping list. */
  appliedAt: number | null;
  appliedBy: string | null;
}

export interface ListLine {
  id: string;
  name: string;
  nameLower: string;
  quantity: string;
  checked: boolean;
}

export interface PlannedIngredient {
  action: 'create' | 'merge';
  /** Set when `action` is `merge`. */
  itemId: string | null;
  /** Name to store (create) or the existing line's name (merge). */
  name: string;
  quantity: string;
  /** A ticked line is unticked so the extra amount is still ordered. */
  reopen: boolean;
}

export interface VoteLine {
  uid: string;
  name: string;
  choice: MealVote | null;
  mine: boolean;
}

/** `YYYY-MM-DD` of the Wednesday this order is for: today if it's Wednesday in Perth, otherwise the next one. */
export function orderWeekId(now: Date = new Date()): string {
  const wall = new Date(now.getTime() + AWST_OFFSET_MS);
  const delta = (ORDER_WEEKDAY - wall.getUTCDay() + 7) % 7;
  const wed = new Date(Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate() + delta));
  const month = String(wed.getUTCMonth() + 1).padStart(2, '0');
  const day = String(wed.getUTCDate()).padStart(2, '0');
  return `${wed.getUTCFullYear()}-${month}-${day}`;
}

/** e.g. "Wed 21 Oct". Unknown ids are returned unchanged. */
export function formatOrderDay(weekId: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(weekId ?? '');
  if (!match) return weekId ?? '';
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return weekId;
  return `Wed ${day} ${MONTHS[month - 1]}`;
}

export function formatAud(amount: number | null | undefined): string {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return '';
  const fixed = (Math.round(amount * 100) / 100).toFixed(2);
  return `$${fixed.endsWith('.00') ? fixed.slice(0, -3) : fixed}`;
}

export function toMeal(id: string, data: any): MealIdea {
  const votes: Record<string, MealVote> = {};
  const rawVotes = data?.votes && typeof data.votes === 'object' ? data.votes : {};
  for (const [uid, choice] of Object.entries(rawVotes)) {
    if (choice === 'yes' || choice === 'no') votes[uid] = choice;
  }
  const ingredients: MealIngredient[] = [];
  if (Array.isArray(data?.ingredients)) {
    for (const raw of data.ingredients) {
      const name = displayName(String(raw?.name ?? ''));
      if (!name) continue;
      ingredients.push({ name, quantity: clean(raw?.quantity) });
    }
  }
  return {
    id,
    title: String(data?.title ?? '').trim() || 'Meal',
    description: String(data?.description ?? '').trim(),
    ingredients,
    estCostAud: typeof data?.estCostAud === 'number' && Number.isFinite(data.estCostAud) ? data.estCostAud : null,
    vegetarian: data?.vegetarian === true,
    source: String(data?.source ?? '').trim(),
    notes: String(data?.notes ?? '').trim(),
    sort: typeof data?.sort === 'number' && Number.isFinite(data.sort) ? data.sort : 0,
    votes,
    appliedAt: typeof data?.appliedAt === 'number' && Number.isFinite(data.appliedAt) ? data.appliedAt : null,
    appliedBy: typeof data?.appliedBy === 'string' && data.appliedBy ? data.appliedBy : null,
  };
}

/** Every current member said yes, and there are at least two of them. */
export function isMatch(votes: Record<string, MealVote>, memberIds: readonly string[]): boolean {
  return memberIds.length >= 2 && memberIds.length <= MAX_MATCH_MEMBERS && memberIds.every((id) => votes[id] === 'yes');
}

export function mealState(meal: Pick<MealIdea, 'votes' | 'appliedAt'>, memberIds: readonly string[]): MealState {
  if (meal.appliedAt) return 'agreed';
  if (memberIds.some((id) => meal.votes[id] === 'no')) return 'rejected';
  if (isMatch(meal.votes, memberIds)) return 'agreed';
  return 'pending';
}

export function groupMeals(meals: readonly MealIdea[], memberIds: readonly string[]): Record<MealState, MealIdea[]> {
  const groups: Record<MealState, MealIdea[]> = { agreed: [], pending: [], rejected: [] };
  for (const meal of [...meals].sort(bySort)) groups[mealState(meal, memberIds)].push(meal);
  return groups;
}

/** Cards still waiting for this person's swipe. A "no" from anyone drops it out of the deck. */
export function deckMeals(meals: readonly MealIdea[], memberIds: readonly string[], myUid: string, vegetarianOnly: boolean): MealIdea[] {
  return meals
    .filter((meal) => !meal.appliedAt && !meal.votes[myUid])
    .filter((meal) => mealState(meal, memberIds) !== 'rejected')
    .filter((meal) => !vegetarianOnly || meal.vegetarian)
    .sort(bySort);
}

export function voteLines(meal: Pick<MealIdea, 'votes'>, memberIds: readonly string[], names: Readonly<Record<string, string>>, myUid: string): VoteLine[] {
  return memberIds.map((uid) => ({
    uid,
    name: uid === myUid ? 'You' : names[uid] || 'Partner',
    choice: meal.votes[uid] ?? null,
    mine: uid === myUid,
  }));
}

export function voteSummary(lines: readonly VoteLine[]): string {
  if (!lines.length) return 'No votes yet';
  return lines.map((line) => `${line.name} ${line.choice ?? 'waiting'}`).join(' · ');
}

/**
 * Combine two free-form quantities.
 *
 * Numbers with the same unit are added (`2` + `3` → `5`, `500g` + `250g` → `750g`,
 * `1 cup` + `2 cups` → `3 cups`). Identical text such as "to taste" is kept once.
 * Anything else is kept side by side (`1 bunch + 2`) so nothing is dropped.
 */
export function mergeQuantity(a: string | null | undefined, b: string | null | undefined): string {
  const left = clean(a);
  const right = clean(b);
  if (!left) return right;
  if (!right) return left;
  const parsedLeft = parseQty(left);
  const parsedRight = parseQty(right);
  if (parsedLeft && parsedRight && parsedLeft.unit === parsedRight.unit) {
    return formatParsed(parsedLeft.amount + parsedRight.amount, parsedLeft.unit, parsedLeft.tight && parsedRight.tight);
  }
  if (left.toLowerCase() === right.toLowerCase()) return left;
  return `${left} + ${right}`;
}

/**
 * Turn a meal's ingredients into list writes.
 *
 * An unticked line with the same name is reused and its quantity is merged. If the only
 * match is already ticked, it is unticked and the quantity is merged so the extra amount
 * is still ordered. Two ingredients that share a name become one line.
 */
export function planIngredientAdds(items: readonly ListLine[], ingredients: readonly { name?: string | null; quantity?: string | null }[]): PlannedIngredient[] {
  const rows: Row[] = items.map((item) => ({
    id: item.id,
    name: item.name,
    nameLower: item.nameLower || normalizeName(item.name),
    quantity: clean(item.quantity),
    checked: !!item.checked,
    planIndex: null,
  }));
  const plans: PlannedIngredient[] = [];

  for (const ingredient of ingredients) {
    const name = displayName(ingredient?.name ?? '');
    const nameLower = normalizeName(name);
    if (!nameLower) continue;
    const addQty = clean(ingredient?.quantity);
    let row = rows.find((candidate) => candidate.nameLower === nameLower && !candidate.checked) ?? rows.find((candidate) => candidate.nameLower === nameLower);
    if (!row) {
      row = { id: null, name, nameLower, quantity: addQty, checked: false, planIndex: plans.length };
      plans.push({ action: 'create', itemId: null, name, quantity: addQty, reopen: false });
      rows.push(row);
      continue;
    }
    const quantity = mergeQuantity(row.quantity, addQty);
    const reopen = row.checked;
    if (row.planIndex == null) {
      row.planIndex = plans.length;
      plans.push({ action: 'merge', itemId: row.id, name: row.name, quantity, reopen });
    } else {
      const plan = plans[row.planIndex];
      plan.quantity = quantity;
      plan.reopen = plan.reopen || reopen;
    }
    row.quantity = quantity;
    row.checked = false;
  }
  return plans;
}

interface Row {
  id: string | null;
  name: string;
  nameLower: string;
  quantity: string;
  checked: boolean;
  planIndex: number | null;
}

interface ParsedQty {
  amount: number;
  unit: string;
  tight: boolean;
}

const UNIT_CANON: Record<string, string> = {
  g: 'g',
  gram: 'g',
  grams: 'g',
  kg: 'kg',
  kilo: 'kg',
  kilos: 'kg',
  kilogram: 'kg',
  kilograms: 'kg',
  ml: 'ml',
  millilitre: 'ml',
  millilitres: 'ml',
  milliliter: 'ml',
  milliliters: 'ml',
  l: 'l',
  litre: 'l',
  litres: 'l',
  liter: 'l',
  liters: 'l',
  cup: 'cup',
  cups: 'cup',
  tbsp: 'tbsp',
  tablespoon: 'tbsp',
  tablespoons: 'tbsp',
  tsp: 'tsp',
  teaspoon: 'tsp',
  teaspoons: 'tsp',
  bunch: 'bunch',
  bunches: 'bunch',
  pack: 'pack',
  packs: 'pack',
  packet: 'pack',
  packets: 'pack',
  can: 'can',
  cans: 'can',
  tin: 'can',
  tins: 'can',
  clove: 'clove',
  cloves: 'clove',
  head: 'head',
  heads: 'head',
  bag: 'bag',
  bags: 'bag',
  bottle: 'bottle',
  bottles: 'bottle',
  loaf: 'loaf',
  loaves: 'loaf',
  piece: 'piece',
  pieces: 'piece',
  slice: 'slice',
  slices: 'slice',
};

const SINGULAR: Record<string, string> = {
  g: 'g',
  kg: 'kg',
  ml: 'ml',
  l: 'l',
  cup: 'cup',
  tbsp: 'tbsp',
  tsp: 'tsp',
  bunch: 'bunch',
  pack: 'pack',
  can: 'can',
  clove: 'clove',
  head: 'head',
  bag: 'bag',
  bottle: 'bottle',
  loaf: 'loaf',
  piece: 'piece',
  slice: 'slice',
};

const PLURAL: Record<string, string> = {
  g: 'g',
  kg: 'kg',
  ml: 'ml',
  l: 'l',
  cup: 'cups',
  tbsp: 'tbsp',
  tsp: 'tsp',
  bunch: 'bunches',
  pack: 'packs',
  can: 'cans',
  clove: 'cloves',
  head: 'heads',
  bag: 'bags',
  bottle: 'bottles',
  loaf: 'loaves',
  piece: 'pieces',
  slice: 'slices',
};

function clean(value: string | null | undefined): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function normalizeName(name: string): string {
  return clean(name).toLowerCase();
}

function displayName(name: string): string {
  const s = clean(name);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function parseQty(value: string): ParsedQty | null {
  const match = /^(\d+(?:\.\d+)?)\s*([a-zA-Z]+)?$/.exec(value);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;
  const rawUnit = (match[2] ?? '').toLowerCase();
  if (!rawUnit) return { amount, unit: '', tight: false };
  const unit = UNIT_CANON[rawUnit];
  if (!unit) return null;
  return { amount, unit, tight: /^\d+(?:\.\d+)?[a-zA-Z]+$/.test(value) };
}

function formatAmount(amount: number): string {
  const rounded = Math.round(amount * 1000) / 1000;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function formatParsed(amount: number, unit: string, tight: boolean): string {
  const n = formatAmount(amount);
  if (!unit) return n;
  const word = amount === 1 ? SINGULAR[unit] : PLURAL[unit];
  const tightUnit = unit === 'g' || unit === 'kg' || unit === 'ml' || unit === 'l';
  return tight && tightUnit ? `${n}${word}` : `${n} ${word}`;
}

function bySort(a: MealIdea, b: MealIdea): number {
  return a.sort - b.sort || a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
}
