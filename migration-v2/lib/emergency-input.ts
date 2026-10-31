import {stopText} from './safety-gate.ts';
export function bindEmergencyInput(ctx:any,stop:()=>void){
 const handler=(event:any)=>{if(event.name==='return'||event.name==='enter'){const text=ctx.renderer.currentFocusedEditor?.plainText||'';if(stopText(text)){event.preventDefault();event.stopPropagation();stop()}}};
 ctx.renderer.keyInput.prependListener('keypress',handler);
 return()=>ctx.renderer.keyInput.off('keypress',handler);
}
