// janna_lookup «useful for any factory» (2026-11-20, after the Al-Atlal call 8bacbfac: a roller maker asked for buyers and was shown his
// competitors). Runs on the real src/data.json + src/items.json; D1 = node:sqlite with the real schema (test/helpers.mjs). Covers:
//   U2  section=customers — the seller's customer industries → the platform's activity labels; factories only, traders apart, honest text
//   U10 tenders — legacy rows demoted, every result says its status, «مفيش مناقصة سارية …» when none is open
//   U15 sections projects / events / news / awards (+ platform_item news / events)
//   U16 the members' approved products / companies from D1 (≤ 1 read per isolate per 10 minutes), tagged «عضو على المنصة», fail-soft
//   U1  an Arabic word matches whole stored words only: «فرن» ≠ «فرنسا», «غاز» ≠ «غازية», «ملح» ≠ «ملحقات», «سكر» ≠ «سكرين»
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import worker, { search, tenderStatus, lookupSection, LOOKUP_SECTIONS } from "../src/index.js";
import DATA from "../src/data.json";
import ITEMS from "../src/items.json";
import { norm } from "../src/text.js";
import { canon, variants } from "../src/lookup-terms.js";
import { custTerms, CUST_MAP } from "../src/lookup-customers.js";
import { memberData, resetMembers, MEMBERS_TTL, MEMBER_TAG } from "../src/lookup-members.js";
import { findItem, sectionOf } from "../src/janna-item.js";
import { D1 } from "./helpers.mjs";

