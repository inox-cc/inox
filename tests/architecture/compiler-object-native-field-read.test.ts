import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileFileToCModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('object field read keeps a native Set value', () => {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/index.ts',
        source: `
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
      }
    ],
    { root: '/' }
  )
  const files = compileFileToCModuleTextsSync('/pkg/index.ts', {
    callMain: false,
    host,
    libraries: defaultCompilerLibrarySet,
    sourceRoot: '/pkg'
  })
  const source = files.find((file) => file.path === 'index.cc')

  assert.ok(source)
  assert.match(source.code, /requirements = inox::get\(result, "requirements"\);/)
  assert.match(source.code, /Set\(requirements\)\.has/)
  assert.doesNotMatch(source.code, /requirements\.tag != INOX_TAG_OBJECT/)
})
