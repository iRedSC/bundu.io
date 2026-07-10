import idMapData from "./id_map.yml";
import { ReversableMap } from "@bundu/shared";

const idMap: ReversableMap<string, number> = new ReversableMap();

for (const [key, value] of Object.entries(idMapData)) {
    if (typeof value === "number") idMap.set(key, value);
}

export function getStringId(numericId: number | undefined | null): string {
    return idMap.getv(numericId ?? -1) ?? "";
}

export function getNumericId(
    stringId: string | undefined | null
): number | undefined {
    return idMap.get(stringId ?? "");
}
