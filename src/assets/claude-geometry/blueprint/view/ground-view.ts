import * as T from 'three';
import { anchorQuaternion, localToPlanet, SPAWN_DIR } from '../../core/anchor.ts';
import type { SurfaceAnchor } from '../../core/anchor.ts';
import { disposeObject3D } from '../../core/dispose.ts';
import { fitGround } from '../../core/ground.ts';
import type { GroundFit, HeightField } from '../../core/ground.ts';
import type { Vec3 } from '../../core/vec.ts';
import type { LodTier } from '../../style/lod.ts';
import type { StyleLibrary } from '../../style/materials.ts';
import { buildPlanet, TerrainKit } from '../../terrain/index.ts';
import type { Foundation, PlanetEnvironment, PlanetHandle, TerrainField } from '../../terrain/index.ts';
import { padCovers, padFootprint } from '../../terrain/pads.ts';
import type { GroundSource } from '../ground.ts';
import { buildLandingPad, createPlanet, LANDING_PAD_RADIUS } from './planet-view.ts';
import type { PlanetSurface } from './planet-view.ts';

// The drawn ground of the planet view. The legacy ground is the module's own
// displaced icosphere (createPlanet); a terrain ground is the terrain
// module's buildPlanet, graded under every seated floor (CONTRACTS §5) and
// rebuilt whenever a structure is placed, moved, turned or removed. Each
// rebuild disposes the previous planet; the TerrainKit (detail textures,
// plant geometry and materials) is shared by every rebuild and freed when the
// view goes back to legacy ground or is disposed.

/** A seated floor to grade under: a placed structure (or the landing pad). */
export interface GroundSeat {
  anchor: SurfaceAnchor;
  fit: GroundFit;
  /** Bounding radius of the footprint, metres. */
  radius: number;
  /** True when a local (x, z) point is under the floor. */
  covers(x: number, z: number): boolean;
}

const PAD_SHAPE = { kind: 'circle', radius: LANDING_PAD_RADIUS } as const;

export class PlanetGround {
  readonly root = new T.Group();
  private readonly lib: StyleLibrary;
  private readonly lod: LodTier;
  private sun: Vec3;
  private current: { source: GroundSource; field: HeightField; surface: PlanetSurface; planet: PlanetHandle | null; pad: T.Group | null; padSeat: GroundSeat | null };
  private kit: TerrainKit | null = null;
  /** Planets built and disposed since the page opened, for the memory checks. */
  private counts = { built: 0, disposed: 0 };
  private lastBuildMs = 0;

  constructor(lib: StyleLibrary, lod: LodTier, source: GroundSource, field: HeightField, sun: Vec3) {
    this.lib = lib; this.lod = lod; this.sun = sun;
    this.root.name = 'ground';
    this.current = this.make(source, field, []);
  }

  get source(): GroundSource { return this.current.source; }
  get field(): HeightField { return this.current.field; }
  /** The terrain planet on screen, or null on legacy ground. */
  get planet(): PlanetHandle | null { return this.current.planet; }
  /** The landing pad's seat on terrain ground (null on legacy ground, where the pad sits as before). */
  get padSeat(): GroundSeat | null { return this.current.padSeat; }

  /** Replace the ground (the caller has already checked the placed structures against `field`). */
  set(source: GroundSource, field: HeightField, seats: readonly GroundSeat[]) {
    const old = this.current;
    this.current = this.make(source, field, seats);
    this.release(old);
  }

  /** Rebuild a terrain planet so its mesh is graded under `seats`; legacy ground has no mesh grading. */
  regrade(seats: readonly GroundSeat[]) {
    const c = this.current;
    if (c.source.kind !== 'terrain' || !c.planet) return;
    const planet = this.buildTerrain(c.source.env, c.field as TerrainField, seats, c.padSeat!);
    c.planet.dispose();
    this.counts.disposed++;
    c.planet = planet;
    c.surface = this.terrainSurface(c.field, planet);
    this.root.add(planet.object);
  }

  pick(ray: T.Raycaster): Vec3 | null { return this.current.surface.pick(ray); }
  tick(seconds: number) { this.current.planet?.tick(seconds); }
  setSunDirection(dir: Vec3) { this.sun = dir; this.current.planet?.setSunDirection(dir); }

