import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, relative, resolve, sep } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import ts from 'typescript'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const compilerRoot = resolve(projectRoot, 'compiler')

type SemanticTail = {
  column: number
  file: string
  line: number
  rule: string
  text: string
}

test('portable compiler не содержит semantic tails библиотеки node:os', () => {
  const tails = collectNodeOsSemanticTails()

  assert.deepEqual(
    tails,
    [],
    'node:os должен подключаться только через package descriptor; portable compiler не должен знать его symbols, runtime requirement, capability или C++ header'
  )
})

function collectNodeOsSemanticTails(): SemanticTail[] {
  const result: SemanticTail[] = []
  const seen = new Set<string>()

  for (const file of collectTypeScriptFiles(compilerRoot)) {
    const source = readFileSync(file, 'utf8')
    const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)

    visitNode(sourceFile, sourceFile, result, seen)
  }

  return result.sort(compareSemanticTails)
}

function visitNode(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  result: SemanticTail[],
  seen: Set<string>
): void {
  if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
    const specifier = node.moduleSpecifier

    if (specifier && ts.isStringLiteral(specifier) && isNodeOsPackagePath(specifier.text)) {
      addSemanticTail(result, seen, sourceFile, specifier, 'node:os package import')
    }
  }

  if (ts.isIdentifier(node)) {
    const name = node.text

    if (name === 'osRuntimeMethod' || name === 'osRuntimeConstant') {
      addSemanticTail(result, seen, sourceFile, node, name)
    } else if (name.startsWith('cOsRuntime')) {
      addSemanticTail(result, seen, sourceFile, node, 'cOsRuntime*')
    } else if (name === 'needsOsRuntime') {
      addSemanticTail(result, seen, sourceFile, node, 'needsOsRuntime')
    } else if (name === 'os' && isFixedOsCapabilityProperty(node)) {
      addSemanticTail(result, seen, sourceFile, node, 'fixed os capability property')
    }
  }

  if (isTextLikeNode(node)) {
    const text = textLikeNodeText(node)

    if (text.includes('node:os')) {
      addSemanticTail(result, seen, sourceFile, node, 'node:os module name')
    }

    if (text.includes('inox/os.h')) {
      addSemanticTail(result, seen, sourceFile, node, 'inox/os.h')
    }

    if (text === 'os' && isFixedOsRequirementOrCapability(node)) {
      addSemanticTail(result, seen, sourceFile, node, 'fixed os requirement/capability')
    }
  }

  ts.forEachChild(node, (child) => visitNode(child, sourceFile, result, seen))
}

function collectTypeScriptFiles(directory: string): string[] {
  const result: string[] = []

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name)

    if (entry.isDirectory()) {
      result.push(...collectTypeScriptFiles(path))
    } else if (entry.isFile() && path.endsWith('.ts')) {
      result.push(path)
    }
  }

  return result.sort()
}

function isNodeOsPackagePath(specifier: string): boolean {
  return specifier.includes('stdlib/node/os/compiler/') || specifier.endsWith('stdlib/node/os/compiler')
}

function isTextLikeNode(node: ts.Node): node is ts.StringLiteralLike | ts.TemplateHead | ts.TemplateMiddle | ts.TemplateTail {
  return ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)
}

function textLikeNodeText(
  node: ts.StringLiteralLike | ts.TemplateHead | ts.TemplateMiddle | ts.TemplateTail
): string {
  return node.text
}

function isFixedOsCapabilityProperty(node: ts.Identifier): boolean {
  const parent = node.parent

  if (ts.isPropertyAccessExpression(parent) && parent.name === node) {
    return parent.expression.getText().endsWith('capabilities')
  }

  if (!ts.isPropertySignature(parent) && !ts.isPropertyDeclaration(parent) && !ts.isPropertyAssignment(parent)) {
    return false
  }

  const typeName = enclosingTypeName(parent)

  return typeName === 'RuntimeCapabilities' || typeName === 'RuntimeCapabilityKey'
}

function isFixedOsRequirementOrCapability(node: ts.StringLiteralLike | ts.TemplateLiteralToken): boolean {
  const typeName = enclosingTypeName(node)

  if (typeName === 'IrRuntimeRequirement' || typeName === 'RuntimeCapabilityKey') {
    return true
  }

  const call = enclosingCallExpression(node)

  if (call) {
    const callee = call.expression.getText()

    if (callee === 'pushCapability' || callee.endsWith('runtimeRequirements.has')) {
      return true
    }
  }

  const binary = enclosingBinaryExpression(node)

  if (binary) {
    const left = binary.left.getText()
    const right = binary.right.getText()

    return left === 'key' || right === 'key'
  }

  return false
}

function enclosingTypeName(node: ts.Node): string | null {
  let current: ts.Node | undefined = node.parent

  while (current) {
    if (ts.isTypeAliasDeclaration(current) || ts.isInterfaceDeclaration(current)) {
      return current.name.text
    }

    if (ts.isSourceFile(current)) {
      return null
    }

    current = current.parent
  }

  return null
}

function enclosingCallExpression(node: ts.Node): ts.CallExpression | null {
  let current: ts.Node | undefined = node.parent

  while (current) {
    if (ts.isCallExpression(current)) {
      return current
    }

    if (ts.isStatement(current)) {
      return null
    }

    current = current.parent
  }

  return null
}

function enclosingBinaryExpression(node: ts.Node): ts.BinaryExpression | null {
  let current: ts.Node | undefined = node.parent

  while (current) {
    if (ts.isBinaryExpression(current)) {
      return current
    }

    if (ts.isStatement(current)) {
      return null
    }

    current = current.parent
  }

  return null
}

function addSemanticTail(
  result: SemanticTail[],
  seen: Set<string>,
  sourceFile: ts.SourceFile,
  node: ts.Node,
  rule: string
): void {
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
  const file = projectPath(sourceFile.fileName)
  const key = `${file}:${position.line}:${position.character}:${rule}`

  if (seen.has(key)) {
    return
  }

  seen.add(key)
  result.push({
    column: position.character + 1,
    file,
    line: position.line + 1,
    rule,
    text: node.getText(sourceFile)
  })
}

function compareSemanticTails(left: SemanticTail, right: SemanticTail): number {
  const fileOrder = left.file.localeCompare(right.file)

  if (fileOrder !== 0) {
    return fileOrder
  }

  if (left.line !== right.line) {
    return left.line - right.line
  }

  if (left.column !== right.column) {
    return left.column - right.column
  }

  return left.rule.localeCompare(right.rule)
}

function projectPath(path: string): string {
  return relative(projectRoot, path).split(sep).join('/')
}
