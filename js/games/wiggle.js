/* Wiggle Pop — bubbles float up the screen and you pop them TOGETHER.
 *
 * With the camera: prop the phone up, stand back so it can see you both, and
 * wave, jump and wiggle. You appear behind the bubbles like in a mirror, and
 * moving your hand over a bubble pops it. Without a camera (or if you say no,
 * or in the sandboxed build) you pop them with fingers instead. Touch always
 * works, in both modes.
 *
 * The camera picture never leaves the device: each frame is shrunk to a
 * 48 x 36 grid of grey values, compared with the frame before to see where
 * something moved, and thrown away. Nothing is stored, recorded or sent.
 *
 * state: ask (camera or fingers?) -> play -> done
 */
(function () {
  'use strict';

  var GOAL = 30;
  var MAX_BUBBLES = 5;
  var SPAWN_MS = 850;
  var RISE = 0.11;          // screen heights per second
  var GRID_W = 48, GRID_H = 36;
  var SAMPLE_MS = 90;
  var DIFF = 26;            // change in grey (0-255) that counts as "something moved here"
  var TRIGGER = 0.2;        // share of a bubble's cells that must be moving...
  var HOT = 2;              // ...in this many samples running
  var FLOOD = 0.5;          // when half the picture changes at once, the phone itself moved: ignore
  var TREATS = ['⭐', '🐟', '🍬', '🦋', '🐥', '🌸', '🍭', '🐞'];

  /* ---------------------------------------------------------- pure rules */

  /** Where did the picture change? prev/cur: grey values. -> {mask: 1 where it moved, share: 0..1 of the picture} */
  function motionMask(prev, cur, diff) {
    var n = cur.length, mask = new Uint8Array(n), moved = 0;
    for (var i = 0; i < n; i++) {
      if (Math.abs(cur[i] - prev[i]) > diff) { mask[i] = 1; moved++; }
    }
    return { mask: mask, share: n ? moved / n : 0 };
  }

  /** Share of moving cells inside the ellipse centred (cx, cy) with radii (rx, ry); all 0..1 of the picture. */
  function shareIn(mask, w, h, cx, cy, rx, ry) {
    var x0 = Math.max(0, Math.floor((cx - rx) * w)), x1 = Math.min(w - 1, Math.ceil((cx + rx) * w));
    var y0 = Math.max(0, Math.floor((cy - ry) * h)), y1 = Math.min(h - 1, Math.ceil((cy + ry) * h));
    var cells = 0, moved = 0;
    for (var y = y0; y <= y1; y++) {
      for (var x = x0; x <= x1; x++) {
        var dx = ((x + 0.5) / w - cx) / rx, dy = ((y + 0.5) / h - cy) / ry;
        if (dx * dx + dy * dy > 1) continue;
        cells++;
        if (mask[y * w + x]) moved++;
      }
    }
    return cells ? moved / cells : 0;
  }

  /** The part of a vw x vh video that "object-fit: cover" shows in a sw x sh box. */
  function coverCrop(vw, vh, sw, sh) {
    var scale = Math.max(sw / vw, sh / vh);
    var w = sw / scale, h = sh / scale;
    return { sx: (vw - w) / 2, sy: (vh - h) / 2, sw: w, sh: h };
  }

  MG.registerGame({
    id: 'wiggle',
    name: 'Wiggle Pop',
    emoji: '👋',
    color: 'sun',
    howTo: 'Pop the bubbles together! With the camera: prop the phone up, stand back so it sees you both, and wave at the bubbles. Without it: pop them with your fingers. The camera picture stays on this device; nothing is recorded or sent.',

    mount: function (root, ctx) {
      var el = ctx.el, sfx = ctx.sfx, fx = ctx.fx, util = ctx.util;

      var state = 'ask';
      var mode = 'touch';
      var bubbles = [];
      var popped = 0, byWave = 0, byTouch = 0;
      var prev = null, lastShare = 0, samples = 0;
      var video = null, grid = null, pen = null;

      /* ---- build ---- */

      var fill = el('span', { class: 'wp-fill' });
      var sky = el('div', { class: 'wp-sky' });
      var scene = el('div', { class: 'wp-scene' }, sky,
        el('div', { class: 'wp-meter', role: 'img', 'aria-label': 'Bubbles popped' }, fill, el('span', { class: 'wp-goal', 'aria-hidden': 'true', text: '⭐' })));
      root.appendChild(scene);

      function radii() {
        var s = ctx.size();
        var px = util.clamp(Math.min(s.w, s.h) * 0.12, 40, 84);
        return { px: px, rx: px / s.w, ry: px / s.h };
      }

      /* ---- bubbles ---- */

      function addBubble() {
        var r = radii();
        var x = util.randf(r.rx + 0.03, 1 - r.rx - 0.03);
        var side = x < 0.5 ? 0 : 1;
        var treat = util.pick(TREATS);
        var node = el('button', { type: 'button', class: 'wp-bubble', 'aria-label': 'Bubble', style: { '--c': ctx.players[side].color, '--i': bubbles.length % 3 } },
          el('span', { class: 'wp-orb' }, el('span', { class: 'wp-treat', 'aria-hidden': 'true', text: treat })));
        sky.appendChild(node);
        var b = { x: x, y: 1 + r.ry, x0: x, sway: util.randf(0, 6.28), node: node, hot: 0, born: ctx.time, treat: treat, gone: false };
        bubbles.push(b);
        draw(b);
      }

      function draw(b) {
        b.node.style.left = (b.x * 100).toFixed(2) + '%';
        b.node.style.top = (b.y * 100).toFixed(2) + '%';
      }

      function remove(b) {
        b.gone = true;
        b.node.remove();
        bubbles = bubbles.filter(function (o) { return o !== b; });
      }

      function pop(b, how) {
        if (b.gone || state !== 'play') return;
        var c = fx.centerOf(b.node);
        remove(b);
        popped++;
        if (how === 'wave') byWave++; else byTouch++;
        sfx.play('pop', { pitch: 380 + (popped % 6) * 50 });
        fx.burst(c.x, c.y, { count: 8, distance: 60, colors: ['#FFFFFF', 'var(--sea-soft)', 'var(--sun)'] });
        fx.float(c.x, c.y, b.treat, { size: 34, duration: 800 });
        fill.style.width = Math.min(100, popped / GOAL * 100) + '%';
        if (popped >= GOAL) finish();
      }

      function finish() {
        state = 'done';
        sfx.play('boost');
        bubbles.slice().forEach(function (b, k) {
          ctx.after(120 * k, function () {
            if (b.gone) return;
            var c = fx.centerOf(b.node);
            fx.burst(c.x, c.y, { count: 8, distance: 60 });
            sfx.play('pop');
            remove(b);
          });
        });
        // the round is over: the camera goes off straight away
        ctx.camera.stop();
        if (video) { video.remove(); video = null; }
        scene.dataset.mode = 'touch';
        ctx.win('team', { delay: 1000, emoji: '👋' });
      }

      /* ---- looking for movement (camera mode only) ---- */

      function look() {
        if (state !== 'play' || mode !== 'camera' || !video || video.readyState < 2 || !video.videoWidth) return;
        var s = ctx.size();
        var crop = coverCrop(video.videoWidth, video.videoHeight, s.w, s.h);
        try {
          pen.save();
          pen.translate(GRID_W, 0);
          pen.scale(-1, 1); // mirrored, like the picture on screen
          pen.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, GRID_W, GRID_H);
          pen.restore();
          var px = pen.getImageData(0, 0, GRID_W, GRID_H).data;
        } catch (e) { return; }
        var cur = new Uint8Array(GRID_W * GRID_H);
        for (var i = 0, j = 0; i < cur.length; i++, j += 4) cur[i] = (px[j] * 3 + px[j + 1] * 6 + px[j + 2]) / 10;
        var before = prev;
        prev = cur;
        if (!before) return;
        var m = motionMask(before, cur, DIFF);
        lastShare = m.share;
        samples++;
        if (m.share > FLOOD) { bubbles.forEach(function (b) { b.hot = 0; }); return; }
        var r = radii();
        bubbles.slice().forEach(function (b) {
          if (ctx.time - b.born < 0.6 || b.y > 1) return; // not while it is still arriving
          b.hot = shareIn(m.mask, GRID_W, GRID_H, b.x, b.y, r.rx, r.ry) >= TRIGGER ? b.hot + 1 : 0;
          if (b.hot >= HOT) pop(b, 'wave');
        });
      }

      /* ---- the round ---- */

      function begin(how, cam) {
        mode = how;
        state = 'play';
        scene.dataset.mode = how;
        if (card.parentNode) card.remove();
        if (how === 'camera') {
          video = cam;
          video.className = 'wp-video';
          video.setAttribute('aria-hidden', 'true');
          scene.insertBefore(video, sky);
          grid = document.createElement('canvas');
          grid.width = GRID_W;
          grid.height = GRID_H;
          pen = grid.getContext('2d', { willReadFrequently: true });
          ctx.every(SAMPLE_MS, look);
        }
        addBubble();
        ctx.every(SPAWN_MS, function () { if (state === 'play' && bubbles.length < MAX_BUBBLES) addBubble(); });
        if (how === 'touch') ctx.hint(bubbles[0].node, { delay: 900 });
      }

      ctx.frame(function (dt, t) {
        if (state !== 'play') return;
        var r = radii();
        bubbles.slice().forEach(function (b) {
          b.y -= RISE * dt;
          b.x = util.clamp(b.x0 + Math.sin(t * 1.3 + b.sway) * 0.04, r.rx, 1 - r.rx);
          if (b.y < -r.ry) remove(b); // floated away: no harm done, another is on its way
          else draw(b);
        });
      });

      ctx.tap(scene, function (ev, node) {
        var hit = null;
        bubbles.forEach(function (b) { if (b.node === node) hit = b; });
        if (hit) pop(hit, 'touch');
      }, { delegate: '.wp-bubble', slop: 18 });

      /* ---- camera or fingers? (only asked where a camera could work) ---- */

      var card = el('div', { class: 'wp-ask' },
        ctx.ui.button({ emoji: '📷', label: 'Camera', color: 'sun', class: 'mg-btn--big', onTap: function (ev) {
          if (state !== 'ask') return;
          state = 'asking';
          ev.currentTarget.classList.add('is-waiting');
          ctx.camera.start().then(function (cam) {
            if (!ctx.alive) return;
            // they chose Fingers while the question was still open: a late "yes" must not leave the camera on
            if (state !== 'asking') { if (mode !== 'camera') ctx.camera.stop(); return; }
            if (!cam) sfx.play('boop');
            begin(cam ? 'camera' : 'touch', cam);
          });
        } }),
        // Fingers wins at any time, also while the camera question is still open
        ctx.ui.button({ emoji: '👆', label: 'Fingers', color: 'sea', class: 'mg-btn--big', onTap: function () { if (state === 'ask' || state === 'asking') begin('touch'); } }),
        el('p', { class: 'wp-note', text: 'The camera picture stays on this device. Nothing is recorded or sent.' }));

      // the camera could not be brought back after a pause: carry on with fingers, and show it
      ctx.camera.onLost(function () {
        if (state === 'asking') { sfx.play('boop'); begin('touch'); return; } // lost before the first picture
        if (mode !== 'camera') return;
        mode = 'touch';
        scene.dataset.mode = 'touch';
        if (video) { video.remove(); video = null; }
        sfx.play('boop');
        if (state === 'play' && bubbles.length) ctx.hint(bubbles[0].node, { delay: 300 });
      });

      ctx.setTurn(null);
      if (ctx.camera.supported) scene.appendChild(card);
      else begin('touch');

      ctx.expose({
        get state() { return state; },
        get mode() { return mode; },
        get popped() { return popped; },
        get byWave() { return byWave; },
        get byTouch() { return byTouch; },
        get count() { return bubbles.length; },
        get lastShare() { return lastShare; },
        get samples() { return samples; },
        GOAL: GOAL, MAX_BUBBLES: MAX_BUBBLES, GRID_W: GRID_W, GRID_H: GRID_H, DIFF: DIFF, TRIGGER: TRIGGER,
        motionMask: motionMask, shareIn: shareIn, coverCrop: coverCrop,
      });
    },
  });
})();
