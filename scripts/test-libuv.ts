import { spawn } from 'node:child_process'
import { createSocket as createUdpSocket } from 'node:dgram'
import { access, mkdir, mkdtemp, readFile, readlink, realpath, rm, writeFile } from 'node:fs/promises'
import { createServer as createHttpServer } from 'node:http'
import { connect, createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { compileSource } from '../src/compiler/index.ts'
import { normalizeNewlines, runCommand } from './lib/run-command.ts'
import { rootDir } from './lib/repo-checks.ts'

const uvHeaderPath = join(rootDir, 'third_party', 'libuv', 'include', 'uv.h')
const mode = parseArgs(process.argv.slice(2))

if (mode.help) {
  console.log(`Usage:
  pnpm run test:libuv
  pnpm run test:network
  node scripts/test-libuv.ts [--network-only]
`)
  process.exit(0)
}

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
  if (!mode.networkOnly) {
    await checkLibuvTimerRuntime(buildDir)
    await checkLibuvCompiledTimerProgram(buildDir)
    await checkLibuvConsoleRuntime(buildDir)
  }

  await checkLibuvDgramRuntime(buildDir)
  await checkLibuvDgramConnectedRuntime(buildDir)
  await checkLibuvDgramOptionsRuntime(buildDir)
  await checkLibuvCompiledDgramServer(buildDir)
  await checkLibuvCompiledDgramConnectedClient(buildDir)
  await checkLibuvCompiledDgramOptions(buildDir)
  await checkLibuvNetRuntime(buildDir)
  await checkLibuvCompiledNetServer(buildDir)
  await checkLibuvCompiledNetClient(buildDir)
  await checkLibuvHttpRuntime(buildDir)
  await checkLibuvCompiledHttpServer(buildDir)
  await checkLibuvFetchRuntime(buildDir)
  await checkLibuvCompiledFetchClient(buildDir)
  await checkLibuvCompiledFetchChunked(buildDir)
  await checkLibuvCompiledFetchRedirectMetadata(buildDir)
  await checkLibuvCompiledFetchAbort(buildDir)
  await checkLibuvCompiledHttpFetchRoundTrip(buildDir)

  if (!mode.networkOnly) {
    await checkLibuvFsRuntime(buildDir)
  }

  console.log(mode.networkOnly ? 'Network checks passed' : 'Libuv checks passed')
} finally {
  await rm(buildDir, {
    recursive: true,
    force: true
  })
}

function parseArgs(args: string[]): { help: boolean; networkOnly: boolean } {
  let networkOnly = false

  for (const arg of args) {
    if (arg === '--help' || arg === '-h') {
      return {
        help: true,
        networkOnly
      }
    }

    if (arg === '--network-only') {
      networkOnly = true
    } else {
      console.error(`Unknown option ${arg}`)
      process.exit(1)
    }
  }

  return {
    help: false,
    networkOnly
  }
}

