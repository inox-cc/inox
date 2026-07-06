import { emitCIdentifier } from './identifiers.ts'

export type CValueTypeInput = string | null | undefined

export type CReturnTypeContext = {
  returnNullable: boolean
  returnType: string
}

export type CNullableScalarParam = {
  nullable?: boolean
  valueType?: string
}

export type CNullableScalarParamInput = CNullableScalarParam | null | undefined

type CNullableScalarParamRecord = {
  nullable: boolean
  valueType?: string
}

export type CRuntimeValueTag = string | null

function isConcreteManagedRuntimeReturnType(valueType: CValueTypeInput): boolean {
  return (
    valueType === 'bytes' ||
    valueType === 'string' ||
    valueType === 'object' ||
    valueType === 'array' ||
    valueType === 'map' ||
    valueType === 'set'
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
    valueType !== 'regexp' &&
    valueType !== 'date' &&
    valueType !== 'timer' &&
    valueType !== 'crypto-hash' &&
    valueType !== 'crypto-hmac' &&
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

  if (valueType === 'regexp') {
    return 'RegExp'
  }

  if (valueType === 'url.URLSearchParams') {
    return 'URLSearchParams'
  }

  if (valueType === 'url.URL') {
    return 'URL'
  }

  if (valueType === 'date') {
    return 'double'
  }

  if (valueType === 'timer') {
    return 'inox_timer_handle*'
  }

  if (valueType === 'crypto-hash') {
    return 'inox_crypto_hash*'
  }

  if (valueType === 'crypto-hmac') {
    return 'inox_crypto_hmac*'
  }

  return 'double'
}

export function emitCReturnType(valueType: CValueTypeInput, nullable: boolean): string {
  if (nullable && isNullableScalarType(valueType)) {
    return 'inox_value'
  }

  if (isManagedRuntimeReturnType(valueType)) {
    return 'inox_value'
  }

  return emitCType(valueType)
}

export function emitThrowingFunctionOutType(valueType: CValueTypeInput, nullable: boolean): string {
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

  if (valueType === 'set') {
    return 'INOX_TAG_SET'
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

function isNullableScalarParamRecord(param: CNullableScalarParamRecord): boolean {
  return param.nullable === true && isNullableScalarType(param.valueType)
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
