# Shared Shopping List

A NativeScript + Angular app for shopping lists you share with your partner or housemates.

- **UI:** [`@triniwiz/nativescript-masonkit`](https://www.npmjs.com/package/@triniwiz/nativescript-masonkit) `1.0.0-beta.108` (latest beta). Templates use
  ordinary web markup – `div`, `main`, `section`, `article`, `header`, `footer`, `h1`–`h4`, `p`, `span`
  – laid out with real flexbox CSS. MasonKit's Angular integration also takes over `<button>` and
  `<input>` (there is no `nbutton`; the plain tag names now resolve to MasonKit's native widgets).
  Core NativeScript is only used where there's no web equivalent: `ActionBar`, the `CheckBox`
  from `@nativescript-community/ui-checkbox`, and the native `GoogleSignInButton`.
- **Auth:** Firebase Auth with **Google Sign-In** (`@nativescript/google-signin`) plus email/password
  as a fallback (handy on emulators without Play Services).
- **Data:** Cloud Firestore, live-synced with offline persistence. Every change a housemate makes
  shows up instantly.
- **Type-ahead:** everything you've ever added (or ticked off from a shared list) is remembered with
  a purchase count. Typing in the "Add an item" box searches it (prefix matches first, then by how often you
  buy it). With nothing typed you get one-tap "Buy again" chips.
- **Plugins:** `@nativescript-community/ui-material-bottomsheet` (share sheet),
  `@nativescript-community/ui-material-snackbar` (undo/errors), `@nativescript-community/ui-checkbox`,
  `@nstudio/nativescript-loading-indicator` (sign-in / delete progress).

## Features

| Screen | What you can do |
| --- | --- |
| Sign in | Google, or email + password (create account / sign in) |
| Lists | See your lists with "n to buy" counts, accept/decline invitations, create a list, show archived lists, sign out |
| List | Add items (with an optional quantity) using the type-ahead, tick items off (they move to "In the trolley"), tap a quantity to edit it, remove items with undo. The **More** menu has rename, untick everything, clear ticked, archive/restore, and delete (owner) or leave (member) |
| Share sheet | Invite people by email, see members and pending invites, cancel invites, remove members (owner only) |

## Project layout

```
src/
  main.ts                         installMasonKit(), native element registration, Firebase init, bootstrap
  app.scss                        global styles – tag selectors (h1, p, input, button) + utility classes
  environments/environment.ts     Google web client ID
  app/
    app.routes.ts                 /login, /lists, /lists/:id (with auth guards)
    core/
      firebase.ts                 initialises Firebase + Google Sign-In once
      auth.service.ts             auth state as a signal, Google / email sign-in, profile upsert
      lists.service.ts            lists, sharing/invitations, items (batched writes keep counts in sync)
      history.service.ts          per-user item history that feeds the type-ahead
      suggest.ts                  pure ranking / normalisation helpers (unit-tested)
      ui.service.ts               snackbar, loading indicator, dialogs
    pages/                        login, lists, list (routed pages: `*-page` selectors)
    components/
      item-entry/                 add-item bar with type-ahead + "buy again" chips
      share-sheet/                material bottom sheet for sharing
firestore.rules                   security rules (see below)
rules-tests/                      rules tests that run against the Firestore emulator
tests/                            unit tests for the type-ahead logic
```

### Data model

```
users/{uid}                      { displayName, email, emailLower, photoUrl, lastSignIn }
users/{uid}/history/{nameKey}    { name, nameLower, count, lastUsed }        ← type-ahead source
lists/{listId}                   { name, ownerId, memberIds[], members{uid:{name,email}},
                                   invitedEmails[], itemCount, doneCount, archived, createdAt, updatedAt }
lists/{listId}/items/{itemId}    { name, nameLower, quantity, checked, addedBy, addedByName,
                                   createdAt, checkedAt }
```

**How sharing works:** inviting someone adds their lower-cased email to `invitedEmails`. When they
sign in with that email, the list appears under **Invitations**. Accepting moves their uid into
`memberIds`. The security rules only let an invitee add themselves and remove their own invite,
so an invitation can't be used to do anything else. Members can edit everything except the
owner. Only the owner can remove other people or delete the list.

## Setup

### 1. Install

```bash
npm install
```

Requires the NativeScript CLI 9 (`npm i -g nativescript`) and a working Android and/or iOS toolchain (`ns doctor`).

### 2. Firebase project

1. Create a Firebase project and enable **Authentication → Sign-in method → Google** (and
   **Email/Password** if you want the fallback).
2. Create a **Cloud Firestore** database.
3. Register the apps with bundle ID / package name `org.nativescript.shoppinglist` (or change
   `id` in `nativescript.config.ts`).
4. **Android:** download `google-services.json` to `App_Resources/Android/src/google-services.json`
   and add your debug (and release) **SHA-1** fingerprint to the Android app in Firebase.
   Without the SHA-1, Google Sign-In fails with `DEVELOPER_ERROR` / code 10:
   ```bash
   keytool -list -v -alias androiddebugkey -keystore ~/.android/debug.keystore -storepass android
   ```
5. **iOS:** download `GoogleService-Info.plist` to `App_Resources/iOS/GoogleService-Info.plist`, then in
   `App_Resources/iOS/Info.plist` replace the two placeholders:
   - `CFBundleURLSchemes` → the plist's `REVERSED_CLIENT_ID`
   - `GIDClientID` → the plist's `CLIENT_ID`
6. Set `googleServerClientId` in `src/environments/environment.ts` to the **Web client ID**
   (Authentication → Sign-in method → Google → Web SDK configuration, or the `client_type: 3` entry in
   `google-services.json`). Android needs this to get an ID token that Firebase accepts.
7. Deploy the security rules:
   ```bash
   npx firebase-tools deploy --only firestore:rules,firestore:indexes
   ```

Both Firebase config files are git-ignored.

### 3. Run

```bash
ns run android
ns run ios
```

## Checks

```bash
npm test                 # type-ahead ranking / normalisation unit tests
npm run bundle:android   # full AOT webpack build (also: bundle:ios)
cd rules-tests && npm install && npm test   # firestore.rules against the emulator (needs Java)
```

## MasonKit notes

- `installMasonKit()` runs in `main.ts` **before** bootstrap. Routed pages use `*-page` selectors and the
  bottom-sheet root uses `*-sheet`. Both are passed as `passthrough` so they stay transparent (a page
  is `ActionBar` + content). Other components such as `<item-entry>` become real MasonKit boxes, so they
  can be styled from the outside like on the web.
- Use unitless lengths (`padding: 12`). In NativeScript, `px` means physical pixels.
- MasonKit's `<input>` emits DOM-style `input`/`change` events, so binding looks like the web:
  `[value]="query()" (input)="query.set($event.target.value)"`.
- MasonKit is a beta. If a release changes element names or events, check
  `node_modules/@triniwiz/nativescript-masonkit/angular/README.md`.
