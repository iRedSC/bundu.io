import { ReversableMap } from "../../shared/reverseable_map";
import idMap from "../../shared/id_map.yml";

export const itemMap: ReversableMap<string, number> = new ReversableMap();

for (let [k, v] of Object.entries(idMap)) {
    itemMap.set(k, v);
}
