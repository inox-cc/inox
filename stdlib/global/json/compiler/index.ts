import type {
  CompilerLibraryPackageDescriptor,
  LibraryCResultMappingDescriptor,
  LibraryOperationDescriptor,
  NominalTypeRef,
  ObjectTypeRef,
  TypeRef
} from '../../../../compiler/extensions/types.ts'

const libraryId = 'global:json'
const collectionsLibraryId = 'global:collections'
const arrayRuntimeRequirement = `${collectionsLibraryId}#array`
const arrayTypeId = `${collectionsLibraryId}#Array`
const runtimeRequirement = libraryId
const runtimeRequirements = [runtimeRequirement]
const valueCResultMapping: LibraryCResultMappingDescriptor = {
  cppType: 'inox::Value',
  fields: []
}
const stringCResultMapping: LibraryCResultMappingDescriptor = {
  cppType: 'inox::String',
  fields: []
}

export const compilerLibraryPackage: CompilerLibraryPackageDescriptor = {
  id: libraryId,
  dependencies: [collectionsLibraryId],
  operations: [parseOperation(), stringifyOperation()],
  intrinsicBindings: [],
  runtimeRequirements: [
    {
      id: runtimeRequirement,
      dependencies: [arrayRuntimeRequirement, 'managed-values', 'objects', 'string-bytes'],
      cPreludeIncludes: ['inox/json.h'],
      capabilities: []
    }
  ]
}

function arrayTypeRef(elementType: TypeRef): NominalTypeRef {
  return {
    kind: 'nominal',
    typeId: arrayTypeId,
    args: [elementType],
    nullable: false,
    ownership: 'value',
    traits: [{ traitId: 'iterable', args: [elementType] }]
  }
}

function parseOperation(): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: 'global:JSON.parse',
    operationId: `${libraryId}#parse`,
    kind: 'call',
    runtimeRequirements,
    cExpression: 'JSON.parse',
    cArgumentKinds: ['string-view'],
    cCallStyle: 'function',
    cResultMode: 'value',
    cFailureMode: 'thrown',
    minArgs: 1,
    maxArgs: 1,
    argumentChecks: [{ valueTypes: ['string'] }],
    resultTypeRef: objectTypeRef([]),
    cResultMapping: valueCResultMapping,
    resultInference: {
      fingerprint: `${libraryId}#parse-literal-v1`,
      literalProviderId: `${libraryId}#parse-literal`,
      argumentIndex: 0,
      contextualValueTypes: ['array', 'boolean', 'number', 'object', 'string'],
      dynamicObjectShapes: true
    }
  }
}

export function inferCompilerLibraryLiteralTypeRef(providerId: string, source: string): TypeRef | null {
  if (providerId !== `${libraryId}#parse-literal`) {
    return null
  }

  return inferJsonLiteralTypeRef(source)
}

function stringifyOperation(): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: 'global:JSON.stringify',
    operationId: `${libraryId}#stringify`,
    kind: 'call',
    runtimeRequirements,
    cExpression: 'JSON.stringify',
    cCallStyle: 'function',
    cFailureMode: 'thrown',
    minArgs: 1,
    maxArgs: 3,
    argumentChecks: [],
    variants: [
      stringifyVariant(['runtime-value']),
      stringifyVariant(['runtime-value', 'runtime-value']),
      stringifyVariant(['runtime-value', 'runtime-value', 'number'])
    ],
    resultTypeRef: primitiveTypeRef('string'),
    cResultMapping: stringCResultMapping
  }
}

function stringifyVariant(cArgumentKinds: Array<'runtime-value' | 'number'>) {
  return {
    minArgs: cArgumentKinds.length,
    maxArgs: cArgumentKinds.length,
    cArgumentKinds,
    cArgumentMethodNames: ['toJSON']
  }
}

type JsonParseLiteralTypeInfo = {
  valueType: JsonValueType
  shape: JsonObjectShape | null
  arrayElementType: JsonValueType | null
}

type JsonValueType = 'array' | 'boolean' | 'number' | 'object' | 'string' | 'unknown'

