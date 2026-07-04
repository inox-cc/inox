import { commonArrayElementType } from './assignability.ts'
import { commonResolvedObjectShape } from './resolved-types.ts'
import type { ResolvedTypeInfo } from './resolved-types.ts'
import type { AnyNode, ObjectShapeInfo, ValueType } from '../types.ts'

type JsonParseLiteralTypeInfo = {
  valueType: ValueType
  shape: ObjectShapeInfo | null
  arrayElementType: ValueType | null
  arrayElementDeclaredType: string | null
}

type JsonParseLiteralResult = {
  info: JsonParseLiteralTypeInfo
  index: number
}

type JsonParseStringResult = {
  value: string
  index: number
}

export function inferJsonParseLiteralType(expression: AnyNode): JsonParseLiteralTypeInfo | null {
  const arg = expression.args[0]

  if (arg === null || typeof arg === 'undefined' || arg.type !== 'StringLiteral') {
    return null
  }

  const source: string = arg.value
  const result = parseJsonLiteralType(source, 0)

  if (result === null || typeof result === 'undefined') {
    return null
  }

  const end = skipJsonWhitespace(source, result.index)

  if (end !== source.length) {
    return null
  }

  return result.info
}

function parseJsonLiteralType(source: string, index: number): JsonParseLiteralResult | null {
  const nextIndex = skipJsonWhitespace(source, index)
  const unit = source[nextIndex]

  if (unit === '[') {
    return parseJsonArrayLiteralType(source, nextIndex + 1)
  }

  if (unit === '{') {
    return parseJsonObjectLiteralType(source, nextIndex + 1)
  }

  if (unit === '"') {
    const stringResult = parseJsonStringLiteral(source, nextIndex, false)

    if (stringResult === null || typeof stringResult === 'undefined') {
      return null
    }

    return {
      info: jsonLiteralTypeInfo('string'),
      index: stringResult.index
    }
  }

  if (unit === '-' || isJsonDigit(unit)) {
    const numberEnd = parseJsonNumberEnd(source, nextIndex)

    if (numberEnd === null || typeof numberEnd === 'undefined') {
      return null
    }

    return {
      info: jsonLiteralTypeInfo('number'),
      index: numberEnd
    }
  }

  if (sourceStartsWith(source, nextIndex, 'true')) {
    return {
      info: jsonLiteralTypeInfo('boolean'),
      index: nextIndex + 4
    }
  }

  if (sourceStartsWith(source, nextIndex, 'false')) {
    return {
      info: jsonLiteralTypeInfo('boolean'),
      index: nextIndex + 5
    }
  }

  if (sourceStartsWith(source, nextIndex, 'null')) {
    return {
      info: jsonLiteralTypeInfo('unknown'),
      index: nextIndex + 4
    }
  }

  return null
}

function parseJsonArrayLiteralType(source: string, index: number): JsonParseLiteralResult | null {
  const elements: JsonParseLiteralTypeInfo[] = []
  let nextIndex = skipJsonWhitespace(source, index)

  if (source[nextIndex] === ']') {
    return {
      info: jsonArrayLiteralTypeInfo(elements),
      index: nextIndex + 1
    }
  }

  while (nextIndex < source.length) {
    const element = parseJsonLiteralType(source, nextIndex)

    if (element === null || typeof element === 'undefined') {
      return null
    }

    elements.push(element.info)
    nextIndex = skipJsonWhitespace(source, element.index)

    if (source[nextIndex] === ']') {
      return {
        info: jsonArrayLiteralTypeInfo(elements),
        index: nextIndex + 1
      }
    }

    if (source[nextIndex] !== ',') {
      return null
    }

    nextIndex = skipJsonWhitespace(source, nextIndex + 1)
  }

  return null
}

