// Must stay the first import - see ota.ts.
import './ota';
import { ErrorHandler, provideZonelessChangeDetection } from '@angular/core';
import { Application, DiscardedErrorEventData, Trace, UnhandledErrorEventData } from '@nativescript/core';
import { bootstrapApplication, provideNativeScriptRouter, registerElement, runNativeScriptAngularApp } from '@nativescript/angular';
import { installMasonKit } from '@triniwiz/nativescript-masonkit/angular';
import { install as installBottomSheet } from '@nativescript-community/ui-material-bottomsheet';
import { CheckBox } from '@nativescript-community/ui-checkbox';
import { GoogleSignInButton } from '@nativescript/google-signin';
import { MLKitView } from '@nativescript/mlkit-core';
// Side-effect import: enables the barcode detector inside MLKitView.
import '@nativescript/mlkit-barcode-scanning';
import { Svg } from '@nativescript/canvas-svg';

import { AppComponent } from './app/app.component';
import { LoadingComponent } from './app/loading.component';
import { routes } from './app/app.routes';
import { initFirebase } from './app/core/firebase';
import { CrashlyticsErrorHandler, recordError } from './app/core/telemetry';

// MasonKit must be installed before Angular bootstraps. It registers the HTML-shaped
// elements (div, section, header, h1…h6, p, span, ul, li, …) plus MasonKit's own
// <button>, <input>, <img>, <text-area> so templates read like standard web markup.
installMasonKit({
  componentHosts: {
    // Routed pages render an <ActionBar> + content inside a Page, and bottom-sheet / modal
    // roots are re-parented by their services - all must stay transparent.
    passthrough: [/-page$/, /-sheet$/, /-modal$/],
  },
});

// Native widgets that have no web equivalent.
registerElement('CheckBox', () => CheckBox);
registerElement('GoogleSignInButton', () => GoogleSignInButton);
registerElement('MLKitView', () => MLKitView);
// Angular puts any tag spelled `svg` (any case) in the SVG namespace, so the native SVG view
// from @nativescript/canvas-svg is registered as <SvgView>.
registerElement('SvgView', () => Svg);

installBottomSheet();

// Error handling - https://docs.nativescript.org/guide/error-handling
// Errors NativeScript core reports through Trace (bindings, navigation, …): log them in
// development, send them to Crashlytics in production. Neither crashes the app.
Trace.setErrorHandler({
  handlerError(err) {
    if (__DEV__) {
      Trace.write(err, 'unhandled-error', Trace.messageType.error);
    } else {
      recordError(err, 'trace');
    }
  },
});
// Uncaught JS errors (`uncaughtErrorPolicy: 'report'` in nativescript.config.ts) keep the app
// running and arrive here; discardedErrorEvent only fires if a plugin opts into discarding.
Application.on(Application.uncaughtErrorEvent, (args: UnhandledErrorEventData) => recordError(args.error, 'uncaught'));
Application.on(Application.discardedErrorEvent, (args: DiscardedErrorEventData) => recordError(args.error, 'discarded'));

runNativeScriptAngularApp({
  // Firebase init happens before the main app bootstraps; the loading app (same look as the
  // native splash) covers that gap and fades out when the main app is ready.
  appModuleBootstrap: async () => {
    await initFirebase();
    return bootstrapApplication(AppComponent, {
      providers: [provideNativeScriptRouter(routes), provideZonelessChangeDetection(), { provide: ErrorHandler, useClass: CrashlyticsErrorHandler }],
    });
  },
  loadingModule: () => bootstrapApplication(LoadingComponent, { providers: [provideZonelessChangeDetection()] }),
});
