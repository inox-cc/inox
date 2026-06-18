export type MapTypeNames = {
  key: string
  value: string
}

export type RecordTypeNames = {
  key: string
  value: string
}

export function arrayElementTypeNameFromTypeName(name: string): string | null {
  return genericTypeInner(name, 'array')
}

export function isArrayTypeName(name: string): boolean {
  return hasGenericTypeInner(name, 'array')
}

export function arrayElementTypeNameFromKnownTypeName(name: string): string {
  return knownGenericTypeInner(name, 'array')
}

export function nullableTypeNameFromTypeName(name: string): string | null {
  return genericTypeInner(name, 'nullable')
}

export function isNullableTypeName(name: string): boolean {
  return hasGenericTypeInner(name, 'nullable')
}

export function nullableTypeNameFromKnownTypeName(name: string): string {
  return knownGenericTypeInner(name, 'nullable')
}

export function mapTypeNamesFromTypeName(name: string): MapTypeNames | null {
  const inner = genericTypeInner(name, 'map')

  if (inner != null) {
    const args = splitGenericArgs(inner)

    if (args.length !== 2) {
      return null
    }

    return {
      key: args[0],
      value: args[1]
    }
  }

  return null
}

export function recordTypeNamesFromTypeName(name: string): RecordTypeNames | null {
  const inner = genericTypeInner(name, 'record')

  if (inner == null) {
    return null
  }

  const args = splitGenericArgs(inner)

  if (args.length !== 2) {
    return null
  }

  return {
    key: args[0],
    value: args[1]
  }
}

export function setElementTypeNameFromTypeName(name: string): string | null {
  const inner = genericTypeInner(name, 'set')

  if (inner != null) {
    const args = splitGenericArgs(inner)

    if (args.length === 1) {
      return args[0]
    }

    return null
  }

  return null
}

export function isSetTypeName(name: string): boolean {
  return hasGenericTypeInner(name, 'set')
}

export function setElementTypeNameFromKnownTypeName(name: string): string {
  return knownGenericTypeInner(name, 'set')
}

export function promiseValueTypeNameFromTypeName(name: string): string | null {
  const inner = genericTypeInner(name, 'promise')

  if (inner != null) {
    const args = splitGenericArgs(inner)

    if (args.length === 1) {
      return args[0]
    }

    return null
  }

  return null
}

export function isPromiseTypeName(name: string): boolean {
  return hasGenericTypeInner(name, 'promise')
}

export function promiseValueTypeNameFromKnownTypeName(name: string): string {
  return knownGenericTypeInner(name, 'promise')
}

export function splitGenericArgs(value: string): string[] {
  return splitDelimitedTypeArgs(value, ',')
}

export function splitUnionArgs(value: string): string[] {
  return splitDelimitedTypeArgs(value, '|')
}

export function unionTypeNamesFromTypeName(name: string): string[] | null {
  const inner = genericTypeInner(name, 'union')

  if (inner == null) {
    return null
  }

  const args = splitGenericArgs(inner)

  if (args.length === 0) {
    return null
  }

  return args
}

export function isBuiltinValueType(name: string): boolean {
  if (name === 'array') {
    return true
  }

  if (name === 'boolean') {
    return true
  }

  if (name === 'bytes') {
    return true
  }

  if (name === 'function') {
    return true
  }

  if (name === 'null') {
    return true
  }

  if (name === 'number') {
    return true
  }

  if (name === 'object') {
    return true
  }

  if (name === 'promise') {
    return true
  }

  if (name === 'string') {
    return true
  }

  if (name === 'void') {
    return true
  }

  return false
}

export function isBytesTypeName(name: string): boolean {
  return name === 'Buffer' || name === 'Uint8Array'
}

function genericTypeInner(name: string, wrapper: string): string | null {
  if (!hasGenericTypeInner(name, wrapper)) {
    return null
  }

  return knownGenericTypeInner(name, wrapper)
}

function hasGenericTypeInner(name: string, wrapper: string): boolean {
  const prefix = `${wrapper}<`

  if (!name.startsWith(prefix)) {
    return false
  }

  if (!name.endsWith('>')) {
    return false
  }

  return name.length - prefix.length - 1 > 0
}

function knownGenericTypeInner(name: string, wrapper: string): string {
  const prefix = `${wrapper}<`

  return name.slice(prefix.length, name.length - 1)
}

function splitDelimitedTypeArgs(value: string, delimiter: string): string[] {
  const args: string[] = []
  let depth = 0
  let start = 0

  let index = 0

  while (index < value.length) {
    const char = value.slice(index, index + 1)

    if (char === '<') {
      depth = depth + 1
    } else if (char === '>') {
      depth = depth - 1
    } else if (char === delimiter && depth === 0) {
      args.push(value.slice(start, index))
      start = index + 1
    }

    index = index + 1
  }

  args.push(value.slice(start))

  return trimNonEmptyStrings(args)
}

function trimNonEmptyStrings(values: string[]): string[] {
  const result: string[] = []

  for (const value of values) {
    const trimmed = value.trim()

    if (trimmed.length > 0) {
      result.push(trimmed)
    }
  }

  return result
}
