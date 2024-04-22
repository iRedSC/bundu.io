import fs from "fs";
import yaml from "yaml";
import { idMap, __dirname } from "./id_map.js";
import { flagMap } from "./flag_map.js";
import { PACKET } from "../../../shared/enums.js";
import { z } from "zod";

const CraftingRecipeData = z.object({
    duration: z.number(),
    ingredients: z.record(z.string(), z.number()),
    flags: z.string().array().nullish(),
});
type CraftingRecipeData = z.infer<typeof CraftingRecipeData>;

const CraftingConfigSchema = z.record(z.string(), CraftingRecipeData);
type CraftingConfigSchema = z.infer<typeof CraftingConfigSchema>;

export class CraftingRecipe {
    id: number;
    duration: number;
    ingredients: Map<number, number>;
    flags: number[];

    constructor(id: number, data: Partial<CraftingRecipeData>) {
        this.id = id;
        this.duration = data.duration || 0;

        this.ingredients = new Map();
        if (data.ingredients) {
            for (const [k, v] of Object.entries(data.ingredients)) {
                const id = idMap.get(k);
                if (!id) {
                    console.warn(`${k} not found in ID Map`);
                    continue;
                }
                this.ingredients.set(id, v);
            }
        }
        this.flags = [];
        for (const flag of data.flags || []) {
            const flagId = flagMap.get(flag);
            if (!flagId) {
                console.warn(`${flag} not found in flag ID Map`);
                continue;
            }
            this.flags.push(flagId);
        }
    }

    pack() {
        return [this.id, Array.from(this.ingredients.entries()), this.flags];
    }
}

const _craftingRecipeData: CraftingConfigSchema = CraftingConfigSchema.parse(
    yaml.parse(fs.readFileSync(`${__dirname}/crafting.yml`, "utf8"))
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
    return [PACKET.SERVER.CRAFTING_RECIPES, packet];
}
