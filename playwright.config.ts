import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e', timeout: 90_000, workers: 1,
  use: { baseURL:process.env.APP_URL ?? 'http://127.0.0.1:8080', channel:'chrome', headless:true, trace:'retain-on-failure' },
  reporter: [['list'],['html',{open:'never'}]],
});
