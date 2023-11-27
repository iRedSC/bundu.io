import { Entity } from "./entity";
import { Player } from "./player";
import { Structure } from "./structure";
import { WorldObject } from "./world_object";

export type GameObject = Player | Entity | Structure | WorldObject;

const classes = new Map();
classes.set("player", Player);
classes.set("entity", Entity);
classes.set("worldObject", WorldObject);

export function updateObjectList(
    currentObjects: Map<number, GameObject>,
    incoming: [number, number, string, unknown[]][],
    time: number
) {
    for (let object of incoming) {
        const operation = object[0];
        const id = object[1];
        const className = object[2];
        const data = object[3];

        if (operation === 1) {
            const currentObject = currentObjects.get(id);
            if (currentObject) {
                currentObject.update(time, data);
            }
        } else if (operation === 0) {
            const cls = classes.get(className);
            if (!cls) {
                return;
            }
            const newObject = new cls(time, id, data);
            currentObjects.set(id, newObject);
        } else if (operation === -1) {
            currentObjects.delete(id);
        }
    }
}
