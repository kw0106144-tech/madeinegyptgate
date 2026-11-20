/* Janna's lookup (src/index.js search, POST /api/janna/lookup) — the words of a query, the forms the directory index stores, and the
   synonyms that join them (lookup-index 2026-11-20, after the Al-Atlal call 8bacbfac: 39 searches on «سلندرات / درافيل / كاوتش», nothing
   found although the directory describes roller covering, gas cylinders and oxygen suppliers in the company descriptions).
   - canon(w): one normalised word → the form the index stores and the query looks up: stem() of text.js for Arabic, plurals folded for
     Latin («rollers» → «roller», «batteries» → «battery»). worker/build-index.js builds data.json f[6] with canon(), so a query and the
     index always meet; lookupVersion() changes when canon() or the phrases change (a test checks data.json lk against it).
   - variants(w): the stored forms a query word may take in a text: with the article and with one attached و / ب / ل / ف / ك (+ «ال»):
     «درافيل» also finds «والدرافيل», «للدرافيل», «بالدرافيل». The index never strips letters off a word itself (no «لاستيك» for «بلاستيك»).
   - concepts(query): the query's words and phrases, each with its alternatives in tiers: 1 = the word itself or a true equivalent
     (EQUIV: spellings, singular / plural, colloquial and English / French names of the same thing), 2 = the same field of industry
     (RELATED: the 42 AR/EN/FR groups of worker-intel/src/terms.js, copied as data: the two packages do not import each other), plus the
     ambiguity note of a word with several meanings («سلندر»: rollers, gas cylinders or hydraulic cylinders — AMBIG).
   Only words: no data, no contacts. */
import { norm, stem, STOP } from "./text.js";

/* ---------------- forms ---------------- */
export function latinFold(w) {
  if (w.length > 4 && /ies$/.test(w)) return w.slice(0, -3) + "y";
  if (w.length > 4 && /(sses|xes|ches|shes)$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && /[^s]s$/.test(w)) return w.slice(0, -1);
  return w;
}
/* one normalised word (no spaces) → its stored form */
export const canon = w => (/^[a-z]+$/.test(w) ? latinFold(w) : /^[a-z0-9]+$/.test(w) ? w : stem(w));
/* the words of a text, normalised, without a leading run of digits glued to a word («2جهاز» → «جهاز») */
export const words = s => norm(s).split(" ").map(w => w.replace(/^\d+(?=\D{2,})/, "")).filter(Boolean);
/* the stored forms of one word of a text: its canon(), and — when it carries an attached letter and its bare form maps to another word
   (a broken plural: «والأنابيب» → «انبوب», «بالأدوية» → «دواء») — that word too. A bare form that is only the tail of the word is never
   added (no «لاستيك» for «بلاستيك», no «سائل» for «وسائل»); the query side finds the attached forms by variants() below */
export function storedForms(w) {
  const k = canon(w), o = [k];
  const b = /^لل/.test(w) && w.length >= 5 ? canon("ال" + w.slice(2)) : /^[وبلفك]/.test(w) && w.length - 1 >= 3 ? canon(w.slice(1)) : "";
  if (b && b !== k && !k.endsWith(b) && b.length >= 2) o.push(b);
  return o;
}
const KEEP_AL = new Set(["الواح", "البان", "الياف", "العاب", "الوان", "الماس", "المانيا", "الماني", "اليات", "البسه"]);
const bare = w => (w.length > 4 && w.startsWith("ال") && !KEEP_AL.has(w) && !/^ال(كترون|ومنيوم|مونيوم|ومينيوم|منيوم)/.test(w) ? w.slice(2) : w);
const P1 = ["و", "ب", "ل", "ف", "ك"], P2 = ["ال", "وال", "بال", "فال", "كال", "لل", "ولل"];
/* the stored forms of one normalised query word as a text may write it (the word, «ال» + it, one attached letter + it: «وخشب»,
   «لصيانة»). Never the words and first names that only look like a letter + a short word: «وليد» is not «و» + «ليد» (LED), «كامل»
   not «ك» + «امل», «بورد» not «ب» + «ورد» */
const NOT_CLITIC = new Set("وليد وحيد وسام وائل وجدي وداد وفاء ولاء وديع وفيق وصفي واصف بلال بسام بسيم بارز بورد بريد بحري فريد فادي فاضل فوزي فهمي فتحي فكري فايز كريم كمال كامل كبير كرم لبيب لطفي لطيف بكري".split(" "));
export function variants(w) {
  if (/^[a-z0-9]+$/.test(w)) return [canon(w)];
  const b = bare(w), o = new Set([canon(w), canon(b)]);
  /* a 3-letter word takes only «و» («وخشب»): «ب» / «ل» + «ليد» are «بليد» (dull), «لليد» (for the hand) */
  for (const p of b.length >= 4 ? P1 : ["و"]) if (!NOT_CLITIC.has(p + b)) o.add(canon(p + b));
  for (const p of P2) if (!(b[0] === "ل" && /لل$/.test(p))) o.add(canon(p + b)); // «لل» + «ليد» would be «للليد»
  if (b !== w) for (const p of P1) o.add(canon(p + w)); // «والكترونيات» keeps its «ال»
  o.delete("");
  return [...o];
}

/* ---------------- words a query may drop ----------------
   STOP (text.js) + what says nothing about WHAT is made or wanted («صناعية», «مستلزمات», «انتاج», «خدمات»): dropped when the query keeps
   another word (a query of such words only is searched as it is) */
const GENERIC_RAW = "صناعه صناعات صناعي صناعيه الصناعات الصناعيه للصناعات لصناعه تصنيع انتاج إنتاج منتج منتجات المنتجات مستلزمات خدمات " +
  "متخصص متخصصه متخصصين مختلف مختلفه انواع أنواع نوع جميع كافه كافة عام عامه جديد جديده مصر مصري مصريه بمصر في مصر اجود افضل اعلي جوده جودة " +
  "مورد موردين موردي تاجر تجار تجاره تجارة بيع شراء جمله تجزئه مجال مجالات قطاع نشاط عايزه عاوزه محتاجه بدور بدورلك دوري ابحثلي هات وريني " +
  "شغال شغالين بتعمل بيعمل بيعملوا بيصنع بيصنعوا يصنع تصنع عندكم فيه في ايه إيه حاجه حاجات ليا لينا عندي عندنا انا احنا دلوقتي حاليا " +
  "industrial industry manufacturer manufacturers manufacturing maker makers supplier suppliers producer producers products product " +
  "services service company companies factory factories egypt egyptian best quality general new all types type kind kinds";
const GENERIC = new Set(GENERIC_RAW.split(/\s+/).map(w => canon(norm(w))).filter(Boolean));
const LIST_WORDS = new Set(["و", "او", "أو", "ولا", "and", "or", "et", "ou"]);
/* the words of a company description that say nothing about what it makes (measured on data/oldfacd.js, 2026-11-20: «كما» 569
   descriptions, «نشاط» 533, «تعمل» 359 …): never stored in the index (worker/build-index.js), never searched */
