/* Happy Garden — grow vegetables together and fill the visitors' baskets.
 *
 * Beds of soil, three sacks of fertiliser (pupuk: compost, bone meal, fish),
 * a yard with our own tree, and a visitor at the gate with a wish list.
 * A tap on a bed does what that bed needs, read from what it shows:
 *   an empty bed shows a seed packet: a tap sows it;
 *   a bug: a tap sprays it off (a 🧴 puffs at it);
 *   a 💧 bubble: a tap waters it (a little 🌧️ rains on it);
 *   a food bubble: the plant points at the sack it wants;
 *   no bubble: a tap tickles the plant, and it grows a little sooner.
 * A plant goes seed -> sprout -> leafy -> flowers / green fruit -> ripe, each
 * crop in its own shape; half-way through the leafy stage it asks for its
 * favourite food, given with one tap on that sack. Ripe plants are picked into
 * the basket; tomatoes, chillies and the like fruit twice. Now and then a
 * perfect carrot, potato or pumpkin ripens giant, and the two players pull it
 * out together, each tapping their own half of the screen. Every filled order
 * brings a gift (seeds, more beds, a ladybird, bees, a fountain, a puppy,
 * decorations, then prize medals) and the tree grows. The garden is kept.
 *
 * Nothing ever dies: a dry or bugged plant just waits, drooping, for help.
 * The seed the visitor still needs is always shown on an empty bed, so a
 * garden can never fill up with the wrong thing for good.
 */
