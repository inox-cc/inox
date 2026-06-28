import type { IrGlobalUsage } from '../../../../compiler/types.ts'

export const nodeHttpImportSource = 'node:http'
export const nodeHttpModuleObjectImportNames = ['default', 'http']
export const nodeHttpCreateServerImportNames = ['createServer']

type NodeHttpGlobalNameSet = Set<string>

export type NodeHttpCGlobalUsageContext = {
  httpCreateServerNames?: NodeHttpGlobalNameSet
  httpImportNames?: NodeHttpGlobalNameSet
}

export function isSupportedNodeHttpCGlobalUsage(
  usage: IrGlobalUsage,
  context: NodeHttpCGlobalUsageContext
): boolean {
  return (
    (usage.path.length === 2 &&
      usage.path[1] === 'createServer' &&
      nodeHttpNameSetHas(context.httpImportNames, usage.root)) ||
    (usage.path.length === 1 && nodeHttpNameSetHas(context.httpCreateServerNames, usage.root))
  )
}

function nodeHttpNameSetHas(names: NodeHttpGlobalNameSet | undefined, root: string): boolean {
  if (names === null || typeof names === 'undefined') {
    return false
  }

  return names.has(root)
}
