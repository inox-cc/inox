import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import {
  emitModuleFunctionEffectsContract,
  parseModuleFunctionEffectsContract
} from '../../compiler/modules/function-effects.ts'
import { fixtureExceptionLibrary } from './helpers/compiler-exception-library-fixtures.ts'
import { compilerLibraryPackageWithGlobalDeclaration } from './helpers/compiler-library-fixtures.ts'
import { compilerLibraryPackage as promiseCompilerLibraryPackage } from '../../stdlib/global/promise/compiler/index.ts'

test('метаданные exception provider проходят через async function, await и try/catch', () => {
  const libraries = createCompilerLibrarySet([
    fixtureExceptionLibrary(),
    compilerLibraryPackageWithGlobalDeclaration(promiseCompilerLibraryPackage, 'stdlib/global/promise/index.d.ts')
  ])
  const result = compileSource(
    `
async function fail(): Promise<string> {
  throw new Fault('boom')
}

async function readDetail(): Promise<string> {
  try {
    return await fail()
  } catch (fault) {
    return fault.detail
  }
}

readDetail()
`,
    { libraries, target: 'cc' }
  )
  const failEffect = result.ir.functionEffects.find((effect) => effect.name === 'fail')
  const readEffect = result.ir.functionEffects.find((effect) => effect.name === 'readDetail')

  assert.ok(failEffect)
  assert.deepEqual(failEffect?.throwValueTypes, ['exception-object'])
  assert.equal(readEffect?.throws, false)
  assert.match(result.code, /inox::object_value_at\(fault, 0, "detail"\)/)
  assert.doesNotMatch(result.code, /\bError\b/)

  const contract = emitModuleFunctionEffectsContract([failEffect])

  assert.match(contract, /"version": 2/)
  assert.deepEqual(parseModuleFunctionEffectsContract(contract), [failEffect])
})