const S = "https://madeinegyptgate.com";
const NOW = Date.parse("2026-11-20T10:00:00Z");
const post = async (body, env = {}) => (await worker.fetch(new Request(S + "/api/janna/lookup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), env, {})).json();
/* a digit run of 7 or more (a phone number), Western or Arabic-Indic; an e-mail */
const LONG_DIGITS = /[0-9٠-٩]{7,}/, AT = /@/;
/* the plan names of data/plan.js / the Control Center matrix: the customers text promises no plan */
const PLAN_WORDS = /باق[ةه]|الأساسية|المميزة|الشريك|بيانات الشركة|basic|premium|partner|strategic/i;
const words6 = f => { const o = []; for (const part of String(f[6]).split("|")) for (let j = 0; j + DATA.fw <= part.length; j += DATA.fw) o.push(DATA.fv[parseInt(part.slice(j, j + DATA.fw), 36)]); return o; };
const rowOf = x => DATA.f.find(f => S + "/" + f[5] === x.url || f[0] === x.name);

describe("U2 section=customers: the seller's customers, not his competitors", () => {
  const GIZA = [norm("الجيزة"), norm("السادس من أكتوبر"), norm("6 أكتوبر")]; // src/index.js locOk: the governorate or one of its industrial cities
  const inGiza = f => GIZA.some(g => norm(f[3]).includes(g));
  /* what the response must say, computed here from data.json: rows of each label in Giza, «مصنع» = a factory, every other type = a trader */
  const expected = label => { let factories = 0, others = 0; for (const f of DATA.f) if (f[2] === label && inGiza(f)) { if (f[1] === "مصنع") factories++; else others++; } return { factories, others }; };
  /* the industries Al-Atlal named in 8bacbfac, the printing houses («مطابع») among them */
  const AL_ATLAL = "ورق، كرتون، سكر، أسمنت، بلاستيك، تعبئة وتغليف، مطابع";
  test("Al-Atlal's customers in الجيزة: one group per industry, its factories counted from data.json, the traders apart", () => {
    const r = search("customers", AL_ATLAL, "الجيزة");
    assert.equal(r.section, "customers"); assert.equal(r.governorate, "الجيزة");
    const want = ["التعبئة والتغليف والورق", "الصناعات الغذائية والمشروبات", "مواد البناء والتشييد", "الصناعات البلاستيكية والمطاط", "الطباعة والدعاية والإعلان"];
    assert.deepEqual(r.groups.map(g => g.industry).sort(), [...want].sort());
    /* review: «ورق» is the paper industry only — without «مطابع» no printing group is counted (an industry the seller never named) */
    assert.deepEqual(search("customers", "ورق، كرتون، سكر، أسمنت، بلاستيك، تعبئة وتغليف", "الجيزة").groups.map(g => g.industry).sort(), want.slice(0, 4).sort());
    let sum = 0, traders = 0;
    for (const g of r.groups) {
      const e = expected(g.industry);
      assert.deepEqual([g.factories, g.others], [e.factories, e.others], g.industry);
      assert.ok(g.factories >= 5, g.industry + " " + g.factories); // 2026-11-20: 14 / 15 / 19 / 14 / 13, others 60 / 8 / 2 / 2 / 0
      sum += e.factories; traders += e.others;
      assert.ok(g.top.length <= 2 && g.top.length === Math.min(2, g.factories));
      for (const t of g.top) { for (const k of ["name", "place", "id", "open_url"]) assert.ok(t[k], k); const f = rowOf({ name: t.name }); assert.equal(f[1], "مصنع", t.name); assert.equal(f[2], g.industry); }
    }
    assert.equal(r.count, sum, "count = distinct factories"); assert.equal(r.others, traders, "traders are reported, never counted");
    assert.deepEqual(r.groups.map(g => g.factories), [...r.groups.map(g => g.factories)].sort((a, b) => b - a), "the biggest industry first");
    assert.ok(r.results.length > 0 && r.results.length <= 6);
    for (const x of r.results) { assert.equal(x.type, "مصنع", x.name); assert.ok(x.id && x.open_url && x.industry, x.name); assert.match(x.location, /الجيزة|أكتوبر/); }
  });
  test("the text: data only — directory factories, not purchase requests, no contacts, no plan promise", () => {
    const r = search("customers", AL_ATLAL, "الجيزة");
    assert.match(r.text, /مش طلبات شراء/); assert.match(r.text, /بيانات تواصلهم مش منشورة/);
    assert.match(r.text, /^دي مصانع في دليل المنصة في الصناعات اللي حضرتك قلت إنك بتخدمها في الجيزة/);
    assert.ok(r.text.includes("المجموع " + r.count + " مصنع") && r.text.includes(r.others + " شركة تجارية وموردين"), r.text);
    for (const g of r.groups) assert.ok(r.text.includes(g.industry + ": " + g.factories + " مصنع"), g.industry); // 11 and more: «مصنع» (3–10: «مصانع»)
    assert.match(search("customers", "ألبان", "الإسكندرية").text, /الصناعات الغذائية والمشروبات: (\d مصانع|10 مصانع|مصنع واحد|مصنعين|\d{2,} مصنع)/);
    assert.doesNotMatch(r.text, PLAN_WORDS); assert.doesNotMatch(r.text, AT); assert.doesNotMatch(r.text, LONG_DIGITS);
    const all = JSON.stringify(r); assert.doesNotMatch(all, AT); assert.doesNotMatch(all, /"(phone|mobile|whatsapp|email|e_mail)"/i);
    assert.match(r.text, /قوليها كده بالظبط/, "Janna: feminine"); assert.match(r.text, /ماتوعديش بالتواصل معاهم/);
  });
  test("Bassem (his tool sends page / market: `paged`) gets the masculine text; nothing else changes", () => {
    const j = search("customers", AL_ATLAL, "الجيزة"), b = search("customers", AL_ATLAL, "الجيزة", undefined, 1, "local");
    assert.match(b.text, /قولها كده بالظبط/); assert.match(b.text, /ماتوعدش بالتواصل معاهم، وماتضيفش/);
    assert.deepEqual(b.groups, j.groups); assert.equal(b.count, j.count);
  });
  test("an industry the platform does not know: «مالقيتش صناعة اسمها …»; the known ones are still counted", () => {
    const u = search("customers", "مطابع وشغل فضاء خارجي", "القاهرة");
    assert.match(u.text, /مالقيتش صناعة اسمها «فضاء خارجي» في دليل المنصة/); assert.deepEqual(u.unknown, ["فضاء خارجي"]);
    assert.deepEqual(u.groups.map(g => g.industry), ["الطباعة والدعاية والإعلان"]);
    const none = search("customers", "خخخظظظ", "");
    assert.equal(none.count, 0); assert.equal(none.groups.length, 0); assert.match(none.text, /^مالقيتش صناعة اسمها «خخخظظظ»/); assert.match(none.text, /اسألي العميل/);
  });
  test("review: a kind of customer the directory does not list (hospitals, restaurants, shops) is no industry and is not searched as words", () => {
    const h = search("customers", "مستشفيات ومعامل", "القاهرة");
    assert.deepEqual([h.count, h.groups.length, h.unknown], [0, 0, ["مستشفيات", "معامل"]], "not the makers of medical / lab equipment"); assert.match(h.text, /^مالقيتش صناعة اسمها «مستشفيات» ولا «معامل»/);
    const r = search("customers", "سوبرماركت، مطاعم، مخابز", "الإسكندرية");
    assert.deepEqual(r.groups.map(g => g.industry), ["الصناعات الغذائية والمشروبات"], "bakeries are food factories; restaurants are not «معدات المطاعم»"); assert.deepEqual(r.unknown, ["سوبرماركت", "مطاعم"]);
    assert.deepEqual(search("customers", "hospitals and supermarkets", "").groups, []);
    assert.deepEqual(search("customers", "معدات مطاعم", "").groups.map(g => g.industry), ["التجهيزات الفندقية ومعدات المطاعم"], "the equipment makers when he names them");
    assert.equal(search("customers", "شركات كبيرة", "").groups.length, 0, "a size is no industry (not 10 companies whose text says «خبرة كبيرة»)");
  });
  test("review: the seller's own product as the query — the companies that write it are said to be its makers (competitors), the persona asks first", () => {
    const r = search("customers", "سلندرات ودرافيل", "الجيزة"), b = search("customers", "سلندرات ودرافيل", "الجيزة", undefined, 1, "local");
    assert.deepEqual(r.groups.map(g => [g.industry, !!g.by_words]).sort(), [["درافيل", true], ["سلندرات", true]], "no attached «و» in the name: " + JSON.stringify(r.groups));
    assert.match(r.text, /تنبيه: «درافيل» و«سلندرات» مش أسماء صناعات في الدليل/); assert.match(r.text, /يبقوا منافسين مش عملاء، فاسأليه الأول/);
    assert.match(b.text, /يبقوا منافسين مش عملاء، فاسأله الأول بيبيعها لأنهي صناعات قبل ما تقول الأرقام دي/);
    assert.doesNotMatch(search("customers", AL_ATLAL, "الجيزة").text, /تنبيه/, "the platform's own industries need no warning");
  });
  test("the seller's own words: lists with «،» / «و», attached «و», English, a city counts as its governorate", () => {
    const t = custTerms(norm("مصانع الورق والكرتون وتعبئة وتغليف").split(" "));
    assert.ok(t.every(x => x.labels.includes("التعبئة والتغليف والورق")), JSON.stringify(t));
    assert.deepEqual(custTerms(norm("سكر").split(" "))[0].labels, ["الصناعات الغذائية والمشروبات"]);
    assert.deepEqual(custTerms(norm("للأسمنت").split(" "))[0].labels, ["مواد البناء والتشييد"]);
    assert.equal(custTerms(norm("مصانع وشركات").split(" ")).length, 0, "generic words are no industry");
    for (const [label] of CUST_MAP) assert.ok(DATA.f.some(f => f[2] === label), "CUST_MAP label is a real activity label: " + label);
    const en = search("customers", "printing houses, packaging, food", "");
    assert.deepEqual(en.groups.map(g => g.industry).sort(), ["التعبئة والتغليف والورق", "الصناعات الغذائية والمشروبات", "الطباعة والدعاية والإعلان"].sort());
    assert.match(en.text, /في كل المحافظات/);
    const oct = search("customers", "بلاستيك", "6 أكتوبر");
    assert.equal(oct.governorate, "الجيزة"); assert.equal(oct.city, "6 أكتوبر"); assert.match(oct.text, /في محافظة الجيزة \(اللي فيها 6 أكتوبر\)/);
    assert.equal(oct.groups[0].factories, search("customers", "بلاستيك", "الجيزة").groups[0].factories);
  });
  test("POST (Anam): the lean shape keeps groups / results / text; the groups' open_url are decoded; the old sections stay as they were", async () => {
    const r = await post({ section: "customers", query: AL_ATLAL, governorate: "الجيزة" });
    for (const k of ["section", "count", "groups", "results", "text", "page", "pages", "has_more"]) assert.ok(k in r, k);
    assert.equal(r.section, "customers");
    for (const g of r.groups) for (const t of g.top) assert.ok(t.open_url.startsWith(S + "/") && !/%D8/i.test(t.open_url), t.open_url);
    assert.equal(lookupSection("customers"), "customers"); assert.equal(lookupSection("buyers"), "customers"); assert.equal(lookupSection("nonsense"), "factories");
    for (const s of ["factories", "suppliers", "products", "market", "tenders", "rfqs", "offers", "cities", "customers", "projects", "events", "news", "awards"]) assert.ok(LOOKUP_SECTIONS.includes(s), s);
  });
});

describe("U10 tenders: open first, legacy rows last, every result says its status", () => {
  test("«حديد»: every open match ranks above any undated row; the legacy rows rank below the dated ones; each line says its status", () => {
    const r = search("tenders", "حديد", "", 10, 1, "local", { nowMs: NOW }), all = search("tenders", "حديد", "", 50, 1, "local", { nowMs: NOW });
    const st = all.results.map(x => x.status), lastOpen = st.map(s => s === "سارية" || s === "تنتهي قريباً").lastIndexOf(true), firstUndated = st.indexOf("غير محدد الموعد");
    assert.ok(lastOpen >= 0 && firstUndated > lastOpen, st.join(" | "));
    const sameClass = all.results.filter(x => x.match === "all" && x.status !== "سارية" && x.status !== "تنتهي قريباً");
    const lastDated = sameClass.map(x => !x.legacy).lastIndexOf(true), firstLegacy = sameClass.findIndex(x => x.legacy);
    assert.ok(firstLegacy > lastDated, "legacy rows −3: " + sameClass.map(x => (x.legacy ? "L" : "D")).join(""));
    for (const x of all.results) if (x.legacy) { assert.equal(x.status, "غير محدد الموعد"); assert.equal(x.entity, "جهة حكومية"); }
    assert.match(r.text, /\(السارية منهم: \d+\)/);
    assert.match(r.text, /سارية، آخر موعد 2026-12-08/); assert.match(r.text, /قديمة من غير ميعاد/); assert.doesNotMatch(r.text, /— جهة حكومية —/, "the placeholder entity is not said");
    for (const x of r.results.slice(0, 6)) assert.ok(r.text.includes(x.title.slice(0, 30)), x.title);
  });
  test("no open match: the text starts «مفيش مناقصة سارية في «q» على المنصة دلوقتي؛ أقرب اللي عندنا: … (قديمة / منتهية)»", () => {
    const r = search("tenders", "كاوتش", "", undefined, undefined, undefined, { nowMs: NOW });
    assert.ok(r.count > 0 && r.results.every(x => x.status !== "سارية" && x.status !== "تنتهي قريباً"));
    assert.match(r.text, /^مفيش مناقصة سارية في «كاوتش» على المنصة دلوقتي؛ أقرب اللي عندنا: /);
    assert.match(r.text, /قديمة من غير ميعاد|منتهية، آخر موعد كان \d{4}-\d{2}-\d{2}/); assert.match(r.text, /ولا واحدة منهم سارية/);
    const b = search("tenders", "كاوتش", "", undefined, 1, undefined, { nowMs: NOW }); assert.match(b.text, /قولها كده: مفيش مناقصة سارية دلوقتي/);
    const g = search("tenders", "حديد", "القاهرة", undefined, undefined, undefined, { nowMs: NOW });
    if (!g.results.some(x => x.status === "سارية" || x.status === "تنتهي قريباً")) assert.match(g.text, /^مفيش مناقصة سارية في «حديد» في القاهرة على المنصة دلوقتي/);
  });
  test("tenderStatus() is unchanged (the honest 4-value rule)", () => {
    assert.equal(tenderStatus("", NOW), "غير محدد الموعد"); assert.equal(tenderStatus("2026-11-19", NOW), "منتهية");
    assert.equal(tenderStatus("2026-11-24", NOW), "تنتهي قريباً"); assert.equal(tenderStatus("2026-12-30", NOW), "سارية");
  });
});

describe("U15 the dated lists: events, news, projects, awards", () => {
  test("events «طاقة»: the two Egypt energy shows of 2027 with their dates, the next first", () => {
    const r = search("events", "طاقة", "", undefined, undefined, undefined, { nowMs: NOW });
    const byTitle = Object.fromEntries(r.results.map(x => [x.title, x]));
    assert.equal(byTitle["معرض مصر للطاقة (إيجبس) 2027"].date, "2027-03-30");
    assert.equal(byTitle["معرض مصر للطاقة (إيجيبت إنرجي) 2027"].date, "2027-11-15");
    assert.ok(r.results.every(x => x.status === "قادم" && x.id && x.open_url.startsWith(S + "/event.html#")));
    assert.deepEqual(r.results.map(x => x.date), [...r.results.map(x => x.date)].sort());
    assert.match(r.text, /أجندة معارض المنصة/); assert.match(r.text, /2027-03-30 \(قادم\)/);
    const list = search("events", "معارض", "", 10, undefined, undefined, { nowMs: NOW }); // the section's own word: the whole agenda, the next first
    assert.equal(list.count, DATA.i.filter(x => x[0] === "event").length);
    const up = list.results.filter(x => x.status === "قادم").map(x => x.date); assert.deepEqual(up, [...up].sort());
  });
  test("news «حديد»: dated items with their source names, the newest first; no invented numbers in the text", () => {
    const r = search("news", "حديد", "");
    assert.ok(r.count >= 2);
    for (const x of r.results) { assert.match(x.date, /^\d{4}-\d{2}-\d{2}$/); assert.ok(x.source, x.title); assert.ok(x.id && x.documents_url); }
    assert.deepEqual(r.results.map(x => x.date), [...r.results.map(x => x.date)].sort().reverse());
    assert.match(r.text, /أخبار المنصة/); assert.match(r.text, /قولي المصدر والتاريخ زي ما هما/);
  });
  test("projects and awards: real records with the ids platform_item opens", () => {
    const p = search("projects", "محطة كهرباء", "");
    assert.ok(p.count >= 1); for (const x of p.results) { assert.equal(findItem("projects", { id: x.id }, NOW).found, true, x.id); assert.ok(x.open_url); }
    const a = search("awards", "حسن علام", "مطروح");
    assert.ok(a.count >= 1); for (const x of a.results) { assert.match(x.winner, /حسن علام/); assert.equal(x.governorate, "مطروح"); assert.equal(findItem("awards", { id: x.id }, NOW).found, true); }
    assert.match(a.text, /الفايز/);
    assert.match(search("awards", "طائرات فضائية", "").text, /^لا توجد نتائج مطابقة في ترسيات المنصة لهذا البحث/);
  });
  test("platform_item: an event and a news item by id (and by title), with a spoken text from their own fields", () => {
    assert.equal(sectionOf("events"), "events"); assert.equal(sectionOf("event"), "events"); assert.equal(sectionOf("news"), "news");
    const e = findItem("events", { id: "egypes-2027" }, NOW);
    assert.equal(e.found, true); assert.equal(e.date, "2027-03-30"); assert.equal(e.status, "قادم"); assert.match(e.text, /30 مارس 2027/); assert.ok(e.open_url.endsWith("event.html#egypes-2027"));
    const ev = search("events", "طاقة", "").results[0]; assert.equal(findItem("events", { id: ev.id }, NOW).title, ev.title, "the lookup's id opens it");
    const n0 = search("news", "حديد", "").results[0], n = findItem("news", { id: n0.id }, NOW);
    assert.equal(n.found, true); assert.equal(n.title, n0.title); assert.match(n.text, /منشور في/); assert.equal(n.source, n0.source);
    assert.equal(findItem("events", { title: "فود أفريكا" }, NOW).id, "food-africa-2026");
  });
  test("review: an event that started 2 days ago may still be running — «بدأ», listed first, never «انتهى» (the data keeps no end date)", () => {
    const d2 = Date.parse("2026-11-28T10:00:00Z"), d9 = Date.parse("2026-12-05T10:00:00Z"); // Cairo Wood Show: 26–29 Nov 2026 (data/real.js)
    const w = search("events", "أخشاب", "", undefined, undefined, undefined, { nowMs: d2 }).results.find(x => x.id === "cairo-woodshow-2026");
    assert.equal(w.status, "بدأ"); assert.equal(search("events", "معارض", "", 10, undefined, undefined, { nowMs: d2 }).results[0].id, "cairo-woodshow-2026", "the running one first");
    const it = findItem("events", { id: "cairo-woodshow-2026" }, d2); assert.equal(it.status, "بدأ"); assert.match(it.text, /بدأ يوم .* وممكن يكون لسه شغال/); assert.doesNotMatch(it.text, /وخلص/);
    assert.equal(findItem("events", { id: "cairo-woodshow-2026" }, d9).status, "انتهى");
    assert.match(search("events", "أخشاب", "", undefined, undefined, undefined, { nowMs: d2 }).text, /\(بدأ\)/);
  });
});

describe("U16 the members' own records, live from D1 (src/lookup-members.js)", () => {
  beforeEach(() => resetMembers());
  const T0 = Date.parse("2026-11-20T08:00:00Z"), at = ms => new Date(ms).toISOString();
  const env0 = () => ({ DB: new D1() });
  async function product(env, id, state, live, draft = live, ref = "406") {
    await env.DB.prepare("INSERT INTO cc_member_products (id, member_id, factory_ref, state, draft_json, live_json, submitted_at, created_at, updated_at) VALUES (?, 'm1', ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, ref, state, JSON.stringify(draft || {}), live ? JSON.stringify(live) : "", at(T0), at(T0), at(T0)).run();
  }
  async function company(env, id, kind, ref, fields, state = "approved", t = T0) {
    await env.DB.prepare("INSERT INTO cc_company_requests (id, member_id, kind, factory_ref, fields_json, state, reviewed_at, created_at, updated_at) VALUES (?, 'm2', ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, kind, ref, JSON.stringify(fields), state, at(t), at(t), at(t)).run();
  }
  const ROLLER = { name: "كسوة درافيل كاوتش للمطابع", category: "other", description: "تكسية درافيل الطباعة بالكاوتش والبولي يوريثان" };
  test("an approved product appears once the 10-minute memo expires — tagged «عضو على المنصة», with its maker", async () => {
    const env = env0();
    const m0 = await memberData(env, T0); // the first read: nothing yet
    await product(env, "p-a1b2c3d4", "approved", ROLLER);
    const m1 = await memberData(env, T0 + 5 * 60000); assert.equal(m1, m0, "within 10 minutes: the same memo, no read");
    assert.equal(search("products", "كسوة درافيل", "", 10, undefined, undefined, { members: m1 }).results.filter(x => x.member).length, 0);
    const m2 = await memberData(env, T0 + MEMBERS_TTL + 60000);
    assert.notEqual(m2, m0); assert.equal(m2.products.length, 1);
    const r = search("products", "كسوة درافيل", "", 10, undefined, undefined, { members: m2 });
    const x = r.results.find(y => y.member);
    assert.ok(x, JSON.stringify(r.results.slice(0, 3)));
    assert.deepEqual([x.product, x.maker, x.tag, x.match], ["كسوة درافيل كاوتش للمطابع", "من إنتاج شركة البروي وشركاه", MEMBER_TAG, "all"]);
    assert.equal(r.results[0], x, "a member's product leads its class");
    assert.match(r.text, /كسوة درافيل كاوتش للمطابع — من إنتاج شركة البروي وشركاه \(عضو على المنصة\)/);
  });
  test("pending, rejected, hidden and deleted products never appear; a draft never replaces the approved version", async () => {
    const env = env0();
    await product(env, "p-pend0001", "pending", null, { ...ROLLER, name: "منتج تحت المراجعة درافيل" });
    await product(env, "p-rej00001", "rejected", null, { ...ROLLER, name: "منتج مرفوض درافيل" });
    await product(env, "p-hid00001", "hidden", { ...ROLLER, name: "منتج مخفي درافيل" });
    await product(env, "p-del00001", "deleted", { ...ROLLER, name: "منتج ممسوح درافيل" });
    await product(env, "p-ok000001", "approved", { ...ROLLER, name: "درافيل معتمدة" }, { ...ROLLER, name: "درافيل مسودة لسه" });
    const m = await memberData(env, T0);
    assert.deepEqual(m.products.map(p => p.name), ["درافيل معتمدة"]);
    const r = search("products", "درافيل", "", 10, undefined, undefined, { members: m }), names = r.results.map(x => x.product || x.name);
    for (const n of ["منتج تحت المراجعة درافيل", "منتج مرفوض درافيل", "منتج مخفي درافيل", "منتج ممسوح درافيل", "درافيل مسودة لسه"]) assert.ok(!names.includes(n), n);
    assert.ok(names.includes("درافيل معتمدة"));
  });
  test("approved company requests: a new company is found (no id: it has no page yet); an edit replaces its listing's row; contacts are cut", async () => {
    const env = env0();
    await company(env, "cr-new0000001", "create", "c-atlal01", { name: "مصنع الأطلال للسلندرات", sector: "الصناعات البلاستيكية والمطاط", type: "مصنع", gov: "GIZ", location: "السادس من أكتوبر",
      description: "تصنيع وكسوة السلندرات والدرافيل بالكاوتش والبولي يوريثان، اتصل 01001234567 أو sales@atlal-example.com", products: ["درافيل", "سلندرات طباعة"] });
    await company(env, "cr-edit000001", "edit", "406", { description: "تعبئة وتوريد أسطوانات النيتروجين والأرجون للمصانع" });
    await company(env, "cr-pend000001", "create", "c-pend0001", { name: "شركة طلب معلق للدرافيل", sector: "الصناعات البلاستيكية والمطاط" }, "pending");
    await company(env, "cr-rej0000001", "create", "c-rej00001", { name: "شركة طلب مرفوض للدرافيل", sector: "الصناعات البلاستيكية والمطاط" }, "rejected");
    const m = await memberData(env, T0);
    assert.deepEqual(m.companies.map(c => c.ref).sort(), ["406", "c-atlal01"]);
    assert.doesNotMatch(JSON.stringify(m), /01001234567|@atlal-example/);
    const r = search("factories", "درافيل", "الجيزة", 10, undefined, undefined, { members: m }), at1 = r.results.find(x => x.name === "مصنع الأطلال للسلندرات");
    assert.ok(at1, r.results.map(x => x.name).join(" | "));
    assert.deepEqual([at1.member, at1.tag, at1.id, at1.location], [true, MEMBER_TAG, undefined, "السادس من أكتوبر، الجيزة"]);
    assert.ok(at1.open_url.endsWith("company.html#c-atlal01"));
    assert.ok(!r.results.some(x => /طلب معلق|طلب مرفوض/.test(x.name)));
    const ed = search("factories", "نيتروجين", "القليوبية", 10, undefined, undefined, { members: m }), b = ed.results.filter(x => x.name === "شركة البروي وشركاه");
    assert.equal(b.length, 1, "the edited listing shows once"); assert.equal(b[0].member, true); assert.equal(b[0].id, "406", "a listing that has a page keeps its id");
    const plain = search("factories", "نيتروجين", "القليوبية", 10);
    assert.ok(!plain.results.some(x => x.name === "شركة البروي وشركاه" && x.member), "without the memo: the bundled data only");
    /* the customers section counts a member's factory in his industry, tagged */
    const c = search("customers", "بلاستيك", "الجيزة", undefined, undefined, undefined, { members: m }), c0 = search("customers", "بلاستيك", "الجيزة");
    assert.equal(c.groups[0].factories, c0.groups[0].factories + 1);
  });
  test("a company created and then edited before the next deploy: the edit changes only its own fields, the name stays", async () => {
    const env = env0();
    await company(env, "cr-c00000001", "create", "c-twostep1", { name: "مصنع الخطوتين للكرتون", sector: "التعبئة والتغليف والورق", type: "مصنع", gov: "CAI", products: ["علب كرتون"] }, "approved", T0);
    await company(env, "cr-e00000001", "edit", "c-twostep1", { description: "علب كرتون مضلع مطبوعة للأغذية" }, "approved", T0 + 60000);
    const m = await memberData(env, T0 + 120000), c = m.companies.find(x => x.ref === "c-twostep1");
    assert.deepEqual([c.kind, c.name, c.gov, c.description], ["create", "مصنع الخطوتين للكرتون", "القاهرة", "علب كرتون مضلع مطبوعة للأغذية"]);
    assert.ok(search("factories", "كرتون مضلع", "القاهرة", 10, undefined, undefined, { members: m }).results.some(x => x.name === "مصنع الخطوتين للكرتون" && x.member));
  });
  test("review: only what was approved since the bundle was built (an older approval is in data.json already, as the team left it); the owner's «إيقاف كل التعديلات المنشورة» stops them too", async () => {
    const env = env0(), old = Date.parse("2026-10-01T09:00:00Z"), fresh = Date.now();
    await company(env, "cr-old0000001", "edit", "406", { description: "وصف قديم اتعدل بعدها من فريق المنصة نيتروجين" }, "approved", old);
    await company(env, "cr-new0000002", "create", "c-fresh001", { name: "مصنع جديد للدرافيل", sector: "الصناعات البلاستيكية والمطاط", type: "مصنع", gov: "GIZ", products: ["درافيل"] }, "approved", fresh);
    await env.DB.prepare("UPDATE cc_company_requests SET reviewed_at = ? WHERE id = 'cr-new0000002'").bind(new Date(fresh).toISOString()).run();
    const m = await memberData(env, fresh, DATA.v);
    assert.deepEqual(m.companies.map(c => c.ref), ["c-fresh001"], "the approval of 2026-10-01 is older than the bundle (" + DATA.v + ")");
    const r = await post({ section: "factories", query: "نيتروجين", governorate: "القليوبية" }, env);
    assert.ok(!r.results.some(x => x.member), "the bundled row of 406 answers: " + JSON.stringify(r.results.slice(0, 2)));
    resetMembers();
    await env.DB.prepare("INSERT INTO cc_settings (k, scope, v, updated_at) VALUES ('overlay.enabled', 'system', '0', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(new Date(fresh).toISOString()).run();
    const off = await memberData(env, fresh, DATA.v);
    assert.deepEqual([off.products.length, off.companies.length], [0, 0], "the owner switched the published edits off");
    resetMembers();
    await env.DB.prepare("UPDATE cc_settings SET v = '1' WHERE k = 'overlay.enabled'").run();
    assert.equal((await memberData(env, fresh, DATA.v)).companies.length, 1);
  });
  test("no tables, no DB, a failing read: no error — the bundled data answers (and the memo waits 10 minutes before reading again)", async () => {
    const env = env0(); env.DB.db.exec("DROP TABLE cc_member_products; DROP TABLE cc_company_requests;");
    const m = await memberData(env, T0); assert.deepEqual([m.products.length, m.companies.length], [0, 0]);
    const r = await post({ section: "factories", query: "بلاستيك" }, env); assert.ok(r.count > 0);
    assert.equal(await memberData({}, T0), null);
    resetMembers();
    let reads = 0; const bad = { DB: { prepare: () => { reads++; throw new Error("D1 down"); } } };
    const z = await memberData(bad, T0); assert.deepEqual([z.products.length, z.companies.length], [0, 0]);
    await memberData(bad, T0 + 60000); assert.equal(reads, 2, "one failed read (two statements), then the memo");
  });
});

describe("U12 platform_item for a company: its own words, the team's verified mark", () => {
  test("#406 says what it makes; a verified client says so; an imported listing does not; never a contact", () => {
    const b = findItem("factories", { id: "406" }, NOW);
    assert.match(b.text, /الغازات الطبية والصناعية/); assert.equal(b.verified, undefined); assert.doesNotMatch(b.text, /موثّقة من فريق المنصة/);
    const v = Object.entries(ITEMS.f).find(([, x]) => x[1]);
    const j = findItem("factories", { id: v[0] }, NOW); assert.equal(j.verified, true); assert.match(j.text, /المنشأة موثّقة من فريق المنصة/);
    for (let i = 0; i < DATA.f.length; i += 7) { const k = /#(.+)$/.exec(DATA.f[i][5])[1], r = findItem("factories", { id: k }, NOW); assert.doesNotMatch(r.text, AT, k); assert.doesNotMatch(r.text, LONG_DIGITS, k); }
  });
  test("a description that goes on after a full stop: only its first sentence is said, at most 140 characters", () => {
    let seen = 0;
    for (const [k, x] of Object.entries(ITEMS.f)) {
      if (!x[0] || !/^.{24,}?[.!؟?؛]\s+\S/u.test(x[0])) continue;
      const t = findItem("factories", { id: k }, NOW).text, m = /وحسب نبذته على المنصة: (.*?)[.…] التواصل/.exec(t);
      if (!m) continue;
      seen++; assert.ok(m[1].length <= 141, k + ": " + m[1]); assert.ok(!/[.!؟?؛]\s+\S/.test(m[1]), k + " says one sentence: " + m[1]);
      if (seen >= 20) break;
    }
    assert.ok(seen >= 5, String(seen));
    /* review: an abbreviation's dot or a dot inside brackets ends no sentence («ش. م. م.», «أ. ف.», «(كوب – طبق. إلخ)») */
    const about = k => { const t = findItem("factories", { id: k }, NOW).text, i = t.indexOf("وحسب نبذته على المنصة: "); return i < 0 ? "" : t.slice(i + 23, i + 23 + 150); };
    for (const [k, cut] of [["201", "والزيوت ش."], ["1209", "المعدنية – أ."], ["2607", "(كوب – طبق."]]) {
      const a = about(k); if (!a) continue; // the directory changed: nothing to check
      assert.ok(!a.includes(cut + " المنشأة") && !a.includes(cut + " التواصل"), k + " ends at an abbreviation: " + a);
    }
  });
});

describe("U1 corrections: an Arabic word is matched as a whole stored word (no 3-letter prefix hits)", () => {
  /* the stored forms of a result (data.json f[6]) as a space-padded string */
  const bag = x => { const f = rowOf(x); return f ? " " + words6(f).join(" ") + " " : ""; };
  const has = (b, w) => variants(norm(w)).some(v => b.includes(" " + v + " "));
  for (const [q, fake, real] of [["فرن", "فرنسا", ["فرن", "افران"]], ["غاز", "غازية", ["غاز", "غازات"]], ["ملح", "ملحقات", ["ملح", "املاح"]], ["سكر", "سكرين", ["سكر"]]]) {
    test(`«${q}» never hits «${fake}» alone`, () => {
      assert.notEqual(canon(norm(fake)), canon(norm(q)));
      assert.ok(!variants(norm(q)).includes(canon(norm(fake))), "no form of the query is the other word");
      /* the trap is real: companies that write «fake» and not «q» (2026-11-20: فرنسا 13, غازية 12, ملحقات 3, سكرين 5) — none of them is a full match */
      const trap = new Set(DATA.f.filter(f => { const b = " " + words6(f).join(" ") + " "; return has(b, fake) && !real.some(w => has(b, w)); }).map(f => f[0]));
      assert.ok(trap.size >= 1, "the data holds «" + fake + "»");
      const first = search("factories", q, "", 10, 1), results = [];
      for (let p = 1; p <= first.pages; p++) results.push(...search("factories", q, "", 10, p).results);
      assert.equal(results.length, first.count);
      for (const x of results) if (x.match === "all") assert.ok(!trap.has(x.name), x.name + " holds only «" + fake + "»");
      for (const x of results) { const b = bag(x); if (has(b, fake) && x.match === "all") assert.ok(real.some(w => has(b, w)), x.name + " holds only «" + fake + "»"); }
    });
  }
  test("the index stays small and the queries fast (gzip(data.json) ≤ 420 KB; a warm query of the new sections < 50 ms)", () => {
    assert.ok(gzipSync(JSON.stringify(DATA)).length <= 420 * 1024);
    search("customers", "ورق", "الجيزة"); search("events", "طاقة", ""); search("news", "حديد", ""); search("projects", "محطة", ""); search("awards", "محطة", "");
    let worst = 0;
    for (const [s, q, g] of [["customers", "ورق، كرتون، سكر، أسمنت، بلاستيك، تعبئة وتغليف", "الجيزة"], ["customers", "printing, packaging, food", ""], ["events", "معارض الغاز", ""], ["news", "حديد", ""],
      ["projects", "محطة كهرباء", ""], ["awards", "حسن علام", ""], ["tenders", "حديد", ""], ["tenders", "كاوتش", ""]]) { const t0 = performance.now(); search(s, q, g, 10, 1); worst = Math.max(worst, performance.now() - t0); }
    assert.ok(worst < 50, "slowest " + worst.toFixed(1) + " ms");
  });
});