const FILLER_RAW = "كما الي الى هي هو وهي وهو ضمن حيث تعد يعد تعتبر يعتبر تعمل وتعمل يعمل ويعمل تقدم وتقدم يقدم ويقدم تشمل وتشمل يشمل ويشمل " +
  "تاسست تأسست تأسس تاسس نشاط نشاطها نشاطه انشطه انشطتها مرتبط مرتبطه يرتبط ويرتبط احتياج احتياجات مستخدم مستخدمه المستخدمه بمحافظه محافظه لشركه " +
  "بالاضافه بالإضافة اضافه العديد عديد خلال ذلك كذلك ايضا أيضا فقط منذ عاما سنه سنوات اكثر أكثر اكبر أكبر بين عبر حتي حتى لدي لدى بها به لها له " +
  "فيها فيه منها منه عليها عليه متنوع متنوعه واسع واسعه عالي عاليه ذات ذو اهم أهم رائد رائده احد احدي إحدى قد لقد ان أن إن تتخذ يتخذ مقرا مقر " +
  "تتميز يتميز تهدف يهدف تسعي تسعى تحرص يحرص توفر يوفر وتوفر ويوفر تضم يضم وتضم حلول متكامله متكامل اسم باسم المعروفه المعروف";
const FILLER = new Set(FILLER_RAW.split(/\s+/).map(w => canon(norm(w))).filter(Boolean));
const NOSEARCH = new Set([...GENERIC, ...FILLER]);
/* worker/build-index.js: may a description word go into the index? (a generic word stays: phrases use it — «الغازات الصناعية») */
export const indexable = k => !!k && k.length >= 2 && !STOP.has(k) && !FILLER.has(k);

/* ---------------- synonym groups ----------------
   EQUIV: every term is the same thing (tier 1). A term ending in «?» has other meanings too: it is matched when the query says it, but a
   query that says another term of the group does not expand to it («درافيل» → rollers, never every «رولات» of plastic film).
   A term with spaces is a phrase: all its words in the same record. */
