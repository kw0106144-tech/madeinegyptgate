/* market codes (eg, sa, … africa:<cc>, asia:<cc>, eu, intl) ↔ names AR/EN + flag; country name / ISO2 / ISO3 → market */
const ARAB = { eg: ["مصر", "Egypt", "EGY"], sa: ["السعودية", "Saudi Arabia", "SAU"], ae: ["الإمارات", "UAE", "ARE"], qa: ["قطر", "Qatar", "QAT"], kw: ["الكويت", "Kuwait", "KWT"], om: ["عُمان", "Oman", "OMN"], bh: ["البحرين", "Bahrain", "BHR"], jo: ["الأردن", "Jordan", "JOR"], iq: ["العراق", "Iraq", "IRQ"], ma: ["المغرب", "Morocco", "MAR"], tn: ["تونس", "Tunisia", "TUN"], dz: ["الجزائر", "Algeria", "DZA"], ly: ["ليبيا", "Libya", "LBY"], lb: ["لبنان", "Lebanon", "LBN"], ye: ["اليمن", "Yemen", "YEM"], ps: ["فلسطين", "Palestine", "PSE"], sy: ["سوريا", "Syria", "SYR"], sd: ["السودان", "Sudan", "SDN"], dj: ["جيبوتي", "Djibouti", "DJI"], mr: ["موريتانيا", "Mauritania", "MRT"], so: ["الصومال", "Somalia", "SOM"] };
const AFRICA = { ke: ["كينيا", "Kenya", "KEN"], ng: ["نيجيريا", "Nigeria", "NGA"], et: ["إثيوبيا", "Ethiopia", "ETH"], gh: ["غانا", "Ghana", "GHA"], tz: ["تنزانيا", "Tanzania", "TZA"], ug: ["أوغندا", "Uganda", "UGA"], rw: ["رواندا", "Rwanda", "RWA"], sn: ["السنغال", "Senegal", "SEN"], ci: ["كوت ديفوار", "Côte d'Ivoire", "CIV"], za: ["جنوب أفريقيا", "South Africa", "ZAF"], cm: ["الكاميرون", "Cameroon", "CMR"], ao: ["أنغولا", "Angola", "AGO"], mz: ["موزمبيق", "Mozambique", "MOZ"], zm: ["زامبيا", "Zambia", "ZMB"], mw: ["مالاوي", "Malawi", "MWI"], mg: ["مدغشقر", "Madagascar", "MDG"], cd: ["الكونغو الديمقراطية", "DR Congo", "COD"], ss: ["جنوب السودان", "South Sudan", "SSD"], ml: ["مالي", "Mali", "MLI"], bf: ["بوركينا فاسو", "Burkina Faso", "BFA"], ne: ["النيجر", "Niger", "NER"], td: ["تشاد", "Chad", "TCD"], bj: ["بنين", "Benin", "BEN"], tg: ["توغو", "Togo", "TGO"], zw: ["زيمبابوي", "Zimbabwe", "ZWE"], na: ["ناميبيا", "Namibia", "NAM"], bw: ["بوتسوانا", "Botswana", "BWA"], er: ["إريتريا", "Eritrea", "ERI"], sl: ["سيراليون", "Sierra Leone", "SLE"], lr: ["ليبيريا", "Liberia", "LBR"], gn: ["غينيا", "Guinea", "GIN"], ga: ["الجابون", "Gabon", "GAB"], cg: ["الكونغو", "Congo", "COG"], bi: ["بوروندي", "Burundi", "BDI"], sc: ["سيشل", "Seychelles", "SYC"], mu: ["موريشيوس", "Mauritius", "MUS"], km: ["جزر القمر", "Comoros", "COM"], cv: ["الرأس الأخضر", "Cabo Verde", "CPV"], gm: ["غامبيا", "Gambia", "GMB"], ls: ["ليسوتو", "Lesotho", "LSO"], sz: ["إسواتيني", "Eswatini", "SWZ"], cf: ["أفريقيا الوسطى", "Central African Republic", "CAF"], gq: ["غينيا الاستوائية", "Equatorial Guinea", "GNQ"], gw: ["غينيا بيساو", "Guinea-Bissau", "GNB"], st: ["ساو تومي", "Sao Tome", "STP"] };
const ASIA = { in: ["الهند", "India", "IND"], pk: ["باكستان", "Pakistan", "PAK"], bd: ["بنغلاديش", "Bangladesh", "BGD"], id: ["إندونيسيا", "Indonesia", "IDN"], my: ["ماليزيا", "Malaysia", "MYS"], vn: ["فيتنام", "Vietnam", "VNM"], cn: ["الصين", "China", "CHN"], jp: ["اليابان", "Japan", "JPN"], tr: ["تركيا", "Türkiye", "TUR"], uz: ["أوزبكستان", "Uzbekistan", "UZB"], kz: ["كازاخستان", "Kazakhstan", "KAZ"], ph: ["الفلبين", "Philippines", "PHL"], lk: ["سريلانكا", "Sri Lanka", "LKA"], np: ["نيبال", "Nepal", "NPL"], af: ["أفغانستان", "Afghanistan", "AFG"], mn: ["منغوليا", "Mongolia", "MNG"], kg: ["قيرغيزستان", "Kyrgyzstan", "KGZ"], tj: ["طاجيكستان", "Tajikistan", "TJK"], az: ["أذربيجان", "Azerbaijan", "AZE"], ge: ["جورجيا", "Georgia", "GEO"], am: ["أرمينيا", "Armenia", "ARM"], kh: ["كمبوديا", "Cambodia", "KHM"], la: ["لاوس", "Laos", "LAO"], th: ["تايلاند", "Thailand", "THA"], kr: ["كوريا الجنوبية", "South Korea", "KOR"], mm: ["ميانمار", "Myanmar", "MMR"], ir: ["إيران", "Iran", "IRN"] };
const EU3 = "AUT BEL BGR HRV CYP CZE DNK EST FIN FRA DEU GRC HUN IRL ITA LVA LTU LUX MLT NLD POL PRT ROU SVK SVN ESP SWE NOR ISL CHE GBR LIE".split(" ");
const EXTRA_NAMES = { "egypt, arab republic of": "eg", "yemen, republic of": "ye", "west bank and gaza": "ps", "iraq, republic of": "iq", "congo, democratic republic of": "africa:cd", "congo, democratic republic of the": "africa:cd", "congo, republic of": "africa:cg", "cote d'ivoire": "africa:ci", "côte d'ivoire": "africa:ci", "gambia, the": "africa:gm", "turkiye": "asia:tr", "türkiye": "asia:tr", "turkey": "asia:tr", "kyrgyz republic": "asia:kg", "lao people's democratic republic": "asia:la", "viet nam": "asia:vn", "korea, republic of": "asia:kr", "iran, islamic republic of": "asia:ir", "syrian arab republic": "sy", "united arab emirates": "ae", "kingdom of saudi arabia": "sa", "eswatini": "africa:sz", "cabo verde": "africa:cv", "united kingdom": "eu", "uk": "eu" };

