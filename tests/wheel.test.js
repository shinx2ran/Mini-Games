/* Bossy Wheel: the Boss spins, the other one does the action, the Boss claps. Three spins each. */
'use strict';
const h = require('./harness');
const ID = 'wheel';

const api = (page, key) => page.evaluate((k) => MG.current.api[k], key);
const state = (page, s) => page.waitForFunction((s) => MG.current && MG.current.api && MG.current.api.state === s && !MG.current.ctx.locked, s, { timeout: 30000 });

/** One whole spin through real taps. Returns what happened. */
async function spin(page) {
  await state(page, 'wait');
  const boss = await api(page, 'boss');
  await page.locator('.g-wheel .wh-wheel').tap();
  await state(page, 'clap');
  const out = await page.evaluate(() => {
    const a = MG.current.api;
    return { rot: a.rot, target: a.target, landed: a.landed, under: a.sliceAt(a.rot, a.SLICES), who: a.who, emoji: a.slices[a.landed],
      card: document.querySelector('.g-wheel .wh-act').textContent, doers: [...document.querySelectorAll('.g-wheel .wh-doer')].map((d) => d.textContent),
      caption: document.querySelector('.g-wheel .wh-caption').textContent };
  });
  await page.locator('.g-wheel .wh-clap').tap({ force: true }); // it pulses, so it is never "stable"
  await page.waitForFunction(() => MG.current.api.state !== 'clap' && MG.current.api.state !== 'award');
  return { boss, ...out };
}

