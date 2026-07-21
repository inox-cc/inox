export type RecordTypeNames = {
  key: string
  value: string
}

export type IndexedAccessTypeName = {
  base: string
  indexes: string[]
}

export type GenericTypeApplication = {
  name: string
  args: string[]
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

export function weakTypeNameFromTypeName(name: string): string | null {
  const inner = genericTypeInner(name, 'weak')

  if (inner !== null && typeof inner !== 'undefined') {
    const args = splitGenericArgs(inner)

    if (args.length === 1) {
      return args[0]
    }

    return null
  }

  return null
}

export function isWeakTypeName(name: string): boolean {
  return hasGenericTypeInner(name, 'weak')
}

export function recordTypeNamesFromTypeName(name: string): RecordTypeNames | null {
  const inner = genericTypeInner(name, 'record')

  if (inner === null || typeof inner === 'undefined') {
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

export function splitGenericArgs(value: string): string[] {
  return splitDelimitedTypeArgs(value, ',')
}

export function splitUnionArgs(value: string): string[] {
  return splitDelimitedTypeArgs(value, '|')
}

export function genericTypeApplicationFromTypeName(name: string): GenericTypeApplication | null {
  let open = -1
  let depth = 0

  for (let index = 0; index < name.length; index = index + 1) {
    const unit = name.slice(index, index + 1)

    if (unit === '<') {
      if (depth === 0) {
        open = index
      }
      depth = depth + 1
    } else if (unit === '>') {
      if (depth === 0) {
        return null
      }

      depth = depth - 1

      if (depth === 0 && index !== name.length - 1) {
        return null
      }
    }
  }

  if (open <= 0 || depth !== 0 || !isIdentifierTypeName(name.slice(0, open))) {
    return null
  }

  const args = splitGenericArgs(name.slice(open + 1, name.length - 1))

  if (args.length === 0) {
    return null
  }

  return {
    name: name.slice(0, open),
    args
  }
}

export function unionTypeNamesFromTypeName(name: string): string[] | null {
  const inner = genericTypeInner(name, 'union')

  if (inner === null || typeof inner === 'undefined') {
    return null
  }

  const args = splitGenericArgs(inner)

  if (args.length === 0) {
    return null
  }

  return args
}

export function normalizeTypeName(name: string): string {
  const parenthesizedInner = parenthesizedTypeInner(name)

  if (parenthesizedInner !== null && typeof parenthesizedInner !== 'undefined') {
    return normalizeTypeName(parenthesizedInner)
  }

  if (isFunctionTypeName(name)) {
    return 'function'
  }

  const unionArgs = splitUnionArgs(name)

  if (unionArgs.length > 1) {
    return normalizeUnionTypeNames(unionArgs)
  }

  const indexedAccess = indexedAccessTypeNameFromTypeName(name)

  if (indexedAccess !== null) {
    let normalized = normalizeTypeName(indexedAccess.base)

    for (let index = 0; index < indexedAccess.indexes.length; index = index + 1) {
      normalized = normalized + `[${indexedAccess.indexes[index]}]`
    }

    return normalized
  }

  const nullableInner = genericTypeInner(name, 'nullable')

  if (nullableInner !== null && typeof nullableInner !== 'undefined') {
    return `nullable<${normalizeTypeName(nullableInner)}>`
  }

  const normalizedWeakInner = genericTypeInner(name, 'weak')

  if (normalizedWeakInner !== null && typeof normalizedWeakInner !== 'undefined') {
    const args = splitGenericArgs(normalizedWeakInner)

    if (args.length === 1) {
      return `weak<${normalizeTypeName(args[0])}>`
    }

    return 'unknown'
  }

  const unionInner = genericTypeInner(name, 'union')

  if (unionInner !== null && typeof unionInner !== 'undefined') {
    const args = splitGenericArgs(unionInner)

    if (args.length === 0) {
      return 'unknown'
    }

    return normalizeUnionTypeNames(args)
  }

  if (name.endsWith('[]')) {
    return `array<${normalizeTypeName(name.slice(0, -2))}>`
  }

  const normalizedArrayInner = genericTypeInner(name, 'array')

  if (normalizedArrayInner !== null && typeof normalizedArrayInner !== 'undefined') {
    return `array<${normalizeTypeName(normalizedArrayInner)}>`
  }

  const normalizedRecordInner = genericTypeInner(name, 'record')

  if (normalizedRecordInner !== null && typeof normalizedRecordInner !== 'undefined') {
    const args = splitGenericArgs(normalizedRecordInner)

    if (args.length === 2) {
      return `record<${normalizeTypeName(args[0])},${normalizeTypeName(args[1])}>`
    }

    return 'object'
  }

  const recordInner = genericTypeInner(name, 'Record')

  if (recordInner !== null && typeof recordInner !== 'undefined') {
    const args = splitGenericArgs(recordInner)

    if (args.length === 2) {
      return `record<${normalizeTypeName(args[0])},${normalizeTypeName(args[1])}>`
    }

    return 'object'
  }

  if (isSimpleTypeName(name)) {
    return name
  }

  if (name === 'array') {
    return 'array'
  }

  if (name === 'Function' || name === 'function') {
    return 'function'
  }

  if (name === 'true' || name === 'false') {
    return 'boolean'
  }

  if (name === 'any') {
    return 'any'
  }

  const genericApplication = genericTypeApplicationFromTypeName(name)

  if (genericApplication !== null) {
    const normalizedArgs: string[] = []

    for (let index = 0; index < genericApplication.args.length; index = index + 1) {
      normalizedArgs.push(normalizeTypeName(genericApplication.args[index]))
    }

    return `${genericApplication.name}<${joinStrings(normalizedArgs, ',')}>`
  }

  if (isIdentifierTypeName(name)) {
    return name
  }

  return 'unknown'
}

export function indexedAccessTypeNameFromTypeName(name: string): IndexedAccessTypeName | null {
  const indexes: string[] = []
  let angleDepth = 0
  let bracketStart = -1
  let baseEnd = -1
  let index = 0

  while (index < name.length) {
    const unit = name.slice(index, index + 1)

    if (unit === '<') {
      angleDepth = angleDepth + 1
    } else if (unit === '>' && angleDepth > 0) {
      angleDepth = angleDepth - 1
    } else if (unit === '[' && angleDepth === 0) {
      if (bracketStart !== -1) {
        return null
      }

      if (baseEnd === -1) {
        baseEnd = index
      }

      bracketStart = index + 1
    } else if (unit === ']' && angleDepth === 0) {
      if (bracketStart === -1 || bracketStart === index) {
        return null
      }

      indexes.push(name.slice(bracketStart, index))
      bracketStart = -1
    } else if (bracketStart === -1 && baseEnd !== -1) {
      return null
    }

    index = index + 1
  }

  if (baseEnd <= 0 || bracketStart !== -1 || indexes.length === 0) {
    return null
  }

  return {
    base: name.slice(0, baseEnd),
    indexes
  }
}

export function typeNameDependencyNames(typeName: string | null | undefined): string[] {
  const names: string[] = []

  if (typeName === null || typeof typeName === 'undefined') {
    return names
  }

  let current = ''
  let index = 0

  while (index < typeName.length) {
    const unit = typeName.slice(index, index + 1)

    if (isTypeNameDependencyIdentifierChar(unit)) {
      current = current + unit
    } else {
      pushTypeNameDependencyName(current, names)
      current = ''
    }

    index = index + 1
  }

  pushTypeNameDependencyName(current, names)

  return uniqueTypeNameDependencyNames(names)
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

  if (name === 'string') {
    return true
  }

  if (name === 'unknown') {
    return true
  }

  if (name === 'void') {
    return true
  }

  return false
}

export function isBuiltinTypeDependencyName(name: string): boolean {
  if (isBuiltinValueType(name)) {
    return true
  }

  if (name === 'Function' || name === 'Record') {
    return true
  }

  if (name === 'any' || name === 'class' || name === 'false') {
    return true
  }

  if (name === 'never' || name === 'nullable' || name === 'record') {
    return true
  }

  if (name === 'true' || name === 'undefined' || name === 'union' || name === 'unknown' || name === 'weak') {
    return true
  }

  return false
}

function normalizeUnionTypeNames(unionArgs: string[]): string {
  const normalized: string[] = []
  const withoutNullish: string[] = []

  for (let index = 0; index < unionArgs.length; index = index + 1) {
    const arg = unionArgs[index]
    const normalizedArg = normalizeTypeName(arg)
    normalized.push(normalizedArg)

    if (!isAbsentTypeName(normalizedArg)) {
      withoutNullish.push(normalizedArg)
    }
  }

  if (allStringsSame(normalized)) {
    return normalized[0]
  }

  if (withoutNullish.length === 0) {
    return 'unknown'
  }

  if (normalized.length > withoutNullish.length) {
    if (withoutNullish.length === 1) {
      return `nullable<${withoutNullish[0]}>`
    }

    return `nullable<union<${joinStrings(withoutNullish, ',')}>>`
  }

  return `union<${joinStrings(normalized, ',')}>`
}

function allStringsSame(values: string[]): boolean {
  if (values.length === 0) {
    return false
  }

  const first = values[0]

  for (const value of values) {
    if (value !== first) {
      return false
    }
  }

  return true
}

function joinStrings(values: string[], separator: string): string {
  let result = ''

  for (let index = 0; index < values.length; index = index + 1) {
    if (index > 0) {
      result = result + separator
    }

    result = result + values[index]
  }

  return result
}

function isAbsentTypeName(name: string): boolean {
  return name === 'null' || name === 'undefined'
}

function isFunctionTypeName(name: string): boolean {
  if (!name.startsWith('(')) {
    return false
  }

  const arrow = functionTypeArrowIndex(name)

  return arrow > 0
}

function parenthesizedTypeInner(name: string): string | null {
  if (!name.startsWith('(') || !name.endsWith(')')) {
    return null
  }

  let parenDepth = 0

  for (let index = 0; index < name.length; index = index + 1) {
    const current = name[index]

    if (current === '(') {
      parenDepth = parenDepth + 1
    } else if (current === ')') {
      parenDepth = parenDepth - 1
    }

    if (parenDepth < 0) {
      return null
    }

    if (parenDepth === 0 && index < name.length - 1) {
      return null
    }
  }

  if (parenDepth !== 0) {
    return null
  }

  return name.slice(1, -1)
}

function functionTypeArrowIndex(name: string): number {
  let parenDepth = 0
  let genericDepth = 0

  for (let index = 0; index < name.length - 1; index = index + 1) {
    const current = name[index]
    const next = name[index + 1]

    if (current === '<') {
      genericDepth = genericDepth + 1
    } else if (current === '>' && genericDepth > 0) {
      genericDepth = genericDepth - 1
    } else if (current === '(') {
      parenDepth = parenDepth + 1
    } else if (current === ')' && parenDepth > 0) {
      parenDepth = parenDepth - 1
    }

    if (current === '=' && next === '>' && parenDepth === 0 && genericDepth === 0) {
      return index
    }
  }

  return -1
}

function isSimpleTypeName(name: string): boolean {
  if (name === 'number') {
    return true
  }

  if (name === 'string') {
    return true
  }

  if (name === 'boolean') {
    return true
  }

  if (name === 'void') {
    return true
  }

  if (name === 'null') {
    return true
  }

  if (name === 'unknown') {
    return true
  }

  return false
}

function isIdentifierTypeName(name: string): boolean {
  if (name.length === 0) {
    return false
  }

  if (!isIdentifierStartChar(name.slice(0, 1))) {
    return false
  }

  let index = 1

  while (index < name.length) {
    if (!isIdentifierPartChar(name.slice(index, index + 1))) {
      return false
    }

    index = index + 1
  }

  return true
}

function pushTypeNameDependencyName(name: string, names: string[]): void {
  if (name.length === 0 || isBuiltinTypeDependencyName(name)) {
    return
  }

  names.push(name)
}

function uniqueTypeNameDependencyNames(names: string[]): string[] {
  const seen: Set<string> = new Set()
  const result: string[] = []

  for (const name of names) {
    if (!seen.has(name)) {
      seen.add(name)
      result.push(name)
    }
  }

  return result
}

function isTypeNameDependencyIdentifierChar(ch: string): boolean {
  return isIdentifierPartChar(ch)
}

function isIdentifierStartChar(ch: string): boolean {
  if (ch === '_' || ch === '$') {
    return true
  }

  const code = ch.charCodeAt(0)

  if (code >= 65 && code <= 90) {
    return true
  }

  if (code >= 97 && code <= 122) {
    return true
  }

  return false
}

function isIdentifierPartChar(ch: string): boolean {
  if (isIdentifierStartChar(ch)) {
    return true
  }

  const code = ch.charCodeAt(0)

  if (code >= 48 && code <= 57) {
    return true
  }

  return false
}

function genericTypeInner(name: string, wrapper: string): string | null {
  if (!hasGenericTypeInner(name, wrapper)) {
    return null
  }

  return knownGenericTypeInner(name, wrapper)
}

function hasGenericTypeInner(name: string, wrapper: string): boolean {
  const prefixLength = wrapper.length + 1

  if (!name.startsWith(wrapper)) {
    return false
  }

  if (name.length <= prefixLength) {
    return false
  }

  if (name[wrapper.length] !== '<') {
    return false
  }

  if (!name.endsWith('>')) {
    return false
  }

  return name.length - prefixLength - 1 > 0
}

function knownGenericTypeInner(name: string, wrapper: string): string {
  const prefixLength = wrapper.length + 1

  return name.slice(prefixLength, name.length - 1)
}

function splitDelimitedTypeArgs(value: string, delimiter: string): string[] {
  const args: string[] = []
  let depth = 0
  let start = 0

  let index = 0

  while (index < value.length) {
    const unit = value.slice(index, index + 1)

    if (unit === '<') {
      depth = depth + 1
    } else if (unit === '>') {
      depth = depth - 1
    } else if (unit === delimiter && depth === 0) {
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
