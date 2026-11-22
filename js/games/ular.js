/* Ular Tangga — snakes and ladders. Take turns tapping your big die; your
 * animal hops along the board square by square (counted out loud), climbs
 * any ladder it lands at the foot of, and slides down any snake whose head
 * it lands on. First to the crown at the top wins.
 *
 * Twists (on by default): a star square rolls again; a gift square hops you
 * on one to three more squares. Every game deals a fresh board. The grown-up
 * picks the board size (up to the classic 100 squares) and whether the
 * finish must be exact (an overshoot bounces back), in the pause menu.
 *
 * Squares are numbered 1..N from the bottom left, winding left-right then
 * right-left up the rows. The quiet handicap: a little player's die quietly
 * dodges a snake's head now and then.
 * state: roll -> rolling -> moving -> (climb | slide | gift) -> roll ... -> done
 */
(function () {
  'use strict';

  var SIZES = { small: 6, medium: 8, classic: 10 };
  var COUNTS = {
    6: { ladders: 3, snakes: 3, stars: 2, gifts: 2, span: 2 },
    8: { ladders: 5, snakes: 5, stars: 3, gifts: 3, span: 3 },
    10: { ladders: 8, snakes: 8, stars: 4, gifts: 4, span: 4 },
  };
  var HOP_MS = 330;            // one square per hop, counted out loud
  var DODGE = [0, 0.5, 0.8];   // chance a little player's roll quietly misses a snake's head, by help level
  var SNAKE_COLORS = ['leaf', 'grape', 'tangerine', 'sea', 'berry'];
  var PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

  /* ---------------------------------------------------------- pure rules */

  function rowOf(s, n) { return Math.floor((s - 1) / n); }

  /** Centre of square s on an n x n board, in squares from the top left. */
  function xy(s, n) {
    var r = rowOf(s, n), c = (s - 1) % n;
    if (r % 2) c = n - 1 - c;
    return { x: c + 0.5, y: n - 1 - r + 0.5 };
  }

  /**
   * A fresh board: {n, N, ladders: [{from, to}], snakes: [{from (head), to (tail)}], stars, gifts}.
   * Every special square is a different square; nothing on the first or the last square.
   */
  function makeBoard(n, rnd, twists) {
    rnd = rnd || Math.random;
    var N = n * n, k = COUNTS[n];
    for (var attempt = 0; attempt < 400; attempt++) {
      var used = {}, ok = true;
      used[1] = used[N] = true;
      var free = function (lo, hi) {
        lo = Math.max(2, lo); hi = Math.min(N - 1, hi);
        if (hi < lo) return -1;
        for (var t = 0; t < 80; t++) {
          var s = lo + Math.floor(rnd() * (hi - lo + 1));
          if (!used[s]) { used[s] = true; return s; }
        }
        return -1;
      };
      /** A free square on row r, at most `reach` columns from square `near` (so ladders and snakes do not sprawl across the board). */
      var nearIn = function (r, near, reach) {
        var cx = xy(near, n).x, opts = [];
        for (var q = r * n + 1; q <= r * n + n; q++) if (q > 1 && q < N && !used[q] && Math.abs(xy(q, n).x - cx) <= reach) opts.push(q);
        if (!opts.length) return -1;
        var s = opts[Math.floor(rnd() * opts.length)];
        used[s] = true;
        return s;
      };
      var ladders = [], snakes = [], stars = [], gifts = [];
      for (var i = 0; i < k.ladders && ok; i++) {
        var from = free(2, N - n);
        if (from < 0) { ok = false; break; }
        var rf = rowOf(from, n), up = 1 + Math.floor(rnd() * k.span);
        var to = nearIn(Math.min(n - 1, rf + up), from, 2);
        if (to < 0) { ok = false; break; }
        ladders.push({ from: from, to: to });
      }
      for (var j = 0; j < k.snakes && ok; j++) {
        var head = free(n + 1, N - 1);
        if (head < 0) { ok = false; break; }
        var rh = rowOf(head, n), down = 1 + Math.floor(rnd() * k.span);
        var tail = nearIn(Math.max(0, rh - down), head, 2.5);
        if (tail < 0) { ok = false; break; }
        snakes.push({ from: head, to: tail });
      }
      if (!ok) continue;
      if (twists) {
        for (var a = 0; a < k.stars; a++) { var st = free(n + 1, N - 1); if (st > 0) stars.push(st); }
        for (var b = 0; b < k.gifts; b++) { var g = free(n + 1, N - 1); if (g > 0) gifts.push(g); }
      }
      return { n: n, N: N, ladders: ladders, snakes: snakes, stars: stars, gifts: gifts };
    }
    return { n: n, N: N, ladders: [], snakes: [], stars: [], gifts: [] };
  }

  /** What is on square s: 'ladder' | 'snake' | 'star' | 'gift' | null, with where it leads. */
  function whatsOn(board, s) {
    var i;
    for (i = 0; i < board.ladders.length; i++) if (board.ladders[i].from === s) return { kind: 'ladder', to: board.ladders[i].to, i: i };
    for (i = 0; i < board.snakes.length; i++) if (board.snakes[i].from === s) return { kind: 'snake', to: board.snakes[i].to, i: i };
    if (board.stars.indexOf(s) >= 0) return { kind: 'star' };
    if (board.gifts.indexOf(s) >= 0) return { kind: 'gift' };
    return null;
  }

  /** The squares a roll of v from `pos` hops through, in order; with `exact`, an overshoot bounces back off the top. */
  function hops(pos, v, N, exact) {
    var out = [], p = pos, dir = 1;
    for (var i = 0; i < v; i++) {
      if (p >= N) { if (!exact) break; dir = -1; }
      p += dir;
      out.push(p);
    }
    return out;
  }

  MG.registerGame({
    id: 'ular',
    name: 'Ular Tangga',
    emoji: '🐍',
    color: 'leaf',
    howTo: 'Snakes and ladders. Take turns tapping your die: your animal hops that many squares. Land at the foot of a ladder and climb up; land on a snake\'s head and slide down. A star rolls again, a gift hops you on a bit. First to the crown wins. A new board every game.',
    options: [
      { key: 'size', label: 'Board', default: 'medium', choices: [{ value: 'small', label: '36' }, { value: 'medium', label: '64' }, { value: 'classic', label: '100' }] },
      { key: 'twists', label: 'Stars and gifts', default: 'on', choices: [{ value: 'on', label: 'On', emoji: '⭐' }, { value: 'off', label: 'Off' }] },
      { key: 'finish', label: 'Finish', default: 'any', choices: [{ value: 'any', label: 'Any roll' }, { value: 'exact', label: 'Exact' }] },
    ],

    mount: function (root, ctx) {
      var el = ctx.el, sfx = ctx.sfx, fx = ctx.fx, util = ctx.util;
      var players = ctx.players;
      var n = SIZES[ctx.opt('size')] || 8;
      var exact = ctx.opt('finish') === 'exact';
      var board = makeBoard(n, Math.random, ctx.opt('twists') !== 'off');
      var N = board.N;

      var state = 'roll';
      var turn = ctx.firstPlayer;
      var pos = [1, 1];
      var lastRoll = 0, rolls = 0;
      var rigged = [];          // tests: the next die values
      var dodged = 0;
      var hinted = false;

      /* ---- build ---- */

      var cells = [];
      for (var s = 1; s <= N; s++) {
        var p = xy(s, n);
        var cell = el('div', {
          class: 'ul-cell' + (((Math.floor(p.x) + Math.floor(p.y)) % 2) ? ' is-alt' : ''),
          style: { left: ((p.x - 0.5) / n * 100) + '%', top: ((p.y - 0.5) / n * 100) + '%' },
        }, el('span', { class: 'ul-num', text: String(s) }));
        var w = whatsOn(board, s);
        if (s === N) cell.appendChild(el('span', { class: 'ul-mark ul-crown', 'aria-hidden': 'true' }, ctx.sticker('👑')));
        else if (w && w.kind === 'star') cell.appendChild(el('span', { class: 'ul-mark', 'aria-hidden': 'true' }, ctx.sticker('⭐')));
        else if (w && w.kind === 'gift') cell.appendChild(el('span', { class: 'ul-mark', 'aria-hidden': 'true' }, ctx.sticker('🎁')));
        cells.push(cell);
      }

      // ladders and snakes are drawn in SVG over the squares (in square units)
      var NS = 'http://www.w3.org/2000/svg';
      function svg(tag, attrs) { var e = document.createElementNS(NS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); return e; }
      var art = svg('svg', { class: 'ul-art', viewBox: '0 0 ' + n + ' ' + n, 'aria-hidden': 'true' });
      board.ladders.forEach(function (l) {
        var a = xy(l.from, n), b = xy(l.to, n);
        var dx = b.x - a.x, dy = b.y - a.y, len = Math.sqrt(dx * dx + dy * dy), ux = dx / len, uy = dy / len, px = -uy * 0.2, py = ux * 0.2;
        var g = svg('g', { class: 'ul-ladder' });
        [1, -1].forEach(function (side) {
          g.appendChild(svg('line', { class: 'ul-rail', x1: a.x + px * side, y1: a.y + py * side, x2: b.x + px * side, y2: b.y + py * side }));
        });
        for (var t = 0.35; t < len - 0.2; t += 0.42) {
          g.appendChild(svg('line', { class: 'ul-rung', x1: a.x + ux * t + px, y1: a.y + uy * t + py, x2: a.x + ux * t - px, y2: a.y + uy * t - py }));
        }
        art.appendChild(g);
      });
      var snakePaths = board.snakes.map(function (sn, i) {
        var a = xy(sn.from, n), b = xy(sn.to, n);
        var dx = b.x - a.x, dy = b.y - a.y, len = Math.sqrt(dx * dx + dy * dy), px = -dy / len, py = dx / len, wig = Math.min(1.1, 0.35 + len * 0.15);
        var d = 'M' + a.x + ' ' + a.y + ' C' + (a.x + dx * 0.33 + px * wig) + ' ' + (a.y + dy * 0.33 + py * wig) + ' ' +
          (a.x + dx * 0.66 - px * wig) + ' ' + (a.y + dy * 0.66 - py * wig) + ' ' + b.x + ' ' + b.y;
        var color = 'var(--' + SNAKE_COLORS[i % SNAKE_COLORS.length] + ')';
        var g = svg('g', { class: 'ul-snake', style: '--c:' + color });
        g.appendChild(svg('path', { class: 'ul-snake__edge', d: d }));
        var body = svg('path', { class: 'ul-snake__body', d: d });
        g.appendChild(body);
        g.appendChild(svg('path', { class: 'ul-snake__spots', d: d }));
        // the head: a round face with two eyes, looking along its body
        var ang = Math.atan2(dy, dx) * 180 / Math.PI;
        var head = svg('g', { transform: 'translate(' + a.x + ' ' + a.y + ') rotate(' + ang + ')' });
        head.appendChild(svg('line', { class: 'ul-snake__tongue', x1: -0.24, y1: 0, x2: -0.42, y2: 0 }));
        head.appendChild(svg('ellipse', { class: 'ul-snake__head', cx: 0, cy: 0, rx: 0.27, ry: 0.22 }));
        head.appendChild(svg('circle', { class: 'ul-snake__eye', cx: -0.06, cy: -0.1, r: 0.06 }));
        head.appendChild(svg('circle', { class: 'ul-snake__eye', cx: -0.06, cy: 0.1, r: 0.06 }));
        g.appendChild(head);
        art.appendChild(g);
        return body;
      });

      var tokens = players.map(function (pl) {
        return el('div', { class: 'ul-token', 'data-p': String(pl.index), style: { '--c': pl.color, '--c-dark': pl.dark } }, ctx.sticker(pl.emoji));
      });
      var boardEl = el('div', { class: 'ul-board', role: 'img', 'aria-label': 'The board', 'data-n': String(n) }, cells, art, tokens);
      var boardBox = el('div', { class: 'ul-boardbox' }, boardEl);

      var dice = players.map(function (pl) {
        var face = el('span', { class: 'ul-face' });
        for (var k = 0; k < 9; k++) face.appendChild(el('span', { class: 'ul-pip' }));
        var btn = el('button', { type: 'button', class: 'ul-die', 'data-p': String(pl.index), 'aria-label': 'Roll, player ' + (pl.index + 1), style: { '--c': pl.color, '--c-dark': pl.dark, '--c-soft': pl.soft } }, face);
        var seat = el('div', { class: 'ul-seat', 'data-p': String(pl.index) }, ctx.sticker(pl.emoji), btn);
        return { btn: btn, face: face, seat: seat };
      });
      var scene = el('div', { class: 'ul-scene' }, dice[0].seat, boardBox, dice[1].seat);
      root.appendChild(scene);

      function fit() {
        var r = boardBox.getBoundingClientRect();
        if (!r.width || !r.height) return;
        var side = Math.floor(Math.min(r.width, r.height));
        boardEl.style.width = side + 'px';
        boardEl.style.height = side + 'px';
        boardEl.style.setProperty('--cell', (side / n).toFixed(2) + 'px');
      }
      fit();
      ctx.onResize(fit);

      /* ---- drawing the state ---- */

      function showFace(i, v) {
        var on = PIPS[v] || [];
        Array.prototype.forEach.call(dice[i].face.children, function (pip, k) { pip.classList.toggle('is-on', on.indexOf(k) >= 0); });
      }
      /** Put both animals where they are (side by side when they share a square). x/y override: mid-slide or mid-climb. */
      function place(i, at) {
        var c = at || xy(pos[i], n);
        var share = !at && pos[0] === pos[1];
        var off = share ? (i === 0 ? -0.2 : 0.2) : 0;
        tokens[i].classList.toggle('is-shared', share);
        // side by side, but never over the board's edge
        var x = util.clamp(c.x + off, 0.42, n - 0.42), y = util.clamp(c.y + off * 0.6, 0.42, n - 0.42);
        tokens[i].style.left = (x / n * 100) + '%';
        tokens[i].style.top = (y / n * 100) + '%';
      }
      function placeBoth() { place(0); place(1); }

      function setTurn(p) {
        turn = p;
        state = 'roll';
        ctx.setTurn(p);
        dice.forEach(function (d, i) {
          d.btn.setAttribute('aria-disabled', i === p ? 'false' : 'true');
          d.seat.classList.toggle('is-turn', i === p);
        });
        tokens.forEach(function (t, i) { t.classList.toggle('is-turn', i === p); });
        if (!hinted) { hinted = true; ctx.hint(dice[p].btn, { delay: 600 }); }
      }

      /* ---- sounds ---- */

      function rattle() { for (var i = 0; i < 6; i++) sfx.noise({ freq: 1800 + Math.random() * 900, dur: 0.03, q: 3, gain: 0.12, delay: i * 0.09 + Math.random() * 0.03 }); }
      function whee() { sfx.tone({ freq: 330, to: 990, dur: 0.6, type: 'triangle', gain: 0.16 }); }
      function hiss() { sfx.noise({ freq: 5000, to: 3500, dur: 0.5, q: 2, gain: 0.08 }); sfx.tone({ freq: 700, to: 180, dur: 0.9, type: 'sine', gain: 0.14, delay: 0.25 }); }

      /* ---- a turn ---- */

      /** The roll: a fair die, except a little player's quietly misses a snake's head sometimes. */
      function chooseRoll() {
        if (rigged.length) return rigged.shift();
        var v = 1 + util.rand(6);
        var level = ctx.helpFor(turn);
        var landsOnSnake = function (x) { var h = hops(pos[turn], x, N, exact); var w = whatsOn(board, h[h.length - 1]); return w && w.kind === 'snake'; };
        if (level && landsOnSnake(v) && Math.random() < DODGE[level]) {
          var others = [1, 2, 3, 4, 5, 6].filter(function (x) { return !landsOnSnake(x); });
          if (others.length) { v = util.pick(others); dodged++; }
        }
        return v;
      }

      function roll() {
        if (state !== 'roll') return;
        state = 'rolling';
        ctx.lock(800);
        var d = dice[turn];
        d.btn.classList.add('is-rolling');
        rattle();
        var flick = ctx.every(80, function () { showFace(turn, 1 + util.rand(6)); });
        var v = chooseRoll();
        lastRoll = v;
        rolls++;
        ctx.after(640, function () {
          flick();
          d.btn.classList.remove('is-rolling');
          showFace(turn, v);
          fx.pop(d.btn);
          sfx.play('drop');
          ctx.after(260, function () { walk(hops(pos[turn], v, N, exact), 0, land); });
        });
      }

      /** Hop through `path` one square at a time, counting out loud, then call done(). */
      function walk(path, k, done) {
        if (state === 'done') return;
        state = 'moving';
        if (k >= path.length) { done(); return; }
        pos[turn] = path[k];
        placeBoth();
        hop(tokens[turn]);
        sfx.scale(Math.min(12, k + 2));
        ctx.say(k + 1);
        ctx.after(HOP_MS, function () { walk(path, k + 1, done); });
      }

      function hop(t) { t.classList.remove('is-hop'); void t.offsetWidth; t.classList.add('is-hop'); }

      /** Where we landed: the crown, a ladder, a snake, a star, a gift, or just a square. */
      function land(depth) {
        depth = depth || 0;
        var me = turn;
        if (pos[me] >= N) { finish(me); return; }
        var w = whatsOn(board, pos[me]);
        if (!w) { next(); return; }
        if (w.kind === 'ladder') {
          state = 'climb';
          whee();
          glide(me, xy(pos[me], n), xy(w.to, n), 700, function () { pos[me] = w.to; placeBoth(); sfx.play('good'); ctx.after(250, next); });
        } else if (w.kind === 'snake') {
          state = 'slide';
          hiss();
          var path = snakePaths[w.i], len = path.getTotalLength();
          var art2 = art.querySelectorAll('.ul-snake')[w.i];
          art2.classList.add('is-eating');
          follow(me, path, len, 1100, function () {
            art2.classList.remove('is-eating');
            pos[me] = w.to;
            placeBoth();
            sfx.play('boing');
            ctx.after(300, next);
          });
        } else if (w.kind === 'star') {
          // roll again!
          sfx.play('star');
          var c = fx.centerOf(tokens[me]);
          fx.burst(c.x, c.y, { emoji: '⭐', count: 8, distance: 70, size: 22 });
          ctx.after(500, function () { if (state !== 'done') { state = 'roll'; dice[me].btn.classList.add('is-again'); ctx.after(600, function () { dice[me].btn.classList.remove('is-again'); }); } });
        } else if (w.kind === 'gift') {
          state = 'gift';
          var extra = 1 + util.rand(3);
          sfx.play('pop');
          var g = fx.centerOf(tokens[me]);
          fx.burst(g.x, g.y, { emoji: '🎁', count: 5, distance: 60, size: 22 });
          fx.float(g.x, g.y - 20, extra === 1 ? '👣' : extra === 2 ? '👣👣' : '👣👣👣', { size: 26, duration: 1000 });
          ctx.after(700, function () {
            if (state === 'done') return;
            walk(hops(pos[me], extra, N, exact), 0, function () { if (depth < 3) land(depth + 1); else next(); });
          });
        } else next();
      }

      /** Up a ladder: a straight glide. */
      function glide(i, a, b, ms, done) {
        tokens[i].classList.add('is-riding');
        var t0 = ctx.time, stop = ctx.frame(function () {
          var k = Math.min(1, (ctx.time - t0) / (ms / 1000)), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
          place(i, { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e });
          if (k >= 1) { stop(); tokens[i].classList.remove('is-riding'); done(); }
        });
      }
      /** Down a snake: along its wiggly body. */
      function follow(i, path, len, ms, done) {
        tokens[i].classList.add('is-riding', 'is-sliding');
        var t0 = ctx.time, stop = ctx.frame(function () {
          var k = Math.min(1, (ctx.time - t0) / (ms / 1000)), e = k * k * (3 - 2 * k);
          var pt = path.getPointAtLength(e * len);
          place(i, { x: pt.x, y: pt.y });
          if (k >= 1) { stop(); tokens[i].classList.remove('is-riding', 'is-sliding'); done(); }
        });
      }

      function next() { if (state !== 'done') setTurn(1 - turn); }

      function finish(w) {
        state = 'done';
        dice.forEach(function (d) { d.btn.setAttribute('aria-disabled', 'true'); d.seat.classList.remove('is-turn'); });
        tokens[w].classList.add('is-champ');
        sfx.play('match');
        var c = fx.centerOf(cells[N - 1]);
        fx.burst(c.x, c.y, { emoji: '👑', count: 8, distance: 90, size: 26 });
        ctx.win(w, { delay: 1300, emoji: '🐍' });
      }

      /* ---- input ---- */

      dice.forEach(function (d, i) {
        ctx.tap(d.btn, function () { if (i === turn) roll(); });
      });

      /* ---- go ---- */

      showFace(0, 1); showFace(1, 1);
      placeBoth();
      setTurn(turn);

      ctx.expose({
        get state() { return state; },
        get turn() { return turn; },
        get pos() { return pos.slice(); },
        get lastRoll() { return lastRoll; },
        get rolls() { return rolls; },
        get dodged() { return dodged; },
        get board() { return JSON.parse(JSON.stringify(board)); },
        /** Tests only: the next die values. */
        rig: function (vals) { rigged = vals.slice(); },
        /** Tests only: put player i on square s. */
        place: function (i, sq) { pos[i] = sq; placeBoth(); },
        N: N, n: n, exact: exact,
        makeBoard: makeBoard, whatsOn: whatsOn, hops: hops, xy: xy, rowOf: rowOf,
      });
    },
  });
})();
