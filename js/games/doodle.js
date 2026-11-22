/* Squiggle Friends — the game scribbles a random squiggle; you take turns
 * turning it into a creature, with crayons and face stickers. When you have
 * BOTH added something, tap the sparkles: your creature wakes up, blinks,
 * hops about and babbles, then goes to live in your zoo with the others.
 *
 * Drawing is the one place a finger moves while touching: everything else is
 * a tap. Pick a crayon or a sticker; crayons draw, stickers stamp where you
 * tap. The arrow with the other player's face passes the turn; the curly
 * arrow takes back the last thing drawn.
 *
 * The drawing is kept as a list of strokes and stamps in a 1000 x 1000 square,
 * so it redraws crisply at any size and survives the screen turning.
 * state: intro (the squiggle draws itself) -> draw -> alive -> done
 */
(function () {
  'use strict';

  var SIZE = 1000;                 // logical drawing units
  var PEN = 24;                    // crayon width
  var INK = 18;                    // the squiggle's width
  var STAMP = 150;                 // sticker size
  var ZOO = 8;                     // how many friends the zoo keeps
  var CRAYONS = ['ink', 'berry', 'sun', 'leaf', 'sea'];
  var STICKERS = ['👀', '👄', '👃', '🎩', '🎀'];
  var EYES = { '👀': true };

  /* ---------------------------------------------------------- pure rules */

  /** Points along a Catmull-Rom curve through `pts` (arrays [x, y]), `per` samples per span. */
  function spline(pts, per) {
    var out = [];
    for (var i = 0; i < pts.length - 1; i++) {
      var p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      for (var k = 0; k < per; k++) {
        var t = k / per, t2 = t * t, t3 = t2 * t;
        out.push([
          0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
          0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
        ]);
      }
    }
    out.push(pts[pts.length - 1].slice());
    return out;
  }

  /** A random squiggle: a wandering, loopy line in the middle of the page, long enough to make something of. */
  function squiggle(rnd) {
    rnd = rnd || Math.random;
    var best = null;
    for (var tries = 0; tries < 12; tries++) {
      var s = wander(rnd), len = 0;
      for (var i = 1; i < s.length; i++) len += Math.sqrt((s[i][0] - s[i - 1][0]) * (s[i][0] - s[i - 1][0]) + (s[i][1] - s[i - 1][1]) * (s[i][1] - s[i - 1][1]));
      if (!best || len > best.len) best = { s: s, len: len };
      if (len >= 800) break;
    }
    return best.s;
  }

  function wander(rnd) {
    var n = 6 + Math.floor(rnd() * 3);
    var x = 260 + rnd() * 480, y = 260 + rnd() * 480, a = rnd() * Math.PI * 2;
    var pts = [[x, y]];
    for (var i = 1; i < n; i++) {
      a += (rnd() < 0.5 ? -1 : 1) * (0.7 + rnd() * 1.9);
      var step = 170 + rnd() * 150;
      x = Math.max(200, Math.min(800, x + Math.cos(a) * step));
      y = Math.max(200, Math.min(800, y + Math.sin(a) * step));
      pts.push([x, y]);
    }
    return spline(pts, 12).map(function (p) { return [Math.round(p[0]), Math.round(p[1])]; });
  }

  /** Only well-formed zoo friends: anything else in storage (old, damaged) is dropped, never trusted. */
  function cleanZoo(z) {
    if (!Array.isArray(z)) return [];
    var num = function (v) { return typeof v === 'number' && isFinite(v); };
    return z.filter(function (f) {
      return f && typeof f === 'object' && typeof f.img === 'string' && f.img.indexOf('data:image/') === 0 &&
        num(f.w) && num(f.h) && f.w > 0 && f.h > 0 && Array.isArray(f.eyes) &&
        f.eyes.every(function (e) { return e && typeof e.e === 'string' && num(e.x) && num(e.y) && num(e.s); });
    }).slice(-ZOO);
  }

  /** The box around everything drawn: {x0, y0, x1, y1} in drawing units, or null. */
  function bounds(items) {
    var b = null;
    function grow(x0, y0, x1, y1) {
      if (!b) b = { x0: x0, y0: y0, x1: x1, y1: y1 };
      else { b.x0 = Math.min(b.x0, x0); b.y0 = Math.min(b.y0, y0); b.x1 = Math.max(b.x1, x1); b.y1 = Math.max(b.y1, y1); }
    }
    items.forEach(function (it) {
      if (it.kind === 'stroke') it.pts.forEach(function (p) { grow(p[0] - it.w, p[1] - it.w, p[0] + it.w, p[1] + it.w); });
      else grow(it.x - it.s / 2, it.y - it.s / 2, it.x + it.s / 2, it.y + it.s / 2);
    });
    if (b) { b.x0 = Math.max(0, b.x0); b.y0 = Math.max(0, b.y0); b.x1 = Math.min(SIZE, b.x1); b.y1 = Math.min(SIZE, b.y1); }
    return b;
  }

  MG.registerGame({
    id: 'doodle',
    name: 'Squiggle Friends',
    emoji: '🖍️',
    color: 'berry',
    howTo: 'A squiggle appears. Take turns turning it into a creature: pick a crayon and draw, or pick a sticker and tap where it goes. The arrow with the other face passes the turn. When you have both added something, tap the sparkles: your creature wakes up and joins your zoo.',
    options: [
      { key: 'start', label: 'Start with', default: 'squiggle', choices: [{ value: 'squiggle', label: 'Squiggle', emoji: '〰️' }, { value: 'blank', label: 'Blank page', emoji: '📄' }] },
    ],

    mount: function (root, ctx) {
      var el = ctx.el, sfx = ctx.sfx, fx = ctx.fx, util = ctx.util;
      var players = ctx.players;

      var state = 'intro';
      var turn = ctx.firstPlayer;
      var items = [];                       // {kind: 'stroke', color, w, pts, by} | {kind: 'stamp', emoji, x, y, s, by}
      var live = {};                        // pointerId -> stroke being drawn
      var tool = { type: 'pen', color: 'ink' };
      var added = [false, false];
      var zoo = [];
      try { zoo = cleanZoo(ctx.load('zoo', [])); } catch (e) { zoo = []; }
      var cancelNudge = null;
      var lastPass = -1;
      var friend = null, fitFriend = null;   // the woken creature, and how to fit it to the screen

      /* ---- build ---- */

      var canvas = el('canvas', { class: 'dd-canvas' });
      var pen = canvas.getContext('2d');
      var stamps = el('div', { class: 'dd-stamps' });
      var paper = el('div', { class: 'dd-paper', role: 'application', 'aria-label': 'The drawing' }, canvas, stamps);
      var paperBox = el('div', { class: 'dd-paperbox' }, paper);

      var crayonBtns = CRAYONS.map(function (c) {
        return el('button', { type: 'button', class: 'dd-tool dd-crayon', 'data-color': c, 'aria-label': 'Crayon', style: { '--c': colorOf(c) } }, el('span', { class: 'dd-nib' }));
      });
      var stickerBtns = STICKERS.map(function (s) {
        return el('button', { type: 'button', class: 'dd-tool dd-sticker', 'data-emoji': s, 'aria-label': 'Sticker' }, ctx.sticker(s));
      });
      var undoBtn = el('button', { type: 'button', class: 'dd-act dd-undo', 'aria-label': 'Take back' }, el('span', { class: 'dd-act__icon', 'aria-hidden': 'true', text: '↩️' }));
      var passFace = el('span', { class: 'dd-pass__face' });
      var passBtn = el('button', { type: 'button', class: 'dd-act dd-pass', 'aria-label': 'Pass the turn' }, el('span', { class: 'dd-act__icon', 'aria-hidden': 'true', text: '👉' }), passFace);
      var wandBtn = el('button', { type: 'button', class: 'dd-act dd-wand', 'aria-label': 'Wake it up', 'aria-disabled': 'true' }, el('span', { class: 'dd-act__icon', 'aria-hidden': 'true', text: '✨' }));

      var crayons = el('div', { class: 'dd-crayons' }, crayonBtns);
      var stickers = el('div', { class: 'dd-stickers' }, stickerBtns);
      var actions = el('div', { class: 'dd-actions' }, undoBtn, passBtn, wandBtn);
      var party = el('div', { class: 'dd-party', 'aria-hidden': 'true' });
      var scene = el('div', { class: 'dd-scene' }, actions, paperBox, stickers, crayons, party);
      root.appendChild(scene);

      function colorOf(c) { return c === 'ink' ? '#2A2356' : 'var(--' + c + ')'; }
      /** The colour a CSS custom property resolves to (canvas needs real colours). */
      function realColor(c) {
        if (c === 'ink') return '#2A2356';
        var v = getComputedStyle(root).getPropertyValue('--' + c).trim();
        return v || '#2A2356';
      }

      /* ---- the paper ---- */

      var px = 300;     // paper size in CSS px
      function fit() {
        var r = paperBox.getBoundingClientRect();
        if (!r.width || !r.height) return;
        px = Math.max(120, Math.floor(Math.min(r.width, r.height)));
        paper.style.width = px + 'px';
        paper.style.height = px + 'px';
        paper.style.setProperty('--px', px + 'px');
        var dpr = Math.min(2, window.devicePixelRatio || 1);
        canvas.width = Math.round(px * dpr);
        canvas.height = Math.round(px * dpr);
        paint();
      }

      function strokePath(g, it, scale, upto) {
        var pts = it.pts, n = upto == null ? pts.length : Math.min(upto, pts.length);
        if (!n) return;
        g.strokeStyle = realColor(it.color);
        g.fillStyle = g.strokeStyle;
        g.lineWidth = it.w * scale;
        g.lineCap = 'round';
        g.lineJoin = 'round';
        if (n === 1) {
          g.beginPath();
          g.arc(pts[0][0] * scale, pts[0][1] * scale, it.w * scale / 2, 0, Math.PI * 2);
          g.fill();
          return;
        }
        g.beginPath();
        g.moveTo(pts[0][0] * scale, pts[0][1] * scale);
        for (var i = 1; i < n - 1; i++) {
          var mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
          g.quadraticCurveTo(pts[i][0] * scale, pts[i][1] * scale, mx * scale, my * scale);
        }
        g.lineTo(pts[n - 1][0] * scale, pts[n - 1][1] * scale);
        g.stroke();
      }

      var introUpto = null;   // while the squiggle draws itself
      function paint() {
        var s = canvas.width / SIZE;
        pen.clearRect(0, 0, canvas.width, canvas.height);
        items.forEach(function (it, k) {
          if (it.kind !== 'stroke') return;
          strokePath(pen, it, s, k === 0 && introUpto != null ? introUpto : null);
        });
      }

      function addStampNode(it) {
        var n = ctx.sticker(it.emoji, 'dd-stamp');
        n.style.left = (it.x / SIZE * 100) + '%';
        n.style.top = (it.y / SIZE * 100) + '%';
        n.style.setProperty('--s', (it.s / SIZE).toFixed(3));
        stamps.appendChild(n);
        it.node = n;
        return n;
      }

      function at(ev) {
        var r = paper.getBoundingClientRect();
        return [util.clamp(Math.round((ev.clientX - r.left) / r.width * SIZE), 0, SIZE), util.clamp(Math.round((ev.clientY - r.top) / r.height * SIZE), 0, SIZE)];
      }

      /* ---- sounds ---- */

      function scribble() { sfx.noise({ freq: 2200, to: 3200, dur: 0.06, q: 3, gain: 0.05 }); }
      function babble(pitch, n) {
        for (var i = 0; i < n; i++) {
          var f = pitch * (0.85 + Math.random() * 0.5);
          sfx.tone({ freq: f, to: f * (Math.random() < 0.5 ? 1.35 : 0.75), dur: 0.09, type: Math.random() < 0.5 ? 'triangle' : 'sine', gain: 0.14, delay: i * 0.11 });
        }
      }

      /* ---- tools ---- */

      function choose(t) {
        tool = t;
        crayonBtns.forEach(function (b) { b.classList.toggle('is-on', t.type === 'pen' && b.dataset.color === t.color); });
        stickerBtns.forEach(function (b) { b.classList.toggle('is-on', t.type === 'stamp' && b.dataset.emoji === t.emoji); });
        paper.dataset.tool = t.type;
      }

      function contributed() {
        if (added[turn]) return;
        added[turn] = true;
        refresh();
      }

      function refresh() {
        var ready = added[0] && added[1] && state === 'draw';
        wandBtn.setAttribute('aria-disabled', ready ? 'false' : 'true');
        wandBtn.classList.toggle('is-ready', ready);
        undoBtn.setAttribute('aria-disabled', items.some(function (it) { return it.by >= 0; }) && state === 'draw' ? 'false' : 'true');
        passBtn.setAttribute('aria-disabled', state === 'draw' ? 'false' : 'true');
        // once the one drawing has added something and stopped a moment, the pass arrow nudges them
        if (cancelNudge) { cancelNudge(); cancelNudge = null; }
        if (state === 'draw' && added[turn] && !added[1 - turn]) {
          var who = turn;
          cancelNudge = ctx.after(3500, function () { cancelNudge = null; if (state === 'draw' && turn === who && !Object.keys(live).length) ctx.hint(passBtn); });
        } else if (ready) {
          cancelNudge = ctx.after(6000, function () { cancelNudge = null; if (state === 'draw' && !Object.keys(live).length) ctx.hint(wandBtn); });
        }
      }

      function setTurn(p) {
        turn = p;
        ctx.setTurn(p, { lock: 0 }); // passing the crayon is deliberate: the next touch is theirs straight away
        var other = players[1 - p];
        passFace.textContent = '';
        passFace.appendChild(ctx.sticker(other.emoji));
        passBtn.style.setProperty('--c', other.color);
        passBtn.style.setProperty('--c-dark', other.dark);
        paper.style.setProperty('--turn-c', players[p].color);
        refresh();
      }

      /* ---- input ---- */

      ctx.tap(paper, function (ev) {
        if (state === 'intro') endIntro(); // no waiting: a touch during the squiggle finishes it and counts
        if (state !== 'draw') return;
        var p = at(ev);
        if (tool.type === 'stamp') {
          var it = { kind: 'stamp', emoji: tool.emoji, x: p[0], y: p[1], s: STAMP, by: turn };
          items.push(it);
          fx.pop(addStampNode(it));
          sfx.play('pop', { pitch: 500 + Math.random() * 300 });
          contributed();
          return;
        }
        var st = { kind: 'stroke', color: tool.color, w: PEN, pts: [p], by: turn };
        items.push(st);
        if (ev.pointerId != null) live[ev.pointerId] = st;
        paint();
        scribble();
        contributed();
      });
      ctx.on(window, 'pointermove', function (ev) {
        var st = live[ev.pointerId];
        if (!st || state !== 'draw' || ctx.paused) return;
        var p = at(ev), last = st.pts[st.pts.length - 1];
        var dx = p[0] - last[0], dy = p[1] - last[1];
        if (dx * dx + dy * dy < 36) return;
        st.pts.push(p);
        paint();
        if (st.pts.length % 6 === 0) scribble();
      });
      ['pointerup', 'pointercancel'].forEach(function (type) {
        ctx.on(window, type, function (ev) { if (live[ev.pointerId]) { delete live[ev.pointerId]; refresh(); } });
      });

      ctx.tap(crayons, function (ev, b) { choose({ type: 'pen', color: b.dataset.color }); sfx.play('tap'); fx.pop(b); }, { delegate: '.dd-crayon', slop: 12 });
      ctx.tap(stickers, function (ev, b) { choose({ type: 'stamp', emoji: b.dataset.emoji }); sfx.play('pop', { pitch: 700 }); fx.pop(b); }, { delegate: '.dd-sticker', slop: 12 });

      ctx.tap(undoBtn, function () {
        if (state !== 'draw') return;
        for (var k = items.length - 1; k >= 0; k--) {
          if (items[k].by < 0) continue;             // the squiggle stays
          var it = items.splice(k, 1)[0];
          if (it.node) it.node.remove();
          Object.keys(live).forEach(function (id) { if (live[id] === it) delete live[id]; });
          added = [items.some(function (x) { return x.by === 0; }), items.some(function (x) { return x.by === 1; })];
          paint();
          sfx.play('slide');
          refresh();
          return;
        }
      });

      ctx.tap(passBtn, function () {
        if (state !== 'draw') return;
        if (lastPass >= 0 && ctx.time - lastPass < 0.45) return; // two fingers or a double tap still pass it once
        lastPass = ctx.time;
        live = {};
        setTurn(1 - turn);
        fx.bounce(passBtn);
      });

      ctx.tap(wandBtn, function () {
        if (state !== 'draw' || !(added[0] && added[1])) return;
        wake();
      });

      /* ---- it wakes up ---- */

      function wake() {
        state = 'alive';
        live = {};
        if (cancelNudge) { cancelNudge(); cancelNudge = null; }
        ctx.setTurn(null);
        refresh();
        scene.classList.add('is-alive');
        sfx.play('boost');

        var b = bounds(items) || { x0: 300, y0: 300, x1: 700, y1: 700 };
        var pad = 12;
        b = { x0: Math.max(0, b.x0 - pad), y0: Math.max(0, b.y0 - pad), x1: Math.min(SIZE, b.x1 + pad), y1: Math.min(SIZE, b.y1 + pad) };
        var bw = b.x1 - b.x0, bh = b.y1 - b.y0;

        // a picture of it (everything but its eyes, which stay stickers so they can blink)
        var out = 220, k = out / Math.max(bw, bh);
        var pic = document.createElement('canvas');
        pic.width = Math.max(1, Math.round(bw * k));
        pic.height = Math.max(1, Math.round(bh * k));
        var g = pic.getContext('2d');
        g.translate(-b.x0 * k, -b.y0 * k);
        items.forEach(function (it) { if (it.kind === 'stroke') strokePath(g, it, k); });
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        items.forEach(function (it) {
          if (it.kind !== 'stamp' || EYES[it.emoji]) return;
          g.font = Math.round(it.s * k * 0.86) + 'px sans-serif';
          g.fillText(it.emoji, it.x * k, it.y * k);
        });
        var src = '';
        try { src = pic.toDataURL('image/png'); } catch (e) {}

        var eyes = items.filter(function (it) { return it.kind === 'stamp' && EYES[it.emoji]; }).map(function (it) {
          return { e: it.emoji, x: (it.x - b.x0) / bw, y: (it.y - b.y0) / bh, s: it.s / Math.max(bw, bh) };
        });

        // the party comes whatever happens below: nothing can leave the round stuck
        ctx.after(3000, function () {
          if (state !== 'alive') return;
          state = 'done';
          ctx.win('team', { delay: 900, emoji: '🖍️' });
        });

        // the creature takes the drawing's place on the page, then the page slides away
        var pr = paper.getBoundingClientRect(), sr = scene.getBoundingClientRect();
        friend = makeFriend({ img: src, w: bw, h: bh, eyes: eyes }, bw / SIZE * pr.width, bh / SIZE * pr.height, 'dd-friend--new');
        friend.style.left = (pr.left - sr.left + (b.x0 + bw / 2) / SIZE * pr.width) + 'px';
        friend.style.top = (pr.top - sr.top + (b.y0 + bh / 2) / SIZE * pr.height) + 'px';
        party.appendChild(friend);
        /** Big in the middle, but always whole: room for its hop above and its squash to the sides. */
        fitFriend = function () {
          var s2 = scene.getBoundingClientRect();
          var k2 = Math.min(s2.width * 0.7 / bw, s2.height * 0.6 / bh);
          friend.style.left = '50%';
          friend.style.top = '52%';
          friend.style.width = (bw * k2) + 'px';
          friend.style.height = (bh * k2) + 'px';
        };

        // its friends from the zoo come out to meet it
        try {
          zoo.slice(-5).forEach(function (z, i, all) {
            var f = makeFriend(z, 0, 0, 'dd-friend--old');
            f.style.left = ((i + 0.5) / all.length * 100) + '%';
            f.style.setProperty('--d', (i * 0.12).toFixed(2) + 's');
            party.appendChild(f);
          });
        } catch (e) {}

        var pitch = util.clamp(520 - Math.max(bw, bh) * 0.25, 220, 560);
        babble(pitch, 4);
        ctx.tap(friend, function () { babble(pitch * 1.3, 3); sfx.play('giggle'); fx.bounce(friend); }, { evenWhenOver: true });

        // save it: the zoo keeps the newest few
        if (src) {
          zoo.push({ img: src, w: bw, h: bh, eyes: eyes });
          while (zoo.length > ZOO) zoo.shift();
          try { ctx.save('zoo', zoo); } catch (e) {}
        }

        // it bounces into the middle and grows, so both of them can see it properly
        ctx.after(60, function () { friend.dataset.fit = '1'; fitFriend(); sfx.play('boing'); });
        ctx.after(1250, function () { friend.classList.add('is-hopping'); babble(pitch, 3); });
        ctx.after(2200, function () { babble(pitch * 1.1, 4); });
      }

      /** A creature: its picture, plus eyes that blink. w/h: px size (0 = the zoo's own size). */
      function makeFriend(z, w, h, cls) {
        var node = el('div', { class: 'dd-friend ' + (cls || '') });
        if (w && h) { node.style.width = w + 'px'; node.style.height = h + 'px'; }
        else { node.style.setProperty('--ar', (z.w / z.h).toFixed(3)); }
        if (z.img) node.appendChild(el('img', { class: 'dd-friend__pic', src: z.img, alt: '' }));
        (z.eyes || []).forEach(function (e) {
          var eye = ctx.sticker(e.e, 'dd-eye');
          eye.style.left = (e.x * 100) + '%';
          eye.style.top = (e.y * 100) + '%';
          eye.style.setProperty('--s', e.s.toFixed(3));
          node.appendChild(eye);
        });
        return node;
      }

      /* ---- go ---- */

      choose(tool);
      setTurn(turn);
      fit();
      ctx.onResize(function () { fit(); if (friend && fitFriend && friend.dataset.fit) fitFriend(); });
      // a finger held down through a pause does not draw a ruler-straight jump afterwards: the line ends at the pause
      ctx.onResume(function () { live = {}; });

      var stopIntro = null;
      function endIntro() {
        if (state !== 'intro') return;
        introUpto = null;
        if (stopIntro) { stopIntro(); stopIntro = null; }
        state = 'draw';
        paint();
        sfx.play('ding');
        refresh();
      }
      if (ctx.opt('start') === 'blank') {
        state = 'draw';
        refresh();
        ctx.hint(paper, { delay: 600 });
      } else {
        items.push({ kind: 'stroke', color: 'ink', w: INK, pts: squiggle(), by: -1 });
        introUpto = 0;
        var t0 = ctx.time, total = items[0].pts.length;
        stopIntro = ctx.frame(function () {
          if (state !== 'intro') return;
          introUpto = Math.min(total, Math.ceil((ctx.time - t0) / 1.1 * total));
          paint();
          if (introUpto % 5 === 0) scribble();
          if (introUpto >= total) { endIntro(); ctx.hint(paper, { delay: 500 }); }
        });
      }

      ctx.expose({
        get state() { return state; },
        get turn() { return turn; },
        get items() { return items.map(function (it) { return it.kind === 'stroke' ? { kind: 'stroke', color: it.color, n: it.pts.length, by: it.by } : { kind: 'stamp', emoji: it.emoji, x: it.x, y: it.y, by: it.by }; }); },
        get added() { return added.slice(); },
        get tool() { return Object.assign({}, tool); },
        get zoo() { return zoo.length; },
        get paperPx() { return px; },
        SIZE: SIZE,
        squiggle: squiggle, bounds: bounds, spline: spline, cleanZoo: cleanZoo,
      });
    },
  });
})();