const EQUIV = [
  /* industrial rollers (the Al-Atlal call): roller making, covering and engraving */
  ["rollers", "درافيل|درفيل|سلندرات?|سلندر?|سيلندر?|سيلندرات?|سلندرز?|رولات?|رولر|رولرات|رولرز|اسطوانات طباعه|اسطوانه طباعه|سلندرات طباعه|سلندر طباعه|سلندرات المطابع|سلندرات مطابع|" +
    "كسوه سلندرات|كسوه سلندر|كسوه الدرافيل|كسوه درافيل|كسوه رولات|تكسيه سلندرات|تكسيه درافيل|تكسيه رولات|تكسيه كاوتش|كسوه كاوتش|كسوه مطاط|تكسيه مطاط|تلبيس سلندرات|تلبيس درافيل|" +
    "درافيل كاوتش|درافيل مطاط|درافيل بولي يوريثان|سلندرات كاوتش|درافيل طباعه|درافيل الطحن|roller|rollers|roller covering|rubber roller|rubber rollers|polyurethane roller|polyurethane rollers|" +
    "printing cylinder|printing cylinders|printing roller|printing rollers|rubber covering|anilox|rouleau|rouleaux"],
  ["gas_cylinders", "اسطوانات غاز|اسطوانه غاز|اسطوانات بوتاجاز|اسطوانه بوتاجاز|انبوبه بوتاجاز|انابيب بوتاجاز|انبوبه غاز|اسطوانات اكسجين|اسطوانه اكسجين|سلندر غاز|سلندرات غاز|سلندر اكسجين|" +
    "سلندرات اكسجين|اسطوانات غاز مسال|gas cylinder|gas cylinders|lpg cylinder|lpg cylinders|oxygen cylinder|oxygen cylinders|cylinder?|cylinders?|bouteille de gaz|bouteilles de gaz"],
  ["hydraulic_cylinders", "سلندرات هيدروليك|سلندر هيدروليك|سلندرات هيدروليكيه|اسطوانات هيدروليك|اسطوانات هيدروليكيه|سلندرات هوا|سلندرات هواء|سلندرات نيوماتيك|اسطوانات هوائيه|" +
    "hydraulic cylinder|hydraulic cylinders|pneumatic cylinder|pneumatic cylinders|air cylinder|air cylinders|vérin|vérins"],
  /* industrial and medical gases */
  ["oxygen", "اكسجين|oxygen|o2|oxygène"],
  ["nitrogen", "نيتروجين|نتروجين|nitrogen|azote"],
  ["argon", "ارجون|ارغون|argon"],
  ["acetylene", "استيلين|اسيتيلين|acetylene|acétylène"],
  ["co2", "co2|ثاني اكسيد الكربون|ثانى اكسيد الكربون|carbon dioxide|dioxyde de carbone"],
  ["hydrogen", "هيدروجين|hydrogen|hydrogène"],
  ["helium", "هيليوم|helium|hélium"],
  ["cng", "cng|غاز طبيعي مضغوط|الغاز الطبيعي المضغوط|compressed natural gas"],
  ["lpg", "lpg|بوتاجاز|غاز مسال|غاز البترول المسال|butane|بوتان|liquefied petroleum gas"],
  ["natural_gas", "غاز طبيعي|natural gas|gaz naturel"],
  ["valves", "صمامات|صمام|بلوف|بلف|محابس|محبس|valve|valves|vanne|vannes|robinet"],
  ["regulators", "منظمات|منظم|ريجيلاتير|ريجولاتير|ريجيليتر|regulator|regulators|pressure regulator|détendeur"],
  ["gauges", "مانومتر|مانومترات|عدادات ضغط|pressure gauge|pressure gauges|manometer|manomètre"],
  ["pressure_vessels", "اوعيه ضغط|خزانات ضغط|pressure vessel|pressure vessels|réservoir sous pression"],
  ["tanks", "خزانات|خزان|tank|tanks|réservoir|réservoirs"],
  /* roller services */
  ["hard_chrome", "هارد كروم|كروم صلب|طلاء كروم|طلاء بالكروم|hard chrome|chrome plating|chromage"],
  ["grinding", "تجليخ|grinding|rectification"],
  ["polyurethane", "بولي يوريثان|بولي يوريثين|polyurethane|polyuréthane"],
  ["silicone", "سيليكون|silicone"],
  ["vulcollan", "فولكولان|vulkollan|vulcollan"],
  /* materials */
  ["steel", "حديد|صلب|steel|iron|acier|fer"],
  ["rebar", "حديد تسليح|حديد التسليح|اسياخ حديد|سيخ حديد|اسياخ|rebar|reinforcing bar|reinforcement steel|deformed bar|fer à béton|rond à béton"],
  ["stainless", "ستانلس|استانلس|ستانلس ستيل|stainless|stainless steel|inox"],
  ["aluminium", "الومنيوم|المونيوم|الومينيوم|المنيوم|aluminium|aluminum"],
  ["copper", "نحاس|copper|cuivre"],
  ["brass", "نحاس اصفر|brass|laiton"],
  ["plastics", "بلاستيك|plastic|plastics|plastique"],
  ["pvc", "pvc|بي في سي|upvc"],
  ["polyethylene", "بولي ايثيلين|بولي اثيلين|بولي ايثلين|polyethylene|polyéthylène|pe"],
  ["polypropylene", "بولي بروبلين|بولي بروبيلين|polypropylene|polypropylène|pp"],
  ["rubber", "مطاط|كاوتش|كاوتشوك|rubber|caoutchouc"],
  ["paper", "ورق|paper|papier"],
  ["carton", "كرتون|كراتين|كارتون|carton|cartons|cardboard|corrugated|corrugated board"],
  ["glass", "زجاج|glass|verre"],
  ["ceramics", "سيراميك|ceramic|ceramics|céramique"],
  ["marble", "رخام|marble|marbre"],
  ["granite", "جرانيت|granite|granit"],
  ["cement", "اسمنت|cement|ciment"],
  ["concrete", "خرسانه|concrete|béton"],
  ["gypsum", "جبس|gypsum|plâtre"],
  ["bricks", "طوب|brick|bricks|brique|briques"],
  ["wood", "خشب|اخشاب|wood|timber|bois"],
  ["leather", "جلود|جلد|leather|cuir"],
  ["cotton", "قطن|cotton|coton"],
  ["fiberglass", "فيبر جلاس|فيبرجلاس|فايبر جلاس|fiberglass|fibreglass|grp"],
  /* chemicals */
  ["chemicals", "كيماويات|كيماوي|كيميائي|chemical|chemicals|chimique|produits chimiques"],
  ["paints", "دهانات|بويات|طلاء|paint|paints|peinture"],
  ["inks", "احبار|حبر|ink|inks|encre"],
  ["adhesives", "غراء|لواصق|مواد لاصقه|adhesive|adhesives|glue|colle"],
  ["detergents", "منظفات|مواد تنظيف|detergent|detergents|cleaning products|cleaning materials|détergent"],
  ["soap", "صابون|soap|savon"],
  ["disinfectants", "مطهرات|disinfectant|disinfectants|sanitizer|désinfectant"],
  ["fertilizers", "اسمده|سماد|fertilizer|fertilizers|fertiliser|engrais"],
  ["pesticides", "مبيدات|مبيد|pesticide|pesticides|insecticide|pesticides"],
  ["feed", "اعلاف|علف|animal feed|fodder"],
  ["cosmetics", "مستحضرات تجميل|كوزمتكس|cosmetics|cosmétiques"],
  /* pharma & medical */
  ["medicines", "دواء|ادويه|medicine|medicines|drug|drugs|pharmaceutical|pharmaceuticals|pharma|médicament|médicaments"],
  ["medical_supplies", "مستلزمات طبيه|مستهلكات طبيه|medical supplies|medical consumables|medical disposables"],
  ["medical_devices", "اجهزه طبيه|معدات طبيه|medical equipment|medical devices|équipement médical"],
  ["syringes", "سرنجات|سرنجه|syringe|syringes|seringue"],
  /* food */
  ["food", "مواد غذائيه|اغذيه|غذائيه|food|foods|foodstuff|alimentaire"],
  ["sugar", "سكر|sugar|sucre"],
  ["flour", "دقيق|flour|farine"],
  ["rice", "ارز|رز|rice|riz"],
  ["dairy", "البان|dairy|produits laitiers"],
  ["milk", "لبن|حليب|milk|lait"],
  ["cheese", "جبن|جبنه|cheese|fromage"],
  ["juice", "عصائر|عصير|juice|juices|jus"],
  ["pasta", "مكرونه|مكرونات|معكرونه|pasta|macaroni|pâtes"],
  ["sweets", "حلويات|حلوي|sweets|confectionery|candy|confiserie"],
  ["chocolate", "شوكولاته|شيكولاته|شوكولاتة|chocolate|chocolat"],
  ["biscuits", "بسكويت|biscuit|biscuits|cookies"],
  ["spices", "توابل|بهارات|spices|épices"],
  ["herbs", "اعشاب|عشب|herbs|herbes"],
  ["tea", "شاي|tea|thé"],
  ["coffee", "قهوه|بن|coffee|café"],
  ["edible_oil", "زيت طعام|زيوت طعام|زيوت نباتيه|زيت نباتي|cooking oil|edible oil|vegetable oil|huile alimentaire"],
  ["olive_oil", "زيت زيتون|olive oil|huile d olive"],
  ["meat", "لحوم|لحم|meat|viande"],
  ["poultry", "دواجن|فراخ|poultry|chicken|volaille"],
  ["fish", "اسماك|سمك|fish|seafood|poisson"],
  ["water_bottled", "مياه معدنيه|مياه شرب معبأه|bottled water|mineral water|eau minérale"],
  /* tableware (the glass dessert-plate calls, 2ec88a5b) */
  ["plates", "اطباق|طبق|صحون|صحن|plate|plates|dish|dishes|assiette|assiettes"],
  ["tableware", "ادوات مائده|اطقم سفره|اطقم مائده|tableware|dinnerware|vaisselle"],
  ["cups", "اكواب|كوب|كاسات|كاس|فناجين|فنجان|mug|mugs|cup|cups|tasse"],
  /* textiles, clothes, furniture */
  ["textiles", "نسيج|منسوجات|textile|textiles"],
  ["garments", "ملابس|ملابس جاهزه|garment|garments|clothing|apparel|clothes|vêtements"],
  ["yarn", "غزل|خيوط|خيط|yarn|thread|fil"],
  ["fabrics", "اقمشه|قماش|fabric|fabrics|tissu"],
  ["abayas", "عبايات|عبايه|abaya|abayas"],
  ["womens", "حريمي|نسائي|نسائيه|women|womens|ladies|femme"],
  ["uniforms", "يونيفورم|زي موحد|uniform|uniforms"],
  ["shoes", "احذيه|حذاء|شوز|shoes|footwear|chaussures"],
  ["carpets", "سجاد|موكيت|carpet|carpets|rug|rugs|tapis"],
  ["furniture", "اثاث|موبيليا|furniture|meubles"],
  ["upholstery", "تنجيد|upholstery|tapisserie"],
  ["hinges", "مفصلات|مفصله|مفصلة|hinge|hinges|charnière"],
  ["edge_banding", "شريط حرف|شرائط حرف|edge banding|edge band|edgeband"],
  /* electrical */
  ["cables", "كابلات|كابل|اسلاك|سلك|cable|cables|wire|wires|câble|câbles"],
  ["transformers", "محولات|محول|transformer|transformers|transformateur"],
  ["generators", "مولدات|مولد|generator|generators|genset|gensets|groupe électrogène"],
  ["lighting", "اناره|لمبات|لمبه|مصابيح|مصباح|كشافات|كشاف|lighting|lamp|lamps|bulb|bulbs|luminaire|éclairage"],
  ["led", "ليد|led"],
  ["solar", "الواح شمسيه|لوح شمسي|خلايا شمسيه|طاقه شمسيه|solar panel|solar panels|photovoltaic|solar|panneaux solaires"],
  ["switchgear", "لوحات توزيع|لوحات كهربائيه|لوحه توزيع|switchgear|switchboard|distribution board|panel board"],
  ["breakers", "قواطع|قاطع|circuit breaker|circuit breakers|breaker|breakers|disjoncteur"],
  ["batteries", "بطاريات|بطاريه|battery|batteries|batterie"],
  ["motors", "موتورات|موتور|محركات كهربائيه|motor|motors|moteur"],
  ["electronics", "الكترونيات|الكترونيه|electronics|électronique"],
  /* machines and mechanical parts */
  ["pumps", "طلمبات|طلمبه|مضخات|مضخه|pump|pumps|pompe|pompes"],
  ["compressors", "ضواغط|ضاغط|كمبروسر|كومبروسر|كمبريسور|كومبريسور|compressor|compressors|air compressor|air compressors|compresseur"],
  ["hydraulics", "هيدروليك|هيدروليكي|هيدروليكيه|hydraulic|hydraulics|hydraulique"],
  ["pneumatics", "نيوماتيك|هوائيه|pneumatic|pneumatics|pneumatique"],
  ["bearings", "رولمان بلي|رولمانات|رولمان|bearing|bearings|roulement|roulements"],
  ["gears", "تروس|ترس|جيربوكس|gear|gears|gearbox|engrenage"],
  ["belts", "سيور|سير|belt|belts|conveyor belt|courroie"],
  ["conveyors", "سيور ناقله|نواقل|conveyor|conveyors|convoyeur"],
  ["filters", "فلاتر|فلتر|filter|filters|filtre|filtres"],
  ["hoses", "خراطيم|خرطوم|hose|hoses|tuyau flexible"],
  ["boilers", "غلايات|غلايه|boiler|boilers|chaudière"],
  ["chillers", "تشيلر|تشيلرات|chiller|chillers"],
  ["ac", "تكييف|تكييفات|مكيفات|مكيف|air conditioner|air conditioners|air conditioning|hvac|climatiseur|climatisation"],
  ["refrigeration", "تبريد|refrigeration|cold storage|réfrigération"],
  ["elevators", "مصاعد|مصعد|اسانسير|اسانسيرات|elevator|elevators|lift|lifts|ascenseur"],
  ["cranes", "اوناش|ونش|رافعات|رافعه|crane|cranes|grue|grues"],
  ["forklifts", "كلارك|فورك ليفت|forklift|forklifts|chariot élévateur"],
  ["molds", "اسطمبات|اسطمبه|قوالب|قالب|mold|molds|mould|moulds|moule|moules"],
  ["machines", "ماكينات|ماكينه|machine|machines|machinery|machinerie"],
  ["spare_parts", "قطع غيار|spare parts|spare part|pièces de rechange|pièces détachées"],
  ["welding", "لحام|welding|soudure"],
  ["cnc", "cnc|سي ان سي"],
  /* «طفاية» alone is also an ashtray (a glassware maker's «الطفايات»): only «طفاية حريق» is the extinguisher */
  ["fire_extinguishers", "طفايات?|طفايه?|طفايات حريق|طفايه حريق|طفايات الحريق|اسطوانات اطفاء|fire extinguisher|fire extinguishers|extincteur|extincteurs"],
  ["fire_fighting", "مكافحه حريق|مكافحه الحريق|اطفاء|انذار حريق|fire fighting|firefighting|fire alarm|fire protection|incendie"],
  ["cctv", "كاميرات مراقبه|كاميرات|cctv|surveillance camera|security cameras|vidéosurveillance"],
  /* pipes, packaging, building */
  ["pipes", "مواسير|ماسوره|انابيب|انبوب|انبوبه|خطوط مواسير|pipe|pipes|piping|tube|tubes|tubing|tuyau|tuyaux"],
  ["packaging", "تغليف|تعبئه وتغليف|packaging|emballage"],
  ["bags", "اكياس|كيس|شنط|شكاير|شكائر|bag|bags|sack|sacks|sac|sacs"],
  ["bottles", "زجاجات|زجاجه|بطري|bottle|bottles|bouteille|bouteilles"],
  ["cans", "علب|علبه|cans|can|tin|tins|boîte"],
  ["jerrycans", "جراكن|جركن|jerrycan|jerrycans"],
  ["barrels", "براميل|برميل|drum|drums|barrel|barrels|fût|fûts"],
  ["pallets", "باليتات|باليته|طبالي|pallet|pallets|palette|palettes"],
  ["labels", "ليبل|ليبلات|ستيكر|ستيكرات|ملصقات|label|labels|sticker|stickers|étiquette|étiquettes"],
  ["film", "شرنك|استرتش|استريتش|stretch film|shrink film|stretch|shrink"],
  ["foil", "فويل|رقائق الومنيوم|foil|aluminium foil|aluminum foil"],
  ["insulation", "عوازل|عزل|insulation|isolation"],
  ["doors", "ابواب|باب|door|doors|porte|portes"],
  ["windows", "شبابيك|شباك|نوافذ|window|windows|fenêtre|fenêtres"],
  ["paving", "انترلوك|بلدورات|interlock|paving|pavers|pavés"],
  ["tiles", "بلاط|tiles|tile|carrelage"],
  ["sanitary", "ادوات صحيه|اطقم حمامات|sanitary ware|sanitaryware|sanitaires"],
  /* fuels */
  ["petroleum", "بترول|بترولي|بتروليه|نفط|petroleum|oil and gas|pétrole"],
  ["fuel", "وقود|سولار|ديزل|مازوت|fuel|diesel|gasoline|carburant|gasoil"],
  ["lubricants", "زيوت تشحيم|شحوم|زيوت محركات|lubricant|lubricants|grease|lubrifiant|lubrifiants"],
  ["asphalt", "اسفلت|بيتومين|asphalt|bitumen|bitume"],
  /* vehicles */
  ["tyres", "اطارات|كاوتش سيارات|tyre|tyres|tire|tires|pneu|pneus"],
  ["car_parts", "قطع غيار سيارات|مكونات سيارات|الصناعات المغذيه|auto parts|car parts|automotive parts|pièces auto"],
];
/* RELATED (tier 2): worker-intel/src/terms.js RAW_GROUPS (ids, terms, «not» phrases dropped: they need word order; «$» = whole word) */
const RELATED = [
  ["steel", "حديد|صلب$|حديد تسليح|حديد التسليح|اسياخ|اسياخ حديد|سيخ حديد|بليت|بيليت|خام الحديد|خامات الحديد|حديد خرده|خرده حديد|خرده الحديد|صاج|مجلفن|جلفنه|مقاطع حديد|قطاعات حديد|حديد انشائي|هياكل حديد|هياكل معدنيه|حديد مشغول|ستانلس|استانلس|كمرات حديد|زوايا حديد|لفائف حديد|لفائف الصلب|مسطحات الصلب|مواسير حديد|مواسير صلب|مواسير مجلفنه|steel|iron$|rebar|re bar|reinforcing bar|reinforcement bar|reinforcing steel|reinforcement steel|deformed bar|round bar|steel bar|mild steel|steel billet|wire rod|steel wire|steel sheet|steel plate|steel coil|hot rolled|cold rolled|galvaniz|galvanis|gi pipe|gi sheet|structural steel|steel structure|steel beam|i beam|h beam|angle iron|channel iron|stainless|scrap metal|scrap iron|iron ore|pig iron|cast iron|acier|fer$|fer à béton|rond à béton|ronds à béton|tôle$|tôles|galvanisé|poutrelle|ferraille|ferronnerie"],
  ["metals", "معادن|معدن$|معدني|معدنيه|مسبوكات|سبائك|metal$|metals|metallic|metalwork|alloy|alloys|casting$|castings|foundry|metallurg|métal$|métaux|métallique|fonderie", ["steel", "aluminium", "copper"]],
  ["aluminium", "الومنيوم|المونيوم|الومينيوم|aluminium|aluminum"],
  ["copper", "نحاس|نحاسي|نحاسيه|copper|brass|bronze|cuivre|laiton"],
  ["cables", "كابلات|كابل$|كابلات كهرباء|كابلات كهربائيه|كابلات الكهرباء|اسلاك|اسلاك كهرباء|موصلات|cable|cabling|wire$|wiring|conductor|câble|câblage"],
  ["electrical", "كهرباء|كهربائي|كهربائيه|كهربيه|محولات|محول كهربائي|لوحات كهربائيه|لوحات توزيع|لوحه توزيع|قواطع|مفاتيح كهربائيه|اناره|كشافات|لمبات|مصابيح|مولدات|مولد كهربائي|خلايا شمسيه|الواح شمسيه|طاقه شمسيه|electrical|electric$|electricity|transformer|switchgear|switchboard|distribution board|panel board|circuit breaker|lighting|luminaire|lamps|led light|led lamp|street light|generator|genset|solar panel|solar pv|photovoltaic|inverter|électrique|transformateur|éclairage|groupe électrogène|panneaux solaires|disjoncteur"],
  ["cement", "اسمنت|خرسانه|خرسانه جاهزه|طوب$|بلوكات|بلوك$|رمل$|زلط|جبس|مواد بناء|مواد البناء|كلنكر|cement|concrete|clinker|ready mix|readymix|brick|gypsum|aggregates|building materials|construction materials|ciment|béton|agrégats|matériaux de construction"],
  ["plastics", "بلاستيك|بلاستيكي|بولي ايثيلين|بولي اثيلين|بولي بروبلين|بولي بروبيلين|بي في سي|pvc|upvc|cpvc|hdpe|ldpe|lldpe|polyethylene|polypropylene|polystyrene|polymer|plastic|plastique|polyéthylène"],
  ["rubber", "مطاط|كاوتش|rubber|caoutchouc"],
  ["fertilizers", "اسمده|سماد|يوريا|نترات|سلفات|سوبر فوسفات|مخصبات|npk$|dap$|fertilizer|fertiliser|urea|ammonium nitrate|ammonium sulphate|ammonium sulfate|potash|engrais|urée"],
  ["pesticides", "مبيدات|مبيد$|pesticide|insecticide|herbicide|fungicide|agrochemical"],
  ["feed", "اعلاف|علف$|animal feed|fodder|feedstuff"],
  ["pharma", "ادويه|دواء|عقاقير|مستحضرات طبيه|مستحضرات صيدليه|مستلزمات طبيه|مستهلكات طبيه|لقاحات|لقاح$|امصال|محاليل|صيدليه|صيدلانيه|سرنجات|pharmaceutical|pharma$|pharmacy|medicine|drug$|drugs|medical supplies|medical supply|medical consumable|vaccine|syringe|bandage|infusion|médicament|produits pharmaceutiques|consommables médicaux|vaccin"],
  ["medical_equipment", "اجهزه طبيه|معدات طبيه|اجهزه معمليه|معدات معمليه|مستلزمات معامل|medical equipment|medical device|hospital equipment|laboratory equipment|lab equipment|x ray|ultrasound|dialysis|équipement médical|matériel médical|dispositifs médicaux"],
  ["food", "اغذيه|غذائيه|مواد غذائيه|منتجات غذائيه|سلع غذائيه|طعام|سكر$|دقيق القمح|دقيق قمح|دقيق مدعم|دقيق المدعم|دقيق فاخر|طحين|مطاحن|قمح|ارز$|رز$|ذره$|فول$|عدس$|البان|منتجات البان|لبن$|حليب|لحوم|دواجن|اسماك|خضروات|خضار|فاكهه|فواكه|تمور|عصائر|شاي$|قهوه|زيت طعام|زيوت طعام|زيت الطعام|زيوت نباتيه|زيت نباتي|زيت زيتون|مكرونه|معلبات|food|foodstuff|sugar|flour|wheat|rice$|maize|corn$|beans|lentils|dairy|milk$|meat$|meats|poultry|fish$|seafood|vegetable$|vegetables|fruit$|fruits|juice|tea$|coffee|cooking oil|edible oil|vegetable oil|sunflower oil|olive oil|pasta|canned food|cereal|grain$|grains|alimentaire|denrées|riz$|farine|sucre|huile alimentaire|lait$|viande|céréales|vivres"],
  ["agri", "زراعه|زراعي|زراعيه|حاصلات زراعيه|محاصيل|بذور|تقاوي|شتلات|جرارات|انظمه الري|انظمه ري|نظم الري|نظم ري|شبكات الري|شبكات ري|معدات الري|معدات ري|مستلزمات الري|مستلزمات ري|مياه الري|قنوات الري|محطات الري|الري بالتنقيط|ري بالتنقيط|الري الحديث|ري حديث|الري المحوري|ري محوري|مستلزمات زراعيه|صوب زراعيه|agriculture|agricultural|agri$|agro|farming|farmer|irrigation|tractor|seeds|seedling|greenhouse|harvest|agricole|semences|tracteur"],
  ["textiles", "غزل$|نسيج|منسوجات|اقمشه|قماش|ملابس|ملابس جاهزه|مفروشات|زي موحد|زي رسمي|يونيفورم|قطن$|اقطان|بطاطين|بطانيات|ستائر|خيوط|صوف$|textile|garment|apparel|clothing|uniform$|uniforms|fabric$|fabrics|yarn|cotton|linen|bedding|blanket|curtain|wool$|tents|vêtement|tissu|uniformes|coton|habillement|literie|confection$"],
  ["chemicals", "كيماويات|كيماويه|كيميائيه|كيميائي|كيماوي|مواد كيميائيه|بتروكيماويات|ميثانول|امونيا|صودا كاويه|كلور$|احماض|حمض$|مذيبات|راتنجات|كواشف|chemical|petrochemical|methanol|ammonia|caustic soda|chlorine|acid$|acids|solvent|resin|reagent|chimique|produits chimiques|réactifs"],
  ["detergents", "منظفات|صابون|مطهرات|مواد تنظيف|detergent|soap$|soaps|disinfectant|sanitizer|sanitiser|cleaning products|cleaning materials|savon|détergent|désinfectant"],
  ["paints", "دهانات|طلاء|بويات|احبار|ورنيش|paint$|paints|coating|ink$|inks|varnish|peinture|vernis"],
  ["paper", "ورق$|ورقه|ورقي|ورقيه|كرتون|كراتين|مناديل|paper|carton|cardboard|corrugated board|tissue paper|kraft|papier"],
  ["glass", "زجاج|زجاجي|زجاجيه|glass|glassware|glazing|verre$|vitrage"],
  ["ceramics", "سيراميك|بورسلين|بورسلان|خزف|بلاط|ادوات صحيه|رخام|جرانيت|حجر$|احجار|ceramic|porcelain|tiles|tile$|tiling|sanitary ware|marble|granite|stone$|stones|céramique|carrelage|marbre|granit$|faïence"],
  ["petroleum", "بترول$|بترولي|بتروليه|منتجات بتروليه|مشتقات بتروليه|نفط$|نفطي|نفطيه|وقود|سولار|ديزل|بنزين|مازوت|كيروسين|غاز طبيعي|غاز مسال|بوتاجاز|زيوت تشحيم|زيوت محركات|شحوم|اسفلت|بيتومين|petroleum|fuel|diesel|gasoline|petrol$|kerosene|jet fuel|lpg$|lubricant|bitumen|asphalt|fuel oil|crude oil|oil and gas|oil products|carburant|gasoil|gazole|lubrifiant|bitume|produits pétroliers"],
  ["packaging", "تعبئه|تغليف|عبوات|عبوه|اكياس|علب$|زجاجات|برطمانات|مواد تعبئه|مواد تغليف|packaging|packing material|bags$|sacks|bottles|jars$|pouches|stretch film|shrink film|crates|pallets|emballage|sacs$|flacons|bouteilles"],
  ["autoparts", "قطع غيار|قطع الغيار|قطع غيار سيارات|اطارات|كاوتش سيارات|بطاريات|بطاريه|فلاتر|فرامل|مكونات سيارات|الصناعات المغذيه|ضفائر|spare parts|auto parts|automotive parts|car parts|vehicle parts|motor parts|tyre|tyres|tire$|tires|batteries|battery|filters|brake$|brakes|bearings|pièces de rechange|pièces détachées|pneus|pneumatiques"],
  ["vehicles", "سيارات|سياره|مركبات|شاحنات|اتوبيسات|حافلات|ميكروباص|موتوسيكلات|دراجات ناريه|vehicle|car$|cars|truck|bus$|buses|pickup|pick up|ambulance|motorcycle|vans|véhicule|camion|autobus|automobile|automotive"],
  ["machinery", "ماكينات|ماكينه|الات$|خطوط انتاج|خط انتاج|معدات صناعيه|معدات مصانع|مكابس|مخارط|machinery|machine$|machines|production line|industrial equipment|plant equipment|machine tools|lathe|cnc$|machinerie|équipements industriels"],
  ["pumps", "طلمبات|طلمبه|مضخات|مضخه|ضواغط|كمبروسر|كمبريسور|هيدروليك|صمامات|محابس|pump$|pumps|pumping|compressor|hydraulic|valve$|valves|pompe|pompes|compresseur|vanne|vannes"],
  ["heavy_equipment", "معدات ثقيله|رافعات|اوناش|ونش$|لوادر|لودر|حفارات|حفار$|بلدوزر|جريدر|مصاعد|سلالم متحركه|heavy equipment|heavy machinery|crane$|cranes|excavator|loader|bulldozer|grader|forklift|elevator|lift$|lifts|escalator|grue|grues|ascenseur|engins"],
  ["construction", "مقاولات|مقاولات عامه|انشاءات|تشييد|اعمال مدنيه|اعمال انشائيه|اعمال الانشاء|انشاء مباني|انشاء مبني|انشاء مدارس|انشاء طرق|مباني|مبني$|رصف|الطرق والكباري|طرق وكباري|كباري|كوبري|جسور|ترميم|تشطيبات|تشطيب|اعاده تاهيل|صيانه مباني|بنيه تحتيه|construction|civil works|building works|building$|buildings|road$|roads|bridge$|bridges|rehabilitation|renovation|refurbishment|paving|earthworks|contractor|infrastructure|travaux|génie civil|réhabilitation|bâtiment|voirie|route$|routes|chaussée|ouvrages"],
  ["water", "مياه$|محطات مياه|محطه مياه|معالجه مياه|معالجه المياه|صرف صحي|تحليه|محطات تحليه|شبكات مياه|مياه الشرب|water treatment|wastewater|waste water|sewage|sewerage|desalination|water supply|drinking water|sanitation|water network|eau potable|assainissement|épuration|adduction d eau"],
  ["it", "كمبيوتر|كمبيوترات|حاسب الي|حاسبات|حواسب|اجهزه كمبيوتر|برمجيات|شبكات حاسب|شبكات معلومات|سيرفر|سيرفرات|خوادم|طابعات|لاب توب|تكنولوجيا المعلومات|computer|laptop|software|server$|servers|computer network|networking equipment|printer|it equipment|ict$|data center|data centre|informatique|ordinateur|logiciel|serveur"],
  ["safety", "مكافحه حريق|مكافحه الحريق|اطفاء|طفايات|انذار حريق|كاميرات مراقبه|انظمه مراقبه|مهمات وقايه|معدات سلامه|ملابس واقيه|fire fighting|firefighting|fire extinguisher|fire alarm|fire protection|fire suppression|cctv|surveillance camera|ppe$|personal protective|safety equipment|protective equipment|sécurité incendie|extincteur|vidéosurveillance"],
  ["hvac", "تكييف|تكييفات|مكيفات|تبريد|غلايات|مراوح|تهويه|تشيلر|air conditioning|air conditioner|hvac|chiller|boiler|refrigeration|cold storage|ventilation|climatisation|climatiseur|chaudière"],
  ["appliances", "اجهزه منزليه|ثلاجات|غسالات|بوتاجازات|شاشات|تلفزيونات|سخانات|home appliances|household appliances|refrigerator|fridges|washing machine|television|tv sets|water heater|électroménager"],
  ["printing", "طباعه|مطبوعات|مطابع|لافتات|دعايه واعلان|printing|printed materials|signage|banners|imprimerie"],
  ["catering", "معدات مطابخ|معدات المطابخ|معدات فندقيه|تجهيزات فندقيه|ادوات مطبخ|catering|kitchen equipment|hotel equipment|restauration|équipement de cuisine"],
  ["transport", "نقل وشحن|خدمات لوجستيه|لوجستيات|شحن بحري|شحن جوي|موانئ|ملاحه|shipping|freight|logistics|haulage|cargo|transportation|fret$|logistique|transport de marchandises"],
  ["mining", "تعدين|محاجر|محجر|خامات|خام$|منجم|مناجم|فوسفات|كاولين|فلسبار|mining|quarry|quarries|ore$|ores|minerals|mine$|mines|minier|minière|carrière"],
  ["pipes", "مواسير|ماسوره|انابيب|انبوب|انبوبه|خطوط مواسير|pipe$|pipes|piping|pipework|tube$|tubes|tubing|tuyau|tuyaux|canalisation"],
  ["sheets", "الواح|لوح$|صفائح|sheet$|sheets|sheeting|plate$|plates|coil$|coils|plaques"],
  /* the new fields (lookup-index): industrial / medical gases as one field, rollers and their services */
  ["gases", "اكسجين|نيتروجين|نتروجين|ارجون|استيلين|اسيتيلين|ثاني اكسيد الكربون|هيليوم|غازات صناعيه|غازات طبيه|الغازات الصناعيه|الغازات الطبيه|غازات|غاز$|نتروز|industrial gases|medical gases|industrial gas|medical gas|oxygen|nitrogen|argon|acetylene|carbon dioxide|gaz industriels|gaz médicaux"],
  ["roller_work", "درافيل|درفيل|كسوه سلندرات|كسوه درافيل|تكسيه سلندرات|تجليخ|هارد كروم|طلاء كروم|بولي يوريثان|فولكولان|سيليكون|مطاط|كاوتش|roller|rollers|grinding|hard chrome|polyurethane|vulcollan|silicone|rubber"],
];
/* one word with several meanings: when the query is that word alone, the text says so in one line (the persona asks ONE question) and
   the other meanings come as tier 2 */
