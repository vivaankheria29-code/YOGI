import {bestMove} from './chessgame.js';
self.onmessage=({data})=>{try{self.postMessage({id:data.id,move:bestMove(data.fen,data.level)});}catch{self.postMessage({id:data.id,error:'Chess engine failed.'});}};
