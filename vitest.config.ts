import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vitest/config'

// one vitest run covers the shared modules (src/), the brand scripts and the viewer
export default defineConfig({
  plugins: [svelte()],
  test: {
    include: ['src/**/*.test.ts', 'brand/**/*.test.{ts,mjs}', 'viewer/src/**/*.test.ts'],
    environment: 'node',
    globals: true,
  },
})
