import { Injectable, computed, signal } from '@angular/core';
import { GoogleAuthProvider, User } from '@nativescript/firebase-auth';
import { GoogleSignin } from '@nativescript/google-signin';
import { MERGE, auth, db } from './firebase';
import { AppUser } from './models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  /** `undefined` until Firebase has restored (or failed to restore) the session. */
  private readonly _user = signal<AppUser | null | undefined>(undefined);
  readonly user = this._user.asReadonly();
  readonly resolved = computed(() => this._user() !== undefined);

  private resolvedPromise: Promise<AppUser | null>;

  constructor() {
    let resolve: (u: AppUser | null) => void;
    this.resolvedPromise = new Promise((r) => (resolve = r));

    const apply = (u: User | null) => {
      const appUser = u ? toAppUser(u) : null;
      this._user.set(appUser);
      resolve(appUser);
    };
    const current = auth().currentUser;
    if (current) apply(current);
    auth().addAuthStateChangeListener((u) => apply(u ?? null));
  }

  /** Resolves once the persisted session (if any) has been restored. */
  whenResolved(): Promise<AppUser | null> {
    const u = this._user();
    return u !== undefined ? Promise.resolve(u) : this.resolvedPromise;
  }

  get uid(): string {
    const u = this._user();
    if (!u) throw new Error('Not signed in');
    return u.uid;
  }

  async signInWithGoogle(): Promise<AppUser> {
    const gUser = await GoogleSignin.signIn();
    const credential = GoogleAuthProvider.credential(gUser.idToken, gUser.accessToken);
    const { user } = await auth().signInWithCredential(credential);
    return this.finishSignIn(user);
  }

  async signInWithEmail(email: string, password: string): Promise<AppUser> {
    const { user } = await auth().signInWithEmailAndPassword(email.trim(), password);
    return this.finishSignIn(user);
  }

  async registerWithEmail(name: string, email: string, password: string): Promise<AppUser> {
    const { user } = await auth().createUserWithEmailAndPassword(email.trim(), password);
    if (name.trim()) {
      await user.updateProfile({ displayName: name.trim() });
    }
    return this.finishSignIn(user, name.trim());
  }

  async signOut(): Promise<void> {
    try {
      if (GoogleSignin.isSignedIn()) await GoogleSignin.signOut();
    } catch {
      // Not signed in with Google – nothing to do.
    }
    await auth().signOut();
  }

  /** Keep a public profile doc so list members can see each other's names. */
  private async finishSignIn(user: User, nameOverride?: string): Promise<AppUser> {
    const appUser = toAppUser(user, nameOverride);
    this._user.set(appUser);
    await db()
      .collection('users')
      .doc(appUser.uid)
      .set(
        {
          displayName: appUser.displayName,
          email: appUser.email,
          emailLower: appUser.email.toLowerCase(),
          photoUrl: appUser.photoUrl ?? null,
          lastSignIn: Date.now(),
        },
        MERGE,
      );
    return appUser;
  }
}

function toAppUser(u: User, nameOverride?: string): AppUser {
  const email = u.email ?? '';
  return {
    uid: u.uid,
    email,
    displayName: nameOverride || u.displayName || email.split('@')[0] || 'Me',
    photoUrl: u.photoURL || undefined,
  };
}
