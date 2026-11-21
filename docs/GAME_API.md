# Building a game for Pocket Playroom

Pocket Playroom is a shelf of tiny two-player games for **one grown-up and one
4-year-old sharing one phone or tablet**, sitting side by side (player 1 on the
left, player 2 on the right). No build step, no dependencies, no asset files:
plain classic scripts, emoji + CSS + inline SVG/canvas for art, synthesized
sound.

A game is two files, plus a test:

| File | What |
| --- | --- |
| `js/games/<id>.js` | An IIFE that calls `MG.registerGame({...})` |
| `css/games/<id>.css` | Styles, **every selector scoped under `.g-<id>`** |
| `tests/<id>.test.js` | Plays a whole round in a real browser (`node tests/<id>.test.js`) |

Both source files are listed in `index.html`. `js/games/_template.js` is a
minimal working example; `tests/shell.test.js` shows the test helpers in use.
Open one game on its own at `tests/play.html?g=<id>#<id>`.

## The contract

```js
(function () {
  'use strict';
  MG.registerGame({
    id: 'twins',            // kebab-case: URL hash, CSS scope (.g-twins), storage namespace
    name: 'Egg Twins',      // short English name on the home tile (for the grown-up)
    emoji: '🥚',            // home tile art (one emoji)
    color: 'sun',           // tile colour: berry | tangerine | sun | leaf | sea | grape
    howTo: 'One or two sentences the grown-up reads in the pause menu.',
    options: [              // optional; edited by the grown-up in the pause menu
      { key: 'size', label: 'How many eggs', default: 12,
        choices: [{ value: 8, label: '8' }, { value: 12, label: '12' }, { value: 16, label: '16' }] },
    ],
    mount: function (root, ctx) {
      // build DOM inside `root`, wire input with ctx.tap, run timers with ctx.after...
      return function cleanup() {};   // optional
    },
  });
})();
```

`root` is an absolutely-positioned box filling the playmat (`overflow: hidden;
touch-action: none`), with class `mg-game g-<id>`. It is emptied when the game
closes. A round restarts by mounting again from scratch, so keep all state
inside `mount`.

## `ctx`

**Players**

- `ctx.players` → `[p0, p1]`, each `{index, emoji, colorName, color, dark, soft, little}`.
  `color` / `dark` / `soft` are CSS values. Player 0 sits on the **left**,
  player 1 on the **right**: put each player's own things on their side.
- CSS variables everywhere: `--p0`, `--p0-dark`, `--p0-soft`, `--p1`, `--p1-dark`, `--p1-soft`.
- `little: true` marks the small child. Both, one or neither may be little.
- `ctx.help` → `0 | 1 | 2` (Off / Some / Lots): how much **invisible** help the
  grown-up wants the little player to get. `ctx.helpFor(i)` → `ctx.help` if
  player `i` is little, else `0`. Use it for hidden handicaps and hints. Never
  show or announce that the game is helping.
- `ctx.firstPlayer` → `0 | 1`, who starts this round. It alternates each round;
  the little player starts round one.
- `ctx.round` → rounds of this game played since page load (0-based).

**Time** — all of these pause with the pause menu and are cancelled on exit.
Never use raw `setTimeout` / `setInterval` / `requestAnimationFrame`, and never
drive game logic from `animationend` / `transitionend` (decorate with CSS
animation, decide with `ctx.after`).

- `ctx.after(ms, fn)` → `cancel()`
- `ctx.every(ms, fn)` → `cancel()`
- `ctx.wait(ms)` → Promise (never resolves once the game is closed, so `await` chains stop cleanly)
- `ctx.frame(fn(dt, t))` → `cancel()`; `dt` seconds per frame, clamped to 0.05
- `ctx.time` → seconds of un-paused game time
- `ctx.alive`, `ctx.paused`, `ctx.over`

**Input**

- `ctx.tap(el, (ev, el) => {})` — the only way to take taps. Fires on
  touch-**down** (sloppy taps, long presses and tiny drags all count), once per
  finger (multi-touch works), plus Enter/Space. Ignored while paused, after
  `ctx.win()`, and during `ctx.lock()`.
- `ctx.tap(container, (ev, item) => {}, {delegate: '.egg', slop: 24})` for many
  items. `slop` snaps a near miss to the nearest enabled item within that many
  px, so there are no dead gaps. Items with `disabled` or
  `aria-disabled="true"` never fire and are never snapped to.
- `ctx.lock(ms)` — ignore every `ctx.tap` for the next `ms` of game time
  (during a reveal, after a move). `ctx.locked` → boolean.
- `ctx.setTurn` locks input for 450ms whenever the player changes, so a
  leftover excited tap cannot take the other player's move.
