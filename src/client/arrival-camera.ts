import * as T from 'three';

/** Read the candidate image once on arrival. A clear centre ray alone can
 * still leave a neighbouring facade covering half the screen. */
export function arrivalViewScore(camera:T.PerspectiveCamera,head:T.Vector3,up:T.Vector3,meshes:readonly T.Mesh[],routePoints:readonly T.Vector3[]){
  camera.updateMatrixWorld(true);
  const ray=new T.Raycaster(),normalMatrix=new T.Matrix3(),normal=new T.Vector3();
  const headDistance=camera.position.distanceTo(head);
  let blocked=0,samples=0;
  for(const y of [-.65,-.35,-.05,.25,.55])for(const x of [-.9,-.6,-.3,0,.3,.6,.9]){
    ray.setFromCamera(new T.Vector2(x,y),camera);
    const hit=ray.intersectObjects([...meshes],false)[0];samples++;
    if(hit&&hit.distance<Math.min(5.5,headDistance*.85)&&hit.face){
      normal.copy(hit.face.normal).applyMatrix3(normalMatrix.getNormalMatrix(hit.object.matrixWorld)).normalize();
      if(Math.abs(normal.dot(up))<.78)blocked++;
    }
  }
  let visibleRoutes=0;
  for(const point of routePoints){
    const ndc=point.clone().project(camera);
    if(ndc.z>1||ndc.z< -1||Math.abs(ndc.x)>.88||ndc.y<-.75||ndc.y>.58)continue;
    const direction=point.clone().sub(camera.position),distance=direction.length();
    ray.set(camera.position,direction.normalize());ray.far=Math.max(0,distance-.12);
    if(!ray.intersectObjects([...meshes],false).length)visibleRoutes++;
  }
  const obstruction=blocked/samples,street=routePoints.length?visibleRoutes/routePoints.length:0;
  return {obstruction,street,score:Math.min(8,headDistance)*.3-obstruction*18+street*4};
}
