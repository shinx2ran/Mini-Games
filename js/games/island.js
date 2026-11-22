/* Treasure Island — explore an island hidden under clouds. On your turn, tap
 * your footprints die (one to three footprints), then tap one of the glowing
 * squares that far away: your explorer walks there, and every cloud on the
 * way puffs away. Walk over a gem or a key to pick it up; walk over a
 * treasure chest with a key and it opens (three gems!). Stop on the parrot
 * and it flies you somewhere new; stop on the crab and it snips a gem off you
 * and hides it under a cloud. When every gem is found, the richest explorer
 * wins.
 *
 * Squares are counted in steps (no diagonals). The quiet handicap for a
 * little player: her footprints die rolls bigger, the crab only tickles her,
 * and if she hesitates a ghost hand points at a good square.
 * state: roll -> rolling -> choose -> walk -> roll (other player) ... -> done
 */
(function () {
  'use strict';

  var SIZE = 6;
  var GEMS = 8, KEYS = 2, CHESTS = 2, CHEST_GEMS = 3;
  var STEP_MS = 300;
  var DIE = [[1, 2, 3], [1, 2, 2, 3, 3, 3], [2, 3, 3]];   // footprints, by help level
  var HESITATE_MS = [0, 4000, 2500];
  var FILL = ['🌴', '🐚', '🌴', '🌺', '🐚', '🌴'];

  /* ---------------------------------------------------------- pure rules */

  function key(x, y) { return x + ',' + y; }

  /** The island: {tiles: {key: {what, open}}, starts}. what: gem | key | chest | parrot | crab | null (scenery). */
  function deal(rnd) {
    rnd = rnd || Math.random;
    var starts = [{ x: 0, y: SIZE - 1 }, { x: SIZE - 1, y: SIZE - 1 }];
    var keys = [];
    for (var y = 0; y < SIZE; y++) for (var x = 0; x < SIZE; x++) {
      if ((x === starts[0].x && y === starts[0].y) || (x === starts[1].x && y === starts[1].y)) continue;
      keys.push(key(x, y));
    }
    for (var i = keys.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)), t = keys[i]; keys[i] = keys[j]; keys[j] = t; }
    var bag = [];
    for (var g = 0; g < GEMS; g++) bag.push('gem');
    for (var k = 0; k < KEYS; k++) bag.push('key');
    for (var c = 0; c < CHESTS; c++) bag.push('chest');
    bag.push('parrot', 'crab');
    var tiles = {};
    keys.forEach(function (kk, n) { tiles[kk] = { what: bag[n] || null, open: false, deco: FILL[n % FILL.length], gems: 0 }; });
    starts.forEach(function (s) { tiles[key(s.x, s.y)] = { what: null, open: true, deco: '⛵', gems: 0 }; });
    return { tiles: tiles, starts: starts };
  }

  /** Squares within `n` steps of `at` (not `at` itself): {key: {x, y, d}}. Every square is walkable. */
  function within(at, n) {
    var out = {};
    for (var y = 0; y < SIZE; y++) for (var x = 0; x < SIZE; x++) {
      var d = Math.abs(x - at.x) + Math.abs(y - at.y);
      if (d >= 1 && d <= n) out[key(x, y)] = { x: x, y: y, d: d };
    }
    return out;
  }

  /** A walk from `at` to `to`, square by square (not including `at`): along, then down/up, choosing the cloudier way. */
  function route(at, to, tiles) {
    var cloudy = function (path) { return path.filter(function (p) { var t = tiles[key(p.x, p.y)]; return t && !t.open; }).length; };
    var make = function (xFirst) {
      var path = [], x = at.x, y = at.y;
      var stepX = function () { while (x !== to.x) { x += to.x > x ? 1 : -1; path.push({ x: x, y: y }); } };
      var stepY = function () { while (y !== to.y) { y += to.y > y ? 1 : -1; path.push({ x: x, y: y }); } };
      if (xFirst) { stepX(); stepY(); } else { stepY(); stepX(); }
      return path;
    };
    var a = make(true), b = make(false);
    return cloudy(b) > cloudy(a) ? b : a;
  }

  /** Treasure still out there: loose gems (on any square) and unopened chests. */
  function treasureLeft(tiles) {
    var n = 0;
    Object.keys(tiles).forEach(function (k) {
      var t = tiles[k];
      if (t.what === 'gem') n++;
      if (t.what === 'chest') n += CHEST_GEMS;
      n += t.gems;
    });
    return n;
  }

  MG.registerGame({
    id: 'island',
    name: 'Treasure Island',
    emoji: '🏝️',
    color: 'sea',
    howTo: 'Explore the island under the clouds. Tap your footprints die, then a glowing square that far away: you walk there and the clouds on the way puff off. Walk over gems and keys to pick them up; a chest opens if you have a key (three gems). The parrot flies you somewhere new; the crab snips a gem and hides it. When every gem is found, the most gems wins.',

    mount: function (root, ctx) {
      var el = ctx.el, sfx = ctx.sfx, fx = ctx.fx, util = ctx.util;
      var players = ctx.players;

      var island = deal(Math.random);
      var tiles = island.tiles;
      var pos = [{ x: island.starts[0].x, y: island.starts[0].y }, { x: island.starts[1].x, y: island.starts[1].y }];
      var bags = [{ gems: 0, keys: 0 }, { gems: 0, keys: 0 }];
      var state = 'roll';
      var turn = ctx.firstPlayer;
      var roll = 0, rolls = 0;
      var reach = {};
      var rigged = [];
      var cancelHesitate = null;
      var hinted = false;
      var rusty = false;          // only shut chests left: their locks rust off and anyone can open them

      /* ---- build ---- */

      var squares = {};
      Object.keys(tiles).forEach(function (k) {
        var p = k.split(',').map(Number), t = tiles[k];
        var thing = el('span', { class: 'il-thing', 'aria-hidden': 'true' });
        var node = el('button', {
          type: 'button', class: 'il-sq' + (t.open ? ' is-open' : ''), 'data-k': k, 'aria-label': 'Square', 'aria-disabled': 'true',
          style: { left: (p[0] / SIZE * 100) + '%', top: (p[1] / SIZE * 100) + '%' },
        }, el('span', { class: 'il-sand' }), thing, el('span', { class: 'il-cloud', 'aria-hidden': 'true' }, ctx.sticker('☁️')));
        squares[k] = { node: node, thing: thing };
      });
      var walkers = players.map(function (p) {
        return el('div', { class: 'il-walker', 'data-p': String(p.index), style: { '--c': p.color, '--c-dark': p.dark } }, ctx.sticker(p.emoji));
      });
      var map = el('div', { class: 'il-map', role: 'grid', 'aria-label': 'The island' }, Object.keys(squares).map(function (k) { return squares[k].node; }), walkers);
      var mapBox = el('div', { class: 'il-mapbox' }, map);

      var seats = players.map(function (p) {
        var face = el('span', { class: 'il-face' });
        var die = el('button', { type: 'button', class: 'il-die', 'data-p': String(p.index), 'aria-label': 'Roll, player ' + (p.index + 1), style: { '--c': p.color, '--c-dark': p.dark, '--c-soft': p.soft } }, face);
        var gems = el('div', { class: 'il-gems' }), keys = el('div', { class: 'il-keys' });
        var node = el('div', { class: 'il-seat', 'data-p': String(p.index), style: { '--c': p.color, '--c-dark': p.dark, '--c-soft': p.soft } },
          el('div', { class: 'il-who' }, ctx.sticker(p.emoji)), die, el('div', { class: 'il-bag' }, keys, gems));
        return { node: node, die: die, face: face, gems: gems, keys: keys };
      });
      var scene = el('div', { class: 'il-scene' }, seats[0].node, mapBox, seats[1].node);
      root.appendChild(scene);

      function fit() {
        var r = mapBox.getBoundingClientRect();
        if (!r.width || !r.height) return;
        var side = Math.floor(Math.min(r.width, r.height));
        map.style.width = side + 'px';
        map.style.height = side + 'px';
        map.style.setProperty('--sq', (side / SIZE).toFixed(2) + 'px');
      }
      fit();
      ctx.onResize(fit);

      /* ---- drawing ---- */

      function chest(open, unlocked) {
        return el('span', { class: 'il-chest' + (open ? ' is-open' : '') + (unlocked ? ' is-unlocked' : '') }, el('span', { class: 'il-chest__lid' }), el('span', { class: 'il-chest__box' }, el('span', { class: 'il-chest__lock' })));
      }
      function drawSquare(k) {
        var t = tiles[k], s = squares[k];
        s.node.classList.toggle('is-open', t.open);
        s.thing.textContent = '';
        if (!t.open) return;
        if (t.what === 'chest') s.thing.appendChild(chest(false, rusty));
        else if (t.what === 'opened') s.thing.appendChild(chest(true));
        else if (t.what === 'gem') s.thing.appendChild(ctx.sticker('💎'));
        else if (t.what === 'key') s.thing.appendChild(ctx.sticker('🔑'));
        else if (t.what === 'parrot') s.thing.appendChild(ctx.sticker('🦜'));
        else if (t.what === 'crab') s.thing.appendChild(ctx.sticker('🦀'));
        else s.thing.appendChild(ctx.sticker(t.deco || '🌴', 'il-deco'));
        // a gem the crab hid shows in the corner, whatever else is on the square (and even with someone standing on it)
        if (t.gems && t.what !== 'gem') s.thing.appendChild(ctx.sticker('💎', 'il-hidden-gem'));
      }
      function placeWalker(i) {
        var share = pos[0].x === pos[1].x && pos[0].y === pos[1].y;
        var off = share ? (i === 0 ? -0.17 : 0.17) : 0;
        walkers[i].style.left = ((pos[i].x + 0.5 + off) / SIZE * 100) + '%';
        walkers[i].style.top = ((pos[i].y + 0.5 + off * 0.5) / SIZE * 100) + '%';
        walkers[i].classList.toggle('is-shared', share);
      }
      function drawBag(i) {
        var b = bags[i], s = seats[i];
        while (s.gems.children.length < b.gems) { var g = ctx.sticker('💎', 'il-got'); s.gems.appendChild(g); fx.pop(g); }
        while (s.gems.children.length > b.gems) s.gems.removeChild(s.gems.lastChild);
        while (s.keys.children.length < b.keys) { var kk = ctx.sticker('🔑', 'il-got'); s.keys.appendChild(kk); fx.pop(kk); }
        while (s.keys.children.length > b.keys) s.keys.removeChild(s.keys.lastChild);
        ctx.setScore(i, b.gems);
      }
      function showFace(i, n) {
        seats[i].face.textContent = '';
        for (var f = 0; f < n; f++) seats[i].face.appendChild(el('span', { class: 'il-foot', text: '👣' }));
      }

      /* ---- sounds ---- */

      function poof() { sfx.noise({ freq: 900, to: 2400, dur: 0.16, q: 0.8, gain: 0.08 }); }
      function jingle() { sfx.seq([88, 91, 96], { step: 0.05, type: 'sine', gain: 0.12 }); }
      function squawk() { sfx.tone({ freq: 900, to: 1300, dur: 0.1, type: 'sawtooth', gain: 0.06 }); sfx.tone({ freq: 1100, to: 800, dur: 0.12, type: 'sawtooth', gain: 0.06, delay: 0.12 }); }
      function snip() { sfx.noise({ freq: 3000, dur: 0.03, q: 4, gain: 0.16 }); sfx.noise({ freq: 3400, dur: 0.03, q: 4, gain: 0.16, delay: 0.12 }); }

      /* ---- turns ---- */

      function setTurn(p) {
        turn = p;
        state = 'roll';
        reach = {};
        markReach();
        ctx.setTurn(p);
        seats.forEach(function (s, i) {
          s.die.setAttribute('aria-disabled', i === p ? 'false' : 'true');
          s.node.classList.toggle('is-turn', i === p);
        });
        walkers.forEach(function (w, i) { w.classList.toggle('is-turn', i === p); });
        if (!hinted) { hinted = true; ctx.hint(seats[p].die, { delay: 600 }); }
      }

      function markReach() {
        Object.keys(squares).forEach(function (k) {
          var on = state === 'choose' && !!reach[k];
          squares[k].node.classList.toggle('is-reach', on);
          squares[k].node.setAttribute('aria-disabled', on ? 'false' : 'true');
        });
      }

      function doRoll() {
        if (state !== 'roll') return;
        state = 'rolling';
        ctx.lock(700);
        var die = seats[turn].die;
        die.setAttribute('aria-disabled', 'true'); // rolled: it rests until this player's next turn
        die.classList.add('is-rolling');
        sfx.play('roll');
        var flick = ctx.every(90, function () { showFace(turn, 1 + util.rand(3)); });
        roll = rigged.length ? rigged.shift() : util.pick(DIE[ctx.helpFor(turn)] || DIE[0]);
        rolls++;
        ctx.after(600, function () {
          flick();
          die.classList.remove('is-rolling');
          showFace(turn, roll);
          fx.pop(die);
          sfx.play('drop');
          for (var i = 0; i < roll; i++) sfx.scale(4 + i * 2, { delay: 0.1 + i * 0.12 });
          state = 'choose';
          reach = within(pos[turn], roll);
          markReach();
          armHint();
        });
      }

      /** A good square to go to: a known gem or key, a chest when holding a key, else the cloudiest walk. */
      function bestSquare() {
        var best = null, bestScore = -Infinity;
        Object.keys(reach).forEach(function (k) {
          var r = reach[k], path = route(pos[turn], r, tiles), score = 0;
          path.forEach(function (p) {
            var t = tiles[key(p.x, p.y)];
            if (!t.open) score += 1;
            else if (t.what === 'gem' || t.gems) score += 4;
            else if (t.what === 'key') score += 3;
            else if (t.what === 'chest' && (bags[turn].keys || rusty)) score += 8;
          });
          var end = tiles[k];
          if (end.open && end.what === 'crab') score -= 3;
          // ...and, all else equal, end up nearer the treasure still out there
          score -= 0.3 * nearestTreasure(r);
          if (score > bestScore) { bestScore = score; best = k; }
        });
        return best;
      }

      /** Steps from `at` to the nearest thing worth walking to: a gem, a cloud, a key while chests are shut, a chest with a key in hand. */
      function nearestTreasure(at) {
        var chestsShut = Object.keys(tiles).some(function (q) { return tiles[q].what === 'chest'; });
        var best2 = 99;
        Object.keys(tiles).forEach(function (q) {
          var t = tiles[q], worth = !t.open || t.what === 'gem' || t.gems || (t.what === 'key' && chestsShut && !rusty) || (t.what === 'chest' && (bags[turn].keys || rusty));
          if (!worth) return;
          var p = q.split(',').map(Number), d = Math.abs(p[0] - at.x) + Math.abs(p[1] - at.y);
          if (d < best2) best2 = d;
        });
        return best2 === 99 ? 0 : best2;
      }

      function armHint() {
        if (cancelHesitate) { cancelHesitate(); cancelHesitate = null; }
        var level = ctx.helpFor(turn);
        if (rolls === 1) { ctx.hint(squares[bestSquare()].node, { delay: 500 }); return; }
        if (!level) return;
        var who = turn;
        cancelHesitate = ctx.after(HESITATE_MS[level], function () {
          cancelHesitate = null;
          if (state === 'choose' && turn === who) ctx.hint(squares[bestSquare()].node);
        });
      }

      function go(k) {
        if (state !== 'choose' || !reach[k]) return;
        if (cancelHesitate) { cancelHesitate(); cancelHesitate = null; }
        state = 'walk';
        reach = {};
        markReach();
        var p = k.split(',').map(Number);
        var path = route(pos[turn], { x: p[0], y: p[1] }, tiles);
        walk(turn, path, 0);
      }

      /** One square at a time: clouds puff off, and anything to pick up is picked up. */
      function walk(i, path, n) {
        if (state !== 'walk') return;
        if (n >= path.length) { arrive(i); return; }
        pos[i] = path[n];
        placeWalker(0); placeWalker(1);
        walkers[i].classList.remove('is-step'); void walkers[i].offsetWidth; walkers[i].classList.add('is-step');
        sfx.play('hop', { pitch: 380 + n * 60 });
        var k = key(pos[i].x, pos[i].y), t = tiles[k];
        if (!t.open) { t.open = true; poof(); drawSquare(k); }
        pickUp(i, k);
        ctx.after(STEP_MS, function () { walk(i, path, n + 1); });
      }

      function pickUp(i, k) {
        var t = tiles[k], c = fx.centerOf(squares[k].node);
        // a gem the crab hid here is picked up as well as whatever the square holds
        if (t.gems) {
          bags[i].gems += t.gems;
          t.gems = 0;
          sfx.play('ding');
          fx.burst(c.x, c.y, { emoji: '💎', count: 5, distance: 50, size: 18 });
        }
        if (t.what === 'gem') {
          t.what = null;
          bags[i].gems += 1;
          sfx.play('ding');
          fx.burst(c.x, c.y, { emoji: '💎', count: 5, distance: 50, size: 18 });
        } else if (t.what === 'key') {
          t.what = null;
          bags[i].keys++;
          jingle();
          fx.burst(c.x, c.y, { emoji: '✨', count: 5, distance: 40, size: 16 });
        } else if (t.what === 'chest' && (bags[i].keys || rusty)) {
          t.what = 'opened';
          if (bags[i].keys) bags[i].keys--;
          bags[i].gems += CHEST_GEMS;
          sfx.play('match');
          fx.burst(c.x, c.y, { emoji: '💎', count: 10, distance: 80, size: 22 });
        } else if (t.what === 'chest') {
          // locked: it rattles (the key is somewhere on the island)
          squares[k].node.classList.remove('is-locked'); void squares[k].node.offsetWidth; squares[k].node.classList.add('is-locked');
          sfx.play('boop');
        }
        drawSquare(k);
        drawBag(i);
      }

      /** Where the walk ends: the parrot and the crab only do something to whoever stops on them. */
      function arrive(i) {
        var k = key(pos[i].x, pos[i].y), t = tiles[k];
        if (t.what === 'parrot') {
          state = 'fly';
          squawk();
          var clouds = Object.keys(tiles).filter(function (q) { return !tiles[q].open; });
          var dest = clouds.length ? util.pick(clouds) : util.pick(Object.keys(tiles).filter(function (q) { return q !== k; }));
          walkers[i].classList.add('is-flying');
          ctx.after(500, function () {
            var p = dest.split(',').map(Number);
            pos[i] = { x: p[0], y: p[1] };
            placeWalker(0); placeWalker(1);
            ctx.after(650, function () {
              walkers[i].classList.remove('is-flying');
              if (!tiles[dest].open) { tiles[dest].open = true; poof(); drawSquare(dest); }
              pickUp(i, dest);
              end(i);
            });
          });
          return;
        }
        if (t.what === 'crab') {
          state = 'crab';
          snip();
          var cc = fx.centerOf(squares[k].node);
          if (bags[i].gems > 0 && !ctx.helpFor(i)) {
            // snip! one gem goes under a cloud somewhere (or anywhere, once the clouds are gone)
            bags[i].gems--;
            drawBag(i);
            var clouds2 = Object.keys(tiles).filter(function (q) { return !tiles[q].open && q !== k; });
            var spots = clouds2.length ? clouds2 : Object.keys(tiles).filter(function (q) { return q !== k; });
            var hide = util.pick(spots);
            tiles[hide].gems++;
            drawSquare(hide);
            fx.float(cc.x, cc.y - 20, '💎', { size: 30, duration: 900 });
          } else {
            // a little player just gets tickled
            sfx.play('giggle');
            fx.burst(cc.x, cc.y, { emoji: '✨', count: 4, distance: 40, size: 16 });
          }
          squares[k].node.classList.remove('is-locked'); void squares[k].node.offsetWidth; squares[k].node.classList.add('is-locked');
          ctx.after(700, function () { end(i); });
          return;
        }
        end(i);
      }

      function end(i) {
        if (state === 'done') return;
        if (!treasureLeft(tiles)) { finish(); return; }
        // Only shut chests left (every gem found, every cloud gone or not)? Then their locks rust right off:
        // whoever gets there first opens one. Nobody is left with nothing to do for turn after turn.
        if (!rusty && onlyChestsLeft()) {
          rusty = true;
          Object.keys(tiles).forEach(function (q) { if (tiles[q].what === 'chest') { squares[q].node.classList.add('is-rusty'); drawSquare(q); } });
          sfx.tone({ freq: 300, to: 120, dur: 0.4, type: 'triangle', gain: 0.14 });
          sfx.play('pop', { pitch: 300 });
        }
        ctx.after(250, function () { if (state !== 'done') setTurn(1 - i); });
      }

      function onlyChestsLeft() {
        return Object.keys(tiles).every(function (q) { var t = tiles[q]; return t.what !== 'gem' && !t.gems; }) &&
          Object.keys(tiles).some(function (q) { return tiles[q].what === 'chest'; });
      }

      function finish() {
        state = 'done';
        reach = {};
        markReach();
        seats.forEach(function (s) { s.die.setAttribute('aria-disabled', 'true'); s.node.classList.remove('is-turn'); });
        var a = bags[0].gems, b = bags[1].gems, w = a === b ? 'tie' : a > b ? 0 : 1;
        (w === 'tie' ? [0, 1] : [w]).forEach(function (i) { walkers[i].classList.add('is-champ'); });
        // the last clouds blow away: the whole island, at last
        Object.keys(tiles).forEach(function (k) { if (!tiles[k].open) { tiles[k].open = true; drawSquare(k); } });
        sfx.play('match');
        ctx.win(w, { delay: 1300, emoji: '💎' });
      }

      /* ---- input ---- */

      seats.forEach(function (s, i) { ctx.tap(s.die, function () { if (i === turn) doRoll(); }); });
      ctx.tap(map, function (ev, node) { go(node.dataset.k); }, { delegate: '.il-sq', slop: 8 });

      /* ---- go ---- */

      Object.keys(tiles).forEach(drawSquare);
      showFace(0, 1); showFace(1, 1);
      placeWalker(0); placeWalker(1);
      drawBag(0); drawBag(1);
      setTurn(turn);

      ctx.expose({
        get state() { return state; },
        get turn() { return turn; },
        get roll() { return roll; },
        get rolls() { return rolls; },
        get pos() { return pos.map(function (p) { return { x: p.x, y: p.y }; }); },
        get bags() { return bags.map(function (b) { return { gems: b.gems, keys: b.keys }; }); },
        get tiles() { return JSON.parse(JSON.stringify(tiles)); },
        get reach() { return Object.keys(reach); },
        get left() { return treasureLeft(tiles); },
        get rusty() { return rusty; },
        best: function () { return bestSquare(); },
        /** Tests only: the next footprint rolls. */
        rig: function (v) { rigged = v.slice(); },
        /** Tests only: hide a gem on square k, as the crab would. */
        stash: function (k) { tiles[k].gems++; drawSquare(k); },
        /** Tests only: stand explorer i on (x, y) without walking. */
        place: function (i, x, y) { pos[i] = { x: x, y: y }; placeWalker(0); placeWalker(1); },
        SIZE: SIZE, GEMS: GEMS, CHEST_GEMS: CHEST_GEMS,
        deal: deal, within: within, route: route, treasureLeft: treasureLeft, key: key,
      });
    },
  });
})();
