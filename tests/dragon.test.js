/* Sneezy Dragon: take turns sneaking a treasure; one pre-drawn grab sets off the sneeze. */
'use strict';
const h = require('./harness');
const ID = 'dragon';

const api = (page, key) => page.evaluate((k) => MG.current.api[k], key);
const idle = (page) => page.waitForFunction(() => MG.current && MG.current.api && MG.current.api.state === 'idle' && !MG.current.ctx.locked, null, { timeout: 20000 });
/** The turn player takes one of their own treasures with a real tap. */
async function grab(page) {
  await idle(page);
  const turn = await api(page, 'turn');
  const before = await api(page, 'grabs');
  await page.locator(`.g-dragon .dg-zone[data-p="${turn}"] .dg-gem:not(.is-gone)`).first().tap();
  await page.waitForFunction((b) => MG.current.api.grabs === b + 1, before);
  return turn;
}

h.run(ID, async (t) => {
  const { assert } = t;

  // --- pure logic: the trigger is in range, never grabs 1-2, and 50/50 between starter and the other
  let page = await t.open(ID);
  const stats = await page.evaluate(() => {
    const a = MG.current.api, out = {};
    for (const per of [5, 3]) {
      const seen = {}; let starter = 0; const N = 20000;
      for (let i = 0; i < N; i++) { const tr = a.drawTrigger(per); seen[tr] = (seen[tr] || 0) + 1; if (a.sneezerOf(tr, 0) === 0) starter++; }
      out[per] = { keys: Object.keys(seen).map(Number).sort((x, y) => x - y), starterShare: starter / N };
    }
    const plan = a.planRound(5);
    out.fakesBeforeTrigger = plan.fakes.every((f, k) => !f || (k >= 2 && k < plan.trigger));
    return out;
  });
  assert.deepStrictEqual(stats[5].keys, [3, 4, 5, 6, 7, 8, 9, 10]);
  assert.deepStrictEqual(stats[3].keys, [2, 3, 4, 5, 6]);
  for (const per of [5, 3]) assert.ok(Math.abs(stats[per].starterShare - 0.5) < 0.02, `sneeze is 50/50 with ${per} each (${stats[per].starterShare})`);
  assert.ok(stats.fakesBeforeTrigger, 'fake build-ups only on safe grabs after the first');

  // --- a whole round with a rigged plan: grab 4 is a fake-out, grab 5 is the sneeze
  await t.fast(page, 8);
  assert.ok(await page.evaluate(() => MG.current.api.rig({ trigger: 5, fakes: [false, false, false, false, true, false], steps: [0, 2, 2, 2, 3, 2] })));
  const first = await api(page, 'first');
  const order = [];
  for (let k = 0; k < 5; k++) order.push(await grab(page));
  assert.deepStrictEqual(order, [first, 1 - first, first, 1 - first, first], 'turns strictly alternate');
  await page.waitForFunction(() => MG.current.api.sneezed !== null);
  assert.strictEqual(await api(page, 'sneezed'), first, 'the 5th grab belongs to the starter, who gets sneezed on');
  await t.waitForWin(page);
  assert.strictEqual(await page.locator('.mg-win').getAttribute('data-result'), 'team', 'nobody wins: the sneeze is the punchline');
  assert.strictEqual(await page.locator('.mg-win__badge').textContent(), await page.evaluate(() => MG.current.api.hat));

  // --- mashing: a slap on your own heap takes ONE treasure; the other heap and the dragon take none
  page = await t.open(ID);
  await page.evaluate(() => MG.current.api.rig({ trigger: 10, fakes: [], steps: [0, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2] }));
  await idle(page);
  const turn = await api(page, 'turn');
  await page.evaluate((turn) => {
    const fire = (el, id) => { const r = el.getBoundingClientRect(); el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: id, pointerType: 'touch', isPrimary: id === 30, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })); };
    let id = 30;
    document.querySelectorAll(`.g-dragon .dg-zone[data-p="${turn}"] .dg-gem`).forEach((g) => fire(g, id++));
    document.querySelectorAll(`.g-dragon .dg-zone[data-p="${1 - turn}"] .dg-gem, .g-dragon .dg-zone[data-p="${1 - turn}"] .dg-veil, .g-dragon .dg-den`).forEach((g) => fire(g, id++));
  }, turn);
  assert.strictEqual(await api(page, 'grabs'), 1, 'one grab per turn, however many fingers');
  assert.deepStrictEqual(await api(page, 'taken'), turn === 0 ? [1, 0] : [0, 1]);
  await idle(page);
  assert.strictEqual(await api(page, 'turn'), 1 - turn, 'the turn passed exactly once');

  // --- every supported size, both treasure counts: nothing clipped, big targets, layout fits
  for (const vp of ['small', 'phone', 'phoneWide', 'tabletTall', 'tablet']) {
    for (const each of [5, 3]) {
      const p = await t.open(null, { viewport: vp, dark: vp === 'phoneWide' || vp === 'small', page: 'tests/play.html?g=dragon' });
      await p.evaluate((each) => { MG.store.set('opt:dragon:each', each); MG.open('dragon'); }, each);
      await idle(p);
      assert.ok(await t.noPageScroll(p), `no page scroll @${vp}/${each}`);
      assert.ok((await api(p, 'layout')).fits, `layout fits @${vp}/${each}`);
      assert.deepStrictEqual(await t.outsidePlayArea(p, '.g-dragon .dg-zone, .g-dragon .dg-gem, .g-dragon .dg-den'), [], `all in view @${vp}/${each}`);
      const size = await t.minTargetSize(p, '.g-dragon .dg-gem');
      assert.ok(size.count === each * 2 && size.min >= 64, `treasures are big enough @${vp}/${each} (${size.min}px)`);
      await grab(p); await grab(p);
      await idle(p);
      if (each === 5) await t.shot(p, `dragon-${vp}.png`);
      if (vp === 'phone' && each === 5) {
        await p.setViewportSize({ width: 844, height: 390 });
        await p.waitForTimeout(250);
        assert.deepStrictEqual(await t.outsidePlayArea(p, '.g-dragon .dg-zone, .g-dragon .dg-gem, .g-dragon .dg-den'), [], 'still in view after rotating mid-round');
        await grab(p);
      }
    }
  }

  // --- the sneeze itself, for a look
  page = await t.open(ID, { viewport: 'phone' });
  await page.evaluate(() => MG.current.api.rig({ trigger: 3, fakes: [], steps: [0, 2, 2, 3] }));
  await grab(page); await grab(page);
  await idle(page);
  await page.locator(`.g-dragon .dg-zone.is-turn .dg-gem:not(.is-gone)`).first().tap();
  await page.waitForFunction(() => MG.current.api.mood === 'ah3');
  await t.shot(page, 'dragon-phone-ah.png');
  await page.waitForFunction(() => MG.current.api.mood === 'giggle');
  await page.waitForTimeout(600);
  await t.shot(page, 'dragon-phone-sneezed.png');

  // --- leaving and coming back mid-animation leaves nothing behind
  page = await t.open(ID);
  for (let i = 0; i < 4; i++) {
    await idle(page);
    await page.locator('.g-dragon .dg-zone.is-turn .dg-gem:not(.is-gone)').first().tap();
    await page.evaluate(() => MG.home());
    await page.evaluate(() => MG.open('dragon'));
  }
  await idle(page);
  assert.strictEqual(await page.locator('.g-dragon .dg-scene').count(), 1);
});
