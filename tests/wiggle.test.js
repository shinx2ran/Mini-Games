/* Wiggle Pop: pop bubbles together, by waving at the camera or with fingers. */
'use strict';
const h = require('./harness');
const ID = 'wiggle';

const api = (page, key) => page.evaluate((k) => MG.current.api[k], key);
const playing = (page) => page.waitForFunction(() => MG.current && MG.current.api && MG.current.api.state === 'play', null, { timeout: 30000 });
/** Pop one on-screen bubble with a real tap; resolves false if none is tappable yet. */
async function popOne(page) {
  const box = await page.evaluate(() => {
    const g = document.querySelector('#mg-game').getBoundingClientRect();
    for (const b of document.querySelectorAll('.g-wiggle .wp-bubble')) {
      const r = b.getBoundingClientRect();
      if (r.top > g.top + 50 && r.top < g.bottom - 30) return { x: r.left, y: r.top };
    }
    return null;
  });
  if (!box) return false;
  await page.touchscreen.tap(box.x, box.y);
  return true;
}

(async () => {
  await h.run(ID, async (t) => {
    const { assert } = t;

    // --- pure rules: where the picture moved, and whether a bubble is in it
    let page = await t.open(ID);
    const r = await page.evaluate(() => {
      const a = MG.current.api, w = 48, hh = 36;
      const prev = new Uint8Array(w * hh).fill(100), cur = new Uint8Array(w * hh).fill(100);
      for (let y = 0; y < 18; y++) for (let x = 0; x < 12; x++) cur[y * w + x] = 200;   // movement in the top-left corner only
      cur[35 * w + 47] = 110;                                                             // a flicker under the threshold
      const m = a.motionMask(prev, cur, a.DIFF);
      return {
        share: m.share, inCorner: a.shareIn(m.mask, w, hh, 0.12, 0.25, 0.1, 0.13), elsewhere: a.shareIn(m.mask, w, hh, 0.7, 0.7, 0.1, 0.13),
        offPicture: a.shareIn(m.mask, w, hh, 1.5, 1.5, 0.1, 0.13), still: a.motionMask(prev, prev, a.DIFF).share,
        wide: a.coverCrop(640, 480, 300, 600), tall: a.coverCrop(480, 640, 600, 300), same: a.coverCrop(400, 300, 800, 600),
      };
    });
    assert.ok(Math.abs(r.share - (18 * 12) / (48 * 36)) < 1e-9, 'only real changes count as movement');
    assert.strictEqual(r.inCorner, 1); assert.strictEqual(r.elsewhere, 0); assert.strictEqual(r.offPicture, 0); assert.strictEqual(r.still, 0);
    assert.deepStrictEqual(r.wide, { sx: 200, sy: 0, sw: 240, sh: 480 }, 'the grid sees exactly what the screen shows');
    assert.deepStrictEqual(r.tall, { sx: 0, sy: 200, sw: 480, sh: 240 });
    assert.deepStrictEqual(r.same, { sx: 0, sy: 0, sw: 400, sh: 300 });

    // --- asked: camera or fingers. Fingers: a whole round through real taps
    assert.strictEqual(await api(page, 'state'), 'ask');
    assert.ok((await page.locator('.g-wiggle .wp-note').textContent()).includes('stays on this device'));
    await page.locator('.g-wiggle .wp-ask .mg-btn').nth(1).click();
    await playing(page);
    assert.strictEqual(await api(page, 'mode'), 'touch');
    await t.fast(page, 3);
    for (let guard = 0; guard < 1500 && (await api(page, 'state')) === 'play'; guard++) {
      if (!(await popOne(page))) await page.waitForTimeout(40);
      assert.ok((await api(page, 'count')) <= 5, 'never more than five bubbles at once');
    }
    assert.strictEqual(await api(page, 'popped'), 30);
    assert.strictEqual(await api(page, 'byWave'), 0);
    await t.waitForWin(page, 30000);
    assert.strictEqual(await page.locator('.mg-win').getAttribute('data-result'), 'team');

    // --- mashing: five fingers on one bubble pop it once; a bubble that floats away costs nothing
    page = await t.open(ID);
    await page.locator('.g-wiggle .wp-ask .mg-btn').nth(1).click();
    await playing(page);
    await page.waitForFunction(() => { const b = document.querySelector('.g-wiggle .wp-bubble'); return b && b.getBoundingClientRect().top < window.innerHeight - 120; }, null, { timeout: 30000 });
    await page.evaluate(() => {
      const el = document.querySelector('.g-wiggle .wp-bubble'); const r = el.getBoundingClientRect();
      for (let id = 160; id < 165; id++) el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: id, pointerType: 'touch', clientX: r.left, clientY: r.top }));
    });
    assert.strictEqual(await api(page, 'popped'), 1);
    await t.fast(page, 8);
    await page.waitForTimeout(2500);
    assert.strictEqual(await api(page, 'state'), 'play', 'bubbles drifting off the top never end or punish anything');
    assert.strictEqual(await api(page, 'popped'), 1);

    // --- no camera on this device: choosing Camera quietly falls back to fingers
    page = await t.open(ID);
    await page.locator('.g-wiggle .wp-ask .mg-btn').nth(0).click();
    await playing(page);
    assert.strictEqual(await api(page, 'mode'), 'touch');
    assert.strictEqual(await page.locator('.g-wiggle .wp-video').count(), 0);

    // --- the camera question is never answered: Fingers still starts the game
    page = await t.open(null, { page: 'tests/play.html?g=wiggle' });
    await page.addInitScript(() => { if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = () => new Promise(() => {}); });
    await page.reload();
    await page.waitForFunction(() => window.MG && document.querySelector('#mg-home'));
    await page.evaluate(() => MG.open('wiggle'));
    await page.locator('.g-wiggle .wp-ask .mg-btn').nth(0).click();
    await page.waitForTimeout(300);
    assert.strictEqual(await api(page, 'state'), 'asking');
    assert.strictEqual(await page.locator('.g-wiggle .wp-ask .mg-btn.is-waiting').count(), 1);
    await page.locator('.g-wiggle .wp-ask .mg-btn').nth(1).click();
    await playing(page);
    assert.strictEqual(await api(page, 'mode'), 'touch');

    // --- portrait: the two choices sit in the middle, not jammed against the top
    page = await t.open(ID, { viewport: 'phone' });
    const gap = await page.evaluate(() => document.querySelector('.g-wiggle .wp-ask .mg-btn').getBoundingClientRect().top - document.querySelector('#mg-game').getBoundingClientRect().top);
    assert.ok(gap > 80, `the choices are centred (${Math.round(gap)}px from the top)`);

    // --- the sandboxed build never asks for the camera
    page = await t.open(null, { page: 'tests/play.html?g=wiggle' });
    await page.addInitScript(() => { window.MG_SANDBOX = true; });
    await page.reload();
    await page.waitForFunction(() => window.MG && document.querySelector('#mg-home'));
    await page.evaluate(() => MG.open('wiggle'));
    await playing(page);
    assert.strictEqual(await page.locator('.g-wiggle .wp-ask').count(), 0);
    assert.strictEqual(await api(page, 'mode'), 'touch');

    // --- every supported size: the question fits, bubbles are big; rotate mid-round
    for (const vp of ['small', 'phone', 'phoneWide', 'tabletTall', 'tablet']) {
      const p = await t.open(ID, { viewport: vp, dark: vp === 'phoneWide' || vp === 'small' });
      assert.deepStrictEqual(await t.outsidePlayArea(p, '.g-wiggle .wp-ask .mg-btn, .g-wiggle .wp-note'), [], `the question fits @${vp}`);
      assert.ok((await t.minTargetSize(p, '.g-wiggle .wp-ask .mg-btn')).min >= 84, `the two choices are big @${vp}`);
      if (vp === 'phoneWide') await t.shot(p, 'wiggle-ask-wide.png');
      await p.locator('.g-wiggle .wp-ask .mg-btn').nth(1).click();
      await playing(p);
      await t.fast(p, 4);
      await p.waitForFunction(() => MG.current.api.count >= 4, null, { timeout: 30000 });
      await p.evaluate(() => { MG.timeScale = 1; });
      assert.ok(await t.noPageScroll(p), `no page scroll @${vp}`);
      assert.ok((await t.minTargetSize(p, '.g-wiggle .wp-orb')).min >= 74, `bubbles are big @${vp}`); // 80px, wobbling
      assert.deepStrictEqual(await t.outsidePlayArea(p, '.g-wiggle .wp-meter'), [], `meter in view @${vp}`);
      await t.shot(p, `wiggle-${vp}.png`);
      if (vp === 'phone') {
        await p.setViewportSize({ width: 844, height: 390 });
        await p.waitForTimeout(300);
        const before = await api(p, 'popped');
        for (let guard = 0; guard < 100 && (await api(p, 'popped')) === before; guard++) { if (!(await popOne(p))) await p.waitForTimeout(60); }
        assert.ok((await api(p, 'popped')) > before, 'still poppable after rotating');
      }
    }

    // --- leaving and coming back leaves nothing behind
    page = await t.open(ID);
    for (let i = 0; i < 3; i++) {
      await page.locator('.g-wiggle .wp-ask .mg-btn').nth(1).click();
      await playing(page);
      await page.evaluate(() => MG.home());
      await page.evaluate(() => MG.open('wiggle'));
    }
    assert.strictEqual(await page.locator('.g-wiggle .wp-scene').count(), 1);
    assert.strictEqual(await api(page, 'state'), 'ask');
  });

  // --- with a (fake) camera: the picture shows mirrored, movement is measured, and the camera goes off on leaving
  await h.run(ID + ' (camera)', async (t) => {
    const { assert } = t;
    /** A page that remembers every camera stream it was ever given (optionally answering late). */
    const spy = async (delay = 0) => {
      const p = await t.open(null, { page: 'tests/play.html?g=wiggle' });
      await p.addInitScript((delay) => {
        const md = navigator.mediaDevices; if (!md) return;
        const real = md.getUserMedia.bind(md); window.__streams = [];
        md.getUserMedia = (c) => new Promise((res) => setTimeout(res, delay)).then(() => real(c)).then((s) => { window.__streams.push(s); return s; });
      }, delay);
      await p.reload();
      await p.waitForFunction(() => window.MG && document.querySelector('#mg-home'));
      await p.evaluate(() => MG.open('wiggle'));
      return p;
    };
    const tracks = (p) => p.evaluate(() => window.__streams.map((s) => s.getTracks().map((tr) => tr.readyState).join(',')));

    // --- pausing lets the camera go; resuming brings it back into the same picture; leaving ends it
    let cam = await spy();
    await cam.locator('.g-wiggle .wp-ask .mg-btn').nth(0).click();
    await playing(cam);
    assert.deepStrictEqual(await tracks(cam), ['live']);
    await t.pause(cam);
    assert.deepStrictEqual(await tracks(cam), ['ended'], 'paused: the camera is off');
    await cam.locator('.mg-pausecard .mg-btn--primary').tap();
    await cam.waitForFunction(() => window.__streams.length === 2 && document.querySelector('.g-wiggle .wp-video').srcObject === window.__streams[1], null, { timeout: 15000 });
    assert.deepStrictEqual(await tracks(cam), ['ended', 'live'], 'resumed: back on, in the same mirror');
    await cam.waitForFunction(() => document.querySelector('.g-wiggle .wp-video').videoWidth > 0);
    await cam.evaluate(() => MG.home());
    assert.deepStrictEqual(await tracks(cam), ['ended', 'ended'], 'left: off');

    // --- the camera cannot be brought back after a pause (another app took it): carry on with fingers, and show it
    cam = await spy();
    await cam.locator('.g-wiggle .wp-ask .mg-btn').nth(0).click();
    await playing(cam);
    assert.strictEqual(await api(cam, 'mode'), 'camera');
    await t.pause(cam);
    await cam.evaluate(() => { navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('busy', 'NotReadableError')); });
    await cam.locator('.mg-pausecard .mg-btn--primary').tap();
    await cam.waitForFunction(() => MG.current.api.mode === 'touch', null, { timeout: 15000 });
    assert.strictEqual(await cam.locator('.g-wiggle .wp-video').count(), 0, 'the frozen picture is taken away');
    assert.strictEqual(await cam.evaluate(() => document.querySelector('.g-wiggle .wp-scene').dataset.mode), 'touch');
    assert.strictEqual(await api(cam, 'state'), 'play', 'and the round goes on');
    assert.deepStrictEqual(await tracks(cam), ['ended']);
    {
      const before = await api(cam, 'popped');
      await cam.waitForFunction(() => { const b = document.querySelector('.g-wiggle .wp-bubble'); return b && b.getBoundingClientRect().top < window.innerHeight - 140; }, null, { timeout: 30000 });
      for (let guard = 0; guard < 100 && (await api(cam, 'popped')) === before; guard++) { if (!(await popOne(cam))) await cam.waitForTimeout(60); }
      assert.ok((await api(cam, 'popped')) > before, 'fingers pop the bubbles from here on');
    }

    // --- lost before the first picture had even arrived (paused straight after "yes", and then it cannot be reopened):
    //     a finger round starts there and then, with no dead picture and no camera light
    cam = await t.open(null, { page: 'tests/play.html?g=wiggle' });
    await cam.addInitScript(() => {
      const md = navigator.mediaDevices; if (!md) return;
      const real = md.getUserMedia.bind(md); let calls = 0; window.__streams = [];
      md.getUserMedia = (c) => {
        calls++;
        if (calls > 1) return Promise.reject(new DOMException('busy', 'NotReadableError'));
        return real(c).then((s) => { window.__streams.push(s); setTimeout(() => MG.pause(), 0); return s; });
      };
    });
    await cam.reload();
    await cam.waitForFunction(() => window.MG && document.querySelector('#mg-home'));
    await cam.evaluate(() => MG.open('wiggle'));
    await cam.locator('.g-wiggle .wp-ask .mg-btn').nth(0).click();
    await cam.waitForSelector('.mg-overlay--pause');
    assert.strictEqual(await api(cam, 'state'), 'asking');
    await cam.waitForTimeout(450);
    await cam.locator('.mg-pausecard .mg-btn--primary').tap();
    await cam.waitForFunction(() => MG.current.api.state === 'play', null, { timeout: 2500 });
    assert.strictEqual(await api(cam, 'mode'), 'touch');
    assert.strictEqual(await cam.locator('.g-wiggle .wp-ask').count(), 0, 'the question is gone');
    assert.strictEqual(await cam.locator('.g-wiggle .wp-video').count(), 0, 'no dead picture');
    assert.strictEqual(await cam.evaluate(() => document.querySelector('.g-wiggle .wp-scene').dataset.mode), 'touch');
    assert.deepStrictEqual(await tracks(cam), ['ended']);
    await cam.waitForTimeout(3200); // the first picture's own wait runs out: it must not turn the round into a camera round
    assert.strictEqual(await api(cam, 'mode'), 'touch');
    assert.strictEqual(await cam.locator('.g-wiggle .wp-video').count(), 0);

    // --- "Fingers" tapped while the camera question was still open: a late yes must not leave the camera on
    cam = await spy(700);
    await cam.locator('.g-wiggle .wp-ask .mg-btn').nth(0).click();
    await cam.locator('.g-wiggle .wp-ask .mg-btn').nth(1).click();
    await playing(cam);
    assert.strictEqual(await api(cam, 'mode'), 'touch');
    await cam.waitForFunction(() => window.__streams.length === 1, null, { timeout: 15000 });
    await cam.waitForTimeout(300);
    assert.deepStrictEqual(await tracks(cam), ['ended'], 'the late camera is switched straight off');
    assert.strictEqual(await cam.locator('.g-wiggle .wp-video').count(), 0);

    const page = await t.open(ID);
    await page.locator('.g-wiggle .wp-ask .mg-btn').nth(0).click();
    await playing(page);
    assert.strictEqual(await api(page, 'mode'), 'camera');
    assert.strictEqual(await page.locator('.g-wiggle .wp-video').count(), 1);
    await page.waitForFunction(() => MG.current.api.samples >= 5, null, { timeout: 30000 });
    const info = await page.evaluate(() => {
      const v = document.querySelector('.g-wiggle .wp-video');
      window.__tracks = v.srcObject.getTracks();
      return { w: v.videoWidth, live: window.__tracks.map((tr) => tr.readyState), audio: v.srcObject.getAudioTracks().length, mirrored: getComputedStyle(v).transform };
    });
    assert.ok(info.w > 0, 'the camera picture is playing');
    assert.deepStrictEqual(info.live, ['live']);
    assert.strictEqual(info.audio, 0, 'video only: the microphone is never opened');
    assert.ok(info.mirrored.startsWith('matrix(-1'), 'shown like a mirror');
    const share = await api(page, 'lastShare');
    assert.ok(share >= 0 && share <= 1);
    await t.shot(page, 'wiggle-camera.png');
    // a touch still pops in camera mode
    await page.waitForFunction(() => { const b = document.querySelector('.g-wiggle .wp-bubble'); return b && b.getBoundingClientRect().top < window.innerHeight - 140; }, null, { timeout: 30000 });
    const before = await api(page, 'popped');
    for (let guard = 0; guard < 100 && (await api(page, 'popped')) === before; guard++) { if (!(await popOne(page))) await page.waitForTimeout(60); }
    assert.ok((await api(page, 'popped')) > before);
    // leaving switches the camera off
    await page.evaluate(() => MG.home());
    assert.deepStrictEqual(await page.evaluate(() => window.__tracks.map((tr) => tr.readyState)), ['ended'], 'the camera is off the moment you leave');
  }, { args: h.FAKE_CAMERA });
})();
