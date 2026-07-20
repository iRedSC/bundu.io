import { describe, expect, test } from "bun:test";
import { parseCommand, suggestCommand } from "@bundu/shared/command";
import {
  isEntityFilterKey,
  parseEntityFilter,
  parseSelector,
  selectorLimit,
  selectorSort,
  suggestSelector,
  type EntitySelector,
  type SelectorClause,
} from "@bundu/shared/entity_selector";

const giveRegistry = {
  commands: [
    {
      name: "give",
      opLevel: 4,
      args: [
        { name: "targets", type: "selector" as const },
        { name: "item", type: "item" as const },
        { name: "count", type: "integer" as const, optional: true, min: 1 },
      ],
    },
  ],
};

function expectOkSelector(raw: string): EntitySelector {
  const result = parseSelector(raw);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.message);
  return result.value;
}

function expectSelectorErr(raw: string): void {
  const result = parseSelector(raw);
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("expected parseSelector to fail");
  expect(result.message.length).toBeGreaterThan(0);
}

function clause(
  clauses: readonly SelectorClause[],
  key: SelectorClause["key"],
): SelectorClause | undefined {
  return clauses.find((c) => c.key === key);
}

describe("parseSelector", () => {
  test("parses bare bases with empty clauses", () => {
    for (const base of ["s", "p", "a", "e", "r"] as const) {
      const value = expectOkSelector(`@${base}`);
      expect(value.raw).toBe(`@${base}`);
      expect(value.base).toBe(base);
      expect(value.clauses).toEqual([]);
    }
  });

  test("parses a single flag clause", () => {
    const value = expectOkSelector("@a[flag=in_water]");
    expect(value.base).toBe("a");
    expect(value.clauses).toEqual([{ key: "flag", negate: false, value: "in_water" }]);
  });

  test("parses type, flag, limit, and sort together", () => {
    const value = expectOkSelector(
      "@a[type=bundu:player,flag=in_water,limit=2,sort=nearest]",
    );
    expect(value.base).toBe("a");
    expect(value.clauses).toEqual([
      { key: "type", negate: false, value: "bundu:player" },
      { key: "flag", negate: false, value: "in_water" },
      { key: "limit", value: 2 },
      { key: "sort", value: "nearest" },
    ]);
  });

  test("parses negated type and flag", () => {
    expect(expectOkSelector("@e[type=!bear]").clauses).toEqual([
      { key: "type", negate: true, value: "bear" },
    ]);
    expect(expectOkSelector("@a[flag=!in_water]").clauses).toEqual([
      { key: "flag", negate: true, value: "in_water" },
    ]);
  });

  test("rewrites a bare player name to @a with a name clause", () => {
    const value = expectOkSelector("Alice");
    expect(value.base).toBe("a");
    expect(clause(value.clauses, "name")).toEqual({
      key: "name",
      negate: false,
      value: "Alice",
    });
  });

  test("rejects unknown base, missing bracket, and empty input", () => {
    expectSelectorErr("@z");
    expectSelectorErr("@a[flag=in_water");
    expectSelectorErr("");
  });

  test("rejects empty limit, bad sort, and duplicate limit", () => {
    expectSelectorErr("@a[limit=]");
    expectSelectorErr("@a[sort=best]");
    expectSelectorErr("@a[limit=1,limit=2]");
  });
});

describe("parseEntityFilter", () => {
  test("parses type and flag clause lists", () => {
    const both = parseEntityFilter("type=bundu:player,flag=in_water");
    expect(both.ok).toBe(true);
    if (!both.ok) throw new Error(both.message);
    expect(both.value.raw).toBe("type=bundu:player,flag=in_water");
    expect(both.value.clauses).toEqual([
      { key: "type", negate: false, value: "bundu:player" },
      { key: "flag", negate: false, value: "in_water" },
    ]);

    const flagOnly = parseEntityFilter("flag=in_water");
    expect(flagOnly.ok).toBe(true);
    if (!flagOnly.ok) throw new Error(flagOnly.message);
    expect(flagOnly.value.clauses).toEqual([
      { key: "flag", negate: false, value: "in_water" },
    ]);
  });

  test("rejects selector bases, limit/sort, and bare tokens", () => {
    expect(parseEntityFilter("@a[flag=in_water]").ok).toBe(false);
    expect(parseEntityFilter("limit=1").ok).toBe(false);
    expect(parseEntityFilter("player").ok).toBe(false);
  });
});

describe("isEntityFilterKey", () => {
  test("is true only when the key includes =", () => {
    expect(isEntityFilterKey("type=x")).toBe(true);
    expect(isEntityFilterKey("*")).toBe(false);
    expect(isEntityFilterKey("player")).toBe(false);
  });
});

