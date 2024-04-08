import { fileURLToPath } from "url";
import { dirname } from "path";
import fs from "fs";
import yaml from "yaml";
import { ReversableMap } from "../../shared/reverseable_map.js";

const __filename = fileURLToPath(import.meta.url);
export const __dirname = dirname(__filename);

// Load the id map
const _idMapData: { [key: string]: number } = yaml.parse(
    fs.readFileSync(`${__dirname}/../../shared/id_map.yml`, "utf8")
);
export const idMap: ReversableMap<string, number> = new ReversableMap();

for (let [k, v] of Object.entries(_idMapData)) {
    idMap.set(k, v);
}
