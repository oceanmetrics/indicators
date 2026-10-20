// what the viewer imports at run time: the renderer, the up-front paths and the eov- names. the whole map
// (ICON_PATHS, ICON_SOURCES, ICON_FAMILIES) is in ./icon-paths.ts for the build scripts and tests; importing it at run
// time would pull the eov- paths into the first load.
export { CORE_PATHS, EOV_NAMES } from "./icon-core.ts";
export type { IconName } from "./icon-paths.ts";
export { default as Icon } from "./Icon.svelte";
export { isEovName, loadEov } from "./eov.svelte.ts";
