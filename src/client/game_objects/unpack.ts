import { entityMap, itemMap } from "../configs/config_map";
import { Entity } from "./entity";
import { Player } from "./player";

export type IncomingPlayerData =
    | [
          packetType: 0,
          time: number,
          (
              | [
                    packetType: 0,
                    id: number,
                    name: string,
                    x: number,
                    y: number,
                    rotation: number,
                    selectedItem: number,
                    helmet: number,
                    backpack: number
                ]
              | [
                    packetType: 1,
                    id: number,
                    x: number,
                    y: number,
                    rotation: number
                ]
              | [
                    packetType: 2,
                    id: number,
                    selectedItem: number,
                    helmet: number,
                    backpack: number
                ]
          )[]
      ];

export function unpackPlayerData(
    data: IncomingPlayerData,
    playerList: Map<number, Player>
) {
    const time = data[1];
    const packets = data[2];

    for (let packet of packets) {
        switch (packet[0]) {
            // new player
            case 0: {
                const player = new Player(
                    packet[1],
                    packet[2],
                    time,
                    [packet[3], packet[4]],
                    packet[5]
                );
                playerList.set(packet[1], player);
                break;
            }
            // update position
            case 1: {
                const player = playerList.get(packet[1]);
                if (!player) {
                    break;
                }
                player?.update([time, packet[2], packet[3], packet[4]]);
                break;
            }
            // update items
            case 2: {
                const player = playerList.get(packet[1]);
                if (!player) {
                    break;
                }
                player?.update(undefined, [
                    itemMap.get(packet[2]) || "",
                    itemMap.get(packet[3]) || "",
                    packet[4],
                ]);
                break;
            }
        }
    }
}

export type IncomingEntityData = [
    packetType: 1,
    time: number,
    (
        | [
              packetType: 0,
              id: number,
              type: number,
              x: number,
              y: number,
              rotation: number
          ]
        | [packetType: 1, x: number, y: number, rotation: number]
    )[]
];

export function unpackEntityData(
    data: IncomingEntityData,
    entityList: Map<number, Entity>
) {
    const time = data[1];
    const packets = data[2];

    for (let packet of packets) {
        switch (packet[0]) {
            // new entity
            case 0: {
                const player = new Entity(
                    packet[1],
                    entityMap.get(packet[2]) || "elephant"
                );
                entityList.set(packet[1], player);
                break;
            }
            // update position
            case 1: {
                const entity = entityList.get(packet[1]);
                if (!entity) {
                    break;
                }
                entity?.update([time, packet[1], packet[2], packet[3]]);
                break;
            }
        }
    }
}
