import assert from 'node:assert/strict'

import { compileSource } from '../../compiler/core.ts'
import { cStringLiteral } from '../../compiler/c/identifiers.ts'

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
  assert.match(result.code, /#include "inox\/class_descriptor\.h"/)
  assert.match(result.code, /static const inox_class_field_descriptor inox_class_descriptor_Box_fields\[\]/)
  assert.match(result.code, classDescriptorFieldPattern('value', 'number', 'number', 'strong'))
  assert.match(result.code, /static inox_status inox_class_descriptor_Box_read_field\(const void\* instance, uint32_t index, inox_value\* out\)/)
  assert.match(result.code, /\*out = inox_number_value\(value->value\)/)
  assert.match(result.code, /static const inox_class_descriptor inox_class_descriptor_Box/)
  assert.match(result.code, /inox_class_descriptor_Box_read_field/)
  assert.doesNotMatch(result.code, /inox_shape_Box/)
  assert.doesNotMatch(result.code, /inox_object_new/)
  assert.doesNotMatch(result.code, /inox_object_get\(box/)
}

function classDescriptorFieldPattern(name: string, valueType: string, declaredType: string, ownership: string): RegExp {
  return new RegExp(
    `\\{ ${escapeRegExp(cStringLiteral(name))}, ${escapeRegExp(cStringLiteral(valueType))}, ${escapeRegExp(
      cStringLiteral(declaredType)
    )}, ${escapeRegExp(cStringLiteral(ownership))}, INOX_CLASS_FIELD_ENUMERABLE \\}`
  )
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
