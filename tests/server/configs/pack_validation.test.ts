import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
    PACK_DIAGNOSTIC_LIMIT,
    PACK_DIAGNOSTIC_MESSAGE_LIMIT,
    validatePackStack,
} from "../../../packages/server/src/configs/pack_validation";
import {
    PACK_MERGE_POLICIES,
    PackStack,
} from "../../../packages/server/src/configs/packs";

const roots: string[] = [];

function temporaryRoot(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "bundu-pack-test-"));
    roots.push(root);
    return root;
}

function write(root: string, relative: string, contents: string): void {
    const filename = path.join(root, relative);
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, contents);
}

function pack(
    root: string,
    directory: string,
    id: string,
    depends: readonly string[] = []
): void {
    write(
        root,
        `${directory}/pack.yml`,
        `id: ${id}\nformat: 1\nversion: 1.0.0\ndepends: [${depends.join(", ")}]\n`
    );
}

afterEach(() => {
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true });
});

describe("pack validation", () => {
    test("returns a reusable typed result for a valid dependency-ordered stack", () => {
        const root = temporaryRoot();
        pack(root, "base", "bundu");
        pack(root, "addon", "example", ["bundu"]);
        write(root, "base/data/bundu/items.yml", "stone: { value: 1 }\n");
        write(root, "addon/data/bundu/items.yml", "wood: { value: 2 }\n");

        const result = validatePackStack(root);

        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error("expected a valid stack");
        expect(result.stack.packs.map((entry) => entry.manifest.id)).toEqual([
            "bundu",
            "example",
        ]);
    });

    test("preserves replace, merge, and tag overlay behavior", () => {
        const root = temporaryRoot();
        pack(root, "base", "bundu");
        pack(root, "addon", "example", ["bundu"]);
        write(root, "base/data/bundu/gameplay.yml", "source: base\n");
        write(root, "addon/data/bundu/gameplay.yml", "source: addon\n");
        write(
            root,
            "base/data/bundu/items.yml",
            "stone: { value: 1 }\nwood: { value: 1 }\n"
        );
        write(root, "addon/data/bundu/items.yml", "stone: { value: 2 }\n");
        write(
            root,
            "base/data/bundu/tags/item/tools.yml",
            "values: [bundu:stone]\n"
        );
        write(
            root,
            "addon/data/bundu/tags/item/tools.yml",
            "replace: true\nvalues: [bundu:wood]\n"
        );
        const stack = new PackStack(root);

        expect(stack.document("bundu", "gameplay")).toEqual({ source: "addon" });
        expect(stack.records("bundu", "items")).toEqual({
            stone: { value: 2 },
            wood: { value: 1 },
        });
        expect(
            stack
                .registryTags("item")
                .get("#bundu:tools")
                ?.map((tag) => tag.replace)
        ).toEqual([false, true]);
    });

    test("reports malformed resources and cross-pack texture conflicts by relative source", () => {
        const root = temporaryRoot();
        pack(root, "base", "bundu");
        pack(root, "addon", "example", ["bundu"]);
        write(root, "base/data/bundu/items.yml", "broken: [\n");
        write(root, "base/assets/bundu/textures/item/tool.svg", "<svg />");
        write(root, "addon/assets/bundu/textures/item/tool.png", "png");

        const result = validatePackStack(root);

        expect(result.ok).toBe(false);
        if (result.ok) throw new Error("expected diagnostics");
        expect(
            result.diagnostics.map(({ code, source }) => ({ code, source }))
        ).toEqual([
            {
                code: "resource-conflict",
                source: "addon/assets/bundu/textures/item/tool.png",
            },
            {
                code: "malformed-resource",
                source: "base/data/bundu/items.yml",
            },
        ]);
        expect(JSON.stringify(result.diagnostics)).not.toContain(root);
    });

    test("bounds diagnostics and orders them deterministically", () => {
        const root = temporaryRoot();
        pack(root, "base", "bundu");
        for (let index = 59; index >= 0; index -= 1) {
            write(
                root,
                `base/data/bundu/items/${String(index).padStart(2, "0")}.yml`,
                `broken: [${"x".repeat(600)}\n`
            );
        }

        const result = validatePackStack(root);

        expect(result.ok).toBe(false);
        if (result.ok) throw new Error("expected diagnostics");
        expect(result.diagnostics).toHaveLength(PACK_DIAGNOSTIC_LIMIT);
        expect(result.omitted).toBe(10);
        expect(result.diagnostics.map((entry) => entry.source)).toEqual(
            [...result.diagnostics]
                .map((entry) => entry.source)
                .sort((left, right) => left.localeCompare(right))
        );
        expect(
            result.diagnostics.every(
                (entry) => entry.message.length <= PACK_DIAGNOSTIC_MESSAGE_LIMIT
            )
        ).toBe(true);
    });

    test("declares an overlay rule for every pack resource family", () => {
        expect(PACK_MERGE_POLICIES.map((policy) => policy.resource)).toEqual([
            "data documents",
            "data records",
            "registry definitions",
            "registry tags",
            "client gameplay",
            "client stat bars",
            "language strings",
            "models",
            "ground models",
            "textures",
        ]);
        expect(
            PACK_MERGE_POLICIES.every(
                (policy) => policy.order === "dependency-first"
            )
        ).toBe(true);
    });
});
