import { Component } from '@angular/core';
import { type IsActiveMatchOptions, RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-bottom-nav',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './bottom-nav.html',
  styleUrl: './bottom-nav.css',
})
export class BottomNav {
  /** Cookbook is active on `/` with any search or filter, but not on deeper routes. */
  protected readonly homeMatch: IsActiveMatchOptions = {
    paths: 'exact',
    queryParams: 'ignored',
    matrixParams: 'ignored',
    fragment: 'ignored',
  };
}
