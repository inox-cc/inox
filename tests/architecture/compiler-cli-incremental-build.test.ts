import assert from 'node:assert/strict'
import { test } from 'node:test'

import { runCompilerCli, type CliCommandResult, type CliEnvironment } from '../../compiler/cli.ts'
import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'

test('повторная CLI-сборка не перезаписывает неизменные generated-файлы', () => {
  const commands: string[][] = []
  const files: Map<string, string> = new Map()
  const writes: string[] = []
  const success: CliCommandResult = { code: 0, stderr: '', stdout: '' }
  const environment: CliEnvironment = {
    args: ['node', 'inox', 'build', 'tests/architecture/fixtures/empty.ts', '--out-dir', 'out'],
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
    writeFileSync: (path, source) => {
      files.set(path, source)
      writes.push(path)
    }
  }

  runCompilerCli(createCompilerLibrarySet([]), environment)
  files.set('/work/out/build/CMakeCache.txt', 'configured')
  runCompilerCli(createCompilerLibrarySet([]), environment)

  assert.equal(commands.length, 3)
  assert.deepEqual(commands[2], ['--build', '/work/out/build', '--target', 'inox_empty', '--parallel'])
  assert.equal(writes.length, 6)
  assert.match(writes[0], /\.cc$/)
  assert.match(writes[1], /\.h$/)
  assert.match(writes[2], /\.d\.ts$/)
  assert.deepEqual(writes.slice(3), [
    '/work/out/build-manifest.json',
    '/work/out/CMakeLists.txt',
    '/work/out/build/inox-cli-configure-state'
  ])
})
