/* Acorn Quest: a two-player adventure in five stages — run, jump, bop, bubbles, springs, gates, keys and home. */
'use strict';
const h = require('./harness');
const ID = 'quest';

const api = (page, key) => page.evaluate((k) => MG.current.api[k], key);
const onMap = (page) => page.waitForFunction(() => MG.current && MG.current.api && MG.current.api.state === 'map', null, { timeout: 30000 });
/** Open stage i (unlocking everything first, so any stage can be tested). */
async function openStage(page, i, opts = {}) {
  await page.evaluate((o) => {
    localStorage.setItem('mg:game:quest:progress', JSON.stringify({ cleared: o.cleared == null ? 5 : o.cleared, stars: [] }));
    MG.home(); MG.open('quest');
  }, opts);
  await onMap(page);
  await page.evaluate((i) => document.querySelectorAll('.g-quest .aq-node')[i].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 77, pointerType: 'touch' })), i);
  await page.waitForFunction(() => MG.current.api.state === 'play', null, { timeout: 10000 });
}
/** Press (and hold, until released) one of player p's keys. */
const key = (page, p, k, down) => page.evaluate(([p, k, down]) => {
  const b = document.querySelector(`.g-quest .aq-pad[data-p="${p}"] .aq-key[data-k="${k}"]`), r = b.getBoundingClientRect(), id = 400 + p * 10 + ['left', 'right', 'jump'].indexOf(k);
  if (down) b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: id, pointerType: 'touch', clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
  else window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: id, pointerType: 'touch' }));
}, [p, k, down]);
const hero = async (page, i) => (await api(page, 'heroes'))[i];
const gameWait = async (page, s) => { const t0 = await page.evaluate(() => MG.current.ctx.time); await page.waitForFunction(([t, s]) => MG.current.ctx.time - t >= s, [t0, s], { timeout: 30000 }); };

