import { Component, NO_ERRORS_SCHEMA, inject, signal } from '@angular/core';
import { RouterExtensions } from '@nativescript/angular';
import { Page } from '@nativescript/core';
import { AuthService } from '../../core/auth.service';
import { UiService } from '../../core/ui.service';
import { isEmail } from '../../core/suggest';

@Component({
  selector: 'login-page',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  schemas: [NO_ERRORS_SCHEMA],
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly ui = inject(UiService);
  private readonly router = inject(RouterExtensions);

  readonly mode = signal<'signin' | 'register'>('signin');
  readonly name = signal('');
  readonly email = signal('');
  readonly password = signal('');
  readonly error = signal('');

  constructor() {
    inject(Page).actionBarHidden = true;
  }

  async google() {
    this.error.set('');
    try {
      await this.ui.busy('Signing in…', () => this.auth.signInWithGoogle());
      this.done();
    } catch (e: any) {
      // Cancelling the Google account picker is not an error worth shouting about.
      const msg = String(e?.message ?? e);
      if (!/cancel/i.test(msg)) this.error.set(friendlyError(msg));
    }
  }

  async submitEmail() {
    this.error.set('');
    const email = this.email().trim();
    const password = this.password();
    if (!isEmail(email)) return this.error.set('Enter a valid email address.');
    if (password.length < 6) return this.error.set('Passwords need at least 6 characters.');
    try {
      await this.ui.busy(this.mode() === 'register' ? 'Creating account…' : 'Signing in…', () =>
        this.mode() === 'register' ? this.auth.registerWithEmail(this.name(), email, password) : this.auth.signInWithEmail(email, password),
      );
      this.done();
    } catch (e: any) {
      this.error.set(friendlyError(String(e?.message ?? e)));
    }
  }

  toggleMode() {
    this.error.set('');
    this.mode.update((m) => (m === 'signin' ? 'register' : 'signin'));
  }

  private done() {
    this.ui.dismissKeyboard();
    this.router.navigate(['/lists'], { clearHistory: true });
  }
}

function friendlyError(msg: string): string {
  if (/password is invalid|wrong-password|INVALID_LOGIN_CREDENTIALS|credential is incorrect/i.test(msg)) return 'That email and password don’t match.';
  if (/no user record|user-not-found/i.test(msg)) return 'No account for that email yet - create one below.';
  if (/already in use/i.test(msg)) return 'That email already has an account - sign in instead.';
  if (/network/i.test(msg)) return 'You appear to be offline.';
  if (/\b10\b|DEVELOPER_ERROR/.test(msg)) return 'Google Sign-In is not configured for this build (check the SHA-1 and web client ID).';
  return msg;
}
