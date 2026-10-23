// the instance brand: `?brand=oceanmetrics|mbon` (default oceanmetrics). the theme files are token files; the one
// the instance names is injected after the kit's stylesheet so its tokens win.
import mbonCss from '../../../../brand/themes/mbon.css?inline'
import omCss from '../../../../brand/themes/oceanmetrics.css?inline'

export type Brand = 'oceanmetrics' | 'mbon'
export const DEFAULT_BRAND: Brand = 'oceanmetrics'

export function parseBrand(search: string): Brand {
  const v = new URLSearchParams(search).get('brand')
  return v === 'mbon' || v === 'oceanmetrics' ? v : DEFAULT_BRAND
}

/** where the bar's "What changed" goes: the alerts page, which holds the feeds and the subscription form */
export const CHANGES_HREF = 'https://oceanmetrics.io/alerts/'

/**
 * the attributes of the shared bar (`<om-nav>`, @oceanmetrics/nav), or null for the MBON instance, which keeps the kit's Header and
 * never loads the bar. `theme` is the viewer's resolved theme, so the bar follows ?theme= and the toggle as the page does.
 */
export function navAttrs(brand: Brand, theme: 'light' | 'dark'): { current: string; theme: string; 'changes-href': string } | null {
  return brand === 'mbon' ? null : { current: 'indicators', theme, 'changes-href': CHANGES_HREF }
}

export const APP_NAME = 'Ocean Metrics Indicators'
export const TAGLINE = 'any place · any indicator · over time'

export function titleFor(brand: Brand): string {
  return brand === 'mbon' ? `${APP_NAME} · MBON` : `${APP_NAME} · Ocean Metrics`
}

/** the page title of a view: "Matrix · Ocean Metrics Indicators", or "Matrix · MBON" for the MBON instance (brand/favicons/mbon/head.html) */
export function pageTitle(brand: Brand, view: string): string {
  return brand === 'mbon' ? `${view} · MBON` : `${view} · ${APP_NAME}`
}

/** the Fraunces subset the "Ocean" wordmark needs (Google Fonts, only the five letters) */
export const WORDMARK_FONT_URL = 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@60,600&display=swap&text=Ocean'

/** inject the brand's token file after the kit's stylesheet, and the wordmark font for the Ocean Metrics header */
export function applyBrand(brand: Brand, doc: Document = document): void {
  const style = doc.createElement('style')
  style.id = 'brand-theme'
  style.dataset.brand = brand
  style.textContent = brand === 'mbon' ? mbonCss : omCss
  doc.head.appendChild(style)
  doc.documentElement.dataset.brand = brand
  doc.title = titleFor(brand)
  if (brand === 'oceanmetrics') {
    const link = doc.createElement('link')
    link.rel = 'stylesheet'
    link.href = WORDMARK_FONT_URL
    doc.head.appendChild(link)
  }
}
