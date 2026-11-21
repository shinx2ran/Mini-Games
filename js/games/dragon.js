/* Sneezy Dragon — a baby dragon sleeps on its treasure. Players take turns
 * sneaking ONE treasure from their own side. One grab, drawn in secret before
 * the round starts, tickles its nose into a glitter sneeze that blows a silly
 * hat onto whoever took it. Nobody wins: the sneeze is the punchline.
 */
(function () {
  'use strict';

  var TREASURES = [
    { emoji: '💎', name: 'Gem' }, { emoji: '⭐', name: 'Star' }, { emoji: '🍪', name: 'Cookie' },
    { emoji: '👑', name: 'Crown' }, { emoji: '🔔', name: 'Bell' },
  ];
  var HATS = ['🧦', '🥞', '🦆', '🍝', '🎂', '🐙', '🧻', '🌵', '🍌', '🌻', '👢', '🍳'];
  var GLITTER = ['✨', '⭐', '💫', '🌟'];
  var STIRS = ['sniff', 'snort', 'flap'];

  var FAKE_CHANCE = 0.35;

  /* Beats of a turn, in ms of game time. A plain grab passes the turn after
     FLY + HUSH + STIR = 1.2s. */
  var FLY_MS = 420;    // treasure sails into the sack
  var HUSH_MS = 280;   // the snoring has stopped... a beat before the dragon reacts
  var STIR_MS = 500;   // a sleepy fidget
  var AH_MS = 430;     // one "ah..." of a build-up
  var HOLD_MS = 400;   // held breath before the sneeze, or the fizzle
  var PARTY_MS = 2600; // sneeze to win party
  var SNORE_MS = 3400; // matches the breathing loop in the stylesheet
  var IDLE_HINT_MS = [7000, 4500, 3000]; // by ctx.helpFor(player)

  /* Layout metrics shared with css/games/dragon.css. */
  var EDGE = 12, GAP = 8, CELL_GAP = 4, CELL_MIN = 64, CELL_MAX = 128;

  /* ------------------------------------------------------------ pure logic */

  /**
   * The grab (1-based, counted across both players) that sets off the sneeze.
   * A fair coin picks WHO (odd grabs are the starter's), then a uniform draw
   * picks WHEN. With 5 each that is exactly uniform on 3..10; with 3 each it
   * covers 2..6 and stays 50/50 although that range holds more even grabs.
   */
  function drawTrigger(perSide, rnd) {
    rnd = rnd || Math.random;
    var lo = perSide >= 5 ? 3 : 2, hi = perSide * 2;
    var parity = rnd() < 0.5 ? 1 : 0;
    var pool = [];
    for (var k = lo; k <= hi; k++) if (k % 2 === parity) pool.push(k);
    return pool[Math.floor(rnd() * pool.length)];
  }

  /**
   * Everything random about a round's suspense, drawn up front:
   * trigger, and per grab k (1-based) whether a safe grab gets a fake build-up
   * (never grab 1) and how many "ah"s any build-up on that grab has.
   */
  function planRound(perSide, rnd) {
    rnd = rnd || Math.random;
    var plan = { trigger: drawTrigger(perSide, rnd), fakes: [false], steps: [0] };
    for (var k = 1; k <= perSide * 2; k++) {
      plan.fakes.push(k >= 2 && k < plan.trigger && rnd() < FAKE_CHANCE);
      plan.steps.push(rnd() < 0.5 ? 2 : 3);
    }
    return plan;
  }

  /** Who takes grab number `trigger` when player `first` starts. */
  function sneezerOf(trigger, first) { return (first + trigger - 1) % 2; }

  /**
   * Pick the arrangement for a w x h playmat with n treasures per side.
   *   'side'  — zones left and right, dragon between them
   *   'under' — dragon on top, zones side by side beneath it
   * Each candidate gets the biggest treasure cell that fits; the winner is the
   * one that fits with the best mix of big cells and a big dragon.
   */
  function fitLayout(w, h, n) {
    function candidate(layout, cols) {
      var rows = Math.ceil(n / cols);
      var stacked = layout === 'side' && cols === 1; // a one-cell-wide column: avatar sits above the sack
      var pad = stacked ? 3 : 5;                     // zone padding, including its 3px border
      var postK = stacked ? 1.3 : 0.8;               // height of the avatar-and-sack post, in cells
      var extraW = 2 * pad + (cols - 1) * CELL_GAP;
      var extraH = 2 * pad + GAP + (rows - 1) * CELL_GAP;
      var byW, byH;
      if (layout === 'side') {
        byW = (w - 2 * EDGE - 2 * GAP - Math.max(100, w * 0.27) - 2 * extraW) / (2 * cols);
        byH = (h - 2 * EDGE - extraH) / (rows + postK);
      } else {
        byW = ((w - 2 * EDGE - GAP) / 2 - extraW) / cols;
        byH = (h * 0.62 - 2 * EDGE - GAP - extraH) / (rows + postK);
      }
      var fits = Math.min(byW, byH) >= CELL_MIN;
      var cell = Math.floor(Math.max(CELL_MIN, Math.min(byW, byH, CELL_MAX)));
      var post = Math.round(postK * cell);
      var zoneW = cols * cell + extraW, zoneH = rows * cell + post + extraH;
      var denW = layout === 'side' ? w - 2 * EDGE - 2 * GAP - 2 * zoneW : w - 2 * EDGE;
      var denH = layout === 'side' ? h - 2 * EDGE : h - 2 * EDGE - GAP - zoneH;
      var pet = Math.max(0, Math.min(denW, denH * 1.2)); // the dragon is drawn 6:5
      return {
        layout: layout, cols: cols, rows: rows, cell: cell, post: post, fits: fits,
        zoneW: zoneW, zoneH: zoneH, pet: pet,
        score: (fits ? 10 : 0) + Math.min(cell, 112) / 112 + Math.min(pet / (0.5 * Math.min(w, h)), 1),
      };
    }
    var options = w >= h
      ? [candidate('side', 2), candidate('side', 3), candidate('under', 3)]
      : [candidate('under', 2), candidate('side', 1)];
    return options.reduce(function (best, o) { return o.score > best.score ? o : best; });
  }

  /* ------------------------------------------------------------------ art */

  /* viewBox units; the dragon lies facing us on its heap, chin on its paws. */
  var DRAGON_SVG =
    '<svg class="dg-svg" viewBox="0 0 240 200" aria-hidden="true" focusable="false">' +
      '<g class="dg-heap">' +
        '<path class="dg-ink dg-f-gold" d="M4 196C10 160 40 146 70 142 100 132 140 132 170 142 200 146 230 160 236 196Z"/>' +
        '<ellipse class="dg-ink dg-f-coin" cx="30" cy="181" rx="11" ry="6"/>' +
        '<ellipse class="dg-ink dg-f-coin" cx="210" cy="181" rx="11" ry="6"/>' +
        '<ellipse class="dg-ink dg-f-coin" cx="58" cy="190" rx="11" ry="5"/>' +
        '<ellipse class="dg-ink dg-f-coin" cx="182" cy="190" rx="11" ry="5"/>' +
        '<ellipse class="dg-ink dg-f-coin" cx="120" cy="191" rx="12" ry="5"/>' +
      '</g>' +
      '<g class="dg-pet">' +
        '<path class="dg-ink dg-f-wing dg-wing dg-wing--l" d="M64 110C52 86 36 70 14 72 22 82 22 92 19 101 30 96 38 100 41 111 50 104 58 106 64 110Z"/>' +
        '<path class="dg-ink dg-f-wing dg-wing dg-wing--r" d="M176 110C188 86 204 70 226 72 218 82 218 92 221 101 210 96 202 100 199 111 190 104 182 106 176 110Z"/>' +
        '<g class="dg-tail">' +
          '<path class="dg-ink dg-f-spike" d="M207 164 186 177 208 192Z"/>' +
          '<path class="dg-ink dg-f-skin" d="M182 136C208 128 232 142 230 166 229 181 214 188 203 183L208 170C214 172 217 168 217 162 217 150 200 148 186 154Z"/>' +
        '</g>' +
        '<g class="dg-body"><ellipse class="dg-ink dg-f-skin" cx="120" cy="130" rx="78" ry="46"/></g>' +
        '<g class="dg-head"><g class="dg-bob">' +
          '<path class="dg-ink dg-f-horn" d="M80 90C72 76 74 62 84 56 91 66 95 77 94 88Z"/>' +
          '<path class="dg-ink dg-f-horn" d="M160 90C168 76 166 62 156 56 149 66 145 77 146 88Z"/>' +
          '<path class="dg-ink dg-f-spike" d="M101 86 108 67 115 81 120 61 125 81 132 67 139 86Z"/>' +
          '<ellipse class="dg-ink dg-f-skin" cx="120" cy="124" rx="58" ry="46"/>' +
          '<ellipse class="dg-f-snout" cx="120" cy="143" rx="40" ry="23"/>' +
          '<circle class="dg-cheek" cx="73" cy="130" r="9"/>' +
          '<circle class="dg-cheek" cx="167" cy="130" r="9"/>' +
          '<g class="dg-eyes dg-eyes--shut"><path class="dg-ink dg-line" d="M78 106Q90 116 102 106"/><path class="dg-ink dg-line" d="M138 106Q150 116 162 106"/></g>' +
          '<g class="dg-eyes dg-eyes--tight"><path class="dg-ink dg-line" d="M80 99 98 107 80 115"/><path class="dg-ink dg-line" d="M160 99 142 107 160 115"/></g>' +
          '<g class="dg-eyes dg-eyes--joy"><path class="dg-ink dg-line" d="M78 111Q90 98 102 111"/><path class="dg-ink dg-line" d="M138 111Q150 98 162 111"/></g>' +
          '<path class="dg-ink dg-line dg-smile" d="M108 153Q120 161 132 153"/>' +
          '<g class="dg-maw"><ellipse class="dg-ink dg-f-mouth" cx="120" cy="154" rx="11" ry="8"/><ellipse class="dg-f-tongue" cx="120" cy="158" rx="6" ry="3"/></g>' +
          '<g class="dg-nose">' +
            '<ellipse class="dg-ink dg-f-nose" cx="120" cy="129" rx="15" ry="9.5"/>' +
            '<ellipse class="dg-nose-hot" cx="120" cy="129" rx="15" ry="9.5"/>' +
            '<ellipse class="dg-f-ink" cx="114" cy="129" rx="2.2" ry="3"/>' +
            '<ellipse class="dg-f-ink" cx="126" cy="129" rx="2.2" ry="3"/>' +
          '</g>' +
        '</g></g>' +
        '<ellipse class="dg-ink dg-f-skin" cx="86" cy="173" rx="17" ry="10"/>' +
        '<ellipse class="dg-ink dg-f-skin" cx="154" cy="173" rx="17" ry="10"/>' +
        '<path class="dg-ink dg-line" d="M80 171v6M88 172v6M152 172v6M160 171v6"/>' +
      '</g>' +
      '<g class="dg-zzz">' +
        '<path class="dg-z" d="M176 62h12l-12 13h12"/>' +
        '<path class="dg-z" d="M196 38h16l-16 17h16"/>' +
        '<path class="dg-z" d="M216 8h21l-21 22h21"/>' +
      '</g>' +
    '</svg>';

  /* ----------------------------------------------------------------- game */

  MG.registerGame({
    id: 'dragon',
    name: 'Sneezy Dragon',
    emoji: '🐉',
    color: 'grape',
    howTo: 'Take turns sneaking one treasure from your own side. One grab will tickle the dragon\'s nose, and nobody knows which. Whoever gets sneezed on wears a silly hat!',
    options: [
      { key: 'each', label: 'Treasures each', default: 5, choices: [{ value: 5, label: '5' }, { value: 3, label: '3' }] },
      { key: 'sneeze', label: 'Sneeze', default: 'big', choices: [{ value: 'big', label: 'Big' }, { value: 'gentle', label: 'Gentle' }] },
    ],

    mount: function (root, ctx) {
      var el = ctx.el, sfx = ctx.sfx, fx = ctx.fx, util = ctx.util;
      var perSide = ctx.opt('each');
      var total = perSide * 2;
      var gentle = ctx.opt('sneeze') === 'gentle';
      var calm = gentle || MG.reducedMotion; // no quake, no buzz, less glitter
      var loud = gentle ? 0.5 : 1;

      var plan = planRound(perSide);
      var first = ctx.firstPlayer;
      var turn = first;
      /* idle (waiting for the turn player's grab)
           -> grab (treasure flying, the dragon holds its breath)
           -> idle, after a sleepy stir            | plain safe grab
           -> tickle -> idle, after a fizzle       | fake build-up
           -> tickle -> sneeze                     | the pre-drawn grab; ctx.win is called there */
      var state = 'idle';
      var grabs = 0;
      var sneezed = null;
      var fit = null;
      var hintGem = null;
      var stirId = 0;
      var fidgetAt = 0, nopeAt = [0, 0]; // rate caps for the purely decorative reactions

      var shelf = ctx.load('hats', []);
      shelf = Array.isArray(shelf) ? shelf.filter(function (h) { return HATS.indexOf(h) >= 0; }) : [];
      var hat = pickHat();

      /* ---- build ---- */

      var kinds = util.sample(TREASURES, perSide);
      var zones = ctx.players.map(function (p) {
        var gems = util.shuffle(kinds).map(function (k, n) {
          return el('button', { type: 'button', class: 'dg-gem', 'aria-label': k.name, 'data-emoji': k.emoji, style: { '--n': n } },
            el('span', { class: 'dg-jewel' }, ctx.sticker(k.emoji)));
        });
        var loot = util.range(perSide).map(function () { return el('span', { class: 'dg-loot', 'aria-hidden': 'true' }); });
        var hatEl = el('span', { class: 'dg-hat', 'aria-hidden': 'true' });
        var ava = el('div', { class: 'dg-ava' }, ctx.sticker(p.emoji), hatEl);
        var sack = el('div', { class: 'dg-sack' }, loot);
        var veil = el('div', { class: 'dg-veil' }); // covers the zone while it is not this player's turn
        var zone = el('div', {
          class: 'dg-zone', 'data-p': String(p.index), role: 'group', 'aria-label': 'Treasures of player ' + (p.index + 1),
          style: { '--c': p.color, '--c-dark': p.dark, '--c-soft': p.soft, '--away': p.index === 0 ? -1 : 1 },
        }, el('div', { class: 'dg-post' }, ava, sack), el('div', { class: 'dg-cluster' }, gems), veil);
        return { el: zone, gems: gems, loot: loot, ava: ava, sack: sack, hat: hatEl, veil: veil, taken: 0 };
      });

      var den = el('div', { class: 'dg-den', role: 'img', 'aria-label': 'A baby dragon asleep on its treasure', 'data-mood': 'sleep' });
      den.innerHTML = DRAGON_SVG;
      var nose = den.querySelector('.dg-nose');

      var scene = el('div', { class: 'dg-scene' + (calm ? ' is-calm' : '') }, zones[0].el, den, zones[1].el);
      root.appendChild(scene);

      /* ---- layout ---- */

      function layout(size) {
        size = size || ctx.size();
        fit = fitLayout(size.w, size.h, perSide);
        scene.dataset.layout = fit.layout;
        scene.dataset.cols = fit.cols;
        scene.style.setProperty('--cols', fit.cols);
        scene.style.setProperty('--cell', fit.cell + 'px');
        scene.style.setProperty('--post', fit.post + 'px');
      }
      layout();
      ctx.onResize(layout);

      /* ---- sounds ---- */

      function bling() {
        sfx.scale(grabs - 1);
        sfx.tone({ freq: 2093, dur: 0.2, type: 'sine', gain: 0.045, delay: 0.06 });
      }
      function plop() { sfx.tone({ freq: 310, to: 170, dur: 0.13, type: 'sine', gain: 0.22 }); }
      function snore() {
        sfx.tone({ freq: 150, to: 196, dur: 1.0, type: 'sawtooth', gain: 0.028, attack: 0.5 });
        sfx.noise({ freq: 260, to: 420, dur: 0.9, q: 2, gain: 0.022, delay: 0.15 });
        sfx.tone({ freq: 988, to: 740, dur: 0.8, type: 'sine', gain: 0.02, attack: 0.25, delay: 1.5 });
      }
      var stirSounds = {
        sniff: function () {
          for (var i = 0; i < 2; i++) sfx.noise({ freq: 2200, to: 3200, dur: 0.08, q: 3, gain: 0.08, delay: i * 0.16 });
        },
        snort: function () {
          sfx.tone({ freq: 170, to: 110, dur: 0.24, type: 'sawtooth', gain: 0.06 });
          sfx.noise({ freq: 520, dur: 0.14, q: 1.5, gain: 0.05 });
        },
        flap: function () {
          for (var i = 0; i < 3; i++) sfx.noise({ freq: 600, to: 1300, dur: 0.08, q: 1, gain: 0.07, delay: i * 0.11 });
        },
      };
      function ahh(level) {
        var f = [0, 330, 415, 523][level];
        sfx.tone({ freq: f, to: f * 1.2, dur: 0.24 + level * 0.06, type: 'triangle', gain: 0.07 + level * 0.03, attack: 0.07 });
        sfx.noise({ freq: 600 + level * 300, to: 1400 + level * 500, dur: 0.22 + level * 0.05, q: 1.2, gain: 0.025 + level * 0.012 });
      }
      function choo() {
        sfx.noise({ freq: 700, to: 4200, dur: 0.42, q: 0.8, gain: 0.22 * loud });
        sfx.tone({ freq: 784, to: 165, dur: 0.44, type: 'square', gain: 0.08 * loud, attack: 0.02 });
        sfx.tone({ freq: 392, to: 98, dur: 0.5, type: 'sine', gain: 0.22 * loud, attack: 0.02 });
        sfx.seq([84, 88, 91, 96, 100, 103], { step: 0.05, type: 'sine', gain: 0.07, delay: 0.16 });
      }
      function phew() {
        sfx.tone({ freq: 494, to: 247, dur: 0.5, type: 'triangle', gain: 0.1, attack: 0.04 });
        sfx.noise({ freq: 1600, to: 500, dur: 0.45, q: 0.8, gain: 0.05 });
      }
      function yawn() {
        sfx.tone({ freq: 330, to: 587, dur: 0.4, type: 'sine', gain: 0.11, attack: 0.15 });
        sfx.tone({ freq: 587, to: 220, dur: 0.6, type: 'sine', gain: 0.11, attack: 0.05, delay: 0.38 });
      }
      function giggle() { sfx.seq([88, 84, 88, 84, 91, 88, 93], { step: 0.075, type: 'triangle', gain: 0.1 }); }

      /* ---- view ---- */

      function setMood(mood) { den.dataset.mood = mood; }

      /** Push the state machine's state into the DOM: who may tap what. */
      function refresh() {
        var open = state === 'idle';
        zones.forEach(function (z, i) {
          var mine = i === turn && state !== 'sneeze';
          z.el.classList.toggle('is-turn', mine);
          z.gems.forEach(function (g) { g.setAttribute('aria-disabled', mine && open ? 'false' : 'true'); });
        });
        den.setAttribute('aria-disabled', open ? 'false' : 'true');
        den.style.setProperty('--tickle', (grabs / total).toFixed(2));
      }

      function remaining(i) {
        return zones[i].gems.filter(function (g) { return !g.classList.contains('is-gone'); });
      }

      /** Ghost hand over one of the turn player's treasures, after `delay`. */
      function nudge(delay) {
        hintGem = util.pick(remaining(turn));
        ctx.hint(hintGem, { delay: delay });
      }
      /** A counted tap that changed nothing wiped the ghost hand: bring it back. */
      function rehint() {
        if (state === 'idle' && hintGem) ctx.hint(hintGem, { delay: 500 });
      }

      /** A sleepy fidget: decoration only. */
      function stir(kind) {
        var id = ++stirId;
        den.dataset.stir = kind;
        stirSounds[kind]();
        ctx.after(STIR_MS, function () { if (stirId === id) den.removeAttribute('data-stir'); });
      }

      function pickHat() {
        var taken = [ctx.players[0].emoji, ctx.players[1].emoji, shelf[shelf.length - 1]];
        var ok = HATS.filter(function (h) { return taken.indexOf(h) < 0; });
        var fresh = ok.filter(function (h) { return shelf.indexOf(h) < 0; }); // new hats first: a collection to complete
        return util.pick(fresh.length ? fresh : ok);
      }

      /** The last three hats the family has been sneezed into, in the HUD. */
      function showShelf() {
        ctx.setStatus(shelf.slice(-3).map(function (h) { return el('span', { 'aria-hidden': 'true', text: h }); }));
      }

      /** Glitter flying from one viewport point towards another. */
      function spray(from, to, count) {
        var box = scene.getBoundingClientRect();
        var dx = to.x - from.x, dy = to.y - from.y;
        var bits = [];
        for (var k = 0; k < count; k++) {
          var far = util.randf(0.7, 1.25), wide = util.randf(-0.3, 0.3);
          bits.push(el('span', {
            class: 'dg-glit', text: util.pick(GLITTER),
            style: {
              left: (from.x - box.left) + 'px', top: (from.y - box.top) + 'px',
              '--dx': (dx * far - dy * wide) + 'px', '--dy': (dy * far + dx * wide) + 'px',
              '--t': util.randf(0.5, 0.9) + 's', '--d': util.randf(0, 0.14) + 's', '--s': util.randf(0.6, 1.3),
            },
          }));
        }
        bits.forEach(function (b) { scene.appendChild(b); });
        ctx.after(1200, function () { bits.forEach(function (b) { b.remove(); }); });
      }

      function buzz() {
        // Without a real touch first, Chrome blocks vibrate() and complains in the console.
        var touched = !navigator.userActivation || navigator.userActivation.hasBeenActive;
        if (!navigator.vibrate || !touched || sfx.muted) return;
        try { navigator.vibrate(120); } catch (e) {}
      }

      /* ---- the round ---- */

      function grab(i, gem) {
        if (state !== 'idle' || i !== turn) return;
        var z = zones[i];
        var slot = z.loot[z.taken++];
        var jewel = gem.firstChild;
        state = 'grab';
        grabs++;
        hintGem = null;
        refresh();
        setMood('hush');

        var a = fx.centerOf(jewel), b = fx.centerOf(slot);
        gem.style.setProperty('--dx', (b.x - a.x) + 'px');
        gem.style.setProperty('--dy', (b.y - a.y) + 'px');
        gem.classList.add('is-flying');
        bling();
        fx.burst(a.x, a.y, { emoji: '✨', count: 5, distance: 48, size: 18 });

        ctx.after(FLY_MS, function () {
          gem.classList.remove('is-flying');
          gem.classList.add('is-gone');
          slot.textContent = gem.dataset.emoji;
          slot.classList.add('is-in');
          fx.pop(z.sack);
          plop();
        });
        ctx.after(FLY_MS + HUSH_MS, react);
      }

      function react() {
        if (grabs === plan.trigger) tickle(true);
        else if (plan.fakes[grabs]) tickle(false);
        else {
          stir(util.pick(STIRS));
          ctx.after(STIR_MS, passTurn);
        }
      }

      /** "Ah... ah... AHHH..." — identical for a fake and for the real thing until the very end. */
      function tickle(real) {
        state = 'tickle';
        var levels = plan.steps[grabs] === 2 ? [1, 3] : [1, 2, 3];
        levels.forEach(function (level, n) {
          ctx.after(n * AH_MS, function () { setMood('ah' + level); ahh(level); });
        });
        ctx.after(levels.length * AH_MS + HOLD_MS, real ? sneeze : fizzle);
      }

      function fizzle() {
        var yawning = Math.random() < 0.35;
        setMood(yawning ? 'yawn' : 'phew');
        if (yawning) yawn(); else phew();
        ctx.after(yawning ? 950 : 650, passTurn);
      }

      function passTurn() {
        turn = 1 - turn;
        state = 'idle';
        setMood('sleep');
        ctx.setTurn(turn);
        refresh();
        nudge(zones[turn].taken === 0 ? 1200 : IDLE_HINT_MS[ctx.helpFor(turn)]);
      }

      function sneeze() {
        var z = zones[turn], friend = zones[1 - turn];
        state = 'sneeze';
        sneezed = turn;
        refresh();
        ctx.win('team', { emoji: hat, delay: PARTY_MS });
        ctx.setTurn(null);

        den.style.setProperty('--aim', turn === 0 ? -1 : 1);
        setMood('choo');
        choo();
        if (!calm) { scene.classList.add('is-quaking'); buzz(); }
        var from = fx.centerOf(nose), to = fx.centerOf(z.ava);
        fx.burst(from.x, from.y, { count: calm ? 10 : 24, distance: fit.pet * 0.5, size: 11 });
        spray(from, to, calm ? 9 : 20);

        ctx.after(140, function () {
          z.ava.classList.add('is-blown');
          z.el.classList.add('is-glittered');
          sfx.play('whoosh');
        });
        ctx.after(950, function () {
          setMood('giggle');
          giggle();
          fx.bounce(friend.ava);
        });
        ctx.after(1100, function () {
          z.hat.textContent = hat;
          z.hat.classList.add('is-on');
        });
        ctx.after(1380, function () {
          var c = fx.centerOf(z.hat);
          sfx.play('boing');
          fx.burst(c.x, c.y, { emoji: '✨', count: 6, distance: 56, size: 20 });
        });

        shelf = shelf.filter(function (h) { return h !== hat; }).concat(hat);
        ctx.save('hats', shelf);
        showShelf();
      }

      /* ---- input ---- */

      zones.forEach(function (z, i) {
        // Anywhere in your own zone takes the nearest treasure that is still there.
        ctx.tap(z.el, function (ev, gem) { grab(i, gem); }, { delegate: '.dg-gem:not(.is-gone)', slop: 9999 });
        // Not your turn: your animal shakes its head, and that is all.
        ctx.tap(z.veil, function () {
          sfx.play('boop');
          if (ctx.time >= nopeAt[i]) { nopeAt[i] = ctx.time + 0.4; fx.shake(z.ava); }
          rehint();
        });
      });

      // The sleeping dragon is a harmless fidget toy.
      ctx.tap(den, function () {
        if (ctx.time >= fidgetAt) { fidgetAt = ctx.time + (STIR_MS + 60) / 1000; stir(util.pick(STIRS)); }
        rehint();
      });

      /* ---- go ---- */

      ctx.every(SNORE_MS, function () { if (state === 'idle') snore(); });
      showShelf();
      ctx.setTurn(turn);
      refresh();
      nudge(700);

      ctx.expose({
        get state() { return state; },
        get turn() { return turn; },
        get grabs() { return grabs; },
        get taken() { return [zones[0].taken, zones[1].taken]; },
        get sneezed() { return sneezed; },
        get mood() { return den.dataset.mood; },
        get plan() { return plan; },
        get layout() { return fit; },
        first: first, perSide: perSide, total: total, hat: hat, gentle: gentle, hats: HATS,
        /** Tests only: swap in a chosen plan before the first grab. */
        rig: function (p) {
          if (grabs > 0) return false;
          plan = { trigger: p.trigger, fakes: p.fakes || [], steps: p.steps || [] };
          return true;
        },
        drawTrigger: drawTrigger, planRound: planRound, sneezerOf: sneezerOf, fitLayout: fitLayout,
      });

      return function cleanup() { ctx.setStatus(null); };
    },
  });
})();
