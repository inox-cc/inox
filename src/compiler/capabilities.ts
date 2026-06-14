import { visitAstLike } from './ast-visit.ts'
import { CompileError, diagnostic } from './diagnostics.ts'
import { collectIrGlobalUsages } from './ir.ts'
import { cryptoRuntimeMethodNameFromPath } from './stdlib/descriptors/crypto.ts'
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

type RequiredCapability = {
  key: keyof RuntimeCapabilities
  name: string
}

type CapabilityUsage = RequiredCapability & {
  loc?: SourceLocation
  path: string
}

export function checkCProfileCapabilities(programs: IrProgram[], options: CompileOptions): void {
  if (options.profile !== 'embedded') {
    return
  }

  const capabilities = options.capabilities ?? {}
  const diagnostics: Diagnostic[] = []
  const reported = new Set<string>()

  for (const usage of collectCapabilityUsages(programs, options)) {
    if (capabilities[usage.key] === true) {
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

  if (diagnostics.length > 0) {
    throw new CompileError(diagnostics)
  }
}

function collectCapabilityUsages(programs: IrProgram[], options: CompileOptions): CapabilityUsage[] {
  const globalUsages = collectIrGlobalUsages(programs)

  return [
    ...globalUsages.flatMap((usage) => {
      const required = requiredCapabilityForGlobalUsage(usage)

      return required == null
        ? []
        : [
            {
              ...required,
              path: usage.path.join('.'),
              loc: usage.loc
            }
          ]
    }),
    ...collectEntropyCapabilityUsages(globalUsages, options),
    ...programs.flatMap((program) => collectHeapCapabilityUsages(program.body))
  ]
}

function collectEntropyCapabilityUsages(globalUsages: IrGlobalUsage[], options: CompileOptions): CapabilityUsage[] {
  const usages: CapabilityUsage[] = []

  for (const usage of globalUsages) {
    const path = usage.path.join('.')

    if (path === 'Math.random' && options.random?.backend === 'os') {
      usages.push({
        key: 'entropy',
        name: 'entropy',
        path,
        loc: usage.loc
      })
    } else if (cryptoRuntimeMethodNameFromPath(usage.path) != null) {
      usages.push({
        key: 'entropy',
        name: 'entropy',
        path,
        loc: usage.loc
      })
    }
  }

  return usages
}

function collectHeapCapabilityUsages(node: unknown): CapabilityUsage[] {
  const usages: CapabilityUsage[] = []

  visitAstLike(node, (item) => {
    const arrayMethod = arrayProducingMethodName(item as AnyNode)

    if (arrayMethod != null) {
      usages.push({
        key: 'heap',
        name: 'heap',
        path: `Array.${arrayMethod}`,
        loc: (item as AnyNode).loc
      })
    }
  })

  return usages
}

function requiredCapabilityForGlobalUsage(usage: IrGlobalUsage): RequiredCapability | null {
  const timeCapability = timeRuntimeCapabilityFromPath(usage.path)
  const path = usage.path.join('.')

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
  if (expression.type !== 'CallExpression' || expression.valueType !== 'array') {
    return null
  }

  if (expression.callee?.type !== 'MemberExpression') {
    return null
  }

  return ['filter', 'map'].includes(expression.callee.property) ? expression.callee.property : null
}

function locationKey(loc: SourceLocation | undefined): string {
  return `${loc?.line ?? 1}:${loc?.column ?? 1}`
}
