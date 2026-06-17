import test from 'node:test'
import {
  assert,
  compileRuntimeProgram,
  compileSource,
  generateLocalhostCertificate,
  isLocalListenUnavailable,
  join,
  mkdir,
  mkdtemp,
  readFile,
  repoRoot,
  rm,
  runCommand,
  startLocalTlsServer,
  tmpdir,
  writeFile
} from './helpers/runtime-c.ts'



test('C runtime value/object/array skeleton compiles and runs', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-runtime-'))
  const source = join(dir, 'runtime-smoke.c')
  const output = join(dir, 'runtime-smoke')

  try {
    await writeFile(
      source,
      `#include <stdio.h>
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
  ccjs_value popped;
  ccjs_value missing;
  size_t array_len;

  if (ccjs_object_new(&allocator, &shape, &user) != CCJS_OK) return 1;
  if (ccjs_string_from_literal(&allocator, "Ada", 3, &name) != CCJS_OK) return 2;
  if (ccjs_object_set_known(user, 0, name) != CCJS_OK) return 3;
  if (ccjs_object_set(user, "score", 5, ccjs_number_value(42)) != CCJS_OK) return 4;
  if (ccjs_object_get(user, "score", 5, &score) != CCJS_OK) return 5;
  if (ccjs_array_new(&allocator, 1, &array) != CCJS_OK) return 6;
  if (ccjs_array_set(array, 0, ccjs_number_value(7)) != CCJS_OK) return 7;
  if (ccjs_array_get(array, 0, &first) != CCJS_OK) return 8;
  if (ccjs_array_pop(array, &popped) != CCJS_OK) return 9;
  if (ccjs_array_len(array, &array_len) != CCJS_OK) return 10;
  if (ccjs_array_pop(array, &missing) != CCJS_OK) return 11;
  if (missing.tag != CCJS_TAG_NULL) return 12;

  ccjs_string* string = (ccjs_string*)name.as.ref;
  printf("%.*s %.0f %.0f %.0f %zu\\n", (int)string->len, string->bytes, score.as.number, first.as.number, popped.as.number, array_len);
  return 0;
}
`
    )

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
      'runtime/c/src/console/console.c',
      'runtime/c/src/time/time.c',
      '-o',
      output
    ])

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, 'Ada 42 7 7 0\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('C runtime JSON parse and stringify compiles and runs', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-json-runtime-'))
  const source = join(dir, 'json-runtime.c')
  const output = join(dir, 'json-runtime')

  try {
    await writeFile(
      source,
      `#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "ccjs/allocator.h"
#include "ccjs/json.h"
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

static const ccjs_field_info cycle_fields[] = {
  { "self", 0 }
};
static const ccjs_shape cycle_shape = { 1, cycle_fields };

int main(void) {
  ccjs_allocator allocator = { 0, test_alloc, test_realloc, test_free };
  const char* source = "{\\"name\\":\\"Ada\\",\\"unicode\\":\\"\\\\u00e9 \\\\u0416 \\\\ud83d\\\\ude00\\",\\"scores\\":[3,4],\\"active\\":true}";
  ccjs_value value;
  ccjs_value name;
  ccjs_value unicode;
  ccjs_value text;
  ccjs_value ignored;
  ccjs_value cycle;

  if (ccjs_json_parse(&allocator, source, strlen(source), &value) != CCJS_OK) return 1;
  if (ccjs_object_get(value, "name", 4, &name) != CCJS_OK) return 2;
  if (ccjs_object_get(value, "unicode", 7, &unicode) != CCJS_OK) return 3;
  if (ccjs_json_stringify(&allocator, value, &text) != CCJS_OK) return 4;
  if (ccjs_json_stringify(&allocator, ccjs_undefined_value(), &ignored) != CCJS_ERR_UNSUPPORTED) return 5;
  if (ccjs_object_new(&allocator, &cycle_shape, &cycle) != CCJS_OK) return 6;
  if (ccjs_object_init_known(cycle, 0, cycle) != CCJS_OK) return 7;
  if (ccjs_json_stringify(&allocator, cycle, &ignored) != CCJS_ERR_UNSUPPORTED) return 8;
  if (ccjs_object_set_known(cycle, 0, ccjs_null_value()) != CCJS_OK) return 9;

  ccjs_string* name_string = (ccjs_string*)name.as.ref;
  ccjs_string* unicode_string = (ccjs_string*)unicode.as.ref;
  ccjs_string* text_string = (ccjs_string*)text.as.ref;
  printf("%.*s %.*s %.*s\\n", (int)name_string->len, name_string->bytes, (int)unicode_string->len, unicode_string->bytes, (int)text_string->len, text_string->bytes);

  ccjs_release(cycle);
  ccjs_release(ignored);
  ccjs_release(text);
  ccjs_release(unicode);
  ccjs_release(name);
  ccjs_release(value);
  return 0;
}
`
    )

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, 'Ada é Ж 😀 {"name":"Ada","unicode":"é Ж 😀","scores":[3,4],"active":true}\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('C runtime binary bytes value compiles and runs', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-binary-runtime-'))
  const source = join(dir, 'binary-runtime.c')
  const output = join(dir, 'binary-runtime')

  try {
    await writeFile(
      source,
      `#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include "ccjs/allocator.h"
#include "ccjs/binary.h"

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
  uint8_t data[] = { 1, 2, 3, 4 };
  ccjs_value bytes = ccjs_undefined_value();
  ccjs_value slice = ccjs_undefined_value();
  size_t len = 0;
  size_t slice_len = 0;
  uint8_t first = 0;
  uint8_t changed = 0;
  uint8_t slice_first = 0;
  uint8_t slice_second = 0;
  uint8_t slice_third = 0;

  if (ccjs_bytes_from_data(&allocator, data, 4, &bytes) != CCJS_OK) return 1;
  if (ccjs_bytes_len(bytes, &len) != CCJS_OK) return 2;
  if (ccjs_bytes_get(bytes, 0, &first) != CCJS_OK) return 3;
  if (ccjs_bytes_set(bytes, 2, 9) != CCJS_OK) return 4;
  if (ccjs_bytes_get(bytes, 2, &changed) != CCJS_OK) return 5;
  if (ccjs_bytes_slice(bytes, 1, 4, &slice) != CCJS_OK) return 6;
  if (ccjs_bytes_len(slice, &slice_len) != CCJS_OK) return 7;
  if (ccjs_bytes_get(slice, 0, &slice_first) != CCJS_OK) return 8;
  if (ccjs_bytes_get(slice, 1, &slice_second) != CCJS_OK) return 9;
  if (ccjs_bytes_get(slice, 2, &slice_third) != CCJS_OK) return 10;

  printf("%zu %u %u %zu %u %u %u\\n", len, first, changed, slice_len, slice_first, slice_second, slice_third);

  ccjs_release(slice);
  ccjs_release(bytes);
  return 0;
}
`
    )

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, '4 1 9 3 2 9 4\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('C runtime Map and Set helpers compile and run', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-collections-runtime-'))
  const source = join(dir, 'collections-runtime.c')
  const output = join(dir, 'collections-runtime')

  try {
    await writeFile(
      source,
      `#include <stdio.h>
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
  ccjs_value same_key = ccjs_undefined_value();
  ccjs_value value = ccjs_undefined_value();
  ccjs_value found = ccjs_undefined_value();
  bool has = false;
  bool removed = false;
  size_t size = 0;
  size_t set_size = 0;

  if (ccjs_map_new(&allocator, &map) != CCJS_OK) return 1;
  if (ccjs_set_new(&allocator, &set) != CCJS_OK) return 1;
  if (ccjs_string_from_literal(&allocator, "Ada", 3, &key) != CCJS_OK) return 1;
  if (ccjs_string_from_literal(&allocator, "Ada", 3, &same_key) != CCJS_OK) return 1;

  value = ccjs_number_value(7);
  if (ccjs_map_set(map, key, value) != CCJS_OK) return 1;
  if (ccjs_map_get(map, same_key, &found) != CCJS_OK) return 1;
  if (ccjs_map_has(map, same_key, &has) != CCJS_OK) return 1;
  if (ccjs_map_delete(map, same_key, &removed) != CCJS_OK) return 1;
  if (ccjs_map_size(map, &size) != CCJS_OK) return 1;
  printf("%.0f %d %d %zu\\n", found.as.number, has ? 1 : 0, removed ? 1 : 0, size);
  ccjs_release(found);
  found = ccjs_undefined_value();
  if (ccjs_map_get(map, same_key, &found) != CCJS_OK) return 1;
  if (found.tag != CCJS_TAG_NULL) return 1;
  ccjs_release(found);
  found = ccjs_undefined_value();

  if (ccjs_set_add(set, key) != CCJS_OK) return 1;
  if (ccjs_set_has(set, same_key, &has) != CCJS_OK) return 1;
  if (ccjs_set_delete(set, same_key, &removed) != CCJS_OK) return 1;
  if (ccjs_set_size(set, &size) != CCJS_OK) return 1;
  printf("%d %d %zu\\n", has ? 1 : 0, removed ? 1 : 0, size);

  for (size_t index = 0; index < 40; index += 1) {
    if (ccjs_map_set(map, ccjs_number_value((double)index), ccjs_number_value((double)(index * 10))) != CCJS_OK) return 1;
    if (ccjs_set_add(set, ccjs_number_value((double)index)) != CCJS_OK) return 1;
  }

  for (size_t index = 0; index < 20; index += 1) {
    if (ccjs_map_delete(map, ccjs_number_value((double)index), &removed) != CCJS_OK) return 1;
    if (!removed) return 1;
    if (ccjs_set_delete(set, ccjs_number_value((double)index), &removed) != CCJS_OK) return 1;
    if (!removed) return 1;
  }

  for (size_t index = 20; index < 40; index += 1) {
    if (ccjs_map_get(map, ccjs_number_value((double)index), &found) != CCJS_OK) return 1;
    if (found.tag != CCJS_TAG_NUMBER || found.as.number != (double)(index * 10)) return 1;
    if (ccjs_set_has(set, ccjs_number_value((double)index), &has) != CCJS_OK) return 1;
    if (!has) return 1;
    ccjs_release(found);
    found = ccjs_undefined_value();
  }

  if (ccjs_map_size(map, &size) != CCJS_OK) return 1;
  if (ccjs_set_size(set, &set_size) != CCJS_OK) return 1;
  printf("%zu %zu\\n", size, set_size);

  if (ccjs_map_clear(map) != CCJS_OK) return 1;
  if (ccjs_set_clear(set) != CCJS_OK) return 1;
  if (ccjs_map_get(map, ccjs_number_value(20), &found) != CCJS_OK) return 1;
  if (found.tag != CCJS_TAG_NULL) return 1;
  ccjs_release(found);
  found = ccjs_undefined_value();
  if (ccjs_set_has(set, ccjs_number_value(20), &has) != CCJS_OK) return 1;
  if (ccjs_map_size(map, &size) != CCJS_OK) return 1;
  if (ccjs_set_size(set, &set_size) != CCJS_OK) return 1;
  printf("%d %zu %zu\\n", has ? 1 : 0, size, set_size);

  ccjs_release(same_key);
  ccjs_release(key);
  ccjs_release(set);
  ccjs_release(map);

  return 0;
}
`
    )

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, '7 1 1 0\n1 1 0\n20 20\n0 0 0\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('C runtime release frees nested object and array references', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-release-'))
  const source = join(dir, 'release-smoke.c')
  const output = join(dir, 'release-smoke')

  try {
    await writeFile(
      source,
      `#include <stdio.h>
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
`
    )

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


test('C runtime ownership ABI retains getters and releases container entries', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-ownership-'))
  const source = join(dir, 'ownership-smoke.c')
  const output = join(dir, 'ownership-smoke')

  try {
    await writeFile(
      source,
      `#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include "ccjs/allocator.h"
#include "ccjs/array.h"
#include "ccjs/map.h"
#include "ccjs/object.h"
#include "ccjs/set.h"
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

static int expect_ref(ccjs_value value, uint32_t expected) {
  return value.as.ref != 0 && value.as.ref->ref_count == expected;
}

int main(void) {
  counters state = { 0, 0 };
  ccjs_allocator allocator = { &state, test_alloc, test_realloc, test_free };
  ccjs_field_info fields[] = {
    { "name", 0 }
  };
  ccjs_shape shape = { 1, fields };
  ccjs_value user;
  ccjs_value name;
  ccjs_value replacement;
  ccjs_value got;
  ccjs_value array;
  ccjs_value popped;
  ccjs_value map;
  ccjs_value key;
  ccjs_value map_value;
  ccjs_value map_next;
  ccjs_value map_found;
  ccjs_value set;
  ccjs_value set_value;
  bool removed = false;

  if (ccjs_string_from_literal(&allocator, "Ada", 3, &name) != CCJS_OK) return 1;
  if (!expect_ref(name, 1)) return 2;
  if (ccjs_string_from_literal(&allocator, "Grace", 5, &replacement) != CCJS_OK) return 3;
  if (ccjs_object_new(&allocator, &shape, &user) != CCJS_OK) return 4;
  if (ccjs_object_set_known(user, 0, name) != CCJS_OK) return 5;
  if (!expect_ref(name, 2)) return 6;
  if (ccjs_object_get_known(user, 0, &got) != CCJS_OK) return 7;
  if (!expect_ref(name, 3)) return 8;
  ccjs_release(got);
  if (!expect_ref(name, 2)) return 9;
  if (ccjs_object_set_known(user, 0, replacement) != CCJS_OK) return 10;
  if (!expect_ref(name, 1) || !expect_ref(replacement, 2)) return 11;

  if (ccjs_array_new(&allocator, 1, &array) != CCJS_OK) return 12;
  if (ccjs_array_set(array, 0, name) != CCJS_OK) return 13;
  if (!expect_ref(name, 2)) return 14;
  if (ccjs_array_pop(array, &popped) != CCJS_OK) return 15;
  if (popped.as.ref != name.as.ref || !expect_ref(name, 2)) return 16;
  ccjs_release(popped);
  if (!expect_ref(name, 1)) return 17;

  if (ccjs_map_new(&allocator, &map) != CCJS_OK) return 18;
  if (ccjs_string_from_literal(&allocator, "key", 3, &key) != CCJS_OK) return 19;
  if (ccjs_string_from_literal(&allocator, "one", 3, &map_value) != CCJS_OK) return 20;
  if (ccjs_string_from_literal(&allocator, "two", 3, &map_next) != CCJS_OK) return 21;
  if (ccjs_map_set(map, key, map_value) != CCJS_OK) return 22;
  if (!expect_ref(key, 2) || !expect_ref(map_value, 2)) return 23;
  if (ccjs_map_get(map, key, &map_found) != CCJS_OK) return 24;
  if (map_found.as.ref != map_value.as.ref || !expect_ref(map_value, 3)) return 25;
  ccjs_release(map_found);
  if (!expect_ref(map_value, 2)) return 26;
  if (ccjs_map_set(map, key, map_next) != CCJS_OK) return 27;
  if (!expect_ref(key, 2) || !expect_ref(map_value, 1) || !expect_ref(map_next, 2)) return 28;
  if (ccjs_map_delete(map, key, &removed) != CCJS_OK || !removed) return 29;
  if (!expect_ref(key, 1) || !expect_ref(map_next, 1)) return 30;

  if (ccjs_set_new(&allocator, &set) != CCJS_OK) return 31;
  if (ccjs_string_from_literal(&allocator, "member", 6, &set_value) != CCJS_OK) return 32;
  if (ccjs_set_add(set, set_value) != CCJS_OK) return 33;
  if (!expect_ref(set_value, 2)) return 34;
  if (ccjs_set_delete(set, set_value, &removed) != CCJS_OK || !removed) return 35;
  if (!expect_ref(set_value, 1)) return 36;

  ccjs_release(user);
  if (!expect_ref(replacement, 1)) return 37;
  ccjs_release(array);
  ccjs_release(map);
  ccjs_release(set);
  ccjs_release(name);
  ccjs_release(replacement);
  ccjs_release(key);
  ccjs_release(map_value);
  ccjs_release(map_next);
  ccjs_release(set_value);

  printf("%d %d %d\\n", state.allocs, state.frees, state.allocs - state.frees);
  return state.allocs == state.frees ? 0 : 38;
}
`
    )

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, '13 13 0\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('C runtime debug memory snapshots track refs promises callbacks and OOM', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-debug-memory-'))
  const source = join(dir, 'debug-memory-smoke.c')
  const output = join(dir, 'debug-memory-smoke')

  try {
    await writeFile(
      source,
      `#include <stdio.h>
#include <stdlib.h>
#include "ccjs/allocator.h"
#include "ccjs/callback.h"
#include "ccjs/debug.h"
#include "ccjs/loop.h"
#include "ccjs/object.h"
#include "ccjs/promise.h"
#include "ccjs/string.h"

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

static ccjs_status noop_callback(void* context, const ccjs_value* args, size_t arg_count, ccjs_value* out) {
  (void)context;
  (void)args;
  (void)arg_count;
  *out = ccjs_undefined_value();
  return CCJS_OK;
}

int main(void) {
  ccjs_allocator base = { 0, base_alloc, base_realloc, base_free };
  ccjs_allocator allocator = ccjs_debug_allocator(&base);
  ccjs_field_info fields[] = {
    { "name", 0 }
  };
  ccjs_shape shape = { 1, fields };
  ccjs_debug_memory_stats stats;
  ccjs_value name;
  ccjs_value user;
  ccjs_value callback;
  ccjs_loop loop;
  ccjs_promise* promise;
  ccjs_value oom_value = ccjs_undefined_value();

  ccjs_debug_memory_reset();
  ccjs_debug_memory_snapshot(&stats);
  if (stats.live_alloc_count != 0 || stats.live_bytes != 0) return 1;

  if (ccjs_string_from_literal(&allocator, "Ada", 3, &name) != CCJS_OK) return 2;
  if (ccjs_object_new(&allocator, &shape, &user) != CCJS_OK) return 3;
  if (ccjs_object_set_known(user, 0, name) != CCJS_OK) return 4;
  ccjs_debug_memory_snapshot(&stats);
  if (stats.alloc_count != 2 || stats.free_count != 0) return 5;
  if (stats.live_refs_by_kind[CCJS_REF_STRING] != 1 || stats.live_refs_by_kind[CCJS_REF_OBJECT] != 1) return 6;
  if (stats.retain_count != 1 || stats.release_count != 0) return 7;
  if (stats.live_alloc_count != 2 || stats.live_bytes == 0 || stats.peak_live_bytes < stats.live_bytes) return 8;

  ccjs_release(name);
  ccjs_release(user);
  ccjs_debug_memory_snapshot(&stats);
  if (stats.live_refs_by_kind[CCJS_REF_STRING] != 0 || stats.live_refs_by_kind[CCJS_REF_OBJECT] != 0) return 9;
  if (stats.live_alloc_count != 0 || stats.live_bytes != 0 || stats.alloc_count != stats.free_count) return 10;
  if (stats.retain_count != 1 || stats.release_count != 3) return 11;

  if (ccjs_callback_new(&allocator, noop_callback, 0, 0, &callback) != CCJS_OK) return 12;
  ccjs_debug_memory_snapshot(&stats);
  if (stats.live_callbacks != 1 || stats.live_refs_by_kind[CCJS_REF_FUNCTION] != 1) return 13;
  ccjs_release(callback);
  ccjs_debug_memory_snapshot(&stats);
  if (stats.live_callbacks != 0 || stats.live_refs_by_kind[CCJS_REF_FUNCTION] != 0) return 14;

  if (ccjs_loop_init(&loop, &allocator) != CCJS_OK) return 15;
  if (ccjs_promise_new(&loop, &promise) != CCJS_OK) return 16;
  ccjs_debug_memory_snapshot(&stats);
  if (stats.live_promises != 1) return 17;
  ccjs_promise_release(promise);
  ccjs_debug_memory_snapshot(&stats);
  if (stats.live_promises != 0 || stats.live_alloc_count != 0 || stats.alloc_count != stats.free_count) return 18;

  ccjs_debug_memory_reset();
  ccjs_debug_memory_set_oom_after(0);
  if (ccjs_string_from_literal(&allocator, "boom", 4, &oom_value) != CCJS_ERR_OOM) return 19;
  ccjs_debug_memory_snapshot(&stats);
  if (stats.oom_failure_count != 1 || stats.alloc_count != 0 || stats.live_alloc_count != 0) return 20;
  if (oom_value.tag != CCJS_TAG_UNDEFINED) return 21;
  ccjs_debug_memory_clear_oom();

  printf("%zu %zu %zu %zu\\n", stats.alloc_count, stats.free_count, stats.live_alloc_count, stats.oom_failure_count);
  return 0;
}
`
    )

    const compile = await compileRuntimeProgram(source, output, ['-DCCJS_DEBUG_MEMORY=1'])

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, '0 0 0 1\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('C runtime callback object invokes and releases context', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-callback-'))
  const source = join(dir, 'callback-smoke.c')
  const output = join(dir, 'callback-smoke')

  try {
    await writeFile(
      source,
      `#include <stdio.h>
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
`
    )

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


test('C runtime Promise microtasks settle asynchronously', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-promise-runtime-'))
  const source = join(dir, 'promise-runtime.c')
  const output = join(dir, 'promise-runtime')

  try {
    await writeFile(
      source,
      `#include <stdio.h>
#include <stdlib.h>
#include "ccjs/allocator.h"
#include "ccjs/promise.h"

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
  int count;
  int values[4];
} test_log;

static ccjs_status on_value(void* context, ccjs_value value) {
  test_log* log = (test_log*)context;
  log->values[log->count] = (int)value.as.number;
  log->count += 1;
  return CCJS_OK;
}

int main(void) {
  ccjs_allocator allocator = { 0, test_alloc, test_realloc, test_free };
  ccjs_loop loop;
  ccjs_promise* promise = 0;
  test_log log = { 0, { 0, 0, 0, 0 } };
  ccjs_value result;

  if (ccjs_loop_init(&loop, &allocator) != CCJS_OK) return 1;
  if (ccjs_promise_new(&loop, &promise) != CCJS_OK) return 2;
  if (ccjs_promise_then(promise, on_value, 0, &log, 0) != CCJS_OK) return 3;
  if (ccjs_promise_then(promise, on_value, 0, &log, 0) != CCJS_OK) return 4;
  if (log.count != 0) return 5;
  if (ccjs_promise_resolve(promise, ccjs_number_value(7)) != CCJS_OK) return 6;
  if (log.count != 0) return 7;
  if (ccjs_loop_pending_microtasks(&loop) != 2) return 8;
  if (ccjs_loop_drain_microtasks(&loop) != CCJS_OK) return 9;
  if (log.count != 2 || log.values[0] != 7 || log.values[1] != 7) return 10;
  if (ccjs_promise_get_result(promise, &result) != CCJS_OK) return 11;
  if (result.as.number != 7) return 12;
  if (ccjs_promise_then(promise, on_value, 0, &log, 0) != CCJS_OK) return 13;
  if (log.count != 2) return 14;
  if (ccjs_loop_drain_microtasks(&loop) != CCJS_OK) return 15;
  if (log.count != 3 || log.values[2] != 7) return 16;

  ccjs_release(result);
  ccjs_promise_release(promise);
  ccjs_loop_dispose(&loop);
  printf("%d %d %d %d\\n", log.count, log.values[0], log.values[1], log.values[2]);
  return 0;
}
`
    )

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, '3 7 7 7\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('C runtime Promise chains fulfillment and rejection recovery', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-promise-chain-runtime-'))
  const source = join(dir, 'promise-chain-runtime.c')
  const output = join(dir, 'promise-chain-runtime')

  try {
    await writeFile(
      source,
      `#include <stdio.h>
#include <stdlib.h>
#include "ccjs/allocator.h"
#include "ccjs/promise.h"

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
  int count;
  int finalized;
  int values[8];
} test_log;

static void push_value(test_log* log, ccjs_value value) {
  log->values[log->count] = (int)value.as.number;
  log->count += 1;
}

static ccjs_status double_value(void* context, ccjs_value value, ccjs_value* out) {
  if (value.tag != CCJS_TAG_NUMBER || out == 0) return CCJS_ERR_TYPE;

  push_value((test_log*)context, value);
  *out = ccjs_number_value(value.as.number * 2);
  return CCJS_OK;
}

static ccjs_status recover_value(void* context, ccjs_value value, ccjs_value* out) {
  if (value.tag != CCJS_TAG_NUMBER || out == 0) return CCJS_ERR_TYPE;

  push_value((test_log*)context, value);
  *out = ccjs_number_value(value.as.number + 90);
  return CCJS_OK;
}

static ccjs_status observe_value(void* context, ccjs_value value) {
  if (value.tag != CCJS_TAG_NUMBER) return CCJS_ERR_TYPE;

  push_value((test_log*)context, value);
  return CCJS_OK;
}

static void finalize_chain(void* context) {
  ((test_log*)context)->finalized += 1;
}

int main(void) {
  ccjs_allocator allocator = { 0, test_alloc, test_realloc, test_free };
  ccjs_loop loop;
  ccjs_promise* fulfilled = 0;
  ccjs_promise* doubled = 0;
  ccjs_promise* rejected = 0;
  ccjs_promise* recovered = 0;
  ccjs_promise* rejected_factory = 0;
  ccjs_promise* propagated = 0;
  ccjs_value result = ccjs_undefined_value();
  int propagated_value = 0;
  test_log log = { 0, 0, { 0, 0, 0, 0, 0, 0, 0, 0 } };

  if (ccjs_loop_init(&loop, &allocator) != CCJS_OK) return 1;

  if (ccjs_promise_new(&loop, &fulfilled) != CCJS_OK) return 2;
  if (ccjs_promise_chain(fulfilled, double_value, 0, &log, finalize_chain, &doubled) != CCJS_OK) return 3;
  if (ccjs_promise_then(doubled, observe_value, 0, &log, 0) != CCJS_OK) return 4;
  if (ccjs_promise_resolve(fulfilled, ccjs_number_value(4)) != CCJS_OK) return 5;
  if (ccjs_loop_drain_microtasks(&loop) != CCJS_OK) return 6;
  if (log.count != 2 || log.values[0] != 4 || log.values[1] != 8 || log.finalized != 1) return 7;
  if (ccjs_promise_get_result(doubled, &result) != CCJS_OK) return 8;
  if (result.as.number != 8) return 9;
  ccjs_release(result);
  result = ccjs_undefined_value();

  if (ccjs_promise_new(&loop, &rejected) != CCJS_OK) return 10;
  if (ccjs_promise_catch(rejected, recover_value, &log, finalize_chain, &recovered) != CCJS_OK) return 11;
  if (ccjs_promise_then(recovered, observe_value, 0, &log, 0) != CCJS_OK) return 12;
  if (ccjs_promise_reject(rejected, ccjs_number_value(5)) != CCJS_OK) return 13;
  if (ccjs_loop_drain_microtasks(&loop) != CCJS_OK) return 14;
  if (log.count != 4 || log.values[2] != 5 || log.values[3] != 95 || log.finalized != 2) return 15;
  if (ccjs_promise_get_result(recovered, &result) != CCJS_OK) return 16;
  if (result.as.number != 95) return 17;
  ccjs_release(result);
  result = ccjs_undefined_value();

  if (ccjs_promise_rejected(&loop, ccjs_number_value(6), &rejected_factory) != CCJS_OK) return 18;
  if (!ccjs_promise_is_unhandled_rejection(rejected_factory)) return 19;
  if (ccjs_promise_chain(rejected_factory, 0, 0, &log, finalize_chain, &propagated) != CCJS_OK) return 20;
  if (ccjs_promise_is_unhandled_rejection(rejected_factory)) return 21;
  if (ccjs_loop_drain_microtasks(&loop) != CCJS_OK) return 22;
  if (ccjs_promise_get_state(propagated) != CCJS_PROMISE_REJECTED) return 23;
  if (!ccjs_promise_is_unhandled_rejection(propagated)) return 24;
  if (ccjs_promise_get_result(propagated, &result) != CCJS_OK) return 25;
  if (ccjs_promise_is_unhandled_rejection(propagated)) return 26;
  if (result.as.number != 6) return 27;
  propagated_value = (int)result.as.number;
  ccjs_release(result);
  result = ccjs_undefined_value();
  if (log.finalized != 3) return 28;

  ccjs_promise_release(propagated);
  ccjs_promise_release(rejected_factory);
  ccjs_promise_release(recovered);
  ccjs_promise_release(rejected);
  ccjs_promise_release(doubled);
  ccjs_promise_release(fulfilled);
  ccjs_loop_dispose(&loop);

  printf("%d %d %d %d %d %d %d\\n", log.count, log.values[0], log.values[1], log.values[2], log.values[3], log.finalized, propagated_value);
  return 0;
}
`
    )

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, '4 4 8 5 95 3 6\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C reports unhandled Promise rejections', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-unhandled-promise-'))
  const source = join(dir, 'unhandled-promise.c')
  const output = join(dir, 'unhandled-promise')

  try {
    const result = compileSource(
      `Promise.reject('boom')

`,
      {
        target: 'c'
      }
    )

    await writeFile(source, result.code)

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 1)
    assert.equal(run.stdout, '')
    assert.equal(run.stderr, 'Unhandled Promise rejection\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('C runtime weak references upgrade and clear after target release', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-weak-runtime-'))
  const source = join(dir, 'weak-runtime-smoke.c')
  const output = join(dir, 'weak-runtime-smoke')

  try {
    await writeFile(
      source,
      `#include <stdio.h>
#include <stdlib.h>
#include "ccjs/allocator.h"
#include "ccjs/debug.h"
#include "ccjs/string.h"
#include "ccjs/weak.h"

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

static int expect_ref(ccjs_value value, uint32_t expected) {
  return value.as.ref != 0 && value.as.ref->ref_count == expected;
}

int main(void) {
  ccjs_allocator base = { 0, base_alloc, base_realloc, base_free };
  ccjs_allocator allocator = ccjs_debug_allocator(&base);
  ccjs_debug_memory_stats stats;
  ccjs_value name;
  ccjs_value upgraded;
  ccjs_weak_ref weak = ccjs_weak_null();
  ccjs_weak_ref retained = ccjs_weak_null();

  ccjs_debug_memory_reset();

  if (!ccjs_weak_is_empty(weak)) return 1;
  if (ccjs_string_from_literal(&allocator, "Ada", 3, &name) != CCJS_OK) return 2;
  if (ccjs_weak_from_value(name, &weak) != CCJS_OK) return 3;
  if (ccjs_weak_is_empty(weak) || weak.cell->weak_count != 1) return 4;
  if (!expect_ref(name, 1)) return 5;

  retained = weak;
  ccjs_weak_retain(retained);
  if (retained.cell->weak_count != 2) return 6;
  ccjs_weak_release(weak);
  weak = ccjs_weak_null();
  if (retained.cell->weak_count != 1) return 7;

  if (ccjs_weak_upgrade(retained, &upgraded) != CCJS_OK) return 8;
  if (upgraded.tag != CCJS_TAG_STRING || upgraded.as.ref != name.as.ref || !expect_ref(name, 2)) return 9;
  ccjs_release(upgraded);
  if (!expect_ref(name, 1)) return 10;

  ccjs_debug_memory_snapshot(&stats);
  if (stats.live_refs_by_kind[CCJS_REF_STRING] != 1 || stats.live_weak_cells != 1 || stats.live_alloc_count != 2) return 11;

  ccjs_release(name);
  ccjs_debug_memory_snapshot(&stats);
  if (stats.live_refs_by_kind[CCJS_REF_STRING] != 0 || stats.live_weak_cells != 1 || stats.live_alloc_count != 1) return 12;

  if (ccjs_weak_upgrade(retained, &upgraded) != CCJS_OK) return 13;
  if (upgraded.tag != CCJS_TAG_NULL) return 14;

  ccjs_weak_release(retained);
  retained = ccjs_weak_null();
  ccjs_debug_memory_snapshot(&stats);
  if (stats.live_weak_cells != 0 || stats.live_alloc_count != 0 || stats.alloc_count != stats.free_count) return 15;

  printf("weak ok\\n");
  return 0;
}
`
    )

    const compile = await compileRuntimeProgram(source, output, ['-DCCJS_ENABLE_WEAK=1', '-DCCJS_DEBUG_MEMORY=1'])

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, 'weak ok\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('C runtime weak object fields release and preserve old value on OOM', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-weak-object-runtime-'))
  const source = join(dir, 'weak-object-runtime-smoke.c')
  const output = join(dir, 'weak-object-runtime-smoke')

  try {
    await writeFile(
      source,
      `#include <stdio.h>
#include <stdlib.h>
#include "ccjs/allocator.h"
#include "ccjs/debug.h"
#include "ccjs/object.h"
#include "ccjs/string.h"
#include "ccjs/weak.h"

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

static int expect_value_ref(ccjs_value value, ccjs_value expected) {
  return value.tag == expected.tag && value.as.ref == expected.as.ref;
}

int main(void) {
  ccjs_allocator base = { 0, base_alloc, base_realloc, base_free };
  ccjs_allocator allocator = ccjs_debug_allocator(&base);
  static const ccjs_field_info fields[] = {
    { "parent", CCJS_FIELD_WEAK }
  };
  static const ccjs_shape shape = { 1, fields };
  ccjs_debug_memory_stats stats;
  ccjs_value old_name = ccjs_undefined_value();
  ccjs_value new_name = ccjs_undefined_value();
  ccjs_value holder = ccjs_undefined_value();
  ccjs_value out = ccjs_undefined_value();

  ccjs_debug_memory_reset();

  if (ccjs_string_from_literal(&allocator, "old", 3, &old_name) != CCJS_OK) return 1;
  if (ccjs_string_from_literal(&allocator, "new", 3, &new_name) != CCJS_OK) return 2;
  if (ccjs_object_new(&allocator, &shape, &holder) != CCJS_OK) return 3;

  if (ccjs_object_init_known(holder, 0, old_name) != CCJS_OK) return 4;
  if (old_name.as.ref->weak_cell == 0 || old_name.as.ref->weak_cell->weak_count != 1) return 5;
  ccjs_debug_memory_snapshot(&stats);
  if (stats.live_weak_cells != 1) return 6;

  ccjs_debug_memory_set_oom_after(0);
  if (ccjs_object_set_known(holder, 0, new_name) != CCJS_ERR_OOM) return 7;
  ccjs_debug_memory_clear_oom();
  if (old_name.as.ref->weak_cell == 0 || old_name.as.ref->weak_cell->weak_count != 1) return 8;
  if (new_name.as.ref->weak_cell != 0) return 9;
  if (ccjs_object_get_known(holder, 0, &out) != CCJS_OK) return 10;
  if (!expect_value_ref(out, old_name)) return 11;
  ccjs_release(out);
  out = ccjs_undefined_value();
  ccjs_debug_memory_snapshot(&stats);
  if (stats.oom_failure_count != 1 || stats.live_weak_cells != 1) return 12;

  if (ccjs_object_set_known(holder, 0, new_name) != CCJS_OK) return 13;
  if (old_name.as.ref->weak_cell == 0 || old_name.as.ref->weak_cell->weak_count != 0) return 14;
  if (new_name.as.ref->weak_cell == 0 || new_name.as.ref->weak_cell->weak_count != 1) return 15;
  if (ccjs_object_get_known(holder, 0, &out) != CCJS_OK) return 16;
  if (!expect_value_ref(out, new_name)) return 17;
  ccjs_release(out);
  out = ccjs_undefined_value();

  ccjs_release(holder);
  holder = ccjs_undefined_value();
  if (new_name.as.ref->weak_cell == 0 || new_name.as.ref->weak_cell->weak_count != 0) return 18;

  ccjs_release(old_name);
  old_name = ccjs_undefined_value();
  ccjs_debug_memory_snapshot(&stats);
  if (stats.live_weak_cells != 1) return 19;

  ccjs_release(new_name);
  new_name = ccjs_undefined_value();
  ccjs_debug_memory_snapshot(&stats);
  if (stats.live_weak_cells != 0 || stats.live_alloc_count != 0 || stats.alloc_count != stats.free_count) return 20;

  printf("weak object ok\\n");
  return 0;
}
`
    )

    const compile = await compileRuntimeProgram(source, output, ['-DCCJS_ENABLE_WEAK=1', '-DCCJS_DEBUG_MEMORY=1'])

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, 'weak object ok\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C weak object fields compile and run with weak runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-generated-weak-'))
  const source = join(dir, 'generated-weak.c')
  const output = join(dir, 'generated-weak')

  try {
    const compiled = compileSource(`type Parent = {
  name: string
}

type Child = {
  weak parent: Parent | null
}

const parent: Parent = { name: 'Ada' }
const child: Child = { parent }
const maybe = child.parent

if (maybe != null) {
  console.log('alive')
}
`)

    assert.equal(compiled.ir.runtimeRequirements.includes('weak-references'), true)
    assert.match(compiled.code, /CCJS_FIELD_WEAK/)

    await writeFile(source, compiled.code)

    const compile = await compileRuntimeProgram(source, output, ['-DCCJS_ENABLE_WEAK=1'])

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, 'alive\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C weak object field access narrows and optional-chains safely', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-generated-weak-access-'))
  const source = join(dir, 'generated-weak-access.c')
  const output = join(dir, 'generated-weak-access')

  try {
    const compiled = compileSource(
      `type Parent = {
  name: string
}

type Child = {
  weak parent: Parent | null
}

function makeDetachedChild(): Child {
  const parent: Parent = { name: 'Detached' }
  const child: Child = { parent }
  return child
}

const parent: Parent = { name: 'Ada' }
const child: Child = { parent }
const maybe = child.parent

if (maybe != null) {
  console.log(maybe.name)
}

console.log(child.parent?.name ?? 'missing')

const detached = makeDetachedChild()
console.log(detached.parent?.name ?? 'gone')
`,
      {
        target: 'c'
      }
    )

    assert.equal(compiled.ir.runtimeRequirements.includes('weak-references'), true)
    assert.match(compiled.code, /CCJS_FIELD_WEAK/)

    await writeFile(source, compiled.code)

    const compile = await compileRuntimeProgram(source, output, ['-DCCJS_ENABLE_WEAK=1'])

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, 'Ada\nAda\ngone\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C simple classes compile and run with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-class-codegen-'))
  const source = join(dir, 'class-codegen.c')
  const output = join(dir, 'class-codegen')

  try {
    const result = compileSource(
      `class User {
  readonly id: number
  name: string

  constructor(id: number, name: string) {
    this.id = id
    this.name = name
  }

  rename(next: string): void {
    this.name = next
  }

  score(extra: number): number {
    return this.id + extra
  }

  total(extra: number): number {
    return this.score(extra)
  }

  label(): string {
    return this.name
  }
}

const user = new User(1, 'Ada')
user.rename('Grace')
const value = user.total(2)
const name = user.label()
console.log(value, name)

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
    assert.equal(run.stdout, '3 Grace\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C async await over settled promises compiles and runs', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-await-codegen-'))
  const source = join(dir, 'await-codegen.c')
  const output = join(dir, 'await-codegen')

  try {
    const result = compileSource(
      `import fs from 'node:fs'

async function getValue(): Promise<number> {
  return Promise.resolve(3)
}

async function getText(): Promise<string> {
  return Promise.resolve('done')
}

function getPromise(): Promise<number> {
  return Promise.resolve(4)
}

function failPromise(): Promise<string> {
  return Promise.reject('plain fail')
}

async function loadText(): Promise<string> {
  return fs.promises.readFile('/tmp/ccjs-async-load.txt', 'utf8')
}

async function failText(): Promise<string> {
  throw 'async fail'
}

async function failNumber(): Promise<number> {
  throw 'async number fail'
}

const promise = Promise.resolve(2)
const value = await promise
const asyncValue = await getValue()
const asyncPromiseValue = getValue()
const asyncTextPromiseValue = getText()
const asyncRejectedPromiseValue = failNumber()
const asyncRejectedTextPromiseValue = failText()
const text = await getText()
const plainPromiseValue = await getPromise()
const doubled = Promise.resolve(4).then(value => value * 2)
const blockDoubled = Promise.resolve(5).then(value => {
  return value * 3
})
const multiDoubled = Promise.resolve(6).then(value => {
  const doubled = value * 2

  return doubled
})
const branchDoubled = Promise.resolve(7).then(value => {
  if (value > 5) {
    return value * 2
  }

  return value
})
const switchDoubled = Promise.resolve(2).then(value => {
  switch (value) {
    case 2:
      return value * 10
    default:
      return 0
  }

  return value
})
const failedNumber: Promise<number> = Promise.reject('number fail')
const recoveredNumber = failedNumber.catch(error => 95)
const blockRecoveredNumber = failedNumber.catch(error => {
  return 96
})
const multiRecoveredNumber = failedNumber.catch(error => {
  const recovered = 97

  return recovered
})
const branchRecoveredNumber = failedNumber.catch(error => {
  if (1 === 1) {
    return 98
  }

  return 0
})
const chainedNumber = Promise.resolve(1)
  .then(value => value + 1)
  .then(value => value + 1)
await fs.promises.writeFile('/tmp/ccjs-async-load.txt', 'loaded')
const loadedTextPromise = loadText()
console.log(await Promise.resolve('ok'))
console.log(value)
console.log(asyncValue)
console.log(await asyncPromiseValue)
console.log(await asyncTextPromiseValue)
console.log(text)
console.log(plainPromiseValue)
console.log(await doubled)
console.log(await blockDoubled)
console.log(await multiDoubled)
console.log(await branchDoubled)
console.log(await switchDoubled)
console.log(await recoveredNumber)
console.log(await blockRecoveredNumber)
console.log(await multiRecoveredNumber)
console.log(await branchRecoveredNumber)
console.log(await chainedNumber)
console.log(await loadedTextPromise)

try {
  await Promise.reject('fail')
} catch (error) {
  console.log(error)
}

try {
  await failPromise()
} catch (error) {
  console.log(error)
}

const errorPromise = Promise.reject(new Error('stored error'))

try {
  await errorPromise
} catch (error) {
  console.log(error.name, error.message)
}

try {
  const caught = await failText()
  console.log(caught)
} catch (error) {
  console.log(error)
}

try {
  await asyncRejectedPromiseValue
} catch (error) {
  console.log(error)
}

try {
  await asyncRejectedTextPromiseValue
} catch (error) {
  console.log(error)
}

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
    assert.equal(
      run.stdout,
      'ok\n2\n3\n3\ndone\ndone\n4\n8\n15\n12\n14\n20\n95\n96\n97\n98\n3\nloaded\nfail\nplain fail\nError stored error\nasync fail\nasync number fail\nasync fail\n'
    )
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C captured Promise callbacks compile and run', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-promise-callback-capture-'))
  const source = join(dir, 'promise-callback-capture.c')
  const output = join(dir, 'promise-callback-capture')

  try {
    const result = compileSource(
      `type User = {
  name: string
}

const extra = 5
const ok = true
const literal = 'literal'
const user: User = { name: 'captured' }
const label = user.name
const raw = Promise.resolve(1).then(value => {
  console.log(literal)

  return value + extra
})
console.log(await raw)

const added = Promise.resolve(4).then(value => value + extra)
console.log(await added)

const logged = Promise.resolve(6).then(value => {
  console.log(label)

  return value + extra
})
console.log(await logged)

const objectLogged = Promise.resolve(7).then(value => {
  if (ok) {
    console.log(user.name)

    return value + extra
  }

  return value
})
console.log(await objectLogged)

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
    assert.equal(run.stdout, 'literal\n6\n9\ncaptured\n11\ncaptured\n12\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C Promise callbacks with try catch finally compile and run', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-promise-callback-try-'))
  const source = join(dir, 'promise-callback-try.c')
  const output = join(dir, 'promise-callback-try')

  try {
    const result = compileSource(
      `const handled = Promise.resolve(3).then(value => {
  try {
    if (value > 2) {
      throw 'large'
    }

    return value
  } catch (error) {
    console.log(error)

    return 7
  } finally {
    console.log('chain finally')
  }

  return 0
})
const finalized = Promise.resolve(2).then(value => {
  try {
    return value * 2
  } finally {
    console.log('return finally')
  }

  return 0
})

console.log(await handled, await finalized)

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
    assert.equal(run.stdout, 'large\nchain finally\nreturn finally\n7 4\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C async task frame over awaited Promise.resolve compiles and runs', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-async-task-frame-'))
  const source = join(dir, 'async-task-frame.c')
  const output = join(dir, 'async-task-frame')

  try {
    const result = compileSource(
      `async function compute(): Promise<number> {
  const value = await Promise.resolve(2)

  return Promise.resolve(value + 3)
}

const promise = compute()
console.log(await compute())
console.log(await promise)

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
    assert.equal(run.stdout, '5\n5\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C async task frame preserves parameters across resume', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-async-task-frame-params-'))
  const source = join(dir, 'async-task-frame-params.c')
  const output = join(dir, 'async-task-frame-params')

  try {
    const result = compileSource(
      `async function addLater(input: number, delta: number): Promise<number> {
  const value = await Promise.resolve(input)

  return Promise.resolve(value + delta)
}

console.log(await addLater(2, 4))
const promise = addLater(5, 6)
console.log(await promise)

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
    assert.equal(run.stdout, '6\n11\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C async task frame awaits local Promise variables', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-async-task-frame-local-promise-'))
  const source = join(dir, 'async-task-frame-local-promise.c')
  const output = join(dir, 'async-task-frame-local-promise')

  try {
    const result = compileSource(
      `async function addLater(input: number, delta: number): Promise<number> {
  const pending = Promise.resolve(input)
  const value = await pending

  return Promise.resolve(value + delta)
}

console.log(await addLater(2, 4))
const promise = addLater(5, 6)
console.log(await promise)

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
    assert.equal(run.stdout, '6\n11\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C boolean async task frame compiles and runs', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-async-task-frame-bool-'))
  const source = join(dir, 'async-task-frame-bool.c')
  const output = join(dir, 'async-task-frame-bool')

  try {
    const result = compileSource(
      `async function flip(flag: boolean): Promise<boolean> {
  const value = await Promise.resolve(flag)

  return Promise.resolve(!value)
}

console.log(await flip(false))
console.log(await flip(true))

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
    assert.equal(run.stdout, '1\n0\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C async task frame awaits local Promise chains', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-async-task-frame-chain-'))
  const source = join(dir, 'async-task-frame-chain.c')
  const output = join(dir, 'async-task-frame-chain')

  try {
    const result = compileSource(
      `async function addChain(input: number, delta: number): Promise<number> {
  const pending = Promise.resolve(input).then(value => value + 2)
  const value = await pending

  return Promise.resolve(value + delta)
}

console.log(await addChain(2, 4))
const promise = addChain(5, 6)
console.log(await promise)

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
    assert.equal(run.stdout, '8\n13\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C async task frame awaits captured local Promise chains', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-async-task-frame-captured-chain-'))
  const source = join(dir, 'async-task-frame-captured-chain.c')
  const output = join(dir, 'async-task-frame-captured-chain')

  try {
    const result = compileSource(
      `async function addChain(input: number, delta: number): Promise<number> {
  const pending = Promise.resolve(input).then(value => value + delta)
  const value = await pending

  return value + delta
}

console.log(await addChain(2, 4))
const promise = addChain(5, 6)
console.log(await promise)

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
    assert.equal(run.stdout, '10\n17\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C async task frame direct return values compile and run', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-async-task-frame-direct-return-'))
  const source = join(dir, 'async-task-frame-direct-return.c')
  const output = join(dir, 'async-task-frame-direct-return')

  try {
    const result = compileSource(
      `async function addLater(input: number, delta: number): Promise<number> {
  const value = await Promise.resolve(input)

  return value + delta
}

console.log(await addLater(2, 4))
const promise = addLater(5, 6)
console.log(await promise)

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
    assert.equal(run.stdout, '6\n11\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C async task frame direct managed return values compile and run', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-async-task-frame-direct-managed-return-'))
  const source = join(dir, 'async-task-frame-direct-managed-return.c')
  const output = join(dir, 'async-task-frame-direct-managed-return')

  try {
    const result = compileSource(
      `async function work(): Promise<Buffer> {
  try {
    try {
      const value: number = await Promise.resolve(3)
      return Buffer.from('ok', 'utf8')
    } finally {
      console.log('inner')
    }
  } finally {
    console.log('outer')
  }
}

const result: Buffer = await work()
console.log(result.toString())

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
    assert.equal(run.stdout, 'inner\nouter\nok\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C multiple-await async task frame compiles and runs', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-async-task-frame-multi-await-'))
  const source = join(dir, 'async-task-frame-multi-await.c')
  const output = join(dir, 'async-task-frame-multi-await')

  try {
    const result = compileSource(
      `async function addTwo(input: number, delta: number): Promise<number> {
  const first = await Promise.resolve(input)
  const second = await Promise.resolve(first + delta)

  return first + second
}

console.log(await addTwo(2, 4))
const promise = addTwo(5, 6)
console.log(await promise)

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
    assert.equal(run.stdout, '8\n16\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C async task frame awaits local async tasks and plain Promise helpers', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-async-task-frame-promise-sources-'))
  const source = join(dir, 'async-task-frame-promise-sources.c')
  const output = join(dir, 'async-task-frame-promise-sources')

  try {
    const result = compileSource(
      `async function immediate(input: number): Promise<number> {
  return input
}

function same(input: number): Promise<number> {
  return Promise.resolve(input)
}

async function addLater(input: number): Promise<number> {
  const value = await Promise.resolve(input)

  return value + 1
}

async function compute(input: number): Promise<number> {
  const zero = await immediate(input)
  const first = await same(zero)
  const second = await addLater(first)
  const third = await same(second)

  return third + 1
}

console.log(await compute(2))
const promise = compute(5)
console.log(await promise)

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
    assert.equal(run.stdout, '4\n7\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C async task frame awaits managed immediate async helpers', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-async-task-frame-managed-helper-'))
  const input = join(dir, 'input.bin')
  const source = join(dir, 'async-task-frame-managed-helper.c')
  const output = join(dir, 'async-task-frame-managed-helper')

  try {
    await writeFile(input, Buffer.from([7, 8, 9]))

    const result = compileSource(
      `import fs from 'node:fs'

async function sameText(input: string): Promise<string> {
  return input
}

async function sameBytes(input: Buffer): Promise<Buffer> {
  return input
}

async function copyText(input: string, path: string): Promise<string> {
  const text = await sameText(input)
  const bytes: Buffer = await fs.promises.readFile(path)
  const copied: Buffer = await sameBytes(bytes)

  return text
}

console.log(await copyText('managed', ${JSON.stringify(input)}))

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
    assert.equal(run.stdout, 'managed\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C async task frame rejected awaits reject returned promises', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-async-task-frame-reject-'))
  const source = join(dir, 'async-task-frame-reject.c')
  const output = join(dir, 'async-task-frame-reject')

  try {
    const result = compileSource(
      `function failNumber(): Promise<number> {
  return Promise.reject('task fail')
}

async function compute(): Promise<number> {
  const value = await failNumber()
  const next = await Promise.resolve(value)

  return next
}

async function failDirect(): Promise<number> {
  const value: number = await Promise.reject('direct fail')

  return value
}

try {
  console.log(await compute())
} catch (error) {
  console.log(error)
}

try {
  console.log(await failDirect())
} catch (error) {
  console.log(error)
}

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
    assert.equal(run.stdout, 'task fail\ndirect fail\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C async task frame try catch finally around awaited promises', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-async-task-frame-try-'))
  const source = join(dir, 'async-task-frame-try.c')
  const output = join(dir, 'async-task-frame-try')

  try {
    const result = compileSource(
      `async function recover(): Promise<number> {
  try {
    const value: number = await Promise.reject('inner fail')

    return value
  } catch (error) {
    console.log('caught', error)

    return 7
  } finally {
    console.log('finally recover')
  }
}

async function propagate(): Promise<number> {
  try {
    const value: number = await Promise.reject('outer fail')

    return value
  } finally {
    console.log('finally propagate')
  }
}

console.log(await recover())

try {
  console.log(await propagate())
} catch (error) {
  console.log('outer', error)
}

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
    assert.equal(run.stdout, 'caught inner fail\nfinally recover\n7\nfinally propagate\nouter outer fail\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C async task frame string prefix locals compile and run', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-async-task-frame-prefix-string-'))
  const source = join(dir, 'async-task-frame-prefix-string.c')
  const output = join(dir, 'async-task-frame-prefix-string')

  try {
    const result = compileSource(
      `async function work(count: number): Promise<string> {
  try {
    const prefix: string = String(count)
    try {
      const value: number = await Promise.resolve(3)
    } finally {
      console.log(prefix)
    }
    console.log(prefix)
    return prefix
  } finally {
    console.log(count)
  }
}

async function literal(): Promise<string> {
  try {
    const prefix: string = 'Ada'
    try {
      const value: number = await Promise.resolve(3)
    } finally {
      console.log(prefix)
    }
    console.log(prefix)
    return prefix
  } finally {
    console.log('outer')
  }
}

console.log(await work(4))
console.log(await literal())

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
    assert.equal(run.stdout, '4\n4\n4\n4\nAda\nAda\nouter\nAda\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C async task frame array prefix locals compile and run', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-async-task-frame-prefix-array-'))
  const source = join(dir, 'async-task-frame-prefix-array.c')
  const output = join(dir, 'async-task-frame-prefix-array')

  try {
    const result = compileSource(
      `async function work(): Promise<Array<number>> {
  try {
    const prefix: number[] = [2, 4]
    try {
      const value: number = await Promise.resolve(3)
    } finally {
      console.log(prefix.length)
    }
    console.log(prefix[1])
    return prefix
  } finally {
    console.log('outer')
  }
}

const result: number[] = await work()
console.log(result[0], result[1])

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
    assert.equal(run.stdout, '2\n4\nouter\n2 4\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C async task frame bytes prefix locals compile and run', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-async-task-frame-prefix-bytes-'))
  const source = join(dir, 'async-task-frame-prefix-bytes.c')
  const output = join(dir, 'async-task-frame-prefix-bytes')

  try {
    const result = compileSource(
      `async function work(): Promise<Buffer> {
  try {
    const prefix: Buffer = Buffer.from('abc', 'utf8')
    try {
      const value: number = await Promise.resolve(3)
    } finally {
      console.log(prefix.length)
    }
    console.log(prefix[1])
    return prefix
  } finally {
    console.log('outer')
  }
}

const result: Buffer = await work()
const text = result.toString()
console.log(result[0], result[1], text)

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
    assert.equal(run.stdout, '3\n98\nouter\n97 98 abc\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C async task frame inner body prefix locals compile and run', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-async-task-frame-inner-prefix-local-'))
  const source = join(dir, 'async-task-frame-inner-prefix-local.c')
  const output = join(dir, 'async-task-frame-inner-prefix-local')

  try {
    const result = compileSource(
      `async function work(): Promise<Buffer> {
  try {
    try {
      const prefix: Buffer = Buffer.from('ok', 'utf8')
      const pending: Promise<number> = Promise.resolve(prefix.length)
      const value: number = await pending
      return prefix
    } finally {
      console.log('inner')
    }
  } finally {
    console.log('outer')
  }
}

const result: Buffer = await work()
console.log(result.length, result.toString())

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
    assert.equal(run.stdout, 'inner\nouter\n2 ok\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C async task frame post await inner managed locals compile and run', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-async-task-frame-inner-managed-local-'))
  const source = join(dir, 'async-task-frame-inner-managed-local.c')
  const output = join(dir, 'async-task-frame-inner-managed-local')

  try {
    const result = compileSource(
      `async function work(): Promise<Buffer> {
  try {
    try {
      const value: number = await Promise.resolve(3)
      const suffix: Buffer = Buffer.from('ok', 'utf8')
      console.log(value)
      return suffix
    } finally {
      console.log('inner')
    }
  } finally {
    console.log('outer')
  }
}

const result: Buffer = await work()
console.log(result.toString())

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
    assert.equal(run.stdout, '3\ninner\nouter\nok\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C async task frame post await inner scalar locals compile and run', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-async-task-frame-inner-scalar-local-'))
  const source = join(dir, 'async-task-frame-inner-scalar-local.c')
  const output = join(dir, 'async-task-frame-inner-scalar-local')

  try {
    const result = compileSource(
      `async function work(): Promise<number> {
  try {
    try {
      const value: number = await Promise.resolve(3)
      const total: number = value + 4
      console.log(total)
      return total
    } finally {
      console.log('inner')
    }
  } finally {
    console.log('outer')
  }
}

console.log(await work())

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
    assert.equal(run.stdout, '7\ninner\nouter\n7\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C async task frame post await locals before post-nested returns compile and run', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-async-task-frame-inner-local-before-post-return-'))
  const source = join(dir, 'async-task-frame-inner-local-before-post-return.c')
  const output = join(dir, 'async-task-frame-inner-local-before-post-return')

  try {
    const result = compileSource(
      `async function work(): Promise<number> {
  try {
    try {
      const value: number = await Promise.resolve(3)
      const total: number = value + 4
      console.log(total)
    } finally {
      console.log('inner')
    }
    console.log('after')
    return 9
  } finally {
    console.log('outer')
  }
}

console.log(await work())

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
    assert.equal(run.stdout, '7\ninner\nafter\nouter\n9\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C async task frame post await managed locals before post-nested returns compile and run', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-async-task-frame-inner-managed-local-before-post-return-'))
  const source = join(dir, 'async-task-frame-inner-managed-local-before-post-return.c')
  const output = join(dir, 'async-task-frame-inner-managed-local-before-post-return')

  try {
    const result = compileSource(
      `async function work(): Promise<number> {
  try {
    try {
      const value: number = await Promise.resolve(3)
      const scratch: Buffer = Buffer.from('ok', 'utf8')
      console.log(value, scratch.length)
    } finally {
      console.log('inner')
    }
    console.log('after')
    return 9
  } finally {
    console.log('outer')
  }
}

console.log(await work())

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
    assert.equal(run.stdout, '3 2\ninner\nafter\nouter\n9\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C async task frame object prefix locals compile and run', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-async-task-frame-prefix-object-'))
  const source = join(dir, 'async-task-frame-prefix-object.c')
  const output = join(dir, 'async-task-frame-prefix-object')

  try {
    const result = compileSource(
      `type User = {
  name: string,
  score: number
}

async function work(): Promise<User> {
  try {
    const prefix: User = { name: 'Ada', score: 7 }
    try {
      const value: number = await Promise.resolve(3)
    } finally {
      console.log(prefix.name)
    }
    console.log(prefix.score)
    return prefix
  } finally {
    console.log('outer')
  }
}

const result: User = await work()
console.log(result.name, result.score)

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
    assert.equal(run.stdout, 'Ada\n7\nouter\nAda 7\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C async task frame Map prefix locals compile and run', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-async-task-frame-prefix-map-'))
  const source = join(dir, 'async-task-frame-prefix-map.c')
  const output = join(dir, 'async-task-frame-prefix-map')

  try {
    const result = compileSource(
      `async function work(): Promise<Map<string, number>> {
  try {
    const prefix: Map<string, number> = new Map([['Ada', 7], ['Grace', 9]])
    try {
      const value: number = await Promise.resolve(3)
    } finally {
      console.log(prefix.get('Ada') ?? 0)
    }
    console.log(prefix.get('Grace') ?? 0, prefix.size)
    return prefix
  } finally {
    console.log('outer')
  }
}

const result: Map<string, number> = await work()
console.log(result.get('Grace') ?? 0, result.size)

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
    assert.equal(run.stdout, '7\n9 2\nouter\n9 2\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C async task frame Set prefix locals compile and run', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-async-task-frame-prefix-set-'))
  const source = join(dir, 'async-task-frame-prefix-set.c')
  const output = join(dir, 'async-task-frame-prefix-set')

  try {
    const result = compileSource(
      `async function work(): Promise<Set<string>> {
  try {
    const prefix: Set<string> = new Set(['Ada', 'Grace'])
    try {
      const value: number = await Promise.resolve(3)
    } finally {
      console.log(prefix.has('Ada'))
    }
    console.log(prefix.has('Grace'), prefix.size)
    return prefix
  } finally {
    console.log('outer')
  }
}

const result: Set<string> = await work()
console.log(result.has('Grace'), result.size)

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
    assert.equal(run.stdout, '1\n1 2\nouter\n1 2\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C async task frame post try managed locals compile and run', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-async-task-frame-post-managed-local-'))
  const source = join(dir, 'async-task-frame-post-managed-local.c')
  const output = join(dir, 'async-task-frame-post-managed-local')

  try {
    const result = compileSource(
      `async function work(): Promise<Buffer> {
  try {
    try {
      const value: number = await Promise.resolve(3)
    } finally {
      console.log('inner')
    }
    const suffix: Buffer = Buffer.from('ok', 'utf8')
    console.log(suffix.length)
    return suffix
  } finally {
    console.log('outer')
  }
}

const result: Buffer = await work()
console.log(result.toString())

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
    assert.equal(run.stdout, 'inner\n2\nouter\nok\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C async task frame catch managed locals compile and run', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-async-task-frame-catch-managed-local-'))
  const source = join(dir, 'async-task-frame-catch-managed-local.c')
  const output = join(dir, 'async-task-frame-catch-managed-local')

  try {
    const result = compileSource(
      `async function work(): Promise<Buffer> {
  try {
    try {
      const value: Buffer = await Promise.reject('inner')
      return value
    } catch (error) {
      const suffix: Buffer = Buffer.from('ok', 'utf8')
      console.log(error)
      console.log(suffix.length)
      return suffix
    } finally {
      console.log('inner finally')
    }
  } finally {
    console.log('outer')
  }
}

const result: Buffer = await work()
console.log(result.toString())

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
    assert.equal(run.stdout, 'inner\n2\ninner finally\nouter\nok\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C async task frame catch direct managed returns compile and run', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-async-task-frame-catch-direct-managed-return-'))
  const source = join(dir, 'async-task-frame-catch-direct-managed-return.c')
  const output = join(dir, 'async-task-frame-catch-direct-managed-return')

  try {
    const result = compileSource(
      `async function work(): Promise<Buffer> {
  try {
    try {
      const value: Buffer = await Promise.reject('inner')
      return value
    } catch (error) {
      console.log(error)
      return Buffer.from('ok', 'utf8')
    } finally {
      console.log('inner finally')
    }
  } finally {
    console.log('outer')
  }
}

const result: Buffer = await work()
console.log(result.toString())

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
    assert.equal(run.stdout, 'inner\ninner finally\nouter\nok\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C nested async finalizer throw fallback compiles and runs', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-async-finalizer-throw-fallback-'))
  const source = join(dir, 'async-finalizer-throw-fallback.c')
  const output = join(dir, 'async-finalizer-throw-fallback')

  try {
    const result = compileSource(
      `async function work(): Promise<number> {
  try {
    try {
      const value: number = await Promise.resolve(1)
      return value
    } finally {
      throw 'finally fail'
    }
  } catch (error) {
    console.log(error)
    return 9
  }
}

const promise = work()
console.log(await promise)

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
    assert.equal(run.stdout, 'finally fail\n9\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C object literal lowering compiles and runs with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-object-'))
  const source = join(dir, 'object-literal.c')
  const output = join(dir, 'object-literal')

  try {
    const result = compileSource(
      `const user = { name: 'Ada', score: 42 }
console.log('ok')

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
    assert.equal(run.stdout, 'ok\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C object literal scalar expression boxing compiles and runs with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-object-scalar-boxing-'))
  const source = join(dir, 'object-scalar-boxing.c')
  const output = join(dir, 'object-scalar-boxing')

  try {
    const result = compileSource(
      `type Meta = {
  optional: boolean
  total: number
}

function meta(node: object): Meta {
  const min = 1
  const max = 3
  return { optional: node.optional === true, total: min + max }
}

const result = meta({ optional: true })
console.log(result.optional, result.total)

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
    assert.equal(run.stdout, '1 4\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C object literal collection constructors compile and run with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-object-collection-constructors-'))
  const source = join(dir, 'object-collection-constructors.c')
  const output = join(dir, 'object-collection-constructors')

  try {
    const result = compileSource(
      `type Bag = {
  scores: Map<string, number>
  names: Set<string>
}

const bag: Bag = { scores: new Map(), names: new Set() }
bag.scores.set('Ada', 7)
bag.scores.set('Grace', 9)
bag.names.add('Ada')
console.log(bag.scores.size, bag.names.has('Ada'), bag.scores.get('Grace') ?? 0)

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
    assert.equal(run.stdout, '2 1 9\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C early return runs through cleanup label with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-early-return-cleanup-'))
  const source = join(dir, 'early-return-cleanup.c')
  const output = join(dir, 'early-return-cleanup')

  try {
    const result = compileSource(
      `const user = { name: 'Ada' }
if (user.name === 'Ada') {
  return
}
console.log('unreachable')

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
    assert.equal(run.stdout, '')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C top-level wrapper cleanup compiles and runs with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-wrapper-cleanup-'))
  const source = join(dir, 'wrapper-cleanup.c')
  const output = join(dir, 'wrapper-cleanup')

  try {
    const result = compileSource(
      `const user = { name: 'Ada' }
console.log('ok')
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
    assert.equal(run.stdout, 'ok\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C number return cleanup compiles and runs with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-number-return-cleanup-'))
  const source = join(dir, 'number-return-cleanup.c')
  const output = join(dir, 'number-return-cleanup')

  try {
    const result = compileSource(
      `function getScore(): number {
  const user = { score: 42 }
  const score = user.score
  return score
}

console.log(getScore())

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
    assert.equal(run.stdout, '42\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C prepared for clauses compile and run with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-for-prepared-'))
  const source = join(dir, 'for-prepared.c')
  const output = join(dir, 'for-prepared')

  try {
    const result = compileSource(
      `function start(label: string): number {
  return 0
}

function keepGoing(index: number, label: string): boolean {
  return index < 3
}

function nextIndex(index: number, label: string): number {
  return index + 1
}

let total = 0

for (let index = start('start'); keepGoing(index, 'limit'); index = nextIndex(index, 'step')) {
  total = total + index
}

console.log(total)

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
    assert.equal(run.stdout, '3\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C continue statements compile and run with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-continue-'))
  const source = join(dir, 'continue.c')
  const output = join(dir, 'continue')

  try {
    const result = compileSource(
      `let total = 0

for (let index = 0; index < 5; index = index + 1) {
  if (index === 2) {
    continue
  }

  total = total + index
}

console.log(total)

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
    assert.equal(run.stdout, '8\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C string-returning for initializer compiles and runs with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-for-string-init-'))
  const source = join(dir, 'for-string-init.c')
  const output = join(dir, 'for-string-init')

  try {
    const result = compileSource(
      `function getName(): string {
  return 'Ada'
}

let index = 0

for (const name = getName(); index < 1; index = index + 1) {
  console.log(name)
}

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
    assert.equal(run.stdout, 'Ada\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C prepared conditions compile and run with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-prepared-conditions-'))
  const source = join(dir, 'prepared-conditions.c')
  const output = join(dir, 'prepared-conditions')

  try {
    const result = compileSource(
      `function isReady(label: string): boolean {
  return true
}

function keepGoing(index: number, label: string): boolean {
  return index < 2
}

function choose(label: string): number {
  return 2
}

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
    assert.equal(run.stdout, '3\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C prepared scalar assignment compiles and runs with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-prepared-assignment-'))
  const source = join(dir, 'prepared-assignment.c')
  const output = join(dir, 'prepared-assignment')

  try {
    const result = compileSource(
      `function nextIndex(index: number, label: string): number {
  return index + 1
}

let index = 0
index = nextIndex(index, 'step')
console.log(index)

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
    assert.equal(run.stdout, '1\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C named callback values compile and run with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-callback-'))
  const source = join(dir, 'callback.c')
  const output = join(dir, 'callback')

  try {
    const result = compileSource(
      `function run(callback: Function): void {
  callback()
}

function hello(): void {
  console.log('callback')
}

const callback: Function = hello
run(callback)

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
    assert.equal(run.stdout, 'callback\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C non-capturing inline callback values compile and run with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-inline-pointer-callback-'))
  const source = join(dir, 'inline-pointer-callback.c')
  const output = join(dir, 'inline-pointer-callback')

  try {
    const result = compileSource(
      `function run(callback: Function): void {
  callback()
}

run(() => {
  console.log('inline')
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
    assert.equal(run.stdout, 'inline\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C capturing plain callback arguments compile and run with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-capturing-plain-callback-'))
  const source = join(dir, 'capturing-plain-callback.c')
  const output = join(dir, 'capturing-plain-callback')

  try {
    const result = compileSource(
      `type NumberCallback = (value: number) => void;

function runPlain(callback: Function): void {
  callback()
}

function runNumber(callback: NumberCallback): void {
  callback(7)
}

const label = 'captured'
const offset = 5
runPlain(() => {
  console.log(label)
})
runNumber((value: number) => {
  console.log(value + offset)
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
    assert.equal(run.stdout, 'captured\n12\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C captured callback variables compile and run with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-captured-callback-variable-'))
  const source = join(dir, 'captured-callback-variable.c')
  const output = join(dir, 'captured-callback-variable')

  try {
    const result = compileSource(
      `type NumberCallback = (value: number) => void;

function run(callback: Function): void {
  callback()
}

function runNumber(callback: NumberCallback): void {
  callback(7)
}

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
    assert.equal(run.stdout, 'direct\ndirect\n12\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C mutable numeric callback captures compile and run with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-mutable-callback-capture-'))
  const source = join(dir, 'mutable-callback-capture.c')
  const output = join(dir, 'mutable-callback-capture')

  try {
    const result = compileSource(
      `function run(callback: Function): void {
  callback()
}

let count = 0
const callback: Function = () => {
  count = count + 1
  console.log(count)
}
run(callback)
console.log(count)

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
    assert.equal(run.stdout, '1\n1\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C mutable numeric callback parameter captures compile and run with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-mutable-callback-param-'))
  const source = join(dir, 'mutable-callback-param.c')
  const output = join(dir, 'mutable-callback-param')

  try {
    const result = compileSource(
      `function run(seed: number): void {
  const callback: Function = () => {
    seed = seed + 1
    console.log(seed)
  }
  callback()
  console.log(seed)
}

run(1)

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
    assert.equal(run.stdout, '2\n2\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C mutable string callback captures compile and run with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-mutable-string-callback-'))
  const source = join(dir, 'mutable-string-callback.c')
  const output = join(dir, 'mutable-string-callback')

  try {
    const result = compileSource(
      `function run(callback: Function): void {
  callback()
}

let label = 'start'
const callback: Function = () => {
  label = label + '!'
  console.log(label)
}
run(callback)
console.log(label)

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
    assert.equal(run.stdout, 'start!\nstart!\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C mutable object callback captures compile and run with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-mutable-object-callback-'))
  const source = join(dir, 'mutable-object-callback.c')
  const output = join(dir, 'mutable-object-callback')

  try {
    const result = compileSource(
      `type Person = {
  name: string
}

function run(callback: Function): void {
  callback()
}

let person: Person = { name: 'Ada' }
const callback: Function = () => {
  person.name = 'Grace'
  console.log(person.name)
}
run(callback)
console.log(person.name)

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
    assert.equal(run.stdout, 'Grace\nGrace\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C typed callback aliases compile and run with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-typed-callback-'))
  const source = join(dir, 'typed-callback.c')
  const output = join(dir, 'typed-callback')

  try {
    const result = compileSource(
      `type NumberCallback = (value: number) => void;

function run(callback: NumberCallback): void {
  callback(7)
}

function hello(value: number): void {
  console.log(value)
}

const callback: NumberCallback = hello
run(callback)

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
    assert.equal(run.stdout, '7\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C string callback aliases compile and run with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-string-callback-'))
  const source = join(dir, 'string-callback.c')
  const output = join(dir, 'string-callback')

  try {
    const result = compileSource(
      `type StringCallback = (value: string) => void;

function run(callback: StringCallback): void {
  callback('typed')
}

function hello(value: string): void {
  console.log(value)
}

const callback: StringCallback = hello
run(callback)

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
    assert.equal(run.stdout, 'typed\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C object callback aliases compile and run with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-object-callback-'))
  const source = join(dir, 'object-callback.c')
  const output = join(dir, 'object-callback')

  try {
    const result = compileSource(
      `type Person = {
  name: string
};

type PersonCallback = (value: Person) => void;

function run(callback: PersonCallback, person: Person): void {
  callback(person)
}

function hello(value: Person): void {
  console.log(value.name)
}

const person: Person = {
  name: 'Ada'
}
const callback: PersonCallback = hello
run(callback, person)

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
    assert.equal(run.stdout, 'Ada\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C capturing runtime callback arrows compile and run with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-capturing-callback-'))
  const source = join(dir, 'capturing-callback.c')
  const output = join(dir, 'capturing-callback')

  try {
    const result = compileSource(
      `type StringCallback = (value: string) => void;

function run(callback: StringCallback): void {
  callback('Ada')
}

const prefix = 'hello'
const callback: StringCallback = (value: string) => {
  console.log(prefix, value)
}
run(callback)

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
    assert.equal(run.stdout, 'hello Ada\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C inline runtime callback arguments compile and run with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-inline-callback-'))
  const source = join(dir, 'inline-callback.c')
  const output = join(dir, 'inline-callback')

  try {
    const result = compileSource(
      `type StringCallback = (value: string) => void;

function run(callback: StringCallback): void {
  callback('direct')
}

const prefix = 'hello'
run((value: string) => {
  console.log(prefix, value)
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
    assert.equal(run.stdout, 'hello direct\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C retained runtime callback captures compile and run with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-retained-callback-'))
  const source = join(dir, 'retained-callback.c')
  const output = join(dir, 'retained-callback')

  try {
    const result = compileSource(
      `type User = {
  name: string
}

type StringCallback = (value: string) => void;

function run(callback: StringCallback): void {
  callback('Grace')
}

const user: User = { name: 'Ada' }
const name = user.name
const callback: StringCallback = (value: string) => {
  console.log(name, user.name, value)
}
run(callback)

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
    assert.equal(run.stdout, 'Ada Ada Grace\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C string equality comparisons compile and run with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-string-equality-'))
  const source = join(dir, 'string-equality.c')
  const output = join(dir, 'string-equality')

  try {
    const result = compileSource(
      `type User = {
  name: string
}

function getName(): string {
  return 'Ada'
}

const user: User = { name: 'Ada' }
const values = ['Ada', 'Grace']
const name = 'Ada'
const sameLocal = name === 'Ada'
const sameRuntime = user.name === values[0]
const differentCall = getName() !== values[1]
console.log(sameLocal, sameRuntime, differentCall)

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
    assert.equal(run.stdout, '1 1 1\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C string concatenation compiles and runs with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-string-concat-'))
  const source = join(dir, 'string-concat.c')
  const output = join(dir, 'string-concat')

  try {
    const result = compileSource(
      `type User = {
  name: string
}

function getName(): string {
  return 'Grace'
}

const user: User = { name: 'Ada' }
const name = user.name
const message = name + ' ' + getName() + '!'
console.log(message)

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
    assert.equal(run.stdout, 'Ada Grace!\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C string length compiles and runs with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-string-length-'))
  const source = join(dir, 'string-length.c')
  const output = join(dir, 'string-length')

  try {
    const result = compileSource(
      `type User = {
  name: string
}

function length(name: string): number {
  return name.length
}

function getName(): string {
  return 'Grace'
}

const user: User = { name: 'Ada' }
const name = user.name
const message = name + '!'
const unicode = 'A😀é'
console.log('Ada'.length, length(name), user.name.length, getName().length, message.length, unicode.length)

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
    assert.equal(run.stdout, '3 3 3 5 4 3\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C string predicate methods compile and run with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-string-predicates-'))
  const source = join(dir, 'string-predicates.c')
  const output = join(dir, 'string-predicates')

  try {
    const result = compileSource(
      `type User = {
  name: string
}

function hasAda(name: string): boolean {
  return name.includes('d') && name.startsWith('A') && name.endsWith('a')
}

function getName(): string {
  return 'Grace'
}

const user: User = { name: 'Ada' }
const name = user.name
const message = name + '!'
console.log('Ada'.includes('d'), hasAda(name), user.name.startsWith('A'), getName().endsWith('e'), message.endsWith('!'), name.includes('z'))

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
    assert.equal(run.stdout, '1 1 1 1 1 0\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C string slice compiles and runs with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-string-slice-'))
  const source = join(dir, 'string-slice.c')
  const output = join(dir, 'string-slice')

  try {
    const result = compileSource(
      `type User = {
  name: string
}

function middle(name: string): string {
  return name.slice(1, 3)
}

function getName(): string {
  return 'Grace'
}

const user: User = { name: 'Ada' }
const name = user.name
const message = name + '!'
const unicode = 'A😀é'
console.log('Ada'.slice(1, 3), middle(name), user.name.slice(0, 1), getName().slice(1, 4), message.slice(3), name.slice(0, 99), unicode.slice(1, 2), unicode.slice(2), name.slice(-2), name.slice(-99, 2), unicode.slice(-2, -1))

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
    assert.equal(run.stdout, 'da da A rac ! Ada 😀 é da Ad 😀\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C string split compiles and runs with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-string-split-'))
  const source = join(dir, 'string-split.c')
  const output = join(dir, 'string-split')

  try {
    const result = compileSource(
      `type User = {
  names: string
}

const user: User = { names: 'Ada,Grace' }
const names = user.names.split(',')
const initials = user.names.split(',').map(name => name.slice(0, 1)).sort()
console.log(names[0], names[1], initials[0], initials[1], 'abc'.split('')[1], 'A😀é'.split('')[1])

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
    assert.equal(run.stdout, 'Ada Grace A G b 😀\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C string trim compiles and runs with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-string-trim-'))
  const source = join(dir, 'string-trim.c')
  const output = join(dir, 'string-trim')

  try {
    const result = compileSource(
      `type User = {
  name: string
}

function clean(name: string): string {
  return name.trim()
}

function getName(): string {
  return ' Grace '
}

const user: User = { name: ' Ada ' }
const name = user.name
const message = ' ' + name + ' '
const unicode = '\u00a0\u2003Ada\u3000\ufeff'
const historicMongolianVowelSeparator = '\u180eAda\u180e'.trim() === '\u180eAda\u180e'
console.log(' Ada '.trim(), clean(name), user.name.trim(), getName().trim(), message.trim(), unicode.trim(), historicMongolianVowelSeparator)

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
    assert.equal(run.stdout, 'Ada Ada Ada Grace Ada Ada 1\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C String conversion compiles and runs with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-string-conversion-'))
  const source = join(dir, 'string-conversion.c')
  const output = join(dir, 'string-conversion')

  try {
    const result = compileSource(
      `type User = {
  name: string
}

function label(value: number): string {
  return String(value)
}

function flag(value: boolean): string {
  return String(value)
}

const user: User = { name: 'Ada' }
const name = user.name
const local = 'Ada'
console.log(String('Ada'), String(local), String(name), label(42), flag(true), String(false), String(null), String(name).length)

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
    assert.equal(run.stdout, 'Ada Ada Ada 42 true false null 3\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C Number conversion compiles and runs with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-number-conversion-'))
  const source = join(dir, 'number-conversion.c')
  const output = join(dir, 'number-conversion')

  try {
    const result = compileSource(
      `function parse(text: string): number | null {
  return Number(text)
}

console.log(Number('') ?? 9, Number('42') ?? 0, Number(' +.5e2 ') ?? 0, Number('nope') ?? 7, Number('1x') ?? 8, parse('-3.25') ?? 0, Number('1e309') ?? 0, Number('-Infinity') ?? 0, Number('\u00a0+.5e2\u3000') ?? 0, Number('\ufeff') ?? 9, Number('\u180e') ?? 6)

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
    assert.equal(run.stdout, '0 42 50 7 8 -3.25 inf -inf 50 0 6\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C numeric casts compile and run with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-numeric-casts-'))
  const source = join(dir, 'numeric-casts.c')
  const output = join(dir, 'numeric-casts')

  try {
    const result = compileSource(
      `const signedValue = i32(3.9)
const negative = i32(-3.9)
const unsignedValue = u32(-0.5)
const wide = u64(42.9)
const rounded = f32(16777217) === 16777216
const preserved = f64(1.25) === 1.25
console.log(signedValue, negative, unsignedValue, wide, rounded, preserved)

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
    assert.equal(run.stdout, '3 -3 0 42 1 1\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C Math.random os backend compiles and runs with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-random-os-'))
  const source = join(dir, 'random-os.c')
  const output = join(dir, 'random-os')

  try {
    const result = compileSource(
      `const value = Math.random()
console.log(value >= 0, value < 1)

`,
      {
        target: 'c',
        random: {
          backend: 'os'
        }
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


test('generated C array literal lowering compiles and runs with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-array-'))
  const source = join(dir, 'array-literal.c')
  const output = join(dir, 'array-literal')

  try {
    const result = compileSource(
      `const values = [1, 2, 3]
console.log('ok')

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
    assert.equal(run.stdout, 'ok\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C Array.push statements compile and run with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-array-push-'))
  const source = join(dir, 'array-push.c')
  const output = join(dir, 'array-push')

  try {
    const result = compileSource(
      `const values: number[] = [1, 2]
values.push(3)
values.push(4)
console.log(values.length, values[2], values[3])

const names: string[] = ['Ada']
names.push('Grace')
console.log(names.length, names[1])

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
    assert.equal(run.stdout, '4 3 4\n2 Grace\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C Array.pop expressions compile and run with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-array-pop-'))
  const source = join(dir, 'array-pop.c')
  const output = join(dir, 'array-pop')

  try {
    const result = compileSource(
      `const values: number[] = [1, 2]
const last = values.pop() ?? 0
console.log(values.length, last)
const first = values.pop() ?? 0
const missing = values.pop() ?? 9
console.log(values.length, first, missing)

const names: string[] = ['Ada']
const name = names.pop() ?? 'missing'
const none = names.pop() ?? 'empty'
console.log(names.length, name, none)

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
    assert.equal(run.stdout, '1 2\n0 1 9\n0 Ada empty\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C Array.sort without comparator compiles and runs with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-array-sort-'))
  const source = join(dir, 'array-sort.c')
  const output = join(dir, 'array-sort')

  try {
    const result = compileSource(
      `const values = [10, 2, 1]
const sorted = values.sort()
console.log(sorted[0], sorted[1], sorted[2])

const names = ['Grace', 'Ada']
names.sort()
console.log(names[0], names[1])

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
    assert.equal(run.stdout, '1 10 2\nAda Grace\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C Array.sort comparator callbacks compile and run with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-array-sort-callback-'))
  const source = join(dir, 'array-sort-callback.c')
  const output = join(dir, 'array-sort-callback')

  try {
    const result = compileSource(
      `const values = [3, 1, 2]
values.sort((left, right) => left - right)
console.log(values[0], values[1], values[2])

const desc = [1, 3, 2]
const sortedDesc = desc.sort((left, right) => right - left)
console.log(sortedDesc[0], sortedDesc[1], sortedDesc[2])

const names = ['bbb', 'a', 'cc']
names.sort((left, right) => left.length - right.length)
console.log(names[0], names[1], names[2])

const stable = ['bb', 'aa', 'c']
stable.sort((left, right) => left.length - right.length)
console.log(stable[0], stable[1], stable[2])

const flags = [true, false, true]
flags.sort((left, right) => left - right)
console.log(flags[0], flags[1], flags[2])

const chained = [5, 1, 4, 2].filter(value => value > 1).sort((left, right) => left - right).map(value => value * 10)
console.log(chained.length, chained[0], chained[1], chained[2])

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
    assert.equal(run.stdout, '1 2 3\n3 2 1\na cc bbb\nc bb aa\n0 1 1\n3 20 40 50\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C Array.filter expression callbacks compile and run with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-array-filter-'))
  const source = join(dir, 'array-filter.c')
  const output = join(dir, 'array-filter')

  try {
    const result = compileSource(
      `const values = [1, 2, 3, 4]
const middle = values.filter((value, index) => value > 1 && index < 3)
console.log(middle.length, middle[0], middle[1])

const chainValues = [10, 2, 1]
const chained = chainValues.sort().filter(value => value !== 10)
console.log(chained.length, chained[0], chained[1])

const names = ['Ada', 'Grace', 'Alan']
const aNames = names.filter(name => name.startsWith('A'))
console.log(aNames.length, aNames[0], aNames[1])

const truthyNames = ['', 'Ada', '', 'Grace'].filter(Boolean)
console.log(truthyNames.length, truthyNames[0], truthyNames[1])

const truthyNumbers = [0, 2, 3].filter(Boolean)
console.log(truthyNumbers.length, truthyNumbers[0], truthyNumbers[1])

const truthyFlags = [false, true, false].filter(Boolean)
console.log(truthyFlags.length, truthyFlags[0])

function pickLarge(values: number[]): number[] {
  return values.filter(value => value > 2)
}

function countNumbers(values: number[]): number {
  return values.length
}

const picked = pickLarge([1, 3, 4])
const inlineCount = countNumbers([0, 2, 3].filter(Boolean))
console.log(picked.length, picked[0], picked[1], inlineCount)

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
    assert.equal(run.stdout, '2 2 3\n2 1 2\n2 Ada Alan\n2 Ada Grace\n2 2 3\n1 1\n2 3 4 2\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C Array.map expression callbacks compile and run with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-array-map-'))
  const source = join(dir, 'array-map.c')
  const output = join(dir, 'array-map')

  try {
    const result = compileSource(
      `const values = [1, 2, 3]
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
    assert.equal(run.stdout, '3 2 5 8\n3 0 1 1\n2 A G\n2 20 30\n2 3 4\n3 10 20 30\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C Array block-body callbacks compile and run with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-array-block-callbacks-'))
  const source = join(dir, 'array-block-callbacks.c')
  const output = join(dir, 'array-block-callbacks')

  try {
    const result = compileSource(
      `const values = [3, 1, 2]
const result = values
  .sort((left, right) => {
    return left - right
  })
  .filter(value => {
    return value > 1
  })
  .map((value, index) => {
    return value * 10 + index
  })

console.log(result.length, result[0], result[1], values[0], values[2])

const branched = [1, 2, 3, 4]
  .filter((value, index) => {
    if (value === 1) {
      return false
    } else {
      return index < 3
    }
  })
  .map(value => {
    if (value === 2) {
      return value * 10
    }

    return value + 10
  })

console.log(branched.length, branched[0], branched[1])

const names = ['Grace', 'Ada', 'Alan']
const initials = names
  .filter(name => {
    return name.startsWith('A')
  })
  .map(name => {
    return name.slice(0, 1)
  })
  .sort((left, right) => {
    return left.length - right.length
  })

console.log(initials.length, initials[0], initials[1])

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
    assert.equal(run.stdout, '2 20 31 1 3\n2 20 13\n2 A A\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C Array methods over object fields compile and run with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-array-field-methods-'))
  const source = join(dir, 'array-field-methods.c')
  const output = join(dir, 'array-field-methods')

  try {
    const result = compileSource(
      `type Box = {
  values: number[],
  names: string[]
}

const box: Box = { values: [3, 1, 2], names: ['Grace', 'Ada'] }
box.values.push(4)
const last = box.values.pop() ?? 0
const numbers = box.values.sort((left, right) => left - right).filter(value => value !== 2)
const initials = box['names'].map(name => name.slice(0, 1)).sort()
console.log(last, numbers.length, numbers[0], numbers[1])
console.log(initials.length, initials[0], initials[1])

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
    assert.equal(run.stdout, '4 2 1 3\n2 A G\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C array length lowering compiles and runs with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-array-length-'))
  const source = join(dir, 'array-length.c')
  const output = join(dir, 'array-length')

  try {
    const result = compileSource(
      `const values = [1, 2, 3]
console.log(values.length, [4, 5].length)

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
    assert.equal(run.stdout, '3 2\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C runtime array length compiles and runs with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-runtime-array-length-'))
  const source = join(dir, 'runtime-array-length.c')
  const output = join(dir, 'runtime-array-length')

  try {
    const result = compileSource(
      `type Box = {
  values: number[]
}

const box: Box = { values: [1, 2, 3] }
console.log(box.values.length)

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
    assert.equal(run.stdout, '3\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C runtime array index reads compile and run with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-runtime-array-index-'))
  const source = join(dir, 'runtime-array-index.c')
  const output = join(dir, 'runtime-array-index')

  try {
    const result = compileSource(
      `type Box = {
  values: number[],
  flags: boolean[],
  names: string[]
}

const box: Box = { values: [1, 2, 3], flags: [true], names: ['Ada'] }
const name = box.names[0]
console.log(box.values[1], box.flags[0], name)

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
    assert.equal(run.stdout, '2 1 Ada\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C runtime array locals compile and run with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-runtime-array-locals-'))
  const source = join(dir, 'runtime-array-locals.c')
  const output = join(dir, 'runtime-array-locals')

  try {
    const result = compileSource(
      `type Box = {
  values: number[],
  names: string[]
}

const box: Box = { values: [1, 2, 3], names: ['Ada'] }
const values = box.values
const names = box.names
console.log(values[1], names[0])

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
    assert.equal(run.stdout, '2 Ada\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C for of over runtime array locals compiles and runs with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-runtime-array-for-of-'))
  const source = join(dir, 'runtime-array-for-of.c')
  const output = join(dir, 'runtime-array-for-of')

  try {
    const result = compileSource(
      `type Box = {
  values: number[],
  names: string[]
}

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
    assert.equal(run.stdout, '6 8\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C for of over runtime array expressions compiles and runs with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-runtime-array-expression-for-of-'))
  const source = join(dir, 'runtime-array-expression-for-of.c')
  const output = join(dir, 'runtime-array-expression-for-of')

  try {
    const result = compileSource(
      `type Box = {
  values: number[],
  names: string[]
}

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
    assert.equal(run.stdout, '6 8\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C for of array lowering compiles and runs with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-for-of-array-'))
  const source = join(dir, 'for-of-array.c')
  const output = join(dir, 'for-of-array')

  try {
    const result = compileSource(
      `const values = [1, 2, 3]
let total = 0

for (const value of values) {
  total = total + value
}

console.log(total)

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
    assert.equal(run.stdout, '6\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C for of string array lowering compiles and runs with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-for-of-string-array-'))
  const source = join(dir, 'for-of-string-array.c')
  const output = join(dir, 'for-of-string-array')

  try {
    const result = compileSource(
      `const names = ['Ada', 'Grace']

for (const name of names) {
  console.log(name)
}

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
    assert.equal(run.stdout, 'Ada\nGrace\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C for of Set lowering compiles and runs with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-for-of-set-'))
  const source = join(dir, 'for-of-set.c')
  const output = join(dir, 'for-of-set')

  try {
    const result = compileSource(
      `type Bag = {
  names: Set<string>
}

const values: Set<number> = new Set([1, 2, 3])
const names: Set<string> = new Set(['Ada', 'Grace'])
const bag: Bag = { names }
let total = 0
let letters = 0
let sawAda = 0
let sawGrace = 0

for (const value of values.add(4)) {
  total = total + value
}

for (const name of bag.names) {
  letters = letters + name.length
  if (name === 'Ada') {
    sawAda = 1
  }
  if (name === 'Grace') {
    sawGrace = 1
  }
}

console.log(total, letters, sawAda, sawGrace)

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
    assert.equal(run.stdout, '10 8 1 1\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C for of Map lowering compiles and runs with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-for-of-map-'))
  const source = join(dir, 'for-of-map.c')
  const output = join(dir, 'for-of-map')

  try {
    const result = compileSource(
      `type Bag = {
  scores: Map<string, number>
}

const scores: Map<string, number> = new Map([['Ada', 7], ['Grace', 9]])
const bag: Bag = { scores }
let total = 0
let letters = 0
let ada = 0
let grace = 0
let alan = 0

for (const entry of bag['scores'].set('Alan', 5)) {
  total = total + entry.value
  letters = letters + entry.key.length
  if (entry.key === 'Ada') {
    ada = entry.value
  }
  if (entry.key === 'Grace') {
    grace = entry.value
  }
  if (entry.key === 'Alan') {
    alan = entry.value
  }
}

console.log(total, letters, ada, grace, alan)

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
    assert.equal(run.stdout, '21 12 7 9 5\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C inline for of array lowering compiles and runs with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-for-of-inline-array-'))
  const source = join(dir, 'for-of-inline-array.c')
  const output = join(dir, 'for-of-inline-array')

  try {
    const result = compileSource(
      `let total = 0

for (const value of [1, 2, 3]) {
  total = total + value
}

console.log(total)

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
    assert.equal(run.stdout, '6\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C inline for of string array lowering compiles and runs with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-for-of-inline-string-array-'))
  const source = join(dir, 'for-of-inline-string-array.c')
  const output = join(dir, 'for-of-inline-string-array')

  try {
    const result = compileSource(
      `for (const name of ['Ada', 'Grace']) {
  console.log(name)
}

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
    assert.equal(run.stdout, 'Ada\nGrace\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C object field access lowering compiles and runs with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-object-field-'))
  const source = join(dir, 'object-field.c')
  const output = join(dir, 'object-field')

  try {
    const result = compileSource(
      `const user = { score: 42, active: true }
const score = user.score
const active = user.active
console.log(score, active)

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
    assert.equal(run.stdout, '42 1\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C object expression field access lowering compiles and runs with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-object-expression-field-'))
  const source = join(dir, 'object-expression-field.c')
  const output = join(dir, 'object-expression-field')

  try {
    const result = compileSource(
      `type Pair = {
  score: number
  active: boolean
}

function pair(): Pair {
  return { score: 42, active: true }
}

const score = pair().score
const active = pair().active
console.log(score, active)

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
    assert.equal(run.stdout, '42 1\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C dynamic object field access lowering compiles and runs with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-dynamic-object-field-'))
  const source = join(dir, 'dynamic-object-field.c')
  const output = join(dir, 'dynamic-object-field')

  try {
    const result = compileSource(
      `type Child = {
  value: number
}

function read(extra: object): Child {
  return extra.child
}

const child = read({ child: { value: 42 } })
console.log(child.value)

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
    assert.equal(run.stdout, '42\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C dynamic object scalar field access lowering compiles and runs with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-dynamic-object-scalar-field-'))
  const source = join(dir, 'dynamic-object-scalar-field.c')
  const output = join(dir, 'dynamic-object-scalar-field')

  try {
    const result = compileSource(
      `function read(extra: object): void {
const score: number = extra.score
const active: boolean = extra['active']
console.log(score, active)
}

read({ score: 42, active: true })

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
    assert.equal(run.stdout, '42 1\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C dynamic object field truthiness conditions compile and run with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-dynamic-object-truthiness-'))
  const source = join(dir, 'dynamic-object-truthiness.c')
  const output = join(dir, 'dynamic-object-truthiness')

  try {
    const result = compileSource(
      `function score(extra: object): number {
  let total = 0

  if (extra.name) {
    total = total + 1
  }

  if (extra.empty) {
    total = total + 10
  }

  if (extra.count) {
    total = total + 100
  }

  if (extra.ok) {
    total = total + 1000
  }

  if (extra.nope) {
    total = total + 10000
  }

  if (extra.child) {
    total = total + 100000
  }

  if (extra.missing) {
    total = total + 1000000
  }

  return total
}

console.log(score({ name: 'Ada', empty: '', count: 0, ok: true, nope: false, child: { value: 1 } }))

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
    assert.equal(run.stdout, '101001\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C dynamic object field assignment lowering compiles and runs with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-dynamic-object-field-assignment-'))
  const source = join(dir, 'dynamic-object-field-assignment.c')
  const output = join(dir, 'dynamic-object-field-assignment')

  try {
    const result = compileSource(
      `type Child = {
  value: number
}

function update(extra: object): void {
  extra.child = { value: 42 }
}

function read(extra: object): Child {
  return extra.child
}

const extra = { child: { value: 1 } }
update(extra)
const child = read(extra)
console.log(child.value)

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
    assert.equal(run.stdout, '42\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C dynamic runtime string literal comparisons compile and run with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-dynamic-string-compare-'))
  const source = join(dir, 'dynamic-string-compare.c')
  const output = join(dir, 'dynamic-string-compare')

  try {
    const result = compileSource(
      `function isReference(node: object): boolean {
  return node.type === 'Reference'
}

function isNotReference(node: object): boolean {
  return node.type !== 'Reference'
}

console.log(
  isReference({ type: 'Reference' }),
  isReference({ type: 'Other' }),
  isReference({ type: 1 }),
  isNotReference({ type: 'Reference' }),
  isNotReference({ type: 'Other' }),
  isNotReference({ type: 1 })
)

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
    assert.equal(run.stdout, '1 0 0 0 1 1\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C dynamic object field null comparisons compile and run with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-dynamic-object-null-compare-'))
  const source = join(dir, 'dynamic-object-null-compare.c')
  const output = join(dir, 'dynamic-object-null-compare')

  try {
    const result = compileSource(
      `function hasInit(node: object): boolean {
  return node.init != null
}

function missingInit(node: object): boolean {
  return null == node['init']
}

console.log(hasInit({ init: { type: 'StringLiteral' } }), hasInit({ init: null }), missingInit({ init: null }))

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
    assert.equal(run.stdout, '1 0 1\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C dynamic object field boolean literal comparisons compile and run with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-dynamic-object-bool-compare-'))
  const source = join(dir, 'dynamic-object-bool-compare.c')
  const output = join(dir, 'dynamic-object-bool-compare')

  try {
    const result = compileSource(
      `function isOptional(node: object): boolean {
  return node.optional === true
}

function isNotReadonly(node: object): boolean {
  return node['readonly'] !== false
}

console.log(
  isOptional({ optional: true }),
  isOptional({ optional: false }),
  isOptional({ optional: 1 }),
  isNotReadonly({ readonly: false }),
  isNotReadonly({ readonly: true }),
  isNotReadonly({ readonly: 'no' })
)

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
    assert.equal(run.stdout, '1 0 0 0 1 1\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C dynamic object array length compiles and runs with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-dynamic-object-array-length-'))
  const source = join(dir, 'dynamic-object-array-length.c')
  const output = join(dir, 'dynamic-object-array-length')

  try {
    const result = compileSource(
      `function hasOnePath(node: object): boolean {
  return node.path.length === 1
}

function hasFields(node: object): boolean {
  return node['fields'].length > 0
}

console.log(
  hasOnePath({ path: ['type'] }),
  hasOnePath({ path: ['type', 'loc'] }),
  hasFields({ fields: [1, 2] }),
  hasFields({ fields: [] })
)

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
    assert.equal(run.stdout, '1 0 1 0\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C dynamic object array index null comparisons compile and run with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-dynamic-object-array-index-'))
  const source = join(dir, 'dynamic-object-array-index.c')
  const output = join(dir, 'dynamic-object-array-index')

  try {
    const result = compileSource(
      `function hasFirst(node: object): boolean {
  return node.args[0] != null
}

console.log(hasFirst({ args: [{ type: 'Literal' }] }), hasFirst({ args: [] }))

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
    assert.equal(run.stdout, '1 0\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C string object field access lowering compiles and runs with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-object-string-field-'))
  const source = join(dir, 'object-string-field.c')
  const output = join(dir, 'object-string-field')

  try {
    const result = compileSource(
      `const user = { name: 'Ada', score: 42 }
const name = user.name
console.log(name)

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
    assert.equal(run.stdout, 'Ada\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C object field assignment lowering compiles and runs with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-object-field-assignment-'))
  const source = join(dir, 'object-field-assignment.c')
  const output = join(dir, 'object-field-assignment')

  try {
    const result = compileSource(
      `const user = { score: 1, active: false, name: 'Ada' }
user.score = 42
user.active = true
user.name = 'Grace'
const score = user.score
const active = user.active
const name = user.name
console.log(score, active, name)

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
    assert.equal(run.stdout, '42 1 Grace\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C string index object field reads compile and run with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-object-index-field-'))
  const source = join(dir, 'object-index-field.c')
  const output = join(dir, 'object-index-field')

  try {
    const result = compileSource(
      `const user = { score: 42, active: true, name: 'Ada' }
const score = user['score']
const active = user['active']
const name = user['name']
console.log(score, active, name)

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
    assert.equal(run.stdout, '42 1 Ada\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C string index object field assignments compile and run with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-object-index-assignment-'))
  const source = join(dir, 'object-index-assignment.c')
  const output = join(dir, 'object-index-assignment')

  try {
    const result = compileSource(
      `const user = { score: 1, active: false, name: 'Ada' }
user['score'] = 42
user['active'] = true
user['name'] = 'Grace'
const score = user['score']
const active = user['active']
const name = user['name']
console.log(score, active, name)

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
    assert.equal(run.stdout, '42 1 Grace\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C array index access lowering compiles and runs with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-array-index-'))
  const source = join(dir, 'array-index.c')
  const output = join(dir, 'array-index')

  try {
    const result = compileSource(
      `const values = [42, true]
const score = values[0]
const active = values[1]
console.log(score, active)

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
    assert.equal(run.stdout, '42 1\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C array index assignment lowering compiles and runs with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-array-assignment-'))
  const source = join(dir, 'array-assignment.c')
  const output = join(dir, 'array-assignment')

  try {
    const result = compileSource(
      `const values = [1, false]
values[0] = 42
values[1] = true
const score = values[0]
const active = values[1]
console.log(score, active)

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
    assert.equal(run.stdout, '42 1\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C string array index reads compile and run with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-string-array-'))
  const source = join(dir, 'string-array.c')
  const output = join(dir, 'string-array')

  try {
    const result = compileSource(
      `const values = ['Ada']
values[0] = 'Grace'
const name = values[0]
console.log(name)

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
    assert.equal(run.stdout, 'Grace\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C runtime string local propagation compiles and runs with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-runtime-string-local-'))
  const source = join(dir, 'runtime-string-local.c')
  const output = join(dir, 'runtime-string-local')

  try {
    const result = compileSource(
      `const user = { name: 'Ada' }
const name = user.name
const again = name
console.log(again)

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
    assert.equal(run.stdout, 'Ada\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C nullable string nullish coalescing compiles and runs with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-nullable-string-nullish-'))
  const source = join(dir, 'nullable-string-nullish.c')
  const output = join(dir, 'nullable-string-nullish')

  try {
    const result = compileSource(
      `let name: string | null = null
console.log(name ?? 'Ada', name === null)
name = 'Grace'
const display = name ?? 'Ada'
console.log(display, name !== null)

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
    assert.equal(run.stdout, 'Ada 1\nGrace 1\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C nullable runtime optional access compiles and runs with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-nullable-optional-access-'))
  const source = join(dir, 'nullable-optional-access.c')
  const output = join(dir, 'nullable-optional-access')

  try {
    const result = compileSource(
      `type User = {
  name: string
}

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
    assert.equal(run.stdout, 'missing Ada Ada Grace empty 1\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C nullable scalar nullish coalescing compiles and runs with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-nullable-scalar-nullish-'))
  const source = join(dir, 'nullable-scalar-nullish.c')
  const output = join(dir, 'nullable-scalar-nullish')

  try {
    const result = compileSource(
      `type User = {
  score: number,
  active: boolean
}

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
    assert.equal(run.stdout, '1 0 1 0\n7 1 1 0\n3 1\n9 0\n2 5\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C nullable scalar function ABI compiles and runs with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-nullable-scalar-abi-'))
  const source = join(dir, 'nullable-scalar-abi.c')
  const output = join(dir, 'nullable-scalar-abi')

  try {
    const result = compileSource(
      `function maybeScore(seed: number): number | null {
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

const first = maybeScore(1)
const second: number | null = maybeScore(0)
let active: boolean | null = maybeActive(1)
printScore(first, active)
active = maybeActive(0)
printScore(second, active)
printScore(7 + 1, false)

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
    assert.equal(run.stdout, '2 1 1 0\n0 0 0 1\n8 0 1 0\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C nullable scalar branch narrowing compiles and runs with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-nullable-scalar-branch-narrowing-'))
  const source = join(dir, 'nullable-scalar-branch-narrowing.c')
  const output = join(dir, 'nullable-scalar-branch-narrowing')

  try {
    const result = compileSource(
      `function printScore(score: number | null, active: boolean | null): void {
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

printScore(4, true)
printScore(null, null)

let value: number | null = 5
if (value !== null) {
  console.log(value)
  value = null
}
console.log(value ?? 9)

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
    assert.equal(run.stdout, '5\n1\n0\n0\n5\n9\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C nullable scalar logical narrowing compiles and runs with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-nullable-scalar-logical-narrowing-'))
  const source = join(dir, 'nullable-scalar-logical-narrowing.c')
  const output = join(dir, 'nullable-scalar-logical-narrowing')

  try {
    const result = compileSource(
      `function printScore(score: number | null, backup: number | null): void {
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

printScore(4, 3)
printScore(null, null)
printScore(1, 0)

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
    assert.equal(run.stdout, '5\n5\n0\n10\n0\n10\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C nullable scalar early return narrowing compiles and runs with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-nullable-scalar-early-return-narrowing-'))
  const source = join(dir, 'nullable-scalar-early-return-narrowing.c')
  const output = join(dir, 'nullable-scalar-early-return-narrowing')

  try {
    const result = compileSource(
      `function printScore(score: number | null, active: boolean | null): void {
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

printScore(4, true)
printScore(null, true)
printScore(2, null)
printHigh(3)
printHigh(null)
printHigh(1)

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
    assert.equal(run.stdout, '5\n1\n0\n3\n0\n4\n10\n10\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C nullable scalar loop narrowing compiles and runs with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-nullable-scalar-loop-narrowing-'))
  const source = join(dir, 'nullable-scalar-loop-narrowing.c')
  const output = join(dir, 'nullable-scalar-loop-narrowing')

  try {
    const result = compileSource(
      `function printLoop(score: number | null, active: boolean | null): void {
  while (score !== null && score > 0) {
    console.log(score)
    score = score - 1
  }

  for (let index = 0; active !== null && index < 2; index = index + 1) {
    console.log(active)
    active = null
  }
}

printLoop(2, true)
printLoop(null, null)

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
    assert.equal(run.stdout, '2\n1\n1\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C nullable callback optional calls compile and run with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-nullable-callback-optional-call-'))
  const source = join(dir, 'nullable-callback-optional-call.c')
  const output = join(dir, 'nullable-callback-optional-call')

  try {
    const result = compileSource(
      `type Named = (name: string) => void;

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
    assert.equal(run.stdout, 'hello\nhello\nGrace\nAda\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C nullable callback optional call results compile and run with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-nullable-callback-optional-call-result-'))
  const source = join(dir, 'nullable-callback-optional-call-result.c')
  const output = join(dir, 'nullable-callback-optional-call-result')

  try {
    const result = compileSource(
      `type Score = (value: number) => number;
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

printValues(addOne, isReady)
printValues(null, null)

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
    assert.equal(run.stdout, '5 1\n0 0\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C nullable arrow callback optional call results compile and run with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-nullable-arrow-callback-optional-call-result-'))
  const source = join(dir, 'nullable-arrow-callback-optional-call-result.c')
  const output = join(dir, 'nullable-arrow-callback-optional-call-result')

  try {
    const result = compileSource(
      `type Score = (value: number) => number;
type Ready = () => boolean;

function printValues(score: Score | null, ready: Ready | null): void {
  const value: number | null = score?.(4)
  const flag: boolean | null = ready?.()
  console.log(value ?? 0, flag ?? false)
}

const bonus = 3
const score: Score | null = (value: number) => value + bonus
const ready: Ready | null = () => bonus === 3
printValues(score, ready)
printValues(null, null)

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
    assert.equal(run.stdout, '7 1\n0 0\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C nullable block arrow callback optional call results compile and run with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-nullable-block-arrow-callback-optional-call-result-'))
  const source = join(dir, 'nullable-block-arrow-callback-optional-call-result.c')
  const output = join(dir, 'nullable-block-arrow-callback-optional-call-result')

  try {
    const result = compileSource(
      `type Score = (value: number) => number;
type Ready = () => boolean;

function printValues(score: Score | null, ready: Ready | null): void {
  const value: number | null = score?.(4)
  const flag: boolean | null = ready?.()
  console.log(value ?? 0, flag ?? false)
}

const bonus = 3
const score: Score | null = (value: number) => {
  const doubled = value * 2
  if (doubled > 4) {
    return doubled + bonus
  }

  return bonus
}
const ready: Ready | null = () => {
  if (bonus === 3) {
    return true
  }

  return false
}
printValues(score, ready)
printValues(null, null)

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
    assert.equal(run.stdout, '11 1\n0 0\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C runtime callback returns through finally compile and run with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-callback-return-finally-'))
  const source = join(dir, 'callback-return-finally.c')
  const output = join(dir, 'callback-return-finally')

  try {
    const result = compileSource(
      `type Score = (value: number) => number;
type Name = () => string;

function printScore(score: Score | null): void {
  const value: number | null = score?.(4)
  console.log(value ?? 0)
}

function printName(name: Name | null): void {
  const value: string | null = name?.()
  console.log(value ?? 'missing')
}

const score: Score | null = (value: number) => {
  try {
    return value + 3
  } finally {
    console.log('score finally', value)
  }
}

const name: Name | null = () => {
  try {
    return 'Ada'
  } finally {
    console.log('name finally')
  }
}

printScore(score)
printName(name)
printScore(null)
printName(null)

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
    assert.equal(run.stdout, 'score finally 4\n7\nname finally\nAda\n0\nmissing\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C nullable string callback optional call results compile and run with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-nullable-string-callback-optional-call-result-'))
  const source = join(dir, 'nullable-string-callback-optional-call-result.c')
  const output = join(dir, 'nullable-string-callback-optional-call-result')

  try {
    const result = compileSource(
      `type Name = () => string;

function getName(): string {
  return 'Ada'
}

function printName(callback: Name | null): void {
  const value: string | null = callback?.()
  console.log(value ?? 'missing')
}

printName(getName)
printName(null)

const arrow: Name | null = () => 'Grace'
printName(arrow)

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
    assert.equal(run.stdout, 'Ada\nmissing\nGrace\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C nullable object callback optional call results compile and run with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-nullable-object-callback-optional-call-result-'))
  const source = join(dir, 'nullable-object-callback-optional-call-result.c')
  const output = join(dir, 'nullable-object-callback-optional-call-result')

  try {
    const result = compileSource(
      `type User = {
  name: string,
  id: number
}
type MakeUser = () => User;

function getUser(): User {
  return { name: 'Ada', id: 7 }
}

function printUser(callback: MakeUser | null): void {
  const user: User | null = callback?.()
  const name: string | null = user?.name
  const id: number | null = user?.id
  console.log(name ?? 'missing', id ?? 0)
}

printUser(getUser)
printUser(null)

const arrow: MakeUser | null = () => {
  return { name: 'Grace', id: 9 }
}
printUser(arrow)

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
    assert.equal(run.stdout, 'Ada 7\nmissing 0\nGrace 9\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C local string throw try catch finally compiles and runs with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-try-catch-finally-'))
  const source = join(dir, 'try-catch-finally.c')
  const output = join(dir, 'try-catch-finally')

  try {
    const result = compileSource(
      `try {
  throw 'boom'
} catch (error) {
  console.log(\`caught \${error}\`)
} finally {
  console.log('finally')
}
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
    assert.equal(run.stdout, 'caught boom\nfinally\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C lightweight Error objects compile and run with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-error-object-'))
  const source = join(dir, 'error-object.c')
  const output = join(dir, 'error-object')

  try {
    const result = compileSource(
      `const root = new Error('root', { code: 'E_ROOT' })
const created = new Error('created', { code: 'E_CREATED', cause: root })
console.log(created.name, created.message, created.code)
try {
  const thrown = new Error('boom', { code: 'E_BOOM', cause: created })
  throw thrown
} catch (error) {
  console.log(error.name, error.message, error.code)
} finally {
  console.log('finally')
}

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
    assert.equal(run.stdout, 'Error created E_CREATED\nError boom E_BOOM\nfinally\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C interfunction throws compile and run with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-interfunction-throw-'))
  const source = join(dir, 'interfunction-throw.c')
  const output = join(dir, 'interfunction-throw')

  try {
    const result = compileSource(
      `export function failString(): void {
  throw 'boom'
}

export function failError(): void {
  const error = new Error('bad')
  throw error
}

export function readValue(ok: boolean): number {
  if (ok) {
    return 7
  }

  throw 'no value'
}

try {
  failString()
} catch (error) {
  console.log(error)
}

try {
  failError()
} catch (error) {
  console.log(error.name, error.message)
}

try {
  console.log(readValue(true))
  console.log(readValue(false))
} catch (error) {
  console.log(error)
}

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
    assert.equal(run.stdout, 'boom\nError bad\n7\nno value\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C return through finally compiles and runs with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-return-finally-'))
  const source = join(dir, 'return-finally.c')
  const output = join(dir, 'return-finally')

  try {
    const result = compileSource(
      `function getScore(): number {
  try {
    return 7
  } finally {
    console.log('score finally')
  }
}

function stop(): void {
  try {
    return
  } finally {
    console.log('stop finally')
  }
  console.log('after')
}

console.log(getScore())
stop()

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
    assert.equal(run.stdout, 'score finally\n7\nstop finally\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C break and continue through finally compile and run with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-break-continue-finally-'))
  const source = join(dir, 'break-continue-finally.c')
  const output = join(dir, 'break-continue-finally')

  try {
    const result = compileSource(
      `let index = 0
while (index < 4) {
  index = index + 1
  try {
    if (index === 1) {
      continue
    }
    if (index === 3) {
      break
    }
  } finally {
    console.log('finally', index)
  }
  console.log('body', index)
}
console.log('done', index)

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
    assert.equal(run.stdout, 'finally 1\nfinally 2\nbody 2\nfinally 3\ndone 3\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C runtime string assignment references compile and run with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-runtime-string-assignment-'))
  const source = join(dir, 'runtime-string-assignment.c')
  const output = join(dir, 'runtime-string-assignment')

  try {
    const result = compileSource(
      `const source = { name: 'Ada' }
const name = source.name
const target = { name: 'Bob' }
const values = ['Grace']
target.name = name
values[0] = name
const objectName = target.name
const arrayName = values[0]
console.log(objectName, arrayName)

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
    assert.equal(run.stdout, 'Ada Ada\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C string-returning assignment calls compile and run with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-string-return-assignment-'))
  const source = join(dir, 'string-return-assignment.c')
  const output = join(dir, 'string-return-assignment')

  try {
    const result = compileSource(
      `function getName(): string {
  return 'Ada'
}

const target = { name: 'Bob' }
const values = ['Grace']
target.name = getName()
values[0] = getName()
console.log(target.name, values[0])

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
    assert.equal(run.stdout, 'Ada Ada\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C runtime string params compile and run with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-runtime-string-params-'))
  const source = join(dir, 'runtime-string-params.c')
  const output = join(dir, 'runtime-string-params')

  try {
    const result = compileSource(
      `function greet(name: string): void {
  console.log(name)
}

function echo(name: string): string {
  return name
}

const user = { name: 'Ada' }
greet('Ada')
greet(user.name)
console.log(echo(user.name))

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
    assert.equal(run.stdout, 'Ada\nAda\nAda\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C prepared string args in number expressions compile and run with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-prepared-number-calls-'))
  const source = join(dir, 'prepared-number-calls.c')
  const output = join(dir, 'prepared-number-calls')

  try {
    const result = compileSource(
      `function length(name: string): number {
  return 3
}

const user = { name: 'Ada' }
const total = length('Ada') + length(user.name)
console.log(length(user.name), total)

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
    assert.equal(run.stdout, '3 6\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C runtime string return compiles and runs with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-runtime-string-return-'))
  const source = join(dir, 'runtime-string-return.c')
  const output = join(dir, 'runtime-string-return')

  try {
    const result = compileSource(
      `function getName(): string {
  const user = { name: 'Ada' }
  return user.name
}

const name = getName()
console.log(name)

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
    assert.equal(run.stdout, 'Ada\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C runtime string index returns compile and run with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-runtime-string-index-return-'))
  const source = join(dir, 'runtime-string-index-return.c')
  const output = join(dir, 'runtime-string-index-return')

  try {
    const result = compileSource(
      `function getObjectName(): string {
  const user = { name: 'Ada' }
  return user['name']
}

function getArrayName(): string {
  const values = ['Grace']
  return values[0]
}

console.log(getObjectName(), getArrayName())

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
    assert.equal(run.stdout, 'Ada Grace\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C member and index reads inside scalar expressions compile and run with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-scalar-member-expr-'))
  const source = join(dir, 'scalar-member-expr.c')
  const output = join(dir, 'scalar-member-expr')

  try {
    const result = compileSource(
      `const user = { score: 7, active: true }
const values = [3, true]
const total = user.score + values[0]
const same = user.active === values[1]
console.log(total, same)

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
    assert.equal(run.stdout, '10 1\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C optional object member and index access compile and run with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-optional-member-'))
  const source = join(dir, 'optional-member.c')
  const output = join(dir, 'optional-member')

  try {
    const result = compileSource(
      `const user = { name: 'Ada', score: 7 }
const name = user?.name
console.log(name, user?.['score'])

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
    assert.equal(run.stdout, 'Ada 7\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C typed object shape lowering compiles and runs with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-typed-object-'))
  const source = join(dir, 'typed-object.c')
  const output = join(dir, 'typed-object')

  try {
    const result = compileSource(
      `type User = {
  readonly id: number,
  name: string
}

const user: User = { name: 'Ada', id: 42 }
const id = user.id
console.log(id)

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
    assert.equal(run.stdout, '42\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C JSON parse and stringify compile and run with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-json-'))
  const source = join(dir, 'json.c')
  const output = join(dir, 'json')

  try {
    const result = compileSource(
      `type User = {
  name: string,
  score: number
}

const user: User = JSON.parse('{"score":7,"name":"Ada"}')
const parsedScore: number = JSON.parse('8')
const active: boolean = JSON.parse('true')
const text = JSON.stringify(user)
console.log(user.name, user.score, text, parsedScore, active)

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
    assert.equal(run.stdout, 'Ada 7 {"name":"Ada","score":7} 8 1\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C Buffer and Uint8Array APIs compile and run with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-binary-api-'))
  const source = join(dir, 'binary-api.c')
  const output = join(dir, 'binary-api')

  try {
    const result = compileSource(
      `const bytes = Buffer.from('hi', 'utf8')
const out = new Uint8Array(4)
out[0] = bytes[0]
out[1] = 7
out[2] = 9
const slice = out.slice(1, 3)
const tail = out.slice(-2)
const clamp = out.slice(-99, 2)
const text = bytes.toString()
console.log(bytes.length, out[0], out[1], slice.length, slice[1], tail[0], tail[1], clamp.length, clamp[1], text)

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
    assert.equal(run.stdout, '2 104 7 2 9 9 0 2 7 hi\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C crypto.getRandomValues compiles and runs with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-crypto-random-'))
  const source = join(dir, 'crypto-random.c')
  const output = join(dir, 'crypto-random')

  try {
    const result = compileSource(
      `const bytes = Buffer.alloc(8)
const filled = crypto.getRandomValues(bytes)
console.log(filled.length, bytes.length, filled[0] >= 0, filled[0] < 256)

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
    assert.equal(run.stdout, '8 8 1 1\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C Map and Set methods compile and run with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-collections-'))
  const source = join(dir, 'collections.c')
  const output = join(dir, 'collections')

  try {
    const result = compileSource(
      `const scores: Map<string, number> = new Map()
scores.set('Ada', 7)
const score = scores.get('Ada') ?? 0
const missing = scores.get('Grace') ?? 9
const hadAda = scores.has('Ada')
const removed = scores.delete('Ada')
const hasAda = scores.has('Ada')
console.log(score, missing, hadAda, removed, hasAda, scores.size)
scores.set('Grace', 9)
scores.clear()
console.log(scores.get('Grace') ?? 11, scores.has('Grace'), scores.size)

const names: Set<string> = new Set()
names.add('Ada')
const hadName = names.has('Ada')
const removedName = names.delete('Ada')
const hasName = names.has('Ada')
console.log(hadName, removedName, hasName, names.size)
names.add('Grace')
names.clear()
console.log(names.has('Grace'), names.size)

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
    assert.equal(run.stdout, '7 9 1 1 0 0\n11 0 0\n1 1 0 0\n0 0\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C Map and Set method chains compile and run with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-collection-chains-'))
  const source = join(dir, 'collection-chains.c')
  const output = join(dir, 'collection-chains')

  try {
    const result = compileSource(
      `const scores: Map<string, number> = new Map()
const score = scores.set('Ada', 7).get('Ada') ?? 0
const hasScore = scores.set('Grace', 9).has('Grace')

const names: Set<string> = new Set()
const hasName = names.add('Ada').has('Ada')
const removed = names.add('Grace').delete('Grace')

console.log(score, hasScore, hasName, removed, names.size)

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
    assert.equal(run.stdout, '7 1 1 1 1\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C collection values cross function boundaries with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-collection-boundaries-'))
  const source = join(dir, 'collection-boundaries.c')
  const output = join(dir, 'collection-boundaries')

  try {
    const result = compileSource(
      `function makeNums(): number[] {
  const nums = [2, 3, 5]

  return nums
}

function sumNums(nums: number[]): number {
  let total = 0

  for (const value of nums) {
    total = total + value
  }

  return total
}

function makeScores(): Map<string, number> {
  const scores: Map<string, number> = new Map([['Ada', 7], ['Grace', 9]])

  return scores
}

function totalScores(scores: Map<string, number>): number {
  let total = 0

  for (const entry of scores.set('Alan', 5)) {
    total = total + entry.value
  }

  return total
}

function makeSeen(): Set<string> {
  const seen: Set<string> = new Set(['Ada'])
  seen.add('Grace')

  return seen
}

function seenCount(seen: Set<string>): number {
  let count = 0

  if (seen.has('Ada')) {
    count = count + 1
  }

  if (seen.has('Grace')) {
    count = count + 1
  }

  return count
}

const nums = makeNums()
const scores = makeScores()
const seen = makeSeen()
const sumFromNums = sumNums(nums)
const sumFromCall = sumNums(makeNums())
const totalFromScores = totalScores(scores)
const totalFromCall = totalScores(makeScores())
const seenFromSeen = seenCount(seen)
const seenSizeFromCall = makeSeen().size

console.log(sumFromNums, sumFromCall, totalFromScores, totalFromCall, scores.size, seenFromSeen, seenSizeFromCall)

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
    assert.equal(run.stdout, '10 10 21 21 3 2 2\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C Map and Set array literal constructors compile and run with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-collection-constructors-'))
  const source = join(dir, 'collection-constructors.c')
  const output = join(dir, 'collection-constructors')

  try {
    const result = compileSource(
      `const scores: Map<string, number> = new Map([['Ada', 7], ['Grace', 9]])
const names: Set<string> = new Set(['Ada', 'Grace'])
const adaScore = scores.get('Ada') ?? 0
const graceScore = scores.get('Grace') ?? 0

console.log(adaScore, graceScore, names.has('Ada'), names.has('Grace'), scores.size, names.size)

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
    assert.equal(run.stdout, '7 9 1 1 2 2\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C Map and Set object fields compile and run with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-collection-fields-'))
  const source = join(dir, 'collection-fields.c')
  const output = join(dir, 'collection-fields')

  try {
    const result = compileSource(
      `type Bag = {
  scores: Map<string, number>,
  labels: Map<string, string>,
  names: Set<string>
}

const scores: Map<string, number> = new Map([['Ada', 7]])
const labels: Map<string, string> = new Map([['Ada', 'ok']])
const names: Set<string> = new Set(['Ada'])
const bag: Bag = { scores, labels, names }
bag.scores['Grace'] = 9
const adaScore = bag.scores.get('Ada') ?? 0
const graceScore = bag.scores['Grace'] ?? 0
const label = bag.labels.get('Ada') ?? 'missing'
const hasAda = bag['names'].has('Ada')
bag.names.clear()

console.log(adaScore, graceScore, label, hasAda, bag.scores.size, bag.names.size)

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
    assert.equal(run.stdout, '7 9 ok 1 2 0\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C Map bracket syntax compiles and runs with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-map-brackets-'))
  const source = join(dir, 'map-brackets.c')
  const output = join(dir, 'map-brackets')

  try {
    const result = compileSource(
      `const scores: Map<string, number> = new Map()
scores['Ada'] = 7
const score = scores['Ada'] ?? 0
const missing = scores['Grace'] ?? 9

console.log(score, missing, scores.size)

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
    assert.equal(run.stdout, '7 9 1\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})
