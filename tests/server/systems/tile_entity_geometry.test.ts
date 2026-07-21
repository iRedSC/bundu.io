import { describe, expect, test } from "bun:test";
import { TILE_SIZE } from "@bundu/shared/tiles";
import {
  footprintIntersectsCircle,
  footprintIntersectsPolygon,
  nearestFootprintPoint,
} from "@bundu/server/systems/tile_entity_geometry";
import { Circle, Polygon, Vector } from "sat";

const occupied = [
  { x: 4, y: 6 },
  { x: 5, y: 6 },
  { x: 4, y: 7 },
  { x: 5, y: 7 },
];

describe("tile entity footprint geometry", () => {
  test("circle intersections include non-origin footprint tiles", () => {
    const farTile = new Circle(
      new Vector(5 * TILE_SIZE + TILE_SIZE / 2, 7 * TILE_SIZE + TILE_SIZE / 2),
      10,
    );

    expect(footprintIntersectsCircle(occupied, farTile)).toBe(true);
    farTile.pos.x = 7 * TILE_SIZE;
    farTile.pos.y = 9 * TILE_SIZE;
    expect(footprintIntersectsCircle(occupied, farTile)).toBe(false);
  });

  test("polygon intersections include non-origin footprint tiles", () => {
    const attack = new Polygon(new Vector(), [
      new Vector(540, 740),
      new Vector(560, 740),
      new Vector(560, 760),
      new Vector(540, 760),
    ]);

    expect(footprintIntersectsPolygon(occupied, attack)).toBe(true);
  });

  test("selects the nearest occupied tile center", () => {
    expect(nearestFootprintPoint(occupied, { x: 590, y: 790 })).toEqual({
      x: 550,
      y: 750,
    });
    expect(nearestFootprintPoint([], { x: 0, y: 0 })).toBeUndefined();
  });
});
