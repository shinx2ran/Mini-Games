/* Yummy-Yucky Cafe: the Chef cooks anything, the Customer takes three bites and reacts; then swap. */
'use strict';
const h = require('./harness');
const ID = 'cafe';

const api = (page, key) => page.evaluate((k) => MG.current.api[k], key);
const state = (page, s) => page.waitForFunction((s) => MG.current && MG.current.api && MG.current.api.state === s && !MG.current.ctx.locked, s, { timeout: 30000 });
/** Tap tray item k and wait for the game clock to pass the per-item debounce. */
async function top(page, k) {
  const before = (await api(page, 'tops')).length;
  await page.locator(`.g-cafe .cf-item[data-k="${k}"]`).tap();
  const t0 = await page.evaluate(() => MG.current.ctx.time);
  await page.waitForFunction((t) => MG.current.ctx.time - t > 0.3, t0);
  return (await api(page, 'tops')).length - before;
}
/** One whole dish through real taps. `want(tray)` -> indexes of the toppings to add. */
async function cookDish(page, plate, want) {
  await state(page, 'dish');
  const roles = { chef: await api(page, 'chef'), customer: await api(page, 'customer') };
  await page.locator(`.g-cafe .cf-pick[data-k="${plate}"]`).tap();
  await state(page, 'cook');
  const tray = await api(page, 'tray');
  for (const k of want(tray)) await top(page, k);
  const tops = await api(page, 'tops');
  await page.locator('.g-cafe .cf-bell').tap();
  await state(page, 'serve');
  for (let b = 0; b < 3; b++) {
    await page.waitForFunction(() => !MG.current.ctx.locked);
    await page.locator('.g-cafe .cf-dish').tap({ force: true });
  }
  await page.waitForFunction(() => MG.current.api.mood !== null);
  const mood = await api(page, 'mood');
  return { ...roles, tray, tops, mood };
}
const pick = (tray, yucky, n) => tray.map((t, k) => [t, k]).filter(([t]) => t.yucky === yucky).slice(0, n).map(([, k]) => k);

