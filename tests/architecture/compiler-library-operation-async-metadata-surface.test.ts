import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import ts from 'typescript'

const typesPath = 'compiler/extensions/types.ts'
const descriptorNames = ['LibraryOperationDescriptor', 'LibraryOperationVariantDescriptor'] as const
const descriptorNameSet = new Set<string>(descriptorNames)
const legacyFields = new Set(['promiseValueType', 'promiseRejectionValueType'])

test('public operation descriptors не содержат legacy async metadata', () => {
  const source = readFileSync(typesPath, 'utf8')
  const sourceFile = ts.createSourceFile(typesPath, source, ts.ScriptTarget.Latest, true)
  const foundDescriptors: string[] = []
  const violations: string[] = []

  for (const statement of sourceFile.statements) {
    if (!ts.isTypeAliasDeclaration(statement) || !descriptorNameSet.has(statement.name.text)) {
      continue
    }

    foundDescriptors.push(statement.name.text)
    assert.ok(ts.isTypeLiteralNode(statement.type), `${statement.name.text} must remain an object type`)

    for (const member of statement.type.members) {
      if (ts.isPropertySignature(member) && ts.isIdentifier(member.name) && legacyFields.has(member.name.text)) {
        violations.push(`${statement.name.text}.${member.name.text}`)
      }
    }
  }

  assert.deepEqual(foundDescriptors.sort(), [...descriptorNames].sort())
  assert.deepEqual(violations, [])
})
