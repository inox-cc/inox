import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { CompileError } from '../compiler/diagnostics.ts'
import { compileSource } from '../compiler/index.ts'
import type { CompileTarget } from '../compiler/types.ts'
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

  assert.match(result.code, /inox_object_get_known\(user, 0, &inox_(?:expr_)?value_\d+\)/)
  assert.match(result.code, /inox_object_get_known\(user, 1, &inox_expr_value_\d+\)/)
  assert.match(result.code, /inox_string_from_bool\(&inox_default_allocator, \(ready\) != 0, &inox_value_\d+\)/)
  assert.match(result.code, /printf\("%\.\*s\\n", \(int\)inox_log_string_\d+->len, inox_log_string_\d+->bytes\);/)
})

test('diagnoses unsupported C template placeholders', () => {
  assertDiagnostic(
    `export function main(): void {
  console.log(\`hello \${missing}\`)
}
`,
    'INOX_UNKNOWN_NAME',
    {
      target: 'c'
    }
  )
})

test('lowers C template interpolation as a runtime string expression', () => {
  const result = compileSource(
    `function fromReturn(): string {
  const str1 = 'inox cmake example'
  const num = 123
  return \`\${str1} \${String(num)}\`
}

function fromLocal(): string {
  const str1 = 'inox cmake example'
  const num = 123
  const t = \`\${str1} \${String(num)}\`
  return t
}

function echo(value: string): string {
  return value
}

const str1 = 'inox cmake example'
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
  assert.match(result.code, /inox_string_from_number\(&inox_default_allocator, num, &inox_value_\d+\)/)
  assert.match(result.code, /inox_string_concat_parts\(&inox_default_allocator,/)
  assert.match(result.code, /const inox_string\* t = \(inox_string\*\)[A-Za-z_][A-Za-z0-9_]*\.as\.ref;/)
  assert.match(result.code, /echo\(inox_value_\d+\)/)
})

test('lowers C template interpolation for unknown runtime values', () => {
  const result = compileSource(
    `function label(value: unknown): string {
  return \`value \${value}\`
}

console.log(label('Ada'), label(7), label(true), label(null))
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /inox_string_from_value\(&inox_default_allocator, value, &inox_value_\d+\)/)
  assert.doesNotMatch(result.code, /template placeholders currently support/)
})

test('lowers C template interpolation for array join runtime strings', () => {
  const result = compileSource(
    `export function main(): void {
  const features = ['parser', 'checker']
  console.log(\`features \${features.join(', ')}\`)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /inox_array_join\(&inox_default_allocator, features, ", ", 2, &inox_array_join_\d+\)/)
  assert.match(result.code, /inox_template_string_\d+ = \(inox_string\*\)inox_array_join_\d+\.as\.ref;/)
  assert.doesNotMatch(
    result.code,
    /inox_string_from_number\(&inox_default_allocator, inox_array_join_\d+, &inox_value_\d+\)/
  )
})

test('lowers C template interpolation for object function field runtime values', () => {
  const result = compileSource(
    `type Deps = {
  read: () => string[]
}

function label(deps: Deps): string {
  return \`value \${deps.read()}\`
}

export function main(): void {
  const deps: Deps = { read: () => ['a', 'b'] }
  console.log(label(deps))
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /inox_string_from_value\(&inox_default_allocator, inox_value_\d+, &inox_value_\d+\)/)
  assert.doesNotMatch(result.code, /inox_string_from_number\(&inox_default_allocator, inox_objfn_deps_read\(/)
})

test('lowers C nullable string parameters through runtime values until narrowed', () => {
  const result = compileSource(
    `function ok(value: string | null | undefined): boolean {
  if (value === null) {
    return false
  }

  return value === 'ok'
}

console.log(ok(null), ok('ok'))
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /inox_value value = inox_param_value;/)
  assert.match(result.code, /value\.tag == INOX_TAG_NULL \|\| value\.tag == INOX_TAG_UNDEFINED/)
  assert.match(result.code, /inox_string\* inox_cmp_string_\d+ = \(inox_string\*\)value\.as\.ref;/)
  assert.doesNotMatch(result.code, /inox_string\* value = \(inox_string\*\)inox_param_value\.as\.ref;/)
})

test('generated C console log template interpolation compiles and runs with runtime sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'inox-c-template-log-'))
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

  const dir = await mkdtemp(join(tmpdir(), 'inox-c-template-expr-'))
  const source = join(dir, 'template-expr.c')
  const output = join(dir, 'template-expr')

  try {
    const result = compileSource(
      `function fromReturn(): string {
  const str1 = 'inox cmake example'
  const num = 123
  return \`\${str1} \${String(num)}\`
}

function fromLocal(): string {
  const str1 = 'inox cmake example'
  const num = 123
  const t = \`\${str1} \${String(num)}\`
  return t
}

function echo(value: string): string {
  return value
}

const str1 = 'inox cmake example'
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
    assert.equal(run.stdout, 'inox cmake example 123\ninox cmake example 123\ninox cmake example 123\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('generated C template interpolation formats unknown runtime values', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'inox-c-template-unknown-'))
  const source = join(dir, 'template-unknown.c')
  const output = join(dir, 'template-unknown')

  try {
    const result = compileSource(
      `function label(value: unknown): string {
  return \`value \${value}\`
}

console.log(label('Ada'))
console.log(label(7))
console.log(label(true))
console.log(label(null))
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
    assert.equal(run.stdout, 'value Ada\nvalue 7\nvalue true\nvalue null\n')
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
        target: options.target ?? 'c'
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
    '-Iruntime/include',
    source,
    'runtime/src/core/value.c',
    'runtime/src/core/allocator.c',
    'runtime/src/core/callback.c',
    'runtime/src/core/debug.c',
    'runtime/src/core/weak.c',
    'runtime/src/binary/binary.c',
    'runtime/src/crypto/crypto.c',
    'runtime/src/async/loop.c',
    'runtime/src/async/promise.c',
    'runtime/src/strings/string.c',
    'runtime/src/child_process/child_process.c',
    'runtime/src/objects/object.c',
    'runtime/src/arrays/array.c',
    'runtime/src/collections/map.c',
    'runtime/src/collections/set.c',
    'runtime/src/console/console.c',
    'runtime/src/fs/fs.c',
    'runtime/src/json/json.c',
    'runtime/src/os/os.c',
    'runtime/src/path/path.c',
    'runtime/src/process/process.c',
    'runtime/src/time/time.c',
    'runtime/src/url/url.c',
    '-o',
    output
  ])
}
