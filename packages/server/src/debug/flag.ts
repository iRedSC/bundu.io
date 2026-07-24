import { serverDebugEnabled } from "../auth/capabilities.js";

/** Server-side development-only placement affordances. */
export const SERVER_DEBUG = serverDebugEnabled();

/**
 * Secret chat phrase that sets a player's `opLevel` to 4 (full commands).
 * When `SERVER_DEBUG` is on, effective opLevel is already 4.
 */
export const CHEAT_PHRASE = process.env.BUNDU_CHEAT_PHRASE;
