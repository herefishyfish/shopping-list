import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { FieldValue } from '@nativescript/firebase-firestore';
import { AuthService } from './auth.service';
import { db } from './firebase';
import { HistoryService } from './history.service';
import { ListItem, ShoppingList } from './models';
import { JOIN_CODE_TTL_MS, JoinPayload, buildJoinPayload } from './qr';
import { displayName, normalizeName } from './suggest';
import { track } from './telemetry';

type Unsubscribe = () => void;

/**
 * Shopping lists live in `lists/{id}` and are shared by `memberIds`. Inviting someone adds
 * their (lower-cased) email to `invitedEmails`; when they sign in they see the invitation
 * and accepting moves them into `memberIds`. See firestore.rules for what each party may do.
 */
@Injectable({ providedIn: 'root' })
export class ListsService {
  private readonly auth = inject(AuthService);
  private readonly history = inject(HistoryService);

  private readonly _lists = signal<ShoppingList[]>([]);
  private readonly _invites = signal<ShoppingList[]>([]);
  private readonly _loading = signal(true);

  readonly loading = this._loading.asReadonly();
  readonly invites = this._invites.asReadonly();
  readonly activeLists = computed(() => this._lists().filter((l) => !l.archived));
  readonly archivedLists = computed(() => this._lists().filter((l) => l.archived));

  constructor() {
    let subs: Unsubscribe[] = [];
    effect(() => {
      const user = this.auth.user();
      subs.forEach((u) => u());
      subs = [];
      this._lists.set([]);
      this._invites.set([]);
      if (!user) return;

      this._loading.set(true);
      subs.push(
        db()
          .collection('lists')
          .where('memberIds', 'array-contains', user.uid)
          .onSnapshot(
            (snap) => {
              const lists = snap.docs.map((d) => toList(d.id, d.data()));
              lists.sort((a, b) => b.updatedAt - a.updatedAt);
              this._lists.set(lists);
              this._loading.set(false);
            },
            (err) => {
              console.error('[lists] listener failed', err);
              this._loading.set(false);
            },
          ),
      );
      if (user.email) {
        subs.push(
          db()
            .collection('lists')
            .where('invitedEmails', 'array-contains', user.email.toLowerCase())
            .onSnapshot(
              (snap) => this._invites.set(snap.docs.map((d) => toList(d.id, d.data()))),
              (err) => console.error('[invites] listener failed', err),
            ),
        );
      }
    });
  }

  // ---------------------------------------------------------------- lists

  async createList(name: string): Promise<string> {
    const me = this.auth.user()!;
    const now = Date.now();
    const ref = db().collection('lists').doc();
    await ref.set({
      name: displayName(name) || 'Shopping',
      ownerId: me.uid,
      memberIds: [me.uid],
      members: { [me.uid]: { name: me.displayName, email: me.email.toLowerCase() } },
      invitedEmails: [],
      itemCount: 0,
      doneCount: 0,
      archived: false,
      createdAt: now,
      updatedAt: now,
    });
    track('list_created');
    return ref.id;
  }

  watchList(id: string, next: (list: ShoppingList | null) => void): Unsubscribe {
    return db()
      .collection('lists')
      .doc(id)
      .onSnapshot(
        (snap) => next(snap.exists ? toList(snap.id, snap.data()) : null),
        (err) => {
          console.error('[list] listener failed', err);
          next(null);
        },
      );
  }

  rename(list: ShoppingList, name: string) {
    return this.touch(list.id, { name: displayName(name) || list.name });
  }

  setArchived(list: ShoppingList, archived: boolean) {
    track('list_archived', { archived });
    return this.touch(list.id, { archived });
  }

