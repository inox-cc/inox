import { test } from 'node:test'

import type { Diagnostic } from '../compiler/types.ts'
import { CompileError, formatDiagnostics } from '../compiler/diagnostics.ts'
import {
  assert,
  compileRuntimeProgram,
  compileSource,
  join,
  mkdtemp,
  rm,
  runCommand,
  tmpdir,
  writeFile
} from './helpers/runtime-c.ts'

type FeatureCaseMode = 'compile-only' | 'compile-and-run'
type FeatureReportMode = 'brief' | 'verbose'

type FeatureCase = {
  name: string
  source: string
  mode: FeatureCaseMode
  expectedStdout?: string
  expectedStderr?: string
  expectedDiagnostics?: string[]
  reason?: string
}

type FailurePhase = 'node-compile' | 'emitted-c-compile' | 'emitted-binary-run' | 'stdout-compare'

type FailureRecord = {
  name: string
  phase: FailurePhase
  message: string
  diagnostics?: Diagnostic[]
  stdout?: string
  stderr?: string
  exitCode?: number
  emittedCPath?: string
}

const featureCases: FeatureCase[] = [
  {
    name: 'empty-program',
    source: '',
    mode: 'compile-and-run',
    expectedStdout: ''
  },
  {
    name: 'number-literal',
    source: `console.log(1)
`,
    mode: 'compile-and-run',
    expectedStdout: '1\n'
  },
  {
    name: 'boolean-literal',
    source: `console.log(true)
console.log(false)
`,
    mode: 'compile-and-run',
    expectedStdout: '1\n0\n'
  },
  {
    name: 'string-literal',
    source: `console.log('hello')
`,
    mode: 'compile-and-run',
    expectedStdout: 'hello\n'
  },
  {
    name: 'template-literal-escape-sequences',
    source: 'const value: string = `a\\nb`\nconsole.log(value)\n',
    mode: 'compile-and-run',
    expectedStdout: 'a\nb\n'
  },
  {
    name: 'comment-line-and-block',
    source: `// leading line comment
/* block comment */
console.log(3)
`,
    mode: 'compile-and-run',
    expectedStdout: '3\n'
  },
  {
    name: 'const-number',
    source: `const value: number = 7
console.log(value)
`,
    mode: 'compile-and-run',
    expectedStdout: '7\n'
  },
  {
    name: 'const-boolean',
    source: `const value: boolean = false
console.log(value)
`,
    mode: 'compile-and-run',
    expectedStdout: '0\n'
  },
  {
    name: 'const-string',
    source: `const value: string = 'Ada'
console.log(value)
`,
    mode: 'compile-and-run',
    expectedStdout: 'Ada\n'
  },
  {
    name: 'let-reassign-same-type',
    source: `let value: number = 1
value = 2
console.log(value)
`,
    mode: 'compile-and-run',
    expectedStdout: '2\n'
  },
  {
    name: 'scalar-from-binary-expression',
    source: `const value: number = 1 + 2 * 3
console.log(value)
`,
    mode: 'compile-and-run',
    expectedStdout: '7\n'
  },
  {
    name: 'unary-minus-and-logical-not',
    source: `console.log(-3)
console.log(!false)
`,
    mode: 'compile-and-run',
    expectedStdout: '-3\n1\n'
  },
  {
    name: 'binary-add-string',
    source: `const value: string = 'hello ' + 'world'
console.log(value)
`,
    mode: 'compile-and-run',
    expectedStdout: 'hello world\n'
  },
  {
    name: 'strict-equality-number',
    source: `console.log(1 === 1)
console.log(1 === 2)
`,
    mode: 'compile-and-run',
    expectedStdout: '1\n0\n'
  },
  {
    name: 'logical-and-or',
    source: `console.log(true && false)
console.log(false || true)
`,
    mode: 'compile-and-run',
    expectedStdout: '0\n1\n'
  },
  {
    name: 'ternary-expression',
    source: `const value: number = true ? 3 : 4
console.log(value)
`,
    mode: 'compile-and-run',
    expectedStdout: '3\n'
  },
  {
    name: 'if-else',
    source: `const enabled: boolean = true
if (enabled) {
  console.log('yes')
} else {
  console.log('no')
}
`,
    mode: 'compile-and-run',
    expectedStdout: 'yes\n'
  },
  {
    name: 'while-counter',
    source: `let index: number = 0
while (index < 3) {
  console.log(index)
  index++
}
`,
    mode: 'compile-and-run',
    expectedStdout: '0\n1\n2\n'
  },
  {
    name: 'for-counter',
    source: `for (let index = 0; index < 3; index++) {
  console.log(index)
}
`,
    mode: 'compile-and-run',
    expectedStdout: '0\n1\n2\n'
  },
  {
    name: 'break-and-continue-in-loop',
    source: `for (let index = 0; index < 5; index++) {
  if (index === 1) {
    continue
  }
  if (index === 3) {
    break
  }
  console.log(index)
}
`,
    mode: 'compile-and-run',
    expectedStdout: '0\n2\n'
  },
  {
    name: 'switch-number',
    source: `const value: number = 2
switch (value) {
  case 1:
    console.log('one')
    break
  case 2:
    console.log('two')
    break
  default:
    console.log('other')
}
`,
    mode: 'compile-and-run',
    expectedStdout: 'two\n'
  },
  {
    name: 'function-number-return',
    source: `function score(): number {
  return 42
}
console.log(score())
`,
    mode: 'compile-and-run',
    expectedStdout: '42\n'
  },
  {
    name: 'function-param-number',
    source: `function add(left: number, right: number): number {
  return left + right
}
console.log(add(2, 5))
`,
    mode: 'compile-and-run',
    expectedStdout: '7\n'
  },
  {
    name: 'object-field-number',
    source: `const user = { score: 7 }
console.log(user.score)
`,
    mode: 'compile-and-run',
    expectedStdout: '7\n'
  },
  {
    name: 'object-field-string',
    source: `const user = { name: 'Ada' }
console.log(user.name)
`,
    mode: 'compile-and-run',
    expectedStdout: 'Ada\n'
  },
  {
    name: 'object-field-nested-object',
    source: `const user = { profile: { score: 7 } }
console.log(user.profile.score)
`,
    mode: 'compile-and-run',
    expectedStdout: '7\n'
  },
  {
    name: 'Object.keys-minimal',
    source: `const user = { name: 'Ada', score: 7 }
console.log(Object.keys(user))
`,
    mode: 'compile-and-run',
    expectedStdout: '[name, score]\n'
  },
  {
    name: 'Object.values-minimal',
    source: `const user = { name: 'Ada', score: 7 }
console.log(Object.values(user))
`,
    mode: 'compile-and-run',
    expectedStdout: '[Ada, 7]\n'
  },
  {
    name: 'array-empty',
    source: `const values: number[] = []
console.log(values.length)
`,
    mode: 'compile-and-run',
    expectedStdout: '0\n'
  },
  {
    name: 'array-number-literal',
    source: `const values = [1, 2, 3]
console.log(values.length)
`,
    mode: 'compile-and-run',
    expectedStdout: '3\n'
  },
  {
    name: 'array-length-const',
    source: `const values: number[] = []
const len: number = values.length
console.log(len)
`,
    mode: 'compile-and-run',
    expectedStdout: '0\n'
  },
  {
    name: 'array-index-read',
    source: `const values = [4, 5]
console.log(values[1])
`,
    mode: 'compile-and-run',
    expectedStdout: '5\n'
  },
  {
    name: 'array-index-write',
    source: `const values: number[] = [1]
values[0] = 9
console.log(values[0])
`,
    mode: 'compile-and-run',
    expectedStdout: '9\n'
  },
  {
    name: 'array-push-number',
    source: `const values: number[] = []
values.push(4)
console.log(values.length)
console.log(values[0])
`,
    mode: 'compile-and-run',
    expectedStdout: '1\n4\n'
  },
  {
    name: 'array-pop-number',
    source: `const values: number[] = [4]
console.log(values.pop() ?? 0)
console.log(values.length)
`,
    mode: 'compile-and-run',
    expectedStdout: '4\n0\n'
  },
  {
    name: 'array-includes-number',
    source: `const values = [1, 2]
console.log(values.includes(2))
console.log(values.includes(3))
`,
    mode: 'compile-and-run',
    expectedStdout: '1\n0\n'
  },
  {
    name: 'for-of-array',
    source: `const values = [1, 2]
for (const value of values) {
  console.log(value)
}
`,
    mode: 'compile-and-run',
    expectedStdout: '1\n2\n'
  },
  {
    name: 'empty-array-reverse-loop',
    source: `const values: number[] = []
for (let index = values.length - 1; index >= 0; index--) {
  console.log(values[index])
}
console.log(values.length)
`,
    mode: 'compile-and-run',
    expectedStdout: '0\n'
  },
  {
    name: 'object-nullish-guard',
    source: `type Ref = { type: string, name: string }
const expression: Ref | null = { type: 'Reference', name: 'value' }
if (expression !== null && typeof expression !== 'undefined' && expression.type === 'Reference') {
  console.log(expression.name)
}
`,
    mode: 'compile-and-run',
    expectedStdout: 'value\n'
  },
  {
    name: 'Array.isArray-array-and-non-array',
    source: `console.log(Array.isArray([1]))
console.log(Array.isArray(1))
`,
    mode: 'compile-and-run',
    expectedStdout: '1\n0\n'
  },
  {
    name: 'string-length',
    source: `const value = 'Ada'
console.log(value.length)
`,
    mode: 'compile-and-run',
    expectedStdout: '3\n'
  },
  {
    name: 'string-predicate-methods',
    source: `const value = 'Ada'
console.log(value.includes('d'))
console.log(value.startsWith('A'))
console.log(value.endsWith('a'))
`,
    mode: 'compile-and-run',
    expectedStdout: '1\n1\n1\n'
  },
  {
    name: 'string-slice-and-trim',
    source: `const value = ' Ada '
console.log(value.trim())
console.log(value.slice(1, 4))
`,
    mode: 'compile-and-run',
    expectedStdout: 'Ada\nAda\n'
  },
  {
    name: 'string-split',
    source: `const values = 'a,b'.split(',')
console.log(values.length)
console.log(values[1])
`,
    mode: 'compile-and-run',
    expectedStdout: '2\nb\n'
  },
  {
    name: 'JSON.parse-object-field',
    source: `const value = JSON.parse('{"score":7}')
console.log(value.score)
`,
    mode: 'compile-and-run',
    expectedStdout: '7\n'
  },
  {
    name: 'Math-number-methods',
    source: `console.log(Math.floor(1.8))
console.log(Math.max(1, 3))
console.log(Math.abs(-2))
`,
    mode: 'compile-and-run',
    expectedStdout: '1\n3\n2\n'
  },
  {
    name: 'Number-and-String-conversions',
    source: `console.log(Number('42') ?? 0)
console.log(String(7))
`,
    mode: 'compile-and-run',
    expectedStdout: '42\n7\n'
  },
  {
    name: 'try-catch-string',
    source: `try {
  throw 'bad'
} catch (error) {
  console.log(error)
}
`,
    mode: 'compile-and-run',
    expectedStdout: 'bad\n'
  },
  {
    name: 'class-constructor-field-read',
    source: `class Box {
  value: number

  constructor(value: number) {
    this.value = value
  }
}

const box = new Box(7)
console.log(box.value)
`,
    mode: 'compile-and-run',
    expectedStdout: '7\n'
  },
  {
    name: 'let-reassign-type-error',
    source: `let value: number = 1
value = 'two'
console.log(value)
`,
    mode: 'compile-only',
    expectedDiagnostics: ['INOX_TYPE_MISMATCH']
  },
  {
    name: 'assign-const-diagnostic',
    source: `const value: number = 1
value = 2
`,
    mode: 'compile-only',
    expectedDiagnostics: ['INOX_ASSIGN_CONST']
  },
  {
    name: 'invalid-break-diagnostic',
    source: `break
`,
    mode: 'compile-only',
    expectedDiagnostics: ['INOX_BREAK_OUTSIDE']
  },
  {
    name: 'invalid-continue-diagnostic',
    source: `continue
`,
    mode: 'compile-only',
    expectedDiagnostics: ['INOX_CONTINUE_OUTSIDE']
  },
  {
    name: 'no-var-diagnostic',
    source: `var value = 1
console.log(value)
`,
    mode: 'compile-only',
    expectedDiagnostics: ['INOX_NO_VAR']
  },
  {
    name: 'dynamic-import-diagnostic',
    source: `const module = import('./other.ts')
console.log(module)
`,
    mode: 'compile-only',
    expectedDiagnostics: ['INOX_NO_DYNAMIC_IMPORT']
  }
]

