import { defineConfig } from 'vite';
import { CLAUDE_ASSET_ROOT } from './src/shared/asset-release.ts';
export default defineConfig({
  plugins:[{
    name:'claude-versioned-assets',enforce:'pre',
    transform(code,id){
      if(!id.split('?')[0].endsWith('/src/assets/claude-geometry/style/scans.ts'))return;
      // Build adapter: keep the vendored source byte-identical to its manifest.
      // All map formats, HDRIs and both transcoder files share one version root.
      const marker=' + path;';
      if(code.split(marker).length!==2)this.error('Claude assetUrl changed; review the versioned resource adapter.');
      return {code:code.replace(marker,` + path.replace(/^assets\\//, '${CLAUDE_ASSET_ROOT}');`),map:null};
    },
  }],
  server: { host: '127.0.0.1', proxy: { '/api': 'http://127.0.0.1:8080', '/readme': 'http://127.0.0.1:8080', '/healthz': 'http://127.0.0.1:8080' } },
  build: { outDir: 'dist', chunkSizeWarningLimit: 650 },
});
