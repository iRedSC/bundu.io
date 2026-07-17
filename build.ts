import { rm } from "node:fs/promises";
import { spawn } from "bun";

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

const bundle = spawn({
    cmd: ["bun", "run", "./scripts/bundle-base-pack.ts", `${outdir}/base-pack`],
    stdout: "inherit",
    stderr: "inherit",
});
if ((await bundle.exited) !== 0) {
    throw new Error("Failed to bundle base pack into client build");
}

if (!DEBUG) {
    console.log("[build] production client (debug tools stripped)");
} else {
    console.log("[build] debug client (BUNDU_DEBUG=1)");
}
