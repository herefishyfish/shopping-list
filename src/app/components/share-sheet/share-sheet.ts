import { Component, DestroyRef, NO_ERRORS_SCHEMA, computed, inject, signal } from '@angular/core';
import { BottomSheetParams } from '@nativescript-community/ui-material-bottomsheet/angular';
import { AuthService } from '../../core/auth.service';
import { ListsService } from '../../core/lists.service';
import { ShoppingList } from '../../core/models';
import { UiService } from '../../core/ui.service';
import { isEmail } from '../../core/suggest';
import { QrCodeComponent } from '../qr-code/qr-code.component';
import { AndroidInsetsDirective } from '../../core/android-insets.directive';

/** Bottom sheet for inviting a partner / housemates to a list and managing who has access. */
@Component({
  selector: 'share-sheet',
  templateUrl: './share-sheet.html',
  styleUrls: ['./share-sheet.scss'],
  imports: [QrCodeComponent, AndroidInsetsDirective],
  schemas: [NO_ERRORS_SCHEMA],
})
export class ShareSheet {
  private readonly params = inject(BottomSheetParams);
  private readonly lists = inject(ListsService);
  private readonly auth = inject(AuthService);
  private readonly ui = inject(UiService);

  readonly list = signal<ShoppingList | null>(null);
  readonly mode = signal<'email' | 'qr'>('email');
  readonly qrPayload = signal('');
  readonly qrExpiresAt = signal(0);
  readonly qrBusy = signal(false);
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

  async showQr(forceNew = false) {
    this.mode.set('qr');
    this.ui.dismissKeyboard();
    const list = this.list();
    if (!list || this.qrBusy()) return;
    // Re-use the code from this session unless it's about to expire.
    if (!forceNew && this.qrPayload() && this.qrExpiresAt() - Date.now() > 10 * 60 * 1000) return;
    this.qrBusy.set(true);
    try {
      const { payload, expiresAt } = await this.lists.createJoinPayload(list);
      this.qrPayload.set(payload);
      this.qrExpiresAt.set(expiresAt);
    } catch (e) {
      this.ui.error('Could not create a QR code', e);
    } finally {
      this.qrBusy.set(false);
    }
  }

  async revokeQr() {
    const list = this.list();
    if (!list) return;
    if (!(await this.ui.confirm('Revoke QR codes?', 'Every QR code shown for this list stops working. People who already joined keep access.', 'Revoke'))) return;
    try {
      await this.lists.revokeJoinCodes(list);
      this.qrPayload.set('');
      this.qrExpiresAt.set(0);
      this.ui.toast('QR codes revoked');
      this.mode.set('email');
    } catch (e) {
      this.ui.error('Could not revoke the codes', e);
    }
  }

  expiryLabel() {
    const d = new Date(this.qrExpiresAt());
    const sameDay = d.toDateString() === new Date().toDateString();
    const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    return sameDay ? `today at ${time}` : `tomorrow at ${time}`;
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
