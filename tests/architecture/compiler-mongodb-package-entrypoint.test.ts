import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'

test('mongodb package подключается только через bare-package descriptor', async () => {
  const libraries = await discoverCompilerLibraries()
  const library = libraries.find((item) => item.id === 'mongodb')

  assert.ok(library)
  assert.equal(library.kind, 'package')
  assert.equal(library.importSource, 'mongodb')
  assert.deepEqual(library.nativeSources, ['stdlib/packages/mongodb/src/mongodb.cc'])
  assert.deepEqual(library.nativeBuild?.cmakeLinkLibraries, ['mongoc::static'])
  assert.deepEqual(library.nativeBuild?.cmakeProjects?.map((project) => project.sourceDir), [
    'third_party/mongo-c-driver'
  ])

  const descriptor = library.compilerPackage
  const objectId = descriptor?.nativeTypes?.find((item) => item.typeId === 'mongodb#ObjectId')
  const cursor = descriptor?.nativeTypes?.find((item) => item.typeId === 'mongodb#Cursor')

  assert.ok(objectId)
  assert.equal(objectId.cRuntimeValueOwnership, 'owned')
  assert.deepEqual(cursor?.declarationNames, ['FindCursor', 'AggregationCursor'])
  assert.ok(descriptor?.operations.some((item) => item.bindingId === 'mongodb#module:mongodb:BSON.serialize'))
  assert.ok(descriptor?.operations.some((item) => item.bindingId === 'mongodb#module:mongodb:BSON.deserialize'))
  assert.ok(descriptor?.operations.some((item) => item.bindingId === 'mongodb#Collection.find'))
  assert.ok(descriptor?.operations.some((item) => item.bindingId === 'mongodb#Cursor.toArray'))
  assert.ok(descriptor?.operations.some((item) => item.bindingId === 'mongodb#Collection.createIndexes'))
  assert.ok(descriptor?.operations.some((item) => item.bindingId === 'mongodb#Collection.bulkWrite'))
  assert.ok(descriptor?.operations.some((item) => item.bindingId === 'mongodb#MongoClient.bulkWrite'))
})

test('mongodb facade не раскрывает заголовки C Driver', async () => {
  const header = await readFile('stdlib/packages/mongodb/include/inox/mongodb.h', 'utf8')
  const implementation = await readFile('stdlib/packages/mongodb/src/mongodb.cc', 'utf8')

  assert.doesNotMatch(header, /bson\/bson\.h|mongoc\/mongoc\.h/)
  assert.match(implementation, /#include <bson\/bson\.h>/)
})

test('mongo-c-driver имеет воспроизводимую vendor metadata', async () => {
  const metadata = await readFile('third_party/mongo-c-driver/INOX_VENDOR_METADATA', 'utf8')

  assert.match(metadata, /^version=2\.3\.3$/m)
  assert.match(metadata, /^sha256=798109524c633b5136978bbdc6229e4b0af0a4c6ba2d17b8b8fb39855c55258e$/m)
})
