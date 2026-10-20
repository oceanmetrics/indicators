// the favicon sets, one rule per test: every file listed exists with the stated pixel size, head.html names only files
// that exist beside it, the manifest parses and its icons exist, the vendored MBON ico equals the recorded sha256,
// favicon.svg + site.webmanifest + head.html regenerate byte-for-byte (rasters are left out: they may differ between
// machines), the colours come from the theme files, and the generator types no hex.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  INSTANCES,
  MBON_ICO,
  OUT_ROOT,
  THEME_SCRIPT,
  generateFaviconSvg,
  generateHead,
  generateManifest,
  loadTokens,
  parseRules,
} from "./build-favicons.mjs";

const ROOT = resolve(__dirname, "..");
const FILES: Record<string, Record<string, [number, number] | null>> = {
  oceanmetrics: {
    "favicon.svg": null,
    "favicon-16x16.png": [16, 16],
    "favicon-32x32.png": [32, 32],
    "favicon.ico": null,
    "apple-touch-icon.png": [180, 180],
    "icon-192.png": [192, 192],
    "icon-512.png": [512, 512],
    "site.webmanifest": null,
    "og-image.png": [1200, 630],
    "head.html": null,
  },
  mbon: {
    "favicon-16x16.png": [16, 16],
    "favicon-32x32.png": [32, 32],
    "favicon.ico": null,
    "apple-touch-icon.png": [180, 180],
    "site.webmanifest": null,
    "og-image.png": [1200, 630],
    "head.html": null,
  },
};
const dir = (theme: string) => resolve(OUT_ROOT, theme);
const read = (theme: string, f: string) => readFileSync(resolve(dir(theme), f), "utf8");
const pngSize = (file: string): [number, number] => {
  const b = readFileSync(file);
  expect(b.subarray(1, 4).toString("latin1")).toBe("PNG");
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
};
const icoSizes = (file: string) => {
  const b = readFileSync(file);
  expect([b.readUInt16LE(0), b.readUInt16LE(2)]).toEqual([0, 1]);
  return Array.from({ length: b.readUInt16LE(4) }, (_, i) => b[6 + i * 16] || 256);
};
const sha = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");

describe.each(Object.keys(FILES))("%s favicon set", (theme) => {
  it("has every file, PNGs at the stated pixel size", () => {
    for (const [f, size] of Object.entries(FILES[theme])) {
      const file = resolve(dir(theme), f);
      expect(existsSync(file), `${theme}/${f} exists`).toBe(true);
      if (size) expect(pngSize(file), `${theme}/${f} pixels`).toEqual(size);
    }
  });

  it("has no favicon.svg exactly when the instance has no vector mark", () => {
    expect(existsSync(resolve(dir(theme), "favicon.svg"))).toBe(INSTANCES[theme as keyof typeof INSTANCES].svg);
  });

  it("head.html references only files that exist in its folder", () => {
    const head = read(theme, "head.html");
    const refs = [...head.matchAll(/\b(?:href|content|src)="\.\/([^"]+)"/g)].map((m) => m[1]);
    expect(refs.length).toBeGreaterThan(4);
    for (const r of refs) expect(existsSync(resolve(dir(theme), r)), `${theme}/head.html -> ${r}`).toBe(true);
    // every link in the block is relative, none points at a file this folder lacks
    for (const m of head.matchAll(/<link\b[^>]*\shref="([^"]+)"/g)) expect(m[1].startsWith("./")).toBe(true);
  });

  it("head.html carries the theme-color pair, og tags, the pre-paint script and the title format", () => {
    const head = read(theme, "head.html");
    expect(head).toContain('media="(prefers-color-scheme: light)"');
    expect(head).toContain('media="(prefers-color-scheme: dark)"');
    for (const p of ["og:title", "og:description", "og:image", "og:type"]) expect(head).toContain(`property="${p}"`);
    expect(head).toContain('name="twitter:card"');
    expect(head).toContain(`<script>${THEME_SCRIPT}</script>`);
    expect(head).toContain("mbon-theme");
    expect(head).toContain("· " + INSTANCES[theme as keyof typeof INSTANCES].titleSuffix);
    // the script sits before every stylesheet
    expect(head.indexOf("<script>")).toBeLessThan(head.includes("<link rel=\"stylesheet\"") ? head.indexOf("<link rel=\"stylesheet\"") : Infinity);
  });

  it("the webmanifest parses and its icons exist at their sizes", () => {
    const m = JSON.parse(read(theme, "site.webmanifest"));
    expect(m.name).toContain("Ocean Metrics Indicators");
    expect(m.icons.length).toBeGreaterThan(0);
    for (const i of m.icons) {
      const file = resolve(dir(theme), i.src);
      expect(existsSync(file)).toBe(true);
      const n = Number(i.sizes.split("x")[0]);
      expect(pngSize(file)).toEqual([n, n]);
    }
  });

  it("regenerating the text outputs in memory equals the committed bytes", () => {
    const inst = INSTANCES[theme as keyof typeof INSTANCES];
    expect(generateManifest(inst)).toBe(read(theme, "site.webmanifest"));
    expect(generateHead(inst)).toBe(read(theme, "head.html"));
    if (inst.svg) expect(generateFaviconSvg(inst)).toBe(read(theme, "favicon.svg"));
  });
});

