/* Template game — NOT loaded by index.html. Copy it to start a new game.
 *
 * "Star Tap": players take turns tapping the big star; first to 3 wins.
 * It is deliberately tiny but touches every part of the game contract:
 * registerGame, options, ctx.tap, ctx.hint, ctx.after, turns, scores, fx, sfx, win, expose.
 * Styles for a game live in css/games/<id>.css, every selector under .g-<id>.
 */
(function () {
  'use strict';

  MG.registerGame({
    id: 'template',
    name: 'Star Tap',
    emoji: '⭐',
    color: 'sun',
    howTo: 'Take turns tapping the star. First to the target wins.',
    options: [
      { key: 'target', label: 'Stars to win', default: 3, choices: [{ value: 3, label: '3' }, { value: 5, label: '5' }] },
    ],

    mount: function (root, ctx) {
      var el = ctx.el;
      var target = ctx.opt('target');
      var turn = ctx.firstPlayer;
      var busy = false;

      var star = el('button', { type: 'button', class: 'tpl-star', 'aria-label': 'Star' }, ctx.sticker('⭐'));
      root.appendChild(el('div', { class: 'tpl-wrap', style: 'display:grid;place-items:center;height:100%' }, star));
      star.style.cssText = 'font-size:calc(var(--gmin) * 0.5);background:none;border:0;padding:0;';

      ctx.setScore(0, 0);
      ctx.setScore(1, 0);
      ctx.setTurn(turn);
      ctx.hint(star); // tapping-finger demo until the first tap

      ctx.tap(star, function () {
        if (busy) return;
        busy = true;
        var c = ctx.fx.centerOf(star);
        ctx.sfx.play('pop');
        ctx.fx.burst(c.x, c.y, { emoji: '✨', count: 8 });
        ctx.fx.pop(star);
        var score = ctx.addScore(turn, 1);
        ctx.say(score);
        if (score >= target) { ctx.win(turn); return; }
        ctx.after(450, function () {
          turn = 1 - turn;
          ctx.setTurn(turn);
          busy = false;
        });
      });

      ctx.expose({
        get turn() { return turn; },
        get busy() { return busy; },
        target: target,
      });

      return function cleanup() { /* remove anything you added outside `root` */ };
    },
  });
})();
