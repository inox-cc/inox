import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileMemoryPackageToIrModules } from '../../compiler/core.ts'
import { CompileError } from '../../compiler/diagnostics.ts'
import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import type { CompilerLibraryDescriptor } from '../../compiler/extensions/types.ts'
import { fixturePrimitiveTypeRef } from './helpers/compiler-library-fixtures.ts'

const entry = '/project/main.ts'
const libraryId = 'fixture:renamed-module'
const moduleSource = 'extension:renamed-tools'
const source = `
  import { execute as renamedExecute, tools as renamedTools } from '${moduleSource}'
  const direct = renamedExecute(1)
  const nested = renamedTools.inspect()
`

test('module declaration владеет переименованными import operations', async () => {
  const withDeclaration = createCompilerLibrarySet([fixtureLibrary(true)])
  const compiled = await compileMemoryPackageToIrModules(
    entry,
    [{ path: entry, source }],
    { libraries: withDeclaration }
  )
  const body = compiled.irModules[0].ir.body

  assert.equal(body[1].init.libraryOperationId, `${libraryId}#execute`)
  assert.equal(body[2].init.libraryOperationId, `${libraryId}#tools.inspect`)

  const withoutDeclaration = createCompilerLibrarySet([fixtureLibrary(false)])

  await assert.rejects(
    compileMemoryPackageToIrModules(entry, [{ path: entry, source }], { libraries: withoutDeclaration }),
    (error: unknown) =>
      error instanceof CompileError && error.diagnostics[0].code === 'INOX_UNSUPPORTED_IMPORT_SOURCE'
  )
})

function fixtureLibrary(withDeclaration: boolean): CompilerLibraryDescriptor {
  return {
    id: libraryId,
    dependencies: [],
    declarations: withDeclaration
      ? [
          {
            libraryId,
            kind: 'module',
            source: moduleSource,
            declarationSource:
              'export interface Toolset { inspect(): string; }\n' +
              'export function execute(value: number): string;\n' +
              'export const tools: Toolset;\n',
            compilerImplemented: true
          }
        ]
      : [],
    nativeTypes: [],
    operations: [
      {
        libraryId,
        bindingId: `${libraryId}#module:${moduleSource}:execute`,
        operationId: `${libraryId}#execute`,
        kind: 'call',
        runtimeRequirements: [],
        cExpression: 'renamed_execute',
        resultTypeRef: fixturePrimitiveTypeRef('string')
      },
      {
        libraryId,
        bindingId: `${libraryId}#module:${moduleSource}:tools.inspect`,
        operationId: `${libraryId}#tools.inspect`,
        kind: 'call',
        runtimeRequirements: [],
        cExpression: 'renamed_inspect',
        resultTypeRef: fixturePrimitiveTypeRef('string')
      }
    ],
    intrinsicBindings: [],
    runtimeRequirements: []
  }
}
