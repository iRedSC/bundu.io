import * as PIXI from "pixi.js";
import { AnimationMap, Keyframes } from "../../lib/animation";

class StatsBar {
  value: number;
  display: PIXI.Sprite;
  constructor(params) {
    this.value = 200
    this.display = 
  }
}

const transition: Keyframes<PIXI.Sprite> = new Keyframes()
transition.frame(0).set = ({ target, animation }) => {
  if (animation.firstKeyframe) {
    animation.goto(0, 400)
  }
}
export const barContainer = new PIXI.Container()
const hungerContainer = new PIXI.Container()
const heatContainer = new PIXI.Container()
const healthContainer = new PIXI.Container()

const health_bar_white = PIXI.Sprite.from('./assets/heat_bar.svg')
const health_bar = PIXI.Sprite.from('./assets/health_bar.svg')
const health = PIXI.Sprite.from('./assets/health.svg')
const hunger_bar = PIXI.Sprite.from('./assets/hunger_bar.svg')
const hunger = PIXI.Sprite.from('./assets/hunger.svg')
const heat_bar = PIXI.Sprite.from('./assets/heat_bar.svg')
const heat = PIXI.Sprite.from('./assets/heat.svg')
const overheat_bar = PIXI.Sprite.from('./assets/heat_bar.svg')

health_bar.width = 290
health_bar.position.set(92, 0)
health_bar_white.width = 290
health_bar_white.position.set(92, 0)
health_bar_white.tint = 0xBB0000;
healthContainer.scale.set(0.6)
healthContainer.position.set(-270, 0)

hunger_bar.width = 290
hunger_bar.position.set(92, 0)
hungerContainer.scale.set(0.6)
hungerContainer.position.set(0, 0)

heat_bar.width = 290
heat_bar.position.set(92, 0)
overheat_bar.width = 290
overheat_bar.position.set(92, 100)
overheat_bar.height = 200
overheat_bar.tint = 0x7B0700;
heatContainer.scale.set(0.6)
heatContainer.position.set(270, 0)



healthContainer.addChild(health_bar_white);
healthContainer.addChild(health_bar);
healthContainer.addChild(health);
hungerContainer.addChild(hunger_bar);
hungerContainer.addChild(hunger);

heatContainer.addChild(heat_bar);
heatContainer.addChild(overheat_bar);
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

let healthstat = 45
let hungerstat = 100
let heatstat = 200
export function updateStatBars(health: number, hunger: number, heat: number) {
  health = health * 2.9
  health_bar.width = health
  console.log(health)
  hunger = hunger * 2.9
  hunger_bar.width = hunger
  heat = heat * 2.9
  if (heat > 290) {
    overheat_bar.width = heat - 290
    heat_bar.width = 290
  }
  else {
    overheat_bar.width = 0
    heat_bar.width = heat
  }

}
window.addEventListener('click', updatestats)
window.addEventListener('contextmenu', updatestats2)
updateStatBars(healthstat, hungerstat, heatstat)

function updatestats() {
  healthstat -= 20
  hungerstat -= 10
  heatstat -= 20
  updateStatBars(healthstat, hungerstat, heatstat)
}
function updatestats2() {
  healthstat += 20
  hungerstat += 10
  heatstat += 20
  updateStatBars(healthstat, hungerstat, heatstat)

}
