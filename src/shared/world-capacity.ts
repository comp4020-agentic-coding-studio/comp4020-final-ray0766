/** Private editing retains its existing save and history limits. The authored
 * public town has a separate, explicit ledger budget; rendering never adds
 * uncounted buildings. These limits do not grant permission to edit the hub. */
export const PRIVATE_CAPACITY = Object.freeze({ objects: 64, structures: 8 });
export const PUBLIC_TOWN_CAPACITY = Object.freeze({ objects: 512, structures: 256, districts: 12 });
