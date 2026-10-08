import { Stage } from '../assets/claude-geometry/shell/stage.ts';
import { configureRenderer, previewOptions } from './presentation.ts';
import type { PreviewKind } from './presentation.ts';
import {adaptArtLibrary,ART_LIGHT} from './art-profile.ts';

// Imported only by the four lazy panels. Stage retains ownership of its resources.
export function createPresentationStage(kind: PreviewKind, container: HTMLElement): Stage {
  const stage = new Stage(previewOptions(kind, container));
  adaptArtLibrary(stage.library);
  stage.scene.environmentIntensity=ART_LIGHT.environmentIntensity;
  stage.moodEnvironmentIntensity=ART_LIGHT.environmentIntensity;
  stage.lights.key.color.set(ART_LIGHT.sun);
  stage.lights.key.intensity=ART_LIGHT.sunIntensity;
  stage.lights.fill.color.set(ART_LIGHT.fill);
  stage.lights.fill.intensity=ART_LIGHT.fillIntensity;
  stage.lights.key.shadow.intensity=ART_LIGHT.shadowIntensity;
  stage.lights.key.shadow.radius=ART_LIGHT.shadowRadius;
  configureRenderer(stage.renderer, 'preview');
  return stage;
}
