import type { CFunctionContext } from './context.ts'

export function isManagedRuntimeReturnType(valueType: any): boolean {
  return (
    valueType === 'bytes' ||
    valueType === 'string' ||
    valueType === 'object' ||
    valueType === 'array' ||
    valueType === 'map' ||
    valueType === 'set'
  )
}

export function isNullableScalarType(valueType: any): boolean {
  return valueType === 'number' || valueType === 'boolean'
}

export function emitCType(type: any): string {
  if (type === 'void') {
    return 'void'
  }

  if (isManagedRuntimeReturnType(type)) {
    return 'ccjs_value'
  }

  if (type === 'function') {
    return 'void*'
  }

  if (type === 'promise') {
    return 'ccjs_promise*'
  }

  if (type === 'timer') {
    return 'ccjs_timer_handle*'
  }

  if (type === 'crypto-hash') {
    return 'ccjs_crypto_hash*'
  }

  if (type === 'crypto-hmac') {
    return 'ccjs_crypto_hmac*'
  }

  return 'double'
}

export function emitCReturnType(type: any, nullable = false): string {
  if (nullable && isNullableScalarType(type)) {
    return 'ccjs_value'
  }

  if (isManagedRuntimeReturnType(type)) {
    return 'ccjs_value'
  }

  return emitCType(type)
}

export function emitThrowingFunctionOutType(type: any, nullable = false): string {
  if (nullable && isNullableScalarType(type)) {
    return 'ccjs_value'
  }

  if (isManagedRuntimeReturnType(type)) {
    return 'ccjs_value'
  }

  return emitCType(type)
}

export function isThrowingFunctionRuntimeOut(context: CFunctionContext): boolean {
  return (
    isManagedRuntimeReturnType(context.returnType) ||
    (context.returnNullable === true && isNullableScalarType(context.returnType))
  )
}

export function cRuntimeValueTag(valueType: any): string | null {
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

export function isRuntimeNullableType(valueType: any): boolean {
  return cRuntimeValueTag(valueType) != null
}

export function isNullableScalarParam(param: any): boolean {
  return param?.nullable === true && isNullableScalarType(param.valueType)
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
