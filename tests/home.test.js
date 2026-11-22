/* The real page: every game is on the shelf, opens from its tile, and comes home cleanly. */
'use strict';
const h = require('./harness');

const EXPECTED = ['hide', 'dragon', 'slurp', 'wheel', 'twins', 'race', 'cafe', 'tower', 'bop', 'tiptoe', 'tray', 'wiggle', 'stack', 'doodle', 'band'];

h.run('home', async (t) => {
  const { assert } = t;
  const page = await t.open(null, { full: true });

  const ids = await page.evaluate(() => MG.games.map((g) => g.id));
  assert.deepStrictEqual(ids, EXPECTED, 'all games registered, in shelf order');
  assert.strictEqual(await page.locator('.mg-tile').count(), EXPECTED.length);

  const meta = await page.evaluate(() => MG.games.map((g) => ({ id: g.id, name: g.name, emoji: g.emoji, color: g.color, howTo: g.howTo })));
  for (const g of meta) {
    assert.ok(g.name && g.emoji && g.howTo, `${g.id} has a name, a tile emoji and a how-to line`);
    assert.ok(MG_COLORS.includes(g.color), `${g.id} uses a house colour`);
  }

  // every game opens from its tile, shows something, and leaves nothing behind
  for (const id of EXPECTED) {
    await page.locator(`.mg-tile[data-game="${id}"]`).tap();
    await page.waitForFunction((g) => MG.current && MG.current.id === g, id);
    assert.ok(await page.evaluate(() => document.querySelector('#mg-game').childElementCount > 0), `${id} renders`);
    assert.ok(await t.noPageScroll(page), `${id}: no page scroll`);
    await page.waitForTimeout(150);
    await page.evaluate(() => MG.home());
    await page.waitForFunction(() => !MG.current && !document.querySelector('#mg-home').hidden);
    assert.strictEqual(await page.evaluate(() => document.querySelector('#mg-game').childElementCount), 0, `${id} cleans up`);
  }

  // hopping straight between games (Back/forward, deep links) never leaks one game into the next
  for (const id of EXPECTED) {
    await page.evaluate((g) => MG.open(g), id);
    await page.waitForFunction((g) => MG.current && MG.current.id === g, id);
    const scopes = await page.evaluate(() => [...document.querySelector('#mg-game').classList].filter((c) => c.startsWith('g-')));
    assert.deepStrictEqual(scopes, [`g-${id}`], 'exactly one game scope on the play area');
  }
  await page.evaluate(() => MG.home());

  // the shelf fits without sideways scroll at every supported size
  for (const vp of ['small', 'phone', 'phoneWide', 'tabletTall', 'tablet']) {
    const p = await t.open(null, { full: true, viewport: vp });
    const m = await p.evaluate(() => ({ docW: document.documentElement.scrollWidth, winW: window.innerWidth, tiles: document.querySelectorAll('.mg-tile').length }));
    assert.ok(m.docW <= m.winW + 1, `home has no sideways scroll @${vp}`);
    assert.strictEqual(m.tiles, EXPECTED.length);
    const small = await t.minTargetSize(p, '.mg-tile');
    assert.ok(small.min >= 96, `tiles are big enough @${vp} (${small.min}px)`);
  }
});

const MG_COLORS = ['berry', 'tangerine', 'sun', 'leaf', 'sea', 'grape'];
