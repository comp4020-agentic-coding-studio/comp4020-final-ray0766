import type { Blueprint } from './blueprint-model.ts';
import type { Vec3 } from './world.ts';

export interface HomeSetupCandidate { buildingId: string; partNumber: number; buildingName: string }
export interface HomeSetupAddition { position: Vec3; rotation: number; blueprint: Blueprint }
export interface HomeSetupPreview {
  planetId: string;
  hash: string;
  expectedRevision: number;
  existingHome: boolean;
  candidates: HomeSetupCandidate[];
  addition?: HomeSetupAddition;
  reason?: string;
}
export interface HomeSetupConfirm {
  planetId: string;
  expectedRevision: number;
  hash: string;
  visitEpoch: number;
  mode: 'bind' | 'add';
  buildingId?: string;
  partNumber?: number;
}
export interface HomeSetupResult { planetId: string; buildingId: string; interiorId: string }
