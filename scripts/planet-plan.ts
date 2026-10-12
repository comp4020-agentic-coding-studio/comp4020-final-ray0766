// Main-planet plan tool: validate, report conflicts and draw the plan map.
//   node scripts/planet-plan.ts check            structure + network + lots + conflicts
//   node scripts/planet-plan.ts svg <out.svg>    plan map: roads, footprints, eaves, entrances, props, conflicts
//   node scripts/planet-plan.ts save             rewrite the plan JSON in canonical form
//   node scripts/planet-plan.ts build            freeze the generated ledger the game loads (refuses on errors)
import { readFileSync, writeFileSync } from 'node:fs';
import { loadPlan, savePlan } from '../src/shared/planet-plan/schema.ts';
import { planTown } from '../src/shared/planet-plan/generate.ts';
import { planSvg } from '../src/shared/planet-plan/plan-svg.ts';
import { COMPOSITION_IDS } from '../src/shared/planet-plan/compositions.ts';
import { fieldOf } from '../src/shared/terrain.ts';
import { PUBLIC_TOWN_ENVIRONMENT } from '../src/shared/public-town-layout.ts';
import { NPCS, SPAWN } from '../src/shared/world.ts';
import { HUB_DOCK } from '../src/shared/ports.ts';
import { HUB_SHIP } from '../src/shared/harbour-layout.ts';
import { RESERVES } from '../src/shared/planet-plan/params.ts';
import type { V3 } from '../src/shared/planet-plan/sphere.ts';
import { buildLedger } from '../src/shared/planet-plan/ledger-build.ts';

const PLAN_PATH = new URL('../src/shared/planet-plan/main-planet.plan.json', import.meta.url);
const [command = 'check', out] = process.argv.slice(2);
const loaded = loadPlan(readFileSync(PLAN_PATH, 'utf8'), COMPOSITION_IDS);
if (!loaded.ok) { console.error(loaded.errors.join('\n')); process.exit(1); }
if (command === 'save') { writeFileSync(PLAN_PATH, savePlan(loaded.plan)); console.log('saved canonical plan'); process.exit(0); }
const started = performance.now();
const town = planTown(loaded.plan, { field: fieldOf(PUBLIC_TOWN_ENVIRONMENT, 21.6) });
const n = town.network, length = n.roads.reduce((s, r) => s + r.length, 0);
console.log(`roads ${n.roads.length} (${length.toFixed(0)} m centreline), junctions ${n.junctions.length}, plazas ${n.plazas.length}, lots ${town.lots.length}, door paths ${town.doorPaths.length}, props ${town.props.length}, routes ${town.routes.length} in ${(performance.now() - started).toFixed(0)} ms`);
const filled = (loaded.plan.frontages ?? []).map(f => `${f.id}:${town.lots.filter(l => l.id.startsWith(f.id + '-')).length}`);
console.log('frontages', filled.join(' '));
const errors = town.conflicts.filter(c => c.severity === 'error'), warnings = town.conflicts.filter(c => c.severity === 'warning');
for (const c of [...errors, ...warnings]) console.log(`${c.severity === 'error' ? 'ERROR  ' : 'warning'} [${c.kind}] ${c.message}`);
console.log(`${errors.length} errors, ${warnings.length} warnings`);
if (command === 'svg') {
  const svg = planSvg(n, {
    footprints: town.lots.map(l => ({ id: l.id, outline: l.base, canopy: l.canopy, kind: l.composition.kind === 'garden' ? 'site' : 'building', conflict: errors.some(c => c.id.split('/').includes(l.id)) })),
    entrances: town.doorPaths.map(d => ({ id: d.lot, from: d.from, to: d.to })),
    reserves: [['spawn', SPAWN, RESERVES.spawn], ['dock', HUB_DOCK, RESERVES.dock], ['ship', HUB_SHIP, RESERVES.ship], ['mica', NPCS.mica.position, RESERVES.npc], ['sol', NPCS.sol.position, RESERVES.npc]].map(([id, at, radius]) => ({ id: id as string, at: at as V3, radius: radius as number, kind: id as string })),
    areas: loaded.plan.areas.map(a => ({ id: a.id, at: n.point(a.at), radius: a.radius, kind: a.kind, label: a.name })),
    props: town.props.map(p => ({ id: p.id, at: p.position, kind: p.kind })),
    residents: town.residents.map(r => ({ id: r.id, at: r.position, route: r.route })),
    conflicts: errors.map(c => ({ id: c.id, at: c.at, message: c.message })),
    labels: [...town.lots.map(l => ({ at: l.position, text: l.id, size: .55 })), ...loaded.plan.districts.map(d => ({ at: n.point(d.center), text: d.name, size: 1.3 }))],
  });
  writeFileSync(out ?? 'plan.svg', svg); console.log(`wrote ${out}`);
}
if (errors.length && (command === 'check' || command === 'build')) process.exit(1);
if (command === 'build') {
  const ledger = await buildLedger(town, readFileSync(PLAN_PATH, 'utf8'));
  writeFileSync(new URL('../src/shared/planet-plan/main-planet.ledger.json', import.meta.url), JSON.stringify(ledger));
  console.log(`ledger: ${ledger.objects.length} objects (${ledger.objects.filter(o => o.kind === 'structure').length} structures), ${Object.keys(ledger.blueprints).length} blueprints, plan ${ledger.planHash.slice(0, 12)}`);
}
