import { defineConfig } from 'vitest/config';

// These DOM/state tests need neither a running server nor a database.
export default defineConfig({
  test: { include: ['spec/onboarding.test.ts'], environment: 'jsdom' },
});
