/* Shh! Tiptoe — the playground classic. The wolf is asleep on his cupcakes:
 * both players tap their own side to tiptoe closer. When he stirs (a warning),
 * get ready; when his eyes pop open, FREEZE. Move while he is looking and he
 * huffs you back a step or two. First to the cupcakes wins, and everyone shares.
 *
 * phase: sleep -> stir (a warning; stepping is still safe) -> awake -> yawn -> sleep ...
 * Each hop takes 450ms and taps during a hop are ignored, so adult finger speed
 * is worth nothing; the grown-up simply has further to go and less forgiveness.
 */
(function () {
  'use strict';

  var HOP = 0.45;       // seconds per tiptoe step
  var DIZZY = 0.8;      // seconds a caught player sits out
  var SNORE_MS = 1700;

  /* ---------------------------------------------------------- pure rules */

  /**
   * The quiet handicap. littleIdx: the one little player (or -1 when there
   * are none, or two). -> {len: steps to the cupcakes, grace: seconds after
   * the eyes open in which a late tap is forgiven, back: steps lost when
   * caught, stirMs: length of the warning}
   */
  function setup(help, littleIdx) {
    var even = { len: [12, 12], grace: [0.3, 0.3], back: [1, 1], stirMs: 1000 };
    if (littleIdx < 0 || !help) return even;
    var kid = help >= 2 ? { len: 9, grace: 0.6, back: 1 } : { len: 10, grace: 0.6, back: 1 };
    var big = help >= 2 ? { len: 15, grace: 0.15, back: 2 } : { len: 14, grace: 0.15, back: 2 };
    var a = littleIdx === 0 ? [kid, big] : [big, kid];
    return { len: [a[0].len, a[1].len], grace: [a[0].grace, a[1].grace], back: [a[0].back, a[1].back], stirMs: help >= 2 ? 1400 : 1000 };
  }

  /** What a tap does: 'step', 'ignore' (too soon to count against you) or 'caught'. */
  function judge(phase, sinceAwake, grace) {
    if (phase !== 'awake') return 'step';
    return sinceAwake < grace ? 'ignore' : 'caught';
  }

  MG.registerGame({
    id: 'tiptoe',
    name: 'Shh! Tiptoe',
    emoji: '🐺',
    color: 'leaf',
    howTo: 'The wolf is asleep. Tap your own side to tiptoe to the cupcakes. When he stirs, get ready; when his eyes open, FREEZE! Move while he is looking and he huffs you back. First there wins, and everybody gets a cupcake.',

    mount: function (root, ctx) {
      var el = ctx.el, sfx = ctx.sfx, fx = ctx.fx, util = ctx.util;
      var players = ctx.players;
      var littleIdx = players[0].little !== players[1].little ? (players[0].little ? 0 : 1) : -1;
      var rules = setup(ctx.help, littleIdx);

      var state = 'play';
      var phase = 'sleep';
      var awakeAt = 0;
      var pos = [0, 0];
      var busyUntil = [0, 0], dizzyUntil = [0, 0];
      var caught = [0, 0];
      var held = false;          // tests freeze the wolf's cycle
      var cancelPhase = null;
      var tutorial = [true, true];

      /* ---- build ---- */

      var lanes = players.map(function (p, i) {
        var marks = util.range(rules.len[i]).map(function () { return el('span', { class: 'tt-mark' }); });
        var climber = el('div', { class: 'tt-climber' }, ctx.sticker(p.emoji));
        var hand = el('span', { class: 'tt-hand', 'aria-hidden': 'true', text: '👆' });
        var node = el('button', {
          type: 'button', class: 'tt-lane', 'data-p': String(i), 'aria-label': 'Tiptoe, player ' + (i + 1),
          style: { '--c': p.color, '--c-dark': p.dark, '--c-soft': p.soft, '--pos': '0' },
        }, el('span', { class: 'tt-cake', 'aria-hidden': 'true' }, ctx.sticker('🧁')), el('span', { class: 'tt-marks', 'aria-hidden': 'true' }, marks), climber, hand);
        return { node: node, climber: climber, hand: hand };
      });
      var eyes = el('span', { class: 'tt-eyes', 'aria-hidden': 'true', text: '👀' });
      var zzz = el('span', { class: 'tt-zzz', 'aria-hidden': 'true', text: '💤' });
      var wolf = el('div', { class: 'tt-wolf', role: 'img', 'aria-label': 'The wolf' }, ctx.sticker('🐺'), eyes, zzz);
      var scene = el('div', { class: 'tt-scene', 'data-phase': 'sleep' }, wolf, lanes[0].node, lanes[1].node);
      root.appendChild(scene);

      function place(i) { lanes[i].node.style.setProperty('--pos', (pos[i] / rules.len[i]).toFixed(4)); }

      /* ---- sounds ---- */

      function snore() { sfx.tone({ freq: 110, to: 150, dur: 0.7, type: 'sawtooth', gain: 0.03, attack: 0.3 }); sfx.tone({ freq: 700, to: 520, dur: 0.5, type: 'sine', gain: 0.02, delay: 0.85, attack: 0.2 }); }
      function hm() { sfx.tone({ freq: 220, to: 330, dur: 0.3, type: 'triangle', gain: 0.12, attack: 0.05 }); }
      function boo() { sfx.seq([79, 84], { step: 0.08, type: 'triangle', gain: 0.2 }); }
      function awoo() { sfx.tone({ freq: 330, to: 620, dur: 0.3, type: 'sine', gain: 0.16, attack: 0.05 }); sfx.tone({ freq: 620, to: 300, dur: 0.5, type: 'sine', gain: 0.14, delay: 0.28 }); }
      function yawn() { sfx.tone({ freq: 400, to: 200, dur: 0.45, type: 'sine', gain: 0.1, attack: 0.1 }); }

      /* ---- the wolf's cycle ---- */

      function setPhase(next) {
        phase = next;
        scene.dataset.phase = next;
        if (next === 'awake') awakeAt = ctx.time;
      }

      function schedule(ms, next) {
        if (held) return;
        cancelPhase = ctx.after(ms, next);
      }

      function sleep() {
        if (state !== 'play') return;
        setPhase('sleep');
        // a quiet rubber band: a little player far behind gets a longer nap to catch up in
        var behind = littleIdx >= 0 ? pos[1 - littleIdx] / rules.len[1 - littleIdx] - pos[littleIdx] / rules.len[littleIdx] : 0;
        schedule(util.randf(2500, 4500) + (behind > 0.35 ? 1000 : 0), stir);
      }
      function stir() {
        if (state !== 'play') return;
        setPhase('stir');
        hm();
        fx.wiggle(wolf);
        schedule(rules.stirMs, wake);
      }
      function wake() {
        if (state !== 'play') return;
        setPhase('awake');
        boo();
        fx.pop(wolf);
        schedule(util.randf(1500, 2500), function () {
          if (state !== 'play') return;
          setPhase('yawn');
          yawn();
          schedule(500, sleep);
        });
      }

      /* ---- the players ---- */

      function step(i) {
        pos[i]++;
        busyUntil[i] = ctx.time + HOP;
        place(i);
        sfx.scale(Math.round(pos[i] / rules.len[i] * 10), { gain: 0.14 });
        lanes[i].climber.classList.remove('is-hop');
        void lanes[i].climber.offsetWidth;
        lanes[i].climber.classList.add('is-hop');
        if (tutorial[i]) { tutorial[i] = false; lanes[i].hand.classList.add('is-done'); }
        if (pos[i] >= rules.len[i]) finish(i);
      }

      function catchOut(i) {
        caught[i]++;
        pos[i] = Math.max(0, pos[i] - rules.back[i]);
        dizzyUntil[i] = ctx.time + DIZZY;
        place(i);
        awoo();
        sfx.play('whoosh');
        var c = fx.centerOf(lanes[i].climber);
        fx.burst(c.x, c.y, { emoji: '💨', count: 5, distance: 60, size: 22 });
        lanes[i].climber.classList.add('is-dizzy');
        ctx.after(DIZZY * 1000, function () { lanes[i].climber.classList.remove('is-dizzy'); });
        wolf.style.setProperty('--look', i === 0 ? '-1' : '1');
        fx.shake(wolf);
      }

      function finish(w) {
        state = 'done';
        if (cancelPhase) cancelPhase();
        setPhase('party');
        sfx.play('match');
        var c = fx.centerOf(lanes[w].node.querySelector('.tt-cake'));
        fx.burst(c.x, c.y, { emoji: '🧁', count: 8, distance: 90, size: 24 });
        lanes[w].climber.classList.add('is-champ');
        // the wolf turns out to be friendly: the other one is waved up to share
        ctx.after(500, function () {
          pos[1 - w] = rules.len[1 - w];
          lanes[1 - w].node.classList.add('is-zooming');
          place(1 - w);
          sfx.play('boost');
        });
        ctx.win(w, { delay: 1900, emoji: '🧁' });
      }

      lanes.forEach(function (lane, i) {
        ctx.tap(lane.node, function () {
          if (state !== 'play') return;
          if (ctx.time < busyUntil[i] || ctx.time < dizzyUntil[i]) return;
          var what = judge(phase, ctx.time - awakeAt, rules.grace[i]);
          if (what === 'step') step(i);
          else if (what === 'caught') catchOut(i);
        });
      });

      /* ---- go ---- */

      ctx.setTurn(null);
      place(0); place(1);
      ctx.every(SNORE_MS, function () { if (state === 'play' && phase === 'sleep') snore(); });
      sleep();

      ctx.expose({
        get state() { return state; },
        get phase() { return phase; },
        get pos() { return pos.slice(); },
        get caught() { return caught.slice(); },
        get busy() { return [ctx.time < busyUntil[0] || ctx.time < dizzyUntil[0], ctx.time < busyUntil[1] || ctx.time < dizzyUntil[1]]; },
        rules: rules, littleIdx: littleIdx,
        setup: setup, judge: judge,
        /** Tests only: freeze the wolf in one phase (or pass null to let the cycle run again). */
        hold: function (p) {
          if (cancelPhase) cancelPhase();
          if (p == null) { held = false; sleep(); return; }
          held = true;
          setPhase(p);
        },
      });
    },
  });
})();
