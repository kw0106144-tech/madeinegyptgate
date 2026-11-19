/* migate-intel — search terms shared by the feed (/api/intel/feed?q=, /intel/* lists) and Bassem's tool (/api/intel/tool):
   Arabic/Latin normalisation, stop-words, a bilingual (AR/EN/FR) synonym map for industrial products and sectors, market / kind /
   sector aliases, the item matcher (word-start, Arabic proclitics, negative phrases) and the SQL LIKE pre-filter.
   Term syntax: "word" matches at a word start with any suffix (stems: "galvaniz" → galvanized), "word$" is a whole word (Latin may
   add s/es), a phrase has spaces. Arabic terms are written in plain Arabic and normalised at load. */
import { normText, hash53 } from "./util.js";
import { MARKETS, marketFor } from "./markets.js";
import { SECTORS, sectorIndex, classifySector } from "./sectors.js";

/* comparison form: util.normText + Persian ya/kaf */
export function norm(s) { return normText(String(s == null ? "" : s).replace(/ی/g, "ي").replace(/ک/g, "ك")); }
const isLatin = s => /^[a-z0-9 ]+$/.test(s);
/* words that start with «ال» after hamza normalisation but are not the article (ألواح, ألومنيوم, ألبان, آلات, إلكترونيات …) */
const KEEP = new Set(["الواح", "الومنيوم", "المونيوم", "الومينيوم", "البان", "الياف", "العاب", "المانيا", "الات", "الكترونيات", "الكتروني", "الكترونيه", "الماس"]);
/* one query token → its canonical form: article/proclitic stripped (once), Latin plural stripped */
export function canon(t) {
  if (!t) return t;
  if (isLatin(t)) {
    if (t.length > 4 && /ies$/.test(t)) return t.slice(0, -3) + "y";
    if (t.length > 4 && /(sses|xes|ches|shes)$/.test(t)) return t.slice(0, -2);
    if (t.length > 3 && /[^s]s$/.test(t)) return t.slice(0, -1);
    return t;
  }
  if (KEEP.has(t)) return t;
  const m = /^(وال|بال|فال|كال|ولل|لل|ال)/.exec(t);
  return m && t.length - m[0].length >= 3 ? t.slice(m[0].length) : t;
}

