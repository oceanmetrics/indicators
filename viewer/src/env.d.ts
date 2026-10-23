/// <reference types="svelte" />
/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** the storage host (@oceanmetrics/catalog/storage): storage | s3 | preview | an https url; default the package's */
  readonly VITE_OM_STORAGE?: string
  /** the GA4 measurement id (the repository variable VITE_GA_ID); unset = no analytics */
  readonly VITE_GA_ID?: string
}
