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
| 🍜 **Noodle Slurp** | Both tap your own side as fast as you can to slurp the noodle. | Both at once |
| 🎡 **Bossy Wheel** | Spin the wheel (or shake the phone) and the *other* person does the silly action for real. | Off-screen silliness |
| 🥚 **Egg Twins** | Take turns cracking two eggs to find the baby animals that match. | Memory |
| 🐌 **Super Slow Race** | Pick a pile to see how many hops you get, and hop to the feast. Meadow, pond, snow or beach, with the surprise stones shuffled every race. | Luck and counting |
| 🍕 **Yummy-Yucky Cafe** | One cooks anything at all, the other takes three bites and reacts. Swap. | Pretend play |
| 🐺 **Run & Freeze** | The wolf sings with his back turned: run! The song stops and he spins round: freeze! | Both at once |
| 🧱 **Rainbow Stack** | A 3D tower of chunky blocks. Pull out one that matches the top block's colour or picture and it flies up to the top. Whoever tumbles the tower makes the big crash. | Matching, steady hands |
| 🐍 **Ular Tangga** | Snakes and ladders: roll your big die, hop and count, climb the ladders, slide down the snakes. A new board every game, stars (roll again) and gifts (hop on). Board of 36, 64 or the classic 100. | Board game, counting |
| 🏝️ **Treasure Island** | Roll footprints and walk your explorer under the clouds: gems, keys, treasure chests, a parrot that flies you and a crab that hides a gem. Richest explorer wins. | Adventure board game |
| 🌰 **Acorn Quest** | A side-scrolling adventure for two in five stages (meadow, woods, pond, clouds, cave): run, jump, bop critters, springs, a gate button, rafts, a lift, a key for the cave door, three hidden stars per stage, and a stand-on-your-buddy super jump. The little one's hero runs after the grown-up's: she just jumps. Nobody loses: falling in floats you back in a bubble. Hand-drawn look: layered hills, forests and clouds, trees, flowers and crystals, butterflies and fireflies, a starry night in dark mode. Stars earn hats (🎀 🧢 🌸 🎩 👑), picked per player on the map. | Co-op platformer |
| 🍅 **Happy Garden** | Grow tomatoes, chillies and more together: tap a bed and it gets what it needs (the seed shown on it, a rain cloud of water, or a spray for the bug), and tap a happy plant to tickle it so it grows faster. When a plant asks for food, tap the sack it wants (compost, bone meal or fish). Watch green tomatoes turn red, pick them, and hand the visitor their wish; every visitor has a favourite. Now and then a giant carrot, potato or pumpkin needs you both: each taps your own side to pull it out together. Every filled order brings a gift (seeds, more beds, a ladybird, bees, a fountain, a puppy, decorations, then prize medals), and your own tree in the yard grows a little more as you go, up to a mango tree. Nothing ever dies, and the garden is kept for next time. | Growing together, caring |
| 🍳 **Little Kitchen** | Cook 24 dishes side by side: Indonesian home food (telur ceplok, nasi goreng, sate ayam, sayur sop, mie goreng, bubur ayam, gado-gado), sweets (pisang goreng, martabak manis, donat, a birthday cake, roti bakar, klepon, kue kering, kue lapis) and cold treats (es campur, jus buah, puding, es krim, es lilin, es cendol, es kepal, salad buah), plus pizza. Each of you has your own board and your own job (crack, wash, peel, chop, pound, skewer, roll and cut, spread with a butter knife, roll balls with a secret sugar inside, squeeze cendol worms or icing, fry and flip, boil until they float, bake, chill in the fridge, wiggle-wiggle-POP a lolly out of its mould, press the blender, stir; the grown-up also finds the right jar on the shelf, and the cat loves a wrong one), and everything you both make flies into the one dish in the middle (kue lapis stacks your stripes in the order you pour them). In every dish the little one picks a topping, flavour, colour or cookie shape, and it shows on the plate; the menu card collects all three versions. The menu has three picture tabs (meals, sweets, cold treats). Taste it together (some dishes answer back: klepon squirt, the lolly paints a tongue), then open a present: new recipes, kitchen helpers (a cat, a hen, a radio, herbs, a cicak), a window, string lights, a sign with both your animals and red-and-white bunting, shelf decorations, gold medals. Nothing burns or spills, and the kitchen is kept for next time. | Cooking together, side by side |
| 💄 **Make-Up Mirrors** | Give each other a makeover: in your mirror sits the other player's animal. Wash off the mud, then face paint (butterflies, mermaid scales, lollipops, dino spots), blush, eyes, noses, lips, earrings, nail polish, pigtails and mermaid hair, hats and glitter, a step at a time, each from your own tray; in each party's special step her tray holds three of one thing (three lipsticks, three nail polishes, three face paints) to choose from. The friends giggle, sneeze, oink and roar; then pick a pose (a wave, a kiss, bunny ears, a hug, peekaboo, hooray!) and the two friends hop out for a photo together. Twelve parties (a mermaid sea party, sweets, dinosaurs and a butterfly garden among them), a salon poodle, a cicak on the mirror and twelve secret looks to find; the photos stay on your wall. | Make-up together, side by side |

### Camera, tilt and shake

**Bossy Wheel** uses the device itself: a shake spins it. It asks first and
works without: just tap the wheel. (The shell still offers the camera and tilt
sensors to games; see `docs/GAME_API.md`.)

- Browsers only allow the camera and motion sensors on a real web page served
  over **https** (or opened on the same computer). The easiest way is GitHub
  Pages: in the repository, *Settings → Pages → Deploy from a branch*, pick the
  branch and `/ (root)`. The games are then at
  `https://<user>.github.io/<repository>/`.
- Pages that embed the playroom in a locked-down frame (the claude.ai artifact
  built by `tools/build.mjs`) cannot use them at all, so that build never asks
  and always uses the finger controls.
- **Privacy:** no game uses the camera now. If one does, the picture never
  leaves the device: each frame is shrunk to a small grid of grey values,
  compared with the previous one to see where something moved, and discarded.
  Nothing is stored, recorded or sent, and the microphone is never opened.

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
