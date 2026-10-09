/**
 * Weekly "go shopping" reminder maths. Pure – no NativeScript imports – so it's unit-tested
 * with plain Node (`npm test`).
 */

export type ReminderZone = 'awst' | 'device';

export interface ReminderSettings {
  enabled: boolean;
  /** 0 = Sunday … 6 = Saturday (same as `Date#getDay`). */
  weekday: number;
  hour: number;
  minute: number;
  /**
   * `awst`: Australian Western Standard Time (Perth, UTC+8, no daylight saving).
   * `device`: whatever time zone the phone is in.
   */
  zone: ReminderZone;
}

export const DEFAULT_REMINDER: ReminderSettings = { enabled: true, weekday: 1, hour: 19, minute: 0, zone: 'awst' };

/** AWST is a fixed UTC+8 offset – WA doesn't observe daylight saving. */
export const AWST_OFFSET_MINUTES = 8 * 60;

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function normalizeReminder(value: Partial<ReminderSettings> | null | undefined): ReminderSettings {
  const v = { ...DEFAULT_REMINDER, ...(value ?? {}) };
  const int = (n: unknown, min: number, max: number, fallback: number) => (Number.isInteger(n) && (n as number) >= min && (n as number) <= max ? (n as number) : fallback);
  return {
    enabled: !!v.enabled,
    weekday: int(v.weekday, 0, 6, DEFAULT_REMINDER.weekday),
    hour: int(v.hour, 0, 23, DEFAULT_REMINDER.hour),
    minute: int(v.minute, 0, 59, DEFAULT_REMINDER.minute),
    zone: v.zone === 'device' ? 'device' : 'awst',
  };
}

/** The next moment (strictly after `now`) the reminder should fire. */
export function nextReminder(now: Date, s: ReminderSettings): Date {
  if (s.zone === 'awst') {
    const offsetMs = AWST_OFFSET_MINUTES * 60_000;
    // Shift into AWST "wall clock" and use the UTC getters to read it.
    const wall = new Date(now.getTime() + offsetMs);
    const days = (s.weekday - wall.getUTCDay() + 7) % 7;
    let at = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate() + days, s.hour, s.minute) - offsetMs;
    if (at <= now.getTime()) at += 7 * 24 * 60 * 60_000;
    return new Date(at);
  }
  const days = (s.weekday - now.getDay() + 7) % 7;
  const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, s.hour, s.minute, 0, 0);
  if (at.getTime() <= now.getTime()) at.setDate(at.getDate() + 7); // setDate keeps wall-clock time across DST
  return at;
}

export function formatTime(hour: number, minute: number): string {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'am' : 'pm'}`;
}

/** e.g. "Mondays at 7:00 pm Perth time" */
export function describeReminder(s: ReminderSettings): string {
  return `${WEEKDAYS[s.weekday]}s at ${formatTime(s.hour, s.minute)}${s.zone === 'awst' ? ' Perth time' : ''}`;
}
