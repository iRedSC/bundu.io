import { describe, expect, test } from "bun:test";
import {
  REGISTRY_NAMES,
  Registry,
  hydrateRegistrySet,
  isTagLocation,
  registryReference,
  registrySetProjection,
  resourceLocation,
  tagLocation,
  type RegistryId,
  type RegistryName,
} from "@bundu/shared/registry";

function expectFailure(run: () => unknown, description: RegExp): void {
  let thrown: unknown;
  try {
    run();
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBeInstanceOf(Error);
  expect((thrown as Error).message).toMatch(description);
}

function replaceNumber(value: unknown, from: number, to: number): unknown {
  if (value === from) return to;
  if (Array.isArray(value)) return value.map((entry) => replaceNumber(entry, from, to));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, replaceNumber(entry, from, to)]),
    );
  }
  return value;
}

function replaceString(value: unknown, from: string, to: string): unknown {
  if (value === from) return to;
  if (Array.isArray(value)) return value.map((entry) => replaceString(entry, from, to));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key === from ? to : key,
        replaceString(entry, from, to),
      ]),
    );
  }
  return value;
}

describe("registry locations", () => {
  test("accepts canonical lowercase resource locations and explicit defaults", () => {
    expect(resourceLocation("core:path/to.item-2")).toBe("core:path/to.item-2");
    expect(resourceLocation("stone", "minecraft")).toBe("minecraft:stone");
  });

  test("rejects malformed, uppercase, and default-less resource locations", () => {
    for (const value of [
      "minecraft:stone:polished",
      ":stone",
      "minecraft:",
      "MineCraft:stone",
      "minecraft:Stone",
      "minecraft:stone block",
    ]) {
      expectFailure(() => resourceLocation(value), /resource|location|namespace|path|invalid/i);
    }
    expectFailure(() => resourceLocation("stone"), /namespace|colon|resource|location|invalid/i);
  });

  test("requires explicit, namespaced tags", () => {
    expect(tagLocation("#minecraft:logs")).toBe("#minecraft:logs");
    expect(isTagLocation("#minecraft:logs")).toBe(true);
    expect(isTagLocation("minecraft:logs")).toBe(false);

    for (const value of ["minecraft:logs", "#logs", "#:logs", "#minecraft:"]) {
      expectFailure(() => tagLocation(value), /tag|namespace|location|invalid/i);
    }
  });

  test("registryReference distinguishes direct entries from tags", () => {
    expect(registryReference("stone", "minecraft")).toBe("minecraft:stone");
    expect(registryReference("#minecraft:logs", "ignored")).toBe("#minecraft:logs");
  });
});

describe("Registry mappings", () => {
  test("assigns deterministic one-based IDs in lexical canonical order", () => {
    const registry = new Registry("item", ["test:zeta", "test:alpha", "other:middle"]);

    expect(registry.id(resourceLocation("other:middle"))).toBe(1);
    expect(registry.id(resourceLocation("test:alpha"))).toBe(2);
    expect(registry.id(resourceLocation("test:zeta"))).toBe(3);
    expect(registry.size).toBe(3);
    expect([...registry.entries()]).toEqual([
      ["other:middle", 1],
      ["test:alpha", 2],
      ["test:zeta", 3],
    ]);
  });

  test("IDs are local to each registry kind", () => {
    const items = new Registry("item", ["test:apple"]);
    const resources = new Registry("resource", ["test:iron"]);

    expect(items.id(resourceLocation("test:apple"))).toBe(1);
    expect(resources.id(resourceLocation("test:iron"))).toBe(1);
  });

  test("rejects duplicate canonical entries", () => {
    expectFailure(
      () => new Registry("item", ["test:apple", "test:apple"]),
      /duplicate|already|test:apple/i,
    );
  });

  test("supports direct and reverse lookup and describes unknown values", () => {
    const registry = new Registry("item", ["test:apple", "test:pear"]);
    const apple = resourceLocation("test:apple");
    const appleId = registry.id(apple);

    expect(registry.has(apple)).toBe(true);
    expect(registry.has(resourceLocation("test:missing"))).toBe(false);
    expect(registry.location(appleId)).toBe(apple);

    expectFailure(
      () => registry.id(resourceLocation("test:missing"), "recipe input"),
      /recipe input|missing|unknown|test:missing/i,
    );
    expectFailure(
      () => registry.location(999 as RegistryId<"item">, "saved game"),
      /saved game|999|unknown|invalid/i,
    );
  });
});

