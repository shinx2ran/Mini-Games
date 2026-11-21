/* Wobble Tower: take turns dropping crates to build one tower together. */
'use strict';
const h = require('./harness');
const ID = 'tower';

const api = (page, key) => page.evaluate((k) => MG.current.api[k], key);
const aiming = (page) => page.waitForFunction(() => MG.current && MG.current.api && MG.current.api.state === 'aim' && !MG.current.ctx.locked, null, { timeout: 30000 });
/** Drop the crate at an exact offset from the top of the tower, with a real tap on the playmat. */
async function dropAt(page, offset) {
  await aiming(page);
  const before = await page.evaluate((off) => {
    const a = MG.current.api, c = a.crates;
    a.rig((c.length ? c[c.length - 1] : 0) + off);
    return { n: c.length, turn: a.turn, wobble: a.wobble };
  }, offset);
  await page.locator('.g-tower .to-scene').tap({ position: { x: 30, y: 40 } });
  await page.waitForFunction(() => MG.current.api.state !== 'fall');
  await page.waitForFunction((t) => MG.current.api.state !== 'aim' || MG.current.api.turn !== t, before.turn, { timeout: 30000 });
  return before;
}

h.run(ID, async (t) => {
  const { assert } = t;

  // --- pure rules
  let page = await t.open(ID);
  const r = await page.evaluate(() => {
    const a = MG.current.api;
    return {
      perfect: a.classify(0.1), edge: a.classify(-0.15), crooked: a.classify(0.3), worst: a.classify(-0.6), miss: a.classify(0.61),
      wide: a.classify(0.2, 0.25),
      sweep: [a.sweepMs(0, 0), a.sweepMs(0, 0), a.sweepMs(1, 0), a.sweepMs(1, 1), a.sweepMs(2, 2), a.sweepMs(2, 0)],
      swing: [a.swing(0), a.swing(0.5), a.swing(1), a.swing(1.5), a.swing(2), a.swing(2.25)],
      views: a.viewHeight(9) > a.viewHeight(1),
    };
  });
  assert.deepStrictEqual(r.perfect, { kind: 'perfect', wobble: -10 });
  assert.deepStrictEqual(r.edge, { kind: 'perfect', wobble: -10 });
  assert.strictEqual(r.crooked.kind, 'crooked'); assert.ok(r.crooked.wobble > 10 && r.crooked.wobble < 35);
  assert.deepStrictEqual(r.worst, { kind: 'crooked', wobble: 35 });
  assert.deepStrictEqual(r.miss, { kind: 'miss', wobble: 25 });
  assert.strictEqual(r.wide.kind, 'perfect', 'the "Lots" zone is wider');
  assert.deepStrictEqual(r.sweep, [1600, 1600, 1300, 2600, 3200, 1300], 'the little player\'s cloud is slower');
  assert.deepStrictEqual(r.swing, [-1, 0, 1, 0, -1, -0.5]);

  // --- straight drops all the way to the star: ten crates, turns alternate, team win
  await t.fast(page, 8);
  const first = await page.evaluate(() => MG.current.ctx.firstPlayer);
  for (let n = 0; n < 10; n++) {
    const b = await dropAt(page, 0.05);
    assert.strictEqual(b.n, n);
    assert.strictEqual(b.turn, n % 2 === 0 ? first : 1 - first, 'turns alternate');
  }
  assert.strictEqual((await api(page, 'crates')).length, 10);
  assert.strictEqual(await api(page, 'wobble'), 0);
  await t.waitForWin(page, 30000);
  assert.strictEqual(await page.locator('.mg-win').getAttribute('data-result'), 'team');
  assert.strictEqual(await page.locator('.mg-win__badge').textContent(), '⭐');
  assert.strictEqual(await api(page, 'best'), 10);

  // --- crooked drops: the wobble grows, a miss adds no crate, and the crash still ends in a party
  page = await t.open(ID);
  await t.fast(page, 8);
  await dropAt(page, 0);
  await dropAt(page, 0.55);
  const w1 = await api(page, 'wobble');
  assert.ok(w1 >= 30 && w1 <= 35);
  await dropAt(page, 0.9);
  assert.strictEqual((await api(page, 'crates')).length, 2, 'a crate that slides off is not added');
  assert.strictEqual(await api(page, 'wobble'), w1 + 25);
  await dropAt(page, 0.1);
  assert.strictEqual(await api(page, 'wobble'), w1 + 15, 'a straight crate calms the tower');
  await dropAt(page, -0.6);
  assert.strictEqual((await api(page, 'crates')).length, 4);
  await aiming(page);
  await page.evaluate(() => { const a = MG.current.api; a.rig(a.crates[a.crates.length - 1] + 0.6); });
  await page.locator('.g-tower .to-scene').tap({ position: { x: 30, y: 40 } });
  await page.waitForFunction(() => MG.current.api.state === 'topple' || MG.current.api.state === 'count', null, { timeout: 30000 });
  assert.strictEqual(await api(page, 'wobble'), 100);
  await t.waitForWin(page, 30000);
  assert.strictEqual(await page.locator('.mg-win').getAttribute('data-result'), 'team', 'the crash is a party, not a loss');
  assert.strictEqual(await page.locator('.g-tower .to-crate.is-counted').count(), 5, 'every stacked crate is counted');
  assert.strictEqual(await page.evaluate(() => MG.current.ctx.load('best', 0)), 5, 'the team record is saved');

  // --- a tall tower that crashes is counted out quickly: the party is never more than ~5s away
  page = await t.open(ID);
  await t.fast(page, 8);
  for (const off of [0, 0.6, -0.6, 0.3, 0, 0, 0, 0, 0]) await dropAt(page, off);
  assert.strictEqual((await api(page, 'crates')).length, 9);
  // time the finale inside the page, on the game's own clock
  await page.evaluate(() => {
    window.__finale = {};
    (function watch() {
      const cur = MG.current;
      if (cur && cur.id === 'tower') {
        if (cur.api.state === 'topple' && window.__finale.topple == null) window.__finale.topple = cur.ctx.time;
        if (document.querySelector('.mg-win') && window.__finale.party == null) { window.__finale.party = cur.ctx.time; return; }
      }
      requestAnimationFrame(watch);
    })();
  });
  for (let k = 0; k < 4 && (await api(page, 'state')) === 'aim'; k++) {
    await aiming(page);
    await page.evaluate(() => { const a = MG.current.api; a.rig(a.crates[a.crates.length - 1] + 0.9); });
    await page.locator('.g-tower .to-scene').tap({ position: { x: 30, y: 40 } });
    await page.waitForFunction(() => MG.current.api.state !== 'fall');
    await page.waitForFunction(() => MG.current.api.state !== 'aim' || !MG.current.ctx.locked, null, { timeout: 30000 });
  }
  await t.waitForWin(page, 30000);
  const finale = await page.evaluate(() => window.__finale.party - window.__finale.topple);
  assert.ok(finale < 5, `crash to party in ${finale.toFixed(1)}s of game time`);
  assert.strictEqual(await page.locator('.g-tower .to-crate.is-counted').count(), 9);

  // --- the goal is always on screen: a pinned star until the real one comes into view
  for (const vp of ['small', 'phoneWide', 'tablet']) {
    const p = await t.open(ID, { viewport: vp });
    await aiming(p);
    const goal = await p.evaluate(() => {
      const g = document.querySelector('#mg-game').getBoundingClientRect();
      const inView = (s) => { const r = document.querySelector(s).getBoundingClientRect(); return r.top >= g.top && r.bottom <= g.bottom && r.left >= g.left && r.right <= g.right; };
      return { far: document.querySelector('.g-tower .to-scene').classList.contains('is-far'), pinned: inView('.g-tower .to-goal'), real: inView('.g-tower .to-star') };
    });
    assert.ok(goal.real || (goal.far && goal.pinned), `a star to aim for is visible from the first crate @${vp}`);
  }

  // --- reduced motion: no swaying, but the danger still shows as a still lean
  page = await t.open(ID, { reducedMotion: true });
  await t.fast(page, 8);
  await dropAt(page, 0); await dropAt(page, 0.6); await dropAt(page, 0.6);
  await aiming(page);
  const leanDeg = await page.evaluate(() => parseFloat((document.querySelector('.g-tower .to-tower').style.transform.match(/rotate\(([-\d.]+)deg/) || [0, 0])[1]));
  assert.ok(Math.abs(leanDeg) > 2, `a wobbly tower leans even with reduced motion (${leanDeg}deg)`);

  // --- mashing: a five-finger slap drops ONE crate and cannot drop the next player's
  page = await t.open(ID);
  await aiming(page);
  const who = await api(page, 'turn');
  await page.evaluate(() => {
    const el = document.querySelector('.g-tower .to-scene'); const r = el.getBoundingClientRect();
    for (let id = 110; id < 115; id++) el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: id, pointerType: 'touch', clientX: r.left + 40 + id, clientY: r.top + 60 }));
  });
  await page.waitForFunction((w) => MG.current.api.state === 'aim' && MG.current.api.turn !== w, who, { timeout: 30000 });
  assert.ok((await api(page, 'crates')).length <= 1);
  await page.evaluate(() => { const el = document.querySelector('.g-tower .to-scene'); const r = el.getBoundingClientRect(); el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 120, pointerType: 'touch', clientX: r.left + 50, clientY: r.top + 60 })); });
  assert.strictEqual(await api(page, 'state'), 'aim', 'a leftover tap right after the swap is ignored');

  // --- every supported size, with a tall tower: the whole tower, cloud and ground stay in view
  for (const vp of ['small', 'phone', 'phoneWide', 'tabletTall', 'tablet']) {
    const p = await t.open(ID, { viewport: vp, dark: vp === 'phoneWide' || vp === 'small' });
    await t.fast(p, 8);
    for (let n = 0; n < 8; n++) await dropAt(p, n % 3 === 1 ? 0.3 : 0.02);
    await aiming(p);
    await p.evaluate(() => { MG.timeScale = 1; });
    await p.waitForTimeout(700);
    assert.ok(await t.noPageScroll(p), `no page scroll @${vp}`);
    const view = await p.evaluate(() => {
      const g = document.querySelector('#mg-game').getBoundingClientRect();
      const out = [];
      document.querySelectorAll('.g-tower .to-tower .to-crate, .g-tower .to-crate--hang, .g-tower .to-puff').forEach((n) => {
        const r = n.getBoundingClientRect();
        if (r.top < g.top - 2 || r.bottom > g.bottom + 2 || r.left < g.left - 2 || r.right > g.right + 2) out.push(n.className + ' ' + [r.left, r.top, r.right, r.bottom].map(Math.round));
      });
      const hang = document.querySelector('.g-tower .to-crate--hang').getBoundingClientRect();
      return { out, crate: Math.round(hang.width) };
    });
    assert.deepStrictEqual(view.out, [], `tower and cloud in view @${vp}`);
    assert.ok(view.crate >= 30, `crates stay visible @${vp} (${view.crate}px)`);
    await t.shot(p, `tower-${vp}.png`);
    if (vp === 'phone') {
      await p.setViewportSize({ width: 844, height: 390 });
      await p.waitForTimeout(700);
      const after = await p.evaluate(() => {
        const g = document.querySelector('#mg-game').getBoundingClientRect();
        return [...document.querySelectorAll('.g-tower .to-tower .to-crate, .g-tower .to-crate--hang')].every((n) => { const r = n.getBoundingClientRect(); return r.top >= g.top - 2 && r.bottom <= g.bottom + 2; });
      });
      assert.ok(after, 'still in view after rotating mid-round');
      await t.fast(p, 8);
      await dropAt(p, 0);
      assert.strictEqual((await api(p, 'crates')).length, 9);
    }
  }

  // --- leaving and coming back mid-fall leaves nothing behind
  page = await t.open(ID);
  for (let i = 0; i < 4; i++) {
    await aiming(page);
    await page.locator('.g-tower .to-scene').tap({ position: { x: 30, y: 40 } });
    await page.evaluate(() => MG.home());
    await page.evaluate(() => MG.open('tower'));
  }
  await aiming(page);
  assert.strictEqual(await page.locator('.g-tower .to-scene').count(), 1);
  assert.strictEqual((await api(page, 'crates')).length, 0);
});
