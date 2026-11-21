/* Noodle Slurp — both players tap their own half as fast as they can to slurp
 * one long noodle. Whoever slurps the meatball into their mouth wins the bowl;
 * first to two bowls wins. A hidden step multiplier for the little player lets
 * the grown-up play flat out.
 *
 * state: ready (three lights) -> slurp -> gulp (the funny beat) -> ready ... -> done
 * p is the meatball: -1 = player 0's mouth (left), +1 = player 1's mouth (right).
 */
(function () {
  'use strict';

  var BASE_STEP = 0.035;      // of the half-noodle, per counted tap
  var RATE_GAP = 0.1;         // seconds between counted taps per side: 10 a second, however many fingers
  var GROW_AFTER = 10;        // seconds; then every step grows 5% a second so no bowl stalls
  var GROW_RATE = 0.05;
  var TIMEOUT = 30;           // seconds; then whoever is ahead takes the bowl
  var BOWLS_TO_WIN = 2;
  var HELP = [null, { start: 1.8, lo: 1.0, hi: 3.5 }, { start: 2.6, lo: 1.5, hi: 4.5 }];

  /* ---------------------------------------------------------- pure rules */

  /** Size of one counted tap `elapsed` seconds into a bowl, for a player with multiplier `mult`. */
  function stepSize(elapsed, mult) {
    var grow = 1 + Math.max(0, elapsed - GROW_AFTER) * GROW_RATE;
    return BASE_STEP * (mult || 1) * grow;
  }

  /** May a tap at time `now` count, given the side's last counted tap? */
  function mayCount(last, now) { return now - last >= RATE_GAP - 1e-9; }

  /** The little player's multiplier after a bowl: eases off when she wins, grows when she loses. */
  function nextHelp(h, littleWon, level) {
    var cfg = HELP[level];
    if (!cfg) return 1;
    return Math.max(cfg.lo, Math.min(cfg.hi, h * (littleWon ? 0.9 : 1.2)));
  }

  function startHelp(saved, level) {
    var cfg = HELP[level];
    if (!cfg) return 1;
    return typeof saved === 'number' && isFinite(saved) ? Math.max(cfg.lo, Math.min(cfg.hi, saved)) : cfg.start;
  }

  /** Who takes a bowl that ran out of time (null: dead level, play on). */
  function leader(p) { return p < 0 ? 0 : p > 0 ? 1 : null; }

  /* ---------------------------------------------------------------- game */

  var NOODLE_SVG = (function () {
    var d = 'M-20 10';
    for (var x = -20; x < 240; x += 20) d += ' q5 -9 10 0 t10 0';
    return '<svg viewBox="0 0 200 20" preserveAspectRatio="none" aria-hidden="true"><path class="sl-noodle__edge" d="' + d + '"/><path class="sl-noodle__core" d="' + d + '"/></svg>';
  })();

  MG.registerGame({
    id: 'slurp',
    name: 'Noodle Slurp',
    emoji: '🍜',
    color: 'berry',
    howTo: 'When the third light goes green, both tap your own side as fast as you can to slurp the meatball into your mouth. First to two bowls wins. Any finger, anywhere on your side.',

    mount: function (root, ctx) {
      var el = ctx.el, sfx = ctx.sfx, fx = ctx.fx;
      var players = ctx.players;

      var littleIdx = players[0].little !== players[1].little ? (players[0].little ? 0 : 1) : -1;
      var level = littleIdx >= 0 ? ctx.help : 0;
      var h = startHelp(ctx.load('h' + level, null), level);

      var state = 'ready';
      var p = 0, shown = 0;
      var bowls = [0, 0];
      var last = [-1, -1];
      var counted = [0, 0];
      var t0 = 0, bowl = 0;
      var tutorial = [true, true];

      /* ---- build ---- */

      var sides = players.map(function (pl) {
        var slots = [0, 1].map(function () { return el('span', { class: 'sl-slot', 'aria-hidden': 'true' }); });
        var face = el('div', { class: 'sl-face' }, ctx.sticker(pl.emoji), el('span', { class: 'sl-tash', 'aria-hidden': 'true', text: '〰️' }));
        var hand = el('span', { class: 'sl-hand', 'aria-hidden': 'true', text: '👆' });
        var pad = el('button', {
          type: 'button', class: 'sl-pad', 'data-p': String(pl.index), 'aria-label': 'Slurp pad, player ' + (pl.index + 1),
          style: { '--c': pl.color, '--c-dark': pl.dark, '--c-soft': pl.soft },
        }, el('div', { class: 'sl-wins' }, slots), face, hand);
        return { pad: pad, face: face, slots: slots, hand: hand };
      });

      var lights = [0, 1, 2].map(function () { return el('span', { class: 'sl-light' }); });
      var noodle = el('div', { class: 'sl-noodle', 'aria-hidden': 'true' });
      noodle.innerHTML = NOODLE_SVG;
      var ball = el('div', { class: 'sl-ball', 'aria-hidden': 'true' });
      var scene = el('div', { class: 'sl-scene' },
        sides[0].pad, sides[1].pad,
        el('div', { class: 'sl-bowl', 'aria-hidden': 'true' }, ctx.sticker('🍜')),
        noodle, ball,
        el('div', { class: 'sl-lights', 'aria-hidden': 'true' }, lights));
      root.appendChild(scene);

      /* ---- sounds ---- */

      function slurp(i) {
        var near = Math.max(0, i === 0 ? -p : p);
        var f = (i === 0 ? 440 : 330) * (1 + near * 0.6);
        sfx.tone({ freq: f, to: f * 1.5, dur: 0.07, type: 'sine', gain: 0.16 });
        sfx.noise({ freq: 2600, to: 4200, dur: 0.05, q: 2, gain: 0.04 });
      }
      function gulp() {
        sfx.tone({ freq: 220, to: 80, dur: 0.18, type: 'sine', gain: 0.35 });
        sfx.tone({ freq: 150, to: 70, dur: 0.4, type: 'sawtooth', gain: 0.07, delay: 0.55, attack: 0.03 });
        sfx.tone({ freq: 95, to: 60, dur: 0.3, type: 'sine', gain: 0.18, delay: 0.6 });
      }

      /* ---- view ---- */

      function puff(node, big) {
        if (!node.animate || MG.reducedMotion) return;
        node.animate([{ transform: 'scale(1)' }, { transform: big ? 'scale(1.35, 0.8)' : 'scale(1.14, 0.9)' }, { transform: 'scale(1)' }],
          { duration: big ? 420 : 130, easing: 'ease-out', composite: 'add' });
      }

      function render() {
        scene.style.setProperty('--p', shown.toFixed(4));
      }

      function setLights(n, go) {
        lights.forEach(function (l, k) {
          l.classList.toggle('is-on', k < n);
          l.classList.toggle('is-go', !!go);
        });
      }

      /* ---- the round ---- */

      function startBowl() {
        state = 'ready';
        p = 0;
        last = [-1, -1];
        bowl++;
        scene.dataset.state = 'ready';
        sides.forEach(function (s) { s.face.classList.remove('is-tashed', 'is-full'); });
        setLights(0, false);
        ctx.after(500, function () { setLights(1, false); sfx.play('tick'); sfx.scale(2); });
        ctx.after(1050, function () { setLights(2, false); sfx.play('tick'); sfx.scale(2); });
        ctx.after(1600, function () {
          setLights(3, true);
          sfx.scale(7, { dur: 0.4 });
          state = 'slurp';
          scene.dataset.state = 'slurp';
          t0 = ctx.time;
        });
      }

      function count(i) {
        var now = ctx.time;
        if (!mayCount(last[i], now)) return false;
        last[i] = now;
        counted[i]++;
        p += (i === 0 ? -1 : 1) * stepSize(now - t0, i === littleIdx ? h : 1);
        p = Math.max(-1, Math.min(1, p));
        slurp(i);
        puff(sides[i].face.firstChild, false);
        if (tutorial[i]) { tutorial[i] = false; sides[i].hand.classList.add('is-done'); }
        if (p <= -1) endBowl(0);
        else if (p >= 1) endBowl(1);
        return true;
      }

      function endBowl(w) {
        if (state !== 'slurp') return;
        state = 'gulp';
        scene.dataset.state = 'gulp';
        p = w === 0 ? -1 : 1;
        bowls[w]++;
        setLights(0, false);
        if (level > 0) { h = nextHelp(h, w === littleIdx, level); ctx.save('h' + level, h); }

        var winner = sides[w], other = sides[1 - w];
        gulp();
        winner.face.classList.add('is-full');
        puff(winner.face.firstChild, true);
        ctx.after(250, function () {
          var slot = winner.slots[bowls[w] - 1];
          if (slot) { slot.textContent = '🍜'; slot.classList.add('is-won'); }
          ctx.setScore(w, bowls[w]);
          var c = fx.centerOf(winner.face);
          fx.burst(c.x, c.y, { emoji: '💦', count: 5, distance: 60, size: 20 });
        });
        ctx.after(600, function () {
          // the end of the noodle slaps the other one: a harmless moustache
          other.face.classList.add('is-tashed');
          sfx.play('boing');
          fx.wiggle(other.face);
        });

        if (bowls[w] >= BOWLS_TO_WIN) {
          state = 'done';
          ctx.win(w, { delay: 1700, emoji: '🍜' });
        } else {
          ctx.after(2100, startBowl);
        }
      }

      ctx.frame(function (dt) {
        // ease the meatball towards where the tapping has put it
        shown += (p - shown) * Math.min(1, dt * 14);
        if (Math.abs(p - shown) < 0.0005) shown = p;
        render();
        if (state === 'slurp' && ctx.time - t0 >= TIMEOUT) {
          var w = leader(p);
          if (w != null) endBowl(w);
        }
      });

      /* ---- input: every finger on your half is one slurp ---- */

      sides.forEach(function (s, i) {
        ctx.tap(s.pad, function () {
          if (state !== 'slurp') { puff(s.face.firstChild, false); return; }
          count(i);
        });
      });

      ctx.setScore(0, 0);
      ctx.setScore(1, 0);
      ctx.setTurn(null);
      render();
      startBowl();

      ctx.expose({
        get state() { return state; },
        get p() { return p; },
        get bowls() { return bowls.slice(); },
        get counted() { return counted.slice(); },
        get h() { return h; },
        get bowl() { return bowl; },
        littleIdx: littleIdx, level: level,
        stepSize: stepSize, mayCount: mayCount, nextHelp: nextHelp, startHelp: startHelp, leader: leader,
        BASE_STEP: BASE_STEP, RATE_GAP: RATE_GAP, TIMEOUT: TIMEOUT,
      });
    },
  });
})();
