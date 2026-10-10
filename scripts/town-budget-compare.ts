import { createServer } from 'vite';
import type { ViteDevServer } from 'vite';
import { chromium } from '@playwright/test';
import type { Browser } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { cpus, totalmem, platform, release } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import type * as Three from 'three';
import type { TownRenderProgress } from '../src/client/town-renderer.ts';

// Example: node scripts/town-budget-compare.ts budget-v9-candidate-1
// Creates its own source-only server/Chrome. Never uses the application, a save,
// an API, or a WebGL renderer. It is geometry/CPU evidence, not frame-rate proof.
const root = fileURLToPath(new URL('../', import.meta.url));
const phase = process.argv[2] ?? 'budget-v9';
if (!/^budget-v9(?:-[a-z0-9]+)*$/.test(phase)) throw Error('Use a new budget-v9 evidence name.');
const output = join(root, 'docs/evidence/village-world', phase, 'town-render-budget.json');
if (existsSync(output)) throw Error('Evidence already exists; choose a new budget-v9 name.');
const baselinePath = join(root, 'docs/evidence/village-world/budget-release/town-render-budget.json');
const baselineBytes = readFileSync(baselinePath);
const baseline = JSON.parse(baselineBytes.toString()) as Record<string, unknown>;
const port = 8140, origin = `http://127.0.0.1:${port}`, cache = '.data/town-budget-compare-cache';
const sourcePaths = ['src/shared/public-town-data.ts', 'src/shared/public-town-layout.ts',
  'src/shared/town-street-houses.ts', 'src/shared/town-door-houses.ts', 'src/shared/town-place-layout.ts',
  'src/shared/town-place-blueprints.ts', 'src/shared/town-critical-supports.ts',
  'src/shared/town-worksite-blueprints.ts', 'src/shared/town-local-streets.ts',
  'src/shared/town-neighbourhood-streets.ts', 'src/shared/town-stone-lanes.ts',
  'src/client/public-town-art.ts', 'src/client/town-renderer.ts',
  'src/client/structure-finish.ts', 'src/shared/terrain-prewarm.ts', 'src/shared/ground-fit-cache.ts',
  'src/shared/blueprint-ground-footprint.ts', 'src/client/terrain-model.ts',
  'src/shared/physics/world.ts', 'src/shared/terrain-grading.ts'];
// Record the integration revision alongside the measured town, without importing
// app/main or constructing residents. Their resources and per-frame work are
// outside this geometry-only comparison and require whole-app browser evidence.
const fingerprintOnlyPaths = ['src/client/main.ts', 'src/client/town-residents.ts',
  'src/shared/town-residents.ts', 'src/shared/town-resident-motion.ts'];
const hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const fingerprints = () => Object.fromEntries([...sourcePaths, ...fingerprintOnlyPaths].map(path => [path,
  existsSync(join(root, path)) ? hash(readFileSync(join(root, path))) : null]));
