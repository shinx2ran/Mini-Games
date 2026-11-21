/* Wobble Tray: roll the ladybird to each strawberry, by tilting the phone or by finger. */
'use strict';
const h = require('./harness');
const ID = 'tray';

const api = (page, key) => page.evaluate((k) => MG.current.api[k], key);
const playing = (page) => page.waitForFunction(() => MG.current && MG.current.api && MG.current.api.state === 'play', null, { timeout: 30000 });
/** Screen position of a point given in the game's own units. */
const spot = (page, pt) => page.evaluate((pt) => {
  const r = document.querySelector('.g-tray .ty-board').getBoundingClientRect(); const s = MG.current.api.size;
  return { x: r.left + pt.x / s.W * r.width, y: r.top + pt.y / s.H * r.height };
}, pt);
const tilt = (page, beta, gamma) => page.evaluate(([b, g]) => window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta: b, gamma: g })), [beta, gamma]);

h.run(ID, async (t) => {
  const { assert } = t;

  // --- pure rules
  let page = await t.open(ID);
  const r = await page.evaluate(() => {
    const a = MG.current.api;
    const right = a.roll({ x: 0.5, y: 0.5, vx: 0, vy: 0 }, { x: 1, y: 0 }, 0.1, 1, 1.6);
    const wall = a.roll({ x: 0.93, y: 0.5, vx: 3, vy: 0 }, { x: 0, y: 0 }, 0.1, 1, 1.6);
    let glide = { x: 0.5, y: 0.5, vx: 1, vy: 0 }; for (let i = 0; i < 300; i++) glide = a.roll(glide, { x: 0, y: 0 }, 0.016, 5, 5);
    const spots = []; for (let i = 0; i < 300; i++) spots.push(a.berrySpot({ x: 0.5, y: 0.8 }, 1, 1.6));
    return {
      right, wall, rest: Math.abs(glide.vx) < 0.01,
      tilts: [a.pushFromTilt({ x: 8, y: -40 }), a.pushFromTilt({ x: 0, y: 0 })],
      none: a.pushFromFingers({ x: 0.5, y: 0.5 }, []),
      one: a.pushFromFingers({ x: 0.2, y: 0.5 }, [{ x: 0.9, y: 0.5 }]),
      tug: a.pushFromFingers({ x: 0.5, y: 0.5 }, [{ x: 0.1, y: 0.5 }, { x: 0.9, y: 0.5 }]),
      spotsOk: spots.every((s) => s.x >= 0.14 && s.x <= 0.86 && s.y >= 0.14 && s.y <= 1.46),
      far: spots.filter((s) => Math.hypot(s.x - 0.5, s.y - 0.8) > 0.3).length / spots.length,
    };
  });
  assert.ok(r.right.vx > 0 && r.right.x > 0.5 && r.right.vy === 0, 'a push to the right rolls right');
  assert.ok(r.wall.x <= 0.93 && r.wall.vx < 0, 'the rim is a soft bounce');
  assert.ok(r.rest, 'left alone, she rolls to a stop');
  assert.deepStrictEqual(r.tilts, [{ x: 0.5, y: -1 }, { x: 0, y: 0 }]);
  assert.deepStrictEqual(r.none, { x: 0, y: 0 });
  assert.ok(r.one.x > 0.9 && Math.abs(r.one.y) < 1e-9, 'one finger pulls her towards it');
  assert.ok(Math.abs(r.tug.x) < 1e-9, 'two fingers pull her to the middle between them');
  assert.ok(r.spotsOk && r.far > 0.9, 'strawberries land on the tray, away from the ladybird');

  // --- where tilting could work, she is asked: tilt or finger. Finger: hold where she should go.
  assert.strictEqual(await api(page, 'state'), 'ask');
  assert.strictEqual(await page.locator('.g-tray .ty-ask .mg-btn').count(), 2);
  await page.locator('.g-tray .ty-ask .mg-btn').nth(1).click();
  await playing(page);
  assert.strictEqual(await api(page, 'mode'), 'touch');
  await page.waitForSelector('.mg-hint', { state: 'attached', timeout: 5000 }); // a ghost hand points at the strawberry
  await t.fast(page, 4);
  for (let n = 1; n <= 8; n++) {
    const b = await spot(page, await api(page, 'berry'));
    await page.mouse.move(b.x, b.y);
    await page.mouse.down();
    await page.waitForFunction((n) => MG.current.api.eaten >= n, n, { timeout: 30000 });
    await page.mouse.up();
    assert.strictEqual(await api(page, 'fingers'), 0, 'lifting the finger lets go');
  }
  await t.waitForWin(page, 30000);
  assert.strictEqual(await page.locator('.mg-win').getAttribute('data-result'), 'team');
  assert.strictEqual(await page.locator('.g-tray .ty-slot.is-on').count(), 8);

  // --- tilt: real sensor events steer her (and the first reading counts as "flat")
  page = await t.open(ID);
  await page.locator('.g-tray .ty-ask .mg-btn').nth(0).click();
  for (let i = 0; i < 6; i++) { await tilt(page, 20, 0); await page.waitForTimeout(60); } // held at a comfy 20 degrees
  await playing(page);
  assert.strictEqual(await api(page, 'mode'), 'tilt');
  await page.waitForTimeout(400);
  const still = await api(page, 'ball');
  assert.ok(Math.abs(still.y - (await api(page, 'size')).H / 2) < 0.05, 'the way it is held at the start is "flat"');
  await t.fast(page, 4);
  for (let n = 1; n <= 3; n++) {
    for (let guard = 0; guard < 400 && (await api(page, 'eaten')) < n; guard++) {
      const s = await page.evaluate(() => ({ ball: MG.current.api.ball, berry: MG.current.api.berry }));
      if (!s.berry) break;
      const dx = s.berry.x - s.ball.x, dy = s.berry.y - s.ball.y;
      await tilt(page, 20 + Math.max(-14, Math.min(14, dy * 60)), Math.max(-14, Math.min(14, dx * 60)));
      await page.waitForTimeout(20);
    }
    assert.ok((await api(page, 'eaten')) >= n, `tilting reaches strawberry ${n}`);
  }

  // --- no sensor behind the API (a laptop): choosing Tilt quietly falls back to fingers
  page = await t.open(ID);
  await page.locator('.g-tray .ty-ask .mg-btn').nth(0).click();
  await playing(page);
  assert.strictEqual(await api(page, 'mode'), 'touch');

  // --- the sandboxed build never asks: straight to finger steering
  page = await t.open(null, { page: 'tests/play.html?g=tray' });
  await page.addInitScript(() => { window.MG_SANDBOX = true; });
  await page.reload();
  await page.waitForFunction(() => window.MG && document.querySelector('#mg-home'));
  await page.evaluate(() => MG.open('tray'));
  await playing(page);
  assert.strictEqual(await page.locator('.g-tray .ty-ask').count(), 0);
  assert.strictEqual(await api(page, 'mode'), 'touch');

  // --- every supported size: the tray, the row and everything on it stay in view; rotate mid-round
  for (const vp of ['small', 'phone', 'phoneWide', 'tabletTall', 'tablet']) {
    const p = await t.open(ID, { viewport: vp, dark: vp === 'phoneWide' || vp === 'small' });
    assert.deepStrictEqual(await t.outsidePlayArea(p, '.g-tray .ty-ask .mg-btn'), [], `the question fits @${vp}`);
    assert.ok((await t.minTargetSize(p, '.g-tray .ty-ask .mg-btn')).min >= 90, `the two choices are big @${vp}`);
    if (vp === 'phone') await t.shot(p, 'tray-ask-phone.png');
    await p.locator('.g-tray .ty-ask .mg-btn').nth(1).click();
    await playing(p);
    await p.waitForTimeout(500);
    assert.ok(await t.noPageScroll(p), `no page scroll @${vp}`);
    assert.deepStrictEqual(await t.outsidePlayArea(p, '.g-tray .ty-board, .g-tray .ty-row, .g-tray .ty-berry .mg-sticker, .g-tray .ty-bug .mg-sticker'), [], `all in view @${vp}`);
    await t.shot(p, `tray-${vp}.png`);
    if (vp === 'phone') {
      const before = await p.evaluate(() => ({ b: MG.current.api.berry, s: MG.current.api.size }));
      await p.setViewportSize({ width: 844, height: 390 });
      await p.waitForTimeout(300);
      const after = await p.evaluate(() => ({ b: MG.current.api.berry, s: MG.current.api.size }));
      assert.ok(Math.abs(before.b.x / before.s.W - after.b.x / after.s.W) < 0.01, 'the strawberry keeps its place when the screen turns');
      assert.deepStrictEqual(await t.outsidePlayArea(p, '.g-tray .ty-berry .mg-sticker, .g-tray .ty-bug .mg-sticker'), [], 'still in view after rotating');
    }
  }

  // --- leaving and coming back leaves nothing behind
  page = await t.open(ID);
  for (let i = 0; i < 3; i++) {
    await page.locator('.g-tray .ty-ask .mg-btn').nth(1).click();
    await playing(page);
    await page.evaluate(() => MG.home());
    await page.evaluate(() => MG.open('tray'));
  }
  assert.strictEqual(await page.locator('.g-tray .ty-scene').count(), 1);
  assert.strictEqual(await api(page, 'state'), 'ask');
});
