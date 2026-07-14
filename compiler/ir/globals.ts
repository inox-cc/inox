import type { AnyNode, IrGlobalUsage, ProgramNode, SourceLocation } from '../types.ts'

type NodeList = AnyNode[]

type GlobalUsageNode = AnyNode & {
  args?: AnyNode[] | null
  index?: AnyNode | null
  loc?: SourceLocation
  libraryOperationId?: string | null
  libraryReceiverTypeId?: string | null
  object?: AnyNode | null
  path?: string[]
  property?: string | null
  type?: string | null
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

  const result = sortedStringSet(roots)

  return result
}

function visitGlobalUsage(node: AnyNode | NodeList | null | undefined, usages: IrGlobalUsage[]): void {
  if (node === null || typeof node === 'undefined') {
    return
  }

  if (Array.isArray(node)) {
    visitGlobalUsageList(node, usages)
    return
  }

  const item: GlobalUsageNode = node
  const itemType = item.type

  if (item.libraryOperationId !== null && typeof item.libraryOperationId !== 'undefined') {
    visitCompilerLibraryOperationChildren(item, usages)
    return
  }

  if (itemType === 'MemberExpression' || itemType === 'OptionalMemberExpression') {
    const path = globalUsagePath(item)

    if (path !== null && typeof path !== 'undefined') {
      pushGlobalUsage(usages, path, item)
      return
    }
  }

  if (itemType === 'IndexExpression' || itemType === 'OptionalIndexExpression') {
    const indexItem = item as GlobalUsageIndexNode
    const objectNode = indexItem.object

    if (objectNode !== null && typeof objectNode !== 'undefined') {
      const path = globalUsagePath(objectNode)

      if (path !== null && typeof path !== 'undefined') {
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

    if (path === null || typeof path === 'undefined') {
      visitGlobalUsageChildren(item, usages)
      return
    }

    const root = firstString(path)

    if (root !== null && typeof root !== 'undefined' && isJsStdGlobalRootName(root)) {
      pushGlobalUsage(usages, path, item)
      return
    }
  }

  visitGlobalUsageChildren(item, usages)
}

function visitCompilerLibraryOperationChildren(item: GlobalUsageNode, usages: IrGlobalUsage[]): void {
  visitGlobalUsageChild(item.args, usages)
  visitGlobalUsageChild(item.index, usages)
  visitGlobalUsageChild(item.value, usages)

  const receiverTypeId = item.libraryReceiverTypeId

  if (receiverTypeId === null || typeof receiverTypeId === 'undefined') {
    return
  }

  const receiver = compilerLibraryOperationReceiver(item)

  visitGlobalUsageChild(receiver, usages)

  if (item.type === 'AssignmentExpression') {
    visitGlobalUsageChild(item.target?.index, usages)
  }
}

function compilerLibraryOperationReceiver(item: GlobalUsageNode): AnyNode | null {
  if (item.type === 'CallExpression' || item.type === 'NewExpression') {
    const callee = item.callee

    if (
      callee !== null &&
      typeof callee !== 'undefined' &&
      (
        callee.type === 'MemberExpression' ||
        callee.type === 'OptionalMemberExpression' ||
        callee.type === 'IndexExpression' ||
        callee.type === 'OptionalIndexExpression'
      )
    ) {
      return callee.object ?? null
    }

    return null
  }

  if (item.type === 'AssignmentExpression') {
    return item.target?.object ?? null
  }

  return item.object ?? null
}

function visitGlobalUsageList(nodes: NodeList, usages: IrGlobalUsage[]): void {
  for (let index = 0; index < nodes.length; index = index + 1) {
    const item = nodes[index]
    visitGlobalUsage(item, usages)
  }
}

function visitGlobalUsageChild(value: any, usages: IrGlobalUsage[]): void {
  if (value === null || typeof value === 'undefined' || typeof value !== 'object') {
    return
  }

  visitGlobalUsage(value, usages)
}

function visitGlobalUsageChildren(item: GlobalUsageNode, usages: IrGlobalUsage[]): void {
  visitGlobalUsageChild(item.body, usages)
  visitGlobalUsageChild(item.params, usages)
  visitGlobalUsageChild(item.fields, usages)
  visitGlobalUsageChild(item.methods, usages)
  visitGlobalUsageChild(item.init, usages)
  visitGlobalUsageChild(item.condition, usages)
  visitGlobalUsageChild(item.consequent, usages)
  visitGlobalUsageChild(item.alternate, usages)
  visitGlobalUsageChild(item.test, usages)
  visitGlobalUsageChild(item.update, usages)
  visitGlobalUsageChild(item.iterable, usages)
  visitGlobalUsageChild(item.discriminant, usages)
  visitGlobalUsageChild(item.cases, usages)
  visitGlobalUsageChild(item.block, usages)
  visitGlobalUsageChild(item.handler, usages)
  visitGlobalUsageChild(item.finalizer, usages)
  visitGlobalUsageChild(item.argument, usages)
  visitGlobalUsageChild(item.args, usages)
  visitGlobalUsageChild(item.callee, usages)
  visitGlobalUsageChild(item.object, usages)
  visitGlobalUsageChild(item.index, usages)
  visitGlobalUsageChild(item.target, usages)
  visitGlobalUsageChild(item.value, usages)
  visitGlobalUsageChild(item.valueType, usages)
  visitGlobalUsageChild(item.functionType, usages)
  visitGlobalUsageChild(item.returnShape, usages)
  visitGlobalUsageChild(item.left, usages)
  visitGlobalUsageChild(item.right, usages)
  visitGlobalUsageChild(item.elements, usages)
  visitGlobalUsageChild(item.properties, usages)
  visitGlobalUsageChild(item.expression, usages)
}

function globalUsagePath(expression: GlobalUsageNode | null | undefined): string[] | null {
  if (expression === null || typeof expression === 'undefined') {
    return null
  }

  if (expression.type === 'Reference') {
    const path = expression.path

    if (path === null || typeof path === 'undefined') {
      return null
    }

    const root = firstString(path)

    if (root !== null && typeof root !== 'undefined' && isJsStdGlobalRootName(root)) {
      return path
    }
  }

  if (expression.type === 'MemberExpression' || expression.type === 'OptionalMemberExpression') {
    const objectNode = expression.object

    if (objectNode !== null && typeof objectNode !== 'undefined') {
      const objectPath = globalUsagePath(objectNode)

      if (objectPath !== null && typeof objectPath !== 'undefined') {
        const property = expression.property

        if (property !== null && typeof property !== 'undefined') {
          return appendString(objectPath, property)
        }
      }
    }
  }

  return null
}

function pushGlobalUsage(usages: IrGlobalUsage[], path: string[], item: GlobalUsageNode): void {
  const root = firstString(path)

  if (root !== null && typeof root !== 'undefined') {
    const loc = item.loc

    if (loc !== null && typeof loc !== 'undefined') {
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
    name === 'inox' ||
    name === 'Date' ||
    name === 'Error' ||
    name === 'Int8Array' ||
    name === 'Int16Array' ||
    name === 'Int32Array' ||
    name === 'JSON' ||
    name === 'Map' ||
    name === 'Object' ||
    name === 'Promise' ||
    name === 'Set' ||
    name === 'Uint16Array' ||
    name === 'Uint32Array' ||
    name === 'fetch' ||
    name === 'performance'
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
  pushStringIfPresent(values, result, 'Date')
  pushStringIfPresent(values, result, 'Error')
  pushStringIfPresent(values, result, 'Int16Array')
  pushStringIfPresent(values, result, 'Int32Array')
  pushStringIfPresent(values, result, 'Int8Array')
  pushStringIfPresent(values, result, 'JSON')
  pushStringIfPresent(values, result, 'Map')
  pushStringIfPresent(values, result, 'Object')
  pushStringIfPresent(values, result, 'Promise')
  pushStringIfPresent(values, result, 'Set')
  pushStringIfPresent(values, result, 'Uint16Array')
  pushStringIfPresent(values, result, 'Uint32Array')
  pushStringIfPresent(values, result, 'fetch')
  pushStringIfPresent(values, result, 'inox')
  pushStringIfPresent(values, result, 'performance')

  return result
}

function pushStringIfPresent(values: StringSet, result: string[], value: string): void {
  if (values.has(value)) {
    result.push(value)
  }
}
