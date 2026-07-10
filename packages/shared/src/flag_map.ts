import flagMapData from "./flag_map.yml";
import { ReversableMap } from "./reverseable_map";

export const flagMap: ReversableMap<string, number> = new ReversableMap();

for (const [key, value] of Object.entries(flagMapData)) {
    if (typeof value === "number") flagMap.set(key, value);
}
