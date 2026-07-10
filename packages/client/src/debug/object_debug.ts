import {
    noopObjectDebug,
    type ObjectDebug,
    type ObjectDebugInit,
} from "./types";

type Factory = (init: ObjectDebugInit) => ObjectDebug;

let factory: Factory | null = null;

/** Called by debug tools mount so entity overlays stay out of prod bundles. */
export function registerObjectDebugFactory(fn: Factory) {
    factory = fn;
}

/**
 * Per-entity debug attachment. No-op until debug tools register a live factory
 * (`mountClientDebug` in debug builds only).
 */
export function createObjectDebug(init: ObjectDebugInit): ObjectDebug {
    return factory ? factory(init) : noopObjectDebug;
}
