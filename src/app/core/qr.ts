/**
 * QR-code join links. Pure - no NativeScript / Firebase imports - so it is unit-tested with
 * plain Node (`npm test`).
 *
 * Payload: `shoppinglist://join?l=<listId>&c=<joinCode>&n=<url-encoded list name>`
 * Everything is ASCII (the name is percent-encoded) so the QR stays in byte mode and any
 * scanner reads it identically.
 */
import qrcode from 'qrcode-generator';

export const JOIN_SCHEME = 'shoppinglist://join';

/** How long a generated QR code can be used to join. */
export const JOIN_CODE_TTL_MS = 24 * 60 * 60 * 1000;

export interface JoinPayload {
  listId: string;
  code: string;
  name: string;
}

const ID = /^[A-Za-z0-9_-]{1,64}$/;

export function buildJoinPayload(p: JoinPayload): string {
  return `${JOIN_SCHEME}?l=${encodeURIComponent(p.listId)}&c=${encodeURIComponent(p.code)}&n=${encodeURIComponent(p.name.slice(0, 60))}`;
}

/** Returns `null` for anything that isn't one of our join codes (other QR codes, URLs, …). */
export function parseJoinPayload(raw: string | null | undefined): JoinPayload | null {
  const value = (raw ?? '').trim();
  if (!value.startsWith(JOIN_SCHEME + '?')) return null;
  const params: Record<string, string> = {};
  for (const part of value.slice(JOIN_SCHEME.length + 1).split('&')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    try {
      params[part.slice(0, eq)] = decodeURIComponent(part.slice(eq + 1));
    } catch {
      return null;
    }
  }
  const { l: listId, c: code, n: name = '' } = params;
  if (!listId || !code || !ID.test(listId) || !ID.test(code)) return null;
  return { listId, code, name: name || 'a shopping list' };
}

/** QR module matrix (`true` = dark) for `value`, error-correction level M. */
export function qrMatrix(value: string): boolean[][] {
  const qr = qrcode(0, 'M');
  qr.addData(value, 'Byte');
  qr.make();
  const n = qr.getModuleCount();
  const rows: boolean[][] = [];
  for (let r = 0; r < n; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < n; c++) row.push(qr.isDark(r, c));
    rows.push(row);
  }
  return rows;
}

/**
 * QR code as SVG markup: one `<path>` of unit squares on a white background, with a quiet
 * zone so scanners can find the edges. Rendered natively by `@nativescript/canvas-svg`, so it
 * stays crisp at any size.
 */
export function qrSvg(value: string, color = '#1c2420', quiet = 2): string {
  const m = qrMatrix(value);
  const size = m.length + quiet * 2;
  let d = '';
  for (let r = 0; r < m.length; r++) {
    for (let c = 0; c < m.length; c++) {
      // Merge horizontal runs of dark modules into one rectangle to keep the path short.
      if (!m[r][c] || (c > 0 && m[r][c - 1])) continue;
      let run = 1;
      while (c + run < m.length && m[r][c + run]) run++;
      d += `M${c + quiet} ${r + quiet}h${run}v1h-${run}z`;
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" shape-rendering="crispEdges">` +
    `<rect width="${size}" height="${size}" fill="#ffffff"/>` +
    `<path d="${d}" fill="${color}"/></svg>`
  );
}
