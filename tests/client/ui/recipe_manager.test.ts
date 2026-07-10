import { describe, expect, test, beforeEach } from "bun:test";
import { RecipeManager } from "../../../packages/client/src/ui/crafting_menu";

describe("RecipeManager", () => {
  let manager: RecipeManager;

  beforeEach(() => {
    manager = new RecipeManager();
  });

  test("filter returns craftable recipe ids when inventory has enough ingredients", () => {
    manager.updateRecipes({
      recipes: [
        [10, [[1, 2], [2, 1]], []],
        [20, [[1, 1]], []],
      ],
    });

    const items = new Map<number, number>([
      [1, 2],
      [2, 1],
    ]);

    const craftable = manager.filter(items, []);
    expect(craftable.sort((a, b) => a - b)).toEqual([10, 20]);
  });

  test("filter omits recipes missing ingredients or with insufficient amounts", () => {
    manager.updateRecipes({
      recipes: [
        [10, [[1, 2], [2, 1]], []],
        [20, [[1, 5]], []],
        [30, [[3, 1]], []],
      ],
    });

    const items = new Map<number, number>([
      [1, 2],
      [2, 1],
    ]);

    const craftable = manager.filter(items, []);
    expect(craftable).toEqual([10]);
    expect(craftable).not.toContain(20);
    expect(craftable).not.toContain(30);
  });

  test("updateRecipes replaces prior recipes", () => {
    manager.updateRecipes({
      recipes: [[10, [[1, 1]], []]],
    });

    expect(
      manager.filter(new Map([[1, 1]]), []),
    ).toEqual([10]);

    manager.updateRecipes({
      recipes: [[20, [[2, 1]], []]],
    });

    const after = manager.filter(
      new Map([
        [1, 10],
        [2, 1],
      ]),
      [],
    );
    expect(after).toEqual([20]);
    expect(after).not.toContain(10);
  });
});
