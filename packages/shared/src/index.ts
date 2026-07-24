/**
 * Barrel for common shared utilities. Deep imports (`@bundu/shared/<module>`)
 * are also canonical via package exports — use them for modules not re-exported
 * here (e.g. packet_definitions). Within this package, prefer relative
 * extensionless imports (never import `@bundu/shared` from inside itself).
 */
export * from "./math";
export * from "./movement";
export * from "./object_utils";
export * from "./random";
export * from "./types";
export * from "./tiles";
export * from "./occupancy_layer";
export * from "./structure_placement";
export * from "./transforms";
export * from "./attack_box";
export * from "./range";
export * from "./session";
export * from "./username";
export * from "./registry";
export * from "./command";
export * from "./entity_selector";
export * from "./item_lock";
export { ReversableMap } from "./reverseable_map";
export {
    Serializer,
    type PacketGuards,
    type SerializedPacket,
} from "./network/serializer";
