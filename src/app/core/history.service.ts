import { Injectable, effect, inject, signal } from '@angular/core';
import { FieldValue } from '@nativescript/firebase-firestore';
import { AuthService } from './auth.service';
import { MERGE, db } from './firebase';
import { HistoryEntry } from './models';
import { historyKey, normalizeName } from './suggest';

/**
 * Every item a user adds (or ticks off from a shared list) is upserted into
 * `users/{uid}/history/{normalised-name}` with a purchase count. The whole collection is
 * small (one doc per distinct product), so it is kept in memory via a live listener and
 * the type-ahead filters it locally - instant and works offline.
 */
@Injectable({ providedIn: 'root' })
export class HistoryService {
  private readonly auth = inject(AuthService);
  private readonly _entries = signal<HistoryEntry[]>([]);
  readonly entries = this._entries.asReadonly();

  constructor() {
    let unsub: (() => void) | undefined;
    effect(() => {
      const user = this.auth.user();
      unsub?.();
      unsub = undefined;
      this._entries.set([]);
      if (!user) return;
      unsub = db()
        .collection('users')
        .doc(user.uid)
        .collection('history')
        .orderBy('count', 'desc')
        .limit(1000)
        .onSnapshot(
          (snap) => this._entries.set(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as HistoryEntry)),
          (err) => console.error('[history] listener failed', err),
        );
    });
  }

  record(name: string): Promise<void> {
    const uid = this.auth.uid;
    return db()
      .collection('users')
      .doc(uid)
      .collection('history')
      .doc(historyKey(name))
      .set({ name, nameLower: normalizeName(name), count: FieldValue.increment(1), lastUsed: Date.now() }, MERGE);
  }

  forget(entry: HistoryEntry): Promise<void> {
    return db().collection('users').doc(this.auth.uid).collection('history').doc(entry.id).delete();
  }
}
