import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { verifyWebProduct, WEB_PRODUCT_CONTRACT_DIGEST } from '../capabilities/web-product.js';
import { writeStaticTaskTracker } from './helpers/r1-static-product-fixture.js';

// Handwritten verifier control ONLY. This is not agent execution or a delivered product.
async function control(mutate?: (root: string) => void, options: { browserExecutablePath?: string } = {}) {
  const workspace = fs.mkdtempSync(path.join(process.cwd(), '.r1-web-fixture-'));
  const root = path.join(workspace, 'product'); fs.mkdirSync(root);
  writeStaticTaskTracker(root);
  // XML namespace is a URI, not a network fetch. Use an empty local icon instead:
  // Chromium accepts this SVG without a namespace when served as image/svg+xml.
  fs.writeFileSync(path.join(root, 'icon.svg'), '<svg width="16" height="16"><rect width="16" height="16" fill="blue"/></svg>');
  try {
    mutate?.(root);
    const receipt = await verifyWebProduct({ workspaceRoot: workspace, projectDir: root, actionTimeoutMs: 500, ...options });
    assert.deepEqual(fs.readdirSync(workspace), ['product'], 'ephemeral QA workspace must be cleaned');
    return receipt;
  } finally { fs.rmSync(workspace, { recursive: true, force: true }); }
}
const replace = (root: string, from: string, to: string, file = 'app.js') => {
  const target = path.join(root, file); const source = fs.readFileSync(target, 'utf8');
  assert.ok(source.includes(from), `control mutation absent: ${from}`);
  fs.writeFileSync(target, source.replace(from, to));
};

test('real sandbox/Chromium accept an independently authored finite product and bind evidence', async () => {
  const result = await control();
  assert.equal(result.outcome, 'PASS', JSON.stringify(result, null, 2));
  assert.equal(result.qualification, 'NOT_ASSESSED');
  assert.equal(result.contract_digest, WEB_PRODUCT_CONTRACT_DIGEST);
  assert.ok(result.browser_version);
  assert.equal(result.files.length, 4);
  assert.ok(result.commands.length === 1 && result.commands[0].exit_code === 0);
  assert.match(result.commands[0].argv.join(' '), /bwrap.*--check/);
  assert.ok(result.checks.every(check => check.passed));
  assert.ok(result.checks.some(check => check.id === 'persist-task-and-completion'));
  const sha = (text: string) => createHash('sha256').update(text).digest('hex');
  assert.equal(result.tree_sha256, sha(JSON.stringify(result.files)));
  const { receipt_sha256, ...body } = result;
  assert.equal(receipt_sha256, sha(JSON.stringify(body)));
});

test('real interactions reject missing persistence, filter, deletion, completion and literal rendering', async t => {
  const cases = [
    ['persistence', "localStorage.setItem('fixture-tasks', JSON.stringify(tasks));", '', 'persist-task-and-completion'],
    ['filter', "if (filter.value === 'active' && task.done || filter.value === 'completed' && !task.done) continue;", '', 'toggle-and-filter'],
    ['deletion', 'tasks = tasks.filter(other => other.id !== task.id);', 'tasks = [];', 'reverse-toggle-and-delete'],
    ['completion', 'task.done = box.checked;', 'task.done = false;', 'toggle-and-filter'],
    ['literal text', 'title.textContent = task.text;', 'title.innerHTML = task.text;', 'add-trim-and-keyboard'],
    ['blank validation', 'if (!text) return;', '', 'reject-blank-input'],
  ];
  for (const [name, from, to, failing] of cases) await t.test(name, async () => {
    const result = await control(root => replace(root, from, to));
    assert.equal(result.outcome, 'FAIL', JSON.stringify(result));
    assert.ok(result.issues.includes(`BEHAVIOR: ${failing}`), JSON.stringify(result));
    assert.ok(result.browser_version, 'must exercise real browser, not just inspect source');
  });
});

