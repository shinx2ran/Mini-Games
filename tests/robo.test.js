/* Robo Path: program your robot with up to three arrows, run it, pick strawberries, bonk into trees. */
'use strict';
const h = require('./harness');
const ID = 'robo';

const api = (page, key) => page.evaluate((k) => MG.current.api[k], key);
const planning = (page) => page.waitForFunction(() => MG.current && MG.current.api && MG.current.api.state === 'plan' && !MG.current.ctx.locked, null, { timeout: 30000 });
const press = (page, sel, ids = [1]) => page.evaluate(([sel, ids]) => {
  const b = document.querySelector('.g-robo ' + sel), r = b.getBoundingClientRect();
  ids.forEach((id) => b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: id, pointerType: 'touch', clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })));
}, [sel, ids]);
async function program(page, moves) {
  for (const m of moves) { await press(page, `.rb-arrow[data-m="${m}"]`); await page.waitForTimeout(140); }
}

h.run(ID, async (t) => {
  const { assert } = t;

  // --- pure rules
  let page = await t.open(ID);
  await planning(page);
  const r = await page.evaluate(() => {
    const a = MG.current.api, bad = [];
    for (let k = 0; k < 400; k++) {
      const f = a.makeField(Math.random), tr = Object.keys(f.trees), be = Object.keys(f.berries);
      if (tr.length !== 5 || be.length !== a.BERRIES) bad.push('counts');
      if (be.some((b) => f.trees[b])) bad.push('berry on a tree');
      if (!a.allReachable(f.trees, [f.starts[0]]) || !a.allReachable(f.trees, [f.starts[1]])) bad.push('cut off');
      f.starts.forEach((s) => { if (f.trees[a.key(s.x, s.y)] || f.berries[a.key(s.x, s.y)]) bad.push('start taken'); });
    }
    const trees = { '1,4': true };
    return {
      bad: bad.slice(0, 3),
      edge: a.simulate({ x: 0, y: 5 }, ['left', 'down', 'up'], {}, null),
      tree: a.simulate({ x: 1, y: 5 }, ['up', 'right', 'up'], trees, null),
      bot: a.simulate({ x: 3, y: 5 }, ['right', 'up'], {}, { x: 4, y: 5 }),
      best: a.bestFirstMove({ x: 0, y: 5 }, {}, { '0,2': true, '5,5': true }, null),
      none: a.bestFirstMove({ x: 0, y: 5 }, {}, {}, null),
    };
  });
  assert.deepStrictEqual(r.bad, [], 'every field: 8 strawberries, 5 trees, nobody boxed in, every square reachable');
  assert.deepStrictEqual(r.edge, [{ x: 0, y: 5, bonk: true }, { x: 0, y: 5, bonk: true }, { x: 0, y: 4, bonk: false }], 'the edge is a bonk; the robot stays and carries on');
  assert.deepStrictEqual(r.tree, [{ x: 1, y: 5, bonk: true }, { x: 2, y: 5, bonk: false }, { x: 2, y: 4, bonk: false }], 'so is a tree');
  assert.deepStrictEqual(r.bot, [{ x: 3, y: 5, bonk: true }, { x: 3, y: 4, bonk: false }], 'and the other robot');
  assert.strictEqual(r.best, 'up', 'the nearest strawberry');
  assert.strictEqual(r.none, null);

  // --- planning: arrows fill the three slots (two fingers at once: one move), footprints show the way; take back; go
  const first = await api(page, 'turn');
  assert.strictEqual(first, await page.evaluate(() => MG.current.ctx.firstPlayer));
  await page.waitForSelector('.mg-hint', { state: 'attached', timeout: 5000 });
  assert.strictEqual(await page.locator('.g-robo .rb-go').getAttribute('aria-disabled'), 'true', 'nothing to run yet');
  await press(page, '.rb-arrow[data-m="up"]', [5, 6]);
  assert.deepStrictEqual(await api(page, 'program'), ['up'], 'two fingers at once: one move');
  // ...but two DIFFERENT arrows in quick succession are two moves
  await press(page, '.rb-arrow[data-m="right"]');
  assert.deepStrictEqual(await api(page, 'program'), ['up', 'right'], 'quick taps on different arrows both count');
  await press(page, '.rb-undo');
  await page.waitForTimeout(140);
  await program(page, ['right', 'up', 'left']);
  assert.deepStrictEqual(await api(page, 'program'), ['up', 'right', 'up'], 'three moves at most');
  assert.strictEqual(await page.locator('.g-robo .rb-step').count(), 3, 'a footprint for each move');
  assert.strictEqual(await page.locator('.g-robo .rb-arrow[aria-disabled="true"]').count(), 4, 'the arrows rest when the plan is full');
  await press(page, '.rb-undo');
  assert.deepStrictEqual(await api(page, 'program'), ['up', 'right']);
  await press(page, '.rb-undo');
  await press(page, '.rb-undo');
  assert.deepStrictEqual(await api(page, 'program'), []);

  // --- a run: the robot does the moves one by one and picks up what it rolls over; then the other player's turn
  const route = await page.evaluate(() => MG.current.api.route(3));
  const before = await page.evaluate(() => ({ bots: MG.current.api.bots, berries: MG.current.api.berries, got: MG.current.api.got }));
  await program(page, route);
  const expect = await page.evaluate(([route, first]) => {
    const a = MG.current.api, trees = {}; a.trees.forEach((k) => { trees[k] = true; });
    const path = a.simulate(a.bots[first], route, trees, a.bots[1 - first]);
    const left = new Set(a.berries); let n = 0;
    path.forEach((p) => { const k = a.key(p.x, p.y); if (left.has(k)) { left.delete(k); n++; } });
    return { end: path[path.length - 1], n };
  }, [route, first]);
  await press(page, '.rb-go', [7, 8, 9, 10, 11, 12]);
  assert.strictEqual(await api(page, 'state'), 'run');
  await planning(page);
  const after = await page.evaluate(() => ({ bots: MG.current.api.bots, got: MG.current.api.got, turn: MG.current.api.turn, berries: MG.current.api.berries.length }));
  assert.deepStrictEqual(after.bots[first], { x: expect.end.x, y: expect.end.y }, 'it went where the footprints said');
  assert.strictEqual(after.got[first], expect.n, 'six fingers on go: it ran once and picked them up once');
  assert.strictEqual(after.berries, before.berries.length - expect.n);
  assert.strictEqual(after.turn, 1 - first);
  assert.strictEqual(await page.locator(`.g-robo .rb-basket[data-p="${first}"] .rb-got`).count(), expect.n, 'they are in her basket, one sticker each');

  // --- a bonk: driving into the edge is a funny shake, not a move
  const me = await api(page, 'turn');
  const edgeMove = await page.evaluate((me) => { const b = MG.current.api.bots[me]; return b.y === 5 ? 'down' : b.x === 0 ? 'left' : b.x === 5 ? 'right' : 'up'; }, me);
  const at = (await api(page, 'bots'))[me];
  await program(page, [edgeMove]);
  if ((await api(page, 'bots'))[me].y === 0 && edgeMove === 'up') {} // (up only bonks on the top row)
  await press(page, '.rb-go');
  await page.waitForTimeout(500);
  assert.ok(await page.locator(`.g-robo .rb-bot[data-p="${me}"].is-bonk`).count(), 'bonk');
  await planning(page);
  if (edgeMove !== 'up') assert.deepStrictEqual((await api(page, 'bots'))[me], at, 'it stayed put');

  // --- a whole game, both playing the shortest way to a strawberry: when the last one is picked, more wins
  await t.fast(page, 8);
  for (let k = 0; k < 60; k++) {
    if ((await api(page, 'state')) === 'done') break;
    await planning(page).catch(() => {});
    if ((await api(page, 'state')) !== 'plan') break;
    const mv = await page.evaluate(() => MG.current.api.route(3));
    await program(page, mv.length ? mv : ['up']);
    await press(page, '.rb-go');
    await page.waitForFunction(() => MG.current.api.state !== 'run', null, { timeout: 15000 });
  }
  assert.strictEqual(await api(page, 'state'), 'done');
  const got = await api(page, 'got');
  assert.strictEqual(got[0] + got[1], 8, 'every strawberry picked, none twice');
  await t.waitForWin(page, 15000);
  assert.strictEqual(await page.locator('.mg-win').getAttribute('data-result'), got[0] === got[1] ? 'tie' : got[0] > got[1] ? '0' : '1');

  // --- the most help: a strawberry right next to where a little player stops hops into her robot
  {
    let checked = false;
    for (let tries = 0; tries < 8 && !checked; tries++) {
      page = await t.open(null, { page: 'tests/play.html?g=robo' });
      await page.evaluate(() => MG.store.set('help', 2));
      await page.reload();
      await page.waitForFunction(() => window.MG && document.querySelector('#mg-home'));
      await page.evaluate(() => MG.open('robo'));
      await planning(page);
      const little = await page.evaluate(() => MG.current.ctx.players.findIndex((p) => p.little));
      if ((await api(page, 'turn')) !== little) continue;
      // a route that ENDS on a strawberry within three moves: stop one move short of it
      const plan = await page.evaluate(() => {
        const a = MG.current.api, mv = a.route(3); if (mv.length < 2) return null;
        const trees = {}; a.trees.forEach((k) => { trees[k] = true; });
        const path = a.simulate(a.bots[a.turn], mv, trees, a.bots[1 - a.turn]), end = path[path.length - 1];
        return a.berries.includes(a.key(end.x, end.y)) ? mv.slice(0, -1) : null;
      });
      if (!plan) continue;
      const g0 = (await api(page, 'got'))[little];
      const passing = await page.evaluate(([plan, little]) => {
        const a = MG.current.api, trees = {}; a.trees.forEach((k) => { trees[k] = true; });
        const left = new Set(a.berries); let n = 0;
        a.simulate(a.bots[little], plan, trees, a.bots[1 - little]).forEach((p) => { if (left.delete(a.key(p.x, p.y))) n++; });
        return n;
      }, [plan, little]);
      await program(page, plan);
      await press(page, '.rb-go');
      await page.waitForFunction(() => MG.current.api.state !== 'run', null, { timeout: 15000 });
      assert.ok((await api(page, 'got'))[little] >= g0 + passing + 1, 'the strawberry next to her hopped in');
      checked = true;
    }
    assert.ok(checked, 'found a field to check the help on');
  }

  // --- every supported size: the field, the controls and both baskets in view; keys big; turn the screen mid-run
  for (const vp of ['small', 'phone', 'phoneWide', 'tabletTall', 'tablet']) {
    const p = await t.open(ID, { viewport: vp, dark: vp === 'phoneWide' || vp === 'small' });
    await planning(p);
    assert.ok(await t.noPageScroll(p), `no page scroll @${vp}`);
    assert.deepStrictEqual(await t.outsidePlayArea(p, '.g-robo .rb-field, .g-robo .rb-key, .g-robo .rb-basket, .g-robo .rb-slots'), [], `all in view @${vp}`);
    assert.ok((await t.minTargetSize(p, '.g-robo .rb-key')).min >= 54, `the buttons are big @${vp}`);
    const side = await p.evaluate(() => document.querySelector('.g-robo .rb-field').getBoundingClientRect().width);
    assert.ok(side >= 180, `the field is a good size @${vp} (${side.toFixed(0)}px)`);
    const overlap = await p.evaluate(() => {
      const hit = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
      const f = document.querySelector('.g-robo .rb-field').getBoundingClientRect();
      return [...document.querySelectorAll('.g-robo .rb-key, .g-robo .rb-basket, .g-robo .rb-slots')].filter((n) => hit(n.getBoundingClientRect(), f)).length;
    });
    assert.strictEqual(overlap, 0, `nothing covers the field @${vp}`);
    const mv = await p.evaluate(() => MG.current.api.route(3));
    await program(p, mv);
    await p.waitForTimeout(200);
    await t.shot(p, `robo-${vp}.png`);
    if (vp === 'phone') {
      const who = await api(p, 'turn');
      await press(p, '.rb-go');
      await p.waitForTimeout(500);
      await p.setViewportSize({ width: 844, height: 390 });
      await planning(p);
      assert.deepStrictEqual(await t.outsidePlayArea(p, '.g-robo .rb-field, .g-robo .rb-key, .g-robo .rb-basket'), [], 'still in view after rotating');
      const off = await p.evaluate((who) => {
        const a = MG.current.api, b = a.bots[who], f = document.querySelector('.g-robo .rb-field').getBoundingClientRect(), n = document.querySelectorAll('.g-robo .rb-bot')[who].getBoundingClientRect();
        return Math.hypot((n.left + n.right) / 2 - (f.left + (b.x + 0.5) / a.SIZE * f.width), (n.top + n.bottom) / 2 - (f.top + (b.y + 0.5) / a.SIZE * f.height));
      }, who);
      assert.ok(off < 8, `the robot is on its square after turning (${off.toFixed(0)}px off)`);
    }
  }

  // --- reduced motion: the go button does not pulse
  page = await t.open(ID, { reducedMotion: true });
  await planning(page);
  await program(page, ['up']);
  assert.strictEqual(await page.evaluate(() => getComputedStyle(document.querySelector('.g-robo .rb-go')).animationName), 'none');

  // --- leaving and coming back mid-run leaves nothing behind
  page = await t.open(ID);
  for (let i = 0; i < 3; i++) {
    await planning(page);
    await program(page, ['up', 'up']);
    await press(page, '.rb-go');
    await page.waitForTimeout(500);
    await page.evaluate(() => MG.home());
    await page.evaluate(() => MG.open('robo'));
  }
  await planning(page);
  assert.strictEqual(await page.locator('.g-robo .rb-scene').count(), 1);
  assert.deepStrictEqual(await api(page, 'got'), [0, 0]);
});
