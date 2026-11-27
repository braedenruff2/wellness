/* Task 276: "Note for autopilot" bar (#wl-bar) and sheet (#wl-note-modal):
   - #wl-bar is hidden on every session screen (Faith guided prayer, Tagalog Listen while walking, workout in progress, Calm sit)
     and visible again once the session stops or finishes.
   - Escape and Android Back (window.FCBack) close the note sheet and restore focus.
   - Contrast (light/dark/night), 44 px tap targets, and zero overflow at 1.0 and 1.3 text size (320 px narrow). */
'use strict';
const assert = require('assert');
const W = require('./lib/web.cjs');

(async () => {
  const t = await W.open({ time: new Date(2026, 10, 27, 10, 0) });
  const { page, base } = t;

  const barVisible = () => page.evaluate(() => {
    const el = document.getElementById('wl-bar');
    return !!(el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 0);
  });

  await t.step('#wl-bar is hidden on Faith guided prayer, Calm sit, Tagalog Listen while walking, and workout in progress', async () => {
    // Home: visible
    await page.goto(base + '#home');
    await page.waitForSelector('#wl-bar-note');
    assert.strictEqual(await barVisible(), true, 'visible on #home');

    // Faith guided prayer: hidden
    await page.goto(base + '#faith/session/day/1');
    await page.waitForSelector('#pp');
    assert.strictEqual(await barVisible(), false, 'hidden on Faith guided prayer');

    // Calm sit: hidden
    await page.goto(base + '#calm/s/count');
    await page.waitForSelector('#c-pp');
    assert.strictEqual(await barVisible(), false, 'hidden on Calm sit');

    // Tagalog Listen while walking: visible before, hidden while walking, visible after stopping
    await page.goto(base + '#tagalog/l/2026-11-18/1');
    await page.waitForSelector('#tl-walk');
    assert.strictEqual(await barVisible(), true, 'visible on Tagalog lesson before walking');
    await page.click('#tl-walk');
    assert.strictEqual(await barVisible(), false, 'hidden during Tagalog Listen while walking');
    await page.click('#tl-walk');
    assert.strictEqual(await barVisible(), true, 'visible again after stopping Listen while walking');

    // Workout in progress: visible before logging a set, hidden while session open, visible after finishing
    await page.goto(base + '#workout');
    await page.waitForSelector('.logbtn');
    assert.strictEqual(await barVisible(), true, 'visible on #workout before starting');
    await page.click('.logbtn');
    await page.waitForSelector('#wo-finish');
    assert.strictEqual(await barVisible(), false, 'hidden during workout in progress');
    await page.click('#wo-finish');
    await page.waitForSelector('#wo-done-today');
    assert.strictEqual(await barVisible(), true, 'visible again after finishing workout');
  });

  await t.step('Escape and Android Back (window.FCBack) close the note sheet and restore focus', async () => {
    await page.goto(base + '#todo');
    await page.waitForSelector('#wl-bar-note');

    // Escape closes and restores focus to #wl-bar-note
    await page.click('#wl-bar-note');
    await page.waitForSelector('#wl-note-modal');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('wl-note-modal'));
    assert.strictEqual(await page.evaluate(() => document.activeElement && document.activeElement.id), 'wl-bar-note', 'Escape restores focus');

    // Android Back (FCBack) closes the sheet and returns true; next FCBack returns false
    await page.click('#wl-bar-note');
    await page.waitForSelector('#wl-note-modal');
    const back1 = await page.evaluate(() => window.FCBack());
    assert.strictEqual(back1, true, 'FCBack handled open note sheet');
    assert.strictEqual(await page.$('#wl-note-modal'), null, 'note sheet closed by FCBack');
    assert.strictEqual(await page.evaluate(() => document.activeElement && document.activeElement.id), 'wl-bar-note', 'FCBack restores focus');
    assert.strictEqual(await page.evaluate(() => window.FCBack()), false, 'FCBack returns false when sheet is already closed');

    // Dark screen cover still takes priority over the sheet in FCBack
    await page.click('#wl-bar-note');
    await page.waitForSelector('#wl-note-modal');
    const darkFirst = await page.evaluate(async () => {
      WL.darkScreen.start({ id: 'nb-dark', after: 10 });
      await new Promise((r) => setTimeout(r, 30));
      const r1 = window.FCBack();
      const stillOpen = !!document.getElementById('wl-note-modal');
      const coverGone = !document.getElementById('nb-dark');
      WL.darkScreen.stop();
      const r2 = window.FCBack();
      const sheetGone = !document.getElementById('wl-note-modal');
      return { r1, stillOpen, coverGone, r2, sheetGone };
    });
    assert.deepStrictEqual(darkFirst, { r1: true, stillOpen: true, coverGone: true, r2: true, sheetGone: true });
  });

  await t.step('contrast, 44 px tap targets, and no overflow on #wl-bar and #wl-note-sheet in light/dark/night at 1.0 and 1.3', async () => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.evaluate(() => {
      localStorage.setItem('wl.notes.v1', JSON.stringify({
        notes: [
          { id: 'n2', at: '2026-11-27T13:00:00.000Z', where: '#home', tag: 'Idea', text: 'Unread note for contrast check' },
          { id: 'n1', at: '2026-11-26T13:00:00.000Z', where: '#calm', tag: 'Bug', text: 'Read note for contrast check', read: '2026-11-26T18:00:00.000Z' }
        ]
      }));
      if (window.WL && WL.notes && WL.notes.reload) WL.notes.reload();
    });

    const checkContrast = (rootSel) => page.evaluate((sel) => {
      const parse = (s) => { const m = s.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/); return m ? [+m[1], +m[2], +m[3], m[4] == null ? 1 : +m[4]] : [0, 0, 0, 0]; };
      const bgOf = (el) => {
        for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c[3] > 0.5) return c; }
        return [255, 255, 255, 1];
      };
      const lum = ([r, g, b]) => [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); })
        .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
      const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
      const root = document.querySelector(sel);
      const out = [];
      for (const el of root.querySelectorAll('h3, p, button, a, summary, textarea, span')) {
        if (el.offsetParent === null || !el.textContent.trim() && el.tagName !== 'TEXTAREA') continue;
        if (el.classList.contains('sr')) continue;
        const cs = getComputedStyle(el);
        const fg = parse(cs.color), bg = bgOf(el);
        const r = Math.round(ratio(fg, bg) * 100) / 100;
        out.push({ t: (el.id || el.textContent.trim()).slice(0, 28), r });
      }
      return out;
    }, rootSel);

    const checkTargets = (sel) => page.evaluate((s) => Array.from(document.querySelectorAll(s))
      .filter((e) => e.offsetParent !== null)
      .map((e) => ({ t: (e.id || e.textContent.trim()).slice(0, 25), h: Math.round(e.getBoundingClientRect().height), right: Math.round(e.getBoundingClientRect().right) }))
      .filter((x) => x.h < 44 || x.right > window.innerWidth + 1), sel);

    for (const theme of ['light', 'dark', 'night']) {
      const min = theme === 'night' ? 3 : 4.5;
      for (const ts of [1, 1.3]) {
        await page.evaluate(([s, th]) => { localStorage.setItem('wl.shell.v1', JSON.stringify({ theme: th, textSize: s })); WL.applyLook(); }, [ts, theme]);
        await page.goto(base + '#todo');
        await page.waitForSelector('#wl-bar-note');
        assert.deepStrictEqual(await checkTargets('#wl-bar button, #wl-bar a'), [], theme + ' ' + ts + 'x #wl-bar targets');
        assert.deepStrictEqual((await checkContrast('#wl-bar')).filter((x) => x.r < min), [], theme + ' ' + ts + 'x #wl-bar contrast');

        await page.click('#wl-bar-note');
        await page.waitForSelector('#wl-note-sheet');
        await page.click('#wl-note-list summary');
        const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        assert.ok(over <= 0, theme + ' ' + ts + 'x #wl-note-sheet overflow: ' + over);
        assert.deepStrictEqual(await checkTargets('#wl-note-sheet button, #wl-note-sheet summary, #wl-note-in'), [], theme + ' ' + ts + 'x #wl-note-sheet targets');
        assert.deepStrictEqual((await checkContrast('#wl-note-sheet')).filter((x) => x.r < min), [], theme + ' ' + ts + 'x #wl-note-sheet contrast');
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => !document.getElementById('wl-note-modal'));
      }
    }
  });

  await t.step('399: deleting notes keeps focus inside #wl-note-modal and disarms unread delete after 4 s', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => { localStorage.setItem('wl.shell.v1', JSON.stringify({ theme: 'light', textSize: 1 })); WL.applyLook(); });
    await page.goto(base + '#todo');
    await page.waitForSelector('#wl-bar-note');
    await page.click('#wl-bar-note');
    await page.waitForSelector('#wl-note-list summary');
    await page.click('#wl-note-list summary');

    // Delete read note (n1) -> focus stays inside modal on remaining Delete button (n2), never <body>
    await page.click('.wl-note-del[data-id="n1"]');
    assert.strictEqual(await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-id')), 'n2', 'focus moves to remaining delete button');

    // Tap unread note (n2) Delete once -> arms, then disarms after 4 s
    await page.click('.wl-note-del[data-id="n2"]');
    assert.ok((await page.textContent('.wl-note-del[data-id="n2"]')).includes('tap again'));
    await page.clock.fastForward(4100);
    assert.strictEqual((await page.textContent('.wl-note-del[data-id="n2"]')).trim(), 'Delete', 'unread delete confirmation disarms after 4 s');

    // Two-tap delete on last note -> focus returns to #wl-note-in inside the dialog
    await page.click('.wl-note-del[data-id="n2"]');
    await page.click('.wl-note-del[data-id="n2"]');
    assert.strictEqual(await page.evaluate(() => document.activeElement && document.activeElement.id), 'wl-note-in', 'focus falls back to #wl-note-in when last note deleted');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('wl-note-modal'));
  });

  await t.step('no errors', async () => { assert.deepStrictEqual(t.errors, []); });
  await t.close('notes bar & sheet');
})().catch((e) => { console.error(String(e && e.stack || e).slice(0, 3000)); process.exit(1); });
