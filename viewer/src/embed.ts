// the embed route (`<base>embed/#card=<place_id>|<indicator>`): one IndicatorCard with no app chrome. the same
// stylesheets, theme (`?theme=`) and brand (`?brand=`) as the app; Embed.svelte sets data-state="done" when it is drawn.
import { mount } from 'svelte'
import '@marinebon/ui/styles.css'
import './app.css'
import '../../brand/themes/dataviz.css'
import { initTheme } from '@marinebon/ui'
import { applyBrand, parseBrand } from './lib/brand/brand.ts'
import Embed from './Embed.svelte'

const brand = parseBrand(location.search)
applyBrand(brand)
initTheme()

export default mount(Embed, { target: document.getElementById('app')!, props: { brand } })
