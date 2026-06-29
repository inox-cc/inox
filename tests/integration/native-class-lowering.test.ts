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

export function assertNativeClassRuntimeValueFieldLowering(): void {
  const source = `
class Parent {
  value: number

  constructor(value: number) {
    this.value = value
  }
}

class Box {
  payload: object

  constructor(payload: object) {
    this.payload = payload
  }
}

const parent = new Parent(7)
const box = new Box(parent)
console.log(box.payload)
`

  const result = compileSource(source, {
    target: 'cc'
  })

  assert.match(result.code, /class Box|struct Box/)
  assert.match(result.code, /class Parent|struct Parent/)
  assert.match(result.code, /inox_value payload/)
  assert.match(result.code, /Box box/)
  assert.match(result.code, classDescriptorFieldPattern('payload', 'object', 'object', 'strong'))
  assert.match(result.code, /static inox_status inox_class_descriptor_Box_read_field\(const void\* instance, uint32_t index, inox_value\* out\)/)
  assert.match(result.code, /\*out = value->payload/)
  assert.match(result.code, /inox_retain\(payload\)/)
  assert.doesNotMatch(result.code, /inox_shape_Box/)
  assert.doesNotMatch(result.code, /inox_object_new/)
  assert.doesNotMatch(result.code, /inox_object_get\(box/)
}

export function assertNativeClassArrayRuntimeFieldLowering(): void {
  const source = `
class ArrayBox {
  values: number[]

  constructor(values: number[]) {
    this.values = values
  }
}

const arrayBox = new ArrayBox([1, 2])
console.log(arrayBox.values.length)
`

  const result = compileSource(source, {
    target: 'cc'
  })

  assert.match(result.code, /class ArrayBox|struct ArrayBox/)
  assert.match(result.code, /inox_value values/)
  assert.match(result.code, classDescriptorFieldPattern('values', 'array', 'array<number>', 'strong'))
  assert.doesNotMatch(result.code, /inox_shape_ArrayBox/)
  assert.doesNotMatch(result.code, /inox_object_get\(arrayBox/)
}

export function assertNativeClassMapRuntimeFieldLowering(): void {
  const source = `
class ScoreBox {
  scores: Map<string, number>

  constructor(scores: Map<string, number>) {
    this.scores = scores
  }

  size(): number {
    return this.scores.size
  }
}

const scores: Map<string, number> = new Map()
scores.set('Ada', 7)
const scoreBox = new ScoreBox(scores)
console.log(scoreBox.size())
`

  const result = compileSource(source, {
    target: 'cc'
  })

  assert.match(result.code, /class ScoreBox|struct ScoreBox/)
  assert.match(result.code, /inox_value scores/)
  assert.match(result.code, classDescriptorFieldPattern('scores', 'map', 'map<string,number>', 'strong'))
  assert.match(result.code, /inox_map_size\(this->scores/)
  assert.doesNotMatch(result.code, /inox_shape_ScoreBox/)
  assert.doesNotMatch(result.code, /inox_object_get\(scoreBox/)
}

export function assertNativeClassFieldAliasLowering(): void {
  const source = `
class Child {
  name: string

  constructor(name: string) {
    this.name = name
  }

  label(): string {
    return this.name
  }
}

class Parent {
  child: Child

  constructor(child: Child) {
    this.child = child
  }

  label(): string {
    const current = this.child
    return current.label()
  }
}

const parent = new Parent(new Child('Ada'))
console.log(parent.label())
`

  const result = compileSource(source, {
    target: 'cc'
  })

  assert.match(result.code, /class Child|struct Child/)
  assert.match(result.code, /class Parent|struct Parent/)
  assert.match(result.code, /Child current = this->child/)
  assert.match(result.code, /current\.label\(\)/)
  assert.doesNotMatch(result.code, /inox_value current/)
  assert.doesNotMatch(result.code, /inox_method_Child_label/)
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
