import type { RegistryId } from "@bundu/shared/registry";
import type { ServerPacket } from "@bundu/shared/packet_definitions";
import type { SourcedRecord } from "../packs.js";
import { flagRegistry } from "../flag_registry.js";
import { gameRegistries } from "../registries.js";

export type CraftingRecipeData = {
    result: { item: string; amount?: number };
    duration: number;
    score?: number;
    ingredients: Record<string, number>;
    requirements?: string[];
};

function object(value: unknown, source: string): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`${source}: expected an object`);
    }
    return value as Record<string, unknown>;
}

function nonNegative(value: unknown, source: string, fallback = 0): number {
    if (value === undefined) return fallback;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
        throw new Error(`${source}: expected a non-negative number`);
    }
    return value;
}

function positiveInteger(value: unknown, source: string, fallback?: number): number {
    if (value === undefined && fallback !== undefined) return fallback;
    if (!Number.isSafeInteger(value) || (value as number) <= 0) {
        throw new Error(`${source}: expected a positive integer`);
    }
    return value as number;
}

export class CraftingRecipe {
    constructor(
        readonly id: RegistryId<"recipe">,
        readonly resultItemId: RegistryId<"item">,
        readonly duration: number,
        readonly score: number,
        readonly amount: number,
        readonly ingredients: ReadonlyMap<RegistryId<"item">, number>,
        readonly flags: readonly number[]
    ) {}

    pack(): ServerPacket.RecipeList["recipes"][number] {
        return [
            this.id,
            this.resultItemId,
            this.amount,
            Array.from(this.ingredients.entries()),
            [...this.flags],
        ];
    }
}

export const craftingList = new Map<RegistryId<"recipe">, CraftingRecipe>();

export function loadCraftingConfigs(
    sources: ReadonlyMap<string, SourcedRecord>
): void {
    const registries = gameRegistries();
    const flags = flagRegistry();
    craftingList.clear();
    for (const [location, source] of sources) {
        const data = object(source.value, source.source);
        const result = object(data.result, `${source.source}.result`);
        if (typeof result.item !== "string") {
            throw new Error(`${source.source}.result.item: expected a string`);
        }
        const resultItemId = registries.item.resolve(
            result.item,
            source.namespace,
            `${source.source}.result.item`
        );
        const ingredients = new Map<RegistryId<"item">, number>();
        for (const [item, amount] of Object.entries(
            object(data.ingredients ?? {}, `${source.source}.ingredients`)
        )) {
            ingredients.set(
                registries.item.resolve(
                    item,
                    source.namespace,
                    `${source.source}.ingredients.${item}`
                ),
                positiveInteger(amount, `${source.source}.ingredients.${item}`)
            );
        }
        if (
            data.requirements !== undefined &&
            (!Array.isArray(data.requirements) ||
                data.requirements.some((flag) => typeof flag !== "string"))
        ) {
            throw new Error(`${source.source}.requirements: expected a string array`);
        }
        const recipeFlags =
            (data.requirements as string[] | undefined)?.map((flag, index) =>
                flags.resolve(flag, `${source.source}.requirements[${index}]`)
            ) ?? [];
        const id = registries.recipe.id(location as `${string}:${string}`, source.source);
        craftingList.set(
            id,
            new CraftingRecipe(
                id,
                resultItemId,
                nonNegative(data.duration, `${source.source}.duration`),
                nonNegative(data.score, `${source.source}.score`),
                positiveInteger(result.amount, `${source.source}.result.amount`, 1),
                ingredients,
                recipeFlags
            )
        );
    }
}

export function packCraftingList() {
    return [...craftingList.values()].map((recipe) => recipe.pack());
}