function compileLibuvSource(source: string, options: Parameters<typeof compileSource>[1] = {}) {
  return compileSource(source, {
    ...options,
    target: 'c',
    loopBackend: 'libuv'
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
  int delayed;
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

static ccjs_status on_delayed(void* context) {
  ((test_log*)context)->delayed += 1;
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
  ccjs_timer_handle* delayed = 0;
  test_log log = { 0, 0, 0, 0, 0, 0, 0 };
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

  if (ccjs_loop_set_timeout(&loop, 10, on_delayed, &log, on_finalize, &delayed) != CCJS_OK) return 11;
  if (log.delayed != 0) return 12;
  if (ccjs_loop_poll(&loop, 0) != CCJS_OK) return 13;
  if (log.delayed != 1) return 14;
  if (ccjs_loop_has_work(&loop)) return 15;

  ccjs_loop_dispose(&loop);
  printf("%d %d %d %d %d %d\\n", log.immediate, log.timeout, log.canceled, log.interval, log.delayed, log.finalized);
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

  const expected = '1 1 0 3 1 5\n'

  if (stdout !== expected) {
    console.error(`Libuv timer smoke stdout mismatch.\nExpected: ${JSON.stringify(expected)}\nActual: ${JSON.stringify(stdout)}`)
    process.exit(1)
  }
}

async function checkLibuvCompiledTimerProgram(workDir: string): Promise<void> {
  const sourceDir = join(workDir, 'compiled-timer-src')
  const timerBuildDir = join(workDir, 'compiled-timer-build')
  const source = `setImmediate(() => {
  console.log('immediate')
})

setTimeout(() => {
  console.log('timeout')
}, 10)
`
  const compiled = compileLibuvSource(source)

  if (!compiled.code.includes('#if !defined(CCJS_LOOP_BACKEND_LIBUV)')) {
    console.error('Compiled timer smoke did not guard generated sleep for libuv builds')
    process.exit(1)
  }

  await mkdir(sourceDir, { recursive: true })
  await writeFile(
    join(sourceDir, 'CMakeLists.txt'),
    `cmake_minimum_required(VERSION 3.20)

project(ccjs_libuv_compiled_timer_smoke C)

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)

add_subdirectory("${rootDir}/runtime/c" "\${CMAKE_CURRENT_BINARY_DIR}/ccjs_runtime")
add_executable(ccjs_libuv_compiled_timer_smoke generated-timer.c)
target_link_libraries(ccjs_libuv_compiled_timer_smoke PRIVATE ccjs_runtime)
`
  )
  await writeFile(join(sourceDir, 'generated-timer.c'), compiled.code)

  await checkCommand('configure compiled libuv timer smoke', 'cmake', [
    '-S',
    sourceDir,
    '-B',
    timerBuildDir,
    '-DCCJS_LOOP_BACKEND=libuv'
  ])
  await checkCommand('build compiled libuv timer smoke', 'cmake', ['--build', timerBuildDir])

  const run = await runCommand(join(timerBuildDir, 'ccjs_libuv_compiled_timer_smoke'), [])
  const stdout = normalizeNewlines(run.stdout)

  if (run.code !== 0) {
    fail('run compiled libuv timer smoke', run)
  }

  const expected = 'immediate\ntimeout\n'

  if (stdout !== expected) {
    console.error(`Compiled libuv timer smoke stdout mismatch.\nExpected: ${JSON.stringify(expected)}\nActual: ${JSON.stringify(stdout)}`)
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
  int server_sent;
  int client_received;
  int client_sent;
  int closed;
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

static ccjs_status on_send(void* user, ccjs_status status) {
  test_state* state = (test_state*)user;
  if (status != CCJS_OK) return status;
  state->server_sent += 1;
  return CCJS_OK;
}

static ccjs_status on_client_send(void* user, ccjs_status status) {
  test_state* state = (test_state*)user;
  if (status != CCJS_OK) return status;
  state->client_sent += 1;
  return CCJS_OK;
}

static void on_close(void* user, ccjs_dgram_socket* socket) {
  (void)socket;
  ((test_state*)user)->closed += 1;
}

static ccjs_status on_server_recv(void* user, ccjs_dgram_socket* socket, const char* bytes, size_t len, const char* host, int port) {
  test_state* state = (test_state*)user;
  state->server_received += 1;
  return ccjs_dgram_send_with_callback(socket, bytes, len, host, port, on_send, state);
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
  ccjs_dgram_address address;
  int port = 0;
  int guard = 0;

  if (ccjs_loop_init(&loop, &allocator) != CCJS_OK) return 1;
  if (ccjs_dgram_socket_new(&loop, 0, 0, &state.server) != CCJS_OK) return 2;
  if (ccjs_dgram_socket_new(&loop, 0, 0, &state.client) != CCJS_OK) return 3;
  if (ccjs_dgram_socket_on_message(state.server, on_server_recv, &state) != CCJS_OK) return 4;
  if (ccjs_dgram_socket_on_message(state.client, on_client_recv, &state) != CCJS_OK) return 5;
  if (ccjs_dgram_socket_on_close(state.server, on_close, &state) != CCJS_OK) return 6;
  if (ccjs_dgram_socket_on_close(state.client, on_close, &state) != CCJS_OK) return 7;
  status = ccjs_dgram_bind(state.server, "127.0.0.1", 0);
  if (status != CCJS_OK) {
    fprintf(stderr, "server bind status %d\\n", status);
    return 8;
  }
  if (ccjs_dgram_socket_address(state.server, &address) != CCJS_OK) return 9;
  port = address.port;
  if (strcmp(address.family, "IPv4") != 0 || strcmp(address.address, "127.0.0.1") != 0) return 10;
  if (ccjs_dgram_recv_start(state.server) != CCJS_OK) return 11;
  if (ccjs_dgram_bind(state.client, "127.0.0.1", 0) != CCJS_OK) return 12;
  if (ccjs_dgram_recv_start(state.client) != CCJS_OK) return 13;
  if (ccjs_dgram_send_with_callback(state.client, "ping", 4, "127.0.0.1", port, on_client_send, &state) != CCJS_OK) return 14;

  while (ccjs_loop_has_work(&loop) && guard < 200) {
    if (ccjs_loop_poll(&loop, ccjs_performance_now()) != CCJS_OK) return 15;
    guard += 1;
  }

  if (guard >= 200) return 16;
  printf("%d %d %d %d %d %s\\n", state.server_received, state.server_sent, state.client_received, state.client_sent, state.closed, state.message);
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

  const expected = '1 1 1 1 2 ping\n'

  if (stdout !== expected) {
    console.error(`Libuv dgram smoke stdout mismatch.\nExpected: ${JSON.stringify(expected)}\nActual: ${JSON.stringify(stdout)}`)
    process.exit(1)
  }
}

async function checkLibuvDgramConnectedRuntime(workDir: string): Promise<void> {
  const sourceDir = join(workDir, 'dgram-connected-smoke-src')
  const dgramBuildDir = join(workDir, 'dgram-connected-smoke-build')

  await mkdir(sourceDir, { recursive: true })
  await writeFile(
    join(sourceDir, 'CMakeLists.txt'),
    `cmake_minimum_required(VERSION 3.20)

project(ccjs_libuv_dgram_connected_smoke C)

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)

add_subdirectory("${rootDir}/runtime/c" "\${CMAKE_CURRENT_BINARY_DIR}/ccjs_runtime")
add_executable(ccjs_libuv_dgram_connected_smoke dgram-connected-smoke.c)
target_link_libraries(ccjs_libuv_dgram_connected_smoke PRIVATE ccjs_runtime)
`
  )
  await writeFile(
    join(sourceDir, 'dgram-connected-smoke.c'),
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
  int client_sent;
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

static ccjs_status on_client_send(void* user, ccjs_status status) {
  test_state* state = (test_state*)user;
  if (status != CCJS_OK) return status;
  state->client_sent += 1;
  return CCJS_OK;
}

static ccjs_status on_server_recv(void* user, ccjs_dgram_socket* socket, const char* bytes, size_t len, const char* host, int port) {
  test_state* state = (test_state*)user;
  state->server_received += 1;
  return ccjs_dgram_send_with_callback(socket, bytes, len, host, port, 0, 0);
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
  ccjs_dgram_address server_address;
  ccjs_dgram_address remote_address;
  int guard = 0;

  if (ccjs_loop_init(&loop, &allocator) != CCJS_OK) return 1;
  if (ccjs_dgram_socket_new(&loop, 0, 0, &state.server) != CCJS_OK) return 2;
  if (ccjs_dgram_socket_new(&loop, 0, 0, &state.client) != CCJS_OK) return 3;
  if (ccjs_dgram_socket_on_message(state.server, on_server_recv, &state) != CCJS_OK) return 4;
  if (ccjs_dgram_socket_on_message(state.client, on_client_recv, &state) != CCJS_OK) return 5;
  if (ccjs_dgram_bind(state.server, "127.0.0.1", 0) != CCJS_OK) return 6;
  if (ccjs_dgram_socket_address(state.server, &server_address) != CCJS_OK) return 7;
  if (ccjs_dgram_bind(state.client, "127.0.0.1", 0) != CCJS_OK) return 8;
  if (ccjs_dgram_socket_remote_address(state.client, &remote_address) == CCJS_OK) return 9;
  if (ccjs_dgram_socket_connect(state.client, "127.0.0.1", server_address.port) != CCJS_OK) return 10;
  if (ccjs_dgram_socket_remote_address(state.client, &remote_address) != CCJS_OK) return 11;
  if (strcmp(remote_address.address, "127.0.0.1") != 0 || remote_address.port != server_address.port) return 12;
  if (ccjs_dgram_recv_start(state.server) != CCJS_OK) return 13;
  if (ccjs_dgram_recv_start(state.client) != CCJS_OK) return 14;
  if (ccjs_dgram_send_connected_with_callback(state.client, "connected", 9, on_client_send, &state) != CCJS_OK) return 15;

  while (ccjs_loop_has_work(&loop) && guard < 200) {
    if (ccjs_loop_poll(&loop, ccjs_performance_now()) != CCJS_OK) return 16;
    guard += 1;
  }

  if (guard >= 200) return 17;
  printf("%d %d %d %s\\n", state.server_received, state.client_received, state.client_sent, state.message);
  ccjs_loop_dispose(&loop);
  return 0;
}
`
  )

  await checkCommand('configure libuv connected dgram smoke', 'cmake', [
    '-S',
    sourceDir,
    '-B',
    dgramBuildDir,
    '-DCCJS_LOOP_BACKEND=libuv'
  ])
  await checkCommand('build libuv connected dgram smoke', 'cmake', ['--build', dgramBuildDir])

  const run = await runCommand(join(dgramBuildDir, 'ccjs_libuv_dgram_connected_smoke'), [])
  const stdout = normalizeNewlines(run.stdout)

  if (run.code !== 0) {
    fail('run libuv connected dgram smoke', run)
  }

  const expected = '1 1 1 connected\n'

  if (stdout !== expected) {
    console.error(`Libuv connected dgram smoke stdout mismatch.\nExpected: ${JSON.stringify(expected)}\nActual: ${JSON.stringify(stdout)}`)
    process.exit(1)
  }
}

async function checkLibuvDgramOptionsRuntime(workDir: string): Promise<void> {
  const sourceDir = join(workDir, 'dgram-options-smoke-src')
  const dgramBuildDir = join(workDir, 'dgram-options-smoke-build')

  await mkdir(sourceDir, { recursive: true })
  await writeFile(
    join(sourceDir, 'CMakeLists.txt'),
    `cmake_minimum_required(VERSION 3.20)

project(ccjs_libuv_dgram_options_smoke C)

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)

add_subdirectory("${rootDir}/runtime/c" "\${CMAKE_CURRENT_BINARY_DIR}/ccjs_runtime")
add_executable(ccjs_libuv_dgram_options_smoke dgram-options-smoke.c)
target_link_libraries(ccjs_libuv_dgram_options_smoke PRIVATE ccjs_runtime)
`
  )
  await writeFile(
    join(sourceDir, 'dgram-options-smoke.c'),
    `#include <stdio.h>
#include <stdlib.h>
#include "ccjs/allocator.h"
#include "ccjs/dgram.h"
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

int main(void) {
  ccjs_allocator allocator = { 0, test_alloc, test_realloc, test_free };
  ccjs_loop loop;
  ccjs_dgram_socket* socket = 0;
  int send_size = 0;
  int recv_size = 0;
  int guard = 0;

  if (ccjs_loop_init(&loop, &allocator) != CCJS_OK) return 1;
  if (ccjs_dgram_socket_new(&loop, 0, 0, &socket) != CCJS_OK) return 2;
  if (ccjs_dgram_bind_flags(socket, "127.0.0.1", 0, CCJS_DGRAM_BIND_REUSEADDR) != CCJS_OK) return 3;
  if (ccjs_dgram_set_broadcast(socket, 0) != CCJS_OK) return 4;
  if (ccjs_dgram_set_ttl(socket, 32) != CCJS_OK) return 5;
  if (ccjs_dgram_set_send_buffer_size(socket, 4096) != CCJS_OK) return 6;
  if (ccjs_dgram_set_recv_buffer_size(socket, 4096) != CCJS_OK) return 7;
  if (ccjs_dgram_get_send_buffer_size(socket, &send_size) != CCJS_OK) return 8;
  if (ccjs_dgram_get_recv_buffer_size(socket, &recv_size) != CCJS_OK) return 9;
  if (send_size <= 0 || recv_size <= 0) return 10;
  if (ccjs_dgram_unref(socket) != CCJS_OK) return 11;
  if (ccjs_dgram_ref(socket) != CCJS_OK) return 12;
  ccjs_dgram_close(socket);

  while (ccjs_loop_has_work(&loop) && guard < 200) {
    if (ccjs_loop_poll(&loop, ccjs_performance_now()) != CCJS_OK) return 13;
    guard += 1;
  }

  if (guard >= 200) return 14;
  printf("%d %d\\n", send_size > 0, recv_size > 0);
  ccjs_loop_dispose(&loop);
  return 0;
}
`
  )

  await checkCommand('configure libuv dgram options smoke', 'cmake', [
    '-S',
    sourceDir,
    '-B',
    dgramBuildDir,
    '-DCCJS_LOOP_BACKEND=libuv'
  ])
  await checkCommand('build libuv dgram options smoke', 'cmake', ['--build', dgramBuildDir])

  const run = await runCommand(join(dgramBuildDir, 'ccjs_libuv_dgram_options_smoke'), [])
  const stdout = normalizeNewlines(run.stdout)

  if (run.code !== 0) {
    fail('run libuv dgram options smoke', run)
  }

  const expected = '1 1\n'

  if (stdout !== expected) {
    console.error(`Libuv dgram options smoke stdout mismatch.\nExpected: ${JSON.stringify(expected)}\nActual: ${JSON.stringify(stdout)}`)
    process.exit(1)
  }
}

async function checkLibuvCompiledDgramServer(workDir: string): Promise<void> {
  const sourceDir = join(workDir, 'compiled-dgram-src')
  const dgramBuildDir = join(workDir, 'compiled-dgram-build')
  const port = await reserveUdpPort()
  const source = `import dgram from 'node:dgram'

const server = dgram.createSocket('udp4')

server.on('message', (message, rinfo) => {
  server.send(message, rinfo.port, rinfo.address)
})

server.bind(${port}, '127.0.0.1')
`
  const compiled = compileLibuvSource(source)

  await mkdir(sourceDir, { recursive: true })
  await writeFile(
    join(sourceDir, 'CMakeLists.txt'),
    `cmake_minimum_required(VERSION 3.20)

project(ccjs_libuv_compiled_dgram_smoke C)

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)

add_subdirectory("${rootDir}/runtime/c" "\${CMAKE_CURRENT_BINARY_DIR}/ccjs_runtime")
add_executable(ccjs_libuv_compiled_dgram_smoke generated-dgram-server.c)
target_link_libraries(ccjs_libuv_compiled_dgram_smoke PRIVATE ccjs_runtime)
`
  )
  await writeFile(join(sourceDir, 'generated-dgram-server.c'), compiled.code)

  await checkCommand('configure compiled libuv dgram smoke', 'cmake', [
    '-S',
    sourceDir,
    '-B',
    dgramBuildDir,
    '-DCCJS_LOOP_BACKEND=libuv'
  ])
  await checkCommand('build compiled libuv dgram smoke', 'cmake', ['--build', dgramBuildDir])

  const executable = join(dgramBuildDir, 'ccjs_libuv_compiled_dgram_smoke')
  const child = spawn(executable, [], {
    cwd: dgramBuildDir,
    stdio: ['ignore', 'pipe', 'pipe']
  })
  let stdout = ''
  let stderr = ''
  let exited = false
  let exitCode = 0
  const exitPromise = new Promise<void>((resolve) => {
    child.on('exit', (code) => {
      exited = true
      exitCode = code ?? 0
      resolve()
    })
  })

  child.stdout.on('data', (chunk) => {
    stdout += chunk
  })
  child.stderr.on('data', (chunk) => {
    stderr += chunk
  })

  try {
    const response = await requestUdpWithRetries(port, 'compiled-ping')

    if (response !== 'compiled-ping') {
      throw new Error(`compiled dgram server body mismatch: ${JSON.stringify(response)}`)
    }
  } catch (error) {
    if (stdout.length > 0) {
      process.stdout.write(stdout)
    }

    if (stderr.length > 0) {
      process.stderr.write(stderr)
    }

    throw error
  } finally {
    if (!exited) {
      child.kill('SIGTERM')
      await Promise.race([exitPromise, sleep(2000)])
    }

    if (!exited) {
      child.kill('SIGKILL')
      await Promise.race([exitPromise, sleep(2000)])
    }
  }

  if (exited && exitCode !== 0) {
    fail('run compiled libuv dgram smoke', {
      code: exitCode,
      stdout,
      stderr
    })
  }
}

async function checkLibuvCompiledDgramConnectedClient(workDir: string): Promise<void> {
  const sourceDir = join(workDir, 'compiled-dgram-connected-src')
  const dgramBuildDir = join(workDir, 'compiled-dgram-connected-build')
  const server = createUdpSocket('udp4')

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.bind(0, '127.0.0.1', () => resolve())
  })

  const address = server.address()

  if (address == null || typeof address === 'string') {
    server.close()
    throw new Error('Expected UDP server address with a numeric port')
  }

  const source = `import dgram from 'node:dgram'

const client = dgram.createSocket('udp4')

client.connect(${address.port}, '127.0.0.1', () => {
  const remote = client.remoteAddress()
  client.send('compiled-connected')
  console.log(remote.port)
})
`
  const compiled = compileLibuvSource(source)

  await mkdir(sourceDir, { recursive: true })
  await writeFile(
    join(sourceDir, 'CMakeLists.txt'),
    `cmake_minimum_required(VERSION 3.20)

project(ccjs_libuv_compiled_dgram_connected_smoke C)

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)

add_subdirectory("${rootDir}/runtime/c" "\${CMAKE_CURRENT_BINARY_DIR}/ccjs_runtime")
add_executable(ccjs_libuv_compiled_dgram_connected_smoke generated-dgram-connected-client.c)
target_link_libraries(ccjs_libuv_compiled_dgram_connected_smoke PRIVATE ccjs_runtime)
`
  )
  await writeFile(join(sourceDir, 'generated-dgram-connected-client.c'), compiled.code)

  await checkCommand('configure compiled connected libuv dgram smoke', 'cmake', [
    '-S',
    sourceDir,
    '-B',
    dgramBuildDir,
    '-DCCJS_LOOP_BACKEND=libuv'
  ])
  await checkCommand('build compiled connected libuv dgram smoke', 'cmake', ['--build', dgramBuildDir])

  const executable = join(dgramBuildDir, 'ccjs_libuv_compiled_dgram_connected_smoke')
  const received = receiveUdpMessage(server, 3000)
  const child = spawn(executable, [], {
    cwd: dgramBuildDir,
    stdio: ['ignore', 'pipe', 'pipe']
  })
  let stdout = ''
  let stderr = ''
  let exited = false
  let exitCode = 0
  const exitPromise = new Promise<void>((resolve) => {
    child.on('exit', (code) => {
      exited = true
      exitCode = code ?? 0
      resolve()
    })
  })

  child.stdout.on('data', (chunk) => {
    stdout += chunk
  })
  child.stderr.on('data', (chunk) => {
    stderr += chunk
  })

  try {
    const message = await received

    if (message !== 'compiled-connected') {
      throw new Error(`compiled connected dgram client body mismatch: ${JSON.stringify(message)}`)
    }
  } catch (error) {
    if (stdout.length > 0) {
      process.stdout.write(stdout)
    }

    if (stderr.length > 0) {
      process.stderr.write(stderr)
    }

    throw error
  } finally {
    server.close()

    if (!exited) {
      child.kill('SIGTERM')
      await Promise.race([exitPromise, sleep(2000)])
    }

    if (!exited) {
      child.kill('SIGKILL')
      await Promise.race([exitPromise, sleep(2000)])
    }
  }

  if (exited && exitCode !== 0) {
    fail('run compiled connected libuv dgram smoke', {
      code: exitCode,
      stdout,
      stderr
    })
  }
}

async function checkLibuvCompiledDgramOptions(workDir: string): Promise<void> {
  const sourceDir = join(workDir, 'compiled-dgram-options-src')
  const dgramBuildDir = join(workDir, 'compiled-dgram-options-build')
  const source = `import dgram from 'node:dgram'

const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true })

socket.bind(0, '127.0.0.1', () => {
  socket.setBroadcast(false)
  socket.setTTL(32)
  socket.setSendBufferSize(4096)
  socket.setRecvBufferSize(4096)
  const sendSize = socket.getSendBufferSize()
  const recvSize = socket.getRecvBufferSize()
  socket.unref()
  socket.ref()
  console.log(sendSize > 0, recvSize > 0)
  socket.close()
})
`
  const compiled = compileLibuvSource(source)

  await mkdir(sourceDir, { recursive: true })
  await writeFile(
    join(sourceDir, 'CMakeLists.txt'),
    `cmake_minimum_required(VERSION 3.20)

project(ccjs_libuv_compiled_dgram_options_smoke C)

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)

add_subdirectory("${rootDir}/runtime/c" "\${CMAKE_CURRENT_BINARY_DIR}/ccjs_runtime")
add_executable(ccjs_libuv_compiled_dgram_options_smoke generated-dgram-options.c)
target_link_libraries(ccjs_libuv_compiled_dgram_options_smoke PRIVATE ccjs_runtime)
`
  )
  await writeFile(join(sourceDir, 'generated-dgram-options.c'), compiled.code)

  await checkCommand('configure compiled libuv dgram options smoke', 'cmake', [
    '-S',
    sourceDir,
    '-B',
    dgramBuildDir,
    '-DCCJS_LOOP_BACKEND=libuv'
  ])
  await checkCommand('build compiled libuv dgram options smoke', 'cmake', ['--build', dgramBuildDir])

  const run = await runCommand(join(dgramBuildDir, 'ccjs_libuv_compiled_dgram_options_smoke'), [])
  const stdout = normalizeNewlines(run.stdout)

  if (run.code !== 0) {
    fail('run compiled libuv dgram options smoke', run)
  }

  const expected = '1 1\n'

  if (stdout !== expected) {
    console.error(`Compiled libuv dgram options stdout mismatch.\nExpected: ${JSON.stringify(expected)}\nActual: ${JSON.stringify(stdout)}`)
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
  int server_listening;
  int server_closed;
  int socket_connected;
  int socket_ready;
  int socket_ended;
  int socket_closed;
  int socket_write_done;
  int socket_drained;
  int socket_address_checked;
  int socket_remote_checked;
  int socket_options_checked;
  int socket_bytes_read_checked;
  int socket_bytes_written_checked;
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
  return ccjs_net_socket_end(socket, bytes, len);
}

static ccjs_status on_client_data(void* user, ccjs_net_socket* socket, const char* bytes, size_t len) {
  test_state* state = (test_state*)user;
  size_t bytes_read = 0;
  size_t copy_len = len >= sizeof(state->message) ? sizeof(state->message) - 1 : len;
  if (ccjs_net_socket_get_bytes_read(socket, &bytes_read) != CCJS_OK) return CCJS_ERR_FIELD;
  if (bytes_read < len) return CCJS_ERR_FIELD;
  memcpy(state->message, bytes, copy_len);
  state->message[copy_len] = '\\0';
  state->client_received += 1;
  state->socket_bytes_read_checked += 1;
  return CCJS_OK;
}

static ccjs_status on_socket_connected(void* user, ccjs_net_socket* socket) {
  (void)socket;
  test_state* state = (test_state*)user;
  state->socket_connected += 1;
  return CCJS_OK;
}

static ccjs_status on_socket_ready(void* user, ccjs_net_socket* socket) {
  (void)socket;
  test_state* state = (test_state*)user;
  state->socket_ready += 1;
  return CCJS_OK;
}

static ccjs_status on_socket_end(void* user, ccjs_net_socket* socket) {
  (void)socket;
  test_state* state = (test_state*)user;
  state->socket_ended += 1;
  ccjs_net_server_close(state->server);
  return CCJS_OK;
}

static ccjs_status on_socket_close(void* user, ccjs_net_socket* socket) {
  (void)socket;
  test_state* state = (test_state*)user;
  state->socket_closed += 1;
  return CCJS_OK;
}

static ccjs_status on_socket_write(void* user, ccjs_net_socket* socket, ccjs_status status) {
  test_state* state = (test_state*)user;
  size_t bytes_written = 0;
  if (status != CCJS_OK) return status;
  if (ccjs_net_socket_get_bytes_written(socket, &bytes_written) != CCJS_OK) return CCJS_ERR_FIELD;
  if (bytes_written < 5) return CCJS_ERR_FIELD;
  state->socket_write_done += 1;
  state->socket_bytes_written_checked += 1;
  return CCJS_OK;
}

static ccjs_status on_socket_drain(void* user, ccjs_net_socket* socket) {
  (void)socket;
  test_state* state = (test_state*)user;
  state->socket_drained += 1;
  return CCJS_OK;
}

static ccjs_status on_server_listening(void* user, ccjs_net_server* server) {
  (void)server;
  test_state* state = (test_state*)user;
  state->server_listening += 1;
  return CCJS_OK;
}

static ccjs_status on_server_close(void* user, ccjs_net_server* server) {
  (void)server;
  test_state* state = (test_state*)user;
  state->server_closed += 1;
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
  ccjs_net_address local = { 0 };
  ccjs_net_address remote = { 0 };
  if (status != CCJS_OK) return status;
  state->client_connected += 1;
  if (ccjs_net_socket_set_no_delay(socket, 1) != CCJS_OK) return CCJS_ERR_FIELD;
  if (ccjs_net_socket_set_keep_alive(socket, 1, 1) != CCJS_OK) return CCJS_ERR_FIELD;
  if (ccjs_net_socket_ref(socket) != CCJS_OK) return CCJS_ERR_FIELD;
  if (ccjs_net_socket_unref(socket) != CCJS_OK) return CCJS_ERR_FIELD;
  if (ccjs_net_socket_ref(socket) != CCJS_OK) return CCJS_ERR_FIELD;
  state->socket_options_checked += 1;
  if (ccjs_net_socket_address(socket, &local) != CCJS_OK) return CCJS_ERR_FIELD;
  if (ccjs_net_socket_remote_address(socket, &remote) != CCJS_OK) return CCJS_ERR_FIELD;
  if (local.port <= 0 || remote.port <= 0) return CCJS_ERR_FIELD;
  if (strcmp(local.family, "IPv4") != 0 || strcmp(remote.family, "IPv4") != 0) return CCJS_ERR_FIELD;
  state->socket_address_checked += 1;
  state->socket_remote_checked += 1;
  if (ccjs_net_socket_read_start(socket) != CCJS_OK) return CCJS_ERR_FIELD;
  return ccjs_net_socket_write_with_callback(socket, "hello", 5, on_socket_write, state);
}

int main(void) {
  ccjs_allocator allocator = { 0, test_alloc, test_realloc, test_free };
  ccjs_loop loop;
  test_state state = { 0 };
  ccjs_net_address address = { 0 };
  int port = 0;
  int guard = 0;

  if (ccjs_loop_init(&loop, &allocator) != CCJS_OK) return 1;
  if (ccjs_net_server_new(&loop, on_connection, &state, &state.server) != CCJS_OK) return 2;
  if (ccjs_net_server_on_listening(state.server, on_server_listening, &state) != CCJS_OK) return 3;
  if (ccjs_net_server_on_close(state.server, on_server_close, &state) != CCJS_OK) return 4;
  if (ccjs_net_server_listen(state.server, "127.0.0.1", 0, 16) != CCJS_OK) return 5;
  if (ccjs_net_server_address(state.server, &address) != CCJS_OK) return 6;
  if (ccjs_net_server_local_port(state.server, &port) != CCJS_OK) return 7;
  if (port <= 0 || address.port != port || strcmp(address.family, "IPv4") != 0) return 8;
  if (ccjs_net_connect(&loop, "localhost", port, on_connect, on_client_data, 0, &state, &state.client) != CCJS_OK) return 9;
  if (ccjs_net_socket_on_connect(state.client, on_socket_connected, &state) != CCJS_OK) return 10;
  if (ccjs_net_socket_on_ready(state.client, on_socket_ready, &state) != CCJS_OK) return 11;
  if (ccjs_net_socket_on_end(state.client, on_socket_end, &state) != CCJS_OK) return 12;
  if (ccjs_net_socket_on_close(state.client, on_socket_close, &state) != CCJS_OK) return 13;
  if (ccjs_net_socket_on_drain(state.client, on_socket_drain, &state) != CCJS_OK) return 14;
  if (ccjs_net_socket_set_encoding(state.client, "utf8", 4) != CCJS_OK) return 15;

  while (ccjs_loop_has_work(&loop) && guard < 400) {
    if (ccjs_loop_poll(&loop, ccjs_performance_now()) != CCJS_OK) return 16;
    guard += 1;
  }

  if (guard >= 400) return 17;
  printf(
    "%d %d %d %d %d %d %d %d %d %d %d %d %d %d %d %d %s\\n",
    state.server_listening,
    state.server_closed,
    state.client_connected,
    state.socket_connected,
    state.socket_ready,
    state.socket_ended,
    state.socket_closed,
    state.socket_write_done,
    state.socket_drained,
    state.socket_address_checked,
    state.socket_remote_checked,
    state.socket_options_checked,
    state.socket_bytes_read_checked,
    state.socket_bytes_written_checked,
    state.server_received,
    state.client_received,
    state.message
  );
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

  const expected = '1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 hello\n'

  if (stdout !== expected) {
    console.error(`Libuv net smoke stdout mismatch.\nExpected: ${JSON.stringify(expected)}\nActual: ${JSON.stringify(stdout)}`)
    process.exit(1)
  }
}

async function checkLibuvCompiledNetServer(workDir: string): Promise<void> {
  const sourceDir = join(workDir, 'compiled-net-src')
  const netBuildDir = join(workDir, 'compiled-net-build')
  const port = await reserveTcpPort()
  const source = `import net from 'node:net'

const server = net.createServer((socket) => {
  socket.end('compiled-net')
})

server.listen(${port}, '127.0.0.1')
`
  const compiled = compileLibuvSource(source)

  await mkdir(sourceDir, { recursive: true })
  await writeFile(
    join(sourceDir, 'CMakeLists.txt'),
    `cmake_minimum_required(VERSION 3.20)

project(ccjs_libuv_compiled_net_smoke C)

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)

