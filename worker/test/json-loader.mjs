// Lets `node --test` import src/index.js, which does `import DATA from "./data.json"` (wrangler-style, no import attribute).
import { register } from "node:module";
register("./json-hooks.mjs", import.meta.url);
