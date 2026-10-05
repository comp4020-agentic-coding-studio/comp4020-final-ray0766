import * as T from 'three';
import { ball, box, roof, shape } from './art.ts';
import type { BuildKind } from '../shared/planets.ts';
export function builtObject(kind: BuildKind) {
  const g = new T.Group();
  if (kind === 'cottage') {
    box(g, [1.75,.15,1.5], '#b9b59a', [0,.075,0], true);
    box(g, [1.65,1.55,1.35], '#e6d4a6', [0,.9,0], true); roof(g,1.96,1.64,.65,'#bb795c',1.68);
    box(g,[.55,.93,.045],'#55786b',[.23,.59,.71],true); box(g,[.055,.055,.04],'#eac878',[.39,.62,.75]);
    for(const x of [-.51,.53]) { box(g,[.32,.35,.07],'#5b8992',[x,1.35,.71],true); box(g,[.03,.36,.08],'#eee0b8',[x,1.35,.75]); }
    box(g,[.3,.62,.3],'#e4d0a6',[-.48,2.14,-.2],true);
  } else if (kind === 'tree') {
    shape(g,new T.CylinderGeometry(.09,.14,1.2,6),'#877257',[0,.6,0]);
    for(const [x,y,z,r] of [[0,1.55,0,.64],[-.32,1.23,.06,.40],[.31,1.45,0,.44],[0,1.96,0,.34]]) ball(g,r,'#89a772',[x,y,z],1).scale.y=.8;
  } else if (kind === 'path') {
    const stone=shape(g,new T.CylinderGeometry(.46,.48,.065,7),'#d6c3a2',[0,.04,0],true);stone.scale.z=.84;
  } else if (kind === 'flowers') {
    for(let i=0;i<4;i++){const x=Math.sin(i*2)*.16,z=Math.cos(i*2)*.16;shape(g,new T.CylinderGeometry(.017,.018,.31,4),'#6a8e65',[x,.19,z]);ball(g,.09,i%2?'#e6b666':'#d89276',[x,.38,z],1);}
  } else if (kind === 'bench') {
    for(const x of [-.44,.44])box(g,[.07,.4,.48],'#586b61',[x,.2,0]);
    for(let i=0;i<3;i++)box(g,[1.13,.07,.14],'#b69a6d',[0,.43,(i-1)*.16],true);
    for(let i=0;i<2;i++)box(g,[1.13,.13,.07],'#b69a6d',[0,.68+i*.16,-.23],true);
  } else {
    shape(g,new T.CylinderGeometry(.042,.065,1.6,6),'#566d61',[0,.8,0]);
    box(g,[.28,.32,.28],'#eed7a3',[0,1.79,0],true);box(g,[.36,.05,.36],'#526457',[0,1.60,0]);
    shape(g,new T.ConeGeometry(.28,.21,4),'#526457',[0,2.06,0]).rotation.y=Math.PI/4;
  }
  return g;
}
export function disposeGeometry(root: T.Object3D) {
  root.traverse(o=>{if(o instanceof T.Mesh || o instanceof T.Line){o.geometry.dispose(); const mats=Array.isArray(o.material)?o.material:[o.material];for(const m of mats){if(m.userData.ownedResource){m.dispose();}else if(m instanceof T.MeshStandardMaterial && m.map){m.map.dispose();m.dispose();}else if(m instanceof T.MeshBasicMaterial){m.map?.dispose();m.dispose();}else if(m instanceof T.LineBasicMaterial || (m instanceof T.MeshToonMaterial && (m.vertexColors || !m.gradientMap)))m.dispose();}}});
  root.removeFromParent();
}
