import assert from 'node:assert/strict'

import { compileFileToCModuleTextsSync, compileSource } from '../../compiler/core.ts'
import { cStringLiteral } from '../../compiler/c/identifiers.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'

type GeneratedTextFile = {
  path: string
  code: string
}

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
  assert.doesNotMatch(result.code, /#include "inox\/class_runtime\.hpp"/)
  assert.doesNotMatch(result.code, /Box::inox_descriptor/)
  assert.doesNotMatch(result.code, /Box::inox_read_field/)
  assert.doesNotMatch(result.code, /inox_shape_Box/)
  assert.doesNotMatch(result.code, /inox_object_new/)
  assert.doesNotMatch(result.code, /inox_object_get\(box/)
}

export function assertNativeClassRuntimeDescriptorLowering(): void {
  const source = `
class Box {
  value: number

  constructor(value: number) {
    this.value = value
  }
}

const box = new Box(7)
console.log(box)
`

  const result = compileSource(source, {
    target: 'cc'
  })

  assert.match(result.code, /#include "inox\/class_runtime\.hpp"/)
  assert.match(result.code, /class Box : public inox::Class<Box>/)
  assert.match(result.code, /static constexpr uint32_t inox_field_count = 1/)
  assert.match(result.code, /const inox_class_field_descriptor Box::inox_fields\[\]/)
  assert.match(result.code, classDescriptorFieldPattern('value', 'number', 'number', 'strong'))
  assert.match(result.code, /const inox_class_descriptor Box::inox_descriptor = inox::class_descriptor<Box>\("Box"\)/)
  assert.match(result.code, /inox_status Box::inox_read_field\(const Box& value, uint32_t index, inox_value\* out\)/)
  assert.match(result.code, /\*out = inox_number_value\(value\.value\)/)
  assert.match(result.code, /inox_console_format_class_instance\(&inox_default_allocator, &Box::inox_descriptor, &box/)
  assert.doesNotMatch(result.code, /copy_instance/)
  assert.doesNotMatch(result.code, /destroy_instance/)
  assert.doesNotMatch(result.code, /inox_class_descriptor_Box_read_field/)
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
  assert.match(result.code, /class Parent : public inox::Class<Parent>/)
  assert.match(result.code, /const inox_class_descriptor Parent::inox_descriptor = inox::class_descriptor<Parent>\("Parent"\)/)
  assert.match(result.code, /inox_class_instance_ref_copy\(\s*&inox_default_allocator,\s*&Parent::inox_descriptor/)
  assert.match(result.code, /inox_retain\(payload\)/)
  assert.doesNotMatch(result.code, /Box::inox_descriptor/)
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
  assert.doesNotMatch(result.code, /ArrayBox::inox_descriptor/)
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
  assert.match(result.code, /inox_map_size\(this->scores/)
  assert.doesNotMatch(result.code, /ScoreBox::inox_descriptor/)
  assert.doesNotMatch(result.code, /inox_shape_ScoreBox/)
  assert.doesNotMatch(result.code, /inox_object_get\(scoreBox/)
}

export function assertNativeClassSetRuntimeFieldLowering(): void {
  const source = `
class TagBox {
  tags: Set<string>

  constructor(tags: Set<string>) {
    this.tags = tags
  }

  size(): number {
    return this.tags.size
  }
}

const tags: Set<string> = new Set()
tags.add('Ada')
const tagBox = new TagBox(tags)
console.log(tagBox.size())
`

  const result = compileSource(source, {
    target: 'cc'
  })

  assert.match(result.code, /class TagBox|struct TagBox/)
  assert.match(result.code, /inox_value tags/)
  assert.match(result.code, /inox_set_size\(this->tags/)
  assert.doesNotMatch(result.code, /TagBox::inox_descriptor/)
  assert.doesNotMatch(result.code, /inox_shape_TagBox/)
  assert.doesNotMatch(result.code, /inox_object_get\(tagBox/)
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

export function assertNativeClassStringLiteralConstructorOverload(): void {
  const source = `
class Foo {
  name: string

  constructor(name: string) {
    this.name = name
  }

  test(): string {
    return this.name
  }
}

const f = new Foo('foo 1')
console.log(f.test())
`

  const result = compileSource(source, {
    target: 'cc'
  })

  assert.match(result.code, /Foo\(const char\* name\);/)
  assert.match(result.code, /Foo::Foo\(const char\* name\)/)
  assert.match(result.code, /Foo f\("foo 1"\);|f = Foo\("foo 1"\);/)

  const literalConstructor = generatedBlock(result.code, 'Foo::Foo(const char* name)')

  assert.match(
    literalConstructor,
    /inox_string_from_literal\(\s*&inox_default_allocator,\s*name,\s*strlen\(name\),\s*&this->name\s*\)/
  )
  assert.doesNotMatch(literalConstructor, /inox_param_name/)
  assert.doesNotMatch(literalConstructor, /this->name = inox_param_name;/)
  assert.doesNotMatch(literalConstructor, /cleanup:/)
  assert.doesNotMatch(literalConstructor, /goto cleanup;/)
  assert.doesNotMatch(literalConstructor, /inox_retain/)
  assert.doesNotMatch(literalConstructor, /inox_release/)
  assert.doesNotMatch(literalConstructor, /tag != INOX_TAG_STRING/)
  assert.doesNotMatch(result.code, /as\.ref = \(inox_ref\*\)&name->header/)
  assert.doesNotMatch(result.code, /inox_cleanup/)
  assert.doesNotMatch(result.code, /Foo f\(inox_/)
  assert.doesNotMatch(result.code, /f = Foo\(inox_/)
}

export function assertNativeClassDefinitionsPrecedeModuleValues(): void {
  const source = `
class Foo {
  name: string

  constructor(name: string) {
    this.name = name
  }

  test() {
    console.log(this.name)
  }
}

const v = 123
const f = new Foo('foo 1')
f.test()
`

  const result = compileSource(source, {
    target: 'cc'
  })
  const methodIndex = result.code.indexOf('void Foo::test()')
  const numberValueIndex = result.code.indexOf('static double v = 0;')
  const classValueIndex = result.code.indexOf('static Foo f;')
  const mainIndex = result.code.indexOf('int main(void)')

  assert.notEqual(methodIndex, -1, 'missing Foo::test definition')
  assert.notEqual(numberValueIndex, -1, 'missing number module value')
  assert.notEqual(classValueIndex, -1, 'missing class module value')
  assert.notEqual(mainIndex, -1, 'missing main')
  assert.ok(methodIndex < numberValueIndex, 'class methods should be emitted before module values')
  assert.ok(numberValueIndex < classValueIndex, 'module values should preserve declaration order')
  assert.ok(classValueIndex < mainIndex, 'module values should be emitted before main')
}

export function assertNativeClassModuleUniqueSymbols(): void {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/src/index.ts',
        source: `
import { label as aLabel } from './a.ts'
import { label as bLabel } from './b.ts'

console.log(aLabel() + ':' + bLabel())
`
      },
      {
        path: '/pkg/src/a.ts',
        source: `
class Box {
  name: string

  constructor(name: string) {
    this.name = name
  }

  label(): string {
    return this.name
  }
}

export function label(): string {
  const box = new Box('a')
  return box.label()
}
`
      },
      {
        path: '/pkg/src/b.ts',
        source: `
class Box {
  name: string

  constructor(name: string) {
    this.name = name
  }

  label(): string {
    return this.name
  }
}

export function label(): string {
  const box = new Box('b')
  return box.label()
}
`
      }
    ],
    {
      root: '/'
    }
  )
  const files = compileFileToCModuleTextsSync('/pkg/src/index.ts', {
    callMain: true,
    host,
    sourceRoot: '/pkg'
  }) as GeneratedTextFile[]
  const aSource = generatedTextFile(files, 'src/a.cc').code
  const bSource = generatedTextFile(files, 'src/b.cc').code

  assert.match(aSource, /class inox_mod_src_a_ts_[0-9a-f]+_Box/)
  assert.match(bSource, /class inox_mod_src_b_ts_[0-9a-f]+_Box/)
  assert.doesNotMatch(aSource, /inox_descriptor/)
  assert.doesNotMatch(bSource, /inox_descriptor/)
  assert.doesNotMatch(aSource, /class Box/)
  assert.doesNotMatch(bSource, /class Box/)
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

function generatedBlock(source: string, signature: string): string {
  const start = source.indexOf(signature)

  assert.notEqual(start, -1, `missing generated block ${signature}`)

  const bodyStart = source.indexOf('{', start)

  assert.notEqual(bodyStart, -1, `missing generated block body ${signature}`)

  let depth = 0

  for (let index = bodyStart; index < source.length; index = index + 1) {
    const char = source[index]

    if (char === '{') {
      depth = depth + 1
    } else if (char === '}') {
      depth = depth - 1

      if (depth === 0) {
        return source.slice(start, index + 1)
      }
    }
  }

  assert.fail(`missing generated block end ${signature}`)
}

function generatedTextFile(files: GeneratedTextFile[], path: string): GeneratedTextFile {
  for (const file of files) {
    if (file.path === path) {
      return file
    }
  }

  assert.fail(`missing generated file ${path}`)
}
