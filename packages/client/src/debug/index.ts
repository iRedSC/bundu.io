/**
 * Client-only debug tooling (overlay grid, hitboxes, Debug tools panel,
 * visual-definition hot reload).
 *
 * Prod entry must not statically import this barrel — use a `__DEBUG__`-guarded
 * dynamic `import("./debug/tools")` / `import("./debug/config_hot_reload")`
 * from the client entry so Bun can omit the whole tree from production bundles.
 */
export { DEBUG } from "./flag";
export { createObjectDebug, registerObjectDebugFactory } from "./object_debug";
export { mountClientDebug, type ClientDebugHandle } from "./tools";
export type { ObjectDebug } from "./types";
export { noopObjectDebug } from "./types";
