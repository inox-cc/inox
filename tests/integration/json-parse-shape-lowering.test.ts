import assert from 'node:assert/strict'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { compileFileToCModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'
import { rootDir } from '../../scripts/lib/repo-root.ts'
import { runCommand } from '../../scripts/lib/run-command.ts'

type GeneratedTextFile = {
  path: string
  code: string
}

export function assertJsonParseLiteralShapeUsesDirectVariableTarget(): void {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/src/index.ts',
        source: `
const foo = JSON.parse('{"v":[{"1":2},{"3":4,"5":"text"}]}')
console.log(Object.entries(foo.v)[0][0])
`
      }
    ],
    {
      root: '/'
    }
  )
  const files = compileFileToCModuleTextsSync('/pkg/src/index.ts', {
    callMain: true,
    host,
    sourceRoot: '/pkg'
  }) as GeneratedTextFile[]
  const source = generatedTextFile(files, 'src/index.cc').code

  assert.match(source, /inox_json_parse\(&inox_default_allocator, "\{\\"v\\":\[\{\\"1\\":2\},\{\\"3\\":4,\\"5\\":\\"text\\"\}\]\}", 34, &foo\)/)
  assert.match(source, /inox_object_get\(foo, "v", 1, &inox_value_\d+\)/)
  assert.doesNotMatch(source, /inox_json_value_\d+ = inox_undefined_value\(\);\n\s+if \(\n\s+inox_json_parse/)
  assert.doesNotMatch(source, /inox_field_status_\d+ = inox_object_get\(foo, "v", 1,/)
}

export function assertJsonParseCatchUsesRaiiErrorReset(): void {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/src/index.ts',
        source: `
try {
  JSON.parse('{')
} catch (error) {
  console.log(error)
}
`
      }
    ],
    {
      root: '/'
    }
  )
  const files = compileFileToCModuleTextsSync('/pkg/src/index.ts', {
    callMain: true,
    host,
    sourceRoot: '/pkg'
  }) as GeneratedTextFile[]
  const source = generatedTextFile(files, 'src/index.cc').code

  assert.match(source, /inox_error = inox_undefined_value\(\);/)
  assert.doesNotMatch(source, /inox_release\(inox_error\);/)
  assert.doesNotMatch(source, /inox_release\(inox_json_error_\d+\);/)
}

export async function assertNativeJsonParseUnicodeLiteralShapeUsesDirectVariableTarget(): Promise<void> {
  const workspace = join(rootDir, 'dist/test-tmp/native-json-parse-shape-lowering')
  const input = join(workspace, 'index.ts')
  const outputCc = join(workspace, 'index.cc')

  try {
    await rm(workspace, {
      recursive: true,
      force: true
    })
    await mkdir(workspace, {
      recursive: true
    })
    await writeFile(
      input,
      [
        'function run(): void {',
        'const foo = JSON.parse(\'{"v":[{"1":2},{"3":4,"5":"блаблабла"}]}\')',
        'console.log(Object.entries(foo.v)[0][0])',
        '}',
        'run()',
        ''
      ].join('\n')
    )

    const emit = await runCommand(join(rootDir, 'dist/inox'), [input, outputCc])

    assert.equal(
      emit.code,
      0,
      `dist/inox JSON.parse shape emit failed\nstdout:\n${emit.stdout}\nstderr:\n${emit.stderr}`
    )
    assert.equal(emit.stderr, '')

    const source = await readFile(outputCc, 'utf8')

    assert.match(
      source,
      /inox_json_parse\(&inox_default_allocator, "\{\\"v\\":\[\{\\"1\\":2\},\{\\"3\\":4,\\"5\\":\\"блаблабла\\"\}\]\}", 48, &foo\)/
    )
    assert.match(source, /inox_object_get\(foo, "v", 1, &inox_value_\d+\)/)
    assert.doesNotMatch(source, /inox_json_value_\d+ = inox_undefined_value\(\);\n\s+if \(\n\s+inox_json_parse/)
    assert.doesNotMatch(source, /inox_field_status_\d+ = inox_object_get\(foo, "v", 1,/)
  } finally {
    await rm(workspace, {
      recursive: true,
      force: true
    })
  }
}

function generatedTextFile(files: GeneratedTextFile[], path: string): GeneratedTextFile {
  for (const file of files) {
    if (file.path === path) {
      return file
    }
  }

  assert.fail(`missing generated file ${path}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assertJsonParseLiteralShapeUsesDirectVariableTarget()
  assertJsonParseCatchUsesRaiiErrorReset()
  await assertNativeJsonParseUnicodeLiteralShapeUsesDirectVariableTarget()
}
