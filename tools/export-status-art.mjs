/** Export editable SVG sources and browser-rasterized PNGs without adding a runtime dependency. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { STATUS_SVGS } from '../src/content/status-art.ts';
import { FINISHED_ART } from '../src/content/finished-art.ts';
const modulePath = process.argv[2] || '../art-source/browser/node_modules/playwright/index.mjs';
const { chromium } = await import(
  modulePath.startsWith('.') ? new URL(modulePath, import.meta.url).href : modulePath
);
const browser = await chromium.launch({
  executablePath: process.env.ART_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage();
mkdirSync('assets/ui/symbols', { recursive: true });
for (const [key, source] of Object.entries(STATUS_SVGS)) {
  const spec = FINISHED_ART[key];
  const encoded = await page.evaluate(
    async ({ source, w, h }) => {
      const img = new Image();
      img.src = 'data:image/svg+xml;base64,' + btoa(source);
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      return canvas.toDataURL('image/png').split(',')[1];
    },
    { source, w: spec.w, h: spec.h },
  );
  writeFileSync(`assets/ui/symbols/${key}.svg`, source + '\n');
  writeFileSync(`assets/${spec.file}`, Buffer.from(encoded, 'base64'));
}
await browser.close();
console.log(`Exported ${Object.keys(STATUS_SVGS).length} SVG/PNG status symbols`);
