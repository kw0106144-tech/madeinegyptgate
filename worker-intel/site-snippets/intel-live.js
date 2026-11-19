/* «جديد اليوم من المصادر الرسمية» — live list from migate-intel. Include once per page (defer); renders into every
   <div data-intel="tenders|projects|news|rfq" [data-market="eg"] [data-sector="..."] [data-limit="6"] [data-days="3"]>.
   Honesty: on error or zero items the box stays hidden (no placeholders). */
(function () {
  var boxes = document.querySelectorAll("[data-intel]");
  if (!boxes.length || !window.fetch) return;
  var en = (document.documentElement.getAttribute("lang") || "ar").slice(0, 2) === "en";
  var L = en ? { h: "New today from official sources", all: "All updates", dl: "Deadline", src: "Source", upd: "Updated" }
             : { h: "جديد اليوم من المصادر الرسمية", all: "كل التحديثات", dl: "آخر موعد", src: "المصدر", upd: "آخر تحديث" };
  var HUB = { tenders: "tenders/", projects: "projects/", news: "news/", rfq: "rfq/" };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function day(d) { try { return new Date(d + "T12:00:00Z").toLocaleDateString(en ? "en-GB" : "ar-EG", { day: "numeric", month: "long", year: "numeric" }); } catch (e) { return d; } }
  Array.prototype.forEach.call(boxes, function (box) {
    var kind = box.getAttribute("data-intel") || "", q = "kind=" + encodeURIComponent(kind) + "&days=" + (box.getAttribute("data-days") || 3) + "&per=" + (box.getAttribute("data-limit") || 6) + "&sort=relevance&lang=" + (en ? "en" : "ar");
    if (box.getAttribute("data-market")) q += "&market=" + encodeURIComponent(box.getAttribute("data-market"));
    if (box.getAttribute("data-sector")) q += "&sector=" + encodeURIComponent(box.getAttribute("data-sector"));
    box.hidden = true;
    fetch("/api/intel/feed?" + q, { headers: { Accept: "application/json" } }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (!d || !d.items || !d.items.length) return;
      var hub = (en ? "/intel/en/" : "/intel/") + (HUB[kind] || "");
      box.innerHTML = '<section class="intel-live"><h2 class="intel-live-h">' + esc(L.h) + '</h2><ul class="intel-live-list">' + d.items.map(function (i) {
        return '<li><a href="' + esc(i.page.replace(/^https:\/\/(www\.)?madeinegyptgate\.com/, "")) + '">' + esc(i.title) + '</a><span class="intel-live-m">' + esc([i.entity, i.market_name, i.deadline ? L.dl + " " + day(i.deadline) : "", i.source && i.source.name ? L.src + ": " + i.source.name : ""].filter(Boolean).join(" · ")) + "</span></li>";
      }).join("") + '</ul><p class="intel-live-f">' + (d.updated_at ? esc(L.upd) + ": " + esc(new Date(d.updated_at).toLocaleString(en ? "en-GB" : "ar-EG", { timeZone: "Africa/Cairo", dateStyle: "medium", timeStyle: "short" })) + " · " : "") + '<a href="' + hub + '">' + esc(L.all) + " ›</a></p></section>";
      box.hidden = false;
    }).catch(function () {});
  });
})();
