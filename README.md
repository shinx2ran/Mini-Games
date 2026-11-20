# Pocket Playroom

Tiny two-player games for **one grown-up and one small child sharing one phone
or tablet**. Made for a 4-year-old who has outgrown tic-tac-toe.

No reading needed to play, nothing to install, no ads, no accounts, no network
after the page has loaded.

## Play

Open `index.html` in any modern browser (double-clicking the file works), or
host the folder on any static host. Sit side by side: player 1 on the left,
player 2 on the right. Tap your animals at the top of the home screen to pick
an avatar and a colour each.

| Game | What you do | Kind |
| --- | --- | --- |
| 🙈 **Hide & Peek** | One hides the critter while the other covers their eyes; then peek into hiding places full of silly surprises. Swap. | Take turns hiding |
| 🐉 **Sneezy Dragon** | Take turns sneaking one treasure from the sleeping dragon. Nobody knows which grab sets off the glitter sneeze. | Pure luck, pure suspense |
| 🍜 **Noodle Slurp** | Both tap your own side as fast as you can to slurp the noodle. | Both at once |
| 🎡 **Bossy Wheel** | Spin the wheel and the *other* person does the silly action for real. | Off-screen silliness |
| 🥚 **Egg Twins** | Take turns cracking two eggs to find the baby animals that match. | Memory |
| 🐌 **Super Slow Race** | Pick a leaf pile to see how many hops you get, and hop to the picnic. | Luck and counting |
| 🍕 **Yummy-Yucky Cafe** | One cooks anything at all, the other takes three bites and reacts. Swap. | Pretend play |
| 📦 **Wobble Tower** | Take turns dropping animal crates to build one tower together. | Team |

### For the grown-up

- **Press and hold** the pause button (top left in a game) or the cog (home
  screen) for a moment. A quick tap does nothing, so little fingers can't leave
  a game by accident.
- The pause menu has a one-line "how to play", each game's options, sound and
  voice switches, and **Help for the little player** (Off / Some / Lots): quiet,
  invisible handicaps so you can play flat out and she can still really win.
- In a player's picker, mark who the **little player** is. That player starts
  the first round and receives the help.
- Every finished round adds a sticker to one shared sticker book. There is no
  parent-versus-child scoreboard.
- **Night-night** (in the cog menu) puts everyone to sleep: a kind way to end
  screen time.
- Tip: Guided Access (iPhone, iPad) or screen pinning (Android) keeps her
  inside the playroom.

## How it is built

Plain HTML, CSS and classic scripts. No build step, no dependencies, no asset
files: characters are emoji, scenes are CSS, sounds are synthesized.

```
index.html            the page: shell + every game
css/shell.css         design tokens (light + dark) and the shell's own UI
css/games/<id>.css    one stylesheet per game, scoped under .g-<id>
js/core.js            the shell: home shelf, HUD, pause, win party, sticker
                      book, sound, kid-proof input, pause-aware game clock
js/games/<id>.js      one file per game; registers itself with the shell
docs/GAME_API.md      the contract between a game and the shell, and the
                      design rules for a 4-year-old's hands
tests/                real-browser tests (Playwright), one file per game
tools/build.mjs       optional: bundle everything into a single HTML file
```

To add a game, copy `js/games/_template.js`, read `docs/GAME_API.md`, and list
the new script and stylesheet in `index.html`.

### Tests

The tests drive a real Chromium through whole rounds, mash the screen with
several fingers, rotate the device mid-round and check every supported screen
size. They need [Playwright](https://playwright.dev) (`npm i -D playwright`).

```
node tests/run.js             # everything
node tests/run.js twins       # one game
node tests/twins.test.js      # the same, directly
```

Work on one game by itself at `tests/play.html?g=<id>#<id>`.

### One-file bundle

```
node tools/build.mjs          # writes dist/pocket-playroom.html
```

The bundle is a single self-contained page: handy to send to a tablet or drop
onto any host.
