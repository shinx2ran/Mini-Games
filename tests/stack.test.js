/* Rainbow Stack: pull a block that matches the one on top (colour or picture); it flies to the top. Don't tumble it. */
'use strict';
const h = require('./harness');
const ID = 'stack';

const api = (page, key) => page.evaluate((k) => MG.current.api[k], key);
const picking = (page) => page.waitForFunction(() => MG.current && MG.current.api && MG.current.api.state === 'pick' && !MG.current.ctx.locked, null, { timeout: 30000 });
/** Tap the front end of block `id` like a finger would (on the face, or `dx` px beside it). */
const tapBlock = (page, id, dx = 0, ids = [1]) => page.evaluate(([id, dx, ids]) => {
  const f = MG.current.api.frontEnd(id); const r = f.getBoundingClientRect();
  const target = dx ? document.elementFromPoint(r.left + r.width / 2 + dx, r.top + r.height / 2) || f : f;
  ids.forEach((pid) => target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: pid, pointerType: 'touch', clientX: r.left + r.width / 2 + dx, clientY: r.top + r.height / 2 })));
  return MG.current.api.pulls;
}, [id, dx, ids]);
const safest = (page) => page.evaluate(() => MG.current.api.choices.sort((a, b) => a.risk - b.risk)[0]);

