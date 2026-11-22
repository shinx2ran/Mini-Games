/* Happy Garden: plant, water, feed, spray, pick, hand over; gifts unlock more; the garden is kept and never gets stuck. */
'use strict';
const h = require('./harness');
const ID = 'garden';

const api = (page, k) => page.evaluate((k) => MG.current.api[k], k);
const farm = (page) => api(page, 'farm');
let pid = 900;
/** A real touch on the middle of an element (down and up, a new finger each time). */
async function tap(page, sel) {
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
  await page.waitForTimeout(30);
}
const bed = (i) => `.g-garden .gd-plot[data-i="${i}"]`;
const tool = (t) => `.g-garden .gd-tool[data-tool="${t}"]`;
const ready = async (page) => {
  await page.waitForFunction(() => MG.current && MG.current.api && MG.current.api.state === 'play', null, { timeout: 30000 });
  await page.waitForTimeout(600);
};
/** Open the garden with options set first, from a clean slate unless `keep`. */
async function openGarden(page, opts = {}) {
  await page.evaluate((o) => {
    MG.home();                                    // (leaving saves the garden: clear it after)
    if (!o.keep) localStorage.removeItem('mg:game:garden:farm');
    MG.store.set('opt:garden:bugs', o.bugs || 'none');
    MG.store.set('opt:garden:speed', o.speed || 'normal');
    MG.open('garden');
  }, opts);
  await ready(page);
}
const P = (crop, stage, o = {}) => Object.assign({ crop, stage, t: 0, water: 3, fed: null, bug: null, fruits: 0, perfect: true }, o);
const setFarm = (page, f) => page.evaluate((f) => MG.current.api.setFarm(f), f);
const grow = (page, s) => page.evaluate((s) => MG.current.api.grow(s), s);
async function waterAll(page, beds) { await tap(page, tool('water')); for (const i of beds) await tap(page, bed(i)); }
/** Rectangles of everything matching `inner` that are not inside their `outer` (closest ancestor or the one element). */
const escapes = (page, inner, outer, pad = 1) => page.evaluate(([inner, outer, pad]) => [...document.querySelectorAll(inner)].filter((n) => {
  const box = (n.closest(outer) || document.querySelector(outer)).getBoundingClientRect(), r = n.getBoundingClientRect();
  return r.left < box.left - pad || r.right > box.right + pad || r.top < box.top - pad || r.bottom > box.bottom + pad;
}).map((n) => n.className + ' ' + (n.dataset.crop || '')), [inner, outer, pad]);

