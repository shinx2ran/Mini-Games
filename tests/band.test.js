/* Animal Band: make a looping song together on a grid of singing animals, then put on a concert. */
'use strict';
const h = require('./harness');
const ID = 'band';

const api = (page, key) => page.evaluate((k) => MG.current.api[k], key);
const cell = (r, s) => `.g-band .bd-cell[data-r="${r}"][data-s="${s}"]`;
const tapCell = (page, r, s, ids = [1]) => page.evaluate(([sel, ids]) => {
  const c = document.querySelector(sel), b = c.getBoundingClientRect();
  ids.forEach((id) => c.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: id, pointerType: 'touch', clientX: b.left + b.width / 2, clientY: b.top + b.height / 2 })));
}, [cell(r, s), ids]);
const ELEPHANT = 5;

h.run(ID, async (t) => {
  const { assert } = t;

  // --- pure rules
  let page = await t.open(ID);
  const r = await page.evaluate(() => {
    const a = MG.current.api, beat = a.startSong('beat'), none = a.startSong('empty');
    return { beat: a.countNotes(beat), on0: a.onBeat(beat, 0), on4: a.onBeat(beat, 4), on1: a.onBeat(beat, 1), none: a.countNotes(none), size: [beat.length, beat[0].length], band: a.BAND };
  });
  assert.strictEqual(r.beat, 2);
  assert.deepStrictEqual(r.on0, [5]); assert.deepStrictEqual(r.on4, [5]); assert.deepStrictEqual(r.on1, []);
  assert.strictEqual(r.none, 0);
  assert.deepStrictEqual(r.size, [6, 8]);
  assert.deepStrictEqual(r.band, ['bird', 'cat', 'dog', 'frog', 'bear', 'elephant']);

  // --- it starts with the elephant's stomp, already going round: beat by beat, and the stomp is ON beats 1 and 5
  await page.waitForFunction(() => MG.current.api.ticks >= 10, null, { timeout: 15000 });
  const log = await api(page, 'log');
  const beats = log.map((e) => e.beat);
  for (let i = 1; i < beats.length; i++) assert.strictEqual(beats[i], (beats[i - 1] + 1) % 8, 'every beat in turn');
  log.forEach((e) => assert.deepStrictEqual(e.rows, e.beat === 0 || e.beat === 4 ? [ELEPHANT] : [], `who sings on beat ${e.beat + 1}`));
  const pace = await page.evaluate(async () => { const a = MG.current.api, t0 = MG.current.ctx.time, n0 = a.ticks; await new Promise((r) => setTimeout(r, 1500)); return (MG.current.ctx.time - t0) / (a.ticks - n0); });
  assert.ok(Math.abs(pace - 0.3) < 0.03, `a steady medium beat (${pace.toFixed(3)}s)`);
  assert.strictEqual(await page.locator('.g-band .bd-cell.is-now').count(), 6, 'the beat playing now is lit, all the way across');
  await page.waitForSelector('.mg-hint', { state: 'attached', timeout: 5000 });

  // --- a tap gives an animal a note on that beat (and it sings it from then on); a second tap takes it away
  await tapCell(page, 0, 2);
  assert.strictEqual(await page.locator(cell(0, 2)).getAttribute('aria-pressed'), 'true');
  assert.ok(await page.locator(cell(0, 2) + '.is-on').count());
  await page.waitForFunction(() => MG.current.api.log.slice(-8).some((e) => e.beat === 2 && e.rows.includes(0)), null, { timeout: 10000 });
  await page.waitForTimeout(300);
  await tapCell(page, 0, 2);
  assert.strictEqual(await page.locator(cell(0, 2)).getAttribute('aria-pressed'), 'false');
  // mashing one square with six fingers changes it once
  await tapCell(page, 1, 3, [11, 12, 13, 14, 15, 16]);
  assert.strictEqual((await api(page, 'song'))[1][3], true, 'six fingers at once: on, not on-off-on-off-on-off');

  // --- the microphone waits for a tune, then the concert: twice through, from the top, and the party
  assert.strictEqual(await api(page, 'notes'), 3);
  assert.strictEqual(await page.locator('.g-band .bd-mic').getAttribute('aria-disabled'), 'true');
  await page.locator('.g-band .bd-mic').tap({ force: true });
  assert.strictEqual(await api(page, 'state'), 'jam', 'not yet');
  await tapCell(page, 2, 1);
  await tapCell(page, 3, 5);
  assert.strictEqual(await page.locator('.g-band .bd-mic').getAttribute('aria-disabled'), 'false', 'a tune: the microphone lights up');
  // tapping the animal at the end of a row: it sings, nothing changes
  await page.locator('.g-band .bd-head[data-r="4"]').tap();
  assert.strictEqual(await api(page, 'notes'), 5);
  const song = await api(page, 'song');
  await page.locator('.g-band .bd-mic').tap({ force: true });
  assert.strictEqual(await api(page, 'state'), 'show');
  await page.waitForTimeout(500);
  assert.ok(await page.locator('.g-band .bd-scene.is-show').count(), 'the band is on stage');
  await tapCell(page, 0, 0);
  assert.deepStrictEqual(await api(page, 'song'), song, 'the song cannot change during the concert');
  // a tap during the concert still gets an answer: that animal sings along (the song does not change)
  await tapCell(page, 1, 1);
  assert.ok(await page.locator('.g-band .bd-star.is-sing').count() >= 1, 'the animal on stage sings along');
  await page.waitForFunction(() => MG.current.api.state === 'done', null, { timeout: 20000 });
  await page.waitForTimeout(600);
  assert.strictEqual(await api(page, 'booked'), 16, 'exactly twice through: not a note more');
  const show = (await api(page, 'log')).slice(-16);
  assert.deepStrictEqual(show.map((e) => e.beat), [0, 1, 2, 3, 4, 5, 6, 7, 0, 1, 2, 3, 4, 5, 6, 7], 'the whole song, twice, from the top');
  show.forEach((e) => assert.deepStrictEqual(e.rows, song.map((row, i) => (row[e.beat] ? i : -1)).filter((i) => i >= 0), `the concert plays the song as written (beat ${e.beat + 1})`));
  await t.waitForWin(page, 10000);
  assert.strictEqual(await page.locator('.mg-win').getAttribute('data-result'), 'team');

  // --- pausing stops the music
  page = await t.open(ID);
  await page.waitForFunction(() => MG.current.api.ticks >= 3);
  await t.pause(page);
  const n0 = await api(page, 'ticks'), b0 = await api(page, 'booked');
  await page.waitForTimeout(900);
  assert.strictEqual(await api(page, 'ticks'), n0, 'no beats while paused');
  assert.ok(b0 <= n0 + 1 && (await api(page, 'booked')) === b0, 'and no notes lined up behind the pause menu');
  await page.locator('.mg-pausecard .mg-btn--primary').tap();
  await page.waitForFunction((n) => MG.current.api.ticks >= n + 2, n0, { timeout: 5000 });
  const after = await page.evaluate(() => [MG.current.api.ticks, MG.current.api.booked]);
  assert.ok(after[1] >= after[0], 'after resuming every beat has its notes again');

  // --- the grown-up's choices: nothing to start with, and a faster beat
  page = await t.open(ID);
  await t.pause(page);
  await page.locator('.mg-seg__btn', { hasText: 'Nothing' }).tap();
  await page.waitForFunction(() => MG.current && MG.current.api && MG.current.api.notes === 0);
  await t.pause(page);
  await page.locator('.mg-seg__btn', { hasText: 'Fast' }).tap();
  await page.waitForFunction(() => MG.current && MG.current.api && MG.current.api.step === 0.24);
  assert.strictEqual(await api(page, 'notes'), 0, 'the start option is remembered');

  // --- every supported size: the whole grid and the microphone in view, squares big enough; turn the screen mid-song
  for (const vp of ['small', 'phone', 'phoneWide', 'tabletTall', 'tablet']) {
    const p = await t.open(ID, { viewport: vp, dark: vp === 'phoneWide' || vp === 'small' });
    await p.waitForFunction(() => MG.current.api.ticks >= 2);
    assert.ok(await t.noPageScroll(p), `no page scroll @${vp}`);
    assert.deepStrictEqual(await t.outsidePlayArea(p, '.g-band .bd-cell, .g-band .bd-head, .g-band .bd-mic'), [], `all in view @${vp}`);
    const sq = await t.minTargetSize(p, '.g-band .bd-cell');
    assert.strictEqual(sq.count, 48);
    assert.ok(sq.min >= (vp === 'small' ? 34 : 46), `squares are big enough @${vp} (${sq.min}px)`);
    assert.ok((await t.minTargetSize(p, '.g-band .bd-mic')).min >= 72, `the microphone is big @${vp}`);
    assert.ok((await t.minTargetSize(p, '.g-band .bd-head')).min >= (vp === 'small' ? 36 : 44), `the animals are big enough to tap @${vp}`);
    const flow = await p.evaluate(() => document.querySelector('.g-band .bd-grid').dataset.flow);
    assert.strictEqual(flow, vp === 'phoneWide' || vp === 'tablet' ? 'across' : 'down', `time runs the long way @${vp}`);
    await tapCell(p, 2, 6);
    await p.waitForTimeout(250);
    await t.shot(p, `band-${vp}.png`);
    if (vp === 'phone') {
      await p.setViewportSize({ width: 844, height: 390 });
      await p.waitForTimeout(300);
      assert.strictEqual(await p.evaluate(() => document.querySelector('.g-band .bd-grid').dataset.flow), 'across');
      assert.deepStrictEqual(await t.outsidePlayArea(p, '.g-band .bd-cell, .g-band .bd-head, .g-band .bd-mic'), [], 'still in view after rotating');
      assert.strictEqual((await api(p, 'song'))[2][6], true, 'the song is all still there');
      // the dog's square for beat 7 is still the dog's square for beat 7, now on the right of the dog's row
      const pos = await p.evaluate(() => { const c = document.querySelector('.g-band .bd-cell[data-r="2"][data-s="6"]').getBoundingClientRect(), d = document.querySelector('.g-band .bd-head[data-r="2"]').getBoundingClientRect(); return { dy: Math.abs((c.top + c.bottom) / 2 - (d.top + d.bottom) / 2), right: c.left > d.right }; });
      assert.ok(pos.dy < 4 && pos.right, 'in the dog\'s row');
    }
  }

  // --- reduced motion: the ready microphone does not pulse
  page = await t.open(ID, { reducedMotion: true });
  for (const [rr, ss] of [[0, 1], [1, 2], [2, 3]]) await tapCell(page, rr, ss);
  assert.strictEqual(await page.evaluate(() => getComputedStyle(document.querySelector('.g-band .bd-mic')).animationName), 'none');

  // --- leaving and coming back mid-song leaves nothing behind
  page = await t.open(ID);
  for (let i = 0; i < 3; i++) {
    await page.waitForFunction(() => MG.current && MG.current.api && MG.current.api.ticks >= 1);
    await tapCell(page, i, i);
    await page.evaluate(() => MG.home());
    await page.evaluate(() => MG.open('band'));
  }
  await page.waitForFunction(() => MG.current.api.ticks >= 1);
  assert.strictEqual(await page.locator('.g-band .bd-scene').count(), 1);
  assert.strictEqual(await api(page, 'notes'), 2, 'a fresh song each time');
});