describe("Registry reference expansion", () => {
  test("resolve accepts direct references but rejects singular tag expansion", () => {
    const registry = new Registry("item", ["test:apple"]);
    registry.defineTag("#test:fruit", ["test:apple"]);

    expect(registry.resolve("apple", "test")).toBe(registry.id(resourceLocation("test:apple")));
    expectFailure(
      () => registry.resolve("#test:fruit", "test", "loot entry"),
      /loot entry|tag|singular|set|expand/i,
    );
  });

  test("expands nested tags and relative members, preserving first-expanded order", () => {
    const registry = new Registry("item", [
      "test:apple",
      "test:banana",
      "test:carrot",
      "test:date",
    ]);
    registry.defineTag("#test:fruit", ["banana", "apple", "banana"], "test");
    registry.defineTag("#test:food", ["#test:fruit", "carrot"], "test");

    const ids = registry.resolveSet(
      ["date", "#test:food", "apple", "#test:fruit"],
      "test",
    );

    expect(ids.map((id) => registry.location(id))).toEqual([
      "test:date",
      "test:banana",
      "test:apple",
      "test:carrot",
    ]);
  });

  test("defineTag replaces while appendTag preserves existing members", () => {
    const registry = new Registry("item", ["test:apple", "test:banana", "test:carrot"]);
    registry.defineTag("#test:fruit", ["apple"], "test");
    registry.appendTag("#test:fruit", ["banana"], "test");

    expect(
      registry.resolveSet(["#test:fruit"], "test").map((id) => registry.location(id)),
    ).toEqual(["test:apple", "test:banana"]);

    registry.defineTag("#test:fruit", ["carrot"], "test");
    expect(
      registry.resolveSet(["#test:fruit"], "test").map((id) => registry.location(id)),
    ).toEqual(["test:carrot"]);
  });

  test("reports missing direct entries and missing tags", () => {
    const registry = new Registry("item", ["test:apple"]);

    expectFailure(
      () => registry.resolveSet(["missing"], "test", "recipe ingredients"),
      /recipe ingredients|missing|unknown|test:missing/i,
    );
    expectFailure(
      () => registry.resolveSet(["#test:missing"], "test", "recipe ingredients"),
      /recipe ingredients|missing|unknown|tag|#test:missing/i,
    );
  });

  test("detects tag cycles during expansion and validation", () => {
    const registry = new Registry("item", ["test:apple"]);
    registry.defineTag("#test:a", ["#test:b"]);
    registry.defineTag("#test:b", ["#test:c"]);
    registry.defineTag("#test:c", ["#test:a"]);

    expectFailure(() => registry.resolveSet(["#test:a"]), /cycle|cyclic|test:a|test:b|test:c/i);
    expectFailure(() => registry.validateTags(), /cycle|cyclic|test:a|test:b|test:c/i);
  });

  test("validateTags catches invalid members before resolution", () => {
    const missingEntry = new Registry("item", ["test:apple"]);
    missingEntry.defineTag("#test:bad", ["test:missing"]);
    expectFailure(() => missingEntry.validateTags(), /missing|unknown|test:missing/i);

    const missingTag = new Registry("item", ["test:apple"]);
    missingTag.defineTag("#test:bad", ["#test:missing"]);
    expectFailure(() => missingTag.validateTags(), /missing|unknown|tag|#test:missing/i);
  });
});

describe("Registry projection", () => {
  test("round-trips mappings and tags", () => {
    const original = new Registry("item", ["test:banana", "test:apple"]);
    original.defineTag("#test:fruit", ["test:banana", "test:apple"]);

    const hydrated = Registry.hydrate(original.toProjection());

    expect(hydrated.name).toBe("item");
    expect([...hydrated.entries()]).toEqual([...original.entries()]);
    expect(
      hydrated.resolveSet(["#test:fruit"]).map((id) => hydrated.location(id)),
    ).toEqual(["test:banana", "test:apple"]);
    expect(hydrated.toProjection()).toEqual(original.toProjection());
  });

  test("rejects nonpositive, unsafe, and duplicate numeric IDs", () => {
    const projection = new Registry("item", ["test:a", "test:b"]).toProjection();

    for (const invalid of [0, -1, Number.MAX_SAFE_INTEGER + 1]) {
      expectFailure(
        () => Registry.hydrate(replaceNumber(projection, 2, invalid) as never),
        /id|positive|safe|integer|duplicate|invalid/i,
      );
    }

    expectFailure(
      () => Registry.hydrate(replaceNumber(projection, 2, 1) as never),
      /duplicate|id|mapping|invalid/i,
    );
  });

  test("rejects duplicate projected locations", () => {
    const projection = new Registry("item", ["test:a", "test:b"]).toProjection();
    const duplicated = replaceString(projection, "test:b", "test:a");

    expectFailure(
      () => Registry.hydrate(duplicated as never),
      /duplicate|location|test:a|mapping|invalid/i,
    );
  });
});

describe("registry-set projection", () => {
  test("round-trips every registry independently", () => {
    const registries = Object.fromEntries(
      REGISTRY_NAMES.map((name) => [name, new Registry(name, [`test:${name}`])]),
    ) as { [K in RegistryName]: Registry<K> };

    const projection = registrySetProjection(registries);
    const hydrated = hydrateRegistrySet(projection) as { [K in RegistryName]: Registry<K> };

    for (const name of REGISTRY_NAMES) {
      const hydratedRegistry = hydrated[name] as Registry<RegistryName>;
      const sourceRegistry = registries[name] as Registry<RegistryName>;
      expect(hydratedRegistry.name).toBe(name);
      expect([...hydratedRegistry.entries()]).toEqual([...sourceRegistry.entries()]);
      expect(hydratedRegistry.location(1 as RegistryId<RegistryName>)).toBe(`test:${name}`);
    }
  });

  test("rejects unsupported registry-set formats", () => {
    const registries = Object.fromEntries(
      REGISTRY_NAMES.map((name) => [name, new Registry(name, [`test:${name}`])]),
    ) as { [K in RegistryName]: Registry<K> };
    const projection = registrySetProjection(registries);

    expectFailure(
      () => hydrateRegistrySet({ ...projection, format: "unsupported-format" } as never),
      /format|unsupported|version|invalid/i,
    );
  });
});
