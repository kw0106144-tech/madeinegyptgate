/* janna_lookup section=customers (U2, after the Al-Atlal call 8bacbfac: a roller maker asked for buyers and was shown his competitors).
   The query is the industries the SELLER says he serves, in his own words («ورق، كرتون، سكر، أسمنت، بلاستيك، تعبئة وتغليف»). Each term
   is mapped to the platform's own activity labels (the 38 values of data.json f[2] = data/regions.js MIGSECTORS) through the fixed
   CUST_MAP below; a term no label knows is matched against the companies' own words instead (src/index.js customers). Only words here:
   no data, no counts, no contacts. src/index.js does the counting (directory rows of type «مصنع» only; traders apart). */
import { norm, STOP } from "./text.js";
import { canon, isGeneric } from "./lookup-terms.js";

/* label → the words a seller uses for that industry (Arabic, English; normalised by norm(), matched by canon() word by word, a phrase
   as its words side by side). «ورق» is the paper industry only (review: mapping it to the printing houses too counted an industry the
   seller never named, «ورق وكرتون» +37 printers; a seller who serves printers says «مطابع»). A kind of CUSTOMER the directory does not
   list (hospitals, restaurants, shops: CUST_PLACE) is no label either: those words used to bring the makers of their equipment. */
export const CUST_MAP = [
  ["التعبئة والتغليف والورق", "ورق|ورقي|ورقيه|كرتون|كراتين|كارتون|كرتونه|تعبئه|تغليف|تعبئه وتغليف|مواد تعبئه|مواد تغليف|عبوات|عبوه|اكياس|كيس|شكاير|شكائر|علب|مناديل|" +
    "packaging|package|packing|paper|carton|cartons|cardboard|corrugated|boxes|bags|tissue|packaging and paper"],
  ["الطباعة والدعاية والإعلان", "طباعه|مطابع|مطبعه|مطبوعات|دعايه|اعلان|اعلانات|دعايه واعلان|لافتات|ليبل|ليبلات|ملصقات|printing|printers|printer|print|press|presses|advertising|signage|labels|printing and advertising"],
  ["الصناعات البلاستيكية والمطاط", "بلاستيك|بلاستيكي|بلاستيكيه|مطاط|كاوتش|كاوتشوك|بولي ايثيلين|بولي بروبلين|بي في سي|pvc|بلاستيك ومطاط|plastic|plastics|rubber|polymer|polymers|plastics and rubber"],
  ["مواد البناء والتشييد", "اسمنت|خرسانه|خرسانه جاهزه|طوب|جبس|بلوك|بلوكات|مواد بناء|مواد البناء|مواد تشييد|مواد التشييد|cement|concrete|bricks|brick|gypsum|building materials|construction materials"],
  ["الصناعات الغذائية والمشروبات", "اغذيه|غذائيه|غذائي|مواد غذائيه|صناعات غذائيه|مشروبات|سكر|البان|لبن|حليب|جبن|عصائر|عصير|حلويات|شوكولاته|بسكويت|مكرونه|دقيق|مطاحن|مخابز|زيوت طعام|زيت طعام|" +
    "لحوم|دواجن|معلبات|مياه معدنيه|مياه غازيه|food|foods|foodstuff|beverage|beverages|drinks|sugar|dairy|milk|juice|juices|confectionery|chocolate|biscuits|bakery|bakeries|flour|food and beverage"],
  ["الغزل والنسيج والملابس الجاهزة", "غزل|نسيج|منسوجات|ملابس|ملابس جاهزه|اقمشه|قماش|خيوط|مفروشات|textile|textiles|spinning|weaving|garments|garment|apparel|clothing|fabrics|fabric"],
  ["الكيماويات والبتروكيماويات", "كيماويات|كيماوي|كيميائي|كيميائيه|بتروكيماويات|chemicals|chemical|petrochemicals|petrochemical"],
  ["النفط والغاز والخدمات البترولية", "بترول|بترولي|بتروليه|نفط|غاز|غاز طبيعي|petroleum|oil and gas|natural gas"],
  ["الحديد والصلب والمعادن", "حديد|صلب|معادن|مسابك|درفله|الومنيوم|نحاس|steel|iron|metals|metal|foundry|foundries|aluminium|aluminum|copper"],
  ["الأدوية والمستلزمات الطبية", "ادويه|دواء|مستلزمات طبيه|مستحضرات طبيه|pharma|pharmaceutical|pharmaceuticals|medicines|medical supplies"],
  ["الأجهزة الطبية والعلمية والمعملية", "اجهزه طبيه|معدات طبيه|اجهزه معامل|معدات معامل|medical devices|medical equipment|laboratory equipment"],
  ["المنظفات والصابون", "منظفات|صابون|مطهرات|detergents|detergent|soap|soaps"],
  ["الدهانات والأحبار", "دهانات|بويات|احبار|حبر|paints|paint|inks|ink|coatings"],
  ["الأعلاف والأسمدة والمبيدات", "اعلاف|علف|اسمده|سماد|مبيدات|feed|fodder|fertilizers|fertilizer|pesticides"],
  ["الزراعة والمعدات الزراعية", "زراعه|زراعي|زراعيه|مزارع|agriculture|agricultural|farms|farming"],
  ["الزجاج والسيراميك", "زجاج|سيراميك|بورسلين|glass|ceramics|ceramic|porcelain"],
  ["الرخام والجرانيت", "رخام|جرانيت|marble|granite"],
  ["الأثاث والأخشاب", "اثاث|موبيليا|اخشاب|خشب|نجاره|furniture|wood|woodworking|timber"],
  ["السيارات والصناعات المغذية", "سيارات|الصناعات المغذيه|مكونات سيارات|automotive|cars|vehicles"],
  ["الأجهزة المنزلية والإلكترونيات", "اجهزه منزليه|الكترونيات|appliances|home appliances|electronics"],
  ["الكهرباء والكابلات والإضاءة", "كهرباء|كهربائيه|كابلات|اناره|electrical|electricity|cables|lighting"],
  ["الماكينات والمعدات الصناعية", "ماكينات|معدات صناعيه|machinery|machines|industrial equipment"],
  ["الضواغط والطلمبات والهيدروليك", "طلمبات|مضخات|ضواغط|كمبروسر|هيدروليك|pumps|compressors|hydraulics"],
  ["المعدات الثقيلة والرافعات والمصاعد", "معدات ثقيله|رافعات|اوناش|مصاعد|heavy equipment|cranes|elevators"],
  ["التكييف والتبريد والغلايات", "تكييف|تبريد|غلايات|hvac|refrigeration|boilers"],
  ["المياه ومعالجتها", "معالجه مياه|محطات مياه|تحليه|water treatment|desalination"],
  ["المقاولات والإنشاءات", "مقاولات|انشاءات|مقاولين|contracting|contractors|construction"],
  ["التعدين والمحاجر", "تعدين|محاجر|مناجم|mining|quarries|quarrying"],
  ["التجهيزات الفندقية ومعدات المطاعم", "فندقيه|تجهيزات فندقيه|معدات فندقيه|معدات مطاعم|hotel supplies|hotel equipment|restaurant equipment|catering equipment|kitchen equipment"],
  ["الأمن والسلامة ومكافحة الحريق", "مكافحه حريق|سلامه مهنيه|fire fighting|safety equipment"],
  ["تكنولوجيا المعلومات والأجهزة المكتبية", "تكنولوجيا المعلومات|كمبيوتر|اجهزه مكتبيه|information technology|computers"],
  ["العدد والأدوات وأجهزة القياس", "اجهزه قياس|عدد وادوات|measuring instruments|hand tools"],
  ["قطع الغيار ونقل الحركة", "قطع غيار|نقل الحركه|spare parts"],
  ["الأدوات الرياضية والترفيهية", "ادوات رياضيه|sports goods"],
  ["النقل والشحن والملاحة", "نقل وشحن|شحن|ملاحه|shipping|logistics"],
  ["التأمين والخدمات المالية", "تامين|بنوك|insurance|banks"],
  ["الاستشارات والخدمات", "استشارات|consulting"],
  ["التوريدات الصناعية العامة", "توريدات صناعيه|industrial supplies"],
];
/* words of a seller's sentence that name no industry («مصانع», «عملائي», «بنخدم», "plants", "customers"): left out of a term */
const CUST_GENERIC = new Set(("مصانع مصنع شركات شركه صناعه صناعات صناعي صناعيه قطاع قطاعات مجال مجالات عملاء عملائي عملاءنا عميل زباين زبائن زبون بتوع بتاع " +
  "بخدم بنخدم نخدم اخدم يخدم بشتغل بنشتغل نشتغل شغل شغال بنبيع ببيع نبيع بنورد بورد لكل كل انواع نوع الخ وغيرها غيرها كتير مختلفه تانيه زي مثل " +
  "industries industry sector sectors companies company factories factory plants plant mills customers customer clients client houses house firms makers " +
  "manufacturers producers serve serving sell selling supply " +
  /* review: sizes and kinds («شركات كبيرة» found 10 companies whose text says «خبرة كبيرة») */
  "كبير كبيره كبار صغير صغيره صغار متوسط متوسطه عالمي عالميه دولي دوليه محلي محليه خاص خاصه جديد جديده قديم قديمه مصري مصريه عربي عربيه " +
  "اجنبي اجنبيه مشهور مشهوره معروف معروفه big large small medium local international global new old famous major leading various different other").split(/\s+/).map(w => canon(norm(w))).filter(Boolean));
