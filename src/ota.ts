/**
 * Norrix over-the-air updates.
 *
 * Imported FIRST in main.ts: the SDK arms its launch monitor when this module is evaluated,
 * which is what lets it detect a bad update and roll back to the last known-good bundle (or
 * the store bundle) automatically.
 *
 * Updates download in the background and apply on the next launch (`next-launch`), so the
 * app never reloads while someone is mid-shop ticking things off.
 *
 * Only JS/CSS/assets ship OTA. Changes to App_Resources, native plugins or the NativeScript
 * runtime need a store build (`norrix build …`).
 */
import { SyncStatus, initNorrix } from '@norrix/client-sdk';

// Local `ns run` builds don't carry the native fingerprint/configuration that Norrix cloud
// builds inject into BuildConfig / Info.plist, and OTA makes no sense next to HMR – so only
// initialise in production builds. (Importing the SDK still arms the launch monitor.)
export const norrix = __DEV__
  ? null
  : initNorrix({
      updateUrl: 'https://norrix.net',
      checkForUpdatesOnLaunch: true,
      installUpdatesAutomatically: true,
      applyUpdateMode: 'next-launch',
      statusCallback(status, data) {
        if (status === SyncStatus.ERROR || status === SyncStatus.ROLLED_BACK || status === SyncStatus.RELOAD_FAILED) {
          console.warn(`[norrix] ${status}`, data);
        } else if (status === SyncStatus.UPDATE_INSTALLED) {
          console.log('[norrix] update installed - applies on next launch', data);
        }
      },
    });

/** e.g. "1.0.0 (store)" or "1.0.3 · OTA 42" - shown in the About dialog. */
export function runningVersionLabel(): string {
  try {
    if (!norrix) return 'development build';
    const running = norrix.getRunningUpdate();
    if (!running) return 'unknown';
    const build = running.buildNumber ? ` (${running.buildNumber})` : '';
    return running.source === 'update' ? `${running.version}${build} · OTA update` : `${running.version}${build} · store build`;
  } catch {
    return 'unknown';
  }
}
