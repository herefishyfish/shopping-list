import { Component, NO_ERRORS_SCHEMA, computed, inject } from '@angular/core';
import { ReminderService } from '../../core/reminder.service';
import { ReminderSettings, ReminderZone, WEEKDAYS, describeReminder } from '../../core/reminder-time';
import { UiService } from '../../core/ui.service';

@Component({
  selector: 'settings-page',
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss'],
  schemas: [NO_ERRORS_SCHEMA],
})
export class SettingsPage {
  private readonly reminders = inject(ReminderService);
  private readonly ui = inject(UiService);

  readonly s = this.reminders.settings;
  readonly days = WEEKDAYS.map((name, i) => ({ i, short: name.slice(0, 3) }));
  readonly summary = computed(() => describeReminder(this.s()));
  readonly nextLabel = computed(() => {
    const at = this.reminders.next();
    return at ? at.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';
  });

  setEnabled(enabled: boolean) {
    if (enabled !== this.s().enabled) this.save({ enabled });
  }

  setDay(weekday: number) {
    this.save({ weekday });
  }

  setZone(zone: ReminderZone) {
    this.save({ zone });
  }

  onTime(value: Date) {
    if (!(value instanceof Date)) return;
    const hour = value.getHours();
    const minute = value.getMinutes();
    if (hour !== this.s().hour || minute !== this.s().minute) this.save({ hour, minute });
  }

  async test() {
    if (await this.reminders.sendTest()) this.ui.toast('Test notification in 5 seconds');
    else this.permissionDenied();
  }

  private async save(patch: Partial<ReminderSettings>) {
    const ok = await this.reminders.update(patch);
    if (!ok) this.permissionDenied();
  }

  private permissionDenied() {
    this.ui.error('Notifications are turned off for this app – enable them in system settings.');
  }
}
