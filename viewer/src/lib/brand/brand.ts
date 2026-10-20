// the instance brand: `?brand=oceanmetrics|mbon` (default oceanmetrics). the theme files are token files; the one
// the instance names is injected after the kit's stylesheet so its tokens win.
import mbonCss from '../../../../brand/themes/mbon.css?inline'
import omCss from '../../../../brand/themes/oceanmetrics.css?inline'
import markRaw from '../../../../brand/marks/ocean-metrics-mark.svg?raw'

export type Brand = 'oceanmetrics' | 'mbon'
export const DEFAULT_BRAND: Brand = 'oceanmetrics'

export function parseBrand(search: string): Brand {
  const v = new URLSearchParams(search).get('brand')
  return v === 'mbon' || v === 'oceanmetrics' ? v : DEFAULT_BRAND
}

/**
 * the ensō mark, with its fixed waterline fill handed to the theme's --om-mark-spark token. the ring keeps
 * currentColor, so the mark wears --brand / --link wherever it is placed.
 */
export function themedMark(svg: string): string {
  return svg.replace(/fill="#[0-9a-fA-F]{3,8}"/g, 'fill="var(--om-mark-spark)"')
}

export const MARK_SVG = themedMark(markRaw)

export const APP_NAME = 'Ocean Metrics Indicators'
export const TAGLINE = 'any place · any indicator · over time'

export function titleFor(brand: Brand): string {
  return brand === 'mbon' ? `${APP_NAME} · MBON` : `${APP_NAME} · Ocean Metrics`
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
