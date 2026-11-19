/* migate-intel — how the site's shell is cut out of a built site page (AR /tenders/, EN /en/tenders/): the site-wide <head>
   assets (page-specific title / meta / canonical / alternates / JSON-LD dropped), the header from the skip link to </header> with
   the language switch turned into {{ALT_URL}}, the footer, the «اسأل جنة» button and the standing Janna script after it.
   Pure (no bindings, no imports): used by tools/make-shell.mjs (the baked fallback src/shell.js) and by src/siteshell.js (the
   shell loaded from the site at runtime), so both are cut by the same rules. */
export function extractShell(html, lang) {
  const headM = /<head>([\s\S]*?)<\/head>/i.exec(html), bodyM = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html);
  if (!headM || !bodyM) throw new Error("no <head> / <body> in the " + lang + " page");
  const keep = headM[1]
    .replace(/<title>[\s\S]*?<\/title>\s*/i, "")
    .replace(/<meta\s+(?:name|property)="(?:description|keywords|robots|og:[^"]+|twitter:[^"]+)"[^>]*>\s*/gi, "")
    .replace(/<link\s+rel="(?:canonical|alternate)"[^>]*>\s*/gi, "")
    .replace(/<script type="application\/ld\+json"[\s\S]*?<\/script>\s*/gi, "")
    .trim();
  const body = bodyM[1];
  const hStart = body.indexOf("<a class=\"skip\""), hEnd = body.indexOf("</header>") + "</header>".length;
  if (hEnd < "</header>".length) throw new Error("no </header> in the " + lang + " page");
  let header = body.slice(hStart >= 0 ? hStart : body.indexOf("<header"), hEnd)
    .replace(/<a class="skip" href="[^"]*"/, '<a class="skip" href="#main"');
  // the language switch button → per-page alternate URL
  header = header.replace(lang === "ar" ? /href="\/en\/tenders\/"(\s+hreflang="en")/ : /href="\/tenders\/"(\s+hreflang="ar[^"]*")/, 'href="{{ALT_URL}}"$1');
  const fStart = body.indexOf("<footer"), fEnd = body.indexOf("</footer>") + "</footer>".length;
  if (fStart < 0 || fEnd < "</footer>".length) throw new Error("no <footer> in the " + lang + " page");
  const footer = body.slice(fStart, fEnd);
  const ask = (/<button class="ask-btn"[\s\S]*?<\/button>/.exec(body.slice(fEnd)) || [""])[0];
  // the standing Janna (data/janna-welcome.js, appended before </body> on every generated page) — 2026-11-19: /intel/ pages had no Janna
  const jw = (/<script src="\/data\/janna-welcome\.js[^"]*"[^>]*><\/script>/.exec(body.slice(fEnd)) || [""])[0];
  if (!header.includes("{{ALT_URL}}")) throw new Error("language switch link not found in " + lang + " header");
  return { head: keep, header, footer: footer + "\n" + ask + (jw ? "\n" + jw : "") };
}

/* what renderPage (pages.js) needs from a shell: the charset line it inserts the page head after, a site stylesheet, the header
   with the language switch placeholder, and the footer — a page that lacks any of them is not the site (an error page, a bot
   wall, the old hosting) and is never used */
export function looksLikeSite(sh) {
  return !!sh && typeof sh.head === "string" && typeof sh.header === "string" && typeof sh.footer === "string" &&
    sh.head.includes('<meta charset="utf-8">') && /<link[^>]+rel="stylesheet"[^>]+href="\/assets\/[^"]+\.css"/.test(sh.head) &&
    /<header[\s>]/.test(sh.header) && sh.header.includes("{{ALT_URL}}") && /^<footer[\s>]/.test(sh.footer);
}