const before = fingerprints();
const transforms: { source: string; sourceSha256: string; profiledSha256: string; meaning: string }[] = [];
const requests: { path: string; method: string; allowed: boolean }[] = [], blocked: string[] = [], errors: string[] = [];
const replaceOnce = (code: string, from: string, to: string) => {
  if (code.split(from).length !== 2) throw Error(`Profiling anchor is not unique: ${from}`);
  return code.replace(from, to);
};
interface Profile {
  chunkBuilds: { ms: number; lod: string; objects: number; prepared: number; meshes: number; bytes: number }[];
  globalMerges: { ms: number; meshes: number; bytes: number }[];
}
let browser: Browser | undefined, server: ViteDevServer | undefined;
try {
  server = await createServer({ root, configFile: false, cacheDir: cache,
    server: { host: '127.0.0.1', port, strictPort: true, open: false, proxy: {}, hmr: false },
    optimizeDeps: { noDiscovery: true, include: ['three'] },
    plugins: [{ name: 'read-only-town-budget-profile', enforce: 'pre', transform(source, id) {
      if (!id.endsWith('/src/client/town-renderer.ts')) return;
      let code = replaceOnce(source, 'function buildGlobalLow(): Batch {',
        'function buildGlobalLow(): Batch { const __budgetStarted=performance.now();');
      code = replaceOnce(code, 'finally { for (const geometry of temporary) geometry.dispose(); }',
        'finally { for (const geometry of temporary) geometry.dispose(); globalThis.__townBudget.globalMerges.push({ms:performance.now()-__budgetStarted,meshes:batch.meshes.length,bytes:batch.bytes}); }');
      code = replaceOnce(code, "function build(objects: readonly PlacedObject[], lod: 'low' | 'medium', prepared: readonly TownRenderModel[] = []): Batch {",
        "function build(objects: readonly PlacedObject[], lod: 'low' | 'medium', prepared: readonly TownRenderModel[] = []): Batch { const __budgetStarted=performance.now();");
      code = replaceOnce(code, 'finally { for (const geometry of scratch) geometry.dispose(); }',
        'finally { for (const geometry of scratch) geometry.dispose(); globalThis.__townBudget.chunkBuilds.push({ms:performance.now()-__budgetStarted,lod,objects:objects.length,prepared:prepared.length,meshes:batch.meshes.length,bytes:batch.bytes}); }');
      transforms.push({ source: id.slice(root.length), sourceSha256: hash(source), profiledSha256: hash(code),
        meaning: 'Only in-memory timestamps around existing chunk/finalize and global merge including cleanup. No product source mutation.' });
      return { code, map: null };
    }, configureServer(vite) {
      vite.middlewares.use((request, response, next) => {
        if (request.url?.startsWith('/api') || request.url?.startsWith('/healthz') || request.url?.startsWith('/src/client/main')) {
          response.statusCode = 403; response.end('Application entry and APIs blocked'); return;
        }
        if (request.url?.startsWith('/__town_geometry_bench')) {
          response.setHeader('Content-Type', 'text/html');
          response.end('<!doctype html><title>Isolated town geometry comparison</title>'); return;
        }
        next();
      });
    } }],
  });
  await server.listen();
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    const allowed = url.origin === origin && route.request().method() === 'GET' &&
      !url.pathname.startsWith('/api') && !url.pathname.startsWith('/healthz') && !url.pathname.startsWith('/src/client/main') &&
      ['/__town_geometry_bench', '/src/', '/node_modules/', `/${cache}/`, '/@id/', '/@fs/', '/@vite/'].some(prefix => url.pathname.startsWith(prefix));
    requests.push({ path: url.pathname, method: route.request().method(), allowed });
    if (!allowed) { blocked.push(url.pathname); return route.abort(); }
    return route.continue();
  });
  await page.goto(`${origin}/__town_geometry_bench`);
  const result = await page.evaluate(async () => {
    const scope = globalThis as typeof globalThis & { __townBudget: Profile };
    scope.__townBudget = { chunkBuilds: [], globalMerges: [] };
    const sourceImport = (path: string) => import(path);
    const { publicTown, PUBLIC_TOWN_LIMITS, PUBLIC_TOWN_VERSION } = await sourceImport('/src/shared/public-town-layout.ts') as typeof import('../src/shared/public-town-layout.ts');
    const { createPublicTownArtAsync } = await sourceImport('/src/client/public-town-art.ts') as typeof import('../src/client/public-town-art.ts');
    const { Vector3 } = await sourceImport('/node_modules/three/build/three.module.js') as typeof import('three');
    const town = publicTown(), progress: (TownRenderProgress & { elapsedMs: number })[] = [];
    const groundProgress: { done: number; total: number; elapsedMs: number }[] = [], frameIntervals: number[] = [];
    const summarize = (values: number[]) => {
      const sorted = [...values].sort((a, b) => a - b), percentile = (p: number) => sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)] ?? 0;
      return { count: sorted.length, p50: percentile(.5), p95: percentile(.95), p99: percentile(.99), max: sorted.at(-1) ?? 0 };
    };
    let lastYield = performance.now();
    const yieldFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => {
      const now = performance.now(); frameIntervals.push(now - lastYield); lastYield = now; resolve();
    }));
    const start = performance.now();
    const render = await createPublicTownArtAsync(town, town.radius, {}, { budgetMs: 6, yieldFrame,
      onProgress: p => progress.push({ ...p, elapsedMs: performance.now() - start }),
      onGroundProgress: (done, total) => groundProgress.push({ done, total, elapsedMs: performance.now() - start }) });
    const initial = render.stats(), initWallMs = performance.now() - start;
    type MaterialRow = { uuid: string; name: string; type: string; meshes: number; triangles: number;
      owned: boolean; shared: boolean; emissive: string | null; emissiveIntensity: number | null };
    const inventory = (visibleOnly: boolean) => {
      const rows = new Map<string, MaterialRow>();
      const visit = (node: Three.Object3D) => {
        // Vite's optimized `three` and this explicit module URL can provide
        // separate constructors. Public Three flags identify the real meshes
        // and material capabilities without silently dropping that inventory.
        if (!(node as Three.Mesh).isMesh) return;
        const mesh = node as Three.Mesh;
        if (Array.isArray(mesh.material)) throw Error('Expected one material per prepared town batch.');
        const material = mesh.material, standard = material as Three.MeshStandardMaterial;
        const row = rows.get(material.uuid) ?? { uuid: material.uuid, name: material.name, type: material.type,
          meshes: 0, triangles: 0, owned: !!material.userData.ownedResource, shared: !!material.userData.sharedResource,
          emissive: standard.isMeshStandardMaterial ? standard.emissive.getHexString() : null,
          emissiveIntensity: standard.isMeshStandardMaterial ? standard.emissiveIntensity : null };
        row.meshes++; row.triangles += (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3;
        rows.set(material.uuid, row);
      };
      if (visibleOnly) render.root.traverseVisible(visit); else render.root.traverse(visit);
      const materials = [...rows.values()].sort((a, b) => b.meshes - a.meshes || a.name.localeCompare(b.name));
      return { uniqueUuids: materials.length, blueprintLampUuids: materials.filter(row => row.name === 'blueprint:lamp').length,
        emissiveUuids: materials.filter(row => row.emissive && row.emissive !== '000000' && (row.emissiveIntensity ?? 0) > 0).length,
        meshes: materials.reduce((sum, row) => sum + row.meshes, 0), materials };
    };
    const materialSnapshot = () => ({ visible: inventory(true), retained: inventory(false) });
    const initialMaterials = materialSnapshot();
    const timedUpdate = (eye: Three.Vector3, feet?: Three.Vector3, view?: { lowOnly?: boolean; globalLow?: boolean }) => {
      const start = performance.now(), stats = render.update(eye, feet, view);
      return { stats, wallMs: performance.now() - start };
    };
    const samples: { buildMs: number; updateMs: number }[] = [], rows: (ReturnType<typeof render.stats> & { district: string; warmupUpdates: number })[] = [];
    let peakStreetBytes = initial.residentGeometryBytes, peakCachedMediumChunks = 0, peakStagedMediumObjects = 0;
    const streetUpdate = (eye: Three.Vector3, feet: Three.Vector3) => {
      const sample = timedUpdate(eye, feet);
      peakStreetBytes = Math.max(peakStreetBytes, sample.stats.residentGeometryBytes);
      peakCachedMediumChunks = Math.max(peakCachedMediumChunks, sample.stats.cachedMediumChunks);
      peakStagedMediumObjects = Math.max(peakStagedMediumObjects, sample.stats.stagedMediumObjects);
      samples.push({ buildMs: sample.stats.lastBuildMs, updateMs: sample.wallMs }); return sample;
    };
    const settle = (eye: Three.Vector3, feet: Three.Vector3) => {
      let sample = streetUpdate(eye, feet), updates = 1;
      while (sample.stats.pendingMediumChunks && updates < 1200) { sample = streetUpdate(eye, feet); updates++; }
      if (sample.stats.pendingMediumChunks) throw Error('Medium detail did not finish within 1200 updates');
      return { sample, updates };
    };
    let disposed = false;
    try {
      for (const district of town.renderDistricts) {
        const feet = new Vector3(...district.center).multiplyScalar(town.radius + 1.6), eye = feet.clone().setLength(town.radius + 4);
        const { sample, updates } = settle(eye, feet);
        rows.push({ district: district.id, warmupUpdates: updates, ...sample.stats });
      }
      const feet = new Vector3(...town.renderDistricts[0].center).multiplyScalar(town.radius + 1.6), eye = feet.clone().setLength(town.radius + 4);
      const baseline = settle(eye, feet).sample.stats, streetMaterials = materialSnapshot();
      const cycles: { index: number; overview: ReturnType<typeof timedUpdate>; overviewReuse: ReturnType<typeof timedUpdate>;
        orbit: ReturnType<typeof timedUpdate>; returned: ReturnType<typeof streetUpdate> }[] = [];
      const overviewMaterials: ReturnType<typeof materialSnapshot>[] = [];
      for (let index = 0; index < 8; index++) {
        const overview = timedUpdate(eye.clone().setLength(80), feet, { globalLow: true });
        if (!index) overviewMaterials.push(materialSnapshot());
        const overviewReuse = timedUpdate(eye.clone().setLength(80), feet, { globalLow: true });
        const orbit = timedUpdate(eye.clone().setLength(80), undefined, { globalLow: true });
        const returned = streetUpdate(eye, feet);
        cycles.push({ index, overview, overviewReuse, orbit, returned });
      }
      const stableReturned = cycles.every(x => x.returned.stats.residentGeometryBytes === baseline.residentGeometryBytes &&
        x.returned.stats.cachedMediumChunks === baseline.cachedMediumChunks && !x.returned.stats.globalLowBatch);
      const stableOverview = cycles.every(x => x.overview.stats.residentGeometryBytes === cycles[0].overview.stats.residentGeometryBytes);
      const retainedBeforeDispose = render.stats(); render.dispose(); disposed = true;
      const afterDispose = render.stats(), profile = scope.__townBudget;
      const partCounts: Record<string, number> = {}, blueprintInstances: Record<string, number> = {};
      // Catalogue IDs say light.wall/service.light, never "lamp". Door,
      // roof-deck and pad glows are implicit fittings, counted separately.
      const explicitLampParts = new Set(['light.wall', 'service.light']);
      let structuresWithLamps = 0;
      for (const object of town.objects) if (object.kind === 'structure') {
        const parts = town.blueprints[object.blueprintHash!]!;
        blueprintInstances[object.blueprintHash!] = (blueprintInstances[object.blueprintHash!] ?? 0) + 1;
        if (parts.some(part => explicitLampParts.has(part.part))) structuresWithLamps++;
        for (const part of parts) partCounts[part.part] = (partCounts[part.part] ?? 0) + 1;
      }
      const structures = town.objects.filter(x => x.kind === 'structure').length;
      return {
        ledger: { version: town.version, declaredVersion: PUBLIC_TOWN_VERSION, radius: town.radius, objects: town.objects.length,
          structures, paths: town.objects.filter(x => x.kind === 'path').length, buildings: town.buildings.length,
          roads: town.roadObjects.length, blueprints: Object.keys(town.blueprints).length,
          parts: Object.values(partCounts).reduce((a, b) => a + b, 0), districts: town.renderDistricts.length,
          limits: PUBLIC_TOWN_LIMITS, withinLimits: town.objects.length <= PUBLIC_TOWN_LIMITS.objects &&
            structures <= PUBLIC_TOWN_LIMITS.structures && town.renderDistricts.length <= PUBLIC_TOWN_LIMITS.districts },
        composition: { partCounts, blueprintInstances, blueprintContent: JSON.stringify(town.blueprints),
          structuresWithLamps, authoredLampParts: Object.entries(partCounts).filter(([part]) => explicitLampParts.has(part)).reduce((sum, [, count]) => sum + count, 0),
          lampCountMeaning: 'Only explicit light.wall/service.light parts. Built-in door, roof.deck and pad.quarter glows are included in actual material/geometry inventories, not these explicit-part counts.',
          standaloneLamps: town.objects.filter(x => x.kind === 'lamp').length },
        preparation: { mode: 'Actual async factory, 6 ms inter-object target, rAF yields, exact support fits. An individual model/finalize/merge may exceed that target.',
          initWallMs, firstModel: progress.find(p => p.readyObjects === 1), initialFitMs: initial.initialFitMs,
          initialBuildMs: initial.initialBuildMs, yields: frameIntervals.length, yieldIntervalMs: summarize(frameIntervals),
          lowStepMs: summarize(progress.slice(1).map(p => p.lastBuildMs)), slowestLowSteps: [...progress].sort((a, b) => b.lastBuildMs - a.lastBuildMs).slice(0, 10),
          groundLast: groundProgress.at(-1), progressLast: progress.at(-1) },
        initial, firstStreet: rows[0], streetRows: rows,
        streetMax: { activeTriangles: Math.max(...rows.map(x => x.activeTriangles)), activeDrawCalls: Math.max(...rows.map(x => x.activeDrawCalls)),
          visibleObjects: Math.max(...rows.map(x => x.visibleObjects)), peakResidentGeometryBytes: peakStreetBytes, peakCachedMediumChunks, peakStagedMediumObjects },
        updateTiming: summarize(samples.map(x => x.updateMs)), mediumBuildTiming: summarize(samples.map(x => x.buildMs)),
        chunkFinalize: { meaning: 'Synchronous prepared-model merge/finalize and cleanup; prepared counts must equal objects.',
          allPrepared: profile.chunkBuilds.every(x => x.prepared === x.objects),
          low: summarize(profile.chunkBuilds.filter(x => x.lod === 'low').map(x => x.ms)), medium: summarize(profile.chunkBuilds.filter(x => x.lod === 'medium').map(x => x.ms)),
          slowest: [...profile.chunkBuilds].sort((a, b) => b.ms - a.ms).slice(0, 10) },
        globalMerge: { summary: summarize(profile.globalMerges.map(x => x.ms)), measurements: profile.globalMerges },
        materialDistribution: { initial: initialMaterials, street: streetMaterials, overview: overviewMaterials[0],
          countsMatchVisibleBatches: initialMaterials.visible.meshes === initial.activeDrawCalls &&
            streetMaterials.visible.meshes === baseline.activeDrawCalls &&
            overviewMaterials[0].visible.meshes === cycles[0].overview.stats.activeDrawCalls,
          meaning: 'Actual UUIDs in this run only; UUIDs are random across runs. Counts distinguish mesh batches from unique materials. Name blueprint:lamp is the per-blueprint glow source; other emissives are reported separately.' },
        viewCycles: cycles, resourceChecks: { stableReturned, stableOverview, baseline, retainedBeforeDispose, afterDispose,
          disposedRootChildren: render.root.children.length, emptyAfterDispose: afterDispose.residentGeometryBytes === 0 && afterDispose.residentTriangles === 0 && render.root.children.length === 0 },
        userAgent: navigator.userAgent, localStorageKeys: Object.keys(localStorage), cookieFree: !document.cookie,
      };
    } finally { if (!disposed) render.dispose(); }
  });
  const after = fingerprints(), sourcesUnchanged = JSON.stringify(before) === JSON.stringify(after);
  const readNumber = (source: unknown, path: string): number | null => {
    let value = source;
    for (const key of path.split('.')) value = value !== null && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined;
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  };
  const comparisons = ['ledger.objects', 'ledger.structures', 'ledger.parts', 'initial.activeTriangles', 'initial.activeDrawCalls', 'initial.residentGeometryBytes',
    'preparation.initWallMs', 'preparation.lowStepMs.max', 'streetMax.activeTriangles', 'streetMax.activeDrawCalls', 'streetMax.peakResidentGeometryBytes',
    'viewCycles.0.overview.stats.activeDrawCalls', 'viewCycles.0.overview.stats.residentGeometryBytes', 'updateTiming.p95', 'updateTiming.max', 'globalMerge.summary.max']
    .map(metric => {
      const before = readNumber(baseline, metric), after = readNumber(result, metric);
      return { metric, before, after, difference: before === null || after === null ? null : after - before,
        ratio: before === null || !before || after === null ? null : after / before };
    });
  const { blueprintContent, ...composition } = result.composition;
  const report = {
    createdAt: new Date().toISOString(), browser: browser.version(),
    host: { platform: platform(), release: release(), cpu: cpus()[0]?.model, logicalCPUs: cpus().length, physicalMemoryBytes: totalmem() },
    fingerprints: before, sourcesUnchanged, profilingTransforms: transforms,
    measuredScope: { subject: 'createPublicTownArtAsync geometry, materials and preparation/update CPU work',
      fingerprintOnlyPaths, residentsIncluded: false,
      exclusions: ['NPC geometry, animation, movement and interaction', 'Whole-app rendering, shadows, post-processing and frame rate', 'GPU/driver allocations and physical-phone performance'],
      streetSampling: 'The same twelve render-district centres as the v8 baseline. streetMax is the peak of these samples, not a proven maximum over every street or camera position.' },
    requests: { total: requests.length, blocked, apiRequests: requests.filter(x => x.path.startsWith('/api')), appEntryRequests: requests.filter(x => x.path.startsWith('/src/client/main')) },
    errors, ...result, composition: { ...composition, blueprintContentSha256: hash(blueprintContent) },
    comparison: { baseline: 'docs/evidence/village-world/budget-release/town-render-budget.json', baselineSha256: hash(baselineBytes),
      baselineBrowser: baseline.browser, baselineHost: baseline.host, metrics: comparisons,
      meaning: 'Geometry/batch/retained-buffer counts are comparable. CPU timings are separate runs, with no load/thermal control; ratios do not establish speedup or physical-phone performance. Material UUID inventory was not recorded in the v8 baseline.' },
    meaning: 'Installed Google Chrome with DOM canvas for the ordinary Path material. No app/main, identity, database/API request, or WebGL renderer. Calls are active mesh batches, not total frame calls. Bytes are retained vertex/index buffers including low, cached/staged medium and the global-low copy; exclude textures, JS/temporary arrays and GPU/driver copies. CPU timings include lightweight in-memory profiling; not FPS or GPU timing. Street detail warms in a tight loop; initial preparation uses rAF. Resource checks do not establish visual coverage or acceptable experience.',
    passed: sourcesUnchanged && !errors.length && !blocked.length && result.ledger.version === result.ledger.declaredVersion &&
      result.ledger.withinLimits && result.resourceChecks.stableReturned && result.resourceChecks.stableOverview &&
      result.resourceChecks.emptyAfterDispose && result.chunkFinalize.allPrepared && result.materialDistribution.countsMatchVisibleBatches &&
      result.materialDistribution.initial.visible.uniqueUuids > 0 && !result.localStorageKeys.length && result.cookieFree,
  };
  mkdirSync(join(root, 'docs/evidence/village-world', phase), { recursive: true });
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ passed: report.passed, output, ledger: report.ledger, streetMax: report.streetMax,
    comparisons, globalMerge: report.globalMerge.summary, resourceChecks: report.resourceChecks,
    materials: { initialUuids: report.materialDistribution.initial.visible.uniqueUuids,
      overviewUuids: report.materialDistribution.overview.visible.uniqueUuids,
      overviewLampUuids: report.materialDistribution.overview.visible.blueprintLampUuids },
    requests: report.requests, errors }, null, 2));
  if (!report.passed) process.exitCode = 1;
} finally {
  await browser?.close(); await server?.close();
  console.log(`Owned Chrome browser and Vite ${port} closed.`);
}
