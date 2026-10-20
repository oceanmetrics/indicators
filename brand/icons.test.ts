// the icon pipeline's rules, one test each: MDI paths equal their @mdi/js export; bespoke and eov paths are one valid
// path inside the grid with no two the same; regenerating the map, sprite and CSS in memory is byte-identical to
// the committed files; the v1 lock; the families; glyph colour contrast in both themes and modes; no hex literal
// outside the token and theme files.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import * as mdi from "@mdi/js";
import { describe, expect, it } from "vitest";
import {
  BESPOKE_FILE,
  EOV_FILE,
  EOV_META_FILE,
  ICON_MAP_FILE,
  CORE_FILE,
  EOV_PATHS_FILE,
  OUTPUT_FILE,
  generateEovPathsSource,
  generateIconCoreSource,
  generateIconPathsSource,
  resolveIconPaths,
} from "./build-icon-paths.mjs";
import { CSS_FILE, LOCK_FILE, SPRITE_FILE, checkLock, generateCss, generateSprite } from "./build-icons.mjs";
import { ICON_FAMILIES, ICON_PATHS, ICON_SOURCES } from "../src/icons/icon-paths";
import { CORE_PATHS, EOV_NAMES } from "../src/icons/icon-core";
import { EOV_PATHS } from "../src/icons/icon-paths-eov";

const ROOT = resolve(__dirname, "..");
const readJson = (f: string, fb: any = {}) => (existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : fb);
const ICON_MAP = readJson(ICON_MAP_FILE) as Record<string, string>;
const BESPOKE = readJson(BESPOKE_FILE) as Record<string, string>;
const EOV = readJson(EOV_FILE) as Record<string, string>;
const EOV_META = readJson(EOV_META_FILE);
const MDI = mdi as unknown as Record<string, string>;
const PATHS = ICON_PATHS as Record<string, string>;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

