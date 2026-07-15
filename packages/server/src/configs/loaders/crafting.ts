import { getNumericId } from "@bundu/shared/id_map";
import { flagMap } from "@bundu/shared/flag_map";
import type { ServerPacket } from "@bundu/shared/packet_definitions";
import craftingConfig from "../crafting.yml";

export type CraftingRecipeData = {
    duration: number;
    score?: number;
    amount?: number;
    ingredients: Record<string, number>;
    flags: string[];
};

export class CraftingRecipe {
    id: number;
    duration: number;
    score: number;
    amount: number;
    ingredients: Map<number, number>;
    flags: number[];

    constructor(id: number, data: Partial<CraftingRecipeData>) {
        this.id = id;
        this.duration = data.duration || 0;
        this.score = data.score || 0;
        this.amount = data.amount || 1;

        this.ingredients = new Map();
        if (data.ingredients) {
            for (const [k, v] of Object.entries(data.ingredients)) {
                const id = getNumericId(k);
                if (id === undefined) {
                    console.warn(`${k} not found in ID Map`);
                    continue;
                }
                this.ingredients.set(id, v);
            }
        }
        this.flags = [];
        for (const flag of data.flags || []) {
            const flagId = flagMap.get(flag);
            if (flagId === undefined) {
                console.warn(`${flag} not found in flag ID Map`);
                continue;
            }
            this.flags.push(flagId);
        }
    }

    pack(): ServerPacket.RecipeList["recipes"][number] {
        return [this.id, Array.from(this.ingredients.entries()), this.flags];
    }
}

export const craftingList: Map<number, CraftingRecipe> = new Map();

for (const [k, v] of Object.entries(craftingConfig)) {
    const numericId = getNumericId(k);
    if (numericId === undefined) throw new Error(`No ID matching: ${k}`);
    const recipe = new CraftingRecipe(
        numericId,
        v as Partial<CraftingRecipeData>
    );
    craftingList.set(numericId, recipe);
}

export function packCraftingList() {
    const packet: ServerPacket.RecipeList["recipes"] = [];
    for (const recipe of craftingList.values()) {
        packet.push(recipe.pack());
    }
    return packet;
}
