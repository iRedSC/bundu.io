/** Server-side development-only placement affordances. */
export const SERVER_DEBUG = process.env.BUNDU_DEBUG === "1";

/**
 * Secret chat phrase that sets a player's `opLevel` to 4 (full commands).
 * When `SERVER_DEBUG` is on, effective opLevel is already 4.
 */
export const CHEAT_PHRASE = process.env.BUNDU_CHEAT_PHRASE;
