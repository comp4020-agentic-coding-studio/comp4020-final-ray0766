import * as T from 'three';

const gradient = new T.DataTexture(new Uint8Array([105, 180, 232, 255]), 4, 1, T.RedFormat);
gradient.needsUpdate = true; gradient.magFilter = T.NearestFilter; gradient.minFilter = T.NearestFilter;
const materials = new Map<string, T.MeshToonMaterial>();
export const INK = '#3e514c';
export function material(color: string) {
  if (!materials.has(color)) materials.set(color, new T.MeshToonMaterial({ color, gradientMap: gradient }));
  return materials.get(color)!;
}
export function shape(parent: T.Object3D, geometry: T.BufferGeometry, color: string, position = [0, 0, 0], outline = false) {
  const m = new T.Mesh(geometry, material(color));
  m.position.fromArray(position); m.castShadow = true; m.receiveShadow = true; parent.add(m);
  if (outline) {
    const lines = new T.LineSegments(new T.EdgesGeometry(geometry, 35), new T.LineBasicMaterial({ color: INK, transparent: true, opacity: .48 }));
    m.add(lines);
  }
  return m;
}
export const box = (p:T.Object3D,s:number[],c:string,v:number[],edge=false) => shape(p,new T.BoxGeometry(...s as [number,number,number]),c,v,edge);
export const ball = (p:T.Object3D,r:number,c:string,v:number[],detail=0) => shape(p,new T.IcosahedronGeometry(r,detail),c,v);
export function beam(parent:T.Object3D, a:T.Vector3, b:T.Vector3, width:number, color:string) {
  const m=shape(parent,new T.CylinderGeometry(width,width,a.distanceTo(b),5),color);
  m.position.copy(a).lerp(b,.5);m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),b.clone().sub(a).normalize());return m;
}
export function sign(parent:T.Object3D,text:string,width:number,color='#324e50',background='#f1e2bd') {
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;
  const ctx=canvas.getContext('2d')!;ctx.fillStyle=background;ctx.fillRect(0,0,512,128);
  ctx.strokeStyle=color;ctx.lineWidth=5;ctx.strokeRect(9,9,494,110);ctx.fillStyle=color;
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 43px sans-serif';ctx.fillText(text,256,68,465);
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
  const m=new T.Mesh(new T.PlaneGeometry(width,width/4),new T.MeshBasicMaterial({map:texture,side:T.DoubleSide}));parent.add(m);return m;
}
export function roof(parent:T.Object3D,w:number,d:number,h:number,color:string,base:number) {
  const g=new T.BufferGeometry();const v=[-w/2,0,-d/2,w/2,0,-d/2,0,h,-d/2,-w/2,0,d/2,w/2,0,d/2,0,h,d/2];
  g.setAttribute('position',new T.Float32BufferAttribute(v,3));g.setIndex([0,2,1,3,4,5,0,3,5,0,5,2,2,5,4,2,4,1,0,1,4,0,4,3]);const flat=g.toNonIndexed();flat.computeVertexNormals();g.dispose();
  return shape(parent,flat,color,[0,base,0],true);
}
