// the storage host the viewer and the Node builders read, chosen once (@oceanmetrics/catalog/storage):
// `data-om-storage` on <html> > VITE_OM_STORAGE (the viewer build) > OM_STORAGE (Node) > the package default
// (path-style S3 until the DNS cutover flips it). every bucket url is `store(key)`; no file keeps a host of its own.
import { resolveStorageHost, storageUrl } from '@oceanmetrics/catalog/storage'

const viteEnv = (import.meta as { env?: Record<string, string | undefined> }).env
const nodeEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env

export const STORAGE = resolveStorageHost(
  typeof document !== 'undefined' ? document.documentElement.dataset.omStorage : undefined,
  viteEnv?.VITE_OM_STORAGE,
  nodeEnv?.OM_STORAGE,
)
/** the url of a bucket key (or prefix) on this build's storage host */
export const store = (key: string): string => storageUrl(key, { host: STORAGE })