const skip = k => !k || k.length < 2 || STOP.has(k) || CUST_GENERIC.has(k) || isGeneric(k) || /^\d+$/.test(k);
/* a kind of CUSTOMER the directory does not list (it lists factories, companies and suppliers): said as «مالقيتش صناعة اسمها …», never
   searched as the companies' words, which finds the ones that supply them, i.e. the seller's competitors */
export const CUST_PLACE = new Set(("مستشفي مستشفيات عياده عيادات صيدليه صيدليات معمل معامل مطعم مطاعم فندق فنادق كافيه كافيهات قهاوي مقاهي سوبرماركت هايبر " +
  "هايبرماركت ماركت محل محلات بقاله بقالات مول مولات مدرسه مدارس جامعه جامعات حكومه حكوميه وزاره وزارات بيوت منازل مستهلك مستهلكين افراد " +
  "hospital hospitals clinic clinics pharmacy pharmacies lab labs laboratory laboratories restaurant restaurants hotel hotels cafe cafes " +
  "supermarket supermarkets hypermarket hypermarkets grocery groceries shop shops store stores retail retailers mall malls school schools " +
  "university universities government ministries households consumers").split(/\s+/).map(w => canon(norm(w))).filter(Boolean));
/* the forms one word of a term may be read as: itself, without ONE attached و / ب / ل / ف / ك (3+ letters left), «لل» → «ال» */
const formsOfWord = w => { const o = [canon(w)]; if (/^[وبلفك]/.test(w) && w.length - 1 >= 3) o.push(canon(w.slice(1))); if (/^لل/.test(w) && w.length >= 5) o.push(canon("ال" + w.slice(2))); return [...new Set(o.filter(Boolean))]; };
let IX = null;
/* CUST_MAP compiled once per isolate: «canon words joined by a space» → the labels; the longest phrase decides */
function ix() {
  if (IX) return IX;
  const m = new Map(); let longest = 1;
  for (const [label, terms] of CUST_MAP) for (const t of terms.split("|")) {
    const ws = norm(t).split(" ").filter(Boolean).map(canon); if (!ws.length || ws.some(x => !x)) continue;
    const k = ws.join(" "); if (!m.has(k)) m.set(k, []); if (!m.get(k).includes(label)) m.get(k).push(label);
    longest = Math.max(longest, ws.length);
  }
  return (IX = { m, longest });
}
export const CUST_LABELS = CUST_MAP.map(x => x[0]);
/* one item of the seller's list (its normalised words) → its terms: [{labels, unknown (the words no label took), words (what it said, without
   the generic words), place (true: one of them is a CUST_PLACE word)}]. A phrase of CUST_MAP is read first («تعبئه وتغليف» is ONE industry); then an attached «و» that follows a term
   starts the next one («مطابع وشغل فضاء خارجي» = «مطابع» + «فضاء خارجي»), as a standalone «و» does in src/index.js */
