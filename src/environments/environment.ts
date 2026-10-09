/**
 * App configuration.
 *
 * `googleServerClientId` is the **Web client ID** (OAuth client of type "Web application")
 * from your Firebase project — Firebase console › Authentication › Sign-in method › Google ›
 * "Web SDK configuration", or `client_type: 3` in google-services.json. On Android this is
 * what makes Google Sign-In return an ID token that Firebase Auth can verify.
 */
export const environment = {
  googleServerClientId: 'REPLACE_WITH_WEB_CLIENT_ID.apps.googleusercontent.com',
  /** Max suggestions shown in the type-ahead under the "add item" input. */
  maxSuggestions: 6,
};
