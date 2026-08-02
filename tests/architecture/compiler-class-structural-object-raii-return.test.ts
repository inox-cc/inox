import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('экземпляр класса преобразуется на границе структурного RAII object', () => {
  const result = compileSource(
    `
type Host = { value: string }

class MemoryHost {
  value: string

  constructor() {
    this.value = 'inox'
  }
}

function create(): Host {
  return new MemoryHost()
}

create()
`,
    { libraries: defaultCompilerLibrarySet, target: 'cc' }
  )

  assert.match(result.code, /inox::ObjectValue create\(\)/)
  assert.match(result.code, /inox_class_instance_ref_copy/)
  assert.match(result.code, /return inox::ObjectValue\(inox::Value\(inox_class_instance_\d+\)\);/)
  assert.doesNotMatch(result.code, /inox::Value\(inox_class_MemoryHost_\d+\)/)
})
