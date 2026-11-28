/* Made in Egypt Gate - AI Deal Advisor (Janna) knowledge base.
   Contracting guidance for Egyptian manufacturers: per market, per tender portal, per opportunity kind,
   plus bilingual email templates. Every rule below was checked against the cited official/primary source
   on the "updated" date. General guidance only: the tender/bidding document of each opportunity always prevails. */
(function () {
  "use strict";

  /* ---------- shared sources ---------- */
  var S = {
    wbReg: { title: "World Bank - Procurement Regulations for IPF Borrowers (7th ed., Sep 2025; bid security: paras 5.33-5.35)", url: "https://thedocs.worldbank.org/en/doc/c84273d1b230aeb2b0b8134de5dc8cd7-0290012025/original/Procurement-Regulations-7th-Edition-Sep-2025.pdf" },
    wbNotices: { title: "World Bank - Procurement notices (projects.worldbank.org)", url: "https://projects.worldbank.org/en/projects-operations/procurement" },
    wbProc: { title: "World Bank - Project procurement (standard documents, guidance)", url: "https://www.worldbank.org/en/projects-operations/procurement" },
    wbDebar: { title: "World Bank - Debarred and cross-debarred firms and individuals", url: "https://www.worldbank.org/en/projects-operations/procurement/debarred-firms" },
    tedEc: { title: "European Commission - Tenders Electronic Daily (TED)", url: "https://single-market-economy.ec.europa.eu/single-market/public-procurement/digital-procurement/tenders-electronic-daily_en" },
    ted: { title: "TED - Tenders Electronic Daily", url: "https://ted.europa.eu/" },
    espd: { title: "European Commission - European Single Procurement Document (ESPD) and eCertis", url: "https://single-market-economy.ec.europa.eu/single-market/public-procurement/digital-procurement/european-single-procurement-document-and-ecertis_en" },
    dir24: { title: "Directive 2014/24/EU on public procurement (EUR-Lex)", url: "https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32014L0024" },
    thr: { title: "Commission Delegated Regulation (EU) 2025/2152 - EU thresholds 2026-2027", url: "https://eur-lex.europa.eu/eli/reg_del/2025/2152/oj/eng" },
    gpa: { title: "European Commission - International public procurement (WTO GPA parties)", url: "https://single-market-economy.ec.europa.eu/single-market/public-procurement/international-public-procurement_en" },
    kolin: { title: "Court of Justice of the EU - Press release 183/24, Case C-652/22 Kolin (22 Oct 2024)", url: "https://curia.europa.eu/site/upload/docs/application/pdf/2024-10/cp240183en.pdf" },
    thirdGuid: { title: "European Commission - Guidance on third-country bidders in the EU procurement market (2019)", url: "https://single-market-economy.ec.europa.eu/news/new-guidance-participation-third-country-bidders-eu-procurement-market-2019-07-24_en" },
    bhHome: { title: "Bahrain Tender Board - official website", url: "https://www.tenderboard.gov.bh/" },
    bhFaq: { title: "Bahrain Tender Board - Supplier FAQ", url: "https://www.tenderboard.gov.bh/FAQ/SupplierFAQ/" },
    bhGfaq: { title: "Bahrain Tender Board - General FAQ", url: "https://www.tenderboard.gov.bh/FAQ/GeneralFAQ/" },
    bhGuide: { title: "Bahrain Tender Board - Guideline for Suppliers & Contractors in Government Procurement", url: "https://www.tenderboard.gov.bh/Legislation/MediaHandler/GenericHandler/Pdf/guide/ENG%20CandS%20Guide.pdf" },
    bhLaw: { title: "Bahrain Legislative Decree No. 36 of 2002 regulating government tenders (unofficial English translation, Tender Board)", url: "https://tenderboard.gov.bh/MediaHandler/GenericHandler/Pdf/laws/Tender%20Law%2036%20of%202002T%20New.pdf" },
    bhEt: { title: "Bahrain eTendering system", url: "https://etendering.tenderboard.gov.bh/" },
    omEt: { title: "Oman Tender Board - eTendering portal", url: "https://etendering.tenderboard.gov.om/" },
    omRd57: { title: "Oman Royal Decree 57/2025 - Projects, Tenders and Local Content Authority (decree.om)", url: "https://decree.om/2025/rd20250057/" },
    omTim: { title: "Times of Oman (2026) - Participation in public tenders in Oman: legal requirements under the Tender Law", url: "https://timesofoman.com/article/172176-participation-in-public-tenders-in-oman-legal-requirements-under-the-tender-law" },
    omCirc: { title: "Oman Observer (2 Jun 2025) - No contracts with firms not meeting Omanisation rates: Tender Board (Circular No. 2025/2)", url: "https://www.omanobserver.om/article/1171428/oman/labour/no-contracts-with-firms-not-meeting-omanisation-rates-tender-board" },
    omCcg: { title: "U.S. Commercial Service - Oman Country Commercial Guide: Selling to the public sector", url: "https://www.trade.gov/country-commercial-guides/oman-selling-public-sector" },
    eg182: { title: "Egypt Law No. 182 of 2018 on contracts concluded by public entities (English translation, Andersen Egypt)", url: "https://eg.andersen.com/wp-content/uploads/2026/01/Law-No.-182-of-2018.pdf" },
    egPortal: { title: "Egypt Public Procurement Portal (بوابة التعاقدات العامة)", url: "https://etenders.gov.eg/" },
    goeic: { title: "GOEIC - General Organization for Export and Import Control (Egypt)", url: "https://www.goeic.gov.eg/en" },
    goeicOrigin: { title: "GOEIC - Exports and origin (certificates of origin, approved exporter)", url: "https://www.goeic.gov.eg/en/services-and-activities/Exports-and-origin" },
    goeicAgr: { title: "GOEIC - Trade agreements, member countries, rules of origin and certificate forms", url: "https://www.goeic.gov.eg/en/services-and-activities/conventions/conventions-countries" },
    ege: { title: "EGE - Egyptian Export and Investment Guarantee (Egypt's official export credit agency)", url: "https://www.ege-eg.com/en" },
    inco: { title: "ICC - Incoterms rules (Incoterms 2020)", url: "https://iccwbo.org/business-solutions/incoterms-rules/" },
    ucp: { title: "ICC Academy - UCP 600 (Uniform Customs and Practice for Documentary Credits)", url: "https://academy.iccwbo.org/ucp-600" },
    moiat: { title: "UAE Ministry of Industry and Advanced Technology - Conformity certificates for regulated products (ECAS)", url: "https://moiat.gov.ae/en/services/issue-conformity-certificates-for-regulated-products/" },
    saso: { title: "SASO - Saudi Standards, Metrology and Quality Organization", url: "https://www.saso.gov.sa/en/Pages/default.aspx" },
    saber: { title: "SABER - Saudi product conformity platform", url: "https://saber.sa/" },
    saTic: { title: "U.S. Commercial Service - Saudi Arabia testing, inspection and certification (SABER)", url: "https://www.trade.gov/saudi-arabia-testing-inspection-and-certification" },
    gso: { title: "GCC Standardization Organization (GSO) - e-services documentation (G-Mark)", url: "https://gcc-gso.atlassian.net/wiki/spaces/GUG" },
    ce: { title: "European Commission - CE marking", url: "https://single-market-economy.ec.europa.eu/single-market/goods/ce-marking_en" },
    reach: { title: "Your Europe - Registering chemicals (REACH) FAQ", url: "https://europa.eu/youreurope/business/product-requirements/chemicals/registering-chemicals-reach/faq/index_en.htm" },
    cbam: { title: "European Commission - Carbon Border Adjustment Mechanism (CBAM)", url: "https://taxation-customs.ec.europa.eu/carbon-border-adjustment-mechanism_en" },
    a2m: { title: "EU Access2Markets - tariffs, rules of origin and product requirements", url: "https://trade.ec.europa.eu/access-to-markets/en/home" },
    kePvoc: { title: "Kenya Bureau of Standards (KEBS) - Pre-Export Verification of Conformity (PVoC)", url: "https://kebs.org/pre-export-verification-of-conformity/" },
    soncap: { title: "Standards Organisation of Nigeria - SONCAP services", url: "https://son.gov.ng/soncapservice" },
    adbElig: { title: "ADB - Main eligibility requirements for bidding on ADB-financed contracts", url: "https://www.adb.org/business/how-to/what-are-main-eligibility-requirements-bidding-contracts-under-adb-financed-projects" },
    adbMem: { title: "ADB - About ADB (list of 69 members)", url: "https://www.adb.org/who-we-are/about" },
    afdbRes: { title: "AfDB - Procurement resources for businesses", url: "https://www.afdb.org/en/projects-and-operations/procurement/resources-for-businesses/" },
    ungm: { title: "UNGM - United Nations Global Marketplace", url: "https://www.ungm.org/" },
    unVend: { title: "United Nations Procurement Division - Information for new vendors", url: "https://www.un.org/Depts/ptd/vendors" }
  };

  function L(ar, en, appliesTo) { var o = { ar: ar, en: en }; if (appliesTo) o.applies_to = appliesTo; return o; }

  /* ---------- World Bank (several source_name variants share one guide) ---------- */
  function worldBank(variantAr, variantEn) {
    return {
      name: "World Bank - Procurement Notices",
      url: "https://projects.worldbank.org/en/projects-operations/procurement",
      applies_to_markets: ["africa", "asia"],
      how_to_bid: [
        L("افتح الإعلان (Specific Procurement Notice) على موقع البنك الدولي، وسجّل اسم الجهة المنفذة في دولة المشروع (المقترض) وعنوانها وآخر موعد للتقديم. البنك الدولي يموّل فقط؛ أما المناقصة نفسها فتديرها الجهة المنفذة.",
          "Open the Specific Procurement Notice on the World Bank site and note the borrower's implementing agency, its address and the deadline. The Bank only finances: the tender itself is run by the borrower's agency."),
        L("اطلب وثائق المناقصة (Request for Bids) من الجهة المنفذة بالطريقة المذكورة في الإعلان (بريد إلكتروني أو منظومة مشتريات إلكترونية أو استلام مباشر)، وقد يُطلب سداد رسوم غير مستردة إذا نص الإعلان على ذلك.",
          "Request the bidding document from the implementing agency exactly as the notice says (email, the borrower's e-procurement system or in person); a non-refundable fee applies only if the notice states one."),
        L("اقرأ شروط الأهلية والتأهيل (الخبرة السابقة، حجم الأعمال، القدرة الفنية) وجدول الكميات والمواصفات الفنية. البنك يسمح للشركات المؤهلة من كل الدول بالمشاركة، والاستثناءات محدودة (حظر قانوني في دولة المقترض أو قرار مجلس الأمن أو شركة محظورة من البنك).",
          "Read the eligibility and qualification criteria (past experience, turnover, technical capacity), the bill of quantities and the specifications. The Bank lets eligible firms from all countries compete; exclusions are limited (a legal ban in the borrower's country, a UN Security Council decision, or a firm debarred by the Bank)."),
        L("أرسل أسئلتك كتابيًا للجهة المنفذة قبل الموعد المحدد في الوثائق، واحضر اجتماع ما قبل العطاءات أو زيارة الموقع إن وُجدت.",
          "Send clarification questions in writing to the implementing agency before the date in the document, and attend any pre-bid meeting or site visit."),
        L("جهّز العطاء باللغة المحددة في الوثائق (الإنجليزية أو الفرنسية أو الإسبانية في المناقصات الدولية)، ومعه ضمان العطاء أو «إقرار ضمان العطاء» بالشكل والقيمة المطلوبين.",
          "Prepare the bid in the language stated in the document (English, French or Spanish for international procurement), with the bid security or Bid-Securing Declaration in the required form and amount."),
        L("قدّم العطاء قبل الموعد النهائي بالبريد أو باليد أو إلكترونيًا إن كانت الجهة تستخدم منظومة إلكترونية. الحد الأدنى لمدة إعداد العطاءات في المناقصات الدولية المفتوحة 30 يوم عمل ما لم يُتفق على غير ذلك مع البنك.",
          "Submit before the deadline by mail, in person, or electronically if the agency uses an e-procurement system. The minimum bid preparation period for open international procurement is 30 business days unless otherwise agreed with the Bank."),
        L("بعد التقييم تصدر الجهة «إخطار نية الترسية» وتبدأ فترة توقف مدتها 10 أيام عمل، يمكن خلالها تقديم شكوى وفق الملحق الثالث من لوائح المشتريات.",
          "After evaluation the agency issues a Notification of Intention to Award, followed by a 10-business-day standstill period during which a complaint can be filed under Annex III of the Regulations."),
        L("عند الترسية: وقّع العقد بنفس لغة العطاء وقدّم ضمان حسن التنفيذ في المهلة المحددة. للعقود من 10 ملايين دولار فأكثر يتيح البنك للمقترض السداد المباشر للمورد عن حصة البنك.",
          "On award: sign the contract in the language of the bid and furnish the performance security on time. For contracts of US$10 million or more the Bank offers borrowers direct payment to the supplier for the Bank's share.")
      ],
      registration: L("لا يوجد تسجيل لدى البنك الدولي نفسه للمشاركة في مناقصات المشروعات. قد تطلب الجهة المنفذة تسجيلًا على منظومتها الإلكترونية الوطنية إذا كانت تستخدمها، والتفاصيل في الإعلان ووثائق المناقصة.",
        "There is no registration with the World Bank itself to bid on project contracts. The implementing agency may require registration on its national e-procurement system if it uses one; see the notice and bidding document."),
      language: "English, French or Spanish (as chosen by the borrower; may also be issued in the national language)",
      bid_security: L("حسب وثائق المناقصة: ضمان عطاء بقيمة وشكل محددين، أو «إقرار ضمان العطاء» بدلًا منه. وفق لوائح المشتريات (الفقرات 5.33 إلى 5.35): يصدر الضمان من بنك حسن السمعة (أو مؤسسة مالية غير مصرفية مثل شركة تأمين أو كفالة) في أي دولة مؤهلة يختارها المورد، ويظل ساريًا عادة 4 أسابيع بعد انتهاء صلاحية العطاء، ويُرد لغير الفائزين بعد توقيع العقد مع الفائز. القيمة والصيغة والمدة الفعلية في وثيقة المناقصة.",
        "As set in the bidding document: a bid security of a stated amount and form, or a Bid-Securing Declaration instead. Under the Procurement Regulations (paras 5.33-5.35) it may be issued by a reputable bank (or a non-bank financial institution such as an insurance, bonding or surety company) in any eligible country chosen by the bidder, is generally valid 4 weeks beyond bid validity, and is released to unsuccessful bidders once the contract is signed with the successful bidder. The exact amount, form and validity are in the bidding document."),
      notes: L("نوع الإعلان: " + variantAr + ". الدول الفرنكوفونية (مثل النيجر والكاميرون ومدغشقر والكونغو الديمقراطية وجيبوتي والمغرب) كثيرًا ما تصدر الوثائق بالفرنسية. افحص قائمة الشركات المحظورة لدى البنك قبل الدخول في تحالف أو التعاقد من الباطن. مسموح بتكوين تحالفات (Joint Ventures) مع شركات محلية أو أجنبية، وأعضاؤها مسؤولون بالتضامن.",
        "Notice type: " + variantEn + ". Francophone borrowers (e.g. Niger, Cameroon, Madagascar, DR Congo, Djibouti, Morocco) often issue documents in French. Check the Bank's debarment list before forming a joint venture or subcontracting. Joint ventures with domestic or foreign firms are allowed; partners are jointly and severally liable."),
      sources: [S.wbReg, S.wbNotices, S.wbProc, S.wbDebar]
    };
  }

  /* ---------- Bahrain Tender Board (two source_name variants) ---------- */
  function bahrain(isLocal) {
    return {
      name: "Bahrain Tender Board - Public Tenders",
      url: "https://www.tenderboard.gov.bh/Tenders/PublicTenders/",
      applies_to_markets: ["gulf"],
      how_to_bid: [
        L("سجّل شركتك على منظومة المناقصات الإلكترونية (etendering.tenderboard.gov.bh) من خيار «Supplier Registration»، ثم استكمل الملف وارفع السجل التجاري وانتظر موافقة مجلس المناقصات بالبريد الإلكتروني. الشركة الدولية تُدخل رقم تسجيلها في بلدها وترفق شهادة تسجيل سارية.",
          "Register on the eTendering system (etendering.tenderboard.gov.bh) via 'Supplier Registration', complete the profile, upload the commercial registration and wait for Tender Board approval by email. An international company enters its home-country registration number and attaches a valid registration certificate."),
        L("ابحث عن المناقصة في صفحة المناقصات المنشورة؛ الإعلان يوضح رقم المناقصة وموضوعها وآخر موعد لشراء الوثائق وموعد الإغلاق وموعد الفتح والمتطلبات الإلزامية.",
          "Find the tender under Published Tenders; the notice shows the tender number, subject, last date to purchase documents, closing date, opening date and mandatory requirements."),
        L("اشترِ وثائق المناقصة إلكترونيًا مقابل رسم غير مسترد. يجب أن يكون مقدم العطاء هو نفسه مشتري الوثائق.",
          "Purchase the tender documents online for a non-refundable fee. The bidder must be the purchaser of the documents."),
        L("أرسل استفساراتك عبر المنظومة إلى الجهة المشترية خلال فترة الاستفسارات، ولن يُسمح بالتقديم إلا بعد انتهاء هذه الفترة.",
          "Post clarification queries to the Purchasing Authority through the system during the pre-bid query period; submission opens only after that period ends."),
        L("جهّز العطاء الفني (المستندات المطلوبة + صورة الضمان الابتدائي) والعطاء المالي، وأدخل الأسعار بالعملة المطلوبة. يُسلَّم أصل الضمان الابتدائي لمكاتب مجلس المناقصات.",
          "Prepare the technical bid (required documents + a copy of the initial bond) and the financial bid, entering prices in the required currency. The original initial bond is delivered to the Tender Board offices."),
        L("قدّم العطاء قبل الساعة 1:30 ظهرًا (بتوقيت البحرين) في يوم الإغلاق؛ لا تُقبل العطاءات بعد ذلك. بعض مناقصات الجهات الداخلية تُقدَّم خارج المنظومة مباشرة للجهة، وتوضح الوثائق ذلك.",
          "Submit before 1:30 p.m. (Bahrain time) on the closing date; late bids are not accepted. Some internal tenders of purchasing authorities are submitted outside the system directly to the authority, as the documents state."),
        L("تابع العطاءات المفتوحة ونتائج الترسية على موقع المجلس. للتظلم: نموذج إعادة النظر/التظلم يُرسل خلال " + (isLocal ? "10 أيام من العلم بالإجراء أو القرار (مناقصة محلية)." : "20 يومًا من العلم بالإجراء أو القرار (مناقصة دولية؛ المهلة في المناقصات المحلية 10 أيام)."),
          "Follow opened bids and awards on the Tender Board website. To object, send the Reconsideration/Grievance form within " + (isLocal ? "10 days of becoming aware of the procedure or decision (local tender)." : "20 days of becoming aware of the procedure or decision (international tender; the limit for local tenders is 10 days).")),
        L("عند الترسية: ضمان حسن التنفيذ خلال 20 يومًا من خطاب نية الترسية للشركات من خارج البحرين (10 أيام للمحلية)، بنسبة 5% إلى 10% في السلع والخدمات و10% في الإنشاءات.",
          "On award: performance bond within 20 days of the Letter of Intent for companies outside Bahrain (10 days for local ones), 5%-10% for goods and services and 10% for construction.")
      ],
      registration: L("التسجيل على منظومة المناقصات الإلكترونية إلزامي لشراء الوثائق والتقديم. " + (isLocal
          ? "هذه مناقصة «محلية»: يقتصر الاشتراك فيها قانونًا على الموردين المرخص لهم بمزاولة النشاط في البحرين، وتعامل شركات دول مجلس التعاون كشركات وطنية وفق الضوابط. الشركة المصرية غير المسجلة في البحرين لا يمكنها التقديم مباشرة؛ المسار العملي هو التوريد عبر موزع أو وكيل مسجل في البحرين."
          : "هذه مناقصة «دولية»: يجوز للشركات الأجنبية غير المسجلة في البحرين المشاركة، بشرط التسجيل وفق الأنظمة البحرينية خلال 30 يومًا من الترسية."),
        "Registration on the eTendering system is mandatory to buy documents and bid. " + (isLocal
          ? "This is a LOCAL tender: by law participation is limited to suppliers authorised to do business in Bahrain, and GCC companies are treated as national companies under the applicable rules. An Egyptian company not registered in Bahrain cannot bid directly; the practical route is to supply through a Bahrain-registered distributor or agent."
          : "This is an INTERNATIONAL tender: foreign companies not registered in Bahrain may participate, provided they register under Bahraini regulations within 30 days of the award.")),
      language: "Arabic / English (international tenders are advertised in both)",
      bid_security: L("ضمان ابتدائي إلزامي مع كل عطاء بالقيمة والصلاحية المحددتين في الوثائق، في صورة تحويل بنكي أو شيك مصدق أو خطاب ضمان من بنك معتمد أو وثيقة تأمين من شركة معتمدة، باسم الجهة المشترية ومشيرًا لرقم وموضوع المناقصة وغير مشروط. يُرد لغير الفائزين بعد الترسية وللفائز بعد تقديم ضمان حسن التنفيذ.",
        "Initial bond mandatory with every bid, of the amount and validity stated in the documents: bank transfer, certified cheque, bank guarantee from an approved bank or insurance policy from an approved insurer, payable to the Purchasing Authority, citing the tender number and subject, unconditional. Refunded to unsuccessful bidders after award and to the winner after the performance bond."),
      notes: L((isLocal ? "مصنفة في المصدر كـ Public (LOCAL GCC). " : "مصنفة في المصدر كـ Public (INTERNATIONAL). ") + "مجلس المناقصات يشرف على مشتريات الجهات الحكومية التي تتجاوز 50,000 دينار بحريني، ومشتريات الشركات المملوكة بالكامل للحكومة فوق 100,000 دينار. ملف العطاء قد يطلب مستندات بحرينية (سجل تجاري بحريني، شهادة البحرنة) لا تنطبق إلا على الشركات المحلية؛ اسأل الجهة المشترية عن البديل للشركات الأجنبية قبل الشراء.",
        (isLocal ? "Classified at source as Public (LOCAL GCC). " : "Classified at source as Public (INTERNATIONAL). ") + "The Tender Board oversees purchases by government bodies above BHD 50,000 and by fully government-owned companies above BHD 100,000. Bid requirements may list Bahraini documents (Bahraini CR, Bahrainization certificate) that apply to local firms; ask the Purchasing Authority what a foreign bidder should submit instead before buying the documents."),
      sources: [S.bhGuide, S.bhFaq, S.bhGfaq, S.bhLaw, S.bhEt, S.bhHome]
    };
  }

  var wbRFB = worldBank("دعوة لتقديم عطاءات (Request for Bids) - توريد سلع أو أعمال", "Invitation for Bids / Request for Bids (goods or works)");

  var portals = {
    "World Bank – Procurement Notices (Invitation for Bids, Request for Bids)": wbRFB,
    "World Bank – Procurement Notices (Invitation for Prequalification, Request for Proposals)": worldBank("دعوة للتأهيل المسبق أو طلب عروض - في التأهيل المسبق تقدم أولًا ملف تأهيل (خبرة وقدرات) ولا يُدعى لتقديم العطاء إلا المؤهلون", "Invitation for Prequalification / Request for Proposals - in prequalification you first submit an application (experience and capacity); only prequalified firms are invited to bid"),
    "World Bank – Procurement Notices (Invitation for Bids, Request for Proposals)": worldBank("دعوة لتقديم عطاءات أو طلب عروض - طلب العروض (RFP) يُقيَّم غالبًا على الجودة الفنية مع السعر وفق المعايير المعلنة", "Invitation for Bids / Request for Proposals - an RFP is usually evaluated on technical quality and price per the stated criteria"),
    "World Bank – Procurement Notices (Invitation for Bids, Request for Quotations)": worldBank("دعوة لتقديم عطاءات أو طلب عروض أسعار - طلب عروض الأسعار (RFQ) إجراء أبسط للعقود الصغيرة القياسية، ومدته أقصر", "Invitation for Bids / Request for Quotations - an RFQ is a simpler method for small, standard contracts with shorter deadlines"),

    "EU TED – Tenders Electronic Daily (contract notice)": {
      name: "TED - Tenders Electronic Daily (EU)",
      url: "https://ted.europa.eu/",
      applies_to_markets: ["europe"],
      how_to_bid: [
        L("ابحث في TED مجانًا (هو النسخة الإلكترونية لملحق الجريدة الرسمية للاتحاد الأوروبي). الإعلان (بصيغة eForms) يحدد الجهة المتعاقدة وآخر موعد ورابط وثائق المناقصة ورابط منصة التقديم الإلكترونية.",
          "Search TED free of charge (it is the online Supplement to the Official Journal of the EU). The eForms notice gives the buyer, the deadline, the link to the procurement documents and the e-submission platform."),
        L("تأكد أولًا من قبول عطاءات الشركات من خارج الاتحاد: مصر ليست طرفًا في اتفاقية المشتريات الحكومية (GPA)، ووفق حكم محكمة العدل الأوروبية في قضية Kolin (أكتوبر 2024) لا يحق لشركات الدول غير المرتبطة باتفاق مشتريات مع الاتحاد المطالبة بالمساواة في المعاملة، وللجهة المتعاقدة أن تقرر قبولها أو استبعادها. راجع شروط الأهلية أو اسأل الجهة كتابيًا.",
          "First confirm non-EU bids are accepted: Egypt is not a party to the WTO GPA, and under the CJEU Kolin judgment (Oct 2024) operators from countries without a procurement agreement with the EU cannot claim equal treatment; the contracting authority may decide whether to admit them. Check the eligibility section or ask the buyer in writing."),
        L("سجّل على منصة المشتريات الإلكترونية المذكورة في الإعلان (غالبًا منصة وطنية للدولة) لتنزيل الوثائق وإرسال الأسئلة والتقديم.",
          "Register on the e-procurement platform named in the notice (usually a national platform) to download documents, ask questions and submit."),
        L("املأ «وثيقة المشتريات الأوروبية الموحدة» (ESPD) إذا طُلبت، وهي إقرار ذاتي بالأهلية ومعايير الاختيار، وجهّز المستندات باللغة التي تحددها الجهة (غالبًا لغة الدولة).",
          "Complete the European Single Procurement Document (ESPD), a self-declaration on exclusion and selection criteria, if requested, and prepare documents in the language the buyer specifies (often the national language)."),
        L("قدّم إلكترونيًا قبل الموعد. الحد الأدنى في الإجراء المفتوح 35 يومًا من إرسال الإعلان، ويمكن تقصيره (مثل وجود إعلان مسبق أو قبول التقديم الإلكتروني).",
          "Submit electronically before the deadline. The minimum in an open procedure is 35 days from dispatch of the notice, and it can be shortened (e.g. after a prior information notice or with electronic submission)."),
        L("في التوريد للاتحاد الأوروبي يتحمل المستورد/الموزع داخل الاتحاد التزامات مثل CE وREACH وCBAM؛ لذلك كثيرًا ما يكون الدخول مع شريك أو موزع أوروبي أسهل وأكثر قبولًا.",
          "When supplying into the EU, the EU importer/distributor carries obligations such as CE, REACH and CBAM, so bidding with an EU partner or distributor is often easier and better accepted.")
      ],
      registration: L("تصفح TED مجاني. التسجيل يكون على منصة الشراء الإلكتروني التابعة للجهة المتعاقدة المذكورة في الإعلان وليس على TED نفسه.",
        "Browsing TED is free. Registration happens on the contracting authority's e-procurement platform named in the notice, not on TED itself."),
      language: "Language(s) set by the contracting authority (usually the national language of the member state)",
      bid_security: L("ليست قاعدة موحدة على مستوى الاتحاد؛ إن طُلب ضمان فقيمته وشكله في وثائق المناقصة.",
        "No EU-wide rule; if a tender guarantee is required, its amount and form are set in the procurement documents."),
      notes: L("الحدود الأوروبية 2026-2027 (من 1 يناير 2026): 140,000 يورو لعقود التوريد والخدمات للحكومات المركزية، 216,000 يورو للجهات دون المركزية، 5,404,000 يورو للأعمال. بعض الإعلانات من جهات «خاصة» أو مرافق (مياه، طاقة، مطارات) تخضع لقواعد المرافق.",
        "EU thresholds 2026-2027 (from 1 Jan 2026): EUR 140,000 for supplies/services of central government, EUR 216,000 for sub-central authorities, EUR 5,404,000 for works. Some notices come from utilities (water, energy, airports) under the utilities rules."),
      sources: [S.ted, S.tedEc, S.espd, S.dir24, S.thr, S.gpa, S.kolin, S.thirdGuid]
    },

    "Bahrain Tender Board – Public Tenders (Public (LOCAL GCC))": bahrain(true),
    "Bahrain Tender Board – Public Tenders (Public (INTERNATIONAL))": bahrain(false),

    "Oman Tender Board (eTendering public dashboard – floated tenders, general/local)": {
      name: "Oman Tender Board - eTendering",
      url: "https://etendering.tenderboard.gov.om/",
      applies_to_markets: ["gulf"],
      how_to_bid: [
        L("المناقصات المطروحة على لوحة eTendering يحصل على وثائقها الموردون المسجلون لدى مجلس المناقصات (وبالدرجة المطلوبة في المناقصة).",
          "Documents for tenders floated on the eTendering dashboard are available to suppliers registered with the Tender Board (in the grade the tender requires)."),
        L("هذه المناقصات «عامة/محلية»: المناقصات المحلية مقصورة على الجهات المقيدة في السجل التجاري العماني أو السجلات المهنية المعتمدة. المسار العملي للمصنع المصري هو وكيل أو موزع عماني مسجل يقدم العطاء ويورد منتجاتك.",
          "These tenders are 'general/local': local tenders are limited to entities registered in Oman's commercial register or approved professional registers. The practical route for an Egyptian factory is an Omani agent/distributor that is registered, bids and supplies your products."),
        L("في المناقصات الدولية (عند طرحها) يجوز للشركة الأجنبية المشاركة بشرط إتمام التسجيل في عُمان خلال 30 يوم عمل من إخطارها بقبول عطائها.",
          "In international tenders (when floated) a foreign company may participate provided it completes registration in Oman within 30 working days of being notified that its bid was accepted."),
        L("مع العطاء: ضمان مؤقت لا يقل عن 1% من قيمة العطاء (وتذكر مصادر تجارية أنه يتراوح عادة بين 1% و3%)، وصلاحية العطاء عادة 90 يومًا ولا تقل عن 60 يومًا.",
          "With the bid: a temporary bond of not less than 1% of the bid value (trade sources report 1%-3% in practice); bid validity is generally 90 days and not less than 60."),
        L("الفائز يقدم ضمان حسن تنفيذ 5% من قيمة العقد خلال 10 أيام عمل من الإخطار، و20 يوم عمل للمتعاقد من الخارج (قابلة للتمديد حتى 10 أيام إضافية).",
          "The winner provides a 5% performance bond within 10 working days of notification, or 20 working days for a contractor abroad (extendable by up to 10 days)."),
        L("راجع متطلبات القيمة المحلية المضافة (ICV) ونسب التعمين في الوثائق؛ بموجب التعميم رقم 2025/2 وجّهت الأمانة العامة لمجلس المناقصات الجهات الخاضعة لقانون المناقصات بعدم التعاقد مع شركات القطاع الخاص غير الملتزمة بنسب التعمين المعتمدة.",
          "Check In-Country Value (ICV) and Omanisation requirements in the documents; under Circular No. 2025/2 the Tender Board's General Secretariat directed government bodies subject to the Tender Law not to contract with private companies that do not meet the approved Omanisation rates.")
      ],
      registration: L("التسجيل لدى مجلس المناقصات عبر بوابة eTendering شرط للحصول على الوثائق، ويتم التصنيف بدرجات حسب رأس المال والعمالة والإمكانات.",
        "Registration with the Tender Board through the eTendering portal is required to obtain documents; firms are classified into grades by capital, staff and capabilities."),
      language: "Arabic and English (titles in our data are translated from the Arabic original)",
      bid_security: L("ضمان مؤقت لا يقل عن 1% من إجمالي قيمة العطاء وفق قانون المناقصات (المرسوم 36/2008)، والقيمة الفعلية في الوثائق.",
        "Temporary bond of not less than 1% of the total bid value under the Tender Law (RD 36/2008); the exact amount is in the documents."),
      notes: L("بموجب المرسوم السلطاني 57/2025 تغيّر اسم الأمانة العامة لمجلس المناقصات إلى «هيئة المشاريع والمناقصات والمحتوى المحلي». بعض الجهات (مثل تنمية نفط عمان PDO) لها مجالس مناقصات خاصة.",
        "Under Royal Decree 57/2025 the Secretariat General of the Tender Board was renamed the Projects, Tenders and Local Content Authority. Some entities (e.g. Petroleum Development Oman) run their own tender boards."),
      sources: [S.omEt, S.omTim, S.omCcg, S.omRd57, S.omCirc]
    },

    /* short keys: portals that do not appear as source_name in our data but the advisor refers members to */
    etenders_eg: {
      name: "بوابة التعاقدات العامة - Egypt Public Procurement Portal",
      url: "https://etenders.gov.eg/",
      applies_to_markets: ["local"],
      how_to_bid: [
        L("كل التعاقدات الخاضعة للقانون 182 لسنة 2018 تُنشر على بوابة التعاقدات العامة (عدا ما يتعلق بالأمن القومي)، ومعها خطط التعاقد ونتائج الترسية.",
          "All contracts under Law 182/2018 are published on the Public Procurement Portal (except national-security cases), together with procurement plans and award results."),
        L("اشترِ كراسة الشروط والمواصفات من الجهة (السعر في الإعلان) واقرأ الشروط ومعايير التقييم وطريقة السداد ومواعيد الشكاوى.",
          "Buy the tender booklet from the entity (price in the notice) and read the conditions, evaluation criteria, payment method and complaint deadlines."),
        L("يُقدَّم العطاء في مظروفين مغلقين: فني ومالي، ويُفتح المالي فقط للعطاءات المقبولة فنيًا.",
          "Bids are submitted in two sealed envelopes, technical and financial; financial envelopes are opened only for technically accepted bids."),
        L("التأمين المؤقت مع العطاء بالقيمة المحددة في الكراسة بحد أقصى 1.5% من القيمة التقديرية في شراء المنقولات والمقاولات والخدمات، ويظل ساريًا 30 يومًا بعد انتهاء سريان العطاء.",
          "Provisional guarantee with the bid as set in the booklet, capped at 1.5% of the estimated value for movables, works and services, valid 30 days beyond bid validity."),
        L("للشكاوى: شكوى مكتوبة للجهة الإدارية ونسخة لمكتب شكاوى التعاقدات العامة بوزارة المالية، وقراراته ملزمة.",
          "Complaints: a written complaint to the administrative entity with a copy to the Public Procurement Complaints Office at the Ministry of Finance, whose decisions are binding.")
      ],
      registration: L("شروط الاشتراك والمستندات تحددها كراسة الشروط لكل مناقصة.",
        "Participation conditions and documents are set in each tender booklet."),
      language: "Arabic",
      bid_security: L("تأمين مؤقت حتى 1.5% (منقولات/مقاولات/خدمات) أو 0.5% (عقارات) من القيمة التقديرية، وتأمين نهائي 5% من قيمة العقد خلال 10 أيام عمل من الإخطار بالقبول.",
        "Provisional guarantee up to 1.5% (movables/works/services) or 0.5% (immovables) of the estimated value; final guarantee 5% of contract value within 10 working days of notification of acceptance."),
      notes: L("في بياناتنا، المناقصات المحلية مجمعة من مصادر منشورة (مثل الهيئة الاقتصادية لقناة السويس)، وقيمة التأمين وسعر الكراسة حين تتوفر تظهر في بطاقة المناقصة.",
        "In our data, local tenders are compiled from published sources (e.g. SCZone); bid bond and booklet price appear on the tender card when available."),
      sources: [S.eg182, S.egPortal]
    },

    ungm: {
      name: "UNGM - United Nations Global Marketplace",
      url: "https://www.ungm.org/",
      applies_to_markets: ["africa", "asia", "gulf", "europe"],
      how_to_bid: [
        L("سجّل شركتك مجانًا على UNGM (لا رسوم في أي مرحلة من التسجيل)، واختر أكواد UNSPSC التي تطابق منتجاتك.",
          "Register free on UNGM (no fee at any stage of registration) and select the UNSPSC codes matching your products."),
        L("تصفح إعلانات المناقصات مجانًا؛ كل إعلان يحدد وكالة الأمم المتحدة المعنية وطريقة التقديم (غالبًا عبر منظومتها الإلكترونية أو البريد الإلكتروني المحدد).",
          "Browse tender notices free; each notice names the UN agency and how to submit (often its e-tendering system or a designated email)."),
        L("بعض الوكالات (مثل الأمانة العامة للأمم المتحدة) تشترط إتمام مستوى التسجيل الأساسي قبل المشاركة.",
          "Some agencies (e.g. the UN Secretariat) require Basic-level registration before you can take part.")
      ],
      registration: L("التسجيل مجاني. احذر من أي جهة تطلب رسومًا مقابل «تسجيلك في الأمم المتحدة».",
        "Registration is free. Beware of anyone charging a fee to 'register you with the UN'."),
      language: "Mostly English (some notices in French or Spanish)",
      bid_security: L("حسب وثائق كل مناقصة.", "As set in each solicitation."),
      notes: L("خدمة التنبيهات المدفوعة اختيارية؛ نفس الإعلانات متاحة مجانًا للتصفح.",
        "Paid alert services are optional; the same notices can be browsed free."),
      sources: [S.ungm, S.unVend]
    },

    afdb: {
      name: "African Development Bank (AfDB) - Procurement",
      url: "https://www.afdb.org/en/projects-and-operations/procurement",
      applies_to_markets: ["africa"],
      how_to_bid: [
        L("مشروعات البنك الأفريقي للتنمية تديرها الجهات المنفذة في الدول المقترضة مثل البنك الدولي، والإعلانات منشورة على موقع البنك.",
          "AfDB-financed projects are tendered by borrower implementing agencies, as with the World Bank; notices are on the AfDB site."),
        L("القاعدة العامة: السلع والموردون من الدول الأعضاء في البنك، ومصر عضو إقليمي. راجع شرط الأهلية في كل وثيقة لأن قواعد التمويل تختلف بين نوافذ البنك.",
          "General rule: goods and bidders must come from Bank member countries, and Egypt is a regional member. Check eligibility in each document because rules differ between the Bank's financing windows.")
      ],
      registration: L("لا تسجيل مسبق لمناقصات المشروعات؛ مشتريات البنك المؤسسية تتطلب التسجيل كمورد على موقع البنك.",
        "No prior registration for project tenders; the Bank's own corporate procurement requires vendor registration on its website."),
      language: "English or French (per bidding document)",
      bid_security: L("حسب وثائق المناقصة.", "As set in the bidding document."),
      notes: L("تحقق من شرط الأهلية في وثيقة المناقصة قبل الشراء.", "Verify the eligibility clause in the bidding document before buying it."),
      sources: [S.afdbRes]
    },

    adb: {
      name: "Asian Development Bank (ADB) - Procurement",
      url: "https://www.adb.org/business/main",
      applies_to_markets: ["asia"],
      how_to_bid: [
        L("تنبيه مهم: في المشروعات الممولة من بنك التنمية الآسيوي يجب عادة أن يحمل المورد جنسية دولة عضو في البنك، ومصر ليست من الأعضاء الـ69. لا يمكن للشركة المصرية التقديم إلا إذا نص اتفاق التمويل على «الشراء العالمي» (Universal procurement) دون قيود جنسية.",
          "Important: on ADB-financed projects bidders must normally have the nationality of an ADB member, and Egypt is not among the 69 members. An Egyptian firm can bid only if the financing agreement specifies universal procurement with no nationality restriction."),
        L("شروط الأهلية الخاصة بكل مشروع موجودة في اتفاق التمويل ووثيقة المناقصة ضمن تبويب «Documents» في صفحة المشروع.",
          "Project-specific eligibility is in the financing agreement and the bidding document under the project page's Documents tab.")
      ],
      registration: L("حسب المشروع.", "Per project."),
      language: "English",
      bid_security: L("حسب وثائق المناقصة.", "As set in the bidding document."),
      notes: L("في آسيا ركّز على المناقصات الممولة من البنك الدولي (مفتوحة لكل الدول المؤهلة) أو التوريد عبر شريك من دولة عضو.",
        "In Asia, focus on World Bank-financed tenders (open to all eligible countries) or supply through a partner from a member country."),
      sources: [S.adbElig, S.adbMem]
    }
  };

  /* ---------- markets ---------- */
  var payCommon = [
    L("حدّد شرط التسليم بقواعد إنكوترمز 2020 (11 قاعدة من غرفة التجارة الدولية) واذكر الإصدار صراحة في العقد، مثل FOB أو CFR أو CIF للشحن البحري، وFCA أو CPT أو CIP لأي وسيلة نقل، وDAP/DDP عند التسليم في بلد المشتري.",
      "Fix the delivery term with Incoterms 2020 (the ICC's 11 rules) and state the version in the contract, e.g. FOB, CFR or CIF for sea freight, FCA, CPT or CIP for any mode, DAP/DDP for delivery in the buyer's country."),
    L("مع مشترٍ جديد أو سوق عالية المخاطر: اطلب اعتمادًا مستنديًا غير قابل للإلغاء خاضعًا لقواعد UCP 600، ويفضل أن يكون معززًا من بنك في مصر، وطابق المستندات حرفيًا مع شروط الاعتماد.",
      "With a new buyer or a high-risk market, ask for an irrevocable letter of credit subject to UCP 600, preferably confirmed by a bank in Egypt, and match documents strictly to the credit terms."),
    L("للبيع الآجل: غطِّ مخاطر عدم السداد بضمان ائتمان الصادرات من الشركة المصرية لضمان الصادرات والاستثمار (EGE)، وكالة ائتمان الصادرات الرسمية في مصر.",
      "For credit terms, cover non-payment risk with trade credit guarantee from EGE (Egyptian Export and Investment Guarantee), Egypt's official export credit agency."),
    L("خطابات الضمان المطلوبة في المناقصات (ابتدائي، حسن تنفيذ، دفعة مقدمة) تصدر عن بنكك المصري مباشرة أو عبر بنك مراسل في بلد المشتري حسب الصيغة المطلوبة؛ راجع صيغة الضمان مع البنك قبل الموعد بوقت كافٍ.",
      "Tender guarantees (bid, performance, advance payment) are issued by your Egyptian bank directly or through a correspondent bank in the buyer's country, per the required wording; review the wording with your bank well before the deadline.")
  ];
  var cautionsCommon = [
    L("تحقق من الفرصة على المصدر الرسمي (رابط المصدر في بطاقة الفرصة) قبل أي خطوة، ولا تعتمد على رسائل أو مجموعات تعيد نشر المناقصات.",
      "Verify every opportunity on the official source (the source link on the opportunity card) before acting; do not rely on messages or groups that repost tenders."),
    L("لا تدفع أبدًا «رسوم تسجيل» أو «رسوم ترسية» لوسيط أو شخص. الرسوم الرسمية (ثمن الوثائق مثلًا) تُسدد فقط عبر البوابة الرسمية أو للجهة نفسها.",
      "Never pay 'registration' or 'award' fees to an intermediary or individual. Official fees (e.g. document price) are paid only through the official portal or to the entity itself."),
    L("تحقق من المشتري الخاص: السجل التجاري، النطاق الرسمي للبريد الإلكتروني (لا بريد مجاني)، العنوان والهاتف من مصدر مستقل، وتقارير ائتمانية عند الحاجة.",
      "Verify private buyers: commercial registration, an official email domain (not free webmail), address and phone from an independent source, and credit reports where needed."),
    L("احذر تغيير بيانات الحساب البنكي عبر البريد الإلكتروني؛ أكّد أي تعليمات دفع هاتفيًا على رقم معروف مسبقًا.",
      "Beware of bank-detail changes sent by email; confirm any payment instruction by phone on a number you already know."),
    L("اقرأ شروط الجزاءات والغرامات والضمانات وفترة الضمان قبل التسعير، وسعّر شاملًا الشحن والتأمين والرسوم وتكلفة الضمانات البنكية.",
      "Read penalty, liquidated-damages, guarantee and warranty clauses before pricing, and price in freight, insurance, fees and bank-guarantee costs."),
    L("تأكد من قدرة بنكك على التعامل مع بلد المشتري (قيود العقوبات الدولية أو التحويلات) قبل التقديم.",
      "Check that your bank can handle payments with the buyer's country (international sanctions or transfer restrictions) before bidding.")
  ];
  var docsExport = [
    L("السجل التجاري والبطاقة الضريبية سارية.", "Valid commercial registration and tax card."),
    L("القيد في سجل المصدرين لدى الهيئة العامة للرقابة على الصادرات والواردات (GOEIC).", "Registration in the Exporters Register at GOEIC (General Organization for Export and Import Control)."),
    L("شهادة منشأ: التفضيلية (مثل GAFTA وEUR.1 وEUR-MED وCOMESA وAfCFTA وGSTP) تصدرها GOEIC، وغير التفضيلية للدول التي لا تربطها بمصر اتفاقات تفضيلية تصدرها الغرف التجارية. احتفظ بمستندات إثبات المنشأ 5 سنوات.",
      "Certificate of origin: preferential ones (e.g. GAFTA, EUR.1, EUR-MED, COMESA, AfCFTA, GSTP) are issued by GOEIC; non-preferential ones for countries without a preferential agreement are issued by chambers of commerce. Keep origin records for 5 years."),
    L("فاتورة تجارية وقائمة تعبئة وبوليصة شحن، وشهادات المطابقة/الفحص التي يطلبها بلد الاستيراد أو العقد.",
      "Commercial invoice, packing list, bill of lading, and the conformity/inspection certificates required by the importing country or the contract."),
    L("ملف الشركة وسابقة الأعمال وشهادات الجودة (مثل ISO) والقوائم المالية، فهي الأكثر طلبًا في التأهيل.",
      "Company profile, references, quality certificates (e.g. ISO) and financial statements, the items most often requested for qualification.")
  ];

  var markets = {
    local: {
      name_ar: "السوق المحلي (مصر)", name_en: "Local market (Egypt)",
      summary_ar: "مناقصات الجهات العامة في مصر يحكمها القانون 182 لسنة 2018 ولائحته التنفيذية، وتُنشر على بوابة التعاقدات العامة. للمنتج المستوفي لنسبة المكون الصناعي المصري أفضلية سعرية حتى 15% وفق القانون 5 لسنة 2015.",
      summary_en: "Public-entity tenders in Egypt are governed by Law 182/2018 and its executive regulations and published on the Public Procurement Portal. Products meeting the required Egyptian industrial content get a price preference of up to 15% under Law 5/2015.",
      steps: [
        L("تابع المناقصات يوميًا (المنصة تجمعها لك) وراجع آخر موعد لشراء الكراسة وتقديم العطاء.", "Track tenders daily (the platform collects them) and note the last date to buy the booklet and to bid."),
        L("اشترِ كراسة الشروط واقرأ المواصفات ومعايير التقييم وشروط السداد والغرامات.", "Buy the booklet and read specifications, evaluation criteria, payment terms and penalties."),
        L("أرسل الاستفسارات كتابيًا قبل الموعد المحدد، واحضر جلسة الاستيضاح إن وجدت.", "Send questions in writing before the set date and attend any clarification session."),
        L("جهّز التأمين المؤقت (حد أقصى 1.5% من القيمة التقديرية للتوريد والخدمات) صالحًا 30 يومًا بعد سريان العطاء.", "Prepare the provisional guarantee (max 1.5% of the estimated value for supplies/services) valid 30 days beyond bid validity."),
        L("قدّم المظروفين الفني والمالي مغلقين في الموعد والمكان المحددين.", "Submit the sealed technical and financial envelopes on time at the stated place."),
        L("إن كان منتجك مستوفيًا لنسبة المكون الصناعي المصري، يُعتبر عطاؤك الأقل سعرًا إذا لم تتجاوز الزيادة 15% عن أقل عطاء غير مستوفٍ؛ أرفق ما يثبت النسبة كما تطلب الكراسة.", "If your product meets the Egyptian industrial content requirement, your bid counts as lowest if it is no more than 15% above the lowest non-compliant bid; attach the proof the booklet asks for."),
        L("عند القبول: التأمين النهائي 5% من قيمة العقد خلال 10 أيام عمل من اليوم التالي للإخطار.", "On acceptance: final guarantee of 5% of contract value within 10 working days from the day after notification."),
        L("ورّد وفق العقد؛ يُصرف ثمن الأصناف خلال مدة لا تتجاوز 30 يومًا من تاريخ الفحص والاستلام والاعتماد ما لم ينص العقد على غير ذلك.", "Deliver per contract; payment is due within 30 days of inspection, acceptance and approval, subject to the contract terms.")
      ],
      documents: [
        L("السجل التجاري والبطاقة الضريبية.", "Commercial registration and tax card."),
        L("شهادة التسجيل في ضريبة القيمة المضافة إن كانت الشركة مسجلة.", "VAT registration certificate if registered."),
        L("السجل الصناعي (للمصانع) وما يثبت نسبة المكون المحلي عند طلب الأفضلية.", "Industrial register (for factories) and proof of local content when claiming the preference."),
        L("أي مستندات أخرى تنص عليها كراسة الشروط (سابقة أعمال، شهادات جودة، كتالوجات وعينات).", "Any other documents in the booklet (references, quality certificates, catalogues, samples).")
      ],
      certifications: [],
      payment_shipping: [
        L("السداد للمورد خلال 30 يومًا من الفحص والاستلام والاعتماد (ما لم ينص العقد على غير ذلك)، وفي المقاولات دفعات تحت الحساب خلال 60 يومًا.", "Supplier payment within 30 days of inspection, acceptance and approval (subject to the contract); progress payments in works within 60 days."),
        L("يجوز صرف دفعة مقدمة مقابل خطاب ضمان بنكي غير مشروط بنفس القيمة إذا حددت الكراسة نسبتها.", "An advance payment may be paid against an unconditional bank guarantee of the same value if the booklet sets its percentage.")
      ],
      cautions: [
        L("راجع آخر موعد لشراء الكراسة إن حدده الإعلان، فقد يختلف عن موعد تقديم العطاءات.", "Check the booklet purchase deadline if the notice sets one; it may differ from the bid deadline."),
        L("تجنّب التحفظات في العطاء قدر الإمكان، واطرح ملاحظاتك عبر الاستفسارات قبل التقديم؛ الكراسة تحدد كيفية التعامل مع التحفظات.", "Avoid reservations in the bid where possible and raise concerns through clarifications before submission; the booklet sets how reservations are treated."),
        L("جلسة فتح المظاريف علنية ويجوز لمقدمي العطاءات أو مندوبيهم (بتفويض كتابي) حضورها.", "Envelope opening is a public session that bidders or their authorised representatives (with written authorisation) may attend.")
      ].concat(cautionsCommon.slice(0, 2)),
      sources: [S.eg182, S.egPortal]
    },

    gulf: {
      name_ar: "الخليج", name_en: "Gulf (GCC)",
      summary_ar: "دول الخليج كلها أطراف في منطقة التجارة الحرة العربية الكبرى (GAFTA) مع مصر، فشهادة المنشأ العربية تمنح المعاملة التفضيلية عند استيفاء قاعدة 40% قيمة مضافة محلية أو القواعد التفصيلية. المناقصات الحكومية تتم عبر مجالس/بوابات وطنية، وكثير منها «محلي» يتطلب تسجيلًا في البلد، لذلك الوكيل أو الموزع المحلي عنصر أساسي. اشتراطات المطابقة (SABER في السعودية، ECAS في الإمارات، G-Mark الخليجية) تقع غالبًا على المستورد المحلي.",
      summary_en: "All GCC states are GAFTA parties with Egypt, so the Arab certificate of origin gives preferential treatment when the 40% local value-added rule or detailed rules are met. Government tenders run through national boards/portals and many are 'local', requiring in-country registration, so a local agent or distributor is key. Conformity requirements (SABER in Saudi Arabia, ECAS in the UAE, the Gulf G-Mark) usually fall on the local importer.",
      steps: [
        L("حدّد نوع الفرصة: مناقصة حكومية (محلية أم دولية؟) أم طلب شراء من شركة خاصة/شبه حكومية.", "Identify the opportunity type: a government tender (local or international?) or a purchase request from a private/semi-government company."),
        L("في المناقصات المحلية: اتفق مع وكيل/موزع مسجل في البلد يقدم العطاء ويستورد منتجاتك، ووثّق الاتفاق (الحصرية، العمولة، المسؤوليات).", "For local tenders, agree with a registered in-country agent/distributor who bids and imports your products, and document the deal (exclusivity, commission, responsibilities)."),
        L("في المناقصات الدولية: سجّل على بوابة الجهة واشترِ الوثائق وقدّم مباشرة، مع الاستعداد للتسجيل في البلد بعد الترسية إذا اشترط القانون.", "For international tenders, register on the portal, buy the documents and bid directly, ready to register in-country after award where the law requires."),
        L("تأكد من متطلبات المطابقة للمنتج في بلد الوصول قبل التسعير (شهادات، فحوص معمل معتمد، ملصقات عربية).", "Confirm product conformity requirements in the destination before pricing (certificates, accredited lab tests, Arabic labelling)."),
        L("أصدر شهادة المنشأ العربية (GAFTA) من GOEIC للاستفادة من الإعفاء الجمركي.", "Obtain the Arab (GAFTA) certificate of origin from GOEIC to benefit from duty exemption."),
        L("وقّع العقد/أمر الشراء بشروط تسليم إنكوترمز 2020 وطريقة سداد آمنة، ثم اشحن وتابع التخليص والاستلام.", "Sign the contract/PO with an Incoterms 2020 term and secure payment, then ship and follow clearance and acceptance.")
      ],
      documents: docsExport.concat([
        L("شهادة منشأ عربية (نموذج جامعة الدول العربية) صادرة من GOEIC.", "Arab certificate of origin (League of Arab States form) issued by GOEIC.")
      ]),
      certifications: [
        L("السعودية - منصة «سابر» (SABER): المستورد يسجل المنتج؛ المنتجات الخاضعة للوائح فنية تحتاج شهادة مطابقة منتج (PCoC) من جهة مانحة معتمدة من الهيئة السعودية للمواصفات (SASO) ثم شهادة إرسالية لكل شحنة، وغير الخاضعة تحتاج إقرارًا ذاتيًا ثم شهادة إرسالية. جهّز تقارير الاختبار والملف الفني لمستوردك.",
          "Saudi Arabia - SABER platform: the importer registers the product; products under technical regulations need a Product Certificate of Conformity (PCoC) from a SASO-approved certification body, then a shipment certificate per consignment; unregulated products need a self-declaration then a shipment certificate. Provide test reports and the technical file to your importer.", "Saudi Arabia"),
        L("الإمارات - نظام الإمارات لتقييم المطابقة (ECAS) لدى وزارة الصناعة والتكنولوجيا المتقدمة: شهادة مطابقة للمنتجات الخاضعة للوائح فنية، يتقدم بها حامل رخصة تجارية/صناعية إماراتية (عادة المستورد) مع تقرير اختبار من مختبر معتمد.",
          "UAE - Emirates Conformity Assessment Scheme (ECAS) at the Ministry of Industry and Advanced Technology: a conformity certificate for regulated products, applied for by a holder of a UAE trade/industrial licence (usually the importer) with a test report from an accredited lab.", "United Arab Emirates"),
        L("دول الخليج - علامة المطابقة الخليجية (G-Mark) من هيئة التقييس الخليجية (GSO): إلزامية للمنتجات الخاضعة للوائح الفنية الخليجية مثل ألعاب الأطفال والأجهزة الكهربائية منخفضة الجهد، وتصدر عبر جهات مقبولة (Notified Bodies).",
          "GCC - Gulf conformity mark (G-Mark) from the GCC Standardization Organization (GSO): mandatory for products under Gulf technical regulations such as children's toys and low-voltage electrical appliances, issued through notified bodies.", "GCC states (toys, low-voltage electrical equipment)")
      ],
      payment_shipping: payCommon,
      cautions: [
        L("المناقصة المصنفة «محلية» لا تقبل عادة شركة غير مسجلة في البلد؛ لا تشترِ الوثائق قبل التأكد من أهليتك أو من وجود شريك محلي.", "A tender classed as 'local' usually does not accept a company not registered in the country; do not buy documents before confirming eligibility or a local partner."),
        L("المنتجات الغذائية والطبية لها جهات تنظيمية مستقلة (مثل هيئة الغذاء والدواء في السعودية)؛ راجع اشتراطاتها مع المستورد.", "Food and medical products have separate regulators (e.g. the Saudi Food and Drug Authority); check their requirements with the importer.")
      ].concat(cautionsCommon),
      sources: [S.goeicAgr, S.goeicOrigin, S.bhGuide, S.bhLaw, S.omTim, S.saber, S.saso, S.saTic, S.moiat, S.gso, S.inco, S.ege]
    },

    africa: {
      name_ar: "أفريقيا", name_en: "Africa",
      summary_ar: "أغلب الفرص الأفريقية في بياناتنا مناقصات حكومية ممولة من البنك الدولي، وهي مفتوحة للشركات المؤهلة من كل الدول وتُدار بوثائق قياسية بالإنجليزية أو الفرنسية. مصر عضو في الكوميسا (قاعدة 35% قيمة مضافة أو القواعد التفصيلية) وفي اتفاقية التجارة الحرة القارية الأفريقية، وتصدر GOEIC شهادات المنشأ لكلتيهما. بعض الدول تشترط تقييم مطابقة قبل الشحن (مثل كينيا ونيجيريا).",
      summary_en: "Most African opportunities in our data are World Bank-financed government tenders, open to eligible firms from all countries and run with standard documents in English or French. Egypt is a COMESA member (35% local value-added rule or detailed rules) and an AfCFTA party; GOEIC issues certificates of origin for both. Some countries require pre-shipment conformity assessment (e.g. Kenya, Nigeria).",
      steps: [
        L("افتح إعلان البنك الدولي وحدد الجهة المنفذة واطلب وثائق المناقصة منها كما يحدد الإعلان.", "Open the World Bank notice, identify the implementing agency and request the bidding document as the notice instructs."),
        L("تحقق من لغة الوثائق (فرنسية في الدول الفرنكوفونية غالبًا) وجهّز ترجمة معتمدة للمستندات الداعمة إن لزم.", "Check the document language (often French in francophone countries) and arrange certified translations of supporting documents if needed."),
        L("راجع شروط التأهيل (خبرة توريد مماثلة، حجم أعمال) وفكّر في تحالف مع شركة محلية أو وكيل للتسليم والتركيب.", "Review qualification criteria (similar supply experience, turnover) and consider a joint venture with a local firm or an agent for delivery and installation."),
        L("جهّز ضمان العطاء أو إقرار ضمان العطاء، وقدّم قبل الموعد بالطريقة المحددة (بريد/يد/إلكتروني).", "Prepare the bid security or Bid-Securing Declaration and submit before the deadline as specified (mail/hand/electronic)."),
        L("بعد الترسية: ضمان حسن التنفيذ، ثم الشحن بالشرط المتفق عليه، مع شهادة المنشأ (COMESA أو AfCFTA إن انطبقت) وشهادات المطابقة المطلوبة.", "After award: performance security, then shipment on the agreed term, with the certificate of origin (COMESA or AfCFTA where applicable) and the required conformity certificates.")
      ],
      documents: docsExport.concat([
        L("شهادة منشأ الكوميسا (لدول الكوميسا مثل إثيوبيا ورواندا وأوغندا وجيبوتي وإسواتيني ومدغشقر وسيشل والكونغو الديمقراطية) أو شهادة AfCFTA، من GOEIC.", "COMESA certificate of origin (for COMESA members such as Ethiopia, Rwanda, Uganda, Djibouti, Eswatini, Madagascar, Seychelles, DR Congo) or an AfCFTA certificate, from GOEIC.")
      ]),
      certifications: [
        L("كينيا - برنامج التحقق من المطابقة قبل التصدير (PVoC) التابع لهيئة المواصفات الكينية (KEBS): تقييم مطابقة السلع لمواصفات كينيا وإصدار شهادة المطابقة يتم في بلد التصدير عن طريق جهة فحص معتمدة تعمل نيابة عن KEBS، وبعض السلع مستثناة. قبل الشحن تأكد مع KEBS أو المستورد من خضوع منتجك للبرنامج، والجهة المعتمدة التي تغطي مصر، والإجراء الساري.",
          "Kenya - Pre-Export Verification of Conformity (PVoC) run by the Kenya Bureau of Standards (KEBS): conformity assessment against Kenyan standards and the certificate of conformity are handled in the exporting country by an accredited inspection company acting for KEBS, and some goods are exempt. Before shipping, confirm with KEBS or the importer whether your product is covered, which appointed agent covers Egypt, and the current procedure.", "Kenya"),
        L("نيجيريا - برنامج SONCAP لهيئة المواصفات النيجيرية: شهادة منتج للمنتجات الخاضعة للوائح ثم شهادة SONCAP لكل شحنة، والشحنة بدونها تُرفض عند الدخول. تأكد من الاستثناءات والإجراء الحالي مع المستورد.",
          "Nigeria - SONCAP by the Standards Organisation of Nigeria: a Product Certificate for regulated products then a SONCAP Certificate per shipment; shipments without it are refused entry. Confirm exemptions and the current procedure with the importer.", "Nigeria")
      ],
      payment_shipping: payCommon.concat([
        L("في عقود البنك الدولي يكون السداد وفق شروط العقد القياسية (غالبًا اعتماد مستندي أو تحويل بعد الاستلام)، ويمكن للعقود الكبيرة (10 ملايين دولار فأكثر) أن تُسدد مباشرة من البنك عن حصته.", "In World Bank contracts payment follows the standard contract conditions (often an L/C or transfer after acceptance); large contracts (US$10m+) can be paid directly by the Bank for its share.")
      ]),
      cautions: [
        L("مشروعات بنك التنمية الأفريقي مفتوحة عادة لموردي الدول الأعضاء ومصر عضو؛ لكن راجع شرط الأهلية في كل وثيقة.", "AfDB projects are generally open to suppliers from member countries, and Egypt is a member; still check each document's eligibility clause."),
        L("خطط اللوجستيات للدول الحبيسة (مثل النيجر ورواندا وأوغندا وإسواتيني): ميناء العبور والنقل البري والتأمين وزمن التسليم.", "Plan logistics for landlocked countries (e.g. Niger, Rwanda, Uganda, Eswatini): transit port, inland haulage, insurance and delivery time.")
      ].concat(cautionsCommon),
      sources: [S.wbReg, S.wbNotices, S.goeicAgr, S.goeicOrigin, S.kePvoc, S.soncap, S.afdbRes, S.inco, S.ucp, S.ege]
    },

    asia: {
      name_ar: "آسيا", name_en: "Asia",
      summary_ar: "فرص آسيا في بياناتنا مناقصات ممولة من البنك الدولي (باكستان، بنجلاديش، أوزبكستان، إندونيسيا، الصين، منغوليا، لبنان، سوريا) وهي مفتوحة للشركات المصرية المؤهلة. انتبه: مشروعات بنك التنمية الآسيوي تشترط عادة جنسية دولة عضو، ومصر ليست عضوًا. لبنان وسوريا ضمن GAFTA، وبعض الدول الآسيوية (مثل إندونيسيا وباكستان وبنجلاديش) ضمن نظام الأفضليات التجارية العالمي GSTP.",
      summary_en: "Asian opportunities in our data are World Bank-financed tenders (Pakistan, Bangladesh, Uzbekistan, Indonesia, China, Mongolia, Lebanon, Syria), open to eligible Egyptian firms. Note: ADB-financed projects normally require member-country nationality and Egypt is not an ADB member. Lebanon and Syria are GAFTA parties, and some Asian countries (e.g. Indonesia, Pakistan, Bangladesh) are GSTP members.",
      steps: [
        L("افتح إعلان البنك الدولي، وتأكد أن الوثائق بالإنجليزية (الأكثر شيوعًا في آسيا)، واطلبها من الجهة المنفذة.", "Open the World Bank notice, confirm the documents are in English (most common in Asia) and request them from the implementing agency."),
        L("قارن المواصفات الفنية بقدرات مصنعك ومعايير الاختبار المطلوبة (المواصفات والفحص محددة في وثيقة المناقصة).", "Compare the technical specifications with your factory's capabilities and required test standards (specs and inspection are defined in the bidding document)."),
        L("احسب تكلفة الشحن والتأمين لمسافة أطول، وحدد شرط التسليم المطلوب في الوثائق.", "Price the longer freight and insurance, and use the delivery term required in the documents."),
        L("قدّم العطاء مع ضمان العطاء/الإقرار قبل الموعد، وتابع إخطار نية الترسية وفترة التوقف 10 أيام عمل.", "Submit with the bid security/declaration on time and follow the Notification of Intention to Award and the 10-business-day standstill."),
        L("بعد الترسية: ضمان حسن التنفيذ والشحن مع شهادة المنشأ المناسبة (GAFTA للبنان وسوريا، GSTP حيث تنطبق، وإلا شهادة غير تفضيلية من الغرفة التجارية).", "After award: performance security and shipment with the right certificate of origin (GAFTA for Lebanon and Syria, GSTP where applicable, otherwise a non-preferential chamber certificate).")
      ],
      documents: docsExport,
      certifications: [
        L("لا توجد شهادة موحدة لآسيا: في مناقصات البنك الدولي تحدد وثيقة المناقصة المواصفات القياسية والاختبارات والفحص المطلوب. للبيع التجاري المباشر راجع لوائح بلد الاستيراد مع المشتري قبل التسعير.",
          "There is no single Asian certificate: in World Bank tenders the bidding document sets the standards, tests and inspection. For direct commercial sales check the importing country's regulations with the buyer before pricing.", "Asia (per country)")
      ],
      payment_shipping: payCommon,
      cautions: [
        L("لا تشترِ وثائق مشروع ممول من بنك التنمية الآسيوي قبل التأكد من أنه «شراء عالمي» بلا قيود جنسية.", "Do not buy documents for an ADB-financed project before confirming it uses universal procurement with no nationality restriction."),
        L("بعض دول المنطقة عليها عقوبات أو قيود تحويل (مثل سوريا)؛ راجع بنكك وشروط السداد قبل التقديم.", "Some countries in the region face sanctions or transfer restrictions (e.g. Syria); check with your bank and the payment terms before bidding.")
      ].concat(cautionsCommon),
      sources: [S.wbReg, S.wbNotices, S.adbElig, S.adbMem, S.goeicAgr, S.inco, S.ucp, S.ege]
    },

    europe: {
      name_ar: "أوروبا", name_en: "Europe",
      summary_ar: "المناقصات الأوروبية تُنشر على TED فوق الحدود المحددة، وتُقدَّم إلكترونيًا على منصات وطنية وبلغة الدولة غالبًا. مصر ليست طرفًا في اتفاقية المشتريات الحكومية، فيجوز للجهة الأوروبية عدم قبول عطاء مصري مباشر؛ التوريد عبر مستورد/موزع أوروبي هو المسار الأكثر أمانًا. اتفاقية المشاركة المصرية الأوروبية تمنح التفضيل الجمركي بشهادة EUR.1 أو EUR-MED، والمنتج يجب أن يستوفي لوائح الاتحاد (CE حيث تنطبق، REACH للكيماويات، CBAM للصلب والألومنيوم والأسمنت والأسمدة).",
      summary_en: "EU tenders above thresholds are published on TED and submitted electronically on national platforms, usually in the national language. Egypt is not a GPA party, so an EU buyer may decline a direct Egyptian bid; supplying through an EU importer/distributor is the safer route. The EU-Egypt Association Agreement gives tariff preference with EUR.1 or EUR-MED, and products must meet EU rules (CE where applicable, REACH for chemicals, CBAM for steel, aluminium, cement and fertilisers).",
      steps: [
        L("افحص إعلان TED: الجهة، الموعد، اللغة، شروط الأهلية، وهل تقبل موردين من خارج الاتحاد.", "Check the TED notice: buyer, deadline, language, eligibility and whether non-EU suppliers are accepted."),
        L("سجّل على منصة الشراء الإلكتروني المذكورة وحمّل الوثائق، أو تواصل مع موزع أوروبي يقدم العطاء بمنتجك.", "Register on the named e-procurement platform and download the documents, or approach an EU distributor to bid with your product."),
        L("تحقق من لوائح المنتج في الاتحاد عبر بوابة Access2Markets (الرسوم، قواعد المنشأ، المتطلبات).", "Check EU product rules on Access2Markets (tariffs, rules of origin, requirements)."),
        L("املأ ESPD والمستندات المطلوبة، وقدّم إلكترونيًا قبل الموعد.", "Complete the ESPD and required documents and submit electronically on time."),
        L("عند الترسية/التعاقد: اشحن بشرط إنكوترمز متفق عليه مع شهادة EUR.1 أو EUR-MED من GOEIC (أو صفة المصدر المعتمد).", "On award/contract: ship on an agreed Incoterm with an EUR.1 or EUR-MED certificate from GOEIC (or approved-exporter status).")
      ],
      documents: docsExport.concat([
        L("شهادة حركة EUR.1 أو EUR-MED (أو إقرار منشأ على الفاتورة لمن حصل على صفة المصدر المعتمد من GOEIC).", "EUR.1 or EUR-MED movement certificate (or an origin declaration on the invoice for GOEIC approved exporters)."),
        L("ESPD (وثيقة المشتريات الأوروبية الموحدة) عند طلبها.", "ESPD (European Single Procurement Document) when requested.")
      ]),
      certifications: [
        L("علامة CE: للمنتجات الخاضعة لتشريعات التنسيق الأوروبية فقط؛ المصنّع يجري تقييم المطابقة ويعد الملف الفني ويصدر إعلان المطابقة الأوروبي ثم يضع العلامة، وينطبق ذلك على المنتجات المصنوعة خارج الاتحاد.",
          "CE marking: only for products covered by EU harmonisation legislation; the manufacturer performs the conformity assessment, compiles the technical file, issues the EU declaration of conformity and affixes the mark; this also applies to products made outside the EU.", "EU/EEA - products under harmonised legislation"),
        L("REACH: تسجيل المواد الكيميائية لدى الوكالة الأوروبية للمواد الكيميائية بكميات طن أو أكثر سنويًا. الشركة خارج الاتحاد ليست عليها التزامات مباشرة؛ الالتزام على المستورد الأوروبي، أو يعيّن المصنّع المصري «ممثلًا وحيدًا» داخل الاتحاد.",
          "REACH: chemical substances must be registered with ECHA at one tonne or more per year. Non-EU companies have no direct obligations; the EU importer does, or the Egyptian manufacturer appoints an 'only representative' in the EU.", "EU/EEA - chemicals (substances, mixtures)"),
        L("CBAM (آلية تعديل حدود الكربون): نظامها النهائي ساري منذ 1 يناير 2026 على واردات الأسمنت والحديد والصلب والألومنيوم والأسمدة والكهرباء والهيدروجين؛ المستورد الأوروبي يشتري شهادات CBAM عن الانبعاثات المضمنة، وسيطلب منك بيانات انبعاثات منتجك.",
          "CBAM: the definitive regime applies from 1 January 2026 to imports of cement, iron and steel, aluminium, fertilisers, electricity and hydrogen; the EU importer buys CBAM certificates for embedded emissions and will ask you for your product's emissions data.", "EU - cement, iron & steel, aluminium, fertilisers, electricity, hydrogen")
      ],
      payment_shipping: payCommon,
      cautions: [
        L("لا تفترض قبول عطاء مصري مباشر في مناقصة عامة أوروبية؛ اسأل الجهة كتابيًا أو ادخل عبر شريك أوروبي.", "Do not assume a direct Egyptian bid will be accepted in an EU public tender; ask the buyer in writing or enter through an EU partner."),
        L("وثائق المناقصات غالبًا بلغة الدولة (إسبانية، هولندية، فرنسية...)؛ استخدم ترجمة احترافية ولا تعتمد على الترجمة الآلية في الشروط الملزمة.", "Tender documents are usually in the national language (Spanish, Dutch, French...); use professional translation, not machine translation, for binding terms.")
      ].concat(cautionsCommon),
      sources: [S.ted, S.tedEc, S.espd, S.dir24, S.thr, S.gpa, S.kolin, S.ce, S.reach, S.cbam, S.a2m, S.goeicAgr, S.inco, S.ucp, S.ege]
    }
  };

  /* ---------- opportunity kinds ---------- */
  var kindsSrc = {
    gov: {
      name_ar: "مناقصة حكومية", name_en: "Government tender",
      ar: [
        "اقرأ الإعلان على المصدر الرسمي وحدد الجهة ونوع المناقصة (محلية/دولية، مفتوحة/محدودة، تأهيل مسبق).",
        "تأكد من أهليتك (الجنسية، التسجيل في البلد، التصنيف) قبل شراء الوثائق.",
        "سجّل على البوابة المطلوبة واشترِ/حمّل وثائق المناقصة قبل آخر موعد للشراء.",
        "أرسل الأسئلة كتابيًا خلال فترة الاستفسارات واحفظ الردود والملاحق.",
        "جهّز العرض الفني والمالي ومستندات التأهيل وضمان العطاء بالصيغة المطلوبة حرفيًا.",
        "قدّم قبل الموعد (يفضل قبله بيوم على الأقل) واحتفظ بإيصال التقديم.",
        "تابع جلسة الفتح والنتائج، وقدّم تظلمًا في المهلة القانونية إن لزم.",
        "عند الترسية: ضمان حسن التنفيذ في المهلة، توقيع العقد، التوريد والفحص، ثم المطالبة بالمستحقات."
      ],
      en: [
        "Read the notice on the official source and identify the entity and tender type (local/international, open/limited, prequalification).",
        "Confirm eligibility (nationality, in-country registration, classification) before buying documents.",
        "Register on the required portal and buy/download the documents before the purchase deadline.",
        "Send questions in writing during the clarification period and keep all answers and addenda.",
        "Prepare the technical and financial offers, qualification documents and bid security exactly in the required form.",
        "Submit before the deadline (ideally at least a day early) and keep the submission receipt.",
        "Follow the opening and results, and file a complaint within the legal period if needed.",
        "On award: performance security on time, sign the contract, deliver and pass inspection, then claim payment."
      ]
    },
    pvt: {
      name_ar: "مشترٍ خاص أو شركة (غير حكومية)", name_en: "Private buyer / company",
      ar: [
        "تحقق من هوية المشتري وسجله التجاري وموقعه وبريده الرسمي قبل إرسال أي عرض أو عينات.",
        "اطلب المواصفات والكميات ومواعيد التسليم وشروط التسليم والسداد المطلوبة كتابيًا.",
        "أرسل عرض سعر واضحًا: الصنف، السعر، العملة، شرط إنكوترمز 2020، مدة التسليم، صلاحية العرض، شروط السداد.",
        "اتفق على العينات والفحص قبل الشحن إن لزم، ومن يتحمل تكلفته.",
        "فاوض على الشروط ثم ثبّتها في عقد أو أمر شراء موقّع، مع القانون الواجب التطبيق وطريقة فض النزاعات.",
        "أمّن السداد: اعتماد مستندي (UCP 600) أو دفعة مقدمة، أو تأمين ائتمان من EGE للبيع الآجل.",
        "نفّذ وشحن بالمستندات المطلوبة، وتابع الاستلام والسداد وبناء علاقة طويلة."
      ],
      en: [
        "Verify the buyer's identity, commercial registration, website and official email before sending any offer or samples.",
        "Get the specifications, quantities, delivery dates and required delivery and payment terms in writing.",
        "Send a clear quotation: item, price, currency, Incoterms 2020 term, lead time, validity and payment terms.",
        "Agree on samples and any pre-shipment inspection, and who pays for it.",
        "Negotiate, then fix the terms in a signed contract or purchase order, including governing law and dispute resolution.",
        "Secure payment: a letter of credit (UCP 600) or advance payment, or EGE credit insurance for credit terms.",
        "Produce and ship with the required documents, follow acceptance and payment, and build a long-term relationship."
      ]
    },
    rfq: {
      name_ar: "طلب عرض أسعار (RFQ)", name_en: "Request for quotation (RFQ)",
      ar: [
        "اقرأ طلب العرض جيدًا: الأصناف، الكميات، المواصفات، آخر موعد، وطريقة الإرسال.",
        "تأكد من أن الطلب من جهة حقيقية (رابط المصدر، بريد رسمي) وأنه لا يطلب رسومًا مقدمًا.",
        "أرسل عرضًا مختصرًا ومطابقًا: سعر لكل بند، العملة، شرط التسليم، مدة التوريد، صلاحية العرض، والمستندات المطلوبة فقط.",
        "التزم بالموعد والصيغة؛ طلبات عروض الأسعار تُقيَّم بسرعة وغالبًا على أقل سعر مطابق.",
        "تابع بعد 3-5 أيام عمل بسؤال مهذب عن الحالة وأي توضيحات.",
        "عند القبول: استلم أمر الشراء كتابيًا وراجع شروطه قبل الإنتاج."
      ],
      en: [
        "Read the RFQ carefully: items, quantities, specifications, deadline and how to send.",
        "Make sure it comes from a real entity (source link, official email) and asks for no upfront fees.",
        "Send a short, compliant quote: unit prices, currency, delivery term, lead time, validity and only the requested documents.",
        "Respect the deadline and format; RFQs are evaluated quickly, often on the lowest compliant price.",
        "Follow up after 3-5 working days with a polite status question and any clarifications.",
        "On acceptance: get the purchase order in writing and review its terms before production."
      ]
    }
  };
  var kinds = {};
  Object.keys(kindsSrc).forEach(function (k) {
    var o = kindsSrc[k];
    kinds[k] = { name_ar: o.name_ar, name_en: o.name_en, ar: o.ar, en: o.en,
      steps: o.ar.map(function (a, i) { return { ar: a, en: o.en[i] }; }) };
  });

  /* ---------- email templates ---------- */
  var SIG_AR = "\n\nمع خالص التحية،\n{sender_name}\n{sender_title} - {company}\nهاتف: {phone}\nبريد إلكتروني: {email}\n{website}";
  var SIG_EN = "\n\nKind regards,\n{sender_name}\n{sender_title}, {company}\nTel: {phone}\nEmail: {email}\n{website}";
  var email_templates = {
    intro: {
      subject_ar: "{company} - مُصنّع مصري مهتم بـ: {title} (مرجع {ref})",
      body_ar: "السيد/السيدة {contact_name} المحترم/ة،\nتحية طيبة وبعد،\n\nنحن شركة {company}، مُصنّع مصري متخصص في {products}. اطلعنا على إعلانكم بخصوص «{title}» (مرجع {ref}) الصادر عن {entity}، ونود التعبير عن اهتمامنا بالمشاركة.\n\nنرجو التكرم بإفادتنا بالخطوات المطلوبة للحصول على وثائق المناقصة/الطلب وشروط الأهلية للموردين من خارج بلدكم، مع العلم بأن آخر موعد للتقديم حسب الإعلان هو {closing_date}.\n\nويسعدنا إرسال ملف تعريف الشركة (Company Profile) وأي معلومات أو عينات إضافية عند الطلب." + SIG_AR,
      subject_en: "{company} - Egyptian manufacturer interested in: {title} (Ref. {ref})",
      body_en: "Dear {contact_name},\n\n{company} is an Egyptian manufacturer specialising in {products}. We have reviewed your notice on \"{title}\" (Ref. {ref}) issued by {entity} and would like to express our interest in participating.\n\nCould you kindly advise how to obtain the tender/request documents and the eligibility conditions for suppliers based outside your country? We note the submission deadline of {closing_date}.\n\nWe would be glad to share our company profile and any further information or samples on request." + SIG_EN
    },
    request_documents: {
      subject_ar: "طلب وثائق المناقصة - {title} (مرجع {ref})",
      body_ar: "السيد/السيدة {contact_name} المحترم/ة،\nتحية طيبة وبعد،\n\nبالإشارة إلى إعلانكم بشأن «{title}» (مرجع {ref})، نرجو التكرم بتزويدنا بوثائق المناقصة كاملة، أو بإفادتنا بطريقة الحصول عليها وأي رسوم مقررة وطريقة سدادها.\n\nبيانات الشركة للمراسلة:\nالشركة: {company}\nالمسؤول: {sender_name} - {sender_title}\nالهاتف: {phone}\nالبريد الإلكتروني: {email}\n\nونرجو إخطارنا بأي ملاحق أو تعديلات تصدر قبل الموعد النهائي ({closing_date}).\n\nشاكرين حسن تعاونكم." + SIG_AR,
      subject_en: "Request for tender documents - {title} (Ref. {ref})",
      body_en: "Dear {contact_name},\n\nWith reference to your notice on \"{title}\" (Ref. {ref}), we kindly request the complete tender documents, or instructions on how to obtain them together with any applicable fee and payment method.\n\nContact details:\nCompany: {company}\nContact: {sender_name}, {sender_title}\nTel: {phone}\nEmail: {email}\n\nWe would also appreciate being informed of any addenda issued before the deadline ({closing_date}).\n\nThank you for your cooperation." + SIG_EN
    },
    clarification: {
      subject_ar: "استفسار بشأن {title} (مرجع {ref})",
      body_ar: "السيد/السيدة {contact_name} المحترم/ة،\nتحية طيبة وبعد،\n\nبعد مراجعة وثائق «{title}» (مرجع {ref})، نرجو التكرم بتوضيح النقاط التالية:\n\n1. [البند/الصفحة]: [السؤال]\n2. [البند/الصفحة]: [السؤال]\n\nنقدّر ردكم قبل الموعد المحدد للاستفسارات حتى نتمكن من تقديم عرض مطابق قبل {closing_date}." + SIG_AR,
      subject_en: "Clarification request - {title} (Ref. {ref})",
      body_en: "Dear {contact_name},\n\nHaving reviewed the documents for \"{title}\" (Ref. {ref}), we would be grateful for clarification on the following:\n\n1. [Clause/page]: [question]\n2. [Clause/page]: [question]\n\nWe would appreciate your reply before the clarification deadline so that we can submit a compliant offer before {closing_date}." + SIG_EN
    },
    submit_offer: {
      /* cover note only: platform emails carry text, no attachments, and bids go only through the channel set in the tender documents */
      subject_ar: "إخطار بتقديم عرض {company} - {title} (مرجع {ref})",
      body_ar: "السيد/السيدة {contact_name} المحترم/ة،\nتحية طيبة وبعد،\n\nنود إفادتكم بأن شركة {company} تقدمت بعرضها بخصوص «{title}» (مرجع {ref}) لصالح {entity} عبر [قناة التقديم المحددة في وثائق المناقصة/الطلب: المنظومة الإلكترونية / المظروف المغلق / البريد الإلكتروني المحدد]، قبل الموعد النهائي {closing_date}.\n\nالمنتجات المعروضة: {products}.\n\nنرجو التكرم بتأكيد استلام العرض. نسخ المستندات وشهادات الجودة متاحة عند الطلب، ونحن على استعداد لتقديم أي توضيحات أو عينات." + SIG_AR,
      subject_en: "Notice of offer submission by {company} - {title} (Ref. {ref})",
      body_en: "Dear {contact_name},\n\nWe would like to inform you that {company} has submitted its offer for \"{title}\" (Ref. {ref}) for {entity} through [the submission channel set in the tender/request documents: e-tendering system / sealed bid / designated email address], before the deadline of {closing_date}.\n\nProducts offered: {products}.\n\nWe would appreciate your confirmation of receipt. Copies of our documents and quality certificates are available on request, and we remain available for any clarification or samples." + SIG_EN,
      warning: L("هذه رسالة إخطار مرافقة فقط ولا تحتوي على العطاء. قدّم العطاء الفني والمالي فقط عبر القناة المحددة في وثائق المناقصة (المنظومة الإلكترونية أو المظروف المغلق أو العنوان المحدد)، ولا ترسل أسعارك بالبريد إلا إذا نصت الوثائق على ذلك. رسائل المنصة نصية ولا تحمل مرفقات.",
        "This is a cover notice only and does not contain the bid. Submit the technical and financial offer only through the channel set in the tender documents (e-tendering system, sealed bid or designated address), and do not email your prices unless the documents say so. Platform emails are text only and carry no attachments.")
    },
    follow_up: {
      subject_ar: "متابعة: {title} (مرجع {ref})",
      body_ar: "السيد/السيدة {contact_name} المحترم/ة،\nتحية طيبة وبعد،\n\nنود متابعة مراسلتنا السابقة بخصوص «{title}» (مرجع {ref}). نرجو التكرم بإفادتنا بالموقف الحالي أو بأي معلومات إضافية مطلوبة من جانبنا.\n\nنحن على استعداد تام لتقديم ما يلزم في أقرب وقت." + SIG_AR,
      subject_en: "Follow-up: {title} (Ref. {ref})",
      body_en: "Dear {contact_name},\n\nWe are following up on our previous message regarding \"{title}\" (Ref. {ref}). Could you kindly let us know the current status, or whether any further information is needed from our side?\n\nWe remain ready to provide anything required at short notice." + SIG_EN
    },
    negotiation: {
      subject_ar: "بخصوص شروط التعاقد - {title} (مرجع {ref})",
      body_ar: "السيد/السيدة {contact_name} المحترم/ة،\nتحية طيبة وبعد،\n\nنشكركم على اهتمامكم بعرضنا بخصوص «{title}» (مرجع {ref}). وحرصًا على إتمام التعاقد بما يحقق مصلحة الطرفين، نقترح ما يلي:\n- السعر/الكمية: [اقتراحنا]\n- شرط التسليم (إنكوترمز 2020): [الشرط]\n- مدة التوريد: [المدة]\n- شروط السداد: [مثال: اعتماد مستندي غير قابل للإلغاء]\n\nنرحب بمناقشة هذه النقاط في اجتماع أو مكالمة في الوقت المناسب لكم." + SIG_AR,
      subject_en: "Contract terms - {title} (Ref. {ref})",
      body_en: "Dear {contact_name},\n\nThank you for your interest in our offer for \"{title}\" (Ref. {ref}). To conclude an agreement that works for both parties, we propose:\n- Price/quantity: [our proposal]\n- Delivery term (Incoterms 2020): [term]\n- Lead time: [time]\n- Payment terms: [e.g. irrevocable letter of credit]\n\nWe would welcome a meeting or call at your convenience to discuss these points." + SIG_EN
    },
    thank_you: {
      subject_ar: "شكر وتقدير - {title} (مرجع {ref})",
      body_ar: "السيد/السيدة {contact_name} المحترم/ة،\nتحية طيبة وبعد،\n\nنتقدم بخالص الشكر لـ {entity} على الثقة وعلى التعاون بخصوص «{title}» (مرجع {ref}). نؤكد التزامنا الكامل بالجودة ومواعيد التسليم، ويسعدنا استمرار التعاون في المشروعات القادمة.\n\nللتواصل في أي وقت: {phone} - {email}." + SIG_AR,
      subject_en: "Thank you - {title} (Ref. {ref})",
      body_en: "Dear {contact_name},\n\nOur sincere thanks to {entity} for your trust and cooperation on \"{title}\" (Ref. {ref}). We are fully committed to quality and on-time delivery and look forward to working together on future projects.\n\nYou can reach us at any time: {phone} - {email}." + SIG_EN
    }
  };

  window.ADVISOR_GUIDES = {
    updated: "2026-11-17",
    disclaimer: L("إرشادات عامة مبنية على مصادر رسمية مذكورة؛ المرجع الملزم دائمًا هو إعلان الفرصة ووثائق المناقصة والعقد، وللقرارات القانونية أو المالية الكبيرة استشر محاميًا أو بنكك.",
      "General guidance based on the cited official sources; the binding reference is always the notice, the tender documents and the contract. For major legal or financial decisions consult a lawyer or your bank."),
    markets: markets,
    portals: portals,
    kinds: kinds,
    email_notice: L("رسائل المنصة نصية فقط ولا تحمل مرفقات؛ اكتب المطلوب في نص الرسالة أو اعرض إرسال الملفات عند الطلب. العطاءات الرسمية تُقدَّم فقط عبر القناة المحددة في وثائق المناقصة.",
      "Platform emails are text only and carry no attachments; put what is needed in the message body or offer to send files on request. Formal bids are submitted only through the channel set in the tender documents."),
    email_templates: email_templates
  };
})();
