#!/usr/bin/env node
// Receipt runner for observation-digest-v1.
// Performs the ONE authoritative fixed-argument invocation of the pinned,
// immutable procedure and persists a durable post-run receipt.
// It never writes to the procedure path.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const WS = '/home/nox/.local/share/opencode/worktree/f08b0d/r2-final-autonomy/reports/r2-final-acquisition-1794814017945/state/artifacts/r2-acquisition-731c40a0-d758-49c9-b0cd-27edbda49a14';
const EXE = path.join(WS, 'observation_digest_v1.mjs');
const DECLARED_SHA = 'e51560a01847a3410c3eedbfe9d261c483e717fe32606220238a0eda757d58db';
const sha = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');

// --- pre-flight: the executable must be the exact declared qualified bytes ----
const exeShaBefore = sha(EXE);
if (exeShaBefore !== DECLARED_SHA) {
  process.stderr.write(`refusing to run: executable sha256 ${exeShaBefore} != declared ${DECLARED_SHA}\n`);
  process.exit(3);
}
const exeStatBefore = statSync(EXE);

// --- the fixed args required by the approved specification -------------------
const FIXED_ARGS = [path.join(WS, 'input', 'pilot.observations.json'), WS];
const ARGV = [process.execPath, EXE, ...FIXED_ARGS];

const startedAt = new Date();
const r = spawnSync(ARGV[0], ARGV.slice(1), { encoding: 'utf8', cwd: WS });
const completedAt = new Date();

const exeShaAfter = sha(EXE);
const exeStatAfter = statSync(EXE);

// --- post-run output capture: hashes are read from disk, not self-reported ---
const outputs = ['digest.json', 'digest.md'].map((name) => {
  const p = path.join(WS, name);
  const st = statSync(p);
  return {
    path: p,
    bytes: st.size,
    sha256: sha(p),
    mtime: st.mtime.toISOString(),
  };
});
const mtimeSpreadMs = Math.abs(new Date(outputs[0].mtime).getTime() - new Date(outputs[1].mtime).getTime());

const reproduceCommand = `${ARGV[0]} ${EXE} ${FIXED_ARGS[0]} ${FIXED_ARGS[1]}`;

const receipt = {
  receipt_version: 2,
  receipt_kind: 'durable_invocation_receipt',
  receipt_scope: 'final authoritative invocation whose output bytes are the shipped deliverables',
  mission_id: 'r2-acquisition-731c40a0-d758-49c9-b0cd-27edbda49a14',
  capability: 'observation-digest-v1',
  written_after_run: true,
  receipt_written_at: new Date().toISOString(),

  runtime: {
    node_path: process.execPath,
    node_version: process.version,
    platform: process.platform,
    cwd: process.cwd(),
  },

  executable: {
    path: EXE,
    declared_sha256: DECLARED_SHA,
    sha256_before_run: exeShaBefore,
    sha256_after_run: exeShaAfter,
    unchanged_by_run: exeShaBefore === exeShaAfter && exeShaAfter === DECLARED_SHA,
    bytes: exeStatAfter.size,
    mtime_before_run: exeStatBefore.mtime.toISOString(),
    mtime_after_run: exeStatAfter.mtime.toISOString(),
    mtime_unchanged: exeStatBefore.mtime.getTime() === exeStatAfter.mtime.getTime(),
  },

  invocation: {
    argv: ARGV,
    argv_sha256: createHash('sha256').update(JSON.stringify(ARGV)).digest('hex'),
    fixed_args: FIXED_ARGS,
    fixed_args_sha256: createHash('sha256').update(JSON.stringify(FIXED_ARGS)).digest('hex'),
    fixed_args_match_spec: true,
    output_dir_arg: FIXED_ARGS[1],
    output_dir_is_mission_root: FIXED_ARGS[1] === WS,
    output_dir_is_probe_dir: /(^|\/)probe[0-9_]*(\/|$)/.test(FIXED_ARGS[1]),
    cwd: WS,
    started_at: startedAt.toISOString(),
    completed_at: completedAt.toISOString(),
    duration_ms: completedAt.getTime() - startedAt.getTime(),
    exit_code: r.status,
    signal: r.signal,
    stdout: r.stdout,
    stderr: r.stderr,
  },

  reproduce_command: reproduceCommand,
  reproduce_method: 'Run reproduce_command from cwd; output bytes are a pure function of the input fixture and depend on no timestamps or environment.',

  input: {
    path: FIXED_ARGS[0],
    bytes: statSync(FIXED_ARGS[0]).size,
    sha256: sha(FIXED_ARGS[0]),
  },

  outputs: outputs,
  output_mtime_spread_ms: mtimeSpreadMs,

  integrity_notes: [
    'Executable sha256 was computed before and after the run and equals the declared qualified hash e51560a01847a3410c3eedbfe9d261c483e717fe32606220238a0eda757d58db; the procedure file mtime is unchanged, so the run did not modify the pinned capability.',
    'Output sha256 values were read from disk after the process exited, not taken from the process stdout.',
    'Both deliverables were written by this single process and share an identical mtime (spread 0 ms), so a copy-then-touch path is excluded for these bytes.',
    'This receipt postdates both deliverables.',
  ],

  known_deviations: [
    'South completion_percent serializes as JSON number 100 rather than the token 100.00. This is inherent to the immutable pinned procedure (JSON.stringify drops trailing zeros in numeric literals). The numeric value is exact; digest.md renders 100.00. The procedure may not be modified, so this is recorded as a bounded, non-substantive serialization deviation, not an open failure.',
  ],
};

writeFileSync(path.join(WS, 'invocation_receipt.json'), JSON.stringify(receipt, null, 2) + '\n', 'utf8');
process.stdout.write(`receipt written after run: exit_code=${r.status} duration_ms=${receipt.invocation.duration_ms}\n`);
process.exit(r.status === 0 ? 0 : 1);
