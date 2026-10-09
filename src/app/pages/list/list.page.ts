import { Component, DestroyRef, NO_ERRORS_SCHEMA, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { NativeScriptCommonModule, RouterExtensions } from '@nativescript/angular';
import { JoinService } from '../../core/join.service';
import { ReminderService } from '../../core/reminder.service';
import { Dialogs } from '@nativescript/core';
import { AuthService } from '../../core/auth.service';
import { ListsService } from '../../core/lists.service';
import { ListItem, ShoppingList } from '../../core/models';
import { UiService } from '../../core/ui.service';
import { ItemEntryComponent, NewItem } from '../../components/item-entry/item-entry.component';
import { PageInsetsDirective } from '../../core/page-insets.directive';

@Component({
  selector: 'list-page',
  templateUrl: './list.page.html',
  styleUrls: ['./list.page.scss'],
  // NativeScriptCommonModule wires <ActionBar>/<ActionItem> to the Page – without it the Page
  // creates its own default ActionBar (showing the app name) under ours.
  imports: [PageInsetsDirective, NativeScriptCommonModule, ItemEntryComponent],
  schemas: [NO_ERRORS_SCHEMA],
})
export class ListPage {
  private readonly lists = inject(ListsService);
  private readonly auth = inject(AuthService);
  private readonly ui = inject(UiService);
  private readonly router = inject(RouterExtensions);
  private readonly join = inject(JoinService);
  private readonly reminders = inject(ReminderService);

  readonly list = signal<ShoppingList | null | undefined>(undefined);
  readonly items = signal<ListItem[]>([]);

  readonly todo = computed(() => this.items().filter((i) => !i.checked));
  readonly done = computed(() => this.items().filter((i) => i.checked));
  readonly onList = computed(() => new Set(this.todo().map((i) => i.nameLower)));
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

  /** ActionBar "Lists": switch to another list, start a new one, or join one by QR. */
  async openLists() {
    const current = this.list();
    const all = this.lists.lists();
    const NEW = '+ New list';
    const JOIN = 'Join a list (scan QR)';
    const label = (name: string, id: string) => (id === current?.id ? `\u2713 ${name}` : name);
    const choice = await Dialogs.action({
      title: 'Lists',
      cancelButtonText: 'Cancel',
      actions: [...all.map((l) => label(l.name, l.id)), NEW, JOIN],
    });
    if (choice === NEW) {
      const name = await this.ui.prompt('New list', '', 'Create');
      if (!name?.trim()) return;
      try {
        this.openList(await this.lists.createList(name));
      } catch (e) {
        this.ui.error('Could not create the list', e);
      }
    } else if (choice === JOIN) {
      const id = await this.join.scanAndJoin();
      if (id && id !== current?.id) this.openList(id);
    } else {
      const target = all.find((l) => label(l.name, l.id) === choice);
      if (target && target.id !== current?.id) this.openList(target.id);
    }
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

  settings() {
    this.router.navigate(['/settings']);
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