(function () {
  'use strict';

  /* ---------------------------------------------------------- what grows */

  var CROPS = {
    tomato: { e: '🍅', likes: 'bone', regrow: true, flower: '🌼', leaf: '🌿', form: 'stake', unripe: 'green' },
    chilli: { e: '🌶️', likes: 'fish', regrow: true, flower: '🌼', leaf: '🌿', form: 'stake', unripe: 'green' },
    carrot: { e: '🥕', likes: 'leaf', regrow: false, root: true, leaf: '🌿', form: 'root', giant: true, tilt: -45 },
    corn: { e: '🌽', likes: 'fish', regrow: false, leaf: '🌾', form: 'tall', unripe: 'pale' },
    strawberry: { e: '🍓', likes: 'leaf', regrow: true, flower: '🌸', leaf: '☘️', form: 'low', unripe: 'green' },
    eggplant: { e: '🍆', likes: 'bone', regrow: true, flower: '🌸', leaf: '🌿', form: 'stake', unripe: 'pale' },
    pumpkin: { e: '🎃', likes: 'leaf', regrow: false, flower: '🌼', leaf: '🌿', form: 'sprawl', unripe: 'green', giant: true },
    cucumber: { e: '🥒', likes: 'fish', regrow: true, flower: '🌼', leaf: '🌿', form: 'stake', unripe: 'pale' },
    potato: { e: '🥔', likes: 'bone', regrow: false, root: true, flower: '🌸', leaf: '🌿', form: 'root', giant: true },
  };
  var CROP_IDS = Object.keys(CROPS);
  var START_CROPS = ['tomato', 'chilli'];
  var FOODS = { leaf: { e: '🍂' }, bone: { e: '🦴' }, fish: { e: '🐟' } };
  var FOOD_IDS = ['leaf', 'bone', 'fish'];
  var BUGS = ['🐛', '🐌', '🐜'];
  var VISITORS = ['🐰', '🐻', '🐷', '🐮', '🐔', '🐼', '🦊', '🐨', '🐸', '🐵'];
  /* every visitor has a favourite vegetable, and a voice (a MIDI note) */
  var FAV = { '🐰': 'carrot', '🐻': 'strawberry', '🐷': 'pumpkin', '🐮': 'corn', '🐔': 'tomato',
    '🐼': 'corn', '🦊': 'chilli', '🐨': 'eggplant', '🐸': 'cucumber', '🐵': 'potato' };
  var VOICE = { '🐰': 79, '🐻': 55, '🐷': 60, '🐮': 52, '🐔': 76, '🐼': 57, '🦊': 72, '🐨': 64, '🐸': 67, '🐵': 74 };
  var HELPERS = { ladybird: '🐞', bees: '🐝', fountain: '⛲', pup: '🐕' };

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
    { kind: 'helper', id: 'pup', e: '🐕' },
  ];
  var DECOR = ['🌷', '🌻', '🐔', '🦆', '🐈', '🍄', '🦔', '🐇', '🐦', '🏡'];   // (the tree lives in the yard)
  var MEDALS = 3;                 // prize medals per vegetable
  var TREE_AT = [0, 3, 7, 12, 18, 25];   // our tree: sprout, sapling, young, big, blossom, fruit

  var STAGE_S = [6, 7, 8, 8];     // seconds in each stage, at normal speed, when cared for
  var STAGE_S_EARLY = [3, 5, 7, 7]; // the first two rounds: things happen sooner
  var MAX_WATER = 3;              // drops of water a bed holds
  var MAX_BASKET = 3;             // of one vegetable (the basket shows them all: no hidden amounts)

  var BED_GAP = 0.18;             // s between counted actions on one bed
  var TICKLE = [0.06, 0.07, 0.08]; // of a stage per tickle, by help
  var TICKLE_GAP = 0.35;          // s between tickle boosts on one bed
  var TICKLE_CAP = 0.5;           // at most half of each stage comes from tickles
  var GIANT_P = 0.2, PULL_NEED = [14, 12, 10], HEAVE_GAP = 0.15, TOGETHER_S = 1.0;

  /* ---------------------------------------------------------- pure rules */

  function emptyPlot() { return { crop: null, stage: 0, t: 0, water: 0, dry: 0, fed: null, bug: null, fruits: 0, perfect: true, picks: 0, thirst: 0, bugT: 0, giant: false }; }

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

  /** Our tree's stage (0 sprout .. 5 fruit), from the orders filled. Never stored. */
  function treeStage(done) { var s = 0; while (s + 1 < TREE_AT.length && done >= TREE_AT[s + 1]) s++; return s; }

  /** Does a plant that just ripened come up giant? o = {done, giants, already, bees}; r in [0, 1). */
  function becomesGiant(p, o, r) {
    var c = CROPS[p.crop];
    if (!c || !c.giant || p.fed !== c.likes || o.already || o.done < 3) return false;
    if (!p.perfect && !o.bees) return false;
    return o.giants === 0 || r < GIANT_P;   // the first one is certain, then 1 in 5
  }

  /** Saved garden, checked and repaired: anything odd becomes something sensible. */
  function cleanFarm(raw) {
    if (!raw || typeof raw !== 'object') raw = {};
    var num = function (v, lo, hi, d) { if (v === null || v === '' || typeof v === 'boolean') return d; v = Number(v); return isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d; };
    var done = Math.floor(num(raw.done, 0, 9999, 0));
    var u = unlocks(done);
    // the visitor's order; one that is already filled was left during the hand-over: it still counts
    var order = null;
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
        if (orderDone({ want: want, got: got })) { done++; u = unlocks(done); }
        else order = { who: o.who, want: want, got: got };
      }
    }
    var f = { done: done, crops: u.crops, beds: u.beds, helpers: u.helpers, decor: u.decor, prizes: u.prizes, plots: [], basket: {}, order: order, rainIn: null,
      giants: Math.floor(num(raw.giants, 0, 999, 0)) };
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
          p.giant = q.giant === true && !!CROPS[p.crop].giant && p.stage === 4;
          if (p.giant) p.fruits = 3;
        }
      }
      f.plots.push(p);
    }
    if (raw.basket && typeof raw.basket === 'object') {
      CROP_IDS.forEach(function (c) { var n = Math.floor(num(raw.basket[c], 0, MAX_BASKET, 0)); if (n) f.basket[c] = n; });
    }
    f.rainIn = num(raw.rainIn, 5, 110, null);
    return f;
  }

  function orderDone(o) { return Object.keys(o.want).every(function (c) { return (o.got[c] || 0) >= o.want[c]; }); }

  /**
   * A new visitor and their wish list: a little bigger as the garden grows.
   * The visitor comes first; from the third order they usually want their
   * favourite vegetable. A newly earned seed is wanted in the next two orders.
   * Once the basket holds four or more kinds, the visitor takes a whole pile of
   * what it has most of (so the basket empties again); otherwise they lean a
   * little towards what the basket is short of. They never want only what is
   * already in it.
   */
  function makeOrder(farm, rnd, prevWho) {
    var done = farm.done, crops = farm.crops, have = farm.basket || {};
    var stock = function (c) { return have[c] || 0; };
    if (done === 0) return { who: '🐰', want: { tomato: 1, chilli: 1 }, got: {} };
    var pool = VISITORS.filter(function (v) { return v !== prevWho; });
    var likers = pool.filter(function (v) { return crops.indexOf(FAV[v]) >= 0; });
    if (done >= 2 && likers.length && rnd() < 0.67) pool = likers;
    var who = pool[Math.floor(rnd() * pool.length)];
    var fav = done >= 2 && crops.indexOf(FAV[who]) >= 0 ? FAV[who] : null;
    var total = done < 3 ? 3 : done < 8 ? 4 : 5;
    var kinds = Math.min(crops.length, done < 5 ? 2 : 3);
    var newest = crops[crops.length - 1], gi = -1;
    GIFTS.forEach(function (g, k) { if (g.kind === 'crop' && g.id === newest) gi = k; });
    var fresh = gi >= 0 && done - (gi + 1) < 2;
    var chosen = fresh ? [newest] : [], drain = null;
    if (fav && chosen.indexOf(fav) < 0) chosen.push(fav);
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
    // something always has to be grown (and the favourite is never the one given up)
    if (chosen.every(function (c) { return stock(c) >= want[c]; })) {
      var byStock = function (list) { return list.slice().sort(function (a, b) { return stock(a) - stock(b); }); };
      var low = byStock(grow)[0];                        // (the whole pile stays wanted)
      if (low && stock(low) < 3) want[low] = Math.min(3, stock(low) + 1);
      else {
        var other = crops.filter(function (c) { return !want[c] && stock(c) < 3; }).sort(function (a, b) { return stock(a) - stock(b); })[0];
        if (other) {
          var noFav = grow.filter(function (c) { return c !== fav; });
          var drop = noFav.length ? byStock(noFav)[0] : drain || low;
          if (drop) delete want[drop];
          want[other] = stock(other) + 1;
        }
      }
    }
    return { who: who, want: want, got: {} };
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
    howTo: 'Grow vegetables together. Tap a bed and it gets what it needs: the seed shown on it, water, or the bug brushed off; tap a happy plant to tickle it and it grows faster. When a plant asks for food, tap the sack it wants. Pick the ripe ones and tap the visitor to hand over their wish. Now and then a giant vegetable needs you both: each tap your own side to pull. Every filled order brings a gift, your tree grows, and the garden is kept for next time.',
    options: [
      { key: 'speed', label: 'Growing', default: 'normal', choices: [{ value: 'quick', label: 'Quick', emoji: '🐇' }, { value: 'normal', label: 'Normal', emoji: '🌱' }, { value: 'slow', label: 'Slow', emoji: '🐢' }] },
      { key: 'bugs', label: 'Bugs', default: 'some', choices: [{ value: 'none', label: 'None', emoji: '🌼' }, { value: 'some', label: 'Some', emoji: '🐛' }, { value: 'lots', label: 'Lots', emoji: '🐜' }] },
    ],

    mount: function (root, ctx) {
      var el = ctx.el, sfx = ctx.sfx, fx = ctx.fx, util = ctx.util;
      var RM = !!MG.reducedMotion;
      var SPEED = { quick: 0.65, normal: 1, slow: 1.5 }[ctx.opt('speed')] || 1;
      var BUGRATE = { none: 0, some: 1, lots: 1.9 }[ctx.opt('bugs')];
      if (BUGRATE == null) BUGRATE = 1;
      // one shared garden: the little one's help level softens it for both
      var help = Math.max(ctx.helpFor(0), ctx.helpFor(1));
      var DRY_S = [7, 8.5, 10][help];                    // seconds a drop of water lasts
      var BUG_P = [0.12, 0.08, 0.05][help] * BUGRATE;    // chance per growing plant per bug check
      var IDLE_S = help ? 7 : 14;                        // quiet seconds before the ghost hand shows what to do
      var GRACE_S = [4, 6, 8][help];                     // a plant left dry or bugged this long gives one fruit fewer
      // the side the hand starts on in a pull: the little one's (or whoever starts this round)
      var littles = [0, 1].filter(function (i) { return ctx.players[i] && ctx.players[i].little; });
      var aSide = littles.length === 1 ? littles[0] : ctx.firstPlayer;

      var farm = cleanFarm(ctx.load('farm', null));
      if (!farm.order) farm.order = makeOrder(farm, Math.random, ctx.load('lastWho', null));
      var state = 'play';                 // play -> pull -> pop -> play (a giant); play -> gift (the order is filled)
      var delivering = false;
      var tutorBug = false;               // the first rounds bring one bug early, to show what a bed tap does to it
      var raining = 0, nextRain = farm.rainIn != null ? farm.rainIn : util.randf(25, 60);
      var bugClock = 0, ladyClock = 0, fountainClock = 0, saveClock = 0;
      var lastTap = 0, lastHinted = null, lastCheer = -1, cheers = 0, tapped = false;
      var lastPoke = -1, lastMango = -9, pupHopAt = -9, pupUntil = -9;
      var gateSz = 110, cellSz = 100, pullV = 120, pullA = 60;
      var care = [];                      // per bed, not saved: {nextAt, tickleAt, tk, tickles, tickAt}
      var ghost = {};                     // per empty bed, not saved: the crop a tap would plant
      var bonusAt = [];                   // per bed: when its third (care) fruit popped in, this mount
      var log = [];                       // the last cues: decorative moments, for tests
      var giantThisMount = false, pull = null;
      var treeShown = treeStage(farm.done);

      function cue(c, i) {
        log.push({ t: Math.round(ctx.time * 1000) / 1000, c: c, i: i == null ? null : i });
        if (log.length > 80) log.shift();
      }

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

      // the beds, with the rain and the rainbow over them
      var bedsEl = el('div', { class: 'gd-beds' });
      var rainEl = el('div', { class: 'gd-rain', 'aria-hidden': 'true' });
      var rainbowEl = el('div', { class: 'gd-rainbow', 'aria-hidden': 'true' });
      (function () { var p = rainbowEl; for (var k = 0; k < 5; k++) { var r = el('span', { class: 'gd-rainbow__ring', 'data-k': String(k) }); p.appendChild(r); p = r; } })();
      var gardenEl = el('div', { class: 'gd-garden' }, bedsEl, rainEl, rainbowEl);
      var plotEls = [];

      // the yard: our tree, then the helpers and decorations the gifts brought
      var treeEl = el('span', { class: 'gd-tree gd-yard__item', 'data-e': '🌳', 'aria-label': 'Tree' });
      var yardItemsEl = el('div', { class: 'gd-yard__items' });
      var yardEl = el('div', { class: 'gd-yard', 'data-poke': 'on' }, treeEl, yardItemsEl);

      // the three food sacks (the only "which one?" choice in the game)
      var toolEls = {};
      var sacksEl = el('div', { class: 'gd-sacks' }, FOOD_IDS.map(function (f) {
        var b = el('button', { type: 'button', class: 'gd-tool gd-tool--' + f, 'data-tool': f, 'aria-label': 'Food' }, el('span', { class: 'gd-sack gd-sack--' + f }, ctx.sticker(FOODS[f].e)));
        toolEls[f] = b;
        return b;
      }));

      var giftEl = el('div', { class: 'gd-gift', hidden: true, 'aria-hidden': 'true' });

      // heave-ho: two halves of the screen, a giant vegetable in a mound, a team on each side
      var halfEls = [0, 1].map(function (s) { return el('button', { type: 'button', class: 'gd-pull__half', 'data-side': String(s), 'aria-label': 'Pull' }); });
      var pullVeg = el('span', { class: 'gd-pull__veg' });
      var pullTop = el('span', { class: 'gd-pull__top' });
      var pullGroup = el('span', { class: 'gd-pull__group' }, pullVeg, pullTop);
      var liftEl = el('div', { class: 'gd-pull__lift', 'aria-hidden': 'true' }, pullGroup);
      var moundEl = el('div', { class: 'gd-pull__mound', 'aria-hidden': 'true' });
      var ropeEls = [0, 1].map(function (s) { return el('span', { class: 'gd-pull__rope', 'data-side': String(s), 'aria-hidden': 'true' }); });
      var teamEls = [0, 1].map(function (s) { return el('div', { class: 'gd-pull__team', 'data-side': String(s), 'aria-hidden': 'true' }); });
      var pullEl = el('div', { class: 'gd-pull', hidden: true }, halfEls[0], halfEls[1], liftEl, moundEl, ropeEls[0], ropeEls[1], teamEls[0], teamEls[1]);

      scene.appendChild(gate);
      scene.appendChild(gardenEl);
      scene.appendChild(yardEl);
      scene.appendChild(sacksEl);
      scene.appendChild(giftEl);
      scene.appendChild(pullEl);

      function set(name, v, raw) { root.style.setProperty(name, raw ? String(v) : v + 'px'); }
      function centre(node) { return fx.centerOf(node); }

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
          if (!care[i]) care[i] = { nextAt: -9, tickleAt: -9, tk: 0, tickles: 0, tickAt: -9 };
          return b;
        });
        care.length = farm.plots.length;
        planSeeds();
        farm.plots.forEach(function (p, i) { renderPlot(i); });
      }

      function buildYard() {
        yardItemsEl.textContent = '';
        Object.keys(HELPERS).forEach(function (k) {
          if (farm.helpers[k]) yardItemsEl.appendChild(el('span', { class: 'gd-yard__item gd-helper gd-helper--' + k, 'data-h': k, 'data-e': HELPERS[k] }, ctx.sticker(HELPERS[k])));
        });
        farm.decor.forEach(function (e) { yardItemsEl.appendChild(el('span', { class: 'gd-yard__item gd-deco', 'data-e': e }, ctx.sticker(e))); });
        renderTree();
      }

      /** Our tree, as it was last shown (it grows in front of them, during a thank-you). */
      function renderTree() {
        var s = treeShown;
        treeEl.dataset.stage = String(s);
        treeEl.textContent = '';
        if (s === 0) treeEl.appendChild(el('span', { class: 'gd-tree__mound' }));
        treeEl.appendChild(el('span', { class: 'gd-tree__plant' }, ctx.sticker(s === 0 ? '🌱' : '🌳')));
        if (s >= 4) {
          var extra = el('span', { class: 'gd-tree__extra' });
          for (var k = 0; k < 3; k++) extra.appendChild(ctx.sticker(s === 4 ? '🌸' : '🥭'));
          treeEl.appendChild(extra);
        }
      }

      /* ---- seeds shown on empty beds ---- */

      /** The crops the visitor still needs that no bed is growing, in wish-list order (each at most once). */
      function neededSeeds() {
        var o = farm.order;
        if (!o) return [];
        return Object.keys(o.want).filter(function (c) {
          return stillWanted(c) > 0 && !farm.plots.some(function (p) { return p.crop === c; });
        });
      }
      /** Every unlocked crop, least present first (beds growing it + planned seeds + basket); ties: newest first. */
      function varietyOrder() {
        var n = function (c) {
          return farm.plots.filter(function (p) { return p.crop === c; }).length
            + Object.keys(ghost).filter(function (k) { return ghost[k] === c; }).length + (farm.basket[c] || 0);
        };
        return farm.crops.slice().sort(function (a, b) { return n(a) - n(b) || farm.crops.indexOf(b) - farm.crops.indexOf(a); });
      }
      function planSeeds() {
        // keep every plan whose bed is still empty and whose crop is still unlocked (a plan never changes under a finger)
        Object.keys(ghost).forEach(function (k) { var p = farm.plots[k]; if (!p || p.crop || farm.crops.indexOf(ghost[k]) < 0) delete ghost[k]; });
        var empties = farm.plots.map(function (p, i) { return p.crop ? -1 : i; }).filter(function (i) { return i >= 0; });
        // every needed seed is shown somewhere: on the first empty bed without a plan, else it replaces the
        // plan of the last empty bed whose plan is not needed
        var need = neededSeeds();
        need.forEach(function (c) {
          if (empties.some(function (i) { return ghost[i] === c; })) return;
          var free = empties.filter(function (i) { return !ghost[i]; })[0];
          if (free == null) free = empties.filter(function (i) { return need.indexOf(ghost[i]) < 0; }).pop();
          if (free != null) ghost[free] = c;
        });
        // the rest get variety, recounted after each one
        empties.forEach(function (i) { if (!ghost[i]) ghost[i] = varietyOrder()[0]; });
      }

      /* ---- drawing the state ---- */

      function isHungry(p) { return !!p.crop && p.stage === 2 && !p.fed && p.t >= 0.5; }
      function bonusLive(i) { return bonusAt[i] != null && ctx.time - bonusAt[i] < 1; }

      function stickerTilted(e, tilt) {
        var s = ctx.sticker(e);
        if (tilt) s.style.transform = 'rotate(' + tilt + 'deg)';
        return s;
      }

      function renderPlot(i) {
        var p = farm.plots[i], b = plotEls[i];
        if (!b) return;
        var hungry = isHungry(p), late = p.stage === 3 && p.t >= 0.5, labels = root.dataset.labels === 'on';
        var sig = [p.crop, p.stage, p.water, p.fed, p.bug, p.fruits, hungry, farm.prizes[p.crop] || 0, p.crop ? '' : ghost[i] + '/' + (farm.prizes[ghost[i]] || 0),
          late, p.giant, labels, bonusLive(i)].join('|');
        b.style.setProperty('--t', p.t.toFixed(2));
        if (sig === b._sig) return;
        b._sig = sig;
        var c = p.crop ? CROPS[p.crop] : null;
        b.dataset.stage = p.crop ? String(p.stage) : 'empty';
        b.dataset.crop = p.crop || '';
        b.dataset.form = c ? c.form : '';
        b.classList.toggle('is-wet', p.water > 0);
        b.classList.toggle('is-dry', !!p.crop && p.stage < 4 && p.water === 0);
        b.classList.toggle('is-hungry', hungry);
        b.classList.toggle('is-bugged', !!p.bug);
        b.classList.toggle('is-ripe', !!p.crop && p.stage === 4);
        b.classList.toggle('is-root', !!c && !!c.root);
        b.classList.toggle('is-giant', !!p.giant);
        b.classList.toggle('is-grown', !!c && p.stage >= 2);
        // everything but a cameo still playing is drawn afresh
        var keep = null;
        for (var n = b.firstChild; n; ) { var nx = n.nextSibling; if (n.classList && n.classList.contains('gd-cameo')) { keep = keep || n; } else b.removeChild(n); n = nx; }
        var add = function (node) { b.insertBefore(node, keep); };
        add(el('span', { class: 'gd-soil' }, el('i'), el('i'), el('i')));
        if (c) {
          if (c.form === 'stake' && p.stage >= 2) add(el('span', { class: 'gd-stake' }));
          var plant = el('span', { class: 'gd-plant' });
          if (p.stage === 0) plant.appendChild(el('span', { class: 'gd-seed' }));
          else if (p.stage === 1) plant.appendChild(ctx.sticker('🌱'));
          else if (c.form === 'low' || c.form === 'sprawl') { plant.appendChild(ctx.sticker(c.leaf)); plant.appendChild(ctx.sticker(c.leaf)); }
          else plant.appendChild(ctx.sticker(c.leaf));
          if (p.stage === 3 && !late) plant.appendChild(el('span', { class: 'gd-flowers' }, ctx.sticker(c.flower || '🌼'), ctx.sticker(c.flower || '🌼')));
          add(plant);
          if (late && !c.root) add(el('span', { class: 'gd-unripe', 'data-f': c.unripe }, ctx.sticker(c.e), ctx.sticker(c.e)));
          if (late && c.root) add(el('span', { class: 'gd-peek gd-peek--small' }, stickerTilted(c.e, c.tilt)));
          if (p.stage === 4 && p.giant) {
            add(el('span', { class: 'gd-peek gd-peek--giant' }, stickerTilted(c.e, c.tilt)));
            add(el('span', { class: 'gd-sparkle' }, ctx.sticker('✨')));
          }
          // a just-sown bed shows its seed packet on a stick, so it is plain what was planted
          if (p.stage === 0) add(el('span', { class: 'gd-packet gd-marker' }, packet(p.crop)));
          if (labels && p.stage >= 1 && p.stage <= 3) add(el('span', { class: 'gd-packet gd-label' }, el('span', { class: 'gd-packet__veg' }, ctx.sticker(c.e))));
          if (p.stage === 4 && !p.giant) {
            var fr = el('span', { class: 'gd-fruits', 'data-n': String(p.fruits) });
            for (var k = 0; k < p.fruits; k++) {
              var f = ctx.sticker(c.e);
              if (k === 2 && bonusLive(i)) f.classList.add('is-bonus');
              fr.appendChild(f);
            }
            add(fr);
          }
          if (p.bug) add(el('span', { class: 'gd-bug' }, ctx.sticker(p.bug)));
          var need = null;
          if (p.stage < 4 && p.water === 0) need = '💧';
          else if (hungry) need = FOODS[c.likes].e;
          if (need) add(el('span', { class: 'gd-need' }, ctx.sticker(need)));
          if (p.fed && p.stage <= 2) add(el('span', { class: 'gd-fed' }, ctx.sticker(FOODS[p.fed].e)));
        } else if (ghost[i]) {
          // an empty bed shows (see-through, dashed, floating) the seed a tap will sow
          add(el('span', { class: 'gd-packet gd-marker is-ghost' }, packet(ghost[i])));
        }
        var drops = el('span', { class: 'gd-drops', 'aria-hidden': 'true' });
        for (var d = 0; d < MAX_WATER; d++) drops.appendChild(el('i', { class: d < p.water ? 'is-full' : '' }));
        add(drops);
      }

      function renderAll() { farm.plots.forEach(function (p, i) { renderPlot(i); }); }

      /** The wish list; `got` may be a display copy that runs behind during a hand-over. */
      function renderOrder(got) {
        var o = farm.order;
        if (!o) return;
        got = got || o.got;
        whoEl.textContent = '';
        whoEl.appendChild(ctx.sticker(o.who));
        wishEl.textContent = '';
        var fav = favOf(o);
        Object.keys(o.want).forEach(function (c) {
          for (var k = 0; k < o.want[c]; k++) {
            var item = el('span', { class: 'gd-wish__item' + (k < (got[c] || 0) ? ' is-got' : '') + (c === fav && k === 0 ? ' is-fav' : ''), 'data-crop': c }, ctx.sticker(CROPS[c].e));
            if (c === fav && k === 0) item.appendChild(el('span', { class: 'gd-wish__heart' }, ctx.sticker('💖')));
            wishEl.appendChild(item);
          }
        });
      }
      /** The visitor's favourite, when it is on their list (from the third order). */
      function favOf(o) { var f = o && farm.done >= 2 ? FAV[o.who] : null; return f && o.want[f] ? f : null; }

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

      /** A sack bobs while some plant is asking for that food. */
      function renderSacks() {
        FOOD_IDS.forEach(function (f) {
          toolEls[f].classList.toggle('is-asked', farm.plots.some(function (p) { return isHungry(p) && CROPS[p.crop].likes === f; }));
        });
      }

      /* ---- sizing ---- */

      function fit() {
        var s = ctx.size(), w = s.w, h = s.h, port = s.orient === 'portrait', gap = 10, G = 8, U = util;
        var sack, gateS, yard, gw, gh, L;
        if (port) {
          sack = U.clamp(Math.floor(Math.min((w - 24 - 2 * gap) / 3, h * 0.1)), 64, 96);
          gateS = U.clamp(Math.floor(h * 0.15), 84, 140);
          yard = U.clamp(Math.floor(h * 0.1), 64, 104);
          gw = w - 24; gh = h - 24 - gateS - yard - sack - 3 * gap; L = w - 24;
        } else {
          sack = U.clamp(Math.floor(Math.min((h - 24 - 2 * gap) / 3, w * 0.11)), 64, 96);
          gateS = U.clamp(Math.floor(w * 0.19), 124, 220);
          yard = U.clamp(Math.floor(w * 0.1), 64, 104);
          gw = w - 24 - yard - gateS - sack - 3 * gap; gh = h - 24; L = h - 24;
        }
        gateSz = gateS;
        // beds: 2 or 3 columns, whichever gives the bigger square (4 beds: 2; 9 beds: 3)
        var n = farm.plots.length, best = null;
        (n <= 4 ? [2] : n >= 9 ? [3] : [2, 3]).forEach(function (cols) {
          var rows = Math.ceil(n / cols);
          var c = Math.floor(Math.min((gw - (cols - 1) * G) / cols, (gh - (rows - 1) * G) / rows));
          if (!best || c > best.c) best = { c: c, cols: cols };
        });
        var cell = Math.min(190, best.c);
        if (port && cell < 64) {                       // the beds never go under 64: the yard gives up room first
          var rws = Math.ceil(n / best.cols), short = 64 * rws + (rws - 1) * G - gh;
          yard = Math.max(48, yard - short); cell = 64;
        }
        cellSz = cell;
        // the yard: the tree is a square as thick as the yard; the items share the rest in 1..3 lines
        var items = yardItemsEl.childNodes.length, rest = L - yard - 6, yb = null;
        for (var k = 1; k <= 3 && items; k++) {
          var per = Math.ceil(items / k);
          var d = Math.floor(Math.min(48, port ? Math.min(yard / k / 1.15, rest / per / 1.35) : Math.min(yard / k / 1.35, rest / per / 1.15)));
          if (!yb || d > yb.d) yb = { d: d, per: per };
        }
        // the pull scene
        var gmin = Math.min(w, h);
        pullV = Math.min(Math.round(gmin * 0.42), Math.round(h * 0.36), 300);
        pullA = U.clamp(Math.round(gmin * 0.2), 56, 140);
        var rows = Math.ceil(n / best.cols), bedsW = best.cols * cell + (best.cols - 1) * G, bedsH = rows * cell + (rows - 1) * G;
        set('--sack', sack); set('--gate', gateS); set('--yard', yard); set('--cell', cell); set('--cols', best.cols, true);
        set('--yd', yb ? yb.d : 0); set('--yper', yb ? yb.per : 1, true);
        set('--bedsw', bedsW); set('--bedsh', bedsH); set('--rb', Math.max(4, Math.round(bedsW * 0.9 / 28)));
        set('--cameo', Math.max(30, Math.round(cell * 0.36)));
        root.dataset.labels = cell >= 90 ? 'on' : 'off';
        root.dataset.favBadge = (port ? gateS * 0.2 : gateS * 0.17) >= 20 ? 'on' : 'off';
        yardEl.dataset.poke = yard >= 64 ? 'on' : 'off';
        // shrink-to-fit: while a yard sticker is bigger than its place, make them all a little smaller
        if (yb) {
          var dd = yb.d;
          for (var tries = 0; tries < 8 && yardOverflows(); tries++) { dd = Math.floor(dd * 0.9); set('--yd', dd); }
        }
        layoutPull();
        if (!pullEl.hidden) shrinkPull();
        renderAll();
        renderBasket();
      }

      function yardOverflows() {
        var box = yardItemsEl.getBoundingClientRect();
        return [].some.call(yardItemsEl.querySelectorAll('.gd-yard__item > .mg-sticker'), function (n) {
          var cell = n.parentNode;
          return n.offsetWidth > cell.clientWidth + 1 || n.offsetHeight > cell.clientHeight + 1 ||
            cell.offsetLeft + cell.offsetWidth > box.width + 1 || cell.offsetTop + cell.offsetHeight > box.height + 1;
        });
      }

      /* ---- the ghost hand ---- */

      function hint(node, o) {
        lastHinted = node || null;
        ctx.hint(node || null, o);
        return true;
      }

      /** The half of the pull to point at: the one that has pulled less (the little one's first). */
      function pullSide() {
        if (!pull) return aSide;
        var a = pull.heaves[aSide], b = pull.heaves[1 - aSide];
        return a <= b ? aSide : 1 - aSide;
      }

      /** A plant worth tickling: growing, wet, unbugged, not hungry and not at its tickle cap. A plant of a
       *  still-wanted crop first (nearest to ripe); otherwise, when a seed is needed and no bed is free,
       *  the one that ripens soonest and frees a bed. Otherwise -1. */
      function tickleTarget() {
        var ps = farm.plots, cand = [];
        ps.forEach(function (p, i) {
          if (p.crop && p.stage < 4 && p.water > 0 && !p.bug && !isHungry(p) && care[i] && care[i].tk < TICKLE_CAP - 1e-6) cand.push(i);
        });
        var score = function (i) { return ps[i].stage + ps[i].t; };
        var best = -1;
        cand.forEach(function (i) { if (stillWanted(ps[i].crop) > 0 && (best < 0 || score(i) > score(best))) best = i; });
        if (best >= 0) return best;
        if (neededSeeds().length && !ps.some(function (p) { return !p.crop; })) cand.forEach(function (i) { if (best < 0 || score(i) > score(best)) best = i; });
        return best;
      }

      function hintNext() {
        lastHinted = null;
        if (state === 'pull') { hint(halfEls[pullSide()]); return; }
        if (state !== 'play') return;
        if (canDeliver()) { hint(visitBtn); return; }
        var ps = farm.plots, wantedFirst = function (f) {          // plants of a still-wanted crop first, then any
          for (var pass = 0; pass < 2; pass++) for (var k = 0; k < ps.length; k++)
            if (f(ps[k]) && (pass === 1 || stillWanted(ps[k].crop) > 0)) return k;
          return -1;
        }, i;
        if ((i = ps.findIndex(function (p) { return p.crop && p.stage === 4 && p.giant; })) >= 0) { hint(plotEls[i]); return; }   // the giant!
        if ((i = ps.findIndex(function (p) { return p.crop && p.stage === 4 && stillWanted(p.crop) > 0; })) >= 0) { hint(plotEls[i]); return; }
        var need = neededSeeds();
        for (var n = 0; n < need.length; n++) {                                                               // sow it
          if ((i = ps.findIndex(function (p, k) { return !p.crop && ghost[k] === need[n]; })) >= 0) { hint(plotEls[i]); return; }
        }
        if ((i = wantedFirst(function (p) { return p.bug; })) >= 0) { hint(plotEls[i]); return; }
        if ((i = wantedFirst(function (p) { return p.crop && p.stage < 4 && p.water === 0; })) >= 0) { hint(plotEls[i]); return; }
        if ((i = wantedFirst(isHungry)) >= 0) { hint(toolEls[CROPS[ps[i].crop].likes]); return; }
        if ((i = ps.findIndex(function (p) { return p.crop && p.stage === 4; })) >= 0) { hint(plotEls[i]); return; }   // room, and more in the basket
        if ((i = tickleTarget()) >= 0) { hint(plotEls[i]); return; }
        hint(null);                                                 // nothing to do: no hand left on a job already done
      }

      /* ---- a tap on a bed: it does what the bed shows it needs ---- */

      function useBed(i) {
        if (state !== 'play') return;
        var p = farm.plots[i], b = plotEls[i], c = care[i];
        if (!p || !b || !c) return;
        if (ctx.time < c.nextAt) { squash(i); return; }             // per-bed gap: a squash, no change
        c.nextAt = ctx.time + BED_GAP;
        if (p.crop && p.stage === 4) { if (p.giant) openPull(i); else harvest(i); return; }
        if (!p.crop) { plant(i); return; }        // the seed shown on the bed
        if (p.bug) { shoo(i, true); return; }     // a bug is brushed off first
        if (p.water === 0) { water(i); return; }  // the 💧 bubble: water to full
        if (isHungry(p)) { ask(i); return; }      // food comes from the sacks: point at the right one
        tickle(i);                                // a happy growing plant: tickle it
      }

      function squash(i) {
        var b = plotEls[i], c = care[i];
        if (!b) return;
        b.classList.add('is-press');
        ctx.after(90, function () { b.classList.remove('is-press'); });
        if (ctx.time - c.tickAt >= 0.1) { c.tickAt = ctx.time; sfx.play('tick'); }
      }

      function plant(i) {
        var b = plotEls[i];
        if (!ghost[i]) planSeeds();
        var crop = ghost[i];
        if (!crop) return;
        var keep = farm.plots[i].water;
        farm.plots[i] = emptyPlot();
        farm.plots[i].crop = crop;
        farm.plots[i].water = keep;
        delete ghost[i];
        care[i].tk = 0;
        bonusAt[i] = null;
        sfx.play('drop');
        fx.pop(b);
        var c = centre(b);
        fx.burst(c.x, c.y, { color: '#8A5A32', count: 6, distance: 22, size: 7 });
        cue('plant', i);
        after();
      }

      /** A little cloud rains on the bed, or a spray bottle puffs at its bug: what the tap did, every time. */
      function cameo(i, kind) {
        var b = plotEls[i];
        if (!b) return;
        b.querySelectorAll('.gd-cameo--' + kind).forEach(function (n) { n.remove(); });
        var bits = el('span', { class: 'gd-cameo__bits' });
        for (var k = 0; k < 3; k++) bits.appendChild(ctx.sticker(kind === 'rain' ? '💧' : '💨'));
        var n = el('span', { class: 'gd-cameo gd-cameo--' + kind, 'aria-hidden': 'true' }, ctx.sticker(kind === 'rain' ? '🌧️' : '🧴'), bits);
        b.appendChild(n);
        ctx.after(950, function () { if (n.parentNode) n.parentNode.removeChild(n); });
      }

      function water(i) {
        var p = farm.plots[i], b = plotEls[i];
        p.water = MAX_WATER;
        p.dry = 0;
        p.thirst = 0;
        sfx.play('splash');
        if (p.crop) fx.bounce(b);
        cue('water', i);
        after();
        cameo(i, 'rain');
      }

      function ask(i) {
        var p = farm.plots[i], b = plotEls[i], food = CROPS[p.crop].likes;
        fx.wiggle(b);
        var bubble = b.querySelector('.gd-need');
        if (bubble) fx.pop(bubble);
        fx.pop(toolEls[food]);
        sfx.play('tick');
        if (help) hint(toolEls[food], { delay: 250 });
        cue('ask', i);
      }

      function tickle(i) {
        var p = farm.plots[i], b = plotEls[i], c = care[i];
        var plantEl = b.querySelector('.gd-plant');
        if (plantEl) fx.wiggle(plantEl);
        var add = 0;
        if (ctx.time >= c.tickleAt && c.tk < TICKLE_CAP - 1e-9) {
          add = Math.min(TICKLE[help], TICKLE_CAP - c.tk);
          if (p.stage === 2 && !p.fed) add = Math.min(add, 0.5 - p.t);
        }
        if (add <= 1e-9) {
          sfx.play('pop', { pitch: 520 });
          cue('tickle-rest', i);
          return;
        }
        p.t += add;
        c.tk += add;
        if (p.stage === 2 && !p.fed && 0.5 - p.t < 1e-6) p.t = 0.5;     // it stops just where the plant asks for food
        c.tickleAt = ctx.time + TICKLE_GAP;
        c.tickles++;
        sfx.scale(2 + c.tickles % 8);
        if (c.tickles % 4 === 0) sfx.play('giggle');
        var q = centre(b);
        fx.burst(q.x, q.y - b.offsetHeight * 0.15, { emoji: p.stage === 3 ? '🦋' : '🎵', count: 2, distance: 30, size: 16 });
        if (p.t >= 1) stageUp(i);
        cue('tickle', i);
        after();
      }

      /** A plant moves up a stage (growing by itself, or tickled there). Ripening may bring a bonus fruit, or a giant. */
      function stageUp(i) {
        var p = farm.plots[i], b = plotEls[i];
        p.t = 0;
        p.stage++;
        if (care[i]) care[i].tk = 0;
        if (p.stage < 4) { sfx.play('pop', { pitch: 400 + p.stage * 120 }); return; }
        p.fruits = fruitsFor(p, farm.helpers);
        var c = b ? centre(b) : null;
        if (becomesGiant(p, { done: farm.done, giants: farm.giants, already: giantThisMount, bees: !!farm.helpers.bees }, Math.random())) {
          p.giant = true;
          p.fruits = 3;
          giantThisMount = true;
          sfx.play('boost');
          if (c) fx.burst(c.x, c.y, { emoji: '✨', count: 10, distance: 60, size: 20 });
          cue('giant', i);
          return;
        }
        sfx.play('ding');
        if (c) fx.burst(c.x, c.y, { emoji: '✨', count: 6, distance: 50, size: 18 });
        if (p.fruits === 3) {
          // the third fruit, the one good care brought, pops in on its own
          bonusAt[i] = ctx.time;
          ctx.after(350, function () {
            sfx.play('star');
            var f = plotEls[i] && plotEls[i].querySelector('.gd-fruits .is-bonus');
            if (f) { var q = centre(f); fx.burst(q.x, q.y, { emoji: '✨', count: 6, distance: 30, size: 14 }); }
            cue('bonus', i);
          });
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
        cue('feed:' + food);
        after();
      }

      /** The bug tumbles away. By a tap: the spray bottle puffs at it, and the puppy (if there is one) gives chase. */
      function shoo(i, byTap) {
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
        sfx.noise({ freq: 3000, to: 1800, dur: 0.25, q: 0.8, gain: 0.12 });
        sfx.play('giggle');
        if (byTap) {
          cue('shoo', i);
          if (farm.helpers.pup) pupDash(i);
        }
        after();
        if (byTap) cameo(i, 'spray');
      }

      function harvest(i) {
        var p = farm.plots[i], b = plotEls[i], c = CROPS[p.crop];
        var n = p.fruits, crop = p.crop;
        var from = centre(b);
        farm.basket[crop] = Math.min(MAX_BASKET, (farm.basket[crop] || 0) + n);
        if (c.regrow && !p.picks) {
          // back to leafy for a second crop: it will ask for food again, and flower, and fruit
          p.picks = 1; p.stage = 2; p.t = 0; p.fed = null; p.fruits = 0; p.perfect = true; p.bug = null; p.thirst = 0; p.bugT = 0;
        } else {
          // picked whole: the bed is free for new seeds
          var keep = Math.max(0, p.water - 1);
          farm.plots[i] = emptyPlot();
          farm.plots[i].water = keep;
          if (c.regrow) fx.burst(from.x, from.y, { emoji: '🍃', count: 5, distance: 40, size: 18 });
        }
        care[i].tk = 0;
        bonusAt[i] = null;
        for (var k = 0; k < n; k++) fly(c.e, from, basketBtn, k * 120);
        for (var s = 0; s < n; s++) (function (s2) { ctx.after(s2 * 120, function () { sfx.scale(4 + s2); }); })(s);
        sfx.play('pop', { pitch: 500 + 40 * CROP_IDS.indexOf(crop) });
        fx.pop(b);
        cue('pick', i);
        var pup = yardSticker('pup');
        if (pup && ctx.time - pupHopAt >= 1.5) { pupHopAt = ctx.time; fx.bounce(pup); }
        after();
      }

      /** Something flies from a point to a target (decoration; the state has already changed). */
      function fly(emoji, from, toNode, delay, o) {
        var r = root.getBoundingClientRect(), to = centre(toNode);
        var f = el('span', { class: 'gd-flyer', style: { left: (from.x - r.left) + 'px', top: (from.y - r.top) + 'px' } }, ctx.sticker(emoji));
        if (o && o.size) f.style.fontSize = Math.round(o.size) + 'px';
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

      /** Something changed: plan the seeds for empty beds, redraw what it touches, keep the garden. */
      function after() {
        planSeeds();
        renderAll();
        renderBasket();
        renderSacks();
        save();
      }

      function save() {
        try {
          ctx.save('farm', { v: 2, done: farm.done, plots: farm.plots, basket: farm.basket, order: farm.order, rainIn: Math.round(nextRain), giants: farm.giants });
        } catch (e) { /* storage may be unavailable: the garden simply is not kept */ }
      }

      /* ---- heave-ho: a giant vegetable, pulled out together ---- */

      function openPull(i) {
        var p = farm.plots[i], c = CROPS[p.crop];
        state = 'pull';
        pull = { i: i, crop: p.crop, need: PULL_NEED[help], pulled: 0, last: [-9, -9], next: [0, 0], heaves: [0, 0] };
        hint(null);
        // the vegetable (and a leafy top for the round ones), and a team on each side with whoever has come to help
        pullVeg.textContent = '';
        pullVeg.appendChild(stickerTilted(c.e, c.tilt));
        pullTop.textContent = '';
        if (!c.tilt) pullTop.appendChild(ctx.sticker('🌿'));
        pullEl.dataset.crop = p.crop;
        [0, 1].forEach(function (s) {
          var t = teamEls[s];
          t.textContent = '';
          var helper = s === aSide ? (farm.helpers.pup ? '🐕' : farm.decor.indexOf('🐇') >= 0 ? '🐇' : null)
            : (farm.decor.indexOf('🐈') >= 0 ? '🐈' : farm.decor.indexOf('🐔') >= 0 ? '🐔' : null);
          if (helper) t.appendChild(el('span', { class: 'gd-pull__helper' }, ctx.sticker(helper)));
          t.appendChild(el('span', { class: 'gd-pull__animal' }, ctx.sticker(ctx.players[s].emoji)));
          t.classList.remove('is-heave');
          halfEls[s].removeAttribute('aria-disabled');
        });
        pullEl.classList.remove('is-out', 'is-gone');
        pullEl.style.setProperty('--rise', '0');
        pullEl.hidden = false;
        layoutPull();
        shrinkPull();
        sfx.play('whoosh');
        cue('pull-open', i);
        lastTap = ctx.time;
        ctx.after(600, function () { if (state === 'pull' && pull && !pull.heaves[0] && !pull.heaves[1]) hintNext(); });
      }

      /** Ropes from each team's hands to the top of the vegetable (they tilt up as it comes out). */
      function layoutPull() {
        var s = ctx.size(), W = s.w - 24, H = s.h - 24, V = pullV, A = pullA;
        var span = 1.8 * V, gb = s.orient === 'portrait' ? Math.max(0, (H - span) / 2) : Math.round(H * 0.1);
        var gy = gb + 0.36 * V;
        set('--pv', V); set('--pa', A); set('--pgb', Math.round(gb)); set('--pgy', Math.round(gy));
        var rise = pull ? Math.min(1, pull.pulled / pull.need) : 0;
        var tieY = gy + 0.35 * V + 0.55 * V * rise, handY = gy + 0.35 * V;
        ropeEls.forEach(function (rope, side) {
          var hx = side === 0 ? 0.18 * W + 0.3 * A : 0.82 * W - 0.3 * A, tx = W / 2 + (side === 0 ? -0.12 : 0.12) * V;
          var dx = tx - hx, dy = tieY - handY, len = Math.sqrt(dx * dx + dy * dy), ang = Math.atan2(-dy, dx) * 180 / Math.PI;
          rope.style.left = Math.round(hx) + 'px';
          rope.style.bottom = Math.round(handY - 4) + 'px';
          rope.style.width = Math.round(len) + 'px';
          rope.style.transform = 'rotate(' + ang.toFixed(1) + 'deg)';
        });
      }

      /** Last pass: if an animal or helper pokes out of the pull, make them all a little smaller (up to 4 times). */
      function shrinkPull() {
        var box = pullEl.getBoundingClientRect();
        var out = function () {
          return [].some.call(pullEl.querySelectorAll('.gd-pull__team > *'), function (n) {
            var r = n.getBoundingClientRect();
            return r.left < box.left - 1 || r.right > box.right + 1 || r.top < box.top - 1 || r.bottom > box.bottom + 1;
          });
        };
        for (var k = 0; k < 4 && out(); k++) { pullA = Math.round(pullA * 0.9); layoutPull(); }
      }

      function heave(s) {
        if (state !== 'pull' || !pull) return;                  // 'pop': the halves are aria-disabled anyway
        var now = ctx.time;
        if (now < pull.next[s]) { halfEls[s].classList.add('is-press'); ctx.after(90, function () { halfEls[s].classList.remove('is-press'); }); return; }
        pull.next[s] = now + HEAVE_GAP;
        var together = now - pull.last[1 - s] <= TOGETHER_S;   // the other side pulled just now
        pull.last[s] = now;
        pull.heaves[s]++;
        pull.pulled = Math.min(pull.need, pull.pulled + (together ? 2 : 1));
        pullEl.style.setProperty('--rise', (pull.pulled / pull.need).toFixed(3));
        layoutPull();
        var team = teamEls[s];
        team.classList.remove('is-heave');
        void team.offsetWidth;
        team.classList.add('is-heave');                         // lean back (decoration)
        sfx.tone({ freq: 150, to: 110, dur: 0.14, type: 'triangle', gain: 0.18 });
        sfx.scale(Math.min(12, 2 + Math.round(10 * pull.pulled / pull.need)));   // the tune climbs as it comes up
        if (together) { sfx.play('match'); fx.bounce(teamEls[1 - s].querySelector('.gd-pull__animal')); cue('together'); }
        cue('heave' + s);
        lastTap = now;
        if (pull.pulled >= pull.need) { finishPull(); return; }
        // the hand invites whoever has pulled less
        var next = pullSide();
        if (next !== s) hint(halfEls[next], { delay: 400 });
      }

      function finishPull() {
        var i = pull.i, crop = pull.crop, p = farm.plots[i];
        state = 'pop';
        hint(null);
        // everything is settled now; what follows is the show
        farm.basket[crop] = Math.min(MAX_BASKET, (farm.basket[crop] || 0) + 3);
        var keep = Math.max(0, p.water - 1);
        farm.plots[i] = emptyPlot();
        farm.plots[i].water = keep;
        care[i].tk = 0;
        bonusAt[i] = null;
        farm.giants++;
        halfEls.forEach(function (b) { b.setAttribute('aria-disabled', 'true'); });
        cue('pull-done', i);
        after();
        pullEl.classList.add('is-out');
        pullEl.style.setProperty('--rise', '1.6');
        fx.wiggle(pullVeg);
        sfx.play('boing');
        var c = centre(pullVeg);
        fx.burst(c.x, c.y, { emoji: '✨', count: 12, distance: 90, size: 22 });
        ctx.after(150, function () { sfx.play('giggle'); });
        ctx.after(800, function () {
          // the giant itself flies off to the basket
          fly(CROPS[crop].e, centre(pullVeg), basketBtn, 0, { size: Math.max(cellSz * 0.6, pullV * 0.5) });
          pullEl.classList.add('is-gone');
        });
        ctx.after(1500, function () {
          pullEl.hidden = true;
          pullEl.classList.remove('is-out', 'is-gone');
          state = 'play';
          pull = null;
          after();
          renderOrder();
          hintNext();
        });
      }

      /* ---- the yard: our tree, the helpers, the decorations ---- */

      function yardSticker(h) { var n = yardItemsEl.querySelector('.gd-helper--' + h + ' > .mg-sticker'); return n || null; }

      var SOUNDS = {
        woof: function () { sfx.tone({ freq: 330, to: 230, dur: 0.09, type: 'square', gain: 0.06 }); sfx.tone({ freq: 300, to: 200, dur: 0.1, type: 'square', gain: 0.06, delay: 0.14 }); },
        rustle: function () { sfx.noise({ freq: 2400, to: 900, dur: 0.25, q: 0.6, gain: 0.07 }); },
        cluck: function () { for (var k = 0; k < 2; k++) { sfx.noise({ freq: 900, dur: 0.05, gain: 0.15, delay: k * 0.12 }); sfx.tone({ freq: 500, to: 400, dur: 0.06, delay: k * 0.12 }); } },
        quack: function () { for (var k = 0; k < 2; k++) sfx.tone({ freq: 520, to: 360, dur: 0.1, type: 'square', gain: 0.06, delay: k * 0.13 }); },
        meow: function () { sfx.tone({ freq: 700, to: 500, dur: 0.25, type: 'triangle', gain: 0.12 }); },
        buzz: function () { sfx.tone({ freq: 180, to: 200, dur: 0.3, type: 'sawtooth', gain: 0.04 }); },
        knock: function (delay) { sfx.tone({ freq: 240, to: 110, dur: 0.08, type: 'triangle', gain: 0.25, delay: delay }); sfx.noise({ freq: 2000, dur: 0.03, gain: 0.1, delay: delay }); },
      };

      /** The puppy runs to the bed it heard about, and back (decoration: the bug is already gone). */
      function pupDash(i) {
        var pup = yardSticker('pup');
        if (!pup) return;
        SOUNDS.woof();
        cue('woof');
        if (ctx.time < pupUntil) return;
        pupUntil = ctx.time + 0.9;
        if (RM || !pup.animate || !plotEls[i]) { fx.bounce(pup); return; }
        var c = centre(plotEls[i]), from = centre(pup), d = 'translate(' + Math.round(c.x - from.x) + 'px, ' + Math.round(c.y - from.y) + 'px)';
        pup.animate([{ transform: 'translate(0, 0)' }, { transform: d + ' scale(1.3)', offset: 0.45 }, { transform: d + ' scale(1.3) rotate(-12deg)', offset: 0.55 }, { transform: 'translate(0, 0)' }], { duration: 900, easing: 'ease-in-out' });
      }

      /** A tap in the yard: whatever is there hops and makes its own sound. Just for fun: it changes nothing. */
      function poke(node) {
        if (ctx.time - lastPoke < 0.15) return;
        lastPoke = ctx.time;
        var e = node.dataset.e, s = node.querySelector('.mg-sticker') || node;
        fx.bounce(node === treeEl ? treeEl.querySelector('.gd-tree__plant') || node : s);
        cue('poke:' + e);
        if (node === treeEl) {
          SOUNDS.rustle();
          var c = centre(treeEl);
          fx.burst(c.x, c.y, { emoji: '🍃', count: 5, distance: 36, size: 16 });
          if (treeShown >= 5 && ctx.time - lastMango >= 2) { lastMango = ctx.time; dropMango(); }
          return;
        }
        var snd = { '🐕': 'woof', '🐔': 'cluck', '🦆': 'quack', '🐈': 'meow', '🐝': 'buzz' }[e];
        if (snd) SOUNDS[snd]();
        else if (e === '⛲') sfx.play('splash');
        else sfx.play('pop', { pitch: 500 + 30 * ([].indexOf.call(yardItemsEl.childNodes, node) % 12) });
      }

      /** A mango falls from our tree and bounces on the grass. */
      function dropMango() {
        var m = el('span', { class: 'gd-mango', 'aria-hidden': 'true' }, ctx.sticker('🥭'));
        treeEl.appendChild(m);
        sfx.play('hop', { pitch: 380 });
        ctx.after(1300, function () { if (m.parentNode) m.parentNode.removeChild(m); });
      }

      function ladybirdTo(i) {
        var p = farm.plots[i];
        p.bug = null;
        p.bugT = 0;
        var lb = yardSticker('ladybird');
        if (lb && plotEls[i] && !RM && lb.animate) {
          var c = centre(plotEls[i]), from = centre(lb);
          lb.animate([{ transform: 'translate(0, 0)' }, { transform: 'translate(' + (c.x - from.x) + 'px, ' + (c.y - from.y) + 'px) scale(1.3)', offset: 0.5 }, { transform: 'translate(0, 0)' }], { duration: 1200, easing: 'ease-in-out' });
        } else if (lb) fx.bounce(lb);
        sfx.play('munch');
        if (lastHinted) hintNext();                   // the hand moves on from a bug the ladybird has eaten
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

      function voice(o) { return VOICE[o && o.who] || 67; }

      /** Knock knock: the visitor comes to the gate and says hello. */
      function arrive() {
        whoEl.classList.add('is-arriving');
        ctx.after(500, function () { whoEl.classList.remove('is-arriving'); });
        SOUNDS.knock(0);
        SOUNDS.knock(0.16);
        var b = voice(farm.order);
        ctx.after(350, function () { sfx.seq([b, b + 5], { step: 0.09, type: 'triangle', gain: 0.12 }); });
        cue('arrive');
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
        var done = orderDone(farm.order), fav = favOf(farm.order), who = farm.order.who, b = voice(farm.order);
        list.forEach(function (c, k) {
          fly(CROPS[c].e, centre(basketBtn), wishEl, k * 300);
          ctx.after(k * 300 + 520, function () {
            shown[c] = (shown[c] || 0) + 1;
            sfx.scale(k + 2);
            ctx.say(k + 1);
            renderOrder(shown);
            fx.bounce(whoEl);
            var q = centre(whoEl);
            if (c === fav) {
              fx.burst(q.x, q.y, { emoji: '💖', count: 5, distance: 40, size: 18 });
              sfx.seq([b + 12, b + 17], { step: 0.09, type: 'triangle', gain: 0.12 });
              cue('fav');
            }
            if (who === '🦊' && c === 'chilli') {
              fx.burst(q.x, q.y, { emoji: '💨', count: 3, distance: 26, size: 14 });
              sfx.noise({ freq: 500, to: 3000, dur: 0.28, gain: 0.08, q: 0.8 });
              cue('spicy');
            }
          });
        });
        ctx.after(list.length * 300 + 600, function () {
          delivering = false;
          renderOrder();
          after();
          if (done) thankYou();
        });
      }

      function thankYou() {
        if (state !== 'play') return;
        state = 'gift';
        hint(null);
        var gift = giftFor(farm.done), oldBeds = farm.plots.length, oldTree = treeShown, b = voice(farm.order);
        try { ctx.save('lastWho', farm.order.who); } catch (e) {}
        farm.done++;
        var u = unlocks(farm.done);
        farm.crops = u.crops; farm.helpers = u.helpers; farm.decor = u.decor; farm.prizes = u.prizes;
        while (farm.plots.length < u.beds) farm.plots.push(emptyPlot());
        farm.beds = u.beds;
        farm.order = null;            // the next round brings the next visitor
        save();
        // what the gift brings is in the garden at once, behind the present
        if (farm.plots.length !== oldBeds) buildBeds();
        if (gift.kind === 'helper' || gift.kind === 'decor') buildYard();
        fit();
        // a happy munch, and thank you to both of them
        fx.bounce(visitBtn);
        sfx.play('munch');
        sfx.seq([b, b + 4, b + 7, b + 12], { step: 0.1, type: 'triangle', gain: 0.14 });
        var w = centre(whoEl);
        fx.burst(w.x, w.y, { emoji: '✨', count: 4, distance: 30, size: 14 });
        if (oldTree >= 5) { fly('🥭', centre(treeEl), whoEl, 0); cue('mango'); }
        ctx.lock(1500);               // until the party takes over: an excited tap cannot pick or plant behind the present
        ctx.after(250, function () {
          [0, 1].forEach(function (k) {
            var chip = ctx.chip(k);
            if (!chip) return;
            var c = centre(chip);
            fx.burst(c.x, c.y, { emoji: '💖', count: 6, distance: 40, size: 18 });
            fx.pop(chip);
            sfx.scale(5 + 2 * k);
            cue('thanks' + k);
          });
        });
        // the visitor hands over a present; it pops open to show what it is
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
        ctx.after(350, function () {
          giftEl.hidden = false;
          var g = centre(box), v = centre(whoEl);
          box.style.setProperty('--from-x', Math.round(v.x - g.x) + 'px');
          box.style.setProperty('--from-y', Math.round(v.y - g.y) + 'px');
          box.classList.add('is-coming');
          sfx.play('whoosh');
          cue('gift-from-visitor');
        });
        ctx.after(900, function () {
          giftEl.classList.add('is-open');
          sfx.play('star');
          var c = centre(giftEl);
          fx.burst(c.x, c.y, { emoji: '✨', count: 10, distance: 90, size: 22 });
          for (var q = oldBeds; q < plotEls.length; q++) fx.bounce(plotEls[q]);
        });
        if (treeStage(farm.done) > oldTree) {
          ctx.after(1250, function () {
            treeShown = treeStage(farm.done);
            renderTree();
            fx.pop(treeEl);
            var c = centre(treeEl);
            fx.burst(c.x, c.y, { emoji: '✨', count: 10, distance: 50, size: 18 });
            sfx.play('boost');
            cue('tree-grow');
          });
        }
        ctx.after(1400, function () { ctx.win('team', { delay: 1800, emoji: gift.e }); });
      }

      /* ---- time: growing, drying, bugs, rain, helpers ---- */

      function tick(dt) {
        if (state === 'pull') {                       // growth waits for the pull; the hand comes back after a quiet moment
          if (ctx.time - lastTap > 3) { lastTap = ctx.time; hintNext(); }
          return;
        }
        if (state !== 'play') return;                 // after the order is filled the garden rests until next time
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
          if (p.t >= 1) { stageUp(i); changed = true; }
        });
        // the first rounds: one bug comes early, so a tap on it gets shown while it is still new
        if (farm.done < 2 && BUGRATE > 0 && !tutorBug && farm.plots.filter(function (p) { return p.bug; }).length < 2) {
          var ti = farm.plots.findIndex(function (p) { return p.crop && p.stage === 1 && p.t >= 0.4 && p.water > 0 && !p.bug; });
          if (ti >= 0) {
            tutorBug = true;
            farm.plots[ti].bug = BUGS[0];
            farm.plots[ti].bugT = 0;
            changed = true;
            sfx.play('pop', { pitch: 300 });
            // (not while a needed seed is still waiting to be sown: the hand shows that first)
            if (help && !(neededSeeds().length && farm.plots.some(function (p) { return !p.crop; }))) hint(plotEls[ti], { delay: 500 });
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
            var wet = false;
            farm.plots.forEach(function (p) { if (p.crop && p.stage < 4 && p.water < MAX_WATER) { p.water++; p.dry = 0; p.thirst = 0; wet = true; } });
            if (wet) { changed = true; if (lastHinted) hintNext(); }     // the hand moves on from a job the fountain has done
          }
        }
        // rain: the countdown carries over between rounds, so it comes every minute or two of play; then a rainbow
        if (raining > 0) { raining -= dt; if (raining <= 0) { rainEl.classList.remove('is-on'); rainbow(); } }
        nextRain -= dt;
        if (nextRain <= 0) rain();
        if (changed) planSeeds();
        renderAll();
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
        farm.plots.forEach(function (p, i) { if (p.crop && plotEls[i]) fx.bounce(plotEls[i]); });
        if (lastHinted) hintNext();                   // the hand moves on from a job the rain has done
      }

      function rainbow() {
        rainbowEl.classList.add('is-on');
        sfx.play('star');
        cue('rainbow');
        ctx.after(2600, function () { rainbowEl.classList.remove('is-on'); });
      }

      /* ---- input ---- */

      /** A tap counts as activity; a tap on what the hand showed brings the next step sooner. */
      function counted(node) {
        tapped = true;
        lastTap = node && node === lastHinted ? ctx.time - IDLE_S + 1.5 : ctx.time;
        lastHinted = null;
      }
      ctx.tap(bedsEl, function (ev, node) { counted(node); useBed(+node.dataset.i); }, { delegate: '.gd-plot', slop: 14 });
      ctx.tap(sacksEl, function (ev, node) { counted(node); feed(node.dataset.tool); }, { delegate: '.gd-tool', slop: 10 });
      // the whole gate hands over: visitor, basket, and the gap between them
      ctx.tap(gate, function () { counted(visitBtn); deliver(); });
      // the yard is just for fun: it never counts as doing something (the hand keeps its timing)
      ctx.tap(yardEl, function (ev, node) { poke(node); }, { delegate: '.gd-yard__item', slop: 24 });
      ctx.tap(pullEl, function (ev, node) { tapped = true; heave(+node.dataset.side); }, { delegate: '.gd-pull__half', slop: 12 });

      /* ---- go ---- */

      giantThisMount = farm.plots.some(function (p) { return p.giant && p.stage === 4; });
      buildBeds();
      buildYard();
      renderOrder();
      renderSacks();
      fit();
      ctx.onResize(fit);
      ctx.setTurn(null);
      ctx.every(200, function () { tick(0.2); });
      arrive();
      sfx.play('start');
      ctx.after(800, function () { if (!tapped) hintNext(); });   // where to start (unless someone already has)
      save();

      ctx.expose({
        get state() { return state; },
        get farm() { return JSON.parse(JSON.stringify(farm)); },
        get delivering() { return delivering; },
        get raining() { return raining > 0; },
        get nextRain() { return nextRain; },
        /** The element the ghost hand last pointed at (tests follow it). */
        get hinted() { return lastHinted; },
        get ghosts() { var o = {}; Object.keys(ghost).forEach(function (k) { o[k] = ghost[k]; }); return o; },
        get pull() { return pull ? { i: pull.i, crop: pull.crop, need: pull.need, pulled: pull.pulled, heaves: pull.heaves.slice() } : null; },
        get lastTap() { return lastTap; },
        get log() { return log.map(function (x) { return { t: x.t, c: x.c, i: x.i }; }); },
        get treeShown() { return treeShown; },
        hintNext: hintNext,
        neededSeeds: neededSeeds,
        planSeeds: function () { planSeeds(); renderAll(); },
        /** Replace the plans for empty beds and redraw, without planning again (tests). */
        setGhosts: function (m) {
          ghost = {};
          Object.keys(m || {}).forEach(function (k) { var p = farm.plots[k]; if (p && !p.crop && CROPS[m[k]]) ghost[k] = m[k]; });
          renderAll();
        },
        /** Fast-forward the garden by `s` seconds of growing (in the same small steps the clock takes). */
        grow: function (s) { for (var k = 0; k < Math.round(s / 0.2); k++) tick(0.2); },
        /** Put a bug on bed i (tests). */
        bug: function (i) { var p = farm.plots[i]; if (p && p.crop && p.stage >= 1 && p.stage <= 3) { p.bug = BUGS[0]; p.bugT = 0; renderPlot(i); } },
        /** Make bed i a ripe giant of its crop (tests; it must be a carrot, potato or pumpkin). */
        giant: function (i) {
          var p = farm.plots[i];
          if (!p || !p.crop || !CROPS[p.crop].giant) return false;
          p.stage = 4; p.t = 0; p.giant = true; p.fruits = 3; p.bug = null;
          renderPlot(i); save();
          return true;
        },
        rain: rain,
        setFarm: function (raw) {
          farm = cleanFarm(raw);
          if (farm.rainIn != null) nextRain = farm.rainIn;
          if (!farm.order) farm.order = makeOrder(farm, Math.random, null);
          ghost = {}; care = []; bonusAt = [];
          giantThisMount = farm.plots.some(function (p) { return p.giant && p.stage === 4; });
          treeShown = treeStage(farm.done);
          buildBeds(); buildYard(); renderOrder(); renderSacks(); fit(); save();
        },
        cleanFarm: cleanFarm,
        makeOrder: makeOrder,
        giftFor: giftFor,
        unlocks: unlocks,
        fruitsFor: fruitsFor,
        becomesGiant: becomesGiant,
        treeStage: treeStage,
        CROPS: CROPS,
        FAV: FAV,
        TREE_AT: TREE_AT,
        GIFTS: GIFTS.length,
        tuning: { help: help, DRY_S: DRY_S, BUG_P: BUG_P, SPEED: SPEED, STAGE_S: STAGE_S, STAGE_S_EARLY: STAGE_S_EARLY, GRACE_S: GRACE_S, MAX_BASKET: MAX_BASKET,
          BED_GAP: BED_GAP, TICKLE: TICKLE, TICKLE_GAP: TICKLE_GAP, TICKLE_CAP: TICKLE_CAP, GIANT_P: GIANT_P, PULL_NEED: PULL_NEED, HEAVE_GAP: HEAVE_GAP, TOGETHER_S: TOGETHER_S, IDLE_S: IDLE_S },
      });

      return function cleanup() { save(); };
    },
  });
})();
