import { defineConfig } from "vitest/config";

// The HTTP specs written for the original contract, where a new identity
// arrives without a home. They run against their own legacy test world
// (spec/legacy-world-setup.ts); their in-process tests run there too.
const LEGACY_HTTP = ["api", "blueprints", "planet-api", "boarding-api", "history", "save-recovery", "terrain"].map(name => `spec/${name}.test.ts`);

// Specs of camera code the game does not run: the v11 GroundCameraRig (never
// constructed; the game uses SimpleFollowCameraRig and the 4f0d596 outdoor
// camera), GroundCameraCutawayRig (not imported by the client) and
// certifyCameraFrame (never called). Several replay captures from a town the
// main planet replaced. Kept and runnable with `pnpm test:disabled-camera`, but
// outside `pnpm check`: they say nothing about the game players get.
const DISABLED_CAMERA = ["ground-camera", "ground-camera-avoidance", "ground-camera-temporal", "ground-camera-atomic", "ground-camera-protected-central", "ground-camera-protected-physical", "ground-camera-protected-tangent", "ground-camera-cutaway-ranking", "ground-camera-cutaway-ranking-r8-support"].map(name => `spec/${name}.test.ts`);

// Every other test in spec/ runs against the running app, which
// spec/global-setup.ts finds. Only spec/ runs: a test anywhere else needs
// adding to `include`.
export default defineConfig({
  test: {
    projects: [
      { extends: true, test: { name: "app", include: ["spec/**/*.test.ts"], exclude: [...LEGACY_HTTP, ...DISABLED_CAMERA], globalSetup: ["./spec/global-setup.ts"] } },
      // One file at a time: they share one legacy world, and several claim "the first free planet".
      { extends: true, test: { name: "legacy-http", include: LEGACY_HTTP, globalSetup: ["./spec/legacy-world-setup.ts"], fileParallelism: false } },
      { extends: true, test: { name: "disabled-camera", include: DISABLED_CAMERA } },
    ],
  },
});
