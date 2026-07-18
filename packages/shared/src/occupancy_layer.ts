/** Vertical stack slot on a world tile. */
export type OccupancyLayer = "floor" | "structure" | "roof";

/** Top → bottom order for editor picks and draw intent. */
export const OCCUPANCY_LAYERS_TOP_DOWN: readonly OccupancyLayer[] = [
    "roof",
    "structure",
    "floor",
];
