import { mount } from 'svelte'
import '@marinebon/ui/styles.css'
import './app.css'
import '../../brand/themes/dataviz.css'
import { initTheme } from '@marinebon/ui'
import { applyBrand, parseBrand } from './lib/brand/brand.ts'
import App from './App.svelte'

// the instance brand (?brand=oceanmetrics|mbon) goes in after the kit's stylesheet, the theme (?theme=) was set
// before first paint by index.html, and initTheme() keeps following the system until the reader chooses
const brand = parseBrand(location.search)
applyBrand(brand)
initTheme()
// the shared bar is its own lazy chunk (4.9 kB gzip): the MBON instance never shows it, so it never pays for it
if (brand !== 'mbon') import('@oceanmetrics/nav/define')

export default mount(App, { target: document.getElementById('app')!, props: { brand } })
