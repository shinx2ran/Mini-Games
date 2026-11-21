/* Wobble Tower — take turns dropping animal crates from a sliding cloud to
 * build ONE tower together, as high as the star. If it wobbles over, the crash
 * is the party: the crates are counted out loud and the team's best is flagged.
 *
 * No physics engine: the tower is a list of x offsets plus one wobble number.
 * Distances are in crate widths; the cloud swings between -REACH and +REACH.
 *
 * state: aim (cloud sliding, any tap drops) -> fall -> aim ... -> star | topple -> count -> done
 */
(function () {
  'use strict';

  var GOAL = 10;
  var REACH = 1.3;          // how far the cloud swings either side of the middle
  var CRATE_H = 0.62;       // crate height, in crate widths
  var GROUND_H = 0.45;
  var MISS = 0.6;           // further off-centre than this and the crate slides off
  var FALL_MS = 280;
  var NEW_CRATE_LOCK = 700; // a double tap must not drop the other player's crate
  var ANIMALS = ['🐘', '🐻', '🐷', '🐱', '🐸', '🐥', '🐼', '🐨', '🐵', '🦊'];

  /* ---------------------------------------------------------- pure rules */

  /**
   * How a crate lands `d` crate-widths off the centre of the one below.
   * -> {kind: 'perfect' | 'crooked' | 'miss', wobble: change to the 0..100 wobble meter}
   */
  function classify(d, perfectZone) {
    var a = Math.abs(d), zone = perfectZone || 0.15;
    if (a <= zone) return { kind: 'perfect', wobble: -10 };
    if (a <= MISS) return { kind: 'crooked', wobble: Math.round(10 + 25 * (a - zone) / (MISS - zone)) };
    return { kind: 'miss', wobble: 25 };
  }

  /**
   * One edge-to-edge sweep of the cloud, in ms. `help` is the grown-up's
   * setting; `own` is ctx.helpFor(player) (0 for a grown-up).
   */
  function sweepMs(help, own) {
    if (!help) return 1600;
    return own >= 2 ? 3200 : own === 1 ? 2600 : 1300;
  }

  /** Triangle wave: phase 0 -> -1, 1 -> +1, 2 -> -1 ... */
  function swing(phase) {
    var p = ((phase % 2) + 2) % 2;
    return p < 1 ? -1 + 2 * p : 3 - 2 * p;
  }

  /** World height (in crate widths) the camera must show for a tower of n crates. */
  function viewHeight(n) { return GROUND_H + n * CRATE_H + 0.9 + CRATE_H + 0.9; }

  MG.registerGame({
    id: 'tower',
    name: 'Wobble Tower',
    emoji: '📦',
    color: 'grape',
    howTo: 'One team! Take turns: tap anywhere to drop the crate from the cloud. Land it straight and the tower calms down; crooked makes it wobble. Can you reach the star? If it falls over, that is fun too.',

    mount: function (root, ctx) {
      var el = ctx.el, sfx = ctx.sfx, fx = ctx.fx, util = ctx.util;
      var players = ctx.players;

      var state = 'aim';
      var turn = ctx.firstPlayer;
      var crates = [];          // {x, node}: x of each stacked crate, in crate widths from the middle
      var wobble = 0;
      var phase = 0, cloudX = -REACH, lean = 0;
      var rigX = null;
      var best = Math.max(0, Math.min(GOAL, ctx.load('best', 0) | 0));
      var animals = util.shuffle(ANIMALS);
      var dropped = 0;

      /* ---- build ---- */

      var tower = el('div', { class: 'to-tower' });
      var star = el('div', { class: 'to-star', 'aria-hidden': 'true' }, ctx.sticker('⭐'));
      var flag = el('div', { class: 'to-flag', 'aria-hidden': 'true', hidden: best < 1 }, '🚩');
      var hang = el('div', { class: 'to-crate to-crate--hang' });
      var rider = ctx.sticker('', 'to-rider');
      var cloud = el('div', { class: 'to-cloud', 'aria-hidden': 'true' }, el('span', { class: 'to-puff', text: '☁️' }), rider, hang);
      var world = el('div', { class: 'to-world' }, el('div', { class: 'to-ground' }), flag, star, tower, cloud);
      // while the real star is still above the view, a little one at the top says "up there"
      var goal = el('div', { class: 'to-goal', 'aria-hidden': 'true' }, ctx.sticker('⭐'));
      var scene = el('div', { class: 'to-scene' }, world, goal);
      root.appendChild(scene);

      function crateFace(node, p, animal) {
        node.textContent = '';
        node.dataset.p = String(p);
        node.appendChild(ctx.sticker(animal));
      }

      /* ---- camera ---- */

      var cw = 80, scale = 1;
      function frameCamera(heap) {
        var size = ctx.size();
        cw = Math.max(40, Math.min(size.w / (2 * REACH + 1.3), size.h * 0.2));
        var n = crates.length;
        scale = heap
          ? Math.min(1, size.w / ((n * 0.62 + 1.2) * cw))
          : Math.min(1, size.h / (viewHeight(n) * cw));
        var starTop = (GROUND_H + GOAL * CRATE_H + 0.12 + 0.85) * cw * scale;
        scene.classList.toggle('is-far', !heap && starTop > size.h);
        scene.style.setProperty('--cw', cw.toFixed(1) + 'px');
        world.style.transform = 'scale(' + scale.toFixed(4) + ')';
        cloud.style.setProperty('--n', String(n));
        flag.style.setProperty('--n', String(best));
      }
      ctx.onResize(function () { frameCamera(state === 'count' || state === 'done' && scene.classList.contains('is-heap')); });

      /* ---- sounds ---- */

      function thunk(n) {
        sfx.tone({ freq: 110 + n * 22, to: 70 + n * 12, dur: 0.14, type: 'sine', gain: 0.34 });
        sfx.noise({ freq: 400, dur: 0.05, q: 1, gain: 0.1 });
      }
      function creak() { sfx.tone({ freq: 160, to: 120, dur: 0.3, type: 'sawtooth', gain: 0.05, attack: 0.08 }); }
      function boinks(n) {
        for (var k = 0; k < Math.min(n + 2, 8); k++) sfx.tone({ freq: util.randf(180, 420), to: util.randf(380, 760), dur: 0.14, type: 'sine', gain: 0.2, delay: 0.5 + k * 0.11 });
      }

      /* ---- the round ---- */

      function topX() { return crates.length ? crates[crates.length - 1].x : 0; }

      function newCrate() {
        state = 'aim';
        crateFace(hang, turn, animals[dropped % animals.length]);
        rider.textContent = players[turn].emoji;
        hang.hidden = false;
        cloud.dataset.p = String(turn);
        phase = Math.random() < 0.5 ? 0 : 1;
        frameCamera(false);
        ctx.setTurn(turn);
        ctx.lock(NEW_CRATE_LOCK);
      }

      function drop() {
        if (state !== 'aim') return;
        state = 'fall';
        dropped++;
        var p = turn;
        var help = ctx.helpFor(p);
        var x = rigX != null ? rigX : cloudX;
        rigX = null;
        var n = crates.length;
        var d = n ? x - topX() : 0;
        if (n && help >= 2) { d *= 0.6; x = topX() + d; }       // a quiet pull towards the middle
        var hit = n ? classify(d, help >= 2 ? 0.25 : 0.15) : { kind: 'perfect', wobble: 0 };
        if (hit.kind === 'perfect' && n) x = topX();
        if (!n) x = Math.max(-0.5, Math.min(0.5, x));

        var node = el('div', { class: 'to-crate is-falling', style: { '--x': x.toFixed(3), '--k': String(n), '--drop': '1' } });
        crateFace(node, p, animals[(dropped - 1) % animals.length]);
        tower.appendChild(node);
        hang.hidden = true;
        sfx.play('whoosh');

        var t0 = ctx.time;
        var stop = ctx.frame(function () {
          var t = Math.min(1, (ctx.time - t0) * 1000 / FALL_MS);
          node.style.setProperty('--drop', (1 - t * t).toFixed(3));
          if (t >= 1) { stop(); landed(node, x, hit, p); }
        });
      }

      function landed(node, x, hit, p) {
        var n = crates.length;
        node.classList.remove('is-falling');
        wobble = Math.max(0, Math.min(100, wobble + hit.wobble));
        thunk(n);

        if (hit.kind === 'miss') {
          // too far over: it slides off the side and bounces away
          node.style.setProperty('--away', x > topX() ? '1' : '-1');
          node.classList.add('is-sliding');
          sfx.play('boing');
          ctx.after(700, function () { node.remove(); });
        } else {
          crates.push({ x: x, node: node });
          node.classList.add('is-landed');
          lean += x;
          var c = fx.centerOf(node);
          if (hit.kind === 'perfect') { sfx.play('star'); fx.burst(c.x, c.y, { emoji: '✨', count: 6, distance: 60 * scale + 20, size: 18 }); }
          else creak();
        }
        ctx.setStatus(el('span', { style: { whiteSpace: 'nowrap' }, 'aria-label': crates.length + ' crates' }, '📦', String.fromCharCode(215), String(crates.length)));

        if (crates.length >= GOAL) { ctx.after(350, reachStar); return; }
        if (wobble >= 100) { ctx.after(450, topple); return; }
        ctx.after(hit.kind === 'miss' ? 750 : 420, function () {
          turn = 1 - p;
          newCrate();
        });
      }

      function saveBest() {
        if (crates.length > best) { best = crates.length; ctx.save('best', best); }
      }

      function reachStar() {
        state = 'star';
        saveBest();
        ctx.setTurn(null);
        cloud.hidden = true;
        scene.classList.add('is-star');
        wobble = 0;
        sfx.play('boost');
        var c = fx.centerOf(star);
        [0, 280, 560, 840].forEach(function (ms, k) {
          ctx.after(ms, function () {
            fx.burst(c.x + (k % 2 ? 60 : -60) * (k > 1 ? 1.4 : 0.6), c.y + k * 22, { count: 14, distance: 90 });
            sfx.scale(6 + k * 2);
          });
        });
        crates.forEach(function (cr, k) { ctx.after(120 * k, function () { fx.bounce(cr.node); }); });
        ctx.win('team', { delay: 1700, emoji: '⭐' });
      }

      function topple() {
        state = 'topple';
        saveBest();
        ctx.setTurn(null);
        cloud.hidden = true;
        var dir = lean >= 0 ? 1 : -1;
        tower.style.setProperty('--fall', String(dir));
        scene.classList.add('is-toppling');
        sfx.play('slide');
        boinks(crates.length);
        ctx.after(1150, function () {
          // everyone in a giggling heap, then count what we built
          state = 'count';
          scene.classList.remove('is-toppling');
          scene.classList.add('is-heap');
          var n = crates.length;
          crates.forEach(function (cr, k) {
            cr.node.style.setProperty('--x', ((k - (n - 1) / 2) * 0.62).toFixed(3));
            cr.node.style.setProperty('--k', '0');
            cr.node.style.setProperty('--spin', (((k * 47) % 31) - 15) + 'deg');
          });
          tower.style.transform = '';
          frameCamera(true);
          sfx.play('giggle');
          // count them out, never for longer than a couple of seconds
          var beat = Math.min(430, 2400 / n);
          crates.forEach(function (cr, k) {
            ctx.after(700 + k * beat, function () {
              cr.node.classList.add('is-counted');
              fx.pop(cr.node);
              sfx.scale(k + 1);
              // a voice cannot keep up with a fast count: then it just says how many
              if (beat >= 400 || k === n - 1) ctx.say(k + 1);
            });
          });
          ctx.after(700 + n * beat, function () { state = 'done'; });
          ctx.win('team', { delay: 700 + n * beat + 400, emoji: '📦' });
        });
      }

      ctx.frame(function (dt, t) {
        if (state === 'aim') {
          phase += dt * 1000 / sweepMs(ctx.help, ctx.helpFor(turn));
          cloudX = swing(phase) * REACH;
        }
        cloud.style.setProperty('--x', cloudX.toFixed(3));
        if (state === 'aim' || state === 'fall') {
          // with reduced motion the danger still shows: a still lean that grows with the wobble
          var sway = MG.reducedMotion ? (lean >= 0 ? 1 : -1) * (wobble / 100) * 6 : Math.sin(t * 2.3) * (wobble / 100) * 8;
          tower.style.transform = 'rotate(' + sway.toFixed(2) + 'deg)';
        }
      });

      // the whole playmat is the button
      ctx.tap(root, drop);

      /* ---- go ---- */

      ctx.setStatus(el('span', { style: { whiteSpace: 'nowrap' } }, '📦', String.fromCharCode(215), '0'));
      newCrate();
      ctx.hint(scene, { delay: 900 });

      ctx.expose({
        get state() { return state; },
        get turn() { return turn; },
        get crates() { return crates.map(function (c) { return c.x; }); },
        get wobble() { return wobble; },
        get cloudX() { return cloudX; },
        get best() { return best; },
        get scale() { return scale; },
        /** Tests only: the next drop falls at exactly this x (crate widths from the middle). */
        rig: function (x) { rigX = x; },
        classify: classify, sweepMs: sweepMs, swing: swing, viewHeight: viewHeight,
        GOAL: GOAL, REACH: REACH, MISS: MISS,
      });

      return function cleanup() { ctx.setStatus(null); };
    },
  });
})();
