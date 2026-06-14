const builtinValueTypes = new Set([
  'array',
  'boolean',
  'bytes',
  'function',
  'null',
  'number',
  'object',
  'promise',
  'string',
  'void'
])

export type MapTypeNames = {
  key: string
  value: string
}

export function arrayElementTypeNameFromTypeName(name: string): string | null {
  const match = /^array<(.+)>$/.exec(name)

  return match?.[1] ?? null
}

export function nullableTypeNameFromTypeName(name: string): string | null {
  const match = /^nullable<(.+)>$/.exec(name)

  return match?.[1] ?? null
}

export function mapTypeNamesFromTypeName(name: string): MapTypeNames | null {
  const match = /^map<(.+)>$/.exec(name)

  if (match == null) {
    return null
  }

  const args = splitGenericArgs(match[1])

  return args.length === 2
    ? {
        key: args[0],
        value: args[1]
      }
    : null
}

export function setElementTypeNameFromTypeName(name: string): string | null {
  const match = /^set<(.+)>$/.exec(name)
  const args = match == null ? [] : splitGenericArgs(match[1])

  return args.length === 1 ? args[0] : null
}

export function promiseValueTypeNameFromTypeName(name: string): string | null {
  const match = /^promise<(.+)>$/.exec(name)
  const args = match == null ? [] : splitGenericArgs(match[1])

  return args.length === 1 ? args[0] : null
}

export function splitGenericArgs(value: string): string[] {
  return splitDelimitedTypeArgs(value, ',')
}

export function splitUnionArgs(value: string): string[] {
  return splitDelimitedTypeArgs(value, '|')
}

export function isBuiltinValueType(name: string): boolean {
  return builtinValueTypes.has(name)
}

export function isBytesTypeName(name: string): boolean {
  return name === 'Buffer' || name === 'Uint8Array'
}

function splitDelimitedTypeArgs(value: string, delimiter: ',' | '|'): string[] {
  const args: string[] = []
  let depth = 0
  let start = 0

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]

    if (char === '<') {
      depth += 1
    } else if (char === '>') {
      depth -= 1
    } else if (char === delimiter && depth === 0) {
      args.push(value.slice(start, index))
      start = index + 1
    }
  }

  args.push(value.slice(start))

  return args.map((arg) => arg.trim()).filter(Boolean)
}
