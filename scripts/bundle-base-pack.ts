/**
 * Emit the sanitized bundu-only pack stack into the client build output so
 * base-pack servers can skip re-downloading textures/models/registries.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dir, "..");
const bunduPack = path.join(repoRoot, ".generated", "packs", "bundu");
const outdir = path.resolve(
    repoRoot,
    process.argv[2] ?? "public/site/base-pack"
);

if (!fs.existsSync(path.join(bunduPack, "pack.yml"))) {
    throw new Error(`Missing base pack at ${bunduPack}`);
}

// Copy into an isolated root so additional generated packs are never bundled.
// (Dirent.isDirectory() is false for symlinks, so a link is not enough.)
const packRoot = fs.mkdtempSync(path.join(os.tmpdir(), "bundu-base-pack-"));
fs.cpSync(bunduPack, path.join(packRoot, "bundu"), { recursive: true });
process.env.BUNDU_PACK_ROOT = packRoot;

const { loadConfigs } = await import(
    "../packages/server/src/configs/loaders/load"
);
const { packs } = await import("../packages/server/src/configs/packs");
const { ResourcePackService } = await import(
    "../packages/server/src/configs/resource_packs"
);

if (packs.packs.length !== 1 || packs.packs[0]?.manifest.id !== "bundu") {
    throw new Error(
        `Expected bundu-only pack stack, got ${packs.packs
            .map((pack) => pack.manifest.id)
            .join(", ")}`
    );
}

loadConfigs();
const resourcePacks = await ResourcePackService.create();

fs.rmSync(outdir, { recursive: true, force: true });
fs.mkdirSync(outdir, { recursive: true });

const modelsPath = path.join(outdir, "models.json");
const registriesPath = path.join(outdir, "registries.json");
const gameplayPath = path.join(outdir, "gameplay.json");
const statBarsPath = path.join(outdir, "stat_bars.json");
const langPath = path.join(outdir, "lang.json");
fs.writeFileSync(modelsPath, resourcePacks.modelsJson);
fs.writeFileSync(registriesPath, resourcePacks.registriesJson);
fs.writeFileSync(gameplayPath, resourcePacks.gameplayJson);
fs.writeFileSync(statBarsPath, resourcePacks.statBarsJson);
fs.writeFileSync(langPath, resourcePacks.langJson);

const assetsRoot = path.join(outdir, "assets");
for (const entry of resourcePacks.manifest.assets) {
    const asset = resourcePacks.asset(entry.path);
    if (!asset) {
        throw new Error(`Missing sanitized asset bytes for ${entry.path}`);
    }
    const filename = path.join(assetsRoot, ...entry.path.split("/"));
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, asset.bytes);
}

const bundledManifest = {
    format: 2 as const,
    fingerprint: resourcePacks.manifest.fingerprint,
    packs: resourcePacks.manifest.packs,
    models: {
        hash: resourcePacks.manifest.models.hash,
        url: "models.json",
    },
    registries: {
        hash: resourcePacks.manifest.registries.hash,
        url: "registries.json",
    },
    gameplay: {
        hash: resourcePacks.manifest.gameplay.hash,
        url: "gameplay.json",
    },
    statBars: {
        hash: resourcePacks.manifest.statBars.hash,
        url: "stat_bars.json",
    },
    lang: {
        hash: resourcePacks.manifest.lang.hash,
        url: "lang.json",
    },
    assets: resourcePacks.manifest.assets,
};

fs.writeFileSync(
    path.join(outdir, "manifest.json"),
    JSON.stringify(bundledManifest)
);

fs.rmSync(packRoot, { recursive: true, force: true });

console.log(
    `[bundle-base-pack] wrote ${resourcePacks.manifest.assets.length} assets → ${path.relative(repoRoot, outdir)} (${resourcePacks.manifest.fingerprint.slice(0, 12)})`
);
