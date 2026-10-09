import { firebase } from '@nativescript/firebase-core';
import '@nativescript/firebase-auth';
import '@nativescript/firebase-firestore';
import { GoogleSignin } from '@nativescript/google-signin';
import { environment } from '../../environments/environment';

let ready: Promise<void> | undefined;

/** Initialise the default Firebase app and Google Sign-In exactly once. */
export function initFirebase(): Promise<void> {
  ready ??= (async () => {
    await firebase().initializeApp();
    // Firestore offline persistence is on by default on native, so lists and the
    // item-history type-ahead keep working on a flaky in-store connection.
    await GoogleSignin.configure({ serverClientId: environment.googleServerClientId });
  })();
  return ready;
}

export const auth = () => firebase().auth();
export const db = () => firebase().firestore();

/** The plugin's `SetOptions` type wants every field; Firestore only needs `merge`. */
export const MERGE = { merge: true } as import('@nativescript/firebase-firestore').SetOptions;
