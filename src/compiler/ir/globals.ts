import { fsGlobalUsagePathForRuntimeMethod } from '../stdlib/descriptors/fs.ts'
import type { AnyNode, IrGlobalUsage, ProgramNode, SourceLocation } from '../types.ts'

type NodeList = AnyNode[]

type GlobalUsageNode = AnyNode & {
  args?: AnyNode[] | null
  fsRuntimeMethod?: string | null
  index?: AnyNode | null
  loc?: SourceLocation
  object?: AnyNode | null
  path?: string[]
  property?: string | null
  type?: string | null
}

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

export function collectGlobalUsages(program: ProgramNode): IrGlobalUsage[] {
  const usages: IrGlobalUsage[] = []

  visitGlobalUsage(program, usages)

  return usages
}

export function collectIrGlobalUsages(programs: IrProgramWithGlobalUsages[]): IrGlobalUsage[] {
  const usages: IrGlobalUsage[] = []

  for (let programIndex = 0; programIndex < programs.length; programIndex = programIndex + 1) {
    const program = programs[programIndex]
    const globalUsages = program.globalUsages

    for (let usageIndex = 0; usageIndex < globalUsages.length; usageIndex = usageIndex + 1) {
      const usage = globalUsages[usageIndex]
      usages.push(usage)
    }
  }

  return usages
}

export function collectIrGlobalRoots(programs: IrProgramWithGlobalUsages[]): string[] {
  const roots = createStringSet([])
  const usages = collectIrGlobalUsages(programs)

  for (let index = 0; index < usages.length; index = index + 1) {
    const usage = usages[index]
    roots.add(usage.root)
  }

  return sortedStringSet(roots)
}

function visitGlobalUsage(node: AnyNode | NodeList | null | undefined, usages: IrGlobalUsage[]): void {
  if (node == null) {
    return
  }

  if (Array.isArray(node)) {
    visitGlobalUsageList(node, usages)
    return
  }

  const item: GlobalUsageNode = node

  if (item.type === 'CallExpression' && item.fsRuntimeMethod != null) {
    const path = fsGlobalUsagePathForRuntimeMethod(item.fsRuntimeMethod)

    if (path != null) {
      pushGlobalUsage(usages, path, item)

      visitOptionalGlobalUsageList(item.args, usages)

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
    const objectNode = item.object

    if (objectNode != null) {
      const path = globalUsagePath(objectNode)

      if (path != null) {
        pushGlobalUsage(usages, path, item)
        visitGlobalUsage(item.index, usages)
        return
      }
    }
  }

  if (item.type === 'Reference') {
    const path = item.path

    if (path == null) {
      visitGlobalUsageChildren(item, usages)
      return
    }

    const root = firstString(path)

    if (root != null && isJsStdGlobalRootName(root)) {
      pushGlobalUsage(usages, path, item)
      return
    }
  }

  visitGlobalUsageChildren(item, usages)
}

function visitGlobalUsageList(nodes: NodeList, usages: IrGlobalUsage[]): void {
  for (let index = 0; index < nodes.length; index = index + 1) {
    const item = nodes[index]
    visitGlobalUsage(item, usages)
  }
}

function visitOptionalGlobalUsageList(nodes: NodeList | null | undefined, usages: IrGlobalUsage[]): void {
  if (nodes == null) {
    return
  }

  visitGlobalUsageList(nodes, usages)
}

function visitGlobalUsageChildren(item: GlobalUsageNode, usages: IrGlobalUsage[]): void {
  for (let index = 0; index < NODE_CHILD_KEYS.length; index = index + 1) {
    const key = NODE_CHILD_KEYS[index]
    const value = item[key]

    if (value != null) {
      visitGlobalUsage(value, usages)
    }
  }
}

function globalUsagePath(expression: GlobalUsageNode | null | undefined): string[] | null {
  if (expression == null) {
    return null
  }

  if (expression.type === 'Reference') {
    const path = expression.path

    if (path == null) {
      return null
    }

    const root = firstString(path)

    if (root != null && isJsStdGlobalRootName(root)) {
      return path
    }
  }

  if (expression.type === 'MemberExpression' || expression.type === 'OptionalMemberExpression') {
    const objectNode = expression.object

    if (objectNode != null) {
      const objectPath = globalUsagePath(objectNode)

      if (objectPath != null) {
        const property = expression.property

        if (property != null) {
          return appendString(objectPath, property)
        }
      }
    }
  }

  return null
}

function pushGlobalUsage(usages: IrGlobalUsage[], path: string[], item: GlobalUsageNode): void {
  const root = firstString(path)

  if (root != null) {
    const loc = item.loc

    if (loc != null) {
      usages.push({
        root,
        path,
        loc
      })
    } else {
      usages.push({
        root,
        path
      })
    }
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

function isJsStdGlobalRootName(name: string): boolean {
  return (
    name === 'Array' ||
    name === 'Buffer' ||
    name === 'ccjs' ||
    name === 'Date' ||
    name === 'Error' ||
    name === 'Int8Array' ||
    name === 'Int16Array' ||
    name === 'Int32Array' ||
    name === 'JSON' ||
    name === 'Map' ||
    name === 'Math' ||
    name === 'Promise' ||
    name === 'Set' ||
    name === 'Uint8Array' ||
    name === 'Uint16Array' ||
    name === 'Uint32Array' ||
    name === 'crypto' ||
    name === 'fetch' ||
    name === 'fs' ||
    name === 'http' ||
    name === 'performance' ||
    name === 'clearTimeout' ||
    name === 'clearInterval' ||
    name === 'clearImmediate' ||
    name === 'setTimeout' ||
    name === 'setInterval' ||
    name === 'setImmediate'
  )
}

function copyStrings(values: string[]): string[] {
  const result: string[] = []

  for (let index = 0; index < values.length; index = index + 1) {
    const value = values[index]
    result.push(value)
  }

  return result
}

function createStringSet(values: string[]): StringSet {
  const set: StringSet = new Set()

  for (let index = 0; index < values.length; index = index + 1) {
    const value = values[index]
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
