import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import {
    packResourceHash,
    resourcePackFingerprint,
} from "../../../packages/server/src/configs/resource_pack_fingerprint";

const temporaryRoots: string[] = [];

function temporaryPack(): {
    root: string;
    write: (relative: string, content: string) => void;
} {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pack-fingerprint-"));
    temporaryRoots.push(root);
    const write = (relative: string, content: string) => {
        const filename = path.join(root, relative);
        fs.mkdirSync(path.dirname(filename), { recursive: true });
        fs.writeFileSync(filename, content);
    };
    write("pack.yml", "id: fixture\nformat: 1\nversion: 1.0.0\n");
    return { root, write };
}

afterEach(() => {
    for (const root of temporaryRoots.splice(0)) {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

describe("resource-pack fingerprint contract", () => {
    test("pack resource hashes ignore data-only changes", () => {
        const pack = temporaryPack();
        pack.write("assets/base/textures/b.png", "b");
        pack.write("assets/base/textures/a.png", "a");
        const initial = packResourceHash(pack.root);

        pack.write("data/base/items.yml", "hat: { stack: 2 }\n");

        expect(packResourceHash(pack.root)).toBe(initial);
    });

    test("pack resource hashes change for manifests, asset paths, and bytes", () => {
        const pack = temporaryPack();
        pack.write("assets/base/textures/a.png", "a");
        const initial = packResourceHash(pack.root);

        pack.write("assets/base/textures/a.png", "changed");
        const changedBytes = packResourceHash(pack.root);
        fs.renameSync(
            path.join(pack.root, "assets/base/textures/a.png"),
            path.join(pack.root, "assets/base/textures/b.png")
        );
        const changedPath = packResourceHash(pack.root);
        pack.write("pack.yml", "id: fixture\nformat: 1\nversion: 2.0.0\n");

        expect(changedBytes).not.toBe(initial);
        expect(changedPath).not.toBe(changedBytes);
        expect(packResourceHash(pack.root)).not.toBe(changedPath);
    });

    test("manifest fingerprints are stable and content-sensitive", () => {
        const input = {
            packs: [
                {
                    id: "fixture",
                    version: "1.0.0",
                    format: 1,
                    hash: "pack",
                },
            ],
            modelsHash: "models",
            registriesHash: "registries",
            gameplayHash: "gameplay",
            statBarsHash: "stat-bars",
            langHash: "lang",
            assets: [{ path: "base/a.png", hash: "asset", size: 1 }],
        };
        const initial = resourcePackFingerprint(input);

        expect(resourcePackFingerprint(input)).toBe(initial);
        expect(
            resourcePackFingerprint({ ...input, modelsHash: "changed" })
        ).not.toBe(initial);
        expect(
            resourcePackFingerprint({
                ...input,
                assets: [{ path: "base/a.png", hash: "asset", size: 2 }],
            })
        ).not.toBe(initial);
    });
});
