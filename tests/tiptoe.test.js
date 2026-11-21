/* Run & Freeze: run while the wolf sings with his back turned; freeze when the song stops and he looks. */
'use strict';
const h = require('./harness');
const ID = 'tiptoe';

const api = (page, key) => page.evaluate((k) => MG.current.api[k], key);
const ready = (page) => page.waitForFunction(() => MG.current && MG.current.api && MG.current.api.state === 'play', null, { timeout: 30000 });
const tapLane = (page, p) => page.locator(`.g-tiptoe .tt-lane[data-p="${p}"]`).tap();
const hold = (page, phase) => page.evaluate((ph) => { MG.current.api.hold(ph); return MG.current.api.pos; }, phase);
const gameTime = (page) => page.evaluate(() => MG.current.ctx.time);
const waitGame = async (page, seconds) => { const t0 = await gameTime(page); await page.waitForFunction(([t, s]) => MG.current.ctx.time - t >= s, [t0, seconds], { timeout: 30000 }); };
/** Press and keep a (mouse) finger down in the middle of a lane. */
async function press(page, p) {
  const b = await page.locator(`.g-tiptoe .tt-lane[data-p="${p}"]`).boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height * 0.6);
  await page.mouse.down();
}

h.run(ID, async (t) => {
  const { assert } = t;

  // --- pure rules: the quiet handicap, what moving means in each phase, and the songs
  let page = await t.open(ID);
  await ready(page);
  const r = await page.evaluate(() => {
    const a = MG.current.api, bad = [];
    for (let i = 0; i < 3000; i++) {
      const longer = i % 2 === 0, s = a.makeSong(Math.random, longer);
      if (s.dur < 1.7 || s.dur > 6.8) bad.push('dur ' + s.dur);
      if ((s.notes.length - 2) % 8) bad.push('bars');
      if (s.notes[s.notes.length - 2] !== 67 || s.notes[s.notes.length - 1] !== 76) bad.push('ending');
      if (longer && s.notes.length < 18) bad.push('longer');
      if (Math.abs(s.dur - (s.notes.length + 1) * s.step) > 1e-9) bad.push('maths');
    }
    const durs = new Set(); for (let i = 0; i < 300; i++) durs.add(a.makeSong().dur.toFixed(2));
    return { bad: bad.slice(0, 3), variety: durs.size,
      off: a.setup(0, 0), none: a.setup(1, -1), some: a.setup(1, 0), lots: a.setup(2, 1),
      j: [a.judge('song', 9, 0.3), a.judge('away', 9, 0.3), a.judge('look', 0.1, 0.65), a.judge('look', 0.7, 0.65), a.judge('look', 0.25, 0.2)],
      rules: a.rules, littleIdx: a.littleIdx };
  });
  assert.deepStrictEqual(r.bad, [], 'every song is a sensible length and ends on the same "ta-DAA"');
  assert.ok(r.variety >= 6, 'songs come in many lengths, so the freeze is a surprise');
  assert.deepStrictEqual(r.off, { len: [28, 28], grace: [0.35, 0.35], back: [3, 3] });
  assert.deepStrictEqual(r.none, r.off);
  assert.deepStrictEqual(r.some, { len: [24, 32], grace: [0.65, 0.2], back: [2, 4] });
  assert.deepStrictEqual(r.lots, { len: [34, 22], grace: [0.2, 0.9], back: [5, 2] });
  assert.deepStrictEqual(r.j, ['run', 'run', 'ignore', 'caught', 'caught']);
  assert.strictEqual(r.littleIdx, 0); assert.deepStrictEqual(r.rules.len, [24, 32]);

  // --- while he sings: holding a finger down runs, at one top speed; letting go stops
  await hold(page, 'song');
  await press(page, 0);
  await waitGame(page, 2);
  const ran = (await api(page, 'pos'))[0];
  assert.ok(ran >= 5 && ran <= 9, `about seven steps in two seconds of holding (${ran})`);
  assert.ok(await page.locator('.g-tiptoe .tt-lane[data-p="0"].is-running').count(), 'she is shown running');
  await page.mouse.up();
  assert.deepStrictEqual(await api(page, 'down'), [false, false]);
  const stopped = (await api(page, 'pos'))[0];
  await waitGame(page, 0.8);
  assert.strictEqual((await api(page, 'pos'))[0], stopped, 'hands off = standing still');

  // --- patting works too, and ten pats in one instant are still one step
  await waitGame(page, 0.3);
  const before = await page.evaluate(() => {
    const el = document.querySelector('.g-tiptoe .tt-lane[data-p="1"]'); const b = el.getBoundingClientRect();
    for (let id = 40; id < 50; id++) {
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: id, pointerType: 'touch', clientX: b.left + b.width / 2, clientY: b.top + b.height * 0.6 }));
      window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: id, pointerType: 'touch' }));
    }
    return MG.current.api.pos[1];
  });
  assert.strictEqual(before, 1, 'no faster by drumming');
  await waitGame(page, 0.3);
  await tapLane(page, 1);
  assert.strictEqual((await api(page, 'pos'))[1], 2);

  // --- he looks: a finger still down is forgiven for a moment, then huffed back ONCE
  await press(page, 0);
  const atLook = (await hold(page, 'look'))[0];
  await waitGame(page, 0.4);
  assert.strictEqual((await api(page, 'pos'))[0], atLook, 'inside the forgiveness window nothing happens');
  await waitGame(page, 0.6);
  assert.strictEqual((await api(page, 'pos'))[0], atLook - 2, 'still running when he looks: back two steps');
  assert.deepStrictEqual(await api(page, 'caught'), [1, 0]);
  await waitGame(page, 1.5);
  assert.strictEqual((await api(page, 'pos'))[0], atLook - 2, 'he does not keep huffing at the same player');
  await page.mouse.up();
  // the grown-up pats while he is looking: back four, but never past the start
  await hold(page, 'look');
  await waitGame(page, 0.3);
  await tapLane(page, 1);
  assert.strictEqual((await api(page, 'pos'))[1], 0, 'never below the start');
  assert.deepStrictEqual(await api(page, 'caught'), [1, 1]);

  // --- turning back is safe; then a whole race: she runs to the cupcakes and the other is waved up too
  await hold(page, 'away');
  await waitGame(page, 0.9);
  await tapLane(page, 1);
  assert.strictEqual((await api(page, 'pos'))[1], 1);
  await hold(page, 'song');
  await t.fast(page, 8);
  await press(page, 0);
  await page.waitForFunction(() => MG.current.api.state === 'done', null, { timeout: 30000 });
  await page.mouse.up();
  await t.waitForWin(page, 30000);
  assert.strictEqual(await page.locator('.mg-win').getAttribute('data-result'), '0');
  assert.deepStrictEqual(await api(page, 'pos'), [24, 32], 'everybody reaches the cupcakes');

  // --- the wolf's own cycle: he sings every note, looks, turns away, and sings a new song
  page = await t.open(ID);
  await ready(page);
  await t.fast(page, 8);
  await page.waitForFunction(() => MG.current.api.phase === 'song');
  const firstSong = await api(page, 'song');
  await page.waitForFunction(() => MG.current.api.phase === 'look', null, { timeout: 30000 });
  assert.strictEqual(await api(page, 'notesPlayed'), firstSong.notes.length, 'the freeze comes exactly when the song ends');
  assert.strictEqual(await page.evaluate(() => document.querySelector('.g-tiptoe .tt-scene').dataset.phase), 'look');
  await page.waitForFunction(() => MG.current.api.phase === 'away', null, { timeout: 30000 });
  await page.waitForFunction(() => MG.current.api.phase === 'song' && MG.current.api.songs === 2, null, { timeout: 30000 });

  // --- pausing pauses the song too
  await page.evaluate(() => { MG.timeScale = 1; });
  await page.waitForFunction(() => MG.current.api.phase === 'song' && MG.current.api.notesPlayed > 0, null, { timeout: 30000 });
  await page.evaluate(() => MG.pause());
  const n0 = await api(page, 'notesPlayed');
  await page.waitForTimeout(700);
  assert.strictEqual(await api(page, 'notesPlayed'), n0, 'no notes while paused');

  // --- two real fingers at once, one each: both run; lifting both stops both
  page = await t.open(ID);
  await ready(page);
  await hold(page, 'song');
  {
    const cdp = await page.context().newCDPSession(page);
    const mid = async (p) => { const b = await page.locator(`.g-tiptoe .tt-lane[data-p="${p}"]`).boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height * 0.6 }; };
    const a = await mid(0), b = await mid(1);
    const pt = (p, id) => ({ x: p.x, y: p.y, id, radiusX: 8, radiusY: 8, force: 1 });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(a, 0), pt(b, 1)] });
    await waitGame(page, 1.5);
    const both = await api(page, 'pos');
    assert.ok(both[0] >= 4 && both[1] >= 4, `both run together (${both})`);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForFunction(() => !MG.current.api.down[0] && !MG.current.api.down[1]);
  }

  // --- every supported size, singing and looking: lanes are huge, nothing clipped; rotate mid-race
  for (const vp of ['small', 'phone', 'phoneWide', 'tabletTall', 'tablet']) {
    const p = await t.open(ID, { viewport: vp, dark: vp === 'phoneWide' || vp === 'small' });
    await ready(p);
    await hold(p, 'song');
    for (let n = 0; n < 6; n++) { await tapLane(p, n % 2); await waitGame(p, 0.3); }
    await p.waitForTimeout(400);
    assert.ok(await t.noPageScroll(p), `no page scroll @${vp}`);
    assert.deepStrictEqual(await t.outsidePlayArea(p, '.g-tiptoe .tt-lane, .g-tiptoe .tt-wolf, .g-tiptoe .tt-back, .g-tiptoe .tt-notes span'), [], `all in view @${vp}`);
    assert.ok((await t.minTargetSize(p, '.g-tiptoe .tt-lane')).min >= 110, `lanes are huge @${vp}`);
    const inLane = await p.evaluate(() => [...document.querySelectorAll('.g-tiptoe .tt-lane')].every((lane) => {
      const l = lane.getBoundingClientRect();
      return [...lane.querySelectorAll('.tt-climber, .tt-cake')].every((n) => { const r = n.getBoundingClientRect(); return r.top >= l.top - 1 && r.bottom <= l.bottom + 1; });
    }));
    assert.ok(inLane, `runners and cupcakes stay inside their lanes @${vp}`);
    await t.shot(p, `tiptoe-${vp}-song.png`);
    await hold(p, 'look');
    await p.waitForTimeout(450);
    assert.deepStrictEqual(await t.outsidePlayArea(p, '.g-tiptoe .tt-eyes, .g-tiptoe .tt-face'), [], `his face and eyes are in view @${vp}`);
    if (vp === 'phone' || vp === 'phoneWide' || vp === 'small') await t.shot(p, `tiptoe-${vp}-look.png`);
    if (vp === 'phone') {
      await p.setViewportSize({ width: 844, height: 390 });
      await p.waitForTimeout(300);
      assert.deepStrictEqual(await t.outsidePlayArea(p, '.g-tiptoe .tt-lane, .g-tiptoe .tt-wolf'), [], 'still in view after rotating');
      await hold(p, 'song');
      await waitGame(p, 0.3);
      await tapLane(p, 0);
      assert.strictEqual((await api(p, 'pos'))[0], 4);
    }
  }

  // --- leaving and coming back leaves nothing behind
  page = await t.open(ID);
  for (let i = 0; i < 4; i++) {
    await ready(page);
    await tapLane(page, i % 2);
    await page.evaluate(() => MG.home());
    await page.evaluate(() => MG.open('tiptoe'));
  }
  await ready(page);
  assert.strictEqual(await page.locator('.g-tiptoe .tt-scene').count(), 1);
  assert.deepStrictEqual(await api(page, 'pos'), [0, 0]);
});
