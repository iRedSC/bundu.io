import { Component } from "./component";
import { GameObject } from "./game_object";
import { System } from "./system";
import { World } from "./world";
import SAT from "sat";

type Health = { value: number };
const Health = Component.register<Health>();

type Damage = { value: number };
const Damage = Component.register<Damage>();

type Physics = { position: SAT.Vector; collider: SAT.Circle; rotation: number };
const Physics = Component.register<Physics>();

type Socket = { socket: WebSocket };
const Socket = Component.register<Socket>();

class Entity extends GameObject {
    constructor(health: Health, damage: Damage, physics: Physics) {
        super();

        this.add(new Physics(physics));
        this.add(new Health(health));
        this.add(new Damage(damage));

        this.pack.new = () => {
            const physics = Physics.get(this).data;
            const health = Health.get(this).data.value;
            const damage = Damage.get(this).data.value;

            return [
                this.id,
                physics.position.x,
                physics.position.y,
                physics.rotation,
                health,
                damage,
            ];
        };
    }
}

class AISystem extends System {
    constructor() {
        super([Physics]);
    }

    public update(time: number, delta: number, object: GameObject): void {
        if (Math.random() > 0.8) {
            this.trigger("hurt", { damage: 10 });
        }

        const physics = Physics.get(object).data;

        physics.position.x -= 1;
        console.log(physics.position);
    }
}

class DamageSystem extends System {
    constructor() {
        super([Health]);
        this.listen("hurt", this.hurt);
    }

    hurt(data: any, objects: Iterable<GameObject>) {
        for (const object of objects) {
            const health = Health.get(object);
            if (health && data?.damage) {
                health.data.value -= data.damage;
                console.log(health.data.value);
            }
        }
    }
}

const world = new World();
world.addSystem(new AISystem());
world.addSystem(new DamageSystem());

const newPhysics = () => {
    const position = new SAT.Vector();
    const collider = new SAT.Circle(position, 5);
    return { position, collider, rotation: 5 };
};

const bear = new Entity({ value: 1000 }, { value: 50 }, newPhysics());
world.addObject(bear);

setInterval(() => {
    world.update();
}, 1);

console.log(bear.pack.new());
