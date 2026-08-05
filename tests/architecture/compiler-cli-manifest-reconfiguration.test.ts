import assert from 'node:assert/strict'
import { test } from 'node:test'

import { executeCliBuild, type CliBuildPlan } from '../../compiler/cli/build.ts'
import type { CliCommandResult, CliEnvironment } from '../../compiler/cli.ts'
import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'

test('CLI повторно конфигурирует CMake при смене зависимостей в manifest', () => {
  const commands: string[][] = []
  const files: Map<string, string> = new Map([
    ['/work/out/build/CMakeCache.txt', 'configured'],
    ['/work/out/build-manifest.json', 'minimal dependencies']
  ])
  const success: CliCommandResult = { code: 0, stderr: '', stdout: '' }
  const plan: CliBuildPlan = {
    command: 'build',
    input: 'example.ts',
    libraryOptions: [],
    name: 'example',
    outDir: 'out',
    programArgs: [],
    release: false
  }
  const environment: CliEnvironment = {
    args: [],
    build: {
      cmakeCommand: 'cmake',
      cmakeOptionMappings: [],
      defaultLibraryOptions: [],
      executableSuffix: '',
      toolchainRoot: '/toolchain'
    },
    cwd: '/work',
    error() {},
    log() {},
    mkdirSync() {},
    readFileSync: (path) => files.get(path) ?? null,
    resolvePath: (path) => `/work/${path}`,
    runCommand: (_command, args) => {
      commands.push(args)
      return success
    },
    setExitCode() {},
    writeFileSync: (path, source) => files.set(path, source)
  }

  assert.equal(executeCliBuild(plan, createCompilerLibrarySet([]), environment), true)
  files.set('/work/out/build-manifest.json', 'network dependencies')
  assert.equal(executeCliBuild(plan, createCompilerLibrarySet([]), environment), true)

  assert.deepEqual(commands, [
    ['-S', '/work/out', '-B', '/work/out/build'],
    ['--build', '/work/out/build', '--target', 'inox_example', '--parallel'],
    ['-S', '/work/out', '-B', '/work/out/build'],
    ['--build', '/work/out/build', '--target', 'inox_example', '--parallel']
  ])
})
