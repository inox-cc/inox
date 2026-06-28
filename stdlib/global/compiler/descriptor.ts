export {
  arrayRuntimeMethodName,
  collectionConstructorNameFromPath,
  isArrayMethod,
  isCollectionConstructorGlobalUsagePath,
  isMapMethod,
  isSetMethod,
  mapRuntimeMethodName,
  setRuntimeMethodName
} from '../collections/compiler/descriptor.ts'
export { isNumericCastName, numericCastNames } from '../conversions/compiler/descriptor.ts'
export {
  isStringIndexMethod,
  isStringPredicateMethod,
  isStringRuntimeMethod,
  stringRuntimeMethodName,
  stringRuntimeReturnType
} from '../strings/compiler/descriptor.ts'
export {
  debugMemoryStatsFields,
  debugRuntimeMethodNameFromKnownPath,
  debugRuntimeMethodNameFromPath,
  isDebugRuntimeMethodPath
} from '../debug/compiler/descriptor.ts'
export {
  fetchGlobalRoots,
  fetchHeadersMethods,
  fetchInitOptions,
  fetchRedirectModes,
  fetchResponseBodyMethods,
  isAsyncFetchRuntimeMethod,
  isFetchGlobalRoot,
  isFetchHeadersMethod,
  isFetchInitOption,
  isFetchRedirectMode,
  isFetchResponseBodyMethod,
  isSupportedFetchResponseBodyMethod
} from '../fetch/compiler/descriptor.ts'
export { jsonRuntimeMethodNameFromPath } from '../json/compiler/descriptor.ts'
export {
  knownMathRuntimeArgCount,
  mathRuntimeArgCount,
  mathRuntimeMethodNameFromPath
} from '../math/compiler/descriptor.ts'
export {
  dateConstructorRuntimeMethodNameFromPath,
  dateInstanceRuntimeMethodName,
  dateInstanceRuntimeMethodReturnType,
  timeRuntimeCapabilityFromPath,
  timeRuntimeMethodNameFromPath
} from '../time/compiler/descriptor.ts'
