/* Acorn Quest — a side-scrolling adventure for two, in five stages.
 *
 * Both heroes run, jump, bop critters by landing on them, collect acorns and
 * find the three hidden stars in each stage, and get home to the tree house
 * at the end. Stand on your buddy's head and jump for a super jump: some
 * stars can only be reached that way. A spring bounces you high; a button
 * opens a gate; a key opens the cave door; rafts and lifts carry you.
 *
 * Nobody ever loses. Falling into a pit or the water floats you back to your
 * buddy in a bubble; bumping into a critter just makes you dizzy for a
 * moment. Clearing a stage opens the next one on the map.
 *
 * Controls, one set on each player's side: the grown-up gets left, right and
 * jump; a little player (with help on) gets one big jump button and her hero
 * runs after the grown-up's by itself. The grown-up can give both players
 * full controls in the pause menu. Keyboard too: A D W and the arrow keys.
 *
 * Units are tiles (x right, y down); a hero's (x, y) is the middle of its feet.
 * state: map -> play -> clear -> (party)
 */
(function () {
  'use strict';

  /* ---------------------------------------------------------- tuning */

  var GRAV = 38, JUMP = 13.2, BOOST = 1.3, SPRING = 19, BOP = 11;
  var WALK = 5.4, FOLLOW = 5.1, AIR = 0.8;
  var COYOTE = 0.1, BUFFER = 0.14;
  var HERO_W = 0.72, HERO_H = 0.92;
  var ROWS = 12;

  /* ---------------------------------------------------------- the stages
   * Each stage is a row of chunks. A chunk is drawn bottom-up: its last line
   * is the bottom row of the stage (row 11), and anything missing above is sky.
   *   . sky      # ground     = block      - branch/cloud (stand on top, jump up through)
   *   ~ pit / water          o acorn      * star        S spring
   *   K key      D door (a full-height wall until someone with the key touches it)
   *   B button   G gate (a full-height wall until anyone stands on the button)
   *   M raft (3 wide, sails right to the far bank and back)   V lift (3 wide, up 4 and back)
   *   e snail  l ladybird  f frog  z bee  v bat     P start   H home   u the baby bird (home, last stage)
   */
  var CHUNKS = {
    start: ['...........', '...........', '...........', '....P......', '###########', '###########'],
    walk: ['..........', '...o.o....', '..........', '.o.....o..', '##########', '##########'],
    gap2: ['.........', '....o....', '...o.o...', '.........', '###~~####', '###~~####'],
    gap3: ['..........', '.....o....', '....o.o...', '..........', '###~~~####', '###~~~####'],
    snail: ['............', '............', '............', '.......e....', '############', '############'],
    snails: ['..............', '..............', '..............', '...e......e...', '##############', '##############'],
    hill: ['......*.....', '.....oo.....', '............', '....====....', '############', '############'],
    branchStar: ['............', '.....*......', '............', '....----....', '............', '............', '############', '############'],
    springStar: ['..........', '....*.....', '..........', '..........', '..........', '....S.....', '##########', '##########'],
    end: ['..........', '..........', '..........', '.....H....', '##########', '##########'],

    branches: ['..............', '........ooo...', '.......-----..', '..ooo.........', '.-----........', '##############', '##############'],
    ladybird: ['............', '............', '............', '......l.....', '############', '############'],
    ladybirds: ['................', '................', '................', '...l.......l....', '################', '################'],
    treeStar: ['............', '....*.......', '...---......', '............', '......---...', '............', '..---.......', '............', '############', '############'],
    gate: ['................', '................', '................', '................', '................', '................',
      '...*............', '................', '................', '...B.......G....', '################', '################'],
    stackStar: ['..........', '..........', '.......*..', '.....=====', '..........', '..........', '##########', '##########'],

    frog: ['............', '............', '............', '.......f....', '############', '############'],
    frogs: ['................', '................', '................', '....f......f....', '################', '################'],
    lily: ['.............', '....o..o..o..', '.............', '.............', '##~=~~=~~=~##', '##~~~~~~~~~##'],
    raft: ['........*.......', '.....o..o..o....', '................', '................', '##M~~~~~~~~~~~##', '##~~~~~~~~~~~~##'],
    pondStar: ['...........', '.....*.....', '...........', '...........', '###~~=~~###', '###~~~~~###'],

    clouds: ['................', '.........o......', '........---.....', '.....o..........', '....---.........', '###~~~~~~~~~~###', '###~~~~~~~~~~###'],
    springUp: ['...*........', '......ooo...', '.....-----..', '............', '............', '...S........', '############', '############'],
    bees: ['................', '......z.........', '................', '................', '################', '################'],
    lift: ['............', '.........*..', '.......=====', '............', '............', '............', '###V~~######', '###~~~######'],
    cloudStar: ['..........', '..........', '.......*..', '.....-----', '..........', '..........', '##########', '##########'],

    bats: ['..............', '.....v........', '..............', '..............', '##############', '##############'],
    batsTwo: ['................', '....v......v....', '................', '................', '################', '################'],
    keyDoor: ['...*................', '...K................', '..===...............', '....................', '....................',
      '......S......D......', '####################', '####################'],
    caveStar: ['..........', '..........', '..*.......', '.====.....', '..........', '..........', '##########', '##########'],
    rescue: ['..........', '..........', '..........', '.....u....', '##########', '##########'],
  };

  var STAGES = [
    { name: 'Sunny Meadow', icon: '🌼', theme: 'meadow', chunks: ['start', 'walk', 'gap2', 'snail', 'walk', 'hill', 'gap2', 'branchStar', 'snails', 'springStar', 'gap3', 'walk', 'end'] },
    { name: 'Whispering Woods', icon: '🌲', theme: 'woods', chunks: ['start', 'branches', 'ladybird', 'treeStar', 'gap2', 'gate', 'ladybirds', 'branches', 'stackStar', 'gap3', 'snails', 'end'] },
    { name: 'Lily Pond', icon: '🐸', theme: 'pond', chunks: ['start', 'frog', 'lily', 'walk', 'raft', 'frogs', 'pondStar', 'walk', 'lily', 'stackStar', 'end'] },
    { name: 'Cloud Hop', icon: '☁️', theme: 'sky', chunks: ['start', 'clouds', 'springUp', 'bees', 'lift', 'clouds', 'cloudStar', 'bees', 'gap3', 'end'] },
    { name: 'Crystal Cave', icon: '💎', theme: 'cave', chunks: ['start', 'bats', 'walk', 'gap2', 'keyDoor', 'caveStar', 'batsTwo', 'gap3', 'walk', 'stackStar', 'bats', 'rescue'] },
  ];

  /* Each stage's look. Colours for the day; at night (dark mode) the same, a shade darker, under a starry sky.
   *   far / nearKind: the two background layers.  decor: things standing on the stage's ground.
   *   block / ledge / pit: how '=', '-' and '~' look.   life: what drifts about (and at night). */
  var THEMES = {
    meadow: {
      skyTop: '#7CCBFF', skyBottom: '#D9F3FF', nightTop: '#141C48', nightBottom: '#33417E', sun: true, clouds: true, cloudShade: '#D3E6F7',
      far: 'hills', hillBack: '#A8DCA0', hillFront: '#7FC877', nearKind: 'trees', near: '#5DAF5A',
      grass: '#7ED957', grassLight: '#B5F07F', grassDark: '#4FA63A', blades: true,
      dirt: '#C08A52', dirtDeep: '#A06F3E', dirtStripe: '#AD7843', pebble: '#E3B884',
      block: 'bevel', blockColor: '#F2B35E', ledge: 'plank', plank: '#C98A4B', pit: 'hole', holeTop: '#5C3A1E', hole: '#3E2612',
      leaf: '#7ED957', leafDark: '#4FA63A', decor: ['tree', 'bush', 'flowers', 'flowers', 'fence', 'bush'],
      life: 'butterfly', lifeNight: 'firefly',
    },
    woods: {
      skyTop: '#9ED9C0', skyBottom: '#E3F7E4', nightTop: '#0E2420', nightBottom: '#24463A', sun: true, clouds: true, cloudShade: '#D2EAD8',
      far: 'pines', hillBack: '#8CC79A', hillFront: '#5FA772', nearKind: 'pines', near: '#3F8B57',
      grass: '#5DBB4A', grassLight: '#9BE07A', grassDark: '#3D8C33', blades: true,
      dirt: '#8A5E3A', dirtDeep: '#6E4A2D', dirtStripe: '#7A5232', pebble: '#B98A5E',
      block: 'bevel', blockColor: '#B08158', ledge: 'plank', plank: '#9A6436', pit: 'hole', holeTop: '#3E2814', hole: '#2A1A0C',
      leaf: '#4FB34A', leafDark: '#2F7F35', decor: ['pine', 'tree', 'stump', 'fern', 'fern', 'bush'],
      life: 'leaf', lifeNight: 'firefly',
    },
    pond: {
      skyTop: '#86D6F2', skyBottom: '#E2FAFB', nightTop: '#0D2340', nightBottom: '#21496A', sun: true, clouds: true, cloudShade: '#D0ECF2',
      far: 'hills', hillBack: '#B4E3B0', hillFront: '#8ACF86', nearKind: 'reeds', near: '#5DAA62',
      grass: '#7FD36A', grassLight: '#BBF29A', grassDark: '#4E9E44', blades: true,
      dirt: '#A98058', dirtDeep: '#8A6644', dirtStripe: '#977049', pebble: '#D7B48A',
      block: 'lily', blockColor: '#6CCB4E', ledge: 'plank', plank: '#B07A46', pit: 'water', water: '#4FB0E8',
      leaf: '#6CCB4E', leafDark: '#3E8F3C', decor: ['reeds', 'cattail', 'flowers', 'bush', 'cattail'],
      life: 'dragonfly', lifeNight: 'firefly',
    },
    sky: {
      skyTop: '#FFB9DA', skyBottom: '#FFF1D9', nightTop: '#1E1748', nightBottom: '#4A3C86', sun: true, clouds: true, cloudShade: '#F2DDF2',
      far: 'islands', hillBack: '#E8DCFF', hillFront: '#D6C6FF', nearKind: 'clouds', near: '#FFFFFF',
      grass: '#FFFFFF', grassLight: '#FFFFFF', grassDark: '#E3D8FF', puffs: true,
      dirt: '#EDE6FF', dirtDeep: '#DCD0FA', dirtStripe: '#E2D8FC', pebble: '#FFFFFF',
      block: 'cloud', blockColor: '#F3E9FF', ledge: 'cloud', plank: '#FFFFFF', pit: 'none',
      leaf: '#FFB3D1', leafDark: '#F28DB8', decor: ['cloudpuff', 'flowers', 'cloudpuff'],
      life: 'twinkle', lifeNight: 'twinkle',
    },
    cave: {
      skyTop: '#2E2A5E', skyBottom: '#4B4488', nightTop: '#16132E', nightBottom: '#2C2758', sun: false, clouds: false, ceiling: true,
      far: 'cave', hillBack: '#3C3672', hillFront: '#4A4386', nearKind: 'rocks', near: '#3A3470',
      grass: '#9C94D6', grassLight: '#C6BFF5', grassDark: '#6F67AE', blades: false,
      dirt: '#5E5896', dirtDeep: '#4A447E', dirtStripe: '#544E8A', pebble: '#7F78BD',
      block: 'crystal', blockColor: '#8F86CF', ledge: 'crystal', plank: '#B79CFF', pit: 'hole', holeTop: '#1C1838', hole: '#110E24',
      leaf: '#9BF0FF', leafDark: '#6FC9E0', decor: ['crystals', 'mushglow', 'crystals', 'mushglow'],
      life: 'firefly', lifeNight: 'firefly',
    },
  };

  /* Hats: a star total unlocks each one, for both players. */
  var HATS = [
    { id: 'none', e: '', need: 0 },
    { id: 'bow', e: '🎀', need: 1 },
    { id: 'cap', e: '🧢', need: 3 },
    { id: 'flower', e: '🌸', need: 5 },
    { id: 'tophat', e: '🎩', need: 8 },
    { id: 'crown', e: '👑', need: 12 },
  ];

  /* ---------------------------------------------------------- pure rules */

  /** Saved progress, checked: {cleared: whole stages done in a row, done: [bool], stars: [0..3], hats: [hat per player]}.
   *  Anything odd is repaired; a hat not yet earned is taken off. */
  function cleanProgress(p) {
    var n = STAGES.length, out = { cleared: 0, done: [], stars: [], hats: [0, 0] };
    if (!p || typeof p !== 'object') p = {};
    var cleared = Math.floor(Number(p.cleared));
    cleared = isFinite(cleared) ? Math.max(0, Math.min(n, cleared)) : 0;
    for (var i = 0; i < n; i++) {
      out.done[i] = !!(Array.isArray(p.done) && p.done[i]) || i < cleared;
      var s = Array.isArray(p.stars) ? Math.floor(Number(p.stars[i])) : 0;
      out.stars[i] = isFinite(s) ? Math.max(0, Math.min(3, s)) : 0;
    }
    while (out.cleared < n && out.done[out.cleared]) out.cleared++;
    var total = starTotal(out);
    for (var h = 0; h < 2; h++) {
      var k = Array.isArray(p.hats) ? Math.floor(Number(p.hats[h])) : 0;
      out.hats[h] = isFinite(k) && k > 0 && k < HATS.length && HATS[k].need <= total ? k : 0;
    }
    return out;
  }

  function starTotal(p) { return p.stars.reduce(function (a, b) { return a + b; }, 0); }

  /** The next hat along from hat k that `total` stars have earned (back to no hat after the last). */
  function nextHat(k, total) {
    for (var j = 1; j <= HATS.length; j++) {
      var n = (k + j) % HATS.length;
      if (HATS[n].need <= total) return n;
    }
    return 0;
  }

  /** Lay a stage out: {w, h, grid: [row][col] chars, things: [{kind, x, y}], start: {x, y}}. */
  function buildStage(def) {
    var cols = 0, rows = [];
    for (var r = 0; r < ROWS; r++) rows.push('');
    def.chunks.forEach(function (name) {
      var c = CHUNKS[name];
      if (!c) throw new Error('no chunk ' + name);
      var w = c[0].length;
      c.forEach(function (line) { if (line.length !== w) throw new Error('chunk ' + name + ' is ragged'); });
      for (var r2 = 0; r2 < ROWS; r2++) {
        var k = r2 - (ROWS - c.length);
        rows[r2] += k >= 0 ? c[k] : new Array(w + 1).join('.');
      }
      cols += w;
    });
    var grid = [], things = [], start = { x: 1.5, y: 10 };
    for (var y = 0; y < ROWS; y++) {
      var line = [];
      for (var x = 0; x < cols; x++) {
        var ch = rows[y][x];
        var keep = '.';
        if ('#=-~'.indexOf(ch) >= 0) keep = ch;
        else if (ch === 'P') start = { x: x + 0.5, y: y + 1 };
        else if (ch === 'M' || ch === 'V') { things.push({ kind: ch === 'M' ? 'raft' : 'lift', x: x, y: y }); keep = '~'; }
        else if (ch !== '.') things.push({ kind: ch, x: x, y: y });
        line.push(keep);
      }
      grid.push(line);
    }
    return { w: cols, h: ROWS, grid: grid, things: things, start: start };
  }

  MG.registerGame({
    id: 'quest',
    name: 'Acorn Quest',
    emoji: '🌰',
    color: 'tangerine',
    howTo: 'An adventure for two in five stages. Run and jump to the tree house at the end; bop critters by landing on them; collect acorns and find the three hidden stars in each stage. Stand on your buddy\'s head and jump for a super jump. Falling in only floats you back in a bubble. The little one\'s hero runs after the grown-up\'s by itself: she just jumps (change it in this menu).',
    options: [
      { key: 'little', label: 'The little one', default: 'follow', choices: [{ value: 'follow', label: 'Just jumps', emoji: '⬆️' }, { value: 'full', label: 'Steers too', emoji: '🎮' }] },
      { key: 'stages', label: 'Stages', default: 'earned', choices: [{ value: 'earned', label: 'One by one', emoji: '🔒' }, { value: 'all', label: 'All open', emoji: '🔓' }] },
    ],

    mount: function (root, ctx) {
      var el = ctx.el, sfx = ctx.sfx, fx = ctx.fx, util = ctx.util;
      var players = ctx.players;

      var progress = cleanProgress(ctx.load('progress', null));
      var allOpen = ctx.opt('stages') === 'all';

      var littleIdx = players[0].little !== players[1].little ? (players[0].little ? 0 : 1) : -1;
      var followIdx = littleIdx >= 0 && ctx.help >= 1 && ctx.opt('little') !== 'full' ? littleIdx : -1;

      var state = 'map';
      var stage = null, stageNo = -1;
      var heroes = [], critters = [], items = [], movers = [];
      var acorns = 0, stars = 0;
      var cam = { x: 0, y: 0 }, view = { w: 12, h: 12, tile: 32, px: 300, py: 300 };
      var gateOpen = false, doorOpen = false, hasKey = false;
      var dark = false;
      var still = !!MG.reducedMotion;     // reduced motion: the clouds, water and little creatures hold still
      var keysDown = {};
      var hintAt = -10;

      /* ---- build: the map screen, the play screen, the controls ---- */

      var canvas = el('canvas', { class: 'aq-canvas', 'aria-hidden': 'true' });
      var pen = canvas.getContext('2d');
      var playEl = el('div', { class: 'aq-play', hidden: true }, canvas);
      var mapNodes = STAGES.map(function (s, i) {
        var starRow = el('span', { class: 'aq-node__stars' });
        var btn = el('button', { type: 'button', class: 'aq-node', 'data-i': String(i), 'aria-label': s.name },
          el('span', { class: 'aq-node__icon', 'aria-hidden': 'true' }, ctx.sticker(s.icon)), starRow);
        return { btn: btn, stars: starRow };
      });
      var mapEl = el('div', { class: 'aq-map' }, el('div', { class: 'aq-path', 'aria-hidden': 'true' }), mapNodes.map(function (n) { return n.btn; }));
      // the hat closets: each player taps theirs to try on the hats their stars have earned
      var closets = players.map(function (p, i) {
        var hat = el('span', { class: 'aq-closet__hat', 'aria-hidden': 'true' });
        var btn = el('button', { type: 'button', class: 'aq-closet', 'data-p': String(i), 'aria-label': 'Hat', style: { '--c': p.color, '--c-dark': p.dark } },
          el('span', { class: 'aq-closet__face', 'aria-hidden': 'true' }, ctx.sticker(p.emoji)), hat);
        mapEl.appendChild(btn);
        return { btn: btn, hat: hat };
      });
      var nextUp = el('div', { class: 'aq-nexthat', 'aria-hidden': 'true' });
      mapEl.appendChild(nextUp);
      var scene = el('div', { class: 'aq-scene' }, mapEl, playEl);
      root.appendChild(scene);

      /* each player's controls, on their own side */
      var pads = players.map(function (p, i) {
        var easy = i === followIdx;
        var node = el('div', { class: 'aq-pad' + (easy ? ' is-easy' : ''), 'data-p': String(i), style: { '--c': p.color, '--c-dark': p.dark, '--c-soft': p.soft } });
        var keys = {};
        if (easy) {
          keys.jump = el('button', { type: 'button', class: 'aq-key aq-key--big', 'data-k': 'jump', 'aria-label': 'Jump' }, el('span', { class: 'aq-key__face' }, ctx.sticker(p.emoji)), el('span', { class: 'aq-key__arrow', 'aria-hidden': 'true' }, el('span', { class: 'aq-tri', 'data-dir': 'up' })));
          node.appendChild(keys.jump);
        } else {
          // the arrows are drawn shapes, not characters: some phones turn ▶ into a picture
          keys.left = el('button', { type: 'button', class: 'aq-key', 'data-k': 'left', 'aria-label': 'Left' }, el('span', { class: 'aq-tri', 'data-dir': 'left' }));
          keys.right = el('button', { type: 'button', class: 'aq-key', 'data-k': 'right', 'aria-label': 'Right' }, el('span', { class: 'aq-tri', 'data-dir': 'right' }));
          keys.jump = el('button', { type: 'button', class: 'aq-key aq-key--jump', 'data-k': 'jump', 'aria-label': 'Jump' }, el('span', { class: 'aq-tri', 'data-dir': 'up' }));
          node.appendChild(el('div', { class: 'aq-pad__move' }, keys.left, keys.right));
          node.appendChild(keys.jump);
        }
        playEl.appendChild(node);
        return { node: node, keys: keys, held: {}, pointers: {} };
      });

      /** The canvas needs real colours, not CSS variables: each player's colours, as the page shows them now. */
      var paint = [];
      function resolveColours() {
        var probe = el('span', { style: { display: 'none' } });
        root.appendChild(probe);
        paint = players.map(function (p) {
          probe.style.color = p.color; var c = getComputedStyle(probe).color;
          probe.style.color = p.dark; var d = getComputedStyle(probe).color;
          return { color: c, dark: d };
        });
        probe.remove();
      }

      function isDark() {
        var t = document.documentElement.getAttribute('data-theme');
        if (t === 'dark') return true;
        if (t === 'light') return false;
        return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
      }

      /* ---- sizing ---- */

      function fit() {
        var r = playEl.getBoundingClientRect();
        if (!r.width || !r.height) return;
        var dpr = Math.min(2, window.devicePixelRatio || 1);
        canvas.width = Math.round(r.width * dpr);
        canvas.height = Math.round(r.height * dpr);
        pen.setTransform(dpr, 0, 0, dpr, 0, 0);
        var portrait = r.height > r.width;
        // portrait: the whole stage height shows, with the controls underneath; landscape: about ten rows, following the heroes
        // the controls take the bottom of the screen: the camera may look that far below the stage (more ground),
        // so the heroes are never under a button
        var padH = 0;
        pads.forEach(function (pd) { padH = Math.max(padH, pd.node.offsetHeight || 0); });
        var tile = portrait ? Math.floor(Math.min(r.width / 9.5, (r.height - padH - 24) / (ROWS + 0.5))) : Math.floor(Math.min(r.height / 9.6, r.width / 16));
        tile = util.clamp(tile, 18, 72);
        view = { tile: tile, px: r.width, py: r.height, w: r.width / tile, h: portrait ? Math.min(ROWS + 0.5, r.height / tile) : r.height / tile, portrait: portrait, under: (padH + 16) / tile };
        sprites = {};
        dark = isDark();
        resetArt();
        resolveColours();
      }

      /* ---- sprites: each emoji drawn once at the right size ---- */

      var sprites = {};
      function sprite(emoji, size) {
        var k = emoji + '@' + size;
        if (sprites[k]) return sprites[k];
        var c = document.createElement('canvas'), s = Math.ceil(size * 1.3);
        c.width = s; c.height = s;
        var g = c.getContext('2d');
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.font = Math.round(size) + 'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
        g.fillText(emoji, s / 2, s / 2 + size * 0.06);
        sprites[k] = c;
        return c;
      }
      function drawSprite(emoji, x, y, size, flip) {
        var c = sprite(emoji, Math.round(size));
        var px = (x - cam.x) * view.tile, py = (y - cam.y) * view.tile;
        if (flip) { pen.save(); pen.translate(px, py); pen.scale(-1, 1); pen.drawImage(c, -c.width / 2, -c.height / 2); pen.restore(); }
        else pen.drawImage(c, px - c.width / 2, py - c.height / 2);
      }

      /* ---- the world ---- */

      function tileAt(c, r) {
        if (c < 0 || c >= stage.w) return '#';    // the ends of the stage are walls
        if (r < 0 || r >= stage.h) return '.';
        return stage.grid[r][c];
      }
      function isGate(c, r) { return !gateOpen && stage.gates[c] != null && r <= stage.gates[c]; }
      function isDoor(c, r) { return !doorOpen && stage.doors[c] != null && r <= stage.doors[c]; }
      function solid(c, r) { var t = tileAt(c, r); return t === '#' || t === '=' || isGate(c, r) || isDoor(c, r); }

      function startStage(i) {
        stageNo = i;
        var def = STAGES[i];
        stage = buildStage(def);
        stage.art = THEMES[def.theme];
        stage.gates = {}; stage.doors = {};
        acorns = 0; stars = 0; gateOpen = false; doorOpen = false; hasKey = false;
        critters = []; items = []; movers = [];
        stage.things.forEach(function (t) {
          var cx = t.x + 0.5, fy = t.y + 1;
          switch (t.kind) {
            case 'o': items.push({ kind: 'acorn', x: cx, y: t.y + 0.5, r: 0.32 }); break;
            case '*': items.push({ kind: 'star', x: cx, y: t.y + 0.5, r: 0.42 }); break;
            case 'K': items.push({ kind: 'key', x: cx, y: t.y + 0.5, r: 0.4 }); break;
            case 'S': items.push({ kind: 'spring', x: cx, y: fy, r: 0.45, squash: 0 }); break;
            case 'B': items.push({ kind: 'button', x: cx, y: fy, r: 0.45, down: false }); break;
            case 'G': stage.gates[t.x] = t.y; break;
            case 'D': stage.doors[t.x] = t.y; break;
            case 'H': case 'u': items.push({ kind: t.kind === 'u' ? 'chick' : 'home', x: cx + 0.5, y: fy, r: 1.2 }); break;
            case 'e': critters.push(critter('snail', '🐌', cx, fy, 1.0)); break;
            case 'l': critters.push(critter('walker', '🐞', cx, fy, 2.2)); break;
            case 'f': critters.push(critter('frog', '🐸', cx, fy, 0)); break;
            case 'z': critters.push(critter('flyer', '🐝', cx, t.y + 0.5, 0)); break;
            case 'v': critters.push(critter('flyer', '🦇', cx, t.y + 0.5, 0)); break;
            case 'raft': movers.push(mover('raft', t.x, t.y)); break;
            case 'lift': movers.push(mover('lift', t.x, t.y)); break;
          }
        });
        heroes = players.map(function (p, i2) {
          return { i: i2, x: stage.start.x + i2 * 0.9, y: stage.start.y, vx: 0, vy: 0, w: HERO_W, h: HERO_H, face: 1, ground: false, coyote: 0, buffer: 0, held: false,
            dizzy: 0, inv: 0, bubble: null, home: false, safe: { x: stage.start.x, y: stage.start.y }, on: null, squash: 0, walkT: 0, stuck: 0 };
        });
        cam.x = 0;
        cam.y = Math.max(0, ROWS - view.h);
        state = 'play';
        mapEl.hidden = true;
        playEl.hidden = false;
        fit();
        placeDecor();
        placeLife();
        cam.y = view.portrait ? ROWS - view.h : Math.max(0, ROWS - view.h + view.under);
        ctx.setTurn(null);
        sfx.play('start');
        showStatus();
        // the very first time: show which button does what
        if (!progress.cleared && i === 0) {
          var grown = followIdx >= 0 ? 1 - followIdx : 0;
          ctx.hint(pads[grown].keys.right || pads[grown].keys.jump, { delay: 700 });
        }
      }

      function critter(kind, emoji, x, y, speed) {
        return { kind: kind, emoji: emoji, x: x, y: y, hx: x, hy: y, vx: -speed, vy: 0, w: 0.8, h: kind === 'flyer' ? 0.7 : 0.7, alive: true, t: Math.random() * 6, ground: false, poof: 0 };
      }
      function mover(kind, c, r) {
        var m = { kind: kind, x: c, y: r, w: 3, dx: 0, dy: 0, t: 0, x0: c, y0: r };
        if (kind === 'raft') {
          // sail to the far bank and back
          var far = c + 3;
          while (far < stage.w && !solid(far, r)) far++;
          m.x1 = far - 3; m.speed = 3;
        } else { m.y1 = r - 4; m.speed = 1.6; }
        return m;
      }

      /* ---- movement and collisions ---- */

      function moveX(b, dx) {
        if (!dx) return 0;
        b.x += dx;
        var r0 = Math.floor(b.y - b.h + 0.02), r1 = Math.floor(b.y - 0.02), hit = 0;
        var c = dx > 0 ? Math.floor(b.x + b.w / 2) : Math.floor(b.x - b.w / 2);
        for (var r = r0; r <= r1; r++) {
          if (solid(c, r)) {
            b.x = dx > 0 ? c - b.w / 2 - 0.001 : c + 1 + b.w / 2 + 0.001;
            hit = dx > 0 ? 1 : -1;
            break;
          }
        }
        return hit;
      }

      /** Vertical move; lands on ground, branches, rafts and lifts, and (for heroes) on the other hero's head. */
      function moveY(b, dy, others) {
        var prev = b.y;
        b.y += dy;
        var c0 = Math.floor(b.x - b.w / 2 + 0.02), c1 = Math.floor(b.x + b.w / 2 - 0.02);
        b.ground = false;
        b.on = null;
        if (dy > 0) {
          var r = Math.floor(b.y);
          for (var c = c0; c <= c1; c++) {
            var t = tileAt(c, r);
            if (solid(c, r) || (t === '-' && prev <= r + 0.001)) { b.y = r; b.vy = 0; b.ground = true; return; }
          }
          for (var k = 0; k < movers.length; k++) {
            var m = movers[k];
            if (prev <= m.y + 0.001 && b.y >= m.y && b.x + b.w / 2 > m.x && b.x - b.w / 2 < m.x + m.w) { b.y = m.y; b.vy = 0; b.ground = true; b.on = m; return; }
          }
          (others || []).forEach(function (o) {
            if (b.ground || o === b || o.bubble || o.home) return;
            var top = o.y - o.h;
            if (prev <= top + 0.001 && b.y >= top && Math.abs(b.x - o.x) < (b.w + o.w) / 2 - 0.05) { b.y = top; b.vy = 0; b.ground = true; b.on = o; }
          });
        } else if (dy < 0) {
          var rh = Math.floor(b.y - b.h);
          for (var c2 = c0; c2 <= c1; c2++) if (solid(c2, rh)) { b.y = rh + 1 + b.h; b.vy = 0; return; }
        }
      }

      /** Is there ground (or a branch, raft or lift) under x, a little below height y? */
      function floorUnder(x, y) {
        var c = Math.floor(x);
        for (var r = Math.floor(y + 0.05); r <= Math.floor(y + 0.05) + 2; r++) {
          if (solid(c, r) || tileAt(c, r) === '-') return true;
        }
        return movers.some(function (m) { return x >= m.x && x <= m.x + m.w && m.y >= y - 0.5 && m.y <= y + 2; });
      }

      function groundAhead(b, dir) {
        var c = Math.floor(b.x + dir * (b.w / 2 + 0.2)), r = Math.floor(b.y + 0.05);
        return solid(c, r) || tileAt(c, r) === '-';
      }

      /* ---- the heroes ---- */

      function input(i) {
        var pad = pads[i], h = pad.held;
        var k = keysDown;
        var left = h.left || (i === 0 ? k.a : k.arrowleft), right = h.right || (i === 0 ? k.d : k.arrowright);
        var jump = h.jump || (i === 0 ? k.w : k.arrowup);
        return { left: !!left, right: !!right, jump: !!jump };
      }

      function leaderOf(i) { return heroes[1 - i]; }

      function stepHero(hero, dt) {
        if (hero.home) { hero.walkT += dt; return; }
        if (hero.bubble) { floatBubble(hero, dt); return; }
        var inp = input(hero.i);
        var want = 0;
        if (hero.i === followIdx) {
          // a little player's hero runs after the grown-up's by itself: she only jumps
          var lead = leaderOf(hero.i);
          var behind = lead.face >= 0 ? -1.1 : 1.1;
          // her spot behind him, moved towards him until there is something to stand on there (never over a gap)
          var spot = lead.x + behind, toward = behind < 0 ? 1 : -1;
          for (var tries = 0; tries < 8 && !floorUnder(spot, lead.y); tries++) spot += toward * 0.25;
          if (!floorUnder(spot, lead.y)) spot = lead.x;
          var gap = spot - hero.x;
          if (lead.home) gap = lead.x - hero.x;
          if (lead.on === hero || Math.abs(lead.x - hero.x) < 0.35 && lead.y < hero.y - 0.5) gap = 0;   // the grown-up is standing on her: keep still
          if (hero.on === lead) gap = 0;                                                               // she is standing on his head: stay up there
          if (Math.abs(gap) > 0.3) want = gap > 0 ? 1 : -1;
          // she never walks off an edge by herself: over a gap is HER jump (only at the most help does she hop it alone)
          if (want && hero.ground && !groundAhead(hero, want) && ctx.helpFor(hero.i) < 2 && hero.buffer <= 0) { needJump(hero.i); want = 0; }
          // at the most help she hops over a gap or up a step by herself, if she has not jumped in time
          if (want && hero.ground && ctx.helpFor(hero.i) >= 2 && (!groundAhead(hero, want) || hero.stuck > 0.5)) hero.buffer = BUFFER;
          if (want && hero.ground && (!groundAhead(hero, want) || hero.stuck > 0.25)) needJump(hero.i);
        } else {
          if (inp.left && !inp.right) want = -1;
          if (inp.right && !inp.left) want = 1;
        }
        if (hero.dizzy > 0) { hero.dizzy -= dt; want = 0; }
        var speed = hero.i === followIdx ? FOLLOW : WALK;
        var target = want * speed, acc = hero.ground ? 40 : 40 * AIR;
        if (hero.dizzy <= 0) hero.vx += util.clamp(target - hero.vx, -acc * dt, acc * dt);
        if (want) hero.face = want;
        // jumping: a short grace after leaving an edge, and a press just before landing still counts
        hero.coyote = hero.ground ? COYOTE : hero.coyote - dt;
        hero.buffer -= dt;
        var holding = hero.i === followIdx ? true : inp.jump;
        if (hero.buffer > 0 && hero.coyote > 0 && hero.dizzy <= 0) {
          var boost = hero.on && hero.on.i != null ? BOOST : 1;
          hero.vy = -JUMP * boost;
          hero.ownJump = true;
          hero.buffer = 0; hero.coyote = 0; hero.ground = false;
          hero.squash = -0.25;
          sfx.tone({ freq: boost > 1 ? 380 : 300, to: boost > 1 ? 900 : 640, dur: 0.14, type: 'triangle', gain: 0.14 });
          if (boost > 1) { var c = screenOf(hero); fx.burst(c.x, c.y, { emoji: '✨', count: 5, distance: 40, size: 16 }); }
        }
        if (hero.ownJump && !holding && hero.vy < -JUMP * 0.45) hero.vy = -JUMP * 0.45;   // let go early: a smaller hop (only for a jump of your own: never a spring)
        if (hero.vy >= 0) hero.ownJump = false;
        hero.vy = Math.min(hero.vy + GRAV * dt, 22);
        // carried by a raft or a lift: moved along with it first, then the hero's own move
        if (hero.on && hero.on.dx != null) {
          moveX(hero, hero.on.dx);
          if (hero.on.dy && hero.vy >= 0) hero.y = hero.on.y;
        }
        var wasGround = hero.ground, fallV = hero.vy;
        var hit = moveX(hero, hero.vx * dt);
        hero.stuck = hit && want === hit && hero.ground ? hero.stuck + dt : 0;
        if (hit) hero.vx = 0;
        moveY(hero, hero.vy * dt, heroes);
        if (hero.ground && !wasGround && fallV > 6) { hero.squash = 0.25; sfx.tone({ freq: 160, to: 110, dur: 0.06, type: 'sine', gain: 0.08 }); }
        hero.squash *= Math.pow(0.0005, dt);
        hero.walkT += Math.abs(hero.vx) * dt;
        if (hero.inv > 0) hero.inv -= dt;
        if (hero.ground && !hero.on && solid(Math.floor(hero.x), Math.floor(hero.y + 0.05))) hero.safe = { x: hero.x, y: hero.y };
        if (hero.y > ROWS + 1.5) fallIn(hero);
      }

      function needJump(i) {
        if (!ctx.helpFor(i) || ctx.time - hintAt < 4) return;
        hintAt = ctx.time;
        ctx.hint(pads[i].keys.jump, { delay: 0 });
      }

      /** Into a pit or the water: a bubble floats you back to your buddy (or to safe ground). */
      /** A buddy standing on something solid is a good place to float to; otherwise your own last safe spot. */
      function steadyBuddy(hero) {
        var b = heroes[1 - hero.i];
        return b && !b.bubble && !b.home && b.ground && b.on !== hero ? b : null;
      }
      function fallIn(hero) {
        var buddy = steadyBuddy(hero);
        var to = buddy ? { x: buddy.x, y: buddy.y - buddy.h - 0.2 } : { x: hero.safe.x, y: hero.safe.y - 0.1 };
        bubbleTo(hero, to);
        sfx.play('splash');
      }
      function bubbleTo(hero, to) {
        hero.bubble = { t: 0, from: { x: hero.x, y: Math.min(hero.y, ROWS + 0.5) }, to: to };
        hero.vx = 0; hero.vy = 0; hero.dizzy = 0;
      }
      function floatBubble(hero, dt) {
        var b = hero.bubble;
        b.t += dt / 1.1;
        var buddy = steadyBuddy(hero);
        if (buddy && !b.toHome) b.to = { x: buddy.x, y: buddy.y - buddy.h - 0.3 };
        var k = Math.min(1, b.t), e = k * k * (3 - 2 * k);
        hero.x = b.from.x + (b.to.x - b.from.x) * e;
        hero.y = b.from.y + (b.to.y - b.from.y) * e - Math.sin(k * Math.PI) * 1.5;
        if (k >= 1) {
          hero.bubble = null;
          // pop out somewhere free, with something under it (else back at the last safe spot)
          hero.y = b.to.y;
          var below = false;
          for (var d = 0; d < 4 && !below; d++) below = solid(Math.floor(hero.x), Math.floor(hero.y + d)) || tileAt(Math.floor(hero.x), Math.floor(hero.y + d)) === '-';
          if (solid(Math.floor(hero.x), Math.floor(hero.y - 0.5)) || (!below && !steadyBuddy(hero))) { hero.x = hero.safe.x; hero.y = hero.safe.y; }
          hero.vy = -3;
          hero.inv = 1;
          sfx.play('pop', { pitch: 600 });
          var c = screenOf(hero);
          fx.burst(c.x, c.y, { emoji: '✨', count: 4, distance: 30, size: 14 });
        }
      }

      /* ---- critters ---- */

      function stepCritter(cr, dt) {
        if (!cr.alive) { cr.poof += dt; return; }
        cr.t += dt;
        if (cr.kind === 'flyer') {
          cr.x = cr.hx + Math.sin(cr.t * 0.7) * 2.2;
          cr.vx = Math.cos(cr.t * 0.7);
          cr.y = cr.hy + Math.sin(cr.t * 2.1) * 0.7;
          return;
        }
        if (cr.kind === 'frog') {
          if (cr.ground && cr.t > 1.7) { cr.t = 0; cr.vy = -10.5; cr.vx = (cr.vx > 0 ? -1 : 1) * 1.8; }
          if (cr.ground && cr.t < 1.7) cr.vx = cr.vx > 0 ? 0.0001 : -0.0001;
        } else if (cr.ground && !groundAhead(cr, cr.vx > 0 ? 1 : -1)) cr.vx = -cr.vx;   // walkers turn at an edge
        cr.vy = Math.min(cr.vy + GRAV * dt, 20);
        var hit = moveX(cr, cr.vx * dt);
        if (hit) cr.vx = -cr.vx;
        moveY(cr, cr.vy * dt, null);
        if (cr.y > ROWS + 2) cr.alive = false;
      }

      /* ---- meeting things ---- */

      function overlap(a, b) {
        return Math.abs(a.x - b.x) < (a.w + b.w) / 2 && a.y - a.h < b.y && b.y - b.h < a.y;
      }

      function meet(hero) {
        if (hero.bubble || hero.home) return;
        critters.forEach(function (cr) {
          if (!cr.alive || !overlap(hero, cr)) return;
          var top = cr.y - cr.h;
          if (hero.vy > 0 && hero.y - hero.vy / 60 <= top + 0.35) {
            // bop! it runs off giggling, and leaves an acorn
            cr.alive = false;
            hero.vy = -BOP * (input(hero.i).jump || hero.i === followIdx ? 1.2 : 1);
            hero.ownJump = false;
            sfx.play('pop', { pitch: 500 });
            sfx.play('boing');
            var c = screenOf(cr);
            fx.burst(c.x, c.y, { emoji: '✨', count: 6, distance: 40, size: 16 });
            addAcorns(1, cr);
          } else if (hero.inv <= 0) {
            // bump: knocked back and dizzy for a moment, nothing lost
            var dir = hero.x < cr.x ? -1 : 1;
            hero.vx = dir * 7;
            hero.vy = -6;
            hero.dizzy = 0.55;
            hero.inv = 1.4;
            sfx.play('boop');
            sfx.tone({ freq: 400, to: 250, dur: 0.15, type: 'triangle', gain: 0.1 });
          }
        });
        items.forEach(function (it) {
          if (it.gone) return;
          var near = Math.abs(hero.x - it.x) < it.r + hero.w / 2 && hero.y - hero.h < it.y + it.r && hero.y > it.y - it.r;
          if (it.kind === 'spring') {
            if (Math.abs(hero.x - it.x) < 0.55 && hero.vy >= 0 && Math.abs(hero.y - it.y) < 0.25 && hero.ground) {
              hero.vy = -SPRING; hero.ownJump = false; hero.ground = false; it.squash = 1;
              sfx.play('boing');
            }
            return;
          }
          if (it.kind === 'button') {
            if (!it.down && Math.abs(hero.x - it.x) < 0.7 && Math.abs(hero.y - it.y) < 0.2 && hero.ground) {
              it.down = true; gateOpen = true;
              sfx.play('ding');
              sfx.play('whoosh');
            }
            return;
          }
          if (it.kind === 'home' || it.kind === 'chick') {
            if (Math.abs(hero.x - it.x) < 1.1 && Math.abs(hero.y - it.y) < 1.5) arrive(hero);
            return;
          }
          if (!near) return;
          var c = screenOf(it);
          if (it.kind === 'acorn') { it.gone = true; addAcorns(1, null); fx.burst(c.x, c.y, { count: 3, distance: 20, size: 8 }); }
          else if (it.kind === 'star') { it.gone = true; stars++; sfx.play('star'); fx.burst(c.x, c.y, { emoji: '⭐', count: 8, distance: 60, size: 20 }); showStatus(); }
          else if (it.kind === 'key') { it.gone = true; hasKey = true; sfx.seq([88, 91, 96], { step: 0.05, type: 'sine', gain: 0.14 }); fx.burst(c.x, c.y, { emoji: '✨', count: 6, distance: 40, size: 16 }); showStatus(); }
        });
        // the cave door: whoever has the key opens it by walking up to it
        if (hasKey && !doorOpen) {
          Object.keys(stage.doors).forEach(function (dc) {
            if (Math.abs(hero.x - (+dc + 0.5)) < 1.0 + hero.w / 2) { doorOpen = true; sfx.play('whoosh'); sfx.play('match'); }
          });
        }
      }

      function addAcorns(n, from) {
        acorns += n;
        sfx.scale(Math.min(12, 2 + (acorns % 10)));
        if (from) { var c = screenOf(from); fx.float(c.x, c.y - 10, '🌰', { size: 24, duration: 700 }); }
        showStatus();
      }

      /** Home! When both are home, the stage is cleared. A little follower is carried home with the grown-up. */
      function arrive(hero) {
        if (hero.home) return;
        hero.home = true;
        hero.vx = 0;
        sfx.play('good');
        var other = heroes[1 - hero.i];
        if (!other.home && other.i === followIdx) { bubbleTo(other, { x: hero.x - 0.9, y: hero.y }); other.bubble.toHome = true; }
        if (heroes.every(function (h) { return h.home; })) clear();
      }

      function clear() {
        if (state !== 'play') return;
        state = 'clear';
        var best = progress.stars[stageNo] || 0;
        progress.stars[stageNo] = Math.max(best, stars);
        progress.done[stageNo] = true;
        // 'cleared' is how many stages in a row from the first are done (with all stages open, one can be skipped)
        progress.cleared = 0;
        while (progress.cleared < STAGES.length && progress.done[progress.cleared]) progress.cleared++;
        try { ctx.save('progress', progress); } catch (e) {}
        sfx.play('match');
        var c = fx.centerOf(canvas);
        fx.burst(c.x, c.y, { emoji: '🌰', count: 12, distance: 140, size: 24 });
        ctx.win('team', { delay: 1400, emoji: STAGES[stageNo].icon });
      }

      /* ---- camera and drawing ---- */

      function screenOf(o) {
        var r = canvas.getBoundingClientRect();
        return { x: r.left + (o.x - cam.x) * view.tile, y: r.top + (o.y - (o.h || 0.5) / 2 - cam.y) * view.tile };
      }

      function aim(dt) {
        var live = heroes.filter(function (h) { return !h.bubble; });
        if (!live.length) live = heroes;
        var fxp;
        if (followIdx >= 0) fxp = heroes[1 - followIdx];
        else fxp = { x: (live[0].x + live[live.length - 1].x) / 2, y: (live[0].y + live[live.length - 1].y) / 2 };
        var aimX = fxp.x - view.w * 0.45;
        if (followIdx >= 0) { var fh = heroes[followIdx]; if (!fh.bubble && !fh.home) aimX = Math.min(aimX, fh.x - 0.9); }   // keep her on the screen too
        var tx = util.clamp(aimX, 0, Math.max(0, stage.w - view.w));
        var ty = view.portrait ? ROWS - view.h : util.clamp(fxp.y - view.h * 0.62, 0, Math.max(0, ROWS - view.h + view.under));
        cam.x += (tx - cam.x) * Math.min(1, dt * 6);
        cam.y += (ty - cam.y) * Math.min(1, dt * 6);
        // with two steering heroes: whoever is left behind off the screen floats over to the other
        if (followIdx < 0) heroes.forEach(function (h) {
          if (h.bubble || h.home) return;
          if (h.x < cam.x - 0.6 || h.x > cam.x + view.w + 0.6) bubbleTo(h, { x: heroes[1 - h.i].x, y: heroes[1 - h.i].y - 1.2 });
        });
        // a follower far behind (stuck, or lost) floats along too
        if (followIdx >= 0) {
          var f = heroes[followIdx], l = heroes[1 - followIdx];
          if (!f.bubble && !f.home && Math.abs(f.x - l.x) > Math.min(7, view.w - 2) && steadyBuddy(f)) bubbleTo(f, { x: l.x - l.face, y: l.y - 1.2 });
        }
      }

      /* ================================================================ the look
       * Everything is drawn in code, in layers from the back:
       *   sky (a soft fade, sun or moon) -> far hills/forest/islands/cave wall (slow parallax)
       *   -> drifting clouds -> nearer trees and bushes (parallax) -> the stage's own scenery
       *   and ground (pre-drawn in chunks, so a frame only copies them) -> water, sparkles and
       *   little creatures -> doors, rafts, things to collect, critters, the heroes.
       * Dark mode is night: a starry sky, a moon, and everything a shade darker.
       */
      var chunks = {}, chunkOrder = [], CHUNK = 16, c0Draw = 0, frameDt = 1 / 60;
      var strips = {};
      var decor = [], life = [];

      function rng(seed) { var s = (seed % 2147483646) + 1; return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
      function shade(c, k) {                        // k < 0 darker, k > 0 lighter; takes '#rrggbb' or 'rgb(r,g,b)'
        var r, g, b;
        if (c.charAt(0) === '#') { var n = parseInt(c.slice(1), 16); r = n >> 16; g = (n >> 8) & 255; b = n & 255; }
        else { var m = c.match(/\d+(\.\d+)?/g) || [0, 0, 0]; r = +m[0]; g = +m[1]; b = +m[2]; }
        var t = k < 0 ? 0 : 255, f = Math.abs(k);
        return 'rgb(' + Math.round(r + (t - r) * f) + ',' + Math.round(g + (t - g) * f) + ',' + Math.round(b + (t - b) * f) + ')';
      }
      var INK = '#2A2356';

      function resetArt() { chunks = {}; chunkOrder = []; strips = {}; }

      /** The stage's own scenery: trees, bushes, flowers, fences, reeds, crystals... placed once per stage, behind the play. */
      function placeDecor() {
        decor = [];
        var r = rng(stageNo * 977 + 13), kinds = stage.art.decor, next = 2 + Math.floor(r() * 3);
        for (var c = 1; c < stage.w - 1; c++) {
          if (c < next) continue;
          // only on open ground: grass under, sky above
          if (stage.grid[10][c] !== '#' || stage.grid[9][c] !== '.' || stage.grid[8][c] !== '.') continue;
          var k = kinds[Math.floor(r() * kinds.length)];
          if ((k === 'tree' || k === 'pine') && !openAbove(c, 4)) k = k === 'pine' ? 'fern' : 'bush';
          decor.push({ kind: k, x: c + 0.5 + (r() - 0.5) * 0.4, y: 10, s: 0.85 + r() * 0.35, v: r() });
          next = c + 2 + Math.floor(r() * 4);
        }
      }
      function openAbove(c, rows) {
        for (var r = 9; r >= 9 - rows; r--) for (var dc = -1; dc <= 1; dc++) { var t = tileAt(c + dc, r); if (t !== '.' && t !== '~') return false; }
        return !items.some(function (it) { return Math.abs(it.x - c - 0.5) < 2 && it.y > 9 - rows - 1 && it.y < 10; });
      }

      /** Little creatures and sparkles that drift about near the camera. */
      function placeLife() {
        life = [];
        var kind = dark && stage.art.lifeNight ? stage.art.lifeNight : stage.art.life;
        var n = still ? 0 : { butterfly: 3, leaf: 7, firefly: 9, dragonfly: 2, twinkle: 14 }[kind] || 0;
        for (var i = 0; i < n; i++) life.push({ kind: kind, x: cam.x + Math.random() * view.w, y: 2 + Math.random() * 7, t: Math.random() * 10, seed: Math.random() });
      }

      /* ---- the far and near background strips (drawn once, then slid along) ---- */

      function strip(name) {
        var key = name + (dark ? 'N' : 'D');
        if (strips[key]) return strips[key];
        var T = view.tile, a = stage.art, W = Math.ceil(T * 24), H = Math.ceil(T * 8);
        var dpr = 1;                                        // far away: a little soft is fine, and it saves memory
        var cv = document.createElement('canvas');
        cv.width = Math.ceil(W * dpr); cv.height = Math.ceil(H * dpr);
        var g = cv.getContext('2d');
        g.scale(dpr, dpr);
        var r = rng(name.length * 31 + stageNo * 7);
        var base = H - T * 0.2;                            // the strip's ground line
        var col = function (c) { return dark ? shade(c, -0.55) : c; };
        g.lineJoin = 'round';
        if (name === 'far') {
          if (a.far === 'hills' || a.far === 'pondhills') {
            // two rows of rolling hills, the back one paler
            [[a.hillBack, 3.6, 0.9], [a.hillFront, 2.4, 1.3]].forEach(function (L, li) {
              g.fillStyle = col(L[0]);
              g.beginPath(); g.moveTo(0, H);
              for (var x = 0; x <= W; x += 4) {
                var u = x / W * Math.PI * 2;
                var y = base - T * L[1] - T * L[2] * (0.6 * Math.sin(u * 2 + li * 1.7) + 0.4 * Math.sin(u * 5 + li));
                g.lineTo(x, y);
              }
              g.lineTo(W, H); g.closePath(); g.fill();
              // a lighter top edge, like sunlight on the hills
              g.strokeStyle = col(shade(L[0], 0.25)); g.lineWidth = T * 0.08; g.stroke();
            });
            // far-off trees: little round blobs standing on the front hills
            for (var t = 0; t < 9; t++) (function (tx, rad) {
              var tu = tx / W * Math.PI * 2;
              var ty = base - T * 2.4 - T * 1.3 * (0.6 * Math.sin(tu * 2 + 1.7) + 0.4 * Math.sin(tu * 5 + 1)) - T * 0.25;
              wrapped(g, W, function () {
                g.fillStyle = col(shade(a.hillFront, -0.18));
                g.beginPath(); g.arc(tx, ty, rad, 0, Math.PI * 2); g.fill();
                g.fillRect(tx - T * 0.05, ty, T * 0.1, T * 0.4);
              });
            })(r() * W, T * (0.35 + r() * 0.2));
          } else if (a.far === 'pines') {
            for (var row = 0; row < 2; row++) {
              g.fillStyle = col(row ? a.hillFront : a.hillBack);
              for (var p = 0; p < 12; p++) (function (px, ph) {
                wrapped(g, W, function () {
                  for (var tier = 0; tier < 3; tier++) {
                    var tw = T * (1.3 - tier * 0.3), ty2 = base - ph * (0.35 + tier * 0.25);
                    g.beginPath(); g.moveTo(px - tw, ty2 + T * 0.9); g.lineTo(px, ty2 - T * 0.7); g.lineTo(px + tw, ty2 + T * 0.9); g.closePath(); g.fill();
                  }
                  g.fillRect(px - T * 0.1, base - T * 0.9, T * 0.2, T * 0.9);
                });
              })(p * W / 12 + (row ? W / 24 : 0) + r() * T * 0.6, T * (3.2 + r() * 1.6 - row * 0.6));
              g.fillRect(0, base - T * 0.4, W, T * 0.6);
            }
          } else if (a.far === 'islands') {
            // a rainbow and floating islands
            if (!dark) {
              ['#FF8FA3', '#FFC36B', '#FFE97A', '#9BE38B', '#7CC8F7', '#B79CFF'].forEach(function (rc, ri) {
                g.strokeStyle = rc; g.globalAlpha = 0.45; g.lineWidth = T * 0.22;
                g.beginPath(); g.arc(W * 0.6, base + T * 2, T * (6.2 - ri * 0.22), Math.PI * 1.08, Math.PI * 1.92); g.stroke();
              });
              g.globalAlpha = 1;
            }
            for (var is = 0; is < 4; is++) (function (ix, iy, iw) {
              wrapped(g, W, function () {
                g.fillStyle = col('#C9B6F2');
                g.beginPath(); g.moveTo(ix - iw, iy); g.lineTo(ix + iw, iy); g.lineTo(ix + iw * 0.3, iy + T * 1.2); g.lineTo(ix - iw * 0.2, iy + T * 0.9); g.closePath(); g.fill();
                g.fillStyle = col('#9BE38B');
                g.beginPath(); g.ellipse(ix, iy, iw, T * 0.22, 0, 0, Math.PI * 2); g.fill();
              });
            })((is + 0.3 + r() * 0.4) * W / 4, base - T * (3 + r() * 2.5), T * (1.4 + r()));
          } else if (a.far === 'cave') {
            // the cave's far wall: rocky ridges, and glowing crystals here and there
            g.fillStyle = col(a.hillBack);
            g.beginPath(); g.moveTo(0, H);
            for (var cx = 0; cx <= W; cx += T * 0.8) g.lineTo(cx, base - T * (3 + 1.4 * Math.abs(Math.sin(cx / T * 0.7)) + r() * 0.8));
            g.lineTo(W, H); g.closePath(); g.fill();
            for (var cr = 0; cr < 7; cr++) (function (cx2, cy2, cs, cc) {
              wrapped(g, W, function () { crystal(g, cx2, cy2, cs, cc, 0.4); });
            })(r() * W, base - T * (0.3 + r() * 1.2), T * (0.18 + r() * 0.15), cr % 2 ? '#7FE7FF' : '#FF9BE0');
          }
        } else {
          // the near strip: trees and bushes (or reeds, or puffy clouds, or rocks)
          var nearCol = col(a.near);
          for (var n = 0; n < 8; n++) (function (nx, ns, up) {
            wrapped(g, W, function () {
              if (a.nearKind === 'trees') tree(g, nx, base, T * ns * 1.1, nearCol, col(shade(a.near, -0.25)), true);
              else if (a.nearKind === 'pines') pine(g, nx, base, T * ns * 1.2, nearCol, true);
              else if (a.nearKind === 'reeds') reeds(g, nx, base, T * ns, nearCol);
              else if (a.nearKind === 'clouds') cloud(g, nx, base - T * up, T * ns * 0.8, col('#FFFFFF'), col('#E6DCFF'), 0.6);
              else if (a.nearKind === 'rocks') { g.fillStyle = nearCol; g.beginPath(); g.moveTo(nx - T, base); g.lineTo(nx - T * 0.4, base - T * 1.6 * ns); g.lineTo(nx + T * 0.5, base - T * 1.1 * ns); g.lineTo(nx + T * 1.1, base); g.closePath(); g.fill(); }
            });
          })((n + r() * 0.6) * W / 8, 0.8 + r() * 0.6, 0.6 + r() * 1.2);
          if (a.nearKind === 'trees' || a.nearKind === 'pines') { g.fillStyle = nearCol; g.fillRect(0, base - T * 0.15, W, T * 0.4); }
        }
        // haze: the further away, the more it melts into the sky
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.globalCompositeOperation = 'source-atop';
        g.fillStyle = dark ? a.nightBottom : a.skyBottom;
        g.globalAlpha = name === 'far' ? 0.4 : 0.22;
        g.fillRect(0, 0, cv.width, cv.height);
        g.globalAlpha = 1;
        g.globalCompositeOperation = 'source-over';
        strips[key] = { cv: cv, w: W, h: H };
        return strips[key];
      }

      /** The strips repeat side by side: anything near an edge is drawn again one strip over, so no seam shows. */
      function wrapped(g, W, fn) { for (var o = -W; o <= W; o += W) { g.save(); g.translate(o, 0); fn(); g.restore(); } }

      function drawStrip(name, par, lift) {
        var s = strip(name), T = view.tile;
        var ground = (10 - cam.y) * T + T * 0.2;            // the strips sit on the stage's ground line
        var y = ground - s.h - (lift || 0) * T;
        var off = -((cam.x * T * par) % s.w);
        for (var x = off; x < view.px; x += s.w) pen.drawImage(s.cv, x, y, s.w, s.h);
        if (y + s.h < view.py) { pen.fillStyle = dark ? shade(stage.art.near, -0.6) : stage.art.near; }
      }

      /* ---- shapes used everywhere ---- */

      function tree(g, x, base, size, leaf, leafDark, flat) {
        var trunkW = size * 0.22, trunkH = size * 1.2;
        g.fillStyle = flat ? leafDark : '#8A5A35';
        g.fillRect(x - trunkW / 2, base - trunkH, trunkW, trunkH);
        if (!flat) { g.strokeStyle = INK; g.lineWidth = Math.max(1.5, size * 0.05); g.strokeRect(x - trunkW / 2, base - trunkH, trunkW, trunkH); }
        var blobs = [[0, -1.9, 0.75], [-0.55, -1.45, 0.55], [0.55, -1.5, 0.58], [0, -1.2, 0.6]];
        if (!flat) {
          g.fillStyle = INK;
          blobs.forEach(function (b) { g.beginPath(); g.arc(x + b[0] * size, base + b[1] * size, b[2] * size + Math.max(1.5, size * 0.05), 0, Math.PI * 2); g.fill(); });
        }
        g.fillStyle = flat ? leaf : leafDark;
        blobs.forEach(function (b) { g.beginPath(); g.arc(x + b[0] * size, base + b[1] * size, b[2] * size, 0, Math.PI * 2); g.fill(); });
        if (!flat) {
          // light from the top left
          g.fillStyle = leaf;
          blobs.forEach(function (b) { g.beginPath(); g.arc(x + b[0] * size - b[2] * size * 0.18, base + b[1] * size - b[2] * size * 0.2, b[2] * size * 0.78, 0, Math.PI * 2); g.fill(); });
          g.fillStyle = 'rgba(255,255,255,0.28)';
          g.beginPath(); g.arc(x - size * 0.22, base - size * 2.15, size * 0.22, 0, Math.PI * 2); g.fill();
        }
      }
      function pine(g, x, base, size, col2, flat) {
        g.fillStyle = flat ? col2 : '#7A4F2E';
        g.fillRect(x - size * 0.1, base - size * 0.7, size * 0.2, size * 0.7);
        for (var tier = 0; tier < 3; tier++) {
          var w = size * (0.9 - tier * 0.22), y = base - size * (0.5 + tier * 0.55);
          g.fillStyle = flat ? col2 : shade(col2, -0.15 * (2 - tier) / 2);
          g.beginPath(); g.moveTo(x - w, y); g.lineTo(x, y - size * 0.95); g.lineTo(x + w, y); g.closePath(); g.fill();
          if (!flat) { g.strokeStyle = INK; g.lineWidth = Math.max(1.5, size * 0.05); g.stroke(); }
        }
      }
      function reeds(g, x, base, size, col2) {
        g.strokeStyle = col2; g.lineWidth = Math.max(2, size * 0.08); g.lineCap = 'round';
        for (var k = -2; k <= 2; k++) {
          g.beginPath(); g.moveTo(x + k * size * 0.12, base); g.quadraticCurveTo(x + k * size * 0.2, base - size, x + k * size * 0.32, base - size * (1.3 + (k % 2) * 0.3)); g.stroke();
        }
        g.fillStyle = shade(col2, -0.3);
        g.beginPath(); g.ellipse(x + size * 0.08, base - size * 1.1, size * 0.07, size * 0.22, 0.15, 0, Math.PI * 2); g.fill();
      }
      function cloud(g, x, y, size, col2, shadeCol, alpha) {
        g.globalAlpha = alpha == null ? 1 : alpha;
        var puffs = [[-0.9, 0.15, 0.5], [-0.35, -0.2, 0.68], [0.35, -0.1, 0.6], [0.95, 0.2, 0.45], [0, 0.25, 0.55]];
        g.fillStyle = shadeCol;
        puffs.forEach(function (p) { g.beginPath(); g.arc(x + p[0] * size, y + p[1] * size + size * 0.12, p[2] * size, 0, Math.PI * 2); g.fill(); });
        g.fillStyle = col2;
        puffs.forEach(function (p) { g.beginPath(); g.arc(x + p[0] * size, y + p[1] * size, p[2] * size, 0, Math.PI * 2); g.fill(); });
        g.globalAlpha = 1;
      }
      function crystal(g, x, y, size, col2, alpha) {
        g.globalAlpha = alpha == null ? 1 : alpha;
        g.fillStyle = col2;
        g.beginPath(); g.moveTo(x, y - size * 1.6); g.lineTo(x + size * 0.55, y - size * 0.4); g.lineTo(x + size * 0.35, y + size * 0.4); g.lineTo(x - size * 0.35, y + size * 0.4); g.lineTo(x - size * 0.55, y - size * 0.4); g.closePath(); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.55)';
        g.beginPath(); g.moveTo(x, y - size * 1.6); g.lineTo(x + size * 0.15, y - size * 0.4); g.lineTo(x - size * 0.2, y - size * 0.3); g.closePath(); g.fill();
        g.globalAlpha = 1;
      }

      /* ---- the stage, pre-drawn in chunks of 16 columns ---- */

      function chunk(k) {
        if (chunks[k]) return chunks[k];
        var T = view.tile, dpr = Math.min(1.5, window.devicePixelRatio || 1), W = CHUNK * T, H = ROWS * T;
        // three canvases, reused as the camera moves on: making and dropping big canvases makes the browser stop to tidy up
        var cv;
        if (chunkOrder.length >= 3) {
          var old = chunkOrder.shift();
          cv = chunks[old];
          delete chunks[old];
        } else {
          cv = document.createElement('canvas');
          cv.width = Math.ceil(W * dpr); cv.height = Math.ceil(H * dpr);
        }
        var g = cv.getContext('2d');
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.clearRect(0, 0, cv.width, cv.height);
        g.scale(dpr, dpr);
        g.translate(-k * CHUNK * T, 0);
        var c0 = k * CHUNK - 3, c1 = (k + 1) * CHUNK + 3;
        // scenery first (behind the ground's edge)
        decor.forEach(function (d) { if (d.x > c0 - 2 && d.x < c1 + 2) drawDecor(g, d, T); });
        c0Draw = Math.max(0, c0);
        for (var r = 0; r < ROWS; r++) for (var c = c0Draw; c <= Math.min(stage.w - 1, c1); c++) drawTile(g, c, r, T);
        if (dark) {
          // night: everything a shade darker (only where something was drawn)
          g.setTransform(1, 0, 0, 1, 0, 0);
          g.globalCompositeOperation = 'source-atop';
          g.fillStyle = 'rgba(14, 12, 48, 0.32)';
          g.fillRect(0, 0, cv.width, cv.height);
          g.globalCompositeOperation = 'source-over';
        }
        chunks[k] = cv;
        chunkOrder.push(k);                 // two show at most, plus the one just left behind
        return cv;
      }

      function drawDecor(g, d, T) {
        var a = stage.art, x = d.x * T, base = d.y * T, s = d.s * T;
        g.lineJoin = 'round';
        if (d.kind === 'tree') tree(g, x, base + T * 0.05, s * 1.25, a.leaf, a.leafDark, false);
        else if (d.kind === 'pine') pine(g, x, base + T * 0.05, s * 1.6, a.leaf, false);
        else if (d.kind === 'bush') {
          g.fillStyle = INK;
          [[-0.35, 0.32], [0.05, 0.42], [0.42, 0.3]].forEach(function (b) { g.beginPath(); g.arc(x + b[0] * s, base - b[1] * s * 0.7, b[1] * s + 2, Math.PI, 0); g.fill(); });
          g.fillStyle = a.leafDark;
          [[-0.35, 0.32], [0.05, 0.42], [0.42, 0.3]].forEach(function (b) { g.beginPath(); g.arc(x + b[0] * s, base - b[1] * s * 0.7, b[1] * s, Math.PI, 0); g.fill(); });
          g.fillStyle = a.leaf;
          [[-0.38, 0.26], [0.0, 0.34], [0.38, 0.24]].forEach(function (b) { g.beginPath(); g.arc(x + b[0] * s, base - b[1] * s * 0.95, b[1] * s * 0.8, Math.PI, 0); g.fill(); });
          if (d.v > 0.5) { g.fillStyle = '#E8435A'; [[-0.2, 0.42], [0.25, 0.5], [0.05, 0.3]].forEach(function (b) { g.beginPath(); g.arc(x + b[0] * s, base - b[1] * s, s * 0.05, 0, Math.PI * 2); g.fill(); }); }
        } else if (d.kind === 'flowers') {
          var cols = ['#FF8FB8', '#FFE066', '#FFFFFF', '#B79CFF'];
          for (var f = 0; f < 3; f++) {
            var fx2 = x + (f - 1) * s * 0.28, fh = s * (0.35 + ((d.v * 7 + f) % 1) * 0.25);
            g.strokeStyle = a.leafDark; g.lineWidth = Math.max(1.5, T * 0.05);
            g.beginPath(); g.moveTo(fx2, base); g.lineTo(fx2, base - fh); g.stroke();
            g.fillStyle = cols[(f + Math.floor(d.v * 4)) % 4];
            for (var pp = 0; pp < 5; pp++) { var an = pp / 5 * Math.PI * 2; g.beginPath(); g.arc(fx2 + Math.cos(an) * s * 0.07, base - fh + Math.sin(an) * s * 0.07, s * 0.06, 0, Math.PI * 2); g.fill(); }
            g.fillStyle = '#FFB000'; g.beginPath(); g.arc(fx2, base - fh, s * 0.045, 0, Math.PI * 2); g.fill();
          }
        } else if (d.kind === 'fence') {
          g.fillStyle = '#F6E3C0'; g.strokeStyle = INK; g.lineWidth = Math.max(1.5, T * 0.05);
          for (var fp = -1; fp <= 1; fp++) { var px2 = x + fp * s * 0.36; g.beginPath(); g.moveTo(px2 - s * 0.07, base); g.lineTo(px2 - s * 0.07, base - s * 0.55); g.lineTo(px2, base - s * 0.65); g.lineTo(px2 + s * 0.07, base - s * 0.55); g.lineTo(px2 + s * 0.07, base); g.closePath(); g.fill(); g.stroke(); }
          g.fillRect(x - s * 0.5, base - s * 0.42, s, s * 0.09); g.strokeRect(x - s * 0.5, base - s * 0.42, s, s * 0.09);
        } else if (d.kind === 'stump') {
          g.fillStyle = '#9A6A42'; g.strokeStyle = INK; g.lineWidth = Math.max(1.5, T * 0.05);
          g.fillRect(x - s * 0.28, base - s * 0.4, s * 0.56, s * 0.4); g.strokeRect(x - s * 0.28, base - s * 0.4, s * 0.56, s * 0.4);
          g.fillStyle = '#E6C08E'; g.beginPath(); g.ellipse(x, base - s * 0.4, s * 0.28, s * 0.1, 0, 0, Math.PI * 2); g.fill(); g.stroke();
          g.strokeStyle = '#B98A55'; g.beginPath(); g.ellipse(x, base - s * 0.4, s * 0.14, s * 0.05, 0, 0, Math.PI * 2); g.stroke();
        } else if (d.kind === 'fern') {
          g.strokeStyle = a.leaf; g.lineWidth = Math.max(2, T * 0.07); g.lineCap = 'round';
          for (var fr = -2; fr <= 2; fr++) { g.beginPath(); g.moveTo(x, base); g.quadraticCurveTo(x + fr * s * 0.2, base - s * 0.5, x + fr * s * 0.35, base - s * (0.35 + (2 - Math.abs(fr)) * 0.12)); g.stroke(); }
        } else if (d.kind === 'reeds') reeds(g, x, base, s * 0.9, a.leafDark);
        else if (d.kind === 'cattail') { reeds(g, x, base, s * 1.1, a.leaf); }
        else if (d.kind === 'cloudpuff') cloud(g, x, base - s * 0.25, s * 0.5, '#FFFFFF', '#E6DCFF', 1);
        else if (d.kind === 'crystals') { crystal(g, x - s * 0.2, base - s * 0.15, s * 0.28, '#7FE7FF', 1); crystal(g, x + s * 0.18, base - s * 0.1, s * 0.2, '#FF9BE0', 1); }
        else if (d.kind === 'mushglow') {
          g.fillStyle = '#E7E2FF'; g.fillRect(x - s * 0.05, base - s * 0.35, s * 0.1, s * 0.35);
          g.fillStyle = '#9BF0FF'; g.beginPath(); g.ellipse(x, base - s * 0.35, s * 0.2, s * 0.12, 0, Math.PI, 0); g.fill();
        }
      }

      function drawTile(g, c, r, T) {
        var a = stage.art, t = stage.grid[r][c], x = c * T, y = r * T;
        var lw = Math.max(1.5, T * 0.055);
        g.lineWidth = lw; g.strokeStyle = INK; g.lineJoin = 'round';
        var rr = rng(c * 131 + r * 17 + 7);
        if (t === '#') {
          var up = r > 0 ? stage.grid[r - 1][c] : '.', left = c > 0 ? stage.grid[r][c - 1] : '#', right = c < stage.w - 1 ? stage.grid[r][c + 1] : '#';
          var topOpen = up !== '#', lOpen = left !== '#', rOpen = right !== '#';
          // the earth, darker the deeper it goes, with a stripe and a pebble or two
          g.fillStyle = r >= 11 ? a.dirtDeep : a.dirt;
          g.fillRect(x, y, T + 0.5, T + 0.5);
          g.fillStyle = a.dirtStripe;
          g.fillRect(x, y + T * (0.55 + rr() * 0.15), T + 0.5, T * 0.1);
          for (var p = 0; p < 2; p++) if (rr() < 0.7) {
            g.fillStyle = a.pebble;
            g.beginPath(); g.ellipse(x + T * (0.15 + rr() * 0.7), y + T * (0.3 + rr() * 0.55), T * 0.07, T * 0.045, 0, 0, Math.PI * 2); g.fill();
          }
          if (lOpen) { g.fillStyle = a.dirtStripe; g.fillRect(x, y, T * 0.1, T + 0.5); g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + T + 0.5); g.stroke(); }
          if (rOpen) { g.fillStyle = a.dirtStripe; g.fillRect(x + T * 0.9, y, T * 0.1, T + 0.5); g.beginPath(); g.moveTo(x + T, y); g.lineTo(x + T, y + T + 0.5); g.stroke(); }
          if (topOpen) {
            // the top: a thick cap (grass, cloud, rock), scalloped underneath, lit along its top
            var capH = T * 0.36;
            g.fillStyle = a.grass;
            g.beginPath();
            g.moveTo(x - (lOpen ? -T * 0.02 : 0.5), y + capH);
            for (var s2 = 0; s2 <= 4; s2++) g.quadraticCurveTo(x + (s2 - 0.5) * T / 4, y + capH + T * 0.12, x + s2 * T / 4, y + capH);
            g.lineTo(x + T + (rOpen ? 0 : 0.5), y);
            g.lineTo(x - (lOpen ? 0 : 0.5), y);
            g.closePath(); g.fill();
            g.fillStyle = a.grassDark;
            g.fillRect(x, y + capH - T * 0.06, T + 0.5, T * 0.06);
            g.fillStyle = a.grassLight;
            g.fillRect(x + (lOpen ? T * 0.08 : 0), y + T * 0.05, T * (lOpen || rOpen ? 0.84 : 1) + 0.5, T * 0.07);
            g.beginPath(); g.moveTo(x - 0.5, y); g.lineTo(x + T + 0.5, y); g.stroke();
            if (lOpen) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + capH); g.stroke(); }
            if (rOpen) { g.beginPath(); g.moveTo(x + T, y); g.lineTo(x + T, y + capH); g.stroke(); }
            // blades of grass (or little cloud puffs, or crystal spikes)
            if (a.blades) {
              g.fillStyle = a.grassDark;
              for (var b = 0; b < 3; b++) {
                var bx = x + T * (0.12 + rr() * 0.76), bh = T * (0.12 + rr() * 0.12);
                g.beginPath(); g.moveTo(bx - T * 0.04, y + 1); g.lineTo(bx + T * 0.01, y - bh); g.lineTo(bx + T * 0.05, y + 1); g.closePath(); g.fill();
              }
            } else if (a.puffs) {
              g.fillStyle = a.grass;
              for (var pf = 0; pf < 3; pf++) { g.beginPath(); g.arc(x + T * (0.2 + pf * 0.3), y + T * 0.02, T * 0.16, Math.PI, 0); g.fill(); g.stroke(); }
            }
          }
        } else if (t === '=') {
          if (a.block === 'lily') {
            // a lily pad floating on the water
            g.fillStyle = a.water; g.fillRect(x, y + T * 0.3, T + 0.5, T * 0.7 + 0.5);
            g.fillStyle = '#3E9A3A';
            g.beginPath(); g.ellipse(x + T / 2, y + T * 0.16, T * 0.62, T * 0.2, 0, 0.2, Math.PI * 2 - 0.2); g.lineTo(x + T / 2, y + T * 0.16); g.closePath(); g.fill(); g.stroke();
            g.fillStyle = '#6CCB4E';
            g.beginPath(); g.ellipse(x + T / 2, y + T * 0.12, T * 0.5, T * 0.13, 0, 0.25, Math.PI * 2 - 0.25); g.lineTo(x + T / 2, y + T * 0.12); g.closePath(); g.fill();
            if (rr() < 0.5) { g.fillStyle = '#FFB3D1'; g.beginPath(); g.arc(x + T * 0.3, y + T * 0.05, T * 0.09, 0, Math.PI * 2); g.fill(); g.stroke(); }
          } else if (a.block === 'cloud') {
            // a soft cloud brick: white, lilac underneath, puffy on top
            g.fillStyle = '#FFFFFF'; roundRectOn(g, x + 1, y + 1, T - 2, T - 2, T * 0.3); g.fill();
            g.fillStyle = '#E6DCFF'; g.fillRect(x + T * 0.12, y + T * 0.7, T * 0.76, T * 0.16);
            roundRectOn(g, x + 1, y + 1, T - 2, T - 2, T * 0.3); g.stroke();
            g.fillStyle = 'rgba(255, 179, 209, 0.5)'; g.beginPath(); g.arc(x + T * 0.3, y + T * 0.32, T * 0.09, 0, Math.PI * 2); g.fill();
          } else {
            // a bevelled block: light on top and left, shadow bottom and right, with a shine
            var bc = a.blockColor;
            g.fillStyle = bc; roundRectOn(g, x + 1, y + 1, T - 2, T - 2, T * 0.14); g.fill();
            g.fillStyle = shade(bc, 0.28); g.fillRect(x + T * 0.12, y + T * 0.1, T * 0.76, T * 0.12); g.fillRect(x + T * 0.1, y + T * 0.12, T * 0.12, T * 0.66);
            g.fillStyle = shade(bc, -0.22); g.fillRect(x + T * 0.14, y + T * 0.78, T * 0.74, T * 0.1); g.fillRect(x + T * 0.78, y + T * 0.2, T * 0.1, T * 0.6);
            if (a.block === 'crystal') crystal(g, x + T * 0.5, y + T * 0.58, T * 0.2, '#7FE7FF', 1);
            else { g.fillStyle = shade(bc, -0.3); [[0.24, 0.24], [0.76, 0.24], [0.24, 0.76], [0.76, 0.76]].forEach(function (n) { g.beginPath(); g.arc(x + T * n[0], y + T * n[1], T * 0.045, 0, Math.PI * 2); g.fill(); }); }
            roundRectOn(g, x + 1, y + 1, T - 2, T - 2, T * 0.14); g.stroke();
          }
        } else if (t === '-') {
          var leftEnd = c === 0 || stage.grid[r][c - 1] !== '-', rightEnd = c === stage.w - 1 || stage.grid[r][c + 1] !== '-';
          if (a.ledge === 'cloud') {
            if (leftEnd || c === c0Draw) {
              var e = c; while (e + 1 < stage.w && stage.grid[r][e + 1] === '-') e++;
              var s0 = c; while (s0 > 0 && stage.grid[r][s0 - 1] === '-') s0--;
              cloudBank(g, s0 * T, (e + 1) * T, y, T);
            }
          } else if (a.ledge === 'crystal') {
            g.fillStyle = '#B79CFF'; roundRectOn(g, x, y, T + 0.5, T * 0.3, leftEnd || rightEnd ? T * 0.12 : 0); g.fill(); g.stroke();
            if (rr() < 0.5) crystal(g, x + T * 0.5, y - T * 0.02, T * 0.12, '#FF9BE0', 1);
          } else {
            // a wooden plank with grain
            var l0 = leftEnd ? x + T * 0.04 : x, w0 = T + 0.5 - (leftEnd ? T * 0.04 : 0) - (rightEnd ? T * 0.04 : 0);
            g.fillStyle = a.plank; roundRectOn(g, l0, y, w0, T * 0.32, leftEnd || rightEnd ? T * 0.13 : 0); g.fill();
            g.fillStyle = shade(a.plank, 0.25); g.fillRect(l0 + 2, y + T * 0.05, w0 - 4, T * 0.06);
            g.strokeStyle = shade(a.plank, -0.25); g.lineWidth = lw * 0.6;
            g.beginPath(); g.moveTo(x + T * 0.1, y + T * 0.2); g.lineTo(x + T * 0.75, y + T * 0.2); g.stroke();
            g.strokeStyle = INK; g.lineWidth = lw;
            roundRectOn(g, l0, y, w0, T * 0.32, leftEnd || rightEnd ? T * 0.13 : 0); g.stroke();
          }
        } else if (t === '~' && (r === 10 || r === 11)) {
          if (a.pit === 'water') {
            g.fillStyle = r === 10 ? a.water : shade(a.water, -0.2);
            g.fillRect(x, y + (r === 10 ? T * 0.3 : 0), T + 0.5, T + 0.5);
          } else if (a.pit === 'hole') {
            g.fillStyle = r === 10 ? a.holeTop : a.hole;
            g.fillRect(x, y + T * 0.36, T + 0.5, T + 0.5);
          }
        }
      }

      /** A long cloud to stand on: a row of puffs, outlined as one shape. */
      function cloudBank(g, x0, x1, y, T) {
        var n = Math.max(2, Math.round((x1 - x0) / (T * 0.5))), step = (x1 - x0) / n, rad = T * 0.3, i;
        var puffs = [];
        for (i = 0; i <= n; i++) puffs.push([x0 + i * step, y + T * 0.16 + (i % 2 ? -T * 0.04 : T * 0.02), rad * (i === 0 || i === n ? 0.8 : 1)]);
        g.fillStyle = INK;
        puffs.forEach(function (p) { g.beginPath(); g.arc(p[0], p[1], p[2] + Math.max(1.5, T * 0.055), 0, Math.PI * 2); g.fill(); });
        g.fillStyle = '#E3D8FF';
        puffs.forEach(function (p) { g.beginPath(); g.arc(p[0], p[1], p[2], 0, Math.PI * 2); g.fill(); });
        g.fillStyle = '#FFFFFF';
        puffs.forEach(function (p) { g.beginPath(); g.arc(p[0] - T * 0.02, p[1] - T * 0.05, p[2] * 0.85, 0, Math.PI * 2); g.fill(); });
      }

      function roundRectOn(g, x, y, w, h, r) {
        r = Math.min(r, h / 2, w / 2);
        g.beginPath(); g.moveTo(x + r, y);
        g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
        g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r);
        g.closePath();
      }

      /* ---- a frame ---- */

      function draw() {
        var T = view.tile, a = stage.art;
        // the sky
        var sky = pen.createLinearGradient(0, 0, 0, view.py);
        sky.addColorStop(0, dark ? a.nightTop : a.skyTop);
        sky.addColorStop(1, dark ? a.nightBottom : a.skyBottom);
        pen.fillStyle = sky;
        pen.fillRect(0, 0, view.px, view.py);
        // the sun (or the moon and the stars)
        var sx = view.px * 0.82, sy = Math.min(view.py * 0.16, T * 2.2);
        if (dark) {
          for (var st = 0; st < 26; st++) {
            var tw = 0.4 + 0.6 * Math.abs(Math.sin(ctx.time * (0.6 + (st % 5) * 0.2) + st));
            pen.fillStyle = 'rgba(255,255,255,' + (tw * 0.8).toFixed(2) + ')';
            pen.fillRect(((st * 97) % 100) / 100 * view.px, ((st * 53) % 60) / 100 * view.py * 0.7, 2, 2);
          }
          if (a.sun) {
            // a full moon with a soft glow and a few craters
            pen.fillStyle = 'rgba(255, 246, 201, 0.16)'; pen.beginPath(); pen.arc(sx, sy, T * 1.2, 0, Math.PI * 2); pen.fill();
            pen.fillStyle = '#FFF6C9'; pen.beginPath(); pen.arc(sx, sy, T * 0.7, 0, Math.PI * 2); pen.fill();
            pen.fillStyle = 'rgba(214, 200, 150, 0.6)';
            [[-0.25, -0.15, 0.16], [0.2, 0.2, 0.12], [0.22, -0.28, 0.08]].forEach(function (k) { pen.beginPath(); pen.arc(sx + k[0] * T, sy + k[1] * T, k[2] * T, 0, Math.PI * 2); pen.fill(); });
          }
        } else if (a.sun) {
          pen.fillStyle = 'rgba(255, 240, 160, 0.35)'; pen.beginPath(); pen.arc(sx, sy, T * 1.3, 0, Math.PI * 2); pen.fill();
          pen.fillStyle = '#FFE36B'; pen.beginPath(); pen.arc(sx, sy, T * 0.8, 0, Math.PI * 2); pen.fill();
          pen.strokeStyle = INK; pen.lineWidth = Math.max(1.5, T * 0.05); pen.stroke();
          pen.fillStyle = '#FFF3B0'; pen.beginPath(); pen.arc(sx - T * 0.22, sy - T * 0.22, T * 0.28, 0, Math.PI * 2); pen.fill();
        }
        // far layer, clouds, near layer
        drawStrip('far', 0.15, 0.6);
        clouds();
        drawStrip('near', 0.4, -0.1);
        // the stage: its pre-drawn chunks
        var k0 = Math.floor(cam.x / CHUNK), k1 = Math.floor((cam.x + view.w) / CHUNK);
        for (var k = k0; k <= k1; k++) {
          if (k < 0 || k * CHUNK >= stage.w) continue;
          pen.drawImage(chunk(k), (k * CHUNK - cam.x) * T, (0 - cam.y) * T, CHUNK * T, ROWS * T);
        }
        if (a.ceiling) ceiling();
        // under the stage (a tall screen shows all of it): more earth
        // gaps stay gaps all the way down: a dark hole, deep water, or (up in the clouds) just sky
        var below = (ROWS - cam.y) * T;
        if (below < view.py) {
          var earth = dark ? shade(a.dirtDeep, -0.35) : a.dirtDeep;
          var pitCol = a.pit === 'hole' ? a.hole : a.pit === 'water' ? shade(a.water, -0.2) : null;
          if (dark && pitCol) pitCol = shade(pitCol, -0.3);
          var cA = Math.max(0, Math.floor(cam.x)), cB = Math.min(stage.w - 1, Math.ceil(cam.x + view.w));
          for (var c = cA; c <= cB; c++) {
            var gap = stage.grid[ROWS - 1][c] === '~';
            if (gap && !pitCol) continue;
            var run = c;
            while (run + 1 <= cB && (stage.grid[ROWS - 1][run + 1] === '~') === gap) run++;
            pen.fillStyle = gap ? pitCol : earth;
            var x0 = c === 0 ? 0 : (c - cam.x) * T, x1 = run === stage.w - 1 ? view.px : (run + 1 - cam.x) * T;
            pen.fillRect(x0 - (c === cA ? T : 0), below, x1 - x0 + (c === cA ? T : 0) + 0.5, view.py - below);
            c = run;
          }
        }
        water();
        lifeStep();
        // gates and doors
        pen.lineWidth = Math.max(1.5, T * 0.06);
        pen.strokeStyle = INK;
        Object.keys(stage.gates).forEach(function (gc) { if (!gateOpen) wall(+gc, stage.gates[gc], 'bars'); });
        Object.keys(stage.doors).forEach(function (dc) { if (!doorOpen) wall(+dc, stage.doors[dc], 'door'); });
        movers.forEach(drawMover);
        items.forEach(drawItem);
        critters.forEach(drawCritter);
        heroes.forEach(drawHero);
      }

      /** The cave roof: rock and stalactites along the top of the screen. */
      function ceiling() {
        var T = view.tile, key = 'roof' + (dark ? 'N' : 'D');
        if (!strips[key]) {
          var W = Math.ceil(T * 16), H = Math.ceil(T * 1.6), dpr = Math.min(1.5, window.devicePixelRatio || 1);
          var cv = document.createElement('canvas');
          cv.width = Math.ceil(W * dpr); cv.height = Math.ceil(H * dpr);
          var g = cv.getContext('2d'), r = rng(stageNo * 3 + 5), rock = dark ? shade(stage.art.dirt, -0.3) : stage.art.dirt;
          g.scale(dpr, dpr);
          g.lineWidth = Math.max(1.5, T * 0.055); g.strokeStyle = INK; g.lineJoin = 'round';
          g.fillStyle = rock;
          g.beginPath(); g.moveTo(0, 0);
          for (var x = 0; x <= W; x += T * 0.5) g.lineTo(x, T * (0.25 + 0.15 * Math.sin(x / T * 1.3)));
          g.lineTo(W, 0); g.closePath(); g.fill();
          for (var k = 0; k < 9; k++) {
            var sx = (k + 0.2 + r() * 0.6) * W / 9, sw = T * (0.22 + r() * 0.18), sh = T * (0.6 + r() * 0.8);
            g.fillStyle = rock;
            g.beginPath(); g.moveTo(sx - sw, T * 0.2); g.lineTo(sx, T * 0.2 + sh); g.lineTo(sx + sw, T * 0.2); g.closePath(); g.fill(); g.stroke();
            g.fillStyle = 'rgba(255,255,255,0.18)';
            g.beginPath(); g.moveTo(sx - sw * 0.6, T * 0.22); g.lineTo(sx - sw * 0.1, T * 0.2 + sh * 0.7); g.lineTo(sx - sw * 0.1, T * 0.22); g.closePath(); g.fill();
          }
          g.beginPath(); g.moveTo(0, 0);
          for (var x2 = 0; x2 <= W; x2 += T * 0.5) g.lineTo(x2, T * (0.25 + 0.15 * Math.sin(x2 / T * 1.3)));
          g.stroke();
          strips[key] = { cv: cv, w: W, h: H };
        }
        var st = strips[key], off = -((cam.x * T) % st.w);
        for (var x3 = off; x3 < view.px; x3 += st.w) pen.drawImage(st.cv, x3, 0, st.w, st.h);
      }

      var cloudSprites = null;
      function clouds() {
        var T = view.tile, a = stage.art;
        if (!a.clouds) return;
        if (!cloudSprites || cloudSprites.T !== T || cloudSprites.dark !== dark) {
          cloudSprites = { T: T, dark: dark, list: [0, 1, 2].map(function (i) {
            var cv = document.createElement('canvas'), w = T * 4, h = T * 2.2;
            cv.width = Math.ceil(w); cv.height = Math.ceil(h);
            var g = cv.getContext('2d');
            cloud(g, w / 2, h * 0.55, T * (0.75 + i * 0.12), dark ? '#5B5F9A' : '#FFFFFF', dark ? '#43477E' : (a.cloudShade || '#DCE9F7'), 1);
            return cv;
          }) };
        }
        var span = view.w + 8;
        for (var i = 0; i < 5; i++) {
          var cx = ((i * 7.3 + (still ? 0 : ctx.time) * (0.25 + i * 0.05) - cam.x * 0.25) % span + span) % span - 4;
          var cy = 0.8 + (i * 1.37) % 3.2 - cam.y * 0.3;
          var c = cloudSprites.list[i % 3];
          pen.globalAlpha = 0.95 - i * 0.07;
          pen.drawImage(c, cx * T, cy * T);
        }
        pen.globalAlpha = 1;
      }

      function water() {
        var a = stage.art, T = view.tile;
        if (a.pit !== 'water') return;
        var c0 = Math.max(0, Math.floor(cam.x)), c1 = Math.min(stage.w - 1, Math.ceil(cam.x + view.w));
        pen.strokeStyle = 'rgba(255,255,255,0.75)';
        pen.lineWidth = Math.max(1.5, T * 0.06);
        pen.lineCap = 'round';
        for (var c = c0; c <= c1; c++) {
          if (stage.grid[10][c] !== '~') continue;
          var x = (c - cam.x) * T, y = (10.3 - cam.y) * T;
          // a wavy surface line and a glint that comes and goes
          pen.beginPath();
          for (var s = 0; s <= 6; s++) {
            var px = x + s * T / 6, py = y + Math.sin((still ? 0 : ctx.time) * 3 + c * 1.3 + s) * T * 0.04;
            if (s) pen.lineTo(px, py); else pen.moveTo(px, py);
          }
          pen.stroke();
          var gl = Math.sin(ctx.time * 2 + c * 2.1);
          if (gl > 0.7) { pen.fillStyle = 'rgba(255,255,255,0.8)'; pen.fillRect(x + T * 0.4, y + T * 0.25, T * 0.18, T * 0.05); }
        }
        pen.lineCap = 'butt';
      }

      function lifeStep() {
        var T = view.tile;
        life.forEach(function (b) {
          b.t += frameDt;
          // keep them near the camera: one that wanders off comes back in from the other side
          if (b.x < cam.x - 2) b.x += view.w + 3;
          if (b.x > cam.x + view.w + 2) b.x -= view.w + 3;
          var x, y;
          if (b.kind === 'butterfly' || b.kind === 'dragonfly') {
            b.x += (b.kind === 'dragonfly' ? 1.4 : 0.5) * frameDt * (Math.sin(b.t * 0.3 + b.seed * 9) > 0 ? 1 : -1);
            x = (b.x - cam.x) * T; y = (b.y + Math.sin(b.t * 1.7 + b.seed * 5) * 0.8 - cam.y) * T;
            var flap = Math.abs(Math.sin(b.t * (b.kind === 'dragonfly' ? 30 : 12)));
            pen.fillStyle = b.kind === 'dragonfly' ? 'rgba(160, 230, 255, 0.85)' : ['#FF8FB8', '#FFC36B', '#B79CFF'][Math.floor(b.seed * 3)];
            pen.beginPath(); pen.ellipse(x - T * 0.1, y, T * 0.12, T * 0.09 * flap + 1, 0.4, 0, Math.PI * 2); pen.fill();
            pen.beginPath(); pen.ellipse(x + T * 0.1, y, T * 0.12, T * 0.09 * flap + 1, -0.4, 0, Math.PI * 2); pen.fill();
            pen.fillStyle = INK; pen.fillRect(x - 1, y - T * 0.08, 2, T * 0.16);
          } else if (b.kind === 'leaf') {
            b.y += 0.6 * frameDt; b.x += Math.sin(b.t * 1.5 + b.seed * 6) * 0.6 * frameDt;
            if (b.y > 10.5) { b.y = cam.y - 0.5; b.x = cam.x + Math.random() * view.w; }
            x = (b.x - cam.x) * T; y = (b.y - cam.y) * T;
            pen.save(); pen.translate(x, y); pen.rotate(Math.sin(b.t * 2 + b.seed * 4) * 0.8);
            pen.fillStyle = ['#E89A3C', '#D9622B', '#8CC152'][Math.floor(b.seed * 3)];
            pen.beginPath(); pen.ellipse(0, 0, T * 0.13, T * 0.06, 0, 0, Math.PI * 2); pen.fill();
            pen.restore();
          } else if (b.kind === 'firefly' || b.kind === 'twinkle') {
            b.x += Math.sin(b.t * 0.7 + b.seed * 8) * 0.25 * frameDt; b.y += Math.cos(b.t * 0.9 + b.seed * 3) * 0.2 * frameDt;
            x = (b.x - cam.x) * T; y = (b.y - cam.y) * T;
            var glow = 0.35 + 0.65 * Math.abs(Math.sin(b.t * 1.6 + b.seed * 7));
            pen.fillStyle = b.kind === 'firefly' ? 'rgba(255, 240, 140,' + (glow * 0.35).toFixed(2) + ')' : 'rgba(255,255,255,' + (glow * 0.3).toFixed(2) + ')';
            pen.beginPath(); pen.arc(x, y, T * 0.18, 0, Math.PI * 2); pen.fill();
            pen.fillStyle = b.kind === 'firefly' ? 'rgba(255, 248, 190,' + glow.toFixed(2) + ')' : 'rgba(255,255,255,' + glow.toFixed(2) + ')';
            pen.beginPath(); pen.arc(x, y, T * 0.05, 0, Math.PI * 2); pen.fill();
          }
        });
      }

      function wall(c, rBottom, kind) {
        var T = view.tile, x = (c - cam.x) * T, top = Math.min(0, -cam.y * T), y = (rBottom + 1 - cam.y) * T;
        var w = T * 0.8, l = x + T * 0.1;
        if (kind === 'bars') {
          pen.fillStyle = '#6E7391';
          pen.fillRect(l, top, w, T * 0.18 + (y - top) * 0);
          for (var k = 0; k < 4; k++) {
            var bx = l + T * 0.06 + k * w / 4;
            pen.fillStyle = '#B9BED6'; pen.fillRect(bx, top, w / 6, y - top);
            pen.fillStyle = '#E4E7F5'; pen.fillRect(bx + 1, top, w / 18, y - top);
            pen.strokeRect(bx, top, w / 6, y - top);
          }
          for (var cross = y - T * 0.5; cross > top; cross -= T * 2) { pen.fillStyle = '#8A90B0'; pen.fillRect(l, cross, w, T * 0.16); pen.strokeRect(l, cross, w, T * 0.16); }
        } else {
          pen.fillStyle = '#B86B2E'; pen.fillRect(l, top, w, y - top); pen.strokeRect(l, top, w, y - top);
          pen.strokeStyle = '#8A4E20';
          for (var pl = 1; pl < 3; pl++) { pen.beginPath(); pen.moveTo(l + pl * w / 3, top); pen.lineTo(l + pl * w / 3, y); pen.stroke(); }
          pen.strokeStyle = INK;
          pen.fillStyle = '#7A7FA0';
          for (var band = y - T * 0.6; band > top; band -= T * 2.2) { pen.fillRect(l, band, w, T * 0.14); pen.strokeRect(l, band, w, T * 0.14); }
          pen.fillStyle = '#F7D046'; pen.beginPath(); pen.arc(l + w / 2, y - T * 1.1, T * 0.2, 0, Math.PI * 2); pen.fill(); pen.stroke();
          pen.fillStyle = INK; pen.beginPath(); pen.arc(l + w / 2, y - T * 1.14, T * 0.06, 0, Math.PI * 2); pen.fill(); pen.fillRect(l + w / 2 - T * 0.025, y - T * 1.12, T * 0.05, T * 0.12);
        }
      }

      function drawMover(m) {
        var T = view.tile, x = (m.x - cam.x) * T, y = (m.y - cam.y) * T, w = m.w * T;
        if (m.kind === 'raft') {
          // three logs tied together
          for (var l = 0; l < 3; l++) {
            pen.fillStyle = '#B87842';
            roundRectOn(pen, x + l * w / 3, y, w / 3 + 1, T * 0.4, T * 0.18); pen.fill(); pen.stroke();
            pen.fillStyle = '#E6C08E'; pen.beginPath(); pen.ellipse(x + l * w / 3 + T * 0.14, y + T * 0.2, T * 0.08, T * 0.14, 0, 0, Math.PI * 2); pen.fill(); pen.stroke();
          }
          pen.fillStyle = '#F6E3C0'; pen.fillRect(x + w * 0.3, y + T * 0.04, T * 0.08, T * 0.32); pen.fillRect(x + w * 0.65, y + T * 0.04, T * 0.08, T * 0.32);
        } else {
          // a little sky lift with a propeller
          pen.fillStyle = '#FFD84D'; roundRectOn(pen, x, y, w, T * 0.36, T * 0.14); pen.fill(); pen.stroke();
          pen.fillStyle = '#FF9B3D'; for (var s = 0; s < 4; s++) pen.fillRect(x + T * 0.3 + s * w / 4, y + T * 0.06, T * 0.18, T * 0.24);
          var spin = Math.sin(ctx.time * 30) * T * 0.5;
          pen.fillStyle = INK; pen.fillRect(x + w / 2 - 1, y - T * 0.3, 2, T * 0.3);
          pen.fillStyle = '#C6C9E0'; pen.beginPath(); pen.ellipse(x + w / 2, y - T * 0.32, Math.abs(spin) + 2, T * 0.06, 0, 0, Math.PI * 2); pen.fill(); pen.stroke();
        }
      }

      function drawItem(it) {
        if (it.gone) return;
        var T = view.tile, bob = Math.sin(ctx.time * 3 + it.x) * 0.06;
        if (it.kind === 'acorn') drawSprite('🌰', it.x, it.y + bob, T * 0.62);
        else if (it.kind === 'star') {
          // a star glows
          var gx = (it.x - cam.x) * T, gy = (it.y + bob - cam.y) * T, pulse = 0.5 + 0.5 * Math.sin(ctx.time * 4 + it.x);
          pen.fillStyle = 'rgba(255, 226, 100,' + (0.18 + pulse * 0.2).toFixed(2) + ')';
          pen.beginPath(); pen.arc(gx, gy, T * (0.6 + pulse * 0.12), 0, Math.PI * 2); pen.fill();
          drawSprite('⭐', it.x, it.y + bob, T * 0.9);
        } else if (it.kind === 'key') {
          var kx = (it.x - cam.x) * T, ky = (it.y + bob - cam.y) * T;
          pen.fillStyle = 'rgba(255, 240, 160, 0.35)'; pen.beginPath(); pen.arc(kx, ky, T * 0.55, 0, Math.PI * 2); pen.fill();
          drawSprite('🔑', it.x, it.y + bob, T * 0.8);
        } else if (it.kind === 'spring') {
          it.squash *= 0.85;
          var sx = (it.x - cam.x) * T, sy = (it.y - cam.y) * T, hgt = T * (0.55 - it.squash * 0.3);
          pen.fillStyle = '#9AA0B8'; roundRectOn(pen, sx - T * 0.36, sy - T * 0.1, T * 0.72, T * 0.1, 2); pen.fill(); pen.stroke();
          pen.strokeStyle = '#C6C9E0'; pen.lineWidth = Math.max(2, T * 0.08);
          pen.beginPath();
          for (var z = 0; z <= 4; z++) { var zy = sy - T * 0.1 - z * (hgt - T * 0.3) / 4; pen.lineTo(sx + (z % 2 ? T * 0.22 : -T * 0.22), zy); }
          pen.stroke();
          pen.strokeStyle = INK; pen.lineWidth = Math.max(1.5, T * 0.06);
          pen.fillStyle = '#E8435A'; roundRectOn(pen, sx - T * 0.42, sy - hgt, T * 0.84, T * 0.2, T * 0.08); pen.fill(); pen.stroke();
          pen.fillStyle = '#FF8FA3'; pen.fillRect(sx - T * 0.32, sy - hgt + T * 0.04, T * 0.4, T * 0.05);
        } else if (it.kind === 'button') {
          var bx = (it.x - cam.x) * T, by = (it.y - cam.y) * T;
          pen.fillStyle = '#7A7FA0'; roundRectOn(pen, bx - T * 0.45, by - T * 0.1, T * 0.9, T * 0.1, 2); pen.fill(); pen.stroke();
          pen.fillStyle = it.down ? '#6CCB4E' : '#E8435A';
          pen.beginPath(); pen.ellipse(bx, by - T * 0.1, T * 0.34, T * (it.down ? 0.06 : 0.2), 0, Math.PI, 0); pen.fill(); pen.stroke();
          if (!it.down) { pen.fillStyle = 'rgba(255,255,255,0.6)'; pen.beginPath(); pen.ellipse(bx - T * 0.1, by - T * 0.2, T * 0.08, T * 0.04, 0, 0, Math.PI * 2); pen.fill(); }
        } else if (it.kind === 'home') treeHouse(it);
        else if (it.kind === 'chick') {
          var nx = (it.x - cam.x) * T, ny = (it.y - cam.y) * T;
          pen.fillStyle = '#B98A55'; pen.beginPath(); pen.ellipse(nx, ny - T * 0.15, T * 0.6, T * 0.22, 0, 0, Math.PI * 2); pen.fill(); pen.stroke();
          drawSprite('🐣', it.x, it.y - 0.55 + Math.abs(Math.sin(ctx.time * 4)) * -0.1, T * 1.1);
        }
      }

      /** Home: a tree house on a big oak, with a flag. */
      function treeHouse(it) {
        var T = view.tile, x = (it.x - cam.x) * T, base = (it.y - cam.y) * T;
        pen.lineWidth = Math.max(1.5, T * 0.06); pen.strokeStyle = INK;
        pen.fillStyle = '#8A5A35'; pen.fillRect(x - T * 0.35, base - T * 2.6, T * 0.7, T * 2.6); pen.strokeRect(x - T * 0.35, base - T * 2.6, T * 0.7, T * 2.6);
        tree(pen, x, base - T * 1.7, T * 1.25, stage.art.leaf, stage.art.leafDark, false);
        // the little house in the branches
        var hx = x - T * 0.75, hy = base - T * 2.9;
        pen.fillStyle = '#F2B866'; pen.fillRect(hx, hy, T * 1.5, T * 0.95); pen.strokeRect(hx, hy, T * 1.5, T * 0.95);
        pen.fillStyle = '#E8435A'; pen.beginPath(); pen.moveTo(hx - T * 0.2, hy); pen.lineTo(hx + T * 0.75, hy - T * 0.7); pen.lineTo(hx + T * 1.7, hy); pen.closePath(); pen.fill(); pen.stroke();
        pen.fillStyle = '#8A4E20'; pen.fillRect(hx + T * 0.55, hy + T * 0.35, T * 0.4, T * 0.6); pen.strokeRect(hx + T * 0.55, hy + T * 0.35, T * 0.4, T * 0.6);
        pen.fillStyle = '#7CC8F7'; pen.fillRect(hx + T * 0.15, hy + T * 0.22, T * 0.3, T * 0.3); pen.strokeRect(hx + T * 0.15, hy + T * 0.22, T * 0.3, T * 0.3);
        // the flag flutters
        var fx2 = x + T * 0.9, fy = base - T * 3.9, wave = Math.sin(ctx.time * 6) * T * 0.08;
        pen.fillStyle = INK; pen.fillRect(fx2 - 1, fy, 3, T * 1.1);
        pen.fillStyle = '#FFD84D'; pen.beginPath(); pen.moveTo(fx2 + 2, fy); pen.quadraticCurveTo(fx2 + T * 0.4, fy + wave, fx2 + T * 0.75, fy + T * 0.22); pen.lineTo(fx2 + 2, fy + T * 0.45); pen.closePath(); pen.fill(); pen.stroke();
        // a ladder down to the ground
        pen.strokeStyle = '#6B4424';
        pen.beginPath(); pen.moveTo(x - T * 0.55, base); pen.lineTo(x - T * 0.55, base - T * 2); pen.moveTo(x - T * 0.2, base); pen.lineTo(x - T * 0.2, base - T * 2); pen.stroke();
        for (var rung = 0; rung < 5; rung++) { pen.beginPath(); pen.moveTo(x - T * 0.55, base - T * (0.3 + rung * 0.38)); pen.lineTo(x - T * 0.2, base - T * (0.3 + rung * 0.38)); pen.stroke(); }
        pen.strokeStyle = INK;
      }

      /** A soft shadow on whatever is below (ground, branch, raft), smaller the higher up. */
      function shadowUnder(x, y, w) {
        var T = view.tile, c = Math.floor(x), floorY = null;
        for (var r = Math.floor(y + 0.02); r < ROWS && r < y + 6; r++) { if (solid(c, r) || tileAt(c, r) === '-') { floorY = r; break; } }
        movers.forEach(function (m) { if (x >= m.x && x <= m.x + m.w && m.y >= y - 0.05 && (floorY == null || m.y < floorY)) floorY = m.y; });
        if (floorY == null) return;
        var lift = Math.max(0, floorY - y), k = Math.max(0.25, 1 - lift / 5);
        pen.fillStyle = 'rgba(20, 16, 50,' + (0.28 * k).toFixed(2) + ')';
        pen.beginPath(); pen.ellipse((x - cam.x) * T, (floorY - cam.y) * T, w * T * 0.55 * k, T * 0.09 * k, 0, 0, Math.PI * 2); pen.fill();
      }

      function drawCritter(cr) {
        var T = view.tile;
        if (!cr.alive) {
          if (cr.poof < 0.5) { pen.globalAlpha = 1 - cr.poof * 2; drawSprite(cr.emoji, cr.x, cr.y - cr.h / 2 - cr.poof * 2, T * 0.8, cr.vx > 0); pen.globalAlpha = 1; }
          return;
        }
        shadowUnder(cr.x, cr.y, cr.w);
        var wob = cr.kind === 'snail' ? Math.sin(cr.t * 4) * 0.03 : 0;
        drawSprite(cr.emoji, cr.x, cr.y - cr.h / 2 + wob, T * 0.85, cr.vx > 0);
      }

      function drawHero(h) {
        var T = view.tile, p = players[h.i];
        var x = (h.x - cam.x) * T, y = (h.y - cam.y) * T;
        if (!h.bubble) shadowUnder(h.x, h.y, h.w);
        if (h.inv > 0 && !h.bubble && Math.floor(h.inv * 10) % 2) pen.globalAlpha = 0.5;
        var sq = h.squash, rx = T * 0.46 * (1 + sq), ry = T * 0.48 * (1 - sq);
        var bounce = h.ground && Math.abs(h.vx) > 0.5 ? Math.abs(Math.sin(h.walkT * 3)) * T * 0.07 : 0;
        if (h.home) bounce = Math.abs(Math.sin(h.walkT * 6)) * T * 0.18;
        var cy = y - ry - bounce;
        var col = paint[h.i] || { color: '#FF6F91', dark: '#C0436A' };
        pen.lineWidth = Math.max(1.5, T * 0.06); pen.strokeStyle = INK;
        // feet
        pen.fillStyle = col.dark;
        var step = Math.sin(h.walkT * 3) * T * 0.1;
        pen.beginPath(); pen.ellipse(x - T * 0.16 + step, y - T * 0.04, T * 0.13, T * 0.07, 0, 0, Math.PI * 2); pen.fill(); pen.stroke();
        pen.beginPath(); pen.ellipse(x + T * 0.16 - step, y - T * 0.04, T * 0.13, T * 0.07, 0, 0, Math.PI * 2); pen.fill(); pen.stroke();
        // body, with a rim of shade at the bottom and a shine at the top
        pen.fillStyle = col.color;
        pen.beginPath(); pen.ellipse(x, cy, rx, ry, 0, 0, Math.PI * 2); pen.fill();
        pen.save(); pen.clip();
        pen.fillStyle = 'rgba(20, 16, 50, 0.18)'; pen.beginPath(); pen.ellipse(x + rx * 0.2, cy + ry * 0.55, rx * 1.1, ry * 0.6, 0, 0, Math.PI * 2); pen.fill();
        pen.fillStyle = 'rgba(255, 255, 255, 0.35)'; pen.beginPath(); pen.ellipse(x - rx * 0.38, cy - ry * 0.45, rx * 0.34, ry * 0.22, -0.5, 0, Math.PI * 2); pen.fill();
        pen.restore();
        pen.beginPath(); pen.ellipse(x, cy, rx, ry, 0, 0, Math.PI * 2); pen.stroke();
        drawSprite(p.emoji, h.x + h.face * 0.04, (cy / T) + cam.y, T * 0.62, h.face > 0);
        // a hat, if one has been picked
        var hat = HATS[progress.hats[h.i]];
        if (hat && hat.e) drawSprite(hat.e, h.x - h.face * 0.06, (cy - ry) / T + cam.y + 0.02, T * 0.5, false);
        pen.globalAlpha = 1;
        if (h.dizzy > 0) drawSprite('💫', h.x, (cy / T) + cam.y - 0.75, T * 0.5);
        if (h.bubble) {
          pen.strokeStyle = 'rgba(255,255,255,0.9)';
          pen.fillStyle = 'rgba(190,232,255,0.35)';
          pen.beginPath(); pen.arc(x, cy, T * 0.68, 0, Math.PI * 2); pen.fill(); pen.stroke();
          pen.fillStyle = 'rgba(255,255,255,0.7)'; pen.beginPath(); pen.ellipse(x - T * 0.3, cy - T * 0.32, T * 0.12, T * 0.07, -0.6, 0, Math.PI * 2); pen.fill();
          pen.strokeStyle = INK;
        }
      }

      /* ---- the loop ---- */

      ctx.frame(function (dt) {
        if (state !== 'play' && state !== 'clear') return;
        // small steps, so nothing ever passes through a thin branch
        var n = Math.ceil(dt / (1 / 120));
        for (var s = 0; s < n; s++) step(dt / n);
        frameDt = Math.min(0.05, dt);
        draw();
      });

      function step(dt) {
        movers.forEach(function (m) {
          var ox = m.x, oy = m.y;
          m.t += dt;
          if (m.kind === 'raft') {
            var span = m.x1 - m.x0, period = span / m.speed * 2 + 2;
            var ph = (m.t % period);
            var k = ph < 1 ? 0 : ph < 1 + span / m.speed ? (ph - 1) * m.speed / span : ph < 2 + span / m.speed ? 1 : 1 - (ph - 2 - span / m.speed) * m.speed / span;
            m.x = m.x0 + span * util.clamp(k, 0, 1);
          } else {
            var spanY = m.y0 - m.y1, periodY = spanY / m.speed * 2 + 2.4, phY = m.t % periodY;
            var kY = phY < 1.2 ? 0 : phY < 1.2 + spanY / m.speed ? (phY - 1.2) * m.speed / spanY : phY < 2.4 + spanY / m.speed ? 1 : 1 - (phY - 2.4 - spanY / m.speed) * m.speed / spanY;
            m.y = m.y0 - spanY * util.clamp(kY, 0, 1);
          }
          m.dx = m.x - ox; m.dy = m.y - oy;
        });
        heroes.forEach(function (h) { stepHero(h, dt); });
        critters.forEach(function (c) { stepCritter(c, dt); });
        heroes.forEach(meet);
        heroes.forEach(function (h) { if (h.bubble && h.bubble.toHome && h.bubble.t >= 1) { h.bubble = null; arrive(h); } });
        aim(dt);
      }

      /* ---- controls: hold to walk, tap (and hold for higher) to jump ---- */

      pads.forEach(function (pad, i) {
        Object.keys(pad.keys).forEach(function (k) {
          var key = pad.keys[k];
          ctx.tap(key, function (ev) {
            if (state !== 'play') return;
            pad.held[k] = true;
            if (ev.pointerId != null) pad.pointers[ev.pointerId] = k;
            key.classList.add('is-down');
            if (k === 'jump') heroes[i].buffer = BUFFER;
          });
        });
      });
      function release(ev) {
        pads.forEach(function (pad) {
          var k = pad.pointers[ev.pointerId];
          if (!k) return;
          delete pad.pointers[ev.pointerId];
          if (!Object.keys(pad.pointers).some(function (id) { return pad.pointers[id] === k; })) { pad.held[k] = false; pad.keys[k].classList.remove('is-down'); }
        });
      }
      ctx.on(window, 'pointerup', release);
      ctx.on(window, 'pointercancel', release);
      // a thumb sliding from one arrow to the other changes direction
      ctx.on(window, 'pointermove', function (ev) {
        pads.forEach(function (pad) {
          var k = pad.pointers[ev.pointerId];
          if (!k || k === 'jump') return;
          var under = document.elementFromPoint(ev.clientX, ev.clientY);
          var btn = under && under.closest ? under.closest('.aq-key') : null;
          if (!btn || !pad.node.contains(btn) || btn.dataset.k === k || btn.dataset.k === 'jump') return;
          pad.held[k] = false; pad.keys[k].classList.remove('is-down');
          pad.pointers[ev.pointerId] = btn.dataset.k;
          pad.held[btn.dataset.k] = true; btn.classList.add('is-down');
        });
      });
      function releaseAll() { pads.forEach(function (pad) { pad.held = {}; pad.pointers = {}; Object.keys(pad.keys).forEach(function (k) { pad.keys[k].classList.remove('is-down'); }); }); keysDown = {}; }
      ctx.onResume(releaseAll);
      ctx.on(window, 'blur', releaseAll);
      ctx.on(window, 'keydown', function (ev) {
        var k = (ev.key || '').toLowerCase();
        if (['a', 'd', 'w', 'arrowleft', 'arrowright', 'arrowup'].indexOf(k) < 0 || state !== 'play' || ctx.paused) return;
        if (!keysDown[k]) {
          if (k === 'w') heroes[0].buffer = BUFFER;
          if (k === 'arrowup') heroes[1].buffer = BUFFER;
        }
        keysDown[k] = true;
        ev.preventDefault();
      });
      ctx.on(window, 'keyup', function (ev) { keysDown[(ev.key || '').toLowerCase()] = false; });

      /* ---- the map ---- */

      function showMap() {
        state = 'map';
        mapEl.hidden = false;
        playEl.hidden = true;
        ctx.setStatus(null);
        var open = allOpen ? STAGES.length : Math.min(STAGES.length, progress.cleared + 1);
        mapNodes.forEach(function (n, i) {
          var locked = i >= open;
          n.btn.classList.toggle('is-locked', locked);
          n.btn.setAttribute('aria-disabled', locked ? 'true' : 'false');
          n.btn.classList.toggle('is-next', i === Math.min(progress.cleared, STAGES.length - 1) && !locked);
          n.stars.textContent = '';
          for (var s = 0; s < 3; s++) n.stars.appendChild(el('span', { class: 'aq-star' + (s < (progress.stars[i] || 0) ? ' is-got' : ''), text: '⭐' }));
          if (locked) n.btn.querySelector('.aq-node__icon').setAttribute('data-locked', '🔒');
          else n.btn.querySelector('.aq-node__icon').removeAttribute('data-locked');
        });
        showHats();
        ctx.setTurn(null);
        var next = mapNodes[Math.min(progress.cleared, STAGES.length - 1)];
        if (next) ctx.hint(next.btn, { delay: 900 });
      }
      function showHats() {
        var total = starTotal(progress);
        closets.forEach(function (c, i) {
          var h = HATS[progress.hats[i]];
          c.hat.textContent = '';
          if (h.e) c.hat.appendChild(ctx.sticker(h.e));
          c.btn.classList.toggle('is-bare', !h.e);
        });
        // the next hat to earn, greyed, with how many stars it needs
        var next = HATS.filter(function (h) { return h.need > total; })[0];
        nextUp.textContent = '';
        nextUp.appendChild(el('span', { class: 'aq-nexthat__got' }, ctx.sticker('⭐'), el('b', { text: String(total) })));
        if (next) nextUp.appendChild(el('span', { class: 'aq-nexthat__next' }, el('span', { class: 'aq-nexthat__hat' }, ctx.sticker(next.e)), ctx.sticker('⭐'), el('b', { text: String(next.need) })));
      }
      closets.forEach(function (c, i) {
        ctx.tap(c.btn, function () {
          if (state !== 'map') return;
          var total = starTotal(progress), k = nextHat(progress.hats[i], total);
          if (k === progress.hats[i]) {
            // nothing earned yet: a little wiggle, and a nudge toward the stars
            fx.wiggle(c.btn);
            sfx.play('tap');
            return;
          }
          progress.hats[i] = k;
          try { ctx.save('progress', progress); } catch (e) {}
          showHats();
          sfx.play(k ? 'good' : 'tap');
          fx.bounce(c.btn);
          if (k) { var at = fx.centerOf(c.btn); fx.burst(at.x, at.y, { emoji: '✨', count: 6, distance: 44, size: 18 }); }
        });
      });

      ctx.tap(mapEl, function (ev, node) {
        if (state !== 'map') return;
        sfx.play('good');
        fx.pop(node);
        var i = +node.dataset.i;
        ctx.after(250, function () { if (state === 'map') startStage(i); });
      }, { delegate: '.aq-node', slop: 16 });

      function showStatus() {
        var node = el('span', { style: { display: 'inline-flex', gap: '6px', alignItems: 'center', fontFamily: 'var(--font-display)', fontWeight: '800', fontSize: '18px', whiteSpace: 'nowrap' } },
          el('span', { text: '🌰' }), el('span', { text: String(acorns) }), el('span', { text: '⭐'.repeat(stars) || '' }), hasKey && !doorOpen ? el('span', { text: '🔑' }) : null);
        ctx.setStatus(node);
      }

      ctx.onResize(function () { if (state !== 'map') fit(); });

      showMap();

      ctx.expose({
        get state() { return state; },
        get stage() { return stageNo; },
        get heroes() { return heroes.map(function (h) { return { x: h.x, y: h.y, vx: h.vx, vy: h.vy, ground: h.ground, home: h.home, bubble: !!h.bubble, dizzy: h.dizzy > 0, on: h.on ? (h.on.i != null ? 'hero' : h.on.kind) : null }; }); },
        get acorns() { return acorns; },
        get stars() { return stars; },
        get hasKey() { return hasKey; },
        get gateOpen() { return gateOpen; },
        get doorOpen() { return doorOpen; },
        get followIdx() { return followIdx; },
        get progress() { return JSON.parse(JSON.stringify(progress)); },
        get cam() { return { x: cam.x, y: cam.y }; },
        get view() { return Object.assign({}, view); },
        get critters() { return critters.map(function (c) { return { kind: c.kind, x: c.x, y: c.y, alive: c.alive }; }); },
        get items() { return items.map(function (it) { return { kind: it.kind, x: it.x, y: it.y, gone: !!it.gone }; }); },
        get size() { return stage ? { w: stage.w, h: stage.h } : null; },
        /** Tests only: put hero i at (x, y) (feet), standing still. */
        place: function (i, x, y) { var h = heroes[i]; h.x = x; h.y = y; h.vx = 0; h.vy = 0; h.bubble = null; h.safe = { x: x, y: y }; },
        solidAt: function (c, r) { return solid(c, r); },
        get hatsOn() { return progress.hats.map(function (k) { return HATS[k].e; }); },
        get art() { return { chunks: chunkOrder.length, decor: decor.length, life: life.length }; },
        draw: function () { aim(1); draw(); },

        STAGES: STAGES.map(function (s) { return { name: s.name, icon: s.icon, chunks: s.chunks.slice() }; }),
        buildStage: function (i) { return buildStage(STAGES[i]); },
        cleanProgress: cleanProgress,
        CHUNKS: CHUNKS,
        tuning: { GRAV: GRAV, JUMP: JUMP, BOOST: BOOST, SPRING: SPRING, WALK: WALK, HERO_H: HERO_H },
      });
    },
  });
})();
