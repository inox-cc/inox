import { fsRuntimeCallInfoFromPath, removedFsRuntimeMethodInfoFromPath } from '../../stdlib/descriptors/fs.ts'
import type { AnyNode, SymbolInfo } from '../../types.ts'
import type { FsRuntimeCallInfo, RemovedFsRuntimeMethodInfo } from '../../stdlib/descriptors/fs.ts'
import { memberExpressionPath } from '../../member-paths.ts'

export function fsRuntimeCallInfo(callee: AnyNode): FsRuntimeCallInfo | null {
  return fsRuntimeCallInfoFromPath(memberExpressionPath(callee))
}

export function removedFsRuntimeMethodInfo(callee: AnyNode): RemovedFsRuntimeMethodInfo | null {
  return removedFsRuntimeMethodInfoFromPath(memberExpressionPath(callee))
}

export function isFsRuntimeImportSymbol(symbol: SymbolInfo): boolean {
  return (
    symbol.kind === 'import' &&
    ['fs', 'node:fs', 'node:fs/promises'].includes(symbol.importSource ?? '') &&
    ['default', 'fs', 'promises'].includes(symbol.importedName ?? '')
  )
}
