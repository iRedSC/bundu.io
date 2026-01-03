import { Container, Graphics } from "pixi.js";
import { ServerPacket } from "@shared/packet_definitions";

// Used for creating debug objects on the map, such as hitboxes or id text.

export const debugContainer = new Container();
debugContainer.zIndex = 1000;

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

export function drawPolygon(packet: ServerPacket.DebugDrawPolygon) {
    const polygon = new Graphics();
    polygon.stroke({ width: 2, color: "#FF0000" });
    const start = { x: packet.startX, y: packet.startY };
    polygon.moveTo(start.x, start.y);
    for (const rawPoint of packet.points) {
        const point = {
            x: start.x + rawPoint[0],
            y: start.y + rawPoint[1],
        };
        polygon.lineTo(point.x, point.y);
    }
    debugContainer.addChild(polygon);
    setTimeout(() => {
        debugContainer.removeChild(polygon);
        polygon.destroy();
    }, 1000);
}

type BasicPoint = { x: number; y: number } | [number, number];

let lastDraw: Graphics | undefined;
export function drawLine(p1: BasicPoint, p2: BasicPoint) {
    const [x1, y1] = Array.isArray(p1) ? p1 : [p1.x, p1.y];
    const [x2, y2] = Array.isArray(p2) ? p2 : [p2.x, p2.y];

    const line = new Graphics();
    line.moveTo(x1, y1);
    line.lineTo(x2, y2);
    line.stroke({ width: 2, color: 0xffffff });

    if (lastDraw) {
        debugContainer.removeChild(lastDraw);
        lastDraw.destroy();
    }
    debugContainer.addChild(line);
    lastDraw = line;
}
