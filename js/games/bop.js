/* Balloon Bop — keep the balloon in the air TOGETHER. When it floats over
 * your side and has stopped rising, your side lights up: tap anywhere on it to
 * bop the balloon across to the other player. Every pass lights a dot on the
 * ladder up the middle; fill it and the balloons burst into a party.
 * If a balloon lands, it lets out a silly raspberry and a new one puffs up:
 * nothing is lost.
 *
 * Positions are fractions of the play area (x right, y down). Each player may
 * only bop a balloon that is over their own half, so it takes both of them.
 */
(function () {
  'use strict';

  var GOAL = 24;              // passes to fill the ladder: about 45 seconds of rallying
  var SECOND_AT = 10;         // a second balloon joins after this many passes
  var GRAVITY = 0.3;          // per s^2: a bit over two seconds from the top to the ground
  var FLOOR = 0.84;           // where a balloon touches down
  var CEILING = 0.12;         // highest a balloon's middle may go (raised for big balloons on short screens)
  var BOP_UP = -0.5;
  var COOLDOWN = 0.9;         // seconds before the same balloon can be bopped again
  var RISING = -0.08;         // still going up faster than this: not yours to bop yet
  var COLORS = ['berry', 'sun', 'sea', 'leaf', 'grape', 'tangerine'];

  /* ---------------------------------------------------------- pure rules */

  /** Whose half a balloon at x is over: 0 (left) or 1 (right). */
  function sideOf(x) { return x < 0.5 ? 0 : 1; }

  /** How fast a balloon falls over player i's half: floatier for a little player who gets help. */
  function gravityFor(help) { return GRAVITY * [1, 0.7, 0.5][help || 0]; }

  /** May the player on `side` bop balloon b right now? Over their half, rested, and no longer shooting upwards. */
  function canBop(b, side, now) {
    return sideOf(b.x) === side && now >= b.cool && b.vy > RISING;
  }

  /** One step of flight. Mutates and returns b: {x, y, vx, vy}. Walls and ceiling are soft. */
  function fly(b, dt, g, top) {
    top = top == null ? CEILING : top;
    b.vy += g * dt;
    b.vx *= Math.pow(0.6, dt); // sideways drift dies away, so it hangs over a half
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.x < 0.1) { b.x = 0.1; b.vx = Math.abs(b.vx) * 0.6; }
    if (b.x > 0.9) { b.x = 0.9; b.vx = -Math.abs(b.vx) * 0.6; }
    if (b.y < top) { b.y = top; b.vy = Math.abs(b.vy) * 0.3; }
    return b;
  }

  /** The push a bop from player i gives: up, and across to the other half. */
  function bopVelocity(i, rnd) {
    var r = rnd == null ? Math.random() : rnd;
    return { vx: (i === 0 ? 1 : -1) * (0.26 + r * 0.12), vy: BOP_UP - r * 0.08 };
  }

  MG.registerGame({
    id: 'bop',
    name: 'Balloon Bop',
    emoji: '🎈',
    color: 'tangerine',
    howTo: 'Keep it up together! When the balloon floats over your side, your side lights up: tap anywhere on it to bop the balloon across. Fill the ladder of dots in the middle. If it lands, it just makes a rude noise and a new one puffs up.',

    mount: function (root, ctx) {
      var el = ctx.el, sfx = ctx.sfx, fx = ctx.fx, util = ctx.util;
      var players = ctx.players;

      var state = 'play';
      var passes = 0, bops = 0, landings = 0;
      var balloons = [];
      var tutorial = [true, true];
      var colorAt = util.rand(COLORS.length);

      /* ---- build ---- */

      var sides = players.map(function (p) {
        var hand = el('span', { class: 'bp-hand', 'aria-hidden': 'true', text: '👆' });
        var who = el('div', { class: 'bp-who' }, ctx.sticker(p.emoji));
        var pad = el('button', {
          type: 'button', class: 'bp-pad', 'data-p': String(p.index), 'aria-label': 'Bop, player ' + (p.index + 1),
          style: { '--c': p.color, '--c-dark': p.dark, '--c-soft': p.soft },
        }, who, hand);
        return { pad: pad, who: who, hand: hand };
      });
      var dots = util.range(GOAL).map(function () { return el('span', { class: 'bp-dot' }); });
      var sky = el('div', { class: 'bp-sky', 'aria-hidden': 'true' });
      var scene = el('div', { class: 'bp-scene' }, sides[0].pad, sides[1].pad,
        el('div', { class: 'bp-ladder', role: 'img', 'aria-label': 'Passes so far' }, dots), sky);
      root.appendChild(scene);

      // The balloon's size is set here (not in the stylesheet) because the ceiling depends on it:
      // a balloon at the top of its flight must still be whole, on the shortest screen too.
      var ceiling = CEILING;
      function measure() {
        var s = ctx.size();
        var wide = s.w >= s.h;
        var size = util.clamp(Math.min(s.w, s.h) * (wide ? 0.24 : 0.3), 84, wide ? 150 : 190);
        scene.style.setProperty('--size', size.toFixed(1) + 'px');
        ceiling = Math.max(CEILING, (size * 0.62 + 10) / s.h);
      }
      measure();
      ctx.onResize(measure);

      /* ---- sounds ---- */

      function raspberry() {
        sfx.tone({ freq: 190, to: 70, dur: 0.5, type: 'sawtooth', gain: 0.09, attack: 0.02 });
        for (var i = 0; i < 6; i++) sfx.noise({ freq: 240, dur: 0.04, q: 2, gain: 0.08, delay: i * 0.07 });
      }
      function puffUp() { sfx.tone({ freq: 240, to: 620, dur: 0.35, type: 'sine', gain: 0.14 }); }

      /* ---- balloons ---- */

      function addBalloon(x) {
        var color = COLORS[colorAt++ % COLORS.length];
        var node = el('div', { class: 'bp-balloon', style: { '--b': 'var(--' + color + ')', '--b-dark': 'var(--' + color + '-dark)' } },
          el('span', { class: 'bp-body' }, el('span', { class: 'bp-face' })), el('span', { class: 'bp-string' }));
        sky.appendChild(node);
        var b = { x: x, y: 0.3, vx: 0, vy: -0.05, cool: 0, node: node, from: -1, alive: true, grounded: false };
        balloons.push(b);
        draw(b);
        puffUp();
        return b;
      }

      function draw(b) {
        b.node.style.left = (b.x * 100).toFixed(2) + '%';
        b.node.style.top = (b.y * 100).toFixed(2) + '%';
        b.node.style.setProperty('--lean', (b.vx * 28).toFixed(1) + 'deg');
      }

      function bop(i) {
        var hit = false;
        balloons.forEach(function (b) {
          if (!b.alive || b.grounded || !canBop(b, i, ctx.time)) return;
          hit = true;
          b.cool = ctx.time + COOLDOWN;
          var v = bopVelocity(i);
          b.vx = v.vx;
          b.vy = v.vy;
          bops++;
          // it only counts as a pass when it came from the other player (or is brand new)
          if (b.from !== i) { b.from = i; pass(b); }
          else sfx.play('hop');
          if (b.node.animate && !MG.reducedMotion) {
            b.node.firstChild.animate([{ transform: 'scale(1.18, 0.82)' }, { transform: 'scale(0.94, 1.08)' }, { transform: 'scale(1)' }], { duration: 260, easing: 'ease-out' });
          }
        });
        fx.bounce(sides[i].who);
        if (hit && tutorial[i]) { tutorial[i] = false; sides[i].hand.classList.add('is-done'); }
        return hit;
      }

      function pass(b) {
        if (state !== 'play') return;
        passes++;
        dots[passes - 1].classList.add('is-on');
        sfx.scale(passes);
        var c = fx.centerOf(b.node);
        fx.burst(c.x, c.y, { emoji: '✨', count: 4, distance: 44, size: 16 });
        if (passes === SECOND_AT) ctx.after(500, function () { if (state === 'play') addBalloon(0.5); });
        if (passes >= GOAL) finish();
      }

      /** Touchdown: a rude noise, it whizzes off, and a fresh one puffs up. Nothing is lost. */
      function land(b) {
        b.grounded = true;
        landings++;
        raspberry();
        b.node.classList.add('is-flat');
        b.node.style.setProperty('--dir', b.x < 0.5 ? '1' : '-1');
        var x = b.x;
        ctx.after(750, function () {
          b.alive = false;
          b.node.remove();
          balloons = balloons.filter(function (o) { return o !== b; });
          if (state === 'play') addBalloon(x < 0.5 ? 0.3 : 0.7);
        });
      }

      function finish() {
        state = 'done';
        balloons.filter(function (b) { return b.alive && !b.grounded; }).forEach(function (b, k) {
          ctx.after(200 + k * 220, function () {
            var c = fx.centerOf(b.node);
            sfx.play('pop');
            fx.burst(c.x, c.y, { count: 18, distance: 120 });
            b.node.remove();
            b.alive = false;
          });
        });
        ctx.win('team', { delay: 1100, emoji: '🎈' });
      }

      ctx.frame(function (dt) {
        if (state !== 'play') return;
        balloons.forEach(function (b) {
          if (!b.alive || b.grounded) return;
          var over = sideOf(b.x);
          fly(b, dt, gravityFor(ctx.helpFor(over)), ceiling);
          if (b.y >= FLOOR) { b.y = FLOOR; land(b); }
          draw(b);
        });
        // each half lights up by itself whenever there is a balloon its player can bop right now
        sides.forEach(function (s, i) {
          s.pad.classList.toggle('is-mine', balloons.some(function (b) { return b.alive && !b.grounded && canBop(b, i, ctx.time); }));
        });
      });

      /* ---- input: your whole half is the button ---- */

      sides.forEach(function (s, i) {
        ctx.tap(s.pad, function () {
          if (state !== 'play') return;
          if (!bop(i)) { sfx.play('boop'); fx.wiggle(s.who); }
        });
      });

      ctx.setTurn(null);
      addBalloon(ctx.firstPlayer === 0 ? 0.3 : 0.7);

      ctx.expose({
        get state() { return state; },
        get passes() { return passes; },
        get bops() { return bops; },
        get landings() { return landings; },
        get balloons() { return balloons.filter(function (b) { return b.alive && !b.grounded; }).map(function (b) { return { x: b.x, y: b.y, side: sideOf(b.x), ready: canBop(b, sideOf(b.x), ctx.time), from: b.from }; }); },
        get ceiling() { return ceiling; },
        GOAL: GOAL, SECOND_AT: SECOND_AT, FLOOR: FLOOR,
        sideOf: sideOf, gravityFor: gravityFor, fly: fly, bopVelocity: bopVelocity, canBop: canBop,
      });
    },
  });
})();
