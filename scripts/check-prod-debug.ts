/**
 * Assert the production client bundle does not contain debug tooling.
 * Run after `bun run build` (without BUNDU_DEBUG).
 */
import { Glob } from "bun";

const markers = [
    // Debug tools panel
    "Place wood wall",
    "debug-tools",
    "mountClientDebug",
    "data-bundu-debug",
    // Display-config hot-reload (dev-only)
    "config-hot-reload",
    "startConfigHotReload",
    "__dev/sprite-configs",
    "__dev/config-reload",
];

const files: string[] = [];
for await (const path of new Glob("public/site/**/*.{js,html,css}").scan(".")) {
    files.push(path);
}

if (files.length === 0) {
    console.error("[check-prod-debug] no build output in public/site — run bun run build first");
    process.exit(1);
}

let failed = false;
for (const file of files) {
    const text = await Bun.file(file).text();
    for (const marker of markers) {
        if (text.includes(marker)) {
            console.error(`[check-prod-debug] found "${marker}" in ${file}`);
            failed = true;
        }
    }
}

if (failed) {
    console.error("[check-prod-debug] debug tooling leaked into the prod bundle");
    process.exit(1);
}

console.log(`[check-prod-debug] ok (${files.length} files, no debug markers)`);
