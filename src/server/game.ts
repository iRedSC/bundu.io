export class BunduServer {
    constructor() {}

    receiveMessage(id: number, message: ArrayBuffer) {
        console.log(id, message);
    }
}
