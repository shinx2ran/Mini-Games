/* Egg Twins: take turns cracking two eggs; twins go to your nest; most twins wins. */
'use strict';
const h = require('./harness');
const ID = 'twins';

const api = (page, key) => page.evaluate((k) => MG.current.api[k], key);
const myTurn = (page) => page.waitForFunction(() => MG.current && MG.current.api && MG.current.api.state === 'first' && !MG.current.ctx.locked, null, { timeout: 30000 });
const tapEgg = (page, i) => page.locator(`.g-twins .tw-egg[data-i="${i}"]`).tap();

/** Take a turn: a match if `match`, else two different babies (or the last pair if that is all there is). */
async function turn(page, match) {
  await myTurn(page);
  const eggs = await api(page, 'eggs');
  const live = eggs.map((k, i) => [k, i]).filter(([k]) => k >= 0);
  const [k0, i0] = live[0];
  let second = live.find(([k, i]) => i !== i0 && (k === k0) === match);
  if (!second) second = live.find(([k, i]) => i !== i0);
  await tapEgg(page, i0);
  await page.waitForFunction(() => MG.current.api.state === 'second');
  await tapEgg(page, second[1]);
  await page.waitForFunction(() => MG.current.api.state !== 'second');
  return second[0] === k0;
}
async function playOut(page, plan) {
  // plan(player, turnNumber) -> should this turn be a match?
  for (let n = 0; n < 80; n++) {
    await page.waitForFunction(() => MG.current.api.state === 'done' || (MG.current.api.state === 'first' && !MG.current.ctx.locked), null, { timeout: 30000 });
    if ((await api(page, 'state')) === 'done') return;
    const p = await api(page, 'turn');
    await turn(page, plan(p, n));
  }
  throw new Error('round never ended');
}
const open = async (t, opts = {}, setup = null) => {
  const page = await t.open(null, { ...opts, page: 'tests/play.html?g=twins' });
  await page.evaluate((s) => { if (s) for (const k in s) MG.store.set(k, s[k]); }, setup);
  await page.reload();
  await page.waitForFunction(() => window.MG && document.querySelector('#mg-home'));
  await page.evaluate(() => MG.open('twins'));
  await page.waitForFunction(() => MG.current && MG.current.api);
  return page;
};

