/* Shh! Tiptoe: tiptoe while the wolf sleeps, freeze when his eyes open. */
'use strict';
const h = require('./harness');
const ID = 'tiptoe';

const api = (page, key) => page.evaluate((k) => MG.current.api[k], key);
const ready = (page) => page.waitForFunction(() => MG.current && MG.current.api && MG.current.api.state === 'play', null, { timeout: 30000 });
const free = (page, p) => page.waitForFunction((p) => !MG.current.api.busy[p], p, { timeout: 30000 });
const tapLane = (page, p) => page.locator(`.g-tiptoe .tt-lane[data-p="${p}"]`).tap();
const hold = (page, phase) => page.evaluate((ph) => MG.current.api.hold(ph), phase);

h.run(ID, async (t) => {
  const { assert } = t;

  // --- pure rules: the quiet handicap, and what a tap means in each phase
  let page = await t.open(ID);
  await ready(page);
  const r = await page.evaluate(() => {
    const a = MG.current.api;
    return { off: a.setup(0, 0), none: a.setup(1, -1), some: a.setup(1, 0), lots: a.setup(2, 1),
      j: [a.judge('sleep', 9, 0.3), a.judge('stir', 9, 0.3), a.judge('yawn', 9, 0.3), a.judge('awake', 0.1, 0.6), a.judge('awake', 0.7, 0.6), a.judge('awake', 0.2, 0.15)],
      rules: a.rules, littleIdx: a.littleIdx };
  });
  assert.deepStrictEqual(r.off.len, [12, 12]); assert.deepStrictEqual(r.none.len, [12, 12]);
  assert.deepStrictEqual(r.some, { len: [10, 14], grace: [0.6, 0.15], back: [1, 2], stirMs: 1000 });
  assert.deepStrictEqual(r.lots, { len: [15, 9], grace: [0.15, 0.6], back: [2, 1], stirMs: 1400 });
  assert.deepStrictEqual(r.j, ['step', 'step', 'step', 'ignore', 'caught', 'caught']);
  assert.strictEqual(r.littleIdx, 0); assert.deepStrictEqual(r.rules.len, [10, 14]);
  assert.strictEqual(await page.locator('.g-tiptoe .tt-lane[data-p="0"] .tt-mark').count(), 10);

  // --- asleep: a tap is one step; drumming during the hop adds nothing
  await hold(page, 'sleep');
  await page.evaluate(() => {
    const el = document.querySelector('.g-tiptoe .tt-lane[data-p="0"]'); const r = el.getBoundingClientRect();
    for (let id = 1; id <= 6; id++) el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: id, pointerType: 'touch', clientX: r.left + r.width / 2, clientY: r.top + r.height * 0.6 }));
  });
  assert.deepStrictEqual(await api(page, 'pos'), [1, 0], 'six fingers at once are one tiptoe');
  await free(page, 0);
  await tapLane(page, 0); await free(page, 0);
  await tapLane(page, 1); await free(page, 1);
  assert.deepStrictEqual(await api(page, 'pos'), [2, 1]);

  // --- stirring is only a warning: still safe
  await hold(page, 'stir');
  await tapLane(page, 1); await free(page, 1);
  assert.deepStrictEqual(await api(page, 'pos'), [2, 2]);

  // --- awake: a late tap inside the grace window is forgiven; after it you are huffed back
  await hold(page, 'awake');
  await tapLane(page, 0);
  assert.deepStrictEqual(await api(page, 'pos'), [2, 2], 'her tap just after the eyes open is forgiven');
  await page.waitForTimeout(750);
  await tapLane(page, 0);
  assert.deepStrictEqual(await api(page, 'pos'), [1, 2], 'the little player goes back one');
  assert.deepStrictEqual(await api(page, 'caught'), [1, 0]);
  await tapLane(page, 0);
  assert.deepStrictEqual(await api(page, 'pos'), [1, 2], 'dizzy: taps do nothing for a moment');
  await tapLane(page, 1);
  assert.deepStrictEqual(await api(page, 'pos'), [1, 0], 'the grown-up goes back two');
  await free(page, 1);
  await tapLane(page, 1);
  assert.deepStrictEqual(await api(page, 'pos'), [1, 0], 'never below the start');

  // --- a whole race: she tiptoes to the cupcakes, wins, and the other is waved up too
  await hold(page, 'sleep');
  await t.fast(page, 8);
  for (let n = 0; n < 12 && (await api(page, 'state')) === 'play'; n++) { await free(page, 0); await tapLane(page, 0); }
  assert.strictEqual(await api(page, 'state'), 'done');
  await t.waitForWin(page, 30000);
  assert.strictEqual(await page.locator('.mg-win').getAttribute('data-result'), '0');
  assert.deepStrictEqual(await api(page, 'pos'), [10, 14], 'everybody reaches the cupcakes');

  // --- the wolf's own cycle runs: sleep, stir, awake, and back to sleep
  page = await t.open(ID);
  await ready(page);
  await t.fast(page, 8);
  const seen = [];
  for (const want of ['stir', 'awake', 'yawn', 'sleep']) {
    await page.waitForFunction((w) => MG.current.api.phase === w, want, { timeout: 30000 });
    seen.push(await page.evaluate(() => document.querySelector('.g-tiptoe .tt-scene').dataset.phase));
  }
  assert.deepStrictEqual(seen, ['stir', 'awake', 'yawn', 'sleep']);

  // --- every supported size, in each phase: lanes are huge, nothing clipped; rotate mid-race
  for (const vp of ['small', 'phone', 'phoneWide', 'tabletTall', 'tablet']) {
    const p = await t.open(ID, { viewport: vp, dark: vp === 'phoneWide' || vp === 'small' });
    await ready(p);
    await hold(p, 'sleep');
    for (let n = 0; n < 4; n++) { await free(p, n % 2); await tapLane(p, n % 2); }
    await p.waitForTimeout(500);
    assert.ok(await t.noPageScroll(p), `no page scroll @${vp}`);
    assert.deepStrictEqual(await t.outsidePlayArea(p, '.g-tiptoe .tt-lane, .g-tiptoe .tt-wolf'), [], `all in view @${vp}`);
    assert.ok((await t.minTargetSize(p, '.g-tiptoe .tt-lane')).min >= 110, `lanes are huge @${vp}`);
    const inLane = await p.evaluate(() => [...document.querySelectorAll('.g-tiptoe .tt-lane')].every((lane) => {
      const l = lane.getBoundingClientRect();
      return [...lane.querySelectorAll('.tt-climber, .tt-cake')].every((n) => { const r = n.getBoundingClientRect(); return r.top >= l.top - 1 && r.bottom <= l.bottom + 1; });
    }));
    assert.ok(inLane, `climbers and cupcakes stay inside their lanes @${vp}`);
    await t.shot(p, `tiptoe-${vp}-sleep.png`);
    await hold(p, 'awake');
    await p.waitForTimeout(350);
    assert.deepStrictEqual(await t.outsidePlayArea(p, '.g-tiptoe .tt-eyes'), [], `the eyes are in view @${vp}`);
    if (vp === 'phone' || vp === 'phoneWide') await t.shot(p, `tiptoe-${vp}-awake.png`);
    if (vp === 'phone') {
      await p.setViewportSize({ width: 844, height: 390 });
      await p.waitForTimeout(300);
      assert.deepStrictEqual(await t.outsidePlayArea(p, '.g-tiptoe .tt-lane, .g-tiptoe .tt-wolf'), [], 'still in view after rotating');
      await hold(p, 'sleep');
      await free(p, 0); await tapLane(p, 0);
      assert.strictEqual((await api(p, 'pos'))[0], 3);
    }
  }

  // --- leaving and coming back leaves nothing behind
  page = await t.open(ID);
  for (let i = 0; i < 4; i++) {
    await ready(page);
    await tapLane(page, i % 2);
    await page.evaluate(() => MG.home());
    await page.evaluate(() => MG.open('tiptoe'));
  }
  await ready(page);
  assert.strictEqual(await page.locator('.g-tiptoe .tt-scene').count(), 1);
  assert.deepStrictEqual(await api(page, 'pos'), [0, 0]);
});
