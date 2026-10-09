import { provideZonelessChangeDetection } from '@angular/core';
import { bootstrapApplication, provideNativeScriptRouter, registerElement, runNativeScriptAngularApp } from '@nativescript/angular';
import { installMasonKit } from '@triniwiz/nativescript-masonkit/angular';
import { install as installBottomSheet } from '@nativescript-community/ui-material-bottomsheet';
import { CheckBox } from '@nativescript-community/ui-checkbox';
import { GoogleSignInButton } from '@nativescript/google-signin';

import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';
import { initFirebase } from './app/core/firebase';

// MasonKit must be installed before Angular bootstraps. It registers the HTML-shaped
// elements (div, section, header, h1…h6, p, span, ul, li, …) plus MasonKit's own
// <button>, <input>, <img>, <text-area> so templates read like standard web markup.
installMasonKit({
  componentHosts: {
    // Routed pages render an <ActionBar> + content inside a Page, and bottom-sheet roots
    // are re-parented by the sheet service – both must stay transparent.
    passthrough: [/-page$/, /-sheet$/],
  },
});

// Native widgets that have no web equivalent.
registerElement('CheckBox', () => CheckBox);
registerElement('GoogleSignInButton', () => GoogleSignInButton);

installBottomSheet();

runNativeScriptAngularApp({
  appModuleBootstrap: async () => {
    await initFirebase();
    return bootstrapApplication(AppComponent, {
      providers: [provideNativeScriptRouter(routes), provideZonelessChangeDetection()],
    });
  },
});