add_subdirectory("${rootDir}/runtime/c" "\${CMAKE_CURRENT_BINARY_DIR}/ccjs_runtime")
add_executable(ccjs_libuv_compiled_net_smoke generated-net-server.c)
target_link_libraries(ccjs_libuv_compiled_net_smoke PRIVATE ccjs_runtime)
`
  )
  await writeFile(join(sourceDir, 'generated-net-server.c'), compiled.code)

  await checkCommand('configure compiled libuv net smoke', 'cmake', [
    '-S',
    sourceDir,
    '-B',
    netBuildDir,
    '-DCCJS_LOOP_BACKEND=libuv'
  ])
  await checkCommand('build compiled libuv net smoke', 'cmake', ['--build', netBuildDir])

  const executable = join(netBuildDir, 'ccjs_libuv_compiled_net_smoke')
  const child = spawn(executable, [], {
    cwd: netBuildDir,
    stdio: ['ignore', 'pipe', 'pipe']
  })
  let stdout = ''
  let stderr = ''
  let exited = false
  let exitCode = 0
  const exitPromise = new Promise<void>((resolve) => {
    child.on('exit', (code) => {
      exited = true
      exitCode = code ?? 0
      resolve()
    })
  })

  child.stdout.on('data', (chunk) => {
    stdout += chunk
  })
  child.stderr.on('data', (chunk) => {
    stderr += chunk
  })

  try {
    const response = await requestTcpWithRetries(port)

    if (response !== 'compiled-net') {
      throw new Error(`compiled net server body mismatch: ${JSON.stringify(response)}`)
    }
  } catch (error) {
    if (stdout.length > 0) {
      process.stdout.write(stdout)
    }

    if (stderr.length > 0) {
      process.stderr.write(stderr)
    }

    throw error
  } finally {
    if (!exited) {
      child.kill('SIGTERM')
      await Promise.race([exitPromise, sleep(2000)])
    }

    if (!exited) {
      child.kill('SIGKILL')
      await Promise.race([exitPromise, sleep(2000)])
    }
  }

  if (exited && exitCode !== 0) {
    fail('run compiled libuv net smoke', {
      code: exitCode,
      stdout,
      stderr
    })
  }
}

async function checkLibuvCompiledNetClient(workDir: string): Promise<void> {
  const sourceDir = join(workDir, 'compiled-net-client-src')
  const netBuildDir = join(workDir, 'compiled-net-client-build')
  const server = createServer((socket) => {
    socket.setEncoding('utf8')
    socket.on('data', (chunk) => {
      if (chunk === 'ping') {
        socket.write('pong')
      }

      socket.end()
    })
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })

  const address = server.address()

  if (address == null || typeof address === 'string') {
    server.close()
    throw new Error('Expected TCP address with a numeric port')
  }

  const source = `import net from 'node:net'