export const MARKETS = {};
for (const [cc, v] of Object.entries(ARAB)) MARKETS[cc] = v;
for (const [cc, v] of Object.entries(AFRICA)) MARKETS["africa:" + cc] = v;
for (const [cc, v] of Object.entries(ASIA)) MARKETS["asia:" + cc] = v;
MARKETS.eu = ["أوروبا", "Europe", ""];
MARKETS.intl = ["دولي", "International", ""];
MARKETS.africa = ["أفريقيا", "Africa", ""];
MARKETS.asia = ["آسيا", "Asia", ""];
MARKETS.gcc = ["الخليج", "GCC", ""];

const LOOKUP = new Map();
for (const [code, [ar, en, iso3]] of Object.entries(MARKETS)) {
  LOOKUP.set(ar, code); LOOKUP.set(en.toLowerCase(), code);
  if (iso3) LOOKUP.set(iso3.toLowerCase(), code);
  const cc = code.includes(":") ? code.split(":")[1] : code.length === 2 ? code : "";
  if (cc) LOOKUP.set(cc, code);
}
for (const i of EU3) LOOKUP.set(i.toLowerCase(), "eu");
for (const [k, v] of Object.entries(EXTRA_NAMES)) LOOKUP.set(k, v);
export function marketFor(country) {
  if (!country) return null;
  const v = Array.isArray(country) ? country[0] : country;
  const k = String(v).trim().toLowerCase();
  return LOOKUP.get(k) || LOOKUP.get(k.replace(/^the\s+/, "")) || null;
}
export const GCC = ["sa", "ae", "qa", "kw", "om", "bh"];
export const ARAB_CODES = Object.keys(ARAB);
export function marketName(code, lang) { const m = MARKETS[code]; return m ? m[lang === "en" ? 1 : 0] : code || ""; }
export function flag(code) {
  const cc = code && (code.includes(":") ? code.split(":")[1] : code.length === 2 ? code : "");
  if (!cc || cc.length !== 2) return code === "eu" ? "🇪🇺" : "🌍";
  return String.fromCodePoint(...[...cc.toUpperCase()].map(c => 0x1f1e6 + c.charCodeAt(0) - 65));
}
/* SQL filter for a market query value: exact code, "africa"/"asia" prefixes, "gcc", "arab" groups
   (items stored with the group code itself — market 'gcc', 'africa', 'asia' — belong to their group) */
export function marketFilter(m) {
  if (!m) return null;
  m = String(m).toLowerCase();
  if (m === "gcc") return { sql: "market IN (" + GCC.concat("gcc").map(c => "'" + c + "'").join(",") + ")", args: [] };
  if (m === "arab") return { sql: "market IN (" + ARAB_CODES.concat("gcc").map(c => "'" + c + "'").join(",") + ")", args: [] };
  if (m === "africa" || m === "asia") return { sql: "(market = ? OR market LIKE ?)", args: [m, m + ":%"] };
  return { sql: "market = ?", args: [m] };
}
/* several market values OR-ed (null when none) */
export function marketsFilter(list) {
  const fs = (list || []).map(marketFilter).filter(Boolean);
  if (fs.length < 2) return fs[0] || null;
  return { sql: "(" + fs.map(f => f.sql).join(" OR ") + ")", args: fs.flatMap(f => f.args) };
}
/* Bassem's plans → the markets a search may widen to (platform plan scope: partner = local + Gulf/Arab + Africa; strategic = all) */
export const PLAN_SCOPE = { partner: ["eg", "gcc", "arab", "africa"], strategic: null };
