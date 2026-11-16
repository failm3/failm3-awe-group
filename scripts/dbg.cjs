const { chromium } = require('playwright');
const path = require('path');
const DIR = path.resolve('.awe-data/artifacts/25be2dad-039c-4cb2-8667-d4184df47363/nivict-landing');
(async () => {
  const b = await chromium.launch({ executablePath: chromium.executablePath() });
  const p = await b.newPage({ viewport: { width: 320, height: 812 } });
  await p.goto('file://' + DIR + '/index.html');
  const info = await p.evaluate(() => {
    const out = [];
    document.querySelectorAll('body *').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.right > 321) out.push({ tag: el.tagName, cls: el.className && el.className.baseVal !== undefined ? 'svg:'+el.className.baseVal : el.className, w: Math.round(r.width), right: Math.round(r.right), disp: getComputedStyle(el).display, minW: getComputedStyle(el).minWidth });
    });
    return out.slice(0, 12);
  });
  console.log(JSON.stringify(info, null, 1));
  // focus-visible via keyboard
  await p.setViewportSize({ width: 1280, height: 800 });
  await p.goto('file://' + DIR + '/index.html');
  await p.keyboard.press('Tab'); // skip link
  const s1 = await p.evaluate(() => ({ el: document.activeElement.className, shadow: getComputedStyle(document.activeElement).boxShadow, outline: getComputedStyle(document.activeElement).outlineWidth }));
  await p.keyboard.press('Tab'); // brand
  await p.keyboard.press('Tab');
  const s2 = await p.evaluate(() => ({ el: document.activeElement.tagName + '.' + document.activeElement.className, shadow: getComputedStyle(document.activeElement).boxShadow, outline: getComputedStyle(document.activeElement).outlineWidth }));
  console.log('focus:', JSON.stringify([s1, s2]));
  await b.close();
})();
