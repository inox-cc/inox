import assert from 'node:assert/strict'

import { compileFileToCModuleTextsSync, compileSource } from '../../compiler/core.ts'
import { cStringLiteral } from '../../compiler/c/identifiers.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

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
    libraries: defaultCompilerLibrarySet,
    target: 'cc'
  })

  assert.match(result.code, /class Box|struct Box/)
  assert.match(result.code, /double value/)
  assert.match(result.code, /Box box/)
  assert.doesNotMatch(result.code, /#include "inox\/class_runtime\.h"/)
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
    libraries: defaultCompilerLibrarySet,
    target: 'cc'
  })

  assert.match(result.code, /#include "inox\/class_runtime\.h"/)
  assert.match(result.code, /class Box : public inox::Class<Box>/)
  assert.match(result.code, /static constexpr uint32_t inox_field_count = 1/)
  assert.match(result.code, /const inox_class_field_descriptor Box::inox_fields\[\]/)
  assert.match(result.code, classDescriptorFieldPattern('value', 'number', 'number', 'strong'))
  assert.match(result.code, /const inox_class_descriptor Box::inox_descriptor = inox::class_descriptor<Box>\("Box"\)/)
  assert.match(result.code, /inox_status Box::inox_read_field\(const Box& value, uint32_t index, inox_value\* out\)/)
  assert.match(result.code, /\*out = inox_number_value\(value\.value\)/)
  assert.match(result.code, /inox::console_format_class_instance\(Box::inox_descriptor, &box\)/)
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
    libraries: defaultCompilerLibrarySet,
    target: 'cc'
  })

  assert.match(result.code, /class Box|struct Box/)
  assert.match(result.code, /class Parent|struct Parent/)
  assert.match(result.code, /#include "inox\/value\.h"/)
  assert.match(result.code, /inox::Value payload/)
  assert.match(result.code, /Box box/)
  assert.match(result.code, /class Parent : public inox::Class<Parent>/)
  assert.match(
    result.code,
    /const inox_class_descriptor Parent::inox_descriptor = inox::class_descriptor<Parent>\("Parent"\)/
  )
  assert.match(result.code, /inox_class_instance_ref_copy\(\s*&inox_default_allocator,\s*&Parent::inox_descriptor/)
  assert.doesNotMatch(result.code, /inox_retain\(payload\)/)
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
    libraries: defaultCompilerLibrarySet,
    target: 'cc'
  })

  assert.match(result.code, /class ArrayBox|struct ArrayBox/)
  assert.match(result.code, /inox::Value values/)
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
    libraries: defaultCompilerLibrarySet,
    target: 'cc'
  })

  assert.match(result.code, /class ScoreBox|struct ScoreBox/)
  assert.match(result.code, /inox::Value scores/)
  assert.match(result.code, /Map\(this->scores\.raw\(\)\)\.size\(\)/)
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
    libraries: defaultCompilerLibrarySet,
    target: 'cc'
  })

  assert.match(result.code, /class TagBox|struct TagBox/)
  assert.match(result.code, /inox::Value tags/)
  assert.match(result.code, /Set\(this->tags\.raw\(\)\)\.size\(\)/)
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
    libraries: defaultCompilerLibrarySet,
    target: 'cc'
  })

  assert.match(result.code, /class Child|struct Child/)
  assert.match(result.code, /class Parent|struct Parent/)
  assert.match(result.code, /Child current = this->child/)
  assert.match(result.code, /current\.label\(\)/)
  assert.doesNotMatch(result.code, /inox_value current/)
  assert.doesNotMatch(result.code, /inox_method_Child_label/)
}

export function assertNativeClassFieldRestoreFromObjectLowering(): void {
  const source = `
class Scope {
  name: string

  constructor(name: string) {
    this.name = name
  }

  label(): string {
    return this.name
  }
}

type ScopeState = {
  scope: Scope
}

class Holder {
  scope: Scope

  constructor() {
    this.scope = new Scope('Ada')
  }

  save(): ScopeState {
    return {
      scope: this.scope
    }
  }

  restore(previous: ScopeState): void {
    this.scope = previous.scope
  }

  label(): string {
    return this.scope.label()
  }
}

const holder = new Holder()
const previous = holder.save()
holder.restore(previous)
console.log(holder.label())
`

  const result = compileSource(source, {
    libraries: defaultCompilerLibrarySet,
    target: 'cc'
  })

  assert.match(
    result.code,
    /inox::class_assign_from_value\(\s*inox_value_\d+,\s*&Scope::inox_descriptor,\s*&this->scope\s*\)/
  )
  assert.doesNotMatch(result.code, /this->scope = inox_value_\d+;/)
}

export function assertNativeClassStringLiteralConstructorUsesCppValue(): void {
  const source = `
class Foo {
  name: string

  constructor(name: string) {
    this.name = name
  }

  test(): string {
    return this.name
  }

  isPromise(): boolean {
    return this.name === 'promise'
  }
}

const f = new Foo('foo 1')
console.log(f.test())
console.log(f.isPromise())
`

  const result = compileSource(source, {
    libraries: defaultCompilerLibrarySet,
    target: 'cc'
  })

  assert.match(result.code, /inox::String name/)
  assert.match(result.code, /Foo\(const inox::String& name\);/)
  assert.match(result.code, /Foo::Foo\(const inox::String& name\) : name\(name\) \{\n\}/)
  assert.match(result.code, /Foo f\{inox::String\("foo 1", 5\)\};|f = Foo\(inox::String\("foo 1", 5\)\);/)
  assert.doesNotMatch(result.code, /Foo\(const inox::Value& name\)/)
  assert.doesNotMatch(result.code, /Foo::Foo\(const inox::Value& name\)/)
  assert.doesNotMatch(result.code, /Foo\(const char\* name\)/)
  assert.doesNotMatch(result.code, /Foo::Foo\(const char\* name\)/)

  const constructor = generatedBlock(result.code, 'Foo::Foo(const inox::String& name)')

  assert.match(constructor, /: name\(name\) \{\n\}/)
  assert.match(result.code, /!inox_cmp_string_\d+\.valid\(\)/)
  assert.match(
    result.code,
    /inox_cmp_string_\d+\.length\(\) == 7 && memcmp\(inox_cmp_string_\d+\.bytes\(\), "promise", inox_cmp_string_\d+\.length\(\)\) == 0/
  )
  assert.doesNotMatch(constructor, /this->name/)
  assert.doesNotMatch(constructor, /inox::Value/)
  assert.doesNotMatch(constructor, /inox_param_name/)
  assert.doesNotMatch(constructor, /this->name = inox_param_name;/)
  assert.doesNotMatch(constructor, /cleanup:/)
  assert.doesNotMatch(constructor, /goto cleanup;/)
  assert.doesNotMatch(constructor, /inox_retain/)
  assert.doesNotMatch(constructor, /inox_release/)
  assert.doesNotMatch(constructor, /tag != INOX_TAG_STRING/)
  assert.doesNotMatch(constructor, /inox_string_from_literal/)
  assert.doesNotMatch(result.code, /as\.ref = \(inox_ref\*\)&name->header/)
  assert.doesNotMatch(result.code, /this->name\.tag/)
  assert.doesNotMatch(result.code, /this->name\.as\.ref/)
  assert.doesNotMatch(result.code, /inox_cleanup/)
  assert.doesNotMatch(result.code, /Foo f\(inox_/)
  assert.doesNotMatch(result.code, /f = Foo\(inox_value/)
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
    libraries: defaultCompilerLibrarySet,
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
    libraries: defaultCompilerLibrarySet,
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
