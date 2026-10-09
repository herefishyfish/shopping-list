import { NativeScriptConfig } from '@nativescript/core';

export default {
  // Must match the bundle id / package name registered in your Firebase project.
  id: 'org.nativescript.shoppinglist',
  appPath: 'src',
  appResourcesPath: 'App_Resources',
  android: {
    v8Flags: '--expose_gc',
    markingMode: 'none',
  },
} as NativeScriptConfig;
