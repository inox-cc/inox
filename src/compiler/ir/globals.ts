import { fsGlobalUsagePathForRuntimeMethod } from '../stdlib/descriptors/fs.ts'
import type { AnyNode, IrGlobalUsage, ProgramNode } from '../types.ts'

const jsStdGlobalRoots = new Set([
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
])

export function collectGlobalUsages(program: ProgramNode): IrGlobalUsage[] {
  const usages: IrGlobalUsage[] = []

  visitGlobalUsage(program, usages)

  return usages
}

export function collectIrGlobalUsages(programs: Array<{ globalUsages: IrGlobalUsage[] }>): IrGlobalUsage[] {
  return programs.flatMap((program) => program.globalUsages)
}

export function collectIrGlobalRoots(programs: Array<{ globalUsages: IrGlobalUsage[] }>): string[] {
  return [...new Set(collectIrGlobalUsages(programs).map((usage) => usage.root))].sort()
}

function visitGlobalUsage(node: unknown, usages: IrGlobalUsage[]): void {
  if (node == null) {
    return
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      visitGlobalUsage(item, usages)
    }
    return
  }

  if (typeof node !== 'object') {
    return
  }

  const item = node as AnyNode

  if (item.type === 'CallExpression' && item.fsRuntimeMethod != null) {
    const path = fsGlobalUsagePathForRuntimeMethod(item.fsRuntimeMethod)

    if (path != null) {
      usages.push({
        root: 'fs',
        path,
        loc: item.loc
      })

      for (const arg of item.args ?? []) {
        visitGlobalUsage(arg, usages)
      }

      return
    }
  }

  if (item.type === 'MemberExpression' || item.type === 'OptionalMemberExpression') {
    const path = globalUsagePath(item)

    if (path != null) {
      usages.push({
        root: path[0],
        path,
        loc: item.loc
      })
      return
    }
  }

  if (item.type === 'IndexExpression' || item.type === 'OptionalIndexExpression') {
    const path = globalUsagePath(item.object)

    if (path != null) {
      usages.push({
        root: path[0],
        path,
        loc: item.loc
      })
      visitGlobalUsage(item.index, usages)
      return
    }
  }

  if (item.type === 'Reference' && item.path.length > 0 && jsStdGlobalRoots.has(item.path[0])) {
    usages.push({
      root: item.path[0],
      path: item.path,
      loc: item.loc
    })
  }

  for (const [key, value] of Object.entries(item)) {
    if (key === 'loc' || key === 'shape') {
      continue
    }

    visitGlobalUsage(value, usages)
  }
}

function globalUsagePath(expression: AnyNode | null | undefined): string[] | null {
  if (expression?.type === 'Reference' && expression.path.length > 0 && jsStdGlobalRoots.has(expression.path[0])) {
    return expression.path
  }

  if (expression?.type === 'MemberExpression' || expression?.type === 'OptionalMemberExpression') {
    const objectPath = globalUsagePath(expression.object)

    return objectPath == null ? null : [...objectPath, expression.property]
  }

  return null
}
