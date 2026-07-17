import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource, compileSourceToIr } from '../../compiler/core.ts'
import { emptyCompilerLibrarySet } from '../../compiler/extensions/library-set.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('динамическое поле AnyNode не превращается в primitive API dependency', () => {
  assert.doesNotThrow(() =>
    compileSourceToIr(
      `
function isUnknownAlias(declaration: AnyNode): boolean {
  return (
    declaration.valueType !== null &&
    typeof declaration.valueType !== 'undefined' &&
    declaration.valueType.kind === 'alias' &&
    declaration.valueType.valueType === 'unknown'
  )
}
`,
      { libraries: emptyCompilerLibrarySet }
    )
  )
})

test('String operation дочернего AnyNode проходит через library descriptor', () => {
  assert.doesNotThrow(() =>
    compileSource(
      `
function hasInterpolation(statement: AnyNode): boolean {
  return (
    statement.init !== null &&
    typeof statement.init !== 'undefined' &&
    statement.init.type === 'TemplateLiteral' &&
    statement.init.raw.includes('\${')
  )
}
`,
      { libraries: defaultCompilerLibrarySet }
    )
  )
})

test('String descriptor явно принимает unknown receiver из AnyNode', () => {
  assert.doesNotThrow(() =>
    compileSource(
      `
function matchesPrefix(argument: AnyNode, prefixes: string[]): boolean {
  if (argument.type !== 'StringLiteral') return false
  return argument.value.slice(0, prefixes[0].length) === prefixes[0]
}
`,
      { libraries: defaultCompilerLibrarySet }
    )
  )
})
