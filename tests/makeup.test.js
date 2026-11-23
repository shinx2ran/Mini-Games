/* Make-Up Mirrors: two mirrors, two trays. The rules and the data hold; a round plays with real taps; following only the
   ghost hand plays every party and finds five secret looks, and the real hand on screen moves straight on and never
   leaves anyone waiting; a round with real taps lasts long enough; swaps, mashing, rotating and damaged saves never break
   it; every face lands its make-up on the right spot; every size fits (568x320 too); the posed photo holds. */
'use strict';
const fs = require('fs');
const path = require('path');
const h = require('./harness');
const ID = 'makeup';
const KEY = 'mg:game:makeup:makeup';
const SMALL_WIDE = { width: 568, height: 320 };

// Appendix A of the spec: every emoji the game may use (all Unicode 11 or older)
const ALLOWED = [...('💄🐇🐣🎨💪' + '🐰🐻🐱🐶🐼🐸🐵🐯🐷🐨🐙🐧🐥🦁🦄🦊' +
  '🧽⭐❤⚡🐾💎🐚🌙🌈👓🕶🥽🧣👔🌺🎀🌸🎩🦆🌿👑👒✨💕🌼💫' + '👋😘✌' + '🧼👀👃👄📸✔' +
  '😊😆🤩😍😎🤪🤡😁😸🥳👽🤧😮😝' + '💋💦🎈💥🔍🛸🎁🍃' + '🎉🎪🏖🚀🏙🌴🐒🏰☀🌊🎤🤹' + '🦸🕵' +
  '🐩🦜📻💡💐🧸🌵🌻🎐🧁🏅')];

const api = (page, k) => page.evaluate((k) => MG.current.api[k], k);
/** Run fn(api, arg) in the page. */
const A = (page, fn, arg) => page.evaluate(([src, a]) => (0, eval)('(' + src + ')')(MG.current.api, a), [fn.toString(), arg]);
const boards = (page) => api(page, 'boards');
const B = (s) => `.g-makeup .mk-board[data-side="${s}"]`;
const ITEM = (s, id) => `${B(s)} .mk-item[data-id="${id}"]`;
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

/** A page with the help setting chosen before the shell starts (player 1, on the left, is the little one). */
async function newPage(t, o = {}) {
  const p = await t.open(null, { page: 'tests/play.html?g=makeup', viewport: o.viewport, dark: o.dark, reducedMotion: o.reducedMotion });
  await p.evaluate((help) => MG.store.set('help', help), o.help == null ? 0 : o.help);
  await p.reload();
  await p.waitForFunction(() => window.MG && document.querySelector('#mg-home'));
  return p;
}
const ready = (page) => page.waitForFunction(() => MG.current && MG.current.api && MG.current.api.state === 'menu', null, { timeout: 10000 });
const stateIs = (page, s, timeout = 15000) => page.waitForFunction((s) => MG.current && MG.current.api && MG.current.api.state === s, s, { timeout });
/** Open the salon with options set first, from a clean slate unless `keep` (or a given saved salon). */
async function openMakeup(page, o = {}) {
  await page.evaluate(([o, KEY]) => {
    MG.home();                                    // (leaving saves the salon: change it after)
    if (!o.keep) localStorage.removeItem(KEY);
    if (o.kit !== undefined) localStorage.setItem(KEY, typeof o.kit === 'string' ? o.kit : JSON.stringify(o.kit));
    MG.store.set('opt:makeup:length', o.length || 'full');
    MG.store.set('opt:makeup:dabs', o.dabs || 'normal');
    MG.timeScale = o.scale || 1;
    MG.open('makeup');
  }, [o, KEY]);
  await ready(page);
}
/** Wait until dt seconds of GAME time have passed. */
async function gameWait(page, dt) {
  const t0 = await page.evaluate(() => MG.current.ctx.time);
  await page.waitForFunction(([t0, dt]) => MG.current.ctx.time >= t0 + dt, [t0, dt], { timeout: 10000 });
}
/** Choose a party (the same path as a card tap) and wait for zone `z` (by finishing the zones before it with the hand). */
async function startAt(page, id, z) {
  await A(page, (a, id) => a.start(id), id);
  await stateIs(page, 'zone');
  if (z) await handUntil(page, (a, z) => a.state === 'zone' && a.zone === z, z);
  await gameWait(page, 0.35);
}
/** Follow the hand until cond(api) holds. (The clock runs at least 8x on the way, then goes back to what it was.) */
function handUntil(page, cond, arg, max = 400) {
  return page.evaluate(async ([src, arg, max]) => {
    const cond = (0, eval)('(' + src + ')');
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    let id = 70000 + Math.floor(Math.random() * 1000) * 50;
    const s0 = MG.timeScale;
    MG.timeScale = Math.max(s0 || 1, 8);
    try {
      for (let i = 0; i < max; i++) {
        const a = MG.current.api;
        if (cond(a, arg)) return true;
        a.hintNext();
        const n = a.hinted;
        if (n && a.state === 'zone') { const r = n.getBoundingClientRect(); const o = { bubbles: true, pointerId: ++id, pointerType: 'touch', clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }; n.dispatchEvent(new PointerEvent('pointerdown', o)); n.dispatchEvent(new PointerEvent('pointerup', o)); }
        await sleep(40);
      }
    } finally { MG.timeScale = s0; }
    throw new Error('handUntil: never got there');
  }, [cond.toString(), arg, max]);
}
/** Board s taps item id until its step is done (game-time waits past the gap). */
async function finishBoard(page, s, id, face = false) {
  for (let i = 0; i < 8; i++) {
    const b = (await boards(page))[s];
    if (b.done) return;
    await tap(page, i && face ? `${B(s)} .mk-mirror` : ITEM(s, id || b.tray[0]), 0);
    await gameWait(page, 0.27);
  }
  throw new Error('board ' + s + ' never finished');
}
const saved = (page) => page.evaluate((KEY) => JSON.parse(localStorage.getItem(KEY)), KEY);
const pieces = (page, s, z) => page.evaluate(([s, z]) => document.querySelectorAll(`.g-makeup .mk-board[data-side="${s}"] .mk-layer[data-zone="${z}"] .mk-at`).length, [s, z]);
// MG_MK_ONLY=2,9 runs only those numbered parts of this file (a debugging aid; unset, everything runs)
const ONLY = process.env.MG_MK_ONLY ? process.env.MG_MK_ONLY.split(',') : null;
const part = (n) => !ONLY || ONLY.includes(String(n));

/** Follow only the ghost hand until the round is won. Watches where the hand points on the way. (The clock runs at least
 *  8x until the win, then goes back to what it was.) */
function followHand(page, max = 500) {
  return page.evaluate(async ([max]) => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    let id = 40000 + Math.floor(Math.random() * 1000) * 100, steps = 0, herOk = true, picked = null;
    const bad = [], s0 = MG.timeScale;
    MG.timeScale = Math.max(s0 || 1, 8);
    for (; steps < max && MG.current && !MG.current.ctx.over; steps++) {
      const a = MG.current.api;
      a.hintNext();
      const n = a.hinted;
      if (!n) { await sleep(40); continue; }
      if (a.state === 'menu' && n.dataset.id) picked = n.dataset.id;
      if (n.closest('.mk-board.is-done')) bad.push('a done board');
      if (n.closest('.mk-mirror, .mk-wall, .mk-next, .mk-book')) bad.push(n.className);
      if (n.classList.contains('mk-item')) {
        const s = +n.closest('.mk-board').dataset.side, b = a.boards[s], sig = a.PARTIES[a.party].sig[a.zone];
        const ok = a.zone === 'wash' || (b.item ? n.dataset.id === b.item : (sig && b.tray.includes(sig) ? n.dataset.id === sig : n === n.parentNode.children[1]));
        if (!ok) bad.push('a tray item that is not the signature or the chosen one: ' + n.dataset.id);
      }
      if (a.state === 'zone' && !a.boards[a.aSide].done && !n.closest(`.mk-board[data-side="${a.aSide}"]`)) herOk = false;
      const r = n.getBoundingClientRect();
      const o = { bubbles: true, cancelable: true, pointerId: ++id, pointerType: 'touch', clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
      n.dispatchEvent(new PointerEvent('pointerdown', o));
      n.dispatchEvent(new PointerEvent('pointerup', o));
      await sleep(35);
    }
    MG.timeScale = s0;
    return { steps, bad, herOk, picked, over: !!(MG.current && MG.current.ctx.over), party: MG.current && MG.current.api.party };
  }, [max]);
}

/** Follow only the REAL ghost hand: tap api.hinted only while the core's .mg-hint is on screen, about 0.3 game seconds
 *  after it shows (a person's reaction), and never call hintNext(). Logs, in game time, every wait between taps and how
 *  soon the hand was on the other board after a board finished under it. */
