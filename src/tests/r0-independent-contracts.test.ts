/**
 * Independent R0 contract tests. Failures on baseline remain REAL test failures.
 * Run: node --import tsx --test --test-concurrency=1 src/tests/r0-independent-*.test.ts
 * No live provider calls; no app imports in this parent process.
 */
import test from "node:test";
import { scenario } from "./helpers/r0-harness.js";

const contracts: Array<[string, string]> = [
  ["storage-roundtrip", "storage preserves successful artifact bytes and unrelated mission data"],
  ["cancelled-artifact", "cancelled mission rejects late artifact and creates no file or metadata"],
  ["cancelled-update", "cancelled mission cannot be resurrected to completed by late update"],
  ["cancelled-running", "cancelled mission cannot be resurrected to running by late update"],
  ["cross-process", "concurrent processes preserve disjoint mission patches without write collisions"],
  ["parallel-missions", "concurrent independent missions do not overwrite each other"],
  ["empty-tools", "empty specialist tool request grants no ambient shell or allTools"],
  ["unknown-tools", "unknown specialist tool request grants no ambient shell or allTools"],
  ["mixed-tools", "mixed known/unknown request grants only the requested known tool"],
  ["allowed-tools", "allowedTools intersects requested tools and denies requested shell"],
  ["empty-allowlist", "explicit empty allowedTools denies every requested tool"],
  ["shell-success", "shell returns actual stdout, stderr and exit code"],
  ["shell-failure", "shell nonzero exit is not success"],
  ["shell-cwd", "shell denies outside cwd before any side effect"],
  ["shell-abort", "AbortSignal stops running shell process tree before late marker"],
  ["shell-preabort", "pre-aborted shell performs no side effect"],
  ["recursion-depth", "recursion depth refusal creates zero children and explicit issue"],
  ["recursion-budget", "recursion exhausted budget creates zero children and explicit issue"],
  ["recursion-isolation", "independent mission delegation sessions remain isolated"],
  ["timeout-success", "timeout wrapper propagates the exact successful result"],
  ["timeout-failure", "timeout wrapper preserves underlying failure without timeout callback"],
  ["timeout-expiry", "timeout has explicit error identity and invokes checkpoint callback once"],
  ["reconcile-exclusion", "orphan reconciliation preserves explicitly active missions"],
  ["crash-recovery", "SIGKILL preserves durable success checkpoint and artifact through orphan recovery"],
  ["qa-empty-criterion", "blank QA criterion cannot certify a real acceptance criterion"],
  ["qa-unique-criteria", "one QA result cannot certify multiple mission criteria"],
  ["provider", "offline provider outcome evaluator preserves failures and actual new artifact IDs"],
  ["children", "pure children plan resolver executes distinct tasks without cloning"],
  ["lease", "cross-process acquire/release lease and live-owner reconciliation API"],
  ["manager", "offline manager success, false-success refusal, approved grants and model cancellation"],
  ["manager-tool-cancel", "manager cancellation aborts a real shell tool and prevents late side effects"],
  ["manager-double-run", "second manager cannot run alongside a live owner in another process"],
  ["manager-crash-resume", "SIGKILL after a durable effect resumes without repeating that effect"],
  ["resume", "side-effect-free resume policy import matches task identity"],
];

for (const [name, description] of contracts) {
  // The cross-process fixture cold-starts four nested tsx writers in addition
  // to its parent worker. Keep every assertion, but do not turn scheduler/CPU
  // contention into a false product failure at the generic 25-second watchdog.
  const watchdogMs = name === "cross-process" ? 90_000 : 25_000;
  test(`R0 ${name}: ${description}`, { timeout: watchdogMs + 5_000 }, () => scenario(name, watchdogMs));
}
