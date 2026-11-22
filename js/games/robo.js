/* Robo Path — program your robot! Each turn you plan up to three moves with
 * the arrow buttons (dotted footprints show where the robot will go), then
 * press go and watch it run the program: it picks up every strawberry it
 * rolls over, and goes BONK into trees, the edge of the field and the other
 * robot (then carries on with the next move). When the last strawberry is
 * picked, whoever has more wins.
 *
 * Arrows are screen directions (up is up), so a phone on its side changes
 * nothing. The quiet handicap for a little player: if she hesitates, a ghost
 * hand points at a good arrow; and at the most help a strawberry right next
 * to the end of her run hops into her robot.
 * state: plan -> run -> plan (other player) ... -> done
 */
(function () {
  'use strict';

  var SIZE = 6;
  var BERRIES = 8;
  var TREES = 5;
  var SLOTS = 3;
  var STEP_MS = 420;
  var DIRS = { up: { x: 0, y: -1, icon: '⬆️' }, down: { x: 0, y: 1, icon: '⬇️' }, left: { x: -1, y: 0, icon: '⬅️' }, right: { x: 1, y: 0, icon: '➡️' } };
  var HESITATE_MS = [0, 4000, 2500];

  /* ---------------------------------------------------------- pure rules */

  function key(x, y) { return x + ',' + y; }

  /** Can every open square be reached from the robots' corners? */
  function allReachable(trees, starts) {
    var seen = {}, q = starts.map(function (s) { return [s.x, s.y]; });
    q.forEach(function (p) { seen[key(p[0], p[1])] = true; });
    while (q.length) {
      var p = q.shift();
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
        var x = p[0] + d[0], y = p[1] + d[1], k = key(x, y);
        if (x < 0 || y < 0 || x >= SIZE || y >= SIZE || seen[k] || trees[k]) return;
        seen[k] = true;
        q.push([x, y]);
      });
    }
    var open = 0;
    for (var y = 0; y < SIZE; y++) for (var x = 0; x < SIZE; x++) if (!trees[key(x, y)]) open++;
    return Object.keys(seen).length === open;
  }

  /** A field: {trees: {key: true}, berries: {key: true}, starts: [{x, y}, {x, y}]}. Every berry can be reached. */
  function makeField(rnd) {
    rnd = rnd || Math.random;
    var starts = [{ x: 0, y: SIZE - 1 }, { x: SIZE - 1, y: SIZE - 1 }];
    for (var attempt = 0; attempt < 300; attempt++) {
      var taken = {}, trees = {}, berries = {};
      starts.forEach(function (s) { taken[key(s.x, s.y)] = true; });
      // keep the squares next to each start open, so nobody starts boxed in
      [[1, SIZE - 1], [0, SIZE - 2], [SIZE - 2, SIZE - 1], [SIZE - 1, SIZE - 2]].forEach(function (p) { taken[key(p[0], p[1])] = true; });
      var spot = function () {
        for (var t = 0; t < 100; t++) {
          var x = Math.floor(rnd() * SIZE), y = Math.floor(rnd() * SIZE), k = key(x, y);
          if (!taken[k]) { taken[k] = true; return k; }
        }
        return null;
      };
      for (var i = 0; i < TREES; i++) { var tk = spot(); if (tk) trees[tk] = true; }
      if (!allReachable(trees, starts)) continue;
      for (var j = 0; j < BERRIES; j++) { var bk = spot(); if (bk) berries[bk] = true; }
      if (Object.keys(berries).length < BERRIES) continue;
      return { trees: trees, berries: berries, starts: starts };
    }
    return { trees: {}, berries: {}, starts: starts };
  }

  /**
   * Run a program: from `at`, each move goes one square in its direction
   * unless a tree, the edge or `other` (the other robot) is in the way (a bonk:
   * it stays put). -> [{x, y, bonk}] one per move.
   */
  function simulate(at, program, trees, other) {
    var x = at.x, y = at.y, out = [];
    program.forEach(function (m) {
      var d = DIRS[m], nx = x + d.x, ny = y + d.y;
      var blocked = nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE || trees[key(nx, ny)] || (other && other.x === nx && other.y === ny);
      if (!blocked) { x = nx; y = ny; }
      out.push({ x: x, y: y, bonk: !!blocked });
    });
    return out;
  }

  /** The first move of a shortest path from `at` to the nearest berry (avoiding trees and the other robot), or null. */
  function bestFirstMove(at, trees, berries, other) {
    var seen = {}, q = [{ x: at.x, y: at.y, first: null }];
    seen[key(at.x, at.y)] = true;
    while (q.length) {
      var p = q.shift();
      if (p.first && berries[key(p.x, p.y)]) return p.first;
      for (var m in DIRS) {
        var nx = p.x + DIRS[m].x, ny = p.y + DIRS[m].y, k = key(nx, ny);
        if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE || seen[k] || trees[k] || (other && other.x === nx && other.y === ny)) continue;
        seen[k] = true;
        q.push({ x: nx, y: ny, first: p.first || m });
      }
    }
    return null;
  }

  MG.registerGame({
    id: 'robo',
    name: 'Robo Path',
    emoji: '🤖',
    color: 'tangerine',
    howTo: 'Program your robot. Tap up to three arrows (the dotted footprints show the plan), then the green go button: the robot does the moves one by one, picking up every strawberry it rolls over. Trees, the edge and the other robot go BONK. When the strawberries are gone, whoever has more wins.',

    mount: function (root, ctx) {
      var el = ctx.el, sfx = ctx.sfx, fx = ctx.fx, util = ctx.util;
      var players = ctx.players;

      var field = makeField(Math.random);
      var trees = field.trees, berries = field.berries;
      var bots = [{ x: field.starts[0].x, y: field.starts[0].y }, { x: field.starts[1].x, y: field.starts[1].y }];
      var got = [0, 0];
      var state = 'plan';
      var turn = ctx.firstPlayer;
      var program = [];
      var cancelHesitate = null;
      var runs = 0;
      var lastAdd = -1;              // fingers landing together on an arrow add one move, not several

      /* ---- build ---- */

      var squares = {}, berryNodes = {};
      var cells = [];
      for (var y = 0; y < SIZE; y++) {
        for (var x = 0; x < SIZE; x++) {
          var k = key(x, y);
          var c = el('div', { class: 'rb-cell' + ((x + y) % 2 ? ' is-alt' : ''), style: { left: (x / SIZE * 100) + '%', top: (y / SIZE * 100) + '%' } });
          if (trees[k]) c.appendChild(el('span', { class: 'rb-thing rb-tree', 'aria-hidden': 'true' }, ctx.sticker('🌳')));
          if (berries[k]) { berryNodes[k] = el('span', { class: 'rb-thing rb-berry', 'aria-hidden': 'true' }, ctx.sticker('🍓')); c.appendChild(berryNodes[k]); }
          squares[k] = c;
          cells.push(c);
        }
      }
      var steps = el('div', { class: 'rb-steps', 'aria-hidden': 'true' });
      var botNodes = players.map(function (p) {
        return el('div', { class: 'rb-bot', 'data-p': String(p.index), style: { '--c': p.color, '--c-dark': p.dark } },
          el('span', { class: 'rb-antenna' }), ctx.sticker(p.emoji));
      });
      var ghost = el('div', { class: 'rb-ghost', 'aria-hidden': 'true', hidden: true });
      var fieldEl = el('div', { class: 'rb-field', role: 'img', 'aria-label': 'The field' }, cells, steps, ghost, botNodes);
      var fieldBox = el('div', { class: 'rb-fieldbox' }, fieldEl);

      var baskets = players.map(function (p) {
        var pile = el('div', { class: 'rb-pile' });
        var node = el('div', { class: 'rb-basket', 'data-p': String(p.index), style: { '--c': p.color, '--c-dark': p.dark, '--c-soft': p.soft } },
          el('div', { class: 'rb-who' }, ctx.sticker(p.emoji)), pile);
        return { node: node, pile: pile };
      });

      var slots = [];
      for (var s = 0; s < SLOTS; s++) slots.push(el('span', { class: 'rb-slot' }));
      var undoBtn = el('button', { type: 'button', class: 'rb-key rb-undo', 'aria-label': 'Take back a move' }, el('span', { 'aria-hidden': 'true', text: '↩️' }));
      var goBtn = el('button', { type: 'button', class: 'rb-key rb-go', 'aria-label': 'Go!' }, el('span', { class: 'rb-go__icon', 'aria-hidden': 'true', text: '▶' }));
      var arrowBtns = {};
      ['up', 'left', 'down', 'right'].forEach(function (m) {
        arrowBtns[m] = el('button', { type: 'button', class: 'rb-key rb-arrow', 'data-m': m, 'aria-label': m }, el('span', { 'aria-hidden': 'true', text: DIRS[m].icon }));
      });
      var pad = el('div', { class: 'rb-pad' }, arrowBtns.up, arrowBtns.left, arrowBtns.down, arrowBtns.right);
      var plan = el('div', { class: 'rb-plan' }, undoBtn, el('div', { class: 'rb-slots' }, slots), goBtn);
      var controls = el('div', { class: 'rb-controls' }, plan, pad);
      var scene = el('div', { class: 'rb-scene' }, baskets[0].node, fieldBox, controls, baskets[1].node);
      root.appendChild(scene);

      function fit() {
        var r = fieldBox.getBoundingClientRect();
        if (!r.width || !r.height) return;
        var side = Math.floor(Math.min(r.width, r.height));
        fieldEl.style.width = side + 'px';
        fieldEl.style.height = side + 'px';
        fieldEl.style.setProperty('--sq', (side / SIZE).toFixed(2) + 'px');
      }
      fit();
      ctx.onResize(fit);

      /* ---- drawing ---- */

      function placeBot(i) {
        botNodes[i].style.left = ((bots[i].x + 0.5) / SIZE * 100) + '%';
        botNodes[i].style.top = ((bots[i].y + 0.5) / SIZE * 100) + '%';
      }

      /** The plan, drawn: numbered footprints along the way, and a see-through robot where it will end up. */
      function preview() {
        steps.textContent = '';
        slots.forEach(function (sl, i) {
          sl.textContent = program[i] ? DIRS[program[i]].icon : '';
          sl.classList.toggle('is-on', !!program[i]);
        });
        var path = simulate(bots[turn], program, trees, bots[1 - turn]);
        path.forEach(function (p, i) {
          var dot = el('span', { class: 'rb-step' + (p.bonk ? ' is-bonk' : ''), style: { left: ((p.x + 0.5) / SIZE * 100) + '%', top: ((p.y + 0.5) / SIZE * 100) + '%', '--i': i } });
          for (var d = 0; d <= i; d++) dot.appendChild(el('span', { class: 'rb-dot' }));
          steps.appendChild(dot);
        });
        if (path.length) {
          var last = path[path.length - 1];
          ghost.hidden = false;
          ghost.style.left = ((last.x + 0.5) / SIZE * 100) + '%';
          ghost.style.top = ((last.y + 0.5) / SIZE * 100) + '%';
        } else ghost.hidden = true;
        var full = program.length >= SLOTS;
        Object.keys(arrowBtns).forEach(function (m) { arrowBtns[m].setAttribute('aria-disabled', full || state !== 'plan' ? 'true' : 'false'); });
        undoBtn.setAttribute('aria-disabled', program.length && state === 'plan' ? 'false' : 'true');
        goBtn.setAttribute('aria-disabled', program.length && state === 'plan' ? 'false' : 'true');
        goBtn.classList.toggle('is-ready', program.length > 0 && state === 'plan');
      }

      function drawBasket(i) {
        var pile = baskets[i].pile;
        while (pile.children.length < got[i]) {
          var b = ctx.sticker('🍓', 'rb-got');
          pile.appendChild(b);
          fx.pop(b);
        }
      }

      /* ---- sounds ---- */

      function beep(m) { var f = { up: 880, right: 784, down: 587, left: 659 }[m]; sfx.tone({ freq: f, dur: 0.08, type: 'square', gain: 0.06 }); }
      function whirr() { sfx.tone({ freq: 220, to: 330, dur: 0.18, type: 'sawtooth', gain: 0.05 }); }
      function bonk() { sfx.tone({ freq: 160, to: 90, dur: 0.18, type: 'square', gain: 0.1 }); sfx.noise({ freq: 600, dur: 0.06, q: 1, gain: 0.12 }); }

      /* ---- turns ---- */

      function setTurn(p) {
        turn = p;
        state = 'plan';
        program = [];
        ctx.setTurn(p);
        controls.style.setProperty('--c', players[p].color);
        controls.style.setProperty('--c-dark', players[p].dark);
        botNodes.forEach(function (b, i) { b.classList.toggle('is-turn', i === p); });
        baskets.forEach(function (b, i) { b.node.classList.toggle('is-turn', i === p); });
        preview();
        armHint();
      }

      /** Invisible help: if a little player hesitates, a ghost hand on an arrow that heads for the nearest strawberry (or on go). */
      function armHint() {
        if (cancelHesitate) { cancelHesitate(); cancelHesitate = null; }
        var level = ctx.helpFor(turn);
        if (runs === 0 && !program.length) { ctx.hint(arrowBtns[bestFirstMove(bots[turn], trees, berries, bots[1 - turn]) || 'up'], { delay: 800 }); return; }
        if (!level || state !== 'plan') return;
        var who = turn;
        cancelHesitate = ctx.after(HESITATE_MS[level], function () {
          cancelHesitate = null;
          if (state !== 'plan' || turn !== who) return;
          if (program.length >= SLOTS) { ctx.hint(goBtn); return; }
          var end = simulate(bots[who], program, trees, bots[1 - who]);
          var from = end.length ? end[end.length - 1] : bots[who];
          var m = bestFirstMove(from, trees, berries, bots[1 - who]);
          ctx.hint(m && program.length < SLOTS ? arrowBtns[m] : goBtn);
        });
      }

      function add(m) {
        if (state !== 'plan' || program.length >= SLOTS) return;
        if (lastAdd >= 0 && ctx.time - lastAdd < 0.12) return;
        lastAdd = ctx.time;
        program.push(m);
        beep(m);
        fx.pop(slots[program.length - 1]);
        preview();
        armHint();
      }

      function takeBack() {
        if (state !== 'plan' || !program.length) return;
        program.pop();
        sfx.play('slide');
        preview();
        armHint();
      }

      function go() {
        if (state !== 'plan' || !program.length) return;
        if (cancelHesitate) { cancelHesitate(); cancelHesitate = null; }
        state = 'run';
        runs++;
        preview();
        var me = turn;
        var path = simulate(bots[me], program, trees, bots[1 - me]);
        sfx.play('start');
        var k = 0;
        var stepOnce = function () {
          if (state !== 'run') return;
          if (k >= path.length) { afterRun(me); return; }
          var p = path[k];
          slots.forEach(function (sl, i) { sl.classList.toggle('is-now', i === k); });
          if (p.bonk) {
            bonk();
            botNodes[me].classList.remove('is-bonk'); void botNodes[me].offsetWidth; botNodes[me].classList.add('is-bonk');
          } else {
            bots[me] = { x: p.x, y: p.y };
            placeBot(me);
            whirr();
            pick(me, key(p.x, p.y));
          }
          k++;
          ctx.after(STEP_MS, stepOnce);
        };
        ctx.after(250, stepOnce);
      }

      function pick(i, k) {
        if (!berries[k]) return;
        delete berries[k];
        got[i]++;
        ctx.setScore(i, got[i]);
        var n = berryNodes[k];
        var c = fx.centerOf(n);
        fx.burst(c.x, c.y, { emoji: '✨', count: 5, distance: 40, size: 16 });
        n.classList.add('is-gone');
        sfx.play('munch');
        sfx.scale(got[i] + 2, { delay: 0.1 });
        drawBasket(i);
      }

      function afterRun(me) {
        slots.forEach(function (sl) { sl.classList.remove('is-now'); });
        // the most help: a strawberry right next to where she stopped hops into her robot
        if (ctx.helpFor(me) >= 2) {
          var b = bots[me];
          var near = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(function (d) { return key(b.x + d[0], b.y + d[1]); }).filter(function (k2) { return berries[k2]; })[0];
          if (near) { botNodes[me].classList.add('is-bonk'); pick(me, near); }
        }
        if (!Object.keys(berries).length) { finish(); return; }
        ctx.after(300, function () { if (state === 'run') setTurn(1 - me); });
      }

      function finish() {
        state = 'done';
        program = [];
        preview();
        botNodes.forEach(function (b) { b.classList.remove('is-turn'); });
        var w = got[0] === got[1] ? 'tie' : got[0] > got[1] ? 0 : 1;
        (w === 'tie' ? [0, 1] : [w]).forEach(function (i) { botNodes[i].classList.add('is-champ'); });
        sfx.play('match');
        ctx.win(w, { delay: 1100, emoji: '🍓' });
      }

      /* ---- input ---- */

      ctx.tap(pad, function (ev, b) { add(b.dataset.m); fx.pop(b); }, { delegate: '.rb-arrow', slop: 10 });
      ctx.tap(undoBtn, takeBack);
      ctx.tap(goBtn, go);

      /* ---- go ---- */

      placeBot(0); placeBot(1);
      setTurn(turn);

      ctx.expose({
        get state() { return state; },
        get turn() { return turn; },
        get program() { return program.slice(); },
        get bots() { return bots.map(function (b) { return { x: b.x, y: b.y }; }); },
        get got() { return got.slice(); },
        get berries() { return Object.keys(berries); },
        get trees() { return Object.keys(trees); },
        SIZE: SIZE, SLOTS: SLOTS, BERRIES: BERRIES,
        makeField: makeField, simulate: simulate, bestFirstMove: bestFirstMove, allReachable: allReachable, key: key,
        /** Tests only: the shortest way to the nearest strawberry for whoever's turn it is, as moves (at most n). */
        route: function (n) {
          var out = [], at = { x: bots[turn].x, y: bots[turn].y }, left = {};
          Object.keys(berries).forEach(function (k2) { left[k2] = true; });
          for (var i = 0; i < n; i++) {
            var m = bestFirstMove(at, trees, left, bots[1 - turn]);
            if (!m) break;
            out.push(m);
            at = { x: at.x + DIRS[m].x, y: at.y + DIRS[m].y };
            delete left[key(at.x, at.y)];
          }
          return out;
        },
      });
    },
  });
})();
