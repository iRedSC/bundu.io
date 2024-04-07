import fs from "fs";
import yaml from "yaml";
import { idMap, __dirname } from "./id_map.js";
import { flagMap } from "./flag_map.js";
import { PACKET_TYPE } from "../../shared/enums.js";

type craftingRecipeData = {
    duration: number;
    ingredients: { [key: string]: number };
    flags: string[];
};

export class CraftingRecipe {
    id: number;
    duration: number;
    ingredients: Map<number, number>;
    flags: number[];

    constructor(id: number, data: Partial<craftingRecipeData>) {
        this.id = id;
        this.duration = data.duration || 0;

        this.ingredients = new Map();
        if (data.ingredients) {
            for (const [k, v] of Object.entries(data.ingredients)) {
                const id = idMap.get(k);
                if (!id) {
                    console.log(`${k} not found in ID Map`);
                    continue;
                }
                this.ingredients.set(id, v);
            }
        }
        this.flags = [];
        for (const flag of data.flags || []) {
            const flagId = flagMap.get(flag);
            if (!flagId) {
                console.log(`${flag} not found in flag ID Map`);
                continue;
            }
            this.flags.push(flagId);
        }
    }

    pack() {
        return [this.id, Array.from(this.ingredients.entries()), this.flags];
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

export function packCraftingList() {
    const packet: any[] = [];

    for (const recipe of craftingList.values()) {
        packet.push(recipe.pack());
    }
    return [PACKET_TYPE.CRAFTING_RECIPES, packet];
}
