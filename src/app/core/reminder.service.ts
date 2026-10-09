import { Injectable, computed, signal } from '@angular/core';
import { ApplicationSettings } from '@nativescript/core';
import { LocalNotifications } from '@nativescript/local-notifications';
import { track } from './telemetry';
import { DEFAULT_REMINDER, ReminderSettings, nextReminder, normalizeReminder } from './reminder-time';

const STORAGE_KEY = 'shoppingReminder';
const REMINDER_ID = 7001;
const TEST_ID = 7002;

/**
 * Weekly local notification nudging you to do the shopping. Settings are per device
 * (ApplicationSettings), not synced - each housemate picks their own reminder.
 */
@Injectable({ providedIn: 'root' })
export class ReminderService {
  private readonly _settings = signal<ReminderSettings>(load());
  readonly settings = this._settings.asReadonly();
  readonly next = computed(() => (this._settings().enabled ? nextReminder(new Date(), this._settings()) : null));

  private applied = false;

  /** Schedule once per app run (also re-anchors the repeat if the phone's zone changed). */
  async ensureScheduled() {
    if (this.applied) return;
    this.applied = true;
    await this.apply();
  }

  async update(patch: Partial<ReminderSettings>): Promise<boolean> {
    const next = normalizeReminder({ ...this._settings(), ...patch });
    this._settings.set(next);
    ApplicationSettings.setString(STORAGE_KEY, JSON.stringify(next));
    track('reminder_updated', { enabled: next.enabled, weekday: next.weekday, hour: next.hour, zone: next.zone });
    return this.apply();
  }

  /** Returns false if notifications are enabled in settings but the OS permission was refused. */
  async apply(): Promise<boolean> {
    const s = this._settings();
    try {
      await LocalNotifications.cancel(REMINDER_ID);
      if (!s.enabled) return true;
      if (!(await this.ensurePermission())) return false;
      await LocalNotifications.schedule([
        {
          id: REMINDER_ID,
          title: 'Shopping time 🛒',
          body: 'Check your shared lists and get the shopping done.',
          at: nextReminder(new Date(), s),
          interval: 'week',
          channel: 'Shopping reminders',
          forceShowWhenInForeground: true,
        },
      ]);
      return true;
    } catch (e) {
      console.error('[reminder] scheduling failed', e);
      return false;
    }
  }

  async sendTest(): Promise<boolean> {
    if (!(await this.ensurePermission())) return false;
    await LocalNotifications.schedule([
      {
        id: TEST_ID,
        title: 'Shopping time 🛒',
        body: 'This is what your weekly reminder will look like.',
        at: new Date(Date.now() + 5000),
        channel: 'Shopping reminders',
        forceShowWhenInForeground: true,
      },
    ]);
    return true;
  }

  /** Called on sign-out - nobody to remind. */
  async cancelAll() {
    this.applied = false;
    await LocalNotifications.cancel(REMINDER_ID).catch(() => {});
  }

  private async ensurePermission(): Promise<boolean> {
    return (await LocalNotifications.hasPermission()) || (await LocalNotifications.requestPermission());
  }
}

function load(): ReminderSettings {
  try {
    const raw = ApplicationSettings.getString(STORAGE_KEY);
    return raw ? normalizeReminder(JSON.parse(raw)) : DEFAULT_REMINDER;
  } catch {
    return DEFAULT_REMINDER;
  }
}
