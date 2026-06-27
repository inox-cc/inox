import { memberExpressionPath } from '../../member-paths.ts'
import type { FsRuntimeCallInfo } from '../../stdlib/descriptors/fs.ts'
import { fsRuntimeCallInfoFromPath } from '../../stdlib/descriptors/fs.ts'
import { isStdlibModuleImportSourceForId } from '../../stdlib/descriptors/modules.ts'
import type { AnyNode, SymbolInfo } from '../../types.ts'

export function fsRuntimeCallInfo(callee: AnyNode): FsRuntimeCallInfo | null {
  return fsRuntimeCallInfoFromPath(memberExpressionPath(callee))
}

export function fsRuntimeCallInfoFromImportSymbol(
  callee: AnyNode,
  symbol: SymbolInfo | null
): FsRuntimeCallInfo | null {
  if (
    callee.type !== 'Reference' ||
    callee.path.length !== 1 ||
    symbol === null ||
    typeof symbol === 'undefined' ||
    symbol.kind !== 'import'
  ) {
    return null
  }

  if (
    !isFsRuntimeImportSource(symbol.importSource) ||
    symbol.importedName === null ||
    typeof symbol.importedName === 'undefined'
  ) {
    return null
  }

  const root = callee.path[0]
  let path = [root, symbol.importedName]

  if (symbol.importSource === 'node:fs/promises') {
    path = [root, 'promises', symbol.importedName]
  }

  const info = fsRuntimeCallInfoFromPath(path)

  if (info === null || typeof info === 'undefined') {
    return null
  }

  return {
    method: info.method,
    nodeName: info.nodeName,
    path: [root],
    root,
    viaPromises: info.viaPromises,
    mode: info.mode
  }
}

export function isFsRuntimeImportSymbol(symbol: SymbolInfo): boolean {
  return (
    symbol.kind === 'import' &&
    isFsRuntimeImportSource(symbol.importSource) &&
    isFsRuntimeImportedName(symbol.importedName)
  )
}

function isFsRuntimeImportSource(source: string | null | undefined): boolean {
  return isStdlibModuleImportSourceForId(source, 'fs')
}

function isFsRuntimeImportedName(name: string | null | undefined): boolean {
  return name === 'default' || name === 'fs' || name === 'promises'
}
