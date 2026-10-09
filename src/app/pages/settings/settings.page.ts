import { Component, NO_ERRORS_SCHEMA, ViewContainerRef, computed, inject, signal } from '@angular/core';
import { NativeScriptCommonModule, RouterExtensions } from '@nativescript/angular';
import { Dialogs } from '@nativescript/core';
import { BottomSheetService } from '@nativescript-community/ui-material-bottomsheet/angular';
import { runningVersionLabel } from '../../../ota';
import { ShareSheet } from '../../components/share-sheet/share-sheet';
import { AuthService } from '../../core/auth.service';
import { JoinService } from '../../core/join.service';
import { ListsService } from '../../core/lists.service';
import { ReminderService } from '../../core/reminder.service';
import { ReminderSettings, ReminderZone, WEEKDAYS, describeReminder } from '../../core/reminder-time';
import { setTelemetryOptIn, telemetryOptIn } from '../../core/telemetry';
import { UiService } from '../../core/ui.service';

/** Everything that isn't the list itself: account, household, reminders, privacy, about. */
@Component({
  selector: 'settings-page',
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss'],
  imports: [NativeScriptCommonModule],
  schemas: [NO_ERRORS_SCHEMA],
})
export class SettingsPage {
  private readonly reminders = inject(ReminderService);
  private readonly ui = inject(UiService);
  private readonly auth = inject(AuthService);
  private readonly lists = inject(ListsService);
  private readonly join = inject(JoinService);
  private readonly router = inject(RouterExtensions);
  private readonly sheets = inject(BottomSheetService);
  private readonly vcRef = inject(ViewContainerRef);

  readonly user = this.auth.user;
  readonly list = this.lists.currentList;
  readonly otherLists = computed(() => this.lists.lists().filter((l) => l.id !== this.list()?.id));
  readonly isOwner = computed(() => this.list()?.ownerId === this.user()?.uid);
  readonly memberSummary = computed(() => {
    const list = this.list();
    if (!list) return '';
    const names = list.memberIds.map((id) => (id === this.user()?.uid ? 'you' : (list.members[id]?.name ?? 'someone').split(' ')[0]));
    const pending = list.invitedEmails.length ? ` · ${list.invitedEmails.length} invited` : '';
    return `Shared with ${names.join(', ')}${pending}`;
  });
  readonly version = runningVersionLabel();

  readonly s = this.reminders.settings;
  readonly telemetry = signal(telemetryOptIn());
  readonly days = WEEKDAYS.map((name, i) => ({ i, short: name.slice(0, 3) }));
  readonly summary = computed(() => describeReminder(this.s()));
  readonly nextLabel = computed(() => {
    const at = this.reminders.next();
    return at ? at.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';
  });

  // ---------------------------------------------------------------- household list

  async rename() {
    const list = this.list();
    if (!list) return;
    const name = await this.ui.prompt('Rename list', list.name);
    if (name?.trim()) await this.lists.rename(list, name).catch((e) => this.ui.error('Could not rename the list', e));
  }

  share() {
    const list = this.list();
    if (!list) return;
    this.sheets.show(ShareSheet, { viewContainerRef: this.vcRef, context: { listId: list.id }, dismissOnBackgroundTap: true });
  }

  async untickAll() {
    const list = this.list();
    if (!list) return;
    if (!(await this.ui.confirm('Untick everything?', 'Puts every ordered item back on the to-order list.', 'Untick'))) return;
    try {
      const n = await this.lists.uncheckAll(list);
      this.ui.toast(n ? `Unticked ${n} item${n === 1 ? '' : 's'}` : 'Nothing was ticked');
    } catch (e) {
      this.ui.error('Could not untick the items', e);
    }
  }

  async switchList() {
    const others = this.otherLists();
    const pick = await Dialogs.action({ title: 'Switch list', cancelButtonText: 'Cancel', actions: others.map((l) => l.name) });
    const target = others.find((l) => l.name === pick);
    if (target) this.openList(target.id);
  }

  async scanToJoin() {
    const id = await this.join.scanAndJoin();
    if (id) this.openList(id);
  }

  async leaveOrDelete() {
    const list = this.list();
    if (!list) return;
    try {
      if (this.isOwner()) {
        if (!(await this.ui.confirm('Delete list?', `“${list.name}” and its order history will be deleted for everyone it is shared with.`, 'Delete'))) return;
        await this.ui.busy('Deleting…', () => this.lists.deleteList(list));
      } else {
        if (!(await this.ui.confirm('Leave list?', 'You will lose access until someone invites you again.', 'Leave'))) return;
        await this.lists.leave(list);
      }
      this.router.navigate(['/start'], { clearHistory: true });
    } catch (e) {
      this.ui.error('Something went wrong', e);
    }
  }

  // ---------------------------------------------------------------- account

  async signOut() {
    if (!(await this.ui.confirm('Sign out?', 'Your list stays in the cloud and comes back when you sign in again.', 'Sign out'))) return;
    await this.reminders.cancelAll();
    await this.auth.signOut();
    this.router.navigate(['/login'], { clearHistory: true });
  }

  // ---------------------------------------------------------------- reminders & privacy

  setTelemetry(enabled: boolean) {
    if (enabled === this.telemetry()) return;
    this.telemetry.set(enabled);
    setTelemetryOptIn(enabled);
  }

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

  private openList(id: string) {
    this.router.navigate(['/list', id], { clearHistory: true });
  }
}
