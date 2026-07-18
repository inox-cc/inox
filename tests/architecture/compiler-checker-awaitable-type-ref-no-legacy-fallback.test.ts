import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import ts from 'typescript'

const checkerPath = 'compiler/checker.ts'

test('checker await использует только awaitable TypeRef для fulfilled type', () => {
  const source = readFileSync(checkerPath, 'utf8')
  const sourceFile = ts.createSourceFile(checkerPath, source, ts.ScriptTarget.Latest, true)
  const checker = sourceFile.statements.find(
    (statement): statement is ts.ClassDeclaration =>
      ts.isClassDeclaration(statement) && statement.name?.text === 'Checker'
  )

  assert.ok(checker, 'missing Checker class')

  const checkExpression = checker.members.find(
    (member): member is ts.MethodDeclaration =>
      ts.isMethodDeclaration(member) && member.name.getText(sourceFile) === 'checkExpression'
  )

  assert.ok(checkExpression?.body, 'missing Checker.checkExpression')

  const awaitBranches: ts.IfStatement[] = []

  visitNodes(checkExpression.body, (node) => {
    if (ts.isIfStatement(node) && isAwaitExpressionCondition(node.expression)) {
      awaitBranches.push(node)
    }
  })

  assert.equal(awaitBranches.length, 1, 'expected one AwaitExpression checker branch')

  const branch = awaitBranches[0].thenStatement
  let appliesFulfilledTypeRef = false
  let readsLegacyFulfilledType = false
  let usesAwaitableTypeRef = false
  let usesPromiseCategoryFallback = false

  visitNodes(branch, (node) => {
    if (ts.isCallExpression(node)) {
      const name = callName(node.expression)

      if (name === 'applyCompilerLibraryTypeRef') {
        appliesFulfilledTypeRef = true
      }

      if (name === 'resolveExpressionPromiseValueType') {
        readsLegacyFulfilledType = true
      }

      if (name === 'typeRefTraitArgument' && isAwaitableTraitLookup(node)) {
        usesAwaitableTypeRef = true
      }
    }

    if (ts.isBinaryExpression(node) && isPromiseArgumentTypeCondition(node)) {
      usesPromiseCategoryFallback = true
    }
  })

  assert.equal(usesAwaitableTypeRef, true, 'missing awaitable TypeRef lookup')
  assert.equal(appliesFulfilledTypeRef, true, 'missing fulfilled TypeRef application')
  assert.deepEqual(
    readsLegacyFulfilledType || usesPromiseCategoryFallback ? ['compiler/checker.ts:legacy fulfilled fallback'] : [],
    []
  )
})

function visitNodes(node: ts.Node, visitor: (node: ts.Node) => void): void {
  visitor(node)
  ts.forEachChild(node, (child) => visitNodes(child, visitor))
}

function isAwaitExpressionCondition(expression: ts.Expression): boolean {
  if (!ts.isBinaryExpression(expression) || expression.operatorToken.kind !== ts.SyntaxKind.EqualsEqualsEqualsToken) {
    return false
  }

  return (
    isExpressionTypeAndAwait(expression.left, expression.right) ||
    isExpressionTypeAndAwait(expression.right, expression.left)
  )
}

function isExpressionTypeAndAwait(left: ts.Expression, right: ts.Expression): boolean {
  return (
    ts.isPropertyAccessExpression(left) &&
    ts.isIdentifier(left.expression) &&
    left.expression.text === 'expression' &&
    left.name.text === 'type' &&
    ts.isStringLiteral(right) &&
    right.text === 'AwaitExpression'
  )
}

function callName(expression: ts.LeftHandSideExpression): string | null {
  if (ts.isIdentifier(expression)) {
    return expression.text
  }

  if (ts.isPropertyAccessExpression(expression)) {
    return expression.name.text
  }

  return null
}

function isAwaitableTraitLookup(call: ts.CallExpression): boolean {
  return (
    call.arguments.length >= 3 &&
    call.arguments[0].getText() === 'expression.argument.typeRef' &&
    ts.isStringLiteral(call.arguments[1]) &&
    call.arguments[1].text === 'awaitable' &&
    ts.isNumericLiteral(call.arguments[2]) &&
    call.arguments[2].text === '0'
  )
}

function isPromiseArgumentTypeCondition(expression: ts.BinaryExpression): boolean {
  if (expression.operatorToken.kind !== ts.SyntaxKind.EqualsEqualsEqualsToken) {
    return false
  }

  return (
    isArgumentTypeAndPromise(expression.left, expression.right) ||
    isArgumentTypeAndPromise(expression.right, expression.left)
  )
}

function isArgumentTypeAndPromise(left: ts.Expression, right: ts.Expression): boolean {
  return ts.isIdentifier(left) && left.text === 'argumentType' && ts.isStringLiteral(right) && right.text === 'promise'
}
