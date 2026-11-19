/* Shared export map renderer (Natural Earth outlines from data/world.js). Usage: MIGMap.start(canvas, marketIndex) */
(function () {
  var HUB = { alex: [29.88, 31.18, "الإسكندرية"], damietta: [31.76, 31.47, "دمياط"], portsaid: [32.33, 31.25, "شرق بورسعيد"], sokhna: [32.36, 29.60, "العين السخنة"], cairo: [31.24, 30.04, "القاهرة"] };
  var DEST = [
    { o: ["cairo", "alex"], d: [[31.74, 30.30, "العاشر من رمضان"], [31.18, 27.18, "أسيوط"], [32.90, 24.09, "أسوان"], [27.24, 31.35, "مرسى مطروح"], [33.81, 27.26, "الغردقة"]], box: [24.5, 21.6, 37.2, 32.2], hl: ["818"] },
    { o: ["sokhna"], d: [[39.17, 21.54, "جدة"], [46.72, 24.69, "الرياض"], [47.98, 29.37, "الكويت"], [51.53, 25.29, "الدوحة"], [58.41, 23.59, "مسقط"], [35.93, 31.95, "عمّان"]], box: [27, 14, 62, 33], hl: ["682", "414", "634", "512", "048", "784", "400"] },
    { o: ["sokhna", "alex"], d: [[37.22, 19.62, "بورتسودان"], [43.15, 11.59, "جيبوتي"], [39.67, -4.04, "مومباسا"], [39.27, -6.80, "دار السلام"], [13.18, 32.89, "طرابلس"]], box: [8, -12, 52, 36], hl: ["729", "262", "404", "834", "434"] },
    { o: ["sokhna", "portsaid"], d: [[121.47, 31.23, "شنغهاي"], [72.88, 19.08, "مومباي"], [34.64, 36.80, "مرسين"], [106.70, 10.78, "هو تشي منه"], [101.69, 3.14, "كوالالمبور"]], box: [26, -2, 124, 40], hl: ["156", "356", "792", "704", "458"] },
    { o: ["alex", "damietta"], d: [[4.48, 51.92, "روتردام"], [8.93, 44.41, "جنوة"], [2.17, 41.39, "برشلونة"], [23.65, 37.94, "بيرايوس"], [9.99, 53.55, "هامبورغ"]], box: [-6, 22, 40, 56], hl: ["528", "380", "724", "300", "276"] }
  ];
  var GCC = { "682": 1, "634": 1, "414": 1, "512": 1, "048": 1, "784": 1 };
  function merc(lat) { return Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)); }
  window.MIGMap = { DEST: DEST, start: function (cv, sel) {
    var reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    var x, W, H, base, baseKey = "", view = DEST[sel].box.slice(), t = 0, run = true;
    function proj(lon, lat) { var R = Math.PI / 180, b = view, x0 = b[0] * R, x1 = b[2] * R, y0 = merc(b[1]), y1 = merc(b[3]); var k = Math.min(W / (x1 - x0), H / (y1 - y0)); var ox = (W - (x1 - x0) * k) / 2, oy = (H - (y1 - y0) * k) / 2; return [ox + (lon * R - x0) * k, H - oy - (merc(lat) - y0) * k]; }
    function init() { var r = cv.getBoundingClientRect(), d = window.devicePixelRatio || 1; W = Math.max(r.width, 10); H = Math.max(r.height, 10); cv.width = W * d; cv.height = H * d; x = cv.getContext("2d"); base = document.createElement("canvas"); base.width = cv.width; base.height = cv.height; baseKey = ""; }
    function drawBase() {
      var key = W + "x" + H; if (key === baseKey) return; baseKey = key;
      var d = window.devicePixelRatio || 1, b = base.getContext("2d"); b.setTransform(d, 0, 0, d, 0, 0);
      var g = b.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#06263F"); g.addColorStop(1, "#04182A"); b.fillStyle = g; b.fillRect(0, 0, W, H);
      b.strokeStyle = "rgba(255,255,255,.05)"; b.lineWidth = 1;
      for (var lo = -20; lo <= 130; lo += 10) { var a1 = proj(lo, -20), a2 = proj(lo, 65); b.beginPath(); b.moveTo(a1[0], a1[1]); b.lineTo(a2[0], a2[1]); b.stroke(); }
      for (var la = -10; la <= 60; la += 10) { var c1 = proj(-20, la), c2 = proj(130, la); b.beginPath(); b.moveTo(c1[0], c1[1]); b.lineTo(c2[0], c2[1]); b.stroke(); }
      var hl = {}; DEST[sel].hl.forEach(function (h) { hl[h] = 1; });
      (window.WORLD || []).forEach(function (c) {
        var sa = c.id === "818", on = hl[c.id] && !sa; b.beginPath();
        c.c.forEach(function (poly) { poly.forEach(function (ring) { ring.forEach(function (pt, k) { var q = proj(pt[0], pt[1]); k ? b.lineTo(q[0], q[1]) : b.moveTo(q[0], q[1]); }); b.closePath(); }); });
        b.fillStyle = sa ? "#C8102E" : on ? "rgba(192,147,0,.55)" : GCC[c.id] ? "#1E5A3A" : "#16362A"; b.fill("evenodd");
        b.strokeStyle = sa ? "#E2BE72" : "rgba(255,255,255,.22)"; b.lineWidth = sa ? 1.6 : .6; b.stroke();
      });
      var lf = Math.max(12, Math.min(20, W / 40)), hb = HUB[DEST[sel].o[0]], sl = proj(sel ? hb[0] : 28.6, sel ? hb[1] : 26.2); if (sel) sl[1] += 20 + lf + 8; var cn = sel ? "مصر" : "جمهورية مصر العربية"; if (window.MIGTR) cn = MIGTR(cn); b.font = "800 " + lf + "px Cairo, sans-serif"; var cw = Math.max(60, b.measureText(cn).width / 2 + 10); sl[0] = Math.max(cw, Math.min(W - cw, sl[0])); b.textAlign = "center"; b.fillStyle = "rgba(255,255,255,.9)"; b.fillText(cn, sl[0], sl[1]);
    }
    function frame() {
      t += .006; drawBase(); x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, cv.width, cv.height); x.drawImage(base, 0, 0);
      var d = window.devicePixelRatio || 1; x.setTransform(d, 0, 0, d, 0, 0);
      var D = DEST[sel], fs = Math.max(11, Math.min(15, W / 55));
      D.d.forEach(function (dst, i) {
        var oh = HUB[D.o[i % D.o.length]], a = proj(oh[0], oh[1]), c = proj(dst[0], dst[1]);
        var mx = (a[0] + c[0]) / 2, my = (a[1] + c[1]) / 2, dx = c[0] - a[0], dy = c[1] - a[1], L = Math.sqrt(dx * dx + dy * dy), m = [mx - dy * .22, my + dx * .22 - L * .08];
        x.beginPath(); x.moveTo(a[0], a[1]); x.quadraticCurveTo(m[0], m[1], c[0], c[1]); x.strokeStyle = "rgba(226,190,114,.85)"; x.lineWidth = 2; x.setLineDash([6, 5]); x.lineDashOffset = -t * 60; x.stroke(); x.setLineDash([]);
        for (var k = 0; k < 2; k++) { var u = (t * .9 + k / 2 + i * .13) % 1, px = (1 - u) * (1 - u) * a[0] + 2 * (1 - u) * u * m[0] + u * u * c[0], py = (1 - u) * (1 - u) * a[1] + 2 * (1 - u) * u * m[1] + u * u * c[1]; x.fillStyle = k ? "#3DDC84" : "#E2BE72"; x.fillRect(px - 5, py - 3.5, 10, 7); }
        var pr = (t * 1.8 + i * .2) % 1; x.strokeStyle = "rgba(226,190,114," + (1 - pr) + ")"; x.lineWidth = 2; x.beginPath(); x.arc(c[0], c[1], 5 + pr * 14, 0, 7); x.stroke();
        x.fillStyle = "#E2BE72"; x.beginPath(); x.arc(c[0], c[1], 5, 0, 7); x.fill();
        x.font = "700 " + fs + "px Cairo, sans-serif"; x.textAlign = "center"; x.lineWidth = 3; x.strokeStyle = "rgba(4,24,42,.9)"; x.strokeText(dst[2], c[0], c[1] - 10); x.fillStyle = "#fff"; x.fillText(dst[2], c[0], c[1] - 10);
      });
      var lbl = []; D.o.forEach(function (h) { var q = proj(HUB[h][0], HUB[h][1]); x.fillStyle = "rgba(61,220,132,.3)"; x.beginPath(); x.arc(q[0], q[1], 10 + (Math.sin(t * 8) + 1) * 3, 0, 7); x.fill(); x.fillStyle = "#3DDC84"; x.beginPath(); x.arc(q[0], q[1], 6, 0, 7); x.fill(); if (lbl.some(function (p) { return Math.abs(p[0] - q[0]) < 40 && Math.abs(p[1] - q[1]) < fs + 4; })) return; lbl.push(q); x.font = "800 " + fs + "px Cairo, sans-serif"; x.lineWidth = 3; x.strokeStyle = "rgba(4,24,42,.9)"; x.strokeText(HUB[h][2], q[0], q[1] + 20); x.fillStyle = "#3DDC84"; x.fillText(HUB[h][2], q[0], q[1] + 20); });
      x.font = "600 11px Cairo, sans-serif"; x.textAlign = "start"; x.fillStyle = "rgba(255,255,255,.55)"; x.fillText("المسارات تقريبية · حدود الدول: Natural Earth", 10, H - 10);
    }
    init(); frame();
    if ("IntersectionObserver" in window) new IntersectionObserver(function (e) { run = e[0].isIntersecting; }).observe(cv);
    (function loop() { if (run && !document.hidden && !reduced) frame(); requestAnimationFrame(loop); })();
    var rt; window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(function () { init(); frame(); }, 150); });
  } };
})();
