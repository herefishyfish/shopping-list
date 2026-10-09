# Shared Shopping List

A NativeScript + Angular app for shopping lists you share with your partner or housemates.

- **UI:** [`@triniwiz/nativescript-masonkit`](https://www.npmjs.com/package/@triniwiz/nativescript-masonkit) `1.0.0-beta.108` (latest beta). Templates use
  ordinary web markup - `div`, `main`, `section`, `article`, `header`, `footer`, `h1`-`h4`, `p`, `span`
  - laid out with real flexbox CSS. MasonKit's Angular integration also takes over `<button>` and
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
- **QR-code sharing:** the share sheet shows a QR code (`qrcode-generator` → one SVG path,
  drawn natively by `@nativescript/canvas-svg` 3 beta). Others tap **Scan** and join through an
  **ML Kit** scanner (`@nativescript/mlkit-core` + `@nativescript/mlkit-barcode-scanning`) opened
  as a native modal. Codes last 24h and can be revoked, and the security rules check them on the server.
- **Weekly reminder:** a local notification (`@nativescript/local-notifications`), on Mondays at
  7:00 pm Perth time (AWST) by default. You can change the day, time and time zone (Perth, or
  the phone's own), or turn it off.
- **SVG icons:** `src/assets/icons/*.svg`, rendered with `<SvgView>` (`@nativescript/canvas-svg`)
  and coloured through CSS `color` (`currentColor`).
- **Dark mode:** Android follows the system theme through resources
  (`Theme.MaterialComponents.DayNight` + `values-night/colors.xml`), so dialogs, snackbars,
  pickers, status bar and splash all switch. The app's own screens use the light/dark palette in
  `src/theme.scss` (CSS variables on NativeScript's `.ns-light` / `.ns-dark` classes).
- **Crashlytics & Analytics:** non-fatal and uncaught JS errors, screen views and a few
  product events (no names, emails or list contents). Off in dev builds, and users can opt out
  under Settings. Error handling follows the
  [NativeScript guide](https://docs.nativescript.org/guide/error-handling):
  `Trace.setErrorHandler`, plus `discardUncaughtJsExceptions` so JS errors are reported instead of
  crashing the app.
- **Fast start:** a `loadingModule` (same look as the native splash) is shown while Firebase
  initialises and the main app bootstraps, then fades out.
- **OTA updates:** [Norrix](https://norrix.net) (`@norrix/client-sdk` 3). Updates download in
  the background and apply on the **next launch**. A bad update is quarantined and rolled back
  automatically.
- **Plugins:** `@nativescript-community/ui-material-bottomsheet` (share sheet),
  `@nativescript-community/ui-material-snackbar` (undo/errors), `@nativescript-community/ui-checkbox`,
  `@nstudio/nativescript-loading-indicator` (sign-in / delete progress).

## Features

| Screen | What you can do |
| --- | --- |
| Sign in | Google, or email + password (create account / sign in) |
| Lists | See your lists with "n to buy" counts, accept/decline invitations, create a list, show archived lists, sign out |
| List | Add items (with an optional quantity) using the type-ahead, tick items off (they move to "In the trolley"), tap a quantity to edit it, remove items with undo. The **More** menu has rename, untick everything, clear ticked, archive/restore, and delete (owner) or leave (member) |
| Share sheet | **By email:** invite people, see members and pending invites, cancel invites, remove members (owner only). **QR code:** show a join QR, create a new code, revoke all codes |
| Scanner (modal) | ML Kit camera scanner (Lists → **Scan**). Asks before joining the list from the QR code |
| Reminders | Weekly notification on/off, day, time, Perth/phone time zone, send a test |

## Project layout

```
src/
  main.ts                         installMasonKit(), native element registration, Firebase init, bootstrap
  app.scss                        global styles - tag selectors (h1, p, input, button) + utility classes
  environments/environment.ts     Google web client ID
  app/
    app.routes.ts                 /login, /lists, /lists/:id (with auth guards)
    core/
      firebase.ts                 initialises Firebase + Google Sign-In once
      auth.service.ts             auth state as a signal, Google / email sign-in, profile upsert
      lists.service.ts            lists, sharing/invitations, items (batched writes keep counts in sync)
      history.service.ts          per-user item history that feeds the type-ahead
      suggest.ts                  pure ranking / normalisation helpers (unit-tested)
      qr.ts                       join-link payload, QR matrix → SVG (unit-tested)
      reminder-time.ts            next reminder time, AWST / device zone (unit-tested)
      reminder.service.ts         schedules the weekly local notification
      ui.service.ts               snackbar, loading indicator, dialogs
    pages/                        login, lists, list (routed pages: `*-page` selectors)
    components/
      item-entry/                 add-item bar with type-ahead + "buy again" chips
      share-sheet/                material bottom sheet for sharing (email + QR tabs)
      qr-code/                    <qr-code [value]> rendered as SVG
      scanner/                    ML Kit scanner modal + ScannerService.scan()
  ota.ts                          Norrix OTA init (first import in main.ts)
  theme.scss                      light/dark colour palette (mirror of values-night)
  app/core/telemetry.ts           Analytics events, Crashlytics, Angular ErrorHandler
  app/loading.component.ts        loading screen shown while the app boots
resources/icon*.svg               app icon sources → `npm run icons`
tools/generate-icons.mjs          renders the icon / splash PNGs for iOS and Android
norrix.config.ts                  Norrix cloud build / OTA config
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
lists/{listId}/joinCodes/{code} { createdBy, createdAt, expiresAt }      ← QR codes
lists/{listId}/items/{itemId}    { name, nameLower, quantity, checked, addedBy, addedByName,
                                   createdAt, checkedAt }
```

**How sharing works:** inviting someone adds their lower-cased email to `invitedEmails`. When they
sign in with that email, the list appears under **Invitations**. Accepting moves their uid into
`memberIds`. The security rules only let an invitee add themselves and remove their own invite,
so an invitation can't be used to do anything else. Members can edit everything except the
owner. Only the owner can remove other people or delete the list.

**How QR joining works:** a member creates `lists/{id}/joinCodes/{code}`, where the code is a
Firestore auto-id (about 120 bits) that expires after 24h. The QR code encodes
`shoppinglist://join?l=<listId>&c=<code>&n=<name>`. The scanner adds itself to `memberIds` and
writes `joinCode: <code>`. The rules allow that only if the code exists, hasn't expired, and the
caller is adding nobody but themselves. Strangers can't read join codes, and "Revoke all codes"
deletes them.

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
8. Camera and notification permissions are already declared (`NSCameraUsageDescription`,
   `CAMERA` and `POST_NOTIFICATIONS`). The app asks for them the first time they're needed.

Both Firebase config files are git-ignored.

### 3. Run

```bash
ns run android
ns run ios
```

## App icon & splash

`resources/icon-glyph.svg` (a cart with a tick, on a 108×108 adaptive-icon canvas) and
`resources/icon.svg` (full-bleed) are the sources. `npm run icons` renders:

- iOS `AppIcon.appiconset` (all sizes, opaque as App Store requires) and the launch screen images
- Android legacy `mipmap-*/ic_launcher.png` and the splash `drawable-*/logo.png` (also used by the loading screen)

The Android adaptive and themed (monochrome) icon is a vector at
`drawable/ic_launcher_foreground.xml` that mirrors the glyph SVG. Edit both if the glyph
changes. Android 12+ uses it for the system splash (`values-v31/styles.xml`).

## OTA updates (Norrix)

```bash
npx norrix sign-in
# once: upload the git-ignored Firebase config so cloud builds can include it
npx norrix env set-file google-services.json App_Resources/Android/src/google-services.json
npx norrix env set-file GoogleService-Info.plist App_Resources/iOS/GoogleService-Info.plist

npm run cloud:android        # store binary - must ship once with the 3.x OTA loader
npm run cloud:ios
npm run ota:android          # publish JS/CSS/asset changes over the air
npm run ota:ios
```

OTA can update anything in `src/` and `node_modules` JS. Changes to `App_Resources`
(icons, Info.plist, manifest), native plugins or the NativeScript runtime need a new store build.
**About** on the lists screen shows whether the store bundle or an OTA update is running.

## Checks

```bash
npm test                 # type-ahead, QR payload/SVG and reminder-time unit tests
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
- `<svg>` in any letter case is put in Angular's SVG namespace, so the native SVG view is
  registered as `<SvgView>`.
- MasonKit is a beta. If a release changes element names or events, check
  `node_modules/@triniwiz/nativescript-masonkit/angular/README.md`.
