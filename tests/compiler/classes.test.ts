import test from 'node:test'
import {
  assert,
  assertDiagnostic,
  cLibuvOptions,
  collectIrFeatureRequirements,
  collectIrFunctionEffects,
  collectIrFunctionNodeEntries,
  collectIrGlobalRoots,
  collectIrLocalThrowValueTypes,
  collectIrModuleRecords,
  collectIrPrograms,
  collectIrTopLevelNodeEntries,
  collectIrTopLevelNodesFromPrograms,
  compileFile,
  compileSource,
  CompileError,
  emitCBundleFromIrModules,
  emitCFromIr,
  emitJsBundleFromIrModules,
  emitJsFromIr,
  findIrEntryProgram,
  join,
  mkdir,
  mkdtemp,
  rm,
  tmpdir,
  writeFile
} from '../helpers/compiler-smoke.ts'



test('compiles classic for loops to JS and C', () => {
  const source = `export function main(): void {
  let total = 0

  for (let index = 0; index < 4; index = index + 1) {
    total = total + index
  }

  console.log(total)
}
`
  const js = compileSource(source, {
    target: 'js'
  })
  const c = compileSource(source, {
    target: 'c'
  })

  assert.match(js.code, /for \(let index = 0; \(index < 4\); index = \(index \+ 1\)\) \{/)
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
    /\{\n\s+ccjs_release\(ccjs_value_\d+\);\n\s+ccjs_value_\d+ = ccjs_undefined_value\(\);\n\s+if \(ccjs_string_from_literal\(&ccjs_default_allocator, "start", 5, &ccjs_value_\d+\) != CCJS_OK\)\s+goto ccjs_cleanup;\n\s+double index = start\(ccjs_value_\d+\);/
  )
  assert.match(
    result.code,
    /for \(;;\) \{\n\s+ccjs_release\(ccjs_value_\d+\);\n\s+ccjs_value_\d+ = ccjs_undefined_value\(\);\n\s+if \(ccjs_string_from_literal\(&ccjs_default_allocator, "limit", 5, &ccjs_value_\d+\) != CCJS_OK\)\s+goto ccjs_cleanup;\n\s+if \(!\(keepGoing\(index, ccjs_value_\d+\)\)\) break;/
  )
  assert.match(
    result.code,
    /ccjs_release\(ccjs_value_\d+\);\n\s+ccjs_value_\d+ = ccjs_undefined_value\(\);\n\s+if \(ccjs_string_from_literal\(&ccjs_default_allocator, "step", 4, &ccjs_value_\d+\) != CCJS_OK\)\s+goto ccjs_cleanup;\n\s+\(index = nextIndex\(index, ccjs_value_\d+\)\);/
  )
})


test('compiles simple classes to JS and C object runtime calls', () => {
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
  const js = compileSource(source, {
    target: 'js'
  })
  assert.match(js.code, /class User \{/)
  assert.match(js.code, /\n {2}id\n {2}name\n/)
  assert.match(js.code, /constructor\(id, name\) \{/)
  assert.match(js.code, /this\.id = id/)
  assert.match(js.code, /this\.name = name/)
  assert.match(js.code, /rename\(next\) \{/)
  assert.match(js.code, /score\(extra\) \{/)
  assert.match(js.code, /total\(extra\) \{/)
  assert.match(js.code, /label\(\) \{/)
  assert.match(js.code, /const user = new User\(1, "Ada"\)/)
  assert.match(js.code, /const value = user\.total\(2\)/)
  assert.doesNotMatch(js.code, /readonly id: number/)
  assert.doesNotMatch(js.code, /rename\(next: string\)/)
  assert.deepEqual(
    js.ir.syntaxFeatures.map((item) => item.feature),
    ['class']
  )

  const c = compileSource(source, {
    target: 'c'
  })

  assert.match(c.code, /#include "ccjs\/object\.h"/)
  assert.match(
    c.code,
    /static const ccjs_field_info ccjs_shape_User_\d+_fields\[\] = \{\n\s+\{ "id", CCJS_FIELD_READONLY \},\n\s+\{ "name", 0 \},/
  )
  assert.match(c.code, /static void ccjs_method_User_rename\(ccjs_value this, ccjs_value ccjs_param_next\);/)
  assert.match(c.code, /static double ccjs_method_User_score\(ccjs_value this, double extra\);/)
  assert.match(c.code, /static double ccjs_method_User_total\(ccjs_value this, double extra\);/)
  assert.match(c.code, /static ccjs_value ccjs_method_User_label\(ccjs_value this\);/)
  assert.match(c.code, /ccjs_object_new\(&ccjs_default_allocator, &ccjs_shape_User_\d+, &user\)/)
  assert.match(c.code, /ccjs_object_init_known\(user, 0, ccjs_number_value\(1\)\)/)
  assert.match(c.code, /ccjs_object_init_known\(user, 1, ccjs_value_\d+\)/)
  assert.match(c.code, /ccjs_object_get_known\(this, 0, &ccjs_expr_value_\d+\)/)
  assert.match(c.code, /ccjs_method_User_rename\(user, ccjs_value_\d+\);/)
  assert.match(c.code, /const double value = ccjs_method_User_total\(user, 2\);/)
  assert.match(c.code, /ccjs_return = ccjs_method_User_score\(this, extra\);/)
  assert.match(c.code, /ccjs_method_value_\d+ = ccjs_method_User_label\(user\);/)
  assert.match(c.code, /ccjs_object_set_known\(this, 1, ccjs_value_\d+\)/)
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
    'CCJS_ASSIGN_READONLY_FIELD'
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
    'CCJS_CLASS_EXTENDS'
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
    'CCJS_CLASS_STATIC'
  )

  assertDiagnostic(
    `class Counter {
  static count: number
}
`,
    'CCJS_CLASS_STATIC'
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
    getUser?.returnShape?.fields.map((field) => ({
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
  assert.equal((result.code.match(/CCJS_FIELD_READONLY/g) ?? []).length, 1)

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

  assert.equal((withoutReturnShape.match(/CCJS_FIELD_READONLY/g) ?? []).length, 0)
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
      target: 'js'
    }
  )

  assert.match(result.code, /const user = \{ id: 1, name: "Ada" \}/)
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
  const js = compileSource(source, {
    target: 'js'
  })
  const c = compileSource(source, {
    target: 'c'
  })
  const main = js.hir.body.find((item) => item.type === 'FunctionDeclaration' && item.name === 'main')
  assert.ok(main)
  const user = main.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'user')
  assert.ok(user)

  assert.deepEqual(
    user.shape.fields.map((field) => ({
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
  assert.match(c.code, /\{ "id", CCJS_FIELD_READONLY \}/)
  assert.match(c.code, /\{ "name", 0 \}/)
  assert.match(c.code, /ccjs_object_init_known\(user, 0, ccjs_number_value\(1\)\)/)
  assert.match(c.code, /ccjs_object_get_known\(user, 0, &ccjs_field_\d+\)/)
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
    'CCJS_ASSIGN_READONLY_FIELD'
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
      target: 'js'
    }
  )

  assert.match(result.code, /const name = user\["name"\]/)

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
    'CCJS_ASSIGN_READONLY_FIELD'
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
    'CCJS_MISSING_FIELD'
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
    'CCJS_UNKNOWN_FIELD'
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
    'CCJS_TYPE_MISMATCH'
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
    'CCJS_UNKNOWN_FIELD'
  )
})
