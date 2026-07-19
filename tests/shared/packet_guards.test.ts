import { describe, expect, test } from "bun:test";
import { PlaceMode } from "@bundu/shared/inventory";
import {
  AdminPlaceKind,
  ClientPacket,
  ClientPacketGuards,
  FREECAM_MAX_VIEW_EXTENT,
} from "@bundu/shared/packet_definitions";
import { WORLD_BOUNDS, WORLD_TILES } from "@bundu/shared/tiles";

const EMPTY_PAYLOAD_PACKETS = [
  ClientPacket.PlaceStructure,
  ClientPacket.AdminKillAnimals,
  ClientPacket.AdminStrokeBegin,
  ClientPacket.AdminStrokeEnd,
  ClientPacket.AdminUndo,
  ClientPacket.AdminRedo,
  ClientPacket.AdminSaveMap,
  ClientPacket.AdminDownloadMap,
  ClientPacket.AdminWipeMap,
  ClientPacket.ClientReady,
] as const;

function expectRejectsNonObjects(guard: (value: unknown) => boolean): void {
  expect(guard(null)).toBe(false);
  expect(guard(undefined)).toBe(false);
  expect(guard(0)).toBe(false);
  expect(guard("obj")).toBe(false);
}

describe("ClientPacketGuards shared rejection", () => {
  test("every guard rejects null and non-objects", () => {
    for (const guard of Object.values(ClientPacketGuards)) {
      expectRejectsNonObjects(guard);
    }
  });
});

describe("Rotation", () => {
  const guard = ClientPacketGuards[ClientPacket.Rotation];

  test("accepts finite rotations within ±360", () => {
    expect(guard({ rotation: 0 })).toBe(true);
    expect(guard({ rotation: 360 })).toBe(true);
    expect(guard({ rotation: -360 })).toBe(true);
    expect(guard({ rotation: 90.5 })).toBe(true);
  });

  test("rejects non-finite and out-of-range rotations", () => {
    expect(guard({ rotation: 360.1 })).toBe(false);
    expect(guard({ rotation: -360.1 })).toBe(false);
    expect(guard({ rotation: Number.POSITIVE_INFINITY })).toBe(false);
    expect(guard({ rotation: Number.NaN })).toBe(false);
    expect(guard({})).toBe(false);
  });
});

describe("Movement", () => {
  const guard = ClientPacketGuards[ClientPacket.Movement];
  const valid = [1, 2, 3, 5, 6, 7, 9, 10, 11];
  const invalid = [0, 4, 8, 12, -1, 1.5, Number.NaN];

  test("accepts the whitelist of safe integer directions", () => {
    for (const direction of valid) {
      expect(guard({ direction })).toBe(true);
    }
  });

  test("rejects cardinal-zero, diagonals-off-grid, and non-safe values", () => {
    for (const direction of invalid) {
      expect(guard({ direction })).toBe(false);
    }
  });
});

describe("Attack and Block", () => {
  test("require a boolean stop flag", () => {
    for (const packet of [ClientPacket.Attack, ClientPacket.Block] as const) {
      const guard = ClientPacketGuards[packet];
      expect(guard({ stop: true })).toBe(true);
      expect(guard({ stop: false })).toBe(true);
      expect(guard({ stop: 1 })).toBe(false);
      expect(guard({})).toBe(false);
    }
  });
});

describe("SelectItem", () => {
  const guard = ClientPacketGuards[ClientPacket.SelectItem];

  test("accepts safe integer slots in [0, 255]", () => {
    expect(guard({ slot: 0 })).toBe(true);
    expect(guard({ slot: 255 })).toBe(true);
    expect(guard({ slot: 10 })).toBe(true);
  });

  test("rejects out-of-range and non-safe slots", () => {
    expect(guard({ slot: -1 })).toBe(false);
    expect(guard({ slot: 256 })).toBe(false);
    expect(guard({ slot: 1.5 })).toBe(false);
    expect(guard({ slot: Number.NaN })).toBe(false);
  });
});

describe("MoveSlot", () => {
  const guard = ClientPacketGuards[ClientPacket.MoveSlot];

  test("accepts from in [0,255] and to in [-1,255]", () => {
    expect(guard({ from: 0, to: -1 })).toBe(true);
    expect(guard({ from: 255, to: 255 })).toBe(true);
    expect(guard({ from: 3, to: 7 })).toBe(true);
  });

  test("rejects illegal endpoints", () => {
    expect(guard({ from: -1, to: 0 })).toBe(false);
    expect(guard({ from: 256, to: 0 })).toBe(false);
    expect(guard({ from: 0, to: -2 })).toBe(false);
    expect(guard({ from: 0, to: 256 })).toBe(false);
    expect(guard({ from: 1.5, to: 0 })).toBe(false);
  });
});