const client = net.createConnection(${address.port}, '127.0.0.1', () => {
  console.log('connected')
})

client.setEncoding('utf8')
client.on('ready', () => {
  client.write('ping')
})
client.on('data', (chunk) => {
  console.log(chunk)
})
client.on('end', () => {
  client.destroy()
})
`
  const compiled = compileLibuvSource(source)

  try {
    await mkdir(sourceDir, { recursive: true })
    await writeFile(
      join(sourceDir, 'CMakeLists.txt'),
      `cmake_minimum_required(VERSION 3.20)

project(ccjs_libuv_compiled_net_client_smoke C)

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)

add_subdirectory("${rootDir}/runtime/c" "\${CMAKE_CURRENT_BINARY_DIR}/ccjs_runtime")
add_executable(ccjs_libuv_compiled_net_client_smoke generated-net-client.c)
target_link_libraries(ccjs_libuv_compiled_net_client_smoke PRIVATE ccjs_runtime)
`
    )
    await writeFile(join(sourceDir, 'generated-net-client.c'), compiled.code)

    await checkCommand('configure compiled libuv net client smoke', 'cmake', [
      '-S',
      sourceDir,
      '-B',
      netBuildDir,
      '-DCCJS_LOOP_BACKEND=libuv'
    ])
    await checkCommand('build compiled libuv net client smoke', 'cmake', ['--build', netBuildDir])

    const run = await runCommand(join(netBuildDir, 'ccjs_libuv_compiled_net_client_smoke'), [])
    const stdout = normalizeNewlines(run.stdout)

    if (run.code !== 0) {
      fail('run compiled libuv net client smoke', run)
    }

    const expected = 'connected\npong\n'

    if (stdout !== expected) {
      console.error(`Compiled libuv net client stdout mismatch.\nExpected: ${JSON.stringify(expected)}\nActual: ${JSON.stringify(stdout)}`)
      process.exit(1)
    }
  } finally {
    await new Promise<void>((resolve) => {
      server.close(() => resolve())
    })
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

async function checkLibuvCompiledHttpServer(workDir: string): Promise<void> {
  const sourceDir = join(workDir, 'compiled-http-src')
  const httpBuildDir = join(workDir, 'compiled-http-build')
  const port = await reserveTcpPort()
  const source = `import http from 'node:http'

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ data: 'Hello World!' }))
})

