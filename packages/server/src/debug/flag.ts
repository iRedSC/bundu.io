/** Server-side development-only placement affordances. */
export const SERVER_DEBUG = process.env.BUNDU_DEBUG === "1";

/**
 * Secret chat phrase that unlocks slash commands for one player.
 * Not required when `SERVER_DEBUG` is on — commands work immediately.
 */
export const CHEAT_PHRASE = process.env.BUNDU_CHEAT_PHRASE;
