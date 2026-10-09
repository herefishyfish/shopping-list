import { defineConfig } from '@norrix/cli';

/**
 * Norrix cloud builds, OTA updates and store submissions.
 *
 *   npx norrix sign-in
 *   npx norrix build android release        # store binary (needed once for the OTA loader)
 *   npx norrix build ios release appstore
 *   npm run ota:android / npm run ota:ios   # publish JS/CSS/asset changes over the air
 *
 * The Firebase config files are git-ignored, so upload them once as build secrets and they
 * are written back to these paths in the cloud build:
 *
 *   npx norrix env set-file google-services.json App_Resources/Android/src/google-services.json
 *   npx norrix env set-file GoogleService-Info.plist App_Resources/iOS/GoogleService-Info.plist
 */
export default defineConfig({
  env: {
    files: ['App_Resources/Android/src/google-services.json', 'App_Resources/iOS/GoogleService-Info.plist'],
  },
  ios: {
    distributionType: 'appstore',
    // teamId: 'YOUR_TEAM_ID',
  },
  android: {
    distributionType: 'appstore',
    // keystorePath: './signing/release.keystore',
    // keyAlias: 'shopping-list',
  },
  defaultConfiguration: 'release',
});
