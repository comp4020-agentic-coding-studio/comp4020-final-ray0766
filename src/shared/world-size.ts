// Persisted planet dimensions, in metres. Modules and avatars are never scaled.
export const HUB_RADIUS = 14;
export const GARDEN_RADII = [10, 11, 12] as const;
export const radiusForSlot = (slot: number) => GARDEN_RADII[Math.max(0, slot - 1) % GARDEN_RADII.length];
export const bodyRadius = (body: { radius?: number }) => body.radius ?? 10;
export const landingRadius = (body: { radius?: number }) => bodyRadius(body) + 10;
export const safeRadius = (body: { radius?: number; environment?: string | null }, clearance = 3) => bodyRadius(body) + clearance + (body.environment ? 1.75 : 0);
