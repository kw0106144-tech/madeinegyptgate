/* The site's canonical sectors — copied verbatim from site/data/regions.js `window.MIGSECTORS` (AR, EN pairs, same order).
   test/sectors.test.mjs fails if the site list changes, so re-copy when it does. Keyword lists (AR/EN/FR stems, matched on
   normalised text) and CPV prefixes (EU TED) drive the rule-based classifier used when AI is off, failed or over the cap. */
import { normText } from "./util.js";

export const SECTORS = [["الصناعات الغذائية والمشروبات","Food & Beverage Industries"],["الزراعة والمعدات الزراعية","Agriculture & Farm Equipment"],["الأعلاف والأسمدة والمبيدات","Feed, Fertilizers & Pesticides"],["الكيماويات والبتروكيماويات","Chemicals & Petrochemicals"],["النفط والغاز والخدمات البترولية","Oil, Gas & Petroleum Services"],["المنظفات والصابون","Detergents & Soaps"],["الدهانات والأحبار","Paints & Inks"],["الأدوية والمستلزمات الطبية","Pharmaceuticals & Medical Supplies"],["الأجهزة الطبية والعلمية والمعملية","Medical, Scientific & Lab Equipment"],["الصناعات البلاستيكية والمطاط","Plastics & Rubber"],["التعبئة والتغليف والورق","Packaging & Paper"],["الطباعة والدعاية والإعلان","Printing & Advertising"],["الحديد والصلب والمعادن","Iron, Steel & Metals"],["التعدين والمحاجر","Mining & Quarrying"],["مواد البناء والتشييد","Building & Construction Materials"],["الرخام والجرانيت","Marble & Granite"],["الزجاج والسيراميك","Glass & Ceramics"],["المقاولات والإنشاءات","Contracting & Construction"],["الكهرباء والكابلات والإضاءة","Electrical, Cables & Lighting"],["الأجهزة المنزلية والإلكترونيات","Home Appliances & Electronics"],["تكنولوجيا المعلومات والأجهزة المكتبية","IT & Office Equipment"],["الأمن والسلامة ومكافحة الحريق","Security, Safety & Fire Protection"],["الماكينات والمعدات الصناعية","Industrial Machinery & Equipment"],["العدد والأدوات وأجهزة القياس","Tools, Instruments & Measurement"],["الضواغط والطلمبات والهيدروليك","Compressors, Pumps & Hydraulics"],["قطع الغيار ونقل الحركة","Spare Parts & Power Transmission"],["المعدات الثقيلة والرافعات والمصاعد","Heavy Equipment, Cranes & Elevators"],["التكييف والتبريد والغلايات","HVAC, Refrigeration & Boilers"],["المياه ومعالجتها","Water & Water Treatment"],["السيارات والصناعات المغذية","Automotive & Feeder Industries"],["الغزل والنسيج والملابس الجاهزة","Textiles & Ready-made Garments"],["الأثاث والأخشاب","Furniture & Wood"],["التجهيزات الفندقية ومعدات المطاعم","Hotel & Catering Equipment"],["الأدوات الرياضية والترفيهية","Sports & Leisure Goods"],["الاستشارات والخدمات","Consulting & Services"],["التأمين والخدمات المالية","Insurance & Financial Services"],["النقل والشحن والملاحة","Transport, Shipping & Navigation"],["التوريدات الصناعية العامة","General Industrial Supplies"]];

