/* Animal Band — make up a song together. Each animal sings one note (the
 * elephant stomps the beat); the song is a loop of eight beats that keeps
 * playing round and round. Tap a square to give that animal something to
 * sing on that beat; tap it again to take it away. When there is a tune,
 * the microphone lights up: tap it and the band plays your song as a
 * concert, twice through, to cheers.
 *
 * The notes are a major pentatonic set (C E G A C), so ANY pattern sounds
 * nice: there is no wrong note. Time runs left to right on a wide screen and
 * top to bottom on a tall one.
 * state: jam -> show -> done
 */
(function () {
  'use strict';

  var STEPS = 8;
  /* top to bottom: high to low, then the drum */
  var BAND = [
    { id: 'bird', emoji: '🐦', color: 'sea', midi: 72 },
    { id: 'cat', emoji: '🐱', color: 'tangerine', midi: 69 },
    { id: 'dog', emoji: '🐶', color: 'sun', midi: 67 },
    { id: 'frog', emoji: '🐸', color: 'leaf', midi: 64 },
    { id: 'bear', emoji: '🐻', color: 'grape', midi: 60 },
    { id: 'elephant', emoji: '🐘', color: 'berry', midi: 0 },
  ];
  var SPEED = { slow: 0.36, normal: 0.3, fast: 0.24 };   // seconds per beat
  var READY = 5;           // notes in the song before the microphone lights up
  var SHOW_LOOPS = 2;      // the concert plays the song this many times

  /* ---------------------------------------------------------- pure rules */

  function emptySong() { return BAND.map(function () { var r = []; for (var s = 0; s < STEPS; s++) r.push(false); return r; }); }

  /** The song to start from: an elephant stomp on beats 1 and 5 to build on, or nothing. */
  function startSong(kind) {
    var g = emptySong();
    if (kind === 'beat') { g[BAND.length - 1][0] = true; g[BAND.length - 1][4] = true; }
    return g;
  }

  function countNotes(g) { var n = 0; g.forEach(function (r) { r.forEach(function (on) { if (on) n++; }); }); return n; }

  /** Which animals sing on beat s: [row indexes]. */
  function onBeat(g, s) { var out = []; g.forEach(function (r, i) { if (r[s]) out.push(i); }); return out; }

  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  MG.registerGame({
    id: 'band',
    name: 'Animal Band',
    emoji: '🎵',
    color: 'sea',
    howTo: 'Make up a song together. Each animal sings one note and the elephant stomps the beat; the song plays round and round. Tap a square to give that animal a note on that beat, tap it again to take it away. There are no wrong notes. When the microphone lights up, tap it for the concert.',
    options: [
      { key: 'start', label: 'Start with', default: 'beat', choices: [{ value: 'beat', label: 'A beat', emoji: '🐘' }, { value: 'empty', label: 'Nothing', emoji: '🔇' }] },
      { key: 'speed', label: 'Speed', default: 'normal', choices: [{ value: 'slow', label: 'Slow', emoji: '🐢' }, { value: 'normal', label: 'Medium', emoji: '🐕' }, { value: 'fast', label: 'Fast', emoji: '🐇' }] },
    ],

    mount: function (root, ctx) {
      var el = ctx.el, sfx = ctx.sfx, fx = ctx.fx, util = ctx.util;

      var song = startSong(ctx.opt('start'));
      var step = SPEED[ctx.opt('speed')] || SPEED.normal;
      var state = 'jam';
      var beat = -1;               // the beat playing now
      var ticks = 0;               // beats played so far this mount
      var log = [];                // tests: [{beat, rows}] for the beats played
      var touched = {};            // "r,s" -> game time of its last toggle (a mashed square changes once)
      var booked = 0;              // the tick whose notes are already lined up on the audio clock
      var running = false;
      var cancelLoop = null, cancelNudge = null;

      /* ---- build ---- */

      var heads = BAND.map(function (a, r) {
        return el('button', { type: 'button', class: 'bd-head', 'data-r': String(r), 'aria-label': a.id, style: { '--c': 'var(--' + a.color + ')', '--c-soft': 'var(--' + a.color + '-soft)' } }, ctx.sticker(a.emoji));
      });
      var cells = BAND.map(function (a, r) {
        var row = [];
        for (var s = 0; s < STEPS; s++) {
          row.push(el('button', {
            type: 'button', class: 'bd-cell' + (s >= STEPS / 2 ? ' is-late' : ''), 'data-r': String(r), 'data-s': String(s), 'aria-label': a.id + ' on beat ' + (s + 1),
            style: { '--c': 'var(--' + a.color + ')', '--c-soft': 'var(--' + a.color + '-soft)' },
          }, el('span', { class: 'bd-note', 'aria-hidden': 'true' }, ctx.sticker(a.emoji))));
        }
        return row;
      });
      var flat = [].concat.apply([], cells);
      var grid = el('div', { class: 'bd-grid', role: 'grid', 'aria-label': 'The song' }, heads, flat);
      var mic = el('button', { type: 'button', class: 'bd-mic', 'aria-label': 'Concert!', 'aria-disabled': 'true' }, el('span', { class: 'bd-mic__icon', 'aria-hidden': 'true', text: '🎤' }));
      var stage = el('div', { class: 'bd-stage', 'aria-hidden': 'true' }, BAND.map(function (a) {
        return el('span', { class: 'bd-star', style: { '--c': 'var(--' + a.color + ')' } }, ctx.sticker(a.emoji));
      }));
      var scene = el('div', { class: 'bd-scene' }, grid, mic, stage);
      root.appendChild(scene);

      /** Time runs across a wide screen and down a tall one. */
      function layout() {
        var wide = ctx.size().orient === 'landscape';
        heads.forEach(function (h, r) {
          h.style.gridRow = wide ? String(r + 1) : '1';
          h.style.gridColumn = wide ? '1' : String(r + 1);
        });
        cells.forEach(function (row, r) {
          row.forEach(function (c, s) {
            c.style.gridRow = wide ? String(r + 1) : String(s + 2);
            c.style.gridColumn = wide ? String(s + 2) : String(r + 1);
          });
        });
        grid.dataset.flow = wide ? 'across' : 'down';
      }
      layout();
      ctx.onResize(layout);

      /* ---- the voices ---- */

      function sing(r, delay) {
        var a = BAND[r], d = delay || 0, f = mtof(a.midi);
        switch (a.id) {
          case 'bird': sfx.tone({ freq: f, to: f * 1.26, dur: 0.09, type: 'sine', gain: 0.17, delay: d }); sfx.tone({ freq: f * 1.12, to: f * 1.5, dur: 0.08, type: 'sine', gain: 0.13, delay: d + 0.09 }); break;
          case 'cat': sfx.tone({ freq: f * 0.9, to: f * 1.06, dur: 0.26, type: 'triangle', gain: 0.2, delay: d, attack: 0.03 }); break;
          case 'dog': sfx.tone({ freq: f, to: f * 0.82, dur: 0.13, type: 'square', gain: 0.07, delay: d }); sfx.noise({ freq: 500, dur: 0.05, q: 1, gain: 0.05, delay: d }); break;
          case 'frog': sfx.tone({ freq: f, to: f * 0.94, dur: 0.06, type: 'square', gain: 0.06, delay: d }); sfx.tone({ freq: f * 1.02, to: f * 0.9, dur: 0.07, type: 'square', gain: 0.06, delay: d + 0.09 }); break;
          case 'bear': sfx.tone({ freq: f, to: f * 0.985, dur: 0.38, type: 'triangle', gain: 0.22, delay: d, attack: 0.02 }); break;
          default: sfx.noise({ freq: 160, to: 90, dur: 0.12, q: 1.2, gain: 0.3, delay: d }); sfx.tone({ freq: 90, to: 48, dur: 0.2, type: 'sine', gain: 0.4, delay: d });
        }
      }

      /* ---- the loop ---- */

      var t0 = 0;
      /** One beat: light it up, make its singers bounce, and line up the next beat's notes exactly on time. */
      function tick() {
        beat = (beat + 1) % STEPS;
        ticks++;
        var rows = onBeat(song, beat);
        log.push({ beat: beat, rows: rows.slice() });
        if (log.length > 64) log.shift();
        if (state === 'show' && ticks > STEPS * SHOW_LOOPS) return; // (the concert is over)
        flat.forEach(function (c) { c.classList.toggle('is-now', +c.dataset.s === beat); });
        rows.forEach(function (r) {
          var c = cells[r][beat];
          c.classList.remove('is-sing'); void c.offsetWidth; c.classList.add('is-sing');
          heads[r].classList.remove('is-sing'); void heads[r].offsetWidth; heads[r].classList.add('is-sing');
          if (state === 'show') { var st = stage.children[r]; st.classList.remove('is-sing'); void st.offsetWidth; st.classList.add('is-sing'); }
        });
        if (state === 'show') showBeat();
      }

      /*
       * Each beat's notes are lined up on the audio clock a moment (under 70ms)
       * before the beat is due, so the rhythm stays steady even when a frame
       * is late. Only a moment ahead: a pause can never leave a note sounding
       * behind the pause menu, or a beat silent afterwards.
       */
      ctx.frame(function () {
        if (!running) return;
        var n = ticks + 1;                      // the next tick to come (counting from 1)
        if (booked >= n) return;
        if (state === 'show' && n > STEPS * SHOW_LOOPS) return;   // the concert plays the song exactly twice
        var at = t0 + ticks * step, lead = at - ctx.time;
        if (lead > 0.07) return;
        booked = n;
        onBeat(song, (beat + 1) % STEPS).forEach(function (r) { sing(r, Math.max(0, lead)); });
      });

      function startLoop() {
        if (cancelLoop) cancelLoop();
        beat = -1;
        ticks = 0;
        booked = 0;
        running = true;
        t0 = ctx.time + 0.05;
        ctx.after(50, function () {
          tick();
          cancelLoop = ctx.every(step * 1000, tick);
        });
      }

      /* ---- making the song ---- */

      function refresh() {
        var n = countNotes(song), ready = n >= READY && state === 'jam';
        mic.setAttribute('aria-disabled', ready ? 'false' : 'true');
        mic.classList.toggle('is-ready', ready);
        if (cancelNudge) { cancelNudge(); cancelNudge = null; }
        if (ready) cancelNudge = ctx.after(20000, function () { cancelNudge = null; if (state === 'jam') ctx.hint(mic); });
      }

      function draw(r, s) {
        var c = cells[r][s];
        c.classList.toggle('is-on', song[r][s]);
        c.setAttribute('aria-pressed', song[r][s] ? 'true' : 'false');
      }

      ctx.tap(grid, function (ev, node) {
        if (state !== 'jam') {
          // during the concert every tap still gets an answer: that animal sings along
          var sr = +node.dataset.r;
          sing(sr);
          var st = stage.children[sr];
          if (st) { st.classList.remove('is-sing'); void st.offsetWidth; st.classList.add('is-sing'); }
          return;
        }
        if (node.classList.contains('bd-head')) {
          var hr = +node.dataset.r;
          sing(hr);
          fx.bounce(node);
          return;
        }
        var r = +node.dataset.r, s = +node.dataset.s, key = r + ',' + s;
        if (touched[key] != null && ctx.time - touched[key] < 0.25) { sfx.play('tick'); return; }
        touched[key] = ctx.time;
        song[r][s] = !song[r][s];
        draw(r, s);
        if (song[r][s]) { sing(r); fx.pop(node); }
        else { sfx.tone({ freq: 500, to: 300, dur: 0.07, type: 'sine', gain: 0.08 }); fx.wiggle(node); }
        refresh();
      }, { delegate: '.bd-cell, .bd-head', slop: 10 });

      /* ---- the concert ---- */

      ctx.tap(mic, function () {
        if (state !== 'jam' || countNotes(song) < READY) return;
        state = 'show';
        if (cancelNudge) { cancelNudge(); cancelNudge = null; }
        refresh();
        scene.classList.add('is-show');
        sfx.play('start');
        // a beat of quiet, then from the top
        if (cancelLoop) { cancelLoop(); cancelLoop = null; }
        running = false;
        flat.forEach(function (c) { c.classList.remove('is-now'); });
        ctx.after(700, startLoop);
      });

      function showBeat() {
        if (ticks >= STEPS * SHOW_LOOPS) {
          if (cancelLoop) { cancelLoop(); cancelLoop = null; }
          running = false;
          state = 'done';
          ctx.after(step * 1000, function () {
            // ta-da, and the audience goes wild
            sfx.play('match');
            for (var i = 0; i < 10; i++) sfx.noise({ freq: 2500 + Math.random() * 1500, dur: 0.03, q: 2, gain: 0.12, delay: 0.25 + i * 0.07 + Math.random() * 0.03 });
            var c = fx.centerOf(stage);
            fx.burst(c.x, c.y, { emoji: '👏', count: 8, distance: 120, size: 30 });
            ctx.win('team', { delay: 700, emoji: '🎵' });
          });
        }
      }

      /* ---- go ---- */

      ctx.setTurn(null);
      song.forEach(function (row, r) { row.forEach(function (on, s) { draw(r, s); }); });
      refresh();
      startLoop();
      ctx.hint(cells[1][2], { delay: 1200 });

      ctx.expose({
        get state() { return state; },
        get song() { return song.map(function (r) { return r.slice(); }); },
        get notes() { return countNotes(song); },
        get beat() { return beat; },
        get ticks() { return ticks; },
        get log() { return log.slice(); },
        get step() { return step; },
        get booked() { return booked; },
        BAND: BAND.map(function (a) { return a.id; }), STEPS: STEPS, READY: READY, SHOW_LOOPS: SHOW_LOOPS,
        startSong: startSong, countNotes: countNotes, onBeat: onBeat,
      });
    },
  });
})();
