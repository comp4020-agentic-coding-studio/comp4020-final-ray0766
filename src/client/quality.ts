import './quality.css';

export type QualityTier = 'smooth' | 'standard' | 'beautiful';
export type QualityPreference = 'auto' | QualityTier;
export interface QualityProfile {
  readonly id: QualityTier;
  readonly pixelRatioCap: number;
  /** Bound 3D work by actual pixels too; DPR alone is unbounded on 5K windows. */
  readonly maxRenderPixels: number;
  readonly shadowSize: number;
  readonly screenLines: boolean;
}
export const QUALITY_PROFILES: Readonly<Record<QualityTier, QualityProfile>> = {
  smooth: { id: 'smooth', pixelRatioCap: 1, maxRenderPixels: 1_500_000, shadowSize: 0, screenLines: false },
  standard: { id: 'standard', pixelRatioCap: 1.35, maxRenderPixels: 1_500_000, shadowSize: 1024, screenLines: true },
  beautiful: { id: 'beautiful', pixelRatioCap: 1.8, maxRenderPixels: 3_200_000, shadowSize: 2048, screenLines: true },
};
export const QUALITY_KEY = 'little-worlds:quality:v1';
export interface QualityCapabilities {
  /** Supplied by the renderer that actually opened; never create a probe context. */
  webgl: boolean | null;
  maxTextureSize?: number;
  maxSamples?: number;
  deviceMemory?: number;
  hardwareConcurrency?: number;
}
export type QualityReason = 'balanced' | 'device-hint' | 'measured-frames';
export interface QualityState {
  preference: QualityPreference;
  profile: QualityProfile;
  recommended: QualityTier;
  reason: QualityReason;
  capabilities: Readonly<QualityCapabilities>;
}
const tiers: QualityTier[] = ['smooth', 'standard', 'beautiful'];
export function isQualityPreference(value: unknown): value is QualityPreference {
  return value === 'auto' || tiers.includes(value as QualityTier);
}
/** Hints choose a conservative starting point, not a minimum-device claim. */
export function recommendQuality(capabilities: QualityCapabilities): QualityTier {
  return (capabilities.deviceMemory !== undefined && capabilities.deviceMemory > 0 && capabilities.deviceMemory <= 2)
    || (capabilities.hardwareConcurrency !== undefined && capabilities.hardwareConcurrency > 0 && capabilities.hardwareConcurrency <= 2)
    || (capabilities.maxTextureSize !== undefined && capabilities.maxTextureSize > 0 && capabilities.maxTextureSize <= 4096)
    ? 'smooth' : 'standard';
}
let preference: QualityPreference = 'auto';
try {
  if (typeof localStorage !== 'undefined') {
    const saved = localStorage.getItem(QUALITY_KEY);
    if (isQualityPreference(saved)) preference = saved;
  }
} catch { /* Settings still work when optional browser storage is unavailable. */ }
let capabilities: QualityCapabilities = {
  webgl: null,
  deviceMemory: typeof navigator === 'undefined' ? undefined : (navigator as Navigator & {deviceMemory?: number}).deviceMemory,
  hardwareConcurrency: typeof navigator === 'undefined' ? undefined : navigator.hardwareConcurrency,
};
let recommended = recommendQuality(capabilities), reason: QualityReason = recommended === 'smooth' ? 'device-hint' : 'balanced';
const listeners = new Set<(state: QualityState) => void>();
export const getQualityProfile = (): QualityProfile => QUALITY_PROFILES[preference === 'auto' ? recommended : preference];
export const getQualityState = (): QualityState => ({ preference, profile: getQualityProfile(), recommended, reason, capabilities: {...capabilities} });
export function qualityPixelRatio(
  dpr = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1,
  width = typeof innerWidth === 'number' ? innerWidth : 0,
  height = typeof innerHeight === 'number' ? innerHeight : 0,
): number {
  const profile = getQualityProfile();
  const density = Math.min(Number.isFinite(dpr) && dpr > 0 ? dpr : 1, profile.pixelRatioCap);
  if (!(Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0)) return density;
  // This scales only the world canvas, never CSS/DOM controls or saved poses.
  return Math.min(density, Math.sqrt(profile.maxRenderPixels / (width * height)));
}

const emit = () => { const state = getQualityState(); for (const listener of listeners) listener(state); };
let warmFrames = 0, samples: number[] = [], assessedWindows = 0;
const resetWindow = () => { warmFrames = 0; samples = []; };
export function setQualityPreference(next: QualityPreference) {
  if (!isQualityPreference(next)) throw new Error('Unknown picture quality.');
  if (next === preference) return;
  preference = next; resetWindow(); assessedWindows = 0;
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(QUALITY_KEY, next); } catch { /* Optional local preference only. */ }
  emit();
}
export function setQualityCapabilities(next: Partial<QualityCapabilities>) {
  capabilities = {...capabilities, ...next};
  // A runtime frame downgrade is sticky for this page. Capability updates and
  // manual → auto cannot repeatedly oscillate or raise a struggling scene.
  if (reason !== 'measured-frames') {
    recommended = recommendQuality(capabilities);
    reason = recommended === 'smooth' ? 'device-hint' : 'balanced';
  }
  resetWindow(); emit();
}
export function onQualityChange(listener: (state: QualityState) => void, options: {signal?: AbortSignal} = {}) {
  const off = () => { listeners.delete(listener); options.signal?.removeEventListener('abort', off); };
  if (!options.signal?.aborted) {
    listeners.add(listener); options.signal?.addEventListener('abort', off, {once: true});
  }
  return off;
}
export interface QualityFrameContext { ready: boolean; foreground?: boolean; paused?: boolean }
/** Observe real frame intervals, before any simulation dt clamp. The host must
 * exclude loading, menus, workshops and photo capture via ready/paused. Only two
 * 180-frame windows are considered; auto only lowers, and manual always wins. */
