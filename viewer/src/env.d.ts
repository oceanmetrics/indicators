/// <reference types="svelte" />
/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** the storage host (@oceanmetrics/catalog/storage): storage | s3 | preview | an https url; default the package's */
  readonly VITE_OM_STORAGE?: string
}
