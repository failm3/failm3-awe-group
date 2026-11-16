/** Independent, finite static-product QA. No solver, model, approval or orchestrator. */
import { createHash, randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createServer } from 'node:http';
import { spawnSync } from 'node:child_process';
import { chromium, expect, type Browser, type Page } from '@playwright/test';
import { shellSandboxArgs } from '../security/shell-sandbox.js';
import { resourceLimitedSandbox } from '../security/resource-limits.js';

export const WEB_PRODUCT_VERIFIER_VERSION = 'r1-static-task-tracker-v1';
export const WEB_PRODUCT_CONTRACT = Object.freeze({
  version: WEB_PRODUCT_VERIFIER_VERSION,
  files: 'index.html plus local .html/.css/.js/.mjs/.json/.txt/.svg files; UTF-8, no symlinks, max 64 files/1 MiB/8 levels',
  build: 'Zero-dependency static site. Snapshot is the deployable tree; every JS module must pass sandboxed node --check. No package scripts run.',
  controls: 'One heading Task tracker; textbox New task; button Add task; combobox Filter tasks with all/active/completed values; list Tasks; each listitem contains exact task text, checkbox Complete <task text>, button Delete <task text>.',
  behavior: 'Initially empty; trim input, reject whitespace; add via button and Enter; render task text literally; toggle completion both ways; exact all/active/completed filtering; task text/completion/deletion survive reload; deletion removes only selected item.',
  accessibility: 'Named native/ARIA controls above are visible and keyboard operable; narrow 375px and desktop 1280px layouts have no horizontal overflow. This is a finite accessibility check, not WCAG certification.',
  network: 'No external URL literals (http/https/ws/wss or protocol-relative) in source; no nonlocal URL attributes, remote requests, workers, frames, objects, WebSockets or connections. All resources must be in the snapshot.',
  acceptance: 'No browser page errors, error console messages, failed/missing resources or CSP violations during the bounded scenario. PASS applies only to this contract and exact tree hash, not qualification.',
});
const sha = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');
export const WEB_PRODUCT_CONTRACT_DIGEST = sha(JSON.stringify(WEB_PRODUCT_CONTRACT));
const MAX_BYTES = 1_048_576;
const MAX_FILES = 64;
const MIME: Record<string, string> = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.mjs': 'text/javascript', '.json': 'application/json', '.txt': 'text/plain', '.svg': 'image/svg+xml' };
const within = (root: string, file: string) => file.startsWith(root + path.sep);

export interface WebProductVerificationOptions {
  /** Host-selected mission workspace, never an agent-supplied broader root. */
  workspaceRoot: string;
  projectDir: string;
  /** Trusted host configuration; defaults exclusively to this project's installed cache. */
  browserExecutablePath?: string;
  actionTimeoutMs?: number;
}
export interface WebProductVerificationReceipt {
  verifier_version: typeof WEB_PRODUCT_VERIFIER_VERSION;
  contract_digest: string;
  mode: 'independent-local-verification';
  tree_sha256: string | null;
  files: Array<{ path: string; bytes: number; sha256: string }>;
  checks: Array<{ id: string; passed: boolean; detail?: string }>;
  commands: Array<{ argv: string[]; file: string; exit_code: number | null; stderr: string }>;
  issues: string[];
  outcome: 'PASS' | 'FAIL' | 'BLOCKED';
  qualification: 'NOT_ASSESSED';
  browser_version: string | null;
  receipt_sha256: string;
}

