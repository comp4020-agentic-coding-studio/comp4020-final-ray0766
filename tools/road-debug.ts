// Dev-only: terrain + planned street surfaces at a lat/lon, seen from above.
//   /tools/road-debug.html?lat=50&lon=1&h=6&grade=1&roads=1
import * as T from 'three';
import { createPresentationStage } from '../src/client/presentation-stage.ts';
import { terrainModel } from '../src/client/terrain-model.ts';
import { createTownRoadSurfaces } from '../src/client/town-road-surfaces.ts';
import { mainPlanetNetwork } from '../src/shared/planet-plan/main-planet.ts';
import { fieldOf } from '../src/shared/terrain.ts';
import { publicTown, PUBLIC_TOWN_ENVIRONMENT } from '../src/shared/public-town-layout.ts';
import { createPublicTownArt } from '../src/client/public-town-art.ts';
import { dirOf } from '../src/shared/planet-plan/sphere.ts';
const q = new URLSearchParams(location.search), R = 21.6;
const stage = createPresentationStage('terrain', document.getElementById('stage')!);
const town = publicTown(R), field = fieldOf(PUBLIC_TOWN_ENVIRONMENT, R);
const terrain = terrainModel(PUBLIC_TOWN_ENVIRONMENT, town.objects, town.blueprints, 'medium', true, q.get('grade') === '0' ? 21.6000001 : R, []);
stage.scene.add(terrain.object);
if (q.get('roads') !== '0') stage.scene.add(createTownRoadSurfaces({ network: mainPlanetNetwork(), field, library: stage.library }).object);
if (q.get('town') === '1') stage.scene.add(createPublicTownArt(town, R).root);
const dir = new T.Vector3(...dirOf(Number(q.get('lat') ?? 50), Number(q.get('lon') ?? 1))), h = Number(q.get('h') ?? 6);
const target = dir.clone().multiplyScalar(R + .1), eye = dir.clone().multiplyScalar(R + h).add(new T.Vector3(0.0001, 0, 0.0001));
stage.camera.up.copy(new T.Vector3(0, 1, 0).projectOnPlane(dir).normalize().negate());
stage.controls.target.copy(target); stage.camera.position.copy(eye.addScaledVector(new T.Vector3(0, 1, 0).projectOnPlane(dir).normalize(), -h * Number(q.get('tilt') ?? .6)));
stage.camera.near = .05; stage.camera.updateProjectionMatrix(); stage.controls.update();
stage.start();
(window as unknown as { galleryReady: boolean }).galleryReady = true;
// Diagnostics: terrain vertex radius against the natural field near the target.
{
  const ground = terrain.ground, pos = ground.geometry.getAttribute('position'), v = new T.Vector3();
  let near = 0, lowered = 0, worst = -1;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i); const d = v.clone().normalize();
    if (d.angleTo(dir) * R > 1) continue;
    near++; const natural = 10 + field.heightAt(d.toArray() as [number, number, number]), drop = natural - v.length();
    if (drop > .03) lowered++; worst = Math.max(worst, -drop);
  }
  document.title = JSON.stringify({ near, lowered, highestAboveNatural: worst, groundMatrix: ground.matrixWorld.elements.slice(12, 15), scale: ground.scale.toArray(), parentScale: terrain.object.scale.toArray() });
}
