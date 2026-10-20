// the favicon sets, og:images and paste-verbatim head.html for the two themes of Ocean Metrics Indicators
// (brand/favicons/<theme>/). Every colour is read FROM the theme files (brand/themes/oceanmetrics.css, and the kit's
// tokens.css + brand/themes/mbon.css for MBON); this file types no hex. The text generators are PURE functions of the
// tokens, so a test regenerates favicon.svg, site.webmanifest and head.html in memory and compares bytes. Importing
// this module writes nothing; only main() touches the filesystem, and only when the script is run directly.
//   node brand/build-favicons.mjs      writes brand/favicons/{oceanmetrics,mbon}/*
// Raster files (PNG, ICO) are made with headless Chrome (puppeteer-core) and ImageMagick (`magick`); the og-images
// need the network once, for the Fraunces subset from Google Fonts. Raster bytes may differ between machines.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const OUT_ROOT = resolve(ROOT, "brand/favicons");
export const MARK_FILE = resolve(ROOT, "brand/marks/ocean-metrics-mark.svg");
export const MBON_ICO = resolve(ROOT, "brand/marks/mbon-favicon.ico");
export const KIT_DIR = resolve(ROOT, "node_modules/@marinebon/ui/dist");
export const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

export const TAGLINE = "any place · any indicator · over time";
export const DESCRIPTION =
  "Marine indicators for any place, over time, from open data. Every number carries its dataset, method and place.";

// ---- instances ----
// files: the theme files whose tokens apply, in cascade order
export const INSTANCES = {
  oceanmetrics: {
    id: "oceanmetrics",
    name: "Ocean Metrics Indicators",
    short_name: "OM Indicators",
    titleSuffix: "Ocean Metrics Indicators",
    files: [resolve(ROOT, "brand/themes/oceanmetrics.css")],
    svg: true,
    manifestIcons: [
      ["icon-192.png", 192, "any maskable"],
      ["icon-512.png", 512, "any maskable"],
    ],
  },
  mbon: {
    id: "mbon",
    name: "Ocean Metrics Indicators · MBON",
    short_name: "MBON Indicators",
    titleSuffix: "MBON",
    files: [resolve(KIT_DIR, "tokens.css"), resolve(ROOT, "brand/themes/mbon.css")],
    svg: false,
    manifestIcons: [
      ["favicon-32x32.png", 32, "any"],
      ["apple-touch-icon.png", 180, "any"],
    ],
  },
};

// ---- tokens ----
// a small CSS reader: top-level rules only (an @media block is skipped), declarations of custom properties.
export function parseRules(css) {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = [];
  let i = 0;
  const skipBlock = (j) => {
    let depth = 1;
    while (j < src.length && depth > 0) {
      if (src[j] === "{") depth++;
      else if (src[j] === "}") depth--;
      j++;
    }
    return j;
  };
  while (i < src.length) {
    const open = src.indexOf("{", i);
    if (open < 0) break;
    const prelude = src.slice(i, open).trim();
    if (prelude.startsWith("@")) {
      i = skipBlock(open + 1);
      continue;
    }
    const close = src.indexOf("}", open);
    const decls = {};
    for (const d of src.slice(open + 1, close).split(";")) {
      const m = /^\s*(--[\w-]+)\s*:\s*([\s\S]+?)\s*$/.exec(d);
      if (m) decls[m[1]] = m[2];
    }
    rules.push({ selectors: prelude.split(",").map((s) => s.trim()), decls });
    i = close + 1;
  }
  return rules;
}

const resolveVars = (value, vars, seen = new Set()) =>
  value.replace(/var\(\s*(--[\w-]+)\s*(?:,[^)]*)?\)/g, (_, name) => {
    if (seen.has(name)) throw new Error(`token cycle at ${name}`);
    if (!(name in vars)) throw new Error(`token ${name} is not defined`);
    return resolveVars(vars[name], vars, new Set([...seen, name]));
  });