const featureReportMode: FeatureReportMode = process.env.INOX_FEATURE_TEST_REPORT === 'verbose' ? 'verbose' : 'brief'

test('compiler feature matrix', { timeout: 120_000 }, async (t) => {
  const cc = await runCommand('cc', ['--version'])

  if (cc.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'inox-feature-matrix-'))
  const failures: FailureRecord[] = []
  let passed = 0
  let keepArtifacts = false

  try {
    for (let index = 0; index < featureCases.length; index = index + 1) {
      const featureCase = featureCases[index]
      const failure = await runFeatureCase(featureCase, dir)

      if (failure) {
        failures.push(failure)
        console.error(formatFailure(failure))
      } else {
        passed = passed + 1

        if (featureReportMode === 'verbose') {
          console.log(formatPassed(featureCase))
        }
      }
    }

    console.log(`passed: ${passed}`)
    console.log(`failed: ${failures.length}`)
    console.log(`total: ${featureCases.length}`)

    keepArtifacts = failures.length > 0

    assert.equal(failures.length, 0, `feature matrix failed: ${failures.length}/${featureCases.length} cases failed`)
  } finally {
    if (!keepArtifacts) {
      await rm(dir, { recursive: true, force: true })
    }
  }
})

async function runFeatureCase(featureCase: FeatureCase, dir: string): Promise<FailureRecord | null> {
  const emittedCPath = join(dir, `${featureCase.name}.c`)
  const exePath = join(dir, featureCase.name)
  let emittedC: string

  try {
    const result = compileSource(featureCase.source, {
      target: 'c'
    })

    emittedC = result.code
  } catch (error) {
    if (featureCase.expectedDiagnostics) {
      return expectedDiagnosticFailureOrNull(featureCase, error)
    }

    return {
      name: featureCase.name,
      phase: 'node-compile',
      message: 'Node compiler threw unexpectedly',
      diagnostics: compileErrorDiagnostics(error)
    }
  }

  await writeFile(emittedCPath, emittedC)

  if (featureCase.expectedDiagnostics) {
    return {
      name: featureCase.name,
      phase: 'node-compile',
      message: `expected diagnostics ${featureCase.expectedDiagnostics.join(', ')}, but Node compiler emitted C`,
      emittedCPath
    }
  }

  if (featureCase.mode === 'compile-only') {
    return null
  }

  const compile = await compileRuntimeProgram(emittedCPath, exePath)

  if (compile.code !== 0) {
    return {
      name: featureCase.name,
      phase: 'emitted-c-compile',
      message: 'emitted C did not compile',
      stdout: compile.stdout,
      stderr: compile.stderr,
      exitCode: compile.code,
      emittedCPath
    }
  }

  const run = await runCommand(exePath, [])

  if (run.code !== 0) {
    return {
      name: featureCase.name,
      phase: 'emitted-binary-run',
      message: 'emitted binary exited with failure',
      stdout: run.stdout,
      stderr: run.stderr,
      exitCode: run.code,
      emittedCPath
    }
  }

  const expectedStdout = featureCase.expectedStdout ?? ''
  const expectedStderr = featureCase.expectedStderr ?? ''

  if (run.stdout !== expectedStdout || run.stderr !== expectedStderr) {
    return {
      name: featureCase.name,
      phase: 'stdout-compare',
      message: formatStdoutMismatch(expectedStdout, expectedStderr, run.stdout, run.stderr),
      stdout: run.stdout,
      stderr: run.stderr,
      exitCode: run.code,
      emittedCPath
    }
  }

  return null
}

