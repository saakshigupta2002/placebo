#!/usr/bin/env node
// Render README images from their HTML sources with a local Chrome.
// Needs playwright-core (npm i -D playwright-core, or set PLAYWRIGHT_CORE to its path) and Google Chrome.
//
//   node scripts/render-assets.mjs                       # the how-it-works diagram
//   node scripts/render-assets.mjs card <report.html>    # the trial card hero image
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require(process.env.PLAYWRIGHT_CORE ?? "playwright-core"));
} catch {
  console.error(
    "playwright-core not found. Run `npm i -D playwright-core` or set PLAYWRIGHT_CORE.",
  );
  process.exit(1);
}
const chrome = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].find(existsSync);
const root = resolve(new URL("..", import.meta.url).pathname);
const out = join(root, "docs", "assets");
const [mode, report] = process.argv.slice(2);

const browser = await chromium.launch({ executablePath: chrome, headless: true });
async function shot(file, selector, name, theme, width) {
  const page = await browser.newPage({
    viewport: { width, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: theme,
  });
  await page.goto(`file://${file}`);
  await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
  await page.locator(selector).screenshot({ path: join(out, `${name}-${theme}.png`) });
  await page.close();
  console.log(`wrote docs/assets/${name}-${theme}.png`);
}
for (const theme of ["light", "dark"]) {
  if (mode === "card") await shot(resolve(report), "#trial-card", "trial-card", theme, 1080);
  else await shot(join(out, "src", "how-it-works.html"), "#fig", "how-it-works", theme, 1200);
}
await browser.close();
