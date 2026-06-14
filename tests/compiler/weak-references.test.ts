import { test } from 'node:test'

import {
  assert,
  assertDiagnostic,
  compileSource,
  compileSourceToIr,
  CompileError
} from '../helpers/compiler-smoke.ts'

test('parses weak fields as ownership metadata without reserving the weak name', () => {
  const compiled = compileSourceToIr(`type Node = {
  weak parent: Node | null,
  weak: number
}

function read(node: Node): void {
  const parent = node.parent
  const value = node.weak
}
`)
  const alias = compiled.hir.body.find((item) => item.type === 'TypeAliasDeclaration' && item.name === 'Node')
  const fn = compiled.hir.body.find((item) => item.type === 'FunctionDeclaration' && item.name === 'read')
  const parentRead = fn?.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'parent')
  const valueRead = fn?.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'value')

  assert.equal(alias?.valueType.fields[0].name, 'parent')
  assert.equal(alias?.valueType.fields[0].ownership, 'weak')
  assert.equal(alias?.valueType.fields[0].weakLoc?.line, 2)
  assert.equal(alias?.valueType.fields[1].name, 'weak')
  assert.equal(alias?.valueType.fields[1].ownership, 'strong')
  assert.equal(parentRead?.init.nullable, true)
  assert.equal(valueRead?.init.nullable, false)
})

test('keeps weak as a normal class method name when it is followed by a call signature', () => {
  const compiled = compileSourceToIr(`class Box {
  weak(): number {
    return 1
  }
}
`)
  const box = compiled.hir.body.find((item) => item.type === 'ClassDeclaration' && item.name === 'Box')

  assert.equal(box?.fields.length, 0)
  assert.equal(box?.methods[0].name, 'weak')
})

test('rejects weak scalar fields in the first weak slice', () => {
  assertDiagnostic(
    `type Bad = {
  weak count: number
}

function read(bad: Bad): void {
  const count = bad.count
}
`,
    'CCJS_WEAK_TYPE'
  )
})

test('rejects C lowering for weak object alias fields until weak storage lands', () => {
  assertDiagnostic(
    `type Node = {
  weak parent: Node | null
}

function read(node: Node): void {
  const parent = node.parent
}
`,
    'CCJS_WEAK_UNSUPPORTED'
  )
})

test('rejects strong self ownership cycles before recursive type lowering', () => {
  assertDiagnostic(
    `type Node = {
  parent: Node | null
}

export function main(): void {}
`,
    'CCJS_OWNERSHIP_CYCLE'
  )
})

test('rejects mutual strong ownership cycles across object aliases', () => {
  assertDiagnostic(
    `type Parent = {
  child: Child | null
}

type Child = {
  parent: Parent | null
}

export function main(): void {}
`,
    'CCJS_OWNERSHIP_CYCLE'
  )
})

test('rejects class ownership cycles', () => {
  assertDiagnostic(
    `class Parent {
  child: Child | null
}

class Child {
  parent: Parent | null
}
`,
    'CCJS_OWNERSHIP_CYCLE'
  )
})

test('rejects container-mediated ownership cycles', () => {
  assertDiagnostic(
    `type Node = {
  children: Node[]
}

export function main(): void {}
`,
    'CCJS_OWNERSHIP_CYCLE'
  )
})

test('does not report ownership cycles for weak back-references', () => {
  assert.throws(
    () => {
      compileSource(`type Parent = {
  child: Child | null
}

type Child = {
  weak parent: Parent | null
}

export function main(): void {}
`)
    },
    (error) => {
      assert.ok(error instanceof CompileError)
      assert.equal(error.diagnostics.some((item) => item.code === 'CCJS_OWNERSHIP_CYCLE'), false)
      assert.equal(error.diagnostics.some((item) => item.code === 'CCJS_WEAK_UNSUPPORTED'), true)
      return true
    }
  )
})

test('rejects C lowering for weak class fields until weak storage lands', () => {
  assertDiagnostic(
    `class Node {
  weak parent: Node | null
}
`,
    'CCJS_WEAK_UNSUPPORTED'
  )
})

test('still compiles a field named weak when it is not used as a modifier', () => {
  const compiled = compileSource(`type Flags = {
  weak: number
}

export function main(): void {
  const flags: Flags = { weak: 1 }
  console.log(flags.weak)
}
`)

  assert.match(compiled.code, /ccjs_object_get_known/)
})
