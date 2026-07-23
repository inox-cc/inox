import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import ts from 'typescript'

const targets = [
  { file: 'compiler/backends/cpp/unit.ts', functionName: 'cUnitValueCType' },
  { file: 'compiler/backends/cpp/module-emission.ts', functionName: 'cModuleValueCType' }
]

test('async-result C++ storage type не имеет raw fallback', () => {
  const tails: string[] = []

  for (const target of targets) {
    const source = readFileSync(target.file, 'utf8')
    const sourceFile = ts.createSourceFile(target.file, source, ts.ScriptTarget.Latest, true)
    const declaration = sourceFile.statements.find(
      (statement): statement is ts.FunctionDeclaration =>
        ts.isFunctionDeclaration(statement) && statement.name?.text === target.functionName
    )

    assert.ok(declaration?.body, `${target.file}: missing ${target.functionName}`)

    const branch = declaration.body.statements.find(
      (statement): statement is ts.IfStatement =>
        ts.isIfStatement(statement) && isAsyncResultValueTypeCondition(statement.expression)
    )

    assert.ok(branch, `${target.file}: missing internal async-result branch`)

    const calls = callNames(branch.thenStatement, sourceFile)

    if (calls.includes('emitCType') || !calls.includes('requireCompilerLibraryIntrinsicNativeCppType')) {
      tails.push(`${target.file}:${target.functionName}`)
    }
  }

  assert.deepEqual(tails, [])
})

function isAsyncResultValueTypeCondition(expression: ts.Expression): boolean {
  if (!ts.isBinaryExpression(expression) || expression.operatorToken.kind !== ts.SyntaxKind.EqualsEqualsEqualsToken) {
    return false
  }

  return (
    isValueTypeAndAsyncResult(expression.left, expression.right) ||
    isValueTypeAndAsyncResult(expression.right, expression.left)
  )
}

function isValueTypeAndAsyncResult(left: ts.Expression, right: ts.Expression): boolean {
  return (
    ts.isIdentifier(left) && left.text === 'valueType' && ts.isStringLiteral(right) && right.text === 'async-result'
  )
}

function callNames(node: ts.Node, sourceFile: ts.SourceFile): string[] {
  const result: string[] = []

  function visit(current: ts.Node): void {
    if (ts.isCallExpression(current)) {
      result.push(current.expression.getText(sourceFile))
    }

    ts.forEachChild(current, visit)
  }

  visit(node)
  return result
}
