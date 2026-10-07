import { defineConfig } from 'vitest/config';

// Camera and furnishing checks are pure and must not contact a running app.
export default defineConfig({ test: { include: ['spec/home-interior-view.test.ts'], environment: 'node' } });
