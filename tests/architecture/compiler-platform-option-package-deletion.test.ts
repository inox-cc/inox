import assert from 'node:assert/strict'
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { test } from 'node:test'

import { runCompilerCli, type CliEnvironment } from '../../compiler/cli.ts'
import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import {
  createCompilerLibrarySetFromDiscovered,
  generateCompilerLibraryRegistry
} from '../../scripts/lib/compiler-library-registry.ts'

const fixture = resolve('dist/test-tmp/compiler-platform-option-package-deletion')
const output = resolve(fixture, 'dist/compiler-libraries')
const input = resolve(fixture, 'index.ts')

test('удаление descriptor-only platform package удаляет его CLI options', async () => {
  await rm(fixture, { force: true, recursive: true })
  await mkdir(resolve(fixture, 'stdlib/global'), { recursive: true })
  await mkdir(resolve(fixture, 'stdlib/node'), { recursive: true })
  await cp(resolve('stdlib/global/platform'), resolve(fixture, 'stdlib/global/platform'), { recursive: true })
  await writeFile(input, '1 + 2\n')

  try {
    await generateCompilerLibraryRegistry(fixture, output)

    const before = createCompilerLibrarySetFromDiscovered(await discoverCompilerLibraries(fixture))
    const beforeRegistry = await readFile(resolve(output, 'default-registry.ts'), 'utf8')
    const beforeResult = runCli(before, [input, '--loop-backend', 'libuv'])

    assert.equal(beforeResult.exitCode, 0)
    assert.equal((before.options ?? []).some((option) => option.optionId === 'global:platform#loop-backend'), true)
    assert.match(beforeRegistry, /stdlib\/global\/platform\/compiler\/index\.ts/)

    await rm(resolve(fixture, 'stdlib/global/platform'), { force: true, recursive: true })
    await generateCompilerLibraryRegistry(fixture, output)

    const after = createCompilerLibrarySetFromDiscovered(await discoverCompilerLibraries(fixture))
    const afterRegistry = await readFile(resolve(output, 'default-registry.ts'), 'utf8')
    const afterResult = runCli(after, [input, '--loop-backend', 'libuv'])

    assert.equal(afterResult.exitCode, 1)
    assert.equal(afterResult.errors[0], 'unknown option --loop-backend')
    assert.doesNotMatch(afterRegistry, /global:platform/)
  } finally {
    await rm(fixture, { force: true, recursive: true })
  }
})

function runCli(
  libraries: Parameters<typeof runCompilerCli>[0],
  args: string[]
): { errors: string[]; exitCode: number } {
  const errors: string[] = []
  let exitCode = 0
  const environment: CliEnvironment = {
    args: ['node', 'inox', ...args],
    cwd: '.',
    error(message) {
      errors.push(message)
    },
    log() {},
    mkdirSync() {},
    setExitCode(code) {
      exitCode = code
    },
    writeFileSync() {}
  }

  runCompilerCli(libraries, environment)
  return { errors, exitCode }
}
