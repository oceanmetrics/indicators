/// <reference types="vitest/config" />
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig, type Plugin } from 'vite'
import { cpSync, createReadStream, existsSync, statSync } from 'node:fs'
import { extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const REPO = resolve(HERE, '..')
const CATALOG = resolve(REPO, 'catalog')
const GOOS = resolve(REPO, 'assets/goos-eov')

const TYPES: Record<string, string> = {
  '.json': 'application/json', '.parquet': 'application/octet-stream', '.webp': 'image/webp', '.png': 'image/png',
}

// dev only: serve a folder outside the Vite root at `prefix`, with Range support. Vite's own file serving answers
// 403 to the colons in `NMS:FKNMS` and `erddap:dhw_5km:...` paths, so the path is decoded here and checked to stay
// inside the folder.
function serveDir(prefix: string, dir: string): Plugin {
  return {
    name: `serve-${prefix.replaceAll('/', '')}`,
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(prefix, (req, res, next) => {
        const file = resolve(dir, '.' + decodeURIComponent((req.url ?? '/').split('?')[0]))
        if (!file.startsWith(dir + sep)) return next()
        let size: number
        try {
          const st = statSync(file)
          if (!st.isFile()) return next()
          size = st.size
        } catch { res.statusCode = 404; return res.end() }
        res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream')
        res.setHeader('Accept-Ranges', 'bytes')
        const m = /bytes=(\d+)-(\d*)/.exec(String(req.headers.range ?? ''))
        if (m) {
          const a = Number(m[1]), b = Math.min(m[2] ? Number(m[2]) : size - 1, size - 1)
          res.statusCode = 206
          res.setHeader('Content-Range', `bytes ${a}-${b}/${size}`)
          res.setHeader('Content-Length', String(b - a + 1))
          return req.method === 'HEAD' ? res.end() : createReadStream(file, { start: a, end: b }).pipe(res)
        }
        res.setHeader('Content-Length', String(size))
        return req.method === 'HEAD' ? res.end() : createReadStream(file).pipe(res)
      })
    },
  }
}

// build: the GOOS EOV badges (64 px WebP, unmodified) ship beside the app at goos-eov/webp/. the favicon set, the
// og:image and the web manifest are the oceanmetrics theme's (brand/favicons/oceanmetrics/, Vite's publicDir), linked by
// that folder's head.html, pasted verbatim into index.html
function assets(): Plugin {
  return {
    name: 'goos-badges',
    closeBundle() {
      const out = resolve(HERE, 'dist')
      if (!existsSync(out)) return
      cpSync(resolve(GOOS, 'webp'), resolve(out, 'goos-eov/webp'), { recursive: true })
    },
  }
}

// base: './' by default so the built viewer works from any path; VITE_BASE overrides (a project site sub-path)
export default defineConfig({
  root: HERE,
  publicDir: resolve(REPO, 'brand/favicons/oceanmetrics'),
  base: process.env.VITE_BASE || './',
  plugins: [svelte(), serveDir('/catalog/', CATALOG), serveDir('/goos-eov/', GOOS), assets()],
  // vitest otherwise resolves svelte's `ssr` export condition and `mount()` refuses to run
  resolve: { conditions: ['browser'] },
  // MapLibre 6 import()s a worker module only when its url ends in .mjs (`importScriptInWorkers`), so worker chunks are .mjs
  worker: { format: 'es', rollupOptions: { output: { entryFileNames: 'assets/[name]-[hash].mjs', chunkFileNames: 'assets/[name]-[hash].mjs' } } },
  // DuckDB-WASM ships its own worker and wasm, which the dep optimizer breaks (obis-hex, atlas, CalCOFI explore)
  optimizeDeps: { exclude: ['@duckdb/duckdb-wasm'] },
  // two pages: the app (index.html) and the embed route (embed/index.html, served at <base>embed/); the app's entry keeps
  // the name `index`, which scripts/size-budget.mjs looks for
  build: {
    target: 'es2022', outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 600, manifest: true,
    rollupOptions: { input: { index: resolve(HERE, 'index.html'), embed: resolve(HERE, 'embed/index.html') } },
  },
  server: { port: 5181, strictPort: true, fs: { allow: [REPO] } },
  preview: { port: 5181, strictPort: true },
})
