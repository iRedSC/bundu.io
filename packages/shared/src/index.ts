/**
 * Barrel for common shared utilities. Deep imports (`@bundu/shared/<module>`)
 * are also canonical via package exports — use them for modules not re-exported
 * here (e.g. id_map, packet_definitions). Within this package, prefer relative
 * extensionless imports (never import `@bundu/shared` from inside itself).
 */
export * from "./math";
export * from "./movement";
export * from "./object_utils";
export * from "./random";
export * from "./types";
export * from "./transforms";
export * from "./range";
export { ReversableMap } from "./reverseable_map";
export { Serializer } from "./network/serializer";
export {
    PacketReceiver,
    type SerializedPacket,
} from "./network/packet_receiver";
