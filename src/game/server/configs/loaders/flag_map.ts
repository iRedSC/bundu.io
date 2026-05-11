import flagMapData from "@shared/flag_map.yml";
import { ReversableMap } from "@ioengine/server";
import typia from "typia";

export const flagMap: ReversableMap<string, number> = new ReversableMap();

for (let [k, v] of Object.entries(flagMapData)) {
    if (typia.is<number>(v)) flagMap.set(k, v);
}
