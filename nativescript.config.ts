import { NativeScriptConfig } from '@nativescript/core';

export default {
  // Must match the bundle id / package name registered in your Firebase project.
  id: 'org.nativescript.shoppinglist',
  appPath: 'src',
  appResourcesPath: 'App_Resources',
  // Uncaught JS exceptions are reported (Crashlytics, see src/main.ts) instead of crashing the
  // app. Norrix still sees them via discardedErrorEvent, so a broken OTA update rolls back.
  // https://docs.nativescript.org/guide/error-handling
  ios: {
    discardUncaughtJsExceptions: true,
  },
  android: {
    v8Flags: '--expose_gc',
    markingMode: 'none',
    discardUncaughtJsExceptions: true,
  },
} as NativeScriptConfig;
