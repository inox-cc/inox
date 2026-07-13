import { diagnostic, throwDiagnostics } from './diagnostics.ts'
import { collectIrGlobalUsages } from './ir.ts'
import { isTimerRuntimeMethod } from './stdlib/node/descriptor.ts'
import { timeRuntimeCapabilityFromPath } from '../stdlib/global/compiler/descriptor.ts'
import type {
  AnyNode,
  CompileOptions,
  Diagnostic,
  IrGlobalUsage,
  IrProgram,
  RuntimeCapabilities,
  SourceLocation
} from './types.ts'

type NodeList = AnyNode[]

type CapabilityNode = AnyNode & {
  callee?: CapabilityMemberNode | null
  libraryCapabilities?: string[] | null
  libraryOperationId?: string | null
  loc?: SourceLocation
  timeRuntimeMethod?: string | null
  timerRuntimeMethod?: string | null
  type?: string | null
  valueType?: string | null
}

type CapabilityArrayDeclarationNode = {
  loweredArrayMethod: boolean
  loweredArrayMethodName?: string | null
}

type CapabilityMemberNode = AnyNode & {
  property?: string | null
  type?: string | null
}

type RuntimeCapabilityKey = string

type RequiredCapability = {
  key: RuntimeCapabilityKey
  name: string
}

type CapabilityUsage = RequiredCapability & {
  loc?: SourceLocation
  path: string
}

type StringSet = Set<string>

function capabilityNodeAt(values: NodeList, index: number): AnyNode {
  return values[index]
}

function capabilityUsageAt(values: CapabilityUsage[], index: number): CapabilityUsage {
  return values[index]
}

function globalUsageAt(values: IrGlobalUsage[], index: number): IrGlobalUsage {
  return values[index]
}

function programAt(values: IrProgram[], index: number): IrProgram {
  return values[index]
}

export function checkCProfileCapabilities(programs: IrProgram[], options: CompileOptions): void {
  if (options.profile !== 'embedded') {
    return
  }

  const diagnostics: Diagnostic[] = []
  const reported = createStringSet()

  const usages = collectCapabilityUsages(programs, options)

  for (let index = 0; index < usages.length; index = index + 1) {
    const usage = capabilityUsageAt(usages, index)

    if (capabilityEnabled(options.capabilities, usage.key)) {
      continue
    }

    const key = `${usage.key}:${usage.path}:${locationKey(usage.loc)}`

    if (reported.has(key)) {
      continue
    }

    diagnostics.push(
      diagnostic('INOX_CAPABILITY', `embedded profile requires ${usage.name} capability for ${usage.path}`, usage.loc)
    )
    reported.add(key)
  }

  throwDiagnostics(diagnostics)
}

function collectCapabilityUsages(programs: IrProgram[], options: CompileOptions): CapabilityUsage[] {
  const globalUsages = collectIrGlobalUsages(programs)
  const usages: CapabilityUsage[] = []

  for (let usageIndex = 0; usageIndex < globalUsages.length; usageIndex = usageIndex + 1) {
    const usage = globalUsageAt(globalUsages, usageIndex)
    const required = requiredCapabilityForGlobalUsage(usage)

    if (required !== null && typeof required !== 'undefined') {
      pushCapabilityUsage(usages, required, dotPath(usage.path), usage.loc)
    }
  }

  collectEntropyCapabilityUsages(globalUsages, options, usages)

  for (let programIndex = 0; programIndex < programs.length; programIndex = programIndex + 1) {
    const program = programAt(programs, programIndex)
    visitCapabilityNode(program.body, usages)
  }

  return usages
}

function collectEntropyCapabilityUsages(
  globalUsages: IrGlobalUsage[],
  options: CompileOptions,
  usages: CapabilityUsage[]
): void {
  const random = options.random

  for (let usageIndex = 0; usageIndex < globalUsages.length; usageIndex = usageIndex + 1) {
    const usage = globalUsageAt(globalUsages, usageIndex)
    const path = dotPath(usage.path)

    if (path === 'Math.random' && random !== null && typeof random !== 'undefined' && random.backend === 'os') {
      pushCapability(usages, 'entropy', 'entropy', path, usage.loc)
    }
  }
}

function visitCapabilityNode(node: AnyNode | NodeList | null | undefined, usages: CapabilityUsage[]): void {
  if (node === null || typeof node === 'undefined') {
    return
  }

  if (Array.isArray(node)) {
    for (let index = 0; index < node.length; index = index + 1) {
      const item = capabilityNodeAt(node, index)
      visitCapabilityNode(item, usages)
    }
    return
  }

  const item = node as CapabilityNode

  recordNodeCapabilityUsages(item, usages)
  visitCapabilityChildren(item, usages)
}

function visitCapabilityChild(value: any, usages: CapabilityUsage[]): void {
  if (value === null || typeof value === 'undefined' || typeof value !== 'object') {
    return
  }

  visitCapabilityNode(value, usages)
}