const AMBIG = [
  ["سلندر|سلندرات|سيلندر|سيلندرات|سلندرز|cylinder|cylinders", ["rollers", "gas_cylinders", "hydraulic_cylinders"],
    "درافيل أو سلندرات طباعة وكسوتها، أو أسطوانات غاز (بوتاجاز أو أكسجين)، أو سلندرات هيدروليك وهوا"],
  ["اسطوانه|اسطوانات", ["gas_cylinders", "hydraulic_cylinders", "rollers"], "أسطوانات غاز (بوتاجاز أو أكسجين)، أو أسطوانات هيدروليك وهوا، أو أسطوانات طباعة"],
  ["رولات|رول", ["rollers"], "درافيل وسلندرات للماكينات، أو رولات بلاستيك أو فويل أو ورق"],
  ["انبوبه|انابيب", ["pipes", "gas_cylinders"], "مواسير وأنابيب، أو أنبوبة بوتاجاز (أسطوانة غاز)"],
  ["طفايه|طفايات", ["fire_extinguishers"], "طفايات حريق، أو طفايات سجاير (أدوات منزلية)"],
];

/* ---------------- compiled groups ---------------- */
/* a term → {key: canon words joined by spaces, toks: [canon words], raws: [the normalised words], amb: has other meanings, prefix: a Latin
   word-start term of worker-intel (no «$»: "galvaniz" → galvanized)} */
