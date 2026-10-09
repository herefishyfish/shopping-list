import { Directive, ElementRef, OnDestroy, OnInit, inject, input } from '@angular/core';
import { EventData, Utils, View, isAndroid } from '@nativescript/core';

type Edge = 'top' | 'bottom' | 'left' | 'right';

/**
 * Android edge-to-edge helper for surfaces NativeScript doesn't inset for us.
 *
 * Routed pages are fine: `Page` uses `androidOverflowEdge: 'none'`, so it pads itself for the
 * status bar, navigation bar and keyboard. Full-screen modals and bottom sheets don't, so their
 * content ends up under the system bars. Put this on the root *core layout* of such a surface:
 *
 *   <GridLayout androidInsets="bottom" [insetsTarget]="controls">…<div #controls>…</div></GridLayout>
 *
 * The layout itself stays full-bleed (`dont-apply`), and the insets (system bars, plus the
 * keyboard for the bottom edge) are applied as margin on `insetsTarget`, or as padding on the
 * layout when no target is given. No-op on iOS, which uses safe areas.
 */
@Directive({ selector: '[androidInsets]' })
export class AndroidInsetsDirective implements OnInit, OnDestroy {
  /** Comma-separated edges to inset, e.g. "bottom" or "top,bottom". */
  readonly androidInsets = input<string>('bottom');
  /**
   * View that receives the insets as margin (a template ref; typed loosely because Angular types
   * `#ref` on a `div` as HTMLDivElement). Defaults to the host, as padding.
   */
  readonly insetsTarget = input<any>(null);

  private readonly host = inject<ElementRef<View>>(ElementRef).nativeElement;
  private readonly listener = (args: EventData & { inset: any }) => this.apply(args.inset);

  ngOnInit() {
    if (!isAndroid) return;
    this.host.androidOverflowEdge = 'dont-apply';
    this.host.on(View.androidOverflowInsetEvent, this.listener);
  }

  ngOnDestroy() {
    if (isAndroid) this.host.off(View.androidOverflowInsetEvent, this.listener);
  }

  private apply(inset: any) {
    const edges = new Set(this.androidInsets().split(',').map((e) => e.trim() as Edge));
    const raw = this.insetsTarget();
    const target: View = (raw?.nativeElement ?? raw) || this.host;
    const prop = target === this.host ? 'padding' : 'margin';
    const dip = (px: number) => Utils.layout.toDeviceIndependentPixels(Math.max(0, px || 0));

    if (edges.has('top')) {
      target[`${prop}Top`] = dip(inset.top);
      inset.topConsumed = true;
    }
    if (edges.has('bottom')) {
      // Keyboard height (when open) already includes the navigation bar.
      target[`${prop}Bottom`] = dip(Math.max(inset.bottom, inset.imeBottom));
      inset.bottomConsumed = true;
      inset.imeBottomConsumed = true;
    }
    if (edges.has('left')) {
      target[`${prop}Left`] = dip(inset.left);
      inset.leftConsumed = true;
    }
    if (edges.has('right')) {
      target[`${prop}Right`] = dip(inset.right);
      inset.rightConsumed = true;
    }
  }
}
