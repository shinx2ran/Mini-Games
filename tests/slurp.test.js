/* Noodle Slurp: both tap their own half; meatball to your mouth wins the bowl; first to two. */
'use strict';
const h = require('./harness');
const ID = 'slurp';

const api = (page, key) => page.evaluate((k) => MG.current.api[k], key);
const slurping = (page) => page.waitForFunction(() => MG.current && MG.current.api && MG.current.api.state === 'slurp', null, { timeout: 30000 });
/** Real pointerdowns on a pad, spaced in game time so each one counts. */
async function tapPad(page, p, times, pointerId = 1) {
  for (let k = 0; k < times; k++) {
    const t0 = await page.evaluate(([p, id]) => {
      const el = document.querySelector(`.g-slurp .sl-pad[data-p="${p}"]`);
      if (MG.current.api.state !== 'slurp') return -1;
      const r = el.getBoundingClientRect();
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: id, pointerType: 'touch', isPrimary: true, clientX: r.left + r.width / 2, clientY: r.top + r.height * 0.8 }));
      return MG.current.ctx.time;
    }, [p, pointerId]);
    if (t0 < 0) return k;
    await page.waitForFunction((t) => !MG.current || MG.current.ctx.time - t >= 0.11 || MG.current.api.state !== 'slurp', t0);
  }
  return times;
}
/** Player p out-taps the other until the match ends. */
async function winMatch(page, p) {
  for (let guard = 0; guard < 6; guard++) {
    if ((await api(page, 'state')) === 'done') return;
    await slurping(page);
    await tapPad(page, p, 60);
  }
}

