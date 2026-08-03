import assert from 'node:assert/strict'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { test } from 'node:test'

import { runCompilerCli, type CliCommandResult, type CliEnvironment } from '../../compiler/cli.ts'
import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import type { CompilerLibraryDescriptor } from '../../compiler/extensions/types.ts'
import { fixturePrimitiveTypeRef } from './helpers/compiler-library-fixtures.ts'

const fixture = resolve('dist/test-tmp/compiler-cli-automatic-library-options')
const input = resolve(fixture, 'index.ts')

test('CLI автоматически выбирает package options по использованной операции с явным override', async () => {
  await rm(fixture, { recursive: true, force: true })
  await mkdir(fixture, { recursive: true })

  try {
    await writeFile(input, "request('http://example.com')\n")
    const http = runBuild([])
    assert.match(http.cmake, /set\(TEST_LOOP "libuv"/)
    assert.match(http.cmake, /set\(TEST_TLS "none"/)
    assert.equal(http.commands[0], 'prepare-bridge')

    await writeFile(input, "request('https://example.com')\n")
    const https = runBuild([])
    assert.match(https.cmake, /set\(TEST_LOOP "libuv"/)
    assert.match(https.cmake, /set\(TEST_TLS "boringssl"/)

    const disabled = runBuild(['--bridge-tls', 'none'])
    assert.equal(disabled.exitCode, 1)
    assert.match(disabled.errors.join('\n'), /request requires TLS/)
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
})

function runBuild(args: string[]): { cmake: string; commands: string[]; errors: string[]; exitCode: number } {
  const files: Map<string, string> = new Map()
  const commands: string[] = []
  const errors: string[] = []
  const success: CliCommandResult = { code: 0, stderr: '', stdout: '' }
  let exitCode = 0
  let prepared = false
  const environment: CliEnvironment = {
    args: ['node', 'inox', 'build', input, '--out-dir', fixture, ...args],
    build: {
      cmakeCommand: 'cmake',
      cmakeOptionMappings: [
        { optionId: 'bridge#loop', cacheName: 'TEST_LOOP' },
        { optionId: 'bridge#tls', cacheName: 'TEST_TLS' }
      ],
      compilerCommand: ['inox'],
      compilerDependencies: [],
      defaultLibraryOptions: [],
      executableSuffix: '',
      preparations: [
        {
          optionId: 'bridge#loop',
          values: ['libuv'],
          requiredPath: 'bridge.ready',
          command: 'prepare-bridge',
          args: []
        }
      ],
      toolchainRoot: fixture
    },
    cwd: process.cwd(),
    error: (message) => errors.push(message),
    fileExists: () => prepared,
    log() {},
    mkdirSync() {},
    resolvePath: (path) => resolve(path),
    runCommand: (command) => {
      commands.push(command)
      prepared = true
      return success
    },
    setExitCode: (code) => {
      exitCode = code
    },
    writeFileSync: (path, source) => files.set(path, source)
  }

  runCompilerCli(createCompilerLibrarySet([bridgeLibrary()]), environment)

  return { cmake: files.get(resolve(fixture, 'CMakeLists.txt')) ?? '', commands, errors, exitCode }
}

function bridgeLibrary(): CompilerLibraryDescriptor {
  return {
    id: 'bridge',
    dependencies: [],
    declarations: [
      {
        libraryId: 'bridge',
        kind: 'global',
        source: 'bridge/index.d.ts',
        declarationSource: 'export {}\ndeclare global { function request(url: string): void; }',
        compilerImplemented: true
      }
    ],
    options: [
      option('bridge#loop', '--bridge-loop', 'embedded', 'libuv', ['embedded', 'libuv']),
      option('bridge#tls', '--bridge-tls', 'none', 'boringssl', ['none', 'boringssl'])
    ],
    operations: [
      {
        libraryId: 'bridge',
        bindingId: 'global:request',
        operationId: 'bridge#request',
        kind: 'call',
        runtimeRequirements: ['bridge'],
        cExpression: 'request',
        cArgumentKinds: ['string-view'],
        minArgs: 1,
        maxArgs: 1,
        argumentChecks: [
          {
            valueTypes: ['string'],
            stringPrefixOptionConstraints: [
              {
                prefixes: ['https://'],
                optionId: 'bridge#tls',
                allowedValues: ['boringssl'],
                diagnosticCode: 'BRIDGE_TLS',
                diagnosticMessage: 'request requires TLS'
              }
            ]
          }
        ],
        resultTypeRef: fixturePrimitiveTypeRef('void')
      }
    ],
    intrinsicBindings: [],
    runtimeRequirements: [
      {
        id: 'bridge',
        dependencies: [],
        cPreludeIncludes: [],
        capabilities: [],
        optionConstraints: [
          {
            optionId: 'bridge#loop',
            allowedValues: ['libuv'],
            diagnosticCode: 'BRIDGE_LOOP',
            diagnosticMessage: 'request requires an event loop'
          }
        ]
      }
    ]
  }
}

function option(
  optionId: string,
  alias: string,
  defaultValue: string,
  automaticStringValue: string,
  allowedValues: string[]
) {
  return {
    libraryId: 'bridge',
    optionId,
    cliAliases: [alias],
    valueType: 'string' as const,
    defaultValue,
    automaticStringValue,
    allowedValues
  }
}
