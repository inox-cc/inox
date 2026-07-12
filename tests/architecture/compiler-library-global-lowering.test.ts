import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource, compileSourceToIr } from '../../compiler/core.ts'
import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import type { CompilerLibraryDescriptor } from '../../compiler/extensions/types.ts'

test('package globals lower through generic member, index, optional argument and assignment operations', () => {
  const result = compileSource(
    'const name = host.env.PATH\nconst first = host.argv[0]\nhost.exit()\nhost.exit(2)\nhost.exitCode = 3\n',
    { libraries: createCompilerLibrarySet([hostLibrary()]), target: 'cc' }
  )
  const name = result.ir.body[0].init
  const first = result.ir.body[1].init
  const exitWithoutCode = result.ir.body[2].expression
  const assignment = result.ir.body[4].expression

  assert.equal(name.libraryOperationId, 'host#env-member')
  assert.equal(name.libraryCExpression, 'operator[]')
  assert.deepEqual(name.libraryCArgumentKinds, ['receiver', 'member-name-string-view'])
  assert.equal(name.libraryCCallStyle, 'index')
  assert.equal(name.libraryCppType, 'inox::String')
  assert.equal(first.libraryOperationId, 'host#argv-index')
  assert.equal(first.valueType, 'string')
  assert.equal(exitWithoutCode.libraryOperationId, 'host#exit')
  assert.equal(assignment.libraryOperationId, 'host#exit-code-write')
  assert.match(result.code, /inox::host\.env\["PATH"\]/)
  assert.match(result.code, /inox::host\.argv\[0(?:\.0)?\]/)
  assert.match(result.code, /inox::host\.exit\(\)/)
  assert.match(result.code, /inox::host\.exit\(2(?:\.0)?\)/)
  assert.match(result.code, /\(inox::host\.exitCode = 3(?:\.0)?\)/)
})

test('package global result metadata preserves nested shapes and array element types', () => {
  const result = compileSourceToIr(
    'const release = host.versions.node\nconst args = host.argv\n',
    { libraries: createCompilerLibrarySet([hostLibrary()]) }
  )
  const release = result.ir.body[0].init
  const args = result.ir.body[1].init

  assert.equal(release.valueType, 'string')
  assert.equal(args.valueType, 'array')
  assert.equal(args.arrayElementType, 'string')
})

test('local bindings shadow package-provided globals', () => {
  const result = compileSourceToIr(
    "const host = { env: { PATH: 'local' } }\nconst name = host.env.PATH\n",
    { libraries: createCompilerLibrarySet([hostLibrary()]) }
  )

  assert.equal(result.ir.body[1].init.libraryOperationId, undefined)
})

function hostLibrary(): CompilerLibraryDescriptor {
  return {
    id: 'host',
    dependencies: [],
    declarations: [],
    operations: [
      {
        libraryId: 'host',
        bindingId: 'global:host',
        operationId: 'host#global',
        kind: 'member-read',
        runtimeRequirements: [],
        cExpression: 'inox::host',
        resultTypeId: 'host:root',
        resultShapeFields: [
          {
            name: 'versions',
            valueType: 'object',
            readonly: true,
            resultTypeId: 'host:versions',
            cppType: 'inox::HostVersions',
            resultShapeFields: [
              { name: 'node', valueType: 'string', readonly: true }
            ]
          }
        ],
        cppType: 'inox::Host&',
        valueType: 'object'
      },
      {
        libraryId: 'host',
        bindingId: 'global:host.env',
        operationId: 'host#env',
        kind: 'member-read',
        runtimeRequirements: [],
        cExpression: 'inox::host.env',
        resultTypeId: 'host:env',
        cppType: 'inox::HostEnv&',
        valueType: 'object'
      },
      {
        libraryId: 'host',
        bindingId: 'host:env.*',
        operationId: 'host#env-member',
        kind: 'member-read',
        runtimeRequirements: [],
        cExpression: 'operator[]',
        cArgumentKinds: ['receiver', 'member-name-string-view'],
        receiverTypeId: 'host:env',
        cCallStyle: 'index',
        cppType: 'inox::String',
        valueType: 'string',
        nullable: true,
        owned: true
      },
      {
        libraryId: 'host',
        bindingId: 'global:host.argv',
        operationId: 'host#argv',
        kind: 'member-read',
        runtimeRequirements: [],
        cExpression: 'inox::host.argv',
        resultTypeId: 'host:argv',
        resultArrayElementType: 'string',
        cppType: 'inox::HostArgv&',
        valueType: 'array'
      },
      {
        libraryId: 'host',
        bindingId: 'host:argv.*',
        operationId: 'host#argv-index',
        kind: 'index-read',
        runtimeRequirements: [],
        cExpression: 'operator[]',
        cArgumentKinds: ['receiver', 'number'],
        receiverTypeId: 'host:argv',
        cCallStyle: 'index',
        argumentChecks: [{ valueTypes: ['number'] }],
        cppType: 'inox::String',
        valueType: 'string',
        owned: true
      },
      {
        libraryId: 'host',
        bindingId: 'global:host.exit',
        operationId: 'host#exit',
        kind: 'call',
        runtimeRequirements: [],
        cExpression: 'inox::host.exit',
        cArgumentKinds: ['optional-number'],
        minArgs: 0,
        maxArgs: 1,
        argumentChecks: [{ valueTypes: ['number'] }],
        cppType: 'void',
        valueType: 'unknown'
      },
      {
        libraryId: 'host',
        bindingId: 'global:host.exitCode',
        operationId: 'host#exit-code-write',
        kind: 'member-write',
        runtimeRequirements: [],
        cExpression: 'exitCode',
        cArgumentKinds: ['receiver', 'number'],
        cCallStyle: 'member-assignment',
        argumentChecks: [{ valueTypes: ['number'] }],
        cppType: 'double',
        valueType: 'number'
      }
    ],
    intrinsicBindings: [],
    runtimeRequirements: []
  }
}
