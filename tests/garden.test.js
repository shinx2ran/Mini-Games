/* Happy Garden: plant, water, feed, spray, pick, hand over; gifts unlock more; the garden is kept. */
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
    if (!o.keep) localStorage.removeItem('mg:game:garden:farm');
    MG.store.set('opt:garden:bugs', o.bugs || 'none');
    MG.store.set('opt:garden:speed', o.speed || 'normal');
    MG.home(); MG.open('garden');
  }, opts);
  await ready(page);
}
const P = (crop, stage, o = {}) => Object.assign({ crop, stage, t: 0, water: 3, fed: null, bug: null, fruits: 0, perfect: true }, o);
const setFarm = (page, f) => page.evaluate((f) => MG.current.api.setFarm(f), f);
const grow = (page, s) => page.evaluate((s) => MG.current.api.grow(s), s);
async function waterAll(page, beds) { await tap(page, tool('water')); for (const i of beds) await tap(page, bed(i)); }

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
        plots: [{ crop: 'pumpkin', stage: 2 }, { crop: 'tomato', stage: 9, water: 99, fed: 'cake', bug: '🦖', fruits: 7 }, { crop: 'carrot', stage: 4, fruits: 0 }, { crop: 'corn', stage: 2, bug: '🐛', fed: 'fish', t: 5 }, 'junk'],
        order: { who: '🐷', want: { tomato: 2, potato: 1 }, got: {} } });
      const orders = [];
      const f3 = a.cleanFarm({ done: 4 });
      for (let k = 0; k < 300; k++) orders.push(a.makeOrder(f3, Math.random, '🐻'));
      const f9 = a.cleanFarm({ done: 9 });
      const big = []; for (let k = 0; k < 300; k++) big.push(a.makeOrder(f9, Math.random, null));
      return {
        fresh: shape(a.cleanFarm(null)),
        bad: [a.cleanFarm('x'), a.cleanFarm({ done: 'abc', plots: 'no', basket: [1], order: 5 }), a.cleanFarm({ done: -4, seed: 'rock' })].map(shape),
        later: { crops: later.crops, beds: later.plots.length, helpers: later.helpers, plots: later.plots.slice(0, 5), basket: later.basket, seed: later.seed, order: later.order },
        keptOrder: a.cleanFarm({ done: 1, order: { who: '🐷', want: { carrot: 2 }, got: { carrot: 1 } } }).order,
        doneOrder: a.cleanFarm({ done: 1, order: { who: '🐷', want: { carrot: 2 }, got: { carrot: 2 } } }).order,
        first: a.makeOrder(a.cleanFarm(null), Math.random, null),
        orders3: orders.map((o) => ({ who: o.who, want: o.want })),
        orders9: big.map((o) => o.want),
        all: a.unlocks(12), decor: a.unlocks(30).decor.length,
        gifts: [a.giftFor(0), a.giftFor(1), a.giftFor(2), a.giftFor(200)],
        fruits: [a.fruitsFor({ crop: 'tomato', fed: 'bone', perfect: true }, {}), a.fruitsFor({ crop: 'tomato', fed: 'leaf', perfect: false }, {}), a.fruitsFor({ crop: 'tomato', fed: null, perfect: false }, { bees: true }), a.fruitsFor({ crop: 'chilli', fed: 'fish', perfect: false }, {})],
      };
    });
    assert.deepStrictEqual(r.fresh, { done: 0, beds: 4, crops: 'tomato,chilli', seed: 'tomato', order: null, basket: '{}', empty: true }, 'a new garden: four beds, tomato and chilli seeds');
    r.bad.forEach((b) => assert.deepStrictEqual(b, r.fresh, 'nonsense becomes a new garden'));
    assert.deepStrictEqual(r.later.crops, ['tomato', 'chilli', 'carrot', 'corn', 'strawberry'], 'six orders filled: five kinds of seed');
    assert.strictEqual(r.later.beds, 9, 'and nine beds');
    assert.deepStrictEqual(r.later.helpers, { ladybird: true }, 'and the ladybird');
    assert.strictEqual(r.later.plots[0].crop, null, 'a vegetable not yet earned is dug up');
    assert.deepStrictEqual([r.later.plots[1].stage, r.later.plots[1].water, r.later.plots[1].fed, r.later.plots[1].bug, r.later.plots[1].fruits], [4, 3, null, null, 3], 'everything kept in range');
    assert.strictEqual(r.later.plots[2].fruits, 1, 'a ripe plant always has something to pick');
    assert.deepStrictEqual([r.later.plots[3].bug, r.later.plots[3].fed, r.later.plots[3].t], ['🐛', 'fish', 1]);
    assert.strictEqual(r.later.plots[4].crop, null);
    assert.deepStrictEqual(r.later.basket, { tomato: 9 }, 'the basket holds up to nine of a kind');
    assert.strictEqual(r.later.seed, 'tomato', 'an unearned seed is not in hand');
    assert.strictEqual(r.later.order, null, 'an order for unearned vegetables is dropped');
    assert.deepStrictEqual(r.keptOrder, { who: '🐷', want: { carrot: 2 }, got: { carrot: 1 } }, 'a half-filled order is kept');
    assert.strictEqual(r.doneOrder, null, 'a finished order makes way for a new visitor');
    assert.deepStrictEqual(r.first, { who: '🐰', want: { tomato: 1, chilli: 1 }, got: {} }, 'the first visitor wants one tomato and one chilli');
    for (const o of r.orders3) {
      const kinds = Object.keys(o.want), total = kinds.reduce((s, k) => s + o.want[k], 0);
      assert.ok(o.who !== '🐻', 'never the same visitor twice in a row');
      assert.ok(kinds.includes('corn'), 'the newest seeds are always wanted');
      assert.ok(kinds.length === 2 && total === 4 && kinds.every((k) => o.want[k] >= 1 && o.want[k] <= 3), 'two kinds, four things, three at most of one: ' + JSON.stringify(o.want));
      assert.ok(kinds.every((k) => ['tomato', 'chilli', 'carrot', 'corn'].includes(k)));
    }
    for (const w of r.orders9) {
      const kinds = Object.keys(w), total = kinds.reduce((s, k) => s + w[k], 0);
      assert.ok(kinds.length === 3 && total === 5 && kinds.every((k) => w[k] <= 3), 'later: three kinds, five things');
    }
    assert.strictEqual(r.all.crops.length, 9, 'twelve orders: all nine vegetables');
    assert.deepStrictEqual(r.all.helpers, { ladybird: true, bees: true, fountain: true });
    assert.strictEqual(r.decor, 10, 'then decorations for the garden');
    assert.deepStrictEqual(r.gifts.map((g) => g.kind), ['crop', 'beds', 'helper', 'thanks']);
    assert.deepStrictEqual(r.fruits, [3, 1, 2, 2], 'its favourite food and perfect care each add a fruit (bees count as care)');
  }

  // --- a whole round, with real taps: plant two, water, feed each its favourite, pick, hand over, a gift
  await openGarden(page);
  assert.strictEqual(await api(page, 'tool'), 'seed', 'seeds in hand to start');
  await page.waitForSelector('.mg-hint', { state: 'attached', timeout: 4000 });   // the ghost hand shows where to start
  assert.deepStrictEqual((await farm(page)).order.want, { tomato: 1, chilli: 1 });
  await tap(page, bed(0));
  assert.strictEqual((await farm(page)).plots[0].crop, 'tomato', 'a tap plants the seed in hand');
  assert.strictEqual(await page.locator(bed(0) + ' .gd-need').textContent(), '💧', 'a dry seed asks for water');
  await tap(page, bed(0));
  assert.strictEqual((await farm(page)).plots[0].crop, 'tomato', 'a second seed does not go on top');
  await tap(page, tool('seed'));
  assert.ok(await api(page, 'shelfOpen'), 'seeds again: the seed shelf');
  assert.strictEqual(await page.locator('.g-garden .gd-packet--pick').count(), 2);
  await tap(page, '.g-garden .gd-packet--pick[data-crop="chilli"]');
  assert.ok(!(await api(page, 'shelfOpen')));
  await tap(page, bed(1));
  assert.strictEqual((await farm(page)).plots[1].crop, 'chilli');
  await tap(page, tool('water'));
  for (let k = 0; k < 8; k++) await tap(page, bed(0));            // mashing the water
  await tap(page, bed(1));
  let f = await farm(page);
  assert.deepStrictEqual([f.plots[0].water, f.plots[1].water], [3, 2], 'water fills a bed, never past full');
  // grow, keeping them watered, until they ask for food
  for (let k = 0; k < 12 && !(await farm(page)).plots.slice(0, 2).every((p) => p.stage === 2 && p.t >= 0.5); k++) { await grow(page, 3); await waterAll(page, [0, 1]); }
  f = await farm(page);
  assert.ok(f.plots[0].stage === 2 && f.plots[1].stage === 2, 'leafy now');
  assert.strictEqual(await page.locator(bed(0) + ' .gd-need').textContent(), '🦴', 'the tomato asks for its favourite: bone meal');
  assert.strictEqual(await page.locator(bed(1) + ' .gd-need').textContent(), '🐟', 'the chilli: fish');
  const waiting = (await farm(page)).plots[0].t;
  await grow(page, 6);
  assert.strictEqual((await farm(page)).plots[0].t, waiting, 'a hungry plant waits');
  await tap(page, tool('bone')); await tap(page, bed(0));
  await tap(page, tool('fish')); await tap(page, bed(1));
  await tap(page, bed(0));                                          // fish on the tomato: already fed
  f = await farm(page);
  assert.deepStrictEqual([f.plots[0].fed, f.plots[1].fed], ['bone', 'fish'], 'fed once each, with the tool in hand');
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
  assert.deepStrictEqual(f.plots.slice(0, 2).map((p) => [p.crop, p.stage, p.fed]), [['tomato', 2, null], ['chilli', 2, null]], 'tomatoes and chillies grow again (and will be hungry again)');
  // hand them over: mashing the visitor never hands over more than wanted
  for (let k = 0; k < 6; k++) await tap(page, '.g-garden .gd-visitor');
  await page.waitForFunction(() => MG.current.api.state === 'gift', null, { timeout: 8000 });
  f = await farm(page);
  assert.deepStrictEqual(f.basket, { tomato: 2, chilli: 2 }, 'exactly one of each handed over; the rest stays in the basket');
  assert.strictEqual(f.done, 1);
  assert.ok(f.crops.includes('carrot') && f.seed === 'carrot', 'the gift: carrot seeds, in hand for next time');
  await t.waitForWin(page, 10000);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('mg:game:garden:farm')));
  assert.strictEqual(saved.done, 1, 'saved');
  // the next visitor wants the new carrots; the beds are as they were left
  await page.evaluate(() => { MG.home(); MG.open('garden'); });
  await ready(page);
  f = await farm(page);
  assert.ok(f.order.want.carrot >= 1, 'carrots wanted');
  assert.deepStrictEqual(f.plots.slice(0, 2).map((p) => p.crop), ['tomato', 'chilli'], 'the garden was kept');
  assert.deepStrictEqual(f.basket, { tomato: 2, chilli: 2 });

  // --- never punished: a dry plant, a bug, the wrong food — all only wait or give a little less
  await openGarden(page);
  await setFarm(page, { done: 0, plots: [P('tomato', 1, { water: 0, t: 0.3 }), P('chilli', 1, { t: 0.3, bug: '🐛' }), P('chilli', 2, { t: 0.4 }), null] });
  await grow(page, 40);
  f = await farm(page);
  assert.deepStrictEqual([f.plots[0].crop, f.plots[0].stage, f.plots[0].t], ['tomato', 1, 0.3], 'a dry plant waits, it never dies');
  assert.ok(await page.locator(bed(0) + '.is-dry').count(), 'and droops');
  assert.deepStrictEqual([f.plots[1].stage, f.plots[1].t, f.plots[1].bug], [1, 0.3, '🐛'], 'a bugged plant waits');
  await tap(page, tool('spray'));
  await tap(page, bed(1));
  assert.strictEqual((await farm(page)).plots[1].bug, null, 'spray: the bug runs off');
  await setFarm(page, { done: 0, plots: [null, null, P('chilli', 2, { t: 0.4 }), null] });
  await tap(page, tool('bone'));
  await tap(page, bed(2));                                          // a chilli likes fish; bone meal will do
  for (let k = 0; k < 20 && (await farm(page)).plots[2].stage < 4; k++) { await waterAll(page, [2]); await grow(page, 3); }
  f = await farm(page);
  assert.deepStrictEqual([f.plots[2].stage, f.plots[2].fruits], [4, 2], 'the wrong food still grows a harvest, one fruit fewer');
  await tap(page, tool('water'));
  await tap(page, bed(3));
  assert.strictEqual((await farm(page)).plots[3].water, 2, 'empty soil can be watered, ready for seeds');
  await tap(page, tool('fish'));
  await tap(page, bed(3));
  assert.strictEqual((await farm(page)).plots[3].fed, null, 'food on empty soil does nothing');
  await page.evaluate(() => MG.current.api.rain());
  assert.ok((await farm(page)).plots.every((p) => p.water === 3), 'rain waters every bed');

  // --- helpers: the ladybird eats bugs; bugs come by themselves (and not at all when switched off)
  await setFarm(page, { done: 3, plots: [P('tomato', 1), P('chilli', 2, { t: 0.1 }), null, null, null, null] });
  await page.evaluate(() => MG.current.api.bug(0));
  await grow(page, 10);
  assert.strictEqual((await farm(page)).plots[0].bug, null, 'the ladybird ate it');
  await setFarm(page, { done: 0, plots: [P('tomato', 1), P('chilli', 1), P('tomato', 2, { fed: 'bone' }), P('chilli', 1)] });
  for (let k = 0; k < 8; k++) { await grow(page, 5); await page.evaluate(() => MG.current.api.rain()); }
  assert.ok((await farm(page)).plots.every((p) => !p.bug), 'no bugs when bugs are off');
  await openGarden(page, { bugs: 'lots' });
  await setFarm(page, { done: 0, plots: [P('tomato', 1), P('chilli', 1), P('tomato', 1), P('chilli', 1)] });
  let most = 0;
  for (let k = 0; k < 30; k++) {
    await page.evaluate(() => { const a = MG.current.api; a.grow(5); a.setFarm(Object.assign(a.farm, { plots: a.farm.plots.map((p) => Object.assign(p, { stage: 1, t: 0, water: 3 })) })); });
    most = Math.max(most, (await farm(page)).plots.filter((p) => p.bug).length);
  }
  assert.ok(most >= 1 && most <= 2, `bugs come, two at most at once (${most})`);

  // --- every size, both ways round, with four beds and with nine: all in view, big, nothing on top of anything
  for (const vp of ['small', 'phone', 'phoneWide', 'tabletTall', 'tablet']) {
    const p = await t.open(ID, { viewport: vp, dark: vp === 'phoneWide' || vp === 'tablet', reducedMotion: vp === 'tabletTall' });
    await ready(p);
    for (const done of [0, 6]) {
      await setFarm(p, { done, plots: Array.from({ length: 9 }, (_, i) => (i % 3 === 0 ? P('tomato', 4, { fruits: 3, fed: 'bone' }) : i % 3 === 1 ? P('chilli', 2, { t: 0.6, water: 0 }) : null)), basket: { tomato: 5, chilli: 2 } });
      await p.waitForTimeout(400);
      const sel = '.g-garden .gd-plot, .g-garden .gd-tool, .g-garden .gd-visitor, .g-garden .gd-basket';
      assert.deepStrictEqual(await t.outsidePlayArea(p, sel), [], `in view @${vp} (${done ? 9 : 4} beds)`);
      const min = (await t.minTargetSize(p, sel)).min;
      assert.ok(min >= 64, `big enough @${vp}: ${min}px`);
      assert.ok(await t.noPageScroll(p), `no page scroll @${vp}`);
      const clash = await p.evaluate(() => {
        const items = [...document.querySelectorAll('.g-garden .gd-plot, .g-garden .gd-tool, .g-garden .gd-visitor, .g-garden .gd-basket')].map((n) => [n.className, n.getBoundingClientRect()]);
        const out = [];
        items.forEach(([a, r], i) => items.slice(i + 1).forEach(([b, s]) => { if (r.left < s.right - 1 && s.left < r.right - 1 && r.top < s.bottom - 1 && s.top < r.bottom - 1) out.push(a + ' x ' + b); }));
        return out;
      });
      assert.deepStrictEqual(clash, [], `nothing overlaps @${vp}`);
    }
    // the seed shelf: in view, big packets, the tools still visible
    await tap(p, tool('water')); await tap(p, tool('seed')); await tap(p, tool('seed'));
    assert.ok(await api(p, 'shelfOpen'));
    await p.waitForTimeout(300);                                    // (it pops in)
    assert.deepStrictEqual(await t.outsidePlayArea(p, '.g-garden .gd-packet--pick'), [], `seed shelf in view @${vp}`);
    assert.ok((await t.minTargetSize(p, '.g-garden .gd-packet--pick')).min >= 64, `big packets @${vp}`);
    const covered = await p.evaluate(() => {
      const s = document.querySelector('.g-garden .gd-shelf').getBoundingClientRect();
      return [...document.querySelectorAll('.g-garden .gd-tool')].filter((n) => { const r = n.getBoundingClientRect(); return r.left < s.right && s.left < r.right && r.top < s.bottom && s.top < r.bottom; }).length;
    });
    assert.strictEqual(covered, 0, `the shelf leaves the tools uncovered @${vp}`);
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

  // --- quick growing is quicker
  await openGarden(page, { speed: 'quick' });
  assert.ok((await api(page, 'tuning')).SPEED < 1);
});
