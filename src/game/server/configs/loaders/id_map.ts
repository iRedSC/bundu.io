import idMapData from "@shared/id_map.yml";
import { ReversableMap } from "@ioengine/server";
import typia from "typia";

const idMap: ReversableMap<string, number> = new ReversableMap();

for (let [k, v] of Object.entries(idMapData)) {
    if (typia.is<number>(v)) idMap.set(k, v);
}

export function getStringId(numericId: number | undefined | null) {
    return idMap.getv(numericId ?? -1);
}

export function getNumericId(stringId: string | undefined | null) {
    return idMap.get(stringId ?? "");
}