// ---- a small SVG path reader (bounds by sampling curves and arcs) ----
const CMD_ARGS: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
function parsePath(d: string) {
  expect(d, "only path commands and numbers").toMatch(/^[MmLlHhVvCcSsQqTtAaZz0-9.\s,\-+eE]+$/);
  const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? [];
  const out: { cmd: string; args: number[] }[] = [];
  let i = 0;
  expect(tokens[0]?.toUpperCase(), "starts with a moveto").toBe("M");
  while (i < tokens.length) {
    const cmd = tokens[i++];
    if (!(cmd.toUpperCase() in CMD_ARGS) || !/[A-Za-z]/.test(cmd)) throw new Error(`unexpected "${cmd}"`);
    const n = CMD_ARGS[cmd.toUpperCase()];
    if (n === 0) { out.push({ cmd, args: [] }); continue; }
    let first = true;
    do {
      const args = tokens.slice(i, i + n).map(Number);
      if (args.length < n || args.some((a) => Number.isNaN(a))) throw new Error(`${cmd} needs ${n} numbers`);
      i += n;
      out.push({ cmd: first || cmd.toUpperCase() !== "M" ? cmd : cmd === "M" ? "L" : "l", args });
      first = false;
    } while (i < tokens.length && !/[A-Za-z]/.test(tokens[i]));
  }
  return out;
}
function arcPoints(x1: number, y1: number, rx: number, ry: number, phi: number, fa: number, fs: number, x2: number, y2: number) {
  if (rx === 0 || ry === 0) return [[x2, y2]];
  const c = Math.cos((phi * Math.PI) / 180), s = Math.sin((phi * Math.PI) / 180);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  const x1p = c * dx + s * dy, y1p = -s * dx + c * dy;
  rx = Math.abs(rx); ry = Math.abs(ry);
  const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const k = (fa === fs ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cxp = (k * rx * y1p) / ry, cyp = (-k * ry * x1p) / rx;
  const cx = c * cxp - s * cyp + (x1 + x2) / 2, cy = s * cxp + c * cyp + (y1 + y2) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const th1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dth = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!fs && dth > 0) dth -= 2 * Math.PI;
  if (fs && dth < 0) dth += 2 * Math.PI;
  const pts: number[][] = [];
  for (let t = 0; t <= 64; t++) {
    const th = th1 + (dth * t) / 64;
    pts.push([cx + c * rx * Math.cos(th) - s * ry * Math.sin(th), cy + s * rx * Math.cos(th) + c * ry * Math.sin(th)]);
  }
  return pts;
}
/** every point the path draws through (curves and arcs sampled), absolute */
function pathPoints(d: string) {
  const pts: number[][] = [];
  let x = 0, y = 0, sx = 0, sy = 0, px = 0, py = 0, prev = "";
  for (const { cmd, args: a } of parsePath(d)) {
    const rel = cmd !== cmd.toUpperCase(), C = cmd.toUpperCase();
    const ox = rel ? x : 0, oy = rel ? y : 0;
    if (C === "M") { x = ox + a[0]; y = oy + a[1]; sx = x; sy = y; pts.push([x, y]); }
    else if (C === "L") { x = ox + a[0]; y = oy + a[1]; pts.push([x, y]); }
    else if (C === "H") { x = ox + a[0]; pts.push([x, y]); }
    else if (C === "V") { y = oy + a[0]; pts.push([x, y]); }
    else if (C === "Z") { x = sx; y = sy; }
    else if (C === "C" || C === "S" || C === "Q" || C === "T") {
      let p1: number[], p2: number[], p3: number[];
      if (C === "C") { p1 = [ox + a[0], oy + a[1]]; p2 = [ox + a[2], oy + a[3]]; p3 = [ox + a[4], oy + a[5]]; }
      else if (C === "S") { p1 = /[CcSs]/.test(prev) ? [2 * x - px, 2 * y - py] : [x, y]; p2 = [ox + a[0], oy + a[1]]; p3 = [ox + a[2], oy + a[3]]; }
      else if (C === "Q") { p1 = [ox + a[0], oy + a[1]]; p2 = p1; p3 = [ox + a[2], oy + a[3]]; }
      else { p1 = /[QqTt]/.test(prev) ? [2 * x - px, 2 * y - py] : [x, y]; p2 = p1; p3 = [ox + a[0], oy + a[1]]; }
      const quad = C === "Q" || C === "T";
      for (let t = 0; t <= 16; t++) {
        const u = t / 16, v = 1 - u;
        pts.push(quad
          ? [v * v * x + 2 * v * u * p1[0] + u * u * p3[0], v * v * y + 2 * v * u * p1[1] + u * u * p3[1]]
          : [v ** 3 * x + 3 * v * v * u * p1[0] + 3 * v * u * u * p2[0] + u ** 3 * p3[0], v ** 3 * y + 3 * v * v * u * p1[1] + 3 * v * u * u * p2[1] + u ** 3 * p3[1]]);
      }
      px = quad ? p1[0] : p2[0]; py = quad ? p1[1] : p2[1]; x = p3[0]; y = p3[1];
      prev = cmd; continue;
    } else if (C === "A") {
      const ex = ox + a[5], ey = oy + a[6];
      pts.push(...arcPoints(x, y, a[0], a[1], a[2], a[3], a[4], ex, ey));
      x = ex; y = ey;
    }
    prev = cmd;
  }
  return pts;
}

const hand = { ...BESPOKE, ...Object.fromEntries(Object.entries(EOV).filter(([n]) => ICON_SOURCES[n as keyof typeof ICON_SOURCES] === "eov-trace")) };

