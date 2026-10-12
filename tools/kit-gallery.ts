// Dev-only preview of the R12 village kit parts and public compositions in the
// village look (Stage lines, cel light). Not part of the production build.
//   /tools/kit-gallery.html?view=parts
//   /tools/kit-gallery.html?view=compositions&only=<id>&dir=1,0.6,1.2
import * as T from 'three';
import { createPresentationStage } from '../src/client/presentation-stage.ts';
import { buildPart, PART_IDS } from '../src/shared/blueprint-parts.ts';
import { buildBlueprintModel } from '../src/shared/blueprint-model3d.ts';
import { buildStructureFinish } from '../src/client/structure-finish.ts';
import { pivotOf } from '../src/shared/blueprint-model.ts';
import type { PartPlacement } from '../src/shared/blueprint-model.ts';
import { VILLAGE_KIT_IDS } from '../src/shared/village-kit/parts.ts';

const params = new URLSearchParams(location.search), view = params.get('view') ?? 'parts';
const stage = createPresentationStage('workshop', document.getElementById('stage')!);
const ground = new T.Mesh(new T.PlaneGeometry(200, 200).rotateX(-Math.PI / 2), new T.MeshStandardMaterial({ color: '#7fb98f', roughness: 1 }));
ground.position.y = -.17; ground.receiveShadow = true; stage.scene.add(ground);
const dir = (params.get('dir') ?? '0.9,0.62,1.25').split(',').map(Number);
const box = new T.Box3();
const label = document.getElementById('label')!;
async function main() {
  if (view === 'parts') {
    const ids = params.get('all') ? PART_IDS : VILLAGE_KIT_IDS;
    ids.forEach((id, i) => {
      const built = buildPart(id, stage.library);
      built.group.position.set((i % 5) * 2.4, 0, Math.floor(i / 5) * 2.4);
      stage.scene.add(built.group); box.expandByObject(built.group);
    });
    label.textContent = ids.join(' · ');
  } else {
    const { PUBLIC_COMPOSITIONS } = await import('../src/shared/planet-plan/compositions.ts');
    const only = params.get('only');
    const list = PUBLIC_COMPOSITIONS.filter(c => !only || only.split(',').includes(c.id));
    let x = 0;
    for (const c of list) {
      const parts = c.blueprint.parts as PartPlacement[], pivot = pivotOf(parts);
      const model = buildBlueprintModel(parts, stage.library, 'medium', { foundationDepth: 0, sockets: false });
      const finish = buildStructureFinish(parts, stage.library);
      model.object.add(finish.object);
      const width = Math.max(...parts.map(p => p.x)) - Math.min(...parts.map(p => p.x)) + 1;
      model.object.position.set(x + width / 2 + .5 - pivot.x + Math.min(...parts.map(p => p.x)) - (Math.max(...parts.map(p => p.x)) + Math.min(...parts.map(p => p.x)) + 1) / 2 + pivot.x - .5, 0, 0);
      model.object.position.x = x + width / 2;
      stage.scene.add(model.object); box.expandByObject(model.object);
      x += width + 2;
    }
    label.textContent = list.map(c => c.id).join(' · ');
  }
  stage.frameBox(box, { direction: new T.Vector3(dir[0], dir[1], dir[2]), margin: 1.05 });
  stage.start();
  (window as unknown as { galleryReady: boolean }).galleryReady = true;
}
void main();
