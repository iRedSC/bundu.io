import { ReversableMap } from "@ioengine/client";
import _idMap from "@shared/id_map.yml";
import typia from "typia";

const idMap: ReversableMap<string, number> = new ReversableMap();

for (let [k, v] of Object.entries(_idMap)) {
    if (typia.is<number>(v)) idMap.set(k, v);
}

export function getStringId(numericId: number | undefined | null) {
    return idMap.getv(numericId ?? -1);
}

export function getNumericId(stringId: string | undefined | null) {
    return idMap.get(stringId ?? "");
}
