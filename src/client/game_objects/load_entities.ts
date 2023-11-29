class Schemas {
    entities: object;
    structures: object;
    constructor() {
        this.entities = {};
        this.structures = {};
        fetch("entities.json")
            .then((Response) => Response.json())
            .then((data) => {
                this.entities = data;
            });
        fetch("structures.json")
            .then((response) => response.json())
            .then((data) => (this.structures = data));
    }
}

export const schemas = new Schemas();
