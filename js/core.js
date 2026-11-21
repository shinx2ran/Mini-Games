/* Pocket Playroom — shared core.
 *
 * Everything hangs off one global, `MG`. Classic scripts (no modules, no build
 * step) so the page works from file://, any static host, or bundled into one
 * HTML file by tools/build.mjs.
 *
 * Games register themselves with MG.registerGame({...}) and get a `ctx` object
 * when mounted. See docs/GAME_API.md for the contract.
 */
(function () {
  'use strict';

  var MG = (window.MG = window.MG || {});
  MG.version = '1.0.0';
  MG.timeScale = 1; // tests raise this to fast-forward the game clock
  // Some hosts run the page in a locked-down frame where the camera and motion
  // sensors are refused. The bundle for such a host sets MG_SANDBOX, and games
  // then use their touch controls without ever asking.
  MG.noSensors = !!window.MG_SANDBOX;
  MG.games = [];
  MG.current = null; // { id, ctx, api } for the mounted game (tests read this)

  var reducedMotion = false;
  try {
    reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e) {}
  MG.reducedMotion = reducedMotion;

  /* ------------------------------------------------------------------ util */

  var util = (MG.util = {
    /** Integer in [0, n). */
    rand: function (n) { return Math.floor(Math.random() * n); },
    /** Float in [a, b). */
    randf: function (a, b) { return a + Math.random() * (b - a); },
    pick: function (arr) { return arr[util.rand(arr.length)]; },
    /** Returns a NEW shuffled array (Fisher-Yates). */
    shuffle: function (arr) {
      var a = arr.slice();
      for (var i = a.length - 1; i > 0; i--) {
        var j = util.rand(i + 1);
        var t = a[i]; a[i] = a[j]; a[j] = t;
      }
      return a;
    },
    /** n distinct random items. */
    sample: function (arr, n) { return util.shuffle(arr).slice(0, n); },
    clamp: function (v, lo, hi) { return Math.max(lo, Math.min(hi, v)); },
    lerp: function (a, b, t) { return a + (b - a) * t; },
    range: function (n) { var r = []; for (var i = 0; i < n; i++) r.push(i); return r; },
  });

  /* ----------------------------------------------------------------- store */

  var store = (MG.store = {
    get: function (key, fallback) {
      try {
        var v = window.localStorage.getItem('mg:' + key);
        return v == null ? fallback : JSON.parse(v);
      } catch (e) { return fallback; }
    },
    set: function (key, value) {
      try { window.localStorage.setItem('mg:' + key, JSON.stringify(value)); } catch (e) {}
    },
  });

  /* -------------------------------------------------------------------- ui */

  function append(node, kids) {
    for (var i = 0; i < kids.length; i++) {
      var k = kids[i];
      if (k == null || k === false) continue;
      if (Array.isArray(k)) append(node, k);
      else node.appendChild(typeof k === 'object' ? k : document.createTextNode(String(k)));
    }
  }

  /**
   * el('div', {class:'x', text:'hi', style:{'--a':1, width:'10px'}, data:{id:3},
   *            onclick: fn, 'aria-label':'..'}, child, [children], 'text')
   */
  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        var v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'style') {
          if (typeof v === 'string') node.style.cssText = v;
          else for (var s in v) {
            if (s.indexOf('--') === 0) node.style.setProperty(s, v[s]);
            else node.style[s] = v[s];
          }
        } else if (k === 'data') { for (var d in v) node.dataset[d] = v[d]; }
        else if (k.indexOf('on') === 0 && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
        else node.setAttribute(k, v === true ? '' : v);
      }
    }
    append(node, Array.prototype.slice.call(arguments, 2));
    return node;
  }

  var ICONS = {
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="4" width="5" height="16" rx="2"/><rect x="14" y="4" width="5" height="16" rx="2"/></svg>',
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15a1.5 1.5 0 0 0 2.3 1.3l11.5-7.5a1.5 1.5 0 0 0 0-2.6L9.3 3.2A1.5 1.5 0 0 0 7 4.5z"/></svg>',
    home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.3 11.2 11 4a1.5 1.5 0 0 1 2 0l7.7 7.2a1 1 0 0 1-.7 1.8H19v6.5a1.5 1.5 0 0 1-1.5 1.5H14v-5h-4v5H6.5A1.5 1.5 0 0 1 5 19.500V13H4a1 1 0 0 1-.7-1.800z"/></svg>',
    again: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4a8 8 0 1 0 7.7 10.200 1.500 1.500 0 0 0-2.900-.800A5 5 0 1 1 12 7h.6l-1.200 1.200a1.400 1.400 0 0 0 2 2l3.700-3.700a1.400 1.400 0 0 0 0-2L13.400.800a1.400 1.400 0 0 0-2 2L12.600 4z"/></svg>',
    soundOn: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.500A1.500 1.500 0 0 1 5.500 8H8l4.400-3.700A1 1 0 0 1 14 5.100v13.800a1 1 0 0 1-1.600.800L8 16H5.500A1.500 1.500 0 0 1 4 14.500z"/><path d="M16.500 8.500a5 5 0 0 1 0 7M18.800 6a8.500 8.500 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2.200" stroke-linecap="round"/></svg>',
    soundOff: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.500A1.500 1.500 0 0 1 5.500 8H8l4.400-3.700A1 1 0 0 1 14 5.100v13.800a1 1 0 0 1-1.600.800L8 16H5.500A1.500 1.500 0 0 1 4 14.500z"/><path d="m17 9.500 5 5m0-5-5 5" fill="none" stroke="currentColor" stroke-width="2.200" stroke-linecap="round"/></svg>',
    gear: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.300 2.600a1.500 1.500 0 0 1 3.400 0l.200 1.300a8 8 0 0 1 1.900.800l1.100-.800a1.500 1.500 0 0 1 2.400 2.400l-.800 1.100a8 8 0 0 1 .800 1.900l1.300.200a1.500 1.500 0 0 1 0 3.400l-1.300.200a8 8 0 0 1-.800 1.900l.800 1.100a1.500 1.500 0 0 1-2.400 2.400l-1.100-.800a8 8 0 0 1-1.900.800l-.200 1.300a1.500 1.500 0 0 1-3.400 0l-.200-1.300a8 8 0 0 1-1.900-.800l-1.100.800a1.500 1.500 0 0 1-2.400-2.400l.800-1.100a8 8 0 0 1-.800-1.900l-1.300-.200a1.500 1.500 0 0 1 0-3.400l1.300-.200a8 8 0 0 1 .800-1.900l-.800-1.100a1.500 1.500 0 0 1 2.400-2.400l1.100.800a8 8 0 0 1 1.900-.800zM12 8.500a3.500 3.500 0 1 0 0 7 3.500 3.500 0 0 0 0-7z"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.500 4.500 4.500L19 7.500" fill="none" stroke="currentColor" stroke-width="3.400" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };

  function icon(name) {
    var span = el('span', { class: 'mg-icon', 'aria-hidden': 'true' });
    span.innerHTML = ICONS[name] || '';
    return span;
  }

  /** An emoji drawn as a die-cut sticker (white edge + soft drop). */
  function sticker(emoji, extraClass) {
    return el('span', { class: 'mg-sticker' + (extraClass ? ' ' + extraClass : ''), 'aria-hidden': 'true', text: emoji });
  }

  /** Chunky shell button. opts: {icon, emoji, label, color, class, onTap, ariaLabel} */
  function button(opts) {
    var b = el('button', {
      type: 'button',
      class: 'mg-btn' + (opts.class ? ' ' + opts.class : ''),
      'aria-label': opts.ariaLabel || opts.label || null,
      style: opts.color ? { '--btn': 'var(--' + opts.color + ')', '--btn-dark': 'var(--' + opts.color + '-dark)' } : null,
    },
      opts.icon ? icon(opts.icon) : null,
      opts.emoji ? el('span', { class: 'mg-btn__emoji', 'aria-hidden': 'true', text: opts.emoji }) : null,
      opts.label ? el('span', { class: 'mg-btn__label', text: opts.label }) : null);
    if (opts.onTap) b.addEventListener('click', function (ev) { sfx.unlock(); opts.onTap(ev); });
    return b;
  }

  MG.ui = { el: el, icon: icon, sticker: sticker, button: button };

  /* ------------------------------------------------------------------- sfx */

  var sfx = (MG.sfx = (function () {
    var ac = null, master = null, noiseBuf = null;
    var muted = !!store.get('muted', false);
    var unlocked = false;

    function audio() {
      if (ac) return ac;
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try {
        ac = new AC();
        master = ac.createGain();
        master.gain.value = 0.9;
        var comp = ac.createDynamicsCompressor();
        master.connect(comp);
        comp.connect(ac.destination);
      } catch (e) { ac = null; }
      return ac;
    }

    /** Must run inside a user gesture at least once before any sound plays. */
    function unlock() {
      var a = audio();
      if (!a) return;
      unlocked = true;
      if (a.state !== 'running' && a.resume) {
        try { var p = a.resume(); if (p && p.catch) p.catch(function () {}); } catch (e) {}
      }
    }

    function ready() { return !muted && unlocked && audio(); }

    function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }

    /** tone({freq, to, dur, type, gain, delay, attack}) — one enveloped oscillator. */
    function tone(o) {
      var a = ready();
      if (!a) return;
      try {
        var t0 = a.currentTime + (o.delay || 0);
        var dur = o.dur || 0.12;
        var osc = a.createOscillator();
        var g = a.createGain();
        osc.type = o.type || 'sine';
        osc.frequency.setValueAtTime(Math.max(20, o.freq), t0);
        if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t0 + dur);
        var peak = o.gain == null ? 0.22 : o.gain;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + (o.attack || 0.008));
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        osc.connect(g);
        g.connect(master);
        osc.start(t0);
        osc.stop(t0 + dur + 0.05);
      } catch (e) {}
    }

    /** noise({dur, freq, q, gain, delay, type}) — filtered white-noise burst. */
    function noise(o) {
      var a = ready();
      if (!a) return;
      try {
        if (!noiseBuf) {
          noiseBuf = a.createBuffer(1, a.sampleRate, a.sampleRate);
          var d = noiseBuf.getChannelData(0);
          for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        }
        var t0 = a.currentTime + (o.delay || 0);
        var dur = o.dur || 0.1;
        var src = a.createBufferSource();
        src.buffer = noiseBuf;
        var f = a.createBiquadFilter();
        f.type = o.type || 'bandpass';
        f.frequency.setValueAtTime(o.freq || 1200, t0);
        if (o.to) f.frequency.exponentialRampToValueAtTime(Math.max(40, o.to), t0 + dur);
        f.Q.value = o.q == null ? 1 : o.q;
        var g = a.createGain();
        var peak = o.gain == null ? 0.2 : o.gain;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + 0.006);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        src.connect(f); f.connect(g); g.connect(master);
        src.start(t0, Math.random() * 0.5);
        src.stop(t0 + dur + 0.05);
      } catch (e) {}
    }

    /** note(midi, dur, {type, gain, delay}) */
    function note(midi, dur, o) {
      o = o || {};
      tone({ freq: mtof(midi), dur: dur || 0.18, type: o.type || 'triangle', gain: o.gain, delay: o.delay });
    }

    /** seq([60, 64, null, 67], {step: 0.12, dur, type, gain}) — null is a rest. */
    function seq(notes, o) {
      o = o || {};
      var step = o.step || 0.12;
      for (var i = 0; i < notes.length; i++) {
        if (notes[i] == null) continue;
        note(notes[i], o.dur || step * 1.7, { type: o.type, gain: o.gain, delay: (o.delay || 0) + i * step });
      }
    }

    var PENTA = [60, 62, 64, 67, 69, 72, 74, 76, 79, 81, 84, 86, 88];
    /** scale(i) — i-th note of a C pentatonic scale; rising i always sounds good. */
    function scale(i, o) {
      note(PENTA[util.clamp(Math.round(i), 0, PENTA.length - 1)], (o && o.dur) || 0.2, o);
    }

    var presets = {
      tap: function () { tone({ freq: 520, to: 700, dur: 0.06, type: 'triangle', gain: 0.16 }); },
      tick: function () { tone({ freq: 900, dur: 0.03, type: 'square', gain: 0.06 }); },
      boop: function () { tone({ freq: 330, to: 290, dur: 0.07, type: 'sine', gain: 0.07 }); },
      ding: function () { tone({ freq: 1568, dur: 0.5, type: 'sine', gain: 0.2 }); tone({ freq: 3136, dur: 0.25, type: 'sine', gain: 0.06 }); },
      pop: function (o) {
        var f = (o && o.pitch) || util.randf(380, 620);
        tone({ freq: f, to: f * 2.2, dur: 0.07, type: 'sine', gain: 0.3 });
        noise({ freq: 2400, dur: 0.05, gain: 0.12, q: 0.7 });
      },
      flip: function () { noise({ freq: 1800, to: 3200, dur: 0.07, gain: 0.14, q: 2 }); tone({ freq: 640, dur: 0.04, type: 'triangle', gain: 0.08 }); },
      drop: function () { tone({ freq: 220, to: 90, dur: 0.16, type: 'sine', gain: 0.4 }); noise({ freq: 300, dur: 0.06, gain: 0.12 }); },
      hop: function (o) { var f = (o && o.pitch) || 420; tone({ freq: f, to: f * 1.6, dur: 0.1, type: 'triangle', gain: 0.2 }); },
      good: function () { seq([72, 79], { step: 0.09, type: 'triangle', gain: 0.22 }); },
      match: function () { seq([67, 72, 76, 84], { step: 0.07, type: 'triangle', gain: 0.22 }); },
      star: function () { seq([84, 91], { step: 0.06, type: 'sine', gain: 0.2 }); },
      oops: function () { tone({ freq: 300, to: 200, dur: 0.22, type: 'sine', gain: 0.22 }); },
      boing: function () { tone({ freq: 180, to: 520, dur: 0.22, type: 'sine', gain: 0.3 }); tone({ freq: 520, to: 260, dur: 0.18, type: 'sine', gain: 0.18, delay: 0.2 }); },
      whoosh: function () { noise({ freq: 500, to: 3000, dur: 0.28, gain: 0.16, q: 0.8 }); },
      slide: function () { tone({ freq: 880, to: 220, dur: 0.45, type: 'sine', gain: 0.22 }); },
      boost: function () { seq([72, 76, 79, 84, 88], { step: 0.05, type: 'triangle', gain: 0.18 }); },
      roll: function () { for (var i = 0; i < 6; i++) noise({ freq: util.randf(900, 2200), dur: 0.035, gain: 0.14, q: 3, delay: i * 0.06 + Math.random() * 0.02 }); },
      splash: function () { noise({ freq: 900, to: 300, dur: 0.35, gain: 0.22, q: 0.6 }); tone({ freq: 300, to: 120, dur: 0.2, type: 'sine', gain: 0.16 }); },
      munch: function () { for (var i = 0; i < 3; i++) noise({ freq: 700, dur: 0.05, gain: 0.2, q: 1.5, delay: i * 0.09 }); },
      giggle: function () { seq([76, 79, 76, 79, 83], { step: 0.07, type: 'sine', gain: 0.18 }); },
      start: function () { seq([60, 64, 67, 72], { step: 0.09, type: 'triangle', gain: 0.2 }); },
      turn0: function () { seq([76, 81], { step: 0.1, type: 'triangle', gain: 0.18 }); },
      turn1: function () { seq([64, 69], { step: 0.1, type: 'triangle', gain: 0.2 }); },
      win: function () {
        seq([72, 76, 79, 84, null, 79, 84], { step: 0.11, type: 'triangle', gain: 0.24 });
        seq([48, null, 55, 60], { step: 0.22, type: 'sine', gain: 0.18 });
      },
      tie: function () { seq([67, 72, 67, 72, 76], { step: 0.12, type: 'triangle', gain: 0.2 }); },
      lullaby: function () { seq([76, 72, 74, 71, 72, 67, null, 64, 67, 60], { step: 0.42, dur: 0.9, type: 'sine', gain: 0.16 }); },
    };

    function play(name, o) {
      var p = presets[name];
      if (p) p(o);
    }

    return {
      play: play, tone: tone, noise: noise, note: note, seq: seq, scale: scale, unlock: unlock,
      names: function () { return Object.keys(presets); },
      /** Silence everything while the page is in the background. */
      setSuspended: function (s) {
        if (!ac) return;
        try {
          var p = s ? ac.suspend() : (unlocked ? ac.resume() : null);
          if (p && p.catch) p.catch(function () {});
        } catch (e) {}
        if (s) { try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (e) {} }
      },
      get muted() { return muted; },
      setMuted: function (m) {
        muted = !!m;
        store.set('muted', muted);
        if (muted) { try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (e) {} }
        document.documentElement.classList.toggle('mg-muted', muted);
      },
    };
  })());

  /* ----------------------------------------------------------------- voice */

  MG.voiceOn = !!store.get('voice', true);

  /**
   * Speak with the device's own voice and language. Numbers are passed as
   * digits ("3") so the device says them in the family's language.
   * Silently does nothing if speech is unavailable, muted, or switched off.
   */
  MG.say = function (text, o) {
    try {
      if (sfx.muted || !MG.voiceOn || !('speechSynthesis' in window)) return;
      var u = new window.SpeechSynthesisUtterance(String(text));
      u.lang = (o && o.lang) || navigator.language || 'en-US';
      u.rate = (o && o.rate) || 1;
      u.pitch = (o && o.pitch) || 1.25;
      if (!(o && o.queue)) window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch (e) {}
  };

  /* -------------------------------------------------------------------- fx */

  var CONFETTI_COLORS = ['#FF5D8F', '#FF8A3D', '#FFC933', '#4CCB6B', '#2FB4F5', '#9B6BFF'];

  var fx = (MG.fx = {
    layer: function () {
      var l = document.getElementById('mg-fx');
      if (!l) { l = el('div', { id: 'mg-fx', 'aria-hidden': 'true' }); document.body.appendChild(l); }
      return l;
    },
    /** Viewport centre of an element: {x, y}. */
    centerOf: function (node) {
      var r = node.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    },
    /** Radial pop of little pieces at viewport point (x, y). o: {count, emoji, color, colors, distance, size} */
    burst: function (x, y, o) {
      o = o || {};
      var layer = fx.layer();
      var n = Math.max(3, Math.round((o.count || 10) * (reducedMotion ? 0.4 : 1)));
      var dist = o.distance || 70;
      var colors = o.colors || (o.color ? [o.color] : CONFETTI_COLORS);
      for (var i = 0; i < n; i++) {
        var ang = (i / n) * Math.PI * 2 + Math.random() * 0.6;
        var r = dist * util.randf(0.5, 1.1);
        var size = (o.size || (o.emoji ? 22 : 10)) * util.randf(0.7, 1.2);
        var p = el('span', {
          class: 'mg-particle' + (o.emoji ? ' mg-particle--emoji' : ''),
          text: o.emoji || null,
          style: o.emoji
            ? { left: x + 'px', top: y + 'px', fontSize: size + 'px' }
            : { left: x + 'px', top: y + 'px', width: size + 'px', height: size + 'px', background: util.pick(colors) },
        });
        layer.appendChild(p);
        animateOut(p, [
          { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 1 },
          { transform: 'translate(calc(-50% + ' + Math.cos(ang) * r + 'px), calc(-50% + ' + Math.sin(ang) * r + 'px)) scale(1) rotate(' + util.randf(-180, 180) + 'deg)', opacity: 1, offset: 0.7 },
          { transform: 'translate(calc(-50% + ' + Math.cos(ang) * r * 1.1 + 'px), calc(-50% + ' + (Math.sin(ang) * r * 1.1 + 24) + 'px)) scale(0.6) rotate(' + util.randf(-240, 240) + 'deg)', opacity: 0 },
        ], util.randf(450, 750));
      }
    },
    /** Full-screen confetti rain. o: {count, emojis} */
    confetti: function (o) {
      o = o || {};
      var layer = fx.layer();
      var n = Math.round((o.count || 70) * (reducedMotion ? 0.25 : 1));
      var W = window.innerWidth, H = window.innerHeight;
      for (var i = 0; i < n; i++) {
        var useEmoji = o.emojis && Math.random() < 0.3;
        var size = useEmoji ? util.randf(20, 34) : util.randf(8, 15);
        var x0 = Math.random() * W;
        var drift = util.randf(-120, 120);
        var p = el('span', {
          class: 'mg-particle' + (useEmoji ? ' mg-particle--emoji' : ' mg-particle--paper'),
          text: useEmoji ? util.pick(o.emojis) : null,
          style: useEmoji
            ? { left: x0 + 'px', top: '-40px', fontSize: size + 'px' }
            : { left: x0 + 'px', top: '-40px', width: size + 'px', height: size * util.randf(0.5, 1.4) + 'px', background: util.pick(CONFETTI_COLORS) },
        });
        layer.appendChild(p);
        animateOut(p, [
          { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
          { transform: 'translate(' + drift + 'px,' + (H + 80) + 'px) rotate(' + util.randf(-720, 720) + 'deg)', opacity: 1 },
        ], util.randf(1400, 2800), util.randf(0, 500), 'cubic-bezier(.2,.6,.6,1)');
      }
    },
    /** Something small rising and fading at (x, y): "+1", "⭐". */
    float: function (x, y, content, o) {
      o = o || {};
      var p = el('span', { class: 'mg-float', text: content, style: { left: x + 'px', top: y + 'px', fontSize: (o.size || 34) + 'px', color: o.color || null } });
      fx.layer().appendChild(p);
      animateOut(p, [
        { transform: 'translate(-50%,-50%) scale(0.5)', opacity: 0 },
        { transform: 'translate(-50%,-90%) scale(1.15)', opacity: 1, offset: 0.25 },
        { transform: 'translate(-50%,-220%) scale(1)', opacity: 0 },
      ], o.duration || 900);
    },
    pop: function (node) { return anim(node, [{ transform: 'scale(1)' }, { transform: 'scale(1.25)' }, { transform: 'scale(0.94)' }, { transform: 'scale(1)' }], 320); },
    shake: function (node) { return anim(node, [{ transform: 'translateX(0)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(8px)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(0)' }], 360); },
    wiggle: function (node) { return anim(node, [{ transform: 'rotate(0)' }, { transform: 'rotate(-10deg)' }, { transform: 'rotate(10deg)' }, { transform: 'rotate(-6deg)' }, { transform: 'rotate(6deg)' }, { transform: 'rotate(0)' }], 480); },
    bounce: function (node) { return anim(node, [{ transform: 'translateY(0)' }, { transform: 'translateY(-22%)' }, { transform: 'translateY(0)' }, { transform: 'translateY(-9%)' }, { transform: 'translateY(0)' }], 520); },
  });

  /** Decorative WAAPI animation composited on top of the element's own transform. */
  function anim(node, frames, ms) {
    if (!node || !node.animate) return null;
    try { return node.animate(frames, { duration: reducedMotion ? Math.min(ms, 160) : ms, easing: 'ease-out', composite: 'add' }); }
    catch (e) { try { return node.animate(frames, { duration: ms, easing: 'ease-out' }); } catch (e2) { return null; } }
  }

  function animateOut(node, frames, ms, delay, easing) {
    var done = function () { if (node.parentNode) node.parentNode.removeChild(node); };
    if (!node.animate) { setTimeout(done, ms); return; }
    try {
      var a = node.animate(frames, { duration: ms, delay: delay || 0, easing: easing || 'cubic-bezier(.15,.7,.3,1)', fill: 'both' });
      a.onfinish = done; a.oncancel = done;
    } catch (e) { setTimeout(done, ms); }
    setTimeout(done, ms + (delay || 0) + 400); // belt and braces: never leak particles
  }

  /* --------------------------------------------------------------- players */

  var COLOR_NAMES = ['berry', 'tangerine', 'sun', 'leaf', 'sea', 'grape'];
  var AVATARS = ['🐰', '🐻', '🐱', '🐶', '🦊', '🐼', '🐸', '🐵', '🦁', '🐯', '🐷', '🐨', '🦄', '🐙', '🐧', '🐥'];
  MG.COLOR_NAMES = COLOR_NAMES;
  MG.AVATARS = AVATARS;

  var DEFAULT_PLAYERS = [
    { emoji: '🐰', color: 'berry', little: true },
    { emoji: '🐻', color: 'sea', little: false },
  ];

  function loadPlayers() {
    var saved = store.get('players', null);
    var out = [];
    for (var i = 0; i < 2; i++) {
      var s = (saved && saved[i]) || {};
      var d = DEFAULT_PLAYERS[i];
      out.push({
        emoji: AVATARS.indexOf(s.emoji) >= 0 ? s.emoji : d.emoji,
        color: COLOR_NAMES.indexOf(s.color) >= 0 ? s.color : d.color,
        little: typeof s.little === 'boolean' ? s.little : d.little,
      });
    }
    if (out[0].color === out[1].color) out[1].color = COLOR_NAMES[(COLOR_NAMES.indexOf(out[0].color) + 3) % COLOR_NAMES.length];
    if (out[0].emoji === out[1].emoji) out[1].emoji = AVATARS[(AVATARS.indexOf(out[0].emoji) + 1) % AVATARS.length];
    return out;
  }

  var playerCfg = loadPlayers();

  /** How much invisible help the little player gets: 0 none, 1 some, 2 lots. */
  var help = store.get('help', 1);
  if (help !== 0 && help !== 1 && help !== 2) help = 1;

  /* One shared sticker book for the two of them — never a parent-vs-child tally. */
  var STICKER_POOL = ['⭐', '🌈', '🍓', '🎈', '🦋', '🌻', '🍩', '🚀', '🐞', '🍭', '🎁', '🌙', '🍉', '🐠', '🎀', '🍦', '🐝', '🌸', '🍪', '🍒', '🐢', '🍄', '🎵', '💎'];
  var STICKER_MAX = 60;
  var stickers = store.get('stickers', []);
  if (!Array.isArray(stickers)) stickers = [];
  stickers = stickers.filter(function (s) { return typeof s === 'string' && s.length <= 8; }).slice(-STICKER_MAX);

  function awardSticker() {
    var s = util.pick(STICKER_POOL);
    stickers.push(s);
    if (stickers.length > STICKER_MAX) stickers = stickers.slice(-STICKER_MAX);
    store.set('stickers', stickers);
    return s;
  }

  /**
   * Snapshot of the two players for games:
   * {index, emoji, colorName, color, dark, soft, little}. `color`, `dark` and
   * `soft` are CSS values (var(--berry) etc.), safe to put straight in styles.
   */
  function getPlayers() {
    return playerCfg.map(function (p, i) {
      return {
        index: i, emoji: p.emoji, colorName: p.color, little: p.little,
        color: 'var(--' + p.color + ')', dark: 'var(--' + p.color + '-dark)', soft: 'var(--' + p.color + '-soft)',
      };
    });
  }
  MG.getPlayers = getPlayers;

  function savePlayers() { store.set('players', playerCfg); applyPlayerVars(); }

  /** Expose player colours to all CSS as --p0/--p0-dark/--p0-soft and --p1/... */
  function applyPlayerVars() {
    var rs = document.documentElement.style;
    playerCfg.forEach(function (p, i) {
      rs.setProperty('--p' + i, 'var(--' + p.color + ')');
      rs.setProperty('--p' + i + '-dark', 'var(--' + p.color + '-dark)');
      rs.setProperty('--p' + i + '-soft', 'var(--' + p.color + '-soft)');
    });
  }

  /* ------------------------------------------------------------- registry */

  /**
   * MG.registerGame({ id, name, emoji, color, howTo?, options?, mount(root, ctx) })
   */
  MG.registerGame = function (def) {
    if (!def || !def.id || typeof def.mount !== 'function') throw new Error('registerGame: need {id, mount}');
    if (!/^[a-z][a-z0-9-]*$/.test(def.id)) throw new Error('registerGame: bad id ' + def.id);
    for (var i = 0; i < MG.games.length; i++) if (MG.games[i].id === def.id) throw new Error('registerGame: duplicate id ' + def.id);
    MG.games.push(def);
    if (shell.built) shell.renderHome();
  };

  /* ---------------------------------------------------------------- shell */

  var shell = { built: false };
  var dom = {};
  var session = null;
  var rounds = {};
  var wakeLock = null;

  function optKey(gameId, key) { return 'opt:' + gameId + ':' + key; }

  function getOpt(def, key) {
    var spec = null;
    (def.options || []).forEach(function (o) { if (o.key === key) spec = o; });
    var v = store.get(optKey(def.id, key), undefined);
    if (spec) {
      var ok = spec.choices.some(function (c) { return c.value === v; });
      return ok ? v : spec.default;
    }
    return v;
  }

  function requestWakeLock() {
    try {
      if (!('wakeLock' in navigator) || wakeLock || document.visibilityState !== 'visible') return;
      navigator.wakeLock.request('screen').then(function (l) {
        wakeLock = l;
        l.addEventListener('release', function () { if (wakeLock === l) wakeLock = null; });
      }).catch(function () {});
    } catch (e) {}
  }
  function releaseWakeLock() {
    try { if (wakeLock) { var l = wakeLock; wakeLock = null; l.release().catch(function () {}); } } catch (e) {}
  }

  /**
   * A button that only fires after a press-and-hold (a ring fills up), so palm
   * brushes and excited taps cannot leave a game. A quick tap just wiggles.
   * Keyboard Enter/Space fires straight away.
   */
  function holdButton(opts) {
    var ms = opts.ms || 650;
    var b = el('button', { type: 'button', class: 'mg-btn mg-btn--icon mg-hold ' + (opts.class || ''), 'aria-label': opts.ariaLabel, style: { '--hold-ms': ms + 'ms' } }, icon(opts.icon));
    var ring = el('span', { class: 'mg-hold__ring', 'aria-hidden': 'true' });
    ring.innerHTML = '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" pathLength="100"/></svg>';
    b.appendChild(ring);
    var timer = 0, activePointer = null;
    function cancel(wiggle) {
      if (!timer) return;
      window.clearTimeout(timer);
      timer = 0; activePointer = null;
      b.classList.remove('is-holding');
      if (wiggle) { fx.wiggle(b); sfx.play('boop'); }
    }
    b.addEventListener('pointerdown', function (ev) {
      if (ev.pointerType === 'mouse' && ev.button !== 0) return;
      if (timer) return;
      sfx.unlock();
      activePointer = ev.pointerId;
      b.classList.add('is-holding');
      timer = window.setTimeout(function () {
        timer = 0; activePointer = null;
        b.classList.remove('is-holding');
        if (!b.offsetParent) return; // its screen went away mid-hold
        sfx.play('good');
        opts.onHold();
      }, ms);
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (t) {
      b.addEventListener(t, function (ev) { if (ev.pointerId === activePointer) cancel(t !== 'pointercancel'); });
    });
    b.addEventListener('keydown', function (ev) {
      if ((ev.key === 'Enter' || ev.key === ' ') && !ev.repeat) { ev.preventDefault(); opts.onHold(); }
    });
    return b;
  }

  /* ---- one mounted game ---- */

  function createSession(def, round) {
    var players = getPlayers();
    var root = dom.game;
    var alive = true, paused = false, over = false;
    var clock = 0, lastTs = 0, rafId = 0, seq = 0, lockedUntil = 0;
    var timers = new Set(), loops = new Set(), offs = [], resizers = new Set();
    var scores = [0, 0], turn = null;
    var cleanup = null, ro = null, hint = null, pendingApi = null;
    var handledStamp = -1;

    var littleIdx = players[0].little === players[1].little ? 0 : (players[0].little ? 0 : 1);
    var firstPlayer = (littleIdx + round) % 2;

    function step(dt) {
      clock += dt;
      if (timers.size) {
        var due = [];
        timers.forEach(function (t) { if (t.at <= clock) due.push(t); });
        due.sort(function (a, b) { return a.at - b.at || a.seq - b.seq; });
        for (var i = 0; i < due.length; i++) {
          var t = due[i];
          if (!alive) return;
          if (!timers.has(t)) continue; // cancelled by an earlier callback this step
          if (t.every) {
            // keep the cadence (no drift), but never fire a burst to catch up
            t.at += t.every;
            if (t.at <= clock) t.at = clock + t.every;
          } else timers.delete(t);
          t.fn();
        }
      }
      if (loops.size) {
        var fns = Array.from(loops);
        for (var j = 0; j < fns.length; j++) {
          if (!alive) return;
          if (loops.has(fns[j])) fns[j](dt, clock);
        }
      }
    }

    function tick(ts) {
      if (!alive) return;
      rafId = window.requestAnimationFrame(tick);
      if (!lastTs) { lastTs = ts; return; }
      var dt = (ts - lastTs) / 1000;
      lastTs = ts;
      if (paused || dt <= 0) return;
      dt = Math.min(dt, 0.05);
      // Fast-forward (tests) runs whole extra steps, so a sped-up round plays
      // out exactly like a real one instead of taking giant strides.
      var scale = MG.timeScale || 1;
      var n = Math.max(1, Math.round(scale));
      if (scale < 1) dt *= scale;
      for (var k = 0; k < n; k++) {
        if (!alive || paused) return;
        step(dt);
      }
    }

    function addTimer(ms, fn, every) {
      if (!alive) return function () {};
      var t = { at: clock + Math.max(0, ms) / 1000, fn: fn, seq: seq++, every: every ? Math.max(0.016, ms / 1000) : 0 };
      timers.add(t);
      return function () { timers.delete(t); };
    }

    function on(target, type, handler, opts) {
      if (!alive) return function () {};
      target.addEventListener(type, handler, opts);
      var off = function () { target.removeEventListener(type, handler, opts); };
      offs.push(off);
      return off;
    }

    function isOff(node) { return node.disabled || node.getAttribute('aria-disabled') === 'true'; }

    /** Nearest enabled `selector` element within `slop` px of (x, y), or null. */
    function nearest(container, selector, x, y, slop) {
      var best = null, bestD = slop;
      var items = container.querySelectorAll(selector);
      for (var i = 0; i < items.length; i++) {
        var n = items[i];
        if (isOff(n)) continue;
        var r = n.getBoundingClientRect();
        if (!r.width && !r.height) continue;
        var dx = Math.max(r.left - x, 0, x - r.right);
        var dy = Math.max(r.top - y, 0, y - r.bottom);
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d <= bestD) { best = n; bestD = d; }
      }
      return best;
    }

    function clearHint() {
      if (!hint) return;
      if (hint.cancelDelay) hint.cancelDelay();
      if (hint.cancelPlace) hint.cancelPlace();
      if (hint.node.parentNode) hint.node.parentNode.removeChild(hint.node);
      hint = null;
    }

    function tap(target, handler, o) {
      o = o || {};
      target.classList.add('mg-tap');
      function resolve(ev, isPointer) {
        if (!alive || paused) return null;
        if (over && !o.evenWhenOver) return null;
        if (clock < lockedUntil && !o.ignoreLock) return null;
        var hit = target;
        if (o.delegate) {
          hit = ev.target && ev.target.closest ? ev.target.closest(o.delegate) : null;
          if (hit && !target.contains(hit)) hit = null;
          if (!hit && isPointer && o.slop) hit = nearest(target, o.delegate, ev.clientX, ev.clientY, o.slop);
          if (!hit) return null;
        }
        if (isOff(hit)) return null;
        return hit;
      }
      var offDown = on(target, 'pointerdown', function (ev) {
        if (ev.pointerType === 'mouse' && ev.button !== 0) return;
        var hit = resolve(ev, true);
        if (!hit) return;
        sfx.unlock();
        handledStamp = ev.timeStamp;
        clearHint();
        handler(ev, hit);
      });
      var offKey = on(target, 'keydown', function (ev) {
        if (ev.key !== 'Enter' && ev.key !== ' ') return;
        if (ev.repeat) { ev.preventDefault(); return; }
        var hit = resolve(ev, false);
        if (!hit) return;
        ev.preventDefault();
        clearHint();
        handler(ev, hit);
      });
      return function () { offDown(); offKey(); };
    }

    /* ---- device sensors and camera (see docs/GAME_API.md) ---- */

    var SHAKE_FORCE = 14;    // m/s^2 of change within the window: a wiggle is enough, passing the phone is not
    var SHAKE_WINDOW = 150;  // ms
    var tiltRaw = { x: 0, y: 0 }, tiltZero = { x: 0, y: 0 };
    var tiltOn = false, tiltSeen = false, motionWired = false;
    var shakers = new Set(), lastShake = -1, accHist = [];
    var CAMERA = { audio: false, video: { facingMode: 'user', width: { ideal: 320 }, height: { ideal: 240 } } };
    var camStream = null, camVideo = null, camAsk = null, camGen = 0;

    function screenAngle() {
      var a = 0;
      try {
        a = window.screen.orientation && typeof window.screen.orientation.angle === 'number' ? window.screen.orientation.angle : (window.orientation || 0);
      } catch (e) {}
      return ((a % 360) + 360) % 360;
    }
    /** Device tilt -> screen directions: x > 0 when the screen's right edge dips, y > 0 when its bottom edge dips. */
    function onOrient(ev) {
      if (ev.beta == null || ev.gamma == null) return;
      var b = ev.beta, g = ev.gamma, a = screenAngle();
      tiltRaw = a === 90 ? { x: b, y: -g } : a === 270 ? { x: -b, y: g } : a === 180 ? { x: -g, y: -b } : { x: g, y: b };
      tiltSeen = true;
    }
    /**
     * A shake is a big change in what the accelerometer feels within a moment.
     * Readings come about 60 times a second, so two neighbours barely differ:
     * compare with the reading from ~150ms ago instead.
     */
    function onMotion(ev) {
      var acc = ev.accelerationIncludingGravity;
      if (!acc || acc.x == null) return;
      var now = typeof ev.timeStamp === 'number' && ev.timeStamp > 0 ? ev.timeStamp : window.performance.now();
      accHist.push({ t: now, x: acc.x, y: acc.y, z: acc.z });
      while (accHist.length > 1 && accHist[1].t <= now - SHAKE_WINDOW) accHist.shift();
      var o = accHist[0];
      var d = Math.abs(acc.x - o.x) + Math.abs(acc.y - o.y) + Math.abs(acc.z - o.z);
      if (!paused && d > SHAKE_FORCE && clock - lastShake > 0.4) {
        lastShake = clock;
        accHist = [];
        shakers.forEach(function (fn) { if (alive) fn(); });
      }
    }
    /**
     * Some browsers ask the person before sharing their sensors, and only
     * inside a tap. Only a clear "no" stops us: anything else ("granted", an
     * unanswered "prompt", a browser that never asks) is worth trying, and
     * whether real readings then arrive is what decides.
     */
    function askSensor(Type) {
      try {
        if (Type && typeof Type.requestPermission === 'function') {
          return Type.requestPermission().then(function (r) { return r !== 'denied'; }, function () { return true; });
        }
      } catch (e) {}
      return Promise.resolve(true);
    }
    function stopStream(s) { try { s.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {} }

    var motion = {
      /** Could this device have a tilt sensor at all? (false in the sandboxed build) */
      get supported() { return !MG.noSensors && typeof window.DeviceOrientationEvent !== 'undefined'; },
      /** True once start() has seen real readings. */
      get active() { return tiltOn; },
      /**
       * Turn the tilt and shake sensors on. Call it from a click/tap (iOS only
       * asks then). Resolves true when real readings arrive, false if there is
       * no sensor, no permission, or the page is sandboxed.
       */
      start: function () {
        if (!alive || !motion.supported) return Promise.resolve(false);
        if (tiltOn) return Promise.resolve(true);
        return Promise.all([askSensor(window.DeviceOrientationEvent), askSensor(window.DeviceMotionEvent)]).then(function (ok) {
          if (!alive || !ok[0]) return false;
          if (!motionWired) {
            motionWired = true;
            on(window, 'deviceorientation', onOrient);
            on(window, 'devicemotion', onMotion);
          }
          // a laptop has the API but nothing behind it: wait briefly for a real reading
          return new Promise(function (res) {
            var tries = 0;
            var iv = window.setInterval(function () {
              if (!tiltSeen && ++tries <= 15 && alive) return;
              window.clearInterval(iv);
              tiltOn = alive && tiltSeen;
              if (tiltOn) motion.recenter();
              res(tiltOn);
            }, 100);
          });
        });
      },
      /** Treat the way the device is held right now as "flat". */
      recenter: function () { tiltZero = { x: tiltRaw.x, y: tiltRaw.y }; },
      /** {x, y} in degrees from "flat", each clamped to +-35. */
      get tilt() {
        return { x: util.clamp(tiltRaw.x - tiltZero.x, -35, 35), y: util.clamp(tiltRaw.y - tiltZero.y, -35, 35) };
      },
      /** fn() on each shake (at most one every 0.4s of game time). Needs start(). Returns off(). */
      onShake: function (fn) { shakers.add(fn); return function () { shakers.delete(fn); }; },
    };

    function openCamera() {
      try { return navigator.mediaDevices.getUserMedia(CAMERA); } catch (e) { return Promise.reject(e); }
    }
    function showCamera(stream) {
      camStream = stream;
      camVideo.srcObject = stream;
      try { var p = camVideo.play(); if (p && p.catch) p.catch(function () {}); } catch (e) {}
    }

    var camera = {
      /** Could this page use a camera at all? (false in the sandboxed build) */
      get supported() { return !MG.noSensors && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia); },
      /**
       * Start the front camera. Resolves a playing, muted <video> (not in the
       * DOM: place it yourself), or null if refused or unavailable. The picture
       * stays on the device. The shell releases the camera while the game is
       * paused and when it closes; stop() releases it for good.
       */
      start: function () {
        if (!alive || !camera.supported) return Promise.resolve(null);
        if (camAsk) return camAsk;
        var gen = ++camGen;
        camAsk = openCamera().then(function (stream) {
          // stopped, closed or paused while the question was open: this answer is not wanted any more
          if (!alive || gen !== camGen) { stopStream(stream); return null; }
          var v = document.createElement('video');
          v.muted = true;
          v.autoplay = true;
          v.playsInline = true;
          v.setAttribute('playsinline', '');
          camVideo = v;
          showCamera(stream);
          return new Promise(function (res) {
            if (v.readyState >= 2) { res(v); return; }
            v.addEventListener('loadeddata', function () { res(v); }, { once: true });
            window.setTimeout(function () { res(v); }, 3000);
          });
        }, function () { return null; }).then(function (v) {
          if (!v && gen === camGen) camAsk = null; // a later start() may try again
          return v;
        });
        return camAsk;
      },
      stop: function () {
        camGen++;
        camAsk = null;
        if (camStream) stopStream(camStream);
        if (camVideo) { try { camVideo.srcObject = null; } catch (e) {} }
        camStream = null;
        camVideo = null;
      },
      get video() { return camVideo; },
    };

    /** Paused: nobody is playing, so the camera is let go. Resumed: it comes back into the same <video>. */
    function restCamera(resting) {
      if (resting) {
        if (!camStream && !camAsk) return;
        camGen++;
        if (!camVideo) camAsk = null; // the first question was still open: it is dropped
        if (camStream) { stopStream(camStream); camStream = null; }
        if (camVideo) { try { camVideo.srcObject = null; } catch (e) {} }
        return;
      }
      if (!camVideo || camStream || !alive) return;
      var gen = ++camGen;
      openCamera().then(function (stream) {
        if (!alive || paused || gen !== camGen || !camVideo) { stopStream(stream); return; }
        showCamera(stream);
      }, function () {});
    }

    function measure() {
      var r = root.getBoundingClientRect();
      var w = Math.max(1, r.width), h = Math.max(1, r.height);
      root.style.setProperty('--gw', w + 'px');
      root.style.setProperty('--gh', h + 'px');
      root.style.setProperty('--gmin', Math.min(w, h) + 'px');
      root.style.setProperty('--gmax', Math.max(w, h) + 'px');
      root.dataset.orient = w >= h ? 'landscape' : 'portrait';
      return { w: w, h: h, orient: root.dataset.orient };
    }

    function renderHud() {
      for (var i = 0; i < 2; i++) {
        var chip = dom.chips[i];
        chip.classList.toggle('is-turn', turn === i);
        chip.classList.toggle('is-waiting', turn != null && turn !== i);
      }
      if (turn == null) { dom.stage.removeAttribute('data-turn'); }
      else { dom.stage.setAttribute('data-turn', String(turn)); }
    }

    function setScoreText(i) {
      var chip = dom.chips[i];
      chip.classList.add('has-score');
      chip.querySelector('.mg-chip__score').textContent = String(scores[i]);
    }

    var ctx = {
      /** Game definition id. */
      id: def.id,
      /** [{index, emoji, colorName, color, dark, soft, little}, x2] */
      players: players,
      /** Index (0|1) of who should go first this round. Alternates every round; the little player starts round one. */
      firstPlayer: firstPlayer,
      /** 0-based count of rounds of this game played since the page loaded. */
      round: round,
      /** Grown-up's "help the little player" setting: 0 off, 1 some, 2 lots. */
      help: help,
      /** Help level for player i: ctx.help if that player is little, else 0. */
      helpFor: function (i) { return players[i] && players[i].little ? help : 0; },

      get alive() { return alive; },
      get paused() { return paused; },
      /** True once ctx.win() has been called. */
      get over() { return over; },
      /** Seconds of un-paused game time since mount. */
      get time() { return clock; },

      /* -- timing: all pause with the game and are cleared on exit -- */
      after: function (ms, fn) { return addTimer(ms, fn, false); },
      every: function (ms, fn) { return addTimer(ms, fn, true); },
      /** Promise that resolves after ms of game time. Never resolves once the game is closed. */
      wait: function (ms) { return new Promise(function (res) { addTimer(ms, res, false); }); },
      /** fn(dtSeconds, timeSeconds) every animation frame while not paused. */
      frame: function (fn) {
        if (!alive) return function () {};
        loops.add(fn);
        return function () { loops.delete(fn); };
      },

      /* -- input -- */
      /** addEventListener that is removed automatically on exit. Returns off(). */
      on: on,
      /**
       * Kid-proof tap: fires on touch-DOWN (also Enter/Space), once per finger.
       * Ignored while paused, after the game ended, and during ctx.lock().
       *   tap(el, (ev, el) => {})
       *   tap(container, (ev, item) => {}, {delegate: '.card', slop: 24})
       * `slop` snaps a near miss to the nearest enabled item within that many px.
       * Items with `disabled` or aria-disabled="true" never fire.
       */
      tap: tap,
      /** Ignore all ctx.tap input for the next ms of game time (after a move, during a reveal). */
      lock: function (ms) { lockedUntil = Math.max(lockedUntil, clock + Math.max(0, ms) / 1000); },
      get locked() { return clock < lockedUntil; },
      /**
       * Ghost-hand demo: a tapping finger over `target` until the next counted
       * tap (or hint(null)). opts: {delay: ms of game time before it appears}
       */
      hint: function (target, o) {
        clearHint();
        if (!alive || !target) return;
        o = o || {};
        var node = el('div', { class: 'mg-hint', 'aria-hidden': 'true' }, el('span', { class: 'mg-hint__ring' }), el('span', { class: 'mg-hint__hand', text: '👆' }));
        var h = (hint = { node: node, cancelDelay: null, cancelPlace: null });
        var place = function () {
          if (hint !== h) return;
          if (!target.isConnected) { clearHint(); return; }
          var r = target.getBoundingClientRect(), g = root.getBoundingClientRect();
          node.style.left = (r.left + r.width / 2 - g.left) + 'px';
          node.style.top = (r.top + r.height / 2 - g.top) + 'px';
        };
        var show = function () {
          if (hint !== h) return;
          h.cancelDelay = null;
          root.appendChild(node);
          place();
          h.cancelPlace = addTimer(200, place, true);
        };
        if (o.delay) h.cancelDelay = addTimer(o.delay, show, false); else show();
      },

      /* -- layout -- */
      /** {w, h, orient} of the play area in px. Also in CSS as --gw/--gh/--gmin/--gmax and [data-orient]. */
      size: measure,
      /** fn({w, h, orient}) whenever the play area changes size (rotation!). */
      onResize: function (fn) { resizers.add(fn); return function () { resizers.delete(fn); }; },

      /* -- HUD -- */
      /**
       * Highlight whose turn it is (0|1), or null for "everyone".
       * A change of player also locks input briefly so a leftover excited tap
       * cannot take the other player's move. opts: {sound: false, lock: ms (default 450)}
       */
      setTurn: function (i, o) {
        if (!alive) return;
        var next = i === 0 || i === 1 ? i : null;
        var changed = turn !== next;
        turn = next;
        renderHud();
        if (turn != null && changed) {
          fx.pop(dom.chips[turn]);
          if (!(o && o.sound === false)) sfx.play('turn' + turn);
          ctx.lock(o && o.lock != null ? o.lock : 450);
        }
      },
      get turn() { return turn; },
      setScore: function (i, n) { if (!alive) return; scores[i] = n; setScoreText(i); },
      addScore: function (i, d) {
        if (!alive) return scores[i];
        scores[i] += d == null ? 1 : d;
        setScoreText(i);
        fx.pop(dom.chips[i]);
        return scores[i];
      },
      get scores() { return scores.slice(); },
      /** Put a small node/string in the middle of the HUD (shared progress, round dots...). null clears. */
      setStatus: function (content) {
        dom.status.textContent = '';
        if (content != null) append(dom.status, [content]);
      },
      /** The HUD chip element for a player (to aim particles at, etc.). */
      chip: function (i) { return dom.chips[i]; },

      /* -- options + saved data -- */
      /** Value of an option declared in the game def (edited by the grown-up in the pause menu). */
      opt: function (key) { return getOpt(def, key); },
      /** Small per-game saved values (best height, adaptive handicap...). */
      load: function (key, fallback) { return store.get('game:' + def.id + ':' + key, fallback); },
      save: function (key, value) { store.set('game:' + def.id + ':' + key, value); },

      /* -- endings -- */
      /**
       * End the round with a party for BOTH players.
       * result: 0 | 1 (that player gets the crown), 'tie' (two crowns), or 'team' (co-op / no winner).
       * opts: {delay: ms before the party (default 700), emoji: badge shown on top, e.g. '🚀'}
       */
      win: function (result, o) {
        if (!alive || over) return;
        over = true;
        clearHint();
        // the round is over: it is nobody's turn any more, everybody celebrates
        turn = null;
        renderHud();
        o = o || {};
        addTimer(o.delay == null ? 700 : o.delay, function () { showWin(result, o); }, false);
      },
      /** Start a fresh round of this game. */
      restart: function () { openGame(def.id); },
      /** Back to the home screen. */
      exit: function () { goHome(); },

      /* -- device sensors and camera: always optional, always with a touch fallback -- */
      motion: motion,
      camera: camera,

      /* -- conveniences -- */
      sfx: sfx, say: MG.say, fx: fx, ui: MG.ui, util: util, el: el, sticker: sticker,
      /** Expose state/actions to tests: available as MG.current.api */
      expose: function (api) {
        pendingApi = api;
        if (MG.current && MG.current.ctx === ctx) MG.current.api = api;
      },
    };

    var self = {
      def: def, ctx: ctx,
      start: function () {
        MG.current = { id: def.id, ctx: ctx, api: pendingApi };
        measure();
        var resized = function () {
          if (!alive) return;
          var s = measure();
          resizers.forEach(function (fn) { fn(s); });
        };
        if (window.ResizeObserver) {
          ro = new window.ResizeObserver(resized);
          ro.observe(root);
        } else {
          on(window, 'resize', resized);
        }
        // Everything answers: any touch on the playmat sparkles; touches that
        // no game handler counted get a soft boop so nothing ever feels dead.
        on(dom.playmat, 'pointerdown', function (ev) {
          if (paused) return;
          if (ev.pointerType === 'mouse' && ev.button !== 0) return;
          sfx.unlock();
          fx.burst(ev.clientX, ev.clientY, { count: 4, size: 7, distance: 26 });
          if (ev.timeStamp !== handledStamp) sfx.play('boop');
        });
        rafId = window.requestAnimationFrame(tick);
        cleanup = def.mount(root, ctx) || null;
      },
      setPaused: function (p) {
        paused = !!p;
        dom.stage.classList.toggle('is-paused', paused);
        restCamera(paused);
        if (!paused && tiltOn) motion.recenter(); // it is rarely held the same way after a break
      },
      get paused() { return paused; },
      get over() { return over; },
      stop: function () {
        if (!alive) return;
        alive = false;
        window.cancelAnimationFrame(rafId);
        clearHint();
        camera.stop();
        shakers.clear();
        timers.clear(); loops.clear(); resizers.clear();
        if (ro) { try { ro.disconnect(); } catch (e) {} }
        for (var i = 0; i < offs.length; i++) { try { offs[i](); } catch (e) {} }
        offs = [];
        if (typeof cleanup === 'function') { try { cleanup(); } catch (e) { console.error(e); } }
        root.textContent = '';
        root.removeAttribute('style');
        try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (e) {}
      },
    };
    return self;
  }

  /* ---- overlays ---- */

  function closeOverlay() {
    dom.overlay.textContent = '';
    dom.overlay.hidden = true;
    dom.overlay.className = 'mg-overlay';
  }

  // A finger that was already down when a menu appeared (the end of a
  // press-and-hold) must not "click" whatever landed underneath it.
  var overlayArmAt = 0;

  function openOverlay(kind, card) {
    if (dom.overlay.hidden) overlayArmAt = window.performance.now() + 400;
    dom.overlay.textContent = '';
    dom.overlay.className = 'mg-overlay mg-overlay--' + kind;
    dom.overlay.appendChild(card);
    dom.overlay.hidden = false;
    dom.overlay.scrollTop = 0;
  }

  function segmented(labelText, choices, current, onPick) {
    var row = el('div', { class: 'mg-seg', role: 'group', 'aria-label': labelText });
    choices.forEach(function (c) {
      var b = el('button', {
        type: 'button', class: 'mg-seg__btn' + (c.value === current ? ' is-on' : ''),
        'aria-pressed': c.value === current ? 'true' : 'false',
      }, c.emoji ? el('span', { class: 'mg-seg__emoji', 'aria-hidden': 'true', text: c.emoji }) : null, el('span', { text: c.label }));
      b.addEventListener('click', function () {
        if (c.value === current) return;
        sfx.unlock(); sfx.play('tap');
        onPick(c.value);
      });
      row.appendChild(b);
    });
    return el('div', { class: 'mg-setting' }, el('div', { class: 'mg-setting__label', text: labelText }), row);
  }

  function sharedSettings(rerender) {
    return [
      segmented('Help for the little player', [{ value: 0, label: 'Off' }, { value: 1, label: 'Some' }, { value: 2, label: 'Lots' }], help, function (v) {
        help = v; store.set('help', v); rerender(true);
      }),
      segmented('Sound', [{ value: false, label: 'On', emoji: '🔊' }, { value: true, label: 'Off', emoji: '🔇' }], sfx.muted, function (v) {
        sfx.setMuted(v); if (!v) sfx.play('good'); rerender(false);
      }),
      segmented('Counting voice', [{ value: true, label: 'On', emoji: '🗣️' }, { value: false, label: 'Off', emoji: '🤫' }], MG.voiceOn, function (v) {
        MG.voiceOn = v; store.set('voice', v); if (v) MG.say('1, 2, 3'); rerender(false);
      }),
    ];
  }

  function showPause() {
    if (!session || !dom.overlay.hidden) return; // (a finale before the party can be paused too)
    session.setPaused(true);
    var def = session.def;
    var needsRestart = false;
    function resume() {
      closeOverlay();
      if (needsRestart) openGame(def.id); // changed help applies to a fresh round
      else if (session) session.setPaused(false);
    }
    function render() {
      var opts = (def.options || []).map(function (o) {
        return segmented(o.label, o.choices, getOpt(def, o.key), function (v) {
          store.set(optKey(def.id, o.key), v);
          closeOverlay();
          openGame(def.id); // options apply to a fresh round
        });
      });
      var card = el('div', { class: 'mg-card mg-pausecard', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Paused' },
        el('div', { class: 'mg-pausecard__main' },
          button({ icon: 'play', label: 'Keep playing', color: 'leaf', class: 'mg-btn--big mg-btn--primary', onTap: resume }),
          el('div', { class: 'mg-pausecard__row' },
            button({ icon: 'again', label: 'Start over', color: 'sun', class: 'mg-btn--mid', onTap: function () { closeOverlay(); openGame(def.id); } }),
            button({ icon: 'home', label: 'All games', color: 'sea', class: 'mg-btn--mid', onTap: function () { closeOverlay(); goHome(); } }))),
        el('div', { class: 'mg-pausecard__settings' },
          el('div', { class: 'mg-eyebrow', text: 'For the grown-up' }),
          def.howTo ? el('p', { class: 'mg-howto', text: def.howTo }) : null,
          opts,
          sharedSettings(function (restart) { if (restart) needsRestart = true; render(); })));
      openOverlay('pause', card);
    }
    render();
  }

  function showWin(result, o) {
    if (!session) return;
    var def = session.def;
    var players = session.ctx.players;
    var solo = result === 0 || result === 1;
    var badge = o.emoji || (result === 'team' ? '🎉' : '🏆');
    var prize = awardSticker();

    sfx.play(solo ? 'win' : 'tie');
    fx.confetti({ emojis: ['⭐', '🎈', prize] });

    // Both players are always at the party; the crown is the only difference.
    var order = solo ? [players[result], players[1 - result]] : players;
    var faces = el('div', { class: 'mg-win__faces' },
      order.map(function (p, i) {
        var crowned = solo ? i === 0 : result === 'tie';
        return el('div', { class: 'mg-win__face' + (crowned ? ' is-crowned' : '') + (solo && i === 1 ? ' is-friend' : ''), 'data-p': String(p.index), style: { '--c': p.color, '--c-dark': p.dark, '--c-soft': p.soft } },
          crowned ? el('span', { class: 'mg-win__crown', 'aria-hidden': 'true', text: '👑' }) : null,
          sticker(p.emoji));
      }));
    var armed = false;
    var again = button({ icon: 'again', label: 'Again!', color: 'leaf', class: 'mg-btn--big mg-btn--primary', onTap: function () { if (armed) { closeOverlay(); openGame(def.id); } } });
    var home = button({ icon: 'home', label: 'All games', color: 'sea', class: 'mg-btn--mid', onTap: function () { if (armed) { closeOverlay(); goHome(); } } });
    var actions = el('div', { class: 'mg-win__actions is-arming' }, again, home);
    var card = el('div', { class: 'mg-card mg-win', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Well done! You earned a sticker.', 'data-result': String(result) },
      el('div', { class: 'mg-win__badge', 'aria-hidden': 'true', text: badge }),
      faces,
      el('div', { class: 'mg-win__prize', 'aria-hidden': 'true' }, sticker(prize)),
      actions);
    openOverlay('win', card);

    // Mashing fingers must not skip the party: buttons arm after a beat.
    window.setTimeout(function () {
      armed = true;
      actions.classList.remove('is-arming');
    }, 1200);
  }

  /* ---- player picker (home) ---- */

  function showPlayerPicker(i) {
    function render() {
      var p = playerCfg[i], other = playerCfg[1 - i];
      var faces = el('div', { class: 'mg-pick__grid' }, AVATARS.map(function (a) {
        var taken = a === other.emoji;
        var b = el('button', { type: 'button', class: 'mg-pick__face' + (a === p.emoji ? ' is-on' : ''), disabled: taken, 'aria-label': 'Animal ' + a, 'aria-pressed': a === p.emoji ? 'true' : 'false' }, sticker(a));
        b.addEventListener('click', function () { sfx.unlock(); sfx.play('pop'); p.emoji = a; savePlayers(); render(); });
        return b;
      }));
      var colors = el('div', { class: 'mg-pick__colors' }, COLOR_NAMES.map(function (c) {
        var taken = c === other.color;
        var b = el('button', { type: 'button', class: 'mg-pick__color' + (c === p.color ? ' is-on' : ''), disabled: taken, 'aria-label': 'Colour ' + c, 'aria-pressed': c === p.color ? 'true' : 'false', style: { '--c': 'var(--' + c + ')', '--c-dark': 'var(--' + c + '-dark)' } }, c === p.color ? icon('check') : null);
        b.addEventListener('click', function () { sfx.unlock(); sfx.play('tap'); p.color = c; savePlayers(); render(); });
        return b;
      }));
      var little = segmented('Is this the little player? (Sits on the ' + (i === 0 ? 'left' : 'right') + '.)', [{ value: true, label: 'Yes', emoji: '🐣' }, { value: false, label: 'No', emoji: '🧑' }], p.little, function (v) { p.little = v; savePlayers(); render(); });
      var card = el('div', { class: 'mg-card mg-pick', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Player ' + (i + 1), style: { '--c': 'var(--' + p.color + ')', '--c-dark': 'var(--' + p.color + '-dark)', '--c-soft': 'var(--' + p.color + '-soft)' } },
        el('div', { class: 'mg-pick__head' }, el('div', { class: 'mg-pick__me' }, sticker(p.emoji)), el('div', { class: 'mg-eyebrow', text: 'Player ' + (i + 1) })),
        faces, colors, little,
        button({ icon: 'check', label: 'Done', color: 'leaf', class: 'mg-btn--big mg-btn--primary', onTap: function () { closeOverlay(); shell.renderHome(); } }));
      openOverlay('pick', card);
    }
    render();
  }

  function showSettings() {
    if (session || !dom.overlay.hidden) return;
    function render() {
      var card = el('div', { class: 'mg-card mg-pausecard', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Settings' },
        el('div', { class: 'mg-pausecard__settings' },
          el('div', { class: 'mg-eyebrow', text: 'For the grown-up' }),
          sharedSettings(function () { render(); }),
          el('div', { class: 'mg-setting' },
            el('div', { class: 'mg-setting__label', text: 'Sticker book: ' + stickers.length + (stickers.length === 1 ? ' sticker' : ' stickers') }),
            button({ label: 'Empty the sticker book', color: 'sun', class: 'mg-btn--small', onTap: function () { stickers = []; store.set('stickers', stickers); render(); shell.renderHome(); } })),
          el('p', { class: 'mg-tip', text: 'No sound? Check the volume and the phone\'s silent switch.' }),
          el('p', { class: 'mg-tip', text: 'Tip: Guided Access (iPhone, iPad) or screen pinning (Android) keeps little fingers inside the playroom.' })),
        button({ emoji: '🌙', label: 'Night-night', color: 'grape', class: 'mg-btn--mid mg-btn--night', onTap: showNight }),
        button({ icon: 'check', label: 'Done', color: 'leaf', class: 'mg-btn--big mg-btn--primary', onTap: function () { closeOverlay(); } }));
      openOverlay('pause', card);
    }
    render();
  }

  /** A kind, ritual end to screen time: everyone yawns and goes to sleep. */
  function showNight() {
    var players = getPlayers();
    var armed = false;
    var scene = el('div', { class: 'mg-night', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Night-night. Tap to wake up.' },
      el('div', { class: 'mg-night__moon', 'aria-hidden': 'true', text: '🌙' }),
      el('div', { class: 'mg-night__stars', 'aria-hidden': 'true' }, ['⭐', '✨', '⭐', '✨', '⭐'].map(function (s, i) { return el('span', { style: { '--i': i }, text: s }); })),
      el('div', { class: 'mg-night__bed' }, players.map(function (p, i) {
        return el('div', { class: 'mg-night__sleeper', style: { '--c': p.color, '--i': i } }, sticker(p.emoji), el('span', { class: 'mg-night__zzz', 'aria-hidden': 'true', text: '💤' }));
      })));
    scene.addEventListener('click', function () { if (armed) closeOverlay(); });
    openOverlay('night', scene);
    sfx.play('lullaby');
    window.setTimeout(function () { armed = true; }, 2500);
  }

  /* ---- navigation ---- */

  function currentHashId() {
    return (window.location.hash || '').replace(/^#/, '');
  }

  function closeGame() {
    if (session) { session.stop(); session = null; }
    MG.current = null;
    dom.stage.classList.remove('is-paused');
    dom.stage.removeAttribute('data-turn');
  }

  function openGame(id) {
    var def = null;
    MG.games.forEach(function (g) { if (g.id === id) def = g; });
    if (!def) { goHome(); return; }
    closeGame();
    closeOverlay();
    if (currentHashId() !== id) {
      // Push so the phone's Back button returns to the game shelf.
      try { window.history.pushState(null, '', '#' + id); } catch (e) { window.location.hash = id; }
    }
    var round = rounds[id] || 0;
    rounds[id] = round + 1;
    store.set('last', id);

    var players = getPlayers();
    dom.home.hidden = true;
    dom.stage.hidden = false;
    dom.game.className = 'mg-game g-' + id;
    dom.status.textContent = '';
    for (var i = 0; i < 2; i++) {
      var chip = dom.chips[i];
      chip.className = 'mg-chip';
      chip.style.setProperty('--c', players[i].color);
      chip.style.setProperty('--c-dark', players[i].dark);
      chip.style.setProperty('--c-soft', players[i].soft);
      chip.querySelector('.mg-chip__face').textContent = players[i].emoji;
      chip.querySelector('.mg-chip__score').textContent = '0';
    }
    session = createSession(def, round);
    requestWakeLock();
    session.start();
  }

  function goHome() {
    closeGame();
    closeOverlay();
    releaseWakeLock();
    if (currentHashId()) {
      try { window.history.replaceState(null, '', window.location.pathname + window.location.search + '#'); } catch (e) { window.location.hash = ''; }
    }
    dom.stage.hidden = true;
    dom.home.hidden = false;
    shell.renderHome();
  }

  function route() {
    var id = currentHashId();
    var known = MG.games.some(function (g) { return g.id === id; });
    if (known) { if (!session || session.def.id !== id) openGame(id); }
    else if (session || dom.home.hidden) goHome();
  }

  /* ---- home ---- */

  shell.renderHome = function () {
    if (!shell.built) return;
    var players = getPlayers();
    dom.homePlayers.textContent = '';
    players.forEach(function (p, i) {
      var b = el('button', {
        type: 'button', class: 'mg-who', 'aria-label': 'Change player ' + (i + 1),
        style: { '--c': p.color, '--c-dark': p.dark, '--c-soft': p.soft },
      }, sticker(p.emoji));
      b.addEventListener('click', function () { sfx.unlock(); sfx.play('tap'); showPlayerPicker(i); });
      dom.homePlayers.appendChild(b);
    });

    var last = store.get('last', null);
    dom.shelf.textContent = '';
    MG.games.forEach(function (g, i) {
      var c = g.color || 'sun';
      var tile = el('button', {
        type: 'button', class: 'mg-tile' + (g.id === last ? ' is-last' : ''), 'data-game': g.id, 'aria-label': 'Play ' + g.name,
        style: { '--c': 'var(--' + c + ')', '--c-dark': 'var(--' + c + '-dark)', '--c-soft': 'var(--' + c + '-soft)', '--tilt': (i % 2 ? 1 : -1) * (1 + (i % 3) * 0.5) + 'deg' },
      },
        el('span', { class: 'mg-tile__art' }, sticker(g.emoji || '🎲')),
        el('span', { class: 'mg-tile__name', text: g.name }));
      tile.addEventListener('click', function () { sfx.unlock(); sfx.play('start'); openGame(g.id); });
      dom.shelf.appendChild(tile);
    });

    dom.book.textContent = '';
    if (!stickers.length) {
      dom.book.appendChild(el('p', { class: 'mg-book__empty', text: 'Finish a game together to earn your first sticker.' }));
    } else {
      stickers.forEach(function (s, i) {
        var b = el('button', { type: 'button', class: 'mg-book__sticker', 'aria-label': 'Sticker ' + s, style: { '--tilt': ((i * 37) % 21 - 10) + 'deg' } }, sticker(s));
        b.addEventListener('click', function () { sfx.unlock(); sfx.scale(i % 10); fx.wiggle(b); });
        dom.book.appendChild(b);
      });
    }
  };

  /* ---- boot ---- */

  function kidProof() {
    var block = function (ev) { ev.preventDefault(); };
    document.addEventListener('contextmenu', block);
    document.addEventListener('dragstart', block);
    document.addEventListener('gesturestart', block); // iOS pinch
    document.addEventListener('dblclick', block);
    // No rubber-banding or pull-to-refresh while a game is on screen.
    document.addEventListener('touchmove', function (ev) {
      if (!dom.stage.hidden && dom.overlay.hidden) ev.preventDefault();
    }, { passive: false });
    ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'].forEach(function (t) {
      window.addEventListener(t, sfx.unlock, { capture: true, passive: true });
    });
    document.addEventListener('visibilitychange', function () {
      var visible = document.visibilityState === 'visible';
      sfx.setSuspended(!visible);
      if (visible && session) requestWakeLock();
      // switched away mid-game: pause, so nothing runs (and no camera stays on) behind their back
      if (!visible && session && dom.overlay.hidden) showPause();
    });
    window.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Escape') return;
      if (!dom.overlay.hidden) {
        if (dom.overlay.classList.contains('mg-overlay--win')) return;
        closeOverlay();
        if (session) session.setPaused(false);
        else shell.renderHome();
      } else if (session) showPause();
    });
  }

  MG.start = function () {
    if (shell.built) return;
    var app = document.getElementById('app') || document.body.appendChild(el('div', { id: 'app' }));
    app.textContent = '';
    applyPlayerVars();
    document.documentElement.classList.toggle('mg-muted', sfx.muted);

    dom.homePlayers = el('div', { class: 'mg-home__players' });
    dom.shelf = el('div', { class: 'mg-shelf' });
    dom.book = el('div', { class: 'mg-book__page' });
    dom.home = el('main', { class: 'mg-home', id: 'mg-home' },
      el('header', { class: 'mg-home__head' },
        el('h1', { class: 'mg-wordmark' }, el('span', { class: 'mg-wordmark__a', text: 'Pocket' }), ' ', el('span', { class: 'mg-wordmark__b', text: 'Playroom' })),
        dom.homePlayers,
        holdButton({ icon: 'gear', ariaLabel: 'Settings for the grown-up (press and hold)', class: 'mg-home__gear', onHold: showSettings })),
      dom.shelf,
      el('section', { class: 'mg-book', 'aria-label': 'Our sticker book' },
        el('h2', { class: 'mg-eyebrow', text: 'Our sticker book' }),
        dom.book));

    dom.chips = [0, 1].map(function (i) {
      return el('div', { class: 'mg-chip', 'data-p': String(i) },
        el('span', { class: 'mg-chip__face', 'aria-hidden': 'true' }),
        el('span', { class: 'mg-chip__score', 'aria-label': 'Player ' + (i + 1) + ' score' }));
    });
    dom.status = el('div', { class: 'mg-hud__status' });
    dom.game = el('div', { class: 'mg-game', id: 'mg-game' });
    dom.playmat = el('div', { class: 'mg-playmat' }, dom.game);
    dom.stage = el('div', { class: 'mg-stage', id: 'mg-stage', hidden: true },
      el('div', { class: 'mg-hud' },
        holdButton({ icon: 'pause', ariaLabel: 'Pause (press and hold)', class: 'mg-hud__pause', onHold: showPause }),
        dom.chips[0], dom.status, dom.chips[1]),
      dom.playmat);
    dom.overlay = el('div', { class: 'mg-overlay', id: 'mg-overlay', hidden: true });
    dom.overlay.addEventListener('click', function (ev) {
      if (window.performance.now() < overlayArmAt) { ev.stopPropagation(); ev.preventDefault(); }
    }, true);

    app.appendChild(dom.home);
    app.appendChild(dom.stage);
    app.appendChild(dom.overlay);
    shell.built = true;

    kidProof();
    shell.renderHome();
    window.addEventListener('hashchange', route);
    window.addEventListener('popstate', route);
    route();
  };

  MG.open = openGame;
  MG.home = goHome;
  MG.pause = showPause;
  MG.settings = showSettings;
  Object.defineProperty(MG, 'help', { get: function () { return help; } });
  Object.defineProperty(MG, 'stickers', { get: function () { return stickers.slice(); } });
})();
