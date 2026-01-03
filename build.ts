import UnpluginTypia from "@ryoppippi/unplugin-typia/bun";

await Bun.build({
    entrypoints: ["./index.html"],
    outdir: "./public/site",
    plugins: [UnpluginTypia({ cache: true })],
    bytecode: false,
    minify: false,
});
