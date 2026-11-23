/* Little Kitchen: two boards, one dish. The rules and the data hold; a round plays with real taps; following only
   the ghost hand cooks every recipe; mashing, rotating and damaged saves never break it; every size fits. */
'use strict';
const fs = require('fs');
const path = require('path');
const h = require('./harness');
const ID = 'kitchen';
const KEY = 'mg:game:kitchen:kitchen';

// Appendix A of the spec: every emoji the game may use (all Unicode 11 or older)
const ALLOWED = [...'🍳🍌🍛🍢🍲🥞🍧🎂🍰🥚🥒🍅🍚🍶🍯🥛🧀🍫🍓🥬🥕🍗🥜🍙🍋🥔🥦💧🧂🍉🥭🥥❄🍈🍊🌶🍘🚰🔪🥄🔥💦✨💨♨💕⭐✔👋🎁💡🏮🌷🏅😋🤤😍🥰🥶🐈🐔🐣📻🌿🌻🧺🍵🏺🎐🍍🐇💪' +
  '🍜🥣🥗🍕🍩🥤🍮🍦🍨🥟🍤🦐🌭🌽🥑🍬🍒🌀🍞🍭'];

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
/** The colour really painted on screen at (x, y): a 1x1 screenshot, decoded in the page. */
async function pixelAt(page, x, y) {
  const png = await page.screenshot({ clip: { x: Math.round(x), y: Math.round(y), width: 1, height: 1 } });
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    return [...g.getImageData(0, 0, 1, 1).data].slice(0, 3);
  }, png.toString('base64'));
}
const rgbOf = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const near = (a, b, tol = 14) => a.every((v, i) => Math.abs(v - b[i]) <= tol);
/** What the dish's liquid really looks like: the pixel 30% down the middle of .kt-liq (above the front of a pot or a
 *  bowl), with what floats in it and the stir streaks hidden for that moment (they sit above the liquid on purpose;
 *  this checks that the vessel's own inside does not paint over it). Also its inside colour, for the message. */
async function liquidPixel(page) {
  const at = await page.evaluate(() => {
    const n = document.querySelector('.g-kitchen .kt-liq'), r = n.getBoundingClientRect();
    const st = document.createElement('style');
    st.id = 'kt-px';
    st.textContent = '.g-kitchen .kt-contents, .g-kitchen .kt-swirl, .g-kitchen .kt-ghost { visibility: hidden !important; }';
    document.head.appendChild(st);
    return { x: r.left + r.width / 2, y: r.top + r.height * 0.3, inside: getComputedStyle(n.parentElement, '::after').backgroundColor };
  });
  await page.waitForTimeout(50);
  const px = await pixelAt(page, at.x, at.y);
  await page.evaluate(() => document.querySelector('#kt-px').remove());
  return { px, inside: at.inside.match(/\d+/g).slice(0, 3).map(Number) };
}
/** Wait until the menu's cards have popped in (they start small: a size check must wait for them). */
const settledMenu = (page) => page.waitForFunction(() => ![...document.querySelectorAll('.g-kitchen .kt-card, .g-kitchen .kt-next, .g-kitchen .kt-tab')].some((n) => n.getAnimations().some((a) => a.playState === 'running')), null, { timeout: 4000 });
/** Tap a menu tab and wait until its page has popped in. */
async function openTab(page, g) { await tap(page, `.g-kitchen .kt-tab[data-group="${g}"]`, 60); await settledMenu(page); }
const FULL = { v: 2, done: 21, legacy: 0 };
/** Wait until the new jobs have finished sliding in from the boards' outer edges. */
const settled = (page) => page.waitForFunction(() => ![...document.querySelectorAll('.g-kitchen .kt-board *')].some((n) => n.getAnimations().some((a) => /^kt-(in-l|in-r|pop-in)$/.test(a.animationName) && a.playState === 'running')), null, { timeout: 4000 });
/** Per recipe: each fry, crack, skewer or (non-base) roll result that lands in the dish ('mid') after the last time
 *  the dish is cleared (`keep`), and how many of what she picked are still in it at the end (`picks`: 3, or 0 when a
 *  serve or a blend comes after her pick). Fry results on a cone are scoops, not pieces. */
const keptOf = (page) => A(page, (a) => {
  const out = {}, picks = {};
  a.MENU.forEach((id) => {
    const R = a.RECIPES[id];
    let kind = R.vessel, keep = [], pk = 0;
    a.beatsFor(R, 'full').slice(0, -1).forEach((bt) => {
      if (bt.serve) { kind = bt.serve; keep = []; pk = 0; }                // served onto a new plate
      [bt.a, bt.b].forEach((j) => {
        if (j.do === 'pick') pk = 3;
        if (j.to !== 'mid' || kind === 'cake' || (j.do === 'fry' && kind === 'cone')) return;
        if (['fry', 'crack', 'skewer'].includes(j.do) || (j.do === 'roll' && !j.base)) keep.push(j.do === 'crack' ? 'yolk' : a.resultOf(j));
      });
      const stir = ['stir', 'blend'].includes(bt.a.do) || ['stir', 'blend'].includes(bt.b.do);
      if (stir && R.mix && kind !== 'pot') keep = [];                     // stirred smooth on purpose (what she chose stays)
      if (bt.a.do === 'blend' || bt.b.do === 'blend') pk = 0;             // blended: everything
    });
    out[id] = keep;
    picks[id] = pk;
  });
  return { keep: out, picks };
});
/** Is every item of `want` in `have` (as many times)? */
const within = (want, have) => { const h = (have || []).slice(); return want.every((e) => { const i = h.indexOf(e); if (i < 0) return false; h.splice(i, 1); return true; }); };
// MG_KT_ONLY=2,9 runs only those numbered parts of this file (a debugging aid; unset, everything runs)
const ONLY = process.env.MG_KT_ONLY ? process.env.MG_KT_ONLY.split(',') : null;
const part = (n) => !ONLY || ONLY.includes(String(n));

/** Follow only the ghost hand until the round is won. Watches where the hand points on the way. */
function followHand(page, max = 400, pauseFor = [], o = {}) {
  return page.evaluate(async ([max, pauseFor, opt]) => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    let id = 40000 + Math.floor(Math.random() * 1000) * 100, steps = 0, herOk = true, picked = null, last = null, pickAt = null;
    const bad = [];
    const objNow = () => getComputedStyle(document.querySelector('.g-kitchen')).getPropertyValue('--obj').trim();
    for (; steps < max && MG.current && !MG.current.ctx.over; steps++) {
      const a = MG.current.api;
      // the start of the last beat: what is in the dish, and the size of the job objects
      if (!last && a.state === 'beat' && a.beat === a.beats.length - 1) {
        const v = a.vessel;
        last = { contents: v.contents, obj: objNow(), picks: v.picks, scoops: v.scoops, base: v.base, baked: v.baked };
        if (pauseFor.includes(a.recipe)) return { paused: true, steps, bad, herOk, picked, last, pickAt, recipe: a.recipe };   // (the caller looks, then calls again)
      }
      a.hintNext();
      const n = a.hinted;
      if (!n) { await sleep(50); continue; }
      if (a.state === 'menu' && n.dataset.id) picked = n.dataset.id;
      if (opt.noTabs && n.classList.contains('kt-tab')) bad.push('a tab (the open tab holds the dish)');
      if (pickAt === null && n.classList.contains('kt-bowl') && !n.closest('.kt-bowls').querySelector('.is-chosen')) pickAt = n.dataset.i;
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
    return { steps, bad, herOk, picked, last, pickAt, objEnd: objNow(), over: !!(MG.current && MG.current.ctx.over), recipe: MG.current && MG.current.api.recipe };
  }, [max, pauseFor, o]);
}

