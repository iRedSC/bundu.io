export class BunduServer {
    messages: string[];

    constructor() {
        this.messages = [];
    }

    publish(_message: string) {
        console.log("no publisher provided");
    }

    receiveMessage(_id: number, message: string) {
        this.messages.push(message);
        this.publish(message);
    }
}
