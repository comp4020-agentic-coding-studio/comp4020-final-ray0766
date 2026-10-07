import { describe, expect, it } from 'vitest';
import { OrthographicCamera, Vector3 } from 'three';
import { fitHomeCamera, homeFurnitureFits } from '../src/client/home-interior.ts';
import { defaultHomeInterior, HOME_ENTRY, HOME_ROOM } from '../src/shared/home.ts';

describe('home room presentation', () => {
  it.each([[1440, 900], [390, 844], [844, 390]])('keeps the whole room and unscaled head height inside a %i × %i view', (width, height) => {
    const camera = new OrthographicCamera(-1, 1, 1, -1, .05, 100);
    fitHomeCamera(camera, HOME_ROOM.width, HOME_ROOM.depth, HOME_ROOM.height, width / height, width < 700);
    for (const x of [-HOME_ROOM.width / 2, HOME_ROOM.width / 2]) for (const z of [-HOME_ROOM.depth / 2, HOME_ROOM.depth / 2]) for (const y of [0, HOME_ROOM.height]) {
      const point = new Vector3(x, y, z).project(camera);
      expect(Math.abs(point.x)).toBeLessThan(.95);
      expect(Math.abs(point.y)).toBeLessThan(.95);
      expect(Math.abs(point.z)).toBeLessThan(1);
    }
    // The optional overview fits every corner; the normal narrow-screen view
    // follows the player at 1.65x instead of shrinking the metre-sized avatar.
    if (width < 700 || height < 500) { camera.zoom = 1.65; camera.updateProjectionMatrix(); }
    const feet = new Vector3(...HOME_ENTRY).project(camera), head = new Vector3(HOME_ENTRY[0], 1.62, HOME_ENTRY[2]).project(camera);
    // Screen readability, not a device-independent NDC fraction: portrait
    // fitting leaves more vertical space but still needs a legible avatar.
    expect((head.y - feet.y) * height / 2).toBeGreaterThan(60);
  });

  it('allows moving a table into open space but refuses doorway, overlaps and a standing player', () => {
    const items = defaultHomeInterior().items;
    expect(homeFurnitureFits(items, HOME_ENTRY)).toBe(true);
    const move = (x: number, z: number) => items.map(item => item.id === 'table' ? { ...item, position: [x, 0, z] as [number, number, number] } : item);
    expect(homeFurnitureFits(move(-.9, -.85), HOME_ENTRY)).toBe(true);
    expect(homeFurnitureFits(move(0, 1.2), HOME_ENTRY)).toBe(false);
    expect(homeFurnitureFits(move(-.9, .35), HOME_ENTRY)).toBe(false);
    expect(homeFurnitureFits(items, [-.9, 0, -.45])).toBe(false);
  });
});
