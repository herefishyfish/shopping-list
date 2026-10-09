import { Component, NO_ERRORS_SCHEMA, computed, inject, signal } from '@angular/core';
import { RouterExtensions } from '@nativescript/angular';
import { Dialogs } from '@nativescript/core';
import { AuthService } from '../../core/auth.service';
import { ListsService } from '../../core/lists.service';
import { ShoppingList } from '../../core/models';
import { UiService } from '../../core/ui.service';
import { parseJoinPayload } from '../../core/qr';
import { ScannerService } from '../../components/scanner/scanner.service';
import { ReminderService } from '../../core/reminder.service';
import { runningVersionLabel } from '../../../ota';

@Component({
  selector: 'lists-page',
  templateUrl: './lists.page.html',
  styleUrls: ['./lists.page.scss'],
  schemas: [NO_ERRORS_SCHEMA],
})
export class ListsPage {
  private readonly auth = inject(AuthService);
  private readonly lists = inject(ListsService);
  private readonly ui = inject(UiService);
  private readonly router = inject(RouterExtensions);
  private readonly scanner = inject(ScannerService);
  private readonly reminders = inject(ReminderService);

  readonly user = this.auth.user;
  readonly loading = this.lists.loading;
  readonly invites = this.lists.invites;
  readonly active = this.lists.activeLists;
  readonly archived = this.lists.archivedLists;
  readonly showArchived = signal(false);
  readonly newName = signal('');
  readonly firstName = computed(() => (this.user()?.displayName ?? '').split(' ')[0]);

  constructor() {
    // First screen after sign-in: (re)schedule the weekly reminder, asking for permission once.
    this.reminders.ensureScheduled();
  }

  settings() {
    this.router.navigate(['/settings']);
  }

  /** Scan a list's QR code (ML Kit) and join it. */
  async scan() {
    const value = await this.scanner.scan();
    if (!value) return;
    const join = parseJoinPayload(value);
    if (!join) return this.ui.error('That QR code isn\u2019t a shopping-list invite.');
    if (this.active().some((l) => l.id === join.listId) || this.archived().some((l) => l.id === join.listId)) {
      return this.router.navigate(['/lists', join.listId]);
    }
    const ok = await this.ui.confirm('Join list?', `Join \u201c${join.name}\u201d? Everyone on it will see your name and email.`, 'Join');
    if (!ok) return;
    try {
      await this.ui.busy('Joining\u2026', () => this.lists.joinWithCode(join));
      this.ui.toast(`Joined \u201c${join.name}\u201d`);
      this.router.navigate(['/lists', join.listId]);
    } catch (e: any) {
      const denied = /permission|PERMISSION_DENIED|not-found|NOT_FOUND/i.test(String(e?.message ?? e));
      if (denied) this.ui.error('This QR code has expired or been revoked. Ask for a new one.');
      else this.ui.error('Could not join the list.', e);
    }
  }

  open(list: ShoppingList) {
    this.router.navigate(['/lists', list.id]);
  }

  async create() {
    const name = this.newName().trim();
    if (!name) return this.ui.toast('Give the list a name first');
    try {
      const id = await this.lists.createList(name);
      this.newName.set('');
      this.ui.dismissKeyboard();
      this.router.navigate(['/lists', id]);
    } catch (e) {
      this.ui.error('Could not create the list', e);
    }
  }

  async accept(list: ShoppingList) {
    try {
      await this.lists.acceptInvite(list);
      this.ui.toast(`Joined “${list.name}”`);
    } catch (e) {
      this.ui.error('Could not join the list', e);
    }
  }

  async decline(list: ShoppingList) {
    try {
      await this.lists.declineInvite(list);
    } catch (e) {
      this.ui.error('Could not decline the invite', e);
    }
  }

  ownerName(list: ShoppingList) {
    return list.members[list.ownerId]?.name ?? 'someone';
  }

  sharedWith(list: ShoppingList): string {
    const me = this.user()?.uid;
    const others = list.memberIds.filter((id) => id !== me).map((id) => list.members[id]?.name?.split(' ')[0] ?? 'someone');
    if (!others.length) return list.invitedEmails.length ? 'Invite pending' : 'Just you';
    return 'With ' + others.join(', ');
  }

  remaining(list: ShoppingList) {
    return Math.max(0, list.itemCount - list.doneCount);
  }

  async signOut() {
    const ok = await this.ui.confirm('Sign out?', 'Your lists stay in the cloud and come back when you sign in again.', 'Sign out');
    if (!ok) return;
    await this.reminders.cancelAll();
    await this.auth.signOut();
    this.router.navigate(['/login'], { clearHistory: true });
  }

  async about() {
    await Dialogs.alert({
      title: 'Shared Shopping',
      message: `Signed in as ${this.user()?.email}.\nVersion ${runningVersionLabel()}\n\nShare a list from its “Share” button. Items you add are remembered so you can find them again from the type-ahead.`,
      okButtonText: 'OK',
    });
  }
}
