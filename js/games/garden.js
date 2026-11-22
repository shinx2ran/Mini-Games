/* Happy Garden — grow vegetables together and fill the visitors' baskets.
 *
 * Beds of soil; tools along the side: seeds, water, three kinds of fertiliser
 * (pupuk: compost, bone meal, fish) and a bug spray. A plant goes
 *   seed -> sprout -> leafy -> flowers -> fruit
 * and only grows while its soil is wet and no bug sits on it; half-way through
 * the leafy stage it asks for food (its favourite food, shown on its seed
 * packet, gives an extra fruit; any food will do). Ripe plants are harvested
 * with a tap into the basket. An animal visitor at the gate wants a few things;
 * tap the visitor to hand them over. A filled order brings a gift: new seeds,
 * more beds, helpers (a ladybird that eats bugs, bees for bigger harvests, a
 * fountain), then decorations. The garden is kept between rounds.
 *
 * Nothing ever dies: a dry or bugged plant just waits, drooping, for help.
 */
(function () {
  'use strict';

  /* ---------------------------------------------------------- what grows */

  var CROPS = {
    tomato: { e: '🍅', likes: 'bone', regrow: true, flower: '🌼' },
    chilli: { e: '🌶️', likes: 'fish', regrow: true, flower: '🌼' },
    carrot: { e: '🥕', likes: 'leaf', regrow: false, root: true },
    corn: { e: '🌽', likes: 'fish', regrow: false },
    strawberry: { e: '🍓', likes: 'leaf', regrow: true, flower: '🌸' },
    eggplant: { e: '🍆', likes: 'bone', regrow: true, flower: '🌸' },
    pumpkin: { e: '🎃', likes: 'leaf', regrow: false },
    cucumber: { e: '🥒', likes: 'fish', regrow: true, flower: '🌼' },
    potato: { e: '🥔', likes: 'bone', regrow: false, root: true },
  };
  var CROP_IDS = Object.keys(CROPS);
  var START_CROPS = ['tomato', 'chilli'];
  var FOODS = { leaf: { e: '🍂' }, bone: { e: '🦴' }, fish: { e: '🐟' } };
  var FOOD_IDS = ['leaf', 'bone', 'fish'];
  var BUGS = ['🐛', '🐌', '🐜'];
  var VISITORS = ['🐰', '🐻', '🐷', '🐮', '🐔', '🐼', '🦊', '🐨', '🐸', '🐵'];

  /* What each filled order brings, in order; after the list, decorations. */
  var GIFTS = [
    { kind: 'crop', id: 'carrot' },
    { kind: 'beds', n: 6, e: '🌱' },
    { kind: 'helper', id: 'ladybird', e: '🐞' },
    { kind: 'crop', id: 'corn' },
    { kind: 'crop', id: 'strawberry' },
    { kind: 'beds', n: 9, e: '🌱' },
    { kind: 'helper', id: 'bees', e: '🐝' },
    { kind: 'crop', id: 'eggplant' },
    { kind: 'crop', id: 'pumpkin' },
    { kind: 'helper', id: 'fountain', e: '⛲' },
    { kind: 'crop', id: 'cucumber' },
    { kind: 'crop', id: 'potato' },
  ];
  var DECOR = ['🌷', '🌻', '🐔', '🦆', '🐈', '🍄', '🦔', '🐇', '🌳', '🏡'];

  var STAGE_S = [6, 7, 8, 8];     // seconds in each stage, at normal speed, when cared for
  var MAX_WATER = 3;              // drops of water a bed holds
  var MAX_BASKET = 9;             // of one vegetable

  /* ---------------------------------------------------------- pure rules */

  function emptyPlot() { return { crop: null, stage: 0, t: 0, water: 0, dry: 0, fed: null, bug: null, fruits: 0, perfect: true }; }

  /** What `done` filled orders have unlocked: {crops, beds, helpers, decor}. Worked out from the count, never stored. */
  function unlocks(done) {
    var u = { crops: START_CROPS.slice(), beds: 4, helpers: {}, decor: [] };
    for (var i = 0; i < done; i++) {
      var g = giftFor(i);
      if (g.kind === 'crop') u.crops.push(g.id);
      else if (g.kind === 'beds') u.beds = Math.max(u.beds, g.n);
      else if (g.kind === 'helper') u.helpers[g.id] = true;
      else if (g.kind === 'decor' && u.decor.indexOf(g.e) < 0) u.decor.push(g.e);
    }
    return u;
  }

  /** The gift for filling order number `i` (0 = the first). */
  function giftFor(i) {
    if (i < GIFTS.length) {
      var g = GIFTS[i];
      return g.kind === 'crop' ? { kind: 'crop', id: g.id, e: CROPS[g.id].e } : g;
    }
    var k = i - GIFTS.length;
    if (k < DECOR.length) return { kind: 'decor', e: DECOR[k] };
    return { kind: 'thanks', e: '⭐' };
  }

  /** Saved garden, checked and repaired: anything odd becomes something sensible. */
  function cleanFarm(raw) {
    if (!raw || typeof raw !== 'object') raw = {};
    var num = function (v, lo, hi, d) { v = Number(v); return isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d; };
    var done = Math.floor(num(raw.done, 0, 9999, 0));
    var u = unlocks(done);
    var f = { done: done, crops: u.crops, beds: u.beds, helpers: u.helpers, decor: u.decor, plots: [], basket: {}, order: null, seed: u.crops[0] };
    var rawPlots = Array.isArray(raw.plots) ? raw.plots : [];
    for (var i = 0; i < u.beds; i++) {
      var p = emptyPlot(), q = rawPlots[i];
      if (q && typeof q === 'object') {
        p.water = Math.floor(num(q.water, 0, MAX_WATER, 0));
        if (u.crops.indexOf(q.crop) >= 0) {
          p.crop = q.crop;
          p.stage = Math.floor(num(q.stage, 0, 4, 0));
          p.t = num(q.t, 0, 1, 0);
          p.dry = num(q.dry, 0, 60, 0);
          p.fed = FOOD_IDS.indexOf(q.fed) >= 0 ? q.fed : null;
          p.bug = BUGS.indexOf(q.bug) >= 0 && p.stage >= 1 && p.stage <= 3 ? q.bug : null;
          p.perfect = q.perfect !== false;
          if (p.stage === 4) p.fruits = Math.floor(num(q.fruits, 1, 3, 1));
        }
      }
      f.plots.push(p);
    }
    if (raw.basket && typeof raw.basket === 'object') {
      CROP_IDS.forEach(function (c) { var n = Math.floor(num(raw.basket[c], 0, MAX_BASKET, 0)); if (n) f.basket[c] = n; });
    }
    var o = raw.order;
    if (o && typeof o === 'object' && VISITORS.indexOf(o.who) >= 0 && o.want && typeof o.want === 'object') {
      var want = {}, got = {}, kinds = 0, ok = true;
      Object.keys(o.want).forEach(function (c) {
        var n = Math.floor(num(o.want[c], 0, 3, 0));
        if (u.crops.indexOf(c) < 0 || !n) { ok = false; return; }
        want[c] = n; kinds++;
        var g = o.got && typeof o.got === 'object' ? Math.floor(num(o.got[c], 0, n, 0)) : 0;
        if (g) got[c] = g;
      });
      if (ok && kinds >= 1 && kinds <= 3 && !orderDone({ want: want, got: got })) f.order = { who: o.who, want: want, got: got };
    }
    if (u.crops.indexOf(raw.seed) >= 0) f.seed = raw.seed;
    return f;
  }

  function orderDone(o) { return Object.keys(o.want).every(function (c) { return (o.got[c] || 0) >= o.want[c]; }); }

  /** A new visitor's wish list: a little bigger as the garden grows, and the newest seeds are always wanted. */
  function makeOrder(farm, rnd, prevWho) {
    var done = farm.done, crops = farm.crops;
    if (done === 0) return { who: '🐰', want: { tomato: 1, chilli: 1 }, got: {} };
    var total = done < 3 ? 3 : done < 8 ? 4 : 5;
    var kinds = Math.min(crops.length, done < 5 ? 2 : 3);
    var pool = crops.slice(0, crops.length - 1).sort(function () { return rnd() - 0.5; });
    pool.unshift(crops[crops.length - 1]);           // the newest crop first
    var chosen = pool.slice(0, kinds), want = {};
    chosen.forEach(function (c) { want[c] = 1; });
    var left = total - kinds;
    for (var guard = 0; left > 0 && guard < 50; guard++) {
      var c2 = chosen[Math.floor(rnd() * chosen.length)];
      if (want[c2] < 3) { want[c2]++; left--; }
    }
    var whoPool = VISITORS.filter(function (v) { return v !== prevWho; });
    return { who: whoPool[Math.floor(rnd() * whoPool.length)], want: want, got: {} };
  }

  /** Fruits on a ripe plant: one, plus one for its favourite food, plus one for perfect care (or the bees). */
  function fruitsFor(plot, helpers) {
    var c = CROPS[plot.crop];
    var n = 1 + (plot.fed === c.likes ? 1 : 0) + (plot.perfect || (helpers && helpers.bees) ? 1 : 0);
    return Math.min(3, n);
  }

  /* ---------------------------------------------------------- the game */

  MG.registerGame({
    id: 'garden',
    name: 'Happy Garden',
    emoji: '🍅',
    color: 'leaf',
    howTo: 'Grow vegetables together. Pick a tool, then tap a bed: plant seeds, water, feed (each plant has a favourite food: look at its seed packet), spray bugs away. Tap ripe plants to pick them, then tap the visitor to hand over what they want. Every filled order brings a gift: new seeds, more beds, helpers. Your garden is kept for next time.',
    options: [
      { key: 'speed', label: 'Growing', default: 'normal', choices: [{ value: 'quick', label: 'Quick', emoji: '🐇' }, { value: 'normal', label: 'Normal', emoji: '🌱' }, { value: 'slow', label: 'Slow', emoji: '🐢' }] },
      { key: 'bugs', label: 'Bugs', default: 'some', choices: [{ value: 'none', label: 'None', emoji: '🌼' }, { value: 'some', label: 'Some', emoji: '🐛' }, { value: 'lots', label: 'Lots', emoji: '🐜' }] },
    ],

    mount: function (root, ctx) {
      var el = ctx.el, sfx = ctx.sfx, fx = ctx.fx, util = ctx.util;
      var SPEED = { quick: 0.65, normal: 1, slow: 1.5 }[ctx.opt('speed')] || 1;
      var BUGRATE = { none: 0, some: 1, lots: 1.9 }[ctx.opt('bugs')];
      if (BUGRATE == null) BUGRATE = 1;
      // one shared garden: the little one's help level softens it for both
      var help = Math.max(ctx.helpFor(0), ctx.helpFor(1));
      var DRY_S = [7, 8.5, 10][help];                    // seconds a drop of water lasts
      var BUG_P = [0.12, 0.08, 0.05][help] * BUGRATE;    // chance per growing plant per bug check
      var IDLE_S = help ? 7 : 14;                        // quiet seconds before the ghost hand shows what to do

      var farm = cleanFarm(ctx.load('farm', null));
      if (!farm.order) farm.order = makeOrder(farm, Math.random, ctx.load('lastWho', null));
      var tool = farm.plots.some(function (p) { return !p.crop; }) ? 'seed' : 'water';
      var state = 'play';                 // play -> gift (the order is filled; the party follows)
      var delivering = false;
      var raining = 0, nextRain = util.randf(60, 90), bugClock = 0, ladyClock = 0, fountainClock = 0, saveClock = 0;
      var lastTap = 0;

      /* ---- build ---- */

      var scene = el('div', { class: 'gd-scene' });
      root.appendChild(scene);

      // the gate: the visitor and their wish list, and the basket
      var whoEl = el('span', { class: 'gd-who' });
      var wishEl = el('span', { class: 'gd-wish' });
      var visitBtn = el('button', { type: 'button', class: 'gd-visitor', 'aria-label': 'Visitor' }, whoEl, wishEl);
      var basketItems = el('span', { class: 'gd-basket__items' });
      var basketBtn = el('button', { type: 'button', class: 'gd-basket', 'aria-label': 'Basket' }, el('span', { class: 'gd-basket__can', 'aria-hidden': 'true' }, ctx.sticker('🧺')), basketItems);
      var gate = el('div', { class: 'gd-gate' }, visitBtn, basketBtn);

      // the beds
      var bedsEl = el('div', { class: 'gd-beds' });
      var decorEl = el('div', { class: 'gd-decor', 'aria-hidden': 'true' });
      var rainEl = el('div', { class: 'gd-rain', 'aria-hidden': 'true' });
      var helpersEl = el('div', { class: 'gd-helpers', 'aria-hidden': 'true' });
      var gardenEl = el('div', { class: 'gd-garden' }, decorEl, bedsEl, helpersEl, rainEl);
      var plotEls = [];

      // the tools: seeds, water and spray on one side; the three foods on the other
      var toolEls = {};
      function toolBtn(id, face, label) {
        var b = el('button', { type: 'button', class: 'gd-tool gd-tool--' + id, 'data-tool': id, 'aria-label': label }, face);
        toolEls[id] = b;
        return b;
      }
      var seedFace = el('span', { class: 'gd-packet gd-packet--tool' });
      var toolsA = el('div', { class: 'gd-tools gd-tools--a' },
        toolBtn('seed', seedFace, 'Seeds'),
        toolBtn('water', el('span', { class: 'gd-can' }, ctx.sticker('💧')), 'Water'),
        toolBtn('spray', el('span', { class: 'gd-spray' }, ctx.sticker('🧴')), 'Bug spray'));
      var toolsB = el('div', { class: 'gd-tools gd-tools--b' }, FOOD_IDS.map(function (f) {
        return toolBtn(f, el('span', { class: 'gd-sack gd-sack--' + f }, ctx.sticker(FOODS[f].e)), 'Food');
      }));

      // the seed shelf: one packet per seed the garden has
      var shelf = el('div', { class: 'gd-shelf', hidden: true });

      var giftEl = el('div', { class: 'gd-gift', hidden: true, 'aria-hidden': 'true' });

      scene.appendChild(gate);
      scene.appendChild(gardenEl);
      scene.appendChild(toolsA);
      scene.appendChild(toolsB);
      scene.appendChild(shelf);
      scene.appendChild(giftEl);

      function packet(cropId, extraClass) {
        var c = CROPS[cropId];
        return [
          el('span', { class: 'gd-packet__veg' + (extraClass || '') }, ctx.sticker(c.e)),
          el('span', { class: 'gd-packet__likes' }, ctx.sticker(FOODS[c.likes].e)),
        ];
      }

      function buildBeds() {
        bedsEl.textContent = '';
        plotEls = farm.plots.map(function (p, i) {
          var b = el('button', { type: 'button', class: 'gd-plot', 'data-i': String(i), 'aria-label': 'Bed' });
          b._sig = '';
          bedsEl.appendChild(b);
          return b;
        });
        bedsEl.style.setProperty('--cols', String(farm.plots.length <= 4 ? 2 : 3));
        farm.plots.forEach(function (p, i) { renderPlot(i); });
      }

      function buildShelf() {
        shelf.textContent = '';
        farm.crops.forEach(function (c) {
          var b = el('button', { type: 'button', class: 'gd-packet gd-packet--pick', 'data-crop': c, 'aria-label': 'Seeds' }, packet(c));
          shelf.appendChild(b);
        });
      }

      function buildDecor() {
        decorEl.textContent = '';
        farm.decor.forEach(function (e, k) { decorEl.appendChild(el('span', { class: 'gd-deco', style: { '--k': String(k) } }, ctx.sticker(e))); });
        helpersEl.textContent = '';
        ['ladybird', 'bees', 'fountain'].forEach(function (h) {
          if (!farm.helpers[h]) return;
          var e = { ladybird: '🐞', bees: '🐝', fountain: '⛲' }[h];
          helpersEl.appendChild(el('span', { class: 'gd-helper gd-helper--' + h, 'data-h': h }, ctx.sticker(e)));
        });
      }

      /* ---- drawing the state ---- */

      function isHungry(p) { return p.crop && p.stage === 2 && !p.fed && p.t >= 0.5; }

      function renderPlot(i) {
        var p = farm.plots[i], b = plotEls[i];
        if (!b) return;
        var hungry = isHungry(p);
        var sig = [p.crop, p.stage, p.water, p.fed, p.bug, p.fruits, hungry].join('|');
        b.style.setProperty('--t', p.t.toFixed(2));
        if (sig === b._sig) return;
        b._sig = sig;
        b.dataset.stage = p.crop ? String(p.stage) : 'empty';
        b.classList.toggle('is-wet', p.water > 0);
        b.classList.toggle('is-dry', !!p.crop && p.stage < 4 && p.water === 0);
        b.classList.toggle('is-hungry', hungry);
        b.classList.toggle('is-bugged', !!p.bug);
        b.classList.toggle('is-ripe', !!p.crop && p.stage === 4);
        b.classList.toggle('is-root', !!p.crop && !!CROPS[p.crop].root);
        b.textContent = '';
        b.appendChild(el('span', { class: 'gd-soil' }, el('i'), el('i'), el('i')));
        if (p.crop) {
          var c = CROPS[p.crop];
          var plant = el('span', { class: 'gd-plant' });
          if (p.stage === 0) plant.appendChild(el('span', { class: 'gd-seed' }));
          else if (p.stage === 1) plant.appendChild(ctx.sticker('🌱'));
          else plant.appendChild(ctx.sticker(p.crop === 'corn' ? '🌾' : '🌿'));
          if (p.stage === 3) plant.appendChild(el('span', { class: 'gd-flowers' }, ctx.sticker(c.flower || '🌼'), ctx.sticker(c.flower || '🌼')));
          b.appendChild(plant);
          if (p.stage === 4) {
            var fr = el('span', { class: 'gd-fruits', 'data-n': String(p.fruits) });
            for (var k = 0; k < p.fruits; k++) fr.appendChild(ctx.sticker(c.e));
            b.appendChild(fr);
          }
          if (p.bug) b.appendChild(el('span', { class: 'gd-bug' }, ctx.sticker(p.bug)));
          var need = null;
          if (p.stage < 4 && p.water === 0) need = '💧';
          else if (hungry) need = FOODS[c.likes].e;
          if (need) b.appendChild(el('span', { class: 'gd-need' }, ctx.sticker(need)));
          if (p.fed && p.stage <= 2) b.appendChild(el('span', { class: 'gd-fed' }, ctx.sticker(FOODS[p.fed].e)));
        }
        var drops = el('span', { class: 'gd-drops', 'aria-hidden': 'true' });
        for (var d = 0; d < MAX_WATER; d++) drops.appendChild(el('i', { class: d < p.water ? 'is-full' : '' }));
        b.appendChild(drops);
      }

      function renderOrder() {
        var o = farm.order;
        whoEl.textContent = '';
        whoEl.appendChild(ctx.sticker(o.who));
        wishEl.textContent = '';
        Object.keys(o.want).forEach(function (c) {
          for (var k = 0; k < o.want[c]; k++) {
            wishEl.appendChild(el('span', { class: 'gd-wish__item' + (k < (o.got[c] || 0) ? ' is-got' : ''), 'data-crop': c }, ctx.sticker(CROPS[c].e)));
          }
        });
      }

      function renderBasket() {
        basketItems.textContent = '';
        CROP_IDS.forEach(function (c) {
          var n = farm.basket[c] || 0;
          if (!n) return;
          var pile = el('span', { class: 'gd-pile', 'data-crop': c, 'data-n': String(n) });
          // up to three show as a little pile; more makes the pile taller
          for (var k = 0; k < Math.min(3, n); k++) pile.appendChild(ctx.sticker(CROPS[c].e));
          if (n > 3) pile.classList.add('is-big');
          basketItems.appendChild(pile);
        });
        basketBtn.classList.toggle('is-empty', !basketItems.childNodes.length);
        visitBtn.classList.toggle('is-ready', canDeliver());
      }

      function renderTools() {
        TOOLS_ALL.forEach(function (t) { toolEls[t].classList.toggle('is-on', t === tool); });
        seedFace.textContent = '';
        packet(farm.seed).forEach(function (n) { seedFace.appendChild(n); });
      }
      var TOOLS_ALL = ['seed', 'water', 'spray'].concat(FOOD_IDS);

      /* ---- sizing ---- */

      function fit() {
        var s = ctx.size(), w = s.w, h = s.h, portrait = s.orient === 'portrait', gap = 10;
        var toolSz, gateSz;
        if (portrait) {
          toolSz = util.clamp(Math.floor(Math.min((w - 24 - 2 * gap) / 3, h * 0.1)), 64, 96);
          gateSz = util.clamp(Math.floor(h * 0.15), 84, 140);
        } else {
          toolSz = util.clamp(Math.floor(Math.min((h - 24 - 2 * gap) / 3, w * 0.11)), 64, 96);
          gateSz = util.clamp(Math.floor(w * 0.19), 124, 220);
        }
        root.style.setProperty('--tool', toolSz + 'px');
        root.style.setProperty('--gate', gateSz + 'px');
        // the beds share what is left, as big squares
        var n = farm.plots.length, cols = n <= 4 ? 2 : 3, rows = Math.ceil(n / cols);
        var gw, gh;
        if (portrait) { gw = w - 24; gh = h - 12 - gateSz - gap - (2 * toolSz + gap) - gap - 12; }
        else { gw = w - 24 - 2 * (toolSz + gap) - gateSz - gap; gh = h - 24; }
        var cell = Math.floor(Math.min((gw - (cols - 1) * 8) / cols, (gh - (rows - 1) * 8) / rows));
        root.style.setProperty('--cell', util.clamp(cell, 56, 190) + 'px');
      }

      /* ---- tools and beds ---- */

      function pickTool(t) {
        if (t === 'seed' && tool === 'seed' && farm.crops.length > 1) { openShelf(); return; }
        closeShelf();
        tool = t;
        renderTools();
        sfx.play('tap');
        fx.pop(toolEls[t]);
      }

      function openShelf() {
        buildShelf();
        shelf.hidden = false;
        shelf.querySelectorAll('.gd-packet--pick').forEach(function (b) { b.classList.toggle('is-on', b.dataset.crop === farm.seed); });
        sfx.play('flip');
      }
      function closeShelf() { shelf.hidden = true; }

      function centre(node) { return fx.centerOf(node); }

      function nope(node, fixTool) {
        fx.wiggle(node);
        if (help && fixTool && fixTool !== tool) ctx.hint(toolEls[fixTool], { delay: 250 });
      }

      function useBed(i) {
        var p = farm.plots[i], b = plotEls[i];
        if (!p || !b) return;
        if (p.crop && p.stage === 4) { harvest(i); return; }
        if (tool === 'seed') {
          if (p.crop) { nope(b, p.water === 0 ? 'water' : null); return; }
          var keep = p.water;
          farm.plots[i] = emptyPlot();
          farm.plots[i].crop = farm.seed;
          farm.plots[i].water = keep;
          sfx.play('drop');
          fx.pop(b);
          after();
          if (!keep && help) ctx.hint(toolEls.water, { delay: 500 });
        } else if (tool === 'water') {
          var was = p.water;
          p.water = Math.min(MAX_WATER, p.water + 2);
          p.dry = 0;
          sfx.play('splash');
          var c = centre(b);
          fx.burst(c.x, c.y, { emoji: '💧', count: 5, distance: 36, size: 18 });
          if (was === 0 && p.crop) fx.bounce(b);
          after();
        } else if (tool === 'spray') {
          var c2 = centre(b);
          sfx.noise({ freq: 3000, to: 1800, dur: 0.25, q: 0.8, gain: 0.12 });
          fx.burst(c2.x, c2.y, { emoji: '💨', count: 3, distance: 30, size: 18 });
          if (p.bug) shoo(i);
        } else {
          // food
          if (!p.crop) { nope(b, 'seed'); return; }
          if (p.fed || p.stage > 2) { nope(b, null); return; }
          p.fed = tool;
          var fav = CROPS[p.crop].likes === tool;
          sfx.play('munch');
          var c3 = centre(b);
          if (fav) { fx.burst(c3.x, c3.y, { emoji: '💖', count: 4, distance: 34, size: 18 }); sfx.play('good'); }
          else fx.burst(c3.x, c3.y, { emoji: FOODS[tool].e, count: 3, distance: 24, size: 16 });
          fx.bounce(b);
          after();
        }
      }

      function shoo(i) {
        var p = farm.plots[i], b = plotEls[i];
        var bug = b.querySelector('.gd-bug');
        p.bug = null;
        if (bug) {
          // the bug tumbles away (decoration only: the bed is already clear)
          var c = fx.centerOf(bug), r = root.getBoundingClientRect();
          var flyer = el('span', { class: 'gd-flyer', style: { left: (c.x - r.left) + 'px', top: (c.y - r.top) + 'px' } }, ctx.sticker(bug.textContent));
          root.appendChild(flyer);
          if (flyer.animate) flyer.animate([{ transform: 'translate(-50%, -50%)' }, { transform: 'translate(' + (c.x < r.left + r.width / 2 ? '-' : '') + '160%, -260%) rotate(540deg) scale(0.4)', opacity: 0 }], { duration: 650, easing: 'ease-in', fill: 'forwards' });
          ctx.after(700, function () { flyer.remove(); });
        }
        sfx.play('giggle');
        after();
      }

      function harvest(i) {
        var p = farm.plots[i], b = plotEls[i], c = CROPS[p.crop];
        var n = p.fruits, crop = p.crop;
        var from = centre(b);
        farm.basket[crop] = Math.min(MAX_BASKET, (farm.basket[crop] || 0) + n);
        if (c.regrow) {
          // back to leafy: it will ask for food again, and flower, and fruit
          p.stage = 2; p.t = 0; p.fed = null; p.fruits = 0; p.perfect = true; p.bug = null;
        } else {
          var keep = Math.max(0, p.water - 1);
          farm.plots[i] = emptyPlot();
          farm.plots[i].water = keep;
        }
        for (var k = 0; k < n; k++) fly(c.e, from, basketBtn, k * 120);
        for (var s = 0; s < n; s++) (function (s2) { ctx.after(s2 * 120, function () { sfx.scale(4 + s2); }); })(s);
        sfx.play('pop', { pitch: 700 });
        fx.pop(b);
        after();
      }

      /** A vegetable flies from a point to a target (decoration; the state has already changed). */
      function fly(emoji, from, toNode, delay) {
        var r = root.getBoundingClientRect(), to = centre(toNode);
        var f = el('span', { class: 'gd-flyer', style: { left: (from.x - r.left) + 'px', top: (from.y - r.top) + 'px' } }, ctx.sticker(emoji));
        f.style.opacity = '0';
        ctx.after(delay, function () {
          root.appendChild(f);
          f.style.opacity = '';
          if (f.animate) f.animate([
            { transform: 'translate(-50%, -50%) scale(1)' },
            { transform: 'translate(calc(-50% + ' + ((to.x - from.x) * 0.5) + 'px), calc(-50% + ' + ((to.y - from.y) * 0.5 - 60) + 'px)) scale(1.3)', offset: 0.5 },
            { transform: 'translate(calc(-50% + ' + (to.x - from.x) + 'px), calc(-50% + ' + (to.y - from.y) + 'px)) scale(0.7)' },
          ], { duration: 520, easing: 'ease-in-out', fill: 'forwards' });
          ctx.after(560, function () { f.remove(); fx.pop(toNode); });
        });
      }

      /** Something changed: redraw what it touches, keep the garden. */
      function after() {
        farm.plots.forEach(function (p, i) { renderPlot(i); });
        renderBasket();
        save();
      }

      function save() {
        try {
          ctx.save('farm', { done: farm.done, plots: farm.plots, basket: farm.basket, order: farm.order, seed: farm.seed });
        } catch (e) { /* storage may be unavailable: the garden simply is not kept */ }
      }

      /* ---- the visitor ---- */

      function wanted() {
        var o = farm.order, list = [];
        Object.keys(o.want).forEach(function (c) {
          var need = o.want[c] - (o.got[c] || 0), have = farm.basket[c] || 0;
          for (var k = 0; k < Math.min(need, have); k++) list.push(c);
        });
        return list;
      }
      function canDeliver() { return state === 'play' && wanted().length > 0; }

      function deliver() {
        if (state !== 'play' || delivering) return;
        var list = wanted();
        if (!list.length) {
          fx.wiggle(whoEl);
          fx.pop(wishEl);
          sfx.play('boop');
          return;
        }
        delivering = true;
        // hand them over one by one, counting
        list.forEach(function (c, k) {
          farm.basket[c]--;
          if (!farm.basket[c]) delete farm.basket[c];
          farm.order.got[c] = (farm.order.got[c] || 0) + 1;
        });
        save();
        renderBasket();
        var done = orderDone(farm.order);
        list.forEach(function (c, k) {
          fly(CROPS[c].e, centre(basketBtn), wishEl, k * 300);
          ctx.after(k * 300 + 520, function () {
            sfx.scale(k + 2);
            ctx.say(k + 1);
            renderOrder();
          });
        });
        ctx.after(list.length * 300 + 600, function () {
          delivering = false;
          renderOrder();
          renderBasket();
          if (done) thankYou();
        });
      }

      function thankYou() {
        if (state !== 'play') return;
        state = 'gift';
        closeShelf();
        ctx.hint(null);
        var gift = giftFor(farm.done);
        try { ctx.save('lastWho', farm.order.who); } catch (e) {}
        farm.done++;
        var u = unlocks(farm.done);
        farm.crops = u.crops; farm.helpers = u.helpers; farm.decor = u.decor;
        while (farm.plots.length < u.beds) farm.plots.push(emptyPlot());
        farm.beds = u.beds;
        if (gift.kind === 'crop') farm.seed = gift.id;
        farm.order = null;            // the next round brings the next visitor
        save();
        sfx.play('good');
        fx.bounce(visitBtn);
        ctx.lock(600);
        // the visitor leaves a present; it pops open to show what it is
        giftEl.textContent = '';
        var box = el('span', { class: 'gd-gift__box' }, ctx.sticker('🎁'));
        var inside = el('span', { class: 'gd-gift__inside' });
        if (gift.kind === 'crop') inside.appendChild(el('span', { class: 'gd-packet gd-packet--big' }, packet(gift.id)));
        else if (gift.kind === 'beds') inside.appendChild(el('span', { class: 'gd-gift__beds' }, el('i'), el('i'), el('i')));
        else inside.appendChild(ctx.sticker(gift.e));
        giftEl.appendChild(box);
        giftEl.appendChild(inside);
        giftEl.hidden = false;
        ctx.after(900, function () {
          giftEl.classList.add('is-open');
          sfx.play('star');
          var c = centre(giftEl);
          fx.burst(c.x, c.y, { emoji: '✨', count: 10, distance: 90, size: 22 });
          ctx.after(500, function () { ctx.win('team', { delay: 1800, emoji: gift.e }); });
        });
      }

      /* ---- time: growing, drying, bugs, rain, helpers ---- */

      function tick(dt) {
        if (state !== 'play' && state !== 'gift') return;
        var changed = false;
        farm.plots.forEach(function (p, i) {
          if (!p.crop || p.stage >= 4) return;
          if (p.water <= 0) { if (p.stage > 0 || p.t > 0) p.perfect = false; return; }   // waits, drooping, for water (a new seed waiting for its first drink is not neglected)
          p.dry += dt;
          if (p.dry >= DRY_S) { p.dry = 0; p.water--; changed = true; if (!p.water) p.perfect = false; }
          if (p.bug) return;                                       // waits for the bug to go
          if (isHungry(p)) return;                                 // waits for food
          var wasHungry = isHungry(p);
          p.t += dt / (STAGE_S[p.stage] * SPEED);
          if (!wasHungry && isHungry(p)) { changed = true; if (help) sfx.play('tick'); }
          if (p.t >= 1) {
            p.t = 0;
            p.stage++;
            changed = true;
            if (p.stage === 4) {
              p.fruits = fruitsFor(p, farm.helpers);
              sfx.play('ding');
              var c = fx.centerOf(plotEls[i]);
              fx.burst(c.x, c.y, { emoji: '✨', count: 6, distance: 50, size: 18 });
            } else sfx.play('pop', { pitch: 400 + p.stage * 120 });
          }
        });
        // bugs come by now and then (never more than two at once)
        bugClock += dt;
        if (bugClock >= 5) {
          bugClock = 0;
          var bugs = farm.plots.filter(function (p) { return p.bug; }).length;
          farm.plots.forEach(function (p, i) {
            if (bugs >= 2 || !p.crop || p.stage < 1 || p.stage > 3 || p.bug || p.water <= 0) return;
            if (Math.random() < BUG_P) { p.bug = util.pick(BUGS); p.perfect = false; bugs++; changed = true; }
          });
        }
        // the ladybird eats a bug every so often
        if (farm.helpers.ladybird) {
          ladyClock += dt;
          if (ladyClock >= 9) {
            ladyClock = 0;
            var bi = farm.plots.findIndex(function (p) { return p.bug; });
            if (bi >= 0) { ladybirdTo(bi); changed = true; }
          }
        }
        // the fountain gives every bed a little water now and then
        if (farm.helpers.fountain) {
          fountainClock += dt;
          if (fountainClock >= 15) {
            fountainClock = 0;
            farm.plots.forEach(function (p) { if (p.crop && p.stage < 4 && p.water < MAX_WATER) { p.water++; p.dry = 0; changed = true; } });
          }
        }
        // rain
        if (raining > 0) { raining -= dt; if (raining <= 0) rainEl.classList.remove('is-on'); }
        nextRain -= dt;
        if (nextRain <= 0 && state === 'play') rain();
        farm.plots.forEach(function (p, i) { renderPlot(i); });
        if (changed) { renderBasket(); save(); }
        saveClock += dt;
        if (saveClock >= 5) { saveClock = 0; save(); }
        // nobody has done anything for a while: show what could happen next
        if (state === 'play' && ctx.time - lastTap > IDLE_S) { lastTap = ctx.time; hintNext(); }
      }

      function rain() {
        nextRain = util.randf(70, 110);
        raining = 3.5;
        rainEl.classList.add('is-on');
        sfx.noise({ freq: 1200, to: 600, dur: 2.5, q: 0.4, gain: 0.05 });
        farm.plots.forEach(function (p) { p.water = MAX_WATER; p.dry = 0; });
        after();
      }

      function ladybirdTo(i) {
        var p = farm.plots[i];
        p.bug = null;
        var lb = helpersEl.querySelector('.gd-helper--ladybird');
        if (lb) {
          var c = centre(plotEls[i]), from = centre(lb);
          if (lb.animate) lb.animate([{ transform: 'translate(0, 0)' }, { transform: 'translate(' + (c.x - from.x) + 'px, ' + (c.y - from.y) + 'px) scale(1.3)', offset: 0.5 }, { transform: 'translate(0, 0)' }], { duration: 1200, easing: 'ease-in-out' });
        }
        sfx.play('munch');
      }

      /* ---- the ghost hand: what to do next ---- */

      function hintNext() {
        if (state !== 'play') return;
        if (canDeliver()) { ctx.hint(visitBtn); return; }
        var ps = farm.plots, find = function (f) { for (var i = 0; i < ps.length; i++) if (f(ps[i])) return i; return -1; };
        var i;
        if ((i = find(function (p) { return p.crop && p.stage === 4; })) >= 0) { ctx.hint(plotEls[i]); return; }
        if ((i = find(function (p) { return p.bug; })) >= 0) { ctx.hint(tool === 'spray' ? plotEls[i] : toolEls.spray); return; }
        if ((i = find(function (p) { return p.crop && p.stage < 4 && p.water === 0; })) >= 0) { ctx.hint(tool === 'water' ? plotEls[i] : toolEls.water); return; }
        if ((i = find(isHungry)) >= 0) { var f = CROPS[ps[i].crop].likes; ctx.hint(tool === f ? plotEls[i] : toolEls[f]); return; }
        if ((i = find(function (p) { return !p.crop; })) >= 0) { ctx.hint(tool === 'seed' ? plotEls[i] : toolEls.seed); return; }
      }

      /* ---- input ---- */

      function counted() { lastTap = ctx.time; }
      ctx.tap(bedsEl, function (ev, node) { counted(); closeShelf(); useBed(+node.dataset.i); }, { delegate: '.gd-plot', slop: 14 });
      ctx.tap(toolsA, function (ev, node) { counted(); pickTool(node.dataset.tool); }, { delegate: '.gd-tool', slop: 10 });
      ctx.tap(toolsB, function (ev, node) { counted(); pickTool(node.dataset.tool); }, { delegate: '.gd-tool', slop: 10 });
      ctx.tap(shelf, function (ev, node) {
        counted();
        farm.seed = node.dataset.crop;
        tool = 'seed';
        closeShelf();
        renderTools();
        sfx.play('tap');
        fx.pop(toolEls.seed);
        save();
      }, { delegate: '.gd-packet--pick', slop: 10 });
      ctx.tap(visitBtn, function () { counted(); closeShelf(); deliver(); });
      ctx.tap(basketBtn, function () { counted(); closeShelf(); deliver(); });

      /* ---- go ---- */

      buildBeds();
      buildDecor();
      renderOrder();
      renderBasket();
      renderTools();
      fit();
      ctx.onResize(fit);
      ctx.setTurn(null);
      ctx.every(200, function () { tick(0.2); });
      fx.bounce(visitBtn);
      sfx.play('start');
      ctx.after(700, hintNext);
      save();

      ctx.expose({
        get state() { return state; },
        get tool() { return tool; },
        get farm() { return JSON.parse(JSON.stringify(farm)); },
        get shelfOpen() { return !shelf.hidden; },
        get delivering() { return delivering; },
        get raining() { return raining > 0; },
        /** Fast-forward the garden by `s` seconds of growing (in the same small steps the clock takes). */
        grow: function (s) { for (var k = 0; k < Math.round(s / 0.2); k++) tick(0.2); },
        /** Put a bug on bed i (tests). */
        bug: function (i) { var p = farm.plots[i]; if (p && p.crop && p.stage >= 1 && p.stage <= 3) { p.bug = BUGS[0]; p.perfect = false; renderPlot(i); } },
        rain: rain,
        setFarm: function (raw) { farm = cleanFarm(raw); if (!farm.order) farm.order = makeOrder(farm, Math.random, null); buildBeds(); buildDecor(); renderOrder(); renderBasket(); renderTools(); fit(); save(); },
        cleanFarm: cleanFarm,
        makeOrder: makeOrder,
        giftFor: giftFor,
        unlocks: unlocks,
        fruitsFor: fruitsFor,
        CROPS: CROPS,
        GIFTS: GIFTS.length,
        tuning: { DRY_S: DRY_S, BUG_P: BUG_P, SPEED: SPEED, STAGE_S: STAGE_S },
      });

      return function cleanup() { save(); };
    },
  });
})();
