const { chromium } = require('playwright');
const path = require('path');
const DIR = path.resolve('.awe-data/artifacts/25be2dad-039c-4cb2-8667-d4184df47363/nivict-landing');
const URL = 'file://' + DIR + '/index.html';

(async () => {
  const browser = await chromium.launch({ executablePath: require('playwright').chromium.executablePath() });
  const results = {};
  const consoleMsgs = [], errors = [], requests = [];

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  page.on('console', m => consoleMsgs.push(m.type() + ': ' + m.text()));
  page.on('pageerror', e => errors.push(String(e)));
  page.on('request', r => { if (!r.url().startsWith('file://')) requests.push(r.url()); });
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(300);

  results.console = consoleMsgs;
  results.pageErrors = errors;
  results.externalRequests = requests;

  // hero above the fold at 1280x720
  const h1 = await page.locator('#hero h1').boundingBox();
  const primary = await page.locator('#hero a.btn-primary').boundingBox();
  results.heroFold = { h1Bottom: Math.round(h1.y + h1.height), primaryBottom: Math.round(primary.y + primary.height), viewportH: 720, fits: (primary.y + primary.height) <= 720 };

  // no horizontal overflow
  results.overflowDesktop = await page.evaluate(() => ({ scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth }));

  // grid columns
  results.gridDesktop = await page.evaluate(() => getComputedStyle(document.querySelector('.feature-grid')).gridTemplateColumns.split(' ').length);
  results.navDesktopVisible = await page.evaluate(() => getComputedStyle(document.querySelector('#site-nav')).display);

  // tap targets
  results.tapTargets = await page.evaluate(() => {
    const bad = [];
    document.querySelectorAll('.btn, .nav-link, .nav-toggle, .footer-list a').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && r.height < 44) bad.push(el.className + ':' + Math.round(r.height));
    });
    return bad;
  });

  results.bodyFontSize = await page.evaluate(() => getComputedStyle(document.body).fontSize);

  // CTA confirmation
  await page.locator('#cta-request').click();
  await page.waitForTimeout(100);
  results.ctaConfirm = await page.evaluate(() => {
    const c = document.getElementById('cta-confirm');
    return { hidden: c.hidden, visible: c.getBoundingClientRect().height > 0, text: c.textContent.trim().slice(0, 40) };
  });

  // smooth scroll: click feature link from top
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(50);
  const before = await page.evaluate(() => window.pageYOffset);
  await page.locator('#nav-toggle').isVisible().catch(()=>{});
  await page.locator('.nav-link[href="#features"]').click();
  await page.waitForTimeout(900);
  const after = await page.evaluate(() => window.pageYOffset);
  results.smoothScroll = { before, after, moved: after > before };
  results.hashAfterClick = await page.evaluate(() => location.hash);

  // focus visible check
  results.focusRing = await page.evaluate(() => {
    const b = document.querySelector('#cta-request');
    b.focus();
    const cs = getComputedStyle(b);
    return { boxShadow: cs.boxShadow, outline: cs.outlineColor + ' ' + cs.outlineWidth };
  });

  // tablet
  await page.setViewportSize({ width: 768, height: 900 });
  await page.waitForTimeout(200);
  results.gridTablet = await page.evaluate(() => getComputedStyle(document.querySelector('.feature-grid')).gridTemplateColumns.split(' ').length);

  // mobile probes
  for (const w of [320, 375, 480, 1023]) {
    await page.setViewportSize({ width: w, height: 812 });
    await page.waitForTimeout(150);
    results['overflow_' + w] = await page.evaluate(() => {
      const d = document.documentElement;
      const wide = [];
      document.querySelectorAll('body *').forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.right > d.clientWidth + 1 || r.left < -1) wide.push(el.tagName + '.' + (el.className || '') + ' r=' + Math.round(r.right));
      });
      return { scrollW: d.scrollWidth, clientW: d.clientWidth, wide: wide.slice(0, 5) };
    });
  }

  // mobile nav behaviour at 375
  await page.setViewportSize({ width: 375, height: 812 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
  results.mobile = {};
  results.mobile.toggleVisible = await page.locator('#nav-toggle').isVisible();
  results.mobile.navHiddenInitially = await page.evaluate(() => getComputedStyle(document.getElementById('site-nav')).display === 'none');
  results.mobile.toggleLabelInitial = await page.locator('#nav-toggle').getAttribute('aria-label');
  results.mobile.expandedInitial = await page.locator('#nav-toggle').getAttribute('aria-expanded');
  results.mobile.controls = await page.locator('#nav-toggle').getAttribute('aria-controls');

  await page.locator('#nav-toggle').click();
  await page.waitForTimeout(200);
  results.mobile.afterOpen = {
    expanded: await page.locator('#nav-toggle').getAttribute('aria-expanded'),
    label: await page.locator('#nav-toggle').getAttribute('aria-label'),
    navDisplay: await page.evaluate(() => getComputedStyle(document.getElementById('site-nav')).display),
    navLinkHeight: await page.evaluate(() => Math.round(document.querySelector('.nav-link').getBoundingClientRect().height)),
  };

  // Escape closes
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  results.mobile.afterEscape = {
    expanded: await page.locator('#nav-toggle').getAttribute('aria-expanded'),
    navDisplay: await page.evaluate(() => getComputedStyle(document.getElementById('site-nav')).display),
    focusOnToggle: await page.evaluate(() => document.activeElement.id),
  };

  // link click closes
  await page.locator('#nav-toggle').click();
  await page.waitForTimeout(150);
  await page.locator('.nav-link[href="#features"]').click();
  await page.waitForTimeout(500);
  results.mobile.afterLinkClick = {
    expanded: await page.locator('#nav-toggle').getAttribute('aria-expanded'),
    navDisplay: await page.evaluate(() => getComputedStyle(document.getElementById('site-nav')).display),
  };

  // reduced motion
  const rmCtx = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: 'reduce' });
  const rmPage = await rmCtx.newPage();
  await rmPage.goto(URL, { waitUntil: 'load' });
  results.reducedMotion = await rmPage.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--duration').trim());

  await page.screenshot({ path: 'screenshots/verify-mobile.png', fullPage: false });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'screenshots/verify-desktop.png', fullPage: false });

  await browser.close();
  console.log(JSON.stringify(results, null, 2));
})();
