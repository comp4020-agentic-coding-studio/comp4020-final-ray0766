// Identifier conventions shared by all four modules.
//
// - Object, event, command, blueprint and ship-design ids are lower-case
//   RFC 4122 UUID strings from crypto.randomUUID(). That is a strict subset of
//   what the main project accepts for object ids (/^[a-f0-9-]{36}$/), so ids
//   minted here pass its existing validation unchanged.
// - Planet ids are opaque server strings ("hub", "p-<uuid>" in the main project).
// - Actor ids are only ever derived by the server from the session; they never
//   arrive in a client command (see world.ts).

declare const brand: unique symbol;
export type Brand<T, B extends string> = T & { readonly [brand]: B };

export type ObjectId = Brand<string, 'ObjectId'>;
export type EventId = Brand<string, 'EventId'>;
export type CommandId = Brand<string, 'CommandId'>;
export type BlueprintId = Brand<string, 'BlueprintId'>;
export type ShipDesignId = Brand<string, 'ShipDesignId'>;
export type PlanetId = Brand<string, 'PlanetId'>;
export type ActorId = Brand<string, 'ActorId'>;

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const PLANET_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;

export const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID_PATTERN.test(value);
export const isPlanetId = (value: unknown): value is PlanetId => typeof value === 'string' && PLANET_ID_PATTERN.test(value);

export function newUuid(): string {
  return globalThis.crypto.randomUUID();
}
export const newObjectId = () => newUuid() as ObjectId;
export const newCommandId = () => newUuid() as CommandId;
export const newBlueprintId = () => newUuid() as BlueprintId;
export const newShipDesignId = () => newUuid() as ShipDesignId;
