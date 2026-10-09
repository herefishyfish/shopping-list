import { Component, NO_ERRORS_SCHEMA, inject, signal } from '@angular/core';
import { NativeDialogRef } from '@nativescript/angular';
import { EventData, Utils } from '@nativescript/core';
import { BarcodeResult } from '@nativescript/mlkit-barcode-scanning';
import { DetectionEvent, DetectionType, MLKitView } from '@nativescript/mlkit-core';
import { Subject, distinctUntilChanged, take } from 'rxjs';

/**
 * Full-screen ML Kit QR scanner shown as a native modal. Closes with the first scanned
 * value (or `null` on cancel) – callers decide what the value means. Open it through
 * `ScannerService`.
 */
@Component({
  selector: 'scanner-modal',
  template: `
    <GridLayout class="scanner-modal" iosOverflowSafeArea="true">
      @if (available) {
        <MLKitView
          iosOverflowSafeArea="true"
          class="camera-view"
          cameraPosition="back"
          detectionType="barcode"
          barcodeFormats="qr_code"
          aspectRatio="fill"
          [torchOn]="torch()"
          (loaded)="onLoaded($any($event))"
          (detection)="onDetection($any($event))"
        ></MLKitView>
      }
      <StackLayout class="viewfinder" isUserInteractionEnabled="false"></StackLayout>
      <div class="controls">
        @if (!available) {
          <p class="hint">Scanning isn't supported on this device.</p>
        } @else if (denied()) {
          <p class="hint">Camera access is needed to scan a QR code.</p>
          <button class="btn primary" (tap)="openSettings()">Open settings</button>
        } @else {
          <p class="hint">Point the camera at the QR code from the list's Share → QR code.</p>
          <button class="btn ghost" (tap)="torch.set(!torch())">{{ torch() ? 'Light off' : 'Light on' }}</button>
        }
        <button class="btn primary" (tap)="close(null)">Cancel scan</button>
      </div>
    </GridLayout>
  `,
  styles: [
    `
      .scanner-modal {
        rows: *, auto;
        columns: 10*, 80*, 10*;
        vertical-alignment: bottom;
        height: 100%;
        width: 100%;
        background-color: black;
      }

      .camera-view {
        row-span: 2;
        col-span: 3;
        width: 100%;
        height: 100%;
      }

      .viewfinder {
        row: 0;
        col: 1;
        width: 240;
        height: 240;
        horizontal-alignment: center;
        vertical-alignment: middle;
        border-width: 3;
        border-color: rgba(255, 255, 255, 0.85);
        border-radius: 20;
      }

      .controls {
        row: 1;
        col: 1;
        display: flex;
        flex-direction: column;
        gap: 10;
        padding-bottom: 32;
      }

      .hint {
        color: #ffffff;
        text-align: center;
      }
    `,
  ],
  schemas: [NO_ERRORS_SCHEMA],
})
export class ScannerModalComponent {
  private readonly ref = inject<NativeDialogRef<ScannerModalComponent, string | null>>(NativeDialogRef, { optional: true });

  readonly available = MLKitView.isAvailable();
  readonly denied = signal(false);
  readonly torch = signal(false);

  private readonly scannedValue$ = new Subject<string>();
  private camera?: MLKitView;

  constructor() {
    // The detector fires on every processed frame; close once with the first value.
    this.scannedValue$.pipe(distinctUntilChanged(), take(1)).subscribe((value) => this.close(value));
  }

  onDetection(event: DetectionEvent): void {
    if (event.type !== DetectionType.Barcode) return;
    const results = (Array.isArray(event.data) ? event.data : [event.data]) as BarcodeResult[];
    const value = results[0]?.rawValue ?? results[0]?.displayValue;
    if (value) this.scannedValue$.next(value);
  }

  async onLoaded(event: EventData) {
    this.camera = event.object as unknown as MLKitView;
    if (this.camera.hasCameraPermission()) return;
    try {
      await this.camera.requestCameraPermission();
    } catch {
      // handled below
    }
    if (this.camera.hasCameraPermission()) {
      this.camera.startPreview();
    } else {
      this.denied.set(true);
    }
  }

  openSettings() {
    if (__ANDROID__) {
      const ctx = Utils.android.getApplicationContext();
      const intent = new android.content.Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS, android.net.Uri.parse('package:' + ctx.getPackageName()));
      intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
      ctx.startActivity(intent);
    } else {
      Utils.openUrl(UIApplicationOpenSettingsURLString);
    }
  }

  close(result: string | null) {
    this.camera?.stopPreview();
    this.ref?.close(result);
  }
}
