/* «بحث وكتابة عميقة» — the Workflow that runs ONE deep research job of Bassem (design part A §A.2 / §A.4): the Worker's binding RESEARCH
   (worker/wrangler.toml [[workflows]] «migate-research», class ResearchFlow). The instance id is the job id; its payload is {id} only — the
   steps read the masked inputs from D1 and write the pack back to D1, so Cloudflare's Workflow state holds ids, counts and codes, never
   the member's text. Each instance is created with its own short retention (1 day, 3 days for a failed one: research.js startJob).
   The logic is research.js runJob (deterministic step names; every side effect inside step.do; it never throws). */
import { WorkflowEntrypoint } from "cloudflare:workers";
import { runJob } from "./research.js";

export class ResearchFlow extends WorkflowEntrypoint {
  async run(event, step) { return runJob(this.env, (event && event.payload) || {}, step); }
}