/** Reject links/special files, bound reads, and bind evidence to immutable served bytes. */
function snapshot(options: WebProductVerificationOptions): Map<string, Buffer> {
  const workspace = fs.realpathSync(options.workspaceRoot);
  const root = path.resolve(options.projectDir);
  if (!within(workspace, root) || fs.realpathSync(root) !== root) throw new Error('PROJECT_OUTSIDE_WORKSPACE_OR_SYMLINK');
  const files = new Map<string, Buffer>();
  let total = 0;
  let entries = 0;
  function visit(dir: string, depth: number) {
    if (depth > 8) throw new Error('TREE_DEPTH_EXCEEDED');
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
      if (++entries > 128) throw new Error('TREE_ENTRY_LIMIT');
      if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(entry.name)) throw new Error('UNSUPPORTED_FILENAME');
      const file = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) throw new Error('SYMLINK_FORBIDDEN');
      if (entry.isDirectory()) { visit(file, depth + 1); continue; }
      if (!entry.isFile() || !MIME[path.extname(file)]) throw new Error('UNSUPPORTED_FILE');
      if (files.size >= MAX_FILES) throw new Error('FILE_LIMIT_EXCEEDED');
      const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
      try {
        if (!within(root, fs.realpathSync(`/proc/self/fd/${fd}`))) throw new Error('SNAPSHOT_PATH_ESCAPE');
        const before = fs.fstatSync(fd, { bigint: true });
        if (!before.isFile() || before.nlink !== 1n || before.size > BigInt(MAX_BYTES - total)) throw new Error('FILE_TYPE_OR_SIZE');
        const bytes = Buffer.alloc(Number(before.size));
        let offset = 0;
        while (offset < bytes.length) {
          const count = fs.readSync(fd, bytes, offset, bytes.length - offset, offset);
          if (!count) throw new Error('SNAPSHOT_CHANGED');
          offset += count;
        }
        const after = fs.fstatSync(fd, { bigint: true });
        if (before.size !== after.size || before.ctimeNs !== after.ctimeNs || before.mtimeNs !== after.mtimeNs) throw new Error('SNAPSHOT_CHANGED');
        new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        total += bytes.length;
        files.set(path.relative(root, file).split(path.sep).join('/'), bytes);
      } finally { fs.closeSync(fd); }
    }
  }
  visit(root, 0);
  if (!files.has('index.html')) throw new Error('MISSING_INDEX');
  return files;
}

