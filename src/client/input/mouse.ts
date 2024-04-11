export class MouseInputListener {
    mousePos: [number, number];

    constructor(mouseMoveCallback: Function) {
        this.mousePos = [0, 0];

        document.body.addEventListener("mousemove", (event) => {
            this.mousePos[0] = event.clientX;
            this.mousePos[1] = event.clientY;
            mouseMoveCallback(this.mousePos);
        });

        document.body.addEventListener("touchmove", (event) => {
            this.mousePos[0] = event.touches[0].clientX;
            this.mousePos[1] = event.touches[0].clientY;
            mouseMoveCallback(this.mousePos);
        });
    }
}
