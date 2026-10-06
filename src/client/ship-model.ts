import * as T from 'three';
import { createShipModel } from '../assets/claude-geometry/ship/factory.ts';
import { encodeShipDesign } from '../assets/claude-geometry/ship/design.ts';
import type { ShipDesign } from '../assets/claude-geometry/ship/design.ts';
import { defaultShip } from '../shared/ships.ts';
import { worldMaterials } from './shared-assets.ts';
// Preserve each scene's transform while replacing only the owned model handle.
export function makeShip() {
  const root = new T.Group();
  let design = defaultShip().design, key = encodeShipDesign(design);
  let handle = createShipModel(design, worldMaterials(), 'medium');
  root.add(handle.object);
  root.userData.disposeOwned = () => { handle.dispose(); root.removeFromParent(); };
  const animate = (power: number, brake: boolean) => handle.setThrust(brake ? Math.min(power, .04) : power);
  return { root, animate, dispose: () => root.userData.disposeOwned(),
    get document() { return key; },
    setDesign(next: ShipDesign) {
      const nextKey = encodeShipDesign(next); if (key === nextKey) return;
      const replacement = createShipModel(next, worldMaterials(), 'medium');
      handle.dispose(); handle = replacement; design = next; key = nextKey; root.add(handle.object);
    },
  };
}
