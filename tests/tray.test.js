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
    const wall = a.roll({ x: 0.9, y: 0.5, vx: 3, vy: 0 }, { x: 0, y: 0 }, 0.1, 1, 1.6);
    let glide = { x: 0.5, y: 0.5, vx: 1, vy: 0 }; for (let i = 0; i < 300; i++) glide = a.roll(glide, { x: 0, y: 0 }, 0.016, 5, 5);
    const spots = []; for (let i = 0; i < 300; i++) spots.push(a.berrySpot({ x: 0.5, y: 0.8 }, 1, 1.6));
    return {
      right, wall, rest: Math.abs(glide.vx) < 0.01,
      tilts: [a.pushFromTilt({ x: 8, y: -40 }), a.pushFromTilt({ x: 0, y: 0 })],
      none: a.pushFromFingers({ x: 0.5, y: 0.5 }, []),
      one: a.pushFromFingers({ x: 0.2, y: 0.5 }, [{ x: 0.9, y: 0.5 }]),
      toRight: a.pushFromFingers({ x: 0.5, y: 0.5 }, [{ x: 0.1, y: 0.5 }, { x: 0.9, y: 0.5 }], { x: 0.95, y: 0.5 }),
      toLeft: a.pushFromFingers({ x: 0.5, y: 0.5 }, [{ x: 0.1, y: 0.5 }, { x: 0.9, y: 0.5 }], { x: 0.05, y: 0.5 }),
      spotsOk: spots.every((s) => s.x >= 0.14 && s.x <= 0.86 && s.y >= 0.14 && s.y <= 1.46),
      far: spots.filter((s) => Math.hypot(s.x - 0.5, s.y - 0.8) > 0.3).length / spots.length,
    };
  });
  assert.ok(r.right.vx > 0 && r.right.x > 0.5 && r.right.vy === 0, 'a push to the right rolls right');
  assert.ok(r.wall.x <= 0.9 && r.wall.vx < 0, 'the rim is a soft bounce');
  assert.ok(r.rest, 'left alone, she rolls to a stop');
  assert.deepStrictEqual(r.tilts, [{ x: 0.5, y: -1 }, { x: 0, y: 0 }]);
  assert.deepStrictEqual(r.none, { x: 0, y: 0 });
  assert.ok(r.one.x > 0.9 && Math.abs(r.one.y) < 1e-9, 'one finger pulls her towards it');
  assert.ok(r.toRight.x > 0.9 && r.toLeft.x < -0.9, 'with two fingers down she follows the one nearest the strawberry');
  assert.ok(r.spotsOk && r.far > 0.9, 'strawberries land on the tray, away from the ladybird');

  // --- where tilting could work, she is asked: tilt or finger. Finger: hold where she should go.
  assert.strictEqual(await api(page, 'state'), 'ask');
  assert.strictEqual(await page.locator('.g-tray .ty-ask .mg-btn').count(), 2);
  await page.locator('.g-tray .ty-ask .mg-btn').nth(1).click();
  await playing(page);
  assert.strictEqual(await api(page, 'mode'), 'touch');
  await page.waitForSelector('.mg-hint', { state: 'attached', timeout: 5000 }); // a ghost hand points at the strawberry
  await t.fast(page, 4);
  for (let n = 1; n <= 12; n++) {
    const b = await spot(page, await api(page, 'berry'));
    await page.mouse.move(b.x, b.y);
    await page.mouse.down();
    await page.waitForFunction((n) => MG.current.api.eaten >= n, n, { timeout: 30000 });
    await page.mouse.up();
    assert.strictEqual(await api(page, 'fingers'), 0, 'lifting the finger lets go');
  }
  await t.waitForWin(page, 30000);
  assert.strictEqual(await page.locator('.mg-win').getAttribute('data-result'), 'team');
  assert.strictEqual(await page.locator('.g-tray .ty-slot.is-on').count(), 12);

  // --- tilt: real sensor events steer her (and the first reading counts as "flat")
  page = await t.open(ID);
  await page.locator('.g-tray .ty-ask .mg-btn').nth(0).click();
  for (let i = 0; i < 6; i++) { await tilt(page, 45, 0); await page.waitForTimeout(60); } // tapped while holding it up to look at
  await playing(page);
  assert.strictEqual(await api(page, 'mode'), 'tilt');
  assert.ok(await api(page, 'settling'), 'a moment to lay it down first');
  for (let i = 0; i < 80 && (await api(page, 'settling')); i++) { await tilt(page, 20, 0); await page.waitForTimeout(50); } // ...then laid between them
  await tilt(page, 20, 0);
  await page.waitForTimeout(400);
  const still = await api(page, 'ball');
  assert.ok(Math.abs(still.y - (await api(page, 'size')).H / 2) < 0.05, 'the pose it is laid down in is "flat", not the one it was tapped in');
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

  // --- after a pause the phone is rarely held as before: a moment to lay it down again, and THAT pose is flat
  await page.evaluate(() => { MG.timeScale = 1; });
  for (let i = 0, was = null; i < 60; i++) { // held level until she has rolled to a stop
    await tilt(page, 20, 0);
    await page.waitForTimeout(80);
    const at = await api(page, 'ball');
    if (was && Math.hypot(at.x - was.x, at.y - was.y) < 0.0005) break;
    was = at;
  }
  await t.pause(page);
  await tilt(page, -25, 10); // picked up, looked at, put down differently
  await page.locator('.mg-pausecard .mg-btn--primary').tap();
  await page.waitForFunction(() => document.querySelector('#mg-overlay').hidden && !MG.current.ctx.paused);
  assert.ok(await api(page, 'settling'), 'resuming gives a moment to lay it down again');
  assert.ok(await page.locator('.g-tray .ty-tip').isVisible(), '...and shows it');
  {
    const held = await api(page, 'ball');
    for (let i = 0; i < 80 && (await api(page, 'settling')); i++) { await tilt(page, -25, 10); await page.waitForTimeout(50); }
    assert.ok(!(await api(page, 'settling')), 'then play goes on');
    const now = await api(page, 'ball');
    assert.ok(Math.hypot(now.x - held.x, now.y - held.y) < 0.02, 'she waits where she was while it is laid down');
    await tilt(page, -25, 10);
    const lean = await page.evaluate(() => MG.current.ctx.motion.tilt);
    assert.ok(Math.abs(lean.x) < 2 && Math.abs(lean.y) < 2, `the new pose is flat (${lean.x.toFixed(0)}, ${lean.y.toFixed(0)})`);
    assert.ok(!(await page.locator('.g-tray .ty-tip').isVisible()));
  }

  // --- leaning it one way until she is pressed against the rim, and keeping it there: also "how they hold it now"
  for (let i = 0; i < 110; i++) {
    await tilt(page, -5, 10); // 20 degrees further over: a full push, but nowhere near "tipped right over"
    await page.waitForTimeout(50);
    if (i > 20 && Math.abs(await page.evaluate(() => MG.current.ctx.motion.tilt.y)) < 5) break;
  }
  assert.ok(Math.abs(await page.evaluate(() => MG.current.ctx.motion.tilt.y)) < 5, 'pinned against the rim for two seconds re-centres too');

  // --- tipped right over for a while: that is simply how they hold it now, so it becomes "flat"
  for (let i = 0; i < 60; i++) { await tilt(page, 85, 0); await page.waitForTimeout(50); }
  assert.ok(Math.abs(await page.evaluate(() => MG.current.ctx.motion.tilt.y)) < 5, 'a stuck tilt re-centres itself');

  // --- and a finger always works, in tilt mode too: it has the last word, even with the phone tipped hard the other way
  {
    const e0 = await api(page, 'eaten');
    const s = await page.evaluate(() => ({ ball: MG.current.api.ball, berry: MG.current.api.berry }));
    await page.evaluate(([away]) => {
      window.__against = setInterval(() => window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta: 85, gamma: away })), 30);
    }, [s.berry.x > s.ball.x ? -20 : 20]);
    const b = await spot(page, s.berry);
    await page.mouse.move(b.x, b.y);
    await page.mouse.down();
    await t.fast(page, 4);
    await page.waitForFunction((n) => MG.current.api.eaten > n, e0, { timeout: 30000 });
    await page.mouse.up();
    await page.evaluate(() => clearInterval(window.__against));
  }

  // --- the phone never answers the sensor question: Finger still starts the game; and a resting thumb does not hold her back
  page = await t.open(null, { page: 'tests/play.html?g=tray' });
  await page.addInitScript(() => { if (window.DeviceOrientationEvent) window.DeviceOrientationEvent.requestPermission = () => new Promise(() => {}); });
  await page.reload();
  await page.waitForFunction(() => window.MG && document.querySelector('#mg-home'));
  await page.evaluate(() => MG.open('tray'));
  await page.locator('.g-tray .ty-ask .mg-btn').nth(0).click();
  await page.waitForTimeout(300);
  assert.strictEqual(await api(page, 'state'), 'asking');
  assert.strictEqual(await page.locator('.g-tray .ty-ask .mg-btn.is-waiting').count(), 1, 'the tapped button shows it is waiting');
  await page.locator('.g-tray .ty-ask .mg-btn').nth(1).click();
  await playing(page);
  assert.strictEqual(await api(page, 'mode'), 'touch');
  await page.evaluate(() => {
    const el = document.querySelector('.g-tray .ty-scene'), r = document.querySelector('.g-tray .ty-board').getBoundingClientRect();
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 91, pointerType: 'touch', clientX: r.left + 12, clientY: r.bottom - 12 }));
  });
  assert.strictEqual(await api(page, 'fingers'), 1);
  {
    const b = await spot(page, await api(page, 'berry'));
    await page.mouse.move(b.x, b.y);
    await page.mouse.down();
    await t.fast(page, 4);
    await page.waitForFunction(() => MG.current.api.eaten >= 1, null, { timeout: 30000 });
    await page.mouse.up();
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
    // what is drawn sits exactly where the game thinks it is (its middle, not its corner)
    const drawn = await p.evaluate(() => {
      const board = document.querySelector('.g-tray .ty-board'), a = MG.current.api;
      const inner = { left: board.getBoundingClientRect().left + board.clientLeft, top: board.getBoundingClientRect().top + board.clientTop, w: board.clientWidth, h: board.clientHeight };
      const off = (sel, pt) => { const r = document.querySelector(sel).getBoundingClientRect(); return Math.hypot((r.left + r.right) / 2 - (inner.left + pt.x / a.size.W * inner.w), (r.top + r.bottom) / 2 - (inner.top + pt.y / a.size.H * inner.h)); };
      return { berry: off('.g-tray .ty-berry', a.berry), bug: off('.g-tray .ty-bug', a.ball) };
    });
    assert.ok(drawn.berry < 12 && drawn.bug < 4, `strawberry and ladybird are drawn where they are @${vp} (${drawn.berry.toFixed(0)}px, ${drawn.bug.toFixed(0)}px off)`);
    // ...and she is no bigger than the room the rim leaves her: pressed into a corner, all of her is still on the tray
    const fit = await p.evaluate(() => {
      const board = document.querySelector('.g-tray .ty-board'), a = MG.current.api;
      const r = document.querySelector('.g-tray .ty-bug .mg-sticker').getBoundingClientRect();
      return { half: Math.max(r.width, r.height) / 2, room: Math.min(a.RADIUS / a.size.W * board.clientWidth, a.RADIUS / a.size.H * board.clientHeight) };
    });
    assert.ok(fit.half <= fit.room + 1, `the ladybird stays inside the rim @${vp} (${fit.half.toFixed(0)}px of her, ${fit.room.toFixed(0)}px of room)`);
    // ...so even a strawberry in the far corner is whole
    const corner = await p.evaluate(() => {
      const a = MG.current.api, fruit = document.querySelector('.g-tray .ty-berry'), g = document.querySelector('#mg-game').getBoundingClientRect();
      const keep = [fruit.style.left, fruit.style.top];
      fruit.style.left = (1 - 0.14 / a.size.W) * 100 + '%'; fruit.style.top = (1 - 0.14 / a.size.H) * 100 + '%';
      const r = fruit.querySelector('.mg-sticker').getBoundingClientRect();
      fruit.style.left = keep[0]; fruit.style.top = keep[1];
      return r.right <= g.right + 1 && r.bottom <= g.bottom + 1;
    });
    assert.ok(corner, `a strawberry in the far corner is not cut off @${vp}`);
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
