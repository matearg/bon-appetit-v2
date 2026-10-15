import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth.service';
import { BottomNav } from './shell/bottom-nav/bottom-nav';
import { Header } from './shell/header/header';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Header, BottomNav],
  template: `
    @if (auth.user()) {
      <app-header />
    }
    <router-outlet />
    @if (auth.user()) {
      <app-bottom-nav />
    }
  `,
  // Column layout lets the phone bottom nav sit at the viewport bottom on short pages.
  styles: ':host { display: flex; flex-direction: column; min-height: 100dvh; }',
})
export class App {
  protected readonly auth = inject(AuthService);
}