  /** Ground mesh vertices within `radius` metres of arc of `dir`, in planet space (read-only, for tests). */
  groundVertices(dir: Vec3, radius: number): Vec3[] {
    const mesh = this.current.planet?.ground ?? (this.current.surface.object.getObjectByName('ground') as T.Mesh | undefined);
    if (!mesh) return [];
    const pos = mesh.geometry.getAttribute('position');
    const cos = Math.cos(radius / 10), out: Vec3[] = [];
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), r = Math.hypot(x, y, z);
      if ((x * dir[0] + y * dir[1] + z * dir[2]) / r >= cos) out.push([x, y, z]);
    }
    return out;
  }

  stats() {
    const s = this.current.planet?.stats;
    return { kind: this.current.source.kind, built: this.counts.built, disposed: this.counts.disposed, lastBuildMs: this.lastBuildMs, triangles: s?.triangles ?? null, drawCalls: s?.drawCalls ?? null, kit: this.kit !== null };
  }

  dispose() {
    this.release(this.current);
    this.kit?.dispose();
    this.kit = null;
    this.root.removeFromParent();
  }

  // ------------------------------------------------------------- internals

  private make(source: GroundSource, field: HeightField, seats: readonly GroundSeat[]) {
    if (source.kind === 'legacy') {
      const surface = createPlanet(field, this.lib, this.lod);
      this.root.add(surface.object);
      // Legacy ground needs no terrain kit; free it rather than keep its textures alive.
      this.kit?.dispose();
      this.kit = null;
      return { source, field, surface, planet: null, pad: null, padSeat: null };
    }
    const tf = field as TerrainField;
    // The landing pad is seated like any floor: fitted on a dense footprint, its disc reaching the deepest gap.
    const padAnchor = { dir: SPAWN_DIR, yaw: 0 };
    const padFit = fitGround(tf, padAnchor, padFootprint(PAD_SHAPE));
    const padSeat: GroundSeat = { anchor: padAnchor, fit: padFit, radius: PAD_SHAPE.radius, covers: (x, z) => padCovers(PAD_SHAPE, x, z) };
    const pad = buildLandingPad(this.lib, this.lod, padFit.foundationDepth + 0.05);
    pad.quaternion.set(...anchorQuaternion(padAnchor));
    pad.position.set(...localToPlanet(padAnchor, padFit.baseRadius, [0, 0, 0]));
    const planet = this.buildTerrain(source.env, tf, seats, padSeat);
    this.root.add(planet.object, pad);
    return { source, field, surface: this.terrainSurface(field, planet), planet, pad, padSeat };
  }

  private buildTerrain(env: PlanetEnvironment, field: TerrainField, seats: readonly GroundSeat[], padSeat: GroundSeat): PlanetHandle {
    this.kit ??= new TerrainKit(this.lod, { look: this.lib.look });
    const all = [padSeat, ...seats];
    const foundations: Foundation[] = all.map(s => ({ anchor: s.anchor, baseRadius: s.fit.baseRadius, radius: s.radius, covers: s.covers }));
    const begin = performance.now();
    const planet = buildPlanet(env, this.lib, this.lod, { kit: this.kit, field, foundations, clearings: all.map(s => ({ dir: s.anchor.dir, radius: s.radius + 0.15 })) });
    this.lastBuildMs = performance.now() - begin;
    planet.setSunDirection(this.sun);
    this.counts.built++;
    return planet;
  }

  /** Picking on the drawn (graded) ground mesh; the pad and plants are not targets. */
  private terrainSurface(field: HeightField, planet: PlanetHandle): PlanetSurface {
    return {
      field,
      object: planet.object,
      pick(ray) {
        const hit = ray.intersectObject(planet.ground, false)[0];
        if (!hit) return null;
        const p = hit.point.clone().normalize();
        return [p.x, p.y, p.z];
      },
      dispose() { planet.dispose(); },
    };
  }

  private release(c: PlanetGround['current']) {
    if (c.planet) {
      c.planet.dispose();
      this.counts.disposed++;
      if (c.pad) disposeObject3D(c.pad);
    } else c.surface.dispose();
  }
}
