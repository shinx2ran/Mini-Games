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
/** Choose a dish (the same path as a card tap) and go to beat i; then wait out the boards' first moment. */
async function startAt(page, id, beat = 0) {
  await A(page, (a, id) => a.start(id), id);
  await stateIs(page, 'beat');
  if (beat) await A(page, (a, i) => a.jump(i), beat);
  await page.waitForFunction(() => MG.current.api.boards.every((b) => b.do), null, { timeout: 5000 });
  await page.waitForTimeout(400 / (await page.evaluate(() => MG.timeScale || 1)));
}
const saved = (page) => page.evaluate((KEY) => JSON.parse(localStorage.getItem(KEY)), KEY);

/** Follow only the ghost hand until the round is won. Watches where the hand points on the way. */
function followHand(page, max = 400) {
  return page.evaluate(async (max) => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    let id = 40000 + Math.floor(Math.random() * 1000) * 100, steps = 0, herOk = true, picked = null;
    const bad = [];
    for (; steps < max && MG.current && !MG.current.ctx.over; steps++) {
      const a = MG.current.api;
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
    return { steps, bad, herOk, picked, over: !!(MG.current && MG.current.ctx.over), recipe: MG.current && MG.current.api.recipe };
  }, max);
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
  const text = await p.evaluate(() => document.querySelector('.g-kitchen').innerText.replace(/\p{Extended_Pictographic}|\p{Emoji_Component}|️|‍|\s/gu, ''));
  assert.strictEqual(text, '', `no letters or digits on screen ${label}`);
  if (o.shelf) {
    const n = await p.evaluate(() => [...document.querySelectorAll('.g-kitchen .kt-item')].filter((n) => { const r = n.getBoundingClientRect(); return r.width >= 14; }).length);
    assert.strictEqual(n, o.shelf, `all ${o.shelf} shelf items show ${label}`);
  }
}

