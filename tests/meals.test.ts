import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deckMeals, formatAud, formatOrderDay, groupMeals, isMatch, mealState, mergeQuantity, orderWeekId, planIngredientAdds, toMeal, voteLines, voteSummary, type MealIdea } from '../src/app/core/meals.ts';

const meal = (patch: Partial<MealIdea> & Pick<MealIdea, 'id'>): MealIdea => ({
  title: patch.id,
  description: '',
  ingredients: [],
  estCostAud: null,
  vegetarian: false,
  source: '',
  notes: '',
  sort: 0,
  votes: {},
  appliedAt: null,
  appliedBy: null,
  ...patch,
});

const line = (id: string, name: string, quantity = '', checked = false) => ({
  id,
  name,
  nameLower: name.trim().replace(/\s+/g, ' ').toLowerCase(),
  quantity,
  checked,
});

test('orderWeekId is the coming Wednesday in Perth, or today when it is Wednesday', () => {
  // Tue 13 Oct 2026 23:30 AWST.
  assert.equal(orderWeekId(new Date('2026-10-13T15:30:00Z')), '2026-10-14');
  // Wed 14 Oct 2026 00:00 AWST — the UTC date is still Tuesday.
  assert.equal(orderWeekId(new Date('2026-10-13T16:00:00Z')), '2026-10-14');
  // Wed 14 Oct 2026 23:59 AWST.
  assert.equal(orderWeekId(new Date('2026-10-14T15:59:00Z')), '2026-10-14');
  // Thu 15 Oct 2026 00:00 AWST → the following Wednesday.
  assert.equal(orderWeekId(new Date('2026-10-14T16:00:00Z')), '2026-10-21');
  // Thu 31 Dec 2026 00:00 AWST rolls into the next year.
  assert.equal(orderWeekId(new Date('2026-12-30T16:00:00Z')), '2027-01-06');
});

test('formatOrderDay and formatAud', () => {
  assert.equal(formatOrderDay('2026-10-21'), 'Wed 21 Oct');
  assert.equal(formatOrderDay('nope'), 'nope');
  assert.equal(formatAud(12), '$12');
  assert.equal(formatAud(12.5), '$12.50');
  assert.equal(formatAud(null), '');
});

test('toMeal keeps yes/no votes and drops junk', () => {
  const parsed = toMeal('m1', {
    title: '  Fried rice ',
    ingredients: [{ name: ' rice ', quantity: ' 2 cups ' }, { name: ' ' }, { quantity: '1' }],
    estCostAud: 12.5,
    vegetarian: true,
    votes: { dylan: 'yes', caitlin: 'no', kid: 'maybe' },
    appliedAt: null,
    sort: 2,
  });
  assert.equal(parsed.title, 'Fried rice');
  assert.deepEqual(parsed.ingredients, [{ name: 'Rice', quantity: '2 cups' }]);
  assert.deepEqual(parsed.votes, { dylan: 'yes', caitlin: 'no' });
  assert.equal(parsed.vegetarian, true);
  assert.equal(parsed.estCostAud, 12.5);
  assert.equal(parsed.appliedAt, null);
});

