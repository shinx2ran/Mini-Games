/* Super Slow Race: pick a leaf pile, hop that many stones, first to the picnic. */
'use strict';
const h = require('./harness');
const ID = 'race';

const api = (page, key) => page.evaluate((k) => MG.current.api[k], key);
const canPick = (page) => page.waitForFunction(() => MG.current && MG.current.api && MG.current.api.state === 'pick' && !MG.current.ctx.locked, null, { timeout: 30000 });
const PIECES = '.g-race .rc-stone, .g-race .rc-pad, .g-race .rc-blanket, .g-race .rc-tray.is-open .rc-pile';

/** Take one turn with a real tap on pile `choose(values)`; returns {player, steps, from, to}. */
async function turn(page, choose) {
  await canPick(page);
  const before = await page.evaluate(() => ({ p: MG.current.api.turn, pos: MG.current.api.positions, piles: MG.current.api.piles }));
  const index = choose(before.piles);
  await page.locator('.g-race .rc-tray.is-open .rc-pile').nth(index).tap();
  await page.waitForFunction((p) => MG.current.api.state === 'finish' || MG.current.api.state === 'done' || (MG.current.api.state === 'pick' && MG.current.api.turn !== p), before.p, { timeout: 30000 });
  const after = await api(page, 'positions');
  return { player: before.p, steps: before.piles[index], piles: before.piles, from: before.pos[before.p], to: after[before.p] };
}
const biggest = (v) => v.indexOf(Math.max(...v));

h.run(ID, async (t) => {
  const { assert } = t;

  // --- pure rules
  let page = await t.open(ID);
  const rules = await page.evaluate(() => {
    const a = MG.current.api;
    return {
      plain: a.pileSet(0, 1, 1), far: a.pileSet(4, 1, 0), near: a.pileSet(3, 1, 0),
      lots: a.pileSet(1, 2, 2), lotsAhead: a.pileSet(0, 2, 2), off: a.pileSet(9, 0, 0),
      rainbow: a.landing(4, true), banana: a.landing(12, true), noBanana: a.landing(12, false), stone: a.landing(5, true),
      nodes: a.path.length, finish: a.FINISH,
    };
  });
  assert.deepStrictEqual(rules.plain, [1, 2, 3]);
  assert.deepStrictEqual(rules.far, [2, 3, 3], 'whoever trails by 4+ gets better piles');
  assert.deepStrictEqual(rules.near, [1, 2, 3]);
  assert.deepStrictEqual(rules.lots, [2, 3, 3], 'at "Lots" the little player is boosted whenever she is behind');
  assert.deepStrictEqual(rules.lotsAhead, [1, 2, 3]);
  assert.deepStrictEqual(rules.off, [1, 2, 3], 'no boost for anyone when help is off');
  assert.deepStrictEqual(rules.rainbow, { kind: 'rainbow', to: 6 });
  assert.deepStrictEqual(rules.banana, { kind: 'banana', to: 11 });
  assert.strictEqual(rules.noBanana, null);
  assert.strictEqual(rules.stone, null);
  assert.strictEqual(rules.nodes, 16);
  assert.strictEqual(rules.finish, 15);

  // --- a whole race through real taps; every move obeys the rules; both racers finish
  await t.fast(page, 8);
  const first = await page.evaluate(() => MG.current.ctx.firstPlayer);
  let last = null, turns = 0, expected = first;
  for (;;) {
    last = await turn(page, biggest);
    turns++;
    assert.strictEqual(last.player, expected, 'turns strictly alternate');
    expected = 1 - expected;
    assert.deepStrictEqual([...last.piles].sort().join(''), last.piles.includes(1) ? '123' : '233');
    let want = Math.min(15, last.from + last.steps);
    const special = await page.evaluate(([at]) => MG.current.api.landing(at, MG.current.api.banana), [want]);
    if (special && want < 15) want = special.to;
    assert.strictEqual(last.to, want, `hopped ${last.steps} from ${last.from}`);
    if (last.to === 15) break;
    assert.ok(turns < 40, 'the race ends');
  }
  await t.waitForWin(page, 30000);
  assert.strictEqual(await page.locator('.mg-win').getAttribute('data-result'), String(last.player));
  assert.strictEqual(await page.locator('.mg-win__face.is-crowned').getAttribute('data-p'), String(last.player));
  assert.deepStrictEqual(await api(page, 'positions'), [15, 15], 'the other racer is zoomed to the picnic too');

  // --- mashing: slapping all three piles at once picks one, and the turn passes once
  page = await t.open(ID);
  await canPick(page);
  const who = await api(page, 'turn');
  await page.evaluate(() => {
    document.querySelectorAll('.g-race .rc-tray.is-open .rc-pile').forEach((el, k) => {
      const r = el.getBoundingClientRect();
      for (let n = 0; n < 3; n++) el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 50 + k * 3 + n, pointerType: 'touch', isPrimary: k + n === 0, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
    });
  });
  assert.strictEqual(await api(page, 'picked'), 0, 'the first finger wins');
  await t.fast(page, 8);
  await page.waitForFunction((p) => MG.current.api.state === 'pick' && MG.current.api.turn !== p, who, { timeout: 30000 });
  const posNow = await api(page, 'positions');
  assert.strictEqual(posNow[1 - who], 0, 'the other player did not move');

  // --- every supported size mid-race: nothing clipped, big piles; rotate and keep playing
  for (const vp of ['small', 'phone', 'phoneWide', 'tabletTall', 'tablet']) {
    const p = await t.open(ID, { viewport: vp, dark: vp === 'phoneWide' || vp === 'tabletTall' });
    await canPick(p);
    assert.deepStrictEqual(await t.outsidePlayArea(p, '.g-race .rc-racer__base, .g-race .rc-racer__mount'), [], `both racers on the mat at the start @${vp}`);
    await t.fast(p, 8);
    for (let k = 0; k < 4; k++) await turn(p, biggest);
    await canPick(p);
    await p.evaluate(() => { MG.timeScale = 1; });
    await p.waitForTimeout(700); // let the piles finish popping in before measuring
    assert.ok(await t.noPageScroll(p), `no page scroll @${vp}`);
    assert.deepStrictEqual(await t.outsidePlayArea(p, PIECES), [], `all in view @${vp}`);
    const size = await t.minTargetSize(p, '.g-race .rc-tray.is-open .rc-pile');
    assert.ok(size.count === 3 && size.min >= 64, `piles are big enough @${vp} (${size.min}px)`);
    await t.shot(p, `race-${vp}.png`);
    if (vp === 'phone') {
      await p.setViewportSize({ width: 844, height: 390 });
      await p.waitForTimeout(300);
      assert.deepStrictEqual(await t.outsidePlayArea(p, PIECES), [], 'still in view after rotating mid-race');
      await t.fast(p, 8);
      await turn(p, biggest);
    }
  }

  // --- leaving and coming back mid-hop leaves nothing behind
  page = await t.open(ID);
  for (let i = 0; i < 4; i++) {
    await canPick(page);
    await page.locator('.g-race .rc-tray.is-open .rc-pile').nth(i % 3).tap();
    await page.waitForTimeout(120);
    await page.evaluate(() => MG.home());
    await page.evaluate(() => MG.open('race'));
  }
  await canPick(page);
  assert.strictEqual(await page.locator('.g-race .rc-scene').count(), 1);
});
