/* Run & Freeze — red light, green light, with a singing wolf.
 *
 * The wolf turns his back and sings his little song: while it plays, RUN (hold
 * a finger on your side, or pat-pat-pat). The song ends on a "ta-DAA", he
 * spins round to look, and everybody FREEZES: hands off! Anyone still running
 * while he is looking gets huffed back a few steps. Then he turns away and
 * sings again, sometimes slowly, sometimes in a rush. First to the cupcakes
 * wins, and everyone shares.
 *
 * phase: song (back turned: run) -> look (facing you: freeze) -> away (turning back: safe) -> song ...
 * Everyone runs at the same top speed however they tap or hold; the quiet
 * handicap is a shorter lane, a longer "oops, too late" window and a smaller
 * huff for the little player.
 */
(function () {
  'use strict';

  var STEP = 0.28;          // seconds per running step: the same top speed for everyone
  var DIZZY = 0.8;          // seconds a caught player spins
  var LOOK_MS = [1700, 2700];
  var AWAY_MS = 450;

  /* The wolf's song: an original tune. A song is one to three of these bars,
     at one of three speeds, and always ends on the same two notes ("ta-DAA"),
     so the ear learns when the freeze is coming. Notes are MIDI numbers. */
  var BARS = [
    [64, 67, 67, 69, 67, 64, 60, 62],
    [64, 64, 67, 69, 72, 69, 67, 64],
    [60, 62, 64, 67, 69, 67, 69, 72],
    [72, 69, 67, 64, 67, 64, 62, 60],
  ];
  var TA_DAA = [67, 76];
  var TEMPOS = [0.25, 0.19, 0.15]; // seconds per note: strolling, skipping, in a rush
  var MIN_SONG = 1.7;              // seconds: never so short that nobody can move

  /* ---------------------------------------------------------- pure rules */

  /**
   * The quiet handicap. littleIdx: the one little player (or -1 when there
   * are none, or two). -> {len: steps to the cupcakes, grace: seconds after
   * he turns in which still-running feet are forgiven, back: steps lost when caught}
   */
  function setup(help, littleIdx) {
    if (littleIdx < 0 || !help) return { len: [28, 28], grace: [0.35, 0.35], back: [3, 3] };
    var kid = help >= 2 ? { len: 22, grace: 0.9, back: 2 } : { len: 24, grace: 0.65, back: 2 };
    var big = help >= 2 ? { len: 34, grace: 0.2, back: 5 } : { len: 32, grace: 0.2, back: 4 };
    var a = littleIdx === 0 ? [kid, big] : [big, kid];
    return { len: [a[0].len, a[1].len], grace: [a[0].grace, a[1].grace], back: [a[0].back, a[1].back] };
  }

  /** What moving means right now: 'run', 'ignore' (he has only just turned: forgiven) or 'caught'. */
  function judge(phase, sinceLook, grace) {
    if (phase !== 'look') return 'run';
    return sinceLook < grace ? 'ignore' : 'caught';
  }

  /** One song: {notes, step (seconds per note), dur (seconds, including the held last note)}. `longer`: at least two bars. */
  function makeSong(rnd, longer) {
    rnd = rnd || Math.random;
    var step = TEMPOS[Math.floor(rnd() * TEMPOS.length)];
    var bars = 1 + Math.floor(rnd() * 3);
    if (longer) bars = Math.max(2, bars);
    while ((bars * 8 + TA_DAA.length + 1) * step < MIN_SONG) bars++;
    var notes = [];
    for (var b = 0; b < bars; b++) notes = notes.concat(BARS[Math.floor(rnd() * BARS.length)]);
    notes = notes.concat(TA_DAA);
    return { notes: notes, step: step, dur: (notes.length + 1) * step };
  }

  MG.registerGame({
    id: 'tiptoe',
    name: 'Run & Freeze',
    emoji: '🐺',
    color: 'leaf',
    howTo: 'While the wolf sings with his back turned, RUN: hold a finger on your own side (or pat-pat-pat). When the song stops he spins round: FREEZE, hands off! Anyone still running gets huffed back a few steps. First to the cupcakes wins, and everybody gets one.',

    mount: function (root, ctx) {
      var el = ctx.el, sfx = ctx.sfx, fx = ctx.fx, util = ctx.util;
      var players = ctx.players;
      var littleIdx = players[0].little !== players[1].little ? (players[0].little ? 0 : 1) : -1;
      var rules = setup(ctx.help, littleIdx);

      var state = 'play';
      var phase = 'away';
      var lookAt = 0;
      var pos = [0, 0];
      var nextStep = [0, 0], dizzyUntil = [0, 0];
      var caught = [0, 0], caughtNow = [false, false];
      var fingers = {};          // pointerId -> lane: whose side each finger is resting on
      var song = null, songs = 0, notesPlayed = 0;
      var held = false;          // tests freeze the wolf's cycle
      var cancelPhase = null, cancelSong = null;
      var tutorial = [true, true];

      /* ---- build ---- */

      var lanes = players.map(function (p, i) {
        var climber = el('div', { class: 'tt-climber' }, ctx.sticker(p.emoji));
        var hand = el('span', { class: 'tt-hand', 'aria-hidden': 'true', text: '👆' });
        var node = el('button', {
          type: 'button', class: 'tt-lane', 'data-p': String(i), 'aria-label': 'Run, player ' + (i + 1),
          style: { '--c': p.color, '--c-dark': p.dark, '--c-soft': p.soft, '--pos': '0' },
        }, el('span', { class: 'tt-cake', 'aria-hidden': 'true' }, ctx.sticker('🧁')), el('span', { class: 'tt-track', 'aria-hidden': 'true' }), climber, hand);
        return { node: node, climber: climber, hand: hand };
      });
      var wolf = el('div', { class: 'tt-wolf', role: 'img', 'aria-label': 'The wolf' },
        el('span', { class: 'tt-back', 'aria-hidden': 'true' }, el('span', { class: 'tt-tail' })),
        el('span', { class: 'tt-face', 'aria-hidden': 'true' }, ctx.sticker('🐺'), el('span', { class: 'tt-eyes', text: '👀' })),
        el('span', { class: 'tt-notes', 'aria-hidden': 'true' }, el('span', { text: '🎵' }), el('span', { text: '🎶' })));
      var scene = el('div', { class: 'tt-scene', 'data-phase': 'away' }, wolf, lanes[0].node, lanes[1].node);
      root.appendChild(scene);

      function place(i) { lanes[i].node.style.setProperty('--pos', (pos[i] / rules.len[i]).toFixed(4)); }

      /* ---- sounds ---- */

      function sing(midi, last, beat) {
        sfx.note(midi, last ? 0.6 : song.step * 1.5, { type: 'triangle', gain: last ? 0.22 : 0.16 });
        if (beat) sfx.noise({ freq: 2400, dur: 0.03, q: 2, gain: 0.05 }); // a clap on the beat
      }
      function footstep(i) { sfx.tone({ freq: i === 0 ? 240 : 180, to: 120, dur: 0.05, type: 'sine', gain: 0.09 }); }
      function boo() { sfx.noise({ freq: 900, to: 2600, dur: 0.12, q: 1, gain: 0.1 }); sfx.tone({ freq: 196, dur: 0.18, type: 'triangle', gain: 0.14, delay: 0.08 }); }
      function awoo() { sfx.tone({ freq: 330, to: 620, dur: 0.3, type: 'sine', gain: 0.16, attack: 0.05 }); sfx.tone({ freq: 620, to: 300, dur: 0.5, type: 'sine', gain: 0.14, delay: 0.28 }); }

      /* ---- the wolf's cycle ---- */

      function setPhase(next) {
        phase = next;
        scene.dataset.phase = next;
        scene.classList.remove('is-ending');
        if (next === 'look') { lookAt = ctx.time; caughtNow = [false, false]; }
      }

      function schedule(ms, next) {
        if (held) return;
        cancelPhase = ctx.after(ms, next);
      }

      /** He turns his back and sings: run! The notes are played off the game clock, so a pause pauses the song. */
      function startSong() {
        if (state !== 'play') return;
        setPhase('song');
        // a quiet rubber band: a little player far behind gets a longer song to catch up in
        var behind = littleIdx >= 0 ? pos[1 - littleIdx] / rules.len[1 - littleIdx] - pos[littleIdx] / rules.len[littleIdx] : 0;
        song = makeSong(Math.random, behind > 0.3);
        songs++;
        if (held) return;
        var n = 0;
        var note = function () {
          if (state !== 'play' || phase !== 'song') return;
          var last = n === song.notes.length - 1;
          if (n >= song.notes.length - TA_DAA.length) scene.classList.add('is-ending');
          sing(song.notes[n], last, n % 2 === 0);
          notesPlayed++;
          n++;
          if (last) {
            if (cancelSong) { cancelSong(); cancelSong = null; }
            schedule(song.step * 1000, look);
          }
        };
        note();
        cancelSong = ctx.every(song.step * 1000, note);
      }

      /** Silence. He spins round: freeze! */
      function look() {
        if (state !== 'play') return;
        setPhase('look');
        boo();
        fx.pop(wolf);
        schedule(util.randf(LOOK_MS[0], LOOK_MS[1]), function () {
          if (state !== 'play') return;
          setPhase('away');
          schedule(AWAY_MS, startSong);
        });
      }

      /* ---- the players ---- */

      function isDown(i) {
        for (var id in fingers) if (fingers[id] === i) return true;
        return false;
      }

      function step(i) {
        pos[i]++;
        nextStep[i] = ctx.time + STEP;
        place(i);
        footstep(i);
        lanes[i].climber.classList.remove('is-hop');
        void lanes[i].climber.offsetWidth;
        lanes[i].climber.classList.add('is-hop');
        if (tutorial[i]) { tutorial[i] = false; lanes[i].hand.classList.add('is-done'); }
        if (pos[i] >= rules.len[i]) finish(i);
      }

      function tryStep(i) {
        if (ctx.time < nextStep[i] || ctx.time < dizzyUntil[i]) return;
        step(i);
      }

      function catchOut(i) {
        caughtNow[i] = true; // once per look: he does not keep huffing at the same player
        caught[i]++;
        pos[i] = Math.max(0, pos[i] - rules.back[i]);
        dizzyUntil[i] = ctx.time + DIZZY;
        place(i);
        awoo();
        sfx.play('whoosh');
        var c = fx.centerOf(lanes[i].climber);
        fx.burst(c.x, c.y, { emoji: '💨', count: 5, distance: 60, size: 22 });
        lanes[i].climber.classList.add('is-dizzy');
        ctx.after(DIZZY * 1000, function () { lanes[i].climber.classList.remove('is-dizzy'); });
        fx.shake(wolf);
      }

      function finish(w) {
        state = 'done';
        if (cancelPhase) cancelPhase();
        if (cancelSong) cancelSong();
        setPhase('party');
        sfx.play('match');
        var c = fx.centerOf(lanes[w].node.querySelector('.tt-cake'));
        fx.burst(c.x, c.y, { emoji: '🧁', count: 8, distance: 90, size: 24 });
        lanes[w].climber.classList.add('is-champ');
        // the wolf turns out to be friendly: the other one is waved up to share
        ctx.after(500, function () {
          pos[1 - w] = rules.len[1 - w];
          lanes[1 - w].node.classList.add('is-zooming');
          place(1 - w);
          sfx.play('boost');
        });
        ctx.win(w, { delay: 1900, emoji: '🧁' });
      }

      /** Feet are moving on lane i right now (a fresh touch, or a finger still resting there). */
      function moving(i) {
        var what = judge(phase, ctx.time - lookAt, rules.grace[i]);
        if (what === 'run') tryStep(i);
        else if (what === 'caught' && !caughtNow[i] && ctx.time >= dizzyUntil[i]) catchOut(i);
      }

      lanes.forEach(function (lane, i) {
        ctx.tap(lane.node, function (ev) {
          if (state !== 'play') return;
          if (ev.pointerId != null) fingers[ev.pointerId] = i;
          moving(i);
        });
      });
      ['pointerup', 'pointercancel'].forEach(function (type) {
        ctx.on(window, type, function (ev) { delete fingers[ev.pointerId]; });
      });
      ctx.on(window, 'blur', function () { fingers = {}; });

      ctx.frame(function () {
        if (state !== 'play') return;
        for (var i = 0; i < 2; i++) {
          var down = isDown(i);
          lanes[i].node.classList.toggle('is-running', down && phase !== 'look');
          if (down) moving(i);
        }
      });

      /* ---- go ---- */

      ctx.setTurn(null);
      place(0); place(1);
      schedule(700, startSong);

      ctx.expose({
        get state() { return state; },
        get phase() { return phase; },
        get pos() { return pos.slice(); },
        get caught() { return caught.slice(); },
        get dizzy() { return [ctx.time < dizzyUntil[0], ctx.time < dizzyUntil[1]]; },
        get down() { return [isDown(0), isDown(1)]; },
        get song() { return song; },
        get songs() { return songs; },
        get notesPlayed() { return notesPlayed; },
        rules: rules, littleIdx: littleIdx, STEP: STEP,
        setup: setup, judge: judge, makeSong: makeSong,
        /** Tests only: freeze the wolf in one phase (or pass null to let the cycle run again). */
        hold: function (p) {
          if (cancelPhase) cancelPhase();
          if (cancelSong) { cancelSong(); cancelSong = null; }
          if (p == null) { held = false; startSong(); return; }
          held = true;
          setPhase(p);
        },
      });
    },
  });
})();