function cachedChromium(): string {
  const cache = path.join(process.cwd(), '.oc-isolated/cache/ms-playwright');
  for (const name of fs.readdirSync(cache).filter(name => /^chromium-\d+$/.test(name)).sort().reverse()) {
    for (const dir of ['chrome-linux64', 'chrome-linux']) {
      const candidate = path.join(cache, name, dir, 'chrome');
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  throw new Error('No project-local Chromium installed');
}

/** Fresh browser context, randomized inputs, accessible locators, no app internals. */
async function exercise(page: Page, check: (id: string, action: () => Promise<void>) => Promise<void>, timeout: number) {
  const nonce = randomUUID().slice(0, 8);
  const first = `Plan ${nonce}`;
  const second = `Review ${nonce}`;
  const literal = `<b>Literal & ${nonce}</b>`;
  const input = page.getByRole('textbox', { name: 'New task', exact: true });
  const add = page.getByRole('button', { name: 'Add task', exact: true });
  const filter = page.getByRole('combobox', { name: 'Filter tasks', exact: true });
  const list = page.getByRole('list', { name: 'Tasks', exact: true });
  const rows = list.getByRole('listitem');
  const row = (text: string) => rows.filter({ has: page.getByText(text, { exact: true }) });
  const complete = (text: string) => row(text).getByRole('checkbox', { name: `Complete ${text}`, exact: true });
  const remove = (text: string) => row(text).getByRole('button', { name: `Delete ${text}`, exact: true });
  const count = (n: number) => expect(rows).toHaveCount(n, { timeout });
  const visible = (text: string) => expect(row(text)).toBeVisible({ timeout });
  await check('accessible-empty-state', async () => {
    await expect(page.getByRole('heading', { name: 'Task tracker', exact: true })).toBeVisible({ timeout });
    await expect(input).toBeVisible({ timeout }); await expect(add).toBeVisible({ timeout });
    await expect(filter).toBeVisible({ timeout }); await expect(list).toHaveCount(1, { timeout });
    await filter.selectOption('all'); await count(0);
  });
  await check('reject-blank-input', async () => { await input.fill('   '); await add.click(); await count(0); });
  await check('add-trim-and-keyboard', async () => {
    await input.fill(`  ${first}  `); await add.click(); await count(1); await visible(first);
    await input.fill(second); await input.press('Enter'); await count(2); await visible(second);
    await input.fill(literal); await add.click(); await count(3); await visible(literal);
    await expect(row(literal).locator('b')).toHaveCount(0, { timeout });
  });
  await check('toggle-and-filter', async () => {
    await complete(first).focus(); await complete(first).press('Space');
    await expect(complete(first)).toBeChecked({ timeout });
    await filter.selectOption('active'); await count(2); await visible(second); await visible(literal);
    await filter.selectOption('completed'); await count(1); await visible(first);
    await filter.selectOption('all'); await count(3);
  });
  await check('persist-task-and-completion', async () => {
    await page.reload(); await filter.selectOption('all'); await count(3);
    await visible(first); await visible(second); await visible(literal);
    await expect(complete(first)).toBeChecked({ timeout });
    await expect(complete(second)).not.toBeChecked({ timeout });
  });
  await check('reverse-toggle-and-delete', async () => {
    await complete(first).uncheck(); await filter.selectOption('completed'); await count(0);
    await filter.selectOption('active'); await count(3);
    await remove(second).focus(); await remove(second).press('Enter'); await count(2);
    await visible(first); await visible(literal);
    await page.reload(); await filter.selectOption('all'); await count(2);
    await visible(first); await visible(literal); await expect(complete(first)).not.toBeChecked({ timeout });
  });
  await check('responsive-layout', async () => {
    for (const width of [375, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      await expect(input).toBeVisible({ timeout }); await expect(add).toBeVisible({ timeout });
      // String expression avoids coupling this Node module to DOM ambient types.
      const overflow = await page.evaluate('document.documentElement.scrollWidth > window.innerWidth');
      if (overflow) throw new Error(`Horizontal overflow at ${width}px`);
    }
  });
}

/**
 * Host QA entry point: reads a strict static artifact tree, syntax-checks it in
 * the EXISTING shell sandbox, then serves immutable bytes on ephemeral loopback.
 * Only the host can decide whether/when to invoke this after approved dispatch.
 * No arbitrary build scripts are executed. A receipt is evidence, never approval.
 */
export async function verifyWebProduct(options: WebProductVerificationOptions): Promise<WebProductVerificationReceipt> {
  const timeout = options.actionTimeoutMs ?? 2500;
  if (!Number.isSafeInteger(timeout) || timeout < 100 || timeout > 5000) throw new Error('Invalid action timeout');
  const checks: WebProductVerificationReceipt['checks'] = [];
  const commands: WebProductVerificationReceipt['commands'] = [];
  const issues: string[] = [];
  let files: WebProductVerificationReceipt['files'] = [];
  let treeHash: string | null = null;
  let browserVersion: string | null = null;
  let blocked = false;
  const issue = (text: string) => { if (issues.length < 32 && !issues.includes(text)) issues.push(text.slice(0, 600)); };
  const receipt = (): WebProductVerificationReceipt => {
    const body: Omit<WebProductVerificationReceipt, 'receipt_sha256'> = { verifier_version: WEB_PRODUCT_VERIFIER_VERSION, contract_digest: WEB_PRODUCT_CONTRACT_DIGEST,
      mode: 'independent-local-verification' as const, tree_sha256: treeHash, files, checks, commands, issues,
      outcome: blocked ? 'BLOCKED' as const : issues.length ? 'FAIL' as const : 'PASS' as const,
      qualification: 'NOT_ASSESSED' as const, browser_version: browserVersion };
    return { ...body, receipt_sha256: sha(JSON.stringify(body)) };
  };
  let bytes: Map<string, Buffer>;
  try {
    bytes = snapshot(options);
    files = [...bytes].map(([file, content]) => ({ path: file, bytes: content.length, sha256: sha(content) }));
    treeHash = sha(JSON.stringify(files));
    checks.push({ id: 'bounded-artifact-snapshot', passed: true });
  } catch (error) { issue(`ARTIFACT: ${String(error)}`); return receipt(); }
  for (const [file, content] of bytes) {
    // This strict finite source contract also rejects dead external URL literals.
    if (/(?:https?|wss?):\/\/|["'(=]\s*\/\/[^/\s]/i.test(content.toString('utf8'))) issue(`FORBIDDEN_URL_LITERAL: ${file}`);
  }
  checks.push({ id: 'source-url-contract', passed: !issues.length });
  if (issues.length) return receipt();

  let scratch: string | undefined;
  let browser: Browser | undefined;
  const server = createServer();
  try {
    scratch = fs.mkdtempSync(path.join(fs.realpathSync(options.workspaceRoot), 'web-qa-'));
    const sandboxArgs = ['--unshare-pid', '--die-with-parent',
      ...shellSandboxArgs({ workdir: scratch }, scratch), '--proc', '/proc', '--dev', '/dev', '--chdir', scratch,
      '--', process.execPath, '--input-type=module', '--check'];
    for (const [file, content] of bytes) {
      if (!/\.m?js$/.test(file)) continue;
      const launch = resourceLimitedSandbox(sandboxArgs, { PATH: '/usr/bin:/bin' }, { wallMs: 5000 });
      const result = spawnSync(launch.executable, launch.args, { input: content, encoding: 'utf8', timeout: 6000,
        maxBuffer: 32_768, env: launch.env });
      commands.push({ argv: [launch.executable, ...launch.args],
        file, exit_code: result.status, stderr: (result.stderr ?? '').slice(0, 2000) });
      if (result.status !== 0) {
        const syntax = /SyntaxError/.test(result.stderr ?? '');
        if (!syntax) blocked = true;
        issue(`${syntax ? 'JS_SYNTAX' : 'SANDBOX_UNAVAILABLE'}: ${file}`);
      }
    }
    checks.push({ id: 'sandboxed-js-syntax', passed: !issues.length });
    if (issues.length) return receipt();
    const csp = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'none'; worker-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'self'";
    server.on('request', (req, res) => {
      let file: string;
      try { file = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname).slice(1) || 'index.html'; }
      catch { res.writeHead(400).end(); return; }
      const body = bytes.get(file);
      if (req.method !== 'GET' || !body) { issue(`MISSING_OR_INVALID_RESOURCE: ${file}`); res.writeHead(404).end(); return; }
      res.writeHead(200, { 'Content-Type': `${MIME[path.extname(file)]}; charset=utf-8`, 'Cache-Control': 'no-store',
        'Content-Security-Policy': csp, 'X-Content-Type-Options': 'nosniff' }); res.end(body);
    });
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No loopback address');
    const origin = `http://127.0.0.1:${address.port}`;
    try {
      browser = await chromium.launch({ executablePath: options.browserExecutablePath ?? cachedChromium(),
        chromiumSandbox: true, timeout: 15_000,
        // Chromium's Unix socket path must remain below Linux's 108-byte bound.
        env: { PATH: '/usr/bin:/bin', HOME: scratch, TMPDIR: '/tmp/opencode',
          LD_LIBRARY_PATH: path.join(process.cwd(), '.chromium-deps/usr/lib/x86_64-linux-gnu') },
        args: ['--disable-background-networking', '--disable-component-update', '--disable-sync'] });
      browserVersion = browser.version();
    } catch (error) { blocked = true; issue(`BROWSER_UNAVAILABLE: ${String(error).slice(0, 300)}`); return receipt(); }
    const context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: false, viewport: { width: 1280, height: 800 } });
    context.setDefaultTimeout(timeout); context.setDefaultNavigationTimeout(5000);
    await context.route('**/*', async route => {
      const request = route.request();
      if (new URL(request.url()).origin !== origin || request.method() !== 'GET') {
        issue('FORBIDDEN_NETWORK_REQUEST'); await route.abort();
      } else await route.continue();
    });
    const page = await context.newPage();
    page.on('pageerror', error => issue(`BROWSER_ERROR: ${error.message}`));
    page.on('requestfailed', request => issue(`RESOURCE_FAILED: ${request.failure()?.errorText ?? 'unknown'}`));
    page.on('console', message => { if (message.type() === 'error') issue(`BROWSER_CONSOLE: ${message.text()}`); });
    page.on('download', download => { issue('DOWNLOAD_FORBIDDEN'); void download.cancel(); });
    page.on('dialog', dialog => { issue('DIALOG_FORBIDDEN'); void dialog.dismiss(); });
    context.on('page', popup => { if (popup !== page) { issue('POPUP_FORBIDDEN'); void popup.close(); } });
    const check = async (id: string, action: () => Promise<void>) => {
      try { await action(); checks.push({ id, passed: true }); }
      catch (error) { checks.push({ id, passed: false, detail: String(error).slice(0, 500) }); issue(`BEHAVIOR: ${id}`); throw error; }
    };
    try {
      await check('load-local-product', async () => { await page.goto(origin, { waitUntil: 'load' }); });
      await exercise(page, check, timeout);
      await check('dom-url-contract', async () => {
        const forbidden = await page.evaluate(`(() => {
          for (const node of document.querySelectorAll('*')) {
            for (const attr of ['href','src','action','formaction','poster','data']) {
              const value = node.getAttribute(attr);
              if (value && new URL(value, document.baseURI).origin !== location.origin) return true;
            }
            if (node.hasAttribute('srcset') || node.hasAttribute('srcdoc') || ['IFRAME','OBJECT','EMBED','BASE'].includes(node.tagName)) return true;
          }
          return false;
        })()`);
        if (forbidden) throw new Error('Forbidden URL or embedded document in DOM');
      });
    } catch { /* Named failing check already recorded; do not cascade dependent steps. */ }
    checks.push({ id: 'runtime-errors-and-resource-policy', passed: !issues.length });
  } catch (error) { blocked = true; issue(`VERIFIER_ENVIRONMENT: ${String(error)}`); }
  finally {
    if (browser) await browser.close();
    if (server.listening) {
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
    if (scratch) fs.rmSync(scratch, { recursive: true, force: true });
  }
  return receipt();
}