test('a match needs every current member, and at least two of them', () => {
  assert.equal(isMatch({ a: 'yes', b: 'yes' }, ['a', 'b']), true);
  assert.equal(isMatch({ a: 'yes' }, ['a']), false);
  assert.equal(isMatch({ a: 'yes', b: 'no' }, ['a', 'b']), false);
  assert.equal(isMatch({ a: 'yes', b: 'yes' }, ['a', 'b', 'c']), false);
  // Someone who left the list doesn't get a veto.
  assert.equal(isMatch({ a: 'yes', b: 'yes', gone: 'no' }, ['a', 'b']), true);
  assert.equal(isMatch({ a: 'yes', b: 'yes', c: 'yes', d: 'yes', e: 'yes', f: 'yes', g: 'yes', h: 'yes', i: 'yes' }, ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']), false);
});

test('meal state is agreed, pending or rejected', () => {
  const members = ['dylan', 'caitlin'];
  assert.equal(mealState(meal({ id: '1', votes: { dylan: 'yes' } }), members), 'pending');
  assert.equal(mealState(meal({ id: '1', votes: { dylan: 'yes', caitlin: 'yes' } }), members), 'agreed');
  assert.equal(mealState(meal({ id: '1', votes: { caitlin: 'no' } }), members), 'rejected');
  assert.equal(mealState(meal({ id: '1', votes: { dylan: 'no' }, appliedAt: 5 }), members), 'agreed');
});

test('the deck is what you have not voted on, minus anything already rejected', () => {
  const members = ['dylan', 'caitlin'];
  const meals = [
    meal({ id: 'later', title: 'Soup', sort: 2, vegetarian: true }),
    meal({ id: 'meat', title: 'Steak', sort: 0, vegetarian: false }),
    meal({ id: 'mine', title: 'Pasta', sort: 1, votes: { dylan: 'yes' }, vegetarian: true }),
    meal({ id: 'nope', title: 'Fish', sort: 1, votes: { caitlin: 'no' }, vegetarian: false }),
    meal({ id: 'done', title: 'Rice', sort: 0, appliedAt: 1, votes: { dylan: 'yes', caitlin: 'yes' }, vegetarian: true }),
  ];
  assert.deepEqual(deckMeals(meals, members, 'dylan', false).map((m) => m.id), ['meat', 'later']);
  assert.deepEqual(deckMeals(meals, members, 'dylan', true).map((m) => m.id), ['later']);
  const groups = groupMeals(meals, members);
  assert.deepEqual(groups.agreed.map((m) => m.id), ['done']);
  assert.deepEqual(groups.rejected.map((m) => m.id), ['nope']);
  assert.deepEqual(groups.pending.map((m) => m.id), ['meat', 'mine', 'later']);
});

test('vote lines name you and everyone else', () => {
  const lines = voteLines(meal({ id: '1', votes: { caitlin: 'yes' } }), ['dylan', 'caitlin'], { dylan: 'Dylan', caitlin: 'Caitlin' }, 'dylan');
  assert.equal(voteSummary(lines), 'You waiting · Caitlin yes');
});

test('mergeQuantity adds matching units and keeps everything else', () => {
  assert.equal(mergeQuantity('', '2'), '2');
  assert.equal(mergeQuantity('2', ''), '2');
  assert.equal(mergeQuantity('2', '3'), '5');
  assert.equal(mergeQuantity('2', '2'), '4');
  assert.equal(mergeQuantity('500g', '250g'), '750g');
  assert.equal(mergeQuantity('500 g', '250g'), '750 g');
  assert.equal(mergeQuantity('1 cup', '2 Cups'), '3 cups');
  assert.equal(mergeQuantity('1 bunch', '1 bunch'), '2 bunches');
  assert.equal(mergeQuantity('1.5 kg', '0.5 kg'), '2 kg');
  assert.equal(mergeQuantity('0.1', '0.2'), '0.3');
  assert.equal(mergeQuantity('to taste', 'To taste'), 'to taste');
  assert.equal(mergeQuantity('1 bunch', '2'), '1 bunch + 2');
  assert.equal(mergeQuantity('2 splats', '1 splat'), '2 splats + 1 splat');
});

test('planIngredientAdds creates, merges, reopens and collapses duplicates', () => {
  const items = [line('milk', 'Milk', '1'), line('bread', 'Bread', '1 loaf', true), line('old-milk', 'milk', '2', true)];
  const plans = planIngredientAdds(items, [
    { name: ' milk ', quantity: '2' },
    { name: 'Butter', quantity: '250g' },
    { name: 'butter', quantity: '250g' },
    { name: '  ' },
    { name: 'Bread', quantity: '1 loaf' },
    { name: 'Rice', quantity: '2 cups' },
    { name: 'rice', quantity: '1 cup' },
  ]);
  assert.deepEqual(plans, [
    { action: 'merge', itemId: 'milk', name: 'Milk', quantity: '3', reopen: false },
    { action: 'create', itemId: null, name: 'Butter', quantity: '500g', reopen: false },
    { action: 'merge', itemId: 'bread', name: 'Bread', quantity: '2 loaves', reopen: true },
    { action: 'create', itemId: null, name: 'Rice', quantity: '3 cups', reopen: false },
  ]);
});

test('a checked line is left alone when an unticked one already matches', () => {
  const plans = planIngredientAdds([line('a', 'Eggs', '6', true), line('b', 'Eggs', '6', false)], [{ name: 'eggs', quantity: '6' }]);
  assert.deepEqual(plans, [{ action: 'merge', itemId: 'b', name: 'Eggs', quantity: '12', reopen: false }]);
});
