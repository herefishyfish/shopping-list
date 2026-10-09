const webpack = require('@nativescript/webpack');

module.exports = (env) => {
  webpack.init(env);

  // Learn how to customize:
  // https://docs.nativescript.org/webpack

  webpack.chainWebpack((config) => {
    // @nativescript/firebase-crashlytics → stacktrace-js → source-map references Node's fs/path/url
    // for a WASM code path that never runs on device; stub them out.
    config.resolve.set('fallback', { ...(config.resolve.get('fallback') || {}), fs: false, path: false, url: false });
  });

  return webpack.resolveConfig();
};
