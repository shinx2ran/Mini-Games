/* Wobble Tray — hold the phone flat TOGETHER, like a tray, and tip it to roll
 * the ladybird to each strawberry. One team, nothing to bump into, no clock.
 *
 * Steering is by the tilt sensor where the device has one and allows it, and
 * always by finger too: hold a finger down and the ladybird rolls towards it.
 * With several fingers down she follows the one nearest the strawberry, so a
 * resting thumb never holds her back.
 *
 * Lengths are in "short sides": the tray is W x H with the shorter one = 1.
 * state: ask (tilt or finger?) -> play -> done
 */
(function () {
  'use strict';

  var GOAL = 12;
  var SETTLE_MS = 1500;     // tilt mode: time to lay the phone flat before that pose becomes "flat"
  var RADIUS = 0.1;         // the ladybird: she stops this far from the rim, so all of her stays on the tray
  var ACCEL = 1.7;          // short sides per s^2 at full push
  var FULL_TILT = 16;       // degrees of tip that count as a full push
  var DRAG = 1.6;           // how quickly it slows by itself (per second)
  var REACH = [0.12, 0.14, 0.17]; // how close counts as "got it", by help level

  /* ---------------------------------------------------------- pure rules */

  /** One step of rolling. b: {x, y, vx, vy}; push: {x, y} each -1..1. Walls are soft. */
  function roll(b, push, dt, W, H) {
    b.vx += push.x * ACCEL * dt;
    b.vy += push.y * ACCEL * dt;
    var slow = Math.exp(-DRAG * dt);
    b.vx *= slow;
    b.vy *= slow;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.x < RADIUS) { b.x = RADIUS; b.vx = Math.abs(b.vx) * 0.4; }
    if (b.x > W - RADIUS) { b.x = W - RADIUS; b.vx = -Math.abs(b.vx) * 0.4; }
    if (b.y < RADIUS) { b.y = RADIUS; b.vy = Math.abs(b.vy) * 0.4; }
    if (b.y > H - RADIUS) { b.y = H - RADIUS; b.vy = -Math.abs(b.vy) * 0.4; }
    return b;
  }

  /** Tilt in degrees -> push, each axis -1..1. */
  function pushFromTilt(tilt) {
    return { x: Math.max(-1, Math.min(1, tilt.x / FULL_TILT)), y: Math.max(-1, Math.min(1, tilt.y / FULL_TILT)) };
  }

  /**
   * Fingers -> push: towards a finger, gentler when she is nearly there. With
   * several fingers down she follows the one nearest the strawberry: whoever
   * is pointing at it wins, and a thumb resting on the glass changes nothing.
   */
  function pushFromFingers(b, fingers, berry) {
    if (!fingers.length) return { x: 0, y: 0 };
    var to = fingers[0];
    if (berry) {
      var far = function (f) { return (f.x - berry.x) * (f.x - berry.x) + (f.y - berry.y) * (f.y - berry.y); };
      fingers.forEach(function (f) { if (far(f) < far(to)) to = f; });
    }
    var dx = to.x - b.x, dy = to.y - b.y;
    var d = Math.sqrt(dx * dx + dy * dy);
    if (d < 0.01) return { x: 0, y: 0 };
    var k = Math.min(1, d / 0.25) / d;
    return { x: dx * k, y: dy * k };
  }

  /** A spot for the next strawberry: on the tray, clear of the edge, not right next to the ladybird. */
  function berrySpot(b, W, H, rnd) {
    rnd = rnd || Math.random;
    var m = 0.14, best = null;
    for (var k = 0; k < 12; k++) {
      var s = { x: m + rnd() * (W - 2 * m), y: m + rnd() * (H - 2 * m) };
      var d = Math.sqrt((s.x - b.x) * (s.x - b.x) + (s.y - b.y) * (s.y - b.y));
      if (!best || d > best.d) best = { x: s.x, y: s.y, d: d };
      if (d > 0.6) break;
    }
    return { x: best.x, y: best.y };
  }

  MG.registerGame({
    id: 'tray',
    name: 'Wobble Tray',
    emoji: '🐞',
    color: 'berry',
    howTo: 'One team. Hold the phone flat between you, like a tray, and tip it together to roll the ladybird to each strawberry. A finger always works too: hold it where she should go.',

    mount: function (root, ctx) {
      var el = ctx.el, sfx = ctx.sfx, fx = ctx.fx, util = ctx.util;

      var state = 'ask';
      var mode = 'touch';
      var W = 1, H = 1;
      var ball = { x: 0.5, y: 0.5, vx: 0, vy: 0 };
      var berry = null;
      var eaten = 0;
      var fingers = {};           // pointerId -> {x, y} in short sides
      var settling = false, pinned = 0;
      var reach = REACH[ctx.help] || REACH[1];

      /* ---- build ---- */

      var bug = el('div', { class: 'ty-bug', 'aria-hidden': 'true' }, ctx.sticker('🐞'));
      var fruit = el('div', { class: 'ty-berry', 'aria-hidden': 'true', hidden: true }, ctx.sticker('🍓'));
      var slots = util.range(GOAL).map(function () { return el('span', { class: 'ty-slot' }); });
      var board = el('div', { class: 'ty-board' }, fruit, bug);
      var scene = el('div', { class: 'ty-scene', role: 'application', 'aria-label': 'The tray' }, board,
        el('div', { class: 'ty-row', role: 'img', 'aria-label': 'Strawberries so far' }, slots));
      root.appendChild(scene);

      function measure() {
        var r = board.getBoundingClientRect();
        var short = Math.max(1, Math.min(r.width, r.height));
        var nw = r.width / short, nh = r.height / short;
        // keep things where they are, in proportion, when the screen turns
        if (nw !== W || nh !== H) {
          [ball, berry].forEach(function (o) { if (o) { o.x = o.x / W * nw; o.y = o.y / H * nh; } });
          W = nw; H = nh;
        }
        board.style.setProperty('--short', short.toFixed(1) + 'px');
        draw();
      }

      function draw() {
        bug.style.left = (ball.x / W * 100).toFixed(2) + '%';
        bug.style.top = (ball.y / H * 100).toFixed(2) + '%';
        bug.style.setProperty('--turn', (Math.atan2(ball.vy, ball.vx) * 180 / Math.PI + 90).toFixed(0) + 'deg');
        if (berry) {
          fruit.style.left = (berry.x / W * 100).toFixed(2) + '%';
          fruit.style.top = (berry.y / H * 100).toFixed(2) + '%';
        }
      }

      /* ---- the round ---- */

      function newBerry() {
        berry = berrySpot(ball, W, H);
        fruit.hidden = false;
        fruit.classList.remove('is-in');
        void fruit.offsetWidth;
        fruit.classList.add('is-in');
        draw();
        sfx.play('pop');
      }

      function begin(how) {
        mode = how;
        state = 'play';
        scene.dataset.mode = how;
        if (card.parentNode) card.remove();
        measure();
        ball.x = W / 2; ball.y = H / 2;
        newBerry();
        if (how === 'tilt') {
          // a moment to lay the phone flat between them: THAT pose is "flat", not the one it was tapped in
          settling = true;
          tip.hidden = false;
          ctx.after(SETTLE_MS, function () { ctx.motion.recenter(); settling = false; tip.hidden = true; });
        } else {
          ctx.hint(fruit, { delay: 400 });
        }
      }

      function eat() {
        eaten++;
        slots[eaten - 1].classList.add('is-on');
        slots[eaten - 1].textContent = '🍓';
        sfx.play('munch');
        sfx.scale(eaten + 2);
        ctx.say(eaten);
        var c = fx.centerOf(fruit);
        fx.burst(c.x, c.y, { emoji: '✨', count: 6, distance: 60, size: 18 });
        fx.pop(bug);
        if (eaten >= GOAL) {
          state = 'done';
          fruit.hidden = true;
          berry = null;
          bug.classList.add('is-full');
          ctx.win('team', { delay: 900, emoji: '🍓' });
        } else newBerry();
      }

      ctx.frame(function (dt) {
        if (state !== 'play') return;
        var push = pushFromFingers(ball, Object.keys(fingers).map(function (k) { return fingers[k]; }), berry);
        if (mode === 'tilt' && !settling) {
          var lean = ctx.motion.tilt;
          // tipped right over for a while? Then that is simply how they hold it now: call it flat
          pinned = Math.abs(lean.x) >= 30 || Math.abs(lean.y) >= 30 ? pinned + dt : 0;
          if (pinned > 2) { ctx.motion.recenter(); pinned = 0; lean = ctx.motion.tilt; }
          var tipped = pushFromTilt(lean);
          push = { x: util.clamp(push.x + tipped.x, -1, 1), y: util.clamp(push.y + tipped.y, -1, 1) };
        }
        roll(ball, push, dt, W, H);
        // the tray leans the way she is being pushed, so the cause is visible
        board.style.setProperty('--tx', push.x.toFixed(2));
        board.style.setProperty('--ty', push.y.toFixed(2));
        draw();
        if (berry) {
          var dx = berry.x - ball.x, dy = berry.y - ball.y;
          if (dx * dx + dy * dy < reach * reach) eat();
        }
      });

      /* ---- fingers: they always work, also alongside the tilt sensor ---- */

      function where(ev) {
        var r = board.getBoundingClientRect();
        var short = Math.max(1, Math.min(r.width, r.height));
        return { x: util.clamp((ev.clientX - r.left) / short, 0, W), y: util.clamp((ev.clientY - r.top) / short, 0, H) };
      }
      ctx.tap(scene, function (ev) {
        if (state !== 'play' || ev.pointerId == null) return;
        fingers[ev.pointerId] = where(ev);
      });
      ctx.on(scene, 'pointermove', function (ev) { if (fingers[ev.pointerId]) fingers[ev.pointerId] = where(ev); });
      ['pointerup', 'pointercancel'].forEach(function (type) {
        ctx.on(window, type, function (ev) { delete fingers[ev.pointerId]; });
      });

      /* ---- tilt or finger? (only asked where tilting could work) ---- */

      var tip = el('div', { class: 'ty-tip', 'aria-hidden': 'true', hidden: true, text: '📱' });
      scene.appendChild(tip);
      var card = el('div', { class: 'ty-ask' },
        ctx.ui.button({ emoji: '📱', label: 'Tilt', color: 'sun', class: 'mg-btn--big', onTap: function (ev) {
          if (state !== 'ask') return;
          state = 'asking';
          ev.currentTarget.classList.add('is-waiting');
          ctx.motion.start().then(function (ok) {
            if (!ctx.alive || state !== 'asking') return;
            if (!ok) sfx.play('boop');
            begin(ok ? 'tilt' : 'touch');
          });
        } }),
        // Finger wins at any time, also while the phone is still being asked about its sensor
        ctx.ui.button({ emoji: '👆', label: 'Finger', color: 'sea', class: 'mg-btn--big', onTap: function () { if (state === 'ask' || state === 'asking') begin('touch'); } }));

      ctx.setTurn(null);
      ctx.onResize(measure);
      measure();
      if (ctx.motion.supported) scene.appendChild(card);
      else begin('touch');

      ctx.expose({
        get state() { return state; },
        get mode() { return mode; },
        get eaten() { return eaten; },
        get ball() { return { x: ball.x, y: ball.y }; },
        get berry() { return berry ? { x: berry.x, y: berry.y } : null; },
        get size() { return { W: W, H: H }; },
        get fingers() { return Object.keys(fingers).length; },
        get settling() { return settling; },
        GOAL: GOAL, RADIUS: RADIUS,
        roll: roll, pushFromTilt: pushFromTilt, pushFromFingers: pushFromFingers, berrySpot: berrySpot,
      });
    },
  });
})();