// the resolved tokens of one theme ("light" or "dark") of an instance; dark is light plus the dark overrides,
// as the cascade does it
export function loadTokens(inst, theme) {
  const rules = inst.files.flatMap((f) => parseRules(readFileSync(f, "utf8")));
  const sels = theme === "dark" ? [':root', '[data-theme="light"]', '[data-theme="dark"]'] : [':root', '[data-theme="light"]'];
  const raw = {};
  for (const sel of sels) {
    for (const r of rules) if (r.selectors.includes(sel)) Object.assign(raw, r.decls);
  }
  const out = {};
  for (const [k, v] of Object.entries(raw)) out[k] = resolveVars(v, raw);
  return out;
}

const need = (tokens, name) => {
  if (!tokens[name]) throw new Error(`token ${name} is missing`);
  return tokens[name];
};

// ---- the mark ----
// the ring paths and the waterline path, read from the committed mark (ring: every path but the last)
export function readMark(file = MARK_FILE) {
  const ds = [...readFileSync(file, "utf8").matchAll(/<path\b[^>]*\sd="([^"]+)"/g)].map((m) => m[1]);
  if (ds.length < 2) throw new Error("the mark needs a ring and a waterline");
  return { ring: ds.slice(0, -1), spark: ds[ds.length - 1] };
}

// the mark's centre and extent in its own 2048 grid: the ring spans x 453..1596, y 453..1604, its centre y 1028; the waterline 262..1780
const MARK_CX = 1024;
const SPARK_X0 = 262;
const SPARK_X1 = 1780;
const MARK_CY = 1026; // the waterline's centre line, so it lands on a pixel boundary at even sizes

// the mark as an <svg> of `side` grid units square, centred; `stroke` thickens the waterline so it survives 16 px
// (the brushstroke is ~14 units thin: it vanishes below ~64 px unthickened). `style` makes the ring a class.
// `flat` swaps the brushstroke for a straight line over the same extent: at 16 to 48 px its wobble (+-15 units) only
// smears across pixel rows.
export function markSvg({ mark, ring, spark, side, stroke, px = null, ground = null, style = "", flat = false }) {
  const x = MARK_CX - side / 2;
  const y = MARK_CY - side / 2;
  const size = px ? ` width="${px}" height="${px}"` : "";
  const bg = ground ? `<rect x="${x}" y="${y}" width="${side}" height="${side}" fill="${ground}"/>` : "";
  const ringAttr = style ? `class="ring"` : `fill="${ring}"`;
  const sparkStroke = stroke ? ` stroke="${spark}" stroke-width="${stroke}" stroke-linejoin="round"` : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${side} ${side}"${size}>` +
    style +
    bg +
    `<g ${ringAttr}>${mark.ring.map((d) => `<path d="${d}"/>`).join("")}</g>` +
    (flat
      ? `<line x1="${SPARK_X0}" x2="${SPARK_X1}" y1="${MARK_CY}" y2="${MARK_CY}" stroke="${spark}" stroke-width="${stroke}"/>`
      : `<path fill="${spark}"${sparkStroke} d="${mark.spark}"/>`) +
    `</svg>`
  );
}

// favicon.svg: a transparent ground, the ring in the light brand teal and the waterline in the fixed sun; a dark
// browser chrome gets the sky-teal link colour on the ring through an embedded media query
export function generateFaviconSvg(inst, mark = readMark()) {
  const light = loadTokens(inst, "light");
  const dark = loadTokens(inst, "dark");
  const style =
    `<style>.ring{fill:${need(light, "--brand")}}` +
    `@media (prefers-color-scheme:dark){.ring{fill:${need(dark, "--link")}}}</style>`;
  const svg = markSvg({
    mark, ring: need(light, "--brand"), spark: need(light, "--om-mark-spark"), side: 1620, stroke: 90, style,
  });
  return svg + "\n";
}