h.run(ID, async (t) => {
  const { assert } = t;

  // --- pure rules
  let page = await t.open(ID);
  const r = await page.evaluate(() => {
    const a = MG.current.api;
    const lands = [];
    for (let i = 0; i < 8; i++) for (const from of [0, 77, 1234.5]) for (const j of [-1, 0, 1]) lands.push(a.sliceAt(a.landingRot(from, i, 8, 4, j), 8) === i && a.landingRot(from, i, 8, 4, j) >= from + 4 * 360);
    let both = 0; for (let i = 0; i < 20000; i++) if (a.pickWho() === 'both') both++;
    const hugs = ['mixed', 'active', 'cosy'].map((p) => a.drawSlices(p, MG.util.shuffle).map((s) => s.emoji));
    return { lands: lands.every(Boolean), slice0: a.sliceAt(-10, 8), slice7: a.sliceAt(10, 8), both: both / 20000, who: [a.pickWho(0.1), a.pickWho(0.9)], hugs, slices: a.slices, all: a.all };
  });
  assert.ok(r.lands, 'the wheel always stops on the slice it chose, after at least four turns');
  assert.strictEqual(r.slice0, 0); assert.strictEqual(r.slice7, 7);
  assert.ok(Math.abs(r.both - 0.4) < 0.02, 'both players do it about 40% of the time');
  assert.deepStrictEqual(r.who, ['both', 'other'], 'never the Boss alone');
  for (const hand of r.hugs) { assert.strictEqual(hand.length, 8); assert.strictEqual(new Set(hand).size, 8); assert.ok(hand.includes('🤗') && hand.includes('⭐'), 'always a hug and a star'); }
  assert.strictEqual(new Set(r.all).size, r.all.length);

  // --- a whole round through real taps: six spins, Bosses alternate, no slice twice, then the party
  await t.fast(page, 8);
  const first = await page.evaluate(() => MG.current.ctx.firstPlayer);
  assert.strictEqual(await page.locator('.g-wheel .wh-seat.is-boss').getAttribute('data-p'), String(first));
  const seen = [];
  let expectStars = 0;
  for (let n = 0; n < 6; n++) {
    const s = await spin(page);
    assert.strictEqual(s.boss, n % 2 === 0 ? first : 1 - first, 'the Boss alternates');
    assert.strictEqual(s.landed, s.target.index);
    assert.strictEqual(s.under, s.landed, 'the slice under the pointer is the one shown');
    assert.strictEqual(s.card, s.emoji);
    assert.ok(s.caption.length > 3);
    assert.ok(!seen.includes(s.landed), 'no action twice in a round');
    seen.push(s.landed);
    const players = await page.evaluate(() => MG.current.ctx.players.map((p) => p.emoji));
    if (s.who === 'both') assert.deepStrictEqual(s.doers.sort(), [...players].sort());
    else assert.deepStrictEqual(s.doers, [players[1 - s.boss]], 'the OTHER player does it');
    expectStars += s.who === 'both' ? 2 : 1;
    assert.strictEqual(await api(page, 'stars'), expectStars);
  }
  await t.waitForWin(page, 30000);
  assert.strictEqual(await page.locator('.mg-win').getAttribute('data-result'), 'team');

  // --- every star earned stays visible in the HUD, on a small phone and on its side
  for (const vp of ['small', 'phoneWide']) {
    const p = await t.open(ID, { viewport: vp });
    await t.fast(p, 8);
    for (let n = 0; n < 6; n++) await spin(p);
    const stars = await p.evaluate(() => {
      const box = document.querySelector('.mg-hud__status').getBoundingClientRect();
      const all = [...document.querySelectorAll('.mg-hud__status span span')].map((s) => s.getBoundingClientRect());
      return { n: all.length, want: MG.current.api.stars, hidden: all.filter((r) => r.left < Math.max(0, box.left) - 1 || r.right > Math.min(window.innerWidth, box.right) + 1 || r.top < box.top - 1 || r.bottom > box.bottom + 1).length };
    });
    assert.ok(stars.n === stars.want && stars.n >= 6, 'one star drawn per star earned');
    assert.strictEqual(stars.hidden, 0, `all ${stars.n} stars visible @${vp}`);
    await t.shot(p, `wheel-stars-${vp}.png`);
  }

  // --- a shake spins the wheel too, where the device has a motion sensor
  page = await t.open(ID);
  await state(page, 'wait');
  for (let i = 0; i < 8 && !(await api(page, 'shakeOn')); i++) {
    await page.evaluate(() => window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta: 10, gamma: 0 })));
    await page.waitForTimeout(120);
  }
  assert.ok(await api(page, 'shakeOn'), 'the motion sensor is picked up');
  await page.evaluate(() => {
    const ev = (x) => window.dispatchEvent(new DeviceMotionEvent('devicemotion', { accelerationIncludingGravity: { x, y: 9.8, z: 0 } }));
    ev(0); ev(0.5);   // resting in a hand: not a shake
  });
  assert.strictEqual(await api(page, 'state'), 'wait', 'a small wobble does not spin it');
  await page.evaluate(() => {
    const ev = (x) => window.dispatchEvent(new DeviceMotionEvent('devicemotion', { accelerationIncludingGravity: { x, y: 9.8, z: 0 } }));
    ev(18); ev(-18);
  });
  assert.strictEqual(await api(page, 'state'), 'spin', 'a shake spins the wheel');

  // ...and so does a REAL shake: readings come ~60 times a second, so neighbours differ only a little
  const wave = (page, g, hz, ms) => page.evaluate(async ([g, hz, ms]) => {
    const t0 = performance.now();
    for (;;) {
      const t = performance.now() - t0;
      if (t > ms) break;
      window.dispatchEvent(new DeviceMotionEvent('devicemotion', { accelerationIncludingGravity: { x: g * 9.8 * Math.sin(2 * Math.PI * hz * t / 1000), y: 9.8, z: 0 } }));
      await new Promise((r) => setTimeout(r, 16));
    }
    return MG.current.api.state;
  }, [g, hz, ms]);
  page = await t.open(ID);
  await state(page, 'wait');
  for (let i = 0; i < 8 && !(await api(page, 'shakeOn')); i++) {
    await page.evaluate(() => window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta: 10, gamma: 0 })));
    await page.waitForTimeout(120);
  }
  assert.strictEqual(await wave(page, 0.3, 1.5, 900), 'wait', 'passing the phone across is not a shake');
  assert.strictEqual(await wave(page, 1.5, 3, 900), 'spin', 'a child-sized wiggle is');

  // --- mashing: drumming on the wheel is one spin; the clap cannot be hit early or twice
  page = await t.open(ID);
  await state(page, 'wait');
  await page.evaluate(() => {
    const el = document.querySelector('.g-wheel .wh-wheel'); const r = el.getBoundingClientRect();
    for (let id = 90; id < 96; id++) el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: id, pointerType: 'touch', clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
  });
  assert.strictEqual(await api(page, 'state'), 'spin');
  const tgt = await api(page, 'target');
  await page.locator('.g-wheel .wh-wheel').tap({ force: true });
  assert.deepStrictEqual(await api(page, 'target'), tgt, 'tapping a spinning wheel changes nothing');
  await t.fast(page, 8);
  await page.waitForFunction(() => MG.current.api.state === 'show');
  await page.evaluate(() => { const el = document.querySelector('.g-wheel .wh-clap'); const r = el.getBoundingClientRect(); el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 97, pointerType: 'touch', clientX: r.left + 5, clientY: r.top + 5 })); });
  assert.strictEqual(await api(page, 'stars'), 0, 'no star before the action has had its moment');
  await state(page, 'clap');
  await page.evaluate(() => { const el = document.querySelector('.g-wheel .wh-clap'); const r = el.getBoundingClientRect(); for (let id = 98; id < 103; id++) el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: id, pointerType: 'touch', clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })); });
  const st = await api(page, 'stars');
  assert.ok(st === 1 || st === 2, 'five claps at once are one award');
  assert.strictEqual(await api(page, 'spins'), 1);

  // --- every supported size, on the wheel and on the card: nothing clipped; rotate with the card up
  for (const vp of ['small', 'phone', 'phoneWide', 'tabletTall', 'tablet']) {
    const p = await t.open(ID, { viewport: vp, dark: vp === 'phoneWide' || vp === 'tabletTall' });
    await state(p, 'wait');
    assert.ok(await t.noPageScroll(p), `no page scroll @${vp}`);
    assert.deepStrictEqual(await t.outsidePlayArea(p, '.g-wheel .wh-wheel, .g-wheel .wh-seat, .g-wheel .wh-pointer'), [], `wheel in view @${vp}`);
    assert.ok((await t.minTargetSize(p, '.g-wheel .wh-wheel')).min >= 180, `the wheel is huge @${vp}`);
    await p.waitForTimeout(250);
    await t.shot(p, `wheel-${vp}.png`);
    await t.fast(p, 8);
    await p.locator('.g-wheel .wh-wheel').tap();
    await state(p, 'clap');
    await p.evaluate(() => { MG.timeScale = 1; });
    await p.waitForTimeout(500);
    assert.deepStrictEqual(await t.outsidePlayArea(p, '.g-wheel .wh-card, .g-wheel .wh-clap, .g-wheel .wh-caption, .g-wheel .wh-doer'), [], `card in view @${vp}`);
    assert.ok((await t.minTargetSize(p, '.g-wheel .wh-clap')).min >= 64, `clap button is big @${vp}`);
    const overlap = await p.evaluate(() => {
      const box = (s) => document.querySelector(s).getBoundingClientRect();
      const a = box('.g-wheel .wh-caption'), b = box('.g-wheel .wh-clap'), c = box('.g-wheel .wh-who');
      return a.bottom > b.top + 1 || c.bottom > a.top + 1;
    });
    assert.ok(!overlap, `who, caption and clap do not overlap @${vp}`);
    await t.shot(p, `wheel-${vp}-card.png`);
    if (vp === 'phone') {
      await p.setViewportSize({ width: 844, height: 390 });
      await p.waitForTimeout(300);
      assert.deepStrictEqual(await t.outsidePlayArea(p, '.g-wheel .wh-card, .g-wheel .wh-clap, .g-wheel .wh-caption'), [], 'card still in view after rotating');
      await p.locator('.g-wheel .wh-clap').tap({ force: true });
      await state(p, 'wait');
    }
  }

  // --- leaving and coming back mid-spin leaves nothing behind
  page = await t.open(ID);
  for (let i = 0; i < 4; i++) {
    await state(page, 'wait');
    await page.locator('.g-wheel .wh-wheel').tap();
    await page.waitForTimeout(100);
    await page.evaluate(() => MG.home());
    await page.evaluate(() => MG.open('wheel'));
  }
  await state(page, 'wait');
  assert.strictEqual(await page.locator('.g-wheel .wh-scene').count(), 1);
  assert.strictEqual(await api(page, 'spins'), 0);
});
