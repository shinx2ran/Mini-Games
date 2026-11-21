/* Hide & Peek — one player tucks the hedgehog into a hiding place while the
 * other covers their eyes; the seeker then peeks into places full of silly
 * decoys until the hedgehog jumps out. Then they swap. Every find puts one
 * carrot on the shelf they share; nobody keeps score.
 *
 * One hunt is a walk through `phase`:
 *
 *   cover ─▶ hide ─▶ settle ─▶ seek ◀─▶ peek ─▶ found ─▶ swap ─▶ cover …
 *                                                    └──▶ party (ctx.win)
 *
 * Only `hide` and `seek` take taps; every other phase is a short locked beat.
 */
(function () {
  'use strict';

  var CRITTER = '🦔';
  var CARROT = '🥕';

  /* Hiding places: a fresh handful each hunt, all different silhouettes. */
  var PLACES = ['🌳', '🍄', '⛺', '📦', '🎩', '🎒', '👢', '🐚', '🍯', '🏠'];

  /* What waits in the wrong places. Nothing scary. `gag` names both the
     sound and the little dance (css: .hp-act[data-gag]). */
  var DECOYS = [
    { emoji: '🧦', gag: 'sock' },
    { emoji: '🐸', gag: 'frog' },
    { emoji: '🦆', gag: 'duck' },
    { emoji: '🍌', gag: 'banana' },
    { emoji: '🎈', gag: 'balloon' },
    { emoji: '🥔', gag: 'potato' },
    { emoji: '🐌', gag: 'snail' },
    { emoji: '🐮', gag: 'cow' },
    { emoji: '🐔', gag: 'chicken' },
    { emoji: '💨', gag: 'puff' },
    { emoji: '🦉', gag: 'owl' },
    { emoji: '🤖', gag: 'robot' },
  ];

  /* Now and then a decoy turns up dressed for the occasion. */
  var HATS = ['👑', '🎀', '🌼'];
  var HAT_ODDS = 5; // one decoy in five

  var SEAT_ICON = { ready: '👀', giggle: '🤭' };

  /* Game-time milliseconds. */
  var T = {
    cover: 1300,          // the "cover your eyes" card
    pickLock: 250,        // a whole-hand slap picks one place
    duck: 240,            // the critter ducks out of sight
    settle: 520,          // every place does the same wiggle
    peekLock: 700,        // one place opens per tap
    beat: 230,            // lid lifts ... then the reveal
    again: 280,           // re-tapping an open decoy replays its gag
    carrotAt: 700,        // after the leap, the carrot sets off
    carrotFly: 420,
    afterFind: 1800,      // leap + carrot, then swap or party
    swap: 300,
    giggleCooldown: 2000,
    autoHintFirst: 900,
    autoHintEvery: 3000,
    tease: 700,
    idleNudge: 5000,      // ghost hand comes back if nobody moves (after the tutorial)
  };

  /* Pure rules, also exposed to the tests. */
  var rules = {
    /** Hiding places in a hunt, from the SEEKER's help level (ctx.helpFor). */
    spotsFor: function (seekerHelp) { return seekerHelp >= 2 ? 4 : 6; },
    /** Misses before the real place starts wiggling by itself. Infinity = never. */
    hintAfter: function (seekerHelp) { return seekerHelp >= 2 ? 2 : seekerHelp === 1 ? 3 : Infinity; },
    /** Who hides and who seeks in hunt k (0-based): they take turns. */
    roles: function (firstPlayer, k) {
      var hider = (firstPlayer + k) % 2;
      return { hider: hider, seeker: 1 - hider };
    },
    /** Decoys that cannot be mistaken for either player's animal. */
    decoysFor: function (avatars) {
      return DECOYS.filter(function (d) { return avatars.indexOf(d.emoji) < 0; });
    },
    places: PLACES,
    critter: CRITTER,
  };

  /* ---------------------------------------------------------------- sounds
     Everything soft: sines and triangles, the odd quiet square for a quack. */

  function makeSounds(sfx) {
    var tone = sfx.tone, noise = sfx.noise, seq = sfx.seq;

    var gags = {
      sock: function (g) { // a very small sad trombone
        [311, 294, 277].forEach(function (f, i) {
          tone({ freq: f, to: f * 0.96, dur: i === 2 ? 0.4 : 0.17, type: 'triangle', gain: 0.15 * g, delay: i * 0.17 });
        });
      },
      frog: function (g) { // rib-bit
        tone({ freq: 170, to: 250, dur: 0.09, type: 'sawtooth', gain: 0.07 * g });
        tone({ freq: 190, to: 340, dur: 0.15, type: 'sawtooth', gain: 0.08 * g, delay: 0.12 });
      },
      duck: function (g) { // quack quack
        tone({ freq: 560, to: 400, dur: 0.1, type: 'square', gain: 0.055 * g });
        tone({ freq: 560, to: 380, dur: 0.13, type: 'square', gain: 0.055 * g, delay: 0.17 });
      },
      banana: function (g) { // slide whistle: whoops
        tone({ freq: 420, to: 1250, dur: 0.24, type: 'sine', gain: 0.16 * g });
        tone({ freq: 1250, to: 520, dur: 0.26, type: 'sine', gain: 0.13 * g, delay: 0.24 });
      },
      balloon: function (g) { // a squeaky rise and the softest pip
        tone({ freq: 650, to: 1500, dur: 0.34, type: 'sine', gain: 0.1 * g });
        tone({ freq: 1100, to: 2000, dur: 0.05, type: 'sine', gain: 0.12 * g, delay: 0.42 });
      },
      potato: function (g) { // bonk
        tone({ freq: 170, to: 85, dur: 0.2, type: 'sine', gain: 0.3 * g });
        noise({ freq: 260, dur: 0.07, gain: 0.1 * g, q: 0.8 });
      },
      snail: function (g) { // a snore, then the whistle out
        noise({ freq: 280, to: 620, dur: 0.38, gain: 0.1 * g, q: 2 });
        tone({ freq: 760, to: 520, dur: 0.3, type: 'sine', gain: 0.06 * g, delay: 0.44 });
      },
      cow: function (g) { // moo
        tone({ freq: 150, to: 205, dur: 0.24, type: 'sawtooth', gain: 0.07 * g });
        tone({ freq: 205, to: 140, dur: 0.4, type: 'sawtooth', gain: 0.07 * g, delay: 0.2 });
      },
      chicken: function (g) { // bok bok b'gawk
        [0, 0.11, 0.22].forEach(function (d) {
          tone({ freq: 720, to: 640, dur: 0.05, type: 'square', gain: 0.05 * g, delay: d });
        });
        tone({ freq: 720, to: 1150, dur: 0.16, type: 'square', gain: 0.05 * g, delay: 0.34 });
      },
      puff: function (g) { // toot
        tone({ freq: 120, to: 78, dur: 0.26, type: 'sawtooth', gain: 0.09 * g });
        noise({ freq: 190, to: 120, dur: 0.26, gain: 0.12 * g, q: 3 });
      },
      owl: function (g) { // hoo-hoo
        tone({ freq: 392, dur: 0.2, type: 'sine', gain: 0.2 * g });
        tone({ freq: 330, dur: 0.36, type: 'sine', gain: 0.2 * g, delay: 0.26 });
      },
      robot: function (g) { // beep boop beep
        [[880, 0], [587, 0.1], [988, 0.2]].forEach(function (n) {
          tone({ freq: n[0], dur: 0.08, type: 'square', gain: 0.05 * g, delay: n[1] });
        });
      },
    };

    return {
      gag: function (name, gain) { if (gags[name]) gags[name](gain); },
      /** "Cover your eyes": a falling lullaby, then two paws patting down. */
      hush: function () {
        seq([79, 76, 79, 76, 72], { step: 0.12, type: 'sine', gain: 0.15, delay: 0.25 });
        noise({ freq: 520, dur: 0.05, gain: 0.09, q: 0.8, delay: 0.55 });
        noise({ freq: 430, dur: 0.05, gain: 0.09, q: 0.8, delay: 0.66 });
      },
      /** The critter hops in — quiet on purpose, so ears give nothing away. */
      hopIn: function () {
        tone({ freq: 300, to: 430, dur: 0.08, type: 'triangle', gain: 0.07 });
        tone({ freq: 430, to: 310, dur: 0.1, type: 'triangle', gain: 0.05, delay: 0.09 });
        noise({ freq: 3200, dur: 0.16, gain: 0.025, q: 0.6, delay: 0.05 });
      },
      duck: function () { tone({ freq: 520, to: 240, dur: 0.14, type: 'sine', gain: 0.1 }); },
      /** Every place rustles the same way. */
      settle: function () {
        for (var i = 0; i < 5; i++) noise({ freq: 1400 + i * 260, dur: 0.05, gain: 0.05, q: 2, delay: i * 0.07 });
      },
      /** "Ready or not!" */
      ready: function () {
        seq([79, 76, 79, 84], { step: 0.11, type: 'sine', gain: 0.2 });
        tone({ freq: 2093, dur: 0.4, type: 'sine', gain: 0.05, delay: 0.33 });
      },
      lift: function () {
        noise({ freq: 900, to: 2600, dur: 0.12, gain: 0.1, q: 1.5 });
        tone({ freq: 330, to: 520, dur: 0.11, type: 'triangle', gain: 0.1 });
      },
      /** Peek-a-boo: a squeak up and over, then a climbing arpeggio. */
      found: function () {
        tone({ freq: 700, to: 1350, dur: 0.12, type: 'sine', gain: 0.2 });
        tone({ freq: 1350, to: 900, dur: 0.16, type: 'sine', gain: 0.18, delay: 0.12 });
        seq([72, 76, 79, 84, 88], { step: 0.07, type: 'triangle', gain: 0.2, delay: 0.26 });
      },
      /** Hee-hee-hee from inside a hiding place. */
      giggle: function (gain) {
        for (var i = 0; i < 5; i++) {
          var f = (i % 2 ? 980 : 1120) - i * 30;
          tone({ freq: f, to: f * 1.12, dur: 0.06, type: 'sine', gain: 0.13 * gain, delay: i * 0.085 });
        }
      },
      whee: function () { tone({ freq: 500, to: 1000, dur: 0.3, type: 'sine', gain: 0.08 }); },
      swap: function () { noise({ freq: 600, to: 2200, dur: 0.22, gain: 0.08, q: 0.8 }); },
    };
  }

  /* ------------------------------------------------------------------ game */

  MG.registerGame({
    id: 'hide',
    name: 'Hide & Peek',
    emoji: '🙈',
    color: 'sea',
    howTo: 'One of you covers your eyes. The other taps a hiding place for the hedgehog, then the eyes button. Now peek into places until the hedgehog pops out, and swap. The hider\'s giggle button gives a hint.',
    options: [
      { key: 'hunts', label: 'Hunts', default: 2, choices: [{ value: 2, label: '2' }, { value: 4, label: '4' }] },
    ],

    mount: function (root, ctx) {
      var el = ctx.el, sfx = ctx.sfx, fx = ctx.fx, util = ctx.util;
      var players = ctx.players;
      var hunts = ctx.opt('hunts');
      var calm = !!MG.reducedMotion;
      var snd = makeSounds(sfx);
      var decoyPool = rules.decoysFor([players[0].emoji, players[1].emoji]);

      var phase = 'cover';
      var hunt = 0, hider = 0, seeker = 1;
      var spots = [];        // [{i, node, tile, inside, open, act, gag}]
      var decoyBag = [];
      var picked = -1;       // the hider's choice while hiding
      var secret = -1;       // where the critter is once "ready" is pressed
      var misses = 0, found = 0, giggles = 0, autoHints = 0;
      var giggleReady = false;
      var stopAutoHint = null, stopTease = null;

      /* ---------- scene ---------- */

      function hands() {
        return el('span', { class: 'hp-hands', 'aria-hidden': 'true' }, el('span', { text: '✋' }), el('span', { text: '✋' }));
      }

      var seats = players.map(function (p) {
        var icon = ctx.sticker('', 'hp-seat__icon');
        var node = el('button', {
          type: 'button', class: 'hp-seat', 'data-p': String(p.index), 'data-mode': 'idle',
          'aria-disabled': 'true', 'aria-label': 'Player ' + (p.index + 1),
          style: { '--c': p.color, '--c-dark': p.dark, '--c-soft': p.soft },
        }, ctx.sticker(p.emoji, 'hp-seat__face'), hands(), icon, ctx.sticker(CRITTER, 'hp-seat__pal'));
        return { node: node, icon: icon };
      });

      var board = el('div', { class: 'hp-board' });
      var slots = util.range(hunts).map(function () { return el('span', { class: 'hp-carrot' }, ctx.sticker(CARROT)); });
      var shelf = el('div', { class: 'hp-shelf', 'data-n': String(hunts), 'aria-hidden': 'true' }, slots);
      var wrap = el('div', { class: 'hp' }, seats[0].node, board, shelf, seats[1].node);
      var critter = ctx.sticker(CRITTER, 'hp-critter');
      root.appendChild(wrap);

      /** Restart a one-shot CSS animation that hangs off a class. */
      function replay(node, cls) {
        node.classList.remove(cls);
        void node.offsetWidth;
        node.classList.add(cls);
      }

      function detach(node) { if (node.parentNode) node.parentNode.removeChild(node); }

      function setSeat(i, mode) {
        var s = seats[i], icon = SEAT_ICON[mode];
        s.node.dataset.mode = mode;
        s.node.classList.remove('is-cooling');
        s.node.setAttribute('aria-disabled', icon ? 'false' : 'true');
        if (icon) s.icon.textContent = icon;
      }

      function showStatus() {
        ctx.setStatus(el('span', { style: 'display:inline-flex;flex-wrap:wrap;justify-content:center;gap:2px', 'aria-label': found + ' / ' + hunts },
          util.range(hunts).map(function (k) {
            return el('span', { 'aria-hidden': 'true', text: CARROT, style: k < found ? null : 'opacity:.3;filter:grayscale(1)' });
          })));
      }

      function deal(n) {
        board.className = 'hp-board';
        board.textContent = '';
        wrap.dataset.n = String(n);
        spots = util.sample(PLACES, n).map(function (place, i) {
          var inside = el('span', { class: 'hp-inside' });
          var tile = el('span', { class: 'hp-tile' }, inside, el('span', { class: 'hp-lid' }, ctx.sticker(place)));
          var node = el('button', { type: 'button', class: 'hp-spot', 'aria-label': 'Hiding place ' + (i + 1), data: { i: i }, style: { '--i': i } }, tile);
          board.appendChild(node);
          return { i: i, node: node, tile: tile, inside: inside, open: false, act: null, gag: '' };
        });
        board.classList.add('is-dealing');
      }

      /** First time in each role gets the ghost hand at once; later it is only an idle nudge. */
      function hintDelay(ms) { return ctx.round === 0 && hunt < 2 ? ms : T.idleNudge; }

      /* ---------- cover: "cover your eyes" ---------- */

      function startHunt(k) {
        var r = rules.roles(ctx.firstPlayer, k);
        hunt = k; hider = r.hider; seeker = r.seeker;
        phase = 'cover';
        picked = -1; secret = -1; misses = 0; giggleReady = false;
        decoyBag = util.shuffle(decoyPool);
        deal(rules.spotsFor(ctx.helpFor(seeker)));
        ctx.setTurn(hider);
        ctx.lock(T.cover);
        setSeat(hider, 'holding');
        setSeat(seeker, 'cover');

        var who = players[seeker];
        var card = el('div', { class: 'hp-hush', 'aria-hidden': 'true', style: { '--c': who.color } },
          ctx.sticker(who.emoji), hands(), el('span', { class: 'hp-hush__monkey', text: '🙈' }));
        wrap.appendChild(card);
        snd.hush();
        ctx.after(T.cover - 250, function () { card.classList.add('is-leaving'); });
        ctx.after(T.cover, function () {
          detach(card);
          phase = 'hide';
          ctx.hint(util.pick(spots).node, { delay: hintDelay(0) });
        });
      }

      /* ---------- hide: tap a place, tap another to move, then "ready" ---------- */

      function pick(s) {
        var first = picked < 0;
        if (!first) spots[picked].node.classList.remove('is-picked');
        picked = s.i;
        s.node.classList.add('is-picked');
        s.tile.appendChild(critter);
        replay(critter, 'is-hopping');
        replay(s.node, 'is-tapped');
        snd.hopIn();
        ctx.lock(T.pickLock);
        if (first) setSeat(hider, 'ready');
        ctx.hint(seats[hider].node, { delay: hintDelay(700) });
      }

      function commit() {
        phase = 'settle';
        secret = picked;
        picked = -1;
        ctx.lock(T.duck + T.settle);
        spots[secret].node.classList.remove('is-picked');
        critter.classList.remove('is-hopping');
        critter.classList.add('is-ducking');
        setSeat(hider, 'idle');
        snd.duck();
        ctx.after(T.duck, function () {
          // From here on nothing on screen, and nothing in the DOM, says where it is.
          detach(critter);
          critter.classList.remove('is-ducking');
          board.classList.remove('is-dealing');
          board.classList.add('is-settling');
          snd.settle();
        });
        ctx.after(T.duck + T.settle, startSeek);
      }

      /* ---------- seek: one place opens per tap ---------- */

      function startSeek() {
        board.classList.remove('is-settling');
        phase = 'seek';
        giggleReady = true;
        setSeat(seeker, 'look');
        setSeat(hider, 'giggle');
        ctx.setTurn(seeker, { sound: false });
        snd.ready();
        // Any place, the right one included: the ghost hand must not be a clue.
        ctx.hint(util.pick(spots).node, { delay: hintDelay(500) });
      }

      function peek(s) {
        var hit = s.i === secret;
        phase = 'peek';
        ctx.lock(T.peekLock);
        s.open = true;
        s.node.classList.add('is-open');
        replay(s.node, 'is-tapped');
        snd.lift();
        if (hit) {
          ctx.after(T.beat, function () { leapOut(s); });
          return;
        }
        misses++;
        ctx.after(T.beat, function () {
          showDecoy(s);
          snd.gag(s.gag, 1);
          fx.bounce(seats[hider].node); // the hider's little "not there!"
        });
        ctx.after(T.peekLock, function () {
          phase = 'seek';
          startAutoHint();
        });
      }

      function showDecoy(s) {
        var d = decoyBag.pop();
        s.gag = d.gag;
        s.act = el('span', { class: 'hp-act is-acting', 'data-gag': d.gag },
          ctx.sticker(d.emoji),
          util.rand(HAT_ODDS) === 0 ? el('span', { class: 'hp-hat', text: util.pick(HATS) }) : null);
        s.inside.appendChild(s.act);
        s.node.classList.add('is-shown');
      }

      /** Tapping a decoy that is already out: it does its turn again, nothing else changes. */
      function again(s) {
        ctx.lock(T.again);
        replay(s.act, 'is-acting');
        snd.gag(s.gag, 0.6);
      }

      /* ---------- hints: the hider's giggle button, and quiet help for a little seeker ---------- */

      function tease(gain) {
        var s = spots[secret];
        var note = el('span', { class: 'hp-note', 'aria-hidden': 'true', text: '🎵' });
        if (stopTease) stopTease();
        s.tile.appendChild(note);
        replay(s.node, 'is-teased');
        snd.giggle(gain);
        var cancel = ctx.after(T.tease, stopTease = function () {
          cancel();
          stopTease = null;
          s.node.classList.remove('is-teased');
          detach(note);
        });
      }

      function giggle() {
        var seat = seats[hider].node, h = hunt;
        giggleReady = false;
        giggles++;
        seat.classList.add('is-cooling');
        seat.setAttribute('aria-disabled', 'true');
        tease(1);
        ctx.after(T.giggleCooldown, function () {
          if (hunt !== h || (phase !== 'seek' && phase !== 'peek')) return;
          giggleReady = true;
          seat.classList.remove('is-cooling');
          seat.setAttribute('aria-disabled', 'false');
        });
      }

      function startAutoHint() {
        if (stopAutoHint || misses < rules.hintAfter(ctx.helpFor(seeker))) return;
        var nudge = function () {
          if (phase !== 'seek') return;
          autoHints++;
          tease(0.6);
        };
        var first = ctx.after(T.autoHintFirst, nudge), rest = ctx.every(T.autoHintEvery, nudge);
        stopAutoHint = function () { first(); rest(); stopAutoHint = null; };
      }

      /* ---------- found: the leap, a carrot for the shelf, then swap or party ---------- */

      function leapOut(s) {
        phase = 'found';
        found++;
        giggleReady = false;
        ctx.lock(T.afterFind + T.swap);
        if (stopAutoHint) stopAutoHint();
        if (stopTease) stopTease();
        s.inside.appendChild(ctx.sticker(CRITTER, 'hp-found'));
        s.node.classList.add('is-shown', 'is-found');
        setSeat(0, 'cheer');
        setSeat(1, 'cheer');
        snd.found();
        var c = fx.centerOf(s.tile);
        fx.burst(c.x, c.y, { count: 16, distance: 100 });
        ctx.after(T.carrotAt, function () { giveCarrot(s); });
        ctx.after(T.afterFind, found >= hunts ? party : swap);
      }

      function giveCarrot(s) {
        var slot = slots[found - 1];
        var land = function () {
          slot.classList.add('is-in');
          sfx.scale(found * 2);
          ctx.say(found);
          showStatus();
          var c = fx.centerOf(slot);
          fx.burst(c.x, c.y, { emoji: '✨', count: 5, distance: 44, size: 16 });
        };
        if (calm) { land(); return; }
        var flyer = ctx.sticker(CARROT, 'hp-flyer');
        fly(flyer, s.tile, slot, T.carrotFly);
        snd.whee();
        ctx.after(T.carrotFly, function () { detach(flyer); land(); });
      }

      /** Decorative arc from one element to another; the caller's ctx timer does the deciding. */
      function fly(node, from, to, ms) {
        var g = root.getBoundingClientRect(), a = fx.centerOf(from), b = fx.centerOf(to);
        var dx = b.x - a.x, dy = b.y - a.y;
        node.style.left = (a.x - g.left) + 'px';
        node.style.top = (a.y - g.top) + 'px';
        root.appendChild(node);
        if (!node.animate) return;
        node.animate([
          { transform: 'translate(-50%, -50%) scale(0.5)' },
          { transform: 'translate(calc(-50% + ' + dx * 0.5 + 'px), calc(-50% + ' + (dy * 0.5 - 60) + 'px)) scale(1.5) rotate(180deg)' },
          { transform: 'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + dy + 'px)) scale(1) rotate(360deg)' },
        ], { duration: ms / (MG.timeScale || 1), easing: 'ease-in-out', fill: 'forwards' });
      }

      function swap() {
        phase = 'swap';
        board.classList.add('is-leaving');
        snd.swap();
        ctx.after(T.swap, function () { startHunt(hunt + 1); });
      }

      /** The last find: every place still shut pops open and the whole garden dances. */
      function party() {
        phase = 'party';
        var shut = spots.filter(function (s) { return !s.open; });
        shut.forEach(function (s, k) {
          ctx.after(120 * k, function () {
            s.open = true;
            s.node.classList.add('is-open');
            showDecoy(s);
            sfx.scale(4 + k);
          });
        });
        ctx.after(120 * shut.length, function () {
          board.classList.add('is-party');
          sfx.play('munch');
        });
        ctx.win('team', { delay: 120 * shut.length + 1100, emoji: CRITTER });
      }

      /* ---------- input ---------- */

      ctx.tap(board, function (ev, node) {
        var s = spots[+node.dataset.i];
        if (!s) return;
        if (phase === 'hide') pick(s);
        else if (phase === 'seek') { if (s.open) again(s); else peek(s); }
      }, { delegate: '.hp-spot', slop: 24 });

      seats.forEach(function (s, i) {
        ctx.tap(s.node, function () {
          if (i !== hider) return;
          if (phase === 'hide' && picked >= 0) commit();
          else if (phase === 'seek' && giggleReady) giggle();
        });
      });

      ctx.expose({
        get phase() { return phase; },
        get hunt() { return hunt; },
        hunts: hunts,
        get hider() { return hider; },
        get seeker() { return seeker; },
        get spots() { return spots.length; },
        get picked() { return picked; },
        /** Where the critter is (-1 until "ready"). Tests only: the DOM never says. */
        get secret() { return secret; },
        get opened() { return spots.filter(function (s) { return s.open; }).map(function (s) { return s.i; }); },
        get misses() { return misses; },
        get found() { return found; },
        get giggles() { return giggles; },
        get giggleReady() { return giggleReady; },
        get autoHints() { return autoHints; },
        get autoHinting() { return !!stopAutoHint; },
        rules: rules,
        decoys: DECOYS,
      });

      showStatus();
      startHunt(0);

      return function cleanup() { ctx.setStatus(null); };
    },
  });
})();
