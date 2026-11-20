// node --test for barge-in in the live call (owner 2026-11-20: «لما بكلم جنة او باسم مش بيسكتوا بيفضلوا يتكلموا»). The noise guard of
// data/janna-live.js runs in a vm sandbox, sliced from the file itself (no DOM): which interruptions count as noise, the near-field step
// of noisy-room mode, and source checks that the page never keeps that mode for the tab and never closes the microphone unmeasured.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const LIVE = readFileSync(new URL("../../data/janna-live.js", import.meta.url), "utf8");
const cut = (a, b) => { const i = LIVE.indexOf(a), j = LIVE.indexOf(b, i + 1); assert.ok(i > 0 && j > i, a); return LIVE.slice(i, j); };
const sb = { window: {} };
vm.createContext(sb);
vm.runInContext("var NZ = { his: 0, hv: [] };\n" + cut("  var NZ_NEAR = ", "\n  var NZ_STOP") + "\n" + cut("  var NZ_STOP", "  function nzNum(") + cut("  function nzNorm(", "  function nzTyped(")
  + cut("  function nzRoomAdd(", "  /* nearEver:"), sb);

describe("noise guard: what counts as a noise interruption", () => {
  test("a short word, an answer, a question and every language are real barge-ins", () => {
    for (const w of ["بس", "بس بس", "معلش", "مش كده", "اسمع", "لأ", "استنى", "لحظة", "يا جنة", "يا", "wait", "stop", "dur", "arrête", "стоп", "等一下", "रुको", "잠깐만",
      "اه", "تمام", "ok", "كم سعر الباقة؟", "i want to subscribe to the premium plan", "عايز اشترك في الباقة"]) assert.equal(sb.nzJudge(w), "", w);
  });
  test("an empty turn, music signs, fillers and the recogniser's own noise phrases are noise", () => {
    for (const w of ["", "♪♪♪", "🎵", "..."]) assert.equal(sb.nzJudge(w), "empty", JSON.stringify(w));
    for (const w of ["امم", "uh", "mm hmm", "اشتركوا في القناة", "شكرا لكم", "Thanks for watching!", "subscribe to my channel", "[موسيقى]"]) assert.equal(sb.nzJudge(w), "noise", w);
    assert.equal(sb.nzJudge("شكرا لكم بس استنى"), "", "a stop word wins");
  });
});

describe("noisy-room mode: his own voice reopens the microphone", () => {
  const rep = (n, f) => Array.from({ length: n }, (_, i) => f(i));
  const run = (levels, his) => { sb.NZ.his = his || 0; const z = { rb: null, pq: null, nh: 0, nearT: 0, nearPk: 0, aT: 0, userOn: false }; let t = 0; const hits = [], out = [];
    levels.forEach((m, i) => { t += 80; const r = sb.nzNearStep(z, m, t); out.push(r); if (r === 1) hits.push(i); }); return { hits, out }; };
  test("no measure yet = -1 until 12 room levels are in (the microphone stays open meanwhile)", () => {
    const { out } = run(rep(30, () => 0.003));
    assert.equal(out[0], -1); assert.equal(out[15], -1); assert.equal(out[29], 0);
    assert.equal(sb.nzNearStep({ nh: 0 }, -1, 0), -1);
  });
  test("a TV and her own echo never open it", () => {
    assert.deepEqual(run(rep(200, i => 0.005 + ((i * 7919) % 25) / 1000)).hits, []);
    assert.deepEqual(run(rep(200, i => 0.004 + ((i * 7919) % 8) / 1000)).hits, []);
  });
  test("his voice opens it on its second loud tick", () => {
    assert.equal(run(rep(60, () => 0.003).concat(rep(10, () => 0.09))).hits[0], 61);
    assert.equal(run(rep(100, i => 0.005 + ((i * 7919) % 25) / 1000).concat(rep(10, () => 0.12))).hits[0], 101);
  });
  test("once his voice is known, a colleague who speaks up after a quiet spell does not open it; he still does", () => {
    const colleague = rep(60, () => 0.003).concat(rep(20, i => (i % 5 === 4 ? 0.006 : 0.03)));
    assert.equal(run(colleague).hits.length > 0, true, "without his level the room alone cannot tell");
    assert.deepEqual(run(colleague, 0.1).hits, []);
    assert.equal(run(rep(60, () => 0.003).concat(rep(10, () => 0.07)), 0.1).hits[0], 61);
  });
  test("his own first syllables never become room: the queue is dropped when Anam reports him", () => {
    const z = { rb: null, pq: null, nh: 0, nearT: 0, nearPk: 0, aT: 0, userOn: false }; let t = 0; sb.NZ.his = 0;
    for (let i = 0; i < 60; i++) sb.nzNearStep(z, 0.003, (t += 80));
    for (let i = 0; i < 5; i++) sb.nzNearStep(z, 0.12, (t += 80));
    z.pq.length = 0; z.userOn = true; /* nzUserOn */
    for (let i = 0; i < 20; i++) sb.nzNearStep(z, 0.12, (t += 80));
    z.userOn = false; for (let i = 0; i < 20; i++) sb.nzNearStep(z, 0.003, (t += 80));
    assert.ok(z.thr < 0.02, "the bar stayed at the room's: " + z.thr);
  });
});

describe("data/janna-live.js wiring (source checks)", () => {
  test("the mode is never read from or written to the tab's storage", () => {
    assert.ok(!/sessionStorage\.(getItem|setItem)\(\s*(NZ_KEY|"mig-jnl-noise)/.test(LIVE));
    assert.ok(/function nzDefault\(\) \{ NZ\.on = false;/.test(LIVE));
  });
  test("the microphone is closed only where his own voice is measured", () => {
    assert.ok(/if \(!NZ\.on \|\| near < 0 \|\| !z\.nearEver\) \{\s*if \(z\.gate\) nzGate\(me, false\);/.test(LIVE));
    assert.ok(/var m = !live \|\| !z\.nearEver \? ""/.test(LIVE), "no chip where it cannot keep voice barge-in");
  });
  test("no lasting penalty: an opening Anam did not confirm never raises the bar for the rest of the call", () => {
    assert.ok(!/z\.nk\s*=\s*Math\.min\(12/.test(LIVE));
    assert.ok(/nzUserOn[\s\S]{0,200}z\.pq\.length = 0/.test(LIVE));
  });
});
