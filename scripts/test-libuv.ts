import { access, mkdir, mkdtemp, readFile, readlink, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { normalizeNewlines, runCommand } from './lib/run-command.ts'
import { rootDir } from './lib/repo-checks.ts'

const uvHeaderPath = join(rootDir, 'third_party', 'libuv', 'include', 'uv.h')
const expectedStdout =
  'hello world 60\ntext ccjs cmake example 😀 123\nHello World!\ninterval 1\ninterval 2\ninterval 3\n'

try {
  await access(uvHeaderPath)
} catch {
  console.log(
    'Libuv checks skipped: third_party/libuv is not initialized. Run `pnpm run libuv:bootstrap` to enable them.'
  )
  process.exit(0)
}

const cmakeProbe = await runCommand('cmake', ['--version'])

if (cmakeProbe.code !== 0) {
  console.log('Libuv checks skipped: cmake is not available.')
  process.exit(0)
}

const buildDir = await mkdtemp(join(tmpdir(), 'ccjs-libuv-cmake-'))

try {
  await checkCommand('configure libuv example', 'cmake', ['-S', 'example', '-B', buildDir, '-DCCJS_LOOP_BACKEND=libuv'])
  await checkCommand('build libuv example', 'cmake', ['--build', buildDir])

  const run = await runCommand(join(buildDir, 'ccjs_cmake_example'), [], buildDir)
  const stdout = normalizeNewlines(run.stdout)

  if (run.code !== 0) {
    fail('run libuv example', run)
  } else if (stdout !== expectedStdout) {
    console.error(
      `Libuv example stdout mismatch.\nExpected: ${JSON.stringify(expectedStdout)}\nActual: ${JSON.stringify(stdout)}`
    )
    process.exitCode = 1
  } else {
    await checkLibuvTimerRuntime(buildDir)
    await checkLibuvConsoleRuntime(buildDir)
    await checkLibuvDgramRuntime(buildDir)
    await checkLibuvNetRuntime(buildDir)
    await checkLibuvHttpRuntime(buildDir)
    await checkLibuvFetchRuntime(buildDir)
    await checkLibuvFsRuntime(buildDir)
    console.log('Libuv checks passed')
  }
} finally {
  await rm(buildDir, {
    recursive: true,
    force: true
  })
}

async function checkLibuvTimerRuntime(workDir: string): Promise<void> {
  const sourceDir = join(workDir, 'timer-smoke-src')
  const timerBuildDir = join(workDir, 'timer-smoke-build')

  await mkdir(sourceDir, { recursive: true })
  await writeFile(
    join(sourceDir, 'CMakeLists.txt'),
    `cmake_minimum_required(VERSION 3.20)

project(ccjs_libuv_timer_smoke C)

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)

add_subdirectory("${rootDir}/runtime/c" "\${CMAKE_CURRENT_BINARY_DIR}/ccjs_runtime")
add_executable(ccjs_libuv_timer_smoke timer-smoke.c)
target_link_libraries(ccjs_libuv_timer_smoke PRIVATE ccjs_runtime)
`
  )
  await writeFile(
    join(sourceDir, 'timer-smoke.c'),
    `#include <stdio.h>
#include <stdlib.h>
#include "ccjs/allocator.h"
#include "ccjs/loop.h"
#include "ccjs/time.h"

typedef struct test_log {
  int immediate;
  int timeout;
  int canceled;
  int interval;
  int finalized;
  ccjs_timer_handle* interval_handle;
} test_log;

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

static ccjs_status on_immediate(void* context) {
  ((test_log*)context)->immediate += 1;
  return CCJS_OK;
}

static ccjs_status on_timeout(void* context) {
  ((test_log*)context)->timeout += 1;
  return CCJS_OK;
}

static ccjs_status on_canceled(void* context) {
  ((test_log*)context)->canceled += 1;
  return CCJS_OK;
}

static ccjs_status on_interval(void* context) {
  test_log* log = (test_log*)context;
  log->interval += 1;

  if (log->interval >= 3) {
    ccjs_loop_clear_timer(log->interval_handle);
  }

  return CCJS_OK;
}

static void on_finalize(void* context) {
  ((test_log*)context)->finalized += 1;
}

int main(void) {
  ccjs_allocator allocator = { 0, test_alloc, test_realloc, test_free };
  ccjs_loop loop;
  ccjs_timer_handle* immediate = 0;
  ccjs_timer_handle* timeout = 0;
  ccjs_timer_handle* canceled = 0;
  ccjs_timer_handle* interval = 0;
  test_log log = { 0, 0, 0, 0, 0, 0 };
  int guard = 0;

  if (ccjs_loop_init(&loop, &allocator) != CCJS_OK) return 1;
  if (ccjs_loop_queue_immediate(&loop, on_immediate, &log, on_finalize, &immediate) != CCJS_OK) return 2;
  if (ccjs_loop_set_timeout(&loop, 0, on_timeout, &log, on_finalize, &timeout) != CCJS_OK) return 3;
  if (ccjs_loop_set_timeout(&loop, 0, on_canceled, &log, on_finalize, &canceled) != CCJS_OK) return 4;
  if (ccjs_loop_set_interval(&loop, 0, on_interval, &log, on_finalize, &interval) != CCJS_OK) return 5;
  log.interval_handle = interval;
  ccjs_loop_clear_timer(canceled);
  ccjs_loop_clear_timer(canceled);

  if (log.immediate != 0 || log.timeout != 0 || log.canceled != 0 || log.interval != 0) return 6;

  while (ccjs_loop_has_work(&loop) && guard < 20) {
    if (ccjs_loop_poll(&loop, ccjs_performance_now()) != CCJS_OK) return 7;
    guard += 1;
  }

  if (guard >= 20) return 8;
  if (log.immediate != 1 || log.timeout != 1 || log.canceled != 0 || log.interval != 3) return 9;
  if (ccjs_loop_has_work(&loop)) return 10;

  ccjs_loop_dispose(&loop);
  printf("%d %d %d %d %d\\n", log.immediate, log.timeout, log.canceled, log.interval, log.finalized);
  return 0;
}
`
  )

  await checkCommand('configure libuv timer smoke', 'cmake', [
    '-S',
    sourceDir,
    '-B',
    timerBuildDir,
    '-DCCJS_LOOP_BACKEND=libuv'
  ])
  await checkCommand('build libuv timer smoke', 'cmake', ['--build', timerBuildDir])

  const run = await runCommand(join(timerBuildDir, 'ccjs_libuv_timer_smoke'), [])
  const stdout = normalizeNewlines(run.stdout)

  if (run.code !== 0) {
    fail('run libuv timer smoke', run)
  }

  const expected = '1 1 0 3 4\n'

  if (stdout !== expected) {
    console.error(`Libuv timer smoke stdout mismatch.\nExpected: ${JSON.stringify(expected)}\nActual: ${JSON.stringify(stdout)}`)
    process.exit(1)
  }
}

async function checkLibuvFsRuntime(workDir: string): Promise<void> {
  const sourceDir = join(workDir, 'fs-smoke-src')
  const fsBuildDir = join(workDir, 'fs-smoke-build')
  const dataDir = join(workDir, 'fs-smoke-data')
  const entriesDir = join(dataDir, 'entries')
  const textInput = join(dataDir, 'input.txt')
  const textOutput = join(dataDir, 'output.txt')
  const bytesInput = join(dataDir, 'input.bin')
  const bytesOutput = join(dataDir, 'output.bin')
  const missingInput = join(dataDir, 'missing.txt')
  const mutationRoot = join(dataDir, 'created')
  const mutationNested = join(mutationRoot, 'nested')
  const mutationInput = join(dataDir, 'mutation-input.txt')
  const mutationRenamed = join(dataDir, 'mutation-renamed.txt')
  const mutationMissing = join(dataDir, 'mutation-missing.txt')
  const appendText = join(dataDir, 'append.txt')
  const appendTextCopy = join(dataDir, 'append-copy.txt')
  const symlinkPath = join(dataDir, 'input-link.txt')
  const byteData = Buffer.from([0, 1, 2, 3, 250, 255])

  await mkdir(sourceDir, { recursive: true })
  await mkdir(entriesDir, { recursive: true })
  await writeFile(textInput, 'uv text')
  await writeFile(bytesInput, byteData)
  await writeFile(mutationInput, 'uv mutation')
  await writeFile(appendText, 'uv')
  await writeFile(join(entriesDir, 'alpha.txt'), '')
  await writeFile(join(entriesDir, 'beta.txt'), '')
  await writeFile(
    join(sourceDir, 'CMakeLists.txt'),
    `cmake_minimum_required(VERSION 3.20)

project(ccjs_libuv_fs_smoke C)

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)

add_subdirectory("${rootDir}/runtime/c" "\${CMAKE_CURRENT_BINARY_DIR}/ccjs_runtime")
add_executable(ccjs_libuv_fs_smoke fs-smoke.c)
target_link_libraries(ccjs_libuv_fs_smoke PRIVATE ccjs_runtime)
`
  )
  await writeFile(
    join(sourceDir, 'fs-smoke.c'),
    `#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "ccjs/allocator.h"
#include "ccjs/array.h"
#include "ccjs/binary.h"
#include "ccjs/fs.h"
#include "ccjs/object.h"
#include "ccjs/string.h"
#include "ccjs/time.h"

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

static int drain_loop(ccjs_loop* loop) {
  while (ccjs_loop_has_work(loop)) {
    if (ccjs_loop_poll(loop, ccjs_performance_now()) != CCJS_OK) {
      return 0;
    }
  }

  return 1;
}

int main(void) {
  ccjs_allocator allocator = { 0, test_alloc, test_realloc, test_free };
  ccjs_loop loop;
  ccjs_promise* read_text = 0;
  ccjs_promise* write_text = 0;
  ccjs_promise* read_entries = 0;
  ccjs_promise* read_dirents = 0;
  ccjs_promise* read_bytes = 0;
  ccjs_promise* write_bytes = 0;
  ccjs_promise* stat_file = 0;
  ccjs_promise* lstat_dir = 0;
  ccjs_promise* access_file = 0;
  ccjs_promise* missing = 0;
  ccjs_value bytes_to_write = ccjs_undefined_value();
  ccjs_value text_value = ccjs_undefined_value();
  ccjs_value entries_value = ccjs_undefined_value();
  ccjs_value dirents_value = ccjs_undefined_value();
  ccjs_value first_dirent = ccjs_undefined_value();
  ccjs_value readlink_value = ccjs_undefined_value();
  ccjs_value realpath_value = ccjs_undefined_value();
  ccjs_value bytes_value = ccjs_undefined_value();
  ccjs_value stat_value = ccjs_undefined_value();
  ccjs_value lstat_value = ccjs_undefined_value();
  ccjs_value missing_error = ccjs_undefined_value();
  ccjs_value missing_code = ccjs_undefined_value();
  unsigned char output_bytes[] = { 9, 8, 7, 6, 5, 4 };
  size_t entries_len = 0;
  size_t dirents_len = 0;
  size_t bytes_len = 0;

  if (ccjs_loop_init(&loop, &allocator) != CCJS_OK) return 1;
  if (ccjs_bytes_from_data(&allocator, output_bytes, sizeof(output_bytes), &bytes_to_write) != CCJS_OK) return 2;
  if (ccjs_fs_mkdir_sync(${JSON.stringify(mutationNested)}, ${Buffer.byteLength(mutationNested)}, true) != CCJS_OK) return 31;
  if (ccjs_fs_rename_sync(${JSON.stringify(mutationInput)}, ${Buffer.byteLength(mutationInput)}, ${JSON.stringify(mutationRenamed)}, ${Buffer.byteLength(mutationRenamed)}) != CCJS_OK) return 32;
  if (ccjs_fs_access_sync(${JSON.stringify(mutationRenamed)}, ${Buffer.byteLength(mutationRenamed)}, CCJS_FS_R_OK) != CCJS_OK) return 33;
  if (ccjs_fs_unlink_sync(${JSON.stringify(mutationRenamed)}, ${Buffer.byteLength(mutationRenamed)}) != CCJS_OK) return 34;
  if (ccjs_fs_rm_sync(${JSON.stringify(mutationRoot)}, ${Buffer.byteLength(mutationRoot)}, true, true) != CCJS_OK) return 35;
  if (ccjs_fs_rm_sync(${JSON.stringify(mutationMissing)}, ${Buffer.byteLength(mutationMissing)}, false, true) != CCJS_OK) return 36;
  if (ccjs_fs_append_file_sync(${JSON.stringify(appendText)}, ${Buffer.byteLength(appendText)}, " append", 7) != CCJS_OK) return 37;
  if (ccjs_fs_copy_file_sync(${JSON.stringify(appendText)}, ${Buffer.byteLength(appendText)}, ${JSON.stringify(appendTextCopy)}, ${Buffer.byteLength(appendTextCopy)}) != CCJS_OK) return 38;
  if (ccjs_fs_symlink_sync(${JSON.stringify(textInput)}, ${Buffer.byteLength(textInput)}, ${JSON.stringify(symlinkPath)}, ${Buffer.byteLength(symlinkPath)}) != CCJS_OK) return 44;
  if (ccjs_fs_readlink_sync(&allocator, ${JSON.stringify(symlinkPath)}, ${Buffer.byteLength(symlinkPath)}, &readlink_value) != CCJS_OK) return 45;
  if (ccjs_fs_realpath_sync(&allocator, ${JSON.stringify(symlinkPath)}, ${Buffer.byteLength(symlinkPath)}, &realpath_value) != CCJS_OK) return 46;
  if (ccjs_fs_read_file(&loop, ${JSON.stringify(textInput)}, ${Buffer.byteLength(textInput)}, &read_text) != CCJS_OK) return 3;
  if (ccjs_fs_write_file(&loop, ${JSON.stringify(textOutput)}, ${Buffer.byteLength(textOutput)}, "uv saved", 8, &write_text) != CCJS_OK) return 4;
  if (ccjs_fs_read_dir(&loop, ${JSON.stringify(entriesDir)}, ${Buffer.byteLength(entriesDir)}, &read_entries) != CCJS_OK) return 5;
  if (ccjs_fs_read_dir_dirents(&loop, ${JSON.stringify(entriesDir)}, ${Buffer.byteLength(entriesDir)}, &read_dirents) != CCJS_OK) return 39;
  if (ccjs_fs_read_file_bytes(&loop, ${JSON.stringify(bytesInput)}, ${Buffer.byteLength(bytesInput)}, &read_bytes) != CCJS_OK) return 6;
  if (ccjs_fs_write_file_bytes(&loop, ${JSON.stringify(bytesOutput)}, ${Buffer.byteLength(bytesOutput)}, bytes_to_write, &write_bytes) != CCJS_OK) return 7;
  if (ccjs_fs_stat(&loop, ${JSON.stringify(textInput)}, ${Buffer.byteLength(textInput)}, &stat_file) != CCJS_OK) return 8;
  if (ccjs_fs_lstat(&loop, ${JSON.stringify(entriesDir)}, ${Buffer.byteLength(entriesDir)}, &lstat_dir) != CCJS_OK) return 9;
  if (ccjs_fs_access(&loop, ${JSON.stringify(textInput)}, ${Buffer.byteLength(textInput)}, CCJS_FS_R_OK, &access_file) != CCJS_OK) return 10;
  if (ccjs_fs_read_file(&loop, ${JSON.stringify(missingInput)}, ${Buffer.byteLength(missingInput)}, &missing) != CCJS_OK) return 11;
  if (!drain_loop(&loop)) return 12;
  if (ccjs_promise_get_state(read_text) != CCJS_PROMISE_FULFILLED) return 13;
  if (ccjs_promise_get_state(write_text) != CCJS_PROMISE_FULFILLED) return 14;
  if (ccjs_promise_get_state(read_entries) != CCJS_PROMISE_FULFILLED) return 15;
  if (ccjs_promise_get_state(read_dirents) != CCJS_PROMISE_FULFILLED) return 40;
  if (ccjs_promise_get_state(read_bytes) != CCJS_PROMISE_FULFILLED) return 16;
  if (ccjs_promise_get_state(write_bytes) != CCJS_PROMISE_FULFILLED) return 17;
  if (ccjs_promise_get_state(stat_file) != CCJS_PROMISE_FULFILLED) return 18;
  if (ccjs_promise_get_state(lstat_dir) != CCJS_PROMISE_FULFILLED) return 19;
  if (ccjs_promise_get_state(access_file) != CCJS_PROMISE_FULFILLED) return 20;
  if (ccjs_promise_get_state(missing) != CCJS_PROMISE_REJECTED) return 21;
  if (ccjs_promise_get_result(read_text, &text_value) != CCJS_OK) return 22;
  if (ccjs_promise_get_result(read_entries, &entries_value) != CCJS_OK) return 23;
  if (ccjs_promise_get_result(read_dirents, &dirents_value) != CCJS_OK) return 41;
  if (ccjs_promise_get_result(read_bytes, &bytes_value) != CCJS_OK) return 24;
  if (ccjs_promise_get_result(stat_file, &stat_value) != CCJS_OK) return 25;
  if (ccjs_promise_get_result(lstat_dir, &lstat_value) != CCJS_OK) return 26;
  if (ccjs_promise_get_result(missing, &missing_error) != CCJS_OK) return 27;
  if (ccjs_array_len(entries_value, &entries_len) != CCJS_OK) return 28;
  if (ccjs_array_len(dirents_value, &dirents_len) != CCJS_OK) return 42;
  if (ccjs_array_get(dirents_value, 0, &first_dirent) != CCJS_OK) return 43;
  if (ccjs_bytes_len(bytes_value, &bytes_len) != CCJS_OK) return 29;
  if (ccjs_object_get(missing_error, "code", 4, &missing_code) != CCJS_OK) return 30;

  ccjs_string* text = (ccjs_string*)text_value.as.ref;
  ccjs_string* code = (ccjs_string*)missing_code.as.ref;
  printf("%.*s %zu %zu %zu %s %s %s %.*s\\n", (int)text->len, text->bytes, entries_len, dirents_len, bytes_len, ccjs_fs_dirent_is_file(first_dirent) ? "true" : "false", ccjs_fs_stats_is_file(stat_value) ? "true" : "false", ccjs_fs_stats_is_directory(lstat_value) ? "true" : "false", (int)code->len, code->bytes);

  ccjs_release(missing_code);
  ccjs_release(missing_error);
  ccjs_release(lstat_value);
  ccjs_release(stat_value);
  ccjs_release(bytes_value);
  ccjs_release(first_dirent);
  ccjs_release(dirents_value);
  ccjs_release(entries_value);
  ccjs_release(text_value);
  ccjs_release(realpath_value);
  ccjs_release(readlink_value);
  ccjs_release(bytes_to_write);
  ccjs_promise_release(missing);
  ccjs_promise_release(access_file);
  ccjs_promise_release(lstat_dir);
  ccjs_promise_release(stat_file);
  ccjs_promise_release(write_bytes);
  ccjs_promise_release(read_bytes);
  ccjs_promise_release(read_dirents);
  ccjs_promise_release(read_entries);
  ccjs_promise_release(write_text);
  ccjs_promise_release(read_text);
  ccjs_loop_dispose(&loop);
  return 0;
}
`
  )

  await checkCommand('configure libuv fs smoke', 'cmake', ['-S', sourceDir, '-B', fsBuildDir, '-DCCJS_LOOP_BACKEND=libuv'])
  await checkCommand('build libuv fs smoke', 'cmake', ['--build', fsBuildDir])

  const run = await runCommand(join(fsBuildDir, 'ccjs_libuv_fs_smoke'), [])
  const stdout = normalizeNewlines(run.stdout)

  if (run.code !== 0) {
    fail('run libuv fs smoke', run)
  }

  const expected = 'uv text 2 2 6 true true true ERR_FS_OPERATION\n'

  if (stdout !== expected) {
    console.error(`Libuv fs smoke stdout mismatch.\nExpected: ${JSON.stringify(expected)}\nActual: ${JSON.stringify(stdout)}`)
    process.exit(1)
  }

  const textOutputValue = await readFile(textOutput, 'utf8')
  const bytesOutputValue = await readFile(bytesOutput)
  const appendTextCopyValue = await readFile(appendTextCopy, 'utf8')
  const linkTarget = await readlink(symlinkPath)
  const realTarget = await realpath(symlinkPath)
  const expectedRealTarget = await realpath(textInput)

  if (textOutputValue !== 'uv saved') {
    console.error(`Libuv fs smoke text output mismatch: ${JSON.stringify(textOutputValue)}`)
    process.exit(1)
  }

  if (!bytesOutputValue.equals(Buffer.from([9, 8, 7, 6, 5, 4]))) {
    console.error(`Libuv fs smoke bytes output mismatch: ${JSON.stringify([...bytesOutputValue])}`)
    process.exit(1)
  }

  if (appendTextCopyValue !== 'uv append') {
    console.error(`Libuv fs smoke append/copy output mismatch: ${JSON.stringify(appendTextCopyValue)}`)
    process.exit(1)
  }

  if (linkTarget !== textInput || realTarget !== expectedRealTarget) {
    console.error(`Libuv fs smoke link output mismatch: ${JSON.stringify({ linkTarget, realTarget, textInput, expectedRealTarget })}`)
    process.exit(1)
  }

  await expectMissing(mutationInput)
  await expectMissing(mutationRenamed)
  await expectMissing(mutationNested)
}

async function checkLibuvConsoleRuntime(workDir: string): Promise<void> {
  const sourceDir = join(workDir, 'console-smoke-src')
  const consoleBuildDir = join(workDir, 'console-smoke-build')

  await mkdir(sourceDir, { recursive: true })
  await writeFile(
    join(sourceDir, 'CMakeLists.txt'),
    `cmake_minimum_required(VERSION 3.20)

project(ccjs_libuv_console_smoke C)

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)

add_subdirectory("${rootDir}/runtime/c" "\${CMAKE_CURRENT_BINARY_DIR}/ccjs_runtime")
add_executable(ccjs_libuv_console_smoke console-smoke.c)
target_link_libraries(ccjs_libuv_console_smoke PRIVATE ccjs_runtime)
`
  )
  await writeFile(
    join(sourceDir, 'console-smoke.c'),
    `#include "ccjs/console.h"

int main(void) {
  if (ccjs_console_write_line(CCJS_CONSOLE_STDOUT, "uv console", 10) != CCJS_OK) return 1;
  if (ccjs_console_printf(CCJS_CONSOLE_STDOUT, "%d %d\\n", 1, 2) < 0) return 2;
  if (ccjs_console_write_line(CCJS_CONSOLE_STDERR, "uv err", 6) != CCJS_OK) return 3;
  return 0;
}
`
  )

  await checkCommand('configure libuv console smoke', 'cmake', [
    '-S',
    sourceDir,
    '-B',
    consoleBuildDir,
    '-DCCJS_LOOP_BACKEND=libuv'
  ])
  await checkCommand('build libuv console smoke', 'cmake', ['--build', consoleBuildDir])

  const run = await runCommand(join(consoleBuildDir, 'ccjs_libuv_console_smoke'), [])
  const stdout = normalizeNewlines(run.stdout)
  const stderr = normalizeNewlines(run.stderr)

  if (run.code !== 0) {
    fail('run libuv console smoke', run)
  }

  const expectedStdout = 'uv console\n1 2\n'
  const expectedStderr = 'uv err\n'

  if (stdout !== expectedStdout || stderr !== expectedStderr) {
    console.error(
      `Libuv console smoke output mismatch.\nExpected stdout: ${JSON.stringify(
        expectedStdout
      )}\nActual stdout: ${JSON.stringify(stdout)}\nExpected stderr: ${JSON.stringify(
        expectedStderr
      )}\nActual stderr: ${JSON.stringify(stderr)}`
    )
    process.exit(1)
  }
}

async function checkLibuvDgramRuntime(workDir: string): Promise<void> {
  const sourceDir = join(workDir, 'dgram-smoke-src')
  const dgramBuildDir = join(workDir, 'dgram-smoke-build')

  await mkdir(sourceDir, { recursive: true })
  await writeFile(
    join(sourceDir, 'CMakeLists.txt'),
    `cmake_minimum_required(VERSION 3.20)

project(ccjs_libuv_dgram_smoke C)

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)

add_subdirectory("${rootDir}/runtime/c" "\${CMAKE_CURRENT_BINARY_DIR}/ccjs_runtime")
add_executable(ccjs_libuv_dgram_smoke dgram-smoke.c)
target_link_libraries(ccjs_libuv_dgram_smoke PRIVATE ccjs_runtime)
`
  )
  await writeFile(
    join(sourceDir, 'dgram-smoke.c'),
    `#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "ccjs/allocator.h"
#include "ccjs/dgram.h"
#include "ccjs/time.h"

typedef struct test_state {
  ccjs_dgram_socket* server;
  ccjs_dgram_socket* client;
  int server_received;
  int client_received;
  char message[32];
} test_state;

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

static ccjs_status on_server_recv(void* user, ccjs_dgram_socket* socket, const char* bytes, size_t len, const char* host, int port) {
  test_state* state = (test_state*)user;
  state->server_received += 1;
  return ccjs_dgram_send(socket, bytes, len, host, port);
}

static ccjs_status on_client_recv(void* user, ccjs_dgram_socket* socket, const char* bytes, size_t len, const char* host, int port) {
  (void)socket;
  (void)host;
  (void)port;
  test_state* state = (test_state*)user;
  size_t copy_len = len >= sizeof(state->message) ? sizeof(state->message) - 1 : len;
  memcpy(state->message, bytes, copy_len);
  state->message[copy_len] = '\\0';
  state->client_received += 1;
  ccjs_dgram_close(state->client);
  ccjs_dgram_close(state->server);
  return CCJS_OK;
}

int main(void) {
  ccjs_allocator allocator = { 0, test_alloc, test_realloc, test_free };
  ccjs_loop loop;
  test_state state = { 0 };
  ccjs_status status;
  int port = 0;
  int guard = 0;

  if (ccjs_loop_init(&loop, &allocator) != CCJS_OK) return 1;
  if (ccjs_dgram_socket_new(&loop, on_server_recv, &state, &state.server) != CCJS_OK) return 2;
  if (ccjs_dgram_socket_new(&loop, on_client_recv, &state, &state.client) != CCJS_OK) return 3;
  status = ccjs_dgram_bind(state.server, "127.0.0.1", 0);
  if (status != CCJS_OK) {
    fprintf(stderr, "server bind status %d\\n", status);
    return 4;
  }
  if (ccjs_dgram_local_port(state.server, &port) != CCJS_OK) return 5;
  if (ccjs_dgram_recv_start(state.server) != CCJS_OK) return 6;
  if (ccjs_dgram_bind(state.client, "127.0.0.1", 0) != CCJS_OK) return 7;
  if (ccjs_dgram_recv_start(state.client) != CCJS_OK) return 8;
  if (ccjs_dgram_send(state.client, "ping", 4, "127.0.0.1", port) != CCJS_OK) return 9;

  while (ccjs_loop_has_work(&loop) && guard < 200) {
    if (ccjs_loop_poll(&loop, ccjs_performance_now()) != CCJS_OK) return 10;
    guard += 1;
  }

  if (guard >= 200) return 11;
  printf("%d %d %s\\n", state.server_received, state.client_received, state.message);
  ccjs_loop_dispose(&loop);
  return 0;
}
`
  )

  await checkCommand('configure libuv dgram smoke', 'cmake', [
    '-S',
    sourceDir,
    '-B',
    dgramBuildDir,
    '-DCCJS_LOOP_BACKEND=libuv'
  ])
  await checkCommand('build libuv dgram smoke', 'cmake', ['--build', dgramBuildDir])

  const run = await runCommand(join(dgramBuildDir, 'ccjs_libuv_dgram_smoke'), [])
  const stdout = normalizeNewlines(run.stdout)

  if (run.code !== 0) {
    fail('run libuv dgram smoke', run)
  }

  const expected = '1 1 ping\n'

  if (stdout !== expected) {
    console.error(`Libuv dgram smoke stdout mismatch.\nExpected: ${JSON.stringify(expected)}\nActual: ${JSON.stringify(stdout)}`)
    process.exit(1)
  }
}

async function checkLibuvNetRuntime(workDir: string): Promise<void> {
  const sourceDir = join(workDir, 'net-smoke-src')
  const netBuildDir = join(workDir, 'net-smoke-build')

  await mkdir(sourceDir, { recursive: true })
  await writeFile(
    join(sourceDir, 'CMakeLists.txt'),
    `cmake_minimum_required(VERSION 3.20)

project(ccjs_libuv_net_smoke C)

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)

add_subdirectory("${rootDir}/runtime/c" "\${CMAKE_CURRENT_BINARY_DIR}/ccjs_runtime")
add_executable(ccjs_libuv_net_smoke net-smoke.c)
target_link_libraries(ccjs_libuv_net_smoke PRIVATE ccjs_runtime)
`
  )
  await writeFile(
    join(sourceDir, 'net-smoke.c'),
    `#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "ccjs/allocator.h"
#include "ccjs/net.h"
#include "ccjs/time.h"

typedef struct test_state {
  ccjs_net_server* server;
  ccjs_net_socket* accepted;
  ccjs_net_socket* client;
  int server_received;
  int client_received;
  int client_connected;
  char message[32];
} test_state;

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

static ccjs_status on_server_data(void* user, ccjs_net_socket* socket, const char* bytes, size_t len) {
  test_state* state = (test_state*)user;
  state->server_received += 1;
  return ccjs_net_socket_write(socket, bytes, len);
}

static ccjs_status on_client_data(void* user, ccjs_net_socket* socket, const char* bytes, size_t len) {
  test_state* state = (test_state*)user;
  size_t copy_len = len >= sizeof(state->message) ? sizeof(state->message) - 1 : len;
  memcpy(state->message, bytes, copy_len);
  state->message[copy_len] = '\\0';
  state->client_received += 1;
  ccjs_net_socket_close(socket);
  ccjs_net_socket_close(state->accepted);
  ccjs_net_server_close(state->server);
  return CCJS_OK;
}

static ccjs_status on_connection(void* user, ccjs_net_server* server, ccjs_net_socket* socket) {
  (void)server;
  test_state* state = (test_state*)user;
  state->accepted = socket;
  ccjs_net_socket_set_callbacks(socket, on_server_data, 0, state);
  return ccjs_net_socket_read_start(socket);
}

static ccjs_status on_connect(void* user, ccjs_net_socket* socket, ccjs_status status) {
  test_state* state = (test_state*)user;
  if (status != CCJS_OK) return status;
  state->client_connected += 1;
  if (ccjs_net_socket_read_start(socket) != CCJS_OK) return CCJS_ERR_FIELD;
  return ccjs_net_socket_write(socket, "hello", 5);
}

int main(void) {
  ccjs_allocator allocator = { 0, test_alloc, test_realloc, test_free };
  ccjs_loop loop;
  test_state state = { 0 };
  int port = 0;
  int guard = 0;

  if (ccjs_loop_init(&loop, &allocator) != CCJS_OK) return 1;
  if (ccjs_net_server_new(&loop, on_connection, &state, &state.server) != CCJS_OK) return 2;
  if (ccjs_net_server_listen(state.server, "127.0.0.1", 0, 16) != CCJS_OK) return 3;
  if (ccjs_net_server_local_port(state.server, &port) != CCJS_OK) return 4;
  if (ccjs_net_connect(&loop, "127.0.0.1", port, on_connect, on_client_data, 0, &state, &state.client) != CCJS_OK) return 5;

  while (ccjs_loop_has_work(&loop) && guard < 400) {
    if (ccjs_loop_poll(&loop, ccjs_performance_now()) != CCJS_OK) return 6;
    guard += 1;
  }

  if (guard >= 400) return 7;
  printf("%d %d %d %s\\n", state.client_connected, state.server_received, state.client_received, state.message);
  ccjs_loop_dispose(&loop);
  return 0;
}
`
  )

  await checkCommand('configure libuv net smoke', 'cmake', [
    '-S',
    sourceDir,
    '-B',
    netBuildDir,
    '-DCCJS_LOOP_BACKEND=libuv'
  ])
  await checkCommand('build libuv net smoke', 'cmake', ['--build', netBuildDir])

  const run = await runCommand(join(netBuildDir, 'ccjs_libuv_net_smoke'), [])
  const stdout = normalizeNewlines(run.stdout)

  if (run.code !== 0) {
    fail('run libuv net smoke', run)
  }

  const expected = '1 1 1 hello\n'

  if (stdout !== expected) {
    console.error(`Libuv net smoke stdout mismatch.\nExpected: ${JSON.stringify(expected)}\nActual: ${JSON.stringify(stdout)}`)
    process.exit(1)
  }
}

async function checkLibuvHttpRuntime(workDir: string): Promise<void> {
  const sourceDir = join(workDir, 'http-smoke-src')
  const httpBuildDir = join(workDir, 'http-smoke-build')

  await mkdir(sourceDir, { recursive: true })
  await writeFile(
    join(sourceDir, 'CMakeLists.txt'),
    `cmake_minimum_required(VERSION 3.20)

project(ccjs_libuv_http_smoke C)

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)

add_subdirectory("${rootDir}/runtime/c" "\${CMAKE_CURRENT_BINARY_DIR}/ccjs_runtime")
add_executable(ccjs_libuv_http_smoke http-smoke.c)
target_link_libraries(ccjs_libuv_http_smoke PRIVATE ccjs_runtime)
`
  )
  await writeFile(
    join(sourceDir, 'http-smoke.c'),
    `#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "ccjs/allocator.h"
#include "ccjs/http.h"
#include "ccjs/net.h"
#include "ccjs/time.h"

typedef struct test_state {
  ccjs_http_server* server;
  ccjs_net_socket* client;
  int handled;
  int client_connected;
  char response[512];
} test_state;

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

static ccjs_status on_http(void* user, const ccjs_http_request* request, ccjs_http_response* response) {
  test_state* state = (test_state*)user;
  ccjs_http_header headers[] = {
    { "Content-Type", 12, "application/json", 16 },
    { "X-CCJS", 6, "libuv-http", 10 }
  };
  if (!ccjs_http_request_method_equals(request, "GET", 3)) return CCJS_ERR_FIELD;
  if (!ccjs_http_request_url_equals(request, "/hello", 6)) return CCJS_ERR_FIELD;
  state->handled += 1;
  if (ccjs_http_response_write_head(response, 201, headers, 2) != CCJS_OK) return CCJS_ERR_FIELD;
  if (ccjs_http_response_write(response, "{\\"data\\":", 8) != CCJS_OK) return CCJS_ERR_FIELD;
  return ccjs_http_response_end(response, "\\"hello\\"}", 8);
}

static ccjs_status on_client_data(void* user, ccjs_net_socket* socket, const char* bytes, size_t len) {
  test_state* state = (test_state*)user;
  size_t current = strlen(state->response);
  size_t copy_len = current + len >= sizeof(state->response) ? sizeof(state->response) - current - 1 : len;
  memcpy(state->response + current, bytes, copy_len);
  state->response[current + copy_len] = '\\0';
  if (strstr(state->response, "\\r\\n\\r\\n{\\"data\\":\\"hello\\"}") != 0) {
    ccjs_net_socket_close(socket);
    ccjs_http_server_close(state->server);
  }
  return CCJS_OK;
}

static ccjs_status on_connect(void* user, ccjs_net_socket* socket, ccjs_status status) {
  test_state* state = (test_state*)user;
  if (status != CCJS_OK) return status;
  state->client_connected += 1;
  if (ccjs_net_socket_read_start(socket) != CCJS_OK) return CCJS_ERR_FIELD;
  const char* request = "GET /hello HTTP/1.1\\r\\nHost: 127.0.0.1\\r\\n\\r\\n";
  return ccjs_net_socket_write(socket, request, strlen(request));
}

int main(void) {
  ccjs_allocator allocator = { 0, test_alloc, test_realloc, test_free };
  ccjs_loop loop;
  test_state state = { 0 };
  int port = 0;
  int guard = 0;

  if (ccjs_loop_init(&loop, &allocator) != CCJS_OK) return 1;
  if (ccjs_http_server_new(&loop, 0, 0, &state.server) != CCJS_OK) return 2;
  if (ccjs_http_server_on_request(state.server, on_http, &state) != CCJS_OK) return 3;
  if (ccjs_http_server_listen(state.server, "127.0.0.1", 0, 16) != CCJS_OK) return 4;
  if (ccjs_http_server_local_port(state.server, &port) != CCJS_OK) return 5;
  if (ccjs_net_connect(&loop, "127.0.0.1", port, on_connect, on_client_data, 0, &state, &state.client) != CCJS_OK) return 6;

  while (ccjs_loop_has_work(&loop) && guard < 500) {
    if (ccjs_loop_poll(&loop, ccjs_performance_now()) != CCJS_OK) return 7;
    guard += 1;
  }

  if (guard >= 500) return 8;
  printf(
    "%d %d %s %s %s\\n",
    state.client_connected,
    state.handled,
    strstr(state.response, "HTTP/1.1 201 Created") != 0 ? "created" : "status",
    strstr(state.response, "Content-Type: application/json") != 0 ? "json" : "content-type",
    strstr(state.response, "Content-Length: 16") != 0 ? "length" : "missing"
  );
  ccjs_loop_dispose(&loop);
  return 0;
}
`
  )

  await checkCommand('configure libuv http smoke', 'cmake', [
    '-S',
    sourceDir,
    '-B',
    httpBuildDir,
    '-DCCJS_LOOP_BACKEND=libuv'
  ])
  await checkCommand('build libuv http smoke', 'cmake', ['--build', httpBuildDir])

  const run = await runCommand(join(httpBuildDir, 'ccjs_libuv_http_smoke'), [])
  const stdout = normalizeNewlines(run.stdout)

  if (run.code !== 0) {
    fail('run libuv http smoke', run)
  }

  const expected = '1 1 created json length\n'

  if (stdout !== expected) {
    console.error(`Libuv http smoke stdout mismatch.\nExpected: ${JSON.stringify(expected)}\nActual: ${JSON.stringify(stdout)}`)
    process.exit(1)
  }
}

async function checkLibuvFetchRuntime(workDir: string): Promise<void> {
  const sourceDir = join(workDir, 'fetch-smoke-src')
  const fetchBuildDir = join(workDir, 'fetch-smoke-build')

  await mkdir(sourceDir, { recursive: true })
  await writeFile(
    join(sourceDir, 'CMakeLists.txt'),
    `cmake_minimum_required(VERSION 3.20)

project(ccjs_libuv_fetch_smoke C)

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)

add_subdirectory("${rootDir}/runtime/c" "\${CMAKE_CURRENT_BINARY_DIR}/ccjs_runtime")
add_executable(ccjs_libuv_fetch_smoke fetch-smoke.c)
target_link_libraries(ccjs_libuv_fetch_smoke PRIVATE ccjs_runtime)
`
  )
  await writeFile(
    join(sourceDir, 'fetch-smoke.c'),
    `#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "ccjs/allocator.h"
#include "ccjs/fetch.h"
#include "ccjs/http.h"
#include "ccjs/time.h"

typedef struct test_state {
  ccjs_http_server* server;
  int handled;
  int done;
  int status;
  int ok;
  char body[64];
} test_state;

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

static ccjs_status on_http(void* user, const ccjs_http_request* request, ccjs_http_response* response) {
  (void)request;
  test_state* state = (test_state*)user;
  state->handled += 1;
  return ccjs_http_response_text(response, 200, "fetch-ok", 8);
}

static ccjs_status on_fetch(void* user, ccjs_status status, const ccjs_fetch_response* response) {
  test_state* state = (test_state*)user;
  if (status != CCJS_OK || response == 0) return CCJS_ERR_FIELD;
  state->done += 1;
  state->status = response->status;
  state->ok = response->ok ? 1 : 0;
  size_t copy_len = response->body_len >= sizeof(state->body) ? sizeof(state->body) - 1 : response->body_len;
  memcpy(state->body, response->body, copy_len);
  state->body[copy_len] = '\\0';
  ccjs_http_server_close(state->server);
  return CCJS_OK;
}

int main(void) {
  ccjs_allocator allocator = { 0, test_alloc, test_realloc, test_free };
  ccjs_loop loop;
  test_state state = { 0 };
  int port = 0;
  int guard = 0;
  char url[128];

  if (ccjs_loop_init(&loop, &allocator) != CCJS_OK) return 1;
  if (ccjs_http_server_new(&loop, on_http, &state, &state.server) != CCJS_OK) return 2;
  if (ccjs_http_server_listen(state.server, "127.0.0.1", 0, 16) != CCJS_OK) return 3;
  if (ccjs_http_server_local_port(state.server, &port) != CCJS_OK) return 4;
  snprintf(url, sizeof(url), "http://127.0.0.1:%d/value", port);
  if (ccjs_fetch_get(&loop, url, on_fetch, &state) != CCJS_OK) return 5;

  while (ccjs_loop_has_work(&loop) && guard < 500) {
    if (ccjs_loop_poll(&loop, ccjs_performance_now()) != CCJS_OK) return 6;
    guard += 1;
  }

  if (guard >= 500) return 7;
  printf("%d %d %d %d %s\\n", state.handled, state.done, state.status, state.ok, state.body);
  ccjs_loop_dispose(&loop);
  return 0;
}
`
  )

  await checkCommand('configure libuv fetch smoke', 'cmake', [
    '-S',
    sourceDir,
    '-B',
    fetchBuildDir,
    '-DCCJS_LOOP_BACKEND=libuv'
  ])
  await checkCommand('build libuv fetch smoke', 'cmake', ['--build', fetchBuildDir])

  const run = await runCommand(join(fetchBuildDir, 'ccjs_libuv_fetch_smoke'), [])
  const stdout = normalizeNewlines(run.stdout)

  if (run.code !== 0) {
    fail('run libuv fetch smoke', run)
  }

  const expected = '1 1 200 1 fetch-ok\n'

  if (stdout !== expected) {
    console.error(`Libuv fetch smoke stdout mismatch.\nExpected: ${JSON.stringify(expected)}\nActual: ${JSON.stringify(stdout)}`)
    process.exit(1)
  }
}

async function expectMissing(path: string): Promise<void> {
  try {
    await access(path)
  } catch {
    return
  }

  console.error(`Expected ${path} to be removed`)
  process.exit(1)
}

async function checkCommand(label: string, command: string, args: string[]): Promise<void> {
  const result = await runCommand(command, args)

  if (result.code !== 0) {
    fail(label, result)
  }
}

function fail(label: string, result: { code: number; stdout: string; stderr: string }): never {
  if (result.stdout.length > 0) {
    process.stdout.write(result.stdout)
  }

  if (result.stderr.length > 0) {
    process.stderr.write(result.stderr)
  }

  console.error(`Libuv check failed during ${label} with exit code ${result.code}`)
  process.exit(result.code)
}
