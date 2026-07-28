import assert from 'node:assert/strict'

import { compileSource } from '../../compiler/core.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

export function assertLibraryPendingExceptionsPropagateThroughMethods(): void {
  const result = compileSource(
    `
class Loader {
  fail(): void {
    JSON.parse('{')
  }

  forward(): void {
    this.fail()
    console.log('unexpected')
  }
}

const loader = new Loader()

try {
  loader.forward()
} catch {
  console.log('caught')
}
`,
    {
      libraries: defaultCompilerLibrarySet,
      target: 'cc'
    }
  )

  assert.match(result.code, /this->fail\(\);\n\s+if \(inox::thrown\(\)\) return;/)
  assert.match(result.code, /loader\.forward\(\);\n\s+if \(inox::thrown\(\)\) goto catch_0;/)
  assert.doesNotMatch(result.code, /inox_status inox_class_Loader_(?:fail|forward)/)
}
