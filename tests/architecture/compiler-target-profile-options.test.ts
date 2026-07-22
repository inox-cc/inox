import assert from 'node:assert/strict'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { test } from 'node:test'

import { runCompilerCli, type CliEnvironment } from '../../compiler/cli.ts'
import { emptyCompilerLibrarySet } from '../../compiler/extensions/library-set.ts'
import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import {
  createCompilerLibrarySetFromDiscovered,
  generateCompilerLibraryRegistry
} from '../../scripts/lib/compiler-library-registry.ts'
import {
  compilerTargetCMakeConfigureArgs,
  nativeCompilerTargetProfile
} from '../../scripts/lib/compiler-target-profile.ts'

const fixture = resolve('dist/test-tmp/compiler-target-profile-options')
const output = resolve(fixture, 'dist/compiler-libraries')
const input = resolve(fixture, 'index.ts')

test('target profile подключает backend options независимо от stdlib packages', async () => {
  await rm(fixture, { force: true, recursive: true })
  await mkdir(resolve(fixture, 'stdlib/global'), { recursive: true })
  await mkdir(resolve(fixture, 'stdlib/node'), { recursive: true })
  await writeFile(input, '1 + 2\n')

  try {
    await generateCompilerLibraryRegistry(fixture, output)

    const libraries = createCompilerLibrarySetFromDiscovered(await discoverCompilerLibraries(fixture))
    const registry = await readFile(resolve(output, 'default-registry.ts'), 'utf8')
    const selected = runCli(libraries, [input, '--loop-backend', 'libuv'])
    const missing = runCli(emptyCompilerLibrarySet, [input, '--loop-backend', 'libuv'])

    assert.equal(selected.exitCode, 0)
    assert.equal(selected.errors.length, 0)
    assert.equal(
      (libraries.options ?? []).some((option) => option.optionId === 'target:runtime#loop-backend'),
      true
    )
    assert.match(registry, /target:runtime#loop-backend/)
    assert.doesNotMatch(registry, /stdlib\/global\/platform|global:platform/)
    assert.equal(missing.exitCode, 1)
    assert.equal(missing.errors[0], 'unknown option --loop-backend')
    assert.deepEqual(nativeCompilerTargetProfile.optionValues, [
      { optionId: 'target:runtime#loop-backend', value: 'libuv' },
      { optionId: 'target:runtime#tls-backend', value: 'boringssl' }
    ])
    assert.deepEqual(compilerTargetCMakeConfigureArgs(nativeCompilerTargetProfile), [
      '-DINOX_LOOP_BACKEND=libuv',
      '-DINOX_TLS_BACKEND=boringssl'
    ])
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
