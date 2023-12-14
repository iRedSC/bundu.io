import { entityMap, itemMap, structureMap } from "../configs/config_map";
import { Entity } from "./entity";
import { Player } from "./player";
import * as PIXI from "pixi.js";
import { Structure } from "./structure";
import { AnimationManager } from "../../lib/animation";

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
    playerList: Map<number, Player>,
    container: PIXI.Container,
    animationManager: AnimationManager
) {
    const time = data[1];
    const packets = data[2];

    for (let packet of packets) {
        switch (packet[0]) {
            // new player
            case 0: {
                const player = new Player(
                    animationManager,
                    packet[2],
                    new PIXI.Point(packet[3], packet[4]),
                    packet[5]
                );
                playerList.set(packet[1], player);
                container.addChild(player);
                break;
            }
            // update position
            case 1: {
                const player = playerList.get(packet[1]);
                if (!player) {
                    break;
                }
                player?.setState([time, packet[2], packet[3], packet[4]]);
                break;
            }
            // update items
            case 2: {
                const player = playerList.get(packet[1]);
                if (!player) {
                    break;
                }
                player?.setGear([
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
    entityList: Map<number, Entity>,
    container: PIXI.Container,
    animationManager: AnimationManager
) {
    const time = data[1];
    const packets = data[2];

    for (let packet of packets) {
        switch (packet[0]) {
            // new entity
            case 0: {
                const entity = new Entity(
                    animationManager,
                    entityMap.get(packet[2]) || "unknown_asset",
                    new PIXI.Point(packet[3], packet[4]),
                    packet[5]
                );
                entityList.set(packet[1], entity);
                container.addChild(entity);
                break;
            }
            // update position
            case 1: {
                const entity = entityList.get(packet[1]);
                if (!entity) {
                    break;
                }
                entity?.setState([time, packet[1], packet[2], packet[3]]);
                break;
            }
        }
    }
}

export type IncomingStructureData = [
    packetType: 2,
    time: number,
    (
        | [
              packetType: 0,
              id: number,
              type: number,
              x: number,
              y: number,
              rotation: number,
              size: number
          ]
    )[]
];

export function unpackStructureData(
    data: IncomingStructureData,
    structureList: Map<number, Structure>,
    container: PIXI.Container
) {
    const packets = data[2];

    for (let packet of packets) {
        switch (packet[0]) {
            // new structure
            case 0: {
                const structure = new Structure(
                    structureMap.get(packet[2]) || "unknown_asset",
                    new PIXI.Point(packet[3], packet[4]),
                    packet[5],
                    packet[6]
                );
                structureList.set(packet[1], structure);
                container.addChild(structure);
                break;
            }
        }
    }
}
