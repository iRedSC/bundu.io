import { rm } from "node:fs/promises";

const GAME_WS_URL = process.env.GAME_WS_URL ?? "ws://localhost:7777";

/** Prod/CI omit debug tools; set BUNDU_DEBUG=1 for local/dev bundles. */
const DEBUG = process.env.BUNDU_DEBUG === "1";

const outdir = "./public/site";
await rm(outdir, { recursive: true, force: true });

await Bun.build({
    entrypoints: ["./index.html"],
    outdir,
    bytecode: false,
    minify: !DEBUG,
    define: {
        "process.env.GAME_WS_URL": JSON.stringify(GAME_WS_URL),
        __DEBUG__: DEBUG ? "true" : "false",
    },
});

// Runtime Pixi loads use string paths (not bundler imports), so copy sprites
// into the site output. Needed when the deploy root is `public/site/` (no
// sibling `/assets`), and also for docker at `/site/assets/…`.
await cp("./public/assets", `${outdir}/assets`, { recursive: true });

if (!DEBUG) {
    console.log("[build] production client (debug tools stripped)");
} else {
    console.log("[build] debug client (BUNDU_DEBUG=1)");
}
