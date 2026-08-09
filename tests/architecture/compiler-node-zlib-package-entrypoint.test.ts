import assert from 'node:assert/strict'
import { test } from 'node:test'

import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import { renderCompilerLibraryRegistry } from '../../scripts/lib/compiler-library-registry.ts'

test('node:zlib владеет sync API, native source и внешней зависимостью', async () => {
  const discovered = await discoverCompilerLibraries()
  const library = discovered.find((item) => item.id === 'node:zlib')

  assert.ok(library?.compilerPackage)
  assert.equal(library.compilerEntrypoint, 'stdlib/node/zlib/compiler/index.ts')
  assert.deepEqual(library.nativeSources, ['stdlib/node/zlib/src/zlib.cc'])
  assert.deepEqual(library.nativeIncludeDirs, ['stdlib/node/zlib/include'])
  assert.deepEqual(library.nativeBuild, {
    cmakePackages: ['ZLIB'],
    cmakeLinkLibraries: ['ZLIB::ZLIB'],
    linkerArguments: ['-lz']
  })
  assert.deepEqual(
    library.compilerPackage.operations.map((operation) => operation.operationId),
    [
      'node:zlib#deflateSync',
      'node:zlib#inflateSync',
      'node:zlib#deflateRawSync',
      'node:zlib#inflateRawSync',
      'node:zlib#gzipSync',
      'node:zlib#gunzipSync'
    ]
  )

  const unit = renderCompilerLibraryRegistry(discovered).nativePlan.units.find((item) => item.libraryId === 'node:zlib')

  assert.deepEqual(unit?.cmakePackages, ['ZLIB'])
  assert.deepEqual(unit?.cmakeLinkLibraries, ['ZLIB::ZLIB'])
  assert.deepEqual(unit?.linkerArguments, ['-lz'])
})
