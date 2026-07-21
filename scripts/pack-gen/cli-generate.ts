import path from "node:path";
import { discoverPacks, generatePack } from "./generate";

const args = process.argv.slice(2);
const check = args.includes("--check");
const packsRoot = path.resolve(
    args.find((arg) => !arg.startsWith("--")) ??
        path.join(import.meta.dirname, "../../packs")
);

let failed = false;
for (const packRoot of discoverPacks(packsRoot)) {
    const result = generatePack({ packRoot, check });
    const name = path.basename(packRoot);
    if (check) {
        if (!result.unchanged) {
            console.error(
                `pack-gen: ${name} is out of date — run bun run pack:gen`
            );
            failed = true;
        } else {
            console.log(`pack-gen: ${name} up to date`);
        }
        continue;
    }
    console.log(
        `pack-gen: ${name} wrote ${result.wrote.length} file(s), removed ${result.removed.length} stale file(s)`
    );
}

if (failed) process.exit(1);
