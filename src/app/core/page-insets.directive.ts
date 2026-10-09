import { Directive, ElementRef, OnDestroy, OnInit, inject } from '@angular/core';
import { EventData, Page, Utils, View, isAndroid } from '@nativescript/core';

/**
 * Status bar that matches the theme on Android edge-to-edge (put it on each page's
 * `<GridLayout class="screen" pageInsets>` root).
 *
 * By default `Page` pads itself for all system bars, so both strips show the Page background.
 * Instead the Page is told not to apply insets (`dont-apply`) and:
 *  - top / sides → Page padding. The Page background is the ActionBar colour (app.scss), so the
 *    status bar strip continues the ActionBar.
 *  - bottom (navigation bar, or keyboard when open) → padding on the `.screen` root, so that
 *    strip shows the normal page background and content stays above the keyboard.
 * No-op on iOS, where the ActionBar already extends under the status bar.
 */
@Directive({ selector: '[pageInsets]' })
export class PageInsetsDirective implements OnInit, OnDestroy {
  private readonly page = inject(Page, { optional: true });
  private readonly screen = inject<ElementRef<View>>(ElementRef).nativeElement;
  private readonly listener = (args: EventData & { inset: any }) => this.apply(args.inset);

  ngOnInit() {
    if (!isAndroid || !this.page) return;
    this.page.androidOverflowEdge = 'dont-apply';
    this.page.on(View.androidOverflowInsetEvent, this.listener);
  }

  ngOnDestroy() {
    if (isAndroid) this.page?.off(View.androidOverflowInsetEvent, this.listener);
  }

  private apply(inset: any) {
    const dip = (px: number) => Utils.layout.toDeviceIndependentPixels(Math.max(0, px || 0));
    const style = this.page!.style;
    style.paddingTop = dip(inset.top);
    style.paddingLeft = dip(inset.left);
    style.paddingRight = dip(inset.right);
    style.paddingBottom = 0;
    // Keyboard height (when open) already includes the navigation bar.
    this.screen.style.paddingBottom = dip(Math.max(inset.bottom, inset.imeBottom));
    inset.topConsumed = inset.leftConsumed = inset.rightConsumed = true;
    inset.bottomConsumed = inset.imeBottomConsumed = true;
  }
}
