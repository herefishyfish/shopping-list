const webpack = require('@nativescript/webpack');

module.exports = (env) => {
  webpack.init(env);

  // Learn how to customize:
  // https://docs.nativescript.org/webpack

  webpack.chainWebpack((config) => {
    // MasonKit also targets Windows and checks `__WINDOWS__`, which @nativescript/webpack 5.0
    // doesn't define (only __ANDROID__/__IOS__/__APPLE__/__VISIONOS__) – without this the app
    // dies at startup with "ReferenceError: __WINDOWS__ is not defined".
    config.plugin('DefinePlugin').tap((args) => {
      args[0] = { ...args[0], __WINDOWS__: false };
      return args;
    });

    // @nativescript/firebase-crashlytics → stacktrace-js → source-map references Node's fs/path/url
    // for a WASM code path that never runs on device; stub them out.
    config.resolve.set('fallback', { ...(config.resolve.get('fallback') || {}), fs: false, path: false, url: false });
  });

  return webpack.resolveConfig();
};
