import { getNumericId } from "@bundu/shared/id_map";
import { flagMap } from "@bundu/shared/flag_map";
import type { ServerPacket } from "@bundu/shared/packet_definitions";

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
                    throw new Error(`recipes.${this.id}.ingredients: unknown item "${k}"`);
                }
                this.ingredients.set(id, v);
            }
        }
        this.flags = [];
        for (const flag of data.flags || []) {
            const flagId = flagMap.get(flag);
            if (flagId === undefined) {
                throw new Error(`recipes.${this.id}.flags: unknown flag "${flag}"`);
            }
            this.flags.push(flagId);
        }
    }

    pack(): ServerPacket.RecipeList["recipes"][number] {
        return [this.id, Array.from(this.ingredients.entries()), this.flags];
    }
}

export const craftingList: Map<number, CraftingRecipe> = new Map();

export function loadCraftingConfigs(
    records: Record<string, unknown>
): void {
    craftingList.clear();
    for (const [id, value] of Object.entries(records)) {
        const numericId = getNumericId(id);
        if (numericId === undefined) throw new Error(`No ID matching: ${id}`);
        craftingList.set(
            numericId,
            new CraftingRecipe(
                numericId,
                value as Partial<CraftingRecipeData>
            )
        );
    }
}

export function packCraftingList() {
    const packet: ServerPacket.RecipeList["recipes"] = [];
    for (const recipe of craftingList.values()) {
        packet.push(recipe.pack());
    }
    return packet;
}