function expectedDiagnosticFailureOrNull(featureCase: FeatureCase, error: unknown): FailureRecord | null {
  const diagnostics = compileErrorDiagnostics(error)

  if (!diagnostics) {
    return {
      name: featureCase.name,
      phase: 'node-compile',
      message: 'expected diagnostics, but Node compiler threw a non-diagnostic error'
    }
  }

  const expectedDiagnostics = featureCase.expectedDiagnostics ?? []
  const missingDiagnostics: string[] = []

  for (let index = 0; index < expectedDiagnostics.length; index = index + 1) {
    const expectedDiagnostic = expectedDiagnostics[index]

    if (!diagnostics.some((item) => item.code === expectedDiagnostic)) {
      missingDiagnostics.push(expectedDiagnostic)
    }
  }

  if (missingDiagnostics.length > 0) {
    return {
      name: featureCase.name,
      phase: 'node-compile',
      message: `missing expected diagnostics: ${missingDiagnostics.join(', ')}`,
      diagnostics
    }
  }

  return null
}

function compileErrorDiagnostics(error: unknown): Diagnostic[] | undefined {
  if (error instanceof CompileError) {
    return error.diagnostics
  }

  return undefined
}

function formatFailure(failure: FailureRecord): string {
  const lines = [`${failure.name}: ${failure.phase} failed`, failure.message]

  if (failure.diagnostics) {
    lines.push('diagnostics:', formatDiagnostics(failure.diagnostics))
  }

  if (typeof failure.exitCode !== 'undefined') {
    lines.push(`exit code: ${failure.exitCode}`)
  }

  if (typeof failure.stdout !== 'undefined' && failure.stdout !== '') {
    lines.push('stdout:', failure.stdout)
  }

  if (typeof failure.stderr !== 'undefined' && failure.stderr !== '') {
    lines.push('stderr:', failure.stderr)
  }

  if (failure.emittedCPath) {
    lines.push(`emitted C: ${failure.emittedCPath}`)
  }

  return lines.join('\n')
}

function formatPassed(featureCase: FeatureCase): string {
  const details: string[] = [featureCase.mode]

  if (featureCase.expectedDiagnostics) {
    details.push(`diagnostics: ${featureCase.expectedDiagnostics.join(', ')}`)
  } else if (featureCase.mode === 'compile-and-run') {
    details.push(`stdout: ${JSON.stringify(featureCase.expectedStdout ?? '')}`)
  }

  return `${featureCase.name}: passed (${details.join('; ')})`
}

function formatStdoutMismatch(
  expectedStdout: string,
  expectedStderr: string,
  actualStdout: string,
  actualStderr: string
): string {
  return [
    'stdout/stderr mismatch',
    `expected stdout: ${JSON.stringify(expectedStdout)}`,
    `actual stdout: ${JSON.stringify(actualStdout)}`,
    `expected stderr: ${JSON.stringify(expectedStderr)}`,
    `actual stderr: ${JSON.stringify(actualStderr)}`
  ].join('\n')
}