/* ---------- synonym groups: [id, sector index (or [indices], null), terms, {not: negative phrases, inc: included groups}] ---------- */
const RAW_GROUPS = [
  ["steel", 12, "حديد|صلب$|حديد تسليح|حديد التسليح|اسياخ|اسياخ حديد|سيخ حديد|بليت|بيليت|خام الحديد|خامات الحديد|حديد خرده|خرده حديد|خرده الحديد|صاج|مجلفن|جلفنه|مقاطع حديد|قطاعات حديد|حديد انشائي|هياكل حديد|هياكل معدنيه|حديد مشغول|ستانلس|استانلس|كمرات حديد|زوايا حديد|لفائف حديد|لفائف الصلب|مسطحات الصلب|مواسير حديد|مواسير صلب|مواسير مجلفنه|steel|iron$|rebar|re bar|reinforcing bar|reinforcement bar|reinforcing steel|reinforcement steel|deformed bar|round bar|steel bar|mild steel|steel billet|wire rod|steel wire|steel sheet|steel plate|steel coil|hot rolled|cold rolled|galvaniz|galvanis|gi pipe|gi sheet|structural steel|steel structure|steel beam|i beam|h beam|angle iron|channel iron|stainless|scrap metal|scrap iron|iron ore|pig iron|cast iron|acier|fer$|fer à béton|rond à béton|ronds à béton|tôle$|tôles|galvanisé|poutrelle|ferraille|ferronnerie",
    { not: "سكك الحديد|سكك حديد|سكه الحديد|سكه حديد|الحديده|hodeidah|chemin de fer|chemins de fer|steel co$|steel company$|steel corporation$|steel corp$|steel ltd$|steel limited$|steel group$|steel plc$|steel llc$" }],
  ["metals", 12, "معادن|معدن$|معدني|معدنيه|مسبوكات|سبائك|metal$|metals|metallic|metalwork|alloy|alloys|casting$|castings|foundry|metallurg|métal$|métaux|métallique|fonderie",
    { not: "مياه معدنيه|المياه المعدنيه|mineral water", inc: ["steel", "aluminium", "copper"] }],
  ["aluminium", 12, "الومنيوم|المونيوم|الومينيوم|aluminium|aluminum"],
  ["copper", 12, "نحاس|نحاسي|نحاسيه|copper|brass|bronze|cuivre|laiton"],
  ["cables", 18, "كابلات|كابل$|كابلات كهرباء|كابلات كهربائيه|كابلات الكهرباء|اسلاك|اسلاك كهرباء|موصلات|cable|cabling|wire$|wiring|conductor|câble|câblage",
    { not: "السلك الدبلوماسي|wireless" }],
  ["electrical", 18, "كهرباء|كهربائي|كهربائيه|كهربيه|محولات|محول كهربائي|لوحات كهربائيه|لوحات توزيع|لوحه توزيع|قواطع|مفاتيح كهربائيه|اناره|كشافات|لمبات|مصابيح|مولدات|مولد كهربائي|خلايا شمسيه|الواح شمسيه|طاقه شمسيه|electrical|electric$|electricity|transformer|switchgear|switchboard|distribution board|panel board|circuit breaker|lighting|luminaire|lamps|led light|led lamp|street light|generator|genset|solar panel|solar pv|photovoltaic|inverter|électrique|transformateur|éclairage|groupe électrogène|panneaux solaires|disjoncteur"],
  ["cement", 14, "اسمنت|خرسانه|خرسانه جاهزه|طوب$|بلوكات|بلوك$|رمل$|زلط|جبس|مواد بناء|مواد البناء|كلنكر|cement|concrete|clinker|ready mix|readymix|brick|gypsum|aggregates|building materials|construction materials|ciment|béton|agrégats|matériaux de construction"],
  ["plastics", 9, "بلاستيك|بلاستيكي|بولي ايثيلين|بولي اثيلين|بولي بروبلين|بولي بروبيلين|بي في سي|pvc|upvc|cpvc|hdpe|ldpe|lldpe|polyethylene|polypropylene|polystyrene|polymer|plastic|plastique|polyéthylène"],
  ["rubber", 9, "مطاط|كاوتش|rubber|caoutchouc"],
  ["fertilizers", 2, "اسمده|سماد|يوريا|نترات|سلفات|سوبر فوسفات|مخصبات|npk$|dap$|fertilizer|fertiliser|urea|ammonium nitrate|ammonium sulphate|ammonium sulfate|potash|engrais|urée"],
  ["pesticides", 2, "مبيدات|مبيد$|pesticide|insecticide|herbicide|fungicide|agrochemical"],
  ["feed", 2, "اعلاف|علف$|animal feed|fodder|feedstuff"],
  ["pharma", 7, "ادويه|دواء|عقاقير|مستحضرات طبيه|مستحضرات صيدليه|مستلزمات طبيه|مستهلكات طبيه|لقاحات|لقاح$|امصال|محاليل|صيدليه|صيدلانيه|سرنجات|pharmaceutical|pharma$|pharmacy|medicine|drug$|drugs|medical supplies|medical supply|medical consumable|vaccine|syringe|bandage|infusion|médicament|produits pharmaceutiques|consommables médicaux|vaccin", { not: "school of medicine|faculty of medicine|college of medicine|كليه الطب" }],
  ["medical_equipment", 8, "اجهزه طبيه|معدات طبيه|اجهزه معمليه|معدات معمليه|مستلزمات معامل|medical equipment|medical device|hospital equipment|laboratory equipment|lab equipment|x ray|ultrasound|dialysis|équipement médical|matériel médical|dispositifs médicaux"],
  ["food", 0, "اغذيه|غذائيه|مواد غذائيه|منتجات غذائيه|سلع غذائيه|طعام|سكر$|دقيق القمح|دقيق قمح|دقيق مدعم|دقيق المدعم|دقيق فاخر|طحين|مطاحن|قمح|ارز$|رز$|ذره$|فول$|عدس$|البان|منتجات البان|لبن$|حليب|لحوم|دواجن|اسماك|خضروات|خضار|فاكهه|فواكه|تمور|عصائر|شاي$|قهوه|زيت طعام|زيوت طعام|زيت الطعام|زيوت نباتيه|زيت نباتي|زيت زيتون|مكرونه|معلبات|food|foodstuff|sugar|flour|wheat|rice$|maize|corn$|beans|lentils|dairy|milk$|meat$|meats|poultry|fish$|seafood|vegetable$|vegetables|fruit$|fruits|juice|tea$|coffee|cooking oil|edible oil|vegetable oil|sunflower oil|olive oil|pasta|canned food|cereal|grain$|grains|alimentaire|denrées|riz$|farine|sucre|huile alimentaire|lait$|viande|céréales|vivres"],
  ["agri", 1, "زراعه|زراعي|زراعيه|حاصلات زراعيه|محاصيل|بذور|تقاوي|شتلات|جرارات|انظمه الري|انظمه ري|نظم الري|نظم ري|شبكات الري|شبكات ري|معدات الري|معدات ري|مستلزمات الري|مستلزمات ري|مياه الري|قنوات الري|محطات الري|الري بالتنقيط|ري بالتنقيط|الري الحديث|ري حديث|الري المحوري|ري محوري|مستلزمات زراعيه|صوب زراعيه|agriculture|agricultural|agri$|agro|farming|farmer|irrigation|tractor|seeds|seedling|greenhouse|harvest|agricole|semences|tracteur"],
  ["textiles", 30, "غزل$|نسيج|منسوجات|اقمشه|قماش|ملابس|ملابس جاهزه|مفروشات|زي موحد|زي رسمي|يونيفورم|قطن$|اقطان|بطاطين|بطانيات|ستائر|خيوط|صوف$|textile|garment|apparel|clothing|uniform$|uniforms|fabric$|fabrics|yarn|cotton|linen|bedding|blanket|curtain|wool$|tents|vêtement|tissu|uniformes|coton|habillement|literie|confection$", { not: "الزراعه النسيجيه|زراعه الانسجه|زراعه نسيجيه|tissue culture|tissu economique|tissu industriel|tissu social|tissu des entreprises|tissu productif" }],
  ["chemicals", 3, "كيماويات|كيماويه|كيميائيه|كيميائي|كيماوي|مواد كيميائيه|بتروكيماويات|ميثانول|امونيا|صودا كاويه|كلور$|احماض|حمض$|مذيبات|راتنجات|كواشف|chemical|petrochemical|methanol|ammonia|caustic soda|chlorine|acid$|acids|solvent|resin|reagent|chimique|produits chimiques|réactifs"],
  ["detergents", 5, "منظفات|صابون|مطهرات|مواد تنظيف|detergent|soap$|soaps|disinfectant|sanitizer|sanitiser|cleaning products|cleaning materials|savon|détergent|désinfectant"],
  ["paints", 6, "دهانات|طلاء|بويات|احبار|ورنيش|paint$|paints|coating|ink$|inks|varnish|peinture|vernis"],
  ["paper", 10, "ورق$|ورقه|ورقي|ورقيه|كرتون|كراتين|مناديل|paper|carton|cardboard|corrugated board|tissue paper|kraft|papier"],
  ["glass", 16, "زجاج|زجاجي|زجاجيه|glass|glassware|glazing|verre$|vitrage"],
  ["ceramics", [16, 15], "سيراميك|بورسلين|بورسلان|خزف|بلاط|ادوات صحيه|رخام|جرانيت|حجر$|احجار|ceramic|porcelain|tiles|tile$|tiling|sanitary ware|marble|granite|stone$|stones|céramique|carrelage|marbre|granit$|faïence"],
  ["petroleum", 4, "بترول$|بترولي|بتروليه|منتجات بتروليه|مشتقات بتروليه|نفط$|نفطي|نفطيه|وقود|سولار|ديزل|بنزين|مازوت|كيروسين|غاز طبيعي|غاز مسال|بوتاجاز|زيوت تشحيم|زيوت محركات|شحوم|اسفلت|بيتومين|petroleum|fuel|diesel|gasoline|petrol$|kerosene|jet fuel|lpg$|lubricant|bitumen|asphalt|fuel oil|crude oil|oil and gas|oil products|carburant|gasoil|gazole|lubrifiant|bitume|produits pétroliers"],
  ["packaging", 10, "تعبئه|تغليف|عبوات|عبوه|اكياس|علب$|زجاجات|برطمانات|مواد تعبئه|مواد تغليف|packaging|packing material|bags$|sacks|bottles|jars$|pouches|stretch film|shrink film|crates|pallets|emballage|sacs$|flacons|bouteilles"],
  ["autoparts", [25, 29], "قطع غيار|قطع الغيار|قطع غيار سيارات|اطارات|كاوتش سيارات|بطاريات|بطاريه|فلاتر|فرامل|مكونات سيارات|الصناعات المغذيه|ضفائر|spare parts|auto parts|automotive parts|car parts|vehicle parts|motor parts|tyre|tyres|tire$|tires|batteries|battery|filters|brake$|brakes|bearings|pièces de rechange|pièces détachées|pneus|pneumatiques"],
  ["vehicles", 29, "سيارات|سياره|مركبات|شاحنات|اتوبيسات|حافلات|ميكروباص|موتوسيكلات|دراجات ناريه|vehicle|car$|cars|truck|bus$|buses|pickup|pick up|ambulance|motorcycle|vans|véhicule|camion|autobus|automobile|automotive", { not: "bus bar|bus bars|bus duct|bus ducts|car park|car parks|car parking" }],
  ["machinery", 22, "ماكينات|ماكينه|الات$|خطوط انتاج|خط انتاج|معدات صناعيه|معدات مصانع|مكابس|مخارط|machinery|machine$|machines|production line|industrial equipment|plant equipment|machine tools|lathe|cnc$|machinerie|équipements industriels"],
  ["pumps", 24, "طلمبات|طلمبه|مضخات|مضخه|ضواغط|كمبروسر|كمبريسور|هيدروليك|صمامات|محابس|pump$|pumps|pumping|compressor|hydraulic|valve$|valves|pompe|pompes|compresseur|vanne|vannes"],
  ["heavy_equipment", 26, "معدات ثقيله|رافعات|اوناش|ونش$|لوادر|لودر|حفارات|حفار$|بلدوزر|جريدر|مصاعد|سلالم متحركه|heavy equipment|heavy machinery|crane$|cranes|excavator|loader|bulldozer|grader|forklift|elevator|lift$|lifts|escalator|grue|grues|ascenseur|engins"],
  ["construction", 17, "مقاولات|مقاولات عامه|انشاءات|تشييد|اعمال مدنيه|اعمال انشائيه|اعمال الانشاء|انشاء مباني|انشاء مبني|انشاء مدارس|انشاء طرق|مباني|مبني$|رصف|الطرق والكباري|طرق وكباري|كباري|كوبري|جسور|ترميم|تشطيبات|تشطيب|اعاده تاهيل|صيانه مباني|بنيه تحتيه|construction|civil works|building works|building$|buildings|road$|roads|bridge$|bridges|rehabilitation|renovation|refurbishment|paving|earthworks|contractor|infrastructure|travaux|génie civil|réhabilitation|bâtiment|voirie|route$|routes|chaussée|ouvrages",
    { not: "بناء علي|بناء القدرات|بناء قدرات|مبني علي|capacity building|team building|nation building" }],
  ["water", 28, "مياه$|محطات مياه|محطه مياه|معالجه مياه|معالجه المياه|صرف صحي|تحليه|محطات تحليه|شبكات مياه|مياه الشرب|water treatment|wastewater|waste water|sewage|sewerage|desalination|water supply|drinking water|sanitation|water network|eau potable|assainissement|épuration|adduction d eau"],
  ["it", 20, "كمبيوتر|كمبيوترات|حاسب الي|حاسبات|حواسب|اجهزه كمبيوتر|برمجيات|شبكات حاسب|شبكات معلومات|سيرفر|سيرفرات|خوادم|طابعات|لاب توب|تكنولوجيا المعلومات|computer|laptop|software|server$|servers|computer network|networking equipment|printer|it equipment|ict$|data center|data centre|informatique|ordinateur|logiciel|serveur"],
  ["safety", 21, "مكافحه حريق|مكافحه الحريق|اطفاء|طفايات|انذار حريق|كاميرات مراقبه|انظمه مراقبه|مهمات وقايه|معدات سلامه|ملابس واقيه|fire fighting|firefighting|fire extinguisher|fire alarm|fire protection|fire suppression|cctv|surveillance camera|ppe$|personal protective|safety equipment|protective equipment|sécurité incendie|extincteur|vidéosurveillance"],
  ["hvac", 27, "تكييف|تكييفات|مكيفات|تبريد|غلايات|مراوح|تهويه|تشيلر|air conditioning|air conditioner|hvac|chiller|boiler|refrigeration|cold storage|ventilation|climatisation|climatiseur|chaudière"],
  ["appliances", 19, "اجهزه منزليه|ثلاجات|غسالات|بوتاجازات|شاشات|تلفزيونات|سخانات|home appliances|household appliances|refrigerator|fridges|washing machine|television|tv sets|water heater|électroménager"],
  ["printing", 11, "طباعه|مطبوعات|مطابع|لافتات|دعايه واعلان|printing|printed materials|signage|banners|imprimerie"],
  ["catering", 32, "معدات مطابخ|معدات المطابخ|معدات فندقيه|تجهيزات فندقيه|ادوات مطبخ|catering|kitchen equipment|hotel equipment|restauration|équipement de cuisine"],
  ["transport", 36, "نقل وشحن|خدمات لوجستيه|لوجستيات|شحن بحري|شحن جوي|موانئ|ملاحه|shipping|freight|logistics|haulage|cargo|transportation|fret$|logistique|transport de marchandises"],
  ["mining", 13, "تعدين|محاجر|محجر|خامات|خام$|منجم|مناجم|فوسفات|كاولين|فلسبار|mining|quarry|quarries|ore$|ores|minerals|mine$|mines|minier|minière|carrière"],
  /* product forms: combine with a material ("مواسير بلاستيك", "ألواح صلب") */
  ["pipes", null, "مواسير|ماسوره|انابيب|انبوب|انبوبه|خطوط مواسير|pipe$|pipes|piping|pipework|tube$|tubes|tubing|tuyau|tuyaux|canalisation"],
  ["sheets", null, "الواح|لوح$|صفائح|sheet$|sheets|sheeting|plate$|plates|coil$|coils|plaques"],
];
export const GROUPS = new Map();
const KEY = new Map(), VOCAB = new Set();
function term(raw) {
  raw = String(raw).trim();
  const whole = raw.endsWith("$"), body = whole ? raw.slice(0, -1) : raw, s = norm(body);
  return s ? { s, whole, latin: isLatin(s), raw: body } : null;
}
for (const [id, sector, list, o = {}] of RAW_GROUPS) {
  const terms = list.split("|").map(term).filter(Boolean);
  GROUPS.set(id, { id, sector: sector == null ? [] : [].concat(sector), terms, not: String(o.not || "").split("|").map(x => (x.endsWith("$") ? " " + norm(x.slice(0, -1)) + " " : norm(x))).filter(x => x.trim()), inc: o.inc || [] });
  for (const t of terms) {
    const toks = t.s.split(" ").map(canon);
    toks.forEach(x => VOCAB.add(x));
    const k = toks.join(" ");
    if (!KEY.has(k)) KEY.set(k, id);
  }
}
/* all terms of a group, included groups first-level (metals → steel, aluminium, copper) */
function groupTerms(g) { const out = [...g.terms]; for (const i of g.inc) out.push(...GROUPS.get(i).terms); return out; }
function groupNot(g) { const out = [...g.not]; for (const i of g.inc) out.push(...GROUPS.get(i).not); return out; }