describe("icon-paths", () => {
  it("every MDI-backed name's path equals its @mdi/js export, character for character", () => {
    for (const [name, exportName] of Object.entries(ICON_MAP)) {
      expect(MDI[exportName], `@mdi/js has no export "${exportName}"`).toBeTypeOf("string");
      expect(PATHS[name], name).toBe(MDI[exportName]);
      expect(ICON_SOURCES[name as keyof typeof ICON_SOURCES]).toBe(`mdi:${exportName}`);
    }
  });

  it("every bespoke and eov path is one valid path inside the 24-px grid", () => {
    expect(Object.keys(hand).length).toBeGreaterThanOrEqual(14);
    for (const [name, d] of Object.entries(hand)) {
      expect(PATHS[name], `${name} is in the map`).toBe(d);
      const pts = pathPoints(d);
      expect(pts.length, name).toBeGreaterThan(3);
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      for (const v of [...xs, ...ys]) expect(v, `${name} stays inside 0..24`).toBeGreaterThanOrEqual(-1e-6);
      for (const v of [...xs, ...ys]) expect(v, `${name} stays inside 0..24`).toBeLessThanOrEqual(24 + 1e-6);
    }
  });

  it("the path reader can fail: a stray character, too few numbers, no moveto", () => {
    expect(() => parsePath("M1 2 L3 4 ?")).toThrow();
    expect(() => parsePath("M1 2 L3")).toThrow(/needs 2 numbers/);
    expect(() => parsePath("L1 2")).toThrow();
  });

  it("no two names share a path, and every path is non-empty", () => {
    const seen = new Map<string, string>();
    for (const [name, d] of Object.entries(PATHS)) {
      expect(d.length, name).toBeGreaterThan(10);
      expect(seen.get(d), `${name} duplicates ${seen.get(d)}`).toBeUndefined();
      seen.set(d, name);
    }
  });

  it("regenerating icon-paths.ts, icon-core.ts and icon-paths-eov.ts is byte-identical to the committed files", () => {
    const { paths, sources } = resolveIconPaths(ICON_MAP, MDI, BESPOKE, EOV, EOV_META);
    expect(generateIconPathsSource(paths, sources)).toBe(readFileSync(OUTPUT_FILE, "utf8"));
    expect(generateIconCoreSource(paths)).toBe(readFileSync(CORE_FILE, "utf8"));
    expect(generateEovPathsSource(paths)).toBe(readFileSync(EOV_PATHS_FILE, "utf8"));
  });

  // the viewer loads icon-core.ts up front and icon-paths-eov.ts on first use (the traced eov- paths were 19 kB of a
  // 31 kB map in the first load, which put the entry over its budget on 2026-10-20): the two parts are the whole map
  it("the viewer's two parts split the map by family and together are the whole of it, in name order", () => {
    const core = Object.keys(CORE_PATHS), eov = Object.keys(EOV_PATHS);
    expect(core.some((n) => n.startsWith("eov-"))).toBe(false);
    expect(eov.every((n) => n.startsWith("eov-"))).toBe(true);
    expect([...EOV_NAMES]).toEqual(eov);
    expect(Object.keys(ICON_PATHS)).toEqual([...core, ...eov].sort());
    expect({ ...CORE_PATHS, ...EOV_PATHS }).toEqual(ICON_PATHS);
  });

  it("regenerating om-icons.svg and icons.css is byte-identical to the committed files", () => {
    expect(generateSprite(PATHS)).toBe(readFileSync(SPRITE_FILE, "utf8"));
    expect(generateCss(PATHS)).toBe(readFileSync(CSS_FILE, "utf8"));
  });

  it("the sprite is well formed: one symbol per glyph, a comment with no double hyphen, credits present", () => {
    const sprite = readFileSync(SPRITE_FILE, "utf8");
    const comment = sprite.slice(sprite.indexOf("<!--") + 4, sprite.indexOf("-->"));
    expect(comment).not.toContain("--");
    expect(comment).toContain("Pictogrammers, Apache-2.0");
    expect(comment).toContain("adapted from the GOOS EOV icons (Martín Míguez et al. 2026, Front. Mar. Sci., CC BY): traced, monochrome, rescaled");
    expect(sprite.match(/<symbol /g)?.length).toBe(Object.keys(PATHS).length);
    expect(sprite).not.toMatch(/\bfill="(?!currentColor)/);
  });

  it("icons.css exposes every glyph as a mask property and class, and the pipeline helpers without a hex", () => {
    const css = readFileSync(CSS_FILE, "utf8");
    for (const name of Object.keys(PATHS)) {
      expect(css).toContain(`--om-icon-${name}: url(`);
      expect(css).toContain(`.om-i-${name} { --om-i: var(--om-icon-${name}); }`);
    }
    expect(css).toContain(".om-pipe-dataset { color: var(--pipe-dataset-ink, var(--pipe-dataset)); }");
    for (const p of ["place", "method", "delivery"]) expect(css).toContain(`.om-pipe-${p} {`);
    expect(css).toMatch(/\.om-i \{[^}]*mask: var\(--om-i\) no-repeat center \/ contain/);
  });
});

describe("the v1 lock", () => {
  const lock = readJson(LOCK_FILE) as Record<string, string>;
  it("exists and covers glyphs", () => {
    expect(Object.keys(lock).length).toBeGreaterThanOrEqual(73);
  });
  it("every locked glyph exists with an identical sha256 (a later build may add names, never change one)", () => {
    for (const [name, hash] of Object.entries(lock)) {
      expect(PATHS[name], `locked glyph "${name}" is gone`).toBeTypeOf("string");
      expect(sha(PATHS[name]), `locked glyph "${name}" changed`).toBe(hash);
    }
    expect(checkLock(PATHS, lock)).toEqual([]);
  });
  it("the lock check can fail: a changed and a vanished glyph are both reported", () => {
    const seeded = { ...lock, "ui-search": sha("M0 0"), "ui-gone": sha("M1 1") };
    expect(checkLock(PATHS, seeded)).toEqual(['locked glyph "ui-search" changed', 'locked glyph "ui-gone" is gone']);
  });
});

describe("generator rules", () => {
  it("fails loudly on a missing MDI export, a name collision and a duplicate path", () => {
    expect(() => resolveIconPaths({ "ui-x": "mdiNoSuchExport" }, MDI)).toThrow(/no export named/);
    expect(() => resolveIconPaths({ "ui-search": "mdiMagnify" }, MDI, { "ui-search": "M0 0L1 1Z" })).toThrow(/defined twice/);
    expect(() => resolveIconPaths({ "ui-a": "mdiMagnify", "ui-b": "mdiMagnify" }, MDI)).toThrow(/duplicate path/);
  });
  it("an unreadable eov trace falls back to its MDI export, resolved by name", () => {
    const r = resolveIconPaths({}, MDI, {}, { "eov-a": "M0 0L2 2Z" }, { "eov-a": { readable_16: false, fallback: "mdiWaves" } });
    expect(r.paths["eov-a"]).toBe(MDI.mdiWaves);
    expect(r.sources["eov-a"]).toBe("mdi-fallback:mdiWaves");
    expect(() => resolveIconPaths({}, MDI, {}, {}, { "eov-a": { readable_16: false, fallback: "mdiNoSuch" } })).toThrow(/no export/);
  });
  it("brand/glyphs.py draws exactly the committed bespoke.json", () => {
    let py = "";
    try { py = execFileSync("python3", ["--version"], { encoding: "utf8" }); } catch { return; }
    expect(py).toMatch(/Python 3/);
    execFileSync("python3", [join(ROOT, "brand/glyphs.py"), "--check"], { stdio: "pipe" });
  });
});

describe("families", () => {
  const present = Object.keys(ICON_FAMILIES);
  it.each(["ui", "view", "el", "depth", "onms", "eov", "place", "st", "tr", "cell"])("%s is present and non-empty", (f) => {
    expect(present).toContain(f);
    expect((ICON_FAMILIES as Record<string, readonly string[]>)[f].length).toBeGreaterThan(0);
  });
  it("every name sits in the family of its prefix", () => {
    for (const [f, names] of Object.entries(ICON_FAMILIES)) for (const n of names) expect(n.startsWith(`${f}-`)).toBe(true);
    expect(Object.values(ICON_FAMILIES).flat().length).toBe(Object.keys(PATHS).length);
  });
  it("st- and tr- glyphs differ in shape from each other", () => {
    const names = Object.keys(PATHS).filter((n) => n.startsWith("st-") || n.startsWith("tr-"));
    expect(names.length).toBeGreaterThanOrEqual(7);
    expect(new Set(names.map((n) => PATHS[n])).size).toBe(names.length);
  });
});

// ---- contrast: glyph colour roles on both grounds, both themes, both modes ----
type Block = { selectors: string[]; decls: [string, string][] };
const parseBlocks = (css: string): Block[] =>
  [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selectors: m[1].split(",").map((s) => s.trim()),
    decls: m[2].split(";").map((d) => d.trim()).filter(Boolean).map((d) => {
      const i = d.indexOf(":");
      return [d.slice(0, i).trim(), d.slice(i + 1).trim()] as [string, string];
    }),
  }));
