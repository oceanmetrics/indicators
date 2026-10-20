// screenshots the contact sheet (brand/v1/icons/index.html, after npm run icons:build) in headless Chrome:
// docs/shots/icons_light.png and icons_dark.png at 1100 px, DPR 2, full page, plus icons_light_390.png at 390 px.
//   node brand/icon-sheet.mjs
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SHEET = resolve(ROOT, "brand/v1/icons/index.html");
const OUT = resolve(ROOT, "docs/shots");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
try {
  const page = await browser.newPage();
  const shoot = async (theme, width, file) => {
    await page.setViewport({ width, height: 900, deviceScaleFactor: 2 });
    await page.goto(pathToFileURL(SHEET).href + `?theme=${theme}`, { waitUntil: "load" });
    await page.evaluate((t) => { document.documentElement.dataset.theme = t; }, theme);
    await new Promise((r) => setTimeout(r, 300));
    await page.screenshot({ path: resolve(OUT, file), fullPage: true });
  };
  await shoot("light", 1100, "icons_light.png");
  await shoot("dark", 1100, "icons_dark.png");
  await shoot("light", 390, "icons_light_390.png");
} finally {
  await browser.close();
}
process.stdout.write("icon-sheet: wrote docs/shots/icons_light.png, icons_dark.png, icons_light_390.png\n");
