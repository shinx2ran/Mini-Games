/* Shell behaviour, exercised through the template game. */
'use strict';
const h = require('./harness');
const PAGE = { page: 'tests/play.html?g=_template' };

/** Press and hold a hold-button with a real pointer. */
async function hold(page, selector, ms = 900) {
  const box = await page.locator(selector).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
}

h.run('shell', async (t) => {
  const { assert } = t;

  // --- home renders, a tile opens the game, Back returns home
  let page = await t.open(null, PAGE);
  assert.strictEqual(await page.locator('.mg-tile').count(), 1);
  assert.ok(await t.noPageScroll(page), 'home must not scroll the page');
  await page.locator('.mg-tile').first().tap();
  await page.waitForFunction(() => MG.current && MG.current.id === 'template');
  assert.strictEqual(await page.evaluate(() => location.hash), '#template');
  await page.goBack();
  await page.waitForFunction(() => !MG.current && !document.querySelector('#mg-home').hidden);

  // --- a full round: hint shows then clears, turns alternate, both players are at the party
  page = await t.open('template', PAGE);
  await t.fast(page, 6);
  assert.strictEqual(await page.locator('.mg-hint').count(), 1, 'ghost hand shows before the first tap');
  assert.strictEqual(await t.api(page, (api) => api.turn), 0, 'little player (P1) starts round one');
  for (let i = 0; i < 5; i++) {
    await page.waitForFunction(() => !MG.current.api.busy && !MG.current.ctx.locked);
    await page.locator('.tpl-star').tap();
    if (i === 0) assert.strictEqual(await page.locator('.mg-hint').count(), 0, 'hint clears on the first counted tap');
  }
  const win = await t.waitForWin(page);
  assert.strictEqual(win.faces.length, 2, 'both players are shown on the win card');
  assert.strictEqual(await page.locator('.mg-win__face.is-crowned').count(), 1);
  assert.strictEqual(await page.locator('.mg-win__face.is-crowned').getAttribute('data-p'), '0');
  assert.deepStrictEqual(await page.evaluate(() => MG.current.ctx.scores), [3, 2]);
  assert.strictEqual(await page.evaluate(() => MG.stickers.length), 1, 'a finished round earns one shared sticker');
  assert.strictEqual(await page.locator('#mg-stage[data-turn]').count(), 0, 'at the party it is nobody\'s turn');
  assert.strictEqual(await page.locator('.mg-chip.is-waiting').count(), 0);

  // mashing during the arming window must not dismiss the celebration
  await page.locator('.mg-win .mg-btn--primary').tap({ force: true }).catch(() => {});
  assert.ok(await page.locator('.mg-win').count(), 'win card survives an early tap');
  await page.waitForSelector('.mg-win__actions:not(.is-arming)');
  await page.locator('.mg-win .mg-btn--primary').tap();
  await page.waitForFunction(() => MG.current && MG.current.ctx.round === 1 && document.querySelector('#mg-overlay').hidden);
  assert.strictEqual(await t.api(page, (api) => api.turn), 1, 'other player starts round two');
  assert.deepStrictEqual(await page.evaluate(() => MG.current.ctx.scores), [0, 0]);

  // --- a turn change locks input briefly: an immediate second tap is ignored
  await page.evaluate(() => { MG.timeScale = 1; });
  await page.waitForFunction(() => !MG.current.ctx.locked);
  await page.locator('.tpl-star').tap();
  await page.waitForFunction(() => !MG.current.api.busy);
  assert.ok(await page.evaluate(() => MG.current.ctx.locked), 'input is locked right after the turn passes');
  await page.locator('.tpl-star').tap();
  assert.deepStrictEqual(await page.evaluate(() => MG.current.ctx.scores), [0, 1], 'tap during the lock did not score');
  await page.evaluate(() => { MG.timeScale = 6; });

  // --- pause needs a press-and-hold: a quick tap does nothing
  await page.locator('.mg-hud__pause').tap();
  await page.waitForTimeout(150);
  assert.ok(await page.evaluate(() => document.querySelector('#mg-overlay').hidden), 'quick tap must not pause');
  await hold(page, '.mg-hud__pause');
  await page.waitForSelector('.mg-overlay--pause');
  const t0 = await page.evaluate(() => MG.current.ctx.time);
  await page.waitForTimeout(450);
  const t1 = await page.evaluate(() => MG.current.ctx.time);
  assert.strictEqual(t0, t1, 'clock frozen while paused');
  await page.locator('.mg-pausecard .mg-btn--primary').tap();
  await page.waitForFunction(() => document.querySelector('#mg-overlay').hidden);
  await page.waitForFunction((v) => MG.current.ctx.time > v, t1);

  // --- switching away mid-game pauses it (nothing runs, and no camera stays on, behind their back)
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForSelector('.mg-overlay--pause');
  assert.ok(await page.evaluate(() => MG.current.ctx.paused), 'paused when the page goes to the background');
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(450);
  await page.locator('.mg-pausecard .mg-btn--primary').tap();
  await page.waitForFunction(() => document.querySelector('#mg-overlay').hidden && !MG.current.ctx.paused);

  // --- options persist and restart the round
  await t.pause(page);
  await page.locator('.mg-seg__btn', { hasText: '5' }).tap();
  await page.waitForFunction(() => MG.current && MG.current.api.target === 5);

  // --- exiting mid-flight cancels timers and listeners (no errors afterwards)
  await page.waitForFunction(() => !MG.current.ctx.locked);
  await page.locator('.tpl-star').tap();
  await page.evaluate(() => MG.home());
  await page.waitForTimeout(300);
  assert.strictEqual(await page.evaluate(() => MG.current), null);
  assert.strictEqual(await page.evaluate(() => document.querySelector('#mg-game').childElementCount), 0);
  assert.strictEqual(await page.locator('.mg-book__sticker').count(), 1, 'the sticker is in the book on the home screen');

  // --- settings are hold-gated; night-night opens and closes
  await hold(page, '.mg-home__gear');
  await page.waitForSelector('.mg-overlay--pause');

  // a finger still down when the menu appears must not click what lands under it
  await page.evaluate(() => { document.querySelector('#mg-overlay').hidden = true; document.querySelector('#mg-overlay').textContent = ''; MG.settings(); document.querySelector('.mg-btn--night').click(); });
  assert.strictEqual(await page.locator('.mg-night').count(), 0, 'menu buttons ignore clicks for a beat after opening');
  await page.waitForTimeout(450);
  await page.locator('.mg-btn--night').tap();
  await page.waitForSelector('.mg-night');
  await page.waitForTimeout(2700);
  await page.locator('.mg-night').tap();
  await page.waitForFunction(() => document.querySelector('#mg-overlay').hidden);

  // --- the party card fits every screen, a phone on its side included
  for (const vp of ['phoneWide', 'small', 'phone', { width: 568, height: 320 }]) {
    const p = await t.open('template', { ...PAGE, viewport: vp });
    await t.fast(p, 8);
    for (let i = 0; i < 5; i++) { await p.waitForFunction(() => !MG.current.api.busy && !MG.current.ctx.locked); await p.locator('.tpl-star').tap(); }
    await p.waitForSelector('.mg-win__actions:not(.is-arming)');
    await p.waitForTimeout(900);
    const fit = await p.evaluate(() => {
      const H = window.innerHeight, W = window.innerWidth;
      return ['.mg-win__badge', '.mg-win .mg-btn--primary', '.mg-win .mg-btn--mid', '.mg-win__face'].map((s) => {
        const r = document.querySelector(s).getBoundingClientRect();
        return r.top >= -1 && r.bottom <= H + 1 && r.left >= -1 && r.right <= W + 1 ? null : `${s} [${Math.round(r.top)}..${Math.round(r.bottom)}] of ${H}`;
      }).filter(Boolean);
    });
    assert.deepStrictEqual(fit, [], `party card fits @${JSON.stringify(vp)}`);
    await t.shot(p, `shell-win-${typeof vp === 'string' ? vp : 'tiny-wide'}.png`);
  }

  // --- layouts: no page scroll anywhere, both themes
  for (const [vp, dark] of [['small', false], ['phoneWide', true], ['tablet', false], ['phone', true]]) {
    const p = await t.open('template', { ...PAGE, viewport: vp, dark });
    assert.ok(await t.noPageScroll(p), `no page scroll in game @${vp}`);
    await p.waitForTimeout(350);
    await t.shot(p, `shell-game-${vp}${dark ? '-dark' : ''}.png`);
    await p.evaluate(() => MG.pause());
    await p.waitForTimeout(450);
    await t.shot(p, `shell-pause-${vp}${dark ? '-dark' : ''}.png`);
    await p.evaluate(() => MG.home());
    assert.ok(await t.noPageScroll(p), `no page scroll on home @${vp}`);
    await t.shot(p, `shell-home-${vp}${dark ? '-dark' : ''}.png`);
  }
});
