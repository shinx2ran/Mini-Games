/* Ular Tangga: snakes and ladders, with a fresh board every game, stars and gifts. */
'use strict';
const h = require('./harness');
const ID = 'ular';

const api = (page, key) => page.evaluate((k) => MG.current.api[k], key);
const ready = (page) => page.waitForFunction(() => MG.current && MG.current.api && MG.current.api.state === 'roll' && !MG.current.ctx.locked, null, { timeout: 30000 });
const rollFor = (page, p, ids = [1]) => page.evaluate(([p, ids]) => {
  const b = document.querySelector(`.g-ular .ul-die[data-p="${p}"]`), r = b.getBoundingClientRect();
  ids.forEach((id) => b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: id, pointerType: 'touch', clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })));
  return MG.current.api.rolls;
}, [p, ids]);
/** A roll (1..6) from `from` that lands on a plain square, or 0. */
const plainRoll = (page, from) => page.evaluate((from) => {
  const a = MG.current.api, b = a.board;
  for (let v = 1; v <= 6; v++) { const hs = a.hops(from, v, a.N, a.exact); const to = hs[hs.length - 1]; if (to < a.N && !a.whatsOn(b, to)) return v; }
  return 0;
}, from);

h.run(ID, async (t) => {
  const { assert } = t;

  // --- pure rules: every board is a fair one
  let page = await t.open(ID);
  await ready(page);
  const r = await page.evaluate(() => {
    const a = MG.current.api, bad = [];
    for (const n of [6, 8, 10]) {
      for (let k = 0; k < 300; k++) {
        const b = a.makeBoard(n, Math.random, true), N = n * n, seen = new Set();
        const all = [].concat(b.ladders.flatMap((l) => [l.from, l.to]), b.snakes.flatMap((s) => [s.from, s.to]), b.stars, b.gifts);
        all.forEach((s) => { if (seen.has(s)) bad.push(n + ': square used twice'); seen.add(s); if (s <= 1 || s >= N) bad.push(n + ': on the first or last square'); });
        if (b.ladders.length !== { 6: 3, 8: 5, 10: 8 }[n] || b.snakes.length !== b.ladders.length) bad.push(n + ': counts');
        b.ladders.forEach((l) => { if (a.rowOf(l.to, n) <= a.rowOf(l.from, n)) bad.push('ladder not up'); if (Math.abs(a.xy(l.to, n).x - a.xy(l.from, n).x) > 2) bad.push('ladder sprawls'); });
        b.snakes.forEach((s) => { if (a.rowOf(s.to, n) >= a.rowOf(s.from, n)) bad.push('snake not down'); if (Math.abs(a.xy(s.to, n).x - a.xy(s.from, n).x) > 2.5) bad.push('snake sprawls'); });
      }
    }
    const plain = a.makeBoard(8, Math.random, false);
    return {
      bad: bad.slice(0, 4), plain: plain.stars.length + plain.gifts.length,
      xy: [a.xy(1, 8), a.xy(8, 8), a.xy(9, 8), a.xy(64, 8)],
      hops: [a.hops(60, 3, 64, false), a.hops(62, 5, 64, false), a.hops(62, 5, 64, true), a.hops(10, 1, 64, true)],
    };
  });
  assert.deepStrictEqual(r.bad, [], 'every board: ladders go up, snakes go down, no square used twice, nothing sprawls');
  assert.strictEqual(r.plain, 0, 'with twists off: no stars, no gifts');
  assert.deepStrictEqual(r.xy, [{ x: 0.5, y: 7.5 }, { x: 7.5, y: 7.5 }, { x: 7.5, y: 6.5 }, { x: 0.5, y: 0.5 }], 'square 1 bottom left, winding up, the crown top left on an even board');
  assert.deepStrictEqual(r.hops, [[61, 62, 63], [63, 64], [63, 64, 63, 62, 61], [11]], 'an overshoot stops at the top, or bounces back when the finish must be exact');

  // --- a roll: only the player whose turn it is can roll; the animal hops that many squares, counting; then it is the other's turn
  const first = await api(page, 'turn');
  assert.strictEqual(first, await page.evaluate(() => MG.current.ctx.firstPlayer));
  await page.waitForSelector('.mg-hint', { state: 'attached', timeout: 5000 });
  assert.strictEqual(await page.locator(`.g-ular .ul-die[data-p="${1 - first}"]`).getAttribute('aria-disabled'), 'true');
  await rollFor(page, 1 - first);
  assert.strictEqual(await api(page, 'rolls'), 0, 'the other die does nothing');
  let v = await plainRoll(page, 1);
  await page.evaluate((v) => MG.current.api.rig([v]), v);
  await rollFor(page, first, [3, 4, 5, 6, 7, 8]);
  assert.strictEqual(await api(page, 'rolls'), 1, 'six fingers on the die: one roll');
  await page.waitForFunction(() => MG.current.api.state === 'moving', null, { timeout: 5000 });
  await ready(page);
  assert.strictEqual((await api(page, 'pos'))[first], 1 + v, `hopped ${v}`);
  assert.strictEqual(await api(page, 'turn'), 1 - first, 'the other player\'s turn');
  const pips = await page.evaluate((p) => document.querySelectorAll(`.g-ular .ul-die[data-p="${p}"] .ul-pip.is-on`).length, first);
  assert.strictEqual(pips, v, 'the die shows the roll as dots');
  await t.fast(page, 6);

  // --- a ladder: land at its foot and climb to its top
  let b = await api(page, 'board');
  let me = await api(page, 'turn');
  const lad = b.ladders.find((l) => l.from > 3) || b.ladders[0];
  await page.evaluate(([me, s]) => MG.current.api.place(me, s), [me, lad.from - 2]);
  await page.evaluate(() => MG.current.api.rig([2]));
  await rollFor(page, me);
  await ready(page);
  assert.strictEqual((await api(page, 'pos'))[me], lad.to, 'up the ladder');

  // --- a snake: land on its head and slide down to its tail
  me = await api(page, 'turn');
  const sn = b.snakes[0];
  await page.evaluate(([me, s]) => MG.current.api.place(me, s), [me, sn.from - 3]);
  await page.evaluate(() => MG.current.api.rig([3]));
  await rollFor(page, me);
  await page.waitForFunction(() => MG.current.api.state === 'slide', null, { timeout: 10000 });
  assert.ok(await page.locator('.g-ular .ul-token.is-sliding').count(), 'whee, down it goes');
  await ready(page);
  assert.strictEqual((await api(page, 'pos'))[me], sn.to, 'down the snake');

  // --- a star: roll again; a gift: hop on one to three squares more
  if (b.stars.length) {
    me = await api(page, 'turn');
    await page.evaluate(([me, s]) => MG.current.api.place(me, s), [me, b.stars[0] - 1]);
    await page.evaluate(() => MG.current.api.rig([1]));
    await rollFor(page, me);
    await ready(page);
    assert.strictEqual(await api(page, 'turn'), me, 'a star: the same player rolls again');
    v = await plainRoll(page, (await api(page, 'pos'))[me]);
    await page.evaluate(([v]) => MG.current.api.rig([v]), [v || 1]);
    await rollFor(page, me);
    await ready(page);
    assert.strictEqual(await api(page, 'turn'), 1 - me);
  }
  {
    const N0 = await api(page, 'N');
    const gift = b.gifts.find((g) => g + 3 < N0);
    if (gift) {
      me = await api(page, 'turn');
      await page.evaluate(([me, s]) => MG.current.api.place(me, s), [me, gift - 1]);
      await page.evaluate(() => MG.current.api.rig([1]));
      await rollFor(page, me);
      await page.waitForFunction(() => ['roll', 'done'].includes(MG.current.api.state) && !MG.current.ctx.locked, null, { timeout: 15000 });
      const after = (await api(page, 'pos'))[me];
      assert.ok(after !== gift, `the gift hopped her on (now on ${after})`);
    }
  }

  // --- the crown: whoever gets there first wins
  me = await api(page, 'turn');
  const N = await api(page, 'N');
  await page.evaluate(([me, s]) => MG.current.api.place(me, s), [me, N - 3]);
  await page.evaluate(() => MG.current.api.rig([5]));
  await rollFor(page, me);
  await page.waitForFunction(() => MG.current.api.state === 'done', null, { timeout: 10000 });
  assert.strictEqual((await api(page, 'pos'))[me], N, 'a big roll near the top still gets there (any-roll finish)');
  await t.waitForWin(page, 10000);
  assert.strictEqual(await page.locator('.mg-win').getAttribute('data-result'), String(me));

  // --- exact finish (the grown-up's choice): an overshoot bounces back; the 100-square classic board
  page = await t.open(ID);
  await t.pause(page);
  await page.locator('.mg-seg__btn', { hasText: 'Exact' }).tap();
  await ready(page);
  await t.pause(page);
  await page.locator('.mg-seg__btn', { hasText: '100' }).tap();
  await ready(page);
  assert.strictEqual(await api(page, 'N'), 100);
  assert.strictEqual(await api(page, 'exact'), true);
  assert.strictEqual(await page.locator('.g-ular .ul-cell').count(), 100);
  me = await api(page, 'turn');
  {
    const land = await page.evaluate(() => { const a = MG.current.api; const hs = a.hops(98, 5, 100, true); return hs[hs.length - 1]; });
    assert.strictEqual(land, 97);
    const what = await page.evaluate(() => MG.current.api.whatsOn(MG.current.api.board, 97));
    await page.evaluate(([me]) => MG.current.api.place(me, 98), [me]);
    await page.evaluate(() => MG.current.api.rig([5]));
    await t.fast(page, 6);
    await rollFor(page, me);
    await page.waitForFunction(() => MG.current.api.state === 'roll' && !MG.current.ctx.locked, null, { timeout: 15000 });
    if (!what) assert.strictEqual((await api(page, 'pos'))[me], 97, 'bounced back off the top');
    assert.notStrictEqual(await api(page, 'state'), 'done');
  }

  // --- the quiet handicap: a little player at help Lots lands on a snake's head far less often than 1 in 6
  page = await t.open(null, { page: 'tests/play.html?g=ular' });
  await page.evaluate(() => MG.store.set('help', 2));
  await page.reload();
  await page.waitForFunction(() => window.MG && document.querySelector('#mg-home'));
  await page.evaluate(() => MG.open('ular'));
  await ready(page);
  {
    const r2 = await page.evaluate(() => {
      const a = MG.current.api, little = MG.current.ctx.players.findIndex((p) => p.little);
      return { little, adult: 1 - little, from: a.board.snakes[0].from };
    });
    // little player's turn: sample her rolls from three squares before a snake's head
    if ((await api(page, 'turn')) !== r2.little) {
      await page.evaluate((p) => MG.current.api.place(p, 2), r2.adult);
      const v2 = await plainRoll(page, 2);
      await page.evaluate((v) => MG.current.api.rig([v || 1]), v2);
      await rollFor(page, r2.adult);
      await ready(page);
    }
    await page.evaluate(([p, s]) => MG.current.api.place(p, s), [r2.little, r2.from - 3]);
    const counts = await page.evaluate(() => MG.current.api.sampleRolls(600));
    const onHead = counts[3] || 0;
    assert.ok(onHead < 50, `from three squares away she rolls the snake's 3 far less than 1 in 6 (${onHead} of 600, fair would be about 100)`);
    assert.ok(Object.keys(counts).length >= 5, 'and the die still shows every other number');
  }

  // --- every supported size: board, both dice and both animals in view; dice big; turn the screen mid-game
  for (const vp of ['small', 'phone', 'phoneWide', 'tabletTall', 'tablet']) {
    const p = await t.open(ID, { viewport: vp, dark: vp === 'phoneWide' || vp === 'small' });
    await ready(p);
    assert.ok(await t.noPageScroll(p), `no page scroll @${vp}`);
    assert.deepStrictEqual(await t.outsidePlayArea(p, '.g-ular .ul-board, .g-ular .ul-die, .g-ular .ul-seat'), [], `all in view @${vp}`);
    assert.ok((await t.minTargetSize(p, '.g-ular .ul-die')).min >= 76, `the dice are big @${vp}`);
    const inBoard = await p.evaluate(() => {
      const bd = document.querySelector('.g-ular .ul-board').getBoundingClientRect();
      return [...document.querySelectorAll('.g-ular .ul-token')].every((n) => { const r = n.getBoundingClientRect(); return r.left >= bd.left - 1 && r.right <= bd.right + 1 && r.top >= bd.top - 1 && r.bottom <= bd.bottom + 1; });
    });
    assert.ok(inBoard, `both animals are on the board @${vp}`);
    const clear = await p.evaluate(() => {
      const hit = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
      const bd = document.querySelector('.g-ular .ul-board').getBoundingClientRect();
      return [...document.querySelectorAll('.g-ular .ul-die')].filter((d) => hit(d.getBoundingClientRect(), bd)).length;
    });
    assert.strictEqual(clear, 0, `no die sits on the board @${vp}`);
    await t.shot(p, `ular-${vp}.png`);
    if (vp === 'phone') {
      const f = await api(p, 'turn');
      const v2 = await plainRoll(p, 1);
      await p.evaluate((v) => MG.current.api.rig([v]), v2);
      await rollFor(p, f);
      await p.setViewportSize({ width: 844, height: 390 });
      await ready(p);
      assert.strictEqual((await api(p, 'pos'))[f], 1 + v2, 'the hops finish even when the screen turns mid-move');
      assert.deepStrictEqual(await t.outsidePlayArea(p, '.g-ular .ul-board, .g-ular .ul-die'), [], 'still in view after rotating');
      const at = await p.evaluate((f) => {
        const a = MG.current.api, c = a.xy(a.pos[f], a.n), bd = document.querySelector('.g-ular .ul-board').getBoundingClientRect(), tk = document.querySelectorAll('.g-ular .ul-token')[f].getBoundingClientRect();
        return Math.hypot((tk.left + tk.right) / 2 - (bd.left + c.x / a.n * bd.width), (tk.top + tk.bottom) / 2 - (bd.top + c.y / a.n * bd.height));
      }, f);
      assert.ok(at < 12, `the animal is on its square after turning (${at.toFixed(0)}px off)`);
    }
  }

  // --- reduced motion: the waiting die does not wobble
  page = await t.open(ID, { reducedMotion: true });
  await ready(page);
  assert.strictEqual(await page.evaluate(() => getComputedStyle(document.querySelector('.g-ular .ul-seat.is-turn .ul-die')).animationName), 'none');

  // --- leaving and coming back mid-hop leaves nothing behind
  page = await t.open(ID);
  for (let i = 0; i < 3; i++) {
    await ready(page);
    await rollFor(page, await api(page, 'turn'));
    await page.waitForTimeout(700);
    await page.evaluate(() => MG.home());
    await page.evaluate(() => MG.open('ular'));
  }
  await ready(page);
  assert.strictEqual(await page.locator('.g-ular .ul-scene').count(), 1);
  assert.deepStrictEqual(await api(page, 'pos'), [1, 1]);
});
