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
    isFsRuntimeImportSource(symbol.importSource) &&
    isFsRuntimeImportedName(symbol.importedName)
  )
}

function isFsRuntimeImportSource(source: string | null | undefined): boolean {
  return source === 'fs' || source === 'node:fs' || source === 'node:fs/promises'
}

function isFsRuntimeImportedName(name: string | null | undefined): boolean {
  return name === 'default' || name === 'fs' || name === 'promises'
}
