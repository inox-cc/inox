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
export { jsonRuntimeMethodNameFromPath } from '../json/compiler/descriptor.ts'
