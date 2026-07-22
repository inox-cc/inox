import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

import ts from 'typescript'

const descriptorNames = ['LibraryOperationDescriptor', 'LibraryOperationVariantDescriptor'] as const
const descriptorNameSet = new Set<string>(descriptorNames)
const legacyFields = new Set(['resultShapeFields', 'resultTypeId', 'cppType', 'valueType', 'nullable', 'owned'])
const implementationFiles = [
  'compiler/extensions/library-set-builder.ts',
  'compiler/checker.ts',
  'compiler/c/index.ts',
  'compiler/c/values/statements.ts'
]

test('resultTypeRef остаётся единственным каналом semantic result type', async () => {
  const typesPath = 'compiler/extensions/types.ts'
  const typesSource = await readFile(new URL(`../../${typesPath}`, import.meta.url), 'utf8')
  const sourceFile = ts.createSourceFile(typesPath, typesSource, ts.ScriptTarget.Latest, true)
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

  for (const file of implementationFiles) {
    const source = await readFile(new URL(`../../${file}`, import.meta.url), 'utf8')

    assert.doesNotMatch(
      source,
      /\b(?:operation|variant)\??\.(?:resultShapeFields|resultTypeId|cppType|valueType|nullable|owned)\b/,
      file
    )
    assert.doesNotMatch(source, /\blegacyResultMetadata\b/, file)
  }
})
