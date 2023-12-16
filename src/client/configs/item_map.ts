import { ReversableMap } from "../../shared/reverseable_map";
import Types from "../../shared/types.yml";

export const itemMap: ReversableMap<string, number> = new ReversableMap();

for (let [k, v] of Object.entries(Types)) {
    itemMap.set(k, v);
}