function parseJsonObjectLiteralType(source: string, index: number): JsonParseLiteralResult | null {
  const fields: AnyNode[] = []
  let nextIndex = skipJsonWhitespace(source, index)

  if (source[nextIndex] === '}') {
    return {
      info: jsonObjectLiteralTypeInfo(fields),
      index: nextIndex + 1
    }
  }

  while (nextIndex < source.length) {
    const key = parseJsonStringLiteral(source, nextIndex, true)

    if (key === null || typeof key === 'undefined') {
      return null
    }

    nextIndex = skipJsonWhitespace(source, key.index)

    if (source[nextIndex] !== ':') {
      return null
    }

    const value = parseJsonLiteralType(source, nextIndex + 1)

    if (value === null || typeof value === 'undefined') {
      return null
    }

    fields.push(jsonObjectLiteralField(key.value, value.info))
    nextIndex = skipJsonWhitespace(source, value.index)

    if (source[nextIndex] === '}') {
      return {
        info: jsonObjectLiteralTypeInfo(fields),
        index: nextIndex + 1
      }
    }

    if (source[nextIndex] !== ',') {
      return null
    }

    nextIndex = skipJsonWhitespace(source, nextIndex + 1)
  }

  return null
}

function parseJsonStringLiteral(source: string, index: number, captureValue: boolean): JsonParseStringResult | null {
  if (source[index] !== '"') {
    return null
  }

  let nextIndex = index + 1
  let value = ''

  while (nextIndex < source.length) {
    const unit = source[nextIndex]

    if (unit === '"') {
      return {
        value,
        index: nextIndex + 1
      }
    }

    if (unit === '\\') {
      const escaped = source[nextIndex + 1]

      if (escaped === 'u') {
        if (!isJsonHexEscape(source, nextIndex + 2)) {
          return null
        }

        if (captureValue) {
          return null
        }

        nextIndex = nextIndex + 6
        continue
      }

      if (!isJsonSimpleEscape(escaped)) {
        return null
      }

      if (captureValue) {
        const escapedValue: string = jsonSimpleEscapeValue(escaped)
        value = value + escapedValue
      }

      nextIndex = nextIndex + 2
      continue
    }

    if (unit.charCodeAt(0) < 32) {
      return null
    }

    if (captureValue) {
      value = value + unit
    }

    nextIndex = nextIndex + 1
  }

  return null
}

function parseJsonNumberEnd(source: string, index: number): number | null {
  let nextIndex = index

  if (source[nextIndex] === '-') {
    nextIndex = nextIndex + 1
  }

  if (source[nextIndex] === '0') {
    nextIndex = nextIndex + 1
  } else if (isJsonNonZeroDigit(source[nextIndex])) {
    nextIndex = nextIndex + 1

    while (isJsonDigit(source[nextIndex])) {
      nextIndex = nextIndex + 1
    }
  } else {
    return null
  }

  if (source[nextIndex] === '.') {
    nextIndex = nextIndex + 1

    if (!isJsonDigit(source[nextIndex])) {
      return null
    }

    while (isJsonDigit(source[nextIndex])) {
      nextIndex = nextIndex + 1
    }
  }

  if (source[nextIndex] === 'e' || source[nextIndex] === 'E') {
    nextIndex = nextIndex + 1

    if (source[nextIndex] === '+' || source[nextIndex] === '-') {
      nextIndex = nextIndex + 1
    }

    if (!isJsonDigit(source[nextIndex])) {
      return null
    }

    while (isJsonDigit(source[nextIndex])) {
      nextIndex = nextIndex + 1
    }
  }

  return nextIndex
}

function skipJsonWhitespace(source: string, index: number): number {
  let nextIndex = index

  while (
    source[nextIndex] === ' ' ||
    source[nextIndex] === '\n' ||
    source[nextIndex] === '\r' ||
    source[nextIndex] === '\t'
  ) {
    nextIndex = nextIndex + 1
  }

  return nextIndex
}

function isJsonDigit(value: string | null | undefined): boolean {
  return value === '0' || isJsonNonZeroDigit(value)
}

function isJsonNonZeroDigit(value: string | null | undefined): boolean {
  return (
    value === '1' ||
    value === '2' ||
    value === '3' ||
    value === '4' ||
    value === '5' ||
    value === '6' ||
    value === '7' ||
    value === '8' ||
    value === '9'
  )
}