h.run(ID, async (t) => {
  const { assert } = t;

  // --- pure rules
  let page = await t.open(ID);
  await picking(page);
  const r = await page.evaluate(() => {
    const a = MG.current.api, bad = [];
    for (let k = 0; k < 300; k++) {
      const tw = a.makeTower(Math.random);
      if (tw.blocks.length !== a.LEVELS * 3 || tw.levels.length !== a.LEVELS) bad.push('size');
      const wild = tw.blocks.filter((b) => b.wild);
      if (wild.length !== 2) bad.push('wilds');
      if (wild.some((b) => b.id >= (a.LEVELS - 3) * 3)) bad.push('wild too high');
      const looks = new Set(tw.blocks.map((b) => b.color + b.shape));
      if (looks.size < 12) bad.push('variety');
    }
    const L = (rows) => rows.map((r) => r.slice());
    const full = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [9, 10, 11], [12, 13, 14]];
    const thin = L(full); thin[0] = [0, -1, 2]; thin[1] = [-1, 4, -1];
    return {
      bad: bad.slice(0, 3),
      m: [a.matches({ color: 'sun', shape: 'star' }, { color: 'sun', shape: 'dot' }), a.matches({ color: 'sea', shape: 'dot' }, { color: 'sun', shape: 'dot' }),
        a.matches({ color: 'sea', shape: 'peak' }, { color: 'sun', shape: 'dot' }), a.matches({ wild: true, color: 'sea', shape: 'peak' }, { color: 'sun', shape: 'dot' }),
        a.matches({ color: 'sea', shape: 'peak' }, { wild: true, color: 'sun', shape: 'dot' })],
      // what each pull from a full level leaves: two blocks either way round, then the lone middle, then one edge block
      risk: [a.riskOf(full, 0, 1), a.riskOf(full, 0, 0), a.riskOf([[0, -1, 2]].concat(L(full).slice(1)), 0, 0), a.riskOf([[0, 1, -1]].concat(L(full).slice(1)), 0, 0), a.riskOf([[-1, 1, -1]].concat(L(full).slice(1)), 0, 1)],
      weaker: a.riskOf(thin, 2, 1) > a.riskOf(full, 2, 1),
      pullable: [0, 1, 2, 3, 4].map((l) => a.pullable(full, l)),
      next: [a.nextSpot(full), a.nextSpot(L(full).concat([[-1, 7, -1]])), a.nextSpot(L(full).concat([[7, 8, -1]]))],
    };
  });
  assert.deepStrictEqual(r.bad, [], 'every tower: the right size, two rainbow blocks low down, plenty of different looks');
  assert.deepStrictEqual(r.m, [true, true, false, true, true], 'same colour or same picture; rainbow matches anything');
  assert.ok(r.risk[0] < 0.02 && r.risk[1] < 0.05, 'taking one from a full level is safe');
  assert.ok(r.risk[3] > 0.1 && r.risk[3] < 0.2, 'leaving the middle one alone wobbles');
  assert.ok(r.risk[2] > 0.8, 'leaving one edge block alone brings it down');
  assert.strictEqual(r.risk[4], 0.95, 'taking the last block of a level: down it comes');
  assert.ok(r.weaker, 'thin levels below make the whole tower shakier');
  assert.deepStrictEqual(r.pullable, [true, true, true, false, false], 'never from the top two levels');
  assert.deepStrictEqual(r.next, [{ lvl: 5, slot: 1 }, { lvl: 5, slot: 0 }, { lvl: 5, slot: 2 }], 'a new level fills middle first');

  // --- the start: one block to match, the bright ones are exactly the pullable matches, a ghost hand shows one
  const start = await page.evaluate(() => {
    const a = MG.current.api, ok = new Set(a.choices.map((c) => c.id));
    const bright = [...document.querySelectorAll('.g-stack .sk-block:not(.is-off)')].map((n) => +n.dataset.id).sort((x, y) => x - y);
    return { ok: [...ok].sort((x, y) => x - y), bright, turn: a.turn, first: MG.current.ctx.firstPlayer, top: a.top, any: a.any, levels: a.levels.length };
  });
  assert.deepStrictEqual(start.bright, start.ok, 'bright = may be pulled now');
  assert.ok(start.ok.length >= 1);
  assert.strictEqual(start.turn, start.first);
  await page.waitForSelector('.mg-hint', { state: 'attached', timeout: 5000 });

  // --- a dimmed block cannot be pulled, even tapped right on
  const dim = await page.evaluate(() => { const n = document.querySelector('.g-stack .sk-block.is-off'); return n ? +n.dataset.id : -1; });
  if (dim >= 0) {
    await tapBlock(page, dim);
    await page.waitForTimeout(100);
    assert.strictEqual(await api(page, 'pulls'), 0, 'a dimmed block stays put');
  }

  // --- a pull: out it slides and up to the top it goes; now it is the one to match, and it is the other player's turn
  await page.evaluate(() => MG.current.api.rig(0.999)); // it never tumbles from here on, until we say
  let c = await safest(page);
  await tapBlock(page, c.id, 0, [3, 4, 5, 6, 7, 8]);  // six fingers at once: one pull
  assert.strictEqual(await api(page, 'pulls'), 1, 'one pull, however many fingers');
  await picking(page);
  let after = await page.evaluate(() => ({ levels: MG.current.api.levels, top: MG.current.api.topId, turn: MG.current.api.turn }));
  assert.strictEqual(after.top, c.id, 'the pulled block is now the one on top');
  assert.deepStrictEqual(after.levels[after.levels.length - 1], [-1, c.id, -1], 'it went onto a new level, in the middle');
  assert.strictEqual(after.levels[c.lvl][c.slot], -1, 'and left a gap where it was');
  assert.strictEqual(after.turn, 1 - start.turn, 'the other player\'s turn');
  assert.strictEqual(await page.locator('.g-stack .sk-seat.is-turn').getAttribute('data-p'), String(1 - start.turn));
  const tile = await page.evaluate(() => { const t = document.querySelector('.g-stack .sk-tile'); return { shape: t.dataset.shape, wild: t.classList.contains('is-wild') }; });
  const topBlock = await api(page, 'top');
  assert.strictEqual(tile.shape, topBlock.shape, 'the big tile shows the block to match');

  // --- a near miss beside a bright block still counts (it snaps to the nearest bright one)
  c = await safest(page);
  const before = await api(page, 'pulls');
  await page.evaluate((id) => {
    const f = MG.current.api.frontEnd(id), r = f.getBoundingClientRect(), stage = document.querySelector('.g-stack .sk-stage');
    stage.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 31, pointerType: 'touch', clientX: r.right + 14, clientY: r.top + r.height / 2 }));
  }, c.id);
  assert.strictEqual(await api(page, 'pulls'), before + 1, 'a tap just beside a bright block pulls it');
  await picking(page);

  // --- turning the tower: the view turns a quarter, and the front ends are still the ones we can see and tap
  await page.locator('.g-stack .sk-turn').tap();
  assert.strictEqual(await api(page, 'spin'), 1);
  await page.waitForTimeout(700);
  c = await safest(page);
  const seen = await page.evaluate((id) => {
    const f = MG.current.api.frontEnd(id), r = f.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return hit && hit.closest('.sk-block') ? +hit.closest('.sk-block').dataset.id : -1;
  }, c.id);
  assert.strictEqual(seen, c.id, 'the end we tap is the one in front');
  await tapBlock(page, c.id);
  await picking(page);

  // --- the tumble: the other player wins, and every block falls to the floor
  await page.evaluate(() => MG.current.api.rig(0));
  const puller = await api(page, 'turn');
  c = await page.evaluate(() => MG.current.api.choices.sort((a, b) => b.risk - a.risk)[0]);
  await tapBlock(page, c.id);
  await page.waitForFunction(() => MG.current.api.state === 'done', null, { timeout: 10000 });
  assert.strictEqual(await page.locator('.g-stack .sk-block.is-falling').count() > 0, true, 'down it comes');
  assert.strictEqual(await page.locator('.g-stack .sk-block.is-off').count(), 0, 'all its colours for the crash');
  await t.waitForWin(page, 10000);
  assert.strictEqual(await page.locator('.mg-win').getAttribute('data-result'), String(1 - puller), 'the other player wears the crown');

  // --- the first pulls of a round never tumble it, whatever the luck
  page = await t.open(ID);
  await picking(page);
  await page.evaluate(() => MG.current.api.rig(0));
  for (let k = 0; k < 3; k++) {
    await picking(page);
    c = await page.evaluate(() => MG.current.api.choices.sort((a, b) => b.risk - a.risk)[0]);
    await tapBlock(page, c.id);
    await page.waitForTimeout(100);
  }
  await picking(page);
  assert.strictEqual(await api(page, 'pulls'), 3);
  assert.strictEqual(await api(page, 'state'), 'pick', 'still standing after the first three pulls');

  // --- a whole round that never tumbles: the tower grows to the sky and it is a crown each
  page = await t.open(ID);
  await picking(page);
  await page.evaluate(() => MG.current.api.rig(0.999));
  await t.fast(page, 8);
  for (let k = 0; k < 40; k++) {
    await page.waitForFunction(() => MG.current.api.state !== 'pulling' && !MG.current.ctx.locked, null, { timeout: 30000 });
    if ((await api(page, 'state')) !== 'pick') break;
    c = await safest(page);
    await tapBlock(page, c.id);
    await page.waitForTimeout(30);
  }
  await page.waitForFunction(() => MG.current.api.state === 'done', null, { timeout: 30000 });
  assert.strictEqual(await api(page, 'pulls'), await api(page, 'MAX_PULLS'));
  const tall = await page.evaluate(() => {
    const a = MG.current.api, seen = new Set();
    a.levels.forEach((row) => row.forEach((id) => { if (id >= 0) seen.add(id); }));
    return { blocks: seen.size, all: a.blocks.length, levels: a.levels.length };
  });
  assert.strictEqual(tall.blocks, tall.all, 'every block is still in the tower, none lost on the way');
  assert.ok(tall.levels >= 9 + 8, `it grew (${tall.levels} levels)`);
  assert.deepStrictEqual(await t.outsidePlayArea(page, '.g-stack .sk-block:not(.is-falling) .sk-top'), [], 'the whole tall tower still fits on the screen');
  await t.waitForWin(page, 30000);
  assert.strictEqual(await page.locator('.mg-win').getAttribute('data-result'), 'tie');

  // --- a little player who hesitates gets a ghost hand on the steadiest block (help Some)
  page = await t.open(ID);
  await picking(page);
  await page.evaluate(() => MG.current.api.rig(0.999));
  await tapBlock(page, (await safest(page)).id); // (clears the opening hint)
  await picking(page);
  if ((await api(page, 'turn')) !== 0) { await tapBlock(page, (await safest(page)).id); await picking(page); }
  assert.strictEqual(await page.locator('.mg-hint').count(), 0);
  await t.fast(page, 8);
  await page.waitForSelector('.mg-hint', { state: 'attached', timeout: 10000 });
  const hinted = await page.evaluate(() => {
    const hint = document.querySelector('.mg-hint').getBoundingClientRect(), g = document.querySelector('#mg-game').getBoundingClientRect();
    const best = MG.current.api.choices.sort((a, b) => a.risk - b.risk)[0], f = MG.current.api.frontEnd(best.id).getBoundingClientRect();
    return Math.hypot(hint.left - (f.left + f.width / 2), hint.top - (f.top + f.height / 2));
  });
  assert.ok(hinted < 40, `the ghost hand is on the steadiest block (${hinted.toFixed(0)}px off)`);

  // --- every supported size: everything in view, the tower included; rotate mid-round
  for (const vp of ['small', 'phone', 'phoneWide', 'tabletTall', 'tablet']) {
    const p = await t.open(ID, { viewport: vp, dark: vp === 'phoneWide' || vp === 'small' });
    await picking(p);
    await p.waitForTimeout(400);
    assert.ok(await t.noPageScroll(p), `no page scroll @${vp}`);
    assert.deepStrictEqual(await t.outsidePlayArea(p, '.g-stack .sk-seat, .g-stack .sk-match, .g-stack .sk-turn, .g-stack .sk-face'), [], `all in view @${vp}`);
    assert.ok((await t.minTargetSize(p, '.g-stack .sk-turn')).min >= 64, `the turn button is big @${vp}`);
    const ends = await p.evaluate(() => MG.current.api.choices.map((c) => { const r = MG.current.api.frontEnd(c.id).getBoundingClientRect(); return Math.min(r.width, r.height); }));
    assert.ok(Math.min(...ends) >= 16, `block ends are big enough to see @${vp} (${Math.min(...ends).toFixed(0)}px)`);
    // seats and the tile do not overlap the tower's top
    const clear = await p.evaluate(() => {
      const hit = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2;
      const panel = [...document.querySelectorAll('.g-stack .sk-seat, .g-stack .sk-match, .g-stack .sk-turn')].map((n) => n.getBoundingClientRect());
      return [...document.querySelectorAll('.g-stack .sk-top')].filter((f) => panel.some((p) => hit(p, f.getBoundingClientRect()))).length;
    });
    assert.strictEqual(clear, 0, `nothing covers the tower @${vp}`);
    await t.shot(p, `stack-${vp}.png`);
    if (vp === 'phone') {
      await p.setViewportSize({ width: 844, height: 390 });
      await p.waitForTimeout(500);
      assert.deepStrictEqual(await t.outsidePlayArea(p, '.g-stack .sk-seat, .g-stack .sk-match, .g-stack .sk-face'), [], 'still in view after rotating');
      await p.evaluate(() => MG.current.api.rig(0.999));
      const id = await p.evaluate(() => MG.current.api.choices[0].id);
      await tapBlock(p, id);
      assert.strictEqual(await api(p, 'pulls'), 1, 'still playable after rotating');
    }
  }

  // --- reduced motion: no swaying, no bobbing
  page = await t.open(ID, { reducedMotion: true });
  await picking(page);
  assert.strictEqual(await page.evaluate(() => getComputedStyle(document.querySelector('.g-stack .sk-seat.is-turn')).animationName), 'none');

  // --- leaving and coming back mid-pull leaves nothing behind
  page = await t.open(ID);
  for (let i = 0; i < 3; i++) {
    await picking(page);
    await tapBlock(page, (await safest(page)).id);
    await page.evaluate(() => MG.home());
    await page.evaluate(() => MG.open('stack'));
  }
  await picking(page);
  assert.strictEqual(await page.locator('.g-stack .sk-scene').count(), 1);
  assert.strictEqual(await api(page, 'pulls'), 0);
});
