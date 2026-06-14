import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
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
    await checkLibuvFsRuntime(buildDir)
    console.log('Libuv checks passed')
  }
} finally {
  await rm(buildDir, {
    recursive: true,
    force: true
  })
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

  await expectMissing(mutationInput)
  await expectMissing(mutationRenamed)
  await expectMissing(mutationNested)
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
