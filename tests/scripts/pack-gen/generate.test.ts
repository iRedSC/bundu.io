import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { generatePack } from "../../../scripts/pack-gen/generate";
import { packRoots } from "../../../scripts/pack-gen/shared";

const temporaryRoots: string[] = [];

function fixture(): {
    packRoot: string;
    write: (relative: string, content: string) => void;
} {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pack-generate-"));
    temporaryRoots.push(root);
    const packRoot = path.join(root, "packs", "fixture");
    const write = (relative: string, content: string) => {
        const filename = path.join(packRoot, relative);
        fs.mkdirSync(path.dirname(filename), { recursive: true });
        fs.writeFileSync(filename, content);
    };
    write("pack.yml", "id: fixture\nformat: 1\nversion: 1.0.0\n");
    return { packRoot, write };
}

afterEach(() => {
    for (const root of temporaryRoots.splice(0)) {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

describe("pack generation lifecycle", () => {
    test("check mode detects source drift without writing", () => {
        const pack = fixture();
        pack.write(
            "defs/base/items/hat.yml",
            "texture: base:item/hat.png\n---\nstack: 1\n"
        );
        generatePack({ packRoot: pack.packRoot });
        const dataFile = path.join(
            packRoots(pack.packRoot).data,
            "base/items/hat.yml"
        );
        const generated = fs.readFileSync(dataFile, "utf8");

        pack.write(
            "defs/base/items/hat.yml",
            "texture: base:item/hat.png\n---\nstack: 2\n"
        );

        expect(
            generatePack({ packRoot: pack.packRoot, check: true }).unchanged
        ).toBe(false);
        expect(fs.readFileSync(dataFile, "utf8")).toBe(generated);
    });

    test("removes stale output and reports the removed path", () => {
        const pack = fixture();
        pack.write("defs/base/recipes/hat.yml", "result: base:hat\n");
        generatePack({ packRoot: pack.packRoot });
        const stale = path.join(
            packRoots(pack.packRoot).data,
            "base/recipes/stale.yml"
        );
        fs.writeFileSync(stale, "stale: true\n");

        expect(
            generatePack({ packRoot: pack.packRoot, check: true }).unchanged
        ).toBe(false);
        const result = generatePack({ packRoot: pack.packRoot });

        expect(result.removed).toEqual([stale]);
        expect(fs.existsSync(stale)).toBe(false);
    });

    test("regeneration is deterministic and becomes a no-op", () => {
        const pack = fixture();
        pack.write(
            "defs/base/items/hat.yml",
            "texture: base:item/hat.png\n---\nstack: 1\n"
        );

        const first = generatePack({ packRoot: pack.packRoot });
        const roots = packRoots(pack.packRoot);
        const snapshot = [
            fs.readFileSync(path.join(roots.output, "pack.yml"), "utf8"),
            fs.readFileSync(
                path.join(roots.assets, "base/models/items/hat.yml"),
                "utf8"
            ),
            fs.readFileSync(path.join(roots.data, "base/items/hat.yml"), "utf8"),
        ];
        const second = generatePack({ packRoot: pack.packRoot });

        expect(first.unchanged).toBe(false);
        expect(second).toEqual({ wrote: [], removed: [], unchanged: true });
        expect([
            fs.readFileSync(path.join(roots.output, "pack.yml"), "utf8"),
            fs.readFileSync(
                path.join(roots.assets, "base/models/items/hat.yml"),
                "utf8"
            ),
            fs.readFileSync(path.join(roots.data, "base/items/hat.yml"), "utf8"),
        ]).toEqual(snapshot);
    });
});
