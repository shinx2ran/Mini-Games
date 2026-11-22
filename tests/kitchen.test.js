/* Little Kitchen: two boards, one dish. The rules and the data hold; a round plays with real taps; following only
   the ghost hand cooks every recipe; mashing, rotating and damaged saves never break it; every size fits. */
'use strict';
const fs = require('fs');
const path = require('path');
const h = require('./harness');
const ID = 'kitchen';
const KEY = 'mg:game:kitchen:kitchen';

// Appendix A of the spec: every emoji the game may use (all Unicode 11 or older)
const ALLOWED = [...'🍳🍌🍛🍢🍲🥞🍧🎂🍰🥚🥒🍅🍚🍶🍯🥛🧀🍫🍓🥬🥕🍗🥜🍙🍋🥔🥦💧🧂🍉🥭🥥❄🍈🍊🌶🍘🚰🔪🥄🔥💦✨💨♨💕⭐✔👋🎁💡🏮🌷🏅😋🤤😍🥰🥶🐈🐔🐣📻🌿🌻🧺🍵🏺🎐🍍🐇💪'];

const api = (page, k) => page.evaluate((k) => MG.current.api[k], k);
/** Run fn(api, arg) in the page. */
const A = (page, fn, arg) => page.evaluate(([src, a]) => (0, eval)('(' + src + ')')(MG.current.api, a), [fn.toString(), arg]);
const boards = (page) => api(page, 'boards');
let pid = 900;
/** A real touch on the middle of an element (down and up, a new finger each time). */
async function tap(page, sel, wait = 30) {
  pid++;
  const ok = await page.evaluate(([sel, id]) => {
    const n = document.querySelector(sel);
    if (!n) return false;
    const r = n.getBoundingClientRect();
    const o = { bubbles: true, cancelable: true, pointerId: id, pointerType: 'touch', clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
    n.dispatchEvent(new PointerEvent('pointerdown', o));
    n.dispatchEvent(new PointerEvent('pointerup', o));
    return true;
  }, [sel, pid]);
  if (!ok) throw new Error('nothing to tap: ' + sel);
  if (wait) await page.waitForTimeout(wait);
}
const board = (s) => `.g-kitchen .kt-board[data-side="${s}"]`;
/** Tap board s's job: the right jar on a fetch board, the chosen (or given) bowl on a pick board, else its object. */
async function tapJob(page, s, bowl = 1, wait = 30) {
  const sel = await page.evaluate(([s, bowl]) => {
    const b = document.querySelector(`.g-kitchen .kt-board[data-side="${s}"]`);
    if (b.querySelector('.kt-jar')) return `.g-kitchen .kt-board[data-side="${s}"] .kt-jar[data-e="${b.querySelector('.kt-want').textContent}"]`;
    if (b.querySelector('.kt-bowl')) return b.querySelector('.kt-bowl.is-chosen') ? `.g-kitchen .kt-board[data-side="${s}"] .kt-bowl.is-chosen` : `.g-kitchen .kt-board[data-side="${s}"] .kt-bowl[data-i="${bowl}"]`;
    return b.querySelector('.kt-obj') ? `.g-kitchen .kt-board[data-side="${s}"] .kt-obj` : `.g-kitchen .kt-board[data-side="${s}"]`;
  }, [s, bowl]);
  await tap(page, sel, wait);
}

/** A page with the help setting chosen before the shell starts (player 1, on the left, is the little one). */
async function newPage(t, o = {}) {
  const p = await t.open(null, { page: 'tests/play.html?g=kitchen', viewport: o.viewport, dark: o.dark, reducedMotion: o.reducedMotion });
  await p.evaluate((help) => MG.store.set('help', help), o.help == null ? 0 : o.help);
  await p.reload();
  await p.waitForFunction(() => window.MG && document.querySelector('#mg-home'));
  return p;
}
const ready = (page) => page.waitForFunction(() => MG.current && MG.current.api && MG.current.api.state === 'menu', null, { timeout: 10000 });
const stateIs = (page, s, timeout = 15000) => page.waitForFunction((s) => MG.current && MG.current.api && MG.current.api.state === s, s, { timeout });
/** Open the kitchen with options set first, from a clean slate unless `keep` (or a given saved kitchen). */
async function openKitchen(page, o = {}) {
  await page.evaluate(([o, KEY]) => {
    MG.home();                                    // (leaving saves the kitchen: change it after)
    if (!o.keep) localStorage.removeItem(KEY);
    if (o.kitchen !== undefined) localStorage.setItem(KEY, typeof o.kitchen === 'string' ? o.kitchen : JSON.stringify(o.kitchen));
    MG.store.set('opt:kitchen:length', o.length || 'full');
    MG.store.set('opt:kitchen:taps', o.taps || 'normal');
    MG.timeScale = o.scale || 1;
    MG.open('kitchen');
  }, [o, KEY]);
  await ready(page);
}
/** Choose a dish (the same path as a card tap) and go to beat i; then wait out the boards' first moment
 *  (0.3 game seconds before a new job can be used, and the slide-in, which runs on the wall clock). */
async function startAt(page, id, beat = 0) {
  await A(page, (a, id) => a.start(id), id);
  await stateIs(page, 'beat');
  if (beat) await A(page, (a, i) => a.jump(i), beat);
  await page.waitForFunction(() => MG.current.api.boards.every((b) => b.do), null, { timeout: 5000 });
  const scale = await page.evaluate(() => MG.timeScale || 1);
  await Promise.all([gameWait(page, 0.35), page.waitForTimeout(400 / scale)]);
}
const saved = (page) => page.evaluate((KEY) => JSON.parse(localStorage.getItem(KEY)), KEY);
/** Wait until dt seconds of GAME time have passed (the core caps each frame at 50ms, so on slow frames the game
 *  clock falls behind the wall clock: never sleep a fixed real time against a game-time window). */
async function gameWait(page, dt) {
  const t0 = await page.evaluate(() => MG.current.ctx.time);
  await page.waitForFunction(([t0, dt]) => MG.current.ctx.time >= t0 + dt, [t0, dt], { timeout: 10000 });
}
const cssVar = (page, k) => page.evaluate((k) => getComputedStyle(document.querySelector('.g-kitchen')).getPropertyValue(k).trim(), k);
/** Wait until the new jobs have finished sliding in from the boards' outer edges. */
const settled = (page) => page.waitForFunction(() => ![...document.querySelectorAll('.g-kitchen .kt-board *')].some((n) => n.getAnimations().some((a) => /^kt-(in-l|in-r|pop-in)$/.test(a.animationName) && a.playState === 'running')), null, { timeout: 4000 });
/** Each fry, crack or skewer result that lands in the dish ('mid') after the last time the dish is cleared, per recipe. */
const keptOf = (page) => A(page, (a) => {
  const out = {};
  a.MENU.forEach((id) => {
    const R = a.RECIPES[id];
    let kind = R.vessel, keep = [];
    a.beatsFor(R, 'full').slice(0, -1).forEach((bt) => {
      if (bt.serve) { kind = bt.serve; keep = []; }                       // served onto a new plate
      [bt.a, bt.b].forEach((j) => { if (j.to === 'mid' && ['fry', 'crack', 'skewer'].includes(j.do) && kind !== 'cake') keep.push(j.do === 'crack' ? 'yolk' : a.resultOf(j)); });
      if ((bt.a.do === 'stir' || bt.b.do === 'stir') && R.mix && kind !== 'pot') keep = [];   // stirred smooth on purpose
    });
    out[id] = keep;
  });
  return out;
});
/** Is every item of `want` in `have` (as many times)? */
const within = (want, have) => { const h = (have || []).slice(); return want.every((e) => { const i = h.indexOf(e); if (i < 0) return false; h.splice(i, 1); return true; }); };
// MG_KT_ONLY=2,9 runs only those numbered parts of this file (a debugging aid; unset, everything runs)
const ONLY = process.env.MG_KT_ONLY ? process.env.MG_KT_ONLY.split(',') : null;
const part = (n) => !ONLY || ONLY.includes(String(n));

/** Follow only the ghost hand until the round is won. Watches where the hand points on the way. */
function followHand(page, max = 400, pauseFor = []) {
  return page.evaluate(async ([max, pauseFor]) => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    let id = 40000 + Math.floor(Math.random() * 1000) * 100, steps = 0, herOk = true, picked = null, last = null;
    const bad = [];
    const objNow = () => getComputedStyle(document.querySelector('.g-kitchen')).getPropertyValue('--obj').trim();
    for (; steps < max && MG.current && !MG.current.ctx.over; steps++) {
      const a = MG.current.api;
      // the start of the last beat: what is in the dish, and the size of the job objects
      if (!last && a.state === 'beat' && a.beat === a.beats.length - 1) {
        const v = a.vessel;
        last = { contents: v.contents, obj: objNow() };
        if (pauseFor.includes(a.recipe)) return { paused: true, steps, bad, herOk, picked, last, recipe: a.recipe };   // (the caller looks, then calls again)
      }
      a.hintNext();
      const n = a.hinted;
      if (!n) { await sleep(50); continue; }
      if (a.state === 'menu') picked = n.dataset.id;
      if (n.closest('.kt-board.is-done')) bad.push('a done board');
      if (n.closest('.kt-vessel, .kt-strip, .kt-shelf, .kt-next')) bad.push(n.className);
      if (n.classList.contains('kt-jar') && n.dataset.e !== n.closest('.kt-board').querySelector('.kt-want').textContent) bad.push('a wrong jar');
      if (n.classList.contains('kt-bowl') && (n.classList.contains('is-gone') || n.getAttribute('aria-disabled') === 'true')) bad.push('a hidden bowl');
      if (a.state === 'beat' && !a.boards[a.aSide].done && !n.closest(`.kt-board[data-side="${a.aSide}"]`)) herOk = false;
      const r = n.getBoundingClientRect();
      const o = { bubbles: true, cancelable: true, pointerId: ++id, pointerType: 'touch', clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
      n.dispatchEvent(new PointerEvent('pointerdown', o));
      n.dispatchEvent(new PointerEvent('pointerup', o));
      await sleep(35);
    }
    return { steps, bad, herOk, picked, last, objEnd: objNow(), over: !!(MG.current && MG.current.ctx.over), recipe: MG.current && MG.current.api.recipe };
  }, [max, pauseFor]);
}

/** Every layout rule for what is on screen now. */
async function layoutChecks(t, p, label, o = {}) {
  const { assert } = t;
  const targets = '.g-kitchen .kt-board, .g-kitchen .kt-jar, .g-kitchen .kt-bowl:not(.is-gone), .g-kitchen .kt-card, .g-kitchen .kt-next';
  const visible = (sel) => p.evaluate((sel) => [...document.querySelectorAll(sel)].filter((n) => n.offsetParent && getComputedStyle(n).visibility !== 'hidden').length, sel);
  if (await visible(targets)) {
    const min = (await t.minTargetSize(p, targets)).min;
    assert.ok(min >= 64, `targets at least 64px ${label}: ${min}`);
  }
  if (await visible('.g-kitchen .kt-card')) assert.ok((await t.minTargetSize(p, '.g-kitchen .kt-card')).min >= 80, `menu cards at least 80px ${label}`);
  const inset = await p.evaluate((sel) => {
    const g = document.querySelector('#mg-game').getBoundingClientRect();
    return [...document.querySelectorAll(sel)].filter((n) => n.offsetParent).map((n) => { const r = n.getBoundingClientRect(); return Math.min(r.left - g.left, r.top - g.top, g.right - r.right, g.bottom - r.bottom); });
  }, targets);
  assert.ok(Math.min(...inset) >= 11.5, `every target 12px inside the play area ${label}: ${Math.min(...inset).toFixed(1)}`);
  assert.deepStrictEqual(await t.outsidePlayArea(p, targets + ', .g-kitchen .kt-pip, .g-kitchen .kt-item, .g-kitchen .kt-vessel, .g-kitchen .kt-gift:not([hidden])'), [], `in view ${label}`);
  const clash = await p.evaluate(() => {
    const rects = (sel) => [...document.querySelectorAll(sel)].filter((n) => n.offsetParent && getComputedStyle(n).visibility !== 'hidden').map((n) => [n.className, n.getBoundingClientRect()]);
    const hit = (r, s) => r.left < s.right - 1 && s.left < r.right - 1 && r.top < s.bottom - 1 && s.top < r.bottom - 1;
    const out = [];
    const pairs = (list) => list.forEach(([a, r], i) => list.slice(i + 1).forEach(([b, s]) => { if (hit(r, s)) out.push(a + ' x ' + b); }));
    pairs(rects('.g-kitchen .kt-board'));
    pairs(rects('.g-kitchen .kt-jar'));
    pairs(rects('.g-kitchen .kt-bowl'));
    pairs(rects('.g-kitchen .kt-card, .g-kitchen .kt-next'));
    const items = rects('.g-kitchen .kt-item');
    pairs(items);
    const v = rects('.g-kitchen .kt-vessel');
    if (v.length) items.forEach(([a, r]) => { if (hit(r, v[0][1])) out.push(a + ' x vessel'); });
    rects('.g-kitchen .kt-board').forEach(([a, r]) => { if (v.length && hit(r, v[0][1])) out.push(a + ' x vessel'); });
    return out;
  });
  assert.deepStrictEqual(clash, [], `nothing overlaps ${label}`);
  if (await visible('.g-kitchen .kt-pip')) assert.ok((await t.minTargetSize(p, '.g-kitchen .kt-pip')).min >= 20, `step stickers at least 20px ${label}`);
  if (await visible('.g-kitchen .kt-item')) assert.ok((await t.minTargetSize(p, '.g-kitchen .kt-item')).min >= 14, `shelf items at least 14px ${label}`);
  const escapes = await p.evaluate(() => [...document.querySelectorAll('.g-kitchen .kt-want:not([hidden]), .g-kitchen .kt-check, .g-kitchen .kt-chef')].filter((n) => {
    const b = n.closest('.kt-board').getBoundingClientRect(), r = n.getBoundingClientRect();
    return r.left < b.left || r.right > b.right || r.top < b.top || r.bottom > b.bottom;
  }).map((n) => n.className));
  assert.deepStrictEqual(escapes, [], `the chef, want bubble and tick sit inside their board ${label}`);
  assert.ok(await t.noPageScroll(p), `no page scroll ${label}`);
  // (only pictographs, skin tones, the variation selector, the joiner and the keycap go: \p{Emoji_Component} would also take 0-9, # and *)
  const text = await p.evaluate(() => document.querySelector('.g-kitchen').innerText.replace(/\p{Extended_Pictographic}|\p{Emoji_Modifier}|[\u{FE0F}\u{200D}\u{20E3}]|\s/gu, ''));
  assert.ok(!/[\p{L}\p{N}]/u.test(text), `no letters or digits on screen ${label}: ${JSON.stringify(text)}`);
  // the vegetable being washed or peeled: its box is the sticker's own, so the mud sits on it (not the shelf's sizing)
  const jit = await p.evaluate(() => [...new Set([...document.querySelectorAll('.g-kitchen .kt-main .kt-mud, .g-kitchen .kt-main .kt-petal')].map((m) => m.parentElement))].map((it) => {
    const st = it.querySelector(':scope > .mg-sticker'), r = it.getBoundingClientRect(), s = st.getBoundingClientRect();
    const off = Math.max(Math.abs(r.left - s.left), Math.abs(r.top - s.top), Math.abs(r.right - s.right), Math.abs(r.bottom - s.bottom));
    const offMud = [...it.querySelectorAll('.kt-mud')].filter((m) => { const q = m.getBoundingClientRect(), x = q.left + q.width / 2, y = q.top + q.height / 2; return q.width > 0 && getComputedStyle(m).display !== 'none' && (x < s.left || x > s.right || y < s.top || y > s.bottom); }).length;
    return { off: Math.round(off), offMud };
  }));
  assert.ok(jit.every((j) => j.off <= 2 && j.offMud === 0), `the washed or peeled vegetable's box wraps its sticker and every mud spot is on it ${label}: ${JSON.stringify(jit)}`);
  if (o.shelf) {
    const n = await p.evaluate(() => [...document.querySelectorAll('.g-kitchen .kt-item')].filter((n) => { const r = n.getBoundingClientRect(); return r.width >= 14; }).length);
    assert.strictEqual(n, o.shelf, `all ${o.shelf} shelf items show ${label}`);
  }
}

/** Every part of each job (the object and its knife, spoon, faucet...) stays inside its board, give or take 4px. */
async function jobsInside(t, p, label) {
  const bad = await p.evaluate(() => {
    const out = [];
    document.querySelectorAll('.g-kitchen .kt-board').forEach((bd) => {
      const B = bd.getBoundingClientRect();
      bd.querySelectorAll('.kt-main .kt-obj, .kt-main .kt-obj *').forEach((n) => {
        const r = n.getBoundingClientRect();
        if (!r.width && !r.height) return;
        const o = Math.max(B.left - r.left, r.right - B.right, B.top - r.top, r.bottom - B.bottom);
        if (o > 4) out.push(`${bd.dataset.verb}: ${n.getAttribute('class') || n.tagName} ${o.toFixed(1)}px out`);
      });
    });
    return out;
  });
  t.assert.deepStrictEqual(bad, [], `every job stays inside its board ${label}`);
}

/** The top kitchen's sign: both chefs show (nothing covers them) and are at least 14px. */
async function signShows(t, p, label, minSeen = 0) {
  const pets = await p.evaluate(() => [...document.querySelectorAll('.g-kitchen .kt-sign .mg-sticker')].filter((n) => n.textContent !== '🏮').map((n) => {
    const r = n.getBoundingClientRect(), on = (x, y) => { const e = document.elementFromPoint(x, y); return !!(e && e.closest('.kt-sign')); };
    let seen = 0;   // the share of a 7x7 grid over the sticker that is the sign (not the food in front of it)
    for (let i = 1; i <= 7; i++) for (let j = 1; j <= 7; j++) seen += on(r.left + r.width * i / 8, r.top + r.height * j / 8);
    return { size: +Math.min(r.width, r.height).toFixed(1), hit: on(r.left + r.width / 2, r.top + r.height / 2), seen: Math.round(seen / 49 * 100) / 100 };
  }));
  t.assert.ok(pets.length === 2 && pets.every((x) => x.hit && x.size >= 14 && x.seen >= minSeen), `the sign shows both chefs, uncovered and at least 14px ${label}: ${JSON.stringify(pets)}`);
}

h.run(ID, async (t) => {
  const { assert } = t;
  let page = await newPage(t);
  await openKitchen(page);

  // --- 1. the rules and the data
  if (part(1)) {
    const r = await page.evaluate(() => {
      const a = MG.current.api;
      const fresh = { v: 1, done: 0, cooked: {}, chicks: 0, seen: [] };
      const rules = [];
      a.MENU.forEach((id) => {
        const R = a.RECIPES[id], beats = R.beats, last = beats[beats.length - 1];
        beats.forEach((bt, i) => {
          if (!bt.a || !bt.b || !a.VERBS[bt.a.do] || !a.VERBS[bt.b.do]) rules.push(`${id}:${i} has both jobs, known verbs`);
          if (bt.a.do === 'fetch') rules.push(`${id}:${i} a never fetches`);
          if (bt.b.do === 'pick') rules.push(`${id}:${i} b never picks`);
          if (bt.extra && [bt.a, bt.b].some((j) => j.to === 'stay' || j.to === 'across')) rules.push(`${id}:${i} an extra beat hands nothing on`);
        });
        const end = id === 'cake' ? 'blow' : 'taste';
        if (last.a.do !== end || last.b.do !== end) rules.push(`${id} ends with ${end}`);
        const extras = beats.map((b, i) => (b.extra ? i : -1)).filter((i) => i >= 0);
        const nx = ['ceplok', 'pisang'].includes(id) ? 2 : 1;   // the two starter dishes have one more real step
        if (extras.length !== nx || extras[0] === 0 || extras[extras.length - 1] === beats.length - 1) rules.push(`${id} has ${nx} extra beat(s) in the middle`);
        if (beats.length > 6) rules.push(`${id} has at most six steps`);
        if (beats.filter((b) => b.serve).length > 1) rules.push(`${id} serves once at most`);
        ['short', 'full'].forEach((len) => {
          const bs = a.beatsFor(R, len);
          bs.forEach((bt, i) => ['a', 'b'].forEach((s) => {
            const j = bt[s], o = s === 'a' ? 'b' : 'a';
            if (j.to === 'stay' && (!bs[i + 1] || bs[i + 1][s].e !== a.resultOf(j))) rules.push(`${id}/${len}:${i}${s} stays into the same job`);
            if (j.to === 'across' && (!bs[i + 1] || bs[i + 1][o].e !== a.resultOf(j))) rules.push(`${id}/${len}:${i}${s} hands across to the right job`);
          }));
        });
        if (id !== 'cake' && !beats.some((b) => b.a.do === 'chop' || b.a.do === 'pound')) rules.push(`${id}: she gets the knife or the pestle`);
      });
      const ns = [], fixed = [];
      a.MENU.forEach((id) => a.RECIPES[id].beats.forEach((bt) => ['a', 'b'].forEach((s) => ['few', 'normal', 'lots'].forEach((tp) => [0, 1, 2].forEach((hp) => {
        const j = bt[s], n = a.nFor(j, hp, tp);
        ns.push(n);
        if (a.VERBS[j.do].fixed != null && n !== a.VERBS[j.do].fixed) fixed.push(j.do);
      })))));
      return {
        rules, ns: [Math.min(...ns), Math.max(...ns)], fixed,
        fixedN: { fetch: a.nFor({ do: 'fetch' }, 2, 'lots'), fry: a.nFor({ do: 'fry' }, 0, 'few'), taste: a.nFor({ do: 'taste' }, 0, 'lots'), scoop: a.nFor({ do: 'scoop' }, 2, 'lots'), skewer: a.nFor({ do: 'skewer' }, 0, 'few'), garnish: a.nFor({ do: 'garnish' }, 0, 'lots'), pick: a.nFor({ do: 'pick' }, 1, 'few'), blow: a.nFor({ do: 'blow' }, 2, 'lots') },
        bad: [null, 'x', [1, 2, 3], { done: 'abc' }, { done: true }, { done: '' }, { done: NaN }].map((v) => JSON.stringify(a.cleanKitchen(v)) === JSON.stringify(fresh)),
        junk: a.cleanKitchen({ done: 5, cooked: { rock: 3, sate: 'x', ceplok: 99999 }, chicks: 99, seen: ['fly', 7, 'crack', 'crack'] }),
        early: a.cleanKitchen({ done: 0, cooked: { sate: 2 } }),
        big: a.cleanKitchen({ done: 1e9, chicks: -4 }),
        u0: a.unlocks(0), u1: a.unlocks(1), u13: a.unlocks(13), u19: a.unlocks(19).decor.length, u35: a.unlocks(35).medals,
        gifts: [...Array(13).keys()].map((i) => a.giftFor(i).kind + ':' + (a.giftFor(i).id || a.giftFor(i).n)),
        later: [a.giftFor(13).kind, a.giftFor(18).kind, a.giftFor(19).kind, a.giftFor(19).id, a.giftFor(34).id, a.giftFor(35).kind, a.giftFor(500).kind],
        GIFTS: a.GIFTS, tuning: a.tuning,
        full: a.MENU.map((id) => a.beatsFor(a.RECIPES[id], 'full').length),
        cut: a.MENU.map((id) => a.beatsFor(a.RECIPES[id], 'full').length - a.beatsFor(a.RECIPES[id], 'short').length),
      };
    });
    // the two starter dishes have one more real step (salt and sambal; meses and condensed milk), which Short leaves out
    assert.deepStrictEqual(r.full, [6, 6, 6, 6, 6, 6, 6, 6], 'every dish has six steps (Full)');
    assert.deepStrictEqual(r.cut, [2, 2, 1, 1, 1, 1, 1, 1], 'Short leaves out two steps of ceplok and pisang, one of every other dish');
    assert.deepStrictEqual(r.rules, [], 'every recipe keeps the data rules');
    assert.ok(r.ns[0] >= 1 && r.ns[1] <= 8, `taps per job stay between 1 and 8 (${r.ns})`);
    assert.deepStrictEqual(r.fixed, [], 'fixed jobs never change');
    assert.deepStrictEqual(r.fixedN, { fetch: 1, fry: 1, taste: 1, scoop: 2, skewer: 3, garnish: 3, pick: 3, blow: 3 });
    assert.ok(r.bad.every(Boolean), 'nonsense becomes a fresh kitchen: ' + r.bad);
    assert.deepStrictEqual([r.junk.done, r.junk.cooked, r.junk.chicks, r.junk.seen], [5, { ceplok: 999 }, 3, ['crack']], 'a junk save is repaired');
    assert.deepStrictEqual(r.early.cooked, {}, 'a dish not yet earned is dropped');
    assert.deepStrictEqual([r.big.done, r.big.chicks], [9999, 0]);
    assert.deepStrictEqual([r.u0.recipes, r.u0.next], [['ceplok', 'pisang'], 'goreng'], 'a new kitchen: two dishes, nasi goreng next');
    assert.deepStrictEqual(r.u1.recipes, ['ceplok', 'pisang', 'goreng']);
    assert.strictEqual(r.u13.recipes.length, 8);
    assert.deepStrictEqual([r.u13.helpers, r.u13.tier, r.u13.next], [{ cat: true, hen: true, radio: true, herbs: true }, 3, null], 'thirteen dishes: everything open');
    assert.strictEqual(r.u19, 6, 'then six shelf decorations');
    assert.ok(Object.keys(r.u35).length === 8 && Object.values(r.u35).every((n) => n === 2), 'then two gold medals for every dish');
    assert.deepStrictEqual(r.gifts, ['recipe:goreng', 'helper:cat', 'recipe:sate', 'tier:1', 'recipe:sop', 'helper:hen', 'recipe:martabak', 'tier:2', 'recipe:campur', 'helper:radio', 'recipe:cake', 'tier:3', 'helper:herbs']);
    assert.deepStrictEqual(r.later, ['decor', 'decor', 'medal', 'ceplok', 'cake', 'thanks', 'thanks']);
    assert.strictEqual(r.GIFTS, 13);
    assert.deepStrictEqual([r.tuning.GAP, r.tuning.LATCH, r.tuning.COOK_S], [0.16, 0.45, [3, 2.2, 1.6]]);
    // the emoji audit: everything in the game's file is on the list (Unicode 11 or older)
    const src = fs.readFileSync(path.join(h.ROOT, 'js', 'games', 'kitchen.js'), 'utf8').replace(/️/g, '');
    const found = [...new Set(src.match(/\p{Extended_Pictographic}/gu))];
    assert.deepStrictEqual(found.filter((e) => !ALLOWED.includes(e)), [], 'only emoji from the allowed list');
  }

  // --- 2. a whole round with real taps: fresh kitchen, she is on the left, help off, Full, Normal
  if (part(2)) {
    await openKitchen(page);
    assert.strictEqual(await page.locator('.g-kitchen .kt-card').count(), 2, 'two dishes to start');
    assert.strictEqual(await page.locator('.g-kitchen .kt-next').count(), 1, 'and the next one as a silhouette with a present');
    // (game seconds: the game clock can fall behind the wall clock)
    const hintAt = await (await page.waitForFunction(() => document.querySelector('.mg-hint') && MG.current.ctx.time, null, { timeout: 5000 })).jsonValue();
    assert.ok(hintAt <= 1.0, `the hand shows the first dish within a second (${hintAt.toFixed(2)}s)`);
    assert.strictEqual(await A(page, (a) => a.hinted && a.hinted.dataset.id), 'ceplok', 'the hand shows the first dish');
    assert.strictEqual(await api(page, 'locked'), false, 'the menu is never locked');
    await tap(page, '.g-kitchen .kt-next');
    assert.strictEqual(await api(page, 'state'), 'menu', 'the next dish is not a button');
    await tap(page, '.g-kitchen .kt-card[data-id="ceplok"]');
    assert.strictEqual(await api(page, 'state'), 'deal', 'one tap picks the dish');
    await stateIs(page, 'beat');
    assert.strictEqual(await api(page, 'aSide'), 0, 'the little player (left) has the short showy jobs');
    const nBeats = (await api(page, 'beats')).length;
    assert.strictEqual(nBeats, 6);
    // what each beat sends into the dish at its merge: [verb, what lands]
    const mids = await A(page, (a) => a.beatsFor(a.RECIPES.ceplok, 'full').map((bt) => [bt.a, bt.b].filter((j) => j.to === 'mid').map((j) => [j.do, j.do === 'crack' ? 'yolk' : a.resultOf(j)])));
    const animating = () => page.evaluate(() => [...document.querySelectorAll('.g-kitchen .kt-contents .kt-piece')].filter((n) => n.getAnimations().length).length);
    let pieces = 0;
    for (let i = 0; i < nBeats; i++) {
      await page.waitForFunction((i) => MG.current.api.state === 'beat' && MG.current.api.beat === i, i, { timeout: 8000 });
      await gameWait(page, 0.35);                  // (a new job can be used once it has been seen for 0.3 game seconds)
      if (i === nBeats - 1) {
        // tasting: the fried egg she made is still in the dish, on top, not covered by the slices
        const v = await api(page, 'vessel');
        assert.ok(v.contents.includes('🍳') && v.kept.includes('🍳'), 'the fried egg is still in the dish when it is tasted: ' + v.contents.join(''));
        const egg = await page.evaluate(() => {
          const n = [...document.querySelectorAll('.g-kitchen .kt-contents .kt-piece')].find((p) => p.textContent === '🍳');
          if (!n) return 'no egg';
          const r = n.getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return hit && hit.closest('.kt-piece') === n ? 'on top' : 'covered by ' + (hit && (hit.closest('.kt-piece') || hit).textContent);
        });
        assert.strictEqual(egg, 'on top', 'nothing covers the egg');
      }
      const bs = await boards(page);
      for (const s of [0, 1]) {
        const b = bs[s];
        if (b.do === 'fry') {
          await page.waitForFunction((s) => MG.current.api.boards[s].phase === 'gold', s, { timeout: 6000 });
          await tapJob(page, s, 1, 0);
          let now = (await boards(page))[s];
          assert.deepStrictEqual([now.phase, now.k], ['gold', 0], 'golden: a tap inside the moment it turns golden does nothing');
          await gameWait(page, 0.52);              // (the golden latch is 0.45 game seconds)
          await tapJob(page, s, 1, 0);
          now = (await boards(page))[s];
          assert.ok(['flying', 'heat2'].includes(now.phase) && now.k === 1, 'then the flip: ' + now.phase);
          await page.waitForFunction((s) => MG.current.api.boards[s].done, s, { timeout: 6000 });
          continue;
        }
        for (let k = 0; k < b.n; k++) {
          const add = b.do === 'scoop' && k === 0;
          if (add) await page.waitForFunction(() => ![...document.querySelectorAll('.g-kitchen .kt-contents .kt-piece')].some((n) => n.getAnimations().length), null, { timeout: 3000 });
          await tapJob(page, s, 1, 0);
          const now = (await boards(page))[s];
          assert.strictEqual(now.k, k + 1, `${b.do}: one tap, one step (${k + 1}/${b.n})`);
          if (add) {
            // a spoonful of rice drops in: only it plays the drop-in, nothing already in the dish jumps again
            await page.waitForFunction(() => [...document.querySelectorAll('.g-kitchen .kt-contents .kt-piece')].some((n) => n.textContent === '🍚'), null, { timeout: 3000 });
            const moving = await animating();
            assert.ok(moving <= 1, `after an add tap only the new piece drops in (${moving} pieces moving)`);
          }
          if (k + 1 < b.n) await gameWait(page, 0.3);   // (more than the gap between counted taps)
        }
        assert.ok((await boards(page))[s].done, `${b.do} is done after ${b.n} taps`);
        const after = (await boards(page))[s];
        assert.ok(after.k <= after.n);
      }
      if (i === nBeats - 1) break;
      const vb = await api(page, 'vessel');           // (both boards are done: the merge has not delivered yet)
      await page.waitForFunction((i) => MG.current.api.beat === i + 1, i, { timeout: 8000 });
      const v = await api(page, 'vessel');
      assert.ok(v.pieces >= pieces, 'the dish only ever fills up');
      if (i >= 1) assert.ok(v.pieces > pieces, `beat ${i}: what they made landed in the dish (${pieces} -> ${v.pieces})`);
      pieces = v.pieces;
      // and it is really in the dish now
      for (const [verb, e] of mids[i]) {
        if (['chop', 'fry', 'crack', 'skewer'].includes(verb)) assert.ok(v.contents.includes(e), `beat ${i}: the ${verb} result ${e} is in the dish: ${v.contents.join('')}`);
        else assert.ok(JSON.stringify(v.blobs) !== JSON.stringify(vb.blobs) || v.level > vb.level, `beat ${i}: the ${verb} result ${e} is in the dish (a sauce or a liquid)`);
      }
      assert.ok(Math.abs(v.fill - (i + 1) / nBeats) < 1e-9, 'the picture of the dish fills up one step at a time');
      assert.strictEqual(await page.locator('.g-kitchen .kt-pip.is-done').count(), i + 1, 'the steps get their ticks one by one');
    }
    await stateIs(page, 'finale', 3000);
    let sv = await saved(page);
    assert.deepStrictEqual([sv.done, sv.cooked.ceplok], [1, 1], 'saved the moment the dish is finished');
    assert.ok(sv.seen.includes('crack') && sv.seen.includes('fry') && sv.seen.includes('taste'), 'her new jobs are remembered');
    assert.strictEqual(await api(page, 'locked'), false, 'never locked');
    await page.waitForSelector('.g-kitchen .kt-gift.is-open', { timeout: 4000 });
    assert.ok(await page.locator('.g-kitchen .kt-gift .kt-minicard').count(), 'the present is a new recipe card');
    await t.waitForWin(page, 8000);
    await openKitchen(page, { keep: true });
    const cards = await page.evaluate(() => [...document.querySelectorAll('.g-kitchen .kt-card')].map((c) => c.dataset.id + ':' + c.dataset.stars + (c.classList.contains('is-new') ? '+new' : '')));
    assert.deepStrictEqual(cards, ['ceplok:1', 'pisang:0+new', 'goreng:0+new'], 'the menu: a star for the fried egg, new nasi goreng');
    assert.strictEqual(await page.evaluate(() => document.querySelector('.g-kitchen .kt-next .kt-next__dish').textContent), '🍢', 'sate is the next present');
  }

  // --- 2b. the ghost hand comes back by itself: nothing here calls hintNext(), only the game's own quiet-time clock
  //     runs it. Fresh kitchen, help Off, double speed; every time is in game seconds.
  if (part('2b')) {
    await openKitchen(page, { scale: 2 });
    await A(page, (a) => a.start('ceplok'));
    const r = await page.evaluate(async () => {
      const C = MG.current.ctx, a = MG.current.api, out = {};
      const frame = () => new Promise((res) => requestAnimationFrame(res));
      const waitFor = async (f, max) => { const t0 = C.time; while (C.time - t0 < max && !f()) await frame(); return f(); };
      /** Is the visible hand (.mg-hint, a 0x0 box at the finger's point) over this element? */
      const over = (n) => { const h = document.querySelector('.mg-hint'); if (!h || !n) return false; const p = h.getBoundingClientRect(), q = n.getBoundingClientRect(); return p.left >= q.left && p.left <= q.right && p.top >= q.top && p.top <= q.bottom; };
      let id = 30000;
      const tapEl = (n) => { const q = n.getBoundingClientRect(); const o = { bubbles: true, cancelable: true, pointerId: ++id, pointerType: 'touch', clientX: q.left + q.width / 2, clientY: q.top + q.height / 2 }; n.dispatchEvent(new PointerEvent('pointerdown', o)); n.dispatchEvent(new PointerEvent('pointerup', o)); };
      await waitFor(() => a.state === 'beat', 5);
      const t0 = C.time, her = document.querySelector(`.kt-board[data-side="${a.aSide}"]`), his = document.querySelector(`.kt-board[data-side="${1 - a.aSide}"]`);
      // a job she has never done: the hand shows it soon after the beat starts
      out.first = (await waitFor(() => over(her), 4)) ? +(C.time - t0).toFixed(2) : null;
      // she taps where it shows: it goes, and comes back by itself
      tapEl(her.querySelector('.kt-obj'));
      out.goneAfterTap = !document.querySelector('.mg-hint');
      const t1 = C.time;
      out.back = (await waitFor(() => over(her), 4)) ? +(C.time - t1).toFixed(2) : null;
      // her board is done: the hand waits for the grown-up (10 quiet seconds from the beat start)
      tapEl(her.querySelector('.kt-obj'));
      await waitFor(() => a.boards[a.aSide].done, 3);
      out.herDone = a.boards[a.aSide].done;
      out.grownUp = (await waitFor(() => over(his), 13)) ? +(C.time - t0).toFixed(2) : null;
      // two wrong jars: the hand shows the right one
      a.jump(3);
      await waitFor(() => false, 0.45);
      const right = his.querySelector('.kt-jar[data-e="🍶"]');
      tapEl(his.querySelector('.kt-jar:not([data-e="🍶"])'));
      await waitFor(() => false, 0.5);
      tapEl(his.querySelector('.kt-jar:not([data-e="🍶"])'));
      const t2 = C.time;
      out.wrong = a.boards[1 - a.aSide].done ? 'done' : 'not done';
      out.jar = (await waitFor(() => over(right), 3)) ? +(C.time - t2).toFixed(2) : null;
      return out;
    });
    assert.ok(r.first !== null && r.first <= 1.0, `a new job: the hand is on her board within a second of the beat starting (${r.first}s)`);
    assert.ok(r.goneAfterTap && r.back !== null && r.back <= 2.0, `she taps it: it goes, and is back within 2s (${r.goneAfterTap}, ${r.back}s)`);
    assert.ok(r.herDone && r.grownUp !== null && r.grownUp >= 9.5 && r.grownUp <= 11, `her board done: the hand moves to the grown-up's board after about 10 quiet seconds (${r.grownUp}s)`);
    assert.ok(r.wrong === 'not done' && r.jar !== null && r.jar <= 1.5, `two wrong jars: the hand is on the right jar within 1.5s (${r.jar}s)`);
  }

  // --- 3. following only the ghost hand finishes a round of every recipe (Full, fast clock)
  if (part(3)) {
    await openKitchen(page, { scale: 8 });
    const keep = await keptOf(page);
    assert.deepStrictEqual([keep.ceplok, keep.pisang, keep.sate, keep.martabak], [['🍳'], ['🍌', '🍌'], ['🍢', '🍢'], ['🥞', '🥞']], 'what is fried, cracked or skewered (and stays)');
    const done = [];
    for (let round = 0; round < 8; round++) {
      if (round) await openKitchen(page, { keep: true, scale: 8 });
      if (round === 1) assert.ok(await A(page, (a) => a.setKitchen({ done: 13, cooked: { ceplok: 1 } })), 'every dish open');
      let r = await followHand(page, 400, ['sop', 'campur', 'ceplok']);
      if (r.paused && r.recipe === 'ceplok') {
        // the kecap and the sambal both show on the full plate (in front, beside the egg; not under the slices)
        await page.waitForTimeout(400);
        const sauces = await page.evaluate(() => [...document.querySelectorAll('.g-kitchen .kt-contents .kt-blob')].map((b) => {
          const r = b.getBoundingClientRect(), keep = b.style.pointerEvents;
          b.style.pointerEvents = 'auto';
          let seen = 0;
          for (let i = 1; i <= 5; i++) for (let j = 1; j <= 3; j++) { const e = document.elementFromPoint(r.left + r.width * i / 6, r.top + r.height * j / 4); seen += e === b; }
          b.style.pointerEvents = keep;
          return [getComputedStyle(b).getPropertyValue('--c').trim(), Math.round(seen / 15 * 100) / 100];
        }));
        assert.ok(sauces.length === 2 && sauces[1][0] === '#D9452B' && sauces.every((x) => x[1] >= 0.7), `ceplok: the kecap and the red sambal both show on the full plate ${JSON.stringify(sauces)}`);
      } else if (r.paused) {
        // a full pot of soup and a full glass are in front of the window: the sign's chefs still show, at phone and small
        await page.waitForTimeout(400);
        await signShows(t, page, `@phone over a full ${r.recipe}`, 0.85);
        await page.setViewportSize(h.VIEWPORTS.small);
        await page.waitForTimeout(400);
        await signShows(t, page, `@small over a full ${r.recipe}`, 0.85);
        await page.setViewportSize(h.VIEWPORTS.phone);
        await page.waitForTimeout(300);
      }
      if (r.paused) {
        const rest = await followHand(page);
        r = { ...rest, steps: r.steps + rest.steps, bad: r.bad.concat(rest.bad), herOk: r.herOk && rest.herOk, last: r.last };
      }
      assert.ok(r.over, `round ${round + 1} (${r.recipe}) is won by following the hand alone (${r.steps} steps)`);
      assert.deepStrictEqual(r.bad, [], 'the hand only ever points at something that moves the round on');
      assert.ok(r.herOk, 'while her board is unfinished, the hand is on her board');
      // the main thing they cooked is still in the dish when it is tasted (the full dish gives way to extra slices instead)
      assert.ok(r.last && within(keep[r.recipe], r.last.contents), `${r.recipe}: at the last step the dish still holds ${keep[r.recipe].join('')} (${r.last && r.last.contents})`);
      // and the present opening (a new helper, decoration or kitchen) never shrinks the job objects
      assert.strictEqual(r.objEnd, r.last.obj, `${r.recipe}: the job objects keep their size when the present opens`);
      done.push(r.recipe);
      await t.waitForWin(page, 5000);
    }
    assert.deepStrictEqual(done.slice().sort(), ['cake', 'campur', 'ceplok', 'goreng', 'martabak', 'pisang', 'sate', 'sop'], 'the hand chose each dish once: ' + done);
  }

  // --- 4. mashing: four fingers everywhere never break anything
  if (part(4)) {
    await openKitchen(page, { kitchen: { done: 13 }, scale: 1 });
    const one = await page.evaluate(() => {
      const ids = ['sop', 'cake', 'sate', 'goreng'];
      ids.forEach((id, k) => {
        const n = document.querySelector(`.g-kitchen .kt-card[data-id="${id}"]`), r = n.getBoundingClientRect();
        n.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 7000 + k, pointerType: 'touch', clientX: r.left + 10, clientY: r.top + 10 }));
      });
      return [MG.current.api.state, MG.current.api.recipe, document.querySelectorAll('.g-kitchen .kt-card[aria-disabled="true"]').length];
    });
    assert.deepStrictEqual(one, ['deal', 'sop', 8], 'four fingers on the menu at once: exactly one dish starts');
    await page.evaluate(() => { const c = MG.current.ctx, w = c.win; window.__wins = 0; c.win = function () { window.__wins++; return w.apply(this, arguments); }; });
    /** Four random fingers every 15ms for ms of real time. o.hand: a fifth finger taps where the hand shows (so the
     *  round moves on under the mashing); o.afterFinale: stop once that many game seconds have passed since the finale began. */
    const mash = (ms, o = {}) => page.evaluate(async ([ms, o]) => {
      const C = MG.current.ctx, g = document.querySelector('#mg-game').getBoundingClientRect(), log = { beats: [], over: [], errors: 0, finaleAt: null, afterFinale: 0, wins: 0 };
      let id = 60000, last = MG.current.api.beat;
      const touch = (n, x, y) => { const e = { bubbles: true, cancelable: true, pointerId: ++id, pointerType: 'touch', clientX: x, clientY: y }; n.dispatchEvent(new PointerEvent('pointerdown', e)); n.dispatchEvent(new PointerEvent('pointerup', e)); };
      const end = performance.now() + ms;
      while (performance.now() < end) {
        for (let f = 0; f < 4; f++) {
          const x = g.left + Math.random() * g.width, y = g.top + Math.random() * g.height;
          const n = document.elementFromPoint(x, y);
          if (n) touch(n, x, y);
        }
        const a = MG.current.api;
        if (o.hand && a.state === 'beat') { a.hintNext(); const n = a.hinted; if (n) { const r = n.getBoundingClientRect(); touch(n, r.left + r.width / 2, r.top + r.height / 2); } }
        if (a.beat !== last) { log.beats.push(a.beat - last); last = a.beat; }
        a.boards.forEach((b) => { if (b.k > b.n) log.over.push(b.do + ' ' + b.k + '/' + b.n); });
        if (a.state === 'finale' && log.finaleAt === null) log.finaleAt = C.time;
        if (log.finaleAt !== null) log.afterFinale = C.time - log.finaleAt;
        if (o.afterFinale && log.afterFinale >= o.afterFinale) break;
        await new Promise((r) => setTimeout(r, 15));
      }
      log.wins = window.__wins;
      return log;
    }, [ms, o]);
    let log = await mash(2500);
    assert.ok(log.beats.every((d) => d === 1), 'the steps only ever go forward one at a time: ' + log.beats);
    assert.deepStrictEqual(log.over, [], 'never more taps than a job takes');
    assert.strictEqual(await api(page, 'locked'), false, 'and nothing is ever locked');
    await page.evaluate(() => { MG.timeScale = 8; });
    const r = await page.evaluate(async () => {
      for (let k = 0; k < 600; k++) {
        const a = MG.current.api;
        if (a.state === 'beat' && a.beat === a.beats.length - 1) break;
        a.hintNext();
        const n = a.hinted;
        if (n) { const rc = n.getBoundingClientRect(); const o = { bubbles: true, pointerId: 90000 + k, pointerType: 'touch', clientX: rc.left + rc.width / 2, clientY: rc.top + rc.height / 2 }; n.dispatchEvent(new PointerEvent('pointerdown', o)); n.dispatchEvent(new PointerEvent('pointerup', o)); }
        await new Promise((res) => setTimeout(res, 30));
      }
      MG.timeScale = 1;
      const a = MG.current.api;
      return [a.state, a.beat === a.beats.length - 1];
    });
    assert.deepStrictEqual(r, ['beat', true], 'then the hand brings the dish to its last step');
    // the last step's finishing taps happen under four fingers, which keep going until well after the party is called (2s)
    log = await mash(15000, { hand: true, afterFinale: 2.6 });
    assert.ok(log.finaleAt !== null && log.afterFinale >= 2.6, `mashed through the last step and ${log.afterFinale.toFixed(2)}s of the finale`);
    assert.ok(log.beats.every((d) => d === 1), 'the steps only ever go forward one at a time: ' + log.beats);
    assert.deepStrictEqual(log.over, []);
    assert.strictEqual(log.wins, 1, 'the party is called exactly once under the mashing');
    await t.waitForWin(page, 8000);
    await page.waitForTimeout(400);
    assert.strictEqual(await page.evaluate(() => window.__wins), 1, 'the party starts exactly once');
    const ev = await api(page, 'events');
    const gaps = [0, 1].map((s) => { const ts = ev.filter((e) => e.side === s).map((e) => e.t); let m = Infinity; for (let i = 1; i < ts.length; i++) m = Math.min(m, ts[i] - ts[i - 1]); return m; });
    assert.ok(ev.length > 10 && gaps.every((g) => g >= 0.16 - 1e-6), `counted taps on one board are never closer than the gap (${gaps.map((g) => g.toFixed(3))}, ${ev.length} taps)`);
  }

  // --- 5. the golden moment pauses only that board (never ctx.lock)
  if (part(5)) {
    await openKitchen(page);
    await startAt(page, 'ceplok', 1);
    const r = await page.evaluate(() => {
      const a = MG.current.api;
      const tapIt = (n, id) => { const rc = n.getBoundingClientRect(); const o = { bubbles: true, pointerId: id, pointerType: 'touch', clientX: rc.left + rc.width / 2, clientY: rc.top + rc.height / 2 }; n.dispatchEvent(new PointerEvent('pointerdown', o)); };
      const phase = a.cook(0);
      const locked = a.locked;
      tapIt(document.querySelector('.kt-board[data-side="1"] .kt-obj'), 8101);
      tapIt(document.querySelector('.kt-board[data-side="0"] .kt-obj'), 8102);
      return { phase, locked, b: a.boards[1].k, a: [a.boards[0].phase, a.boards[0].k], lockedAfter: a.locked };
    });
    assert.deepStrictEqual(r, { phase: 'gold', locked: false, b: 1, a: ['gold', 0], lockedAfter: false }, 'her pan turns golden: his knife still chops, her pan waits a moment, nothing is locked');
  }

  // --- 6. fetching: a wrong jar is a joke (and the cat's snack, twice a round); the hand shows the right one
  if (part(6)) {
    await openKitchen(page, { scale: 4 });
    await startAt(page, 'ceplok', 3);
    const wrong = '.g-kitchen .kt-board[data-side="1"] .kt-jar:not([data-e="🍶"])';
    const before = (await api(page, 'vessel')).pieces;
    for (let k = 0; k < 5; k++) {
      await tap(page, wrong, 140);
      if (k === 1) assert.strictEqual(await A(page, (a) => a.hinted && a.hinted.dataset.e), '🍶', 'two wrong jars: the hand shows the right one');
    }
    let b = (await boards(page))[1];
    assert.deepStrictEqual([b.do, b.done, b.k], ['fetch', false, 0], 'five wrong jars: not done, nothing used up');
    assert.strictEqual(await page.locator(wrong).count(), 2, 'all three jars still there');
    assert.strictEqual((await api(page, 'vessel')).pieces, before, 'nothing went into the dish');
    assert.strictEqual(await api(page, 'catSnacks'), 0, 'no cat yet');
    await tap(page, '.g-kitchen .kt-board[data-side="1"] .kt-jar[data-e="🍶"]');
    assert.ok((await boards(page))[1].done, 'the right jar: done');
    await gameWait(page, 0.3);
    assert.ok(await page.evaluate(() => { const w = document.querySelector('.g-kitchen .kt-board[data-side="1"] .kt-want'); return w.hidden && getComputedStyle(w).display === 'none'; }), 'found: the want bubble goes away');
    await openKitchen(page, { kitchen: { done: 2 }, scale: 4 });
    await startAt(page, 'ceplok', 3);
    // the cat's leap (at real speed): the cat is really seen at the wrong jar, not clipped by the shelf or under the boards
    await page.evaluate(() => { MG.timeScale = 1; });
    const cat = await page.evaluate(async (sel) => {
      const jar = document.querySelector(sel), J = jar.getBoundingClientRect(), jx = J.left + J.width / 2, jy = J.top + J.height / 2;
      const q = jar.getBoundingClientRect(), o = { bubbles: true, cancelable: true, pointerId: 31999, pointerType: 'touch', clientX: jx, clientY: jy };
      jar.dispatchEvent(new PointerEvent('pointerdown', o)); jar.dispatchEvent(new PointerEvent('pointerup', o));
      /** Where a cat sticker shows: its centre, unless it is hidden, see-through or clipped by an ancestor. */
      const shows = (n) => {
        const r = n.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
        if (!r.width || getComputedStyle(n).visibility === 'hidden') return null;
        for (let p = n; p && p !== document.documentElement; p = p.parentElement) {
          const cs = getComputedStyle(p);
          if (cs.display === 'none' || +cs.opacity < 0.2) return null;
          if (p !== n && cs.overflow !== 'visible') { const c = p.getBoundingClientRect(); if (x < c.left || x > c.right || y < c.top || y > c.bottom) return null; }
        }
        return [x, y];
      };
      /** Is the flying cat the topmost thing at its centre (not drawn under the boards or the jars)? */
      const onTop = (f, x, y) => {
        const st = f.querySelector('.mg-sticker'), keep = [f.style.pointerEvents, st.style.pointerEvents];
        f.style.pointerEvents = 'auto'; st.style.pointerEvents = 'auto';
        const e = document.elementFromPoint(x, y);
        f.style.pointerEvents = keep[0]; st.style.pointerEvents = keep[1];
        return !!e && f.contains(e);
      };
      let best = Infinity, top = Infinity;
      const t0 = performance.now();
      while (performance.now() - t0 < 1400) {
        document.querySelectorAll('.g-kitchen .mg-sticker').forEach((n) => {
          if (n.textContent !== '🐈') return;
          const c = shows(n);
          if (!c) return;
          const d = Math.hypot(c[0] - jx, c[1] - jy);
          best = Math.min(best, d);
          const f = n.closest('.kt-flyer--leap');
          if (f && d <= J.width / 2 && onTop(f, c[0], c[1])) top = Math.min(top, d);
        });
        await new Promise((r) => requestAnimationFrame(r));
      }
      return { best: Math.round(best), top: Math.round(top), jar: Math.round(q.width) };
    }, wrong);
    assert.ok(cat.best <= cat.jar * 0.5, `a wrong jar: the cat is seen right at the jar (${cat.best}px from its centre, jar ${cat.jar}px)`);
    assert.ok(cat.top <= cat.jar * 0.5, `and it is drawn over the boards and the jar, not under them (on top ${cat.top}px from the jar's centre)`);
    await page.evaluate(() => { MG.timeScale = 4; });
    for (let k = 1; k < 4; k++) await tap(page, wrong, 140);
    assert.strictEqual(await api(page, 'catSnacks'), 2, 'the cat gobbles two wrong jars a round, no more');
    b = (await boards(page))[1];
    assert.ok(!b.done && (await page.locator('.g-kitchen .kt-jar').count()) === 3, 'and the jars are bottomless');
  }

  // --- 7. picking: every choice is right, three taps, and the dish shows it
  if (part(7)) for (const choice of [0, 1, 2]) {
    await openKitchen(page, { scale: 4 });
    await startAt(page, 'pisang', 3);
    await tap(page, board(0) + ' .kt-chef', 0); await gameWait(page, 0.3);
    let b = (await boards(page))[0];
    assert.deepStrictEqual([b.do, b.k, b.chosen], ['pick', 0, null], 'a tap away from the bowls changes nothing');
    await tap(page, board(0) + ` .kt-bowl[data-i="${choice}"]`, 0); await gameWait(page, 0.3);
    assert.deepStrictEqual([(await boards(page))[0].k, (await boards(page))[0].chosen], [1, choice]);
    assert.strictEqual(await page.locator(board(0) + ' .kt-bowl.is-gone').count(), 2, 'the other two slide away');
    await tap(page, board(0), 0); await gameWait(page, 0.3);
    await tap(page, board(0) + ' .kt-bowl.is-chosen', 0); await gameWait(page, 0.3);
    b = (await boards(page))[0];
    assert.deepStrictEqual([b.k, b.done], [3, true], 'three taps');
    await tapJob(page, 1);
    await stateIs(page, 'beat');
    await page.waitForFunction(() => MG.current.api.beat === 4);   // the meses and the condensed milk
    await gameWait(page, 0.35);
    for (const s of [0, 1]) { const n = (await boards(page))[s].n; for (let k = 0; k < n; k++) { await tapJob(page, s, 1, 0); await gameWait(page, 0.2); } }
    await page.waitForFunction(() => MG.current.api.beat === 5);
    await gameWait(page, 0.35);
    await tapJob(page, 0); await tapJob(page, 1);
    await page.waitForSelector('.g-kitchen .kt-dish:not([hidden])', { timeout: 4000 });
    const e = await page.evaluate(() => document.querySelector('.g-kitchen .kt-dish').dataset.choice);
    assert.strictEqual(e, ['🧀', '🍫', '🍓'][choice], 'the finished dish shows what she chose');
    await t.waitForWin(page, 6000);
  }

  // --- 8. frying and the surprises
  if (part(8)) {
    await openKitchen(page, { scale: 4 });
    await startAt(page, 'ceplok', 1);
    const t0 = await page.evaluate(() => MG.current.ctx.time);
    assert.strictEqual(await A(page, (a) => a.cook(0)), 'gold', 'it turns golden by itself, with no taps');
    await gameWait(page, 0.52);                      // (past the golden latch)
    await tapJob(page, 0);
    await page.waitForFunction(() => MG.current.api.boards[0].done, null, { timeout: 4000 });
    const flips = (await api(page, 'events')).filter((e) => e.side === 0 && e.t >= t0);
    assert.strictEqual(flips.length, 1, `golden: one counted tap flips it, then the second side cooks and the board finishes by itself (${flips.length} taps)`);
    // a chick: saved at once; a fresh egg rolls in and cracks normally; never two in a round
    await openKitchen(page, { kitchen: { done: 1 }, scale: 4 });
    await A(page, (a) => a.surprise({ chick: true }));
    await startAt(page, 'ceplok', 0);
    await tapJob(page, 0, 1, 0); await gameWait(page, 0.3); await tapJob(page, 0, 1, 10);   // (the gap between cracks is 0.22 game s)
    let b = (await boards(page))[0];
    assert.deepStrictEqual([b.do, b.k, b.done], ['crack', 0, false], 'a chick hops out instead of a yolk');
    assert.strictEqual((await saved(page)).chicks, 1, 'and the chick is saved at once');
    await page.waitForSelector('.g-kitchen .kt-item--chick', { timeout: 3000 });
    assert.strictEqual(await page.locator('.g-kitchen .kt-item--chick').count(), 1, 'it hops onto the shelf');
    await gameWait(page, 1.2);                       // (the fresh egg can be cracked 1.5 game s after the chick)
    await A(page, (a) => a.surprise({ chick: true }));
    await tapJob(page, 0, 1, 0); await gameWait(page, 0.3); await tapJob(page, 0, 1, 0); await gameWait(page, 0.3);
    b = (await boards(page))[0];
    assert.ok(b.done, 'the fresh egg cracks normally');
    await A(page, (a) => a.jump(0));
    await gameWait(page, 0.35);
    await tapJob(page, 0, 1, 0); await gameWait(page, 0.3); await tapJob(page, 0, 1, 0); await gameWait(page, 0.3);
    assert.ok((await boards(page))[0].done && (await api(page, 'kitchen')).chicks === 1, 'never two chicks in one round');
    const r = await followHand(page);
    assert.ok(r.over, 'and the round finishes');
    await t.waitForWin(page, 5000);
    for (const k of [{ done: 0 }, { done: 5, chicks: 3 }]) {
      await openKitchen(page, { kitchen: k, scale: 4 });
      await A(page, (a) => a.surprise({ chick: true }));
      await startAt(page, 'ceplok', 0);
      await tapJob(page, 0, 1, 0); await gameWait(page, 0.3); await tapJob(page, 0, 1, 0); await gameWait(page, 0.3);
      assert.ok((await boards(page))[0].done && (await api(page, 'kitchen')).chicks === (k.chicks || 0), `no chick ${k.done ? 'once there are three' : 'before the first dish is done'}`);
    }
    // a high flip lands on the chef's hat and still finishes
    await openKitchen(page, { scale: 2 });
    await startAt(page, 'ceplok', 1);
    await A(page, (a) => { a.surprise({ high: true }); a.cook(0); });
    // tap until it flips (taps inside the golden latch are harmless), then watch the hat: no fixed real-time sleeps
    for (let k = 0; k < 80 && (await boards(page))[0].phase === 'gold'; k++) await tapJob(page, 0, 1, 25);
    assert.strictEqual((await boards(page))[0].phase, 'flying', 'the flip');
    await page.waitForSelector(board(0) + ' .kt-onhat', { state: 'attached', timeout: 3000 });
    await page.waitForSelector(board(0) + ' .kt-onhat', { state: 'detached', timeout: 3000 });
    await page.waitForFunction(() => MG.current.api.boards[0].done, null, { timeout: 5000 });
  }

  // --- 9. every size, both ways round: menu, a work beat, fetch, pick, and the present with a full shelf
  if (part(9)) for (const vp of ['small', 'phone', 'phoneWide', 'tabletTall', 'tablet']) {
    const dark = vp === 'phoneWide' || vp === 'tablet', rm = vp === 'tabletTall';
    const p = await newPage(t, { viewport: vp, dark, reducedMotion: rm });
    await openKitchen(p, { kitchen: { done: 13 } });
    assert.strictEqual(await p.locator('.g-kitchen .kt-card').count(), 8);
    await layoutChecks(t, p, `@${vp} menu`);
    await t.shot(p, `${ID}-${vp}-menu.png`);
    await startAt(p, 'campur', 0);
    await layoutChecks(t, p, `@${vp} work beat`);
    await signShows(t, p, `@${vp} (a six-step dish)`);
    await t.shot(p, `${ID}-${vp}-beat.png`);
    await openKitchen(p, { kitchen: { done: 13 } });
    await startAt(p, 'martabak', 0);
    assert.strictEqual(await p.locator('.g-kitchen .kt-jar').count(), 3);
    await layoutChecks(t, p, `@${vp} fetch beat`);
    await t.shot(p, `${ID}-${vp}-fetch.png`);
    await openKitchen(p, { kitchen: { done: 13 } });
    await startAt(p, 'campur', 3);
    assert.strictEqual(await p.locator('.g-kitchen .kt-bowl').count(), 3);
    await layoutChecks(t, p, `@${vp} pick beat`);
    await tap(p, board(0) + ' .kt-bowl[data-i="0"]', 400);
    await layoutChecks(t, p, `@${vp} pick chosen`);
    await openKitchen(p, { kitchen: { done: 40, chicks: 3 } });
    await startAt(p, 'ceplok', 5);
    await tapJob(p, 0); await tapJob(p, 1);
    await p.waitForSelector('.g-kitchen .kt-gift.is-open', { timeout: 4000 });
    await p.waitForTimeout(600);
    await layoutChecks(t, p, `@${vp} present`, { shelf: 13 });
    await t.shot(p, `${ID}-${vp}-gift.png`);
    if (vp === 'small' || vp === 'phoneWide') {
      // one beat of every job and prop, jumping straight there: everything fits and every job stays inside its board
      const sweep = [['ceplok', [1, 5]], ['sate', [1, 2, 3, 4]], ['cake', [2, 5]], ['goreng', [2, 3, 4]], ['sop', [0]]];
      const seen = new Set();
      for (const [id, list] of sweep) {
        await openKitchen(p, { kitchen: { done: 13 } });
        await A(p, (a, id) => a.start(id), id);
        await stateIs(p, 'beat');
        for (const i of list) {
          if (i) await A(p, (a, i) => a.jump(i), i);
          await p.waitForFunction((i) => MG.current.api.state === 'beat' && MG.current.api.beat === i, i, { timeout: 5000 });
          await settled(p);
          await gameWait(p, 0.35);                     // (a new job can be used once it has been seen for 0.3 game seconds)
          const bs = await boards(p);
          const label = `@${vp} ${id} beat ${i} (${bs.map((b) => b.do).join(' + ')})`;
          bs.forEach((b) => seen.add(b.do === 'fry' ? (b.e === '🍢' ? 'grill' : b.e === '🍰' ? 'oven' : 'pan') : b.do));
          await layoutChecks(t, p, label);
          await jobsInside(t, p, label);
          if (bs[0].do === 'stir') {
            // the spoon stays inside through a whole set of turns
            for (let k = 0; k < bs[0].n; k++) {
              await tapJob(p, 0, 1, 0);
              await gameWait(p, 0.2);
              await p.waitForTimeout(100);              // (the spoon turns over 0.25s)
              assert.strictEqual((await boards(p))[0].k, k + 1, 'stir: one tap, one turn');
              await jobsInside(t, p, `${label}, turn ${k + 1}`);
            }
          }
          if (bs[0].do === 'blow') {
            // blowing out a candle: the cake already in the dish does not drop in again
            await p.waitForFunction(() => ![...document.querySelectorAll('.g-kitchen .kt-contents .kt-layer')].some((n) => n.getAnimations().length), null, { timeout: 3000 });
            await tapJob(p, 0, 1, 60);
            assert.strictEqual((await boards(p))[0].k, 1, `blow: the tap counted ${label}`);
            const moving = await p.evaluate(() => [...document.querySelectorAll('.g-kitchen .kt-contents .kt-layer')].map((n) => n.getAnimations().length));
            assert.deepStrictEqual(moving, [0, 0], `a candle blown out: the two sponges stay still ${label}`);
          }
        }
      }
      assert.deepStrictEqual([...seen].sort(), ['blow', 'chop', 'crack', 'fetch', 'garnish', 'grill', 'oven', 'pan', 'peel', 'pound', 'scoop', 'shake', 'skewer', 'stir', 'taste', 'wash'], 'the sweep met every job and prop');
    }
    if (vp === 'small') {
      // the small phone turned on its side (568x320) with a six-step dish: the step stickers stay on the wall, the jobs fit
      await openKitchen(p, { kitchen: { done: 13 } });
      await startAt(p, 'goreng', 0);
      await p.setViewportSize({ width: 568, height: 320 });
      await p.waitForTimeout(400);
      for (const i of [0, 2]) {
        if (i) { await A(p, (a, i) => a.jump(i), i); await p.waitForFunction((i) => MG.current.api.beat === i, i); await settled(p); }
        const r = await p.evaluate(() => {
          const w = document.querySelector('.g-kitchen .kt-wall').getBoundingClientRect();
          const pips = [...document.querySelectorAll('.g-kitchen .kt-pip')].map((n) => n.getBoundingClientRect());
          const objs = [...document.querySelectorAll('.g-kitchen .kt-obj')].map((n) => n.offsetWidth);
          return { n: pips.length, out: pips.filter((q) => q.left < w.left - 1 || q.right > w.right + 1 || q.top < w.top - 1 || q.bottom > w.bottom + 1).map((q) => [Math.round(q.left), Math.round(q.right)]), wall: [Math.round(w.left), Math.round(w.right)], obj: objs.length ? Math.min(...objs) : null };
        });
        assert.ok(r.n === 6 && r.out.length === 0, `568x320: all six step stickers are on the wall (${JSON.stringify(r)})`);
        if (r.obj !== null) assert.ok(r.obj >= 96, `568x320: the job objects are at least 96px (${r.obj})`);
        await layoutChecks(t, p, `@568x320 goreng beat ${i}`);
      }
    }
  }

  // --- 10. turning the phone mid-fry and mid-merge changes nothing
  if (part(10)) {
    page = await newPage(t, { viewport: 'phone' });
    await openKitchen(page);
    await startAt(page, 'ceplok', 1);
    await page.waitForTimeout(600);
    const before = await boards(page);
    const obj = await cssVar(page, '--obj');
    await page.setViewportSize(h.VIEWPORTS.phoneWide);
    await page.waitForTimeout(300);
    const after = await boards(page);
    assert.deepStrictEqual([await api(page, 'beat'), after[0].phase, after[0].k, after[1].k], [1, before[0].phase, before[0].k, before[1].k], 'turned mid-fry: same step, same progress');
    assert.ok(after[0].heat >= before[0].heat, 'and it kept cooking');
    await layoutChecks(t, page, 'after turning mid-fry');
    // and back again: the job objects are exactly the size they were (the knife's overhang is not overflow)
    await page.setViewportSize(h.VIEWPORTS.phone);
    await page.waitForTimeout(300);
    assert.strictEqual(await cssVar(page, '--obj'), obj, 'portrait, landscape, portrait: the job objects keep their size');
    await page.setViewportSize(h.VIEWPORTS.phoneWide);
    await page.waitForTimeout(300);
    await A(page, (a) => a.jump(2));
    await page.waitForTimeout(400);
    for (const s of [0, 1]) { const n = (await boards(page))[s].n; for (let k = 0; k < n; k++) await tapJob(page, s, 1, 220); }
    assert.strictEqual(await api(page, 'state'), 'merge');
    await page.setViewportSize(h.VIEWPORTS.phone);
    await page.waitForFunction(() => MG.current.api.beat === 3, null, { timeout: 5000 });
    assert.strictEqual(await api(page, 'state'), 'beat', 'turned mid-merge: the next step still comes');
    await page.waitForTimeout(500);                 // (the new jobs slide in from the boards' outer edges)
    await layoutChecks(t, page, 'after turning mid-merge');
    await page.evaluate(() => { MG.timeScale = 8; });
    assert.ok((await followHand(page)).over, 'and the round finishes');
    await t.waitForWin(page, 5000);
  }

  // --- 11. leaving mid-dish keeps everything earned; damaged saves open a sensible menu
  if (part(11)) {
    await openKitchen(page, { kitchen: { done: 1, chicks: 2 } });
    await startAt(page, 'goreng', 0);
    await tapJob(page, 0, 1, 250); await tapJob(page, 0, 1, 250); await tapJob(page, 0, 1, 250);
    assert.ok((await boards(page))[0].done);
    await page.evaluate(() => MG.home());
    await page.evaluate(() => MG.open('kitchen'));
    await ready(page);
    const k = await api(page, 'kitchen');
    assert.deepStrictEqual([k.done, k.chicks, k.seen], [1, 2, ['wash']], 'left mid-dish: back to the menu, nothing earned is lost');
    for (const [bad, cards] of [['"nonsense"', 2], ['{"done":"x"}', 2], ['[1,2,3]', 2], [JSON.stringify({ done: 5, cooked: { rock: 3, sate: 'x', ceplok: 99999 }, chicks: 99, seen: ['fly', 7, 'crack', 'crack'] }), 5]]) {
      await openKitchen(page, { kitchen: bad });
      assert.strictEqual(await page.locator('.g-kitchen .kt-card').count(), cards, `a damaged save opens the menu (${bad})`);
    }
    assert.strictEqual(await page.evaluate(() => document.querySelector('.g-kitchen .kt-card[data-id="ceplok"]').dataset.stars), '3', 'stars stop at three');
  }

  // --- 12. help and options: help Lots makes her jobs short (never the grown-up's); Short drops the extra beats; Few/Lots
  if (part(12)) {
    const p = await newPage(t, { help: 2 });
    await openKitchen(p, { scale: 2 });
    assert.strictEqual((await api(p, 'tuning')).cookS[0], 1.6, 'her pan cooks quicker');
    await startAt(p, 'ceplok', 0);
    let b = await boards(p);
    assert.deepStrictEqual([b[0].n, b[1].n], [1, 3], 'one tap cracks her egg; his cucumber is unchanged');
    await tapJob(p, 0, 1, 300);
    assert.ok((await boards(p))[0].done, 'one tap, the egg is cracked and in the bowl');
    await A(p, (a) => a.jump(2));
    await p.waitForTimeout(200);
    b = await boards(p);
    assert.deepStrictEqual([b[0].do, b[0].n, b[1].n], ['chop', 1, 4]);
    await openKitchen(page, { length: 'short' });
    await startAt(page, 'ceplok', 0);
    const short = await api(page, 'beats');
    assert.ok(short.length === 4 && short.every((x) => !x.extra), 'Short leaves out the two extra beats');
    await openKitchen(page, { taps: 'lots' });
    await startAt(page, 'ceplok', 0);
    b = await boards(page);
    assert.deepStrictEqual([b[0].n, b[1].n], [4, 5], 'Lots: more taps on variable jobs');
    await A(page, (a) => a.jump(3));
    await page.waitForTimeout(150);
    b = await boards(page);
    assert.deepStrictEqual([b[0].n, b[1].n], [2, 1], 'fixed jobs never change');
    await openKitchen(page, { taps: 'few' });
    await startAt(page, 'ceplok', 0);
    b = await boards(page);
    assert.deepStrictEqual([b[0].n, b[1].n], [1, 2], 'Few: fewer');
    // the grown-up's pause menu: how to play, and the two options
    await t.pause(page);
    const menu = await page.evaluate(() => document.querySelector('.mg-overlay--pause').innerText);
    assert.ok(/Recipe/.test(menu) && /Taps per step/.test(menu) && /Cook real home dishes together/.test(menu), 'the pause menu explains it and offers the options');
    await page.evaluate(() => MG.home());
  }
});
