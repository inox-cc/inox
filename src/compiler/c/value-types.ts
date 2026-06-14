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
