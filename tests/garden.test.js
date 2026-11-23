/* Happy Garden: a tap on a bed does what it needs (sow, spray, water, tickle), food from the sacks, pick, hand over;
 * a giant vegetable pulled out together; the yard, our tree and the puppy; gifts unlock more; the garden is kept and
 * never gets stuck.
 *
 * Bed taps and pull halves have a short per-bed gap measured on the game clock (ctx.time), and api.grow() does not
 * move that clock. So the real-tap sections run at MG.timeScale = 8 (each tap() waits long enough for that), or wait
 * 220ms or more between taps on one bed; the gap tests themselves run at timeScale 1 on purpose. */
'use strict';
const fs = require('fs');
const path = require('path');
const h = require('./harness');
const ID = 'garden';

const api = (page, k) => page.evaluate((k) => MG.current.api[k], k);
const farm = (page) => api(page, 'farm');
const log = (page) => api(page, 'log');
const cues = async (page) => (await log(page)).map((x) => x.c);
let pid = 900;
/** A real touch on the middle of an element (down and up, a new finger each time). */
async function tap(page, sel, wait = 50) {
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
  await page.waitForTimeout(wait);
}
/** In the page: a real touch on `sel`, and what `read` saw just before and just after it (no frame runs in between). */
const tapRead = (page, sel, read) => page.evaluate(([sel, id, src]) => {
  const f = (0, eval)('(' + src + ')'), a = MG.current.api, n = document.querySelector(sel), r = n.getBoundingClientRect();
  const before = f(a);
  const o = { bubbles: true, cancelable: true, pointerId: id, pointerType: 'touch', clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
  n.dispatchEvent(new PointerEvent('pointerdown', o));
  n.dispatchEvent(new PointerEvent('pointerup', o));
  return { before, after: f(a) };
}, [sel, ++pid, read.toString()]);
const bed = (i) => `.g-garden .gd-plot[data-i="${i}"]`;
const sack = (t) => `.g-garden .gd-tool[data-tool="${t}"]`;
const half = (s) => `.g-garden .gd-pull__half[data-side="${s}"]`;
const ready = async (page) => {
  await page.waitForFunction(() => MG.current && MG.current.api && MG.current.api.state === 'play', null, { timeout: 30000 });
  await page.waitForTimeout(600);
};
/** Open the garden with options set first, from a clean slate (or `farm`, saved first) unless `keep`. */
async function openGarden(page, opts = {}) {
  await page.evaluate((o) => {
    MG.timeScale = 1;
    MG.home();                                    // (leaving saves the garden: clear it after)
    if (!o.keep) localStorage.removeItem('mg:game:garden:farm');
    if (o.farm) localStorage.setItem('mg:game:garden:farm', JSON.stringify(o.farm));
    MG.store.set('opt:garden:bugs', o.bugs || 'none');
    MG.store.set('opt:garden:speed', o.speed || 'normal');
    MG.open('garden');
  }, opts);
  await ready(page);
}
const P = (crop, stage, o = {}) => Object.assign({ crop, stage, t: 0, water: 3, fed: null, bug: null, fruits: 0, perfect: true }, o);
const setFarm = (page, f) => page.evaluate((f) => MG.current.api.setFarm(f), f);
const grow = (page, s) => page.evaluate((s) => MG.current.api.grow(s), s);
const fast = (page, s = 8) => page.evaluate((s) => { MG.timeScale = s; }, s);
/** Rectangles of everything matching `inner` that are not inside their `outer` (closest ancestor or the one element). */
const escapes = (page, inner, outer, pad = 1) => page.evaluate(([inner, outer, pad]) => [...document.querySelectorAll(inner)].filter((n) => {
  const box = (n.closest(outer) || document.querySelector(outer)).getBoundingClientRect(), r = n.getBoundingClientRect();
  return r.left < box.left - pad || r.right > box.right + pad || r.top < box.top - pad || r.bottom > box.bottom + pad;
}).map((n) => n.className + ' ' + (n.closest('.gd-plot') ? n.closest('.gd-plot').dataset.crop : '')), [inner, outer, pad]);
/** Pairs of elements (matching sel) whose boxes overlap. */
const overlaps = (page, sel) => page.evaluate((sel) => {
  const items = [...document.querySelectorAll(sel)].map((n) => [n.className, n.getBoundingClientRect()]).filter(([, r]) => r.width > 0);
  const out = [];
  items.forEach(([a, r], i) => items.slice(i + 1).forEach(([b, s]) => { if (r.left < s.right - 1 && s.left < r.right - 1 && r.top < s.bottom - 1 && s.top < r.bottom - 1) out.push(a + ' x ' + b); }));
  return out;
}, sel);
const waitCue = (page, c, timeout = 4000) => page.waitForFunction((c) => MG.current.api.log.some((x) => x.c === c), c, { timeout });

h.run(ID, async (t) => {
  const { assert } = t;
  let page = await t.open(ID);
  await ready(page);

  // ===================================================================== 1. the rules (pure)
  {
    const r = await page.evaluate(() => {
      const a = MG.current.api;
      const shape = (f) => ({ done: f.done, beds: f.plots.length, crops: f.crops.join(','), order: f.order, basket: JSON.stringify(f.basket), empty: f.plots.every((p) => !p.crop), giants: f.giants, seed: 'seed' in f });
      const later = a.cleanFarm({ done: 6, seed: 'potato', basket: { tomato: 50, rock: 3, chilli: -2 },
        plots: [{ crop: 'pumpkin', stage: 2 }, { crop: 'tomato', stage: 9, water: 99, fed: 'cake', bug: '🦖', fruits: 7, picks: 5 }, { crop: 'carrot', stage: 4, fruits: 0, picks: 1 }, { crop: 'corn', stage: 2, bug: '🐛', fed: 'fish', t: 5 }, 'junk'],
        order: { who: '🐷', want: { tomato: 2, potato: 1 }, got: {} } });
      const many = (f, n, prev) => { const out = []; for (let k = 0; k < n; k++) out.push(a.makeOrder(f, Math.random, prev)); return out; };
      const f3 = a.cleanFarm({ done: 4 });
      const f9 = a.cleanFarm({ done: 9 });
      const f20 = a.cleanFarm({ done: 20 });
      const fullB = a.cleanFarm({ done: 20, basket: { tomato: 3, chilli: 3, strawberry: 3, eggplant: 3, cucumber: 3 } });
      const stocked = a.cleanFarm({ done: 12, basket: { tomato: 3, chilli: 3, carrot: 3, corn: 3, strawberry: 3, eggplant: 3, pumpkin: 3, cucumber: 3, potato: 1 } });
      // favourites, over many gardens: empty, mixed and full baskets
      const favRuns = [];
      [[4, {}], [4, { carrot: 3, corn: 3, tomato: 3, chilli: 1 }], [9, {}], [9, { tomato: 2, corn: 3, carrot: 1, pumpkin: 3, strawberry: 2 }], [20, {}],
        [20, { tomato: 3, chilli: 3, strawberry: 3, eggplant: 3, cucumber: 3 }], [20, { potato: 3, corn: 3, carrot: 3, pumpkin: 3 }]].forEach(([done, basket]) => {
        const f = a.cleanFarm({ done, basket });
        many(f, 300, null).forEach((o) => favRuns.push({ done, who: o.who, want: o.want, unlocked: f.crops.includes(a.FAV[o.who]), basket }));
      });
      return {
        fresh: shape(a.cleanFarm(null)),
        bad: [a.cleanFarm('x'), a.cleanFarm({ done: 'abc', plots: 'no', basket: [1], order: 5 }), a.cleanFarm({ done: -4, seed: 'rock' }), a.cleanFarm({ giants: 'lots' }), a.cleanFarm([1, 2, 3])].map(shape),
        later: { crops: later.crops, beds: later.plots.length, helpers: later.helpers, plots: later.plots.slice(0, 5), basket: later.basket, order: later.order, seed: 'seed' in later },
        keptOrder: a.cleanFarm({ done: 1, order: { who: '🐷', want: { carrot: 2 }, got: { carrot: 1 } } }).order,
        doneOrder: shape(a.cleanFarm({ done: 1, order: { who: '🐷', want: { carrot: 2 }, got: { carrot: 2 } } })),
        rain: [a.cleanFarm({ rainIn: 40 }).rainIn, a.cleanFarm({ rainIn: 900 }).rainIn, a.cleanFarm({}).rainIn, a.cleanFarm({ rainIn: null }).rainIn],
        first: a.makeOrder(a.cleanFarm(null), Math.random, null),
        second: many(a.cleanFarm({ done: 1 }), 100, '🐰').map((o) => o.want),
        orders3: many(f3, 300, '🐻').map((o) => ({ who: o.who, want: o.want })),
        orders9: many(f9, 300, null).map((o) => o.want),
        late: many(f20, 300, null).map((o) => o.want),
        drains: many(fullB, 300, null).map((o) => o.want),
        fromStock: many(stocked, 300, null).map((o) => o.want),
        favRuns,
        all: a.unlocks(12), pup: [a.unlocks(12).helpers.pup, a.unlocks(13).helpers.pup], decor: a.unlocks(30).decor,
        prizes: [a.unlocks(24).prizes, a.unlocks(50).prizes],
        gifts: [0, 1, 2, 12, 13, 22, 23, 32, 49, 50, 200].map((i) => a.giftFor(i)),
        fruits: [a.fruitsFor({ crop: 'tomato', fed: 'bone', perfect: true }, {}), a.fruitsFor({ crop: 'tomato', fed: 'leaf', perfect: false }, {}), a.fruitsFor({ crop: 'tomato', fed: null, perfect: false }, { bees: true }), a.fruitsFor({ crop: 'chilli', fed: 'fish', perfect: false }, {})],
        giant: [
          a.becomesGiant({ crop: 'carrot', fed: 'leaf', perfect: true }, { done: 3, giants: 0 }, 0.9),
          a.becomesGiant({ crop: 'carrot', fed: 'leaf', perfect: true }, { done: 2, giants: 0 }, 0),
          a.becomesGiant({ crop: 'tomato', fed: 'bone', perfect: true }, { done: 9, giants: 0 }, 0),
          a.becomesGiant({ crop: 'potato', fed: 'bone', perfect: true }, { done: 9, giants: 0, already: true }, 0),
          a.becomesGiant({ crop: 'pumpkin', fed: null, perfect: true }, { done: 9, giants: 0 }, 0),
          a.becomesGiant({ crop: 'pumpkin', fed: 'leaf', perfect: false }, { done: 9, giants: 0 }, 0),
          a.becomesGiant({ crop: 'pumpkin', fed: 'leaf', perfect: false }, { done: 9, giants: 0, bees: true }, 0.9),
          a.becomesGiant({ crop: 'potato', fed: 'bone', perfect: true }, { done: 9, giants: 1 }, 0.19),
          a.becomesGiant({ crop: 'potato', fed: 'bone', perfect: true }, { done: 9, giants: 1 }, 0.21),
        ],
        tree: [0, 2, 3, 6, 7, 11, 12, 17, 18, 24, 25, 99].map(a.treeStage),
        repair: a.cleanFarm({ done: 9, plots: [{ crop: 'pumpkin', stage: 4, giant: true, fruits: 1 }, { crop: 'tomato', stage: 4, giant: true }, { crop: 'carrot', stage: 2, giant: true }] }).plots.slice(0, 3).map((p) => [p.giant, p.fruits]),
      };
    });
    assert.deepStrictEqual(r.fresh, { done: 0, beds: 4, crops: 'tomato,chilli', order: null, basket: '{}', empty: true, giants: 0, seed: false }, 'a new garden: four beds, tomato and chilli seeds');
    r.bad.forEach((b) => assert.deepStrictEqual(b, r.fresh, 'nonsense becomes a new garden'));
    assert.deepStrictEqual(r.later.crops, ['tomato', 'chilli', 'carrot', 'corn', 'strawberry'], 'six orders filled: five kinds of seed');
    assert.strictEqual(r.later.beds, 9, 'and nine beds');
    assert.deepStrictEqual(r.later.helpers, { ladybird: true }, 'and the ladybird');
    assert.strictEqual(r.later.plots[0].crop, null, 'a vegetable not yet earned is dug up');
    assert.deepStrictEqual([r.later.plots[1].stage, r.later.plots[1].water, r.later.plots[1].fed, r.later.plots[1].bug, r.later.plots[1].fruits, r.later.plots[1].picks], [4, 3, null, null, 3, 1], 'everything kept in range');
    assert.deepStrictEqual([r.later.plots[2].fruits, r.later.plots[2].picks], [1, 0], 'a ripe plant always has something to pick (and a carrot is picked whole)');
    assert.deepStrictEqual([r.later.plots[3].bug, r.later.plots[3].fed, r.later.plots[3].t], ['🐛', 'fish', 1]);
    assert.strictEqual(r.later.plots[4].crop, null);
    assert.deepStrictEqual(r.later.basket, { tomato: 3 }, 'the basket holds up to three of a kind (all of them show)');
    assert.strictEqual(r.later.seed, false, 'no seed in hand any more: a saved one is read nowhere');
    assert.strictEqual(r.later.order, null, 'an order for unearned vegetables is dropped');
    assert.deepStrictEqual(r.keptOrder, { who: '🐷', want: { carrot: 2 }, got: { carrot: 1 } }, 'a half-filled order is kept');
    assert.deepStrictEqual([r.doneOrder.done, r.doneOrder.order, r.doneOrder.beds], [2, null, 6], 'an order filled just before leaving still counts: its gift is kept');
    assert.deepStrictEqual(r.rain, [40, 110, null, null], 'the rain countdown is kept, within reason');
    assert.deepStrictEqual(r.first, { who: '🐰', want: { tomato: 1, chilli: 1 }, got: {} }, 'the first visitor wants one tomato and one chilli');
    for (const w of r.second) {
      const kinds = Object.keys(w), total = kinds.reduce((s, k) => s + w[k], 0);
      assert.ok(w.carrot >= 1 && kinds.length === 2 && total === 3, 'the second visitor: the new carrots, two kinds, three things: ' + JSON.stringify(w));
    }
    for (const o of r.orders3) {
      const kinds = Object.keys(o.want), total = kinds.reduce((s, k) => s + o.want[k], 0);
      assert.ok(o.who !== '🐻', 'never the same visitor twice in a row');
      assert.ok(kinds.includes('corn'), 'newly earned seeds are wanted');
      assert.ok(kinds.length === 2 && total === 4 && kinds.every((k) => o.want[k] >= 1 && o.want[k] <= 3), 'two kinds, four things, three at most of one: ' + JSON.stringify(o.want));
      assert.ok(kinds.every((k) => ['tomato', 'chilli', 'carrot', 'corn'].includes(k)));
    }
    for (const w of r.orders9) {
      const kinds = Object.keys(w), total = kinds.reduce((s, k) => s + w[k], 0);
      assert.ok(kinds.length === 3 && total === 5 && kinds.every((k) => w[k] <= 3), 'later: three kinds, five things');
    }
    const withPotato = r.late.filter((w) => w.potato).length;
    assert.ok(withPotato < 250, `long after potatoes were new, not every visitor wants them (${withPotato}/300)`);
    const FULL = ['tomato', 'chilli', 'strawberry', 'eggplant', 'cucumber'];
    assert.ok(r.drains.every((w) => FULL.some((c) => w[c] === 3)), 'a basket of many kinds: the visitor takes a whole pile');
    assert.ok(FULL.every((c) => r.drains.filter((w) => w[c]).length >= 20), 'and over time every pile gets used: ' + FULL.map((c) => c + ' ' + r.drains.filter((w) => w[c]).length));
    assert.ok(r.drains.every((w) => Object.keys(w).some((c) => !FULL.includes(c) || w[c] > 3)), 'and still wants something grown');
    assert.ok(r.fromStock.every((w) => Object.keys(w).some((c) => w[c] > ({ tomato: 3, chilli: 3, carrot: 3, corn: 3, strawberry: 3, eggplant: 3, pumpkin: 3, cucumber: 3, potato: 1 })[c])), 'a visitor never wants only what is already in the basket');
    const FAV = await api(page, 'FAV');
    for (const o of r.favRuns) {
      const kinds = Object.keys(o.want);
      if (o.unlocked) assert.ok(o.want[FAV[o.who]] >= 1, `a visitor whose favourite is grown here always wants it (done ${o.done}, ${o.who}): ${JSON.stringify(o.want)}`);
      assert.ok(kinds.length >= 1 && kinds.length <= 3 && kinds.every((k) => o.want[k] >= 1 && o.want[k] <= 3), 'one to three kinds, three at most of one: ' + JSON.stringify(o.want));
      assert.ok(kinds.some((c) => o.want[c] > (o.basket[c] || 0)), 'never only what is in the basket: ' + JSON.stringify(o));
    }
    const at9 = r.favRuns.filter((o) => o.done === 9);
    assert.ok(at9.filter((o) => o.unlocked).length >= at9.length * 0.55, `at nine orders most visitors' favourites grow here (${at9.filter((o) => o.unlocked).length}/${at9.length})`);
    assert.strictEqual(r.all.crops.length, 9, 'twelve orders: all nine vegetables');
    assert.deepStrictEqual(r.all.helpers, { ladybird: true, bees: true, fountain: true });
    assert.deepStrictEqual(r.pup, [undefined, true], 'the thirteenth gift is a puppy');
    assert.strictEqual(r.decor.length, 10, 'then decorations for the yard');
    assert.ok(r.decor.includes('🐦') && !r.decor.includes('🌳'), 'a bird instead of a tree sticker: the tree lives in the yard');
    assert.deepStrictEqual(r.prizes[0], { tomato: 1 }, 'then prize medals, one vegetable after another');
    assert.ok(Object.keys(r.prizes[1]).length === 9 && Object.values(r.prizes[1]).every((n) => n === 3), 'three medals for each');
    assert.deepStrictEqual(r.gifts.map((g) => g.kind), ['crop', 'beds', 'helper', 'helper', 'decor', 'decor', 'prize', 'prize', 'prize', 'thanks', 'thanks']);
    assert.deepStrictEqual([r.gifts[3].id, r.gifts[6].id, r.gifts[7].id], ['pup', 'tomato', 'tomato']);
    assert.deepStrictEqual(r.fruits, [3, 1, 2, 2], 'its favourite food and good care each add a fruit (bees count as care)');
    assert.deepStrictEqual(r.giant, [true, false, false, false, false, false, true, true, false], 'a giant: a fed, cared-for carrot, potato or pumpkin from the fourth order on; the first is certain, then 1 in 5');
    assert.deepStrictEqual(r.tree, [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5], 'our tree grows with the orders filled');
    assert.deepStrictEqual(r.repair, [[true, 3], [false, 1], [false, 0]], 'a giant flag is only kept on a ripe carrot, potato or pumpkin');
  }

  // --- saves made before this version (with a seed in hand, without giants): everything that matters is kept
  {
    const old = (done, extra) => Object.assign({ done, plots: [P('tomato', 2, { t: 0.3, dry: 1, picks: 0, thirst: 0, bugT: 0 }), null, P('chilli', 4, { fruits: 2, picks: 1 })], basket: { tomato: 1 }, order: null, seed: 'chilli', rainIn: 40 }, extra);
    const r = await page.evaluate((saves) => saves.map((s) => {
      const a = MG.current.api, f = a.cleanFarm(s);
      return { crops: f.crops.length, beds: f.plots.length, helpers: Object.keys(f.helpers).sort(), decor: f.decor, medals: Object.values(f.prizes).reduce((x, y) => x + y, 0), potato: f.prizes.potato || 0,
        giants: f.giants, tree: a.treeStage(f.done), plots: f.plots.slice(0, 3).map((p) => [p.crop, p.stage, p.t, p.fruits, p.picks]), basket: f.basket, order: f.order, seed: 'seed' in f, rainIn: f.rainIn };
    }), [old(0, { order: { who: '🐰', want: { tomato: 1, chilli: 1 }, got: { tomato: 1 } } }), old(6), old(23), old(40)]);
    const plots = [['tomato', 2, 0.3, 0, 0], [null, 0, 0, 0, 0], ['chilli', 4, 0, 2, 1]];
    assert.deepStrictEqual(r[0], { crops: 2, beds: 4, helpers: [], decor: [], medals: 0, potato: 0, giants: 0, tree: 0, plots, basket: { tomato: 1 }, order: { who: '🐰', want: { tomato: 1, chilli: 1 }, got: { tomato: 1 } }, seed: false, rainIn: 40 }, 'an old save at 0: all kept');
    assert.deepStrictEqual([r[1].crops, r[1].beds, r[1].helpers, r[1].tree, r[1].giants, r[1].plots, r[1].basket, r[1].seed], [5, 9, ['ladybird'], 1, 0, plots, { tomato: 1 }, false], 'an old save at 6: five seeds, nine beds, the ladybird, a sapling');
    assert.deepStrictEqual([r[2].crops, r[2].beds, r[2].helpers, r[2].decor.length, r[2].decor.includes('🐦'), r[2].medals, r[2].tree, r[2].giants, r[2].plots], [9, 9, ['bees', 'fountain', 'ladybird', 'pup'], 10, true, 0, 4, 0, plots], 'an old save at 23: every seed and helper, the puppy too, ten decorations, a tree in blossom');
    assert.deepStrictEqual([r[3].crops, r[3].helpers.length, r[3].decor.length, r[3].medals, r[3].potato, r[3].tree, r[3].plots], [9, 4, 10, 17, 1, 5, plots], 'an old save at 40: seventeen medals, a tree with mangoes');
  }

  // ===================================================================== 2. a whole round, with real taps
  await openGarden(page, { farm: { rainIn: 110 } });
  await page.waitForSelector('.mg-hint', { state: 'attached', timeout: 4000 });   // the ghost hand shows where to start
  assert.strictEqual(await page.evaluate(() => MG.current.api.hinted && MG.current.api.hinted.dataset.i), '0', 'the hand starts on the bed showing the first seed the visitor wants');
  assert.strictEqual(await page.locator('.g-garden .gd-tool[data-tool="seed"], .g-garden .gd-tool[data-tool="water"], .g-garden .gd-tool[data-tool="spray"], .g-garden .gd-shelf').count(), 0, 'no tools to hold, no seed shelf');
  assert.strictEqual(await page.locator('.g-garden .gd-plot .gd-marker.is-ghost').count(), 4, 'every empty bed shows the seed it will grow');
  let g = await api(page, 'ghosts');
  assert.deepStrictEqual([g[0], g[1]], ['tomato', 'chilli'], 'the tomato and the chilli the visitor wants come first');
  assert.ok(Object.keys(g).length === 4 && ['tomato', 'chilli'].includes(g[2]) && ['tomato', 'chilli'].includes(g[3]));
  assert.deepStrictEqual((await farm(page)).order.want, { tomato: 1, chilli: 1 });
  await fast(page, 8);
  await page.evaluate(() => {   // remember whether the third fruit ever pops in
    window.__bonus = 0;
    new MutationObserver(() => { if (document.querySelector('.g-garden .gd-fruits .is-bonus')) window.__bonus++; }).observe(document.querySelector('.g-garden .gd-beds'), { childList: true, subtree: true });
  });
  await tap(page, bed(0));
  let f = await farm(page);
  assert.deepStrictEqual([f.plots[0].crop, f.plots[0].stage, f.plots[0].water], ['tomato', 0, 0], 'a tap sows the seed shown');
  assert.strictEqual(await page.locator(bed(0) + ' .gd-marker.is-ghost').count(), 0, 'the packet is on its stick now');
  assert.strictEqual(await page.locator(bed(0) + ' .gd-marker .gd-packet__veg').textContent(), '🍅', 'showing what was sown');
  assert.strictEqual(await page.locator(bed(0) + ' .gd-need').textContent(), '💧', 'a dry seed asks for water');
  const g2 = await api(page, 'ghosts');
  assert.deepStrictEqual([g2[1], g2[2], g2[3]], [g[1], g[2], g[3]], 'the other beds still show what they showed');
  await tap(page, bed(1));
  assert.strictEqual((await farm(page)).plots[1].crop, 'chilli');
  await tap(page, bed(0));
  await tap(page, bed(1));
  f = await farm(page);
  assert.deepStrictEqual([f.plots[0].water, f.plots[1].water], [3, 3], 'the next tap waters it, to full');
  assert.ok(await page.locator(bed(0) + '.is-wet').count(), 'wet soil');
  assert.deepStrictEqual((await cues(page)).filter((c) => ['plant', 'water'].includes(c)), ['plant', 'plant', 'water', 'water']);
  for (let k = 0; k < 8; k++) await tap(page, bed(0));            // mashing it
  f = await farm(page);
  assert.ok(f.plots[0].crop === 'tomato' && f.plots[0].water >= 2, 'mashing a watered bed only tickles it');
  // grow (tapping both beds now and then: dry, they are watered; wet, tickled) until they ask for food
  const tapBedIf = (i, maxStage) => page.evaluate(([i, maxStage, id]) => {
    const a = MG.current.api, p = a.farm.plots[i], n = document.querySelector(`.g-garden .gd-plot[data-i="${i}"]`);
    if (!(p.stage <= maxStage) || (p.stage === 2 && !p.fed && p.t >= 0.5)) return false;
    const r = n.getBoundingClientRect(), o = { bubbles: true, cancelable: true, pointerId: id, pointerType: 'touch', clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
    n.dispatchEvent(new PointerEvent('pointerdown', o)); n.dispatchEvent(new PointerEvent('pointerup', o));
    return true;
  }, [i, maxStage, ++pid]);
  for (let k = 0; k < 30 && !(await farm(page)).plots.slice(0, 2).every((p) => p.stage === 2 && p.t >= 0.5); k++) {
    await tapBedIf(0, 2); await tapBedIf(1, 2); await page.waitForTimeout(50); await grow(page, 1);
  }
  f = await farm(page);
  assert.ok(f.plots[0].stage === 2 && f.plots[1].stage === 2 && f.plots[0].t >= 0.5 && f.plots[1].t >= 0.5, 'leafy now, and hungry: ' + JSON.stringify(f.plots.slice(0, 2)));
  assert.strictEqual(await page.locator(bed(0) + ' .gd-need').textContent(), '🦴', 'the tomato asks for its favourite: bone meal');
  assert.strictEqual(await page.locator(bed(1) + ' .gd-need').textContent(), '🐟', 'the chilli: fish');
  assert.deepStrictEqual(await page.$$eval('.g-garden .gd-tool.is-asked', (ns) => ns.map((n) => n.dataset.tool).sort()), ['bone', 'fish'], 'the sacks being asked for light up');
  let rd = await tapRead(page, bed(1), (a) => [a.farm.plots[1].fed, a.hinted && a.hinted.dataset.tool]);
  assert.strictEqual(rd.after[0], null, 'a tap on a hungry plant uses nothing up');
  assert.strictEqual((await log(page)).filter((x) => x.c === 'ask').pop().i, 1, 'it points at its sack');
  assert.strictEqual(rd.after[1], 'fish', 'and the hand shows the fish');
  const waiting = (await farm(page)).plots[0].t;
  await grow(page, 6);
  assert.strictEqual((await farm(page)).plots[0].t, waiting, 'a hungry plant waits');
  await tap(page, sack('leaf'));                                    // nobody wants compost
  f = await farm(page);
  assert.deepStrictEqual([f.plots[0].fed, f.plots[1].fed], [null, null], 'a sack nobody asked for: they shake their heads, nothing is used up');
  await tap(page, sack('bone'));
  f = await farm(page);
  assert.deepStrictEqual([f.plots[0].fed, f.plots[1].fed], ['bone', null], 'one tap on the bone meal: it flies to the plant that wants it');
  await tap(page, sack('fish'));
  await tap(page, sack('fish'));                                    // again: nobody is hungry now
  f = await farm(page);
  assert.deepStrictEqual([f.plots[0].fed, f.plots[1].fed], ['bone', 'fish'], 'fed once each');
  assert.ok((await cues(page)).includes('feed:bone'));
  for (let k = 0; k < 40 && !(await farm(page)).plots.slice(0, 2).every((p) => p.stage === 4); k++) {
    await tapBedIf(0, 3); await tapBedIf(1, 3); await page.waitForTimeout(50); await grow(page, 1);
  }
  f = await farm(page);
  assert.deepStrictEqual(f.plots.slice(0, 2).map((p) => [p.stage, p.fruits]), [[4, 3], [4, 3]], 'ripe, three each (favourite food and never left dry)');
  assert.strictEqual(await page.locator(bed(0) + ' .gd-fruits .mg-sticker').count(), 3, 'the fruits show on the plant');
  assert.ok(await page.evaluate(() => window.__bonus > 0), 'the third fruit, the one good care brought, popped in on its own');
  await tap(page, bed(0));
  await tap(page, bed(0));                                          // a second tap: it is leafy again, a tickle
  await tap(page, bed(1));
  f = await farm(page);
  assert.deepStrictEqual(f.basket, { tomato: 3, chilli: 3 }, 'all into the basket, once');
  assert.deepStrictEqual(f.plots.slice(0, 2).map((p) => [p.crop, p.stage, p.fed, p.picks]), [['tomato', 2, null, 1], ['chilli', 2, null, 1]], 'tomatoes and chillies grow a second crop (and will be hungry again)');
  assert.strictEqual((await cues(page)).filter((c) => c === 'pick').length, 2);
  // hand them over: mashing the gate never hands over more than wanted; the wish list ticks off one by one
  await page.evaluate(() => {
    window.__got = [];
    const w = document.querySelector('.g-garden .gd-wish');
    new MutationObserver(() => window.__got.push(w.querySelectorAll('.is-got').length)).observe(w, { childList: true });
  });
  for (let k = 0; k < 6; k++) await tap(page, k % 2 ? '.g-garden .gd-visitor' : '.g-garden .gd-basket', 20);
  await page.waitForFunction(() => MG.current.api.state === 'gift', null, { timeout: 8000 });
  const seq = await page.evaluate(() => window.__got);
  assert.ok(seq.includes(1) && seq.indexOf(1) < seq.lastIndexOf(2), 'the wish list ticks off one vegetable at a time: ' + seq.join(','));
  f = await farm(page);
  assert.deepStrictEqual(f.basket, { tomato: 2, chilli: 2 }, 'exactly one of each handed over; the rest stays in the basket');
  assert.strictEqual(f.done, 1);
  assert.ok(f.crops.includes('carrot') && !('seed' in f), 'the gift: carrot seeds (and no seed "in hand")');
  const frozen = JSON.stringify((await farm(page)).plots);
  await grow(page, 30);
  assert.strictEqual(JSON.stringify((await farm(page)).plots), frozen, 'behind the party the garden rests: nothing dries or gets bugs');
  await page.waitForSelector('.g-garden .gd-gift.is-open', { timeout: 4000 });
  await page.waitForTimeout(150);
  assert.deepStrictEqual(await escapes(page, '.g-garden .gd-packet--big .gd-packet__veg', '.gd-packet--big', 2), [], 'the gift packet holds its vegetable');
  await t.waitForWin(page, 10000);
  const c1 = await cues(page);
  assert.ok(['thanks0', 'thanks1', 'gift-from-visitor'].every((c) => c1.includes(c)), 'thank you to both of them, and a present from the visitor');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('mg:game:garden:farm')));
  assert.deepStrictEqual([saved.v, saved.done, saved.giants, 'seed' in saved], [2, 1, 0, false], 'saved');
  assert.ok(saved.rainIn >= 0 && saved.rainIn <= 110, 'with the rain countdown');
  // the next visitor wants the new carrots; the beds are as they were left
  await page.evaluate(() => { MG.timeScale = 1; MG.home(); MG.open('garden'); });
  await ready(page);
  f = await farm(page);
  assert.ok(f.order.want.carrot >= 1, 'carrots wanted');
  assert.deepStrictEqual(f.plots.slice(0, 2).map((p) => p.crop), ['tomato', 'chilli'], 'the garden was kept');
  assert.deepStrictEqual(f.basket, { tomato: 2, chilli: 2 });
  assert.ok(Object.values(await api(page, 'ghosts')).includes('carrot'), 'and an empty bed shows the carrot seeds');

  // ===================================================================== 3. seeds shown on empty beds
  await openGarden(page, { farm: { rainIn: 110 } });
  g = await api(page, 'ghosts');
  await fast(page, 8);
  await tap(page, bed(2));
  let g3 = await api(page, 'ghosts');
  assert.deepStrictEqual([g3[0], g3[1], g3[3], g3[2]], [g[0], g[1], g[3], undefined], 'sowing one bed leaves the others showing what they showed');
  await fast(page, 1);
  const needed = { done: 4, rainIn: 110, order: { who: '🐷', want: { corn: 2 }, got: {} }, plots: [P('tomato', 2, { t: 0.1 }), null, null, P('chilli', 2, { t: 0.1 }), null, null] };
  await setFarm(page, needed);
  assert.strictEqual((await api(page, 'ghosts'))[1], 'corn', 'a seed the visitor needs is shown on the first empty bed');
  await fast(page, 8);
  await tap(page, bed(2)); await tap(page, bed(4));
  assert.strictEqual((await api(page, 'ghosts'))[1], 'corn', 'and stays there while other beds are sown');
  await fast(page, 1);
  await setFarm(page, needed);
  g3 = await page.evaluate(() => { const a = MG.current.api; a.setGhosts({ 1: 'tomato', 2: 'chilli', 4: 'carrot', 5: 'strawberry' }); a.planSeeds(); return a.ghosts; });
  assert.deepStrictEqual(g3, { 1: 'tomato', 2: 'chilli', 4: 'carrot', 5: 'corn' }, 'when every empty bed shows something else, the last one changes to the needed seed');

  // ===================================================================== 4. one tap, one job, on each bed
  // the per-bed gap (game clock, real time)
  await openGarden(page, { farm: { rainIn: 110 } });
  await tap(page, bed(0), 0); await page.waitForTimeout(50);
  await tap(page, bed(0), 0);
  f = await farm(page);
  assert.deepStrictEqual([f.plots[0].crop, f.plots[0].water], ['tomato', 0], 'two taps on one bed 50ms apart: only the first counts');
  await tap(page, bed(1), 0);
  assert.strictEqual((await farm(page)).plots[1].crop, 'chilli', 'a tap on another bed at the same moment counts');
  await page.waitForTimeout(250);
  await tap(page, bed(0), 0);
  f = await farm(page);
  assert.ok(f.plots[0].water === 3 && await page.locator(bed(0) + '.is-wet').count(), 'a moment later, the next tap waters it');
  // tickles: a little growth each, at most half of each stage, and never past the point where it asks for food
  await openGarden(page, { speed: 'slow' });
  const tune = await api(page, 'tuning');
  const T = tune.TICKLE[tune.help];
  const tickleFarm = (pl) => setFarm(page, { done: 2, rainIn: 110, order: { who: '🐷', want: { tomato: 2, chilli: 1 }, got: {} }, plots: [pl] });
  await tickleFarm(P('tomato', 1, { t: 0.2 }));
  rd = await tapRead(page, bed(0), (a) => a.farm.plots[0].t);
  assert.ok(Math.abs(rd.after - rd.before - T) < 1e-9, `a tickle: the plant grows a little (${rd.before} -> ${rd.after})`);
  assert.strictEqual((await log(page)).pop().c, 'tickle');
  await page.waitForTimeout(250);
  rd = await tapRead(page, bed(0), (a) => a.farm.plots[0].t);
  assert.strictEqual(rd.after, rd.before, 'tickled again straight away: a giggle, no more growth');
  assert.strictEqual((await log(page)).pop().c, 'tickle-rest');
  await tickleFarm(P('tomato', 3, { t: 0, fed: 'bone' }));
  let added = 0;
  for (let k = 0; k < 9; k++) {
    rd = await tapRead(page, bed(0), (a) => [a.farm.plots[0].stage, a.farm.plots[0].t]);
    assert.strictEqual(rd.after[0], 3, 'still flowering');
    added += rd.after[1] - rd.before[1];
    await page.waitForTimeout(380);
  }
  assert.ok(added <= 0.5 + 1e-9 && added >= 0.5 - 1e-6, `tickling gives at most half a stage (${added})`);
  await tickleFarm(P('tomato', 2, { t: 0.45 }));
  rd = await tapRead(page, bed(0), (a) => a.farm.plots[0].t);
  assert.ok(rd.before < 0.5 && rd.after === 0.5, `a tickle stops exactly where the plant asks for food (${rd.before} -> ${rd.after})`);
  await page.waitForTimeout(400);
  await tap(page, bed(0));
  assert.strictEqual((await log(page)).pop().c, 'ask', 'then a tap points at the sack');
  await tickleFarm(P('chilli', 3, { t: 0.97, fed: 'fish' }));
  rd = await tapRead(page, bed(0), (a) => [a.farm.plots[0].stage, a.farm.plots[0].fruits]);
  assert.deepStrictEqual(rd.after, [4, 3], 'a tickle that finishes a stage moves the plant on (here: ripe)');
  // a bug is brushed off before a dry bed is watered
  await tickleFarm(P('chilli', 2, { t: 0.7, bug: '🐛', water: 0 }));
  rd = await tapRead(page, bed(0), (a) => [a.farm.plots[0].bug, a.farm.plots[0].water]);
  assert.deepStrictEqual(rd.after, [null, 0], 'a bug first');
  await page.waitForTimeout(250);
  rd = await tapRead(page, bed(0), (a) => [a.farm.plots[0].bug, a.farm.plots[0].water]);
  assert.deepStrictEqual(rd.after, [null, 3], 'then the water');
  assert.deepStrictEqual((await cues(page)).filter((c) => c === 'shoo' || c === 'water').slice(-2), ['shoo', 'water']);
  // mashing: four fingers on random beds every 15ms for two seconds: one job per bed at a time, never a crash
  await openGarden(page, { bugs: 'some', farm: { done: 3, rainIn: 110, plots: [P('tomato', 1), null, P('carrot', 2, { t: 0.4 }), P('chilli', 3, { water: 0 }), P('tomato', 4, { fruits: 2 }), null] } });
  await page.evaluate(() => {
    window.__acts = [];
    window.__mash = setInterval(() => {
      const beds = document.querySelectorAll('.g-garden .gd-plot');
      for (let k = 0; k < 4; k++) {
        const n = beds[Math.floor(Math.random() * beds.length)], r = n.getBoundingClientRect(), id = 5000 + Math.floor(Math.random() * 1e6);
        const o = { bubbles: true, cancelable: true, pointerId: id, pointerType: 'touch', clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
        n.dispatchEvent(new PointerEvent('pointerdown', o)); n.dispatchEvent(new PointerEvent('pointerup', o));
      }
    }, 15);
    window.__logPoll = setInterval(() => { MG.current.api.log.forEach((x) => { if (!window.__acts.some((y) => y.t === x.t && y.c === x.c && y.i === x.i)) window.__acts.push(x); }); }, 100);
  });
  await page.waitForTimeout(2000);
  const acts = await page.evaluate(() => { clearInterval(window.__mash); clearInterval(window.__logPoll); MG.current.api.log.forEach((x) => { if (!window.__acts.some((y) => y.t === x.t && y.c === x.c && y.i === x.i)) window.__acts.push(x); }); return window.__acts; });
  const counted = acts.filter((x) => ['plant', 'water', 'shoo', 'tickle', 'tickle-rest', 'ask', 'pick', 'pull-open'].includes(x.c));
  assert.ok(counted.length >= 10, `mashing does things (${counted.length})`);
  for (let i = 0; i < 6; i++) {
    const ts = counted.filter((x) => x.i === i).map((x) => x.t).sort((a, b) => a - b);
    for (let k = 1; k < ts.length; k++) assert.ok(ts[k] - ts[k - 1] >= tune.BED_GAP - 0.01, `one job at a time on bed ${i}: ${ts.join(', ')}`);
  }
  f = await farm(page);
  assert.ok(f.plots.every((p) => !p.crop || (p.stage >= 0 && p.stage <= 4 && p.water >= 0 && p.water <= 3)), 'every bed still makes sense');
  assert.ok(Object.values(f.basket).every((n) => n >= 1 && n <= 3));

  // ===================================================================== 5. never stuck
  // a regrowing plant fruits twice, then its bed is free and shows the seed the visitor needs
  await openGarden(page, { farm: { rainIn: 110 } });
  await fast(page, 8);
  for (let i = 0; i < 4; i++) await tap(page, bed(i));
  f = await farm(page);
  assert.ok(f.plots.some((p) => p.crop === 'tomato') && f.plots.some((p) => p.crop === 'chilli'), 'tapping every bed sows both the tomato and the chilli the visitor wants: ' + f.plots.map((p) => p.crop));
  await fast(page, 1);
  await setFarm(page, { done: 0, rainIn: 110, plots: [0, 1, 2, 3].map(() => P('tomato', 4, { fruits: 1 })) });
  for (let i = 0; i < 4; i++) await tap(page, bed(i), 0);
  f = await farm(page);
  assert.ok(f.plots.every((p) => p.crop === 'tomato' && p.stage === 2 && p.picks === 1), 'four tomatoes picked once: they grow again');
  await setFarm(page, Object.assign(f, { plots: f.plots.map((p) => Object.assign(p, { stage: 4, fruits: 1 })) }));
  await tap(page, bed(0), 0);
  f = await farm(page);
  assert.deepStrictEqual([f.plots[0].crop, f.plots[0].water], [null, 2], 'picked a second time: the bed is free (and still damp)');
  assert.strictEqual((await api(page, 'ghosts'))[0], 'chilli', 'and it shows the chilli the visitor wants');
  await page.waitForTimeout(250);
  await tap(page, bed(0));
  assert.strictEqual((await farm(page)).plots[0].crop, 'chilli');
  // a child tapping anything at random still fills the order
  await openGarden(page, { bugs: 'some' });
  await fast(page, 8);
  let taps = 0;
  for (let done = 0; taps < 1500 && done < 1; taps++) {
    const res = await page.evaluate((id) => {
      const a = MG.current.api;
      if (a.state !== 'play') { a.grow(0.3); return { bad: null, done: a.farm.done }; }
      const all = [...document.querySelectorAll('.g-garden .gd-plot, .g-garden .gd-tool, .g-garden .gd-visitor, .g-garden .gd-basket, .g-garden .gd-yard__item')];
      const n = all[Math.floor(Math.random() * all.length)], r = n.getBoundingClientRect();
      const o = { bubbles: true, cancelable: true, pointerId: id, pointerType: 'touch', clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
      n.dispatchEvent(new PointerEvent('pointerdown', o)); n.dispatchEvent(new PointerEvent('pointerup', o));
      a.grow(0.3);
      const f = a.farm;
      if (Object.values(f.basket).some((v) => v > 3 || v < 1)) return { bad: 'basket ' + JSON.stringify(f.basket) };
      const p = f.plots.find((p) => (p.crop && !a.CROPS[p.crop]) || p.stage < 0 || p.stage > 4 || p.water < 0 || p.water > 3 || p.t < 0 || p.t > 1.5);
      return { bad: p ? 'plot ' + JSON.stringify(p) : null, done: f.done };
    }, ++pid);
    assert.strictEqual(res.bad, null, 'random tapping never breaks anything');
    done = res.done;
    await page.waitForTimeout(25);
  }
  assert.strictEqual((await farm(page)).done, 1, `a child tapping at random fills the order (${taps} taps)`);
  await page.waitForTimeout(800);

  // ===================================================================== 6. following only the ghost hand
  /** Follow the hand until `until` (in the page) is true; checks where the hand points at every step. */
  async function followHand(p, until, maxSteps) {
    let steps = 0, pulls = 0;
    for (; steps < maxSteps && !(await p.evaluate((s) => (0, eval)('(' + s + ')')(MG.current.api), until.toString())); steps++) {
      const did = await p.evaluate((id) => {
        const a = MG.current.api;
        if (a.delivering || a.state === 'pop') return 'wait';
        if (a.state !== 'play' && a.state !== 'pull') return 'wait';
        a.hintNext();
        const n = a.hinted;
        if (!n) { a.grow(1); return 'grow'; }
        if (n.closest('.gd-yard')) return 'bad: the yard';
        if (n.classList.contains('gd-plot')) {
          const i = +n.dataset.i, pl = a.farm.plots[i], o = a.farm.order;
          const still = (c) => o ? (o.want[c] || 0) - (o.got[c] || 0) - (a.farm.basket[c] || 0) : 0;
          if (!pl.crop && !a.neededSeeds().includes(a.ghosts[i])) return 'bad: an empty bed with an unneeded seed';
          const happy = pl.crop && pl.stage < 4 && pl.water > 0 && !pl.bug && !(pl.stage === 2 && !pl.fed && pl.t >= 0.5);
          const freeing = a.neededSeeds().length && !a.farm.plots.some((q) => !q.crop);
          if (happy && still(pl.crop) <= 0 && !freeing) return 'bad: a happy plant nobody wants yet';
        }
        const r = n.getBoundingClientRect();
        const ev = { bubbles: true, cancelable: true, pointerId: id, pointerType: 'touch', clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
        n.dispatchEvent(new PointerEvent('pointerdown', ev));
        n.dispatchEvent(new PointerEvent('pointerup', ev));
        if (a.state === 'play') a.grow(0.4);
        return n.classList.contains('gd-pull__half') ? 'pull' : 'tap';
      }, ++pid);
      assert.ok(!did.startsWith('bad'), 'the hand never points at ' + did.slice(5));
      if (did === 'pull') pulls++;
      await p.waitForTimeout(did === 'wait' ? 120 : 40);
    }
    return { steps, pulls };
  }
  await openGarden(page, { bugs: 'some' });
  await fast(page, 8);
  let fol = await followHand(page, (a) => a.farm.done >= 1, 260);
  assert.ok((await farm(page)).done === 1, `the ghost hand alone leads to a filled order (${fol.steps} steps)`);
  await page.waitForTimeout(800);
  // and through a giant pull to a filled order
  await openGarden(page, { farm: { done: 3, giants: 0, rainIn: 110, order: { who: '🐰', want: { carrot: 3 }, got: {} }, plots: [P('carrot', 3, { t: 0.99, fed: 'leaf' }), P('tomato', 2, { t: 0.1, fed: 'bone' }), null, null, null, null] } });
  await fast(page, 8);
  fol = await followHand(page, (a) => a.farm.done >= 4, 120);
  f = await farm(page);
  assert.ok(f.done === 4 && f.giants === 1 && fol.pulls >= 4, `the hand leads through the giant pull to a filled order (${fol.steps} steps, ${fol.pulls} heaves)`);
  await page.waitForTimeout(800);
  await page.evaluate(() => { MG.timeScale = 1; MG.home(); MG.open('garden'); });
  await ready(page);
  f = await farm(page);
  const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('mg:game:garden:farm')));
  assert.deepStrictEqual([f.done, f.giants, f.plots[1].crop, kept.v, kept.giants], [4, 1, 'tomato', 2, 1], 'left and opened again: the giant count, the beds and the basket are kept');

  // ===================================================================== 7. heave-ho: the giant vegetable
  await openGarden(page, { farm: { done: 3, giants: 0, rainIn: 110, basket: { carrot: 1 }, order: { who: '🐷', want: { tomato: 3 }, got: {} },
    plots: [P('carrot', 3, { t: 0.99, fed: 'leaf' }), P('carrot', 3, { t: 0.5, fed: 'leaf' }), P('tomato', 2, { t: 0.1, fed: 'bone' }), null, null, null] } });
  await grow(page, 1);
  f = await farm(page);
  assert.deepStrictEqual([f.plots[0].stage, f.plots[0].giant, f.plots[0].fruits], [4, true, 3], 'the first perfect carrot ripens giant');
  assert.ok(await page.locator(bed(0) + '.is-giant .gd-peek--giant').count(), 'a huge carrot peeks out of its bed');
  assert.ok((await cues(page)).includes('giant'));
  await grow(page, 6);
  f = await farm(page);
  assert.deepStrictEqual([f.plots[1].stage, f.plots[1].giant], [4, false], 'one giant a round: the next carrot is an ordinary one');
  assert.strictEqual(await page.evaluate(() => MG.current.api.hintNext() || MG.current.api.hinted.dataset.i), '0', 'the hand goes to the giant first');
  const water0 = f.plots[0].water;
  await tap(page, bed(0), 0);
  assert.strictEqual(await api(page, 'state'), 'pull', 'a tap on the giant: everybody pulls');
  assert.ok(await page.locator('.g-garden .gd-pull').isVisible());
  const need = (await api(page, 'pull')).need;
  let fin = null, prev = 0;
  for (let k = 0; k < need && !fin; k++) {
    await page.waitForTimeout(300);
    rd = await tapRead(page, half(k % 2), (a) => ({ state: a.state, pulled: a.pull ? a.pull.pulled : null, basket: a.farm.basket.carrot, plot: a.farm.plots[0], giants: a.farm.giants, saved: JSON.parse(localStorage.getItem('mg:game:garden:farm')).giants }));
    if (rd.after.state === 'pop') fin = { taps: k + 1, r: rd.after };
    else {
      assert.strictEqual(rd.after.pulled - prev, k ? 2 : 1, 'pulling together counts double');
      prev = rd.after.pulled;
    }
  }
  assert.ok(fin && fin.taps <= Math.ceil((need + 1) / 2), `pulling together, it comes out in ${fin && fin.taps} taps`);
  assert.deepStrictEqual([fin.r.basket, fin.r.plot.crop, fin.r.plot.water, fin.r.giants, fin.r.saved], [3, null, water0 - 1, 1, 1], 'out it comes: three into the basket, the bed free, and saved at once');
  await page.waitForFunction(() => MG.current.api.state === 'play', null, { timeout: 2000 });
  assert.ok(!(await page.locator('.g-garden .gd-pull').isVisible()), 'and back to the garden');
  // pulling alone: it still comes out
  await setFarm(page, { done: 3, giants: 1, rainIn: 110, plots: [P('carrot', 4, { fruits: 2 }), null, null, null, null, null] });
  assert.ok(await page.evaluate(() => MG.current.api.giant(0)), 'a giant in bed 0');
  await tap(page, bed(0), 0);
  let solo = 0;
  for (; solo < 30 && (await api(page, 'state')) === 'pull'; solo++) { await page.waitForTimeout(220); await tap(page, half(0), 0); }
  assert.strictEqual(solo, need, `one person alone pulls it out in ${need} taps (${solo})`);
  await page.waitForFunction(() => MG.current.api.state === 'play', null, { timeout: 2500 });
  // mashing both halves with four fingers: one giant, never more than enough
  await setFarm(page, { done: 12, giants: 1, rainIn: 110, plots: [P('potato', 4, { fruits: 2 })] });
  assert.ok(await page.evaluate(() => MG.current.api.giant(0)), 'a giant in bed 0');
  await tap(page, bed(0), 0);
  await page.evaluate(() => {
    window.__most = 0;
    window.__mash = setInterval(() => {
      for (let k = 0; k < 4; k++) {
        const n = document.querySelectorAll('.g-garden .gd-pull__half')[k % 2], r = n.getBoundingClientRect(), id = 9000 + Math.floor(Math.random() * 1e6);
        const o = { bubbles: true, cancelable: true, pointerId: id, pointerType: 'touch', clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
        n.dispatchEvent(new PointerEvent('pointerdown', o)); n.dispatchEvent(new PointerEvent('pointerup', o));
        const pl = MG.current.api.pull;
        if (pl) window.__most = Math.max(window.__most, pl.pulled - pl.need);
      }
    }, 15);
  });
  await page.waitForTimeout(2000);
  const mash = await page.evaluate(() => { clearInterval(window.__mash); return { most: window.__most, giants: MG.current.api.farm.giants, log: MG.current.api.log }; });
  assert.deepStrictEqual([mash.giants, mash.most <= 0], [2, true], 'mashing: exactly one more giant, never pulled past the top');
  for (const s of [0, 1]) {
    const ts = mash.log.filter((x) => x.c === 'heave' + s).map((x) => x.t);
    for (let k = 1; k < ts.length; k++) assert.ok(ts[k] - ts[k - 1] >= 0.15 - 0.01, `one heave at a time on each side: ${ts.join(', ')}`);
  }
  await page.waitForFunction(() => MG.current.api.state === 'play', null, { timeout: 2500 });
  // leaving mid-pull keeps the giant in its bed
  await setFarm(page, { done: 12, giants: 2, rainIn: 110, plots: [P('pumpkin', 4, { fruits: 2 })] });
  assert.ok(await page.evaluate(() => MG.current.api.giant(0)), 'a giant in bed 0');
  await tap(page, bed(0), 0);
  await tap(page, half(1));
  assert.strictEqual(await api(page, 'state'), 'pull');
  await page.evaluate(() => { MG.home(); MG.open('garden'); });
  await ready(page);
  f = await farm(page);
  assert.deepStrictEqual([f.plots[0].crop, f.plots[0].stage, f.plots[0].giant, f.giants], ['pumpkin', 4, true, 2], 'left mid-pull: the giant is still there');
  await tap(page, bed(0), 0);
  assert.strictEqual(await api(page, 'state'), 'pull', 'and a tap pulls again');
  // the hand: the little one's side first, then whoever has pulled less; following it alone gets it out
  const pg = await t.open(ID);
  await pg.evaluate(() => { localStorage.setItem('mg:players', JSON.stringify([{ emoji: '🐰', color: 'berry', little: false }, { emoji: '🐻', color: 'sea', little: true }])); });
  await pg.reload();
  await pg.waitForFunction(() => window.MG && MG.current && MG.current.id === 'garden');
  await openGarden(pg, { farm: { done: 3, giants: 1, rainIn: 110, plots: [P('carrot', 4, { fruits: 2 }), null, null, null, null, null] } });
  assert.ok(await pg.evaluate(() => MG.current.api.giant(0)));
  await tap(pg, bed(0), 700);
  assert.strictEqual(await pg.evaluate(() => MG.current.api.hinted && MG.current.api.hinted.dataset.side), '1', 'the hand starts on the little one\'s side');
  await tap(pg, half(1), 200); await tap(pg, half(1), 50);
  assert.strictEqual(await pg.evaluate(() => MG.current.api.hinted && MG.current.api.hinted.dataset.side), '0', 'then invites the other one');
  for (let k = 0; k < 30 && (await api(pg, 'state')) === 'pull'; k++) {
    await pg.evaluate(() => MG.current.api.hintNext());
    await tap(pg, '.g-garden .gd-pull__half[data-side="' + (await pg.evaluate(() => MG.current.api.hinted.dataset.side)) + '"]', 200);
  }
  assert.strictEqual(await api(pg, 'state') !== 'pull', true, 'following the hand gets it out');
  await pg.evaluate(() => localStorage.removeItem('mg:players'));
  await pg.context().close();

  // ===================================================================== 8. never punished
  await openGarden(page);
  await setFarm(page, { done: 0, rainIn: 110, plots: [P('tomato', 1, { water: 0, t: 0.3 }), P('chilli', 1, { t: 0.3, bug: '🐛' }), P('chilli', 2, { t: 0.6 }), null] });
  await grow(page, tune.GRACE_S - 1);
  f = await farm(page);
  assert.deepStrictEqual([f.plots[0].perfect, f.plots[1].perfect], [true, true], 'a short wait for water or for the bug to go costs nothing');
  await grow(page, 40);
  f = await farm(page);
  assert.deepStrictEqual([f.plots[0].crop, f.plots[0].stage, f.plots[0].t], ['tomato', 1, 0.3], 'a dry plant waits, it never dies');
  assert.ok(await page.locator(bed(0) + '.is-dry').count(), 'and droops');
  assert.deepStrictEqual([f.plots[1].stage, f.plots[1].t, f.plots[1].bug], [1, 0.3, '🐛'], 'a bugged plant waits');
  assert.deepStrictEqual([f.plots[0].perfect, f.plots[1].perfect], [false, false], 'a long wait: one fruit fewer, that is all');
  await tap(page, bed(1), 0);
  assert.strictEqual((await farm(page)).plots[1].bug, null, 'a tap: the bug is sprayed off');
  assert.ok(await page.locator(bed(1) + ' .gd-cameo--spray').count(), 'and the spray bottle shows it');
  await tap(page, bed(0), 0);
  assert.strictEqual((await farm(page)).plots[0].water, 3, 'a tap: the dry bed is watered');
  assert.ok(await page.locator(bed(0) + ' .gd-cameo--rain').count(), 'by a little rain cloud');
  rd = await tapRead(page, sack('bone'), (a) => a.hinted && a.hinted.dataset.tool);   // the chilli wants fish
  f = await farm(page);
  assert.strictEqual(f.plots[2].fed, null, 'the wrong sack: the chilli shakes its head');
  if (tune.help) assert.strictEqual(rd.after, 'fish', 'and the hand shows the fish');
  await tap(page, bed(2), 0);
  assert.strictEqual((await farm(page)).plots[2].fed, null, 'a tap on a hungry plant uses nothing up');
  await page.evaluate(() => MG.current.api.rain());
  assert.ok((await farm(page)).plots.every((p) => p.water === 3), 'rain waters every bed');

  // ===================================================================== 9. helpers, the puppy, the yard, the tree
  await setFarm(page, { done: 3, rainIn: 110, plots: [P('tomato', 1), P('chilli', 2, { t: 0.1 }), null, null, null, null] });
  await page.evaluate(() => MG.current.api.bug(0));
  await grow(page, 10);
  assert.strictEqual((await farm(page)).plots[0].bug, null, 'the ladybird ate it');
  await setFarm(page, { done: 0, rainIn: 110, plots: [P('tomato', 1), P('chilli', 1), P('tomato', 2, { fed: 'bone' }), P('chilli', 1)] });
  for (let k = 0; k < 8; k++) { await grow(page, 5); await page.evaluate(() => MG.current.api.rain()); }
  assert.ok((await farm(page)).plots.every((p) => !p.bug), 'no bugs when bugs are off');
  await openGarden(page, { bugs: 'some' });
  await setFarm(page, { done: 0, rainIn: 110, plots: [P('tomato', 1, { t: 0.38 }), P('chilli', 1), null, null] });
  await grow(page, 0.4);
  assert.ok((await farm(page)).plots[0].bug, 'the first rounds: an early bug, to show what a tap does to it');
  if (tune.help) assert.strictEqual(await page.evaluate(() => MG.current.api.hinted && MG.current.api.hinted.dataset.i), '0', 'and the hand shows its bed');
  await openGarden(page, { bugs: 'lots' });
  await setFarm(page, { done: 2, plots: [P('tomato', 1), P('chilli', 1), P('tomato', 1), P('chilli', 1)] });
  let most = 0;
  for (let k = 0; k < 30; k++) {
    await page.evaluate(() => { const a = MG.current.api; a.grow(5); a.setFarm(Object.assign(a.farm, { plots: a.farm.plots.map((p) => Object.assign(p, { stage: 1, t: 0, water: 3 })) })); });
    most = Math.max(most, (await farm(page)).plots.filter((p) => p.bug).length);
  }
  assert.ok(most >= 1 && most <= 2, `bugs come, two at most at once (${most})`);
  // the puppy chases a bug that a tap sprays off (from the thirteenth order)
  await openGarden(page, { farm: { done: 13, rainIn: 110, plots: [P('tomato', 1, { bug: '🐛' })] } });
  await tap(page, bed(0), 0);
  assert.deepStrictEqual((await cues(page)).filter((c) => c === 'shoo' || c === 'woof'), ['shoo', 'woof'], 'the puppy gives chase');
  assert.strictEqual(await page.locator('.g-garden .gd-yard .gd-helper--pup').count(), 1, 'it lives in the yard');
  await setFarm(page, { done: 12, rainIn: 110, plots: [P('tomato', 1, { bug: '🐛' })] });
  await page.waitForTimeout(250);
  await tap(page, bed(0), 0);
  const c12 = await cues(page);
  assert.ok(c12.filter((c) => c === 'woof').length === 1 && c12.filter((c) => c === 'shoo').length === 2, 'no puppy yet at twelve');
  await setFarm(page, { done: 12, rainIn: 110, plots: [P('tomato', 4, { fruits: 2 })] });
  // a tap in the yard: things hop and make their sounds, and nothing changes
  const before = await page.evaluate(() => ({ lastTap: MG.current.api.lastTap, plots: JSON.stringify(MG.current.api.farm.plots), basket: JSON.stringify(MG.current.api.farm.basket) }));
  await tap(page, '.g-garden .gd-tree', 0);
  for (let k = 0; k < 9; k++) { await page.waitForTimeout(50); await tap(page, k % 2 ? '.g-garden .gd-yard__items .gd-yard__item' : '.g-garden .gd-tree', 0); }
  const after = await page.evaluate(() => ({ lastTap: MG.current.api.lastTap, plots: JSON.stringify(MG.current.api.farm.plots), basket: JSON.stringify(MG.current.api.farm.basket) }));
  const pokes = (await cues(page)).filter((c) => c.startsWith('poke:'));
  assert.ok(pokes[0] === 'poke:🌳' && pokes.length <= 4, 'poking the tree: a rustle; ten taps in half a second: a few pokes (' + pokes.join(' ') + ')');
  assert.deepStrictEqual(after, before, 'the yard is just for fun: it changes nothing, and does not count as doing something');
  // our tree grows during a thank-you (at 3 orders, not at 4); from 25 orders it gives the visitor a mango
  for (const [done, grows, mango] of [[2, true, false], [3, false, false], [25, false, true]]) {
    await openGarden(page, { farm: { done, rainIn: 110, basket: { tomato: 3, chilli: 3 }, order: { who: '🐷', want: { tomato: 1, chilli: 1 }, got: {} } } });
    await fast(page, 8);
    await tap(page, '.g-garden .gd-visitor');
    await page.waitForFunction(() => MG.current.api.state === 'gift', null, { timeout: 4000 });
    await page.waitForTimeout(400);
    const c = await cues(page);
    assert.strictEqual(c.includes('tree-grow'), grows, `the tree grows at ${done + 1} orders: ${grows}`);
    if (grows) assert.ok(await page.locator('.g-garden .gd-tree[data-stage="1"]').count(), 'a sapling now');
    assert.strictEqual(c.includes('mango'), mango, `a thank-you mango at ${done}: ${mango}`);
    await t.waitForWin(page, 6000);
  }

  // ===================================================================== 10. plants you can read
  const ALL = ['tomato', 'chilli', 'carrot', 'corn', 'strawberry', 'eggplant', 'pumpkin', 'cucumber', 'potato'];
  await openGarden(page, { farm: { done: 23, rainIn: 110, plots: ALL.map((c) => P(c, 2, { t: 0.2, water: 0 })) } });
  const forms = await page.evaluate(() => [...document.querySelectorAll('.g-garden .gd-plot')].map((b) => ({ crop: b.dataset.crop, form: b.dataset.form, stake: !!b.querySelector('.gd-stake'), leaves: b.querySelectorAll('.gd-plant > .mg-sticker').length })));
  const CR = await api(page, 'CROPS');
  for (const x of forms) {
    assert.strictEqual(x.form, CR[x.crop].form, `${x.crop} grows its own way`);
    assert.strictEqual(x.stake, x.form === 'stake', `${x.crop}: a stake only for climbers`);
    assert.strictEqual(x.leaves, x.form === 'low' || x.form === 'sprawl' ? 2 : 1, `${x.crop}: leaves`);
  }
  await setFarm(page, { done: 23, rainIn: 110, plots: ALL.map((c) => P(c, 3, { t: 0.3, water: 0 })) });
  assert.strictEqual(await page.locator('.g-garden .gd-unripe').count(), 0, 'first flowers');
  assert.strictEqual(await page.locator('.g-garden .gd-flowers').count(), 9);
  await setFarm(page, { done: 23, rainIn: 110, plots: ALL.map((c) => P(c, 3, { t: 0.7, water: 0 })) });
  const late = await page.evaluate(() => [...document.querySelectorAll('.g-garden .gd-plot')].map((b) => ({ crop: b.dataset.crop, flowers: !!b.querySelector('.gd-flowers'), unripe: b.querySelectorAll('.gd-unripe .mg-sticker').length, peek: !!b.querySelector('.gd-peek') })));
  for (const x of late) {
    assert.ok(!x.flowers, 'then the flowers are gone');
    if (CR[x.crop].root) assert.ok(x.peek && !x.unripe, `${x.crop}: its top peeks out of the soil`);
    else assert.ok(x.unripe === 2 && !x.peek, `${x.crop}: two small green ones on the plant`);
  }
  // the third (care) fruit pops in on its own, once
  await setFarm(page, { done: 2, rainIn: 110, plots: [P('tomato', 3, { t: 0.99, fed: 'bone' }), null, null, null] });
  const bonus = await page.evaluate(() => { const a = MG.current.api; a.grow(0.4); return { fruits: a.farm.plots[0].fruits, cls: !!document.querySelector('.g-garden .gd-fruits .is-bonus') }; });
  assert.deepStrictEqual(bonus, { fruits: 3, cls: true }, 'a cared-for, fed plant: its third fruit pops in on its own');
  await waitCue(page, 'bonus', 1500);
  await page.evaluate(() => { MG.home(); MG.open('garden'); });
  await ready(page);
  assert.strictEqual(await page.locator('.g-garden .gd-fruits .is-bonus').count(), 0, 'and is never replayed');

  // ===================================================================== 11. visitors with a life
  assert.ok((await cues(page)).includes('arrive'), 'knock knock: the visitor arrives');
  await openGarden(page);
  assert.strictEqual(await page.locator('.g-garden .gd-wish__item.is-fav').count(), 0, 'the first visitor has no favourite yet');
  await openGarden(page, { farm: { done: 4, rainIn: 110, basket: { chilli: 3, tomato: 1 }, order: { who: '🦊', want: { chilli: 2, tomato: 1 }, got: {} } } });
  assert.strictEqual(await page.locator('.g-garden .gd-wish__item.is-fav').count(), 1, 'the fox\'s favourite (chilli) is marked once');
  assert.strictEqual(await page.locator('.g-garden .gd-wish__item.is-fav').getAttribute('data-crop'), 'chilli');
  await page.evaluate(() => {
    window.__wins = 0; window.__giftAt = null; window.__winAt = null;
    new MutationObserver(() => {
      const w = document.querySelector('.mg-overlay--win');
      if (w && !window.__winAt) { window.__winAt = performance.now(); window.__wins++; }
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    const poll = setInterval(() => { if (MG.current && MG.current.api && MG.current.api.state === 'gift' && !window.__giftAt) { window.__giftAt = performance.now(); clearInterval(poll); } }, 10);
  });
  await tap(page, '.g-garden .gd-visitor');
  await page.waitForTimeout(6000);
  const vis = await page.evaluate(() => ({ wins: window.__wins, gap: window.__winAt - window.__giftAt, log: MG.current && MG.current.api ? MG.current.api.log.map((x) => x.c) : [] }));
  assert.ok(vis.log.includes('fav') && vis.log.includes('spicy'), 'their favourite makes them happiest; the fox\'s chilli is spicy: ' + vis.log.join(' '));
  assert.ok(['thanks0', 'thanks1', 'gift-from-visitor'].every((c) => vis.log.includes(c)));
  assert.strictEqual(vis.wins, 1, 'one party');
  assert.ok(vis.gap > 0 && vis.gap <= 3600, `the finale is short (${Math.round(vis.gap)}ms from the filled order to the party)`);

  // ===================================================================== 12. after the rain, a rainbow
  await openGarden(page, { farm: { rainIn: 110 } });
  await page.evaluate(() => { MG.current.api.rain(); MG.current.api.grow(4); });
  assert.ok(await page.locator('.g-garden .gd-rainbow.is-on').count(), 'a rainbow');
  assert.ok((await cues(page)).includes('rainbow'));
  await page.waitForTimeout(3000);
  assert.strictEqual(await page.locator('.g-garden .gd-rainbow.is-on').count(), 0, 'for a little while');

  // ===================================================================== 13. every size, both ways round
  const shotDir = process.env.MG_SHOTS || path.join(h.ROOT, 'tests', 'shots');
  for (const vp of ['small', 'phone', 'phoneWide', 'tabletTall', 'tablet']) {
    const dark = vp === 'phoneWide' || vp === 'tablet';
    const p = await t.open(ID, { viewport: vp, dark, reducedMotion: vp === 'tabletTall' });
    await ready(p);
    for (const done of [0, 3, 6, 23, 40]) {
      const n = done >= 6 ? 9 : done >= 2 ? 6 : 4;
      const crops = done >= 12 ? ALL : done >= 6 ? ALL.slice(0, 5) : done >= 1 ? ALL.slice(0, 3) : ALL.slice(0, 2);
      const plots = Array.from({ length: n }, (_, i) => {
        const c = crops[i % crops.length], k = i % 5;
        return k === 0 ? P(c, 4, { fruits: 3, fed: 'bone' }) : k === 1 ? P(c, 2, { t: 0.6, water: 0 }) : k === 2 ? P(c, 3, { t: 0.7 }) : k === 3 ? P(c, 1, { t: 0.3, bug: '🐛' }) : null;
      });
      const basket = done > 12 ? Object.fromEntries(ALL.map((c) => [c, 3])) : { tomato: 3, chilli: 2 };
      await setFarm(p, { done, rainIn: 110, plots, basket });
      await p.waitForTimeout(350);
      const label = `@${vp} (done ${done}, ${n} beds)`;
      const sel = '.g-garden .gd-plot, .g-garden .gd-tool, .g-garden .gd-visitor, .g-garden .gd-basket';
      assert.deepStrictEqual(await t.outsidePlayArea(p, sel + ', .g-garden .gd-yard__item, .g-garden .gd-tree'), [], `in view ${label}`);
      const min = (await t.minTargetSize(p, sel)).min;
      assert.ok(min >= 64, `big enough ${label}: ${min}px`);
      assert.ok(await t.noPageScroll(p), `no page scroll ${label}`);
      assert.deepStrictEqual(await overlaps(p, sel + ', .g-garden .gd-yard__item'), [], `nothing overlaps (the yard included) ${label}`);
      assert.deepStrictEqual(await escapes(p, '.g-garden .gd-need, .g-garden .gd-unripe, .g-garden .gd-peek, .g-garden .gd-label, .g-garden .gd-stake, .g-garden .gd-marker', '.gd-plot', 1), [], `what is drawn in a bed stays in it ${label}`);
      assert.deepStrictEqual(await escapes(p, '.g-garden .gd-pile', '.gd-basket', 0), [], `every pile shows inside the basket ${label}`);
      const pileSize = await p.evaluate(() => Math.min(...[...document.querySelectorAll('.g-garden .gd-pile .mg-sticker')].map((n) => n.getBoundingClientRect().height)));
      assert.ok(pileSize >= (vp === 'small' ? 12 : 16), `basket vegetables big enough to see ${label}: ${Math.round(pileSize)}px`);
      const yard = await p.evaluate(() => {
        const a = MG.current.api, f = a.farm;
        const items = [...document.querySelectorAll('.g-garden .gd-yard__items > .gd-yard__item')];
        const tree = document.querySelector('.g-garden .gd-tree').getBoundingClientRect();
        return { n: items.length, want: Object.keys(f.helpers).length + f.decor.length, min: Math.min(...items.map((x) => parseFloat(getComputedStyle(x.firstChild).fontSize))), tree: Math.min(tree.width, tree.height),
          cols: getComputedStyle(document.querySelector('.g-garden .gd-beds')).gridTemplateColumns.split(' ').length, cell: document.querySelector('.g-garden .gd-plot').getBoundingClientRect().width,
          labels: document.querySelectorAll('.g-garden .gd-label').length, text: document.querySelector('.g-garden').innerText.replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{1F3FB}-\u{1F3FF}\s]/gu, '') };
      });
      assert.strictEqual(yard.n, yard.want, `every helper and decoration is in the yard ${label}`);
      if (done === 40) assert.strictEqual(yard.n, 14);
      if (yard.n) assert.ok(yard.min >= (vp === 'small' ? 17 : 24), `yard stickers big enough ${label}: ${yard.min}px`);
      assert.ok(yard.tree >= 64, `our tree is big enough ${label}: ${yard.tree}px`);
      assert.strictEqual(yard.text, '', `nothing to read ${label}`);
      if (n === 6 && vp === 'phone') assert.ok(yard.cols === 2 && yard.cell >= 135, `six beds on a tall phone: two big columns ${label}: ${yard.cols} x ${yard.cell}px`);
      if (n === 6 && vp === 'small') assert.strictEqual(yard.cols, 3, `six beds on a small phone: three columns ${label}`);
      if (n === 9 && vp === 'phone') assert.ok(yard.labels > 0, `labels on the beds ${label}`);
      if (n === 9 && vp === 'small') assert.strictEqual(yard.labels, 0, `no labels on the smallest beds ${label}`);
      if (done === 23) await t.shot(p, `${ID}-${vp}.png`);
    }
    // a rainbow over the beds, in view
    await p.evaluate(() => { MG.current.api.rain(); MG.current.api.grow(4); });
    await p.waitForTimeout(350);
    assert.deepStrictEqual(await t.outsidePlayArea(p, '.g-garden .gd-rainbow, .g-garden .gd-rainbow *'), [], `the rainbow is in view @${vp}`);
    // the giant pull: two big halves, everything in view, the animals apart
    await setFarm(p, { done: 23, giants: 1, rainIn: 110, plots: [P('carrot', 4, { fruits: 2 }), null, null, null, null, null, null, null, null] });
    assert.ok(await p.evaluate(() => MG.current.api.giant(0)));
    await tap(p, bed(0), 450);
    assert.strictEqual(await api(p, 'state'), 'pull');
    const pl = await p.evaluate(() => ({ halves: [...document.querySelectorAll('.g-garden .gd-pull__half')].map((n) => n.getBoundingClientRect().width) }));
    assert.ok(pl.halves.every((w) => w >= 120), `two big halves @${vp}: ${pl.halves.map(Math.round)}`);
    assert.deepStrictEqual(await t.outsidePlayArea(p, '.g-garden .gd-pull *'), [], `the pull is all in view @${vp}`);
    assert.deepStrictEqual(await overlaps(p, '.g-garden .gd-pull__animal'), [], `the two animals stand apart @${vp}`);
    await t.shot(p, `${ID}-pull-${vp}.png`);
    await p.context().close();
  }
  assert.ok(fs.existsSync(path.join(shotDir, `${ID}-pull-small.png`)));

  // ===================================================================== 14. turn the phone mid-round, and mid-pull; leave and come back
  page = await t.open(ID, { viewport: 'phone' });
  await openGarden(page, { farm: { done: 3, giants: 1, rainIn: 110, plots: [null, null, null, null, P('carrot', 4, { fruits: 2 }), null] } });
  const sown = (await api(page, 'ghosts'))[2];
  await tap(page, bed(2), 300);
  await page.setViewportSize(h.VIEWPORTS.phoneWide);
  await page.waitForTimeout(500);
  assert.deepStrictEqual(await t.outsidePlayArea(page, '.g-garden .gd-plot, .g-garden .gd-tool, .g-garden .gd-visitor, .g-garden .gd-yard__item'), [], 'in view after turning');
  assert.ok((await t.minTargetSize(page, '.g-garden .gd-plot, .g-garden .gd-tool, .g-garden .gd-visitor')).min >= 64, 'still big enough');
  await tap(page, bed(2), 0);
  f = await farm(page);
  assert.deepStrictEqual([f.plots[2].stage, f.plots[2].water], [0, 3], 'still plays after turning');
  assert.ok(await page.evaluate(() => MG.current.api.giant(4)));
  await tap(page, bed(4), 300);
  await tap(page, half(0), 200);
  await page.setViewportSize(h.VIEWPORTS.phone);
  await page.waitForTimeout(500);
  assert.strictEqual(await api(page, 'state'), 'pull', 'mid-pull, turned back');
  assert.deepStrictEqual(await t.outsidePlayArea(page, '.g-garden .gd-pull *'), [], 'the pull is in view after turning');
  for (let k = 0; k < 30 && (await api(page, 'state')) === 'pull'; k++) await tap(page, half(k % 2), 200);
  assert.ok((await farm(page)).giants === 2, 'and it still comes out');
  await page.waitForFunction(() => MG.current.api.state === 'play', null, { timeout: 2500 });
  await page.evaluate(() => { MG.home(); });
  await page.evaluate(() => { MG.open('garden'); });
  await ready(page);
  f = await farm(page);
  assert.deepStrictEqual([f.plots[2].crop, f.plots[2].water >= 2, f.basket.carrot, f.giants], [sown, true, 3, 2], 'kept after leaving');
  for (const bad of ['"nonsense"', '{"done":"x","plots":[null,5]}', '[1,2,3]', '{"giants":"lots"}']) {
    await page.evaluate((v) => { MG.home(); localStorage.setItem('mg:game:garden:farm', v); MG.open('garden'); }, bad);   // (leaving saves: spoil it after)
    await ready(page);
    assert.strictEqual(await page.locator('.g-garden .gd-plot').count(), 4, `a damaged save starts a new garden (${bad})`);
  }

  // ===================================================================== 15. quick growing is quicker; the first rounds are quicker still
  await openGarden(page, { speed: 'quick' });
  const tq = await api(page, 'tuning');
  assert.ok(tq.SPEED < 1);
  assert.ok(tq.STAGE_S_EARLY.every((s, i) => s <= tq.STAGE_S[i]) && tq.STAGE_S_EARLY[0] + tq.STAGE_S_EARLY[1] <= 8, 'a first seed sprouts and grows leaves within about eight seconds');

  // ===================================================================== 16. only emoji that old phones have (Unicode 11 or older)
  const OK = new Set([...'🍅🌶🌽🍓🍆🎃🌼🌸🌱🌿🌾🍂🐟🐛🐌🐜🐰🐻🐷🐮🐔🐼🐨🐸🐵🐞🐝🌷🌻🐈🍄🐇🏡🌳⭐💧💨💖✨🍃🎁🐕🐦🌈🎵⛲☘🌧🏅🥕🥒🥔🦊🦆🦋🦔🦴🧴🧺🥭🐢']);
  const src = fs.readFileSync(path.join(h.ROOT, 'js', 'games', 'garden.js'), 'utf8').replace(/️/g, '');
  const used = [...new Set(src.match(/\p{Extended_Pictographic}/gu))];
  assert.deepStrictEqual(used.filter((e) => !OK.has(e)), [], 'every emoji is one old phones have');
});
