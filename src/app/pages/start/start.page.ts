import { Component, NO_ERRORS_SCHEMA, computed, effect, inject, signal } from '@angular/core';
import { NativeScriptCommonModule, RouterExtensions } from '@nativescript/angular';
import { AuthService } from '../../core/auth.service';
import { JoinService } from '../../core/join.service';
import { ListsService } from '../../core/lists.service';
import { ShoppingList } from '../../core/models';
import { ReminderService } from '../../core/reminder.service';
import { UiService } from '../../core/ui.service';

/**
 * Entry point after sign-in. If you're already on a household list it goes straight there;
 * otherwise it's a one-time setup: create your list, accept an invite or scan a housemate's QR.
 */
@Component({
  selector: 'start-page',
  templateUrl: './start.page.html',
  styleUrls: ['./start.page.scss'],
  imports: [NativeScriptCommonModule],
  schemas: [NO_ERRORS_SCHEMA],
})
export class StartPage {
  private readonly auth = inject(AuthService);
  private readonly lists = inject(ListsService);
  private readonly join = inject(JoinService);
  private readonly ui = inject(UiService);
  private readonly router = inject(RouterExtensions);
  private readonly reminders = inject(ReminderService);

  readonly loading = this.lists.loading;
  readonly invites = this.lists.invites;
  readonly listName = signal('Our shopping');
  readonly firstName = computed(() => (this.auth.user()?.displayName ?? '').split(' ')[0]);

  private navigated = false;

  constructor() {
    this.reminders.ensureScheduled();
    // As soon as we know which list this device uses, open it.
    effect(() => {
      const current = this.lists.currentList();
      if (current && !this.navigated) this.open(current.id);
    });
  }

  async create() {
    const name = this.listName().trim() || 'Our shopping';
    try {
      const id = await this.lists.createList(name);
      this.ui.dismissKeyboard();
      this.open(id);
    } catch (e) {
      this.ui.error('Could not create the list', e);
    }
  }

  async scan() {
    const id = await this.join.scanAndJoin();
    if (id) this.open(id);
  }

  async accept(list: ShoppingList) {
    const id = await this.join.acceptInvite(list);
    if (id) this.open(id);
  }

  decline(list: ShoppingList) {
    return this.join.declineInvite(list);
  }

  ownerName(list: ShoppingList) {
    return list.members[list.ownerId]?.name ?? 'someone';
  }

  async signOut() {
    await this.reminders.cancelAll();
    await this.auth.signOut();
    this.router.navigate(['/login'], { clearHistory: true });
  }

  private open(id: string) {
    this.navigated = true;
    this.router.navigate(['/list', id], { clearHistory: true });
  }
}
