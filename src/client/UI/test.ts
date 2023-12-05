import { Button } from '@pixi/ui';
import  * as PIXI  from 'pixi.js';

export const UI = new PIXI.Container();

const button = new Button(
     new PIXI.Graphics()
         .beginFill(0xFFFFFF)
         .drawRoundedRect(0, 0, 100, 50, 15)
);

button.onPress.connect(() => console.log('onPress'));

UI.addChild(button.view);