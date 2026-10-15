import type { Routes } from '@angular/router';
import { Account } from './auth/account/account';
import { Login } from './auth/login/login';
import { Signup } from './auth/signup/signup';
import { Cookbook } from './cookbook/cookbook/cookbook';
import { authGuard, guestGuard } from './core/auth.guard';
import { Lists } from './lists/lists/lists';
import { RecipeDetail } from './recipes/recipe-detail/recipe-detail';
import { RecipeForm } from './recipes/recipe-form/recipe-form';

export const routes: Routes = [
  { path: 'login', component: Login, canActivate: [guestGuard] },
  { path: 'signup', component: Signup, canActivate: [guestGuard] },
  {
    path: '',
    canActivate: [authGuard],
    children: [
      { path: '', component: Cookbook },
      { path: 'lists', component: Lists },
      { path: 'lists/:id', component: Cookbook },
      { path: 'recipes/new', component: RecipeForm },
      { path: 'recipes/:id', component: RecipeDetail },
      { path: 'recipes/:id/edit', component: RecipeForm },
      { path: 'account', component: Account },
    ],
  },
  { path: '**', redirectTo: '' },
];
