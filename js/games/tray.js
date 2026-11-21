/* Wobble Tray — hold the phone flat TOGETHER, like a tray, and tip it to roll
 * the ladybird to each strawberry. One team, nothing to bump into, no clock.
 *
 * Steering is by the tilt sensor where the device has one and allows it, and
 * always by finger too: hold a finger down and the ladybird rolls towards it.
 * With several fingers down she follows the one nearest the strawberry, so a
 * resting thumb never holds her back. With the tilt sensor on, a finger she
 * has already reached has done its job: tilting takes over again until that
 * finger moves.
 *
 * Lengths are in "short sides": the tray is W x H with the shorter one = 1.
 * state: ask (tilt or finger?) -> play -> done
 */
(function () {
  'use strict';

  var GOAL = 12;
  var SETTLE_MS = 1500;     // tilt mode: time to lay the phone flat before that pose becomes "flat"
  var RADIUS = 0.12;        // the ladybird: she stops this far from the rim, so all of her stays on the tray (popping included)
  var MARGIN = 0.14;        // strawberries keep this far from the rim
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
    var m = MARGIN, best = null;
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
      var settling = false, pinned = 0, settleId = 0;
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
          // ...but never onto the rim of the new shape
          ball.x = util.clamp(ball.x, RADIUS, W - RADIUS); ball.y = util.clamp(ball.y, RADIUS, H - RADIUS);
          if (berry) { berry.x = util.clamp(berry.x, MARGIN, W - MARGIN); berry.y = util.clamp(berry.y, MARGIN, H - MARGIN); }
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

      /**
       * Tilt mode: a moment to lay the phone flat between them. THAT pose is
       * "flat", not the one a button was tapped in. Also after every pause.
       */
      function settle() {
        var id = ++settleId;
        settling = true;
        tip.hidden = false;
        ctx.after(SETTLE_MS, function () {
          if (id !== settleId) return;
          ctx.motion.recenter();
          settling = false;
          pinned = 0;
          tip.hidden = true;
        });
      }
      ctx.onResume(function () { if (state === 'play' && mode === 'tilt') settle(); });

      function begin(how) {
        mode = how;
        state = 'play';
        scene.dataset.mode = how;
        if (card.parentNode) card.remove();
        measure();
        ball.x = W / 2; ball.y = H / 2;
        newBerry();
        if (how === 'tilt') {
          settle();
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
        var down = Object.keys(fingers).map(function (k) { return fingers[k]; });
        // a finger she has reached has done its job (until it moves again)
        down.forEach(function (f) {
          if (!f.done && (f.x - ball.x) * (f.x - ball.x) + (f.y - ball.y) * (f.y - ball.y) < 0.05 * 0.05) f.done = { x: f.x, y: f.y };
        });
        var push = pushFromFingers(ball, down, berry);
        if (mode === 'tilt' && !settling) {
          // a finger that is still taking her somewhere has the last word; a thumb just resting where she already is does not
          var steering = down.filter(function (f) { return !f.done; });
          if (steering.length) {
            push = pushFromFingers(ball, steering, berry);
            pinned = 0;
          } else {
            var lean = ctx.motion.tilt;
            var tipped = pushFromTilt(lean);
            // Tipped right over, or holding her against the rim and going nowhere, for two seconds? That is not
            // steering: it is simply how they are holding it now. Call that pose flat. (Rolling ALONG the rim is steering.)
            var over = Math.abs(lean.x) >= 30 || Math.abs(lean.y) >= 30;
            var still = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy) < 0.06;
            var jammed = still && ((tipped.x <= -1 && ball.x <= RADIUS + 0.002) || (tipped.x >= 1 && ball.x >= W - RADIUS - 0.002) ||
              (tipped.y <= -1 && ball.y <= RADIUS + 0.002) || (tipped.y >= 1 && ball.y >= H - RADIUS - 0.002));
            pinned = over || jammed ? pinned + dt : 0;
            if (pinned > 2) { ctx.motion.recenter(); pinned = 0; tipped = { x: 0, y: 0 }; }
            push = tipped;
          }
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
        // (a finger on the rim, or beside the tray, means "as far as she can go that way")
        return { x: util.clamp((ev.clientX - r.left) / short, RADIUS, W - RADIUS), y: util.clamp((ev.clientY - r.top) / short, RADIUS, H - RADIUS) };
      }
      ctx.tap(scene, function (ev) {
        if (state !== 'play' || ev.pointerId == null) return;
        fingers[ev.pointerId] = where(ev);
      });
      ctx.on(scene, 'pointermove', function (ev) {
        var f = fingers[ev.pointerId];
        if (!f) return;
        var p = where(ev);
        f.x = p.x; f.y = p.y;
        // a finger she had reached that moves on is pointing somewhere new: it steers again
        if (f.done && (p.x - f.done.x) * (p.x - f.done.x) + (p.y - f.done.y) * (p.y - f.done.y) > 0.06 * 0.06) f.done = null;
      });
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
        get steering() { return Object.keys(fingers).filter(function (k) { return !fingers[k].done; }).length; },
        get settling() { return settling; },
        GOAL: GOAL, RADIUS: RADIUS, MARGIN: MARGIN,
        roll: roll, pushFromTilt: pushFromTilt, pushFromFingers: pushFromFingers, berrySpot: berrySpot,
      });
    },
  });
})();
