import assert from 'node:assert/strict'
import { test } from 'node:test'

import { runCompilerCli, type CliCommandResult, type CliEnvironment } from '../../compiler/cli.ts'
import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'

test('inox build creates and builds an internal CMake project', () => {
  const commands: Array<{ command: string; args: string[] }> = []
  const files: Map<string, string> = new Map()
  let exitCode = 0
  const success: CliCommandResult = { code: 0, stderr: '', stdout: '' }
  const environment: CliEnvironment = {
    args: [
      'node',
      'inox',
      'build',
      'tests/architecture/fixtures/empty.ts',
      '--out-dir',
      'out',
      '--name',
      'demo'
    ],
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
    resolvePath: (path) => `/work/${path}`,
    runCommand: (command, args) => {
      commands.push({ command, args })
      return success
    },
    setExitCode: (code) => {
      exitCode = code
    },
    writeFileSync: (path, source) => files.set(path, source)
  }

  runCompilerCli(createCompilerLibrarySet([]), environment)

  assert.equal(exitCode, 0)
  assert.equal(commands.length, 2)
  assert.deepEqual(commands[0], {
    command: 'cmake',
    args: ['-S', '/work/out', '-B', '/work/out/build', '-DCMAKE_BUILD_TYPE=Release']
  })
  assert.deepEqual(commands[1], {
    command: 'cmake',
    args: ['--build', '/work/out/build', '--target', 'inox_demo', '--parallel', '--config', 'Release']
  })
  const cmake = files.get('/work/out/CMakeLists.txt') ?? ''
  assert.match(cmake, /inox_add_executable\(inox_demo/)
  assert.match(cmake, /PREGENERATED/)
  assert.match(cmake, /ENTRY "\/work\/tests\/architecture\/fixtures\/empty\.ts"/)
  assert.doesNotMatch(cmake, /INOX_COMPILER_COMMAND/)
  assert.match(cmake, /OUTPUT_NAME "demo"/)
  assert.doesNotMatch(cmake, /stdlib\/(?:global|node)\//)
})