h.run(ID, async (t) => {
  const { assert } = t;
  let page = await newPage(t);
  await openKitchen(page);

  // --- 1. the rules and the data
  {
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
        if (extras.length !== 1 || extras[0] === 0 || extras[0] === beats.length - 1) rules.push(`${id} has one extra beat in the middle`);
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
      };
    });
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
  await openKitchen(page);
  assert.strictEqual(await page.locator('.g-kitchen .kt-card').count(), 2, 'two dishes to start');
  assert.strictEqual(await page.locator('.g-kitchen .kt-next').count(), 1, 'and the next one as a silhouette with a present');
  await page.waitForSelector('.mg-hint', { state: 'attached', timeout: 1000 });
  assert.strictEqual(await A(page, (a) => a.hinted && a.hinted.dataset.id), 'ceplok', 'the hand shows the first dish');
  assert.strictEqual(await api(page, 'locked'), false, 'the menu is never locked');
  await tap(page, '.g-kitchen .kt-next');
  assert.strictEqual(await api(page, 'state'), 'menu', 'the next dish is not a button');
  await tap(page, '.g-kitchen .kt-card[data-id="ceplok"]');
  assert.strictEqual(await api(page, 'state'), 'deal', 'one tap picks the dish');
  await stateIs(page, 'beat');
  assert.strictEqual(await api(page, 'aSide'), 0, 'the little player (left) has the short showy jobs');
  const nBeats = (await api(page, 'beats')).length;
  assert.strictEqual(nBeats, 5);
  let pieces = 0;
  for (let i = 0; i < nBeats; i++) {
    await page.waitForFunction((i) => MG.current.api.state === 'beat' && MG.current.api.beat === i, i, { timeout: 8000 });
    await page.waitForTimeout(350);
    const bs = await boards(page);
    for (const s of [0, 1]) {
      const b = bs[s];
      if (b.do === 'fry') {
        await page.waitForFunction((s) => MG.current.api.boards[s].phase === 'gold', s, { timeout: 6000 });
        await tapJob(page, s, 1, 0);
        let now = (await boards(page))[s];
        assert.deepStrictEqual([now.phase, now.k], ['gold', 0], 'golden: a tap inside the moment it turns golden does nothing');
        await page.waitForTimeout(520);
        await tapJob(page, s, 1, 0);
        now = (await boards(page))[s];
        assert.ok(['flying', 'heat2'].includes(now.phase) && now.k === 1, 'then the flip: ' + now.phase);
        await page.waitForFunction((s) => MG.current.api.boards[s].done, s, { timeout: 6000 });
        continue;
      }
      for (let k = 0; k < b.n; k++) {
        await tapJob(page, s, 1, 0);
        const now = (await boards(page))[s];
        assert.strictEqual(now.k, k + 1, `${b.do}: one tap, one step (${k + 1}/${b.n})`);
        if (k + 1 < b.n) await page.waitForTimeout(280);
      }
      assert.ok((await boards(page))[s].done, `${b.do} is done after ${b.n} taps`);
      const after = (await boards(page))[s];
      assert.ok(after.k <= after.n);
    }
    if (i === nBeats - 1) break;
    await page.waitForFunction((i) => MG.current.api.beat === i + 1, i, { timeout: 8000 });
    const v = await api(page, 'vessel');
    assert.ok(v.pieces >= pieces, 'the dish only ever fills up');
    if (i >= 1) assert.ok(v.pieces > pieces, `beat ${i}: what they made landed in the dish (${pieces} -> ${v.pieces})`);
    pieces = v.pieces;
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

  // --- 3. following only the ghost hand finishes a round of every recipe (Full, fast clock)
  {
    await openKitchen(page, { scale: 8 });
    const done = [];
    for (let round = 0; round < 8; round++) {
      if (round) await openKitchen(page, { keep: true, scale: 8 });
      if (round === 1) assert.ok(await A(page, (a) => a.setKitchen({ done: 13, cooked: { ceplok: 1 } })), 'every dish open');
      const r = await followHand(page);
      assert.ok(r.over, `round ${round + 1} (${r.recipe}) is won by following the hand alone (${r.steps} steps)`);
      assert.deepStrictEqual(r.bad, [], 'the hand only ever points at something that moves the round on');
      assert.ok(r.herOk, 'while her board is unfinished, the hand is on her board');
      done.push(r.recipe);
      await t.waitForWin(page, 5000);
    }
    assert.deepStrictEqual(done.slice().sort(), ['cake', 'campur', 'ceplok', 'goreng', 'martabak', 'pisang', 'sate', 'sop'], 'the hand chose each dish once: ' + done);
  }

  // --- 4. mashing: four fingers everywhere never break anything
  {
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
    const mash = (ms) => page.evaluate(async (ms) => {
      const g = document.querySelector('#mg-game').getBoundingClientRect(), log = { beats: [], over: [], errors: 0 };
      let id = 60000, last = MG.current.api.beat;
      const end = performance.now() + ms;
      while (performance.now() < end) {
        for (let f = 0; f < 4; f++) {
          const x = g.left + Math.random() * g.width, y = g.top + Math.random() * g.height;
          const n = document.elementFromPoint(x, y);
          if (!n) continue;
          const o = { bubbles: true, cancelable: true, pointerId: ++id, pointerType: 'touch', clientX: x, clientY: y };
          n.dispatchEvent(new PointerEvent('pointerdown', o));
          n.dispatchEvent(new PointerEvent('pointerup', o));
        }
        const a = MG.current.api;
        if (a.beat !== last) { log.beats.push(a.beat - last); last = a.beat; }
        a.boards.forEach((b) => { if (b.k > b.n) log.over.push(b.do + ' ' + b.k + '/' + b.n); });
        await new Promise((r) => setTimeout(r, 15));
      }
      return log;
    }, ms);
    let log = await mash(2500);
    assert.ok(log.beats.every((d) => d === 1), 'the steps only ever go forward one at a time: ' + log.beats);
    assert.deepStrictEqual(log.over, [], 'never more taps than a job takes');
    assert.strictEqual(await api(page, 'locked'), false, 'and nothing is ever locked');
    await page.evaluate(() => { MG.timeScale = 8; });
    const r = await page.evaluate(async () => {
      for (let k = 0; k < 600 && MG.current.api.state !== 'finale'; k++) {
        const a = MG.current.api;
        a.hintNext();
        const n = a.hinted;
        if (n) { const rc = n.getBoundingClientRect(); const o = { bubbles: true, pointerId: 90000 + k, pointerType: 'touch', clientX: rc.left + rc.width / 2, clientY: rc.top + rc.height / 2 }; n.dispatchEvent(new PointerEvent('pointerdown', o)); n.dispatchEvent(new PointerEvent('pointerup', o)); }
        await new Promise((res) => setTimeout(res, 30));
      }
      MG.timeScale = 1;
      return MG.current.api.state;
    });
    assert.strictEqual(r, 'finale', 'then the hand finishes the dish');
    log = await mash(1500);
    assert.deepStrictEqual(log.over, []);
    await t.waitForWin(page, 8000);
    await page.waitForTimeout(400);
    assert.strictEqual(await page.evaluate(() => window.__wins), 1, 'the party starts exactly once');
    const ev = await api(page, 'events');
    const gaps = [0, 1].map((s) => { const ts = ev.filter((e) => e.side === s).map((e) => e.t); let m = Infinity; for (let i = 1; i < ts.length; i++) m = Math.min(m, ts[i] - ts[i - 1]); return m; });
    assert.ok(ev.length > 10 && gaps.every((g) => g >= 0.16 - 1e-6), `counted taps on one board are never closer than the gap (${gaps.map((g) => g.toFixed(3))}, ${ev.length} taps)`);
  }

  // --- 5. the golden moment pauses only that board (never ctx.lock)
  {
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
  {
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
    await openKitchen(page, { kitchen: { done: 2 }, scale: 4 });
    await startAt(page, 'ceplok', 3);
    for (let k = 0; k < 4; k++) await tap(page, wrong, 140);
    assert.strictEqual(await api(page, 'catSnacks'), 2, 'the cat gobbles two wrong jars a round, no more');
    b = (await boards(page))[1];
    assert.ok(!b.done && (await page.locator('.g-kitchen .kt-jar').count()) === 3, 'and the jars are bottomless');
  }

  // --- 7. picking: every choice is right, three taps, and the dish shows it
  for (const choice of [0, 1, 2]) {
    await openKitchen(page, { scale: 4 });
    await startAt(page, 'pisang', 3);
    await tap(page, board(0) + ' .kt-chef', 100);
    let b = (await boards(page))[0];
    assert.deepStrictEqual([b.do, b.k, b.chosen], ['pick', 0, null], 'a tap away from the bowls changes nothing');
    await tap(page, board(0) + ` .kt-bowl[data-i="${choice}"]`, 100);
    assert.deepStrictEqual([(await boards(page))[0].k, (await boards(page))[0].chosen], [1, choice]);
    assert.strictEqual(await page.locator(board(0) + ' .kt-bowl.is-gone').count(), 2, 'the other two slide away');
    await tap(page, board(0), 100);
    await tap(page, board(0) + ' .kt-bowl.is-chosen', 100);
    b = (await boards(page))[0];
    assert.deepStrictEqual([b.k, b.done], [3, true], 'three taps');
    await tapJob(page, 1);
    await stateIs(page, 'beat');
    await page.waitForFunction(() => MG.current.api.beat === 4);
    await page.waitForTimeout(150);
    await tapJob(page, 0); await tapJob(page, 1);
    await page.waitForSelector('.g-kitchen .kt-dish:not([hidden])', { timeout: 4000 });
    const e = await page.evaluate(() => document.querySelector('.g-kitchen .kt-dish').dataset.choice);
    assert.strictEqual(e, ['🧀', '🍫', '🍓'][choice], 'the finished dish shows what she chose');
    await t.waitForWin(page, 6000);
  }

  // --- 8. frying and the surprises
  {
    await openKitchen(page, { scale: 4 });
    await startAt(page, 'ceplok', 1);
    assert.strictEqual(await A(page, (a) => a.cook(0)), 'gold', 'it turns golden by itself, with no taps');
    await page.waitForTimeout(200);
    await tapJob(page, 0);
    await page.waitForFunction(() => MG.current.api.boards[0].done, null, { timeout: 4000 });
    assert.ok(true, 'after the flip the second side cooks and the board finishes by itself');
    // a chick: saved at once; a fresh egg rolls in and cracks normally; never two in a round
    await openKitchen(page, { kitchen: { done: 1 }, scale: 4 });
    await A(page, (a) => a.surprise({ chick: true }));
    await startAt(page, 'ceplok', 0);
    await tapJob(page, 0, 1, 80); await tapJob(page, 0, 1, 10);
    let b = (await boards(page))[0];
    assert.deepStrictEqual([b.do, b.k, b.done], ['crack', 0, false], 'a chick hops out instead of a yolk');
    assert.strictEqual((await saved(page)).chicks, 1, 'and the chick is saved at once');
    await page.waitForTimeout(450);
    assert.strictEqual(await page.locator('.g-kitchen .kt-item--chick').count(), 1, 'it hops onto the shelf');
    await A(page, (a) => a.surprise({ chick: true }));
    await tapJob(page, 0, 1, 80); await tapJob(page, 0, 1, 80);
    b = (await boards(page))[0];
    assert.ok(b.done, 'the fresh egg cracks normally');
    await A(page, (a) => a.jump(0));
    await page.waitForTimeout(120);
    await tapJob(page, 0, 1, 80); await tapJob(page, 0, 1, 80);
    assert.ok((await boards(page))[0].done && (await api(page, 'kitchen')).chicks === 1, 'never two chicks in one round');
    const r = await followHand(page);
    assert.ok(r.over, 'and the round finishes');
    await t.waitForWin(page, 5000);
    for (const k of [{ done: 0 }, { done: 5, chicks: 3 }]) {
      await openKitchen(page, { kitchen: k, scale: 4 });
      await A(page, (a) => a.surprise({ chick: true }));
      await startAt(page, 'ceplok', 0);
      await tapJob(page, 0, 1, 80); await tapJob(page, 0, 1, 80);
      assert.ok((await boards(page))[0].done && (await api(page, 'kitchen')).chicks === (k.chicks || 0), `no chick ${k.done ? 'once there are three' : 'before the first dish is done'}`);
    }
    // a high flip lands on the chef's hat and still finishes
    await openKitchen(page, { scale: 2 });
    await startAt(page, 'ceplok', 1);
    await A(page, (a) => { a.surprise({ high: true }); a.cook(0); });
    await page.waitForTimeout(300);
    await tapJob(page, 0, 1, 220);
    assert.strictEqual(await page.locator(board(0) + ' .kt-onhat').count(), 1, 'the egg lands on her hat');
    await page.waitForFunction(() => MG.current.api.boards[0].done, null, { timeout: 5000 });
  }

  // --- 9. every size, both ways round: menu, a work beat, fetch, pick, and the present with a full shelf
  for (const vp of ['small', 'phone', 'phoneWide', 'tabletTall', 'tablet']) {
    const dark = vp === 'phoneWide' || vp === 'tablet', rm = vp === 'tabletTall';
    const p = await newPage(t, { viewport: vp, dark, reducedMotion: rm });
    await openKitchen(p, { kitchen: { done: 13 } });
    assert.strictEqual(await p.locator('.g-kitchen .kt-card').count(), 8);
    await layoutChecks(t, p, `@${vp} menu`);
    await t.shot(p, `${ID}-${vp}-menu.png`);
    await startAt(p, 'campur', 0);
    await layoutChecks(t, p, `@${vp} work beat`);
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
    await startAt(p, 'ceplok', 4);
    await tapJob(p, 0); await tapJob(p, 1);
    await p.waitForSelector('.g-kitchen .kt-gift.is-open', { timeout: 4000 });
    await p.waitForTimeout(600);
    await layoutChecks(t, p, `@${vp} present`, { shelf: 13 });
    await t.shot(p, `${ID}-${vp}-gift.png`);
  }

  // --- 10. turning the phone mid-fry and mid-merge changes nothing
  {
    page = await newPage(t, { viewport: 'phone' });
    await openKitchen(page);
    await startAt(page, 'ceplok', 1);
    await page.waitForTimeout(600);
    const before = await boards(page);
    await page.setViewportSize(h.VIEWPORTS.phoneWide);
    await page.waitForTimeout(300);
    const after = await boards(page);
    assert.deepStrictEqual([await api(page, 'beat'), after[0].phase, after[0].k, after[1].k], [1, before[0].phase, before[0].k, before[1].k], 'turned mid-fry: same step, same progress');
    assert.ok(after[0].heat >= before[0].heat, 'and it kept cooking');
    await layoutChecks(t, page, 'after turning mid-fry');
    await startAt(page, 'ceplok', 2).catch(() => {});
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
  {
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

  // --- 12. help and options: help Lots makes her jobs short (never the grown-up's); Short drops the extra beat; Few/Lots
  {
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
    assert.ok(short.length === 4 && short.every((x) => !x.extra), 'Short leaves out the extra beat');
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