server.listen(${port}, '127.0.0.1')
`
  const compiled = compileLibuvSource(source)

  await mkdir(sourceDir, { recursive: true })
  await writeFile(
    join(sourceDir, 'CMakeLists.txt'),
    `cmake_minimum_required(VERSION 3.20)

project(ccjs_libuv_compiled_http_smoke C)

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)

add_subdirectory("${rootDir}/runtime/c" "\${CMAKE_CURRENT_BINARY_DIR}/ccjs_runtime")
add_executable(ccjs_libuv_compiled_http_smoke generated-http-server.c)
target_link_libraries(ccjs_libuv_compiled_http_smoke PRIVATE ccjs_runtime)
`
  )
  await writeFile(join(sourceDir, 'generated-http-server.c'), compiled.code)

  await checkCommand('configure compiled libuv http smoke', 'cmake', [
    '-S',
    sourceDir,
    '-B',
    httpBuildDir,
    '-DCCJS_LOOP_BACKEND=libuv'
  ])
  await checkCommand('build compiled libuv http smoke', 'cmake', ['--build', httpBuildDir])

  const executable = join(httpBuildDir, 'ccjs_libuv_compiled_http_smoke')
  const child = spawn(executable, [], {
    cwd: httpBuildDir,
    stdio: ['ignore', 'pipe', 'pipe']
  })
  let stdout = ''
  let stderr = ''
  let exited = false
  let exitCode = 0
  const exitPromise = new Promise<void>((resolve) => {
    child.on('exit', (code) => {
      exited = true
      exitCode = code ?? 0
      resolve()
    })
  })

  child.stdout.on('data', (chunk) => {
    stdout += chunk
  })
  child.stderr.on('data', (chunk) => {
    stderr += chunk
  })

  try {
    const response = await requestHttpWithRetries(port, '/')

    if (!response.includes('HTTP/1.1 200 OK')) {
      throw new Error(`compiled HTTP server status mismatch: ${JSON.stringify(response)}`)
    }

    if (!response.includes('Content-Type: application/json')) {
      throw new Error(`compiled HTTP server content-type missing: ${JSON.stringify(response)}`)
    }

    if (!response.endsWith('{"data":"Hello World!"}')) {
      throw new Error(`compiled HTTP server body mismatch: ${JSON.stringify(response)}`)
    }
  } catch (error) {
    if (stdout.length > 0) {
      process.stdout.write(stdout)
    }

    if (stderr.length > 0) {
      process.stderr.write(stderr)
    }

    throw error
  } finally {
    if (!exited) {
      child.kill('SIGTERM')
      await Promise.race([exitPromise, sleep(2000)])
    }

    if (!exited) {
      child.kill('SIGKILL')
      await Promise.race([exitPromise, sleep(2000)])
    }
  }

  if (exited && exitCode !== 0) {
    fail('run compiled libuv http smoke', {
      code: exitCode,
      stdout,
      stderr
    })
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

async function checkLibuvCompiledFetchClient(workDir: string): Promise<void> {
  const sourceDir = join(workDir, 'compiled-fetch-client-src')
  const fetchBuildDir = join(workDir, 'compiled-fetch-client-build')
  const requestBody = '{"name":"Ada"}'
  const responseBody = 'compiled-fetch-post'
  const server = createHttpServer((request, response) => {
    if (request.url !== '/value') {
      response.writeHead(404, {
        Connection: 'close',
        'Content-Length': '0'
      })
      response.end()
      return
    }

    let body = ''

    request.setEncoding('utf8')
    request.on('data', (chunk) => {
      body += chunk
    })
    request.on('end', () => {
      if (
        request.method !== 'POST' ||
        request.headers['content-type'] !== 'application/json' ||
        request.headers['x-ccjs'] !== 'fetch' ||
        body !== requestBody
      ) {
        response.writeHead(400, {
          Connection: 'close',
          'Content-Length': '0'
        })
        response.end()
        return
      }

      response.writeHead(200, {
        Connection: 'close',
        'Content-Length': String(responseBody.length),
        'Content-Type': 'text/plain'
      })
      response.end(responseBody)
    })
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })

  const address = server.address()

  if (address == null || typeof address === 'string') {
    server.close()
    throw new Error('Expected HTTP address with a numeric port')
  }

  const url = `http://127.0.0.1:${address.port}/value`
  const source = `const response = await fetch('${url}', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-CCJS': 'fetch'
  },
  body: '${requestBody}'
})
const text = await response.text()
console.log(response.status, response.ok, response.url, text)
`
  const compiled = compileLibuvSource(source)

  try {
    await mkdir(sourceDir, { recursive: true })
    await writeFile(
      join(sourceDir, 'CMakeLists.txt'),
      `cmake_minimum_required(VERSION 3.20)

project(ccjs_libuv_compiled_fetch_client_smoke C)

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)

add_subdirectory("${rootDir}/runtime/c" "\${CMAKE_CURRENT_BINARY_DIR}/ccjs_runtime")
add_executable(ccjs_libuv_compiled_fetch_client_smoke generated-fetch-client.c)
target_link_libraries(ccjs_libuv_compiled_fetch_client_smoke PRIVATE ccjs_runtime)
`
    )
    await writeFile(join(sourceDir, 'generated-fetch-client.c'), compiled.code)

    await checkCommand('configure compiled libuv fetch client smoke', 'cmake', [
      '-S',
      sourceDir,
      '-B',
      fetchBuildDir,
      '-DCCJS_LOOP_BACKEND=libuv'
    ])
    await checkCommand('build compiled libuv fetch client smoke', 'cmake', ['--build', fetchBuildDir])

    const run = await runCommand(join(fetchBuildDir, 'ccjs_libuv_compiled_fetch_client_smoke'), [])
    const stdout = normalizeNewlines(run.stdout)

    if (run.code !== 0) {
      fail('run compiled libuv fetch client smoke', run)
    }

    const expected = `200 1 ${url} ${responseBody}\n`

    if (stdout !== expected) {
      console.error(
        `Compiled libuv fetch client stdout mismatch.\nExpected: ${JSON.stringify(expected)}\nActual: ${JSON.stringify(stdout)}`
      )
      process.exit(1)
    }
  } finally {
    await new Promise<void>((resolve) => {
      server.close(() => resolve())
    })
  }
}

