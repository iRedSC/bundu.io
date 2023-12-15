import { ReversableMap } from "./reverseable_map";
import Types from "./types.yml";

export const itemMap: ReversableMap<string, number> = new ReversableMap();

for (let [k, v] of Object.entries(Types)) {
    itemMap.set(k, v);
}
