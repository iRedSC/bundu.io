const GAME_WS_URL = process.env.GAME_WS_URL ?? "ws://localhost:7777";

await Bun.build({
    entrypoints: ["./index.html"],
    outdir: "./public/site",
    bytecode: false,
    minify: false,
    define: {
        "process.env.GAME_WS_URL": JSON.stringify(GAME_WS_URL),
    },
});
