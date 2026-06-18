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



test('C runtime console adapter captures stdout and stderr writes', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-console-runtime-'))
  const source = join(dir, 'console-runtime.c')
  const output = join(dir, 'console-runtime')

  try {
    await writeFile(
      source,
      `#include <stdio.h>
#include <string.h>
#include "ccjs/console.h"

typedef struct capture {
  char out[64];
  size_t out_len;
  char err[64];
  size_t err_len;
} capture;

static ccjs_status capture_write(void* user, ccjs_console_stream stream, const char* bytes, size_t len) {
  capture* cap = (capture*)user;
  char* target = stream == CCJS_CONSOLE_STDERR ? cap->err : cap->out;
  size_t* target_len = stream == CCJS_CONSOLE_STDERR ? &cap->err_len : &cap->out_len;

  if (*target_len + len >= 64) return CCJS_ERR_OOM;
  memcpy(target + *target_len, bytes, len);
  *target_len += len;
  target[*target_len] = '\\0';
  return CCJS_OK;
}

int main(void) {
  capture cap = { 0 };
  ccjs_console_set_adapter((ccjs_console_adapter){ &cap, capture_write });

  if (ccjs_console_write_line(CCJS_CONSOLE_STDOUT, "hello", 5) != CCJS_OK) return 1;
  if (ccjs_console_printf(CCJS_CONSOLE_STDERR, "%s %d\\n", "bad", 7) < 0) return 2;

  ccjs_console_clear_adapter();
  printf("%s|%s", cap.out, cap.err);
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
      '-o',
      output
    ])

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, 'hello\n|bad 7\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C direct console log string return compiles and runs with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-direct-string-return-log-'))
  const source = join(dir, 'direct-string-return-log.c')
  const output = join(dir, 'direct-string-return-log')

  try {
    const result = compileSource(
      `function getName(): string {
  return 'Ada'
}

console.log(getName())

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


test('generated C direct console log member and index expressions compile and run with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-direct-console-'))
  const source = join(dir, 'direct-console.c')
  const output = join(dir, 'direct-console')

  try {
    const result = compileSource(
      `const user = { score: 42, active: true, name: 'Ada' }
const values = [7, false, 'Grace']
console.log(user.score, user.active, user.name, user['name'], values[0], values[1], values[2])

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
    assert.equal(run.stdout, '42 1 Ada Ada 7 0 Grace\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})
