import { Component, computed, inject } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, type UrlTree } from '@angular/router';
import { debounceTime, filter, map, Subject } from 'rxjs';
import { AuthService } from '../../core/auth.service';

const isHome = (url: UrlTree) => !url.root.children['primary'];

@Component({
  selector: 'app-header',
  imports: [RouterLink],
  templateUrl: './header.html',
  styleUrl: './header.css',
})
export class Header {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  protected readonly initial = computed(() => this.auth.user()?.email.charAt(0).toUpperCase());

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => this.router.parseUrl(this.router.url)),
    ),
    { initialValue: this.router.parseUrl(this.router.url) },
  );
  /** The search box mirrors `?q=` on the cookbook home and is empty elsewhere. */
  protected readonly query = computed(() => {
    const url = this.url();
    return isHome(url) ? (url.queryParamMap.get('q') ?? '') : '';
  });

  protected readonly typed = new Subject<string>();

  constructor() {
    this.typed.pipe(debounceTime(250), takeUntilDestroyed()).subscribe((q) => {
      const onHome = isHome(this.router.parseUrl(this.router.url));
      // On home, keep other params (filter) and don't add a history entry per keystroke.
      void this.router.navigate(['/'], {
        queryParams: { q: q || null },
        queryParamsHandling: onHome ? 'merge' : null,
        replaceUrl: onHome,
      });
    });
  }
}
