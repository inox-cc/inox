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

type GlobalUsageCallNode = {
  args?: NodeList | null
  fsRuntimeMethod?: string | null
}

type GlobalUsageIndexNode = {
  index?: GlobalUsageNode | null
  object?: GlobalUsageNode | null
}

type GlobalUsageReferenceNode = {
  path?: string[] | null
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
  const itemType = item.type

  const callItem = item as GlobalUsageCallNode
  const fsRuntimeMethod = callItem.fsRuntimeMethod

  if (itemType === 'CallExpression' && fsRuntimeMethod != null) {
    const path = fsGlobalUsagePathForRuntimeMethod(fsRuntimeMethod)

    if (path != null) {
      pushGlobalUsage(usages, path, item)

      const args = callItem.args
      visitOptionalGlobalUsageList(args, usages)

      return
    }
  }

  if (itemType === 'MemberExpression' || itemType === 'OptionalMemberExpression') {
    const path = globalUsagePath(item)

    if (path != null) {
      pushGlobalUsage(usages, path, item)
      return
    }
  }

  if (itemType === 'IndexExpression' || itemType === 'OptionalIndexExpression') {
    const indexItem = item as GlobalUsageIndexNode
    const objectNode = indexItem.object

    if (objectNode != null) {
      const path = globalUsagePath(objectNode)

      if (path != null) {
        pushGlobalUsage(usages, path, item)
        const indexNode = indexItem.index
        visitGlobalUsage(indexNode, usages)
        return
      }
    }
  }

  if (itemType === 'Reference') {
    const referenceItem = item as GlobalUsageReferenceNode
    const path = referenceItem.path

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

  pushStringIfPresent(values, result, 'Array')
  pushStringIfPresent(values, result, 'Buffer')
  pushStringIfPresent(values, result, 'Date')
  pushStringIfPresent(values, result, 'Error')
  pushStringIfPresent(values, result, 'Int16Array')
  pushStringIfPresent(values, result, 'Int32Array')
  pushStringIfPresent(values, result, 'Int8Array')
  pushStringIfPresent(values, result, 'JSON')
  pushStringIfPresent(values, result, 'Map')
  pushStringIfPresent(values, result, 'Math')
  pushStringIfPresent(values, result, 'Promise')
  pushStringIfPresent(values, result, 'Set')
  pushStringIfPresent(values, result, 'Uint16Array')
  pushStringIfPresent(values, result, 'Uint32Array')
  pushStringIfPresent(values, result, 'Uint8Array')
  pushStringIfPresent(values, result, 'ccjs')
  pushStringIfPresent(values, result, 'clearImmediate')
  pushStringIfPresent(values, result, 'clearInterval')
  pushStringIfPresent(values, result, 'clearTimeout')
  pushStringIfPresent(values, result, 'crypto')
  pushStringIfPresent(values, result, 'fetch')
  pushStringIfPresent(values, result, 'fs')
  pushStringIfPresent(values, result, 'http')
  pushStringIfPresent(values, result, 'performance')
  pushStringIfPresent(values, result, 'setImmediate')
  pushStringIfPresent(values, result, 'setInterval')
  pushStringIfPresent(values, result, 'setTimeout')

  return result
}

function pushStringIfPresent(values: StringSet, result: string[], value: string): void {
  if (values.has(value)) {
    result.push(value)
  }
}