- `ctx.hint(el, {delay})` — a ghost hand tapping over `el`: the wordless
  tutorial. It disappears on the next counted tap (or `ctx.hint(null)`). Show
  one at the start of a round and whenever the next thing to press is new.
- `ctx.on(target, type, handler, opts)` → `off()` — raw listener, auto-removed.
- Every touch on the playmat already makes a small sparkle, and touches that no
  `ctx.tap` handler counted make a soft "boop" — so nothing ever feels dead. Do
  not add error sounds for off-turn or inert taps; a wiggle is plenty.

**Layout**

- CSS: `--gw`, `--gh`, `--gmin`, `--gmax` (play-area size in px) on `root`, and
  `root[data-orient="portrait" | "landscape"]`. Size everything from these:
  `font-size: calc(var(--gmin) * 0.12)`.
- `ctx.size()` → `{w, h, orient}`; `ctx.onResize(fn)` — the device WILL rotate
  mid-game. Anything positioned in px by JS must re-layout on resize. Prefer
  percentages and the CSS variables so there is nothing to recompute.

**HUD** (the shell owns the bar above the playmat)

- `ctx.setTurn(i | null, {sound, lock})` — highlights that player's chip, frames
  the playmat in their colour, plays their turn jingle. The stage exposes
  `--turn`, `--turn-dark` and `--turn-soft` CSS variables for your own pieces.
- `ctx.setScore(i, n)`, `ctx.addScore(i, d = 1)` → new score, `ctx.scores`.
  The chip shows a digit; that is a bonus for the grown-up, so ALSO show the
  count as things on that player's side (twins in a nest, treasures in a sack).
- `ctx.setStatus(nodeOrString | null)` — small shared indicator in the middle
  of the HUD (carrots found together, bowls won). It is ~100px wide on a small
  phone and a narrow column on a phone held sideways; long content wraps. The
  node lives in the HUD, OUTSIDE your game's `.g-<id>` scope, so your
  stylesheet cannot reach it: style it inline.
- `ctx.chip(i)` → the player's chip element (aim flying things at it)

**Endings**

- `ctx.win(result, {delay = 700, emoji})` — the party. Both players are always
  shown celebrating, a shared sticker goes into the family sticker book, and
  the Again / All games buttons arm after a beat.
  - `0 | 1` → that player wears the crown
  - `'tie'` → both crowned
  - `'team'` → co-operative success or a game with no winner
  Call it exactly once; input is ignored afterwards and the turn highlight is
  cleared for you. Keep the finale short (the `delay`): under ~4 seconds.
  There is no "you lost"
  screen anywhere, and no parent-versus-child tally is kept.
- `ctx.restart()`, `ctx.exit()`

**Options and saved data**

- `ctx.opt('size')` → the stored choice (or the default). Changing an option in
  the pause menu restarts the round. Options are for the grown-up; keep to 1–2
  per game with good defaults.
- `ctx.load(key, fallback)` / `ctx.save(key, value)` — small per-game values
  that persist (a team record, an adaptive handicap). May silently not persist.

**Sound** — synthesized; safe to call any time (silent until the first touch,
or when muted). Soft and musical: no harsh buzzers, no sudden loud bangs.

- `ctx.sfx.play(name)` — `tap tick boop ding pop flip drop hop good match star
  oops boing whoosh slide boost roll splash munch giggle start turn0 turn1 win
  tie lullaby` (`pop` and `hop` accept `{pitch: hz}`)
- `ctx.sfx.scale(i)` — i-th note of a pentatonic scale (0..12); rising `i` for streaks/counting, so mashing sounds like a tune
- `ctx.sfx.note(midi, dur, {type, gain, delay})`, `ctx.sfx.seq([60, 64, null, 67], {step, type, gain})`
- `ctx.sfx.tone({freq, to, dur, type, gain, delay})`, `ctx.sfx.noise({freq, to, dur, q, gain, delay})`
  — build each game's own signature sounds from these (a sneeze, a slurp, a burp).
- `ctx.say(text)` — the device's own voice in the device's language. Pass
  numbers as digits (`ctx.say(3)`) so counting comes out in the family's
  language. May be unavailable; the game must be complete without it. Never
  speak English sentences.

**Effects** — viewport coordinates.

- `ctx.fx.centerOf(el)` → `{x, y}`
- `ctx.fx.burst(x, y, {count, emoji, color, colors, distance, size})`
- `ctx.fx.confetti({count, emojis})` (the win party already does this)
- `ctx.fx.float(x, y, '+1', {size, color})`
- `ctx.fx.pop(el)`, `.shake(el)`, `.wiggle(el)`, `.bounce(el)` — additive, safe on transformed elements

