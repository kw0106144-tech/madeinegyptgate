/* The platform's own apps «صنع في مصر» (app/: Android + iPhone, Capacitor — a WebView of https://madeinegyptgate.com) name themselves in
   their user agent: "… MIGApp/<version> (ios)" / "… MIGApp/<version> (android)" (app/capacitor.config.json appendUserAgent; the site reads
   the same mark: data/flags.js, data/pwa.js, seo_build.part.py pwa_head).
   appOf(req) → "ios" | "android" | "" — which app a request says it comes from, for the store-rule switches of flags.js (app parity plan
   2026-11-20): app_buy_ios / app_buy_android (payments.js, acc-me.js, janna-session.js) and call_consent_app (janna-session.js).
   A user agent proves nothing: these rules only ever TAKE something away from a request that says it comes from an app (a store rule),
   never grant one — a request that hides the mark simply gets the website's behaviour. Leaf module (flags.js only). */
import { featureOn } from "./flags.js";

export const APP_UA_RX = /\bMIGApp\/[^\s()]*\s*\((ios|android)\)/i;
export function appOfUa(ua) {
  const u = String(ua || ""), m = APP_UA_RX.exec(u);
  if (m) return m[1].toLowerCase();
  if (!/\bMIGApp\b/.test(u)) return "";
  return /iPhone|iPad|iPod/.test(u) ? "ios" : /Android/i.test(u) ? "android" : ""; // an app mark without its platform: the system's own words
}
export const appOf = req => appOfUa(req && req.headers && typeof req.headers.get === "function" ? req.headers.get("User-Agent") : "");
/* «🛠️ المطوّر» → app_buy_<platform> off: no buying inside THAT app (the website and the other app are untouched) */
export async function appBuyOff(env, req) {
  const p = appOf(req);
  return p ? !(await featureOn(env, "app_buy_" + p)) : false;
}
export const APP_BUY_OFF_MSG = "الدفع مش متاح جوه التطبيق / payment is not available inside the app";
