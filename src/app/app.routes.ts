import { Routes } from '@angular/router';
import { signedInGuard, signedOutGuard } from './core/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: '/start', pathMatch: 'full' },
  {
    path: 'login',
    canActivate: [signedOutGuard],
    loadComponent: () => import('./pages/login/login.page').then((m) => m.LoginPage),
  },
  {
    // Opens your household list, or first-time setup (create / accept invite / scan QR).
    path: 'start',
    canActivate: [signedInGuard],
    loadComponent: () => import('./pages/start/start.page').then((m) => m.StartPage),
  },
  {
    path: 'list/:id',
    canActivate: [signedInGuard],
    loadComponent: () => import('./pages/list/list.page').then((m) => m.ListPage),
  },
  {
    path: 'settings',
    canActivate: [signedInGuard],
    loadComponent: () => import('./pages/settings/settings.page').then((m) => m.SettingsPage),
  },
  { path: '**', redirectTo: '/start' },
];
