export type MapTypeNames = {
  key: string
  value: string
}

export function arrayElementTypeNameFromTypeName(name: string): string | null {
  return genericTypeInner(name, 'array')
}

export function nullableTypeNameFromTypeName(name: string): string | null {
  return genericTypeInner(name, 'nullable')
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

export function splitGenericArgs(value: string): string[] {
  return splitDelimitedTypeArgs(value, ',')
}

export function splitUnionArgs(value: string): string[] {
  return splitDelimitedTypeArgs(value, '|')
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
  const prefix = `${wrapper}<`

  if (!name.startsWith(prefix)) {
    return null
  }

  if (!name.endsWith('>')) {
    return null
  }

  const inner = name.slice(prefix.length, name.length - 1)

  if (inner.length === 0) {
    return null
  }

  return inner
}

function splitDelimitedTypeArgs(value: string, delimiter: string): string[] {
  const args: string[] = []
  let depth = 0
  let start = 0

  let index = 0

  while (index < value.length) {
    const char = value[index]

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
