import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('ordinary async-result return uses the provider C++ value type', () => {
  const result = compileSource(
    `
class Host {
  read(): Promise<string> {
    return Promise.resolve('ready')
  }
}

const host = new Host()
host.read()
`,
    { libraries: defaultCompilerLibrarySet, target: 'cc' }
  )

  assert.match(result.code, /inox::Promise Host::read\(/)
  assert.match(result.code, /inox::Promise inox_return\{\};/)
  assert.doesNotMatch(result.code, /inox_promise\* Host::read\(/)
})