function term(raw) {
  raw = String(raw).trim(); if (!raw) return null;
  const amb = raw.endsWith("?"); let body = amb ? raw.slice(0, -1) : raw;
  const whole = body.endsWith("$"); if (whole) body = body.slice(0, -1);
  const raws = words(body).filter(w => canon(w)); if (!raws.length) return null;
  const toks = raws.map(canon);
  const latin = toks.length === 1 && /^[a-z]+$/.test(toks[0]);
  return { key: toks.join(" "), toks, raws, amb, prefix: latin && !whole && toks[0].length >= 5 };
}
function compile(list, tier) {
  return list.map(([id, terms, inc]) => ({ id, tier, inc: inc || [], terms: terms.split("|").map(term).filter(Boolean) }));
}
/* the compiled groups, built on the first lookup of an isolate (not at start-up: every route of the Worker loads this module) */
let G0 = null;
function G() {
  if (G0) return G0;
  const EQ = compile(EQUIV, 1), REL = compile(RELATED, 2), EQ_ID = new Map(EQ.map(g => [g.id, g])), REL_ID = new Map(REL.map(g => [g.id, g]));
  const KEY_EQ = new Map(), KEY_REL = new Map(); // term key → the groups it is a term of
  for (const [M, GR] of [[KEY_EQ, EQ], [KEY_REL, REL]]) for (const g of GR) for (const t of g.terms) { if (!M.has(t.key)) M.set(t.key, []); if (!M.get(t.key).includes(g)) M.get(t.key).push(g); }
  const AMB = new Map();
  for (const [ws, ids, note] of AMBIG) for (const w of ws.split("|")) AMB.set(canon(norm(w)), { ids, note, word: w });
  const PHRASE_BY_FIRST = new Map(); // a phrase of the groups by its first word (phraseTokens)
  for (const g of [...EQ, ...REL]) for (const t of g.terms) if (t.toks.length > 1) { const k = t.toks[0]; if (!PHRASE_BY_FIRST.has(k)) PHRASE_BY_FIRST.set(k, new Set()); PHRASE_BY_FIRST.get(k).add(t.toks.join(" ")); }
  G0 = { EQ, REL, EQ_ID, REL_ID, KEY_EQ, KEY_REL, AMB, PHRASE_BY_FIRST };
  return G0;
}
const MAX_N = 4; // the longest phrase a query is read by
/* ---------------- phrases ----------------
   A phrase of the groups («اسطوانات غاز», «كسوة سلندرات», «حديد تسليح») matches only where its words stand together: the index stores it
   as ONE token («اسطوان_غاز», phraseToken) wherever a text has it — with the article or one attached letter on its words, never across
   a comma or a full stop. worker/build-index.js (the directory) and src/index.js (the small lists) both use phraseTokens(). */