function isJsonHexEscape(source: string, index: number): boolean {
  for (let offset = 0; offset < 4; offset = offset + 1) {
    if (!isJsonHexDigit(source[index + offset])) {
      return false
    }
  }

  return true
}

function isJsonHexDigit(value: string | null | undefined): boolean {
  return (
    isJsonDigit(value) ||
    value === 'a' ||
    value === 'b' ||
    value === 'c' ||
    value === 'd' ||
    value === 'e' ||
    value === 'f' ||
    value === 'A' ||
    value === 'B' ||
    value === 'C' ||
    value === 'D' ||
    value === 'E' ||
    value === 'F'
  )
}

function isJsonSimpleEscape(value: string | null | undefined): boolean {
  return (
    value === '"' ||
    value === '\\' ||
    value === '/' ||
    value === 'b' ||
    value === 'f' ||
    value === 'n' ||
    value === 'r' ||
    value === 't'
  )
}

function jsonSimpleEscapeValue(value: string): string {
  if (value === 'b') {
    return '\b'
  }

  if (value === 'f') {
    return '\f'
  }

  if (value === 'n') {
    return '\n'
  }

  if (value === 'r') {
    return '\r'
  }

  if (value === 't') {
    return '\t'
  }

  return value
}

function sourceStartsWith(source: string, index: number, expected: string): boolean {
  for (let offset = 0; offset < expected.length; offset = offset + 1) {
    if (source[index + offset] !== expected[offset]) {
      return false
    }
  }

  return true
}

function jsonArrayLiteralTypeInfo(elements: JsonParseLiteralTypeInfo[]): JsonParseLiteralTypeInfo {
  const elementTypes: ValueType[] = []

  for (let index = 0; index < elements.length; index = index + 1) {
    elementTypes.push(elements[index].valueType)
  }

  const arrayElementType = commonArrayElementType(elementTypes)
  let arrayElementDeclaredType: string | null = null
  let shape: ObjectShapeInfo | null = null

  if (arrayElementType !== 'unknown') {
    arrayElementDeclaredType = arrayElementType
  }

  if (arrayElementType === 'object') {
    shape = commonJsonArrayElementShape(elements)
  }

  return {
    valueType: 'array',
    shape,
    arrayElementType,
    arrayElementDeclaredType
  }
}

function commonJsonArrayElementShape(elements: JsonParseLiteralTypeInfo[]): ObjectShapeInfo | null {
  const infos: ResolvedTypeInfo[] = []

  for (let index = 0; index < elements.length; index = index + 1) {
    const element = elements[index]

    infos.push({
      valueType: element.valueType,
      nullable: false,
      functionType: null,
      shape: element.shape,
      arrayElementType: element.arrayElementType,
      arrayElementDeclaredType: element.arrayElementDeclaredType,
      mapKeyType: null,
      mapValueType: null,
      mapValueShape: null,
      promiseValueType: null,
      setElementType: null
    })
  }

  return commonResolvedObjectShape(infos)
}

function jsonObjectLiteralTypeInfo(fields: AnyNode[]): JsonParseLiteralTypeInfo {
  return {
    valueType: 'object',
    shape: {
      kind: 'object',
      dynamic: true,
      fields
    },
    arrayElementType: null,
    arrayElementDeclaredType: null
  }
}

function jsonObjectLiteralField(name: string, fieldType: JsonParseLiteralTypeInfo): AnyNode {
  return {
    type: 'Field',
    name,
    valueType: fieldType.valueType,
    nullable: fieldType.valueType === 'unknown',
    arrayElementType: fieldType.arrayElementType,
    arrayElementDeclaredType: fieldType.arrayElementDeclaredType,
    mapKeyType: null,
    mapValueType: null,
    promiseValueType: null,
    setElementType: null,
    shape: fieldType.shape,
    loc: { line: 1, column: 1 }
  }
}

function jsonLiteralTypeInfo(valueType: ValueType): JsonParseLiteralTypeInfo {
  return {
    valueType,
    shape: null,
    arrayElementType: null,
    arrayElementDeclaredType: null
  }
}
