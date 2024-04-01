enum MOVE_DIR {
    NEGATIVE = -1,
    NONE = 0,
    POSITIVE = 1,
}

/**
 * Override the methods of this class to accept different player actions.
 */
export class PlayerController {
    constructor() {}

    // * Actions

    /**
     * Request to move a player in a specific direction.
     * @param id player id
     * @param x direction to move x `(-1, 0, 1)`
     * @param y direction to move y `(-1, 0, 1)`
     */
    public move(id: number, x: MOVE_DIR, y: MOVE_DIR): void {}

    /**
     * Request to rotate player.
     * @param id player id
     * @param rotation requested rotation in radians
     */
    public rotate(id: number, rotation: number): void {}

    /**
     * Request for a player to attack.
     * @param id player id
     * @param stop whether the request is to stop attacking
     */
    public attack(id: number, stop: boolean): void {}

    /**
     * Request for a player to block.
     * @param id player id
     * @param stop whether the request is to stop blocking
     */
    public block(id: number, stop: boolean = false): void {}

    /**
     * Request for a player to select a specific item.
     * This happens when a player clicks on an item in their hotbar.
     * @param id player id
     * @param itemId id of item attempting to be selected
     */
    public selectItem(id: number, itemId: number): void {}

    /**
     * Request for a player to craft a specific item.
     * @param id player id
     * @param itemId id of item attemping to be crafted
     */
    public craftItem(id: number, itemId: number): void {}

    // * Requests

    /**
     * Request for object information to be sent to player's client.
     * @param id player id
     * @param objects id of requested objects
     */
    public requestObjects(id: number, objects: number[]): void {}
}