describe("CraftItem", () => {
  const guard = ClientPacketGuards[ClientPacket.CraftItem];

  test("accepts non-negative safe integer recipe ids", () => {
    expect(guard({ recipeId: 0 })).toBe(true);
    expect(guard({ recipeId: 42 })).toBe(true);
  });

  test("rejects negative and non-safe recipe ids", () => {
    expect(guard({ recipeId: -1 })).toBe(false);
    expect(guard({ recipeId: 1.5 })).toBe(false);
    expect(guard({ recipeId: Number.NaN })).toBe(false);
  });
});

describe("ChatMessage", () => {
  const guard = ClientPacketGuards[ClientPacket.ChatMessage];

  test("accepts non-empty strings up to 256 characters", () => {
    expect(guard({ message: "a" })).toBe(true);
    expect(guard({ message: "x".repeat(256) })).toBe(true);
  });

  test("rejects empty and oversized messages", () => {
    expect(guard({ message: "" })).toBe(false);
    expect(guard({ message: "x".repeat(257) })).toBe(false);
    expect(guard({ message: 1 })).toBe(false);
  });
});

describe("CursorSlot", () => {
  const guard = ClientPacketGuards[ClientPacket.CursorSlot];

  test("accepts slot [-1,255] with PlaceMode values", () => {
    for (const mode of [PlaceMode.All, PlaceMode.Half, PlaceMode.One]) {
      expect(guard({ slot: -1, mode })).toBe(true);
      expect(guard({ slot: 0, mode })).toBe(true);
      expect(guard({ slot: 255, mode })).toBe(true);
    }
  });

  test("rejects illegal slot or mode", () => {
    expect(guard({ slot: -2, mode: PlaceMode.All })).toBe(false);
    expect(guard({ slot: 256, mode: PlaceMode.All })).toBe(false);
    expect(guard({ slot: 0, mode: 3 })).toBe(false);
    expect(guard({ slot: 0, mode: -1 })).toBe(false);
  });
});

describe("empty-payload packets", () => {
  test("accept only plain objects with no own keys", () => {
    for (const packet of EMPTY_PAYLOAD_PACKETS) {
      const guard = ClientPacketGuards[packet];
      expect(guard({})).toBe(true);
      expect(guard({ extra: 1 })).toBe(false);
      expect(guard(Object.create({ inherited: true }))).toBe(true);
    }
  });
});

describe("SetStructurePlacement", () => {
  const guard = ClientPacketGuards[ClientPacket.SetStructurePlacement];

  test("accepts rotation [0,3] with safe integer coordinates", () => {
    expect(guard({ rotation: 0, x: 0, y: 0 })).toBe(true);
    expect(guard({ rotation: 3, x: -10, y: 20 })).toBe(true);
  });

  test("rejects illegal rotation or non-safe coordinates", () => {
    expect(guard({ rotation: 4, x: 0, y: 0 })).toBe(false);
    expect(guard({ rotation: -1, x: 0, y: 0 })).toBe(false);
    expect(guard({ rotation: 1, x: 1.5, y: 0 })).toBe(false);
    expect(guard({ rotation: 1, x: 0, y: Number.NaN })).toBe(false);
  });
});

describe("ViewBounds", () => {
  const guard = ClientPacketGuards[ClientPacket.ViewBounds];

  test("accepts finite bounds with max>=min and spans within freecam extent", () => {
    expect(
      guard({
        minX: 0,
        minY: 0,
        maxX: 0,
        maxY: 0,
        overview: false,
      }),
    ).toBe(true);
    expect(
      guard({
        minX: 10,
        minY: 20,
        maxX: 10 + FREECAM_MAX_VIEW_EXTENT,
        maxY: 20 + FREECAM_MAX_VIEW_EXTENT,
        overview: true,
      }),
    ).toBe(true);
  });

  test("rejects inverted axes, non-finite values, and oversized spans", () => {
    expect(
      guard({
        minX: 5,
        minY: 0,
        maxX: 4,
        maxY: 1,
        overview: false,
      }),
    ).toBe(false);
    expect(
      guard({
        minX: 0,
        minY: 0,
        maxX: FREECAM_MAX_VIEW_EXTENT + 1,
        maxY: 0,
        overview: false,
      }),
    ).toBe(false);
    expect(
      guard({
        minX: Number.NaN,
        minY: 0,
        maxX: 1,
        maxY: 1,
        overview: false,
      }),
    ).toBe(false);
    expect(
      guard({
        minX: 0,
        minY: 0,
        maxX: 1,
        maxY: 1,
        overview: 1,
      }),
    ).toBe(false);
  });
});

