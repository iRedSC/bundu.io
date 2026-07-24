import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { explainAuthoredPath } from "../../../scripts/pack-gen/explain";

const temporaryRoots: string[] = [];

function fixture(files: Record<string, string>): {
    root: string;
    file: (relative: string) => string;
} {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pack-explain-"));
    temporaryRoots.push(root);
    for (const [relative, content] of Object.entries({
        "pack.yml": "id: fixture\n",
        ...files,
    })) {
        const filename = path.join(root, relative);
        fs.mkdirSync(path.dirname(filename), { recursive: true });
        fs.writeFileSync(filename, content);
    }
    return { root, file: (relative) => path.join(root, relative) };
}

afterEach(() => {
    for (const root of temporaryRoots.splice(0)) {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

describe("pack explain", () => {
    test("explains paired document roles and path-derived destinations", () => {
        const pack = fixture({
            "defs/base/buildings/walls/wood.yml":
                "id: wood_model\n---\nhealth: 10\n",
        });

        expect(
            explainAuthoredPath(
                pack.file("defs/base/buildings/walls/wood.yml")
            )
        ).toEqual({
            source: "defs/base/buildings/walls/wood.yml",
            documents: ["display", "data"],
            destinations: [
                {
                    role: "display",
                    path: "assets/base/models/walls/wood.yml",
                },
                { role: "data", path: "data/base/buildings/wood.yml" },
            ],
        });
    });

    test("explains display-only and data-only resources", () => {
        const pack = fixture({
            "defs/base/models/items/hat.yml": "id: hat\n",
            "defs/base/recipes/hat.yml": "output: base:hat\n",
        });

        expect(
            explainAuthoredPath(pack.file("defs/base/models/items/hat.yml"))
                .destinations
        ).toEqual([
            {
                role: "display",
                path: "assets/base/models/items/hat.yml",
            },
        ]);
        expect(
            explainAuthoredPath(pack.file("defs/base/recipes/hat.yml"))
                .destinations
        ).toEqual([
            { role: "data", path: "data/base/recipes/hat.yml" },
        ]);
    });

    test("uses the generator's model directive", () => {
        const pack = fixture({
            "defs/base/items/hat.yml":
                "# @pack-gen model=models/wearables/hat.yml\nid: hat\n---\nstack: 1\n",
        });

        expect(
            explainAuthoredPath(pack.file("defs/base/items/hat.yml"))
                .destinations
        ).toEqual([
            {
                role: "display",
                path: "assets/base/models/wearables/hat.yml",
            },
            { role: "data", path: "data/base/items/hat.yml" },
        ]);
    });

    test("rejects invalid layouts without leaking absolute paths", () => {
        const pack = fixture({
            "defs/base/recipes/nested/bad.yml": "id: display\n---\ndata: true\n",
        });

        expect(() =>
            explainAuthoredPath(
                pack.file("defs/base/recipes/nested/bad.yml")
            )
        ).toThrow("defs/base/recipes/nested/bad.yml: recipes defs are data-only");
        try {
            explainAuthoredPath(
                pack.file("defs/base/recipes/nested/bad.yml")
            );
        } catch (error) {
            expect(String(error)).not.toContain(pack.root);
        }
    });

    test("reports source-aware collisions deterministically", () => {
        const pack = fixture({
            "defs/base/buildings/a/wall.yml": "id: a\n---\nhealth: 1\n",
            "defs/base/buildings/b/wall.yml": "id: b\n---\nhealth: 2\n",
        });

        expect(() =>
            explainAuthoredPath(pack.file("defs/base/buildings/b/wall.yml"))
        ).toThrow(
            "defs/base/buildings/b/wall.yml: collides with defs/base/buildings/a/wall.yml at data/base/buildings/wall.yml"
        );
    });

    test("rejects directive traversal and paths outside defs", () => {
        const pack = fixture({
            "defs/base/items/bad.yml":
                "# @pack-gen model=../../escaped.yml\nid: bad\n---\nstack: 1\n",
            "outside.yml": "id: outside\n",
        });

        expect(() =>
            explainAuthoredPath(pack.file("defs/base/items/bad.yml"))
        ).toThrow('invalid @pack-gen model path "../../escaped.yml"');
        expect(() =>
            explainAuthoredPath(pack.file("outside.yml"))
        ).toThrow("authored path must be inside a pack's defs/ directory");
    });
});
