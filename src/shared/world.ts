export type Vec3 = [number, number, number];
export const RADIUS = 10;
export const SPEED = 3;
export const INTERACT_DISTANCE = 1.65;
export const CHARACTERS = ['clay', 'fern', 'sky'] as const;
export type Character = typeof CHARACTERS[number];
export type Quest = 'available' | 'carrying' | 'delivered';
export interface PlayerState {
  character: Character;
  quest: Quest;
  position: Vec3;
  deliveries: number;
  revision: number;
  planetId: string;
}
export const normalize = (p: Vec3): Vec3 => {
  const l = Math.hypot(...p);
  return p.map(v => v / l) as Vec3;
};
export const SPAWN = normalize([0, 1, 0.27]);
export const NPCS = {
  mica: { name: 'Mica', place: 'The post office', position: normalize([0.34, 1, -0.16]) },
  sol: { name: 'Sol', place: 'The glasshouse', position: normalize([-0.4, 0.85, -0.56]) },
};
export type NpcId = keyof typeof NPCS;
export function distance(a: Vec3, b: Vec3): number {
  return Math.acos(Math.max(-1, Math.min(1, a.reduce((sum, v, i) => sum + v * b[i], 0)))) * RADIUS;
}
export function validPosition(p: unknown): p is Vec3 {
  return Array.isArray(p) && p.length === 3 && p.every(v => typeof v === 'number' && Number.isFinite(v))
    && Math.abs(Math.hypot(...p) - 1) < 0.001;
}
