import { Stage } from '../assets/claude-geometry/shell/stage.ts';
import { configureRenderer, previewOptions } from './presentation.ts';
import type { PreviewKind } from './presentation.ts';

// Imported only by the four lazy panels. Stage retains ownership of its resources.
export function createPresentationStage(kind: PreviewKind, container: HTMLElement): Stage {
  const stage = new Stage(previewOptions(kind, container));
  // Stage owns the source look's lighting, lines, cloud sky and disposal.
  // No host colour or exposure override may replace those defaults.
  configureRenderer(stage.renderer, 'preview');
  return stage;
}
