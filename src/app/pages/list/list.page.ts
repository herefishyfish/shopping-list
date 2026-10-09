import { Component, DestroyRef, NO_ERRORS_SCHEMA, ViewContainerRef, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { RouterExtensions } from '@nativescript/angular';
import { Dialogs } from '@nativescript/core';
import { runningVersionLabel } from '../../../ota';
import { JoinService } from '../../core/join.service';
import { ReminderService } from '../../core/reminder.service';
import { BottomSheetService } from '@nativescript-community/ui-material-bottomsheet/angular';
import { AuthService } from '../../core/auth.service';
import { ListsService } from '../../core/lists.service';
import { ListItem, ShoppingList } from '../../core/models';
import { UiService } from '../../core/ui.service';
import { ItemEntryComponent, NewItem } from '../../components/item-entry/item-entry.component';
import { ShareSheet } from '../../components/share-sheet/share-sheet';

@Component({
  selector: 'list-page',
  templateUrl: './list.page.html',
  styleUrls: ['./list.page.scss'],
  imports: [ItemEntryComponent],
  schemas: [NO_ERRORS_SCHEMA],
})
export class ListPage {
  private readonly lists = inject(ListsService);
  private readonly auth = inject(AuthService);
  private readonly ui = inject(UiService);
  private readonly router = inject(RouterExtensions);
  private readonly sheets = inject(BottomSheetService);
  private readonly vcRef = inject(ViewContainerRef);
  private readonly join = inject(JoinService);
  private readonly reminders = inject(ReminderService);

  readonly list = signal<ShoppingList | null | undefined>(undefined);
  readonly items = signal<ListItem[]>([]);

  readonly todo = computed(() => this.items().filter((i) => !i.checked));
  readonly done = computed(() => this.items().filter((i) => i.checked));
  readonly onList = computed(() => new Set(this.todo().map((i) => i.nameLower)));
  readonly isOwner = computed(() => this.list()?.ownerId === this.auth.user()?.uid);
  readonly shared = computed(() => (this.list()?.memberIds.length ?? 0) > 1);
  /** Invitations to *other* lists (e.g. a new household). */
  readonly invites = computed(() => this.lists.invites().filter((l) => l.id !== this.list()?.id));
  readonly weekLabel = computed(() => {
    const list = this.list();
    if (!list) return '';
    const started = `This week · started ${shortDate(list.weekStartedAt)}`;
    return list.lastOrderAt ? `${started} · last order ${shortDate(list.lastOrderAt)}${list.lastOrderByName ? ' by ' + list.lastOrderByName.split(' ')[0] : ''}` : started;
  });

  constructor() {
    const id = inject(ActivatedRoute).snapshot.paramMap.get('id')!;
    this.lists.setCurrent(id);
    this.reminders.ensureScheduled();
    const unsubList = this.lists.watchList(id, (list) => {
      this.list.set(list);
      // Deleted, or we were removed from it (possibly while the app was closed).
      if (!list) {
        this.ui.toast('This list is no longer available');
        this.goToStart();
      }
    });
    const unsubItems = this.lists.watchItems(id, (items) => this.items.set(items));
    inject(DestroyRef).onDestroy(() => {
      unsubList();
      unsubItems();
    });
  }

  async add(item: NewItem) {
    const list = this.list();
    if (!list) return;
    try {
      await this.lists.addItem(list, item.name, item.quantity, item.source);
    } catch (e) {
      this.ui.error('Could not add the item', e);
    }
  }

  async toggle(item: ListItem, checked: boolean) {
    const list = this.list();
    if (!list || item.checked === checked) return;
    try {
      await this.lists.setChecked(list, item, checked);
    } catch (e) {
      this.ui.error('Could not update the item', e);
    }
  }

  async remove(item: ListItem) {
    const list = this.list();
    if (!list) return;
    try {
      await this.lists.deleteItem(list, item);
      if (await this.ui.withAction(`Removed “${item.name}”`, 'Undo')) {
        await this.lists.restoreItem(list, item);
      }
    } catch (e) {
      this.ui.error('Could not remove the item', e);
    }
  }

  async editQuantity(item: ListItem) {
    const list = this.list();
    if (!list) return;
    const qty = await this.ui.prompt(`Quantity for ${item.name}`, item.quantity);
    if (qty === null) return;
    await this.lists.updateQuantity(list, item, qty).catch((e) => this.ui.error('Could not update the quantity', e));
  }

  share() {
    const list = this.list();
    if (!list) return;
    this.sheets.show(ShareSheet, {
      viewContainerRef: this.vcRef,
      context: { listId: list.id },
      dismissOnBackgroundTap: true,
    });
  }

  /** Close off the week: ticked (ordered) items are cleared, unticked ones carry over. */
  async startNextWeek() {
    const list = this.list();
    const done = this.done().length;
    if (!list || !done) return;
    const left = this.todo().length;
    const message =
      `${done} ordered item${done === 1 ? '' : 's'} will be cleared` +
      (left ? ` and ${left} unticked item${left === 1 ? '' : 's'} carried over to next week.` : '.') +
      ' Everything stays in the type-ahead for next time.';
    if (!(await this.ui.confirm('Start next week?', message, 'Start next week'))) return;
    try {
      await this.ui.busy('Starting next week\u2026', () => this.lists.startNextWeek(list, this.items()));
      this.ui.toast('Fresh list for next week \u2728');
    } catch (e) {
      this.ui.error('Could not start next week', e);
    }
  }

  async acceptInvite(invite: ShoppingList) {
    const id = await this.join.acceptInvite(invite);
    if (id) this.openList(id);
  }

  declineInvite(invite: ShoppingList) {
    return this.join.declineInvite(invite);
  }

  async menu() {
    const list = this.list();
    if (!list) return;
    const others = this.lists.lists().filter((l) => l.id !== list.id);
    const actions = [
      'Rename list',
      'Untick everything',
      ...(others.length ? ['Switch list'] : []),
      'Join another list (scan QR)',
      'Settings',
      'About',
      this.isOwner() ? 'Delete list' : 'Leave list',
      'Sign out',
    ];
    const choice = await Dialogs.action({ title: list.name, cancelButtonText: 'Cancel', actions });
    try {
      switch (choice) {
        case 'Rename list': {
          const name = await this.ui.prompt('Rename list', list.name);
          if (name?.trim()) await this.lists.rename(list, name);
          break;
        }
        case 'Untick everything':
          await this.lists.uncheckAll(list, this.items());
          break;
        case 'Switch list': {
          const pick = await Dialogs.action({ title: 'Switch list', cancelButtonText: 'Cancel', actions: others.map((l) => l.name) });
          const target = others.find((l) => l.name === pick);
          if (target) this.openList(target.id);
          break;
        }
        case 'Join another list (scan QR)': {
          const id = await this.join.scanAndJoin();
          if (id && id !== list.id) this.openList(id);
          break;
        }
        case 'Settings':
          this.router.navigate(['/settings']);
          break;
        case 'About':
          await Dialogs.alert({
            title: 'Shared Shopping',
            message: `Signed in as ${this.auth.user()?.email}.\nVersion ${runningVersionLabel()}\n\nAdd things during the week, tick them off as you order, then \u201cStart next week\u201d. Share the list from the Share button.`,
            okButtonText: 'OK',
          });
          break;
        case 'Delete list':
          if (await this.ui.confirm('Delete list?', `\u201c${list.name}\u201d and its order history will be deleted for everyone it is shared with.`, 'Delete')) {
            await this.ui.busy('Deleting\u2026', () => this.lists.deleteList(list));
            this.goToStart();
          }
          break;
        case 'Leave list':
          if (await this.ui.confirm('Leave list?', 'You will lose access until someone invites you again.', 'Leave')) {
            await this.lists.leave(list);
            this.goToStart();
          }
          break;
        case 'Sign out':
          if (await this.ui.confirm('Sign out?', 'Your list stays in the cloud and comes back when you sign in again.', 'Sign out')) {
            await this.reminders.cancelAll();
            await this.auth.signOut();
            this.router.navigate(['/login'], { clearHistory: true });
          }
          break;
      }
    } catch (e) {
      this.ui.error('Something went wrong', e);
    }
  }

  private openList(id: string) {
    this.router.navigate(['/list', id], { clearHistory: true });
  }

  private goToStart() {
    this.router.navigate(['/start'], { clearHistory: true });
  }
}

function shortDate(ms: number) {
  return ms ? new Date(ms).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) : '';
}
