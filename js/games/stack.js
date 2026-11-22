/* Rainbow Stack — a tower of chunky blocks, in 3D. Take turns pulling out a
 * block that matches the one on top (same COLOUR or same PICTURE): it slides
 * out and flies up to the top, and now that one is the block to match. Pull
 * carefully: a level left standing on one edge block may bring the whole
 * tower down. Whoever's pull tumbles it makes the big crash, and the other
 * player wears the crown. A tower that grows to the sky is a crown each.
 *
 * Every block that may be pulled right now is bright; the rest are dimmed
 * and cannot be tapped. A near-miss tap snaps to the nearest bright block.
 * The quiet handicap: a little player's pulls are much less likely to tumble
 * the tower, and if she hesitates a ghost hand points at the steadiest one.
 *
 * Geometry is in block widths (u): a block is 3 long, 1 wide, H tall; three
 * side by side make a level, each level turned a quarter from the one below.
 * state: pick -> pulling -> pick ... -> falling | done
 */
(function () {
  'use strict';

  var COLORS = ['berry', 'sun', 'leaf', 'sea'];
  var SHAPES = ['star', 'heart', 'dot', 'peak'];   // drawn in CSS, so every phone shows the same thing
  var LEVELS = 9;          // the tower at the start
  var WILDS = 2;           // rainbow blocks: they match anything
  var MAX_PULLS = 24;      // a tower that gets this tall is a crown each
  var GRACE = 3;           // the first pulls of a round never tumble it
  var H = 0.8;             // block height
  var VIEW_X = -24;        // degrees we look down on the tower
  var VIEW_Y = -38;        // the starting quarter view: two sides of every level show
  var SAFE = [1, 0.45, 0.2];           // a little player's tumble chance, by help level
  var HESITATE_MS = [0, 4500, 2500];   // ...and how long before a ghost hand shows the steadiest block
  var ORDER = [1, 0, 2];               // blocks go onto a new level middle first

  /* ---------------------------------------------------------- pure rules */

  /** A shuffled tower: {blocks: [{id, color, shape, wild}], levels: [[id, id, id] ...]}. */
  function makeTower(rnd, levels) {
    rnd = rnd || Math.random;
    levels = levels || LEVELS;
    var n = levels * 3, blocks = [];
    for (var i = 0; i < n; i++) {
      blocks.push({ id: i, color: COLORS[i % 4], shape: SHAPES[Math.floor(i / 4) % 4], wild: false });
    }
    // shuffle the looks (Fisher-Yates), then make a couple of blocks rainbow ones
    for (var k = n - 1; k > 0; k--) {
      var j = Math.floor(rnd() * (k + 1));
      var a = blocks[k], b = blocks[j];
      var c = a.color, s = a.shape; a.color = b.color; a.shape = b.shape; b.color = c; b.shape = s;
    }
    var spots = [];
    for (var w = 0; w < (levels - 3) * 3; w++) spots.push(w); // never in the top three levels
    for (var x = 0; x < WILDS && spots.length; x++) {
      var pick = spots.splice(Math.floor(rnd() * spots.length), 1)[0];
      blocks[pick].wild = true;
    }
    var rows = [];
    for (var l = 0; l < levels; l++) rows.push([l * 3, l * 3 + 1, l * 3 + 2]);
    return { blocks: blocks, levels: rows };
  }

  /** May a block that looks like `a` be pulled when `b` is on top? Same colour or same picture; rainbow matches anything. */
  function matches(a, b) {
    return !!(a.wild || b.wild || a.color === b.color || a.shape === b.shape);
  }

  function countIn(row) { return (row[0] >= 0) + (row[1] >= 0) + (row[2] >= 0); }

  /** Highest level that has any block. */
  function topLevel(levels) {
    for (var l = levels.length - 1; l >= 0; l--) if (countIn(levels[l]) > 0) return l;
    return -1;
  }

  /** Levels a block may be pulled from: not the top one, nor the one just under it. */
  function pullable(levels, lvl) { return lvl <= topLevel(levels) - 2; }

  /**
   * How likely pulling the block at (lvl, slot) is to tumble the tower, 0..1.
   * Mostly the level it leaves behind: two blocks are solid, the middle one
   * alone wobbles, one EDGE block alone (or nothing) brings it down. Every
   * other thin level below makes the whole thing a little shakier.
   */
  function riskOf(levels, lvl, slot) {
    var row = levels[lvl], rest = [];
    for (var s = 0; s < 3; s++) if (s !== slot && row[s] >= 0) rest.push(s);
    var base;
    if (!rest.length) base = 1;
    else if (rest.length === 1) base = rest[0] === 1 ? 0.12 : 0.85;
    else base = rest[0] === 0 && rest[1] === 2 ? 0.01 : 0.03;
    var weak = 0, top = topLevel(levels);
    for (var l = 0; l <= top - 2; l++) {
      if (l === lvl) continue;
      var n = countIn(levels[l]);
      if (n === 1) weak += 0.03;
      else if (n === 2) weak += 0.012;
    }
    return Math.min(0.95, base + weak);
  }

  /** Where the next block goes on top: {lvl, slot}. */
  function nextSpot(levels) {
    var top = topLevel(levels);
    var row = levels[top];
    if (countIn(row) === 3) return { lvl: top + 1, slot: ORDER[0] };
    for (var i = 0; i < 3; i++) if (row[ORDER[i]] < 0) return { lvl: top, slot: ORDER[i] };
    return { lvl: top + 1, slot: ORDER[0] };
  }

  /**
   * The blocks that may be pulled now: [{id, lvl, slot, risk}], and whether
   * nothing matched so anything goes (`any`).
   */
  function choices(tower, topId) {
    var all = [], match = [];
    var top = tower.blocks[topId];
    tower.levels.forEach(function (row, lvl) {
      if (!pullable(tower.levels, lvl)) return;
      row.forEach(function (id, slot) {
        if (id < 0) return;
        var c = { id: id, lvl: lvl, slot: slot, risk: riskOf(tower.levels, lvl, slot) };
        all.push(c);
        if (matches(tower.blocks[id], top)) match.push(c);
      });
    });
    return match.length ? { list: match, any: false } : { list: all, any: true };
  }

  MG.registerGame({
    id: 'stack',
    name: 'Rainbow Stack',
    emoji: '🧱',
    color: 'grape',
    howTo: 'Take turns pulling out a block that matches the one on top: the same colour or the same picture (rainbow blocks match anything). It flies up to the top, and now that is the one to match. Bright blocks can be pulled. Careful: whoever tumbles the tower makes the big crash, and the other player wins. Turn the tower with the arrow button.',

    mount: function (root, ctx) {
      var el = ctx.el, sfx = ctx.sfx, fx = ctx.fx, util = ctx.util;
      var players = ctx.players;

      var tower = makeTower(Math.random);
      var state = 'pick';
      var turn = ctx.firstPlayer;
      var topId = tower.levels[LEVELS - 1][1];   // the block to match: the last one put on top
      var pulls = 0;
      var spin = 0;                                // quarter turns of the view
      var current = { list: [], any: false };
      var rigged = null;                           // tests: the tumble roll
      var cancelHesitate = null;
      var u = 40;

      /* ---- build ---- */

      function face(cls, sym) {
        return el('span', { class: 'sk-face ' + cls }, sym ? el('span', { class: 'sk-sym' }) : null);
      }
      var nodes = tower.blocks.map(function (b) {
        var node = el('div', {
          class: 'sk-block' + (b.wild ? ' is-wild' : ''), 'data-id': String(b.id), 'data-shape': b.shape,
          style: { '--c': 'var(--' + b.color + ')', '--c-dark': 'var(--' + b.color + '-dark)' },
        },
          face('sk-side sk-side--p', true), face('sk-side sk-side--n', true),
          face('sk-end sk-end--p', true), face('sk-end sk-end--n', true),
          face('sk-top', false), face('sk-bottom', false));
        Array.prototype.forEach.call(node.children, function (f) { f.dataset.id = String(b.id); });
        return node;
      });
      var sway = el('div', { class: 'sk-sway' }, nodes);
      var floor = el('div', { class: 'sk-floor', 'aria-hidden': 'true' });
      var view = el('div', { class: 'sk-view' }, floor, sway);
      var turnBtn = el('button', { type: 'button', class: 'sk-turn', 'aria-label': 'Turn the tower' }, el('span', { class: 'sk-turn__icon', 'aria-hidden': 'true', text: '🔄' }));
      var stage = el('div', { class: 'sk-stage', role: 'application', 'aria-label': 'The tower' }, view, turnBtn);

      var targetTile = el('span', { class: 'sk-tile' }, el('span', { class: 'sk-sym' }));
      var seats = players.map(function (p) {
        return el('div', { class: 'sk-seat', 'data-p': String(p.index), style: { '--c': p.color, '--c-dark': p.dark, '--c-soft': p.soft } }, ctx.sticker(p.emoji));
      });
      var panel = el('div', { class: 'sk-panel' }, seats[0], el('div', { class: 'sk-match', role: 'img', 'aria-label': 'Find a block like this one' }, targetTile), seats[1]);
      var scene = el('div', { class: 'sk-scene' }, panel, stage);
      root.appendChild(scene);

      /* ---- placing blocks in 3D ---- */

      var where = {};   // id -> {lvl, slot}
      tower.levels.forEach(function (row, lvl) { row.forEach(function (id, slot) { where[id] = { lvl: lvl, slot: slot }; }); });

      /** Put block `id` at (lvl, slot), optionally nudged along its own length by `out` (block widths). */
      function put(id, lvl, slot, out) {
        var n = nodes[id], even = lvl % 2 === 0, off = slot - 1, o = out || 0;
        n.style.setProperty('--x', String(even ? o : off));
        n.style.setProperty('--z', String(even ? off : -o));
        n.style.setProperty('--y', String(-(lvl * H + H / 2)));
        n.style.setProperty('--r', even ? '0deg' : '90deg');
      }
      function viewAngle() { return VIEW_Y + spin * 90; }
      /** Which way along its own length a block on `lvl` comes towards us (+1 / -1). */
      function towardsUs(lvl) {
        var a = viewAngle() * Math.PI / 180;
        return lvl % 2 === 0 ? (Math.sin(a) > 0 ? -1 : 1) : (Math.cos(a) > 0 ? -1 : 1);
      }
      function frontEnd(id) {
        var w = where[id];
        return nodes[id].querySelector(towardsUs(w.lvl) > 0 ? '.sk-end--p' : '.sk-end--n');
      }

      function fit() {
        var r = stage.getBoundingClientRect();
        if (!r.width || !r.height) return;
        var tall = topLevel(tower.levels) + 1 + 2;  // room to grow a little
        u = Math.max(16, Math.min(r.width / 5.2, r.height / (tall * H * 0.92 + 2.8), 90));
        scene.style.setProperty('--u', u.toFixed(2) + 'px');
        view.style.top = (r.height - u * 1.5).toFixed(1) + 'px';
      }
      function aim() { view.style.setProperty('--view', 'rotateX(' + VIEW_X + 'deg) rotateY(' + viewAngle() + 'deg)'); }

      tower.levels.forEach(function (row, lvl) { row.forEach(function (id, slot) { put(id, lvl, slot); }); });
      aim();
      fit();
      ctx.onResize(fit);

      /* ---- sounds ---- */

      function tock(d) { sfx.noise({ freq: 1500, dur: 0.035, q: 6, gain: 0.22, delay: d || 0 }); sfx.tone({ freq: 420, to: 360, dur: 0.05, type: 'triangle', gain: 0.1, delay: d || 0 }); }
      function shh() { sfx.noise({ freq: 700, to: 1300, dur: 0.28, q: 1.2, gain: 0.08 }); }
      function creak(amount) { sfx.tone({ freq: 140, to: 110, dur: 0.35 + amount * 0.4, type: 'sawtooth', gain: 0.03 + amount * 0.05 }); }
      function phew() { sfx.tone({ freq: 520, to: 380, dur: 0.18, type: 'sine', gain: 0.12 }); sfx.tone({ freq: 380, to: 620, dur: 0.22, type: 'sine', gain: 0.12, delay: 0.17 }); }
      function crash() {
        for (var i = 0; i < 14; i++) tock(0.05 + i * 0.045 + Math.random() * 0.03);
        sfx.noise({ freq: 400, to: 160, dur: 0.6, q: 0.7, gain: 0.2, delay: 0.1 });
        sfx.play('boing');
      }

      /* ---- whose turn, and what may be pulled ---- */

      function showTarget() {
        var b = tower.blocks[topId];
        targetTile.style.setProperty('--c', 'var(--' + b.color + ')');
        targetTile.dataset.shape = b.shape;
        targetTile.classList.toggle('is-wild', b.wild || current.any);
        fx.pop(targetTile);
      }

      function mark() {
        var ok = {};
        current.list.forEach(function (c) { ok[c.id] = true; });
        nodes.forEach(function (n, id) {
          var on = !!ok[id] && state === 'pick';
          n.classList.toggle('is-off', !on);
          Array.prototype.forEach.call(n.children, function (f) { f.setAttribute('aria-disabled', on ? 'false' : 'true'); });
        });
      }

      function steadiest() {
        var best = null;
        current.list.forEach(function (c) { if (!best || c.risk < best.risk) best = c; });
        return best;
      }

      function beginTurn(p) {
        turn = p;
        state = 'pick';
        current = choices(tower, topId);
        if (!current.list.length) { finish('tie'); return; }
        ctx.setTurn(p);
        seats.forEach(function (s, i) { s.classList.toggle('is-turn', i === p); });
        showTarget();
        mark();
        if (cancelHesitate) { cancelHesitate(); cancelHesitate = null; }
        if (pulls === 0) ctx.hint(frontEnd(steadiest().id), { delay: 700 });
        var level = ctx.helpFor(p);
        if (level) {
          cancelHesitate = ctx.after(HESITATE_MS[level], function () {
            cancelHesitate = null;
            if (state === 'pick' && turn === p) ctx.hint(frontEnd(steadiest().id));
          });
        }
      }

      /* ---- a pull ---- */

      function pull(id) {
        if (state !== 'pick') return;
        var c = null;
        current.list.forEach(function (x) { if (x.id === id) c = x; });
        if (!c) return;
        if (cancelHesitate) { cancelHesitate(); cancelHesitate = null; }
        state = 'pulling';
        mark();
        ctx.lock(1700);
        var w = where[id];
        var risk = pulls < GRACE ? 0 : c.risk * SAFE[ctx.helpFor(turn)];
        // out it slides...
        nodes[id].classList.add('is-moving');
        put(id, w.lvl, w.slot, towardsUs(w.lvl) * 3.3);
        tock();
        shh();
        tower.levels[w.lvl][w.slot] = -1;
        pulls++;
        // ...the tower thinks about it...
        var shaky = Math.min(1, c.risk * 2.5);
        sway.style.setProperty('--amp', (0.4 + shaky * 2.6).toFixed(2) + 'deg');
        sway.classList.remove('is-swaying');
        void sway.offsetWidth;
        sway.classList.add('is-swaying');
        creak(shaky);
        var roll = rigged != null ? rigged : Math.random();
        ctx.after(380, function () {
          if (roll < risk) { tumble(w.lvl); return; }
          // ...it holds. Up and onto the top it goes.
          var to = nextSpot(tower.levels);
          var side = towardsUs(to.lvl) * 3.3;
          nodes[id].style.setProperty('--y', String(-(to.lvl * H + H * 1.6)));
          ctx.after(330, function () {
            if (state !== 'pulling') return;
            put(id, to.lvl, to.slot, side);
            nodes[id].style.setProperty('--y', String(-(to.lvl * H + H * 1.6)));
            ctx.after(260, function () {
              if (state !== 'pulling') return;
              if (!tower.levels[to.lvl]) tower.levels[to.lvl] = [-1, -1, -1];
              tower.levels[to.lvl][to.slot] = id;
              where[id] = { lvl: to.lvl, slot: to.slot };
              put(id, to.lvl, to.slot);
              ctx.after(300, function () {
                if (state !== 'pulling') return;
                nodes[id].classList.remove('is-moving');
                tock();
                fx.pop(targetTile);
                settle(w.lvl);
                topId = id;
                fit();
                if (pulls >= MAX_PULLS) { finish('tie'); return; }
                beginTurn(1 - turn);
              });
            });
          });
        });
      }

      /** A level left standing on one edge block wiggles that block into the middle: it held, after all. */
      function settle(lvl) {
        var row = tower.levels[lvl];
        if (countIn(row) !== 1 || row[1] >= 0) { if (countIn(row) <= 1) phew(); return; }
        var id = row[0] >= 0 ? row[0] : row[2];
        row[0] = -1; row[2] = -1; row[1] = id;
        where[id] = { lvl: lvl, slot: 1 };
        put(id, lvl, 1);
        phew();
      }

      /** Down it comes: everything from the weak level up tips over and scatters across the floor. */
      function tumble(fromLvl) {
        state = 'falling';
        if (cancelHesitate) { cancelHesitate(); cancelHesitate = null; }
        sway.classList.remove('is-swaying');
        // everything shows its colours again for the crash
        nodes.forEach(function (n) { n.classList.remove('is-off'); });
        var dir = Math.random() * Math.PI * 2;
        tower.levels.forEach(function (row, lvl) {
          if (lvl < fromLvl) return;
          row.forEach(function (id, slot) {
            if (id < 0) return;
            var n = nodes[id], h = lvl - fromLvl + 1, spread = 0.9 + h * 0.32 + Math.random() * 0.6;
            var a = dir + (Math.random() - 0.5) * 1.1;
            n.classList.add('is-falling');
            n.style.setProperty('--fall', ((h * 0.04) + Math.random() * 0.08).toFixed(2) + 's');
            n.style.setProperty('--x', (Math.cos(a) * spread + (slot - 1) * 0.4).toFixed(2));
            n.style.setProperty('--z', (Math.sin(a) * spread).toFixed(2));
            n.style.setProperty('--y', String(-H / 2 - Math.random() * 0.25));
            n.style.setProperty('--rx', util.pick([-90, 90, 180, 0]) + 'deg');
            n.style.setProperty('--rz', (Math.random() * 80 - 40).toFixed(0) + 'deg');
            n.style.setProperty('--r', (Math.random() * 360).toFixed(0) + 'deg');
          });
        });
        // the block that was being pulled goes too
        nodes.forEach(function (n) { if (n.classList.contains('is-moving')) { n.classList.add('is-falling'); n.style.setProperty('--y', String(-H / 2)); } });
        crash();
        ctx.after(250, function () { fx.shake(stage); });
        finish(1 - turn, 1600);
      }

      function finish(result, delay) {
        if (state === 'done') return;
        state = 'done';
        if (cancelHesitate) { cancelHesitate(); cancelHesitate = null; }
        if (result === 'tie') mark();
        seats.forEach(function (s) { s.classList.remove('is-turn'); });
        if (result === 'tie') {
          nodes.forEach(function (n) { n.classList.remove('is-off'); });
          // so tall it touches the sky
          sway.classList.add('is-proud');
          sfx.play('match');
          var c = fx.centerOf(stage);
          fx.burst(c.x, c.y - u * 3, { emoji: '⭐', count: 10, distance: 140, size: 26 });
        }
        ctx.win(result, { delay: delay || 1200, emoji: '🧱' });
      }

      /* ---- input ---- */

      ctx.tap(stage, function (ev, f) { pull(+f.dataset.id); }, { delegate: '.sk-face', slop: 34 });
      ctx.tap(turnBtn, function () {
        if (state === 'done' || state === 'falling') return;
        spin = (spin + 1) % 4;
        aim();
        sfx.play('whoosh');
        // the ghost hand follows the block it was pointing at
        if (state === 'pick' && pulls === 0) ctx.after(650, function () { if (state === 'pick' && pulls === 0) ctx.hint(frontEnd(steadiest().id)); });
      });

      beginTurn(turn);

      ctx.expose({
        get state() { return state; },
        get turn() { return turn; },
        get pulls() { return pulls; },
        get topId() { return topId; },
        get top() { return tower.blocks[topId]; },
        get levels() { return tower.levels.map(function (r) { return r.slice(); }); },
        get blocks() { return tower.blocks.slice(); },
        get choices() { return current.list.map(function (c) { return { id: c.id, lvl: c.lvl, slot: c.slot, risk: c.risk }; }); },
        get any() { return current.any; },
        get spin() { return spin; },
        get u() { return u; },
        /** Tests only: the tumble roll (0..1) for every pull from now on, or null for chance. */
        rig: function (v) { rigged = v; },
        frontEnd: function (id) { return frontEnd(id); },
        LEVELS: LEVELS, MAX_PULLS: MAX_PULLS, GRACE: GRACE, SAFE: SAFE,
        makeTower: makeTower, matches: matches, riskOf: riskOf, nextSpot: nextSpot, topLevel: topLevel, pullable: pullable, choicesFor: choices,
      });
    },
  });
})();
