import { Button } from '@pixi/ui';
import  * as PIXI  from 'pixi.js';
import  { Layout } from '@pixi/layout';

const button = new Button(
    new PIXI.Graphics()
        .beginFill(0xFFFFFF)
        .drawRoundedRect(0, 0, 100, 50, 15),
);

export const UI = new Layout({
    id: 'root',
    content: {
  
        container1: new PIXI.Graphics() 
        .beginFill(0xff0000)
        .drawCircle(20, 20, 20),

        container2 : button.view
        
    },

    styles: {
        background: 'red',
    }

}); 




button.hover = () => (console.log('onPress'));

