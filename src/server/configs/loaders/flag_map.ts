import { fileURLToPath } from "url";
import { dirname } from "path";
import fs from "fs";
import yaml from "yaml";
import { ReversableMap } from "../../../shared/reverseable_map.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load the flag map
const _flagMapData: { [key: string]: number } = yaml.parse(
    fs.readFileSync(`${__dirname}/../../../shared/flag_map.yml`, "utf8")
);
export const flagMap: ReversableMap<string, number> = new ReversableMap();

for (let [k, v] of Object.entries(_flagMapData)) {
    flagMap.set(k, v);
}
