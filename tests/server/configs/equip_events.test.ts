import { describe, expect, test } from "bun:test";
import {
  mergeEquipEvents,
  parseEquipEvents,
} from "@bundu/server/configs/loaders/equip_events";
import type { GameRegistries } from "@bundu/server/configs/registries";
import {
  REGISTRY_NAMES,
  Registry,
} from "@bundu/shared/registry";

function registries(): GameRegistries {
  return Object.fromEntries(
    REGISTRY_NAMES.map((name) => [
      name,
      new Registry(name, name === "item" ? ["bundu:sword", "bundu:wood"] : []),
    ]),
  ) as GameRegistries;
}

function parse(raw: unknown) {
  return parseEquipEvents(raw, "bundu:sword.onEquip", registries(), "bundu:sword");
}

describe("parseEquipEvents", () => {
  test("normalizes one or many lock actions with all slots by default", () => {
    const events = parse({
      "@s": {
        lockItem: [
          {
            id: "swap-delay",
            items: ["bundu:sword"],
            lock: ["equip", "equip", "drop"],
            for: 500,
          },
          {
            slots: ["helmet"],
            lock: ["use"],
          },
        ],
      },
    });

    expect(events?.targets).toHaveLength(1);
    expect(events?.targets[0]?.lockItems).toEqual([
      {
        source: "bundu:sword:swap-delay",
        items: new Set([1]),
        lock: ["equip", "drop"],
        slots: ["mainhand", "offhand", "helmet"],
        forMs: 500,
      },
      {
        source: "bundu:sword.onEquip.@s.lockItem[1]",
        items: null,
        lock: ["use"],
        slots: ["helmet"],
        forMs: undefined,
      },
    ]);
  });

  test("parses precise source unlocks without requiring items or slots", () => {
    const events = parse({
      "@s": {
        unlockItem: { id: "swap-delay" },
      },
    });

    expect(events?.targets[0]?.unlockItems).toEqual([
      {
        source: "bundu:sword:swap-delay",
        items: null,
      },
    ]);
  });

  test("resolves item tags using the owner namespace", () => {
    const gameRegistries = registries();
    gameRegistries.item.defineTag("#bundu:weapons", ["sword"], "bundu");

    const events = parseEquipEvents(
      {
        "@s": {
          lockItem: {
            items: ["#bundu:weapons"],
            lock: ["craft"],
          },
        },
      },
      "bundu:sword.onEquip",
      gameRegistries,
      "bundu:sword",
    );

    expect(events?.targets[0]?.lockItems[0]?.items).toEqual(new Set([1]));
  });

  test.each([
    [{ "@s": { lockItem: { lock: ["use"] } } }, /expected items and\/or slots/],
    [
      { "@s": { lockItem: { slots: ["helmet"], lock: ["craft"] } } },
      /items: required when locking drop or craft/,
    ],
    [
      { "@s": { lockItem: { items: ["bundu:sword"], lock: ["swap"] } } },
      /expected equip\|unequip\|use\|drop\|craft/,
    ],
    [
      { "@s": { lockItem: { slots: ["body"], lock: ["use"] } } },
      /expected mainhand\|offhand\|helmet/,
    ],
    [
      {
        "@s": {
          lockItem: {
            items: ["bundu:sword"],
            lock: ["use"],
            for: -1,
          },
        },
      },
      /expected non-negative number/,
    ],
    [{ "@s": { commands: ["give @s bundu:wood 1"] } }, /unknown key/],
  ] satisfies ReadonlyArray<readonly [unknown, RegExp]>)(
    "rejects invalid authoring %#",
    (raw, message) => {
      expect(() => parse(raw)).toThrow(message);
    },
  );

  test("returns undefined for absent or empty event blocks", () => {
    expect(parse(undefined)).toBeUndefined();
    expect(parse({ "@s": {} })).toBeUndefined();
  });
});

describe("mergeEquipEvents", () => {
  test("uses an explicit override instead of combining one-shot effects", () => {
    const gameRegistries = registries();
    const base = {
      "@s": {
        lockItem: {
          items: ["bundu:sword"],
          lock: ["use"],
        },
      },
    };
    const override = {
      "@s": {
        lockItem: {
          items: ["bundu:wood"],
          lock: ["drop"],
        },
      },
    };

    const merged = mergeEquipEvents(
      base,
      override,
      "bundu:sword.onEquip",
      gameRegistries,
      "bundu:sword",
    );

    expect(merged?.targets[0]?.lockItems[0]?.items).toEqual(new Set([2]));
    expect(merged?.targets[0]?.lockItems[0]?.lock).toEqual(["drop"]);
  });
});
