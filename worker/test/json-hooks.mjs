import { readFile } from "node:fs/promises";
/* the Workers runtime module (src/research-flow.js imports WorkflowEntrypoint) → a small stub, so npm test keeps importing src/index.js */
export async function resolve(specifier, context, next) {
  if (specifier === "cloudflare:workers") return { url: new URL("./stubs/cloudflare-workers.mjs", import.meta.url).href, shortCircuit: true };
  return next(specifier, context);
}
export async function load(url, context, next) {
  if (url.startsWith("file:") && url.endsWith(".json")) {
    return { format: "module", source: "export default " + (await readFile(new URL(url), "utf8")) + ";", shortCircuit: true };
  }
  return next(url, context);
}