test('syntax verifier rejects unused broken JS; browser catches inline syntax and runtime errors', async t => {
  await t.test('unused JS parsed by real sandboxed node', async () => {
    const result = await control(root => fs.writeFileSync(path.join(root, 'unused.js'), 'const broken = ;'));
    assert.equal(result.outcome, 'FAIL'); assert.ok(result.issues.includes('JS_SYNTAX: unused.js'));
    assert.equal(result.browser_version, null); assert.ok(result.commands.some(command => command.exit_code !== 0));
  });
  for (const [name, script] of [['inline syntax', 'const broken = ;'], ['runtime', 'throw new Error("seeded runtime defect")']]) {
    await t.test(name, async () => {
      const result = await control(root => replace(root, '</body>', `<script>${script}</script></body>`, 'index.html'));
      assert.equal(result.outcome, 'FAIL');
      assert.ok(result.issues.some(issue => issue.startsWith('BROWSER_ERROR:')), JSON.stringify(result));
    });
  }
});

test('URL contract rejects literals, encoded DOM links and computed fetch without external network', async t => {
  await t.test('dead literal', async () => {
    const result = await control(root => fs.appendFileSync(path.join(root, 'app.js'), '\n// https://example.invalid/forbidden'));
    assert.equal(result.outcome, 'FAIL'); assert.ok(result.issues.includes('FORBIDDEN_URL_LITERAL: app.js'));
    assert.equal(result.browser_version, null);
  });
  await t.test('HTML entity encoded external link', async () => {
    const result = await control(root => replace(root, '</main>', '<a href="https&#58;//example.invalid/">External</a></main>', 'index.html'));
    assert.equal(result.outcome, 'FAIL'); assert.ok(result.issues.includes('BEHAVIOR: dom-url-contract'), JSON.stringify(result));
  });
  await t.test('computed external fetch is CSP blocked', async () => {
    const result = await control(root => fs.appendFileSync(path.join(root, 'app.js'), '\nfetch(["https:", "", "example.invalid"].join("/")).catch(() => {});'));
    assert.equal(result.outcome, 'FAIL');
    assert.ok(result.issues.some(issue => /BROWSER_CONSOLE|FORBIDDEN_NETWORK/.test(issue)), JSON.stringify(result));
  });
});

test('missing local resources, inaccessible controls and horizontal overflow fail', async t => {
  await t.test('missing stylesheet', async () => {
    const result = await control(root => fs.unlinkSync(path.join(root, 'style.css')));
    assert.equal(result.outcome, 'FAIL'); assert.ok(result.issues.includes('MISSING_OR_INVALID_RESOURCE: style.css'));
  });
  await t.test('inaccessible input label', async () => {
    const result = await control(root => replace(root, 'New task <input', 'Wrong name <input', 'index.html'));
    assert.equal(result.outcome, 'FAIL'); assert.ok(result.issues.includes('BEHAVIOR: accessible-empty-state'));
  });
  await t.test('mobile overflow', async () => {
    const result = await control(root => fs.appendFileSync(path.join(root, 'style.css'), 'body { min-width: 900px }'));
    assert.equal(result.outcome, 'FAIL'); assert.ok(result.issues.includes('BEHAVIOR: responsive-layout'));
  });
});

test('artifact scope fails closed for links, missing entry, oversized files and wrong root', async t => {
  for (const [name, mutate] of [
    ['symlink', (root: string) => fs.symlinkSync(path.join(root, 'app.js'), path.join(root, 'linked.js'))],
    ['missing index', (root: string) => fs.unlinkSync(path.join(root, 'index.html'))],
    ['oversized', (root: string) => fs.writeFileSync(path.join(root, 'large.txt'), 'a'.repeat(1_048_577))],
    ['hardlink', (root: string) => fs.linkSync(path.join(root, 'app.js'), path.join(root, 'linked.js'))],
  ] as const) await t.test(name, async () => {
    const result = await control(mutate); assert.equal(result.outcome, 'FAIL');
    assert.equal(result.tree_sha256, null); assert.equal(result.browser_version, null);
  });
  const result = await verifyWebProduct({ workspaceRoot: process.cwd(), projectDir: process.cwd() });
  assert.equal(result.outcome, 'FAIL'); assert.match(result.issues.join(), /PROJECT_OUTSIDE/);
});

test('unavailable browser is BLOCKED, never an accepted or silently skipped control', async () => {
  const result = await control(undefined, { browserExecutablePath: path.join(process.cwd(), 'no-such-browser') });
  assert.equal(result.outcome, 'BLOCKED'); assert.equal(result.browser_version, null);
  assert.ok(result.issues.some(issue => issue.startsWith('BROWSER_UNAVAILABLE:')));
});
