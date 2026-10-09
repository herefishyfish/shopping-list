import { Routes } from '@angular/router';
import { signedInGuard, signedOutGuard } from './core/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: '/lists', pathMatch: 'full' },
  {
    path: 'login',
    canActivate: [signedOutGuard],
    loadComponent: () => import('./pages/login/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'lists',
    canActivate: [signedInGuard],
    loadComponent: () => import('./pages/lists/lists.page').then((m) => m.ListsPage),
  },
  {
    path: 'settings',
    canActivate: [signedInGuard],
    loadComponent: () => import('./pages/settings/settings.page').then((m) => m.SettingsPage),
  },
  {
    path: 'lists/:id',
    canActivate: [signedInGuard],
    loadComponent: () => import('./pages/list/list.page').then((m) => m.ListPage),
  },
  { path: '**', redirectTo: '/lists' },
];
