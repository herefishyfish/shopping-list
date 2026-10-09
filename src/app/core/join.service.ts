import { Injectable, inject } from '@angular/core';
import { ScannerService } from '../components/scanner/scanner.service';
import { ListsService } from './lists.service';
import { ShoppingList } from './models';
import { parseJoinPayload } from './qr';
import { UiService } from './ui.service';

/** Joining a household list – by scanning a housemate's QR code or accepting an email invite. */
@Injectable({ providedIn: 'root' })
export class JoinService {
  private readonly lists = inject(ListsService);
  private readonly scanner = inject(ScannerService);
  private readonly ui = inject(UiService);

  /** Scan a list's QR code (ML Kit) and join it. Resolves with the list id, or null. */
  async scanAndJoin(): Promise<string | null> {
    const value = await this.scanner.scan();
    if (!value) return null;
    const join = parseJoinPayload(value);
    if (!join) {
      this.ui.error('That QR code isn’t a shopping-list invite.');
      return null;
    }
    if (this.lists.lists().some((l) => l.id === join.listId)) {
      this.lists.setCurrent(join.listId);
      return join.listId;
    }
    if (!(await this.confirmSwitch(join.name))) return null;
    try {
      await this.ui.busy('Joining…', () => this.lists.joinWithCode(join));
      this.ui.toast(`Joined “${join.name}”`);
      return join.listId;
    } catch (e: any) {
      const denied = /permission|PERMISSION_DENIED|not-found|NOT_FOUND/i.test(String(e?.message ?? e));
      if (denied) this.ui.error('This QR code has expired or been revoked. Ask for a new one.');
      else this.ui.error('Could not join the list.', e);
      return null;
    }
  }

  async acceptInvite(list: ShoppingList): Promise<string | null> {
    if (!(await this.confirmSwitch(list.name))) return null;
    try {
      await this.lists.acceptInvite(list);
      this.ui.toast(`Joined “${list.name}”`);
      return list.id;
    } catch (e) {
      this.ui.error('Could not join the list', e);
      return null;
    }
  }

  async declineInvite(list: ShoppingList) {
    await this.lists.declineInvite(list).catch((e) => this.ui.error('Could not decline the invite', e));
  }

  private confirmSwitch(name: string) {
    const current = this.lists.currentList();
    const message = current
      ? `Switch to “${name}”? You'll stay a member of “${current.name}” too. Everyone on the new list will see your name and email.`
      : `Join “${name}”? Everyone on it will see your name and email.`;
    return this.ui.confirm('Join list?', message, 'Join');
  }
}
