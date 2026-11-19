import { readFile } from "node:fs/promises";
export async function load(url, context, next) {
  if (url.startsWith("file:") && url.endsWith(".json")) {
    return { format: "module", source: "export default " + (await readFile(new URL(url), "utf8")) + ";", shortCircuit: true };
  }
  return next(url, context);
}
