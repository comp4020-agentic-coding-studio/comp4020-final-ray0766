/** Finite concentric survey bands. Existing space slots never move. */
export const REGIONS=[
  {id:'harbour',name:'Harbour Belt',code:'01',description:'Public starport and nearby homes',maxSlot:8},
  {id:'reach',name:'Lantern Reach',code:'02',description:'A longer crossing between quiet worlds',maxSlot:24},
  {id:'frontier',name:'Outer Drift',code:'03',description:'Distant plots at the edge of the survey',maxSlot:255},
] as const;
export type RegionId=typeof REGIONS[number]['id'];
export const regionFor=(slot:number)=>REGIONS.find(r=>slot<=r.maxSlot)??REGIONS[2];
export const INITIAL_PLANETS=33;
export const ORBIT_DETAIL_BUDGET=8,ORBIT_VISIBLE_BUDGET=24;
