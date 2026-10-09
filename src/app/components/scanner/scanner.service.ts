import { Injectable, inject } from '@angular/core';
import { NativeDialogService } from '@nativescript/angular';
import { isAndroid } from '@nativescript/core';
import { firstValueFrom } from 'rxjs';
import { ScannerModalComponent } from './scanner.component';

@Injectable({ providedIn: 'root' })
export class ScannerService {
  private readonly nativeModal = inject(NativeDialogService);

  open() {
    return this.nativeModal.open<ScannerModalComponent, unknown, string | null>(ScannerModalComponent, {
      nativeOptions: {
        stretched: true,
        fullscreen: isAndroid,
      },
    });
  }

  /** Opens the scanner and resolves with the scanned text, or `null` if cancelled. */
  async scan(): Promise<string | null> {
    return (await firstValueFrom(this.open().afterClosed())) ?? null;
  }
}
