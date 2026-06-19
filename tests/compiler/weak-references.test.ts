import { test } from 'node:test'

import {
  assert,
  assertDiagnostic,
  compileSource,
  compileSourceToIr
} from '../helpers/compiler-smoke.ts'
import type { AnyNode } from '../../compiler/types.ts'

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
  const parentRead = fn?.body.find((item: AnyNode) => item.type === 'VariableDeclaration' && item.name === 'parent')
  const valueRead = fn?.body.find((item: AnyNode) => item.type === 'VariableDeclaration' && item.name === 'value')

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
    'INOX_WEAK_TYPE'
  )
})

test('lowers weak object alias fields to C weak field metadata', () => {
  const compiled = compileSource(`type Parent = {
  name: string
}

type Child = {
  weak parent: Parent | null
}

export function main(): void {
  const parent: Parent = { name: 'Ada' }
  const child: Child = { parent }
  const maybe = child.parent

  if (maybe != null) {
    console.log('alive')
  }
}
`)

  assert.match(compiled.code, /INOX_FIELD_WEAK/)
  assert.equal(compiled.ir.runtimeRequirements.includes('weak-references'), true)
})

test('rejects strong self ownership cycles before recursive type lowering', () => {
  assertDiagnostic(
    `type Node = {
  parent: Node | null
}

export function main(): void {}
`,
    'INOX_OWNERSHIP_CYCLE'
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
    'INOX_OWNERSHIP_CYCLE'
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
    'INOX_OWNERSHIP_CYCLE'
  )
})

test('rejects container-mediated ownership cycles', () => {
  assertDiagnostic(
    `type Node = {
  children: Node[]
}

export function main(): void {}
`,
    'INOX_OWNERSHIP_CYCLE'
  )
})

test('does not report ownership cycles for weak back-references', () => {
  const compiled = compileSource(`type Parent = {
  child: Child | null
}

type Child = {
  weak parent: Parent | null
}

export function main(): void {}
`)

  assert.equal(compiled.ir.runtimeRequirements.includes('weak-references'), true)
})

test('allows TypeScript-compatible weak ownership markers on type fields', () => {
  const compiled = compileSourceToIr(`type Param = {
  functionTypeOwnership?: 'weak'
  functionType?: Fn | null
}

type Fn = {
  params: Param[]
}

export function main(): void {
  const fn: Fn = { params: [] }
  const param: Param = { functionType: fn }
  const maybe = param.functionType

  if (maybe != null) {
    console.log(maybe.params.length)
  }
}
`)
  const main = compiled.hir.body.find((item) => item.type === 'FunctionDeclaration' && item.name === 'main')
  const maybe = main?.body.find((item: AnyNode) => item.type === 'VariableDeclaration' && item.name === 'maybe')

  assert.equal(maybe?.init.nullable, true)
})

test('rejects direct weak dereference without a null check', () => {
  assertDiagnostic(
    `type Parent = {
  name: string
}

type Child = {
  weak parent: Parent | null
}

export function main(): void {
  const parent: Parent = { name: 'Ada' }
  const child: Child = { parent }
  console.log(child.parent.name)
}
`,
    'INOX_WEAK_ACCESS'
  )
})

test('rejects direct weak local dereference without a null check', () => {
  assertDiagnostic(
    `type Parent = {
  name: string
}

type Child = {
  weak parent: Parent | null
}

export function main(): void {
  const parent: Parent = { name: 'Ada' }
  const child: Child = { parent }
  const maybe = child.parent
  console.log(maybe.name)
}
`,
    'INOX_WEAK_ACCESS'
  )
})

test('allows weak dereference after a null check', () => {
  const compiled = compileSource(`type Parent = {
  name: string
}

type Child = {
  weak parent: Parent | null
}

export function main(): void {
  const parent: Parent = { name: 'Ada' }
  const child: Child = { parent }
  const maybe = child.parent

  if (maybe != null) {
    console.log(maybe.name)
  }
}
`)

  assert.equal(compiled.ir.runtimeRequirements.includes('weak-references'), true)
  assert.match(compiled.code, /INOX_FIELD_WEAK/)
})

test('allows optional chaining over weak fields', () => {
  const compiled = compileSource(`type Parent = {
  name: string
}

type Child = {
  weak parent: Parent | null
}

export function main(): void {
  const parent: Parent = { name: 'Ada' }
  const child: Child = { parent }
  console.log(child.parent?.name ?? 'missing')
}
`)

  assert.equal(compiled.ir.runtimeRequirements.includes('weak-references'), true)
  assert.match(compiled.code, /INOX_FIELD_WEAK/)
})

test('lowers weak class fields to C weak field metadata', () => {
  const compiled = compileSource(`class Node {
  weak parent: Node | null

  constructor(parent: Node | null) {
    this.parent = parent
  }
}

export function main(): void {
  const root = new Node(null)
  const child = new Node(root)
  const maybe = child.parent

  if (maybe != null) {
    console.log('alive')
  }
}
`)

  assert.match(compiled.code, /INOX_FIELD_WEAK/)
  assert.equal(compiled.ir.runtimeRequirements.includes('weak-references'), true)
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

  assert.match(compiled.code, /inox_object_get_known/)
})
