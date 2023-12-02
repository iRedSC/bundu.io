export function createSwitch(all_objects: any[]) {
    const switchCheckbox =
        document.querySelector<HTMLInputElement>("label.switch input")!;

    switchCheckbox.addEventListener("click", function () {
        if (switchCheckbox.checked) {
            for (let obj of all_objects) {
                obj.setNight();
            }
        } else {
            for (let obj of all_objects) {
                obj.setDay();
            }
        }
    });
}
