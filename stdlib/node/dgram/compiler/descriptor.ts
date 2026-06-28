import type { IrGlobalUsage } from '../../../../compiler/types.ts'

export const nodeDgramImportSource = 'node:dgram'
export const nodeDgramModuleObjectImportNames = ['default', 'dgram']
export const nodeDgramCreateSocketImportNames = ['createSocket']

type NodeDgramGlobalNameSet = Set<string>

export type NodeDgramCGlobalUsageContext = {
  dgramCreateSocketNames?: NodeDgramGlobalNameSet
  dgramImportNames?: NodeDgramGlobalNameSet
}

export function isSupportedNodeDgramCGlobalUsage(
  usage: IrGlobalUsage,
  context: NodeDgramCGlobalUsageContext
): boolean {
  return (
    (usage.path.length === 2 &&
      usage.path[1] === 'createSocket' &&
      nodeDgramNameSetHas(context.dgramImportNames, usage.root)) ||
    (usage.path.length === 1 && nodeDgramNameSetHas(context.dgramCreateSocketNames, usage.root))
  )
}

function nodeDgramNameSetHas(names: NodeDgramGlobalNameSet | undefined, root: string): boolean {
  if (names === null || typeof names === 'undefined') {
    return false
  }

  return names.has(root)
}