  /** Owner only: deletes the list and all of its items. */
  async deleteList(list: ShoppingList) {
    const listRef = db().collection('lists').doc(list.id);
    const items = await listRef.collection('items').get();
    // Firestore batches are capped at 500 writes.
    for (let i = 0; i < items.docs.length; i += 450) {
      const batch = db().batch();
      items.docs.slice(i, i + 450).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
    await this.revokeJoinCodes(list);
    await listRef.delete();
    track('list_deleted', { members: list.memberIds.length });
  }

  // ---------------------------------------------------------------- sharing

  invite(list: ShoppingList, email: string) {
    track('share_invite_sent');
    return this.touch(list.id, { invitedEmails: FieldValue.arrayUnion([email.trim().toLowerCase()]) });
  }

  cancelInvite(list: ShoppingList, email: string) {
    return this.touch(list.id, { invitedEmails: FieldValue.arrayRemove([email]) });
  }

  removeMember(list: ShoppingList, uid: string) {
    return this.touch(list.id, {
      memberIds: FieldValue.arrayRemove([uid]),
      [`members.${uid}`]: FieldValue.delete(),
    });
  }

  leave(list: ShoppingList) {
    track('list_left');
    return this.removeMember(list, this.auth.uid);
  }

  acceptInvite(list: ShoppingList) {
    track('list_joined', { method: 'email' });
    const me = this.auth.user()!;
    const email = me.email.toLowerCase();
    return this.touch(list.id, {
      memberIds: FieldValue.arrayUnion([me.uid]),
      [`members.${me.uid}`]: { name: me.displayName, email },
      invitedEmails: FieldValue.arrayRemove([email]),
    });
  }

  declineInvite(list: ShoppingList) {
    return this.touch(list.id, { invitedEmails: FieldValue.arrayRemove([this.auth.user()!.email.toLowerCase()]) });
  }

  // ---------------------------------------------------------------- QR-code joining

  /**
   * Creates a fresh join code (valid for 24h) and returns the payload to render as a QR code.
   * The code is a Firestore auto-id (~120 bits), so it can't be guessed.
   */
  async createJoinPayload(list: ShoppingList): Promise<{ payload: string; expiresAt: number }> {
    const now = Date.now();
    const expiresAt = now + JOIN_CODE_TTL_MS;
    const ref = db().collection('lists').doc(list.id).collection('joinCodes').doc();
    await ref.set({ createdBy: this.auth.uid, createdAt: now, expiresAt });
    track('share_qr_shown');
    return { payload: buildJoinPayload({ listId: list.id, code: ref.id, name: list.name }), expiresAt };
  }

  /** Invalidates every QR code ever shown for this list. */
  async revokeJoinCodes(list: ShoppingList): Promise<number> {
    const codes = await db().collection('lists').doc(list.id).collection('joinCodes').get();
    for (let i = 0; i < codes.docs.length; i += 450) {
      const batch = db().batch();
      codes.docs.slice(i, i + 450).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
    track('join_codes_revoked', { count: codes.docs.length });
    return codes.docs.length;
  }

  /**
   * Adds the current user to a list using a scanned join code. The security rules check the
   * code exists under the list and hasn't expired; we can't read the list until this succeeds.
   */
  async joinWithCode(join: JoinPayload) {
    const me = this.auth.user()!;
    await this.touch(join.listId, {
      memberIds: FieldValue.arrayUnion([me.uid]),
      [`members.${me.uid}`]: { name: me.displayName, email: me.email.toLowerCase() },
      joinCode: join.code,
    });
    track('list_joined', { method: 'qr' });
  }

  // ---------------------------------------------------------------- items

  watchItems(listId: string, next: (items: ListItem[]) => void): Unsubscribe {
    return db()
      .collection('lists')
      .doc(listId)
      .collection('items')
      .onSnapshot(
        (snap) => {
          const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ListItem);
          // Unticked first (newest at the bottom like a paper list), ticked items after.
          items.sort((a, b) => Number(a.checked) - Number(b.checked) || (a.checked ? (b.checkedAt ?? 0) - (a.checkedAt ?? 0) : a.createdAt - b.createdAt));
          next(items);
        },
        (err) => console.error('[items] listener failed', err),
      );
  }

  async addItem(list: ShoppingList, rawName: string, quantity = '', source: 'typed' | 'suggestion' | 'buy_again' = 'typed') {
    const name = displayName(rawName);
    if (!name) return;
    const me = this.auth.user()!;
    const listRef = db().collection('lists').doc(list.id);
    const batch = db().batch();
    batch.set(listRef.collection('items').doc(), {
      name,
      nameLower: normalizeName(name),
      quantity: quantity.trim(),
      checked: false,
      addedBy: me.uid,
      addedByName: me.displayName,
      createdAt: Date.now(),
      checkedAt: null,
    });
    batch.update(listRef, { itemCount: FieldValue.increment(1), updatedAt: Date.now() });
    await batch.commit();
    track('item_added', { source, shared: list.memberIds.length > 1 });
    // History is best-effort; never block adding the item on it.
    this.history.record(name).catch((e) => console.warn('[history] record failed', e));
  }

  async setChecked(list: ShoppingList, item: ListItem, checked: boolean) {
    if (item.checked === checked) return;
    const listRef = db().collection('lists').doc(list.id);
    const batch = db().batch();
    batch.update(listRef.collection('items').doc(item.id), { checked, checkedAt: checked ? Date.now() : null });
    batch.update(listRef, { doneCount: FieldValue.increment(checked ? 1 : -1), updatedAt: Date.now() });
    await batch.commit();
    if (checked) track('item_checked', { shared: list.memberIds.length > 1 });
    // Ticking off something a housemate added still teaches *your* type-ahead about it.
    if (checked && item.addedBy !== this.auth.uid) {
      this.history.record(item.name).catch(() => {});
    }
  }

  async updateQuantity(list: ShoppingList, item: ListItem, quantity: string) {
    await db().collection('lists').doc(list.id).collection('items').doc(item.id).update({ quantity: quantity.trim() });
  }

  async deleteItem(list: ShoppingList, item: ListItem) {
    const listRef = db().collection('lists').doc(list.id);
    const batch = db().batch();
    batch.delete(listRef.collection('items').doc(item.id));
    batch.update(listRef, {
      itemCount: FieldValue.increment(-1),
      doneCount: FieldValue.increment(item.checked ? -1 : 0),
      updatedAt: Date.now(),
    });
    await batch.commit();
  }

  /** Re-adds a deleted item (used by the snackbar "Undo"). */
  async restoreItem(list: ShoppingList, item: ListItem) {
    const listRef = db().collection('lists').doc(list.id);
    const { id, ...data } = item;
    const batch = db().batch();
    batch.set(listRef.collection('items').doc(id), data);
    batch.update(listRef, {
      itemCount: FieldValue.increment(1),
      doneCount: FieldValue.increment(item.checked ? 1 : 0),
      updatedAt: Date.now(),
    });
    await batch.commit();
  }

  async clearChecked(list: ShoppingList, items: ListItem[]) {
    const done = items.filter((i) => i.checked);
    if (!done.length) return;
    track('items_cleared', { count: done.length });
    const listRef = db().collection('lists').doc(list.id);
    for (let i = 0; i < done.length; i += 450) {
      const chunk = done.slice(i, i + 450);
      const batch = db().batch();
      chunk.forEach((item) => batch.delete(listRef.collection('items').doc(item.id)));
      batch.update(listRef, {
        itemCount: FieldValue.increment(-chunk.length),
        doneCount: FieldValue.increment(-chunk.length),
        updatedAt: Date.now(),
      });
      await batch.commit();
    }
  }

  /** Untick everything – handy for a weekly staples list. */
  async uncheckAll(list: ShoppingList, items: ListItem[]) {
    const done = items.filter((i) => i.checked);
    if (!done.length) return;
    const listRef = db().collection('lists').doc(list.id);
    const batch = db().batch();
    done.forEach((item) => batch.update(listRef.collection('items').doc(item.id), { checked: false, checkedAt: null }));
    batch.update(listRef, { doneCount: 0, updatedAt: Date.now() });
    await batch.commit();
  }

  private touch(id: string, data: Record<string, unknown>) {
    return db()
      .collection('lists')
      .doc(id)
      .update({ ...data, updatedAt: Date.now() } as any);
  }
}

function toList(id: string, d: any): ShoppingList {
  return {
    id,
    name: d?.name ?? 'Untitled',
    ownerId: d?.ownerId ?? '',
    memberIds: d?.memberIds ?? [],
    members: d?.members ?? {},
    invitedEmails: d?.invitedEmails ?? [],
    itemCount: Math.max(0, d?.itemCount ?? 0),
    doneCount: Math.max(0, d?.doneCount ?? 0),
    archived: !!d?.archived,
    createdAt: d?.createdAt ?? 0,
    updatedAt: d?.updatedAt ?? 0,
  };
}
