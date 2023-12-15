import { fileURLToPath } from "url";
import { dirname } from "path";
import fs from "fs";
import yaml from "yaml";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const resources = yaml.parse(
    fs.readFileSync(`${__dirname}/resources.yml`, "utf8")
);

console.log(resources);
