import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_REMINDER, describeReminder, formatTime, nextReminder, normalizeReminder } from '../src/app/core/reminder-time.ts';

const awst = DEFAULT_REMINDER; // Monday 19:00 AWST

test('default is Monday 7pm AWST (11:00 UTC)', () => {
  // Wed 8 Oct 2026 09:00 UTC  → next Monday 12 Oct 19:00 AWST = 11:00 UTC
  assert.equal(nextReminder(new Date('2026-10-08T09:00:00Z'), awst).toISOString(), '2026-10-12T11:00:00.000Z');
});

test('same day before / at / after the reminder time', () => {
  assert.equal(nextReminder(new Date('2026-10-12T10:59:00Z'), awst).toISOString(), '2026-10-12T11:00:00.000Z');
  assert.equal(nextReminder(new Date('2026-10-12T11:00:00Z'), awst).toISOString(), '2026-10-19T11:00:00.000Z');
  assert.equal(nextReminder(new Date('2026-10-12T12:00:00Z'), awst).toISOString(), '2026-10-19T11:00:00.000Z');
});

test('uses the AWST calendar day, not the UTC one', () => {
  // Sun 11 Oct 2026 20:00 UTC is already Monday 04:00 in Perth → fire that Monday evening.
  assert.equal(nextReminder(new Date('2026-10-11T20:00:00Z'), awst).toISOString(), '2026-10-12T11:00:00.000Z');
  // Mon 12 Oct 17:00 UTC is Tuesday 01:00 in Perth → next week.
  assert.equal(nextReminder(new Date('2026-10-12T17:00:00Z'), awst).toISOString(), '2026-10-19T11:00:00.000Z');
});

test('custom day and time in AWST', () => {
  const sat = { ...awst, weekday: 6, hour: 8, minute: 30 };
  assert.equal(nextReminder(new Date('2026-10-08T09:00:00Z'), sat).toISOString(), '2026-10-10T00:30:00.000Z');
});

test('device zone uses local wall-clock time', () => {
  const s = { ...awst, zone: 'device' as const };
  const at = nextReminder(new Date(2026, 9, 8, 12, 0), s);
  assert.equal(at.getDay(), 1);
  assert.equal(at.getHours(), 19);
  assert.equal(at.getMinutes(), 0);
  assert.ok(at.getTime() - new Date(2026, 9, 8, 12, 0).getTime() < 7 * 86400000);
});

test('normalizeReminder fills defaults and rejects junk', () => {
  assert.deepEqual(normalizeReminder(null), DEFAULT_REMINDER);
  assert.deepEqual(normalizeReminder({ weekday: 9, hour: -1, minute: 1.5, zone: 'mars' as any, enabled: false }), { ...DEFAULT_REMINDER, enabled: false });
});

test('labels', () => {
  assert.equal(formatTime(19, 0), '7:00 pm');
  assert.equal(formatTime(0, 5), '12:05 am');
  assert.equal(formatTime(12, 30), '12:30 pm');
  assert.equal(describeReminder(awst), 'Mondays at 7:00 pm Perth time');
});
