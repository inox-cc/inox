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
  findIrEntryProgram,
  join,
  mkdir,
  mkdtemp,
  rm,
  tmpdir,
  writeFile
} from '../helpers/compiler-smoke.ts'



test('lowers C array literals to runtime calls', () => {
  const result = compileSource(
    `export function main(): void {
  const values = [1, 2, 3]
  console.log('ok')
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /#include "ccjs\/array\.h"/)
  assert.match(result.code, /ccjs_value values = ccjs_undefined_value\(\);/)
  assert.match(result.code, /ccjs_array_new\(&ccjs_default_allocator, 3, &values\)/)
  assert.match(result.code, /ccjs_array_set\(values, 0, ccjs_number_value\(1\)\)/)
  assert.match(result.code, /ccjs_array_set\(values, 2, ccjs_number_value\(3\)\)/)
})


test('lowers C array length for known arrays', () => {
  const result = compileSource(
    `export function main(): void {
  const values = [1, 2, 3]
  console.log(values.length, [4, 5].length)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /printf\("%g %g\\n", \(\(double\)3\), \(\(double\)2\)\);/)
})


test('lowers C runtime array length for object fields', () => {
  const result = compileSource(
    `type Box = {
  values: number[]
}

export function main(): void {
  const box: Box = { values: [1, 2, 3] }
  console.log(box.values.length)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /ccjs_array_new\(&ccjs_default_allocator, 3, &ccjs_array_\d+\)/)
  assert.match(result.code, /ccjs_object_init_known\(box, 0, ccjs_array_\d+\)/)
  assert.match(result.code, /ccjs_object_get_known\(box, 0, &ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_array_len\(ccjs_value_\d+, &ccjs_array_len_\d+\)/)
})

test('lowers C object identity equality as runtime reference comparison', () => {
  const result = compileSource(
    `type User = {
  name: string
}

export function main(): void {
  const ada: User = { name: 'Ada' }
  const same = ada
  console.log(ada === same, ada !== { name: 'Ada' })
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /ada\.tag == same\.tag && ada\.as\.ref == same\.as\.ref/)
  assert.match(result.code, /!\(ada\.tag == ccjs_object_\d+\.tag && ada\.as\.ref == ccjs_object_\d+\.as\.ref\)/)
})


test('lowers C runtime array index reads for object fields', () => {
  const result = compileSource(
    `type Box = {
  values: number[],
  flags: boolean[],
  names: string[]
}

export function main(): void {
  const box: Box = { values: [1, 2, 3], flags: [true], names: ['Ada'] }
  const name = box.names[0]
  console.log(box.values[1], box.flags[0], name)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /ccjs_object_get_known\(box, 0, &ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_array_get\(ccjs_value_\d+, 1, &ccjs_log_value_\d+\)/)
  assert.match(result.code, /ccjs_object_get_known\(box, 1, &ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_array_get\(ccjs_value_\d+, 0, &ccjs_log_value_\d+\)/)
  assert.match(result.code, /ccjs_object_get_known\(box, 2, &ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_array_get\(ccjs_value_\d+, 0, &ccjs_value_\d+\)/)
  assert.match(
    result.code,
    /printf\("%g %g %\.\*s\\n", ccjs_log_value_\d+\.as\.number, \(\(double\)\(ccjs_log_value_\d+\.as\.boolean \? 1 : 0\)\), \(int\)name->len, name->bytes\);/
  )
})


test('lowers C runtime array locals from object fields', () => {
  const result = compileSource(
    `type Box = {
  values: number[],
  names: string[]
}

export function main(): void {
  const box: Box = { values: [1, 2, 3], names: ['Ada'] }
  const values = box.values
  const names = box.names
  console.log(values[1], names[0])
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /ccjs_object_get_known\(box, 0, &values\)/)
  assert.match(result.code, /values\.tag != CCJS_TAG_ARRAY/)
  assert.match(result.code, /ccjs_object_get_known\(box, 1, &names\)/)
  assert.match(result.code, /names\.tag != CCJS_TAG_ARRAY/)
  assert.match(result.code, /ccjs_array_get\(values, 1, &ccjs_log_value_\d+\)/)
  assert.match(result.code, /ccjs_array_get\(names, 0, &ccjs_log_value_\d+\)/)
})


test('lowers C collection methods on object fields', () => {
  const result = compileSource(
    `type Box = {
  scores: Map<string, number>,
  names: Set<string>
}

export function main(): void {
  const box: Box = { scores: new Map(), names: new Set() }
  box.scores.set('Ada', 7)
  box.names.add('Ada')
  console.log(box.scores.get('Ada') ?? 0, box.names.has('Ada'), box.scores.size, box.names.size)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /ccjs_object_get_known\(box, 0, &ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_map_set\(ccjs_value_\d+, ccjs_value_\d+, ccjs_number_value\(7\)\)/)
  assert.match(result.code, /ccjs_map_get\(ccjs_value_\d+, ccjs_value_\d+, &ccjs_map_value_\d+\)/)
  assert.match(result.code, /ccjs_map_size\(ccjs_value_\d+, &ccjs_map_size_\d+\)/)
  assert.match(result.code, /ccjs_object_get_known\(box, 1, &ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_set_add\(ccjs_value_\d+, ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_set_has\(ccjs_value_\d+, ccjs_value_\d+, &ccjs_set_has_\d+\)/)
  assert.match(result.code, /ccjs_set_size\(ccjs_value_\d+, &ccjs_set_size_\d+\)/)
})


test('lowers C for of over runtime array locals', () => {
  const result = compileSource(
    `type Box = {
  values: number[],
  names: string[]
}

export function main(): void {
  const box: Box = { values: [1, 2, 3], names: ['Ada', 'Grace'] }
  const values = box.values
  const names = box.names
  let total = 0
  let letters = 0
  for (const value of values) {
    total = total + value
  }
  for (const name of names) {
    letters = letters + name.length
  }
  console.log(total, letters)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /ccjs_array_len\(values, &ccjs_for_length_\d+\)/)
  assert.match(result.code, /ccjs_array_get\(values, ccjs_for_index_\d+, &ccjs_for_value_\d+\)/)
  assert.match(result.code, /ccjs_array_len\(names, &ccjs_for_length_\d+\)/)
  assert.match(result.code, /ccjs_array_get\(names, ccjs_for_index_\d+, &ccjs_for_value_\d+\)/)
  assert.match(result.code, /ccjs_for_value_\d+\.tag != CCJS_TAG_STRING/)
})


test('lowers C for of over runtime array expressions', () => {
  const result = compileSource(
    `type Box = {
  values: number[],
  names: string[]
}

export function main(): void {
  const box: Box = { values: [1, 2, 3], names: ['Ada', 'Grace'] }
  let total = 0
  let letters = 0
  for (const value of box.values) {
    total = total + value
  }
  for (const name of box.names) {
    letters = letters + name.length
  }
  console.log(total, letters)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /ccjs_object_get_known\(box, 0, &ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_array_len\(ccjs_value_\d+, &ccjs_for_length_\d+\)/)
  assert.match(result.code, /ccjs_array_get\(ccjs_value_\d+, ccjs_for_index_\d+, &ccjs_for_value_\d+\)/)
  assert.match(result.code, /ccjs_object_get_known\(box, 1, &ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_for_value_\d+\.tag != CCJS_TAG_STRING/)
})


test('lowers C for of over runtime object array expressions', () => {
  const result = compileSource(
    `type Item = {
  score: number
}

type Box = {
  items: Item[]
}

export function main(): void {
  const box: Box = { items: [{ score: 7 }, { score: 9 }] }
  let count = 0

  for (const item of box.items) {
    count = count + 1
  }

  console.log(count)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /ccjs_array_len\(ccjs_value_\d+, &ccjs_for_length_\d+\)/)
  assert.match(result.code, /ccjs_array_get\(ccjs_value_\d+, ccjs_for_index_\d+, &ccjs_for_value_\d+\)/)
  assert.match(result.code, /ccjs_for_value_\d+\.tag != CCJS_TAG_OBJECT/)
  assert.match(result.code, /ccjs_value item = ccjs_for_value_\d+;/)
})


test('lowers C array methods over runtime array object fields', () => {
  const result = compileSource(
    `type Box = {
  values: number[],
  names: string[]
}

export function main(): void {
  const box: Box = { values: [3, 1, 2], names: ['Grace', 'Ada'] }
  box.values.push(4)
  const last = box.values.pop() ?? 0
  const numbers = box.values.sort((left, right) => left - right).filter(value => value !== 2)
  const initials = box['names'].map(name => name.slice(0, 1)).sort()
  console.log(last, numbers.length, numbers[0], numbers[1], initials.length, initials[0], initials[1])
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /ccjs_object_get_known\(box, 0, &ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_array_push\(ccjs_value_\d+, ccjs_number_value\(4\)\)/)
  assert.match(result.code, /ccjs_array_pop\(ccjs_value_\d+, &ccjs_array_pop_\d+\)/)
  assert.match(result.code, /ccjs_array_len\(ccjs_value_\d+, &ccjs_sort_length_\d+\)/)
  assert.match(result.code, /ccjs_array_push\(ccjs_filter_array_\d+, ccjs_filter_value_\d+\)/)
  assert.match(result.code, /ccjs_object_get\(box, "names", 5, &ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_string_slice_parts\(/)
  assert.match(result.code, /ccjs_array_sort\(ccjs_map_array_\d+\)/)
})


test('lowers C Array.slice calls to runtime arrays', () => {
  const result = compileSource(
    `export function main(): void {
  const values = [1, 2, 3, 4]
  const copy = values.slice()
  const middle = values.slice(1, 3)
  const tail = values.slice(-2)
  const clamped = values.slice(-99, 2)
  console.log(copy.length, middle[0], middle[1], tail[0], tail[1], clamped.length)
}
`,
    {
      target: 'c'
    }
  )

  assert.equal(result.hir.body[0].body.find((item) => item.name === 'copy')?.arrayElementType, 'number')
  assert.equal(result.hir.body[0].body.find((item) => item.name === 'middle')?.arrayElementType, 'number')
  assert.match(
    result.code,
    /ccjs_array_slice\(&ccjs_default_allocator, values, ccjs_array_slice_start_\d+, ccjs_array_slice_end_\d+, &ccjs_array_slice_\d+\)/
  )
  assert.match(result.code, /double ccjs_array_slice_start_raw_\d+ = 0;/)
  assert.match(result.code, /double ccjs_array_slice_start_raw_\d+ = \(-2\);/)
  assert.match(result.code, /double ccjs_array_slice_start_raw_\d+ = \(-99\);/)
  assert.match(
    result.code,
    /if \(ccjs_array_slice_end_\d+ < ccjs_array_slice_start_\d+\) ccjs_array_slice_end_\d+ = ccjs_array_slice_start_\d+;/
  )
})


test('lowers C Array.join calls for primitive arrays', () => {
  const result = compileSource(
    `export function main(): void {
  const parts = ['src', 'compiler']
  const joined = parts.join('/')
  const digits = [1, 2, 3].join()
  const flags = [true, false].join('|')
  console.log(joined, digits, flags)
}
`,
    {
      target: 'c'
    }
  )

  assert.equal(result.hir.body[0].body.find((item) => item.name === 'joined')?.valueType, 'string')
  assert.match(result.code, /ccjs_array_join\(&ccjs_default_allocator, parts, "\/", 1, &ccjs_array_join_\d+\)/)
  assert.match(result.code, /ccjs_array_join\(&ccjs_default_allocator, ccjs_array_\d+, ",", 1, &ccjs_array_join_\d+\)/)
  assert.match(result.code, /ccjs_array_join\(&ccjs_default_allocator, ccjs_array_\d+, "\|", 1, &ccjs_array_join_\d+\)/)
  assert.match(result.code, /const ccjs_string\* joined = \(ccjs_string\*\)ccjs_array_join_\d+\.as\.ref;/)
  assert.match(result.code, /const ccjs_string\* digits = \(ccjs_string\*\)ccjs_array_join_\d+\.as\.ref;/)
  assert.match(result.code, /const ccjs_string\* flags = \(ccjs_string\*\)ccjs_array_join_\d+\.as\.ref;/)
})


test('lowers C string length for literals and runtime strings', () => {
  const result = compileSource(
    `type User = {
  name: string
}

function length(name: string): number {
  return name.length
}

function getName(): string {
  return 'Grace'
}

export function main(): void {
  const user: User = { name: 'Ada' }
  const name = user.name
  const message = name + '!'
  console.log('Ada'.length, length(name), user.name.length, getName().length, message.length)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /#include <string\.h>/)
  assert.match(result.code, /ccjs_string_code_unit_length_parts\(name->bytes, name->len\)/)
  assert.match(result.code, /ccjs_return = \(\(double\)ccjs_string_length_\d+\);/)
  assert.match(result.code, /ccjs_string \*ccjs_length_string_\d+ = \(ccjs_string \*\)ccjs_value_\d+\.as\.ref;/)
  assert.match(result.code, /ccjs_string_code_unit_length_parts\("Ada", 3\)/)
  assert.match(
    result.code,
    /ccjs_string_code_unit_length_parts\(ccjs_length_string_\d+->bytes, ccjs_length_string_\d+->len\)/
  )
  assert.match(result.code, /ccjs_string_code_unit_length_parts\(message->bytes, message->len\)/)
})


test('lowers C string predicate methods for literals and runtime strings', () => {
  const result = compileSource(
    `type User = {
  name: string
}

function hasAda(name: string): boolean {
  return name.includes('d', 1) && name.startsWith('A') && name.endsWith('a')
}

function getName(): string {
  return 'Grace'
}

export function main(): void {
  const user: User = { name: 'Ada' }
  const name = user.name
  const message = name + '!'
  console.log('Ada'.includes('d'), hasAda(name), user.name.startsWith('A'), getName().endsWith('e'), message.endsWith('!'), name.includes('z'))
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /#include "ccjs\/string\.h"/)
  assert.match(result.code, /ccjs_string_includes_from_parts\(name->bytes, name->len, "d", 1, ccjs_string_includes_position_\d+\)/)
  assert.match(result.code, /ccjs_string_starts_with_parts\(name->bytes, name->len, "A", 1\)/)
  assert.match(result.code, /ccjs_string_ends_with_parts\(name->bytes, name->len, "a", 1\)/)
  assert.match(result.code, /ccjs_string_includes_parts\("Ada", 3, "d", 1\)/)
  assert.match(result.code, /ccjs_string_ends_with_parts\(message->bytes, message->len, "!", 1\)/)
})


test('lowers C string index methods and trim variants', () => {
  const result = compileSource(
    `function first(name: string): number {
  return name.indexOf('a', 2)
}

function last(name: string): number {
  return name.lastIndexOf('a')
}

function lastBefore(name: string): number {
  return name.lastIndexOf('a', 3)
}

function cleanStart(name: string): string {
  return name.trimStart()
}

function cleanEnd(name: string): string {
  return name.trimEnd()
}

function cleanLeft(name: string): string {
  return name.trimLeft()
}

function cleanRight(name: string): string {
  return name.trimRight()
}

export function main(): void {
  console.log('ok')
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /ccjs_string_index_of_parts\(name->bytes, name->len, "a", 1, ccjs_string_index_start_\d+\)/
  )
  assert.match(
    result.code,
    /ccjs_string_last_index_of_parts\(name->bytes, name->len, "a", 1, ccjs_string_index_start_\d+\)/
  )
  assert.match(
    result.code,
    /ccjs_string_last_index_of_parts\(name->bytes, name->len, "a", 1, ccjs_string_code_unit_length_parts\(name->bytes, name->len\)\)/
  )
  assert.match(
    result.code,
    /ccjs_string_trim_start_parts\(&ccjs_default_allocator, name->bytes, name->len, &ccjs_value_\d+\)/
  )
  assert.match(
    result.code,
    /ccjs_string_trim_end_parts\(&ccjs_default_allocator, name->bytes, name->len, &ccjs_value_\d+\)/
  )
})


test('lowers C string methods over dynamic object string fields', () => {
  const result = compileSource(
    `function hasInterpolation(node: object): boolean {
  return node.raw.includes('\${') && node.raw.startsWith('expr') && node.raw.endsWith('}')
}

function body(node: object): string {
  return node['raw'].slice(1, -1).trim()
}

function countNames(node: object): number {
  return node.names.split(',').length
}

export function main(): void {
  const first = { raw: 'expr \${name}', names: 'Ada,Grace' }
  console.log(hasInterpolation(first), body({ raw: ' Ada ' }), countNames(first))
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /ccjs_object_get\(node, "raw", 3, &ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_string_includes_parts\(ccjs_string_method_value_\d+->bytes, ccjs_string_method_value_\d+->len, "\$\{", 2\)/)
  assert.match(result.code, /ccjs_string_starts_with_parts\(ccjs_string_method_value_\d+->bytes, ccjs_string_method_value_\d+->len, "expr", 4\)/)
  assert.match(result.code, /ccjs_string_ends_with_parts\(ccjs_string_method_value_\d+->bytes, ccjs_string_method_value_\d+->len, "}", 1\)/)
  assert.match(result.code, /ccjs_string_slice_parts\(&ccjs_default_allocator, ccjs_slice_string_\d+->bytes, ccjs_slice_string_\d+->len, ccjs_slice_start_\d+, ccjs_slice_end_\d+, &ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_string_trim_parts\(&ccjs_default_allocator, ccjs_trim_string_\d+->bytes, ccjs_trim_string_\d+->len, &ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_string_split_parts\(&ccjs_default_allocator, ccjs_split_string_\d+->bytes, ccjs_split_string_\d+->len, ",", 1, &ccjs_split_array_\d+\)/)
})


test('lowers C string comparisons over known object fields', () => {
  const result = compileSource(
    `type User = {
  name: string
}

export function main(): void {
  const user: User = { name: 'Ada' }
  const target = 'Ada'
  console.log(user.name === target, user['name'] !== 'Grace')
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /ccjs_object_get_known\(user, 0, &ccjs_expr_value_\d+\)/)
  assert.match(result.code, /ccjs_object_get\(user, "name", 4, &ccjs_expr_value_\d+\)/)
  assert.match(result.code, /memcmp\(ccjs_cmp_string_\d+->bytes, target, ccjs_cmp_string_\d+->len\) == 0/)
  assert.match(result.code, /!\(ccjs_cmp_string_\d+->len == 5 && memcmp\(ccjs_cmp_string_\d+->bytes, "Grace", ccjs_cmp_string_\d+->len\) == 0\)/)
})


test('lowers C string comparisons over object expression fields', () => {
  const result = compileSource(
    `type User = {
  name: string
}

function makeUser(): User {
  return { name: 'Ada' }
}

export function main(): void {
  console.log(makeUser().name === 'Ada', makeUser()['name'] !== 'Grace')
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /ccjs_object_get_known\(ccjs_value_\d+, 0, &ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_cmp_string_\d+->len == 3 && memcmp\(ccjs_cmp_string_\d+->bytes, "Ada", ccjs_cmp_string_\d+->len\) == 0/)
  assert.match(result.code, /!\(ccjs_cmp_string_\d+->len == 5 && memcmp\(ccjs_cmp_string_\d+->bytes, "Grace", ccjs_cmp_string_\d+->len\) == 0\)/)
})


test('lowers C string charCodeAt calls to byte reads', () => {
  const result = compileSource(
    `function isLower(ch: string): boolean {
  const code = ch.charCodeAt(0)
  return code >= 97 && code <= 122
}

function sumCodes(value: string): number {
  let total = 0
  for (let index = 0; index < value.length; index = index + 1) {
    const code = value.charCodeAt(index)
    total = total + code
  }
  return total
}

export function main(): void {
  console.log(isLower('m'), isLower('M'), sumCodes('AZ'))
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /size_t ccjs_string_char_code_index_\d+ = \(size_t\)\(0\);/)
  assert.match(result.code, /\(double\)\(\(unsigned char\)ch->bytes\[ccjs_string_char_code_index_\d+\]\)/)
  assert.match(result.code, /const double code = \(\(ccjs_string_char_code_index_\d+ < ch->len\)/)
  assert.match(result.code, /size_t ccjs_string_char_code_index_\d+ = \(size_t\)\(index\);/)
  assert.match(result.code, /\(double\)\(\(unsigned char\)value->bytes\[ccjs_string_char_code_index_\d+\]\)/)
})


test('lowers C string index expressions to runtime one-byte strings', () => {
  const result = compileSource(
    `function pick(source: string, index: number): string {
  const ch = source[index]
  return ch
}

const name = 'Ada'
const first = name[0]
const second = pick('Ada', 1)
const third = name[2]
console.log(first, second, third)
`,
    {
      target: 'c'
    }
  )

  assert.deepEqual(result.ir.features, ['runtime-values', 'string-bytes'])
  assert.deepEqual(result.ir.runtimeRequirements, ['managed-values', 'string-bytes'])
  assert.match(
    result.code,
    /ccjs_string_from_literal\(\n\s+&ccjs_default_allocator,\n\s+\(ccjs_string_index_\d+ < source->len\) \? source->bytes \+ ccjs_string_index_\d+ : "",\n\s+\(ccjs_string_index_\d+ < source->len\) \? 1 : 0,\n\s+&ccjs_value_\d+\n\s+\)/
  )
  assert.match(
    result.code,
    /ccjs_string_from_literal\(\n\s+&ccjs_default_allocator,\n\s+\(ccjs_string_index_\d+ < strlen\(name\)\) \? name \+ ccjs_string_index_\d+ : "",\n\s+\(ccjs_string_index_\d+ < strlen\(name\)\) \? 1 : 0,\n\s+&ccjs_value_\d+\n\s+\)/
  )
})


test('lowers C string slice for literals and runtime strings', () => {
  const result = compileSource(
    `type User = {
  name: string
}

function middle(name: string): string {
  return name.slice(1, 3)
}

function getName(): string {
  return 'Grace'
}

export function main(): void {
  const user: User = { name: 'Ada' }
  const name = user.name
  const message = name + '!'
  console.log('Ada'.slice(1, 3), middle(name), user.name.slice(0, 1), getName().slice(1, 4), message.slice(3), name.slice(0, 99), name.slice(-2))
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /size_t ccjs_slice_length_\d+ = ccjs_string_code_unit_length_parts\(name->bytes, name->len\);/
  )
  assert.match(result.code, /double ccjs_slice_start_raw_\d+ = 1;/)
  assert.match(result.code, /double ccjs_slice_start_raw_\d+ = \(-2\);/)
  assert.match(
    result.code,
    /if \(ccjs_slice_end_\d+ < ccjs_slice_start_\d+\) ccjs_slice_end_\d+ = ccjs_slice_start_\d+;/
  )
  assert.match(
    result.code,
    /ccjs_string_slice_parts\(&ccjs_default_allocator, name->bytes, name->len, ccjs_slice_start_\d+, ccjs_slice_end_\d+, &ccjs_value_\d+\)/
  )
  assert.match(
    result.code,
    /ccjs_string_slice_parts\(&ccjs_default_allocator, "Ada", 3, ccjs_slice_start_\d+, ccjs_slice_end_\d+, &ccjs_value_\d+\)/
  )
  assert.match(
    result.code,
    /ccjs_string_slice_parts\(&ccjs_default_allocator, ccjs_slice_string_\d+->bytes, ccjs_slice_string_\d+->len, ccjs_slice_start_\d+, ccjs_slice_end_\d+, &ccjs_value_\d+\)/
  )
  assert.match(
    result.code,
    /ccjs_string_slice_parts\(&ccjs_default_allocator, message->bytes, message->len, ccjs_slice_start_\d+, ccjs_slice_end_\d+, &ccjs_value_\d+\)/
  )
})


test('lowers C string split for literals and runtime strings', () => {
  const result = compileSource(
    `type User = {
  names: string
}

export function main(): void {
  const user: User = { names: 'Ada,Grace' }
  const names = user.names.split(',')
  const initials = user.names.split(',').map(name => name.slice(0, 1)).sort()
  console.log(names[0], names[1], initials[0], initials[1])
}
`,
    {
      target: 'c'
    }
  )

  assert.deepEqual(result.ir.runtimeRequirements, ['collections', 'managed-values', 'objects', 'string-bytes'])
  assert.match(
    result.code,
    /ccjs_string_split_parts\(&ccjs_default_allocator, ccjs_split_string_\d+->bytes, ccjs_split_string_\d+->len, ",", 1, &ccjs_split_array_\d+\)/
  )
  assert.match(
    result.code,
    /ccjs_string_slice_parts\(&ccjs_default_allocator, name->bytes, name->len, ccjs_slice_start_\d+, ccjs_slice_end_\d+, &ccjs_value_\d+\)/
  )
})


test('lowers C string trim for literals and runtime strings', () => {
  const result = compileSource(
    `type User = {
  name: string
}

function clean(name: string): string {
  return name.trim()
}

function getName(): string {
  return ' Grace '
}

export function main(): void {
  const user: User = { name: ' Ada ' }
  const name = user.name
  const message = ' ' + name + ' '
  console.log(' Ada '.trim(), clean(name), user.name.trim(), getName().trim(), message.trim())
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /ccjs_string_trim_parts\(&ccjs_default_allocator, name->bytes, name->len, &ccjs_value_\d+\)/
  )
  assert.match(result.code, /ccjs_string_trim_parts\(&ccjs_default_allocator, " Ada ", 5, &ccjs_value_\d+\)/)
  assert.match(
    result.code,
    /ccjs_string_trim_parts\(&ccjs_default_allocator, ccjs_trim_string_\d+->bytes, ccjs_trim_string_\d+->len, &ccjs_value_\d+\)/
  )
  assert.match(
    result.code,
    /ccjs_string_trim_parts\(&ccjs_default_allocator, message->bytes, message->len, &ccjs_value_\d+\)/
  )
})


test('lowers C String conversion for string number boolean and null values', () => {
  const result = compileSource(
    `type User = {
  name: string
}

function label(value: number): string {
  return String(value)
}

function flag(value: boolean): string {
  return String(value)
}

export function main(): void {
  const user: User = { name: 'Ada' }
  const name = user.name
  const local = 'Ada'
  console.log(String('Ada'), String(local), String(name), label(42), flag(true), String(false), String(null), String(name).length)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /ccjs_string_from_literal\(&ccjs_default_allocator, "Ada", 3, &ccjs_value_\d+\)/)
  assert.match(
    result.code,
    /ccjs_string_from_literal\(&ccjs_default_allocator, local, strlen\(local\), &ccjs_value_\d+\)/
  )
  assert.match(
    result.code,
    /ccjs_string_from_literal\(&ccjs_default_allocator, name->bytes, name->len, &ccjs_value_\d+\)/
  )
  assert.match(result.code, /ccjs_string_from_number\(&ccjs_default_allocator, value, &ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_string_from_bool\(&ccjs_default_allocator, \(value\) != 0, &ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_string_from_bool\(&ccjs_default_allocator, \(0\) != 0, &ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_string_from_literal\(&ccjs_default_allocator, "null", 4, &ccjs_value_\d+\)/)
})


test('lowers C Number conversion to nullable number parsing', () => {
  const result = compileSource(
    `export function main(): void {
  const port = Number('8080') ?? 3000
  const fallback = Number('nope') ?? 3000
  console.log(port, fallback)
}
`,
    {
      target: 'c'
    }
  )

  assert.deepEqual(result.ir.features, ['number-from-string-null', 'runtime-values', 'string-bytes'])
  assert.match(result.code, /ccjs_string_to_number\("8080", 4, &ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_string_to_number\("nope", 4, &ccjs_value_\d+\)/)
  assert.match(result.code, /if \(ccjs_value_\d+\.tag == CCJS_TAG_NULL\) \{/)
  assert.match(result.code, /ccjs_value_\d+\.tag != CCJS_TAG_NUMBER/)

  assertDiagnostic(
    `export function main(): void {
  const port = Number('8080')
  console.log(port)
}
`,
    'CCJS_C_NULLISH',
    {
      target: 'c'
    }
  )
})


test('lowers known C array index access to runtime calls', () => {
  const result = compileSource(
    `export function main(): void {
  const values = [42, true]
  const score = values[0]
  const active = values[1]
  console.log(score, active)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /ccjs_array_get\(values, 0, &ccjs_item_\d+\)/)
  assert.match(result.code, /const double score = ccjs_item_\d+\.as\.number;/)
  assert.match(result.code, /ccjs_array_get\(values, 1, &ccjs_item_\d+\)/)
  assert.match(result.code, /const double active = ccjs_item_\d+\.as\.boolean \? 1 : 0;/)
})


test('lowers known C array index assignments to runtime calls', () => {
  const result = compileSource(
    `export function main(): void {
  const values = [1, false]
  values[0] = 42
  values[1] = true
  const score = values[0]
  const active = values[1]
  console.log(score, active)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /ccjs_array_set\(values, 0, ccjs_number_value\(42\)\)/)
  assert.match(result.code, /ccjs_array_set\(values, 1, ccjs_bool_value\(true\)\)/)
  assert.match(result.code, /const double score = ccjs_item_\d+\.as\.number;/)
  assert.match(result.code, /const double active = ccjs_item_\d+\.as\.boolean \? 1 : 0;/)
})


test('lowers known C string array index reads to runtime strings', () => {
  const result = compileSource(
    `export function main(): void {
  const values = ['Ada']
  values[0] = 'Grace'
  const name = values[0]
  console.log(name)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /ccjs_array_set\(values, 0, ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_array_get\(values, 0, &ccjs_item_\d+\)/)
  assert.match(
    result.code,
    /if \(ccjs_item_\d+\.tag != CCJS_TAG_STRING \|\| ccjs_item_\d+\.as\.ref == 0\)\s+goto ccjs_cleanup;/
  )
  assert.match(result.code, /const ccjs_string \*name = \(ccjs_string \*\)ccjs_item_\d+\.as\.ref;/)
  assert.match(result.code, /printf\("%\.\*s\\n", \(int\)name->len, name->bytes\);/)
})


test('lowers C runtime string references for object and array assignments', () => {
  const result = compileSource(
    `export function main(): void {
  const source = { name: 'Ada' }
  const name = source.name
  const target = { name: 'Bob' }
  const values = ['Grace']
  target.name = name
  values[0] = name
  const objectName = target.name
  const arrayName = values[0]
  console.log(objectName, arrayName)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /ccjs_value ccjs_value_\d+;\n {2}ccjs_value_\d+\.tag = CCJS_TAG_STRING;\n {2}ccjs_value_\d+\.as\.ref = \(ccjs_ref \*\)&name->header;/
  )
  assert.match(result.code, /ccjs_object_set_known\(target, 0, ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_array_set\(values, 0, ccjs_value_\d+\)/)
  assert.match(
    result.code,
    /printf\("%\.\*s %\.\*s\\n", \(int\)objectName->len, objectName->bytes, \(int\)arrayName->len, arrayName->bytes\);/
  )
})


test('lowers C nested object string field reads to runtime strings', () => {
  const result = compileSource(
    `type FunctionType = {
  returnType: string
}

type Wrapper = {
  functionType: FunctionType
}

export function main(): void {
  const wrapper: Wrapper = { functionType: { returnType: 'number' } }
  const returnType = wrapper.functionType.returnType
  console.log(returnType)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /ccjs_object_get_known\(wrapper, 0, &ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_object_get_known\(ccjs_value_\d+, 0, &ccjs_value_\d+\)/)
  assert.match(result.code, /const ccjs_string\* returnType = \(ccjs_string\*\)ccjs_value_\d+\.as\.ref;/)
  assert.match(result.code, /printf\("%\.\*s\\n", \(int\)returnType->len, returnType->bytes\);/)
})


test('lowers C string-returning calls for object and array assignments', () => {
  const result = compileSource(
    `function getName(): string {
  return 'Ada'
}

export function main(): void {
  const target = { name: 'Bob' }
  const values = ['Grace']
  target.name = getName()
  values[0] = getName()
  console.log(target.name, values[0])
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /ccjs_value_\d+ = getName\(\);/)
  assert.match(result.code, /ccjs_object_set_known\(target, 0, ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_array_set\(values, 0, ccjs_value_\d+\)/)
  assert.match(result.code, /printf\("%\.\*s %\.\*s\\n"/)
})


test('compiles for of loops over arrays to C', () => {
  const source = `export function main(): void {
  const values = [1, 2, 3]
  let total = 0

  for (const value of values) {
    total = total + value
  }

  console.log(total)
}
`
  const c = compileSource(source, {
    target: 'c'
  })

  assert.match(c.code, /for \(size_t ccjs_for_index_\d+ = 0; ccjs_for_index_\d+ < 3; ccjs_for_index_\d+ \+= 1\) \{/)
  assert.match(c.code, /ccjs_array_get\(values, ccjs_for_index_\d+, &ccjs_for_value_\d+\)/)
  assert.match(c.code, /double value = ccjs_for_value_\d+\.as\.number;/)
})


test('compiles for of loops over string arrays to C', () => {
  const c = compileSource(
    `export function main(): void {
  const names = ['Ada', 'Grace']

  for (const name of names) {
    console.log(name)
  }
}
`,
    {
      target: 'c'
    }
  )

  assert.match(c.code, /ccjs_array_get\(names, ccjs_for_index_\d+, &ccjs_for_value_\d+\)/)
  assert.match(
    c.code,
    /if \(ccjs_for_value_\d+\.tag != CCJS_TAG_STRING \|\| ccjs_for_value_\d+\.as\.ref == 0\)\s+goto ccjs_cleanup;/
  )
  assert.match(c.code, /ccjs_string \*name = \(ccjs_string \*\)ccjs_for_value_\d+\.as\.ref;/)
  assert.match(c.code, /printf\("%\.\*s\\n", \(int\)name->len, name->bytes\);/)
})


test('compiles for of loops over Set values to C', () => {
  const source = `type Bag = {
  names: Set<string>
}

type User = {
  name: string
}

export function main(): void {
  const values: Set<number> = new Set([1, 2, 3])
  const names: Set<string> = new Set(['Ada', 'Grace'])
  const ada: User = { name: 'Ada' }
  const users: Set<User> = new Set()
  const bag: Bag = { names }
  let total = 0
  let letters = 0
  let seenUsers = 0

  users.add(ada)

  for (const value of values.add(4)) {
    total = total + value
  }

  for (const name of bag['names']) {
    letters = letters + name.length
  }

  for (const user of users) {
    if (users.has(user)) {
      seenUsers = seenUsers + 1
    }
  }

  console.log(total, letters, seenUsers)
}
`
  const c = compileSource(source, {
    target: 'c'
  })

  assert.match(c.code, /ccjs_set_add\(values, ccjs_number_value\(4\)\)/)
  assert.match(c.code, /ccjs_set \*ccjs_for_set_\d+ = \(ccjs_set \*\)values\.as\.ref;/)
  assert.match(c.code, /CCJS_SET_SLOT_OCCUPIED/)
  assert.match(c.code, /ccjs_for_value_\d+ = ccjs_for_set_\d+->entries\[ccjs_for_set_index_\d+\]\.value;/)
  assert.match(c.code, /ccjs_object_get\(bag, "names", 5, &ccjs_value_\d+\)/)
  assert.match(c.code, /ccjs_string \*name = \(ccjs_string \*\)ccjs_for_value_\d+\.as\.ref;/)
  assert.match(c.code, /ccjs_for_value_\d+\.tag != CCJS_TAG_OBJECT/)
  assert.match(c.code, /ccjs_value user = ccjs_for_value_\d+;/)
})


test('compiles for of loops over Map values as MapEntry objects', () => {
  const source = `type Bag = {
  scores: Map<string, number>
}

export function main(): void {
  const scores: Map<string, number> = new Map([['Ada', 7], ['Grace', 9]])
  const bag: Bag = { scores }
  let total = 0
  let letters = 0

  for (const entry of bag['scores'].set('Alan', 5)) {
    total = total + entry.value
    letters = letters + entry.key.length
  }

  console.log(total, letters)
}
`
  const c = compileSource(source, {
    target: 'c'
  })

  assert.match(c.code, /ccjs_map \*ccjs_for_map_\d+ = \(ccjs_map \*\)ccjs_value_\d+\.as\.ref;/)
  assert.match(c.code, /CCJS_MAP_SLOT_OCCUPIED/)
  assert.match(c.code, /ccjs_object_new\(&ccjs_default_allocator, &ccjs_shape_map_entry_\d+, &entry\)/)
  assert.match(c.code, /ccjs_object_init_known\(entry, 0, ccjs_for_map_\d+->entries\[ccjs_for_map_index_\d+\]\.key\)/)
  assert.match(c.code, /ccjs_object_init_known\(entry, 1, ccjs_for_map_\d+->entries\[ccjs_for_map_index_\d+\]\.value\)/)
  assert.match(c.code, /ccjs_object_get_known\(entry, 1, &ccjs_(?:expr_)?value_\d+\)/)
  assert.match(c.code, /ccjs_object_get_known\(entry, 0, &ccjs_(?:expr_)?value_\d+\)/)

  const objectKeys = compileSource(
    `type User = {
  name: string
}

export function main(): void {
  const ada: User = { name: 'Ada' }
  const scores: Map<User, number> = new Map()
  scores.set(ada, 7)
  let seen = 0

  for (const entry of scores) {
    if (scores.has(entry.key)) {
      seen = seen + entry.value
    }
  }

  console.log(seen)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(objectKeys.code, /ccjs_object_init_known\(entry, 0, ccjs_for_map_\d+->entries\[ccjs_for_map_index_\d+\]\.key\)/)
  assert.match(objectKeys.code, /ccjs_object_get_known\(entry, 0, &ccjs_(?:expr_)?value_\d+\)/)
  assert.match(objectKeys.code, /ccjs_map_has\(scores, ccjs_(?:expr_)?value_\d+, &ccjs_map_has_\d+\)/)
})


test('compiles for of loops over Map.values iterables', () => {
  const numbers = compileSource(
    `export function main(): void {
  const scores: Map<string, number> = new Map([['Ada', 7], ['Grace', 9]])
  let total = 0

  for (const value of scores.values()) {
    total = total + value
  }

  console.log(total)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(numbers.code, /ccjs_map \*ccjs_for_map_\d+ = \(ccjs_map \*\)scores\.as\.ref;/)
  assert.match(numbers.code, /CCJS_MAP_SLOT_OCCUPIED/)
  assert.match(numbers.code, /ccjs_for_value_\d+ = ccjs_for_map_\d+->entries\[ccjs_for_map_index_\d+\]\.value;/)
  assert.match(numbers.code, /double value = ccjs_for_value_\d+\.as\.number;/)

  const objects = compileSource(
    `type User = {
  score: number
}

export function main(): void {
  const users: Map<string, User> = new Map([['Ada', { score: 7 }], ['Grace', { score: 9 }]])
  let count = 0

  for (const user of users.values()) {
    count = count + 1
  }

  console.log(count)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(objects.code, /ccjs_for_value_\d+ = ccjs_for_map_\d+->entries\[ccjs_for_map_index_\d+\]\.value;/)
  assert.match(objects.code, /ccjs_for_value_\d+\.tag != CCJS_TAG_OBJECT/)
  assert.match(objects.code, /ccjs_value user = ccjs_for_value_\d+;/)

  const unionObjects = compileSource(
    `type Named = {
  kind: string,
  name: string
}

type Scored = {
  kind: string,
  score: number
}

type Item = Named | Scored

export function main(): void {
  const named: Named = { kind: 'named', name: 'Ada' }
  const scored: Scored = { kind: 'scored', score: 7 }
  const items: Map<string, Item> = new Map()
  let count = 0

  items.set('named', named)
  items.set('scored', scored)

  for (const item of items.values()) {
    count = count + 1
  }

  console.log(count)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(unionObjects.code, /ccjs_for_value_\d+ = ccjs_for_map_\d+->entries\[ccjs_for_map_index_\d+\]\.value;/)
  assert.match(unionObjects.code, /ccjs_for_value_\d+\.tag != CCJS_TAG_OBJECT/)
  assert.match(unionObjects.code, /ccjs_value item = ccjs_for_value_\d+;/)
})


test('compiles for of loops over Map.keys iterables', () => {
  const strings = compileSource(
    `export function main(): void {
  const scores: Map<string, number> = new Map([['Ada', 7], ['Grace', 9]])
  const copy: Map<string, number> = new Map(scores)
  let letters = 0

  for (const key of copy.keys()) {
    letters = letters + key.length
  }

  console.log(letters)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(strings.code, /ccjs_map \*ccjs_for_map_\d+ = \(ccjs_map \*\)copy\.as\.ref;/)
  assert.match(strings.code, /CCJS_MAP_SLOT_OCCUPIED/)
  assert.match(strings.code, /ccjs_for_value_\d+ = ccjs_for_map_\d+->entries\[ccjs_for_map_index_\d+\]\.key;/)
  assert.match(strings.code, /ccjs_string \*key = \(ccjs_string \*\)ccjs_for_value_\d+\.as\.ref;/)

  const objects = compileSource(
    `type User = {
  name: string
}

export function main(): void {
  const ada: User = { name: 'Ada' }
  const scores: Map<User, number> = new Map()
  scores.set(ada, 7)
  let seen = 0

  for (const user of scores.keys()) {
    if (scores.has(user)) {
      seen = seen + 1
    }
  }

  console.log(seen)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(objects.code, /ccjs_for_value_\d+ = ccjs_for_map_\d+->entries\[ccjs_for_map_index_\d+\]\.key;/)
  assert.match(objects.code, /ccjs_for_value_\d+\.tag != CCJS_TAG_OBJECT/)
  assert.match(objects.code, /ccjs_value user = ccjs_for_value_\d+;/)
  assert.match(objects.code, /ccjs_map_has\(scores, user, &ccjs_map_has_\d+\)/)
})


test('compiles for of loops over inline array literals to C', () => {
  const c = compileSource(
    `export function main(): void {
  let total = 0

  for (const value of [1, 2, 3]) {
    total = total + value
  }

  console.log(total)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(c.code, /ccjs_array_new\(&ccjs_default_allocator, 3, &ccjs_for_array_\d+\)/)
  assert.match(c.code, /for \(size_t ccjs_for_index_\d+ = 0; ccjs_for_index_\d+ < 3; ccjs_for_index_\d+ \+= 1\) \{/)
  assert.match(c.code, /double value = ccjs_for_value_\d+\.as\.number;/)
})


test('compiles for of loops over inline string array literals to C', () => {
  const c = compileSource(
    `export function main(): void {
  for (const name of ['Ada', 'Grace']) {
    console.log(name)
  }
}
`,
    {
      target: 'c'
    }
  )

  assert.match(c.code, /ccjs_array_new\(&ccjs_default_allocator, 2, &ccjs_for_array_\d+\)/)
  assert.match(c.code, /ccjs_string \*name = \(ccjs_string \*\)ccjs_for_value_\d+\.as\.ref;/)
  assert.match(c.code, /printf\("%\.\*s\\n", \(int\)name->len, name->bytes\);/)
})


test('drives C function collection from target-neutral IR body', () => {
  const result = compileSource(
    `function greet(): void {
  console.log('hello')
}

export function main(): void {
  greet()
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /void greet\(void\) \{/)
  assert.match(result.code, /void ccjs_main\(void\) \{/)

  const withoutIrBodyFunctions = emitCFromIr({
    ...result.ir,
    body: []
  })

  assert.doesNotMatch(withoutIrBodyFunctions, /void greet\(void\) \{/)
  assert.doesNotMatch(withoutIrBodyFunctions, /void ccjs_main\(void\) \{/)
})


test('drives IR function effect collection from top-level item metadata', () => {
  const result = compileSource(
    `function fail(): void {
  throw 'nope'
}

const label = 'ok'
console.log(label)
`,
    {
      target: 'c'
    }
  )

  assert.deepEqual(result.ir.functionEffects, [
    {
      name: 'fail',
      throws: true,
      throwValueTypes: ['string']
    }
  ])
  assert.deepEqual(
    collectIrFunctionEffects([
      {
        body: result.ir.body,
        topLevelItems: []
      }
    ]),
    []
  )
})


test('drives C collection headers from target-neutral IR requirements', () => {
  const stringOnly = compileSource(
    `export function main(): void {
  const text = String(7)
  console.log(text.length)
}
`,
    {
      target: 'c'
    }
  )
  const arrayResult = compileSource(
    `export function main(): void {
  const values = [1]
  console.log(values.length)
}
`,
    {
      target: 'c'
    }
  )
  const arrayCode = emitCFromIr({
    ...arrayResult.ir,
    features: []
  })
  const withoutCollections = emitCFromIr({
    ...arrayResult.ir,
    runtimeRequirements: arrayResult.ir.runtimeRequirements.filter((item) => item !== 'collections')
  })

  assert.deepEqual(stringOnly.ir.runtimeRequirements, ['managed-values', 'string-bytes'])
  assert.doesNotMatch(stringOnly.code, /#include "ccjs\/array\.h"/)
  assert.doesNotMatch(stringOnly.code, /#include "ccjs\/map\.h"/)
  assert.doesNotMatch(stringOnly.code, /#include "ccjs\/object\.h"/)
  assert.doesNotMatch(stringOnly.code, /#include "ccjs\/set\.h"/)
  assert.deepEqual(arrayResult.ir.runtimeRequirements, ['collections', 'managed-values', 'string-bytes'])
  assert.match(arrayCode, /#include "ccjs\/array\.h"/)
  assert.match(arrayCode, /#include "ccjs\/map\.h"/)
  assert.match(arrayCode, /#include "ccjs\/set\.h"/)
  assert.doesNotMatch(withoutCollections, /#include "ccjs\/array\.h"/)
  assert.doesNotMatch(withoutCollections, /#include "ccjs\/map\.h"/)
  assert.doesNotMatch(withoutCollections, /#include "ccjs\/set\.h"/)
})


test('lowers Buffer and Uint8Array APIs to C binary runtime calls', () => {
  const result = compileSource(
    `export function main(): void {
  const bytes = Buffer.from('hi', 'utf8')
  const out = new Uint8Array(4)
  out[0] = bytes[0]
  out[1] = 7
  const slice = out.slice(0, 2)
  const text = bytes.toString()
  console.log(bytes.length, out[1], slice.length, text)
}
`,
    {
      target: 'c'
    }
  )

  assert.equal(result.hir.body[0].body.find((item) => item.name === 'bytes')?.valueType, 'bytes')
  assert.equal(result.hir.body[0].body.find((item) => item.name === 'out')?.valueType, 'bytes')
  assert.deepEqual(result.ir.runtimeRequirements, ['binary', 'managed-values', 'string-bytes'])
  assert.match(result.code, /#include "ccjs\/binary\.h"/)
  assert.match(
    result.code,
    /ccjs_bytes_from_data\(&ccjs_default_allocator, \(const uint8_t \*\)"hi", 2, &ccjs_bytes_\d+\)/
  )
  assert.match(result.code, /ccjs_bytes_new\(&ccjs_default_allocator, \(size_t\)\(4\), &ccjs_bytes_\d+\)/)
  assert.match(result.code, /ccjs_bytes_get\(bytes, \(size_t\)\(0\), &ccjs_byte_\d+\)/)
  assert.match(result.code, /ccjs_bytes_set\(out, \(size_t\)\(1\), \(uint8_t\)\(7\)\)/)
  assert.match(result.code, /double ccjs_bytes_start_raw_\d+ = 0;/)
  assert.match(result.code, /double ccjs_bytes_end_raw_\d+ = 2;/)
  assert.match(result.code, /ccjs_bytes_slice\(out, ccjs_bytes_start_\d+, ccjs_bytes_end_\d+, &ccjs_bytes_slice_\d+\)/)
  assert.match(result.code, /ccjs_bytes_to_string\(&ccjs_default_allocator, bytes, &ccjs_bytes_string_\d+\)/)

  const arrayLiteral = compileSource(
    `export function main(): void {
  const bytes = new Uint8Array([1, 2, 3])
  console.log(bytes.length, bytes[2])
}
`,
    {
      target: 'c'
    }
  )

  assert.deepEqual(arrayLiteral.ir.runtimeRequirements, ['binary', 'managed-values', 'string-bytes'])
  assert.doesNotMatch(arrayLiteral.code, /#include "ccjs\/array\.h"/)
  assert.match(arrayLiteral.code, /ccjs_bytes_new\(&ccjs_default_allocator, 3, &ccjs_bytes_\d+\)/)
  assert.match(arrayLiteral.code, /ccjs_bytes_set\(ccjs_bytes_\d+, 2, \(uint8_t\)\(3\)\)/)

  assertDiagnostic(
    `export function main(): void {
  const bytes = Buffer.from('hi', 'hex')
  console.log(bytes.length)
}
`,
    'CCJS_TYPE_MISMATCH'
  )
})


test('reports embedded heap capability diagnostics for array-producing methods', () => {
  const source = `export function main(): void {
  const values = [1, 2, 3]
  const result = values.filter(value => value > 1).map(value => value + 1)
  console.log(result.length)
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
          'embedded profile requires heap capability for Array.filter',
          'embedded profile requires heap capability for Array.map'
        ]
      )
      return true
    }
  )

  const enabled = compileSource(source, {
    target: 'c',
    profile: 'embedded',
    capabilities: {
      heap: true
    }
  })

  assert.doesNotMatch(enabled.code, /ccjs_filter_array_\d+/)
  assert.doesNotMatch(enabled.code, /ccjs_map_array_\d+/)
  assert.match(enabled.code, /ccjs_array_push\(__ccjs_array_expr_\d+, ccjs_number_value/)
  assert.match(enabled.code, /ccjs_array_push\(result, ccjs_number_value/)
})


test('checks string length as a readonly number field', () => {
  const result = compileSource(
    `export function main(): void {
  const name = 'Ada'
  const size = name.length
  console.log(size)
}
`,
    {
      target: 'c'
    }
  )
  const main = result.hir.body.find((item) => item.type === 'FunctionDeclaration' && item.name === 'main')
  const size = main?.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'size')

  assert.equal(size?.valueType, 'number')
  assert.match(result.code, /ccjs_string_code_unit_length_parts\(name, strlen\(name\)\)/)

  assertDiagnostic(
    `export function main(): void {
  const name = 'Ada'
  name.length = 4
}
`,
    'CCJS_ASSIGN_READONLY_FIELD'
  )
})


test('checks array length as a readonly number field', () => {
  const result = compileSource(
    `function length(values: number[]): number {
  return values.length
}

export function main(): void {
  const values = [1, 2, 3]
  console.log(length(values))
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /ccjs_array_len\(values, &ccjs_array_len_\d+\)/)

  assertDiagnostic(
    `export function main(): void {
  const values = [1, 2, 3]
  values.length = 4
}
`,
    'CCJS_ASSIGN_READONLY_FIELD'
  )
})


test('keeps array element types for T[] and Array<T>', () => {
  const result = compileSource(
    `function firstNumber(values: number[]): number {
  return values[0]
}

function firstName(values: Array<string>): string {
  return values[0]
}

export function main(): void {
  const values: number[] = [1, 2, 3]
  const names: Array<string> = ['Ada']
  console.log(firstNumber(values), firstName(names))
}
`,
    {
      target: 'c'
    }
  )
  const firstNumber = result.hir.body.find((item) => item.type === 'FunctionDeclaration' && item.name === 'firstNumber')
  const firstName = result.hir.body.find((item) => item.type === 'FunctionDeclaration' && item.name === 'firstName')
  const main = result.hir.body.find((item) => item.type === 'FunctionDeclaration' && item.name === 'main')
  assert.ok(firstNumber)
  assert.ok(firstName)
  assert.ok(main)
  const [values, names] = main.body.filter((item) => item.type === 'VariableDeclaration')

  assert.equal(firstNumber.params[0].valueType, 'array')
  assert.equal(firstNumber.params[0].arrayElementType, 'number')
  assert.equal(firstName.params[0].valueType, 'array')
  assert.equal(firstName.params[0].arrayElementType, 'string')
  assert.equal(values.valueType, 'array')
  assert.equal(values.arrayElementType, 'number')
  assert.equal(names.valueType, 'array')
  assert.equal(names.arrayElementType, 'string')
  assert.match(result.code, /ccjs_array_get\(values, 0, &ccjs_value_\d+\)/)

  assertDiagnostic(
    `function first(values: number[]): string {
  return values[0]
}
`,
    'CCJS_TYPE_MISMATCH'
  )

  assertDiagnostic(
    `export function main(): void {
  const values: number[] = ['Ada']
  console.log(values.length)
}
`,
    'CCJS_TYPE_MISMATCH'
  )
})


test('checks Array sort filter map as typed chain calls', () => {
  const result = compileSource(
    `export function main(): void {
  const values: number[] = [3, 1, 2]
  const result = values.sort((left, right) => left - right).filter((value, index) => value > index).map(value => value + 1)
  console.log(result.length)
}
`,
    {
      target: 'c'
    }
  )
  const main = result.hir.body.find((item) => item.type === 'FunctionDeclaration' && item.name === 'main')
  assert.ok(main)
  const resultDeclaration = main.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'result')
  assert.ok(resultDeclaration)
  const sortCall = resultDeclaration.init.callee.object.callee.object
  const filterCall = resultDeclaration.init.callee.object
  const mapCall = resultDeclaration.init

  assert.equal(resultDeclaration.valueType, 'array')
  assert.equal(resultDeclaration.arrayElementType, 'number')
  assert.equal(sortCall.args[0].params[0].valueType, 'number')
  assert.equal(sortCall.args[0].params[1].valueType, 'number')
  assert.equal(filterCall.args[0].params[0].valueType, 'number')
  assert.equal(filterCall.args[0].params[1].valueType, 'number')
  assert.equal(mapCall.args[0].params[0].valueType, 'number')
  assert.match(result.code, /ccjs_sort_compare_\d+ = \(left - right\);/)
  assert.match(result.code, /ccjs_array_push\(ccjs_filter_array_\d+, ccjs_filter_value_\d+\)/)

  const mapped = compileSource(
    `export function main(): void {
  const values: number[] = [1]
  const names = values.map(value => String(value))
  console.log(names[0])
}
`,
    {
      target: 'c'
    }
  )
  const mappedMain = mapped.hir.body.find((item) => item.type === 'FunctionDeclaration' && item.name === 'main')
  assert.ok(mappedMain)
  const names = mappedMain.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'names')
  assert.ok(names)

  assert.equal(names.valueType, 'array')
  assert.equal(names.arrayElementType, 'string')

  const c = compileSource(
    `export function main(): void {
  const values = [3, 1, 2]
  const result = values
    .sort((left, right) => {
      return left - right
    })
    .filter((value, index) => {
      return value > index
    })
    .map(value => {
      return value + 1
    })

  console.log(result.length)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(c.code, /ccjs_sort_compare_\d+ = \(left - right\);/)
  assert.match(c.code, /if \(value > index\) \{/)
  assert.match(c.code, /ccjs_array_push\(ccjs_map_array_\d+, ccjs_number_value\(\(value \+ 1\)\)\)/)

  const branchedC = compileSource(
    `export function main(): void {
  const values = [1, 2, 3]
  const result = values
    .filter(value => {
      if (value > 1) {
        return true
      } else {
        return false
      }
    })
    .map(value => {
      if (value === 2) {
        return value * 10
      }

      return value + 10
    })

  console.log(result.length)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(branchedC.code, /ccjs_array_callback_done_\d+:;/)
  assert.match(branchedC.code, /if \(1\) \{[\s\S]*ccjs_array_push\(ccjs_filter_array_\d+, ccjs_filter_value_\d+\)/)
  assert.match(branchedC.code, /ccjs_array_push\(ccjs_map_array_\d+, ccjs_number_value\(\(value \* 10\)\)\)/)
  assert.match(branchedC.code, /ccjs_array_push\(ccjs_map_array_\d+, ccjs_number_value\(\(value \+ 10\)\)\)/)

  assertDiagnostic(
    `export function main(): void {
  const values: number[] = [1]
  values.filter(value => value + 1)
}
`,
    'CCJS_TYPE_MISMATCH'
  )

  assertDiagnostic(
    `export function main(): void {
  const values: number[] = [1]
  values.sort((left: string, right: string) => 0)
}
`,
    'CCJS_TYPE_MISMATCH'
  )
})


test('lowers C Array.find declarations to nullable loop results', () => {
  const result = compileSource(
    `export function main(): void {
  const values = [1, 2, 3]
  const found = values.find((value, index) => value > index + 1)

  if (found != null) {
    console.log(found)
  }
}
`,
    {
      target: 'c'
    }
  )

  const main = result.hir.body.find((item) => item.type === 'FunctionDeclaration' && item.name === 'main')
  assert.ok(main)

  const found = main.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'found')
  const loop = main.body.find(
    (item) => item.type === 'ForStatement' && /^__ccjs_find_index_\d+$/.test(item.init.name)
  )

  assert.ok(found)
  assert.ok(loop)
  assert.equal(found.kind, 'let')
  assert.equal(found.valueType, 'number')
  assert.equal(found.nullable, true)
  assert.equal(found.init.type, 'NullLiteral')
  assert.match(result.code, /found = ccjs_null_value\(\);/)
  assert.match(result.code, /for \(;;\) \{/)
  assert.match(result.code, /if \(value > \(__ccjs_find_index_\d+ \+ 1\)\) \{/)
  assert.match(result.code, /found = ccjs_nullable_value_\d+;/)
  assert.match(result.code, /goto ccjs_break_\d+;/)
  assert.doesNotMatch(result.code, /CCJS_C_ARRAY_METHOD/)

  assertDiagnostic(
    `export function main(): void {
  const values = [1]
  values.find(value => value + 1)
}
`,
    'CCJS_TYPE_MISMATCH'
  )
})


test('lowers C Array.find expression contexts to nullable temps', () => {
  const result = compileSource(
    `export function main(): void {
  const values = [1, 2, 3]
  const score = values.find((value, index) => value > index + 1) ?? 0
  console.log(values.find(value => value > 2) ?? 0, score)
}
`,
    {
      target: 'c'
    }
  )

  const main = result.hir.body.find((item) => item.type === 'FunctionDeclaration' && item.name === 'main')
  assert.ok(main)

  const findTemps = main.body.filter(
    (item) => item.type === 'VariableDeclaration' && /^__ccjs_find_expr_\d+$/.test(item.name)
  )
  const score = main.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'score')

  assert.equal(findTemps.length, 2)
  assert.equal(findTemps.every((item) => item.kind === 'let'), true)
  assert.equal(findTemps.every((item) => item.nullable === true), true)
  assert.equal(findTemps.every((item) => item.valueType === 'number'), true)
  assert.equal(findTemps.every((item) => item.init.type === 'NullLiteral'), true)
  assert.ok(score)
  assert.equal(score.init.type, 'BinaryExpression')
  assert.equal(score.init.operator, '??')
  assert.match(score.init.left.path[0], /^__ccjs_find_expr_\d+$/)
  assert.match(result.code, /__ccjs_find_expr_\d+ = ccjs_null_value\(\);/)
  assert.match(result.code, /if \(__ccjs_find_expr_\d+\.tag == CCJS_TAG_NULL\) \{/)
  assert.doesNotMatch(result.code, /CCJS_C_ARRAY_METHOD/)
})


test('lowers C Array.filter Boolean callback to for loop plus push', () => {
  const result = compileSource(
    `export function main(): void {
  const names = ['', 'Ada', 'Grace']
  const presentNames = names.filter(Boolean)
  const numbers = [0, 2, 3]
  const presentNumbers = numbers.filter(Boolean)
  const flags = [false, true]
  const presentFlags = flags.filter(Boolean)
  console.log(presentNames.length, presentNumbers.length, presentFlags.length)
}
`,
    {
      target: 'c'
    }
  )

  const main = result.hir.body.find((item) => item.type === 'FunctionDeclaration' && item.name === 'main')
  assert.ok(main)

  const presentNames = main.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'presentNames')
  const presentNumbers = main.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'presentNumbers')
  const presentFlags = main.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'presentFlags')

  assert.ok(presentNames)
  assert.ok(presentNumbers)
  assert.ok(presentFlags)
  assert.equal(presentNames.valueType, 'array')
  assert.equal(presentNames.arrayElementType, 'string')
  assert.equal(presentNumbers.arrayElementType, 'number')
  assert.equal(presentFlags.arrayElementType, 'boolean')
  assert.equal(presentNames.loweredArrayMethod, true)
  assert.doesNotMatch(result.code, /ccjs_filter_array_\d+/)
  assert.match(result.code, /for \(;;\) \{/)
  assert.match(result.code, /ccjs_array_get\(names, \(size_t\)\(__ccjs_filter_index_\d+\), &ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_string_code_unit_length_parts\(__ccjs_filter_item_\d+->bytes, __ccjs_filter_item_\d+->len\)/)
  assert.match(
    result.code,
    /if \(__ccjs_filter_item_\d+ == __ccjs_filter_item_\d+\) \{\s*ccjs_logical_\d+ = \(__ccjs_filter_item_\d+ != 0\);/s
  )
  assert.match(result.code, /if \(__ccjs_filter_item_\d+\) \{/)
  assert.match(result.code, /ccjs_array_push\(presentNames, ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_array_push\(presentNumbers, ccjs_number_value\(__ccjs_filter_item_\d+\)\)/)
  assert.match(result.code, /ccjs_array_push\(presentFlags, ccjs_bool_value\(\(?__ccjs_filter_item_\d+\)?(?: != 0)?\)\)/)
})


test('lowers C Array.filter chains and return expressions to explicit loops', () => {
  const result = compileSource(
    `function selected(values: number[]): number[] {
  return values.filter(value => value > 1)
}

function count(values: number[]): number {
  return values.length
}

export function main(): void {
  const values = [1, 2, 3]
  const scaled = values.filter((value, index) => value > index).map(value => value * 10)
  const inlineCount = count([0, 2, 3].filter(Boolean))
  console.log(selected(values).length, scaled.length, inlineCount)
}
`,
    {
      target: 'c'
    }
  )
  const selected = result.hir.body.find((item) => item.type === 'FunctionDeclaration' && item.name === 'selected')
  const main = result.hir.body.find((item) => item.type === 'FunctionDeclaration' && item.name === 'main')

  assert.ok(selected)
  assert.ok(main)
  assert.equal(selected.body[0].type, 'VariableDeclaration')
  assert.equal(selected.body[0].loweredArrayMethod, true)
  assert.equal(selected.body[1].type, 'ForStatement')
  assert.equal(selected.body[2].type, 'ReturnStatement')
  assert.match(selected.body[2].argument.path[0], /^__ccjs_array_expr_\d+$/)

  const scaled = main.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'scaled')
  const inlineCount = main.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'inlineCount')
  const chainTemp = main.body.find(
    (item) => item.type === 'VariableDeclaration' && /^__ccjs_array_expr_\d+$/.test(item.name)
  )
  const inlineSource = main.body.find(
    (item) => item.type === 'VariableDeclaration' && /^__ccjs_array_source_\d+$/.test(item.name)
  )

  assert.ok(scaled)
  assert.ok(inlineCount)
  assert.ok(chainTemp)
  assert.ok(inlineSource)
  assert.equal(scaled.loweredArrayMethod, true)
  assert.equal(scaled.arrayElementType, 'number')
  assert.equal(inlineCount.init.args[0].type, 'Reference')
  assert.match(inlineCount.init.args[0].path[0], /^__ccjs_array_expr_\d+$/)
  assert.doesNotMatch(result.code, /ccjs_filter_array_\d+/)
  assert.doesNotMatch(result.code, /ccjs_map_array_\d+/)
  assert.match(result.code, /ccjs_array_push\(__ccjs_array_expr_\d+, ccjs_number_value/)
  assert.match(result.code, /ccjs_array_push\(scaled, ccjs_number_value/)
})


test('checks Map and Set generic methods as typed chain calls', () => {
  const result = compileSource(
    `export function main(): void {
  const scores: Map<string, number> = new Map()
  const maybeScore = scores.set('Ada', 7).get('Ada')
  const score = maybeScore ?? 0
  const hasAda = scores.has('Ada')
  const removed = scores.delete('Ada')
  scores.clear()
  const names: Set<string> = new Set()
  const hasName = names.add('Ada').has('Ada')
  names.clear()
  console.log(score, hasAda, removed, hasName)
}
`,
    {
      target: 'c'
    }
  )
  const main = result.hir.body.find((item) => item.type === 'FunctionDeclaration' && item.name === 'main')
  const typedGet = compileSource(
    `export function main(): void {
  const scores: Map<string, number> = new Map()
  const maybeScore: number | null = scores.get('Ada')
  console.log(maybeScore ?? 0)
}
`,
    {
      target: 'c'
    }
  )
  assert.ok(main)
  const scores = main.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'scores')
  const maybeScore = main.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'maybeScore')
  const score = main.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'score')
  const hasAda = main.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'hasAda')
  const removed = main.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'removed')
  const names = main.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'names')
  const hasName = main.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'hasName')
  assert.ok(scores)
  assert.ok(maybeScore)
  assert.ok(score)
  assert.ok(hasAda)
  assert.ok(removed)
  assert.ok(names)
  assert.ok(hasName)

  assert.equal(scores.valueType, 'map')
  assert.equal(scores.mapKeyType, 'string')
  assert.equal(scores.mapValueType, 'number')
  assert.equal(maybeScore.valueType, 'number')
  assert.equal(maybeScore.nullable, true)
  assert.equal(score.valueType, 'number')
  assert.equal(hasAda.valueType, 'boolean')
  assert.equal(removed.valueType, 'boolean')
  assert.equal(names.valueType, 'set')
  assert.equal(names.setElementType, 'string')
  assert.equal(hasName.valueType, 'boolean')
  assert.deepEqual(result.ir.features, ['collections', 'map-get-null', 'runtime-values'])
  assert.deepEqual(result.ir.runtimeRequirements, ['collections', 'managed-values'])
  assert.equal(typedGet.ir.features.includes('map-get-null'), true)

  assertDiagnostic(
    `export function main(): void {
  const scores: Map<string, number> = new Map()
  const score: number = scores.get('Ada')
  console.log(score)
}
`,
    'CCJS_TYPE_MISMATCH'
  )

  assertDiagnostic(
    `export function main(): void {
  const scores: Map<string, number> = new Map()
  scores.get(1)
}
`,
    'CCJS_TYPE_MISMATCH'
  )

  assertDiagnostic(
    `export function main(): void {
  const scores: Map<string, number> = new Map()
  scores.set('Ada', '7')
}
`,
    'CCJS_TYPE_MISMATCH'
  )

  assertDiagnostic(
    `export function main(): void {
  const names: Set<string> = new Set()
  names.add(1)
}
`,
    'CCJS_TYPE_MISMATCH'
  )

  assertDiagnostic(
    `export function main(): void {
  const scores: Map<string, number> = new Map()
  scores.size = 1
}
`,
    'CCJS_ASSIGN_READONLY_FIELD'
  )

  assertDiagnostic(
    `export function main(): void {
  const scores: Map<string, number> = new Map()
  scores.clear('Ada')
}
`,
    'CCJS_ARG_COUNT'
  )

  assertDiagnostic(
    `export function main(): void {
  const names: Set<string> = new Set()
  names.clear('Ada')
}
`,
    'CCJS_ARG_COUNT'
  )

  const objectIdentityResult = compileSource(
    `type User = {
  name: string
}

export function main(): void {
  const users: Map<User, number> = new Map()
  const ada: User = { name: 'Ada' }
  users.set(ada, 7)
  const copy: Map<User, number> = new Map(users)
  console.log(copy.get(ada) ?? 0)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(objectIdentityResult.code, /ccjs_map_set\(users, ada, ccjs_number_value\(7\)\)/)
  assert.match(objectIdentityResult.code, /ccjs_map\* ccjs_map_source_\d+ = \(ccjs_map\*\)users\.as\.ref;/)

  const objectSetResult = compileSource(
    `type User = {
  name: string
}

export function main(): void {
  const users: Set<User> = new Set()
  const user: User = { name: 'Ada' }
  users.add(user)
  const copy: Set<User> = new Set(users)
  console.log(copy.has(user))
}
`,
    {
      target: 'c'
    }
  )

  assert.match(objectSetResult.code, /ccjs_set_add\(users, user\)/)
  assert.match(objectSetResult.code, /ccjs_set\* ccjs_set_source_\d+ = \(ccjs_set\*\)users\.as\.ref;/)
})


test('checks Map and Set copy constructors as typed collection values', () => {
  const result = compileSource(
    `export function main(): void {
  const scores: Map<string, number> = new Map([['Ada', 7], ['Grace', 9]])
  const copy = new Map(scores)
  const assigned: Map<string, number> = new Map(copy)
  const names: Set<string> = new Set(['Ada', 'Grace'])
  const namesCopy = new Set(names)
  const assignedNames: Set<string> = new Set(namesCopy)
  console.log(assigned.get('Ada') ?? 0, assignedNames.has('Grace'))
}
`,
    {
      target: 'c'
    }
  )
  const main = result.hir.body.find((item) => item.type === 'FunctionDeclaration' && item.name === 'main')
  assert.ok(main)

  const copy = main.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'copy')
  const assigned = main.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'assigned')
  const namesCopy = main.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'namesCopy')
  const assignedNames = main.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'assignedNames')
  assert.ok(copy)
  assert.ok(assigned)
  assert.ok(namesCopy)
  assert.ok(assignedNames)

  assert.equal(copy.valueType, 'map')
  assert.equal(copy.mapKeyType, 'string')
  assert.equal(copy.mapValueType, 'number')
  assert.equal(assigned.mapKeyType, 'string')
  assert.equal(assigned.mapValueType, 'number')
  assert.equal(namesCopy.valueType, 'set')
  assert.equal(namesCopy.setElementType, 'string')
  assert.equal(assignedNames.setElementType, 'string')
  assert.match(result.code, /ccjs_map\* ccjs_map_source_\d+ = \(ccjs_map\*\)scores\.as\.ref;/)
  assert.match(result.code, /ccjs_map_set\(\s*ccjs_map_\d+,\s*ccjs_map_source_\d+->entries\[ccjs_map_source_index_\d+\]\.key,\s*ccjs_map_source_\d+->entries\[ccjs_map_source_index_\d+\]\.value\s*\)/)
  assert.match(result.code, /copy = ccjs_map_\d+;/)
  assert.match(result.code, /ccjs_set\* ccjs_set_source_\d+ = \(ccjs_set\*\)names\.as\.ref;/)
  assert.match(result.code, /ccjs_set_add\(ccjs_set_\d+, ccjs_set_source_\d+->entries\[ccjs_set_source_index_\d+\]\.value\)/)
  assert.match(result.code, /namesCopy = ccjs_set_\d+;/)
})


test('compiles C collection values across function boundaries', () => {
  const result = compileSource(
    `function makeNums(): number[] {
  const nums = [2, 3, 5]

  return nums
}

function sumNums(nums: number[]): number {
  let total = 0

  for (const value of nums) {
    total = total + value
  }

  return total
}

function makeScores(): Map<string, number> {
  const scores: Map<string, number> = new Map([['Ada', 7], ['Grace', 9]])

  return scores
}

function totalScores(scores: Map<string, number>): number {
  let total = 0

  for (const entry of scores.set('Alan', 5)) {
    total = total + entry.value
  }

  return total
}

function makeSeen(): Set<string> {
  const seen: Set<string> = new Set(['Ada'])
  seen.add('Grace')

  return seen
}

function seenCount(seen: Set<string>): number {
  let count = 0

  if (seen.has('Ada')) {
    count = count + 1
  }

  if (seen.has('Grace')) {
    count = count + 1
  }

  return count
}

export function main(): void {
  const nums = makeNums()
  const scores = makeScores()
  const seen = makeSeen()
  const sumFromNums = sumNums(nums)
  const sumFromCall = sumNums(makeNums())
  const totalFromScores = totalScores(scores)
  const totalFromCall = totalScores(makeScores())
  const seenFromSeen = seenCount(seen)
  const seenSizeFromCall = makeSeen().size

  console.log(sumFromNums, sumFromCall, totalFromScores, totalFromCall, scores.size, seenFromSeen, seenSizeFromCall)
}
`,
    {
      target: 'c'
    }
  )
  const makeNums = result.ir.functionDeclarations.find((item) => item.name === 'makeNums')
  const makeScores = result.ir.functionDeclarations.find((item) => item.name === 'makeScores')
  const makeSeen = result.ir.functionDeclarations.find((item) => item.name === 'makeSeen')

  assert.equal(makeNums?.returnType, 'array')
  assert.equal(makeNums?.returnArrayElementType, 'number')
  assert.equal(makeScores?.returnType, 'map')
  assert.equal(makeScores?.returnMapKeyType, 'string')
  assert.equal(makeScores?.returnMapValueType, 'number')
  assert.equal(makeSeen?.returnType, 'set')
  assert.equal(makeSeen?.returnSetElementType, 'string')
  assert.match(result.code, /ccjs_value makeNums\(void\);/)
  assert.match(result.code, /double sumNums\(ccjs_value nums\);/)
  assert.match(result.code, /if \(nums\.tag != CCJS_TAG_ARRAY \|\| nums\.as\.ref == 0\)\s+goto ccjs_cleanup;/)
  assert.match(result.code, /ccjs_value makeScores\(void\);/)
  assert.match(result.code, /double totalScores\(ccjs_value scores\);/)
  assert.match(result.code, /if \(scores\.tag != CCJS_TAG_MAP \|\| scores\.as\.ref == 0\)\s+goto ccjs_cleanup;/)
  assert.match(result.code, /ccjs_value makeSeen\(void\);/)
  assert.match(result.code, /double seenCount\(ccjs_value seen\);/)
  assert.match(result.code, /if \(seen\.tag != CCJS_TAG_SET \|\| seen\.as\.ref == 0\)\s+goto ccjs_cleanup;/)
  assert.match(result.code, /ccjs_array_len\(nums, &ccjs_for_length_\d+\)/)
  assert.match(result.code, /ccjs_map \*ccjs_for_map_\d+ = \(ccjs_map \*\)scores\.as\.ref;/)
  assert.match(result.code, /ccjs_set_has\(seen, ccjs_value_\d+, &ccjs_set_has_\d+\)/)
})


test('checks Map bracket syntax as typed get and set sugar', () => {
  const result = compileSource(
    `export function main(): void {
  const headers: Map<string, string> = new Map()
  headers['content-type'] = 'application/json'
  const contentType = headers['content-type']
  const fallback = headers['accept'] ?? 'text/plain'
  console.log(contentType ?? 'missing', fallback, headers.size)
}
`,
    {
      target: 'c'
    }
  )
  const typedBracketGet = compileSource(
    `export function main(): void {
  const headers: Map<string, string> = new Map()
  headers['content-type'] = 'application/json'
  const contentType: string | null = headers['content-type']
  console.log(contentType ?? 'missing')
}
`,
    {
      target: 'c'
    }
  )
  const main = result.hir.body.find((item) => item.type === 'FunctionDeclaration' && item.name === 'main')
  assert.ok(main)
  const contentType = main.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'contentType')
  const fallback = main.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'fallback')
  assert.ok(contentType)
  assert.ok(fallback)

  assert.equal(contentType.valueType, 'string')
  assert.equal(contentType.nullable, true)
  assert.equal(fallback.valueType, 'string')
  assert.deepEqual(result.ir.features, ['collections', 'map-get-null', 'map-index-set', 'runtime-values'])
  assert.deepEqual(result.ir.runtimeRequirements, ['collections', 'managed-values'])
  assert.equal(typedBracketGet.ir.features.includes('map-get-null'), true)

  assertDiagnostic(
    `export function main(): void {
  const headers: Map<string, string> = new Map()
  const contentType: string = headers['content-type']
  console.log(contentType)
}
`,
    'CCJS_TYPE_MISMATCH'
  )

  assertDiagnostic(
    `export function main(): void {
  const headers: Map<string, string> = new Map()
  headers[1] = 'application/json'
}
`,
    'CCJS_TYPE_MISMATCH'
  )

  assertDiagnostic(
    `export function main(): void {
  const headers: Map<string, string> = new Map()
  headers['content-type'] = 1
}
`,
    'CCJS_TYPE_MISMATCH'
  )
})


test('checks string predicate methods as boolean calls', () => {
  const result = compileSource(
    `function hasAda(name: string): boolean {
  return name.includes('Ada', 1) && name.startsWith('A') && name.endsWith('a')
}

export function main(): void {
  console.log(hasAda('Ada'))
}
`,
    {
      target: 'c'
    }
  )

  const hasAda = result.hir.body.find((item) => item.type === 'FunctionDeclaration' && item.name === 'hasAda')
  assert.equal(hasAda?.returnType, 'boolean')

  assertDiagnostic(
    `export function main(): void {
  const name = 'Ada'
  name.includes(1)
}
`,
    'CCJS_TYPE_MISMATCH'
  )

  assertDiagnostic(
    `export function main(): void {
  const name = 'Ada'
  name.includes('d', '1')
}
`,
    'CCJS_TYPE_MISMATCH'
  )

  assertDiagnostic(
    `export function main(): void {
  const name = 'Ada'
  name.includes()
}
`,
    'CCJS_ARG_COUNT'
  )

  assertDiagnostic(
    `export function main(): void {
  const name = 'Ada'
  name.startsWith()
}
`,
    'CCJS_ARG_COUNT'
  )
})


test('checks string index methods as number calls', () => {
  const result = compileSource(
    `function findAda(name: string): number {
  return name.indexOf('d', 1) + name.lastIndexOf('a')
}

export function main(): void {
  console.log(findAda('Ada'))
}
`,
    {
      target: 'c'
    }
  )

  const findAda = result.hir.body.find((item) => item.type === 'FunctionDeclaration' && item.name === 'findAda')
  assert.equal(findAda?.returnType, 'number')

  assertDiagnostic(
    `export function main(): void {
  const name = 'Ada'
  name.indexOf(1)
}
`,
    'CCJS_TYPE_MISMATCH'
  )

  assertDiagnostic(
    `export function main(): void {
  const name = 'Ada'
  name.lastIndexOf('a', '1')
}
`,
    'CCJS_TYPE_MISMATCH'
  )

  assertDiagnostic(
    `export function main(): void {
  const name = 'Ada'
  name.indexOf()
}
`,
    'CCJS_ARG_COUNT'
  )
})


test('checks string slice as a string call', () => {
  const result = compileSource(
    `function middle(name: string): string {
  return name.slice(1, 3)
}

export function main(): void {
  console.log(middle('Ada'))
}
`,
    {
      target: 'c'
    }
  )

  const middle = result.hir.body.find((item) => item.type === 'FunctionDeclaration' && item.name === 'middle')
  assert.equal(middle?.returnType, 'string')

  assertDiagnostic(
    `export function main(): void {
  const name = 'Ada'
  name.slice('1', 2)
}
`,
    'CCJS_TYPE_MISMATCH'
  )

  assertDiagnostic(
    `export function main(): void {
  const name = 'Ada'
  name.slice()
}
`,
    'CCJS_ARG_COUNT'
  )
})


test('checks string split as a string array call', () => {
  const result = compileSource(
    `export function main(): void {
  const parts = 'Ada,Grace'.split(',')
  const first: string = parts[0]
  console.log(first)
}
`,
    {
      target: 'c'
    }
  )

  assert.equal(result.hir.body[0].body[0].valueType, 'array')
  assert.equal(result.hir.body[0].body[0].arrayElementType, 'string')

  assertDiagnostic(
    `export function main(): void {
  'Ada'.split(1)
}
`,
    'CCJS_TYPE_MISMATCH'
  )

  assertDiagnostic(
    `export function main(): void {
  'Ada'.split()
}
`,
    'CCJS_ARG_COUNT'
  )
})


test('checks string trim as a string call', () => {
  const result = compileSource(
    `function clean(name: string): string {
  return name.trimStart().trimEnd().trimLeft().trimRight().trim()
}

export function main(): void {
  console.log(clean(' Ada '))
}
`,
    {
      target: 'c'
    }
  )

  const clean = result.hir.body.find((item) => item.type === 'FunctionDeclaration' && item.name === 'clean')
  assert.equal(clean?.returnType, 'string')

  assertDiagnostic(
    `export function main(): void {
  const name = 'Ada'
  name.trimStart(1)
}
`,
    'CCJS_ARG_COUNT'
  )
})


test('checks String conversion as a typed string call', () => {
  const result = compileSource(
    `function label(value: number): string {
  return String(value)
}

export function main(): void {
  console.log(label(42), String(true), String('Ada'), String(null))
}
`,
    {
      target: 'c'
    }
  )

  const label = result.hir.body.find((item) => item.type === 'FunctionDeclaration' && item.name === 'label')
  assert.equal(label?.returnType, 'string')

  assertDiagnostic(
    `export function main(): void {
  String()
}
`,
    'CCJS_ARG_COUNT'
  )

  assertDiagnostic(
    `export function main(): void {
  String({ name: 'Ada' })
}
`,
    'CCJS_TYPE_MISMATCH'
  )
})


test('checks Number conversion as a nullable typed number call', () => {
  const source = `function parsePort(text: string): number | null {
  return Number(text)
}

export function main(): void {
  const port = Number('8080') ?? 3000
  console.log(parsePort('42') ?? port)
}
`
  const c = compileSource(source, {
    target: 'c'
  })
  const parsePort = c.hir.body.find((item) => item.type === 'FunctionDeclaration' && item.name === 'parsePort')
  assert.equal(parsePort?.returnType, 'number')
  assert.equal(parsePort?.returnNullable, true)

  assertDiagnostic(
    `export function main(): void {
  Number()
}
`,
    'CCJS_ARG_COUNT'
  )

  assertDiagnostic(
    `export function main(): void {
  Number(42)
}
`,
    'CCJS_TYPE_MISMATCH'
  )

  assertDiagnostic(
    `export function main(): void {
  const text: string | null = null
  Number(text)
}
`,
    'CCJS_TYPE_MISMATCH'
  )
})


test('checks numeric casts as number calls', () => {
  const source = `function convert(value: number): number {
  return i32(value) + u32(value) + u64(value) + f32(value) + f64(value)
}

export function main(): void {
  const value = convert(3.9)
  console.log(value)
}
`
  const c = compileSource(source, {
    target: 'c'
  })

  assert.deepEqual(c.ir.features, ['numeric-casts'])
  assert.match(c.code, /long long ccjs_i32_truncated_\d+ = \(long long\)ccjs_i32_value_\d+;/)
  assert.match(c.code, /ccjs_u32_truncated_\d+ < 0LL \|\| ccjs_u32_truncated_\d+ > 4294967295LL/)
  assert.match(c.code, /ccjs_u64_truncated_\d+ < 0LL \|\| ccjs_u64_truncated_\d+ > 9007199254740991LL/)
  assert.match(c.code, /double ccjs_f32_\d+ = \(double\)\(\(float\)value\);/)

  assertDiagnostic(
    `export function main(): void {
  i32()
}
`,
    'CCJS_ARG_COUNT'
  )

  assertDiagnostic(
    `export function main(): void {
  i32('1')
}
`,
    'CCJS_TYPE_MISMATCH'
  )

  assertDiagnostic(
    `export function main(): void {
  const value: number | null = null
  f64(value)
}
`,
    'CCJS_TYPE_MISMATCH'
  )
})


test('marks timer calls and lowers setImmediate/setTimeout to C loop work', () => {
  const result = compileSource(
    `function onImmediate(): void {
  console.log('immediate')
}

function onTimeout(): void {
  console.log('timeout')
}

function onInterval(): void {
  console.log('interval')
}

function schedule(): void {
  const timeout = setTimeout(onTimeout, 1)
  clearTimeout(timeout)
  const interval = setInterval(onInterval, 1)
  clearInterval(interval)
}

function scheduleLater(): void {
  setTimeout(onTimeout, 1)
}

schedule()
const immediate = setImmediate(scheduleLater)
clearImmediate(immediate)
`,
    {
      target: 'c'
    }
  )

  assert.deepEqual(result.ir.features, ['timers'])
  assert.deepEqual(result.ir.runtimeRequirements, ['async-runtime', 'callback-values', 'managed-values', 'timers'])
  assert.match(result.code, /#include "ccjs\/loop\.h"/)
  assert.match(result.code, /#include "ccjs\/callback\.h"/)
  assert.match(result.code, /static ccjs_status ccjs_timer_callback_run\(void \*context\)/)
  assert.match(result.code, /void schedule\(ccjs_loop \*ccjs_loop\);/)
  assert.match(result.code, /int main\(void\) \{/)
  assert.match(result.code, /schedule\(&ccjs_loop\);/)
  assert.match(result.code, /ccjs_timer_handle \*timeout = 0;/)
  assert.match(result.code, /ccjs_timer_handle \*interval = 0;/)
  assert.match(result.code, /ccjs_timer_handle \*immediate = 0;/)
  assert.match(
    result.code,
    /ccjs_loop_set_timeout\(ccjs_loop, 1, ccjs_timer_callback_run, ccjs_timer_ctx_\d+, ccjs_timer_callback_finalize, &timeout\)/
  )
  assert.match(
    result.code,
    /ccjs_loop_set_interval\(ccjs_loop, 1, ccjs_timer_callback_run, ccjs_timer_ctx_\d+, ccjs_timer_callback_finalize, &interval\)/
  )
  assert.match(
    result.code,
    /ccjs_loop_queue_immediate\(&ccjs_loop, ccjs_timer_callback_run, ccjs_timer_ctx_\d+, ccjs_timer_callback_finalize, &immediate\)/
  )
  assert.match(result.code, /ccjs_loop_clear_timer\(timeout\);/)
  assert.match(result.code, /ccjs_loop_clear_timer\(interval\);/)
  assert.match(result.code, /ccjs_loop_clear_timer\(immediate\);/)
  assert.match(result.code, /scheduleLater\(\(ccjs_loop \*\)context\);/)
  assert.match(
    result.code,
    /ccjs_callback_new\(&ccjs_default_allocator, ccjs_callback_scheduleLater_\d+, &ccjs_loop, 0, &ccjs_callback_\d+\)/
  )
  assert.match(result.code, /#if !defined\(CCJS_LOOP_BACKEND_LIBUV\)[\s\S]*ccjs_time_sleep_ms[\s\S]*#endif/)
  assert.match(result.code, /while \(ccjs_loop_has_work\(&ccjs_loop\)\) \{/)
  assert.match(result.code, /ccjs_loop_poll\(&ccjs_loop, ccjs_performance_now\(\)\)/)

  assertDiagnostic(
    `export function main(): void {
  setInterval(() => {}, 1)
}
`,
    'CCJS_C_TIMER_HANDLE',
    {
      target: 'c'
    }
  )

  assertDiagnostic(
    `export function main(): void {
  clearTimeout(1)
}
`,
    'CCJS_TYPE_MISMATCH',
    {
      target: 'c'
    }
  )

  assertDiagnostic(
    `export function main(): void {
  const timeout = setTimeout(() => {}, 1)
  timeout.unref()
}
`,
    'CCJS_TIMER_REF_UNREF'
  )

  assertDiagnostic(
    `export function main(): void {
  const interval = setInterval(() => {}, 1)
  interval.ref()
}
`,
    'CCJS_TIMER_REF_UNREF'
  )

  assertDiagnostic(
    `export function main(): void {
  setTimeout(async () => {
    await Promise.resolve(1)
  }, 1)
}
`,
    'CCJS_ASYNC_TIMER_CALLBACK'
  )

  assertDiagnostic(
    `async function later(): Promise<void> {
  await Promise.resolve(1)
}

export function main(): void {
  setImmediate(later)
}
`,
    'CCJS_ASYNC_TIMER_CALLBACK'
  )
})
