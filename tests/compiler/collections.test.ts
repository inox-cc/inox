import test from 'node:test'
import type { AnyNode } from '../../compiler/types.ts'
import {
  assert,
  assertDiagnostic,
  collectIrFunctionEffects,
  CompileError,
  compileSource,
  emitCFromIr
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

  assert.match(result.code, /#include "inox\/array\.h"/)
  assert.match(result.code, /inox_value values = inox_undefined_value\(\);/)
  assert.match(result.code, /inox_array_new\(&inox_default_allocator, 3, &values\)/)
  assert.match(result.code, /inox_array_set\(values, 0, inox_number_value\(1\)\)/)
  assert.match(result.code, /inox_array_set\(values, 2, inox_number_value\(3\)\)/)
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

  assert.match(result.code, /inox_array_new\(&inox_default_allocator, 3, &inox_array_\d+\)/)
  assert.match(result.code, /inox_object_init_known\(box, 0, inox_array_\d+\)/)
  assert.match(result.code, /inox_object_get_known\(box, 0, &inox_value_\d+\)/)
  assert.match(result.code, /inox_array_len\(inox_value_\d+, &inox_array_len_\d+\)/)
})

test('lowers C runtime array length as a numeric call argument', () => {
  const result = compileSource(
    `type Box = {
  values: number[]
}

function label(count: number): string {
  return String(count)
}

export function main(): void {
  const box: Box = { values: [1, 2, 3] }
  console.log(label(box.values.length))
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /size_t inox_array_len_\d+ = 0;/)
  assert.match(result.code, /inox_array_len\(inox_value_\d+, &inox_array_len_\d+\)/)
  assert.match(result.code, /label\(inox_array_len_\d+\)/)
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
  assert.match(result.code, /!\(ada\.tag == inox_object_\d+\.tag && ada\.as\.ref == inox_object_\d+\.as\.ref\)/)
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

  assert.match(result.code, /inox_object_get_known\(box, 0, &inox_value_\d+\)/)
  assert.match(result.code, /inox_array_get\(inox_value_\d+, 1, &inox_log_value_\d+\)/)
  assert.match(result.code, /inox_object_get_known\(box, 1, &inox_value_\d+\)/)
  assert.match(result.code, /inox_array_get\(inox_value_\d+, 0, &inox_log_value_\d+\)/)
  assert.match(result.code, /inox_object_get_known\(box, 2, &inox_value_\d+\)/)
  assert.match(result.code, /inox_array_get\(inox_value_\d+, 0, &inox_value_\d+\)/)
  assert.match(
    result.code,
    /printf\("%g %g %\.\*s\\n", inox_log_value_\d+\.as\.number, \(\(double\)\(inox_log_value_\d+\.as\.boolean \? 1 : 0\)\), \(int\)name->len, name->bytes\);/
  )
})

test('lowers C known object array index declarations', () => {
  const result = compileSource(
    `type User = {
  name: string
}

const users: User[] = [{ name: 'Ada' }]
const user = users[0]
console.log(user.name)
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /inox_array_get\(users, 0, &user\)/)
  assert.match(result.code, /user\.tag != INOX_TAG_OBJECT \|\| user\.as\.ref == 0/)
  assert.match(result.code, /inox_object_get_known\(user, 0, &inox_(?:log_)?value_\d+\)/)
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

  assert.match(result.code, /inox_object_get_known\(box, 0, &values\)/)
  assert.match(result.code, /values\.tag != INOX_TAG_ARRAY/)
  assert.match(result.code, /inox_object_get_known\(box, 1, &names\)/)
  assert.match(result.code, /names\.tag != INOX_TAG_ARRAY/)
  assert.match(result.code, /inox_array_get\(values, 1, &inox_log_value_\d+\)/)
  assert.match(result.code, /inox_array_get\(names, 0, &inox_log_value_\d+\)/)
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

  assert.match(result.code, /inox_object_get_known\(box, 0, &inox_value_\d+\)/)
  assert.match(result.code, /inox_map_set\(inox_value_\d+, inox_value_\d+, inox_number_value\(7\)\)/)
  assert.match(result.code, /inox_map_get\(inox_value_\d+, inox_value_\d+, &inox_map_value_\d+\)/)
  assert.match(result.code, /inox_map_size\(inox_value_\d+, &inox_map_size_\d+\)/)
  assert.match(result.code, /inox_object_get_known\(box, 1, &inox_value_\d+\)/)
  assert.match(result.code, /inox_set_add\(inox_value_\d+, inox_value_\d+\)/)
  assert.match(result.code, /inox_set_has\(inox_value_\d+, inox_value_\d+, &inox_set_has_\d+\)/)
  assert.match(result.code, /inox_set_size\(inox_value_\d+, &inox_set_size_\d+\)/)
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

  assert.match(result.code, /inox_array_len\(values, &inox_for_length_\d+\)/)
  assert.match(result.code, /inox_array_get\(values, inox_for_index_\d+, &inox_for_value_\d+\)/)
  assert.match(result.code, /inox_array_len\(names, &inox_for_length_\d+\)/)
  assert.match(result.code, /inox_array_get\(names, inox_for_index_\d+, &inox_for_value_\d+\)/)
  assert.match(result.code, /inox_for_value_\d+\.tag != INOX_TAG_STRING/)
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

  assert.match(result.code, /inox_object_get_known\(box, 0, &inox_value_\d+\)/)
  assert.match(result.code, /inox_array_len\(inox_value_\d+, &inox_for_length_\d+\)/)
  assert.match(result.code, /inox_array_get\(inox_value_\d+, inox_for_index_\d+, &inox_for_value_\d+\)/)
  assert.match(result.code, /inox_object_get_known\(box, 1, &inox_value_\d+\)/)
  assert.match(result.code, /inox_for_value_\d+\.tag != INOX_TAG_STRING/)
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

  assert.match(result.code, /inox_array_len\(inox_value_\d+, &inox_for_length_\d+\)/)
  assert.match(result.code, /inox_array_get\(inox_value_\d+, inox_for_index_\d+, &inox_for_value_\d+\)/)
  assert.match(result.code, /inox_for_value_\d+\.tag != INOX_TAG_OBJECT/)
  assert.match(result.code, /inox_value item = inox_for_value_\d+;/)
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

  assert.match(result.code, /inox_object_get_known\(box, 0, &inox_value_\d+\)/)
  assert.match(result.code, /inox_array_push\(inox_value_\d+, inox_number_value\(4\)\)/)
  assert.match(result.code, /inox_array_pop\(inox_value_\d+, &inox_array_pop_\d+\)/)
  assert.match(result.code, /inox_array_len\(inox_value_\d+, &inox_sort_length_\d+\)/)
  assert.match(result.code, /inox_array_push\(inox_filter_array_\d+, inox_filter_value_\d+\)/)
  assert.match(result.code, /inox_object_get\(box, "names", 5, &inox_value_\d+\)/)
  assert.match(result.code, /inox_string_slice_parts\(/)
  assert.match(result.code, /inox_array_sort\(inox_map_array_\d+\)/)
})

test('lowers C Array.includes calls for primitive runtime arrays', () => {
  const result = compileSource(
    `type Box = {
  names: string[],
  flags: boolean[]
}

function hasValue(values: number[], value: number): boolean {
  return values.includes(value)
}

export function main(): void {
  const box: Box = { names: ['Ada', 'Grace'], flags: [false, true] }
  const values = [1, 2, 3]
  const hasTwo = hasValue(values, 2)
  const hasName = box.names.includes('Grace')
  const hasFlag = box['flags'].includes(true)
  console.log(hasTwo, hasName, hasFlag)
}
`,
    {
      target: 'c'
    }
  )

  const hasValue = result.hir.body.find((item) => item.type === 'FunctionDeclaration' && item.name === 'hasValue')
  const main = result.hir.body.find((item) => item.type === 'FunctionDeclaration' && item.name === 'main')
  const hasTwo = main?.body.find((item: AnyNode) => item.name === 'hasTwo')
  assert.equal(hasValue?.returnType, 'boolean')
  assert.equal(hasTwo?.valueType, 'boolean')
  assert.match(result.code, /#include "inox\/hash\.h"/)
  assert.match(result.code, /inox_array_len\(values, &inox_array_includes_length_\d+\)/)
  assert.match(result.code, /inox_array_get\(values, inox_array_includes_index_\d+, &inox_array_includes_value_\d+\)/)
  assert.match(result.code, /inox_hash_value_equal\(inox_array_includes_value_\d+, inox_number_value\(value\)\)/)
  assert.match(result.code, /inox_object_get_known\(box, 0, &inox_value_\d+\)/)
  assert.match(result.code, /inox_hash_value_equal\(inox_array_includes_value_\d+, inox_value_\d+\)/)
  assert.match(result.code, /inox_object_get\(box, "flags", 5, &inox_value_\d+\)/)
  assert.match(result.code, /inox_hash_value_equal\(inox_array_includes_value_\d+, inox_bool_value\(\(1\) != 0\)\)/)
})

test('checks Array.includes calls as boolean array methods', () => {
  const result = compileSource(
    `function hasName(names: string[], name: string): boolean {
  return names.includes(name)
}

export function main(): void {
  console.log(hasName(['Ada'], 'Ada'))
}
`,
    {
      target: 'c'
    }
  )

  const hasName = result.hir.body.find((item) => item.type === 'FunctionDeclaration' && item.name === 'hasName')
  assert.equal(hasName?.returnType, 'boolean')

  assertDiagnostic(
    `export function main(): void {
  const values = [1, 2, 3]
  values.includes('2')
}
`,
    'INOX_TYPE_MISMATCH'
  )

  assertDiagnostic(
    `export function main(): void {
  const values = [1, 2, 3]
  values.includes()
}
`,
    'INOX_ARG_COUNT'
  )
})

test('lowers C Array.unshift calls for primitive runtime arrays', () => {
  const result = compileSource(
    `export function main(): void {
  const values: number[] = [2, 3]
  const length = values.unshift(1)
  const names: string[] = ['Grace']
  names.unshift('Ada')
  console.log(length, values[0], names[0])
}
`,
    {
      target: 'c'
    }
  )

  const main = result.hir.body.find((item) => item.type === 'FunctionDeclaration' && item.name === 'main')
  const length = main?.body.find((item: AnyNode) => item.name === 'length')

  assert.equal(length?.valueType, 'number')
  assert.match(result.code, /inox_array_unshift\(values, inox_number_value\(1\), &inox_array_unshift_len_\d+\)/)
  assert.match(result.code, /const double length = \(double\)inox_array_unshift_len_\d+;/)
  assert.match(result.code, /inox_array_unshift\(names, inox_value_\d+, &inox_array_unshift_len_\d+\)/)
  assert.match(result.code, /inox_array_get\(values, 0, &inox_[a-z_]+_\d+\)/)
  assert.match(result.code, /inox_array_get\(names, 0, &inox_[a-z_]+_\d+\)/)
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

  assert.equal(result.hir.body[0].body.find((item: AnyNode) => item.name === 'copy')?.arrayElementType, 'number')
  assert.equal(result.hir.body[0].body.find((item: AnyNode) => item.name === 'middle')?.arrayElementType, 'number')
  assert.match(
    result.code,
    /inox_array_slice\(&inox_default_allocator, values, inox_array_slice_start_\d+, inox_array_slice_end_\d+, &inox_array_slice_\d+\)/
  )
  assert.match(result.code, /double inox_array_slice_start_raw_\d+ = 0;/)
  assert.match(result.code, /double inox_array_slice_start_raw_\d+ = \(-2\);/)
  assert.match(result.code, /double inox_array_slice_start_raw_\d+ = \(-99\);/)
  assert.match(
    result.code,
    /if \(inox_array_slice_end_\d+ < inox_array_slice_start_\d+\) inox_array_slice_end_\d+ = inox_array_slice_start_\d+;/
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

  assert.equal(result.hir.body[0].body.find((item: AnyNode) => item.name === 'joined')?.valueType, 'string')
  assert.match(result.code, /inox_array_join\(&inox_default_allocator, parts, "\/", 1, &inox_array_join_\d+\)/)
  assert.match(result.code, /inox_array_join\(&inox_default_allocator, inox_array_\d+, ",", 1, &inox_array_join_\d+\)/)
  assert.match(result.code, /inox_array_join\(&inox_default_allocator, inox_array_\d+, "\|", 1, &inox_array_join_\d+\)/)
  assert.match(result.code, /inox_retain\(inox_array_join_\d+\);\n {2}joined_value_\d+ = inox_array_join_\d+;/)
  assert.match(result.code, /inox_retain\(inox_array_join_\d+\);\n {2}digits_value_\d+ = inox_array_join_\d+;/)
  assert.match(result.code, /inox_retain\(inox_array_join_\d+\);\n {2}flags_value_\d+ = inox_array_join_\d+;/)
  assert.match(result.code, /const inox_string\* joined = \(inox_string\*\)joined_value_\d+\.as\.ref;/)
  assert.match(result.code, /const inox_string\* digits = \(inox_string\*\)digits_value_\d+\.as\.ref;/)
  assert.match(result.code, /const inox_string\* flags = \(inox_string\*\)flags_value_\d+\.as\.ref;/)
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
  assert.match(result.code, /inox_string_code_unit_length_parts\(name->bytes, name->len\)/)
  assert.match(result.code, /inox_return = \(\(double\)inox_string_length_\d+\);/)
  assert.match(result.code, /inox_string \*inox_length_string_\d+ = \(inox_string \*\)inox_value_\d+\.as\.ref;/)
  assert.match(result.code, /inox_string_code_unit_length_parts\("Ada", 3\)/)
  assert.match(
    result.code,
    /inox_string_code_unit_length_parts\(inox_length_string_\d+->bytes, inox_length_string_\d+->len\)/
  )
  assert.match(result.code, /inox_string_code_unit_length_parts\(message->bytes, message->len\)/)
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

  assert.match(result.code, /#include "inox\/string\.h"/)
  assert.match(
    result.code,
    /inox_string_includes_from_parts\(name->bytes, name->len, "d", 1, inox_string_includes_position_\d+\)/
  )
  assert.match(result.code, /inox_string_starts_with_parts\(name->bytes, name->len, "A", 1\)/)
  assert.match(result.code, /inox_string_ends_with_parts\(name->bytes, name->len, "a", 1\)/)
  assert.match(result.code, /inox_string_includes_parts\("Ada", 3, "d", 1\)/)
  assert.match(result.code, /inox_string_ends_with_parts\(message->bytes, message->len, "!", 1\)/)
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

  assert.match(result.code, /inox_string_index_of_parts\(name->bytes, name->len, "a", 1, inox_string_index_start_\d+\)/)
  assert.match(
    result.code,
    /inox_string_last_index_of_parts\(name->bytes, name->len, "a", 1, inox_string_index_start_\d+\)/
  )
  assert.match(
    result.code,
    /inox_string_last_index_of_parts\(name->bytes, name->len, "a", 1, inox_string_code_unit_length_parts\(name->bytes, name->len\)\)/
  )
  assert.match(
    result.code,
    /inox_string_trim_start_parts\(&inox_default_allocator, name->bytes, name->len, &inox_value_\d+\)/
  )
  assert.match(
    result.code,
    /inox_string_trim_end_parts\(&inox_default_allocator, name->bytes, name->len, &inox_value_\d+\)/
  )
})

test('lowers C string case and padStart methods', () => {
  const result = compileSource(
    `function symbolName(prefix: string, seed: number): string {
  return prefix.toUpperCase() + '_' + seed.toString(16).padStart(8, '0')
}

export function main(): void {
  console.log(symbolName('inox', 255), 'x'.padStart(3), 'B'.padStart(2, 'é'))
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /inox_string_to_upper_case_parts\(&inox_default_allocator, prefix->bytes, prefix->len, &inox_value_\d+\)/
  )
  assert.match(
    result.code,
    /inox_string_pad_start_parts\(&inox_default_allocator, inox_pad_string_\d+->bytes, inox_pad_string_\d+->len, inox_pad_target_length_\d+, "0", 1, &inox_value_\d+\)/
  )
  assert.match(
    result.code,
    /inox_string_pad_start_parts\(&inox_default_allocator, "x", 1, inox_pad_target_length_\d+, " ", 1, &inox_value_\d+\)/
  )
  assert.match(
    result.code,
    /inox_string_pad_start_parts\(&inox_default_allocator, "B", 1, inox_pad_target_length_\d+, "é", 2, &inox_value_\d+\)/
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

  assert.match(result.code, /inox_object_get\(node, "raw", 3, &inox_value_\d+\)/)
  assert.match(
    result.code,
    /inox_string_includes_parts\(inox_string_method_value_\d+->bytes, inox_string_method_value_\d+->len, "\$\{", 2\)/
  )
  assert.match(
    result.code,
    /inox_string_starts_with_parts\(inox_string_method_value_\d+->bytes, inox_string_method_value_\d+->len, "expr", 4\)/
  )
  assert.match(
    result.code,
    /inox_string_ends_with_parts\(inox_string_method_value_\d+->bytes, inox_string_method_value_\d+->len, "}", 1\)/
  )
  assert.match(
    result.code,
    /inox_string_slice_parts\(&inox_default_allocator, inox_slice_string_\d+->bytes, inox_slice_string_\d+->len, inox_slice_start_\d+, inox_slice_end_\d+, &inox_value_\d+\)/
  )
  assert.match(
    result.code,
    /inox_string_trim_parts\(&inox_default_allocator, inox_trim_string_\d+->bytes, inox_trim_string_\d+->len, &inox_value_\d+\)/
  )
  assert.match(
    result.code,
    /inox_string_split_parts\(&inox_default_allocator, inox_split_string_\d+->bytes, inox_split_string_\d+->len, ",", 1, &inox_split_array_\d+\)/
  )
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

  assert.match(result.code, /inox_object_get_known\(user, 0, &inox_expr_value_\d+\)/)
  assert.match(result.code, /inox_object_get\(user, "name", 4, &inox_expr_value_\d+\)/)
  assert.match(result.code, /memcmp\(inox_cmp_string_\d+->bytes, target, inox_cmp_string_\d+->len\) == 0/)
  assert.match(
    result.code,
    /!\(inox_cmp_string_\d+->len == 5 && memcmp\(inox_cmp_string_\d+->bytes, "Grace", inox_cmp_string_\d+->len\) == 0\)/
  )
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

  assert.match(result.code, /inox_object_get_known\(inox_value_\d+, 0, &inox_value_\d+\)/)
  assert.match(
    result.code,
    /inox_cmp_string_\d+->len == 3 && memcmp\(inox_cmp_string_\d+->bytes, "Ada", inox_cmp_string_\d+->len\) == 0/
  )
  assert.match(
    result.code,
    /!\(inox_cmp_string_\d+->len == 5 && memcmp\(inox_cmp_string_\d+->bytes, "Grace", inox_cmp_string_\d+->len\) == 0\)/
  )
})

test('lowers C dynamic object string literal comparisons without string guards', () => {
  const result = compileSource(
    `function isNotReference(node: object): boolean {
  return node.type !== 'Reference'
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /inox_object_get\(node, "type", 4, &inox_value_\d+\)/)
  assert.match(result.code, /!\(inox_string_cmp_value_\d+\.tag == INOX_TAG_STRING/)
  assert.doesNotMatch(result.code, /inox_value_\d+\.tag != INOX_TAG_STRING \|\| inox_value_\d+\.as\.ref == 0/)
})

test('lowers C opaque object index nullish coalescing', () => {
  const result = compileSource(
    `type Descriptor = {
  code: number
}

const descriptors: Record<string, Descriptor> = {
  read: { code: 7 }
}

const item = descriptors['read'] ?? null
if (item !== null) {
  console.log(item.code)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /inox_object_get\(descriptors, "read", 4, &inox_value_\d+\)/)
  assert.match(result.code, /inox_value_\d+\.tag == INOX_TAG_NULL \|\| inox_value_\d+\.tag == INOX_TAG_UNDEFINED/)
  assert.match(result.code, /item = inox_value_\d+/)
})

test('lowers C Record object reads through variable string keys', () => {
  const result = compileSource(
    `type Descriptor = {
  code: number
}

const descriptors: Record<string, Descriptor> = {
  read: { code: 7 },
  write: { code: 9 }
}

function readCode(method: string): number {
  const item = descriptors[method] ?? null
  if (item !== null) {
    return item.code
  }
  return 0
}

console.log(readCode('write'))
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /inox_object_get\(descriptors, method->bytes, method->len, &inox_value_\d+\)/)
  assert.match(result.code, /inox_object_get_known\(item, 0, &inox_expr_value_\d+\)/)
})

test('lowers C nullable boolean literal comparisons', () => {
  const result = compileSource(
    `function maybe(value: number): boolean | null {
  if (value === 1) {
    return true
  }
  if (value === 2) {
    return false
  }
  return null
}

console.log(maybe(1) === true, maybe(2) === true, maybe(3) !== false)
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /inox_nullable_value_\d+\.tag == INOX_TAG_BOOL/)
  assert.match(result.code, /\(inox_nullable_value_\d+\.as\.boolean \? 1 : 0\) == 1/)
  assert.match(result.code, /!\(inox_nullable_value_\d+\.tag == INOX_TAG_BOOL/)
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

  assert.match(result.code, /size_t inox_string_char_code_index_\d+ = \(size_t\)\(0\);/)
  assert.match(result.code, /\(double\)\(\(unsigned char\)ch->bytes\[inox_string_char_code_index_\d+\]\)/)
  assert.match(result.code, /const double code = \(\(inox_string_char_code_index_\d+ < ch->len\)/)
  assert.match(result.code, /size_t inox_string_char_code_index_\d+ = \(size_t\)\(index\);/)
  assert.match(result.code, /\(double\)\(\(unsigned char\)value->bytes\[inox_string_char_code_index_\d+\]\)/)
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
    /inox_string_from_literal\(\n\s+&inox_default_allocator,\n\s+\(inox_string_index_\d+ < source->len\) \? source->bytes \+ inox_string_index_\d+ : "",\n\s+\(inox_string_index_\d+ < source->len\) \? 1 : 0,\n\s+&inox_value_\d+\n\s+\)/
  )
  assert.match(
    result.code,
    /inox_string_from_literal\(\n\s+&inox_default_allocator,\n\s+\(inox_string_index_\d+ < strlen\(name\)\) \? name \+ inox_string_index_\d+ : "",\n\s+\(inox_string_index_\d+ < strlen\(name\)\) \? 1 : 0,\n\s+&inox_value_\d+\n\s+\)/
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
    /size_t inox_slice_length_\d+ = inox_string_code_unit_length_parts\(name->bytes, name->len\);/
  )
  assert.match(result.code, /double inox_slice_start_raw_\d+ = 1;/)
  assert.match(result.code, /double inox_slice_start_raw_\d+ = \(-2\);/)
  assert.match(
    result.code,
    /if \(inox_slice_end_\d+ < inox_slice_start_\d+\) inox_slice_end_\d+ = inox_slice_start_\d+;/
  )
  assert.match(
    result.code,
    /inox_string_slice_parts\(&inox_default_allocator, name->bytes, name->len, inox_slice_start_\d+, inox_slice_end_\d+, &inox_value_\d+\)/
  )
  assert.match(
    result.code,
    /inox_string_slice_parts\(&inox_default_allocator, "Ada", 3, inox_slice_start_\d+, inox_slice_end_\d+, &inox_value_\d+\)/
  )
  assert.match(
    result.code,
    /inox_string_slice_parts\(&inox_default_allocator, inox_slice_string_\d+->bytes, inox_slice_string_\d+->len, inox_slice_start_\d+, inox_slice_end_\d+, &inox_value_\d+\)/
  )
  assert.match(
    result.code,
    /inox_string_slice_parts\(&inox_default_allocator, message->bytes, message->len, inox_slice_start_\d+, inox_slice_end_\d+, &inox_value_\d+\)/
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
    /inox_string_split_parts\(&inox_default_allocator, inox_split_string_\d+->bytes, inox_split_string_\d+->len, ",", 1, &inox_split_array_\d+\)/
  )
  assert.match(
    result.code,
    /inox_string_slice_parts\(&inox_default_allocator, name->bytes, name->len, inox_slice_start_\d+, inox_slice_end_\d+, &inox_value_\d+\)/
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
    /inox_string_trim_parts\(&inox_default_allocator, name->bytes, name->len, &inox_value_\d+\)/
  )
  assert.match(result.code, /inox_string_trim_parts\(&inox_default_allocator, " Ada ", 5, &inox_value_\d+\)/)
  assert.match(
    result.code,
    /inox_string_trim_parts\(&inox_default_allocator, inox_trim_string_\d+->bytes, inox_trim_string_\d+->len, &inox_value_\d+\)/
  )
  assert.match(
    result.code,
    /inox_string_trim_parts\(&inox_default_allocator, message->bytes, message->len, &inox_value_\d+\)/
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

  assert.match(result.code, /inox_string_from_literal\(&inox_default_allocator, "Ada", 3, &inox_value_\d+\)/)
  assert.match(
    result.code,
    /inox_string_from_literal\(&inox_default_allocator, local, strlen\(local\), &inox_value_\d+\)/
  )
  assert.match(
    result.code,
    /inox_string_from_literal\(&inox_default_allocator, name->bytes, name->len, &inox_value_\d+\)/
  )
  assert.match(result.code, /inox_string_from_number\(&inox_default_allocator, value, &inox_value_\d+\)/)
  assert.match(result.code, /inox_string_from_bool\(&inox_default_allocator, \(value\) != 0, &inox_value_\d+\)/)
  assert.match(result.code, /inox_string_from_bool\(&inox_default_allocator, \(0\) != 0, &inox_value_\d+\)/)
  assert.match(result.code, /inox_string_from_literal\(&inox_default_allocator, "null", 4, &inox_value_\d+\)/)
})

test('lowers C number toString calls with radix', () => {
  const result = compileSource(
    `function hex(value: number): string {
  return value.toString(16)
}

export function main(): void {
  const value = 255
  const text = value.toString()
  const padded = (value + 4294967296).toString(16).slice(1, 9)
  console.log(hex(value), text, padded)
}
`,
    {
      target: 'c'
    }
  )

  const hex = result.hir.body.find((item) => item.type === 'FunctionDeclaration' && item.name === 'hex')
  const main = result.hir.body.find((item) => item.type === 'FunctionDeclaration' && item.name === 'main')
  const text = main?.body.find((item: AnyNode) => item.name === 'text')
  const padded = main?.body.find((item: AnyNode) => item.name === 'padded')

  assert.equal(hex?.returnType, 'string')
  assert.equal(text?.valueType, 'string')
  assert.equal(padded?.valueType, 'string')
  assert.match(
    result.code,
    /inox_string_from_number_radix\(&inox_default_allocator, value, \(int\)\(16\), &inox_value_\d+\)/
  )
  assert.match(result.code, /inox_string_from_number\(&inox_default_allocator, value, &inox_value_\d+\)/)
  assert.match(result.code, /inox_string_slice_parts\(/)
})

test('lowers C plain string locals as string parameter values', () => {
  const result = compileSource(
    `function echo(value: string): string {
  return value
}

const local = 'Ada'
console.log(echo(local))
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /inox_string_from_literal\(&inox_default_allocator, local, strlen\(local\), &inox_value_\d+\)/
  )
  assert.match(result.code, /inox_value echo\(inox_value inox_param_value\);/)
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
  assert.match(result.code, /inox_string_to_number\("8080", 4, &inox_value_\d+\)/)
  assert.match(result.code, /inox_string_to_number\("nope", 4, &inox_value_\d+\)/)
  assert.match(result.code, /if \(inox_value_\d+\.tag == INOX_TAG_NULL\) \{/)
  assert.match(result.code, /inox_value_\d+\.tag != INOX_TAG_NUMBER/)

  assertDiagnostic(
    `export function main(): void {
  const port = Number('8080')
  console.log(port)
}
`,
    'INOX_C_NULLISH',
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

  assert.match(result.code, /inox_array_get\(values, 0, &inox_item_\d+\)/)
  assert.match(result.code, /const double score = inox_item_\d+\.as\.number;/)
  assert.match(result.code, /inox_array_get\(values, 1, &inox_item_\d+\)/)
  assert.match(result.code, /const double active = inox_item_\d+\.as\.boolean \? 1 : 0;/)
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

  assert.match(result.code, /inox_array_set\(values, 0, inox_number_value\(42\)\)/)
  assert.match(result.code, /inox_array_set\(values, 1, inox_bool_value\(true\)\)/)
  assert.match(result.code, /const double score = inox_item_\d+\.as\.number;/)
  assert.match(result.code, /const double active = inox_item_\d+\.as\.boolean \? 1 : 0;/)
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

  assert.match(result.code, /inox_array_set\(values, 0, inox_value_\d+\)/)
  assert.match(result.code, /inox_array_get\(values, 0, &inox_item_\d+\)/)
  assert.match(
    result.code,
    /if \(inox_item_\d+\.tag != INOX_TAG_STRING \|\| inox_item_\d+\.as\.ref == 0\)\s+goto inox_cleanup;/
  )
  assert.match(result.code, /const inox_string \*name = \(inox_string \*\)inox_item_\d+\.as\.ref;/)
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
    /inox_value inox_value_\d+;\n {2}inox_value_\d+\.tag = INOX_TAG_STRING;\n {2}inox_value_\d+\.as\.ref = \(inox_ref \*\)&name->header;/
  )
  assert.match(result.code, /inox_object_set_known\(target, 0, inox_value_\d+\)/)
  assert.match(result.code, /inox_array_set\(values, 0, inox_value_\d+\)/)
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

  assert.match(result.code, /inox_object_get_known\(wrapper, 0, &inox_value_\d+\)/)
  assert.match(result.code, /inox_object_get_known\(inox_value_\d+, 0, &inox_value_\d+\)/)
  assert.match(result.code, /returnType_value_\d+ = inox_value_\d+;/)
  assert.match(result.code, /const inox_string\* returnType = \(inox_string\*\)returnType_value_\d+\.as\.ref;/)
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

  assert.match(result.code, /inox_value_\d+ = getName\(\);/)
  assert.match(result.code, /inox_object_set_known\(target, 0, inox_value_\d+\)/)
  assert.match(result.code, /inox_array_set\(values, 0, inox_value_\d+\)/)
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

  assert.match(c.code, /for \(size_t inox_for_index_\d+ = 0; inox_for_index_\d+ < 3; inox_for_index_\d+ \+= 1\) \{/)
  assert.match(c.code, /inox_array_get\(values, inox_for_index_\d+, &inox_for_value_\d+\)/)
  assert.match(c.code, /double value = inox_for_value_\d+\.as\.number;/)
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

  assert.match(c.code, /inox_array_get\(names, inox_for_index_\d+, &inox_for_value_\d+\)/)
  assert.match(
    c.code,
    /if \(inox_for_value_\d+\.tag != INOX_TAG_STRING \|\| inox_for_value_\d+\.as\.ref == 0\)\s+goto inox_cleanup;/
  )
  assert.match(c.code, /inox_string \*name = \(inox_string \*\)inox_for_value_\d+\.as\.ref;/)
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

  assert.match(c.code, /inox_set_add\(values, inox_number_value\(4\)\)/)
  assert.match(c.code, /inox_set \*inox_for_set_\d+ = \(inox_set \*\)values\.as\.ref;/)
  assert.match(c.code, /INOX_SET_SLOT_OCCUPIED/)
  assert.match(c.code, /inox_for_value_\d+ = inox_for_set_\d+->entries\[inox_for_set_index_\d+\]\.value;/)
  assert.match(c.code, /inox_object_get\(bag, "names", 5, &inox_value_\d+\)/)
  assert.match(c.code, /inox_string \*name = \(inox_string \*\)inox_for_value_\d+\.as\.ref;/)
  assert.match(c.code, /inox_for_value_\d+\.tag != INOX_TAG_OBJECT/)
  assert.match(c.code, /inox_value user = inox_for_value_\d+;/)
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

  assert.match(c.code, /inox_map \*inox_for_map_\d+ = \(inox_map \*\)inox_value_\d+\.as\.ref;/)
  assert.match(c.code, /INOX_MAP_SLOT_OCCUPIED/)
  assert.match(c.code, /inox_object_new\(&inox_default_allocator, &inox_shape_map_entry_\d+, &entry\)/)
  assert.match(c.code, /inox_object_init_known\(entry, 0, inox_for_map_\d+->entries\[inox_for_map_index_\d+\]\.key\)/)
  assert.match(c.code, /inox_object_init_known\(entry, 1, inox_for_map_\d+->entries\[inox_for_map_index_\d+\]\.value\)/)
  assert.match(c.code, /inox_object_get_known\(entry, 1, &inox_(?:expr_)?value_\d+\)/)
  assert.match(c.code, /inox_object_get_known\(entry, 0, &inox_(?:expr_)?value_\d+\)/)

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

  assert.match(
    objectKeys.code,
    /inox_object_init_known\(entry, 0, inox_for_map_\d+->entries\[inox_for_map_index_\d+\]\.key\)/
  )
  assert.match(objectKeys.code, /inox_object_get_known\(entry, 0, &inox_(?:expr_)?value_\d+\)/)
  assert.match(objectKeys.code, /inox_map_has\(scores, inox_(?:expr_)?value_\d+, &inox_map_has_\d+\)/)
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

  assert.match(numbers.code, /inox_map \*inox_for_map_\d+ = \(inox_map \*\)scores\.as\.ref;/)
  assert.match(numbers.code, /INOX_MAP_SLOT_OCCUPIED/)
  assert.match(numbers.code, /inox_for_value_\d+ = inox_for_map_\d+->entries\[inox_for_map_index_\d+\]\.value;/)
  assert.match(numbers.code, /double value = inox_for_value_\d+\.as\.number;/)

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

  assert.match(objects.code, /inox_for_value_\d+ = inox_for_map_\d+->entries\[inox_for_map_index_\d+\]\.value;/)
  assert.match(objects.code, /inox_for_value_\d+\.tag != INOX_TAG_OBJECT/)
  assert.match(objects.code, /inox_value user = inox_for_value_\d+;/)

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

  assert.match(unionObjects.code, /inox_for_value_\d+ = inox_for_map_\d+->entries\[inox_for_map_index_\d+\]\.value;/)
  assert.match(unionObjects.code, /inox_for_value_\d+\.tag != INOX_TAG_OBJECT/)
  assert.match(unionObjects.code, /inox_value item = inox_for_value_\d+;/)
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

  assert.match(strings.code, /inox_map \*inox_for_map_\d+ = \(inox_map \*\)copy\.as\.ref;/)
  assert.match(strings.code, /INOX_MAP_SLOT_OCCUPIED/)
  assert.match(strings.code, /inox_for_value_\d+ = inox_for_map_\d+->entries\[inox_for_map_index_\d+\]\.key;/)
  assert.match(strings.code, /inox_string \*key = \(inox_string \*\)inox_for_value_\d+\.as\.ref;/)

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

  assert.match(objects.code, /inox_for_value_\d+ = inox_for_map_\d+->entries\[inox_for_map_index_\d+\]\.key;/)
  assert.match(objects.code, /inox_for_value_\d+\.tag != INOX_TAG_OBJECT/)
  assert.match(objects.code, /inox_value user = inox_for_value_\d+;/)
  assert.match(objects.code, /inox_map_has\(scores, user, &inox_map_has_\d+\)/)
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

  assert.match(c.code, /inox_array_new\(&inox_default_allocator, 3, &inox_for_array_\d+\)/)
  assert.match(c.code, /for \(size_t inox_for_index_\d+ = 0; inox_for_index_\d+ < 3; inox_for_index_\d+ \+= 1\) \{/)
  assert.match(c.code, /double value = inox_for_value_\d+\.as\.number;/)
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

  assert.match(c.code, /inox_array_new\(&inox_default_allocator, 2, &inox_for_array_\d+\)/)
  assert.match(c.code, /inox_string \*name = \(inox_string \*\)inox_for_value_\d+\.as\.ref;/)
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
  assert.match(result.code, /void inox_main\(void\) \{/)

  const withoutIrBodyFunctions = emitCFromIr({
    ...result.ir,
    body: []
  })

  assert.doesNotMatch(withoutIrBodyFunctions, /void greet\(void\) \{/)
  assert.doesNotMatch(withoutIrBodyFunctions, /void inox_main\(void\) \{/)
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
  assert.doesNotMatch(stringOnly.code, /#include "inox\/array\.h"/)
  assert.doesNotMatch(stringOnly.code, /#include "inox\/map\.h"/)
  assert.doesNotMatch(stringOnly.code, /#include "inox\/object\.h"/)
  assert.doesNotMatch(stringOnly.code, /#include "inox\/set\.h"/)
  assert.deepEqual(arrayResult.ir.runtimeRequirements, ['collections', 'managed-values', 'string-bytes'])
  assert.match(arrayCode, /#include "inox\/array\.h"/)
  assert.match(arrayCode, /#include "inox\/map\.h"/)
  assert.match(arrayCode, /#include "inox\/set\.h"/)
  assert.doesNotMatch(withoutCollections, /#include "inox\/array\.h"/)
  assert.doesNotMatch(withoutCollections, /#include "inox\/map\.h"/)
  assert.doesNotMatch(withoutCollections, /#include "inox\/set\.h"/)
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

  assert.equal(result.hir.body[0].body.find((item: AnyNode) => item.name === 'bytes')?.valueType, 'bytes')
  assert.equal(result.hir.body[0].body.find((item: AnyNode) => item.name === 'out')?.valueType, 'bytes')
  assert.deepEqual(result.ir.runtimeRequirements, ['binary', 'managed-values', 'string-bytes'])
  assert.match(result.code, /#include "inox\/binary\.h"/)
  assert.match(
    result.code,
    /inox_bytes_from_data\(&inox_default_allocator, \(const uint8_t \*\)"hi", 2, &inox_bytes_\d+\)/
  )
  assert.match(result.code, /inox_bytes_new\(&inox_default_allocator, \(size_t\)\(4\), &inox_bytes_\d+\)/)
  assert.match(result.code, /inox_bytes_get\(bytes, \(size_t\)\(0\), &inox_byte_\d+\)/)
  assert.match(result.code, /inox_bytes_set\(out, \(size_t\)\(1\), \(uint8_t\)\(7\)\)/)
  assert.match(result.code, /double inox_bytes_start_raw_\d+ = 0;/)
  assert.match(result.code, /double inox_bytes_end_raw_\d+ = 2;/)
  assert.match(result.code, /inox_bytes_slice\(out, inox_bytes_start_\d+, inox_bytes_end_\d+, &inox_bytes_slice_\d+\)/)
  assert.match(result.code, /inox_bytes_to_string\(&inox_default_allocator, bytes, &inox_bytes_string_\d+\)/)

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
  assert.doesNotMatch(arrayLiteral.code, /#include "inox\/array\.h"/)
  assert.match(arrayLiteral.code, /inox_bytes_new\(&inox_default_allocator, 3, &inox_bytes_\d+\)/)
  assert.match(arrayLiteral.code, /inox_bytes_set\(inox_bytes_\d+, 2, \(uint8_t\)\(3\)\)/)

  assertDiagnostic(
    `export function main(): void {
  const bytes = Buffer.from('hi', 'hex')
  console.log(bytes.length)
}
`,
    'INOX_TYPE_MISMATCH'
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
        error.diagnostics.every((item) => item.code === 'INOX_CAPABILITY'),
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

  assert.doesNotMatch(enabled.code, /inox_filter_array_\d+/)
  assert.doesNotMatch(enabled.code, /inox_map_array_\d+/)
  assert.match(enabled.code, /inox_array_push\(__inox_array_expr_\d+, inox_number_value/)
  assert.match(enabled.code, /inox_array_push\(result, inox_number_value/)
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
  const size = main?.body.find((item: AnyNode) => item.type === 'VariableDeclaration' && item.name === 'size')

  assert.equal(size?.valueType, 'number')
  assert.match(result.code, /inox_string_code_unit_length_parts\(name, strlen\(name\)\)/)

  assertDiagnostic(
    `export function main(): void {
  const name = 'Ada'
  name.length = 4
}
`,
    'INOX_ASSIGN_READONLY_FIELD'
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

  assert.match(result.code, /inox_array_len\(values, &inox_array_len_\d+\)/)

  assertDiagnostic(
    `export function main(): void {
  const values = [1, 2, 3]
  values.length = 4
}
`,
    'INOX_ASSIGN_READONLY_FIELD'
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
  const [values, names] = main.body.filter((item: AnyNode) => item.type === 'VariableDeclaration')

  assert.equal(firstNumber.params[0].valueType, 'array')
  assert.equal(firstNumber.params[0].arrayElementType, 'number')
  assert.equal(firstName.params[0].valueType, 'array')
  assert.equal(firstName.params[0].arrayElementType, 'string')
  assert.equal(values.valueType, 'array')
  assert.equal(values.arrayElementType, 'number')
  assert.equal(names.valueType, 'array')
  assert.equal(names.arrayElementType, 'string')
  assert.match(result.code, /inox_array_get\(values, 0, &inox_value_\d+\)/)

  assertDiagnostic(
    `function first(values: number[]): string {
  return values[0]
}
`,
    'INOX_TYPE_MISMATCH'
  )

  assertDiagnostic(
    `export function main(): void {
  const values: number[] = ['Ada']
  console.log(values.length)
}
`,
    'INOX_TYPE_MISMATCH'
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
  const resultDeclaration = main.body.find(
    (item: AnyNode) => item.type === 'VariableDeclaration' && item.name === 'result'
  )
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
  assert.match(result.code, /inox_sort_compare_\d+ = \(left - right\);/)
  assert.match(result.code, /inox_array_push\(inox_filter_array_\d+, inox_filter_value_\d+\)/)

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
  const names = mappedMain.body.find((item: AnyNode) => item.type === 'VariableDeclaration' && item.name === 'names')
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

  assert.match(c.code, /inox_sort_compare_\d+ = \(left - right\);/)
  assert.match(c.code, /if \(value > index\) \{/)
  assert.match(c.code, /inox_array_push\(inox_map_array_\d+, inox_number_value\(\(value \+ 1\)\)\)/)

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

  assert.match(branchedC.code, /inox_array_callback_done_\d+:;/)
  assert.match(branchedC.code, /if \(1\) \{[\s\S]*inox_array_push\(inox_filter_array_\d+, inox_filter_value_\d+\)/)
  assert.match(branchedC.code, /inox_array_push\(inox_map_array_\d+, inox_number_value\(\(value \* 10\)\)\)/)
  assert.match(branchedC.code, /inox_array_push\(inox_map_array_\d+, inox_number_value\(\(value \+ 10\)\)\)/)

  assertDiagnostic(
    `export function main(): void {
  const values: number[] = [1]
  values.filter(value => value + 1)
}
`,
    'INOX_TYPE_MISMATCH'
  )

  assertDiagnostic(
    `export function main(): void {
  const values: number[] = [1]
  values.sort((left: string, right: string) => 0)
}
`,
    'INOX_TYPE_MISMATCH'
  )
})

test('lowers C Array.find declarations to nullable loop results', () => {
  const result = compileSource(
    `export function main(): void {
  const values = [1, 2, 3]
  const found = values.find((value, index) => value > index + 1)

  if (found !== null) {
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

  const found = main.body.find((item: AnyNode) => item.type === 'VariableDeclaration' && item.name === 'found')
  const loop = main.body.find(
    (item: AnyNode) => item.type === 'ForStatement' && /^__inox_find_index_\d+$/.test(item.init.name)
  )

  assert.ok(found)
  assert.ok(loop)
  assert.equal(found.kind, 'let')
  assert.equal(found.valueType, 'number')
  assert.equal(found.nullable, true)
  assert.equal(found.init.type, 'NullLiteral')
  assert.match(result.code, /found = inox_null_value\(\);/)
  assert.match(result.code, /for \(;;\) \{/)
  assert.match(result.code, /if \(value > \(__inox_find_index_\d+ \+ 1\)\) \{/)
  assert.match(result.code, /found = inox_nullable_value_\d+;/)
  assert.match(result.code, /goto inox_break_\d+;/)
  assert.doesNotMatch(result.code, /INOX_C_ARRAY_METHOD/)

  assertDiagnostic(
    `export function main(): void {
  const values = [1]
  values.find(value => value + 1)
}
`,
    'INOX_TYPE_MISMATCH'
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
    (item: AnyNode) => item.type === 'VariableDeclaration' && /^__inox_find_expr_\d+$/.test(item.name)
  )
  const score = main.body.find((item: AnyNode) => item.type === 'VariableDeclaration' && item.name === 'score')

  assert.equal(findTemps.length, 2)
  assert.equal(
    findTemps.every((item: AnyNode) => item.kind === 'let'),
    true
  )
  assert.equal(
    findTemps.every((item: AnyNode) => item.nullable === true),
    true
  )
  assert.equal(
    findTemps.every((item: AnyNode) => item.valueType === 'number'),
    true
  )
  assert.equal(
    findTemps.every((item: AnyNode) => item.init.type === 'NullLiteral'),
    true
  )
  assert.ok(score)
  assert.equal(score.init.type, 'BinaryExpression')
  assert.equal(score.init.operator, '??')
  assert.match(score.init.left.path[0], /^__inox_find_expr_\d+$/)
  assert.match(result.code, /__inox_find_expr_\d+ = inox_null_value\(\);/)
  assert.match(result.code, /if \(__inox_find_expr_\d+\.tag == INOX_TAG_NULL\) \{/)
  assert.doesNotMatch(result.code, /INOX_C_ARRAY_METHOD/)
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

  const presentNames = main.body.find(
    (item: AnyNode) => item.type === 'VariableDeclaration' && item.name === 'presentNames'
  )
  const presentNumbers = main.body.find(
    (item: AnyNode) => item.type === 'VariableDeclaration' && item.name === 'presentNumbers'
  )
  const presentFlags = main.body.find(
    (item: AnyNode) => item.type === 'VariableDeclaration' && item.name === 'presentFlags'
  )

  assert.ok(presentNames)
  assert.ok(presentNumbers)
  assert.ok(presentFlags)
  assert.equal(presentNames.valueType, 'array')
  assert.equal(presentNames.arrayElementType, 'string')
  assert.equal(presentNumbers.arrayElementType, 'number')
  assert.equal(presentFlags.arrayElementType, 'boolean')
  assert.equal(presentNames.loweredArrayMethod, true)
  assert.doesNotMatch(result.code, /inox_filter_array_\d+/)
  assert.match(result.code, /for \(;;\) \{/)
  assert.match(result.code, /inox_array_get\(names, \(size_t\)\(__inox_filter_index_\d+\), &inox_value_\d+\)/)
  assert.match(
    result.code,
    /inox_string_code_unit_length_parts\(__inox_filter_item_\d+->bytes, __inox_filter_item_\d+->len\)/
  )
  assert.match(
    result.code,
    /if \(__inox_filter_item_\d+ == __inox_filter_item_\d+\) \{\s*inox_logical_\d+ = \(__inox_filter_item_\d+ != 0\);/s
  )
  assert.match(result.code, /if \(__inox_filter_item_\d+\) \{/)
  assert.match(result.code, /inox_array_push\(presentNames, inox_value_\d+\)/)
  assert.match(result.code, /inox_array_push\(presentNumbers, inox_number_value\(__inox_filter_item_\d+\)\)/)
  assert.match(
    result.code,
    /inox_array_push\(presentFlags, inox_bool_value\(\(?__inox_filter_item_\d+\)?(?: != 0)?\)\)/
  )
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
  assert.match(selected.body[2].argument.path[0], /^__inox_array_expr_\d+$/)

  const scaled = main.body.find((item: AnyNode) => item.type === 'VariableDeclaration' && item.name === 'scaled')
  const inlineCount = main.body.find(
    (item: AnyNode) => item.type === 'VariableDeclaration' && item.name === 'inlineCount'
  )
  const chainTemp = main.body.find(
    (item: AnyNode) => item.type === 'VariableDeclaration' && /^__inox_array_expr_\d+$/.test(item.name)
  )
  const inlineSource = main.body.find(
    (item: AnyNode) => item.type === 'VariableDeclaration' && /^__inox_array_source_\d+$/.test(item.name)
  )

  assert.ok(scaled)
  assert.ok(inlineCount)
  assert.ok(chainTemp)
  assert.ok(inlineSource)
  assert.equal(scaled.loweredArrayMethod, true)
  assert.equal(scaled.arrayElementType, 'number')
  assert.equal(inlineCount.init.args[0].type, 'Reference')
  assert.match(inlineCount.init.args[0].path[0], /^__inox_array_expr_\d+$/)
  assert.doesNotMatch(result.code, /inox_filter_array_\d+/)
  assert.doesNotMatch(result.code, /inox_map_array_\d+/)
  assert.match(result.code, /inox_array_push\(__inox_array_expr_\d+, inox_number_value/)
  assert.match(result.code, /inox_array_push\(scaled, inox_number_value/)
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
  const scores = main.body.find((item: AnyNode) => item.type === 'VariableDeclaration' && item.name === 'scores')
  const maybeScore = main.body.find(
    (item: AnyNode) => item.type === 'VariableDeclaration' && item.name === 'maybeScore'
  )
  const score = main.body.find((item: AnyNode) => item.type === 'VariableDeclaration' && item.name === 'score')
  const hasAda = main.body.find((item: AnyNode) => item.type === 'VariableDeclaration' && item.name === 'hasAda')
  const removed = main.body.find((item: AnyNode) => item.type === 'VariableDeclaration' && item.name === 'removed')
  const names = main.body.find((item: AnyNode) => item.type === 'VariableDeclaration' && item.name === 'names')
  const hasName = main.body.find((item: AnyNode) => item.type === 'VariableDeclaration' && item.name === 'hasName')
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
    'INOX_TYPE_MISMATCH'
  )

  assertDiagnostic(
    `export function main(): void {
  const scores: Map<string, number> = new Map()
  scores.get(1)
}
`,
    'INOX_TYPE_MISMATCH'
  )

  assertDiagnostic(
    `export function main(): void {
  const scores: Map<string, number> = new Map()
  scores.set('Ada', '7')
}
`,
    'INOX_TYPE_MISMATCH'
  )

  assertDiagnostic(
    `export function main(): void {
  const names: Set<string> = new Set()
  names.add(1)
}
`,
    'INOX_TYPE_MISMATCH'
  )

  assertDiagnostic(
    `export function main(): void {
  const scores: Map<string, number> = new Map()
  scores.size = 1
}
`,
    'INOX_ASSIGN_READONLY_FIELD'
  )

  assertDiagnostic(
    `export function main(): void {
  const scores: Map<string, number> = new Map()
  scores.clear('Ada')
}
`,
    'INOX_ARG_COUNT'
  )

  assertDiagnostic(
    `export function main(): void {
  const names: Set<string> = new Set()
  names.clear('Ada')
}
`,
    'INOX_ARG_COUNT'
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

  assert.match(objectIdentityResult.code, /inox_map_set\(users, ada, inox_number_value\(7\)\)/)
  assert.match(objectIdentityResult.code, /inox_map\* inox_map_source_\d+ = \(inox_map\*\)users\.as\.ref;/)

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

  assert.match(objectSetResult.code, /inox_set_add\(users, user\)/)
  assert.match(objectSetResult.code, /inox_set\* inox_set_source_\d+ = \(inox_set\*\)users\.as\.ref;/)
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

  const copy = main.body.find((item: AnyNode) => item.type === 'VariableDeclaration' && item.name === 'copy')
  const assigned = main.body.find((item: AnyNode) => item.type === 'VariableDeclaration' && item.name === 'assigned')
  const namesCopy = main.body.find((item: AnyNode) => item.type === 'VariableDeclaration' && item.name === 'namesCopy')
  const assignedNames = main.body.find(
    (item: AnyNode) => item.type === 'VariableDeclaration' && item.name === 'assignedNames'
  )
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
  assert.match(result.code, /inox_map\* inox_map_source_\d+ = \(inox_map\*\)scores\.as\.ref;/)
  assert.match(
    result.code,
    /inox_map_set\(\s*inox_map_\d+,\s*inox_map_source_\d+->entries\[inox_map_source_index_\d+\]\.key,\s*inox_map_source_\d+->entries\[inox_map_source_index_\d+\]\.value\s*\)/
  )
  assert.match(result.code, /copy = inox_map_\d+;/)
  assert.match(result.code, /inox_set\* inox_set_source_\d+ = \(inox_set\*\)names\.as\.ref;/)
  assert.match(
    result.code,
    /inox_set_add\(inox_set_\d+, inox_set_source_\d+->entries\[inox_set_source_index_\d+\]\.value\)/
  )
  assert.match(result.code, /namesCopy = inox_set_\d+;/)
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
  assert.match(result.code, /inox_value makeNums\(void\);/)
  assert.match(result.code, /double sumNums\(inox_value nums\);/)
  assert.match(result.code, /if \(nums\.tag != INOX_TAG_ARRAY \|\| nums\.as\.ref == 0\)\s+goto inox_cleanup;/)
  assert.match(result.code, /inox_value makeScores\(void\);/)
  assert.match(result.code, /double totalScores\(inox_value scores\);/)
  assert.match(result.code, /if \(scores\.tag != INOX_TAG_MAP \|\| scores\.as\.ref == 0\)\s+goto inox_cleanup;/)
  assert.match(result.code, /inox_value makeSeen\(void\);/)
  assert.match(result.code, /double seenCount\(inox_value seen\);/)
  assert.match(result.code, /if \(seen\.tag != INOX_TAG_SET \|\| seen\.as\.ref == 0\)\s+goto inox_cleanup;/)
  assert.match(result.code, /inox_array_len\(nums, &inox_for_length_\d+\)/)
  assert.match(result.code, /inox_map \*inox_for_map_\d+ = \(inox_map \*\)scores\.as\.ref;/)
  assert.match(result.code, /inox_set_has\(seen, inox_value_\d+, &inox_set_has_\d+\)/)
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
  const contentType = main.body.find(
    (item: AnyNode) => item.type === 'VariableDeclaration' && item.name === 'contentType'
  )
  const fallback = main.body.find((item: AnyNode) => item.type === 'VariableDeclaration' && item.name === 'fallback')
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
    'INOX_TYPE_MISMATCH'
  )

  assertDiagnostic(
    `export function main(): void {
  const headers: Map<string, string> = new Map()
  headers[1] = 'application/json'
}
`,
    'INOX_TYPE_MISMATCH'
  )

  assertDiagnostic(
    `export function main(): void {
  const headers: Map<string, string> = new Map()
  headers['content-type'] = 1
}
`,
    'INOX_TYPE_MISMATCH'
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
    'INOX_TYPE_MISMATCH'
  )

  assertDiagnostic(
    `export function main(): void {
  const name = 'Ada'
  name.includes('d', '1')
}
`,
    'INOX_TYPE_MISMATCH'
  )

  assertDiagnostic(
    `export function main(): void {
  const name = 'Ada'
  name.includes()
}
`,
    'INOX_ARG_COUNT'
  )

  assertDiagnostic(
    `export function main(): void {
  const name = 'Ada'
  name.startsWith()
}
`,
    'INOX_ARG_COUNT'
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
    'INOX_TYPE_MISMATCH'
  )

  assertDiagnostic(
    `export function main(): void {
  const name = 'Ada'
  name.lastIndexOf('a', '1')
}
`,
    'INOX_TYPE_MISMATCH'
  )

  assertDiagnostic(
    `export function main(): void {
  const name = 'Ada'
  name.indexOf()
}
`,
    'INOX_ARG_COUNT'
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
    'INOX_TYPE_MISMATCH'
  )

  assertDiagnostic(
    `export function main(): void {
  const name = 'Ada'
  name.slice()
}
`,
    'INOX_ARG_COUNT'
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
    'INOX_TYPE_MISMATCH'
  )

  assertDiagnostic(
    `export function main(): void {
  'Ada'.split()
}
`,
    'INOX_ARG_COUNT'
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
    'INOX_ARG_COUNT'
  )
})

test('checks string case and padStart as string calls', () => {
  const result = compileSource(
    `function symbolName(prefix: string, seed: number): string {
  return prefix.toUpperCase() + '_' + seed.toString(16).padStart(8, '0')
}

export function main(): void {
  console.log(symbolName('inox', 255))
}
`,
    {
      target: 'c'
    }
  )

  const symbolName = result.hir.body.find((item) => item.type === 'FunctionDeclaration' && item.name === 'symbolName')
  assert.equal(symbolName?.returnType, 'string')

  assertDiagnostic(
    `export function main(): void {
  const name = 'Ada'
  name.toUpperCase(1)
}
`,
    'INOX_ARG_COUNT'
  )

  assertDiagnostic(
    `export function main(): void {
  const name = 'Ada'
  name.padStart('3')
}
`,
    'INOX_TYPE_MISMATCH'
  )

  assertDiagnostic(
    `export function main(): void {
  const name = 'Ada'
  name.padStart(3, 0)
}
`,
    'INOX_TYPE_MISMATCH'
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
    'INOX_ARG_COUNT'
  )

  assertDiagnostic(
    `export function main(): void {
  String({ name: 'Ada' })
}
`,
    'INOX_TYPE_MISMATCH'
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
    'INOX_ARG_COUNT'
  )

  assertDiagnostic(
    `export function main(): void {
  Number(42)
}
`,
    'INOX_TYPE_MISMATCH'
  )

  assertDiagnostic(
    `export function main(): void {
  const text: string | null = null
  Number(text)
}
`,
    'INOX_TYPE_MISMATCH'
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
  assert.match(c.code, /long long inox_i32_truncated_\d+ = \(long long\)inox_i32_value_\d+;/)
  assert.match(c.code, /inox_u32_truncated_\d+ < 0LL \|\| inox_u32_truncated_\d+ > 4294967295LL/)
  assert.match(c.code, /inox_u64_truncated_\d+ < 0LL \|\| inox_u64_truncated_\d+ > 9007199254740991LL/)
  assert.match(c.code, /double inox_f32_\d+ = \(double\)\(\(float\)value\);/)

  assertDiagnostic(
    `export function main(): void {
  i32()
}
`,
    'INOX_ARG_COUNT'
  )

  assertDiagnostic(
    `export function main(): void {
  i32('1')
}
`,
    'INOX_TYPE_MISMATCH'
  )

  assertDiagnostic(
    `export function main(): void {
  const value: number | null = null
  f64(value)
}
`,
    'INOX_TYPE_MISMATCH'
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
  assert.match(result.code, /#include "inox\/loop\.h"/)
  assert.match(result.code, /#include "inox\/callback\.h"/)
  assert.match(result.code, /static inox_status inox_timer_callback_run\(void \*context\)/)
  assert.match(result.code, /void schedule\(inox_loop \*inox_loop\);/)
  assert.match(result.code, /int main\(void\) \{/)
  assert.match(result.code, /schedule\(&inox_loop\);/)
  assert.match(result.code, /inox_timer_handle \*timeout = 0;/)
  assert.match(result.code, /inox_timer_handle \*interval = 0;/)
  assert.match(result.code, /inox_timer_handle \*immediate = 0;/)
  assert.match(
    result.code,
    /inox_loop_set_timeout\(inox_loop, 1, inox_timer_callback_run, inox_timer_ctx_\d+, inox_timer_callback_finalize, &timeout\)/
  )
  assert.match(
    result.code,
    /inox_loop_set_interval\(inox_loop, 1, inox_timer_callback_run, inox_timer_ctx_\d+, inox_timer_callback_finalize, &interval\)/
  )
  assert.match(
    result.code,
    /inox_loop_queue_immediate\(&inox_loop, inox_timer_callback_run, inox_timer_ctx_\d+, inox_timer_callback_finalize, &immediate\)/
  )
  assert.match(result.code, /inox_loop_clear_timer\(timeout\);/)
  assert.match(result.code, /inox_loop_clear_timer\(interval\);/)
  assert.match(result.code, /inox_loop_clear_timer\(immediate\);/)
  assert.match(result.code, /scheduleLater\(\(inox_loop \*\)inox_context\);/)
  assert.match(
    result.code,
    /inox_callback_new\(&inox_default_allocator, inox_callback_scheduleLater_\d+, &inox_loop, 0, &inox_callback_\d+\)/
  )
  assert.match(result.code, /#if !defined\(INOX_LOOP_BACKEND_LIBUV\)[\s\S]*inox_time_sleep_ms[\s\S]*#endif/)
  assert.match(result.code, /while \(inox_loop_has_work\(&inox_loop\)\) \{/)
  assert.match(result.code, /inox_loop_poll\(&inox_loop, inox_performance_now\(\)\)/)

  assertDiagnostic(
    `export function main(): void {
  setInterval(() => {}, 1)
}
`,
    'INOX_C_TIMER_HANDLE',
    {
      target: 'c'
    }
  )

  assertDiagnostic(
    `export function main(): void {
  clearTimeout(1)
}
`,
    'INOX_TYPE_MISMATCH',
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
    'INOX_TIMER_REF_UNREF'
  )

  assertDiagnostic(
    `export function main(): void {
  const interval = setInterval(() => {}, 1)
  interval.ref()
}
`,
    'INOX_TIMER_REF_UNREF'
  )

  assertDiagnostic(
    `export function main(): void {
  setTimeout(async () => {
    await Promise.resolve(1)
  }, 1)
}
`,
    'INOX_ASYNC_TIMER_CALLBACK'
  )

  assertDiagnostic(
    `async function later(): Promise<void> {
  await Promise.resolve(1)
}

export function main(): void {
  setImmediate(later)
}
`,
    'INOX_ASYNC_TIMER_CALLBACK'
  )
})
