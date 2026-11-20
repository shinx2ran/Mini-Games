/* Shared Playwright helpers for the game tests.
 *
 *   const h = require('./harness');
 *   h.run('pairs', async (t) => {
 *     const page = await t.open('pairs');            // that game on its own page
 *     await t.fast(page, 8);                         // 8x game clock
 *     ...
 *   });
 *
 * Every page opened through the harness fails the test on console errors or
 * uncaught exceptions.
 */
'use strict';

const path = require('path');
const assert = require('assert');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
// By default each game is tested on its own (tests/play.html?g=<id>).
// MG_PAGE=index.html or MG_PAGE=dist/pocket-playroom.html tests the real page.
const FULL_PAGE = process.env.MG_PAGE ? 'file://' + path.join(ROOT, process.env.MG_PAGE) : null;
const INDEX_URL = FULL_PAGE || 'file://' + path.join(ROOT, 'index.html');

function urlFor(gameId, opts) {
  if (opts.page) return 'file://' + path.join(ROOT, opts.page) + (gameId ? '#' + gameId : '');
  if (FULL_PAGE || !gameId || opts.full) return INDEX_URL + (gameId ? '#' + gameId : '');
  const file = gameId === 'template' ? '_template' : gameId;
  return 'file://' + path.join(ROOT, 'tests', 'play.html') + '?g=' + file + '#' + gameId;
}

const VIEWPORTS = {
  phone: { width: 390, height: 844 },
  phoneWide: { width: 844, height: 390 },
  small: { width: 320, height: 568 },
  tablet: { width: 1024, height: 768 },
  tabletTall: { width: 768, height: 1024 },
};

async function run(name, fn) {
  const browser = await chromium.launch();
  const contexts = [];
  const errors = [];
  const t = {
    assert,
    VIEWPORTS,
    errors,
    /** Open the app (optionally straight into a game). opts: {viewport: 'phone'|{width,height}, dark: bool, touch: bool, reducedMotion: bool, full: bool (use index.html)} */
    async open(gameId, opts = {}) {
      const viewport = typeof opts.viewport === 'string' ? VIEWPORTS[opts.viewport] : (opts.viewport || VIEWPORTS.phone);
      const context = await browser.newContext({
        viewport,
        hasTouch: opts.touch !== false,
        isMobile: opts.touch !== false,
        deviceScaleFactor: 1,
        colorScheme: opts.dark ? 'dark' : 'light',
        reducedMotion: opts.reducedMotion ? 'reduce' : 'no-preference',
      });
      contexts.push(context);
      const page = await context.newPage();
      page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message)));
      page.on('console', (m) => {
        if (m.type() !== 'error') return;
        const text = m.text();
        if (/fonts\.googleapis|fonts\.gstatic|net::ERR_/.test(text)) return; // offline font fetch is fine
        errors.push('console.error: ' + text);
      });
      await page.goto(urlFor(gameId, opts));
      await page.waitForFunction(() => window.MG && document.querySelector('#mg-home'));
      if (gameId) await page.waitForFunction((id) => window.MG.current && window.MG.current.id === id, gameId);
      return page;
    },
    /** Speed up the game clock (ctx.after/every/wait/frame). */
    async fast(page, scale = 8) { await page.evaluate((s) => { window.MG.timeScale = s; }, scale); },
    /** The mounted game's exposed test API, evaluated in the page: api(page, (api, arg) => ..., arg) */
    async api(page, fn, arg) {
      return page.evaluate(([src, a]) => (0, eval)('(' + src + ')')(window.MG.current && window.MG.current.api, a), [fn.toString(), arg]);
    },
    /** Wait for the celebration overlay; returns {solo: bool, faces: [emoji...]} */
    async waitForWin(page, timeout = 20000) {
      await page.waitForSelector('.mg-overlay--win .mg-win', { timeout });
      return page.evaluate(() => {
        const faces = [...document.querySelectorAll('.mg-win__face')].map((f) => f.textContent);
        return { solo: faces.length === 1, faces };
      });
    },
    /** True when nothing overflows the page horizontally or vertically. */
    async noPageScroll(page) {
      return page.evaluate(() => {
        const d = document.documentElement;
        return d.scrollWidth <= d.clientWidth + 1 && d.scrollHeight <= d.clientHeight + 1;
      });
    },
    /** Elements (matching selector) whose box pokes outside the play area. Returns a list of descriptions. */
    async outsidePlayArea(page, selector) {
      return page.evaluate((sel) => {
        const g = document.querySelector('#mg-game').getBoundingClientRect();
        const bad = [];
        document.querySelectorAll(sel).forEach((n) => {
          const r = n.getBoundingClientRect();
          if (r.width === 0 && r.height === 0) return;
          if (r.left < g.left - 1 || r.top < g.top - 1 || r.right > g.right + 1 || r.bottom > g.bottom + 1) {
            bad.push(`${n.className || n.tagName} [${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}] vs play area [${Math.round(g.left)},${Math.round(g.top)},${Math.round(g.right)},${Math.round(g.bottom)}]`);
          }
        });
        return bad;
      }, selector);
    },
    /** Smallest rendered size (px) among elements matching selector: {min, count} */
    async minTargetSize(page, selector) {
      return page.evaluate((sel) => {
        let min = Infinity, count = 0;
        document.querySelectorAll(sel).forEach((n) => {
          const r = n.getBoundingClientRect();
          if (r.width === 0 && r.height === 0) return;
          count++;
          min = Math.min(min, r.width, r.height);
        });
        return { min: count ? Math.round(min) : 0, count };
      }, selector);
    },
    async shot(page, file) {
      const out = path.join(process.env.MG_SHOTS || path.join(ROOT, 'tests', 'shots'), file);
      await page.screenshot({ path: out });
      return out;
    },
  };

  let failed = false;
  try {
    await fn(t);
    if (errors.length) throw new Error('page errors:\n  ' + errors.join('\n  '));
    console.log(`ok   ${name}`);
  } catch (e) {
    failed = true;
    console.error(`FAIL ${name}\n${e && e.stack ? e.stack : e}`);
  } finally {
    for (const c of contexts) await c.close().catch(() => {});
    await browser.close().catch(() => {});
  }
  if (failed) process.exitCode = 1;
}

module.exports = { run, VIEWPORTS, ROOT, INDEX_URL, assert };
