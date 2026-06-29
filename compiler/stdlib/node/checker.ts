import type {
  CryptoCheckerContext as PackageCryptoCheckerContext,
  CryptoCheckerDiagnostic as PackageCryptoCheckerDiagnostic,
  CryptoHashMethodCheckerContext as PackageCryptoHashMethodCheckerContext
} from '../../../stdlib/node/crypto/compiler/checker.ts'
import type {
  FsBooleanOptions as PackageFsBooleanOptions,
  FsRuntimeArgumentCheck as PackageFsRuntimeArgumentCheck,
  FsRuntimeCallInfo as PackageFsRuntimeCallInfo,
  FsRuntimeCallPlan as PackageFsRuntimeCallPlan
} from '../../../stdlib/node/fs/compiler/checker.ts'
import type { ObjectShapeInfo, SymbolInfo, ValueType } from '../../types.ts'
import { processRuntimeObjectDescriptors } from '../../../stdlib/node/process/compiler/checker.ts'

export type NodeStdlibRuntimeObjectInfo = {
  source: string
  name: string
  valueType: ValueType
  shape: ObjectShapeInfo
}

type NodeStdlibRuntimeObjectDescriptor = NodeStdlibRuntimeObjectInfo & {
  globalName: string
  moduleObjectImportNames: string[]
}

const nodeStdlibRuntimeObjectDescriptors: NodeStdlibRuntimeObjectDescriptor[] = processRuntimeObjectDescriptors

export {
  binaryConstructorName,
  binaryInstanceRuntimeMethodName,
  binaryStaticRuntimeMethodName,
  bufferRuntimeConstantName,
  unsupportedBufferRuntimeExport
} from '../../../stdlib/node/buffer/compiler/checker.ts'
export { childProcessRuntimeCallInfo } from '../../../stdlib/node/child_process/compiler/checker.ts'
export {
  checkCryptoCall,
  checkCryptoHashMethodCall,
  cryptoRuntimeCallInfo
} from '../../../stdlib/node/crypto/compiler/checker.ts'
export { unsupportedEventsRuntimeExport } from '../../../stdlib/node/events/compiler/checker.ts'
export {
  fsRuntimeCallInfo,
  fsRuntimeCallInfoFromImportSymbol,
  fsRuntimeCallPlan,
  fsRuntimeConstantName,
  fsStatsRuntimeMethodInfo,
  isFsPromisesImportSymbol,
  isFsRuntimeRootSymbol
} from '../../../stdlib/node/fs/compiler/checker.ts'
export { isOsRuntimeConstantImport, osRuntimeCallInfo, osRuntimeConstantName } from '../../../stdlib/node/os/compiler/checker.ts'
export {
  isPathRuntimeConstantImport,
  pathRuntimeCallInfo,
  pathRuntimeConstantName
} from '../../../stdlib/node/path/compiler/checker.ts'
export {
  processRuntimeAssignmentProperty,
  processRuntimeCallInfo,
  processRuntimeIndexProperty,
  processRuntimeMemberInfo,
  processRuntimePropertyImportInfo
} from '../../../stdlib/node/process/compiler/checker.ts'
export { unsupportedStreamRuntimeExport } from '../../../stdlib/node/stream/compiler/checker.ts'
export {
  isTimerRuntimeImportSymbol,
  timerCallbackFunctionType,
  timerClearMethodName,
  timerRuntimeImportMethodName,
  timerRuntimeMethodName
} from '../../../stdlib/node/timers/compiler/checker.ts'
export { isTimerHandleMethod } from '../../../stdlib/node/timers/compiler/descriptor.ts'
export { urlRuntimeCallInfo, urlRuntimeConstructorImportInfo } from '../../../stdlib/node/url/compiler/checker.ts'
export {
  isUrlMutableObjectField,
  isUrlSearchParamsRuntimeMethod
} from '../../../stdlib/node/url/compiler/descriptor.ts'

export type CryptoCheckerContext = PackageCryptoCheckerContext
export type CryptoCheckerDiagnostic = PackageCryptoCheckerDiagnostic
export type CryptoHashMethodCheckerContext = PackageCryptoHashMethodCheckerContext
export type FsBooleanOptions = PackageFsBooleanOptions
export type FsRuntimeArgumentCheck = PackageFsRuntimeArgumentCheck
export type FsRuntimeCallInfo = PackageFsRuntimeCallInfo
export type FsRuntimeCallPlan = PackageFsRuntimeCallPlan

export function nodeStdlibRuntimeObjectInfo(
  path: readonly string[] | null | undefined,
  rootSymbol: SymbolInfo | null | undefined
): NodeStdlibRuntimeObjectInfo | null {
  for (let index = 0; index < nodeStdlibRuntimeObjectDescriptors.length; index = index + 1) {
    const descriptor = nodeStdlibRuntimeObjectDescriptors[index]

    if (nodeStdlibRuntimeObjectDescriptorMatches(descriptor, path, rootSymbol)) {
      return {
        source: descriptor.source,
        name: descriptor.name,
        valueType: descriptor.valueType,
        shape: descriptor.shape
      }
    }
  }

  return null
}

function nodeStdlibRuntimeObjectDescriptorMatches(
  descriptor: NodeStdlibRuntimeObjectDescriptor,
  path: readonly string[] | null | undefined,
  rootSymbol: SymbolInfo | null | undefined
): boolean {
  if (path === null || typeof path === 'undefined' || path.length !== 1) {
    return false
  }

  if (isNodeStdlibRuntimeObjectGlobal(descriptor, path, rootSymbol)) {
    return true
  }

  return isNodeStdlibRuntimeObjectModuleImport(descriptor, rootSymbol)
}

function isNodeStdlibRuntimeObjectGlobal(
  descriptor: NodeStdlibRuntimeObjectDescriptor,
  path: readonly string[],
  rootSymbol: SymbolInfo | null | undefined
): boolean {
  return (
    path[0] === descriptor.globalName &&
    rootSymbol !== null &&
    typeof rootSymbol !== 'undefined' &&
    rootSymbol.kind === 'global' &&
    rootSymbol.valueType === descriptor.valueType
  )
}

function isNodeStdlibRuntimeObjectModuleImport(
  descriptor: NodeStdlibRuntimeObjectDescriptor,
  rootSymbol: SymbolInfo | null | undefined
): boolean {
  if (
    rootSymbol === null ||
    typeof rootSymbol === 'undefined' ||
    rootSymbol.kind !== 'import' ||
    rootSymbol.importSource !== descriptor.source
  ) {
    return false
  }

  const importedName = rootSymbol.importedName

  if (importedName === null || typeof importedName === 'undefined') {
    return false
  }

  for (let index = 0; index < descriptor.moduleObjectImportNames.length; index = index + 1) {
    if (descriptor.moduleObjectImportNames[index] === importedName) {
      return true
    }
  }

  return false
}