function visitCapabilityChildren(item: CapabilityNode, usages: CapabilityUsage[]): void {
  visitCapabilityChild(item.body, usages)
  visitCapabilityChild(item.params, usages)
  visitCapabilityChild(item.fields, usages)
  visitCapabilityChild(item.methods, usages)
  visitCapabilityChild(item.init, usages)
  visitCapabilityChild(item.condition, usages)
  visitCapabilityChild(item.consequent, usages)
  visitCapabilityChild(item.alternate, usages)
  visitCapabilityChild(item.test, usages)
  visitCapabilityChild(item.update, usages)
  visitCapabilityChild(item.iterable, usages)
  visitCapabilityChild(item.discriminant, usages)
  visitCapabilityChild(item.cases, usages)
  visitCapabilityChild(item.block, usages)
  visitCapabilityChild(item.handler, usages)
  visitCapabilityChild(item.finalizer, usages)
  visitCapabilityChild(item.argument, usages)
  visitCapabilityChild(item.args, usages)
  visitCapabilityChild(item.callee, usages)
  visitCapabilityChild(item.object, usages)
  visitCapabilityChild(item.index, usages)
  visitCapabilityChild(item.target, usages)
  visitCapabilityChild(item.value, usages)
  visitCapabilityChild(item.valueType, usages)
  visitCapabilityChild(item.functionType, usages)
  visitCapabilityChild(item.returnShape, usages)
  visitCapabilityChild(item.left, usages)
  visitCapabilityChild(item.right, usages)
  visitCapabilityChild(item.elements, usages)
  visitCapabilityChild(item.properties, usages)
  visitCapabilityChild(item.expression, usages)
}

function recordNodeCapabilityUsages(expression: CapabilityNode, usages: CapabilityUsage[]): void {
  const loc = expression.loc
  const libraryCapabilities = expression.libraryCapabilities
  const libraryOperationId = expression.libraryOperationId

  if (libraryCapabilities !== null && typeof libraryCapabilities !== 'undefined') {
    let path = 'compiler-library operation'

    if (libraryOperationId !== null && typeof libraryOperationId !== 'undefined') {
      path = libraryOperationId
    }

    for (let index = 0; index < libraryCapabilities.length; index = index + 1) {
      const capability = libraryCapabilities[index]

      pushCapability(usages, capability, capability, path, loc)
    }
  }

  const timerMethod = expression.timerRuntimeMethod

  if (timerMethod !== null && typeof timerMethod !== 'undefined') {
    pushCapability(usages, 'timers', 'timers', timerMethod, loc)
  }

  const timeMethod = expression.timeRuntimeMethod

  if (timeMethod === 'dateConstructor' && capabilityArgCount(expression) === 0) {
    pushCapability(usages, 'wallClock', 'wall-clock', 'Date', loc)
  } else if (timeMethod === 'dateNow') {
    pushCapability(usages, 'wallClock', 'wall-clock', 'Date.now', loc)
  } else if (timeMethod === 'performanceNow') {
    pushCapability(usages, 'monotonicClock', 'monotonic-clock', 'performance.now', loc)
  }

  const arrayMethod = arrayProducingMethodName(expression)

  if (arrayMethod !== null && typeof arrayMethod !== 'undefined') {
    pushCapability(usages, 'heap', 'heap', `Array.${arrayMethod}`, loc)
  }
}

function capabilityArgCount(expression: CapabilityNode): number {
  const args = expression.args

  if (Array.isArray(args)) {
    return args.length
  }

  return 0
}

function requiredCapabilityForGlobalUsage(usage: IrGlobalUsage): RequiredCapability | null {
  const timeCapability = timeRuntimeCapabilityFromPath(usage.path)
  const path = dotPath(usage.path)

  if (timeCapability !== null && typeof timeCapability !== 'undefined') {
    return timeCapability
  }

  if (isTimerRuntimeMethod(path)) {
    return {
      key: 'timers',
      name: 'timers'
    }
  }

  return null
}

function arrayProducingMethodName(expression: CapabilityNode): string | null {
  const expressionType = expression.type

  if (expressionType === 'VariableDeclaration') {
    const declaration = expression as CapabilityArrayDeclarationNode
    const isLoweredArrayMethod = declaration.loweredArrayMethod

    if (isLoweredArrayMethod !== true) {
      return null
    }

    const method = declaration.loweredArrayMethodName

    if (method === 'filter' || method === 'map') {
      return method
    }
  }

  if (expressionType !== 'CallExpression' || expression.valueType !== 'array') {
    return null
  }

  const callee = expression.callee

  if (callee === null || typeof callee === 'undefined' || callee.type !== 'MemberExpression') {
    return null
  }

  const property = callee.property

  if (property === 'filter' || property === 'map') {
    return property
  }

  return null
}

function locationKey(loc: SourceLocation | undefined): string {
  if (loc === null || typeof loc === 'undefined') {
    return '1:1'
  }

  return `${loc.line}:${loc.column}`
}

function capabilityEnabled(capabilities: RuntimeCapabilities | null | undefined, key: RuntimeCapabilityKey): boolean {
  if (capabilities === null || typeof capabilities === 'undefined') {
    return false
  }

  return capabilities[key] === true
}

function pushCapabilityUsage(
  usages: CapabilityUsage[],
  required: RequiredCapability,
  path: string,
  loc: SourceLocation | undefined
): void {
  pushCapability(usages, required.key, required.name, path, loc)
}

function pushCapability(
  usages: CapabilityUsage[],
  key: RuntimeCapabilityKey,
  name: string,
  path: string,
  loc: SourceLocation | undefined
): void {
  usages.push({
    key,
    name,
    path,
    loc
  })
}

function dotPath(path: string[]): string {
  let result = ''

  for (let index = 0; index < path.length; index = index + 1) {
    if (index === 0) {
      result = path[index]
    } else {
      result = `${result}.${path[index]}`
    }
  }

  return result
}

function createStringSet(): StringSet {
  const set: StringSet = new Set()
  return set
}