function cascade(files: string[], mode: "light" | "dark") {
  const env = new Map<string, string>();
  for (const file of files) {
    for (const b of parseBlocks(readFileSync(file, "utf8"))) {
      if (b.selectors.some((s) => s === ":root" || s.replace(/\s/g, "") === `[data-theme="${mode}"]`)) {
        for (const [k, v] of b.decls) if (k.startsWith("--")) env.set(k, v);
      }
    }
  }
  return env;
}
function resolveVar(value: string, env: Map<string, string>, depth = 0): string {
  if (depth > 20) throw new Error(`var() loop at ${value}`);
  const m = /var\(\s*(--[\w-]+)\s*(?:,((?:[^()]|\([^()]*\))*))?\)/.exec(value);
  if (!m) return value.trim();
  const got = env.get(m[1]) ?? m[2]?.trim();
  if (got === undefined) throw new Error(`${m[1]} is not defined`);
  return resolveVar(value.replace(m[0], got), env, depth + 1);
}
function hexToRgb(h: string) {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(h.trim());
  if (!m) throw new Error(`not an opaque hex colour: ${h}`);
  const s = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
}
const lum = (rgb: number[]) => {
  const [r, g, b] = rgb.map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string) => {
  const [hi, lo] = [lum(hexToRgb(a)), lum(hexToRgb(b))].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
// the colours a glyph is ever drawn in: the text roles, links, labels and the pipeline inks. --accent is not one: in
// both brands it is the edge and surface accent (DESIGN.md: teal-bright for "hover edges, focus glow"; the kit:
// active-state fills), never a glyph or text colour here, and its light value is under 3:1 on the page in both
// (oceanmetrics #1aa0bd 2.93:1; the kit's #38a7bb 2.70:1, reported upstream for @marinebon/ui). keep it out of glyphs.
const ROLES = ["--text-strong", "--text-heading", "--text-body", "--link", "--label-color",
  "--pipe-dataset-ink", "--pipe-place-ink", "--pipe-method-ink", "--pipe-delivery-ink"];
const GROUNDS = ["--bg-page", "--bg-surface"];
const KIT = resolve(ROOT, "node_modules/@marinebon/ui/dist/tokens.css");
const THEMES = { oceanmetrics: resolve(ROOT, "brand/themes/oceanmetrics.css"), mbon: resolve(ROOT, "brand/themes/mbon.css") };

function contrastResults() {
  const rows: { theme: string; mode: string; role: string; ground: string; fg: string; bg: string; ratio: number }[] = [];
  for (const [theme, file] of Object.entries(THEMES)) {
    for (const mode of ["light", "dark"] as const) {
      const env = cascade([KIT, file], mode);
      for (const role of ROLES) for (const ground of GROUNDS) {
        const fg = resolveVar(`var(${role})`, env), bg = resolveVar(`var(${ground})`, env);
        rows.push({ theme, mode, role, ground, fg, bg, ratio: ratio(fg, bg) });
      }
    }
  }
  return rows;
}

describe("glyph contrast (WCAG 2.1 non-text, >= 3:1)", () => {
  const rows = contrastResults();
  it("measures the reference pairs correctly", () => {
    expect(ratio("#ffffff", "#000000")).toBeCloseTo(21, 5);
    expect(ratio("#fff", "#000")).toBeCloseTo(21, 5);
    expect(ratio("#767676", "#ffffff")).toBeCloseTo(4.54, 1);
  });
  it("resolves var() chains, fallbacks and the kit's cascade (a seeded fault is caught)", () => {
    const env = cascade([KIT], "dark");
    expect(resolveVar("var(--text-strong)", env)).toMatch(/^#[0-9a-f]{6}$/i);
    expect(resolveVar("var(--nope, var(--bg-page))", env)).toBe(resolveVar("var(--bg-page)", env));
    expect(() => resolveVar("var(--nope)", env)).toThrow(/not defined/);
    // gold on paper fails: the gate can fail
    expect(ratio("#e8c24a", "#ffffff")).toBeLessThan(3);
  });
  it("covers 2 themes x 2 modes x 9 roles x 2 grounds", () => {
    expect(rows.length).toBe(2 * 2 * ROLES.length * GROUNDS.length);
  });
  it("every glyph colour role reaches 3:1 on --bg-page and --bg-surface in both themes and both modes", () => {
    const failures = rows.filter((r) => r.ratio < 3).map((r) => `[${r.theme} ${r.mode}] ${r.role} ${r.fg} on ${r.ground} ${r.bg}: ${r.ratio.toFixed(2)}:1`);
    expect(failures).toEqual([]);
  });
});

// ---- no hex literal outside the token and theme files ----
const HEX = /#[0-9a-fA-F]{3,8}\b/;
function walk(dir: string, out: string[] = []) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === "dist") continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
describe("no hex colour literal outside the token and theme files", () => {
  const files = [
    ...walk(join(ROOT, "src")).filter((f) => /\.(ts|js|mjs|svelte|css|html)$/.test(f)),
    ...walk(join(ROOT, "viewer/src")),
    ...readdirSync(join(ROOT, "brand")).filter((f) => f.endsWith(".mjs")).map((f) => join(ROOT, "brand", f)),
    join(ROOT, "brand/glyphs.py"),
    CSS_FILE,
    SPRITE_FILE,
  ];
  it("scans the app, the viewer, the brand scripts, icons.css and the sprite", () => {
    expect(files.length).toBeGreaterThan(8);
  });
  it("finds none", () => {
    const hits = files.filter((f) => HEX.test(readFileSync(f, "utf8"))).map((f) => f.replace(ROOT + "/", ""));
    expect(hits).toEqual([]);
  });
  it("the scan can fail: a hex colour is caught", () => {
    expect(HEX.test('fill: #f5b528;')).toBe(true);
    expect(HEX.test("use #ui-search")).toBe(false);
  });
});

// ---- text contrast (WCAG 2.1 AA, >= 4.5:1) ----
// the colours body text, headings, links and labels are set in, on the page and on a surface, in both themes and both
// modes. --text-muted is for captions only (DESIGN.md: "reserved for captions"), so it is held to the 3:1 of large or
// incidental text, not 4.5.
describe("text contrast (WCAG 2.1 AA)", () => {
  const TEXT = ["--text-strong", "--text-heading", "--text-body", "--link", "--label-color"];
  const rows: string[] = [];
  const muted: string[] = [];
  for (const [theme, file] of Object.entries(THEMES)) {
    for (const mode of ["light", "dark"] as const) {
      const env = cascade([KIT, file], mode);
      for (const ground of GROUNDS) {
        const bg = resolveVar(`var(${ground})`, env);
        for (const role of TEXT) {
          const fg = resolveVar(`var(${role})`, env);
          if (ratio(fg, bg) < 4.5) rows.push(`[${theme} ${mode}] ${role} ${fg} on ${ground} ${bg}: ${ratio(fg, bg).toFixed(2)}:1`);
        }
        const m = resolveVar("var(--text-muted)", env);
        if (ratio(m, bg) < 3) muted.push(`[${theme} ${mode}] --text-muted ${m} on ${ground} ${bg}: ${ratio(m, bg).toFixed(2)}:1`);
      }
    }
  }
  it("body text, headings, links and labels reach 4.5:1 in both themes and modes", () => {
    expect(rows).toEqual([]);
  });
  // the kit's own --text-muted (#8499a3) is 2.83:1 on its light page, and the mbon theme keeps the kit's tokens as
  // they are (a decision), so the viewer never draws text or marks in it: --text-body instead
  it("muted caption text reaches 3:1 except the kit's own light value, which the viewer never uses", () => {
    expect(muted.filter((m) => !m.startsWith("[mbon light]"))).toEqual([]);
    const uses = walk(resolve(ROOT, "viewer/src")).filter((f) => /\.(svelte|ts|css)$/.test(f))
      .filter((f) => /var\(--text-muted\)/.test(readFileSync(f, "utf8")));
    expect(uses).toEqual([]);
  });
});