h.run(ID, async (t) => {
  const { assert } = t;

  // --- pure rules
  let page = await t.open(ID);
  const r = await page.evaluate(() => {
    const a = MG.current.api;
    return {
      base: a.stepSize(0, 1), helped: a.stepSize(5, 1.8), late: a.stepSize(20, 1),
      cap: [a.mayCount(1, 1.05), a.mayCount(1, 1.1), a.mayCount(-1, 0)],
      up: a.nextHelp(1.8, false, 1), down: a.nextHelp(1.8, true, 1), top: a.nextHelp(3.4, false, 1), floor: a.nextHelp(1.05, true, 1),
      lots: a.startHelp(null, 2), off: a.startHelp(3, 0), offNext: a.nextHelp(2, false, 0), junk: a.startHelp('x', 1), clampSaved: a.startHelp(99, 1),
      leader: [a.leader(-0.2), a.leader(0.3), a.leader(0)],
      littleIdx: a.littleIdx, level: a.level, h: a.h,
    };
  });
  assert.ok(Math.abs(r.base - 0.035) < 1e-9);
  assert.ok(Math.abs(r.helped - 0.063) < 1e-9, 'the little player\'s taps are worth more');
  assert.ok(Math.abs(r.late - 0.035 * 1.5) < 1e-9, 'steps grow 5% a second after 10s');
  assert.deepStrictEqual(r.cap, [false, true, true], 'at most ten counted taps a second');
  assert.ok(Math.abs(r.up - 2.16) < 1e-9 && Math.abs(r.down - 1.62) < 1e-9, 'help adapts after every bowl');
  assert.strictEqual(r.top, 3.5); assert.strictEqual(r.floor, 1);
  assert.strictEqual(r.lots, 2.6); assert.strictEqual(r.off, 1); assert.strictEqual(r.offNext, 1);
  assert.strictEqual(r.junk, 1.8); assert.strictEqual(r.clampSaved, 3.5);
  assert.deepStrictEqual(r.leader, [0, 1, null]);
  assert.strictEqual(r.littleIdx, 0); assert.strictEqual(r.level, 1); assert.strictEqual(r.h, 1.8);

  // --- taps before the green light are ignored
  assert.strictEqual(await api(page, 'state'), 'ready');
  await page.locator('.g-slurp .sl-pad[data-p="0"]').tap();
  assert.strictEqual(await api(page, 'p'), 0, 'no false start');

  // --- a whole match through real taps: player 0 takes two bowls
  await t.fast(page, 8);
  await winMatch(page, 0);
  await t.waitForWin(page, 30000);
  assert.strictEqual(await page.locator('.mg-win').getAttribute('data-result'), '0');
  assert.deepStrictEqual(await api(page, 'bowls'), [2, 0]);
  assert.strictEqual(await page.locator('.g-slurp .sl-slot.is-won').count(), 2);
  assert.ok((await api(page, 'h')) < 1.8, 'she won, so the hidden help eased off');

  // --- and the other player can win too
  page = await t.open(ID);
  await t.fast(page, 8);
  await winMatch(page, 1);
  await t.waitForWin(page, 30000);
  assert.strictEqual(await page.locator('.mg-win__face.is-crowned').getAttribute('data-p'), '1');
  assert.deepStrictEqual(await api(page, 'bowls'), [0, 2]);

  // --- mashing: ten fingers at once on one side count once; both sides at once both count
  page = await t.open(ID);
  await slurping(page);
  const res = await page.evaluate(() => {
    const a = MG.current.api;
    const fire = (p, id) => { const el = document.querySelector(`.g-slurp .sl-pad[data-p="${p}"]`); const r = el.getBoundingClientRect(); el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: id, pointerType: 'touch', isPrimary: id === 60, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })); };
    for (let id = 60; id < 70; id++) fire(1, id);
    const burst = { counted: a.counted, p: a.p };
    return burst;
  });
  assert.deepStrictEqual(res.counted, [0, 1], 'a ten-finger drum-roll is one slurp');
  await page.waitForFunction(() => MG.current.ctx.time > 0 && MG.current.api.mayCount(MG.current.ctx.time - 0.2, MG.current.ctx.time));
  await page.waitForTimeout(150);
  const both = await page.evaluate(() => {
    const a = MG.current.api, before = a.p;
    const fire = (p, id) => { const el = document.querySelector(`.g-slurp .sl-pad[data-p="${p}"]`); const r = el.getBoundingClientRect(); el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: id, pointerType: 'touch', isPrimary: false, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })); };
    fire(0, 71); fire(1, 72); // a held third finger elsewhere must not matter
    return { counted: a.counted, moved: a.p - before, h: a.h, step: a.stepSize(0, 1) };
  });
  assert.deepStrictEqual(both.counted, [1, 2], 'two players at the same instant both count');
  assert.ok(Math.abs(both.moved - (both.step - both.step * both.h)) < 0.01, 'her tap pulled further than his');

  // --- real touches (not synthetic events): two fingers landing in the same instant, one per side,
  //     while a third finger rests on the screen the whole time
  page = await t.open(ID);
  await slurping(page);
  {
    const cdp = await page.context().newCDPSession(page);
    const mid = async (sel) => { const b = await page.locator(sel).boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height * 0.8 }; };
    const a = await mid('.g-slurp .sl-pad[data-p="0"]'), b = await mid('.g-slurp .sl-pad[data-p="1"]');
    const pt = (p, id) => ({ x: p.x, y: p.y, id, radiusX: 8, radiusY: 8, force: 1 });
    const rest = { x: a.x, y: a.y - 200 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(rest, 0)] });
    await page.waitForFunction(() => MG.current.api.counted[0] === 1);
    await page.waitForTimeout(250);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(rest, 0), pt(a, 1), pt(b, 2)] });
    await page.waitForFunction(() => MG.current.api.counted[0] === 2 && MG.current.api.counted[1] === 1, null, { timeout: 5000 });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert.deepStrictEqual(await api(page, 'counted'), [2, 1], 'a resting finger never blocks either player');
  }

  // --- every supported size: nothing clipped, each half is a huge button; rotate mid-bowl
  for (const vp of ['small', 'phone', 'phoneWide', 'tabletTall', 'tablet']) {
    const p = await t.open(ID, { viewport: vp, dark: vp === 'phoneWide' || vp === 'small' });
    await slurping(p);
    await tapPad(p, 1, 5);
    assert.ok(await t.noPageScroll(p), `no page scroll @${vp}`);
    assert.deepStrictEqual(await t.outsidePlayArea(p, '.g-slurp .sl-pad, .g-slurp .sl-face, .g-slurp .sl-ball, .g-slurp .sl-lights, .g-slurp .sl-slot, .g-slurp .sl-bowl'), [], `all in view @${vp}`);
    const size = await t.minTargetSize(p, '.g-slurp .sl-pad');
    assert.ok(size.count === 2 && size.min >= 120, `pads are huge @${vp} (${size.min}px)`);
    await p.waitForTimeout(200);
    await t.shot(p, `slurp-${vp}.png`);
    if (vp === 'phone') {
      await p.setViewportSize({ width: 844, height: 390 });
      await p.waitForTimeout(300);
      assert.deepStrictEqual(await t.outsidePlayArea(p, '.g-slurp .sl-face, .g-slurp .sl-ball, .g-slurp .sl-lights, .g-slurp .sl-slot'), [], 'still in view after rotating mid-bowl');
      await t.fast(p, 8);
      await tapPad(p, 1, 40);
      assert.strictEqual((await api(p, 'bowls'))[1], 1, 'the bowl can still be won after rotating');
    }
  }

  // --- leaving and coming back mid-bowl leaves nothing behind
  page = await t.open(ID);
  for (let i = 0; i < 4; i++) {
    await slurping(page);
    await tapPad(page, i % 2, 3);
    await page.evaluate(() => MG.home());
    await page.evaluate(() => MG.open('slurp'));
  }
  await slurping(page);
  assert.strictEqual(await page.locator('.g-slurp .sl-scene').count(), 1);
  assert.strictEqual(await api(page, 'p'), 0);
});
