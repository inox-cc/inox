import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { CompileError } from '../src/compiler/diagnostics.ts'
import { compileSource } from '../src/compiler/index.ts'
import type { CompileTarget } from '../src/compiler/types.ts'
import { runCommand, type CommandResult } from '../scripts/lib/run-command.ts'

test('lowers C console.log template interpolation', () => {
  const result = compileSource(
    `export function main(): void {
  const user = { name: 'Ada', score: 7 }
  const suffix = 'ok'
  const ready = true
  console.log(\`hello \${user.name} \${suffix} score \${user.score} ready \${ready}\`)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /ccjs_object_get_known\(user, 0, &ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_object_get_known\(user, 1, &ccjs_expr_value_\d+\)/)
  assert.match(result.code, /ccjs_string_from_bool\(&ccjs_default_allocator, \(ready\) != 0, &ccjs_value_\d+\)/)
  assert.match(result.code, /printf\("%\.\*s\\n", \(int\)ccjs_log_string_\d+->len, ccjs_log_string_\d+->bytes\);/)
})

test('diagnoses unsupported C template placeholders', () => {
  assertDiagnostic(
    `export function main(): void {
  console.log(\`hello \${missing}\`)
}
`,
    'CCJS_UNKNOWN_NAME',
    {
      target: 'c'
    }
  )
})

test('lowers C template interpolation as a runtime string expression', () => {
  const result = compileSource(
    `function fromReturn(): string {
  const str1 = 'ccjs cmake example'
  const num = 123
  return \`\${str1} \${String(num)}\`
}

function fromLocal(): string {
  const str1 = 'ccjs cmake example'
  const num = 123
  const t = \`\${str1} \${String(num)}\`
  return t
}

function echo(value: string): string {
  return value
}

const str1 = 'ccjs cmake example'
const num = 123
console.log(fromReturn())
console.log(fromLocal())
console.log(echo(\`\${str1} \${String(num)}\`))
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /#include <string\.h>/)
  assert.match(result.code, /ccjs_string_from_number\(&ccjs_default_allocator, num, &ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_string_concat_parts\(&ccjs_default_allocator,/)
  assert.match(result.code, /const ccjs_string\* t = \(ccjs_string\*\)ccjs_value_\d+\.as\.ref;/)
  assert.match(result.code, /echo\(ccjs_value_\d+\)/)
})

test('generated C console log template interpolation compiles and runs with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-template-log-'))
  const source = join(dir, 'template-log.c')
  const output = join(dir, 'template-log')

  try {
    const result = compileSource(
      `const user = { name: 'Ada', score: 7 }
const suffix = 'ok'
const ready = true
console.log(\`hello \${user.name} \${suffix} score \${user.score} ready \${ready}\`)
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
    assert.equal(run.stdout, 'hello Ada ok score 7 ready true\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C template interpolation works for return locals and string arguments', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-template-expr-'))
  const source = join(dir, 'template-expr.c')
  const output = join(dir, 'template-expr')

  try {
    const result = compileSource(
      `function fromReturn(): string {
  const str1 = 'ccjs cmake example'
  const num = 123
  return \`\${str1} \${String(num)}\`
}

function fromLocal(): string {
  const str1 = 'ccjs cmake example'
  const num = 123
  const t = \`\${str1} \${String(num)}\`
  return t
}

function echo(value: string): string {
  return value
}

const str1 = 'ccjs cmake example'
const num = 123
console.log(fromReturn())
console.log(fromLocal())
console.log(echo(\`\${str1} \${String(num)}\`))
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
    assert.equal(run.stdout, 'ccjs cmake example 123\nccjs cmake example 123\nccjs cmake example 123\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

function assertDiagnostic(source: string, code: string, options: { target?: CompileTarget } = {}): void {
  assert.throws(
    () => {
      compileSource(source, {
        target: options.target ?? 'js'
      })
    },
    (error) => {
      if (!(error instanceof CompileError)) {
        return false
      }

      assert.equal(
        error.diagnostics.some((item) => item.code === code),
        true
      )
      return true
    }
  )
}

function compileRuntimeProgram(source: string, output: string): Promise<CommandResult> {
  return runCommand('cc', [
    '-Iruntime/c/include',
    source,
    'runtime/c/src/core/value.c',
    'runtime/c/src/core/allocator.c',
    'runtime/c/src/core/callback.c',
    'runtime/c/src/binary/binary.c',
    'runtime/c/src/async/loop.c',
    'runtime/c/src/async/promise.c',
    'runtime/c/src/strings/string.c',
    'runtime/c/src/objects/object.c',
    'runtime/c/src/arrays/array.c',
    'runtime/c/src/collections/map.c',
    'runtime/c/src/collections/set.c',
    'runtime/c/src/fs/fs.c',
    'runtime/c/src/json/json.c',
    'runtime/c/src/time/time.c',
    '-o',
    output
  ])
}
