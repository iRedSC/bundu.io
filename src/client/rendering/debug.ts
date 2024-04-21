import { Container, Graphics } from "pixi.js";
import { Schema.Server } from "../../shared/enums";

// Used for creating debug objects on the map, such as hitboxes or id text.

export const debugContainer = new Container();

export class DebugWorldObject {
    containers: Map<string, Container>;

    constructor() {
        this.containers = new Map();
    }

    update(value: string, container: Container) {
        const current = this.containers.get(value);
        if (!current) {
            this.containers.set(value, container);
            debugContainer.addChild(container);
            return;
        }
        debugContainer.removeChild(current);
        current.destroy();
        this.containers.set(value, container);
        debugContainer.addChild(container);
    }

    set renderable(value: boolean) {
        for (const container of this.containers.values()) {
            container.renderable = value;
        }
    }
}

export function drawPolygon(packet: Schema.Server.drawPolygon) {
    const polygon = new Graphics();
    polygon.lineStyle({ width: 20, color: "#FF0000" });
    const start = { x: packet[0] * 10, y: packet[1] * 10 };
    polygon.moveTo(start.x, start.y);
    for (const rawPoint of packet[2]) {
        const point = {
            x: start.x + rawPoint[0] * 10,
            y: start.y + rawPoint[1] * 10,
        };
        polygon.lineTo(point.x, point.y);
    }
    debugContainer.addChild(polygon);
    setTimeout(() => {
        debugContainer.removeChild(polygon);
        polygon.destroy();
    }, 1000);
}
