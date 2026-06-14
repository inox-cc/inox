import { fsRuntimeCallInfoFromPath } from '../../stdlib/descriptors/fs.ts'
import type { AnyNode, SymbolInfo } from '../../types.ts'
import type { FsRuntimeCallInfo } from '../../stdlib/descriptors/fs.ts'
import { memberExpressionPath } from './paths.ts'

export function fsRuntimeCallInfo(callee: AnyNode): FsRuntimeCallInfo | null {
  return fsRuntimeCallInfoFromPath(memberExpressionPath(callee))
}

export function isFsRuntimeImportSymbol(symbol: SymbolInfo): boolean {
  return (
    symbol.kind === 'import' &&
    ['fs', 'node:fs', 'node:fs/promises'].includes(symbol.importSource ?? '') &&
    ['default', 'fs', 'promises'].includes(symbol.importedName ?? '')
  )
}
