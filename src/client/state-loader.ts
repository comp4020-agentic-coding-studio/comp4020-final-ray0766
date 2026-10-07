import type { PlayerState } from '../shared/world.ts';

/** Bootstrap and reconnect must share the request that establishes the cookie. */
export function createStateLoader(load:()=>Promise<PlayerState>){
  let pending:Promise<PlayerState>|null=null;
  return {
    get pending(){return pending!==null;},
    read(){
      if(!pending)pending=load().finally(()=>{pending=null;});
      return pending;
    },
  };
}
