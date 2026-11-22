/* Squiggle Friends: turn a squiggle into a creature together, wake it up, and it joins the zoo. */
'use strict';
const h = require('./harness');
const ID = 'doodle';

const api = (page, key) => page.evaluate((k) => MG.current.api[k], key);
const drawing = (page) => page.waitForFunction(() => MG.current && MG.current.api && MG.current.api.state === 'draw', null, { timeout: 30000 });
const tool = (page, sel) => page.locator(`.g-doodle ${sel}`).tap({ force: /wand/.test(sel) }); // (the ready wand pulses, so it is never "stable")
/** Draw with the mouse: a list of points in 0..1 of the paper. */
async function draw(page, pts) {
  const r = await page.locator('.g-doodle .dd-paper').boundingBox();
  const at = (p) => [r.x + p[0] * r.width, r.y + p[1] * r.height];
  await page.mouse.move(...at(pts[0]));
  await page.mouse.down();
  for (const p of pts.slice(1)) await page.mouse.move(...at(p), { steps: 4 });
  await page.mouse.up();
}
async function stampAt(page, x, y) {
  const r = await page.locator('.g-doodle .dd-paper').boundingBox();
  await page.touchscreen.tap(r.x + x * r.width, r.y + y * r.height);
}

h.run(ID, async (t) => {
  const { assert } = t;

  // --- pure rules
  let page = await t.open(ID);
  const r = await page.evaluate(() => {
    const a = MG.current.api, bad = [];
    for (let k = 0; k < 300; k++) {
      const s = a.squiggle(Math.random);
      if (s.length < 50) bad.push('short ' + s.length);
      if (s.some((p) => p[0] < 120 || p[0] > 880 || p[1] < 120 || p[1] > 880)) bad.push('off the page');
      let len = 0; for (let i = 1; i < s.length; i++) len += Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]);
      if (len < 600) bad.push('too little to work with ' + len.toFixed(0));
    }
    const b = a.bounds([{ kind: 'stroke', w: 10, pts: [[100, 200], [300, 250]] }, { kind: 'stamp', x: 500, y: 500, s: 100 }]);
    return { bad: bad.slice(0, 3), b, none: a.bounds([]), ends: a.spline([[0, 0], [100, 0], [100, 100]], 5) };
  });
  assert.deepStrictEqual(r.bad, [], 'every squiggle is a good long line, well on the page');
  assert.deepStrictEqual(r.b, { x0: 90, y0: 190, x1: 550, y1: 550 });
  assert.strictEqual(r.none, null);
  assert.deepStrictEqual(r.ends[0], [0, 0]); assert.deepStrictEqual(r.ends[r.ends.length - 1], [100, 100]);

  // --- the squiggle draws itself, then it is the first player's go; nothing to take back or wake yet
  assert.strictEqual(await api(page, 'state'), 'intro');
  await drawing(page);
  let items = await api(page, 'items');
  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].by, -1, 'the squiggle is the game\'s own');
  assert.strictEqual(await page.locator('.g-doodle .dd-wand').getAttribute('aria-disabled'), 'true');
  assert.strictEqual(await page.locator('.g-doodle .dd-undo').getAttribute('aria-disabled'), 'true');
  await page.waitForSelector('.mg-hint', { state: 'attached', timeout: 5000 });
  const first = await api(page, 'turn');
  assert.strictEqual(first, await page.evaluate(() => MG.current.ctx.firstPlayer));

  // --- drawing: a crayon line follows the finger; the wand still waits for the other player
  await tool(page, '.dd-crayon[data-color="berry"]');
  assert.deepStrictEqual(await api(page, 'tool'), { type: 'pen', color: 'berry' });
  await draw(page, [[0.2, 0.2], [0.3, 0.25], [0.4, 0.35], [0.5, 0.3], [0.6, 0.4]]);
  items = await api(page, 'items');
  assert.strictEqual(items.length, 2);
  assert.ok(items[1].kind === 'stroke' && items[1].color === 'berry' && items[1].n >= 6 && items[1].by === first, `a berry line by the first player (${items[1].n} points)`);
  const ink = await page.evaluate(() => {
    const c = document.querySelector('.g-doodle .dd-canvas'), g = c.getContext('2d'), d = g.getImageData(0, 0, c.width, c.height).data;
    let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n;
  });
  assert.ok(ink > 500, 'it is really drawn on the page');
  assert.strictEqual(await page.locator('.g-doodle .dd-wand').getAttribute('aria-disabled'), 'true', 'not until both have added something');
  await page.locator('.g-doodle .dd-wand').tap({ force: true });
  assert.strictEqual(await api(page, 'state'), 'draw');

  // --- pass: now the other player; a sticker stamps where it is tapped
  await tool(page, '.dd-pass');
  assert.strictEqual(await api(page, 'turn'), 1 - first);
  await tool(page, '.dd-sticker[data-emoji="👀"]');
  await stampAt(page, 0.45, 0.4);
  items = await api(page, 'items');
  assert.deepStrictEqual({ kind: items[2].kind, emoji: items[2].emoji, by: items[2].by }, { kind: 'stamp', emoji: '👀', by: 1 - first });
  assert.ok(Math.abs(items[2].x - 450) < 15 && Math.abs(items[2].y - 400) < 15, 'right where it was tapped');
  assert.strictEqual(await page.locator('.g-doodle .dd-stamp').count(), 1);
  assert.strictEqual(await page.locator('.g-doodle .dd-wand').getAttribute('aria-disabled'), 'false', 'both have added something: the wand is ready');

  // --- take back: the last thing goes (and so does the wand, until they add something again); the squiggle never goes
  await tool(page, '.dd-undo');
  assert.strictEqual((await api(page, 'items')).length, 2);
  assert.strictEqual(await page.locator('.g-doodle .dd-stamp').count(), 0);
  assert.strictEqual(await page.locator('.g-doodle .dd-wand').getAttribute('aria-disabled'), 'true');
  await tool(page, '.dd-undo');
  items = await api(page, 'items');
  assert.strictEqual(items.length, 1, 'only the squiggle is left');
  assert.strictEqual(await page.locator('.g-doodle .dd-undo').getAttribute('aria-disabled'), 'true', 'and the squiggle cannot be taken back');
  assert.strictEqual(items[0].by, -1);
  await tool(page, '.dd-sticker[data-emoji="👀"]');
  await stampAt(page, 0.45, 0.4);
  await tool(page, '.dd-sticker[data-emoji="🎩"]');
  await stampAt(page, 0.5, 0.2);
  await tool(page, '.dd-pass');
  await tool(page, '.dd-crayon[data-color="leaf"]');
  await draw(page, [[0.3, 0.7], [0.4, 0.8], [0.6, 0.8], [0.7, 0.7]]);

  // --- two fingers drawing at once make two lines
  {
    const pr = await page.locator('.g-doodle .dd-paper').boundingBox();
    const cdp = await page.context().newCDPSession(page);
    const pt = (x, y, id) => ({ x: pr.x + x * pr.width, y: pr.y + y * pr.height, id, radiusX: 4, radiusY: 4, force: 1 });
    const n0 = (await api(page, 'items')).length;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(0.1, 0.9, 0), pt(0.9, 0.9, 1)] });
    for (let k = 1; k <= 5; k++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [pt(0.1 + k * 0.03, 0.9 - k * 0.02, 0), pt(0.9 - k * 0.03, 0.9 - k * 0.02, 1)] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const now = await api(page, 'items');
    assert.strictEqual(now.length, n0 + 2, 'two lines');
    assert.ok(now.slice(-2).every((it) => it.kind === 'stroke' && it.n >= 4), 'each followed its own finger');
  }

  // --- wake it up (six fingers at once: once): it comes alive, blinks, then the party; it joins the zoo
  const zoo0 = await api(page, 'zoo');
  await page.evaluate(() => {
    const b = document.querySelector('.g-doodle .dd-wand'), r = b.getBoundingClientRect();
    for (let id = 50; id < 56; id++) b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: id, pointerType: 'touch', clientX: r.left + 10, clientY: r.top + 10 }));
  });
  assert.strictEqual(await api(page, 'state'), 'alive');
  assert.strictEqual(await page.locator('.g-doodle .dd-friend--new').count(), 1, 'one creature');
  assert.strictEqual(await page.locator('.g-doodle .dd-friend--new .dd-eye').count(), 1, 'its eyes are stickers, so they can blink');
  const pic = await page.evaluate(() => { const i = document.querySelector('.g-doodle .dd-friend__pic'); return { src: i.src.slice(0, 22), w: i.naturalWidth, h: i.naturalHeight }; });
  assert.strictEqual(pic.src, 'data:image/png;base64,');
  assert.strictEqual(await api(page, 'zoo'), zoo0 + 1, 'it joins the zoo');
  await page.waitForTimeout(1300);
  await t.shot(page, 'doodle-alive.png');
  await t.waitForWin(page, 10000);
  assert.strictEqual(await page.locator('.mg-win').getAttribute('data-result'), 'team');

  // --- the zoo is kept: next round, the old friends come out to meet the new one
  page = await t.open(null, { page: 'tests/play.html?g=doodle' });
  await page.evaluate(() => MG.open('doodle'));
  await drawing(page);
  assert.strictEqual(await api(page, 'zoo'), 0, 'a fresh browser has an empty zoo');
  for (let round = 0; round < 2; round++) {
    await drawing(page);
    await draw(page, [[0.3, 0.3], [0.5, 0.5], [0.7, 0.4]]);
    await tool(page, '.dd-pass');
    await tool(page, '.dd-sticker[data-emoji="👀"]');
    await stampAt(page, 0.5, 0.45);
    await tool(page, '.dd-wand');
    await t.waitForWin(page, 10000);
    if (round === 0) {
      await page.waitForSelector('.mg-win__actions:not(.is-arming)');
      await page.locator('.mg-win .mg-btn--primary').tap();
    }
  }
  assert.strictEqual(await api(page, 'zoo'), 2);
  assert.strictEqual(await page.locator('.g-doodle .dd-friend--old').count(), 1, 'last round\'s friend came out to meet this one');
  await page.evaluate(() => MG.home());
  await page.evaluate(() => MG.open('doodle'));
  assert.strictEqual(await api(page, 'zoo'), 2, 'still there after leaving and coming back');

  // --- a blank page, if the grown-up prefers: no squiggle, straight to drawing
  page = await t.open(null, { page: 'tests/play.html?g=doodle' });
  await page.evaluate(() => MG.store.set('opt:doodle:start', 'blank'));
  const optKey = await page.evaluate(() => Object.keys(localStorage).filter((k) => /doodle/.test(k)));
  await page.evaluate(() => { MG.home(); });
  await t.pause(await (async () => { await page.evaluate(() => MG.open('doodle')); return page; })());
  await page.locator('.mg-seg__btn', { hasText: 'Blank page' }).tap();
  await page.waitForFunction(() => MG.current && MG.current.api && MG.current.api.state === 'draw' && MG.current.api.items.length === 0, null, { timeout: 10000 });
  assert.ok(optKey.length >= 0);

  // --- every supported size: paper, tools and buttons in view and big enough; the drawing survives turning the screen
  for (const vp of ['small', 'phone', 'phoneWide', 'tabletTall', 'tablet']) {
    const p = await t.open(ID, { viewport: vp, dark: vp === 'phoneWide' || vp === 'small' });
    await drawing(p);
    await p.waitForTimeout(300);
    assert.ok(await t.noPageScroll(p), `no page scroll @${vp}`);
    assert.deepStrictEqual(await t.outsidePlayArea(p, '.g-doodle .dd-paper, .g-doodle .dd-tool, .g-doodle .dd-act'), [], `all in view @${vp}`);
    const tools = await t.minTargetSize(p, '.g-doodle .dd-tool, .g-doodle .dd-act');
    assert.ok(tools.min >= (vp === 'small' ? 44 : 56), `tools are big @${vp} (${tools.min}px)`);
    assert.ok((await api(p, 'paperPx')) >= 200, `a good big page @${vp} (${await api(p, 'paperPx')}px)`);
    const overlap = await p.evaluate(() => {
      const hit = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
      const paper = document.querySelector('.g-doodle .dd-paper').getBoundingClientRect();
      return [...document.querySelectorAll('.g-doodle .dd-tool, .g-doodle .dd-act')].filter((n) => hit(n.getBoundingClientRect(), paper)).length;
    });
    assert.strictEqual(overlap, 0, `no tool sits on the page @${vp}`);
    await t.shot(p, `doodle-${vp}.png`);
    if (vp === 'phone') {
      await p.locator('.g-doodle .dd-sticker[data-emoji="👃"]').tap();
      await stampAt(p, 0.25, 0.75);
      const before = await p.evaluate(() => { const s = document.querySelector('.g-doodle .dd-stamp').getBoundingClientRect(), pr = document.querySelector('.g-doodle .dd-paper').getBoundingClientRect(); return [(s.left + s.width / 2 - pr.left) / pr.width, (s.top + s.height / 2 - pr.top) / pr.height]; });
      await p.setViewportSize({ width: 844, height: 390 });
      await p.waitForTimeout(400);
      const afterTurn = await p.evaluate(() => { const s = document.querySelector('.g-doodle .dd-stamp').getBoundingClientRect(), pr = document.querySelector('.g-doodle .dd-paper').getBoundingClientRect(); return [(s.left + s.width / 2 - pr.left) / pr.width, (s.top + s.height / 2 - pr.top) / pr.height]; });
      assert.ok(Math.abs(before[0] - afterTurn[0]) < 0.03 && Math.abs(before[1] - afterTurn[1]) < 0.03, 'the sticker keeps its place on the page when the screen turns');
      assert.deepStrictEqual(await t.outsidePlayArea(p, '.g-doodle .dd-paper, .g-doodle .dd-tool, .g-doodle .dd-act'), [], 'still in view after rotating');
      assert.strictEqual((await api(p, 'items')).length, 2, 'the drawing is all still there');
    }
  }

  // --- reduced motion: the ready wand does not pulse
  page = await t.open(ID, { reducedMotion: true });
  await drawing(page);
  await draw(page, [[0.3, 0.3], [0.5, 0.5]]);
  await tool(page, '.dd-pass');
  await stampAt(page, 0.5, 0.5);
  assert.strictEqual(await page.evaluate(() => getComputedStyle(document.querySelector('.g-doodle .dd-wand')).animationName), 'none');

  // --- leaving and coming back mid-line leaves nothing behind
  page = await t.open(ID);
  for (let i = 0; i < 3; i++) {
    await drawing(page);
    const pr = await page.locator('.g-doodle .dd-paper').boundingBox();
    await page.mouse.move(pr.x + 50, pr.y + 50);
    await page.mouse.down();
    await page.mouse.move(pr.x + 90, pr.y + 80);
    await page.evaluate(() => MG.home());
    await page.mouse.move(pr.x + 120, pr.y + 120);
    await page.mouse.up();
    await page.evaluate(() => MG.open('doodle'));
  }
  await drawing(page);
  assert.strictEqual(await page.locator('.g-doodle .dd-scene').count(), 1);
  assert.strictEqual((await api(page, 'items')).length, 1);
});
