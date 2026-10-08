import { describe, expect, it } from 'vitest';
import { OrthographicCamera, Vector3 } from 'three';
import { fitHomeCamera, homeFurnitureFits } from '../src/client/home-interior.ts';
import { defaultHomeInterior, HOME_ENTRY, HOME_ROOM, HOME_MAX_ITEMS, homePathAllowed, homePositionAllowed } from '../src/shared/home.ts';
import type { Vec3 } from '../src/shared/world.ts';

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
    const table = items.find(item => item.id === 'table')!, chair = items.find(item => item.id === 'chair')!;
    expect(homeFurnitureFits(items, HOME_ENTRY)).toBe(true);
    const move = (x: number, z: number) => items.map(item => item.id === 'table' ? { ...item, position: [x, 0, z] as [number, number, number] } : item);
    expect(homeFurnitureFits(move(table.position[0] - .25, table.position[2]), HOME_ENTRY)).toBe(true);
    expect(homeFurnitureFits(move(0, 1.2), HOME_ENTRY)).toBe(false);
    expect(homeFurnitureFits(move(chair.position[0], chair.position[2]), HOME_ENTRY)).toBe(false);
    expect(homeFurnitureFits(items, table.position)).toBe(false);
  });

  it('leaves connected walking space between the entrance, table group, reading corner and wall storage', () => {
    const room = defaultHomeInterior(), before = JSON.stringify(room);
    expect(room.items.length).toBeLessThanOrEqual(HOME_MAX_ITEMS);
    expect(new Set(room.items.map(item => item.id)).size).toBe(room.items.length);
    expect(homeFurnitureFits(room.items, HOME_ENTRY, room.room, false)).toBe(true);
    // Actual body-clear routes, not just separated item centres. The central
    // aisle reaches both sides and each furniture group without crossing one.
    const routes: Vec3[][] = [
      [HOME_ENTRY, [0, 0, 1.55], [-2.2, 0, 1.55]],
      [HOME_ENTRY, [0, 0, -2.25], [-2.6, 0, -2.25]],
      [HOME_ENTRY, [0, 0, .7], [2.5, 0, .7], [2.5, 0, -1.3]],
      [HOME_ENTRY, [0, 0, .7], [3.1, 0, .7], [3.1, 0, -2.7]],
    ];
    for (const route of routes) for (let i = 1; i < route.length; i++) {
      expect(homePathAllowed(route[i - 1], route[i], room.items, room.room, false)).toBe(true);
    }
    for (const item of room.items) expect(homePositionAllowed(item.position, room.items)).toBe(false);
    expect(JSON.stringify(room)).toBe(before);
    expect(defaultHomeInterior()).toEqual(room);
  });
});
