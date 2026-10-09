import { Injectable } from '@angular/core';
import { Dialogs, Utils } from '@nativescript/core';
import { DismissReasons, SnackBar, SnackBarAction } from '@nativescript-community/ui-material-snackbar';
import { LoadingIndicator, Mode } from '@nstudio/nativescript-loading-indicator';
import { recordError } from './telemetry';

/** Thin wrappers around the native feedback widgets so pages stay declarative. */
@Injectable({ providedIn: 'root' })
export class UiService {
  private readonly snackbar = new SnackBar();
  private readonly loader = new LoadingIndicator();

  toast(message: string) {
    return this.snackbar.simple(message).catch(() => {});
  }

  error(message: string, err?: unknown) {
    if (err) {
      console.error(message, err);
      recordError(err, message);
    }
    return this.snackbar.simple(message, '#ffffff', '#B3261E').catch(() => {});
  }

  /** Shows a snackbar with an action; resolves `true` if the action was tapped. */
  async withAction(message: string, actionText: string, hideDelay = 4000): Promise<boolean> {
    try {
      const res = await this.snackbar.action({ message, actionText, hideDelay, actionTextColor: '#8CD6B0' });
      // Android reports `command: 'action'`, iOS reports `reason: 'action'`.
      return res?.command === SnackBarAction.ACTION || res?.reason === DismissReasons.ACTION;
    } catch {
      return false;
    }
  }

  async busy<T>(message: string, work: () => Promise<T>): Promise<T> {
    this.loader.show({ message, mode: Mode.Indeterminate, dimBackground: true, userInteractionEnabled: false });
    try {
      return await work();
    } finally {
      this.loader.hide();
    }
  }

  confirm(title: string, message: string, okButtonText = 'OK') {
    return Dialogs.confirm({ title, message, okButtonText, cancelButtonText: 'Cancel' });
  }

  async prompt(title: string, defaultText = '', okButtonText = 'Save'): Promise<string | null> {
    const res = await Dialogs.prompt({ title, defaultText, okButtonText, cancelButtonText: 'Cancel', capitalizationType: 'sentences' });
    return res.result ? res.text : null;
  }

  dismissKeyboard() {
    Utils.dismissSoftInput();
  }
}
