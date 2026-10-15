# Shared Shopping List

A NativeScript + Angular app for shopping lists you share with your partner or housemates.

- **UI:** [`@triniwiz/nativescript-masonkit`](https://www.npmjs.com/package/@triniwiz/nativescript-masonkit) `1.0.0-beta.108`. Templates use
  ordinary web markup - `div`, `main`, `section`, `article`, `header`, `footer`, `h1`-`h4`, `p`, `span`
  - laid out with real flexbox CSS. MasonKit's Angular integration also takes over `<button>`;
  text fields are core `TextField`s.
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
  drawn natively by `@nativescript/canvas-svg` 3 beta). Others scan it and join through an
  **ML Kit** scanner (`@nativescript/mlkit-core` + `@nativescript/mlkit-barcode-scanning`) opened
  as a native modal. Codes last 24h and can be revoked, and the security rules check them on the server.
- **Weekly reminder:** a local notification (`@nativescript/local-notifications`), on Mondays at
  7:00 pm Perth time (AWST) by default. You can change the day, time and time zone (Perth, or
  the phone's own), or turn it off.
- **Meal ideas:** each order week (the coming Wednesday in Perth, or today if it is Wednesday)
  the household swipes through meals. When every member says yes, the ingredients are merged
  onto the shared list. Vegetarian meals are flagged and can be filtered. Ideas are written
  from outside the app; the schema is below.
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

**How it's meant to be used:** the household shares **one list**. Everyone adds things
during the week. Before the Wednesday order, open **Meals** and swipe through that week's
ideas — right (or Yes) if you want it, left (or No) if you don't. When you have both said yes,
the ingredients are added to the list. At order time you tick items off as they go into the
order. Then **Start next week** clears what was ordered (saving it as that week's order history),
carries anything unticked over, and you start again. The Monday-evening reminder nudges you to
place the order. A separate nudge fires once when that Wednesday's meals show up, if
notifications are already allowed.

| Screen | What you can do |
| --- | --- |
| Sign in | Google, or email + password (create account / sign in) |
| Start (first run) | Create your household list, accept an email invite, or scan a housemate's QR code. Opens your list automatically once you have one |
| List (home) | Add items (optional quantity) using the type-ahead and "buy again" chips, tick off as ordered, tap a quantity to edit, remove with undo, **Start next week** (footer pinned to the bottom). ActionBar: **Meals**, **Lists** (switch, new list, join by QR) and **Settings**. Sharing lives in Settings, and the app always opens on the last list you used |
| Meals | This Wednesday's ideas (Perth time). Swipe the card right for yes and left for no, or use the buttons. Vegetarian meals are badged and the deck can be filtered to them. Agreed, pending and rejected meals stay listed, with who has voted. A yes from every current member adds the ingredients to the list |
| Share sheet | **By email:** invite, see members and pending invites, cancel invites, remove members (owner only). **QR code:** show a join QR, create a new code, revoke all codes |
| Scanner (modal) | ML Kit camera scanner. Asks before joining |
| Settings | Household list (rename, invite & QR, untick everything, switch list, join by scan, leave/delete), weekly reminder (day, time, Perth/phone time zone, test), privacy opt-out, account & sign out, version |

## Project layout

```
src/
  main.ts                         installMasonKit(), native element registration, Firebase init, bootstrap
  app.scss                        global styles - tag selectors (h1, p, input, button) + utility classes
  environments/environment.ts     Google web client ID
  app/
    app.routes.ts                 /login, /start, /list/:id, /list/:id/meals, /settings (with auth guards)
    core/
      firebase.ts                 initialises Firebase + Google Sign-In once
      auth.service.ts             auth state as a signal, Google / email sign-in, profile upsert
      lists.service.ts            lists, sharing/invitations, items (batched writes keep counts in sync)
      history.service.ts          per-user item history that feeds the type-ahead
      suggest.ts                  pure ranking / normalisation helpers (unit-tested)
      meals.ts                    meal week id, votes, ingredient merge (unit-tested)
      meals.service.ts            live meal plan, votes, and the "both said yes" ingredient write
      qr.ts                       join-link payload, QR matrix → SVG (unit-tested)
      reminder-time.ts            next reminder time, AWST / device zone (unit-tested)
      reminder.service.ts         schedules the weekly local notification
      ui.service.ts               snackbar, loading indicator, dialogs
    pages/                        login, start (first run), list (home), meals, settings – `*-page` selectors
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
                                   invitedEmails[], itemCount, doneCount, createdAt, updatedAt,
                                   weekStartedAt, lastOrderAt, lastOrderByName }
lists/{listId}/joinCodes/{code} { createdBy, createdAt, expiresAt }      ← QR codes
lists/{listId}/weeks/{weekId}   { completedAt, completedBy, completedByName, items[] } ← order history
lists/{listId}/items/{itemId}    { name, nameLower, quantity, checked, addedBy, addedByName,
                                   createdAt, checkedAt }
lists/{listId}/mealPlans/{weekId} { weekId, orderDay, timezone, createdAt }
lists/{listId}/mealPlans/{weekId}/meals/{mealId}
                                 { title, description, ingredients[{name, quantity}],
                                   estCostAud, vegetarian, source, notes, sort,
                                   votes{uid: "yes"|"no"}, appliedAt, appliedBy }
```

**How sharing works:** inviting someone adds their lower-cased email to `invitedEmails`. When they
sign in with that email, the list appears under **Invitations**. Accepting moves their uid into
`memberIds`. The security rules only let an invitee add themselves and remove their own invite,
so an invitation can't be used to do anything else. Members can edit the list and its items, but
not the owner, and on a meal they can write only their own vote. Only the owner can remove other
people or delete the list.

**How QR joining works:** a member creates `lists/{id}/joinCodes/{code}`, where the code is a
Firestore auto-id (about 120 bits) that expires after 24h. The QR code encodes
`shoppinglist://join?l=<listId>&c=<code>&n=<name>`. The scanner adds itself to `memberIds` and
writes `joinCode: <code>`. The rules allow that only if the code exists, hasn't expired, and the
caller is adding nobody but themselves. Strangers can't read join codes, and "Revoke all codes"
deletes them.

### Meal ideas (written outside the app)

The app only **reads** meal plans and **writes votes** (plus a one-time `appliedAt` / `appliedBy`
claim). Create the documents with the Admin SDK, which bypasses `firestore.rules`. Clients cannot
create or edit a meal's title, ingredients or cost.

**Which document:** the order week is the coming **Wednesday in Perth** (AWST, UTC+8, no daylight
saving). If today is Wednesday in Perth, use today. The id is that date, `YYYY-MM-DD`.

Example: Thursday 15 Oct 2026 in Perth → `2026-10-21`. The screen listens to that id, so a plan
written for a different week will not show up.

```
lists/{listId}/mealPlans/{weekId}                         the plan
lists/{listId}/mealPlans/{weekId}/meals/{mealId}          one meal
```

`mealId` is any id you choose (a slug is fine). Write the plan doc and each meal.

| Field | Type | Who writes it | Required |
| --- | --- | --- | --- |
| `weekId` | string | admin | yes, same as the document id |
| `orderDay` | string | admin | yes, `"wednesday"` |
| `timezone` | string | admin | yes, `"Australia/Perth"` |
| `createdAt` | number | admin | yes, unix millis |
| `title` | string | admin | yes |
| `description` | string | admin | yes, can be `""` |
| `ingredients` | array of `{ name: string, quantity?: string }` | admin | yes, can be `[]`. `quantity` may be omitted or `""` |
| `estCostAud` | number | admin | yes, rough cost in Australian dollars (`12` or `12.5`) |
| `vegetarian` | boolean | admin | yes. The app badges this and can filter on it |
| `source` | string | admin | no. Kept for your notes; the app does not show it |
| `notes` | string | admin | no. Shown under the ingredients (fussy-eater notes, swaps) |
| `sort` | number | admin | no. Lower comes first in the deck. Default `0`, then title |
| `votes` | map of uid → `"yes"` \| `"no"` | admin creates `{}`, each member writes **only their own key** | yes. Must be a map, even when empty |
| `appliedAt` | number or null | admin sets `null`. The app sets millis **once** | yes |
| `appliedBy` | string or null | admin sets `null`. The app sets the uid that added the ingredients | yes |

`votes`, `appliedAt` and `appliedBy` have to be present. A missing `votes` map is tolerated for the
first vote, but write `{}` anyway. Do not pre-fill anyone's vote.

**When ingredients are added:** every current `memberIds` entry (at least 2, at most 8) has
`votes[uid] == "yes"`. Someone who used to be on the list and voted no does not block it. The app
then merges ingredients into `lists/{listId}/items` with the same write as adding an item by hand
(name, quantity, `itemCount`, history / type-ahead). The same normalised name updates the existing
line instead of adding a duplicate: quantities with the same unit are summed (`500g` + `250g` →
`750g`, `1 cup` + `2 cups` → `3 cups`); anything else is kept side by side (`1 bunch + 2`). A line
that was already ticked is unticked so the extra amount is still ordered. `appliedAt` is set in
that same batch, so the other phone's write is rejected and nothing is added twice. Votes freeze
after that.

```js
// firebase-admin. weekId example is the Wednesday after Thu 15 Oct 2026 (Perth).
const weekId = '2026-10-21';
const plan = db.doc(`lists/${listId}/mealPlans/${weekId}`);
await plan.set({
  weekId,
  orderDay: 'wednesday',
  timezone: 'Australia/Perth',
  createdAt: Date.now(),
});
await plan.collection('meals').doc('veggie-fried-rice').set({
  title: 'Veggie fried rice',
  description: 'Quick weeknight rice with frozen veg.',
  ingredients: [
    { name: 'Jasmine rice', quantity: '2 cups' },
    { name: 'Frozen mixed vegetables', quantity: '500g' },
    { name: 'Soy sauce', quantity: '' },
  ],
  estCostAud: 12.5,
  vegetarian: true,
  source: 'assistant',
  notes: 'Leave the egg out — Caitlin is vegetarian. Fine for the toddler if the veg is soft.',
  sort: 0,
  votes: {},
  appliedAt: null,
  appliedBy: null,
});
```

Deleting a list (owner only) also deletes its meal plans. Members cannot delete or rewrite a meal.

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
**Settings** (bottom line) shows whether the store bundle or an OTA update is running.

## Checks

```bash
npm test                 # type-ahead, QR, reminder-time, and meal match / ingredient merge
                         # (--experimental-strip-types, so Node 22.14 can run the .ts tests too)
npm run bundle:android   # full AOT webpack build (also: bundle:ios)
cd rules-tests && npm install && npm test   # firestore.rules against the emulator (needs Java)
```

## MasonKit notes

- `installMasonKit()` runs in `main.ts` **before** bootstrap. Routed pages use `*-page` selectors and the
  bottom-sheet root uses `*-sheet`. Both are passed as `passthrough` so they stay transparent (a page
  is `ActionBar` + content). Other components such as `<item-entry>` become real MasonKit boxes, so they
  can be styled from the outside like on the web.
- Each page's root is a core `GridLayout class="screen"`, which always fills the Page, with
  MasonKit content inside. A MasonKit root `div` with `height: 100%` didn't reliably get the Page's
  height, so footers floated up and scroll areas couldn't scroll.
- Pages with an `<ActionBar>` must import `NativeScriptCommonModule`. Without it, the Page adds
  its own default ActionBar (showing the app name) under yours.
- Use unitless lengths (`padding: 12`). In NativeScript, `px` means physical pixels.
- Text entry uses core `<TextField class="input">` (native EditText / UITextField) rather than
  MasonKit's `<input>`, wrapped in a `<div class="field">` so it takes part in flex layout:
  `[text]="query()" (textChange)="query.set($any($event).value)" (returnPress)="submit()"`.
- `<svg>` in any letter case is put in Angular's SVG namespace, so the native SVG view is
  registered as `<SvgView>`.
- MasonKit is a beta. If a release changes element names or events, check
  `node_modules/@triniwiz/nativescript-masonkit/angular/README.md`.
