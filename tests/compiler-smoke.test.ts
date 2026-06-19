import test from 'node:test'
import { emitPreparedNumberExpression } from '../compiler/c/values/expressions.ts'
import {
  assert,
  assertDiagnostic,
  cLibuvOptions,
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
  findIrEntryProgram,
  join,
  mkdir,
  mkdtemp,
  rm,
  tmpdir,
  writeFile
} from './helpers/compiler-smoke.ts'
import type { AnyNode } from '../compiler/types.ts'

test('compiles exported main to C wrapper', () => {
  const result = compileSource(
    `export function main(): void {
  console.log('hello')
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /void inox_main\(void\) \{/)
  assert.match(result.code, /printf\("%s\\n", "hello"\);/)
  assert.match(result.code, /int main\(void\) \{/)
  assert.doesNotMatch(result.code, /int main\(void\) \{[\s\S]*inox_main\(\);/)
})


test('emits C for a minimal console program', () => {
  const result = compileSource(
    `export function main(): void {
  const name = 'Ada'
  console.log('hello', name)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /#include <stdio\.h>/)
  assert.match(result.code, /#include "inox\/console\.h"/)
  assert.match(result.code, /const char \*name = "Ada";/)
  assert.match(result.code, /printf\("%s %s\\n", "hello", name\);/)
})


test('emits C console warn and error through stderr runtime stream', () => {
  const result = compileSource(
    `console.warn('heads up')
console.error('failed')
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /#include "inox\/console\.h"/)
  assert.match(result.code, /inox_console_printf\(INOX_CONSOLE_STDERR, "%s\\n", "heads up"\)/)
  assert.match(result.code, /inox_console_printf\(INOX_CONSOLE_STDERR, "%s\\n", "failed"\)/)
})


test('parses string literals that look like operators', () => {
  const result = compileSource(
    `export function main(): void {
  const bang = '!'
  const plus = '+'
  const paren = '('
  console.log(bang, plus, paren)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /const char \*bang = "!";/)
  assert.match(result.code, /const char \*plus = "\+";/)
  assert.match(result.code, /const char \*paren = "\(";/)
  assert.match(result.code, /printf\("%s %s %s\\n", bang, plus, paren\);/)
})


test('emits C for numeric operators', () => {
  const result = compileSource(
    `export function main(): void {
  const value = 1 + 2 * 3
  console.log(value, value === 7)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /const double value = \(1 \+ \(2 \* 3\)\);/)
  assert.match(result.code, /printf\("%g %g\\n", \(\(double\)value\), \(\(double\)\(value == 7\)\)\);/)
})

test('lowers C null literals in prepared scalar expressions', () => {
  const nullableLoweringDependencies = {
    emitCObjectLiteralValueExpression: () => ({ lines: [], expression: 'inox_undefined_value()' }),
    emitCValueExpression: () => ({ lines: [], expression: 'inox_undefined_value()' }),
    emitNullableFunctionValueExpression: () => ({ lines: [], expression: 'inox_undefined_value()' }),
    emitNullableScalarValueExpression: () => ({ lines: [], expression: 'inox_null_value()' }),
    inferExpressionType: () => 'null',
    isNumberConversionCall: () => false,
    resolveRuntimeCallbackCalleeType: () => null
  }
  const context = {
    functionReturnNullables: new Map(),
    narrowedNullableScalars: new Set(),
    nullableLoweringDependencies,
    nullableVariables: new Set(),
    variables: new Map()
  }
  const deps = {
    cFsRuntimeConstantExpression: () => null,
    emitPreparedArrayIsArrayCallExpression: () => null,
    emitPreparedClassMethodCallExpression: () => null,
    emitPreparedPathBooleanCallExpression: () => null,
    emitPreparedProcessNumberExpression: () => null,
    emitPreparedUrlSearchParamsCallExpression: () => null
  }

  const result = emitPreparedNumberExpression(
    {
      type: 'NullLiteral'
    },
    context as never,
    deps as never
  )

  assert.deepEqual(result, {
    lines: [],
    expression: '0'
  })
})

test('lowers Array.isArray calls to C runtime tag checks', () => {
  const result = compileSource(
    `export function main(): void {
  const values = [1, 2, 3]
  console.log(Array.isArray(values), Array.isArray(7))
}
`,
    {
      target: 'c'
    }
  )

  assert.deepEqual(
    result.ir.globalUsages.map((usage) => usage.path.join('.')),
    ['Array.isArray', 'Array.isArray']
  )
  assert.match(result.code, /inox_array_new\(&inox_default_allocator, 3, &values\)/)
  assert.match(result.code, /\(values\.tag == INOX_TAG_ARRAY\)/)
  assert.match(result.code, /\(inox_number_value\(7\)\.tag == INOX_TAG_ARRAY\)/)
})

test('lowers Object.keys and Object.values calls to C object arrays', () => {
  const result = compileSource(
    `export function main(): void {
  const user = { score: 7 }
  const keys = Object.keys(user)
  const firstKey = Object.keys(user)[0]
  const values = Object.values(user)
  const first = Object.values(user)[0]
  const entries = Object.entries(user)
  const firstEntry = Object.entries(user)[0]
  console.log(user, keys, firstKey, values, first, entries, firstEntry)
}
`,
    {
      target: 'c'
    }
  )

  assert.deepEqual(
    result.ir.globalUsages.map((usage) => usage.path.join('.')),
    ['Object.keys', 'Object.keys', 'Object.values', 'Object.values', 'Object.entries', 'Object.entries']
  )
  assert.match(result.code, /inox_object_keys\(&inox_default_allocator, user, &inox_object_keys_\d+\)/)
  assert.match(result.code, /inox_object_values\(&inox_default_allocator, user, &inox_object_values_\d+\)/)
  assert.match(result.code, /inox_object_entries\(&inox_default_allocator, user, &inox_object_entries_\d+\)/)
  assert.match(result.code, /inox_array_get\(inox_object_keys_\d+, 0, &inox_value_\d+\)/)
  assert.match(result.code, /inox_array_get\(inox_object_values_\d+, 0, &inox_value_\d+\)/)
  assert.match(result.code, /inox_array_get\(inox_object_entries_\d+, 0, &inox_value_\d+\)/)
  assert.match(result.code, /inox_console_format_value\(&inox_default_allocator, user, &inox_log_value_\d+\)/)
  assert.match(result.code, /inox_console_format_value\(&inox_default_allocator, keys, &inox_log_value_\d+\)/)
  assert.match(result.code, /const inox_string\s*\*\s*firstKey = \(inox_string\*\)(?:inox_value_\d+|firstKey_value_\d+)\.as\.ref;/)
  assert.match(result.code, /inox_console_format_value\(&inox_default_allocator, values, &inox_log_value_\d+\)/)
  assert.match(result.code, /inox_console_format_value\(&inox_default_allocator, first, &inox_log_value_\d+\)/)
  assert.match(result.code, /inox_console_format_value\(&inox_default_allocator, entries, &inox_log_value_\d+\)/)
  assert.match(result.code, /inox_console_format_value\(&inox_default_allocator, firstEntry, &inox_log_value_\d+\)/)
})

test('lowers typeof equality guards to C runtime tag checks', () => {
  const result = compileSource(
    `function classify(value: unknown): void {
  if (typeof value === 'number') {
    console.log('number')
  }
  if (typeof value !== 'string') {
    console.log('not string')
  }
  if (typeof value === 'object') {
    console.log('object')
  }
}

export function main(): void {
  classify(7)
  classify('Ada')
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /void classify\(inox_value value\)/)
  assert.match(result.code, /value\.tag == INOX_TAG_NUMBER/)
  assert.match(result.code, /!\(value\.tag == INOX_TAG_STRING\)/)
  assert.match(
    result.code,
    /value\.tag == INOX_TAG_NULL \|\| value\.tag == INOX_TAG_OBJECT \|\| value\.tag == INOX_TAG_ARRAY/
  )
  assert.match(result.code, /classify\(inox_number_value\(7\)\)/)
})

test('lowers typeof undefined checks for raw C string references without runtime tags', () => {
  const result = compileSource(
    `type Node = {
  valueType: string
}

function read(node: Node): string {
  const statementValueType = node.valueType

  if (statementValueType !== null && typeof statementValueType !== 'undefined') {
    return statementValueType
  }

  return 'none'
}

export function main(): void {
  console.log(read({ valueType: 'string' }))
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /const inox_string\s*\*\s*statementValueType =/)
  assert.doesNotMatch(result.code, /statementValueType\.tag/)
  assert.match(result.code, /!\(statementValueType == 0\)/)
})

test('lowers Object.values and Object.entries inside C for-of object arrays', () => {
  const result = compileSource(
    `export function main(): void {
  const records = [{ left: 2, right: 5 }, { left: 7, right: 11 }]

  for (const record of records) {
    const values = Object.values(record)
    const left = values[0]
    const right = values[1]
    const entry = Object.entries(record)[1]
    console.log(left, right, entry)
  }
}
`,
    {
      target: 'c'
    }
  )

  assert.deepEqual(
    result.ir.globalUsages.map((usage) => usage.path.join('.')),
    ['Object.values', 'Object.entries']
  )
  assert.match(result.code, /for \(size_t inox_for_index_\d+ = 0; inox_for_index_\d+ < 2; inox_for_index_\d+ \+= 1\) \{/)
  assert.match(result.code, /inox_for_value_\d+\.tag != INOX_TAG_OBJECT/)
  assert.match(result.code, /inox_value record = inox_for_value_\d+;/)
  assert.match(result.code, /inox_object_values\(&inox_default_allocator, record, &inox_object_values_\d+\)/)
  assert.match(result.code, /inox_object_entries\(&inox_default_allocator, record, &inox_object_entries_\d+\)/)
  assert.match(result.code, /inox_array_get\(values, 0, &inox_value_\d+\)/)
  assert.match(result.code, /inox_array_get\(values, 1, &inox_value_\d+\)/)
})

test('infers JSON.parse literal arrays for C for-of object iteration', () => {
  const result = compileSource(
    `export function main(): void {
  const rows = JSON.parse('[{"first":10,"second":20},{"first":30,"second":40}]')

  for (const row of rows) {
    const values = Object.values(row)
    const second = values[1]
    const entry = Object.entries(row)[0]
    console.log(second, entry)
  }
}
`,
    {
      target: 'c'
    }
  )

  assert.deepEqual(
    result.ir.globalUsages.map((usage) => usage.path.join('.')),
    ['JSON.parse', 'Object.values', 'Object.entries']
  )
  assert.match(result.code, /inox_json_parse\(&inox_default_allocator, "\[\{\\"first\\":10,\\"second\\":20\},\{\\"first\\":30,\\"second\\":40\}\]"/)
  assert.match(result.code, /rows\.tag != INOX_TAG_ARRAY/)
  assert.match(result.code, /inox_array_len\(rows, &inox_for_length_\d+\)/)
  assert.match(result.code, /inox_for_value_\d+\.tag != INOX_TAG_OBJECT/)
  assert.match(result.code, /inox_object_values\(&inox_default_allocator, row, &inox_object_values_\d+\)/)
  assert.match(result.code, /inox_object_entries\(&inox_default_allocator, row, &inox_object_entries_\d+\)/)
})

test('infers JSON.parse object fields with array values for C iteration', () => {
  const result = compileSource(
    `export function main(): void {
  const payload = JSON.parse('{"items":[{"score":3},{"score":5,"bonus":8}]}')
  console.log(Object.entries(payload.items))

  for (const item of payload.items) {
    const values = Object.values(item)
    const first = values[0]
    console.log(first)
  }
}
`,
    {
      target: 'c'
    }
  )

  assert.deepEqual(
    result.ir.globalUsages.map((usage) => usage.path.join('.')),
    ['JSON.parse', 'Object.entries', 'Object.values']
  )
  assert.match(result.code, /inox_json_parse\(&inox_default_allocator, "\{\\"items\\":\[\{\\"score\\":3\},\{\\"score\\":5,\\"bonus\\":8\}\]\}"/)
  assert.match(result.code, /inox_json_object_\d+\.tag != INOX_TAG_OBJECT/)
  assert.match(result.code, /inox_object_get_known\(payload, 0, &inox_value_\d+\)/)
  assert.match(result.code, /inox_object_entries\(&inox_default_allocator, inox_value_\d+, &inox_object_entries_\d+\)/)
  assert.match(result.code, /inox_array_len\(inox_value_\d+, &inox_for_length_\d+\)/)
  assert.match(result.code, /inox_for_value_\d+\.tag != INOX_TAG_OBJECT/)
  assert.match(result.code, /inox_object_values\(&inox_default_allocator, item, &inox_object_values_\d+\)/)
})

test('infers JSON.parse object fields with escaped string values', () => {
  const result = compileSource(
    `export function main(): void {
  const user = JSON.parse('{"name":"Ada\\\\nLovelace","score":7}')
  console.log(user.name, user.score)
}
`,
    {
      target: 'c'
    }
  )

  assert.deepEqual(
    result.ir.globalUsages.map((usage) => usage.path.join('.')),
    ['JSON.parse']
  )
  assert.match(result.code, /inox_object_get_known\(user, 0, &inox_[a-z_]+_\d+\)/)
  assert.match(result.code, /inox_object_get_known\(user, 1, &inox_[a-z_]+_\d+\)/)
})

test('lowers invalid JSON.parse inside C try catch as a local throw', () => {
  const result = compileSource(
    `export function main(): void {
  try {
    const value = JSON.parse('[1 2]')
    console.log(value)
  } catch (error) {
    console.log(error)
  }

  console.log('after')
}
`,
    {
      target: 'c'
    }
  )

  assert.deepEqual(
    result.ir.globalUsages.map((usage) => usage.path.join('.')),
    ['JSON.parse']
  )
  assert.match(
    result.code,
    /inox_status inox_json_status_\d+ = inox_json_parse_with_error\(&inox_default_allocator, "\[1 2\]", 5, &inox_json_value_\d+, &inox_json_error_\d+\);/
  )
  assert.match(result.code, /if \(inox_json_error_\d+\.tag == INOX_TAG_STRING && inox_json_error_\d+\.as\.ref != 0\)/)
  assert.match(result.code, /inox_error = inox_json_error_\d+;/)
  assert.match(result.code, /inox_string_from_literal\(&inox_default_allocator, "JSON\.parse failed", 17, &inox_error\)/)
  assert.match(result.code, /inox_error_active = 1;\n {4}goto inox_try_\d+_catch;/)
})

test('erases TypeScript as expressions before C emission', () => {
  const result = compileSource(
    `export function main(): void {
  const value = 42 as number
  const label = 'answer' as string
  const chained = label as unknown as string
  const record = { kind: 'ready' as const, value }
  console.log(label, chained, record.value)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /const double value = 42;/)
  assert.match(result.code, /const char \*label = "answer";/)
  assert.match(result.code, /const char \*chained = label;/)
  assert.match(result.code, /inox_object_init_known\(record, 1, inox_number_value\(value\)\)/)
})

test('uses TypeScript as expression object metadata for field access', () => {
  const result = compileSource(
    `type Base = {
  value: string
}

type Exact = {
  exact: string
}

function read(base: Base): string {
  const exact = base as Exact
  return exact.exact
}

export function main(): void {
  console.log(read({ exact: 'fine' } as Exact))
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /inox_object_get_known\(exact, 0, &inox_value_\d+\)/)
  assert.match(result.code, /inox_string\* inox_log_string_\d+ = \(inox_string\*\)inox_value_\d+\.as\.ref;/)
})

test('uses TypeScript as expression metadata for nullable string fields', () => {
  const result = compileSource(
    `type CapabilityNode = {
  type?: string | null
}

type CapabilityArrayDeclarationNode = {
  loweredArrayMethodName?: string | null
}

function methodName(expression: CapabilityNode): string | null {
  const declaration = expression as CapabilityArrayDeclarationNode
  const method = declaration.loweredArrayMethodName

  if (method === 'filter' || method === 'map') {
    return method
  }

  return null
}

export function main(): void {
  console.log(methodName({ loweredArrayMethodName: 'map' } as CapabilityArrayDeclarationNode) ?? 'none')
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /inox_object_get_known\(declaration, 0, &inox_value_\d+\)/)
  assert.match(result.code, /method = inox_value_\d+;/)
  assert.match(result.code, /inox_return = method;/)
  assert.doesNotMatch(result.code, /unknownas/)
})


test('treats double equality as C equality aliases', () => {
  const source = `export function main(): void {
  const same = 1 == 1
  const different = 'Ada' != 'Grace'
  console.log(same, different)
}
`
  const c = compileSource(source, {
    target: 'c'
  })

  assert.match(c.code, /#include <string\.h>/)
  assert.match(c.code, /const double same = \(1 == 1\);/)
  assert.match(c.code, /const double different = \(!\(3 == 5 && memcmp\("Ada", "Grace", 3\) == 0\)\);/)
})


test('lowers C object literals to runtime calls', () => {
  const result = compileSource(
    `export function main(): void {
  const user = { name: 'Ada', score: 42, active: true }
  console.log('ok')
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /#include "inox\/object\.h"/)
  assert.match(result.code, /static const inox_field_info inox_shape_user_\d+_fields\[\]/)
  assert.match(result.code, /inox_value user = inox_undefined_value\(\);/)
  assert.match(result.code, /inox_object_new\(&inox_default_allocator/)
  assert.match(result.code, /inox_string_from_literal\(&inox_default_allocator, "Ada", 3/)
  assert.match(result.code, /inox_object_init_known\(user, 1, inox_number_value\(42\)\)/)
  assert.match(result.code, /inox_object_init_known\(user, 2, inox_bool_value\(true\)\)/)
  assert.match(
    result.code,
    /inox_cleanup:\n {2}inox_release\(inox_value_\d+\);\n {2}inox_release\(user\);\n {2}return;/
  )
})


test('boxes prepared scalar expressions in C object literals', () => {
  const result = compileSource(
    `type Meta = {
  optional: boolean
  total: number
}

function meta(node: object): Meta {
  const min = 1
  const max = 3
  return { optional: node.optional === true, total: min + max }
}

export function main(): void {
  const result = meta({ optional: true })
  console.log(result.optional, result.total)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /inox_object_get\(node, "optional", 8, &inox_value_\d+\)/)
  assert.match(result.code, /inox_object_init_known\(inox_object_\d+, 0, inox_bool_value\(\(\(inox_value_\d+\.tag == INOX_TAG_BOOL && inox_value_\d+\.as\.boolean == true\)\) != 0\)\)/)
  assert.match(result.code, /inox_object_init_known\(inox_object_\d+, 1, inox_number_value\(\(min \+ max\)\)\)/)
})


test('lowers C collection constructors in object literal value fields', () => {
  const result = compileSource(
    `type Bag = {
  scores: Map<string, number>
  names: Set<string>
}

export function main(): void {
  const bag: Bag = { scores: new Map(), names: new Set() }
  bag.scores.set('Ada', 7)
  bag.names.add('Ada')
  console.log(bag.scores.size, bag.names.has('Ada'))
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /inox_map_new\(&inox_default_allocator, &inox_map_\d+\)/)
  assert.match(result.code, /inox_set_new\(&inox_default_allocator, &inox_set_\d+\)/)
  assert.match(result.code, /inox_object_init_known\(bag, 0, inox_map_\d+\)/)
  assert.match(result.code, /inox_object_init_known\(bag, 1, inox_set_\d+\)/)
  assert.match(result.code, /inox_map_set\(inox_value_\d+, inox_value_\d+, inox_number_value\(7\)\)/)
  assert.match(result.code, /inox_set_add\(inox_value_\d+, inox_value_\d+\)/)
})


test('lowers synthetic C main wrapper through cleanup when runtime values are owned', () => {
  const result = compileSource(
    `const user = { name: 'Ada' }
console.log('ok')
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /int main\(void\) \{/)
  assert.match(
    result.code,
    /if \(inox_object_new\(&inox_default_allocator, &inox_shape_user_\d+, &user\) != INOX_OK\)\s+goto inox_cleanup;/
  )
  assert.match(
    result.code,
    /inox_cleanup:\n {2}inox_release\(inox_value_\d+\);\n {2}inox_release\(user\);\n {2}return \(int\)inox_return;/
  )
})


test('lowers C void return through cleanup when runtime values are owned', () => {
  const result = compileSource(
    `export function main(): void {
  const user = { name: 'Ada' }
  return
  console.log('unreachable')
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /goto inox_cleanup;/)
  assert.match(
    result.code,
    /inox_cleanup:\n {2}inox_release\(inox_value_\d+\);\n {2}inox_release\(user\);\n {2}return;/
  )
})


test('lowers C number returns through cleanup when runtime values are owned', () => {
  const result = compileSource(
    `function getScore(): number {
  const user = { score: 42 }
  const score = user.score
  return score
}

export function main(): void {
  console.log(getScore())
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /double getScore\(void\) \{\n {2}double inox_return = 0;/)
  assert.match(result.code, /inox_return = score;\n {2}goto inox_cleanup;/)
  assert.match(
    result.code,
    /inox_cleanup:\n {2}inox_release\(inox_field_\d+\);\n {2}inox_release\(user\);\n {2}return inox_return;/
  )
})


test('lowers known C object field access to runtime calls', () => {
  const result = compileSource(
    `export function main(): void {
  const user = { score: 42, active: true }
  const score = user.score
  const active = user.active
  console.log(score, active)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /inox_object_get_known\(user, 0, &inox_field_\d+\)/)
  assert.match(result.code, /const double score = inox_field_\d+\.as\.number;/)
  assert.match(result.code, /inox_object_get_known\(user, 1, &inox_field_\d+\)/)
  assert.match(result.code, /const double active = inox_field_\d+\.as\.boolean \? 1 : 0;/)
})


test('lowers C object expression field access through known shape runtime reads', () => {
  const result = compileSource(
    `type Pair = {
  score: number
  active: boolean
}

function pair(): Pair {
  return { score: 42, active: true }
}

export function main(): void {
  const score = pair().score
  const active = pair().active
  console.log(score, active)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /inox_value_\d+ = pair\(\);/)
  assert.match(result.code, /inox_object_get_known\(inox_value_\d+, 0, &inox_value_\d+\)/)
  assert.match(result.code, /const double score = inox_value_\d+\.as\.number;/)
  assert.match(result.code, /inox_object_get_known\(inox_value_\d+, 1, &inox_value_\d+\)/)
  assert.match(result.code, /const double active = \(inox_value_\d+\.as\.boolean \? 1 : 0\);/)
})


test('lowers C dynamic object field access through runtime lookup', () => {
  const result = compileSource(
    `type Child = {
  value: number
}

function read(extra: object): Child {
  return extra.child
}

export function main(): void {
  const child = read({ child: { value: 42 } })
  console.log(child.value)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /inox_object_get\(extra, "child", 5, &inox_value_\d+\)/)
  assert.match(result.code, /inox_object_get_known\(child, 0, &inox_log_value_\d+\)/)
})


test('lowers C dynamic object scalar field access through runtime lookup', () => {
  const result = compileSource(
    `function read(extra: object): void {
  const score: number = extra.score
  const active: boolean = extra['active']
  console.log(score, active)
}

export function main(): void {
  read({ score: 42, active: true })
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /inox_object_get\(extra, "score", 5, &inox_value_\d+\)/)
  assert.match(result.code, /inox_value_\d+\.tag != INOX_TAG_NUMBER/)
  assert.match(result.code, /const double score = inox_value_\d+\.as\.number;/)
  assert.match(result.code, /inox_object_get\(extra, "active", 6, &inox_value_\d+\)/)
  assert.match(result.code, /inox_value_\d+\.tag != INOX_TAG_BOOL/)
  assert.match(result.code, /const double active = \(inox_value_\d+\.as\.boolean \? 1 : 0\);/)
})


test('lowers C nested dynamic object scalar field access through runtime lookup', () => {
  const result = compileSource(
    `function read(node: object): void {
  const line: number = node.loc.line
  const active: boolean = node.meta.active
  console.log(line, active)
}

export function main(): void {
  read({ loc: { line: 7 }, meta: { active: true } })
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /inox_object_get\(node, "loc", 3, &inox_value_\d+\)/)
  assert.match(result.code, /inox_object_get\(inox_value_\d+, "line", 4, &inox_value_\d+\)/)
  assert.match(result.code, /inox_value_\d+\.tag != INOX_TAG_NUMBER/)
  assert.match(result.code, /inox_object_get\(node, "meta", 4, &inox_value_\d+\)/)
  assert.match(result.code, /inox_object_get\(inox_value_\d+, "active", 6, &inox_value_\d+\)/)
  assert.match(result.code, /inox_value_\d+\.tag != INOX_TAG_BOOL/)
  assert.match(result.code, /const double active = \(inox_value_\d+\.as\.boolean \? 1 : 0\);/)
})


test('lowers C dynamic object field truthiness conditions through runtime lookup', () => {
  const result = compileSource(
    `function read(extra: object): void {
  if (extra.name) {
    console.log(1)
  }

  if (extra['active']) {
    console.log(2)
  }
}

export function main(): void {
  read({ name: 'Ada', active: true })
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /inox_object_get\(extra, "name", 4, &inox_value_\d+\)/)
  assert.match(result.code, /if \(inox_value_truthy\(inox_value_\d+\) \? 1 : 0\) \{/)
  assert.match(result.code, /inox_object_get\(extra, "active", 6, &inox_value_\d+\)/)
})

test('lowers C dynamic object field logical not through runtime truthiness', () => {
  const result = compileSource(
    `function read(extra: object): void {
  if (!extra.name) {
    console.log(1)
  }

  const inactive = !extra['active']
  console.log(inactive)
}

export function main(): void {
  read({ name: '', active: false })
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /inox_object_get\(extra, "name", 4, &inox_value_\d+\)/)
  assert.match(result.code, /if \(!\(inox_value_truthy\(inox_value_\d+\) \? 1 : 0\)\) \{/)
  assert.match(result.code, /inox_object_get\(extra, "active", 6, &inox_value_\d+\)/)
  assert.match(result.code, /const double inactive = \(!\(inox_value_truthy\(inox_value_\d+\) \? 1 : 0\)\);/)
})


test('lowers C dynamic object field assignments through runtime lookup', () => {
  const result = compileSource(
    `type Child = {
  value: number
}

function update(extra: object): void {
  extra.child = { value: 7 }
}

function read(extra: object): Child {
  return extra.child
}

export function main(): void {
  const extra = { child: { value: 1 } }
  update(extra)
  const child = read(extra)
  console.log(child.value)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /inox_object_set\(extra, "child", 5, inox_(?:value|object)_\d+\)/)
  assert.match(result.code, /inox_object_get\(extra, "child", 5, &inox_value_\d+\)/)
})

test('lowers C nested dynamic object field assignments through runtime lookup', () => {
  const result = compileSource(
    `type Child = {
  name: string
}

function update(extra: object): void {
  extra.child.name = "next"
}

function read(extra: object): string {
  return extra.child.name
}

export function main(): void {
  const extra = { child: { name: "first" } }
  update(extra)
  console.log(read(extra))
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /inox_object_get\(extra, "child", 5, &inox_value_\d+\)/)
  assert.match(result.code, /inox_object_set\(inox_value_\d+, "name", 4, inox_value_\d+\)/)
})

test('lowers C unknown receiver field assignments through runtime lookup', () => {
  const result = compileSource(
    `function update(value: unknown): void {
  value.name = "next"
}

function read(value: unknown): string {
  return value.name
}

export function main(): void {
  const extra = { name: "first" }
  update(extra)
  console.log(read(extra))
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /if \(value.tag != INOX_TAG_OBJECT \|\| value.as.ref == 0\)/)
  assert.match(result.code, /inox_object_set\(value, "name", 4, inox_value_\d+\)/)
  assert.match(result.code, /inox_object_get\(value, "name", 4, &inox_value_\d+\)/)
})

test('lowers C unknown call results as runtime value locals', () => {
  const result = compileSource(
    `function passthrough(value: unknown): unknown {
  return value
}

export function main(): void {
  const value = passthrough({ count: 1 })
  value.count = 2
  console.log(value.count)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /inox_value passthrough\(inox_value value\) \{/)
  assert.match(result.code, /inox_value inox_return = inox_undefined_value\(\);/)
  assert.match(result.code, /inox_value value = inox_undefined_value\(\);/)
  assert.match(result.code, /inox_value_\d+ = passthrough\(inox_object_\d+\);/)
  assert.match(result.code, /value = inox_value_\d+;/)
  assert.match(result.code, /inox_retain\(value\);/)
  assert.match(result.code, /inox_object_set\(value, "count", 5, inox_number_value\(2\)\)/)
})


test('lowers C dynamic runtime value comparisons against string literals', () => {
  const result = compileSource(
    `function isReference(node: object): boolean {
  return node.type === 'Reference'
}

function isNotReference(node: object): boolean {
  return node.type !== 'Reference'
}

export function main(): void {
  console.log(isReference({ type: 'Reference' }), isNotReference({ type: 1 }))
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /inox_object_get\(node, "type", 4, &inox_value_\d+\)/)
  assert.match(result.code, /inox_string_cmp_value_\d+\.tag == INOX_TAG_STRING/)
  assert.match(result.code, /memcmp\(\(\(inox_string\*\)inox_string_cmp_value_\d+\.as\.ref\)->bytes, "Reference", 9\)/)
})


test('lowers C dynamic object field null comparisons through runtime lookup', () => {
  const result = compileSource(
    `function hasInit(node: object): boolean {
  return node.init != null
}

function missingInit(node: object): boolean {
  return null == node['init']
}

export function main(): void {
  console.log(hasInit({ init: { type: 'StringLiteral' } }), hasInit({ init: null }), missingInit({ init: null }))
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /inox_object_get\(node, "init", 4, &inox_value_\d+\)/)
  assert.match(result.code, /!\(inox_value_\d+\.tag == INOX_TAG_NULL \|\| inox_value_\d+\.tag == INOX_TAG_UNDEFINED\)/)
  assert.match(result.code, /inox_value_\d+\.tag == INOX_TAG_NULL \|\| inox_value_\d+\.tag == INOX_TAG_UNDEFINED/)
})


test('lowers C dynamic object field boolean literal comparisons through runtime lookup', () => {
  const result = compileSource(
    `function isOptional(node: object): boolean {
  return node.optional === true
}

function isNotReadonly(node: object): boolean {
  return node['readonly'] !== false
}

export function main(): void {
  console.log(isOptional({ optional: true }), isOptional({ optional: 1 }), isNotReadonly({ readonly: false }))
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /inox_object_get\(node, "optional", 8, &inox_value_\d+\)/)
  assert.match(result.code, /inox_value_\d+\.tag == INOX_TAG_BOOL && inox_value_\d+\.as\.boolean == true/)
  assert.match(result.code, /inox_object_get\(node, "readonly", 8, &inox_value_\d+\)/)
  assert.match(result.code, /!\(inox_value_\d+\.tag == INOX_TAG_BOOL && inox_value_\d+\.as\.boolean == false\)/)
})


test('lowers C dynamic object array length through runtime lookup', () => {
  const result = compileSource(
    `function hasOnePath(node: object): boolean {
  return node.path.length === 1
}

function hasFields(node: object): boolean {
  return node['fields'].length > 0
}

export function main(): void {
  console.log(hasOnePath({ path: ['type'] }), hasFields({ fields: [1, 2] }))
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /inox_object_get\(node, "path", 4, &inox_value_\d+\)/)
  assert.match(result.code, /inox_array_len\(inox_value_\d+, &inox_array_len_\d+\)/)
  assert.match(result.code, /inox_object_get\(node, "fields", 6, &inox_value_\d+\)/)
  assert.match(result.code, /inox_array_len\(inox_value_\d+, &inox_array_len_\d+\)/)
})


test('lowers C dynamic object array index null comparisons through runtime lookup', () => {
  const result = compileSource(
    `function hasFirst(node: object): boolean {
  return node.args[0] != null
}

export function main(): void {
  console.log(hasFirst({ args: [{ type: 'Literal' }] }), hasFirst({ args: [] }))
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /inox_object_get\(node, "args", 4, &inox_array_value_\d+\)/)
  assert.match(result.code, /inox_array_get\(inox_array_value_\d+, 0, &inox_value_\d+\)/)
  assert.match(result.code, /inox_array_status_\d+ == INOX_ERR_FIELD/)
  assert.match(result.code, /inox_value_\d+ = inox_undefined_value\(\);/)
  assert.match(result.code, /!\(inox_value_\d+\.tag == INOX_TAG_NULL \|\| inox_value_\d+\.tag == INOX_TAG_UNDEFINED\)/)
})


test('lowers C dynamic object array item field comparisons through runtime lookup', () => {
  const result = compileSource(
    `function isLiteral(node: object): boolean {
  if (node.args[0] != null) {
    return node.args[0].type === 'Literal'
  }

  return false
}

export function main(): void {
  console.log(isLiteral({ args: [{ type: 'Literal' }] }), isLiteral({ args: [] }))
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /inox_object_get\(node, "args", 4, &inox_array_value_\d+\)/)
  assert.match(result.code, /inox_array_get\(inox_array_value_\d+, 0, &inox_value_\d+\)/)
  assert.match(result.code, /inox_object_get\(inox_value_\d+, "type", 4, &inox_value_\d+\)/)
  assert.match(result.code, /memcmp\(\(\(inox_string\*\)inox_string_cmp_value_\d+\.as\.ref\)->bytes, "Literal", 7\)/)
})


test('lowers C dynamic object array index variable declarations through runtime lookup', () => {
  const result = compileSource(
    `function isLiteral(node: object, index: number): boolean {
  const arg = node.args[index]
  if (arg != null) {
    return arg.type === 'Literal'
  }

  return false
}

export function main(): void {
  console.log(
    isLiteral({ args: [{ type: 'Literal' }] }, 0),
    isLiteral({ args: [{ type: 'Other' }] }, 0),
    isLiteral({ args: [] }, 0)
  )
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /inox_object_get\(node, "args", 4, &inox_(?:array_)?value_\d+\)/)
  assert.match(result.code, /inox_array_get\(inox_(?:array_)?value_\d+, \(size_t\)\(index\), &inox_value_\d+\)/)
  assert.match(result.code, /arg = inox_value_\d+;/)
  assert.match(result.code, /!\(arg\.tag == INOX_TAG_NULL \|\| arg\.tag == INOX_TAG_UNDEFINED\)/)
  assert.match(result.code, /inox_object_get\(arg, "type", 4, &inox_value_\d+\)/)
  assert.match(result.code, /memcmp\(\(\(inox_string\*\)inox_string_cmp_value_\d+\.as\.ref\)->bytes, "Literal", 7\)/)
})

test('lowers C for of over dynamic object array fields', () => {
  const result = compileSource(
    `function countHits(node: object): number {
  let count = 0

  for (const item of node.items) {
    if (item.kind === 'hit') {
      count = count + 1
    }
  }

  return count
}

export function main(): void {
  console.log(countHits({ items: [{ kind: 'hit' }, { kind: 'miss' }] }))
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /inox_object_get\(node, "items", 5, &inox_value_\d+\)/)
  assert.match(result.code, /inox_array_len\(inox_value_\d+, &inox_for_length_\d+\)/)
  assert.match(result.code, /inox_array_get\(inox_value_\d+, inox_for_index_\d+, &inox_for_value_\d+\)/)
  assert.match(result.code, /inox_value item = inox_for_value_\d+;/)
  assert.match(result.code, /inox_object_get\(item, "kind", 4, &inox_value_\d+\)/)
})

test('lowers C dynamic runtime array index assignments through runtime set', () => {
  const result = compileSource(
    `export function main(): void {
  const values = [1, 2, 3]
  const index = 1
  values[index] = 7
  const lines = ["if", "}"]
  lines[lines.length - 1] = "} else {"
  console.log(values[1], lines[1])
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /inox_array_set\(values, \(size_t\)\(index\), inox_number_value\(7\)\)/)
  assert.match(result.code, /inox_array_set\(lines, \(size_t\)\(\(2 - 1\)\), inox_value_\d+\)/)
})


test('lowers known numeric object fields as runtime values in object assignments', () => {
  const result = compileSource(
    `type Point = {
  x: number
  y: number
  active: boolean
}

export function main(): void {
  const source: Point = { x: 1, y: 2, active: true }
  const target: Point = { x: 0, y: 0, active: false }
  target.x = source.x
  target.active = source.active
  console.log(target.x, target.active)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /inox_object_get_known\(source, 0, &inox_value_\d+\)/)
  assert.match(result.code, /inox_object_set_known\(target, 0, inox_value_\d+\)/)
  assert.match(result.code, /inox_object_get_known\(source, 2, &inox_value_\d+\)/)
  assert.match(result.code, /inox_object_set_known\(target, 2, inox_value_\d+\)/)
})


test('preserves object shapes for typed runtime array index locals', () => {
  const result = compileSource(
    `type DiagnosticLike = {
  file?: string
  line: number
  column: number
}

export function main(): void {
  const diagnostics: DiagnosticLike[] = [{ line: 3, column: 9, file: 'input.ts' }]
  const index = 0
  const item = diagnostics[index]
  const total = item.line + item.column
  console.log(total)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /inox_array_get\(diagnostics, \(size_t\)\(index\), &inox_value_\d+\)/)
  assert.match(result.code, /item = inox_value_\d+;/)
  assert.match(result.code, /inox_object_get_known\(item, 1, &inox_expr_value_\d+\)/)
  assert.match(result.code, /inox_object_get_known\(item, 2, &inox_expr_value_\d+\)/)
  assert.match(result.code, /const double total = \(inox_expr_value_\d+\.as\.number \+ inox_expr_value_\d+\.as\.number\);/)
})


test('lowers known C string object field access to runtime strings', () => {
  const result = compileSource(
    `export function main(): void {
  const user = { name: 'Ada', score: 42 }
  const name = user.name
  console.log(name)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /inox_object_get_known\(user, 0, &inox_field_\d+\)/)
  assert.match(
    result.code,
    /if \(inox_field_\d+\.tag != INOX_TAG_STRING \|\| inox_field_\d+\.as\.ref == 0\)\s+goto inox_cleanup;/
  )
  assert.match(result.code, /const inox_string \*name = \(inox_string \*\)inox_field_\d+\.as\.ref;/)
  assert.match(result.code, /printf\("%\.\*s\\n", \(int\)name->len, name->bytes\);/)
})


test('lowers known C object field assignments to runtime calls', () => {
  const result = compileSource(
    `export function main(): void {
  const user = { score: 1, active: false, name: 'Ada' }
  user.score = 42
  user.active = true
  user.name = 'Grace'
  const score = user.score
  const active = user.active
  const name = user.name
  console.log(score, active, name)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /inox_object_set_known\(user, 0, inox_number_value\(42\)\)/)
  assert.match(result.code, /inox_object_set_known\(user, 1, inox_bool_value\(true\)\)/)
  assert.match(result.code, /inox_string_from_literal\(&inox_default_allocator, "Grace", 5/)
  assert.match(result.code, /inox_object_set_known\(user, 2, inox_value_\d+\)/)
  assert.match(
    result.code,
    /printf\("%g %g %\.\*s\\n", \(\(double\)score\), \(\(double\)active\), \(int\)name->len, name->bytes\);/
  )
})


test('lowers C string index object field reads through runtime lookup', () => {
  const result = compileSource(
    `export function main(): void {
  const user = { score: 42, active: true, name: 'Ada' }
  const score = user['score']
  const active = user['active']
  const name = user['name']
  console.log(score, active, name)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /inox_object_get\(user, "score", 5, &inox_field_\d+\)/)
  assert.match(result.code, /const double score = inox_field_\d+\.as\.number;/)
  assert.match(result.code, /inox_object_get\(user, "active", 6, &inox_field_\d+\)/)
  assert.match(result.code, /const double active = inox_field_\d+\.as\.boolean \? 1 : 0;/)
  assert.match(result.code, /inox_object_get\(user, "name", 4, &inox_field_\d+\)/)
  assert.match(result.code, /const inox_string \*name = \(inox_string \*\)inox_field_\d+\.as\.ref;/)
  assert.match(
    result.code,
    /printf\("%g %g %\.\*s\\n", \(\(double\)score\), \(\(double\)active\), \(int\)name->len, name->bytes\);/
  )
})


test('lowers C string index object field assignments through runtime lookup', () => {
  const result = compileSource(
    `export function main(): void {
  const user = { score: 1, active: false, name: 'Ada' }
  user['score'] = 42
  user['active'] = true
  user['name'] = 'Grace'
  const score = user['score']
  const active = user['active']
  const name = user['name']
  console.log(score, active, name)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /inox_object_set\(user, "score", 5, inox_number_value\(42\)\)/)
  assert.match(result.code, /inox_object_set\(user, "active", 6, inox_bool_value\(true\)\)/)
  assert.match(result.code, /inox_string_from_literal\(&inox_default_allocator, "Grace", 5/)
  assert.match(result.code, /inox_object_set\(user, "name", 4, inox_value_\d+\)/)
  assert.match(
    result.code,
    /printf\("%g %g %\.\*s\\n", \(\(double\)score\), \(\(double\)active\), \(int\)name->len, name->bytes\);/
  )
})


test('propagates C runtime strings through local declarations', () => {
  const result = compileSource(
    `export function main(): void {
  const user = { name: 'Ada' }
  const name = user.name
  const again = name
  console.log(again)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /const inox_string \*name = \(inox_string \*\)inox_field_\d+\.as\.ref;/)
  assert.match(result.code, /const inox_string \*again = name;/)
  assert.match(result.code, /printf\("%\.\*s\\n", \(int\)again->len, again->bytes\);/)
})


test('lowers C runtime string local assignments from dynamic object fields', () => {
  const result = compileSource(
    `function readType(symbol: object): string {
  let valueType = 'unknown'
  valueType = symbol.valueType
  return valueType
}

export function main(): void {
  console.log(readType({ valueType: 'number' }))
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /inox_string_from_literal\(&inox_default_allocator, "unknown", 7, &inox_value_\d+\)/)
  assert.match(result.code, /inox_object_get\(symbol, "valueType", 9, &inox_value_\d+\)/)
  assert.match(result.code, /inox_value_\d+\.tag != INOX_TAG_STRING \|\| inox_value_\d+\.as\.ref == 0/)
  assert.match(result.code, /inox_value valueType_value_\d+ = inox_undefined_value\(\);/)
  assert.match(
    result.code,
    /inox_object_get\(symbol, "valueType", 9, &inox_value_\d+\)[\s\S]*inox_retain\(inox_value_\d+\);\n  inox_release\(valueType_value_\d+\);\n  valueType_value_\d+ = inox_undefined_value\(\);\n  valueType_value_\d+ = inox_value_\d+;/
  )
  assert.match(result.code, /valueType = \(inox_string\*\)valueType_value_\d+\.as\.ref;/)
  assert.doesNotMatch(result.code, /valueType = \(inox_string\*\)inox_value_\d+\.as\.ref;/)
  assert.match(result.code, /inox_string\* inox_log_string_\d+ = \(inox_string\*\)inox_value_\d+\.as\.ref;/)
  assert.match(result.code, /printf\("%\.\*s\\n", \(int\)inox_log_string_\d+->len, inox_log_string_\d+->bytes\);/)
})


test('lowers explicitly typed C runtime string declarations from dynamic object fields', () => {
  const result = compileSource(
    `function readType(symbol: object): string {
  const valueType: string = symbol.valueType
  return valueType
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /inox_object_get\(symbol, "valueType", 9, &inox_value_\d+\)/)
  assert.match(result.code, /const inox_string\* valueType = \(inox_string\*\)valueType_value_\d+\.as\.ref;/)
  assert.doesNotMatch(result.code, /double valueType/)
})


test('lowers C runtime string parameters', () => {
  const result = compileSource(
    `function greet(name: string): void {
  console.log(name)
}

function echo(name: string): string {
  return name
}

export function main(): void {
  const user = { name: 'Ada' }
  greet('Ada')
  greet(user.name)
  console.log(echo(user.name))
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /void greet\(inox_value inox_param_name\);/)
  assert.match(result.code, /inox_value echo\(inox_value inox_param_name\);/)
  assert.match(
    result.code,
    /if \(inox_param_name\.tag != INOX_TAG_STRING \|\| inox_param_name\.as\.ref == 0\)\s+goto inox_cleanup;/
  )
  assert.match(result.code, /inox_string \*name = \(inox_string \*\)inox_param_name\.as\.ref;/)
  assert.match(result.code, /greet\(inox_value_\d+\);/)
  assert.match(result.code, /echo\(inox_value_\d+\)/)
})


test('prepares C string arguments for number-returning calls inside expressions', () => {
  const result = compileSource(
    `function length(name: string): number {
  return 3
}

export function main(): void {
  const user = { name: 'Ada' }
  const total = length('Ada') + length(user.name)
  console.log(length(user.name), total)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /double length\(inox_value inox_param_name\);/)
  assert.match(result.code, /inox_string_from_literal\(&inox_default_allocator, "Ada", 3, &inox_value_\d+\)/)
  assert.match(result.code, /inox_object_get_known\(user, 0, &inox_(?:expr_)?value_\d+\)/)
  assert.match(result.code, /const double total = \(length\(inox_value_\d+\) \+ length\(inox_value_\d+\)\);/)
  assert.match(result.code, /printf\("%g %g\\n", \(\(double\)length\(inox_value_\d+\)\), \(\(double\)total\)\);/)
})


test('lowers C string-returning functions to owned runtime values', () => {
  const result = compileSource(
    `function getName(): string {
  return 'Ada'
}

export function main(): void {
  const name = getName()
  console.log(name)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /inox_value getName\(void\);/)
  assert.match(result.code, /inox_value getName\(void\) \{\n {2}inox_value inox_return = inox_undefined_value\(\);/)
  assert.match(
    result.code,
    /inox_return = inox_value_\d+;\n {2}if \(inox_return\.tag != INOX_TAG_STRING \|\| inox_return\.as\.ref == 0\)\s+goto inox_cleanup;\n {2}inox_retain\(inox_return\);\n {2}goto inox_cleanup;/
  )
  assert.match(result.code, /return inox_return;/)
  assert.match(result.code, /inox_value inox_value_\d+ = inox_undefined_value\(\);/)
  assert.match(result.code, /inox_release\(inox_value_\d+\);\n {2}inox_value_\d+ = inox_undefined_value\(\);\n {2}inox_value_\d+ = getName\(\);/)
  assert.match(result.code, /const inox_string\s*\*\s*name = \(inox_string\*\)(?:inox_value_\d+|name_value_\d+)\.as\.ref;/)
  assert.match(result.code, /printf\("%\.\*s\\n", \(int\)name->len, name->bytes\);/)
})


test('lowers C runtime string field returns', () => {
  const result = compileSource(
    `function getName(): string {
  const user = { name: 'Ada' }
  return user.name
}

export function main(): void {
  const name = getName()
  console.log(name)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /inox_object_get_known\(user, 0, &inox_(?:expr_)?value_\d+\)/)
  assert.match(result.code, /inox_return = inox_value_\d+;/)
  assert.match(result.code, /return inox_return;/)
})

test('retains C nullable string returns before cleanup', () => {
  const result = compileSource(
    `function maybeName(): string | null {
  return 'Ada'
}

export function main(): void {
  console.log(maybeName() ?? '')
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /inox_return = inox_value_\d+;\n {2}if \(\n {4}inox_return\.tag != INOX_TAG_NULL && \(inox_return\.tag != INOX_TAG_STRING \|\| inox_return\.as\.ref == 0\)\n {2}\) \{\n {4}goto inox_cleanup;\n {2}\}\n {2}inox_retain\(inox_return\);\n {2}goto inox_cleanup;/
  )
})

test('lowers C runtime string index returns', () => {
  const result = compileSource(
    `function getObjectName(): string {
  const user = { name: 'Ada' }
  return user['name']
}

function getArrayName(): string {
  const values = ['Grace']
  return values[0]
}

export function main(): void {
  console.log(getObjectName(), getArrayName())
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /inox_object_get\(user, "name", 4, &inox_value_\d+\)/)
  assert.match(result.code, /inox_array_get\(values, 0, &inox_value_\d+\)/)
  assert.match(result.code, /inox_value getObjectName\(void\);/)
  assert.match(result.code, /inox_value getArrayName\(void\);/)
  assert.match(result.code, /printf\("%\.\*s %\.\*s\\n"/)
})


test('lowers direct C console.log for string-returning calls', () => {
  const result = compileSource(
    `function getName(): string {
  return 'Ada'
}

export function main(): void {
  console.log(getName())
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /inox_value inox_value_\d+ = inox_undefined_value\(\);/)
  assert.match(result.code, /inox_value_\d+ = getName\(\);/)
  assert.match(result.code, /inox_string \*inox_log_string_\d+ = \(inox_string \*\)inox_value_\d+\.as\.ref;/)
  assert.match(result.code, /printf\("%\.\*s\\n", \(int\)inox_log_string_\d+->len, inox_log_string_\d+->bytes\);/)
})


test('lowers C runtime string concatenation', () => {
  const result = compileSource(
    `type User = {
  name: string
}

function getName(): string {
  return 'Grace'
}

export function main(): void {
  const user: User = { name: 'Ada' }
  const name = user.name
  const message = name + ' ' + getName() + '!'
  console.log(message)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /inox_string_concat_parts\(&inox_default_allocator, name->bytes, name->len, " ", 1, &inox_value_\d+\)/
  )
  assert.match(
    result.code,
    /inox_string_concat_parts\(&inox_default_allocator, inox_cmp_string_\d+->bytes, inox_cmp_string_\d+->len, inox_cmp_string_\d+->bytes, inox_cmp_string_\d+->len, &inox_value_\d+\)/
  )
  assert.match(
    result.code,
    /inox_string_concat_parts\(&inox_default_allocator, inox_cmp_string_\d+->bytes, inox_cmp_string_\d+->len, "!", 1, &inox_value_\d+\)/
  )
  assert.match(result.code, /const inox_string\s*\*\s*message = \(inox_string\*\)(?:inox_value_\d+|message_value_\d+)\.as\.ref;/)
  assert.match(result.code, /printf\("%\.\*s\\n", \(int\)message->len, message->bytes\);/)
})


test('rejects unsupported C non-equality string binary expressions with a stable diagnostic', () => {
  assertDiagnostic(
    `function getName(): string {
  return 'Ada'
}

export function main(): void {
  const same = getName() < 'Ada'
  console.log(same)
}
`,
    'INOX_C_STRING_EXPR',
    {
      target: 'c'
    }
  )
})


test('lowers C string equality comparisons by content', () => {
  const result = compileSource(
    `type User = {
  name: string
}

function getName(): string {
  return 'Ada'
}

export function main(): void {
  const user: User = { name: 'Ada' }
  const values = ['Ada', 'Grace']
  const name = 'Ada'
  const sameLocal = name === 'Ada'
  const sameRuntime = user.name === values[0]
  const differentCall = getName() !== values[1]
  console.log(sameLocal, sameRuntime, differentCall)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /#include <string\.h>/)
  assert.match(result.code, /const char \*name = "Ada";/)
  assert.match(
    result.code,
    /const double sameLocal = \(strlen\(name\) == 3 && memcmp\(name, "Ada", strlen\(name\)\) == 0\);/
  )
  assert.match(result.code, /inox_object_get_known\(user, 0, &inox_(?:expr_)?value_\d+\)/)
  assert.match(result.code, /inox_array_get\(values, 0, &inox_value_\d+\)/)
  assert.match(
    result.code,
    /const double sameRuntime = \(inox_cmp_string_\d+->len == inox_cmp_string_\d+->len && memcmp\(inox_cmp_string_\d+->bytes, inox_cmp_string_\d+->bytes, inox_cmp_string_\d+->len\) == 0\);/
  )
  assert.match(
    result.code,
    /const double differentCall = \(!\(inox_cmp_string_\d+->len == inox_cmp_string_\d+->len && memcmp\(inox_cmp_string_\d+->bytes, inox_cmp_string_\d+->bytes, inox_cmp_string_\d+->len\) == 0\)\);/
  )
})


test('lowers direct C console.log member and index expressions', () => {
  const result = compileSource(
    `export function main(): void {
  const user = { score: 42, active: true, name: 'Ada' }
  const values = [7, false, 'Grace']
  console.log(user.score, user.active, user.name, user['name'], values[0], values[1], values[2])
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /inox_object_get_known\(user, 0, &inox_log_value_\d+\)/)
  assert.match(result.code, /inox_object_get_known\(user, 2, &inox_log_value_\d+\)/)
  assert.match(result.code, /inox_object_get\(user, "name", 4, &inox_log_value_\d+\)/)
  assert.match(result.code, /inox_array_get\(values, 0, &inox_log_value_\d+\)/)
  assert.match(result.code, /inox_array_get\(values, 2, &inox_log_value_\d+\)/)
  assert.match(result.code, /\(\(double\)\(inox_log_value_\d+\.as\.boolean \? 1 : 0\)\)/)
  assert.match(result.code, /printf\("%g %g %\.\*s %\.\*s %g %g %\.\*s\\n"/)
})


test('lowers known C member and index reads inside scalar expressions', () => {
  const result = compileSource(
    `export function main(): void {
  const user = { score: 7, active: true }
  const values = [3, true]
  const total = user.score + values[0]
  const same = user.active === values[1]
  console.log(total, same)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /inox_object_get_known\(user, 0, &inox_expr_value_\d+\)/)
  assert.match(result.code, /inox_array_get\(values, 0, &inox_expr_value_\d+\)/)
  assert.match(
    result.code,
    /const double total = \(inox_expr_value_\d+\.as\.number \+ inox_expr_value_\d+\.as\.number\);/
  )
  assert.match(
    result.code,
    /const double same = \(\(inox_expr_value_\d+\.as\.boolean \? 1 : 0\) == \(inox_expr_value_\d+\.as\.boolean \? 1 : 0\)\);/
  )
})


test('compiles if else blocks to C', () => {
  const source = `export function main(): void {
  let text = 'no'

  if (1 < 2) {
    text = 'yes'
  } else {
    text = 'never'
  }

  console.log(text)
}
`
  const c = compileSource(source, {
    target: 'c'
  })

  assert.match(c.code, /if \(1 < 2\) \{/)
  assert.match(c.code, /inox_string_from_literal\(&inox_default_allocator, "yes", 3, &inox_value_\d+\)/)
  assert.match(c.code, /text = \(inox_string\*\)(?:inox_value_\d+|text_value_\d+)\.as\.ref;/)
})


test('compiles while loops to C', () => {
  const source = `export function main(): void {
  let index = 0
  let total = 0

  while (index < 4) {
    total = total + index
    index = index + 1
  }

  console.log(total)
}
`
  const c = compileSource(source, {
    target: 'c'
  })

  assert.match(c.code, /while \(index < 4\) \{/)
  assert.match(c.code, /total = \(total \+ index\);/)
})


test('prepares C string-argument calls in if while and switch conditions', () => {
  const result = compileSource(
    `function isReady(label: string): boolean {
  return true
}

function keepGoing(index: number, label: string): boolean {
  return index < 2
}

function choose(label: string): number {
  return 2
}

export function main(): void {
  let index = 0

  if (isReady('if')) {
    index = index + 1
  }

  while (keepGoing(index, 'while')) {
    index = index + 1
  }

  switch (choose('switch')) {
    case 2:
      index = index + 1
      break
    default:
      break
  }

  console.log(index)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /inox_string_from_literal\(&inox_default_allocator, "if", 2, &inox_value_\d+\) != INOX_OK[\s\S]*if \(isReady\(inox_value_\d+\)\) \{/
  )
  assert.match(
    result.code,
    /while \(1\) \{\n\s+inox_release\(inox_value_\d+\);\n\s+inox_value_\d+ = inox_undefined_value\(\);\n\s+if \(inox_string_from_literal\(&inox_default_allocator, "while", 5, &inox_value_\d+\) != INOX_OK\)\s+goto inox_cleanup;\n\s+if \(!\(keepGoing\(index, inox_value_\d+\)\)\) break;/
  )
  assert.match(
    result.code,
    /inox_string_from_literal\(&inox_default_allocator, "switch", 6, &inox_value_\d+\) != INOX_OK[\s\S]*switch \(\(int\)choose\(inox_value_\d+\)\) \{/
  )
})


test('prepares owned C runtime values before rewriting them inside loops', () => {
  const result = compileSource(
    `export function main(): void {
  let index = 0

  while (index < 2) {
    const user = { name: 'Ada' }
    console.log(user.name)
    index = index + 1
  }
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /while \(index < 2\) \{[\s\S]*inox_release\(user\);\n {4}user = inox_undefined_value\(\);\n {4}if \(inox_object_new/
  )
  assert.match(
    result.code,
    /inox_release\(inox_value_\d+\);\n {4}inox_value_\d+ = inox_undefined_value\(\);\n {4}if \(inox_string_from_literal/
  )
  assert.match(
    result.code,
    /inox_release\(inox_log_value_\d+\);\n {4}inox_log_value_\d+ = inox_undefined_value\(\);\n {4}if \(inox_object_get_known/
  )
})


test('compiles continue statements to C', () => {
  const source = `export function main(): void {
  let total = 0

  for (let index = 0; index < 5; index = index + 1) {
    if (index === 2) {
      continue
    }

    total = total + index
  }

  console.log(total)
}
`
  const c = compileSource(source, {
    target: 'c'
  })

  assert.match(c.code, /goto inox_continue_\d+;/)
  assert.match(c.code, /inox_continue_\d+:\s*;/)
})


test('lowers C string-returning for initializers into scoped loop blocks', () => {
  const result = compileSource(
    `function getName(): string {
  return 'Ada'
}

export function main(): void {
  let index = 0

  for (const name = getName(); index < 1; index = index + 1) {
    console.log(name)
  }
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /\{\n\s+inox_release\(inox_value_\d+\);\n\s+inox_value_\d+ = inox_undefined_value\(\);\n\s+inox_value_\d+ = getName\(\);/
  )
  assert.match(result.code, /const inox_string\s*\*\s*name = \(inox_string\*\)(?:inox_value_\d+|name_value_\d+)\.as\.ref;[\s\S]*for \(;;\) \{/)
  assert.match(result.code, /if \(!\(index < 1\)\) break;/)
  assert.doesNotMatch(
    result.code,
    /if \((inox_value_\d+)\.tag != INOX_TAG_STRING \|\| \1\.as\.ref == 0\)\s+goto inox_cleanup;\n\s+if \(\1\.tag != INOX_TAG_STRING \|\| \1\.as\.ref == 0\)\s+goto inox_cleanup;/
  )
})


test('checks explicit typed for of bindings in TypeScript source', () => {
  const source = `type User = {
  readonly id: number,
  name: string
}

export function main(): void {
  const users: string[] = ['Ada']

  for (const user: string of users) {
    console.log(user)
  }
}
`
  assert.doesNotThrow(() =>
    compileSource(source, {
      target: 'c'
    })
  )

  assertDiagnostic(
    `export function main(): void {
  const names = ['Ada']

  for (const value: number of names) {
    console.log(value)
  }
}
`,
    'INOX_TYPE_MISMATCH'
  )
})


test('preserves explicit local metadata for open node string scans', () => {
  const result = compileSource(
    `type AnyNode = {
  type?: string
  [key: string]: any
}

type Property = {
  key: string
  value?: object | null
}

type Param = {
  name: string
}

function findValue(expression: AnyNode, key: string): object | null {
  if (expression.properties == null) {
    return null
  }

  const properties: Property[] = expression.properties

  for (const property of properties) {
    if (property.key === key && property.value != null) {
      return property.value
    }
  }

  return null
}

function hasParam(expression: AnyNode, params: Param[]): boolean {
  if (expression.type === 'Reference' && expression.path.length === 1) {
    const path: string[] = expression.path

    for (const param of params) {
      if (param.name === path[0]) {
        return true
      }
    }
  }

  return false
}

export function main(): void {
  console.log(findValue({ properties: [{ key: 'name', value: {} }] }, 'name') != null)
  console.log(hasParam({ type: 'Reference', path: ['name'] }, [{ name: 'name' }]))
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /inox_object_get\(expression, "properties", 10, &inox_value_\d+\)/)
  assert.match(result.code, /inox_array_get\((?:properties|inox_value_\d+), inox_for_index_\d+, &inox_for_value_\d+\)/)
  assert.match(result.code, /memcmp\(inox_cmp_string_\d+->bytes, key->bytes, inox_cmp_string_\d+->len\) == 0/)
  assert.match(result.code, /inox_object_get\(expression, "path", 4, &inox_value_\d+\)/)
  assert.match(result.code, /memcmp\(inox_cmp_string_\d+->bytes, inox_cmp_string_\d+->bytes, inox_cmp_string_\d+->len\) == 0/)
})

test('preserves explicit local metadata for open node array entries', () => {
  const result = compileSource(
    `type ElementNode = {
  type?: string
  [key: string]: any
}

type EntryNode = {
  type?: string
  elements?: ElementNode[]
  [key: string]: any
}

type ExpressionNode = {
  elements?: EntryNode[]
  [key: string]: any
}

function countLiteralPairs(expression: ExpressionNode): number {
  if (expression.elements == null) {
    return 0
  }

  let count = 0
  const entries: EntryNode[] = expression.elements

  for (const entry of entries) {
    if (entry.type !== 'ArrayLiteral' || entry.elements == null || entry.elements.length !== 2) {
      continue
    }

    const entryElements: ElementNode[] = entry.elements
    const keyNode = entryElements[0]
    const valueNode = entryElements[1]

    if (keyNode.type === 'StringLiteral' && valueNode.type === 'StringLiteral') {
      count = count + 1
    }
  }

  return count
}

export function main(): void {
  console.log(countLiteralPairs({ elements: [{ type: 'ArrayLiteral', elements: [{ type: 'StringLiteral' }, { type: 'StringLiteral' }] }] }))
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /inox_array_get\((?:entries|inox_value_\d+), inox_for_index_\d+, &inox_for_value_\d+\)/)
  assert.match(result.code, /inox_array_get\((?:entryElements|inox_value_\d+), 0, &inox_value_\d+\)/)
  assert.match(result.code, /inox_array_get\((?:entryElements|inox_value_\d+), 1, &inox_value_\d+\)/)
})

test('preserves typed options objects for C emitter forwarding', () => {
  const result = compileSource(
    `type RandomOptions = {
  seed?: number
}

type CompileOptions = {
  random?: RandomOptions
  sourceRoot?: string
}

type CEmitOptions = {
  random?: RandomOptions
}

type Host = {
  root: string
}

type CModuleEmitOptions = {
  host: Host
  random?: RandomOptions
  sourceRoot?: string
}

function emitOne(options: CEmitOptions): string {
  if (options.random != null && options.random.seed != null) {
    return 'seeded'
  }

  return 'plain'
}

function emitModule(options: CModuleEmitOptions): string {
  if (options.sourceRoot != null) {
    return options.sourceRoot
  }

  return options.host.root
}

function compileOne(options: CompileOptions = {}): string {
  const emitOptions: CEmitOptions = options

  return emitOne(emitOptions)
}

function compileModule(host: Host, options: CompileOptions = {}): string {
  const emitOptions: CModuleEmitOptions = {
    host,
    random: options.random,
    sourceRoot: options.sourceRoot
  }

  return emitModule(emitOptions)
}

export function main(): void {
  console.log(compileOne({ random: { seed: 7 } }))
  console.log(compileModule({ root: '/src' }, { sourceRoot: '/project' }))
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /inox_object_init_known\(emitOptions, 0, host\)/)
  assert.match(result.code, /inox_object_init_known\(emitOptions, 1, inox_value_\d+\)/)
  assert.match(result.code, /inox_object_init_known\(emitOptions, 2, inox_value_\d+\)/)
})

test('preserves typed object-field array traversal metadata', () => {
  const result = compileSource(
    `type Param = {
  name: string
}

type FunctionType = {
  params: Param[]
}

type Wrapper = {
  functionType: FunctionType
}

function countNamed(wrapper: Wrapper, name: string): number {
  let count = 0
  const params: Param[] = wrapper.functionType.params

  for (const param of params) {
    if (param.name === name) {
      count = count + 1
    }
  }

  return count
}

export function main(): void {
  const functionType: FunctionType = { params: [{ name: 'a' }, { name: 'b' }] }
  const wrapper: Wrapper = { functionType }

  console.log(countNamed(wrapper, 'a'))
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /inox_object_get_known\(inox_value_\d+, 0, &inox_value_\d+\)/)
  assert.match(result.code, /inox_array_len\(params, &inox_for_length_\d+\)/)
  assert.match(result.code, /inox_array_get\(params, inox_for_index_\d+, &inox_for_value_\d+\)/)
})

test('preserves typed Map and Set option object forwarding', () => {
  const result = compileSource(
    `type ThrowOptions = {
  names?: Set<string> | null
  values?: Map<string, string[]> | null
}

function collect(options: ThrowOptions = {}): number {
  let count = 0

  if (options.names != null) {
    count = count + options.names.size
  }

  if (options.values != null) {
    count = count + options.values.size
  }

  return count
}

function infer(names: Set<string>, values: Map<string, string[]>): number {
  const options: ThrowOptions = {
    names,
    values
  }

  return collect(options)
}

export function main(): void {
  console.log(infer(new Set(['a']), new Map([['b', ['c']]])))
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /inox_object_init_known\(options, 0, names\)/)
  assert.match(result.code, /inox_object_init_known\(options, 1, values\)/)
})


test('rejects unsupported C for of iterables with a stable diagnostic', () => {
  assertDiagnostic(
    `export function main(): void {
  const user = { name: 'Ada' }
  for (const value of user) {
    console.log(value)
  }
}
`,
    'INOX_C_FOR_OF',
    {
      target: 'c'
    }
  )
})


test('compiles switch statements to C', () => {
  const source = `export function main(): void {
  const code = 2
  let text = 'none'

  switch (code) {
    case 1:
      text = 'one'
      break
    case 2:
      text = 'two'
      break
    default:
      text = 'other'
  }

  console.log(text)
}
`
  const c = compileSource(source, {
    target: 'c'
  })

  assert.match(c.code, /switch \(\(int\)code\) \{/)
  assert.match(c.code, /case \(int\)2: \{/)
  assert.match(c.code, /goto inox_break_\d+;/)
  assert.match(c.code, /inox_break_\d+:\s*;/)
})


test('rejects dynamic C switch case labels with a stable diagnostic', () => {
  const source = `function choose(label: string): number {
  return 1
}

export function main(): void {
  const code = 1

  switch (code) {
    case choose('one'):
      console.log('one')
      break
    default:
      console.log('other')
  }
}
`

  assertDiagnostic(source, 'INOX_C_SWITCH_CASE', {
    target: 'c'
  })
})


test('rejects var with a stable diagnostic code', () => {
  assert.throws(
    () => {
      compileSource('var value = 1', {
        target: 'c'
      })
    },
    (error) => {
      if (!(error instanceof CompileError)) {
        return false
      }

      assert.equal(error.diagnostics[0].code, 'INOX_NO_VAR')
      return true
    }
  )
})


test('allows assignment to let bindings', () => {
  const result = compileSource(
    `export function main(): void {
  let count = 1
  count = 2
  console.log(count)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /double count = 1;/)
  assert.match(result.code, /count = 2;/)
})


test('prepares C string-argument calls in scalar assignment statements', () => {
  const result = compileSource(
    `function nextIndex(index: number, label: string): number {
  return index + 1
}

export function main(): void {
  let index = 0
  index = nextIndex(index, 'step')
  console.log(index)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /inox_release\(inox_value_\d+\);\n {2}inox_value_\d+ = inox_undefined_value\(\);\n {2}if \(inox_string_from_literal\(&inox_default_allocator, "step", 4, &inox_value_\d+\) != INOX_OK\)\s+goto inox_cleanup;\n {2}index = nextIndex\(index, inox_value_\d+\);/
  )
})


test('returns checked HIR and target-neutral IR with simple value types', () => {
  const result = compileSource(
    `export function main(): void {
  const name = 'Ada'
  const count = 1
  console.log(name, count)
}
`,
    {
      target: 'c'
    }
  )
  const main = result.hir.body.find((item) => item.type === 'FunctionDeclaration')
  assert.ok(main)
  const [name, count] = main.body.filter((item: AnyNode) => item.type === 'VariableDeclaration')

  assert.equal(result.hir.type, 'HirProgram')
  assert.equal(name.valueType, 'string')
  assert.equal(count.valueType, 'number')
  assert.equal(result.ir.type, 'IrProgram')
  assert.equal(result.ir.version, 1)
  assert.deepEqual(result.ir.runtimeRequirements, [])
  assert.deepEqual(result.ir.topLevelItems, [
    {
      kind: 'function',
      index: 0,
      loc: {
        line: 1,
        column: 17
      }
    }
  ])
  assert.deepEqual(result.ir.functionDeclarations, [
    {
      name: 'main',
      exported: true,
      async: false,
      params: [],
      declaredReturnType: 'void',
      returnType: 'void',
      returnNullable: false,
      loc: {
        line: 1,
        column: 17
      }
    }
  ])
  assert.deepEqual(result.ir.syntaxFeatures, [])
  assert.deepEqual(result.ir.globalUsages, [])
  assert.deepEqual(result.ir.functionEffects, [
    {
      name: 'main',
      throws: false,
      throwValueTypes: []
    }
  ])
  assert.deepEqual(result.ir.body, result.hir.body)
})


test('drives C main wrappers from function declarations and top-level statements', () => {
  const functionSource = `export function main(): void {
  console.log('hello')
}
`
  const topLevelC = compileSource("console.log('hello')\n", {
    target: 'c'
  })
  const c = compileSource(functionSource, {
    target: 'c'
  })

  assert.match(c.code, /void inox_main\(void\) \{/)
  assert.doesNotMatch(c.code, /int main\(void\) \{[\s\S]*inox_main\(\);/)
  assert.match(topLevelC.code, /int main\(void\) \{[\s\S]*printf\("%s\\n", "hello"\);/)
  assert.doesNotMatch(
    emitCFromIr({
      ...c.ir,
      functionDeclarations: []
    }),
    /int main\(void\) \{\n {2}inox_main\(\);/
  )
})


test('drives C top-level emission from target-neutral IR top-level items', () => {
  const source = `const name = 'Ada'
console.log(name)
`
  const c = compileSource(source, {
    target: 'c'
  })
  const withoutTopLevelItems = {
    ...c.ir,
    topLevelItems: []
  }

  assert.deepEqual(
    c.ir.topLevelItems.map((item) => item.kind),
    ['statement', 'statement']
  )
  assert.match(c.code, /printf\("%s\\n", name\);/)
  assert.doesNotMatch(
    emitCFromIr({
      ...c.ir,
      topLevelItems: []
    }),
    /printf/
  )
  assert.doesNotMatch(
    emitCFromIr({
      ...c.ir,
      body: []
    }),
    /printf/
  )
})


test('collects IR top-level node entries from stored metadata', () => {
  const result = compileSource(
    `type User = {
  name: string
}

export function greet(): void {
  console.log('hi')
}

const count = 1
`,
    {
      target: 'c'
    }
  )
  const entries = collectIrTopLevelNodeEntries(result.ir)

  assert.deepEqual(
    entries.map((entry) => `${entry.kind}:${entry.node.type}`),
    ['type:TypeAliasDeclaration', 'function:FunctionDeclaration', 'statement:VariableDeclaration']
  )
  assert.deepEqual(
    collectIrTopLevelNodeEntries({
      ...result.ir,
      body: []
    }),
    []
  )
  assert.deepEqual(
    collectIrTopLevelNodeEntries({
      ...result.ir,
      topLevelItems: []
    }),
    []
  )
})


test('tracks type aliases as target-neutral IR top-level type items', () => {
  const source = `type User = {
  readonly id: number,
  name: string
}

export function main(): void {
  const user: User = { id: 1, name: 'Ada' }
  console.log(user.name)
}
`
  const plainJs = compileSource(source, {
    target: 'c',
    callMain: false
  })
  const withoutTypeItems = {
    ...plainJs.ir,
    topLevelItems: plainJs.ir.topLevelItems.filter((item) => item.kind !== 'type')
  }

  assert.deepEqual(
    plainJs.ir.topLevelItems.map((item) => item.kind),
    ['type', 'function']
  )
  assert.doesNotMatch(plainJs.code, /type User = \{/)
  assert.match(plainJs.code, /void inox_main\(void\) \{/)
  assert.match(emitCFromIr(withoutTypeItems), /void inox_main\(void\) \{/)
})


test('collects IR top-level function nodes across stored programs', () => {
  const left = compileSource(
    `export function left(): void {
  console.log('left')
}
`,
    {
      target: 'c'
    }
  )
  const right = compileSource(
    `export function right(): void {
  console.log('right')
}
`,
    {
      target: 'c'
    }
  )
  const functions = collectIrTopLevelNodesFromPrograms([left.ir, right.ir], 'function')

  assert.deepEqual(
    functions.map((item) => (item.type === 'FunctionDeclaration' ? item.name : null)),
    ['left', 'right']
  )
  assert.deepEqual(
    collectIrTopLevelNodesFromPrograms(
      [
        {
          ...left.ir,
          topLevelItems: []
        },
        {
          ...right.ir,
          body: []
        }
      ],
      'function'
    ),
    []
  )
})


test('emits single-file C directly from target-neutral IR programs', () => {
  const result = compileSource(
    `export function main(): void {
  console.log('hello')
}
`,
    {
      target: 'c'
    }
  )

  assert.match(emitCFromIr(result.ir), /void inox_main\(void\) \{/)
})


test('collects target-neutral IR feature requirements', () => {
  const result = compileSource(
    `export function main(): void {
  const values = [1, 2, 3]
  const names = ['Ada', 'Grace']
  const initials = names.map(name => name.slice(0, 1))
  const now = Date.now()
  console.log(values.length, initials[0], now, 'Ada' === names[0])
}
`,
    {
      target: 'c'
    }
  )

  assert.equal(result.ir.type, 'IrProgram')
  assert.deepEqual(result.ir.features, ['clocks', 'collections', 'runtime-values', 'string-bytes'])
  assert.deepEqual(result.ir.runtimeRequirements, ['clocks', 'collections', 'managed-values', 'string-bytes'])
  assert.deepEqual(
    result.ir.globalUsages.map((usage) => usage.root),
    ['Date']
  )
  assert.deepEqual(
    result.ir.globalUsages.map((usage) => usage.path.join('.')),
    ['Date.now']
  )
  assert.match(result.code, /#include "inox\/time\.h"/)
})


test('drives C throwing function ABI from stored target-neutral IR function effects', () => {
  const result = compileSource(
    `function ok(): void {
  console.log('ok')
}

export function main(): void {
  try {
    ok()
  } catch (error) {
    console.log(error)
  }
}
`,
    {
      target: 'c'
    }
  )
  const withThrowingEffect = {
    ...result.ir,
    functionEffects: result.ir.functionEffects.map((item) =>
      item.name === 'ok'
        ? {
            ...item,
            throws: true,
            throwValueTypes: ['string' as const]
          }
        : item
    )
  }
  const code = emitCFromIr(withThrowingEffect)

  assert.deepEqual(
    result.ir.functionEffects.find((item) => item.name === 'ok'),
    {
      name: 'ok',
      throws: false,
      throwValueTypes: []
    }
  )
  assert.match(code, /inox_status ok\(inox_value \*inox_error_out\);/)
  assert.match(code, /inox_status ok\(inox_value \*inox_error_out\) \{/)
  assert.match(code, /inox_status inox_call_status_\d+ = ok\(&inox_error\);/)
})


test('collects local IR throw value types for catch binding analysis', () => {
  const result = compileSource(
    `function failString(): void {
  throw 'nope'
}

function failError(): void {
  throw new Error('boom')
}

export function main(): void {
  const error = new Error('local')
  try {
    failString()
    failError()
    throw error
  } catch (caught) {
    console.log('caught')
  }
}
`,
    {
      target: 'c'
    }
  )
  const main = result.ir.body.find((item) => item.type === 'FunctionDeclaration' && item.name === 'main')
  const tryStatement = main?.body.find((item: AnyNode) => item.type === 'TryStatement')
  const functionThrowValueTypes = new Map(result.ir.functionEffects.map((item) => [item.name, item.throwValueTypes]))

  assert.deepEqual(
    collectIrLocalThrowValueTypes(tryStatement?.block, {
      errorObjectNames: new Set(['error']),
      functionThrowValueTypes
    }),
    ['string', 'error']
  )
})


test('drives C runtime prelude from target-neutral IR requirements', () => {
  const result = compileSource(
    `export function main(): void {
  const values = ['Ada']
  const now = Date.now()
  console.log(values[0], now, 'Ada' === values[0])
}
`,
    {
      target: 'c'
    }
  )

  const code = emitCFromIr({
    ...result.ir,
    features: []
  })
  const withoutRuntimeRequirements = emitCFromIr({
    ...result.ir,
    runtimeRequirements: []
  })

  assert.deepEqual(result.ir.runtimeRequirements, ['clocks', 'collections', 'managed-values', 'string-bytes'])
  assert.match(code, /#include <string\.h>/)
  assert.match(code, /#include "inox\/array\.h"/)
  assert.match(code, /#include "inox\/time\.h"/)
  assert.doesNotMatch(withoutRuntimeRequirements, /#include <string\.h>/)
  assert.doesNotMatch(withoutRuntimeRequirements, /#include "inox\/array\.h"/)
  assert.doesNotMatch(withoutRuntimeRequirements, /#include "inox\/time\.h"/)
})


test('drives C object headers from target-neutral IR requirements', () => {
  const objectResult = compileSource(
    `type User = {
  name: string
}

export function main(): void {
  const user: User = { name: 'Ada' }
  console.log(user.name)
}
`,
    {
      target: 'c'
    }
  )
  const mapEntryResult = compileSource(
    `export function main(): void {
  const scores: Map<string, number> = new Map([['Ada', 7]])

  for (const entry of scores) {
    console.log(entry.key, entry.value)
  }
}
`,
    {
      target: 'c'
    }
  )
  const withoutObjects = emitCFromIr({
    ...objectResult.ir,
    runtimeRequirements: objectResult.ir.runtimeRequirements.filter((item) => item !== 'objects')
  })

  assert.deepEqual(objectResult.ir.runtimeRequirements, ['managed-values', 'objects'])
  assert.match(objectResult.code, /#include "inox\/object\.h"/)
  assert.doesNotMatch(withoutObjects, /#include "inox\/object\.h"/)
  assert.deepEqual(mapEntryResult.ir.runtimeRequirements, ['collections', 'managed-values', 'objects'])
  assert.match(mapEntryResult.code, /inox_object_new\(&inox_default_allocator, &inox_shape_map_entry_\d+, &entry\)/)
})


test('drives C JSON runtime from target-neutral IR requirements', () => {
  const result = compileSource(
    `type User = {
  name: string,
  score: number
}

export function main(): void {
  const user: User = JSON.parse('{"score":7,"name":"Ada"}')
  const text = JSON.stringify(user)
  console.log(user.name, user.score, text)
}
`,
    {
      target: 'c'
    }
  )

  assert.deepEqual(result.ir.runtimeRequirements, ['collections', 'json', 'managed-values', 'objects', 'string-bytes'])
  assert.match(result.code, /#include "inox\/json\.h"/)
  assert.match(
    result.code,
    /inox_json_parse\(&inox_default_allocator, "\{\\"score\\":7,\\"name\\":\\"Ada\\"\}", 24, &inox_json_object_\d+\)/
  )
  assert.match(result.code, /inox_object_get\(inox_json_object_\d+, "name", 4, &inox_json_name_\d+\)/)
  assert.match(result.code, /inox_json_stringify\(&inox_default_allocator, user, &inox_json_value_\d+\)/)
})


test('lowers C JSON scalar parse through runtime tag checks', () => {
  const result = compileSource(
    `export function main(): void {
  const score: number = JSON.parse('7')
  const active: boolean = JSON.parse('true')
  console.log(score + 1, active)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /inox_json_parse\(&inox_default_allocator, "7", 1, &inox_json_value_\d+\)/)
  assert.match(result.code, /inox_json_value_\d+\.tag != INOX_TAG_NUMBER/)
  assert.match(result.code, /const double score = inox_json_value_\d+\.as\.number;/)
  assert.match(result.code, /inox_json_parse\(&inox_default_allocator, "true", 4, &inox_json_value_\d+\)/)
  assert.match(result.code, /inox_json_value_\d+\.tag != INOX_TAG_BOOL/)
  assert.match(result.code, /const double active = \(inox_json_value_\d+\.as\.boolean \? 1 : 0\);/)
})


test('accepts supported C syntax features from stored target-neutral IR syntax features', () => {
  const result = compileSource(
    `export function main(): void {
  console.log('ok')
}
`,
    {
      target: 'c'
    }
  )

  assert.doesNotThrow(() =>
    emitCFromIr({
      ...result.ir,
      syntaxFeatures: [
        {
          feature: 'class' as const,
          loc: {
            line: 1,
            column: 1
          }
        }
      ]
    })
  )
})


test('keeps function signatures in HIR and compiles typed calls', () => {
  const result = compileSource(
    `function add(left: number, right: number): number {
  return left + right
}

export function main(): void {
  const total: number = add(2, 3)
  console.log(total)
}
`,
    {
      target: 'c'
    }
  )
  const add = result.hir.body.find((item) => item.type === 'FunctionDeclaration' && item.name === 'add')
  assert.ok(add)

  assert.equal(add.returnType, 'number')
  assert.deepEqual(
    add.params.map((param: AnyNode) => param.valueType),
    ['number', 'number']
  )
  assert.match(result.code, /double add\(double left, double right\)/)
})


test('uses default parameter initializers for omitted C call arguments', () => {
  const result = compileSource(
    `function label(value: string = 'unknown'): string {
  return value
}

export function main(): void {
  console.log(label())
}
`,
    {
      target: 'c'
    }
  )
  const label = result.hir.body.find((item) => item.type === 'FunctionDeclaration' && item.name === 'label')

  assert.ok(label)
  assert.equal(label.params[0].optional, true)
  assert.equal(label.params[0].defaultValue.type, 'StringLiteral')
  assert.match(result.code, /inox_string_from_literal\(&inox_default_allocator, "unknown", 7, &inox_value_\d+\)/)
  assert.match(result.code, /label\(inox_value_\d+\)/)
  assert.doesNotMatch(result.code, /label\(0\)/)
})


test('uses zero function companions for omitted default object option fields', () => {
  const result = compileSource(
    `type Host = { read: () => string }
type Options = { host?: Host }

function load(options: Options = {}): string {
  if (options.host != null) {
    return options.host.read()
  }

  return 'none'
}

export function main(): void {
  console.log(load())
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /load\(inox_object_\d+, 0\)/)
  assert.doesNotMatch(result.code, /INOX_C_FUNCTION_VALUE/)
})


test('uses zero function companions for unavailable optional object sources', () => {
  const result = compileSource(
    `type Host = { read: () => string }
type Options = { host?: Host }

function normalize(options: Options): Options {
  return {
    host: options.host
  }
}

function load(options: Options): string {
  if (options.host != null) {
    return options.host.read()
  }

  return 'none'
}

export function main(): void {
  console.log(load(normalize({})))
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /load\(inox_value_\d+, 0\)/)
  assert.doesNotMatch(result.code, /INOX_C_FUNCTION_VALUE/)
})


test('preserves function companions from intersection base object fields', () => {
  const result = compileSource(
    `type Dep = { run: () => string }
type Base = { dep: Dep }
type Child = Base & { value: number }

function read(): string {
  return 'ok'
}

function load(context: Child): string {
  return context.dep.run()
}

export function main(): void {
  console.log(load({ dep: { run: read }, value: 1 }))
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /inox_value load\(inox_value context, inox_value \(\*inox_objfn_context_dep_run\)\(void\)\)/)
  assert.match(result.code, /inox_value_\d+ = inox_objfn_context_dep_run\(\);/)
  assert.match(result.code, /load\(inox_object_\d+, read\)/)
})


test('preserves function companion aliases through object accessor locals', () => {
  const result = compileSource(
    `type Dep = { run: () => string }
type Base = { dep: Dep }
type Child = Base & { value: number }

function read(): string {
  return 'ok'
}

function asChild(context: Child): Child {
  return context
}

function load(context: Child): string {
  const alias: Child = asChild(context)
  return alias.dep.run()
}

export function main(): void {
  console.log(load({ dep: { run: read }, value: 1 }))
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /inox_value load\(inox_value context, inox_value \(\*inox_objfn_context_dep_run\)\(void\)\)/)
  assert.match(result.code, /inox_value_\d+ = asChild\(context, inox_objfn_context_dep_run\);/)
  assert.match(result.code, /inox_value_\d+ = inox_objfn_context_dep_run\(\);/)
  assert.doesNotMatch(result.code, /inox_objfn_alias_dep_run/)
})


test('preserves object function companions on object-field arrow parameters', () => {
  const result = compileSource(
    `type Dep = { read: () => string }
type Context = { dep: Dep }
type Runner = { run: (context: Context) => string }

function read(): string {
  return 'ok'
}

function readContext(context: Context): string {
  return context.dep.read()
}

const runner: Runner = {
  run: (context) => readContext(context)
}

export function main(): void {
  console.log(runner.run({ dep: { read } }))
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /static inox_value inox_callback_arrow_\d+\(inox_value context, inox_value \(\*inox_objfn_context_dep_read\)\(void\)\)/
  )
  assert.match(result.code, /readContext\(context, inox_objfn_context_dep_read\)/)
  assert.match(result.code, /inox_objfn_runner_run\(inox_object_\d+, read\)/)
})


test('passes module object companions through named runtime callback wrappers', () => {
  const result = compileSource(
    `type Dep = { read: () => string }
type Context = { dep: Dep }
type Runner = { lookup: (context: Context) => string | null }

function read(): string {
  return 'ok'
}

function lookup(context: Context): string | null {
  return context.dep.read()
}

const dep: Dep = { read }
const runner: Runner = { lookup }

export function main(): void {
  const context: Context = { dep }
  const result = runner.lookup(context)

  if (result != null) {
    console.log(result)
  }
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /static inox_status inox_callback_lookup_\d+\(void\* inox_context, const inox_value\* args, size_t arg_count, inox_value\* out\)/)
  assert.match(result.code, /\*out = lookup\(args\[0\], inox_objfn_dep_read\);/)
  assert.match(result.code, /if \(inox_callback_new\(&inox_default_allocator, inox_callback_lookup_\d+, 0, 0, &inox_objfn_runner_lookup\) != INOX_OK\)/)
  assert.doesNotMatch(result.code, /\*out = lookup\(args\[0\]\);/)
})


test('uses finite plain companions for recursive object function fields', () => {
  const result = compileSource(
    `type Dep = { emit: (context: Context) => string }
type Context = { dep: Dep }

function emit(context: Context): string {
  return 'ok'
}

function run(context: Context): string {
  return context.dep.emit(context)
}

export function main(): void {
  console.log(run({ dep: { emit } }))
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /inox_value run\(inox_value context, inox_value \(\*inox_objfn_context_dep_emit\)\(inox_value\)\)/)
  assert.match(result.code, /inox_value_\d+ = inox_objfn_context_dep_emit\(context\);/)
  assert.match(result.code, /run\(inox_object_\d+, (?:emit|inox_function_pointer_adapter_\d+)\)/)
  assert.doesNotMatch(result.code, /inox_value inox_objfn_context_dep_emit/)
})


test('keeps explicitly typed object locals on object assignments in C', () => {
  const result = compileSource(
    `type Loc = { line: number, column: number }
type Executor = { loc: Loc, body: Loc }

function pick(executor: Executor): Loc {
  let loc: Loc = executor.loc
  loc = executor.body
  return loc
}

export function main(): void {
  const loc: Loc = pick({ loc: { line: 1, column: 2 }, body: { line: 3, column: 4 } })
  console.log(loc.line)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /inox_value loc = inox_undefined_value\(\);/)
  assert.match(result.code, /inox_object_get_known\(executor, 0, &loc\)/)
  assert.match(result.code, /loc = inox_value_\d+;/)
  assert.doesNotMatch(result.code, /loc = inox_value_\d+\.as\.number;/)
})


test('drives C function signature metadata from target-neutral IR declarations', () => {
  const result = compileSource(
    `function greet(value: string): void {
  console.log(value)
}

export function main(): void {
  greet('Ada')
}
`,
    {
      target: 'c'
    }
  )
  const greet = result.ir.functionDeclarations.find((item) => item.name === 'greet')

  assert.deepEqual(
    greet?.params.map((param) => ({
      name: param.name,
      valueType: param.valueType
    })),
    [
      {
        name: 'value',
        valueType: 'string'
      }
    ]
  )
  assert.equal(greet?.returnType, 'void')
  assert.match(result.code, /void greet\(inox_value inox_param_value\);/)
  assert.match(
    result.code,
    /void greet\(inox_value inox_param_value\) \{\n {2}if \(inox_param_value\.tag != INOX_TAG_STRING \|\| inox_param_value\.as\.ref == 0\)\s+goto inox_cleanup;/
  )
  assert.match(result.code, /greet\(inox_value_\d+\);/)

  const withoutParamMetadata = emitCFromIr({
    ...result.ir,
    functionDeclarations: result.ir.functionDeclarations.map((item) =>
      item.name === 'greet'
        ? {
            ...item,
            params: []
          }
        : item
    )
  })

  assert.match(withoutParamMetadata, /void greet\(void\);/)
  assert.doesNotMatch(withoutParamMetadata, /inox_param_value/)
  assert.match(withoutParamMetadata, /greet\("Ada"\);/)
})


test('drives C function return ABI from target-neutral IR declarations', () => {
  const result = compileSource(
    `function getScore(): number {
  return 7
}

export function main(): void {
  console.log('ok')
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /double getScore\(void\) \{/)
  assert.match(result.code, /inox_return = 7;/)

  const withNullableReturnMetadata = emitCFromIr({
    ...result.ir,
    functionDeclarations: result.ir.functionDeclarations.map((item) =>
      item.name === 'getScore'
        ? {
            ...item,
            returnNullable: true
          }
        : item
    )
  })

  assert.match(withNullableReturnMetadata, /inox_value getScore\(void\) \{/)
  assert.match(withNullableReturnMetadata, /inox_return = inox_number_value\(7\);/)
})


test('compiles simple optional object member and index access to C', () => {
  const source = `export function main(): void {
  const data = { name: 'Ada', score: 7 }
  const name = data?.name
  console.log(name, data?.['score'])
}
`
  const c = compileSource(source, {
    target: 'c'
  })

  assert.match(c.code, /if \(inox_object_get_known\(data, 0, &inox_field_\d+\) != INOX_OK\)\s+goto inox_cleanup;/)
  assert.match(c.code, /const inox_string \*name = \(inox_string \*\)inox_field_\d+\.as\.ref;/)
  assert.match(c.code, /if \(inox_object_get\(data, "score", 5, &inox_log_value_\d+\) != INOX_OK\)\s+goto inox_cleanup;/)
})


test('lowers nested AnyNode path element access as a string array index', () => {
  const result = compileSource(
    `type AnyNode = {
  type?: string
  [key: string]: any
}

function firstCalleeSegment(expression: AnyNode): string {
  if (expression.callee.type !== 'Reference' || expression.callee.path.length !== 1) {
    return ''
  }

  const path = expression.callee.path
  const name: string = path[0]
  return name
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /inox_array_get\(path, 0, &inox_value_\d+\)/)
  assert.match(result.code, /const inox_string\* name = \(inox_string\*\)name_value_\d+\.as\.ref;/)
})


test('lowers AnyNode valueType metadata as a runtime string', () => {
  const result = compileSource(
    `type AnyNode = {
  type?: string
  [key: string]: any
}

function resolveDeclaredName(node: AnyNode): string {
  let declaredType: string = node.valueType
  const nodeDeclaredType = node.declaredType

  if (nodeDeclaredType != null) {
    declaredType = nodeDeclaredType
  }

  return declaredType
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /inox_object_get\(node, "valueType", 9, &inox_value_\d+\)/)
  assert.match(result.code, /inox_value declaredType_value_\d+ = inox_undefined_value\(\);/)
  assert.match(result.code, /declaredType_value_\d+\.tag != INOX_TAG_STRING \|\| declaredType_value_\d+\.as\.ref == 0/)
  assert.match(result.code, /declaredType = \(inox_string\*\)declaredType_value_\d+\.as\.ref;/)
  assert.doesNotMatch(result.code, /double declaredType/)
})


test('resolves ValueType metadata fields as runtime strings', () => {
  const result = compileSource(
    `type Param = {
  valueType: ValueType
  declaredType?: string | null
}

function resolveParam(param: Param): string {
  let declaredType: string = param.valueType
  const paramDeclaredType = param.declaredType

  if (paramDeclaredType != null) {
    declaredType = paramDeclaredType
  }

  return declaredType
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /inox_object_get_known\(param, 0, &inox_field_\d+\)/)
  assert.match(result.code, /inox_value declaredType_value_\d+ = inox_undefined_value\(\);/)
  assert.match(result.code, /declaredType = \(inox_string\*\)declaredType_value_\d+\.as\.ref;/)
  assert.doesNotMatch(result.code, /double declaredType/)
})


test('rejects unsupported C optional chaining forms', () => {
  const source = `function hello(): string {
  return 'called'
}

export function main(): void {
  const data = { items: [{ name: 'Ada' }], hello }
  const missing = null
  console.log(data?.items?.[0]?.name, missing?.items?.[0]?.name, data.hello?.())
}
`
  assertDiagnostic(source, 'INOX_C_OPTIONAL_CHAINING', {
    target: 'c'
  })
})


test('lowers C optional access over nullable runtime values', () => {
  const result = compileSource(
    `type User = {
  name: string
}

export function main(): void {
  let user: User | null = null
  const names = ['Grace']
  const maybeNames: string[] | null = names
  console.log(user?.name ?? 'Ada', user?.['name'] ?? 'Ada', maybeNames?.[0] ?? 'Ada')
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /if \(user\.tag == INOX_TAG_NULL\) \{/)
  assert.match(result.code, /inox_object_get_known\(user, 0, &inox_optional_value_\d+\)/)
  assert.match(result.code, /inox_object_get\(user, "name", 4, &inox_optional_value_\d+\)/)
  assert.match(result.code, /if \(maybeNames\.tag == INOX_TAG_NULL\) \{/)
  assert.match(result.code, /inox_array_get\(maybeNames, 0, &inox_optional_value_\d+\)/)
})


test('lowers C nullable string nullish coalescing', () => {
  const result = compileSource(
    `export function main(): void {
  const missing: string | null = null
  const present: string | null = 'Grace'
  console.log(missing ?? 'Ada', present ?? 'Ada', missing === null, present !== null)
}
`,
    {
      target: 'c'
    }
  )

  assert.equal(result.hir.body[0].body[0].nullable, true)
  assert.deepEqual(result.ir.features, ['runtime-values', 'string-bytes'])
  assert.match(result.code, /inox_null_value\(\)/)
  assert.match(result.code, /if \(missing\.tag == INOX_TAG_NULL \|\| missing\.tag == INOX_TAG_UNDEFINED\) \{/)
  assert.match(result.code, /present\.tag == INOX_TAG_NULL/)
})


test('lowers C nullable scalar nullish coalescing', () => {
  const result = compileSource(
    `type User = {
  score: number,
  active: boolean
}

export function main(): void {
  let score: number | null = null
  let active: boolean | null = null
  const values = [7]
  const maybeValues: number[] | null = values
  let user: User | null = { score: 9, active: true }
  console.log(score ?? 1, active ?? false, maybeValues?.[0] ?? 0, user?.score ?? 0, user?.active ?? false)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /score = inox_null_value\(\);/)
  assert.match(result.code, /inox_number_value\(9\)/)
  assert.match(result.code, /if \(score\.tag == INOX_TAG_NULL\) \{/)
  assert.match(result.code, /score\.tag != INOX_TAG_NUMBER/)
  assert.match(result.code, /active\.tag != INOX_TAG_BOOL/)
  assert.match(result.code, /inox_array_get\(maybeValues, 0, &inox_optional_value_\d+\)/)

  assertDiagnostic(
    `export function main(): void {
  const score: number | null = null
  console.log(score)
}
`,
    'INOX_C_NULLISH',
    {
      target: 'c'
    }
  )
})


test('lowers C nullable scalar truthiness conditions', () => {
  const result = compileSource(
    `type Capture = {
  mutable: boolean | null
}

function print(score: number | null, active: boolean | null, capture: Capture): void {
  if (!active) {
    console.log(2)
  }

  if (!capture.mutable) {
    console.log(3)
  }

  const missing = !score
  const fieldMissing = !capture['mutable']
  console.log(missing, fieldMissing)
}

export function main(): void {
  print(1, null, { mutable: null })
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /if \(!\(inox_value_truthy\(active\) \? 1 : 0\)\) \{/)
  assert.match(result.code, /inox_object_get_known\(capture, 0, &inox_value_\d+\)/)
  assert.match(result.code, /if \(!\(inox_value_truthy\(inox_value_\d+\) \? 1 : 0\)\) \{/)
  assert.match(result.code, /const double missing = \(!\(inox_value_truthy\(score\) \? 1 : 0\)\);/)
  assert.match(result.code, /inox_object_get\(capture, "mutable", 7, &inox_value_\d+\)/)
  assert.match(result.code, /const double fieldMissing = \(!\(inox_value_truthy\(inox_value_\d+\) \? 1 : 0\)\);/)

  assertDiagnostic(
    `export function main(): void {
  const score: number | null = 1
  console.log(score)
}
`,
    'INOX_C_NULLISH',
    {
      target: 'c'
    }
  )
})


test('narrows C nullable scalar values through truthiness guards', () => {
  const result = compileSource(
    `function printScore(score: number | null): void {
  if (score) {
    console.log(score + 1)
  } else {
    console.log(0)
  }
}

function printPresentScore(score: number | null): void {
  if (!score) {
    return
  }

  console.log(score + 2)
}

export function main(): void {
  printScore(4)
  printScore(null)
  printPresentScore(5)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /if \(inox_value_truthy\(score\) \? 1 : 0\) \{/)
  assert.match(result.code, /\(score\.as\.number \+ 1\)/)
  assert.match(result.code, /if \(!\(inox_value_truthy\(score\) \? 1 : 0\)\) \{/)
  assert.match(result.code, /\(score\.as\.number \+ 2\)/)
})


test('narrows C nullable object values through truthiness guards', () => {
  const result = compileSource(
    `type User = {
  name: string
}

function readName(user: User | null): string {
  if (user) {
    return user.name
  }

  return 'none'
}

function readNameAfterGuard(user: User | null): string {
  if (!user) {
    return 'none'
  }

  return user.name
}

export function main(): void {
  const user: User = { name: 'Ada' }
  console.log(readName(user), readNameAfterGuard(user))
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /if \(inox_value_truthy\(user\) \? 1 : 0\) \{/)
  assert.match(result.code, /if \(!\(inox_value_truthy\(user\) \? 1 : 0\)\) \{/)
  assert.match(result.code, /inox_object_get_known\(user, 0, &inox_\w+_\d+\)/)
})


test('lowers C nullable scalar function params and returns', () => {
  const result = compileSource(
    `function maybeScore(seed: number): number | null {
  if (seed > 0) {
    return seed + 1
  }

  return null
}

function printScore(score: number | null, active: boolean | null): void {
  console.log(score ?? 0, active ?? false, score !== null, active === null)
}

export function main(): void {
  const first = maybeScore(1)
  const second: number | null = maybeScore(0)
  printScore(first, true)
  printScore(second, null)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /inox_value maybeScore\(double seed\)/)
  assert.match(result.code, /void printScore\(inox_value inox_param_score, inox_value inox_param_active\)/)
  assert.match(result.code, /inox_value score = inox_param_score;/)
  assert.match(result.code, /inox_param_score\.tag != INOX_TAG_NULL && inox_param_score\.tag != INOX_TAG_NUMBER/)
  assert.match(result.code, /inox_return = inox_number_value\(\(seed \+ 1\)\);/)
  assert.match(result.code, /inox_return = inox_null_value\(\);/)
  assert.match(result.code, /inox_nullable_value_\d+ = maybeScore\(1\);/)
  assert.match(result.code, /printScore\(first, inox_bool_value\(\(1\) != 0\)\);/)

  assertDiagnostic(
    `function maybeScore(): number | null {
  return null
}

export function main(): void {
  console.log(maybeScore())
}
`,
    'INOX_C_NULLISH',
    {
      target: 'c'
    }
  )
})


test('narrows C nullable scalar values inside null-checked branches', () => {
  const result = compileSource(
    `function printScore(score: number | null, active: boolean | null): void {
  if (score !== null) {
    console.log(score + 1)
  } else {
    console.log(0)
  }

  if (active === null) {
    console.log(false)
  } else {
    console.log(active)
  }
}

export function main(): void {
  printScore(4, true)
  printScore(null, null)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /if \(!\(score\.tag == INOX_TAG_NULL \|\| score\.tag == INOX_TAG_UNDEFINED\)\) \{/)
  assert.match(result.code, /\(score\.as\.number \+ 1\)/)
  assert.match(result.code, /if \(active\.tag == INOX_TAG_NULL \|\| active\.tag == INOX_TAG_UNDEFINED\) \{/)
  assert.match(result.code, /\(active\.as\.boolean \? 1 : 0\)/)

  assertDiagnostic(
    `export function main(): void {
  const score: number | null = 1
  if (score !== null) {
    console.log(score)
  }
  console.log(score)
}
`,
    'INOX_C_NULLISH',
    {
      target: 'c'
    }
  )

  assertDiagnostic(
    `export function main(): void {
  let score: number | null = 1
  if (score !== null) {
    score = null
    console.log(score)
  }
}
`,
    'INOX_C_NULLISH',
    {
      target: 'c'
    }
  )
})


test('narrows C nullable scalar values through logical conditions', () => {
  const result = compileSource(
    `function printScore(score: number | null, backup: number | null): void {
  if (score !== null && score > 2) {
    console.log(score + 1)
  }

  if (backup === null || backup < 1) {
    console.log(0)
  } else {
    console.log(backup + 2)
  }
}

export function main(): void {
  printScore(4, 3)
  printScore(null, null)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /score\.as\.number > 2/)
  assert.match(result.code, /\(score\.as\.number \+ 1\)/)
  assert.match(result.code, /backup\.as\.number < 1/)
  assert.match(result.code, /\(backup\.as\.number \+ 2\)/)

  assertDiagnostic(
    `export function main(): void {
  const score: number | null = 1
  if (score !== null || score > 1) {
    console.log(1)
  }
}
`,
    'INOX_C_NULLISH',
    {
      target: 'c'
    }
  )

  assertDiagnostic(
    `export function main(): void {
  const score: number | null = 1
  if (score === null && score > 1) {
    console.log(1)
  }
}
`,
    'INOX_C_NULLISH',
    {
      target: 'c'
    }
  )
})


test('narrows C nullable scalar values after null-checked early returns', () => {
  const result = compileSource(
    `function printScore(score: number | null, active: boolean | null): void {
  if (score === null) {
    return
  }
  console.log(score + 1)

  if (active === null) {
    return
  }
  console.log(active)
}

function printHigh(score: number | null): void {
  if (score === null || score < 2) {
    return
  }
  console.log(score + 1)
}

export function main(): void {
  printScore(4, true)
  printHigh(3)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /\(score\.as\.number \+ 1\)/)
  assert.match(result.code, /\(active\.as\.boolean \? 1 : 0\)/)
  assert.match(result.code, /score\.as\.number < 2/)

  assertDiagnostic(
    `export function main(): void {
  const score: number | null = 1
  if (score !== null) {
    return
  }
  console.log(score)
}
`,
    'INOX_C_NULLISH',
    {
      target: 'c'
    }
  )

  assertDiagnostic(
    `export function main(): void {
  const score: number | null = 1
  if (score === null) {
    console.log(0)
  }
  console.log(score)
}
`,
    'INOX_C_NULLISH',
    {
      target: 'c'
    }
  )
})

test('narrows C nullable object values after null-checked early returns', () => {
  const result = compileSource(
    `type User = {
  name: string
}

function readName(user: User | null): string {
  if (user === null) {
    return 'none'
  }

  return user.name
}

export function main(): void {
  const user: User = { name: 'Ada' }
  console.log(readName(user))
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /inox_object_get_known\(user, 0, &inox_\w+_\d+\)/)
})


test('narrows C nullable scalar values inside loop bodies', () => {
  const result = compileSource(
    `function printLoop(score: number | null, active: boolean | null): void {
  while (score !== null && score > 0) {
    console.log(score + 1)
    score = null
  }

  for (let index = 0; active !== null && index < 1; index = index + 1) {
    console.log(active)
    active = null
  }
}

export function main(): void {
  printLoop(2, true)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /score\.as\.number > 0/)
  assert.match(result.code, /\(score\.as\.number \+ 1\)/)
  assert.match(result.code, /\(active\.as\.boolean \? 1 : 0\)/)

  assertDiagnostic(
    `export function main(): void {
  let score: number | null = 1
  while (score !== null) {
    score = null
    console.log(score)
  }
}
`,
    'INOX_C_NULLISH',
    {
      target: 'c'
    }
  )

  assertDiagnostic(
    `export function main(): void {
  const score: number | null = 1
  while (score === null) {
    console.log(score)
  }
}
`,
    'INOX_C_NULLISH',
    {
      target: 'c'
    }
  )
})


test('lowers C unknown nullish coalescing through runtime values', () => {
  const source = `function printValue(value: unknown): void {
  console.log(value ?? 'Ada')
}

export function main(): void {
  printValue(1)
}
`
  const result = compileSource(source, {
    target: 'c'
  })

  assert.match(result.code, /void printValue\(inox_value value\)/)
  assert.match(result.code, /if \(value\.tag == INOX_TAG_NULL \|\| value\.tag == INOX_TAG_UNDEFINED\) \{/)
  assert.match(result.code, /inox_string_from_literal\(&inox_default_allocator, "Ada", 3, &inox_value_\d+\)/)
  assert.match(result.code, /inox_value_\d+ = value;/)
})


test('lowers local string throws to C error channel', () => {
  const source = `export function main(): void {
  try {
    throw 'boom'
  } catch (error) {
    console.log(\`caught \${error}\`)
  } finally {
    console.log('finally')
  }
}
`
  const c = compileSource(source, {
    target: 'c'
  })

  assert.match(c.code, /inox_value inox_error = inox_undefined_value\(\);/)
  assert.match(c.code, /int inox_error_active = 0;/)
  assert.match(c.code, /inox_retain\(inox_error\);\n {4}inox_error_active = 1;\n {4}goto inox_try_\d+_catch;/)
  assert.match(
    c.code,
    /inox_try_\d+_catch:\n {4}if \(inox_error\.tag != INOX_TAG_STRING \|\| inox_error\.as\.ref == 0\)\s+goto inox_cleanup;/
  )
  assert.match(c.code, /inox_string \*error = \(inox_string \*\)inox_error\.as\.ref;/)
  assert.match(c.code, /inox_release\(inox_error\);\n {4}inox_error = inox_undefined_value\(\);/)
  assert.match(c.code, /inox_try_\d+_finally:/)
  assert.match(c.code, /printf\("%s\\n", "finally"\);/)

  assertDiagnostic(
    `export function main(): void {
  throw 'boom'
}
`,
    'INOX_C_THROW',
    {
      target: 'c'
    }
  )
})


test('lowers C number return through finally before cleanup', () => {
  const result = compileSource(
    `function getScore(): number {
  try {
    return 7
  } finally {
    console.log('finally')
  }
}

export function main(): void {
  console.log(getScore())
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /double getScore\(void\) \{\n {2}double inox_return = 0;\n {2}int inox_return_active = 0;/)
  assert.match(result.code, /inox_return = 7;\n {4}inox_return_active = 1;\n {4}goto inox_try_\d+_finally;/)
  assert.match(
    result.code,
    /inox_try_\d+_finally:\n {4}printf\("%s\\n", "finally"\);\n {4}if \(inox_error_active\)\s+goto inox_cleanup;\n {4}if \(inox_return_active\)\s+goto inox_cleanup;/
  )
  assert.match(result.code, /inox_cleanup:\n {2}inox_release\(inox_error\);\n {2}return inox_return;/)
})


test('lowers C void return through finally before cleanup', () => {
  const result = compileSource(
    `function stop(): void {
  try {
    return
  } finally {
    console.log('finally')
  }
  console.log('after')
}

export function main(): void {
  stop()
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /void stop\(void\) \{\n {2}int inox_return_active = 0;/)
  assert.match(result.code, /inox_return_active = 1;\n {4}goto inox_try_\d+_finally;/)
  assert.match(
    result.code,
    /inox_try_\d+_finally:\n {4}printf\("%s\\n", "finally"\);\n {4}if \(inox_error_active\)\s+goto inox_cleanup;\n {4}if \(inox_return_active\)\s+goto inox_cleanup;/
  )
})


test('lowers C break and continue through finally before loop flow', () => {
  const result = compileSource(
    `export function main(): void {
  let index = 0
  while (index < 3) {
    index = index + 1
    try {
      if (index === 1) {
        continue
      }
      if (index === 2) {
        break
      }
    } finally {
      console.log(\`finally \${index}\`)
    }
    console.log(index)
  }
  console.log(index)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /int inox_break_active = 0;\n {2}int inox_continue_active = 0;/)
  assert.match(result.code, /inox_continue_active = 1;\n\s+goto inox_try_\d+_finally;/)
  assert.match(result.code, /inox_break_active = 1;\n\s+goto inox_try_\d+_finally;/)
  assert.match(result.code, /if \(inox_break_active\) goto inox_break_\d+;/)
  assert.match(result.code, /if \(inox_continue_active\) goto inox_continue_\d+;/)
  assert.match(result.code, /inox_break_\d+:\n\s+if \(inox_break_active\) inox_break_active = 0;/)
  assert.match(result.code, /inox_continue_\d+:\n\s+if \(inox_continue_active\) inox_continue_active = 0;/)
})


test('lowers lightweight Error objects to C', () => {
  const source = `export function main(): void {
  const root = new Error('root', { code: 'E_ROOT' })
  const created = new Error('created', { code: 'E_CREATED', cause: root })
  console.log(created.name, created.message, created.code)
  try {
    const thrown = new Error('boom', { code: 'E_BOOM', cause: created })
    throw thrown
  } catch (error) {
    console.log(error.name, error.message, error.code)
  } finally {
    console.log('finally')
  }
}
`
  const c = compileSource(source, {
    target: 'c'
  })

  assert.match(
    c.code,
    /static const inox_field_info inox_shape_error_\d+_fields\[\] = \{\n\s+\{ "name", INOX_FIELD_READONLY \},\n\s+\{ "message", INOX_FIELD_READONLY \},\n\s+\{ "code", INOX_FIELD_READONLY \},\n\s+\{ "cause", INOX_FIELD_READONLY \},/
  )
  assert.match(
    c.code,
    /if \(inox_object_new\(&inox_default_allocator, &inox_shape_error_\d+, &created\) != INOX_OK\)\s+goto inox_cleanup;/
  )
  assert.match(c.code, /inox_object_init_known\(created, 2, inox_value_\d+\)/)
  assert.match(c.code, /inox_object_init_known\(created, 3, root\)/)
  assert.match(
    c.code,
    /inox_error = thrown;\n {4}if \(inox_error\.tag != INOX_TAG_OBJECT \|\| inox_error\.as\.ref == 0\)\s+goto inox_cleanup;/
  )
  assert.match(
    c.code,
    /inox_try_\d+_catch:\n {4}if \(inox_error\.tag != INOX_TAG_OBJECT \|\| inox_error\.as\.ref == 0\)\s+goto inox_cleanup;/
  )
  assert.match(c.code, /inox_value error = inox_error;/)
  assert.match(c.code, /inox_object_get_known\(error, 0, &inox_log_value_\d+\)/)
  assert.match(c.code, /inox_object_get_known\(error, 1, &inox_log_value_\d+\)/)
  assert.match(c.code, /inox_object_get_known\(error, 2, &inox_log_value_\d+\)/)

  assertDiagnostic(
    `export function main(): void {
  try {
    throw { message: 'boom' }
  } catch (error) {
    console.log(error)
  }
}
`,
    'INOX_C_THROW',
    {
      target: 'c'
    }
  )
  assertDiagnostic(
    `export function main(): void {
  const fake = {
    name: 'Error',
    message: 'boom'
  }
  try {
    throw fake
  } catch (error) {
    console.log(error)
  }
}
`,
    'INOX_C_THROW',
    {
      target: 'c'
    }
  )
  assertDiagnostic(
    `export function main(): void {
  const error = new Error('boom', { cause: 'text' })
  console.log(error.message)
}
`,
    'INOX_TYPE_MISMATCH',
    {
      target: 'c'
    }
  )
  assertDiagnostic(
    `export function main(): void {
  const error = new Error('boom')
  error.code = 'E_CHANGED'
}
`,
    'INOX_ASSIGN_READONLY_FIELD',
    {
      target: 'c'
    }
  )
})


test('lowers C interfunction throws through status error ABI', () => {
  const source = `export function failString(): void {
  throw 'boom'
}

export function failError(): void {
  const error = new Error('bad')
  throw error
}

export function readValue(ok: boolean): number {
  if (ok) {
    return 7
  }

  throw 'no value'
}

export function main(): void {
  try {
    failString()
  } catch (error) {
    console.log(error)
  }

  try {
    failError()
  } catch (error) {
    console.log(error.name, error.message)
  }

  try {
    console.log(readValue(true))
    console.log(readValue(false))
  } catch (error) {
    console.log(error)
  }
}
`
  const result = compileSource(source, {
    target: 'c'
  })

  assert.deepEqual(result.ir.functionEffects, [
    {
      name: 'failString',
      throws: true,
      throwValueTypes: ['string']
    },
    {
      name: 'failError',
      throws: true,
      throwValueTypes: ['error']
    },
    {
      name: 'readValue',
      throws: true,
      throwValueTypes: ['string']
    },
    {
      name: 'main',
      throws: false,
      throwValueTypes: []
    }
  ])
  assert.match(result.code, /inox_status failString\(inox_value \*inox_error_out\);/)
  assert.match(result.code, /inox_status failError\(inox_value \*inox_error_out\);/)
  assert.match(result.code, /inox_status readValue\(double ok, double \*inox_out, inox_value \*inox_error_out\);/)
  assert.match(result.code, /inox_status_result = INOX_ERR_THROW;\n {2}inox_error_active = 1;\n {2}goto inox_cleanup;/)
  assert.match(
    result.code,
    /if \(inox_error_active\) \{\n {4}\*inox_error_out = inox_error;\n {4}inox_error = inox_undefined_value\(\);\n {2}\}/
  )
  assert.match(
    result.code,
    /inox_status inox_call_status_\d+ = failString\(&inox_error\);\n {4}if \(inox_call_status_\d+ == INOX_ERR_THROW\) \{\n {6}inox_error_active = 1;\n {6}goto inox_try_\d+_catch;/
  )
  assert.match(
    result.code,
    /inox_status inox_call_status_\d+ = failError\(&inox_error\);\n {4}if \(inox_call_status_\d+ == INOX_ERR_THROW\) \{\n {6}inox_error_active = 1;\n {6}goto inox_try_\d+_catch;/
  )
  assert.match(
    result.code,
    /double inox_call_result_\d+ = 0;\n {4}inox_status inox_call_status_\d+ = readValue\(1, &inox_call_result_\d+, &inox_error\);/
  )
  assert.match(
    result.code,
    /inox_try_\d+_catch:\n {4}if \(inox_error\.tag != INOX_TAG_OBJECT \|\| inox_error\.as\.ref == 0\)\s+goto inox_cleanup;\n {4}inox_error_active = 0;\n {4}\{\n {6}inox_value error = inox_error;/
  )
})


test('lowers C class method throws through status error ABI', () => {
  const source = `class TicketError {
  name: string
  message: string

  constructor(message: string) {
    this.name = 'TicketError'
    this.message = message
  }
}

class TicketParser {
  read(): string {
    throw new TicketError('missing')
  }
}

export function parseTicket(): string {
  const parser = new TicketParser()
  return parser.read()
}

export function main(): void {
  try {
    console.log(parseTicket())
  } catch (error) {
    console.log(error)
  }
}
`
  const result = compileSource(source, {
    target: 'c'
  })

  assert.match(
    result.code,
    /static inox_status inox_method_TicketParser_read\(inox_value this, inox_value\* inox_out, inox_value\* inox_error_out\);/
  )
  assert.match(
    result.code,
    /static inox_status inox_method_TicketParser_read\(inox_value this, inox_value\* inox_out, inox_value\* inox_error_out\) \{/
  )
  assert.match(result.code, /inox_status parseTicket\(inox_value \*inox_out, inox_value \*inox_error_out\);/)
  assert.match(
    result.code,
    /inox_status inox_method_status_\d+ = inox_method_TicketParser_read\(parser, &inox_method_result_\d+, &inox_error\);/
  )
  assert.match(
    result.code,
    /inox_status inox_call_status_\d+ = parseTicket\(&inox_call_result_\d+, &inox_error\);\n {4}if \(inox_call_status_\d+ == INOX_ERR_THROW\) \{/
  )
})


test('compiles arrow functions and chain calls to C', () => {
  const source = `export function main(): void {
  const values = [3, 1, 2]
  const result = values.sort((left: number, right: number) => left - right).filter(value => value > 1).map(value => value * 2)
  console.log(result[0], result[1])
}
`
  const c = compileSource(source, {
    target: 'c'
  })

  assert.match(c.code, /inox_array_set\(values, inox_sort_scan_\d+ - 1, inox_sort_right_\d+\)/)
  assert.match(c.code, /inox_array_push\(inox_filter_array_\d+, inox_filter_value_\d+\)/)
  assert.match(c.code, /inox_array_push\(inox_map_array_\d+, inox_number_value/)
})


test('types and lowers crypto.getRandomValues as a bytes-preserving call', () => {
  const source = `export function main(): void {
  const bytes = Buffer.alloc(4)
  const filled = crypto.getRandomValues(bytes)
  console.log(filled.length)
}
`
  const c = compileSource(source, {
    target: 'c'
  })

  assert.deepEqual(c.ir.features, ['binary', 'crypto', 'runtime-values', 'string-bytes'])
  assert.deepEqual(c.ir.runtimeRequirements, ['binary', 'crypto', 'managed-values', 'string-bytes'])
  assert.deepEqual(
    c.ir.globalUsages.map((usage) => usage.path.join('.')),
    ['Buffer.alloc', 'crypto.getRandomValues']
  )

  assert.match(c.code, /#include <stdint\.h>/)
  assert.match(c.code, /#include "inox\/binary\.h"/)
  assert.match(c.code, /#include "inox\/crypto\.h"/)
  assert.doesNotMatch(c.code, /static int inox_os_random_bytes\(uint8_t \*out, size_t len\)/)
  assert.doesNotMatch(c.code, /static inox_status inox_crypto_get_random_values\(inox_value value\)/)
  assert.match(c.code, /if \(inox_crypto_get_random_values\(bytes\) != INOX_OK\)\s+goto inox_cleanup;/)
  assert.match(c.code, /inox_retain\(inox_crypto_bytes_\d+\);/)

  const withoutCryptoMetadata = JSON.parse(JSON.stringify(c.ir))
  stripCryptoRuntimeMetadata(withoutCryptoMetadata)
  assert.throws(
    () => emitCFromIr(withoutCryptoMetadata),
    (error: unknown) => {
      assert.ok(error instanceof CompileError)
      assert.equal(error.diagnostics[0]?.code, 'INOX_C_JS_GLOBAL')
      return true
    }
  )

  assertDiagnostic(
    `export function main(): void {
  crypto.getRandomValues('text')
}
`,
    'INOX_TYPE_MISMATCH'
  )

  assertDiagnostic(
    `export function main(): void {
  crypto.getRandomValues()
}
`,
    'INOX_ARG_COUNT'
  )
})


function stripCryptoRuntimeMetadata(node: unknown): void {
  if (!node || typeof node !== 'object') {
    return
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      stripCryptoRuntimeMetadata(item)
    }
    return
  }

  const record = node as Record<string, unknown>

  delete record.cryptoRuntimeMethod

  for (const value of Object.values(record)) {
    stripCryptoRuntimeMetadata(value)
  }
}


test('collects runtime global roots from target-neutral IR global usages', () => {
  const result = compileSource(
    `export function main(): void {
  console.log('ok')
}
`,
    {
      target: 'c'
    }
  )
  const globalUsages = [
    {
      root: 'http',
      path: ['http', 'createServer']
    },
    {
      root: 'fs',
      path: ['fs', 'promises', 'writeFile']
    },
    {
      root: 'fs',
      path: ['fs', 'promises', 'readFile']
    }
  ]

  assert.deepEqual(result.ir.globalUsages, [])
  assert.deepEqual(
    collectIrGlobalRoots([
      {
        globalUsages
      }
    ]),
    ['fs', 'http']
  )
})


test('lowers Date.now and performance.now to the C time runtime', () => {
  const result = compileSource(
    `export function main(): void {
  const started = Date.now()
  const elapsed = performance.now()
  console.log(started, elapsed)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /#include "inox\/time\.h"/)
  assert.match(result.code, /double started = inox_date_now\(\);/)
  assert.match(result.code, /double elapsed = inox_performance_now\(\);/)
})


test('lowers supported Math calls to C helpers', () => {
  const result = compileSource(
    `export function main(): void {
  const value = Math.floor(3.8) + Math.ceil(2.1) + Math.round(1.6) + Math.trunc(4.9) + Math.fround(16777217) + Math.abs(-5) + Math.min(8, 2) + Math.max(1, 6) + Math.sqrt(9) + Math.sin(0) + Math.cos(0) + Math.random()
  console.log(value)
}
`,
    {
      target: 'c'
    }
  )

  assert.deepEqual(result.ir.globalUsages.map((usage) => usage.path.join('.')).sort(), [
    'Math.abs',
    'Math.ceil',
    'Math.cos',
    'Math.floor',
    'Math.fround',
    'Math.max',
    'Math.min',
    'Math.random',
    'Math.round',
    'Math.sin',
    'Math.sqrt',
    'Math.trunc'
  ])
  assert.match(result.code, /#include <stdint\.h>/)
  assert.match(result.code, /static uint32_t inox_math_random_state = 0x6d2b79f5u;/)
  assert.match(result.code, /static double inox_math_floor\(double value\)/)
  assert.match(result.code, /static double inox_math_fround\(double value\)/)
  assert.match(result.code, /static double inox_math_max\(double left, double right\)/)
  assert.match(result.code, /static double inox_math_sqrt\(double value\)/)
  assert.match(result.code, /static double inox_math_random\(void\)/)
  assert.match(result.code, /inox_math_floor\(3\.8\)/)
  assert.match(result.code, /inox_math_ceil\(2\.1\)/)
  assert.match(result.code, /inox_math_round\(1\.6\)/)
  assert.match(result.code, /inox_math_trunc\(4\.9\)/)
  assert.match(result.code, /inox_math_fround\(16777217\)/)
  assert.match(result.code, /inox_math_abs\(\(-5\)\)/)
  assert.match(result.code, /inox_math_min\(8, 2\)/)
  assert.match(result.code, /inox_math_max\(1, 6\)/)
  assert.match(result.code, /inox_math_sqrt\(9\)/)
  assert.match(result.code, /inox_math_sin\(0\)/)
  assert.match(result.code, /inox_math_cos\(0\)/)
  assert.match(result.code, /inox_math_random\(\)/)

  assertDiagnostic(
    `export function main(): void {
  const value = Math.max(1)
  console.log(value)
}
`,
    'INOX_ARG_COUNT'
  )

  assertDiagnostic(
    `export function main(): void {
  const value = Math.random(1)
  console.log(value)
}
`,
    'INOX_ARG_COUNT'
  )
})


test('configures C Math.random seed through compiler options', () => {
  const result = compileSource(
    `export function main(): void {
  const value = Math.random()
  console.log(value)
}
`,
    {
      target: 'c',
      random: {
        seed: 1
      }
    }
  )

  assert.match(result.code, /static uint32_t inox_math_random_state = 0x00000001u;/)
})


test('configures C Math.random xorshift32 backend through compiler options', () => {
  const result = compileSource(
    `export function main(): void {
  const value = Math.random()
  console.log(value)
}
`,
    {
      target: 'c',
      random: {
        backend: 'xorshift32',
        seed: 1
      }
    }
  )

  assert.match(result.code, /static uint32_t inox_math_random_state = 0x00000001u;/)
  assert.match(result.code, /if \(inox_math_random_state == 0u\) inox_math_random_state = 0x6d2b79f5u;/)
  assert.match(result.code, /value \^= value << 13;/)
  assert.match(result.code, /value \^= value >> 17;/)
  assert.match(result.code, /value \^= value << 5;/)
  assert.doesNotMatch(result.code, /1664525u \+ 1013904223u/)
})


test('configures C Math.random os backend through compiler options', () => {
  const result = compileSource(
    `export function main(): void {
  const value = Math.random()
  console.log(value)
}
`,
    {
      target: 'c',
      random: {
        backend: 'os',
        seed: 1
      }
    }
  )

  assert.match(result.code, /#define _CRT_RAND_S/)
  assert.match(result.code, /#include <sys\/random\.h>/)
  assert.match(result.code, /static uint32_t inox_math_random_state = 0x00000001u;/)
  assert.match(result.code, /static int inox_os_random_bytes\(uint8_t \*out, size_t len\)/)
  assert.match(result.code, /rand_s\(&value\)/)
  assert.match(result.code, /arc4random_buf\(out, len\);/)
  assert.match(result.code, /getrandom\(out \+ filled, len - filled, 0\)/)
  assert.match(result.code, /open\("\/dev\/urandom", O_RDONLY\)/)
  assert.match(result.code, /if \(!inox_os_random_bytes\(\(uint8_t \*\)&value, sizeof\(value\)\)\) \{/)
  assert.match(result.code, /inox_math_random_state = inox_math_random_state \* 1664525u \+ 1013904223u;/)
  assert.doesNotMatch(result.code, /value \^= value << 13;/)
})


test('reports JS stdlib globals with stable C diagnostics', () => {
  assert.throws(
    () =>
      compileSource(
    `import fs from 'node:fs'

export function main(): void {
  const text = fs.promises.readFile('/tmp/value.txt', 'utf8')
  const parsed = Date.parse('2026-06-09T00:00:00Z')
  const server = http.createServer((request, response) => {
    response.end('ok')
  })
  const promise = Promise.resolve(parsed)
  console.log(text, server, promise)
}
`,
        {
          target: 'c',
          loopBackend: 'libuv'
        }
      ),
    (error) => {
      if (!(error instanceof CompileError)) {
        return false
      }

      assert.equal(error.diagnostics.some((item) => item.code === 'INOX_C_JS_GLOBAL'), true)
      return true
    }
  )

  for (const source of [
    `export function main(): void {
  const parsed = Date.parse('2026-06-09T00:00:00Z')
  console.log(parsed)
}
`,
    `export function main(): void {
  const server = http.createServer((request, response) => {
    response.end('ok')
  })
  console.log(server)
}
`,
    `export function main(): void {
  const promise = Promise.all([])
  console.log(promise)
}
`
  ]) {
    assertDiagnostic(source, 'INOX_C_JS_GLOBAL', {
      target: 'c'
    })
  }
})


test('reports embedded profile capability diagnostics from IR global usages', () => {
  const source = `import fs from 'node:fs'

function onTimer(): void {
  console.log('timer')
}

export function main(): void {
  const wall = Date.now()
  const monotonic = performance.now()
  const timeout = setTimeout(onTimer, 1)
  fs.promises.writeFile('/private/tmp/inox-embedded-profile.txt', 'saved')
  clearTimeout(timeout)
  console.log('ok', wall, monotonic)
}
`

  assert.throws(
    () => {
      compileSource(source, {
        target: 'c',
        profile: 'embedded'
      })
    },
    (error) => {
      if (!(error instanceof CompileError)) {
        return false
      }

      assert.equal(
        error.diagnostics.every((item) => item.code === 'INOX_CAPABILITY'),
        true
      )
      assert.deepEqual(
        error.diagnostics.map((item) => item.message),
        [
          'embedded profile requires wall-clock capability for Date.now',
          'embedded profile requires monotonic-clock capability for performance.now',
          'embedded profile requires timers capability for setTimeout',
          'embedded profile requires filesystem capability for fs.promises.writeFile',
          'embedded profile requires timers capability for clearTimeout'
        ]
      )
      return true
    }
  )

  const enabled = compileSource(source, {
    target: 'c',
    profile: 'embedded',
    capabilities: {
      fs: true,
      monotonicClock: true,
      timers: true,
      wallClock: true
    }
  })

  assert.match(enabled.code, /#include "inox\/fs\.h"/)
  assert.match(enabled.code, /#include "inox\/time\.h"/)
  assert.match(enabled.code, /inox_loop_set_timeout/)
})


test('reports embedded entropy capability diagnostics for OS Math.random backend', () => {
  const source = `export function main(): void {
  const value = Math.random()
  console.log(value)
}
`

  assert.throws(
    () => {
      compileSource(source, {
        target: 'c',
        profile: 'embedded',
        random: {
          backend: 'os'
        }
      })
    },
    (error) => {
      if (!(error instanceof CompileError)) {
        return false
      }

      assert.equal(
        error.diagnostics.every((item) => item.code === 'INOX_CAPABILITY'),
        true
      )
      assert.deepEqual(
        error.diagnostics.map((item) => item.message),
        ['embedded profile requires entropy capability for Math.random']
      )
      return true
    }
  )

  const enabled = compileSource(source, {
    target: 'c',
    profile: 'embedded',
    capabilities: {
      entropy: true
    },
    random: {
      backend: 'os'
    }
  })

  assert.match(enabled.code, /inox_os_random_bytes/)
})


test('reports embedded entropy capability diagnostics for crypto.getRandomValues', () => {
  const source = `export function main(): void {
  const bytes = Buffer.alloc(4)
  crypto.getRandomValues(bytes)
  console.log(bytes.length)
}
`

  assert.throws(
    () => {
      compileSource(source, {
        target: 'c',
        profile: 'embedded'
      })
    },
    (error) => {
      if (!(error instanceof CompileError)) {
        return false
      }

      assert.equal(
        error.diagnostics.every((item) => item.code === 'INOX_CAPABILITY'),
        true
      )
      assert.deepEqual(
        error.diagnostics.map((item) => item.message),
        ['embedded profile requires entropy capability for crypto.getRandomValues']
      )
      return true
    }
  )

  const enabled = compileSource(source, {
    target: 'c',
    profile: 'embedded',
    capabilities: {
      entropy: true
    }
  })

  assert.match(enabled.code, /inox_crypto_get_random_values/)
})


test('reports C compile budget diagnostics from target-neutral IR metadata', () => {
  const source = `export function main(): void {
  const values = [1, 2, 3]
  console.log(values.length)
}
`

  assert.throws(
    () => {
      compileSource(source, {
        target: 'c',
        budgets: {
          maxFeatures: 0,
          maxRuntimeRequirements: 0
        }
      })
    },
    (error) => {
      if (!(error instanceof CompileError)) {
        return false
      }

      assert.deepEqual(
        error.diagnostics.map((item) => item.code),
        ['INOX_BUDGET', 'INOX_BUDGET']
      )
      assert.deepEqual(
        error.diagnostics.map((item) => item.message),
        [
          'C target uses 3 IR features (collections, runtime-values, string-bytes), exceeding maxFeatures budget 0',
          'C target uses 3 runtime requirements (collections, managed-values, string-bytes), exceeding maxRuntimeRequirements budget 0'
        ]
      )
      return true
    }
  )

  const result = compileSource(source, {
    target: 'c',
    budgets: {
      maxFeatures: 3,
      maxRuntimeRequirements: 3
    }
  })

  assert.match(result.code, /#include "inox\/array\.h"/)
})


test('drives C JS global diagnostics from target-neutral IR global usages', () => {
  const result = compileSource(
    `export function main(): void {
  console.log('ok')
}
`,
    {
      target: 'c'
    }
  )

  assert.deepEqual(result.ir.globalUsages, [])
  assert.deepEqual(
    collectIrGlobalRoots([
      {
        globalUsages: [
          {
            root: 'crypto',
            path: ['crypto']
          }
        ]
      }
    ]),
    ['crypto']
  )
  assert.throws(
    () =>
      emitCFromIr({
        ...result.ir,
        globalUsages: [
          {
            root: 'crypto',
            path: ['crypto'],
            loc: {
              line: 1,
              column: 1
            }
          }
        ]
      }),
    (error) => {
      if (!(error instanceof CompileError)) {
        return false
      }

      assert.equal(error.diagnostics[0]?.code, 'INOX_C_JS_GLOBAL')
      return true
    }
  )
})


test('accepts valid TypeScript source files as canonical input', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'inox-ts-modules-'))

  try {
    await writeFile(
      join(dir, 'lib.ts'),
      `export function greet(): string {
  return 'from ts'
}
`
    )
    await writeFile(
      join(dir, 'main.ts'),
      `import { greet } from './lib.ts'

export function main(): void {
  console.log(greet())
}
`
    )

    const result = await compileFile(join(dir, 'main.ts'), {
      target: 'c'
    })

    assert.match(result.code, /from ts/)
    assert.equal(
      result.graph.modules.every((module) => module.path.endsWith('.ts')),
      true
    )
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('rejects duplicate declarations in the same scope', () => {
  assertDiagnostic(
    `export function main(): void {
  const value = 1
  const value = 2
}
`,
    'INOX_REDECLARED_NAME'
  )
})


test('rejects use before declaration in the current compiler slice', () => {
  assertDiagnostic(
    `export function main(): void {
  console.log(value)
  const value = 1
}
`,
    'INOX_UNKNOWN_NAME'
  )
})


test('rejects assignment to const bindings', () => {
  assertDiagnostic(
    `export function main(): void {
  const value = 1
  value = 2
}
`,
    'INOX_ASSIGN_CONST'
  )
})


test('rejects unknown names', () => {
  assertDiagnostic(
    `export function main(): void {
  console.log(missing)
}
`,
    'INOX_UNKNOWN_NAME'
  )
})


test('rejects variable type mismatches', () => {
  assertDiagnostic(
    `export function main(): void {
  const value: number = 'Ada'
}
`,
    'INOX_TYPE_MISMATCH'
  )
})


test('rejects equality type mismatches', () => {
  assertDiagnostic(
    `export function main(): void {
  const same = 1 === '1'
  console.log(same)
}
`,
    'INOX_TYPE_MISMATCH'
  )

  assertDiagnostic(
    `export function main(): void {
  const same = 1 == '1'
  console.log(same)
}
`,
    'INOX_TYPE_MISMATCH'
  )
})


test('rejects function argument type mismatches', () => {
  assertDiagnostic(
    `function greet(name: string): void {
  console.log(name)
}

export function main(): void {
  greet(1)
}
`,
    'INOX_TYPE_MISMATCH'
  )
})


test('rejects function argument count mismatches', () => {
  assertDiagnostic(
    `function greet(name: string): void {
  console.log(name)
}

export function main(): void {
  greet()
}
`,
    'INOX_ARG_COUNT'
  )
})


test('rejects return type mismatches', () => {
  assertDiagnostic(
    `function getValue(): number {
  return 'Ada'
}

export function main(): void {
  console.log(getValue())
}
`,
    'INOX_TYPE_MISMATCH'
  )
})


test('keeps block declarations scoped to the block', () => {
  assertDiagnostic(
    `export function main(): void {
  if (true) {
    const hidden = 1
  }

  console.log(hidden)
}
`,
    'INOX_UNKNOWN_NAME'
  )
})


test('keeps while body declarations scoped to the body', () => {
  assertDiagnostic(
    `export function main(): void {
  while (false) {
    const hidden = 1
  }

  console.log(hidden)
}
`,
    'INOX_UNKNOWN_NAME'
  )
})


test('keeps for initializer scoped to the loop', () => {
  assertDiagnostic(
    `export function main(): void {
  for (let index = 0; index < 1; index = index + 1) {
    console.log(index)
  }

  console.log(index)
}
`,
    'INOX_UNKNOWN_NAME'
  )
})


test('rejects assignment to const for of bindings', () => {
  assertDiagnostic(
    `export function main(): void {
  for (const value of [1]) {
    value = 2
  }
}
`,
    'INOX_ASSIGN_CONST'
  )
})


test('rejects for in with a stable diagnostic code', () => {
  assertDiagnostic(
    `export function main(): void {
  const value = { name: 'Ada' }

  for (const key in value) {
    console.log(key)
  }
}
`,
    'INOX_NO_FOR_IN'
  )
})


test('rejects break outside loops and switches', () => {
  assertDiagnostic(
    `export function main(): void {
  break
}
`,
    'INOX_BREAK_OUTSIDE'
  )
})


test('rejects continue outside loops', () => {
  assertDiagnostic(
    `export function main(): void {
  continue
}
`,
    'INOX_CONTINUE_OUTSIDE'
  )
})


test('allows numeric truthiness conditions', () => {
  const result = compileSource(
    `export function main(): void {
  if (1) {
    console.log('one')
  }

  let count = 1

  while (count) {
    count = count - 1
  }

  for (let index = 1; index; index = index - 1) {
    console.log(index)
  }
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /if \(1\) \{/)
  assert.match(result.code, /while \(count\) \{/)
  assert.match(result.code, /for \(double index = 1; index; \(index = \(index - 1\)\)\) \{/)
})


test('allows C string truthiness conditions', () => {
  const result = compileSource(
    `function present(name: string | null): number {
  if (name) {
    return name.length
  }

  return 0
}

export function main(): void {
  console.log(present('Ada'))
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /inox_value_truthy/)
})


test('narrows nullable locals after non-null assignments', () => {
  const result = compileSource(
    `function readLength(enabled: boolean): number {
  let name: string | null = null

  if (enabled) {
    name = 'Ada'
    return name.length
  }

  return 0
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /inox_string_code_unit_length_parts/)
})


test('narrows nullable strings after literal equality checks', () => {
  const result = compileSource(
    `function readLength(kind: string | null): number {
  if (kind === 'number' || kind === 'boolean') {
    return kind.length
  }

  return 0
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /inox_string_code_unit_length_parts/)
})


test('rejects duplicate switch default branches', () => {
  assertDiagnostic(
    `export function main(): void {
  switch (1) {
    default:
      console.log('a')
    default:
      console.log('b')
  }
}
`,
    'INOX_DUPLICATE_DEFAULT'
  )
})


test('rejects switch type mismatches', () => {
  assertDiagnostic(
    `export function main(): void {
  switch (1) {
    case 'one':
      console.log('bad')
  }
}
`,
    'INOX_SWITCH_TYPE'
  )

  assertDiagnostic(
    `export function main(): void {
  const value = { code: 1 }

  switch (value) {
    default:
      console.log('bad')
  }
}
`,
    'INOX_SWITCH_TYPE'
  )
})