function followRealHand(page, maxGame = 400) {
  return page.evaluate(async ([maxGame]) => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const c = MG.current.ctx, t0 = c.time, waits = [], moved = [], drawn = { menu: 0, zone: 0 };
    let id = 30000, lastTap = null, seenAt = null, seenNode = null;
    while (!c.over && c.time - t0 < maxGame) {
      const a = MG.current.api, n = a.hinted, shown = !!document.querySelector('.g-makeup .mg-hint, #mg-game .mg-hint');
      if (!shown || !n) { seenAt = null; await sleep(5); continue; }
      if (n !== seenNode || seenAt === null) { seenNode = n; seenAt = c.time; }
      if (c.time - seenAt < 0.3) { await sleep(5); continue; }
      drawn[a.state === 'menu' ? 'menu' : 'zone']++;
      const bd = n.closest('.mk-board'), s = bd ? +bd.dataset.side : -1, was = s >= 0 ? a.boards[s].done : null;
      const r = n.getBoundingClientRect();
      const o = { bubbles: true, cancelable: true, pointerId: ++id, pointerType: 'touch', clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
      n.dispatchEvent(new PointerEvent('pointerdown', o));
      n.dispatchEvent(new PointerEvent('pointerup', o));
      if (lastTap !== null) waits.push(+(c.time - lastTap).toFixed(2));
      lastTap = c.time;
      seenAt = null;
      const b = MG.current.api;
      // her board (or his) finished under the hand while the other is still going: the hand must go there at once
      if (s >= 0 && !was && b.state === 'zone' && b.boards[s].done && !b.boards[1 - s].done) {
        const tf = c.time;
        while (c.time - tf < 1.5) {
          const h = MG.current.api.hinted;
          if (h && document.querySelector('#mg-game .mg-hint') && h.closest(`.mk-board[data-side="${1 - s}"]`)) break;
          await sleep(2);
        }
        moved.push(+(c.time - tf).toFixed(3));
      }
      await sleep(5);
    }
    return { over: c.over, waits, moved, drawn, party: MG.current.api.party };
  }, [maxGame]);
}
/** A real-touch two-player round: she taps her own board every `her` game seconds, he his every `his` seconds (each the
 *  chosen item, else the party's signature, else the first or second button), each first tap of a step one beat after it
 *  appears. Game seconds from the card tap to the party overlay. */
function twoPlayers(page, party, her, his) {
  return page.evaluate(async ([party, her, his]) => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const c = MG.current.ctx;
    let id = 20000;
    const touch = (n) => { const r = n.getBoundingClientRect(); const o = { bubbles: true, cancelable: true, pointerId: ++id, pointerType: 'touch', clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }; n.dispatchEvent(new PointerEvent('pointerdown', o)); n.dispatchEvent(new PointerEvent('pointerup', o)); };
    touch(document.querySelector(`.g-makeup .mk-card[data-id="${party}"]`));
    const t0 = c.time, next = [t0, t0];
    while (!document.querySelector('.mg-overlay--win') && c.time - t0 < 400) {
      const a = MG.current.api;
      if (a.state === 'zone') {
        for (const s of [0, 1]) {
          const bd = a.boards[s], mine = s === a.aSide;
          if (bd.done || c.time < next[s]) continue;
          const sig = a.PARTIES[a.party].sig[a.zone];
          const want = bd.item || (sig && bd.tray.includes(sig) ? sig : bd.tray[mine ? 0 : 1]);
          touch(document.querySelector(`.g-makeup .mk-board[data-side="${s}"] .mk-item[data-id="${want}"]`));
          next[s] = c.time + (mine ? her : his);
        }
      } else for (const s of [0, 1]) next[s] = c.time + (s === a.aSide ? her : his);   // (a new step: each looks at it for one beat first)
      await sleep(4);
    }
    return { len: +(c.time - t0).toFixed(1) };
  }, [party, her, his]);
}

/** Every layout rule for what is on screen now. */
async function layoutChecks(t, p, label, o = {}) {
  const { assert } = t;
  await p.waitForFunction(() => ![...document.querySelectorAll('.g-makeup .mk-card, .g-makeup .mk-board, .g-makeup .mk-tray, .g-makeup .mk-frame, .g-makeup .mk-pip')].some((n) => n.getAnimations().some((a) => a.playState === 'running' && /mk-(card-in|in-l|in-r|tray-up|frame-in)/.test(a.animationName))), null, { timeout: 4000 });
  const vis = (sel) => p.evaluate((sel) => [...document.querySelectorAll(sel)].filter((n) => n.offsetParent && getComputedStyle(n).visibility !== 'hidden').length, sel);
  const targets = '.g-makeup .mk-board, .g-makeup .mk-item, .g-makeup .mk-card';
  if (await vis('.g-makeup .mk-board, .g-makeup .mk-item')) {
    const min = (await t.minTargetSize(p, '.g-makeup .mk-board, .g-makeup .mk-item')).min;
    assert.ok(min >= 64, `boards and tray buttons at least 64px ${label}: ${min}`);
  }
  if (await vis('.g-makeup .mk-card')) { const m = (await t.minTargetSize(p, '.g-makeup .mk-card')).min; assert.ok(m >= 80, `menu cards at least 80px ${label}: ${m}`); }
  const inset = await p.evaluate((sel) => {
    const g = document.querySelector('#mg-game').getBoundingClientRect();
    return [...document.querySelectorAll(sel)].filter((n) => n.offsetParent && getComputedStyle(n).visibility !== 'hidden').map((n) => { const r = n.getBoundingClientRect(); return Math.min(r.left - g.left, r.top - g.top, g.right - r.right, g.bottom - r.bottom); });
  }, targets);
  if (inset.length) assert.ok(Math.min(...inset) >= 11.5, `every target 12px inside the play area ${label}: ${Math.min(...inset).toFixed(1)}`);
  assert.deepStrictEqual(await t.outsidePlayArea(p, targets + ', .g-makeup .mk-pip, .g-makeup .mk-polaroid, .g-makeup .mk-helper, .g-makeup .mk-dec, .g-makeup .mk-frame:not([hidden]), .g-makeup .mk-gift:not([hidden]), .g-makeup .mk-next:not([hidden]), .g-makeup .mk-lookslot'), [], `in view ${label}`);
  const clash = await p.evaluate(() => {
    const rects = (sel) => [...document.querySelectorAll(sel)].filter((n) => n.offsetParent && getComputedStyle(n).visibility !== 'hidden').map((n) => [n.className + (n.dataset.id ? ':' + n.dataset.id : ''), n.getBoundingClientRect()]);
    const hit = (r, s) => r.left < s.right - 1 && s.left < r.right - 1 && r.top < s.bottom - 1 && s.top < r.bottom - 1;
    const out = [];
    const pairs = (list) => list.forEach(([a, r], i) => list.slice(i + 1).forEach(([b, s]) => { if (hit(r, s)) out.push(a + ' x ' + b); }));
    pairs(rects('.g-makeup .mk-board'));
    pairs(rects('.g-makeup .mk-item'));
    pairs(rects('.g-makeup .mk-card, .g-makeup .mk-next'));
    pairs(rects('.g-makeup .mk-board.is-done .mk-check'));
    pairs(rects('.g-makeup .mk-lookslot'));
    return out;
  });
  assert.deepStrictEqual(clash, [], `nothing overlaps ${label}`);
  // the photos may fan out, but each one still shows at least half of itself (layout boxes: their tilt is decoration)
  const fan = await p.evaluate(() => {
    const ps = [...document.querySelectorAll('.g-makeup .mk-polaroid')].filter((n) => n.offsetParent && getComputedStyle(n).visibility !== 'hidden');
    const out = [];
    for (let i = 1; i < ps.length; i++) {
      const a = ps[i - 1], b = ps[i], dx = Math.abs(b.offsetLeft - a.offsetLeft) / b.offsetWidth, dy = Math.abs(b.offsetTop - a.offsetTop) / b.offsetHeight;
      if (Math.max(dx, dy) < 0.5) out.push(`photo ${i} shows only ${Math.round(100 * Math.max(dx, dy))}%`);
    }
    return out;
  });
  assert.deepStrictEqual(fan, [], `every photo on the wall shows at least half of itself ${label}`);
  // the wall clips what pokes out of it: every pip (the current one too), the marquee animals and every photo shown are inside
  const clipped = await p.evaluate(() => {
    const w = document.querySelector('.g-makeup .mk-wall');
    if (!w || !w.offsetParent) return [];
    const W = w.getBoundingClientRect(), row = document.querySelector('.g-makeup .mk-row').getBoundingClientRect(), out = [];
    const inside = (r, b, inset, tol) => r.left >= b.left + inset - tol && r.right <= b.right - inset + tol && r.top >= b.top + inset - tol && r.bottom <= b.bottom - inset + tol;
    document.querySelectorAll('.g-makeup .mk-pip, .g-makeup .mk-mq-pet > .mg-sticker').forEach((n) => {
      const r = n.getBoundingClientRect();
      if (n.offsetParent && r.width && !inside(r, W, 3, 0.5)) out.push(`${n.className} ${n.dataset.zone || n.textContent} [${[r.left, r.right].map(Math.round)}] outside the wall [${[W.left + 3, W.right - 3].map(Math.round)}]`);
    });
    document.querySelectorAll('.g-makeup .mk-polaroid').forEach((n, i) => {
      const r = n.getBoundingClientRect();
      if (n.offsetParent && r.width && !inside(r, row, 0, 3)) out.push(`photo ${i} cut off by the wall row`);
    });
    return out;
  });
  assert.deepStrictEqual(clipped, [], `nothing on the wall is cut off ${label}`);
  const escapes = await p.evaluate(() => {
    const out = [];
    const inside = (r, b, tol) => r.left >= b.left - tol && r.right <= b.right + tol && r.top >= b.top - tol && r.bottom <= b.bottom + tol;
    document.querySelectorAll('.g-makeup .mk-board').forEach((bd) => {
      const B = bd.getBoundingClientRect(), M = bd.querySelector('.mk-mirror').getBoundingClientRect();
      // (layout boxes, not rects: the friend wiggles and leans, which is decoration)
      const md = bd.querySelector('.mk-model'), sw = bd.querySelector('.mk-sway'), mi = bd.querySelector('.mk-mirror');
      if (md && getComputedStyle(md).visibility !== 'hidden') {
        const x = sw.offsetLeft + md.offsetLeft, y = sw.offsetTop + md.offsetTop;
        if (x < -0.5 || y < -0.5 || x + md.offsetWidth > mi.clientWidth + 0.5 || y + md.offsetHeight > mi.clientHeight + 0.5) out.push(`the friend pokes out of its mirror: ${[x, y, md.offsetWidth, md.offsetHeight]} in ${[mi.clientWidth, mi.clientHeight]}`);
      }
      void M;
      bd.querySelectorAll('.mk-bubble, .mk-badge, .mk-check').forEach((n) => { const r = n.getBoundingClientRect(); if (r.width && !inside(r, B, 0.5)) out.push(n.className + ' outside its board'); });
    });
    return out;
  });
  assert.deepStrictEqual(escapes, [], `the friend, bubble, badges and tick sit inside ${label}`);
  if (await vis('.g-makeup .mk-pip')) assert.ok((await t.minTargetSize(p, '.g-makeup .mk-pip.is-in')).min >= 20, `pips at least 20px ${label}`);
  if (await vis('.g-makeup .mk-helper, .g-makeup .mk-dec')) assert.ok((await t.minTargetSize(p, '.g-makeup .mk-helper, .g-makeup .mk-dec')).min >= 14, `helpers and decorations at least 14px ${label}`);
  if (o.wall) { const n = await vis('.g-makeup .mk-polaroid'); assert.ok(n >= o.wall, `at least ${o.wall} polaroids show ${label}: ${n}`); }
  assert.ok(await t.noPageScroll(p), `no page scroll ${label}`);
  // (only pictographs, skin tones, the variation selector, the joiner and the keycap go: \p{Emoji_Component} would also take 0-9, # and *)
  const text = await p.evaluate(() => document.querySelector('.g-makeup').innerText.replace(/\p{Extended_Pictographic}|\p{Emoji_Modifier}|[\u{FE0F}\u{200D}\u{20E3}]|\s/gu, ''));
  assert.ok(!/[\p{L}\p{N}]/u.test(text), `no letters or digits on screen ${label}: ${JSON.stringify(text)}`);
}

