/**
 * Firebase Analytics + Crashlytics.
 *
 * - Collection is off in development builds (`__DEV__`) so dashboards only show real usage.
 * - Users can opt out from Settings; the choice is stored per device.
 * - Only the Firebase uid is attached – never names, emails or list contents.
 */
import { ErrorHandler, Injectable } from '@angular/core';
import { ApplicationSettings } from '@nativescript/core';
import { firebase } from '@nativescript/firebase-core';
import '@nativescript/firebase-analytics';
import '@nativescript/firebase-crashlytics';

const OPT_IN_KEY = 'telemetryEnabled';

export type AnalyticsEvent =
  | 'login'
  | 'sign_up'
  | 'list_created'
  | 'list_archived'
  | 'list_deleted'
  | 'list_left'
  | 'list_joined'
  | 'item_added'
  | 'item_checked'
  | 'items_cleared'
  | 'share_invite_sent'
  | 'share_qr_shown'
  | 'join_codes_revoked'
  | 'reminder_updated';

let ready = false;

/** Call once, right after `firebase().initializeApp()`. */
export function initTelemetry() {
  ready = true;
  applyCollection();
}

export function telemetryOptIn(): boolean {
  return ApplicationSettings.getBoolean(OPT_IN_KEY, true);
}

export function setTelemetryOptIn(enabled: boolean) {
  ApplicationSettings.setBoolean(OPT_IN_KEY, enabled);
  applyCollection();
}

function applyCollection() {
  if (!ready) return;
  const enabled = telemetryOptIn() && !__DEV__;
  safely(() => firebase().analytics().setAnalyticsCollectionEnabled(enabled));
  safely(() => firebase().crashlytics().setCrashlyticsCollectionEnabled(enabled));
}

export function setTelemetryUser(uid: string | null) {
  if (!ready) return;
  safely(() => firebase().analytics().setUserId(uid ?? null));
  safely(() => firebase().crashlytics().setUserId(uid ?? ''));
}

export function track(event: AnalyticsEvent, params: Record<string, string | number | boolean> = {}) {
  if (!ready) return;
  safely(() => firebase().analytics().logEvent(event, params));
}

/** GA4 screen_view with route patterns (ids stripped), e.g. "/lists/:id". */
export function trackScreen(url: string) {
  if (!ready) return;
  const screen = url.split('?')[0].replace(/\/lists\/[^/]+/, '/lists/:id') || '/';
  safely(() => firebase().analytics().logEvent('screen_view', { screen_name: screen, screen_class: screen }));
}

/** Non-fatal error with a breadcrumb, shown under "Non-fatals" in Crashlytics. */
export function recordError(error: unknown, context?: string) {
  if (!ready) return;
  safely(() => {
    const crashlytics = firebase().crashlytics();
    if (context) crashlytics.log(context);
    crashlytics.recordError(error instanceof Error ? error : new Error(String(error)));
  });
}

export function breadcrumb(message: string) {
  if (!ready) return;
  safely(() => firebase().crashlytics().log(message));
}

/** Angular errors (templates, change detection, unhandled promise rejections in zones). */
@Injectable()
export class CrashlyticsErrorHandler implements ErrorHandler {
  handleError(error: unknown): void {
    console.error(error);
    recordError(error, 'angular');
  }
}

function safely(fn: () => void) {
  try {
    fn();
  } catch (e) {
    // Telemetry must never take the app down (e.g. missing native config in a dev build).
    console.warn('[telemetry]', e);
  }
}
