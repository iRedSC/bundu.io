import { beforeEach, describe, expect, test } from "bun:test";
import { RecipeManager } from "../../../packages/client/src/ui/crafting_menu";

describe("RecipeManager", () => {
  let manager: RecipeManager;

  beforeEach(() => {
    manager = new RecipeManager();
  });

  test("returns craftable recipes in server-provided order", () => {
    manager.updateRecipes({
      recipes: [
        [20, [[1, 1]], []],
        [10, [[1, 2], [2, 1]], []],
        [30, [], []],
      ],
    });

    expect(
      manager.filter(
        new Map([
          [1, 2],
          [2, 1],
        ]),
        [],
      ),
    ).toEqual([20, 10, 30]);
  });

  test("requires every ingredient at its configured quantity", () => {
    manager.updateRecipes({
      recipes: [
        [10, [[1, 2], [2, 1]], []],
        [20, [[1, 3]], []],
        [30, [[3, 1]], []],
      ],
    });

    expect(
      manager.filter(
        new Map([
          [1, 2],
          [2, 1],
        ]),
        [],
      ),
    ).toEqual([10]);
  });

  test("requires all recipe flags and permits unrelated inventory flags", () => {
    manager.updateRecipes({
      recipes: [
        [10, [], [1]],
        [20, [], [1, 2]],
        [30, [], []],
      ],
    });

    expect(manager.filter(new Map(), [1, 99])).toEqual([10, 30]);
    expect(manager.filter(new Map(), [1, 2, 99])).toEqual([10, 20, 30]);
  });

  test("a recipe update atomically replaces the previous list", () => {
    manager.updateRecipes({ recipes: [[10, [[1, 1]], []]] });
    manager.updateRecipes({ recipes: [[20, [[2, 1]], []]] });

    expect(
      manager.filter(
        new Map([
          [1, 10],
          [2, 1],
        ]),
        [],
      ),
    ).toEqual([20]);
  });

  test("copies recipe requirements instead of retaining packet arrays", () => {
    const requirements: [number, number][] = [[1, 1]];
    const flags = [7];
    manager.updateRecipes({ recipes: [[10, requirements, flags]] });

    requirements[0] = [1, 99];
    requirements.push([2, 1]);
    flags.push(8);

    expect(manager.filter(new Map([[1, 1]]), [7])).toEqual([10]);
  });
});