h.run(ID, async (t) => {
  const { assert } = t;
  const T0 = Date.now();
  const lap = (n) => { if (process.env.MG_MK_TIME) console.log(`  part ${n}: ${((Date.now() - T0) / 1000).toFixed(1)}s`); };
  let page = await newPage(t);
  await openMakeup(page);

  // --- 1. the rules and the data
  if (part(1)) {
    const r = await page.evaluate(() => {
      const a = MG.current.api, out = [];
      const fresh = { v: 1, done: 0, played: {}, looks: [], seen: [], photos: [] };
      const eq = (x, y) => JSON.stringify(x) === JSON.stringify(y);
      [null, 'x', [1, 2, 3], { done: 'abc' }].forEach((v) => { if (!eq(a.cleanMakeup(v), fresh)) out.push('fresh from ' + JSON.stringify(v)); });
      const junkPhoto = (re) => ({ p: 'party', l: { e: '🐰', z: { cheeks: 'crown', top: 'cone', wash: 'sponge', pose: 'ears' }, x: ['clown', 'tiger'], o: 'moon' }, r: { e: re, z: {} } });
      const junk = { done: 5, played: { disco: 3, hero: 'x', party: 99999 }, looks: ['clown', 'clown', 'ninja', 7], seen: ['stamp', 'fly', 'stamp'], photos: [junkPhoto('🦖'), 'junk'] };
      const c = a.cleanMakeup(junk);
      if (!eq(c.played, { party: 999 }) || !eq(c.looks, ['clown']) || !eq(c.seen, ['stamp']) || c.photos.length !== 0) out.push('junk cleaned: ' + JSON.stringify(c));
      const c2 = a.cleanMakeup(Object.assign({}, junk, { photos: [junkPhoto('🐻')] }));
      const ph = c2.photos[0];
      if (!ph || !eq(ph.l.z, { top: 'cone' }) || !eq(ph.l.x, ['clown']) || ph.l.o !== null || ph.r.e !== '🐻') out.push('photo cleaned: ' + JSON.stringify(c2.photos));
      if (a.cleanMakeup({ done: 0, played: { jungle: 2 } }).played.jungle) out.push('an unearned party is dropped');
      const good = { p: 'circus', l: { e: '🐰', z: { nose: 'clown' }, x: [], o: 'wave' }, r: { e: '🐻', z: {}, x: [], o: 'kiss' } };
      if (a.cleanMakeup({ done: 3, photos: Array(12).fill(good) }).photos.length !== 8) out.push('12 photos are cut to 8');
      // unlocks and gifts
      const u0 = a.unlocks(0), u1 = a.unlocks(1), u13 = a.unlocks(13);
      if (!eq(u0.parties, ['party', 'circus']) || u0.next !== 'hero') out.push('unlocks(0)');
      const newItems = u1.items.filter((id) => !u0.items.includes(id));
      if (!eq(u1.parties, ['party', 'circus', 'hero']) || !eq(newItems.sort(), ['bolt', 'cape', 'mask-blue', 'mask-red'])) out.push('unlocks(1): ' + newItems);
      if (u13.parties.length !== 8 || Object.keys(u13.helpers).length !== 4 || u13.tier !== 3 || u13.next !== null) out.push('unlocks(13)');
      if (a.unlocks(19).decor.length !== 6) out.push('unlocks(19) decor');
      if (!a.MENU.every((id) => a.unlocks(35).medals[id] === 2)) out.push('unlocks(35) medals');
      const kinds = [...Array(36).keys()].map((i) => a.giftFor(i).kind);
      const want = ['party', 'helper', 'party', 'tier', 'party', 'helper', 'party', 'tier', 'party', 'helper', 'party', 'tier', 'helper'].concat(Array(6).fill('decor'), Array(16).fill('medal'), ['thanks']);
      if (!eq(kinds, want)) out.push('gift kinds: ' + kinds);
      if (a.giftFor(500).kind !== 'thanks') out.push('giftFor(500)');
      // the data rules (spec 4.5)
      const ids = Object.keys(a.ITEMS);
      ids.forEach((id) => {
        const it = a.ITEMS[id];
        if (!a.ZONES.includes(it.z) || !a.KINDS[it.k]) out.push(id + ': zone and kind');
        if (it.party && !a.PARTIES[it.party]) out.push(id + ': party');
      });
      const MID = ['cheeks', 'eyes', 'nose', 'mouth', 'neck', 'top'];
      a.MENU.forEach((pid) => {
        const P = a.PARTIES[pid];
        if (P.zones.length < 4 || P.zones.length > 5 || new Set(P.zones).size !== P.zones.length || !P.zones.every((z) => MID.includes(z))) out.push(pid + ': 4-5 zones');
        if (!P.extra.length || !P.extra.every((z) => P.zones.includes(z)) || P.zones.length - P.extra.length < 3) out.push(pid + ': extra');
        const at = a.START.includes(pid) ? 0 : [...Array(13).keys()].find((i) => a.giftFor(i).id === pid) + 1;
        const pool = a.unlocks(at).items;
        Object.keys(P.sig).forEach((z) => { const id = P.sig[z]; if (!a.ITEMS[id] || a.ITEMS[id].z !== z || !pool.includes(id)) out.push(pid + ': sig ' + z); });
        P.zones.concat(['sparkle', 'pose']).forEach((z) => { if (pool.filter((id) => a.ITEMS[id].z === z).length < 3) out.push(pid + ': 3 items in ' + z + ' when it unlocks'); });
        ['full', 'short'].forEach((len) => {
          const zs = a.zonesFor(P, len);
          if (zs.slice(-2).join() !== 'sparkle,pose' || zs.indexOf('wash') > 0 || (len === 'short') === zs.includes('wash') || zs.length > 8) out.push(pid + ': zones ' + len);
        });
      });
      a.LOOKS.forEach((L) => {
        L.need.forEach(([z, list]) => { if (!list.every((id) => a.ITEMS[id] && a.ITEMS[id].z === z)) out.push(L.id + ': needs'); });
        if (L.id === 'spy') return;
        const by = a.MENU.find((pid) => { const P = a.PARTIES[pid]; return L.need.every(([z, list]) => list.includes(P.sig[z]) && P.zones.includes(z) && !P.extra.includes(z)); });
        if (!by) out.push(L.id + ': two signature items of one party, both in Short');
      });
      Object.keys(a.KINDS).forEach((k) => [false, true].forEach((isB) => ['few', 'normal', 'lots'].forEach((d) => [0, 1, 2].forEach((hp) => {
        const n = a.nFor(k, isB, d, hp), K = a.KINDS[k];
        if (n < 1 || n > (isB ? 6 : 5)) out.push(`nFor ${k} ${n}: at most 5 taps a step for her, 6 for him`);
        if (K.fixed && n !== K.fixed[isB ? 1 : 0]) out.push(`nFor fixed ${k}`);
        if (isB && !K.fixed && K.plus && hp === 0 && n <= a.nFor(k, false, d, 0)) out.push(`nFor ${k} ${d}: his one more holds at every Dabs option`);
      }))));
      // every dab visibly changes the face: at least 9em of new pieces (a named stage; past the named slots, a big sparkle
      // that pops in, the ones before it settled small); every fixed dab is a named stage
      Object.keys(a.ITEMS).forEach((id) => {
        const it = a.ITEMS[id], K = a.KINDS[it.k];
        if (it.k === 'pose') return;
        if (K.fixed && K.named < Math.max(...K.fixed)) out.push(`${it.k}: every fixed dab has a look of its own`);
        (K.fixed ? [...new Set(K.fixed)] : [3, 4, 5, 6]).forEach((n) => { for (let k = 1; k <= n; k++) {
          const ps = a.piecesFor(id, k, { n }), fr = ps.filter((q) => q.d === k - 1);
          const size = fr.reduce((sum, q) => sum + (q.e ? q.fs : Math.max(q.w, q.h)), 0);
          if (size < 9) out.push(`${id} dab ${k} of ${n}: only ${size}em is new`);
          if (k > K.named && it.k !== 'foam') {
            const big = ps.filter((q) => /mk-spare/.test(q.cls || ''));
            if (big.length !== 1 || big[0].d !== k - 1 || big[0].fs < 11 || !fr.some((q) => /mk-burst/.test(q.cls || ''))) out.push(`${id} dab ${k} of ${n}: the newest spare sparkle is big and bursts, the rest small`);
          }
        } });
      });
      if (!eq(Object.keys(a.ANIMALS).sort(), MG.AVATARS.slice().sort())) out.push('ANIMALS = MG.AVATARS');
      for (let n = 2; n <= 6; n++) { let last = 0; for (let k = 1; k < n; k++) { const f = a.foamed(k, n); if (f < last) out.push('foamed falls'); last = f; } if (a.foamed(n - 1, n) !== 3) out.push('foamed reaches 3 at n-1, n=' + n); }
      // trays: 200 seeds x every party x zone
      let seed = 1;
      const rnd = { shuffle: (arr) => { const o = arr.slice(); for (let i = o.length - 1; i > 0; i--) { seed = (seed * 16807) % 2147483647; const j = seed % (i + 1); [o[i], o[j]] = [o[j], o[i]]; } return o; } };
      for (let s = 0; s < 200; s++) {
        a.MENU.forEach((pid) => {
          const P = a.PARTIES[pid], at = a.START.includes(pid) ? 0 : [...Array(13).keys()].find((i) => a.giftFor(i).id === pid) + 1, items = a.unlocks(at + (s % 3) * 4).items;
          a.zonesFor(P, 'full').forEach((z) => [false, true].forEach((isB) => {
            const pool = items.filter((id) => a.ITEMS[id].z === z), tr = a.trayFor(z, P, isB, pool, rnd);
            if (z === 'wash') { if (!eq(tr, ['sponge'])) out.push('wash tray'); return; }
            if (z === 'pose') { if (!eq(tr.slice().sort(), a.POSES.slice().sort())) out.push('pose tray'); return; }
            if (tr.length !== 3 || new Set(tr).size !== 3 || !tr.every((id) => pool.includes(id))) out.push(`${pid}/${z}: 3 distinct unlocked items`);
            if (P.sig[z] && pool.includes(P.sig[z]) && !tr.includes(P.sig[z])) out.push(`${pid}/${z}: the signature`);
            if (isB && pool.some((id) => a.ITEMS[id].silly) && !tr.some((id) => a.ITEMS[id].silly)) out.push(`${pid}/${z}: something silly for the grown-up`);
          }));
        });
      }
      return [...new Set(out)];
    });
    assert.deepStrictEqual(r, [], 'every rule and data check holds');
    // the emoji audit: every pictograph in the game's source is in Appendix A (Unicode 11 or older)
    const src = fs.readFileSync(path.join(h.ROOT, 'js', 'games', 'makeup.js'), 'utf8').replace(/\u{FE0F}/gu, '');
    const used = [...new Set(src.match(/\p{Extended_Pictographic}/gu))];
    assert.deepStrictEqual(used.filter((e) => !ALLOWED.includes(e)), [], 'every emoji is from Appendix A');
    lap(1);
  }

  // --- 2. a full round with real taps
  if (part(2)) {
    await openMakeup(page);
    assert.deepStrictEqual(await page.evaluate(() => [document.querySelectorAll('.g-makeup .mk-card').length, !document.querySelector('.g-makeup .mk-next').hidden, document.querySelectorAll('.g-makeup .mk-lookslot').length]), [2, true, 6], 'two cards, the next present and the look book');
    await page.waitForFunction(() => MG.current.api.hinted && MG.current.api.hinted.dataset.id === 'party', null, { timeout: 1500 });
    await tap(page, '.g-makeup .mk-next', 60);
    assert.strictEqual(await api(page, 'state'), 'menu', 'the next card is not a button');
    await tap(page, '.g-makeup .mk-card[data-id="party"]', 0);
    assert.deepStrictEqual([await api(page, 'state'), await api(page, 'mud')], ['deal', [3, 3]], 'the friends arrive muddy');
    await stateIs(page, 'zone');
    const zones = await api(page, 'zones');
    assert.deepStrictEqual(zones, ['wash', 'cheeks', 'eyes', 'mouth', 'neck', 'top', 'sparkle', 'pose']);
    const chosen = [{}, {}];
    for (let zi = 0; zi < zones.length; zi++) {
      const z = zones[zi];
      await page.waitForFunction((zi) => MG.current.api.state === 'zone' && MG.current.api.zoneIndex === zi, zi, { timeout: 8000 });
      await gameWait(page, 0.32);
      if (z === 'pose') assert.ok(await page.locator('.g-makeup .mk-spare.is-settled').count() >= 2, 'help Off: past the named slots (the cheeks, at least) the dabs made big sparkles, now settled');
      for (const s of [0, 1]) {
        const b0 = (await boards(page))[s];
        const id = z === 'pose' ? (s === 0 ? 'ears' : 'kiss') : b0.tray[0];
        chosen[s][z] = id;
        let k = 0, count = await pieces(page, s, z);
        for (let i = 0; i < 8; i++) {
          const before = (await boards(page))[s];
          if (before.done) break;
          const sel = i > 0 && s === 1 ? `${B(s)} .mk-mirror` : ITEM(s, id);
          await tap(page, sel, 0);
          let b = (await boards(page))[s];
          assert.strictEqual(b.k, k + 1, `${z}: one counted tap is one dab (board ${s})`);
          assert.ok(b.k <= b.n, `${z}: never past n`);
          k = b.k;
          const c = await pieces(page, s, z);
          if (z === 'wash' && b.k === b.n) assert.deepStrictEqual((await api(page, 'mud'))[s], 0, 'the mud is gone at the rinse');
          else assert.ok(c > count, `${z}: the layer grows on every dab (${count} -> ${c})`);
          count = c;
          if (!b.done) {   // a tap inside the gap is refused: nothing changes
            await tap(page, sel, 0);
            b = (await boards(page))[s];
            assert.strictEqual(b.k, k, `${z}: a tap inside the gap is not counted`);
            assert.strictEqual(await pieces(page, s, z), count, `${z}: and draws nothing`);
          }
          await gameWait(page, 0.27);
        }
        assert.ok((await boards(page))[s].done, `${z}: board ${s} done`);
      }
      if (zi < zones.length - 1) {
        await page.waitForFunction((zi) => MG.current.api.zoneIndex === zi + 1, zi, { timeout: 5000 });
        assert.strictEqual(await page.locator('.g-makeup .mk-spare:not(.is-settled)').count(), 0, 'the last step\'s big spare sparkles settle small');
        assert.strictEqual(await page.locator('.g-makeup .mk-pip.is-done').count(), zi + 1, 'the pips get a tick one by one');
      }
    }
    await stateIs(page, 'finale');
    const sv = await saved(page);
    assert.deepStrictEqual([sv.done, sv.played, sv.photos.length], [1, { party: 1 }, 1], 'saved as soon as the finale starts');
    const ph = sv.photos[0], LZ = ['cheeks', 'eyes', 'mouth', 'neck', 'top', 'sparkle'];
    const zOf = (s) => Object.fromEntries(LZ.map((z) => [z, chosen[s][z]]));
    // (the random trays can make a secret look, e.g. specs and a moustache: the spy; the photo carries what each board found)
    const found = (await boards(page)).map((b) => b.found);
    assert.deepStrictEqual(ph, { p: 'party', l: { e: '🐰', z: zOf(1), x: found[1], o: 'kiss' }, r: { e: '🐻', z: zOf(0), x: found[0], o: 'ears' } }, 'the photo: both animals, the chosen items, the looks found, both poses');
    const win = await t.waitForWin(page, 8000);
    assert.strictEqual(win.faces.length, 2);
    await openMakeup(page, { keep: true });
    const menu = await page.evaluate(() => ({
      party: document.querySelectorAll('.g-makeup .mk-card[data-id="party"] .mk-card__stars .mg-sticker').length,
      circus: !!document.querySelector('.g-makeup .mk-card[data-id="circus"] .mk-card__new'),
      hero: !!document.querySelector('.g-makeup .mk-card[data-id="hero"] .mk-card__new'),
      next: document.querySelector('.g-makeup .mk-next .mk-next__sil').textContent,
      gift: !!document.querySelector('.g-makeup .mk-next .mk-next__tag'),
      photos: document.querySelectorAll('.g-makeup .mk-polaroid:not(.is-empty)').length,
    }));
    assert.deepStrictEqual(menu, { party: 1, circus: true, hero: true, next: '🐯', gift: true, photos: 1 }, 'reopened: a star for the party, new circus and hero, the jungle next, one photo on the wall');
    lap(2);
  }

  // --- 3. swaps never cost or break anything; the poodle catches cast-offs
  if (part(3)) {
    await openMakeup(page, { kit: { done: 2 }, length: 'short' });
    await startAt(page, 'party');
    assert.strictEqual(await api(page, 'zone'), 'cheeks');
    let b = (await boards(page))[1];
    const [x, y, z] = b.tray;
    await tap(page, ITEM(1, x), 0); await gameWait(page, 0.27);
    assert.strictEqual((await boards(page))[1].k, 1);
    const emojiOf = (id) => A(page, (a, id) => a.ITEMS[id].e || null, id);
    await tap(page, ITEM(1, y), 0);
    b = (await boards(page))[1];
    assert.deepStrictEqual([b.item, b.k], [y, 2], 'a different item: chosen, and its first dab is the next one');
    const ey = await emojiOf(y);
    if (ey) assert.ok(await page.evaluate(([e]) => [...document.querySelectorAll('.g-makeup .mk-board[data-side="1"] .mk-layer[data-zone="cheeks"] .mg-sticker')].some((n) => n.textContent === e), [ey]), 'the pieces switch to the new item');
    assert.deepStrictEqual(await api(page, 'poodle'), { earned: true, wearing: x, catches: 1 }, 'the cast-off flies to the poodle, who wears it');
    await gameWait(page, 0.27);
    await tap(page, ITEM(1, z), 0);
    b = (await boards(page))[1];
    assert.deepStrictEqual([b.item, b.k], [z, 3], 'the third item takes the next dab');
    for (let i = 0; i < 6 && !b.done; i++) { await gameWait(page, 0.27); await tap(page, ITEM(1, z), 0); b = (await boards(page))[1]; }
    assert.ok(b.done && b.k === b.n && b.item === z, `and, dabbed on, finishes the board (his ${b.n})`);
    for (let i = 0; i < 10; i++) { await tap(page, ITEM(1, [x, y, z][i % 3]), 0); await gameWait(page, 0.27); }
    b = (await boards(page))[1];
    const last = [x, y, z][9 % 3];
    assert.ok(b.done && b.k === b.n && b.item === last, '10 swaps on a done board: still done, k == n, the last item');
    assert.strictEqual((await api(page, 'poodle')).catches, 3, 'from the 4th cast-off the poodle only catches');
    assert.strictEqual(await api(page, 'state'), 'zone');
    await finishBoard(page, 0);
    await page.waitForFunction(() => ['admire', 'zone'].includes(MG.current.api.state) && MG.current.api.zoneIndex >= 0 && (MG.current.api.state === 'admire' || MG.current.api.zone !== 'cheeks'), null, { timeout: 3000 });
    lap(3);
  }

  // --- 4. following only the hand: every party, five secret looks
  if (part(4)) {
    await openMakeup(page, { scale: 8 });
    const played = [];
    for (let round = 0; round < 8; round++) {
      if (round === 1) assert.ok(await A(page, (a) => a.setKit({ done: 13, played: { party: 1 }, looks: a.kit.looks, seen: a.kit.seen })), 'the whole salon');
      const r = await followHand(page, 800);
      assert.ok(r.over, `round ${round + 1} reaches the win by following the hand only (${r.steps} steps)`);
      assert.deepStrictEqual(r.bad, [], 'the hand never points at a done board, a mirror, the wall, the next card, the look book or an item off its path');
      assert.ok(r.herOk, 'while her board is unfinished, the hand is on her board');
      played.push(r.party);
      await t.waitForWin(page, 8000);
      await openMakeup(page, { keep: true, scale: 8 });
    }
    assert.deepStrictEqual(played.slice().sort(), ['beach', 'circus', 'hero', 'jungle', 'party', 'rainbow', 'royal', 'space'], 'every party is played once: ' + played);
    const looks = (await api(page, 'kit')).looks;
    assert.ok(['clown', 'tiger', 'hero', 'royal', 'alien'].every((l) => looks.includes(l)), 'the hand finds five of the six secret looks: ' + looks);
    lap(4);
  }

  // --- 5. mashing: four fingers everywhere never break anything
  if (part(5)) {
    await openMakeup(page, { kit: { done: 2 } });
    const one = await page.evaluate(() => {
      const ns = [...document.querySelectorAll('.g-makeup .mk-card, .g-makeup .mk-next, .g-makeup .mk-lookslot')].slice(0, 4);
      ns.forEach((n, k) => { const r = n.getBoundingClientRect(); n.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 7000 + k, pointerType: 'touch', clientX: r.left + 10, clientY: r.top + 10 })); });
      return [MG.current.api.state, MG.current.api.party, document.querySelectorAll('.g-makeup .mk-card[aria-disabled="true"]').length];
    });
    assert.deepStrictEqual(one, ['deal', 'party', 3], 'four fingers on the menu at once: exactly one party starts (and every card is off)');
    await page.evaluate(() => { const c = MG.current.ctx, w = c.win; window.__wins = 0; c.win = function () { window.__wins++; return w.apply(this, arguments); }; });
    const mash = (ms, o = {}) => page.evaluate(async ([ms, o]) => {
      const C = MG.current.ctx, g = document.querySelector('#mg-game').getBoundingClientRect(), log = { zones: [], over: [], locked: 0, finaleAt: null, afterFinale: 0 };
      let id = 60000, last = MG.current.api.zoneIndex;
      const touch = (n, x, y) => { const e = { bubbles: true, cancelable: true, pointerId: ++id, pointerType: 'touch', clientX: x, clientY: y }; n.dispatchEvent(new PointerEvent('pointerdown', e)); n.dispatchEvent(new PointerEvent('pointerup', e)); };
      const end = performance.now() + ms;
      while (performance.now() < end) {
        for (let f = 0; f < 4; f++) {
          const x = g.left + Math.random() * g.width, y = g.top + Math.random() * g.height;
          const n = document.elementFromPoint(x, y);
          if (n) touch(n, x, y);
        }
        const a = MG.current.api;
        if (o.hand && a.state === 'zone') { a.hintNext(); const n = a.hinted; if (n) { const r = n.getBoundingClientRect(); touch(n, r.left + r.width / 2, r.top + r.height / 2); } }
        if (a.zoneIndex !== last) { log.zones.push(a.zoneIndex - last); last = a.zoneIndex; }
        a.boards.forEach((b) => { if (b.k > b.n) log.over.push(b.item + ' ' + b.k + '/' + b.n); });
        if (a.locked) log.locked++;
        if (a.state === 'finale' && log.finaleAt === null) log.finaleAt = C.time;
        if (log.finaleAt !== null) log.afterFinale = C.time - log.finaleAt;
        if (o.afterFinale && log.afterFinale >= o.afterFinale) break;
        await new Promise((r) => setTimeout(r, 15));
      }
      return log;
    }, [ms, o]);
    let log = await mash(3000);
    assert.ok(log.zones.every((d) => d === 1), 'zones only ever go forward one at a time: ' + log.zones);
    assert.deepStrictEqual(log.over, [], 'never more dabs than a step takes');
    assert.strictEqual(log.locked, 0, 'and nothing is ever locked');
    await page.evaluate(() => { MG.timeScale = 8; });
    await handUntil(page, (a) => a.state === 'zone' && a.zone === 'pose');
    await page.evaluate(() => { MG.timeScale = 1; });
    log = await mash(15000, { hand: true, afterFinale: 2.8 });
    assert.ok(log.finaleAt !== null && log.afterFinale >= 2.8, `mashed through the pose and ${log.afterFinale.toFixed(2)}s of the finale`);
    assert.ok(log.zones.every((d) => d === 1));
    assert.deepStrictEqual(log.over, []);
    assert.strictEqual(log.locked, 0);
    await t.waitForWin(page, 8000);
    await page.waitForTimeout(400);
    assert.strictEqual(await page.evaluate(() => window.__wins), 1, 'the party is called exactly once under the mashing');
    const ev = await api(page, 'events');
    const gaps = [0, 1].map((s) => { const ts = ev.filter((e) => e.side === s).map((e) => e.t); let m = Infinity; for (let i = 1; i < ts.length; i++) m = Math.min(m, ts[i] - ts[i - 1]); return m; });
    assert.ok(ev.length > 10 && gaps.every((g) => g >= 0.16 - 1e-6), `counted dabs on one board are never closer than the gap (${gaps.map((g) => g.toFixed(3))}, ${ev.length} dabs)`);
    lap(5);
  }

  // --- 6. never stuck
  if (part(6)) {
    await openMakeup(page, { length: 'short' });
    await startAt(page, 'party');
    await tap(page, `${B(0)} .mk-mirror`, 0);
    let b = (await boards(page))[0];
    assert.deepStrictEqual([b.k, b.item, b.noPick], [0, null, 1], 'a face tap with nothing chosen: a giggle, no progress');
    assert.ok(await page.evaluate(() => [...document.querySelectorAll('.g-makeup .mk-board[data-side="0"] .mk-item')].every((n) => n.getAnimations().length > 0)), 'the tray wiggles');
    await gameWait(page, 0.2);
    await tap(page, `${B(0)} .mk-mirror`, 0);
    assert.strictEqual(await page.evaluate(() => MG.current.api.hinted && MG.current.api.hinted.dataset.id), 'star', 'the second one brings the hand to the signature at once');
    // the grown-up's fingers alone finish both boards
    await finishBoard(page, 0, 'star');
    await finishBoard(page, 1);
    await stateIs(page, 'admire', 3000);
    // in the wash the sponge is already in hand: a first tap on the mirror dabs
    await openMakeup(page);
    await startAt(page, 'party');
    await tap(page, `${B(0)} .mk-mirror`, 0);
    b = (await boards(page))[0];
    assert.deepStrictEqual([b.item, b.k], ['sponge', 1], 'in the wash, a mirror tap dabs');
    // help Some: the second face tap picks the signature for her
    const p1 = await newPage(t, { help: 1 });
    await openMakeup(p1, { length: 'short' });
    await startAt(p1, 'party');
    await tap(p1, `${B(0)} .mk-mirror`, 0);
    await gameWait(p1, 0.2);
    await tap(p1, `${B(0)} .mk-mirror`, 0);
    b = (await boards(p1))[0];
    assert.deepStrictEqual([b.item, b.k], ['star', 1], 'help Some: the second face tap chooses the signature (dab 1)');
    await p1.close();
    lap(6);
  }

  // --- 7. secret looks
  if (part(7)) {
    await openMakeup(page, { kit: { done: 1 } });
    await page.evaluate((KEY) => { window.__writes = 0; const set = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k === KEY) window.__writes++; return set.call(this, k, v); }; }, KEY);
    await startAt(page, 'circus', 'nose');
    await finishBoard(page, 1, 'clown');
    await finishBoard(page, 0);
    await handUntil(page, (a) => a.state === 'zone' && a.zone === 'top');
    await gameWait(page, 0.35);
    const w0 = await page.evaluate(() => window.__writes);
    await tap(page, ITEM(1, 'wig'), 0);
    let bs = await boards(page);
    assert.deepStrictEqual([bs[1].found, bs[0].found], [['clown'], []], 'the clown look shows on that board only');
    assert.deepStrictEqual((await saved(page)).looks, ['clown'], 'and is saved at once');
    const w1 = await page.evaluate(() => window.__writes);
    assert.strictEqual(w1, w0 + 1, 'one save for the new look');
    await gameWait(page, 0.27);
    const other = bs[1].tray.find((id) => id !== 'wig');
    await tap(page, ITEM(1, other), 0); await gameWait(page, 0.27);
    await tap(page, ITEM(1, 'wig'), 0); await gameWait(page, 0.27);
    bs = await boards(page);
    assert.deepStrictEqual(bs[1].found, ['clown'], 'taking the wig off and on again: still found, once');
    assert.strictEqual(await page.evaluate(() => window.__writes), w1, 'the same look again: no second save');
    await page.waitForFunction(() => document.querySelectorAll('.g-makeup .mk-board[data-side="1"] .mk-badge').length === 1);
    const r = await followHand(page, 400);
    assert.ok(r.over);
    assert.deepStrictEqual((await saved(page)).photos[0].l.x, ['clown'], 'the badge is in the photo');
    await t.waitForWin(page, 8000);
    // spy: specs and a moustache, found by exploring
    await openMakeup(page);
    await startAt(page, 'party', 'eyes');
    assert.ok(await A(page, (a) => a.setTray(0, ['specs', 'lashes', 'googly'])));
    await finishBoard(page, 0, 'specs');
    await finishBoard(page, 1);
    await handUntil(page, (a) => a.state === 'zone' && a.zone === 'mouth');
    await gameWait(page, 0.35);
    assert.ok(await A(page, (a) => a.setTray(0, ['stache', 'lips-red', 'smile'])));
    await tap(page, ITEM(0, 'stache'), 0);
    assert.deepStrictEqual((await boards(page))[0].found, ['spy'], 'specs and a moustache: the spy');
    assert.ok((await saved(page)).looks.includes('spy'));
    lap(7);
  }

  // --- 8. surprises, marks and poses
  if (part(8)) {
    await openMakeup(page, { length: 'short' });
    await startAt(page, 'party', 'sparkle');
    const before = (await boards(page))[1];
    await tap(page, ITEM(0, (await boards(page))[0].tray[0]), 0); await gameWait(page, 0.27);
    await A(page, (a) => a.surprise({ sneeze: true }));
    await tap(page, `${B(0)} .mk-mirror`, 0);
    let bs = await boards(page);
    assert.ok(bs[0].sneezed, 'dab 2 of the glitter: a sneeze');
    assert.deepStrictEqual([bs[1].k, bs[1].item, bs[1].look], [before.k, before.item, before.look], 'the other friend is unchanged');
    assert.deepStrictEqual((await api(page, 'marks')).map((m) => m.glitter), [3, 3], 'both stylists get glitter');
    await page.waitForFunction(() => document.querySelectorAll('.g-makeup .mk-puff').length === 1, null, { timeout: 2000 });
    await gameWait(page, 2.3);
    assert.strictEqual(await page.locator('.g-makeup .mk-puff').count(), 0, 'the puff fades away');
    await A(page, (a) => a.surprise({ sneeze: true }));
    await finishBoard(page, 0);
    assert.deepStrictEqual((await api(page, 'marks')).map((m) => m.glitter), [3, 3], 'never a second sneeze on one board');
    await A(page, (a) => a.surprise({ sneeze: false }));
    await finishBoard(page, 1);
    // poses: ears on board 0, a kiss on board 1
    await page.waitForFunction(() => MG.current.api.state === 'zone' && MG.current.api.zone === 'pose', null, { timeout: 5000 });
    await gameWait(page, 0.35);
    await tap(page, ITEM(0, 'ears'), 0);
    await tap(page, ITEM(1, 'kiss'), 0);
    const tF = await page.evaluate(() => MG.current.ctx.time);      // (the second pose starts the finale in that tap)
    await stateIs(page, 'finale');
    await page.waitForSelector('.g-makeup .mk-frame.is-posed', { timeout: 4000 });
    // the posed photo, the round's punchline, is still there in full 1.8s in (it holds from 1.15s to 2.35s)
    await page.waitForFunction((t) => MG.current.ctx.time >= t + 1.8, tF, { timeout: 5000 });
    const held = await page.evaluate(() => {
      const f = document.querySelector('.g-makeup .mk-frame'), r = f.getBoundingClientRect(), g = document.querySelector('#mg-game').getBoundingClientRect();
      return { shown: !f.hidden, posed: f.classList.contains('is-posed'), full: r.width >= f.offsetWidth * 0.98, moving: f.getAnimations().length,
        inView: r.left >= g.left - 1 && r.right <= g.right + 1 && r.top >= g.top - 1 && r.bottom <= g.bottom + 1, poses: document.querySelectorAll('.g-makeup .mk-frame .mk-posed').length };
    });
    assert.deepStrictEqual([held.shown, held.posed, held.full, held.moving, held.inView], [true, true, true, 0, true], 'the posed photo is still fully on screen 1.8s into the finale: ' + JSON.stringify(held));
    assert.ok(held.poses >= 2, 'with both poses on it');
    // (timed in the page: the game clock when the party overlay appears)
    const tEnd = await page.evaluate(() => new Promise((res) => { const c = MG.current.ctx, f = () => (document.querySelector('.mg-overlay--win') ? res(c.time) : setTimeout(f, 3)); f(); }));
    assert.ok(tEnd - tF < 4, `the finale ends under 4s (${(tEnd - tF).toFixed(2)}s)`);
    const frame = await page.evaluate(() => ({
      l: [...document.querySelectorAll('.g-makeup .mk-fslot[data-side="l"] .mk-posed .mg-sticker')].map((n) => n.textContent),
      lUnder: [...document.querySelectorAll('.g-makeup .mk-fslot[data-side="l"] .mk-under .mk-posed .mg-sticker')].map((n) => n.textContent),
      r: [...document.querySelectorAll('.g-makeup .mk-fslot[data-side="r"] .mk-posed .mg-sticker')].map((n) => n.textContent),
    }));
    assert.ok(frame.lUnder.includes('✌️') && frame.r.includes('💋'), 'bunny ears behind the left friend, a kiss on the right friend: ' + JSON.stringify(frame));
    const ph = (await saved(page)).photos[0];
    assert.deepStrictEqual([ph.r.o, ph.l.o], ['ears', 'kiss'], 'the saved photo has both poses');
    await t.waitForWin(page, 8000);
    // a lips tickle on a done mouth: a kiss for the stylist, up to three
    await openMakeup(page, { length: 'short' });
    await startAt(page, 'party', 'mouth');
    await finishBoard(page, 0, 'lips-red');
    let k0 = (await api(page, 'marks'))[0].kiss;
    await page.waitForTimeout(600);
    await tap(page, `${B(0)} .mk-mirror`, 0);
    await page.waitForTimeout(600);
    assert.strictEqual((await api(page, 'marks'))[0].kiss, Math.min(3, k0 + 1), 'a lips tickle sends a kiss to the stylist');
    for (let i = 0; i < 4; i++) { await gameWait(page, 0.32); await tap(page, `${B(0)} .mk-mirror`, 0); }
    assert.strictEqual((await api(page, 'marks'))[0].kiss, 3, 'up to three kisses');
    lap(8);
  }

  // --- 9. every size: menu, a cheeks zone, the capstone with a full wall, the finale photo and the present
  if (part(9)) {
    const FULLWALL = (() => {
      const ph = (p, i) => ({ p, l: { e: '🐰', z: { cheeks: 'star', nose: 'clown', top: ['wig', 'crown', 'duck', 'cone'][i % 4], sparkle: 'stars' }, x: i % 2 ? ['clown'] : [], o: 'ears' }, r: { e: '🐻', z: { eyes: 'specs', mouth: 'lips-red', neck: 'bowtie', top: 'tophat' }, x: [], o: 'kiss' } });
      return { done: 40, looks: ['clown', 'tiger', 'hero', 'royal', 'spy', 'alien'], played: { party: 2 }, photos: ['party', 'circus', 'hero', 'jungle', 'royal', 'beach', 'space', 'rainbow'].map(ph) };
    })();
    const runs = [['small'], ['phone'], ['phoneWide', 'dark'], ['phoneWide'], ['smallWide'], ['tabletTall', 'rm'], ['tabletTall'], ['tablet', 'dark'], ['tablet']];
    for (const [vp, mode] of runs) {
      const label = `@${vp}${mode ? ' ' + mode : ''}`, tag = `${vp}${mode ? '-' + mode : ''}`;
      const p = await newPage(t, { viewport: vp === 'smallWide' ? SMALL_WIDE : vp, dark: mode === 'dark', reducedMotion: mode === 'rm' });
      await openMakeup(p, { kit: { done: 13, looks: FULLWALL.looks } });
      await layoutChecks(t, p, 'menu ' + label);
      assert.strictEqual(await p.locator('.g-makeup .mk-card').count(), 8);
      if (!mode) await t.shot(p, `${ID}-${vp}-menu.png`);
      await openMakeup(p, { length: 'short' });
      await startAt(p, 'party');
      for (const s of [0, 1]) await tap(p, ITEM(s, (await boards(p))[s].tray[0]), 0);
      await p.waitForTimeout(250);
      await layoutChecks(t, p, 'zone ' + label);
      if (!mode) await t.shot(p, `${ID}-${vp}-zone.png`);
      if (!mode && /Wide$|^tablet$/.test(vp)) {
        // landscape, tier 3 (the marquee and its two animals) in a Short round: one row of big pips, all on the sign
        await openMakeup(p, { length: 'short', kit: FULLWALL });
        await startAt(p, 'party');
        assert.strictEqual(await p.evaluate(() => document.querySelector('.g-makeup .mk-wall').dataset.tier), '3', 'the marquee is up');
        for (const s of [0, 1]) await tap(p, ITEM(s, (await boards(p))[s].tray[0]), 0);
        await p.waitForTimeout(250);
        await layoutChecks(t, p, 'tier-3 Short zone ' + label, { wall: vp === 'tablet' ? 4 : 3 });
        await t.shot(p, `${ID}-${vp}-short3.png`);
      }
      await openMakeup(p, { kit: FULLWALL });
      await startAt(p, 'rainbow');
      assert.strictEqual(await p.locator('.g-makeup .mk-pip').count(), 8, 'the capstone has 8 pips');
      for (const s of [0, 1]) await tap(p, `${B(s)} .mk-mirror`, 0);
      await p.waitForTimeout(300);
      await layoutChecks(t, p, 'capstone ' + label, { wall: /^tablet/.test(vp) ? 4 : 3 });   // (8 photos saved)
      if (!mode) await t.shot(p, `${ID}-${vp}-wall.png`);
      else await t.shot(p, `${ID}-${tag}-wall.png`);
      await openMakeup(p, { length: 'short', dabs: 'few', kit: { done: 3 } });
      await p.evaluate(() => { MG.timeScale = 8; });
      await startAt(p, 'party');
      await handUntil(p, (a) => a.state === 'finale');
      await p.evaluate(() => { MG.timeScale = 0.5; });
      await p.waitForSelector('.g-makeup .mk-frame.is-posed', { timeout: 6000 });
      await p.evaluate(() => { MG.timeScale = 0.08; });   // (the photo holds 1.2s before it flies to the wall: slow the clock for the checks)
      await p.waitForTimeout(350);
      await layoutChecks(t, p, 'photo ' + label);
      await t.shot(p, `${ID}-${tag}-photo.png`);
      await p.evaluate(() => { MG.timeScale = 1; });
      await p.waitForSelector('.g-makeup .mk-gift.is-open', { timeout: 4000 });
      await p.waitForTimeout(500);
      await layoutChecks(t, p, 'gift ' + label);
      await t.shot(p, `${ID}-${tag}-gift.png`);
      await t.waitForWin(p, 6000);
      await p.close();
    }
    lap(9);
  }

  // --- 10. the face geometry: every animal, a full look, at 95px and 320px
  if (part(10)) {
    await openMakeup(page);
    for (const M of [95, 320]) {
      const r = await page.evaluate((M) => {
        const a = MG.current.api, root = document.querySelector('#mg-game'), out = [];
        const box = document.createElement('div');
        box.style.cssText = 'position:absolute;inset:0;z-index:50;display:flex;flex-wrap:wrap;align-content:flex-start;gap:8px;padding:8px;overflow:hidden;background:var(--mk-wall)';
        root.appendChild(box);
        const look = { z: { cheeks: 'star', eyes: 'specs', nose: 'clown', mouth: 'lips-red', neck: 'bowtie', top: 'cone', sparkle: 'gold' }, o: 'ears' };
        MG.AVATARS.forEach((e) => {
          const mir = document.createElement('div');
          mir.className = 'mk-testmirror';
          mir.style.cssText = `box-sizing:border-box;width:${M + 12}px;height:${Math.ceil(M * 1.2) + 18}px;display:flex;align-items:flex-end;justify-content:center;background:var(--mk-glass);border:6px solid var(--p0);border-radius:12px;overflow:hidden`;
          const f = a.renderFace(e, look, M, 'var(--p1)', { side: 'l', kissed: true, eared: true });
          f.dataset.e = e;
          mir.appendChild(f);
          box.appendChild(mir);
        });
        const res = [...box.querySelectorAll('.mk-model')].map((f) => {
          const e = f.dataset.e, R = f.getBoundingClientRect(), em = R.width / 100, bad = [];
          const inBox = (q, tol) => q.left >= R.left - tol && q.right <= R.right + tol && q.top >= R.top - tol && q.bottom <= R.bottom + tol;
          f.querySelectorAll('*').forEach((n) => {
            const q = n.getBoundingClientRect();
            if (!q.width && !q.height) return;
            if (n.closest('.mk-skin') && !n.classList.contains('mk-skin')) return;   // (clipped by the head)
            if (!inBox(q, 1)) bad.push((n.className.baseVal != null ? 'svg' : n.className) + ' ' + JSON.stringify([q.left - R.left, q.top - R.top, q.right - R.left, q.bottom - R.top].map((v) => +(v / em).toFixed(1))));
          });
          const mir = f.parentNode.getBoundingClientRect();
          f.querySelectorAll('.mk-ear, [data-zone="top"] .mk-pc').forEach((n) => { const q = n.getBoundingClientRect(); if (q.width && (q.top < mir.top + 5.5 || q.left < mir.left + 5.5 || q.right > mir.right - 5.5)) bad.push('ears and hat fully in the mirror: ' + n.className); });
          const head = f.querySelector('.mk-head').getBoundingClientRect(), bib = f.querySelector('.mk-bib').getBoundingClientRect();
          const pt = (s) => ({ x: R.left + a.SLOTS[s][0] * em, y: R.top + a.SLOTS[s][1] * em });
          ['eyeL', 'eyeR', 'cheekL', 'cheekR', 'brow', 'nose', 'lip', 'mouth'].forEach((s) => { const q = pt(s); if (q.x < head.left || q.x > head.right || q.y < head.top || q.y > head.bottom) bad.push(s + ' off the head'); });
          const nk = pt('neck'); if (nk.x < bib.left || nk.x > bib.right || nk.y < bib.top || nk.y > bib.bottom) bad.push('neck off the bib');
          const eyes = [...f.querySelectorAll('.mk-eye')].map((n) => n.getBoundingClientRect());
          if (eyes.length !== 2 || eyes[0].right > eyes[1].left) bad.push('the eyes overlap');
          const lips = f.querySelector('[data-zone="mouth"] .mk-upper'), nose = f.querySelector('.mk-nose');
          if (lips && getComputedStyle(nose).display !== 'none' && lips.getBoundingClientRect().top < nose.getBoundingClientRect().top + nose.getBoundingClientRect().height / 2) bad.push('the lips sit under the nose');
          return bad.length ? e + ': ' + bad.slice(0, 4).join('; ') : null;
        }).filter(Boolean);
        return res;
      }, M);
      assert.deepStrictEqual(r, [], `every animal's parts and pieces stay in place at ${M}px`);
      await t.shot(page, `${ID}-faces-${M}.png`);
      await page.evaluate(() => { const n = document.querySelector('#mg-game > div[style*="z-index:50"]'); if (n) n.remove(); });
    }
    lap(10);
  }

  // --- 11. rotation: mid-zone and mid-admire, nothing changes but the size
  if (part(11)) {
    const p = await newPage(t, { viewport: 'phone' });
    await openMakeup(p, { length: 'short' });
    await startAt(p, 'party');
    await tap(p, ITEM(0, (await boards(p))[0].tray[0]), 0);
    const st = async () => { const a = await A(p, (a) => ({ s: a.state, z: a.zone, b: a.boards.map((b) => [b.item, b.k, b.done]) })); return a; };
    const before = await st();
    const m0 = await p.evaluate(() => getComputedStyle(document.querySelector('.g-makeup')).getPropertyValue('--m').trim());
    await p.setViewportSize(h.VIEWPORTS.phoneWide);
    await p.waitForTimeout(300);
    assert.deepStrictEqual(await st(), before, 'rotating mid-zone changes no state');
    const m1 = await p.evaluate(() => getComputedStyle(document.querySelector('.g-makeup')).getPropertyValue('--m').trim());
    assert.notStrictEqual(m0, m1, 'the friends resize');
    const follow = await p.evaluate(() => document.querySelector('.g-makeup .mk-model').offsetWidth === Math.round(parseFloat(getComputedStyle(document.querySelector('.g-makeup')).getPropertyValue('--m'))));
    assert.ok(follow, 'the model follows --m');
    await layoutChecks(t, p, 'rotated mid-zone');
    await finishBoard(p, 0); await finishBoard(p, 1);
    await stateIs(p, 'admire', 3000);
    await p.setViewportSize(h.VIEWPORTS.phone);
    await p.waitForTimeout(100);
    await stateIs(p, 'zone', 3000);
    assert.strictEqual(await api(p, 'zoneIndex'), 1, 'rotating mid-admire: the next zone comes as usual');
    await p.waitForTimeout(300);
    await layoutChecks(t, p, 'rotated back');
    const r = await followHand(p, 400);
    assert.ok(r.over, 'and the round finishes');
    await t.waitForWin(p, 8000);
    await p.close();
    lap(11);
  }

  // --- 12. persistence: leaving mid-round keeps everything earned; damaged saves open the menu
  if (part(12)) {
    await openMakeup(page, { kit: { done: 2, looks: ['spy'], seen: ['stamp'], photos: [{ p: 'circus', l: { e: '🐰', z: { nose: 'clown' }, x: ['spy'], o: 'wave' }, r: { e: '🐻', z: {}, x: [], o: 'kiss' } }] } });
    await startAt(page, 'party', 'cheeks');
    await page.evaluate(() => MG.home());
    await page.evaluate(() => MG.open('makeup'));
    await ready(page);
    const k = await api(page, 'kit');
    assert.deepStrictEqual([k.done, k.looks, k.seen.includes('stamp'), k.photos.length], [2, ['spy'], true, 1], 'left mid-round: back to the menu, nothing earned is lost');
    for (const [bad, cards] of [['"nonsense"', 2], ['{"done":"x"}', 2], ['[1,2,3]', 2], [JSON.stringify({ done: 5, played: { disco: 3, hero: 'x', party: 99999 }, looks: ['clown', 'clown', 'ninja', 7], seen: ['stamp', 'fly', 'stamp'], photos: [{ p: 'party', l: { e: '🐰', z: { top: 'cone' }, x: [], o: 'moon' }, r: { e: '🐻', z: {} } }, 'junk'] }), 5]]) {
      await openMakeup(page, { kit: bad });
      assert.strictEqual(await page.locator('.g-makeup .mk-card').count(), cards, `a damaged save opens the menu (${bad})`);
      const pol = await page.locator('.g-makeup .mk-polaroid').count();
      assert.ok(pol >= 1, 'and draws the photo wall');
    }
    // a late salon's menu: on every card the medals, the play stars and the corner stickers keep apart, and no sticker is a star
    for (const first of [1, 2, 3]) {
      const played = Object.fromEntries(['party', 'circus', 'hero', 'jungle', 'royal', 'beach', 'space', 'rainbow'].map((id, i) => [id, ((first + i - 1) % 3) + 1]));
      await openMakeup(page, { kit: { done: 40, played } });
      const bad = await page.evaluate(() => {
        const out = [], hit = (r, q) => r.left < q.right - 0.5 && q.left < r.right - 0.5 && r.top < q.bottom - 0.5 && q.top < r.bottom - 0.5;
        document.querySelectorAll('.g-makeup .mk-card').forEach((c) => {
          const parts = [...c.querySelectorAll('.mk-card__stars .mg-sticker, .mk-card__medals .mg-sticker, .mk-deco, .mk-card__e')]
            .map((n) => [n.closest('.mk-card__stars, .mk-card__medals, .mk-deco, .mk-card__e').className, n.getBoundingClientRect()]);
          parts.forEach(([a, r], i) => parts.slice(i + 1).forEach(([b, q]) => { if (a !== b && hit(r, q)) out.push(`${c.dataset.id}: ${a} x ${b}`); }));
          c.querySelectorAll('.mk-deco').forEach((n) => { if (/⭐/.test(n.textContent)) out.push(c.dataset.id + ': a star sticker'); });
        });
        return out;
      });
      assert.deepStrictEqual(bad, [], `menu badges keep apart (played ${JSON.stringify(played)})`);
    }
    lap(12);
  }

  // --- 13. help and options
  if (part(13)) {
    const p = await newPage(t, { help: 2 });
    await openMakeup(p);
    await startAt(p, 'party');
    let b = await boards(p);
    assert.deepStrictEqual([b[0].n, b[1].n], [2, 4], 'help Lots: her wash is two dabs (4, less 2); his is unchanged');
    // (Few takes one more off: her one-dab steps)
    await openMakeup(p, { dabs: 'few' });
    await startAt(p, 'party');
    b = await boards(p);
    assert.deepStrictEqual([b[0].n, b[1].n], [1, 3], 'help Lots and Few: her wash is one dab; his only loses the one for Few');
    await tap(p, `${B(0)} .mk-mirror`, 0);
    b = await boards(p);
    assert.ok(b[0].done && (await api(p, 'mud'))[0] === 0, 'one dab and the rinse');
    await finishBoard(p, 1);
    await p.waitForFunction(() => MG.current.api.zone === 'cheeks' && MG.current.api.state === 'zone', null, { timeout: 4000 });
    await gameWait(p, 0.35);
    assert.ok(await A(p, (a) => a.setTray(0, ['blush-pink', 'star', 'dots'])));
    await tap(p, ITEM(0, 'blush-pink'), 0);
    b = await boards(p);
    assert.ok(b[0].done && b[0].n === 1, 'her blush is one dab');
    assert.ok(await p.evaluate(() => document.querySelectorAll('.g-makeup .mk-board[data-side="0"] .mk-layer[data-zone="cheeks"] .mk-blush').length >= 2), 'and draws both cheeks');
    assert.strictEqual(b[1].n, 0, '(his board waits for his choice)');
    await tap(p, ITEM(1, b[1].tray[0]), 0);
    b = await boards(p);
    assert.strictEqual(b[1].n, 4, 'the grown-up still has his four (4, one less for Few, and his one more)');
    assert.strictEqual(await A(p, (a) => a.tuning.GAP), 0.16);
    // her hand comes after 2.5s at Lots (once the thing to press is not new to her)
    const SEEN = ['foam', 'stamp', 'blush', 'dots', 'glasses', 'shadow', 'lashes', 'googly', 'lips', 'smile', 'stache', 'cone', 'wear', 'wig', 'glitter', 'pose'];
    await openMakeup(p, { length: 'short', kit: { done: 0, seen: SEEN } });
    await A(p, (a) => a.start('party'));
    await stateIs(p, 'zone');
    const t0 = await p.evaluate(() => MG.current.ctx.time);
    await p.waitForFunction(() => MG.current.api.hinted, null, { timeout: 6000 });
    const dt = (await p.evaluate(() => MG.current.ctx.time)) - t0;
    assert.ok(dt >= 2.4 && dt <= 2.9, `help Lots: her hand after 2.5s (${dt.toFixed(2)}s)`);
    assert.ok(await p.evaluate(() => !!MG.current.api.hinted.closest('.mk-board[data-side="0"]')), 'on her board');
    await p.close();
    await openMakeup(page, { length: 'short' });
    await startAt(page, 'circus');
    assert.deepStrictEqual(await api(page, 'zones'), ['cheeks', 'nose', 'top', 'sparkle', 'pose'], 'Short: no wash, no extra zone, ending sparkle and pose');
    const n = await A(page, (a) => ['few', 'normal', 'lots'].map((d) => [a.nFor('blush', false, d, 0), a.nFor('blush', true, d, 0), a.nFor('wear', false, d, 0), a.nFor('glitter', true, d, 0)]));
    assert.deepStrictEqual(n, [[3, 4, 3, 3], [4, 5, 3, 3], [5, 6, 3, 3]], 'Few and Lots change only the variable kinds (Few < Normal < Lots; at Lots she has 5, he his one more)');
    // at Normal with help Some (the default) every step but the pose is three taps for her, whatever the tray holds
    const some = await A(page, (a) => Object.keys(a.KINDS).filter((k) => k !== 'pose' && a.nFor(k, false, 'normal', 1) !== 3));
    assert.deepStrictEqual(some, [], 'help Some: three taps a step for her');
    await t.pause(page);
    const menu = await page.evaluate(() => document.querySelector('.mg-overlay--pause').innerText);
    assert.ok(/Makeover/.test(menu) && /Taps per step/.test(menu) && /makeover/.test(menu), 'the pause menu explains it and offers the options');
    await page.evaluate(() => MG.home());
    lap(13);
  }

  // --- 14. the real ghost hand: a fresh salon, following only the hand that is on screen, never asking for it
  if (part(14)) {
    const p = await newPage(t, { help: 1 });
    await openMakeup(p, { scale: 6 });
    const r = await followRealHand(p);
    assert.ok(r.over, 'following only the hand on screen plays a whole Full round to the win: ' + JSON.stringify(r.drawn));
    assert.strictEqual(r.party, 'party', 'starting with the party the hand shows on the menu');
    const steps = (await A(p, (a) => a.zones)).length;
    assert.ok(r.moved.length >= steps - 2, `a board finished under the hand in (nearly) every step: ${r.moved.length} of ${steps}`);
    assert.ok(r.moved.every((dt) => dt <= 0.3), `then the hand is on the other unfinished board within 0.3s: ${r.moved}`);
    assert.ok(Math.max(...r.waits) <= 10.5, `no wait between taps is over 10.5s: the longest is ${Math.max(...r.waits)}s`);
    await t.waitForWin(p, 8000);
    await p.close();
    lap(14);
  }

  // --- 15. how long a round lasts with two real players: her a tap every 2s, his every 1s (help Some, the default)
  if (part(15)) {
    const p = await newPage(t, { help: 1 });
    const len = { full: [], short: [] };
    for (const L of ['full', 'short', 'full', 'short']) {     // (two of each: the random trays move a round by a few seconds)
      await openMakeup(p, { length: L, scale: 12 });
      len[L].push((await twoPlayers(p, 'party', 2, 1)).len);
      await t.waitForWin(p, 8000);
    }
    const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length, full = avg(len.full), short = avg(len.short);
    if (process.env.MG_MK_TIME) console.log(`  round lengths: ${JSON.stringify(len)}`);
    // (every step but the pose is three taps for her: measured, Full about 58s and Short about 36s with the overlay)
    assert.ok(full >= 55 && Math.max(...len.full) <= 180, `a Full round with real taps lasts about a minute: ${len.full}s (8 steps)`);
    assert.ok(short < full * 0.75, `Short is clearly shorter: ${len.short}s against ${len.full}s`);
    await p.close();
    lap(15);
  }
});
