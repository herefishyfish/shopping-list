export interface AppUser {
  uid: string;
  displayName: string;
  email: string;
  photoUrl?: string;
}

export interface Member {
  name: string;
  email: string;
}

/** `lists/{id}` */
export interface ShoppingList {
  id: string;
  name: string;
  ownerId: string;
  /** uids that can read/write the list (used by queries + security rules). */
  memberIds: string[];
  /** Display info keyed by uid. */
  members: Record<string, Member>;
  /** Lower-cased emails of people invited but not yet joined. */
  invitedEmails: string[];
  itemCount: number;
  doneCount: number;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
}

/** `lists/{listId}/items/{id}` */
export interface ListItem {
  id: string;
  name: string;
  nameLower: string;
  quantity: string;
  checked: boolean;
  addedBy: string;
  addedByName: string;
  createdAt: number;
  checkedAt: number | null;
}

/** `users/{uid}/history/{key}` – every item the user has ever added or ticked off. */
export interface HistoryEntry {
  id: string;
  name: string;
  nameLower: string;
  count: number;
  lastUsed: number;
}