/* ---------- stop-words (dropped from queries; a kind word is a ranking matter, «أخبار»/news means news was asked) ---------- */
const STOP = new Set(("في من على علي عن الى إلى الي مع او أو و ف ثم ل لل ب ك ده دي دا دى ذلك هذا هذه التي الذي اللي اللى كل اي أي اى ايه إيه حاجه حاجة حاجات " +
  "عايز عاوز عايزين عاوزين محتاج محتاجين ابغى ابغي اريد أريد نريد ممكن لو سمحت فضلك دور دوّر دورلي ابحث بحث ابحثلي شوف شوفلي هات هاتلي جيب جيبلي اعرض وريني " +
  "عندي عندنا احنا انا إحنا أنا لينا ليا لي لنا بتاع بتاعة بتاعتنا بتاعنا خاص خاصة عام عامة جديد جديدة احدث أحدث اخر آخر فرص فرصه فرصة مناقصات مناقصه مناقصة " +
  "عطاءات عطاء طلبات طلب عروض عرض اسعار أسعار سعر مشروع مشاريع مشروعات تصدير تصديري استيراد صادرات واردات تجاره تجارة سوق اسواق أسواق بيع شراء توريد توريدات " +
  "تزويد امداد منتجات منتج منتجاتنا انتاج إنتاج نصنع ننتج مصنع مصانع مصنعين شركه شركة شركات قطاع قطاعات صناعه صناعة صناعات صناعي صناعيه صناعية مجال مجالات نوع انواع " +
  "أنواع مقاس مقاسات مم ملي ملم مللي سم متر طن اطنان أطنان كيلو حجم كميه كمية كميات دول دوله دولة بلد بلاد بره برا خارج داخل جميع كافه كافة اكثر أكثر افضل أفضل " +
  "زي مثل حوالي تقريبا يعني بس كمان برضه برضو لسه النهارده الاسبوع الشهر " +
  "the a an of for in on at to and or with from by about into over any all some new latest recent please find search look show get give me my our we us i you " +
  "need want looking opportunity opportunities tender tenders bid bids bidding rfq rfqs rfp quotation quotations request requests project projects procurement purchase " +
  "purchasing buy buying supply supplier suppliers supplies market markets export exports exporting import imports product products company companies factory factories " +
  "manufacturer manufacturers manufacturing sector sectors industry industries industrial type types size sizes mm cm kg ton tons tonnes meter meters inch countries country abroad"
).split(/\s+/).map(w => canon(norm(w))).filter(Boolean));
const NEWS_WORDS = new Set(["اخبار", "خبر", "news"].map(w => canon(norm(w))));