async function checkLibuvCompiledFetchChunked(workDir: string): Promise<void> {
  const sourceDir = join(workDir, 'compiled-fetch-chunked-src')
  const fetchBuildDir = join(workDir, 'compiled-fetch-chunked-build')
  const responseBody = 'chunked-fetch-body'
  const server = createHttpServer((request, response) => {
    if (request.url !== '/chunked') {
      response.writeHead(404, {
        Connection: 'close',
        'Content-Length': '0'
      })
      response.end()
      return
    }

    response.writeHead(200, {
      Connection: 'close',
      'Content-Type': 'text/plain'
    })
    response.write('chunked-')
    response.end('fetch-body')
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })

  const address = server.address()

  if (address == null || typeof address === 'string') {
    server.close()
    throw new Error('Expected HTTP address with a numeric port')
  }

  const url = `http://127.0.0.1:${address.port}/chunked`
  const source = `const response = await fetch('${url}')
const text = await response.text()
console.log(response.status, response.ok, text)
`
  const compiled = compileLibuvSource(source)

  try {
    await mkdir(sourceDir, { recursive: true })
    await writeFile(
      join(sourceDir, 'CMakeLists.txt'),
      `cmake_minimum_required(VERSION 3.20)

project(ccjs_libuv_compiled_fetch_chunked_smoke C)

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)

add_subdirectory("${rootDir}/runtime/c" "\${CMAKE_CURRENT_BINARY_DIR}/ccjs_runtime")
add_executable(ccjs_libuv_compiled_fetch_chunked_smoke generated-fetch-chunked.c)
target_link_libraries(ccjs_libuv_compiled_fetch_chunked_smoke PRIVATE ccjs_runtime)
`
    )
    await writeFile(join(sourceDir, 'generated-fetch-chunked.c'), compiled.code)

    await checkCommand('configure compiled libuv fetch chunked smoke', 'cmake', [
      '-S',
      sourceDir,
      '-B',
      fetchBuildDir,
      '-DCCJS_LOOP_BACKEND=libuv'
    ])
    await checkCommand('build compiled libuv fetch chunked smoke', 'cmake', ['--build', fetchBuildDir])

    const run = await runCommand(join(fetchBuildDir, 'ccjs_libuv_compiled_fetch_chunked_smoke'), [])
    const stdout = normalizeNewlines(run.stdout)

    if (run.code !== 0) {
      fail('run compiled libuv fetch chunked smoke', run)
    }

    const expected = `200 1 ${responseBody}\n`

    if (stdout !== expected) {
      console.error(
        `Compiled libuv fetch chunked stdout mismatch.\nExpected: ${JSON.stringify(expected)}\nActual: ${JSON.stringify(stdout)}`
      )
      process.exit(1)
    }
  } finally {
    await new Promise<void>((resolve) => {
      server.close(() => resolve())
    })
  }
}

