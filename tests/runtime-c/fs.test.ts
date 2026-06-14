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
} from '../helpers/runtime-c.ts'



test('C runtime fs adapter resolves async file promises through the loop', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-fs-runtime-'))
  const source = join(dir, 'fs-runtime.c')
  const output = join(dir, 'fs-runtime')
  const defaultPath = join(dir, 'default-fs.txt')
  const defaultPathLiteral = JSON.stringify(defaultPath)
  const defaultPathLen = Buffer.byteLength(defaultPath)

  try {
    await writeFile(
      source,
      `#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "ccjs/allocator.h"
#include "ccjs/array.h"
#include "ccjs/fs.h"
#include "ccjs/object.h"
#include "ccjs/string.h"

typedef struct fs_state {
  int reads;
  int writes;
  int dirs;
  char written[32];
  size_t written_len;
} fs_state;

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

static int path_equals(const char* path, size_t path_len, const char* expected, size_t expected_len) {
  return path_len == expected_len && memcmp(path, expected, expected_len) == 0;
}

static ccjs_status read_file(void* user, ccjs_allocator* allocator, const char* path, size_t path_len, ccjs_value* out) {
  fs_state* state = (fs_state*)user;
  state->reads += 1;

  if (path_equals(path, path_len, "missing", 7)) {
    return CCJS_ERR_FIELD;
  }

  return ccjs_string_from_literal(allocator, "hello fs", 8, out);
}

static ccjs_status write_file(void* user, const char* path, size_t path_len, const char* bytes, size_t byte_len) {
  fs_state* state = (fs_state*)user;
  state->writes += 1;

  if (path == 0 || bytes == 0 || path_len == 0 || byte_len >= sizeof(state->written)) {
    return CCJS_ERR_TYPE;
  }

  memcpy(state->written, bytes, byte_len);
  state->written[byte_len] = '\\0';
  state->written_len = byte_len;

  return CCJS_OK;
}

static ccjs_status read_dir(void* user, ccjs_allocator* allocator, const char* path, size_t path_len, ccjs_value* out) {
  fs_state* state = (fs_state*)user;
  state->dirs += 1;

  if (path == 0 || path_len == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_value entries = ccjs_undefined_value();
  ccjs_value first = ccjs_undefined_value();
  ccjs_value second = ccjs_undefined_value();

  if (ccjs_array_new(allocator, 0, &entries) != CCJS_OK) return CCJS_ERR_OOM;
  if (ccjs_string_from_literal(allocator, "beta.txt", 8, &first) != CCJS_OK) return CCJS_ERR_OOM;
  if (ccjs_array_push(entries, first) != CCJS_OK) return CCJS_ERR_OOM;
  ccjs_release(first);
  if (ccjs_string_from_literal(allocator, "alpha.txt", 9, &second) != CCJS_OK) return CCJS_ERR_OOM;
  if (ccjs_array_push(entries, second) != CCJS_OK) return CCJS_ERR_OOM;
  ccjs_release(second);
  *out = entries;

  return CCJS_OK;
}

int main(void) {
  ccjs_allocator allocator = { 0, test_alloc, test_realloc, test_free };
  fs_state state = { 0, 0, 0, { 0 }, 0 };
  ccjs_fs_adapter adapter = {
    .user = &state,
    .read_file = read_file,
    .write_file = write_file,
    .read_dir = read_dir
  };
  ccjs_loop loop;
  ccjs_promise* read_promise = 0;
  ccjs_promise* dir_promise = 0;
  ccjs_promise* write_promise = 0;
  ccjs_promise* missing_promise = 0;
  ccjs_value default_text = ccjs_undefined_value();
  ccjs_value sync_text = ccjs_undefined_value();
  ccjs_value sync_entries = ccjs_undefined_value();
  ccjs_value async_text = ccjs_undefined_value();
  ccjs_value async_entries = ccjs_undefined_value();
  ccjs_value write_result = ccjs_undefined_value();
  ccjs_value missing_error = ccjs_undefined_value();
  ccjs_value missing_error_name = ccjs_undefined_value();
  ccjs_value missing_error_message = ccjs_undefined_value();
  ccjs_value missing_error_code = ccjs_undefined_value();
  ccjs_value first_entry = ccjs_undefined_value();
  size_t sync_entry_count = 0;
  size_t async_entry_count = 0;

  if (ccjs_fs_write_file_sync(${defaultPathLiteral}, ${defaultPathLen}, "default", 7) != CCJS_OK) return 1;
  if (ccjs_fs_read_file_sync(&allocator, ${defaultPathLiteral}, ${defaultPathLen}, &default_text) != CCJS_OK) return 2;
  if (default_text.tag != CCJS_TAG_STRING || default_text.as.ref == 0) return 3;
  ccjs_string* default_string = (ccjs_string*)default_text.as.ref;
  if (default_string->len != 7 || memcmp(default_string->bytes, "default", 7) != 0) return 4;
  ccjs_release(default_text);
  default_text = ccjs_undefined_value();

  ccjs_fs_set_adapter(adapter);
  if (ccjs_fs_read_file_sync(&allocator, "sync", 4, &sync_text) != CCJS_OK) return 5;
  if (ccjs_fs_write_file_sync("sync-out", 8, "disk", 4) != CCJS_OK) return 6;
  if (ccjs_fs_read_dir_sync(&allocator, "sync-dir", 8, &sync_entries) != CCJS_OK) return 7;
  if (ccjs_array_len(sync_entries, &sync_entry_count) != CCJS_OK || sync_entry_count != 2) return 8;
  if (state.reads != 1 || state.writes != 1 || state.dirs != 1) return 9;

  if (ccjs_loop_init(&loop, &allocator) != CCJS_OK) return 10;
  if (ccjs_fs_read_file(&loop, "async", 5, &read_promise) != CCJS_OK) return 11;
  if (ccjs_fs_read_dir(&loop, "async-dir", 9, &dir_promise) != CCJS_OK) return 12;
  if (ccjs_fs_write_file(&loop, "async-out", 9, "saved", 5, &write_promise) != CCJS_OK) return 13;
  if (ccjs_fs_read_file(&loop, "missing", 7, &missing_promise) != CCJS_OK) return 14;
  if (state.reads != 1 || state.writes != 1 || state.dirs != 1) return 15;
  if (ccjs_loop_pending_immediates(&loop) != 4) return 16;
  if (ccjs_loop_poll(&loop, 0) != CCJS_OK) return 17;
  if (ccjs_loop_has_work(&loop)) return 18;
  if (ccjs_promise_get_state(read_promise) != CCJS_PROMISE_FULFILLED) return 19;
  if (ccjs_promise_get_state(dir_promise) != CCJS_PROMISE_FULFILLED) return 20;
  if (ccjs_promise_get_state(write_promise) != CCJS_PROMISE_FULFILLED) return 21;
  if (ccjs_promise_get_state(missing_promise) != CCJS_PROMISE_REJECTED) return 22;
  if (ccjs_promise_get_result(read_promise, &async_text) != CCJS_OK) return 23;
  if (ccjs_promise_get_result(dir_promise, &async_entries) != CCJS_OK) return 24;
  if (ccjs_array_len(async_entries, &async_entry_count) != CCJS_OK || async_entry_count != 2) return 25;
  if (ccjs_array_get(async_entries, 0, &first_entry) != CCJS_OK) return 26;
  if (ccjs_promise_get_result(write_promise, &write_result) != CCJS_OK) return 27;
  if (write_result.tag != CCJS_TAG_UNDEFINED) return 28;
  if (ccjs_promise_get_result(missing_promise, &missing_error) != CCJS_OK) return 29;
  if (missing_error.tag != CCJS_TAG_OBJECT || missing_error.as.ref == 0) return 30;
  if (ccjs_object_get(missing_error, "name", 4, &missing_error_name) != CCJS_OK) return 31;
  if (ccjs_object_get(missing_error, "message", 7, &missing_error_message) != CCJS_OK) return 32;
  if (ccjs_object_get(missing_error, "code", 4, &missing_error_code) != CCJS_OK) return 33;

  ccjs_string* sync_string = (ccjs_string*)sync_text.as.ref;
  ccjs_string* async_string = (ccjs_string*)async_text.as.ref;
  ccjs_string* first_string = (ccjs_string*)first_entry.as.ref;
  ccjs_string* error_name = (ccjs_string*)missing_error_name.as.ref;
  ccjs_string* error_message = (ccjs_string*)missing_error_message.as.ref;
  ccjs_string* error_code = (ccjs_string*)missing_error_code.as.ref;
  printf("%.*s %.*s %d %zu %zu %.*s %.*s %.*s %.*s %.*s\\n", (int)sync_string->len, sync_string->bytes, (int)async_string->len, async_string->bytes, state.writes, sync_entry_count, async_entry_count, (int)first_string->len, first_string->bytes, (int)state.written_len, state.written, (int)error_name->len, error_name->bytes, (int)error_code->len, error_code->bytes, (int)error_message->len, error_message->bytes);

  ccjs_release(first_entry);
  ccjs_release(missing_error_code);
  ccjs_release(missing_error_message);
  ccjs_release(missing_error_name);
  ccjs_release(missing_error);
  ccjs_release(write_result);
  ccjs_release(async_entries);
  ccjs_release(async_text);
  ccjs_release(sync_entries);
  ccjs_release(sync_text);
  ccjs_promise_release(missing_promise);
  ccjs_promise_release(write_promise);
  ccjs_promise_release(dir_promise);
  ccjs_promise_release(read_promise);
  ccjs_loop_dispose(&loop);
  ccjs_fs_clear_adapter();
  return 0;
}
`
    )

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(
      run.stdout,
      'hello fs hello fs 2 2 2 beta.txt saved FsError ERR_FS_OPERATION filesystem operation failed\n'
    )
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('C runtime fs adapter supports stat lstat access and Stats helpers', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-fs-stat-adapter-'))
  const source = join(dir, 'fs-stat-adapter.c')
  const output = join(dir, 'fs-stat-adapter')

  try {
    await writeFile(
      source,
      `#include <stdio.h>
#include <stdlib.h>
#include "ccjs/allocator.h"
#include "ccjs/fs.h"
#include "ccjs/promise.h"

typedef struct fs_state {
  int stats;
  int lstats;
  int accesses;
} fs_state;

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

static ccjs_status stat_file(void* user, ccjs_allocator* allocator, const char* path, size_t path_len, ccjs_value* out) {
  fs_state* state = (fs_state*)user;
  (void)path;
  (void)path_len;
  state->stats += 1;
  return ccjs_fs_stats_new(allocator, 42, 33188, 1000, true, false, out);
}

static ccjs_status lstat_file(void* user, ccjs_allocator* allocator, const char* path, size_t path_len, ccjs_value* out) {
  fs_state* state = (fs_state*)user;
  (void)path;
  (void)path_len;
  state->lstats += 1;
  return ccjs_fs_stats_new(allocator, 7, 16877, 2000, false, true, out);
}

static ccjs_status access_file(void* user, const char* path, size_t path_len, int mode) {
  fs_state* state = (fs_state*)user;
  (void)path;
  (void)path_len;
  state->accesses += 1;
  return mode == CCJS_FS_R_OK ? CCJS_OK : CCJS_ERR_FIELD;
}

int main(void) {
  ccjs_allocator allocator = { 0, test_alloc, test_realloc, test_free };
  fs_state state = { 0, 0, 0 };
  ccjs_fs_adapter adapter = {
    .user = &state,
    .stat = stat_file,
    .lstat = lstat_file,
    .access = access_file
  };
  ccjs_loop loop;
  ccjs_promise* stat_promise = 0;
  ccjs_promise* lstat_promise = 0;
  ccjs_promise* access_promise = 0;
  ccjs_value sync_stat = ccjs_undefined_value();
  ccjs_value sync_lstat = ccjs_undefined_value();
  ccjs_value async_stat = ccjs_undefined_value();
  ccjs_value async_lstat = ccjs_undefined_value();

  ccjs_fs_set_adapter(adapter);
  if (ccjs_fs_stat_sync(&allocator, "file", 4, &sync_stat) != CCJS_OK) return 1;
  if (ccjs_fs_lstat_sync(&allocator, "dir", 3, &sync_lstat) != CCJS_OK) return 2;
  if (ccjs_fs_access_sync("file", 4, CCJS_FS_R_OK) != CCJS_OK) return 3;
  if (!ccjs_fs_stats_is_file(sync_stat)) return 4;
  if (!ccjs_fs_stats_is_directory(sync_lstat)) return 5;
  if (ccjs_loop_init(&loop, &allocator) != CCJS_OK) return 6;
  if (ccjs_fs_stat(&loop, "file", 4, &stat_promise) != CCJS_OK) return 7;
  if (ccjs_fs_lstat(&loop, "dir", 3, &lstat_promise) != CCJS_OK) return 8;
  if (ccjs_fs_access(&loop, "file", 4, CCJS_FS_R_OK, &access_promise) != CCJS_OK) return 9;
  if (ccjs_loop_poll(&loop, 0) != CCJS_OK) return 10;
  if (ccjs_promise_get_state(stat_promise) != CCJS_PROMISE_FULFILLED) return 11;
  if (ccjs_promise_get_state(lstat_promise) != CCJS_PROMISE_FULFILLED) return 12;
  if (ccjs_promise_get_state(access_promise) != CCJS_PROMISE_FULFILLED) return 13;
  if (ccjs_promise_get_result(stat_promise, &async_stat) != CCJS_OK) return 14;
  if (ccjs_promise_get_result(lstat_promise, &async_lstat) != CCJS_OK) return 15;
  if (!ccjs_fs_stats_is_file(async_stat)) return 16;
  if (!ccjs_fs_stats_is_directory(async_lstat)) return 17;
  printf("%d %d %d\\n", state.stats, state.lstats, state.accesses);
  ccjs_release(async_lstat);
  ccjs_release(async_stat);
  ccjs_release(sync_lstat);
  ccjs_release(sync_stat);
  ccjs_promise_release(access_promise);
  ccjs_promise_release(lstat_promise);
  ccjs_promise_release(stat_promise);
  ccjs_loop_dispose(&loop);
  ccjs_fs_clear_adapter();
  return 0;
}
`
    )

    const compile = await compileRuntimeProgram(source, output)

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, '2 2 2\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C fs.promises calls compile and run without libuv', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-fs-codegen-'))
  const source = join(dir, 'fs-codegen.c')
  const output = join(dir, 'fs-codegen')
  const input = join(dir, 'value.txt')
  const copied = join(dir, 'out.txt')

  try {
    await writeFile(input, 'saved')

    const result = compileSource(
      `import fs from 'node:fs'

const read = await fs.promises.readFile(${JSON.stringify(input)}, 'utf8')
await fs.promises.writeFile(${JSON.stringify(copied)}, read)

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
    assert.equal(await readFile(copied, 'utf8'), 'saved')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C fs.promises.readdir awaits hosted directory entries', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-fs-readdir-'))
  const entriesDir = join(dir, 'entries')
  const missingDir = join(dir, 'missing')
  const source = join(dir, 'fs-readdir.c')
  const output = join(dir, 'fs-readdir')

  try {
    await mkdir(entriesDir)
    await writeFile(join(entriesDir, 'beta.txt'), '')
    await writeFile(join(entriesDir, 'alpha.txt'), '')

    const result = compileSource(
      `import fs from 'node:fs'

const entries = await fs.promises.readdir(${JSON.stringify(entriesDir)})
const names = entries.sort()
console.log(names[0], names[1])

try {
  await fs.promises.readdir(${JSON.stringify(missingDir)})
} catch (error) {
  console.log(error.name, error.code, error.message)
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
    assert.equal(run.stdout, 'alpha.txt beta.txt\nFsError ERR_FS_OPERATION filesystem operation failed\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C fs.promises binary read/write copies hosted bytes', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-fs-bytes-'))
  const input = join(dir, 'input.bin')
  const copied = join(dir, 'copied.bin')
  const source = join(dir, 'fs-bytes.c')
  const output = join(dir, 'fs-bytes')
  const data = Buffer.from([0, 1, 2, 3, 255, 10, 13])

  try {
    await writeFile(input, data)

    const result = compileSource(
      `import fs from 'node:fs'

const bytes = await fs.promises.readFile(${JSON.stringify(input)})
await fs.promises.writeFile(${JSON.stringify(copied)}, bytes)

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
    assert.deepEqual(await readFile(copied), data)
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C node:fs promises copy hosted files and read entries', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-fs-node-promises-'))
  const entriesDir = join(dir, 'entries')
  const textInput = join(dir, 'input.txt')
  const textCopied = join(dir, 'copied.txt')
  const bytesInput = join(dir, 'input.bin')
  const bytesCopied = join(dir, 'copied.bin')
  const mutationRoot = join(dir, 'created')
  const mutationNested = join(mutationRoot, 'nested')
  const mutationInput = join(dir, 'mutation-input.txt')
  const mutationRenamed = join(dir, 'mutation-renamed.txt')
  const mutationMissing = join(dir, 'missing-for-rm.txt')
  const appendedText = join(dir, 'appended.txt')
  const appendedTextCopy = join(dir, 'appended-copy.txt')
  const appendedBytes = join(dir, 'appended.bin')
  const appendedBytesCopy = join(dir, 'appended-copy.bin')
  const promiseLink = join(dir, 'promise-link.txt')
  const source = join(dir, 'fs-node-promises.c')
  const output = join(dir, 'fs-node-promises')
  const data = Buffer.from([9, 8, 7, 6, 0, 255])

  try {
    await mkdir(entriesDir)
    await writeFile(join(entriesDir, 'beta.txt'), '')
    await writeFile(join(entriesDir, 'alpha.txt'), '')
    await writeFile(textInput, 'node text')
    await writeFile(bytesInput, data)
    await writeFile(mutationInput, 'move me')

    const result = compileSource(
      `import fs from 'node:fs'

const text = await fs.promises.readFile(${JSON.stringify(textInput)}, 'utf8')
await fs.promises.writeFile(${JSON.stringify(textCopied)}, text)

const bytes: Buffer = await fs.promises.readFile(${JSON.stringify(bytesInput)})
await fs.promises.writeFile(${JSON.stringify(bytesCopied)}, bytes)

const entries = await fs.promises.readdir(${JSON.stringify(entriesDir)})
const dirents = await fs.promises.readdir(${JSON.stringify(entriesDir)}, { withFileTypes: true })
const stats = await fs.promises.stat(${JSON.stringify(textInput)})
await fs.promises.access(${JSON.stringify(textInput)}, fs.constants.R_OK)
await fs.promises.mkdir(${JSON.stringify(mutationNested)}, { recursive: true })
await fs.promises.rename(${JSON.stringify(mutationInput)}, ${JSON.stringify(mutationRenamed)})
await fs.promises.access(${JSON.stringify(mutationRenamed)}, fs.constants.R_OK)
await fs.promises.unlink(${JSON.stringify(mutationRenamed)})
await fs.promises.rm(${JSON.stringify(mutationRoot)}, { recursive: true, force: true })
await fs.promises.rm(${JSON.stringify(mutationMissing)}, { force: true })
await fs.promises.writeFile(${JSON.stringify(appendedText)}, 'one')
await fs.promises.appendFile(${JSON.stringify(appendedText)}, ' two')
await fs.promises.copyFile(${JSON.stringify(appendedText)}, ${JSON.stringify(appendedTextCopy)})
await fs.promises.writeFile(${JSON.stringify(appendedBytes)}, bytes)
await fs.promises.appendFile(${JSON.stringify(appendedBytes)}, bytes)
await fs.promises.copyFile(${JSON.stringify(appendedBytes)}, ${JSON.stringify(appendedBytesCopy)})
await fs.promises.symlink(${JSON.stringify(textInput)}, ${JSON.stringify(promiseLink)})
const linkTarget = await fs.promises.readlink(${JSON.stringify(promiseLink)})
const realTarget = await fs.promises.realpath(${JSON.stringify(promiseLink)})
const names = entries.sort()
const firstDirent = dirents[0]
console.log(text, names[0], names[1], bytes.length, stats.isFile(), dirents.length, firstDirent.isFile(), linkTarget === ${JSON.stringify(textInput)}, realTarget.length > 0)

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
    assert.equal(run.stdout, 'node text alpha.txt beta.txt 6 1 2 1 1 1\n')
    assert.equal(await readFile(textCopied, 'utf8'), 'node text')
    assert.deepEqual(await readFile(bytesCopied), data)
    await assert.rejects(readFile(mutationInput, 'utf8'))
    await assert.rejects(readFile(mutationRenamed, 'utf8'))
    await assert.rejects(readFile(mutationNested, 'utf8'))
    assert.equal(await readFile(appendedTextCopy, 'utf8'), 'one two')
    assert.deepEqual(await readFile(appendedBytesCopy), Buffer.concat([data, data]))
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C fs sync helpers copy hosted files and read entries', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-fs-sync-'))
  const entriesDir = join(dir, 'entries')
  const textInput = join(dir, 'input.txt')
  const textCopied = join(dir, 'copied.txt')
  const bytesInput = join(dir, 'input.bin')
  const bytesCopied = join(dir, 'copied.bin')
  const mutationRoot = join(dir, 'sync-created')
  const mutationNested = join(mutationRoot, 'nested')
  const mutationInput = join(dir, 'sync-mutation-input.txt')
  const mutationRenamed = join(dir, 'sync-mutation-renamed.txt')
  const mutationMissing = join(dir, 'sync-missing-for-rm.txt')
  const appendedText = join(dir, 'sync-appended.txt')
  const appendedTextCopy = join(dir, 'sync-appended-copy.txt')
  const appendedBytes = join(dir, 'sync-appended.bin')
  const appendedBytesCopy = join(dir, 'sync-appended-copy.bin')
  const syncLink = join(dir, 'sync-link.txt')
  const source = join(dir, 'fs-sync.c')
  const output = join(dir, 'fs-sync')
  const data = Buffer.from([5, 4, 3, 2, 1, 0, 255])

  try {
    await mkdir(entriesDir)
    await writeFile(join(entriesDir, 'beta.txt'), '')
    await writeFile(join(entriesDir, 'alpha.txt'), '')
    await writeFile(textInput, 'sync text')
    await writeFile(bytesInput, data)
    await writeFile(mutationInput, 'sync move')

    const result = compileSource(
      `import fs from 'node:fs'

const text = fs.readFileSync(${JSON.stringify(textInput)}, 'utf8')
fs.writeFileSync(${JSON.stringify(textCopied)}, text)
const bytes = fs.readFileSync(${JSON.stringify(bytesInput)})
fs.writeFileSync(${JSON.stringify(bytesCopied)}, bytes)
const entries = fs.readdirSync(${JSON.stringify(entriesDir)})
const dirents = fs.readdirSync(${JSON.stringify(entriesDir)}, { withFileTypes: true })
const stats = fs.statSync(${JSON.stringify(textInput)})
fs.accessSync(${JSON.stringify(textInput)}, fs.constants.R_OK)
fs.mkdirSync(${JSON.stringify(mutationNested)}, { recursive: true })
fs.renameSync(${JSON.stringify(mutationInput)}, ${JSON.stringify(mutationRenamed)})
fs.accessSync(${JSON.stringify(mutationRenamed)}, fs.constants.R_OK)
fs.unlinkSync(${JSON.stringify(mutationRenamed)})
fs.rmSync(${JSON.stringify(mutationRoot)}, { recursive: true, force: true })
fs.rmSync(${JSON.stringify(mutationMissing)}, { force: true })
fs.writeFileSync(${JSON.stringify(appendedText)}, 'one')
fs.appendFileSync(${JSON.stringify(appendedText)}, ' two')
fs.copyFileSync(${JSON.stringify(appendedText)}, ${JSON.stringify(appendedTextCopy)})
fs.writeFileSync(${JSON.stringify(appendedBytes)}, bytes)
fs.appendFileSync(${JSON.stringify(appendedBytes)}, bytes)
fs.copyFileSync(${JSON.stringify(appendedBytes)}, ${JSON.stringify(appendedBytesCopy)})
fs.symlinkSync(${JSON.stringify(textInput)}, ${JSON.stringify(syncLink)})
const linkTarget = fs.readlinkSync(${JSON.stringify(syncLink)})
const realTarget = fs.realpathSync(${JSON.stringify(syncLink)})
const names = entries.sort()
const firstDirent = dirents[0]
console.log(names[0], names[1], stats.isFile(), dirents.length, firstDirent.isFile(), linkTarget === ${JSON.stringify(textInput)}, realTarget.length > 0)

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
    assert.equal(run.stdout, 'alpha.txt beta.txt 1 2 1 1 1\n')
    assert.equal(await readFile(textCopied, 'utf8'), 'sync text')
    assert.deepEqual(await readFile(bytesCopied), data)
    await assert.rejects(readFile(mutationInput, 'utf8'))
    await assert.rejects(readFile(mutationRenamed, 'utf8'))
    await assert.rejects(readFile(mutationNested, 'utf8'))
    assert.equal(await readFile(appendedTextCopy, 'utf8'), 'one two')
    assert.deepEqual(await readFile(appendedBytesCopy), Buffer.concat([data, data]))
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C async task frames await fs promises without libuv', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-async-task-frame-fs-'))
  const textInput = join(dir, 'input.txt')
  const textCopied = join(dir, 'copied.txt')
  const bytesInput = join(dir, 'input.bin')
  const bytesCopied = join(dir, 'copied.bin')
  const entriesDir = join(dir, 'entries')
  const source = join(dir, 'async-task-frame-fs.c')
  const output = join(dir, 'async-task-frame-fs')
  const data = Buffer.from([9, 8, 7, 0, 255])

  try {
    await writeFile(textInput, 'loaded')
    await writeFile(bytesInput, data)
    await mkdir(entriesDir)
    await writeFile(join(entriesDir, 'one.txt'), '')
    await writeFile(join(entriesDir, 'two.txt'), '')

    const result = compileSource(
      `import fs from 'node:fs'

async function copyText(input: string, output: string): Promise<string> {
  const text = await fs.promises.readFile(input, 'utf8')
  await fs.promises.writeFile(output, text)

  return text
}

async function copyBytes(input: string, output: string): Promise<Buffer> {
  const bytes: Buffer = await fs.promises.readFile(input)
  await fs.promises.writeFile(output, bytes)

  return bytes
}

async function listEntries(path: string): Promise<Array<string>> {
  const entries: Array<string> = await fs.promises.readdir(path)

  return entries
}

console.log(await copyText(${JSON.stringify(textInput)}, ${JSON.stringify(textCopied)}))
await copyBytes(${JSON.stringify(bytesInput)}, ${JSON.stringify(bytesCopied)})
await listEntries(${JSON.stringify(entriesDir)})
console.log('listed')

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
    assert.equal(run.stdout, 'loaded\nlisted\n')
    assert.equal(await readFile(textCopied, 'utf8'), 'loaded')
    assert.deepEqual(await readFile(bytesCopied), data)
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})
