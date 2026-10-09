import { Component, NO_ERRORS_SCHEMA, computed, inject, input, output, signal } from '@angular/core';
import { environment } from '../../../environments/environment';
import { HistoryService } from '../../core/history.service';
import { HistoryEntry } from '../../core/models';
import { rankSuggestions } from '../../core/suggest';

export interface NewItem {
  name: string;
  quantity: string;
}

/**
 * "Add item" bar with a search-ahead over everything you've put on any previous list.
 * With nothing typed it offers your most frequent items as one-tap "buy again" chips.
 */
@Component({
  selector: 'item-entry',
  templateUrl: './item-entry.component.html',
  styleUrls: ['./item-entry.component.scss'],
  schemas: [NO_ERRORS_SCHEMA],
})
export class ItemEntryComponent {
  private readonly history = inject(HistoryService);

  /** Normalised names already (unticked) on the list – never suggested again. */
  readonly exclude = input<ReadonlySet<string>>(new Set());
  readonly added = output<NewItem>();

  readonly query = signal('');
  readonly qty = signal('');

  readonly matches = computed(() => rankSuggestions(this.history.entries(), this.query(), this.exclude(), environment.maxSuggestions));
  readonly buyAgain = computed(() => (this.query().trim() ? [] : rankSuggestions(this.history.entries(), '', this.exclude(), 8)));

  submit() {
    const name = this.query().trim();
    if (!name) return;
    this.emit(name);
  }

  pick(entry: HistoryEntry) {
    this.emit(entry.name);
  }

  private emit(name: string) {
    this.added.emit({ name, quantity: this.qty() });
    this.query.set('');
    this.qty.set('');
  }
}