type JsonObjectShape = {
  fields: JsonObjectField[]
}

type JsonObjectField = {
  name: string
  valueType: JsonValueType
  nullable: boolean
  shape: JsonObjectShape | null
  shapeOwnership?: 'weak'
  arrayElementType: JsonValueType | null
}

type JsonParseLiteralResult = {
  info: JsonParseLiteralTypeInfo
  index: number
}

type JsonParseStringResult = {
  value: string
  index: number
}

function inferJsonLiteralTypeRef(source: string): TypeRef | null {
  const result = parseJsonLiteralType(source, 0)

  if (result === null) {
    return null
  }

  const end = skipJsonWhitespace(source, result.index)

  if (end !== source.length) {
    return null
  }

  return jsonLiteralInfoTypeRef(result.info)
}

function jsonLiteralInfoTypeRef(info: JsonParseLiteralTypeInfo): TypeRef {
  if (info.valueType === 'array') {
    return arrayTypeRef(jsonArrayElementTypeRef(info))
  }

  if (info.valueType === 'object') {
    const fields = info.shape?.fields ?? []
    const typeFields: ObjectTypeRef['fields'] = []

    for (let index = 0; index < fields.length; index = index + 1) {
      typeFields.push({
        name: fields[index].name,
        typeRef: jsonShapeFieldTypeRef(fields[index]),
        readonly: true
      })
    }

    return objectTypeRef(typeFields)
  }

  if (
    info.valueType === 'boolean' ||
    info.valueType === 'number' ||
    info.valueType === 'string'
  ) {
    return primitiveTypeRef(info.valueType)
  }

  return unknownTypeRef()
}

function jsonArrayElementTypeRef(info: JsonParseLiteralTypeInfo): TypeRef {
  if (info.arrayElementType === null || info.arrayElementType === 'unknown') {
    return unknownTypeRef()
  }

  return jsonLiteralInfoTypeRef({
    valueType: info.arrayElementType,
    shape: info.shape,
    arrayElementType: null
  })
}

function jsonShapeFieldTypeRef(field: JsonObjectField): TypeRef {
  return jsonLiteralInfoTypeRef({
    valueType: field.valueType,
    shape: field.shape,
    arrayElementType: field.arrayElementType
  })
}

function primitiveTypeRef(name: 'boolean' | 'bytes' | 'number' | 'string' | 'void'): TypeRef {
  return {
    kind: 'primitive',
    name,
    nullable: false,
    ownership: 'value',
    traits: []
  }
}

function objectTypeRef(fields: ObjectTypeRef['fields']): ObjectTypeRef {
  return {
    kind: 'object',
    fields,
    nullable: false,
    ownership: 'value',
    traits: []
  }
}