// ---- manifest ----
export function generateManifest(inst) {
  const light = loadTokens(inst, "light");
  return (
    JSON.stringify(
      {
        name: inst.name,
        short_name: inst.short_name,
        description: DESCRIPTION,
        start_url: "./",
        display: "standalone",
        theme_color: need(light, "--bg-page"),
        background_color: need(light, "--bg-page"),
        icons: inst.manifestIcons.map(([src, n, purpose]) => ({
          src, sizes: `${n}x${n}`, type: "image/png", purpose,
        })),
      },
      null,
      2,
    ) + "\n"
  );
}

// ---- head.html ----
// the inline pre-paint script: the kit's theme.js precedence (?theme= > localStorage "mbon-theme" > system), written
// to data-theme and color-scheme on <html>; every read is guarded, so a blocked storage still themes the page
export const THEME_SCRIPT =
  `(function(){var d=document.documentElement,t=null;` +
  `try{var q=new URLSearchParams(location.search).get("theme");if(q==="light"||q==="dark")t=q}catch(e){}` +
  `if(!t){try{var s=localStorage.getItem("mbon-theme");if(s==="light"||s==="dark")t=s}catch(e){}}` +
  `if(!t){try{t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}catch(e){t="light"}}` +
  `d.dataset.theme=t;d.style.colorScheme=t})();`;

export function generateHead(inst) {
  const light = loadTokens(inst, "light");
  const dark = loadTokens(inst, "dark");
  const bgLight = need(light, "--bg-page");
  const bgDark = need(dark, "--bg-page");
  const title = inst.titleSuffix;
  const svgLink = inst.svg ? `<link rel="icon" type="image/svg+xml" href="./favicon.svg">\n` : "";
  return (
`<!-- ${inst.name}: brand head (${inst.id} theme). Paste verbatim into <head>, BEFORE any stylesheet.
     Every path is relative to this file's folder. A site that serves the set elsewhere changes the "./" prefix
     once, in every line below. The og:image and twitter:image URLs must be absolute for a crawler to fetch them:
     a deployed page replaces "./" with its origin and path there.
     Page titles are "<view> · ${title}", for example "Matrix · ${title}".
     The inline script sets the theme before first paint, so there is no flash of the wrong colour. It follows the
     kit's rule (@marinebon/ui theme.js): ?theme=light|dark, then localStorage "mbon-theme", then the system
     prefers-color-scheme. It must stay inline. -->
<script>${THEME_SCRIPT}</script>
${svgLink}<link rel="icon" type="image/x-icon" sizes="32x32" href="./favicon.ico">
<link rel="icon" type="image/png" sizes="32x32" href="./favicon-32x32.png">
<link rel="icon" type="image/png" sizes="16x16" href="./favicon-16x16.png">
<link rel="apple-touch-icon" sizes="180x180" href="./apple-touch-icon.png">
<link rel="manifest" href="./site.webmanifest">
<meta name="theme-color" content="${bgLight}" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="${bgDark}" media="(prefers-color-scheme: dark)">
<meta property="og:site_name" content="${inst.name}">
<meta property="og:type" content="website">
<meta property="og:title" content="${inst.name}">
<meta property="og:description" content="${DESCRIPTION}">
<meta property="og:image" content="./og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${inst.name}: ${TAGLINE}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${inst.name}">
<meta name="twitter:description" content="${DESCRIPTION}">
<meta name="twitter:image" content="./og-image.png">
`);
}

