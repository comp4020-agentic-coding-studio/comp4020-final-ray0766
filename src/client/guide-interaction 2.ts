import { Vector3 } from 'three';
import { GUIDE_HELP, type GuideTopic } from '../shared/world-guide.ts';

/** A focused control owns Space; never steal typing, composition or key repeats. */
export function guideShortcut(event: KeyboardEvent) {
  return (event.code === 'Space' || event.key === ' ') && !event.defaultPrevented && !event.repeat && !event.isComposing && !event.ctrlKey && !event.metaKey && !event.altKey
    && !(event.target instanceof Element && event.target.closest('input,textarea,select,button,a,[role="button"],[contenteditable]:not([contenteditable="false"])'));
}
/** Place a stationary, non-colliding local character beside the player. Never move a player. */
export function nearbyGuidePoint(feet: Vector3, up: Vector3, forward: Vector3, stand: (point: Vector3) => Vector3 | null) {
  const front = forward.clone().projectOnPlane(up).normalize();
  if (front.lengthSq() < .1) front.set(0, 0, 1).projectOnPlane(up).normalize();
  const right = new Vector3().crossVectors(up, front).normalize();
  for (const [x,z] of [[1.05,.35],[-1.05,.35],[.9,-.65],[-.9,-.65],[0,1.15],[0,-1.15]]) {
    const candidate = stand(feet.clone().addScaledVector(right,x).addScaledVector(front,z));
    if (candidate && candidate.distanceTo(feet) >= .75) return candidate;
  }
  return null;
}
/** Explicitly fixed local answers, not AI. Unknown queries are never guessed. */
export function localGuideAnswer(question: string, language: 'en' | 'zh') {
  const q=question.trim().toLowerCase();
  const topic:GuideTopic|undefined=/save|offline|online|people|player|保存|离线|断线|多人/.test(q)?'save':/return|back|teleport|返回|传送/.test(q)?'return':/ship|visit|flight|travel|飞船|拜访|旅行|起飞|降落/.test(q)?'visit':/build|module|place|建造|模块/.test(q)?'build':/home|planet|家园|自己的星球/.test(q)?'home':undefined;
  return topic ? GUIDE_HELP[topic][language] : language==='zh'?'固定帮助暂时没有这个问题的答案。请选择下方主题。':'The fixed help has no answer for that question. Choose a topic below.';
}