/* ---------- markets: aliases → codes of markets.js / marketFilter (gcc, arab, africa, asia, eu, intl, eg, sa, africa:ke …) ---------- */
const MARKET_ALIAS = {
  gcc: "gcc gulf khaleej khaliji الخليج خليج الخليجي الخليجيه دول الخليج الخليج العربي دول مجلس التعاون",
  arab: "arab arabic arab world mena عربي عربيه الدول العربيه الوطن العربي العالم العربي دول عربيه",
  africa: "africa african افريقيا افريقي افريقيه القاره السمراء دول افريقيا",
  asia: "asia asian اسيا اسيوي اسيويه شرق اسيا دول اسيا",
  eu: "eu europe european اوروبا اوروبي اوروبيه الاتحاد الاوروبي uk britain united kingdom بريطانيا المملكه المتحده",
  intl: "intl international global worldwide دولي عالمي usa america united states امريكا الولايات المتحده canada كندا australia استراليا brazil البرازيل russia روسيا",
  eg: "eg egypt egyptian local domestic مصر محلي السوق المحلي المصري",
  sa: "ksa saudi السعوديه المملكه العربيه السعوديه", ae: "uae emirates الامارات دبي ابوظبي", "asia:cn": "china prc الصين", "asia:tr": "turkey turkiye تركيا",
};
const ALIAS = new Map(), QUERY_MARKET = new Map();
const mkey = s => norm(s).split(" ").map(canon).join(" ");
function splitAliases(list) {
  /* aliases are separated by single spaces except the multi-word ones listed here */
  const multi = ["arab world", "دول الخليج", "الخليج العربي", "دول مجلس التعاون", "الدول العربيه", "الوطن العربي", "العالم العربي", "دول عربيه", "القاره السمراء", "دول افريقيا", "شرق اسيا", "دول اسيا", "الاتحاد الاوروبي", "السوق المحلي", "المملكه العربيه السعوديه", "المملكه المتحده", "united kingdom", "الولايات المتحده", "united states"];
  let s = " " + list + " ";
  const out = [];
  for (const m of multi) if (s.includes(" " + m + " ")) { out.push(m); s = s.replace(" " + m + " ", " "); }
  return out.concat(s.trim().split(/\s+/).filter(Boolean));
}
for (const [code, [ar, en]] of Object.entries(MARKETS)) {
  for (const n of [ar, en]) { const k = mkey(n); if (!k) continue; if (!ALIAS.has(k)) ALIAS.set(k, code); if (!QUERY_MARKET.has(k)) QUERY_MARKET.set(k, code); }
}
for (const [code, list] of Object.entries(MARKET_ALIAS)) for (const a of splitAliases(list)) { ALIAS.set(mkey(a), code); QUERY_MARKET.set(mkey(a), code); }
/* country names that are also ordinary words in a sentence are not read as a market inside a free-text query (they still work as an
   explicit market argument): «مالي» financial, «بنين» boys, «قطر» diameter («حديد تسليح قطر ١٢ مم»). «خليج» counts only with the
   article («الخليج», «بالخليج»), and named gulfs are places, not the GCC («مشروعات خليج السويس») */
for (const w of ["مالي", "بنين", "قطر"]) QUERY_MARKET.delete(mkey(w));
const NOT_MARKET = new Set(["خليج سويس", "خليج عقبه", "خليج عدن", "خليج عمان", "خليج تونس", "خليج سرت", "خليج غينيا", "gulf of suez", "gulf of aqaba", "gulf of aden", "gulf of oman", "gulf of guinea"].map(mkey));
export const MARKET_GROUP_NAME = { gcc: "الخليج", arab: "الدول العربية", africa: "أفريقيا", asia: "آسيا", eu: "أوروبا", intl: "السوق الدولي", eg: "مصر" };
/* explicit market value (tool argument / feed ?market=) → market code, "" when it is not a known market */
export function resolveMarket(v) {
  if (v == null) return "";
  const raw = String(Array.isArray(v) ? v[0] : v).trim();
  if (!raw) return "";
  const low = raw.toLowerCase();
  if (MARKETS[low] || ["gcc", "arab", "africa", "asia", "eu", "intl"].includes(low)) return low;
  const a = ALIAS.get(mkey(raw));
  if (a) return a;
  const f = marketFor(raw);
  if (f) return f;
  return ALIAS.get(mkey(raw.replace(/^(the|al)\s+/i, ""))) || "";
}
/* list form: "gcc, africa" / ["sa","ae"] → codes (max 4); unknown entries are reported */
export function resolveMarkets(v) {
  const list = Array.isArray(v) ? v : v == null ? [] : String(v).split(/\s*[,،;|/]\s*|\s+(?:و|and|or|او)\s+/);
  const codes = [], unknown = [];
  const parts = [];
  for (const x of list.map(s => String(s || "").trim()).filter(Boolean)) {
    if (resolveMarket(x)) { parts.push(x); continue; }
    /* «مصر والخليج», «السعودية والإمارات»: the و is attached to the next name */
    const sub = x.split(/\s+(?=و\S)/).map((y, i) => (i && /^و/.test(y) ? y.slice(1) : y));
    if (sub.length > 1 && sub.every(y => resolveMarket(y) || resolveMarket(y.replace(/^و/, "")))) parts.push(...sub.map(y => (resolveMarket(y) ? y : y.replace(/^و/, ""))));
    else parts.push(x);
  }
  for (const x of parts.slice(0, 6)) { const c = resolveMarket(x); if (c) { if (!codes.includes(c)) codes.push(c); } else unknown.push(x); }
  return { codes: codes.slice(0, 4), unknown };
}

