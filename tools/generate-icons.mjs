// Renders the SVG sources in resources/ into every platform asset NativeScript needs.
//
//   npm run icons
//
// Uses Playwright's Chromium for SVG rasterisation (so output matches what browsers show)
// and needs no other image tooling. Run `npx playwright install chromium` once if Playwright
// can't find a browser.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const res = (p) => join(root, 'resources', p);
const out = (p) => join(root, 'App_Resources', p);

const BRAND = '#2e7d5b';
const icon = readFileSync(res('icon.svg'), 'utf8');
const glyph = readFileSync(res('icon-glyph.svg'), 'utf8');
const glyphInner = glyph.slice(glyph.indexOf('<path'), glyph.lastIndexOf('</svg>'));

/** Glyph only (transparent), cropped to its bounding area - for splash screens. */
const splashGlyph = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="21 21 66 66">${glyphInner}</svg>`;
/** Legacy (pre-API 26) Android launcher: rounded square with a small margin. */
const legacyAndroid = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108">
  <rect x="6" y="6" width="96" height="96" rx="22" fill="${BRAND}"/>
  <g transform="translate(54 54) scale(1.12) translate(-54 -54)">${glyphInner}</g></svg>`;
const solid = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="${BRAND}"/></svg>`;

const browser = await chromium.launch();
const page = await browser.newPage();

async function render(svg, file, width, height = width, { opaque = false } = {}) {
  await page.setViewportSize({ width, height });
  const sized = svg.replace(/<svg\b[^>]*>/, (tag) => tag.replace(/\s(width|height)="[^"]*"/g, '').replace(/>$/, ` width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet">`));
  await page.setContent(`<html><body style="margin:0;background:${opaque ? BRAND : 'transparent'}">${sized}</body></html>`);
  const png = await page.screenshot({ omitBackground: !opaque, clip: { x: 0, y: 0, width, height } });
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, png);
  console.log(`  ${file.replace(root + '/', '')} (${width}x${height})`);
}

console.log('iOS app icon');
const contents = JSON.parse(readFileSync(out('iOS/Assets.xcassets/AppIcon.appiconset/Contents.json'), 'utf8'));
for (const img of contents.images) {
  if (!img.filename) continue;
  const px = Math.round(parseFloat(img.size) * parseInt(img.scale));
  await render(icon, out(`iOS/Assets.xcassets/AppIcon.appiconset/${img.filename}`), px, px, { opaque: true });
}

console.log('iOS launch screen');
for (const [suffix, scale] of [['', 1], ['@2x', 2], ['@3x', 3]]) {
  await render(splashGlyph, out(`iOS/Assets.xcassets/LaunchScreen.Center.imageset/LaunchScreen-Center${suffix}.png`), 128 * scale);
  await render(solid, out(`iOS/Assets.xcassets/LaunchScreen.AspectFill.imageset/LaunchScreen-AspectFill${suffix}.png`), 768 * scale, 1024 * scale, { opaque: true });
}

const densities = { ldpi: 0.75, mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
console.log('Android legacy launcher icons');
for (const [d, scale] of Object.entries(densities)) {
  if (d === 'ldpi') continue;
  await render(legacyAndroid, out(`Android/src/main/res/mipmap-${d}/ic_launcher.png`), Math.round(48 * scale));
}
console.log('Android splash logo (res://logo)');
for (const [d, scale] of Object.entries(densities)) {
  await render(splashGlyph, out(`Android/src/main/res/drawable-${d}/logo.png`), Math.round(128 * scale));
}

await browser.close();
console.log('Done. Adaptive icon (vector) lives in drawable/ic_launcher_foreground.xml.');
