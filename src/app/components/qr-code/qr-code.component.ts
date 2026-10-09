import { Component, NO_ERRORS_SCHEMA, computed, input } from '@angular/core';
import { qrSvg } from '../../core/qr';

/**
 * Renders `value` as a QR code. `qrcode-generator` builds the matrix, `qrSvg` turns it into a
 * single SVG path, and `@nativescript/canvas-svg` draws it natively (Skia), so it stays crisp
 * at any size.
 */
@Component({
  selector: 'qr-code',
  template: `<SvgView [src]="svg()" [width]="size()" [height]="size()" [shareSrc]="false"></SvgView>`,
  schemas: [NO_ERRORS_SCHEMA],
})
export class QrCodeComponent {
  readonly value = input.required<string>();
  readonly size = input(240);
  readonly color = input('#1c2420');

  readonly svg = computed(() => (this.value() ? qrSvg(this.value(), this.color()) : ''));
}
