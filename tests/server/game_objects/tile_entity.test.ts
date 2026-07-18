import { describe, expect, test } from "bun:test";
import type { TilePos } from "@bundu/shared/tiles";
import {
  deciPacketPos,
  makeTileEntity,
  tileEntityPhysics,
} from "../../../packages/server/src/game_objects/tile_entity";

describe("tileEntityPhysics", () => {
  test("centers collision physics on the origin tile with the requested facing", () => {
    const physics = tileEntityPhysics({ x: 3, y: -2 }, 3);

    expect(physics.position.x).toBe(350);
    expect(physics.position.y).toBe(-150);
    expect(physics.collider.pos).toBe(physics.position);
    expect(physics.collider.r).toBe(physics.collisionRadius);
    expect(physics.rotation).toBe(270);
    expect(physics.speed).toBe(0);
  });
});

describe("makeTileEntity", () => {
  test("defaults to a single occupied origin tile", () => {
    expect(makeTileEntity({ x: 4, y: 6 })).toEqual({
      origin: { x: 4, y: 6 },
      rot: 0,
      blocked: [{ x: 0, y: 0 }],
      occupied: [{ x: 4, y: 6 }],
      layer: "structure",
    });
  });

  test("rotates and translates a multi-tile footprint", () => {
    const entity = makeTileEntity(
      { x: 10, y: 20 },
      1,
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 0, y: 1 },
      ],
    );

    expect(entity.occupied).toEqual([
      { x: 10, y: 20 },
      { x: 10, y: 21 },
      { x: 9, y: 20 },
    ]);
  });

  test("owns copies of caller-provided origin and footprint cells", () => {
    const origin: TilePos = { x: 1, y: 2 };
    const blocked: TilePos[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ];
    const entity = makeTileEntity(origin, 0, blocked);

    origin.x = 99;
    blocked[0] = { x: 50, y: 0 };
    blocked.push({ x: 9, y: 9 });

    expect(entity).toEqual({
      origin: { x: 1, y: 2 },
      rot: 0,
      blocked: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
      occupied: [
        { x: 1, y: 2 },
        { x: 2, y: 2 },
      ],
      layer: "structure",
    });
  });
});

describe("deciPacketPos", () => {
  test("returns integer packet coordinates for tile-centered physics", () => {
    expect(deciPacketPos(tileEntityPhysics({ x: 3, y: 5 }, 0))).toEqual({
      x: 350,
      y: 550,
    });
  });
});
