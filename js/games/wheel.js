/* Bossy Wheel — spin the wheel and the OTHER person does the silly action for
 * real, while the spinner is the Boss and the judge. The screen is only the
 * prompt; the fun happens in the room.
 *
 * state: wait (Boss taps the wheel) -> spin -> show (the action + who does it)
 *        -> clap (Boss gives a star) -> wait (other Boss) ... -> party -> done
 */
(function () {
  'use strict';

  /* move: which little dance the emoji does on the card (css: .wh-act[data-move]). */
  var ACTIVE = [
    { emoji: '🐸', say: 'Hop like a frog', move: 'hop' },
    { emoji: '🦁', say: 'Roar like a lion', move: 'shake' },
    { emoji: '🐔', say: 'Flap like a chicken', move: 'flap' },
    { emoji: '💫', say: 'Spin around', move: 'spin' },
    { emoji: '🐘', say: 'Stomp like an elephant', move: 'stomp' },
    { emoji: '🤖', say: 'Walk like a robot', move: 'sway' },
    { emoji: '🐒', say: 'Scratch like a monkey', move: 'shake' },
    { emoji: '🗿', say: 'Freeze like a statue', move: 'freeze' },
    { emoji: '🐭', say: 'Tiptoe like a mouse', move: 'tiptoe' },
    { emoji: '🕺', say: 'Wiggle your bottom', move: 'sway' },
  ];
  var COSY = [
    { emoji: '😜', say: 'Make a silly face', move: 'shake' },
    { emoji: '🐟', say: 'Do fish lips', move: 'pulse' },
    { emoji: '👃', say: 'Touch your nose', move: 'hop' },
    { emoji: '😉', say: 'Wink!', move: 'pulse' },
    { emoji: '😴', say: 'Pretend to snore', move: 'sway' },
    { emoji: '🤫', say: 'Whisper a secret', move: 'tiptoe' },
    { emoji: '🙌', say: 'High five', move: 'hop' },
    { emoji: '🤣', say: 'Tickle time', move: 'shake' },
    { emoji: '🐱', say: 'Meow like a kitten', move: 'pulse' },
  ];
  var HUG = { emoji: '🤗', say: 'A great big hug', move: 'pulse' };
  var STAR = { emoji: '⭐', say: 'Boss chooses: make one up!', move: 'spin' };

  var SLICES = 8;
  var SPINS_EACH = 3;
  var COLORS = ['berry', 'sun', 'sea', 'leaf', 'grape', 'tangerine', 'sea', 'sun'];
  var BOTH_CHANCE = 0.4;
  var SHOW_MS = 900;     // the action is on screen this long before "who" flips in
  var CLAP_MS = 2600;    // ...and this long before the Boss may clap

  /* ---------------------------------------------------------- pure rules */

  /** Index of the slice under the pointer (top) when the wheel is turned `rot` degrees clockwise. */
  function sliceAt(rot, n) {
    var a = ((-rot % 360) + 360) % 360;
    return Math.floor(a / (360 / n)) % n;
  }

  /** A final rotation, at least `turns` whole turns past `from`, that leaves slice `index` under the pointer. */
  function landingRot(from, index, n, turns, jitter) {
    var size = 360 / n;
    var want = -((index + 0.5) * size) + (jitter || 0) * size * 0.3;
    var base = from + turns * 360;
    var delta = ((want - base) % 360 + 360) % 360;
    return base + delta;
  }

  /** Who performs: 'other' or 'both' — never the Boss alone. */
  function pickWho(rnd) { return (rnd == null ? Math.random() : rnd) < BOTH_CHANCE ? 'both' : 'other'; }

  /** Eight slices: six from the chosen pool(s), always a hug and a star. */
  function drawSlices(pool, shuffle) {
    var from = pool === 'active' ? ACTIVE : pool === 'cosy' ? COSY : ACTIVE.concat(COSY);
    return shuffle(shuffle(from).slice(0, SLICES - 2).concat([HUG, STAR]));
  }

  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

  MG.registerGame({
    id: 'wheel',
    name: 'Bossy Wheel',
    emoji: '🎡',
    color: 'sun',
    howTo: 'The Boss (wearing the crown) taps the wheel. Whoever the card shows has to do the action for real! Then the Boss claps to give a star. Three spins each. Put the phone down for the jumpy ones.',
    options: [
      { key: 'pool', label: 'Actions', default: 'mixed', choices: [{ value: 'mixed', label: 'Mixed' }, { value: 'active', label: 'Jumpy' }, { value: 'cosy', label: 'Cosy' }] },
    ],

    mount: function (root, ctx) {
      var el = ctx.el, sfx = ctx.sfx, fx = ctx.fx, util = ctx.util;
      var players = ctx.players;
      var slices = drawSlices(ctx.opt('pool'), util.shuffle);

      var state = 'wait';
      var boss = ctx.firstPlayer;
      var spins = 0, stars = 0;
      var rot = 0;
      var used = [];
      var landed = -1, who = null;
      var target = null;       // {index, rot}: decided the moment the wheel is tapped

      /* ---- build ---- */

      var disc = el('div', { class: 'wh-disc' });
      disc.style.background = 'conic-gradient(' + slices.map(function (s, i) {
        return 'var(--' + COLORS[i] + ') ' + (i * 360 / SLICES) + 'deg ' + ((i + 1) * 360 / SLICES) + 'deg';
      }).join(', ') + ')';
      var labels = slices.map(function (s, i) {
        var lab = el('span', { class: 'wh-label', style: { '--a': ((i + 0.5) * 360 / SLICES) + 'deg' } }, ctx.sticker(s.emoji));
        disc.appendChild(lab);
        return lab;
      });
      var wheel = el('button', { type: 'button', class: 'wh-wheel', 'aria-label': 'Spin the wheel' },
        disc, el('span', { class: 'wh-hub' }), el('span', { class: 'wh-pointer', 'aria-hidden': 'true' }));

      var seats = players.map(function (p) {
        return el('div', { class: 'wh-seat', 'data-p': String(p.index), style: { '--c': p.color, '--c-dark': p.dark, '--c-soft': p.soft } },
          el('span', { class: 'wh-crown', 'aria-hidden': 'true', text: '👑' }), ctx.sticker(p.emoji));
      });

      var act = el('div', { class: 'wh-act', 'aria-hidden': 'true' });
      var whoRow = el('div', { class: 'wh-who' });
      var caption = el('p', { class: 'wh-caption' });
      var clap = el('button', { type: 'button', class: 'wh-clap', 'aria-label': 'Clap: give a star', 'aria-disabled': 'true' }, ctx.sticker('👏'));
      var card = el('div', { class: 'wh-card', hidden: true }, act, whoRow, caption, clap);

      var scene = el('div', { class: 'wh-scene' }, seats[0], wheel, seats[1], card);
      root.appendChild(scene);

      /* ---- view ---- */

      function showStars() {
        // up to 12 stars: they wrap into rows so every one stays visible in the narrow HUD
        ctx.setStatus(el('span', {
          'aria-label': stars + ' stars',
          style: { display: 'flex', flexWrap: 'wrap', justifyContent: 'center', fontSize: '0.68em', lineHeight: '1.1' },
        }, util.range(stars).map(function () { return el('span', { text: '⭐' }); })));
      }

      function setBoss(p) {
        boss = p;
        seats.forEach(function (s, i) { s.classList.toggle('is-boss', i === p); });
        scene.dataset.boss = String(p);
        ctx.setTurn(p);
      }

      function drawWheel() { disc.style.transform = 'rotate(' + rot.toFixed(2) + 'deg)'; }

      /* ---- sounds ---- */

      function tick(speed) { sfx.tone({ freq: 500 + speed * 700, dur: 0.03, type: 'square', gain: 0.07 }); }
      function jingle() {
        sfx.seq([72, 76, 79, 76, 72, 76, 79, 84, 79, 76, 72, null, 67, 72], { step: 0.2, type: 'triangle', gain: 0.1 });
      }

      /* ---- the round ---- */

      function spin() {
        if (state !== 'wait') return;
        state = 'spin';
        var free = util.range(SLICES).filter(function (i) { return used.indexOf(i) < 0; });
        var index = util.pick(free);
        var from = rot;
        var to = landingRot(from, index, SLICES, 3 + util.rand(3), util.randf(-1, 1));
        var ms = util.randf(2600, 3800);
        target = { index: index, rot: to };
        wheel.setAttribute('aria-disabled', 'true');
        sfx.play('whoosh');
        var t0 = ctx.time, lastSlice = sliceAt(rot, SLICES);
        var stop = ctx.frame(function () {
          var t = Math.min(1, (ctx.time - t0) * 1000 / ms);
          rot = from + (to - from) * easeOut(t);
          drawWheel();
          var now = sliceAt(rot, SLICES);
          if (now !== lastSlice) { lastSlice = now; tick(1 - t); }
          if (t >= 1) { stop(); land(index); }
        });
      }

      function land(index) {
        landed = index;
        used.push(index);
        spins++;
        who = pickWho();
        var s = slices[index];
        labels[index].classList.add('is-landed');
        sfx.play('good');
        var c = fx.centerOf(labels[index]);
        fx.burst(c.x, c.y, { count: 10, distance: 70 });

        ctx.after(550, function () {
          state = 'show';
          act.textContent = '';
          act.appendChild(ctx.sticker(s.emoji));
          act.dataset.move = s.move;
          caption.textContent = s.say;
          whoRow.textContent = '';
          whoRow.classList.remove('is-in');
          clap.classList.remove('is-ready');
          clap.setAttribute('aria-disabled', 'true');
          card.hidden = false;
          card.dataset.side = String(boss);
          sfx.play('boing');
          ctx.setTurn(null);
        });
        ctx.after(550 + SHOW_MS, function () {
          var doers = who === 'both' ? players : [players[1 - boss]];
          doers.forEach(function (p) {
            whoRow.appendChild(el('span', { class: 'wh-doer', style: { '--c': p.color } }, ctx.sticker(p.emoji)));
          });
          whoRow.classList.add('is-in');
          sfx.play(who === 'both' ? 'match' : 'turn' + (1 - boss));
          jingle();
        });
        ctx.after(550 + SHOW_MS + CLAP_MS, function () {
          state = 'clap';
          clap.classList.add('is-ready');
          clap.setAttribute('aria-disabled', 'false');
          ctx.setTurn(boss, { sound: false, lock: 0 });
          ctx.hint(clap, { delay: spins <= 2 ? 300 : 5000 });
        });
      }

      function award() {
        if (state !== 'clap') return;
        state = 'award';
        clap.setAttribute('aria-disabled', 'true');
        stars += who === 'both' ? 2 : 1;
        var c = fx.centerOf(clap);
        for (var k = 0; k < 3; k++) sfx.noise({ freq: 1800, dur: 0.05, q: 1.2, gain: 0.2, delay: k * 0.13 });
        sfx.play('star');
        fx.burst(c.x, c.y, { emoji: '⭐', count: 8, distance: 90, size: 24 });
        showStars();
        ctx.after(650, function () {
          card.hidden = true;
          labels[landed].classList.remove('is-landed');
          labels[landed].classList.add('is-used');
          if (spins >= SPINS_EACH * 2) party();
          else {
            state = 'wait';
            wheel.setAttribute('aria-disabled', 'false');
            setBoss(1 - boss);
          }
        });
      }

      function party() {
        state = 'party';
        ctx.setTurn(null);
        scene.classList.add('is-party');
        seats.forEach(function (s) { s.classList.remove('is-boss'); });
        sfx.seq([72, 72, 79, 79, 81, 81, 79, null, 77, 77, 76, 76, 74, 74, 72], { step: 0.14, type: 'triangle', gain: 0.16 });
        ctx.win('team', { delay: 2400, emoji: '🎡' });
      }

      ctx.tap(wheel, spin);
      ctx.tap(clap, award);

      /* ---- go ---- */

      drawWheel();
      showStars();
      setBoss(boss);
      ctx.hint(wheel, { delay: 500 });

      ctx.expose({
        get state() { return state; },
        get boss() { return boss; },
        get spins() { return spins; },
        get stars() { return stars; },
        get rot() { return rot; },
        get landed() { return landed; },
        get who() { return who; },
        get target() { return target; },
        get used() { return used.slice(); },
        slices: slices.map(function (s) { return s.emoji; }),
        sliceAt: sliceAt, landingRot: landingRot, pickWho: pickWho, drawSlices: drawSlices,
        SLICES: SLICES, total: SPINS_EACH * 2,
        all: ACTIVE.concat(COSY, [HUG, STAR]).map(function (s) { return s.emoji; }),
      });

      return function cleanup() { ctx.setStatus(null); };
    },
  });
})();
