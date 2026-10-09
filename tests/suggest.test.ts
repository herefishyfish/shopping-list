import { test } from 'node:test';
import assert from 'node:assert/strict';
import { displayName, historyKey, isEmail, normalizeName, rankSuggestions } from '../src/app/core/suggest.ts';

const h = (name: string, count = 1, lastUsed = 0) => ({ name, nameLower: normalizeName(name), count, lastUsed });

test('normalizeName collapses whitespace and case', () => {
  assert.equal(normalizeName('  Oat   MILK '), 'oat milk');
});

test('historyKey is a safe Firestore id', () => {
  assert.equal(historyKey('Salt / Pepper.'), 'salt _ pepper_');
  assert.equal(historyKey('   '), '_');
});

test('displayName capitalises and trims', () => {
  assert.equal(displayName('  bananas  ripe '), 'Bananas ripe');
});

test('prefix matches outrank word and substring matches', () => {
  const history = [h('Tomato paste', 1), h('Cherry tomatoes', 9), h('Potatoes', 20), h('Tomatoes', 2)];
  const names = rankSuggestions(history, 'tom', new Set(), 10).map((e) => e.name);
  assert.deepEqual(names, ['Tomatoes', 'Tomato paste', 'Cherry tomatoes']);
  assert.deepEqual(rankSuggestions(history, 'tato', new Set(), 10).map((e) => e.name), ['Potatoes']);
});

test('frequency then recency breaks ties', () => {
  const history = [h('Milk', 2, 100), h('Mince', 5, 1), h('Mints', 2, 200)];
  assert.deepEqual(rankSuggestions(history, 'mi', new Set(), 10).map((e) => e.name), ['Mince', 'Mints', 'Milk']);
});

test('items already on the list and exact matches are excluded', () => {
  const history = [h('Bread'), h('Breadcrumbs'), h('Brie')];
  assert.deepEqual(rankSuggestions(history, 'bread', new Set(), 10).map((e) => e.name), ['Breadcrumbs']);
  assert.deepEqual(rankSuggestions(history, 'br', new Set(['brie']), 10).map((e) => e.name), ['Bread', 'Breadcrumbs']);
});

test('empty query returns most frequent items up to the limit', () => {
  const history = [h('Eggs', 3), h('Milk', 10), h('Bread', 7)];
  assert.deepEqual(rankSuggestions(history, '', new Set(), 2).map((e) => e.name), ['Milk', 'Bread']);
});

test('isEmail', () => {
  assert.ok(isEmail('sam@example.com'));
  assert.ok(!isEmail('sam@example'));
  assert.ok(!isEmail('not an email'));
});
