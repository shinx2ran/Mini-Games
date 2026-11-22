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

  var THEMES = {
    meadow: { sky: '#BDE8FF', skyDark: '#1E2B5C', top: '#7ACB5A', dirt: '#B9814A', block: '#E0A86A', branch: '#A0643A', pit: null, deco: '🌼' },
    woods: { sky: '#CFEFD2', skyDark: '#1B3328', top: '#5DA94A', dirt: '#7A5232', block: '#9C7650', branch: '#8B5A2E', pit: null, deco: '🌲' },
    pond: { sky: '#C8F1F5', skyDark: '#163447', top: '#6CC072', dirt: '#9D7650', block: '#4FB34A', branch: '#8B5A2E', pit: '#4FA9E6', deco: '🌾' },
    sky: { sky: '#FFE0F0', skyDark: '#2D2458', top: '#FFFFFF', dirt: '#E5EAF7', block: '#F3E9FF', branch: '#FFFFFF', pit: null, deco: '🌈' },
    cave: { sky: '#3A3466', skyDark: '#17142E', top: '#8D86C4', dirt: '#5A5590', block: '#7E77B8', branch: '#A58BD8', pit: null, deco: '💧' },
  };

  /* ---------------------------------------------------------- pure rules */

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

      var progress = ctx.load('progress', null);
      if (!progress || typeof progress !== 'object' || !Array.isArray(progress.stars)) progress = { cleared: 0, stars: [] };
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
        var tile = portrait ? Math.floor(r.width / 9.5) : Math.floor(Math.min(r.height / 9.6, r.width / 16));
        tile = util.clamp(tile, 18, 72);
        // the controls take the bottom of the screen: the camera may look that far below the stage (more ground),
        // so the heroes are never under a button
        var padH = 0;
        pads.forEach(function (pd) { padH = Math.max(padH, pd.node.offsetHeight || 0); });
        view = { tile: tile, px: r.width, py: r.height, w: r.width / tile, h: portrait ? Math.min(ROWS + 0.5, r.height / tile) : r.height / tile, portrait: portrait, under: (padH + 16) / tile };
        sprites = {};
        dark = isDark();
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
        stage.theme = THEMES[def.theme];
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
          m.x1 = far - 3; m.speed = 2;
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
          var gap = lead.x + behind - hero.x;
          if (lead.home) gap = lead.x - hero.x;
          if (lead.on === hero || Math.abs(lead.x - hero.x) < 0.35 && lead.y < hero.y - 0.5) gap = 0;   // the grown-up is standing on her: keep still
          if (Math.abs(gap) > 0.3) want = gap > 0 ? 1 : -1;
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
          hero.buffer = 0; hero.coyote = 0; hero.ground = false;
          hero.squash = -0.25;
          sfx.tone({ freq: boost > 1 ? 380 : 300, to: boost > 1 ? 900 : 640, dur: 0.14, type: 'triangle', gain: 0.14 });
          if (boost > 1) { var c = screenOf(hero); fx.burst(c.x, c.y, { emoji: '✨', count: 5, distance: 40, size: 16 }); }
        }
        if (!holding && hero.vy < -JUMP * 0.45) hero.vy = -JUMP * 0.45;   // let go early: a smaller hop
        hero.vy = Math.min(hero.vy + GRAV * dt, 22);
        // carried by a raft, a lift or a buddy
        if (hero.on && hero.on.dx != null) moveX(hero, hero.on.dx);
        var wasGround = hero.ground, fallV = hero.vy;
        var hit = moveX(hero, hero.vx * dt);
        hero.stuck = hit && want === hit && hero.ground ? hero.stuck + dt : 0;
        if (hit) hero.vx = 0;
        moveY(hero, hero.vy * dt + (hero.on && hero.on.dy ? hero.on.dy : 0), heroes);
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
              hero.vy = -SPRING; hero.ground = false; it.squash = 1;
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
        progress.cleared = Math.max(progress.cleared, stageNo + 1);
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
        var tx = util.clamp(fxp.x - view.w * 0.45, 0, Math.max(0, stage.w - view.w));
        var ty = view.portrait ? ROWS - view.h : util.clamp(fxp.y - view.h * 0.55, 0, Math.max(0, ROWS - view.h + view.under));
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
          if (!f.bubble && !f.home && Math.abs(f.x - l.x) > 7 && steadyBuddy(f)) bubbleTo(f, { x: l.x - l.face, y: l.y - 1.2 });
        }
      }

      function draw() {
        var T = view.tile, th = stage.theme;
        pen.fillStyle = dark ? th.skyDark : th.sky;
        pen.fillRect(0, 0, view.px, view.py);
        var c0 = Math.max(0, Math.floor(cam.x)), c1 = Math.min(stage.w - 1, Math.ceil(cam.x + view.w));
        var r0 = Math.max(0, Math.floor(cam.y)), r1 = ROWS - 1;
        // far-off scenery: faint, and drifting slower than the stage, so it never looks like something to collect
        pen.globalAlpha = 0.35;
        for (var dc = Math.floor(cam.x / 7) * 7 - 7; dc < cam.x + view.w + 7; dc += 7) {
          var sx = dc + cam.x * 0.4 - Math.floor(cam.x * 0.4 / 7) * 7;
          drawSprite(th.deco, sx, ROWS - 3.4 - (((dc / 7) % 3 + 3) % 3) * 0.6, T * 0.6, false);
        }
        pen.globalAlpha = 1;
        pen.lineWidth = Math.max(1.5, T * 0.06);
        pen.strokeStyle = '#2A2356';
        for (var r = r0; r <= r1; r++) {
          for (var c = c0; c <= c1; c++) {
            var t = stage.grid[r][c], x = (c - cam.x) * T, y = (r - cam.y) * T;
            if (t === '#') {
              var topOpen = r === 0 || (!solid(c, r - 1) && stage.grid[r - 1][c] !== '#');
              pen.fillStyle = th.dirt;
              pen.fillRect(x, y, T + 1, T + 1);
              if (topOpen) {
                pen.fillStyle = th.top;
                pen.fillRect(x, y, T + 1, T * 0.34);
                pen.beginPath(); pen.moveTo(x, y + 1); pen.lineTo(x + T + 1, y + 1); pen.stroke();
              }
            } else if (t === '=') {
              pen.fillStyle = th.block;
              if (th === THEMES.pond) {
                pen.beginPath(); pen.ellipse(x + T / 2, y + T * 0.2, T * 0.55, T * 0.2, 0, 0, Math.PI * 2); pen.fill(); pen.stroke();
              } else {
                roundRect(x + 1, y + 1, T - 2, T - 2, T * 0.18); pen.fill(); pen.stroke();
              }
            } else if (t === '-') {
              pen.fillStyle = th.branch;
              roundRect(x, y, T + 1, T * 0.3, T * 0.12); pen.fill(); pen.stroke();
            } else if (t === '~' && th.pit) {
              pen.fillStyle = th.pit;
              pen.fillRect(x, y + (r === 10 || stage.grid[r - 1][c] !== '~' ? T * 0.3 : 0), T + 1, T + 1);
            }
          }
        }
        // under the stage (a tall screen shows all of it, with the controls below): more ground
        var below = (ROWS - cam.y) * T;
        if (below < view.py) { pen.fillStyle = th.dirt; pen.fillRect(0, below, view.px, view.py - below); }
        // gates and doors
        Object.keys(stage.gates).forEach(function (gc) { if (!gateOpen) wall(+gc, stage.gates[gc], '#9AA0B8', 'bars'); });
        Object.keys(stage.doors).forEach(function (dc) { if (!doorOpen) wall(+dc, stage.doors[dc], '#B86B2E', 'lock'); });
        // rafts and lifts
        movers.forEach(function (m) {
          var x = (m.x - cam.x) * T, y = (m.y - cam.y) * T;
          pen.fillStyle = m.kind === 'raft' ? '#C98A4B' : '#F7D046';
          roundRect(x, y, m.w * T, T * 0.36, T * 0.12); pen.fill(); pen.stroke();
        });
        // things
        items.forEach(function (it) {
          if (it.gone) return;
          var bob = Math.sin(ctx.time * 3 + it.x) * 0.06;
          if (it.kind === 'acorn') drawSprite('🌰', it.x, it.y + bob, T * 0.62);
          else if (it.kind === 'star') drawSprite('⭐', it.x, it.y + bob, T * 0.9);
          else if (it.kind === 'key') drawSprite('🔑', it.x, it.y + bob, T * 0.8);
          else if (it.kind === 'spring') {
            it.squash *= 0.85;
            var sx = (it.x - cam.x) * T, sy = (it.y - cam.y) * T, hgt = T * (0.55 - it.squash * 0.3);
            pen.fillStyle = '#E8435A';
            roundRect(sx - T * 0.4, sy - hgt, T * 0.8, T * 0.2, T * 0.08); pen.fill(); pen.stroke();
            pen.beginPath();
            for (var z = 0; z < 4; z++) { pen.moveTo(sx - T * 0.25, sy - hgt + T * 0.2 + z * (hgt - T * 0.2) / 4); pen.lineTo(sx + T * 0.25, sy - hgt + T * 0.2 + (z + 0.5) * (hgt - T * 0.2) / 4); }
            pen.stroke();
          } else if (it.kind === 'button') {
            var bx = (it.x - cam.x) * T, by = (it.y - cam.y) * T;
            pen.fillStyle = it.down ? '#7ACB5A' : '#E8435A';
            pen.beginPath(); pen.ellipse(bx, by, T * 0.4, T * (it.down ? 0.08 : 0.22), 0, Math.PI, 0); pen.fill(); pen.stroke();
          } else if (it.kind === 'home') drawSprite('🏡', it.x, it.y - 1.1, T * 2.4);
          else if (it.kind === 'chick') drawSprite('🐣', it.x, it.y - 0.5, T * 1.1);
        });
        // critters
        critters.forEach(function (cr) {
          if (!cr.alive) {
            if (cr.poof < 0.5) { pen.globalAlpha = 1 - cr.poof * 2; drawSprite(cr.emoji, cr.x, cr.y - cr.h / 2 - cr.poof * 2, T * 0.8, cr.vx > 0); pen.globalAlpha = 1; }
            return;
          }
          var wob = cr.kind === 'snail' ? Math.sin(cr.t * 4) * 0.03 : 0;
          drawSprite(cr.emoji, cr.x, cr.y - cr.h / 2 + wob, T * 0.85, cr.vx > 0);
        });
        // heroes
        heroes.forEach(function (h) { drawHero(h); });
      }

      function wall(c, rBottom, color, kind) {
        var T = view.tile, x = (c - cam.x) * T, top = (Math.max(0, Math.floor(cam.y)) - cam.y) * T, y = (rBottom + 1 - cam.y) * T;
        pen.fillStyle = color;
        pen.fillRect(x + T * 0.12, Math.min(top, 0), T * 0.76, y - Math.min(top, 0));
        pen.strokeRect(x + T * 0.12, Math.min(top, 0), T * 0.76, y - Math.min(top, 0));
        if (kind === 'bars') {
          for (var k = 1; k < 3; k++) { pen.beginPath(); pen.moveTo(x + T * 0.12 + k * T * 0.25, Math.min(top, 0)); pen.lineTo(x + T * 0.12 + k * T * 0.25, y); pen.stroke(); }
        } else {
          pen.fillStyle = '#F7D046';
          pen.beginPath(); pen.arc(x + T / 2, y - T * 0.9, T * 0.16, 0, Math.PI * 2); pen.fill(); pen.stroke();
        }
      }

      function drawHero(h) {
        var T = view.tile, p = players[h.i];
        var x = (h.x - cam.x) * T, y = (h.y - cam.y) * T;
        if (h.inv > 0 && !h.bubble && Math.floor(h.inv * 10) % 2) pen.globalAlpha = 0.5;
        var sq = h.squash, rx = T * 0.46 * (1 + sq), ry = T * 0.48 * (1 - sq);
        var bounce = h.ground && Math.abs(h.vx) > 0.5 ? Math.abs(Math.sin(h.walkT * 3)) * T * 0.07 : 0;
        if (h.home) bounce = Math.abs(Math.sin(h.walkT * 6)) * T * 0.18;
        var cy = y - ry - bounce;
        var col = paint[h.i] || { color: '#FF6F91', dark: '#C0436A' };
        // feet
        pen.fillStyle = col.dark;
        var step = Math.sin(h.walkT * 3) * T * 0.1;
        pen.beginPath(); pen.ellipse(x - T * 0.16 + step, y - T * 0.04, T * 0.13, T * 0.07, 0, 0, Math.PI * 2); pen.fill(); pen.stroke();
        pen.beginPath(); pen.ellipse(x + T * 0.16 - step, y - T * 0.04, T * 0.13, T * 0.07, 0, 0, Math.PI * 2); pen.fill(); pen.stroke();
        // body
        pen.fillStyle = col.color;
        pen.beginPath(); pen.ellipse(x, cy, rx, ry, 0, 0, Math.PI * 2); pen.fill(); pen.stroke();
        drawSprite(p.emoji, h.x + h.face * 0.04, (cy / T) + cam.y, T * 0.62, h.face > 0);
        pen.globalAlpha = 1;
        if (h.dizzy > 0) drawSprite('💫', h.x, (cy / T) + cam.y - 0.7, T * 0.5);
        if (h.bubble) {
          pen.strokeStyle = 'rgba(255,255,255,0.9)';
          pen.fillStyle = 'rgba(190,232,255,0.35)';
          pen.beginPath(); pen.arc(x, cy, T * 0.68, 0, Math.PI * 2); pen.fill(); pen.stroke();
          pen.strokeStyle = '#2A2356';
        }
      }

      function roundRect(x, y, w, h, r) {
        pen.beginPath();
        pen.moveTo(x + r, y);
        pen.arcTo(x + w, y, x + w, y + h, r);
        pen.arcTo(x + w, y + h, x, y + h, r);
        pen.arcTo(x, y + h, x, y, r);
        pen.arcTo(x, y, x + w, y, r);
        pen.closePath();
      }

      /* ---- the loop ---- */

      ctx.frame(function (dt) {
        if (state !== 'play' && state !== 'clear') return;
        // small steps, so nothing ever passes through a thin branch
        var n = Math.ceil(dt / (1 / 120));
        for (var s = 0; s < n; s++) step(dt / n);
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
          n.btn.classList.toggle('is-next', i === open - 1 && i >= progress.cleared);
          n.stars.textContent = '';
          for (var s = 0; s < 3; s++) n.stars.appendChild(el('span', { class: 'aq-star' + (s < (progress.stars[i] || 0) ? ' is-got' : ''), text: '⭐' }));
          if (locked) n.btn.querySelector('.aq-node__icon').setAttribute('data-locked', '🔒');
          else n.btn.querySelector('.aq-node__icon').removeAttribute('data-locked');
        });
        ctx.setTurn(null);
        var next = mapNodes[Math.min(open, STAGES.length) - 1];
        ctx.hint(next.btn, { delay: 900 });
      }
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
        STAGES: STAGES.map(function (s) { return { name: s.name, icon: s.icon, chunks: s.chunks.slice() }; }),
        buildStage: function (i) { return buildStage(STAGES[i]); },
        CHUNKS: CHUNKS,
        tuning: { GRAV: GRAV, JUMP: JUMP, BOOST: BOOST, SPRING: SPRING, WALK: WALK, HERO_H: HERO_H },
      });
    },
  });
})();
