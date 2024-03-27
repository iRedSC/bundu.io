import fs from "fs";
import yaml from "yaml";
import { idMap, __dirname } from "./id_map.js";

type craftingRecipeData = {
    materials: { [key: string]: number };
    flags: string[];
};

export class CraftingRecipe {
    id: number;
    materials: Map<string, number>;
    flags: string[];

    constructor(id: number, data: Partial<craftingRecipeData>) {
        this.id = id;

        this.materials = new Map();
        if (data.materials) {
            for (const [k, v] of Object.entries(data.materials)) {
                this.materials.set(k, v);
            }
        }
        this.flags = data.flags || [];
        console.log(this);
    }
}

const _craftingRecipeData: { [key: string]: craftingRecipeData } = yaml.parse(
    fs.readFileSync(`${__dirname}/crafting.yml`, "utf8")
);
export const craftingList: Map<number, CraftingRecipe> = new Map();

for (let [k, v] of Object.entries(_craftingRecipeData)) {
    const numericId = idMap.get(k);
    const recipe = new CraftingRecipe(numericId, v);
    craftingList.set(numericId, recipe);
}
