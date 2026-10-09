// Security-rule tests for firestore.rules, run against the Firestore emulator:
//   cd rules-tests && npm install && npm test
import { after, before, beforeEach, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { arrayRemove, arrayUnion, collection, deleteDoc, deleteField, doc, getDoc, getDocs, query, setDoc, updateDoc, where, writeBatch, increment } from 'firebase/firestore';

let env;
const ALICE = { uid: 'alice', email: 'alice@example.com' };
const BOB = { uid: 'bob', email: 'Bob@Example.com' }; // mixed case on purpose
const EVE = { uid: 'eve', email: 'eve@example.com' };

const as = (u) => env.authenticatedContext(u.uid, { email: u.email }).firestore();

const newList = (owner) => ({
  name: 'Weekly shop',
  ownerId: owner.uid,
  memberIds: [owner.uid],
  members: { [owner.uid]: { name: owner.uid, email: owner.email.toLowerCase() } },
  invitedEmails: [],
  itemCount: 0,
  doneCount: 0,
  archived: false,
  createdAt: 1,
  updatedAt: 1,
});

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-shopping-list',
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') },
  });
});
after(() => env?.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'lists/l1'), { ...newList(ALICE), invitedEmails: ['bob@example.com'] });
    await setDoc(doc(ctx.firestore(), 'lists/l1/items/i1'), { name: 'Milk', checked: false });
  });
});

test('owner can create a list only for themselves', async () => {
  await assertSucceeds(setDoc(doc(as(ALICE), 'lists/new'), newList(ALICE)));
  await assertFails(setDoc(doc(as(EVE), 'lists/new2'), newList(ALICE)));
  await assertFails(setDoc(doc(as(EVE), 'lists/new3'), { ...newList(EVE), memberIds: ['eve', 'alice'] }));
});

test('members and invitees can read; strangers cannot', async () => {
  await assertSucceeds(getDoc(doc(as(ALICE), 'lists/l1')));
  await assertSucceeds(getDoc(doc(as(BOB), 'lists/l1')));
  await assertFails(getDoc(doc(as(EVE), 'lists/l1')));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'lists/l1')));
});

test('the app queries are allowed', async () => {
  await assertSucceeds(getDocs(query(collection(as(ALICE), 'lists'), where('memberIds', 'array-contains', 'alice'))));
  await assertSucceeds(getDocs(query(collection(as(BOB), 'lists'), where('invitedEmails', 'array-contains', 'bob@example.com'))));
  await assertFails(getDocs(query(collection(as(EVE), 'lists'), where('invitedEmails', 'array-contains', 'bob@example.com'))));
  await assertFails(getDocs(collection(as(EVE), 'lists')));
});

test('invitee can accept', async () => {
  const db = as(BOB);
  await assertSucceeds(
    updateDoc(doc(db, 'lists/l1'), {
      memberIds: arrayUnion('bob'),
      'members.bob': { name: 'Bob', email: 'bob@example.com' },
      invitedEmails: arrayRemove('bob@example.com'),
      updatedAt: 2,
    }),
  );
  await assertSucceeds(getDoc(doc(db, 'lists/l1/items/i1')));
});

test('invitee can decline', async () => {
  await assertSucceeds(updateDoc(doc(as(BOB), 'lists/l1'), { invitedEmails: arrayRemove('bob@example.com'), updatedAt: 2 }));
});

test('invitee cannot do anything else', async () => {
  const db = as(BOB);
  await assertFails(updateDoc(doc(db, 'lists/l1'), { name: 'Hacked' }));
  await assertFails(updateDoc(doc(db, 'lists/l1'), { memberIds: arrayUnion('bob', 'eve'), invitedEmails: arrayRemove('bob@example.com') }));
  await assertFails(updateDoc(doc(db, 'lists/l1'), { memberIds: arrayUnion('bob') })); // must consume the invite
  await assertFails(updateDoc(doc(db, 'lists/l1'), { memberIds: arrayUnion('bob'), invitedEmails: arrayRemove('bob@example.com'), ownerId: 'bob' }));
  await assertFails(getDoc(doc(db, 'lists/l1/items/i1')));
  await assertFails(deleteDoc(doc(db, 'lists/l1')));
});

