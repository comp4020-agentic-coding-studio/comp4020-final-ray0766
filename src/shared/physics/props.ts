import type { PartBox } from './parts.ts';

/** Source 14e244f village prop lamp; distinct from the 3.42 m workshop lamp.
 * All three LODs share this geometry, centred 10 cm in front of the origin.
 * Separate heights keep the old full-radius invisible column out of the air. */
export const villageLampColliders=():PartBox[]=>[
 {tag:'stone lantern base',center:[0,.07,.1],half:[.1848,.07,.1848]},
 {tag:'stone lantern shaft',center:[0,.88,.1],half:[.0693,.74,.0693]},
 {tag:'stone lantern bowl',center:[0,1.69,.1],half:[.1663,.08,.1663]},
 {tag:'stone lantern firebox',center:[0,1.905,.1],half:[.15,.135,.156]},
 {tag:'stone lantern roof',center:[0,2.105,.1],half:[.2541,.065,.2541]},
 {tag:'stone lantern finial',center:[0,2.1825,.1],half:[.0462,.0175,.0462]},
];
