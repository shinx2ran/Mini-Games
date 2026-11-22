/* Treasure Island: roll footprints, walk under the clouds, pick up gems and keys, open chests, meet the parrot and the crab. */
'use strict';
const h = require('./harness');
const ID = 'island';

const api = (page, key) => page.evaluate((k) => MG.current.api[k], key);
const state = (page, s) => page.waitForFunction((s) => MG.current && MG.current.api && MG.current.api.state === s && !MG.current.ctx.locked, s, { timeout: 30000 });
const tapEl = (page, sel, ids = [1]) => page.evaluate(([sel, ids]) => {
  const b = document.querySelector('.g-island ' + sel), r = b.getBoundingClientRect();
  ids.forEach((id) => b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: id, pointerType: 'touch', clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })));
}, [sel, ids]);
const rollDie = async (page, n) => { const me = await api(page, 'turn'); await page.evaluate((n) => MG.current.api.rig([n]), n); await tapEl(page, `.il-die[data-p="${me}"]`); await state(page, 'choose'); return me; };
const goTo = (page, k) => tapEl(page, `.il-sq[data-k="${k}"]`);
/** A square next to k (that is not k), for standing on before a one-step walk onto k. */
const besideOf = (k) => { const [x, y] = k.split(',').map(Number); return [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]].find(([a, b]) => a >= 0 && b >= 0 && a < 6 && b < 6); };
const findTile = (page, what) => page.evaluate((w) => { const t = MG.current.api.tiles; return Object.keys(t).find((k) => t[k].what === w); }, what);

