import assert from 'node:assert/strict'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { compileSource } from '../../compiler/core.ts'
import { rootDir } from '../../scripts/lib/repo-root.ts'
import { runCommand } from '../../scripts/lib/run-command.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

const sourceText = `
type Payload = {
  name: string
  count: number
  nested: object
}

function fail(): string {
  throw 'boom'
}

function read(payload: Payload): void {
  const name = payload.name
  const count = payload.count
  const nested = payload.nested
  console.log(name, count, nested)
}

function inspect(payload: Payload | null, enabled: boolean): void {
  let uninitialized: Payload
  let nullable: string | null = null
  const name = payload?.name
  nullable = name
  const selected = enabled ? name : nullable
  console.log(selected ?? 'none')

  try {
    console.log(fail())
  } catch (error) {
    console.log(error)
  }
}
`

export function assertRuntimeValuesUseRaiiAssignments(): void {
  const result = compileSource(sourceText, {
    libraries: defaultCompilerLibrarySet,
    target: 'cc'
  })

  assertRaiiAssignments(result.code)
}

export async function assertNativeCompilerRuntimeValuesUseRaiiAssignments(compilerPath: string): Promise<void> {
  const workspace = join(rootDir, 'dist/test-tmp/runtime-value-raii-assignment-lowering')
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
    await writeFile(input, sourceText)

    const emit = await runCommand(compilerPath, [input, outputCc])

    assert.equal(
      emit.code,
      0,
      `dist/inox runtime value RAII emit failed\nstdout:\n${emit.stdout}\nstderr:\n${emit.stderr}`
    )
    assert.equal(emit.stderr, '')

    assertRaiiAssignments(await readFile(outputCc, 'utf8'))
  } finally {
    await rm(workspace, {
      recursive: true,
      force: true
    })
  }
}

function assertRaiiAssignments(source: string): void {
  assert.match(source, /inox::Value uninitialized;/)
  assert.doesNotMatch(source, /uninitialized = inox_undefined_value\(\);/)
  assert.match(source, /inox_field_\d+ = inox::get\(payload, "name"\);/)
  assert.match(source, /inox_field_\d+ = inox::get\(payload, "count"\);/)
  assert.match(source, /nested = inox::get\(payload, "nested"\);/)
  assert.doesNotMatch(source, /(?:inox_field_\d+|nested) = inox_undefined_value\(\);/)
  assert.match(source, /nullable = inox_nullable_value_\d+;/)
  assert.doesNotMatch(source, /inox_(?:nullable_conditional|value)_\d+ = inox_undefined_value\(\);/)
  assert.doesNotMatch(source, /inox_retain\(inox_(?:nullable_conditional|nullable_value|value)_\d+\);/)
  assert.doesNotMatch(source, /inox_release\(nullable\);/)
  assert.match(source, /fail\(&inox_call_result_\d+, inox_error\.out\(\)\)/)
  assert.doesNotMatch(source, /inox_error = inox_undefined_value\(\);/)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assertRuntimeValuesUseRaiiAssignments()
}
