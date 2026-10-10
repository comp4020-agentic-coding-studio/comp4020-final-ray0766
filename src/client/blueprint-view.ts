import { WorkshopView as VendorView } from '../assets/claude-geometry/blueprint/view/workshop-view.ts';
import { PartTemplates as VendorTemplates } from '../assets/claude-geometry/blueprint/view/templates.ts';
import { partIcon as vendorPartIcon } from '../assets/claude-geometry/blueprint/view/thumbnail.ts';
import type { Stage } from '../assets/claude-geometry/shell/stage.ts';
import type { StyleLibrary } from '../assets/claude-geometry/style/materials.ts';
import type { PartId as VendorId } from '../assets/claude-geometry/blueprint/parts/catalogue.ts';
import type { PartId } from '../shared/blueprint-parts.ts';
import type { PartPlacement, Rot } from '../shared/blueprint-model.ts';
import type { BlueprintEditor } from './blueprint-editor.ts';

type Draft = Omit<PartPlacement, 'n'>;
export interface PartTemplates extends Omit<VendorTemplates, 'get' | 'instance'> {
  get(id: PartId): ReturnType<VendorTemplates['get']>;
  instance(id: PartId): ReturnType<VendorTemplates['instance']>;
}
export const PartTemplates = VendorTemplates as unknown as { new(library: StyleLibrary): PartTemplates };
export interface WorkshopView extends Omit<VendorView, 'setGhost' | 'slotAt' | 'pointFor'> {
  setGhost(draft: Draft | null, ok?: boolean): void;
  slotAt(part: PartId, gx: number, gz: number, toolRot: Rot, flip: boolean): Draft | null;
  pointFor(draft: Draft): { gx: number; gz: number };
}
export const WorkshopView = VendorView as unknown as { new(stage: Stage, editor: BlueprintEditor, templates: PartTemplates): WorkshopView };
export const partIcon = (stage: Stage, id: PartId, size = 64) => vendorPartIcon(stage, id as VendorId, size);
