/**
 * Server-side debug / cheat affordances.
 * Enabled only when BUNDU_DEBUG=1 (local `bun run dev`).
 */
export const SERVER_DEBUG = process.env.BUNDU_DEBUG === "1";
