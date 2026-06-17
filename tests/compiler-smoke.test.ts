import test from 'node:test'
import { emitPreparedNumberExpression } from '../src/compiler/c/values/expressions.ts'
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

  assert.match(result.code, /void ccjs_main\(void\) \{/)
  assert.match(result.code, /printf\("%s\\n", "hello"\);/)
  assert.match(result.code, /int main\(void\) \{/)
  assert.doesNotMatch(result.code, /int main\(void\) \{[\s\S]*ccjs_main\(\);/)
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
  assert.match(result.code, /#include "ccjs\/console\.h"/)
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

  assert.match(result.code, /#include "ccjs\/console\.h"/)
  assert.match(result.code, /ccjs_console_printf\(CCJS_CONSOLE_STDERR, "%s\\n", "heads up"\)/)
  assert.match(result.code, /ccjs_console_printf\(CCJS_CONSOLE_STDERR, "%s\\n", "failed"\)/)
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
    emitCObjectLiteralValueExpression: () => ({ lines: [], expression: 'ccjs_undefined_value()' }),
    emitCValueExpression: () => ({ lines: [], expression: 'ccjs_undefined_value()' }),
    emitNullableFunctionValueExpression: () => ({ lines: [], expression: 'ccjs_undefined_value()' }),
    emitNullableScalarValueExpression: () => ({ lines: [], expression: 'ccjs_null_value()' }),
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
  assert.match(result.code, /ccjs_array_new\(&ccjs_default_allocator, 3, &values\)/)
  assert.match(result.code, /\(values\.tag == CCJS_TAG_ARRAY\)/)
  assert.match(result.code, /\(ccjs_number_value\(7\)\.tag == CCJS_TAG_ARRAY\)/)
})

test('lowers Object.values calls to C object value arrays', () => {
  const result = compileSource(
    `export function main(): void {
  const user = { score: 7 }
  const values = Object.values(user)
  const first = Object.values(user)[0]
  const entries = Object.entries(user)
  const firstEntry = Object.entries(user)[0]
  console.log(user, values, first, entries, firstEntry)
}
`,
    {
      target: 'c'
    }
  )

  assert.deepEqual(
    result.ir.globalUsages.map((usage) => usage.path.join('.')),
    ['Object.values', 'Object.values', 'Object.entries', 'Object.entries']
  )
  assert.match(result.code, /ccjs_object_values\(&ccjs_default_allocator, user, &ccjs_object_values_\d+\)/)
  assert.match(result.code, /ccjs_object_entries\(&ccjs_default_allocator, user, &ccjs_object_entries_\d+\)/)
  assert.match(result.code, /ccjs_array_get\(ccjs_object_values_\d+, 0, &ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_array_get\(ccjs_object_entries_\d+, 0, &ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_console_format_value\(&ccjs_default_allocator, user, &ccjs_log_value_\d+\)/)
  assert.match(result.code, /ccjs_console_format_value\(&ccjs_default_allocator, values, &ccjs_log_value_\d+\)/)
  assert.match(result.code, /ccjs_console_format_value\(&ccjs_default_allocator, first, &ccjs_log_value_\d+\)/)
  assert.match(result.code, /ccjs_console_format_value\(&ccjs_default_allocator, entries, &ccjs_log_value_\d+\)/)
  assert.match(result.code, /ccjs_console_format_value\(&ccjs_default_allocator, firstEntry, &ccjs_log_value_\d+\)/)
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
  assert.match(result.code, /for \(size_t ccjs_for_index_\d+ = 0; ccjs_for_index_\d+ < 2; ccjs_for_index_\d+ \+= 1\) \{/)
  assert.match(result.code, /ccjs_for_value_\d+\.tag != CCJS_TAG_OBJECT/)
  assert.match(result.code, /ccjs_value record = ccjs_for_value_\d+;/)
  assert.match(result.code, /ccjs_object_values\(&ccjs_default_allocator, record, &ccjs_object_values_\d+\)/)
  assert.match(result.code, /ccjs_object_entries\(&ccjs_default_allocator, record, &ccjs_object_entries_\d+\)/)
  assert.match(result.code, /ccjs_array_get\(values, 0, &ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_array_get\(values, 1, &ccjs_value_\d+\)/)
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
  assert.match(result.code, /ccjs_json_parse\(&ccjs_default_allocator, "\[\{\\"first\\":10,\\"second\\":20\},\{\\"first\\":30,\\"second\\":40\}\]"/)
  assert.match(result.code, /rows\.tag != CCJS_TAG_ARRAY/)
  assert.match(result.code, /ccjs_array_len\(rows, &ccjs_for_length_\d+\)/)
  assert.match(result.code, /ccjs_for_value_\d+\.tag != CCJS_TAG_OBJECT/)
  assert.match(result.code, /ccjs_object_values\(&ccjs_default_allocator, row, &ccjs_object_values_\d+\)/)
  assert.match(result.code, /ccjs_object_entries\(&ccjs_default_allocator, row, &ccjs_object_entries_\d+\)/)
})

test('erases TypeScript as expressions before C emission', () => {
  const result = compileSource(
    `export function main(): void {
  const value = 42 as number
  const label = 'answer' as string
  const record = { kind: 'ready' as const, value }
  console.log(label, record.value)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /const double value = 42;/)
  assert.match(result.code, /const char \*label = "answer";/)
  assert.match(result.code, /ccjs_object_init_known\(record, 1, ccjs_number_value\(value\)\)/)
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

  assert.match(result.code, /#include "ccjs\/object\.h"/)
  assert.match(result.code, /static const ccjs_field_info ccjs_shape_user_\d+_fields\[\]/)
  assert.match(result.code, /ccjs_value user = ccjs_undefined_value\(\);/)
  assert.match(result.code, /ccjs_object_new\(&ccjs_default_allocator/)
  assert.match(result.code, /ccjs_string_from_literal\(&ccjs_default_allocator, "Ada", 3/)
  assert.match(result.code, /ccjs_object_init_known\(user, 1, ccjs_number_value\(42\)\)/)
  assert.match(result.code, /ccjs_object_init_known\(user, 2, ccjs_bool_value\(true\)\)/)
  assert.match(
    result.code,
    /ccjs_cleanup:\n {2}ccjs_release\(ccjs_value_\d+\);\n {2}ccjs_release\(user\);\n {2}return;/
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

  assert.match(result.code, /ccjs_object_get\(node, "optional", 8, &ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_object_init_known\(ccjs_object_\d+, 0, ccjs_bool_value\(\(\(ccjs_value_\d+\.tag == CCJS_TAG_BOOL && ccjs_value_\d+\.as\.boolean == true\)\) != 0\)\)/)
  assert.match(result.code, /ccjs_object_init_known\(ccjs_object_\d+, 1, ccjs_number_value\(\(min \+ max\)\)\)/)
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

  assert.match(result.code, /ccjs_map_new\(&ccjs_default_allocator, &ccjs_map_\d+\)/)
  assert.match(result.code, /ccjs_set_new\(&ccjs_default_allocator, &ccjs_set_\d+\)/)
  assert.match(result.code, /ccjs_object_init_known\(bag, 0, ccjs_map_\d+\)/)
  assert.match(result.code, /ccjs_object_init_known\(bag, 1, ccjs_set_\d+\)/)
  assert.match(result.code, /ccjs_map_set\(ccjs_value_\d+, ccjs_value_\d+, ccjs_number_value\(7\)\)/)
  assert.match(result.code, /ccjs_set_add\(ccjs_value_\d+, ccjs_value_\d+\)/)
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
    /if \(ccjs_object_new\(&ccjs_default_allocator, &ccjs_shape_user_\d+, &user\) != CCJS_OK\)\s+goto ccjs_cleanup;/
  )
  assert.match(
    result.code,
    /ccjs_cleanup:\n {2}ccjs_release\(ccjs_value_\d+\);\n {2}ccjs_release\(user\);\n {2}return \(int\)ccjs_return;/
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

  assert.match(result.code, /goto ccjs_cleanup;/)
  assert.match(
    result.code,
    /ccjs_cleanup:\n {2}ccjs_release\(ccjs_value_\d+\);\n {2}ccjs_release\(user\);\n {2}return;/
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

  assert.match(result.code, /double getScore\(void\) \{\n {2}double ccjs_return = 0;/)
  assert.match(result.code, /ccjs_return = score;\n {2}goto ccjs_cleanup;/)
  assert.match(
    result.code,
    /ccjs_cleanup:\n {2}ccjs_release\(ccjs_field_\d+\);\n {2}ccjs_release\(user\);\n {2}return ccjs_return;/
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

  assert.match(result.code, /ccjs_object_get_known\(user, 0, &ccjs_field_\d+\)/)
  assert.match(result.code, /const double score = ccjs_field_\d+\.as\.number;/)
  assert.match(result.code, /ccjs_object_get_known\(user, 1, &ccjs_field_\d+\)/)
  assert.match(result.code, /const double active = ccjs_field_\d+\.as\.boolean \? 1 : 0;/)
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

  assert.match(result.code, /ccjs_value_\d+ = pair\(\);/)
  assert.match(result.code, /ccjs_object_get_known\(ccjs_value_\d+, 0, &ccjs_value_\d+\)/)
  assert.match(result.code, /const double score = ccjs_value_\d+\.as\.number;/)
  assert.match(result.code, /ccjs_object_get_known\(ccjs_value_\d+, 1, &ccjs_value_\d+\)/)
  assert.match(result.code, /const double active = \(ccjs_value_\d+\.as\.boolean \? 1 : 0\);/)
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

  assert.match(result.code, /ccjs_object_get\(extra, "child", 5, &ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_object_get_known\(child, 0, &ccjs_log_value_\d+\)/)
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

  assert.match(result.code, /ccjs_object_get\(extra, "score", 5, &ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_value_\d+\.tag != CCJS_TAG_NUMBER/)
  assert.match(result.code, /const double score = ccjs_value_\d+\.as\.number;/)
  assert.match(result.code, /ccjs_object_get\(extra, "active", 6, &ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_value_\d+\.tag != CCJS_TAG_BOOL/)
  assert.match(result.code, /const double active = \(ccjs_value_\d+\.as\.boolean \? 1 : 0\);/)
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

  assert.match(result.code, /ccjs_object_get\(node, "loc", 3, &ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_object_get\(ccjs_value_\d+, "line", 4, &ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_value_\d+\.tag != CCJS_TAG_NUMBER/)
  assert.match(result.code, /ccjs_object_get\(node, "meta", 4, &ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_object_get\(ccjs_value_\d+, "active", 6, &ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_value_\d+\.tag != CCJS_TAG_BOOL/)
  assert.match(result.code, /const double active = \(ccjs_value_\d+\.as\.boolean \? 1 : 0\);/)
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

  assert.match(result.code, /ccjs_object_get\(extra, "name", 4, &ccjs_value_\d+\)/)
  assert.match(result.code, /if \(ccjs_value_truthy\(ccjs_value_\d+\) \? 1 : 0\) \{/)
  assert.match(result.code, /ccjs_object_get\(extra, "active", 6, &ccjs_value_\d+\)/)
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

  assert.match(result.code, /ccjs_object_get\(extra, "name", 4, &ccjs_value_\d+\)/)
  assert.match(result.code, /if \(!\(ccjs_value_truthy\(ccjs_value_\d+\) \? 1 : 0\)\) \{/)
  assert.match(result.code, /ccjs_object_get\(extra, "active", 6, &ccjs_value_\d+\)/)
  assert.match(result.code, /const double inactive = \(!\(ccjs_value_truthy\(ccjs_value_\d+\) \? 1 : 0\)\);/)
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

  assert.match(result.code, /ccjs_object_set\(extra, "child", 5, ccjs_(?:value|object)_\d+\)/)
  assert.match(result.code, /ccjs_object_get\(extra, "child", 5, &ccjs_value_\d+\)/)
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

  assert.match(result.code, /ccjs_object_get\(node, "type", 4, &ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_string_cmp_value_\d+\.tag == CCJS_TAG_STRING/)
  assert.match(result.code, /memcmp\(\(\(ccjs_string\*\)ccjs_string_cmp_value_\d+\.as\.ref\)->bytes, "Reference", 9\)/)
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

  assert.match(result.code, /ccjs_object_get\(node, "init", 4, &ccjs_value_\d+\)/)
  assert.match(result.code, /!\(ccjs_value_\d+\.tag == CCJS_TAG_NULL \|\| ccjs_value_\d+\.tag == CCJS_TAG_UNDEFINED\)/)
  assert.match(result.code, /ccjs_value_\d+\.tag == CCJS_TAG_NULL \|\| ccjs_value_\d+\.tag == CCJS_TAG_UNDEFINED/)
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

  assert.match(result.code, /ccjs_object_get\(node, "optional", 8, &ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_value_\d+\.tag == CCJS_TAG_BOOL && ccjs_value_\d+\.as\.boolean == true/)
  assert.match(result.code, /ccjs_object_get\(node, "readonly", 8, &ccjs_value_\d+\)/)
  assert.match(result.code, /!\(ccjs_value_\d+\.tag == CCJS_TAG_BOOL && ccjs_value_\d+\.as\.boolean == false\)/)
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

  assert.match(result.code, /ccjs_object_get\(node, "path", 4, &ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_array_len\(ccjs_value_\d+, &ccjs_array_len_\d+\)/)
  assert.match(result.code, /ccjs_object_get\(node, "fields", 6, &ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_array_len\(ccjs_value_\d+, &ccjs_array_len_\d+\)/)
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

  assert.match(result.code, /ccjs_object_get\(node, "args", 4, &ccjs_array_value_\d+\)/)
  assert.match(result.code, /ccjs_array_get\(ccjs_array_value_\d+, 0, &ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_array_status_\d+ == CCJS_ERR_FIELD/)
  assert.match(result.code, /ccjs_value_\d+ = ccjs_undefined_value\(\);/)
  assert.match(result.code, /!\(ccjs_value_\d+\.tag == CCJS_TAG_NULL \|\| ccjs_value_\d+\.tag == CCJS_TAG_UNDEFINED\)/)
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

  assert.match(result.code, /ccjs_object_get\(node, "args", 4, &ccjs_array_value_\d+\)/)
  assert.match(result.code, /ccjs_array_get\(ccjs_array_value_\d+, 0, &ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_object_get\(ccjs_value_\d+, "type", 4, &ccjs_value_\d+\)/)
  assert.match(result.code, /memcmp\(\(\(ccjs_string\*\)ccjs_string_cmp_value_\d+\.as\.ref\)->bytes, "Literal", 7\)/)
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

  assert.match(result.code, /ccjs_object_get\(node, "args", 4, &ccjs_array_value_\d+\)/)
  assert.match(result.code, /ccjs_array_get\(ccjs_array_value_\d+, \(size_t\)\(index\), &ccjs_value_\d+\)/)
  assert.match(result.code, /arg = ccjs_value_\d+;/)
  assert.match(result.code, /!\(arg\.tag == CCJS_TAG_NULL \|\| arg\.tag == CCJS_TAG_UNDEFINED\)/)
  assert.match(result.code, /ccjs_object_get\(arg, "type", 4, &ccjs_value_\d+\)/)
  assert.match(result.code, /memcmp\(\(\(ccjs_string\*\)ccjs_string_cmp_value_\d+\.as\.ref\)->bytes, "Literal", 7\)/)
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

  assert.match(result.code, /ccjs_object_get_known\(source, 0, &ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_object_set_known\(target, 0, ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_object_get_known\(source, 2, &ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_object_set_known\(target, 2, ccjs_value_\d+\)/)
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

  assert.match(result.code, /ccjs_array_get\(diagnostics, \(size_t\)\(index\), &ccjs_value_\d+\)/)
  assert.match(result.code, /item = ccjs_value_\d+;/)
  assert.match(result.code, /ccjs_object_get_known\(item, 1, &ccjs_expr_value_\d+\)/)
  assert.match(result.code, /ccjs_object_get_known\(item, 2, &ccjs_expr_value_\d+\)/)
  assert.match(result.code, /const double total = \(ccjs_expr_value_\d+\.as\.number \+ ccjs_expr_value_\d+\.as\.number\);/)
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

  assert.match(result.code, /ccjs_object_get_known\(user, 0, &ccjs_field_\d+\)/)
  assert.match(
    result.code,
    /if \(ccjs_field_\d+\.tag != CCJS_TAG_STRING \|\| ccjs_field_\d+\.as\.ref == 0\)\s+goto ccjs_cleanup;/
  )
  assert.match(result.code, /const ccjs_string \*name = \(ccjs_string \*\)ccjs_field_\d+\.as\.ref;/)
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

  assert.match(result.code, /ccjs_object_set_known\(user, 0, ccjs_number_value\(42\)\)/)
  assert.match(result.code, /ccjs_object_set_known\(user, 1, ccjs_bool_value\(true\)\)/)
  assert.match(result.code, /ccjs_string_from_literal\(&ccjs_default_allocator, "Grace", 5/)
  assert.match(result.code, /ccjs_object_set_known\(user, 2, ccjs_value_\d+\)/)
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

  assert.match(result.code, /ccjs_object_get\(user, "score", 5, &ccjs_field_\d+\)/)
  assert.match(result.code, /const double score = ccjs_field_\d+\.as\.number;/)
  assert.match(result.code, /ccjs_object_get\(user, "active", 6, &ccjs_field_\d+\)/)
  assert.match(result.code, /const double active = ccjs_field_\d+\.as\.boolean \? 1 : 0;/)
  assert.match(result.code, /ccjs_object_get\(user, "name", 4, &ccjs_field_\d+\)/)
  assert.match(result.code, /const ccjs_string \*name = \(ccjs_string \*\)ccjs_field_\d+\.as\.ref;/)
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

  assert.match(result.code, /ccjs_object_set\(user, "score", 5, ccjs_number_value\(42\)\)/)
  assert.match(result.code, /ccjs_object_set\(user, "active", 6, ccjs_bool_value\(true\)\)/)
  assert.match(result.code, /ccjs_string_from_literal\(&ccjs_default_allocator, "Grace", 5/)
  assert.match(result.code, /ccjs_object_set\(user, "name", 4, ccjs_value_\d+\)/)
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

  assert.match(result.code, /const ccjs_string \*name = \(ccjs_string \*\)ccjs_field_\d+\.as\.ref;/)
  assert.match(result.code, /const ccjs_string \*again = name;/)
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

  assert.match(result.code, /ccjs_string_from_literal\(&ccjs_default_allocator, "unknown", 7, &ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_object_get\(symbol, "valueType", 9, &ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_value_\d+\.tag != CCJS_TAG_STRING \|\| ccjs_value_\d+\.as\.ref == 0/)
  assert.match(result.code, /valueType = \(ccjs_string\*\)ccjs_value_\d+\.as\.ref;/)
  assert.match(result.code, /ccjs_string\* ccjs_log_string_\d+ = \(ccjs_string\*\)ccjs_value_\d+\.as\.ref;/)
  assert.match(result.code, /printf\("%\.\*s\\n", \(int\)ccjs_log_string_\d+->len, ccjs_log_string_\d+->bytes\);/)
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

  assert.match(result.code, /void greet\(ccjs_value ccjs_param_name\);/)
  assert.match(result.code, /ccjs_value echo\(ccjs_value ccjs_param_name\);/)
  assert.match(
    result.code,
    /if \(ccjs_param_name\.tag != CCJS_TAG_STRING \|\| ccjs_param_name\.as\.ref == 0\)\s+goto ccjs_cleanup;/
  )
  assert.match(result.code, /ccjs_string \*name = \(ccjs_string \*\)ccjs_param_name\.as\.ref;/)
  assert.match(result.code, /greet\(ccjs_value_\d+\);/)
  assert.match(result.code, /echo\(ccjs_value_\d+\)/)
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

  assert.match(result.code, /double length\(ccjs_value ccjs_param_name\);/)
  assert.match(result.code, /ccjs_string_from_literal\(&ccjs_default_allocator, "Ada", 3, &ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_object_get_known\(user, 0, &ccjs_value_\d+\)/)
  assert.match(result.code, /const double total = \(length\(ccjs_value_\d+\) \+ length\(ccjs_value_\d+\)\);/)
  assert.match(result.code, /printf\("%g %g\\n", \(\(double\)length\(ccjs_value_\d+\)\), \(\(double\)total\)\);/)
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

  assert.match(result.code, /ccjs_value getName\(void\);/)
  assert.match(result.code, /ccjs_value getName\(void\) \{\n {2}ccjs_value ccjs_return = ccjs_undefined_value\(\);/)
  assert.match(
    result.code,
    /ccjs_return = ccjs_value_\d+;\n {2}if \(ccjs_return\.tag != CCJS_TAG_STRING \|\| ccjs_return\.as\.ref == 0\)\s+goto ccjs_cleanup;\n {2}ccjs_retain\(ccjs_return\);\n {2}goto ccjs_cleanup;/
  )
  assert.match(result.code, /return ccjs_return;/)
  assert.match(
    result.code,
    /ccjs_value ccjs_value_\d+ = ccjs_undefined_value\(\);\n {2}ccjs_release\(ccjs_value_\d+\);\n {2}ccjs_value_\d+ = ccjs_undefined_value\(\);\n {2}ccjs_value_\d+ = getName\(\);/
  )
  assert.match(result.code, /const ccjs_string \*name = \(ccjs_string \*\)ccjs_value_\d+\.as\.ref;/)
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

  assert.match(result.code, /ccjs_object_get_known\(user, 0, &ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_return = ccjs_value_\d+;/)
  assert.match(result.code, /return ccjs_return;/)
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

  assert.match(result.code, /ccjs_object_get\(user, "name", 4, &ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_array_get\(values, 0, &ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_value getObjectName\(void\);/)
  assert.match(result.code, /ccjs_value getArrayName\(void\);/)
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

  assert.match(result.code, /ccjs_value ccjs_value_\d+ = ccjs_undefined_value\(\);/)
  assert.match(result.code, /ccjs_value_\d+ = getName\(\);/)
  assert.match(result.code, /ccjs_string \*ccjs_log_string_\d+ = \(ccjs_string \*\)ccjs_value_\d+\.as\.ref;/)
  assert.match(result.code, /printf\("%\.\*s\\n", \(int\)ccjs_log_string_\d+->len, ccjs_log_string_\d+->bytes\);/)
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
    /ccjs_string_concat_parts\(&ccjs_default_allocator, name->bytes, name->len, " ", 1, &ccjs_value_\d+\)/
  )
  assert.match(
    result.code,
    /ccjs_string_concat_parts\(&ccjs_default_allocator, ccjs_cmp_string_\d+->bytes, ccjs_cmp_string_\d+->len, ccjs_cmp_string_\d+->bytes, ccjs_cmp_string_\d+->len, &ccjs_value_\d+\)/
  )
  assert.match(
    result.code,
    /ccjs_string_concat_parts\(&ccjs_default_allocator, ccjs_cmp_string_\d+->bytes, ccjs_cmp_string_\d+->len, "!", 1, &ccjs_value_\d+\)/
  )
  assert.match(result.code, /const ccjs_string \*message = \(ccjs_string \*\)ccjs_value_\d+\.as\.ref;/)
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
    'CCJS_C_STRING_EXPR',
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
  assert.match(result.code, /ccjs_object_get_known\(user, 0, &ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_array_get\(values, 0, &ccjs_value_\d+\)/)
  assert.match(
    result.code,
    /const double sameRuntime = \(ccjs_cmp_string_\d+->len == ccjs_cmp_string_\d+->len && memcmp\(ccjs_cmp_string_\d+->bytes, ccjs_cmp_string_\d+->bytes, ccjs_cmp_string_\d+->len\) == 0\);/
  )
  assert.match(
    result.code,
    /const double differentCall = \(!\(ccjs_cmp_string_\d+->len == ccjs_cmp_string_\d+->len && memcmp\(ccjs_cmp_string_\d+->bytes, ccjs_cmp_string_\d+->bytes, ccjs_cmp_string_\d+->len\) == 0\)\);/
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

  assert.match(result.code, /ccjs_object_get_known\(user, 0, &ccjs_log_value_\d+\)/)
  assert.match(result.code, /ccjs_object_get_known\(user, 2, &ccjs_log_value_\d+\)/)
  assert.match(result.code, /ccjs_object_get\(user, "name", 4, &ccjs_log_value_\d+\)/)
  assert.match(result.code, /ccjs_array_get\(values, 0, &ccjs_log_value_\d+\)/)
  assert.match(result.code, /ccjs_array_get\(values, 2, &ccjs_log_value_\d+\)/)
  assert.match(result.code, /\(\(double\)\(ccjs_log_value_\d+\.as\.boolean \? 1 : 0\)\)/)
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

  assert.match(result.code, /ccjs_object_get_known\(user, 0, &ccjs_expr_value_\d+\)/)
  assert.match(result.code, /ccjs_array_get\(values, 0, &ccjs_expr_value_\d+\)/)
  assert.match(
    result.code,
    /const double total = \(ccjs_expr_value_\d+\.as\.number \+ ccjs_expr_value_\d+\.as\.number\);/
  )
  assert.match(
    result.code,
    /const double same = \(\(ccjs_expr_value_\d+\.as\.boolean \? 1 : 0\) == \(ccjs_expr_value_\d+\.as\.boolean \? 1 : 0\)\);/
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
  assert.match(c.code, /ccjs_string_from_literal\(&ccjs_default_allocator, "yes", 3, &ccjs_value_\d+\)/)
  assert.match(c.code, /text = \(ccjs_string\*\)ccjs_value_\d+\.as\.ref;/)
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
    /ccjs_string_from_literal\(&ccjs_default_allocator, "if", 2, &ccjs_value_\d+\) != CCJS_OK[\s\S]*if \(isReady\(ccjs_value_\d+\)\) \{/
  )
  assert.match(
    result.code,
    /while \(1\) \{\n\s+ccjs_release\(ccjs_value_\d+\);\n\s+ccjs_value_\d+ = ccjs_undefined_value\(\);\n\s+if \(ccjs_string_from_literal\(&ccjs_default_allocator, "while", 5, &ccjs_value_\d+\) != CCJS_OK\)\s+goto ccjs_cleanup;\n\s+if \(!\(keepGoing\(index, ccjs_value_\d+\)\)\) break;/
  )
  assert.match(
    result.code,
    /ccjs_string_from_literal\(&ccjs_default_allocator, "switch", 6, &ccjs_value_\d+\) != CCJS_OK[\s\S]*switch \(\(int\)choose\(ccjs_value_\d+\)\) \{/
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
    /while \(index < 2\) \{[\s\S]*ccjs_release\(user\);\n {4}user = ccjs_undefined_value\(\);\n {4}if \(ccjs_object_new/
  )
  assert.match(
    result.code,
    /ccjs_release\(ccjs_value_\d+\);\n {4}ccjs_value_\d+ = ccjs_undefined_value\(\);\n {4}if \(ccjs_string_from_literal/
  )
  assert.match(
    result.code,
    /ccjs_release\(ccjs_log_value_\d+\);\n {4}ccjs_log_value_\d+ = ccjs_undefined_value\(\);\n {4}if \(ccjs_object_get_known/
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

  assert.match(c.code, /goto ccjs_continue_\d+;/)
  assert.match(c.code, /ccjs_continue_\d+:\s*;/)
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
    /\{\n\s+ccjs_release\(ccjs_value_\d+\);\n\s+ccjs_value_\d+ = ccjs_undefined_value\(\);\n\s+ccjs_value_\d+ = getName\(\);/
  )
  assert.match(result.code, /const ccjs_string \*name = \(ccjs_string \*\)ccjs_value_\d+\.as\.ref;\n\s+for \(;;\) \{/)
  assert.match(result.code, /if \(!\(index < 1\)\) break;/)
  assert.doesNotMatch(
    result.code,
    /if \((ccjs_value_\d+)\.tag != CCJS_TAG_STRING \|\| \1\.as\.ref == 0\)\s+goto ccjs_cleanup;\n\s+if \(\1\.tag != CCJS_TAG_STRING \|\| \1\.as\.ref == 0\)\s+goto ccjs_cleanup;/
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
    'CCJS_TYPE_MISMATCH'
  )
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
    'CCJS_C_FOR_OF',
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
  assert.match(c.code, /goto ccjs_break_\d+;/)
  assert.match(c.code, /ccjs_break_\d+:\s*;/)
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

  assertDiagnostic(source, 'CCJS_C_SWITCH_CASE', {
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

      assert.equal(error.diagnostics[0].code, 'CCJS_NO_VAR')
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
    /ccjs_release\(ccjs_value_\d+\);\n {2}ccjs_value_\d+ = ccjs_undefined_value\(\);\n {2}if \(ccjs_string_from_literal\(&ccjs_default_allocator, "step", 4, &ccjs_value_\d+\) != CCJS_OK\)\s+goto ccjs_cleanup;\n {2}index = nextIndex\(index, ccjs_value_\d+\);/
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
  const [name, count] = main.body.filter((item) => item.type === 'VariableDeclaration')

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

  assert.match(c.code, /void ccjs_main\(void\) \{/)
  assert.doesNotMatch(c.code, /int main\(void\) \{[\s\S]*ccjs_main\(\);/)
  assert.match(topLevelC.code, /int main\(void\) \{[\s\S]*printf\("%s\\n", "hello"\);/)
  assert.doesNotMatch(
    emitCFromIr({
      ...c.ir,
      functionDeclarations: []
    }),
    /int main\(void\) \{\n {2}ccjs_main\(\);/
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
  assert.match(plainJs.code, /void ccjs_main\(void\) \{/)
  assert.match(emitCFromIr(withoutTypeItems), /void ccjs_main\(void\) \{/)
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

  assert.match(emitCFromIr(result.ir), /void ccjs_main\(void\) \{/)
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
  assert.match(result.code, /#include "ccjs\/time\.h"/)
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
  assert.match(code, /ccjs_status ok\(ccjs_value \*ccjs_error_out\);/)
  assert.match(code, /ccjs_status ok\(ccjs_value \*ccjs_error_out\) \{/)
  assert.match(code, /ccjs_status ccjs_call_status_\d+ = ok\(&ccjs_error\);/)
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
  const tryStatement = main?.body.find((item) => item.type === 'TryStatement')
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
  assert.match(code, /#include "ccjs\/array\.h"/)
  assert.match(code, /#include "ccjs\/time\.h"/)
  assert.doesNotMatch(withoutRuntimeRequirements, /#include <string\.h>/)
  assert.doesNotMatch(withoutRuntimeRequirements, /#include "ccjs\/array\.h"/)
  assert.doesNotMatch(withoutRuntimeRequirements, /#include "ccjs\/time\.h"/)
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
  assert.match(objectResult.code, /#include "ccjs\/object\.h"/)
  assert.doesNotMatch(withoutObjects, /#include "ccjs\/object\.h"/)
  assert.deepEqual(mapEntryResult.ir.runtimeRequirements, ['collections', 'managed-values', 'objects'])
  assert.match(mapEntryResult.code, /ccjs_object_new\(&ccjs_default_allocator, &ccjs_shape_map_entry_\d+, &entry\)/)
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
  assert.match(result.code, /#include "ccjs\/json\.h"/)
  assert.match(
    result.code,
    /ccjs_json_parse\(&ccjs_default_allocator, "\{\\"score\\":7,\\"name\\":\\"Ada\\"\}", 24, &ccjs_json_object_\d+\)/
  )
  assert.match(result.code, /ccjs_object_get\(ccjs_json_object_\d+, "name", 4, &ccjs_json_name_\d+\)/)
  assert.match(result.code, /ccjs_json_stringify\(&ccjs_default_allocator, user, &ccjs_json_value_\d+\)/)
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

  assert.match(result.code, /ccjs_json_parse\(&ccjs_default_allocator, "7", 1, &ccjs_json_value_\d+\)/)
  assert.match(result.code, /ccjs_json_value_\d+\.tag != CCJS_TAG_NUMBER/)
  assert.match(result.code, /const double score = ccjs_json_value_\d+\.as\.number;/)
  assert.match(result.code, /ccjs_json_parse\(&ccjs_default_allocator, "true", 4, &ccjs_json_value_\d+\)/)
  assert.match(result.code, /ccjs_json_value_\d+\.tag != CCJS_TAG_BOOL/)
  assert.match(result.code, /const double active = \(ccjs_json_value_\d+\.as\.boolean \? 1 : 0\);/)
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
    add.params.map((param) => param.valueType),
    ['number', 'number']
  )
  assert.match(result.code, /double add\(double left, double right\)/)
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
  assert.match(result.code, /void greet\(ccjs_value ccjs_param_value\);/)
  assert.match(
    result.code,
    /void greet\(ccjs_value ccjs_param_value\) \{\n {2}if \(ccjs_param_value\.tag != CCJS_TAG_STRING \|\| ccjs_param_value\.as\.ref == 0\)\s+goto ccjs_cleanup;/
  )
  assert.match(result.code, /greet\(ccjs_value_\d+\);/)

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
  assert.doesNotMatch(withoutParamMetadata, /ccjs_param_value/)
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
  assert.match(result.code, /ccjs_return = 7;/)

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

  assert.match(withNullableReturnMetadata, /ccjs_value getScore\(void\) \{/)
  assert.match(withNullableReturnMetadata, /ccjs_return = ccjs_number_value\(7\);/)
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

  assert.match(c.code, /if \(ccjs_object_get_known\(data, 0, &ccjs_field_\d+\) != CCJS_OK\)\s+goto ccjs_cleanup;/)
  assert.match(c.code, /const ccjs_string \*name = \(ccjs_string \*\)ccjs_field_\d+\.as\.ref;/)
  assert.match(c.code, /if \(ccjs_object_get\(data, "score", 5, &ccjs_log_value_\d+\) != CCJS_OK\)\s+goto ccjs_cleanup;/)
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
  assertDiagnostic(source, 'CCJS_C_OPTIONAL_CHAINING', {
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

  assert.match(result.code, /if \(user\.tag == CCJS_TAG_NULL\) \{/)
  assert.match(result.code, /ccjs_object_get_known\(user, 0, &ccjs_optional_value_\d+\)/)
  assert.match(result.code, /ccjs_object_get\(user, "name", 4, &ccjs_optional_value_\d+\)/)
  assert.match(result.code, /if \(maybeNames\.tag == CCJS_TAG_NULL\) \{/)
  assert.match(result.code, /ccjs_array_get\(maybeNames, 0, &ccjs_optional_value_\d+\)/)
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
  assert.match(result.code, /ccjs_null_value\(\)/)
  assert.match(result.code, /if \(missing\.tag == CCJS_TAG_NULL\) \{/)
  assert.match(result.code, /present\.tag == CCJS_TAG_NULL/)
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

  assert.match(result.code, /score = ccjs_null_value\(\);/)
  assert.match(result.code, /ccjs_number_value\(9\)/)
  assert.match(result.code, /if \(score\.tag == CCJS_TAG_NULL\) \{/)
  assert.match(result.code, /score\.tag != CCJS_TAG_NUMBER/)
  assert.match(result.code, /active\.tag != CCJS_TAG_BOOL/)
  assert.match(result.code, /ccjs_array_get\(maybeValues, 0, &ccjs_optional_value_\d+\)/)

  assertDiagnostic(
    `export function main(): void {
  const score: number | null = null
  console.log(score)
}
`,
    'CCJS_C_NULLISH',
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

  assert.match(result.code, /if \(!\(ccjs_value_truthy\(active\) \? 1 : 0\)\) \{/)
  assert.match(result.code, /ccjs_object_get_known\(capture, 0, &ccjs_value_\d+\)/)
  assert.match(result.code, /if \(!\(ccjs_value_truthy\(ccjs_value_\d+\) \? 1 : 0\)\) \{/)
  assert.match(result.code, /const double missing = \(!\(ccjs_value_truthy\(score\) \? 1 : 0\)\);/)
  assert.match(result.code, /ccjs_object_get\(capture, "mutable", 7, &ccjs_value_\d+\)/)
  assert.match(result.code, /const double fieldMissing = \(!\(ccjs_value_truthy\(ccjs_value_\d+\) \? 1 : 0\)\);/)

  assertDiagnostic(
    `export function main(): void {
  const score: number | null = 1
  console.log(score)
}
`,
    'CCJS_C_NULLISH',
    {
      target: 'c'
    }
  )
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

  assert.match(result.code, /ccjs_value maybeScore\(double seed\)/)
  assert.match(result.code, /void printScore\(ccjs_value ccjs_param_score, ccjs_value ccjs_param_active\)/)
  assert.match(result.code, /ccjs_value score = ccjs_param_score;/)
  assert.match(result.code, /ccjs_param_score\.tag != CCJS_TAG_NULL && ccjs_param_score\.tag != CCJS_TAG_NUMBER/)
  assert.match(result.code, /ccjs_return = ccjs_number_value\(\(seed \+ 1\)\);/)
  assert.match(result.code, /ccjs_return = ccjs_null_value\(\);/)
  assert.match(result.code, /ccjs_nullable_value_\d+ = maybeScore\(1\);/)
  assert.match(result.code, /printScore\(first, ccjs_bool_value\(\(1\) != 0\)\);/)

  assertDiagnostic(
    `function maybeScore(): number | null {
  return null
}

export function main(): void {
  console.log(maybeScore())
}
`,
    'CCJS_C_NULLISH',
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

  assert.match(result.code, /if \(!\(score\.tag == CCJS_TAG_NULL \|\| score\.tag == CCJS_TAG_UNDEFINED\)\) \{/)
  assert.match(result.code, /\(score\.as\.number \+ 1\)/)
  assert.match(result.code, /if \(active\.tag == CCJS_TAG_NULL \|\| active\.tag == CCJS_TAG_UNDEFINED\) \{/)
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
    'CCJS_C_NULLISH',
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
    'CCJS_C_NULLISH',
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
    'CCJS_C_NULLISH',
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
    'CCJS_C_NULLISH',
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
    'CCJS_C_NULLISH',
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
    'CCJS_C_NULLISH',
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

  assert.match(result.code, /ccjs_object_get_known\(user, 0, &ccjs_\w+_\d+\)/)
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
    'CCJS_C_NULLISH',
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
    'CCJS_C_NULLISH',
    {
      target: 'c'
    }
  )
})


test('rejects unsupported C nullish coalescing forms', () => {
  const source = `function printValue(value: unknown): void {
  console.log(value ?? 'Ada')
}

export function main(): void {
  printValue(1)
}
`
  assertDiagnostic(source, 'CCJS_C_NULLISH', {
    target: 'c'
  })
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

  assert.match(c.code, /ccjs_value ccjs_error = ccjs_undefined_value\(\);/)
  assert.match(c.code, /int ccjs_error_active = 0;/)
  assert.match(c.code, /ccjs_retain\(ccjs_error\);\n {4}ccjs_error_active = 1;\n {4}goto ccjs_try_\d+_catch;/)
  assert.match(
    c.code,
    /ccjs_try_\d+_catch:\n {4}if \(ccjs_error\.tag != CCJS_TAG_STRING \|\| ccjs_error\.as\.ref == 0\)\s+goto ccjs_cleanup;/
  )
  assert.match(c.code, /ccjs_string \*error = \(ccjs_string \*\)ccjs_error\.as\.ref;/)
  assert.match(c.code, /ccjs_release\(ccjs_error\);\n {4}ccjs_error = ccjs_undefined_value\(\);/)
  assert.match(c.code, /ccjs_try_\d+_finally:/)
  assert.match(c.code, /printf\("%s\\n", "finally"\);/)

  assertDiagnostic(
    `export function main(): void {
  throw 'boom'
}
`,
    'CCJS_C_THROW',
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

  assert.match(result.code, /double getScore\(void\) \{\n {2}double ccjs_return = 0;\n {2}int ccjs_return_active = 0;/)
  assert.match(result.code, /ccjs_return = 7;\n {4}ccjs_return_active = 1;\n {4}goto ccjs_try_\d+_finally;/)
  assert.match(
    result.code,
    /ccjs_try_\d+_finally:\n {4}printf\("%s\\n", "finally"\);\n {4}if \(ccjs_error_active\)\s+goto ccjs_cleanup;\n {4}if \(ccjs_return_active\)\s+goto ccjs_cleanup;/
  )
  assert.match(result.code, /ccjs_cleanup:\n {2}ccjs_release\(ccjs_error\);\n {2}return ccjs_return;/)
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

  assert.match(result.code, /void stop\(void\) \{\n {2}int ccjs_return_active = 0;/)
  assert.match(result.code, /ccjs_return_active = 1;\n {4}goto ccjs_try_\d+_finally;/)
  assert.match(
    result.code,
    /ccjs_try_\d+_finally:\n {4}printf\("%s\\n", "finally"\);\n {4}if \(ccjs_error_active\)\s+goto ccjs_cleanup;\n {4}if \(ccjs_return_active\)\s+goto ccjs_cleanup;/
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

  assert.match(result.code, /int ccjs_break_active = 0;\n {2}int ccjs_continue_active = 0;/)
  assert.match(result.code, /ccjs_continue_active = 1;\n\s+goto ccjs_try_\d+_finally;/)
  assert.match(result.code, /ccjs_break_active = 1;\n\s+goto ccjs_try_\d+_finally;/)
  assert.match(result.code, /if \(ccjs_break_active\) goto ccjs_break_\d+;/)
  assert.match(result.code, /if \(ccjs_continue_active\) goto ccjs_continue_\d+;/)
  assert.match(result.code, /ccjs_break_\d+:\n\s+if \(ccjs_break_active\) ccjs_break_active = 0;/)
  assert.match(result.code, /ccjs_continue_\d+:\n\s+if \(ccjs_continue_active\) ccjs_continue_active = 0;/)
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
    /static const ccjs_field_info ccjs_shape_error_\d+_fields\[\] = \{\n\s+\{ "name", CCJS_FIELD_READONLY \},\n\s+\{ "message", CCJS_FIELD_READONLY \},\n\s+\{ "code", CCJS_FIELD_READONLY \},\n\s+\{ "cause", CCJS_FIELD_READONLY \},/
  )
  assert.match(
    c.code,
    /if \(ccjs_object_new\(&ccjs_default_allocator, &ccjs_shape_error_\d+, &created\) != CCJS_OK\)\s+goto ccjs_cleanup;/
  )
  assert.match(c.code, /ccjs_object_init_known\(created, 2, ccjs_value_\d+\)/)
  assert.match(c.code, /ccjs_object_init_known\(created, 3, root\)/)
  assert.match(
    c.code,
    /ccjs_error = thrown;\n {4}if \(ccjs_error\.tag != CCJS_TAG_OBJECT \|\| ccjs_error\.as\.ref == 0\)\s+goto ccjs_cleanup;/
  )
  assert.match(
    c.code,
    /ccjs_try_\d+_catch:\n {4}if \(ccjs_error\.tag != CCJS_TAG_OBJECT \|\| ccjs_error\.as\.ref == 0\)\s+goto ccjs_cleanup;/
  )
  assert.match(c.code, /ccjs_value error = ccjs_error;/)
  assert.match(c.code, /ccjs_object_get_known\(error, 0, &ccjs_log_value_\d+\)/)
  assert.match(c.code, /ccjs_object_get_known\(error, 1, &ccjs_log_value_\d+\)/)
  assert.match(c.code, /ccjs_object_get_known\(error, 2, &ccjs_log_value_\d+\)/)

  assertDiagnostic(
    `export function main(): void {
  try {
    throw { message: 'boom' }
  } catch (error) {
    console.log(error)
  }
}
`,
    'CCJS_C_THROW',
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
    'CCJS_C_THROW',
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
    'CCJS_TYPE_MISMATCH',
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
    'CCJS_ASSIGN_READONLY_FIELD',
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
  assert.match(result.code, /ccjs_status failString\(ccjs_value \*ccjs_error_out\);/)
  assert.match(result.code, /ccjs_status failError\(ccjs_value \*ccjs_error_out\);/)
  assert.match(result.code, /ccjs_status readValue\(double ok, double \*ccjs_out, ccjs_value \*ccjs_error_out\);/)
  assert.match(result.code, /ccjs_status_result = CCJS_ERR_THROW;\n {2}ccjs_error_active = 1;\n {2}goto ccjs_cleanup;/)
  assert.match(
    result.code,
    /if \(ccjs_error_active\) \{\n {4}\*ccjs_error_out = ccjs_error;\n {4}ccjs_error = ccjs_undefined_value\(\);\n {2}\}/
  )
  assert.match(
    result.code,
    /ccjs_status ccjs_call_status_\d+ = failString\(&ccjs_error\);\n {4}if \(ccjs_call_status_\d+ == CCJS_ERR_THROW\) \{\n {6}ccjs_error_active = 1;\n {6}goto ccjs_try_\d+_catch;/
  )
  assert.match(
    result.code,
    /ccjs_status ccjs_call_status_\d+ = failError\(&ccjs_error\);\n {4}if \(ccjs_call_status_\d+ == CCJS_ERR_THROW\) \{\n {6}ccjs_error_active = 1;\n {6}goto ccjs_try_\d+_catch;/
  )
  assert.match(
    result.code,
    /double ccjs_call_result_\d+ = 0;\n {4}ccjs_status ccjs_call_status_\d+ = readValue\(1, &ccjs_call_result_\d+, &ccjs_error\);/
  )
  assert.match(
    result.code,
    /ccjs_try_\d+_catch:\n {4}if \(ccjs_error\.tag != CCJS_TAG_OBJECT \|\| ccjs_error\.as\.ref == 0\)\s+goto ccjs_cleanup;\n {4}ccjs_error_active = 0;\n {4}\{\n {6}ccjs_value error = ccjs_error;/
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

  assert.match(c.code, /ccjs_array_set\(values, ccjs_sort_scan_\d+ - 1, ccjs_sort_right_\d+\)/)
  assert.match(c.code, /ccjs_array_push\(ccjs_filter_array_\d+, ccjs_filter_value_\d+\)/)
  assert.match(c.code, /ccjs_array_push\(ccjs_map_array_\d+, ccjs_number_value/)
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
  assert.match(c.code, /#include "ccjs\/binary\.h"/)
  assert.match(c.code, /#include "ccjs\/crypto\.h"/)
  assert.doesNotMatch(c.code, /static int ccjs_os_random_bytes\(uint8_t \*out, size_t len\)/)
  assert.doesNotMatch(c.code, /static ccjs_status ccjs_crypto_get_random_values\(ccjs_value value\)/)
  assert.match(c.code, /if \(ccjs_crypto_get_random_values\(bytes\) != CCJS_OK\)\s+goto ccjs_cleanup;/)
  assert.match(c.code, /ccjs_retain\(ccjs_crypto_bytes_\d+\);/)

  const withoutCryptoMetadata = JSON.parse(JSON.stringify(c.ir))
  stripCryptoRuntimeMetadata(withoutCryptoMetadata)
  assert.throws(
    () => emitCFromIr(withoutCryptoMetadata),
    (error: unknown) => {
      assert.ok(error instanceof CompileError)
      assert.equal(error.diagnostics[0]?.code, 'CCJS_C_JS_GLOBAL')
      return true
    }
  )

  assertDiagnostic(
    `export function main(): void {
  crypto.getRandomValues('text')
}
`,
    'CCJS_TYPE_MISMATCH'
  )

  assertDiagnostic(
    `export function main(): void {
  crypto.getRandomValues()
}
`,
    'CCJS_ARG_COUNT'
  )
})


function stripCryptoRuntimeMetadata(node: unknown): void {
  if (node == null || typeof node !== 'object') {
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

  assert.match(result.code, /#include "ccjs\/time\.h"/)
  assert.match(result.code, /double started = ccjs_date_now\(\);/)
  assert.match(result.code, /double elapsed = ccjs_performance_now\(\);/)
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
  assert.match(result.code, /static uint32_t ccjs_math_random_state = 0x6d2b79f5u;/)
  assert.match(result.code, /static double ccjs_math_floor\(double value\)/)
  assert.match(result.code, /static double ccjs_math_fround\(double value\)/)
  assert.match(result.code, /static double ccjs_math_max\(double left, double right\)/)
  assert.match(result.code, /static double ccjs_math_sqrt\(double value\)/)
  assert.match(result.code, /static double ccjs_math_random\(void\)/)
  assert.match(result.code, /ccjs_math_floor\(3\.8\)/)
  assert.match(result.code, /ccjs_math_ceil\(2\.1\)/)
  assert.match(result.code, /ccjs_math_round\(1\.6\)/)
  assert.match(result.code, /ccjs_math_trunc\(4\.9\)/)
  assert.match(result.code, /ccjs_math_fround\(16777217\)/)
  assert.match(result.code, /ccjs_math_abs\(\(-5\)\)/)
  assert.match(result.code, /ccjs_math_min\(8, 2\)/)
  assert.match(result.code, /ccjs_math_max\(1, 6\)/)
  assert.match(result.code, /ccjs_math_sqrt\(9\)/)
  assert.match(result.code, /ccjs_math_sin\(0\)/)
  assert.match(result.code, /ccjs_math_cos\(0\)/)
  assert.match(result.code, /ccjs_math_random\(\)/)

  assertDiagnostic(
    `export function main(): void {
  const value = Math.max(1)
  console.log(value)
}
`,
    'CCJS_ARG_COUNT'
  )

  assertDiagnostic(
    `export function main(): void {
  const value = Math.random(1)
  console.log(value)
}
`,
    'CCJS_ARG_COUNT'
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

  assert.match(result.code, /static uint32_t ccjs_math_random_state = 0x00000001u;/)
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

  assert.match(result.code, /static uint32_t ccjs_math_random_state = 0x00000001u;/)
  assert.match(result.code, /if \(ccjs_math_random_state == 0u\) ccjs_math_random_state = 0x6d2b79f5u;/)
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
  assert.match(result.code, /static uint32_t ccjs_math_random_state = 0x00000001u;/)
  assert.match(result.code, /static int ccjs_os_random_bytes\(uint8_t \*out, size_t len\)/)
  assert.match(result.code, /rand_s\(&value\)/)
  assert.match(result.code, /arc4random_buf\(out, len\);/)
  assert.match(result.code, /getrandom\(out \+ filled, len - filled, 0\)/)
  assert.match(result.code, /open\("\/dev\/urandom", O_RDONLY\)/)
  assert.match(result.code, /if \(!ccjs_os_random_bytes\(\(uint8_t \*\)&value, sizeof\(value\)\)\) \{/)
  assert.match(result.code, /ccjs_math_random_state = ccjs_math_random_state \* 1664525u \+ 1013904223u;/)
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

      assert.equal(error.diagnostics.some((item) => item.code === 'CCJS_C_JS_GLOBAL'), true)
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
    assertDiagnostic(source, 'CCJS_C_JS_GLOBAL', {
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
  fs.promises.writeFile('/private/tmp/ccjs-embedded-profile.txt', 'saved')
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
        error.diagnostics.every((item) => item.code === 'CCJS_CAPABILITY'),
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

  assert.match(enabled.code, /#include "ccjs\/fs\.h"/)
  assert.match(enabled.code, /#include "ccjs\/time\.h"/)
  assert.match(enabled.code, /ccjs_loop_set_timeout/)
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
        error.diagnostics.every((item) => item.code === 'CCJS_CAPABILITY'),
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

  assert.match(enabled.code, /ccjs_os_random_bytes/)
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
        error.diagnostics.every((item) => item.code === 'CCJS_CAPABILITY'),
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

  assert.match(enabled.code, /ccjs_crypto_get_random_values/)
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
        ['CCJS_BUDGET', 'CCJS_BUDGET']
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

  assert.match(result.code, /#include "ccjs\/array\.h"/)
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

      assert.equal(error.diagnostics[0]?.code, 'CCJS_C_JS_GLOBAL')
      return true
    }
  )
})


test('accepts valid TypeScript source files as canonical input', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ccjs-ts-modules-'))

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
    'CCJS_REDECLARED_NAME'
  )
})


test('rejects use before declaration in the current compiler slice', () => {
  assertDiagnostic(
    `export function main(): void {
  console.log(value)
  const value = 1
}
`,
    'CCJS_UNKNOWN_NAME'
  )
})


test('rejects assignment to const bindings', () => {
  assertDiagnostic(
    `export function main(): void {
  const value = 1
  value = 2
}
`,
    'CCJS_ASSIGN_CONST'
  )
})


test('rejects unknown names', () => {
  assertDiagnostic(
    `export function main(): void {
  console.log(missing)
}
`,
    'CCJS_UNKNOWN_NAME'
  )
})


test('rejects variable type mismatches', () => {
  assertDiagnostic(
    `export function main(): void {
  const value: number = 'Ada'
}
`,
    'CCJS_TYPE_MISMATCH'
  )
})


test('rejects equality type mismatches', () => {
  assertDiagnostic(
    `export function main(): void {
  const same = 1 === '1'
  console.log(same)
}
`,
    'CCJS_TYPE_MISMATCH'
  )

  assertDiagnostic(
    `export function main(): void {
  const same = 1 == '1'
  console.log(same)
}
`,
    'CCJS_TYPE_MISMATCH'
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
    'CCJS_TYPE_MISMATCH'
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
    'CCJS_ARG_COUNT'
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
    'CCJS_TYPE_MISMATCH'
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
    'CCJS_UNKNOWN_NAME'
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
    'CCJS_UNKNOWN_NAME'
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
    'CCJS_UNKNOWN_NAME'
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
    'CCJS_ASSIGN_CONST'
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
    'CCJS_NO_FOR_IN'
  )
})


test('rejects break outside loops and switches', () => {
  assertDiagnostic(
    `export function main(): void {
  break
}
`,
    'CCJS_BREAK_OUTSIDE'
  )
})


test('rejects continue outside loops', () => {
  assertDiagnostic(
    `export function main(): void {
  continue
}
`,
    'CCJS_CONTINUE_OUTSIDE'
  )
})


test('rejects non-boolean conditions', () => {
  assertDiagnostic(
    `export function main(): void {
  if (1) {
    console.log('bad')
  }
}
`,
    'CCJS_CONDITION_TYPE'
  )

  assertDiagnostic(
    `export function main(): void {
  while ('yes') {
    console.log('bad')
  }
}
`,
    'CCJS_CONDITION_TYPE'
  )

  assertDiagnostic(
    `export function main(): void {
  for (let index = 0; 'yes'; index = index + 1) {
    console.log(index)
  }
}
`,
    'CCJS_CONDITION_TYPE'
  )
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
    'CCJS_DUPLICATE_DEFAULT'
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
    'CCJS_SWITCH_TYPE'
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
    'CCJS_SWITCH_TYPE'
  )
})