export const phraseToken = toks => toks.join("_");
const atPos = w => { const o = [canon(w)]; if (/^[وبلفك]/.test(w) && w.length - 1 >= 3) o.push(canon(w.slice(1))); if (/^لل/.test(w) && w.length >= 5) o.push(canon("ال" + w.slice(2))); return o; };
export function phraseTokens(s) {
  const out = new Set(), PB = G().PHRASE_BY_FIRST;
  for (const seg of String(s || "").split(/[،,.;؛:()\[\]{}«»"\n\r\t|!؟?–—-]+/)) {
    const ws = words(seg); if (ws.length < 2) continue;
    const seq = ws.map(atPos);
    for (let i = 0; i < seq.length - 1; i++) for (const f of seq[i]) {
      const ps = PB.get(f); if (!ps) continue;
      for (const p of ps) { const pt = p.split(" "); if (i + pt.length > seq.length) continue; let ok = true; for (let j = 1; j < pt.length && ok; j++) ok = seq[i + j].includes(pt[j]); if (ok) out.add(phraseToken(pt)); }
    }
  }
  return [...out];
}
/* the version of canon() + the phrases, for the test that data.json f[6] was built with this file (data.json lk) */
const PROBE = "اسطوانات الأدوية ألبان ألواح الإلكترونيات أكسجين درافيل غازات الأنابيب مواسير شمسية طبية حلويات السلندرات rollers batteries boxes";
export function lookupVersion() {
  let h = 0; const s = PROBE.split(" ").map(w => canon(norm(w))).join("|") + "#" + [...G().PHRASE_BY_FIRST.values()].flatMap(x => [...x]).sort().join("|");
  for (const ch of s) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return "lk1-" + h.toString(36);
}

/* ---------------- a query → concepts ----------------
   vocab(key) → how many records hold that stored form (0 = unknown word); it decides whether an attached «و» is «and» («ودرافيل») or the
   word's own first letter («ورق», «وقود», «وصلات»).
   → {concepts: [{label, part, alts: [{key, toks, tier, own}], amb?}], dropped: [generic words left out], parts: n}
   label = the words as the visitor said them; part = the list item it belongs to («سلندرات ودرافيل» = 2 alternatives, «لمبات ليد» = 1);
   own = the query's own word (or a term of the query's own phrase). */
export function concepts(query, vocab = () => 0) {
  const { EQ_ID, REL_ID, KEY_EQ, KEY_REL, AMB } = G();
  const toks = [];
  let part = 0;
  for (const chunk of String(query || "").slice(0, 200).split(/[,،؛;/|]+|\s+-\s+/)) {
    for (let w of words(chunk)) {
      if (LIST_WORDS.has(w)) { part++; continue; }
      /* an attached «و» / «ب» / «ل» / «لل»: the shorter word when the data knows it better */
      let k = canon(w);
      const cands = [];
      if (/^[وبلفك]/.test(w) && w.length - 1 >= 3) cands.push([w.slice(1), w[0] === "و"]);
      if (/^لل/.test(w) && w.length >= 5) cands.push(["ال" + w.slice(2), false]);
      for (const [c, isAnd] of cands) {
        const kc = canon(c);
        if (kc && kc !== k && vocab(kc) > vocab(k)) { if (isAnd && toks.length) part++; w = c; k = kc; break; }
      }
      toks.push({ w, k, part });
    }
    part++;
  }
  const out = { concepts: [], dropped: [], parts: 0 };
  const seen = new Map();
  const add = (label, alts, p, amb) => {
    const id = alts.map(a => a.key).sort().join("|");
    if (seen.has(id)) return;
    const c = { label, part: p, alts, ...(amb ? { amb } : {}) };
    seen.set(id, c); out.concepts.push(c);
  };
  const altsOf = (key, label) => {
    const alts = new Map(), put = (t, tier, own) => {
      const x = alts.get(t.key);
      if (x && x.tier <= tier && (x.own || !own)) return;
      alts.set(t.key, { key: t.key, toks: t.toks, raws: t.raws, prefix: !!t.prefix, tier: x ? Math.min(x.tier, tier) : tier, own: own || (x ? x.own : false) });
    };
    const self = term(label) || { key, toks: key.split(" "), raws: key.split(" "), amb: false };
    if (self.key !== key) { self.key = key; self.toks = key.split(" "); self.raws = self.toks; }
    put(self, 1, true);
    /* an EQUIV group: its other terms are the same thing (tier 1) — unless the query's own word is a term with other meanings
       («سلندرات»: then the group is one of its meanings, tier 2) */
    const eq = KEY_EQ.get(key) || [];
    for (const g of eq) {
      const ambHere = g.terms.some(t => t.key === key && t.amb);
      for (const t of g.terms) if (!t.amb || t.key === key) put(t, ambHere ? 2 : 1, false);
    }
    const rel = new Set(KEY_REL.get(key) || []);
    const am = key.indexOf(" ") < 0 ? AMB.get(key) : null;
    if (am) for (const id of am.ids) { const g = EQ_ID.get(id); if (g) for (const t of g.terms) if (!t.amb) put(t, 2, false); }
    for (const g of eq) if (g.terms.length < 40) for (const t of g.terms) for (const r of KEY_REL.get(t.key) || []) rel.add(r);
    for (const g of rel) { for (const t of g.terms) put(t, 2, false); for (const i of g.inc) { const h = REL_ID.get(i); if (h) for (const t of h.terms) put(t, 2, false); } }
    return { alts: [...alts.values()], amb: am ? { word: label, note: am.note } : null };
  };
  for (let i = 0; i < toks.length;) {
    let hit = null;
    for (let n = Math.min(MAX_N, toks.length - i); n >= 2 && !hit; n--) {
      const span = toks.slice(i, i + n); if (span.some(t => t.part !== span[0].part)) continue;
      const key = span.map(t => t.k).join(" ");
      if (KEY_EQ.has(key) || KEY_REL.has(key)) hit = { n, key, label: span.map(t => t.w).join(" ") };
    }
    if (hit) { const a = altsOf(hit.key, hit.label); add(hit.label, a.alts, toks[i].part, a.amb); i += hit.n; continue; }
    const t = toks[i++];
    if (!t.k || t.k.length < 2 || STOP.has(t.w) || STOP.has(t.k) || /^\d+$/.test(t.k)) continue;
    if (NOSEARCH.has(t.k)) { out.dropped.push(t); continue; }
    const a = altsOf(t.k, t.w); add(t.w, a.alts, t.part, a.amb);
  }
  /* a query of generic words only is searched as it is («منتجات صناعية» is still a question) */
  if (!out.concepts.length) for (const t of out.dropped.splice(0)) { const a = altsOf(t.k, t.w); add(t.w, a.alts, t.part, a.amb); }
  out.concepts = out.concepts.slice(0, 8);
  const parts = [...new Set(out.concepts.map(c => c.part))];
  out.concepts.forEach(c => { c.part = parts.indexOf(c.part); });
  out.parts = parts.length;
  return out;
}
/* every stored form word j of an alternative may take: the variants of its normalised word and of its stem («الأدوية» / «والأدوية»
   / «للأدوية» for «أدوية»), memoised per isolate */
const VAR = new Map();
export function altForms(alt, j) {
  const raw = alt.raws ? alt.raws[j] : alt.toks[j], tok = alt.toks[j], k = raw + "\u0001" + tok;
  let v = VAR.get(k); if (v) return v;
  v = /^[a-z0-9]+$/.test(tok) ? [tok] : [...new Set([...variants(raw), ...variants(tok)])];
  if (VAR.size < 20000) VAR.set(k, v);
  return v;
}