export function observeQualityFrame(frameMs: number, context: QualityFrameContext) {
  const foreground = context.foreground ?? (typeof document !== 'undefined' && !document.hidden);
  if (preference !== 'auto' || recommended === 'smooth' || assessedWindows >= 2) return;
  if (!context.ready || !foreground || context.paused || !Number.isFinite(frameMs) || frameMs <= 0 || frameMs > 250) {
    resetWindow(); return;
  }
  if (warmFrames++ < 45) return;
  samples.push(frameMs);
  if (samples.length < 180) return;
  assessedWindows++;
  const sorted = [...samples].sort((a, b) => a - b), median = sorted[89], p95 = sorted[170];
  const slowRatio = samples.filter(value => value > 50).length / samples.length;
  samples = [];
  if (median > 30 || (p95 > 38 && slowRatio >= .05)) {
    recommended = 'smooth'; reason = 'measured-frames'; resetWindow(); emit();
  }
}

const words = {
  en: {
    heading: 'Picture quality', auto: 'Auto · recommended', smooth: 'Smooth', standard: 'Standard', beautiful: 'Beautiful',
    smoothDetail: 'Fewer screen effects, the same little world.', standardDetail: 'Village lines and soft shadows. Large windows favour responsiveness.', beautifulDetail: 'Village lines and larger shadows. Large Retina windows trade some 3D sharpness for responsiveness.',
    recommendation: 'Recommended', current: 'Using', manual: 'Your choice stays on this browser.', automatic: 'Auto can lower effects after measuring a ready scene.',
    measured: 'Adjusted after observing slower frames.', hinted: 'Starts gently using available device hints.',
  },
  zh: {
    heading: '画面质量', auto: '自动 · 推荐', smooth: '流畅', standard: '标准', beautiful: '精美',
    smoothDetail: '减少屏幕特效，小世界与玩法完整保留。', standardDetail: '村庄描线与柔和阴影，大型窗口优先保持操作响应。', beautifulDetail: '保留村庄描线与较大阴影；大型Retina窗口降低部分3D锐度以保持响应。',
    recommendation: '推荐', current: '当前', manual: '你的选择保存在当前浏览器。', automatic: '自动档会在场景准备完成后测量，必要时降低特效。',
    measured: '根据实际较慢的帧间隔调整。', hinted: '根据可用设备提示，从较轻的画质开始。',
  },
};
/** Multiple controls share one local preference; text changes never touch saves. */
export function mountQualitySettings(container: HTMLElement, options: {compact?: boolean} = {}) {
  const element = document.createElement('section'); element.className = 'quality-settings';
  element.dataset.i18nVerbatim = ''; element.classList.toggle('quality-compact', !!options.compact);
  const label = document.createElement('label'), title = document.createElement('span'), select = document.createElement('select');
  select.className = 'quality-select'; select.name = 'picture-quality';
  for (const value of ['auto', ...tiers]) select.add(new Option(value, value));
  const description = document.createElement('p'); description.className = 'quality-description';
  const detail = document.createElement('p'); detail.className = 'quality-detail'; detail.setAttribute('role', 'status');
  label.append(title, select); element.append(label, description, detail); container.append(element);
  function paint() {
    const copy = words[document.documentElement.lang.startsWith('zh') ? 'zh' : 'en'], state = getQualityState();
    title.textContent = copy.heading; select.setAttribute('aria-label', copy.heading); select.value = state.preference;
    for (const option of select.options) option.textContent = copy[option.value as QualityPreference];
    description.textContent = copy[`${state.profile.id}Detail`];
    const explanation = state.preference !== 'auto' ? copy.manual : state.reason === 'measured-frames' ? copy.measured : state.reason === 'device-hint' ? copy.hinted : copy.automatic;
    detail.textContent = `${copy.recommendation}: ${copy[state.recommended]} · ${copy.current}: ${copy[state.profile.id]}. ${explanation}`;
    element.dataset.qualityPreference = state.preference; element.dataset.qualityProfile = state.profile.id;
  }
  select.addEventListener('change', () => { if (isQualityPreference(select.value)) setQualityPreference(select.value); });
  const off = onQualityChange(paint), observer = new MutationObserver(paint);
  observer.observe(document.documentElement, {attributes: true, attributeFilter: ['lang']}); paint();
  return { element, dispose() { off(); observer.disconnect(); element.remove(); } };
}
