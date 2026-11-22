/* Little Kitchen — cook real Indonesian home dishes side by side.
 *
 * One kitchen, two boards. Each player has their own board (player 1 on the
 * left, player 2 on the right) holding exactly one job: crack the egg, wash the
 * cucumber, chop, pound, fry and flip, stir the pot, or (for the grown-up) find
 * the right jar on the shelf. Nothing is held or chosen that the other player
 * could take: a tap on a board only ever changes that board. A step ("beat")
 * moves on when both boards are done; then everything both of them made flies
 * into the one dish in the middle. The last beat is tasting it together (or
 * blowing out the candles), then a present: new recipes, kitchen helpers (a
 * cat, a hen, a radio, herbs), a nicer kitchen, shelf decorations, medals.
 * The kitchen is kept between rounds; an unfinished dish is simply not kept.
 *
 * Nothing burns, spills or runs out. A wrong jar is a joke. Every tap answers.
 *
 * Timing: every state change bumps `token`; every game-logic timer goes
 * through later(), which does nothing once the token has moved on, so a late
 * callback from an old beat can never act. ctx.lock is never used: pauses
 * (the golden latch, a flip in the air) are per-board timestamps.
 */
(function () {
  'use strict';

  /* ---------------------------------------------------------- the dishes */

  // `n` is the base number of taps at Normal with no help. `to` says where the result goes
  // at the merge: into the dish ('mid'), kept on the same board for its next job ('stay'),
  // or handed to the other board's next job ('across').
  var RECIPES = {
    ceplok: { e: '🍳', vessel: 'plate', beats: [   // Telur Ceplok: fried egg on rice (start)
      { a: { do: 'crack', e: '🥚', n: 2, to: 'stay' },                     b: { do: 'wash', e: '🥒', n: 3, to: 'stay' } },
      { a: { do: 'fry', e: '🍳', prop: 'pan', end: 'flip', to: 'mid' },     b: { do: 'chop', e: '🥒', n: 4, to: 'mid' } },
      { a: { do: 'chop', e: '🍅', n: 3, to: 'mid' },                        b: { do: 'chop', e: '🍅', n: 4, to: 'mid' } },
      { extra: true, a: { do: 'scoop', e: '🍚' },                           b: { do: 'fetch', e: '🍶', jars: ['🍶', '🍫', '🍓'], to: 'mid' } },
      { a: { do: 'taste' }, b: { do: 'taste' } }] },
    pisang: { e: '🍌', vessel: 'plate', beats: [   // Pisang Goreng: fried bananas (start)
      { a: { do: 'peel', e: '🍌', n: 3, to: 'stay' },                      b: { do: 'peel', e: '🍌', n: 3, to: 'stay' } },
      { a: { do: 'chop', e: '🍌', n: 3, to: 'stay' },                      b: { do: 'chop', e: '🍌', n: 4, to: 'stay' } },   // fan cut (kipas)
      { a: { do: 'fry', e: '🍌', prop: 'pan', end: 'flip', to: 'mid' },     b: { do: 'fry', e: '🍌', prop: 'pan', end: 'flip', to: 'mid' } },
      { extra: true, a: { do: 'pick', choices: ['🧀', '🍫', '🍓'] },         b: { do: 'fetch', e: '🍯', jars: ['🍯', '🧂', '🌶️'], to: 'mid' } },
      { a: { do: 'taste' }, b: { do: 'taste' } }] },
    goreng: { e: '🍛', vessel: 'wok', mix: '#B8742E', stir: 'sizzle', afterStir: 'toss', beats: [   // Nasi Goreng
      { a: { do: 'wash', e: '🥬', n: 3, to: 'across' },                    b: { do: 'wash', e: '🥕', n: 3, to: 'across' } },
      { a: { do: 'chop', e: '🥕', n: 3, to: 'mid' },                       b: { do: 'chop', e: '🥬', n: 4, to: 'mid' } },
      { a: { do: 'scoop', e: '🍚' },                                        b: { do: 'fetch', e: '🍶', jars: ['🍶', '🍫', '🍯'], to: 'mid' } },
      { extra: true, a: { do: 'crack', e: '🥚', n: 2, to: 'mid' },          b: { do: 'shake', e: '🧂', dots: '#FFFFFF', n: 3 } },
      { a: { do: 'stir', n: 4 },                                            b: { do: 'stir', n: 4 } },
      { a: { do: 'taste' }, b: { do: 'taste' } }] },
    sate: { e: '🍢', vessel: 'plate', beats: [   // Sate Ayam with peanut sauce
      { a: { do: 'chop', e: '🍗', n: 3, to: 'stay' },                      b: { do: 'chop', e: '🍗', n: 4, to: 'stay' } },
      { a: { do: 'skewer', e: '🍗', to: 'stay' },                          b: { do: 'skewer', e: '🍗', to: 'stay' } },
      { a: { do: 'fry', e: '🍢', prop: 'grill', end: 'flip', to: 'mid' },   b: { do: 'fry', e: '🍢', prop: 'grill', end: 'flip', to: 'mid' } },
      { a: { do: 'pound', e: '🥜', n: 3, to: 'mid' },                      b: { do: 'pound', e: '🥜', n: 4, to: 'mid' } },
      { extra: true, a: { do: 'garnish', e: '🍙' },                          b: { do: 'fetch', e: '🍋', jars: ['🍋', '🍫', '🍓'], to: 'mid' } },
      { a: { do: 'taste' }, b: { do: 'taste' } }] },
    sop: { e: '🍲', vessel: 'pot', mix: '#F2C14E', stir: 'swish', afterStir: 'lid', taste: 'hot', beats: [   // Sayur Sop
      { a: { do: 'wash', e: '🥕', n: 3, to: 'stay' },                      b: { do: 'peel', e: '🥔', n: 3, to: 'stay' } },
      { a: { do: 'chop', e: '🥕', n: 3, to: 'mid' },                       b: { do: 'chop', e: '🥔', n: 4, to: 'mid' } },
      { a: { do: 'pour', e: '💧', liquid: '#8FD3F4', n: 3 },               b: { do: 'fetch', e: '🍗', jars: ['🍗', '🍫', '🍓'], to: 'mid' } },
      { extra: true, a: { do: 'shake', e: '🧂', dots: '#FFFFFF', n: 3 },    b: { do: 'fetch', e: '🥦', jars: ['🥦', '🍯', '🍌'], to: 'mid' } },
      { a: { do: 'stir', n: 4 },                                            b: { do: 'stir', n: 4 } },
      { a: { do: 'taste' }, b: { do: 'taste' } }] },
    martabak: { e: '🥞', vessel: 'bowl', mix: '#F5DFA8', beats: [   // Martabak Manis
      { a: { do: 'crack', e: '🥚', n: 2, to: 'mid' },                      b: { do: 'fetch', e: '🥛', jars: ['🥛', '🍋', '🌶️'], to: 'mid' } },
      { a: { do: 'stir', n: 4 },                                            b: { do: 'stir', n: 4 } },
      { serve: 'plate', a: { do: 'fry', e: '🥞', prop: 'pan', end: 'flip', to: 'mid' }, b: { do: 'fry', e: '🥞', prop: 'pan', end: 'flip', to: 'mid' } },
      { a: { do: 'pick', choices: ['🍫', '🧀', '🍓'] },                     b: { do: 'pour', e: '🥛', liquid: '#FFF4DC', n: 2, drizzle: true } },
      { extra: true, a: { do: 'chop', e: '🍌', n: 3, to: 'mid' },           b: { do: 'chop', e: '🍌', n: 4, to: 'mid' } },
      { a: { do: 'taste' }, b: { do: 'taste' } }] },
    campur: { e: '🍧', vessel: 'glass', stir: 'clink', taste: 'cold', beats: [   // Es Campur
      { a: { do: 'wash', e: '🍓', n: 3, to: 'stay' },                      b: { do: 'chop', e: '🍉', n: 4, to: 'mid' } },
      { a: { do: 'chop', e: '🍓', n: 3, to: 'mid' },                       b: { do: 'chop', e: '🥭', n: 4, to: 'mid' } },
      { a: { do: 'garnish', e: '❄️' },                                      b: { do: 'fetch', e: '🥥', jars: ['🥥', '🧂', '🌶️'], to: 'mid' } },
      { a: { do: 'pick', choices: ['🍓', '🍈', '🍊'], paint: ['#E8455A', '#7BC96F', '#F59A3A'] }, b: { do: 'pour', e: '🥛', liquid: '#FFF4DC', n: 2, drizzle: true } },
      { extra: true, a: { do: 'stir', n: 3 },                               b: { do: 'stir', n: 3 } },
      { a: { do: 'taste' }, b: { do: 'taste' } }] },
    cake: { e: '🎂', vessel: 'bowl', mix: '#F5DFA8', beats: [   // Kue Ulang Tahun (capstone)
      { a: { do: 'crack', e: '🥚', n: 2, to: 'mid' },                      b: { do: 'fetch', e: '🥛', jars: ['🥛', '🧂', '🌶️'], to: 'mid' } },
      { a: { do: 'stir', n: 4 },                                            b: { do: 'stir', n: 4 } },
      { serve: 'cake', a: { do: 'fry', e: '🍰', prop: 'oven', end: 'out', to: 'mid' }, b: { do: 'fry', e: '🍰', prop: 'oven', end: 'out', to: 'mid' } },
      { a: { do: 'pick', choices: ['🍓', '🍫', '🍋'], paint: ['#F49AC1', '#8B5A3C', '#F7D35C'] }, b: { do: 'garnish', e: '🍓' } },
      { extra: true, a: { do: 'shake', e: '🍫', dots: '#5A3A22', n: 3 },   b: { do: 'shake', e: '🍫', dots: '#5A3A22', n: 3 } },
      { a: { do: 'blow' }, b: { do: 'blow' } }] },
  };
  var MENU = ['ceplok', 'pisang', 'goreng', 'sate', 'sop', 'martabak', 'campur', 'cake'];
  var START = ['ceplok', 'pisang'];
  // the dish names live only here and in aria-labels (nothing on screen is words)
  var NAMES = { ceplok: 'Telur Ceplok', pisang: 'Pisang Goreng', goreng: 'Nasi Goreng', sate: 'Sate Ayam', sop: 'Sayur Sop', martabak: 'Martabak Manis', campur: 'Es Campur', cake: 'Birthday cake' };

  /* ---------------------------------------------------------- the jobs */

  var GAP = 0.16, CRACK_GAP = 0.22, PICK_GAP = 0.25, JAR_GAP = 0.4;   // seconds between counted taps on one board
  var LATCH = 0.45;               // the pan turns golden: this board ignores taps this long (only this board)
  var COOK_S = [3, 2.2, 1.6];     // seconds a side takes to turn golden by itself, by help level
  var TAPS = { few: -1, normal: 0, lots: 2 };

  // kind: work/fetch/cook results fly into the dish at the merge; add/pick deliver piece by piece.
  var VERBS = {
    wash: { kind: 'work' }, peel: { kind: 'work' }, chop: { kind: 'work' }, pound: { kind: 'work' },
    crack: { kind: 'work', gap: CRACK_GAP }, skewer: { kind: 'work', fixed: 3 }, stir: { kind: 'work', icon: '🥄' },
    pour: { kind: 'add' }, shake: { kind: 'add' }, garnish: { kind: 'add', fixed: 3 }, scoop: { kind: 'add', fixed: 2 },
    fry: { kind: 'cook', fixed: 1 },
    fetch: { kind: 'fetch', fixed: 1, gap: JAR_GAP },
    pick: { kind: 'pick', fixed: 3, gap: PICK_GAP },
    taste: { kind: 'end', fixed: 1, icon: '😋' }, blow: { kind: 'end', fixed: 3, icon: '💨' },
  };

  var LIQUID = { '🍶': '#4A2A17', '🍯': '#E8A33A', '🥛': '#FFFFFF', '🥥': '#FFF8EE', '🍋': '#F7E36A' };   // a fetched item that lands as liquid
  var SAUCE = { '🥜': '#A0642D', '🌶️': '#D9452B' };
  var PEEL = { '🍌': '#F7D35C', '🥔': '#B07A4A' };
  var FACES = ['😋', '🤤', '😍', '🥰'];
  var HELPERS = { cat: '🐈', hen: '🐔', radio: '📻', herbs: '🌿' };
  var HELPER_IDS = ['cat', 'hen', 'radio', 'herbs'];

  /* ---------------------------------------------------------- presents */

  // one present per finished dish, in this order; then shelf decorations; then medals; then thanks
  var GIFTS = [
    { kind: 'recipe', id: 'goreng' },
    { kind: 'helper', id: 'cat', e: '🐈' },
    { kind: 'recipe', id: 'sate' },
    { kind: 'tier', n: 1, e: '🌷' },
    { kind: 'recipe', id: 'sop' },
    { kind: 'helper', id: 'hen', e: '🐔' },
    { kind: 'recipe', id: 'martabak' },
    { kind: 'tier', n: 2, e: '💡' },
    { kind: 'recipe', id: 'campur' },
    { kind: 'helper', id: 'radio', e: '📻' },
    { kind: 'recipe', id: 'cake' },
    { kind: 'tier', n: 3, e: '🏮' },
    { kind: 'helper', id: 'herbs', e: '🌿' },
  ];
  var DECOR = ['🌻', '🧺', '🍵', '🏺', '🎐', '🍍'];
  var MEDALS = 2;                 // gold medals per recipe

  /* ---------------------------------------------------------- pure rules */

  var clamp = function (v, lo, hi) { return Math.max(lo, Math.min(hi, v)); };

  /** The present for finishing dish number `i` (0 = the first). */
  function giftFor(i) {
    if (i < GIFTS.length) {
      var g = GIFTS[i];
      return g.kind === 'recipe' ? { kind: 'recipe', id: g.id, e: RECIPES[g.id].e } : g;
    }
    var k = i - GIFTS.length;
    if (k < DECOR.length) return { kind: 'decor', e: DECOR[k] };
    k -= DECOR.length;
    if (k < MENU.length * MEDALS) { var id = MENU[k % MENU.length]; return { kind: 'medal', id: id, e: RECIPES[id].e }; }
    return { kind: 'thanks', e: '⭐' };
  }

  /** What `done` finished dishes have unlocked. Worked out from the count, never stored. */
  function unlocks(done) {
    done = Math.max(0, Math.floor(Number(done)) || 0);
    var have = {}, u = { recipes: [], helpers: {}, tier: 0, decor: [], medals: {}, next: null };
    START.forEach(function (id) { have[id] = true; });
    for (var i = 0; i < done; i++) {
      var g = giftFor(i);
      if (g.kind === 'recipe') have[g.id] = true;
      else if (g.kind === 'helper') u.helpers[g.id] = true;
      else if (g.kind === 'tier') u.tier = Math.max(u.tier, g.n);
      else if (g.kind === 'decor') u.decor.push(g.e);
      else if (g.kind === 'medal') u.medals[g.id] = (u.medals[g.id] || 0) + 1;
    }
    u.recipes = MENU.filter(function (id) { return have[id]; });
    for (var j = done; j < GIFTS.length; j++) if (GIFTS[j].kind === 'recipe') { u.next = GIFTS[j].id; break; }
    return u;
  }

  /** A saved kitchen, checked and repaired: anything odd becomes something sensible. */
  function cleanKitchen(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) raw = {};
    var num = function (v, lo, hi, d) {
      if (v === null || v === '' || typeof v === 'boolean' || typeof v === 'object') return d;
      v = Number(v);
      return isFinite(v) ? Math.max(lo, Math.min(hi, Math.floor(v))) : d;
    };
    var done = num(raw.done, 0, 9999, 0);
    var u = unlocks(done), cooked = {};
    if (raw.cooked && typeof raw.cooked === 'object' && !Array.isArray(raw.cooked)) {
      u.recipes.forEach(function (id) {
        if (!Object.prototype.hasOwnProperty.call(raw.cooked, id)) return;
        var n = num(raw.cooked[id], 0, 999, 0);
        if (n) cooked[id] = n;
      });
    }
    var seen = [];
    if (Array.isArray(raw.seen)) raw.seen.forEach(function (v) { if (typeof v === 'string' && Object.prototype.hasOwnProperty.call(VERBS, v) && seen.indexOf(v) < 0) seen.push(v); });
    return { v: 1, done: done, cooked: cooked, chicks: num(raw.chicks, 0, 3, 0), seen: seen };
  }

  /** Taps a job takes: fixed jobs never change; others follow the Taps option and the little player's help. */
  function nFor(job, help, taps) {
    var v = VERBS[job.do];
    if (v && v.fixed != null) return v.fixed;
    return clamp((job.n || 3) + (TAPS[taps] || 0) - (help || 0), 1, 8);
  }

  /** The beats of a recipe: Short leaves out its one extra beat. */
  function beatsFor(recipe, length) {
    return recipe.beats.filter(function (b) { return length !== 'short' || !b.extra; });
  }

  /** What a job makes. */
  function resultOf(job) { return job.do === 'crack' ? '🍳' : job.do === 'skewer' ? '🍢' : job.e; }

  /** Blend two #RRGGBB colours (t = 0..1). */
  function mixColor(a, b, t) {
    var pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16), out = '#';
    [16, 8, 0].forEach(function (sh) {
      var x = Math.round(((pa >> sh) & 255) * (1 - t) + ((pb >> sh) & 255) * t);
      out += (x < 16 ? '0' : '') + x.toString(16);
    });
    return out;
  }

  // where things sit: % of the board object (mud, chop pieces) and of the dish's food area
  var MUD = [[28, 34], [64, 26], [44, 62], [70, 60], [24, 66], [54, 42], [38, 20], [76, 42]];
  var SPREAD = [[-0.17, -0.1], [0.17, -0.1], [0, 0.12], [-0.25, 0.14], [0.25, 0.14], [0, -0.24]];
  var PILE = [[-0.07, 0.02], [0.07, 0.02], [0, -0.06], [-0.11, 0.08], [0.11, 0.08], [0, 0.1]];
  var CSLOTS = [[50, 56], [30, 46], [70, 46], [36, 72], [64, 72], [50, 32], [18, 64], [82, 64]];
  var RSLOTS = [[6, 58], [94, 58], [20, 22], [80, 22], [22, 90], [78, 90]];
  var BSLOTS = [[38, 60], [64, 52]];

  /* ---------------------------------------------------------- the game */

  MG.registerGame({
    id: 'kitchen',
    name: 'Little Kitchen',
    emoji: '🍳',
    color: 'tangerine',
    howTo: 'Cook real home dishes together. Pick a dish; then each of you does the job on your own side (crack, wash, chop, stir, fry, or find the right jar) and it all goes into the dish in the middle. The next step comes when you are both done. Taste it together at the end. Every dish brings a present: new recipes, kitchen helpers, a nicer kitchen. Your kitchen is kept for next time.',
    options: [
      { key: 'length', label: 'Recipe', default: 'full', choices: [
        { value: 'short', label: 'Short', emoji: '🐇' }, { value: 'full', label: 'Full', emoji: '🍲' }] },
      { key: 'taps', label: 'Taps per step', default: 'normal', choices: [
        { value: 'few', label: 'Few', emoji: '🐣' }, { value: 'normal', label: 'Normal', emoji: '🥄' }, { value: 'lots', label: 'Lots', emoji: '💪' }] },
    ],

    mount: function (root, ctx) {
      var el = ctx.el, sfx = ctx.sfx, fx = ctx.fx, util = ctx.util;
      var RM = !!MG.reducedMotion;
      var LEN = ctx.opt('length'), TAPOPT = ctx.opt('taps');
      var players = ctx.players;
      // roles are fixed for the round: "a" (short showy jobs) goes to the little player if exactly one is little
      var aSide = players[0].little !== players[1].little ? (players[0].little ? 0 : 1) : ctx.firstPlayer;
      var bSide = 1 - aSide;

      var kit = cleanKitchen(ctx.load('kitchen', null));
      var u = unlocks(kit.done);
      var state = 'menu', token = 0;
      var recipeId = null, recipe = null, beats = [], beatI = -1;
      var vessel = newVessel('plate');
      var catSnacks = 0, chickThisRound = false, highDone = false;
      var forced = {};                       // tests: force the next surprise roll
      var events = [];                       // the last 200 counted taps (tests)
      var lastTap = [0, 0], menuTap = 0, lastHinted = null;
      var wallAt = -1, wallC = 0, fill = 0;
      var pickedChoice = null;               // the bowl she chose this round (the finished dish shows it)

      /* ---- sounds: the kitchen's own, built from tones and noise (soft) ---- */

      var S = {
        tok: function (k) { var f = 240 + 24 * (k || 0); sfx.tone({ freq: f, to: f * 0.46, dur: 0.08, type: 'triangle', gain: 0.25 }); sfx.noise({ freq: 2000, dur: 0.03, gain: 0.1 }); },
        dug: function () { sfx.tone({ freq: 150, to: 55, dur: 0.12, type: 'sine', gain: 0.3 }); sfx.noise({ freq: 200, dur: 0.06, gain: 0.12 }); },
        krk: function () { sfx.noise({ freq: 4000, dur: 0.04, gain: 0.14 }); sfx.noise({ freq: 4000, dur: 0.04, gain: 0.14, delay: 0.06 }); },
        shhk: function () { sfx.noise({ freq: 3000, to: 1200, dur: 0.12, gain: 0.12, q: 0.8 }); },
        squeak: function (k) { sfx.tone({ freq: 600 + 80 * k, to: 900 + 80 * k, dur: 0.08, type: 'sine', gain: 0.12 }); },
        glug: function () { sfx.tone({ freq: 300, to: 200, dur: 0.08, type: 'sine', gain: 0.2 }); sfx.tone({ freq: 260, to: 160, dur: 0.08, type: 'sine', gain: 0.2, delay: 0.1 }); },
        swish: function () { sfx.noise({ freq: 700, to: 1500, dur: 0.15, gain: 0.1 }); },
        sizzle: function (g) { sfx.noise({ freq: 5000, dur: 0.12, gain: g || 0.03, q: 0.5 }); },
        clink: function () { sfx.tone({ freq: 2000, dur: 0.05, type: 'sine', gain: 0.1 }); sfx.tone({ freq: 2600, dur: 0.05, type: 'sine', gain: 0.1, delay: 0.04 }); },
        sneeze: function () { sfx.tone({ freq: 400, to: 600, dur: 0.12, type: 'sine', gain: 0.2 }); sfx.tone({ freq: 450, to: 750, dur: 0.12, type: 'sine', gain: 0.2, delay: 0.15 }); sfx.noise({ freq: 3000, dur: 0.2, gain: 0.2, delay: 0.35 }); },
        peep: function () { sfx.tone({ freq: 1800, to: 2200, dur: 0.06, type: 'sine', gain: 0.12 }); sfx.tone({ freq: 1800, to: 2200, dur: 0.06, type: 'sine', gain: 0.12, delay: 0.1 }); },
        cluck: function () { sfx.noise({ freq: 900, dur: 0.05, gain: 0.15 }); sfx.noise({ freq: 900, dur: 0.05, gain: 0.15, delay: 0.1 }); sfx.tone({ freq: 500, to: 400, dur: 0.06, type: 'triangle', gain: 0.12 }); },
        purr: function () { for (var i = 0; i < 6; i++) sfx.noise({ freq: 120, dur: 0.05, gain: 0.08, delay: i * 0.06 }); },
        meow: function () { sfx.tone({ freq: 700, to: 500, dur: 0.25, type: 'triangle', gain: 0.12 }); },
        mmm: function () { sfx.tone({ freq: 262, to: 247, dur: 0.4, type: 'sine', gain: 0.12 }); },
        fuu: function () { sfx.noise({ freq: 900, to: 400, dur: 0.3, gain: 0.1 }); },
        brr: function () { sfx.tone({ freq: 180, to: 170, dur: 0.3, type: 'triangle', gain: 0.1 }); },
        birthday: function () { sfx.seq([67, 67, 69, 67, 72, 71], { step: 0.2, type: 'triangle', gain: 0.2 }); },
        tune: function () { sfx.seq([72, 76, 79], { step: 0.16, type: 'sine', gain: 0.14 }); },
      };

      /* ---- timers: game logic only through later(), which an old beat can never reach ---- */

      function setState(s) { state = s; token++; }
      function later(ms, fn) { var tk = token; return ctx.after(ms, function () { if (tk === token) fn(); }); }

      /* ---- build ---- */

      var scene = el('div', { class: 'kt-scene', hidden: true });
      var tierEl = el('div', { class: 'kt-tier', 'aria-hidden': 'true' });
      var stripEl = el('div', { class: 'kt-strip', 'aria-hidden': 'true' });
      var shelfL = el('div', { class: 'kt-shelf kt-shelf--l', 'aria-hidden': 'true' });
      var shelfR = el('div', { class: 'kt-shelf kt-shelf--r', 'aria-hidden': 'true' });
      var liqEl = el('span', { class: 'kt-liq' });
      var backEl = el('span', { class: 'kt-vback' }, liqEl);
      var frontEl = el('span', { class: 'kt-vfront' });
      var contentsEl = el('div', { class: 'kt-contents' });
      var swirlEl = el('span', { class: 'kt-swirl' }, el('i', { 'data-side': '0' }), el('i', { 'data-side': '1' }));
      var lidEl = el('span', { class: 'kt-lid-big' });
      var ghostEl = el('span', { class: 'kt-ghost' });
      var windowEl = el('span', { class: 'kt-window', hidden: true, 'aria-hidden': 'true' },
        el('span', { class: 'kt-curtain kt-curtain--l' }), el('span', { class: 'kt-curtain kt-curtain--r' }), el('span', { class: 'kt-sill' }, ctx.sticker('🌷')));
      var dishEl = el('span', { class: 'kt-dish', hidden: true });
      var giftEl = el('span', { class: 'kt-gift', hidden: true });
      var vesselEl = el('div', { class: 'kt-vessel', 'data-kind': 'plate', 'aria-label': 'Dish' }, windowEl, backEl, contentsEl, swirlEl, frontEl, lidEl, ghostEl, dishEl, giftEl);
      var wallEl = el('div', { class: 'kt-wall' }, tierEl, stripEl, shelfL, vesselEl, shelfR);
      scene.appendChild(wallEl);
      var menuEl = el('div', { class: 'kt-menu' });
      root.appendChild(scene);
      root.appendChild(menuEl);

      /** One board per player: the chef in the outer corner, a tick in the inner one, the job below. */
      function mkBoard(s) {
        var p = players[s];
        var face = ctx.sticker(p.emoji, 'kt-face');
        var chef = el('span', { class: 'kt-chef' }, el('span', { class: 'kt-hat' }), face, el('span', { class: 'kt-nose' }), el('span', { class: 'kt-wave' }, ctx.sticker('👋')));
        var check = el('span', { class: 'kt-check' }, ctx.sticker('✔️'));
        var want = el('span', { class: 'kt-want', hidden: true });
        var main = el('div', { class: 'kt-main' });
        var node = el('div', { class: 'kt-board', 'data-side': String(s), role: 'button', tabindex: '0', 'aria-label': 'Board' },
          el('div', { class: 'kt-top' }, chef, want, check), main);
        scene.appendChild(node);
        return { side: s, el: node, chef: chef, face: face, emoji: p.emoji, check: check, want: want, main: main, obj: null, parts: {},
          job: null, verb: null, n: 0, k: 0, done: false, nextAt: 0, busyUntil: 0, phase: null, heat: 0, heat2: 0,
          chosen: null, wrongRow: 0, sneezed: false, replaced: false, turns: 0,
          cheerAt: -1, tickAt: -1, munchAt: -1, sizzleAt: 0, c: 0, faceGen: 0 };
      }
      var boards = [mkBoard(0), mkBoard(1)];

      /* ---- small visual helpers (decoration only) ---- */

      function anim(node, frames, ms, o) {
        if (!node || !node.animate) return null;
        o = o || {};
        try { return node.animate(frames, { duration: RM ? Math.min(ms, 150) : ms, easing: o.easing || 'ease-out', composite: o.replace ? 'replace' : 'add', fill: o.fill || 'none' }); }
        catch (e) { return null; }
      }
      /** The object squashes: a tap that came too soon (never silent, never queued). */
      function squash(node) { anim(node, [{ transform: 'scale(1, 1)' }, { transform: 'scale(1.06, 0.9)' }, { transform: 'scale(1, 1)' }], 120); }

      /** Something flies from one element to another in an arc (decoration; the state has already changed). */
      function fly(content, fromNode, toNode, o) {
        o = o || {};
        ctx.after(o.delay || 0, function () {
          if (!fromNode || !toNode || !fromNode.isConnected || !toNode.isConnected) return;
          var r = root.getBoundingClientRect(), from = fx.centerOf(fromNode), to = fx.centerOf(toNode);
          if (o.dx) to.x += o.dx * toNode.getBoundingClientRect().width;
          if (o.dy) to.y += o.dy * toNode.getBoundingClientRect().height;
          var f = el('span', { class: 'kt-flyer', style: { left: (from.x - r.left) + 'px', top: (from.y - r.top) + 'px', fontSize: (o.size || 0) ? o.size + 'px' : null } },
            typeof content === 'string' ? ctx.sticker(content) : content);
          root.appendChild(f);
          var ms = o.ms || 520, dx = to.x - from.x, dy = to.y - from.y;
          if (f.animate) {
            if (RM) f.animate([{ transform: 'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + dy + 'px))', opacity: 0 }, { transform: 'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + dy + 'px))', opacity: 1 }], { duration: 150, fill: 'forwards' });
            else f.animate([
              { transform: 'translate(-50%, -50%) scale(1)' },
              { transform: 'translate(calc(-50% + ' + dx * 0.5 + 'px), calc(-50% + ' + (dy * 0.5 - Math.min(90, 30 + Math.abs(dx) * 0.25)) + 'px)) scale(1.25)', offset: 0.5 },
              { transform: 'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + dy + 'px)) scale(0.8)' },
            ], { duration: ms, easing: 'ease-in-out', fill: 'forwards' });
          }
          ctx.after(RM ? 180 : ms + 30, function () { f.remove(); if (o.pop !== false) fx.pop(toNode); });
        });
      }

      function burstAt(node, o) { if (!node || !node.isConnected) return; var c = fx.centerOf(node); fx.burst(c.x, c.y, o); }

      /* ---- the shelf, the kitchen tiers, the menu ---- */

      function shelfItems() {
        var out = [];
        HELPER_IDS.forEach(function (h) { if (u.helpers[h]) out.push({ kind: h, e: HELPERS[h] }); });
        u.decor.forEach(function (e) { out.push({ kind: 'decor', e: e }); });
        for (var c = 0; c < kit.chicks; c++) out.push({ kind: 'chick', e: '🐣' });
        return out;
      }

      function buildShelf() {
        shelfL.textContent = '';
        shelfR.textContent = '';
        shelfItems().forEach(function (it, i) {
          (i % 2 ? shelfR : shelfL).appendChild(el('span', { class: 'kt-item kt-item--' + it.kind, 'data-kind': it.kind }, ctx.sticker(it.e)));
        });
      }
      function shelfItem(kind) { return wallEl.querySelector('.kt-item[data-kind="' + kind + '"]'); }

      /** The kitchen itself grows: a window, then string lights, then a sign with both chefs on it. */
      function renderTier() {
        wallEl.dataset.tier = String(u.tier);
        tierEl.textContent = '';
        windowEl.hidden = u.tier < 1;           // a window with curtains in both players' colours, behind the dish
        if (u.tier >= 2) {
          var lights = el('span', { class: 'kt-lights' });
          for (var i = 0; i < 11; i++) lights.appendChild(el('i', { style: { '--i': i } }));
          tierEl.appendChild(lights);
        }
        if (u.tier >= 3) {
          tierEl.appendChild(el('span', { class: 'kt-sign' },
            el('span', { class: 'kt-sign__end' }, ctx.sticker('🏮')), el('span', { class: 'kt-sign__end' }, ctx.sticker(players[0].emoji)),
            el('span', { class: 'kt-sign__mid' }),
            el('span', { class: 'kt-sign__end' }, ctx.sticker(players[1].emoji)), el('span', { class: 'kt-sign__end' }, ctx.sticker('🏮'))));
        }
      }

      var CARD_TONES = ['tangerine', 'sun', 'leaf', 'sea', 'berry', 'grape'];
      function menuCount() { return u.recipes.length + (u.next ? 1 : 0); }

      function buildMenu() {
        menuEl.textContent = '';
        u.recipes.forEach(function (id, i) {
          var n = kit.cooked[id] || 0, m = u.medals[id] || 0;
          var stars = el('span', { class: 'kt-card__stars' });
          for (var s = 0; s < Math.min(3, n); s++) stars.appendChild(ctx.sticker('⭐'));
          var medals = el('span', { class: 'kt-card__medals' });
          for (var k = 0; k < m; k++) medals.appendChild(ctx.sticker('🏅'));
          menuEl.appendChild(el('button', { type: 'button', class: 'kt-card' + (n ? '' : ' is-new'), 'data-id': id, 'data-stars': String(Math.min(3, n)), 'aria-label': NAMES[id], style: { '--tone': 'var(--' + CARD_TONES[i % 6] + '-soft)' } },
            el('span', { class: 'kt-card__dish' }, ctx.sticker(RECIPES[id].e)), stars, medals,
            n ? null : el('span', { class: 'kt-card__new' }, ctx.sticker('✨'))));
        });
        if (u.next) {
          var next = el('div', { class: 'kt-next', 'aria-label': 'Next present' },
            el('span', { class: 'kt-next__dish' }, ctx.sticker(RECIPES[u.next].e)), el('span', { class: 'kt-next__tag' }, ctx.sticker('🎁')));
          menuEl.appendChild(next);
          // the next dish is not a button: a tap only wiggles its present
          ctx.tap(next, function () { lastHinted = null; fx.wiggle(next.querySelector('.kt-next__tag')); sfx.play('flip'); });
        }
      }

      /* ---- the dish in the middle ---- */

      function newVessel(kind) {
        return { kind: kind, pieces: [], rim: [], level: 0, liq: null, dots: [], blobs: [], drizzles: [], mix: null, layers: 0, frost: null, candles: null, added: 0 };
      }

      function renderVessel() {
        var v = vessel;
        vesselEl.dataset.kind = v.kind;
        vesselEl.style.setProperty('--level', String(Math.min(0.6, v.level) / 0.6));
        vesselEl.style.setProperty('--liq', v.liq || 'transparent');
        vesselEl.classList.toggle('has-liq', v.level > 0);
        contentsEl.textContent = '';
        if (v.mix) contentsEl.appendChild(el('span', { class: 'kt-mix', style: { '--mix': v.mix } }));
        v.blobs.forEach(function (b, i) { contentsEl.appendChild(el('span', { class: 'kt-blob', style: { '--c': b, left: BSLOTS[i][0] + '%', top: BSLOTS[i][1] + '%' } })); });
        if (v.kind === 'cake' && v.layers) {
          var cake = el('span', { class: 'kt-cake', 'data-layers': String(v.layers) });
          for (var L = 0; L < v.layers; L++) cake.appendChild(el('span', { class: 'kt-layer' }));
          if (v.frost) cake.appendChild(el('span', { class: 'kt-frost', style: { '--c': v.frost } }));
          if (v.candles) {
            var row = el('span', { class: 'kt-candles' });
            v.candles.forEach(function (lit, i) { row.appendChild(el('span', { class: 'kt-candle' + (lit ? '' : ' is-out'), style: { '--c': i < 3 ? 'var(--p0)' : 'var(--p1)' } }, el('i'))); });
            cake.appendChild(row);
          }
          contentsEl.appendChild(cake);
        }
        v.drizzles.forEach(function (c, i) {
          var z = el('span', { class: 'kt-drizzle', style: { '--c': c, top: (40 + i * 12) + '%' } });
          z.innerHTML = '<svg viewBox="0 0 100 20" preserveAspectRatio="none" aria-hidden="true"><polyline points="2,10 14,3 26,17 38,3 50,17 62,3 74,17 86,3 98,10" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>';
          contentsEl.appendChild(z);
        });
        v.pieces.forEach(function (p) {
          var s = CSLOTS[p.slot];
          contentsEl.appendChild(el('span', { class: 'kt-piece', style: { left: s[0] + '%', top: s[1] + '%', '--r': p.r + 'deg' } },
            p.e === 'yolk' ? el('span', { class: 'kt-yolk' }) : ctx.sticker(p.e)));
        });
        v.dots.forEach(function (d) { contentsEl.appendChild(el('i', { class: 'kt-dot', style: { left: d.x + '%', top: d.y + '%', '--c': d.c } })); });
        v.rim.forEach(function (e, i) { var s = RSLOTS[i]; contentsEl.appendChild(el('span', { class: 'kt-piece kt-piece--rim', style: { left: s[0] + '%', top: s[1] + '%' } }, ctx.sticker(e))); });
        vesselEl.style.setProperty('--fill', String(fill));
      }

      /** A sticker lands in the dish; when the eight places are full the oldest gives way. */
      function addPiece(e) {
        var v = vessel, used = v.pieces.map(function (p) { return p.slot; }), slot = -1;
        for (var i = 0; i < CSLOTS.length; i++) if (used.indexOf(i) < 0) { slot = i; break; }
        if (slot < 0) slot = v.pieces.shift().slot;
        v.pieces.push({ e: e, slot: slot, r: Math.round(util.randf(-18, 18)) });
        v.added++;
      }
      function addRim(e) { if (vessel.rim.length >= RSLOTS.length) vessel.rim.shift(); vessel.rim.push(e); vessel.added++; }
      function addDots(c, n) {
        for (var i = 0; i < n; i++) vessel.dots.push({ c: c, x: Math.round(util.randf(14, 86)), y: Math.round(util.randf(30, 78)) });
        while (vessel.dots.length > 24) vessel.dots.shift();
        vessel.added++;
      }
      function addBlob(c) { if (vessel.blobs.length >= 2) vessel.blobs.shift(); vessel.blobs.push(c); vessel.added++; }
      function addLiquid(c, d) {
        if (vessel.kind === 'plate' || vessel.kind === 'wok') { addBlob(c); return; }   // on a plate or in a wok it is a sauce
        vessel.liq = vessel.level > 0 && vessel.liq ? mixColor(vessel.liq, c, 0.5) : c;
        vessel.level = Math.min(0.6, vessel.level + (d || 0.1));
        vessel.added++;
      }

      /** What a finished job puts in the dish at the merge. */
      function addResult(job) {
        var v = job.do, e = resultOf(job);
        if (v === 'chop') { addPiece(e); addPiece(e); addPiece(e); }
        else if (v === 'pound') addBlob(SAUCE[e] || '#A0642D');
        else if (v === 'crack') addPiece('yolk');
        else if (v === 'fry' && vessel.kind === 'cake') { vessel.layers = Math.min(2, vessel.layers + 1); vessel.added++; }
        else if (v === 'fetch' && LIQUID[e]) addLiquid(LIQUID[e], 0.15);
        else addPiece(e);
      }

      function renderGhost() {
        ghostEl.textContent = '';
        if (!recipe) return;
        ghostEl.appendChild(el('span', { class: 'kt-ghost__grey' }, ctx.sticker(recipe.e)));
        ghostEl.appendChild(el('span', { class: 'kt-ghost__fill' }, ctx.sticker(recipe.e)));
      }

      /* ---- the pips: one sticker per beat, an overview only ---- */

      function pipIcon(beat) {
        var j = beat.a;
        return j.e || (j.choices && j.choices[0]) || VERBS[j.do].icon || beat.b.e || '✨';
      }
      function buildPips() {
        stripEl.textContent = '';
        beats.forEach(function (bt, i) {
          var p = el('span', { class: 'kt-pip', 'data-i': String(i) }, ctx.sticker(pipIcon(bt)), el('span', { class: 'kt-pip__tick' }, ctx.sticker('✔️')));
          stripEl.appendChild(p);
          ctx.after(i * 60, function () { p.classList.add('is-in'); sfx.play('tick'); });
        });
      }
      function renderPips() {
        stripEl.querySelectorAll('.kt-pip').forEach(function (p, i) {
          p.classList.toggle('is-now', i === beatI && state !== 'finale');
          p.classList.toggle('is-done', i < beatI || (i === beatI && (state === 'merge' || state === 'finale')));
        });
      }

      /* ---- sizing ---- */

      function fit() {
        var s = ctx.size(), w = s.w, h = s.h, P = 12, G = 8, port = s.orient === 'portrait', U = util;
        var Wb, B, Sz, V, wallH = 0, midW = 0, row = 0, shW, shH;
        var nShelf = shelfItems().length;
        if (port) {
          wallH = U.clamp(Math.round(h * 0.30), 150, 300);
          Sz = U.clamp(Math.round(h * 0.05), 22, 36);
          // (the wall has a 3px outline all round: 6px of each size)
          V = Math.min(wallH - 6 - Sz - 6, Math.round((w - 2 * P) * 0.5));
          Wb = Math.floor((w - 2 * P - G) / 2);
          B = h - 2 * P - wallH - G;
          shW = Math.floor((w - 2 * P - 6 - V - 12) / 2) - 4;
          shH = V;
        } else {
          Wb = U.clamp(Math.round(w * 0.30), 150, 320);
          midW = w - 2 * P - 2 * Wb - 2 * G;
          B = h - 2 * P;
          Sz = U.clamp(Math.round(h * 0.08), 22, 36);
          row = nShelf ? U.clamp(Math.round(h * 0.07), 20, 44) : 0;
          V = Math.min(midW - 6 - 8, B - 6 - Sz - 2 * row - 3 * 6 - 8, 340);
          shW = midW - 6 - 8;
          shH = row;
        }
        var C = U.clamp(Math.round(Wb * 0.3), 32, 72);              // the chef
        var Wn = U.clamp(Math.round(Wb * 0.30), 36, 64);            // the want bubble
        var top = Math.max(C, Wn) + 6, inner = Wb - 16, mainH = B - 16 - top;
        var T = U.clamp(Math.min(inner, Math.round(mainH * 0.85)), 96, 240);       // the object
        var J = U.clamp(Math.floor(Math.min(inner, (mainH - 12) / 3)), 64, 120);   // a jar or bowl row
        var nb = beats.length || 6, stripW = port ? w - 2 * P : midW;
        var pip = Math.max(20, Math.min(Sz, Math.floor((stripW - 16 - (nb - 1) * 4) / nb)));
        // menu: the biggest square cards that fit, in however many columns suit
        var n = menuCount(), W = w - 2 * P, H = h - 2 * P, card = 0, cols = 1;
        for (var c = 1; c <= 5; c++) {
          var r = Math.ceil(n / c);
          var z = Math.floor(Math.min((W - (c - 1) * 10) / c, (H - (r - 1) * 10) / r));
          if (z > card) { card = z; cols = c; }
        }
        card = Math.min(200, card);
        var set = function (k, v) { root.style.setProperty(k, v); };
        set('--wall', wallH + 'px'); set('--pip', pip + 'px'); set('--vessel', V + 'px');
        set('--board-w', Wb + 'px'); set('--board-h', B + 'px'); set('--chef', C + 'px'); set('--want', Wn + 'px');
        set('--top', top + 'px'); set('--obj', T + 'px'); set('--jar', J + 'px'); set('--card', card + 'px'); set('--cols', String(cols));
        set('--gift', Math.min(Math.round(V * 0.58), 150) + 'px'); set('--shelf-row', row + 'px');
        // the shelf: the biggest items that fit half of them on each side (an item is a little wider than its emoji)
        var per = Math.ceil(nShelf / 2), deco = 14;
        for (var d = Math.min(44, Math.round(V * 0.3)); d >= 10; d--) {
          var cell = Math.ceil(d * 1.25), cc = Math.floor(shW / cell);
          if (cc >= 1 && Math.ceil(per / cc) * cell <= shH) { deco = d; break; }
        }
        set('--deco', deco + 'px');
        if (scene.hidden) return;
        // then make sure everything really fits, whatever the emoji font
        var over = function (n) { return n.scrollWidth > n.clientWidth + 1 || n.scrollHeight > n.clientHeight + 1; };
        for (var t = 0; t < 8 && deco > 10 && (over(shelfL) || over(shelfR)); t++) { deco = Math.floor(deco * 0.9); set('--deco', deco + 'px'); }
        for (var t2 = 0; t2 < 8 && T > 96 && boards.some(function (b) { return over(b.main); }); t2++) { T = Math.max(96, Math.floor(T * 0.9)); set('--obj', T + 'px'); }
      }

      /* ---- the ghost hand ---- */

      function hint(node, o) { lastHinted = node || null; ctx.hint(node || null, o); }
      function seen(v) { return kit.seen.indexOf(v) >= 0; }

      /** Quiet seconds before the hand shows the next thing on side s's board. */
      function idleFor(s) {
        if (s !== aSide) return 10;
        var b = boards[s];
        if (b.verb && !seen(b.verb)) return 1.5;
        return [8, 5, 3][ctx.helpFor(aSide)] || 8;
      }

      /** The menu: the newest dish not yet cooked (the first of the starting two on a new kitchen); else the least cooked. */
      function menuTarget() {
        var best = null, bestRank = -2;
        u.recipes.forEach(function (id) {
          if (kit.cooked[id]) return;
          var rank = -1;
          GIFTS.forEach(function (g, i) { if (g.kind === 'recipe' && g.id === id) rank = i; });
          if (rank > bestRank) { best = id; bestRank = rank; }
        });
        if (!best) {
          var low = Infinity;
          u.recipes.forEach(function (id) { var n = kit.cooked[id] || 0; if (n < low) { low = n; best = id; } });
        }
        return best ? menuEl.querySelector('.kt-card[data-id="' + best + '"]') : null;
      }

      /** Where the hand points on a board: always something that moves its job on. */
      function targetOf(b) {
        if (b.verb === 'fetch') return b.parts.right || null;
        if (b.verb === 'pick') return b.chosen != null ? b.parts.bowls[b.chosen] : b.parts.bowls[1];
        return b.obj;
      }

      /** The hand: her board while it is unfinished, else the other unfinished board; nothing during deals, merges and the finale. */
      function hintNext() {
        if (state === 'menu') { hint(menuTarget()); return; }
        if (state !== 'beat') { hint(null); return; }
        var s = !boards[aSide].done ? aSide : !boards[bSide].done ? bSide : -1;
        hint(s < 0 ? null : targetOf(boards[s]));
      }
      function handSide() {
        if (!lastHinted) return -1;
        for (var s = 0; s < 2; s++) if (boards[s].el.contains(lastHinted)) return s;
        return -1;
      }

      /* ---- the round: menu -> deal -> beat -> merge -> ... -> finale ---- */

      function pick(id, card) {
        if (state !== 'menu' || !RECIPES[id] || u.recipes.indexOf(id) < 0) return;
        setState('deal');
        menuEl.querySelectorAll('.kt-card').forEach(function (c) { c.setAttribute('aria-disabled', 'true'); });
        sfx.play('start');
        if (card) fx.pop(card);
        ctx.setTurn(null);
        hint(null);
        recipeId = id; recipe = RECIPES[id]; beats = beatsFor(recipe, LEN); beatI = -1;
        catSnacks = 0; chickThisRound = false; highDone = false; fill = 0; pickedChoice = null;
        vesselEl.style.setProperty('--spin0', '0deg'); vesselEl.style.setProperty('--spin1', '0deg');
        vessel = newVessel(recipe.vessel);
        boards.forEach(function (b) {
          b.job = null; b.verb = null; b.done = false; b.obj = null; b.parts = {}; b.main.textContent = '';
          b.el.classList.remove('is-done', 'has-nose'); b.want.hidden = true; b.el.removeAttribute('data-verb');
        });
        menuEl.classList.add('is-leaving');
        later(300, function () { menuEl.hidden = true; });
        scene.hidden = false;
        renderGhost();
        renderVessel();
        buildPips();
        fit();
        vesselEl.classList.remove('is-in', 'is-out');
        void vesselEl.offsetWidth;
        vesselEl.classList.add('is-in');
        boards.forEach(function (b) { fx.bounce(b.chef); });
        later(700, function () { startBeat(0); });
      }

      function jobFor(s, i) { var bt = beats[i]; return bt ? (s === aSide ? bt.a : bt.b) : null; }

      function startBeat(i) {
        setState('beat');
        beatI = i;
        var beat = beats[i];
        if (beat.a.do === 'blow' && vessel.kind === 'cake') { vessel.candles = [true, true, true, true, true, true]; renderVessel(); }
        vesselEl.classList.toggle('is-stirring', beat.a.do === 'stir' || beat.b.do === 'stir');
        boards.forEach(function (b) {
          var s = b.side, mine = jobFor(s, i - 1), theirs = jobFor(1 - s, i - 1);
          var entry = mine && mine.to === 'stay' ? 'stay' : theirs && theirs.to === 'across' ? 'across' : 'new';
          setupBoard(b, jobFor(s, i), entry);
        });
        renderPips();
        hint(null);
        // the hand: soon on her board when the job is new to her (or it is time to taste), else when someone waits
        var a = boards[aSide];
        if (a.verb === 'taste' || a.verb === 'blow') lastTap[aSide] = ctx.time - idleFor(aSide) + 0.6;
        else if (!seen(a.verb)) lastTap[aSide] = ctx.time - idleFor(aSide) + 0.5;
        else lastTap[aSide] = ctx.time;
        lastTap[bSide] = ctx.time;
      }

      function setupBoard(b, job, entry) {
        b.job = job; b.verb = job.do; b.n = nFor(job, ctx.helpFor(b.side), TAPOPT); b.k = 0; b.done = false;
        b.nextAt = 0; b.busyUntil = ctx.time + 0.3;           // a moment to see the new job before it can be used up
        b.phase = job.do === 'fry' ? 'heat1' : null; b.heat = 0; b.heat2 = 0;
        b.chosen = null; b.wrongRow = 0; b.sneezed = false; b.replaced = false; b.turns = 0;
        b.el.classList.remove('is-done');
        b.el.dataset.verb = job.do;
        b.el.setAttribute('role', job.do === 'fetch' || job.do === 'pick' ? 'group' : 'button');
        b.want.hidden = job.do !== 'fetch';
        b.want.textContent = '';
        b.main.textContent = '';
        b.parts = {};
        b.obj = null;
        if (job.do === 'fetch') buildFetch(b);
        else if (job.do === 'pick') buildPick(b);
        else {
          var o = el('div', { class: 'kt-obj kt-obj--' + job.do, 'data-k': '0' });
          BUILD[job.do](b, o);
          b.main.appendChild(o);
          b.obj = o;
        }
        // how it arrives: bounces in from the board's outer edge, is already there, or has just flown across
        var node = b.obj || b.parts.jarsEl || b.parts.bowlsEl;
        if (entry === 'new') {
          var hen = job.do === 'crack' && u.helpers.hen && !b.replaced ? shelfItem('hen') : null;
          if (hen) { fx.bounce(hen); S.cluck(); fly('🥚', hen, node, { ms: 380, pop: false }); node.classList.add('is-late'); ctx.after(RM ? 0 : 380, function () { node.classList.remove('is-late'); }); }
          else node.classList.add(b.side ? 'is-in-r' : 'is-in-l');
        } else if (entry === 'across') { node.classList.add('is-in-pop'); }
      }

      /** A tap a job could not use: the object squashes, a soft tick. */
      function tooSoon(b) {
        squash(b.obj || b.main);
        if (ctx.time - b.tickAt >= 0.1) { b.tickAt = ctx.time; sfx.play('tick'); }
      }

      /** A tap when there is nothing to do on this board: the chef cheers (and a taster munches some more). */
      function cheer(b) {
        if (b.done && b.verb === 'taste' && state !== 'menu') {
          if (ctx.time - b.munchAt < 0.3) { squash(b.chef); return; }
          b.munchAt = ctx.time;
          sfx.play('munch');
          faceSwap(b, util.pick(FACES), 900);
          burstAt(b.chef, { emoji: '💕', count: 3, distance: 30, size: 16 });
          return;
        }
        if (ctx.time - b.cheerAt < 0.15) { squash(b.chef); return; }
        b.cheerAt = ctx.time;
        fx.bounce(b.chef);
        if (b.obj || b.main.firstChild) fx.wiggle(b.obj || b.main.firstChild);
        sfx.play('pop', { pitch: 600 + 60 * (b.c++ % 8) });
        burstAt(b.chef, { count: 4, distance: 36, size: 8, colors: [players[b.side].color, '#FFC933'] });
      }

      function faceSwap(b, e, ms) {
        var gen = ++b.faceGen;
        b.face.textContent = e;
        ctx.after(ms, function () { if (b.faceGen === gen) b.face.textContent = b.emoji; });
      }

      /** Counted: k moved on (or a heating tap, or a wrong jar). Feeds the idle timer and the test log. */
      function counted(b, wasHinted) {
        events.push({ t: ctx.time, side: b.side, k: b.k });
        if (events.length > 200) events.shift();
        lastTap[b.side] = wasHinted && b.el.contains(wasHinted) ? ctx.time - idleFor(b.side) + 1.5 : ctx.time;
      }

      /** The only handler for a board. */
      function onBoard(s, ev) {
        var b = boards[s], wasHinted = lastHinted;
        lastHinted = null;                                     // (the shell has taken the hand away)
        if (state !== 'beat' || b.done || !b.job) { cheer(b); return; }
        if (ctx.time < b.busyUntil || ctx.time < b.nextAt) { tooSoon(b); return; }
        var res = TAP[b.verb](b, ev);
        if (res === false) return;                             // a miss: a funny non-event, the gap is not used up
        b.nextAt = ctx.time + (b.gapNext || VERBS[b.verb].gap || GAP);
        b.gapNext = 0;
        if (b.obj) b.obj.dataset.k = String(b.k);
        counted(b, wasHinted);
        if (!b.done && b.k >= b.n && VERBS[b.verb].kind !== 'cook' && b.verb !== 'crack') finish(b);
      }

      /** This board's job is done: latched, once only. */
      function finish(b) {
        if (b.done || state !== 'beat') return;
        b.done = true;
        b.k = Math.min(b.k, b.n);
        b.el.classList.add('is-done');
        if (b.obj) b.obj.dataset.k = String(b.k);
        fx.pop(b.check);
        if (b.side === aSide && !seen(b.verb)) { kit.seen.push(b.verb); save(); }
        if (boards[0].done && boards[1].done) {
          if (beatI >= beats.length - 1) finale();
          else merge();
        } else if (handSide() === b.side) hintNext();     // it finished by itself under the hand: the hand moves on
      }

      function merge() {
        setState('merge');
        hint(null);
        renderPips();
        var beat = beats[beatI], i = beatI;
        later(300, function () {
          sfx.play('match');
          var radio = shelfItem('radio');
          if (radio) { fx.bounce(radio); sfx.scale(util.rand(6) + 4); }
          var t = 0;
          if (beat.serve) { serve(beat.serve); t = 400; }
          later(t, function () {
            boards.forEach(function (b) {
              var job = b.job, from = b.parts.result || b.obj || b.main;
              if (job.to === 'mid') fly(resultOf(job), from, vesselEl, { size: resultSize(), dy: 0.08 });
              else if (job.to === 'across') { fly(resultOf(job), from, boards[1 - b.side].main, { size: resultSize() }); if (from) from.classList.add('is-gone'); }
              else fx.bounce(from);
            });
            later(550, function () {
              boards.forEach(function (b) { if (b.job.to === 'mid') addResult(b.job); });
              fill = (i + 1) / beats.length;
              renderVessel();
              renderPips();
              var extra = 0;
              if (beat.a.do === 'stir' || beat.b.do === 'stir') extra = stirMorph();
              later(extra + 250, function () { startBeat(i + 1); });
            });
          });
        });
      }
      function resultSize() { return Math.round(parseFloat(getComputedStyle(root).getPropertyValue('--vessel')) * 0.2) || 30; }

      /** Martabak and the cake move to a plate: the old vessel slides out, the new one slides in empty. */
      function serve(kind) {
        vesselEl.classList.remove('is-in');
        vesselEl.classList.add('is-out');
        sfx.play('slide');
        later(200, function () {
          var added = vessel.added;
          vessel = newVessel(kind);
          vessel.added = added;
          renderVessel();
          vesselEl.classList.remove('is-out');
          void vesselEl.offsetWidth;
          vesselEl.classList.add('is-in');
        });
      }

      /** After stirring: everything in the dish swirls into one smooth mix (then a toss of the wok, or the lid). */
      function stirMorph() {
        vesselEl.classList.remove('is-stirring');
        if (!recipe.mix) { burstAt(vesselEl, { emoji: '✨', count: 8, distance: 70, size: 18 }); sfx.play('good'); return 300; }
        var pot = vessel.kind === 'pot';
        if (!pot) contentsEl.classList.add('is-morph');
        later(300, function () {
          contentsEl.classList.remove('is-morph');
          vessel.blobs = []; vessel.dots = [];
          if (pot) { vessel.liq = recipe.mix; vessel.level = 0.6; }                        // soup: the vegetables stay in it
          else if (vessel.kind === 'bowl') { vessel.pieces = []; vessel.liq = recipe.mix; vessel.level = 0.6; }   // a smooth batter
          else { vessel.pieces = []; vessel.mix = recipe.mix; }                              // fried rice
          renderVessel();
          burstAt(vesselEl, { emoji: '✨', count: 8, distance: 70, size: 18 });
          sfx.play('good');
          if (recipe.afterStir === 'toss') {
            var mix = contentsEl.querySelector('.kt-mix');
            [0, 280].forEach(function (d) { ctx.after(d + 100, function () { anim(mix, [{ transform: 'translateY(0)' }, { transform: 'translateY(-40%) rotate(-6deg)' }, { transform: 'translateY(0)' }], 260); sfx.play('whoosh'); }); });
          } else if (recipe.afterStir === 'lid') {
            vesselEl.classList.add('has-lid');
            [250, 450, 650].forEach(function (d) { ctx.after(d, function () { sfx.play('pop', { pitch: 420 + d * 0.3 }); anim(lidEl, [{ transform: 'translateY(0)' }, { transform: 'translateY(-10%) rotate(3deg)' }, { transform: 'translateY(0)' }], 150); }); });
            ctx.after(850, function () { sfx.play('ding'); vesselEl.classList.remove('has-lid'); burstAt(lidEl, { emoji: '♨️', count: 4, distance: 50, size: 20 }); });
          }
        });
        return 300 + (recipe.afterStir === 'toss' ? 600 : recipe.afterStir === 'lid' ? 1200 : 0);
      }

      /** The last beat is done: the dish is finished, the kitchen is saved now, a present, the party. */
      function finale() {
        kit.done++;
        kit.cooked[recipeId] = (kit.cooked[recipeId] || 0) + 1;
        save();
        var gift = giftFor(kit.done - 1), had = u;
        u = unlocks(kit.done);
        setState('finale');
        hint(null);
        fill = 1;
        vesselEl.style.setProperty('--fill', '1');
        renderPips();
        var cat = shelfItem('cat');
        if (had.helpers.cat && cat) { leap(cat, vesselEl, 900); sfx.play('munch'); ctx.after(400, S.purr); }
        if (had.helpers.radio) { var radio = shelfItem('radio'); fx.bounce(radio); S.tune(); }
        later(300, function () {
          contentsEl.classList.add('is-puff');
          burstAt(vesselEl, { emoji: '✨', count: 10, distance: 80, size: 20 });
          showDish();
          if (recipeId === 'cake') S.birthday(); else sfx.play('boost');
        });
        later(600, function () {
          giftEl.textContent = '';
          giftEl.appendChild(el('span', { class: 'kt-gift__box' }, ctx.sticker('🎁')));
          giftEl.appendChild(el('span', { class: 'kt-gift__inside' }, giftFace(gift)));
          giftEl.hidden = false;
          sfx.play('drop');
        });
        later(1500, function () {
          giftEl.classList.add('is-open');
          sfx.play('star');
          burstAt(giftEl, { emoji: '✨', count: 10, distance: 90, size: 22 });
          // what the present brings is in the kitchen at once, behind it
          if (gift.kind === 'helper' || gift.kind === 'decor') {
            buildShelf(); fit();
            var items = wallEl.querySelectorAll(gift.kind === 'helper' ? '.kt-item--' + gift.id : '.kt-item--decor');
            if (items.length) fx.bounce(items[items.length - 1]);
          }
          else if (gift.kind === 'tier') { renderTier(); fit(); }
        });
        later(2000, function () { ctx.win('team', { emoji: recipe.e, delay: 1800 }); });
      }

      function giftFace(g) {
        if (g.kind === 'recipe') return el('span', { class: 'kt-minicard' }, ctx.sticker(g.e), el('span', { class: 'kt-minicard__new' }, ctx.sticker('✨')));
        if (g.kind === 'medal') return el('span', { class: 'kt-medal' }, ctx.sticker(g.e), el('span', { class: 'kt-medal__m' }, ctx.sticker('🏅')));
        if (g.kind === 'tier' && g.n === 3) return el('span', { class: 'kt-signgift' }, ctx.sticker('🏮'), ctx.sticker(players[0].emoji), ctx.sticker(players[1].emoji), ctx.sticker('🏮'));
        return ctx.sticker(g.e);
      }

      /** The finished dish: the dish sticker, with what she picked around it (or its colour behind it), and herbs. */
      function showDish() {
        dishEl.textContent = '';
        var pk = null;
        beats.forEach(function (bt) { [bt.a, bt.b].forEach(function (j) { if (j.do === 'pick') pk = j; }); });
        var choice = pk ? pickedChoice : null;
        if (pk && choice != null) {
          var e = pk.choices[choice];
          dishEl.dataset.choice = e;
          if (pk.paint) dishEl.appendChild(el('span', { class: 'kt-dish__disc', style: { '--c': pk.paint[choice] } }));
          else for (var t = 0; t < 3; t++) dishEl.appendChild(el('span', { class: 'kt-dish__top', 'data-i': String(t) }, ctx.sticker(e)));
        }
        dishEl.appendChild(el('span', { class: 'kt-dish__main' }, ctx.sticker(recipe.e)));
        if (u.helpers.herbs) dishEl.appendChild(el('span', { class: 'kt-dish__herb' }, ctx.sticker('🌿')));
        dishEl.hidden = false;
      }

      /** A shelf helper leaps to something and back (decoration). */
      function leap(node, toNode, ms) {
        if (!node || !toNode || !node.animate) return;
        var a = fx.centerOf(node), b = fx.centerOf(toNode), dx = b.x - a.x, dy = b.y - a.y;
        node.animate([
          { transform: 'translate(0, 0)' },
          { transform: 'translate(' + dx * 0.5 + 'px, ' + (dy * 0.5 - 40) + 'px) scale(1.6)', offset: 0.3 },
          { transform: 'translate(' + dx + 'px, ' + dy + 'px) scale(1.8)', offset: 0.5 },
          { transform: 'translate(' + dx + 'px, ' + dy + 'px) scale(1.8) rotate(-10deg)', offset: 0.65 },
          { transform: 'translate(0, 0)' },
        ], { duration: RM ? 200 : ms, easing: 'ease-in-out', composite: 'add' });
      }

      /* ---- cooking: one shared clock ---- */

      function heatStep(b) {
        if (b.done || b.verb !== 'fry') return;
        var cs = COOK_S[ctx.helpFor(b.side)] || 3;
        if (b.phase === 'heat1') {
          b.heat = Math.min(1, b.heat + 0.1 / cs);
          b.obj.style.setProperty('--cook', b.heat.toFixed(2));
          if (b.heat >= 1) gold(b);
        } else if (b.phase === 'heat2') {
          b.heat2 = Math.min(1, b.heat2 + 0.1 / (cs * 0.6));
          b.obj.style.setProperty('--side2', b.heat2.toFixed(2));
          if (b.heat2 >= 1) { b.phase = 'done'; b.obj.classList.add('is-cooked'); sfx.play('good'); finish(b); }
        }
      }
      function cookTick() {
        if (state !== 'beat') return;
        boards.forEach(function (b) {
          if (b.done || b.verb !== 'fry') return;
          if (b.phase === 'heat1' || b.phase === 'heat2') {
            heatStep(b);
            if (ctx.time - b.sizzleAt >= 0.3) { b.sizzleAt = ctx.time; S.sizzle(0.03); }
          }
        });
      }

      /** Golden: a ding, a sparkle, steam; this board alone waits a moment so a hammering finger cannot flip it unseen. */
      function gold(b) {
        b.phase = 'gold';
        b.obj.classList.add('is-gold');
        sfx.play('ding');
        b.busyUntil = ctx.time + LATCH;
      }

      /* ---- the jobs: how each one looks ---- */

      var BUILD = {
        wash: function (b, o) {
          var job = b.job, item = el('span', { class: 'kt-item' }, ctx.sticker(job.e)), muds = [];
          for (var i = 0; i < b.n; i++) { var m = el('i', { class: 'kt-mud', style: { left: MUD[i][0] + '%', top: MUD[i][1] + '%' } }); item.appendChild(m); muds.push(m); }
          o.appendChild(el('span', { class: 'kt-sink' }));
          o.appendChild(el('span', { class: 'kt-stream' }));
          o.appendChild(el('span', { class: 'kt-faucet' }, ctx.sticker('🚰')));
          o.appendChild(item);
          o.appendChild(el('span', { class: 'kt-shine' }));
          b.parts = { item: item, muds: muds, result: item };
        },
        peel: function (b, o) {
          var job = b.job, item = el('span', { class: 'kt-item' }, ctx.sticker(job.e)), petals = [];
          for (var i = 0; i < b.n; i++) { var p = el('i', { class: 'kt-petal', style: { '--a': Math.round(i * 360 / b.n - 30) + 'deg', '--c': PEEL[job.e] || '#F7D35C' } }); petals.push(p); item.appendChild(p); }
          o.appendChild(item);
          b.parts = { item: item, petals: petals, result: item };
        },
        chop: function (b, o) {
          var pile = el('span', { class: 'kt-slices' }), knife = el('span', { class: 'kt-knife' }, ctx.sticker('🔪'));
          o.appendChild(el('span', { class: 'kt-cboard' }));
          o.appendChild(pile);
          o.appendChild(knife);
          b.parts = { pile: pile, knife: knife, result: pile };
          slices(b, 1);
        },
        pound: function (b, o) {
          var e = b.job.e, mash = el('span', { class: 'kt-mash' }, ctx.sticker(e), ctx.sticker(e), ctx.sticker(e));
          var sauce = el('span', { class: 'kt-sauce', style: { '--c': SAUCE[e] || '#A0642D' } });
          var cobek = el('span', { class: 'kt-cobek' }, sauce, mash);
          var pestle = el('span', { class: 'kt-pestle' });
          o.appendChild(cobek);
          o.appendChild(pestle);
          o.style.setProperty('--p', '0');
          b.parts = { cobek: cobek, pestle: pestle, result: cobek };
        },
        crack: function (b, o) {
          var line = el('span', { class: 'kt-crackline' });
          line.innerHTML = '<svg viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true"><polyline points="0,12 12,4 24,20 36,4 48,20 60,4 72,20 84,4 100,12" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>';
          var egg = el('span', { class: 'kt-egg' }, el('span', { class: 'kt-shell kt-shell--top' }), el('span', { class: 'kt-shell kt-shell--bot' }), line);
          var yolks = el('span', { class: 'kt-yolks' });
          var bowl = el('span', { class: 'kt-sbowl' }, yolks);
          o.appendChild(bowl);
          o.appendChild(egg);
          o.style.setProperty('--crack', '0');
          b.parts = { egg: egg, bowl: bowl, yolks: yolks, result: bowl };
        },
        skewer: function (b, o) {
          var cubes = [];
          var stick = el('span', { class: 'kt-stick' });
          o.appendChild(stick);
          for (var i = 0; i < 3; i++) { var c = el('span', { class: 'kt-cube', 'data-i': String(i) }); cubes.push(c); o.appendChild(c); }
          var sate = el('span', { class: 'kt-sate' }, ctx.sticker('🍢'));
          o.appendChild(sate);
          b.parts = { cubes: cubes, sate: sate, result: o };
        },
        stir: function (b, o) {
          var spoon = el('span', { class: 'kt-spoon' }, ctx.sticker('🥄'));
          o.appendChild(el('span', { class: 'kt-mswirl' }, el('i'), el('i')));
          o.appendChild(spoon);
          o.style.setProperty('--turn', '0deg');
          o.style.setProperty('--batter', recipe.mix || '#FFF4DC');
          b.parts = { spoon: spoon };
        },
        pour: function (b, o) {
          var job = b.job, jug = el('span', { class: 'kt-jug', style: { '--liq': job.liquid } }, el('span', { class: 'kt-jug__body' }), el('span', { class: 'kt-jug__band' }), el('span', { class: 'kt-jug__label' }, ctx.sticker(job.e)));
          o.appendChild(jug);
          b.parts = { jug: jug };
        },
        shake: function (b, o) {
          var sh = el('span', { class: 'kt-shaker' }, ctx.sticker(b.job.e));
          o.appendChild(el('span', { class: 'kt-plate-s' }));
          o.appendChild(el('span', { class: 'kt-fall', style: { '--c': b.job.dots } }));
          o.appendChild(sh);
          b.parts = { shaker: sh };
        },
        garnish: function (b, o) {
          var bits = [], saucer = el('span', { class: 'kt-saucer' });
          for (var i = 0; i < 3; i++) { var g = el('span', { class: 'kt-bit', 'data-i': String(i) }, ctx.sticker(b.job.e)); bits.push(g); saucer.appendChild(g); }
          o.appendChild(saucer);
          b.parts = { bits: bits };
        },
        scoop: function (b, o) {
          var dome = el('span', { class: 'kt-dome' });
          o.appendChild(el('span', { class: 'kt-ricepot' }, dome, el('span', { class: 'kt-ricepot__body' })));
          var spoon = el('span', { class: 'kt-scoop' }, ctx.sticker('🥄'));
          o.appendChild(spoon);
          b.parts = { dome: dome, spoon: spoon };
        },
        fry: function (b, o) {
          var job = b.job, food = el('span', { class: 'kt-food' }, ctx.sticker(job.e));
          o.classList.add('kt-prop--' + job.prop);
          o.style.setProperty('--cook', '0');
          o.style.setProperty('--side2', '0');
          if (job.prop === 'pan') {
            o.appendChild(el('span', { class: 'kt-fire' }, ctx.sticker('🔥')));
            o.appendChild(el('span', { class: 'kt-pan' }, el('span', { class: 'kt-pan__handle' })));
            o.appendChild(food);
          } else if (job.prop === 'grill') {
            o.appendChild(el('span', { class: 'kt-coals' }, el('i'), el('i'), el('i'), el('i'), el('i')));
            o.appendChild(el('span', { class: 'kt-bars' }));
            o.appendChild(food);
          } else {
            o.appendChild(el('span', { class: 'kt-oven' }, el('span', { class: 'kt-oven__knobs' }, el('i'), el('i')), el('span', { class: 'kt-oven__win' }, food), el('span', { class: 'kt-oven__door' })));
          }
          o.appendChild(el('span', { class: 'kt-goldspark' }, ctx.sticker('✨')));
          o.appendChild(el('span', { class: 'kt-steam' }, ctx.sticker('♨️')));
          b.parts = { food: food, result: food };
        },
        taste: function (b, o) {
          o.appendChild(el('span', { class: 'kt-tbowl' }, el('span', { class: 'kt-tbowl__food' }, ctx.sticker(recipe.e))));
          var spoon = el('span', { class: 'kt-tspoon' }, ctx.sticker('🥄'));
          o.appendChild(spoon);
          b.parts = { spoon: spoon };
        },
        blow: function (b, o) {
          var flames = [], candles = el('span', { class: 'kt-mcandles' });
          for (var i = 0; i < 3; i++) { var c = el('span', { class: 'kt-candle', style: { '--c': 'var(--p' + b.side + ')' } }, el('i')); flames.push(c); candles.appendChild(c); }
          o.appendChild(el('span', { class: 'kt-minicake' }, candles, el('span', { class: 'kt-minicake__top' }), el('span', { class: 'kt-minicake__body' })));
          b.parts = { candles: flames };
        },
      };

      function slices(b, c) {
        var pile = b.parts.pile, have = pile.childNodes.length;
        for (; have < Math.min(6, c); have++) pile.appendChild(el('span', { class: 'kt-slice' }, ctx.sticker(b.job.e)));
        pile.classList.toggle('is-cut', c > 1);
        pile.childNodes.forEach(function (n, i) {
          var p = c > 1 ? SPREAD[i] : [0, 0];
          n.style.setProperty('--x', p[0] + 'em');
          n.style.setProperty('--y', p[1] + 'em');
        });
      }

      function buildFetch(b) {
        var job = b.job, help = ctx.helpFor(b.side);
        b.want.appendChild(ctx.sticker(job.e));
        var list = util.shuffle(job.jars.slice());
        if (help >= 2) list = util.shuffle([job.e, util.pick(job.jars.filter(function (e) { return e !== job.e; }))]);
        var jarsEl = el('div', { class: 'kt-jars', 'data-n': String(list.length) });
        var jars = list.map(function (e) {
          var jar = el('button', { type: 'button', class: 'kt-jar' + (e === job.e && help === 1 ? ' is-bob' : ''), 'data-e': e, 'aria-label': 'Jar' },
            el('span', { class: 'kt-glass' }, el('span', { class: 'kt-glass__lid' }), el('span', { class: 'kt-glass__in' }, ctx.sticker(e))));
          jarsEl.appendChild(jar);
          if (e === job.e) b.parts.right = jar;
          return jar;
        });
        b.main.appendChild(jarsEl);
        b.parts.jars = jars;
        b.parts.jarsEl = jarsEl;
      }

      function buildPick(b) {
        var job = b.job;
        var bowlsEl = el('div', { class: 'kt-bowls' });
        var bowls = job.choices.map(function (e, i) {
          var inner = el('span', { class: 'kt-pbowl' });
          if (job.paint) { inner.appendChild(el('span', { class: 'kt-pool', style: { '--c': job.paint[i] } })); inner.appendChild(el('span', { class: 'kt-pbowl__fruit' }, ctx.sticker(e))); }
          else for (var t = 0; t < 3; t++) inner.appendChild(el('span', { class: 'kt-pbowl__bit', 'data-t': String(t) }, ctx.sticker(e)));
          var bowl = el('button', { type: 'button', class: 'kt-bowl', 'data-i': String(i), 'data-pos': String(i), 'aria-label': 'Bowl' }, inner);
          bowlsEl.appendChild(bowl);
          return bowl;
        });
        b.main.appendChild(bowlsEl);
        b.parts.bowls = bowls;
        b.parts.bowlsEl = bowlsEl;
      }

      /** The nearest enabled element matching sel inside the board within `slop` px of the tap (Garden-style no dead gaps). */
      function nearestIn(b, sel, ev, slop) {
        var t = ev.target && ev.target.closest ? ev.target.closest(sel) : null;
        if (t && b.el.contains(t) && t.getAttribute('aria-disabled') !== 'true') return t;
        if (ev.clientX == null) return null;
        var best = null, bestD = slop;
        b.el.querySelectorAll(sel).forEach(function (n) {
          if (n.getAttribute('aria-disabled') === 'true') return;
          var r = n.getBoundingClientRect();
          if (!r.width) return;
          var dx = Math.max(r.left - ev.clientX, 0, ev.clientX - r.right), dy = Math.max(r.top - ev.clientY, 0, ev.clientY - r.bottom);
          var d = Math.sqrt(dx * dx + dy * dy);
          if (d <= bestD) { best = n; bestD = d; }
        });
        return best;
      }

      /** Surprise rolls; a test can force the next one. */
      function roll(name, p) { if (forced[name]) { delete forced[name]; return true; } return Math.random() < p; }

      /* ---- the jobs: what a tap does. Return false for a miss (nothing used up). ---- */

      var TAP = {
        wash: function (b) {
          var m = b.parts.muds[b.k];
          if (m) m.classList.add('is-off');
          burstAt(b.parts.item, { emoji: '💦', count: 4, distance: 40, size: 16 });
          sfx.play('splash'); S.squeak(b.k);
          anim(b.obj.querySelector('.kt-stream'), [{ opacity: 1 }, { opacity: 0.2 }], 260, { replace: true });
          b.k++;
          if (b.k >= b.n) {
            b.obj.classList.add('is-clean');
            burstAt(b.parts.item, { emoji: '✨', count: 6, distance: 50, size: 16 });
            sfx.seq([79, 84, 88], { step: 0.08, type: 'sine', gain: 0.16 });
          }
        },
        peel: function (b) {
          var p = b.parts.petals[b.k];
          if (p) p.classList.add('is-off');
          S.shhk(); sfx.play('pop', { pitch: 500 + 80 * b.k });
          b.k++;
          if (b.k >= b.n) { b.obj.classList.add('is-clean'); fx.pop(b.parts.item); sfx.play('good'); }
        },
        chop: function (b) {
          anim(b.parts.knife, [{ transform: 'rotate(0deg)' }, { transform: 'rotate(-38deg) translateY(10%)' }, { transform: 'rotate(0deg)' }], 200);
          S.tok(b.k);
          b.k++;
          slices(b, b.k + 1);
          if (b.k >= b.n) {
            b.parts.pile.classList.add('is-pile');
            b.parts.pile.childNodes.forEach(function (n, i) { var p = PILE[i]; n.style.setProperty('--x', p[0] + 'em'); n.style.setProperty('--y', p[1] + 'em'); });
            fx.bounce(b.parts.pile);
            sfx.play('good');
          }
        },
        pound: function (b) {
          anim(b.parts.pestle, [{ transform: 'translateY(0)' }, { transform: 'translateY(38%)' }, { transform: 'translateY(0)' }], 180);
          S.dug();
          fx.shake(b.parts.cobek);
          b.k++;
          b.obj.style.setProperty('--p', (b.k / b.n).toFixed(2));
          if (b.k >= b.n) sfx.play('good');
        },
        crack: function (b) {
          b.k++;
          if (b.k < b.n) { crackLine(b); return; }
          if (b.n === 1) {
            // one tap does both: the crack now, the egg opens a moment later
            crackLine(b);
            b.busyUntil = ctx.time + 0.25;
            later(250, function () { openEgg(b); });
            return;
          }
          openEgg(b);
        },
        skewer: function (b) {
          var c = b.parts.cubes[b.k];
          if (c) c.classList.add('is-on');
          b.k++;
          sfx.play('hop', { pitch: 500 + 120 * (b.k - 1) });
          ctx.say(b.k);
          if (b.k >= b.n) { b.obj.classList.add('is-sate'); fx.pop(b.parts.sate); sfx.play('good'); }
        },
        stir: function (b) {
          b.turns++;
          b.obj.style.setProperty('--turn', (b.turns * 90) + 'deg');
          vesselEl.style.setProperty('--spin' + b.side, (b.turns * 90) + 'deg');
          var snd = recipe.stir || 'swish';
          if (snd === 'sizzle') S.sizzle(0.06); else if (snd === 'clink') S.clink(); else S.swish();
          sfx.scale(b.k + 2);
          b.k++;
          if (b.k >= b.n) sfx.play('good');
        },
        pour: function (b) {
          var job = b.job, dir = b.side ? -1 : 1;
          anim(b.parts.jug, [{ transform: 'rotate(0deg)' }, { transform: 'rotate(' + 28 * dir + 'deg)' }, { transform: 'rotate(0deg)' }], 360);
          S.glug();
          b.k++;
          countAloud(b.k);
          if (job.drizzle) { if (vessel.drizzles.length >= 4) vessel.drizzles.shift(); vessel.drizzles.push(job.liquid); vessel.added++; }
          else addLiquid(job.liquid, 0.1);
          fly(el('span', { class: 'kt-drop', style: { '--c': job.liquid } }), b.parts.jug, vesselEl, { ms: 350, size: resultSize() * 0.6 });
          ctx.after(RM ? 0 : 350, renderVessel);
          if (b.k >= b.n) sfx.play('ding');
        },
        shake: function (b) {
          var job = b.job;
          anim(b.parts.shaker, [{ transform: 'rotate(0deg)' }, { transform: 'rotate(170deg) translateX(-6%)' }, { transform: 'rotate(190deg) translateX(6%)' }, { transform: 'rotate(170deg) translateX(-6%)' }, { transform: 'rotate(0deg)' }], 420);
          anim(b.obj.querySelector('.kt-fall'), [{ opacity: 1 }, { opacity: 0 }], 420, { replace: true });
          sfx.play('roll');
          for (var t = 0; t < 3; t++) sfx.tone({ freq: 900, dur: 0.03, type: 'square', gain: 0.05, delay: 0.08 + t * 0.07 });
          b.k++;
          countAloud(b.k);
          addDots(job.dots, 6);
          ctx.after(RM ? 0 : 250, renderVessel);
          if (job.e === '🧂' && !b.sneezed && roll('sneeze', 0.25)) {
            // a sneeze: that chef wobbles and keeps a white dot on the nose for the rest of the round
            b.sneezed = true;
            ctx.after(200, function () { S.sneeze(); fx.shake(b.chef); b.el.classList.add('has-nose'); });
          }
          if (b.k >= b.n) sfx.play('good');
        },
        garnish: function (b) {
          var e = b.job.e, bit = b.parts.bits[b.k];
          fly(e, bit, vesselEl, { ms: 420, size: resultSize() * 0.8, dy: -0.1 });
          if (bit) bit.classList.add('is-off');
          if (e === '❄️') S.clink(); else sfx.play('pop', { pitch: 500 + 90 * b.k });
          b.k++;
          countAloud(b.k);
          addRim(e);
          ctx.after(RM ? 0 : 420, renderVessel);
          if (b.k >= b.n) sfx.play('star');
        },
        scoop: function (b) {
          anim(b.parts.spoon, [{ transform: 'rotate(0deg)' }, { transform: 'rotate(-30deg) translateY(-12%)' }, { transform: 'rotate(0deg)' }], 260);
          fly('🍚', b.parts.dome, vesselEl, { ms: 420, size: resultSize() });
          sfx.play('pop', { pitch: b.k ? 650 : 500 });
          b.k++;
          countAloud(b.k);
          b.obj.style.setProperty('--left', String(1 - b.k / b.n));
          addPiece('🍚');
          ctx.after(RM ? 0 : 420, renderVessel);
          if (b.k >= b.n) sfx.play('good');
        },
        fry: function (b) {
          if (b.phase === 'heat1' || b.phase === 'heat2') {
            // never a dead tap: the pan wiggles and sizzles, the coals get fanned, the oven glows (and it cooks a little faster)
            if (b.phase === 'heat1') { b.heat = Math.min(0.99, b.heat + 0.15); b.obj.style.setProperty('--cook', b.heat.toFixed(2)); }
            else { b.heat2 = Math.min(0.99, b.heat2 + 0.15); b.obj.style.setProperty('--side2', b.heat2.toFixed(2)); }
            fx.wiggle(b.parts.food);
            S.sizzle(0.06);
            if (b.job.prop === 'grill') burstAt(b.obj.querySelector('.kt-coals'), { emoji: '💨', count: 3, distance: 30, size: 14 });
            if (b.job.prop === 'oven') anim(b.obj.querySelector('.kt-oven__win'), [{ opacity: 1 }, { opacity: 0.6 }, { opacity: 1 }], 300, { replace: true });
            return;
          }
          if (b.phase !== 'gold') { tooSoon(b); return false; }   // (in the air: it lands by itself)
          b.k = 1;
          if (b.job.end === 'out') {
            b.phase = 'done';
            b.obj.classList.add('is-out');
            sfx.play('good');
            finish(b);
            return;
          }
          sfx.play('whoosh');
          b.obj.classList.remove('is-gold');
          b.obj.classList.add('is-flipped');
          if (b.job.prop === 'pan' && !highDone && roll('high', 0.2)) {
            // a high flip: it lands on this chef's hat, then hops back into the pan
            highDone = true;
            b.phase = 'flying';
            b.busyUntil = ctx.time + 0.9;
            b.parts.food.classList.add('is-away');
            fly(b.job.e, b.parts.food, b.chef, { ms: 300, size: resultSize(), dy: -0.45, pop: false });
            var hat = el('span', { class: 'kt-onhat' }, ctx.sticker(b.job.e));
            ctx.after(RM ? 0 : 300, function () { b.chef.appendChild(hat); });
            later(600, function () {
              hat.remove();
              fly(b.job.e, b.chef, b.parts.food, { ms: 280, size: resultSize(), pop: false });
              sfx.play('boing'); sfx.play('giggle');
            });
            later(900, function () { b.parts.food.classList.remove('is-away'); b.phase = 'heat2'; S.sizzle(0.08); });
            return;
          }
          b.phase = 'flying';
          b.busyUntil = ctx.time + 0.6;
          anim(b.parts.food, [{ transform: 'translateY(0) rotate(0deg)' }, { transform: 'translateY(-120%) rotate(90deg)', offset: 0.45 }, { transform: 'translateY(0) rotate(180deg)' }], 560, { easing: 'ease-in-out' });
          later(600, function () { b.phase = 'heat2'; S.sizzle(0.08); burstAt(b.parts.food, { emoji: '💨', count: 3, distance: 30, size: 14 }); });
        },
        fetch: function (b, ev) {
          var jar = nearestIn(b, '.kt-jar', ev, 24);
          if (!jar) {
            b.parts.jars.forEach(function (j) { fx.wiggle(j); });
            sfx.play('tap');
            return false;
          }
          var inner = jar.querySelector('.kt-glass__in');
          if (jar === b.parts.right) {
            b.k = 1;
            jar.classList.add('is-open');
            sfx.play('pop');
            sfx.play('good');
            b.parts.result = inner;
            b.parts.jars.forEach(function (j) { if (j !== jar) j.setAttribute('aria-disabled', 'true'); });
            finish(b);
            return;
          }
          // a wrong jar: a funny non-event; the jars are bottomless and nothing changes
          b.wrongRow++;
          b.gapNext = JAR_GAP;
          var cat = u.helpers.cat ? shelfItem('cat') : null;
          if (cat && catSnacks < 2) {
            catSnacks++;
            leap(cat, jar, 800);
            ctx.after(RM ? 0 : 350, function () { sfx.play('munch'); S.purr(); anim(inner, [{ transform: 'scale(1)' }, { transform: 'scale(0)', offset: 0.3 }, { transform: 'scale(0)', offset: 0.7 }, { transform: 'scale(1)' }], 700); });
          } else {
            anim(inner, [{ transform: 'translateY(0)' }, { transform: 'translateY(-55%)', offset: 0.3 }, { transform: 'translateY(-55%) rotate(-14deg)', offset: 0.45 }, { transform: 'translateY(-55%) rotate(14deg)', offset: 0.6 }, { transform: 'translateY(0)' }], 620);
            sfx.play('boing');
          }
          if (b.wrongRow >= 2) hint(b.parts.right, { delay: 1200 });
        },
        pick: function (b, ev) {
          var job = b.job;
          if (b.chosen == null) {
            var bowl = nearestIn(b, '.kt-bowl', ev, 24);
            if (!bowl) { b.parts.bowls.forEach(function (n) { fx.wiggle(n); }); sfx.play('tap'); return false; }
            // the choice: the other two slide away, this one moves to the middle. Every choice is right.
            b.chosen = +bowl.dataset.i;
            pickedChoice = b.chosen;
            b.parts.bowls.forEach(function (n) {
              if (n === bowl) { n.dataset.pos = '1'; n.classList.add('is-chosen'); }
              else { n.classList.add('is-gone'); n.setAttribute('aria-disabled', 'true'); }
            });
            b.parts.result = bowl;
          }
          var e = job.choices[b.chosen];
          fly(e, b.parts.bowls[b.chosen], vesselEl, { ms: 420, size: resultSize() });
          b.k++;
          countAloud(b.k);
          addPiece(e);
          if (job.paint) {
            var to = job.paint[b.chosen];
            if (vessel.kind === 'cake') vessel.frost = mixColor('#FFF4E0', to, b.k / 3);
            else { vessel.liq = mixColor(vessel.liq && vessel.liq !== 'transparent' ? vessel.liq : '#FFF4E0', to, 1 / 3 + (b.k - 1) / 3); vessel.level = Math.max(vessel.level, 0.3); }
            if (b.k === 1) { burstAt(b.parts.bowls[b.chosen], { count: 8, distance: 40, size: 10, colors: [to] }); sfx.play('splash'); }
          }
          ctx.after(RM ? 0 : 420, renderVessel);
          if (b.k >= b.n) sfx.play('star');
        },
        taste: function (b) {
          var hot = recipe.taste === 'hot', cold = recipe.taste === 'cold';
          b.k = 1;
          b.busyUntil = ctx.time + 0.7;
          anim(b.parts.spoon, [{ transform: 'translateY(0) rotate(0deg)' }, { transform: 'translateY(30%) rotate(-20deg)' }, { transform: 'translateY(-40%) rotate(10deg)' }, { transform: 'translateY(0)' }], 600);
          var yum = function () {
            faceSwap(b, util.pick(FACES), 1500);
            burstAt(b.chef, { emoji: '💕', count: 5, distance: 40, size: 16 });
            sfx.play('munch'); S.mmm();
          };
          if (hot) { burstAt(b.obj, { emoji: '💨', count: 4, distance: 40, size: 16 }); S.fuu(); ctx.after(350, yum); }
          else if (cold) { faceSwap(b, '🥶', 500); fx.shake(b.chef); S.brr(); ctx.after(500, yum); }
          else yum();
          b.munchAt = ctx.time;
          finish(b);
        },
        blow: function (b) {
          var c = b.parts.candles[b.k];
          if (c) c.classList.add('is-out');
          burstAt(b.chef, { emoji: '💨', count: 3, distance: 36, size: 16 });
          if (vessel.candles) { vessel.candles[b.side * 3 + b.k] = false; renderVessel(); }
          sfx.scale(2 + 2 * b.k);
          b.k++;
          ctx.say(b.k);
          if (b.k >= b.n) sfx.play('good');
        },
      };

      function countAloud(k) { sfx.scale(k + 1); ctx.say(k); }

      function crackLine(b) {
        b.obj.style.setProperty('--crack', String(Math.min(1, b.k / Math.max(1, b.n - 1))));
        b.obj.classList.add('is-cracked');
        S.krk();
        fx.shake(b.parts.egg);
      }

      /** The egg opens: a yolk drops in the bowl (two, sometimes!) — or, now and then, a chick hops out instead. */
      function openEgg(b) {
        if (b.done || state !== 'beat') return;
        var chick = !b.replaced && !chickThisRound && kit.done >= 1 && kit.chicks < 3 && roll('chick', 1 / 6);
        b.obj.classList.add('is-open');
        b.obj.dataset.k = String(b.k);
        if (chick) {
          chickThisRound = true;
          kit.chicks++;
          save();
          var c = el('span', { class: 'kt-chick' }, ctx.sticker('🐣'));
          b.obj.appendChild(c);
          S.peep(); sfx.play('giggle');
          b.k = 0;
          b.busyUntil = ctx.time + 1.5;
          later(450, function () {
            buildShelf(); fit();
            var spots = wallEl.querySelectorAll('.kt-item--chick');
            fly('🐣', c, spots[spots.length - 1] || wallEl, { ms: 450 });
            c.classList.add('is-gone');
          });
          later(600, function () {
            // a fresh egg rolls in (it never surprises)
            b.replaced = true;
            b.obj.classList.remove('is-open', 'is-cracked');
            b.obj.style.setProperty('--crack', '0');
            b.obj.dataset.k = '0';
            b.parts.yolks.textContent = '';
            anim(b.parts.egg, [{ transform: 'translateX(' + (b.side ? 120 : -120) + '%) rotate(' + (b.side ? 300 : -300) + 'deg)' }, { transform: 'translateX(0) rotate(0deg)' }], 450, { replace: true });
            sfx.play('roll');
          });
          return;
        }
        var two = roll('double', 1 / 6);
        b.parts.yolks.appendChild(el('span', { class: 'kt-yolk' }));
        if (two) b.parts.yolks.appendChild(el('span', { class: 'kt-yolk' }));
        sfx.play('drop');
        sfx.play('good');
        finish(b);
      }

      /* ---- the wall: vessel, pips, shelf. Taps there only ever cheer. ---- */

      function onWall(ev) {
        lastHinted = null;
        var t = ev.target && ev.target.closest ? ev.target : wallEl;
        if (ctx.time - wallAt < 0.15) { squash(t.closest('.kt-item, .kt-pip') || vesselEl); return; }   // (never silent: a squash)
        wallAt = ctx.time;
        var item = t.closest('.kt-item');
        if (item) {
          fx.bounce(item);
          var k = item.dataset.kind;
          if (k === 'cat') S.meow(); else if (k === 'hen') S.cluck(); else if (k === 'chick') S.peep(); else if (k === 'radio') sfx.scale(util.rand(8) + 3); else sfx.play('pop');
          return;
        }
        var pip = t.closest('.kt-pip');
        if (pip) { fx.wiggle(pip); sfx.play('tick'); return; }
        fx.wiggle(contentsEl);
        sfx.play('pop', { pitch: 600 + 60 * (wallC++ % 8) });
      }

      /* ---- input ---- */

      ctx.tap(menuEl, function (ev, card) {
        lastHinted = null;
        menuTap = ctx.time;
        if (ev.target && ev.target.closest && ev.target.closest('.kt-next')) return;   // (slop never snaps the present onto a card)
        pick(card.dataset.id, card);
      }, { delegate: '.kt-card', slop: 24 });
      boards.forEach(function (b) { ctx.tap(b.el, function (ev) { onBoard(b.side, ev); }); });
      ctx.tap(wallEl, onWall);

      function save() {
        try { ctx.save('kitchen', { v: 1, done: kit.done, cooked: kit.cooked, chicks: kit.chicks, seen: kit.seen }); } catch (e) { /* storage may be unavailable */ }
      }

      /* ---- the clocks: cooking, and the quiet ghost hand ---- */

      ctx.every(100, cookTick);
      ctx.every(200, function () {
        if (lastHinted) return;
        if (state === 'menu') { if (ctx.time - menuTap > (kit.done ? 4 : 0.6)) hintNext(); return; }
        if (state !== 'beat') return;
        var s = !boards[aSide].done ? aSide : !boards[bSide].done ? bSide : -1;
        if (s >= 0 && ctx.time - lastTap[s] > idleFor(s)) hintNext();
      });

      /* ---- go ---- */

      buildMenu();
      buildShelf();
      renderTier();
      fit();
      ctx.onResize(fit);
      ctx.setTurn(ctx.firstPlayer, { lock: 0 });      // who chooses: only a suggestion (anyone may tap), and no lock
      save();

      ctx.expose({
        get state() { return state; },
        get recipe() { return recipeId; },
        get beat() { return beatI; },
        get beats() { return beats.map(function (bt) { return { extra: !!bt.extra, serve: bt.serve || null, a: bt.a.do, b: bt.b.do }; }); },
        get boards() { return boards.map(function (b) { return { side: b.side, role: b.side === aSide ? 'a' : 'b', do: b.verb, e: b.job ? b.job.e || null : null, n: b.n, k: b.k, done: b.done, phase: b.phase, heat: b.heat, chosen: b.chosen }; }); },
        get kitchen() { return JSON.parse(JSON.stringify(kit)); },
        get aSide() { return aSide; },
        /** The element the ghost hand last pointed at (tests follow it). */
        get hinted() { return lastHinted; },
        get catSnacks() { return catSnacks; },
        get vessel() { return { kind: vessel.kind, pieces: vessel.added, level: vessel.level, fill: fill, liq: vessel.liq, frost: vessel.frost, mix: vessel.mix }; },
        get locked() { return ctx.locked; },
        get events() { return events.slice(); },
        hintNext: hintNext,
        start: function (id) { pick(id, menuEl.querySelector('.kt-card[data-id="' + id + '"]')); },
        setKitchen: function (raw) {
          if (state !== 'menu') return false;
          kit = cleanKitchen(raw); u = unlocks(kit.done); save();
          buildMenu(); buildShelf(); renderTier(); fit();
          hint(null); menuTap = ctx.time;
          return true;
        },
        /** Fast-forward board s's cooking until it changes phase (golden, or finished by itself). */
        cook: function (s) { var b = boards[s], p = b.phase; for (var i = 0; i < 400 && b.phase === p && !b.done; i++) heatStep(b); return b.phase; },
        /** Force the next surprise roll(s): {chick, double, sneeze, high}. */
        surprise: function (o) { Object.keys(o || {}).forEach(function (k) { if (o[k]) forced[k] = true; else delete forced[k]; }); },
        /** Tests: go straight to beat i of the dish being cooked. */
        jump: function (i) {
          if (state !== 'beat' && state !== 'merge') return false;
          i = Math.max(0, Math.min(beats.length - 1, i));
          for (var j = 0; j < i; j++) if (beats[j].serve) { vessel = newVessel(beats[j].serve); if (vessel.kind === 'cake') vessel.layers = 2; }
          fill = i / beats.length;
          renderVessel();
          startBeat(i);
          return true;
        },
        cleanKitchen: cleanKitchen,
        unlocks: unlocks,
        giftFor: giftFor,
        nFor: nFor,
        beatsFor: beatsFor,
        resultOf: resultOf,
        RECIPES: RECIPES,
        MENU: MENU,
        VERBS: VERBS,
        GIFTS: GIFTS.length,
        tuning: { GAP: GAP, CRACK_GAP: CRACK_GAP, PICK_GAP: PICK_GAP, JAR_GAP: JAR_GAP, COOK_S: COOK_S, LATCH: LATCH, TAPS: TAPS, cookS: [COOK_S[ctx.helpFor(0)], COOK_S[ctx.helpFor(1)]] },
      });

      return function cleanup() { save(); };
    },
  });
})();
