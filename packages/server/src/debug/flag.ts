/** Server-side development-only placement affordances. */
export const SERVER_DEBUG = process.env.BUNDU_DEBUG === "1";

/** Secret chat phrase that enables slash commands for one connected player. */
export const CHEAT_PHRASE = process.env.BUNDU_CHEAT_PHRASE;
