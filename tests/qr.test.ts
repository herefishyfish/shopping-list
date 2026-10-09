import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildJoinPayload, parseJoinPayload, qrMatrix } from '../src/app/core/qr.ts';

test('join payload round-trips, including non-ASCII names', () => {
  const p = { listId: 'aB3_xYz', code: 'K9fQ2mPq7RtS1uVw3XyZ', name: 'Café & Co / Week 1 🛒' };
  const raw = buildJoinPayload(p);
  assert.match(raw, /^[\x21-\x7e]+$/, 'payload is printable ASCII');
  assert.deepEqual(parseJoinPayload(raw), p);
});

test('foreign or malformed QR codes are rejected', () => {
  assert.equal(parseJoinPayload('https://example.com'), null);
  assert.equal(parseJoinPayload(''), null);
  assert.equal(parseJoinPayload(null), null);
  assert.equal(parseJoinPayload('shoppinglist://join?l=abc'), null);
  assert.equal(parseJoinPayload('shoppinglist://join?l=../users&c=x'), null);
  assert.equal(parseJoinPayload('shoppinglist://join?l=abc&c=x%E0%A4%A'), null);
});

test('missing name falls back to a placeholder', () => {
  assert.equal(parseJoinPayload('shoppinglist://join?l=abc&c=def')?.name, 'a shopping list');
});

test('qrMatrix produces a square matrix with finder patterns', () => {
  const m = qrMatrix(buildJoinPayload({ listId: 'abcdefghijklmnopqrst', code: 'ABCDEFGHIJKLMNOPQRST', name: 'Weekly shop' }));
  const n = m.length;
  assert.ok(n >= 21 && (n - 17) % 4 === 0, `valid QR size, got ${n}`);
  assert.ok(m.every((row) => row.length === n));
  // Top-left finder pattern: 7x7 dark border with a light ring inside.
  for (let i = 0; i < 7; i++) {
    assert.ok(m[0][i] && m[6][i] && m[i][0] && m[i][6]);
  }
  assert.ok(!m[1][1] && m[2][2] && m[4][4]);
});

test('qrSvg draws exactly the dark modules', async () => {
  const { qrSvg } = await import('../src/app/core/qr.ts');
  const value = buildJoinPayload({ listId: 'abc', code: 'def', name: 'x' });
  const m = qrMatrix(value);
  const svg = qrSvg(value, '#000', 2);
  const size = m.length + 4;
  assert.match(svg, new RegExp(`viewBox="0 0 ${size} ${size}"`));
  // Sum the run widths in the path and compare with the number of dark modules.
  const runs = [...svg.matchAll(/M(\d+) (\d+)h(\d+)v1h-\3z/g)];
  const painted = runs.reduce((n, r) => n + Number(r[3]), 0);
  const dark = m.flat().filter(Boolean).length;
  assert.equal(painted, dark);
  for (const [, x, y, w] of runs) {
    for (let i = 0; i < Number(w); i++) assert.ok(m[Number(y) - 2][Number(x) - 2 + i]);
  }
});
