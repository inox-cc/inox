import assert from 'node:assert/strict'
import { test } from 'node:test'

import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'

const primitiveStringTypeRef = {
  kind: 'primitive',
  name: 'string',
  nullable: false,
  ownership: 'value',
  traits: []
} as const

test('node:child_process sync operations describe results only through TypeRef', async () => {
  const discovered = await discoverCompilerLibraries()
  const childProcess = discovered.find((library) => library.id === 'node:child_process')
  const operations = (childProcess?.compilerPackage?.operations ?? []).filter((operation) => !operation.diagnosticCode)

  assert.deepEqual(
    operations.map((operation) => operation.operationId),
    ['node:child_process#execSync', 'node:child_process#execFileSync', 'node:child_process#spawnSync']
  )

  for (const operation of operations.slice(0, 2)) {
    assert.deepEqual(operation.resultTypeRef, primitiveStringTypeRef)
    assert.deepEqual(operation.cResultMapping, {
      cppType: 'inox::String',
      fields: []
    })
  }

  assert.deepEqual(operations[2].resultTypeRef, {
    kind: 'object',
    fields: ['status', 'stdout', 'stderr'].map((name) => ({
      name,
      typeRef:
        name === 'status'
          ? {
              kind: 'primitive',
              name: 'number',
              nullable: false,
              ownership: 'value',
              traits: []
            }
          : primitiveStringTypeRef,
      readonly: true
    })),
    nullable: false,
    ownership: 'value',
    traits: []
  })
  assert.deepEqual(operations[2].cResultMapping, {
    cppType: 'inox::Value',
    fields: []
  })

})
