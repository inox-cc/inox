import type { IrGlobalUsage } from '../../../../compiler/types.ts'

export const nodeNetImportSource = 'node:net'
export const nodeNetModuleObjectImportNames = ['default', 'net']
export const nodeNetCreateServerImportNames = ['createServer']
export const nodeNetConnectImportNames = ['connect', 'createConnection']

type NodeNetGlobalNameSet = Set<string>

export type NodeNetCGlobalUsageContext = {
  netConnectNames?: NodeNetGlobalNameSet
  netCreateServerNames?: NodeNetGlobalNameSet
  netImportNames?: NodeNetGlobalNameSet
}

export function isSupportedNodeNetCGlobalUsage(
  usage: IrGlobalUsage,
  context: NodeNetCGlobalUsageContext
): boolean {
  return (
    (usage.path.length === 2 &&
      usage.path[1] === 'createServer' &&
      nodeNetNameSetHas(context.netImportNames, usage.root)) ||
    (usage.path.length === 2 &&
      (usage.path[1] === 'connect' || usage.path[1] === 'createConnection') &&
      nodeNetNameSetHas(context.netImportNames, usage.root)) ||
    (usage.path.length === 1 &&
      (nodeNetNameSetHas(context.netCreateServerNames, usage.root) ||
        nodeNetNameSetHas(context.netConnectNames, usage.root)))
  )
}

function nodeNetNameSetHas(names: NodeNetGlobalNameSet | undefined, root: string): boolean {
  if (names === null || typeof names === 'undefined') {
    return false
  }

  return names.has(root)
}
