import map from "../map.json";

type MapConfigObject = {
    class: string;
    id: string;
    variant?: number;
    x: number;
    y: number;
    rotation: number;
    size: number;
};

type MapConfigDecoration = {
    id: string;
    x: number;
    y: number;
    rotation: number;
    size: number;
};

type MapConfigGround = {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
};

export type MapConfig = {
    size: number;
    objects: MapConfigObject[];
    decorations: MapConfigDecoration[];
    ground: MapConfigGround[];
};

export function loadMap(): MapConfig {
    return map;
}
