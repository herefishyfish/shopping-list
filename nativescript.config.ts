import { NativeScriptConfig } from '@nativescript/core';

export default {
  // Must match the bundle id / package name registered in your Firebase project.
  id: 'dev.herefishy.shoppinglist',
  appPath: 'src',
  appResourcesPath: 'App_Resources',
  // Runtime 9.1+: uncaught JS errors are logged and fire Application.uncaughtErrorEvent instead
  // of crashing. src/main.ts reports them to Crashlytics, and Norrix listens to the same event
  // so a broken OTA update still rolls back.
  // https://docs.nativescript.org/guide/error-handling
  uncaughtErrorPolicy: 'report',
  android: {
    v8Flags: '--expose_gc',
    markingMode: 'none',
  },
} as NativeScriptConfig;