function unknownTypeRef(): TypeRef {
  return {
    kind: 'unknown',
    nullable: true,
    ownership: 'value',
    traits: []
  }
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

    if (stringResult === null) {
      return null
    }

    return {
      info: jsonLiteralTypeInfo('string'),
      index: stringResult.index
    }
  }

  if (unit === '-' || isJsonDigit(unit)) {
    const numberEnd = parseJsonNumberEnd(source, nextIndex)

    if (numberEnd === null) {
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

    if (element === null) {
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
  const fields: JsonObjectField[] = []
  let nextIndex = skipJsonWhitespace(source, index)

  if (source[nextIndex] === '}') {
    return {
      info: jsonObjectLiteralTypeInfo(fields),
      index: nextIndex + 1
    }
  }

  while (nextIndex < source.length) {
    const key = parseJsonStringLiteral(source, nextIndex, true)

    if (key === null) {
      return null
    }

    nextIndex = skipJsonWhitespace(source, key.index)

    if (source[nextIndex] !== ':') {
      return null
    }

    const value = parseJsonLiteralType(source, nextIndex + 1)

    if (value === null) {
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
        value = value + jsonSimpleEscapeValue(escaped)
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
  const elementTypes: JsonValueType[] = []

  for (let index = 0; index < elements.length; index = index + 1) {
    elementTypes.push(elements[index].valueType)
  }

  const arrayElementType = commonJsonValueType(elementTypes)
  let shape: JsonObjectShape | null = null

  if (arrayElementType === 'object') {
    shape = commonJsonArrayElementShape(elements)
  }

  return {
    valueType: 'array',
    shape,
    arrayElementType
  }
}

function commonJsonArrayElementShape(elements: JsonParseLiteralTypeInfo[]): JsonObjectShape | null {
  const fields: JsonObjectField[] = []

  for (let index = 0; index < elements.length; index = index + 1) {
    const elementFields = elements[index].shape?.fields

    if (elementFields === null || typeof elementFields === 'undefined') {
      return null
    }

    for (let fieldIndex = 0; fieldIndex < elementFields.length; fieldIndex = fieldIndex + 1) {
      const name = elementFields[fieldIndex].name

      if (jsonShapeFieldByName(fields, name) !== null) {
        continue
      }

      fields.push(commonJsonObjectField(name, elements))
    }
  }

  if (fields.length === 0) {
    return null
  }

  return { fields }
}

function commonJsonObjectField(name: string, elements: JsonParseLiteralTypeInfo[]): JsonObjectField {
  const fields: JsonObjectField[] = []
  const valueTypes: JsonValueType[] = []

  for (let index = 0; index < elements.length; index = index + 1) {
    const field = jsonShapeFieldByName(elements[index].shape?.fields ?? [], name)

    if (field !== null) {
      fields.push(field)
      valueTypes.push(field.valueType)
    }
  }

  const first = fields[0]

  if (first === null || typeof first === 'undefined') {
    throw new Error(`JSON object field ${name} has no source declaration`)
  }

  const valueType = commonJsonValueType(valueTypes)
  const nullable = fields.length !== elements.length || fields.some((field) => field.nullable === true)

  return {
    ...first,
    name,
    valueType,
    nullable,
    arrayElementType: commonJsonArrayElementType(fields),
    shape: valueType === 'object' ? commonJsonFieldShape(fields) : null
  }
}

function commonJsonFieldShape(fields: JsonObjectField[]): JsonObjectShape | null {
  const elements: JsonParseLiteralTypeInfo[] = []

  for (let index = 0; index < fields.length; index = index + 1) {
    elements.push({
      valueType: fields[index].valueType,
      shape: fields[index].shape,
      arrayElementType: fields[index].arrayElementType
    })
  }

  return commonJsonArrayElementShape(elements)
}

function jsonShapeFieldByName(fields: JsonObjectField[], name: string): JsonObjectField | null {
  for (let index = 0; index < fields.length; index = index + 1) {
    if (fields[index].name === name) {
      return fields[index]
    }
  }

  return null
}

function commonJsonArrayElementType(fields: JsonObjectField[]): JsonValueType | null {
  if (fields.length === 0) {
    return null
  }

  const first = fields[0].arrayElementType

  for (let index = 1; index < fields.length; index = index + 1) {
    if (fields[index].arrayElementType !== first) {
      return null
    }
  }

  return first
}

function commonJsonValueType(valueTypes: JsonValueType[]): JsonValueType {
  if (valueTypes.length === 0) {
    return 'unknown'
  }

  const first = valueTypes[0]

  for (let index = 1; index < valueTypes.length; index = index + 1) {
    if (valueTypes[index] !== first) {
      return 'unknown'
    }
  }

  return first
}

function jsonObjectLiteralTypeInfo(fields: JsonObjectField[]): JsonParseLiteralTypeInfo {
  return {
    valueType: 'object',
    shape: { fields },
    arrayElementType: null
  }
}

function jsonObjectLiteralField(name: string, fieldType: JsonParseLiteralTypeInfo): JsonObjectField {
  return {
    name,
    valueType: fieldType.valueType,
    nullable: fieldType.valueType === 'unknown',
    arrayElementType: fieldType.arrayElementType,
    shape: fieldType.shape
  }
}

function jsonLiteralTypeInfo(valueType: JsonValueType): JsonParseLiteralTypeInfo {
  return {
    valueType,
    shape: null,
    arrayElementType: null
  }
}
