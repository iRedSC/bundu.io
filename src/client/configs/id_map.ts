import { ReversableMap } from "../../shared/reverseable_map";
import _idMap from "../../shared/id_map.yml";

export const idMap: ReversableMap<string, number> = new ReversableMap();

for (let [k, v] of Object.entries(_idMap)) {
    idMap.set(k, v);
}
