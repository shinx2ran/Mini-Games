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
    const bad = [];
    for (const stones of [10, 14, 18]) for (const slip of [true, false]) for (let n = 0; n < 400; n++) {
      const c = a.makeCourse(stones, slip);
      const at = Object.keys(c.specials).map(Number);
      const kinds = at.map((i) => c.specials[i]).sort().join(',');
      if (kinds !== (slip ? 'boost,boost,gift,slip' : 'boost,boost,gift')) bad.push(`kinds ${kinds}`);
      if (c.finish !== stones + 1 || c.count !== stones + 2) bad.push('size');
      for (const i of at) {
        if (i < 3 || i > stones - 1) bad.push(`special at ${i}/${stones}`);
        if (c.specials[i] === 'gift') {
          const seen = new Set();
          for (let k = 0; k < 30; k++) { const l = a.landing(i, c); if (!l) { bad.push(`empty gift at ${i}`); break; } seen.add(l.to); if (l.to !== i + l.hops) bad.push('gift maths'); }
          for (const to of seen) { if (c.specials[to]) bad.push(`chain ${i}->${to}`); if (to > stones || to <= i || to > i + 3) bad.push(`gift to ${to}`); }
          continue;
        }
        const reach = c.specials[i] === 'boost' ? [2] : [-1];
        for (const d of reach) { if (c.specials[i + d]) bad.push(`chain ${i}->${i + d}`); if (i + d > stones || i + d < 1) bad.push(`off the path ${i + d}`); }
      }
    }
    const c = { stones: 14, finish: 15, count: 16, specials: { 4: 'boost', 7: 'gift', 12: 'slip' } };
    const gifts = new Set(); for (let n = 0; n < 200; n++) gifts.add(a.landing(7, c).hops);
    return {
      bad: bad.slice(0, 5),
      plain: a.pileSet(0, 1, 1), far: a.pileSet(4, 1, 0), near: a.pileSet(3, 1, 0),
      lots: a.pileSet(1, 2, 2), lotsAhead: a.pileSet(0, 2, 2), off: a.pileSet(9, 0, 0),
      boost: a.landing(4, c), slip: a.landing(12, c), stone: a.landing(5, c), gift: a.landing(7, c, () => 0.99), gifts: [...gifts].sort(),
      nodes: a.path.length, course: a.course, track: a.track, tracks: a.tracks,
    };
  });
  assert.deepStrictEqual(rules.bad, [], 'every shuffled course is fair: right surprises, in range, no chains');
  assert.deepStrictEqual(rules.plain, [1, 2, 3]);
  assert.deepStrictEqual(rules.far, [2, 3, 3], 'whoever trails by 4+ gets better piles');
  assert.deepStrictEqual(rules.near, [1, 2, 3]);
  assert.deepStrictEqual(rules.lots, [2, 3, 3], 'at "Lots" the little player is boosted whenever she is behind');
  assert.deepStrictEqual(rules.lotsAhead, [1, 2, 3]);
  assert.deepStrictEqual(rules.off, [1, 2, 3], 'no boost for anyone when help is off');
  assert.deepStrictEqual(rules.boost, { kind: 'boost', to: 6 });
  assert.deepStrictEqual(rules.slip, { kind: 'slip', to: 11 });
  assert.deepStrictEqual(rules.gift, { kind: 'gift', hops: 3, to: 10 });
  assert.deepStrictEqual(rules.gifts, [1, 2, 3], 'a present is 1, 2 or 3 extra hops');
  assert.strictEqual(rules.stone, null);
  assert.strictEqual(rules.nodes, 16);
  assert.strictEqual(rules.course.stones, 14);
  assert.strictEqual(rules.track, 'meadow', 'the first ever race is in the meadow');
  assert.deepStrictEqual(rules.tracks, ['meadow', 'pond', 'snow', 'beach']);

  // --- a whole race through real taps; every move obeys the rules; both racers finish
  await t.fast(page, 8);
  const first = await page.evaluate(() => MG.current.ctx.firstPlayer);
  const course = rules.course;
  let last = null, turns = 0, expected = first;
  for (;;) {
    last = await turn(page, biggest);
    turns++;
    assert.strictEqual(last.player, expected, 'turns strictly alternate');
    expected = 1 - expected;
    assert.deepStrictEqual([...last.piles].sort().join(''), last.piles.includes(1) ? '123' : '233');
    const base = Math.min(course.finish, last.from + last.steps);
    const kind = base < course.finish ? course.specials[base] : undefined;
    if (kind === 'boost') assert.strictEqual(last.to, base + 2, 'a boost rides forward 2');
    else if (kind === 'slip') assert.strictEqual(last.to, base - 1, 'a slip goes back 1');
    else if (kind === 'gift') assert.ok(last.to >= base + 1 && last.to <= Math.min(base + 3, course.stones) && !course.specials[last.to], 'a present gives 1-3 extra hops');
    else assert.strictEqual(last.to, base, `hopped ${last.steps} from ${last.from}`);
    if (last.to === course.finish) break;
    assert.ok(turns < 40, 'the race ends');
  }
  await t.waitForWin(page, 30000);
  assert.strictEqual(await page.locator('.mg-win').getAttribute('data-result'), String(last.player));
  assert.strictEqual(await page.locator('.mg-win__face.is-crowned').getAttribute('data-p'), String(last.player));
  assert.deepStrictEqual(await api(page, 'positions'), [course.finish, course.finish], 'the other racer is zoomed to the feast too');

  // --- "Surprise" visits a new place each race; short and long races fit every screen in every place
  await page.waitForSelector('.mg-win__actions:not(.is-arming)');
  await page.locator('.mg-win .mg-btn--primary').tap();
  await page.waitForFunction(() => MG.current && MG.current.ctx.round === 1 && MG.current.api);
  assert.strictEqual(await api(page, 'track'), 'pond', 'the next race is somewhere else');
  for (const [track, length, vp] of [['pond', 'long', 'small'], ['snow', 'short', 'phone'], ['beach', 'long', 'phoneWide'], ['snow', 'long', 'tabletTall'], ['beach', 'short', 'tablet'], ['pond', 'short', 'phoneWide']]) {
    const p = await t.open(null, { viewport: vp, dark: vp === 'phoneWide', page: 'tests/play.html?g=race' });
    await p.evaluate(([track, length]) => { MG.store.set('opt:race:track', track); MG.store.set('opt:race:length', length); MG.open('race'); }, [track, length]);
    await canPick(p);
    await p.waitForTimeout(700);
    const info = await p.evaluate(() => ({ track: document.querySelector('.g-race .rc-scene').dataset.track, stones: MG.current.api.course.stones, marks: document.querySelectorAll('.g-race .rc-mark').length }));
    assert.deepStrictEqual(info, { track, stones: { short: 10, normal: 14, long: 18 }[length], marks: 4 });
    assert.deepStrictEqual(await t.outsidePlayArea(p, PIECES + ', .g-race .rc-racer__base'), [], `all in view: ${track}/${length} @${vp}`);
    assert.ok((await t.minTargetSize(p, '.g-race .rc-tray.is-open .rc-pile')).min >= 64);
    const stone = await t.minTargetSize(p, '.g-race .rc-stone');
    assert.ok(stone.min >= 14, `stones still readable: ${track}/${length} @${vp} (${stone.min}px tall)`);
    await t.shot(p, `race-${track}-${length}-${vp}.png`);
  }

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