describe("AdminPlace", () => {
  const guard = ClientPacketGuards[ClientPacket.AdminPlace];

  const base = {
    kind: AdminPlaceKind.Decoration,
    typeId: 1,
    scale: 1,
    x: 0,
    y: 0,
    rotation: 0,
    variant: 0,
    w: 1,
    h: 1,
  };

  test("accepts decoration placements in world bounds", () => {
    expect(guard({ ...base })).toBe(true);
    expect(
      guard({
        ...base,
        x: WORLD_BOUNDS,
        y: WORLD_BOUNDS,
        rotation: 3600,
        scale: 100,
      }),
    ).toBe(true);
  });

  test("rejects illegal kind, typeId, and scale", () => {
    expect(guard({ ...base, kind: -1 })).toBe(false);
    expect(guard({ ...base, typeId: 0 })).toBe(false);
    expect(guard({ ...base, typeId: -1 })).toBe(false);
    expect(guard({ ...base, scale: 0 })).toBe(false);
    expect(guard({ ...base, scale: 100.1 })).toBe(false);
    expect(guard({ ...base, scale: Number.POSITIVE_INFINITY })).toBe(false);
  });

  test("rejects decorations outside world or with non-1x1 size", () => {
    expect(guard({ ...base, x: -1 })).toBe(false);
    expect(guard({ ...base, y: WORLD_BOUNDS + 1 })).toBe(false);
    expect(guard({ ...base, rotation: 3600.1 })).toBe(false);
    expect(guard({ ...base, rotation: -3600.1 })).toBe(false);
    expect(guard({ ...base, variant: -1 })).toBe(false);
    expect(guard({ ...base, w: 2, h: 1 })).toBe(false);
    expect(guard({ ...base, w: 1, h: 2 })).toBe(false);
  });

  test("accepts resource/structure/ground tile placements", () => {
    for (const kind of [
      AdminPlaceKind.Resource,
      AdminPlaceKind.Structure,
      AdminPlaceKind.Ground,
    ] as const) {
      expect(
        guard({
          ...base,
          kind,
          x: 0,
          y: 0,
          rotation: 3,
          w: 1,
          h: 1,
        }),
      ).toBe(true);
      expect(
        guard({
          ...base,
          kind,
          x: WORLD_TILES - 1,
          y: WORLD_TILES - 1,
          rotation: 0,
          w: WORLD_TILES,
          h: 1,
        }),
      ).toBe(true);
    }
  });

  test("rejects illegal tile placements and full-map ground", () => {
    expect(
      guard({
        ...base,
        kind: AdminPlaceKind.Resource,
        x: WORLD_TILES,
        y: 0,
      }),
    ).toBe(false);
    expect(
      guard({
        ...base,
        kind: AdminPlaceKind.Structure,
        rotation: 4,
      }),
    ).toBe(false);
    expect(
      guard({
        ...base,
        kind: AdminPlaceKind.Ground,
        w: 0,
        h: 1,
      }),
    ).toBe(false);
    expect(
      guard({
        ...base,
        kind: AdminPlaceKind.Ground,
        w: WORLD_TILES,
        h: WORLD_TILES,
      }),
    ).toBe(false);
  });
});

describe("AdminDeleteAt", () => {
  const guard = ClientPacketGuards[ClientPacket.AdminDeleteAt];

  test("accepts world coordinates with a valid place kind", () => {
    expect(
      guard({ x: 0, y: 0, kind: AdminPlaceKind.Decoration }),
    ).toBe(true);
    expect(
      guard({
        x: WORLD_BOUNDS,
        y: WORLD_BOUNDS,
        kind: AdminPlaceKind.Ground,
      }),
    ).toBe(true);
  });

  test("rejects out-of-bounds or illegal kind", () => {
    expect(guard({ x: -1, y: 0, kind: AdminPlaceKind.Decoration })).toBe(false);
    expect(
      guard({ x: WORLD_BOUNDS + 1, y: 0, kind: AdminPlaceKind.Decoration }),
    ).toBe(false);
    expect(guard({ x: 0, y: 0, kind: -1 })).toBe(false);
    expect(guard({ x: Number.NaN, y: 0, kind: AdminPlaceKind.Decoration })).toBe(
      false,
    );
  });
});

describe("AdminSetAnimalsFrozen", () => {
  const guard = ClientPacketGuards[ClientPacket.AdminSetAnimalsFrozen];

  test("requires a boolean frozen flag", () => {
    expect(guard({ frozen: true })).toBe(true);
    expect(guard({ frozen: false })).toBe(true);
    expect(guard({ frozen: 0 })).toBe(false);
    expect(guard({})).toBe(false);
  });
});