test('strangers cannot join or invite themselves', async () => {
  const db = as(EVE);
  await assertFails(updateDoc(doc(db, 'lists/l1'), { memberIds: arrayUnion('eve') }));
  await assertFails(updateDoc(doc(db, 'lists/l1'), { invitedEmails: arrayUnion('eve@example.com') }));
  await assertFails(getDoc(doc(db, 'lists/l1/items/i1')));
  await assertFails(setDoc(doc(db, 'lists/l1/items/x'), { name: 'Spam' }));
});

async function bobJoined() {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await updateDoc(doc(ctx.firestore(), 'lists/l1'), {
      memberIds: arrayUnion('bob', 'carol'),
      'members.bob': { name: 'Bob', email: 'bob@example.com' },
      'members.carol': { name: 'Carol', email: 'carol@example.com' },
      invitedEmails: [],
    });
  });
}

test('members can edit items and the list, invite, and leave', async () => {
  await bobJoined();
  const db = as(BOB);
  const batch = writeBatch(db);
  batch.set(doc(db, 'lists/l1/items/i2'), { name: 'Eggs', checked: false });
  batch.update(doc(db, 'lists/l1'), { itemCount: increment(1), updatedAt: 3 });
  await assertSucceeds(batch.commit());
  await assertSucceeds(updateDoc(doc(db, 'lists/l1/items/i1'), { checked: true }));
  await assertSucceeds(updateDoc(doc(db, 'lists/l1'), { name: 'Big shop', invitedEmails: arrayUnion('dave@example.com') }));
  await assertSucceeds(updateDoc(doc(db, 'lists/l1'), { memberIds: arrayRemove('bob'), 'members.bob': deleteField() }));
});

test('members cannot take ownership, remove others, or delete the list', async () => {
  await bobJoined();
  const db = as(BOB);
  await assertFails(updateDoc(doc(db, 'lists/l1'), { ownerId: 'bob' }));
  await assertFails(updateDoc(doc(db, 'lists/l1'), { memberIds: arrayRemove('carol') }));
  await assertFails(deleteDoc(doc(db, 'lists/l1')));
});

test('owner can remove members and delete the list', async () => {
  await bobJoined();
  const db = as(ALICE);
  await assertSucceeds(updateDoc(doc(db, 'lists/l1'), { memberIds: arrayRemove('bob'), 'members.bob': deleteField() }));
  await assertSucceeds(deleteDoc(doc(db, 'lists/l1/items/i1')));
  await assertSucceeds(deleteDoc(doc(db, 'lists/l1')));
});

test('item history is private', async () => {
  await assertSucceeds(setDoc(doc(as(ALICE), 'users/alice/history/milk'), { name: 'Milk', nameLower: 'milk', count: 1, lastUsed: 1 }));
  await assertSucceeds(getDocs(collection(as(ALICE), 'users/alice/history')));
  await assertFails(getDocs(collection(as(BOB), 'users/alice/history')));
  await assertFails(setDoc(doc(as(BOB), 'users/alice/history/milk'), { name: 'x' }));
});

test('profiles are readable by signed-in users, writable by their owner', async () => {
  await assertSucceeds(setDoc(doc(as(ALICE), 'users/alice'), { displayName: 'Alice' }));
  await assertSucceeds(getDoc(doc(as(BOB), 'users/alice')));
  await assertFails(setDoc(doc(as(BOB), 'users/alice'), { displayName: 'Mallory' }));
});

// ---------------------------------------------------------------- QR-code join codes

const joinAs = (u, code) =>
  updateDoc(doc(as(u), 'lists/l1'), {
    memberIds: arrayUnion(u.uid),
    [`members.${u.uid}`]: { name: u.uid, email: u.email.toLowerCase() },
    joinCode: code,
    updatedAt: 9,
  });

async function seedCode(code, expiresAt) {
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), `lists/l1/joinCodes/${code}`), { createdBy: 'alice', createdAt: 1, expiresAt }));
}