h.run(ID, async (t) => {
  const { assert } = t;

  // --- pure rules
  let page = await t.open(ID);
  const r = await page.evaluate(() => {
    const a = MG.current.api;
    const tray = a.drawTray('silly', MG.util.shuffle), polite = a.drawTray('polite', MG.util.shuffle);
    return {
      moods: [a.moodFor(0), a.moodFor(1), a.moodFor(2), a.moodFor(5)],
      n: tray.length, yucky: tray.filter((x) => x.yucky).length, distinct: new Set(tray.map((x) => x.emoji)).size,
      politeOk: polite.filter((x) => x.yucky).every((x) => a.pools.polite.includes(x.emoji)),
      gags: a.gagsFor([{ gag: null }, { gag: 'sock' }, { gag: 'sock' }, { gag: 'fire' }, { gag: 'woof' }]),
      everyGagExists: a.sillyGags.every((g) => a.gagNames.includes(g)),
    };
  });
  assert.deepStrictEqual(r.moods, ['yum', 'bleh', 'green', 'green']);
  assert.ok(r.n === 8 && r.yucky === 4 && r.distinct === 8, 'the tray is four yummy and four silly things');
  assert.ok(r.politeOk);
  assert.deepStrictEqual(r.gags, ['sock', 'fire'], 'at most two different gags');
  assert.ok(r.everyGagExists);

  // --- a whole round through real taps: a yummy dish, swap, a yucky dish, then the team party
  await t.fast(page, 8);
  const first = await page.evaluate(() => MG.current.ctx.firstPlayer);
  assert.strictEqual(await page.locator('.g-cafe .cf-seat.is-chef').getAttribute('data-p'), String(first), 'the first player is Chef first');
  const d1 = await cookDish(page, 0, (tray) => pick(tray, false, 3));
  assert.strictEqual(d1.chef, first);
  assert.strictEqual(d1.tops.length, 3);
  assert.strictEqual(d1.mood, 'yum');
  const d2 = await cookDish(page, 2, (tray) => [...pick(tray, true, 2), ...pick(tray, false, 1)]);
  assert.strictEqual(d2.chef, 1 - first, 'roles swap after each dish');
  assert.strictEqual(d2.customer, first);
  assert.strictEqual(d2.mood, 'green');
  await t.waitForWin(page, 30000);
  assert.strictEqual(await page.locator('.mg-win').getAttribute('data-result'), 'team');

  // --- one yucky thing is a "bleh"
  page = await t.open(ID);
  await t.fast(page, 8);
  const d3 = await cookDish(page, 1, (tray) => [...pick(tray, true, 1), ...pick(tray, false, 2)]);
  assert.strictEqual(d3.mood, 'bleh');

  // --- mashing: no serving an empty plate, one topping per tap, six at most, three bites exactly
  page = await t.open(ID);
  await state(page, 'dish');
  await page.evaluate(() => {
    document.querySelectorAll('.g-cafe .cf-pick').forEach((el, k) => { const r = el.getBoundingClientRect(); el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 130 + k, pointerType: 'touch', clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })); });
  });
  assert.strictEqual(await api(page, 'dish'), '🍕', 'a slap on all three plates picks one');
  await state(page, 'cook');
  await page.evaluate(() => { const el = document.querySelector('.g-cafe .cf-bell'); const r = el.getBoundingClientRect(); el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 140, pointerType: 'touch', clientX: r.left + 5, clientY: r.top + 5 })); });
  assert.strictEqual(await api(page, 'state'), 'cook', 'the bell does nothing before the first topping');
  await page.evaluate(() => {
    const el = document.querySelector('.g-cafe .cf-item[data-k="0"]'); const r = el.getBoundingClientRect();
    for (let id = 141; id < 147; id++) el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: id, pointerType: 'touch', clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
  });
  assert.strictEqual((await api(page, 'tops')).length, 1, 'drumming on one topping adds one');
  await t.fast(page, 8);
  for (let k = 0; k < 8; k++) await top(page, k);
  assert.strictEqual((await api(page, 'tops')).length, 6, 'a dish holds six toppings at most');
  await page.locator('.g-cafe .cf-bell').tap();
  await state(page, 'serve');
  await page.evaluate(() => { MG.timeScale = 1; });
  await page.evaluate(() => {
    const el = document.querySelector('.g-cafe .cf-dish'); const r = el.getBoundingClientRect();
    for (let id = 150; id < 156; id++) el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: id, pointerType: 'touch', clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
  });
  assert.strictEqual(await api(page, 'bites'), 1, 'six fingers at once are one bite');

  // --- every supported size, cooking with a full plate: nothing clipped, big buttons; rotate mid-cook
  for (const vp of ['small', 'phone', 'phoneWide', 'tabletTall', 'tablet']) {
    const p = await t.open(ID, { viewport: vp, dark: vp === 'phoneWide' || vp === 'tabletTall' });
    await state(p, 'dish');
    await p.waitForTimeout(450);
    assert.ok((await t.minTargetSize(p, '.g-cafe .cf-pick')).min >= 64, `plates are big @${vp}`);
    assert.deepStrictEqual(await t.outsidePlayArea(p, '.g-cafe .cf-pick, .g-cafe .cf-seat, .g-cafe .cf-dish'), [], `plates in view @${vp}`);
    await p.locator('.g-cafe .cf-pick[data-k="1"]').tap();
    await state(p, 'cook');
    await t.fast(p, 8);
    for (let k = 0; k < 6; k++) await top(p, k);
    await p.evaluate(() => { MG.timeScale = 1; });
    await p.waitForTimeout(500);
    assert.ok(await t.noPageScroll(p), `no page scroll @${vp}`);
    assert.deepStrictEqual(await t.outsidePlayArea(p, '.g-cafe .cf-item, .g-cafe .cf-seat, .g-cafe .cf-dish, .g-cafe .cf-bell, .g-cafe .cf-hat'), [], `all in view @${vp}`);
    const size = await t.minTargetSize(p, '.g-cafe .cf-item, .g-cafe .cf-bell');
    assert.ok(size.count === 9 && size.min >= 64, `toppings and bell are big @${vp} (${size.min}px)`);
    const clash = await p.evaluate(() => {
      const box = (s) => document.querySelector(s).getBoundingClientRect();
      const b = box('.g-cafe .cf-bell'), d = box('.g-cafe .cf-dish'), tr = box('.g-cafe .cf-tray');
      return b.top < d.bottom - 6 || (tr.top < b.bottom - 1 && tr.left < b.right && tr.right > b.left && tr.top > b.top);
    });
    assert.ok(!clash, `bell clear of the dish and tray @${vp}`);
    await t.shot(p, `cafe-${vp}.png`);
    if (vp === 'phone') {
      await p.setViewportSize({ width: 844, height: 390 });
      await p.waitForTimeout(300);
      assert.deepStrictEqual(await t.outsidePlayArea(p, '.g-cafe .cf-item, .g-cafe .cf-seat, .g-cafe .cf-dish, .g-cafe .cf-bell'), [], 'still in view after rotating mid-cook');
      assert.ok((await t.minTargetSize(p, '.g-cafe .cf-item, .g-cafe .cf-bell')).min >= 64);
      await p.locator('.g-cafe .cf-bell').tap();
      await state(p, 'serve');
      await p.waitForTimeout(700);
      await t.shot(p, 'cafe-rotated-serve.png');
    }
  }

  // --- leaving and coming back mid-cook leaves nothing behind
  page = await t.open(ID);
  for (let i = 0; i < 4; i++) {
    await state(page, 'dish');
    await page.locator(`.g-cafe .cf-pick[data-k="${i % 3}"]`).tap();
    await page.evaluate(() => MG.home());
    await page.evaluate(() => MG.open('cafe'));
  }
  await state(page, 'dish');
  assert.strictEqual(await page.locator('.g-cafe .cf-scene').count(), 1);
  assert.strictEqual(await api(page, 'dishNo'), 0);
});