h.run(ID, async (t) => {
  const { assert } = t;

  // --- pure rules
  let page = await t.open(ID);
  const r = await page.evaluate(() => {
    const a = MG.current.api;
    const deck = a.deal(6, MG.util.shuffle);
    const counts = {}; deck.forEach((k) => { counts[k] = (counts[k] || 0) + 1; });
    return {
      wide: a.gridFor(12, 600, 300), tall: a.gridFor(12, 300, 500), sixteen: a.gridFor(16, 300, 400),
      v: [a.verdict(4, 2), a.verdict(1, 5), a.verdict(3, 3)],
      deckLen: deck.length, allPairs: Object.values(counts).every((c) => c === 2), kinds: Object.keys(counts).length,
      babies: a.babies.length, distinct: new Set(a.babies).size,
    };
  });
  assert.strictEqual(r.wide.cols, 4); assert.strictEqual(r.tall.cols, 3); assert.strictEqual(r.sixteen.cols, 4);
  assert.deepStrictEqual(r.v, [0, 1, 'tie']);
  assert.ok(r.deckLen === 12 && r.allPairs && r.kinds === 6, 'a deck is six different pairs');
  assert.strictEqual(r.babies, r.distinct);

  // --- a whole round through real taps: player 0 always matches, player 1 never does (until forced)
  await t.fast(page, 8);
  const first = await page.evaluate(() => MG.current.ctx.firstPlayer);
  assert.strictEqual(await api(page, 'turn'), first);
  await playOut(page, (p) => p === 0);
  await t.waitForWin(page, 30000);
  const found = await api(page, 'found');
  assert.strictEqual(found[0] + found[1], 6);
  assert.ok(found[0] > found[1]);
  assert.strictEqual(await page.locator('.mg-win').getAttribute('data-result'), '0');
  assert.deepStrictEqual(await page.evaluate(() => MG.current.ctx.scores), found);
  assert.strictEqual(await page.locator('.g-twins .tw-nest[data-p="0"] .tw-pair').count(), found[0], 'her twins sit in her nest');

  // --- no extra turn after a match; everyone matching with 8 eggs is a tie with two crowns
  page = await open(t, {}, { 'opt:twins:eggs': 8 });
  await t.fast(page, 8);
  const order = [];
  for (let n = 0; n < 4; n++) { await myTurn(page); order.push(await api(page, 'turn')); assert.ok(await turn(page, true)); }
  assert.deepStrictEqual(order, [order[0], 1 - order[0], order[0], 1 - order[0]], 'turns alternate even after a match');
  await t.waitForWin(page, 30000);
  assert.strictEqual(await page.locator('.mg-win').getAttribute('data-result'), 'tie');
  assert.strictEqual(await page.locator('.mg-win__face.is-crowned').count(), 2);

  // --- mashing: a slap on four eggs opens exactly two; the same egg twice is one pick; nothing during the look
  page = await t.open(ID);
  await myTurn(page);
  const who = await api(page, 'turn');
  const eggs = await api(page, 'eggs');
  const diff = [0, eggs.findIndex((k) => k !== eggs[0])];
  await tapEgg(page, 0);
  await page.evaluate(() => { const el = document.querySelector('.g-twins .tw-egg[data-i="0"]'); const r = el.getBoundingClientRect(); el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 80, pointerType: 'touch', clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })); });
  assert.deepStrictEqual(await api(page, 'open'), [0], 'tapping the open egg again is not a second pick');
  await page.evaluate((second) => {
    [second, 2, 3, 4, 5].forEach((i, k) => { const el = document.querySelector(`.g-twins .tw-egg[data-i="${i}"]`); const r = el.getBoundingClientRect(); el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 81 + k, pointerType: 'touch', clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })); });
  }, diff[1]);
  assert.deepStrictEqual(await api(page, 'open'), diff, 'a slap opens two eggs, never three');
  assert.strictEqual(await page.locator('.g-twins .tw-egg.is-open').count(), 2);
  await t.fast(page, 8);
  await myTurn(page);
  assert.strictEqual(await api(page, 'turn'), 1 - who, 'the turn passed exactly once');
  assert.strictEqual(await page.locator('.g-twins .tw-egg.is-open').count(), 0, 'a mismatch closes again');

  // --- invisible help: a twin she has already seen shimmers when the little player hesitates
  page = await t.open(ID);
  await t.fast(page, 8);
  await myTurn(page);
  const e2 = await api(page, 'eggs');
  const a1 = 0, a2 = e2.findIndex((k, i) => i > 0 && k === e2[0]);
  const others = e2.map((k, i) => i).filter((i) => i !== a1 && i !== a2);
  const b = others[0], c = others.find((i) => e2[i] !== e2[b]), d = others.find((i) => i !== b && i !== c && e2[i] !== e2[c]);
  assert.strictEqual(await api(page, 'turn'), 0);
  await tapEgg(page, a1); await page.waitForFunction(() => MG.current.api.state === 'second'); await tapEgg(page, b);   // little: sees a1
  await myTurn(page);
  await tapEgg(page, c); await page.waitForFunction(() => MG.current.api.state === 'second');
  await page.waitForTimeout(600);
  assert.strictEqual(await api(page, 'hinting'), -1, 'the grown-up never gets a hint');
  await tapEgg(page, d);
  await myTurn(page);
  await tapEgg(page, a2); await page.waitForFunction(() => MG.current.api.state === 'second');
  await page.waitForFunction((i) => MG.current.api.hinting === i, a1, { timeout: 10000 });
  assert.strictEqual(await page.locator('.g-twins .tw-egg.is-shimmer').count(), 1);

  // --- every supported size and egg count: nothing clipped, every egg a big target; rotate mid-round
  for (const vp of ['small', 'phone', 'phoneWide', 'tabletTall', 'tablet']) {
    for (const n of [8, 12, 16]) {
      const p = await open(t, { viewport: vp, dark: vp === 'phoneWide' || vp === 'small' }, { 'opt:twins:eggs': n });
      await t.fast(p, 8);
      await turn(p, true); await turn(p, true);
      await myTurn(p);
      await tapEgg(p, (await api(p, 'eggs')).findIndex((k) => k >= 0));
      await p.waitForTimeout(400);
      assert.ok(await t.noPageScroll(p), `no page scroll @${vp}/${n}`);
      assert.deepStrictEqual(await t.outsidePlayArea(p, '.g-twins .tw-egg, .g-twins .tw-nest, .g-twins .tw-shell, .g-twins .tw-pair'), [], `all in view @${vp}/${n}`);
      const size = await t.minTargetSize(p, '.g-twins .tw-egg:not(.is-gone)');
      assert.ok(size.min >= 64, `eggs are big enough @${vp}/${n} (${size.min}px)`);
      if (n === 12) { await p.waitForTimeout(350); await t.shot(p, `twins-${vp}.png`); }
      if (vp === 'phone' && n === 12) {
        await p.setViewportSize({ width: 844, height: 390 });
        await p.waitForTimeout(300);
        assert.deepStrictEqual(await t.outsidePlayArea(p, '.g-twins .tw-egg, .g-twins .tw-nest, .g-twins .tw-shell'), [], 'still in view after rotating mid-turn');
        assert.ok((await t.minTargetSize(p, '.g-twins .tw-egg:not(.is-gone)')).min >= 64);
      }
    }
  }

  // --- "Lots" of help starts with a look at every baby
  page = await open(t, {}, { help: 2 });
  assert.strictEqual(await api(page, 'state'), 'preview');
  assert.strictEqual(await page.locator('.g-twins .tw-egg.is-open').count(), 12);
  await t.fast(page, 8);
  await myTurn(page);
  assert.strictEqual(await page.locator('.g-twins .tw-egg.is-open').count(), 0);

  // --- leaving and coming back mid-turn leaves nothing behind
  page = await t.open(ID);
  for (let i = 0; i < 4; i++) {
    await myTurn(page);
    await tapEgg(page, i);
    await page.evaluate(() => MG.home());
    await page.evaluate(() => MG.open('twins'));
  }
  await myTurn(page);
  assert.strictEqual(await page.locator('.g-twins .tw-scene').count(), 1);
  assert.strictEqual(await page.locator('.g-twins .tw-flyer').count(), 0);
});
