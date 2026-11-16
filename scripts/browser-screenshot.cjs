#!/usr/bin/env node
/**
 * AWE GROUP — Browser screenshot helper.
 *
 * Usage:
 *   node scripts/browser-screenshot.js <url> <output-path>
 *
 * Example:
 *   node scripts/browser-screenshot.js \
 *     "file:///home/nox/awe-group-cleanroom-20261112/data/browser-test-page.html" \
 *     "/home/nox/awe-group-cleanroom-20261112/.awe-data/artifacts/MISSION_ID/screenshot.png"
 *
 * Automatically resolves Chromium and sets LD_LIBRARY_PATH as needed.
 * Exits 0 on success, 1 on failure. Prints JSON result to stdout.
 */

const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

const [, , url, outputPath] = process.argv;

if (!url || !outputPath) {
  console.error(
    JSON.stringify({
      success: false,
      error: "Usage: node browser-screenshot.js <url> <output-path>",
    })
  );
  process.exit(1);
}

(async () => {
  const projectRoot = path.join(__dirname, "..");

  // Resolve Chromium — prefer full chromium over headless-shell
  const msPlaywrightDir = path.join(projectRoot, ".oc-isolated", "cache", "ms-playwright");
  let executablePath = null;

  // Playwright knows the layout of the installed browser revision. Keep the
  // legacy scan as a fallback, but support both Chrome distribution layouts.
  const bundled = chromium.executablePath();
  if (fs.existsSync(bundled)) executablePath = bundled;
  if (!executablePath) {
    try {
      const entries = fs.readdirSync(msPlaywrightDir);
      for (const entry of entries) {
        if (!entry.startsWith("chromium-")) continue;
        for (const layout of ["chrome-linux64", "chrome-linux"]) {
          const candidate = path.join(msPlaywrightDir, entry, layout, "chrome");
          if (fs.existsSync(candidate)) {
            executablePath = candidate;
            break;
          }
        }
        if (executablePath) break;
      }
    } catch {}
  }

  if (!executablePath) {
    console.error(
      JSON.stringify({ success: false, error: "Chromium executable not found" })
    );
    process.exit(1);
  }

  // Ensure output directory exists
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  try {
    const browser = await chromium.launch({
      headless: true,
      executablePath,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });

    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(url, { waitUntil: "load", timeout: 15000 });
    const title = await page.title();
    await page.screenshot({ path: outputPath, fullPage: false, animations: "disabled" });
    await browser.close();

    const stat = fs.statSync(outputPath);
    console.log(
      JSON.stringify({
        success: true,
        url,
        outputPath,
        title,
        size_bytes: stat.size,
        executable: executablePath,
        timestamp: new Date().toISOString(),
      })
    );
    process.exit(0);
  } catch (err) {
    console.error(
      JSON.stringify({ success: false, error: String(err.message) })
    );
    process.exit(1);
  }
})();
