// Bundles the preparation worker (src/server/heavy-worker.ts) into one plain
// JavaScript file, build/worker/heavy-worker.mjs. A worker that loads
// TypeScript pays for its own copy of Node's type stripper (about 20 MB on a
// 256 MB machine); this bundle does not. Next to it, heavy-worker.json lists
// every source file that went in and a hash of their contents: the server uses
// the bundle only while those files are unchanged (src/server/worker-script.ts).
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { build } from "vite";
import type { Plugin } from "vite";

// An optional argument builds elsewhere (the spec builds into a temporary directory).
const root = process.cwd(), outDir = resolve(root, process.argv[2] ?? "build/worker");
let inputs: string[] = [];
const manifest: Plugin = {
  name: "worker-inputs",
  generateBundle(_options, bundle) {
    const ids = Object.values(bundle).flatMap(item => item.type === "chunk" ? item.moduleIds : []);
    inputs = [...new Set(ids.filter(id => !id.startsWith("\0") && existsSync(id)).map(id => relative(root, id).split("\\").join("/")))].sort();
  },
};
await build({
  configFile: false, root, logLevel: "warn",
  plugins: [manifest],
  ssr: { noExternal: true, target: "node" },
  build: {
    ssr: "src/server/heavy-worker.ts", outDir, emptyOutDir: true, target: "node24", minify: false, copyPublicDir: false,
    rolldownOptions: { output: { entryFileNames: "heavy-worker.mjs", format: "es" } },
  },
});
const hash = createHash("sha256");
for (const file of inputs) hash.update(file).update("\0").update(readFileSync(resolve(root, file))).update("\0");
writeFileSync(resolve(outDir, "heavy-worker.json"), JSON.stringify({ entry: "heavy-worker.mjs", inputs, hash: hash.digest("hex") }, null, 1) + "\n");
console.log(`${relative(root, outDir)}/heavy-worker.mjs from ${inputs.length} source files`);
