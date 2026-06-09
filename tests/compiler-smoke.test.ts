import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { CompileError } from '../src/compiler/diagnostics.ts'
import { compileFile, compileSource } from '../src/compiler/index.ts'
import type { CompileTarget } from '../src/compiler/types.ts'

test('compiles exported main to runnable JS', () => {
  const result = compileSource(`export function main(): void {
  console.log('hello')
}
`, {
    target: 'js'
  })

  assert.match(result.code, /export function main\(\)/)
  assert.match(result.code, /console\.log\("hello"\)/)
  assert.match(result.code, /await ccjsMainResult/)
})

test('emits C for a minimal console program', () => {
  const result = compileSource(`export function main(): void {
  const name = 'Ada'
  console.log('hello', name)
}
`, {
    target: 'c'
  })

  assert.match(result.code, /#include <stdio\.h>/)
  assert.match(result.code, /const char\* name = "Ada";/)
  assert.match(result.code, /printf\("%s %s\\n", "hello", name\);/)
})

test('compiles arrays, objects, member access and operators to JS', () => {
  const result = compileSource(`export function main(): void {
  const user = { name: 'Ada', scores: [1, 2, 3] }
  const total = user.scores[0] + user['scores'][1] * 2
  console.log(user.name, total === 5 && true)
}
`, {
    target: 'js'
  })

  assert.match(result.code, /const user = \{ name: "Ada", scores: \[1, 2, 3\] \}/)
  assert.match(result.code, /const total = \(user\.scores\[0\] \+ \(user\["scores"\]\[1\] \* 2\)\)/)
  assert.match(result.code, /console\.log\(user\.name, \(\(total === 5\) && true\)\)/)
})

test('parses string literals that look like operators', () => {
  const result = compileSource(`export function main(): void {
  const bang = '!'
  const plus = '+'
  const paren = '('
  console.log(bang, plus, paren)
}
`, {
    target: 'js'
  })

  assert.match(result.code, /const bang = "!"/)
  assert.match(result.code, /const plus = "\+"/)
  assert.match(result.code, /const paren = "\("/)
  assert.match(result.code, /console\.log\(bang, plus, paren\)/)
})

test('emits C for numeric operators', () => {
  const result = compileSource(`export function main(): void {
  const value = 1 + 2 * 3
  console.log(value, value === 7)
}
`, {
    target: 'c'
  })

  assert.match(result.code, /const double value = \(1 \+ \(2 \* 3\)\);/)
  assert.match(result.code, /printf\("%g %g\\n", \(\(double\)value\), \(\(double\)\(value == 7\)\)\);/)
})

test('lowers C object literals to runtime calls', () => {
  const result = compileSource(`export function main(): void {
  const user = { name: 'Ada', score: 42, active: true }
  console.log('ok')
}
`, {
    target: 'c'
  })

  assert.match(result.code, /#include "ccjs\/object\.h"/)
  assert.match(result.code, /static const ccjs_field_info ccjs_shape_user_\d+_fields\[\]/)
  assert.match(result.code, /ccjs_value user = ccjs_undefined_value\(\);/)
  assert.match(result.code, /ccjs_object_new\(&ccjs_default_allocator/)
  assert.match(result.code, /ccjs_string_from_literal\(&ccjs_default_allocator, "Ada", 3/)
  assert.match(result.code, /ccjs_object_init_known\(user, 1, ccjs_number_value\(42\)\)/)
  assert.match(result.code, /ccjs_object_init_known\(user, 2, ccjs_bool_value\(true\)\)/)
  assert.match(result.code, /ccjs_cleanup:\n  ccjs_release\(ccjs_value_\d+\);\n  ccjs_release\(user\);\n  return;/)
})

test('lowers synthetic C main wrapper through cleanup when runtime values are owned', () => {
  const result = compileSource(`const user = { name: 'Ada' }
console.log('ok')
`, {
    target: 'c'
  })

  assert.match(result.code, /int main\(void\) \{/)
  assert.match(result.code, /if \(ccjs_object_new\(&ccjs_default_allocator, &ccjs_shape_user_\d+, &user\) != CCJS_OK\) goto ccjs_cleanup;/)
  assert.match(result.code, /ccjs_cleanup:\n  ccjs_release\(ccjs_value_\d+\);\n  ccjs_release\(user\);\n  return 0;/)
})

test('lowers C void return through cleanup when runtime values are owned', () => {
  const result = compileSource(`export function main(): void {
  const user = { name: 'Ada' }
  return
  console.log('unreachable')
}
`, {
    target: 'c'
  })

  assert.match(result.code, /goto ccjs_cleanup;/)
  assert.match(result.code, /ccjs_cleanup:\n  ccjs_release\(ccjs_value_\d+\);\n  ccjs_release\(user\);\n  return;/)
})

test('lowers C number returns through cleanup when runtime values are owned', () => {
  const result = compileSource(`function getScore(): number {
  const user = { score: 42 }
  const score = user.score
  return score
}

export function main(): void {
  console.log(getScore())
}
`, {
    target: 'c'
  })

  assert.match(result.code, /double getScore\(void\) \{\n  double ccjs_return = 0;/)
  assert.match(result.code, /ccjs_return = score;\n  goto ccjs_cleanup;/)
  assert.match(result.code, /ccjs_cleanup:\n  ccjs_release\(ccjs_field_\d+\);\n  ccjs_release\(user\);\n  return ccjs_return;/)
})

test('lowers C array literals to runtime calls', () => {
  const result = compileSource(`export function main(): void {
  const values = [1, 2, 3]
  console.log('ok')
}
`, {
    target: 'c'
  })

  assert.match(result.code, /#include "ccjs\/array\.h"/)
  assert.match(result.code, /ccjs_value values = ccjs_undefined_value\(\);/)
  assert.match(result.code, /ccjs_array_new\(&ccjs_default_allocator, 3, &values\)/)
  assert.match(result.code, /ccjs_array_set\(values, 0, ccjs_number_value\(1\)\)/)
  assert.match(result.code, /ccjs_array_set\(values, 2, ccjs_number_value\(3\)\)/)
})

test('lowers C array length for known arrays', () => {
  const result = compileSource(`export function main(): void {
  const values = [1, 2, 3]
  console.log(values.length, [4, 5].length)
}
`, {
    target: 'c'
  })

  assert.match(result.code, /printf\("%g %g\\n", \(\(double\)3\), \(\(double\)2\)\);/)
})

test('lowers known C object field access to runtime calls', () => {
  const result = compileSource(`export function main(): void {
  const user = { score: 42, active: true }
  const score = user.score
  const active = user.active
  console.log(score, active)
}
`, {
    target: 'c'
  })

  assert.match(result.code, /ccjs_object_get_known\(user, 0, &ccjs_field_\d+\)/)
  assert.match(result.code, /const double score = ccjs_field_\d+\.as\.number;/)
  assert.match(result.code, /ccjs_object_get_known\(user, 1, &ccjs_field_\d+\)/)
  assert.match(result.code, /const double active = ccjs_field_\d+\.as\.boolean \? 1 : 0;/)
})

test('lowers known C string object field access to runtime strings', () => {
  const result = compileSource(`export function main(): void {
  const user = { name: 'Ada', score: 42 }
  const name = user.name
  console.log(name)
}
`, {
    target: 'c'
  })

  assert.match(result.code, /ccjs_object_get_known\(user, 0, &ccjs_field_\d+\)/)
  assert.match(result.code, /if \(ccjs_field_\d+\.tag != CCJS_TAG_STRING \|\| ccjs_field_\d+\.as\.ref == 0\) goto ccjs_cleanup;/)
  assert.match(result.code, /const ccjs_string\* name = \(ccjs_string\*\)ccjs_field_\d+\.as\.ref;/)
  assert.match(result.code, /printf\("%\.\*s\\n", \(int\)name->len, name->bytes\);/)
})

test('lowers known C object field assignments to runtime calls', () => {
  const result = compileSource(`export function main(): void {
  const user = { score: 1, active: false, name: 'Ada' }
  user.score = 42
  user.active = true
  user.name = 'Grace'
  const score = user.score
  const active = user.active
  const name = user.name
  console.log(score, active, name)
}
`, {
    target: 'c'
  })

  assert.match(result.code, /ccjs_object_set_known\(user, 0, ccjs_number_value\(42\)\)/)
  assert.match(result.code, /ccjs_object_set_known\(user, 1, ccjs_bool_value\(true\)\)/)
  assert.match(result.code, /ccjs_string_from_literal\(&ccjs_default_allocator, "Grace", 5/)
  assert.match(result.code, /ccjs_object_set_known\(user, 2, ccjs_value_\d+\)/)
  assert.match(result.code, /printf\("%g %g %\.\*s\\n", \(\(double\)score\), \(\(double\)active\), \(int\)name->len, name->bytes\);/)
})

test('lowers C string index object field reads through runtime lookup', () => {
  const result = compileSource(`export function main(): void {
  const user = { score: 42, active: true, name: 'Ada' }
  const score = user['score']
  const active = user['active']
  const name = user['name']
  console.log(score, active, name)
}
`, {
    target: 'c'
  })

  assert.match(result.code, /ccjs_object_get\(user, "score", 5, &ccjs_field_\d+\)/)
  assert.match(result.code, /const double score = ccjs_field_\d+\.as\.number;/)
  assert.match(result.code, /ccjs_object_get\(user, "active", 6, &ccjs_field_\d+\)/)
  assert.match(result.code, /const double active = ccjs_field_\d+\.as\.boolean \? 1 : 0;/)
  assert.match(result.code, /ccjs_object_get\(user, "name", 4, &ccjs_field_\d+\)/)
  assert.match(result.code, /const ccjs_string\* name = \(ccjs_string\*\)ccjs_field_\d+\.as\.ref;/)
  assert.match(result.code, /printf\("%g %g %\.\*s\\n", \(\(double\)score\), \(\(double\)active\), \(int\)name->len, name->bytes\);/)
})

test('lowers C string index object field assignments through runtime lookup', () => {
  const result = compileSource(`export function main(): void {
  const user = { score: 1, active: false, name: 'Ada' }
  user['score'] = 42
  user['active'] = true
  user['name'] = 'Grace'
  const score = user['score']
  const active = user['active']
  const name = user['name']
  console.log(score, active, name)
}
`, {
    target: 'c'
  })

  assert.match(result.code, /ccjs_object_set\(user, "score", 5, ccjs_number_value\(42\)\)/)
  assert.match(result.code, /ccjs_object_set\(user, "active", 6, ccjs_bool_value\(true\)\)/)
  assert.match(result.code, /ccjs_string_from_literal\(&ccjs_default_allocator, "Grace", 5/)
  assert.match(result.code, /ccjs_object_set\(user, "name", 4, ccjs_value_\d+\)/)
  assert.match(result.code, /printf\("%g %g %\.\*s\\n", \(\(double\)score\), \(\(double\)active\), \(int\)name->len, name->bytes\);/)
})

test('lowers known C array index access to runtime calls', () => {
  const result = compileSource(`export function main(): void {
  const values = [42, true]
  const score = values[0]
  const active = values[1]
  console.log(score, active)
}
`, {
    target: 'c'
  })

  assert.match(result.code, /ccjs_array_get\(values, 0, &ccjs_item_\d+\)/)
  assert.match(result.code, /const double score = ccjs_item_\d+\.as\.number;/)
  assert.match(result.code, /ccjs_array_get\(values, 1, &ccjs_item_\d+\)/)
  assert.match(result.code, /const double active = ccjs_item_\d+\.as\.boolean \? 1 : 0;/)
})

test('lowers known C array index assignments to runtime calls', () => {
  const result = compileSource(`export function main(): void {
  const values = [1, false]
  values[0] = 42
  values[1] = true
  const score = values[0]
  const active = values[1]
  console.log(score, active)
}
`, {
    target: 'c'
  })

  assert.match(result.code, /ccjs_array_set\(values, 0, ccjs_number_value\(42\)\)/)
  assert.match(result.code, /ccjs_array_set\(values, 1, ccjs_bool_value\(true\)\)/)
  assert.match(result.code, /const double score = ccjs_item_\d+\.as\.number;/)
  assert.match(result.code, /const double active = ccjs_item_\d+\.as\.boolean \? 1 : 0;/)
})

test('lowers known C string array index reads to runtime strings', () => {
  const result = compileSource(`export function main(): void {
  const values = ['Ada']
  values[0] = 'Grace'
  const name = values[0]
  console.log(name)
}
`, {
    target: 'c'
  })

  assert.match(result.code, /ccjs_array_set\(values, 0, ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_array_get\(values, 0, &ccjs_item_\d+\)/)
  assert.match(result.code, /if \(ccjs_item_\d+\.tag != CCJS_TAG_STRING \|\| ccjs_item_\d+\.as\.ref == 0\) goto ccjs_cleanup;/)
  assert.match(result.code, /const ccjs_string\* name = \(ccjs_string\*\)ccjs_item_\d+\.as\.ref;/)
  assert.match(result.code, /printf\("%\.\*s\\n", \(int\)name->len, name->bytes\);/)
})

test('propagates C runtime strings through local declarations', () => {
  const result = compileSource(`export function main(): void {
  const user = { name: 'Ada' }
  const name = user.name
  const again = name
  console.log(again)
}
`, {
    target: 'c'
  })

  assert.match(result.code, /const ccjs_string\* name = \(ccjs_string\*\)ccjs_field_\d+\.as\.ref;/)
  assert.match(result.code, /const ccjs_string\* again = name;/)
  assert.match(result.code, /printf\("%\.\*s\\n", \(int\)again->len, again->bytes\);/)
})

test('lowers C runtime string references for object and array assignments', () => {
  const result = compileSource(`export function main(): void {
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
`, {
    target: 'c'
  })

  assert.match(result.code, /ccjs_value ccjs_value_\d+;\n  ccjs_value_\d+\.tag = CCJS_TAG_STRING;\n  ccjs_value_\d+\.as\.ref = \(ccjs_ref\*\)&name->header;/)
  assert.match(result.code, /ccjs_object_set_known\(target, 0, ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_array_set\(values, 0, ccjs_value_\d+\)/)
  assert.match(result.code, /printf\("%\.\*s %\.\*s\\n", \(int\)objectName->len, objectName->bytes, \(int\)arrayName->len, arrayName->bytes\);/)
})

test('lowers C string-returning calls for object and array assignments', () => {
  const result = compileSource(`function getName(): string {
  return 'Ada'
}

export function main(): void {
  const target = { name: 'Bob' }
  const values = ['Grace']
  target.name = getName()
  values[0] = getName()
  console.log(target.name, values[0])
}
`, {
    target: 'c'
  })

  assert.match(result.code, /ccjs_value_\d+ = getName\(\);/)
  assert.match(result.code, /ccjs_object_set_known\(target, 0, ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_array_set\(values, 0, ccjs_value_\d+\)/)
  assert.match(result.code, /printf\("%\.\*s %\.\*s\\n"/)
})

test('lowers C runtime string parameters', () => {
  const result = compileSource(`function greet(name: string): void {
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
`, {
    target: 'c'
  })

  assert.match(result.code, /void greet\(ccjs_value ccjs_param_name\);/)
  assert.match(result.code, /ccjs_value echo\(ccjs_value ccjs_param_name\);/)
  assert.match(result.code, /if \(ccjs_param_name\.tag != CCJS_TAG_STRING \|\| ccjs_param_name\.as\.ref == 0\) goto ccjs_cleanup;/)
  assert.match(result.code, /ccjs_string\* name = \(ccjs_string\*\)ccjs_param_name\.as\.ref;/)
  assert.match(result.code, /greet\(ccjs_value_\d+\);/)
  assert.match(result.code, /echo\(ccjs_value_\d+\)/)
})

test('prepares C string arguments for number-returning calls inside expressions', () => {
  const result = compileSource(`function length(name: string): number {
  return 3
}

export function main(): void {
  const user = { name: 'Ada' }
  const total = length('Ada') + length(user.name)
  console.log(length(user.name), total)
}
`, {
    target: 'c'
  })

  assert.match(result.code, /double length\(ccjs_value ccjs_param_name\);/)
  assert.match(result.code, /ccjs_string_from_literal\(&ccjs_default_allocator, "Ada", 3, &ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_object_get_known\(user, 0, &ccjs_value_\d+\)/)
  assert.match(result.code, /const double total = \(length\(ccjs_value_\d+\) \+ length\(ccjs_value_\d+\)\);/)
  assert.match(result.code, /printf\("%g %g\\n", \(\(double\)length\(ccjs_value_\d+\)\), \(\(double\)total\)\);/)
})

test('lowers C string-returning functions to owned runtime values', () => {
  const result = compileSource(`function getName(): string {
  return 'Ada'
}

export function main(): void {
  const name = getName()
  console.log(name)
}
`, {
    target: 'c'
  })

  assert.match(result.code, /ccjs_value getName\(void\);/)
  assert.match(result.code, /ccjs_value getName\(void\) \{\n  ccjs_value ccjs_return = ccjs_undefined_value\(\);/)
  assert.match(result.code, /ccjs_return = ccjs_value_\d+;\n  ccjs_retain\(ccjs_return\);\n  goto ccjs_cleanup;/)
  assert.match(result.code, /return ccjs_return;/)
  assert.match(result.code, /ccjs_value ccjs_value_\d+ = ccjs_undefined_value\(\);\n  ccjs_release\(ccjs_value_\d+\);\n  ccjs_value_\d+ = ccjs_undefined_value\(\);\n  ccjs_value_\d+ = getName\(\);/)
  assert.match(result.code, /const ccjs_string\* name = \(ccjs_string\*\)ccjs_value_\d+\.as\.ref;/)
  assert.match(result.code, /printf\("%\.\*s\\n", \(int\)name->len, name->bytes\);/)
})

test('lowers C runtime string field returns', () => {
  const result = compileSource(`function getName(): string {
  const user = { name: 'Ada' }
  return user.name
}

export function main(): void {
  const name = getName()
  console.log(name)
}
`, {
    target: 'c'
  })

  assert.match(result.code, /ccjs_object_get_known\(user, 0, &ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_return = ccjs_value_\d+;/)
  assert.match(result.code, /return ccjs_return;/)
})

test('lowers C runtime string index returns', () => {
  const result = compileSource(`function getObjectName(): string {
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
`, {
    target: 'c'
  })

  assert.match(result.code, /ccjs_object_get\(user, "name", 4, &ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_array_get\(values, 0, &ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_value getObjectName\(void\);/)
  assert.match(result.code, /ccjs_value getArrayName\(void\);/)
  assert.match(result.code, /printf\("%\.\*s %\.\*s\\n"/)
})

test('lowers direct C console.log for string-returning calls', () => {
  const result = compileSource(`function getName(): string {
  return 'Ada'
}

export function main(): void {
  console.log(getName())
}
`, {
    target: 'c'
  })

  assert.match(result.code, /ccjs_value ccjs_value_\d+ = ccjs_undefined_value\(\);/)
  assert.match(result.code, /ccjs_value_\d+ = getName\(\);/)
  assert.match(result.code, /ccjs_string\* ccjs_log_string_\d+ = \(ccjs_string\*\)ccjs_value_\d+\.as\.ref;/)
  assert.match(result.code, /printf\("%\.\*s\\n", \(int\)ccjs_log_string_\d+->len, ccjs_log_string_\d+->bytes\);/)
})

test('rejects unsupported C runtime string composition with a stable diagnostic', () => {
  assertDiagnostic(`type User = {
  name: string
}

export function main(): void {
  const user: User = { name: 'Ada' }
  const name = user.name
  const message = name + '!'
  console.log(message)
}
`, 'CCJS_C_STRING_EXPR', {
    target: 'c'
  })

  assertDiagnostic(`function getName(): string {
  return 'Ada'
}

export function main(): void {
  const message = getName() + '!'
  console.log(message)
}
`, 'CCJS_C_STRING_EXPR', {
    target: 'c'
  })

  assertDiagnostic(`function getName(): string {
  return 'Ada'
}

export function main(): void {
  const same = getName() === 'Ada'
  console.log(same)
}
`, 'CCJS_C_STRING_EXPR', {
    target: 'c'
  })
})

test('lowers direct C console.log member and index expressions', () => {
  const result = compileSource(`export function main(): void {
  const user = { score: 42, active: true, name: 'Ada' }
  const values = [7, false, 'Grace']
  console.log(user.score, user.active, user.name, user['name'], values[0], values[1], values[2])
}
`, {
    target: 'c'
  })

  assert.match(result.code, /ccjs_object_get_known\(user, 0, &ccjs_log_value_\d+\)/)
  assert.match(result.code, /ccjs_object_get_known\(user, 2, &ccjs_log_value_\d+\)/)
  assert.match(result.code, /ccjs_object_get\(user, "name", 4, &ccjs_log_value_\d+\)/)
  assert.match(result.code, /ccjs_array_get\(values, 0, &ccjs_log_value_\d+\)/)
  assert.match(result.code, /ccjs_array_get\(values, 2, &ccjs_log_value_\d+\)/)
  assert.match(result.code, /\(\(double\)\(ccjs_log_value_\d+\.as\.boolean \? 1 : 0\)\)/)
  assert.match(result.code, /printf\("%g %g %\.\*s %\.\*s %g %g %\.\*s\\n"/)
})

test('compiles if else blocks to JS and C', () => {
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
  const js = compileSource(source, {
    target: 'js'
  })
  const c = compileSource(source, {
    target: 'c'
  })

  assert.match(js.code, /if \(\(1 < 2\)\) \{/)
  assert.match(js.code, /} else \{/)
  assert.match(c.code, /if \(\(1 < 2\)\) \{/)
  assert.match(c.code, /text = "yes";/)
})

test('compiles while loops to JS and C', () => {
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
  const js = compileSource(source, {
    target: 'js'
  })
  const c = compileSource(source, {
    target: 'c'
  })

  assert.match(js.code, /while \(\(index < 4\)\) \{/)
  assert.match(c.code, /while \(\(index < 4\)\) \{/)
  assert.match(c.code, /total = \(total \+ index\);/)
})

test('prepares C string-argument calls in if while and switch conditions', () => {
  const result = compileSource(`function isReady(label: string): boolean {
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
`, {
    target: 'c'
  })

  assert.match(result.code, /ccjs_string_from_literal\(&ccjs_default_allocator, "if", 2, &ccjs_value_\d+\) != CCJS_OK[\s\S]*if \(isReady\(ccjs_value_\d+\)\) \{/)
  assert.match(result.code, /while \(1\) \{\n\s+ccjs_release\(ccjs_value_\d+\);\n\s+ccjs_value_\d+ = ccjs_undefined_value\(\);\n\s+if \(ccjs_string_from_literal\(&ccjs_default_allocator, "while", 5, &ccjs_value_\d+\) != CCJS_OK\) goto ccjs_cleanup;\n\s+if \(!\(keepGoing\(index, ccjs_value_\d+\)\)\) break;/)
  assert.match(result.code, /ccjs_string_from_literal\(&ccjs_default_allocator, "switch", 6, &ccjs_value_\d+\) != CCJS_OK[\s\S]*switch \(\(int\)choose\(ccjs_value_\d+\)\) \{/)
})

test('prepares owned C runtime values before rewriting them inside loops', () => {
  const result = compileSource(`export function main(): void {
  let index = 0

  while (index < 2) {
    const user = { name: 'Ada' }
    console.log(user.name)
    index = index + 1
  }
}
`, {
    target: 'c'
  })

  assert.match(result.code, /while \(\(index < 2\)\) \{[\s\S]*ccjs_release\(user\);\n    user = ccjs_undefined_value\(\);\n    if \(ccjs_object_new/)
  assert.match(result.code, /ccjs_release\(ccjs_value_\d+\);\n    ccjs_value_\d+ = ccjs_undefined_value\(\);\n    if \(ccjs_string_from_literal/)
  assert.match(result.code, /ccjs_release\(ccjs_log_value_\d+\);\n    ccjs_log_value_\d+ = ccjs_undefined_value\(\);\n    if \(ccjs_object_get_known/)
})

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

test('compiles continue statements to JS and C', () => {
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
  const js = compileSource(source, {
    target: 'js'
  })
  const c = compileSource(source, {
    target: 'c'
  })

  assert.match(js.code, /continue/)
  assert.match(c.code, /continue;/)
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

  assert.match(result.code, /\{\n\s+ccjs_release\(ccjs_value_\d+\);\n\s+ccjs_value_\d+ = ccjs_undefined_value\(\);\n\s+if \(ccjs_string_from_literal\(&ccjs_default_allocator, "start", 5, &ccjs_value_\d+\) != CCJS_OK\) goto ccjs_cleanup;\n\s+double index = start\(ccjs_value_\d+\);/)
  assert.match(result.code, /for \(;;\) \{\n\s+ccjs_release\(ccjs_value_\d+\);\n\s+ccjs_value_\d+ = ccjs_undefined_value\(\);\n\s+if \(ccjs_string_from_literal\(&ccjs_default_allocator, "limit", 5, &ccjs_value_\d+\) != CCJS_OK\) goto ccjs_cleanup;\n\s+if \(!\(keepGoing\(index, ccjs_value_\d+\)\)\) break;/)
  assert.match(result.code, /ccjs_release\(ccjs_value_\d+\);\n\s+ccjs_value_\d+ = ccjs_undefined_value\(\);\n\s+if \(ccjs_string_from_literal\(&ccjs_default_allocator, "step", 4, &ccjs_value_\d+\) != CCJS_OK\) goto ccjs_cleanup;\n\s+\(index = nextIndex\(index, ccjs_value_\d+\)\);/)
})

test('lowers C string-returning for initializers into scoped loop blocks', () => {
  const result = compileSource(`function getName(): string {
  return 'Ada'
}

export function main(): void {
  let index = 0

  for (const name = getName(); index < 1; index = index + 1) {
    console.log(name)
  }
}
`, {
    target: 'c'
  })

  assert.match(result.code, /\{\n\s+ccjs_release\(ccjs_value_\d+\);\n\s+ccjs_value_\d+ = ccjs_undefined_value\(\);\n\s+ccjs_value_\d+ = getName\(\);/)
  assert.match(result.code, /const ccjs_string\* name = \(ccjs_string\*\)ccjs_value_\d+\.as\.ref;\n\s+for \(;;\) \{/)
  assert.match(result.code, /if \(!\(\(index < 1\)\)\) break;/)
  assert.doesNotMatch(result.code, /if \((ccjs_value_\d+)\.tag != CCJS_TAG_STRING \|\| \1\.as\.ref == 0\) goto ccjs_cleanup;\n\s+if \(\1\.tag != CCJS_TAG_STRING \|\| \1\.as\.ref == 0\) goto ccjs_cleanup;/)
})

test('compiles for of loops over arrays to JS and C', () => {
  const source = `export function main(): void {
  const values = [1, 2, 3]
  let total = 0

  for (const value of values) {
    total = total + value
  }

  console.log(total)
}
`
  const js = compileSource(source, {
    target: 'js'
  })

  assert.match(js.code, /for \(const value of values\) \{/)
  const c = compileSource(source, {
    target: 'c'
  })

  assert.match(c.code, /for \(size_t ccjs_for_index_\d+ = 0; ccjs_for_index_\d+ < 3; ccjs_for_index_\d+ \+= 1\) \{/)
  assert.match(c.code, /ccjs_array_get\(values, ccjs_for_index_\d+, &ccjs_for_value_\d+\)/)
  assert.match(c.code, /double value = ccjs_for_value_\d+\.as\.number;/)
})

test('rejects unsupported C for of iterables with a stable diagnostic', () => {
  assertDiagnostic(`export function main(): void {
  for (const value of ['a', 'b']) {
    console.log(value)
  }
}
`, 'CCJS_C_FOR_OF', {
    target: 'c'
  })
})

test('compiles for of loops over inline array literals to C', () => {
  const c = compileSource(`export function main(): void {
  let total = 0

  for (const value of [1, 2, 3]) {
    total = total + value
  }

  console.log(total)
}
`, {
    target: 'c'
  })

  assert.match(c.code, /ccjs_array_new\(&ccjs_default_allocator, 3, &ccjs_for_array_\d+\)/)
  assert.match(c.code, /for \(size_t ccjs_for_index_\d+ = 0; ccjs_for_index_\d+ < 3; ccjs_for_index_\d+ \+= 1\) \{/)
  assert.match(c.code, /double value = ccjs_for_value_\d+\.as\.number;/)
})

test('compiles switch statements to JS and C', () => {
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
  const js = compileSource(source, {
    target: 'js'
  })
  const c = compileSource(source, {
    target: 'c'
  })

  assert.match(js.code, /switch \(code\) \{/)
  assert.match(js.code, /case 2:/)
  assert.match(js.code, /break/)
  assert.match(c.code, /switch \(\(int\)code\) \{/)
  assert.match(c.code, /case \(int\)2: \{/)
  assert.match(c.code, /break;/)
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
  assert.throws(() => {
    compileSource('var value = 1', {
      target: 'js'
    })
  }, error => {
    if (!(error instanceof CompileError)) {
      return false
    }

    assert.equal(error.diagnostics[0].code, 'CCJS_NO_VAR')
    return true
  })
})

test('allows assignment to let bindings', () => {
  const result = compileSource(`export function main(): void {
  let count = 1
  count = 2
  console.log(count)
}
`, {
    target: 'js'
  })

  assert.match(result.code, /let count = 1/)
  assert.match(result.code, /count = 2/)
})

test('prepares C string-argument calls in scalar assignment statements', () => {
  const result = compileSource(`function nextIndex(index: number, label: string): number {
  return index + 1
}

export function main(): void {
  let index = 0
  index = nextIndex(index, 'step')
  console.log(index)
}
`, {
    target: 'c'
  })

  assert.match(result.code, /ccjs_release\(ccjs_value_\d+\);\n  ccjs_value_\d+ = ccjs_undefined_value\(\);\n  if \(ccjs_string_from_literal\(&ccjs_default_allocator, "step", 4, &ccjs_value_\d+\) != CCJS_OK\) goto ccjs_cleanup;\n  index = nextIndex\(index, ccjs_value_\d+\);/)
})

test('returns checked HIR with simple value types', () => {
  const result = compileSource(`export function main(): void {
  const name = 'Ada'
  const count = 1
  console.log(name, count)
}
`, {
    target: 'js'
  })
  const main = result.hir.body.find(item => item.type === 'FunctionDeclaration')
  assert.ok(main)
  const [name, count] = main.body.filter(item => item.type === 'VariableDeclaration')

  assert.equal(result.hir.type, 'HirProgram')
  assert.equal(name.valueType, 'string')
  assert.equal(count.valueType, 'number')
})

test('keeps function signatures in HIR and compiles typed calls', () => {
  const result = compileSource(`function add(left: number, right: number): number {
  return left + right
}

export function main(): void {
  const total: number = add(2, 3)
  console.log(total)
}
`, {
    target: 'js'
  })
  const add = result.hir.body.find(item => item.type === 'FunctionDeclaration' && item.name === 'add')
  assert.ok(add)

  assert.equal(add.returnType, 'number')
  assert.deepEqual(add.params.map(param => param.valueType), ['number', 'number'])
  assert.match(result.code, /function add\(left, right\)/)
})

test('compiles named callback function values to JS and C', () => {
  const source = `function run(callback: Function): void {
  callback()
}

function hello(): void {
  console.log('callback')
}

export function main(): void {
  const callback: Function = hello
  run(callback)
}
`
  const js = compileSource(source, {
    target: 'js'
  })

  assert.match(js.code, /const callback = hello/)
  assert.match(js.code, /run\(callback\)/)
  const c = compileSource(source, {
    target: 'c'
  })

  assert.match(c.code, /void run\(void \(\*callback\)\(void\)\);/)
  assert.match(c.code, /void run\(void \(\*callback\)\(void\)\) \{\n  callback\(\);/)
  assert.match(c.code, /void \(\*const callback\)\(void\) = hello;/)
  assert.match(c.code, /run\(callback\);/)
})

test('compiles typed no-argument callback aliases to JS and C', () => {
  const source = `type Done = () => void;

function run(callback: Done): void {
  callback()
}

function hello(): void {
  console.log('typed')
}

export function main(): void {
  const callback: Done = hello
  run(callback)
}
`
  const js = compileSource(source, {
    target: 'js'
  })
  const c = compileSource(source, {
    target: 'c'
  })

  assert.match(js.code, /const callback = hello/)
  assert.match(c.code, /void run\(void \(\*callback\)\(void\)\);/)
  assert.match(c.code, /void \(\*const callback\)\(void\) = hello;/)
})

test('compiles typed callback aliases with number parameters to C', () => {
  const source = `type NumberCallback = (value: number) => void;

function run(callback: NumberCallback): void {
  callback(7)
}

function hello(value: number): void {
  console.log(value)
}

export function main(): void {
  const callback: NumberCallback = hello
  run(callback)
}
`
  const c = compileSource(source, {
    target: 'c'
  })

  assert.match(c.code, /void run\(void \(\*callback\)\(double\)\);/)
  assert.match(c.code, /void run\(void \(\*callback\)\(double\)\) \{\n  callback\(7\);/)
  assert.match(c.code, /void \(\*const callback\)\(double\) = hello;/)
})

test('compiles typed callback aliases with string parameters through the C callback ABI', () => {
  const source = `type StringCallback = (value: string) => void;

function run(callback: StringCallback): void {
  callback('typed')
}

function hello(value: string): void {
  console.log(value)
}

export function main(): void {
  const callback: StringCallback = hello
  run(callback)
}
`
  const c = compileSource(source, {
    target: 'c'
  })

  assert.match(c.code, /void run\(ccjs_value callback\);/)
  assert.match(c.code, /static ccjs_status ccjs_callback_hello_0\(void\* context, const ccjs_value\* args, size_t arg_count, ccjs_value\* out\);/)
  assert.match(c.code, /if \(ccjs_callback_new\(&ccjs_default_allocator, ccjs_callback_hello_0, 0, 0, &callback\) != CCJS_OK\) goto ccjs_cleanup;/)
  assert.match(c.code, /ccjs_value ccjs_callback_args_\d+\[\] = \{ ccjs_value_\d+ \};/)
  assert.match(c.code, /if \(ccjs_callback_call\(callback, ccjs_callback_args_\d+, 1, &ccjs_callback_out_\d+\) != CCJS_OK\) goto ccjs_cleanup;/)
})

test('compiles typed callback aliases with object parameters through the C callback ABI', () => {
  const source = `type Person = {
  name: string
};

type PersonCallback = (value: Person) => void;

function run(callback: PersonCallback, person: Person): void {
  callback(person)
}

function hello(value: Person): void {
  console.log(value.name)
}

export function main(): void {
  const person: Person = {
    name: 'Ada'
  }
  const callback: PersonCallback = hello
  run(callback, person)
}
`
  const c = compileSource(source, {
    target: 'c'
  })

  assert.match(c.code, /void run\(ccjs_value callback, ccjs_value person\);/)
  assert.match(c.code, /if \(args\[0\]\.tag != CCJS_TAG_OBJECT \|\| args\[0\]\.as\.ref == 0\) return CCJS_ERR_TYPE;/)
  assert.match(c.code, /ccjs_value ccjs_callback_args_\d+\[\] = \{ person \};/)
  assert.match(c.code, /if \(ccjs_object_get_known\(value, 0, &ccjs_log_value_\d+\) != CCJS_OK\) goto ccjs_cleanup;/)
})

test('checks typed callback argument counts', () => {
  assertDiagnostic(`type NumberCallback = (value: number) => void;

function run(callback: NumberCallback): void {
  callback()
}
`, 'CCJS_ARG_COUNT', {
    target: 'js'
  })
})

test('rejects inline C callback values with a stable diagnostic', () => {
  assertDiagnostic(`function run(callback: Function): void {
  callback()
}

export function main(): void {
  run(() => {
    console.log('inline')
  })
}
`, 'CCJS_C_FUNCTION_VALUE', {
    target: 'c'
  })
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

  assert.match(c.code, /if \(ccjs_object_get_known\(data, 0, &ccjs_field_\d+\) != CCJS_OK\) goto ccjs_cleanup;/)
  assert.match(c.code, /const ccjs_string\* name = \(ccjs_string\*\)ccjs_field_\d+\.as\.ref;/)
  assert.match(c.code, /if \(ccjs_object_get\(data, "score", 5, &ccjs_log_value_\d+\) != CCJS_OK\) goto ccjs_cleanup;/)
})

test('compiles optional chaining to JS and rejects it for C', () => {
  const source = `function hello(): string {
  return 'called'
}

export function main(): void {
  const data = { items: [{ name: 'Ada' }], hello }
  const missing = null
  console.log(data?.items?.[0]?.name, missing?.items?.[0]?.name, data.hello?.())
}
`
  const js = compileSource(source, {
    target: 'js'
  })

  assert.match(js.code, /data\?\.items\?\.\[0\]\?\.name/)
  assert.match(js.code, /data\.hello\?\.\(\)/)
  assertDiagnostic(source, 'CCJS_C_OPTIONAL_CHAINING', {
    target: 'c'
  })
})

test('compiles nullish coalescing to JS and rejects it for C', () => {
  const source = `function printValue(value: unknown): void {
  console.log(value ?? 'Ada')
}

export function main(): void {
  printValue(1)
}
`
  const js = compileSource(source, {
    target: 'js'
  })

  assert.match(js.code, /console\.log\(\(value \?\? "Ada"\)\)/)
  assertDiagnostic(source, 'CCJS_C_NULLISH', {
    target: 'c'
  })
})

test('compiles simple classes to JS and rejects them for C', () => {
  const source = `class User {
  constructor(name: string) {
    this.name = name
  }

  greet(): void {
    console.log(this.name)
  }
}

export function main(): void {
  const user = new User('Ada')
  user.greet()
}
`
  const js = compileSource(source, {
    target: 'js'
  })

  assert.match(js.code, /class User \{/)
  assert.match(js.code, /constructor\(name\) \{/)
  assert.match(js.code, /this\.name = name/)
  assert.match(js.code, /const user = new User\("Ada"\)/)
  assertDiagnostic(source, 'CCJS_C_CLASS', {
    target: 'c'
  })
})

test('compiles async await to JS and rejects it for C', () => {
  const source = `async function getValue(): number {
  return await Promise.resolve(2)
}

export async function main(): void {
  const value = await getValue()
  console.log(value)
}
`
  const js = compileSource(source, {
    target: 'js'
  })

  assert.match(js.code, /async function getValue\(\)/)
  assert.match(js.code, /return await Promise\.resolve\(2\)/)
  assert.match(js.code, /export async function main\(\)/)
  assertDiagnostic(source, 'CCJS_C_ASYNC', {
    target: 'c'
  })
})

test('compiles arrow functions and chain calls to JS and rejects them for C', () => {
  const source = `export function main(): void {
  const values = [3, 1, 2]
  const result = values.sort((left: number, right: number) => left - right).filter(value => value > 1).map(value => value * 2)
  console.log(result[0], result[1])
}
`
  const js = compileSource(source, {
    target: 'js'
  })

  assert.match(js.code, /\(left, right\) => \(left - right\)/)
  assert.match(js.code, /value => \(value > 1\)/)
  assert.match(js.code, /value => \(value \* 2\)/)
  assertDiagnostic(source, 'CCJS_C_FUNCTION_VALUE', {
    target: 'c'
  })
})

test('injects Node fs prelude when fs is referenced', () => {
  const result = compileSource(`export async function main(): void {
  await fs.writeFile('/private/tmp/ccjs-fs-smoke.txt', 'hello')
  const text = await fs.readFile('/private/tmp/ccjs-fs-smoke.txt', 'utf8')
  console.log(text)
}
`, {
    target: 'js'
  })

  assert.match(result.code, /import \* as fs from 'node:fs\/promises'/)
})

test('injects Node http prelude when http is referenced', () => {
  const result = compileSource(`export function main(): void {
  const server = http.createServer((request, response) => {
    response.end('ok')
  })
  server.close()
}
`, {
    target: 'js'
  })

  assert.match(result.code, /import \* as http from 'node:http'/)
})

test('lowers Date.now and performance.now to the C time runtime', () => {
  const result = compileSource(`export function main(): void {
  const started = Date.now()
  const elapsed = performance.now()
  console.log(started, elapsed)
}
`, {
    target: 'c'
  })

  assert.match(result.code, /#include "ccjs\/time\.h"/)
  assert.match(result.code, /double started = ccjs_date_now\(\);/)
  assert.match(result.code, /double elapsed = ccjs_performance_now\(\);/)
})

test('reports JS stdlib globals with a stable C diagnostic', () => {
  for (const source of [
    `export function main(): void {
  const text = fs.readFile('/tmp/value.txt', 'utf8')
  console.log(text)
}
`,
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
  const values = new Set([1, 2])
  console.log(values)
}
`
  ]) {
    assertDiagnostic(source, 'CCJS_C_JS_GLOBAL', {
      target: 'c'
    })
  }
})

test('module graph stores HIR per module', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ccjs-modules-'))

  try {
    await writeFile(join(dir, 'lib.js'), `export function greet(): void {
  console.log('from lib')
}
`)
    await writeFile(join(dir, 'main.js'), `import { greet } from './lib.js'

export function main(): void {
  greet()
}
`)

    const result = await compileFile(join(dir, 'main.js'), {
      target: 'js'
    })

    assert.equal(result.graph.modules.every(module => module.hir?.type === 'HirProgram'), true)
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('accepts valid TypeScript source files as canonical input', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ccjs-ts-modules-'))

  try {
    await writeFile(join(dir, 'lib.ts'), `export function greet(): string {
  return 'from ts'
}
`)
    await writeFile(join(dir, 'main.ts'), `import { greet } from './lib.ts'

export function main(): void {
  console.log(greet())
}
`)

    const result = await compileFile(join(dir, 'main.ts'), {
      target: 'js'
    })

    assert.match(result.code, /from ts/)
    assert.equal(result.graph.modules.every(module => module.path.endsWith('.ts')), true)
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('rejects duplicate declarations in the same scope', () => {
  assertDiagnostic(`export function main(): void {
  const value = 1
  const value = 2
}
`, 'CCJS_REDECLARED_NAME')
})

test('rejects use before declaration in the current compiler slice', () => {
  assertDiagnostic(`export function main(): void {
  console.log(value)
  const value = 1
}
`, 'CCJS_UNKNOWN_NAME')
})

test('rejects assignment to const bindings', () => {
  assertDiagnostic(`export function main(): void {
  const value = 1
  value = 2
}
`, 'CCJS_ASSIGN_CONST')
})

test('rejects unknown names', () => {
  assertDiagnostic(`export function main(): void {
  console.log(missing)
}
`, 'CCJS_UNKNOWN_NAME')
})

test('rejects variable type mismatches', () => {
  assertDiagnostic(`export function main(): void {
  const value: number = 'Ada'
}
`, 'CCJS_TYPE_MISMATCH')
})

test('rejects function argument type mismatches', () => {
  assertDiagnostic(`function greet(name: string): void {
  console.log(name)
}

export function main(): void {
  greet(1)
}
`, 'CCJS_TYPE_MISMATCH')
})

test('rejects function argument count mismatches', () => {
  assertDiagnostic(`function greet(name: string): void {
  console.log(name)
}

export function main(): void {
  greet()
}
`, 'CCJS_ARG_COUNT')
})

test('rejects return type mismatches', () => {
  assertDiagnostic(`function getValue(): number {
  return 'Ada'
}

export function main(): void {
  console.log(getValue())
}
`, 'CCJS_TYPE_MISMATCH')
})

test('checks typed object aliases and readonly fields', () => {
  const result = compileSource(`type User = {
  readonly id: number,
  name: string
}

export function main(): void {
  const user: User = { id: 1, name: 'Ada' }
  user.name = 'Grace'
  console.log(user.name)
}
`, {
    target: 'js'
  })

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
  const main = js.hir.body.find(item => item.type === 'FunctionDeclaration' && item.name === 'main')
  assert.ok(main)
  const user = main.body.find(item => item.type === 'VariableDeclaration' && item.name === 'user')
  assert.ok(user)

  assert.deepEqual(user.shape.fields.map(field => ({
    name: field.name,
    readonly: field.readonly,
    valueType: field.valueType
  })), [
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
  ])
  assert.match(c.code, /\{ "id", CCJS_FIELD_READONLY \}/)
  assert.match(c.code, /\{ "name", 0 \}/)
  assert.match(c.code, /ccjs_object_init_known\(user, 0, ccjs_number_value\(1\)\)/)
  assert.match(c.code, /ccjs_object_get_known\(user, 0, &ccjs_field_\d+\)/)
})

test('rejects readonly typed object field assignment', () => {
  assertDiagnostic(`type User = {
  readonly id: number,
  name: string
}

export function main(): void {
  const user: User = { id: 1, name: 'Ada' }
  user.id = 2
}
`, 'CCJS_ASSIGN_READONLY_FIELD')
})

test('checks typed object string index fields', () => {
  const result = compileSource(`type User = {
  readonly id: number,
  name: string
}

export function main(): void {
  const user: User = { id: 1, name: 'Ada' }
  const name: string = user['name']
  console.log(name)
}
`, {
    target: 'js'
  })

  assert.match(result.code, /const name = user\["name"\]/)

  assertDiagnostic(`type User = {
  readonly id: number,
  name: string
}

export function main(): void {
  const user: User = { id: 1, name: 'Ada' }
  user['id'] = 2
}
`, 'CCJS_ASSIGN_READONLY_FIELD')
})

test('rejects typed object shape mismatches', () => {
  assertDiagnostic(`type User = {
  id: number,
  name: string
}

export function main(): void {
  const user: User = { id: 1 }
  console.log(user)
}
`, 'CCJS_MISSING_FIELD')

  assertDiagnostic(`type User = {
  id: number
}

export function main(): void {
  const user: User = { id: 1, extra: true }
  console.log(user)
}
`, 'CCJS_UNKNOWN_FIELD')

  assertDiagnostic(`type User = {
  id: number
}

export function main(): void {
  const user: User = { id: 'Ada' }
  console.log(user)
}
`, 'CCJS_TYPE_MISMATCH')
})

test('rejects unknown typed object fields on member access', () => {
  assertDiagnostic(`type User = {
  name: string
}

export function main(): void {
  const user: User = { name: 'Ada' }
  console.log(user.age)
}
`, 'CCJS_UNKNOWN_FIELD')
})

test('keeps block declarations scoped to the block', () => {
  assertDiagnostic(`export function main(): void {
  if (true) {
    const hidden = 1
  }

  console.log(hidden)
}
`, 'CCJS_UNKNOWN_NAME')
})

test('keeps while body declarations scoped to the body', () => {
  assertDiagnostic(`export function main(): void {
  while (false) {
    const hidden = 1
  }

  console.log(hidden)
}
`, 'CCJS_UNKNOWN_NAME')
})

test('keeps for initializer scoped to the loop', () => {
  assertDiagnostic(`export function main(): void {
  for (let index = 0; index < 1; index = index + 1) {
    console.log(index)
  }

  console.log(index)
}
`, 'CCJS_UNKNOWN_NAME')
})

test('rejects assignment to const for of bindings', () => {
  assertDiagnostic(`export function main(): void {
  for (const value of [1]) {
    value = 2
  }
}
`, 'CCJS_ASSIGN_CONST')
})

test('rejects for in with a stable diagnostic code', () => {
  assertDiagnostic(`export function main(): void {
  const value = { name: 'Ada' }

  for (const key in value) {
    console.log(key)
  }
}
`, 'CCJS_NO_FOR_IN')
})

test('rejects break outside loops and switches', () => {
  assertDiagnostic(`export function main(): void {
  break
}
`, 'CCJS_BREAK_OUTSIDE')
})

test('rejects continue outside loops', () => {
  assertDiagnostic(`export function main(): void {
  continue
}
`, 'CCJS_CONTINUE_OUTSIDE')
})

test('rejects non-boolean conditions', () => {
  assertDiagnostic(`export function main(): void {
  if (1) {
    console.log('bad')
  }
}
`, 'CCJS_CONDITION_TYPE')

  assertDiagnostic(`export function main(): void {
  while ('yes') {
    console.log('bad')
  }
}
`, 'CCJS_CONDITION_TYPE')

  assertDiagnostic(`export function main(): void {
  for (let index = 0; 'yes'; index = index + 1) {
    console.log(index)
  }
}
`, 'CCJS_CONDITION_TYPE')
})

test('rejects duplicate switch default branches', () => {
  assertDiagnostic(`export function main(): void {
  switch (1) {
    default:
      console.log('a')
    default:
      console.log('b')
  }
}
`, 'CCJS_DUPLICATE_DEFAULT')
})

test('rejects switch type mismatches', () => {
  assertDiagnostic(`export function main(): void {
  switch (1) {
    case 'one':
      console.log('bad')
  }
}
`, 'CCJS_SWITCH_TYPE')

  assertDiagnostic(`export function main(): void {
  const value = { code: 1 }

  switch (value) {
    default:
      console.log('bad')
  }
}
`, 'CCJS_SWITCH_TYPE')
})

test('rejects await outside async functions', () => {
  assertDiagnostic(`export function main(): void {
  const value = await Promise.resolve(1)
  console.log(value)
}
`, 'CCJS_AWAIT_OUTSIDE_ASYNC')
})

test('compiles a static ESM module graph to JS bundle', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ccjs-modules-'))

  try {
    await writeFile(join(dir, 'lib.js'), `export function greet(): void {
  console.log('from lib')
}
`)
    await writeFile(join(dir, 'main.js'), `import { greet } from './lib.js'

export function main(): void {
  greet()
}
`)

    const result = await compileFile(join(dir, 'main.js'), {
      target: 'js'
    })

    assert.match(result.code, /function greet\(\)/)
    assert.match(result.code, /function main\(\)/)
    assert.doesNotMatch(result.code, /import \{/)
    assert.doesNotMatch(result.code, /export function/)
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('compiles a static ESM module graph to C bundle', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ccjs-modules-'))

  try {
    await writeFile(join(dir, 'lib.js'), `export function greet(): void {
  console.log('from lib')
}
`)
    await writeFile(join(dir, 'main.js'), `import { greet } from './lib.js'

export function main(): void {
  greet()
}
`)

    const result = await compileFile(join(dir, 'main.js'), {
      target: 'c'
    })

    assert.match(result.code, /void greet\(void\);/)
    assert.match(result.code, /void ccjs_main\(void\);/)
    assert.match(result.code, /void greet\(void\) \{/)
    assert.match(result.code, /greet\(\);/)
    assert.match(result.code, /int main\(void\) \{/)
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('rejects unknown imported exports', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ccjs-modules-'))

  try {
    await writeFile(join(dir, 'lib.js'), `export function greet(): void {
  console.log('from lib')
}
`)
    await writeFile(join(dir, 'main.js'), `import { missing } from './lib.js'

export function main(): void {
  missing()
}
`)

    await assert.rejects(() => compileFile(join(dir, 'main.js'), {
      target: 'js'
    }), error => {
      if (!(error instanceof CompileError)) {
        return false
      }

      assert.equal(error.diagnostics.some(item => item.code === 'CCJS_UNKNOWN_EXPORT'), true)
      return true
    })
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

function assertDiagnostic(source: string, code: string, options: { target?: CompileTarget } = {}): void {
  assert.throws(() => {
    compileSource(source, {
      target: options.target ?? 'js'
    })
  }, error => {
    if (!(error instanceof CompileError)) {
      return false
    }

    assert.equal(error.diagnostics.some(item => item.code === code), true)
    return true
  })
}
