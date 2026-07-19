import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import {
  createTestTempDir,
  join,
  rm,
  runCommand,
  writeFile
} from '../helpers/runtime-c.ts'

export async function assertPromiseObserveFailureRetainsCallbackContext(): Promise<void> {
  const workspace = await createTestTempDir('promise-observe-ownership-')
  const source = join(workspace, 'main.c')
  const output = join(workspace, 'main')

  try {
    await writeFile(source, programSource)
    const compile = await runCommand('cc', [
      '-std=c11',
      '-Iruntime/include',
      source,
      'runtime/src/async/promise.c',
      '-o',
      output
    ])

    assert.equal(
      compile.code,
      0,
      `promise observe ownership compile failed\nstdout:\n${compile.stdout}\nstderr:\n${compile.stderr}`
    )

    const run = await runCommand(output, [])

    assert.equal(
      run.code,
      0,
      `promise observe ownership run failed\nstdout:\n${run.stdout}\nstderr:\n${run.stderr}`
    )
  } finally {
    await rm(workspace, { recursive: true, force: true })
  }
}

const programSource = `
#include <stddef.h>
#include <stdint.h>
#include <stdlib.h>

#include "inox/promise_runtime.h"

typedef struct AllocationState {
  size_t calls;
  size_t fail_call;
  size_t live;
  int queue_error;
} AllocationState;

static void* test_alloc(void* user, size_t size, size_t align) {
  AllocationState* state = (AllocationState*)user;
  size_t call = state->calls;
  state->calls += 1;

  if (call == state->fail_call) {
    return 0;
  }

  (void)align;
  void* result = calloc(1, size);

  if (result != 0) {
    state->live += 1;
  }

  return result;
}

static void* test_realloc(void* user, void* ptr, size_t old_size, size_t new_size, size_t align) {
  (void)user;
  (void)old_size;
  (void)align;
  return realloc(ptr, new_size);
}

static void test_free(void* user, void* ptr, size_t size, size_t align) {
  AllocationState* state = (AllocationState*)user;

  if (ptr != 0) {
    state->live -= 1;
  }

  (void)size;
  (void)align;
  free(ptr);
}

void inox_retain(inox_value value) {
  (void)value;
}

void inox_release(inox_value value) {
  (void)value;
}

inox_status inox_loop_queue_microtask(
  inox_loop* loop,
  inox_microtask_fn run,
  void* context,
  inox_microtask_finalizer_fn finalizer
) {
  (void)run;
  (void)context;
  (void)finalizer;
  AllocationState* state = (AllocationState*)loop->backend;
  return state->queue_error ? INOX_ERR_OOM : INOX_OK;
}

int inox_loop_has_work(const inox_loop* loop) {
  (void)loop;
  return 0;
}

inox_status inox_loop_run_once(inox_loop* loop) {
  (void)loop;
  return INOX_OK;
}

static inox_status reaction(void* context, inox_value value) {
  (void)context;
  (void)value;
  return INOX_OK;
}

static void finalize(void* context) {
  int* count = (int*)context;
  *count += 1;
}

static int run_case(size_t fail_offset) {
  AllocationState state = {0, SIZE_MAX, 0, 0};
  inox_allocator allocator = {&state, test_alloc, test_realloc, test_free};

  {
    inox_loop loop = {0};
    loop.allocator = &allocator;
    loop.backend = &state;

    inox_promise* promise = 0;

    if (inox_promise_resolved(&loop, inox_number_value(1), &promise) != INOX_OK) {
      return 11;
    }

    if (fail_offset < 2) {
      state.fail_call = state.calls + fail_offset;
    } else {
      state.queue_error = 1;
    }

    int finalizer_count = 0;
    inox_status status = inox_promise_then(promise, reaction, reaction, &finalizer_count, finalize);

    if (status != INOX_ERR_OOM) {
      return 20 + (int)fail_offset;
    }

    if (finalizer_count != 0) {
      return 30 + (int)fail_offset;
    }

    finalize(&finalizer_count);

    if (finalizer_count != 1) {
      return 40 + (int)fail_offset;
    }

    inox_promise_release(promise);
  }

  return state.live == 0 ? 0 : 50 + (int)fail_offset;
}

int main() {
  for (size_t offset = 0; offset < 3; offset += 1) {
    int status = run_case(offset);

    if (status != 0) {
      return status;
    }
  }

  return 0;
}
`

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await assertPromiseObserveFailureRetainsCallbackContext()
}
