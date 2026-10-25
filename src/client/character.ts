import * as T from 'three';
import {defaultAppearance,appearanceKey,type Appearance} from '../shared/appearance.ts';
import {disposeGeometry} from './build-art.ts';
import {sampleCourier} from './character-sample.ts';
import {COURIER_LOOK} from './presentation-materials.ts';
import type {Character} from '../shared/world.ts';
export const PALETTES=COURIER_LOOK.coats;
/** One lightweight traveller rig for players and the small named task residents. */
export function courier(identity:Character|'mica'|'sol',initial?:Appearance){
 const named=identity==='mica'||identity==='sol',coat=named?(identity==='mica'?'clay':'sky'):identity;
 let options:Appearance={...(initial??defaultAppearance(coat)),model:'sample'};
 const make=()=>sampleCourier(options.coat,options);let body=make();const root=new T.Group();root.add(body.root);
 const publish=()=>{root.userData.characterVariant='sample';root.userData.appearance={...options};};publish();
 return{root,get head(){return body.head;},get parcel(){return body.parcel;},
  setAppearance(next:Appearance){next={...next,model:'sample'};if(named||appearanceKey(next)===appearanceKey(options))return false;const carrying=body.parcel.visible;disposeGeometry(body.root);options={...next};body=make();body.parcel.visible=carrying;root.add(body.root);publish();return true;},
  setColor(coat:Character){options={...options,coat};body.setColor(coat);publish();},greet(t:number){body.greet(t);},animate(t:number,speed:number,reduced:boolean,turn=0,grounded=true){body.animate(t,speed,reduced,turn,grounded);}
 };
}
