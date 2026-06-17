import { diagnostic, throwDiagnostics } from './diagnostics.ts'
import { collectIrGlobalUsages } from './ir.ts'
import { isCryptoRuntimeMethodPath } from './stdlib/descriptors/crypto.ts'
import { timeRuntimeCapabilityFromPath } from './stdlib/descriptors/time.ts'
import { isTimerRuntimeMethod } from './stdlib/descriptors/timers.ts'
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

type RuntimeCapabilityKey =
  | 'entropy'
  | 'fs'
  | 'heap'
  | 'monotonicClock'
  | 'os'
  | 'timers'
  | 'wallClock'

type RequiredCapability = {
  key: RuntimeCapabilityKey
  name: string
}

type CapabilityUsage = RequiredCapability & {
  loc?: SourceLocation
  path: string
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

export function checkCProfileCapabilities(programs: IrProgram[], options: CompileOptions): void {
  if (options.profile !== 'embedded') {
    return
  }

  const diagnostics: Diagnostic[] = []
  const reported = createStringSet()

  for (const usage of collectCapabilityUsages(programs, options)) {
    if (capabilityEnabled(options.capabilities, usage.key)) {
      continue
    }

    const key = `${usage.key}:${usage.path}:${locationKey(usage.loc)}`

    if (reported.has(key)) {
      continue
    }

    diagnostics.push(
      diagnostic('CCJS_CAPABILITY', `embedded profile requires ${usage.name} capability for ${usage.path}`, usage.loc)
    )
    reported.add(key)
  }

  throwDiagnostics(diagnostics)
}

function collectCapabilityUsages(programs: IrProgram[], options: CompileOptions): CapabilityUsage[] {
  const globalUsages = collectIrGlobalUsages(programs)
  const usages: CapabilityUsage[] = []

  for (const usage of globalUsages) {
    const required = requiredCapabilityForGlobalUsage(usage)

    if (required != null) {
      pushCapabilityUsage(usages, required, dotPath(usage.path), usage.loc)
    }
  }

  collectEntropyCapabilityUsages(globalUsages, options, usages)

  for (const program of programs) {
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

  for (const usage of globalUsages) {
    const path = dotPath(usage.path)

    if (path === 'Math.random' && random != null && random.backend === 'os') {
      pushCapability(usages, 'entropy', 'entropy', path, usage.loc)
    } else if (isCryptoRuntimeMethodPath(usage.path)) {
      pushCapability(usages, 'entropy', 'entropy', path, usage.loc)
    }
  }
}

function visitCapabilityNode(node: AnyNode | NodeList | null | undefined, usages: CapabilityUsage[]): void {
  if (node == null) {
    return
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      visitCapabilityNode(item, usages)
    }
    return
  }

  recordNodeCapabilityUsages(node, usages)
  visitCapabilityChildren(node, usages)
}

function visitCapabilityChildren(item: AnyNode, usages: CapabilityUsage[]): void {
  for (const key of NODE_CHILD_KEYS) {
    const value = item[key]

    if (value != null) {
      visitCapabilityNode(value, usages)
    }
  }
}

function recordNodeCapabilityUsages(expression: AnyNode, usages: CapabilityUsage[]): void {
  const osMethod = expression.osRuntimeMethod
  const osConstant = expression.osRuntimeConstant

  if (osMethod != null) {
    pushCapability(usages, 'os', 'os', `os.${osMethod}`, expression.loc)
  } else if (osConstant != null) {
    pushCapability(usages, 'os', 'os', `os.${osConstant}`, expression.loc)
  }

  const timerMethod = expression.timerRuntimeMethod

  if (timerMethod != null) {
    pushCapability(usages, 'timers', 'timers', timerMethod, expression.loc)
  }

  const arrayMethod = arrayProducingMethodName(expression)

  if (arrayMethod != null) {
    pushCapability(usages, 'heap', 'heap', `Array.${arrayMethod}`, expression.loc)
  }
}

function requiredCapabilityForGlobalUsage(usage: IrGlobalUsage): RequiredCapability | null {
  const timeCapability = timeRuntimeCapabilityFromPath(usage.path)
  const path = dotPath(usage.path)

  if (timeCapability != null) {
    return timeCapability
  }

  if (usage.root === 'fs') {
    return {
      key: 'fs',
      name: 'filesystem'
    }
  }

  if (isTimerRuntimeMethod(path)) {
    return {
      key: 'timers',
      name: 'timers'
    }
  }

  return null
}

function arrayProducingMethodName(expression: AnyNode): string | null {
  if (expression.type === 'VariableDeclaration' && expression.loweredArrayMethod === true) {
    const method = expression.loweredArrayMethodName

    if (method === 'filter' || method === 'map') {
      return method
    }
  }

  if (expression.type !== 'CallExpression' || expression.valueType !== 'array') {
    return null
  }

  if (expression.callee == null || expression.callee.type !== 'MemberExpression') {
    return null
  }

  if (expression.callee.property === 'filter' || expression.callee.property === 'map') {
    return expression.callee.property
  }

  return null
}

function locationKey(loc: SourceLocation | undefined): string {
  if (loc == null) {
    return '1:1'
  }

  return `${loc.line}:${loc.column}`
}

function capabilityEnabled(
  capabilities: RuntimeCapabilities | null | undefined,
  key: RuntimeCapabilityKey
): boolean {
  if (capabilities == null) {
    return false
  }

  if (key === 'entropy') {
    return capabilities.entropy === true
  }

  if (key === 'fs') {
    return capabilities.fs === true
  }

  if (key === 'heap') {
    return capabilities.heap === true
  }

  if (key === 'monotonicClock') {
    return capabilities.monotonicClock === true
  }

  if (key === 'os') {
    return capabilities.os === true
  }

  if (key === 'timers') {
    return capabilities.timers === true
  }

  if (key === 'wallClock') {
    return capabilities.wallClock === true
  }

  return false
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