/* ---------- kinds & sectors ---------- */
const KIND_ALIAS = { tenders: "tender tenders tender_gov tender_semi tender_private مناقصه مناقصات عطاءات عطاء", rfq: "rfq rfqs quotation quotations طلبات اسعار طلب عرض اسعار طلبات عروض اسعار", projects: "project projects project_news مشروع مشاريع مشروعات", news: "news اخبار خبر", opportunities: "opportunities opportunity فرص فرصه" };
const KIND_MAP = new Map();
for (const [k, list] of Object.entries(KIND_ALIAS)) for (const w of list.split(" ")) KIND_MAP.set(mkey(w), k);
/* kind argument → a KIND_GROUPS key / KINDS list accepted by buildFeedQuery, or "" (any kind) */
export function resolveKind(v) {
  const raw = String(v == null ? "" : v).trim().toLowerCase();
  if (!raw) return "";
  if (/^[a-z_,]+$/.test(raw) && !KIND_MAP.has(raw)) return raw;
  const k = KIND_MAP.get(mkey(raw)) || KIND_MAP.get(mkey(raw.split(/\s+/)[0]));
  if (k === "opportunities") return "tender_gov,tender_semi,tender_private,rfq,project";
  return k || raw;
}
/* sector argument → index into SECTORS (-1 when unknown): exact name / 1-based number, else a synonym group, else the classifier */
export function resolveSector(v) {
  if (v == null || v === "") return -1;
  const exact = sectorIndex(v);
  if (exact >= 0) return exact;
  const s = parseQuery(v);
  for (const c of s.concepts) if (c.sector.length) return c.sector[0];
  const cl = classifySector({ title: String(v) });
  return cl.index >= 0 && cl.index < SECTORS.length - 1 && cl.score >= 8 ? cl.index : -1;
}

/* ---------- query → concepts ---------- */
/* returns {concepts:[{key,label,group,form,sector,terms,not,seg}], market, news, words, codes}; a concept matches when ANY of its
   terms matches. seg numbers the parts of a list («مواد غذائية، معدات طبية وكابلات»: 3 parts; «و», «،», "and", "or" separate them).
   codes: words with digits («RFQ/2026/123», «2026»), matched literally when the query has no product word. */
