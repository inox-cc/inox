import type { AnyNode } from '../types.ts'

export function collectCReferencedFunctionPrototypeNames(
  node: AnyNode,
  functionNames: Set<string>,
  target: Set<string>
): void {
  collectCReferencedFunctionPrototypeNamesFromValue(node, functionNames, target)
}

function collectCReferencedFunctionPrototypeNamesFromValue(
  value: unknown,
  functionNames: Set<string>,
  target: Set<string>
): void {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index = index + 1) {
      collectCReferencedFunctionPrototypeNamesFromValue(value[index], functionNames, target)
    }

    return
  }

  if (!cPrototypeReferenceIsRecord(value)) {
    return
  }

  const node = value as AnyNode

  if (node.type === 'Reference' && Array.isArray(node.path) && typeof node.path[0] === 'string') {
    const name = node.path[0]

    if (functionNames.has(name)) {
      target.add(name)
    }
  }

  if (node.type === 'TemplateLiteral' && typeof node.raw === 'string') {
    collectCTemplateReferencedFunctionNames(node.raw, functionNames, target)
  }

  collectCReferencedFunctionPrototypeChildNames(node, functionNames, target)
}

function collectCReferencedFunctionPrototypeChildNames(
  item: AnyNode,
  functionNames: Set<string>,
  target: Set<string>
): void {
  collectCReferencedFunctionPrototypeNamesFromValue(item.body, functionNames, target)
  collectCReferencedFunctionPrototypeNamesFromValue(item.params, functionNames, target)
  collectCReferencedFunctionPrototypeNamesFromValue(item.fields, functionNames, target)
  collectCReferencedFunctionPrototypeNamesFromValue(item.methods, functionNames, target)
  collectCReferencedFunctionPrototypeNamesFromValue(item.init, functionNames, target)
  collectCReferencedFunctionPrototypeNamesFromValue(item.condition, functionNames, target)
  collectCReferencedFunctionPrototypeNamesFromValue(item.consequent, functionNames, target)
  collectCReferencedFunctionPrototypeNamesFromValue(item.alternate, functionNames, target)
  collectCReferencedFunctionPrototypeNamesFromValue(item.test, functionNames, target)
  collectCReferencedFunctionPrototypeNamesFromValue(item.update, functionNames, target)
  collectCReferencedFunctionPrototypeNamesFromValue(item.iterable, functionNames, target)
  collectCReferencedFunctionPrototypeNamesFromValue(item.discriminant, functionNames, target)
  collectCReferencedFunctionPrototypeNamesFromValue(item.cases, functionNames, target)
  collectCReferencedFunctionPrototypeNamesFromValue(item.block, functionNames, target)
  collectCReferencedFunctionPrototypeNamesFromValue(item.handler, functionNames, target)
  collectCReferencedFunctionPrototypeNamesFromValue(item.finalizer, functionNames, target)
  collectCReferencedFunctionPrototypeNamesFromValue(item.argument, functionNames, target)
  collectCReferencedFunctionPrototypeNamesFromValue(item.args, functionNames, target)
  collectCReferencedFunctionPrototypeNamesFromValue(item.callee, functionNames, target)
  collectCReferencedFunctionPrototypeNamesFromValue(item.object, functionNames, target)
  collectCReferencedFunctionPrototypeNamesFromValue(item.index, functionNames, target)
  collectCReferencedFunctionPrototypeNamesFromValue(item.target, functionNames, target)
  collectCReferencedFunctionPrototypeNamesFromValue(item.value, functionNames, target)
  collectCReferencedFunctionPrototypeNamesFromValue(item.left, functionNames, target)
  collectCReferencedFunctionPrototypeNamesFromValue(item.right, functionNames, target)
  collectCReferencedFunctionPrototypeNamesFromValue(item.elements, functionNames, target)
  collectCReferencedFunctionPrototypeNamesFromValue(item.properties, functionNames, target)
  collectCReferencedFunctionPrototypeNamesFromValue(item.expression, functionNames, target)
  collectCReferencedFunctionPrototypeNamesFromValue(item.expressions, functionNames, target)
  collectCReferencedFunctionPrototypeNamesFromValue(item.declaration, functionNames, target)
  collectCReferencedFunctionPrototypeNamesFromValue(item.awaitedExpression, functionNames, target)
  collectCReferencedFunctionPrototypeNamesFromValue(item.awaitedPromiseExpression, functionNames, target)
  collectCReferencedFunctionPrototypeNamesFromValue(item.prefixStatements, functionNames, target)
  collectCReferencedFunctionPrototypeNamesFromValue(item.returnExpression, functionNames, target)
  collectCReferencedFunctionPrototypeNamesFromValue(item.successPhases, functionNames, target)
  collectCReferencedFunctionPrototypeNamesFromValue(item.tryHandler, functionNames, target)
  collectCReferencedFunctionPrototypeNamesFromValue(item.tryPhases, functionNames, target)
  collectCReferencedFunctionPrototypeNamesFromValue(item.statements, functionNames, target)
}

function cPrototypeReferenceIsRecord(value: unknown): boolean {
  return typeof value === 'object' && value !== null
}

function collectCTemplateReferencedFunctionNames(raw: string, functionNames: Set<string>, target: Set<string>): void {
  if (!raw.includes('${')) {
    return
  }

  let start = raw.indexOf('${')

  while (start >= 0) {
    const end = cTemplatePlaceholderEnd(raw, start + 2)

    if (end < 0) {
      return
    }

    collectCTextReferencedFunctionNames(raw.slice(start + 2, end), functionNames, target)
    start = raw.indexOf('${', end + 1)
  }
}

function collectCTextReferencedFunctionNames(text: string, functionNames: Set<string>, target: Set<string>): void {
  let index = 0
  let quote = ''

  while (index < text.length) {
    const char = text[index]

    if (quote !== '') {
      if (char === '\\') {
        index = index + 2
        continue
      }

      if (char === quote) {
        quote = ''
      }

      index = index + 1
      continue
    }

    if (char === '"' || char === "'" || char === '`') {
      quote = char
      index = index + 1
      continue
    }

    if (!cIdentifierChar(char)) {
      index = index + 1
      continue
    }

    const start = index

    while (index < text.length && cIdentifierChar(text[index])) {
      index = index + 1
    }

    const name = text.slice(start, index)

    if (functionNames.has(name)) {
      target.add(name)
    }
  }
}

function cTemplatePlaceholderEnd(raw: string, start: number): number {
  let depth = 1
  let quote = ''
  let index = start

  while (index < raw.length) {
    const char = raw[index]

    if (quote !== '') {
      if (char === '\\') {
        index = index + 2
        continue
      }

      if (char === quote) {
        quote = ''
      }

      index = index + 1
      continue
    }

    if (char === '"' || char === "'" || char === '`') {
      quote = char
      index = index + 1
      continue
    }

    if (char === '{') {
      depth = depth + 1
    } else if (char === '}') {
      depth = depth - 1

      if (depth === 0) {
        return index
      }
    }

    index = index + 1
  }

  return -1
}

function cIdentifierChar(value: string): boolean {
  return 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_'.indexOf(value) >= 0
}