async function checkLibuvCompiledFetchAbort(workDir: string): Promise<void> {
  const sourceDir = join(workDir, 'compiled-fetch-abort-src')
  const fetchBuildDir = join(workDir, 'compiled-fetch-abort-build')
  const server = createHttpServer((request, response) => {
    request.resume()
    setTimeout(() => {
      response.writeHead(200, {
        Connection: 'close',
        'Content-Length': '4',
        'Content-Type': 'text/plain'
      })
      response.end('late')
    }, 100)
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })

  const address = server.address()

  if (address == null || typeof address === 'string') {
    server.close()
    throw new Error('Expected HTTP address with a numeric port')
  }

  const url = `http://127.0.0.1:${address.port}/slow`
  const source = `const controller = new AbortController()

setTimeout(() => {
  controller.abort()
}, 5)

try {
  const response = await fetch('${url}', { signal: controller.signal })
  const text = await response.text()
  console.log('resolved', text)
} catch (error) {
  console.log('aborted')
}
`
  const compiled = compileLibuvSource(source)

  try {
    await mkdir(sourceDir, { recursive: true })
    await writeFile(
      join(sourceDir, 'CMakeLists.txt'),
      `cmake_minimum_required(VERSION 3.20)

project(ccjs_libuv_compiled_fetch_abort_smoke C)

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)

add_subdirectory("${rootDir}/runtime/c" "\${CMAKE_CURRENT_BINARY_DIR}/ccjs_runtime")
add_executable(ccjs_libuv_compiled_fetch_abort_smoke generated-fetch-abort.c)
target_link_libraries(ccjs_libuv_compiled_fetch_abort_smoke PRIVATE ccjs_runtime)
`
    )
    await writeFile(join(sourceDir, 'generated-fetch-abort.c'), compiled.code)

    await checkCommand('configure compiled libuv fetch abort smoke', 'cmake', [
      '-S',
      sourceDir,
      '-B',
      fetchBuildDir,
      '-DCCJS_LOOP_BACKEND=libuv'
    ])
    await checkCommand('build compiled libuv fetch abort smoke', 'cmake', ['--build', fetchBuildDir])

    const run = await runCommand(join(fetchBuildDir, 'ccjs_libuv_compiled_fetch_abort_smoke'), [])
    const stdout = normalizeNewlines(run.stdout)

    if (run.code !== 0) {
      fail('run compiled libuv fetch abort smoke', run)
    }

    const expected = 'aborted\n'

    if (stdout !== expected) {
      console.error(
        `Compiled libuv fetch abort stdout mismatch.\nExpected: ${JSON.stringify(expected)}\nActual: ${JSON.stringify(stdout)}`
      )
      process.exit(1)
    }
  } finally {
    await new Promise<void>((resolve) => {
      server.close(() => resolve())
    })
  }
}

async function checkLibuvCompiledFetchRedirectMetadata(workDir: string): Promise<void> {
  const sourceDir = join(workDir, 'compiled-fetch-redirect-src')
  const fetchBuildDir = join(workDir, 'compiled-fetch-redirect-build')
  const responseBody = 'redirected-body'
  const server = createHttpServer((request, response) => {
    if (request.url?.startsWith('/redirect')) {
      response.writeHead(302, {
        Connection: 'close',
        'Content-Length': '0',
        Location: '/final'
      })
      response.end()
      return
    }

    if (request.url === '/final') {
      response.writeHead(200, {
        Connection: 'close',
        'Content-Length': String(responseBody.length),
        'Content-Type': 'text/plain',
        'X-Trace': 'stage4'
      })
      response.end(responseBody)
      return
    }

    response.writeHead(404, {
      Connection: 'close',
      'Content-Length': '0'
    })
    response.end()
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })

  const address = server.address()

  if (address == null || typeof address === 'string') {
    server.close()
    throw new Error('Expected HTTP address with a numeric port')
  }

  const followUrl = `http://localhost:${address.port}/redirect?from=1`
  const manualUrl = `http://127.0.0.1:${address.port}/redirect`
  const finalUrl = `http://localhost:${address.port}/final`
  const source = `const follow = await fetch('${followUrl}')
const followText = await follow.text()
const contentType = follow.headers.get('content-type') ?? 'missing'
console.log(follow.status, follow.statusText, follow.ok, follow.redirected, follow.url, contentType, follow.headers.has('x-trace'), followText)

const manual = await fetch('${manualUrl}', { redirect: 'manual' })
const location = manual.headers.get('location') ?? 'missing'
console.log(manual.status, manual.statusText, manual.redirected, location)
`
  const compiled = compileLibuvSource(source)

  try {
    await mkdir(sourceDir, { recursive: true })
    await writeFile(
      join(sourceDir, 'CMakeLists.txt'),
      `cmake_minimum_required(VERSION 3.20)

project(ccjs_libuv_compiled_fetch_redirect_smoke C)

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)

add_subdirectory("${rootDir}/runtime/c" "\${CMAKE_CURRENT_BINARY_DIR}/ccjs_runtime")
add_executable(ccjs_libuv_compiled_fetch_redirect_smoke generated-fetch-redirect.c)
target_link_libraries(ccjs_libuv_compiled_fetch_redirect_smoke PRIVATE ccjs_runtime)
`
    )
    await writeFile(join(sourceDir, 'generated-fetch-redirect.c'), compiled.code)

    await checkCommand('configure compiled libuv fetch redirect smoke', 'cmake', [
      '-S',
      sourceDir,
      '-B',
      fetchBuildDir,
      '-DCCJS_LOOP_BACKEND=libuv'
    ])
    await checkCommand('build compiled libuv fetch redirect smoke', 'cmake', ['--build', fetchBuildDir])

    const run = await runCommand(join(fetchBuildDir, 'ccjs_libuv_compiled_fetch_redirect_smoke'), [])
    const stdout = normalizeNewlines(run.stdout)

    if (run.code !== 0) {
      fail('run compiled libuv fetch redirect smoke', run)
    }

    const expected = `200 OK 1 1 ${finalUrl} text/plain 1 ${responseBody}\n302 Found 0 /final\n`

    if (stdout !== expected) {
      console.error(
        `Compiled libuv fetch redirect stdout mismatch.\nExpected: ${JSON.stringify(expected)}\nActual: ${JSON.stringify(stdout)}`
      )
      process.exit(1)
    }
  } finally {
    await new Promise<void>((resolve) => {
      server.close(() => resolve())
    })
  }
}

