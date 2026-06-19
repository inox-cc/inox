import test from 'node:test'
import {
  assert,
  compileRuntimeProgram,
  join,
  mkdtemp,
  rm,
  runCommand,
  tmpdir,
  writeFile
} from '../helpers/runtime-c.ts'

test('CLI links debug memory runtime when inox.__debug.memory is used', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'inox-c-debug-memory-'))
  const entry = join(dir, 'main.ts')
  const output = join(dir, 'main')

  try {
    await writeFile(
      entry,
      `const before = inox.__debug.memory()
const after = inox.__debug.memory()
console.log(after.allocCount - before.allocCount)
`
    )

    const build = await runCommand(process.execPath, ['bin/cli.ts', 'build', entry, '--target', 'c', '-o', output])

    assert.equal(build.code, 0, build.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.ok(Number.parseFloat(run.stdout.trim()) > 0, run.stdout)
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('compiled C debug memory snapshots catch managed value leaks after helper return', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'inox-c-debug-memory-managed-'))
  const entry = join(dir, 'main.ts')
  const output = join(dir, 'main')

  try {
    await writeFile(
      entry,
      `function makeManagedValues(): number {
  const scores = [1, 2, 3]
  const user = { name: 'Ada', score: 7 }
  return 9
}

const baselineA = inox.__debug.memory()
const baselineB = inox.__debug.memory()
const statsObjectAllocs = baselineB.liveAllocCount - baselineA.liveAllocCount
const statsObjectBytes = baselineB.liveBytes - baselineA.liveBytes
const before = inox.__debug.memory()
const total = makeManagedValues()
const after = inox.__debug.memory()

console.log(
  total,
  after.liveAllocCount - before.liveAllocCount - statsObjectAllocs,
  after.liveBytes - before.liveBytes - statsObjectBytes,
  after.liveWeakCells - before.liveWeakCells,
  after.livePromises - before.livePromises,
  after.liveCallbacks - before.liveCallbacks
)
`
    )

    const build = await runCommand(process.execPath, ['bin/cli.ts', 'build', entry, '--target', 'c', '-o', output])

    assert.equal(build.code, 0, build.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, '9 0 0 0 0 0\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('compiled C debug memory snapshots catch weak cell leaks after helper return', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'inox-c-debug-memory-weak-'))
  const entry = join(dir, 'main.ts')
  const output = join(dir, 'main')

  try {
    await writeFile(
      entry,
      `type Parent = {
  name: string
}

type Child = {
  weak parent: Parent | null
}

function makeWeakChild(): number {
  const parent: Parent = { name: 'Ada' }
  const child: Child = { parent }
  const name = child.parent?.name ?? 'missing'
  if (name == 'missing') {
    return 0
  }
  return 1
}

const baselineA = inox.__debug.memory()
const baselineB = inox.__debug.memory()
const statsObjectAllocs = baselineB.liveAllocCount - baselineA.liveAllocCount
const statsObjectBytes = baselineB.liveBytes - baselineA.liveBytes
const before = inox.__debug.memory()
const total = makeWeakChild()
const after = inox.__debug.memory()

console.log(
  total,
  after.liveAllocCount - before.liveAllocCount - statsObjectAllocs,
  after.liveBytes - before.liveBytes - statsObjectBytes,
  after.liveWeakCells - before.liveWeakCells
)
`
    )

    const build = await runCommand(process.execPath, ['bin/cli.ts', 'build', entry, '--target', 'c', '-o', output])

    assert.equal(build.code, 0, build.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, '1 0 0 0\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('C debug memory counters return to zero for array map and set cleanup', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'inox-c-debug-memory-containers-'))
  const source = join(dir, 'debug-memory-containers.c')
  const output = join(dir, 'debug-memory-containers')

  try {
    await writeFile(
      source,
      `#include <stdio.h>
#include <stdlib.h>
#include "inox/allocator.h"
#include "inox/array.h"
#include "inox/debug.h"
#include "inox/map.h"
#include "inox/set.h"
#include "inox/string.h"

static void* base_alloc(void* user, size_t size, size_t align) {
  (void)user;
  (void)align;
  return calloc(1, size);
}

static void* base_realloc(void* user, void* ptr, size_t old_size, size_t new_size, size_t align) {
  (void)user;
  (void)old_size;
  (void)align;
  return realloc(ptr, new_size);
}

static void base_free(void* user, void* ptr, size_t size, size_t align) {
  (void)user;
  (void)size;
  (void)align;
  free(ptr);
}

int main(void) {
  inox_allocator base = { 0, base_alloc, base_realloc, base_free };
  inox_allocator allocator = inox_debug_allocator(&base);
  inox_debug_memory_stats stats;
  inox_value key = inox_undefined_value();
  inox_value value = inox_undefined_value();
  inox_value array = inox_undefined_value();
  inox_value map = inox_undefined_value();
  inox_value set = inox_undefined_value();

  inox_debug_memory_reset();

  if (inox_string_from_literal(&allocator, "key", 3, &key) != INOX_OK) return 1;
  if (inox_string_from_literal(&allocator, "value", 5, &value) != INOX_OK) return 2;
  if (inox_array_new(&allocator, 1, &array) != INOX_OK) return 3;
  if (inox_array_set(array, 0, key) != INOX_OK) return 4;
  if (inox_map_new(&allocator, &map) != INOX_OK) return 5;
  if (inox_map_set(map, key, value) != INOX_OK) return 6;
  if (inox_set_new(&allocator, &set) != INOX_OK) return 7;
  if (inox_set_add(set, key) != INOX_OK) return 8;

  inox_debug_memory_snapshot(&stats);
  if (stats.live_refs_by_kind[INOX_REF_STRING] != 2) return 9;
  if (stats.live_refs_by_kind[INOX_REF_ARRAY] != 1) return 10;
  if (stats.live_refs_by_kind[INOX_REF_MAP] != 1) return 11;
  if (stats.live_refs_by_kind[INOX_REF_SET] != 1) return 12;

  inox_release(key);
  inox_release(value);
  inox_release(array);
  inox_release(map);
  inox_release(set);

  inox_debug_memory_snapshot(&stats);
  if (stats.live_refs_by_kind[INOX_REF_STRING] != 0) return 13;
  if (stats.live_refs_by_kind[INOX_REF_ARRAY] != 0) return 14;
  if (stats.live_refs_by_kind[INOX_REF_MAP] != 0) return 15;
  if (stats.live_refs_by_kind[INOX_REF_SET] != 0) return 16;
  if (stats.live_alloc_count != 0 || stats.live_bytes != 0) return 17;
  if (stats.alloc_count != stats.free_count) return 18;

  printf("containers ok\\n");
  return 0;
}
`
    )

    const compile = await compileRuntimeProgram(source, output, ['-DINOX_DEBUG_MEMORY=1'])

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, 'containers ok\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})
