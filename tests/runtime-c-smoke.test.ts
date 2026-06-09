import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { compileSource } from '../src/compiler/index.ts'

type CommandResult = {
  code: number
  stdout: string
  stderr: string
}

test('C runtime value/object/array skeleton compiles and runs', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-runtime-'))
  const source = join(dir, 'runtime-smoke.c')
  const output = join(dir, 'runtime-smoke')

  try {
    await writeFile(source, `#include <stdio.h>
#include <stdlib.h>
#include "ccjs/allocator.h"
#include "ccjs/array.h"
#include "ccjs/object.h"
#include "ccjs/string.h"

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

int main(void) {
  ccjs_allocator allocator = { 0, test_alloc, test_realloc, test_free };
  ccjs_field_info fields[] = {
    { "name", 0 },
    { "score", 0 }
  };
  ccjs_shape shape = { 2, fields };
  ccjs_value user;
  ccjs_value name;
  ccjs_value score;
  ccjs_value array;
  ccjs_value first;

  if (ccjs_object_new(&allocator, &shape, &user) != CCJS_OK) return 1;
  if (ccjs_string_from_literal(&allocator, "Ada", 3, &name) != CCJS_OK) return 2;
  if (ccjs_object_set_known(user, 0, name) != CCJS_OK) return 3;
  if (ccjs_object_set(user, "score", 5, ccjs_number_value(42)) != CCJS_OK) return 4;
  if (ccjs_object_get(user, "score", 5, &score) != CCJS_OK) return 5;
  if (ccjs_array_new(&allocator, 1, &array) != CCJS_OK) return 6;
  if (ccjs_array_set(array, 0, ccjs_number_value(7)) != CCJS_OK) return 7;
  if (ccjs_array_get(array, 0, &first) != CCJS_OK) return 8;

  ccjs_string* string = (ccjs_string*)name.as.ref;
  printf("%.*s %.0f %.0f\\n", (int)string->len, string->bytes, score.as.number, first.as.number);
  return 0;
}
`)

    const compile = await runCommand('cc', [
      '-Iruntime/c/include',
      source,
      'runtime/c/src/core/value.c',
      'runtime/c/src/core/allocator.c',
      'runtime/c/src/core/callback.c',
      'runtime/c/src/strings/string.c',
      'runtime/c/src/objects/object.c',
      'runtime/c/src/arrays/array.c',
      'runtime/c/src/collections/map.c',
      'runtime/c/src/collections/set.c',
      'runtime/c/src/time/time.c',
      '-o',
      output
    ])

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, 'Ada 42 7\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('C runtime Map and Set helpers compile and run', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-collections-runtime-'))
  const source = join(dir, 'collections-runtime.c')
  const output = join(dir, 'collections-runtime')

  try {
    await writeFile(source, `#include <stdio.h>
#include <stdlib.h>
#include "ccjs/allocator.h"
#include "ccjs/map.h"
#include "ccjs/set.h"
#include "ccjs/string.h"

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

int main(void) {
  ccjs_allocator allocator = { 0, test_alloc, test_realloc, test_free };
  ccjs_value map = ccjs_undefined_value();
  ccjs_value set = ccjs_undefined_value();
  ccjs_value key = ccjs_undefined_value();
  ccjs_value value = ccjs_undefined_value();
  ccjs_value found = ccjs_undefined_value();
  bool has = false;
  bool removed = false;
  size_t size = 0;

  if (ccjs_map_new(&allocator, &map) != CCJS_OK) return 1;
  if (ccjs_set_new(&allocator, &set) != CCJS_OK) return 1;
  if (ccjs_string_from_literal(&allocator, "Ada", 3, &key) != CCJS_OK) return 1;

  value = ccjs_number_value(7);
  if (ccjs_map_set(map, key, value) != CCJS_OK) return 1;
  if (ccjs_map_get(map, key, &found) != CCJS_OK) return 1;
  if (ccjs_map_has(map, key, &has) != CCJS_OK) return 1;
  if (ccjs_map_delete(map, key, &removed) != CCJS_OK) return 1;
  if (ccjs_map_size(map, &size) != CCJS_OK) return 1;
  printf("%.0f %d %d %zu\\n", found.as.number, has ? 1 : 0, removed ? 1 : 0, size);
  ccjs_release(found);

  if (ccjs_set_add(set, key) != CCJS_OK) return 1;
  if (ccjs_set_has(set, key, &has) != CCJS_OK) return 1;
  if (ccjs_set_delete(set, key, &removed) != CCJS_OK) return 1;
  if (ccjs_set_size(set, &size) != CCJS_OK) return 1;
  printf("%d %d %zu\\n", has ? 1 : 0, removed ? 1 : 0, size);

  ccjs_release(key);
  ccjs_release(set);
  ccjs_release(map);

  return 0;
}
`)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, '7 1 1 0\n1 1 0\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('C runtime release frees nested object and array references', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-release-'))
  const source = join(dir, 'release-smoke.c')
  const output = join(dir, 'release-smoke')

  try {
    await writeFile(source, `#include <stdio.h>
#include <stdlib.h>
#include "ccjs/allocator.h"
#include "ccjs/array.h"
#include "ccjs/object.h"
#include "ccjs/string.h"

typedef struct counters {
  int allocs;
  int frees;
} counters;

static void* test_alloc(void* user, size_t size, size_t align) {
  (void)align;
  counters* state = (counters*)user;
  state->allocs += 1;
  return calloc(1, size);
}

static void* test_realloc(void* user, void* ptr, size_t old_size, size_t new_size, size_t align) {
  (void)user;
  (void)old_size;
  (void)align;
  return realloc(ptr, new_size);
}

static void test_free(void* user, void* ptr, size_t size, size_t align) {
  (void)size;
  (void)align;
  counters* state = (counters*)user;
  state->frees += 1;
  free(ptr);
}

int main(void) {
  counters state = { 0, 0 };
  ccjs_allocator allocator = { &state, test_alloc, test_realloc, test_free };
  ccjs_field_info fields[] = {
    { "name", 0 },
    { "items", 0 }
  };
  ccjs_shape shape = { 2, fields };
  ccjs_value name;
  ccjs_value array;
  ccjs_value user;

  if (ccjs_string_from_literal(&allocator, "Ada", 3, &name) != CCJS_OK) return 1;
  if (ccjs_array_new(&allocator, 1, &array) != CCJS_OK) return 2;
  if (ccjs_array_set(array, 0, name) != CCJS_OK) return 3;
  if (ccjs_object_new(&allocator, &shape, &user) != CCJS_OK) return 4;
  if (ccjs_object_init_known(user, 0, name) != CCJS_OK) return 5;
  if (ccjs_object_init_known(user, 1, array) != CCJS_OK) return 6;

  ccjs_release(name);
  ccjs_release(array);
  ccjs_release(user);

  printf("%d %d %d\\n", state.allocs, state.frees, state.allocs - state.frees);
  return 0;
}
`)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, '4 4 0\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('C runtime callback object invokes and releases context', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-callback-'))
  const source = join(dir, 'callback-smoke.c')
  const output = join(dir, 'callback-smoke')

  try {
    await writeFile(source, `#include <stdio.h>
#include <stdlib.h>
#include "ccjs/callback.h"

typedef struct alloc_state {
  int allocs;
  int frees;
} alloc_state;

typedef struct callback_state {
  int calls;
  int finalized;
  double total;
} callback_state;

static void* test_alloc(void* user, size_t size, size_t align) {
  (void)align;
  alloc_state* state = (alloc_state*)user;
  state->allocs += 1;
  return calloc(1, size);
}

static void* test_realloc(void* user, void* ptr, size_t old_size, size_t new_size, size_t align) {
  (void)user;
  (void)old_size;
  (void)align;
  return realloc(ptr, new_size);
}

static void test_free(void* user, void* ptr, size_t size, size_t align) {
  (void)size;
  (void)align;
  alloc_state* state = (alloc_state*)user;
  state->frees += 1;
  free(ptr);
}

static ccjs_status add_values(void* context, const ccjs_value* args, size_t arg_count, ccjs_value* out) {
  if (context == 0 || args == 0 || out == 0 || arg_count != 2) return CCJS_ERR_TYPE;
  if (args[0].tag != CCJS_TAG_NUMBER || args[1].tag != CCJS_TAG_BOOL) return CCJS_ERR_TYPE;

  callback_state* state = (callback_state*)context;
  state->calls += 1;
  state->total += args[0].as.number + (args[1].as.boolean ? 1 : 0);
  *out = ccjs_number_value(state->total);

  return CCJS_OK;
}

static void finalize_callback(void* context) {
  callback_state* state = (callback_state*)context;
  state->finalized += 1;
}

int main(void) {
  alloc_state alloc = { 0, 0 };
  callback_state callback = { 0, 0, 0 };
  ccjs_allocator allocator = { &alloc, test_alloc, test_realloc, test_free };
  ccjs_value fn;
  ccjs_value out;
  ccjs_value args[] = {
    ccjs_number_value(3),
    ccjs_bool_value(true)
  };

  if (ccjs_callback_new(&allocator, add_values, &callback, finalize_callback, &fn) != CCJS_OK) return 1;
  if (ccjs_callback_call(fn, args, 2, &out) != CCJS_OK) return 2;
  if (out.tag != CCJS_TAG_NUMBER) return 3;

  ccjs_retain(fn);
  ccjs_release(fn);
  if (callback.finalized != 0) return 4;
  ccjs_release(fn);

  printf("%d %d %.0f %.0f %d %d\\n", callback.calls, callback.finalized, callback.total, out.as.number, alloc.allocs, alloc.frees);
  return 0;
}
`)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, '1 1 4 4 1 1\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('C runtime time adapter keeps Date.now on monotonic delta', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-time-runtime-'))
  const source = join(dir, 'time-runtime.c')
  const output = join(dir, 'time-runtime')

  try {
    await writeFile(source, `#include <stdio.h>
#include "ccjs/time.h"

typedef struct clock_state {
  double mono;
  double wall;
  int wall_reads;
} clock_state;

static ccjs_number monotonic_now(void* user) {
  clock_state* state = (clock_state*)user;
  return state->mono;
}

static ccjs_number wall_now(void* user) {
  clock_state* state = (clock_state*)user;
  state->wall_reads += 1;
  return state->wall;
}

int main(void) {
  clock_state state = { 100, 1000, 0 };
  ccjs_time_adapter adapter = { &state, monotonic_now, wall_now };

  ccjs_time_set_adapter(adapter);

  double p0 = ccjs_performance_now();
  state.mono = 125;
  double date1 = ccjs_date_now();
  state.wall = 5000;
  state.mono = 150;
  double date2 = ccjs_date_now();
  ccjs_time_resync_wall_clock();
  state.mono = 175;
  double date3 = ccjs_date_now();

  printf("%.0f %.0f %.0f %.0f %d\\n", p0, date1, date2, date3, state.wall_reads);
  return 0;
}
`)

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

test('generated C object literal lowering compiles and runs with runtime sources', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-object-'))
  const source = join(dir, 'object-literal.c')
  const output = join(dir, 'object-literal')

  try {
    const result = compileSource(`export function main(): void {
  const user = { name: 'Ada', score: 42 }
  console.log('ok')
}
`, {
      target: 'c'
    })

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, 'ok\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C early return runs through cleanup label with runtime sources', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-early-return-cleanup-'))
  const source = join(dir, 'early-return-cleanup.c')
  const output = join(dir, 'early-return-cleanup')

  try {
    const result = compileSource(`export function main(): void {
  const user = { name: 'Ada' }
  return
  console.log('unreachable')
}
`, {
      target: 'c'
    })

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, '')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C top-level wrapper cleanup compiles and runs with runtime sources', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-wrapper-cleanup-'))
  const source = join(dir, 'wrapper-cleanup.c')
  const output = join(dir, 'wrapper-cleanup')

  try {
    const result = compileSource(`const user = { name: 'Ada' }
console.log('ok')
`, {
      target: 'c'
    })

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, 'ok\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C number return cleanup compiles and runs with runtime sources', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-number-return-cleanup-'))
  const source = join(dir, 'number-return-cleanup.c')
  const output = join(dir, 'number-return-cleanup')

  try {
    const result = compileSource(`function getScore(): number {
  const user = { score: 42 }
  const score = user.score
  return score
}

export function main(): void {
  console.log(getScore())
}
`, {
      target: 'c'
    })

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, '42\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C prepared for clauses compile and run with runtime sources', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-for-prepared-'))
  const source = join(dir, 'for-prepared.c')
  const output = join(dir, 'for-prepared')

  try {
    const result = compileSource(`function start(label: string): number {
  return 0
}

function keepGoing(index: number, label: string): boolean {
  return index < 3
}

function nextIndex(index: number, label: string): number {
  return index + 1
}

export function main(): void {
  let total = 0

  for (let index = start('start'); keepGoing(index, 'limit'); index = nextIndex(index, 'step')) {
    total = total + index
  }

  console.log(total)
}
`, {
      target: 'c'
    })

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, '3\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C continue statements compile and run with runtime sources', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-continue-'))
  const source = join(dir, 'continue.c')
  const output = join(dir, 'continue')

  try {
    const result = compileSource(`export function main(): void {
  let total = 0

  for (let index = 0; index < 5; index = index + 1) {
    if (index === 2) {
      continue
    }

    total = total + index
  }

  console.log(total)
}
`, {
      target: 'c'
    })

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, '8\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C string-returning for initializer compiles and runs with runtime sources', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-for-string-init-'))
  const source = join(dir, 'for-string-init.c')
  const output = join(dir, 'for-string-init')

  try {
    const result = compileSource(`function getName(): string {
  return 'Ada'
}

export function main(): void {
  let index = 0

  for (const name = getName(); index < 1; index = index + 1) {
    console.log(name)
  }
}
`, {
      target: 'c'
    })

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, 'Ada\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C prepared conditions compile and run with runtime sources', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-prepared-conditions-'))
  const source = join(dir, 'prepared-conditions.c')
  const output = join(dir, 'prepared-conditions')

  try {
    const result = compileSource(`function isReady(label: string): boolean {
  return true
}

function keepGoing(index: number, label: string): boolean {
  return index < 2
}

function choose(label: string): number {
  return 2
}

export function main(): void {
  let index = 0

  if (isReady('if')) {
    index = index + 1
  }

  while (keepGoing(index, 'while')) {
    index = index + 1
  }

  switch (choose('switch')) {
    case 2:
      index = index + 1
      break
    default:
      break
  }

  console.log(index)
}
`, {
      target: 'c'
    })

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, '3\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C prepared scalar assignment compiles and runs with runtime sources', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-prepared-assignment-'))
  const source = join(dir, 'prepared-assignment.c')
  const output = join(dir, 'prepared-assignment')

  try {
    const result = compileSource(`function nextIndex(index: number, label: string): number {
  return index + 1
}

export function main(): void {
  let index = 0
  index = nextIndex(index, 'step')
  console.log(index)
}
`, {
      target: 'c'
    })

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, '1\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C named callback values compile and run with runtime sources', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-callback-'))
  const source = join(dir, 'callback.c')
  const output = join(dir, 'callback')

  try {
    const result = compileSource(`function run(callback: Function): void {
  callback()
}

function hello(): void {
  console.log('callback')
}

export function main(): void {
  const callback: Function = hello
  run(callback)
}
`, {
      target: 'c'
    })

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, 'callback\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C non-capturing inline callback values compile and run with runtime sources', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-inline-pointer-callback-'))
  const source = join(dir, 'inline-pointer-callback.c')
  const output = join(dir, 'inline-pointer-callback')

  try {
    const result = compileSource(`function run(callback: Function): void {
  callback()
}

export function main(): void {
  run(() => {
    console.log('inline')
  })
}
`, {
      target: 'c'
    })

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, 'inline\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C capturing plain callback arguments compile and run with runtime sources', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-capturing-plain-callback-'))
  const source = join(dir, 'capturing-plain-callback.c')
  const output = join(dir, 'capturing-plain-callback')

  try {
    const result = compileSource(`type NumberCallback = (value: number) => void;

function runPlain(callback: Function): void {
  callback()
}

function runNumber(callback: NumberCallback): void {
  callback(7)
}

export function main(): void {
  const label = 'captured'
  const offset = 5
  runPlain(() => {
    console.log(label)
  })
  runNumber((value: number) => {
    console.log(value + offset)
  })
}
`, {
      target: 'c'
    })

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, 'captured\n12\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C captured callback variables compile and run with runtime sources', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-captured-callback-variable-'))
  const source = join(dir, 'captured-callback-variable.c')
  const output = join(dir, 'captured-callback-variable')

  try {
    const result = compileSource(`type NumberCallback = (value: number) => void;

function run(callback: Function): void {
  callback()
}

function runNumber(callback: NumberCallback): void {
  callback(7)
}

export function main(): void {
  const label = 'direct'
  const offset = 5
  const callback: Function = () => {
    console.log(label)
  }
  const numberCallback: NumberCallback = (value: number) => {
    console.log(value + offset)
  }
  callback()
  run(callback)
  runNumber(numberCallback)
}
`, {
      target: 'c'
    })

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, 'direct\ndirect\n12\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C mutable numeric callback captures compile and run with runtime sources', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-mutable-callback-capture-'))
  const source = join(dir, 'mutable-callback-capture.c')
  const output = join(dir, 'mutable-callback-capture')

  try {
    const result = compileSource(`function run(callback: Function): void {
  callback()
}

export function main(): void {
  let count = 0
  const callback: Function = () => {
    count = count + 1
    console.log(count)
  }
  run(callback)
  console.log(count)
}
`, {
      target: 'c'
    })

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, '1\n1\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C mutable numeric callback parameter captures compile and run with runtime sources', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-mutable-callback-param-'))
  const source = join(dir, 'mutable-callback-param.c')
  const output = join(dir, 'mutable-callback-param')

  try {
    const result = compileSource(`function run(seed: number): void {
  const callback: Function = () => {
    seed = seed + 1
    console.log(seed)
  }
  callback()
  console.log(seed)
}

export function main(): void {
  run(1)
}
`, {
      target: 'c'
    })

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, '2\n2\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C mutable string callback captures compile and run with runtime sources', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-mutable-string-callback-'))
  const source = join(dir, 'mutable-string-callback.c')
  const output = join(dir, 'mutable-string-callback')

  try {
    const result = compileSource(`function run(callback: Function): void {
  callback()
}

export function main(): void {
  let label = 'start'
  const callback: Function = () => {
    label = label + '!'
    console.log(label)
  }
  run(callback)
  console.log(label)
}
`, {
      target: 'c'
    })

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, 'start!\nstart!\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C mutable object callback captures compile and run with runtime sources', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-mutable-object-callback-'))
  const source = join(dir, 'mutable-object-callback.c')
  const output = join(dir, 'mutable-object-callback')

  try {
    const result = compileSource(`type Person = {
  name: string
}

function run(callback: Function): void {
  callback()
}

export function main(): void {
  let person: Person = { name: 'Ada' }
  const callback: Function = () => {
    person.name = 'Grace'
    console.log(person.name)
  }
  run(callback)
  console.log(person.name)
}
`, {
      target: 'c'
    })

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, 'Grace\nGrace\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C typed callback aliases compile and run with runtime sources', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-typed-callback-'))
  const source = join(dir, 'typed-callback.c')
  const output = join(dir, 'typed-callback')

  try {
    const result = compileSource(`type NumberCallback = (value: number) => void;

function run(callback: NumberCallback): void {
  callback(7)
}

function hello(value: number): void {
  console.log(value)
}

export function main(): void {
  const callback: NumberCallback = hello
  run(callback)
}
`, {
      target: 'c'
    })

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, '7\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C string callback aliases compile and run with runtime sources', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-string-callback-'))
  const source = join(dir, 'string-callback.c')
  const output = join(dir, 'string-callback')

  try {
    const result = compileSource(`type StringCallback = (value: string) => void;

function run(callback: StringCallback): void {
  callback('typed')
}

function hello(value: string): void {
  console.log(value)
}

export function main(): void {
  const callback: StringCallback = hello
  run(callback)
}
`, {
      target: 'c'
    })

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, 'typed\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C object callback aliases compile and run with runtime sources', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-object-callback-'))
  const source = join(dir, 'object-callback.c')
  const output = join(dir, 'object-callback')

  try {
    const result = compileSource(`type Person = {
  name: string
};

type PersonCallback = (value: Person) => void;

function run(callback: PersonCallback, person: Person): void {
  callback(person)
}

function hello(value: Person): void {
  console.log(value.name)
}

export function main(): void {
  const person: Person = {
    name: 'Ada'
  }
  const callback: PersonCallback = hello
  run(callback, person)
}
`, {
      target: 'c'
    })

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, 'Ada\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C capturing runtime callback arrows compile and run with runtime sources', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-capturing-callback-'))
  const source = join(dir, 'capturing-callback.c')
  const output = join(dir, 'capturing-callback')

  try {
    const result = compileSource(`type StringCallback = (value: string) => void;

function run(callback: StringCallback): void {
  callback('Ada')
}

export function main(): void {
  const prefix = 'hello'
  const callback: StringCallback = (value: string) => {
    console.log(prefix, value)
  }
  run(callback)
}
`, {
      target: 'c'
    })

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, 'hello Ada\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C inline runtime callback arguments compile and run with runtime sources', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-inline-callback-'))
  const source = join(dir, 'inline-callback.c')
  const output = join(dir, 'inline-callback')

  try {
    const result = compileSource(`type StringCallback = (value: string) => void;

function run(callback: StringCallback): void {
  callback('direct')
}

export function main(): void {
  const prefix = 'hello'
  run((value: string) => {
    console.log(prefix, value)
  })
}
`, {
      target: 'c'
    })

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, 'hello direct\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C retained runtime callback captures compile and run with runtime sources', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-retained-callback-'))
  const source = join(dir, 'retained-callback.c')
  const output = join(dir, 'retained-callback')

  try {
    const result = compileSource(`type User = {
  name: string
}

type StringCallback = (value: string) => void;

function run(callback: StringCallback): void {
  callback('Grace')
}

export function main(): void {
  const user: User = { name: 'Ada' }
  const name = user.name
  const callback: StringCallback = (value: string) => {
    console.log(name, user.name, value)
  }
  run(callback)
}
`, {
      target: 'c'
    })

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, 'Ada Ada Grace\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C string equality comparisons compile and run with runtime sources', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-string-equality-'))
  const source = join(dir, 'string-equality.c')
  const output = join(dir, 'string-equality')

  try {
    const result = compileSource(`type User = {
  name: string
}

function getName(): string {
  return 'Ada'
}

export function main(): void {
  const user: User = { name: 'Ada' }
  const values = ['Ada', 'Grace']
  const name = 'Ada'
  const sameLocal = name === 'Ada'
  const sameRuntime = user.name === values[0]
  const differentCall = getName() !== values[1]
  console.log(sameLocal, sameRuntime, differentCall)
}
`, {
      target: 'c'
    })

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, '1 1 1\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C string concatenation compiles and runs with runtime sources', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-string-concat-'))
  const source = join(dir, 'string-concat.c')
  const output = join(dir, 'string-concat')

  try {
    const result = compileSource(`type User = {
  name: string
}

function getName(): string {
  return 'Grace'
}

export function main(): void {
  const user: User = { name: 'Ada' }
  const name = user.name
  const message = name + ' ' + getName() + '!'
  console.log(message)
}
`, {
      target: 'c'
    })

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, 'Ada Grace!\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C string length compiles and runs with runtime sources', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-string-length-'))
  const source = join(dir, 'string-length.c')
  const output = join(dir, 'string-length')

  try {
    const result = compileSource(`type User = {
  name: string
}

function length(name: string): number {
  return name.length
}

function getName(): string {
  return 'Grace'
}

export function main(): void {
  const user: User = { name: 'Ada' }
  const name = user.name
  const message = name + '!'
  console.log('Ada'.length, length(name), user.name.length, getName().length, message.length)
}
`, {
      target: 'c'
    })

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, '3 3 3 5 4\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C string predicate methods compile and run with runtime sources', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-string-predicates-'))
  const source = join(dir, 'string-predicates.c')
  const output = join(dir, 'string-predicates')

  try {
    const result = compileSource(`type User = {
  name: string
}

function hasAda(name: string): boolean {
  return name.includes('d') && name.startsWith('A') && name.endsWith('a')
}

function getName(): string {
  return 'Grace'
}

export function main(): void {
  const user: User = { name: 'Ada' }
  const name = user.name
  const message = name + '!'
  console.log('Ada'.includes('d'), hasAda(name), user.name.startsWith('A'), getName().endsWith('e'), message.endsWith('!'), name.includes('z'))
}
`, {
      target: 'c'
    })

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, '1 1 1 1 1 0\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C string slice compiles and runs with runtime sources', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-string-slice-'))
  const source = join(dir, 'string-slice.c')
  const output = join(dir, 'string-slice')

  try {
    const result = compileSource(`type User = {
  name: string
}

function middle(name: string): string {
  return name.slice(1, 3)
}

function getName(): string {
  return 'Grace'
}

export function main(): void {
  const user: User = { name: 'Ada' }
  const name = user.name
  const message = name + '!'
  console.log('Ada'.slice(1, 3), middle(name), user.name.slice(0, 1), getName().slice(1, 4), message.slice(3), name.slice(0, 99))
}
`, {
      target: 'c'
    })

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, 'da da A rac ! Ada\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C string trim compiles and runs with runtime sources', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-string-trim-'))
  const source = join(dir, 'string-trim.c')
  const output = join(dir, 'string-trim')

  try {
    const result = compileSource(`type User = {
  name: string
}

function clean(name: string): string {
  return name.trim()
}

function getName(): string {
  return ' Grace '
}

export function main(): void {
  const user: User = { name: ' Ada ' }
  const name = user.name
  const message = ' ' + name + ' '
  console.log(' Ada '.trim(), clean(name), user.name.trim(), getName().trim(), message.trim())
}
`, {
      target: 'c'
    })

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, 'Ada Ada Ada Grace Ada\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C String conversion compiles and runs with runtime sources', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-string-conversion-'))
  const source = join(dir, 'string-conversion.c')
  const output = join(dir, 'string-conversion')

  try {
    const result = compileSource(`type User = {
  name: string
}

function label(value: number): string {
  return String(value)
}

function flag(value: boolean): string {
  return String(value)
}

export function main(): void {
  const user: User = { name: 'Ada' }
  const name = user.name
  const local = 'Ada'
  console.log(String('Ada'), String(local), String(name), label(42), flag(true), String(false), String(name).length)
}
`, {
      target: 'c'
    })

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, 'Ada Ada Ada 42 true false 3\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C time globals compile and run with runtime sources', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-time-globals-'))
  const source = join(dir, 'time-globals.c')
  const output = join(dir, 'time-globals')

  try {
    const result = compileSource(`export function main(): void {
  const started = Date.now()
  const elapsed = performance.now()
  console.log(started >= 0, elapsed >= 0)
}
`, {
      target: 'c'
    })

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

test('generated C array literal lowering compiles and runs with runtime sources', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-array-'))
  const source = join(dir, 'array-literal.c')
  const output = join(dir, 'array-literal')

  try {
    const result = compileSource(`export function main(): void {
  const values = [1, 2, 3]
  console.log('ok')
}
`, {
      target: 'c'
    })

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, 'ok\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C Array.sort without comparator compiles and runs with runtime sources', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-array-sort-'))
  const source = join(dir, 'array-sort.c')
  const output = join(dir, 'array-sort')

  try {
    const result = compileSource(`export function main(): void {
  const values = [10, 2, 1]
  const sorted = values.sort()
  console.log(sorted[0], sorted[1], sorted[2])

  const names = ['Grace', 'Ada']
  names.sort()
  console.log(names[0], names[1])
}
`, {
      target: 'c'
    })

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, '1 10 2\nAda Grace\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C Array.sort comparator callbacks compile and run with runtime sources', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-array-sort-callback-'))
  const source = join(dir, 'array-sort-callback.c')
  const output = join(dir, 'array-sort-callback')

  try {
    const result = compileSource(`export function main(): void {
  const values = [3, 1, 2]
  values.sort((left, right) => left - right)
  console.log(values[0], values[1], values[2])

  const desc = [1, 3, 2]
  const sortedDesc = desc.sort((left, right) => right - left)
  console.log(sortedDesc[0], sortedDesc[1], sortedDesc[2])

  const names = ['bbb', 'a', 'cc']
  names.sort((left, right) => left.length - right.length)
  console.log(names[0], names[1], names[2])

  const flags = [true, false, true]
  flags.sort((left, right) => left - right)
  console.log(flags[0], flags[1], flags[2])

  const chained = [5, 1, 4, 2].filter(value => value > 1).sort((left, right) => left - right).map(value => value * 10)
  console.log(chained.length, chained[0], chained[1], chained[2])
}
`, {
      target: 'c'
    })

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, '1 2 3\n3 2 1\na cc bbb\n0 1 1\n3 20 40 50\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C Array.filter expression callbacks compile and run with runtime sources', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-array-filter-'))
  const source = join(dir, 'array-filter.c')
  const output = join(dir, 'array-filter')

  try {
    const result = compileSource(`export function main(): void {
  const values = [1, 2, 3, 4]
  const middle = values.filter((value, index) => value > 1 && index < 3)
  console.log(middle.length, middle[0], middle[1])

  const chainValues = [10, 2, 1]
  const chained = chainValues.sort().filter(value => value !== 10)
  console.log(chained.length, chained[0], chained[1])

  const names = ['Ada', 'Grace', 'Alan']
  const aNames = names.filter(name => name.startsWith('A'))
  console.log(aNames.length, aNames[0], aNames[1])
}
`, {
      target: 'c'
    })

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, '2 2 3\n2 1 2\n2 Ada Alan\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C Array.map expression callbacks compile and run with runtime sources', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-array-map-'))
  const source = join(dir, 'array-map.c')
  const output = join(dir, 'array-map')

  try {
    const result = compileSource(`export function main(): void {
  const values = [1, 2, 3]
  const doubled = values.map((value, index) => value * 2 + index)
  console.log(doubled.length, doubled[0], doubled[1], doubled[2])

  const flags = values.map(value => value > 1)
  console.log(flags.length, flags[0], flags[1], flags[2])

  const names = ['Ada', 'Grace']
  const initials = names.map(name => name.slice(0, 1))
  console.log(initials.length, initials[0], initials[1])

  const filteredMapped = values.filter(value => value > 1).map(value => value * 10)
  console.log(filteredMapped.length, filteredMapped[0], filteredMapped[1])

  const mappedFiltered = values.map(value => value + 1).filter(value => value > 2)
  console.log(mappedFiltered.length, mappedFiltered[0], mappedFiltered[1])

  const mappedSorted = values.map(value => String(value * 10)).sort()
  console.log(mappedSorted.length, mappedSorted[0], mappedSorted[1], mappedSorted[2])
}
`, {
      target: 'c'
    })

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, '3 2 5 8\n3 0 1 1\n2 A G\n2 20 30\n2 3 4\n3 10 20 30\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C array length lowering compiles and runs with runtime sources', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-array-length-'))
  const source = join(dir, 'array-length.c')
  const output = join(dir, 'array-length')

  try {
    const result = compileSource(`export function main(): void {
  const values = [1, 2, 3]
  console.log(values.length, [4, 5].length)
}
`, {
      target: 'c'
    })

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, '3 2\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C runtime array length compiles and runs with runtime sources', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-runtime-array-length-'))
  const source = join(dir, 'runtime-array-length.c')
  const output = join(dir, 'runtime-array-length')

  try {
    const result = compileSource(`type Box = {
  values: number[]
}

export function main(): void {
  const box: Box = { values: [1, 2, 3] }
  console.log(box.values.length)
}
`, {
      target: 'c'
    })

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, '3\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C runtime array index reads compile and run with runtime sources', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-runtime-array-index-'))
  const source = join(dir, 'runtime-array-index.c')
  const output = join(dir, 'runtime-array-index')

  try {
    const result = compileSource(`type Box = {
  values: number[],
  flags: boolean[],
  names: string[]
}

export function main(): void {
  const box: Box = { values: [1, 2, 3], flags: [true], names: ['Ada'] }
  const name = box.names[0]
  console.log(box.values[1], box.flags[0], name)
}
`, {
      target: 'c'
    })

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, '2 1 Ada\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C runtime array locals compile and run with runtime sources', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-runtime-array-locals-'))
  const source = join(dir, 'runtime-array-locals.c')
  const output = join(dir, 'runtime-array-locals')

  try {
    const result = compileSource(`type Box = {
  values: number[],
  names: string[]
}

export function main(): void {
  const box: Box = { values: [1, 2, 3], names: ['Ada'] }
  const values = box.values
  const names = box.names
  console.log(values[1], names[0])
}
`, {
      target: 'c'
    })

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, '2 Ada\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C for of over runtime array locals compiles and runs with runtime sources', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-runtime-array-for-of-'))
  const source = join(dir, 'runtime-array-for-of.c')
  const output = join(dir, 'runtime-array-for-of')

  try {
    const result = compileSource(`type Box = {
  values: number[],
  names: string[]
}

export function main(): void {
  const box: Box = { values: [1, 2, 3], names: ['Ada', 'Grace'] }
  const values = box.values
  const names = box.names
  let total = 0
  let letters = 0
  for (const value of values) {
    total = total + value
  }
  for (const name of names) {
    letters = letters + name.length
  }
  console.log(total, letters)
}
`, {
      target: 'c'
    })

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, '6 8\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C for of over runtime array expressions compiles and runs with runtime sources', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-runtime-array-expression-for-of-'))
  const source = join(dir, 'runtime-array-expression-for-of.c')
  const output = join(dir, 'runtime-array-expression-for-of')

  try {
    const result = compileSource(`type Box = {
  values: number[],
  names: string[]
}

export function main(): void {
  const box: Box = { values: [1, 2, 3], names: ['Ada', 'Grace'] }
  let total = 0
  let letters = 0
  for (const value of box.values) {
    total = total + value
  }
  for (const name of box.names) {
    letters = letters + name.length
  }
  console.log(total, letters)
}
`, {
      target: 'c'
    })

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, '6 8\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C for of array lowering compiles and runs with runtime sources', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-for-of-array-'))
  const source = join(dir, 'for-of-array.c')
  const output = join(dir, 'for-of-array')

  try {
    const result = compileSource(`export function main(): void {
  const values = [1, 2, 3]
  let total = 0

  for (const value of values) {
    total = total + value
  }

  console.log(total)
}
`, {
      target: 'c'
    })

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, '6\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C for of string array lowering compiles and runs with runtime sources', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-for-of-string-array-'))
  const source = join(dir, 'for-of-string-array.c')
  const output = join(dir, 'for-of-string-array')

  try {
    const result = compileSource(`export function main(): void {
  const names = ['Ada', 'Grace']

  for (const name of names) {
    console.log(name)
  }
}
`, {
      target: 'c'
    })

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, 'Ada\nGrace\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C inline for of array lowering compiles and runs with runtime sources', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-for-of-inline-array-'))
  const source = join(dir, 'for-of-inline-array.c')
  const output = join(dir, 'for-of-inline-array')

  try {
    const result = compileSource(`export function main(): void {
  let total = 0

  for (const value of [1, 2, 3]) {
    total = total + value
  }

  console.log(total)
}
`, {
      target: 'c'
    })

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, '6\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C inline for of string array lowering compiles and runs with runtime sources', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-for-of-inline-string-array-'))
  const source = join(dir, 'for-of-inline-string-array.c')
  const output = join(dir, 'for-of-inline-string-array')

  try {
    const result = compileSource(`export function main(): void {
  for (const name of ['Ada', 'Grace']) {
    console.log(name)
  }
}
`, {
      target: 'c'
    })

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, 'Ada\nGrace\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C object field access lowering compiles and runs with runtime sources', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-object-field-'))
  const source = join(dir, 'object-field.c')
  const output = join(dir, 'object-field')

  try {
    const result = compileSource(`export function main(): void {
  const user = { score: 42, active: true }
  const score = user.score
  const active = user.active
  console.log(score, active)
}
`, {
      target: 'c'
    })

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, '42 1\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C string object field access lowering compiles and runs with runtime sources', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-object-string-field-'))
  const source = join(dir, 'object-string-field.c')
  const output = join(dir, 'object-string-field')

  try {
    const result = compileSource(`export function main(): void {
  const user = { name: 'Ada', score: 42 }
  const name = user.name
  console.log(name)
}
`, {
      target: 'c'
    })

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, 'Ada\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C object field assignment lowering compiles and runs with runtime sources', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-object-field-assignment-'))
  const source = join(dir, 'object-field-assignment.c')
  const output = join(dir, 'object-field-assignment')

  try {
    const result = compileSource(`export function main(): void {
  const user = { score: 1, active: false, name: 'Ada' }
  user.score = 42
  user.active = true
  user.name = 'Grace'
  const score = user.score
  const active = user.active
  const name = user.name
  console.log(score, active, name)
}
`, {
      target: 'c'
    })

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, '42 1 Grace\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C string index object field reads compile and run with runtime sources', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-object-index-field-'))
  const source = join(dir, 'object-index-field.c')
  const output = join(dir, 'object-index-field')

  try {
    const result = compileSource(`export function main(): void {
  const user = { score: 42, active: true, name: 'Ada' }
  const score = user['score']
  const active = user['active']
  const name = user['name']
  console.log(score, active, name)
}
`, {
      target: 'c'
    })

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, '42 1 Ada\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C string index object field assignments compile and run with runtime sources', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-object-index-assignment-'))
  const source = join(dir, 'object-index-assignment.c')
  const output = join(dir, 'object-index-assignment')

  try {
    const result = compileSource(`export function main(): void {
  const user = { score: 1, active: false, name: 'Ada' }
  user['score'] = 42
  user['active'] = true
  user['name'] = 'Grace'
  const score = user['score']
  const active = user['active']
  const name = user['name']
  console.log(score, active, name)
}
`, {
      target: 'c'
    })

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, '42 1 Grace\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C array index access lowering compiles and runs with runtime sources', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-array-index-'))
  const source = join(dir, 'array-index.c')
  const output = join(dir, 'array-index')

  try {
    const result = compileSource(`export function main(): void {
  const values = [42, true]
  const score = values[0]
  const active = values[1]
  console.log(score, active)
}
`, {
      target: 'c'
    })

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, '42 1\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C array index assignment lowering compiles and runs with runtime sources', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-array-assignment-'))
  const source = join(dir, 'array-assignment.c')
  const output = join(dir, 'array-assignment')

  try {
    const result = compileSource(`export function main(): void {
  const values = [1, false]
  values[0] = 42
  values[1] = true
  const score = values[0]
  const active = values[1]
  console.log(score, active)
}
`, {
      target: 'c'
    })

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, '42 1\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C string array index reads compile and run with runtime sources', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-string-array-'))
  const source = join(dir, 'string-array.c')
  const output = join(dir, 'string-array')

  try {
    const result = compileSource(`export function main(): void {
  const values = ['Ada']
  values[0] = 'Grace'
  const name = values[0]
  console.log(name)
}
`, {
      target: 'c'
    })

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, 'Grace\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C runtime string local propagation compiles and runs with runtime sources', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-runtime-string-local-'))
  const source = join(dir, 'runtime-string-local.c')
  const output = join(dir, 'runtime-string-local')

  try {
    const result = compileSource(`export function main(): void {
  const user = { name: 'Ada' }
  const name = user.name
  const again = name
  console.log(again)
}
`, {
      target: 'c'
    })

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, 'Ada\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C nullable string nullish coalescing compiles and runs with runtime sources', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-nullable-string-nullish-'))
  const source = join(dir, 'nullable-string-nullish.c')
  const output = join(dir, 'nullable-string-nullish')

  try {
    const result = compileSource(`export function main(): void {
  let name: string | null = null
  console.log(name ?? 'Ada', name === null)
  name = 'Grace'
  const display = name ?? 'Ada'
  console.log(display, name !== null)
}
`, {
      target: 'c'
    })

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, 'Ada 1\nGrace 1\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C nullable runtime optional access compiles and runs with runtime sources', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-nullable-optional-access-'))
  const source = join(dir, 'nullable-optional-access.c')
  const output = join(dir, 'nullable-optional-access')

  try {
    const result = compileSource(`type User = {
  name: string
}

export function main(): void {
  let user: User | null = null
  const missingName = user?.name ?? 'missing'
  user = { name: 'Ada' }
  const memberName = user?.name ?? 'missing'
  const indexName = user?.['name'] ?? 'missing'

  const names = ['Grace']
  const maybeNames: string[] | null = names
  const emptyNames: string[] | null = null
  const arrayName = maybeNames?.[0] ?? 'empty'
  const emptyName = emptyNames?.[0] ?? 'empty'

  const scores: Map<string, number> = new Map([['Ada', 7]])
  const maybeScores: Map<string, number> | null = scores
  console.log(missingName, memberName, indexName, arrayName, emptyName, maybeScores !== null)
}
`, {
      target: 'c'
    })

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, 'missing Ada Ada Grace empty 1\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C nullable scalar nullish coalescing compiles and runs with runtime sources', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-nullable-scalar-nullish-'))
  const source = join(dir, 'nullable-scalar-nullish.c')
  const output = join(dir, 'nullable-scalar-nullish')

  try {
    const result = compileSource(`type User = {
  score: number,
  active: boolean
}

export function main(): void {
  let score: number | null = null
  let active: boolean | null = null
  console.log(score ?? 1, active ?? false, score === null, active !== null)
  score = 7
  active = true
  console.log(score ?? 0, active ?? false, score !== null, active === null)

  let user: User | null = null
  console.log(user?.score ?? 3, user?.active ?? true)
  user = { score: 9, active: false }
  const maybeScore = user?.score
  const maybeActive = user?.active
  console.log(maybeScore ?? 0, maybeActive ?? true)

  const values = [2]
  const maybeValues: number[] | null = values
  const emptyValues: number[] | null = null
  console.log(maybeValues?.[0] ?? 5, emptyValues?.[0] ?? 5)
}
`, {
      target: 'c'
    })

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, '1 0 1 0\n7 1 1 0\n3 1\n9 0\n2 5\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C nullable scalar function ABI compiles and runs with runtime sources', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-nullable-scalar-abi-'))
  const source = join(dir, 'nullable-scalar-abi.c')
  const output = join(dir, 'nullable-scalar-abi')

  try {
    const result = compileSource(`function maybeScore(seed: number): number | null {
  if (seed > 0) {
    return seed + 1
  }

  return null
}

function maybeActive(seed: number): boolean | null {
  if (seed > 0) {
    return true
  }

  return null
}

function printScore(score: number | null, active: boolean | null): void {
  console.log(score ?? 0, active ?? false, score !== null, active === null)
}

export function main(): void {
  const first = maybeScore(1)
  const second: number | null = maybeScore(0)
  let active: boolean | null = maybeActive(1)
  printScore(first, active)
  active = maybeActive(0)
  printScore(second, active)
  printScore(7 + 1, false)
}
`, {
      target: 'c'
    })

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, '2 1 1 0\n0 0 0 1\n8 0 1 0\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C nullable scalar branch narrowing compiles and runs with runtime sources', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-nullable-scalar-branch-narrowing-'))
  const source = join(dir, 'nullable-scalar-branch-narrowing.c')
  const output = join(dir, 'nullable-scalar-branch-narrowing')

  try {
    const result = compileSource(`function printScore(score: number | null, active: boolean | null): void {
  if (score !== null) {
    console.log(score + 1)
  } else {
    console.log(0)
  }

  if (active === null) {
    console.log(false)
  } else {
    console.log(active)
  }
}

export function main(): void {
  printScore(4, true)
  printScore(null, null)

  let value: number | null = 5
  if (value !== null) {
    console.log(value)
    value = null
  }
  console.log(value ?? 9)
}
`, {
      target: 'c'
    })

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, '5\n1\n0\n0\n5\n9\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C nullable scalar logical narrowing compiles and runs with runtime sources', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-nullable-scalar-logical-narrowing-'))
  const source = join(dir, 'nullable-scalar-logical-narrowing.c')
  const output = join(dir, 'nullable-scalar-logical-narrowing')

  try {
    const result = compileSource(`function printScore(score: number | null, backup: number | null): void {
  if (score !== null && score > 2) {
    console.log(score + 1)
  } else {
    console.log(0)
  }

  if (backup === null || backup < 1) {
    console.log(10)
  } else {
    console.log(backup + 2)
  }
}

export function main(): void {
  printScore(4, 3)
  printScore(null, null)
  printScore(1, 0)
}
`, {
      target: 'c'
    })

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, '5\n5\n0\n10\n0\n10\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C nullable scalar early return narrowing compiles and runs with runtime sources', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-nullable-scalar-early-return-narrowing-'))
  const source = join(dir, 'nullable-scalar-early-return-narrowing.c')
  const output = join(dir, 'nullable-scalar-early-return-narrowing')

  try {
    const result = compileSource(`function printScore(score: number | null, active: boolean | null): void {
  if (score === null) {
    console.log(0)
    return
  }
  console.log(score + 1)

  if (active === null) {
    console.log(0)
    return
  }
  console.log(active)
}

function printHigh(score: number | null): void {
  if (score === null || score < 2) {
    console.log(10)
    return
  }
  console.log(score + 1)
}

export function main(): void {
  printScore(4, true)
  printScore(null, true)
  printScore(2, null)
  printHigh(3)
  printHigh(null)
  printHigh(1)
}
`, {
      target: 'c'
    })

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, '5\n1\n0\n3\n0\n4\n10\n10\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C nullable scalar loop narrowing compiles and runs with runtime sources', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-nullable-scalar-loop-narrowing-'))
  const source = join(dir, 'nullable-scalar-loop-narrowing.c')
  const output = join(dir, 'nullable-scalar-loop-narrowing')

  try {
    const result = compileSource(`function printLoop(score: number | null, active: boolean | null): void {
  while (score !== null && score > 0) {
    console.log(score)
    score = score - 1
  }

  for (let index = 0; active !== null && index < 2; index = index + 1) {
    console.log(active)
    active = null
  }
}

export function main(): void {
  printLoop(2, true)
  printLoop(null, null)
}
`, {
      target: 'c'
    })

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, '2\n1\n1\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C nullable callback optional calls compile and run with runtime sources', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-nullable-callback-optional-call-'))
  const source = join(dir, 'nullable-callback-optional-call.c')
  const output = join(dir, 'nullable-callback-optional-call')

  try {
    const result = compileSource(`type Named = (name: string) => void;

function maybeLog(callback: Function | null): void {
  callback?.()
}

function maybeNamed(callback: Named | null): void {
  callback?.('Ada')
}

function hello(): void {
  console.log('hello')
}

function named(name: string): void {
  console.log(name)
}

export function main(): void {
  maybeLog(null)
  maybeLog(hello)

  let callback: Function | null = null
  callback?.()
  callback = hello
  callback?.()

  let namedCallback: Named | null = null
  namedCallback?.('skip')
  namedCallback = named
  namedCallback?.('Grace')
  maybeNamed(named)
  maybeNamed(null)
}
`, {
      target: 'c'
    })

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, 'hello\nhello\nGrace\nAda\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C nullable callback optional call results compile and run with runtime sources', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-nullable-callback-optional-call-result-'))
  const source = join(dir, 'nullable-callback-optional-call-result.c')
  const output = join(dir, 'nullable-callback-optional-call-result')

  try {
    const result = compileSource(`type Score = (value: number) => number;
type Ready = () => boolean;

function addOne(value: number): number {
  return value + 1
}

function isReady(): boolean {
  return true
}

function printValues(score: Score | null, ready: Ready | null): void {
  const value: number | null = score?.(4)
  const flag: boolean | null = ready?.()
  console.log(value ?? 0, flag ?? false)
}

export function main(): void {
  printValues(addOne, isReady)
  printValues(null, null)
}
`, {
      target: 'c'
    })

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, '5 1\n0 0\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C runtime string assignment references compile and run with runtime sources', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-runtime-string-assignment-'))
  const source = join(dir, 'runtime-string-assignment.c')
  const output = join(dir, 'runtime-string-assignment')

  try {
    const result = compileSource(`export function main(): void {
  const source = { name: 'Ada' }
  const name = source.name
  const target = { name: 'Bob' }
  const values = ['Grace']
  target.name = name
  values[0] = name
  const objectName = target.name
  const arrayName = values[0]
  console.log(objectName, arrayName)
}
`, {
      target: 'c'
    })

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, 'Ada Ada\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C string-returning assignment calls compile and run with runtime sources', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-string-return-assignment-'))
  const source = join(dir, 'string-return-assignment.c')
  const output = join(dir, 'string-return-assignment')

  try {
    const result = compileSource(`function getName(): string {
  return 'Ada'
}

export function main(): void {
  const target = { name: 'Bob' }
  const values = ['Grace']
  target.name = getName()
  values[0] = getName()
  console.log(target.name, values[0])
}
`, {
      target: 'c'
    })

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, 'Ada Ada\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C runtime string params compile and run with runtime sources', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-runtime-string-params-'))
  const source = join(dir, 'runtime-string-params.c')
  const output = join(dir, 'runtime-string-params')

  try {
    const result = compileSource(`function greet(name: string): void {
  console.log(name)
}

function echo(name: string): string {
  return name
}

export function main(): void {
  const user = { name: 'Ada' }
  greet('Ada')
  greet(user.name)
  console.log(echo(user.name))
}
`, {
      target: 'c'
    })

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, 'Ada\nAda\nAda\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C prepared string args in number expressions compile and run with runtime sources', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-prepared-number-calls-'))
  const source = join(dir, 'prepared-number-calls.c')
  const output = join(dir, 'prepared-number-calls')

  try {
    const result = compileSource(`function length(name: string): number {
  return 3
}

export function main(): void {
  const user = { name: 'Ada' }
  const total = length('Ada') + length(user.name)
  console.log(length(user.name), total)
}
`, {
      target: 'c'
    })

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, '3 6\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C runtime string return compiles and runs with runtime sources', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-runtime-string-return-'))
  const source = join(dir, 'runtime-string-return.c')
  const output = join(dir, 'runtime-string-return')

  try {
    const result = compileSource(`function getName(): string {
  const user = { name: 'Ada' }
  return user.name
}

export function main(): void {
  const name = getName()
  console.log(name)
}
`, {
      target: 'c'
    })

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, 'Ada\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C runtime string index returns compile and run with runtime sources', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-runtime-string-index-return-'))
  const source = join(dir, 'runtime-string-index-return.c')
  const output = join(dir, 'runtime-string-index-return')

  try {
    const result = compileSource(`function getObjectName(): string {
  const user = { name: 'Ada' }
  return user['name']
}

function getArrayName(): string {
  const values = ['Grace']
  return values[0]
}

export function main(): void {
  console.log(getObjectName(), getArrayName())
}
`, {
      target: 'c'
    })

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, 'Ada Grace\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C direct console log string return compiles and runs with runtime sources', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-direct-string-return-log-'))
  const source = join(dir, 'direct-string-return-log.c')
  const output = join(dir, 'direct-string-return-log')

  try {
    const result = compileSource(`function getName(): string {
  return 'Ada'
}

export function main(): void {
  console.log(getName())
}
`, {
      target: 'c'
    })

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, 'Ada\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C console log template interpolation compiles and runs with runtime sources', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-template-log-'))
  const source = join(dir, 'template-log.c')
  const output = join(dir, 'template-log')

  try {
    const result = compileSource(`export function main(): void {
  const user = { name: 'Ada', score: 7 }
  const suffix = 'ok'
  const ready = true
  console.log(\`hello \${user.name} \${suffix} score \${user.score} ready \${ready}\`)
}
`, {
      target: 'c'
    })

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, 'hello Ada ok score 7 ready 1\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C direct console log member and index expressions compile and run with runtime sources', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-direct-console-'))
  const source = join(dir, 'direct-console.c')
  const output = join(dir, 'direct-console')

  try {
    const result = compileSource(`export function main(): void {
  const user = { score: 42, active: true, name: 'Ada' }
  const values = [7, false, 'Grace']
  console.log(user.score, user.active, user.name, user['name'], values[0], values[1], values[2])
}
`, {
      target: 'c'
    })

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, '42 1 Ada Ada 7 0 Grace\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C member and index reads inside scalar expressions compile and run with runtime sources', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-scalar-member-expr-'))
  const source = join(dir, 'scalar-member-expr.c')
  const output = join(dir, 'scalar-member-expr')

  try {
    const result = compileSource(`export function main(): void {
  const user = { score: 7, active: true }
  const values = [3, true]
  const total = user.score + values[0]
  const same = user.active === values[1]
  console.log(total, same)
}
`, {
      target: 'c'
    })

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, '10 1\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C optional object member and index access compile and run with runtime sources', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-optional-member-'))
  const source = join(dir, 'optional-member.c')
  const output = join(dir, 'optional-member')

  try {
    const result = compileSource(`export function main(): void {
  const user = { name: 'Ada', score: 7 }
  const name = user?.name
  console.log(name, user?.['score'])
}
`, {
      target: 'c'
    })

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, 'Ada 7\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C typed object shape lowering compiles and runs with runtime sources', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-typed-object-'))
  const source = join(dir, 'typed-object.c')
  const output = join(dir, 'typed-object')

  try {
    const result = compileSource(`type User = {
  readonly id: number,
  name: string
}

export function main(): void {
  const user: User = { name: 'Ada', id: 42 }
  const id = user.id
  console.log(id)
}
`, {
      target: 'c'
    })

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, '42\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C Map and Set methods compile and run with runtime sources', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-collections-'))
  const source = join(dir, 'collections.c')
  const output = join(dir, 'collections')

  try {
    const result = compileSource(`export function main(): void {
  const scores: Map<string, number> = new Map()
  scores.set('Ada', 7)
  const score = scores.get('Ada')
  const hadAda = scores.has('Ada')
  const removed = scores.delete('Ada')
  const hasAda = scores.has('Ada')
  console.log(score, hadAda, removed, hasAda, scores.size)

  const names: Set<string> = new Set()
  names.add('Ada')
  const hadName = names.has('Ada')
  const removedName = names.delete('Ada')
  const hasName = names.has('Ada')
  console.log(hadName, removedName, hasName, names.size)
}
`, {
      target: 'c'
    })

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, '7 1 1 0 0\n1 1 0 0\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C Map and Set method chains compile and run with runtime sources', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-collection-chains-'))
  const source = join(dir, 'collection-chains.c')
  const output = join(dir, 'collection-chains')

  try {
    const result = compileSource(`export function main(): void {
  const scores: Map<string, number> = new Map()
  const score = scores.set('Ada', 7).get('Ada')
  const hasScore = scores.set('Grace', 9).has('Grace')

  const names: Set<string> = new Set()
  const hasName = names.add('Ada').has('Ada')
  const removed = names.add('Grace').delete('Grace')

  console.log(score, hasScore, hasName, removed, names.size)
}
`, {
      target: 'c'
    })

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, '7 1 1 1 1\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C Map and Set array literal constructors compile and run with runtime sources', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-collection-constructors-'))
  const source = join(dir, 'collection-constructors.c')
  const output = join(dir, 'collection-constructors')

  try {
    const result = compileSource(`export function main(): void {
  const scores: Map<string, number> = new Map([['Ada', 7], ['Grace', 9]])
  const names: Set<string> = new Set(['Ada', 'Grace'])

  console.log(scores.get('Ada'), scores.get('Grace'), names.has('Ada'), names.has('Grace'), scores.size, names.size)
}
`, {
      target: 'c'
    })

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, '7 9 1 1 2 2\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C Map and Set object fields compile and run with runtime sources', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-collection-fields-'))
  const source = join(dir, 'collection-fields.c')
  const output = join(dir, 'collection-fields')

  try {
    const result = compileSource(`type Bag = {
  scores: Map<string, number>,
  names: Set<string>
}

export function main(): void {
  const scores: Map<string, number> = new Map([['Ada', 7]])
  const names: Set<string> = new Set(['Ada'])
  const bag: Bag = { scores, names }
  const bagScores = bag.scores
  const bagNames = bag['names']

  console.log(bagScores.get('Ada'), bagNames.has('Ada'), bagScores.size, bagNames.size)
}
`, {
      target: 'c'
    })

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, '7 1 1 1\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

function compileRuntimeProgram(source: string, output: string): Promise<CommandResult> {
  return runCommand('cc', [
    '-Iruntime/c/include',
    source,
    'runtime/c/src/core/value.c',
    'runtime/c/src/core/allocator.c',
    'runtime/c/src/core/callback.c',
    'runtime/c/src/strings/string.c',
    'runtime/c/src/objects/object.c',
    'runtime/c/src/arrays/array.c',
    'runtime/c/src/collections/map.c',
    'runtime/c/src/collections/set.c',
    'runtime/c/src/time/time.c',
    '-o',
    output
  ])
}

function runCommand(command: string, args: string[]): Promise<CommandResult> {
  return new Promise(resolve => {
    const child = spawn(command, args, {
      cwd: new URL('..', import.meta.url),
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''

    child.stdout.on('data', chunk => {
      stdout += chunk
    })

    child.stderr.on('data', chunk => {
      stderr += chunk
    })

    child.on('error', error => {
      resolve({
        code: 127,
        stdout,
        stderr: error.message
      })
    })
    child.on('exit', code => {
      resolve({
        code: code ?? 1,
        stdout,
        stderr
      })
    })
  })
}