test('members can create, read and revoke join codes; others cannot', async () => {
  const now = Date.now();
  await assertSucceeds(setDoc(doc(as(ALICE), 'lists/l1/joinCodes/c1'), { createdBy: 'alice', createdAt: now, expiresAt: now + 86400000 }));
  await assertSucceeds(getDocs(collection(as(ALICE), 'lists/l1/joinCodes')));
  await assertFails(setDoc(doc(as(ALICE), 'lists/l1/joinCodes/c2'), { createdBy: 'alice', createdAt: now, expiresAt: now + 30 * 86400000 }));
  await assertFails(setDoc(doc(as(ALICE), 'lists/l1/joinCodes/c3'), { createdBy: 'bob', createdAt: now, expiresAt: now + 1000 }));
  await assertFails(setDoc(doc(as(EVE), 'lists/l1/joinCodes/c4'), { createdBy: 'eve', createdAt: now, expiresAt: now + 1000 }));
  await assertFails(getDoc(doc(as(EVE), 'lists/l1/joinCodes/c1')));
  await assertFails(getDocs(collection(as(EVE), 'lists/l1/joinCodes')));
  await assertFails(deleteDoc(doc(as(EVE), 'lists/l1/joinCodes/c1')));
  await assertSucceeds(deleteDoc(doc(as(ALICE), 'lists/l1/joinCodes/c1')));
});

test('a valid join code lets someone add themselves', async () => {
  await seedCode('good', Date.now() + 60000);
  await assertSucceeds(joinAs(EVE, 'good'));
  await assertSucceeds(getDoc(doc(as(EVE), 'lists/l1/items/i1')));
});

test('unknown or expired join codes are rejected', async () => {
  await seedCode('old', Date.now() - 1000);
  await assertFails(joinAs(EVE, 'old'));
  await assertFails(joinAs(EVE, 'guessed'));
  await assertFails(updateDoc(doc(as(EVE), 'lists/l1'), { memberIds: arrayUnion('eve'), 'members.eve': { name: 'e', email: 'e' } }));
});

test('a join code cannot be used to add others or change the list', async () => {
  await seedCode('good', Date.now() + 60000);
  const db = as(EVE);
  await assertFails(updateDoc(doc(db, 'lists/l1'), { memberIds: arrayUnion('eve', 'mallory'), 'members.eve': { name: 'e', email: 'e' }, joinCode: 'good' }));
  await assertFails(updateDoc(doc(db, 'lists/l1'), { memberIds: arrayUnion('eve'), 'members.eve': { name: 'e', email: 'e' }, joinCode: 'good', name: 'Mine now' }));
  await assertFails(updateDoc(doc(db, 'lists/l1'), { memberIds: ['eve'], 'members.eve': { name: 'e', email: 'e' }, joinCode: 'good' }));
  await assertFails(updateDoc(doc(db, 'lists/l1'), { memberIds: arrayUnion('eve'), 'members.alice': { name: 'x', email: 'x' }, joinCode: 'good' }));
});

// ---------------------------------------------------------------- weekly order history

test('members can close off a week; others cannot read or forge it', async () => {
  await bobJoined();
  const week = { completedAt: 1, completedBy: 'bob', completedByName: 'Bob', items: [{ name: 'Milk', quantity: '', addedByName: 'Alice' }] };
  const db = as(BOB);
  const batch = writeBatch(db);
  batch.set(doc(db, 'lists/l1/weeks/w1'), week);
  batch.delete(doc(db, 'lists/l1/items/i1'));
  batch.update(doc(db, 'lists/l1'), { itemCount: 0, doneCount: 0, weekStartedAt: 2, lastOrderAt: 2, lastOrderByName: 'Bob', updatedAt: 2 });
  await assertSucceeds(batch.commit());
  await assertSucceeds(getDocs(collection(as(ALICE), 'lists/l1/weeks')));
  await assertFails(setDoc(doc(db, 'lists/l1/weeks/w2'), { ...week, completedBy: 'alice' }));
  await assertFails(updateDoc(doc(db, 'lists/l1/weeks/w1'), { items: [] }));
  await assertFails(deleteDoc(doc(db, 'lists/l1/weeks/w1')));
  await assertFails(getDocs(collection(as(EVE), 'lists/l1/weeks')));
  await assertSucceeds(deleteDoc(doc(as(ALICE), 'lists/l1/weeks/w1')));
});