/** Every layout rule for what is on screen now. */
async function layoutChecks(t, p, label, o = {}) {
  const { assert } = t;
  await settledMenu(p);
  const targets = '.g-kitchen .kt-board, .g-kitchen .kt-jar, .g-kitchen .kt-bowl:not(.is-gone), .g-kitchen .kt-card, .g-kitchen .kt-next, .g-kitchen .kt-tab';
  const visible = (sel) => p.evaluate((sel) => [...document.querySelectorAll(sel)].filter((n) => n.offsetParent && getComputedStyle(n).visibility !== 'hidden').length, sel);
  if (await visible(targets)) {
    const min = (await t.minTargetSize(p, targets)).min;
    assert.ok(min >= 64, `targets at least 64px ${label}: ${min}`);
  }
  if (await visible('.g-kitchen .kt-card')) { const m = (await t.minTargetSize(p, '.g-kitchen .kt-card')).min; assert.ok(m >= 80, `menu cards at least 80px ${label}: ${m}`); }
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
    pairs(rects('.g-kitchen .kt-tab, .g-kitchen .kt-card, .g-kitchen .kt-next'));
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

/** Every part of each job (the object and its knife, spoon, faucet...) stays inside its board, give or take 4px;
 *  the dish's cone and scoops stay inside the wall. */
async function jobsInside(t, p, label) {
  const bad = await p.evaluate(() => {
    const out = [];
    document.querySelectorAll('.g-kitchen .kt-board').forEach((bd) => {
      const B = bd.getBoundingClientRect();
      bd.querySelectorAll('.kt-main .kt-obj, .kt-main .kt-obj *').forEach((n) => {
        const q = n.getBoundingClientRect();
        if (!q.width && !q.height) return;
        // (the rolling pin's handles are its ::before and ::after, 0.1em past each end)
        const hx = n.classList.contains('kt-pin') ? n.closest('.kt-obj').offsetWidth * 0.1 : 0;
        const r = { left: q.left - hx, right: q.right + hx, top: q.top, bottom: q.bottom };
        const o = Math.max(B.left - r.left, r.right - B.right, B.top - r.top, r.bottom - B.bottom);
        if (o > 4) out.push(`${bd.dataset.verb}: ${n.getAttribute('class') || n.tagName} ${o.toFixed(1)}px out`);
      });
    });
    const W = document.querySelector('.g-kitchen .kt-wall').getBoundingClientRect();
    document.querySelectorAll('.g-kitchen .kt-vfront svg, .g-kitchen .kt-contents .kt-scoop').forEach((n) => {
      const r = n.getBoundingClientRect(), o = Math.max(W.left - r.left, r.right - W.right, W.top - r.top, r.bottom - W.bottom);
      if (o > 4) out.push(`the dish: ${n.getAttribute('class') || n.tagName} ${o.toFixed(1)}px out of the wall`);
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
      const fresh = { v: 2, done: 0, legacy: 0, cooked: {}, made: {}, chicks: 0, seen: [] };
      const rules = [];
      const FIX = /^#[0-9A-F]{6}$/i;
      a.MENU.forEach((id) => {
        const R = a.RECIPES[id], beats = R.beats, last = beats[beats.length - 1];
        const pickAt = beats.findIndex((bt) => bt.a.do === 'pick');
        const pk = pickAt >= 0 ? beats[pickAt].a : null;
        beats.forEach((bt, i) => {
          if (!bt.a || !bt.b || !a.VERBS[bt.a.do] || !a.VERBS[bt.b.do]) rules.push(`${id}:${i} has both jobs, known verbs`);
          if (bt.a.do === 'fetch') rules.push(`${id}:${i} a never fetches`);
          if (bt.b.do === 'pick') rules.push(`${id}:${i} b never picks`);
          if (bt.extra && [bt.a, bt.b].some((j) => j.to === 'stay' || j.to === 'across')) rules.push(`${id}:${i} an extra beat hands nothing on`);
          if (bt.extra && i > 0 && [beats[i - 1].a, beats[i - 1].b].some((j) => j.to === 'stay' || j.to === 'across')) rules.push(`${id}:${i} an extra beat is never handed anything`);
          [bt.a, bt.b].forEach((j) => {
            const toks = [j.e, j.liquid, j.dots].filter((v) => v === '$' || v === '$c');
            if (toks.length && i <= pickAt) rules.push(`${id}:${i} '$' only after the pick`);
            if ([j.liquid, j.dots].includes('$c') && !(pk && pk.paint)) rules.push(`${id}:${i} '$c' needs paint`);
            if (j.prop === 'fridge' && j.end !== 'out') rules.push(`${id}:${i} a fridge ends 'out'`);
            if ((j.e === 'jelly' || j.e === 'scoop') && j.prop !== 'fridge') rules.push(`${id}:${i} a jelly or a scoop comes from the fridge`);
            if (j.base && !(j.do === 'roll' && j.to === 'mid' && R.vessel === 'pizza')) rules.push(`${id}:${i} a base is rolled onto the pizza peel`);
          });
        });
        const end = id === 'cake' ? 'blow' : 'taste';
        if (last.a.do !== end || last.b.do !== end) rules.push(`${id} ends with ${end}`);
        const extras = beats.map((b, i) => (b.extra ? i : -1)).filter((i) => i >= 0);
        const nx = id === 'ceplok' ? 2 : 1;   // Telur Ceplok has one more real step
        if (extras.length !== nx || extras[0] === 0 || extras[extras.length - 1] === beats.length - 1) rules.push(`${id} has ${nx} extra beat(s) in the middle`);
        if (extras.includes(pickAt)) rules.push(`${id}: the pick is never extra`);
        if (beats.length > 6) rules.push(`${id} has at most six steps`);
        const serves = beats.filter((b) => b.serve);
        if (serves.length > 1 || serves.some((b) => !['plate', 'cake', 'cone'].includes(b.serve))) rules.push(`${id} serves once at most, onto a plate, cake or cone`);
        if (R.bake && R.vessel !== 'pizza') rules.push(`${id}: only a pizza bakes`);
        // exactly one pick, hers, not extra; three different choices; paint is three colours
        const picks = beats.reduce((n, bt) => n + [bt.a, bt.b].filter((j) => j.do === 'pick').length, 0);
        if (picks !== 1 || !pk) rules.push(`${id} has exactly one pick, on her side`);
        if (pk && (pk.choices.length !== 3 || new Set(pk.choices).size !== 3)) rules.push(`${id}: three different choices`);
        if (pk && pk.paint && (pk.paint.length !== 3 || !pk.paint.every((c) => FIX.test(c)))) rules.push(`${id}: paint is three colours`);
        if (R.mix === '$c') {
          const firstStir = beats.findIndex((bt) => ['stir', 'blend'].includes(bt.a.do) || ['stir', 'blend'].includes(bt.b.do));
          if (!(pk && pk.paint) || firstStir < pickAt) rules.push(`${id}: a mix in her colour is stirred after she chooses`);
        }
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
      // the menu data: every recipe in exactly one group of at most 8; 16 unique ids and dish emoji; every gift once
      const inGroups = a.GROUPS.reduce((o, g) => { g.ids.forEach((id) => { o[id] = (o[id] || 0) + 1; }); return o; }, {});
      if (a.GROUPS.some((g) => g.ids.length > 8) || Object.keys(a.RECIPES).some((id) => inGroups[id] !== 1)) rules.push('every dish is in exactly one group of at most 8');
      if (new Set(a.MENU).size !== 16 || a.MENU.length !== 16 || new Set(a.MENU.map((id) => a.RECIPES[id].e)).size !== 16) rules.push('16 dishes, each its own emoji');
      const fresh21 = [...Array(21).keys()].map((i) => a.giftFor(i, 0));
      const recs = fresh21.filter((g) => g.kind === 'recipe').map((g) => g.id).sort();
      if (JSON.stringify(recs) !== JSON.stringify(a.MENU.filter((id) => !['ceplok', 'pisang'].includes(id)).sort())) rules.push('the gift list holds every new dish once');
      if (JSON.stringify(fresh21.filter((g) => g.kind === 'helper').map((g) => g.id).sort()) !== '["cat","hen","herbs","radio"]') rules.push('every helper once');
      if (JSON.stringify(fresh21.filter((g) => g.kind === 'tier').map((g) => g.n)) !== '[1,2,3]') rules.push('tiers 1 to 3 once');
      // at most 5 kept things per dish (so there is always room for chopped pieces)
      const ns = [], fixed = [];
      a.MENU.forEach((id) => a.RECIPES[id].beats.forEach((bt) => ['a', 'b'].forEach((s) => ['few', 'normal', 'lots'].forEach((tp) => [0, 1, 2].forEach((hp) => {
        const j = bt[s], n = a.nFor(j, hp, tp);
        ns.push(n);
        if (a.VERBS[j.do].fixed != null && n !== a.VERBS[j.do].fixed) fixed.push(j.do);
      })))));
      const kit = (raw) => a.cleanKitchen(raw);
      // nothing is ever lost: whatever a save had, it keeps; every save reaches everything
      const lost = [];
      const holds = (big, small) => small.recipes.every((x) => big.recipes.includes(x)) && Object.keys(small.helpers).every((x) => big.helpers[x]) && big.tier >= small.tier
        && small.decor.every((x) => big.decor.includes(x)) && Object.keys(small.medals).every((m) => (big.medals[m] || 0) >= small.medals[m]);
      for (let d = 0; d <= 40; d++) {
        const base = a.unlocks(d, d);
        let prev = base;
        for (let k = 0; k <= 60; k++) {
          const u = a.unlocks(d + k, d);
          if (!holds(u, base)) lost.push(`${d}+${k} lost what the save had`);
          if (!holds(u, prev)) lost.push(`${d}+${k} lost what it had a dish before`);
          prev = u;
        }
        const end = a.unlocks(d + 60, d);
        if (end.recipes.length !== 16 || Object.keys(end.helpers).length !== 4 || end.tier !== 3 || end.decor.length !== 6 || a.MENU.some((id) => end.medals[id] !== 2)) lost.push(`${d}: everything within 60 dishes`);
      }
      const ks = (g) => g.kind + ':' + (g.id || g.n || g.e);
      return {
        rules, lost: lost.slice(0, 5), ns: [Math.min(...ns), Math.max(...ns)], fixed,
        fixedN: { fetch: a.nFor({ do: 'fetch' }, 2, 'lots'), fry: a.nFor({ do: 'fry' }, 0, 'few'), taste: a.nFor({ do: 'taste' }, 0, 'lots'), scoop: a.nFor({ do: 'scoop' }, 2, 'lots'), skewer: a.nFor({ do: 'skewer' }, 0, 'few'), garnish: a.nFor({ do: 'garnish' }, 0, 'lots'), pick: a.nFor({ do: 'pick' }, 1, 'few'), blow: a.nFor({ do: 'blow' }, 2, 'lots') },
        variable: ['roll', 'blend'].map((v) => [0, 1, 2].map((hp) => ['few', 'normal', 'lots'].map((tp) => a.nFor({ do: v, n: 4 }, hp, tp))).flat()).flat(),
        bad: [null, 'x', [1, 2, 3], { done: 'abc' }, { done: true }, { done: '' }, { done: NaN }].map((v) => JSON.stringify(kit(v)) === JSON.stringify(fresh)),
        junk: kit({ done: 5, cooked: { rock: 3, sate: 'x', ceplok: 99999 }, chicks: 99, seen: ['fly', 7, 'crack', 'crack', 'roll', 'fridge'] }),
        v13: kit({ v: 1, done: 13, cooked: { ceplok: 1, sop: 2 } }),
        v21: kit({ v: 2, done: 21, legacy: 0, cooked: { jus: 1 }, made: { jus: 5, rock: 1, pizza: 99 } }),
        clampL: kit({ v: 2, done: 3, legacy: 9 }).legacy,
        early: kit({ v: 2, done: 0, legacy: 0, cooked: { pizza: 2 }, made: { pizza: 1 } }),
        big: kit({ done: 1e9, chicks: -4 }),
        v1: [...Array(36).keys()].map((i) => ks(a.giftV1(i))),
        u0: a.unlocks(0, 0), u1: a.unlocks(1, 0), u21: a.unlocks(21, 0), u27: a.unlocks(27, 0).decor.length, u59: a.unlocks(59, 0).medals,
        l13: a.unlocks(13, 13), l21: a.unlocks(21, 13).recipes.length, l30: a.unlocks(30, 30), l38: a.unlocks(38, 30),
        gifts: [...Array(21).keys()].map((i) => ks(a.giftFor(i, 0))),
        later: [a.giftFor(21, 0).kind, a.giftFor(26, 0).kind, ks(a.giftFor(27, 0)), ks(a.giftFor(58, 0)), a.giftFor(59, 0).kind, a.giftFor(500, 0).kind],
        GIFTS: a.GIFTS, LIST: a.LIST, tuning: a.tuning,
        full: a.MENU.map((id) => a.beatsFor(a.RECIPES[id], 'full').length),
        cut: a.MENU.map((id) => a.beatsFor(a.RECIPES[id], 'full').length - a.beatsFor(a.RECIPES[id], 'short').length),
        menu: a.MENU,
      };
    });
    assert.deepStrictEqual(r.menu, ['ceplok', 'goreng', 'sate', 'sop', 'mie', 'bubur', 'gado', 'pizza', 'pisang', 'martabak', 'cake', 'donat', 'campur', 'jus', 'puding', 'eskrim'], 'sixteen dishes, in group order');
    assert.deepStrictEqual(r.full, [6, 6, 6, 6, 6, 6, 6, 5, 6, 6, 6, 6, 6, 6, 6, 6], 'six steps a dish (Full), five for the pizza');
    assert.deepStrictEqual(r.cut, [2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], 'Short leaves out two steps of Telur Ceplok, one of every other dish');
    assert.deepStrictEqual(r.rules, [], 'every recipe keeps the data rules');
    const kept = await keptOf(page);
    assert.ok(Object.entries(kept.keep).every(([id, k]) => k.length + kept.picks[id] <= 5), 'at most five kept things in any dish: ' + JSON.stringify(kept));
    assert.deepStrictEqual(r.lost, [], 'no save ever loses anything, and every save reaches everything');
    assert.ok(r.ns[0] >= 1 && r.ns[1] <= 8, `taps per job stay between 1 and 8 (${r.ns})`);
    assert.ok(r.variable.every((n) => n >= 1 && n <= 8) && new Set(r.variable).size > 1, 'rolling and blending follow the Taps option and help');
    assert.deepStrictEqual(r.fixed, [], 'fixed jobs never change');
    assert.deepStrictEqual(r.fixedN, { fetch: 1, fry: 1, taste: 1, scoop: 2, skewer: 3, garnish: 3, pick: 3, blow: 3 });
    assert.ok(r.bad.every(Boolean), 'nonsense becomes a fresh kitchen: ' + r.bad);
    assert.deepStrictEqual([r.junk.done, r.junk.legacy, r.junk.cooked, r.junk.made, r.junk.chicks, r.junk.seen], [5, 5, { ceplok: 999 }, { ceplok: 7 }, 3, ['crack', 'roll', 'fridge']], 'a v1 junk save is repaired and keeps what it had');
    assert.deepStrictEqual([r.v13.legacy, r.v13.made], [13, { ceplok: 1, sop: 3 }], 'a v1 save: as many variant marks as it had stars');
    assert.deepStrictEqual(r.v21.made, { jus: 5, pizza: 7 }, 'a v2 save keeps its marks (clamped)');
    assert.strictEqual(r.clampL, 3, 'legacy is never more than done');
    assert.deepStrictEqual([r.early.cooked, r.early.made], [{}, {}], 'a dish not yet earned is dropped');
    assert.deepStrictEqual([r.big.done, r.big.legacy, r.big.chicks], [9999, 9999, 0]);
    // v1 is frozen
    assert.deepStrictEqual(r.v1.slice(0, 13), ['recipe:goreng', 'helper:cat', 'recipe:sate', 'tier:1', 'recipe:sop', 'helper:hen', 'recipe:martabak', 'tier:2', 'recipe:campur', 'helper:radio', 'recipe:cake', 'tier:3', 'helper:herbs'], 'the v1 gift list is unchanged');
    assert.deepStrictEqual([r.v1[13].split(':')[0], r.v1[18].split(':')[0], r.v1[19], r.v1[34], r.v1[35].split(':')[0]], ['decor', 'decor', 'medal:ceplok', 'medal:cake', 'thanks']);
    // new kitchens
    assert.deepStrictEqual([r.u0.recipes, r.u0.next, r.u0.nextIn], [['ceplok', 'pisang'], 'goreng', 1], 'a new kitchen: two dishes, nasi goreng next');
    assert.deepStrictEqual([r.u1.recipes, r.u1.next, r.u1.nextIn], [['ceplok', 'goreng', 'pisang'], 'pizza', 2], 'then the cat, then pizza');
    assert.deepStrictEqual([r.u21.recipes.length, Object.keys(r.u21.helpers).length, r.u21.tier, r.u21.next], [16, 4, 3, null], 'twenty-one dishes: everything open');
    assert.strictEqual(r.u27, 6, 'then six shelf decorations');
    assert.ok(Object.keys(r.u59).length === 16 && Object.values(r.u59).every((n) => n === 2), 'then two gold medals for every dish');
    // old kitchens
    assert.deepStrictEqual([r.l13.recipes.slice().sort(), Object.keys(r.l13.helpers).length, r.l13.tier, r.l13.next, r.l13.nextIn], [['cake', 'campur', 'ceplok', 'goreng', 'martabak', 'pisang', 'sate', 'sop'], 4, 3, 'pizza', 1], 'a full v1 kitchen keeps everything; pizza next');
    assert.strictEqual(r.l21, 16, 'and eight dishes later it has all sixteen');
    assert.deepStrictEqual([r.l30.medals, r.l30.decor.length, r.l30.next], [{ ceplok: 2, pisang: 2, goreng: 2, sate: 1, sop: 1, martabak: 1, campur: 1, cake: 1 }, 6, 'pizza'], 'a v1 kitchen with medals keeps them');
    assert.deepStrictEqual([r.l38.recipes.length, r.l38.medals], [16, r.l30.medals], 'the new dishes come before any more medals');
    assert.deepStrictEqual(r.gifts, ['recipe:goreng', 'helper:cat', 'recipe:pizza', 'tier:1', 'recipe:sate', 'recipe:donat', 'helper:hen', 'recipe:sop', 'recipe:eskrim', 'tier:2', 'recipe:mie', 'recipe:martabak', 'helper:radio', 'recipe:jus', 'recipe:gado', 'tier:3', 'recipe:campur', 'recipe:puding', 'recipe:bubur', 'recipe:cake', 'helper:herbs']);
    assert.deepStrictEqual(r.later, ['decor', 'decor', 'medal:ceplok', 'medal:eskrim', 'thanks', 'thanks']);
    assert.deepStrictEqual([r.GIFTS, r.LIST], [21, 59]);
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
        // tasting: the fried egg she made is still in the dish, on top, not covered by the slices; and the bread she chose
        const v = await api(page, 'vessel');
        assert.ok(v.contents.includes('🍳') && v.kept.includes('🍳'), 'the fried egg is still in the dish when it is tasted: ' + v.contents.join(''));
        assert.deepStrictEqual(v.picks, ['🍞', '🍞', '🍞'], 'what she chose is still in the dish: ' + v.contents.join(''));
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
          const add = b.do === 'pick' && k === 0;
          if (add) await page.waitForFunction(() => ![...document.querySelectorAll('.g-kitchen .kt-contents .kt-piece')].some((n) => n.getAnimations().length), null, { timeout: 3000 });
          await tapJob(page, s, 1, 0);
          const now = (await boards(page))[s];
          assert.strictEqual(now.k, k + 1, `${b.do}: one tap, one step (${k + 1}/${b.n})`);
          if (add) {
            // what she chose drops in: only it plays the drop-in, nothing already in the dish jumps again
            await page.waitForFunction(() => [...document.querySelectorAll('.g-kitchen .kt-contents .kt-piece')].some((n) => n.textContent === '🍞'), null, { timeout: 3000 });
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
    assert.deepStrictEqual([sv.v, sv.legacy, sv.done, sv.cooked.ceplok, sv.made.ceplok], [2, 0, 1, 1, 2], 'saved the moment the dish is finished, with the bread she chose');
    assert.ok(sv.seen.includes('crack') && sv.seen.includes('fry') && sv.seen.includes('taste'), 'her new jobs are remembered');
    assert.strictEqual(await api(page, 'locked'), false, 'never locked');
    await page.waitForSelector('.g-kitchen .kt-gift.is-open', { timeout: 4000 });
    assert.ok(await page.locator('.g-kitchen .kt-gift .kt-minicard').count(), 'the present is a new recipe card');
    await t.waitForWin(page, 8000);
    await openKitchen(page, { keep: true });
    const cards = await page.evaluate(() => [...document.querySelectorAll('.g-kitchen .kt-card')].map((c) => c.dataset.id + ':' + c.dataset.made + (c.classList.contains('is-new') ? '+new' : '')));
    assert.deepStrictEqual(cards, ['ceplok:2', 'goreng:0+new', 'pisang:0+new'], 'the menu, in group order: the bread is marked on the fried egg, new nasi goreng');
    assert.deepStrictEqual(await page.evaluate(() => [...document.querySelectorAll('.g-kitchen .kt-card[data-id="ceplok"] .kt-card__v.is-made')].map((n) => n.dataset.i)), ['1'], 'one mark lit: the bread');
    assert.ok(await page.evaluate(() => { const r = document.querySelector('.g-kitchen .kt-rail'); return !r.offsetParent || !r.getBoundingClientRect().width; }), 'three dishes: one page, no tabs');
    assert.deepStrictEqual(await page.evaluate(() => [document.querySelector('.g-kitchen .kt-next .kt-next__dish').textContent, document.querySelectorAll('.g-kitchen .kt-next__dots i').length]), ['🍕', 2], 'pizza is the next present but one (the cat comes first)');
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
    const { keep, picks } = await keptOf(page);
    assert.deepStrictEqual([keep.ceplok, keep.pisang, keep.sate, keep.martabak, keep.gado, keep.donat, keep.puding, keep.eskrim], [['🍳'], ['🍌', '🍌'], ['🍢', '🍢'], ['🥞', '🥞'], ['yolk'], ['🍩', '🍩'], ['jelly', 'jelly'], []], 'what is fried, cracked, skewered or chilled (and stays)');
    assert.deepStrictEqual([picks.ceplok, picks.goreng, picks.jus, picks.puding, picks.eskrim], [3, 3, 0, 0, 0], 'what she chose stays, unless it is served or blended after');
    const done = [];
    for (let round = 0; round < 16; round++) {
      if (round) await openKitchen(page, { keep: true, scale: 8 });
      // (the fried egg of round one stays made: the hand cooks every dish once, choosing what was never made)
      if (round === 1) assert.ok(await A(page, (a) => a.setKitchen({ v: 2, done: 21, legacy: 0, cooked: { ceplok: 1 }, made: { ceplok: 1 } })), 'every dish open');
      let r = await followHand(page, 400, ['sop', 'campur', 'ceplok'], { noTabs: true });
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
        const rest = await followHand(page, 400, [], { noTabs: true });
        r = { ...rest, steps: r.steps + rest.steps, bad: r.bad.concat(rest.bad), herOk: r.herOk && rest.herOk, last: r.last, pickAt: r.pickAt !== null ? r.pickAt : rest.pickAt };
      }
      assert.ok(r.over, `round ${round + 1} (${r.recipe}) is won by following the hand alone (${r.steps} steps)`);
      assert.deepStrictEqual(r.bad, [], 'the hand only ever points at something that moves the round on');
      assert.ok(r.herOk, 'while her board is unfinished, the hand is on her board');
      // the main thing they cooked is still in the dish when it is tasted (the full dish gives way to extra slices instead)
      assert.ok(r.last && within(keep[r.recipe], r.last.contents), `${r.recipe}: at the last step the dish still holds ${keep[r.recipe].join('')} (${r.last && r.last.contents})`);
      assert.strictEqual(r.pickAt, '0', `${r.recipe}: nothing made yet, so the hand shows the first bowl`);
      assert.strictEqual(r.last.picks.length, picks[r.recipe], `${r.recipe}: what she chose is in the dish at the end (${r.last.picks})`);
      if (r.recipe === 'eskrim') assert.strictEqual(r.last.scoops.length, 2, 'two scoops on the cone');
      if (r.recipe === 'pizza') assert.ok(r.last.base && r.last.baked, 'the pizza has its base and is baked');
      // and the present opening (a new helper, decoration or kitchen) never shrinks the job objects
      assert.strictEqual(r.objEnd, r.last.obj, `${r.recipe}: the job objects keep their size when the present opens`);
      done.push(r.recipe);
      await t.waitForWin(page, 5000);
    }
    assert.deepStrictEqual(done.slice().sort(), (await api(page, 'MENU')).slice().sort(), 'the hand chose each dish once: ' + done);
    const mk = (await api(page, 'kitchen')).made;
    assert.ok((await api(page, 'MENU')).every((id) => mk[id] & 1), 'and made the first choice of every dish: ' + JSON.stringify(mk));
  }

  // --- 4. mashing: four fingers everywhere never break anything
  if (part(4)) {
    const full = { v: 2, done: 21, legacy: 0 };
    // a finger on a card of a closed tab and one on each tab, in one frame: no dish starts, one tab opens (the rest
    // of the tab taps come within 150ms and only squash)
    await openKitchen(page, { kitchen: full, scale: 1 });
    assert.strictEqual(await api(page, 'tab'), 'sweet', 'the newest dish never cooked (the cake) opens the sweets tab');
    const tabs = await page.evaluate(() => {
      let id = 7100;
      const down = (n) => { const r = n.getBoundingClientRect(); n.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: ++id, pointerType: 'touch', clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })); };
      const card = document.querySelector('.g-kitchen .kt-card[data-id="ceplok"]');
      card.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: ++id, pointerType: 'touch', clientX: 0, clientY: 0 }));
      document.querySelectorAll('.g-kitchen .kt-tab').forEach(down);
      return [MG.current.api.state, document.querySelectorAll('.g-kitchen .kt-tab.is-on').length, MG.current.api.tab];
    });
    assert.deepStrictEqual(tabs, ['menu', 1, 'meal'], 'a hidden card and three tabs in one frame: no dish, the first tab opens, the rest squash');
    await openKitchen(page, { kitchen: full, scale: 1 });
    const one = await page.evaluate(() => {
      const ids = ['martabak', 'cake', 'donat', 'pisang'];
      ids.forEach((id, k) => {
        const n = document.querySelector(`.g-kitchen .kt-card[data-id="${id}"]`), r = n.getBoundingClientRect();
        n.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 7000 + k, pointerType: 'touch', clientX: r.left + 10, clientY: r.top + 10 }));
      });
      return [MG.current.api.state, MG.current.api.recipe, document.querySelectorAll('.g-kitchen .kt-card[aria-disabled="true"]').length];
    });
    assert.deepStrictEqual(one, ['deal', 'martabak', 16], 'four fingers on the menu at once: exactly one dish starts (and every card, hidden or not, is off)');
    await page.evaluate(() => { const t = document.querySelector('.g-kitchen .kt-tab[data-group="meal"]'), r = t.getBoundingClientRect(); t.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 7190, pointerType: 'touch', clientX: r.left + 5, clientY: r.top + 5 })); });
    assert.deepStrictEqual([await api(page, 'tab'), await api(page, 'state')], ['sweet', 'deal'], 'a tab tap once a dish is chosen does nothing');
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

  // --- 7. picking: every choice is right, three taps, the dish shows it; the kitchen remembers each one, and the hand
  //     and the sparkles lead her to the ones she has not made yet
  if (part(7)) for (const choice of [0, 1, 2]) {
    await openKitchen(page, { scale: 4, keep: choice > 0 });
    await page.evaluate(() => { const f = MG.current.ctx.fx, burst = f.__kt || (f.__kt = f.burst); window.__stars = 0;   // (fx is the shell's: wrap it once)
       f.burst = function (x, y, o) { if (o && o.emoji === '⭐' && o.count === 6) window.__stars++; return burst.apply(this, arguments); }; });   // (the party's own confetti has stars too)
    await startAt(page, 'pisang', 3);
    const pre = await A(page, (a) => { a.hintNext(); return [a.hinted && a.hinted.dataset.i, [...document.querySelectorAll('.g-kitchen .kt-bowl')].filter((n) => n.querySelector('.kt-bowl__new')).map((n) => n.dataset.i)]; });
    assert.strictEqual(pre[0], String(choice), `before she chooses, the hand shows the first choice not made yet (${pre[0]})`);
    assert.deepStrictEqual(pre[1], ['0', '1', '2'].slice(choice ? choice : 3), 'a sparkle on exactly the bowls never made (none the first time)');
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
    for (let k = 0, n = (await boards(page))[1].n; k < n; k++) { await tapJob(page, 1, 1, 0); await gameWait(page, 0.2); }   // (his condensed milk)
    await page.waitForFunction(() => MG.current.api.beat === 4);   // the meses and the honey
    await gameWait(page, 0.35);
    for (const s of [0, 1]) { const n = (await boards(page))[s].n; for (let k = 0; k < n; k++) { await tapJob(page, s, 1, 0); await gameWait(page, 0.2); } }
    await page.waitForFunction(() => MG.current.api.beat === 5);
    await gameWait(page, 0.35);
    await tapJob(page, 0); await tapJob(page, 1);
    await page.waitForSelector('.g-kitchen .kt-dish:not([hidden])', { timeout: 4000 });
    const e = await page.evaluate(() => document.querySelector('.g-kitchen .kt-dish').dataset.choice);
    assert.strictEqual(e, ['🧀', '🍫', '🍓'][choice], 'the finished dish shows what she chose');
    await t.waitForWin(page, 6000);
    assert.strictEqual((await api(page, 'kitchen')).made.pisang, [1, 3, 7][choice], 'the kitchen remembers each choice made');
    assert.strictEqual(await page.evaluate(() => window.__stars), choice === 2 ? 1 : 0, 'stars the first time all three are made');
  }
  if (part(7)) {
    await openKitchen(page, { keep: true });
    const card = await page.evaluate(() => { const c = document.querySelector('.g-kitchen .kt-card[data-id="pisang"]'); return [c.dataset.made, c.querySelectorAll('.kt-card__v.is-made').length, !!c.querySelector('.kt-card__star')]; });
    assert.deepStrictEqual(card, ['7', 3, true], 'the menu card: all three marks lit, and a star');
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
    // the full menu: three tabs, each page fits (the meals page holds eight)
    await openKitchen(p, { kitchen: FULL });
    assert.deepStrictEqual([await p.locator('.g-kitchen .kt-tab').count(), await api(p, 'tab')], [3, 'sweet'], `@${vp} three tabs; the cake's (sweets) is open`);
    for (const g of ['meal', 'sweet', 'cold']) {
      await openTab(p, g);
      const shown = await p.evaluate(() => [...document.querySelectorAll('.g-kitchen .kt-card')].filter((n) => n.offsetParent).length);
      if (g === 'meal') assert.strictEqual(shown, 8, `@${vp} the meals page shows eight dishes`);
      await layoutChecks(t, p, `@${vp} menu ${g}`);
      const tabMin = (await t.minTargetSize(p, '.g-kitchen .kt-tab')).min;
      assert.ok(tabMin >= 64, `@${vp} tabs at least 64px (${tabMin})`);
      await t.shot(p, `${ID}-${vp}-menu-${g}.png`);
    }
    // a full v1 kitchen: nine cells, so tabs at once; it opens on the cake's tab
    await openKitchen(p, { kitchen: { done: 13 } });
    assert.deepStrictEqual([await p.locator('.g-kitchen .kt-tab').count(), await api(p, 'tab')], [3, 'sweet'], `@${vp} a v1 kitchen: tabs, sweets open`);
    await openTab(p, 'meal');
    const meals = await p.evaluate(() => [[...document.querySelectorAll('.g-kitchen .kt-card')].filter((n) => n.offsetParent).length, document.querySelector('.g-kitchen .kt-next').offsetParent ? document.querySelector('.g-kitchen .kt-next__dish').textContent : null, document.querySelectorAll('.g-kitchen .kt-next__dots i').length]);
    assert.deepStrictEqual(meals, [4, '🍕', 1], `@${vp} its meals: four dishes and the pizza next (one dot)`);
    await layoutChecks(t, p, `@${vp} v1 menu meals`);
    // eight cells: one page, no tabs
    await openKitchen(p, { kitchen: { v: 2, done: 8, legacy: 0 } });
    const flat = await p.evaluate(() => [document.querySelector('.g-kitchen .kt-rail').offsetParent === null, [...document.querySelectorAll('.g-kitchen .kt-card, .g-kitchen .kt-next')].filter((n) => n.offsetParent).length]);
    assert.deepStrictEqual(flat, [true, 8], `@${vp} eight cells: one page`);
    await layoutChecks(t, p, `@${vp} menu of eight`);
    await t.shot(p, `${ID}-${vp}-menu.png`);
    await openKitchen(p, { kitchen: { done: 13 } });
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
    assert.strictEqual(await p.evaluate(() => { const c = document.querySelector('.g-kitchen .kt-gift .kt-minicard'); return c && c.textContent; }), '🍕✨', `@${vp} an old kitchen past the end of v1: the present is the pizza`);
    await layoutChecks(t, p, `@${vp} present`, { shelf: 13 });
    await t.shot(p, `${ID}-${vp}-gift.png`);
    if (vp === 'small' || vp === 'phoneWide') {
      // one beat of every job and prop, jumping straight there: everything fits and every job stays inside its board
      // (sate's pound and pick are met again in the pizza and the donuts)
      const sweep = [['ceplok', [1, 5]], ['sate', [1, 2]], ['cake', [2, 5]], ['goreng', [2, 3, 4]], ['sop', [0]],
        ['donat', [2, 3, 4]], ['pizza', [0, 1, 2]], ['jus', [0, 1, 3, 4]], ['puding', [2]], ['eskrim', [3, 4]]];
      const seen = new Set();
      for (const [id, list] of sweep) {
        await openKitchen(p, { kitchen: FULL, scale: 4 });
        await A(p, (a, id) => a.start(id), id);
        await stateIs(p, 'beat');
        for (const i of list) {
          if (i) await A(p, (a, i) => a.jump(i), i);
          await p.waitForFunction((i) => MG.current.api.state === 'beat' && MG.current.api.beat === i, i, { timeout: 5000 });
          await settled(p);
          await gameWait(p, 0.35);                     // (a new job can be used once it has been seen for 0.3 game seconds)
          const bs = await boards(p);
          const label = `@${vp} ${id} beat ${i} (${bs.map((b) => b.do).join(' + ')})`;
          bs.forEach((b) => seen.add(b.do === 'fry' ? b.prop : b.do));
          await layoutChecks(t, p, label);
          await jobsInside(t, p, label);
          if (bs[0].prop === 'fridge') {
            // the fridge door swings open: still inside the board (at real speed, so the next step waits while we look)
            await p.evaluate(() => { MG.timeScale = 1; });
            await A(p, (a) => { a.cook(0); a.cook(1); });
            await gameWait(p, 0.5);
            await tapJob(p, 0, 1, 0); await tapJob(p, 1, 1, 400);
            assert.ok(await p.evaluate(() => document.querySelectorAll('.g-kitchen .kt-obj.is-out').length >= 1), 'the fridge opens ' + label);
            await jobsInside(t, p, `${label}, door open`);
            await p.evaluate(() => { MG.timeScale = 4; });
          }
          if (bs[0].do === 'roll') {
            // rolled flat and cut: the pin and its handles stay on the board
            for (let k = 0; k < bs[0].n; k++) { await tapJob(p, 0, 1, 0); await gameWait(p, 0.2); }
            await p.waitForTimeout(350);
            await jobsInside(t, p, `${label}, rolled`);
          }
          if (bs[0].do === 'stir') {
            // the spoon stays inside through a whole set of turns
            for (let k = 0; k < bs[0].n; k++) {
              await tapJob(p, 0, 1, 0);
              await gameWait(p, 0.2);
              await p.waitForTimeout(300);              // (the spoon turns over 0.25s of real time: measure it at rest)
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
      assert.deepStrictEqual([...seen].sort(), ['blend', 'blow', 'chop', 'crack', 'fetch', 'fridge', 'garnish', 'grill', 'oven', 'pan', 'peel', 'pick', 'pound', 'pour', 'roll', 'scoop', 'shake', 'skewer', 'stir', 'taste', 'wash'], 'the sweep met every job and prop');
      // the pizza goes into the oven in the middle: the door covers the dish and stays in view
      await openKitchen(p, { kitchen: FULL, scale: 4 });
      await A(p, (a) => a.start('pizza'));
      await stateIs(p, 'beat');
      await A(p, (a) => a.jump(3));
      const baking = await p.evaluate(async () => {
        const a = MG.current.api, t0 = performance.now();
        let id = 47000;
        while (performance.now() - t0 < 8000 && !document.querySelector('.g-kitchen .kt-vessel.is-baking')) {
          if (a.state === 'beat') { a.hintNext(); const n = a.hinted; if (n) { const r = n.getBoundingClientRect(), o = { bubbles: true, pointerId: ++id, pointerType: 'touch', clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }; n.dispatchEvent(new PointerEvent('pointerdown', o)); n.dispatchEvent(new PointerEvent('pointerup', o)); } }
          await new Promise((r) => setTimeout(r, 30));
        }
        return !!document.querySelector('.g-kitchen .kt-vessel.is-baking');
      });
      assert.ok(baking, `@${vp} following the hand puts the pizza in the oven`);
      await p.waitForTimeout(120);
      const door = await p.evaluate(() => { const v = document.querySelector('.g-kitchen .kt-vessel').getBoundingClientRect(), d = document.querySelector('.g-kitchen .kt-ovendoor').getBoundingClientRect(); return Math.max(v.left - d.left, d.right - v.right, v.top - d.top, d.bottom - v.bottom); });
      assert.ok(door <= 4, `@${vp} the oven door sits on the dish (${door.toFixed(1)}px out)`);
      assert.deepStrictEqual(await t.outsidePlayArea(p, '.g-kitchen .kt-ovendoor, .g-kitchen .kt-vessel'), [], `@${vp} the oven stays in view`);
      await t.shot(p, `${ID}-${vp}-bake.png`);
      await p.waitForFunction(() => MG.current.api.vessel.baked, null, { timeout: 5000 });
    }
    if (vp === 'small') {
      // the small phone turned on its side (568x320): every page of the full menu still has big cards
      await p.setViewportSize({ width: 568, height: 320 });
      await openKitchen(p, { kitchen: FULL });
      for (const g of ['meal', 'sweet', 'cold']) { await openTab(p, g); await layoutChecks(t, p, `@568x320 menu ${g}`); }
      await t.shot(p, `${ID}-568x320-menu.png`);
      await p.setViewportSize(h.VIEWPORTS.small);
      // ... and with a six-step dish: the step stickers stay on the wall, the jobs fit
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
    assert.strictEqual(await page.evaluate(() => document.querySelector('.g-kitchen .kt-card[data-id="ceplok"]').dataset.made), '7', 'old stars become as many marks (three at most)');
    // saves made before the bigger menu (v1): every one opens with everything it had, its medals, and a new dish next
    for (const [done, cards, medals, next, shelf] of [[0, 2, 0, '🍛', 0], [5, 5, 0, '🍕', 1], [13, 8, 0, '🍕', 4], [30, 8, 11, '🍕', 10], [40, 8, 16, '🍕', 10]]) {
      await openKitchen(page, { kitchen: { v: 1, done, cooked: { ceplok: 1 } } });
      const m = await page.evaluate(() => [document.querySelectorAll('.g-kitchen .kt-card').length, document.querySelectorAll('.g-kitchen .kt-card__medals .mg-sticker').length, document.querySelector('.g-kitchen .kt-next__dish').textContent, document.querySelectorAll('.g-kitchen .kt-item').length, MG.current.api.kitchen.legacy]);
      assert.deepStrictEqual(m, [cards, medals, next, shelf, done], `a v1 save with ${done} dishes keeps its ${cards} dishes, ${medals} medals and ${shelf} shelf things`);
    }
    // a v1 save with everything v1 had: saved again as v2 at once, nothing lost; the next present is the pizza
    await openKitchen(page, { kitchen: { done: 13, cooked: { ceplok: 2 } } });
    const sv = await saved(page);
    assert.deepStrictEqual([sv.v, sv.done, sv.legacy, sv.made, sv.cooked], [2, 13, 13, { ceplok: 3 }, { ceplok: 2 }], 'a v1 save is kept as v2: its count, its marks');
    await openKitchen(page, { keep: true });
    const menu = await page.evaluate(() => [document.querySelectorAll('.g-kitchen .kt-tab').length, document.querySelectorAll('.g-kitchen .kt-card').length, document.querySelector('.g-kitchen .kt-next .kt-next__dish').textContent]);
    assert.deepStrictEqual(menu, [3, 8, '🍕'], 'reopened: the same menu, with tabs, the pizza next');
    await startAt(page, 'ceplok', 5);
    await tapJob(page, 0); await tapJob(page, 1);
    await page.waitForSelector('.g-kitchen .kt-gift.is-open', { timeout: 4000 });
    const gift = await page.evaluate(() => [document.querySelector('.g-kitchen .kt-gift .kt-minicard .mg-sticker').textContent, MG.current.api.unlocks(14, 13).recipes.length, MG.current.api.kitchen.legacy]);
    assert.deepStrictEqual(gift, ['🍕', 9, 13], 'the next dish brings the pizza: nine dishes');
    await t.waitForWin(page, 6000);
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
    assert.deepStrictEqual([b[0].n, b[1].n], [3, 1], 'fixed jobs never change (her pick, his jar)');
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
  // --- 13. variants: what she picks lands in the dish, themes the later steps and shows on the finished dish
  if (part(13)) {
    /** Follow the hand until beat `to` starts (or the round is won). */
    const playTo = (p, to) => p.evaluate(async (to) => {
      let id = 52000;
      for (let k = 0; k < 400; k++) {
        const a = MG.current.api;
        if (MG.current.ctx.over || (a.state === 'beat' && a.beat >= to)) return a.beat;
        if (a.state === 'beat') { a.hintNext(); const n = a.hinted; if (n) { const r = n.getBoundingClientRect(), o = { bubbles: true, pointerId: ++id, pointerType: 'touch', clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }; n.dispatchEvent(new PointerEvent('pointerdown', o)); n.dispatchEvent(new PointerEvent('pointerup', o)); } }
        await new Promise((r) => setTimeout(r, 30));
      }
      return MG.current.api.beat;
    }, to);
    const aSel = async (p) => board(await api(p, 'aSide'));
    /** She chooses bowl i with three taps. */
    const choose = async (p, i) => {
      const her = await aSel(p);
      await tap(p, `${her} .kt-bowl[data-i="${i}"]`, 0); await gameWait(p, 0.3);
      await tap(p, `${her} .kt-bowl.is-chosen`, 0); await gameWait(p, 0.3);
      await tap(p, `${her} .kt-bowl.is-chosen`, 0); await gameWait(p, 0.3);
    };
    const fresh = () => openKitchen(page, { kitchen: FULL, scale: 4 });
    // jus: she picks the fruit first, then washes and chops that fruit; the blender turns its colour
    await fresh();
    await startAt(page, 'jus', 0);
    const aS = await api(page, 'aSide');
    assert.strictEqual(await A(page, (a) => { a.hintNext(); return a.hinted && a.hinted.dataset.i; }), '0', 'jus: nothing made yet, the hand shows the first bowl');
    await choose(page, 1);
    await tap(page, board(1 - aS) + ' .kt-jar[data-e="🥛"]', 0);
    await page.waitForFunction(() => MG.current.api.beat === 1 && MG.current.api.state === 'beat');
    const b1 = await page.evaluate((aS) => [MG.current.api.boards[aS].variant, document.querySelector('.g-kitchen .kt-pip[data-i="1"] > .mg-sticker').textContent], aS);
    assert.deepStrictEqual(b1, ['🥭', '🥭'], 'jus: she washes the mango she chose, and its step shows it');
    await playTo(page, 4);
    const vj = await api(page, 'vessel');
    assert.deepStrictEqual([vj.liq, vj.contents, await page.evaluate(() => document.querySelector('.g-kitchen .kt-vessel').dataset.kind)], ['#F7B23A', [], 'blender'], 'jus: blended smooth, in her colour');
    await followHand(page);
    const dj = await page.evaluate(() => { const d = document.querySelector('.g-kitchen .kt-dish'), c = d.querySelector('.kt-dish__disc'); return [d.dataset.choice, c && c.style.getPropertyValue('--c'), d.querySelectorAll('.kt-dish__top').length]; });
    assert.deepStrictEqual(dj, ['🥭', '#F7B23A', 1], 'jus: the finished drink shows her mango: its colour and one mango');
    assert.strictEqual((await api(page, 'kitchen')).made.jus, 2, 'jus: the mango is remembered');
    await t.waitForWin(page, 6000);
    // donat: the glaze rings both donuts in her colour; rainbow sprinkles
    await fresh();
    await startAt(page, 'donat', 2);
    // (the roll: each tap flattens the dough a step; the last cuts the ring, which stays on her board)
    const her = await aSel(page);
    const rolled = [];
    for (let k = 0; k < 3; k++) {
      rolled.push(await page.evaluate((sel) => +getComputedStyle(document.querySelector(sel + ' .kt-obj')).getPropertyValue('--f'), her));
      await tapJob(page, aS, 1, 0); await gameWait(page, 0.2);
    }
    const ro = await page.evaluate((aS) => [MG.current.api.boards[aS].k, MG.current.api.boards[aS].done, !!document.querySelector(`.g-kitchen .kt-board[data-side="${aS}"] .kt-obj.is-cut .kt-cut`)], aS);
    assert.deepStrictEqual([rolled, ro], [[0, 0.5, 1], [3, true, true]], 'the roll: flatter each tap, then the cutter pops out a ring');
    await playTo(page, 3);
    assert.strictEqual((await boards(page))[aS].e, '🍩', 'the cut ring goes on into her pan');
    await playTo(page, 4);
    await gameWait(page, 0.35);                      // (a new job can be used once it has been seen for 0.3 game seconds)
    await choose(page, 1);
    for (let k = 0, n = (await boards(page))[1 - aS].n; k < n; k++) { await tapJob(page, 1 - aS, 1, 0); await gameWait(page, 0.2); }
    await page.waitForTimeout(150);
    const glaze = await page.evaluate(() => [...document.querySelectorAll('.g-kitchen .kt-contents .kt-piece')].filter((n) => n.dataset.e === '🍩').map((n) => { const g = n.querySelector('.kt-glaze'); return g && g.style.getPropertyValue('--c'); }));
    assert.deepStrictEqual(glaze, ['#f49ac1', '#f49ac1'], 'donat: both donuts wear her strawberry glaze');
    const dots = (await api(page, 'vessel')).dotColors, RAINBOW = ['#E8455A', '#F7D35C', '#7BC96F', '#4FA3E0', '#B07CD8'];
    assert.ok(dots.length && dots.every((c) => RAINBOW.includes(c)) && new Set(dots).size >= 2, 'donat: rainbow sprinkles ' + dots);
    // goreng: her topping stays on top of the fried rice after the stir
    await fresh();
    await startAt(page, 'goreng', 2);
    await choose(page, 2);
    await playTo(page, 3);
    await A(page, (a) => a.jump(4));
    await playTo(page, 5);
    const vg = await api(page, 'vessel');
    assert.deepStrictEqual([vg.mix, vg.picks], ['#B8742E', ['🦐', '🦐', '🦐']], 'goreng: fried rice, her prawns still on top');
    // puding: the pot turns her colour, two fridges, two jellies in her colour
    await fresh();
    await startAt(page, 'puding', 1);
    // (he stirs while she chooses: his bowl holds what is in the pot, then follows it to her colour; never see-through)
    const stirBg = () => page.evaluate((s) => getComputedStyle(document.querySelector(`.g-kitchen .kt-board[data-side="${s}"] .kt-mswirl`)).backgroundColor, 1 - aS);
    const stir0 = await stirBg();
    await choose(page, 0);
    await gameWait(page, 0.5);                       // (the pot is redrawn once her strawberries land)
    assert.deepStrictEqual([stir0, await stirBg()], ['rgb(255, 244, 220)', 'rgb(244, 154, 193)'], 'puding: his stir bowl holds the pot, then her strawberry pink');
    await playTo(page, 2);
    assert.strictEqual((await api(page, 'vessel')).liq, '#F49AC1', 'puding: the pot is her strawberry pink');
    await page.waitForTimeout(400);                  // (the liquid fades in on the wall clock)
    const potPx = await liquidPixel(page);
    assert.ok(near(potPx.px, rgbOf('#F49AC1')) && !near(potPx.px, potPx.inside, 30), 'puding: the pink really shows in the pot (not its dark inside): ' + JSON.stringify(potPx));
    await gameWait(page, 0.35);
    // (cook, both taps and the read in one go: the golden latch is 0.45 game seconds, which a few round trips at a
    // fast clock could use up under load)
    const cold = await page.evaluate(() => {
      const a = MG.current.api, ph = [a.cook(0), a.cook(1)];
      [0, 1].forEach((s) => {
        const n = document.querySelector(`.g-kitchen .kt-board[data-side="${s}"] .kt-obj`), r = n.getBoundingClientRect();
        const o = { bubbles: true, cancelable: true, pointerId: 8300 + s, pointerType: 'touch', clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
        n.dispatchEvent(new PointerEvent('pointerdown', o)); n.dispatchEvent(new PointerEvent('pointerup', o));
      });
      return { ph, after: a.boards.map((b) => [b.phase, b.done]) };
    });
    assert.deepStrictEqual(cold, { ph: ['gold', 'gold'], after: [['gold', false], ['gold', false]] }, 'puding: both fridges chill by themselves, and a tap the moment it is cold does nothing');
    await gameWait(page, 0.5);
    await tapJob(page, 0, 1, 0); await tapJob(page, 1, 1, 0);
    const out = await page.evaluate(() => [MG.current.api.boards.map((b) => b.done), document.querySelectorAll('.g-kitchen .kt-obj.is-out').length]);
    assert.deepStrictEqual(out, [[true, true], 2], 'puding: then the doors open and out come the jellies');
    await page.waitForFunction(() => MG.current.api.beat === 3 && MG.current.api.state === 'beat', null, { timeout: 5000 });
    const jel = await page.evaluate(() => [MG.current.api.vessel.contents, [...document.querySelectorAll('.g-kitchen .kt-contents .kt-jelly')].map((n) => n.style.getPropertyValue('--c'))]);
    assert.deepStrictEqual(jel, [['jelly', 'jelly'], ['#F49AC1', '#F49AC1']], 'puding: two pink jellies on the plate');
    assert.strictEqual(await api(page, 'locked'), false, 'never locked');
    // eskrim: she chooses mango; both stir bowls hold mango batter, the bowl in the middle really shows it, the fridges
    // hold mango scoops (and its step shows one), and two mango scoops stack on the cone
    await fresh();
    await startAt(page, 'eskrim', 0);
    await choose(page, 2);
    await tap(page, board(1 - aS) + ' .kt-jar[data-e="🥛"]', 0);
    await playTo(page, 2);
    const MANGO = '#F7B23A';
    const swirls = await page.evaluate(() => [...document.querySelectorAll('.g-kitchen .kt-mswirl')].map((n) => getComputedStyle(n).backgroundColor));
    assert.deepStrictEqual(swirls, ['rgb(247, 178, 58)', 'rgb(247, 178, 58)'], 'eskrim: both stir bowls hold her mango batter (never see-through)');
    await playTo(page, 3);
    await page.waitForTimeout(400);                  // (the liquid fades in on the wall clock)
    const bowlPx = await liquidPixel(page);
    assert.ok(near(bowlPx.px, rgbOf(MANGO)) && !near(bowlPx.px, bowlPx.inside, 30), 'eskrim: the mango batter really shows in the bowl (not its light inside): ' + JSON.stringify(bowlPx));
    const cold3 = await page.evaluate(() => [...document.querySelectorAll('.g-kitchen .kt-fridge__win .kt-scoopball'), document.querySelector('.g-kitchen .kt-pip[data-i="3"] > .kt-scoopball')].map((n) => n && n.style.getPropertyValue('--c')));
    assert.deepStrictEqual(cold3, [MANGO, MANGO, MANGO], 'eskrim: a mango scoop in each fridge, and on its step');
    await A(page, (a) => { a.cook(0); a.cook(1); });
    await gameWait(page, 0.5);
    await tapJob(page, 0, 1, 0); await tapJob(page, 1, 1, 0);
    await page.waitForFunction(() => MG.current.api.beat === 4 && MG.current.api.state === 'beat', null, { timeout: 5000 });
    const ve = await api(page, 'vessel');
    assert.deepStrictEqual([ve.kind, ve.scoops], ['cone', [MANGO, MANGO]], 'eskrim: two mango scoops on the cone');
    // bubur: the stirred porridge shows in the bowl, clear of its light inside; its 🥣 is never an empty bowl (the
    // porridge is drawn in it on the card, the taste bowls, the goal in the corner and the finished dish)
    await fresh();
    assert.ok(await page.evaluate(() => !!document.querySelector('.g-kitchen .kt-card[data-id="bubur"] .kt-card__dish .mg-sticker > .kt-porridge')), 'bubur: the card shows porridge in the bowl');
    await startAt(page, 'bubur', 1);
    await playTo(page, 2);
    await page.waitForTimeout(400);
    const porPx = await liquidPixel(page), PORRIDGE = (await api(page, 'vessel')).liq;
    assert.ok(near(porPx.px, rgbOf(PORRIDGE)) && !near(porPx.px, porPx.inside, 24), 'bubur: the porridge really shows in the bowl, clear of its inside: ' + JSON.stringify([PORRIDGE, porPx]));
    await A(page, (a) => a.jump(a.beats.length - 1));
    await page.waitForFunction(() => MG.current.api.boards.every((b) => b.do === 'taste'), null, { timeout: 5000 });
    assert.strictEqual(await page.evaluate(() => document.querySelectorAll('.g-kitchen .kt-tbowl__food .mg-sticker > .kt-porridge').length), 2, 'bubur: both taste bowls hold porridge');
    await gameWait(page, 0.35);
    await tapJob(page, 0, 1, 0); await tapJob(page, 1, 1, 0);
    await stateIs(page, 'finale');
    await page.waitForFunction(() => !document.querySelector('.g-kitchen .kt-dish').hidden, null, { timeout: 5000 });
    const dishPor = await page.evaluate(() => { const n = document.querySelector('.g-kitchen .kt-dish .kt-dish__main .mg-sticker > .kt-porridge'); return n ? Math.round(n.getBoundingClientRect().width) : 0; });
    assert.ok(dishPor > 10, 'bubur: the finished dish shows its porridge: ' + dishPor + 'px');
    assert.ok(await page.evaluate(() => !!document.querySelector('.g-kitchen .kt-ghost .kt-porridge')), 'bubur: the goal in the corner shows porridge too');
    await t.waitForWin(page, 6000);
    // pizza: the rolled base lands on the empty peel; the tomato sauce spreads on it
    await fresh();
    await startAt(page, 'pizza', 0);
    const bS = 1 - aS;
    for (let k = 0, n = (await boards(page))[bS].n; k < n; k++) { await tapJob(page, bS, 1, 0); await gameWait(page, 0.2); }
    assert.ok(await page.evaluate((s) => !!document.querySelector(`.g-kitchen .kt-board[data-side="${s}"] .kt-obj.is-base`), bS), 'pizza: his dough is rolled into a base');
    await playTo(page, 1);
    assert.ok((await api(page, 'vessel')).base && await page.evaluate(() => !!document.querySelector('.g-kitchen .kt-pbase')), 'pizza: the base is on the peel');
    await playTo(page, 2);
    assert.strictEqual((await api(page, 'vessel')).sauce, '#D9452B', 'pizza: tomato sauce on the base');
  }

  // --- 14. the menu's tabs: one page up to eight cells, then three wordless group tabs
  if (part(14)) {
    await openKitchen(page);
    const tones = await page.evaluate(() => [document.querySelector('.g-kitchen .kt-menu').classList.contains('has-tabs'),
      ...['ceplok', 'pisang'].map((id) => document.querySelector(`.g-kitchen .kt-card[data-id="${id}"]`).style.getPropertyValue('--tone')),
      document.querySelector('.g-kitchen .kt-next').style.getPropertyValue('--tone')]);
    assert.deepStrictEqual(tones, [false, 'var(--leaf-soft)', 'var(--berry-soft)', 'var(--leaf-soft)'], 'a new kitchen: one page; colour means group (green meals, pink sweets)');
    await openKitchen(page, { kitchen: { v: 2, done: 9, legacy: 0 } });
    const nine = await page.evaluate(() => {
      const a = MG.current.api, cells = {};
      document.querySelectorAll('.g-kitchen .kt-card, .g-kitchen .kt-next').forEach((n) => { (cells[n.dataset.group] = cells[n.dataset.group] || []).push(n.dataset.id || 'next:' + n.querySelector('.kt-next__dish').textContent); });
      a.hintNext();
      return { tabs: document.querySelectorAll('.g-kitchen .kt-tab').length, cells, tab: a.tab, shown: [...document.querySelectorAll('.g-kitchen .kt-card')].filter((n) => n.offsetParent).map((n) => n.dataset.id), hand: a.hinted && a.hinted.dataset.id };
    });
    assert.deepStrictEqual(nine, { tabs: 3, cells: { meal: ['ceplok', 'goreng', 'sate', 'sop', 'pizza', 'next:🍜'], sweet: ['pisang', 'donat'], cold: ['eskrim'] }, tab: 'cold', shown: ['eskrim'], hand: 'eskrim' }, 'nine cells: tabs; the newest dish (es krim) opens its tab, and the hand shows it');
    await openTab(page, 'meal');
    const meal = await page.evaluate(() => {
      const a = MG.current.api;
      a.hintNext();
      const cards = [...document.querySelectorAll('.g-kitchen .kt-card, .g-kitchen .kt-next')];
      return { on: [...document.querySelectorAll('.g-kitchen .kt-tab.is-on')].map((n) => n.dataset.group), shown: cards.filter((n) => n.offsetParent).length,
        off: cards.filter((n) => n.dataset.group !== 'meal').every((n) => n.hidden && (n.classList.contains('kt-next') || n.getAttribute('aria-disabled') === 'true')),
        hand: a.hinted && a.hinted.dataset.id, sparkles: document.querySelectorAll('.g-kitchen .kt-tab .kt-tab__new').length, dots: document.querySelectorAll('.g-kitchen .kt-next__dots i').length };
    });
    assert.deepStrictEqual(meal, { on: ['meal'], shown: 6, off: true, hand: 'sop', sparkles: 3, dots: 2 }, 'the meals tab: its five dishes and the next; the rest hidden and off; the hand on the newest meal');
    await page.evaluate(() => { const c = document.querySelector('.g-kitchen .kt-card[data-id="pisang"]'); c.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 7301, pointerType: 'touch', clientX: 1, clientY: 1 })); });
    assert.strictEqual(await api(page, 'state'), 'menu', 'a card on a closed tab cannot be picked');
    await gameWait(page, 0.2);
    await settledMenu(page);
    // a tap on the open tab: it wiggles, and nothing else happens (no card pops in again)
    const again = await page.evaluate(async () => {
      const f = MG.current.ctx.fx, wig = f.__ktw || (f.__ktw = f.wiggle), seen = [];   // (fx is the shell's: wrap it once)
      f.wiggle = function (n) { seen.push(n && n.classList && n.classList.contains('kt-tab') ? n.dataset.group : 'other'); return wig.apply(this, arguments); };
      const cards = () => [...document.querySelectorAll('.g-kitchen .kt-card, .g-kitchen .kt-next')].filter((n) => n.offsetParent);
      const popIn = (n) => n.getAnimations().filter((x) => x.animationName === 'kt-card-in');
      const before = cards().map(popIn);
      const t = document.querySelector('.g-kitchen .kt-tab[data-group="meal"]'), r = t.getBoundingClientRect();
      const o = { bubbles: true, cancelable: true, pointerId: 7303, pointerType: 'touch', clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
      t.dispatchEvent(new PointerEvent('pointerdown', o)); t.dispatchEvent(new PointerEvent('pointerup', o));
      await new Promise((res) => setTimeout(res, 80));
      f.wiggle = wig;
      const restarted = cards().filter((n, i) => popIn(n).some((x) => x.playState === 'running' || !before[i].includes(x))).length;
      return { tab: MG.current.api.tab, wiggled: seen, restarted, shown: cards().length };
    });
    assert.deepStrictEqual(again, { tab: 'meal', wiggled: ['meal'], restarted: 0, shown: 6 }, 'the open tab only wiggles: no card pops in again');
    // near misses, with real touches: a tap in the gap beside a tab is the tab's (or nobody's), never a dish
    await settledMenu(page);                         // (measure the tabs once the wiggle is over)
    const gaps = await page.evaluate(() => {
      const tabs = [...document.querySelectorAll('.g-kitchen .kt-tab')].map((n) => n.getBoundingClientRect()), low = Math.max(...tabs.map((r) => r.bottom));
      return [[(tabs[0].left + tabs[0].right) / 2, low + 3], [(tabs[0].right + tabs[1].left) / 2, (tabs[1].top + tabs[1].bottom) / 2], [(tabs[2].left + tabs[2].right) / 2, low + 3]];
    });
    for (const [x, y] of gaps) {
      await page.touchscreen.tap(x, y);
      await gameWait(page, 0.2);
      assert.strictEqual(await api(page, 'state'), 'menu', `a tap in the gap beside a tab (${Math.round(x)}, ${Math.round(y)}) never opens a dish`);
    }
    await openTab(page, 'meal');
    await gameWait(page, 0.2);
    // turned on its side with the meals open: the tabs become a column on the left, nothing changes
    await page.setViewportSize(h.VIEWPORTS.phoneWide);
    await page.waitForTimeout(300);
    const wide = await page.evaluate(() => {
      const g = document.querySelector('#mg-game').getBoundingClientRect(), page = document.querySelector('.g-kitchen .kt-page').getBoundingClientRect();
      const tabs = [...document.querySelectorAll('.g-kitchen .kt-tab')].map((n) => n.getBoundingClientRect());
      return { column: tabs.every((r) => Math.abs(r.left - tabs[0].left) < 1 && r.right <= page.left), inside: tabs.every((r) => r.left - g.left >= 11.5 && r.top - g.top >= 11.5 && g.bottom - r.bottom >= 11.5),
        card: parseFloat(getComputedStyle(document.querySelector('.g-kitchen')).getPropertyValue('--card')), tab: MG.current.api.tab };
    });
    assert.ok(wide.column && wide.inside && wide.card >= 80 && wide.tab === 'meal', 'turned: a column of tabs left of the page, 12px inside, cards still big, the same tab open ' + JSON.stringify(wide));
    await layoutChecks(t, page, 'menu turned with tabs');
    await page.setViewportSize(h.VIEWPORTS.phone);
    await page.waitForTimeout(200);
    await tap(page, '.g-kitchen .kt-card[data-id="sop"]', 0);
    assert.strictEqual(await api(page, 'state'), 'deal', 'a card starts its dish');
    await page.evaluate(() => { const t = document.querySelector('.g-kitchen .kt-tab[data-group="cold"]'), r = t.getBoundingClientRect(); t.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 7302, pointerType: 'touch', clientX: r.left + 5, clientY: r.top + 5 })); });
    assert.deepStrictEqual([await api(page, 'tab'), await api(page, 'state')], ['meal', 'deal'], 'and a tab tap after that does nothing');
    // a real touch 8px outside the first card's left edge is still that card (the page takes near misses past its grid)
    await openKitchen(page, { kitchen: { v: 2, done: 9, legacy: 0 } });
    await openTab(page, 'meal');
    const first = await page.evaluate(() => { const n = [...document.querySelectorAll('.g-kitchen .kt-card')].filter((c) => c.offsetParent)[0], r = n.getBoundingClientRect(); return { id: n.dataset.id, x: r.left - 8, y: r.top + r.height / 2 }; });
    await page.touchscreen.tap(first.x, first.y);
    assert.deepStrictEqual([await api(page, 'state'), await api(page, 'recipe')], ['deal', 'ceplok'], 'a touch 8px left of the first card opens that dish ' + JSON.stringify(first));
    await page.evaluate(() => MG.home());
  }
});
