/* Happy Garden — grow vegetables together and fill the visitors' baskets.
 *
 * Beds of soil; tools along one side (seeds, water, bug spray: pick one, then
 * tap beds) and three sacks of fertiliser (pupuk: compost, bone meal, fish) on
 * the other. A plant goes
 *   seed -> sprout -> leafy -> flowers -> fruit
 * and only grows while its soil is wet and no bug sits on it; half-way through
 * the leafy stage it asks for its favourite food (shown in its bubble and on
 * its seed packet): one tap on that sack sends the food flying to every plant
 * that wants it. Ripe plants are picked with a tap into the basket; tomatoes,
 * chillies and the like fruit twice before the bed is free again. An animal
 * visitor at the gate wants a few things; tap the gate to hand them over. A
 * filled order brings a gift: new seeds, more beds, helpers (a ladybird that
 * eats bugs, bees for bigger harvests, a fountain), decorations, then prize
 * medals for each vegetable. The garden is kept between rounds.
 *
 * Nothing ever dies: a dry or bugged plant just waits, drooping, for help.
 * The seed the visitor still needs is put in hand by itself after each planting,
 * so a garden can never fill up with the wrong thing for good.
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
  var HELPERS = { ladybird: '🐞', bees: '🐝', fountain: '⛲' };

  /* What each filled order brings, in order; then decorations; then prize medals; then thanks. */
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
  var MEDALS = 3;                 // prize medals per vegetable

  var STAGE_S = [6, 7, 8, 8];     // seconds in each stage, at normal speed, when cared for
  var STAGE_S_EARLY = [3, 5, 7, 7]; // the first two rounds: things happen sooner
  var MAX_WATER = 3;              // drops of water a bed holds
  var MAX_BASKET = 3;             // of one vegetable (the basket shows them all: no hidden amounts)

  /* ---------------------------------------------------------- pure rules */

  function emptyPlot() { return { crop: null, stage: 0, t: 0, water: 0, dry: 0, fed: null, bug: null, fruits: 0, perfect: true, picks: 0, thirst: 0, bugT: 0 }; }

  /** What `done` filled orders have unlocked: {crops, beds, helpers, decor, prizes}. Worked out from the count, never stored. */
  function unlocks(done) {
    var u = { crops: START_CROPS.slice(), beds: 4, helpers: {}, decor: [], prizes: {} };
    for (var i = 0; i < done; i++) {
      var g = giftFor(i);
      if (g.kind === 'crop') u.crops.push(g.id);
      else if (g.kind === 'beds') u.beds = Math.max(u.beds, g.n);
      else if (g.kind === 'helper') u.helpers[g.id] = true;
      else if (g.kind === 'decor' && u.decor.indexOf(g.e) < 0) u.decor.push(g.e);
      else if (g.kind === 'prize') u.prizes[g.id] = (u.prizes[g.id] || 0) + 1;
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
    k -= DECOR.length;
    if (k < CROP_IDS.length * MEDALS) { var id = CROP_IDS[k % CROP_IDS.length]; return { kind: 'prize', id: id, e: CROPS[id].e }; }
    return { kind: 'thanks', e: '⭐' };
  }

  /** Saved garden, checked and repaired: anything odd becomes something sensible. */
  function cleanFarm(raw) {
    if (!raw || typeof raw !== 'object') raw = {};
    var num = function (v, lo, hi, d) { if (v === null || v === '' || typeof v === 'boolean') return d; v = Number(v); return isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d; };
    var done = Math.floor(num(raw.done, 0, 9999, 0));
    var u = unlocks(done);
    // the visitor's order; one that is already filled was left during the hand-over: it still counts
    var order = null, filled = null;
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
      if (ok && kinds >= 1 && kinds <= 3) {
        if (orderDone({ want: want, got: got })) { filled = giftFor(done); done++; u = unlocks(done); }
        else order = { who: o.who, want: want, got: got };
      }
    }
    var f = { done: done, crops: u.crops, beds: u.beds, helpers: u.helpers, decor: u.decor, prizes: u.prizes, plots: [], basket: {}, order: order, seed: u.crops[0], rainIn: null };
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
          p.picks = CROPS[p.crop].regrow ? Math.floor(num(q.picks, 0, 1, 0)) : 0;
          p.thirst = num(q.thirst, 0, 60, 0);
          p.bugT = num(q.bugT, 0, 60, 0);
          if (p.stage === 4) p.fruits = Math.floor(num(q.fruits, 1, 3, 1));
        }
      }
      f.plots.push(p);
    }
    if (raw.basket && typeof raw.basket === 'object') {
      CROP_IDS.forEach(function (c) { var n = Math.floor(num(raw.basket[c], 0, MAX_BASKET, 0)); if (n) f.basket[c] = n; });
    }
    if (u.crops.indexOf(raw.seed) >= 0) f.seed = raw.seed;
    if (filled && filled.kind === 'crop') f.seed = filled.id;
    f.rainIn = num(raw.rainIn, 5, 110, null);
    return f;
  }

  function orderDone(o) { return Object.keys(o.want).every(function (c) { return (o.got[c] || 0) >= o.want[c]; }); }

  /**
   * A new visitor's wish list: a little bigger as the garden grows. A newly
   * earned seed is wanted in the next two orders. Once the basket holds four or
   * more kinds, the visitor takes a whole pile of what it has most of (so the
   * basket empties again); otherwise they lean a little towards what the
   * basket is short of. They never want only what is already in it.
   */
  function makeOrder(farm, rnd, prevWho) {
    var done = farm.done, crops = farm.crops, have = farm.basket || {};
    var stock = function (c) { return have[c] || 0; };
    if (done === 0) return { who: '🐰', want: { tomato: 1, chilli: 1 }, got: {} };
    var total = done < 3 ? 3 : done < 8 ? 4 : 5;
    var kinds = Math.min(crops.length, done < 5 ? 2 : 3);
    var newest = crops[crops.length - 1], gi = -1;
    GIFTS.forEach(function (g, k) { if (g.kind === 'crop' && g.id === newest) gi = k; });
    var fresh = gi >= 0 && done - (gi + 1) < 2;
    var chosen = fresh ? [newest] : [], drain = null;
    var inBasket = crops.filter(function (c) { return stock(c) > 0; });
    if (inBasket.length >= 4 && chosen.length < kinds) {
      var top = Math.max.apply(null, inBasket.map(stock));
      var full = inBasket.filter(function (c) { return stock(c) === top && chosen.indexOf(c) < 0; });
      if (full.length) { drain = full[Math.floor(rnd() * full.length)]; chosen.push(drain); }
    }
    var rest = crops.filter(function (c) { return chosen.indexOf(c) < 0; })
      .map(function (c) { return { c: c, k: rnd() + 0.15 * stock(c) }; })
      .sort(function (a, b) { return a.k - b.k; })
      .map(function (x) { return x.c; });
    chosen = chosen.concat(rest).slice(0, kinds);
    var want = {};
    chosen.forEach(function (c) { want[c] = c === drain ? Math.min(3, stock(c)) : 1; });
    var left = total - chosen.reduce(function (s, c) { return s + want[c]; }, 0);
    var grow = chosen.filter(function (c) { return c !== drain; });
    for (var guard = 0; left > 0 && grow.length && guard < 50; guard++) {
      var c2 = grow[Math.floor(rnd() * grow.length)];
      if (want[c2] < 3) { want[c2]++; left--; }
    }
    // something always has to be grown
    if (chosen.every(function (c) { return stock(c) >= want[c]; })) {
      var low = grow.slice().sort(function (a, b) { return stock(a) - stock(b); })[0];   // (the whole pile stays wanted)
      if (low && stock(low) < 3) want[low] = Math.min(3, stock(low) + 1);
      else {
        var other = crops.filter(function (c) { return !want[c] && stock(c) < 3; }).sort(function (a, b) { return stock(a) - stock(b); })[0];
        if (other) { if (low) delete want[low]; want[other] = stock(other) + 1; }
      }
    }
    var whoPool = VISITORS.filter(function (v) { return v !== prevWho; });
    return { who: whoPool[Math.floor(rnd() * whoPool.length)], want: want, got: {} };
  }

  /** Fruits on a ripe plant: one, plus one for its favourite food, plus one for good care (or the bees). */
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
    howTo: 'Grow vegetables together. Pick a tool (seeds, water, bug spray), then tap a bed. When a plant asks for food, tap the sack it wants: compost, bone meal or fish. Tap ripe plants to pick them, then tap the visitor to hand over what they want. Every filled order brings a gift: new seeds, more beds, helpers. Your garden is kept for next time.',
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
      var GRACE_S = [4, 6, 8][help];                     // a plant left dry or bugged this long gives one fruit fewer

      var farm = cleanFarm(ctx.load('farm', null));
      if (!farm.order) farm.order = makeOrder(farm, Math.random, ctx.load('lastWho', null));
      var tool = farm.plots.some(function (p) { return !p.crop; }) ? 'seed' : 'water';
      var state = 'play';                 // play -> gift (the order is filled; the party follows)
      var delivering = false;
      var kidPicked = false;              // a seed was chosen on the shelf: leave it in hand until it is planted
      var tutorBug = false;               // the first rounds bring one bug early, to show the spray
      var raining = 0, nextRain = farm.rainIn != null ? farm.rainIn : util.randf(25, 60);
      var bugClock = 0, ladyClock = 0, fountainClock = 0, saveClock = 0;
      var lastTap = 0, lastHinted = null, lastCheer = -1, cheers = 0, tapped = false;
      var gateSz = 110;

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

      // the beds, with a strip of helpers and decorations beside them
      var bedsEl = el('div', { class: 'gd-beds' });
      var stripEl = el('div', { class: 'gd-strip', 'aria-hidden': 'true' });
      var rainEl = el('div', { class: 'gd-rain', 'aria-hidden': 'true' });
      var gardenEl = el('div', { class: 'gd-garden', 'data-strip': 'none' }, bedsEl, stripEl, rainEl);
      var plotEls = [];

      // the tools: seeds, water and spray to hold on one side; the three food sacks on the other
      var toolEls = {};
      function toolBtn(id, face, label) {
        var b = el('button', { type: 'button', class: 'gd-tool gd-tool--' + id, 'data-tool': id, 'aria-label': label }, face);
        toolEls[id] = b;
        return b;
      }
      var seedFace = el('span', { class: 'gd-packet gd-packet--tool' });
      var seedBack = el('span', { class: 'gd-packet gd-packet--back', 'aria-hidden': 'true' });
      var toolsA = el('div', { class: 'gd-tools gd-tools--a' },
        toolBtn('seed', [seedBack, seedFace], 'Seeds'),
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

      /** A seed packet's insides: the vegetable, its favourite food, and any prize medals it has won. */
      function packet(cropId) {
        var c = CROPS[cropId], out = [
          el('span', { class: 'gd-packet__veg' }, ctx.sticker(c.e)),
          el('span', { class: 'gd-packet__likes' }, ctx.sticker(FOODS[c.likes].e)),
        ];
        var m = farm.prizes[cropId] || 0;
        if (m) {
          var medals = el('span', { class: 'gd-packet__medals', 'data-n': String(m) });
          for (var k = 0; k < m; k++) medals.appendChild(ctx.sticker('🏅'));
          out.push(medals);
        }
        return out;
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
          shelf.appendChild(el('button', { type: 'button', class: 'gd-packet gd-packet--pick', 'data-crop': c, 'aria-label': 'Seeds' }, packet(c)));
        });
      }

      function buildDecor() {
        stripEl.textContent = '';
        Object.keys(HELPERS).forEach(function (h) {
          if (farm.helpers[h]) stripEl.appendChild(el('span', { class: 'gd-helper gd-helper--' + h, 'data-h': h }, ctx.sticker(HELPERS[h])));
        });
        farm.decor.forEach(function (e) { stripEl.appendChild(el('span', { class: 'gd-deco' }, ctx.sticker(e))); });
      }

      /* ---- drawing the state ---- */

      function isHungry(p) { return !!p.crop && p.stage === 2 && !p.fed && p.t >= 0.5; }

      function renderPlot(i) {
        var p = farm.plots[i], b = plotEls[i];
        if (!b) return;
        var hungry = isHungry(p);
        var sig = [p.crop, p.stage, p.water, p.fed, p.bug, p.fruits, hungry, farm.prizes[p.crop] || 0].join('|');
        b.style.setProperty('--t', p.t.toFixed(2));
        if (sig === b._sig) return;
        b._sig = sig;
        b.dataset.stage = p.crop ? String(p.stage) : 'empty';
        b.dataset.crop = p.crop || '';
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
          // a just-sown bed shows its seed packet on a stick, so it is plain what was planted
          if (p.stage === 0) b.appendChild(el('span', { class: 'gd-packet gd-marker' }, packet(p.crop)));
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

      /** The wish list; `got` may be a display copy that runs behind during a hand-over. */
      function renderOrder(got) {
        var o = farm.order;
        if (!o) return;
        got = got || o.got;
        whoEl.textContent = '';
        whoEl.appendChild(ctx.sticker(o.who));
        wishEl.textContent = '';
        Object.keys(o.want).forEach(function (c) {
          for (var k = 0; k < o.want[c]; k++) {
            wishEl.appendChild(el('span', { class: 'gd-wish__item' + (k < (got[c] || 0) ? ' is-got' : ''), 'data-crop': c }, ctx.sticker(CROPS[c].e)));
          }
        });
      }

      /** How many more of crop c the visitor wants, beyond what is handed over and what is in the basket. */
      function stillWanted(c) {
        var o = farm.order;
        return o ? (o.want[c] || 0) - (o.got[c] || 0) - (farm.basket[c] || 0) : 0;
      }

      function renderBasket() {
        var o = farm.order;
        var asked = function (c) { return o && (o.want[c] || 0) > (o.got[c] || 0) ? 1 : 0; };
        // what the visitor wants comes first, so it is never the part that is hard to see
        var kinds = CROP_IDS.filter(function (c) { return farm.basket[c] > 0; })
          .sort(function (a, b) { return asked(b) - asked(a) || CROP_IDS.indexOf(a) - CROP_IDS.indexOf(b); });
        basketItems.textContent = '';
        kinds.forEach(function (c) {
          var pile = el('span', { class: 'gd-pile' + (asked(c) ? ' is-wanted' : ''), 'data-crop': c, 'data-n': String(farm.basket[c]) });
          for (var k = 0; k < farm.basket[c]; k++) pile.appendChild(ctx.sticker(CROPS[c].e));
          basketItems.appendChild(pile);
        });
        basketBtn.classList.toggle('is-empty', !kinds.length);
        visitBtn.classList.toggle('is-ready', canDeliver());
        if (!kinds.length) return;
        // every pile inside the basket, as big as the basket's shape allows: piles of three side by side,
        // or (when that comes out much bigger) stacked up; and however many columns suit best
        var n = kinds.length, bw = basketItems.clientWidth, bh = basketItems.clientHeight;
        if (!bw || !bh) return;
        var cap = Math.floor(gateSz * 0.22);
        var layout = function (stacked) {
          basketItems.classList.toggle('is-stacked', stacked);
          basketItems.style.gridTemplateColumns = 'repeat(' + n + ', auto)';
          basketItems.style.fontSize = '100px';
          var pw = 1, ph = 1, best = null;
          basketItems.childNodes.forEach(function (p) { pw = Math.max(pw, p.offsetWidth); ph = Math.max(ph, p.offsetHeight); });
          for (var cols = 1; cols <= Math.min(n, 5); cols++) {
            var rows = Math.ceil(n / cols);
            var fs = Math.floor(Math.min(cap, bw / (cols * pw / 100 + (cols - 1) * 0.3), bh / (rows * ph / 100 + (rows - 1) * 0.12)));
            if (!best || fs > best.fs) best = { fs: fs, cols: cols, stacked: stacked };
          }
          return best;
        };
        var row = layout(false), stack = layout(true);
        var pick = stack.fs > row.fs * 1.15 ? stack : row;
        basketItems.classList.toggle('is-stacked', pick.stacked);
        basketItems.style.gridTemplateColumns = 'repeat(' + pick.cols + ', auto)';
        for (var fs = Math.max(6, pick.fs); ; fs--) {
          basketItems.style.fontSize = fs + 'px';
          if (fs <= 6 || (basketItems.scrollWidth <= bw + 1 && basketItems.scrollHeight <= bh + 1)) break;
        }
      }

      function renderTools() {
        ['seed', 'water', 'spray'].forEach(function (t) { toolEls[t].classList.toggle('is-on', t === tool); });
        seedFace.textContent = '';
        packet(farm.seed).forEach(function (n) { seedFace.appendChild(n); });
        toolEls.seed.classList.toggle('has-more', farm.crops.length > 1);
      }

      /** A sack bobs while some plant is asking for that food. */
      function renderSacks() {
        FOOD_IDS.forEach(function (f) {
          toolEls[f].classList.toggle('is-asked', farm.plots.some(function (p) { return isHungry(p) && CROPS[p.crop].likes === f; }));
        });
      }

      /* ---- sizing ---- */

      function fit() {
        var s = ctx.size(), w = s.w, h = s.h, portrait = s.orient === 'portrait', gap = 10, G = 8;
        var toolSz;
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
        var cell = util.clamp(Math.floor(Math.min((gw - (cols - 1) * G) / cols, (gh - (rows - 1) * G) / rows)), 56, 190);
        // helpers and decorations get a strip of their own, below the beds or beside them, in up to three lines:
        // wherever they come out biggest; if that is still small, the beds give up a little room (never under 64px)
        var items = stripEl.childNodes.length, pl = null;
        var place = function (c) {
          var bw = cols * c + (cols - 1) * G, bh = rows * c + (rows - 1) * G, cap = Math.min(48, Math.round(c * 0.26)), best = null;
          [{ side: false, T: gh - bh - 10, L: bw }, { side: true, T: gw - bw - 10, L: bh }].forEach(function (o) {
            if (o.T < 12) return;
            for (var k = 1; k <= 3; k++) {
              var n = Math.ceil(items / k);
              // an emoji is a little wider than tall
              var d = Math.floor(Math.min(cap, o.side ? Math.min(o.T / k / 1.35, o.L / n / 1.1) : Math.min(o.T / k / 1.15, o.L / n / 1.35)));
              if (!best || d > best.d) best = { d: d, side: o.side, k: k, L: o.L };
            }
          });
          return best;
        };
        if (items) {
          pl = place(cell);
          if ((!pl || pl.d < 18) && cell > 64) {
            var c2 = Math.max(64, Math.floor((gh - (rows - 1) * G - 10 - 22 * 1.15) / rows));
            var pl2 = c2 < cell ? place(c2) : null;
            if (pl2 && (!pl || pl2.d > pl.d)) { cell = c2; pl = pl2; }
          }
          if (pl && pl.d < 12) pl = null;
        }
        root.style.setProperty('--cell', cell + 'px');
        gardenEl.dataset.strip = !pl ? 'none' : pl.side ? 'side' : 'below';
        if (pl) {
          root.style.setProperty('--strip', Math.ceil(pl.k * pl.d * (pl.side ? 1.35 : 1.15)) + 4 + 'px');
          root.style.setProperty('--strip-len', pl.L + 'px');
          root.style.setProperty('--per', String(Math.ceil(items / pl.k)));     // as many on each line
          var deco = pl.d;
          root.style.setProperty('--deco', deco + 'px');
          // then make sure they really fit, whatever the emoji font
          for (var tries = 0; tries < 8 && (stripEl.scrollWidth > stripEl.clientWidth + 1 || stripEl.scrollHeight > stripEl.clientHeight + 1); tries++) {
            deco = Math.floor(deco * 0.9);
            root.style.setProperty('--deco', deco + 'px');
          }
        }
        renderBasket();
      }

      /* ---- the ghost hand ---- */

      /** The ghost hand. It never points through the open seed shelf: pointing anywhere else puts the shelf away. */
      function hint(node, o) {
        if (node && !shelf.hidden && !shelf.contains(node)) closeShelf();
        lastHinted = node || null;
        ctx.hint(node || null, o);
      }

      /** A crop the visitor still needs that nothing is growing: the seed to have in hand. */
      function neededSeed() {
        var o = farm.order;
        if (!o) return null;
        var list = Object.keys(o.want).filter(function (c) {
          return stillWanted(c) > 0 && !farm.plots.some(function (p) { return p.crop === c; });
        });
        return list[0] || null;
      }

      /** Put the seed the visitor needs in hand (unless one was just chosen on the shelf). */
      function steerSeed(show) {
        if (kidPicked) return;
        var n = neededSeed();
        if (!n || n === farm.seed) return;
        farm.seed = n;
        renderTools();
        if (show) { sfx.play('flip'); fx.pop(toolEls.seed); }
      }

      /* ---- tools and beds ---- */

      function pickTool(t) {
        if (state !== 'play') return;
        if (t === 'seed' && farm.crops.length > 1) {
          // seeds: the first tap picks up the packet shown (usually the one the visitor needs);
          // another tap opens the shelf to choose a different kind, and one more puts it away
          if (!shelf.hidden) { closeShelf(); sfx.play('tap'); return; }
          if (tool === 'seed') { openShelf(); fx.pop(toolEls.seed); return; }
        }
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
        sfx.play('boop');
        if (help && fixTool && fixTool !== tool) hint(toolEls[fixTool], { delay: 250 });
      }

      function useBed(i) {
        if (state !== 'play') return;
        var p = farm.plots[i], b = plotEls[i];
        if (!p || !b) return;
        if (p.crop && p.stage === 4) { harvest(i); return; }
        if (tool === 'seed') {
          if (p.crop) { nope(b, p.water === 0 ? 'water' : null); return; }
          var keep = p.water;
          farm.plots[i] = emptyPlot();
          farm.plots[i].crop = farm.seed;
          farm.plots[i].water = keep;
          kidPicked = false;
          sfx.play('drop');
          fx.pop(b);
          after();
          steerSeed(true);
          if (!keep && help) hint(toolEls.water, { delay: 500 });
        } else if (tool === 'water') {
          var was = p.water;
          p.water = Math.min(MAX_WATER, p.water + 2);
          p.dry = 0;
          p.thirst = 0;
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
        }
      }

      /** A sack of food: it flies to every plant asking for it. Plants asking for something else shake their heads. */
      function feed(food) {
        if (state !== 'play') return;
        var sack = toolEls[food];
        var hungry = [], takers = [];
        farm.plots.forEach(function (p, i) { if (isHungry(p)) { hungry.push(i); if (CROPS[p.crop].likes === food) takers.push(i); } });
        if (!takers.length) {
          fx.wiggle(sack);
          sfx.play('boop');
          hungry.forEach(function (i) { fx.wiggle(plotEls[i]); });
          if (hungry.length && help) hint(toolEls[CROPS[farm.plots[hungry[0]].crop].likes], { delay: 250 });
          return;
        }
        var from = centre(sack);
        takers.forEach(function (i, k) {
          farm.plots[i].fed = food;
          var b = plotEls[i];
          fly(FOODS[food].e, from, b, k * 120);
          ctx.after(k * 120 + 540, function () {
            var c = centre(b);
            fx.burst(c.x, c.y, { emoji: '💖', count: 4, distance: 34, size: 18 });
            fx.bounce(b);
          });
        });
        sfx.play('tap');
        fx.pop(sack);
        ctx.after(540, function () { sfx.play('munch'); sfx.play('good'); });
        after();
      }

      function shoo(i) {
        var p = farm.plots[i], b = plotEls[i];
        var bug = b.querySelector('.gd-bug');
        p.bug = null;
        p.bugT = 0;
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
        var from = centre(b), emptied = false;
        farm.basket[crop] = Math.min(MAX_BASKET, (farm.basket[crop] || 0) + n);
        if (c.regrow && !p.picks) {
          // back to leafy for a second crop: it will ask for food again, and flower, and fruit
          p.picks = 1; p.stage = 2; p.t = 0; p.fed = null; p.fruits = 0; p.perfect = true; p.bug = null; p.thirst = 0; p.bugT = 0;
        } else {
          // picked whole: the bed is free for new seeds
          var keep = Math.max(0, p.water - 1);
          farm.plots[i] = emptyPlot();
          farm.plots[i].water = keep;
          emptied = true;
          if (c.regrow) fx.burst(from.x, from.y, { emoji: '🍃', count: 5, distance: 40, size: 18 });
        }
        for (var k = 0; k < n; k++) fly(c.e, from, basketBtn, k * 120);
        for (var s = 0; s < n; s++) (function (s2) { ctx.after(s2 * 120, function () { sfx.scale(4 + s2); }); })(s);
        sfx.play('pop', { pitch: 700 });
        fx.pop(b);
        after();
        if (emptied) steerSeed(true);
      }

      /** Something flies from a point to a target (decoration; the state has already changed). */
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
        renderSacks();
        save();
      }

      function save() {
        try {
          ctx.save('farm', { done: farm.done, plots: farm.plots, basket: farm.basket, order: farm.order, seed: farm.seed, rainIn: Math.round(nextRain) });
        } catch (e) { /* storage may be unavailable: the garden simply is not kept */ }
      }

      /* ---- the visitor ---- */

      function wanted() {
        var o = farm.order, list = [];
        if (!o) return list;
        Object.keys(o.want).forEach(function (c) {
          var need = o.want[c] - (o.got[c] || 0), have = farm.basket[c] || 0;
          for (var k = 0; k < Math.min(need, have); k++) list.push(c);
        });
        return list;
      }
      function canDeliver() { return state === 'play' && !delivering && wanted().length > 0; }

      /** A tap at the gate while the visitor is busy: a happy pop, never silence. */
      function cheer() {
        if (ctx.time - lastCheer < 0.15) return;
        lastCheer = ctx.time;
        fx.pop(whoEl);
        sfx.play('pop', { pitch: 600 + 60 * (cheers++ % 8) });
      }

      function deliver() {
        if (state !== 'play' || delivering) { cheer(); return; }
        var list = wanted();
        if (!list.length) {
          fx.wiggle(whoEl);
          fx.pop(wishEl);
          sfx.play('boop');
          return;
        }
        delivering = true;
        sfx.play('tap');
        fx.pop(basketBtn);
        // the order is settled now; the wish list catches up one vegetable at a time
        var shown = {};
        Object.keys(farm.order.got).forEach(function (c) { shown[c] = farm.order.got[c]; });
        list.forEach(function (c) {
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
            shown[c] = (shown[c] || 0) + 1;
            sfx.scale(k + 2);
            ctx.say(k + 1);
            renderOrder(shown);
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
        hint(null);
        var gift = giftFor(farm.done), oldBeds = farm.plots.length;
        try { ctx.save('lastWho', farm.order.who); } catch (e) {}
        farm.done++;
        var u = unlocks(farm.done);
        farm.crops = u.crops; farm.helpers = u.helpers; farm.decor = u.decor; farm.prizes = u.prizes;
        while (farm.plots.length < u.beds) farm.plots.push(emptyPlot());
        farm.beds = u.beds;
        if (gift.kind === 'crop') farm.seed = gift.id;
        farm.order = null;            // the next round brings the next visitor
        save();
        renderTools();
        // what the gift brings is in the garden at once, behind the present
        if (farm.plots.length !== oldBeds) buildBeds();
        if (gift.kind === 'helper' || gift.kind === 'decor') buildDecor();
        fit();
        sfx.play('good');
        fx.bounce(visitBtn);
        ctx.lock(1500);               // until the party takes over: an excited tap cannot pick or plant behind the present
        // the visitor leaves a present; it pops open to show what it is
        giftEl.textContent = '';
        var box = el('span', { class: 'gd-gift__box' }, ctx.sticker('🎁'));
        var inside = el('span', { class: 'gd-gift__inside' });
        if (gift.kind === 'crop') inside.appendChild(el('span', { class: 'gd-packet gd-packet--big' }, packet(gift.id)));
        else if (gift.kind === 'beds') {
          var card = el('span', { class: 'gd-gift__beds' });
          for (var k = 0; k < farm.plots.length - oldBeds; k++) card.appendChild(el('i', {}, el('b'), el('b')));
          inside.appendChild(card);
        } else if (gift.kind === 'prize') inside.appendChild(el('span', { class: 'gd-prize' }, ctx.sticker(gift.e), el('span', { class: 'gd-prize__medal' }, ctx.sticker('🏅'))));
        else inside.appendChild(ctx.sticker(gift.e));
        giftEl.appendChild(box);
        giftEl.appendChild(inside);
        giftEl.hidden = false;
        ctx.after(900, function () {
          giftEl.classList.add('is-open');
          sfx.play('star');
          var c = centre(giftEl);
          fx.burst(c.x, c.y, { emoji: '✨', count: 10, distance: 90, size: 22 });
          for (var b = oldBeds; b < plotEls.length; b++) fx.bounce(plotEls[b]);
          ctx.after(500, function () { ctx.win('team', { delay: 1800, emoji: gift.e }); });
        });
      }

      /* ---- time: growing, drying, bugs, rain, helpers ---- */

      function tick(dt) {
        if (state !== 'play') return;     // after the order is filled the garden rests until next time
        var S = farm.done < 2 ? STAGE_S_EARLY : STAGE_S;
        var changed = false;
        farm.plots.forEach(function (p, i) {
          if (!p.crop || p.stage >= 4) return;
          if (p.water <= 0) {
            // waits, drooping, for water (a new seed waiting for its first drink is not neglected)
            if (p.stage > 0 || p.t > 0) { p.thirst += dt; if (p.thirst > GRACE_S) p.perfect = false; }
            return;
          }
          p.dry += dt;
          if (p.dry >= DRY_S) { p.dry = 0; p.water--; changed = true; }
          if (p.bug) { p.bugT += dt; if (p.bugT > GRACE_S) p.perfect = false; return; }   // waits for the bug to go
          if (isHungry(p)) return;                                                     // waits for food
          p.t += dt / (S[p.stage] * SPEED);
          if (isHungry(p)) { changed = true; if (help) sfx.play('tick'); }
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
        // the first rounds: one bug comes early, so the spray gets shown while it is still new
        if (farm.done < 2 && BUGRATE > 0 && !tutorBug && farm.plots.filter(function (p) { return p.bug; }).length < 2) {
          var ti = farm.plots.findIndex(function (p) { return p.crop && p.stage === 1 && p.t >= 0.4 && p.water > 0 && !p.bug; });
          if (ti >= 0) {
            tutorBug = true;
            farm.plots[ti].bug = BUGS[0];
            changed = true;
            sfx.play('pop', { pitch: 300 });
            // (not while a planting is under way: the hand shows the spray once that seed is in)
            if (help && shelf.hidden && !plantingInHand()) hint(tool === 'spray' ? plotEls[ti] : toolEls.spray, { delay: 500 });
          }
        }
        // bugs come by now and then (never more than two at once)
        bugClock += dt;
        if (bugClock >= 5) {
          bugClock = 0;
          var bugs = farm.plots.filter(function (p) { return p.bug; }).length;
          farm.plots.forEach(function (p) {
            if (bugs >= 2 || !p.crop || p.stage < 1 || p.stage > 3 || p.bug || p.water <= 0) return;
            if (Math.random() < BUG_P) { p.bug = util.pick(BUGS); p.bugT = 0; bugs++; changed = true; }
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
            farm.plots.forEach(function (p) { if (p.crop && p.stage < 4 && p.water < MAX_WATER) { p.water++; p.dry = 0; p.thirst = 0; changed = true; } });
            if (changed && lastHinted) hintNext();     // the hand moves on from a job the fountain has done
          }
        }
        // rain: the countdown carries over between rounds, so it comes every minute or two of play
        if (raining > 0) { raining -= dt; if (raining <= 0) rainEl.classList.remove('is-on'); }
        nextRain -= dt;
        if (nextRain <= 0) rain();
        farm.plots.forEach(function (p, i) { renderPlot(i); });
        if (changed) { renderBasket(); renderSacks(); save(); }
        saveClock += dt;
        if (saveClock >= 5) { saveClock = 0; save(); }
        // nobody has done anything for a while: show what could happen next
        if (ctx.time - lastTap > IDLE_S) { lastTap = ctx.time; hintNext(); }
      }

      function rain() {
        nextRain = util.randf(70, 110);
        raining = 3.5;
        rainEl.classList.add('is-on');
        sfx.noise({ freq: 1200, to: 600, dur: 2.5, q: 0.4, gain: 0.05 });
        farm.plots.forEach(function (p) { p.water = MAX_WATER; p.dry = 0; p.thirst = 0; });
        after();
        if (lastHinted) hintNext();                   // the hand moves on from a job the rain has done
      }

      function ladybirdTo(i) {
        var p = farm.plots[i];
        p.bug = null;
        p.bugT = 0;
        var lb = stripEl.querySelector('.gd-helper--ladybird');
        if (lb && plotEls[i]) {
          var c = centre(plotEls[i]), from = centre(lb);
          if (lb.animate) lb.animate([{ transform: 'translate(0, 0)' }, { transform: 'translate(' + (c.x - from.x) + 'px, ' + (c.y - from.y) + 'px) scale(1.3)', offset: 0.5 }, { transform: 'translate(0, 0)' }], { duration: 1200, easing: 'ease-in-out' });
        }
        sfx.play('munch');
        if (lastHinted) hintNext();                   // the hand moves on from a bug the ladybird has eaten
      }

      /* ---- the ghost hand: what to do next, always heading for the visitor's wish ---- */

      /** Seeds the visitor needs are in hand and a bed is free: one tap finishes the planting. */
      function plantingInHand() {
        var need = neededSeed();
        return tool === 'seed' && !!need && farm.seed === need && farm.plots.some(function (p) { return !p.crop; });
      }

      function hintNext() {
        lastHinted = null;
        if (state !== 'play') return;
        if (canDeliver()) { hint(visitBtn); return; }
        var ps = farm.plots, find = function (f) { for (var i = 0; i < ps.length; i++) if (f(ps[i])) return i; return -1; };
        var ripe = function (p) { return p.crop && p.stage === 4; };
        var need = neededSeed(), empty = find(function (p) { return !p.crop; }), planting = !!need && empty >= 0;
        var i;
        if (planting && !shelf.hidden) { hint(shelf.querySelector('[data-crop="' + need + '"]')); return; }   // choosing: that one
        if ((i = find(function (p) { return ripe(p) && stillWanted(p.crop) > 0; })) >= 0) { hint(plotEls[i]); return; }
        if (planting && tool === 'seed' && farm.seed === need) { hint(plotEls[empty]); return; }           // finish the planting in hand
        if ((i = find(function (p) { return p.bug; })) >= 0) { hint(tool === 'spray' ? plotEls[i] : toolEls.spray); return; }
        if ((i = find(function (p) { return p.crop && p.stage < 4 && p.water === 0; })) >= 0) { hint(tool === 'water' ? plotEls[i] : toolEls.water); return; }
        if ((i = find(isHungry)) >= 0) { hint(toolEls[CROPS[ps[i].crop].likes]); return; }
        if (planting) { hint(toolEls.seed); return; }   // pick up seeds (another tap opens the shelf when a different kind is needed)
        if ((i = find(ripe)) >= 0) { hint(plotEls[i]); return; }   // room for new seeds, more in the basket
        hint(null);                                                 // nothing to do: no hand left on a job already done
      }

      /* ---- input ---- */

      /** A tap counts as activity; a tap on what the hand showed brings the next step sooner. */
      function counted(node) {
        tapped = true;
        lastTap = node && node === lastHinted ? ctx.time - IDLE_S + 1.5 : ctx.time;
        lastHinted = null;
      }
      ctx.tap(bedsEl, function (ev, node) { counted(node); closeShelf(); useBed(+node.dataset.i); }, { delegate: '.gd-plot', slop: 14 });
      ctx.tap(toolsA, function (ev, node) { counted(node); pickTool(node.dataset.tool); }, { delegate: '.gd-tool', slop: 10 });
      ctx.tap(toolsB, function (ev, node) { counted(node); closeShelf(); feed(node.dataset.tool); }, { delegate: '.gd-tool', slop: 10 });
      ctx.tap(shelf, function (ev, node) {
        counted(node);
        farm.seed = node.dataset.crop;
        tool = 'seed';
        kidPicked = true;
        closeShelf();
        renderTools();
        sfx.play('tap');
        fx.pop(toolEls.seed);
        save();
      }, { delegate: '.gd-packet--pick', slop: 10 });
      ctx.tap(shelf, function () { if (!shelf.hidden) { counted(null); closeShelf(); sfx.play('tap'); } });
      // the whole gate hands over: visitor, basket, and the gap between them
      ctx.tap(gate, function () { counted(visitBtn); closeShelf(); deliver(); });

      /* ---- go ---- */

      steerSeed(false);
      buildBeds();
      buildDecor();
      renderOrder();
      renderTools();
      renderSacks();
      fit();
      ctx.onResize(fit);
      ctx.setTurn(null);
      ctx.every(200, function () { tick(0.2); });
      fx.bounce(visitBtn);
      sfx.play('start');
      ctx.after(700, function () { if (!tapped) hintNext(); });   // where to start (unless someone already has)
      save();

      ctx.expose({
        get state() { return state; },
        get tool() { return tool; },
        get farm() { return JSON.parse(JSON.stringify(farm)); },
        get shelfOpen() { return !shelf.hidden; },
        get delivering() { return delivering; },
        get raining() { return raining > 0; },
        get nextRain() { return nextRain; },
        /** The element the ghost hand last pointed at (tests follow it). */
        get hinted() { return lastHinted; },
        hintNext: hintNext,
        neededSeed: neededSeed,
        /** Fast-forward the garden by `s` seconds of growing (in the same small steps the clock takes). */
        grow: function (s) { for (var k = 0; k < Math.round(s / 0.2); k++) tick(0.2); },
        /** Put a bug on bed i (tests). */
        bug: function (i) { var p = farm.plots[i]; if (p && p.crop && p.stage >= 1 && p.stage <= 3) { p.bug = BUGS[0]; p.bugT = 0; renderPlot(i); } },
        rain: rain,
        setFarm: function (raw) { farm = cleanFarm(raw); if (farm.rainIn != null) nextRain = farm.rainIn; if (!farm.order) farm.order = makeOrder(farm, Math.random, null); kidPicked = false; buildBeds(); buildDecor(); renderOrder(); renderTools(); renderSacks(); fit(); save(); },
        cleanFarm: cleanFarm,
        makeOrder: makeOrder,
        giftFor: giftFor,
        unlocks: unlocks,
        fruitsFor: fruitsFor,
        CROPS: CROPS,
        GIFTS: GIFTS.length,
        tuning: { help: help, DRY_S: DRY_S, BUG_P: BUG_P, SPEED: SPEED, STAGE_S: STAGE_S, STAGE_S_EARLY: STAGE_S_EARLY, GRACE_S: GRACE_S, MAX_BASKET: MAX_BASKET },
      });

      return function cleanup() { save(); };
    },
  });
})();
