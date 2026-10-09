import { Component, DestroyRef, NO_ERRORS_SCHEMA, ViewContainerRef, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { RouterExtensions } from '@nativescript/angular';
import { Dialogs } from '@nativescript/core';
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

  readonly list = signal<ShoppingList | null | undefined>(undefined);
  readonly items = signal<ListItem[]>([]);

  readonly todo = computed(() => this.items().filter((i) => !i.checked));
  readonly done = computed(() => this.items().filter((i) => i.checked));
  readonly onList = computed(() => new Set(this.todo().map((i) => i.nameLower)));
  readonly isOwner = computed(() => this.list()?.ownerId === this.auth.user()?.uid);
  readonly shared = computed(() => (this.list()?.memberIds.length ?? 0) > 1);

  constructor() {
    const id = inject(ActivatedRoute).snapshot.paramMap.get('id')!;
    const unsubList = this.lists.watchList(id, (list) => {
      const wasLoaded = this.list() !== undefined;
      this.list.set(list);
      // The list was deleted, or we were removed from it, while it was open.
      if (!list && wasLoaded) {
        this.ui.toast('This list is no longer available');
        this.router.back();
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

  async menu() {
    const list = this.list();
    if (!list) return;
    const actions = ['Rename', 'Untick everything', 'Clear ticked items', list.archived ? 'Restore from archive' : 'Archive list', this.isOwner() ? 'Delete list' : 'Leave list'];
    const choice = await Dialogs.action({ title: list.name, cancelButtonText: 'Cancel', actions });
    try {
      switch (choice) {
        case 'Rename': {
          const name = await this.ui.prompt('Rename list', list.name);
          if (name?.trim()) await this.lists.rename(list, name);
          break;
        }
        case 'Untick everything':
          await this.lists.uncheckAll(list, this.items());
          break;
        case 'Clear ticked items':
          if (this.done().length && (await this.ui.confirm('Clear ticked items?', `Removes ${this.done().length} ticked item(s). They stay in your type-ahead history.`, 'Clear'))) {
            await this.lists.clearChecked(list, this.items());
          }
          break;
        case 'Archive list':
        case 'Restore from archive':
          await this.lists.setArchived(list, !list.archived);
          if (!list.archived) this.router.back();
          break;
        case 'Delete list':
          if (await this.ui.confirm('Delete list?', `“${list.name}” will be deleted for everyone it is shared with.`, 'Delete')) {
            await this.ui.busy('Deleting…', () => this.lists.deleteList(list));
            this.router.back();
          }
          break;
        case 'Leave list':
          if (await this.ui.confirm('Leave list?', 'You will lose access until someone invites you again.', 'Leave')) {
            await this.lists.leave(list);
            this.router.back();
          }
          break;
      }
    } catch (e) {
      this.ui.error('Something went wrong', e);
    }
  }
}
