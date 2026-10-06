import { Stage } from '../assets/claude-geometry/shell/stage.ts';
import { configureRenderer, previewOptions } from './presentation.ts';
import type { PreviewKind } from './presentation.ts';

// Imported only by the four lazy panels. Stage retains ownership of its resources.
export function createPresentationStage(kind: PreviewKind, container: HTMLElement): Stage {
  const stage = new Stage(previewOptions(kind, container));
  configureRenderer(stage.renderer, 'preview');
  return stage;
}
