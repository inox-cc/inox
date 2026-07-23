import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileFileToCppModuleTextsSync, compileSourceToIr } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('object field read keeps a native Set value', () => {
  const fixture = `
type Result = { requirements: Set<string> }

function makeResult(): Result {
  return { requirements: new Set<string>() }
}

function useResult(): boolean {
  const result = makeResult()
  const requirements = result.requirements
  return requirements.has('value')
}

useResult()
`
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/index.ts',
        source: fixture
      }
    ],
    { root: '/' }
  )
  const files = compileFileToCppModuleTextsSync('/pkg/index.ts', {
    callMain: false,
    host,
    libraries: defaultCompilerLibrarySet,
    sourceRoot: '/pkg'
  })
  const source = files.find((file) => file.path === 'index.cc')

  assert.ok(source)
  assert.match(source.code, /auto inox_value_\d+ = inox::get\(result, "requirements"\);/)
  assert.match(source.code, /auto requirements = Set\(inox_value_\d+\);/)
  assert.match(source.code, /requirements\.has/)
  assert.doesNotMatch(source.code, /requirements\.tag != INOX_TAG_OBJECT/)

  const checked = compileSourceToIr(fixture, { libraries: defaultCompilerLibrarySet, target: 'cc' })
  const hirFunction = checked.hir.body.find((item) => item.type === 'FunctionDeclaration' && item.name === 'makeResult')
  const irFunction = checked.ir.body.find((item) => item.type === 'FunctionDeclaration' && item.name === 'makeResult')

  assert.equal(hirFunction?.returnShape?.fields?.[0]?.shape?.libraryTypeId, 'global:collections#Set')
  assert.equal(hirFunction?.returnShape?.fields?.[0]?.shape?.libraryCppType, 'Set')
  assert.equal(hirFunction?.returnShape?.fields?.[0]?.shape?.libraryCValueAdapter, 'Set($value)')
  assert.equal(irFunction?.returnShape?.fields?.[0]?.shape?.libraryTypeId, 'global:collections#Set')
})

test('nullish coalescing keeps an optional native Set as a runtime value', () => {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/index.ts',
        source: `
type Input = { signatureRuntimeTypes?: Set<string> }

function usesRuntimeType(input: Input): boolean {
  const signatureRuntimeTypes = input.signatureRuntimeTypes ?? new Set<string>()
  return signatureRuntimeTypes.has('function')
}

usesRuntimeType({})
`
      }
    ],
    { root: '/' }
  )
  const files = compileFileToCppModuleTextsSync('/pkg/index.ts', {
    callMain: false,
    host,
    libraries: defaultCompilerLibrarySet,
    sourceRoot: '/pkg'
  })
  const source = files.find((file) => file.path === 'index.cc')

  assert.ok(source)
  assert.match(source.code, /auto signatureRuntimeTypes = Set\(inox_value_\d+\);/)
  assert.match(source.code, /signatureRuntimeTypes\.has/)
  assert.doesNotMatch(source.code, /signatureRuntimeTypes\.tag != INOX_TAG_OBJECT/)
})

test('optional chaining keeps a native Set as a nullable runtime value', () => {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/index.ts',
        source: `
type Holder = { values: Set<string> }

function containsValue(holder: Holder | null): boolean {
  const values = holder?.values
  if (!values) return false
  return values.has('value')
}

containsValue(null)
`
      }
    ],
    { root: '/' }
  )
  const files = compileFileToCppModuleTextsSync('/pkg/index.ts', {
    callMain: false,
    host,
    libraries: defaultCompilerLibrarySet,
    sourceRoot: '/pkg'
  })
  const source = files.find((file) => file.path === 'index.cc')

  assert.ok(source)
  assert.match(source.code, /Set\(values\)\.has/)
  assert.doesNotMatch(source.code, /inox_optional_value_\d+\.tag != INOX_TAG_OBJECT/)
  assert.doesNotMatch(source.code, /values\.tag != INOX_TAG_OBJECT/)
})

test('nullable native Set parameter is not checked as a generic object', () => {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/index.ts',
        source: `
function containsValue(values: Set<string> | null): boolean {
  if (values === null) return false
  return values.has('value')
}

containsValue(null)
`
      }
    ],
    { root: '/' }
  )
  const files = compileFileToCppModuleTextsSync('/pkg/index.ts', {
    callMain: false,
    host,
    libraries: defaultCompilerLibrarySet,
    sourceRoot: '/pkg'
  })
  const source = files.find((file) => file.path === 'index.cc')

  assert.ok(source)
  assert.match(source.code, /Set\(values\)\.has/)
  assert.doesNotMatch(source.code, /values\.tag != INOX_TAG_UNDEFINED[^\n]*INOX_TAG_OBJECT/)
})
