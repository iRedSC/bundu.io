import { Container, Graphics } from "pixi.js";

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