h.run(ID, async (t) => {
  const { assert } = t;

  // --- the stages: five of them, each with a start, a way home, and three hidden stars
  let page = await t.open(ID);
  await onMap(page);
  const st = await page.evaluate(() => {
    const a = MG.current.api;
    return a.STAGES.map((s, i) => {
      const b = a.buildStage(i), kinds = {};
      b.things.forEach((x) => { kinds[x.kind] = (kinds[x.kind] || 0) + 1; });
      return { name: s.name, w: b.w, h: b.h, rows: b.grid.map((r) => r.length), kinds, start: b.start };
    });
  });
  assert.strictEqual(st.length, 5);
  st.forEach((s, i) => {
    assert.strictEqual(s.h, 12);
    assert.ok(s.rows.every((n) => n === s.w), `${s.name}: every row the same length`);
    assert.strictEqual(s.kinds['*'], 3, `${s.name}: three stars`);
    assert.ok((s.kinds.H || 0) + (s.kinds.u || 0) === 1, `${s.name}: one way home`);
    assert.ok(s.w >= 100 && s.w <= 170, `${s.name}: a good length (${s.w} squares)`);
    assert.ok(s.kinds.o >= 8, `${s.name}: plenty of acorns`);
  });
  assert.ok(st[1].kinds.G && st[1].kinds.B, 'the woods have a gate and its button');

  // --- every stage can be played: from the start, walking, falling, jumping (2 up, 3 across), springs (4 up),
  //     super jumps off a buddy (3 up), rafts and lifts, the home and every star, key and button can be reached
  const reach = await page.evaluate(() => {
    const a = MG.current.api, out = [];
    a.STAGES.forEach((def, si) => {
      const b = a.buildStage(si), W = b.w, H = b.h;
      const at = (c, r) => (c < 0 || c >= W ? '#' : r < 0 || r >= H ? '.' : b.grid[r][c]);
      const things = b.things, gates = {}, doors = {};
      things.forEach((t) => { if (t.kind === 'G') gates[t.x] = t.y; if (t.kind === 'D') doors[t.x] = t.y; });
      let gateOpen = false, doorOpen = false;
      const rafts = things.filter((t) => t.kind === 'raft'), lifts = things.filter((t) => t.kind === 'lift');
      const solid = (c, r) => { const t = at(c, r); return t === '#' || t === '=' || (!gateOpen && gates[c] != null && r <= gates[c]) || (!doorOpen && doors[c] != null && r <= doors[c]); };
      const deck = (c, r) => rafts.some((m) => r === m.y && c >= m.x && c <= m.x + 2 + 99 && !solid(c, r) && c < W) && at(c, r) === '~' ||
        lifts.some((m) => c >= m.x && c <= m.x + 2 && r <= m.y && r >= m.y - 4);
      const floor = (c, r) => solid(c, r) || at(c, r) === '-' || deck(c, r);
      // a hero standing in cell (c, r): free there and above, something to stand on below
      const stand = (c, r) => r >= 1 && r < H && !solid(c, r) && !solid(c, r - 1) && floor(c, r + 1) && !deck(c, r);
      const spring = {}; things.forEach((t) => { if (t.kind === 'S') spring[t.x + ',' + t.y] = true; });
      const run = () => {
        const seen = new Set(), q = [];
        const s0 = [Math.floor(b.start.x), Math.floor(b.start.y) - 1];
        q.push(s0); seen.add(s0.join(','));
        while (q.length) {
          const [c, r] = q.shift();
          const rise = spring[c + ',' + r] ? 4 : 3;               // 3 = a super jump off a buddy
          for (let dy = -rise; dy <= 12; dy++) {
            for (let dx = -4; dx <= 4; dx++) {
              const c2 = c + dx, r2 = r + dy;
              if ((dx === 0 && dy === 0) || seen.has(c2 + ',' + r2) || !stand(c2, r2)) continue;
              if (dy < 0) {                                           // going up: room over the take-off spot, and over the landing
                let ok = true;
                for (let k = 1; k <= -dy + 1; k++) if (solid(c, r - k)) ok = false;
                if (Math.abs(dx) > 3 || !ok) continue;
              } else if (Math.abs(dx) > 4 + dy * 0.5) continue;       // level or falling (squares count centre to centre: a hero stands right on an edge)
              seen.add(c2 + ',' + r2); q.push([c2, r2]);
            }
          }
        }
        return seen;
      };
      let seen = run();
      const touch = (t, up, side = 1) => [...seen].some((k) => { const [c, r] = k.split(',').map(Number); return Math.abs(c - t.x) <= side && t.y <= r && t.y >= r - up; });
      const button = things.find((t) => t.kind === 'B'), key = things.find((t) => t.kind === 'K');
      if (button && touch(button, 0)) { gateOpen = true; seen = run(); }
      if (key && touch(key, 4)) { doorOpen = true; seen = run(); }
      const home = things.find((t) => t.kind === 'H' || t.kind === 'u');
      const stars = things.filter((t) => t.kind === '*');
      const springTouch = (t) => [...seen].some((k) => { const [c, r] = k.split(',').map(Number); return spring[c + ',' + r] && Math.abs(c - t.x) <= 3 && t.y >= r - 5; });
      out.push({
        name: def.name,
        home: touch(home, 0),
        button: button ? touch(button, 0) : true,
        key: key ? touch(key, 4) : true,
        stars: stars.map((t) => touch(t, 4) || springTouch(t)),
        acorns: things.filter((t) => t.kind === 'o').filter((t) => !(touch(t, 4, 2) || springTouch(t))).map((t) => t.x + ',' + t.y), // (picked up mid-jump, over a pit)
      });
    });
    return out;
  });
  reach.forEach((r) => {
    assert.ok(r.home, `${r.name}: home can be reached`);
    assert.ok(r.button, `${r.name}: the gate's button can be reached`);
    assert.ok(r.key, `${r.name}: the key can be reached`);
    assert.ok(r.stars.every(Boolean), `${r.name}: every star can be reached (${r.stars})`);
    assert.deepStrictEqual(r.acorns, [], `${r.name}: every acorn can be reached`);
  });
  assert.ok(st[4].kinds.K && st[4].kinds.D && st[4].kinds.u, 'the cave has the key, the door, and the baby bird to rescue');

  // --- the map: only the first stage is open at the start; the locked ones cannot be opened
  assert.strictEqual(await page.locator('.g-quest .aq-node:not(.is-locked)').count(), 1);
  await page.waitForSelector('.mg-hint', { state: 'attached', timeout: 5000 });
  await page.evaluate(() => document.querySelectorAll('.g-quest .aq-node')[3].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 5, pointerType: 'touch' })));
  await page.waitForTimeout(400);
  assert.strictEqual(await api(page, 'state'), 'map', 'a locked stage stays shut');

  // --- the controls: the grown-up has left, right and jump; the little one (with help on) has one big jump button
  await page.locator('.g-quest .aq-node').first().tap({ force: true }); // (the next stop pulses: it never holds still)
  await page.waitForFunction(() => MG.current.api.state === 'play');
  const follow = await api(page, 'followIdx');
  const lead = 1 - follow;
  assert.ok(follow === 0 || follow === 1, 'one hero follows the other');
  assert.strictEqual(await page.locator(`.g-quest .aq-pad[data-p="${follow}"] .aq-key`).count(), 1, 'her one big button');
  assert.strictEqual(await page.locator(`.g-quest .aq-pad[data-p="${lead}"] .aq-key`).count(), 3);

  // --- walking and jumping
  let a0 = await hero(page, lead);
  await key(page, lead, 'right', true);
  await gameWait(page, 0.5);
  let a1 = await hero(page, lead);
  assert.ok(a1.x > a0.x + 1.5, `holding right walks right (${(a1.x - a0.x).toFixed(1)} squares)`);
  await key(page, lead, 'right', false);
  await gameWait(page, 0.4);
  a0 = await hero(page, lead);
  await gameWait(page, 0.3);
  assert.ok(Math.abs((await hero(page, lead)).x - a0.x) < 0.05, 'letting go stops');
  // her hero ran after his and stopped close behind
  const f0 = await hero(page, follow);
  assert.ok(Math.abs(f0.x - a0.x) < 2, `she followed (${(a0.x - f0.x).toFixed(1)} behind)`);
  await key(page, lead, 'jump', true);
  await gameWait(page, 0.2);
  a1 = await hero(page, lead);
  assert.ok(a1.y < a0.y - 1, 'jump!');
  await key(page, lead, 'jump', false);
  await gameWait(page, 0.8);
  assert.ok((await hero(page, lead)).ground, 'and back down');
  // a quick tap is a smaller hop than holding
  const hop = await page.evaluate(() => new Promise((res) => {
    const a = MG.current.api, ctx = MG.current.ctx, p = 1 - a.followIdx, b = document.querySelector(`.g-quest .aq-pad[data-p="${p}"] .aq-key[data-k="jump"]`);
    const y0 = a.heroes[p].y; let top = y0;
    b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 501, pointerType: 'touch' }));
    const t0 = ctx.time;
    const stop = ctx.frame(() => {
      top = Math.min(top, a.heroes[p].y);
      if (ctx.time - t0 > 0.06) window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 501, pointerType: 'touch' }));
      if (ctx.time - t0 > 1) { stop(); res(y0 - top); }
    });
  }));
  assert.ok(hop > 0.5 && hop < 1.6, `a tap is a small hop (${hop.toFixed(2)} squares; a held jump goes over 2)`);
  // the little one's big button: her hero jumps (a full jump, no holding needed)
  await page.locator(`.g-quest .aq-pad[data-p="${follow}"] .aq-key`).dispatchEvent('pointerdown', { pointerId: 600, pointerType: 'touch' });
  await gameWait(page, 0.25);
  assert.ok((await hero(page, follow)).y < f0.y - 1.2, 'her big button makes her jump high');
  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 600 })));

  // --- standing on your buddy's head and jumping: a super jump
  await gameWait(page, 1);
  const boost = await page.evaluate(() => new Promise((res) => {
    const a = MG.current.api, ctx = MG.current.ctx, p = 1 - a.followIdx, f = a.followIdx;
    const fh = a.heroes[f];
    a.place(p, fh.x, fh.y - 0.92 - 0.01);
    const t0 = ctx.time; let fastest = 0, pressed = false, onBuddy = false;
    const stop = ctx.frame(() => {
      if (!pressed && ctx.time - t0 > 0.3) { onBuddy = a.heroes[p].on === 'hero'; pressed = true; document.querySelector(`.g-quest .aq-pad[data-p="${p}"] .aq-key[data-k="jump"]`).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 502, pointerType: 'touch' })); }
      fastest = Math.min(fastest, a.heroes[p].vy);
      if (ctx.time - t0 > 0.6) { stop(); res({ vy: fastest, onBuddy }); window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 502 })); }
    });
  }));
  const tune = await api(page, 'tuning');
  assert.ok(boost.onBuddy, 'standing on her head');
  assert.ok(boost.vy < -tune.JUMP * 1.2, `a jump off a buddy's head goes higher (${boost.vy.toFixed(1)} against ${-tune.JUMP})`);
  await gameWait(page, 1.5);

  // --- into a pit: a bubble floats you back to your buddy; nothing is lost
  {
    const acorns0 = await api(page, 'acorns');
    const pit = await page.evaluate(() => { const a = MG.current.api, w = a.size.w; for (let c = 0; c < w; c++) if (!a.solidAt(c, 10) && !a.solidAt(c, 11) && !a.solidAt(c, 9)) return c; return -1; });
    assert.ok(pit > 0, 'stage one has a pit');
    const fl = await hero(page, follow);
    await page.evaluate(([f, x]) => MG.current.api.place(f, x + 0.5, 11.5), [follow, pit]);
    await page.waitForFunction((f) => MG.current.api.heroes[f].bubble, follow, { timeout: 5000 });
    await page.waitForFunction((f) => !MG.current.api.heroes[f].bubble, follow, { timeout: 8000 });
    await gameWait(page, 0.6);
    const back = await page.evaluate(() => MG.current.api.heroes);
    assert.ok(Math.abs(back[follow].x - back[lead].x) < 1.5 && back[follow].y <= 10.01, 'floated back to her buddy');
    assert.strictEqual(await api(page, 'acorns'), acorns0, 'nothing lost');
    assert.ok(fl);
  }

  // --- critters: land on one to bop it (an acorn!), bump into one and you are only dizzy for a moment
  {
    const cr = await page.evaluate(() => MG.current.api.critters.findIndex((c) => c.alive));
    const c = (await api(page, 'critters'))[cr];
    const n0 = await api(page, 'acorns');
    await page.evaluate(([p, x, y]) => { MG.current.api.place(p, x, y - 2.2); }, [lead, c.x, c.y]);
    await page.waitForFunction((i) => !MG.current.api.critters[i].alive, cr, { timeout: 5000 });
    assert.strictEqual(await api(page, 'acorns'), n0 + 1, 'bopped: an acorn');
    await gameWait(page, 1);
    const c2i = await page.evaluate(() => MG.current.api.critters.findIndex((c) => c.alive && c.kind !== 'flyer'));
    const c2 = (await api(page, 'critters'))[c2i];
    const n1 = await api(page, 'acorns');
    await page.evaluate(([p, x, y]) => MG.current.api.place(p, x - 0.6, y), [lead, c2.x, c2.y]);
    await page.waitForFunction((p) => MG.current.api.heroes[p].dizzy, lead, { timeout: 3000 });
    assert.strictEqual(await api(page, 'acorns'), n1, 'a bump takes nothing');
  }

  // --- a spring bounces you high: all the way up, whether or not jump is held
  {
    const spring = (await api(page, 'items')).find((i) => i.kind === 'spring');
    const top = await page.evaluate(([p, x, y]) => new Promise((res) => {
      const a = MG.current.api, ctx = MG.current.ctx;
      a.place(p, x, y - 0.6);
      let best = 99; const t0 = ctx.time;
      const stop = ctx.frame(() => { best = Math.min(best, a.heroes[p].y); if (ctx.time - t0 > 1.4) { stop(); res(y - best); } });
    }), [lead, spring.x, spring.y]);
    assert.ok(top > 4, `a spring throws you over four squares up, no button needed (${top.toFixed(2)})`);
  }

  // --- she never walks into a pit by herself: when he waits just past one, she waits at the edge for HER jump
  {
    const pit = await page.evaluate(() => { const a = MG.current.api, w = a.size.w; for (let c = 20; c < w; c++) if (!a.solidAt(c, 10) && !a.solidAt(c, 11)) return c; return -1; });
    let far = pit; while (!(await page.evaluate((c) => MG.current.api.solidAt(c, 10), far))) far++;
    await page.evaluate(([f, l, pit, far]) => { MG.current.api.place(l, far + 0.6, 10); MG.current.api.place(f, pit - 3, 10); }, [follow, lead, pit, far]);
    const bubbles = await page.evaluate((f) => new Promise((res) => {
      const a = MG.current.api, ctx = MG.current.ctx; let n = 0, was = false; const t0 = ctx.time;
      const stop = ctx.frame(() => { const b = a.heroes[f].bubble; if (b && !was) n++; was = b; if (ctx.time - t0 > 5) { stop(); res({ n, x: a.heroes[f].x }); } });
    }), follow);
    assert.strictEqual(bubbles.n, 0, 'no splashes while she waits');
    assert.ok(bubbles.x < pit + 0.2 && bubbles.x > pit - 1.2, `she waits right at the edge (${bubbles.x.toFixed(2)}, the pit starts at ${pit})`);
    // ...and her one tap takes her across
    await page.locator(`.g-quest .aq-pad[data-p="${follow}"] .aq-key`).dispatchEvent('pointerdown', { pointerId: 610, pointerType: 'touch' });
    await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 610 })));
    await gameWait(page, 1.5);
    const over = await hero(page, follow);
    assert.ok(over.x > far - 0.2 && !over.bubble, `one jump and she is across (${over.x.toFixed(2)})`);
  }

  // --- home: when both are home, the stage is cleared; the next stage opens on the map
  {
    const home = (await api(page, 'items')).find((i) => i.kind === 'home');
    await page.evaluate(([p, x, y]) => MG.current.api.place(p, x - 0.3, y), [lead, home.x, home.y]);
    await page.waitForFunction(() => MG.current.api.state === 'clear', null, { timeout: 8000 });
    assert.ok((await api(page, 'heroes')).every((x) => x.home), 'the little one is carried home too');
    await t.waitForWin(page, 10000);
    assert.strictEqual(await page.locator('.mg-win').getAttribute('data-result'), 'team');
    assert.strictEqual((await api(page, 'progress')).cleared, 1);
    await page.waitForSelector('.mg-win__actions:not(.is-arming)');
    await page.locator('.mg-win .mg-btn--primary').tap();
    await onMap(page);
    assert.strictEqual(await page.locator('.g-quest .aq-node:not(.is-locked)').count(), 2, 'stage two is open now');
  }

  // --- the whole of stage one, played through by a simple "run right, jump at trouble" grown-up
  page = await t.open(ID);
  await openStage(page, 0, { cleared: 0 });
  {
    const r = await page.evaluate(() => new Promise((resolve) => {
      const a = MG.current.api, ctx = MG.current.ctx, lead = 1 - Math.max(0, a.followIdx);
      const kd = (k, d) => window.dispatchEvent(new KeyboardEvent(d ? 'keydown' : 'keyup', { key: k }));
      const R = lead === 1 ? 'ArrowRight' : 'd', U = lead === 1 ? 'ArrowUp' : 'w';
      MG.timeScale = 3;
      kd(R, true);
      let t0 = ctx.time, lastX = 0, stuck = 0;
      ctx.frame(function () {
        const me = a.heroes[lead];
        if (a.state !== 'play' || ctx.time - t0 > 90) { kd(R, false); resolve({ state: a.state, t: ctx.time - t0, acorns: a.acorns }); return; }
        const c = Math.floor(me.x + 0.6), r = Math.floor(me.y + 0.05);
        const gap = !a.solidAt(c, r) && !a.solidAt(c, r + 1);
        const crit = a.critters.some((k) => k.alive && k.x > me.x && k.x - me.x < 1.8 && Math.abs(k.y - me.y) < 1.2);
        stuck = Math.abs(me.x - lastX) < 0.01 && me.ground ? stuck + 1 / 60 : 0;
        lastX = me.x;
        if (me.ground && (gap || crit || stuck > 0.15)) { kd(U, true); setTimeout(() => kd(U, false), 120); }
      });
    }));
    assert.strictEqual(r.state, 'clear', 'stage one can be played right through');
    assert.ok(r.t > 15 && r.t < 70, `in about half a minute to a minute (${r.t.toFixed(0)}s for a grown-up who never stops)`);
    assert.ok(r.acorns >= 8, `picking up acorns on the way (${r.acorns})`);
  }

  // --- the woods: the gate stays shut until someone stands on its button
  page = await t.open(ID);
  await openStage(page, 1);
  {
    const b = await page.evaluate(() => { const a = MG.current.api, s = a.buildStage(1), g = s.things.find((x) => x.kind === 'G'); const btn = a.items.find((x) => x.kind === 'button'); return { gx: g.x, btn }; });
    assert.ok(await page.evaluate((c) => MG.current.api.solidAt(c, 9) && MG.current.api.solidAt(c, 3), b.gx), 'the gate is a wall, too high to jump');
    await page.evaluate(([x, y]) => MG.current.api.place(1 - MG.current.api.followIdx, x, y), [b.btn.x, b.btn.y]);
    await page.waitForFunction(() => MG.current.api.gateOpen, null, { timeout: 3000 });
    assert.ok(!(await page.evaluate((c) => MG.current.api.solidAt(c, 9), b.gx)), 'open!');
  }

  // --- the pond: the raft sails across and carries whoever stands on it
  page = await t.open(ID);
  await openStage(page, 2);
  {
    const raft = await page.evaluate(() => { const s = MG.current.api.buildStage(2); return s.things.find((x) => x.kind === 'raft'); });
    await page.evaluate(([x, y]) => MG.current.api.place(1 - MG.current.api.followIdx, x + 1.5, y - 0.1), [raft.x, raft.y]);
    await gameWait(page, 0.3);
    const x0 = (await hero(page, await page.evaluate(() => 1 - MG.current.api.followIdx))).x;
    await gameWait(page, 2.5);
    const hh = await hero(page, await page.evaluate(() => 1 - MG.current.api.followIdx));
    assert.strictEqual(hh.on, 'raft', 'standing on the raft');
    assert.ok(hh.x > x0 + 1.5, `carried across (${(hh.x - x0).toFixed(1)} squares)`);
  }

  // --- the clouds: the lift carries whoever stands on it up to the ledge (it never drops them)
  page = await t.open(ID);
  await openStage(page, 3);
  {
    const lift = await page.evaluate(() => MG.current.api.buildStage(3).things.find((x) => x.kind === 'lift'));
    const p = await page.evaluate(() => 1 - MG.current.api.followIdx);
    const ride = await page.evaluate(([p, x, y]) => new Promise((res) => {
      const a = MG.current.api, ctx = MG.current.ctx;
      a.place(p, x + 1.5, y);
      let top = 99, fell = false; const t0 = ctx.time;
      const stop = ctx.frame(() => { const h = a.heroes[p]; top = Math.min(top, h.y); if (h.bubble) fell = true; if (ctx.time - t0 > 5) { stop(); res({ top, fell }); } });
    }), [p, lift.x, lift.y]);
    assert.ok(!ride.fell, 'nobody falls off the lift');
    assert.ok(ride.top < lift.y - 3.5, `it carries the rider up (to y ${ride.top.toFixed(2)})`);
  }

  // --- the cave: the door stays shut until someone with the key walks up to it; the baby bird is home
  page = await t.open(ID);
  await openStage(page, 4);
  {
    const s = await page.evaluate(() => { const b = MG.current.api.buildStage(4); return { door: b.things.find((x) => x.kind === 'D'), key: MG.current.api.items.find((x) => x.kind === 'key') }; });
    const p = await page.evaluate(() => 1 - MG.current.api.followIdx);
    await page.evaluate(([p, x]) => MG.current.api.place(p, x - 0.4, 10), [p, s.door.x]);
    await gameWait(page, 0.5);
    assert.ok(!(await api(page, 'doorOpen')), 'no key: shut');
    await page.evaluate(([p, x, y]) => MG.current.api.place(p, x, y + 0.4), [p, s.key.x, s.key.y]);
    await page.waitForFunction(() => MG.current.api.hasKey, null, { timeout: 3000 });
    await page.evaluate(([p, x]) => MG.current.api.place(p, x - 0.4, 10), [p, s.door.x]); // (walked right up to it)
    await page.waitForFunction(() => MG.current.api.doorOpen, null, { timeout: 3000 });
    // the key on its ledge can really be reached: from the spring, holding towards it
    const reach = await page.evaluate(() => {
      const a = MG.current.api, b = a.buildStage(4), spring = b.things.find((x) => x.kind === 'S'), key = b.things.find((x) => x.kind === 'K'), t = a.tuning;
      const apex = spring.y + 1 - (t.SPRING * t.SPRING) / (2 * t.GRAV);
      return { apex, ledge: key.y + 1, dx: Math.abs(spring.x - key.x) };
    });
    assert.ok(reach.apex < reach.ledge - 0.2 && reach.dx <= 5, `a spring bounce clears the key's ledge (apex ${reach.apex.toFixed(1)}, ledge ${reach.ledge})`);
    const chick = (await api(page, 'items')).find((i) => i.kind === 'chick');
    await page.evaluate(([p, x, y]) => MG.current.api.place(p, x, y), [p, chick.x - 0.3, chick.y]);
    await page.waitForFunction(() => MG.current.api.state === 'clear', null, { timeout: 8000 });
    await t.waitForWin(page, 10000);
  }

  // --- saved progress that is damaged in any way is repaired, never breaks the map
  page = await t.open(ID);
  await onMap(page);
  {
    const fixed = await page.evaluate(() => {
      const c = MG.current.api.cleanProgress;
      return [c(null), c({ stars: [] }), c({ cleared: 'abc', stars: 'x' }), c({ cleared: -1, stars: [] }), c({ cleared: 1.5, stars: [9, -2, 'q'] }), c({ cleared: 99, stars: [] })].map((p) => [p.cleared, p.stars.slice(0, 3).join('')]);
    });
    assert.deepStrictEqual(fixed, [[0, '000'], [0, '000'], [0, '000'], [0, '000'], [1, '300'], [5, '000']]);
    for (const bad of ['{"stars":[]}', '{"cleared":-1,"stars":[]}', '"nonsense"', '{"cleared":"x"}']) {
      await page.evaluate((v) => { localStorage.setItem('mg:game:quest:progress', v); MG.home(); MG.open('quest'); }, bad);
      await onMap(page);
      assert.ok(await page.locator('.g-quest .aq-node:not(.is-locked)').count() >= 1, `the first stage is always open (${bad})`);
    }
  }

  // --- hats: stars earn them; each player taps their closet on the map to try the next one on; it is saved
  {
    const hp = await page.evaluate(() => {
      const c = MG.current.api.cleanProgress;
      return [c({ cleared: 5, stars: [3, 3, 3, 3, 3], hats: [5, 4] }).hats, c({ stars: [1], hats: [5, 1] }).hats, c({ stars: [3, 3], hats: ['x', -3] }).hats, c({ hats: 'no' }).hats];
    });
    assert.deepStrictEqual(hp, [[5, 4], [0, 1], [0, 0], [0, 0]], 'earned hats stay on; unearned or odd ones come off');
    // no stars yet: the closet only wiggles
    await page.evaluate(() => { localStorage.setItem('mg:game:quest:progress', JSON.stringify({ cleared: 0, stars: [] })); MG.home(); MG.open('quest'); });
    await onMap(page);
    assert.strictEqual(await page.locator('.g-quest .aq-closet').count(), 2, 'a hat closet for each player');
    assert.deepStrictEqual(await t.outsidePlayArea(page, '.g-quest .aq-closet'), [], 'the closets are in view');
    assert.ok((await t.minTargetSize(page, '.g-quest .aq-closet')).min >= 64, 'the closets are big');
    await page.locator('.g-quest .aq-closet[data-p="0"]').tap();
    assert.deepStrictEqual((await api(page, 'progress')).hats, [0, 0], 'no hat before any star');
    // three stars: the bow and the cap; taps go round and back to no hat
    await page.evaluate(() => { localStorage.setItem('mg:game:quest:progress', JSON.stringify({ cleared: 1, stars: [3] })); MG.home(); MG.open('quest'); });
    await onMap(page);
    const seen = [];
    for (let k = 0; k < 4; k++) { await page.locator('.g-quest .aq-closet[data-p="1"]').tap(); seen.push((await api(page, 'progress')).hats[1]); }
    assert.deepStrictEqual(seen, [1, 2, 0, 1], 'bow, cap, none, bow');
    assert.strictEqual((await api(page, 'progress')).hats[0], 0, "the other player's hat is their own");
    assert.strictEqual(JSON.parse(await page.evaluate(() => localStorage.getItem('mg:game:quest:progress'))).hats[1], 1, 'saved');
    assert.ok(await page.locator('.g-quest .aq-closet[data-p="1"] .aq-closet__hat .mg-sticker').count() === 1, 'the hat shows on the closet');
    // and it is worn in the stage (still there after a stage clear saves progress)
    await page.evaluate(() => document.querySelectorAll('.g-quest .aq-node')[0].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 78, pointerType: 'touch' })));
    await page.waitForFunction(() => MG.current.api.state === 'play', null, { timeout: 10000 });
    assert.deepStrictEqual(await api(page, 'hatsOn'), ['', '🎀']);
  }

  // --- the look: every stage draws a full picture (sky, scenery, ground), by day and by night, with no errors
  for (const dark of [false, true]) {
    page = await t.open(ID, { dark, viewport: dark ? 'phone' : 'landscape' });
    for (let i = 0; i < 5; i++) {
      await openStage(page, i);
      await gameWait(page, 0.4);
      const look = await page.evaluate(() => {
        const cv = document.querySelector('.g-quest .aq-canvas'), g = cv.getContext('2d');
        const d = g.getImageData(0, 0, cv.width, cv.height).data, seen = new Set();
        let blank = 0;
        for (let k = 0; k < d.length; k += 4 * 97) { seen.add((d[k] >> 4) + ',' + (d[k + 1] >> 4) + ',' + (d[k + 2] >> 4)); if (d[k + 3] === 0) blank++; }
        return { colours: seen.size, blank, art: MG.current.api.art };
      });
      assert.ok(look.colours > 40, `stage ${i} ${dark ? 'night' : 'day'}: a detailed picture (${look.colours} colours)`);
      assert.strictEqual(look.blank, 0, 'nothing left undrawn');
      assert.ok(look.art.chunks >= 1 && look.art.chunks <= 3, `the stage is pre-drawn in a few pieces (${look.art.chunks})`);
      assert.ok(look.art.decor >= 3, `stage ${i} has scenery (${look.art.decor})`);
    }
    // walk the length of a stage: pieces are made as needed and old ones let go
    await page.evaluate(() => { const a = MG.current.api; for (let x = 4; x < 120; x += 6) { a.place(0, x, 2); a.place(1, x - 1, 2); a.draw(); } });
    assert.ok((await api(page, 'art')).chunks <= 3, 'no more than three pieces kept');
  }

  // --- both steering (the grown-up's choice): two full sets of controls; whoever is left behind floats along
  page = await t.open(ID);
  await t.pause(page);
  await page.locator('.mg-seg__btn', { hasText: 'Steers too' }).tap();
  await onMap(page);
  await openStage(page, 0);
  assert.strictEqual(await api(page, 'followIdx'), -1);
  assert.strictEqual(await page.locator('.g-quest .aq-key').count(), 6, 'two sets of left, right and jump');
  await key(page, 1, 'right', true);
  await page.waitForFunction(() => MG.current.api.heroes[0].bubble || MG.current.api.heroes[1].x > 30, null, { timeout: 20000 });
  await key(page, 1, 'right', false);

  // --- every supported size: the map and the controls in view and big; the stage fills the screen; turn it mid-run
  for (const vp of ['small', 'phone', 'phoneWide', 'tabletTall', 'tablet']) {
    const p = await t.open(ID, { viewport: vp, dark: vp === 'phoneWide' || vp === 'small' });
    await onMap(p);
    assert.ok(await t.noPageScroll(p), `no page scroll @${vp}`);
    assert.deepStrictEqual(await t.outsidePlayArea(p, '.g-quest .aq-node'), [], `the map fits @${vp}`);
    assert.ok((await t.minTargetSize(p, '.g-quest .aq-node')).min >= 80, `map stops are big @${vp}`);
    await t.shot(p, `quest-map-${vp}.png`);
    await openStage(p, vp === 'tablet' ? 3 : 0);
    await p.waitForTimeout(300);
    assert.deepStrictEqual(await t.outsidePlayArea(p, '.g-quest .aq-key, .g-quest .aq-canvas'), [], `controls in view @${vp}`);
    assert.ok((await t.minTargetSize(p, '.g-quest .aq-key:not(.aq-key--big)')).min >= 64, `keys are big @${vp}`);
    assert.ok((await t.minTargetSize(p, '.g-quest .aq-key--big')).min >= 100, `her jump button is huge @${vp}`);
    // the heroes are never under a button
    const clear = await p.evaluate(() => {
      const a = MG.current.api, v = a.view, cam = a.cam, cv = document.querySelector('.g-quest .aq-canvas').getBoundingClientRect();
      const keys = [...document.querySelectorAll('.g-quest .aq-key')].map((k) => k.getBoundingClientRect());
      return a.heroes.every((h) => { const x = cv.left + (h.x - cam.x) * v.tile, y = cv.top + (h.y - 0.5 - cam.y) * v.tile; return !keys.some((k) => x > k.left && x < k.right && y > k.top && y < k.bottom); });
    });
    assert.ok(clear, `the heroes are not hidden under the buttons @${vp}`);
    // ...and no button sits on the ground they walk on (in portrait the whole stage is shown above the controls)
    const line = await p.evaluate(() => {
      const a = MG.current.api, v = a.view, cv = document.querySelector('.g-quest .aq-canvas').getBoundingClientRect();
      const ground = cv.top + (10 - a.cam.y) * v.tile, keys = Math.min(...[...document.querySelectorAll('.g-quest .aq-key')].map((k) => k.getBoundingClientRect().top));
      return { ground, keys, portrait: v.portrait };
    });
    if (line.portrait) assert.ok(line.ground <= line.keys + 2, `the ground line is above the buttons @${vp} (${line.ground.toFixed(0)} vs ${line.keys.toFixed(0)})`);
    await t.shot(p, `quest-play-${vp}.png`);
    if (vp === 'phone') {
      await p.setViewportSize({ width: 844, height: 390 });
      await p.waitForTimeout(400);
      assert.deepStrictEqual(await t.outsidePlayArea(p, '.g-quest .aq-key'), [], 'still in view after rotating');
      assert.ok((await api(p, 'view')).w > 14, 'and now it shows more of the stage across');
    }
  }

  // --- pausing lets go of every button (a finger lifted behind the menu does not keep him walking)
  page = await t.open(ID);
  await openStage(page, 0);
  const ld = await api(page, 'followIdx').then((f) => 1 - f);
  await key(page, ld, 'right', true);
  await t.pause(page);
  await page.locator('.mg-pausecard .mg-btn--primary').tap();
  await page.waitForFunction(() => document.querySelector('#mg-overlay').hidden && !MG.current.ctx.paused);
  const x0 = (await hero(page, ld)).x;
  await gameWait(page, 0.6);
  assert.ok(Math.abs((await hero(page, ld)).x - x0) < 0.3, 'he stands still after the pause');

  // --- reduced motion: the next stop on the map does not pulse
  page = await t.open(ID, { reducedMotion: true });
  await onMap(page);
  assert.strictEqual(await page.evaluate(() => getComputedStyle(document.querySelector('.g-quest .aq-node.is-next')).animationName), 'none');

  // --- leaving and coming back mid-stage leaves nothing behind
  page = await t.open(ID);
  for (let i = 0; i < 3; i++) {
    await openStage(page, i);
    await key(page, await api(page, 'followIdx').then((f) => 1 - f), 'right', true);
    await page.waitForTimeout(300);
    await page.evaluate(() => MG.home());
    await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 411 })));
  }
  await page.evaluate(() => MG.open('quest'));
  await onMap(page);
  assert.strictEqual(await page.locator('.g-quest .aq-scene').count(), 1);
});
