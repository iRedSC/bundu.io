import flagMapData from "@shared/flag_map.yml";
import { ReversableMap } from "@ioengine/shared";

export const flagMap: ReversableMap<string, number> = new ReversableMap();

for (const [key, value] of Object.entries(flagMapData)) {
    if (typeof value === "number") flagMap.set(key, value);
}