describe("suggestSelector", () => {
  const ctx = {
    flagNames: ["in_water", "scuba"] as const,
    entityTypeIds: ["bundu:player", "bear"] as const,
    playerNames: ["Alice", "Bob"] as const,
  };

  test("suggests bases for empty and @ prefixes", () => {
    for (const partial of ["", "@"]) {
      const inserts = suggestSelector(partial, ctx).map((s) => s.insert);
      for (const base of ["@s", "@p", "@a", "@e", "@r"]) {
        expect(inserts).toContain(base);
      }
    }
  });

  test("suggests clause keys as full tokens after @a[", () => {
    const suggestions = suggestSelector("@a[", ctx);
    const inserts = suggestions.map((s) => s.insert);
    expect(inserts.some((i) => i.startsWith("@a[") && i.includes("flag="))).toBe(true);
    expect(inserts.some((i) => i.startsWith("@a[") && i.includes("type="))).toBe(true);
    for (const insert of inserts) {
      expect(insert.startsWith("@a[")).toBe(true);
      expect(insert === "flag=" || insert === "type=").toBe(false);
    }
  });

  test("suggests flag names as completed selector tokens", () => {
    const suggestions = suggestSelector("@a[flag=", ctx);
    const inserts = suggestions.map((s) => s.insert);
    expect(inserts).toContain("@a[flag=in_water]");
    expect(inserts).toContain("@a[flag=scuba]");
    for (const insert of inserts) {
      expect(insert.startsWith("@a[flag=")).toBe(true);
    }
  });

  test("suggests next clause keys after a completed flag", () => {
    const suggestions = suggestSelector("@a[flag=in_water,", ctx);
    const inserts = suggestions.map((s) => s.insert);
    expect(inserts.some((i) => i.startsWith("@a[flag=in_water,") && i.includes("type="))).toBe(
      true,
    );
    expect(inserts.some((i) => i.startsWith("@a[flag=in_water,") && i.includes("flag="))).toBe(
      true,
    );
    for (const insert of inserts) {
      expect(insert.startsWith("@a[flag=in_water,")).toBe(true);
    }
  });

  test("suggests matching player names for a bare partial", () => {
    const suggestions = suggestSelector("Al", ctx);
    const inserts = suggestions.map((s) => s.insert);
    expect(inserts.some((i) => i.includes("Alice"))).toBe(true);
    expect(inserts.every((i) => !i.includes("Bob"))).toBe(true);
  });

  test("never returns bare clause-key fragments as insert", () => {
    for (const partial of ["@a[", "@a[flag=", "@a[flag=in_water,", "Al"]) {
      for (const suggestion of suggestSelector(partial, ctx)) {
        expect(suggestion.insert).not.toBe("flag=");
        expect(suggestion.insert).not.toBe("type=");
        expect(suggestion.insert).not.toBe("limit=");
        expect(suggestion.insert).not.toBe("sort=");
        expect(suggestion.insert.length).toBeGreaterThan(0);
        expect(suggestion.label.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("selectorLimit / selectorSort", () => {
  test("reads limit and sort from clauses", () => {
    const withBoth = expectOkSelector("@a[limit=3,sort=furthest]");
    expect(selectorLimit(withBoth)).toBe(3);
    expect(selectorSort(withBoth)).toBe("furthest");

    const noLimit = expectOkSelector("@a");
    expect(selectorLimit(noLimit)).toBeUndefined();
  });

  test("defaults @p to nearest and @r to random", () => {
    expect(selectorSort(expectOkSelector("@p"))).toBe("nearest");
    expect(selectorSort(expectOkSelector("@r"))).toBe("random");
  });

  test("defaults other bases to arbitrary when sort is omitted", () => {
    expect(selectorSort(expectOkSelector("@a"))).toBe("arbitrary");
    expect(selectorSort(expectOkSelector("@e"))).toBe("arbitrary");
    expect(selectorSort(expectOkSelector("@s"))).toBe("arbitrary");
  });
});

describe("command integration", () => {
  test("parseCommand accepts a give with selector, item, and count", () => {
    const result = parseCommand(
      "/give @a[flag=in_water] bundu:bottle_empty 1",
      giveRegistry,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.message);
    expect(result.args.targets).toBeDefined();
    expect(result.args.item).toBe("bundu:bottle_empty");
    expect(result.args.count).toBeDefined();
  });

  test("parseCommand rejects a bare item id without namespace", () => {
    const result = parseCommand("/give @s bottle_empty", giveRegistry);
    expect(result.ok).toBe(false);
  });

  test("parseCommand rejects an invalid selector target", () => {
    const result = parseCommand("/give @z bundu:bottle_empty", giveRegistry);
    expect(result.ok).toBe(false);
  });

  test("suggestCommand completes selector flag prefixes", () => {
    const input = "/give @a[fl";
    const suggestions = suggestCommand(input, input.length, giveRegistry, {
      flagNames: ["in_water", "scuba"],
    });
    const inserts = suggestions.map((s) => s.insert);
    expect(
      inserts.some(
        (insert) =>
          insert.includes("@a[flag=") ||
          insert === "@a[flag=in_water]" ||
          insert === "@a[flag=scuba]",
      ),
    ).toBe(true);
  });
});
