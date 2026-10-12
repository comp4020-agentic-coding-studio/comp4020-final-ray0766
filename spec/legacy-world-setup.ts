import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestProject } from "vitest/node";

// The legacy HTTP suite checks the original contract, where a new browser
// identity arrives without a home. The deployed world gives every arrival a
// home, so these specs cannot run against APP_URL. They get their own server
// from this checkout instead: the test-only legacy world, on a free local
// port and a fresh throwaway database, stopped when the run ends.
const freePort = () => new Promise<number>((resolve, reject) => {
  const probe = createServer().once("error", reject).listen(0, "127.0.0.1", () => {
    const { port } = probe.address() as { port: number };
    probe.close(() => resolve(port));
  });
});

export default async function setup(project: TestProject): Promise<() => void> {
  const dir = mkdtempSync(join(tmpdir(), "legacy-world-")), port = await freePort();
  const server = spawn(process.execPath, ["src/server/index.ts"], {
    env: { ...process.env, NODE_ENV: "test", TEST_LEGACY_WORLD: "1", HOST: "127.0.0.1", PORT: String(port), DATABASE_PATH: join(dir, "legacy.sqlite") },
    stdio: ["ignore", "ignore", "inherit"],
  });
  const stop = () => { server.kill(); rmSync(dir, { recursive: true, force: true }); };
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    for (let attempt = 0; ; attempt++) {
      if (server.exitCode !== null) throw new Error(`The legacy test world exited (${server.exitCode}) before answering.`);
      try {
        const response = await fetch(baseUrl + "/healthz"), health = await response.json() as { profile?: string };
        // The same handshake as EXPECT_WORLD_PROFILE: never write test identities into another world.
        if (health.profile !== "legacy-test") throw new Error(`Expected the legacy test world at ${baseUrl}; received ${health.profile ?? "unknown"}.`);
        break;
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("Expected")) throw error;
      }
      if (attempt >= 300) throw new Error(`The legacy test world did not answer at ${baseUrl}.`);
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  } catch (error) { stop(); throw error; }
  project.provide("baseUrl", baseUrl);
  return stop;
}
