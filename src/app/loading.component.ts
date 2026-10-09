import { Component, NO_ERRORS_SCHEMA, OnDestroy, OnInit, ViewEncapsulation, inject } from '@angular/core';
import { NativeScriptLoadingService } from '@nativescript/angular';
import { CoreTypes, GridLayout, Image, EventData } from '@nativescript/core';
import { filter, take } from 'rxjs/operators';

/**
 * Shown by `runNativeScriptAngularApp({ loadingModule })` while the main app boots (Firebase
 * init + restoring the session). It matches the native splash - brand green with the same
 * `res://logo` - so launch reads as one continuous screen, then fades out once the main app
 * is ready.
 */
@Component({
  selector: 'loading-page',
  template: `
    <GridLayout class="loading" (loaded)="onLoaded($any($event))">
      <Image src="res://logo" width="128" height="128" horizontalAlignment="center" verticalAlignment="center" (loaded)="onLogoLoaded($any($event))"></Image>
    </GridLayout>
  `,
  styles: [
    `
      /* Matches the native splash: @color/splash_background (values / values-night). */
      .loading {
        background-color: #2e7d5b;
      }
      .ns-dark .loading,
      .ns-dark.loading {
        background-color: #16261e;
      }
    `,
  ],
  // Unscoped so `.ns-dark` (on the root view, outside this component) can match.
  encapsulation: ViewEncapsulation.None,
  schemas: [NO_ERRORS_SCHEMA],
})
export class LoadingComponent implements OnInit, OnDestroy {
  private readonly loading = inject(NativeScriptLoadingService);
  private gridLayout?: GridLayout;
  private logo?: Image;
  private pulsing = true;

  ngOnInit() {
    this.loading.waitUntilNotified();
    this.loading.onMainModuleReady$
      .pipe(
        filter((ready) => !!ready),
        take(1),
      )
      .subscribe(async () => {
        this.pulsing = false;
        try {
          await this.gridLayout?.animate({ opacity: 0, duration: 300, curve: CoreTypes.AnimationCurve.easeIn });
        } finally {
          this.loading.notifyReadyToDestroy();
        }
      });
  }

  ngOnDestroy() {
    this.pulsing = false;
  }

  onLoaded(event: EventData) {
    this.gridLayout = event.object as GridLayout;
  }

  /** A gentle "breathing" logo so a slow cold start doesn't look frozen. */
  async onLogoLoaded(event: EventData) {
    this.logo = event.object as Image;
    while (this.pulsing && this.logo) {
      try {
        await this.logo.animate({ scale: { x: 1.06, y: 1.06 }, duration: 700, curve: CoreTypes.AnimationCurve.easeInOut });
        await this.logo.animate({ scale: { x: 1, y: 1 }, duration: 700, curve: CoreTypes.AnimationCurve.easeInOut });
      } catch {
        return; // view torn down mid-animation
      }
    }
  }
}
