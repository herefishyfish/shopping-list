import { Component, NO_ERRORS_SCHEMA, computed, inject, signal } from '@angular/core';
import { RouterExtensions } from '@nativescript/angular';
import { Dialogs } from '@nativescript/core';
import { AuthService } from '../../core/auth.service';
import { ListsService } from '../../core/lists.service';
import { ShoppingList } from '../../core/models';
import { UiService } from '../../core/ui.service';

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

  readonly user = this.auth.user;
  readonly loading = this.lists.loading;
  readonly invites = this.lists.invites;
  readonly active = this.lists.activeLists;
  readonly archived = this.lists.archivedLists;
  readonly showArchived = signal(false);
  readonly newName = signal('');
  readonly firstName = computed(() => (this.user()?.displayName ?? '').split(' ')[0]);

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
    await this.auth.signOut();
    this.router.navigate(['/login'], { clearHistory: true });
  }

  async about() {
    await Dialogs.alert({
      title: 'Shared Shopping',
      message: `Signed in as ${this.user()?.email}.\n\nShare a list from its “Share” button. Items you add are remembered so you can find them again from the type-ahead.`,
      okButtonText: 'OK',
    });
  }
}
