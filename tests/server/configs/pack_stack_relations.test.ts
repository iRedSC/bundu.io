import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { validatePackStack } from "../../../packages/server/src/configs/pack_validation";
import { PackStack } from "../../../packages/server/src/configs/packs";

const temporaryRoots: string[] = [];

function fixture(): {
    root: string;
    pack: (directory: string, id: string, depends?: readonly string[]) => void;
    write: (relative: string, content: string) => void;
} {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pack-relations-"));
    temporaryRoots.push(root);
    const write = (relative: string, content: string) => {
        const filename = path.join(root, relative);
        fs.mkdirSync(path.dirname(filename), { recursive: true });
        fs.writeFileSync(filename, content);
    };
    const pack = (
        directory: string,
        id: string,
        depends: readonly string[] = []
    ) => {
        write(
            `${directory}/pack.yml`,
            `id: ${id}\nformat: 1\nversion: 1.0.0\ndepends: [${depends.join(", ")}]\n`
        );
    };
    return { root, pack, write };
}

afterEach(() => {
    for (const root of temporaryRoots.splice(0)) {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

describe("pack-stack relations", () => {
    test("reports missing dependencies as a bounded stack diagnostic", () => {
        const packs = fixture();
        packs.pack("base", "bundu", ["missing"]);

        const result = validatePackStack(packs.root);

        expect(result.ok).toBe(false);
        if (result.ok) throw new Error("expected an invalid stack");
        expect(result.diagnostics).toEqual([
            {
                severity: "error",
                code: "invalid-stack",
                source: "pack stack",
                message: 'Missing required pack "missing"',
            },
        ]);
        expect(JSON.stringify(result)).not.toContain(packs.root);
    });

    test("reports dependency cycles deterministically", () => {
        const packs = fixture();
        packs.pack("base", "bundu", ["example"]);
        packs.pack("addon", "example", ["bundu"]);

        const result = validatePackStack(packs.root);

        expect(result.ok).toBe(false);
        if (result.ok) throw new Error("expected an invalid stack");
        expect(result.diagnostics[0]).toMatchObject({
            code: "invalid-stack",
            source: "pack stack",
            message: 'Pack dependency cycle at "bundu"',
        });
    });

    test("keeps cross-namespace definitions and tags distinct", () => {
        const packs = fixture();
        packs.pack("base", "bundu");
        packs.pack("addon", "example", ["bundu"]);
        packs.write("base/data/bundu/items/hat.yml", "stack: 1\n");
        packs.write("addon/data/example/items/hat.yml", "stack: 2\n");
        packs.write(
            "addon/data/example/tags/item/wearable.yml",
            "values: [bundu:hat, example:hat]\n"
        );

        const stack = new PackStack(packs.root);

        expect([...stack.registryDefinitions("items").keys()]).toEqual([
            "bundu:hat",
            "example:hat",
        ]);
        expect(stack.registryTags("item").get("#example:wearable")).toEqual([
            expect.objectContaining({
                namespace: "example",
                values: ["bundu:hat", "example:hat"],
            }),
        ]);
    });
});
