import {
    FOOTPRINT_CIRCLE_RADIUS,
    tileCenterWorld,
    type TilePos,
} from "@bundu/shared/tiles";
import { Circle, Polygon, testCircleCircle, testPolygonCircle } from "sat";

const footprintCircle = new Circle();

export function footprintIntersectsCircle(
    occupied: readonly TilePos[],
    circle: Circle,
    extraRadius = 0
): boolean {
    footprintCircle.r = FOOTPRINT_CIRCLE_RADIUS + extraRadius;
    return occupied.some(({ x, y }) => {
        footprintCircle.pos.x = tileCenterWorld(x);
        footprintCircle.pos.y = tileCenterWorld(y);
        return testCircleCircle(footprintCircle, circle);
    });
}

export function footprintIntersectsPolygon(
    occupied: readonly TilePos[],
    polygon: Polygon
): boolean {
    footprintCircle.r = FOOTPRINT_CIRCLE_RADIUS;
    return occupied.some(({ x, y }) => {
        footprintCircle.pos.x = tileCenterWorld(x);
        footprintCircle.pos.y = tileCenterWorld(y);
        return testPolygonCircle(polygon, footprintCircle);
    });
}

export function nearestFootprintPoint(
    occupied: readonly TilePos[],
    point: { x: number; y: number }
): { x: number; y: number } | undefined {
    let nearest: { x: number; y: number } | undefined;
    let nearestDistance = Infinity;
    for (const tile of occupied) {
        const candidate = {
            x: tileCenterWorld(tile.x),
            y: tileCenterWorld(tile.y),
        };
        const distance = Math.hypot(
            candidate.x - point.x,
            candidate.y - point.y
        );
        if (distance < nearestDistance) {
            nearest = candidate;
            nearestDistance = distance;
        }
    }
    return nearest;
}
