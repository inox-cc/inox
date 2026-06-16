import { fsGlobalUsagePathForRuntimeMethod } from '../stdlib/descriptors/fs.ts'
import type { AnyNode, IrGlobalUsage, ProgramNode } from '../types.ts'

type NodeList = AnyNode[]

type IrProgramWithGlobalUsages = {
  globalUsages: IrGlobalUsage[]
}

type StringSet = Set<string>

const NODE_CHILD_KEYS = [
  'body',
  'params',
  'fields',
  'methods',
  'init',
  'condition',
  'consequent',
  'alternate',
  'test',
  'update',
  'iterable',
  'discriminant',
  'cases',
  'block',
  'handler',
  'finalizer',
  'argument',
  'args',
  'callee',
  'object',
  'index',
  'target',
  'value',
  'valueType',
  'functionType',
  'returnShape',
  'left',
  'right',
  'elements',
  'properties',
  'expression'
]

const jsStdGlobalRootNames = [
  'Array',
  'Buffer',
  'ccjs',
  'Date',
  'Error',
  'Int8Array',
  'Int16Array',
  'Int32Array',
  'JSON',
  'Map',
  'Math',
  'Promise',
  'Set',
  'Uint8Array',
  'Uint16Array',
  'Uint32Array',
  'crypto',
  'fetch',
  'fs',
  'http',
  'performance',
  'clearTimeout',
  'clearInterval',
  'clearImmediate',
  'setTimeout',
  'setInterval',
  'setImmediate'
]

const jsStdGlobalRoots = createStringSet(jsStdGlobalRootNames)

export function collectGlobalUsages(program: ProgramNode): IrGlobalUsage[] {
  const usages: IrGlobalUsage[] = []

  visitGlobalUsage(program, usages)

  return usages
}

export function collectIrGlobalUsages(programs: IrProgramWithGlobalUsages[]): IrGlobalUsage[] {
  const usages: IrGlobalUsage[] = []

  for (const program of programs) {
    for (const usage of program.globalUsages) {
      usages.push(usage)
    }
  }

  return usages
}

export function collectIrGlobalRoots(programs: IrProgramWithGlobalUsages[]): string[] {
  const roots = createStringSet([])

  for (const usage of collectIrGlobalUsages(programs)) {
    roots.add(usage.root)
  }

  return sortedStringSet(roots)
}

function visitGlobalUsage(node: AnyNode | NodeList | null | undefined, usages: IrGlobalUsage[]): void {
  if (node == null) {
    return
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      visitGlobalUsage(item, usages)
    }
    return
  }

  const item = node

  if (item.type === 'CallExpression' && item.fsRuntimeMethod != null) {
    const path = fsGlobalUsagePathForRuntimeMethod(item.fsRuntimeMethod)

    if (path != null) {
      pushGlobalUsage(usages, path, item)

      if (item.args != null) {
        for (const arg of item.args) {
          visitGlobalUsage(arg, usages)
        }
      }

      return
    }
  }

  if (item.type === 'MemberExpression' || item.type === 'OptionalMemberExpression') {
    const path = globalUsagePath(item)

    if (path != null) {
      pushGlobalUsage(usages, path, item)
      return
    }
  }

  if (item.type === 'IndexExpression' || item.type === 'OptionalIndexExpression') {
    const path = globalUsagePath(item.object)

    if (path != null) {
      pushGlobalUsage(usages, path, item)
      visitGlobalUsage(item.index, usages)
      return
    }
  }

  if (item.type === 'Reference') {
    const root = firstString(item.path)

    if (root != null && jsStdGlobalRoots.has(root)) {
      usages.push({
        root,
        path: item.path,
        loc: item.loc
      })
      return
    }
  }

  visitGlobalUsageChildren(item, usages)
}

function visitGlobalUsageChildren(item: AnyNode, usages: IrGlobalUsage[]): void {
  for (const key of NODE_CHILD_KEYS) {
    const value = item[key]

    if (value != null) {
      visitGlobalUsage(value, usages)
    }
  }
}

function globalUsagePath(expression: AnyNode | null | undefined): string[] | null {
  if (expression == null) {
    return null
  }

  if (expression.type === 'Reference') {
    const root = firstString(expression.path)

    if (root != null && jsStdGlobalRoots.has(root)) {
      return expression.path
    }
  }

  if (expression.type === 'MemberExpression' || expression.type === 'OptionalMemberExpression') {
    const objectPath = globalUsagePath(expression.object)

    if (objectPath != null) {
      return appendString(objectPath, expression.property)
    }
  }

  return null
}

function pushGlobalUsage(usages: IrGlobalUsage[], path: string[], item: AnyNode): void {
  const root = firstString(path)

  if (root != null) {
    usages.push({
      root,
      path,
      loc: item.loc
    })
  }
}

function firstString(values: string[]): string | null {
  if (values.length === 0) {
    return null
  }

  return values[0]
}

function appendString(values: string[], value: string): string[] {
  const result = copyStrings(values)
  result.push(value)
  return result
}

function copyStrings(values: string[]): string[] {
  const result: string[] = []

  for (const value of values) {
    result.push(value)
  }

  return result
}

function createStringSet(values: string[]): StringSet {
  const set: StringSet = new Set()

  for (const value of values) {
    set.add(value)
  }

  return set
}

function sortedStringSet(values: StringSet): string[] {
  const result: string[] = []

  for (const value of values) {
    result.push(value)
  }

  result.sort()
  return result
}
