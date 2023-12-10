import * as PIXI from "pixi.js";
export const barContainer = new PIXI.Container()
const hungerContainer = new PIXI.Container()
const heatContainer = new PIXI.Container()
const healthContainer = new PIXI.Container()

const health_bar = PIXI.Sprite.from('./assets/health_bar.svg')
const health = PIXI.Sprite.from('./assets/health.svg')
const hunger_bar = PIXI.Sprite.from('./assets/hunger_bar.svg')
const hunger = PIXI.Sprite.from('./assets/hunger.svg')
const heat_bar = PIXI.Sprite.from('./assets/heat_bar.svg')
const heat = PIXI.Sprite.from('./assets/heat.svg')

health_bar.width = 290
health_bar.position.set(92, 0)
healthContainer.scale.set(0.6)
healthContainer.position.set(-270, 0) 

hunger_bar.width = 290
hunger_bar.position.set(92, 0)
hungerContainer.scale.set(0.6)
hungerContainer.position.set(0, 0) 

heat_bar.width = 290
heat_bar.position.set(92, 0)
heatContainer.scale.set(0.6)
heatContainer.position.set(270, 0) 




healthContainer.addChild(health_bar);
healthContainer.addChild(health);
hungerContainer.addChild(hunger_bar);
hungerContainer.addChild(hunger);
heatContainer.addChild(heat_bar);
heatContainer.addChild(heat);

barContainer.addChild(heatContainer)
barContainer.addChild(healthContainer)
barContainer.addChild(hungerContainer)

function resize() {
    barContainer.position.set(
        (window.innerWidth - barContainer.width) / 2 + 270,
        window.innerHeight - 250
      );
    }
  window.addEventListener("resize", resize);
  resize()