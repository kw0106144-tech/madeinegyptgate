/* 3D-style interactive map of Egypt's industrial cities, industrial areas, free zones, investment zones, ports and tech parks.
   Needs data/world.js (WORLD, country "818" = Egypt, Natural Earth outlines) and data/zones.js (MIGZONES).
   The Nile, its Delta branches, Lake Nasser and the Suez Canal are drawn as a stylized overlay (approximate traces).
   Two views: the whole of Egypt, and a zoom on the Delta, Greater Cairo and the Suez Canal where most industry sits.
   Usage: MIGSAMap.mount(element, { bubbles: [{ name, lat, lon, count }], onBubble: fn, view: "full" | "delta" }) */
(function () {
  var TYPES = {
    industrial_city: ["مدن صناعية", "#C8102E"],
    industrial_area: ["مناطق صناعية", "#B7621B"],
    free_zone: ["مناطق حرة", "#1F7FB8"],
    economic_zone: ["المنطقة الاقتصادية لقناة السويس", "#8E0B20"],
    investment_zone: ["مناطق استثمارية", "#2F855A"],
    port_zone: ["موانئ ومناطق لوجستية", "#7A4FB5"],
    tech_park: ["مجمعات تقنية وعلمية", "#0E9AA7"],
    other: ["مواقع أخرى", "#64748B"]
  };
  /* governorate label anchors [lon, lat, view]: 0 = whole-Egypt view, 1 = Delta / Cairo / Canal view */
  var REG_LBL = {
    MTR: [27.2, 30.2, 0], WAD: [28.6, 25.1, 0], BBA: [34.0, 25.6, 0], NSN: [33.7, 30.6, 0], JSN: [33.8, 28.75, 0],
    ASN: [32.2, 23.1, 0], MNY: [29.9, 28.25, 0], AST: [30.45, 27.35, 0], SHG: [31.0, 26.25, 0], GIZ: [29.3, 28.95, 0],
    FYM: [30.35, 29.45, 0], BNS: [31.65, 28.95, 0],
    ALX: [29.62, 31.0, 1], BHR: [30.3, 30.72, 1], KFS: [30.88, 31.33, 1], GHR: [31.02, 30.86, 1], MNF: [30.92, 30.52, 1],
    QLB: [31.32, 30.36, 1], DKH: [31.6, 31.08, 1], DMT: [31.95, 31.33, 1], SHR: [31.82, 30.62, 1], PTS: [32.55, 31.08, 1],
    ISM: [32.02, 30.48, 1], SUZ: [32.45, 29.83, 1], CAI: [31.55, 30.0, 1], GIZ_: [30.4, 29.82, 1], FYM_: [30.62, 29.33, 1],
    BNS_: [31.25, 29.05, 1], NSN_: [33.45, 30.85, 1], JSN_: [33.35, 29.2, 1], MTR_: [29.15, 30.25, 1]
  };
  /* neighbouring countries drawn for context (Natural Earth ISO numeric ids): Libya, Sudan, Israel, Palestine, Jordan, Saudi Arabia */
  var NEI = ["434", "729", "376", "275", "400", "682"];
  /* stylized water features [lon, lat] (approximate traces through the towns on their banks) */
  var NILE = [[32.88, 23.97], [32.89, 24.09], [32.93, 24.47], [32.87, 24.98], [32.55, 25.3], [32.64, 25.7], [32.72, 26.05], [32.62, 26.17], [32.25, 26.08], [31.9, 26.32], [31.69, 26.56], [31.45, 26.85], [31.18, 27.18], [30.95, 27.6], [30.75, 28.1], [30.85, 28.6], [31.1, 29.07], [31.25, 29.55], [31.23, 30.04], [31.13, 30.18]];
  var ROSETTA = [[31.13, 30.18], [30.95, 30.45], [30.82, 30.82], [30.72, 31.05], [30.47, 31.25], [30.42, 31.4], [30.37, 31.47]];
  var DAMIETTA = [[31.13, 30.18], [31.18, 30.47], [31.25, 30.72], [31.38, 31.04], [31.55, 31.2], [31.81, 31.42], [31.84, 31.52]];
  var NASSER = [[31.3, 21.6], [31.45, 22.0], [31.62, 22.3], [31.95, 22.6], [32.3, 22.9], [32.65, 23.3], [32.85, 23.7], [32.88, 23.97]];
  var CANAL = [[32.31, 31.27], [32.32, 30.92], [32.3, 30.6], [32.37, 30.4], [32.46, 30.27], [32.55, 29.95]];
  var DELTA = [[31.15, 30.1], [30.7, 30.5], [30.3, 30.85], [30.05, 31.2], [30.4, 31.47], [30.9, 31.6], [31.4, 31.55], [31.9, 31.42], [32.08, 31.12], [31.78, 30.7], [31.45, 30.33]];
  var VIEWS = {
    full: { box: [24.0, 21.5, 37.3, 32.25], lbl: 0, ph: 0.6, grid: 1, w: 1, name: "مصر كاملة" },
    delta: { box: [28.7, 28.95, 34.0, 31.85], lbl: 1, ph: 1, grid: 0.5, w: 1.9, name: "الدلتا والقاهرة والقناة" }
  };
  var CSS = ''
    + '.samap{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:14px;align-items:stretch}'
    + '.samap .sm-stage{position:relative;border-radius:18px;overflow:hidden;background:radial-gradient(ellipse at 50% 30%,#0f3d63 0%,#0a2740 60%,#071b2c 100%);min-height:420px;perspective:1400px;border:1px solid rgba(192,147,0,.35)}'
    + '.samap .sm-tilt{position:absolute;inset:0;transform-style:preserve-3d;transition:transform .25s ease-out}'
    + '.samap svg{width:100%;height:100%;display:block}'
    + '.samap .sm-bar{position:absolute;top:12px;inset-inline:12px;z-index:3;display:flex;gap:6px;flex-wrap:wrap}'
    + '.samap .sm-bar button,.samap .sm-zoom button{font:inherit;font-size:.78rem;font-weight:700;border:1px solid rgba(255,255,255,.25);background:rgba(7,27,44,.6);color:#fff;border-radius:99px;padding:4px 12px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;backdrop-filter:blur(4px)}'
    + '.samap .sm-bar button i{width:9px;height:9px;border-radius:50%;display:inline-block}'
    + '.samap .sm-bar button.on,.samap .sm-zoom button.on{background:#fff;color:#8E0B20;border-color:#fff}'
    + '.samap .sm-zoom{position:absolute;bottom:10px;inset-inline-end:12px;z-index:3;display:flex;gap:6px}'
    + '.samap .sm-tip{position:absolute;z-index:4;pointer-events:none;background:#fff;color:#0F172A;border-radius:10px;padding:6px 10px;font-size:.78rem;font-weight:700;box-shadow:0 10px 24px rgba(0,0,0,.35);transform:translate(50%,-120%);white-space:nowrap;opacity:0;transition:opacity .15s}'
    + '.samap .sm-tip small{display:block;font-weight:600;color:#64748B}'
    + '.samap .sm-count{position:absolute;bottom:14px;inset-inline-start:12px;z-index:3;color:rgba(255,255,255,.75);font-size:.74rem}'
    + '.samap .sm-side{display:flex;flex-direction:column;gap:10px;min-width:0}'
    + '.samap .sm-card{background:var(--surface,#fff);border:1px solid var(--line,#E2E8F0);border-radius:16px;padding:14px;display:flex;flex-direction:column;gap:6px;border-top:4px solid #C8102E}'
    + '.samap .sm-card h4{margin:0;font-size:1rem;line-height:1.45}'
    + '.samap .sm-card .k{font-size:.72rem;font-weight:800;color:#64748B}'
    + '.samap .sm-card p{margin:0;font-size:.82rem;color:var(--muted,#64748B)}'
    + '.samap .sm-card .tags{display:flex;gap:4px;flex-wrap:wrap}.samap .sm-card .tags span{font-size:.72rem;background:var(--green-soft,#FDEEEF);color:var(--green,#C8102E);border-radius:99px;padding:1px 8px;font-weight:700}'
    + '.samap .sm-card .acts{display:flex;gap:6px;flex-wrap:wrap;margin-top:4px}.samap .sm-card .acts a{font-size:.78rem;font-weight:700}'
    + '.samap .sm-list{flex:1;min-height:0;max-height:300px;overflow:auto;background:var(--surface,#fff);border:1px solid var(--line,#E2E8F0);border-radius:16px;padding:6px}'
    + '.samap .sm-list a{width:100%;text-align:start;font:inherit;font-size:.8rem;border:0;background:transparent;border-radius:8px;padding:6px 8px;cursor:pointer;text-decoration:none;display:grid;grid-template-columns:10px 1fr auto;gap:8px;align-items:center;color:var(--fg,#0F172A)}'
    + '.samap .sm-list a:hover,.samap .sm-list a.on{background:var(--sunken,#F1F5F9)}'
    + '.samap .sm-list a i{width:10px;height:10px;border-radius:50%}.samap .sm-list a small{color:#94A3B8;font-size:.7rem}'
    + '.samap .pin{cursor:pointer}.samap .pin .ring{transform-box:fill-box;transform-origin:center;animation:smpulse 2.4s ease-out infinite}'
    + '.samap .pin .head{stroke:rgba(40,20,4,.45);stroke-width:1}.samap .pin.sel .head{stroke:#fff;stroke-width:3}.samap .pin:hover .head{stroke:#fff;stroke-width:2}'
    + '@keyframes smpulse{0%{transform:scale(.4);opacity:.9}100%{transform:scale(2.4);opacity:0}}'
    + '.samap .rise{animation:smrise 1.1s cubic-bezier(.2,.8,.2,1) both}@keyframes smrise{from{transform:translateY(26px);opacity:0}to{transform:none;opacity:1}}'
    + '@media (max-width:900px){.samap{grid-template-columns:1fr}.samap .sm-stage{min-height:340px}.samap .sm-list{max-height:220px}.samap .sm-bar{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none}.samap .sm-bar::-webkit-scrollbar{display:none}.samap .sm-bar button{flex:none}.samap .sm-tilt{top:34px}}'
    + '@media (max-width:600px){.samap .sm-count{bottom:auto;top:46px}.samap .sm-zoom button{font-size:.72rem;padding:3px 10px}}'
    + '@media (prefers-reduced-motion:reduce){.samap .pin .ring,.samap .rise{animation:none}}';
  var UID = 0;
  function inject() { if (document.getElementById("samap-css")) return; var s = document.createElement("style"); s.id = "samap-css"; s.textContent = CSS; document.head.appendChild(s); }
  function merc(lat) { var r = lat * Math.PI / 180; return Math.log(Math.tan(Math.PI / 4 + r / 2)); }
  function feat(id) { for (var i = 0; i < WORLD.length; i++) if (WORLD[i].id === id) return WORLD[i]; return null; }

  function mount(root, opts) {
    opts = opts || {};
    if (!root || !window.WORLD || !window.MIGZONES) return;
    var eg = feat("818"); if (!eg) return;
    inject();
    var id = "sm" + (++UID);
    var W = 1000, H = 640, TILT = 0.7, THICK = 14;
    var view = VIEWS[opts.view] ? opts.view : "full", V, x0, x1, y0, y1, S, OX, OY, MH;
    function setView(k) {
      view = k; V = VIEWS[k];
      x0 = V.box[0]; x1 = V.box[2]; y0 = merc(V.box[1]); y1 = merc(V.box[3]);
      var lw = (x1 - x0) * Math.PI / 180, lh = (y1 - y0) * TILT;
      S = Math.min(W * 0.96 / lw, (H - 70) / lh);
      OX = (W - lw * S) / 2; MH = lh * S; OY = 30 + ((H - 70) - MH) / 2;
    }
    /* equal-scale Mercator, squashed vertically and narrowed towards the far (north) edge for a tilted-board look */
    function P(lon, lat) {
      var px = (lon - x0) * Math.PI / 180 * S, py = (y1 - merc(lat)) * TILT * S;
      var persp = 0.9 + 0.1 * (py / MH);
      return [W / 2 + (OX + px - W / 2) * persp, OY + py];
    }
    function path(f) {
      var d = "";
      f.c.forEach(function (poly) { poly.forEach(function (ring) { ring.forEach(function (pt, i) { var p = P(pt[0], pt[1]); d += (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1); }); d += "Z"; }); });
      return d;
    }
    function line(a, close) { return a.map(function (pt, i) { var p = P(pt[0], pt[1]); return (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1); }).join("") + (close ? "Z" : ""); }
    function inBox(lon, lat) { return lon >= V.box[0] && lon <= V.box[2] && lat >= V.box[1] && lat <= V.box[3]; }
    function geo() {
      var egD = path(eg);
      var nei = NEI.map(function (n) { var f = feat(n); return f ? '<path d="' + path(f) + '" fill="#123a5a" stroke="#2c5a80" stroke-width=".8"/>' : ""; }).join("");
      var ext = ""; for (var k = THICK; k >= 1; k--) { var c = Math.round(20 + (THICK - k) * 1.6); ext += '<path d="' + egD + '" transform="translate(0 ' + k + ')" fill="rgb(' + (70 + c * 1.6 | 0) + ',' + (40 + c * 0.9 | 0) + ',' + (14 + c * 0.3 | 0) + ')"/>'; }
      var grid = "", g = V.grid, gx, gy;
      for (gx = Math.ceil(V.box[0] / g) * g; gx <= V.box[2]; gx += g) { var a = P(gx, V.box[1]), b = P(gx, V.box[3]); grid += '<line x1="' + a[0] + '" y1="' + a[1] + '" x2="' + b[0] + '" y2="' + b[1] + '"/>'; }
      for (gy = Math.ceil(V.box[1] / g) * g; gy <= V.box[3]; gy += g) { var c1 = P(V.box[0], gy), c2 = P(V.box[2], gy); grid += '<line x1="' + c1[0] + '" y1="' + c1[1] + '" x2="' + c2[0] + '" y2="' + c2[1] + '"/>'; }
      var w = V.w;
      var water = '<path d="' + line(DELTA, true) + '" fill="rgba(74,140,74,.38)"/>'
        + '<path d="' + line(NILE) + '" fill="none" stroke="rgba(74,140,74,.42)" stroke-width="' + (9 * w) + '" stroke-linejoin="round" stroke-linecap="round"/>'
        + '<path d="' + line(NASSER) + '" fill="none" stroke="#5FB7E5" stroke-width="' + (6 * w) + '" stroke-linejoin="round" stroke-linecap="round"/>'
        + [NILE, ROSETTA, DAMIETTA].map(function (l) { return '<path d="' + line(l) + '" fill="none" stroke="#3E9FD8" stroke-width="' + (2 * w) + '" stroke-linejoin="round" stroke-linecap="round"/>'; }).join("")
        + '<path d="' + line(CANAL) + '" fill="none" stroke="#3E9FD8" stroke-width="' + (1.8 * w) + '" stroke-dasharray="' + (4 * w) + ' ' + (2 * w) + '"/>';
      var txt = function (lon, lat, s, size, fill, extra) { var p = P(lon, lat); return '<text x="' + p[0].toFixed(1) + '" y="' + p[1].toFixed(1) + '" text-anchor="middle" font-size="' + size + '" font-weight="700" fill="' + fill + '" style="paint-order:stroke" ' + (extra || "") + '>' + s + '</text>'; };
      var halo = 'stroke="rgba(255,246,226,.75)" stroke-width="3"';
      var labels = Object.keys(REG_LBL).filter(function (k) { return REG_LBL[k][2] === V.lbl; }).map(function (k) {
        var code = k.replace("_", ""), L = REG_LBL[k], nm = window.MIGREG ? MIGREG.name(code) : code;
        return '<a href="region.html#' + code + '">' + txt(L[0], L[1], nm, V.lbl ? 12 : 13, "rgba(70,38,8,.72)", halo) + '</a>';
      }).join("");
      var sea = txt(view === "full" ? 28.6 : 30.2, view === "full" ? 31.95 : 31.72, "البحر المتوسط", 14, "rgba(160,205,235,.7)", 'font-style="italic"')
        + (view === "full" ? txt(35.9, 24.4, "البحر الأحمر", 13, "rgba(160,205,235,.7)", 'font-style="italic"') : "");
      var rivers = view === "full" ? txt(30.45, 26.95, "نهر النيل", 11, "#1E6FA8", halo) + txt(31.85, 22.75, "بحيرة ناصر", 11, "#1E6FA8", halo)
        : txt(32.75, 30.42, "قناة السويس", 11, "#1E6FA8", halo) + txt(30.8, 29.55, "نهر النيل", 11, "#1E6FA8", halo);
      return '<defs><linearGradient id="' + id + 'Top" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F3E3BF"/><stop offset="1" stop-color="#DDBF86"/></linearGradient><clipPath id="' + id + 'Clip"><path d="' + egD + '"/></clipPath><filter id="' + id + 'Glow"><feGaussianBlur stdDeviation="6"/></filter></defs>'
        + '<g opacity=".9">' + nei + '</g>' + sea
        + '<path d="' + egD + '" transform="translate(0 ' + (THICK + 10) + ')" fill="#000" opacity=".35" filter="url(#' + id + 'Glow)"/>'
        + '<g class="rise">' + ext + '<path d="' + egD + '" fill="url(#' + id + 'Top)" stroke="#8E0B20" stroke-width="1.6"/>'
        + '<g clip-path="url(#' + id + 'Clip)"><g stroke="rgba(120,80,30,.13)" stroke-width="1">' + grid + '</g>' + water
        + (window.EGADM ? '<g class="adm" fill="none" stroke="rgba(110,62,18,.42)" stroke-width="' + (view === "full" ? 0.9 : 1.1) + '" stroke-linejoin="round">' + EGADM.map(function (g) { return g[1].map(function (r) { var a = []; for (var i = 0; i < r.length; i += 2) a.push([r[i], r[i + 1]]); return '<path d="' + line(a, true) + '"/>'; }).join(""); }).join("") + '</g>' : '') + '</g>'
        + rivers + labels + (view === "full" ? (function () { var d = function (lon, lat) { var p = P(lon, lat); return '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="3.6" fill="#C8102E" stroke="#fff" stroke-width="1.4"/>'; };
            return '<g class="hls">' + txt(34.75, 22.3, "مثلث حلايب وشلاتين", 10.5, "rgba(70,38,8,.62)", halo) + d(36.64, 22.22) + txt(36.22, 22.2, "حلايب", 12, "#7a0c1c", halo) + d(35.59, 23.13) + txt(35.12, 23.2, "شلاتين", 12, "#7a0c1c", halo) + d(35.47, 22.6) + txt(35.0, 22.7, "أبو رماد", 10.5, "#7a0c1c", halo) + '</g>'; })() : "") + '<g class="bubs"></g><g class="pins"></g></g>';
    }
    setView(view);
    var Z = MIGZONES.filter(function (z) { return z.lat && z.lon; });
    root.innerHTML = '<div class="samap"><div class="sm-stage"><div class="sm-bar"></div><div class="sm-tilt"><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="خريطة المناطق الصناعية والحرة والموانئ في جمهورية مصر العربية"></svg></div><div class="sm-tip"></div><span class="sm-count"></span>'
      + '<div class="sm-zoom">' + Object.keys(VIEWS).map(function (k) { return '<button type="button" data-v="' + k + '"' + (k === view ? ' class="on"' : '') + '>' + VIEWS[k].name + '</button>'; }).join("") + '</div></div>'
      + '<div class="sm-side"><div class="sm-card"></div><div class="sm-list"></div></div></div>';
    var svg = root.querySelector("svg"), st = root.querySelector(".sm-stage"), tilt = root.querySelector(".sm-tilt"), tip = root.querySelector(".sm-tip"), card = root.querySelector(".sm-card"), list = root.querySelector(".sm-list"), bar = root.querySelector(".sm-bar"), cnt = root.querySelector(".sm-count"), zoom = root.querySelector(".sm-zoom"), pins, bubs;
    var BB = opts.bubbles || [], bmax = Math.max.apply(null, BB.map(function (b) { return b.count; }).concat([1]));
    function drawBubs() {
      bubs.innerHTML = BB.filter(function (b) { return b.count > 0 && b.lat; }).map(function (b, i) { var p = P(b.lon, b.lat), r = (7 + Math.sqrt(b.count / bmax) * 24) * (view === "full" ? 0.8 : 1); return '<g class="bub" data-b="' + BB.indexOf(b) + '" style="cursor:pointer;animation:smrise .6s ease ' + (0.3 + i * 0.02) + 's both"><circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="' + r.toFixed(1) + '" fill="rgba(200,16,46,.28)" stroke="#C8102E" stroke-width="1.5"/><text x="' + p[0].toFixed(1) + '" y="' + (p[1] + 4).toFixed(1) + '" text-anchor="middle" font-size="' + (r > 14 ? 12 : 9) + '" font-weight="800" fill="#fff" style="paint-order:stroke" stroke="rgba(90,8,20,.8)" stroke-width="3">' + b.count + '</text></g>'; }).join("");
    }
    function render() { svg.innerHTML = geo(); pins = svg.querySelector(".pins"); bubs = svg.querySelector(".bubs"); if (BB.length) drawBubs(); drawPins(); }
    var used = {}; Z.forEach(function (z) { used[z.type in TYPES ? z.type : "other"] = 1; });
    var filt = "";
    bar.innerHTML = '<button type="button" class="on" data-t="">الكل</button>' + Object.keys(TYPES).filter(function (t) { return used[t]; }).map(function (t) { return '<button type="button" data-t="' + t + '"><i style="background:' + TYPES[t][1] + '"></i>' + TYPES[t][0] + '</button>'; }).join("");
    function ty(z) { return TYPES[z.type] ? z.type : "other"; }
    function vis() { return Z.filter(function (z) { return !filt || ty(z) === filt; }).sort(function (a, b) { return b.lat - a.lat; }); }
    var sel = null;
    function drawPins() {
      var l = vis(), f = V.ph;
      pins.innerHTML = l.map(function (z, i) {
        var p = P(z.lon, z.lat), t = ty(z), col = TYPES[t][1], h = (t === "industrial_city" || t === "economic_zone" ? 40 : t === "free_zone" ? 34 : t === "port_zone" || t === "tech_park" || t === "investment_zone" ? 30 : 24) * f, hr = (t === "industrial_area" || t === "other" ? 6 : 7) * (f < 1 ? 0.8 : 1);
        return '<g class="pin' + (z === sel ? " sel" : "") + '" data-i="' + Z.indexOf(z) + '" style="animation:smrise .6s ease ' + (0.4 + i * 0.03) + 's both"><ellipse cx="' + p[0] + '" cy="' + p[1] + '" rx="' + (9 * f) + '" ry="' + (4 * f) + '" fill="rgba(0,0,0,.3)"/><ellipse class="ring" cx="' + p[0] + '" cy="' + p[1] + '" rx="' + (8 * f) + '" ry="' + (3.6 * f) + '" fill="none" stroke="' + col + '" stroke-width="2"/><line x1="' + p[0] + '" y1="' + p[1] + '" x2="' + p[0] + '" y2="' + (p[1] - h) + '" stroke="' + col + '" stroke-width="' + (f < 1 ? 1.8 : 2.4) + '"/><circle class="head" cx="' + p[0] + '" cy="' + (p[1] - h) + '" r="' + hr + '" fill="' + col + '"/><circle cx="' + (p[0] - 2) + '" cy="' + (p[1] - h - 2) + '" r="' + (2 * (f < 1 ? 0.8 : 1)) + '" fill="rgba(255,255,255,.7)"/></g>';
      }).join("");
      cnt.textContent = l.length + " موقعاً على الخريطة · المواقع تقريبية";
      list.innerHTML = l.map(function (z) { return '<a href="city.html#' + z.id + '" data-i="' + Z.indexOf(z) + '"' + (z === sel ? ' class="on"' : '') + '><i style="background:' + TYPES[ty(z)][1] + '"></i><span>' + z.name_ar + '</span><small>' + (window.MIGREG ? MIGREG.name(z.region_code) : z.city || "") + '</small></a>'; }).join("");
    }
    function go(k) { if (k === view || !VIEWS[k]) return; setView(k); [].forEach.call(zoom.children, function (x) { x.classList.toggle("on", x.dataset.v === k); }); render(); }
    function show(z) {
      sel = z; var t = ty(z);
      card.style.borderTopColor = TYPES[t][1];
      card.innerHTML = '<span class="k">' + TYPES[t][0] + (z.status_ar ? ' · ' + status(z.status_ar) : '') + '</span><h4>' + z.name_ar + '</h4><p>📍 ' + (z.city || "") + (window.MIGREG && z.region_code ? ' · محافظة ' + MIGREG.name(z.region_code) : '') + (z.area_text ? ' · ' + z.area_text : '') + '</p>' + (z.focus_sectors_ar && z.focus_sectors_ar.length ? '<div class="tags">' + z.focus_sectors_ar.map(function (s) { return '<span>' + s + '</span>'; }).join("") + '</div>' : '') + '<div class="acts"><a href="city.html#' + z.id + '" style="font-weight:800">صفحة المدينة: الفرص والمصانع والمنتجات ←</a>' + (z.region_code ? '<a href="region.html#' + z.region_code + '">صفحة المحافظة ←</a>' : '') + '<a href="factories.html" data-city="' + (z.city || z.name_ar) + '">مصانع المنطقة ←</a>' + (z.source_url ? '<a href="' + z.source_url + '" target="_blank" rel="noopener">المصدر ↗</a>' : '') + '</div>';
      if (!inBox(z.lon, z.lat)) go("full");
      drawPins();
    }
    function intro() { card.style.borderTopColor = "#C8102E"; card.innerHTML = '<span class="k">خريطة تفاعلية</span><h4>المناطق الصناعية والحرة والموانئ</h4><p>' + Z.length + ' موقعاً في محافظات مصر. اضغط على أي دبوس أو اختر من القائمة لعرض تفاصيله، واختر «' + VIEWS.delta.name + '» لتكبير منطقة التركز الصناعي حول النيل والدلتا.</p><div class="tags">' + Object.keys(TYPES).filter(function (t) { return used[t]; }).map(function (t) { return '<span style="background:' + TYPES[t][1] + '22;color:' + TYPES[t][1] + '">' + TYPES[t][0] + ' (' + Z.filter(function (z) { return ty(z) === t; }).length + ')</span>'; }).join("") + '</div>'; }
    bar.addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; filt = b.dataset.t; [].forEach.call(bar.children, function (x) { x.classList.toggle("on", x === b); }); if (sel && filt && ty(sel) !== filt) { sel = null; intro(); } drawPins(); });
    zoom.addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) go(b.dataset.v); });
    svg.addEventListener("click", function (e) { var g = e.target.closest(".pin"); if (g) { show(Z[+g.dataset.i]); return; } var u = e.target.closest(".bub"); if (u && opts.onBubble) opts.onBubble(BB[+u.dataset.b]); });
    list.addEventListener("mouseover", function (e) { var b = e.target.closest("a[data-i]"); if (b && Z[+b.dataset.i] !== sel) show(Z[+b.dataset.i]); });
    root.addEventListener("click", function (e) { var a = e.target.closest("[data-city]"); if (a) { try { sessionStorage.setItem("mig-city", a.dataset.city); } catch (x) {} } });
    function tipAt(e, html) { var r = st.getBoundingClientRect(); tip.innerHTML = html; tip.style.right = (r.right - e.clientX) + "px"; tip.style.top = (e.clientY - r.top) + "px"; tip.style.left = "auto"; tip.style.transform = "translate(50%,-120%)"; tip.style.opacity = 1; }
    svg.addEventListener("mousemove", function (e) {
      var g = e.target.closest(".pin"); if (g) { var z = Z[+g.dataset.i]; tipAt(e, z.name_ar + '<small>' + TYPES[ty(z)][0] + '</small>'); return; }
      var u = e.target.closest(".bub"); if (u) { var b = BB[+u.dataset.b]; tipAt(e, b.name + '<small>' + b.count + ' فرصة ومشروع</small>'); return; }
      tip.style.opacity = 0;
    });
    svg.addEventListener("mouseleave", function () { tip.style.opacity = 0; });
    var red = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!red) {
      st.addEventListener("mousemove", function (e) { var r = st.getBoundingClientRect(), dx = (e.clientX - r.left) / r.width - .5, dy = (e.clientY - r.top) / r.height - .5; tilt.style.transform = "rotateX(" + (8 - dy * 8) + "deg) rotateY(" + (dx * 8) + "deg)"; });
      st.addEventListener("mouseleave", function () { tilt.style.transform = "rotateX(8deg)"; });
      tilt.style.transform = "rotateX(8deg)";
    }
    intro(); render();
  }
  /* zone status in English: the generic dictionary maps "قائمة" to "Menu", so translate the status words here */
  var STEN = { "قائمة": "Operational", "قائم ويعمل": "Operational", "قائمة وتعمل": "Operational", "قائمة وتتوسع": "Operational, expanding", "قائمة وقيد التطوير": "Operational, under development", "قيد التطوير": "Under development", "مخططة": "Planned", "تتوفر بعض القطع الشاغرة": "some vacant plots available", "تتوفر قطع شاغرة": "vacant plots available", "قطع شاغرة في موقع عتاقة": "vacant plots at the Ataqa site", "مراحل جديدة قيد الترفيق": "new phases being serviced", "مشغولة بالكامل": "fully occupied", "مستهدف التشغيل بنهاية 2026": "targeted to start operating by end of 2026" };
  function status(x) { x = String(x || ""); if (window.MIGLANG !== "en") return x; return x.split(" – ").map(function (p) { return STEN[p] || (window.MIGTR ? MIGTR(p) : p); }).join(" – "); }
  window.MIGSAMap = { mount: mount, types: TYPES, status: status };
  window.MIGSAMap.show = null;
})();
