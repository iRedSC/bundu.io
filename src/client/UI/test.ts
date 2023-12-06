import { Button } from '@pixi/ui';
import  * as PIXI  from 'pixi.js';
import  { Layout } from '@pixi/layout';

const button = new Button(
    PIXI.Sprite.from("./assets/recipie_book.svg", {
        mipmap: PIXI.MIPMAP_MODES.ON,
    }
    ));

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




button.down = () => (button.view.scale.set(1.1));
button.up = () => (button.view.scale.set(1));