/* index-aligned with SECTORS: [keywords (AR/EN/FR, any form — normalised at load), CPV prefixes] */
const RULES = [
  ["غذائ اغذيه مشروبات البان لحوم دواجن سكر زيوت طعام دقيق مطاحن قمح عصائر مخبوزات تمور اسماك شاي قهوه food beverage dairy meat poultry sugar flour wheat grain juice bakery coffee tea fish rice aliment denrees boisson viande farine cafe", ["15", "0311", "0312"]],
  ["زراع ري جرارات محاصيل بذور صوب مزارع agricultur irrigation tractor seeds greenhouse farm harvest agricole semences", ["03", "16", "7711"]],
  ["اعلاف اسمده مبيدات سماد بيطري fertili pesticide fodder animal feed veterinary engrais pesticide", ["2440", "2445", "157", "3369"]],
  ["كيماو بتروكيماو ميثانول امونيا بوليمر راتنج كواشف chemical petrochemical methanol ammonia polymer resin reagent chimique reactif", ["24"]],
  ["بترول نفط غاز حفر مصفاه تكرير البتروليه oil gas petroleum drilling refinery pipeline lng upstream offshore fuel diesel petrole gaz carburant", ["09", "76"]],
  ["منظفات صابون مطهرات detergent soap disinfectant cleaning products detergent savon", ["3983", "337119"]],
  ["دهانات طلاء احبار ورنيش paint coating ink varnish peinture encre vernis", ["448", "2261"]],
  ["ادويه دواء مستلزمات طبيه لقاحات محاليل صيدل pharmaceut medicine drug vaccine medical supplies consumable medicament vaccin", ["336", "3314", "3369", "3368"]],
  ["اجهزه طبيه معدات طبيه معمل مختبر مختبرات اشعه مستشفي غسيل كلوي medical equipment medical device laboratory imaging ultrasound dialysis hospital equipment scientific laboratoire medical", ["331", "38"]],
  ["بلاستيك مطاط بولي ايثيلين pvc كاوتش اطارات plastic rubber polyethylene hdpe tyre tire plastique caoutchouc", ["195", "3435", "4416"]],
  ["تعبئه تغليف ورق كرتون عبوات packaging paper carton cardboard bottles emballage papier", ["3019", "4461", "2299", "3019763"]],
  ["طباعه مطبوعات دعايه اعلان لافتات printing printed advertising signage publication impression publicite", ["22", "798", "7934"]],
  ["حديد صلب معادن الومنيوم نحاس صاج مسبوك steel iron metal aluminium aluminum copper rebar galvaniz casting acier metal", ["147", "442", "4413"]],
  ["تعدين محاجر خامات فوسفات ذهب منجم mining quarry ore phosphate gold mine minier carriere", ["14"]],
  ["اسمنت طوب مواد بناء خرسانه رمل زلط cement concrete brick building materials aggregates asphalt ciment beton materiaux construction", ["441"]],
  ["رخام جرانيت marble granite stone marbre granit", ["1411", "4411"]],
  ["زجاج سيراميك بورسلين خزف glass ceramic porcelain tiles verre ceramique", ["1482", "4411"]],
  ["مقاولات انشاء تشييد اعمال مدنيه طرق كباري مباني ترميم تشطيب بناء construction works civil works road bridge building rehabilitation contractor travaux genie civil route batiment", ["45"]],
  ["كهرباء كابلات اناره محولات لوحات كهربائيه طاقه شمسيه خلايا شمسيه محطات توليد electric cable lighting transformer switchgear solar photovoltaic power line substation generator electrique cable eclairage transformateur solaire", ["31", "0933", "65"]],
  ["اجهزه منزليه الكترونيات شاشات تلفزيون appliance electronics television refrigerator washing electromenager", ["397", "32"]],
  ["حاسب كمبيوتر برمجيات شبكات اجهزه مكتبيه طابعات تكنولوجيا المعلومات رقمي computer software network server data center office equipment printer laptop digital informatique logiciel", ["30", "48", "72", "324"]],
  ["امن سلامه حريق اطفاء كاميرات مراقبه مهمات وقايه صواعق security safety fire cctv surveillance protective equipment ppe alarm lightning securite incendie", ["35", "18143", "7971"]],
  ["ماكينات معدات صناعيه خطوط انتاج الات machinery machine industrial equipment production line machines equipement industriel", ["42"]],
  ["عدد ادوات اجهزه قياس عدادات معايره tools instrument measuring meter calibration gauge outillage mesure compteur", ["4451", "384", "385"]],
  ["طلمبات مضخات ضواغط كمبروسر هيدروليك صمامات محابس pump compressor hydraulic valve pompe compresseur vanne", ["4212", "4213"]],
  ["قطع غيار رولمان تروس سيور spare parts bearings gears belts power transmission pieces rechange roulements", ["4214", "343"]],
  ["معدات ثقيله رافعات اوناش ونش مصاعد لوادر حفارات heavy equipment crane elevator lift excavator loader forklift escalator grue ascenseur engins", ["4241", "4320", "4252"]],
  ["تكييف تبريد غلايات مراوح تهويه hvac air condition refrigerat cooling boiler chiller ventilation climatisation refrigeration chaudiere", ["425", "4462", "45331"]],
  ["مياه معالجه صرف صحي تحليه شبكات مياه water wastewater sewage desalination treatment plant sanitation eau assainissement epuration", ["41", "904", "452321", "4461"]],
  ["سيارات مركبات شاحنات حافلات اتوبيس اسعاف vehicle car truck bus automotive ambulance vehicule camion autobus", ["341", "342", "344"]],
  ["غزل نسيج ملابس اقمشه مفروشات زي موحد يونيفورم قطن textile garment clothing uniform fabric cotton yarn bedding linen vetement tissu", ["18", "192", "395"]],
  ["اثاث اخشاب موبيليا furniture wood timber desks chairs mobilier meubles bois", ["391", "0341"]],
  ["فندقيه مطاعم مطابخ معدات مطبخ catering equipment kitchen equipment hotel restaurant cuisine restauration", ["3922", "3931", "3971"]],
  ["رياضيه ملاعب العاب sports playground gym fitness leisure toys sport jeux", ["37"]],
  ["استشار دراسات تدريب مساعده فنيه consult advisory study training technical assistance audit conseil etude assistance technique formation", ["71", "73", "79", "80"]],
  ["تامين بنوك تمويل قروض insurance financ bank loan leasing assurance", ["66"]],
  ["نقل شحن ملاحه موانئ سفن لوجستي سكك حديد طيران transport shipping freight logistics port vessel ship rail railway aviation fret portuaire navire", ["60", "63", "345", "346", "347"]],
  ["توريدات مستلزمات supplies general supplies fournitures", []],
].map(([kw, cpv]) => [kw.split(/\s+/).map(normText).filter(Boolean), cpv]);

