import assert from 'node:assert/strict'
import { test } from 'node:test'

import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'

test('node:dns и node:dns/promises владеют lookup API и native plan', async () => {
  const discovered = await discoverCompilerLibraries()
  const dns = discovered.find((library) => library.id === 'node:dns')
  const promises = discovered.find((library) => library.id === 'node:dns/promises')

  assert.ok(dns?.compilerPackage)
  assert.ok(promises?.compilerPackage)
  assert.equal(dns.compilerEntrypoint, 'stdlib/node/dns/compiler/index.ts')
  assert.equal(promises.compilerEntrypoint, 'stdlib/node/dns/promises/compiler/index.ts')
  assert.deepEqual(dns.compilerPackage.dependencies, ['global:error', 'global:strings'])
  assert.deepEqual(promises.compilerPackage.dependencies, ['global:error', 'global:promise', 'node:dns'])
  assert.deepEqual(dns.nativeSources, ['stdlib/node/dns/src/dns.cc'])
  assert.deepEqual(dns.nativeIncludeDirs, ['stdlib/node/dns/include'])
  assert.deepEqual(promises.nativeSources, [])

  const lookup = dns.compilerPackage.operations[0]
  const promiseLookup = promises.compilerPackage.operations[0]

  assert.equal(lookup.operationId, 'node:dns#lookup')
  assert.equal(lookup.cExpression, 'dns.lookup')
  assert.equal(lookup.callbackLifetime, 'event-loop')
  assert.equal(promiseLookup.operationId, 'node:dns/promises#lookup')
  assert.equal(promiseLookup.cExpression, 'dns.promises.lookup')
  assert.ok(promiseLookup.bindingAliases?.includes('node:dns#module:node:dns:default.promises.lookup'))
  assert.deepEqual(promiseLookup.runtimeRequirements, ['node:dns', 'global:promise#promise'])

  const runtime = dns.compilerPackage.runtimeRequirements[0]

  assert.equal(runtime.id, 'node:dns')
  assert.deepEqual(runtime.cPreludeIncludes, ['inox/dns.h'])
  assert.deepEqual(runtime.capabilities, ['dns'])
  assert.ok(runtime.dependencies.includes('global:strings#strings'))
  assert.deepEqual(runtime.optionConstraints?.[0]?.allowedValues, ['libuv'])
})
