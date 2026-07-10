import { describe, expect, test } from "bun:test";
import {
  deciPacketPos,
  makeTileEntity,
  tileEntityPhysics,
} from "../../../packages/server/src/game_objects/tile_entity";
import {
  SINGLE_TILE,
  tileCenterWorld,
  worldToDeci,
  type TilePos,
  type TileRot,
} from "@bundu/shared/tiles";

describe("tileEntityPhysics", () => {
  test("position is at origin tile centers", () => {
    const origin: TilePos = { x: 3, y: 5 };
    const physics = tileEntityPhysics(origin, 0);
    expect(physics.position.x).toBe(tileCenterWorld(3));
    expect(physics.position.y).toBe(tileCenterWorld(5));
  });

  test("rotation is rot * 90 degrees", () => {
    const rots: TileRot[] = [0, 1, 2, 3];
    for (const rot of rots) {
      expect(tileEntityPhysics({ x: 0, y: 0 }, rot).rotation).toBe(rot * 90);
    }
  });
});

describe("makeTileEntity", () => {
  test("defaults rot to 0 and blocked to SINGLE_TILE", () => {
    const entity = makeTileEntity({ x: 4, y: 6 });
    expect(entity.rot).toBe(0);
    expect(entity.blocked).toEqual([{ x: 0, y: 0 }]);
    expect(entity.blocked).toEqual([...SINGLE_TILE]);
    expect(entity.occupied).toEqual([{ x: 4, y: 6 }]);
  });

  test("copies origin so mutating input does not affect entity", () => {
    const origin: TilePos = { x: 1, y: 2 };
    const entity = makeTileEntity(origin);
    origin.x = 99;
    origin.y = 99;
    expect(entity.origin).toEqual({ x: 1, y: 2 });
  });

  test("copies blocked so mutating input does not affect entity", () => {
    const blocked: TilePos[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ];
    const entity = makeTileEntity({ x: 0, y: 0 }, 0, blocked);
    blocked[0]!.x = 50;
    blocked.push({ x: 9, y: 9 });
    expect(entity.blocked).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]);
  });

  test("occupied matches worldFootprint for multi-tile L at rot 1", () => {
    const origin: TilePos = { x: 10, y: 20 };
    const blocked: readonly TilePos[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
    ];
    const entity = makeTileEntity(origin, 1, blocked);
    expect(entity.origin).toEqual(origin);
    expect(entity.rot).toBe(1);
    expect(entity.blocked).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
    ]);
    // rot 1 CCW: (0,0)→(0,0), (1,0)→(0,1), (0,1)→(-1,0)
    expect(entity.occupied).toEqual([
      { x: 10, y: 20 },
      { x: 10, y: 21 },
      { x: 9, y: 20 },
    ]);
  });

  test("occupied translates blocked cells for rot 0", () => {
    const origin: TilePos = { x: 2, y: 3 };
    const blocked: readonly TilePos[] = [
      { x: 0, y: 0 },
      { x: 2, y: 1 },
    ];
    const entity = makeTileEntity(origin, 0, blocked);
    expect(entity.occupied).toEqual([
      { x: 2, y: 3 },
      { x: 4, y: 4 },
    ]);
  });
});

describe("deciPacketPos", () => {
  test("matches worldToDeci for a non-origin tile", () => {
    const physics = tileEntityPhysics({ x: 3, y: 5 }, 0);
    const packet = deciPacketPos(physics);
    expect(packet.x).toBe(worldToDeci(tileCenterWorld(3)));
    expect(packet.y).toBe(worldToDeci(tileCenterWorld(5)));
  });
});
