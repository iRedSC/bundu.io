import { describe, expect, test } from "bun:test";
import type { ModelDef } from "@bundu/shared/models/types";
import {
  modelBoundsPadding,
  rotatedModelBounds,
  setModelBounds,
} from "@bundu/server/configs/model_bounds";

const model: ModelDef = {
  id: "wide",
  abstract: false,
  parts: [],
  variants: { base: {} },
  animations: {},
  states: {},
  stateOrder: [],
  displays: {},
  tile: {
    size: { width: 320, height: 220 },
    origin: { x: 1, y: 0 },
    spillover: 10,
    footprint: [{ x: 0, y: 0 }],
  },
};

describe("tile model visual bounds", () => {
  test("keeps visual size independent from gameplay footprint", () => {
    setModelBounds(new Map([[model.id, model]]));

    expect(rotatedModelBounds("wide", 0)).toEqual({
      minX: -160,
      minY: -60,
      maxX: 160,
      maxY: 160,
    });
    expect(modelBoundsPadding()).toBe(160);
  });

  test("rotates bounds around the authored origin", () => {
    setModelBounds(new Map([[model.id, model]]));

    expect(rotatedModelBounds("wide", 1)).toEqual({
      minX: -160,
      minY: -160,
      maxX: 60,
      maxY: 160,
    });
  });
});
