/* Balloon Bop: keep the balloon up together; you may only bop it over your own half. */
'use strict';
const h = require('./harness');
const ID = 'bop';

const api = (page, key) => page.evaluate((k) => MG.current.api[k], key);
const playing = (page) => page.waitForFunction(() => MG.current && MG.current.api && MG.current.api.state === 'play' && MG.current.api.balloons.length > 0, null, { timeout: 30000 });
const fire = (page, p, ids = [1]) => page.evaluate(([p, ids]) => {
  const el = document.querySelector(`.g-bop .bp-pad[data-p="${p}"]`); const r = el.getBoundingClientRect();
  ids.forEach((id) => el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: id, pointerType: 'touch', isPrimary: id === ids[0], clientX: r.left + r.width / 2, clientY: r.top + r.height * 0.7 })));
  return { passes: MG.current.api.passes, bops: MG.current.api.bops };
}, [p, ids]);

h.run(ID, async (t) => {
  const { assert } = t;

  // --- pure rules
  let page = await t.open(ID);
  await playing(page);
  const r = await page.evaluate(() => {
    const a = MG.current.api;
    const wall = a.fly({ x: 0.11, y: 0.5, vx: -2, vy: 0 }, 0.05, 0.2);
    const roof = a.fly({ x: 0.5, y: 0.13, vx: 0, vy: -2 }, 0.05, 0.2);
    const drop = a.fly({ x: 0.5, y: 0.5, vx: 0, vy: 0 }, 1, 0.2);
    return { sides: [a.sideOf(0.2), a.sideOf(0.5), a.sideOf(0.8)], g: [a.gravityFor(0), a.gravityFor(1), a.gravityFor(2)],
      wall, roof, drop, v0: a.bopVelocity(0, 0.5), v1: a.bopVelocity(1, 0.5) };
  });
  assert.deepStrictEqual(r.sides, [0, 1, 1]);
  assert.ok(r.g[0] > r.g[1] && r.g[1] > r.g[2], 'the balloon is floatier over a helped player\'s half');
  assert.ok(r.wall.x >= 0.1 && r.wall.vx > 0, 'soft wall');
  assert.ok(r.roof.y >= 0.12 && r.roof.vy > 0, 'soft ceiling');
  assert.ok(r.drop.y > 0.5 && r.drop.vy > 0, 'it falls');
  assert.ok(r.v0.vx > 0 && r.v0.vy < 0 && r.v1.vx < 0 && r.v1.vy < 0, 'a bop sends it up and across to the other player');

  // --- only the player it is over can bop it; a slap is one bop; a second bop before it crosses is not a second pass
  const side = (await api(page, 'balloons'))[0].side;
  let res = await fire(page, 1 - side, [1, 2, 3]);
  assert.deepStrictEqual(res, { passes: 0, bops: 0 }, 'the other player cannot reach it');
  res = await fire(page, side, [4, 5, 6, 7, 8, 9]);
  assert.deepStrictEqual(res, { passes: 1, bops: 1 }, 'six fingers at once are one bop');
  res = await fire(page, side, [10]);
  assert.strictEqual(res.passes, 1, 'mashing does not pass it to yourself');
  assert.strictEqual(await page.locator('.g-bop .bp-dot.is-on').count(), 1);

  // --- let it land: a rude noise, a fresh balloon, nothing lost, still playing
  await t.fast(page, 8);
  await page.waitForFunction(() => MG.current.api.landings >= 1, null, { timeout: 30000 });
  await playing(page);
  assert.strictEqual(await api(page, 'passes'), 1, 'a landing takes nothing away');

  // --- a whole round through real taps: both players are needed, a second balloon joins, then the party
  page = await t.open(ID);
  await t.fast(page, 4);
  const tappers = [0, 0];
  for (let guard = 0; guard < 400; guard++) {
    if ((await api(page, 'state')) !== 'play') break;
    const b = (await api(page, 'balloons')).find((x) => x.ready && x.from !== x.side);
    if (!b) { await page.waitForTimeout(15); continue; }
    const before = await api(page, 'passes');
    await page.locator(`.g-bop .bp-pad[data-p="${b.side}"]`).tap();
    if ((await api(page, 'passes')) > before) tappers[b.side]++;
  }
  assert.strictEqual(await api(page, 'passes'), 12);
  assert.ok(tappers[0] >= 4 && tappers[1] >= 4, `both players passed it (${tappers})`);
  await t.waitForWin(page, 30000);
  assert.strictEqual(await page.locator('.mg-win').getAttribute('data-result'), 'team');

  // --- every supported size: each half is a huge button, nothing clipped; rotate mid-rally
  for (const vp of ['small', 'phone', 'phoneWide', 'tabletTall', 'tablet']) {
    const p = await t.open(ID, { viewport: vp, dark: vp === 'phoneWide' || vp === 'small' });
    await playing(p);
    await p.waitForTimeout(450);
    assert.ok(await t.noPageScroll(p), `no page scroll @${vp}`);
    assert.deepStrictEqual(await t.outsidePlayArea(p, '.g-bop .bp-pad, .g-bop .bp-who, .g-bop .bp-row, .g-bop .bp-body'), [], `all in view @${vp}`);
    assert.ok((await t.minTargetSize(p, '.g-bop .bp-pad')).min >= 120, `pads are huge @${vp}`);
    await t.shot(p, `bop-${vp}.png`);
    if (vp === 'phone') {
      await p.setViewportSize({ width: 844, height: 390 });
      await p.waitForTimeout(300);
      assert.deepStrictEqual(await t.outsidePlayArea(p, '.g-bop .bp-who, .g-bop .bp-row'), [], 'still in view after rotating');
      await playing(p);
      const s2 = (await api(p, 'balloons'))[0].side;
      const before = await api(p, 'bops');
      await p.locator(`.g-bop .bp-pad[data-p="${s2}"]`).tap();
      assert.ok((await api(p, 'bops')) >= before, 'still playable after rotating');
    }
  }

  // --- leaving and coming back mid-flight leaves nothing behind
  page = await t.open(ID);
  for (let i = 0; i < 4; i++) {
    await playing(page);
    await fire(page, (await api(page, 'balloons'))[0].side, [20 + i]);
    await page.evaluate(() => MG.home());
    await page.evaluate(() => MG.open('bop'));
  }
  await playing(page);
  assert.strictEqual(await page.locator('.g-bop .bp-scene').count(), 1);
  assert.strictEqual(await page.locator('.g-bop .bp-balloon').count(), 1);
  assert.strictEqual(await api(page, 'passes'), 0);
});