const CONJ = new Set(["و", "او", "and", "or", "et", "ou"]);
export function parseQuery(q) {
  const out = { concepts: [], market: "", news: false, words: [], codes: [] };
  const src = String(q == null ? "" : q).slice(0, 200);
  out.codes = src.split(/\s+/).filter(w => w.length > 1 && /[0-9٠-٩۰-۹]/.test(w)).slice(0, 5);
  let toks = [], seg = 0;
  for (const chunk of src.split(/[,،؛;]+/)) {
    for (const w of chunk.split(/[\s:.!?؟()[\]{}"«»'\/\\|+*&_-]+/).filter(Boolean)) for (const t of norm(w).split(" ").filter(Boolean)) {
      if (CONJ.has(t)) { seg++; continue; }
      let c = canon(t);
      if (!VOCAB.has(c) && /^[وب]/.test(c) && c.length > 3 && VOCAB.has(canon(c.slice(1)))) c = canon(c.slice(1));
      if (c !== t && t[0] === "و" && !VOCAB.has(t)) seg++; /* «ومعدات», «والكابلات»: an attached «و» starts the next list item */
      toks.push({ c, r: t, seg });
    }
    seg++;
  }
  toks = toks.filter(t => !/^\d+$/.test(t.c)).slice(0, 24);
  const C = toks.map(t => t.c);
  /* named gulfs and the bare word «خليج» are places / plain words, not the GCC */
  const noMk = C.map(() => false);
  for (let i = 0; i < C.length; i++) for (let n = 2; n <= 4 && i + n <= C.length; n++) if (NOT_MARKET.has(C.slice(i, i + n).join(" "))) for (let j = i; j < i + n; j++) noMk[j] = true;
  toks.forEach((t, i) => { if (t.c === "خليج" && t.r === "خليج") noMk[i] = true; });
  const seen = new Map();
  for (let i = 0; i < C.length;) {
    let hit = null;
    for (let n = Math.min(4, C.length - i); n >= 1 && !hit; n--) {
      const k = C.slice(i, i + n).join(" ");
      if (QUERY_MARKET.has(k) && !KEY.has(k) && !noMk.slice(i, i + n).some(Boolean)) hit = { n, market: QUERY_MARKET.get(k) };
      else if (KEY.has(k)) hit = { n, group: KEY.get(k), k };
    }
    if (hit && hit.market) { if (!out.market) out.market = hit.market; i += hit.n; continue; }
    if (hit && hit.group) {
      const g = GROUPS.get(hit.group);
      if (!seen.has(g.id)) { const c = { key: g.id, label: hit.k, group: g.id, form: !g.sector.length, sector: g.sector, terms: groupTerms(g), not: groupNot(g), seg: toks[i].seg }; seen.set(g.id, c); out.concepts.push(c); }
      out.words.push(hit.k); i += hit.n; continue;
    }
    const t = C[i], sg = toks[i++].seg;
    if (NEWS_WORDS.has(t)) { out.news = true; continue; }
    if (STOP.has(t) || t.length < 2 || (t.length < 3 && !isLatin(t))) continue;
    if (!seen.has("w:" + t)) { const c = { key: "w:" + t, label: t, group: null, form: false, sector: [], terms: [{ s: t, whole: false, latin: isLatin(t), raw: t }], not: [], seg: sg }; seen.set("w:" + t, c); out.concepts.push(c); out.words.push(t); }
  }
  out.concepts = out.concepts.slice(0, 6);
  return out;
}

/* ---------- matching ---------- */
const PROCLITIC = new Set(["ال", "و", "ب", "ل", "ف", "ك", "وال", "بال", "فال", "كال", "لل", "ولل", "وب", "وبال", "ول"]);
export function termHit(text, t) {
  let i = text.indexOf(t.s);
  while (i >= 0) {
    const ws = text.lastIndexOf(" ", i - 1) + 1, pre = text.slice(ws, i);
    if (pre === "" || (!t.latin && PROCLITIC.has(pre))) {
      const end = i + t.s.length, after = text[end];
      if (!t.whole || after === " " || after === undefined || (t.latin && (text.startsWith("s ", end) || text.startsWith("es ", end)))) return true;
    }
    i = text.indexOf(t.s, i + 1);
  }
  return false;
}
/* normalised haystacks of a stored item: titles (orig/ar/en), summaries, and the buying entity (a product synonym never matches on
   the buyer's name alone: «Ghana Integrated Iron and Steel Development Corp» buying satellite mapping is not a steel opportunity) */
export function itemHay(r) {
  return { t: " " + norm([r.title_orig, r.title_ar, r.title_en].filter(Boolean).join(" | ")) + " ", s: " " + norm([r.summary_ar, r.summary_en, r.summary_orig].filter(Boolean).join(" | ")) + " ", e: " " + norm(r.entity || "") + " " };
}
const strip = (text, not) => { for (const n of not) if (text.includes(n)) text = text.split(n).join(" "); return text; };
/* → {coverage: concepts matched, inTitle: concepts matched in a title, hits: distinct terms matched (title ×2), hit: per concept} */
export function matchItem(hay, concepts) {
  let coverage = 0, hits = 0, inTitle = 0;
  const hit = [];
  /* the buyer's name, wherever it is repeated (summaries often start with it), is not what is being bought */
  const e = hay.e ? hay.e.trim() : "", noBuyer = x => (e.length >= 8 && x.includes(" " + e + " ") ? x.split(" " + e + " ").join(" ") : x);
  const t0 = noBuyer(hay.t), s0 = noBuyer(hay.s);
  for (const c of concepts) {
    const tt = c.group ? t0 : hay.t, ss = c.group ? s0 : hay.s;
    const T = c.not.length ? strip(tt, c.not) : tt, S = c.not.length ? strip(ss, c.not) : ss;
    let h = 0, ti = false;
    for (const t of c.terms) { if (termHit(T, t)) { h += 2; ti = true; } else if (termHit(S, t) || (!c.group && hay.e && termHit(hay.e, t))) h += 1; if (h >= 12) break; }
    hit.push(h > 0);
    if (h) { coverage++; hits += h; if (ti) inTitle++; }
  }
  return { coverage, inTitle, hits, hit };
}
/* which items a query keeps (hit = matchItem().hit): the parts of a list are alternatives («مواد غذائية ومعدات طبية وكابلات»);
   inside a part a product form needs its material («مواسير بلاستيك»: both), a product must be there when the other words are
   generic («حديد البناء»: steel; «البناء» only ranks), products side by side are alternatives, plain words all count (two) or half */
function parts(concepts) { const m = new Map(); concepts.forEach((c, i) => { const k = c.seg || 0; if (!m.has(k)) m.set(k, []); m.get(k).push(i); }); return [...m.values()]; }
function partOk(concepts, idx, hit) {
  const V = idx.filter(i => concepts[i].group), W = idx.filter(i => !concepts[i].group);
  if (V.length) {
    const forms = V.filter(i => concepts[i].form), mats = V.filter(i => !concepts[i].form);
    return forms.length && mats.length ? forms.some(i => hit[i]) && mats.some(i => hit[i]) : V.some(i => hit[i]);
  }
  const n = W.filter(i => hit[i]).length;
  return W.length <= 2 ? n === W.length : n >= Math.ceil(W.length / 2);
}
export function accepts(concepts, hit) { return !concepts.length || parts(concepts).some(idx => partOk(concepts, idx, hit)); }
/* every word of one list part matched (an answer «عن» the query; otherwise only «قريبة من») */
export function fullMatch(concepts, hit) { return !concepts.length || parts(concepts).some(idx => idx.every(i => hit[i])); }

/* ---------- news relevance (pure news: kind "news", a tender headline is already project_news / tender_news) ----------
   The section is «الأخبار الاقتصادية والصناعية». The economy pages of news sites also carry hourly retail price lists (gold,
   vegetables, poultry), politics, pilgrimage and sports; on 2026-11-19 they filled the hub (bug sweep group 6: gold prices, Hajj
   offices, Sadat honoured in Congress). A news headline stays when it names a sector product or service (the synonym groups
   above, with their negative phrases) or an industry / trade / investment / economy word (NEWS_TERMS), and it is not a gold or
   retail-food price list, pilgrimage, sports or weather item (NEWS_OFF) — unless it also names a factory, production, mining or
   exports (NEWS_STRONG). Decided on the headline as the source wrote it (title_orig), so ingest, the daily sweep and an audit of
   the public API give the same answer. */
const NEWS_TERMS_RAW = "صناعه|صناعات|صناعي|صناعيه|تصنيع|مصنع|مصانع|مصنعين|انتاج|انتاجيه|انتاجي|تصدير|تصديري|تصديريه|صادرات|مصدرين|استيراد|واردات|" +
  "مستوردين|تجاره|تجاري|تجاريه|استثمار|استثمارات|استثماري|استثماريه|مستثمر|مستثمرين|تستثمر|يستثمر|منطقه حره|مناطق حره|اقتصاد|اقتصادي|" +
  "اقتصاديه|مناقصه|مناقصات|توريد|توريدات|عقود|تعاقد|تعاقدات|اتفاقيه|اتفاقيات|مذكره تفاهم|مذكرتي تفاهم|شراكه|شراكات|مشروع|مشروعات|مشاريع|" +
  "شركه|شركات|شركتان|شركتين|قابضه|بورصه|اسهم|سهم$|ارباح|خسائر|خساره|ايرادات|مبيعات|راس مال|راس المال|طرح عام|اكتتاب|استحواذ|يستحوذ|" +
  "تستحوذ|استحوذ|صفقه|صفقات|توريق|تخارج|يتخارج|مساهم|مساهمين|حصه$|حصص|حيازات|حجم الاعمال|حجم اعمال|الرئيس التنفيذي|مجلس الاداره|توسع$|" +
  "توسعات|التوسع$|فروع$|تمويل|تمويلات|قرض|قروض|سندات|صكوك|ديون|مديونيه|بنك|بنوك|مصرف|مصارف|مصرفي|تامين$|تامينات|الفائده|فائده|تضخم|" +
  "موازنه|انفاق|ضرائب|ضريبه|ضريبي|جمارك|جمركي|جمركيه|سعر الصرف|العملات|دولار$|جنيه$|يورو$|ريال$|درهم$|احتياطي|احتياطيات|مليون|ملايين|" +
  "مليار|مليارات|ملياري|تريليون|الناتج المحلي|ناتج محلي|نمو$|ركود|بطاله|قوه العمل|سوق العمل|وظائف|توطين|صندوق النقد|البنك الدولي|" +
  "طاقه|نفط$|نفطي|نفطيه|بترول$|بترولي|غاز$|برنت|اوبك|تكرير|كهرباء|طاقه الرياح|هيدروجين|موانئ|ميناء|لوجستي|لوجستيه|عقار|عقارات|عقاري|" +
  "عقاريه|تطوير عقاري|اراضي|ارض$|قطعه ارض|قطعتي ارض|متر مربع|وحدات سكنيه|اسكان|تصاريح بناء|رفع كفاءه|سياحه|سياحي|سياحيه|فنادق|فندقي|" +
  "طيران|اتصالات|تكنولوجيا|رقمي|رقميه|الذكاء الاصطناعي|ذكاء اصطناعي|رقائق|مركز بيانات|مراكز بيانات|مراكز البيانات|كوبالت|ليثيوم|" +
  "معرض$|معارض$|شركات ناشئه|ريادة الاعمال|رجال الاعمال|قطاع الاعمال|غرفه تجاريه|الغرف التجاريه|اتحاد الصناعات|مستهلك|مستهلكين|اسعار|سعر$|سوق$|اسواق|" +
  "تداول|تداولات|مؤشر|مؤشرات|تاسي|ناسداك|industr|manufactur|factory|factories|plant$|plants|production|producer|output$|export|import|" +
  "trade$|trading|tariff|customs|protectionism|investment|investor|invest$|invests|investing|fdi$|economy|economic|economies|gdp$|growth|" +
  "inflation|interest rate|central bank|imf$|world bank|budget|spending|consumption|austerity|tax$|taxes|debt$|debts|deficit|bond$|bonds|" +
  "sukuk|stock$|stocks|shares|bourse|egx$|ipo$|company|companies|firm$|firms|corporation|conglomerate|business|businesses|contract|" +
  "contracts|deal$|deals|agreement|agreements|mou$|memorandum|partnership|tender|tenders|bidder|procure|supply|supplies|supplier|project|" +
  "projects|acquisition|acquisitions|acquire$|acquires|acquired|buyout|stake$|stakes|merger|mergers|takeover|shareholder|shareholders|" +
  "assets$|capex|funding|capital$|lending|loan|loans|financing|finance|fund$|funds|bank$|banks|banking|lender|insurance|payment$|payments|" +
  "fintech|startup|startups|entrepreneur|million|millions|billion|billions|trillion|bn$|mn$|mln$|usd$|egp$|sar$|aed$|market$|markets|" +
  "price$|prices|sales|revenue|revenues|profit|profits|earnings|margin$|margins|expansion|expands|retail|retailer|retailers|wholesale|" +
  "hypermarket|consumer|consumers|brand$|brands|cpg$|confectionery|snack|snacks|soda$|cola$|fermentation|protein|whey|yeast|innovation|" +
  "trademark|energy|power$|electricity|oil$|gas$|lng$|brent$|crude$|opec$|refinery|refining|drilling|exploration|offshore wind|wind farm|" +
  "hydrogen|port$|ports|logistics|real estate|property|developer|developers|villas|townhouses|housing|tourism|airline|airlines|aviation|" +
  "telecom|technology|digital|artificial intelligence|semiconductor|semiconductors|chip$|chips|chipmaker|data center|data centre|robot|" +
  "robots|robotics|carmaker|carmakers|automaker|automakers|ev$|evs$|unemployment|jobs$|labour|workforce|employment|carbon border|cbam$|" +
  "rupee|currency|currencies|exchange rate|macroeconomic|ingredient|ingredients|exhibition|trade show|trade fair|ceo$|usine|investissement|economie|entreprise|entreprises|banque|financement|projet|projets|" +
  "marche$|contrat|appel d offres|energie|commerce$";
const NEWS_NOT = "صناعه السلام|صناعه القرار|صناع القرار|صناعه المحتوي|صناع المحتوي|صناعه التاريخ|صناعه المستقبل|صناعه الامل|صناعه النجوم|" +
  "صناعه الفارق|صناعه الحياه|صناعه الوعي|مشروع قانون|مشروع القانون|مشروعات القوانين|مشروع قرار|اتفاق سلام|اتفاقيه سلام|اتفاقيه السلام|" +
  "وقف اطلاق النار|تداول السلطه|انتاج فني|انتاج سينمائي|انتاج درامي|الانتاج الفني|انتاج الافلام|peace deal|peace agreement|ceasefire|" +
  "plea deal";
const NEWS_STRONG_RAW = "مصنع|مصانع|تصنيع|صناعه|صناعات|صناعي|صناعيه|انتاج|منجم|مناجم|تعدين|تنقيب|صادرات|تصدير|تكرير|توريد|توريدات|factory|" +
  "factories|manufactur|industr|production|mining|mine$|mines|exports|export$|refinery|refining|usine";
/* gold, silver and crypto: such a headline that is not about mining, production or exports is a market / retail price item */
const NEWS_GOLD_RAW = "ذهب$|الذهب$|فضه$|الفضه$|المعدن الاصفر|سبائك|مشغولات ذهبيه|المجوهرات|مجوهرات|عيار$|الاوقيه|اوقيه|بيتكوين|" +
  "العملات المشفره|العملات الرقميه|gold$|silver$|bullion|jewellery|jewelry|karat|bitcoin|crypto";
/* a daily retail food price list: a price word with a consumer food word */
const NEWS_PRICE_RAW = "سعر|اسعار|بكام|price$|prices";
const NEWS_FOOD_RAW = "خضروات|خضار|فاكهه|فواكه|طماطم|بطاطس|بصل$|ليمون|سمك$|اسماك|ماكولات بحريه|دواجن|فراخ|لحوم|بيض$|البيض$|كرتونه|بانيه|" +
  "كابوريا|جمبري|زيت$|الزيت$|vegetables|fruit$|fruits|poultry|eggs$|fish$|meat$";
/* pilgrimage, sports, entertainment and weather */
const NEWS_OFF_RAW = "حج$|الحج$|حجاج|الحجاج|عمره$|العمره$|معتمر|معتمرين|المعتمرين|hajj|umrah|pilgrim|كره القدم|مباراه|مباريات|الدوري$|" +
  "منتخب|بطوله|كاس العالم|مونديال|اولمبي|فيفا|ريال مدريد|برشلونه|اشبيليه|ويمبلدون|الاندية|اندية$|ماراثون|لاعب$|لاعبين|" +
  "ملعب|استاد|football|soccer|league$|olympic|world cup|tournament|fifa$|wimbledon|marathon|stadium|فيلم$|افلام|مسلسل|" +
  "مسلسلات|مهرجان|الفنان|الفنانه|نجوميه|رياضات الكترونيه|ميجور$|grammy|grammys|film$|movie|movies|album|concert|celebrity|gta$|" +
  "grand theft auto|gamers|gaming|video game|playstation|esports|طقس|الطقس|الارصاد|امطار|الامطار|موجه حاره|weather|rainfall|heatwave";
const termList = s => s.split("|").map(term).filter(Boolean);
const NEWS_TERMS = termList(NEWS_TERMS_RAW), NEWS_STRONG = termList(NEWS_STRONG_RAW), NEWS_GOLD = termList(NEWS_GOLD_RAW),
  NEWS_PRICE = termList(NEWS_PRICE_RAW), NEWS_FOOD = termList(NEWS_FOOD_RAW), NEWS_OFF = termList(NEWS_OFF_RAW);
const NEWS_NOTS = NEWS_NOT.split("|").map(norm).filter(Boolean);
const SECTOR_GROUPS = [...GROUPS.values()];
/* changes whenever a list above (or a sector synonym group) changes: engine.js newsSweep re-checks the stored news once per version */
export const NEWS_RULE_VERSION = hash53([NEWS_TERMS_RAW, NEWS_NOT, NEWS_STRONG_RAW, NEWS_GOLD_RAW, NEWS_PRICE_RAW, NEWS_FOOD_RAW, NEWS_OFF_RAW,
  ...SECTOR_GROUPS.map(g => g.id + ":" + g.terms.map(t => t.s + (t.whole ? "$" : "")).join("|") + "!" + g.not.join("|"))].join("\n")).toString(36);
const anyHit = (text, list) => list.find(t => termHit(text, t)) || null;
/* → {ok, why}: why names the first term that decided (for the sweep's report and the tests) */
export function newsRelevant(title) {
  /* digits apart from letters («بـ91.8», "$9.8bn" → «ب 91 8», "9 8 bn"), negative phrases out */
  const T = " " + strip(norm(title).replace(/(\d)(?=[^\d\s])|([^\d\s])(?=\d)/g, "$1$2 "), NEWS_NOTS) + " ";
  const strong = anyHit(T, NEWS_STRONG);
  let sector = null;
  for (const g of SECTOR_GROUPS) { const t = anyHit(g.not.length ? strip(T, g.not) : T, g.terms); if (t) { sector = g.id + ":" + t.raw; break; } }
  if (!strong) {
    const gold = anyHit(T, NEWS_GOLD); if (gold) return { ok: false, why: "gold/price: " + gold.raw };
    const price = anyHit(T, NEWS_PRICE), food = price && anyHit(T, NEWS_FOOD); if (food) return { ok: false, why: "retail price list: " + price.raw + " + " + food.raw };
    const off = anyHit(T, NEWS_OFF); if (off) return { ok: false, why: "off-topic: " + off.raw };
  }
  if (strong) return { ok: true, why: "industry: " + strong.raw };
  if (sector) return { ok: true, why: "sector " + sector };
  const w = anyHit(T, NEWS_TERMS);
  return w ? { ok: true, why: "economy: " + w.raw } : { ok: false, why: "no industry, trade or economy word" };
}

/* ---------- SQL pre-filter: candidates are a superset of what the matcher keeps ----------
   Every matcher term gets a pattern (a shorter term it contains stands for it). Arabic → GLOB with the letter classes normText folds
   (ا/أ/إ/آ/ٱ, ي/ئ/ى/ی, و/ؤ, ه/ة, ك/ک, Arabic-Indic digits) and, for a whole word, a next character that is not an Arabic letter; Latin →
   LIKE (ASCII case-insensitive, accented letters "_"). Word gaps match anything. There is no pattern cap (api.js inlines them in a
   balanced OR tree, so D1's 100 bound parameters / expression depth 100 are never near). Not covered (the stored text is not normalised):
   tashkeel / tatweel inside a stored word, decomposed Unicode, presentation forms, an accent the term does not have («Câble» for "cable"). */
export const HAY_SQL = "(' ' || COALESCE(title_orig,'') || ' ' || COALESCE(title_ar,'') || ' ' || COALESCE(title_en,'') || ' ' || COALESCE(entity,'') || ' ' || COALESCE(summary_ar,'') || ' ' || COALESCE(summary_en,'') || ' ' || COALESCE(summary_orig,'') || ' ')";
const AR_CLASS = { "ا": "[اأإآٱ]", "ي": "[يئىی]", "و": "[وؤ]", "ه": "[هة]", "ك": "[كک]" };
const AR_END = "[^ء-ؿف-ي]";
const digitClass = d => "[" + d + "٠١٢٣٤٥٦٧٨٩"[d] + "۰۱۲۳۴۵۶۷۸۹"[d] + "]";
/* D1 refuses a LIKE / GLOB pattern longer than 50 bytes ("LIKE or GLOB pattern too complex"; node:sqlite has no such limit). A longer
   pattern is made shorter only in ways that match at least as much: the end-of-word class goes, then letter classes become "?",
   then whole words go (the most specific stays), then the last word loses its end. */
export const PATTERN_MAX_BYTES = 50;
const ENC = new TextEncoder(), bytes = s => ENC.encode(s).length;
function fit(words, whole, gap, end) {
  const ser = () => gap + words.map(w => w.join("")).join(gap) + (whole ? end : "") + gap;
  const lit = w => w.filter(x => x.length === 1 && x !== "?" && x !== "_").length;
  while (bytes(ser()) > PATTERN_MAX_BYTES) {
    if (whole) { whole = false; continue; }
    let bi = -1, bj = -1;
    words.forEach((w, i) => w.forEach((x, j) => { if (x.length > 1 && (bi < 0 || bytes(x) > bytes(words[bi][bj]))) { bi = i; bj = j; } }));
    if (bi >= 0) { words[bi][bj] = gap === "*" ? "?" : "_"; continue; }
    if (words.length > 1) { let k = 0; words.forEach((w, i) => { if (lit(w) < lit(words[k]) || (lit(w) === lit(words[k]) && w.length < words[k].length)) k = i; }); words.splice(k, 1); continue; }
    words[0].pop();
  }
  return ser();
}
export function patternOf(t) {
  if (t.latin) return { op: "like", p: fit(t.raw.toLowerCase().replace(/[^a-z0-9 ]/g, "_").split(/ +/).filter(Boolean).map(w => [...w]), false, "%", "") };
  const words = t.s.split(" ").filter(Boolean).map(w => [...w].map(ch => AR_CLASS[ch] || (/[0-9]/.test(ch) ? digitClass(ch) : /[a-z]/.test(ch) ? "[" + ch + ch.toUpperCase() + "]" : ch)));
  return { op: "glob", p: fit(words, t.whole, "*", AR_END) };
}
/* a literal LIKE pattern for a code / number word, cut to the D1 limit */
export function literalLike(w) { const out = []; let n = 2; for (const ch of String(w).replace(/[%_]/g, "")) { n += bytes(ch); if (n > PATTERN_MAX_BYTES) break; out.push(ch); } return "%" + out.join("") + "%"; }
/* a pattern whose body is inside another's matches wherever that one does, so the longer one is left out ("cable" and "câble"
   share a normalised form but not a pattern: both stay) */
export function textPatterns(concepts) {
  const all = concepts.flatMap(c => c.terms).map(patternOf).map(x => ({ ...x, b: x.p.slice(1, -1) })).sort((a, b) => a.b.length - b.b.length), kept = [];
  for (const x of all) if (!kept.some(k => k.op === x.op && x.b.includes(k.b))) kept.push(x);
  const out = { like: [], glob: [] };
  for (const x of kept) out[x.op].push(x.p);
  return out;
}

/* ---------- spoken Arabic helpers ---------- */
export function arDigits(n) { return String(n).replace(/\d/g, d => "٠١٢٣٤٥٦٧٨٩"[d]); }
const AR_MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
/* "2026-12-02…" → «٢ ديسمبر» (the year only when it is not the current year) */
export function spokenDay(iso, nowMs = Date.now()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  if (!m) return "";
  const y = new Date(nowMs).getUTCFullYear();
  return arDigits(+m[3]) + " " + AR_MONTHS[+m[2] - 1] + (+m[1] !== y ? " " + arDigits(m[1]) : "");
}
/* Arabic count phrase: 1 «فرصة واحدة», 2 «فرصتين», 3–10 «٣ فرص», 11+ «١١ فرصة» */
export function countAr(n, [one, two, few, many]) { return n === 1 ? one : n === 2 ? two : n <= 10 ? arDigits(n) + " " + few : arDigits(n) + " " + many; }
export const OPP_WORDS = ["فرصة واحدة", "فرصتين", "فرص", "فرصة"], NEWS_COUNT = ["خبر واحد", "خبرين", "أخبار", "خبر"];
export function daysAr(d) { return d === 1 ? "آخر ٢٤ ساعة" : d === 2 ? "آخر يومين" : d <= 10 ? "آخر " + arDigits(d) + " أيام" : "آخر " + arDigits(d) + " يوم"; }
