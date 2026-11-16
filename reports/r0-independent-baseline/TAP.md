TAP version 13
# Subtest: R0 storage-roundtrip: storage preserves successful artifact bytes and unrelated mission data
ok 1 - R0 storage-roundtrip: storage preserves successful artifact bytes and unrelated mission data
  ---
  duration_ms: 1115.455527
  type: 'test'
  ...
# Subtest: R0 cancelled-artifact: cancelled mission rejects late artifact and creates no file or metadata
not ok 2 - R0 cancelled-artifact: cancelled mission rejects late artifact and creates no file or metadata
  ---
  duration_ms: 1199.825
  type: 'test'
  location: '/home/nox/awe-group-cleanroom-20261112/.r0-work/qa/src/tests/r0-independent-contracts.test.ts:1:2322'
  failureType: 'testCodeFailure'
  error: |-
    cancelled-artifact: child code=1, signal=null
    
    node:internal/modules/run_main:123
        triggerUncaughtException(
        ^
    
    AssertionError [ERR_ASSERTION]: Operation must reject or return explicit success:false
        at denied (/home/nox/awe-group-cleanroom-20261112/.r0-work/qa/src/tests/helpers/r0-worker.ts:59:12)
        at async <anonymous> (/home/nox/awe-group-cleanroom-20261112/.r0-work/qa/src/tests/helpers/r0-worker.ts:113:5) {
      generatedMessage: false,
      code: 'ERR_ASSERTION',
      actual: false,
      expected: true,
      operator: '==',
      diff: 'simple'
    }
    
    Node.js v22.23.3
    
    
    1 !== 0
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 0
  actual: 1
  operator: 'strictEqual'
  stack: |-
    denied (/home/nox/awe-group-cleanroom-20261112/.r0-work/qa/src/tests/helpers/r0-worker.ts:59:12)
    async <anonymous> (/home/nox/awe-group-cleanroom-20261112/.r0-work/qa/src/tests/helpers/r0-worker.ts:113:5) {
    scenario (/home/nox/awe-group-cleanroom-20261112/.r0-work/qa/src/tests/helpers/r0-harness.ts:39:12)
    process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    async Test.run (node:internal/test_runner/test:1054:7)
    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
  ...
# Subtest: R0 cancelled-update: cancelled mission cannot be resurrected to completed by late update
not ok 3 - R0 cancelled-update: cancelled mission cannot be resurrected to completed by late update
  ---
  duration_ms: 1772.107844
  type: 'test'
  location: '/home/nox/awe-group-cleanroom-20261112/.r0-work/qa/src/tests/r0-independent-contracts.test.ts:1:2322'
  failureType: 'testCodeFailure'
  error: |-
    cancelled-update: child code=1, signal=null
    
    node:internal/modules/run_main:123
        triggerUncaughtException(
        ^
    
    AssertionError [ERR_ASSERTION]: Terminal cancellation lost to a late writer
    + actual - expected
    
    + 'completed'
    - 'cancelled'
    
        at <anonymous> (/home/nox/awe-group-cleanroom-20261112/.r0-work/qa/src/tests/helpers/r0-worker.ts:124:12) {
      generatedMessage: false,
      code: 'ERR_ASSERTION',
      actual: 'completed',
      expected: 'cancelled',
      operator: 'strictEqual',
      diff: 'simple'
    }
    
    Node.js v22.23.3
    
    
    1 !== 0
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 0
  actual: 1
  operator: 'strictEqual'
  stack: |-
    <anonymous> (/home/nox/awe-group-cleanroom-20261112/.r0-work/qa/src/tests/helpers/r0-worker.ts:124:12) {
    scenario (/home/nox/awe-group-cleanroom-20261112/.r0-work/qa/src/tests/helpers/r0-harness.ts:39:12)
    process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    async Test.run (node:internal/test_runner/test:1054:7)
    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
  ...
# Subtest: R0 cancelled-running: cancelled mission cannot be resurrected to running by late update
not ok 4 - R0 cancelled-running: cancelled mission cannot be resurrected to running by late update
  ---
  duration_ms: 1222.167668
  type: 'test'
  location: '/home/nox/awe-group-cleanroom-20261112/.r0-work/qa/src/tests/r0-independent-contracts.test.ts:1:2322'
  failureType: 'testCodeFailure'
  error: |-
    cancelled-running: child code=1, signal=null
    
    node:internal/modules/run_main:123
        triggerUncaughtException(
        ^
    
    AssertionError [ERR_ASSERTION]: Terminal cancellation lost to a late writer
    + actual - expected
    
    + 'running'
    - 'cancelled'
    
        at <anonymous> (/home/nox/awe-group-cleanroom-20261112/.r0-work/qa/src/tests/helpers/r0-worker.ts:124:12) {
      generatedMessage: false,
      code: 'ERR_ASSERTION',
      actual: 'running',
      expected: 'cancelled',
      operator: 'strictEqual',
      diff: 'simple'
    }
    
    Node.js v22.23.3
    
    
    1 !== 0
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 0
  actual: 1
  operator: 'strictEqual'
  stack: |-
    <anonymous> (/home/nox/awe-group-cleanroom-20261112/.r0-work/qa/src/tests/helpers/r0-worker.ts:124:12) {
    scenario (/home/nox/awe-group-cleanroom-20261112/.r0-work/qa/src/tests/helpers/r0-harness.ts:39:12)
    process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    async Test.run (node:internal/test_runner/test:1054:7)
    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
  ...
# Subtest: R0 cross-process: concurrent processes preserve disjoint mission patches without write collisions
not ok 5 - R0 cross-process: concurrent processes preserve disjoint mission patches without write collisions
  ---
  duration_ms: 3864.558407
  type: 'test'
  location: '/home/nox/awe-group-cleanroom-20261112/.r0-work/qa/src/tests/r0-independent-contracts.test.ts:1:2322'
  failureType: 'testCodeFailure'
  error: |-
    cross-process: child code=1, signal=null
    
    node:internal/modules/run_main:123
        triggerUncaughtException(
        ^
    
    AssertionError [ERR_ASSERTION]: Writer title failed: {"stdout":"READY\n","stderr":"Error: ENOENT: no such file or directory, rename '/home/nox/awe-group-cleanroom-20261112/.r0-work/qa/src/tests/helpers/r0-temp-uMnCBj/.awe-data/missions/r0-mission.json.tmp' -> '/home/nox/awe-group-cleanroom-20261112/.r0-work/qa/src/tests/helpers/r0-temp-uMnCBj/.awe-data/missions/r0-mission.json'\n[storage] Failed to read mission r0-mission: SyntaxError: Unexpected non-whitespace character after JSON at position 421 (line 19 column 2)\n    at JSON.parse (<anonymous>)\n    at loadMission (/home/nox/awe-group-cleanroom-20261112/.r0-work/qa/src/utils/storage.ts:43:22)\n    at Module.updateMission (/home/nox/awe-group-cleanroom-20261112/.r0-work/qa/src/utils/storage.ts:74:19)\n    at <anonymous> (/home/nox/awe-group-cleanroom-20261112/.r0-work/qa/src/tests/helpers/r0-worker.ts:134:31)\n    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)\nAssertionError [ERR_ASSERTION]: The expression evaluated to a falsy value:\n\n  assert.ok(storage.updateMission(target, { [field]: `${field}-${i}` }))\n\n[storage] Failed to read mission r0-mission: SyntaxError: Unexpected non-whitespace character after JSON at position 460 (line 20 column 4)\n    at JSON.parse (<anonymous>)\n    at loadMission (/home/nox/awe-group-cleanroom-20261112/.r0-work/qa/src/utils/storage.ts:43:22)\n    at Module.updateMission (/home/nox/awe-group-cleanroom-20261112/.r0-work/qa/src/utils/storage.ts:74:19)\n    at <anonymous> (/home/nox/awe-group-cleanroom-20261112/.r0-work/qa/src/tests/helpers/r0-worker.ts:134:31)\n    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)\n[storage] Failed to read mission r0-mission: SyntaxError: Unexpected non-whitespace character after JSON at position 460 (line 20 column 4)\n    at JSON.parse (<anonymous>)\n    at loadMission (/home/nox/awe-group-cleanroom-20261112/.r0-work/qa/src/utils/storage.ts:43:22)\n    at Module.updateMission (/home/nox/awe-group-cleanroom-20261112/.r0-work/qa/src/utils/storage.ts:74:19)\n    at <anonymous> (/home/nox/awe-group-cleanroom-20261112/.r0-work/qa/src/tests/helpers/r0-worker.ts:134:31)\n    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)\n[storage] Failed to read mission r0-mission: SyntaxError: Unexpected non-whitespace character after JSON at position 460 (line 20 column 4)\n    at JSON.parse (<anonymous>)\n    at loadMission (/home/nox/awe-group-cleanroom-20261112/.r0-work/qa/src/utils/storage.ts:43:22)\n    at Module.updateMission (/home/nox/awe-group-cleanroom-20261112/.r0-work/qa/src/utils/storage.ts:74:19)\n    at <anonymous> (/home/nox/awe-group-cleanroom-20261112/.r0-work/qa/src/tests/helpers/r0-worker.ts:134:31)\n    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)\n"}
    
    1 !== 0
    
        at runUpdateWorkers (/home/nox/awe-group-cleanroom-20261112/.r0-work/qa/src/tests/helpers/r0-worker.ts:85:14)
        at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
        at async <anonymous> (/home/nox/awe-group-cleanroom-20261112/.r0-work/qa/src/tests/helpers/r0-worker.ts:140:25) {
      generatedMessage: false,
      code: 'ERR_ASSERTION',
      actual: 1,
      expected: 0,
      operator: 'strictEqual',
      diff: 'simple'
    }
    
    Node.js v22.23.3
    
    
    1 !== 0
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 0
  actual: 1
  operator: 'strictEqual'
  stack: |-
    runUpdateWorkers (/home/nox/awe-group-cleanroom-20261112/.r0-work/qa/src/tests/helpers/r0-worker.ts:85:14)
    process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    async <anonymous> (/home/nox/awe-group-cleanroom-20261112/.r0-work/qa/src/tests/helpers/r0-worker.ts:140:25) {
    scenario (/home/nox/awe-group-cleanroom-20261112/.r0-work/qa/src/tests/helpers/r0-harness.ts:39:12)
    process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    async Test.run (node:internal/test_runner/test:1054:7)
    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
  ...
# Subtest: R0 parallel-missions: concurrent independent missions do not overwrite each other
ok 6 - R0 parallel-missions: concurrent independent missions do not overwrite each other
  ---
  duration_ms: 3816.30537
  type: 'test'
  ...
# Subtest: R0 empty-tools: empty specialist tool request grants no ambient shell or allTools
not ok 7 - R0 empty-tools: empty specialist tool request grants no ambient shell or allTools
  ---
  duration_ms: 8217.579458
  type: 'test'
  location: '/home/nox/awe-group-cleanroom-20261112/.r0-work/qa/src/tests/r0-independent-contracts.test.ts:1:2322'
  failureType: 'testCodeFailure'
  error: |-
    empty-tools: child code=1, signal=null
    
    node:internal/modules/run_main:123
        triggerUncaughtException(
        ^
    
    AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
    + actual - expected
    
    + [
    +   'browser_click',
    +   'browser_get_text',
    +   'browser_navigate',
    +   'browser_screenshot',
    +   'browser_type',
    +   'file_list',
    +   'file_read',
    +   'file_write',
    +   'manus_search',
    +   'save_artifact',
    +   'shell',
    +   'ti_search',
    +   'web_extract',
    +   'web_fetch',
    +   'web_search'
    + ]
    - []
    
        at <anonymous> (/home/nox/awe-group-cleanroom-20261112/.r0-work/qa/src/tests/helpers/r0-worker.ts:142:30) {
      generatedMessage: true,
      code: 'ERR_ASSERTION',
      actual: [
        'browser_click',    'browser_get_text',
        'browser_navigate', 'browser_screenshot',
        'browser_type',     'file_list',
        'file_read',        'file_write',
        'manus_search',     'save_artifact',
        'shell',            'ti_search',
        'web_extract',      'web_fetch',
        'web_search'
      ],
      expected: [],
      operator: 'deepStrictEqual',
      diff: 'simple'
    }
    
    Node.js v22.23.3
    
    
    1 !== 0
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 0
  actual: 1
  operator: 'strictEqual'
  stack: |-
    <anonymous> (/home/nox/awe-group-cleanroom-20261112/.r0-work/qa/src/tests/helpers/r0-worker.ts:142:30) {
    scenario (/home/nox/awe-group-cleanroom-20261112/.r0-work/qa/src/tests/helpers/r0-harness.ts:39:12)
    process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    async Test.run (node:internal/test_runner/test:1054:7)
    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
  ...
# Subtest: R0 unknown-tools: unknown specialist tool request grants no ambient shell or allTools
not ok 8 - R0 unknown-tools: unknown specialist tool request grants no ambient shell or allTools
  ---
  duration_ms: 9055.749518
  type: 'test'
  location: '/home/nox/awe-group-cleanroom-20261112/.r0-work/qa/src/tests/r0-independent-contracts.test.ts:1:2322'
  failureType: 'testCodeFailure'
  error: |-
    unknown-tools: child code=1, signal=null
    
    node:internal/modules/run_main:123
        triggerUncaughtException(
        ^
    
    AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
    + actual - expected
    
    + [
    +   'browser_click',
    +   'browser_get_text',
    +   'browser_navigate',
    +   'browser_screenshot',
    +   'browser_type',
    +   'file_list',
    +   'file_read',
    +   'file_write',
    +   'manus_search',
    +   'save_artifact',
    +   'shell',
    +   'ti_search',
    +   'web_extract',
    +   'web_fetch',
    +   'web_search'
    + ]
    - []
    
        at <anonymous> (/home/nox/awe-group-cleanroom-20261112/.r0-work/qa/src/tests/helpers/r0-worker.ts:143:32) {
      generatedMessage: true,
      code: 'ERR_ASSERTION',
      actual: [
        'browser_click',    'browser_get_text',
        'browser_navigate', 'browser_screenshot',
        'browser_type',     'file_list',
        'file_read',        'file_write',
        'manus_search',     'save_artifact',
        'shell',            'ti_search',
        'web_extract',      'web_fetch',
        'web_search'
      ],
      expected: [],
      operator: 'deepStrictEqual',
      diff: 'simple'
    }
    
    Node.js v22.23.3
    
    
    1 !== 0
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 0
  actual: 1
  operator: 'strictEqual'
  stack: |-
    <anonymous> (/home/nox/awe-group-cleanroom-20261112/.r0-work/qa/src/tests/helpers/r0-worker.ts:143:32) {
    scenario (/home/nox/awe-group-cleanroom-20261112/.r0-work/qa/src/tests/helpers/r0-harness.ts:39:12)
    process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    async Test.run (node:internal/test_runner/test:1054:7)
    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
  ...
# Subtest: R0 mixed-tools: mixed known/unknown request grants only the requested known tool
ok 9 - R0 mixed-tools: mixed known/unknown request grants only the requested known tool
  ---
  duration_ms: 8966.902463
  type: 'test'
  ...
# Subtest: R0 allowed-tools: allowedTools intersects requested tools and denies requested shell
not ok 10 - R0 allowed-tools: allowedTools intersects requested tools and denies requested shell
  ---
  duration_ms: 9010.694231
  type: 'test'
  location: '/home/nox/awe-group-cleanroom-20261112/.r0-work/qa/src/tests/r0-independent-contracts.test.ts:1:2322'
  failureType: 'testCodeFailure'
  error: |-
    allowed-tools: child code=1, signal=null
    
    node:internal/modules/run_main:123
        triggerUncaughtException(
        ^
    
    AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
    + actual - expected
    
      [
        'file_read',
    +   'shell'
      ]
    
        at <anonymous> (/home/nox/awe-group-cleanroom-20261112/.r0-work/qa/src/tests/helpers/r0-worker.ts:145:32) {
      generatedMessage: true,
      code: 'ERR_ASSERTION',
      actual: [ 'file_read', 'shell' ],
      expected: [ 'file_read' ],
      operator: 'deepStrictEqual',
      diff: 'simple'
    }
    
    Node.js v22.23.3
    
    
    1 !== 0
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 0
  actual: 1
  operator: 'strictEqual'
  stack: |-
    <anonymous> (/home/nox/awe-group-cleanroom-20261112/.r0-work/qa/src/tests/helpers/r0-worker.ts:145:32) {
    scenario (/home/nox/awe-group-cleanroom-20261112/.r0-work/qa/src/tests/helpers/r0-harness.ts:39:12)
    process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    async Test.run (node:internal/test_runner/test:1054:7)
    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
  ...
# Subtest: R0 empty-allowlist: explicit empty allowedTools denies every requested tool
not ok 11 - R0 empty-allowlist: explicit empty allowedTools denies every requested tool
  ---
  duration_ms: 8390.807918
  type: 'test'
  location: '/home/nox/awe-group-cleanroom-20261112/.r0-work/qa/src/tests/r0-independent-contracts.test.ts:1:2322'
  failureType: 'testCodeFailure'
  error: |-
    empty-allowlist: child code=1, signal=null
    
    node:internal/modules/run_main:123
        triggerUncaughtException(
        ^
    
    AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
    + actual - expected
    
    + [
    +   'file_read',
    +   'shell'
    + ]
    - []
    
        at <anonymous> (/home/nox/awe-group-cleanroom-20261112/.r0-work/qa/src/tests/helpers/r0-worker.ts:146:34) {
      generatedMessage: true,
      code: 'ERR_ASSERTION',
      actual: [ 'file_read', 'shell' ],
      expected: [],
      operator: 'deepStrictEqual',
      diff: 'simple'
    }
    
    Node.js v22.23.3
    
    
    1 !== 0
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 0
  actual: 1
  operator: 'strictEqual'
  stack: |-
    <anonymous> (/home/nox/awe-group-cleanroom-20261112/.r0-work/qa/src/tests/helpers/r0-worker.ts:146:34) {
    scenario (/home/nox/awe-group-cleanroom-20261112/.r0-work/qa/src/tests/helpers/r0-harness.ts:39:12)
    process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    async Test.run (node:internal/test_runner/test:1054:7)
    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
  ...
# Subtest: R0 shell-success: shell returns actual stdout, stderr and exit code
ok 12 - R0 shell-success: shell returns actual stdout, stderr and exit code
  ---
  duration_ms: 3822.132079
  type: 'test'
  ...
# Subtest: R0 shell-failure: shell nonzero exit is not success
ok 13 - R0 shell-failure: shell nonzero exit is not success
  ---
  duration_ms: 3248.68478
  type: 'test'
  ...
# Subtest: R0 shell-cwd: shell denies outside cwd before any side effect
not ok 14 - R0 shell-cwd: shell denies outside cwd before any side effect
  ---
  duration_ms: 3807.754729
  type: 'test'
  location: '/home/nox/awe-group-cleanroom-20261112/.r0-work/qa/src/tests/r0-independent-contracts.test.ts:1:2322'
  failureType: 'testCodeFailure'
  error: |-
    shell-cwd: child code=1, signal=null
    
    node:internal/modules/run_main:123
        triggerUncaughtException(
        ^
    
    AssertionError [ERR_ASSERTION]: Operation must reject or return explicit success:false
        at denied (/home/nox/awe-group-cleanroom-20261112/.r0-work/qa/src/tests/helpers/r0-worker.ts:59:12)
        at async <anonymous> (/home/nox/awe-group-cleanroom-20261112/.r0-work/qa/src/tests/helpers/r0-worker.ts:168:5) {
      generatedMessage: false,
      code: 'ERR_ASSERTION',
      actual: false,
      expected: true,
      operator: '==',
      diff: 'simple'
    }
    
    Node.js v22.23.3
    
    
    1 !== 0
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 0
  actual: 1
  operator: 'strictEqual'
  stack: |-
    denied (/home/nox/awe-group-cleanroom-20261112/.r0-work/qa/src/tests/helpers/r0-worker.ts:59:12)
    async <anonymous> (/home/nox/awe-group-cleanroom-20261112/.r0-work/qa/src/tests/helpers/r0-worker.ts:168:5) {
    scenario (/home/nox/awe-group-cleanroom-20261112/.r0-work/qa/src/tests/helpers/r0-harness.ts:39:12)
    process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    async Test.run (node:internal/test_runner/test:1054:7)
    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
  ...
# Subtest: R0 shell-abort: AbortSignal stops running shell process tree before late marker
not ok 15 - R0 shell-abort: AbortSignal stops running shell process tree before late marker
  ---
  duration_ms: 6352.595541
  type: 'test'
  location: '/home/nox/awe-group-cleanroom-20261112/.r0-work/qa/src/tests/r0-independent-contracts.test.ts:1:2322'
  failureType: 'testCodeFailure'
  error: |-
    shell-abort: child code=1, signal=null
    
    node:internal/modules/run_main:123
        triggerUncaughtException(
        ^
    
    AssertionError [ERR_ASSERTION]: Aborted shell/descendant continued and created late marker
    
    true !== false
    
        at <anonymous> (/home/nox/awe-group-cleanroom-20261112/.r0-work/qa/src/tests/helpers/r0-worker.ts:187:12) {
      generatedMessage: false,
      code: 'ERR_ASSERTION',
      actual: true,
      expected: false,
      operator: 'strictEqual',
      diff: 'simple'
    }
    
    Node.js v22.23.3
    
    
    1 !== 0
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 0
  actual: 1
  operator: 'strictEqual'
  stack: |-
    <anonymous> (/home/nox/awe-group-cleanroom-20261112/.r0-work/qa/src/tests/helpers/r0-worker.ts:187:12) {
    scenario (/home/nox/awe-group-cleanroom-20261112/.r0-work/qa/src/tests/helpers/r0-harness.ts:39:12)
    process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    async Test.run (node:internal/test_runner/test:1054:7)
    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
  ...
# Subtest: R0 shell-preabort: pre-aborted shell performs no side effect
not ok 16 - R0 shell-preabort: pre-aborted shell performs no side effect
  ---
  duration_ms: 3905.489608
  type: 'test'
  location: '/home/nox/awe-group-cleanroom-20261112/.r0-work/qa/src/tests/r0-independent-contracts.test.ts:1:2322'
  failureType: 'testCodeFailure'
  error: |-
    shell-preabort: child code=1, signal=null
    
    node:internal/modules/run_main:123
        triggerUncaughtException(
        ^
    
    AssertionError [ERR_ASSERTION]: Operation must reject or return explicit success:false
        at denied (/home/nox/awe-group-cleanroom-20261112/.r0-work/qa/src/tests/helpers/r0-worker.ts:59:12)
        at async <anonymous> (/home/nox/awe-group-cleanroom-20261112/.r0-work/qa/src/tests/helpers/r0-worker.ts:194:5) {
      generatedMessage: false,
      code: 'ERR_ASSERTION',
      actual: false,
      expected: true,
      operator: '==',
      diff: 'simple'
    }
    
    Node.js v22.23.3
    
    
    1 !== 0
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 0
  actual: 1
  operator: 'strictEqual'
  stack: |-
    denied (/home/nox/awe-group-cleanroom-20261112/.r0-work/qa/src/tests/helpers/r0-worker.ts:59:12)
    async <anonymous> (/home/nox/awe-group-cleanroom-20261112/.r0-work/qa/src/tests/helpers/r0-worker.ts:194:5) {
    scenario (/home/nox/awe-group-cleanroom-20261112/.r0-work/qa/src/tests/helpers/r0-harness.ts:39:12)
    process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    async Test.run (node:internal/test_runner/test:1054:7)
    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
  ...
# Subtest: R0 recursion-depth: recursion depth refusal creates zero children and explicit issue
ok 17 - R0 recursion-depth: recursion depth refusal creates zero children and explicit issue
  ---
  duration_ms: 1285.249166
  type: 'test'
  ...
# Subtest: R0 recursion-budget: recursion exhausted budget creates zero children and explicit issue
ok 18 - R0 recursion-budget: recursion exhausted budget creates zero children and explicit issue
  ---
  duration_ms: 1416.587169
  type: 'test'
  ...
# Subtest: R0 recursion-isolation: independent mission delegation sessions remain isolated
ok 19 - R0 recursion-isolation: independent mission delegation sessions remain isolated
  ---
  duration_ms: 1440.592333
  type: 'test'
  ...
# Subtest: R0 timeout-success: timeout wrapper propagates the exact successful result
ok 20 - R0 timeout-success: timeout wrapper propagates the exact successful result
  ---
  duration_ms: 1512.316324
  type: 'test'
  ...
# Subtest: R0 timeout-failure: timeout wrapper preserves underlying failure without timeout callback
ok 21 - R0 timeout-failure: timeout wrapper preserves underlying failure without timeout callback
  ---
  duration_ms: 1291.146857
  type: 'test'
  ...
# Subtest: R0 timeout-expiry: timeout has explicit error identity and invokes checkpoint callback once
ok 22 - R0 timeout-expiry: timeout has explicit error identity and invokes checkpoint callback once
  ---
  duration_ms: 1590.294306
  type: 'test'
  ...
# Subtest: R0 reconcile-exclusion: orphan reconciliation preserves explicitly active missions
ok 23 - R0 reconcile-exclusion: orphan reconciliation preserves explicitly active missions
  ---
  duration_ms: 1443.194028
  type: 'test'
  ...
# Subtest: R0 crash-recovery: SIGKILL preserves durable success checkpoint and artifact through orphan recovery
ok 24 - R0 crash-recovery: SIGKILL preserves durable success checkpoint and artifact through orphan recovery
  ---
  duration_ms: 3330.952187
  type: 'test'
  ...
# Subtest: R0 qa-empty-criterion: blank QA criterion cannot certify a real acceptance criterion
not ok 25 - R0 qa-empty-criterion: blank QA criterion cannot certify a real acceptance criterion
  ---
  duration_ms: 1521.130021
  type: 'test'
  location: '/home/nox/awe-group-cleanroom-20261112/.r0-work/qa/src/tests/r0-independent-contracts.test.ts:1:2322'
  failureType: 'testCodeFailure'
  error: |-
    qa-empty-criterion: child code=1, signal=null
    
    node:internal/modules/run_main:123
        triggerUncaughtException(
        ^
    
    AssertionError [ERR_ASSERTION]: Blank review criterion must not match any real requirement
    + actual - expected
    
    + {
    +   criterion: '',
    +   notes: 'Trust me',
    +   passed: true
    + }
    - null
    
        at <anonymous> (/home/nox/awe-group-cleanroom-20261112/.r0-work/qa/src/tests/helpers/r0-worker.ts:304:12) {
      generatedMessage: false,
      code: 'ERR_ASSERTION',
      actual: { criterion: '', passed: true, notes: 'Trust me' },
      expected: null,
      operator: 'strictEqual',
      diff: 'simple'
    }
    
    Node.js v22.23.3
    
    
    1 !== 0
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 0
  actual: 1
  operator: 'strictEqual'
  stack: |-
    <anonymous> (/home/nox/awe-group-cleanroom-20261112/.r0-work/qa/src/tests/helpers/r0-worker.ts:304:12) {
    scenario (/home/nox/awe-group-cleanroom-20261112/.r0-work/qa/src/tests/helpers/r0-harness.ts:39:12)
    process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    async Test.run (node:internal/test_runner/test:1054:7)
    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
  ...
# Subtest: R0 qa-unique-criteria: one QA result cannot certify multiple mission criteria
ok 26 - R0 qa-unique-criteria: one QA result cannot certify multiple mission criteria
  ---
  duration_ms: 1467.7207
  type: 'test'
  ...
# Subtest: R0 BLOCKED provider: offline provider outcome evaluator / generate injection
not ok 27 - R0 BLOCKED provider: offline provider outcome evaluator / generate injection
  ---
  duration_ms: 0.419599
  type: 'test'
  location: '/home/nox/awe-group-cleanroom-20261112/.r0-work/qa/src/tests/r0-independent-contracts.test.ts:1:2832'
  failureType: 'testCodeFailure'
  error: "FAIL: pending integration seam 'provider'; see QA-R0-INDEPENDENT-HANDOFF.md acceptance matrix. No live model fallback permitted."
  code: 'ERR_TEST_FAILURE'
  stack: |-
    TestContext.<anonymous> (/home/nox/awe-group-cleanroom-20261112/.r0-work/qa/src/tests/r0-independent-contracts.test.ts:53:11)
    Test.runInAsyncScope (node:async_hooks:214:14)
    Test.run (node:internal/test_runner/test:1047:25)
    Test.processPendingSubtests (node:internal/test_runner/test:744:18)
    Test.postRun (node:internal/test_runner/test:1173:19)
    Test.run (node:internal/test_runner/test:1101:12)
    process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
  ...
# Subtest: R0 BLOCKED children: offline child executor injection / pure children plan resolver
not ok 28 - R0 BLOCKED children: offline child executor injection / pure children plan resolver
  ---
  duration_ms: 0.3784
  type: 'test'
  location: '/home/nox/awe-group-cleanroom-20261112/.r0-work/qa/src/tests/r0-independent-contracts.test.ts:1:2832'
  failureType: 'testCodeFailure'
  error: "FAIL: pending integration seam 'children'; see QA-R0-INDEPENDENT-HANDOFF.md acceptance matrix. No live model fallback permitted."
  code: 'ERR_TEST_FAILURE'
  stack: |-
    TestContext.<anonymous> (/home/nox/awe-group-cleanroom-20261112/.r0-work/qa/src/tests/r0-independent-contracts.test.ts:53:11)
    Test.runInAsyncScope (node:async_hooks:214:14)
    Test.run (node:internal/test_runner/test:1047:25)
    Test.processPendingSubtests (node:internal/test_runner/test:744:18)
    Test.postRun (node:internal/test_runner/test:1173:19)
    Test.run (node:internal/test_runner/test:1101:12)
    process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
  ...
# Subtest: R0 BLOCKED lease: cross-process acquire/release lease and live-owner reconciliation API
not ok 29 - R0 BLOCKED lease: cross-process acquire/release lease and live-owner reconciliation API
  ---
  duration_ms: 0.200299
  type: 'test'
  location: '/home/nox/awe-group-cleanroom-20261112/.r0-work/qa/src/tests/r0-independent-contracts.test.ts:1:2832'
  failureType: 'testCodeFailure'
  error: "FAIL: pending integration seam 'lease'; see QA-R0-INDEPENDENT-HANDOFF.md acceptance matrix. No live model fallback permitted."
  code: 'ERR_TEST_FAILURE'
  stack: |-
    TestContext.<anonymous> (/home/nox/awe-group-cleanroom-20261112/.r0-work/qa/src/tests/r0-independent-contracts.test.ts:53:11)
    Test.runInAsyncScope (node:async_hooks:214:14)
    Test.run (node:internal/test_runner/test:1047:25)
    Test.processPendingSubtests (node:internal/test_runner/test:744:18)
    Test.postRun (node:internal/test_runner/test:1173:19)
    Test.run (node:internal/test_runner/test:1101:12)
    process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
  ...
# Subtest: R0 BLOCKED manager: manager plan/execute/QA injection for cancellation and no-repeat recovery
not ok 30 - R0 BLOCKED manager: manager plan/execute/QA injection for cancellation and no-repeat recovery
  ---
  duration_ms: 0.142
  type: 'test'
  location: '/home/nox/awe-group-cleanroom-20261112/.r0-work/qa/src/tests/r0-independent-contracts.test.ts:1:2832'
  failureType: 'testCodeFailure'
  error: "FAIL: pending integration seam 'manager'; see QA-R0-INDEPENDENT-HANDOFF.md acceptance matrix. No live model fallback permitted."
  code: 'ERR_TEST_FAILURE'
  stack: |-
    TestContext.<anonymous> (/home/nox/awe-group-cleanroom-20261112/.r0-work/qa/src/tests/r0-independent-contracts.test.ts:53:11)
    Test.runInAsyncScope (node:async_hooks:214:14)
    Test.run (node:internal/test_runner/test:1047:25)
    Test.processPendingSubtests (node:internal/test_runner/test:744:18)
    Test.postRun (node:internal/test_runner/test:1173:19)
    Test.run (node:internal/test_runner/test:1101:12)
    process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
  ...
# Subtest: R0 BLOCKED resume: side-effect-free resume policy import (manager imports source-root memory.db)
not ok 31 - R0 BLOCKED resume: side-effect-free resume policy import (manager imports source-root memory.db)
  ---
  duration_ms: 0.1363
  type: 'test'
  location: '/home/nox/awe-group-cleanroom-20261112/.r0-work/qa/src/tests/r0-independent-contracts.test.ts:1:2832'
  failureType: 'testCodeFailure'
  error: "FAIL: pending integration seam 'resume'; see QA-R0-INDEPENDENT-HANDOFF.md acceptance matrix. No live model fallback permitted."
  code: 'ERR_TEST_FAILURE'
  stack: |-
    TestContext.<anonymous> (/home/nox/awe-group-cleanroom-20261112/.r0-work/qa/src/tests/r0-independent-contracts.test.ts:53:11)
    Test.runInAsyncScope (node:async_hooks:214:14)
    Test.run (node:internal/test_runner/test:1047:25)
    Test.processPendingSubtests (node:internal/test_runner/test:744:18)
    Test.postRun (node:internal/test_runner/test:1173:19)
    Test.run (node:internal/test_runner/test:1101:12)
    process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
  ...
1..31
# tests 31
# suites 0
# pass 14
# fail 17
# cancelled 0
# skipped 0
# todo 0
# duration_ms 95246.533565
