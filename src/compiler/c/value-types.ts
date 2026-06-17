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

type CPresentNullableScalarParam = {
  nullable: boolean
  valueType?: string
}

export type CRuntimeValueTag = string | null

export function isManagedRuntimeReturnType(valueType: CValueTypeInput): boolean {
  return (
    valueType === 'bytes' ||
    valueType === 'string' ||
    valueType === 'object' ||
    valueType === 'array' ||
    valueType === 'map' ||
    valueType === 'set'
  )
}

export function isNullableScalarType(valueType: CValueTypeInput): boolean {
  return valueType === 'number' || valueType === 'boolean'
}

export function emitCType(valueType: CValueTypeInput): string {
  if (valueType === 'void') {
    return 'void'
  }

  if (isManagedRuntimeReturnType(valueType)) {
    return 'ccjs_value'
  }

  if (valueType === 'unknown') {
    return 'ccjs_value'
  }

  if (valueType === 'function') {
    return 'void*'
  }

  if (valueType === 'promise') {
    return 'ccjs_promise*'
  }

  if (valueType === 'timer') {
    return 'ccjs_timer_handle*'
  }

  if (valueType === 'crypto-hash') {
    return 'ccjs_crypto_hash*'
  }

  if (valueType === 'crypto-hmac') {
    return 'ccjs_crypto_hmac*'
  }

  return 'double'
}

export function emitCReturnType(valueType: CValueTypeInput, nullable: boolean): string {
  if (nullable && isNullableScalarType(valueType)) {
    return 'ccjs_value'
  }

  if (isManagedRuntimeReturnType(valueType)) {
    return 'ccjs_value'
  }

  return emitCType(valueType)
}

export function emitThrowingFunctionOutType(valueType: CValueTypeInput, nullable: boolean): string {
  if (nullable && isNullableScalarType(valueType)) {
    return 'ccjs_value'
  }

  if (isManagedRuntimeReturnType(valueType)) {
    return 'ccjs_value'
  }

  return emitCType(valueType)
}

export function isThrowingFunctionRuntimeOut(context: CReturnTypeContext): boolean {
  return (
    isManagedRuntimeReturnType(context.returnType) ||
    (context.returnNullable === true && isNullableScalarType(context.returnType))
  )
}

export function cRuntimeValueTag(valueType: CValueTypeInput): CRuntimeValueTag {
  if (valueType === 'boolean') {
    return 'CCJS_TAG_BOOL'
  }

  if (valueType === 'number') {
    return 'CCJS_TAG_NUMBER'
  }

  if (valueType === 'string') {
    return 'CCJS_TAG_STRING'
  }

  if (valueType === 'bytes') {
    return 'CCJS_TAG_BYTES'
  }

  if (valueType === 'object') {
    return 'CCJS_TAG_OBJECT'
  }

  if (valueType === 'array') {
    return 'CCJS_TAG_ARRAY'
  }

  if (valueType === 'function') {
    return 'CCJS_TAG_FUNCTION'
  }

  if (valueType === 'map') {
    return 'CCJS_TAG_MAP'
  }

  if (valueType === 'set') {
    return 'CCJS_TAG_SET'
  }

  return null
}

export function isRuntimeNullableType(valueType: CValueTypeInput): boolean {
  return cRuntimeValueTag(valueType) != null
}

export function isNullableScalarParam(param: CNullableScalarParamInput): boolean {
  if (param == null) {
    return false
  }

  return isPresentNullableScalarParam(param as CPresentNullableScalarParam)
}

function isPresentNullableScalarParam(param: CPresentNullableScalarParam): boolean {
  return param.nullable === true && isNullableScalarType(param.valueType)
}

export function emitCStringParamName(name: string): string {
  return `ccjs_param_${name}`
}

export function emitCScalarParamName(name: string): string {
  return `ccjs_param_${name}`
}

export function emitCObjectParamName(name: string): string {
  return `ccjs_param_${name}`
}
