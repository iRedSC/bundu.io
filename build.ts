await Bun.build({
    entrypoints: ["./index.html"],
    outdir: "./public/site",
    bytecode: false,
    minify: false,
});