h.run(ID, async (t) => {
  const { assert } = t;
  let page = await t.open(ID);
  await ready(page);

  // --- the rules: saved gardens are repaired; unlocks follow from the orders filled; orders grow with the garden
  {
    const r = await page.evaluate(() => {
      const a = MG.current.api;
      const shape = (f) => ({ done: f.done, beds: f.plots.length, crops: f.crops.join(','), seed: f.seed, order: f.order, basket: JSON.stringify(f.basket), empty: f.plots.every((p) => !p.crop) });
      const later = a.cleanFarm({ done: 6, seed: 'potato', basket: { tomato: 50, rock: 3, chilli: -2 },
        plots: [{ crop: 'pumpkin', stage: 2 }, { crop: 'tomato', stage: 9, water: 99, fed: 'cake', bug: '🦖', fruits: 7, picks: 5 }, { crop: 'carrot', stage: 4, fruits: 0, picks: 1 }, { crop: 'corn', stage: 2, bug: '🐛', fed: 'fish', t: 5 }, 'junk'],
        order: { who: '🐷', want: { tomato: 2, potato: 1 }, got: {} } });
      const orders = [];
      const f3 = a.cleanFarm({ done: 4 });
      for (let k = 0; k < 300; k++) orders.push(a.makeOrder(f3, Math.random, '🐻'));
      const f9 = a.cleanFarm({ done: 9 });
      const big = []; for (let k = 0; k < 300; k++) big.push(a.makeOrder(f9, Math.random, null));
      const f20 = a.cleanFarm({ done: 20 });
      const late = []; for (let k = 0; k < 300; k++) late.push(a.makeOrder(f20, Math.random, null).want);
      const stocked = a.cleanFarm({ done: 12, basket: { tomato: 3, chilli: 3, carrot: 3, corn: 3, strawberry: 3, eggplant: 3, pumpkin: 3, cucumber: 3, potato: 1 } });
      const fromStock = []; for (let k = 0; k < 300; k++) fromStock.push(a.makeOrder(stocked, Math.random, null).want);
      return {
        fresh: shape(a.cleanFarm(null)),
        bad: [a.cleanFarm('x'), a.cleanFarm({ done: 'abc', plots: 'no', basket: [1], order: 5 }), a.cleanFarm({ done: -4, seed: 'rock' })].map(shape),
        later: { crops: later.crops, beds: later.plots.length, helpers: later.helpers, plots: later.plots.slice(0, 5), basket: later.basket, seed: later.seed, order: later.order },
        keptOrder: a.cleanFarm({ done: 1, order: { who: '🐷', want: { carrot: 2 }, got: { carrot: 1 } } }).order,
        doneOrder: shape(a.cleanFarm({ done: 1, order: { who: '🐷', want: { carrot: 2 }, got: { carrot: 2 } } })),
        doneCrop: a.cleanFarm({ done: 3, order: { who: '🐷', want: { carrot: 1 }, got: { carrot: 1 } } }).seed,
        rain: [a.cleanFarm({ rainIn: 40 }).rainIn, a.cleanFarm({ rainIn: 900 }).rainIn, a.cleanFarm({}).rainIn, a.cleanFarm({ rainIn: null }).rainIn],
        first: a.makeOrder(a.cleanFarm(null), Math.random, null),
        orders3: orders.map((o) => ({ who: o.who, want: o.want })),
        orders9: big.map((o) => o.want),
        late, fromStock,
        all: a.unlocks(12), decor: a.unlocks(30).decor.length,
        prizes: [a.unlocks(23).prizes, a.unlocks(49).prizes],
        gifts: [a.giftFor(0), a.giftFor(1), a.giftFor(2), a.giftFor(22), a.giftFor(31), a.giftFor(200)],
        fruits: [a.fruitsFor({ crop: 'tomato', fed: 'bone', perfect: true }, {}), a.fruitsFor({ crop: 'tomato', fed: 'leaf', perfect: false }, {}), a.fruitsFor({ crop: 'tomato', fed: null, perfect: false }, { bees: true }), a.fruitsFor({ crop: 'chilli', fed: 'fish', perfect: false }, {})],
      };
    });
    assert.deepStrictEqual(r.fresh, { done: 0, beds: 4, crops: 'tomato,chilli', seed: 'tomato', order: null, basket: '{}', empty: true }, 'a new garden: four beds, tomato and chilli seeds');
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
    assert.strictEqual(r.later.seed, 'tomato', 'an unearned seed is not in hand');
    assert.strictEqual(r.later.order, null, 'an order for unearned vegetables is dropped');
    assert.deepStrictEqual(r.keptOrder, { who: '🐷', want: { carrot: 2 }, got: { carrot: 1 } }, 'a half-filled order is kept');
    assert.deepStrictEqual([r.doneOrder.done, r.doneOrder.order, r.doneOrder.beds], [2, null, 6], 'an order filled just before leaving still counts: its gift is kept');
    assert.strictEqual(r.doneCrop, 'corn', 'and a seed gift is in hand');
    assert.deepStrictEqual(r.rain, [40, 110, null, null], 'the rain countdown is kept, within reason');
    assert.deepStrictEqual(r.first, { who: '🐰', want: { tomato: 1, chilli: 1 }, got: {} }, 'the first visitor wants one tomato and one chilli');
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
    assert.ok(r.fromStock.every((w) => Object.keys(w).some((c) => w[c] > ({ tomato: 3, chilli: 3, carrot: 3, corn: 3, strawberry: 3, eggplant: 3, pumpkin: 3, cucumber: 3, potato: 1 })[c])), 'a visitor never wants only what is already in the basket');
    assert.strictEqual(r.all.crops.length, 9, 'twelve orders: all nine vegetables');
    assert.deepStrictEqual(r.all.helpers, { ladybird: true, bees: true, fountain: true });
    assert.strictEqual(r.decor, 10, 'then decorations for the garden');
    assert.deepStrictEqual(r.prizes[0], { tomato: 1 }, 'then prize medals, one vegetable after another');
    assert.ok(Object.keys(r.prizes[1]).length === 9 && Object.values(r.prizes[1]).every((n) => n === 3), 'three medals for each');
    assert.deepStrictEqual(r.gifts.map((g) => g.kind), ['crop', 'beds', 'helper', 'prize', 'prize', 'thanks']);
    assert.deepStrictEqual([r.gifts[3].id, r.gifts[4].id], ['tomato', 'tomato']);
    assert.deepStrictEqual(r.fruits, [3, 1, 2, 2], 'its favourite food and good care each add a fruit (bees count as care)');
  }

  // --- a whole round, with real taps: plant two, water, feed each from its sack, pick, hand over, a gift
  await openGarden(page);
  assert.strictEqual(await api(page, 'tool'), 'seed', 'seeds in hand to start');
  await page.waitForSelector('.mg-hint', { state: 'attached', timeout: 4000 });   // the ghost hand shows where to start
  assert.deepStrictEqual((await farm(page)).order.want, { tomato: 1, chilli: 1 });
  await tap(page, bed(0));
  let f = await farm(page);
  assert.strictEqual(f.plots[0].crop, 'tomato', 'a tap plants the seed in hand');
  assert.strictEqual(f.seed, 'chilli', 'then the seed the visitor still needs is put in hand');
  assert.strictEqual(await page.locator(bed(0) + ' .gd-need').textContent(), '💧', 'a dry seed asks for water');
  assert.strictEqual(await page.locator(bed(0) + ' .gd-marker .gd-packet__veg').textContent(), '🍅', 'a seed packet on a stick shows what was sown');
  await tap(page, bed(0));
  assert.strictEqual((await farm(page)).plots[0].crop, 'tomato', 'a second seed does not go on top');
  await tap(page, tool('seed'));
  assert.ok(await api(page, 'shelfOpen'), 'one tap on the seeds: the seed shelf');
  assert.strictEqual(await page.locator('.g-garden .gd-packet--pick').count(), 2);
  await tap(page, '.g-garden .gd-packet--pick[data-crop="chilli"]');
  assert.ok(!(await api(page, 'shelfOpen')));
  await tap(page, bed(1));
  assert.strictEqual((await farm(page)).plots[1].crop, 'chilli');
  await tap(page, tool('water'));
  for (let k = 0; k < 8; k++) await tap(page, bed(0));            // mashing the water
  await tap(page, bed(1));
  f = await farm(page);
  assert.deepStrictEqual([f.plots[0].water, f.plots[1].water], [3, 2], 'water fills a bed, never past full');
  // grow, keeping them watered, until they ask for food
  for (let k = 0; k < 12 && !(await farm(page)).plots.slice(0, 2).every((p) => p.stage === 2 && p.t >= 0.5); k++) { await grow(page, 3); await waterAll(page, [0, 1]); }
  f = await farm(page);
  assert.ok(f.plots[0].stage === 2 && f.plots[1].stage === 2, 'leafy now');
  assert.strictEqual(await page.locator(bed(0) + ' .gd-need').textContent(), '🦴', 'the tomato asks for its favourite: bone meal');
  assert.strictEqual(await page.locator(bed(1) + ' .gd-need').textContent(), '🐟', 'the chilli: fish');
  assert.deepStrictEqual(await page.$$eval('.g-garden .gd-tool.is-asked', (ns) => ns.map((n) => n.dataset.tool).sort()), ['bone', 'fish'], 'the sacks being asked for light up');
  const waiting = (await farm(page)).plots[0].t;
  await grow(page, 6);
  assert.strictEqual((await farm(page)).plots[0].t, waiting, 'a hungry plant waits');
  await tap(page, tool('leaf'));                                    // nobody wants compost
  f = await farm(page);
  assert.deepStrictEqual([f.plots[0].fed, f.plots[1].fed], [null, null], 'a sack nobody asked for: they shake their heads, nothing is used up');
  await tap(page, tool('bone'));
  f = await farm(page);
  assert.deepStrictEqual([f.plots[0].fed, f.plots[1].fed], ['bone', null], 'one tap on the bone meal: it flies to the plant that wants it');
  assert.strictEqual(await api(page, 'tool'), 'water', 'and the tool in hand is left as it was');
  await tap(page, tool('fish'));
  await tap(page, tool('fish'));                                    // again: nobody is hungry now
  f = await farm(page);
  assert.deepStrictEqual([f.plots[0].fed, f.plots[1].fed], ['bone', 'fish'], 'fed once each');
  for (let k = 0; k < 20 && !(await farm(page)).plots.slice(0, 2).every((p) => p.stage === 4); k++) { await waterAll(page, [0, 1]); await grow(page, 3); }
  f = await farm(page);
  assert.deepStrictEqual(f.plots.slice(0, 2).map((p) => [p.stage, p.fruits]), [[4, 3], [4, 3]], 'ripe, three each (favourite food and never dry)');
  assert.strictEqual(await page.locator(bed(0) + ' .gd-fruits .mg-sticker').count(), 3, 'the fruits show on the plant');
  await tap(page, bed(0));
  await tap(page, bed(0));                                          // a second tap: nothing more to pick
  await tap(page, tool('spray'));
  await tap(page, bed(1));                                          // any tool picks a ripe plant
  f = await farm(page);
  assert.deepStrictEqual(f.basket, { tomato: 3, chilli: 3 }, 'all into the basket, once');
  assert.deepStrictEqual(f.plots.slice(0, 2).map((p) => [p.crop, p.stage, p.fed, p.picks]), [['tomato', 2, null, 1], ['chilli', 2, null, 1]], 'tomatoes and chillies grow a second crop (and will be hungry again)');
  // hand them over: mashing the gate never hands over more than wanted; the wish list ticks off one by one
  await page.evaluate(() => {
    window.__got = [];
    const w = document.querySelector('.g-garden .gd-wish');
    new MutationObserver(() => window.__got.push(w.querySelectorAll('.is-got').length)).observe(w, { childList: true });
  });
  for (let k = 0; k < 6; k++) await tap(page, k % 2 ? '.g-garden .gd-visitor' : '.g-garden .gd-basket');
  await page.waitForFunction(() => MG.current.api.state === 'gift', null, { timeout: 8000 });
  const seq = await page.evaluate(() => window.__got);
  assert.ok(seq.includes(1) && seq.indexOf(1) < seq.lastIndexOf(2), 'the wish list ticks off one vegetable at a time: ' + seq.join(','));
  f = await farm(page);
  assert.deepStrictEqual(f.basket, { tomato: 2, chilli: 2 }, 'exactly one of each handed over; the rest stays in the basket');
  assert.strictEqual(f.done, 1);
  assert.ok(f.crops.includes('carrot') && f.seed === 'carrot', 'the gift: carrot seeds, in hand for next time');
  const frozen = JSON.stringify((await farm(page)).plots);
  await grow(page, 30);
  assert.strictEqual(JSON.stringify((await farm(page)).plots), frozen, 'behind the party the garden rests: nothing dries or gets bugs');
  await page.waitForSelector('.g-garden .gd-gift.is-open', { timeout: 4000 });
  await page.waitForTimeout(700);
  assert.deepStrictEqual(await escapes(page, '.g-garden .gd-packet--big .gd-packet__veg', '.gd-packet--big', 2), [], 'the gift packet holds its vegetable');
  await t.waitForWin(page, 10000);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('mg:game:garden:farm')));
  assert.strictEqual(saved.done, 1, 'saved');
  assert.ok(saved.rainIn >= 0 && saved.rainIn <= 110, 'with the rain countdown');
  // the next visitor wants the new carrots; the beds are as they were left
  await page.evaluate(() => { MG.home(); MG.open('garden'); });
  await ready(page);
  f = await farm(page);
  assert.ok(f.order.want.carrot >= 1, 'carrots wanted');
  assert.deepStrictEqual(f.plots.slice(0, 2).map((p) => p.crop), ['tomato', 'chilli'], 'the garden was kept');
  assert.deepStrictEqual(f.basket, { tomato: 2, chilli: 2 });

  // --- never stuck: a regrowing plant fruits twice, then its bed is free; the needed seed comes to hand by itself
  await openGarden(page);
  for (let i = 0; i < 4; i++) await tap(page, bed(i));
  f = await farm(page);
  assert.ok(f.plots.some((p) => p.crop === 'tomato') && f.plots.some((p) => p.crop === 'chilli'), 'tapping every bed sows both the tomato and the chilli the visitor wants: ' + f.plots.map((p) => p.crop));
  await setFarm(page, { done: 0, seed: 'tomato', plots: [0, 1, 2, 3].map(() => P('tomato', 4, { fruits: 1 })) });
  for (let i = 0; i < 4; i++) await tap(page, bed(i));
  f = await farm(page);
  assert.ok(f.plots.every((p) => p.crop === 'tomato' && p.stage === 2 && p.picks === 1), 'four tomatoes picked once: they grow again');
  await setFarm(page, Object.assign(f, { plots: f.plots.map((p) => Object.assign(p, { stage: 4, fruits: 1 })) }));
  await tap(page, bed(0));
  f = await farm(page);
  assert.deepStrictEqual([f.plots[0].crop, f.plots[0].water], [null, 2], 'picked a second time: the bed is free (and still damp)');
  assert.strictEqual(f.seed, 'chilli', 'and the chilli the visitor wants is in hand');
  await tap(page, bed(0));
  assert.strictEqual((await farm(page)).plots[0].crop, 'chilli');
  // a seed chosen on the shelf is respected until it is planted
  await openGarden(page);
  await tap(page, tool('seed'));
  await tap(page, '.g-garden .gd-packet--pick[data-crop="chilli"]');
  await tap(page, bed(0));
  f = await farm(page);
  assert.deepStrictEqual([f.plots[0].crop, f.seed], ['chilli', 'tomato'], 'the chosen chilli goes in; then the tomato is in hand');

  // --- following only the ghost hand, from a brand-new garden, fills the first order
  await openGarden(page);
  let steps = 0;
  for (; steps < 260 && (await api(page, 'state')) === 'play'; steps++) {
    const did = await page.evaluate((id) => {
      const a = MG.current.api;
      if (a.delivering) return 'wait';
      a.hintNext();
      const n = a.hinted;
      if (!n) { a.grow(1); return 'grow'; }
      const r = n.getBoundingClientRect();
      const o = { bubbles: true, cancelable: true, pointerId: id, pointerType: 'touch', clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
      n.dispatchEvent(new PointerEvent('pointerdown', o));
      n.dispatchEvent(new PointerEvent('pointerup', o));
      a.grow(0.4);
      return 'tap';
    }, ++pid);
    await page.waitForTimeout(did === 'wait' ? 200 : 20);
  }
  assert.ok(['gift', 'over'].includes(await api(page, 'state')) || (await farm(page)).done === 1, `the ghost hand alone leads to a filled order (${steps} steps)`);
  await page.waitForTimeout(3500);

  // --- never punished: a dry plant, a bug, the wrong sack — all only wait or give a little less
  await openGarden(page);
  await setFarm(page, { done: 0, rainIn: 110, plots: [P('tomato', 1, { water: 0, t: 0.3 }), P('chilli', 1, { t: 0.3, bug: '🐛' }), P('chilli', 2, { t: 0.6 }), null] });
  const tune = await api(page, 'tuning');
  await grow(page, tune.GRACE_S - 1);
  f = await farm(page);
  assert.deepStrictEqual([f.plots[0].perfect, f.plots[1].perfect], [true, true], 'a short wait for water or the spray costs nothing');
  await grow(page, 40);
  f = await farm(page);
  assert.deepStrictEqual([f.plots[0].crop, f.plots[0].stage, f.plots[0].t], ['tomato', 1, 0.3], 'a dry plant waits, it never dies');
  assert.ok(await page.locator(bed(0) + '.is-dry').count(), 'and droops');
  assert.deepStrictEqual([f.plots[1].stage, f.plots[1].t, f.plots[1].bug], [1, 0.3, '🐛'], 'a bugged plant waits');
  assert.deepStrictEqual([f.plots[0].perfect, f.plots[1].perfect], [false, false], 'a long wait: one fruit fewer, that is all');
  await tap(page, tool('spray'));
  await tap(page, bed(1));
  assert.strictEqual((await farm(page)).plots[1].bug, null, 'spray: the bug runs off');
  const shown = await page.evaluate((id) => {                       // the chilli wants fish: a tap on the bone meal
    const n = document.querySelector('.g-garden .gd-tool[data-tool="bone"]'), r = n.getBoundingClientRect();
    const o = { bubbles: true, cancelable: true, pointerId: id, pointerType: 'touch', clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
    n.dispatchEvent(new PointerEvent('pointerdown', o));
    n.dispatchEvent(new PointerEvent('pointerup', o));
    const h = MG.current.api.hinted;
    return h && h.dataset.tool;
  }, ++pid);
  f = await farm(page);
  assert.strictEqual(f.plots[2].fed, null, 'the wrong sack: the chilli shakes its head');
  if (tune.help) assert.strictEqual(shown, 'fish', 'and the hand shows the fish');
  await tap(page, tool('water'));
  await tap(page, bed(3));
  assert.strictEqual((await farm(page)).plots[3].water, 2, 'empty soil can be watered, ready for seeds');
  await page.evaluate(() => MG.current.api.rain());
  assert.ok((await farm(page)).plots.every((p) => p.water === 3), 'rain waters every bed');

  // --- helpers: the ladybird eats bugs; bugs come by themselves (and not at all when switched off); an early bug shows the spray
  await setFarm(page, { done: 3, plots: [P('tomato', 1), P('chilli', 2, { t: 0.1 }), null, null, null, null] });
  await page.evaluate(() => MG.current.api.bug(0));
  await grow(page, 10);
  assert.strictEqual((await farm(page)).plots[0].bug, null, 'the ladybird ate it');
  await setFarm(page, { done: 0, plots: [P('tomato', 1), P('chilli', 1), P('tomato', 2, { fed: 'bone' }), P('chilli', 1)] });
  for (let k = 0; k < 8; k++) { await grow(page, 5); await page.evaluate(() => MG.current.api.rain()); }
  assert.ok((await farm(page)).plots.every((p) => !p.bug), 'no bugs when bugs are off');
  await openGarden(page, { bugs: 'some' });
  await setFarm(page, { done: 0, plots: [P('tomato', 1, { t: 0.38 }), null, null, null] });
  await grow(page, 0.4);
  assert.ok((await farm(page)).plots[0].bug, 'the first rounds: an early bug, to show what the spray is for');
  await openGarden(page, { bugs: 'lots' });
  await setFarm(page, { done: 2, plots: [P('tomato', 1), P('chilli', 1), P('tomato', 1), P('chilli', 1)] });
  let most = 0;
  for (let k = 0; k < 30; k++) {
    await page.evaluate(() => { const a = MG.current.api; a.grow(5); a.setFarm(Object.assign(a.farm, { plots: a.farm.plots.map((p) => Object.assign(p, { stage: 1, t: 0, water: 3 })) })); });
    most = Math.max(most, (await farm(page)).plots.filter((p) => p.bug).length);
  }
  assert.ok(most >= 1 && most <= 2, `bugs come, two at most at once (${most})`);

  // --- every size, both ways round, with four beds, nine, and a full garden: all in view, big, nothing on top of anything
  const ALL = ['tomato', 'chilli', 'carrot', 'corn', 'strawberry', 'eggplant', 'pumpkin', 'cucumber', 'potato'];
  for (const vp of ['small', 'phone', 'phoneWide', 'tabletTall', 'tablet']) {
    const p = await t.open(ID, { viewport: vp, dark: vp === 'phoneWide' || vp === 'tablet', reducedMotion: vp === 'tabletTall' });
    await ready(p);
    for (const done of [0, 6, 23]) {
      const basket = done > 12 ? Object.fromEntries(ALL.map((c) => [c, 3])) : { tomato: 3, chilli: 2 };
      await setFarm(p, { done, plots: Array.from({ length: 9 }, (_, i) => (i % 3 === 0 ? P(done > 12 ? 'carrot' : 'tomato', 4, { fruits: 3, fed: 'bone' }) : i % 3 === 1 ? P('chilli', 2, { t: 0.6, water: 0 }) : P('tomato', 2, { t: 0.7 }))), basket });
      await p.waitForTimeout(400);
      const label = `@${vp} (${done ? 9 : 4} beds${done > 12 ? ', full garden' : ''})`;
      const sel = '.g-garden .gd-plot, .g-garden .gd-tool, .g-garden .gd-visitor, .g-garden .gd-basket';
      assert.deepStrictEqual(await t.outsidePlayArea(p, sel), [], `in view ${label}`);
      const min = (await t.minTargetSize(p, sel)).min;
      assert.ok(min >= 64, `big enough ${label}: ${min}px`);
      assert.ok(await t.noPageScroll(p), `no page scroll ${label}`);
      const clash = await p.evaluate(() => {
        const items = [...document.querySelectorAll('.g-garden .gd-plot, .g-garden .gd-tool, .g-garden .gd-visitor, .g-garden .gd-basket, .g-garden .gd-strip:not([hidden]) > *')]
          .map((n) => [n.className, n.getBoundingClientRect()]).filter(([, r]) => r.width > 0);
        const out = [];
        items.forEach(([a, r], i) => items.slice(i + 1).forEach(([b, s]) => { if (r.left < s.right - 1 && s.left < r.right - 1 && r.top < s.bottom - 1 && s.top < r.bottom - 1) out.push(a + ' x ' + b); }));
        return out;
      });
      assert.deepStrictEqual(clash, [], `nothing overlaps (helpers and decorations included) ${label}`);
      assert.deepStrictEqual(await escapes(p, '.g-garden .gd-need', '.gd-plot', 1), [], `need bubbles stay inside their beds ${label}`);
      assert.deepStrictEqual(await escapes(p, '.g-garden .gd-pile', '.gd-basket', 0), [], `every pile shows inside the basket ${label}`);
      if (done > 12) {
        const strip = await p.evaluate(() => {
          const s = document.querySelector('.g-garden .gd-garden').dataset.strip;
          const items = [...document.querySelectorAll('.g-garden .gd-strip > *')].map((n) => n.getBoundingClientRect());
          return { s, n: items.length, min: Math.min(...items.map((r) => Math.min(r.width, r.height))) };
        });
        assert.ok(strip.s !== 'none' && strip.n === 13 && strip.min >= 14, `helpers and decorations all show, in a strip of their own ${label}: ${JSON.stringify(strip)}`);
        assert.deepStrictEqual(await t.outsidePlayArea(p, '.g-garden .gd-strip > *'), [], `the strip is in view ${label}`);
      }
    }
    // the seed shelf: in view, big packets, the tools still visible, medals on the packets that won them
    await tap(p, tool('water')); await tap(p, tool('seed'));
    assert.ok(await api(p, 'shelfOpen'));
    await p.waitForTimeout(300);                                    // (it pops in)
    assert.deepStrictEqual(await t.outsidePlayArea(p, '.g-garden .gd-packet--pick'), [], `seed shelf in view @${vp}`);
    assert.ok((await t.minTargetSize(p, '.g-garden .gd-packet--pick')).min >= 64, `big packets @${vp}`);
    assert.strictEqual(await p.locator('.g-garden .gd-packet--pick[data-crop="tomato"] .gd-packet__medals .mg-sticker').count(), 1, 'the tomato has won a medal');
    const covered = await p.evaluate(() => {
      const s = document.querySelector('.g-garden .gd-shelf').getBoundingClientRect();
      return [...document.querySelectorAll('.g-garden .gd-tool')].filter((n) => { const r = n.getBoundingClientRect(); return r.left < s.right && s.left < r.right && r.top < s.bottom && s.top < r.bottom; }).length;
    });
    assert.strictEqual(covered, 0, `the shelf leaves the tools uncovered @${vp}`);
    await t.shot(p, `${ID}-shelf-${vp}.png`);
    await tap(p, '.g-garden .gd-packet--pick[data-crop="corn"]');
    assert.strictEqual((await farm(p)).seed, 'corn');
    await t.shot(p, `${ID}-${vp}.png`);
  }

  // --- turn the phone mid-round; leave and come back: the garden is just as it was
  page = await t.open(ID, { viewport: 'phone' });
  await openGarden(page);
  await tap(page, bed(2));
  await page.setViewportSize(h.VIEWPORTS.phoneWide);
  await page.waitForTimeout(500);
  assert.deepStrictEqual(await t.outsidePlayArea(page, '.g-garden .gd-plot, .g-garden .gd-tool, .g-garden .gd-visitor'), [], 'in view after turning');
  await waterAll(page, [2]);
  assert.strictEqual((await farm(page)).plots[2].water, 2, 'still plays after turning');
  await page.evaluate(() => { MG.home(); });
  await page.evaluate(() => { MG.open('garden'); });
  await ready(page);
  f = await farm(page);
  assert.deepStrictEqual([f.plots[2].crop, f.plots[2].water], ['tomato', 2], 'kept after leaving');
  for (const bad of ['"nonsense"', '{"done":"x","plots":[null,5]}', '[1,2,3]']) {
    await page.evaluate((v) => { localStorage.setItem('mg:game:garden:farm', v); MG.home(); MG.open('garden'); }, bad);
    await ready(page);
    assert.strictEqual(await page.locator('.g-garden .gd-plot').count(), 4, `a damaged save starts a new garden (${bad})`);
  }

  // --- quick growing is quicker; the first rounds are quicker still
  await openGarden(page, { speed: 'quick' });
  const tq = await api(page, 'tuning');
  assert.ok(tq.SPEED < 1);
  assert.ok(tq.STAGE_S_EARLY.every((s, i) => s <= tq.STAGE_S[i]) && tq.STAGE_S_EARLY[0] + tq.STAGE_S_EARLY[1] <= 8, 'a first seed sprouts and grows leaves within about eight seconds');
});
