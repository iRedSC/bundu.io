import { beforeEach, describe, expect, test } from "bun:test";
import { RecipeManager } from "../../../packages/client/src/ui/crafting_menu";

describe("RecipeManager", () => {
  let manager: RecipeManager;

  beforeEach(() => {
    manager = new RecipeManager();
  });

  test("returns craftable recipe views in server order", () => {
    manager.updateRecipes({
      recipes: [
        [20, 200, 3, [[1, 1]], []],
        [10, 100, 2, [[1, 2], [2, 1]], []],
        [30, 300, 1, [], []],
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
    ).toEqual([
      { recipeId: 20, resultItemId: 200, resultAmount: 3 },
      { recipeId: 10, resultItemId: 100, resultAmount: 2 },
      { recipeId: 30, resultItemId: 300, resultAmount: 1 },
    ]);
  });

  test("treats recipe identity independently from result item identity", () => {
    manager.updateRecipes({
      recipes: [
        [41, 900, 1, [[1, 1]], []],
        [42, 900, 4, [[2, 1]], []],
      ],
    });

    expect([...manager.recipes.keys()]).toEqual([41, 42]);
    expect(
      manager.filter(
        new Map([
          [1, 1],
          [2, 1],
        ]),
        [],
      ),
    ).toEqual([
      { recipeId: 41, resultItemId: 900, resultAmount: 1 },
      { recipeId: 42, resultItemId: 900, resultAmount: 4 },
    ]);
  });

  test("requires every ingredient and accepts exact quantities", () => {
    manager.updateRecipes({
      recipes: [
        [10, 110, 1, [[1, 2], [2, 1]], []],
        [20, 120, 1, [[1, 3]], []],
        [30, 130, 1, [[3, 1]], []],
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
    ).toEqual([{ recipeId: 10, resultItemId: 110, resultAmount: 1 }]);
  });

  test("requires all recipe flags and ignores unrelated flags and inventory", () => {
    manager.updateRecipes({
      recipes: [
        [10, 110, 1, [], [1]],
        [20, 120, 1, [], [1, 2]],
        [30, 130, 1, [], []],
      ],
    });

    expect(manager.filter(new Map([[999, 50]]), [1, 99])).toEqual([
      { recipeId: 10, resultItemId: 110, resultAmount: 1 },
      { recipeId: 30, resultItemId: 130, resultAmount: 1 },
    ]);
    expect(manager.filter(new Map([[999, 50]]), [1, 2, 99])).toEqual([
      { recipeId: 10, resultItemId: 110, resultAmount: 1 },
      { recipeId: 20, resultItemId: 120, resultAmount: 1 },
      { recipeId: 30, resultItemId: 130, resultAmount: 1 },
    ]);
  });

  test("replaces the previous recipe list and removes stale recipes", () => {
    manager.updateRecipes({
      recipes: [
        [10, 110, 1, [[1, 1]], []],
        [11, 111, 1, [], []],
      ],
    });
    manager.updateRecipes({
      recipes: [[20, 220, 5, [[2, 1]], []]],
    });

    expect([...manager.recipes.keys()]).toEqual([20]);
    expect(
      manager.filter(
        new Map([
          [1, 10],
          [2, 1],
        ]),
        [],
      ),
    ).toEqual([{ recipeId: 20, resultItemId: 220, resultAmount: 5 }]);
  });

  test("defensively copies ingredient and flag arrays", () => {
    const ingredients: [number, number][] = [[1, 1]];
    const flags = [7];

    manager.updateRecipes({
      recipes: [[10, 110, 2, ingredients, flags]],
    });

    const firstIngredient = ingredients[0];
    if (!firstIngredient) throw new Error("Expected test ingredient");
    firstIngredient[1] = 99;
    ingredients.push([2, 1]);
    flags.push(8);

    expect(manager.filter(new Map([[1, 1]]), [7])).toEqual([
      { recipeId: 10, resultItemId: 110, resultAmount: 2 },
    ]);
  });
});
