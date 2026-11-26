// node --test stand-in for the Workers runtime module "cloudflare:workers" (test/json-hooks.mjs maps the import here): the Workflow base
// class only keeps env, as the runtime does. No test runs a real Workflow — research.test.mjs drives research.js runJob with a fake step.
export class WorkflowEntrypoint { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }
export class WorkerEntrypoint { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }
