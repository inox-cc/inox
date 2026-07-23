import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import { createCompilerLibrarySetFromDiscovered } from '../../scripts/lib/compiler-library-registry.ts'

test('global:strings владеет primitive string declarations, operations и runtime plan', async () => {
  const discovered = await discoverCompilerLibraries()
  const strings = discovered.find((library) => library.id === 'global:strings')

  assert.ok(strings)
  assert.equal(strings.compilerEntrypoint, 'stdlib/global/strings/compiler/index.ts')
  assert.deepEqual(strings.nativeSources, ['stdlib/global/strings/src/strings.cc'])
  assert.deepEqual(strings.nativeIncludeDirs, [])
  assert.match(strings.declarationSource ?? '', /interface String/)

  const result = compileSource(
    `
      const source = ' alpha,beta '
      const size = source.length
      const trimmed = source.trim()
      const upper = source.toUpperCase()
      const padded = source.padStart(20, '_')
      const sliced = source.slice(1, 3)
      const parts = source.split(',')
      const included = source.includes('alpha')
      const started = source.startsWith(' ')
      const ended = source.endsWith(' ')
      const index = source.indexOf('beta')
      const lastIndex = source.lastIndexOf('a')
      const code = source.charCodeAt(0)
      const combined = source.concat('!')
      const first = source[0]
      const numberText = (12).toString()
      const hexText = (255).toString(16)
    `,
    { libraries: createCompilerLibrarySetFromDiscovered(discovered), target: 'cc' }
  )

  assert.equal(result.ast.body[1].init.libraryOperationId, 'global:strings#String.length')
  assert.equal(result.ast.body[2].init.libraryOperationId, 'global:strings#String.trim')
  assert.equal(result.ast.body[3].init.libraryOperationId, 'global:strings#String.toUpperCase')
  assert.equal(result.ast.body[4].init.libraryOperationId, 'global:strings#String.padStart')
  assert.equal(result.ast.body[5].init.libraryOperationId, 'global:strings#String.slice')
  assert.equal(result.ast.body[6].init.libraryOperationId, 'global:strings#String.split')
  assert.equal(result.ast.body[6].init.typeRef.typeId, 'global:collections#Array')
  assert.equal(result.ast.body[6].init.typeRef.args[0].name, 'string')
  assert.equal(result.ast.body[7].init.libraryOperationId, 'global:strings#String.includes')
  assert.equal(result.ast.body[8].init.libraryOperationId, 'global:strings#String.startsWith')
  assert.equal(result.ast.body[9].init.libraryOperationId, 'global:strings#String.endsWith')
  assert.equal(result.ast.body[10].init.libraryOperationId, 'global:strings#String.indexOf')
  assert.equal(result.ast.body[11].init.libraryOperationId, 'global:strings#String.lastIndexOf')
  assert.equal(result.ast.body[12].init.libraryOperationId, 'global:strings#String.charCodeAt')
  assert.equal(result.ast.body[13].init.libraryOperationId, 'global:strings#String.concat')
  assert.equal(result.ast.body[14].init.libraryOperationId, 'global:strings#String#index-read')
  assert.equal(result.ast.body[15].init.libraryOperationId, 'global:strings#Number.toString')
  assert.equal(result.ast.body[16].init.libraryOperationId, 'global:strings#Number.toString')
  assert.ok(result.ir.runtimeRequirements.includes('global:strings#strings'))
  assert.match(result.code, /#include "inox\/string\.h"/)
  assert.match(result.code, /\.trim\(\)/)
  assert.match(result.code, /\.split\(/)
  assert.match(result.code, /\.charCodeAt\(/)
  assert.match(result.code, /inox::String::fromNumber\(12\)/)
  assert.match(result.code, /inox::String::fromNumberRadix\(255, 16\)/)
})
