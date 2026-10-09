import { Component, DestroyRef, NO_ERRORS_SCHEMA, computed, inject, signal } from '@angular/core';
import { BottomSheetParams } from '@nativescript-community/ui-material-bottomsheet/angular';
import { AuthService } from '../../core/auth.service';
import { ListsService } from '../../core/lists.service';
import { ShoppingList } from '../../core/models';
import { UiService } from '../../core/ui.service';
import { isEmail } from '../../core/suggest';

/** Bottom sheet for inviting a partner / housemates to a list and managing who has access. */
@Component({
  selector: 'share-sheet',
  templateUrl: './share-sheet.html',
  styleUrls: ['./share-sheet.scss'],
  schemas: [NO_ERRORS_SCHEMA],
})
export class ShareSheet {
  private readonly params = inject(BottomSheetParams);
  private readonly lists = inject(ListsService);
  private readonly auth = inject(AuthService);
  private readonly ui = inject(UiService);

  readonly list = signal<ShoppingList | null>(null);
  readonly email = signal('');
  readonly error = signal('');
  readonly me = computed(() => this.auth.user()?.uid);
  readonly isOwner = computed(() => this.list()?.ownerId === this.me());
  readonly members = computed(() => {
    const list = this.list();
    if (!list) return [];
    return list.memberIds.map((uid) => ({
      uid,
      name: list.members[uid]?.name ?? 'Unknown',
      email: list.members[uid]?.email ?? '',
      owner: uid === list.ownerId,
    }));
  });

  constructor() {
    const unsub = this.lists.watchList(this.params.context.listId, (l) => this.list.set(l));
    inject(DestroyRef).onDestroy(unsub);
  }

  initial(name: string) {
    return (name || '?').trim().charAt(0).toUpperCase();
  }

  async invite() {
    const list = this.list();
    const email = this.email().trim().toLowerCase();
    this.error.set('');
    if (!list) return;
    if (!isEmail(email)) return this.error.set('That doesn’t look like an email address.');
    if (this.members().some((m) => m.email === email)) return this.error.set('They already have access.');
    if (list.invitedEmails.includes(email)) return this.error.set('Already invited.');
    try {
      await this.lists.invite(list, email);
      this.email.set('');
      this.ui.toast(`Invited ${email}`);
    } catch (e) {
      this.ui.error('Could not send the invite', e);
    }
  }

  async cancelInvite(email: string) {
    const list = this.list();
    if (list) await this.lists.cancelInvite(list, email).catch((e) => this.ui.error('Could not cancel the invite', e));
  }

  async removeMember(uid: string, name: string) {
    const list = this.list();
    if (!list) return;
    if (!(await this.ui.confirm(`Remove ${name}?`, 'They will no longer see this list.', 'Remove'))) return;
    await this.lists.removeMember(list, uid).catch((e) => this.ui.error('Could not remove them', e));
  }

  close() {
    this.ui.dismissKeyboard();
    this.params.closeCallback();
  }
}
