import { defineConfig } from "vitest/config";

// The HTTP specs written for the original contract, where a new identity
// arrives without a home. They run against their own legacy test world
// (spec/legacy-world-setup.ts); their in-process tests run there too.
const LEGACY_HTTP = ["api", "blueprints", "planet-api", "boarding-api", "history", "save-recovery", "terrain"].map(name => `spec/${name}.test.ts`);

// Every other test in spec/ runs against the running app, which
// spec/global-setup.ts finds. Only spec/ runs: a test anywhere else needs
// adding to `include`.
export default defineConfig({
  test: {
    projects: [
      { extends: true, test: { name: "app", include: ["spec/**/*.test.ts"], exclude: LEGACY_HTTP, globalSetup: ["./spec/global-setup.ts"] } },
      // One file at a time: they share one legacy world, and several claim "the first free planet".
      { extends: true, test: { name: "legacy-http", include: LEGACY_HTTP, globalSetup: ["./spec/legacy-world-setup.ts"], fileParallelism: false } },
    ],
  },
});
