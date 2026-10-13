import { afterEach, expect, it } from 'vitest';
import { openStore } from '../src/server/store.ts';
import { homeEntry } from '../src/shared/home.ts';

const stores: ReturnType<typeof openStore>[] = [];
afterEach(() => stores.splice(0).forEach(store => store.close()));
function fixture() {
  const store = openStore(':memory:', { homeSample: true }); stores.push(store);
  store.create('owner'); store.create('visitor');
  const owner = store.state('owner'); store.visit('visitor', owner.planetId);
  store.db.prepare('UPDATE players SET position=? WHERE id=?').run(JSON.stringify(owner.position), 'visitor');
  return { store, owner };
}
// Up to 5.6 s on the x86-64 CI runner across runs 38434626581-38454559718, against the default 5 s.
it('authorizes entry from the saved owner, refusing visitors before any mutation', () => {
  const { store, owner } = fixture(), visitor = store.state('visitor');
  const before = Number(store.db.prepare('SELECT total_changes() AS n').get()!.n);
  expect(() => store.enterHome('visitor', { planetId: owner.planetId, buildingId: owner.home!.buildingId, visitEpoch: visitor.location!.visitEpoch })).toThrow('Only the home owner can enter');
  expect(Number(store.db.prepare('SELECT total_changes() AS n').get()!.n)).toBe(before);
  expect(store.state('visitor').location).toEqual(visitor.location);
  expect(store.enterHome('owner', { planetId: owner.planetId, buildingId: owner.home!.buildingId, visitEpoch: owner.location!.visitEpoch }).player.location?.kind).toBe('interior');
},15_000);
// Up to 4.2 s on the x86-64 CI runner across runs 38434626581-38454559718, against the default 5 s.
it('preserves an old guest location and allows safe exit without granting re-entry', () => {
  const { store, owner } = fixture(), home = owner.home!, before = store.state('visitor');
  const saved = { kind: 'interior', planetId: owner.planetId, buildingId: home.buildingId, interiorId: home.interiorId, position: homeEntry(home.interior.room), yaw: Math.PI, sequence: 0, visitEpoch: before.location!.visitEpoch + 1 };
  store.db.prepare('UPDATE home_locations SET document=? WHERE player_id=?').run(JSON.stringify(saved), 'visitor');
  expect(store.state('visitor').location).toEqual(saved);
  expect(() => store.saveHome('visitor', { buildingId: home.buildingId, expectedVersion: home.interior.version, material: 'sage', items: [] })).toThrow('Only');
  const outside = store.exitHome('visitor', { buildingId: home.buildingId, visitEpoch: saved.visitEpoch }).player;
  expect(outside.location?.kind).toBe('exterior');
  expect(outside.position).toEqual(home.door.position);
  expect(() => store.enterHome('visitor', { planetId: owner.planetId, buildingId: home.buildingId, visitEpoch: outside.location!.visitEpoch })).toThrow('Only the home owner can enter');
  expect(store.state('owner').home!.interior).toEqual(home.interior);
},15_000);
