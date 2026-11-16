#!/bin/sh
# Bounded local availability probe for missing-browser-renderer.
# Read-only: locates renderers already present on the host. Installs nothing,
# executes no catalogue candidate, performs no network access.
cd /home/nox/.local/share/opencode/worktree/f08b0d/r2-ucl-integration/reports/ucl-live-1794753593557/state/artifacts/ucl-live-6869c6cb-72eb-44b7-80c8-ea76d07ce369 || exit 9

REPORT=probe_environment.txt
: > "$REPORT"
echo "== probe time (UTC) ==" >> "$REPORT"
date -u >> "$REPORT"
echo >> "$REPORT"

for c in google-chrome google-chrome-stable chromium chromium-browser chrome headless_shell \
         firefox wkhtmltoimage wkhtmltopdf cutycapt weasyprint rsvg-convert inkscape \
         convert magick node npm python3 npx playwright pandoc; do
  p=$(command -v "$c" 2>/dev/null)
  if [ -n "$p" ]; then
    echo "FOUND   $c -> $p" >> "$REPORT"
  else
    echo "ABSENT  $c" >> "$REPORT"
  fi
done

echo >> "$REPORT"
echo "== versions (already-installed binaries only) ==" >> "$REPORT"
for c in google-chrome google-chrome-stable chromium chromium-browser node python3; do
  if command -v "$c" >/dev/null 2>&1; then
    printf '%s: ' "$c" >> "$REPORT"
    "$c" --version 2>&1 | head -n 1 >> "$REPORT"
  fi
done

echo >> "$REPORT"
echo "== python http/server-side render modules (import check only) ==" >> "$REPORT"
if command -v python3 >/dev/null 2>&1; then
  python3 - <<'PY' >> "$REPORT" 2>&1
mods = ["playwright", "selenium", "pyppeteer", "weasyprint", "imgkit", "PIL"]
for m in mods:
    try:
        __import__(m)
        print("IMPORT-OK   " + m)
    except Exception as e:
        print("IMPORT-FAIL " + m + " (" + type(e).__name__ + ")")
PY
else
  echo "python3 ABSENT - import check skipped" >> "$REPORT"
fi

echo >> "$REPORT"
echo "== node global headless packages (filesystem listing only) ==" >> "$REPORT"
if command -v npm >/dev/null 2>&1; then
  npm root -g 2>/dev/null | while read -r d; do
    echo "npm root -g: $d" >> "$REPORT"
    [ -d "$d" ] && ls -1 "$d" 2>/dev/null | head -n 40 >> "$REPORT"
  done
else
  echo "npm ABSENT" >> "$REPORT"
fi

echo "probe complete" >> "$REPORT"
cat "$REPORT"
