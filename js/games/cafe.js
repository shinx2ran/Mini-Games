/* Yummy-Yucky Cafe — one of you is the Chef and cooks ANYTHING for the other:
 * cheese, strawberries... or a sock and a bug. The Customer takes three bites
 * and has a ridiculous reaction. Then you swap. No right or wrong, no winner.
 *
 * state: dish (Customer picks a plate) -> cook (Chef taps toppings, then the bell)
 *        -> serve (Customer chomps three times) -> react -> dish (roles swapped) ... -> done
 */
(function () {
  'use strict';

  var DISHES = ['🍕', '🥪', '🍦'];
  var YUMMY = ['🧀', '🍅', '🍓', '🍫', '🥒', '🍌', '🍯', '🥕'];
  /* gag: the little scene that plays when the Customer has eaten it. */
  var SILLY = [
    { emoji: '🧦', gag: 'sock' }, { emoji: '🐛', gag: 'wiggle' }, { emoji: '🐟', gag: 'blub' }, { emoji: '🧼', gag: 'bubbles' },
    { emoji: '🌶️', gag: 'fire' }, { emoji: '👟', gag: 'stomp' }, { emoji: '🍋', gag: 'sour' }, { emoji: '🦴', gag: 'woof' },
  ];
  var POLITE = [
    { emoji: '🍋', gag: 'sour' }, { emoji: '🌶️', gag: 'fire' }, { emoji: '❄️', gag: 'brr' },
    { emoji: '🧸', gag: 'cuddle' }, { emoji: '🎈', gag: 'float' }, { emoji: '🌼', gag: 'cuddle' },
  ];

  var MAX_TOPS = 6;
  var BITES = 3;
  var ITEM_GAP = 0.25;   // seconds between counted taps on one ingredient
  var DISHES_PER_ROUND = 2;

  /* ---------------------------------------------------------- pure rules */

  /** How the Customer feels about a dish with this many yucky things on it. */
  function moodFor(yucky) { return yucky === 0 ? 'yum' : yucky === 1 ? 'bleh' : 'green'; }

  /** Eight tray buttons: four yummy, four silly, shuffled. -> [{emoji, yucky, gag}] */
  function drawTray(menu, shuffle) {
    var silly = shuffle(menu === 'polite' ? POLITE : SILLY).slice(0, 4);
    var yummy = shuffle(YUMMY).slice(0, 4).map(function (e) { return { emoji: e, yucky: false, gag: null }; });
    return shuffle(yummy.concat(silly.map(function (s) { return { emoji: s.emoji, yucky: true, gag: s.gag }; })));
  }

  /** Up to two different gags from what was on the dish, in the order it went on. */
  function gagsFor(tops) {
    var out = [];
    tops.forEach(function (t) { if (t.gag && out.indexOf(t.gag) < 0 && out.length < 2) out.push(t.gag); });
    return out;
  }

  MG.registerGame({
    id: 'cafe',
    name: 'Yummy-Yucky Cafe',
    emoji: '🍕',
    color: 'sea',
    howTo: 'The Customer picks a plate. The Chef (in the hat) taps up to six toppings, yummy or yucky, then rings the bell. The Customer taps the food three times to eat it... and reacts! Then swap.',
    options: [
      { key: 'menu', label: 'Menu', default: 'silly', choices: [{ value: 'silly', label: 'Silly' }, { value: 'polite', label: 'Polite' }] },
    ],

    mount: function (root, ctx) {
      var el = ctx.el, sfx = ctx.sfx, fx = ctx.fx, util = ctx.util;
      var players = ctx.players;
      var menu = ctx.opt('menu');

      var state = 'dish';
      var chef = ctx.firstPlayer, customer = 1 - chef;
      var dishNo = 0;
      var dish = null, tops = [], tray = [], bites = 0, mood = null;
      var lastTap = {};

      /* ---- build ---- */

      var seats = players.map(function (p) {
        var bubble = el('span', { class: 'cf-bubble', 'aria-hidden': 'true' });
        var topper = el('span', { class: 'cf-topper', 'aria-hidden': 'true' });
        var node = el('div', { class: 'cf-seat', 'data-p': String(p.index), style: { '--c': p.color, '--c-dark': p.dark, '--c-soft': p.soft } },
          el('span', { class: 'cf-hat', 'aria-hidden': 'true' }), ctx.sticker(p.emoji, 'cf-face'), bubble, topper);
        return { node: node, bubble: bubble, topper: topper };
      });

      var food = el('span', { class: 'cf-food' });
      var topsEl = el('span', { class: 'cf-tops' });
      var dishBtn = el('button', { type: 'button', class: 'cf-dish', 'aria-label': 'The dish', 'aria-disabled': 'true' }, el('span', { class: 'cf-plate' }), food, topsEl);
      var bell = el('button', { type: 'button', class: 'cf-bell', 'aria-label': 'Ring the bell: serve it', 'aria-disabled': 'true' }, ctx.sticker('🛎️'));
      var stage = el('div', { class: 'cf-stage' }, seats[0].node, dishBtn, seats[1].node, bell);
      var trayEl = el('div', { class: 'cf-tray' });
      var scene = el('div', { class: 'cf-scene' }, stage, trayEl);
      root.appendChild(scene);

      /* ---- sounds ---- */

      function plop(n) { sfx.tone({ freq: 260 + n * 45, to: 170 + n * 30, dur: 0.11, type: 'sine', gain: 0.24 }); sfx.noise({ freq: 900, dur: 0.04, q: 1, gain: 0.06 }); }
      function burp() {
        sfx.tone({ freq: 170, to: 75, dur: 0.38, type: 'sawtooth', gain: 0.08, attack: 0.03 });
        sfx.tone({ freq: 110, to: 60, dur: 0.3, type: 'sine', gain: 0.2, delay: 0.04 });
      }

      /* ---- view ---- */

      function showStatus() {
        ctx.setStatus(el('span', { class: 'cf-served', 'aria-label': dishNo + ' dishes served' }, util.range(dishNo).map(function () { return '🍽️'; }).join('')));
      }

      function setRoles() {
        seats.forEach(function (s, i) {
          s.node.classList.toggle('is-chef', i === chef);
          s.node.classList.toggle('is-customer', i === customer);
          s.node.classList.remove('is-eating', 'is-green', 'is-wobbly');
          s.bubble.textContent = '';
          s.bubble.classList.remove('is-on');
        });
        scene.dataset.customer = String(customer);
      }

      function say(seat, emoji) {
        seat.bubble.textContent = emoji;
        seat.bubble.classList.remove('is-on');
        void seat.bubble.offsetWidth;
        seat.bubble.classList.add('is-on');
      }

      function fillTray(nodes, kind) {
        trayEl.textContent = '';
        trayEl.dataset.kind = kind;
        nodes.forEach(function (n) { trayEl.appendChild(n); });
      }

      /* ---- step 1: the Customer chooses a plate ---- */

      function startDish() {
        state = 'dish';
        dish = null; tops = []; bites = 0; mood = null; lastTap = {};
        setRoles();
        food.textContent = '';
        topsEl.textContent = '';
        dishBtn.className = 'cf-dish';
        dishBtn.setAttribute('aria-disabled', 'true');
        bell.classList.remove('is-ready');
        bell.setAttribute('aria-disabled', 'true');
        scene.dataset.state = 'dish';
        var picks = DISHES.map(function (d, k) {
          return el('button', { type: 'button', class: 'cf-pick', 'aria-label': 'Dish ' + (k + 1), data: { k: k }, style: { '--i': k } }, ctx.sticker(d));
        });
        fillTray(picks, 'plates');
        ctx.setTurn(customer);
        ctx.hint(picks[1], { delay: dishNo === 0 ? 500 : 3500 });
      }

      function pickDish(k) {
        if (state !== 'dish') return;
        state = 'plating';
        dish = DISHES[k];
        food.appendChild(ctx.sticker(dish));
        dishBtn.classList.add('is-plated');
        sfx.play('pop');
        ctx.after(450, startCook);
      }

      /* ---- step 2: the Chef cooks ---- */

      function startCook() {
        state = 'cook';
        scene.dataset.state = 'cook';
        tray = drawTray(menu, util.shuffle);
        var items = tray.map(function (t, k) {
          return el('button', { type: 'button', class: 'cf-item', 'aria-label': 'Topping ' + (k + 1), data: { k: k }, style: { '--i': k } }, ctx.sticker(t.emoji));
        });
        fillTray(items, 'items');
        ctx.setTurn(chef);
        ctx.hint(items[util.rand(items.length)], { delay: dishNo === 0 ? 500 : 3500 });
      }

      function addTop(k, node) {
        if (state !== 'cook') return;
        if (ctx.time - (lastTap[k] == null ? -1 : lastTap[k]) < ITEM_GAP) return;
        lastTap[k] = ctx.time;
        if (tops.length >= MAX_TOPS) {
          // full: the tray shrugs and the bell bounces
          fx.shake(trayEl);
          fx.bounce(bell);
          sfx.play('boop');
          return;
        }
        var t = tray[k];
        var n = tops.length;
        tops.push(t);
        var angle = n * 2.4 + util.randf(-0.3, 0.3), far = 0.1 + 0.2 * ((n * 7) % 5) / 4;
        topsEl.appendChild(el('span', {
          class: 'cf-top', text: t.emoji,
          style: { '--x': (Math.cos(angle) * far).toFixed(3), '--y': (Math.sin(angle) * far * 0.8).toFixed(3), '--r': util.rand(50) - 25 + 'deg' },
        }));
        plop(n);
        fx.pop(node);
        seats[chef].node.classList.add('is-bouncing');
        ctx.after(200, function () { seats[chef].node.classList.remove('is-bouncing'); });
        bell.classList.add('is-ready');
        bell.setAttribute('aria-disabled', 'false');
        if (tops.length === 2 || tops.length === MAX_TOPS) ctx.hint(bell, { delay: tops.length === MAX_TOPS ? 300 : 2500 });
      }

      /* ---- step 3: serve, and three bites ---- */

      function serve() {
        if (state !== 'cook' || !tops.length) return;
        state = 'serving';
        scene.dataset.state = 'serve';
        sfx.play('ding');
        bell.classList.remove('is-ready');
        bell.setAttribute('aria-disabled', 'true');
        fillTray([], 'none');
        dishBtn.classList.add('is-served');
        seats[customer].node.classList.add('is-eating');
        ctx.setTurn(customer);
        ctx.after(600, function () {
          state = 'serve';
          dishBtn.setAttribute('aria-disabled', 'false');
          ctx.hint(dishBtn, { delay: 300 });
        });
      }

      function chomp() {
        if (state !== 'serve') return;
        bites++;
        ctx.lock(260);
        sfx.play('munch');
        dishBtn.dataset.bites = String(bites);
        fx.pop(seats[customer].node);
        var c = fx.centerOf(dishBtn);
        fx.burst(c.x, c.y, { emoji: '✨', count: 4, distance: 50, size: 16 });
        var gone = Math.ceil(tops.length * bites / BITES);
        Array.prototype.forEach.call(topsEl.children, function (n, k) { if (k < gone) n.classList.add('is-eaten'); });
        if (bites >= BITES) {
          state = 'react';
          dishBtn.setAttribute('aria-disabled', 'true');
          ctx.after(350, react);
        }
      }

      /* ---- step 4: the reaction ---- */

      var GAGS = {
        sock: function (cust, cook) { cook.topper.textContent = '🧦'; cook.topper.classList.add('is-on'); sfx.play('boing'); },
        wiggle: function (cust) { say(cust, '🐛'); cust.node.classList.add('is-wobbly'); sfx.play('giggle'); },
        blub: function (cust) { say(cust, '💧'); for (var i = 0; i < 4; i++) sfx.tone({ freq: 300 + i * 90, to: 520 + i * 90, dur: 0.09, type: 'sine', gain: 0.16, delay: i * 0.14 }); },
        bubbles: function (cust) { var c = fx.centerOf(cust.node); fx.burst(c.x, c.y - 20, { color: '#FFFFFF', count: 14, distance: 90, size: 16 }); for (var i = 0; i < 5; i++) sfx.tone({ freq: 700 + i * 160, dur: 0.05, type: 'sine', gain: 0.12, delay: i * 0.1 }); },
        fire: function (cust) { say(cust, '🔥'); sfx.noise({ freq: 500, to: 3200, dur: 0.6, q: 0.8, gain: 0.14 }); },
        stomp: function (cust) { say(cust, '👟'); for (var i = 0; i < 3; i++) sfx.tone({ freq: 120, to: 70, dur: 0.1, type: 'sine', gain: 0.3, delay: i * 0.2 }); },
        sour: function (cust) { say(cust, '😖'); sfx.tone({ freq: 900, to: 1500, dur: 0.3, type: 'sine', gain: 0.1 }); },
        woof: function (cust) { say(cust, '🐶'); for (var i = 0; i < 2; i++) sfx.tone({ freq: 220, to: 160, dur: 0.12, type: 'square', gain: 0.1, delay: i * 0.22 }); },
        brr: function (cust) { say(cust, '🥶'); cust.node.classList.add('is-wobbly'); sfx.seq([88, 86, 88, 86], { step: 0.07, type: 'sine', gain: 0.1 }); },
        cuddle: function (cust) { say(cust, '💕'); sfx.play('good'); },
        float: function (cust) { say(cust, '🎈'); sfx.tone({ freq: 400, to: 900, dur: 0.5, type: 'sine', gain: 0.12 }); },
      };

      function react() {
        var cust = seats[customer], cook = seats[chef];
        var yucky = tops.filter(function (t) { return t.yucky; }).length;
        mood = moodFor(yucky);
        dishBtn.classList.add('is-empty');
        if (mood === 'yum') {
          say(cust, '😋');
          sfx.play('match');
          var c = fx.centerOf(cust.node);
          fx.burst(c.x, c.y, { emoji: '💕', count: 7, distance: 80, size: 22 });
        } else if (mood === 'bleh') {
          say(cust, '🤨');
          ctx.after(450, function () { say(cust, '😝'); sfx.play('boing'); fx.shake(cust.node); });
        } else {
          say(cust, '🤢');
          cust.node.classList.add('is-green', 'is-wobbly');
          sfx.play('slide');
        }
        var gags = gagsFor(tops);
        gags.forEach(function (g, k) { ctx.after(1000 + k * 1100, function () { GAGS[g](cust, cook); }); });
        var end = 1100 + gags.length * 1100;
        ctx.after(end, function () { burp(); fx.pop(cust.node); });
        ctx.after(end + 700, next);
      }

      function next() {
        dishNo++;
        showStatus();
        seats.forEach(function (s) { s.topper.classList.remove('is-on'); });
        if (dishNo >= DISHES_PER_ROUND) {
          state = 'done';
          ctx.setTurn(null);
          scene.dataset.state = 'done';
          ctx.win('team', { delay: 500, emoji: '🍽️' });
          return;
        }
        var was = chef;
        chef = customer;
        customer = was;
        sfx.play('whoosh');
        startDish();
      }

      /* ---- input ---- */

      ctx.tap(trayEl, function (ev, node) {
        var k = +node.dataset.k;
        if (node.classList.contains('cf-pick')) pickDish(k);
        else addTop(k, node);
      }, { delegate: '.cf-pick, .cf-item', slop: 16 });
      ctx.tap(bell, serve);
      ctx.tap(dishBtn, chomp);

      showStatus();
      startDish();

      ctx.expose({
        get state() { return state; },
        get chef() { return chef; },
        get customer() { return customer; },
        get dishNo() { return dishNo; },
        get dish() { return dish; },
        get tops() { return tops.map(function (t) { return t.emoji; }); },
        get tray() { return tray.map(function (t) { return { emoji: t.emoji, yucky: t.yucky }; }); },
        get bites() { return bites; },
        get mood() { return mood; },
        moodFor: moodFor, drawTray: drawTray, gagsFor: gagsFor, MAX_TOPS: MAX_TOPS,
        pools: { yummy: YUMMY, silly: SILLY.map(function (s) { return s.emoji; }), polite: POLITE.map(function (s) { return s.emoji; }) },
        gagNames: Object.keys(GAGS), sillyGags: SILLY.concat(POLITE).map(function (s) { return s.gag; }),
      });

      return function cleanup() { ctx.setStatus(null); };
    },
  });
})();
