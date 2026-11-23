/* Make-Up Mirrors: give each other a makeover, side by side.
 *
 * Two mirrors. In YOUR mirror sits the OTHER player's animal, and you make it
 * up while they make up yours, each from your own tray. A step ("zone") moves
 * on when both mirrors are done; then the two friends admire each other. The
 * last step is a pose; the friends hop out, cross over to their owners' sides
 * and pose together for a photo, which goes on the salon wall. Then a present.
 *
 * The friend is drawn in CSS (never as an emoji face): all 16 animals share
 * one face geometry, 100em x 120em with 1em = 1% of the model width, so every
 * piece lands on the same spot on every animal, at every size, on every phone.
 * Each piece sits in a 0x0 anchor wrapper (.mk-at) at its slot; the visible
 * piece inside is centred on that point at its own size.
 *
 * Nothing is ever wrong: every tray item is right, every tap on a board makes
 * progress or a gag. Timing: every state change bumps `token`; every
 * game-logic timer goes through later(), which does nothing once the token
 * has moved on. ctx.lock is never used: rate limits are per-board timestamps.
 */
(function () {
  'use strict';

  /* ---------------------------------------------------------- the friends */

  // fur, inner (muzzle, inner ear), ear colour (default fur), ears, nose (default 'button'), extra, muzzle
  var ANIMALS = {
    '🐰': { fur: '#F3EEF6', inner: '#FFC4D6', ears: 'long', muzzle: false },
    '🐻': { fur: '#B07A4A', inner: '#E3C29B', ears: 'round' },
    '🐱': { fur: '#F7B551', inner: '#FFE2B0', ears: 'pointy' },
    '🐶': { fur: '#E3B07A', inner: '#F8E3C4', ears: 'floppy', ear: '#8B5A3C' },
    '🦊': { fur: '#F0803C', inner: '#FFFFFF', ears: 'pointy', ear: '#5A3A22' },
    '🐼': { fur: '#FFFFFF', inner: '#FFFFFF', ears: 'round', ear: '#2F2F3A', extra: 'patches' },
    '🐸': { fur: '#7BC96F', inner: '#B8E6A8', ears: 'bumps' },
    '🐵': { fur: '#8B5A3C', inner: '#F1CFA6', ears: 'side', extra: 'face' },
    '🦁': { fur: '#F2B84B', inner: '#FFE2A8', ears: 'round', extra: 'mane' },
    '🐯': { fur: '#F59A3A', inner: '#FFF1DC', ears: 'round', extra: 'stripes' },
    '🐷': { fur: '#F9B8C8', inner: '#F9B8C8', ears: 'pointy', nose: 'snout' },
    '🐨': { fur: '#A7A9BC', inner: '#E6E6F0', ears: 'fluffy', nose: 'big' },
    '🦄': { fur: '#FFFFFF', inner: '#FFD6E8', ears: 'pointy', extra: 'horn' },
    '🐙': { fur: '#E86FA0', inner: '#F7B3CC', ears: 'none', nose: 'none', extra: 'spots' },
    '🐧': { fur: '#3B3B4F', inner: '#FFFFFF', ears: 'none', nose: 'beak', extra: 'face' },
    '🐥': { fur: '#FFD84D', inner: '#FFE98A', ears: 'none', nose: 'beak', extra: 'tuft' },
  };
  var DEFAULT_ANIMAL = '🐻';   // for any future avatar not in the table

  // anchor points in model coordinates (em), the same on every animal
  var SLOTS = {
    eyeL: [37, 58], eyeR: [63, 58], cheekL: [27, 76], cheekR: [73, 76], brow: [50, 44], nose: [50, 72],
    lip: [50, 79], mouth: [50, 81], whiskL: [22, 79], whiskR: [78, 79], top: [50, 36], neck: [50, 101],
    side: [12, 96], up: [78, 12],
  };

  /* ---------------------------------------------------------- the make-up */

  // z: zone, k: kind, c: colour, e: emoji, r: reaction; `party`: comes with that party's gift; `silly`: for the b tray
  var ITEMS = {
    // the first zone in Full
    'sponge':       { z: 'wash',   k: 'foam',    e: '🧽', r: 'giggle' },
    // cheeks
    'blush-pink':   { z: 'cheeks', k: 'blush',   c: '#FF8FB1', r: 'shy' },
    'blush-peach':  { z: 'cheeks', k: 'blush',   c: '#FFA77A', r: 'shy' },
    'star':         { z: 'cheeks', k: 'stamp',   e: '⭐', r: 'giggle' },
    'heart':        { z: 'cheeks', k: 'stamp',   e: '❤️', r: 'love' },
    'dots':         { z: 'cheeks', k: 'dots',    r: 'giggle', silly: true },
    'bolt':         { z: 'cheeks', k: 'stamp',   e: '⚡', r: 'cool',   party: 'hero' },
    'stripes':      { z: 'cheeks', k: 'stripes', c: '#3A2A20', r: 'roar', party: 'jungle' },
    'paws':         { z: 'cheeks', k: 'stamp',   e: '🐾', r: 'roar',   party: 'jungle', silly: true },
    'gem':          { z: 'cheeks', k: 'stamp',   e: '💎', r: 'star',   party: 'royal' },
    'shell':        { z: 'cheeks', k: 'stamp',   e: '🐚', r: 'giggle', party: 'beach' },
    'moon':         { z: 'cheeks', k: 'stamp',   e: '🌙', r: 'wow',    party: 'space' },
    'rainbow':      { z: 'cheeks', k: 'stamp',   e: '🌈', r: 'star',   party: 'rainbow' },
    // eyes
    'shadow-grape': { z: 'eyes', k: 'shadow',  c: '#9B6BFF', r: 'wow' },
    'shadow-sea':   { z: 'eyes', k: 'shadow',  c: '#2FB4F5', r: 'wow' },
    'lashes':       { z: 'eyes', k: 'lashes',  r: 'love' },
    'specs':        { z: 'eyes', k: 'glasses', v: 'specs',   e: '👓', r: 'cool' },
    'googly':       { z: 'eyes', k: 'googly',  r: 'silly', silly: true },
    'mask-red':     { z: 'eyes', k: 'mask',    c: '#E0245E', r: 'cool',  party: 'hero' },
    'mask-blue':    { z: 'eyes', k: 'mask',    c: '#127DBA', r: 'cool',  party: 'hero' },
    'shadow-gold':  { z: 'eyes', k: 'shadow',  c: '#FFC933', r: 'star',  party: 'royal' },
    'shades':       { z: 'eyes', k: 'glasses', v: 'shades',  e: '🕶️', r: 'cool',  party: 'beach' },
    'goggles':      { z: 'eyes', k: 'glasses', v: 'goggles', e: '🥽', r: 'silly', party: 'space', silly: true },
    // nose
    'clown':        { z: 'nose', k: 'ball',  c: '#F0383B', r: 'clown', silly: true },
    'button':       { z: 'nose', k: 'ball',  c: '#FF8FB1', r: 'shy' },
    'heart-nose':   { z: 'nose', k: 'tip',   e: '❤️', r: 'love' },
    'whiskers':     { z: 'nose', k: 'whisk', r: 'purr',  party: 'jungle' },
    'cream':        { z: 'nose', k: 'cream', r: 'silly', party: 'beach', silly: true },
    // mouth
    'lips-red':     { z: 'mouth', k: 'lips',   c: '#E0245E', r: 'kiss' },
    'lips-pink':    { z: 'mouth', k: 'lips',   c: '#FF8FB1', r: 'kiss' },
    'stache':       { z: 'mouth', k: 'stache', c: '#5A3A22', r: 'silly', silly: true },
    'smile':        { z: 'mouth', k: 'smile',  c: '#F0383B', r: 'clown', silly: true },
    'lips-plum':    { z: 'mouth', k: 'lips',   c: '#8E3B8E', r: 'kiss',  party: 'royal' },
    // neck
    'bowtie':       { z: 'neck', k: 'bowtie', c: '#FF5D8F', r: 'cool' },
    'scarf':        { z: 'neck', k: 'wear',   e: '🧣', r: 'shy' },
    'tie':          { z: 'neck', k: 'wear',   e: '👔', r: 'cool', silly: true },
    'cape':         { z: 'neck', k: 'cape',   c: '#E0245E', e: '⭐', r: 'cool', party: 'hero' },
    'pearls':       { z: 'neck', k: 'ring',   ring: 'pearl', r: 'star', party: 'royal' },
    'lei':          { z: 'neck', k: 'ring',   e: '🌺', r: 'love', party: 'beach' },
    // top
    'cone':         { z: 'top', k: 'cone',     r: 'party' },
    'bow':          { z: 'top', k: 'wear',     e: '🎀', r: 'love' },
    'flower':       { z: 'top', k: 'wear',     e: '🌸', r: 'love' },
    'tophat':       { z: 'top', k: 'wear',     e: '🎩', r: 'cool' },
    'wig':          { z: 'top', k: 'wig',      r: 'silly', silly: true },
    'duck':         { z: 'top', k: 'wear',     e: '🦆', r: 'silly', silly: true },
    'leaves':       { z: 'top', k: 'ring',     e: '🌿', r: 'love',  party: 'jungle' },
    'crown':        { z: 'top', k: 'wear',     e: '👑', r: 'star',  party: 'royal' },
    'sunhat':       { z: 'top', k: 'wear',     e: '👒', r: 'cool',  party: 'beach' },
    'antennae':     { z: 'top', k: 'antennae', r: 'alien', party: 'space', silly: true },
    'horn':         { z: 'top', k: 'cone',     horn: true, r: 'star', party: 'rainbow' },
    // sparkle: every party's second-last zone
    'gold':         { z: 'sparkle', k: 'glitter', e: '✨', r: 'star' },
    'hearts':       { z: 'sparkle', k: 'glitter', e: '💕', r: 'love' },
    'stars':        { z: 'sparkle', k: 'glitter', e: '⭐', r: 'star' },
    'flowers':      { z: 'sparkle', k: 'glitter', e: '🌼', r: 'love', party: 'jungle' },
    'dust':         { z: 'sparkle', k: 'glitter', e: '💫', r: 'wow',  party: 'space' },
    'rainbow-dust': { z: 'sparkle', k: 'glitter', e: '🌈', r: 'star', party: 'rainbow' },
    // pose: every party's last zone
    'wave':         { z: 'pose', k: 'pose', e: '👋', r: 'giggle' },
    'kiss':         { z: 'pose', k: 'pose', e: '😘', r: 'kiss' },
    'ears':         { z: 'pose', k: 'pose', e: '✌️', r: 'silly' },
  };
  var ITEM_IDS = Object.keys(ITEMS);
  var ZONES = ['wash', 'cheeks', 'eyes', 'nose', 'mouth', 'neck', 'top', 'sparkle', 'pose'];
  var PIP = { wash: '🧼', cheeks: '🌸', eyes: '👀', nose: '👃', mouth: '👄', neck: '🎀', top: '🎩', sparkle: '✨', pose: '📸' };
  var POSES = ['wave', 'kiss', 'ears'];
  // the zones a photo remembers (the wash leaves nothing; the pose is `o`)
  var LOOK_ZONES = ['cheeks', 'eyes', 'nose', 'mouth', 'neck', 'top', 'sparkle'];

  /* ---------------------------------------------------------- the parties */

  var PARTIES = {
    party:   { e: '🎉', bg: 'sun',  deco: ['🎈', '🎉', '🎈'], zones: ['cheeks', 'eyes', 'mouth', 'neck', 'top'], extra: ['eyes', 'neck'],
               sig: { cheeks: 'star', eyes: 'specs', mouth: 'lips-red', top: 'cone', sparkle: 'gold' } },
    circus:  { e: '🎪', bg: 'stripes', deco: ['🎪', '🎈', '🤹'], zones: ['cheeks', 'eyes', 'nose', 'mouth', 'top'], extra: ['eyes', 'mouth'],
               sig: { cheeks: 'dots', nose: 'clown', mouth: 'smile', top: 'wig', sparkle: 'stars' } },
    hero:    { e: '⚡', bg: 'sea',  deco: ['💥', '🏙️', '⚡'], zones: ['eyes', 'cheeks', 'nose', 'mouth', 'neck'], extra: ['nose', 'mouth'],
               sig: { eyes: 'mask-red', cheeks: 'bolt', neck: 'cape', sparkle: 'stars' } },
    jungle:  { e: '🐯', bg: 'leaf', deco: ['🌴', '🐒', '🌿'], zones: ['cheeks', 'nose', 'eyes', 'mouth', 'top'], extra: ['eyes', 'mouth'],
               sig: { cheeks: 'stripes', nose: 'whiskers', top: 'leaves', sparkle: 'flowers' } },
    royal:   { e: '👑', bg: 'grape', deco: ['🏰', '✨', '💎'], zones: ['cheeks', 'eyes', 'mouth', 'neck', 'top'], extra: ['cheeks', 'eyes'],
               sig: { cheeks: 'gem', eyes: 'lashes', mouth: 'lips-plum', neck: 'pearls', top: 'crown', sparkle: 'gold' } },
    beach:   { e: '🏖️', bg: 'sea-soft', deco: ['☀️', '🌊', '🐚'], zones: ['cheeks', 'eyes', 'nose', 'neck', 'top'], extra: ['cheeks', 'neck'],
               sig: { cheeks: 'shell', eyes: 'shades', nose: 'cream', neck: 'lei', top: 'sunhat', sparkle: 'hearts' } },
    space:   { e: '🚀', bg: 'night', deco: ['🌙', '🛸', '⭐'], zones: ['cheeks', 'eyes', 'nose', 'mouth', 'top'], extra: ['nose', 'mouth'],
               sig: { cheeks: 'moon', eyes: 'goggles', top: 'antennae', sparkle: 'dust' } },
    rainbow: { e: '🌈', bg: 'rainbow', deco: ['🌈', '🎤', '✨'], zones: ['cheeks', 'eyes', 'nose', 'mouth', 'top'], extra: ['nose'],
               sig: { cheeks: 'rainbow', eyes: 'shadow-grape', top: 'horn', sparkle: 'rainbow-dust' } },   // the capstone show
  };
  var MENU = ['party', 'circus', 'hero', 'jungle', 'royal', 'beach', 'space', 'rainbow'];
  var START = ['party', 'circus'];
  // names live only here and in aria-labels (nothing on screen is words)
  var NAMES = { party: 'Party', circus: 'Circus', hero: 'Superhero', jungle: 'Jungle', royal: 'Royal ball', beach: 'Beach', space: 'Space', rainbow: 'Rainbow show' };

  // the six secret looks: two items worn together
  var LOOKS = [
    { id: 'clown', e: '🤡', need: [['nose', ['clown']], ['top', ['wig']]] },                    // circus
    { id: 'tiger', e: '🐯', need: [['cheeks', ['stripes']], ['nose', ['whiskers']]] },          // jungle
    { id: 'hero',  e: '🦸', need: [['eyes', ['mask-red', 'mask-blue']], ['neck', ['cape']]] },  // hero
    { id: 'royal', e: '👑', need: [['top', ['crown']], ['neck', ['pearls']]] },                 // royal
    { id: 'spy',   e: '🕵️', need: [['eyes', ['specs', 'shades']], ['mouth', ['stache']]] },     // found by exploring
    { id: 'alien', e: '👽', need: [['top', ['antennae']], ['eyes', ['goggles']]] },             // space
  ];
  var LOOK_IDS = LOOKS.map(function (l) { return l.id; });

  /* ---------------------------------------------------------- presents */

  var GIFTS = [
    { kind: 'party',  id: 'hero' },                    // 0
    { kind: 'helper', id: 'poodle', e: '🐩' },         // 1
    { kind: 'party',  id: 'jungle' },                  // 2
    { kind: 'tier',   n: 1, e: '💡' },                 // 3  bulbs round both mirrors
    { kind: 'party',  id: 'royal' },                   // 4
    { kind: 'helper', id: 'parrot', e: '🦜' },         // 5
    { kind: 'party',  id: 'beach' },                   // 6
    { kind: 'tier',   n: 2, e: '💐' },                 // 7  wallpaper + flowers on the wall
    { kind: 'party',  id: 'space' },                   // 8
    { kind: 'helper', id: 'radio', e: '📻' },          // 9
    { kind: 'party',  id: 'rainbow' },                 // 10 the capstone show
    { kind: 'tier',   n: 3, e: '⭐' },                 // 11 the marquee with both animals
    { kind: 'helper', id: 'booth', e: '📸' },          // 12
  ];
  var DECOR = ['🧸', '🌵', '🎈', '🌻', '🎐', '🧁'];     // 13-18, on the wall
  var MEDALS = 2;                                       // 19-34: a medal per party in MENU order, twice round
  var HELPERS = { poodle: '🐩', parrot: '🦜', radio: '📻', booth: '📸' };
  var HELPER_IDS = ['poodle', 'parrot', 'radio', 'booth'];

  /* ---------------------------------------------------------- the kinds */

  // n/plus: base dabs and the grown-up's extra; fixed: [hers, his] whatever the options; named: slots with a look of their own
  // (dabs past them add a spare sparkle); clip: drawn inside the skin; react/sound are per item (ITEMS.r) and per kind (S).
  // At Normal with help Some (the default) every step but the pose is 3 taps for her: base 4 less one for the help, and 3 for
  // every fixed kind. That is what makes a Full round last about a minute (see zonesFor).
  var KINDS = {
    foam:     { n: 4, plus: 0, clip: true, named: 3 },
    blush:    { n: 4, plus: 1, clip: true, named: 3 },
    stamp:    { n: 4, plus: 1, named: 3 },
    dots:     { n: 4, plus: 1, clip: true, named: 3 },
    stripes:  { n: 4, plus: 1, clip: true, named: 3 },
    shadow:   { n: 4, plus: 1, clip: true, named: 3 },
    lashes:   { n: 4, plus: 1, named: 3 },
    googly:   { n: 4, plus: 1, named: 3 },
    glasses:  { fixed: [3, 3], named: 2 },
    mask:     { n: 4, plus: 0, named: 3 },
    ball:     { fixed: [3, 3], named: 2 },
    tip:      { fixed: [3, 3], named: 2 },
    whisk:    { fixed: [3, 3], named: 3 },
    cream:    { n: 4, plus: 1, clip: true, named: 3 },
    lips:     { n: 4, plus: 1, named: 3 },
    smile:    { fixed: [3, 3], named: 2 },
    stache:   { n: 4, plus: 1, named: 3 },
    bowtie:   { fixed: [3, 3], named: 2 },
    cape:     { fixed: [3, 3], named: 2 },
    wear:     { fixed: [3, 3], named: 2 },
    ring:     { n: 4, plus: 1, named: 3 },
    cone:     { fixed: [3, 3], named: 2 },
    wig:      { n: 4, plus: 1, named: 3 },
    antennae: { fixed: [3, 3], named: 2 },
    glitter:  { fixed: [3, 3], named: 3 },
    pose:     { fixed: [1, 1], named: 1 },
  };
  var DABS = { few: -1, normal: 0, lots: 2 };
  var GAP = 0.16, SWITCH_GAP = 0.25, TICKLE_GAP = 0.3, CHEER_GAP = 0.15;

  // where the 15 glitter pieces go (shuffled once per board per round)
  var GLITTER = [[30, 44], [70, 44], [22, 62], [78, 62], [50, 50], [40, 36], [60, 36], [26, 88], [74, 88], [50, 92], [18, 50], [82, 50], [38, 66], [62, 66], [50, 38]];
  // the mud a friend brings from playing outside (Full only): brow and left cheek (blobs), right cheek (a leaf)
  var MUD = [[50, 44], [27, 76], [73, 76]];
  // a dab past a kind's named slots: a tiny sparkle at the next of these
  var SPARE = {
    wash: [[30, 50], [70, 50], [50, 90], [36, 88], [64, 88], [50, 40]],
    cheeks: [[20, 68], [80, 68], [32, 88], [68, 88], [22, 84], [78, 84]],
    eyes: [[28, 50], [72, 50], [44, 48], [56, 48], [30, 66], [70, 66]],
    nose: [[40, 64], [60, 64], [38, 74], [62, 74], [50, 62], [50, 90]],
    mouth: [[36, 84], [64, 84], [32, 78], [68, 78], [44, 90], [56, 90]],
    neck: [[32, 106], [68, 106], [42, 114], [58, 114], [26, 112], [74, 112]],
    top: [[30, 30], [70, 30], [40, 22], [60, 22], [24, 40], [76, 40]],
    sparkle: [[34, 40], [66, 40], [50, 30], [28, 70], [72, 70], [50, 96]],
    pose: [[30, 30], [70, 30], [50, 24], [24, 60], [76, 60], [50, 96]],
  };
  var RAINBOW = ['#FF5D8F', '#FF8A3D', '#FFC933', '#4CCB6B', '#2FB4F5', '#9B6BFF'];

  /* ---------------------------------------------------------- pure rules */

  var clamp = function (v, lo, hi) { return Math.max(lo, Math.min(hi, v)); };
  var own = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  var plain = function (o) { return !!o && typeof o === 'object' && !Array.isArray(o); };

  /** The present for finishing makeover number i (0 = the first). */
  function giftFor(i) {
    i = Math.max(0, Math.floor(Number(i)) || 0);
    if (i < GIFTS.length) {
      var g = GIFTS[i];
      return g.kind === 'party' ? { kind: 'party', id: g.id, e: PARTIES[g.id].e } : g;
    }
    var k = i - GIFTS.length;
    if (k < DECOR.length) return { kind: 'decor', e: DECOR[k] };
    k -= DECOR.length;
    if (k < MENU.length * MEDALS) { var id = MENU[k % MENU.length]; return { kind: 'medal', id: id, k: Math.floor(k / MENU.length) + 1, e: PARTIES[id].e }; }
    return { kind: 'thanks', e: '⭐' };
  }

  /** What `done` finished makeovers have unlocked. Worked out from the count, never stored. */
  function unlocks(done) {
    done = Math.max(0, Math.floor(Number(done)) || 0);
    var have = {}, order = START.slice(), u = { parties: [], items: [], helpers: {}, tier: 0, decor: [], medals: {}, next: null, order: order };
    START.forEach(function (id) { have[id] = true; });
    for (var i = 0; i < done && i < GIFTS.length + DECOR.length + MENU.length * MEDALS; i++) {
      var g = giftFor(i);
      if (g.kind === 'party') { if (!have[g.id]) order.push(g.id); have[g.id] = true; }
      else if (g.kind === 'helper') u.helpers[g.id] = true;
      else if (g.kind === 'tier') u.tier = Math.max(u.tier, g.n);
      else if (g.kind === 'decor' && u.decor.indexOf(g.e) < 0) u.decor.push(g.e);
      else if (g.kind === 'medal') u.medals[g.id] = (u.medals[g.id] || 0) + 1;
    }
    u.parties = MENU.filter(function (id) { return have[id]; });
    u.items = ITEM_IDS.filter(function (id) { return !ITEMS[id].party || have[ITEMS[id].party]; });
    for (var j = done; j < GIFTS.length; j++) if (GIFTS[j].kind === 'party') { u.next = GIFTS[j].id; break; }
    return u;
  }

  /** A saved salon, checked and repaired: anything odd becomes something sensible. */
  function cleanMakeup(raw) {
    if (!plain(raw)) raw = {};
    var num = function (v, lo, hi) {
      if (v === null || v === '' || typeof v === 'boolean' || typeof v === 'object') return 0;
      v = Number(v);
      return isFinite(v) ? clamp(Math.floor(v), lo, hi) : 0;
    };
    var done = num(raw.done, 0, 9999), u = unlocks(done), played = {}, looks = [], seen = [], photos = [];
    if (plain(raw.played)) u.parties.forEach(function (id) { if (own(raw.played, id)) { var n = num(raw.played[id], 0, 999); if (n > 0) played[id] = n; } });
    if (Array.isArray(raw.looks)) raw.looks.forEach(function (v) { if (typeof v === 'string' && LOOK_IDS.indexOf(v) >= 0 && looks.indexOf(v) < 0) looks.push(v); });
    if (Array.isArray(raw.seen)) raw.seen.forEach(function (v) { if (typeof v === 'string' && own(KINDS, v) && seen.indexOf(v) < 0) seen.push(v); });
    var face = function (f) {
      if (!plain(f) || typeof f.e !== 'string' || !own(ANIMALS, f.e)) return null;
      var z = {};
      if (plain(f.z)) LOOK_ZONES.forEach(function (zn) {
        var id = f.z[zn];
        if (typeof id === 'string' && own(ITEMS, id) && ITEMS[id].z === zn && u.items.indexOf(id) >= 0) z[zn] = id;
      });
      var x = [];
      if (Array.isArray(f.x)) f.x.forEach(function (id) { if (looks.indexOf(id) >= 0 && x.indexOf(id) < 0) x.push(id); });
      return { e: f.e, z: z, x: x, o: POSES.indexOf(f.o) >= 0 ? f.o : null };
    };
    if (Array.isArray(raw.photos)) raw.photos.forEach(function (p) {
      if (photos.length >= 8 || !plain(p) || u.parties.indexOf(p.p) < 0) return;
      var l = face(p.l), r = face(p.r);
      if (l && r) photos.push({ p: p.p, l: l, r: r });
    });
    return { v: 1, done: done, played: played, looks: looks, seen: seen, photos: photos };
  }

  /** Dabs a kind takes on a board: fixed kinds never change; others follow the Dabs option and the little player's help. */
  function nFor(kind, isB, dabs, help) {
    var K = KINDS[kind];
    if (!K) return 1;
    if (K.fixed) return K.fixed[isB ? 1 : 0];
    return clamp(K.n + (isB ? K.plus : 0) + (DABS[dabs] || 0) - (help || 0), 1, 6);
  }

  /** The zones of a round: Full washes first and keeps the party's two extra zones (8 steps); Short drops them (5; the
   *  capstone 6); both end with sparkle and pose. Measured in game seconds, card tap to the party, help Some: with real taps
   *  (her one every 2s, his every 1s) Full about 57-58s, Short about 35-36s, the capstone about 58s (Short 43s);
   *  following only the ghost hand on a new salon, Full about 90s (96s at help Off), Short about 57s, the capstone about 98s. */
  function zonesFor(party, length) {
    if (typeof party === 'string') party = PARTIES[party];
    var mid = party.zones.filter(function (z) { return length === 'full' || party.extra.indexOf(z) < 0; });
    return (length === 'full' ? ['wash'] : []).concat(mid, ['sparkle', 'pose']);
  }

  /** A board's three tray items: the party's signature (when unlocked), something silly for the grown-up, the rest at random. */
  function trayFor(zone, party, isB, pool, rnd) {
    if (typeof party === 'string') party = PARTIES[party];
    if (zone === 'wash') return ['sponge'];
    if (zone === 'pose') return rnd.shuffle(POSES);
    var sig = party.sig[zone] && pool.indexOf(party.sig[zone]) >= 0 ? party.sig[zone] : null;
    var rest = rnd.shuffle(pool.filter(function (id) { return id !== sig; }));
    var out = sig ? [sig] : [];
    if (isB) {              // the grown-up always has something silly for her animal
      var silly = rest.filter(function (id) { return ITEMS[id].silly; })[0];
      if (silly && !(sig && ITEMS[sig].silly)) { out.push(silly); rest.splice(rest.indexOf(silly), 1); }
    }
    while (out.length < 3 && rest.length) out.push(rest.shift());
    return rnd.shuffle(out);   // the signature item is not always in the same place
  }

  /** Mud pieces covered by foam after dab k of n (k < n); the last dab rinses. */
  function foamed(k, n) { return n <= 1 ? 3 : Math.min(3, Math.ceil(3 * k / (n - 1))); }

  /* ---------------------------------------------------------- drawing the friend */

  /** A plain element: h('div', 'mk-x', [kids]). */
  function h(tag, cls, kids) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (kids) kids.forEach(function (k) { if (k) n.appendChild(k); });
    return n;
  }
  function stk(e, cls) { return MG.ui.sticker(e, cls); }

  // the order of the zone layers above the face (glasses and masks sit above the nose; hats above everything worn)
  var MODEL_ORDER = ['wash', 'cheeks', 'mouth', 'nose', 'eyes', 'neck', 'top', 'sparkle', 'pose'];

  /** The friend: built once per mirror per round (and once per photo). Returns the parts a renderer needs. */
  function buildModel(e, bib, size) {
    var a = ANIMALS[e] || ANIMALS[DEFAULT_ANIMAL];
    var m = h('div', 'mk-model');
    m.dataset.ears = a.ears;
    m.dataset.nose = a.nose || 'button';
    m.dataset.extra = a.extra || '';
    m.style.setProperty('--fur', a.fur);
    m.style.setProperty('--inner', a.inner);
    m.style.setProperty('--ear', a.ear || a.fur);
    m.style.setProperty('--bib', bib || 'var(--p0)');
    if (size != null) m.style.setProperty('--m', typeof size === 'number' ? size + 'px' : size);
    var under = h('div', 'mk-under'), sk = h('div', 'mk-sk'), mud = h('div', 'mk-mudl');
    m.appendChild(under);
    if (a.extra === 'mane') m.appendChild(h('div', 'mk-mane'));
    m.appendChild(h('div', 'mk-ear mk-ear--l', [h('i')]));
    m.appendChild(h('div', 'mk-ear mk-ear--r', [h('i')]));
    var bibEl = h('div', 'mk-bib');
    m.appendChild(bibEl);
    m.appendChild(h('div', 'mk-collar'));
    m.appendChild(h('div', 'mk-head', [h('div', 'mk-skin', [sk])]));
    // the skin (clipped by the head, in model coordinates): the animal's markings, the mud, the clipped make-up
    if (a.extra === 'face') sk.appendChild(h('i', 'mk-face'));
    else if (a.muzzle !== false) sk.appendChild(h('i', 'mk-muz'));
    if (a.extra === 'patches') { sk.appendChild(h('i', 'mk-patch mk-patch--l')); sk.appendChild(h('i', 'mk-patch mk-patch--r')); }
    if (a.extra === 'stripes') [43.5, 48.5, 53.5].forEach(function (x) { var s = h('i', 'mk-stripe'); s.style.left = x + 'em'; sk.appendChild(s); });
    if (a.extra === 'spots') [[28, 38, 8], [60, 34, 6], [44, 32, 5]].forEach(function (p) { var s = h('i', 'mk-spot'); s.style.cssText = 'left:' + p[0] + 'em;top:' + p[1] + 'em;width:' + p[2] + 'em;height:' + p[2] + 'em'; sk.appendChild(s); });
    sk.appendChild(mud);
    if (a.extra === 'horn') m.appendChild(h('div', 'mk-horn'));
    if (a.extra === 'tuft') m.appendChild(h('div', 'mk-tuft'));
    var eyes = [h('div', 'mk-eye mk-eye--l', [h('i')]), h('div', 'mk-eye mk-eye--r', [h('i')])];
    var lids = [h('div', 'mk-lid mk-lid--l'), h('div', 'mk-lid mk-lid--r')];
    eyes.concat(lids).forEach(function (n) { m.appendChild(n); });
    m.appendChild(h('div', 'mk-nose', [h('i'), h('i')]));
    m.appendChild(h('div', 'mk-mouth'));
    var layers = {};
    ZONES.forEach(function (z) {
      layers[z] = { under: h('div', 'mk-layer'), skin: h('div', 'mk-layer'), model: h('div', 'mk-layer') };
      ['under', 'skin', 'model'].forEach(function (k) { layers[z][k].dataset.zone = z; });
      under.appendChild(layers[z].under);
      sk.appendChild(layers[z].skin);
    });
    MODEL_ORDER.forEach(function (z) { m.appendChild(layers[z].model); });
    var over = h('div', 'mk-over');
    m.appendChild(over);
    return { el: m, layers: layers, mud: mud, over: over, bib: bibEl, wear: {} };
  }

  /* A piece: a CSS shape or an emoji sticker centred on a point (sizes in model em).
     at: [x, y]; w/h; bg; br (radius); ln: outline (default on; thin: 1px); op; t: extra transform; tx/ty: the centring
     translate; to: transform-origin; cls; html; vars; d: the dab that made it; l: 'skin' | 'under' | 'model'. */
  function shp(at, w, h2, o) { o = o || {}; o.at = at; o.w = w; o.h = h2; return o; }
  function emo(at, e, fs, o) { o = o || {}; o.at = at; o.e = e; o.fs = fs; return o; }

  function pieceEl(p, fresh) {
    var inner = p.e ? stk(p.e, 'mk-pc' + (p.cls ? ' ' + p.cls : '')) : h('b', 'mk-pc' + (p.cls ? ' ' + p.cls : ''));
    var st = inner.style;
    if (p.e) st.fontSize = p.fs + 'em';
    else {
      st.width = p.w + 'em';
      st.height = p.h + 'em';
      if (p.ln !== false) inner.classList.add(p.thin ? 'is-thin' : 'is-ln');
    }
    if (p.bg) st.background = p.bg;
    if (p.br) st.borderRadius = p.br;
    if (p.op != null) st.setProperty('--op', String(p.op));
    if (p.tx) st.setProperty('--tx', p.tx);
    if (p.ty) st.setProperty('--ty', p.ty);
    if (p.t) st.setProperty('--t', p.t);
    if (p.to) st.transformOrigin = p.to;
    if (p.vars) Object.keys(p.vars).forEach(function (k) { st.setProperty(k, p.vars[k]); });
    if (p.html) inner.innerHTML = p.html;
    var at = h('i', 'mk-at' + (fresh ? (p.drop ? ' is-drop' : p.rise ? ' is-rise' : ' is-new') : ''), [inner]);
    at.style.left = p.at[0] + 'em';
    at.style.top = p.at[1] + 'em';
    return at;
  }

  var FOAM = [[-4, -2, 7], [3, -3, 6], [0, 2, 8], [-5, 3, 5], [5, 3, 4.5]];
  var BUBBLES = [[40, 60], [60, 60], [50, 90], [38, 88], [62, 88], [50, 56]];
  var GLITTER_IDX = GLITTER.map(function (p, i) { return i; });

  /** Point t of the quadratic arc through p0, the middle point pm (at t = 0.5) and p2. */
  function arcAt(p0, pm, p2, t) {
    var c = [2 * pm[0] - (p0[0] + p2[0]) / 2, 2 * pm[1] - (p0[1] + p2[1]) / 2], v = 1 - t;
    return [v * v * p0[0] + 2 * v * t * c[0] + t * t * p2[0], v * v * p0[1] + 2 * v * t * c[1] + t * t * p2[1]];
  }

  // one renderer per kind: the pieces after kk named dabs (k: the dabs made; o: {n, outer, c1, seed, glitter, foamAll})
  var DRAW = {
    foam: function (it, kk, o, k) {
      var n = o.n || 3, out = [];
      if (k >= n && !o.foamAll) {   // rinsed: clean and shiny
        [[34, 52], [66, 52], [50, 88]].forEach(function (p) { out.push(emo(p, '✨', 7, { d: k - 1 })); });
        return out;
      }
      var f = o.foamAll ? 3 : foamed(k, n);
      for (var i = 0; i < f; i++) {
        var first = 1;
        while (first < n && foamed(first, n) <= i) first++;
        FOAM.forEach(function (q) { out.push(shp([MUD[i][0] + q[0], MUD[i][1] + q[1]], q[2], q[2], { bg: 'var(--mk-foam)', br: '50%', thin: true, d: o.foamAll ? 0 : first - 1 })); });
      }
      for (var j = 0; j < k; j++) out.push(shp(BUBBLES[j % BUBBLES.length], 4, 4, { bg: 'var(--mk-foam)', br: '50%', thin: true, d: j }));
      return out;
    },
    blush: function (it, kk, o, k) {
      var op = kk >= 3 ? Math.min(0.85, 0.75 + 0.12 * Math.max(0, k - 3)) : 0.55, out = [];
      var cheek = function (at, d) { return shp(at, 16, 10, { bg: it.c, br: '50%', ln: false, op: op, d: d, cls: 'mk-blush' }); };
      if (kk >= 1) out.push(cheek(SLOTS.cheekL, 0));
      if (kk >= 2) out.push(cheek(SLOTS.cheekR, 1));
      if (kk >= 3) [SLOTS.cheekL, SLOTS.cheekR].forEach(function (c) { out.push(shp(c, 9, 5.5, { bg: it.c, br: '50%', ln: false, op: 0.5, d: 2, cls: 'mk-blush' })); });
      return out;
    },
    stamp: function (it, kk) {
      var out = [];
      if (kk >= 1) out.push(emo(SLOTS.cheekL, it.e, 12, { t: 'rotate(12deg)', d: 0 }));
      if (kk >= 2) out.push(emo(SLOTS.cheekR, it.e, 12, { t: 'rotate(-12deg)', d: 1 }));
      if (kk >= 3) out.push(emo(SLOTS.brow, it.e, 11, { d: 2 }));
      return out;
    },
    dots: function (it, kk) {
      var out = [], off = [[-5, -3], [0, -5], [5, -3], [-3, 3], [3, 3]];
      var round = function (c, d) { off.forEach(function (q, i) { out.push(shp([c[0] + q[0], c[1] + q[1]], 3.5, 3.5, { bg: RAINBOW[i], br: '50%', thin: true, d: d })); }); };
      if (kk >= 1) round(SLOTS.cheekL, 0);
      if (kk >= 2) round(SLOTS.cheekR, 1);
      if (kk >= 3) [[44, 64], [50, 62], [56, 64]].forEach(function (p, i) { out.push(shp(p, 3.5, 3.5, { bg: RAINBOW[i + 2], br: '50%', thin: true, d: 2 })); });
      return out;
    },
    stripes: function (it, kk) {
      var out = [];
      [68, 74, 80].forEach(function (y) {
        if (kk >= 1) out.push(shp([19, y], 14, 3, { bg: it.c, br: '0 2em 2em 0', ln: false, d: 0 }));
        if (kk >= 2) out.push(shp([81, y], 14, 3, { bg: it.c, br: '2em 0 0 2em', ln: false, d: 1 }));
      });
      if (kk >= 3) [46, 50, 54].forEach(function (x) { out.push(shp([x, 41], 3, 10, { bg: it.c, br: '0 0 2em 2em', ln: false, d: 2 })); });
      return out;
    },
    shadow: function (it, kk) {
      var out = [], lid = function (x, d) { return shp([x, 51.25], 13, 6.5, { bg: it.c, br: '50% 50% 0 0 / 100% 100% 0 0', ln: false, op: 0.85, d: d, cls: 'mk-shade' }); };
      if (kk >= 1) out.push(lid(37, 0));
      if (kk >= 2) out.push(lid(63, 1));
      if (kk >= 3) { out.push(emo([37, 49.5], '✨', 5, { d: 2, l: 'model' })); out.push(emo([63, 49.5], '✨', 5, { d: 2, l: 'model' })); }
      return out;
    },
    lashes: function (it, kk) {
      var out = [], big = kk >= 3;
      var eye = function (cx, sg, d) {
        [15, 35, 55].forEach(function (a) {
          var r = a * Math.PI / 180;
          out.push(shp([cx - sg * 4.6 * Math.sin(r), 58 - 5.6 * Math.cos(r)], 1.4, 5, { bg: 'var(--line)', br: '1em', ln: false, tx: '-50%', ty: '-100%', to: '50% 100%',
            t: 'rotate(' + (-sg * a) + 'deg)' + (big ? ' scale(1.3)' : ''), d: big ? 2 : d, cls: 'mk-lash' + (big ? ' is-flutter' : '') }));
        });
      };
      if (kk >= 1) eye(37, 1, 0);
      if (kk >= 2) eye(63, -1, 1);
      if (kk >= 3) out.push(emo([50, 50], '✨', 5, { d: 2 }));
      return out;
    },
    googly: function (it, kk, o) {
      var out = [], ang = o.seed || [0.7, 3.6];
      var eye = function (at, a, d) {
        out.push(shp(at, 13, 13, { bg: '#FFFFFF', br: '50%', d: d, cls: 'mk-googly' + (kk >= 3 ? ' is-spin' : ''),
          html: '<s><i style="left:calc(50% + ' + (3 * Math.cos(a)).toFixed(2) + 'em);top:calc(50% + ' + (3 * Math.sin(a)).toFixed(2) + 'em)"></i></s>' }));
      };
      if (kk >= 1) eye(SLOTS.eyeL, ang[0], 0);
      if (kk >= 2) eye(SLOTS.eyeR, ang[1], 1);
      if (kk >= 3) out.push(emo([50, 49], '✨', 5, { d: 2 }));
      return out;
    },
    glasses: function (it, kk) {
      var out = [];
      if (it.v === 'goggles') {
        out.push(shp([50, 58], 72, 2.6, { bg: '#5B6B7F', ln: false, d: 0, drop: true }));
        out.push(shp([50, 58], 56, 20, { bg: 'rgba(127, 219, 255, 0.55)', br: '10em', ln: false, cls: 'mk-goggle', d: 0, drop: true }));
      } else out.push(shp([50, 58], 50, 18, { ln: false, cls: 'mk-specs' + (it.v === 'shades' ? ' is-shades' : ''), html: '<i></i><b></b><i></i>', d: 0, drop: true }));
      if (kk >= 2) out.push(emo([42, 52], '✨', 7, { d: 1 }));
      return out;
    },
    mask: function (it, kk) {
      var out = [];
      var ring = function (at, d) { return shp(at, 14, 14, { br: '50%', ln: false, cls: 'mk-ring', vars: { '--c': it.c }, d: d }); };
      var half = function (x, d) { return shp([x, 58], 6, 3.5, { bg: it.c, ln: false, d: d }); };
      if (kk >= 1) { out.push(half(47, 0)); out.push(ring(SLOTS.eyeL, 0)); }
      if (kk >= 2) {
        out.push(half(53, 1));
        out.push(ring(SLOTS.eyeR, 1));
        out.push(shp([15, 63], 4, 14, { bg: it.c, br: '2em', t: 'rotate(16deg)', d: 1, cls: 'mk-tail' }));
        out.push(shp([85, 63], 4, 14, { bg: it.c, br: '2em', t: 'rotate(-16deg)', d: 1, cls: 'mk-tail' }));
      }
      if (kk >= 3) out.push(emo([50, 49], '✨', 6, { d: 2 }));
      return out;
    },
    ball: function (it, kk) {
      var s = kk >= 2 ? 12 : 7, out = [shp(SLOTS.nose, s, s, { bg: it.c, br: '50%', cls: 'mk-ball', html: '<i></i>', d: kk >= 2 ? 1 : 0 })];
      if (kk >= 2) out.push(emo([60, 65], '✨', 5, { d: 1 }));
      return out;
    },
    tip: function (it, kk) {
      var out = [emo(SLOTS.nose, it.e, kk >= 2 ? 11 : 7, { d: kk >= 2 ? 1 : 0 })];
      if (kk >= 2) out.push(emo([61, 65], '✨', 5, { d: 1 }));
      return out;
    },
    whisk: function (it, kk) {
      var out = [];
      var fan = function (at, side, d) {   // side -1: the left cheek (the inner end on the right)
        [-12, 0, 12].forEach(function (a, i) {
          out.push(shp([at[0], at[1] + (i - 1) * 2.6], 18, 0.9, { bg: 'var(--line)', br: '1em', ln: false, cls: 'mk-whisk', to: side < 0 ? '100% 50%' : '0% 50%', t: 'rotate(' + (side < 0 ? a : -a) + 'deg)', d: d }));
        });
      };
      if (kk >= 1) fan(SLOTS.whiskL, -1, 0);
      if (kk >= 2) fan(SLOTS.whiskR, 1, 1);
      if (kk >= 3) out.push(emo([50, 64], '✨', 5, { d: 2 }));
      return out;
    },
    cream: function (it, kk) {
      var out = [], W = '#FFFFFF';
      if (kk >= 1) out.push(shp(SLOTS.nose, 14, 10, { bg: W, br: '60% 40% 55% 45% / 55% 60% 40% 45%', d: 0, l: 'model' }));
      if (kk >= 2) [SLOTS.cheekL, SLOTS.cheekR].forEach(function (c) { [-2.5, 2.5].forEach(function (dy) { out.push(shp([c[0], c[1] + dy], 10, 3, { bg: W, br: '2em', thin: true, d: 1 })); }); });
      if (kk >= 3) out.push(shp(SLOTS.brow, 8, 6, { bg: W, br: '50% 45% 55% 50%', thin: true, d: 2 }));
      return out;
    },
    lips: function (it, kk) {
      var out = [];
      if (kk >= 2) out.push(shp([50, 83.5], 18, 5, { bg: it.c, br: '20% 20% 50% 50% / 20% 20% 80% 80%', d: 1 }));
      if (kk >= 1) out.push(shp([50, 79.25], 18, 4.5, { ln: false, cls: 'mk-upper', vars: { '--c': it.c }, html: '<i></i><i></i>', d: 0 }));
      if (kk >= 3) out.push(shp([55, 80], 2.5, 2.5, { bg: '#FFFFFF', br: '50%', ln: false, d: 2 }));
      return out;
    },
    smile: function (it, kk) {
      var out = [shp([50, 77], 30, 10, { ln: false, cls: 'mk-smile', vars: { '--c': it.c, '--sw': kk >= 2 ? '3.5em' : '2em' }, d: kk >= 2 ? 1 : 0 })];
      if (kk >= 2) [[35, 80], [65, 80]].forEach(function (p) { out.push(shp(p, 4, 4, { bg: '#F0383B', br: '50%', ln: false, d: 1 })); });
      return out;
    },
    stache: function (it, kk) {
      var out = [], curl = kk >= 3;
      if (kk >= 1) out.push(shp([43.5, 81], 13, 7, { bg: it.c, br: '80% 20% 40% 60%', to: '100% 50%', t: curl ? 'rotate(20deg)' : null, d: curl ? 2 : 0, cls: 'mk-stache' }));
      if (kk >= 2) out.push(shp([56.5, 81], 13, 7, { bg: it.c, br: '20% 80% 60% 40%', to: '0% 50%', t: curl ? 'rotate(-20deg)' : null, d: curl ? 2 : 1, cls: 'mk-stache' }));
      if (kk >= 3) out.push(emo([31, 75], '✨', 5, { d: 2 }));
      return out;
    },
    bowtie: function (it, kk) {
      var wing = function (x, r, d) {
        return shp([x, 104.5], 12, 11, { ln: false, cls: 'mk-wing', vars: { '--c': it.c }, d: d,
          html: '<svg viewBox="0 0 12 11" preserveAspectRatio="none" aria-hidden="true"><polygon points="' + (r ? '11.4,0.6 0.6,5.5 11.4,10.4' : '0.6,0.6 11.4,5.5 0.6,10.4') + '"/></svg>' });
      };
      var out = [];
      if (kk >= 1) out.push(wing(44, false, 0));
      if (kk >= 2) { out.push(wing(56, true, 1)); out.push(shp([50, 104.5], 5, 5, { bg: it.c, br: '30%', d: 1 })); }
      return out;
    },
    cape: function (it, kk) {
      var out = [];
      if (kk >= 1) out.push(shp([50, 105], 84, 30, { bg: it.c, br: '30em 30em 4em 4em', l: 'under', d: 0, cls: 'mk-cape' }));
      if (kk >= 2) out.push(emo([50, 108], it.e, 10, { d: 1 }));
      return out;
    },
    wear: function (it, kk) {
      var top = it.z === 'top', out = [];
      out.push(emo(top ? SLOTS.top : SLOTS.neck, it.e, top ? 30 : 22, { ty: top ? '-88%' : null, t: kk >= 2 ? 'rotate(-12deg)' : null, d: kk >= 2 ? 1 : 0, drop: top && kk < 2, rise: !top && kk < 2, cls: 'mk-worn' }));
      if (kk >= 2) out.push(emo(top ? [72, 14] : [70, 96], '✨', 8, { d: 1 }));
      return out;
    },
    ring: function (it, kk) {
      var out = [], top = it.z === 'top', pearl = it.ring === 'pearl';
      var P = top ? [[24, 36], [50, 26], [76, 36]] : [[32, 98], [50, 104], [68, 98]];
      var bead = function (t, d, big) {
        var p = arcAt(P[0], P[1], P[2], t);
        return pearl ? shp(p, big ? 7.8 : 6, big ? 7.8 : 6, { bg: '#FFFFFF', br: '50%', thin: true, d: d, cls: 'mk-pearl' }) : emo(p, it.e, (top ? 10 : 9) * (big ? 1.3 : 1), { d: d });
      };
      var ts = pearl ? [[0, 1 / 6, 2 / 6], [3 / 6, 4 / 6, 5 / 6, 1]] : [[0, 0.17, 0.34], [0.66, 0.83, 1]];
      if (kk >= 1) ts[0].forEach(function (t) { out.push(bead(t, 0)); });
      if (kk >= 2) ts[1].forEach(function (t) { out.push(bead(t, 1)); });
      if (kk >= 3) out.push(bead(0.5, 2, true));
      return out;
    },
    cone: function (it, kk, o) {
      var out = [];
      if (it.horn) {
        out.push(shp(SLOTS.top, 10, 28, { cls: 'mk-horn2', tx: '-50%', ty: '-100%', to: '50% 100%', t: 'rotate(-8deg)', br: '50% 50% 10% 10% / 90% 90% 10% 10%', d: 0, drop: true }));
        if (kk >= 2) out.push(emo([46, 10], '✨', 8, { d: 1 }));
      } else {
        out.push(shp(SLOTS.top, 26, 34, { ln: false, cls: 'mk-cone', vars: { '--c1': o.c1 || 'var(--berry)' }, tx: '-50%', ty: '-100%', to: '50% 100%', t: 'rotate(-8deg)', d: 0, drop: true }));
        if (kk >= 2) out.push(shp([45.5, 5.5], 7, 7, { bg: '#FFFFFF', br: '50%', d: 1 }));
      }
      return out;
    },
    wig: function (it, kk) {
      var out = [], P = [[[20, 40], [28, 26]], [[72, 26], [80, 40]], [[40, 19], [60, 19]]];
      for (var d = 0; d < kk && d < 3; d++) P[d].forEach(function (p, i) { out.push(shp(p, 20, 20, { bg: RAINBOW[(d * 2 + i) % 6], br: '50%', d: d, cls: 'mk-curl' })); });
      return out;
    },
    antennae: function (it, kk) {
      var out = [];
      var stalk = function (x, a, d) {
        var r = a * Math.PI / 180;
        out.push(shp([x, 34], 2, 24, { bg: 'var(--line)', br: '1em', ln: false, tx: '-50%', ty: '-100%', to: '50% 100%', t: 'rotate(' + a + 'deg)', d: d }));
        out.push(shp([x + 24 * Math.sin(r), 34 - 24 * Math.cos(r)], 9, 9, { bg: '#7BC96F', br: '50%', d: d, cls: 'mk-bob' }));
      };
      if (kk >= 1) stalk(42, -18, 0);
      if (kk >= 2) stalk(58, 18, 1);
      return out;
    },
    glitter: function (it, kk, o) {
      var out = [], ord = o.glitter || GLITTER_IDX;
      for (var i = 0; i < kk * 5 && i < 15; i++) out.push(emo(GLITTER[ord[i]], it.e, 6, { d: Math.floor(i / 5) }));   // (6em, not 8: fifteen of them must not hide the look)
      return out;
    },
    pose: function (it, kk, o) {
      var id = o.id;
      if (id === 'wave') return [emo(o.outer === 'r' ? [100 - SLOTS.side[0], SLOTS.side[1]] : SLOTS.side, '👋', 14, { d: 0, cls: 'mk-rock' })];
      if (id === 'kiss') return [shp(SLOTS.mouth, 6, 6, { bg: '#FF8FB1', br: '50%', d: 0 }), emo([80, 70], '💋', 10, { d: 0 })];
      return [emo(SLOTS.up, '✌️', 14, { d: 0 })];
    },
  };

  /** Every piece item `id` shows after k dabs of n. One dab of a one-dab variable kind draws all its named slots; dabs past
   *  the named slots add a tiny sparkle each. */
  function piecesFor(id, k, o) {
    var it = ITEMS[id], K = it && KINDS[it.k];
    if (!K || k <= 0) return [];
    o = o || {};
    var n = o.n || k, foam = it.k === 'foam';
    var kk = n === 1 && !K.fixed ? K.named : Math.min(k, K.named);
    var oo = {}; Object.keys(o).forEach(function (x) { oo[x] = o[x]; });
    oo.id = id;
    var out = DRAW[it.k](it, kk, oo, k);
    if (!foam) {
      var sp = SPARE[it.z] || SPARE.top;
      for (var j = K.named; j < k; j++) out.push(emo(sp[(j - K.named) % sp.length], '✨', 5, { d: j, l: 'model' }));
    }
    out.forEach(function (p) { p.d = n === 1 ? 0 : Math.min(p.d || 0, k - 1); });
    return out;
  }

  /** Draw zone `zone` of a friend: item `id` after k dabs. Only that zone's layers are touched. Returns the piece count. */
  function renderLayer(F, zone, id, k, o) {
    var L = F.layers[zone];
    o = o || {};
    L.under.textContent = '';
    L.skin.textContent = '';
    L.model.textContent = '';
    if (!id || k <= 0) { delete F.wear[zone]; tidyFace(F); return 0; }
    var K = KINDS[ITEMS[id].k], ps = piecesFor(id, k, o);
    ps.forEach(function (p) { L[p.l || (K.clip ? 'skin' : 'model')].appendChild(pieceEl(p, o.fresh && p.d === k - 1)); });
    F.wear[zone] = { id: id, k: k };
    tidyFace(F);
    return ps.length;
  }

  /** What the face shows depends on what it wears: lips hide the smile line, eyeshadow colours the lids. */
  function tidyFace(F) {
    var mo = F.wear.mouth, po = F.wear.pose, ey = F.wear.eyes;
    var mk = mo && ITEMS[mo.id].k;
    F.el.classList.toggle('has-lips', !!(mk === 'lips' || mk === 'smile' || (po && po.id === 'kiss')));
    if (ey && ITEMS[ey.id].k === 'shadow') F.el.style.setProperty('--lid', ITEMS[ey.id].c);
    else F.el.style.removeProperty('--lid');
  }

  /** The mud from playing outside: blobs on the brow and the left cheek, a leaf on the right cheek. */
  function renderMud(F, count) {
    F.mud.textContent = '';
    for (var i = 0; i < count && i < 3; i++) {
      F.mud.appendChild(i < 2 ? pieceEl(shp(MUD[i], 11, 8, { bg: '#8A5A30', br: '50% 40% 60% 45%', thin: true })) : pieceEl(emo(MUD[2], '🍃', 10, { t: 'rotate(-20deg)' })));
    }
  }

  /** A fresh, still friend from a photo: every zone at its full n (nOf(id)), the pose, what the other friend's pose left
   *  on it (kissed: a kiss on the near cheek; eared: bunny ears behind its head) and its found-look badges.
   *  side: where it stands in the photo ('l' | 'r'). */
  function renderFace(e, look, size, bib, o) {
    o = o || {};
    look = look || {};
    var F = buildModel(e, bib, size), side = o.side || 'l', near = side === 'l' ? 1 : -1;
    var nOf = o.nOf || function (id) { return KINDS[ITEMS[id].k].fixed ? KINDS[ITEMS[id].k].fixed[1] : KINDS[ITEMS[id].k].named; };
    F.el.classList.add('is-still');
    LOOK_ZONES.forEach(function (z) {
      var id = look.z && look.z[z];
      if (id && ITEMS[id]) { var n = nOf(id); renderLayer(F, z, id, n, { n: n, outer: side, c1: o.c1 }); }
    });
    var P = F.layers.pose, posed = function (n) { n.classList.add('mk-posed'); return n; };
    if (look.o === 'wave') P.model.appendChild(posed(pieceEl(emo(side === 'r' ? [100 - SLOTS.side[0], SLOTS.side[1]] : SLOTS.side, '👋', 14, { cls: 'mk-rock' }))));
    if (look.o === 'kiss') { P.model.appendChild(posed(pieceEl(shp(SLOTS.mouth, 6, 6, { bg: '#FF8FB1', br: '50%' })))); F.wear.pose = { id: 'kiss', k: 1 }; tidyFace(F); }
    if (o.kissed) P.model.appendChild(posed(pieceEl(emo(near > 0 ? [74, 72] : [26, 72], '💋', 12, { t: 'rotate(' + (near > 0 ? 14 : -14) + 'deg)' }))));
    if (o.eared) P.under.appendChild(posed(pieceEl(emo(near > 0 ? [70, 15] : [30, 15], '✌️', 18, { t: 'rotate(' + (near > 0 ? 14 : -14) + 'deg)' }))));
    (look.x || []).forEach(function (id, i) {
      var L = LOOKS[LOOK_IDS.indexOf(id)];
      if (L) F.over.appendChild(pieceEl(emo([side === 'l' ? 90 - i * 2 : 10 + i * 2, 110 - i * 9], L.e, 13, { cls: 'mk-fbadge' })));
    });
    return F;
  }

  /* ---------------------------------------------------------- tray icons */

  /** What a tray button shows: the emoji for emoji items, else a little CSS picture of the thing (1em box). */
  function iconFor(id, c1) {
    var it = ITEMS[id], k = it.k;
    if (it.e && (k === 'foam' || k === 'stamp' || k === 'tip' || k === 'wear' || k === 'glasses' || k === 'pose' || k === 'ring')) return stk(it.e, 'mk-ico-e');
    var box = h('span', 'mk-ico mk-ico--' + k + (it.horn ? ' is-horn' : '') + (it.ring === 'pearl' ? ' is-pearl' : ''));
    if (it.c) box.style.setProperty('--c', it.c);
    if (c1) box.style.setProperty('--c1', c1);
    var add = function (n) { for (var i = 0; i < n; i++) box.appendChild(h('i')); };
    if (k === 'glitter') { box.appendChild(stk(it.e)); return box; }
    if (k === 'cape') { add(1); box.appendChild(stk(it.e)); return box; }
    add({ blush: 3, shadow: 2, dots: 5, stripes: 3, lashes: 4, googly: 2, mask: 3, ball: 1, whisk: 6, cream: 1, lips: 2, smile: 1, stache: 2, bowtie: 3, ring: 7, cone: 2, wig: 3, antennae: 4 }[k] || 1);
    return box;
  }

  // reactions: the bubble face and the sound (the body move is in react())
  var REACT = {
    shy: ['😊', 'ooh'], giggle: ['😆', 'giggle'], wow: ['🤩', 'star'], love: ['😍', 'ooh'], cool: ['😎', 'cool'],
    silly: ['🤪', 'boing'], clown: ['🤡', 'honk'], kiss: ['😘', 'mwah'], roar: ['😁', 'growl'], purr: ['😸', 'purr'],
    party: ['🥳', 'horn'], alien: ['👽', 'beep'], star: ['🤩', 'star'], sneeze: ['🤧', 'sneeze'],
  };

  /* ---------------------------------------------------------- the game */

  MG.registerGame({
    id: 'makeup',
    name: 'Make-Up Mirrors',
    emoji: '💄',
    color: 'grape',
    howTo: 'Give each other a makeover! In your mirror sits the OTHER player\'s animal. Tap something in your tray to put it on, and keep tapping it (or the face) to add more: wash, blush, eyes, noses, lips, hats, glitter, then a pose for the photo. The next step comes when you are both done; until then you can swap your choice as often as you like. Every photo goes on your wall, and every makeover brings a present: new parties, salon friends and six secret looks to discover.',
    options: [
      { key: 'length', label: 'Makeover', default: 'full', choices: [
        { value: 'short', label: 'Short', emoji: '🐇' }, { value: 'full', label: 'Full', emoji: '💄' }] },
      { key: 'dabs', label: 'Taps per step', default: 'normal', choices: [
        { value: 'few', label: 'Few', emoji: '🐣' }, { value: 'normal', label: 'Normal', emoji: '🎨' }, { value: 'lots', label: 'Lots', emoji: '💪' }] },
    ],

    mount: function (root, ctx) {
      var el = ctx.el, sfx = ctx.sfx, fx = ctx.fx, util = ctx.util;
      var RM = !!MG.reducedMotion;
      var LEN = ctx.opt('length') === 'short' ? 'short' : 'full', DABOPT = ctx.opt('dabs');
      var players = ctx.players;
      // roles are fixed for the round: "a" is the little player if exactly one is little, else whoever starts
      var aSide = players[0].little !== players[1].little ? (players[0].little ? 0 : 1) : ctx.firstPlayer;
      var bSide = 1 - aSide;

      var kit = cleanMakeup(ctx.load('makeup', null));
      var u = unlocks(kit.done);
      var state = 'menu', token = 0;
      var partyId = null, party = null, zones = [], zoneI = -1, zone = null;
      var events = [], lastTap = 0, menuTap = 0, lastHinted = null, wallAt = -1, wallC = 0, bookAt = -1;
      var forced = {}, poodle = { wearing: null, catches: 0 }, parrotAt = -10, booth = false;

      /* ---- sounds: the salon's own, built from tones and noise (soft) ---- */

      var S = {
        puff: function () { sfx.noise({ freq: 1500, dur: 0.07, gain: 0.08, q: 0.7 }); },
        swish: function () { sfx.noise({ freq: 2600, to: 1200, dur: 0.1, gain: 0.08 }); },
        pok: function (k) { sfx.tone({ freq: 520, to: 300, dur: 0.06, type: 'triangle', gain: 0.18 }); sfx.play('pop', { pitch: 500 + 90 * k }); },
        squish: function (k) { sfx.noise({ freq: 700, to: 300, dur: 0.09, gain: 0.1 }); sfx.play('pop', { pitch: 700 + 90 * (k || 0) }); },
        rinse: function () { sfx.play('splash'); sfx.noise({ freq: 3000, to: 1000, dur: 0.25, gain: 0.06 }); },
        honk: function () { sfx.tone({ freq: 330, dur: 0.12, type: 'triangle', gain: 0.14 }); sfx.tone({ freq: 262, dur: 0.14, type: 'triangle', gain: 0.14, delay: 0.16 }); },
        squeak: function () { sfx.tone({ freq: 900, to: 1300, dur: 0.08, type: 'sine', gain: 0.12 }); },
        mwah: function () { sfx.tone({ freq: 700, to: 1400, dur: 0.09, type: 'sine', gain: 0.12 }); sfx.noise({ freq: 3000, dur: 0.03, gain: 0.06, delay: 0.08 }); },
        twirl: function () { sfx.tone({ freq: 500, to: 900, dur: 0.14, type: 'sine', gain: 0.1 }); },
        cool: function () { sfx.seq([67, 71, 74], { step: 0.07, type: 'triangle', gain: 0.14 }); },
        ooh: function () { sfx.tone({ freq: 300, to: 520, dur: 0.28, type: 'sine', gain: 0.1 }); },
        growl: function () { sfx.tone({ freq: 140, to: 110, dur: 0.25, type: 'triangle', gain: 0.08 }); ctx.after(280, function () { sfx.play('giggle'); }); },
        purr: function () { for (var i = 0; i < 6; i++) sfx.noise({ freq: 120, dur: 0.05, gain: 0.07, delay: i * 0.06 }); },
        beep: function () { sfx.tone({ freq: 880, dur: 0.07, type: 'triangle', gain: 0.12 }); sfx.tone({ freq: 660, dur: 0.07, type: 'triangle', gain: 0.12, delay: 0.1 }); },
        horn: function () { sfx.tone({ freq: 480, to: 720, dur: 0.22, type: 'triangle', gain: 0.14 }); },
        quack: function () { sfx.tone({ freq: 520, to: 430, dur: 0.09, type: 'triangle', gain: 0.1 }); sfx.tone({ freq: 520, to: 430, dur: 0.09, type: 'triangle', gain: 0.1, delay: 0.11 }); },
        sneeze: function () { sfx.tone({ freq: 400, to: 600, dur: 0.12, type: 'sine', gain: 0.2 }); sfx.tone({ freq: 450, to: 750, dur: 0.12, type: 'sine', gain: 0.2, delay: 0.15 }); sfx.noise({ freq: 3000, dur: 0.2, gain: 0.2, delay: 0.35 }); },
        spray: function () { sfx.noise({ freq: 6000, to: 3000, dur: 0.18, gain: 0.05 }); },
        shutter: function () { sfx.noise({ freq: 4000, dur: 0.03, gain: 0.12 }); sfx.noise({ freq: 1800, dur: 0.05, gain: 0.1, delay: 0.06 }); },
        yip: function () { sfx.tone({ freq: 1200, to: 900, dur: 0.06, type: 'sine', gain: 0.1 }); sfx.tone({ freq: 1200, to: 900, dur: 0.06, type: 'sine', gain: 0.1, delay: 0.1 }); },
        rawk: function () { sfx.tone({ freq: 1400, to: 1100, dur: 0.08, type: 'triangle', gain: 0.1 }); sfx.tone({ freq: 1500, to: 1150, dur: 0.08, type: 'triangle', gain: 0.1, delay: 0.1 }); },
        jingle: function (z) { var t = 2 * (z || 0); sfx.seq([72 + t, 76 + t, 79 + t], { step: 0.12, type: 'triangle', gain: 0.12 }); },
        fanfare: function () { sfx.seq([67, 72, 76, 79], { step: 0.1, type: 'triangle', gain: 0.16 }); },
        sneaky: function () { sfx.seq([45, 48, 45, 48], { step: 0.14, type: 'triangle', gain: 0.14 }); },
        tune: function () { sfx.seq([72, 76, 79, 84, 79, 84], { step: 0.12, type: 'triangle', gain: 0.12 }); },
        ticks: function () { for (var i = 0; i < 3; i++) sfx.tone({ freq: 2000 + 200 * i, dur: 0.03, type: 'triangle', gain: 0.08, delay: i * 0.05 }); },
        pops: function (base) { for (var i = 0; i < 3; i++) (function (i) { ctx.after(i * 60, function () { sfx.play('pop', { pitch: base + 140 * i }); }); })(i); },
        giggle: function () { sfx.play('giggle'); },
        boing: function () { sfx.play('boing'); },
        star: function () { sfx.play('star'); },
      };

      /** The sound of one dab of a kind (k: the dab just made). */
      function dabSound(id, k) {
        var it = ITEMS[id];
        switch (it.k) {
          case 'foam': S.squish(k); break;
          case 'blush': S.puff(); break;
          case 'stamp': S.pok(k); break;
          case 'dots': S.pops(600 + 40 * k); break;
          case 'stripes': S.growl(); break;
          case 'shadow': S.swish(); break;
          case 'lashes': S.ticks(); break;
          case 'googly': case 'smile': sfx.play('boing'); break;
          case 'glasses': if (k <= 1) sfx.play('drop'); else S.cool(); break;
          case 'mask': case 'cape': sfx.play('whoosh'); break;
          case 'ball': if (id === 'button') S.squeak(); else S.honk(); break;
          case 'tip': S.squeak(); break;
          case 'whisk': S.purr(); break;
          case 'cream': S.squish(k); break;
          case 'lips': S.mwah(); break;
          case 'stache': S.twirl(); break;
          case 'bowtie': sfx.play('pop'); break;
          case 'wear': sfx.play(it.z === 'top' && k <= 1 ? 'boing' : 'drop'); break;
          case 'ring': S.pops(500 + 60 * k); break;
          case 'cone': if (it.horn) sfx.play('star'); else S.horn(); break;
          case 'wig': sfx.play('boing'); S.pops(700); break;
          case 'antennae': S.beep(); break;
          case 'glitter': S.spray(); sfx.scale(2 * k + 3); break;
          case 'pose': if (id === 'wave') sfx.play('hop'); else if (id === 'kiss') S.mwah(); else sfx.play('giggle'); break;
          default: sfx.play('pop');
        }
      }

      /* ---- timers: game logic only through later(), which an old step can never reach ---- */

      function setState(s) { state = s; token++; }
      function later(ms, fn) { var tk = token; return ctx.after(ms, function () { if (tk === token) fn(); }); }

      /* ---- small visual helpers (decoration only) ---- */

      function anim(node, frames, ms, o) {
        if (!node || !node.animate) return null;
        o = o || {};
        try { return node.animate(frames, { duration: RM ? Math.min(ms, 150) : ms, easing: o.easing || 'ease-out', composite: o.replace ? 'replace' : 'add', fill: o.fill || 'none' }); }
        catch (e) { return null; }
      }
      function press(node) {
        if (!node) return;
        node.classList.remove('is-press');
        void node.offsetWidth;
        node.classList.add('is-press');
        ctx.after(90, function () { node.classList.remove('is-press'); });
      }
      function burstAt(node, o) { if (!node || !node.isConnected) return; var c = fx.centerOf(node); fx.burst(c.x, c.y, o); }
      /** Something flies from one element to another in an arc (decoration; the state has already changed). */
      function fly(content, fromNode, toNode, o) {
        o = o || {};
        if (!fromNode || !toNode || !fromNode.isConnected || !toNode.isConnected) return;
        var r = root.getBoundingClientRect(), from = fx.centerOf(fromNode), to = fx.centerOf(toNode);
        if (o.to) { to.x += o.to[0]; to.y += o.to[1]; }
        var f = el('span', { class: 'mk-flyer', style: { left: (from.x - r.left) + 'px', top: (from.y - r.top) + 'px', fontSize: (o.size || 24) + 'px' } },
          typeof content === 'string' ? ctx.sticker(content) : content);
        root.appendChild(f);
        var ms = o.ms || 450, dx = to.x - from.x, dy = to.y - from.y;
        var end = 'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + dy + 'px)) scale(' + (o.endScale || 0.8) + ')';
        if (f.animate) {
          if (RM) f.animate([{ transform: end, opacity: 0 }, { transform: end, opacity: 1 }], { duration: 150, fill: 'forwards' });
          else f.animate([
            { transform: 'translate(-50%, -50%) scale(1)' },
            { transform: 'translate(calc(-50% + ' + dx * 0.5 + 'px), calc(-50% + ' + (dy * 0.5 - Math.min(80, 30 + Math.abs(dx) * 0.2)) + 'px)) scale(1.2)', offset: 0.5 },
            { transform: end },
          ], { duration: ms, easing: 'ease-in-out', fill: 'forwards' });
        }
        ctx.after(RM ? 170 : ms + 20, function () { f.remove(); if (o.done) o.done(); });
      }

      /* ---- build ---- */

      var scene = el('div', { class: 'mk-scene', hidden: true });
      var stripEl = el('div', { class: 'mk-strip', 'aria-hidden': 'true' });
      var marqueeEl = el('div', { class: 'mk-marquee' },
        el('span', { class: 'mk-mq-pet' }, ctx.sticker(players[0].emoji)), stripEl, el('span', { class: 'mk-mq-pet' }, ctx.sticker(players[1].emoji)));
      var helpersEl = el('div', { class: 'mk-helpers' });
      var photosEl = el('div', { class: 'mk-photos' });
      var decorEl = el('div', { class: 'mk-decor' });
      var rowEl = el('div', { class: 'mk-row' }, helpersEl, photosEl, decorEl);
      var wallEl = el('div', { class: 'mk-wall', 'aria-label': 'Salon wall' }, marqueeEl, rowEl);
      var frameEl = el('div', { class: 'mk-frame', hidden: true, 'aria-hidden': 'true' });
      var giftEl = el('div', { class: 'mk-gift', hidden: true, 'aria-hidden': 'true' });
      scene.appendChild(wallEl);

      var cardsEl = el('div', { class: 'mk-cards' });
      var nextEl = el('div', { class: 'mk-next', hidden: true, 'aria-label': 'Next present' });
      var gridEl = el('div', { class: 'mk-grid' }, cardsEl, nextEl);
      var bookEl = el('div', { class: 'mk-book', 'aria-label': 'Secret looks' });
      var menuEl = el('div', { class: 'mk-menu' }, gridEl, bookEl);
      root.appendChild(scene);
      root.appendChild(menuEl);

      /** One board per player: a mirror holding the OTHER player's animal, the stylist in the outer corner, a tray below. */
      function mkBoard(s) {
        var p = players[s], friend = players[1 - s];
        var F = buildModel(friend.emoji, 'var(--p' + (1 - s) + ')');
        var sway = el('div', { class: 'mk-sway' }, F.el);
        var bubble = el('span', { class: 'mk-bubble' }, ctx.sticker('😊'));
        var badges = el('span', { class: 'mk-badges' });
        var glass = el('span', { class: 'mk-glass' }, el('i', { class: 'mk-glint' }));
        var bulbs = el('span', { class: 'mk-bulbs' });
        for (var i = 0; i < 10; i++) bulbs.appendChild(el('i', { style: { '--i': i } }));
        var mirror = el('div', { class: 'mk-mirror', role: 'button', tabindex: '0', 'aria-label': 'Your friend' }, glass, bulbs, sway, bubble, badges);
        var marksEl = el('span', { class: 'mk-marks' });
        var face = ctx.sticker(p.emoji, 'mk-sty-face');
        var stylist = el('span', { class: 'mk-stylist' }, face, el('span', { class: 'mk-brush' }, el('i')), marksEl);
        var wave = el('span', { class: 'mk-wave' }, ctx.sticker('👋'));
        var check = el('span', { class: 'mk-check' }, ctx.sticker('✔️'));
        var tray = el('div', { class: 'mk-tray' });
        var node = el('div', { class: 'mk-board', 'data-side': String(s), role: 'group', 'aria-label': 'Mirror' }, mirror, tray, stylist, wave, check);
        scene.appendChild(node);
        return { side: s, el: node, F: F, sway: sway, mirror: mirror, glass: glass, bubble: bubble, badges: badges, stylist: stylist, face: face, marksEl: marksEl,
          wave: wave, check: check, trayEl: tray, items: [], tray: [], item: null, k: 0, n: 0, done: false, noPick: 0,
          nextAt: 0, busyUntil: 0, swapAt: -1, cheerAt: -1, tickAt: -1, tickleAt: -1, tickleI: 0, c: 0,
          look: {}, pose: null, found: [], sneezed: false, mud: 0, glitter: GLITTER_IDX, seed: [0.7, 3.6], reactAt: -1, bubbleGen: 0, glanceGen: 0, waveGen: 0, rinseGen: 0 };
      }
      var boards = [mkBoard(0), mkBoard(1)];
      var friendOf = function (b) { return b.F.el; };

      /* ---- sizing ---- */

      function menuCount() { return u.parties.length + (u.next ? 1 : 0); }

      /** The step pips across `room` px: one row when they fit at 20px or more (closing up to 2px apart first), else two
       *  (or three) rows; never under 20. Returns the pip size, the gap, the rows and the strip's size. */
      function pipFit(nb, room, gap, big) {
        // (one row first, closing up the gap; more rows keep their pips small, so the strip takes little height from the photos)
        var tries = [[1, gap], [1, gap > 2 ? 2 : 1], [2, gap], [3, gap]], S = 20, rows = 3, g = gap;
        for (var i = 0; i < tries.length; i++) {
          var per = Math.ceil(nb / tries[i][0]), s1 = Math.min(tries[i][0] > 1 ? Math.min(big, 24) : big, Math.floor((room - (per - 1) * tries[i][1]) / per));
          if (s1 >= 20 || i === tries.length - 1) { S = Math.max(20, s1); rows = tries[i][0]; g = tries[i][1]; break; }
        }
        var n = Math.ceil(nb / rows);
        return { S: S, gap: g, rows: rows, w: n * S + (n - 1) * g + 1, h: rows * S + (rows - 1) * 4 };
      }

      function fit() {
        var s = ctx.size(), w = s.w, h2 = s.h, P = 12, G = 8, FR = 6, PAD = 6, BD = 3, U = util, port = s.orient === 'portrait';
        var Wb, B, wallH = 0, midW = 0, inner, tray = 'row', J, Jw, Mh, pf, ph, nb = zones.length || 8, mq = u.tier >= 3;
        var bubOf = function (m) { return U.clamp(Math.round(m * 0.24), 28, 64); };
        // what a mirror needs for a friend m wide: the friend, the frame, and headroom for half the reaction bubble
        var needOf = function (m) { return Math.ceil(m * 1.2) + 2 * FR + Math.round(bubOf(m) * 0.5); };
        if (port) {
          var S0 = U.clamp(Math.round(h2 * 0.045), 20, 34), rowW = w - 2 * P - 12;
          // (tier 3: the two marquee animals sit at the ends of the strip's line)
          pf = pipFit(nb, rowW - 4 - (mq ? 2 * (Math.ceil(S0 * 0.86) + 10) : 0), 4, S0);
          Wb = Math.floor((w - 2 * P - G) / 2);
          inner = Wb - 2 * PAD - 2 * BD;
          tray = inner >= 3 * 80 + 12 ? 'row' : 'col';                // phones: a column of 3 full-width buttons
          var M0 = Math.min(inner - 2 * FR, 320), need = needOf(M0);
          Jw = tray === 'row' ? Math.floor((inner - 12) / 3) : inner;
          var J0 = tray === 'row' ? U.clamp(Jw, 64, 120) : 96;
          // The mirror gets what its friend needs. The wall band takes the rest, as far as it can use it: one row of
          // polaroids where 3 (4 on a tablet) still show, fanned, beside the smallest stickers; never over 0.3 of the height.
          // (beside the helpers and decorations at 16px; on a tablet at 24px, with 4 photos)
          var k = rowW >= 600 ? 4 : 3, dmin = rowW >= 600 ? 24 : 16;
          var phUse = Math.min(200, Math.floor((rowW - (6 * dmin + 8) - 12 - 8) / (1.15 * (1 + 0.55 * (k - 1)))));
          var wall0 = Math.max(U.clamp(Math.round(h2 * 0.17), 76, 190), pf.h + 16 + 43);
          var wallTop = Math.max(wall0, Math.min(Math.round(h2 * 0.3), Math.ceil(phUse / 0.94) + pf.h + 16));
          wallH = U.clamp(h2 - 2 * P - G - (2 * BD + 2 * PAD + need + 6 + (tray === 'row' ? J0 : 3 * J0 + 12)), wall0, wallTop);
          B = h2 - 2 * P - wallH - G;
          // what is left after that goes to her tray buttons (phones: up to 120px each; a row: up to 1.3 times as tall as wide)
          if (tray === 'row') J = U.clamp(B - 2 * BD - 2 * PAD - need - 6, J0, Math.max(J0, Math.min(140, Math.round(Jw * 1.3))));
          else J = U.clamp(Math.floor((B - 2 * BD - 2 * PAD - need - 6 - 12) / 3), 64, 120);
          Mh = B - 2 * BD - 2 * PAD - 6 - (tray === 'row' ? J : 3 * J + 12);
          // (0.94: room for the polaroids' tilt)
          ph = Math.floor((wallH - 12 - pf.h - 4) * 0.94);
        } else {
          Wb = U.clamp(Math.round(w * 0.34), 150, 360);
          midW = w - 2 * P - 2 * Wb - 2 * G;
          if (midW < 120) { Wb = Math.floor((w - 2 * P - 2 * G - 120) / 2); midW = w - 2 * P - 2 * G - 2 * Wb; }
          B = h2 - 2 * P; inner = Wb - 2 * PAD - 2 * BD;
          Jw = Math.floor((inner - 12) / 3);
          if (Jw < 64) {                                   // a small phone turned: a narrower wall (its pips go to two rows)
            Wb = Math.max(Wb, Math.floor((w - 2 * P - 2 * G - 108) / 2));
            midW = w - 2 * P - 2 * G - 2 * Wb;
            inner = Wb - 2 * PAD - 2 * BD;
            Jw = Math.floor((inner - 12) / 3);
          }
          if (Jw < 64) {                                   // still too narrow for three: the tray goes 2 + 1, every button 64+ square
            tray = 'grid';
            Jw = Math.floor((inner - 6) / 2);
            J = U.clamp(Math.min(Jw, Math.floor(B * 0.24)), 64, 120);
            Mh = B - 2 * BD - 2 * PAD - (2 * J + 6) - 6;
          } else {
            J = U.clamp(Math.floor(Math.min(Jw, B * 0.28)), 64, 120);
            // (height the friend cannot use goes to the tray, up to 1.3 times as tall as wide)
            J = U.clamp(B - 2 * BD - 2 * PAD - 6 - needOf(Math.min(inner - 2 * FR, 320)), J, Math.max(J, Math.min(140, Math.round(Jw * 1.3))));
            Mh = B - 2 * BD - 2 * PAD - J - 6;
          }
          // (a small phone turned: two rows. Tier 3: the strip sits on the marquee sign, inside its 4px inline padding, and
          // the sign's two animals have a row of their own above it)
          pf = pipFit(nb, mq ? midW - 2 * BD - 2 * 3 - 2 * 4 - 1 : midW - 16, 2, mq ? 30 : 34);
          ph = U.clamp(Math.round(midW * 0.42), 40, 110);
          ph = Math.min(ph, Math.floor((midW - 20) / 1.15), Math.floor((B - 12 - pf.h - 4 - (mq ? pf.S + 4 : 0)) / 1.6));
        }
        var M = Math.max(40, Math.min(inner - 2 * FR, Math.floor((Mh - 2 * FR) / 1.2), 320));
        var sty = U.clamp(Math.round(Wb * 0.2), 30, 60);
        var bub = bubOf(M);
        var badge = U.clamp(Math.round(M * 0.2), 22, 48);
        var chk = U.clamp(Math.round(sty * 0.62), 20, 36);
        var S = pf.S;
        // menu: the biggest square cards above the look-book row
        var L = U.clamp(Math.round(Math.min(w, h2) * 0.1), 28, 60), n = menuCount(), W = w - 2 * P, H = h2 - 2 * P - L - G, card = 0, cols = 1;
        for (var c = 1; c <= 5; c++) { var r = Math.ceil(n / c), z = Math.floor(Math.min((W - (c - 1) * G) / c, (H - (r - 1) * G) / r)); if (z > card) { card = z; cols = c; } }
        card = Math.min(200, card);
        var rows = Math.ceil(n / cols), ni = u.parties.length;
        // the finale photo frame: two models side by side
        var PW = Math.min(w - 2 * P, 560), M2 = Math.floor(Math.min((PW - 48) / 2, (h2 - 2 * P - 48) / 1.2, 220));
        var set = function (k, v) { root.style.setProperty(k, v); };
        set('--wall', wallH + 'px'); set('--mid', midW + 'px'); set('--board-w', Wb + 'px'); set('--board-h', B + 'px');
        set('--m', M + 'px'); set('--j', J + 'px'); set('--jw', Jw + 'px'); set('--sty', sty + 'px'); set('--bub', bub + 'px');
        set('--badge', badge + 'px'); set('--chk', chk + 'px'); set('--pip', S + 'px'); set('--strip-w', pf.w + 'px'); set('--strip-h', pf.h + 'px'); set('--pgap', pf.gap + 'px');
        set('--ph', ph + 'px'); set('--pm', Math.round(ph * 0.52) + 'px');
        set('--card', card + 'px'); set('--cols', String(cols)); set('--book', L + 'px'); set('--pw', PW + 'px'); set('--m2', M2 + 'px');
        set('--grid-w', (cols * card + (cols - 1) * G) + 'px'); set('--grid-h', (rows * card + (rows - 1) * G) + 'px');
        set('--nx', ((ni % cols) * (card + G)) + 'px'); set('--ny', (Math.floor(ni / cols) * (card + G)) + 'px');
        set('--gift', Math.min(Math.round(M2 * 0.9), 170) + 'px');
        root.dataset.tray = tray;
        var deco0 = U.clamp(Math.round(ph * (port ? 0.45 : 0.5)), 14, 40), deco = deco0;
        set('--deco', deco + 'px');
        if (scene.hidden) return;
        // then make sure the wall row really fits, whatever the emoji font. First the stickers shrink (to 16px), then the
        // photos fan out (each slides under the one before) and the stickers grow back as far as they still fit; then the
        // stickers go to 14px, and only then do the oldest photos come down (the newest always stays)
        var fits = function () { return rowEl.scrollWidth <= rowEl.clientWidth + 1 && rowEl.scrollHeight <= rowEl.clientHeight + 1; };
        var setDeco = function (v) { deco = v; set('--deco', v + 'px'); };
        var pols = [].slice.call(photosEl.querySelectorAll('.mk-polaroid:not(.is-empty)'));
        pols.forEach(function (p) { p.hidden = false; });
        photosEl.classList.remove('is-fan');
        for (var t = 0; t < 12 && deco > 16 && !fits(); t++) setDeco(Math.max(16, Math.floor(deco * 0.9)));
        if (!fits() && pols.length > 1) {
          photosEl.classList.add('is-fan');
          for (var t1 = 0; t1 < 12 && deco < deco0 && fits(); t1++) {
            var was = deco;
            setDeco(Math.min(deco0, deco + 2));
            if (!fits()) { setDeco(was); break; }
          }
        }
        for (var t3 = 0; t3 < 3 && deco > 14 && !fits(); t3++) setDeco(deco - 1);
        for (var i = pols.length - 1; i > 0 && !fits(); i--) pols[i].hidden = true;
        // (the room a hidden photo leaves goes back to the stickers)
        for (var t4 = 0; t4 < 12 && i < pols.length - 1 && deco < deco0 && fits(); t4++) {
          var was2 = deco;
          setDeco(Math.min(deco0, deco + 2));
          if (!fits()) { setDeco(was2); break; }
        }
        var tall = function () { return boards.some(function (b) { return b.F.el.offsetHeight > b.mirror.clientHeight + 0.5 || b.F.el.offsetWidth > b.mirror.clientWidth + 0.5; }); };
        for (var t2 = 0; t2 < 4 && tall(); t2++) { M = Math.floor(M * 0.94); set('--m', M + 'px'); }
      }

      /* ---- the wall: pips, helpers, photos, decorations ---- */

      /** A party's backdrop; deco: true for all three corner stickers, or how many (the menu card keeps its bottom row clear). */
      function bgEl(id, deco) {
        var P0 = PARTIES[id], n = el('span', { class: 'mk-bg', 'data-bg': P0.bg });
        if (P0.bg === 'night') for (var i = 0; i < 6; i++) n.appendChild(el('i', { class: 'mk-star', 'data-i': String(i) }));
        if (P0.bg === 'rainbow') for (var j = 0; j < 6; j++) n.appendChild(el('i', { class: 'mk-band', style: { background: RAINBOW[j], top: (j * 100 / 6) + '%' } }));
        if (deco) P0.deco.slice(0, deco === true ? 3 : deco).forEach(function (e, k) { n.appendChild(el('span', { class: 'mk-deco', 'data-i': String(k) }, ctx.sticker(e))); });
        return n;
      }

      /** The look of the friend made up on board s, as a photo face (zones that made the look). */
      function lookOf(b) {
        var z = {};
        LOOK_ZONES.forEach(function (zn) { if (b.look[zn]) z[zn] = b.look[zn]; });
        return z;
      }
      function photoOfRound() {
        var b1 = boards[1], b0 = boards[0];
        return { p: partyId,
          l: { e: players[0].emoji, z: lookOf(b1), x: b1.found.slice(), o: b1.pose },
          r: { e: players[1].emoji, z: lookOf(b0), x: b0.found.slice(), o: b0.pose } };
      }
      /** Dabs an item takes when styled by board s (the photo shows every zone at that). */
      function nOfSide(s) { return function (id) { return nFor(ITEMS[id].k, s === bSide, DABOPT, ctx.helpFor(s)); }; }
      /** The two faces of a photo, each on its owner's side; l was made up on board 1, r on board 0. */
      function photoFaces(ph, size) {
        var col = function (e, fallback) { var i = players.map(function (p) { return p.emoji; }).indexOf(e); return i >= 0 ? 'var(--p' + i + ')' : fallback; };
        var L = renderFace(ph.l.e, ph.l, size, col(ph.l.e, 'var(--p0)'), { side: 'l', nOf: nOfSide(1), c1: 'var(--p1)', kissed: ph.r.o === 'kiss', eared: ph.r.o === 'ears' });
        var R = renderFace(ph.r.e, ph.r, size, col(ph.r.e, 'var(--p1)'), { side: 'r', nOf: nOfSide(0), c1: 'var(--p0)', kissed: ph.l.o === 'kiss', eared: ph.l.o === 'ears' });
        return [L, R];
      }
      function polaroid(ph, i) {
        var faces = photoFaces(ph, 'var(--pm)');
        var shot = el('span', { class: 'mk-pshot' }, bgEl(ph.p, false), el('span', { class: 'mk-pfaces' }, faces[0].el, faces[1].el));
        // (the newest first and on top: in a fan each older photo slides under the one before it; see the css for landscape)
        return el('span', { class: 'mk-polaroid', 'data-i': String(i), style: { '--tilt': ((i % 2 ? 3 : -3) + (i % 3) - 1) + 'deg', '--z': String(8 - i) } }, shot);
      }
      function buildPhotos() {
        photosEl.textContent = '';
        if (!kit.photos.length) photosEl.appendChild(el('span', { class: 'mk-polaroid is-empty' }));
        kit.photos.forEach(function (ph, i) { photosEl.appendChild(polaroid(ph, i)); });
      }
      function buildHelpers() {
        helpersEl.textContent = '';
        HELPER_IDS.forEach(function (id) {
          if (!u.helpers[id]) return;
          var n = el('span', { class: 'mk-helper', 'data-h': id }, ctx.sticker(HELPERS[id]));
          if (id === 'poodle') n.appendChild(el('span', { class: 'mk-pwear' }));
          if (id === 'parrot') n.appendChild(el('span', { class: 'mk-pbub' }));
          helpersEl.appendChild(n);
        });
      }
      function buildDecor() {
        decorEl.textContent = '';
        if (u.tier >= 2) decorEl.appendChild(el('span', { class: 'mk-vase' }, ctx.sticker('💐'), el('i')));
        u.decor.forEach(function (e) { decorEl.appendChild(el('span', { class: 'mk-dec' }, ctx.sticker(e))); });
      }
      function buildWall() {
        scene.dataset.tier = String(u.tier);
        wallEl.dataset.tier = String(u.tier);
        buildHelpers();
        buildPhotos();
        buildDecor();
        if (poodle.wearing) dressPoodle(poodle.wearing);
      }
      function helperEl(id) { return helpersEl.querySelector('.mk-helper[data-h="' + id + '"]'); }

      function buildPips() {
        stripEl.textContent = '';
        zones.forEach(function (z, i) {
          var p = el('span', { class: 'mk-pip', 'data-i': String(i), 'data-zone': z }, ctx.sticker(PIP[z]), el('span', { class: 'mk-pip__tick' }, ctx.sticker('✔️')));
          stripEl.appendChild(p);
          ctx.after(i * 60, function () { p.classList.add('is-in'); sfx.play('tick'); });
        });
      }
      function renderPips() {
        stripEl.querySelectorAll('.mk-pip').forEach(function (p, i) {
          var done = i < zoneI || (i === zoneI && (state === 'finale' || p.classList.contains('is-done')));
          p.classList.toggle('is-now', i === zoneI && state !== 'finale' && !done);
          p.classList.toggle('is-done', done);
        });
      }

      /* ---- the menu ---- */

      function playedOf(id) { return kit.played[id] || 0; }
      function buildMenu() {
        cardsEl.textContent = '';
        u.parties.forEach(function (id) {
          var n = playedOf(id), m = u.medals[id] || 0;
          var stars = el('span', { class: 'mk-card__stars' });
          for (var i = 0; i < Math.min(3, n); i++) stars.appendChild(ctx.sticker('⭐'));
          var medals = el('span', { class: 'mk-card__medals' });
          for (var k = 0; k < m; k++) medals.appendChild(ctx.sticker('🏅'));
          cardsEl.appendChild(el('button', { type: 'button', class: 'mk-card' + (n ? '' : ' is-new'), 'data-id': id, 'aria-label': NAMES[id] },
            bgEl(id, 2), el('span', { class: 'mk-card__e' }, ctx.sticker(PARTIES[id].e)), stars, medals,
            n ? null : el('span', { class: 'mk-card__new' }, ctx.sticker('✨'))));
        });
        nextEl.textContent = '';
        nextEl.hidden = !u.next;
        if (u.next) {
          nextEl.appendChild(el('span', { class: 'mk-next__sil' }, ctx.sticker(PARTIES[u.next].e)));
          nextEl.appendChild(el('span', { class: 'mk-next__tag' }, ctx.sticker('🎁')));
        }
        bookEl.textContent = '';
        LOOKS.forEach(function (L) {
          var got = kit.looks.indexOf(L.id) >= 0;
          bookEl.appendChild(el('span', { class: 'mk-lookslot' + (got ? ' is-found' : ''), 'data-id': L.id }, el('span', { class: 'mk-lookslot__in' }, ctx.sticker(L.e))));
        });
        var off = state !== 'menu';
        cardsEl.querySelectorAll('.mk-card').forEach(function (c, k) {
          if (off) c.setAttribute('aria-disabled', 'true'); else c.removeAttribute('aria-disabled');
          if (!RM) { c.style.setProperty('--k', String(k)); c.classList.add('is-pop'); }
        });
        fit();
      }

      /* ---- the ghost hand ---- */

      function hint(node, o) { lastHinted = node || null; ctx.hint(node || null, o); }
      function seen(kind) { return kit.seen.indexOf(kind) >= 0; }
      function sigOf(b) {
        var sig = party && party.sig[zone];
        return sig && b.tray.indexOf(sig) >= 0 ? sig : null;
      }
      function itemBtn(b, id) { for (var i = 0; i < b.items.length; i++) if (b.items[i].dataset.id === id) return b.items[i]; return null; }
      /** Where the hand points on a board: always the button that moves it on by one dab. */
      function targetOf(b) {
        if (!b.items.length) return null;
        if (zone === 'wash') return b.items[0];
        if (b.item) return itemBtn(b, b.item) || b.items[0];
        var sig = sigOf(b);
        return (sig && itemBtn(b, sig)) || b.items[1] || b.items[0];
      }
      function handSideNow() { return !boards[aSide].done ? aSide : !boards[bSide].done ? bSide : -1; }
      /** The menu's hand: the newest party never played; else the least played (ties: menu order). */
      function menuBest() {
        var best = null, bestRank = -Infinity;
        // (the starting two rank equal, so the first of them wins on a new salon)
        u.order.forEach(function (id, i) { var rank = START.indexOf(id) >= 0 ? -1 : i; if (!playedOf(id) && rank > bestRank) { best = id; bestRank = rank; } });
        if (!best) { var low = Infinity; u.parties.forEach(function (id) { if (playedOf(id) < low) { low = playedOf(id); best = id; } }); }
        return best;
      }
      function hintNext() {
        if (state === 'menu') { var id = menuBest(); hint(id ? cardsEl.querySelector('.mk-card[data-id="' + id + '"]') : null); return; }
        if (state !== 'zone') { hint(null); return; }
        var s = handSideNow();
        hint(s < 0 ? null : targetOf(boards[s]));
      }
      /** Quiet seconds before the hand shows the next thing on side s's board. */
      function idleFor(s) {
        if (s !== aSide) return 10;
        var t = targetOf(boards[s]);
        if (t && t.dataset.id && !seen(ITEMS[t.dataset.id].k)) return 1.5;
        return [6, 4, 2.5][ctx.helpFor(aSide)] || 6;
      }

      /* ---- the round: menu -> deal -> zone -> admire -> ... -> pose -> finale ---- */

      function pick(id, card) {
        if (state !== 'menu' || !PARTIES[id] || u.parties.indexOf(id) < 0) return;
        setState('deal');
        cardsEl.querySelectorAll('.mk-card').forEach(function (c) { c.setAttribute('aria-disabled', 'true'); });
        sfx.play('start');
        if (card) fx.pop(card);
        ctx.setTurn(null);
        hint(null);
        partyId = id; party = PARTIES[id]; zones = zonesFor(party, LEN); zoneI = -1; zone = null;
        poodle = { wearing: null, catches: 0 };
        menuEl.classList.add('is-leaving');
        later(300, function () { menuEl.hidden = true; });
        scene.hidden = false;
        scene.classList.remove('is-finale');
        frameEl.hidden = true;
        giftEl.hidden = true;
        boards.forEach(function (b) {
          b.look = {}; b.pose = null; b.found = []; b.sneezed = false; b.item = null; b.k = 0; b.done = false; b.items = []; b.tray = [];
          b.glitter = util.shuffle(GLITTER_IDX);
          b.seed = [util.randf(0, 6.28), util.randf(0, 6.28)];
          b.trayEl.textContent = '';
          b.badges.textContent = '';
          b.el.classList.remove('is-done');
          ZONES.forEach(function (z) { renderLayer(b.F, z, null, 0); });
          b.mud = LEN === 'full' ? 3 : 0;
          renderMud(b.F, b.mud);
          b.el.classList.add('is-in');
          if (!RM) fx.bounce(b.sway);
          fx.bounce(b.stylist);
          blink(b);
        });
        buildWall();
        buildPips();
        fit();
        later(800, function () { boards.forEach(function (b) { b.el.classList.remove('is-in'); }); startZone(0); });
      }

      function poolOf(z) { return u.items.filter(function (id) { return ITEMS[id].z === z; }); }
      function nOfBoard(b, kind) { return nFor(kind, b.side === bSide, DABOPT, ctx.helpFor(b.side)); }

      function buildTray(b) {
        b.trayEl.textContent = '';
        b.items = b.tray.map(function (id) {
          var btn = el('button', { type: 'button', class: 'mk-item', 'data-id': id, 'aria-label': id }, iconFor(id, players[b.side].color));
          b.trayEl.appendChild(btn);
          return btn;
        });
        b.trayEl.classList.toggle('is-one', b.items.length === 1);
        b.trayEl.classList.remove('is-away');
        b.trayEl.classList.add('is-up');
        markOn(b);
      }
      function markOn(b) { b.items.forEach(function (n) { n.classList.toggle('is-on', n.dataset.id === b.item); }); }

      function startZone(i) {
        zoneI = i; zone = zones[i];
        boards.forEach(function (b) {
          b.item = null; b.k = 0; b.n = 0; b.done = false; b.noPick = 0;
          b.tray = trayFor(zone, party, b.side === bSide, poolOf(zone), util);
          if (zone === 'wash') { b.item = 'sponge'; b.n = nOfBoard(b, 'foam'); }
          if (zone === 'pose') b.n = 1;
          b.busyUntil = ctx.time + 0.3;      // a moment to see the new step before a hammering finger can use it up
          b.nextAt = 0;
          b.el.classList.remove('is-done');
          buildTray(b);
        });
        setState('zone');
        renderPips();
        fit();
        hint(null);
        // the hand: soon on her board when the thing is new to her (and on the pose), else when someone waits
        var a = boards[aSide], t = targetOf(a), idle = idleFor(aSide);
        if (zone === 'pose') lastTap = ctx.time - idle + 0.8;
        else if (t && !seen(ITEMS[t.dataset.id].k)) lastTap = ctx.time - idle + 0.5;
        else lastTap = ctx.time;
      }

      /** Which tray item a tap on board b means: the one under the finger, or one within 12px of it, else none (the face). */
      function resolveItem(b, ev) {
        var t = ev && ev.target && ev.target.closest ? ev.target.closest('.mk-item') : null;
        if (t && b.trayEl.contains(t)) return t;
        if (!ev || ev.clientX == null || !b.items.length) return null;
        var best = null, bd = 13;
        b.items.forEach(function (n) {
          if (n.getAttribute('aria-disabled') === 'true') return;
          var r = n.getBoundingClientRect();
          var dx = Math.max(r.left - ev.clientX, 0, ev.clientX - r.right), dy = Math.max(r.top - ev.clientY, 0, ev.clientY - r.bottom), d = Math.max(dx, dy);
          if (d <= 12 && d < bd) { bd = d; best = n; }
        });
        return best;
      }

      /** The only handler for a board. */
      function onBoard(s, ev) {
        var b = boards[s], wasHinted = lastHinted;
        lastHinted = null;                                     // (the shell has taken the hand away)
        var itemEl = resolveItem(b, ev), id = itemEl ? itemEl.dataset.id : null;
        if (state !== 'zone') {
          if (state === 'admire' && !itemEl) tickle(b); else cheer(b);
          return;
        }
        if (b.done) {
          if (id && id !== b.item) swap(b, id, itemEl); else tickle(b);
          return;
        }
        if (ctx.time < b.busyUntil || ctx.time < b.nextAt) { tooSoon(b, itemEl); return; }
        if (id) {
          if (id !== b.item) choose(b, id, wasHinted);
          else dab(b, wasHinted);
          return;
        }
        if (b.item) { dab(b, wasHinted); return; }
        noItem(b);
      }

      /** A tap that came too soon: a squash and a soft tick; never queued. */
      function tooSoon(b, itemEl) {
        press(itemEl || b.sway);
        if (ctx.time - b.tickAt >= 0.1) { b.tickAt = ctx.time; sfx.play('tick'); }
      }

      /** A tap when there is nothing to style: the friend bounces with a rising pop. */
      function cheer(b) {
        if (ctx.time - b.cheerAt < CHEER_GAP) { press(b.sway); return; }
        b.cheerAt = ctx.time;
        if (!RM) fx.bounce(friendOf(b));
        sfx.play('pop', { pitch: 600 + 60 * (b.c++ % 8) });
      }

      /** A face tap before anything is chosen: a giggle, the tray wiggles; the second one brings the hand (or, with help, picks). */
      function noItem(b) {
        sfx.play('giggle');
        if (!RM) fx.wiggle(friendOf(b));
        b.items.forEach(function (n) { fx.wiggle(n); });
        showBubble(b, '😆');
        b.noPick++;
        if (b.noPick === 2) {
          var t = targetOf(b);
          if (!t) return;
          if (ctx.helpFor(b.side) >= 1) choose(b, t.dataset.id, null);
          else hint(t);
        }
      }

      /** A different tray item (or the first one): it becomes the brush and paints the next dab. */
      function choose(b, id, wasHinted) {
        var old = b.item;
        if (old && b.k >= 1) castOff(b, old);
        b.item = id;
        markOn(b);
        b.n = nOfBoard(b, ITEMS[id].k);
        b.k = Math.min(b.k + 1, b.n);
        b.nextAt = ctx.time + SWITCH_GAP;
        progress(b, true, wasHinted);
      }
      /** The same item again (or the face): one more dab. */
      function dab(b, wasHinted) {
        b.k = Math.min(b.k + 1, b.n);
        b.nextAt = ctx.time + GAP;
        progress(b, false, wasHinted);
      }

      /** Draw board b's zone as it stands now (fresh: the newest dab pops in). */
      function drawZone(b, fresh, o) {
        var oo = { n: b.n, fresh: fresh, outer: b.side ? 'r' : 'l', c1: players[b.side].color, seed: b.seed, glitter: b.glitter };
        if (o) Object.keys(o).forEach(function (k) { oo[k] = o[k]; });
        renderLayer(b.F, zone, b.item, b.k, oo);
        if (zone === 'pose') b.pose = b.item;
        else if (zone !== 'wash' && b.k >= 1) b.look[zone] = b.item;
      }

      /** A dab landed (or a new item was chosen with its first dab): everything here is synchronous. */
      function progress(b, chosen, wasHinted) {
        var id = b.item, it = ITEMS[id];
        if (it.k === 'foam' && b.k >= b.n) rinse(b);
        else drawZone(b, true);
        dabSound(id, b.k);
        sfx.scale(b.k);
        if (!RM) {
          anim(b.stylist, [{ transform: 'translateX(0)' }, { transform: 'translateX(' + (b.side ? -12 : 12) + '%)' }, { transform: 'translateX(0)' }], 120);
          fx.wiggle(friendOf(b));
        }
        glance(b, 'up', 1.2);
        if (chosen || (it.k === 'foam' && b.k === 1)) react(b, it.r, { id: id });
        // a bubble on the nose (sometimes, in the wash); a glitter sneeze (sometimes, once per board)
        if (it.k === 'foam' && b.k === 2 && b.k < b.n && roll('foamSneeze', 1 / 6)) foamSneeze(b);
        if (it.k === 'glitter' && b.k === 2 && !b.sneezed && roll('sneeze', 1 / 4)) glitterSneeze(b);
        checkLooks(b);
        events.push({ t: ctx.time, side: b.side, k: b.k });
        if (events.length > 200) events.shift();
        lastTap = wasHinted && b.el.contains(wasHinted) ? ctx.time - idleFor(b.side) + 1.5 : ctx.time;
        if (b.k >= b.n) finish(b, wasHinted);
      }
      function roll(name, p) { if (forced[name]) { delete forced[name]; return true; } return Math.random() < p; }

      /** The last dab of the wash: the mud and foam go, a splash, a shine. (One-dab wash: the foam shows first.) */
      function rinse(b) {
        b.mud = 0;
        if (b.n === 1) {
          drawZone(b, true, { foamAll: true });
          b.busyUntil = ctx.time + 0.25;
          var rid = ++b.rinseGen;
          ctx.after(250, function () { if (b.rinseGen === rid && zone === 'wash') rinseShow(b); });
          return;
        }
        rinseShow(b);
      }
      function rinseShow(b) {
        renderMud(b.F, 0);
        drawZone(b, true);
        S.rinse();
        burstAt(b.F.el, { emoji: '💦', count: 5, distance: 50, size: 18 });
        burstAt(b.F.el, { emoji: '✨', count: 6, distance: 60, size: 16 });
        b.glass.classList.remove('is-sweep');
        void b.glass.offsetWidth;
        b.glass.classList.add('is-sweep');
        showBubble(b, '😮');
        sfx.play('star');
      }

      /** This board's step is done: latched, once only. wasHinted: what the hand was on when the finishing tap came. */
      function finish(b, wasHinted) {
        if (b.done || state !== 'zone') return;
        b.done = true;
        b.k = b.n;
        b.el.classList.add('is-done');
        fx.pop(b.check);
        var wg = ++b.waveGen;
        b.el.classList.add('is-waving');
        ctx.after(1000, function () { if (b.waveGen === wg) b.el.classList.remove('is-waving'); });
        var it = ITEMS[b.item];
        if (b.reactAt !== ctx.time) react(b, it.r, { id: b.item });
        if (b.side === aSide && !seen(it.k)) { kit.seen.push(it.k); save(); }
        if (boards[0].done && boards[1].done) {
          if (zoneI >= zones.length - 1) finale();
          else admire();
        } else if (wasHinted && b.el.contains(wasHinted)) hintNext();   // it finished under the hand: the hand moves on at once
      }

      /** A done board, a different item: the look changes (free, as often as they like); it stays done. */
      function swap(b, id, itemEl) {
        if (ctx.time - b.swapAt < SWITCH_GAP) { tooSoon(b, itemEl); return; }
        b.swapAt = ctx.time;
        castOff(b, b.item);
        b.item = id;
        markOn(b);
        b.n = nOfBoard(b, ITEMS[id].k);
        b.k = b.n;
        drawZone(b, true);
        b.F.el.querySelectorAll('.mk-layer[data-zone="' + zone + '"] .mk-at').forEach(function (n) { n.classList.add('is-new'); });
        dabSound(id, 1);
        react(b, ITEMS[id].r, { id: id });
        checkLooks(b);
      }

      /** An item a board switches away from (once it had a dab) flies to the poodle, who wears it; else it puffs away. */
      function castOff(b, id) {
        var btn = itemBtn(b, id) || b.trayEl, pd = u.helpers.poodle ? helperEl('poodle') : null;
        if (!pd) { burstAt(btn, { count: 5, distance: 30, size: 8 }); sfx.play('pop'); return; }
        if (poodle.catches < 3) {
          poodle.catches++;
          poodle.wearing = id;
          fly(iconFor(id, players[b.side].color), btn, pd, { size: 22, ms: 450, done: function () { dressPoodle(id); S.yip(); if (!RM) fx.bounce(pd); } });
        } else {
          fly(iconFor(id, players[b.side].color), btn, pd, { size: 22, ms: 450, done: function () { burstAt(pd, { count: 5, distance: 24, size: 8 }); S.yip(); } });
        }
      }
      function dressPoodle(id) {
        var pd = helperEl('poodle'), slot = pd && pd.querySelector('.mk-pwear');
        if (!slot) return;
        slot.textContent = '';
        slot.dataset.kind = ITEMS[id].e ? 'e' : 'css';
        slot.appendChild(iconFor(id));
      }

      /* ---- the friend's life: bubbles, glances, blinks, reactions ---- */

      function showBubble(b, face, ms) {
        var g = ++b.bubbleGen;
        var st = b.bubble.querySelector('.mg-sticker');
        st.textContent = face;
        b.bubble.classList.remove('is-on');
        void b.bubble.offsetWidth;
        b.bubble.classList.add('is-on');
        ctx.after(ms || 1100, function () { if (b.bubbleGen === g) b.bubble.classList.remove('is-on'); });
        // the other friend looks across at this one
        var o = boards[1 - b.side];
        if (state !== 'admire') glance(o, 'in', 0.8);
      }
      /** The friend's eyes move: up and out to its stylist, or in, to the other friend. Plain position changes. */
      function glance(b, dir, sec) {
        var g = ++b.glanceGen, out = b.side ? 1 : -1, st = b.F.el.style;
        if (dir === 'up') { st.setProperty('--gx', (18 * out) + '%'); st.setProperty('--gy', '-14%'); }
        else { st.setProperty('--gx', (-18 * out) + '%'); st.setProperty('--gy', '0%'); }
        if (sec) ctx.after(sec * 1000, function () { if (b.glanceGen === g) { st.removeProperty('--gx'); st.removeProperty('--gy'); } });
      }
      function blink(b) {
        if (RM) return;
        ctx.after(util.randf(3000, 6000), function () {
          if (!b.F.el.isConnected || state === 'menu') return;
          b.F.el.classList.add('is-blink');
          ctx.after(150, function () { b.F.el.classList.remove('is-blink'); });
          blink(b);
        });
      }

      var BODY = {
        shy: [[{ transform: 'rotate(0)' }, { transform: 'rotate(8deg)' }, { transform: 'rotate(0)' }], 600],
        giggle: [[{ transform: 'rotate(0)' }, { transform: 'rotate(-6deg)' }, { transform: 'rotate(6deg)' }, { transform: 'rotate(-6deg)' }, { transform: 'rotate(6deg)' }, { transform: 'rotate(0)' }], 420],
        wow: null, love: null,
        cool: [[{ transform: 'translateY(0)' }, { transform: 'translateY(4%)' }, { transform: 'translateY(0)' }, { transform: 'translateY(4%)' }, { transform: 'translateY(0)' }], 420],
        silly: [[{ transform: 'translateX(0)' }, { transform: 'translateX(-5%)' }, { transform: 'translateX(5%)' }, { transform: 'translateX(-4%)' }, { transform: 'translateX(0)' }], 420],
        clown: [[{ transform: 'scale(1, 1)' }, { transform: 'scale(1.1, 0.9)' }, { transform: 'scale(0.96, 1.05)' }, { transform: 'scale(1, 1)' }], 360],
        roar: [[{ transform: 'translateX(0)' }, { transform: 'translateX(-4%)' }, { transform: 'translateX(4%)' }, { transform: 'translateX(-3%)' }, { transform: 'translateX(0)' }], 360],
        purr: [[{ transform: 'rotate(0)' }, { transform: 'rotate(-4deg)' }, { transform: 'rotate(4deg)' }, { transform: 'rotate(0)' }], 800],
        party: [[{ transform: 'translateY(0)' }, { transform: 'translateY(-12%)' }, { transform: 'translateY(0)' }], 360],
        alien: [[{ transform: 'rotate(0) scale(1)' }, { transform: 'rotate(-8deg) scale(1.04)' }, { transform: 'rotate(8deg) scale(0.97)' }, { transform: 'rotate(0) scale(1)' }], 500],
        sneeze: [[{ transform: 'translateY(0) scale(1)' }, { transform: 'translateY(-3%) scale(1.05)' }, { transform: 'translateY(4%) scale(0.95)' }, { transform: 'translateY(0) scale(1)' }], 380],
      };

      /** The friend's funny face: the bubble always (it carries everything under reduced motion), a move, a sound. */
      function react(b, r, o) {
        o = o || {};
        b.reactAt = ctx.time;
        var R = REACT[r] || REACT.giggle, face = o.face || R[0];
        if (r === 'silly' && (o.id === 'cream' || o.id === 'ears')) face = '😝';
        showBubble(b, face);
        var F = friendOf(b);
        if (!RM) {
          if (r === 'wow' || r === 'love') fx.bounce(F);
          else if (r === 'kiss') anim(F, [{ transform: 'translateX(0) rotate(0)' }, { transform: 'translateX(' + (b.side ? 6 : -6) + '%) rotate(' + (b.side ? 5 : -5) + 'deg)' }, { transform: 'translateX(0) rotate(0)' }], 500);
          else if (BODY[r]) anim(F, BODY[r][0], BODY[r][1]);
        }
        if (r === 'love') burstAt(F, { emoji: '💕', count: 4, distance: 50, size: 16 });
        if (r === 'clown') burstAt(F, { emoji: '🎈', count: 3, distance: 60, size: 18 });
        if (r === 'roar') burstAt(F, { emoji: '🐾', count: 4, distance: 50, size: 16 });
        if (r === 'star') burstAt(F, { emoji: '✨', count: 6, distance: 60, size: 16 });
        if (r === 'kiss') kissStylist(b);
        if (r === 'shy') { F.classList.add('is-flush'); ctx.after(600, function () { F.classList.remove('is-flush'); }); }
        if (!o.quiet) { (S[R[1]] || S.giggle)(); parrot(face); }
      }

      /** The parrot repeats a reaction now and then (at most once per 2.5s). */
      function parrot(face) {
        var pr = u.helpers.parrot ? helperEl('parrot') : null;
        if (!pr || ctx.time - parrotAt < 2.5) return;
        parrotAt = ctx.time;
        if (!RM) fx.bounce(pr);
        var bub = pr.querySelector('.mk-pbub');
        ctx.after(450, function () {
          S.rawk();
          if (!bub) return;
          bub.textContent = '';
          bub.appendChild(ctx.sticker(face));
          pr.classList.add('is-talking');
          ctx.after(800, function () { pr.classList.remove('is-talking'); });
        });
      }

      /* ---- marks on the stylists: kisses and glitter, for this round only ---- */

      var KISS_AT = [[26, 62], [74, 62], [50, 16]];
      var GLIT_AT = [[30, 30], [70, 34], [22, 54], [78, 50], [44, 78], [60, 70]];
      var marks = [{ kiss: 0, glitter: 0 }, { kiss: 0, glitter: 0 }];
      function renderMarks(s) {
        var b = boards[s], m = marks[s];
        b.marksEl.textContent = '';
        for (var i = 0; i < m.kiss; i++) b.marksEl.appendChild(el('span', { class: 'mk-kissmark', style: { left: KISS_AT[i][0] + '%', top: KISS_AT[i][1] + '%' } }, ctx.sticker('💋')));
        for (var j = 0; j < m.glitter; j++) b.marksEl.appendChild(el('i', { class: 'mk-glitmark', style: { left: GLIT_AT[j][0] + '%', top: GLIT_AT[j][1] + '%', background: j % 2 ? 'var(--berry)' : 'var(--sun)' } }));
      }
      function kissStylist(b) {
        if (marks[b.side].kiss < 3) marks[b.side].kiss++;
        fly('💋', b.F.el, b.stylist, { size: 20, ms: 450, done: function () { renderMarks(b.side); if (!RM) fx.pop(b.stylist); } });
      }
      function glitterMarks(s, n) { marks[s].glitter = Math.min(6, marks[s].glitter + n); renderMarks(s); }

      /* ---- surprises ---- */

      function foamSneeze(b) {
        var F = b.F;
        var bub = pieceEl(shp(SLOTS.nose, 7, 7, { bg: 'var(--mk-foam)', br: '50%', thin: true }), true);
        F.over.appendChild(bub);
        ctx.after(500, function () {
          S.sneeze();
          showBubble(b, '🤧');
          if (!RM) anim(F, BODY.sneeze[0], BODY.sneeze[1]);
          bub.remove();
        });
      }
      function glitterSneeze(b) {
        b.sneezed = true;
        var o = boards[1 - b.side], it = ITEMS[b.item];
        showBubble(b, '🤧');
        S.sneeze();
        if (!RM) anim(b.F.el, BODY.sneeze[0], BODY.sneeze[1]);
        // half of this dab's sparkles puff across onto the other friend for a moment (decoration only, never its look)
        var puff = el('span', { class: 'mk-puff' });
        [[34, 46], [60, 40], [46, 60]].forEach(function (p) { puff.appendChild(pieceEl(emo(p, it.e, 8))); });
        fly(it.e, b.F.el, o.F.el, { size: 22, ms: 500, done: function () {
          o.F.over.appendChild(puff);
          showBubble(o, '😮');
          ctx.after(2000, function () { puff.remove(); });
        } });
        glitterMarks(0, 3);
        glitterMarks(1, 3);
      }

      /* ---- secret looks ---- */

      function checkLooks(b) {
        LOOKS.forEach(function (L) {
          if (b.found.indexOf(L.id) >= 0) return;
          var ok = L.need.every(function (nd) { var id = b.look[nd[0]]; return id && nd[1].indexOf(id) >= 0; });
          if (ok) foundLook(b, L);
        });
      }
      function foundLook(b, L) {
        b.found.push(L.id);
        var fresh = kit.looks.indexOf(L.id) < 0;
        if (fresh) { kit.looks.push(L.id); save(); }
        var F = b.F.el;
        ctx.after(250, function () {
          showBubble(b, L.e, 1400);
          if (L.id === 'clown') { burstAt(F, { emoji: '🎈', count: 6, distance: 70, size: 18 }); S.honk(); ctx.after(300, S.honk); sfx.play('giggle'); }
          else if (L.id === 'tiger') { burstAt(F, { emoji: '🐾', count: 6, distance: 70, size: 18 }); S.growl(); }
          else if (L.id === 'hero') { burstAt(F, { emoji: '💥', count: 6, distance: 70, size: 18 }); sfx.play('whoosh'); S.fanfare(); }
          else if (L.id === 'royal') { burstAt(F, { emoji: '✨', count: 8, distance: 70, size: 18 }); S.fanfare(); }
          else if (L.id === 'spy') { burstAt(F, { emoji: '🔍', count: 4, distance: 60, size: 18 }); S.sneaky(); }
          else if (L.id === 'alien') { ufo(b); S.beep(); ctx.after(250, S.beep); }
          if (fresh) { sfx.play('boost'); var c = fx.centerOf(F); fx.burst(c.x, c.y, { count: 16, distance: 90 }); }
        });
        var badge = el('span', { class: 'mk-badge', 'data-id': L.id }, ctx.sticker(L.e));
        b.badges.appendChild(badge);
        if (fresh) ctx.after(400, function () { fly(L.e, badge, wallEl, { size: 24, ms: 500 }); });
      }
      function ufo(b) {
        var u0 = el('span', { class: 'mk-ufo' + (RM ? ' is-still' : '') }, ctx.sticker('🛸'));
        b.glass.appendChild(u0);
        ctx.after(RM ? 1400 : 1300, function () { u0.remove(); });
      }

      /* ---- tickles: taps on a done friend (and face taps while they admire) ---- */

      function tickle(b) {
        if (ctx.time - b.tickleAt < TICKLE_GAP) { press(b.sway); return; }
        b.tickleAt = ctx.time;
        var L = b.look, kindOf = function (z) { return L[z] ? ITEMS[L[z]].k : null; }, gags = [];
        if (kindOf('nose') === 'ball') gags.push('nose');
        if (kindOf('eyes') === 'googly') gags.push('googly');
        if (kindOf('mouth') === 'stache') gags.push('stache');
        if (kindOf('mouth') === 'lips') gags.push('lips');
        if (L.top === 'duck') gags.push('duck');
        if (L.top === 'antennae') gags.push('antennae');
        if (L.neck === 'cape') gags.push('cape');
        if (kindOf('eyes') === 'glasses' || kindOf('eyes') === 'mask') gags.push('cool');
        var g = gags.length ? gags[b.tickleI++ % gags.length] : 'giggle', F = b.F.el;
        var jiggle = function (sel, frames, ms) { F.querySelectorAll(sel).forEach(function (n) { anim(n, frames, ms); }); };
        if (g === 'nose') { S.honk(); jiggle('[data-zone="nose"] .mk-at', [{ transform: 'scale(1, 1)' }, { transform: 'scale(1.3, 0.7)' }, { transform: 'scale(1, 1)' }], 300); react(b, 'clown', { quiet: true }); }
        else if (g === 'googly') { sfx.play('boing'); F.querySelectorAll('.mk-googly').forEach(function (n) { n.classList.remove('is-spin'); void n.offsetWidth; n.classList.add('is-spin'); }); react(b, 'silly', { quiet: true }); }
        else if (g === 'stache') { S.twirl(); jiggle('[data-zone="mouth"] .mk-at', [{ transform: 'rotate(0)' }, { transform: 'rotate(-8deg)' }, { transform: 'rotate(8deg)' }, { transform: 'rotate(0)' }], 360); react(b, 'silly', { quiet: true }); }
        else if (g === 'lips') { S.mwah(); react(b, 'kiss', { quiet: true }); }
        else if (g === 'duck') { S.quack(); jiggle('[data-zone="top"] .mk-at', [{ transform: 'translateY(0)' }, { transform: 'translateY(-6em)' }, { transform: 'translateY(0)' }, { transform: 'translateY(-4em)' }, { transform: 'translateY(0)' }], 500); react(b, 'giggle', { quiet: true }); }
        else if (g === 'antennae') { S.beep(); jiggle('.mk-bob', [{ transform: 'translateY(0)' }, { transform: 'translateY(-3em)' }, { transform: 'translateY(0)' }], 300); react(b, 'alien', { quiet: true }); }
        else if (g === 'cape') { sfx.play('whoosh'); jiggle('.mk-cape', [{ transform: 'skewX(0)' }, { transform: 'skewX(-8deg)' }, { transform: 'skewX(6deg)' }, { transform: 'skewX(0)' }], 400); react(b, 'cool', { quiet: true }); }
        else if (g === 'cool') { S.cool(); react(b, 'cool', { quiet: true }); }
        else {
          sfx.play('giggle');
          if (!RM) fx.wiggle(F);
          var long = F.dataset.ears === 'long';
          F.querySelectorAll('.mk-ear').forEach(function (n, i) {
            var a = (long ? 30 : 10) * (i ? 1 : -1);
            anim(n, [{ transform: 'rotate(0)' }, { transform: 'rotate(' + a + 'deg)' }, { transform: 'rotate(0)' }, { transform: 'rotate(' + a + 'deg)' }, { transform: 'rotate(0)' }], 500);
          });
          showBubble(b, '😆');
        }
      }

      /* ---- admire: both are done ---- */

      function admire() {
        setState('admire');
        hint(null);
        var z = zoneI;
        boards.forEach(function (b) { b.items.forEach(function (n) { n.setAttribute('aria-disabled', 'true'); }); });
        later(150, function () {
          sfx.play('match');
          boards.forEach(function (b) {
            b.el.classList.add('is-admire');
            glance(b, 'in', 1.0);
            if (b.item) { var R = REACT[ITEMS[b.item].r] || REACT.giggle; showBubble(b, ITEMS[b.item].r === 'silly' && (b.item === 'cream' || b.item === 'ears') ? '😝' : R[0], 900); }
          });
          if (u.tier >= 1) { scene.classList.remove('is-flash'); void scene.offsetWidth; scene.classList.add('is-flash'); }
          if (u.helpers.radio) { var radio = helperEl('radio'); if (radio && !RM) fx.bounce(radio); S.jingle(z); }
        });
        later(900, function () {
          var p = stripEl.querySelector('.mk-pip[data-i="' + z + '"]');
          if (p) { p.classList.add('is-done'); p.classList.remove('is-now'); fx.pop(p); }
          boards.forEach(function (b) { b.trayEl.classList.add('is-away'); b.trayEl.classList.remove('is-up'); });
        });
        later(1150, function () {
          boards.forEach(function (b) { b.el.classList.remove('is-admire'); });
          scene.classList.remove('is-flash');
          startZone(z + 1);
        });
      }

      /* ---- the finale: the photo, the wall, a present ---- */

      function finale() {
        kit.done++;
        kit.played[partyId] = playedOf(partyId) + 1;
        var photo = photoOfRound();
        kit.photos.unshift(photo);
        kit.photos = kit.photos.slice(0, 8);
        save();
        var gift = giftFor(kit.done - 1), had = u;
        u = unlocks(kit.done);
        setState('finale');
        hint(null);
        booth = !!had.helpers.booth;
        renderPips();
        stripEl.querySelectorAll('.mk-pip').forEach(function (p) { p.classList.add('is-done'); p.classList.remove('is-now'); });
        boards.forEach(function (b) {
          b.items.forEach(function (n) { n.setAttribute('aria-disabled', 'true'); });
          b.trayEl.classList.add('is-away');
          b.trayEl.classList.remove('is-up');
          b.F.el.classList.add('is-whisk');     // the bib flicks (a whisk of the salon cape) and shows what is on the neck
          b.el.classList.add('is-waving');
        });
        sfx.play('whoosh');
        if (had.helpers.radio) { var radio = helperEl('radio'); if (radio && !RM) fx.bounce(radio); S.tune(); }
        // 3.8s in all, booth or not: the friends hop out (+0.15), 3-2-1 (+0.55), the posed photo (+1.15) holds 1.2s
        // (the booth's silly shot takes its second half), then it flies to the wall (+2.35) and a present opens (+2.85)
        var faces = buildFrame(photo);
        later(150, function () { swapHome(faces); });
        [0, 1, 2].forEach(function (j) {
          later(550 + 200 * j, function () {
            var bl = frameEl.querySelectorAll('.mk-flashbulb')[j];
            if (bl) bl.classList.add('is-lit');
            sfx.scale(4 + 2 * j);
            ctx.say(3 - j);
          });
        });
        later(1150, function () { flash(faces, photo); });
        if (booth) later(1750, function () { sillyShot(faces); });
        later(2350, function () { pinPhoto(); });
        later(2450, function () { dropGift(gift); });
        later(2850, function () { openGift(gift); });
        later(3000, function () { ctx.win('team', { emoji: party.e, delay: 800 }); });
      }

      /** The photo frame, drawn from the saved photo (so the wall later shows exactly this), poses hidden until the flash. */
      function buildFrame(photo) {
        frameEl.textContent = '';
        var f = photoFaces(photo, 'var(--m2)');
        var bubs = [el('span', { class: 'mk-fbub' }, ctx.sticker('😁')), el('span', { class: 'mk-fbub' }, ctx.sticker('😁'))];
        var slots = [el('span', { class: 'mk-fslot', 'data-side': 'l' }, f[0].el, bubs[0]), el('span', { class: 'mk-fslot', 'data-side': 'r' }, f[1].el, bubs[1])];
        var bulbs = el('span', { class: 'mk-flashbulbs' }, el('i', { class: 'mk-flashbulb' }), el('i', { class: 'mk-flashbulb' }), el('i', { class: 'mk-flashbulb' }));
        frameEl.appendChild(el('span', { class: 'mk-fshot' }, bgEl(photo.p, true), slots[0], slots[1], el('span', { class: 'mk-flash' })));
        frameEl.appendChild(bulbs);
        frameEl.classList.remove('is-posed', 'is-out', 'is-booth', 'is-landed');
        return { F: f, slots: slots, bubs: bubs };
      }
      function swapHome(faces) {
        frameEl.hidden = false;
        scene.classList.add('is-finale');
        void frameEl.offsetWidth;
        frameEl.classList.add('is-in');
        // each friend hops out of its mirror and crosses to its owner's side of the photo (clones; decoration only)
        var rr = root.getBoundingClientRect();
        boards.forEach(function (b) {
          var src = b.F.el, slot = faces.slots[b.side === 0 ? 1 : 0];
          var a = src.getBoundingClientRect(), t = slot.firstChild.getBoundingClientRect();
          src.style.visibility = 'hidden';
          if (RM || !a.width) return;
          var c = src.cloneNode(true);
          c.classList.add('mk-clone');
          c.style.visibility = '';
          c.style.left = (a.left - rr.left) + 'px';
          c.style.top = (a.top - rr.top) + 'px';
          root.appendChild(c);
          var dx = t.left - a.left, dy = t.top - a.top, sc = t.width / a.width;
          if (c.animate) c.animate([
            { transform: 'translate(0, 0) scale(1)' },
            { transform: 'translate(' + dx * 0.5 + 'px, ' + (dy * 0.5 - 60) + 'px) scale(' + (1 + sc) / 2 + ')', offset: 0.5 },
            { transform: 'translate(' + dx + 'px, ' + dy + 'px) scale(' + sc + ')' },
          ], { duration: 600, easing: 'ease-in-out', fill: 'forwards' });
          ctx.after(600, function () { c.remove(); });
        });
        sfx.play('hop');
        ctx.after(RM ? 0 : 600, function () { frameEl.classList.add('is-landed'); });
      }
      function flash(faces, photo) {
        var fl = frameEl.querySelector('.mk-flash');
        if (fl && fl.animate) fl.animate(RM ? [{ opacity: 0.4 }, { opacity: 0 }] : [{ opacity: 0.7 }, { opacity: 0 }], { duration: RM ? 150 : 300, fill: 'forwards' });
        S.shutter();
        frameEl.classList.add('is-posed');
        faces.bubs.forEach(function (b, i) {
          var got = i === 0 ? photo.r.o : photo.l.o;
          b.firstChild.textContent = got === 'ears' ? '😝' : '😁';
          b.classList.add('is-on');
        });
        var shot = frameEl.querySelector('.mk-fshot');
        party.deco.forEach(function (e) { burstAt(shot, { emoji: e, count: 3, distance: 90, size: 20 }); });
        if (photo.l.o === 'kiss' || photo.r.o === 'kiss') S.mwah();
        if (photo.l.o === 'ears' || photo.r.o === 'ears') sfx.play('giggle');
      }
      function sillyShot(faces) {
        var fl = frameEl.querySelector('.mk-flash');
        if (fl && fl.animate) fl.animate([{ opacity: RM ? 0.4 : 0.6 }, { opacity: 0 }], { duration: RM ? 150 : 300, fill: 'forwards' });
        S.shutter();
        frameEl.classList.add('is-booth');
        faces.bubs[0].firstChild.textContent = '🤪';
        faces.bubs[1].firstChild.textContent = '😝';
        sfx.play('giggle');
      }
      /** The photo shrinks onto the front of the wall's photo row and pins on. */
      function pinPhoto() {
        buildPhotos();
        fit();
        var first = photosEl.querySelector('.mk-polaroid');
        if (!first) return;
        first.classList.add('is-pinning');
        var a = frameEl.getBoundingClientRect(), t = first.getBoundingClientRect();
        if (!RM && frameEl.animate && a.width) {
          var dx = (t.left + t.width / 2) - (a.left + a.width / 2), dy = (t.top + t.height / 2) - (a.top + a.height / 2);
          frameEl.animate([{ transform: 'translate(-50%, -50%)' }, { transform: 'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + dy + 'px)) scale(' + (t.width / a.width) + ')', opacity: 0.6 }], { duration: 300, easing: 'ease-in', fill: 'forwards' });
        }
        ctx.after(RM ? 0 : 300, function () {
          frameEl.hidden = true;
          first.classList.remove('is-pinning');
          if (!RM) fx.pop(first);
          sfx.play('drop');
          // the photo is taken: the friends hop back into their mirrors, so the room is never left empty
          boards.forEach(function (b) { b.F.el.style.visibility = ''; if (!RM) fx.bounce(b.sway); });
        });
      }
      function dropGift(gift) {
        giftEl.textContent = '';
        giftEl.appendChild(el('span', { class: 'mk-gift__box' }, ctx.sticker('🎁')));
        giftEl.appendChild(el('span', { class: 'mk-gift__in' }, giftFace(gift)));
        giftEl.classList.remove('is-open');
        giftEl.hidden = false;
        sfx.play('drop');
      }
      function openGift(gift) {
        giftEl.classList.add('is-open');
        sfx.play('star');
        burstAt(giftEl, { emoji: '✨', count: 10, distance: 90, size: 22 });
        // what the present brings is there at once, behind it
        if (gift.kind === 'helper' || gift.kind === 'decor' || gift.kind === 'tier') {
          buildWall(); fit();
          if (gift.kind === 'helper') { var hp = helperEl(gift.id); if (hp) fx.bounce(hp); }
        }
        buildMenu();
      }
      function giftFace(g) {
        if (g.kind === 'party') return el('span', { class: 'mk-minicard' }, bgEl(g.id, false), ctx.sticker(g.e), el('span', { class: 'mk-minicard__new' }, ctx.sticker('✨')));
        if (g.kind === 'medal') return el('span', { class: 'mk-medal' }, ctx.sticker(g.e), el('span', { class: 'mk-medal__m' }, ctx.sticker('🏅')));
        if (g.kind === 'tier' && g.n === 3) return el('span', { class: 'mk-signgift' }, ctx.sticker(players[0].emoji), ctx.sticker('⭐'), ctx.sticker(players[1].emoji));
        return ctx.sticker(g.e);
      }

      /* ---- the wall: taps there only ever cheer ---- */

      function onWall(ev) {
        lastHinted = null;
        var t = ev.target && ev.target.closest ? ev.target : wallEl;
        if (ctx.time - wallAt < 0.15) { press(t.closest('.mk-helper, .mk-polaroid, .mk-pip') || wallEl); return; }
        wallAt = ctx.time;
        var hp = t.closest('.mk-helper');
        if (hp) {
          if (!RM) fx.bounce(hp);
          var k = hp.dataset.h;
          if (k === 'poodle') S.yip(); else if (k === 'parrot') S.rawk(); else if (k === 'radio') sfx.scale(util.rand(8) + 3); else S.shutter();
          return;
        }
        var ph = t.closest('.mk-polaroid');
        if (ph) { fx.wiggle(ph); sfx.play('flip'); return; }
        var pip = t.closest('.mk-pip');
        if (pip) { fx.wiggle(pip); sfx.play('tick'); return; }
        sfx.play('pop', { pitch: 600 + 60 * (wallC++ % 8) });
        var dec = t.closest('.mk-dec, .mk-vase, .mk-mq-pet');
        if (dec) fx.wiggle(dec);
      }

      /* ---- input ---- */

      ctx.tap(cardsEl, function (ev, card) {
        lastHinted = null;
        menuTap = ctx.time;
        pick(card.dataset.id, card);
      }, { delegate: '.mk-card', slop: 16 });
      // the next party is not a button: a tap only wiggles its present
      ctx.tap(nextEl, function () { lastHinted = null; menuTap = ctx.time; fx.wiggle(nextEl.querySelector('.mk-next__tag')); sfx.play('flip'); });
      ctx.tap(bookEl, function (ev) {
        lastHinted = null;
        menuTap = ctx.time;
        if (ctx.time - bookAt < 0.15) return;
        bookAt = ctx.time;
        var slot = ev.target && ev.target.closest ? ev.target.closest('.mk-lookslot') : null;
        if (slot) fx.wiggle(slot);
        sfx.play('pop');
      });
      boards.forEach(function (b) { ctx.tap(b.el, function (ev) { onBoard(b.side, ev); }); });
      ctx.tap(wallEl, onWall);

      function save() {
        try { ctx.save('makeup', { v: 1, done: kit.done, played: kit.played, looks: kit.looks, seen: kit.seen, photos: kit.photos }); } catch (e) { /* storage may be unavailable */ }
      }

      /* ---- the quiet ghost hand ---- */

      ctx.every(200, function () {
        if (lastHinted) return;
        if (state === 'menu') { if (ctx.time - menuTap > (kit.done ? 4 : 0.6)) hintNext(); return; }
        if (state !== 'zone') return;
        var s = handSideNow();
        if (s >= 0 && ctx.time - lastTap > idleFor(s)) hintNext();
      });

      /* ---- go ---- */

      scene.appendChild(frameEl);
      scene.appendChild(giftEl);
      buildMenu();
      buildWall();
      fit();
      ctx.onResize(fit);
      ctx.setTurn(ctx.firstPlayer, { lock: 0 });      // who chooses: only a suggestion (anyone may tap), and no lock
      save();

      ctx.expose({
        get state() { return state; },
        get party() { return partyId; },
        get zone() { return zone; },
        get zoneIndex() { return zoneI; },
        get zones() { return zones.slice(); },
        get aSide() { return aSide; },
        /** The element the ghost hand last pointed at (tests follow it). */
        get hinted() { return lastHinted; },
        get boards() {
          return boards.map(function (b) {
            return { side: b.side, item: b.item, k: b.k, n: b.n, done: b.done, tray: b.tray.slice(), look: JSON.parse(JSON.stringify(b.look)), pose: b.pose,
              found: b.found.slice(), noPick: b.noPick, sneezed: b.sneezed };
          });
        },
        get kit() { return JSON.parse(JSON.stringify(kit)); },
        get unlocked() { return JSON.parse(JSON.stringify(u)); },
        get poodle() { return { earned: !!u.helpers.poodle, wearing: poodle.wearing, catches: poodle.catches }; },
        get marks() { return marks.map(function (m) { return { kiss: m.kiss, glitter: m.glitter }; }); },
        get mud() { return boards.map(function (b) { return b.mud; }); },
        get locked() { return ctx.locked; },
        get events() { return events.slice(); },
        hintNext: hintNext,
        start: function (id) { pick(id, cardsEl.querySelector('.mk-card[data-id="' + id + '"]')); },
        setKit: function (raw) {
          if (state !== 'menu') return false;
          kit = cleanMakeup(raw); u = unlocks(kit.done); save();
          buildMenu(); buildWall(); fit();
          hint(null); menuTap = ctx.time;
          return true;
        },
        setTray: function (side, ids) {
          var b = boards[side];
          if (state !== 'zone' || !b || b.k > 0 || b.done || !Array.isArray(ids) || !ids.every(function (id) { return ITEMS[id] && ITEMS[id].z === zone; })) return false;
          b.tray = ids.slice();
          b.item = zone === 'wash' ? 'sponge' : null;
          buildTray(b);
          return true;
        },
        /** Force the next surprise roll(s): {sneeze, foamSneeze}. */
        surprise: function (o) { Object.keys(o || {}).forEach(function (k) { if (o[k]) forced[k] = true; else delete forced[k]; }); },
        renderFace: function (e, look, size, bib, o) { return renderFace(e, look, size, bib, o).el; },
        cleanMakeup: cleanMakeup,
        unlocks: unlocks,
        giftFor: giftFor,
        nFor: nFor,
        zonesFor: zonesFor,
        trayFor: trayFor,
        foamed: foamed,
        piecesFor: piecesFor,
        ITEMS: ITEMS,
        PARTIES: PARTIES,
        MENU: MENU,
        START: START,
        LOOKS: LOOKS,
        KINDS: KINDS,
        ANIMALS: ANIMALS,
        SLOTS: SLOTS,
        POSES: POSES,
        ZONES: ZONES,
        GIFTS: GIFTS.length,
        tuning: { GAP: GAP, SWITCH_GAP: SWITCH_GAP, DABS: DABS, TICKLE_GAP: TICKLE_GAP, CHEER_GAP: CHEER_GAP },
      });

      return function cleanup() { save(); };
    },
  });
})();