const GENERIC = SECTORS.length - 1; // "General Industrial Supplies"
export const sectorName = (i, lang) => (i >= 0 && i < SECTORS.length ? SECTORS[i][lang === "en" ? 1 : 0] : "");
export function sectorIndex(nameOrIndex) {
  if (nameOrIndex === null || nameOrIndex === undefined || nameOrIndex === "") return -1;
  const n = Number(nameOrIndex);
  if (Number.isInteger(n) && String(nameOrIndex).trim() !== "") return n >= 1 && n <= SECTORS.length ? n - 1 : -1;
  const t = normText(nameOrIndex);
  return SECTORS.findIndex(([ar, en]) => normText(ar) === t || normText(en) === t);
}
/* word-start match on normalised text (so "oil" does not hit "toilet", "غاز" does not need the article "ال") */
function hits(text, kw) {
  if (kw.includes(" ")) return text.includes(kw);
  let i = text.indexOf(kw);
  while (i >= 0) {
    const prev = i === 0 ? " " : text[i - 1];
    if (prev === " " || (text.slice(Math.max(0, i - 2), i) === "ال" && (i - 2 === 0 || text[i - 3] === " ")) || (prev === "و" && (i - 1 === 0 || text[i - 2] === " ")) || (prev === "ب" && (i - 1 === 0 || text[i - 2] === " "))) return true;
    i = text.indexOf(kw, i + 1);
  }
  return false;
}
/* → {index, score}; CPV codes (TED) win when present, else keywords (title counts double) */
export function classifySector({ title = "", summary = "", cpv = [] } = {}) {
  const codes = (Array.isArray(cpv) ? cpv : [cpv]).map(c => String(c || "").replace(/\D/g, "")).filter(Boolean);
  if (codes.length) {
    let best = -1, bestLen = 0;
    RULES.forEach(([, prefixes], i) => { for (const p of prefixes) for (const c of codes) if (c.startsWith(p) && p.length > bestLen) { best = i; bestLen = p.length; } });
    if (best >= 0) return { index: best, score: 10 + bestLen };
  }
  const T = " " + normText(title) + " ", S = " " + normText(summary) + " ";
  let best = -1, bestScore = 0;
  RULES.forEach(([kws], i) => {
    if (i === GENERIC) return;
    let s = 0;
    for (const k of kws) { if (hits(T, k)) s += 2 * Math.min(k.length, 8); else if (hits(S, k)) s += Math.min(k.length, 8); }
    if (s > bestScore) { bestScore = s; best = i; }
  });
  if (best < 0 && RULES[GENERIC][0].some(k => hits(T, k))) return { index: GENERIC, score: 1 };
  return { index: best, score: bestScore };
}

const ARAB = new Set(["sa", "ae", "qa", "kw", "om", "bh", "jo", "iq", "ma", "tn", "dz", "ly", "lb", "sy", "ye", "sd", "ps", "mr", "so", "dj", "km"]);
const INDUSTRY = ["مصنع", "مصانع", "صناع", "تصدير", "صادرات", "استثمار", "منطقه صناعيه", "منطقة صناعية", "توريد", "مناقص", "مشروع", "عقد", "تعاقد", "انتاج",
  "factory", "manufactur", "industr", "export", "investment", "plant", "supply", "tender", "contract", "project", "procure", "usine", "exportation", "appel d offres", "marche"]
  .map(normText);
/* relevance 0–100 for Egyptian factories/exporters — transparent additive rules; AI may refine it later */
export function ruleRelevance(it, nowMs = Date.now()) {
  const kind = it.kind || "news", m = String(it.market || "");
  let r = { tender_gov: 50, tender_semi: 52, tender_private: 55, rfq: 60, project: 45, project_news: 35, news: 25 }[kind] ?? 25;
  if (m === "eg") r += 20; else if (ARAB.has(m)) r += 12; else if (m.startsWith("africa")) r += 10; else if (m === "eu") r -= 5;
  const sec = typeof it.sector === "number" ? it.sector : -1;
  if (sec === 34 || sec === 35) r -= 12; else if (sec >= 0 && sec !== GENERIC) r += 12; else if (sec === GENERIC) r += 4; else r -= 5;
  const g = String(it.proc_group || "").toUpperCase();
  if (g === "GO") r += 10; else if (g === "CW") r += 5; else if (g === "CS") r -= 15; else if (g === "NC") r -= 3;
  if (it.status === "closed") r -= 30;
  else if (it.deadline) { const days = (Date.parse(it.deadline) - nowMs) / 864e5; if (days >= 7) r += 5; }
  if (kind === "news" || kind === "project_news") {
    const t = " " + normText((it.title || "") + " " + (it.summary || "")) + " ";
    let n = 0; for (const k of INDUSTRY) if (t.includes(k)) n++;
    r += Math.min(n, 3) * 6;
  }
  return Math.max(0, Math.min(100, Math.round(r)));
}
