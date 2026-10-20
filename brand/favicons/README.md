# Favicon sets, og:images and head blocks

One folder per theme of Ocean Metrics Indicators. Each holds a complete set and a `head.html` to paste verbatim into
`<head>`, before any stylesheet.

| folder | for | mark |
|---|---|---|
| `oceanmetrics/` | the default theme: every instance except MBON (sanctuaries, OBIS, ...) | the Ocean Metrics ensō |
| `mbon/` | the MBON instance | the MBON squircle favicon, used as published |

## Files

`oceanmetrics/`

| file | what it is |
|---|---|
| `favicon.svg` | the ensō on a transparent ground. Ring in the light-theme `--brand` teal, the waterline in `--om-mark-spark` (the fixed sun). An embedded `prefers-color-scheme: dark` rule turns the ring `--link` sky teal so it reads on dark browser chrome. The waterline is stroked (90 grid units) so it stays visible at tab size |
| `favicon-16x16.png`, `favicon-32x32.png` | the same mark, rasterised with headless Chrome on a transparent ground. The waterline is a straight 2 px line centred on a pixel boundary, so it stays crisp (the brushstroke's wobble smears across rows at this size) |
| `favicon.ico` | 16, 32 and 48 px images (`magick`) |
| `apple-touch-icon.png` | 180 px, opaque, on the light `--bg-page`, mark at about 76% of the width (about 12% padding) |
| `icon-192.png`, `icon-512.png` | maskable (`purpose: "any maskable"`): the mark inside the 80% safe-zone circle, on the light `--bg-page` |
| `site.webmanifest` | name "Ocean Metrics Indicators", short name "OM Indicators", `theme_color` and `background_color` from the light `--bg-page`, the two icons above |
| `og-image.png` | 1200 x 630: the mark, "Ocean" in Fraunces 600 (opsz 60) and "Metrics" in IBM Plex Mono, "Indicators" in Space Grotesk, and the line "any place · any indicator · over time", on the light theme tokens |
| `head.html` | the block to paste (below) |

`mbon/`

| file | what it is |
|---|---|
| `favicon.ico` | `brand/marks/mbon-favicon.ico`, byte for byte |
| `favicon-16x16.png`, `favicon-32x32.png` | downscaled from that ico (Lanczos) |
| `apple-touch-icon.png` | 180 px, upscaled from the 48 px ico (Lanczos) onto the kit's light `--bg-page` so iOS gets no black corners. **It is soft**: see the gap below |
| `site.webmanifest` | name "Ocean Metrics Indicators · MBON", short name "MBON Indicators", the 32 and 180 px icons |
| `og-image.png` | 1200 x 630: the kit's MBON wordmark (`@marinebon/ui` `img/mbon-logo.png`), "Ocean Metrics Indicators" and the same line, on the kit's light tokens |
| `head.html` | the block to paste. No `favicon.svg` link |

There is no `favicon.svg` and there are no 192/512 icons for MBON: it has no vector or larger mark.

## Use

Paste `head.html` verbatim, before any stylesheet. It carries:

- the favicon links and the manifest, all as `./...` paths relative to the folder. A site that serves the files from
  another path changes that prefix, in every line, once;
- `theme-color` for light and dark, `og:*` and `twitter:*` tags. The `og:image` and `twitter:image` URLs must be
  absolute for crawlers: a deployed page makes them so;
- an inline script that sets the theme before first paint, with the kit's rule from `@marinebon/ui` `theme.js`:
  `?theme=light|dark`, then `localStorage` key `mbon-theme`, then `prefers-color-scheme`. It writes `data-theme` and
  `color-scheme` on `<html>`;
- a comment that page titles are "&lt;view&gt; · Ocean Metrics Indicators" ("... · MBON" for the MBON instance).

## Regenerate

```sh
node brand/build-favicons.mjs
npx vitest run brand/favicons.test.ts
```

Colours are read from `brand/themes/oceanmetrics.css` (and, for MBON, the kit's `tokens.css` plus `brand/themes/mbon.css`);
the script types no hex. It needs Chrome (`CHROME_PATH`, default `/Applications/Google Chrome.app`), `magick`, `puppeteer-core`,
and the network once, for the Fraunces subset (`&text=Ocean`) from Google Fonts. The other fonts are the kit's own woff2.
`favicon.svg`, `site.webmanifest` and `head.html` are byte-deterministic and are compared by the test. The PNG and ICO
bytes may differ between machines, so the test checks their sizes only.

## Sources and credits

- **Ocean Metrics mark:** `brand/marks/ocean-metrics-mark.svg`, copied from `static/img/logos/ocean-metrics-mark.svg` in
  `oceanmetrics/oceanmetrics.github.io`. Ring in `currentColor`, waterline in the fixed sun.
- **MBON favicon:** `brand/marks/mbon-favicon.ico`, vendored unmodified from <https://marinebon.org/img/favicon.ico>
  (the file at `static/img/favicon.ico` in `marinebon/marinebon.github.io`; 48 x 48, 9,662 bytes).
  sha256: `bc111ea8cb12e018b15f8cc18af79d951ce9178e9ad7ae7ca6a2256ef0548fc9`
- **MBON wordmark:** `@marinebon/ui` v0.4.0, `dist/img/mbon-logo.png`.
- **Fonts:** Fraunces, IBM Plex Mono, IBM Plex Sans, Space Grotesk, all SIL OFL 1.1.

## Known gaps

- **MBON has no larger or vector mark.** Its only published icon is the 48 x 48 `favicon.ico`, so the 180 px
  `apple-touch-icon.png` is an upscale and looks soft on a home screen, there is no `favicon.svg`, and there are no
  maskable icons. A gap to close with MBON: ask for an SVG or a 512 px PNG of the squircle.
- **The ICO and PNG favicons of the Ocean Metrics set keep the light-theme teal** on a transparent ground: a `.ico`
  cannot follow the browser theme. Only `favicon.svg` does, in browsers that use it.
- **The 16 to 48 px rasters use a straight waterline** rather than the brushstroke, which would smear across pixel rows.
