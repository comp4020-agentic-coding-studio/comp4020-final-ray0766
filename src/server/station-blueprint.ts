import { createHash } from 'node:crypto';
import { canonicalJson } from '../assets/claude-geometry/core/doc.ts';
import { hashInput } from '../shared/blueprint-codec.ts';
import { TELEPORT_STATION } from '../shared/planet-plan/compositions.ts';

/** Canonical content of the shared teleport station blueprint. */
export const STATION_CONTENT = canonicalJson(hashInput(TELEPORT_STATION.blueprint.parts));
/** Its content hash; every home owner may place it like a catalogue item. */
export const STATION_HASH = createHash('sha256').update(STATION_CONTENT).digest('hex');
