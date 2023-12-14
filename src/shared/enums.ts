export enum PACKET {
    NEW_WORLD_OBJECT = 100,
    MOVE_OBJECT = 101,

    NEW_PLAYER = 200,
    UPDATE_PLAYER_GEAR = 201,
}

export enum OBJECT_TYPE {
    Structure = 0,
    Player = 1,
    Entity = 2,
}

export type Packet =
    | [
          type: PACKET.MOVE_OBJECT,
          [id: number, x: number, y: number, rotation: number][]
      ]
    | [
          type: PACKET.NEW_PLAYER,
          [
              id: number,
              name: string,
              x: number,
              y: number,
              rotation: number,
              holding: number,
              helmet: number,
              backpack: number
          ][]
      ]
    | [
          type: PACKET.UPDATE_PLAYER_GEAR,
          [id: number, holding: number, helmet: number, backpack: number][]
      ];
