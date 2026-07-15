import { emitCIdentifier } from './identifiers.ts'

type CLibraryNativeShape = {
  libraryCValueAdapter?: string | null
  libraryCppType?: string | null
  libraryTypeId?: string | null
}

export type CValueTypeInput = string | null | undefined

export type CReturnTypeContext = {
  returnNullable: boolean
  returnType: string
}

export type CNullableScalarParam = {
  defaultValue?: object | null
  nullable?: boolean
  optional?: boolean
  rest?: boolean
  valueType?: string
}

export type CNullableScalarParamInput = CNullableScalarParam | null | undefined

type CNullableScalarParamRecord = {
  defaultValue?: object | null
  nullable: boolean
  optional?: boolean
  rest?: boolean
  valueType?: string
}

export type CRuntimeValueTag = string | null

function isConcreteManagedRuntimeReturnType(valueType: CValueTypeInput): boolean {
  return (
    valueType === 'bytes' ||
    valueType === 'string' ||
    valueType === 'object' ||
    valueType === 'array' ||
    valueType === 'map'
  )
}

export function isManagedRuntimeReturnType(valueType: CValueTypeInput): boolean {
  return isConcreteManagedRuntimeReturnType(valueType)
}

export function isOpaqueRuntimeValueType(valueType: CValueTypeInput): boolean {
  if (valueType === null || typeof valueType === 'undefined' || valueType === 'unknown') {
    return false
  }

  if (isConcreteManagedRuntimeReturnType(valueType) || isNullableScalarType(valueType)) {
    return false
  }

  return (
    valueType !== 'void' &&
    valueType !== 'function' &&
    valueType !== 'promise' &&
    valueType !== 'optional' &&
    valueType !== 'js-global'
  )
}

export function isNullableScalarType(valueType: CValueTypeInput): boolean {
  return valueType === 'number' || valueType === 'boolean' || valueType === 'string'
}

export function emitCType(valueType: CValueTypeInput): string {
  if (valueType === 'void') {
    return 'void'
  }

  if (isManagedRuntimeReturnType(valueType)) {
    return 'inox_value'
  }

  if (valueType === 'unknown') {
    return 'inox_value'
  }

  if (isOpaqueRuntimeValueType(valueType)) {
    return 'inox_value'
  }

  if (valueType === 'function') {
    return 'void*'
  }

  if (valueType === 'promise') {
    return 'inox_promise*'
  }

  return 'double'
}

export function libraryNativeCppType(shape: CLibraryNativeShape | null | undefined): string | null {
  const typeId = shape?.libraryTypeId
  const cppType = shape?.libraryCppType

  if (
    typeId === null ||
    typeof typeId === 'undefined' ||
    cppType === null ||
    typeof cppType === 'undefined' ||
    cppType === ''
  ) {
    return null
  }

  return cppType
}

export function libraryNativeBoundaryCppType(
  valueType: CValueTypeInput,
  nullable: boolean,
  optional: boolean,
  shape: CLibraryNativeShape | null | undefined
): string | null {
  const adapter = shape?.libraryCValueAdapter
  const hasExplicitAdapter = adapter !== null && typeof adapter !== 'undefined' && adapter.length > 0

  if ((valueType !== 'object' && !hasExplicitAdapter) || nullable || optional) {
    return null
  }

  return libraryNativeCppType(shape)
}

export function libraryNativeValueAdapter(
  shape: CLibraryNativeShape | null | undefined
): string | null {
  return shape?.libraryCValueAdapter ?? null
}

export function applyLibraryNativeValueAdapter(value: string, adapter: string | null): string {
  if (adapter === null || adapter.length === 0) {
    return value
  }

  return adapter.split('$value').join(value)
}

export function emitCReturnType(valueType: CValueTypeInput, nullable: boolean, shape?: CLibraryNativeShape | null): string {
  const libraryCppType = libraryNativeBoundaryCppType(valueType, nullable, false, shape)

  if (libraryCppType !== null) {
    return libraryCppType
  }

  if (nullable && isNullableScalarType(valueType)) {
    return 'inox_value'
  }

  if (isManagedRuntimeReturnType(valueType)) {
    return 'inox_value'
  }

  return emitCType(valueType)
}

export function emitThrowingFunctionOutType(
  valueType: CValueTypeInput,
  nullable: boolean,
  shape?: CLibraryNativeShape | null
): string {
  const libraryCppType = libraryNativeBoundaryCppType(valueType, nullable, false, shape)

  if (libraryCppType !== null) {
    return libraryCppType
  }

  if (nullable && isNullableScalarType(valueType)) {
    return 'inox_value'
  }

  if (isManagedRuntimeReturnType(valueType)) {
    return 'inox_value'
  }

  return emitCType(valueType)
}

export function isThrowingFunctionRuntimeOut(context: CReturnTypeContext): boolean {
  return (
    context.returnType === 'unknown' ||
    isManagedRuntimeReturnType(context.returnType) ||
    isOpaqueRuntimeValueType(context.returnType) ||
    (context.returnNullable === true && isNullableScalarType(context.returnType))
  )
}

export function cRuntimeValueTag(valueType: CValueTypeInput): CRuntimeValueTag {
  if (valueType !== null && typeof valueType !== 'undefined' && valueType.startsWith('class:')) {
    return 'INOX_TAG_CLASS_INSTANCE'
  }

  if (valueType === 'boolean') {
    return 'INOX_TAG_BOOL'
  }

  if (valueType === 'number') {
    return 'INOX_TAG_NUMBER'
  }

  if (valueType === 'string') {
    return 'INOX_TAG_STRING'
  }

  if (valueType === 'bytes') {
    return 'INOX_TAG_BYTES'
  }

  if (valueType === 'object') {
    return 'INOX_TAG_OBJECT'
  }

  if (valueType === 'array') {
    return 'INOX_TAG_ARRAY'
  }

  if (valueType === 'function') {
    return 'INOX_TAG_FUNCTION'
  }

  if (valueType === 'map') {
    return 'INOX_TAG_MAP'
  }

  return null
}

export function isRuntimeNullableType(valueType: CValueTypeInput): boolean {
  return !!cRuntimeValueTag(valueType)
}

export function isNullableScalarParam(param: CNullableScalarParamInput): boolean {
  if (param === null || typeof param === 'undefined') {
    return false
  }

  return isNullableScalarParamRecord(param as CNullableScalarParamRecord)
}

export function isBoxedScalarParam(param: CNullableScalarParamInput): boolean {
  if (param === null || typeof param === 'undefined' || !isNullableScalarType(param.valueType)) {
    return false
  }

  return param.nullable === true || (param.optional === true && param.rest !== true)
}

function isNullableScalarParamRecord(param: CNullableScalarParamRecord): boolean {
  const omittedScalarWithoutDefault =
    isNullableScalarType(param.valueType) &&
    param.optional === true &&
    param.rest !== true &&
    typeof param.defaultValue === 'undefined'
  return (param.nullable === true && isNullableScalarType(param.valueType)) || omittedScalarWithoutDefault
}

export function emitCStringParamName(name: string): string {
  return `inox_param_${emitCIdentifier(name)}`
}

export function emitCScalarParamName(name: string): string {
  return `inox_param_${emitCIdentifier(name)}`
}

export function emitCObjectParamName(name: string): string {
  return `inox_param_${emitCIdentifier(name)}`
}