**DOM helpers**

- `ctx.el(tag, {class, text, style, data, onclick, 'aria-label'}, ...children)`
- `ctx.sticker('🐸', 'extra-class')` → emoji with a white die-cut edge (the house
  look). The edge is a CSS filter: fine for dozens of static pieces, avoid on
  hundreds of moving ones.
- `ctx.util`: `rand(n)`, `randf(a, b)`, `pick(arr)`, `shuffle(arr)` (new array),
  `sample(arr, n)`, `clamp`, `lerp`, `range(n)`

**Tests** — `ctx.expose(api)` makes `api` available as `MG.current.api` so a
test can read state and play a perfect game. Expose getters, not snapshots.
`MG.timeScale = 8` fast-forwards every `ctx` timer.

## House style

Tokens (light and dark themes are both handled if you only use these):

- ground: `--mat` (playmat), `--surface`, `--surface-2`, `--bg`
- ink: `--ink`, `--ink-soft`; outlines and hard shadows: `--line`; sticker edge: `--edge`
- colours, each with `-dark` and `-soft`: `--berry --tangerine --sun --leaf --sea --grape`
- shape: `--r-lg --r-md --r-sm`, `--stroke` (3px outline), `--lift` (6px hard shadow)
- type: `--font-display` (chunky, for numerals and the rare word), `--font-body`

The look is a **sticker book**: flat bright shapes, a 3px `--line` outline, a
hard offset shadow (`box-shadow: 0 var(--lift) 0 var(--line)`) that squashes on
press, emoji characters as die-cut stickers. No gradients-as-decoration, no
blurry shadows, no glassmorphism. Text on a saturated colour is always
`#2A2356`. A scene may paint its own ground (meadow, pond, night sky), but it
must read well in BOTH themes: either use the tokens, or define the scene's own
custom properties on `.g-<id>` and redefine them for dark exactly the way
`css/shell.css` does:

```css
.g-race { --grass: #BDEB9B; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .g-race { --grass: #2F5A3A; } }
:root[data-theme="dark"] .g-race { --grass: #2F5A3A; }
```

Emoji: only ones from **Unicode 11 (2018) or older**, so they exist on old
phones (no 🧊 🧅 🦥 🪀 🥱 …). When two things must be told apart, they differ in
silhouette as well as colour.

Animate `transform` and `opacity` only (60fps on old phones).

## Rules for a 4-year-old's hands and heart

1. **No reading, no bare numerals.** Nothing the child needs is text. A
   quantity is 1–3 dots or objects she can see at a glance; anything larger is
   counted out one by one, with a rising note (and `ctx.say(n)`) per item.
2. **Huge targets.** Anything she taps is at least 64px (80–96px+ whenever the
   screen allows), with no dead gaps (`slop`), and at least 12px inside the
   playmat edge. Where possible the whole cell, band or half of the screen is
   the button.
3. **Tap is the only gesture.** `ctx.tap` only. Never require double-tap,
   long-press, swipe, pinch, drag or precise timing. Where timing matters her
   window is 500ms or more and the moving thing is slow.
4. **Feedback inside 100ms** for every touch: a sound and a visible reaction.
5. **Never punish.** No game over, no lives, no countdown clock, no "wrong!",
   no red X, no going back to the start, nothing scary or startling. A miss is
   a funny non-event; the "losing" outcome is the funniest animation.
6. **Whose turn is unmistakable** without reading: `ctx.setTurn`, plus the
   game's own pieces on that player's side in their colour and animal.
7. **She can really win, and the grown-up can play flat out.** Fairness comes
   from structure: luck, hidden information, asymmetric roles, co-operation,
   rate caps, and invisible handicaps driven by `ctx.helpFor(i)`.
8. **Short.** A round is 1–3 minutes and ends on a clear, celebrated moment
   via `ctx.win`. Keep any wait under ~6 seconds; finales under 4.
9. **Mashing-proof.** Rapid-fire and many-finger taps never break state, take
   two turns, double-score, open two things at once, or throw. Model the round
   as an explicit state machine; lock input during reveals (`ctx.lock`);
   ignore, don't queue.
10. **Rotation-proof and size-proof.** Works at 320×568, 390×844, 844×390,
    768×1024 and 1024×768 with nothing clipped, overlapping or cut off, and
    survives rotating mid-round.
11. **Juice.** Squash on press, bouncy arrivals, a beat of anticipation before
    reveals, sounds that climb when things go well, randomised surprises on
    top of rules that never change.
12. **Aim the punchline at the people.** The best moments make the two of them
    look at each other, not the screen.
13. **Honour `prefers-reduced-motion`**: no essential information carried only
    by motion; long decorative loops stop.
