import assert from 'node:assert/strict'
import { test } from 'node:test'

import type {
  CompilerLibraryPackageDescriptor,
  LibraryOperationDescriptor
} from '../../compiler/extensions/types.ts'
import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'

test('node:fs и node:fs/promises имеют отдельные compiler entrypoints и ownership', async () => {
  const discovered = await discoverCompilerLibraries()
  const discoveredFs = discovered.find((library) => library.id === 'node:fs')
  const discoveredPromises = discovered.find((library) => library.id === 'node:fs/promises')

  assert.ok(discoveredFs)
  assert.ok(discoveredPromises)
  assert.equal(discoveredFs.compilerEntrypoint, 'stdlib/node/fs/compiler/index.ts')
  assert.equal(discoveredPromises.compilerEntrypoint, 'stdlib/node/fs/promises/compiler/index.ts')
  assert.ok(discoveredFs.compilerPackage)
  assert.ok(discoveredPromises.compilerPackage)

  const fs = discoveredFs.compilerPackage
  const promises = discoveredPromises.compilerPackage

  assert.equal(fs.id, 'node:fs')
  assert.deepEqual(fs.dependencies, ['global:collections', 'node:buffer'])
  assert.equal(promises.id, 'node:fs/promises')
  assert.deepEqual(promises.dependencies, ['node:fs'])
  assert.deepEqual(discoveredFs.nativeSources, ['stdlib/node/fs/src/fs.cc'])
  assert.deepEqual(discoveredFs.nativeIncludeDirs, ['stdlib/node/fs/include'])
  assert.deepEqual(discoveredPromises.nativeSources, [])
  assert.deepEqual(discoveredPromises.nativeIncludeDirs, [])

  assertNativeType(fs, 'node:fs#Stats', 'FsStats')
  assertNativeType(fs, 'node:fs#Dirent', 'FsDirent')
  assert.equal(promises.nativeTypes?.length ?? 0, 0)

  const readFileSync = operation(fs, 'node:fs#readFileSync')
  assert.equal(readFileSync.libraryId, 'node:fs')
  assert.equal(readFileSync.bindingId, 'node:fs#module:node:fs:readFileSync')
  assert.ok(readFileSync.bindingAliases?.includes('node:fs#module:node:fs:default.readFileSync'))
  assert.deepEqual(readFileSync.runtimeRequirements, ['node:fs'])
  assert.deepEqual(
    readFileSync.variants?.map((variant) => variant.cExpression),
    ['fs.readFileSync', 'fs.readFileSync']
  )

  const constant = operation(fs, 'node:fs#constants.F_OK')
  assert.equal(constant.kind, 'member-read')
  assert.equal(constant.cExpression, 'fs.constants.F_OK')
  assert.equal(constant.valueType, 'number')

  const statsIsFile = operation(fs, 'node:fs#Stats.isFile')
  assert.equal(statsIsFile.receiverTypeId, 'node:fs#Stats')
  assert.equal(statsIsFile.cExpression, 'isFile')
  assert.equal(statsIsFile.cCallStyle, 'member')
  assert.equal(statsIsFile.valueType, 'boolean')

  const readFile = operation(promises, 'node:fs/promises#readFile')
  assert.equal(readFile.libraryId, 'node:fs/promises')
  assert.equal(readFile.bindingId, 'node:fs/promises#module:node:fs/promises:readFile')
  assert.ok(readFile.bindingAliases?.includes('node:fs/promises#module:node:fs/promises:default.readFile'))
  assert.ok(readFile.bindingAliases?.includes('node:fs#module:node:fs:promises.readFile'))
  assert.ok(readFile.bindingAliases?.includes('node:fs#module:node:fs:default.promises.readFile'))
  assert.deepEqual(readFile.runtimeRequirements, ['node:fs'])
  assert.deepEqual(
    readFile.variants?.map((variant) => variant.cExpression),
    ['fs.promises.readFile', 'fs.promises.readFile']
  )

  assert.equal(fs.operations.every((item) => item.libraryId === 'node:fs'), true)
  assert.equal(promises.operations.every((item) => item.libraryId === 'node:fs/promises'), true)
  assert.deepEqual(promises.runtimeRequirements, [])

  const runtime = fs.runtimeRequirements.find((item) => item.id === 'node:fs')
  assert.ok(runtime)
  assert.deepEqual(runtime.cPreludeIncludes, ['inox/fs.h'])
  assert.deepEqual(
    runtime.dependencies,
    ['async-runtime', 'collections', 'managed-values', 'node:buffer', 'string-bytes']
  )
})

function operation(
  descriptor: CompilerLibraryPackageDescriptor,
  operationId: string
): LibraryOperationDescriptor {
  const result = descriptor.operations.find((item) => item.operationId === operationId)

  assert.ok(result, `missing operation ${operationId}`)
  return result
}

function assertNativeType(
  descriptor: CompilerLibraryPackageDescriptor,
  typeId: string,
  cppType: string
): void {
  const nativeType = descriptor.nativeTypes?.find((item) => item.typeId === typeId)

  assert.ok(nativeType, `missing native type ${typeId}`)
  assert.equal(nativeType.libraryId, 'node:fs')
  assert.equal(nativeType.valueType, 'object')
  assert.equal(nativeType.cppType, cppType)
  assert.deepEqual(nativeType.runtimeRequirements, ['node:fs'])
}
