import assert from 'node:assert/strict'
import { test } from 'node:test'

import { runCompilerCli, type CliCommandResult, type CliEnvironment } from '../../compiler/cli.ts'
import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'

test('inox build uses Debug configuration only when requested', () => {
  const commands: Array<{ command: string; args: string[] }> = []
  const files: Map<string, string> = new Map()
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
      'example',
      '--debug'
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
    setExitCode() {},
    writeFileSync: (path, source) => files.set(path, source)
  }

  runCompilerCli(createCompilerLibrarySet([]), environment)

  assert.deepEqual(commands, [
    {
      command: 'cmake',
      args: ['-S', '/work/out', '-B', '/work/out/build', '-DCMAKE_BUILD_TYPE=Debug']
    },
    {
      command: 'cmake',
      args: ['--build', '/work/out/build', '--target', 'inox_example', '--parallel', '--config', 'Debug']
    }
  ])
  const project = files.get('/work/out/CMakeLists.txt') ?? ''
  assert.match(project, /set\(CMAKE_BUILD_TYPE Debug CACHE STRING "" FORCE\)/)
  assert.match(project, /set\(INOX_THIRD_PARTY_BUILD_ROOT "\/work\/out\/build\/third-party" CACHE PATH "" FORCE\)/)
  assert.match(
    project,
    /set\(INOX_STDLIB_NATIVE_PLAN "\/toolchain\/dist\/compiler-libraries\/native-plan\.cmake"\)/
  )
})
