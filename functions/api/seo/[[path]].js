/* /api/seo/* — admin API of the edge SEO layer (Pages Function, catch-all route /api/seo and /api/seo/**).
   Implementation, endpoint list and auth: functions/_lib/seo-api.js and functions/_lib/seo-auth.js.
   Needs in the Pages project: KV binding SEO_KV, secret ADVISOR_SECRET (and AUTH_SECRET if the Worker uses it), and one
   admin-role source (D1 binding DB = the Worker's database, recommended; or a PLATFORM_API service binding; or SEO_ADMIN_IDS).
   Optional: secret SEO_PLATFORM_KEY (X-Platform-Key for CI: health / export / IndexNow), var SEO_PUBLIC_CONTACTS.
   Preview deployments (<x>.<project>.pages.dev) are read-only unless SEO_PREVIEW_WRITES = "1" (with their own KV). */
import { handleSeoApi } from "../../_lib/seo-api.js";

export const onRequest = ctx => handleSeoApi(ctx);
