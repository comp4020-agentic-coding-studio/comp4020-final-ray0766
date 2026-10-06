import type { TextureFormat } from '../assets/claude-geometry/style/scans.ts';
// Default stays medium/WebP. The explicit diagnostic override exercises GPU
// compression and per-map fallback without changing geometry or texture detail.
export const textureFormat=():TextureFormat=>new URLSearchParams(location.search).get('textures')==='ktx2'?'ktx2':'webp';