async function checkLibuvCompiledHttpFetchRoundTrip(workDir: string): Promise<void> {
  const sourceDir = join(workDir, 'compiled-http-fetch-src')
  const buildDir = join(workDir, 'compiled-http-fetch-build')
  const port = await reserveTcpPort()
  const serverSource = `import http from 'node:http'

const server = http.createServer((req, res) => {
  if (req.url === '/from-fetch') {
    res.writeHead(200, {
      'Content-Type': 'text/plain',
      'X-CCJS': 'network'
    })
    res.end('http-fetch-ok')
  } else {
    res.statusCode = 404
    res.end('missing')
  }
})

server.listen(${port}, '127.0.0.1')
`
  const clientSource = `const response = await fetch('http://127.0.0.1:${port}/from-fetch')
const text = await response.text()
const trace = response.headers.get('x-ccjs') ?? 'missing'
console.log(response.status, response.ok, trace, text)
`
  const compiledServer = compileLibuvSource(serverSource)
  const compiledClient = compileLibuvSource(clientSource)

  await mkdir(sourceDir, { recursive: true })
  await writeFile(
    join(sourceDir, 'CMakeLists.txt'),
    `cmake_minimum_required(VERSION 3.20)

project(ccjs_libuv_compiled_http_fetch_smoke C)

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)

add_subdirectory("${rootDir}/runtime/c" "\${CMAKE_CURRENT_BINARY_DIR}/ccjs_runtime")
add_executable(ccjs_libuv_compiled_http_fetch_server generated-http-fetch-server.c)
target_link_libraries(ccjs_libuv_compiled_http_fetch_server PRIVATE ccjs_runtime)
add_executable(ccjs_libuv_compiled_http_fetch_client generated-http-fetch-client.c)
target_link_libraries(ccjs_libuv_compiled_http_fetch_client PRIVATE ccjs_runtime)
`
  )
  await writeFile(join(sourceDir, 'generated-http-fetch-server.c'), compiledServer.code)
  await writeFile(join(sourceDir, 'generated-http-fetch-client.c'), compiledClient.code)

  await checkCommand('configure compiled libuv http/fetch roundtrip smoke', 'cmake', [
    '-S',
    sourceDir,
    '-B',
    buildDir,
    '-DCCJS_LOOP_BACKEND=libuv'
  ])
  await checkCommand('build compiled libuv http/fetch roundtrip smoke', 'cmake', ['--build', buildDir])

  const executable = join(buildDir, 'ccjs_libuv_compiled_http_fetch_server')
  const child = spawn(executable, [], {
    cwd: buildDir,
    stdio: ['ignore', 'pipe', 'pipe']
  })
  let stdout = ''
  let stderr = ''
  let exited = false
  let exitCode = 0
  const exitPromise = new Promise<void>((resolve) => {
    child.on('exit', (code) => {
      exited = true
      exitCode = code ?? 0
      resolve()
    })
  })

  child.stdout.on('data', (chunk) => {
    stdout += chunk
  })
  child.stderr.on('data', (chunk) => {
    stderr += chunk
  })

  try {
    const rawResponse = await requestHttpWithRetries(port, '/from-fetch')

    if (!rawResponse.includes('HTTP/1.1 200 OK') || !rawResponse.endsWith('http-fetch-ok')) {
      throw new Error(`compiled HTTP server raw response mismatch: ${JSON.stringify(rawResponse)}`)
    }

    const run = await runCommand(join(buildDir, 'ccjs_libuv_compiled_http_fetch_client'), [])
    const clientStdout = normalizeNewlines(run.stdout)
    const expected = '200 1 network http-fetch-ok\n'

    if (run.code !== 0) {
      fail('run compiled libuv http/fetch client smoke', run)
    }

    if (clientStdout !== expected) {
      console.error(
        `Compiled libuv http/fetch client stdout mismatch.\nExpected: ${JSON.stringify(expected)}\nActual: ${JSON.stringify(
          clientStdout
        )}`
      )
      process.exit(1)
    }
  } catch (error) {
    if (stdout.length > 0) {
      process.stdout.write(stdout)
    }

    if (stderr.length > 0) {
      process.stderr.write(stderr)
    }

    throw error
  } finally {
    if (!exited) {
      child.kill('SIGTERM')
      await Promise.race([exitPromise, sleep(2000)])
    }

    if (!exited) {
      child.kill('SIGKILL')
      await Promise.race([exitPromise, sleep(2000)])
    }
  }

  if (exited && exitCode !== 0) {
    fail('run compiled libuv http/fetch server smoke', {
      code: exitCode,
      stdout,
      stderr
    })
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

async function reserveTcpPort(): Promise<number> {
  const server = createServer()

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })

  const address = server.address()

  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error == null ? resolve() : reject(error)))
  })

  if (address == null || typeof address === 'string') {
    throw new Error('Expected TCP address with a numeric port')
  }

  return address.port
}

async function reserveUdpPort(): Promise<number> {
  const socket = createUdpSocket('udp4')

  await new Promise<void>((resolve, reject) => {
    socket.once('error', reject)
    socket.bind(0, '127.0.0.1', () => resolve())
  })

  const address = socket.address()

  await new Promise<void>((resolve) => {
    socket.close(() => resolve())
  })

  if (address == null || typeof address === 'string') {
    throw new Error('Expected UDP address with a numeric port')
  }

  return address.port
}

async function requestHttpWithRetries(port: number, path: string): Promise<string> {
  let lastError: unknown = null

  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      return await requestHttp(port, path)
    } catch (error) {
      lastError = error
      await sleep(100)
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

async function requestTcpWithRetries(port: number): Promise<string> {
  let lastError: unknown = null

  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      return await requestTcp(port)
    } catch (error) {
      lastError = error
      await sleep(100)
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

function requestTcp(port: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = connect({
      host: '127.0.0.1',
      port
    })
    let response = ''
    const timer = setTimeout(() => {
      socket.destroy()
      reject(new Error(`Timed out waiting for compiled net server on port ${port}`))
    }, 2000)

    socket.setEncoding('utf8')
    socket.on('data', (chunk) => {
      response += chunk
    })
    socket.on('end', () => {
      clearTimeout(timer)
      resolve(response)
    })
    socket.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
  })
}

function requestHttp(port: number, path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = connect({
      host: '127.0.0.1',
      port
    })
    let response = ''
    const timer = setTimeout(() => {
      socket.destroy()
      reject(new Error(`Timed out waiting for compiled HTTP server on port ${port}`))
    }, 2000)

    socket.setEncoding('utf8')
    socket.on('connect', () => {
      socket.write(`GET ${path} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n`)
    })
    socket.on('data', (chunk) => {
      response += chunk
    })
    socket.on('end', () => {
      clearTimeout(timer)
      resolve(normalizeNewlines(response))
    })
    socket.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
  })
}

async function requestUdpWithRetries(port: number, message: string): Promise<string> {
  let lastError: unknown = null

  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      return await requestUdp(port, message)
    } catch (error) {
      lastError = error
      await sleep(100)
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

function requestUdp(port: number, message: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = createUdpSocket('udp4')
    let settled = false
    const finish = (error: Error | null, value = '') => {
      if (settled) {
        return
      }

      settled = true
      clearTimeout(timer)
      socket.close()

      if (error != null) {
        reject(error)
      } else {
        resolve(value)
      }
    }
    const timer = setTimeout(() => {
      finish(new Error(`Timed out waiting for compiled dgram server on port ${port}`))
    }, 1000)

    socket.once('message', (buffer) => {
      finish(null, buffer.toString('utf8'))
    })
    socket.once('error', (error) => {
      finish(error)
    })
    socket.send(Buffer.from(message), port, '127.0.0.1', (error) => {
      if (error != null) {
        finish(error)
      }
    })
  })
}

function receiveUdpMessage(socket: ReturnType<typeof createUdpSocket>, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (error: Error | null, value = '') => {
      if (settled) {
        return
      }

      settled = true
      clearTimeout(timer)

      if (error != null) {
        reject(error)
      } else {
        resolve(value)
      }
    }
    const timer = setTimeout(() => {
      finish(new Error('Timed out waiting for compiled connected dgram client'))
    }, timeoutMs)

    socket.once('message', (buffer) => {
      finish(null, buffer.toString('utf8'))
    })
    socket.once('error', (error) => {
      finish(error)
    })
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
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
