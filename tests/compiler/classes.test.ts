import test from 'node:test'
import type { AnyNode } from '../../compiler/types.ts'
import { assert, assertDiagnostic, compileSource, emitCFromIr } from '../helpers/compiler-smoke.ts'

test('compiles classic for loops to C', () => {
  const source = `export function main(): void {
  let total = 0

  for (let index = 0; index < 4; index = index + 1) {
    total = total + index
  }

  console.log(total)
}
`
  const c = compileSource(source, {
    target: 'c'
  })

  assert.match(c.code, /for \(double index = 0; \(index < 4\); \(index = \(index \+ 1\)\)\) \{/)
})

test('prepares C string-argument calls in classic for clauses', () => {
  const source = `function start(label: string): number {
  return 0
}

function keepGoing(index: number, label: string): boolean {
  return index < 3
}

function nextIndex(index: number, label: string): number {
  return index + 1
}

export function main(): void {
  let total = 0

  for (let index = start('start'); keepGoing(index, 'limit'); index = nextIndex(index, 'step')) {
    total = total + index
  }

  console.log(total)
}
`
  const result = compileSource(source, {
    target: 'c'
  })

  assert.match(
    result.code,
    /\{\n\s+inox_release\(inox_value_\d+\);\n\s+inox_value_\d+ = inox_undefined_value\(\);\n\s+if \(inox_string_from_literal\(&inox_default_allocator, "start", 5, &inox_value_\d+\) != INOX_OK\)\s+goto inox_cleanup;\n\s+double index = start\(inox_value_\d+\);/
  )
  assert.match(
    result.code,
    /for \(;;\) \{\n\s+inox_release\(inox_value_\d+\);\n\s+inox_value_\d+ = inox_undefined_value\(\);\n\s+if \(inox_string_from_literal\(&inox_default_allocator, "limit", 5, &inox_value_\d+\) != INOX_OK\)\s+goto inox_cleanup;\n\s+if \(!\(keepGoing\(index, inox_value_\d+\)\)\) break;/
  )
  assert.match(
    result.code,
    /inox_release\(inox_value_\d+\);\n\s+inox_value_\d+ = inox_undefined_value\(\);\n\s+if \(inox_string_from_literal\(&inox_default_allocator, "step", 4, &inox_value_\d+\) != INOX_OK\)\s+goto inox_cleanup;\n\s+\(index = nextIndex\(index, inox_value_\d+\)\);/
  )
})

test('compiles simple classes to C object runtime calls', () => {
  const source = `class User {
  readonly id: number
  name: string

  constructor(id: number, name: string) {
    this.id = id
    this.name = name
  }

  rename(next: string): void {
    this.name = next
  }

  score(extra: number): number {
    return this.id + extra
  }

  total(extra: number): number {
    return this.score(extra)
  }

  label(): string {
    return this.name
  }
}

export function main(): void {
  const user = new User(1, 'Ada')
  user.rename('Grace')
  const value = user.total(2)
  const name = user.label()
  console.log(value, name)
}
`
  const c = compileSource(source, {
    target: 'c'
  })

  assert.deepEqual(
    c.ir.syntaxFeatures.map((item) => item.feature),
    ['class']
  )
  assert.match(c.code, /#include "inox\/object\.h"/)
  assert.match(
    c.code,
    /static const inox_field_info inox_shape_User_\d+_fields\[\] = \{\n\s+\{ "id", INOX_FIELD_READONLY \},\n\s+\{ "name", 0 \},/
  )
  assert.match(c.code, /static void inox_method_User_rename\(inox_value this, inox_value inox_param_next\);/)
  assert.match(c.code, /static double inox_method_User_score\(inox_value this, double extra\);/)
  assert.match(c.code, /static double inox_method_User_total\(inox_value this, double extra\);/)
  assert.match(c.code, /static inox_value inox_method_User_label\(inox_value this\);/)
  assert.match(c.code, /inox_object_new\(&inox_default_allocator, &inox_shape_User_\d+, &user\)/)
  assert.match(c.code, /inox_object_init_known\(user, 0, inox_number_value\(1\)\)/)
  assert.match(c.code, /inox_object_init_known\(user, 1, inox_value_\d+\)/)
  assert.match(c.code, /inox_object_get_known\(this, 0, &inox_expr_value_\d+\)/)
  assert.match(c.code, /inox_method_User_rename\(user, inox_value_\d+\);/)
  assert.match(c.code, /const double value = inox_method_User_total\(user, 2\);/)
  assert.match(c.code, /inox_return = inox_method_User_score\(this, extra\);/)
  assert.match(c.code, /inox_method_value_\d+ = inox_method_User_label\(user\);/)
  assert.match(c.code, /inox_object_set_known\(this, 1, inox_value_\d+\)/)
})

test('lowers constructor field reads through the current class object', () => {
  const source = `function normalizeRoot(root: string): string {
  return root
}

class Host {
  root: string
  sourceRoot: string

  constructor(root: string) {
    this.root = root
    this.sourceRoot = normalizeRoot(this.root)
  }

  label(): string {
    return this.sourceRoot
  }
}

export function main(): void {
  const host = new Host('src')
  console.log(host.label())
}
`
  const c = compileSource(source, {
    target: 'c'
  })

  assert.match(c.code, /inox_object_init_known\(host, 0, inox_value_\d+\)/)
  assert.match(c.code, /inox_object_get_known\(host, 0, &inox_value_\d+\)/)
  assert.match(c.code, /normalizeRoot\(inox_value_\d+\)/)
  assert.match(c.code, /inox_object_init_known\(host, 1, inox_value_\d+\)/)
})

test('lowers class method calls through class-typed object fields', () => {
  const source = `class Inner {
  value: number

  constructor(value: number) {
    this.value = value
  }

  read(extra: number): number {
    return this.value + extra
  }
}

class Outer {
  inner: Inner

  constructor(inner: Inner) {
    this.inner = inner
  }

  total(): number {
    return this.inner.read(2)
  }
}

export function main(): void {
  const outer = new Outer(new Inner(5))
  console.log(outer.total())
}
`
  const c = compileSource(source, {
    target: 'c'
  })

  assert.match(c.code, /inox_object_get_known\(this, 0, &inox_value_\d+\)/)
  assert.match(c.code, /inox_value_\d+\.tag != INOX_TAG_OBJECT/)
  assert.match(c.code, /inox_return = inox_method_Inner_read\(inox_value_\d+, 2\);/)
})

test('lowers string class method assignments into runtime value locals', () => {
  const source = `class Reader {
  fallback(): string | null {
    return 'fallback'
  }

  read(node: object): void {
    let value = node.name

    if (value === null) {
      value = this.fallback()
    }

    console.log(value)
  }
}

export function main(): void {
  const reader = new Reader()
  reader.read({ name: null })
}
`
  const c = compileSource(source, {
    target: 'c'
  })

  assert.match(c.code, /inox_method_Reader_fallback\(this\)/)
  assert.match(c.code, /inox_method_value_\d+ = inox_method_Reader_fallback\(this\);/)
  assert.match(c.code, /inox_nullable_value_\d+ = inox_method_value_\d+;/)
  assert.match(c.code, /inox_retain\(inox_nullable_value_\d+\);/)
  assert.match(c.code, /inox_release\(value\);/)
  assert.match(c.code, /value = inox_nullable_value_\d+;/)
})

test('rejects readonly class field assignment outside constructors', () => {
  assertDiagnostic(
    `class User {
  readonly id: number

  constructor(id: number) {
    this.id = id
  }

  rename(): void {
    this.id = 2
  }
}

export function main(): void {
  const user = new User(1)
  user.rename()
}
`,
    'INOX_ASSIGN_READONLY_FIELD'
  )
})

test('rejects unsupported class inheritance with a stable diagnostic', () => {
  assertDiagnostic(
    `class User {
  id: number

  constructor(id: number) {
    this.id = id
  }
}

class Admin extends User {
  level: number

  constructor(id: number, level: number) {
    this.id = id
    this.level = level
  }
}
`,
    'INOX_CLASS_EXTENDS'
  )
})

test('rejects unsupported static class members with stable diagnostics', () => {
  assertDiagnostic(
    `class User {
  static create(): User {
    return new User()
  }
}
`,
    'INOX_CLASS_STATIC'
  )

  assertDiagnostic(
    `class Counter {
  static count: number
}
`,
    'INOX_CLASS_STATIC'
  )
})

test('drives C function return object shapes from target-neutral IR declarations', () => {
  const result = compileSource(
    `type User = {
  readonly id: number,
  name: string
}

function getUser(): User {
  return { id: 7, name: 'Ada' }
}

export function main(): void {
  console.log('ok')
}
`,
    {
      target: 'c'
    }
  )
  const getUser = result.ir.functionDeclarations.find((item) => item.name === 'getUser')

  assert.deepEqual(
    getUser?.returnShape?.fields.map((field: AnyNode) => ({
      name: field.name,
      readonly: field.readonly
    })),
    [
      {
        name: 'id',
        readonly: true
      },
      {
        name: 'name',
        readonly: false
      }
    ]
  )
  assert.equal((result.code.match(/INOX_FIELD_READONLY/g) ?? []).length, 1)

  const withoutReturnShape = emitCFromIr({
    ...result.ir,
    functionDeclarations: result.ir.functionDeclarations.map((item) =>
      item.name === 'getUser'
        ? {
            ...item,
            returnShape: undefined
          }
        : item
    )
  })

  assert.equal((withoutReturnShape.match(/INOX_FIELD_READONLY/g) ?? []).length, 0)
})

test('checks typed object aliases and readonly fields', () => {
  const result = compileSource(
    `type User = {
  readonly id: number,
  name: string
}

export function main(): void {
  const user: User = { id: 1, name: 'Ada' }
  user.name = 'Grace'
  console.log(user.name)
}
`,
    {
      target: 'c'
    }
  )

  assert.doesNotMatch(result.code, /type User/)
})

test('keeps typed object shape metadata for C lowering', () => {
  const source = `type User = {
  readonly id: number,
  name: string
}

export function main(): void {
  const user: User = { name: 'Ada', id: 1 }
  const id = user.id
  console.log(id)
}
`
  const c = compileSource(source, {
    target: 'c'
  })
  const main = c.hir.body.find((item) => item.type === 'FunctionDeclaration' && item.name === 'main')
  assert.ok(main)
  const user = main.body.find((item: AnyNode) => item.type === 'VariableDeclaration' && item.name === 'user')
  assert.ok(user)

  assert.deepEqual(
    user.shape.fields.map((field: AnyNode) => ({
      name: field.name,
      readonly: field.readonly,
      valueType: field.valueType
    })),
    [
      {
        name: 'id',
        readonly: true,
        valueType: 'number'
      },
      {
        name: 'name',
        readonly: false,
        valueType: 'string'
      }
    ]
  )
  assert.match(c.code, /\{ "id", INOX_FIELD_READONLY \}/)
  assert.match(c.code, /\{ "name", 0 \}/)
  assert.match(c.code, /inox_object_init_known\(user, 0, inox_number_value\(1\)\)/)
  assert.match(c.code, /inox_object_get_known\(user, 0, &inox_field_\d+\)/)
})

test('allows optional typed object fields to be omitted', () => {
  const source = `type Options = {
  target?: string,
  retries: number
}

export function main(): void {
  const options: Options = { retries: 2 }
  console.log(options.retries)
}
`
  const result = compileSource(source, {
    target: 'c'
  })
  const main = result.hir.body.find((item) => item.type === 'FunctionDeclaration' && item.name === 'main')
  assert.ok(main)
  const options = main.body.find((item: AnyNode) => item.type === 'VariableDeclaration' && item.name === 'options')
  assert.ok(options)

  assert.deepEqual(
    options.shape.fields.map((field: AnyNode) => ({
      name: field.name,
      optional: field.optional === true,
      valueType: field.valueType
    })),
    [
      {
        name: 'target',
        optional: true,
        valueType: 'string'
      },
      {
        name: 'retries',
        optional: false,
        valueType: 'number'
      }
    ]
  )
  assert.match(result.code, /inox_object_init_known\(options, 1, inox_number_value\(2\)\)/)
})

test('allows trailing optional function arguments to be omitted', () => {
  const result = compileSource(
    `type Location = {
  line: number,
  column: number
}

function lineOf(value?: Location | null): number {
  return value?.line ?? 1
}

export function main(): void {
  console.log(lineOf(), lineOf({ line: 7, column: 2 }))
}
`,
    {
      target: 'c'
    }
  )

  const lineOf = result.hir.body.find((item) => item.type === 'FunctionDeclaration' && item.name === 'lineOf')
  assert.ok(lineOf)
  assert.equal(lineOf.params[0].optional, true)
  assert.equal(lineOf.params[0].nullable, true)
  assert.match(result.code, /lineOf\(inox_null_value\(\)\)/)
})

test('supports type-only aliases and intersection object type aliases', () => {
  const result = compileSource(
    `type Base = {
  line: number
  column: number
}

type Token = Base & {
  type: string
  [key: string]: any
}

type TokenKind = 'identifier' | 'keyword'

type Tagged = {
  type: 'Tagged'
  version: 1
}

export function main(): void {
  const token: Token = { line: 1, column: 2, type: 'identifier', extra: 3 }
  const kind: TokenKind = 'identifier'
  const tagged: Tagged = { type: 'Tagged', version: 1 }
  console.log(token.line, token.type, kind, tagged.version)
}
`,
    {
      target: 'c'
    }
  )

  const main = result.hir.body.find((item) => item.type === 'FunctionDeclaration' && item.name === 'main')
  assert.ok(main)
  const token = main.body.find((item: AnyNode) => item.type === 'VariableDeclaration' && item.name === 'token')
  assert.ok(token)
  assert.equal(token.shape.dynamic, true)
  assert.deepEqual(
    token.shape.fields.map((field: AnyNode) => field.name),
    ['line', 'column', 'type']
  )
  const tagged = main.body.find((item: AnyNode) => item.type === 'VariableDeclaration' && item.name === 'tagged')
  assert.ok(tagged)
  const kind = main.body.find((item: AnyNode) => item.type === 'VariableDeclaration' && item.name === 'kind')
  assert.ok(kind)
  assert.equal(kind.valueType, 'string')
  assert.deepEqual(
    tagged.shape.fields.map((field: AnyNode) => ({ name: field.name, valueType: field.valueType })),
    [
      { name: 'type', valueType: 'string' },
      { name: 'version', valueType: 'number' }
    ]
  )
  assert.match(result.code, /inox_object_init_known\(token, 0, inox_number_value\(1\)\)/)
  assert.match(result.code, /inox_object_init_known\(token, 2, inox_value_\d+\)/)
})

test('uses right-hand intersection field metadata when it overrides a base field', () => {
  const result = compileSource(
    `type Base = {
  objectName?: string
}

type Known = Base & {
  objectName: string
}

function read(member: Known): string {
  const name: string = member.objectName
  return name
}

export function main(): void {
  console.log(read({ objectName: 'box' }))
}
`,
    {
      target: 'c'
    }
  )

  const read = result.hir.body.find((item) => item.type === 'FunctionDeclaration' && item.name === 'read')
  assert.ok(read)
  assert.equal(read.params[0].shape.fields[0].nullable, false)
  assert.match(result.code, /inox_object_get_known\(member, 0, &inox_field_\d+\)/)
  assert.doesNotMatch(result.code, /INOX_TAG_NULL/)
})

test('rejects readonly typed object field assignment', () => {
  assertDiagnostic(
    `type User = {
  readonly id: number,
  name: string
}

export function main(): void {
  const user: User = { id: 1, name: 'Ada' }
  user.id = 2
}
`,
    'INOX_ASSIGN_READONLY_FIELD'
  )
})

test('checks typed object string index fields', () => {
  const result = compileSource(
    `type User = {
  readonly id: number,
  name: string
}

export function main(): void {
  const user: User = { id: 1, name: 'Ada' }
  const name: string = user['name']
  console.log(name)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /inox_object_get\(user, "name", 4, &inox_field_\d+\)/)

  assertDiagnostic(
    `type User = {
  readonly id: number,
  name: string
}

export function main(): void {
  const user: User = { id: 1, name: 'Ada' }
  user['id'] = 2
}
`,
    'INOX_ASSIGN_READONLY_FIELD'
  )
})

test('rejects typed object shape mismatches', () => {
  assertDiagnostic(
    `type User = {
  id: number,
  name: string
}

export function main(): void {
  const user: User = { id: 1 }
  console.log(user)
}
`,
    'INOX_MISSING_FIELD'
  )

  assertDiagnostic(
    `type User = {
  id: number
}

export function main(): void {
  const user: User = { id: 1, extra: true }
  console.log(user)
}
`,
    'INOX_UNKNOWN_FIELD'
  )

  assertDiagnostic(
    `type User = {
  id: number
}

export function main(): void {
  const user: User = { id: 'Ada' }
  console.log(user)
}
`,
    'INOX_TYPE_MISMATCH'
  )
})

test('rejects unknown typed object fields on member access', () => {
  assertDiagnostic(
    `type User = {
  name: string
}

export function main(): void {
  const user: User = { name: 'Ada' }
  console.log(user.age)
}
`,
    'INOX_UNKNOWN_FIELD'
  )
})
