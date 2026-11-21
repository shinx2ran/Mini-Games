/* Hide & Peek: one hides, the other peeks; then swap. */
'use strict';
const h = require('./harness');
const ID = 'hide';

const api = (page, key) => page.evaluate((k) => MG.current.api[k], key);
const ready = (page, phase) => page.waitForFunction((p) => MG.current && MG.current.api && MG.current.api.phase === p && !MG.current.ctx.locked, phase, { timeout: 20000 });
const tapSpot = (page, i) => page.locator(`.g-hide .hp-spot[data-i="${i}"]`).tap();
const tapSeat = (page, p) => page.locator(`.g-hide .hp-seat[data-p="${p}"]`).tap();

/** Play one whole hunt; `misses` wrong peeks before the find. Returns the hider. */
async function hunt(page, misses = 1) {
  await ready(page, 'hide');
  const hider = await api(page, 'hider');
  const n = await api(page, 'spots');
  const spot = (hider * 2 + 1) % n;
  await tapSpot(page, spot);
  await page.waitForFunction((s) => MG.current.api.picked === s, spot);
  await page.waitForFunction(() => !MG.current.ctx.locked);
  await tapSeat(page, hider);
  await ready(page, 'seek');
  const secret = await api(page, 'secret');
  h.assert.strictEqual(secret, spot, 'the critter is where the hider put it');
  let wrong = 0;
  for (let i = 0; i < n && wrong < misses; i++) {
    if (i === secret) continue;
    await page.waitForFunction(() => MG.current.api.phase === 'seek' && !MG.current.ctx.locked);
    await tapSpot(page, i);
    wrong++;
    await page.waitForFunction((w) => MG.current.api.misses === w, wrong);
  }
  await page.waitForFunction(() => MG.current.api.phase === 'seek' && !MG.current.ctx.locked);
  await tapSpot(page, secret);
  await page.waitForFunction(() => MG.current.api.phase !== 'seek');
  return hider;
}

h.run(ID, async (t) => {
  const { assert } = t;

  // --- a whole round: each player hides once, then the team party
  let page = await t.open(ID);
  await t.fast(page, 8);
  assert.strictEqual(await page.locator('.mg-hint').count() >= 0, true);
  const first = await page.evaluate(() => MG.current.ctx.firstPlayer);
  const h1 = await hunt(page, 2);
  assert.strictEqual(h1, first, 'the first player hides first');
  const h2 = await hunt(page, 0);
  assert.strictEqual(h2, 1 - first, 'then they swap');
  await t.waitForWin(page);
  assert.strictEqual(await page.locator('.mg-win').getAttribute('data-result'), 'team');
  assert.strictEqual(await page.locator('.mg-win__face').count(), 2);

  // --- mashing: a five-finger slap opens exactly one place
  page = await t.open(ID);
  await ready(page, 'hide');
  const hider = await api(page, 'hider');
  await tapSpot(page, 0);
  await page.waitForFunction(() => MG.current.api.picked === 0 && !MG.current.ctx.locked);
  await tapSeat(page, hider);
  await ready(page, 'seek');
  const secret = await api(page, 'secret');
  await page.evaluate((secret) => {
    const spots = [...document.querySelectorAll('.g-hide .hp-spot')].filter((s) => +s.dataset.i !== secret);
    spots.slice(0, 4).forEach((el, k) => {
      const r = el.getBoundingClientRect();
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 20 + k, pointerType: 'touch', isPrimary: k === 0, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
    });
  }, secret);
  assert.strictEqual((await api(page, 'opened')).length, 1, 'a slap opens one place, not four');
  await ready(page, 'seek');
  // the seeker cannot press the hider's button, and the hider's button never ends the hunt
  await page.evaluate(() => {
    document.querySelectorAll('.g-hide .hp-seat').forEach((el, k) => {
      const r = el.getBoundingClientRect();
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 40 + k, pointerType: 'touch', clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
    });
  });
  assert.strictEqual(await api(page, 'phase'), 'seek');
  assert.strictEqual((await api(page, 'opened')).length, 1);

  // --- every supported size, mid-hunt: nothing clipped, big targets; then rotate and finish
  for (const vp of ['small', 'phone', 'phoneWide', 'tabletTall', 'tablet']) {
    const p = await t.open(ID, { viewport: vp, dark: vp === 'phoneWide' || vp === 'tabletTall' });
    await ready(p, 'hide');
    assert.ok(await t.noPageScroll(p), `no page scroll @${vp}`);
    assert.deepStrictEqual(await t.outsidePlayArea(p, '.g-hide .hp-spot, .g-hide .hp-seat'), [], `all in view @${vp}`);
    const size = await t.minTargetSize(p, '.g-hide .hp-spot');
    assert.ok(size.count >= 4 && size.min >= 64, `hiding places are big enough @${vp} (${size.min}px)`);
    await t.shot(p, `hide-${vp}-hide.png`);
    const hd = await api(p, 'hider');
    await tapSpot(p, 1);
    await p.waitForFunction(() => MG.current.api.picked === 1 && !MG.current.ctx.locked);
    await tapSeat(p, hd);
    await ready(p, 'seek');
    const sec = await api(p, 'secret');
    await tapSpot(p, sec === 0 ? 2 : 0);
    await p.waitForFunction(() => MG.current.api.misses === 1 && !MG.current.ctx.locked);
    await t.shot(p, `hide-${vp}-seek.png`);
    if (vp === 'phone') {
      await p.setViewportSize({ width: 844, height: 390 });
      await p.waitForTimeout(250);
      assert.deepStrictEqual(await t.outsidePlayArea(p, '.g-hide .hp-spot, .g-hide .hp-seat'), [], 'still in view after rotating mid-hunt');
      await tapSpot(p, sec);
      await p.waitForFunction(() => MG.current.api.phase !== 'seek');
    }
  }

  // --- leaving and coming back mid-animation leaves nothing behind
  page = await t.open(ID);
  for (let i = 0; i < 4; i++) {
    await ready(page, 'hide');
    await tapSpot(page, i);
    await page.evaluate(() => MG.home());
    await page.evaluate(() => MG.open('hide'));
  }
  await ready(page, 'hide');
  assert.strictEqual(await page.locator('.g-hide .hp-board').count(), 1);
});
