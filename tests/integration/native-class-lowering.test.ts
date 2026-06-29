import assert from 'node:assert/strict'

import { compileSource } from '../../compiler/core.ts'

export function assertNativeClassLowering(): void {
  const source = `
class Box {
  value: number

  constructor(value: number) {
    this.value = value
  }
}

const box = new Box(7)
console.log(box.value)
`

  const result = compileSource(source, {
    target: 'cc'
  })

  assert.match(result.code, /class Box|struct Box/)
  assert.match(result.code, /double value/)
  assert.match(result.code, /Box box/)
  assert.doesNotMatch(result.code, /inox_shape_Box/)
  assert.doesNotMatch(result.code, /inox_object_new/)
  assert.doesNotMatch(result.code, /inox_object_get\(box/)
}