// ---- og-image pages ----
const kitFontCss = () =>
  readFileSync(resolve(KIT_DIR, "fonts.css"), "utf8").replace(
    /url\("\.\/fonts\//g,
    `url("${pathToFileURL(resolve(KIT_DIR, "fonts")).href}/`,
  );

const FRAUNCES_URL =
  "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@60,600&text=Ocean&display=block";

export function ogHtmlOceanmetrics(mark = readMark()) {
  const t = loadTokens(INSTANCES.oceanmetrics, "light");
  const svg = markSvg({
    mark, ring: need(t, "--brand"), spark: need(t, "--om-mark-spark"), side: 1700, stroke: 26, px: 340,
  });
  return `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${FRAUNCES_URL}"><style>
${kitFontCss()}
*{box-sizing:border-box;margin:0}
html,body{width:1200px;height:630px;overflow:hidden}
body{background:${need(t, "--bg-page")};display:flex;align-items:center;gap:56px;padding:0 84px 0 76px;position:relative}
.mark{flex:none;display:block}
.txt{display:flex;flex-direction:column;min-width:0}
.word{display:flex;align-items:baseline;gap:18px;white-space:nowrap}
.word .a{font:600 112px/1 "Fraunces",serif;color:${need(t, "--text-heading")};letter-spacing:-0.01em}
.word .b{font:500 84px/1 "IBM Plex Mono",monospace;color:${need(t, "--brand")};letter-spacing:-0.04em}
.ind{margin-top:14px;font:700 76px/1.05 "Space Grotesk",sans-serif;color:${need(t, "--text-heading")};letter-spacing:-0.02em}
.rule{height:0;margin:34px 0 28px}
.line{font:500 28px/1.3 "IBM Plex Mono",monospace;color:${need(t, "--text-body")};letter-spacing:0.01em;white-space:nowrap}
</style></head><body>
<div class="mark">${svg}</div>
<div class="txt"><div class="word"><span class="a">Ocean</span><span class="b">Metrics</span></div>
<div class="ind">Indicators</div><div class="rule"></div><div class="line">${TAGLINE}</div></div>
</body></html>`;
}

export function ogHtmlMbon() {
  const t = loadTokens(INSTANCES.mbon, "light");
  const logo = pathToFileURL(resolve(KIT_DIR, "img/mbon-logo.png")).href;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${kitFontCss()}
*{box-sizing:border-box;margin:0}
html,body{width:1200px;height:630px;overflow:hidden}
body{background:${need(t, "--bg-page")};display:flex;flex-direction:column;justify-content:center;padding:0 96px;position:relative}
img{display:block;width:820px;height:auto}
.rule{height:0;margin:48px 0 40px}
.ind{font:700 84px/1.05 "Space Grotesk",sans-serif;color:${need(t, "--text-heading")};letter-spacing:-0.02em;white-space:nowrap}
.line{margin-top:30px;font:500 30px/1.3 "IBM Plex Mono",monospace;color:${need(t, "--label-color")};letter-spacing:0.01em}
</style></head><body>
<img src="${logo}" alt="">
<div class="rule"></div>
<div class="ind">Ocean Metrics Indicators</div>
<div class="line">${TAGLINE}</div>
</body></html>`;
}

// ---- rasters ----
const px = (n) => `${n}x${n}`;

function magick(...args) {
  execFileSync("magick", args, { stdio: ["ignore", "pipe", "inherit"] });
}

export async function buildRasters({ outDir, instId }) {
  const inst = INSTANCES[instId];
  const t = loadTokens(inst, "light");
  if (instId === "mbon") {
    // MBON publishes one 48x48 favicon.ico: it is the set's ico untouched; the PNGs are resampled from it
    copyFileSync(MBON_ICO, resolve(outDir, "favicon.ico"));
    for (const n of [16, 32]) {
      magick(`${MBON_ICO}[0]`, "-filter", "Lanczos", "-resize", px(n), `png32:${resolve(outDir, `favicon-${px(n)}.png`)}`);
    }
    magick(
      `${MBON_ICO}[0]`, "-filter", "Lanczos", "-resize", px(180), "-background", need(t, "--bg-page"),
      "-alpha", "remove", "-alpha", "off", `png24:${resolve(outDir, "apple-touch-icon.png")}`,
    );
    return;
  }
  const { default: puppeteer } = await import("puppeteer-core");
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
  const tmp = mkdtempSync(resolve(tmpdir(), "om-favicons-"));
  try {
    const mark = readMark();
    const shot = async (svg, n, bg) => {
      const page = await browser.newPage();
      await page.setViewport({ width: n, height: n, deviceScaleFactor: 1 });
      await page.setContent(
        `<!doctype html><html><body style="margin:0;background:${bg ?? "transparent"}">${svg}</body></html>`,
      );
      const buf = await page.screenshot({ type: "png", omitBackground: !bg, clip: { x: 0, y: 0, width: n, height: n } });
      await page.close();
      return buf;
    };
    // ring + waterline on a transparent ground; the waterline's stroke (in output px) grows as the icon shrinks
    const stroke = { 16: 203, 32: 101, 48: 67 }; // 2 px each: the waterline is centred on a pixel boundary
    const small = (n) =>
      markSvg({ mark, ring: need(t, "--brand"), spark: need(t, "--om-mark-spark"), side: 1620, stroke: stroke[n], px: n, flat: true });
    for (const n of [16, 32, 48]) {
      const file = n === 48 ? resolve(tmp, "favicon-48x48.png") : resolve(outDir, `favicon-${px(n)}.png`);
      writeFileSync(file, await shot(small(n), n, null));
    }
    magick(
      resolve(outDir, "favicon-16x16.png"), resolve(outDir, "favicon-32x32.png"), resolve(tmp, "favicon-48x48.png"),
      resolve(outDir, "favicon.ico"),
    );
    // opaque icons on the light page ground: apple-touch with ~12% padding, maskable with the mark in the safe zone
    const bg = need(t, "--bg-page");
    const opaque = (n, side) =>
      markSvg({ mark, ring: need(t, "--brand"), spark: need(t, "--om-mark-spark"), side, stroke: 40, px: n, ground: bg });
    writeFileSync(resolve(outDir, "apple-touch-icon.png"), await shot(opaque(180, 2050), 180, bg));
    writeFileSync(resolve(outDir, "icon-192.png"), await shot(opaque(192, 1950), 192, bg));
    writeFileSync(resolve(outDir, "icon-512.png"), await shot(opaque(512, 1950), 512, bg));
    // the og-image
    await ogShot(browser, ogHtmlOceanmetrics(mark), resolve(outDir, "og-image.png"), tmp);
  } finally {
    await browser.close();
    rmSync(tmp, { recursive: true, force: true });
  }
}

async function ogShot(browser, html, file, tmp) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
  const htmlFile = resolve(tmp, "og.html");
  writeFileSync(htmlFile, html);
  await page.goto(pathToFileURL(htmlFile).href, { waitUntil: "networkidle0" });
  await page.evaluate(() => document.fonts.ready);
  const fams = html.includes("Fraunces")
    ? ['600 40px "Fraunces"', '500 40px "IBM Plex Mono"', '700 40px "Space Grotesk"']
    : ['500 40px "IBM Plex Mono"', '700 40px "Space Grotesk"'];
  for (const f of fams) {
    const ok = await page.evaluate((spec) => document.fonts.check(spec, "Ocean"), f);
    if (!ok) throw new Error(`font not loaded for the og-image: ${f} (is the network up?)`);
  }
  writeFileSync(file, await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: 1200, height: 630 } }));
  await page.close();
}

async function buildMbonOg(outDir) {
  const { default: puppeteer } = await import("puppeteer-core");
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
  const tmp = mkdtempSync(resolve(tmpdir(), "om-favicons-"));
  try {
    await ogShot(browser, ogHtmlMbon(), resolve(outDir, "og-image.png"), tmp);
  } finally {
    await browser.close();
    rmSync(tmp, { recursive: true, force: true });
  }
}

// ---- main ----
export async function main() {
  if (!existsSync(MBON_ICO)) throw new Error(`vendored MBON favicon missing: ${MBON_ICO}`);
  for (const inst of Object.values(INSTANCES)) {
    const dir = resolve(OUT_ROOT, inst.id);
    mkdirSync(dir, { recursive: true });
    if (inst.svg) writeFileSync(resolve(dir, "favicon.svg"), generateFaviconSvg(inst));
    writeFileSync(resolve(dir, "site.webmanifest"), generateManifest(inst));
    writeFileSync(resolve(dir, "head.html"), generateHead(inst));
    await buildRasters({ outDir: dir, instId: inst.id });
    if (inst.id === "mbon") await buildMbonOg(dir);
    console.log(`wrote ${dir}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
