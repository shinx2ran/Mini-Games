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
    const low = a.fly({ x: 0.5, y: 0.41, vx: 0, vy: -2 }, 0.05, 0.3, 0.4);
    const hang = a.fly({ x: 0.5, y: 0.5, vx: 0, vy: 0 }, 1, 0.2, null, null, true), hangUp = a.fly({ x: 0.5, y: 0.5, vx: 0, vy: -0.3 }, 0.1, 0.2, null, null, true);
    return { sides: [a.sideOf(0.2), a.sideOf(0.5), a.sideOf(0.8)], g: [a.gravityFor(0), a.gravityFor(1), a.gravityFor(2)],
      wall, roof, drop, low, hang, hangUp, v0: a.bopVelocity(0, 0.5), v1: a.bopVelocity(1, 0.5),
      wide: a.fly({ x: 0.21, y: 0.5, vx: -2, vy: 0 }, 0.05, 0.2, null, 0.2), wideR: a.fly({ x: 0.79, y: 0.5, vx: 2, vy: 0 }, 0.05, 0.2, null, 0.2),
      can: [a.canBop({ x: 0.2, vy: 0.1, cool: 0 }, 0, 5), a.canBop({ x: 0.2, vy: 0.1, cool: 0 }, 1, 5), a.canBop({ x: 0.2, vy: -0.4, cool: 0 }, 0, 5), a.canBop({ x: 0.2, vy: 0.1, cool: 9 }, 0, 5),
        a.canBop({ x: 0.2, vy: 0.1, cool: 0, from: 0 }, 0, 5), a.canBop({ x: 0.2, vy: 0.1, cool: 0, from: 1 }, 0, 5)] };
  });
  assert.deepStrictEqual(r.sides, [0, 1, 1]);
  assert.ok(r.g[0] > r.g[1] && r.g[1] > r.g[2], 'the balloon is floatier over a helped player\'s half');
  assert.ok(r.wall.x >= 0.1 && r.wall.vx > 0, 'soft wall');
  assert.ok(r.roof.y >= 0.12 && r.roof.vy > 0, 'soft ceiling');
  assert.ok(r.low.y >= 0.4 && r.low.vy > 0, 'the ceiling can be lowered for a big balloon on a short screen');
  assert.ok(r.wide.x >= 0.2 && r.wide.vx > 0 && r.wideR.x <= 0.8 && r.wideR.vx < 0, 'the side walls can be moved in for a big balloon on a narrow screen');
  assert.deepStrictEqual(r.can, [true, false, false, false, false, true], 'yours to bop only over your half, once it has stopped rising and rested, and never your own bop coming back');
  assert.ok(r.drop.y > 0.5 && r.drop.vy > 0, 'it falls');
  assert.ok(r.hang.y === 0.5 && r.hang.vy === 0 && r.hangUp.y < 0.5, 'while it rests after a bop it may rise but never fall');
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
  // while it rests after a bop it never starts to fall (it hangs at the top instead), and the bopper's half stays dark
  const rest = await page.evaluate(([side]) => new Promise((resolve) => {
    const t0 = MG.current.ctx.time; let last = null, fell = 0, lit = 0;
    (function watch() {
      const b = MG.current.api.balloons[0];
      if (b && last != null) fell = Math.max(fell, b.y - last);
      if (b) last = b.y;
      if (document.querySelector(`.g-bop .bp-pad[data-p="${side}"]`).classList.contains('is-mine')) lit++;
      if (MG.current.ctx.time - t0 > 0.8) resolve({ fell, lit }); else requestAnimationFrame(watch);
    })();
  }), [side]);
  assert.ok(rest.fell <= 1e-9, `the balloon does not start falling before anyone may bop it (${rest.fell})`);
  assert.strictEqual(rest.lit, 0, 'a half never lights up for the balloon its own player just sent away');

  // --- let it land: a rude noise, a fresh balloon, nothing lost, still playing
  await t.fast(page, 8);
  await page.waitForFunction(() => MG.current.api.landings >= 1, null, { timeout: 30000 });
  await playing(page);
  assert.strictEqual(await api(page, 'passes'), 1, 'a landing takes nothing away');

  // --- a whole round through real taps: both players are needed, a second balloon joins, then the party
  page = await t.open(ID);
  await t.fast(page, 4);
  const tappers = [0, 0];
  for (let guard = 0; guard < 6000; guard++) {
    if ((await api(page, 'state')) !== 'play') break;
    const b = (await api(page, 'balloons')).find((x) => x.ready && x.from !== x.side);
    if (!b) { await page.waitForTimeout(15); continue; }
    const before = await api(page, 'passes');
    await page.locator(`.g-bop .bp-pad[data-p="${b.side}"]`).tap();
    if ((await api(page, 'passes')) > before) tappers[b.side]++;
  }
  assert.strictEqual(await api(page, 'passes'), 24);
  assert.strictEqual(await page.locator('.g-bop .bp-pad.is-mine').count(), 0, 'when the ladder is full no half is left lit');
  assert.strictEqual(await page.locator('.g-bop .bp-dot.is-on').count(), 24);
  assert.ok(tappers[0] >= 8 && tappers[1] >= 8, `both players passed it (${tappers})`);
  const took = await page.evaluate(() => MG.current.ctx.time);
  // this bot has no reaction time at all; people take about twice as long
  assert.ok(took >= 15, `a rally is long enough to settle into, even bopping the instant it is yours (${took.toFixed(0)}s)`);
  await t.waitForWin(page, 30000);
  assert.strictEqual(await page.locator('.mg-win').getAttribute('data-result'), 'team');

  // --- every supported size: each half is a huge button, nothing clipped; rotate mid-rally
  for (const vp of ['small', 'phone', 'phoneWide', 'tabletTall', 'tablet']) {
    const p = await t.open(ID, { viewport: vp, dark: vp === 'phoneWide' || vp === 'small' });
    await playing(p);
    await p.waitForTimeout(450);
    assert.ok(await t.noPageScroll(p), `no page scroll @${vp}`);
    assert.deepStrictEqual(await t.outsidePlayArea(p, '.g-bop .bp-pad, .g-bop .bp-who, .g-bop .bp-ladder, .g-bop .bp-body'), [], `all in view @${vp}`);
    // bop it and watch it to the top of its flight: the whole balloon stays on the mat, and a half is lit exactly when its player can bop
    await p.locator(`.g-bop .bp-pad[data-p="${(await api(p, 'balloons'))[0].side}"]`).tap();
    for (let k = 0; k < 14; k++) {
      await p.waitForTimeout(90);
      assert.deepStrictEqual(await t.outsidePlayArea(p, '.g-bop .bp-body'), [], `the balloon is whole at the top of its flight @${vp}`);
      const lit = await p.evaluate(() => ({
        pads: [...document.querySelectorAll('.g-bop .bp-pad')].map((el) => el.classList.contains('is-mine')),
        want: [0, 1].map((i) => MG.current.api.balloons.some((b) => b.side === i && b.ready)),
      }));
      assert.deepStrictEqual(lit.pads, lit.want, `each half lights up exactly when it has a balloon to bop @${vp}`);
    }
    assert.ok((await t.minTargetSize(p, '.g-bop .bp-pad')).min >= 120, `pads are huge @${vp}`);
    await t.shot(p, `bop-${vp}.png`);
    // ...and a whole rally, watched at every frame: no balloon is ever cut off at a side, the top or the bottom
    await t.fast(p, 4);
    const rally = await p.evaluate(() => new Promise((resolve) => {
      const scene = document.querySelector('.g-bop .bp-scene');
      const pad = (i) => document.querySelector(`.g-bop .bp-pad[data-p="${i}"]`);
      let out = 0, frames = 0, id = 100, side = [0, 0];
      (function bot() {
        const a = MG.current.api, s = scene.getBoundingClientRect();
        document.querySelectorAll('.g-bop .bp-balloon:not(.is-flat) .bp-body').forEach((el) => {
          const r = el.getBoundingClientRect();
          out = Math.max(out, s.left - r.left, r.right - s.right, s.top - r.top, r.bottom - s.bottom);
          side = [Math.max(side[0], s.left - r.left), Math.max(side[1], r.right - s.right)];
        });
        frames++;
        if (a.state !== 'play' || a.passes >= 12 || frames > 4000) { resolve({ out, frames, passes: a.passes, side }); return; }
        a.balloons.forEach((b) => {
          if (!b.ready) return;
          const el = pad(b.side), r = el.getBoundingClientRect();
          el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: id++, pointerType: 'touch', isPrimary: true, clientX: r.left + r.width / 2, clientY: r.top + r.height * 0.7 }));
        });
        requestAnimationFrame(bot);
      })();
    }));
    assert.ok(rally.passes >= 12, `the rally got going @${vp} (${rally.passes})`);
    assert.ok(rally.out <= 0.5, `no balloon is ever cut off during a rally @${vp} (${rally.out.toFixed(1)}px over; sides ${rally.side.map((v) => v.toFixed(1))})`);
    await p.evaluate(() => { MG.timeScale = 1; });
    if (vp === 'phone') {
      await p.setViewportSize({ width: 844, height: 390 });
      await p.waitForTimeout(300);
      assert.deepStrictEqual(await t.outsidePlayArea(p, '.g-bop .bp-who, .g-bop .bp-ladder'), [], 'still in view after rotating');
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