export function custTerms(ws) {
  const { m, longest } = ix(), out = [];
  const W = ws.filter(Boolean);
  let cur = { labels: [], unknown: [], words: [] };
  const close = () => { if (cur.words.length) out.push(cur); cur = { labels: [], unknown: [], words: [] }; };
  for (let i = 0; i < W.length;) {
    let hit = 0, L = null;
    for (let n = Math.min(longest, W.length - i); n >= 1 && !hit; n--) {
      const span = W.slice(i, i + n);
      /* every word with or without its attached letter */
      let keys = [[]];
      for (const w of span) { const next = []; for (const k of keys) for (const f of formsOfWord(w)) next.push([...k, f]); keys = next.slice(0, 16); }
      for (const k of keys) { const x = m.get(k.join(" ")); if (x) { L = x; hit = n; break; } }
    }
    const w = W[i];
    if (cur.words.length && /^و/.test(w) && w.length - 1 >= 3) close(); // «… وشغل …»: a new term
    if (hit) { for (const l of L) if (!cur.labels.includes(l)) cur.labels.push(l); cur.words.push(W.slice(i, i + hit).join(" ")); i += hit; continue; }
    i++;
    const k = canon(w);
    if (skip(k) || formsOfWord(w).some(skip)) continue;
    cur.unknown.push(w); cur.words.push(w);
    if (formsOfWord(w).some(x => CUST_PLACE.has(x))) cur.place = true; // a kind of customer the directory does not list (src/index.js customers)
  }
  close();
  return out;
}
/* the terms of one item as one (tests, callers that want a single answer) */
export function custTerm(ws) {
  const t = custTerms(ws);
  return { labels: [...new Set(t.flatMap(x => x.labels))], unknown: t.flatMap(x => (x.labels.length ? [] : x.unknown)), words: t.flatMap(x => x.words) };
}