describe("the ico files", () => {
  it("the Ocean Metrics ico holds 16, 32 and 48 px images", () => {
    expect(icoSizes(resolve(dir("oceanmetrics"), "favicon.ico"))).toEqual([16, 32, 48]);
  });
  it("the MBON set's ico is the vendored file, unmodified, and 48 px", () => {
    expect(sha(resolve(dir("mbon"), "favicon.ico"))).toBe(sha(MBON_ICO));
    expect(icoSizes(MBON_ICO)).toEqual([48]);
  });
  it("the vendored MBON ico equals the sha256 recorded in the README", () => {
    const readme = readFileSync(resolve(OUT_ROOT, "README.md"), "utf8");
    const recorded = /sha256:\s*`([0-9a-f]{64})`/.exec(readme)?.[1];
    expect(recorded).toBeTruthy();
    expect(sha(MBON_ICO)).toBe(recorded);
  });
});

describe("colours come from the theme files", () => {
  const om = INSTANCES.oceanmetrics;
  it("favicon.svg: ring is the light --brand, the dark rule is the dark --link, the waterline is --om-mark-spark", () => {
    const light = loadTokens(om, "light");
    const dark = loadTokens(om, "dark");
    const svg = read("oceanmetrics", "favicon.svg");
    expect(svg).toContain(`.ring{fill:${light["--brand"]}}`);
    expect(svg).toContain(`@media (prefers-color-scheme:dark){.ring{fill:${dark["--link"]}}}`);
    expect(svg).toContain(`fill="${light["--om-mark-spark"]}"`);
    expect(light["--brand"]).not.toBe(dark["--link"]);
  });
  it("the manifest and the theme-color metas carry the --bg-page of each theme", () => {
    for (const inst of Object.values(INSTANCES)) {
      const light = loadTokens(inst, "light");
      const dark = loadTokens(inst, "dark");
      const head = generateHead(inst);
      expect(head).toContain(`content="${light["--bg-page"]}" media="(prefers-color-scheme: light)"`);
      expect(head).toContain(`content="${dark["--bg-page"]}" media="(prefers-color-scheme: dark)"`);
      expect(JSON.parse(generateManifest(inst)).theme_color).toBe(light["--bg-page"]);
    }
  });
  it("MBON tokens come from the kit, with var() resolved, and the spark from mbon.css", () => {
    const light = loadTokens(INSTANCES.mbon, "light");
    expect(light["--bg-page"]).toMatch(/^#[0-9a-f]{6}$/i);
    expect(light["--om-mark-spark"]).toMatch(/^#[0-9a-f]{6}$/i);
    expect(loadTokens(INSTANCES.mbon, "dark")["--bg-page"]).not.toBe(light["--bg-page"]);
  });
  it("parseRules skips @media blocks and reads grouped selectors", () => {
    const rules = parseRules(`/* c */ @media (x){ :root{--a:1} } :root,[data-theme="light"]{--b: var(--c);--c:#fff}`);
    expect(rules).toHaveLength(1);
    expect(rules[0].selectors).toEqual([":root", '[data-theme="light"]']);
    expect(rules[0].decls).toEqual({ "--b": "var(--c)", "--c": "#fff" });
  });
});

describe("the generator", () => {
  it("types no hex colour", () => {
    const src = readFileSync(resolve(ROOT, "brand/build-favicons.mjs"), "utf8");
    expect([...src.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0])).toEqual([]);
  });
});
