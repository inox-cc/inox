import assert from 'node:assert/strict'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { compileSource } from '../../compiler/core.ts'
import { rootDir } from '../../scripts/lib/repo-root.ts'
import { runCommand } from '../../scripts/lib/run-command.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

const sourceText = `
import { URL } from 'node:url'

const page = new URL('https://example.com/')
console.log(page.hostname)
`

export function assertRuntimeLogValuesUseDirectRaiiAssignment(): void {
  const result = compileSource(sourceText, {
    libraries: defaultCompilerLibrarySet,
    target: 'cc'
  })

  assertDirectRaiiAssignment(result.code)
}

export async function assertNativeCompilerRuntimeLogValuesUseDirectRaiiAssignment(compilerPath: string): Promise<void> {
  const workspace = join(rootDir, 'dist/test-tmp/runtime-log-value-assignment-lowering')
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
      `dist/inox runtime log value emit failed\nstdout:\n${emit.stdout}\nstderr:\n${emit.stderr}`
    )
    assert.equal(emit.stderr, '')

    assertDirectRaiiAssignment(await readFile(outputCc, 'utf8'))
  } finally {
    await rm(workspace, {
      recursive: true,
      force: true
    })
  }
}

function assertDirectRaiiAssignment(source: string): void {
  assert.match(source, /inox::Value inox_log_value_\d+;/)
  assert.match(source, /inox_log_value_\d+ = inox::get\(page, "hostname"\);/)
  assert.doesNotMatch(source, /inox_log_value_\d+ = inox_undefined_value\(\);/)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assertRuntimeLogValuesUseDirectRaiiAssignment()
}
