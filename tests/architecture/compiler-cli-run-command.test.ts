import assert from 'node:assert/strict'
import { test } from 'node:test'

import { runCompilerCli, type CliCommandResult, type CliEnvironment } from '../../compiler/cli.ts'
import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'

test('inox run builds and executes the inferred application binary', () => {
  const commands: Array<{ command: string; args: string[] }> = []
  const success: CliCommandResult = { code: 0, stderr: '', stdout: '' }
  const environment: CliEnvironment = {
    args: ['node', 'inox', 'run', 'project/src/index.ts', '--out-dir', 'out', '--', '--flag', 'value'],
    build: {
      cmakeCommand: 'cmake',
      cmakeOptionMappings: [],
      compilerCommand: ['/toolchain/bin/inox'],
      compilerDependencies: ['/toolchain/bin/inox'],
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
    writeFileSync() {}
  }

  runCompilerCli(createCompilerLibrarySet([]), environment)

  assert.equal(commands.length, 3)
  assert.deepEqual(commands[2], {
    command: '/work/out/bin/project',
    args: ['--flag', 'value']
  })
})