h.run(ID, async (t) => {
  const { assert } = t;

  // --- pure rules
  let page = await t.open(ID);
  await state(page, 'roll');
  const r = await page.evaluate(() => {
    const a = MG.current.api, bad = [];
    for (let k = 0; k < 300; k++) {
      const d = a.deal(Math.random), all = Object.values(d.tiles), count = (w) => all.filter((x) => x.what === w).length;
      if (all.length !== 36) bad.push('size');
      if (count('gem') !== 8 || count('key') !== 2 || count('chest') !== 2 || count('parrot') !== 1 || count('crab') !== 1) bad.push('contents');
      d.starts.forEach((s) => { const x = d.tiles[a.key(s.x, s.y)]; if (!x.open || x.what) bad.push('start'); });
      if (all.filter((x) => !x.open).length !== 34) bad.push('clouds');
      if (a.treasureLeft(d.tiles) !== 8 + 2 * 3) bad.push('treasure');
    }
    const w2 = a.within({ x: 0, y: 5 }, 2);
    const tiles = {}; for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) tiles[a.key(x, y)] = { open: true };
    tiles['0,4'].open = false; tiles['0,3'].open = false;
    return { bad: bad.slice(0, 3), w2: Object.keys(w2).sort(), w3: Object.keys(a.within({ x: 2, y: 2 }, 3)).length, route: a.route({ x: 0, y: 5 }, { x: 1, y: 3 }, tiles) };
  });
  assert.deepStrictEqual(r.bad, [], 'every island: 8 gems, 2 keys, 2 chests, a parrot and a crab under 34 clouds');
  assert.deepStrictEqual(r.w2, ['0,3', '0,4', '1,4', '1,5', '2,5'], 'two footprints from the corner: these five squares');
  assert.strictEqual(r.w3, 22, 'three footprints from near the middle: 4 + 8 + 10 squares (two of the farthest are off the island)');
  assert.deepStrictEqual(r.route, [{ x: 0, y: 4 }, { x: 0, y: 3 }, { x: 1, y: 3 }], 'the walk goes the cloudier way');

  // --- a turn: tap your die, a few squares glow, tap one: you walk there, the clouds on the way puff off; then the other's turn
  const first = await api(page, 'turn');
  await page.waitForSelector('.mg-hint', { state: 'attached', timeout: 5000 });
  await tapEl(page, `.il-die[data-p="${1 - first}"]`);
  assert.strictEqual(await api(page, 'rolls'), 0, 'the other die does nothing');
  await page.evaluate(() => MG.current.api.rig([2]));
  await tapEl(page, `.il-die[data-p="${first}"]`, [3, 4, 5, 6]);
  assert.strictEqual(await api(page, 'rolls'), 1, 'four fingers on the die: one roll');
  await state(page, 'choose');
  assert.strictEqual(await page.locator('.g-island .il-foot').count() >= 2, true, 'two footprints on the die');
  const reach = await api(page, 'reach');
  assert.strictEqual(reach.length, 5);
  assert.strictEqual(await page.locator('.g-island .il-sq.is-reach').count(), 5, 'they glow');
  const far = await page.evaluate((reach) => { const t = MG.current.api.tiles; return Object.keys(t).find((k) => !reach.includes(k) && k !== '0,5' && k !== '5,5'); }, reach);
  await goTo(page, far);
  assert.strictEqual(await api(page, 'state'), 'choose', 'a square too far away does nothing');
  const dest = reach.find((k) => k === '0,3' || k === '5,3') || reach[0];
  await goTo(page, dest);
  await state(page, 'roll');
  const p0 = (await api(page, 'pos'))[first];
  assert.strictEqual(p0.x + ',' + p0.y, dest, 'walked there');
  const tl = await api(page, 'tiles');
  assert.ok(tl[dest].open, 'and the clouds there are gone');
  assert.strictEqual(await api(page, 'turn'), 1 - first);
  await t.fast(page, 6);

  // --- walking over a gem picks it up
  let me = await api(page, 'turn');
  const gem = await findTile(page, 'gem');
  let [bx, by] = besideOf(gem);
  await page.evaluate(([me, x, y]) => MG.current.api.place(me, x, y), [me, bx, by]);
  let g0 = (await api(page, 'bags'))[me].gems;
  await rollDie(page, 1);
  await goTo(page, gem);
  await state(page, 'roll');
  assert.strictEqual((await api(page, 'bags'))[me].gems, g0 + 1, 'a gem in the bag');
  assert.strictEqual(await page.locator(`.g-island .il-seat[data-p="${me}"] .il-got`).count() >= 1, true, 'shown in her bag');

  // --- a chest without a key just rattles; a key, then the chest: three gems
  me = await api(page, 'turn');
  const chestK = await findTile(page, 'chest');
  [bx, by] = besideOf(chestK);
  await page.evaluate(([me, x, y]) => MG.current.api.place(me, x, y), [me, bx, by]);
  g0 = (await api(page, 'bags'))[me].gems;
  const keys0 = (await api(page, 'bags'))[me].keys;
  if (!keys0) {
    await rollDie(page, 1);
    await goTo(page, chestK);
    await state(page, 'roll');
    assert.strictEqual((await api(page, 'tiles'))[chestK].what, 'chest', 'locked: it stays shut');
    me = await api(page, 'turn');
  }
  const keyK = await findTile(page, 'key');
  [bx, by] = besideOf(keyK);
  await page.evaluate(([me, x, y]) => MG.current.api.place(me, x, y), [me, bx, by]);
  await rollDie(page, 1);
  await goTo(page, keyK);
  await state(page, 'roll');
  assert.strictEqual((await api(page, 'bags'))[me].keys, 1, 'a key');
  me = await api(page, 'turn');
  // (now the other player's turn: hand the key holder the next turn by passing a turn)
  await rollDie(page, 1);
  await goTo(page, (await api(page, 'reach'))[0]);
  await state(page, 'roll');
  me = await api(page, 'turn');
  const holder = me;
  const chest2 = await findTile(page, 'chest');
  [bx, by] = besideOf(chest2);
  await page.evaluate(([me, x, y]) => MG.current.api.place(me, x, y), [holder, bx, by]);
  g0 = (await api(page, 'bags'))[holder].gems;
  await rollDie(page, 1);
  await goTo(page, chest2);
  await state(page, 'roll');
  const bag = (await api(page, 'bags'))[holder];
  assert.strictEqual(bag.keys, 0, 'the key opened it');
  assert.ok(bag.gems >= g0 + 3, 'three gems from the chest');
  assert.strictEqual((await api(page, 'tiles'))[chest2].what, 'opened');

  // --- a gem the crab hid on a chest's square is picked up AND the chest still opens (with the other key)
  let stashed = 0;
  {
    me = await api(page, 'turn');
    const keyK2 = await findTile(page, 'key');
    const chest3 = await findTile(page, 'chest');
    if (keyK2 && chest3) {
      [bx, by] = besideOf(keyK2);
      await page.evaluate(([me, x, y]) => MG.current.api.place(me, x, y), [me, bx, by]);
      await rollDie(page, 1);
      await goTo(page, keyK2);
      await state(page, 'roll');
      await rollDie(page, 1);                                         // (the other player's turn passes)
      await goTo(page, (await api(page, 'reach'))[0]);
      await state(page, 'roll');
      await page.evaluate((k) => MG.current.api.stash(k), chest3);
      stashed++;
      assert.strictEqual(await page.locator(`.g-island .il-sq[data-k="${chest3}"] .il-hidden-gem`).count(), 0, '(still under its cloud)');
      [bx, by] = besideOf(chest3);
      await page.evaluate(([me, x, y]) => MG.current.api.place(me, x, y), [me, bx, by]);
      const g1 = (await api(page, 'bags'))[me].gems;
      await rollDie(page, 1);
      await goTo(page, chest3);
      await state(page, 'roll');
      assert.strictEqual((await api(page, 'bags'))[me].gems, g1 + 1 + 3, 'the hidden gem and the chest\'s three');
      assert.strictEqual((await api(page, 'tiles'))[chest3].what, 'opened');
    }
  }
  // --- once rolled, the die rests (it does not wobble "tap me", and tapping it leaves the ghost hand alone)
  me = await api(page, 'turn');
  await rollDie(page, 2);
  assert.strictEqual(await page.locator(`.g-island .il-die[data-p="${me}"]`).getAttribute('aria-disabled'), 'true');
  await goTo(page, (await api(page, 'reach'))[0]);
  await state(page, 'roll');

  // --- the parrot flies you somewhere new
  me = await api(page, 'turn');
  const parrot = await findTile(page, 'parrot');
  [bx, by] = besideOf(parrot);
  await page.evaluate(([me, x, y]) => MG.current.api.place(me, x, y), [me, bx, by]);
  await rollDie(page, 1);
  await goTo(page, parrot);
  await state(page, 'roll');
  const flown = (await api(page, 'pos'))[me];
  assert.notStrictEqual(flown.x + ',' + flown.y, parrot, 'flown away from the parrot');
  assert.ok((await api(page, 'tiles'))[flown.x + ',' + flown.y].open, 'and the cloud where it landed is gone');

  // --- the crab snips a gem off a grown-up and hides it (no treasure is lost); a little player only gets tickled
  {
    const players = await page.evaluate(() => MG.current.ctx.players.map((p) => p.little));
    me = await api(page, 'turn');
    if (players[me]) { await rollDie(page, 1); await goTo(page, (await api(page, 'reach'))[0]); await state(page, 'roll'); me = await api(page, 'turn'); }
    const crab = await findTile(page, 'crab');
    [bx, by] = besideOf(crab);
    await page.evaluate(([me, x, y]) => MG.current.api.place(me, x, y), [me, bx, by]);
    const before = await page.evaluate((me) => ({ gems: MG.current.api.bags[me].gems, left: MG.current.api.left }), me);
    await rollDie(page, 1);
    await goTo(page, crab);
    await state(page, 'roll');
    const after = await page.evaluate((me) => ({ gems: MG.current.api.bags[me].gems, left: MG.current.api.left }), me);
    if (before.gems > 0) {
      assert.strictEqual(after.gems, before.gems - 1, 'snip: one gem gone from the grown-up');
      assert.strictEqual(after.left, before.left + 1, '...and hidden on the island to be found again');
    }
  }

  // --- a whole game: both always take the best square; when every gem is found, the richest wins
  for (let k = 0; k < 120; k++) {
    if ((await api(page, 'state')) === 'done') break;
    await state(page, 'roll').catch(() => {});
    if ((await api(page, 'state')) !== 'roll') break;
    me = await api(page, 'turn');
    await tapEl(page, `.il-die[data-p="${me}"]`);
    await state(page, 'choose');
    await goTo(page, await page.evaluate(() => MG.current.api.best()));
    await page.waitForFunction(() => ['roll', 'done'].includes(MG.current.api.state), null, { timeout: 15000 });
  }
  assert.strictEqual(await api(page, 'state'), 'done');
  assert.strictEqual(await api(page, 'left'), 0);
  const bags = await api(page, 'bags');
  assert.strictEqual(bags[0].gems + bags[1].gems, 14 + stashed, 'all 14 gems found (and the one the test hid), none lost, none doubled');
  await t.waitForWin(page, 15000);
  assert.strictEqual(await page.locator('.mg-win').getAttribute('data-result'), bags[0].gems === bags[1].gems ? 'tie' : bags[0].gems > bags[1].gems ? '0' : '1');
  assert.strictEqual(await page.locator('.g-island .il-sq:not(.is-open)').count(), 0, 'at the end the whole island shows');

  // --- a family game (a little player tapping any glowing square, a grown-up playing well) never drags on:
  //     once only shut chests are left, their locks rust off and whoever gets there first opens one
  for (let g = 0; g < 3; g++) {
    page = await t.open(ID);
    await state(page, 'roll');
    const turns = await page.evaluate(() => new Promise((resolve) => {
      MG.timeScale = 16;
      let n = 0, rusted = -1;
      const fire = (el) => el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: Math.random() * 1e6 | 0, pointerType: 'touch' }));
      MG.current.ctx.frame(function () {
        const a = MG.current.api, ctx = MG.current.ctx;
        if (a.rusty && rusted < 0) rusted = n;
        if (a.state === 'done' || n > 200) { resolve({ n, rusted, done: a.state === 'done' }); return; }
        if (ctx.locked) return;
        if (a.state === 'roll') { n++; fire(document.querySelector('.g-island .il-die[data-p="' + a.turn + '"]')); }
        else if (a.state === 'choose') {
          const little = ctx.players[a.turn].little, r = a.reach;
          fire(document.querySelector('.g-island .il-sq[data-k="' + (little ? r[Math.floor(Math.random() * r.length)] : a.best()) + '"]'));
        }
      });
    }));
    assert.ok(turns.done && turns.n <= 90, `a family game ends in good time (${turns.n} turns${turns.rusted >= 0 ? ', locks rusted at ' + turns.rusted : ''})`);
  }

  // --- a little player's footprints die rolls big at help Lots
  page = await t.open(null, { page: 'tests/play.html?g=island' });
  await page.evaluate(() => MG.store.set('help', 2));
  await page.reload();
  await page.waitForFunction(() => window.MG && document.querySelector('#mg-home'));
  await page.evaluate(() => MG.open('island'));
  await state(page, 'roll');
  await t.fast(page, 8);
  {
    const little = await page.evaluate(() => MG.current.ctx.players.findIndex((p) => p.little));
    const seen = [];
    for (let k = 0; k < 16; k++) {
      await state(page, 'roll');
      me = await api(page, 'turn');
      await tapEl(page, `.il-die[data-p="${me}"]`);
      await state(page, 'choose');
      if (me === little) seen.push(await api(page, 'roll'));
      await goTo(page, (await api(page, 'reach'))[0]);
      await page.waitForFunction(() => ['roll', 'done'].includes(MG.current.api.state), null, { timeout: 15000 });
      if ((await api(page, 'state')) === 'done') break;
    }
    assert.ok(seen.length >= 4 && seen.every((v) => v >= 2), `her die never shows a single footprint at help Lots (${seen})`);
  }

  // --- every supported size: map, dice and bags in view; squares big enough; turn the screen mid-walk
  for (const vp of ['small', 'phone', 'phoneWide', 'tabletTall', 'tablet']) {
    const p = await t.open(ID, { viewport: vp, dark: vp === 'phoneWide' || vp === 'small' });
    await state(p, 'roll');
    assert.ok(await t.noPageScroll(p), `no page scroll @${vp}`);
    assert.deepStrictEqual(await t.outsidePlayArea(p, '.g-island .il-map, .g-island .il-die, .g-island .il-seat'), [], `all in view @${vp}`);
    assert.ok((await t.minTargetSize(p, '.g-island .il-die')).min >= 70, `the dice are big @${vp}`);
    assert.ok((await t.minTargetSize(p, '.g-island .il-sq')).min >= 40, `squares are big enough to tap @${vp}`);
    const clear = await p.evaluate(() => {
      const hit = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
      const m = document.querySelector('.g-island .il-map').getBoundingClientRect();
      return [...document.querySelectorAll('.g-island .il-seat')].filter((s) => hit(s.getBoundingClientRect(), m)).length;
    });
    assert.strictEqual(clear, 0, `nothing covers the map @${vp}`);
    const who = await rollDie(p, 3);
    await t.shot(p, `island-${vp}.png`);
    if (vp === 'phone') {
      await goTo(p, await p.evaluate(() => MG.current.api.best()));
      await p.waitForTimeout(350);
      await p.setViewportSize({ width: 844, height: 390 });
      await state(p, 'roll');
      assert.deepStrictEqual(await t.outsidePlayArea(p, '.g-island .il-map, .g-island .il-die, .g-island .il-seat'), [], 'still in view after rotating');
      const off = await p.evaluate((who) => {
        const a = MG.current.api, b = a.pos[who], m = document.querySelector('.g-island .il-map').getBoundingClientRect(), n = document.querySelectorAll('.g-island .il-walker')[who].getBoundingClientRect();
        return Math.hypot((n.left + n.right) / 2 - (m.left + (b.x + 0.5) / a.SIZE * m.width), (n.top + n.bottom) / 2 - (m.top + (b.y + 0.5) / a.SIZE * m.height));
      }, who);
      assert.ok(off < 14, `the explorer is on its square after turning (${off.toFixed(0)}px off)`);
    }
  }

  // --- reduced motion: no glowing pulse, no wobbling die
  page = await t.open(ID, { reducedMotion: true });
  await state(page, 'roll');
  assert.strictEqual(await page.evaluate(() => getComputedStyle(document.querySelector('.g-island .il-seat.is-turn .il-die')).animationName), 'none');

  // --- leaving and coming back mid-walk leaves nothing behind
  page = await t.open(ID);
  for (let i = 0; i < 3; i++) {
    await state(page, 'roll');
    await rollDie(page, 3);
    await goTo(page, (await api(page, 'reach'))[0]);
    await page.evaluate(() => MG.home());
    await page.evaluate(() => MG.open('island'));
  }
  await state(page, 'roll');
  assert.strictEqual(await page.locator('.g-island .il-scene').count(), 1);
  assert.strictEqual(await api(page, 'left'), 14);
});
