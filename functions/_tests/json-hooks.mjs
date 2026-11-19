// Module hooks for the tests that import the Worker's own code (worker/src/*.js does `import DATA from "./data.json"`
// the wrangler way, without an import attribute, which plain Node refuses). Registered by seo-auth.test.mjs.
import { readFile } from "node:fs/promises";
export async function load(url, context, next) {
  if (url.startsWith("file:") && url.endsWith(".json")) return { format: "module", source: "export default " + (await readFile(new URL(url), "utf8")) + ";", shortCircuit: true };
  return next(url, context);
}
