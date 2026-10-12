// Main-planet plan tool: validate, report conflicts and draw the plan map.
//   node scripts/planet-plan.ts check            structure + network + conflicts
//   node scripts/planet-plan.ts svg <out.svg>    plan map (roads, lots, entrances, setbacks, conflicts)
import { readFileSync, writeFileSync } from 'node:fs';
import { loadPlan } from '../src/shared/planet-plan/schema.ts';
import { buildNetwork } from '../src/shared/planet-plan/network.ts';
import { planSvg } from '../src/shared/planet-plan/plan-svg.ts';

const PLAN_PATH = new URL('../src/shared/planet-plan/main-planet.plan.json', import.meta.url);
const [command = 'check', out] = process.argv.slice(2);
const loaded = loadPlan(readFileSync(PLAN_PATH, 'utf8'), new Set());
if (!loaded.ok) { console.error(loaded.errors.join('\n')); process.exit(1); }
const network = buildNetwork(loaded.plan);
const length = network.roads.reduce((n, r) => n + r.length, 0);
console.log(`roads ${network.roads.length}, pieces ${network.pieces.length}, junctions ${network.junctions.length}, plazas ${network.plazas.length}, centreline ${length.toFixed(1)} m`);
if (command === 'svg') { writeFileSync(out ?? 'plan.svg', planSvg(network)); console.log(`wrote ${out}`); }
