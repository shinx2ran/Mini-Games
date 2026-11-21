/* Egg Twins — take turns cracking two eggs to find the baby animals that are
 * twins. Classic pairs, tuned for a 4-year-old: turns strictly alternate (a
 * match earns no extra turn, so nobody waits long or runs away with it), a
 * mismatch stays open long enough to memorise, and a little player gets a
 * quiet shimmer on a twin she has already seen.
 *
 * state: preview? -> first (waiting for egg one) -> second -> look (both open) -> first ... -> done
 */
(function () {
  'use strict';

  /* Babies differ in silhouette AND colour; each has its own two-note call. */
  var BABIES = [
    { emoji: '🐥', tint: 'sun', notes: [9, 11] },
    { emoji: '🐢', tint: 'leaf', notes: [2, 4] },
    { emoji: '🐙', tint: 'berry', notes: [7, 5] },
    { emoji: '🐧', tint: 'grape', notes: [4, 4] },
    { emoji: '🦉', tint: 'tangerine', notes: [5, 2] },
    { emoji: '🐠', tint: 'sea', notes: [10, 8] },
    { emoji: '🐞', tint: 'berry', notes: [6, 9] },
    { emoji: '🦕', tint: 'sea', notes: [1, 6] },
  ];

  var LOOK_MS = 1600;      // a mismatch stays open this long
  var CRACK_MS = 300;
  var MATCH_MS = 900;
  var PREVIEW_MS = 2500;
  var HESITATE_MS = [0, 2500, 1000]; // by help level: wait before the seen twin shimmers

  /* ---------------------------------------------------------- pure rules */

  /** Columns for n eggs in a w x h board: the arrangement with the biggest square cell. */
  function gridFor(n, w, h) {
    var best = null;
    for (var cols = 2; cols <= 8; cols++) {
      if (n % cols) continue;
      var rows = n / cols;
      var cell = Math.min(w / cols, h / rows);
      if (!best || cell > best.cell) best = { cols: cols, rows: rows, cell: cell };
    }
    return best;
  }

  /** 0 | 1 | 'tie' for nests holding a and b pairs. */
  function verdict(a, b) { return a === b ? 'tie' : a > b ? 0 : 1; }

  /** A shuffled deck: `pairs` babies, two eggs each. Returns baby indexes. */
  function deal(pairs, shuffle) {
    var kinds = shuffle(BABIES.map(function (_, i) { return i; })).slice(0, pairs);
    return shuffle(kinds.concat(kinds));
  }

  MG.registerGame({
    id: 'twins',
    name: 'Egg Twins',
    emoji: '🥚',
    color: 'leaf',
    howTo: 'Take turns cracking two eggs. Find two babies the same and the twins hop into your nest. Then it is the other player\'s turn, match or no match. Most twins wins.',
    options: [
      { key: 'eggs', label: 'Eggs', default: 12, choices: [{ value: 8, label: '8' }, { value: 12, label: '12' }, { value: 16, label: '16' }] },
    ],

    mount: function (root, ctx) {
      var el = ctx.el, sfx = ctx.sfx, fx = ctx.fx, util = ctx.util;
      var count = ctx.opt('eggs');
      var pairs = count / 2;
      var deck = deal(pairs, util.shuffle);

      var state = 'first';
      var turn = ctx.firstPlayer;
      var open = [];            // egg indexes cracked this turn
      var found = [0, 0];
      var seen = {};            // egg index -> true once it has been shown
      var hinting = -1;
      var cancelHesitate = null;
      var left = pairs;

      /* ---- build ---- */

      var eggs = deck.map(function (kind, i) {
        var baby = BABIES[kind];
        var node = el('button', { type: 'button', class: 'tw-egg', 'aria-label': 'Egg ' + (i + 1), data: { i: i }, style: { '--tint': 'var(--' + baby.tint + '-soft)', '--tilt': ((i * 53) % 9 - 4) + 'deg' } },
          el('span', { class: 'tw-shell' }, el('span', { class: 'tw-speck' })),
          el('span', { class: 'tw-baby' }, ctx.sticker(baby.emoji), el('span', { class: 'tw-cup' })));
        return { node: node, kind: kind, gone: false };
      });
      var board = el('div', { class: 'tw-board' }, eggs.map(function (e) { return e.node; }));

      var nests = ctx.players.map(function (p) {
        var row = el('div', { class: 'tw-nest__row' });
        var node = el('div', { class: 'tw-nest', 'data-p': String(p.index), style: { '--c': p.color, '--c-dark': p.dark, '--c-soft': p.soft } },
          el('div', { class: 'tw-nest__who' }, ctx.sticker(p.emoji)), row);
        return { node: node, row: row };
      });

      var scene = el('div', { class: 'tw-scene' }, nests[0].node, board, nests[1].node);
      root.appendChild(scene);

      function layout() {
        var r = board.getBoundingClientRect();
        if (!r.width || !r.height) return;
        var g = gridFor(count, r.width, r.height);
        board.style.setProperty('--cols', g.cols);
        board.style.setProperty('--rows', g.rows);
        board.style.setProperty('--egg', Math.floor(Math.min(r.width / g.cols * 0.78, r.height / g.rows * 0.66)) + 'px');
      }
      layout();
      ctx.onResize(layout);

      /* ---- sounds ---- */

      function call(kind, delay) {
        var n = BABIES[kind].notes;
        sfx.scale(n[0], { delay: delay || 0, dur: 0.16 });
        sfx.scale(n[1], { delay: (delay || 0) + 0.13, dur: 0.22 });
      }
      function crack() { sfx.noise({ freq: 2600, dur: 0.04, q: 2, gain: 0.16 }); sfx.noise({ freq: 1500, dur: 0.05, q: 2, gain: 0.1, delay: 0.05 }); }
      function hmm() { sfx.tone({ freq: 392, to: 349, dur: 0.22, type: 'sine', gain: 0.09 }); }
      function plop() { sfx.tone({ freq: 300, to: 180, dur: 0.1, type: 'sine', gain: 0.14 }); }

      /* ---- helpers ---- */

      function show(i) {
        eggs[i].node.classList.add('is-open');
        seen[i] = true;
      }
      function hide(i) { eggs[i].node.classList.remove('is-open', 'is-twin'); }

      function clearHint() {
        if (cancelHesitate) { cancelHesitate(); cancelHesitate = null; }
        if (hinting >= 0) { eggs[hinting].node.classList.remove('is-shimmer'); hinting = -1; }
      }

      /** Invisible help: a twin she has ALREADY seen gives a faint wobble if she hesitates. */
      function armHint(firstEgg) {
        var level = ctx.helpFor(turn);
        if (!level) return;
        var twin = -1;
        eggs.forEach(function (e, i) { if (i !== firstEgg && !e.gone && e.kind === eggs[firstEgg].kind) twin = i; });
        if (twin < 0 || !seen[twin]) return;
        cancelHesitate = ctx.after(HESITATE_MS[level], function () {
          cancelHesitate = null;
          if (state !== 'second') return;
          hinting = twin;
          eggs[twin].node.classList.add('is-shimmer');
        });
      }

      /** A little copy of the baby hops from its egg to the nest. Decoration only. */
      function hop(fromNode, toNode, emoji) {
        if (MG.reducedMotion || !root.animate) return;
        var a = fromNode.getBoundingClientRect(), b = toNode.getBoundingClientRect(), g = root.getBoundingClientRect();
        var flyer = ctx.sticker(emoji, 'tw-flyer');
        flyer.style.left = (a.left + a.width / 2 - g.left) + 'px';
        flyer.style.top = (a.top + a.height / 2 - g.top) + 'px';
        root.appendChild(flyer);
        var dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
        flyer.animate([
          { transform: 'translate(-50%, -50%) scale(1)' },
          { transform: 'translate(calc(-50% + ' + dx * 0.5 + 'px), calc(-50% + ' + (dy * 0.5 - 60) + 'px)) scale(1.3)', offset: 0.5 },
          { transform: 'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + dy + 'px)) scale(0.6)' },
        ], { duration: 520, easing: 'ease-in-out', fill: 'forwards' });
        ctx.after(540, function () { flyer.remove(); });
      }

      /* ---- the round ---- */

      function beginTurn(p) {
        turn = p;
        open = [];
        state = 'first';
        ctx.setTurn(p);
      }

      function pick(i) {
        var e = eggs[i];
        if (e.gone || open.indexOf(i) >= 0) return false;
        if (state !== 'first' && state !== 'second') return false;
        clearHint();
        open.push(i);
        show(i);
        crack();
        call(e.kind, 0.05);
        fx.pop(e.node.lastChild);
        if (state === 'first') {
          state = 'second';
          armHint(i);
        } else {
          state = 'look';
          ctx.lock(CRACK_MS);
          ctx.after(CRACK_MS, judge);
        }
        return true;
      }

      function judge() {
        var a = eggs[open[0]], b = eggs[open[1]];
        if (a.kind === b.kind) {
          var p = turn, baby = BABIES[a.kind];
          a.node.classList.add('is-twin');
          b.node.classList.add('is-twin');
          sfx.play('match');
          call(a.kind, 0.3);
          [a, b].forEach(function (e) {
            var c = fx.centerOf(e.node);
            fx.burst(c.x, c.y, { emoji: '✨', count: 5, distance: 50, size: 18 });
          });
          ctx.after(380, function () {
            hop(a.node, nests[p].row, baby.emoji);
            hop(b.node, nests[p].row, baby.emoji);
            a.gone = b.gone = true;
            a.node.classList.add('is-gone');
            b.node.classList.add('is-gone');
            a.node.setAttribute('aria-disabled', 'true');
            b.node.setAttribute('aria-disabled', 'true');
          });
          ctx.after(MATCH_MS, function () {
            found[p]++;
            left--;
            nests[p].row.appendChild(el('span', { class: 'tw-pair' }, ctx.sticker(baby.emoji), ctx.sticker(baby.emoji)));
            layout(); // a fuller nest can grow a row: keep the eggs fitted to what is left
            ctx.addScore(p, 1);
            sfx.scale(3 + found[0] + found[1]);
            fx.pop(nests[p].node);
            if (left === 0) finish();
            else beginTurn(1 - p);
          });
        } else {
          hmm();
          ctx.after(LOOK_MS, function () {
            hide(open[0]);
            hide(open[1]);
            plop();
            beginTurn(1 - turn);
          });
        }
      }

      function finish() {
        state = 'done';
        ctx.setTurn(null);
        var result = verdict(found[0], found[1]);
        nests.forEach(function (n, i) { if (result === 'tie' || result === i) n.node.classList.add('is-champ'); });
        ctx.win(result, { delay: 900, emoji: '🐣' });
      }

      ctx.tap(board, function (ev, node) {
        if (!pick(+node.dataset.i)) fx.wiggle(node);
      }, { delegate: '.tw-egg', slop: 20 });

      /* ---- go ---- */

      ctx.setScore(0, 0);
      ctx.setScore(1, 0);
      function start() {
        beginTurn(ctx.firstPlayer);
        ctx.hint(eggs[Math.floor(count / 2)].node, { delay: 300 });
      }
      if (ctx.helpFor(0) >= 2 || ctx.helpFor(1) >= 2) {
        // "Lots" of help: a look at every baby before the eggs close
        state = 'preview';
        eggs.forEach(function (e, i) { e.node.classList.add('is-open'); seen[i] = true; });
        ctx.after(PREVIEW_MS, function () {
          eggs.forEach(function (e, i) { hide(i); });
          plop();
          start();
        });
      } else start();

      ctx.expose({
        get state() { return state; },
        get turn() { return turn; },
        get open() { return open.slice(); },
        get found() { return found.slice(); },
        get left() { return left; },
        get hinting() { return hinting; },
        /** Tests only: which baby is in each egg (-1 once it has gone to a nest). */
        get eggs() { return eggs.map(function (e) { return e.gone ? -1 : e.kind; }); },
        count: count, pairs: pairs,
        gridFor: gridFor, verdict: verdict, deal: deal, babies: BABIES.map(function (b) { return b.emoji; }),
      });
    },
  });
})();
