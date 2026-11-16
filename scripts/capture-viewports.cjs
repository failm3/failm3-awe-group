#!/usr/bin/env node
// Captures fold + full-page screenshots at desktop (1280x720) and mobile (375x667),
// records console messages, page errors and failed/HTTP>=400 requests, then
// verifies each PNG's pixel size by reading the IHDR chunk from disk.
// Usage: node scripts/capture-viewports.cjs <url> <outDir> <reportJsonPath>
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const [, , url, outDir, reportPath] = process.argv;
if (!url || !outDir || !reportPath) {
  console.error("Usage: capture-viewports.cjs <url> <outDir> <reportJsonPath>");
  process.exit(2);
}

function pngSize(file) {
  const b = fs.readFileSync(file);
  const sig = "89504e470d0a1a0a";
  if (b.subarray(0, 8).toString("hex") !== sig) throw new Error(`${file}: not a PNG`);
  if (b.subarray(12, 16).toString("ascii") !== "IHDR") throw new Error(`${file}: no IHDR`);
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20), bytes: b.length };
}

function findChrome() {
  const dir = path.join(__dirname, "..", ".oc-isolated", "cache", "ms-playwright");
  const entries = fs.readdirSync(dir).filter((e) => e.startsWith("chromium-")).sort().reverse();
  for (const e of entries) {
    const c = path.join(dir, e, "chrome-linux64", "chrome");
    if (fs.existsSync(c)) return c;
  }
  throw new Error("Chromium executable not found");
}

const shots = [
  { name: "desktop", width: 1280, height: 720, fold: "desktop-1280x720.png", full: "desktop-full.png", mobile: false },
  { name: "mobile", width: 375, height: 667, fold: "mobile-375x667.png", full: "mobile-full.png", mobile: true },
];

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const executablePath = findChrome();
  const browser = await chromium.launch({
    headless: true, executablePath,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  const report = { url, executable: executablePath, browserVersion: browser.version(), startedAt: new Date().toISOString(), viewports: [] };

  for (const s of shots) {
    const ctx = await browser.newContext({
      viewport: { width: s.width, height: s.height },
      deviceScaleFactor: 1, isMobile: s.mobile, hasTouch: s.mobile,
    });
    const page = await ctx.newPage();
    const consoleMsgs = [], pageErrors = [], failed = [], requests = [];
    page.on("console", (m) => consoleMsgs.push({ type: m.type(), text: m.text(), location: m.location() }));
    page.on("pageerror", (e) => pageErrors.push(String(e.message || e)));
    page.on("requestfailed", (r) => failed.push({ url: r.url(), method: r.method(), reason: r.failure() && r.failure().errorText }));
    page.on("response", (r) => {
      requests.push({ url: r.url(), status: r.status() });
      if (r.status() >= 400) failed.push({ url: r.url(), method: r.request().method(), reason: `HTTP ${r.status()}` });
    });

    const resp = await page.goto(url, { waitUntil: "networkidle", timeout: 20000 });
    await page.evaluate(() => document.fonts && document.fonts.ready);
    const metrics = await page.evaluate(() => ({
      innerWidth, innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
      title: document.title,
      hasFooter: !!document.querySelector("footer"),
    }));

    const foldPath = path.join(outDir, s.fold);
    const fullPath = path.join(outDir, s.full);
    await page.screenshot({ path: foldPath, fullPage: false });
    await page.screenshot({ path: fullPath, fullPage: true });
    await ctx.close();

    const fold = pngSize(foldPath), full = pngSize(fullPath);
    report.viewports.push({
      name: s.name, requested: { width: s.width, height: s.height },
      documentStatus: resp ? resp.status() : null, metrics,
      files: {
        fold: { path: foldPath, ...fold, pass: fold.width === s.width && fold.height === s.height },
        full: { path: fullPath, ...full, pass: full.width === s.width && full.height >= s.height },
      },
      console: consoleMsgs, pageErrors, failedRequests: failed, requests,
    });
  }
  await browser.close();

  report.finishedAt = new Date().toISOString();
  const allConsole = report.viewports.flatMap((v) => v.console);
  report.summary = {
    dimensionsPass: report.viewports.every((v) => v.files.fold.pass && v.files.full.pass),
    consoleErrors: allConsole.filter((m) => m.type === "error").length,
    consoleWarnings: allConsole.filter((m) => m.type === "warning").length,
    pageErrors: report.viewports.reduce((n, v) => n + v.pageErrors.length, 0),
    failedRequests: report.viewports.reduce((n, v) => n + v.failedRequests.length, 0),
    noHorizontalOverflow: report.viewports.every((v) => v.metrics.scrollWidth <= v.metrics.innerWidth),
  };
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report.summary));
  const s = report.summary;
  process.exit(s.dimensionsPass && !s.consoleErrors && !s.pageErrors && !s.failedRequests ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
