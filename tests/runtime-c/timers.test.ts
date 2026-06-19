import test from 'node:test'
import {
  assert,
  compileRuntimeProgram,
  compileSource,
  join,
  mkdtemp,
  rm,
  runCommand,
  tmpdir,
  writeFile
} from '../helpers/runtime-c.ts'

test('C runtime loop polls immediates and timers by turn', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'inox-c-loop-runtime-'))
  const source = join(dir, 'loop-runtime.c')
  const output = join(dir, 'loop-runtime')

  try {
    await writeFile(
      source,
      `#include <stdio.h>
#include <stdlib.h>
#include "inox/allocator.h"
#include "inox/loop.h"

static void* test_alloc(void* user, size_t size, size_t align) {
  (void)user;
  (void)align;
  return calloc(1, size);
}

static void* test_realloc(void* user, void* ptr, size_t old_size, size_t new_size, size_t align) {
  (void)user;
  (void)old_size;
  (void)align;
  return realloc(ptr, new_size);
}

static void test_free(void* user, void* ptr, size_t size, size_t align) {
  (void)user;
  (void)size;
  (void)align;
  free(ptr);
}

typedef struct test_log {
  inox_loop* loop;
  int count;
  int finalized;
  int values[8];
} test_log;

static void push_value(test_log* log, int value) {
  log->values[log->count] = value;
  log->count += 1;
}

static inox_status record_microtask(void* context) {
  push_value((test_log*)context, 9);
  return INOX_OK;
}

static inox_status record_immediate(void* context) {
  test_log* log = (test_log*)context;
  push_value(log, 1);
  return inox_loop_queue_microtask(log->loop, record_microtask, context, 0);
}

static inox_status record_timeout(void* context) {
  push_value((test_log*)context, 2);
  return INOX_OK;
}

static inox_status record_interval(void* context) {
  push_value((test_log*)context, 3);
  return INOX_OK;
}

static void finalize_callback(void* context) {
  ((test_log*)context)->finalized += 1;
}

int main(void) {
  inox_allocator allocator = { 0, test_alloc, test_realloc, test_free };
  inox_loop loop;
  inox_timer_handle* timeout = 0;
  inox_timer_handle* interval = 0;
  test_log log = { 0, 0, 0, { 0, 0, 0, 0, 0, 0, 0, 0 } };

  if (inox_loop_init(&loop, &allocator) != INOX_OK) return 1;
  log.loop = &loop;
  if (inox_loop_queue_immediate(&loop, record_immediate, &log, finalize_callback, 0) != INOX_OK) return 2;
  if (inox_loop_set_timeout(&loop, 5, record_timeout, &log, finalize_callback, &timeout) != INOX_OK) return 3;
  if (inox_loop_set_interval(&loop, 2, record_interval, &log, finalize_callback, &interval) != INOX_OK) return 4;
  inox_loop_clear_timer(timeout);
  inox_loop_clear_timer(timeout);
  if (inox_loop_pending_immediates(&loop) != 1) return 5;
  if (inox_loop_pending_timers(&loop) != 1) return 6;
  if (inox_loop_poll(&loop, 0) != INOX_OK) return 7;
  if (log.count != 2 || log.values[0] != 1 || log.values[1] != 9) return 8;
  if (inox_loop_poll(&loop, 1) != INOX_OK) return 9;
  if (log.count != 2) return 10;
  if (inox_loop_poll(&loop, 2) != INOX_OK) return 11;
  if (log.count != 3 || log.values[2] != 3) return 12;
  if (inox_loop_poll(&loop, 4) != INOX_OK) return 13;
  if (log.count != 4 || log.values[3] != 3) return 14;
  inox_loop_clear_timer(interval);
  inox_loop_clear_timer(interval);
  if (inox_loop_poll(&loop, 6) != INOX_OK) return 15;
  if (log.count != 4) return 16;
  if (inox_loop_has_work(&loop)) return 17;
  if (log.finalized != 3) return 18;

  inox_loop_dispose(&loop);
  printf("%d %d %d %d %d %d\\n", log.count, log.values[0], log.values[1], log.values[2], log.values[3], log.finalized);
  return 0;
}
`
    )

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, '4 1 9 3 3 3\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('C runtime time adapter keeps Date.now on monotonic delta', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'inox-c-time-runtime-'))
  const source = join(dir, 'time-runtime.c')
  const output = join(dir, 'time-runtime')

  try {
    await writeFile(
      source,
      `#include <stdio.h>
#include "inox/time.h"

typedef struct clock_state {
  double mono;
  double wall;
  int wall_reads;
} clock_state;

static inox_number monotonic_now(void* user) {
  clock_state* state = (clock_state*)user;
  return state->mono;
}

static inox_number wall_now(void* user) {
  clock_state* state = (clock_state*)user;
  state->wall_reads += 1;
  return state->wall;
}

int main(void) {
  clock_state state = { 100, 1000, 0 };
  inox_time_adapter adapter = { &state, monotonic_now, wall_now };

  inox_time_set_adapter(adapter);

  double p0 = inox_performance_now();
  state.mono = 125;
  double date1 = inox_date_now();
  state.wall = 5000;
  state.mono = 150;
  double date2 = inox_date_now();
  inox_time_resync_wall_clock();
  state.mono = 175;
  double date3 = inox_date_now();

  printf("%.0f %.0f %.0f %.0f %d\\n", p0, date1, date2, date3, state.wall_reads);
  return 0;
}
`
    )

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, '0 1025 1050 5025 2\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C timer calls drain from main loop', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'inox-c-timers-codegen-'))
  const source = join(dir, 'timers-codegen.c')
  const output = join(dir, 'timers-codegen')

  try {
    const result = compileSource(
      `function onImmediate(): void {
  console.log('immediate')
}

function onTimeout(): void {
  console.log('timeout')
}

function onInterval(): void {
  console.log('interval')
}

function schedule(): void {
  const timeout = setTimeout(onTimeout, 1)
  clearTimeout(timeout)
}

schedule()
const cancelledImmediate = setImmediate(onTimeout)
clearImmediate(cancelledImmediate)
const interval = setInterval(onInterval, 10)
setTimeout(() => {
  clearInterval(interval)
  console.log('cleared')
}, 20)
setImmediate(() => {
  setTimeout(onTimeout, 10)
})

`,
      {
        target: 'c'
      }
    )

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, 'interval\ntimeout\ninterval\ncleared\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C node:timers imports drain from main loop', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'inox-c-node-timers-codegen-'))
  const source = join(dir, 'node-timers-codegen.c')
  const output = join(dir, 'node-timers-codegen')

  try {
    const result = compileSource(
      `import timers, { clearTimeout, setTimeout as later } from 'node:timers'

function onTimeout(): void {
  console.log('timeout')
}

function onInterval(): void {
  console.log('interval')
}

const cancelled = later(onTimeout, 1)
clearTimeout(cancelled)
const interval = timers.setInterval(onInterval, 10)
timers.setTimeout(() => {
  timers.clearInterval(interval)
  console.log('cleared')
}, 20)
`,
      {
        target: 'c'
      }
    )

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, 'interval\ninterval\ncleared\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C time globals compile and run with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'inox-c-time-globals-'))
  const source = join(dir, 'time-globals.c')
  const output = join(dir, 'time-globals')

  try {
    const result = compileSource(
      `const started = Date.now()
const elapsed = performance.now()
console.log(started >= 0, elapsed >= 0)

`,
      {
        target: 'c'
      }
    )

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, '1 1\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})
