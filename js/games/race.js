/* Super Slow Race — the world's slowest race.
 *
 * Tap one of three leaf piles to see how many hops you get (1, 2 or 3 dots);
 * your slowpoke then hops that many stepping stones towards the picnic.
 * Pure luck, so a 4-year-old wins honestly, and a quiet boost keeps races close.
 * Every race is somewhere new (meadow, pond, snow, beach) with its surprise
 * stones shuffled: two boosts, one present of extra hops, one slip back.
 *
 * Round state machine (`state`):
 *   intro -> pick -> reveal -> hop -> [special] -> swap -> pick -> ...
 *                               `-> finish -> done      (ctx.win is called on entering `finish`)
 * Only `pick` accepts a tap; every other state ignores input.
 */
(function () {
  'use strict';

  var LENGTHS = { short: 10, normal: 14, long: 18 }; // stepping stones between the start mat and the feast
  var BOOST_SLIDE = 2;
  var BOOST_GAP = 4;

  var HOP_MS = 340;                 // with the rest below: one hop every ~460ms, slow enough to count along
  var HOP_REST_MS = 120;
  var TURN_LOCK_MS = 600;           // dead time after the turn passes, so a leftover tap cannot pick for the other player
  var FINALE_MS = 2700;             // first racer on the blanket -> the party

  var EDGE = 14;                    // px kept clear between a pile and the playmat edge
  var ZONE_PAD = 6;                 // px between the path and whatever is beside it
  var ROW_PITCH = 1.25;             // row spacing (in stone units) that keeps a rider clear of the row above
  var HEADROOM = 0.4;               // spare stone units above the first row, for the hop arc
  var GRID_COLUMNS = [3, 4, 5, 6, 7, 8, 10];

  /* Where the race is run. cover: what the three piles are heaped with; boost and slip: the
     surprise stones; feast: what waits at the end; mounts: the two slowpokes. Colours are in the css. */
  var TRACKS = {
    meadow: { cover: ['🍂', '🍁', '🍃'], blooms: ['🌼', '🌷', '🌸'], boost: '🌈', slip: '🍌', feast: ['🧺', '🍓'], mounts: ['🐌', '🐢'] },
    pond: { cover: ['🍃', '🌿', '☘️'], blooms: ['🌿', '🌾', '💧'], boost: '🐸', slip: '💦', feast: ['🍰', '🍒'], mounts: ['🐢', '🦆'] },
    snow: { cover: ['❄️', '☁️', '❄️'], blooms: ['🌲', '⛄', '❄️'], boost: '🛷', slip: '⛸️', feast: ['☕', '🍪'], mounts: ['🐧', '🐌'] },
    beach: { cover: ['🐚', '🌴', '🐚'], blooms: ['🐚', '🌴', '☀️'], boost: '🌊', slip: '🦀', feast: ['🍉', '🍦'], mounts: ['🐢', '🐌'] },
  };
  var TRACK_IDS = ['meadow', 'pond', 'snow', 'beach'];
  var CRITTERS = ['🐞', '🐛', '🐜', '🦔', '🦋'];
  // Six leaves heaped into a mound, back to front: x, y (fractions of the pile), tilt, leaf.
  var HEAP = [[0, -0.2, 8, 0], [-0.15, -0.02, 32, 1], [0.15, -0.03, -28, 0], [-0.27, 0.19, -16, 0], [0.27, 0.2, 22, 1], [0, 0.23, 4, 2]];
  // Meadow flowers: x%, y%. Stones and leaf beds simply cover the ones they land on.
  var BLOOMS = [[7, 5, '🌼'], [52, 2, '🌷'], [94, 9, '🌸'], [30, 21, '🌸'], [71, 27, '🌼'], [4, 41, '🌷'],
    [55, 47, '🌼'], [95, 52, '🌷'], [22, 64, '🌼'], [78, 70, '🌸'], [45, 83, '🌷'], [9, 93, '🌸'], [90, 95, '🌼']];
  var RAINBOW_COLORS = ['var(--berry)', 'var(--tangerine)', 'var(--sun)', 'var(--leaf)', 'var(--sea)', 'var(--grape)'];

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  /* ------------------------------------------------------------ pure rules */

  /**
   * What the three piles hide for a player who is `behindBy` stones behind.
   * help: the grown-up's setting (0 = no boost for anyone); ownHelp: ctx.helpFor(that player).
   */
  function pileSet(behindBy, help, ownHelp) {
    var boosted = (help > 0 && behindBy >= BOOST_GAP) || (ownHelp >= 2 && behindBy >= 1);
    return boosted ? [2, 3, 3] : [1, 2, 3];
  }

  /**
   * The surprises of one race: {stones, finish, count, specials: {stone: kind}}.
   * Two boosts (forward 2), one gift (a lucky dip of 1-3 extra hops) and, if
   * allowed, one slip (back 1). Nothing in the first two stones, nothing that
   * sends you onto another surprise or onto the feast: no chains, and a race
   * is only ever won by your own hops. (The gift keeps that promise when it is
   * opened: see giftHops.)
   */
  function makeCourse(stones, slip, rnd) {
    rnd = rnd || Math.random;
    var want = slip ? 4 : 3;
    var specials;
    // a tight course can paint itself into a corner: shuffle again until every surprise has a home
    for (var attempt = 0; attempt < 40; attempt++) {
      specials = {};
      var taken = {};
      var place = function (kind, lo, hi, reach) {
        var free = [];
        for (var i = lo; i <= hi; i++) {
          if (taken[i]) continue;
          if (reach.some(function (d) { return specials[i + d]; })) continue;
          free.push(i);
        }
        if (!free.length) return;
        var at = free[Math.floor(rnd() * free.length)];
        specials[at] = kind;
        taken[at] = true;
        reach.forEach(function (d) { taken[at + d] = true; });
      };
      var half = Math.floor(stones / 2);
      place('boost', 3, half, [BOOST_SLIDE]);
      place('boost', half + 1, stones - 3, [BOOST_SLIDE]);
      if (slip) place('slip', Math.max(5, half), stones - 1, [-1]);
      place('gift', 3, stones - 2, []);
      if (Object.keys(specials).length === want) break;
    }
    return { stones: stones, finish: stones + 1, count: stones + 2, specials: specials };
  }

  /** The hop counts a gift on stone `at` may hold: 1-3, never onto another surprise or the feast. */
  function giftHops(at, course) {
    return [1, 2, 3].filter(function (h) { return at + h <= course.stones && !course.specials[at + h]; });
  }

  /** Where a racer that STOPS on stone `at` ends up: {kind, to, hops?}, or null for a plain stone. */
  function landing(at, course, rnd) {
    var kind = course.specials[at];
    if (!kind) return null;
    if (kind === 'boost') return { kind: kind, to: at + BOOST_SLIDE };
    if (kind === 'slip') return { kind: kind, to: at - 1 };
    var choices = giftHops(at, course);
    if (!choices.length) return null;
    var hops = choices[Math.floor((rnd || Math.random)() * choices.length)];
    return { kind: 'gift', hops: hops, to: at + hops };
  }

  /**
   * Geometry for a play area of w x h px: leaf-bed sizes (px) and the winding
   * path. Portrait keeps the piles in a band along the bottom, landscape in a
   * column at each player's edge; the path snakes through what is left.
   * Node coordinates are percentages of the play area, so pure scaling needs nothing redone.
   */
  function layoutFor(w, h, count) {
    var NODE_COUNT = count, FINISH = count - 1;
    var landscape = w >= h;
    var gmin = Math.min(w, h);
    var badge = clamp(gmin * 0.105, 34, 58);
    var gap = clamp(gmin * 0.025, 8, 16);
    var pile, side = 0, band = 0;
    if (landscape) {
      pile = clamp(Math.min(w * 0.17 - 2 * EDGE, (h - 2 * EDGE - badge - 3 * gap) / 3), 64, 170);
      side = pile + 2 * EDGE;
    } else {
      pile = clamp(Math.min((w - 2 * EDGE - 2 * gap) / 3, h * 0.2), 64, 150);
      band = pile + EDGE + badge + 4;
    }
    var zone = { x: side + ZONE_PAD, y: 0, w: w - 2 * (side + ZONE_PAD), h: h - band };

    // Pick the grid whose stones come out biggest.
    var best = null;
    GRID_COLUMNS.forEach(function (cols) {
      var rows = Math.ceil(NODE_COUNT / cols);
      var unit = Math.min(zone.w / cols * 0.94, zone.h / (rows * ROW_PITCH + HEADROOM), 150); // (room for a tilted stone's outline)
      var lastRow = NODE_COUNT - cols * (rows - 1);
      var score = lastRow < 3 ? unit * 0.85 : unit; // a picnic alone on its row looks lost
      if (!best || score > best.score) best = { cols: cols, rows: rows, unit: unit, score: score };
    });

    var cols = best.cols, rows = best.rows, unit = best.unit;
    var dx = zone.w / cols;
    var head = unit * HEADROOM;
    var dy = (zone.h - head) / rows;
    var spare = cols * rows - NODE_COUNT; // empty cells after the picnic: it spreads out over them
    var nodes = [];
    for (var i = 0; i < NODE_COUNT; i++) {
      var row = Math.floor(i / cols);
      var col = i % cols + (i === FINISH ? spare / 2 : 0);
      if (row % 2) col = cols - 1 - col;
      nodes.push({
        x: (zone.x + (col + 0.5) * dx) / w * 100,
        // a little below the middle of its cell: the rider needs the room above
        y: (zone.y + head + (row + 0.5) * dy + unit * 0.18) / h * 100,
        row: row,
      });
    }

    // The sandy trail under the stones; each end-of-row turn bulges outwards.
    var bulge = dx * 0.42 / w * 100;
    var trail = 'M' + nodes[0].x + ' ' + nodes[0].y;
    for (var k = 1; k < NODE_COUNT; k++) {
      var a = nodes[k - 1], b = nodes[k];
      if (a.row === b.row) { trail += ' L' + b.x + ' ' + b.y; continue; }
      var out = a.row % 2 ? -bulge : bulge;
      trail += ' C' + (a.x + out) + ' ' + a.y + ' ' + (b.x + out) + ' ' + b.y + ' ' + b.x + ' ' + b.y;
    }

    return {
      w: w, h: h, orient: landscape ? 'landscape' : 'portrait',
      cols: cols, rows: rows, unit: unit, pile: pile, side: side, band: band, badge: badge, gap: gap,
      // the picnic blanket spreads over the empty cells after it, but never past the edge of the path's zone
      picnic: Math.max(1, Math.min(1 + Math.min(spare, 2) * 0.35,
        (2 * Math.min(nodes[FINISH].x / 100 * w - zone.x, zone.x + zone.w - nodes[FINISH].x / 100 * w) - 12) / (unit * 0.92 * 1.06))),
      nodes: nodes, trail: trail,
    };
  }

  /** +1 when the way ahead from node i runs to the right, -1 to the left. */
  function heading(nodes, i) {
    for (var k = i + 1; k < nodes.length; k++) {
      var dx = nodes[k].x - nodes[i].x;
      if (Math.abs(dx) > 0.5) return dx > 0 ? 1 : -1;
    }
    return nodes[i].x >= nodes[i - 1].x ? 1 : -1; // on the picnic: keep facing the way it arrived
  }

  function prefersCalm() {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
  }

  /* ------------------------------------------------------------- the round */

  function mount(root, ctx) {
    var el = ctx.el, util = ctx.util, sfx = ctx.sfx, fx = ctx.fx;
    var calm = prefersCalm();

    /** "Surprise" is a different place every race, carrying on from wherever the last visit stopped. */
    function pickTrack(choice) {
      if (TRACKS[choice]) return choice;
      var next = TRACK_IDS[(TRACK_IDS.indexOf(ctx.load('track', '')) + 1) % TRACK_IDS.length];
      ctx.save('track', next);
      return next;
    }
    var trackId = pickTrack(ctx.opt('track'));
    var track = TRACKS[trackId];
    var course = makeCourse(LENGTHS[ctx.opt('length')] || LENGTHS.normal, ctx.opt('banana'));
    var FINISH = course.finish, NODE_COUNT = course.count; // node 0 is the start mat, the last one the feast

    var state = 'intro';
    var turn = ctx.firstPlayer;
    var pos = [0, 0];
    var turnsTaken = [0, 0];
    var hand = null;   // this turn's piles: {values, piles, picked, critter}
    var lastSpecial = null;
    var L = null;      // current layout, see layoutFor()

    /* ---- sounds: the game's own little orchestra ---- */

    var snd = {
      yawn: function () {
        sfx.tone({ freq: 300, to: 520, dur: 0.3, type: 'sine', gain: 0.12 });
        sfx.tone({ freq: 520, to: 230, dur: 0.45, type: 'sine', gain: 0.12, delay: 0.28 });
      },
      plops: function () {
        for (var i = 0; i < 3; i++) sfx.tone({ freq: 240 + i * 50, to: 150 + i * 30, dur: 0.09, type: 'sine', gain: 0.16, delay: 0.06 + i * 0.09 });
      },
      rustle: function () {
        for (var i = 0; i < 5; i++) sfx.noise({ freq: util.randf(2600, 5200), dur: 0.05, gain: 0.08, q: 1.4, delay: i * 0.06 + Math.random() * 0.02 });
      },
      blow: function () {
        sfx.noise({ freq: 700, to: 4200, dur: 0.3, gain: 0.14, q: 0.7 });
        sfx.noise({ freq: 3800, dur: 0.06, gain: 0.06, q: 2, delay: 0.26 });
      },
      puff: function () { sfx.noise({ freq: 900, to: 2600, dur: 0.14, gain: 0.07, q: 0.8 }); },
      pip: function (k, delay) { sfx.tone({ freq: 620 * Math.pow(1.26, k), dur: 0.11, type: 'sine', gain: 0.2, delay: delay }); },
      boing: function (n) {
        var f = 185 * Math.pow(1.2, n);
        sfx.tone({ freq: f, to: f * 2.1, dur: 0.15, type: 'sine', gain: 0.24 });
        sfx.tone({ freq: f * 2.1, to: f * 1.5, dur: 0.11, type: 'sine', gain: 0.12, delay: 0.14 });
      },
      thud: function () { sfx.tone({ freq: 150, to: 85, dur: 0.09, type: 'sine', gain: 0.2 }); },
      harp: function () {
        [60, 62, 64, 67, 69, 72, 74, 76, 79, 81, 84].forEach(function (m, i) {
          sfx.note(m, 0.55, { type: i % 2 ? 'sine' : 'triangle', gain: 0.11, delay: i * 0.05 });
        });
      },
      whistle: function () {
        sfx.tone({ freq: 1250, to: 300, dur: 0.55, type: 'sine', gain: 0.2 });
        sfx.tone({ freq: 210, to: 150, dur: 0.13, type: 'triangle', gain: 0.2, delay: 0.58 });
      },
      squeak: function () {
        sfx.tone({ freq: 1700, to: 2400, dur: 0.07, type: 'sine', gain: 0.09 });
        sfx.tone({ freq: 1900, to: 2600, dur: 0.07, type: 'sine', gain: 0.09, delay: 0.11 });
      },
      tada: function () { sfx.seq([67, 72, 76, 79, 84], { step: 0.07, type: 'triangle', gain: 0.2 }); },
      zoom: function () { sfx.noise({ freq: 400, to: 3600, dur: 0.7, gain: 0.13, q: 0.8 }); },
      nom: function () {
        sfx.noise({ freq: 650, dur: 0.06, gain: 0.2, q: 1.6 });
        sfx.tone({ freq: 260, to: 200, dur: 0.07, type: 'triangle', gain: 0.1, delay: 0.02 });
      },
    };

    /* ---- the meadow ---- */

    var trail = el('div', { class: 'rc-trail', 'aria-hidden': 'true' });
    trail.innerHTML = '<svg viewBox="0 0 100 100" preserveAspectRatio="none"><path class="rc-trail__sand"/><path class="rc-trail__steps"/></svg>';
    var trailPaths = Array.prototype.slice.call(trail.querySelectorAll('path'));

    var blooms = el('div', { class: 'rc-blooms', 'aria-hidden': 'true' }, BLOOMS.map(function (b, k) {
      return el('span', { class: 'rc-bloom', text: track.blooms[k % track.blooms.length], style: { left: b[0] + '%', top: b[1] + '%' } });
    }));

    var nodes = util.range(NODE_COUNT).map(function (i) {
      var kind = i === 0 ? 'start' : i === FINISH ? 'picnic' : course.specials[i] || 'stone';
      var node = el('div', { class: 'rc-node rc-node--' + kind, style: { '--tilt': ((i * 37) % 13 - 6) + 'deg' } });
      if (kind === 'start') {
        node.appendChild(el('span', { class: 'rc-pad' }));
        node.appendChild(ctx.sticker('🏁', 'rc-flag'));
      } else if (kind === 'picnic') {
        node.appendChild(el('span', { class: 'rc-blanket' }));
        node.appendChild(ctx.sticker(track.feast[0], 'rc-basket'));
        node.appendChild(ctx.sticker(track.feast[1], 'rc-berry'));
      } else {
        node.appendChild(el('span', { class: 'rc-stone' }));
        if (kind !== 'stone') node.appendChild(ctx.sticker(kind === 'boost' ? track.boost : kind === 'slip' ? track.slip : '🎁', 'rc-mark'));
      }
      return node;
    });

    var racers = ctx.players.map(function (p, i) {
      var look = el('div', { class: 'rc-racer__look' },
        el('span', { class: 'rc-racer__base' }),
        el('span', { class: 'rc-racer__flip' }, ctx.sticker(track.mounts[i], 'rc-racer__mount'), ctx.sticker(p.emoji, 'rc-racer__rider')),
        el('span', { class: 'rc-racer__zzz', text: '💤' }),
        el('span', { class: 'rc-racer__crown', text: '👑' }));
      var hop = el('div', { class: 'rc-racer__hop' }, el('div', { class: 'rc-racer__seat' }, look));
      var node = el('div', { class: 'rc-racer is-asleep', data: { p: i }, 'aria-hidden': 'true' }, hop);
      // from/to/t: where it is drawn (t = 1 means standing on `to`); lift and squash shape the hop
      return { i: i, node: node, hop: hop, look: look, from: 0, to: 0, t: 1, lift: 0, squash: 1 };
    });

    var trays = ctx.players.map(function (p, i) {
      var list = el('div', { class: 'rc-piles' });
      var node = el('div', { class: 'rc-tray', data: { p: i } },
        el('div', { class: 'rc-tray__bed' }),
        el('div', { class: 'rc-tray__who', 'aria-hidden': 'true' }, ctx.sticker(p.emoji)),
        list);
      return { node: node, list: list };
    });

    var scene = el('div', { class: 'rc-scene', 'data-track': trackId }, blooms, trail, nodes,
      racers.map(function (r) { return r.node; }),
      trays.map(function (t) { return t.node; }));
    root.appendChild(scene);

    /* ---- layout ---- */

    function drawRacer(r) {
      var a = L.nodes[r.to], b = L.nodes[r.from];
      var back = 1 - r.t;
      var x = (b.x - a.x) / 100 * L.w * back;
      var y = (b.y - a.y) / 100 * L.h * back - r.lift * L.unit;
      r.node.style.left = a.x + '%';
      r.node.style.top = a.y + '%';
      r.node.style.setProperty('--flip', String(-heading(L.nodes, r.to))); // the emoji face left
      r.hop.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px) scale(' + (2 - r.squash).toFixed(3) + ',' + r.squash.toFixed(3) + ')';
    }

    function applyLayout(size) {
      L = layoutFor(size.w, size.h, NODE_COUNT);
      ['unit', 'pile', 'side', 'band', 'badge', 'gap'].forEach(function (key) {
        scene.style.setProperty('--' + key, L[key].toFixed(2) + 'px');
      });
      scene.style.setProperty('--picnic', String(L.picnic));
      nodes.forEach(function (node, i) {
        node.style.left = L.nodes[i].x + '%';
        node.style.top = L.nodes[i].y + '%';
      });
      trailPaths.forEach(function (path) { path.setAttribute('d', L.trail); });
      seatRacers();
      racers.forEach(drawRacer);
    }

    /** Two racers on one stone stand side by side, each on their own player's side. */
    function seatRacers() {
      var together = racers[0].to === racers[1].to;
      // on a stone in an edge column the pair shuffles inwards, so nobody hangs off the playmat
      var shift = 0;
      if (together && L) {
        var x = L.nodes[racers[0].to].x / 100 * L.w;
        if (x < L.unit * 0.95) shift = 1;
        else if (x > L.w - L.unit * 0.95) shift = -1;
      }
      racers.forEach(function (r) { r.node.style.setProperty('--share', together ? String((r.i === 0 ? -1 : 1) + shift) : '0'); });
    }

    /* ---- motion ---- */

    /** Calls step(0..1) every frame for ms of game time; resolves when done. */
    function tween(ms, step) {
      return new Promise(function (resolve) {
        var t0 = ctx.time;
        var stop = ctx.frame(function () {
          var t = Math.min(1, (ctx.time - t0) * 1000 / ms);
          step(t);
          if (t >= 1) { stop(); resolve(); }
        });
      });
    }

    /** Move a racer to a neighbouring node. lift = arc height in stone units. */
    function travel(r, to, ms, lift) {
      r.from = r.to;
      r.to = to;
      r.t = 0;
      seatRacers();
      return tween(ms, function (t) {
        r.t = t < 1 ? 0.5 - Math.cos(Math.PI * t) / 2 : 1;
        r.lift = calm ? 0 : lift * Math.sin(Math.PI * t);
        r.squash = calm ? 1 : 1 + 0.5 * r.lift;
        drawRacer(r);
      });
    }

    /** The squash of a landing, easing back to rest. */
    function settle(r, ms) {
      var node = nodes[r.to];
      node.classList.add('is-pressed');
      ctx.after(ms, function () { node.classList.remove('is-pressed'); });
      if (calm) return ctx.wait(ms);
      return tween(ms, function (t) {
        r.squash = 1 - 0.2 * Math.sin(Math.PI * Math.min(1, t * 1.25));
        drawRacer(r);
      });
    }

    function spot(r) { return fx.centerOf(r.look); }

    /* ---- piles ---- */

    function makePile(value, index) {
      var dots = util.range(value).map(function (k) { return el('span', { class: 'rc-dot', style: { '--k': k } }); });
      var leaves = HEAP.map(function (h) {
        var angle = Math.atan2(h[1] - 0.25, h[0]) + util.randf(-0.5, 0.5);
        var far = util.randf(0.8, 1.3);
        return el('span', {
          class: 'rc-leaf', text: track.cover[h[3]],
          style: {
            '--x': h[0], '--y': h[1], '--r': h[2] + 'deg',
            '--bx': (Math.cos(angle) * far).toFixed(2), '--by': (Math.sin(angle) * far - 0.2).toFixed(2), '--br': util.rand(540) - 270 + 'deg',
          },
        });
      });
      return el('button', { type: 'button', class: 'rc-pile', 'aria-label': 'Leaf pile', style: { '--i': index } },
        el('span', { class: 'rc-plate', data: { n: value } }, dots),
        el('span', { class: 'rc-heap' }, leaves));
    }

    function leafPuff(pile, count) {
      var c = fx.centerOf(pile);
      fx.burst(c.x, c.y, { emoji: util.pick(track.cover), count: count, distance: L.pile * 0.75, size: L.pile * 0.2 });
    }

    /** The leaves fly off and the dots underneath show. `aside` = one of the piles that was not picked. */
    function blowAway(index, aside) {
      var pile = hand.piles[index];
      pile.classList.remove('is-rustling');
      pile.classList.add('is-open');
      if (aside) {
        pile.classList.add('is-aside');
        snd.puff();
      } else {
        snd.blow();
        leafPuff(pile, 7);
        for (var k = 0; k < hand.values[index]; k++) snd.pip(k, 0.14 + k * 0.11);
      }
      if (hand.critter === index) {
        // somebody was napping under there
        var critter = ctx.sticker(util.pick(CRITTERS), 'rc-critter');
        critter.style.setProperty('--dir', turn === 0 ? '-1' : '1');
        pile.appendChild(critter);
        snd.squeak();
      }
    }

    /* ---- turns ---- */

    /** Things within reach of this turn's 1-3 hops get excited. */
    function tease(p) {
      nodes.forEach(function (node, i) {
        var ahead = i - pos[p];
        var special = i === FINISH || course.specials[i];
        node.classList.toggle('is-eager', !!special && p != null && ahead >= 1 && ahead <= 3);
      });
    }

    function beginTurn(p) {
      turn = p;
      var values = util.shuffle(pileSet(pos[1 - p] - pos[p], ctx.help, ctx.helpFor(p)));
      var piles = values.map(makePile);
      var tray = trays[p];
      tray.list.textContent = '';
      piles.forEach(function (pile) { tray.list.appendChild(pile); });
      // now and then somebody small is hiding in one of the piles (decoration only)
      hand = { values: values, piles: piles, picked: -1, critter: util.rand(3) === 0 ? util.rand(3) : -1 };

      trays[1 - p].node.classList.remove('is-open');
      tray.node.classList.add('is-open');
      racers.forEach(function (r) {
        r.node.classList.toggle('is-turn', r.i === p);
        r.node.classList.toggle('is-asleep', r.i !== p);
      });
      tease(p);
      snd.plops();
      ctx.setTurn(p, { lock: TURN_LOCK_MS });
      state = 'pick';
      // the wordless tutorial: each player's first pick of the round
      if (turnsTaken[p] === 0) ctx.hint(piles[1], { delay: turnsTaken[1 - p] === 0 ? 400 : 1600 });
    }

    ctx.tap(scene, function (ev, pile) {
      if (state !== 'pick') return;
      var index = hand.piles.indexOf(pile);
      if (index < 0) return;
      state = 'reveal';
      hand.picked = index;
      hand.piles.forEach(function (b) { b.setAttribute('aria-disabled', 'true'); });
      turnsTaken[turn]++;
      playTurn();
    }, { delegate: '.rc-pile', slop: 24 });

    async function playTurn() {
      var p = turn, me = racers[p];
      var picked = hand.picked, steps = hand.values[picked];
      var pile = hand.piles[picked];

      // a beat of suspense: the pile rustles (sometimes for a long, wobbly while)
      pile.classList.add('is-picked', 'is-rustling');
      snd.rustle();
      leafPuff(pile, 3);
      var suspense = util.rand(4) === 0 ? 800 : 380;
      if (suspense > 400) ctx.after(360, snd.rustle);
      await ctx.wait(suspense);

      blowAway(picked, false);
      await ctx.wait(300 + steps * 110);

      // the other two show what they hid: proof it was fair
      var others = [0, 1, 2].filter(function (i) { return i !== picked; });
      blowAway(others[0], true);
      await ctx.wait(140);
      blowAway(others[1], true);
      await ctx.wait(340);

      state = 'hop';
      tease(null);
      var dots = pile.querySelectorAll('.rc-dot');
      for (var n = 1; n <= steps && pos[p] < FINISH; n++) {
        pos[p]++;
        dots[n - 1].classList.add('is-used');
        snd.boing(n);
        sfx.scale(2 + n);
        ctx.say(n, n > 1 ? { queue: true } : null); // later numbers queue up so none is cut short
        await travel(me, pos[p], HOP_MS, 0.34);
        if (pos[p] === FINISH) { finish(p); return; }
        snd.thud();
        await settle(me, HOP_REST_MS);
      }

      var special = landing(pos[p], course);
      if (special) {
        state = 'special';
        lastSpecial = special;
        await ctx.wait(160);
        if (special.kind === 'boost') await rideRainbow(me, special.to);
        else if (special.kind === 'gift') await openGift(me, special);
        else await slipOnBanana(me, special.to);
      }

      state = 'swap';
      trays[p].node.classList.remove('is-open');
      await ctx.wait(240);
      beginTurn(1 - p);
    }

    async function rideRainbow(r, to) {
      var mark = nodes[r.to].querySelector('.rc-mark');
      snd.harp();
      fx.pop(mark);
      r.node.classList.add('is-gliding');
      while (pos[r.i] < to) {
        pos[r.i]++;
        var c = spot(r);
        fx.burst(c.x, c.y, { colors: RAINBOW_COLORS, count: 10, distance: L.unit * 0.6, size: 9 });
        await travel(r, pos[r.i], 330, 0.14);
      }
      r.node.classList.remove('is-gliding');
      var end = spot(r);
      fx.burst(end.x, end.y, { emoji: '✨', count: 6, distance: L.unit * 0.6, size: L.unit * 0.22 });
      sfx.play('star');
      await settle(r, 200);
    }

    /** The present: a lucky dip of extra hops, shown as dots and hopped out like any others. */
    async function openGift(r, special) {
      var mark = nodes[r.to].querySelector('.rc-mark');
      var c = fx.centerOf(mark);
      sfx.play('boost');
      fx.pop(mark);
      fx.burst(c.x, c.y, { emoji: '✨', count: 8, distance: L.unit * 0.7, size: L.unit * 0.22 });
      fx.float(c.x, c.y - L.unit * 0.5, '●●●'.slice(0, special.hops), { size: L.unit * 0.3, color: 'var(--berry)', duration: 1200 });
      mark.classList.add('is-open');
      await ctx.wait(520);
      for (var n = 1; pos[r.i] < special.to; n++) {
        pos[r.i]++;
        snd.boing(n);
        sfx.scale(5 + n);
        await travel(r, pos[r.i], HOP_MS, 0.34);
        snd.thud();
        await settle(r, HOP_REST_MS);
      }
    }

    async function slipOnBanana(r, to) {
      var stone = nodes[r.to];
      snd.whistle();
      stone.classList.add('is-slipped');
      ctx.after(900, function () { stone.classList.remove('is-slipped'); });
      // decorative spin on top of the slide, the way ctx.fx does it
      if (!calm && r.look.animate) r.look.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(' + 360 * heading(L.nodes, to) + 'deg)' }], { duration: 560, easing: 'ease-out', composite: 'add' });
      pos[r.i] = to;
      await travel(r, to, 580, 0.1);
      snd.thud();
      sfx.play('giggle');
      await settle(r, 300);
    }

    /* ---- the picnic ---- */

    function finish(winner) {
      state = 'finish';
      ctx.win(winner, { delay: FINALE_MS, emoji: track.feast[1] });
      finale(winner);
    }

    /** Decoration only: the winner is already decided and the party is already booked. */
    async function finale(winner) {
      var champ = racers[winner], friend = racers[1 - winner];
      var picnic = nodes[FINISH];
      tease(null);
      trays[winner].node.classList.remove('is-open');
      racers.forEach(function (r) { r.node.classList.remove('is-turn', 'is-asleep'); });
      champ.node.classList.add('is-champ');
      snd.tada();
      var c = fx.centerOf(picnic);
      fx.burst(c.x, c.y, { emoji: track.feast[1], count: 8, distance: L.unit * 0.9, size: L.unit * 0.24 });
      await settle(champ, 300);
      await ctx.wait(260);

      // the slow one suddenly isn't: it zooms the rest of the way so both get to eat
      var left = FINISH - pos[friend.i];
      var per = clamp(900 / left, 60, 150);
      snd.zoom();
      friend.node.classList.add('is-gliding');
      while (pos[friend.i] < FINISH) {
        pos[friend.i]++;
        if (pos[friend.i] % 2) sfx.scale(Math.min(12, 13 - (FINISH - pos[friend.i])));
        await travel(friend, pos[friend.i], per, 0.06);
      }
      friend.node.classList.remove('is-gliding');
      await settle(friend, 160);

      for (var bite = 0; bite < 3; bite++) {
        snd.nom();
        racers.forEach(function (r) { fx.pop(r.look); });
        var b = spot(racers[bite % 2]);
        fx.float(b.x, b.y - L.unit * 0.3, track.feast[1], { size: L.unit * 0.3, duration: 700 });
        await ctx.wait(230);
      }
      state = 'done';
    }

    /* ---- go ---- */

    applyLayout(ctx.size());
    seatRacers();
    ctx.onResize(applyLayout);

    // Both slowpokes are fast asleep on the start mat: one big yawn, then the first turn.
    snd.yawn();
    ctx.after(600, function () { beginTurn(ctx.firstPlayer); });

    ctx.expose({
      FINISH: FINISH, course: course, track: trackId, tracks: TRACK_IDS, LENGTHS: LENGTHS,
      get lastSpecial() { return lastSpecial; },
      pileSet: pileSet,
      landing: landing,
      makeCourse: makeCourse,
      layoutFor: layoutFor,
      shuffle: util.shuffle,
      get state() { return state; },
      get turn() { return turn; },
      get positions() { return pos.slice(); },
      /** What this turn's three piles hide, left to right (top to bottom in landscape). */
      get piles() { return hand ? hand.values.slice() : null; },
      get picked() { return hand ? hand.picked : -1; },
      get layout() { return L; },
      get path() { return L.nodes.map(function (n) { return { x: n.x, y: n.y }; }); },
    });
  }

  MG.registerGame({
    id: 'race',
    name: 'Super Slow Race',
    emoji: '🐌',
    color: 'tangerine',
    howTo: 'Take turns tapping a pile: the dots are how many stones your slowpoke hops. Some stones are surprises: a ride forward, a present with extra hops, or a slip back one. First to the feast wins, and everybody eats. Every race is somewhere new.',
    options: [
      { key: 'track', label: 'Where', default: 'surprise', choices: [
        { value: 'surprise', label: 'Surprise', emoji: '🎲' }, { value: 'meadow', label: 'Meadow', emoji: '🌼' }, { value: 'pond', label: 'Pond', emoji: '🐸' },
        { value: 'snow', label: 'Snow', emoji: '⛄' }, { value: 'beach', label: 'Beach', emoji: '🐚' }] },
      { key: 'length', label: 'Race', default: 'normal', choices: [{ value: 'short', label: 'Short' }, { value: 'normal', label: 'Normal' }, { value: 'long', label: 'Long' }] },
      { key: 'banana', label: 'Slip-back stone', default: true, choices: [{ value: true, label: 'On' }, { value: false, label: 'Off' }] },
    ],
    mount: mount,
  });
})();
