import {
  binaryConstructorName,
  binaryInstanceRuntimeMethodName,
  binaryStaticRuntimeMethodName,
  bufferRuntimeConstantName,
  childProcessRuntimeCallInfo,
  checkCryptoCall as checkPackageCryptoCall,
  checkCryptoHashMethodCall as checkPackageCryptoHashMethodCall,
  cryptoRuntimeCallInfo,
  fsRuntimeCallInfo,
  fsRuntimeCallInfoFromImportSymbol,
  fsRuntimeCallPlan,
  fsRuntimeConstantName,
  fsStatsRuntimeMethodInfo,
  isFsPromisesImportSymbol,
  isFsRuntimeRootSymbol,
  isOsRuntimeConstantImport,
  isPathRuntimeConstantImport,
  isTimerHandleMethod,
  isTimerRuntimeImportSymbol,
  isUrlMutableObjectField,
  isUrlSearchParamsRuntimeMethod,
  nodeStdlibRuntimeObjectInfo,
  osRuntimeCallInfo,
  osRuntimeConstantName,
  pathRuntimeCallInfo,
  pathRuntimeConstantName,
  processRuntimeAssignmentProperty,
  processRuntimeCallInfo,
  processRuntimeIndexProperty,
  processRuntimeMemberInfo,
  processRuntimePropertyImportInfo,
  timerCallbackFunctionType,
  timerClearMethodName,
  timerRuntimeImportMethodName,
  timerRuntimeMethodName,
  unsupportedBufferRuntimeExport,
  unsupportedEventsRuntimeExport,
  unsupportedStreamRuntimeExport,
  urlRuntimeCallInfo,
  urlRuntimeConstructorImportInfo
} from './stdlib/node/checker.ts'
import type {
  CryptoCheckerContext,
  CryptoCheckerDiagnostic,
  CryptoHashMethodCheckerContext,
  FsBooleanOptions,
  FsRuntimeArgumentCheck,
  FsRuntimeCallInfo,
  FsRuntimeCallPlan
} from './stdlib/node/checker.ts'
import {
  commonArrayElementType,
  commonValueType,
  inferBinaryExpressionType,
  isAssignableType,
  isEqualityComparableType,
  isEqualityOperator,
  isMatchingSwitchCaseType,
  isSwitchableType
} from './checker/assignability.ts'
import {
  builtinGlobalSymbol,
  childProcessSpawnSyncResultShape,
  debugMemoryStatsObjectShape,
  errorObjectShape,
  fetchAbortControllerObjectShape,
  fetchResponseObjectShape,
  fsDirentObjectShape,
  fsStatsObjectShape,
  libuvOnlyRuntimeImportFeature,
  pathParseObjectShape,
  urlObjectShape,
  urlSearchParamsObjectShape
} from './checker/builtins.ts'
import {
  fetchAbortControllerConstructorName,
  fetchAbortControllerRuntimeMethod,
  fetchHeadersRuntimeMethodName,
  fetchInitOptionName,
  fetchResponseBodyMethodInfo,
  fetchRuntimeCallName,
  isJsonParseDeclaredType,
  isFetchHttpsLiteral,
  isFetchUnsupportedResponseBodyMember,
  isMathRuntimeMethod,
  isSupportedFetchRedirectLiteral,
  jsonRuntimeMethodName
} from '../stdlib/global/compiler/checker.ts'
import { runtimeImportValueType } from './stdlib/node/runtime-imports.ts'
import {
  dateInstanceRuntimeMethodInfo,
  isDateConstructorRuntimeExpression,
  timeRuntimeCallInfo
} from '../stdlib/global/compiler/checker.ts'
import { diagnostic, throwDiagnostics } from './diagnostics.ts'
import { memberExpressionPath } from './member-paths.ts'
import {
  collectionConstructorNameFromPath,
  isArrayMethod,
  isNumericCastName,
  isStringIndexMethod,
  isStringPredicateMethod,
  mapRuntimeMethodName,
  setRuntimeMethodName,
  stringRuntimeMethodName
} from '../stdlib/global/compiler/descriptor.ts'
import {
  debugRuntimeMethodNameFromKnownPath,
  isDebugRuntimeMethodPath,
  knownMathRuntimeArgCount
} from '../stdlib/global/compiler/descriptor.ts'
import type { StdlibModuleId } from './stdlib/node/modules.ts'
import {
  isStdlibModuleImportSource,
  isStdlibModuleImportSourceForId,
  isStdlibModuleRuntimeImportBinding
} from './stdlib/node/modules.ts'
import {
  isUnsupportedRuntimeBuiltinImportSource,
  unsupportedRuntimeBuiltinImportMessageFromKnownSource
} from './stdlib/node/builtins.ts'
import {
  arrayElementTypeNameFromKnownTypeName,
  isArrayTypeName,
  isBuiltinValueType,
  isBytesTypeName,
  isNullableTypeName,
  isPromiseTypeName,
  isSetTypeName,
  mapTypeNamesFromTypeName,
  nullableTypeNameFromKnownTypeName,
  promiseValueTypeNameFromKnownTypeName,
  recordTypeNamesFromTypeName,
  setElementTypeNameFromKnownTypeName,
  unionTypeNamesFromTypeName
} from './type-names.ts'
import type {
  AnyNode,
  CompileOptions,
  Diagnostic,
  ObjectShapeInfo,
  ProgramNode,
  SourceLocation,
  SymbolInfo,
  TypeAliasInfo,
  ValueType
} from './types.ts'

type ResolvedTypeInfo = {
  valueType: ValueType
  nullable: boolean
  functionType: FunctionTypeMetadata | null
  shape: ObjectShapeInfo | null
  arrayElementType: ValueType | null
  arrayElementDeclaredType: string | null
  arrayElementFunctionType?: FunctionTypeMetadata | null
  mapKeyType: ValueType | null
  mapValueType: ValueType | null
  mapValueShape: ObjectShapeInfo | null
  promiseValueType: ValueType | null
  setElementType: ValueType | null
}

type ResolvedTypeInfoValueKind = number

const resolvedArrayElementTypeKind: ResolvedTypeInfoValueKind = 0
const resolvedMapKeyTypeKind: ResolvedTypeInfoValueKind = 1
const resolvedMapValueTypeKind: ResolvedTypeInfoValueKind = 2
const resolvedPromiseValueTypeKind: ResolvedTypeInfoValueKind = 3
const resolvedSetElementTypeKind: ResolvedTypeInfoValueKind = 4

type OwnershipGraphEdge = {
  from: string
  to: string
  field: string
  loc: SourceLocation
}

type OptionalParamInfo = {
  optional?: boolean
  rest?: boolean
  [key: string]: unknown
}

type PromiseCallbackParamMetadata = {
  shape: ObjectShapeInfo | null
}

type CheckerNode = AnyNode
type NullableNode = AnyNode | null
type TypeAliasDeclarationNode = AnyNode & {
  name: string
  loc: SourceLocation
  valueType: TypeAliasInfo
}
type CheckerObjectPropertyNode = CheckerNode & {
  key: string
  loc: SourceLocation
  value: CheckerNode
}

type FunctionTypeParamMetadata = {
  name: string
  loc: SourceLocation
  optional?: boolean
  rest?: boolean
  declaredType?: string
  valueType: ValueType
  nullable?: boolean
  arrayElementType?: ValueType | null
  arrayElementDeclaredType?: string | null
  arrayElementFunctionType?: FunctionTypeMetadata | null
  arrayElementFunctionTypeOwnership?: 'weak'
  mapKeyType?: ValueType | null
  mapValueType?: ValueType | null
  mapValueShape?: ObjectShapeInfo | null
  promiseValueType?: ValueType | null
  setElementType?: ValueType | null
  functionType?: FunctionTypeMetadata | null
  functionTypeOwnership?: 'weak'
  shape?: ObjectShapeInfo | null
  [key: string]: any
}

type FunctionTypeMetadata = {
  kind?: string
  resolved: boolean
  params: FunctionTypeParamMetadata[]
  returnType: ValueType
  declaredReturnType?: string
  returnNullable: boolean
  returnArrayElementType?: ValueType | null
  returnArrayElementDeclaredType?: string | null
  returnMapKeyType?: ValueType | null
  returnMapValueType?: ValueType | null
  returnPromiseValueType?: ValueType | null
  returnSetElementType?: ValueType | null
  returnShape?: ObjectShapeInfo | null
  loc?: SourceLocation
  [key: string]: any
}

type CheckerMapType = {
  key: ValueType | null
  value: ValueType | null
  valueShape?: ObjectShapeInfo | null
}

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

type NullableConditionNarrowing = {
  trueNames: string[]
  falseNames: string[]
}

type ObjectShapeBases = {
  dynamic: boolean
  dynamicField: AnyNode | null
  fields: AnyNode[]
}

type CheckProgramResult = {
  ast: ProgramNode
}

type RuntimeCallInfo = {
  method: string
  label: string
  unsupported: boolean
}

type AnyNodeFieldOptions = {
  arrayElementType?: ValueType | null
  arrayElementDeclaredType?: string | null
  shape?: ObjectShapeInfo | null
}

function isAnyNodeChildFieldName(name: string): boolean {
  return (
    name === 'argument' ||
    name === 'callee' ||
    name === 'expression' ||
    name === 'handler' ||
    name === 'index' ||
    name === 'init' ||
    name === 'left' ||
    name === 'object' ||
    name === 'right' ||
    name === 'target'
  )
}

function isUnsupportedEqualityOperator(operator: string): boolean {
  return (
    operator.length === 2 &&
    (operator[0] === '=' || operator[0] === '!') &&
    operator[1] === '='
  )
}

function anyNodeResolvedTypeInfo(loc: SourceLocation): ResolvedTypeInfo {
  return {
    valueType: 'object',
    nullable: false,
    functionType: null,
    shape: anyNodeObjectShape(loc),
    arrayElementType: null,
    arrayElementDeclaredType: null,
    mapKeyType: null,
    mapValueType: null,
    mapValueShape: null,
    promiseValueType: null,
    setElementType: null
  }
}

function anyNodeObjectShape(loc: SourceLocation): ObjectShapeInfo {
  return {
    kind: 'object',
    builtin: 'compiler.AnyNode',
    dynamic: true,
    dynamicField: anyNodeField('', 'unknown', null, true, loc),
    fields: [
      anyNodeField('type', 'string', null, true, loc),
      anyNodeField('loc', 'object', null, true, loc, { shape: anyNodeLocObjectShape(loc) }),
      anyNodeField('name', 'string', null, false, loc),
      anyNodeField('imported', 'string', null, false, loc),
      anyNodeField('local', 'string', null, false, loc),
      anyNodeField('source', 'string', null, false, loc),
      anyNodeField('path', 'array', null, false, loc, {
        arrayElementType: 'string',
        arrayElementDeclaredType: 'string'
      }),
      anyNodeField('args', 'array', null, false, loc, {
        arrayElementType: 'object'
      }),
      anyNodeField('params', 'array', null, false, loc, {
        arrayElementType: 'object'
      }),
      anyNodeField('methods', 'array', null, false, loc, {
        arrayElementType: 'object'
      }),
      anyNodeField('fields', 'array', null, false, loc, {
        arrayElementType: 'object'
      }),
      anyNodeField('properties', 'array', null, false, loc, {
        arrayElementType: 'object'
      }),
      anyNodeField('elements', 'array', null, false, loc, {
        arrayElementType: 'object'
      }),
      anyNodeField('cases', 'array', null, false, loc, {
        arrayElementType: 'object'
      }),
      anyNodeField('specifiers', 'array', null, false, loc, {
        arrayElementType: 'object',
        arrayElementDeclaredType: 'AnyNode'
      }),
      anyNodeField('body', 'unknown', null, false, loc),
      anyNodeField('callee', 'unknown', null, false, loc),
      anyNodeField('expression', 'unknown', null, false, loc),
      anyNodeField('init', 'unknown', null, false, loc),
      anyNodeField('target', 'unknown', null, false, loc),
      anyNodeField('value', 'unknown', null, false, loc),
      anyNodeField('left', 'unknown', null, false, loc),
      anyNodeField('right', 'unknown', null, false, loc),
      anyNodeField('argument', 'unknown', null, false, loc),
      anyNodeField('block', 'unknown', null, false, loc),
      anyNodeField('object', 'unknown', null, false, loc),
      anyNodeField('index', 'unknown', null, false, loc),
      anyNodeField('handler', 'object', 'AnyNode', true, loc),
      anyNodeField('finalizer', 'unknown', null, true, loc),
      anyNodeField('param', 'string', null, true, loc),
      anyNodeField('paramLoc', 'object', null, true, loc, { shape: anyNodeLocObjectShape(loc) }),
      anyNodeField('expressionBody', 'boolean', null, false, loc),
      anyNodeField('default', 'boolean', null, true, loc),
      anyNodeField('typeOnly', 'boolean', null, false, loc),
      anyNodeField('property', 'string', null, false, loc),
      anyNodeField('operator', 'string', null, false, loc),
      anyNodeField('raw', 'string', null, false, loc),
      anyNodeField('pattern', 'string', null, false, loc),
      anyNodeField('flags', 'string', null, false, loc),
      anyNodeField('declaredType', 'string', null, true, loc),
      anyNodeField('valueType', 'string', null, true, loc),
      anyNodeField('arrayElementType', 'string', null, true, loc),
      anyNodeField('arrayElementDeclaredType', 'string', null, true, loc),
      anyNodeField('arrayElementFunctionType', 'object', null, true, loc),
      anyNodeField('mapKeyType', 'string', null, true, loc),
      anyNodeField('mapValueType', 'string', null, true, loc),
      anyNodeField('promiseValueType', 'string', null, true, loc),
      anyNodeField('promiseRejectionValueType', 'string', null, true, loc),
      anyNodeField('setElementType', 'string', null, true, loc),
      anyNodeField('propertyValueType', 'string', null, true, loc),
      anyNodeField('returnType', 'string', null, true, loc),
      anyNodeField('declaredReturnType', 'string', null, true, loc),
      anyNodeField('returnArrayElementType', 'string', null, true, loc),
      anyNodeField('returnArrayElementDeclaredType', 'string', null, true, loc),
      anyNodeField('returnMapKeyType', 'string', null, true, loc),
      anyNodeField('returnMapValueType', 'string', null, true, loc),
      anyNodeField('returnPromiseValueType', 'string', null, true, loc),
      anyNodeField('returnSetElementType', 'string', null, true, loc),
      anyNodeField('returnNullable', 'boolean', null, false, loc),
      anyNodeField('returnShape', 'object', null, true, loc),
      anyNodeField('functionType', 'object', null, true, loc),
      anyNodeField('shape', 'object', null, true, loc),
      anyNodeField('rest', 'boolean', null, false, loc),
      anyNodeField('pathRuntimeMethod', 'string', null, true, loc),
      anyNodeField('pathRuntimeConstant', 'string', null, true, loc),
      anyNodeField('processRuntimeMethod', 'string', null, true, loc),
      anyNodeField('processRuntimeProperty', 'string', null, true, loc),
      anyNodeField('processRuntimeEnvName', 'string', null, true, loc),
      anyNodeField('runtimeObjectName', 'string', null, true, loc),
      anyNodeField('runtimeObjectSource', 'string', null, true, loc),
      anyNodeField('dgramMessageHandlerName', 'string', null, true, loc),
      anyNodeField('regexpRuntimeMethod', 'string', null, true, loc),
      anyNodeField('urlRuntimeMethod', 'string', null, true, loc),
      anyNodeField('urlRuntimeField', 'string', null, true, loc),
      anyNodeField('httpHandlerName', 'string', null, true, loc)
    ]
  }
}

function anyNodeLocObjectShape(loc: SourceLocation): ObjectShapeInfo {
  return {
    kind: 'object',
    fields: [
      anyNodeField('file', 'string', null, true, loc),
      anyNodeField('line', 'number', null, false, loc),
      anyNodeField('column', 'number', null, false, loc)
    ]
  }
}

function anyNodeField(
  name: string,
  valueType: ValueType,
  declaredType: string | null,
  nullable: boolean,
  loc: SourceLocation,
  options: AnyNodeFieldOptions = {}
): AnyNode {
  return {
    name,
    optional: true,
    readonly: false,
    ownership: 'strong',
    declaredType,
    valueType,
    nullable,
    arrayElementType: options.arrayElementType ?? null,
    arrayElementDeclaredType: options.arrayElementDeclaredType ?? null,
    arrayElementFunctionType: null,
    mapKeyType: null,
    mapValueType: null,
    promiseValueType: null,
    setElementType: null,
    functionType: null,
    shape: options.shape ?? null,
    loc
  }
}

function resolvedValueTypeMetadata(
  value: ValueType | null | undefined,
  fallback: ValueType | null | undefined
): ValueType | null {
  if (value !== null && typeof value !== 'undefined') {
    return value
  }

  if (fallback !== null && typeof fallback !== 'undefined') {
    return fallback
  }

  return null
}

function resolvedConcreteValueTypeMetadata(
  value: ValueType | null | undefined,
  fallback: ValueType | null | undefined
): ValueType {
  const resolved = resolvedValueTypeMetadata(value, fallback)

  if (resolved !== null && typeof resolved !== 'undefined') {
    return resolved
  }

  return 'unknown'
}

function resolvedStringMetadata(value: string | null | undefined, fallback: string | null | undefined): string | null {
  if (value !== null && typeof value !== 'undefined') {
    return value
  }

  if (fallback !== null && typeof fallback !== 'undefined') {
    return fallback
  }

  return null
}

function firstPathSegment(path: readonly string[]): string {
  return path[0]
}

function nullableNarrowingKey(expression: AnyNode | null | undefined): string | null {
  const path = memberExpressionPath(expression)

  if (path.length === 0) {
    return null
  }

  return joinStrings(path, '.')
}

function isOptionalChainProtectedExpression(expression: AnyNode | null | undefined): boolean {
  if (expression === null || typeof expression === 'undefined') {
    return false
  }

  return expression.optionalChainProtected === true
}

function resolvedObjectShapeMetadata(
  value: ObjectShapeInfo | null | undefined,
  fallback: ObjectShapeInfo | null | undefined
): ObjectShapeInfo | null {
  if (value !== null && typeof value !== 'undefined') {
    return value
  }

  if (fallback !== null && typeof fallback !== 'undefined') {
    return fallback
  }

  return null
}

function resolvedFieldNullableMetadata(field: AnyNode, fieldType: ResolvedTypeInfo): boolean {
  if (field.ownership === 'weak') {
    return true
  }

  if (field.nullable === true) {
    return true
  }

  return fieldType.nullable
}

function resolvedFunctionTypeMetadata(
  value: FunctionTypeMetadata | null | undefined,
  fallback: FunctionTypeMetadata | null | undefined
): FunctionTypeMetadata | null {
  if (value !== null && typeof value !== 'undefined') {
    return value
  }

  if (fallback !== null && typeof fallback !== 'undefined') {
    return fallback
  }

  return null
}

function stringAt(values: string[], index: number): string {
  return values[index]
}

function checkerNodeAt(values: CheckerNode[], index: number): CheckerNode {
  return values[index]
}

function nodeNameEquals(node: AnyNode, name: string): boolean {
  return node.name === name
}

function nodeValueTypeOrUnknown(node: AnyNode): ValueType {
  const valueType = node.valueType

  if (valueType !== null && typeof valueType !== 'undefined') {
    return valueType
  }

  return 'unknown'
}

function nodeDeclaredTypeOrValueType(node: AnyNode): string {
  const declaredType = node.declaredType

  if (declaredType !== null && typeof declaredType !== 'undefined') {
    return declaredType
  }

  return nodeValueTypeOrUnknown(node)
}

function optionalParamAt(values: OptionalParamInfo[], index: number): OptionalParamInfo {
  return values[index]
}

function isOptionalParam(param: OptionalParamInfo): boolean {
  if (param.rest === true) {
    return true
  }

  if (param.optional === true) {
    return true
  }

  return param.defaultValue !== null && typeof param.defaultValue !== 'undefined'
}

function conditionalExpressionValueType(consequentType: ValueType, alternateType: ValueType): ValueType {
  if (consequentType === alternateType) {
    return consequentType
  }

  if (consequentType === 'null') {
    return alternateType
  }

  if (alternateType === 'null') {
    return consequentType
  }

  if (consequentType === 'unknown') {
    return alternateType
  }

  if (alternateType === 'unknown') {
    return consequentType
  }

  return 'unknown'
}

function resolvedTypeInfoAt(values: ResolvedTypeInfo[], index: number): ResolvedTypeInfo {
  return values[index]
}

function stringSetFromArray(values: string[]): Set<string> {
  const result: Set<string> = new Set()

  for (let index = 0; index < values.length; index = index + 1) {
    result.add(stringAt(values, index))
  }

  return result
}

function cloneStringSet(values: Set<string>): Set<string> {
  return new Set(values)
}

function deleteNullableNarrowingKey(values: Set<string>, key: string): void {
  values.delete(key)

  const prefix = `${key}.`
  const stale: string[] = []

  for (const value of values) {
    if (value.startsWith(prefix)) {
      stale.push(value)
    }
  }

  for (const value of stale) {
    values.delete(value)
  }
}

function resolvedTypeListHasNullable(infos: ResolvedTypeInfo[]): boolean {
  for (let index = 0; index < infos.length; index = index + 1) {
    if (infos[index].nullable) {
      return true
    }
  }

  return false
}

function commonResolvedArrayElementType(infos: ResolvedTypeInfo[]): ValueType | null {
  return commonResolvedOptionalValueType(infos, resolvedArrayElementTypeKind)
}

function commonResolvedMapKeyType(infos: ResolvedTypeInfo[]): ValueType | null {
  return commonResolvedOptionalValueType(infos, resolvedMapKeyTypeKind)
}

function commonResolvedMapValueType(infos: ResolvedTypeInfo[]): ValueType | null {
  return commonResolvedOptionalValueType(infos, resolvedMapValueTypeKind)
}

function commonResolvedMapValueShape(infos: ResolvedTypeInfo[]): ObjectShapeInfo | null {
  let shape: ObjectShapeInfo | null = null

  for (let index = 0; index < infos.length; index = index + 1) {
    const info = resolvedTypeInfoAt(infos, index)

    if (info.mapValueShape === null || typeof info.mapValueShape === 'undefined') {
      return null
    }

    if (shape === null || typeof shape === 'undefined') {
      shape = info.mapValueShape
    }
  }

  return shape
}

function commonResolvedPromiseValueType(infos: ResolvedTypeInfo[]): ValueType | null {
  return commonResolvedOptionalValueType(infos, resolvedPromiseValueTypeKind)
}

function commonResolvedSetElementType(infos: ResolvedTypeInfo[]): ValueType | null {
  return commonResolvedOptionalValueType(infos, resolvedSetElementTypeKind)
}

function commonResolvedObjectShape(infos: ResolvedTypeInfo[]): ObjectShapeInfo | null {
  if (infos.length === 0) {
    return null
  }

  const fields: AnyNode[] = []

  for (let infoIndex = 0; infoIndex < infos.length; infoIndex = infoIndex + 1) {
    const info = resolvedTypeInfoAt(infos, infoIndex)
    const shape = info.shape

    if (
      shape === null ||
      typeof shape === 'undefined' ||
      shape.fields === null ||
      typeof shape.fields === 'undefined'
    ) {
      return null
    }

    for (let fieldIndex = 0; fieldIndex < shape.fields.length; fieldIndex = fieldIndex + 1) {
      const field = shape.fields[fieldIndex]

      if (objectShapeFieldByName({ kind: 'object', fields }, field.name)) {
        continue
      }

      const common = commonResolvedObjectShapeField(field.name, infos)

      if (common !== null && typeof common !== 'undefined') {
        fields.push(common)
      }
    }
  }

  if (fields.length === 0) {
    return null
  }

  return {
    kind: 'object',
    fields
  }
}

function commonResolvedObjectShapeField(name: string, infos: ResolvedTypeInfo[]): AnyNode | null {
  const fields: AnyNode[] = []
  const valueTypes: ValueType[] = []
  let nullable = false
  let optional = false
  let missing = false

  for (let index = 0; index < infos.length; index = index + 1) {
    const info = resolvedTypeInfoAt(infos, index)
    const shape = info.shape

    if (shape === null || typeof shape === 'undefined') {
      return null
    }

    const field = objectShapeFieldByName(shape, name)

    if (field === null || typeof field === 'undefined') {
      missing = true
      continue
    }

    fields.push(field)
    valueTypes.push(nodeValueTypeOrUnknown(field))

    if (field.nullable === true) {
      nullable = true
    }

    if (field.optional === true) {
      optional = true
    }
  }

  const valueType = commonValueType(valueTypes)

  if (valueTypes.length === 0 || valueType === 'unknown') {
    return null
  }

  const first = fields[0]

  return {
    type: first.type,
    name,
    optional: optional || missing,
    readonly: commonResolvedObjectShapeFieldReadonly(fields),
    ownership: commonResolvedObjectShapeFieldOwnership(fields),
    weakLoc: first.weakLoc,
    static: first.static,
    staticLoc: first.staticLoc,
    weakTypeValidated: first.weakTypeValidated,
    loc: first.loc,
    declaredType: commonResolvedObjectShapeFieldDeclaredType(fields),
    valueType,
    nullable,
    arrayElementType: commonResolvedObjectShapeFieldArrayElementType(fields),
    arrayElementDeclaredType: commonResolvedObjectShapeFieldArrayElementDeclaredType(fields),
    mapKeyType: commonResolvedObjectShapeFieldMapKeyType(fields),
    mapValueType: commonResolvedObjectShapeFieldMapValueType(fields),
    mapValueShape: commonResolvedObjectShapeFieldMapValueShape(fields),
    promiseValueType: commonResolvedObjectShapeFieldPromiseValueType(fields),
    setElementType: commonResolvedObjectShapeFieldSetElementType(fields),
    functionType: commonResolvedObjectShapeFieldFunctionType(fields),
    shape: commonResolvedObjectShapeFieldShape(fields)
  }
}

function objectShapeFieldByName(shape: ObjectShapeInfo, name: string): AnyNode | null {
  const fields = shape.fields

  for (let index = 0; index < fields.length; index = index + 1) {
    const field = fields[index]

    if (field.name === name) {
      return field
    }
  }

  return null
}

function commonResolvedObjectShapeFieldReadonly(fields: AnyNode[]): boolean {
  for (let index = 0; index < fields.length; index = index + 1) {
    if (fields[index].readonly !== true) {
      return false
    }
  }

  return fields.length > 0
}

function commonResolvedObjectShapeFieldOwnership(fields: AnyNode[]): string | null {
  const first = fields[0]
  let ownership: string | null = null

  if (first.ownership !== null && typeof first.ownership !== 'undefined') {
    ownership = first.ownership
  }

  for (let index = 1; index < fields.length; index = index + 1) {
    const field = fields[index]
    let current: string | null = null

    if (field.ownership !== null && typeof field.ownership !== 'undefined') {
      current = field.ownership
    }

    if (current !== ownership) {
      return null
    }
  }

  return ownership
}

function commonResolvedObjectShapeFieldDeclaredType(fields: AnyNode[]): string | null {
  const first = fields[0]
  let declaredType: string | null = null

  if (first.declaredType !== null && typeof first.declaredType !== 'undefined') {
    declaredType = first.declaredType
  }

  for (let index = 1; index < fields.length; index = index + 1) {
    const field = fields[index]
    let current: string | null = null

    if (field.declaredType !== null && typeof field.declaredType !== 'undefined') {
      current = field.declaredType
    }

    if (current !== declaredType) {
      return null
    }
  }

  return declaredType
}

function commonResolvedObjectShapeFieldArrayElementType(fields: AnyNode[]): ValueType | null {
  const values: ValueType[] = []

  for (let index = 0; index < fields.length; index = index + 1) {
    const value = fields[index].arrayElementType

    if (value === null || typeof value === 'undefined') {
      return null
    }

    values.push(value)
  }

  return commonValueType(values)
}

function commonResolvedObjectShapeFieldArrayElementDeclaredType(fields: AnyNode[]): string | null {
  const first = fields[0]
  let declaredType: string | null = null

  if (first.arrayElementDeclaredType !== null && typeof first.arrayElementDeclaredType !== 'undefined') {
    declaredType = first.arrayElementDeclaredType
  }

  for (let index = 1; index < fields.length; index = index + 1) {
    const field = fields[index]
    let current: string | null = null

    if (field.arrayElementDeclaredType !== null && typeof field.arrayElementDeclaredType !== 'undefined') {
      current = field.arrayElementDeclaredType
    }

    if (current !== declaredType) {
      return null
    }
  }

  return declaredType
}

function commonResolvedObjectShapeFieldMapKeyType(fields: AnyNode[]): ValueType | null {
  const values: ValueType[] = []

  for (let index = 0; index < fields.length; index = index + 1) {
    const value = fields[index].mapKeyType

    if (value === null || typeof value === 'undefined') {
      return null
    }

    values.push(value)
  }

  return commonValueType(values)
}

function commonResolvedObjectShapeFieldMapValueType(fields: AnyNode[]): ValueType | null {
  const values: ValueType[] = []

  for (let index = 0; index < fields.length; index = index + 1) {
    const value = fields[index].mapValueType

    if (value === null || typeof value === 'undefined') {
      return null
    }

    values.push(value)
  }

  return commonValueType(values)
}

function commonResolvedObjectShapeFieldMapValueShape(fields: AnyNode[]): ObjectShapeInfo | null {
  let shape: ObjectShapeInfo | null = null

  for (let index = 0; index < fields.length; index = index + 1) {
    const value = fields[index].mapValueShape

    if (value === null || typeof value === 'undefined') {
      return null
    }

    if (shape === null || typeof shape === 'undefined') {
      shape = value
    }
  }

  return shape
}

function commonResolvedObjectShapeFieldPromiseValueType(fields: AnyNode[]): ValueType | null {
  const values: ValueType[] = []

  for (let index = 0; index < fields.length; index = index + 1) {
    const value = fields[index].promiseValueType

    if (value === null || typeof value === 'undefined') {
      return null
    }

    values.push(value)
  }

  return commonValueType(values)
}

function commonResolvedObjectShapeFieldSetElementType(fields: AnyNode[]): ValueType | null {
  const values: ValueType[] = []

  for (let index = 0; index < fields.length; index = index + 1) {
    const value = fields[index].setElementType

    if (value === null || typeof value === 'undefined') {
      return null
    }

    values.push(value)
  }

  return commonValueType(values)
}

function commonResolvedObjectShapeFieldFunctionType(fields: AnyNode[]): FunctionTypeMetadata | null {
  const first = fields[0]
  let functionType: FunctionTypeMetadata | null = null

  if (first.functionType !== null && typeof first.functionType !== 'undefined') {
    functionType = first.functionType
  }

  for (let index = 1; index < fields.length; index = index + 1) {
    const field = fields[index]
    let current: FunctionTypeMetadata | null = null

    if (field.functionType !== null && typeof field.functionType !== 'undefined') {
      current = field.functionType
    }

    if (current !== functionType) {
      return null
    }
  }

  return functionType
}

function commonExpressionFunctionType(values: AnyNode[]): FunctionTypeMetadata | null {
  let functionType: FunctionTypeMetadata | null = null
  let seen = false

  for (let index = 0; index < values.length; index = index + 1) {
    const value = values[index]
    let current: FunctionTypeMetadata | null = null

    if (value.functionType !== null && typeof value.functionType !== 'undefined') {
      current = value.functionType
    }

    if (current === null || typeof current === 'undefined') {
      return null
    }

    if (!seen) {
      functionType = current
      seen = true
    } else if (current !== functionType) {
      return null
    }
  }

  return functionType
}

function commonResolvedObjectShapeFieldShape(fields: AnyNode[]): ObjectShapeInfo | null {
  const first = fields[0]
  let shape: ObjectShapeInfo | null = null

  if (first.shape !== null && typeof first.shape !== 'undefined') {
    shape = first.shape
  }

  for (let index = 1; index < fields.length; index = index + 1) {
    const field = fields[index]
    let current: ObjectShapeInfo | null = null

    if (field.shape !== null && typeof field.shape !== 'undefined') {
      current = field.shape
    }

    if (current !== shape) {
      return null
    }
  }

  return shape
}

function resolvedTypeInfoValue(info: ResolvedTypeInfo, kind: ResolvedTypeInfoValueKind): ValueType | null {
  if (kind === resolvedArrayElementTypeKind) {
    return info.arrayElementType
  }

  if (kind === resolvedMapKeyTypeKind) {
    return info.mapKeyType
  }

  if (kind === resolvedMapValueTypeKind) {
    return info.mapValueType
  }

  if (kind === resolvedPromiseValueTypeKind) {
    return info.promiseValueType ?? null
  }

  return info.setElementType
}

function commonResolvedOptionalValueType(infos: ResolvedTypeInfo[], kind: ResolvedTypeInfoValueKind): ValueType | null {
  const values: ValueType[] = []

  for (let index = 0; index < infos.length; index = index + 1) {
    const info = resolvedTypeInfoAt(infos, index)
    const value = resolvedTypeInfoValue(info, kind)

    if (value === null || typeof value === 'undefined') {
      return null
    }

    values.push(value)
  }

  if (values.length === 0) {
    return null
  }

  return commonValueType(values)
}

class CheckerScope {
  parent: CheckerScope | null
  bindings: Map<string, SymbolInfo>

  constructor(parent: CheckerScope | null) {
    this.parent = parent
    this.bindings = new Map()
  }

  hasOwn(name: string): boolean {
    return this.bindings.has(name)
  }

  resolve(name: string): SymbolInfo | null {
    const local = this.bindings.get(name)

    if (local !== null && typeof local !== 'undefined') {
      return local
    }

    let current = this.parent

    while (current !== null && typeof current !== 'undefined') {
      const found = current.bindings.get(name)

      if (found !== null && typeof found !== 'undefined') {
        return found
      }

      current = current.parent
    }

    return null
  }
}

type CheckerScopeState = {
  scope: CheckerScope
  narrowedNullableNames: Set<string>
}

type CheckerNarrowingState = {
  narrowedNullableNames: Set<string>
}

type CheckerReturnContextState = {
  returnType: ValueType
  returnNullable: boolean
  returnPromiseValueType: ValueType | null
  returnAsync: boolean
}

type CheckerLoopDepthState = {
  breakDepth: number
  continueDepth: number
}

export function checkProgram(program: ProgramNode, options: CompileOptions = {}): CheckProgramResult {
  const checker = new Checker(program, options)
  checker.check()

  return {
    ast: program
  }
}

function importSpecifierValueType(specifier: AnyNode, source: string): ValueType {
  const valueType = specifier.valueType

  if (typeof valueType !== 'string') {
    return runtimeImportValueType(source, specifier.imported)
  }

  if (valueType === '') {
    return runtimeImportValueType(source, specifier.imported)
  }

  return valueType.slice(0)
}

class Checker {
  program: ProgramNode
  options: CompileOptions
  diagnostics: Diagnostic[]
  scope: CheckerScope
  types: Map<string, TypeAliasInfo>
  classNames: Set<string>
  breakDepth: number
  continueDepth: number
  currentReturnType: ValueType
  currentReturnNullable: boolean
  currentReturnPromiseValueType: ValueType | null
  currentReturnAsync: boolean
  currentClassConstructor: boolean
  asyncDepth: number
  functionDepth: number
  narrowedNullableNames: Set<string>
  resolvedDeclaredTypes: Map<string, ResolvedTypeInfo>
  resolvingDeclaredTypes: Set<string>

  constructor(program: ProgramNode, options: CompileOptions = {}) {
    this.program = program
    this.options = options
    this.diagnostics = []
    this.scope = new CheckerScope(null)
    this.types = new Map()
    this.classNames = new Set()
    this.breakDepth = 0
    this.continueDepth = 0
    this.currentReturnType = 'void'
    this.currentReturnNullable = false
    this.currentReturnPromiseValueType = null
    this.currentReturnAsync = false
    this.currentClassConstructor = false
    this.asyncDepth = 0
    this.functionDepth = 0
    this.narrowedNullableNames = new Set()
    this.resolvedDeclaredTypes = new Map()
    this.resolvingDeclaredTypes = new Set()
  }

  check(): void {
    this.collectTopLevelDeclarations()

    for (let index = 0; index < this.program.body.length; index = index + 1) {
      const item = checkerNodeAt(this.program.body, index)

      this.checkTopLevelItem(item)
    }

    throwDiagnostics(this.diagnostics)
  }

  collectTopLevelDeclarations(): void {
    for (let index = 0; index < this.program.body.length; index = index + 1) {
      const item = checkerNodeAt(this.program.body, index)

      if (item.type === 'TypeAliasDeclaration') {
        this.declareTypeAlias(item as TypeAliasDeclarationNode)
      } else if (item.type === 'ClassDeclaration') {
        this.classNames.add(item.name)
      }
    }

    this.reportOwnershipCycles()
    throwDiagnostics(this.diagnostics)

    for (let index = 0; index < this.program.body.length; index = index + 1) {
      const item = checkerNodeAt(this.program.body, index)

      if (item.type === 'ImportDeclaration') {
        if (item.typeOnly) {
          continue
        }

        for (let specifierIndex = 0; specifierIndex < item.specifiers.length; specifierIndex = specifierIndex + 1) {
          const specifier = checkerNodeAt(item.specifiers, specifierIndex)
          const symbol: SymbolInfo = {
            kind: 'import',
            mutable: false,
            valueType: importSpecifierValueType(specifier, item.source),
            importedName: specifier.imported,
            importSource: item.source,
            loc: specifier.loc
          }

          this.applyImportSpecifierValueMetadata(symbol, specifier)

          if (specifier.returnType !== null && typeof specifier.returnType !== 'undefined') {
            symbol.valueType = 'function'
            symbol.params = specifier.params ?? []
            symbol.returnType = specifier.returnType
            symbol.returnNullable = specifier.returnNullable === true
            symbol.returnArrayElementType = specifier.returnArrayElementType ?? null
            symbol.returnArrayElementDeclaredType = specifier.returnArrayElementDeclaredType ?? null
            symbol.returnMapKeyType = specifier.returnMapKeyType ?? null
            symbol.returnMapValueType = specifier.returnMapValueType ?? null
            symbol.returnPromiseValueType = specifier.returnPromiseValueType ?? null
            symbol.returnSetElementType = specifier.returnSetElementType ?? null
            symbol.returnShape = specifier.returnShape ?? null
            symbol.async = specifier.async === true
          }

          this.declare(specifier.local, symbol, specifier.loc)
        }
      }

      if (item.type === 'FunctionDeclaration') {
        const returnInfo = this.resolveDeclaredType(item.returnType, item.loc)

        this.declare(
          item.name,
          {
            kind: 'function',
            mutable: false,
            valueType: 'function',
            params: this.resolveParams(item.params),
            returnType: returnInfo.valueType,
            returnNullable: returnInfo.nullable,
            returnArrayElementType: returnInfo.arrayElementType,
            returnArrayElementDeclaredType: returnInfo.arrayElementDeclaredType,
            returnMapKeyType: returnInfo.mapKeyType,
            returnMapValueType: returnInfo.mapValueType,
            returnPromiseValueType: returnInfo.promiseValueType ?? null,
            returnSetElementType: returnInfo.setElementType,
            returnShape: returnInfo.shape,
            async: item.async,
            loc: item.loc
          },
          item.loc
        )
      }

      if (item.type === 'ClassDeclaration') {
        const constructorMethod = this.findClassConstructorMethod(item)
        let constructorParams: AnyNode[] = []

        if (constructorMethod !== null && typeof constructorMethod !== 'undefined') {
          constructorParams = this.resolveParams(constructorMethod.params)
        }

        const shape = this.resolveClassInstanceShape(item, constructorParams)

        item.shape = shape

        this.declare(
          item.name,
          {
            kind: 'class',
            mutable: false,
            valueType: 'class',
            classMethods: item.methods,
            constructorParams,
            shape,
            loc: item.loc
          },
          item.loc
        )
      }
    }
  }

  applyImportSpecifierValueMetadata(symbol: SymbolInfo, specifier: AnyNode): void {
    const declaredType = specifier.declaredType

    if (typeof declaredType === 'string' && declaredType !== '') {
      this.applyResolvedTypeInfoToSymbol(symbol, this.resolveDeclaredType(declaredType, specifier.loc))
      return
    }

    symbol.arrayElementType = specifier.arrayElementType ?? symbol.arrayElementType ?? null
    symbol.arrayElementDeclaredType = specifier.arrayElementDeclaredType ?? symbol.arrayElementDeclaredType ?? null
    symbol.mapKeyType = specifier.mapKeyType ?? symbol.mapKeyType ?? null
    symbol.mapValueType = specifier.mapValueType ?? symbol.mapValueType ?? null
    symbol.promiseValueType = specifier.promiseValueType ?? symbol.promiseValueType ?? null
    symbol.setElementType = specifier.setElementType ?? symbol.setElementType ?? null
    symbol.shape = specifier.shape ?? symbol.shape ?? null
  }

  applyResolvedTypeInfoToSymbol(symbol: SymbolInfo, info: ResolvedTypeInfo): void {
    symbol.valueType = info.valueType
    symbol.nullable = info.nullable
    symbol.arrayElementType = info.arrayElementType
    symbol.arrayElementDeclaredType = info.arrayElementDeclaredType
    symbol.mapKeyType = info.mapKeyType
    symbol.mapValueType = info.mapValueType
    symbol.mapValueShape = info.mapValueShape
    symbol.promiseValueType = info.promiseValueType
    symbol.setElementType = info.setElementType
    symbol.functionType = info.functionType
    symbol.shape = info.shape
  }

  resolveParams(params: AnyNode[]): FunctionTypeParamMetadata[] {
    const resolved: FunctionTypeParamMetadata[] = []

    for (let index = 0; index < params.length; index = index + 1) {
      const param = params[index]
      resolved.push(this.resolveParam(param))
    }

    return resolved
  }

  resolveParam(param: AnyNode): FunctionTypeParamMetadata {
    const declaredType = nodeDeclaredTypeOrValueType(param)

    const paramInfo = this.resolveDeclaredType(declaredType, param.loc)
    let promiseValueType: ValueType | null = null

    if (paramInfo.promiseValueType !== null && typeof paramInfo.promiseValueType !== 'undefined') {
      promiseValueType = paramInfo.promiseValueType
    }

    const resolvedParam: FunctionTypeParamMetadata = {
      name: param.name,
      loc: param.loc,
      declaredType,
      optional: isOptionalParam(param),
      rest: param.rest === true,
      className: this.declaredClassName(declaredType),
      valueType: paramInfo.valueType,
      nullable: paramInfo.nullable,
      arrayElementType: paramInfo.arrayElementType,
      arrayElementDeclaredType: paramInfo.arrayElementDeclaredType,
      mapKeyType: paramInfo.mapKeyType,
      mapValueType: paramInfo.mapValueType,
      mapValueShape: paramInfo.mapValueShape,
      promiseValueType,
      setElementType: paramInfo.setElementType,
      functionType: paramInfo.functionType,
      shape: paramInfo.shape
    }

    if (param.defaultValue !== null && typeof param.defaultValue !== 'undefined') {
      resolvedParam.defaultValue = param.defaultValue
    }

    return resolvedParam
  }

  acceptsArgumentCount(params: OptionalParamInfo[], count: number): boolean {
    if (this.hasRestParam(params)) {
      return count >= this.requiredParamCount(params)
    }

    return count >= this.requiredParamCount(params) && count <= params.length
  }

  argumentCountMessage(label: string, params: OptionalParamInfo[], count: number): string {
    const min = this.requiredParamCount(params)
    const max = params.length
    let expected = `${max}`

    if (this.hasRestParam(params)) {
      return `${label} expects ${min}+ argument(s), got ${count}`
    }

    if (min !== max) {
      expected = `${min}-${max}`
    }

    return `${label} expects ${expected} argument(s), got ${count}`
  }

  requiredParamCount(params: OptionalParamInfo[]): number {
    let count = 0

    for (let index = 0; index < params.length; index = index + 1) {
      const param = optionalParamAt(params, index)

      if (!isOptionalParam(param)) {
        count = count + 1
      }
    }

    return count
  }

  hasRestParam(params: OptionalParamInfo[]): boolean {
    if (params.length === 0) {
      return false
    }

    return optionalParamAt(params, params.length - 1).rest === true
  }

  paramForArgument(params: OptionalParamInfo[], index: number): OptionalParamInfo | null {
    if (index < params.length) {
      return optionalParamAt(params, index)
    }

    if (this.hasRestParam(params)) {
      return optionalParamAt(params, params.length - 1)
    }

    return null
  }

  argumentParamValueType(param: OptionalParamInfo): ValueType {
    if (
      param.rest === true &&
      param.valueType === 'array' &&
      param.arrayElementType !== null &&
      typeof param.arrayElementType !== 'undefined'
    ) {
      return param.arrayElementType as ValueType
    }

    return param.valueType as ValueType
  }

  resolveClassInstanceShape(statement: AnyNode, constructorParams: AnyNode[]): ObjectShapeInfo {
    if (statement.fields !== null && typeof statement.fields !== 'undefined' && statement.fields.length > 0) {
      const resolvedFields: AnyNode[] = []

      for (let index = 0; index < statement.fields.length; index = index + 1) {
        const field = checkerNodeAt(statement.fields, index)

        resolvedFields.push(this.resolveClassField(field))
      }

      return {
        kind: 'object',
        fields: resolvedFields
      }
    }

    const fields: CheckerNode[] = []
    const seen: Set<string> = new Set()
    const constructorMethod = this.findClassConstructorMethod(statement)

    const assignments = this.collectClassConstructorFieldAssignments(constructorMethod)

    for (let index = 0; index < assignments.length; index = index + 1) {
      const assignment = checkerNodeAt(assignments, index)

      if (seen.has(assignment.field)) {
        continue
      }

      seen.add(assignment.field)
      fields.push({
        name: assignment.field,
        readonly: false,
        valueType: this.resolveClassConstructorFieldType(assignment.value, constructorParams),
        loc: assignment.loc
      })
    }

    return {
      kind: 'object',
      fields
    }
  }

  resolveClassField(field: AnyNode): AnyNode {
    const fieldInfo = this.resolveFieldDeclaredType(field)
    const declaredType = nodeDeclaredTypeOrValueType(field)

    return {
      type: field.type,
      name: field.name,
      optional: field.optional,
      readonly: field.readonly,
      ownership: field.ownership,
      weakLoc: field.weakLoc,
      static: field.static,
      staticLoc: field.staticLoc,
      weakTypeValidated: field.weakTypeValidated,
      loc: field.loc,
      declaredType,
      className: this.declaredClassName(declaredType),
      valueType: fieldInfo.valueType,
      nullable: fieldInfo.nullable,
      arrayElementType: fieldInfo.arrayElementType,
      arrayElementDeclaredType: fieldInfo.arrayElementDeclaredType,
      mapKeyType: fieldInfo.mapKeyType,
      mapValueType: fieldInfo.mapValueType,
      promiseValueType: fieldInfo.promiseValueType ?? null,
      setElementType: fieldInfo.setElementType,
      functionType: fieldInfo.functionType,
      shape: fieldInfo.shape
    }
  }

  declaredClassName(name: string | null | undefined): string | null {
    if (name === null || typeof name === 'undefined') {
      return null
    }

    if (isNullableTypeName(name)) {
      return this.declaredClassName(nullableTypeNameFromKnownTypeName(name))
    }

    if (this.classNames.has(name)) {
      return name
    }

    const symbol = this.scope.resolve(name)

    if (symbol === null || typeof symbol === 'undefined') {
      return null
    }

    if (symbol.kind === 'class') {
      return name
    }

    return null
  }

  findClassConstructorMethod(statement: AnyNode): NullableNode {
    for (let index = 0; index < statement.methods.length; index = index + 1) {
      const method = checkerNodeAt(statement.methods, index)

      if (nodeNameEquals(method, 'constructor')) {
        return method
      }
    }

    return null
  }

  collectClassConstructorFieldAssignments(constructorMethod: NullableNode): AnyNode[] {
    if (constructorMethod === null || typeof constructorMethod === 'undefined') {
      return []
    }

    const assignments: AnyNode[] = []

    for (let index = 0; index < constructorMethod.body.length; index = index + 1) {
      const statement = checkerNodeAt(constructorMethod.body, index)

      let assignment: NullableNode = null

      if (statement.type === 'ExpressionStatement' && statement.expression.type === 'AssignmentExpression') {
        assignment = statement.expression
      }

      if (assignment === null || typeof assignment === 'undefined') {
        continue
      }

      const target = assignment.target

      if (
        target === null ||
        typeof target === 'undefined' ||
        target.type !== 'MemberExpression' ||
        !this.isThisExpression(target.object)
      ) {
        continue
      }

      assignments.push({
        field: target.property,
        value: assignment.value,
        loc: assignment.loc
      })
    }

    return assignments
  }

  resolveClassConstructorFieldType(expression: AnyNode, constructorParams: AnyNode[]): ValueType {
    if (expression.type === 'Reference' && expression.path.length === 1) {
      const path: string[] = expression.path
      const param = this.findParamByName(constructorParams, path[0])

      if (param !== null && typeof param !== 'undefined') {
        return nodeValueTypeOrUnknown(param)
      }
    }

    if (expression.type === 'StringLiteral' || expression.type === 'TemplateLiteral') {
      return 'string'
    }

    if (expression.type === 'RegExpLiteral') {
      return this.checkRegExpLiteral(expression)
    }

    if (expression.type === 'NumberLiteral') {
      return 'number'
    }

    if (expression.type === 'BooleanLiteral') {
      return 'boolean'
    }

    if (expression.type === 'ArrayLiteral') {
      return 'array'
    }

    if (expression.type === 'ObjectLiteral') {
      return 'object'
    }

    if (expression.valueType !== null && typeof expression.valueType !== 'undefined') {
      return expression.valueType
    }

    return 'unknown'
  }

  findParamByName(params: AnyNode[], name: string): NullableNode {
    for (let index = 0; index < params.length; index = index + 1) {
      const param = checkerNodeAt(params, index)

      if (nodeNameEquals(param, name)) {
        return param
      }
    }

    return null
  }

  checkTopLevelItem(item: AnyNode): void {
    if (item.type === 'TypeAliasDeclaration') {
      return
    }

    if (item.type === 'ImportDeclaration') {
      this.checkRuntimeBuiltinImport(item)
      return
    }

    if (item.type === 'ExportDeclaration') {
      return
    }

    if (item.type === 'FunctionDeclaration') {
      const scopeState = this.pushScope()

      try {
        const previousReturnType = this.currentReturnType
        const returnInfo = this.resolveDeclaredType(item.returnType, item.loc)
        this.currentReturnType = returnInfo.valueType
        const previousReturnNullable = this.currentReturnNullable
        this.currentReturnNullable = returnInfo.nullable
        const previousReturnPromiseValueType = this.currentReturnPromiseValueType
        let returnPromiseValueType: ValueType | null = null

        if (returnInfo.promiseValueType !== null && typeof returnInfo.promiseValueType !== 'undefined') {
          returnPromiseValueType = returnInfo.promiseValueType
        }

        this.currentReturnPromiseValueType = returnPromiseValueType
        const previousReturnAsync = this.currentReturnAsync
        this.currentReturnAsync = item.async === true
        const previousAsyncDepth = this.asyncDepth
        if (item.async) {
          this.asyncDepth = this.asyncDepth + 1
        }
        const previousFunctionDepth = this.functionDepth
        this.functionDepth = this.functionDepth + 1

        for (let paramIndex = 0; paramIndex < item.params.length; paramIndex = paramIndex + 1) {
          const param = checkerNodeAt(item.params, paramIndex)
          const paramInfo = this.resolveDeclaredType(param.valueType, param.loc)

          this.declare(
            param.name,
            {
              kind: 'param',
              mutable: true,
              valueType: paramInfo.valueType,
              nullable: paramInfo.nullable,
              arrayElementType: paramInfo.arrayElementType,
              arrayElementDeclaredType: paramInfo.arrayElementDeclaredType,
              mapKeyType: paramInfo.mapKeyType,
              mapValueType: paramInfo.mapValueType,
              mapValueShape: paramInfo.mapValueShape,
              promiseValueType: paramInfo.promiseValueType ?? null,
              setElementType: paramInfo.setElementType,
              functionType: paramInfo.functionType,
              shape: paramInfo.shape,
              loc: param.loc
            },
            param.loc
          )
        }

        try {
          this.checkStatements(item.body)
        } finally {
          this.currentReturnType = previousReturnType
          this.currentReturnNullable = previousReturnNullable
          this.currentReturnPromiseValueType = previousReturnPromiseValueType
          this.currentReturnAsync = previousReturnAsync
          this.asyncDepth = previousAsyncDepth
          this.functionDepth = previousFunctionDepth
        }
      } finally {
        this.restoreScope(scopeState)
      }

      return
    }

    if (item.type === 'ClassDeclaration') {
      this.checkClassDeclaration(item)
      return
    }

    this.checkStatement(item)
  }

  checkStatements(statements: AnyNode[]): void {
    for (let index = 0; index < statements.length; index = index + 1) {
      const statement = checkerNodeAt(statements, index)

      this.checkStatement(statement)
      this.applyStatementExitNarrowing(statement)
    }
  }

  applyStatementExitNarrowing(statement: AnyNode): void {
    if (statement.type !== 'IfStatement') {
      return
    }

    if (statement.alternate !== null && typeof statement.alternate !== 'undefined') {
      return
    }

    if (!this.statementAlwaysExits(statement.consequent)) {
      return
    }

    const narrowing = this.resolveNullableConditionNarrowing(statement.condition)

    for (const name of narrowing.falseNames) {
      this.narrowedNullableNames.add(name)
    }
  }

  statementAlwaysExits(statement: AnyNode): boolean {
    if (
      statement.type === 'ReturnStatement' ||
      statement.type === 'ThrowStatement' ||
      statement.type === 'BreakStatement' ||
      statement.type === 'ContinueStatement'
    ) {
      return true
    }

    if (statement.type === 'BlockStatement') {
      return this.statementListAlwaysExits(statement.body)
    }

    if (statement.type === 'IfStatement') {
      if (statement.alternate === null || typeof statement.alternate === 'undefined') {
        return false
      }

      return this.statementAlwaysExits(statement.consequent) && this.statementAlwaysExits(statement.alternate)
    }

    return false
  }

  statementListAlwaysExits(statements: AnyNode[]): boolean {
    for (let index = 0; index < statements.length; index = index + 1) {
      const statement = checkerNodeAt(statements, index)

      if (this.statementAlwaysExits(statement)) {
        return true
      }
    }

    return false
  }

  checkStatement(statement: AnyNode): void {
    if (statement.type === 'BlockStatement') {
      const scopeState = this.pushScope()

      try {
        this.checkStatements(statement.body)
      } finally {
        this.restoreScope(scopeState)
      }

      return
    }

    if (statement.type === 'IfStatement') {
      this.checkBooleanCondition(statement.condition)
      const narrowing = this.resolveNullableConditionNarrowing(statement.condition)
      let consequentNarrowedNames: Set<string> | null = null

      const trueNarrowingState = this.pushBranchNarrowedNullableNames(narrowing.trueNames)

      try {
        this.checkFlowScopedBody(statement.consequent)
        consequentNarrowedNames = cloneStringSet(this.narrowedNullableNames)
      } finally {
        this.restoreNarrowedNullableNames(trueNarrowingState)
      }

      if (statement.alternate !== null && typeof statement.alternate !== 'undefined') {
        let alternateNarrowedNames: Set<string> | null = null
        const falseNarrowingState = this.pushBranchNarrowedNullableNames(narrowing.falseNames)

        try {
          this.checkFlowScopedBody(statement.alternate)
          alternateNarrowedNames = cloneStringSet(this.narrowedNullableNames)
        } finally {
          this.restoreNarrowedNullableNames(falseNarrowingState)
        }

        if (
          consequentNarrowedNames !== null &&
          typeof consequentNarrowedNames !== 'undefined' &&
          alternateNarrowedNames !== null &&
          typeof alternateNarrowedNames !== 'undefined'
        ) {
          const consequentNames: string[] = []
          const alternateNames: string[] = []

          for (const name of consequentNarrowedNames) {
            consequentNames.push(name)
          }

          for (const name of alternateNarrowedNames) {
            alternateNames.push(name)
          }

          const commonNames = this.intersectNames(consequentNames, alternateNames)

          for (const name of commonNames) {
            this.narrowedNullableNames.add(name)
          }
        }
      }

      return
    }

    if (statement.type === 'WhileStatement') {
      this.checkBooleanCondition(statement.condition)
      const narrowing = this.resolveNullableConditionNarrowing(statement.condition)

      const loopState = this.pushLoop()

      try {
        const narrowingState = this.pushNarrowedNullableNames(narrowing.trueNames)

        try {
          this.checkScopedBody(statement.body)
        } finally {
          this.restoreNarrowedNullableNames(narrowingState)
        }
      } finally {
        this.restoreLoopDepth(loopState)
      }
      return
    }

    if (statement.type === 'ForStatement') {
      this.checkForStatement(statement)
      return
    }

    if (statement.type === 'ForOfStatement') {
      this.checkForOfStatement(statement)
      return
    }

    if (statement.type === 'SwitchStatement') {
      this.checkSwitchStatement(statement)
      return
    }

    if (statement.type === 'TryStatement') {
      this.checkTryStatement(statement)
      return
    }

    if (statement.type === 'BreakStatement') {
      if (this.breakDepth === 0) {
        this.report('INOX_BREAK_OUTSIDE', 'break can only be used inside a loop or switch', statement.loc)
      }

      return
    }

    if (statement.type === 'ContinueStatement') {
      if (this.continueDepth === 0) {
        this.report('INOX_CONTINUE_OUTSIDE', 'continue can only be used inside a loop', statement.loc)
      }

      return
    }

    if (statement.type === 'ThrowStatement') {
      this.checkExpression(statement.argument)
      return
    }

    if (statement.type === 'VariableDeclaration') {
      if (
        statement.kind === 'const' &&
        statement.declarationOnly !== true &&
        (statement.init === null || typeof statement.init === 'undefined')
      ) {
        this.report('INOX_CONST_INIT', 'const declarations must have an initializer', statement.loc)
      }

      let declared: ResolvedTypeInfo | null = null

      if (statement.declaredType !== null && typeof statement.declaredType !== 'undefined') {
        declared = this.resolveDeclaredType(statement.declaredType, statement.loc)
      }

      let initType: ValueType = 'unknown'

      if (statement.init !== null && typeof statement.init !== 'undefined') {
        initType = this.checkVariableInitializer(statement.init, declared)
      }

      let valueType = initType

      if (declared !== null && typeof declared !== 'undefined') {
        valueType = declared.valueType
      }

      let arrayElementType = this.resolveExpressionArrayElementType(statement.init)

      if (
        declared !== null &&
        typeof declared !== 'undefined' &&
        declared.arrayElementType !== null &&
        typeof declared.arrayElementType !== 'undefined'
      ) {
        arrayElementType = declared.arrayElementType
      }

      let arrayElementDeclaredType = this.resolveExpressionArrayElementDeclaredType(statement.init)

      if (
        declared !== null &&
        typeof declared !== 'undefined' &&
        declared.arrayElementDeclaredType !== null &&
        typeof declared.arrayElementDeclaredType !== 'undefined'
      ) {
        arrayElementDeclaredType = declared.arrayElementDeclaredType
      }

      let arrayElementFunctionType = this.resolveExpressionArrayElementFunctionType(statement.init)

      if (
        declared !== null &&
        typeof declared !== 'undefined' &&
        declared.arrayElementFunctionType !== null &&
        typeof declared.arrayElementFunctionType !== 'undefined'
      ) {
        arrayElementFunctionType = declared.arrayElementFunctionType
      }

      let mapType: CheckerMapType | null = this.resolveExpressionMapType(statement.init)

      if (declared !== null && typeof declared !== 'undefined' && declared.valueType === 'map') {
        mapType = {
          key: declared.mapKeyType,
          value: declared.mapValueType
        }
      }

      let setElementType = this.resolveExpressionSetElementType(statement.init)

      if (declared !== null && typeof declared !== 'undefined' && declared.valueType === 'set') {
        setElementType = declared.setElementType
      }

      let promiseValueType = this.resolveExpressionPromiseValueType(statement.init)

      if (declared !== null && typeof declared !== 'undefined' && declared.valueType === 'promise') {
        promiseValueType = null

        if (declared.promiseValueType !== null && typeof declared.promiseValueType !== 'undefined') {
          promiseValueType = declared.promiseValueType
        }
      }

      let nullable = false

      if (declared !== null && typeof declared !== 'undefined' && declared.nullable === true) {
        nullable = true
      }

      if (statement.init !== null && typeof statement.init !== 'undefined' && statement.init.nullable === true) {
        nullable = true
      }

      let statementArrayElementDeclaredType = arrayElementDeclaredType

      let mapKeyType: ValueType | null = null
      let mapValueType: ValueType | null = null
      let mapValueShape: ObjectShapeInfo | null = null

      if (mapType !== null && typeof mapType !== 'undefined') {
        mapKeyType = mapType.key
        mapValueType = mapType.value
      }

      if (
        declared !== null &&
        typeof declared !== 'undefined' &&
        declared.mapValueShape !== null &&
        typeof declared.mapValueShape !== 'undefined'
      ) {
        mapValueShape = declared.mapValueShape
      } else if (
        statement.init !== null &&
        typeof statement.init !== 'undefined' &&
        statement.init.mapValueShape !== null &&
        typeof statement.init.mapValueShape !== 'undefined'
      ) {
        mapValueShape = statement.init.mapValueShape
      }

      let functionType: AnyNode | null = null

      if (
        declared !== null &&
        typeof declared !== 'undefined' &&
        declared.functionType !== null &&
        typeof declared.functionType !== 'undefined'
      ) {
        functionType = declared.functionType
      } else if (
        statement.init !== null &&
        typeof statement.init !== 'undefined' &&
        statement.init.functionType !== null &&
        typeof statement.init.functionType !== 'undefined'
      ) {
        functionType = statement.init.functionType
      } else if (
        statement.init !== null &&
        typeof statement.init !== 'undefined' &&
        statement.init.type === 'ArrowFunctionExpression'
      ) {
        functionType = this.inferArrowFunctionTypeMetadata(statement.init)
      }

      let shape: ObjectShapeInfo | null = null

      if (
        declared !== null &&
        typeof declared !== 'undefined' &&
        declared.shape !== null &&
        typeof declared.shape !== 'undefined'
      ) {
        shape = declared.shape
      } else if (
        statement.init !== null &&
        typeof statement.init !== 'undefined' &&
        statement.init.shape !== null &&
        typeof statement.init.shape !== 'undefined'
      ) {
        shape = statement.init.shape
      } else if (
        valueType === 'object' &&
        statementArrayElementDeclaredType !== null &&
        typeof statementArrayElementDeclaredType !== 'undefined' &&
        statementArrayElementDeclaredType === 'fs.Dirent'
      ) {
        shape = fsDirentObjectShape
      }

      let className: string | null = null

      if (
        statement.init !== null &&
        typeof statement.init !== 'undefined' &&
        statement.init.className !== null &&
        typeof statement.init.className !== 'undefined'
      ) {
        className = statement.init.className
      }

      statement.valueType = valueType
      statement.nullable = nullable
      statement.arrayElementType = arrayElementType
      statement.arrayElementDeclaredType = statementArrayElementDeclaredType
      statement.arrayElementFunctionType = arrayElementFunctionType
      statement.mapKeyType = mapKeyType
      statement.mapValueType = mapValueType
      statement.mapValueShape = mapValueShape
      statement.promiseValueType = promiseValueType
      statement.setElementType = setElementType
      statement.functionType = functionType
      statement.shape = shape
      statement.className = className

      if (
        declared !== null &&
        typeof declared !== 'undefined' &&
        statement.init !== null &&
        typeof statement.init !== 'undefined' &&
        statement.init.type === 'ObjectLiteral'
      ) {
        const declaredShape = declared.shape

        if (declaredShape !== null && typeof declaredShape !== 'undefined') {
          this.checkObjectLiteralAgainstShape(statement.init, declaredShape)
        }
      }

      this.declare(
        statement.name,
        {
          kind: statement.kind,
          mutable: statement.kind === 'let',
          valueType,
          nullable,
          arrayElementType,
          arrayElementDeclaredType,
          arrayElementFunctionType,
          mapKeyType,
          mapValueType,
          mapValueShape,
          promiseValueType,
          setElementType,
          functionType,
          className: statement.className,
          shape,
          loc: statement.loc
        },
        statement.loc
      )

      if (
        declared !== null &&
        typeof declared !== 'undefined' &&
        statement.init !== null &&
        typeof statement.init !== 'undefined'
      ) {
        this.checkAssignableType(
          initType,
          declared.valueType,
          statement.loc,
          declared.nullable,
          this.expressionCanBeNull(statement.init)
        )

        if (
          declared.valueType === 'array' &&
          declared.arrayElementType !== null &&
          typeof declared.arrayElementType !== 'undefined'
        ) {
          this.checkAssignableType(
            this.resolveExpressionArrayElementType(statement.init),
            declared.arrayElementType,
            statement.loc,
            false,
            false
          )
        }

        if (declared.valueType === 'map') {
          const actual = this.resolveExpressionMapType(statement.init)
          let actualKey: ValueType | null = null
          let actualValue: ValueType | null = null

          if (actual !== null && typeof actual !== 'undefined') {
            actualKey = actual.key
            actualValue = actual.value
          }

          if (declared.mapKeyType !== null && typeof declared.mapKeyType !== 'undefined') {
            this.checkAssignableType(actualKey, declared.mapKeyType, statement.loc, false, false)
          }

          if (declared.mapValueType !== null && typeof declared.mapValueType !== 'undefined') {
            this.checkAssignableType(actualValue, declared.mapValueType, statement.loc, false, false)
          }
        }

        if (
          declared.valueType === 'set' &&
          declared.setElementType !== null &&
          typeof declared.setElementType !== 'undefined'
        ) {
          this.checkAssignableType(
            this.resolveExpressionSetElementType(statement.init),
            declared.setElementType,
            statement.loc,
            false,
            false
          )
        }

        if (
          declared.valueType === 'promise' &&
          declared.promiseValueType !== null &&
          typeof declared.promiseValueType !== 'undefined'
        ) {
          this.checkAssignableType(
            this.resolveExpressionPromiseValueType(statement.init),
            declared.promiseValueType,
            statement.loc,
            false,
            false
          )
        }
      }

      return
    }

    if (statement.type === 'ExpressionStatement') {
      this.checkExpression(statement.expression)
      return
    }

    if (statement.type === 'ReturnStatement') {
      let actual: ValueType = 'void'

      if (statement.argument !== null && typeof statement.argument !== 'undefined') {
        actual = this.checkExpression(statement.argument)
      }

      if (
        this.currentReturnAsync &&
        this.currentReturnType === 'promise' &&
        this.currentReturnPromiseValueType !== null &&
        typeof this.currentReturnPromiseValueType !== 'undefined'
      ) {
        if (actual === 'promise') {
          this.checkAssignableType(
            this.resolveExpressionPromiseValueType(statement.argument),
            this.currentReturnPromiseValueType,
            statement.loc,
            false,
            false
          )
        } else {
          this.checkAssignableType(
            actual,
            this.currentReturnPromiseValueType,
            statement.loc,
            false,
            this.expressionCanBeNull(statement.argument)
          )
        }

        return
      }

      this.checkAssignableType(
        actual,
        this.currentReturnType,
        statement.loc,
        this.currentReturnNullable,
        this.expressionCanBeNull(statement.argument)
      )

      if (
        this.currentReturnType === 'promise' &&
        this.currentReturnPromiseValueType !== null &&
        typeof this.currentReturnPromiseValueType !== 'undefined'
      ) {
        this.checkAssignableType(
          this.resolveExpressionPromiseValueType(statement.argument),
          this.currentReturnPromiseValueType,
          statement.loc,
          false,
          false
        )
      }
    }

    if (this.isStatementExpressionNode(statement)) {
      this.checkExpression(statement)
    }
  }

  isStatementExpressionNode(statement: AnyNode): boolean {
    return (
      statement.type === 'ArrayLiteral' ||
      statement.type === 'AssignmentExpression' ||
      statement.type === 'AwaitExpression' ||
      statement.type === 'BinaryExpression' ||
      statement.type === 'BooleanLiteral' ||
      statement.type === 'CallExpression' ||
      statement.type === 'ConditionalExpression' ||
      statement.type === 'IndexExpression' ||
      statement.type === 'MemberExpression' ||
      statement.type === 'NewExpression' ||
      statement.type === 'NullLiteral' ||
      statement.type === 'NumberLiteral' ||
      statement.type === 'ObjectLiteral' ||
      statement.type === 'OptionalCallExpression' ||
      statement.type === 'OptionalIndexExpression' ||
      statement.type === 'OptionalMemberExpression' ||
      statement.type === 'Reference' ||
      statement.type === 'RegExpLiteral' ||
      statement.type === 'StringLiteral' ||
      statement.type === 'TemplateLiteral' ||
      statement.type === 'ThisExpression' ||
      statement.type === 'TypeAssertionExpression' ||
      statement.type === 'UnaryExpression' ||
      statement.type === 'UpdateExpression'
    )
  }

  checkTryStatement(statement: AnyNode): void {
    this.checkStatement(statement.block)

    if (statement.handler !== null && typeof statement.handler !== 'undefined') {
      const scopeState = this.pushScope()

      try {
        if (statement.handler.param !== null && typeof statement.handler.param !== 'undefined') {
          let paramLoc = statement.handler.loc

          if (statement.handler.paramLoc !== null && typeof statement.handler.paramLoc !== 'undefined') {
            paramLoc = statement.handler.paramLoc
          }

          this.declare(
            statement.handler.param,
            {
              kind: 'catch',
              mutable: false,
              valueType: 'unknown',
              loc: paramLoc
            },
            paramLoc
          )
        }

        this.checkStatement(statement.handler.body)
      } finally {
        this.restoreScope(scopeState)
      }
    }

    if (statement.finalizer !== null && typeof statement.finalizer !== 'undefined') {
      this.checkStatement(statement.finalizer)
    }
  }

  checkExpression(expression: AnyNode): ValueType {
    if (expression.type === 'StringLiteral' || expression.type === 'TemplateLiteral') {
      return 'string'
    }

    if (expression.type === 'RegExpLiteral') {
      return this.checkRegExpLiteral(expression)
    }

    if (expression.type === 'NumberLiteral') {
      return 'number'
    }

    if (expression.type === 'BooleanLiteral') {
      return 'boolean'
    }

    if (expression.type === 'NullLiteral') {
      return 'null'
    }

    if (expression.type === 'TypeAssertionExpression') {
      const sourceValueType = this.checkExpression(expression.expression)
      const asserted = expression.expression
      const declaredType = nodeDeclaredTypeOrValueType(expression)

      if (declaredType === 'const') {
        expression.declaredType = declaredType
        expression.nullable = asserted.nullable === true
        expression.valueType = sourceValueType
        expression.arrayElementType = asserted.arrayElementType
        expression.arrayElementDeclaredType = asserted.arrayElementDeclaredType
        expression.arrayElementFunctionType = asserted.arrayElementFunctionType
        expression.mapKeyType = asserted.mapKeyType
        expression.mapValueType = asserted.mapValueType
        expression.promiseValueType = asserted.promiseValueType
        expression.setElementType = asserted.setElementType
        expression.functionType = asserted.functionType
        expression.shape = asserted.shape
        expression.className = asserted.className

        return sourceValueType
      }

      const declared = this.resolveDeclaredType(declaredType, expression.loc as SourceLocation)
      let arrayElementType: ValueType | null = asserted.arrayElementType
      let arrayElementDeclaredType: string | null = asserted.arrayElementDeclaredType
      let arrayElementFunctionType: FunctionTypeMetadata | null = asserted.arrayElementFunctionType
      let mapKeyType: ValueType | null = asserted.mapKeyType
      let mapValueType: ValueType | null = asserted.mapValueType
      let mapValueShape: ObjectShapeInfo | null = asserted.mapValueShape
      let promiseValueType: ValueType | null = asserted.promiseValueType
      let setElementType: ValueType | null = asserted.setElementType
      let functionType: FunctionTypeMetadata | null = asserted.functionType
      let shape: ObjectShapeInfo | null = asserted.shape
      let className: string | null = asserted.className

      if (declared.arrayElementType !== null && typeof declared.arrayElementType !== 'undefined') {
        arrayElementType = declared.arrayElementType
      }

      if (declared.arrayElementDeclaredType !== null && typeof declared.arrayElementDeclaredType !== 'undefined') {
        arrayElementDeclaredType = declared.arrayElementDeclaredType
      }

      if (declared.arrayElementFunctionType !== null && typeof declared.arrayElementFunctionType !== 'undefined') {
        arrayElementFunctionType = declared.arrayElementFunctionType
      }

      if (declared.mapKeyType !== null && typeof declared.mapKeyType !== 'undefined') {
        mapKeyType = declared.mapKeyType
      }

      if (declared.mapValueType !== null && typeof declared.mapValueType !== 'undefined') {
        mapValueType = declared.mapValueType
      }

      if (declared.mapValueShape !== null && typeof declared.mapValueShape !== 'undefined') {
        mapValueShape = declared.mapValueShape
      }

      if (declared.promiseValueType !== null && typeof declared.promiseValueType !== 'undefined') {
        promiseValueType = declared.promiseValueType
      }

      if (declared.setElementType !== null && typeof declared.setElementType !== 'undefined') {
        setElementType = declared.setElementType
      }

      if (declared.functionType !== null && typeof declared.functionType !== 'undefined') {
        functionType = declared.functionType
      }

      if (declared.shape !== null && typeof declared.shape !== 'undefined') {
        shape = declared.shape
      }

      expression.declaredType = declaredType
      expression.nullable = declared.nullable
      expression.valueType = declared.valueType
      expression.arrayElementType = arrayElementType
      expression.arrayElementDeclaredType = arrayElementDeclaredType
      expression.arrayElementFunctionType = arrayElementFunctionType
      expression.mapKeyType = mapKeyType
      expression.mapValueType = mapValueType
      expression.mapValueShape = mapValueShape
      expression.promiseValueType = promiseValueType
      expression.setElementType = setElementType
      expression.functionType = functionType
      expression.shape = shape
      expression.className = className

      return declared.valueType
    }

    if (expression.type === 'ThisExpression') {
      const symbol = this.resolveReference({
        type: 'Reference',
        path: ['this'],
        loc: expression.loc
      })
      let valueType: ValueType = 'unknown'

      expression.nullable = false
      expression.valueType = valueType
      expression.shape = null
      expression.className = null

      if (symbol !== null && typeof symbol !== 'undefined') {
        valueType = symbol.valueType
        expression.nullable = symbol.nullable === true
        expression.valueType = valueType

        if (symbol.shape !== null && typeof symbol.shape !== 'undefined') {
          expression.shape = symbol.shape
        }

        if (symbol.className !== null && typeof symbol.className !== 'undefined') {
          expression.className = symbol.className
        }
      }

      return valueType
    }

    if (expression.type === 'Reference') {
      const symbol = this.resolveReference(expression)
      const path: string[] = expression.path
      let valueType: ValueType = 'unknown'

      expression.nullable = false
      expression.valueType = valueType
      expression.arrayElementType = null
      expression.arrayElementDeclaredType = null
      expression.arrayElementFunctionType = null
      expression.mapKeyType = null
      expression.mapValueType = null
      expression.mapValueShape = null
      expression.promiseValueType = null
      expression.setElementType = null
      expression.functionType = null
      expression.shape = null
      expression.className = null

      if (symbol !== null && typeof symbol !== 'undefined') {
        valueType = symbol.valueType
        expression.nullable = symbol.nullable === true && !this.narrowedNullableNames.has(path[0])
        expression.valueType = valueType

        if (symbol.arrayElementType !== null && typeof symbol.arrayElementType !== 'undefined') {
          expression.arrayElementType = symbol.arrayElementType
        }

        if (symbol.arrayElementDeclaredType !== null && typeof symbol.arrayElementDeclaredType !== 'undefined') {
          expression.arrayElementDeclaredType = symbol.arrayElementDeclaredType
        }

        if (symbol.arrayElementFunctionType !== null && typeof symbol.arrayElementFunctionType !== 'undefined') {
          expression.arrayElementFunctionType = symbol.arrayElementFunctionType
        }

        if (symbol.mapKeyType !== null && typeof symbol.mapKeyType !== 'undefined') {
          expression.mapKeyType = symbol.mapKeyType
        }

        if (symbol.mapValueType !== null && typeof symbol.mapValueType !== 'undefined') {
          expression.mapValueType = symbol.mapValueType
        }

        if (symbol.mapValueShape !== null && typeof symbol.mapValueShape !== 'undefined') {
          expression.mapValueShape = symbol.mapValueShape
        }

        if (symbol.promiseValueType !== null && typeof symbol.promiseValueType !== 'undefined') {
          expression.promiseValueType = symbol.promiseValueType
        }

        if (symbol.setElementType !== null && typeof symbol.setElementType !== 'undefined') {
          expression.setElementType = symbol.setElementType
        }

        if (symbol.functionType !== null && typeof symbol.functionType !== 'undefined') {
          expression.functionType = symbol.functionType
        }

        if (symbol.shape !== null && typeof symbol.shape !== 'undefined') {
          expression.shape = symbol.shape
        }

        if (symbol.className !== null && typeof symbol.className !== 'undefined') {
          expression.className = symbol.className
        }
      }

      if (symbol !== null && typeof symbol !== 'undefined' && symbol.kind === 'import') {
        const importSource = symbol.importSource
        const importedName = symbol.importedName

        if (
          importedName !== null &&
          typeof importedName !== 'undefined' &&
          isOsRuntimeConstantImport(importSource, importedName)
        ) {
          expression.osRuntimeConstant = importedName
        }

        const processImportInfo = processRuntimePropertyImportInfo(importSource, importedName)

        if (processImportInfo !== null && typeof processImportInfo !== 'undefined') {
          expression.processRuntimeProperty = processImportInfo.property
          expression.valueType = processImportInfo.valueType
          expression.shape = processImportInfo.shape ?? null
        }

        if (
          importedName !== null &&
          typeof importedName !== 'undefined' &&
          isPathRuntimeConstantImport(importSource, importedName)
        ) {
          expression.pathRuntimeConstant = importedName
        }
      }

      const runtimeObject = nodeStdlibRuntimeObjectInfo(path, symbol)

      if (runtimeObject !== null && typeof runtimeObject !== 'undefined') {
        expression.runtimeObjectSource = runtimeObject.source
        expression.runtimeObjectName = runtimeObject.name
        valueType = runtimeObject.valueType
        expression.valueType = runtimeObject.valueType
        expression.shape = runtimeObject.shape
      }

      return valueType
    }

    if (expression.type === 'MemberExpression') {
      return this.checkMemberExpression(expression)
    }

    if (expression.type === 'IndexExpression') {
      return this.checkIndexExpression(expression)
    }

    if (expression.type === 'OptionalMemberExpression') {
      return this.checkOptionalMemberExpression(expression)
    }

    if (expression.type === 'OptionalIndexExpression') {
      return this.checkOptionalIndexExpression(expression)
    }

    if (expression.type === 'OptionalCallExpression') {
      this.checkExpression(expression.callee)
      const argTypes: ValueType[] = []

      for (let index = 0; index < expression.args.length; index = index + 1) {
        const arg = checkerNodeAt(expression.args, index)

        argTypes.push(this.checkExpression(arg))
      }

      const symbol = this.getCallableSymbol(expression.callee)

      if (symbol === null || typeof symbol === 'undefined') {
        expression.valueType = 'unknown'
        expression.nullable = true

        return expression.valueType
      }

      expression.valueType = 'unknown'
      expression.nullable = true
      expression.arrayElementType = null
      expression.arrayElementDeclaredType = null
      expression.mapKeyType = null
      expression.mapValueType = null
      expression.promiseValueType = null
      expression.setElementType = null
      expression.shape = null

      if (symbol.returnType !== null && typeof symbol.returnType !== 'undefined') {
        expression.valueType = symbol.returnType
      }

      if (symbol.returnArrayElementType !== null && typeof symbol.returnArrayElementType !== 'undefined') {
        expression.arrayElementType = symbol.returnArrayElementType
      }

      if (
        symbol.returnArrayElementDeclaredType !== null &&
        typeof symbol.returnArrayElementDeclaredType !== 'undefined'
      ) {
        expression.arrayElementDeclaredType = symbol.returnArrayElementDeclaredType
      }

      if (symbol.returnMapKeyType !== null && typeof symbol.returnMapKeyType !== 'undefined') {
        expression.mapKeyType = symbol.returnMapKeyType
      }

      if (symbol.returnMapValueType !== null && typeof symbol.returnMapValueType !== 'undefined') {
        expression.mapValueType = symbol.returnMapValueType
      }

      if (symbol.returnPromiseValueType !== null && typeof symbol.returnPromiseValueType !== 'undefined') {
        expression.promiseValueType = symbol.returnPromiseValueType
      }

      if (symbol.returnSetElementType !== null && typeof symbol.returnSetElementType !== 'undefined') {
        expression.setElementType = symbol.returnSetElementType
      }

      if (symbol.returnShape !== null && typeof symbol.returnShape !== 'undefined') {
        expression.shape = symbol.returnShape
      }

      const params = symbol.params

      if (params !== null && typeof params !== 'undefined') {
        if (!this.acceptsArgumentCount(params, expression.args.length)) {
          let name = 'callable'

          if (expression.callee.type === 'Reference') {
            name = firstPathSegment(expression.callee.path)
          }

          this.report(
            'INOX_ARG_COUNT',
            this.argumentCountMessage(`function ${name}`, params, expression.args.length),
            expression.loc
          )
        }

        for (let index = 0; index < expression.args.length; index = index + 1) {
          const param = this.paramForArgument(params, index)

          if (param !== null && typeof param !== 'undefined' && index < argTypes.length) {
            this.checkAssignableType(
              argTypes[index],
              this.argumentParamValueType(param),
              expression.args[index].loc,
              param.nullable === true,
              this.expressionCanBeNull(expression.args[index])
            )
          }
        }
      }

      return expression.valueType
    }

    if (expression.type === 'NewExpression') {
      return this.checkNewExpression(expression)
    }

    if (expression.type === 'AwaitExpression') {
      if (this.asyncDepth === 0 && this.functionDepth > 0) {
        this.report('INOX_AWAIT_OUTSIDE_ASYNC', 'await can only be used inside async functions', expression.loc)
      }

      const argumentType = this.checkExpression(expression.argument)
      let valueType = argumentType

      if (argumentType === 'promise') {
        valueType = 'unknown'

        const promiseValueType = this.resolveExpressionPromiseValueType(expression.argument)

        if (promiseValueType !== null && typeof promiseValueType !== 'undefined') {
          valueType = promiseValueType
        }
      }

      expression.valueType = valueType

      if (valueType === 'array') {
        expression.arrayElementType = this.resolveExpressionArrayElementType(expression.argument)
        expression.arrayElementDeclaredType = this.resolveExpressionArrayElementDeclaredType(expression.argument)
      }

      if (valueType === 'object') {
        expression.shape = this.resolveExpressionShape(expression.argument)
      }

      return valueType
    }

    if (expression.type === 'ArrowFunctionExpression') {
      this.checkArrowFunctionExpression(expression, null)
      return 'function'
    }

    if (expression.type === 'CallExpression') {
      return this.checkCallExpression(expression)
    }

    if (expression.type === 'AssignmentExpression') {
      return this.checkAssignment(expression)
    }

    if (expression.type === 'UpdateExpression') {
      return this.checkUpdateExpression(expression)
    }

    if (expression.type === 'BinaryExpression') {
      return this.checkBinaryExpression(expression)
    }

    if (expression.type === 'ConditionalExpression') {
      return this.checkConditionalExpression(expression)
    }

    if (expression.type === 'UnaryExpression') {
      this.checkExpression(expression.argument)
      if (expression.operator === 'delete') {
        if (this.isClassShapeMutationTarget(expression.argument)) {
          this.report('INOX_C_CLASS', 'class fields cannot be deleted', expression.loc)
        }

        expression.valueType = 'boolean'
        return 'boolean'
      }

      if (expression.operator === 'typeof') {
        expression.valueType = 'string'
        return 'string'
      }

      if (expression.operator === '!') {
        expression.valueType = 'boolean'
        return 'boolean'
      }

      expression.valueType = 'number'
      return 'number'
    }

    if (expression.type === 'ArrayLiteral') {
      const elementTypes: ValueType[] = []

      for (let index = 0; index < expression.elements.length; index = index + 1) {
        const element = checkerNodeAt(expression.elements, index)

        elementTypes.push(this.checkExpression(element))
      }

      expression.arrayElementType = commonArrayElementType(elementTypes)
      expression.arrayElementDeclaredType = expression.arrayElementType
      expression.arrayElementFunctionType = null

      if (expression.arrayElementType === 'function') {
        expression.arrayElementFunctionType = commonExpressionFunctionType(expression.elements)
      }

      return 'array'
    }

    if (expression.type === 'ObjectLiteral') {
      this.checkObjectLiteral(expression)
      return 'object'
    }

    return 'unknown'
  }

  checkConditionalExpression(expression: AnyNode): ValueType {
    this.checkExpression(expression.test)
    const narrowing = this.resolveNullableConditionNarrowing(expression.test)
    let consequentType: ValueType = 'unknown'
    let alternateType: ValueType = 'unknown'

    const consequentNarrowingState = this.pushNarrowedNullableNames(narrowing.trueNames)

    try {
      consequentType = this.checkExpression(expression.consequent)
    } finally {
      this.restoreNarrowedNullableNames(consequentNarrowingState)
    }

    const alternateNarrowingState = this.pushNarrowedNullableNames(narrowing.falseNames)

    try {
      alternateType = this.checkExpression(expression.alternate)
    } finally {
      this.restoreNarrowedNullableNames(alternateNarrowingState)
    }

    const valueType = conditionalExpressionValueType(consequentType, alternateType)

    expression.valueType = valueType
    expression.nullable = this.expressionCanBeNull(expression.consequent) || this.expressionCanBeNull(expression.alternate)
    this.applyConditionalExpressionMetadata(expression, valueType)

    return valueType
  }

  applyConditionalExpressionMetadata(expression: AnyNode, valueType: ValueType): void {
    if (valueType === 'array') {
      expression.arrayElementType =
        this.resolveExpressionArrayElementType(expression.consequent) ??
        this.resolveExpressionArrayElementType(expression.alternate)
      expression.arrayElementDeclaredType =
        this.resolveExpressionArrayElementDeclaredType(expression.consequent) ??
        this.resolveExpressionArrayElementDeclaredType(expression.alternate)
      return
    }

    if (valueType === 'map') {
      const consequentMap = this.resolveExpressionMapType(expression.consequent)
      const alternateMap = this.resolveExpressionMapType(expression.alternate)
      let mapKeyType: ValueType | null = null
      let mapValueType: ValueType | null = null

      if (consequentMap !== null && typeof consequentMap !== 'undefined') {
        mapKeyType = consequentMap.key
        mapValueType = consequentMap.value
      } else if (alternateMap !== null && typeof alternateMap !== 'undefined') {
        mapKeyType = alternateMap.key
        mapValueType = alternateMap.value
      }

      expression.mapKeyType = mapKeyType
      expression.mapValueType = mapValueType
      return
    }

    if (valueType === 'promise') {
      expression.promiseValueType =
        this.resolveExpressionPromiseValueType(expression.consequent) ??
        this.resolveExpressionPromiseValueType(expression.alternate)
      return
    }

    if (valueType === 'set') {
      expression.setElementType =
        this.resolveExpressionSetElementType(expression.consequent) ??
        this.resolveExpressionSetElementType(expression.alternate)
      return
    }

    if (valueType === 'object') {
      expression.shape =
        this.resolveExpressionShape(expression.consequent) ?? this.resolveExpressionShape(expression.alternate)
      return
    }

    if (valueType === 'function') {
      expression.functionType = expression.consequent.functionType ?? expression.alternate.functionType ?? null
    }
  }

  checkAssignment(expression: AnyNode): ValueType {
    if (expression.target.type === 'MemberExpression') {
      return this.checkMemberAssignment(expression)
    }

    if (expression.target.type === 'IndexExpression') {
      return this.checkIndexAssignment(expression)
    }

    if (expression.target.type !== 'Reference') {
      this.report('INOX_INVALID_ASSIGNMENT_TARGET', 'assignment target must be a binding or field', expression.loc)
      return this.checkExpression(expression.value)
    }

    const symbol = this.resolveReference(expression.target)
    const valueType = this.checkExpression(expression.value)

    if (symbol !== null && typeof symbol !== 'undefined') {
      if (expression.target.path.length === 1 && symbol.mutable !== true) {
        const path: string[] = expression.target.path
        this.report('INOX_ASSIGN_CONST', `cannot assign to ${symbol.kind} binding ${path[0]}`, expression.target.loc)
      }
    }

    if (symbol !== null && typeof symbol !== 'undefined') {
      this.checkAssignableType(
        valueType,
        symbol.valueType,
        expression.value.loc,
        symbol.nullable === true,
        this.expressionCanBeNull(expression.value)
      )

      if (
        symbol.valueType === 'promise' &&
        symbol.promiseValueType !== null &&
        typeof symbol.promiseValueType !== 'undefined'
      ) {
        this.checkAssignableType(
          this.resolveExpressionPromiseValueType(expression.value),
          symbol.promiseValueType,
          expression.value.loc,
          false,
          false
        )
      }

      if (expression.target.path.length === 1 && symbol.mutable === true) {
        const targetName = firstPathSegment(expression.target.path)

        deleteNullableNarrowingKey(this.narrowedNullableNames, targetName)

        if (this.expressionCanBeNull(expression.value)) {
          return valueType
        }

        if (symbol.nullable === true) {
          this.narrowedNullableNames.add(targetName)
        }
      }
    }

    return valueType
  }

  checkUpdateExpression(expression: AnyNode): ValueType {
    const targetType = this.checkExpression(expression.argument)

    this.checkAssignableType(targetType, 'number', expression.argument.loc, false, false)

    if (expression.argument.type === 'Reference') {
      const symbol = this.resolveReference(expression.argument)

      if (symbol !== null && typeof symbol !== 'undefined') {
        if (expression.argument.path.length === 1 && symbol.mutable !== true) {
          const path: string[] = expression.argument.path
          this.report(
            'INOX_ASSIGN_CONST',
            `cannot assign to ${symbol.kind} binding ${path[0]}`,
            expression.argument.loc
          )
        }
      }

      return 'number'
    }

    if (expression.argument.type === 'MemberExpression') {
      return 'number'
    }

    if (expression.argument.type === 'IndexExpression') {
      return 'number'
    }

    this.report('INOX_INVALID_ASSIGNMENT_TARGET', 'update target must be a binding or field', expression.loc)

    return 'number'
  }

  checkBinaryExpression(expression: AnyNode): ValueType {
    const left = this.checkExpression(expression.left)
    const leftNarrowing = this.resolveNullableConditionNarrowing(expression.left)
    let right = 'unknown'

    if (expression.operator === '&&') {
      const narrowingState = this.pushNarrowedNullableNames(leftNarrowing.trueNames)

      right = this.checkExpression(expression.right)
      this.restoreNarrowedNullableNames(narrowingState)
    } else if (expression.operator === '||') {
      const narrowingState = this.pushNarrowedNullableNames(leftNarrowing.falseNames)

      right = this.checkExpression(expression.right)
      this.restoreNarrowedNullableNames(narrowingState)
    } else {
      right = this.checkExpression(expression.right)
    }

    if (isUnsupportedEqualityOperator(expression.operator)) {
      this.report(
        'INOX_UNSUPPORTED_OPERATOR',
        'loose equality operators are not supported; use strict equality operators',
        expression.loc
      )
      expression.valueType = 'boolean'
      expression.nullable = false
      return 'boolean'
    }

    const nullableEquality = isEqualityOperator(expression.operator) && (left === 'null' || right === 'null')

    if (isEqualityOperator(expression.operator) && !nullableEquality && !isEqualityComparableType(left, right)) {
      this.report(
        'INOX_TYPE_MISMATCH',
        `cannot compare ${left} and ${right} with ${expression.operator}`,
        expression.loc
      )
    }

    const valueType = inferBinaryExpressionType(expression.operator, left, right)
    expression.valueType = valueType
    expression.nullable = expression.operator === '??' && this.expressionCanBeNull(expression.right)

    if (expression.operator === '??') {
      this.applyNullishCoalescingMetadata(expression, valueType)
    }

    return valueType
  }

  applyNullishCoalescingMetadata(expression: AnyNode, valueType: ValueType): void {
    if (valueType === 'array') {
      expression.arrayElementType =
        this.resolveExpressionArrayElementType(expression.left) ??
        this.resolveExpressionArrayElementType(expression.right)
      expression.arrayElementDeclaredType =
        this.resolveExpressionArrayElementDeclaredType(expression.left) ??
        this.resolveExpressionArrayElementDeclaredType(expression.right)
      return
    }

    if (valueType === 'map') {
      const leftMap = this.resolveExpressionMapType(expression.left)
      const rightMap = this.resolveExpressionMapType(expression.right)
      let mapKeyType: ValueType | null = null
      let mapValueType: ValueType | null = null

      if (leftMap !== null && typeof leftMap !== 'undefined') {
        mapKeyType = leftMap.key
        mapValueType = leftMap.value
      } else if (rightMap !== null && typeof rightMap !== 'undefined') {
        mapKeyType = rightMap.key
        mapValueType = rightMap.value
      }

      expression.mapKeyType = mapKeyType
      expression.mapValueType = mapValueType
      return
    }

    if (valueType === 'set') {
      expression.setElementType =
        this.resolveExpressionSetElementType(expression.left) ?? this.resolveExpressionSetElementType(expression.right)
      return
    }

    if (valueType === 'promise') {
      expression.promiseValueType =
        this.resolveExpressionPromiseValueType(expression.left) ??
        this.resolveExpressionPromiseValueType(expression.right)
      return
    }

    if (valueType === 'object') {
      expression.shape = this.resolveExpressionShape(expression.left) ?? this.resolveExpressionShape(expression.right)
      return
    }

    if (valueType === 'function') {
      expression.functionType = expression.left.functionType ?? expression.right.functionType ?? null
    }
  }

  expressionCanBeNull(expression: AnyNode | null): boolean {
    if (expression === null || typeof expression === 'undefined') {
      return false
    }

    return expression.type === 'NullLiteral' || expression.nullable === true
  }

  checkMemberExpression(expression: AnyNode): ValueType {
    const osConstantType = this.checkOsConstantMemberExpression(expression)

    if (osConstantType !== null && typeof osConstantType !== 'undefined') {
      return osConstantType
    }

    const processMemberType = this.checkProcessMemberExpression(expression)

    if (processMemberType !== null && typeof processMemberType !== 'undefined') {
      return processMemberType
    }

    const pathConstantType = this.checkPathConstantMemberExpression(expression)

    if (pathConstantType !== null && typeof pathConstantType !== 'undefined') {
      return pathConstantType
    }

    const bufferConstantType = this.checkBufferConstantMemberExpression(expression)

    if (bufferConstantType !== null && typeof bufferConstantType !== 'undefined') {
      return bufferConstantType
    }

    const fsConstantType = this.checkFsConstantMemberExpression(expression)

    if (fsConstantType !== null && typeof fsConstantType !== 'undefined') {
      return fsConstantType
    }

    const unsupportedFetchBodyType = this.checkFetchUnsupportedResponseBodyMember(expression)

    if (unsupportedFetchBodyType !== null && typeof unsupportedFetchBodyType !== 'undefined') {
      return unsupportedFetchBodyType
    }

    const objectType = this.checkExpression(expression.object)

    const optionalChainReceiver = isOptionalChainProtectedExpression(expression.object)

    if (!optionalChainReceiver) {
      this.reportNullableRuntimeAccess(expression.object, expression.loc)
    }

    if (this.reportUnsupportedClassPrototypeAccess(expression, optionalChainReceiver)) {
      return 'unknown'
    }

    if (objectType === 'bytes' && expression.property === 'length') {
      expression.valueType = 'number'
      return 'number'
    }

    if (objectType === 'string' && expression.property === 'length') {
      expression.valueType = 'number'
      expression.stringRuntimeMethod = 'length'
      return 'number'
    }

    if (objectType === 'array' && expression.property === 'length') {
      expression.valueType = 'number'
      return 'number'
    }

    if ((objectType === 'map' || objectType === 'set') && expression.property === 'size') {
      return 'number'
    }

    if (this.hasClassInstanceMethod(expression.object, expression.property)) {
      this.report(
        'INOX_C_CLASS',
        'unbound class method extraction is not supported',
        expression.loc
      )
      expression.valueType = 'unknown'
      return 'unknown'
    }

    const shape = this.resolveExpressionShape(expression.object)
    const anyNodeMetadataType = this.checkAnyNodeMetadataMemberExpression(expression, objectType, shape)

    if (anyNodeMetadataType !== null && typeof anyNodeMetadataType !== 'undefined') {
      return anyNodeMetadataType
    }

    if (shape === null || typeof shape === 'undefined') {
      return 'unknown'
    }

    const field = this.findShapeField(shape, expression.property)

    if (field === null || typeof field === 'undefined') {
      this.report('INOX_UNKNOWN_FIELD', `unknown field ${expression.property}`, expression.loc)
      return 'unknown'
    }

    const fieldType = this.resolveFieldDeclaredType(field)
    const valueType = resolvedConcreteValueTypeMetadata(field.valueType, fieldType.valueType)

    const fieldNullable = resolvedFieldNullableMetadata(field, fieldType)

    expression.nullable = optionalChainReceiver || fieldNullable
    expression.optionalChainProtected = optionalChainReceiver && !fieldNullable

    const narrowedKey = nullableNarrowingKey(expression)

    if (narrowedKey !== null && typeof narrowedKey !== 'undefined' && this.narrowedNullableNames.has(narrowedKey)) {
      expression.nullable = false
    }

    expression.valueType = valueType
    expression.arrayElementType = resolvedValueTypeMetadata(field.arrayElementType, fieldType.arrayElementType)
    expression.arrayElementDeclaredType = resolvedStringMetadata(
      field.arrayElementDeclaredType,
      fieldType.arrayElementDeclaredType
    )
    expression.mapKeyType = resolvedValueTypeMetadata(field.mapKeyType, fieldType.mapKeyType)
    expression.mapValueType = resolvedValueTypeMetadata(field.mapValueType, fieldType.mapValueType)
    expression.promiseValueType = resolvedValueTypeMetadata(field.promiseValueType, fieldType.promiseValueType)
    expression.setElementType = resolvedValueTypeMetadata(field.setElementType, fieldType.setElementType)
    expression.shape = resolvedObjectShapeMetadata(field.shape, fieldType.shape)
    expression.functionType = resolvedFunctionTypeMetadata(field.functionType, fieldType.functionType)
    expression.className = null

    if (field.className !== null && typeof field.className !== 'undefined') {
      expression.className = field.className
    }

    return valueType
  }

  checkAnyNodeMetadataMemberExpression(
    expression: AnyNode,
    objectType: ValueType,
    shape: ObjectShapeInfo | null
  ): ValueType | null {
    const directAnyNode =
      objectType === 'object' && shape !== null && typeof shape !== 'undefined' && shape.builtin === 'compiler.AnyNode'
    const childAnyNode = this.isAnyNodeChildExpression(expression.object)

    if (!directAnyNode && !childAnyNode) {
      return null
    }

    if (expression.property === 'path') {
      expression.valueType = 'array'
      expression.nullable = false
      expression.arrayElementType = 'string'
      expression.arrayElementDeclaredType = 'string'
      expression.shape = null
      return 'array'
    }

    if (expression.property === 'loc') {
      expression.valueType = 'object'
      expression.nullable = false
      expression.shape = anyNodeLocObjectShape(expression.loc)
      return 'object'
    }

    return null
  }

  isAnyNodeChildExpression(expression: AnyNode): boolean {
    if (expression.type !== 'MemberExpression') {
      return false
    }

    if (!isAnyNodeChildFieldName(expression.property)) {
      return false
    }

    const parentShape = this.resolveExpressionShape(expression.object)

    if (parentShape !== null && typeof parentShape !== 'undefined' && parentShape.builtin === 'compiler.AnyNode') {
      return true
    }

    return this.isAnyNodeChildExpression(expression.object)
  }

  checkOptionalMemberExpression(expression: AnyNode): ValueType {
    this.checkExpression(expression.object)

    if (this.reportUnsupportedClassPrototypeAccess(expression, true)) {
      return 'unknown'
    }

    const shape = this.resolveExpressionShape(expression.object)

    if (shape === null || typeof shape === 'undefined') {
      expression.nullable = true
      expression.valueType = 'unknown'
      return 'unknown'
    }

    const field = this.findShapeField(shape, expression.property)

    if (field === null || typeof field === 'undefined') {
      this.report('INOX_UNKNOWN_FIELD', `unknown field ${expression.property}`, expression.loc)
      expression.nullable = true
      expression.valueType = 'unknown'
      return 'unknown'
    }

    const fieldType = this.resolveFieldDeclaredType(field)
    const valueType = resolvedConcreteValueTypeMetadata(field.valueType, fieldType.valueType)
    const fieldNullable = resolvedFieldNullableMetadata(field, fieldType)

    expression.nullable = true
    expression.optionalChainProtected = !fieldNullable
    expression.valueType = valueType
    expression.arrayElementType = resolvedValueTypeMetadata(field.arrayElementType, fieldType.arrayElementType)
    expression.arrayElementDeclaredType = resolvedStringMetadata(
      field.arrayElementDeclaredType,
      fieldType.arrayElementDeclaredType
    )
    expression.mapKeyType = resolvedValueTypeMetadata(field.mapKeyType, fieldType.mapKeyType)
    expression.mapValueType = resolvedValueTypeMetadata(field.mapValueType, fieldType.mapValueType)
    expression.promiseValueType = resolvedValueTypeMetadata(field.promiseValueType, fieldType.promiseValueType)
    expression.setElementType = resolvedValueTypeMetadata(field.setElementType, fieldType.setElementType)
    expression.shape = resolvedObjectShapeMetadata(field.shape, fieldType.shape)
    expression.functionType = resolvedFunctionTypeMetadata(field.functionType, fieldType.functionType)
    expression.className = null

    if (field.className !== null && typeof field.className !== 'undefined') {
      expression.className = field.className
    }

    return valueType
  }

  checkMemberAssignment(expression: AnyNode): ValueType {
    const processAssignmentType = this.checkProcessMemberAssignment(expression)

    if (processAssignmentType !== null && typeof processAssignmentType !== 'undefined') {
      return processAssignmentType
    }

    const targetType = this.checkExpression(expression.target.object)
    const shape = this.resolveExpressionShape(expression.target.object)
    const valueType = this.checkExpression(expression.value)

    if (this.reportUnsupportedClassPrototypeAccess(expression.target, false)) {
      return valueType
    }

    if (targetType === 'string' && expression.target.property === 'length') {
      this.report('INOX_ASSIGN_READONLY_FIELD', 'cannot assign to readonly field length', expression.target.loc)
      return valueType
    }

    if (targetType === 'array' && expression.target.property === 'length') {
      this.report('INOX_ASSIGN_READONLY_FIELD', 'cannot assign to readonly field length', expression.target.loc)
      return valueType
    }

    if (targetType === 'map' || targetType === 'set') {
      if (expression.target.property === 'size') {
        this.report('INOX_ASSIGN_READONLY_FIELD', 'cannot assign to readonly field size', expression.target.loc)
        return valueType
      }
    }

    if (targetType === 'bytes' && expression.target.property === 'length') {
      this.report('INOX_ASSIGN_READONLY_FIELD', 'cannot assign to readonly field length', expression.target.loc)
      return valueType
    }

    if (shape === null || typeof shape === 'undefined') {
      return valueType
    }

    if (shape.builtin === 'url.URL') {
      if (isUrlMutableObjectField(expression.target.property)) {
        this.checkAssignableType(
          valueType,
          'string',
          expression.value.loc,
          false,
          this.expressionCanBeNull(expression.value)
        )
        expression.urlRuntimeMethod = 'URL.setField'
        expression.urlRuntimeField = expression.target.property
        return valueType
      }
    }

    const field = this.findShapeField(shape, expression.target.property)

    if (field === null || typeof field === 'undefined') {
      this.report('INOX_UNKNOWN_FIELD', `unknown field ${expression.target.property}`, expression.target.loc)
      return valueType
    }

    if (field.readonly === true) {
      if (!this.canInitializeReadonlyClassField(expression.target.object)) {
        this.report(
          'INOX_ASSIGN_READONLY_FIELD',
          `cannot assign to readonly field ${expression.target.property}`,
          expression.target.loc
        )
      }
    }

    const fieldType = this.resolveFieldDeclaredType(field)
    const targetValueType = resolvedConcreteValueTypeMetadata(field.valueType, fieldType.valueType)
    const targetNullable = resolvedFieldNullableMetadata(field, fieldType)

    expression.target.nullable = targetNullable
    const narrowedKey = nullableNarrowingKey(expression.target)

    if (narrowedKey !== null && typeof narrowedKey !== 'undefined') {
      deleteNullableNarrowingKey(this.narrowedNullableNames, narrowedKey)
    }

    expression.target.valueType = targetValueType
    expression.target.arrayElementType = resolvedValueTypeMetadata(field.arrayElementType, fieldType.arrayElementType)
    expression.target.arrayElementDeclaredType = resolvedStringMetadata(
      field.arrayElementDeclaredType,
      fieldType.arrayElementDeclaredType
    )
    expression.target.mapKeyType = resolvedValueTypeMetadata(field.mapKeyType, fieldType.mapKeyType)
    expression.target.mapValueType = resolvedValueTypeMetadata(field.mapValueType, fieldType.mapValueType)
    expression.target.promiseValueType = resolvedValueTypeMetadata(field.promiseValueType, fieldType.promiseValueType)
    expression.target.setElementType = resolvedValueTypeMetadata(field.setElementType, fieldType.setElementType)
    expression.target.shape = resolvedObjectShapeMetadata(field.shape, fieldType.shape)
    expression.target.functionType = resolvedFunctionTypeMetadata(field.functionType, fieldType.functionType)
    expression.target.className = null

    if (field.className !== null && typeof field.className !== 'undefined') {
      expression.target.className = field.className
    }

    const valueCanBeNull = this.expressionCanBeNull(expression.value)

    this.checkAssignableType(valueType, fieldType.valueType, expression.value.loc, targetNullable, valueCanBeNull)

    if (narrowedKey !== null && typeof narrowedKey !== 'undefined' && targetNullable && !valueCanBeNull) {
      this.narrowedNullableNames.add(narrowedKey)
    }

    if (
      fieldType.valueType === 'array' &&
      fieldType.arrayElementType !== null &&
      typeof fieldType.arrayElementType !== 'undefined'
    ) {
      this.checkAssignableType(
        this.resolveExpressionArrayElementType(expression.value),
        fieldType.arrayElementType,
        expression.value.loc,
        false,
        false
      )
    }

    if (fieldType.valueType === 'map') {
      const actual = this.resolveExpressionMapType(expression.value)
      let actualKey: ValueType | null = null
      let actualValue: ValueType | null = null

      if (actual !== null && typeof actual !== 'undefined') {
        actualKey = actual.key
        actualValue = actual.value
      }

      if (fieldType.mapKeyType !== null && typeof fieldType.mapKeyType !== 'undefined') {
        this.checkAssignableType(actualKey, fieldType.mapKeyType, expression.value.loc, false, false)
      }

      if (fieldType.mapValueType !== null && typeof fieldType.mapValueType !== 'undefined') {
        this.checkAssignableType(actualValue, fieldType.mapValueType, expression.value.loc, false, false)
      }
    }

    if (
      fieldType.valueType === 'set' &&
      fieldType.setElementType !== null &&
      typeof fieldType.setElementType !== 'undefined'
    ) {
      this.checkAssignableType(
        this.resolveExpressionSetElementType(expression.value),
        fieldType.setElementType,
        expression.value.loc,
        false,
        false
      )
    }

    if (
      fieldType.valueType === 'promise' &&
      fieldType.promiseValueType !== null &&
      typeof fieldType.promiseValueType !== 'undefined'
    ) {
      this.checkAssignableType(
        this.resolveExpressionPromiseValueType(expression.value),
        fieldType.promiseValueType,
        expression.value.loc,
        false,
        false
      )
    }

    return valueType
  }

  checkIndexExpression(expression: AnyNode): ValueType {
    const processIndexType = this.checkProcessIndexExpression(expression)

    if (processIndexType !== null && typeof processIndexType !== 'undefined') {
      return processIndexType
    }

    const objectType = this.checkExpression(expression.object)
    const indexType = this.checkExpression(expression.index)

    const optionalChainReceiver = isOptionalChainProtectedExpression(expression.object)

    if (!optionalChainReceiver) {
      this.reportNullableRuntimeAccess(expression.object, expression.loc)
    }

    if (this.reportUnsupportedClassPrototypeAccess(expression, optionalChainReceiver)) {
      return 'unknown'
    }

    if (objectType === 'map') {
      const mapType = this.resolveExpressionMapType(expression.object) ?? {
        key: 'unknown',
        value: 'unknown'
      }
      const mapValueType = resolvedConcreteValueTypeMetadata(mapType.value, 'unknown')
      const mapKeyType = resolvedStringMetadata(mapType.key, null)
      const mapValueMetadata = resolvedStringMetadata(mapType.value, null)

      this.checkAssignableType(
        indexType,
        mapType.key,
        expression.index.loc,
        false,
        this.expressionCanBeNull(expression.index)
      )

      expression.collectionKind = 'map'
      expression.nullable = true
      expression.valueType = mapValueType
      expression.mapKeyType = mapKeyType
      expression.mapValueType = mapValueMetadata
      expression.shape = mapType.valueShape ?? null

      return mapValueType
    }

    if (expression.index.type !== 'StringLiteral') {
      if (objectType === 'string') {
        this.checkAssignableType(indexType, 'number', expression.index.loc, false, false)
        expression.nullable = optionalChainReceiver
        expression.optionalChainProtected = optionalChainReceiver
        expression.valueType = 'string'
        return 'string'
      }

      if (objectType === 'bytes') {
        this.checkAssignableType(indexType, 'number', expression.index.loc, false, false)
        expression.nullable = optionalChainReceiver
        expression.optionalChainProtected = optionalChainReceiver
        expression.valueType = 'number'
        return 'number'
      }

      if (objectType === 'array') {
        this.checkAssignableType(indexType, 'number', expression.index.loc, false, false)
        const valueType = this.resolveExpressionArrayElementType(expression.object) ?? 'unknown'
        const declaredType = this.resolveExpressionArrayElementDeclaredType(expression.object)
        const functionType = this.resolveExpressionArrayElementFunctionType(expression.object)
        expression.nullable = optionalChainReceiver
        expression.optionalChainProtected = optionalChainReceiver
        expression.valueType = valueType
        expression.arrayElementDeclaredType = declaredType
        expression.functionType = functionType
        expression.shape = this.resolveArrayElementObjectShape(valueType, declaredType, expression.loc)

        return valueType
      }

      if (objectType === 'object') {
        const shape = this.resolveExpressionShape(expression.object)

        if (shape !== null && typeof shape !== 'undefined' && shape.dynamic === true) {
          this.checkAssignableType(
            indexType,
            'string',
            expression.index.loc,
            false,
            this.expressionCanBeNull(expression.index)
          )

          const field = this.findShapeField(shape, '')

          if (field !== null && typeof field !== 'undefined') {
            const fieldType = this.resolveFieldDeclaredType(field)
            const valueType = resolvedConcreteValueTypeMetadata(field.valueType, fieldType.valueType)

            const fieldNullable = resolvedFieldNullableMetadata(field, fieldType)

            expression.nullable = optionalChainReceiver || fieldNullable
            expression.optionalChainProtected = optionalChainReceiver && !fieldNullable
            expression.valueType = valueType
            expression.arrayElementType = resolvedValueTypeMetadata(field.arrayElementType, fieldType.arrayElementType)
            expression.arrayElementDeclaredType = resolvedStringMetadata(
              field.arrayElementDeclaredType,
              fieldType.arrayElementDeclaredType
            )
            expression.mapKeyType = resolvedValueTypeMetadata(field.mapKeyType, fieldType.mapKeyType)
            expression.mapValueType = resolvedValueTypeMetadata(field.mapValueType, fieldType.mapValueType)
            expression.promiseValueType = resolvedValueTypeMetadata(field.promiseValueType, fieldType.promiseValueType)
            expression.setElementType = resolvedValueTypeMetadata(field.setElementType, fieldType.setElementType)
            expression.shape = resolvedObjectShapeMetadata(field.shape, fieldType.shape)
            expression.functionType = resolvedFunctionTypeMetadata(field.functionType, fieldType.functionType)
            expression.className = null

            if (field.className !== null && typeof field.className !== 'undefined') {
              expression.className = field.className
            }

            return valueType
          }
        }
      }

      return 'unknown'
    }

    const shape = this.resolveExpressionShape(expression.object)

    if (shape === null || typeof shape === 'undefined') {
      return 'unknown'
    }

    const field = this.findShapeField(shape, expression.index.value)

    if (field === null || typeof field === 'undefined') {
      this.report('INOX_UNKNOWN_FIELD', `unknown field ${expression.index.value}`, expression.index.loc)
      return 'unknown'
    }

    const fieldType = this.resolveFieldDeclaredType(field)
    const valueType = resolvedConcreteValueTypeMetadata(field.valueType, fieldType.valueType)

    const fieldNullable = resolvedFieldNullableMetadata(field, fieldType)

    expression.nullable = optionalChainReceiver || fieldNullable
    expression.optionalChainProtected = optionalChainReceiver && !fieldNullable
    expression.valueType = valueType
    expression.arrayElementType = resolvedValueTypeMetadata(field.arrayElementType, fieldType.arrayElementType)
    expression.arrayElementDeclaredType = resolvedStringMetadata(
      field.arrayElementDeclaredType,
      fieldType.arrayElementDeclaredType
    )
    expression.mapKeyType = resolvedValueTypeMetadata(field.mapKeyType, fieldType.mapKeyType)
    expression.mapValueType = resolvedValueTypeMetadata(field.mapValueType, fieldType.mapValueType)
    expression.promiseValueType = resolvedValueTypeMetadata(field.promiseValueType, fieldType.promiseValueType)
    expression.setElementType = resolvedValueTypeMetadata(field.setElementType, fieldType.setElementType)
    expression.shape = resolvedObjectShapeMetadata(field.shape, fieldType.shape)
    expression.functionType = resolvedFunctionTypeMetadata(field.functionType, fieldType.functionType)
    expression.className = null

    if (field.className !== null && typeof field.className !== 'undefined') {
      expression.className = field.className
    }

    return valueType
  }

  checkOptionalIndexExpression(expression: AnyNode): ValueType {
    const objectType = this.checkExpression(expression.object)
    const indexType = this.checkExpression(expression.index)

    if (this.reportUnsupportedClassPrototypeAccess(expression, true)) {
      return 'unknown'
    }

    if (expression.index.type !== 'StringLiteral') {
      if (objectType === 'array') {
        this.checkAssignableType(indexType, 'number', expression.index.loc, false, false)
        const valueType = this.resolveExpressionArrayElementType(expression.object) ?? 'unknown'
        const declaredType = this.resolveExpressionArrayElementDeclaredType(expression.object)
        const functionType = this.resolveExpressionArrayElementFunctionType(expression.object)

        expression.nullable = true
        expression.optionalChainProtected = true
        expression.valueType = valueType
        expression.arrayElementDeclaredType = declaredType
        expression.functionType = functionType
        expression.shape = this.resolveArrayElementObjectShape(valueType, declaredType, expression.loc)

        return valueType
      }

      expression.nullable = true
      expression.valueType = 'unknown'

      return 'unknown'
    }

    const shape = this.resolveExpressionShape(expression.object)

    if (shape === null || typeof shape === 'undefined') {
      expression.nullable = true
      expression.valueType = 'unknown'
      return 'unknown'
    }

    const field = this.findShapeField(shape, expression.index.value)

    if (field === null || typeof field === 'undefined') {
      this.report('INOX_UNKNOWN_FIELD', `unknown field ${expression.index.value}`, expression.index.loc)
      expression.nullable = true
      expression.valueType = 'unknown'
      return 'unknown'
    }

    const fieldType = this.resolveFieldDeclaredType(field)
    const valueType = resolvedConcreteValueTypeMetadata(field.valueType, fieldType.valueType)
    const fieldNullable = resolvedFieldNullableMetadata(field, fieldType)

    expression.nullable = true
    expression.optionalChainProtected = !fieldNullable
    expression.valueType = valueType
    expression.arrayElementType = resolvedValueTypeMetadata(field.arrayElementType, fieldType.arrayElementType)
    expression.arrayElementDeclaredType = resolvedStringMetadata(
      field.arrayElementDeclaredType,
      fieldType.arrayElementDeclaredType
    )
    expression.mapKeyType = resolvedValueTypeMetadata(field.mapKeyType, fieldType.mapKeyType)
    expression.mapValueType = resolvedValueTypeMetadata(field.mapValueType, fieldType.mapValueType)
    expression.promiseValueType = resolvedValueTypeMetadata(field.promiseValueType, fieldType.promiseValueType)
    expression.setElementType = resolvedValueTypeMetadata(field.setElementType, fieldType.setElementType)
    expression.shape = resolvedObjectShapeMetadata(field.shape, fieldType.shape)
    expression.functionType = resolvedFunctionTypeMetadata(field.functionType, fieldType.functionType)
    expression.className = null

    if (field.className !== null && typeof field.className !== 'undefined') {
      expression.className = field.className
    }

    return valueType
  }

  checkIndexAssignment(expression: AnyNode): ValueType {
    const objectType = this.checkExpression(expression.target.object)
    const indexType = this.checkExpression(expression.target.index)
    const valueType = this.checkExpression(expression.value)

    if (this.reportUnsupportedClassPrototypeAccess(expression.target, false)) {
      return valueType
    }

    if (this.isClassInstanceExpression(expression.target.object)) {
      this.report('INOX_C_CLASS', 'dynamic writes to class fields are not supported', expression.target.loc)
      return valueType
    }

    if (objectType === 'map') {
      const mapType = this.resolveExpressionMapType(expression.target.object) ?? {
        key: 'unknown',
        value: 'unknown'
      }
      const mapValueType = resolvedConcreteValueTypeMetadata(mapType.value, 'unknown')
      const mapKeyType = resolvedStringMetadata(mapType.key, null)
      const mapValueMetadata = resolvedStringMetadata(mapType.value, null)

      this.checkAssignableType(
        indexType,
        mapType.key,
        expression.target.index.loc,
        false,
        this.expressionCanBeNull(expression.target.index)
      )
      this.checkAssignableType(
        valueType,
        mapType.value,
        expression.value.loc,
        false,
        this.expressionCanBeNull(expression.value)
      )

      expression.target.collectionKind = 'map'
      expression.target.valueType = mapValueType
      expression.target.mapKeyType = mapKeyType
      expression.target.mapValueType = mapValueMetadata

      return valueType
    }

    if (objectType === 'bytes') {
      if (expression.target.index.type !== 'StringLiteral') {
        this.checkAssignableType(indexType, 'number', expression.target.index.loc, false, false)
        this.checkAssignableType(valueType, 'number', expression.value.loc, false, false)
        expression.target.valueType = 'number'
        return valueType
      }
    }

    if (expression.target.index.type !== 'StringLiteral') {
      if (objectType === 'object') {
        const shape = this.resolveExpressionShape(expression.target.object)

        if (shape !== null && typeof shape !== 'undefined' && shape.dynamic === true) {
          this.checkAssignableType(
            indexType,
            'string',
            expression.target.index.loc,
            false,
            this.expressionCanBeNull(expression.target.index)
          )

          const field = this.findShapeField(shape, '')

          if (field !== null && typeof field !== 'undefined') {
            const fieldType = this.resolveFieldDeclaredType(field)
            const targetValueType = resolvedConcreteValueTypeMetadata(field.valueType, fieldType.valueType)

            expression.target.nullable = resolvedFieldNullableMetadata(field, fieldType)
            expression.target.valueType = targetValueType
            expression.target.arrayElementType = resolvedValueTypeMetadata(
              field.arrayElementType,
              fieldType.arrayElementType
            )
            expression.target.arrayElementDeclaredType = resolvedStringMetadata(
              field.arrayElementDeclaredType,
              fieldType.arrayElementDeclaredType
            )
            expression.target.mapKeyType = resolvedValueTypeMetadata(field.mapKeyType, fieldType.mapKeyType)
            expression.target.mapValueType = resolvedValueTypeMetadata(field.mapValueType, fieldType.mapValueType)
            expression.target.promiseValueType = resolvedValueTypeMetadata(
              field.promiseValueType,
              fieldType.promiseValueType
            )
            expression.target.setElementType = resolvedValueTypeMetadata(field.setElementType, fieldType.setElementType)
            expression.target.shape = resolvedObjectShapeMetadata(field.shape, fieldType.shape)
            expression.target.functionType = resolvedFunctionTypeMetadata(field.functionType, fieldType.functionType)
            expression.target.className = null

            if (field.className !== null && typeof field.className !== 'undefined') {
              expression.target.className = field.className
            }

            this.checkAssignableType(
              valueType,
              fieldType.valueType,
              expression.value.loc,
              false,
              this.expressionCanBeNull(expression.value)
            )

            return valueType
          }
        }
      }

      return valueType
    }

    const shape = this.resolveExpressionShape(expression.target.object)

    if (shape === null || typeof shape === 'undefined') {
      return valueType
    }

    const field = this.findShapeField(shape, expression.target.index.value)

    if (field === null || typeof field === 'undefined') {
      this.report('INOX_UNKNOWN_FIELD', `unknown field ${expression.target.index.value}`, expression.target.index.loc)
      return valueType
    }

    if (field.readonly === true) {
      if (!this.canInitializeReadonlyClassField(expression.target.object)) {
        this.report(
          'INOX_ASSIGN_READONLY_FIELD',
          `cannot assign to readonly field ${expression.target.index.value}`,
          expression.target.loc
        )
      }
    }

    const fieldType = this.resolveFieldDeclaredType(field)
    const targetValueType = resolvedConcreteValueTypeMetadata(field.valueType, fieldType.valueType)
    const targetNullable = resolvedFieldNullableMetadata(field, fieldType)

    expression.target.nullable = targetNullable
    expression.target.valueType = targetValueType
    expression.target.arrayElementType = resolvedValueTypeMetadata(field.arrayElementType, fieldType.arrayElementType)
    expression.target.arrayElementDeclaredType = resolvedStringMetadata(
      field.arrayElementDeclaredType,
      fieldType.arrayElementDeclaredType
    )
    expression.target.mapKeyType = resolvedValueTypeMetadata(field.mapKeyType, fieldType.mapKeyType)
    expression.target.mapValueType = resolvedValueTypeMetadata(field.mapValueType, fieldType.mapValueType)
    expression.target.promiseValueType = resolvedValueTypeMetadata(field.promiseValueType, fieldType.promiseValueType)
    expression.target.setElementType = resolvedValueTypeMetadata(field.setElementType, fieldType.setElementType)
    expression.target.shape = resolvedObjectShapeMetadata(field.shape, fieldType.shape)
    expression.target.functionType = resolvedFunctionTypeMetadata(field.functionType, fieldType.functionType)
    expression.target.className = null

    if (field.className !== null && typeof field.className !== 'undefined') {
      expression.target.className = field.className
    }

    this.checkAssignableType(
      valueType,
      fieldType.valueType,
      expression.value.loc,
      targetNullable,
      this.expressionCanBeNull(expression.value)
    )

    if (
      fieldType.valueType === 'array' &&
      fieldType.arrayElementType !== null &&
      typeof fieldType.arrayElementType !== 'undefined'
    ) {
      this.checkAssignableType(
        this.resolveExpressionArrayElementType(expression.value),
        fieldType.arrayElementType,
        expression.value.loc,
        false,
        false
      )
    }

    if (fieldType.valueType === 'map') {
      const actual = this.resolveExpressionMapType(expression.value)
      let actualKey: ValueType | null = null
      let actualValue: ValueType | null = null

      if (actual !== null && typeof actual !== 'undefined') {
        actualKey = actual.key
        actualValue = actual.value
      }

      if (fieldType.mapKeyType !== null && typeof fieldType.mapKeyType !== 'undefined') {
        this.checkAssignableType(actualKey, fieldType.mapKeyType, expression.value.loc, false, false)
      }

      if (fieldType.mapValueType !== null && typeof fieldType.mapValueType !== 'undefined') {
        this.checkAssignableType(actualValue, fieldType.mapValueType, expression.value.loc, false, false)
      }
    }

    if (
      fieldType.valueType === 'set' &&
      fieldType.setElementType !== null &&
      typeof fieldType.setElementType !== 'undefined'
    ) {
      this.checkAssignableType(
        this.resolveExpressionSetElementType(expression.value),
        fieldType.setElementType,
        expression.value.loc,
        false,
        false
      )
    }

    if (
      fieldType.valueType === 'promise' &&
      fieldType.promiseValueType !== null &&
      typeof fieldType.promiseValueType !== 'undefined'
    ) {
      this.checkAssignableType(
        this.resolveExpressionPromiseValueType(expression.value),
        fieldType.promiseValueType,
        expression.value.loc,
        false,
        false
      )
    }

    return valueType
  }

  isClassShapeMutationTarget(expression: AnyNode): boolean {
    if (expression.type === 'MemberExpression') {
      return this.isClassInstanceExpression(expression.object)
    }

    if (expression.type === 'IndexExpression') {
      return this.isClassInstanceExpression(expression.object)
    }

    return false
  }

  isClassInstanceExpression(expression: AnyNode): boolean {
    const className = this.resolveClassMethodReceiverClassName(expression)

    return className !== null && typeof className !== 'undefined'
  }

  hasStringReturningClassToStringMethod(expression: AnyNode): boolean {
    const className = this.resolveClassMethodReceiverClassName(expression)

    if (className === null || typeof className === 'undefined') {
      return false
    }

    const classSymbol = this.scope.resolve(className)

    if (classSymbol === null || typeof classSymbol === 'undefined') {
      return false
    }

    const classMethods = classSymbol.classMethods

    if (classMethods === null || typeof classMethods === 'undefined') {
      return false
    }

    for (let index = 0; index < classMethods.length; index = index + 1) {
      const method = checkerNodeAt(classMethods, index)

      if (!nodeNameEquals(method, 'toString')) {
        continue
      }

      const params: OptionalParamInfo[] = []

      for (let paramIndex = 0; paramIndex < method.params.length; paramIndex = paramIndex + 1) {
        const param = checkerNodeAt(method.params, paramIndex)

        params.push(this.resolveParam(param))
      }

      const returnInfo = this.resolveDeclaredType(method.returnType, method.loc)

      return returnInfo.valueType === 'string' && this.acceptsArgumentCount(params, 0)
    }

    return false
  }

  hasClassInstanceMethod(expression: AnyNode, methodName: string): boolean {
    const className = this.resolveClassMethodReceiverClassName(expression)

    if (className === null || typeof className === 'undefined') {
      return false
    }

    const classSymbol = this.scope.resolve(className)

    if (classSymbol === null || typeof classSymbol === 'undefined') {
      return false
    }

    const classMethods = classSymbol.classMethods

    if (classMethods === null || typeof classMethods === 'undefined') {
      return false
    }

    for (let index = 0; index < classMethods.length; index = index + 1) {
      const method = checkerNodeAt(classMethods, index)

      if (nodeNameEquals(method, methodName)) {
        return true
      }
    }

    return false
  }

  reportUnsupportedClassPrototypeAccess(expression: AnyNode, nullable: boolean): boolean {
    const object = this.classPrototypeAccessObject(expression)

    if (object === null || typeof object === 'undefined') {
      return false
    }

    if (!this.isClassConstructorReference(object)) {
      return false
    }

    this.report('INOX_CLASS_PROTOTYPE', 'class prototype access is not supported', expression.loc)
    expression.nullable = nullable
    expression.valueType = 'unknown'

    return true
  }

  classPrototypeAccessObject(expression: AnyNode): AnyNode | null {
    if (
      (expression.type === 'MemberExpression' || expression.type === 'OptionalMemberExpression') &&
      expression.property === 'prototype'
    ) {
      return expression.object
    }

    if (
      (expression.type === 'IndexExpression' || expression.type === 'OptionalIndexExpression') &&
      expression.index.type === 'StringLiteral' &&
      expression.index.value === 'prototype'
    ) {
      return expression.object
    }

    return null
  }

  isClassConstructorReference(expression: AnyNode): boolean {
    if (expression.type !== 'Reference' || expression.path.length !== 1) {
      return false
    }

    const name = firstPathSegment(expression.path)

    if (this.classNames.has(name)) {
      return true
    }

    const symbol = this.scope.resolve(name)

    return symbol !== null && typeof symbol !== 'undefined' && symbol.kind === 'class'
  }

  checkCallExpression(expression: AnyNode): ValueType {
    const consoleType = this.checkConsoleCall(expression)

    if (consoleType !== null && typeof consoleType !== 'undefined') {
      return consoleType
    }

    const timeType = this.checkTimeCall(expression)

    if (timeType !== null && typeof timeType !== 'undefined') {
      return timeType
    }

    const binaryType = this.checkBinaryCall(expression)

    if (binaryType !== null && typeof binaryType !== 'undefined') {
      return binaryType
    }

    const bufferUnsupportedType = this.checkBufferUnsupportedCall(expression)

    if (bufferUnsupportedType !== null && typeof bufferUnsupportedType !== 'undefined') {
      return bufferUnsupportedType
    }

    const eventStreamUnsupportedType = this.checkEventStreamUnsupportedCall(expression)

    if (eventStreamUnsupportedType !== null && typeof eventStreamUnsupportedType !== 'undefined') {
      return eventStreamUnsupportedType
    }

    const stringConversionType = this.checkStringConversionCall(expression)

    if (stringConversionType !== null && typeof stringConversionType !== 'undefined') {
      return stringConversionType
    }

    const regexpTestType = this.checkRegExpTestCall(expression)

    if (regexpTestType !== null && typeof regexpTestType !== 'undefined') {
      return regexpTestType
    }

    const numberConversionType = this.checkNumberConversionCall(expression)

    if (numberConversionType !== null && typeof numberConversionType !== 'undefined') {
      return numberConversionType
    }

    const numericCastType = this.checkNumericCastCall(expression)

    if (numericCastType !== null && typeof numericCastType !== 'undefined') {
      return numericCastType
    }

    const numberToStringType = this.checkNumberToStringCall(expression)

    if (numberToStringType !== null && typeof numberToStringType !== 'undefined') {
      return numberToStringType
    }

    const stringCharCodeAtType = this.checkStringCharCodeAtCall(expression)

    if (stringCharCodeAtType !== null && typeof stringCharCodeAtType !== 'undefined') {
      return stringCharCodeAtType
    }

    const stringIndexType = this.checkStringIndexCall(expression)

    if (stringIndexType !== null && typeof stringIndexType !== 'undefined') {
      return stringIndexType
    }

    const stringTrimType = this.checkStringTrimCall(expression)

    if (stringTrimType !== null && typeof stringTrimType !== 'undefined') {
      return stringTrimType
    }

    const stringCaseType = this.checkStringCaseCall(expression)

    if (stringCaseType !== null && typeof stringCaseType !== 'undefined') {
      return stringCaseType
    }

    const stringPadStartType = this.checkStringPadStartCall(expression)

    if (stringPadStartType !== null && typeof stringPadStartType !== 'undefined') {
      return stringPadStartType
    }

    const stringSliceType = this.checkStringSliceCall(expression)

    if (stringSliceType !== null && typeof stringSliceType !== 'undefined') {
      return stringSliceType
    }

    const stringSplitType = this.checkStringSplitCall(expression)

    if (stringSplitType !== null && typeof stringSplitType !== 'undefined') {
      return stringSplitType
    }

    const stringMethodType = this.checkStringPredicateCall(expression)

    if (stringMethodType !== null && typeof stringMethodType !== 'undefined') {
      return stringMethodType
    }

    const arrayFromType = this.checkArrayFromCall(expression)

    if (arrayFromType !== null && typeof arrayFromType !== 'undefined') {
      return arrayFromType
    }

    const arrayMethodType = this.checkArrayMethodCall(expression)

    if (arrayMethodType !== null && typeof arrayMethodType !== 'undefined') {
      return arrayMethodType
    }

    const collectionMethodType = this.checkCollectionMethodCall(expression)

    if (collectionMethodType !== null && typeof collectionMethodType !== 'undefined') {
      return collectionMethodType
    }

    const promiseMethodType = this.checkPromiseMethodCall(expression)

    if (promiseMethodType !== null && typeof promiseMethodType !== 'undefined') {
      return promiseMethodType
    }

    const timerHandleMethodType = this.checkTimerHandleMethodCall(expression)

    if (timerHandleMethodType !== null && typeof timerHandleMethodType !== 'undefined') {
      return timerHandleMethodType
    }

    const fsStatsMethodType = this.checkFsStatsMethodCall(expression)

    if (fsStatsMethodType !== null && typeof fsStatsMethodType !== 'undefined') {
      return fsStatsMethodType
    }

    const fetchAbortControllerMethodType = this.checkFetchAbortControllerMethodCall(expression)

    if (fetchAbortControllerMethodType !== null && typeof fetchAbortControllerMethodType !== 'undefined') {
      return fetchAbortControllerMethodType
    }

    const fetchResponseMethodType = this.checkFetchResponseMethodCall(expression)

    if (fetchResponseMethodType !== null && typeof fetchResponseMethodType !== 'undefined') {
      return fetchResponseMethodType
    }

    const fetchHeadersMethodType = this.checkFetchHeadersMethodCall(expression)

    if (fetchHeadersMethodType !== null && typeof fetchHeadersMethodType !== 'undefined') {
      return fetchHeadersMethodType
    }

    const urlSearchParamsMethodType = this.checkUrlSearchParamsMethodCall(expression)

    if (urlSearchParamsMethodType !== null && typeof urlSearchParamsMethodType !== 'undefined') {
      return urlSearchParamsMethodType
    }

    const cryptoHashMethodType = this.checkCryptoHashMethodCall(expression)

    if (cryptoHashMethodType !== null && typeof cryptoHashMethodType !== 'undefined') {
      return cryptoHashMethodType
    }

    const fsType = this.checkFsCall(expression)

    if (fsType !== null && typeof fsType !== 'undefined') {
      return fsType
    }

    const fetchType = this.checkFetchCall(expression)

    if (fetchType !== null && typeof fetchType !== 'undefined') {
      return fetchType
    }

    const jsonType = this.checkJsonCall(expression, null)

    if (jsonType !== null && typeof jsonType !== 'undefined') {
      return jsonType
    }

    const cryptoType = this.checkCryptoCall(expression)

    if (cryptoType !== null && typeof cryptoType !== 'undefined') {
      return cryptoType
    }

    const childProcessType = this.checkChildProcessCall(expression)

    if (childProcessType !== null && typeof childProcessType !== 'undefined') {
      return childProcessType
    }

    const osType = this.checkOsCall(expression)

    if (osType !== null && typeof osType !== 'undefined') {
      return osType
    }

    const processType = this.checkProcessCall(expression)

    if (processType !== null && typeof processType !== 'undefined') {
      return processType
    }

    const urlType = this.checkUrlCall(expression)

    if (urlType !== null && typeof urlType !== 'undefined') {
      return urlType
    }

    const pathType = this.checkPathCall(expression)

    if (pathType !== null && typeof pathType !== 'undefined') {
      return pathType
    }

    const debugMemoryType = this.checkDebugMemoryCall(expression)

    if (debugMemoryType !== null && typeof debugMemoryType !== 'undefined') {
      return debugMemoryType
    }

    const timerType = this.checkTimerCall(expression)

    if (timerType !== null && typeof timerType !== 'undefined') {
      return timerType
    }

    const promiseStaticType = this.checkPromiseStaticCall(expression)

    if (promiseStaticType !== null && typeof promiseStaticType !== 'undefined') {
      return promiseStaticType
    }

    const classMethodType = this.checkClassMethodCall(expression)

    if (classMethodType !== null && typeof classMethodType !== 'undefined') {
      return classMethodType
    }

    const mathType = this.checkMathCall(expression)

    if (mathType !== null && typeof mathType !== 'undefined') {
      return mathType
    }

    const arrayIsArrayType = this.checkArrayIsArrayCall(expression)

    if (arrayIsArrayType !== null && typeof arrayIsArrayType !== 'undefined') {
      return arrayIsArrayType
    }

    const objectValuesType = this.checkObjectStaticCall(expression)

    if (objectValuesType !== null && typeof objectValuesType !== 'undefined') {
      return objectValuesType
    }

    this.checkExpression(expression.callee)
    const argTypes: ValueType[] = []

    for (let index = 0; index < expression.args.length; index = index + 1) {
      const arg = checkerNodeAt(expression.args, index)

      argTypes.push(this.checkExpression(arg))
    }

    const symbol = this.getCallableSymbol(expression.callee)

    if (symbol === null || typeof symbol === 'undefined') {
      return 'unknown'
    }

    let returnType: ValueType = 'unknown'
    const symbolReturnType = symbol.returnType ?? null

    if (symbolReturnType !== null && typeof symbolReturnType !== 'undefined') {
      returnType = symbolReturnType
    }

    let returnArrayElementType: ValueType | null = null
    const symbolReturnArrayElementType = symbol.returnArrayElementType ?? null

    if (symbolReturnArrayElementType !== null && typeof symbolReturnArrayElementType !== 'undefined') {
      returnArrayElementType = symbolReturnArrayElementType
    }

    let returnArrayElementDeclaredType: string | null = null
    const symbolReturnArrayElementDeclaredType = symbol.returnArrayElementDeclaredType ?? null

    if (symbolReturnArrayElementDeclaredType !== null && typeof symbolReturnArrayElementDeclaredType !== 'undefined') {
      returnArrayElementDeclaredType = symbolReturnArrayElementDeclaredType
    }

    let returnMapKeyType: ValueType | null = null
    const symbolReturnMapKeyType = symbol.returnMapKeyType ?? null

    if (symbolReturnMapKeyType !== null && typeof symbolReturnMapKeyType !== 'undefined') {
      returnMapKeyType = symbolReturnMapKeyType
    }

    let returnMapValueType: ValueType | null = null
    const symbolReturnMapValueType = symbol.returnMapValueType ?? null

    if (symbolReturnMapValueType !== null && typeof symbolReturnMapValueType !== 'undefined') {
      returnMapValueType = symbolReturnMapValueType
    }

    let returnPromiseValueType: ValueType | null = null
    const symbolReturnPromiseValueType = symbol.returnPromiseValueType ?? null

    if (symbolReturnPromiseValueType !== null && typeof symbolReturnPromiseValueType !== 'undefined') {
      returnPromiseValueType = symbolReturnPromiseValueType
    }

    let returnSetElementType: ValueType | null = null
    const symbolReturnSetElementType = symbol.returnSetElementType ?? null

    if (symbolReturnSetElementType !== null && typeof symbolReturnSetElementType !== 'undefined') {
      returnSetElementType = symbolReturnSetElementType
    }

    let returnShape: ObjectShapeInfo | null = null
    const symbolReturnShape = symbol.returnShape

    if (symbolReturnShape !== null && typeof symbolReturnShape !== 'undefined') {
      returnShape = symbolReturnShape
    }

    expression.valueType = returnType
    expression.nullable = symbol.returnNullable === true
    expression.arrayElementType = returnArrayElementType
    expression.arrayElementDeclaredType = returnArrayElementDeclaredType
    expression.mapKeyType = returnMapKeyType
    expression.mapValueType = returnMapValueType
    expression.promiseValueType = returnPromiseValueType
    expression.setElementType = returnSetElementType
    expression.shape = returnShape

    const params = symbol.params ?? null

    if (params === null || typeof params === 'undefined') {
      return returnType
    }

    if (!this.acceptsArgumentCount(params, expression.args.length)) {
      this.report(
        'INOX_ARG_COUNT',
        this.argumentCountMessage(this.callExpressionArgumentLabel(expression), params, expression.args.length),
        expression.loc
      )
    }

    for (let index = 0; index < expression.args.length; index = index + 1) {
      const param = this.paramForArgument(params, index)

      if (param !== null && typeof param !== 'undefined' && index < argTypes.length) {
        this.checkAssignableType(
          argTypes[index],
          this.argumentParamValueType(param),
          expression.args[index].loc,
          param.nullable === true,
          this.expressionCanBeNull(expression.args[index])
        )
      }
    }

    return returnType
  }

  checkConsoleCall(expression: AnyNode): ValueType | null {
    if (expression.callee.type !== 'MemberExpression') {
      return null
    }

    const path = memberExpressionPath(expression.callee)

    if (
      path.length !== 2 ||
      path[0] !== 'console' ||
      !isConsoleMethod(path[1]) ||
      this.runtimeGlobalIsShadowed('console')
    ) {
      return null
    }

    for (let index = 0; index < expression.args.length; index = index + 1) {
      const arg = checkerNodeAt(expression.args, index)

      this.checkExpression(arg)
    }

    expression.valueType = 'void'

    return 'void'
  }

  callExpressionArgumentLabel(expression: AnyNode): string {
    const callee = expression.callee

    if (
      callee !== null &&
      typeof callee !== 'undefined' &&
      callee.type === 'Reference' &&
      callee.path !== null &&
      typeof callee.path !== 'undefined' &&
      callee.path.length > 0
    ) {
      return `function ${callee.path[0]}`
    }

    if (
      callee !== null &&
      typeof callee !== 'undefined' &&
      callee.type === 'MemberExpression' &&
      callee.property !== null &&
      typeof callee.property !== 'undefined'
    ) {
      return `function ${callee.property}`
    }

    return 'function'
  }

  checkBinaryCall(expression: AnyNode): ValueType | null {
    if (expression.callee.type !== 'MemberExpression') {
      return null
    }

    const path = memberExpressionPath(expression.callee)
    const staticMethod = binaryStaticRuntimeMethodName(path, this.resolveMemberPathRootSymbol(path))

    if (staticMethod !== null && typeof staticMethod !== 'undefined') {
      if (staticMethod === 'from') {
        if (expression.args.length < 1 || expression.args.length > 2) {
          this.report(
            'INOX_ARG_COUNT',
            `function Buffer.from expects 1 or 2 argument(s), got ${expression.args.length}`,
            expression.loc
          )
        }

        if (expression.args[0] !== null && typeof expression.args[0] !== 'undefined') {
          this.checkAssignableType(
            this.checkExpression(expression.args[0]),
            'string',
            expression.args[0].loc,
            false,
            this.expressionCanBeNull(expression.args[0])
          )
        }

        this.checkUtf8EncodingArg(expression, 1, 'Buffer.from')
        expression.binaryRuntimeMethod = staticMethod
        expression.valueType = 'bytes'

        return 'bytes'
      }

      if (staticMethod === 'isBuffer') {
        if (expression.args.length !== 1) {
          this.report(
            'INOX_ARG_COUNT',
            `function Buffer.isBuffer expects 1 argument(s), got ${expression.args.length}`,
            expression.loc
          )
        }

        if (expression.args[0] !== null && typeof expression.args[0] !== 'undefined') {
          this.checkExpression(expression.args[0])
        }

        expression.binaryRuntimeMethod = staticMethod
        expression.valueType = 'boolean'

        return 'boolean'
      }

      if (staticMethod === 'alloc') {
        if (expression.args.length !== 1) {
          this.report(
            'INOX_ARG_COUNT',
            `function Buffer.alloc expects 1 argument(s), got ${expression.args.length}`,
            expression.loc
          )
        }

        if (expression.args[0] !== null && typeof expression.args[0] !== 'undefined') {
          this.checkAssignableType(
            this.checkExpression(expression.args[0]),
            'number',
            expression.args[0].loc,
            false,
            false
          )
        }

        expression.binaryRuntimeMethod = staticMethod
        expression.valueType = 'bytes'

        return 'bytes'
      }
    }

    const objectType = this.checkExpression(expression.callee.object)

    if (objectType !== 'bytes') {
      return null
    }

    const instanceMethod = binaryInstanceRuntimeMethodName(expression.callee.property)

    if (instanceMethod === 'slice') {
      if (expression.args.length < 1 || expression.args.length > 2) {
        this.report(
          'INOX_ARG_COUNT',
          `bytes.slice expects 1 or 2 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      for (let index = 0; index < expression.args.length; index = index + 1) {
        const arg = checkerNodeAt(expression.args, index)

        this.checkAssignableType(this.checkExpression(arg), 'number', arg.loc, false, false)
      }

      expression.binaryRuntimeMethod = instanceMethod
      expression.valueType = 'bytes'

      return 'bytes'
    }

    if (instanceMethod === 'toString') {
      if (expression.args.length > 1) {
        this.report(
          'INOX_ARG_COUNT',
          `bytes.toString expects 0 or 1 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      this.checkUtf8EncodingArg(expression, 0, 'bytes.toString')
      expression.binaryRuntimeMethod = instanceMethod
      expression.valueType = 'string'

      return 'string'
    }

    return null
  }

  checkBufferUnsupportedCall(expression: AnyNode): ValueType | null {
    const path = memberExpressionPath(expression.callee)
    const unsupported = unsupportedBufferRuntimeExport(
      path,
      this.resolveStdlibRuntimeDirectImportName(path, 'buffer'),
      this.resolveMemberPathRootSymbol(path)
    )

    if (unsupported === null || typeof unsupported === 'undefined') {
      return null
    }

    for (let index = 0; index < expression.args.length; index = index + 1) {
      const arg = checkerNodeAt(expression.args, index)

      this.checkExpression(arg)
    }

    this.report(
      'INOX_NOT_IMPLEMENTED',
      `node:buffer ${unsupported} is not implemented by the current C backend`,
      expression.loc
    )
    expression.valueType = 'unknown'

    return 'unknown'
  }

  checkEventStreamUnsupportedCall(expression: AnyNode): ValueType | null {
    const path = memberExpressionPath(expression.callee)
    const rootSymbol = this.resolveMemberPathRootSymbol(path)
    const eventsUsage = unsupportedEventsRuntimeExport(
      path,
      this.resolveStdlibRuntimeDirectImportName(path, 'events'),
      rootSymbol
    )
    const usage =
      eventsUsage ??
      unsupportedStreamRuntimeExport(path, this.resolveStdlibRuntimeDirectImportName(path, 'stream'), rootSymbol)

    if (usage === null || typeof usage === 'undefined') {
      return null
    }

    for (let index = 0; index < expression.args.length; index = index + 1) {
      const arg = checkerNodeAt(expression.args, index)

      this.checkExpression(arg)
    }

    this.report(
      'INOX_NOT_IMPLEMENTED',
      `${usage.source} ${usage.name} is not implemented by the current C backend: ${usage.reason}`,
      expression.loc
    )
    expression.valueType = 'unknown'

    return 'unknown'
  }

  checkEventStreamUnsupportedConstructor(expression: AnyNode): ValueType | null {
    if (expression.callee.type !== 'Reference' || expression.callee.path.length !== 1) {
      return null
    }

    const path = expression.callee.path
    const rootSymbol = this.resolveMemberPathRootSymbol(path)
    const eventsUsage = unsupportedEventsRuntimeExport(
      path,
      this.resolveStdlibRuntimeDirectImportName(path, 'events'),
      rootSymbol
    )
    const usage =
      eventsUsage ??
      unsupportedStreamRuntimeExport(path, this.resolveStdlibRuntimeDirectImportName(path, 'stream'), rootSymbol)

    if (usage === null || typeof usage === 'undefined') {
      return null
    }

    this.report(
      'INOX_NOT_IMPLEMENTED',
      `${usage.source} ${usage.name} is not implemented by the current C backend: ${usage.reason}`,
      expression.loc
    )
    expression.valueType = 'unknown'

    return 'unknown'
  }

  checkUtf8EncodingArg(expression: AnyNode, index: number, label: string): void {
    const arg = expression.args[index]

    if (arg === null || typeof arg === 'undefined') {
      return
    }

    const argType = this.checkExpression(arg)

    this.checkAssignableType(argType, 'string', arg.loc, false, this.expressionCanBeNull(arg))

    if (arg.type !== 'StringLiteral' || arg.value !== 'utf8') {
      this.report('INOX_TYPE_MISMATCH', `${label} encoding must be 'utf8' in the MVP`, arg.loc)
    }
  }

  checkCryptoCall(expression: AnyNode): ValueType | null {
    const path = memberExpressionPath(expression.callee)
    const importedName = this.resolveStdlibRuntimeDirectImportName(path, 'crypto')
    const moduleObjectMemberName = this.resolveStdlibModuleObjectMemberName(path, 'crypto')
    const call = cryptoRuntimeCallInfo(path, importedName, moduleObjectMemberName)

    if (call === null || typeof call === 'undefined') {
      return null
    }

    const diagnostics: CryptoCheckerDiagnostic[] = []
    const context: CryptoCheckerContext = {
      argNullables: this.cryptoArgumentNullables(expression),
      argTypes: this.cryptoArgumentTypes(expression),
      diagnostics,
      importedName,
      moduleObjectMemberName,
      supportsCryptoHash: this.supportsCryptoHash()
    }
    const valueType = checkPackageCryptoCall(expression, context)

    this.reportCryptoCheckerDiagnostics(diagnostics)

    return valueType
  }

  checkCryptoHashMethodCall(expression: AnyNode): ValueType | null {
    if (expression.callee.type !== 'MemberExpression') {
      return null
    }

    const method = expression.callee.property

    if (method !== 'update' && method !== 'digest') {
      return null
    }

    const objectType = this.checkExpression(expression.callee.object)

    if (objectType !== 'crypto-hash' && objectType !== 'crypto-hmac') {
      return null
    }

    const diagnostics: CryptoCheckerDiagnostic[] = []
    const context: CryptoHashMethodCheckerContext = {
      argNullables: this.cryptoHashMethodArgumentNullables(expression, method),
      argTypes: this.cryptoHashMethodArgumentTypes(expression, method),
      diagnostics
    }
    const valueType = checkPackageCryptoHashMethodCall(expression, objectType, context)

    this.reportCryptoCheckerDiagnostics(diagnostics)

    return valueType
  }

  cryptoArgumentTypes(expression: AnyNode): ValueType[] {
    const result: ValueType[] = []

    for (let index = 0; index < expression.args.length; index = index + 1) {
      const arg = checkerNodeAt(expression.args, index)

      result.push(this.checkExpression(arg))
    }

    return result
  }

  cryptoArgumentNullables(expression: AnyNode): boolean[] {
    const result: boolean[] = []

    for (let index = 0; index < expression.args.length; index = index + 1) {
      const arg = checkerNodeAt(expression.args, index)

      result.push(this.expressionCanBeNull(arg))
    }

    return result
  }

  cryptoHashMethodArgumentTypes(expression: AnyNode, method: string): ValueType[] {
    const result: ValueType[] = []

    if (expression.args[0] !== null && typeof expression.args[0] !== 'undefined') {
      result.push(this.checkExpression(expression.args[0]))
    }

    if (method === 'update' && expression.args[1] !== null && typeof expression.args[1] !== 'undefined') {
      result.push(this.checkExpression(expression.args[1]))
    }

    return result
  }

  cryptoHashMethodArgumentNullables(expression: AnyNode, method: string): boolean[] {
    const result: boolean[] = []

    if (expression.args[0] !== null && typeof expression.args[0] !== 'undefined') {
      result.push(this.expressionCanBeNull(expression.args[0]))
    }

    if (method === 'update' && expression.args[1] !== null && typeof expression.args[1] !== 'undefined') {
      result.push(this.expressionCanBeNull(expression.args[1]))
    }

    return result
  }

  reportCryptoCheckerDiagnostics(diagnostics: CryptoCheckerDiagnostic[]): void {
    for (let index = 0; index < diagnostics.length; index = index + 1) {
      const item = diagnostics[index]

      this.report(item.code, item.message, item.loc)
    }
  }

  checkChildProcessCall(expression: AnyNode): ValueType | null {
    const path = memberExpressionPath(expression.callee)
    const call = childProcessRuntimeCallInfo(
      path,
      this.resolveStdlibRuntimeDirectImportName(path, 'child-process'),
      this.resolveStdlibModuleObjectMemberName(path, 'child-process')
    )

    if (call === null || typeof call === 'undefined') {
      return null
    }

    if (call.unsupported) {
      for (let index = 0; index < expression.args.length; index = index + 1) {
        const arg = checkerNodeAt(expression.args, index)

        this.checkExpression(arg)
      }

      this.report(
        'INOX_NOT_IMPLEMENTED',
        `node:child_process ${call.method} is not implemented by the current C backend`,
        expression.loc
      )
      expression.valueType = 'unknown'
      return 'unknown'
    }

    if (call.method === 'execSync') {
      if (expression.args.length !== 2) {
        this.report(
          'INOX_ARG_COUNT',
          `function ${call.label} expects 2 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      if (expression.args[0] !== null && typeof expression.args[0] !== 'undefined') {
        this.checkAssignableType(
          this.checkExpression(expression.args[0]),
          'string',
          expression.args[0].loc,
          false,
          false
        )
      }

      this.checkChildProcessSyncOptions(expression.args[1], expression.loc, true)
      expression.childProcessRuntimeMethod = call.method
      expression.valueType = 'string'

      return 'string'
    }

    if (call.method === 'execFileSync') {
      if (expression.args.length < 2 || expression.args.length > 3) {
        this.report(
          'INOX_ARG_COUNT',
          `function ${call.label} expects 2 or 3 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      if (expression.args[0] !== null && typeof expression.args[0] !== 'undefined') {
        this.checkAssignableType(
          this.checkExpression(expression.args[0]),
          'string',
          expression.args[0].loc,
          false,
          false
        )
      }

      const second = expression.args[1]
      let args: AnyNode | null = null
      let options: AnyNode | null = null

      if (second !== null && typeof second !== 'undefined' && second.type === 'ObjectLiteral') {
        options = second
      } else {
        if (second !== null && typeof second !== 'undefined') {
          args = second
        }

        if (expression.args[2] !== null && typeof expression.args[2] !== 'undefined') {
          options = expression.args[2]
        }
      }

      if (args !== null && typeof args !== 'undefined' && args.type !== 'ArrayLiteral') {
        this.report(
          'INOX_NOT_IMPLEMENTED',
          'node:child_process execFileSync currently expects a string[] literal args argument',
          args.loc
        )
      } else if (args !== null && typeof args !== 'undefined') {
        for (let index = 0; index < args.elements.length; index = index + 1) {
          const element = checkerNodeAt(args.elements, index)

          this.checkAssignableType(this.checkExpression(element), 'string', element.loc, false, false)
        }
      }

      this.checkChildProcessSyncOptions(options, expression.loc, true)
      expression.childProcessRuntimeMethod = call.method
      expression.valueType = 'string'

      return 'string'
    }

    if (expression.args.length < 1 || expression.args.length > 3) {
      this.report(
        'INOX_ARG_COUNT',
        `function ${call.label} expects 1 to 3 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    if (expression.args[0] !== null && typeof expression.args[0] !== 'undefined') {
      this.checkAssignableType(this.checkExpression(expression.args[0]), 'string', expression.args[0].loc, false, false)
    }

    const second = expression.args[1]
    let args: AnyNode | null = null
    let options: AnyNode | null = null

    if (second !== null && typeof second !== 'undefined' && second.type === 'ObjectLiteral') {
      options = second
    } else {
      if (second !== null && typeof second !== 'undefined') {
        args = second
      }

      if (expression.args[2] !== null && typeof expression.args[2] !== 'undefined') {
        options = expression.args[2]
      }
    }

    if (args !== null && typeof args !== 'undefined' && args.type !== 'ArrayLiteral') {
      this.report(
        'INOX_NOT_IMPLEMENTED',
        'node:child_process spawnSync currently expects a string[] literal args argument',
        args.loc
      )
    } else if (args !== null && typeof args !== 'undefined' && args.type === 'ArrayLiteral') {
      for (let index = 0; index < args.elements.length; index = index + 1) {
        const element = checkerNodeAt(args.elements, index)

        this.checkAssignableType(this.checkExpression(element), 'string', element.loc, false, false)
      }
    }

    this.checkChildProcessSyncOptions(options, expression.loc, true)
    expression.childProcessRuntimeMethod = call.method
    expression.valueType = 'object'
    expression.shape = childProcessSpawnSyncResultShape

    return 'object'
  }

  checkChildProcessSyncOptions(
    options: AnyNode | null | undefined,
    loc: SourceLocation,
    requireEncoding: boolean
  ): void {
    if (options === null || typeof options === 'undefined' || options.type !== 'ObjectLiteral') {
      let reportLoc = loc

      if (options !== null && typeof options !== 'undefined') {
        reportLoc = options.loc
      }

      this.report(
        'INOX_NOT_IMPLEMENTED',
        'node:child_process sync helpers currently require { encoding: "utf8" }',
        reportLoc
      )
      return
    }

    let encoding: AnyNode | null = null

    for (const property of options.properties) {
      if (property.key === 'encoding') {
        encoding = property.value
        break
      }
    }

    if (
      requireEncoding &&
      (encoding === null ||
        typeof encoding === 'undefined' ||
        encoding.type !== 'StringLiteral' ||
        encoding.value !== 'utf8')
    ) {
      let reportLoc = options.loc

      if (encoding !== null && typeof encoding !== 'undefined') {
        reportLoc = encoding.loc
      }

      this.report(
        'INOX_NOT_IMPLEMENTED',
        'node:child_process sync helpers currently support only { encoding: "utf8" }',
        reportLoc
      )
    }

    for (const property of options.properties) {
      if (property.key === 'encoding') {
        continue
      }

      if (property.key === 'cwd') {
        this.checkAssignableType(this.checkExpression(property.value), 'string', property.value.loc, false, false)
        continue
      }

      if (property.key === 'stdio') {
        if (
          property.value.type !== 'StringLiteral' ||
          (property.value.value !== 'pipe' && property.value.value !== 'ignore')
        ) {
          this.report(
            'INOX_NOT_IMPLEMENTED',
            "node:child_process sync helpers currently support stdio: 'pipe' or 'ignore'",
            property.value.loc
          )
        }
        continue
      }

      if (property.key === 'timeout') {
        this.checkAssignableType(this.checkExpression(property.value), 'number', property.value.loc, false, false)
        continue
      }

      if (property.key === 'env') {
        if (property.value.type !== 'ObjectLiteral') {
          this.checkExpression(property.value)
          this.report(
            'INOX_NOT_IMPLEMENTED',
            'node:child_process sync helpers currently expect env to be an object literal',
            property.value.loc
          )
          continue
        }

        const envProperties: CheckerObjectPropertyNode[] = property.value.properties

        for (const envProperty of envProperties) {
          this.checkAssignableType(
            this.checkExpression(envProperty.value),
            'string',
            envProperty.value.loc,
            false,
            false
          )
        }
        continue
      }

      this.checkExpression(property.value)
      this.report(
        'INOX_NOT_IMPLEMENTED',
        `node:child_process sync option ${property.key} is not implemented by the current C backend`,
        property.loc
      )
    }
  }

  checkOsCall(expression: AnyNode): ValueType | null {
    const path = memberExpressionPath(expression.callee)
    const call = osRuntimeCallInfo(
      path,
      this.resolveStdlibRuntimeDirectImportName(path, 'os'),
      this.resolveStdlibModuleObjectMemberName(path, 'os')
    )

    if (call === null || typeof call === 'undefined') {
      return null
    }

    const argTypes: ValueType[] = []

    for (let index = 0; index < expression.args.length; index = index + 1) {
      const arg = checkerNodeAt(expression.args, index)

      argTypes.push(this.checkExpression(arg))
    }

    if (call.unsupported) {
      this.report(
        'INOX_NOT_IMPLEMENTED',
        `node:os ${call.method} is not implemented by the current C backend`,
        expression.loc
      )
      expression.valueType = 'unknown'
      return 'unknown'
    }

    if (expression.args.length !== 0) {
      this.report(
        'INOX_ARG_COUNT',
        `function ${call.label} expects 0 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    expression.osRuntimeMethod = call.method
    expression.valueType = 'string'

    return 'string'
  }

  checkOsConstantMemberExpression(expression: AnyNode): ValueType | null {
    const path = memberExpressionPath(expression)
    const constant = osRuntimeConstantName(
      this.resolveStdlibRuntimeDirectImportName(path, 'os'),
      this.resolveStdlibModuleObjectMemberName(path, 'os')
    )

    if (constant === null || typeof constant === 'undefined') {
      return null
    }

    expression.osRuntimeConstant = constant
    expression.valueType = 'string'

    return 'string'
  }

  checkProcessCall(expression: AnyNode): ValueType | null {
    const path = memberExpressionPath(expression.callee)
    const rootSymbol = this.resolveMemberPathRootSymbol(path)
    const call = processRuntimeCallInfo(
      path,
      this.resolveStdlibRuntimeDirectImportName(path, 'process'),
      this.resolveStdlibModuleObjectMemberName(path, 'process'),
      rootSymbol
    )

    if (call === null || typeof call === 'undefined') {
      return null
    }

    const argTypes: ValueType[] = []

    for (let index = 0; index < expression.args.length; index = index + 1) {
      const arg = checkerNodeAt(expression.args, index)

      argTypes.push(this.checkExpression(arg))
    }

    if (call.unsupported) {
      this.report(
        'INOX_NOT_IMPLEMENTED',
        `node:process ${call.method} is not implemented by the current C backend`,
        expression.loc
      )
      expression.valueType = 'unknown'
      return 'unknown'
    }

    expression.processRuntimeMethod = call.method

    if (call.method === 'cwd' || call.method === 'memoryUsage') {
      if (expression.args.length !== 0) {
        this.report(
          'INOX_ARG_COUNT',
          `function ${call.label} expects 0 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      expression.valueType = call.valueType
      expression.shape = call.shape ?? null
      return expression.valueType
    }

    if (call.method === 'hrtime') {
      if (expression.args.length > 1) {
        this.report(
          'INOX_ARG_COUNT',
          `function ${call.label} expects 0 or 1 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      if (expression.args[0] !== null && typeof expression.args[0] !== 'undefined') {
        this.checkAssignableType(argTypes[0], 'array', expression.args[0].loc, false, false)
      }

      expression.valueType = call.valueType
      expression.arrayElementType = call.arrayElementType ?? null
      return expression.valueType
    }

    if (expression.args.length > 1) {
      this.report(
        'INOX_ARG_COUNT',
        `function ${call.label} expects 0 or 1 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    if (expression.args[0] !== null && typeof expression.args[0] !== 'undefined') {
      this.checkAssignableType(argTypes[0], 'number', expression.args[0].loc, false, false)
    }

    expression.valueType = 'void'
    return 'void'
  }

  checkProcessMemberExpression(expression: AnyNode): ValueType | null {
    const path = memberExpressionPath(expression)
    const info = processRuntimeMemberInfo(path, this.resolveMemberPathRootSymbol(path))

    if (info === null || typeof info === 'undefined') {
      return null
    }

    if (expression.object !== null && typeof expression.object !== 'undefined') {
      this.checkExpression(expression.object)
    }

    if (info.kind === 'unsupported-property') {
      this.report(
        'INOX_NOT_IMPLEMENTED',
        `node:process ${info.property} is not implemented by the current C backend`,
        expression.loc
      )
      expression.valueType = 'unknown'
      return 'unknown'
    }

    if (info.kind === 'env-name') {
      expression.processRuntimeEnvName = info.name
      expression.valueType = 'string'
      return 'string'
    }

    expression.processRuntimeProperty = info.property
    expression.valueType = info.valueType
    expression.shape = info.shape ?? null
    return expression.valueType
  }

  checkProcessMemberAssignment(expression: AnyNode): ValueType | null {
    const path = memberExpressionPath(expression.target)
    const property = processRuntimeAssignmentProperty(path, this.resolveMemberPathRootSymbol(path))

    if (property === null || typeof property === 'undefined') {
      return null
    }

    const valueType = this.checkExpression(expression.value)
    this.checkAssignableType(valueType, 'number', expression.value.loc, false, false)
    expression.processRuntimeProperty = property
    expression.valueType = 'number'

    return 'number'
  }

  checkProcessIndexExpression(expression: AnyNode): ValueType | null {
    const path = memberExpressionPath(expression.object)
    const property = processRuntimeIndexProperty(path, this.resolveMemberPathRootSymbol(path))

    if (property === null || typeof property === 'undefined') {
      return null
    }

    const indexType = this.checkExpression(expression.index)
    this.checkAssignableType(indexType, 'number', expression.index.loc, false, false)
    expression.processRuntimeProperty = property
    expression.valueType = 'string'

    return 'string'
  }

  checkUrlCall(expression: AnyNode): ValueType | null {
    const path = memberExpressionPath(expression.callee)
    const call = urlRuntimeCallInfo(
      path,
      this.resolveStdlibRuntimeDirectImportName(path, 'url'),
      this.resolveStdlibModuleObjectMemberName(path, 'url')
    )

    if (call === null || typeof call === 'undefined') {
      return null
    }

    const argTypes: ValueType[] = []

    for (let index = 0; index < expression.args.length; index = index + 1) {
      const arg = checkerNodeAt(expression.args, index)

      argTypes.push(this.checkExpression(arg))
    }

    if (call.unsupported) {
      this.report(
        'INOX_NOT_IMPLEMENTED',
        `node:url ${call.method} is not implemented by the current C backend`,
        expression.loc
      )
      expression.valueType = 'unknown'
      return 'unknown'
    }

    if (expression.args.length !== 1) {
      this.report(
        'INOX_ARG_COUNT',
        `function ${call.label} expects 1 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    if (expression.args[0] !== null && typeof expression.args[0] !== 'undefined') {
      let argType: ValueType = 'unknown'

      argType = argTypes[0]

      if (call.method === 'fileURLToPath') {
        const shape = this.resolveExpressionShape(expression.args[0])
        let isUrlObject = false

        if (shape !== null && typeof shape !== 'undefined' && shape.builtin === 'url.URL') {
          isUrlObject = true
        }

        if (argType !== 'string' && !(argType === 'object' && isUrlObject)) {
          this.report(
            'INOX_TYPE_MISMATCH',
            `function ${call.label} expects string or URL, got ${argType}`,
            expression.args[0].loc
          )
        }
      } else {
        this.checkAssignableType(
          argType,
          'string',
          expression.args[0].loc,
          false,
          this.expressionCanBeNull(expression.args[0])
        )
      }
    }

    expression.urlRuntimeMethod = call.method

    if (call.method === 'pathToFileURL') {
      expression.valueType = 'object'
      expression.shape = urlObjectShape
      return 'object'
    }

    expression.valueType = 'string'
    return 'string'
  }

  checkUrlSearchParamsMethodCall(expression: AnyNode): ValueType | null {
    if (expression.callee.type !== 'MemberExpression' || !isUrlSearchParamsRuntimeMethod(expression.callee.property)) {
      return null
    }

    const objectType = this.checkExpression(expression.callee.object)
    const shape = this.resolveExpressionShape(expression.callee.object)

    if (
      objectType !== 'object' ||
      shape === null ||
      typeof shape === 'undefined' ||
      shape.builtin !== 'url.URLSearchParams'
    ) {
      return null
    }

    const method = expression.callee.property
    let expectedArgs = 1

    if (method === 'set' || method === 'append') {
      expectedArgs = 2
    } else if (method === 'toString') {
      expectedArgs = 0
    }

    if (expression.args.length !== expectedArgs) {
      this.report(
        'INOX_ARG_COUNT',
        `function URLSearchParams.${method} expects ${expectedArgs} argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    for (let index = 0; index < expression.args.length; index = index + 1) {
      const arg = checkerNodeAt(expression.args, index)

      this.checkAssignableType(this.checkExpression(arg), 'string', arg.loc, false, this.expressionCanBeNull(arg))
    }

    expression.urlRuntimeMethod = `URLSearchParams.${method}`

    if (method === 'has') {
      expression.valueType = 'boolean'
      return 'boolean'
    }

    if (method === 'append' || method === 'delete' || method === 'set') {
      expression.valueType = 'void'
      return 'void'
    }

    expression.valueType = 'string'
    expression.nullable = method === 'get'

    return 'string'
  }

  checkPathCall(expression: AnyNode): ValueType | null {
    const path = memberExpressionPath(expression.callee)
    const call = pathRuntimeCallInfo(
      path,
      this.resolveStdlibRuntimeDirectImportName(path, 'path'),
      this.resolveStdlibModuleObjectMemberName(path, 'path'),
      this.resolveMemberPathRootSymbol(path)
    )

    if (call === null || typeof call === 'undefined') {
      return null
    }

    if (call.unsupported) {
      for (let index = 0; index < expression.args.length; index = index + 1) {
        const arg = checkerNodeAt(expression.args, index)

        this.checkExpression(arg)
      }

      this.report(
        'INOX_NOT_IMPLEMENTED',
        `node:path ${call.method} is not implemented by the current C backend`,
        expression.loc
      )
      expression.valueType = 'unknown'
      return 'unknown'
    }

    const method = call.method
    const argTypes: ValueType[] = []

    for (let index = 0; index < expression.args.length; index = index + 1) {
      const arg = checkerNodeAt(expression.args, index)

      argTypes.push(this.checkExpression(arg))
    }

    let returnType: ValueType = 'string'

    if (method === 'isAbsolute') {
      returnType = 'boolean'
    } else if (method === 'parse') {
      returnType = 'object'
    }

    expression.valueType = returnType
    expression.pathRuntimeMethod = method

    if (method === 'parse') {
      if (expression.args.length !== 1) {
        this.report(
          'INOX_ARG_COUNT',
          `function ${call.label} expects 1 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      if (expression.args[0] !== null && typeof expression.args[0] !== 'undefined') {
        this.checkAssignableType(
          argTypes[0],
          'string',
          expression.args[0].loc,
          false,
          this.expressionCanBeNull(expression.args[0])
        )
      }

      expression.shape = pathParseObjectShape
      return 'object'
    }

    if (method === 'format') {
      if (expression.args.length !== 1) {
        this.report(
          'INOX_ARG_COUNT',
          `function ${call.label} expects 1 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      if (expression.args[0] !== null && typeof expression.args[0] !== 'undefined') {
        this.checkAssignableType(
          argTypes[0],
          'object',
          expression.args[0].loc,
          false,
          this.expressionCanBeNull(expression.args[0])
        )
      }

      return 'string'
    }

    if (method === 'join' || method === 'resolve') {
      for (let index = 0; index < argTypes.length; index++) {
        const argType = argTypes[index]

        this.checkAssignableType(
          argType,
          'string',
          expression.args[index].loc,
          false,
          this.expressionCanBeNull(expression.args[index])
        )
      }

      return returnType
    }

    if (method === 'basename') {
      if (expression.args.length < 1 || expression.args.length > 2) {
        this.report(
          'INOX_ARG_COUNT',
          `function ${call.label} expects 1 or 2 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      for (let index = 0; index < argTypes.length; index++) {
        const argType = argTypes[index]

        this.checkAssignableType(
          argType,
          'string',
          expression.args[index].loc,
          false,
          this.expressionCanBeNull(expression.args[index])
        )
      }

      return 'string'
    }

    let expectedArgs = 1

    if (method === 'relative') {
      expectedArgs = 2
    }

    if (expression.args.length !== expectedArgs) {
      this.report(
        'INOX_ARG_COUNT',
        `function ${call.label} expects ${expectedArgs} argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    for (let index = 0; index < argTypes.length; index++) {
      const argType = argTypes[index]

      this.checkAssignableType(
        argType,
        'string',
        expression.args[index].loc,
        false,
        this.expressionCanBeNull(expression.args[index])
      )
    }

    return returnType
  }

  checkPathConstantMemberExpression(expression: AnyNode): ValueType | null {
    const path = memberExpressionPath(expression)
    const constant = pathRuntimeConstantName(
      path,
      this.resolveStdlibModuleObjectMemberName(path, 'path'),
      this.resolveMemberPathRootSymbol(path)
    )

    if (constant === null || typeof constant === 'undefined') {
      return null
    }

    expression.valueType = 'string'
    expression.pathRuntimeConstant = constant

    return 'string'
  }

  checkBufferConstantMemberExpression(expression: AnyNode): ValueType | null {
    const path = memberExpressionPath(expression)
    const constant = bufferRuntimeConstantName(path, this.resolveMemberPathRootSymbol(path))

    if (constant === null || typeof constant === 'undefined') {
      return null
    }

    expression.bufferRuntimeConstant = constant
    expression.valueType = 'number'

    return 'number'
  }

  checkDebugMemoryCall(expression: AnyNode): ValueType | null {
    const path = memberExpressionPath(expression.callee)

    if (!isDebugRuntimeMethodPath(path)) {
      return null
    }

    const method = debugRuntimeMethodNameFromKnownPath(path)

    expression.valueType = 'object'
    expression.shape = debugMemoryStatsObjectShape
    expression.debugRuntimeMethod = method

    if (expression.args.length !== 0) {
      this.report(
        'INOX_ARG_COUNT',
        `function inox.__debug.memory expects 0 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    return 'object'
  }

  checkClassMethodCall(expression: AnyNode): ValueType | null {
    if (expression.callee.type !== 'MemberExpression') {
      return null
    }

    this.checkExpression(expression.callee.object)
    const className = this.resolveClassMethodReceiverClassName(expression.callee.object)

    if (className === null || typeof className === 'undefined') {
      return null
    }

    const classSymbol = this.scope.resolve(className)
    let method: AnyNode | null = null

    if (classSymbol !== null && typeof classSymbol !== 'undefined') {
      const classMethods = classSymbol.classMethods

      if (classMethods !== null && typeof classMethods !== 'undefined') {
        for (let index = 0; index < classMethods.length; index = index + 1) {
          const item = checkerNodeAt(classMethods, index)

          if (nodeNameEquals(item, expression.callee.property)) {
            method = item
            break
          }
        }
      }
    }

    const argTypes: ValueType[] = []

    for (let index = 0; index < expression.args.length; index = index + 1) {
      const arg = checkerNodeAt(expression.args, index)

      argTypes.push(this.checkExpression(arg))
    }

    if (method === null || typeof method === 'undefined') {
      this.report('INOX_UNKNOWN_FIELD', `unknown method ${expression.callee.property}`, expression.callee.loc)
      expression.valueType = 'unknown'
      return 'unknown'
    }

    const params: AnyNode[] = []

    for (let index = 0; index < method.params.length; index = index + 1) {
      const param = checkerNodeAt(method.params, index)

      params.push(this.resolveParam(param))
    }

    const returnInfo = this.resolveDeclaredType(method.returnType, method.loc)

    if (!this.acceptsArgumentCount(params, expression.args.length)) {
      this.report(
        'INOX_ARG_COUNT',
        this.argumentCountMessage(`method ${expression.callee.property}`, params, expression.args.length),
        expression.loc
      )
    }

    for (let index = 0; index < expression.args.length; index = index + 1) {
      const param = this.paramForArgument(params, index)

      if (param !== null && typeof param !== 'undefined' && index < argTypes.length) {
        this.checkAssignableType(
          argTypes[index],
          this.argumentParamValueType(param),
          expression.args[index].loc,
          param.nullable === true,
          this.expressionCanBeNull(expression.args[index])
        )
      }
    }

    expression.valueType = returnInfo.valueType
    expression.nullable = returnInfo.nullable
    expression.arrayElementType = returnInfo.arrayElementType
    expression.arrayElementDeclaredType = returnInfo.arrayElementDeclaredType
    expression.mapKeyType = returnInfo.mapKeyType
    expression.mapValueType = returnInfo.mapValueType
    expression.promiseValueType = null

    if (returnInfo.promiseValueType !== null && typeof returnInfo.promiseValueType !== 'undefined') {
      expression.promiseValueType = returnInfo.promiseValueType
    }

    expression.setElementType = returnInfo.setElementType
    expression.shape = returnInfo.shape

    return returnInfo.valueType
  }

  checkMathCall(expression: AnyNode): ValueType | null {
    if (!isMathRuntimeMethod(expression.callee) || this.scope.resolve('Math')) {
      return null
    }

    const method = expression.callee.property
    const expectedArgCount = knownMathRuntimeArgCount(method)

    expression.mathRuntimeMethod = method
    expression.valueType = 'number'

    if (expression.args.length !== expectedArgCount) {
      this.report(
        'INOX_ARG_COUNT',
        `function Math.${method} expects ${expectedArgCount} argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    for (let index = 0; index < expression.args.length; index = index + 1) {
      const arg = checkerNodeAt(expression.args, index)

      this.checkAssignableType(this.checkExpression(arg), 'number', arg.loc, false, false)
    }

    return 'number'
  }

  checkTimeCall(expression: AnyNode): ValueType | null {
    const dateInstanceType = this.checkDateInstanceMethodCall(expression)

    if (dateInstanceType !== null && typeof dateInstanceType !== 'undefined') {
      return dateInstanceType
    }

    const path = memberExpressionPath(expression.callee)
    const call = timeRuntimeCallInfo(path, this.resolveMemberPathRootSymbol(path))

    if (call === null || typeof call === 'undefined') {
      return null
    }

    const method = call.method
    expression.valueType = 'number'

    if (method === 'dateParse') {
      if (expression.args.length !== 1) {
        this.report(
          'INOX_ARG_COUNT',
          `function ${call.root}.${call.member} expects 1 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      if (expression.args[0] !== null && typeof expression.args[0] !== 'undefined') {
        this.checkAssignableType(
          this.checkExpression(expression.args[0]),
          'string',
          expression.args[0].loc,
          false,
          this.expressionCanBeNull(expression.args[0])
        )
      }

      expression.timeRuntimeMethod = method
      return 'number'
    }

    if (method === 'dateUTC') {
      if (expression.args.length < 2 || expression.args.length > 7) {
        this.report(
          'INOX_ARG_COUNT',
          `function ${call.root}.${call.member} expects 2 to 7 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      for (let index = 0; index < expression.args.length; index = index + 1) {
        const arg = checkerNodeAt(expression.args, index)

        this.checkAssignableType(this.checkExpression(arg), 'number', arg.loc, false, false)
      }

      expression.timeRuntimeMethod = method
      return 'number'
    }

    if (expression.args.length !== 0) {
      this.report(
        'INOX_ARG_COUNT',
        `function ${call.root}.${call.member} expects 0 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    for (let index = 0; index < expression.args.length; index = index + 1) {
      this.checkExpression(checkerNodeAt(expression.args, index))
    }

    expression.timeRuntimeMethod = method
    return 'number'
  }

  checkDateInstanceMethodCall(expression: AnyNode): ValueType | null {
    if (expression.callee.type !== 'MemberExpression') {
      return null
    }

    const info = dateInstanceRuntimeMethodInfo(expression.callee.property)

    if (info === null || typeof info === 'undefined') {
      return null
    }

    const objectType = this.checkExpression(expression.callee.object)

    if (objectType !== 'date') {
      return null
    }

    if (expression.args.length !== 0) {
      this.report(
        'INOX_ARG_COUNT',
        `function Date.${info.method} expects 0 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    for (let index = 0; index < expression.args.length; index = index + 1) {
      this.checkExpression(checkerNodeAt(expression.args, index))
    }

    expression.timeRuntimeMethod = info.method
    expression.valueType = info.returnType

    return info.returnType
  }

  checkDateConstructorExpression(expression: AnyNode, argTypes: ValueType[]): ValueType | null {
    if (!this.isDateConstructorExpression(expression)) {
      return null
    }

    if (expression.args.length > 7) {
      this.report(
        'INOX_ARG_COUNT',
        `Date constructor expects 0 to 7 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    if (expression.args.length === 1) {
      const argType = argTypes[0]

      if (argType !== 'unknown' && argType !== 'number' && argType !== 'string' && argType !== 'date') {
        this.report(
          'INOX_TYPE_MISMATCH',
          `Date constructor expects number, string or Date, got ${argType}`,
          expression.args[0].loc
        )
      }
    } else if (expression.args.length > 1) {
      for (let index = 0; index < expression.args.length; index = index + 1) {
        this.checkAssignableType(argTypes[index], 'number', expression.args[index].loc, false, false)
      }
    }

    expression.timeRuntimeMethod = 'dateConstructor'
    expression.valueType = 'date'

    return 'date'
  }

  isDateConstructorExpression(expression: AnyNode): boolean {
    return isDateConstructorRuntimeExpression(memberExpressionPath(expression.callee), this.scope.resolve('Date'))
  }

  checkArrayIsArrayCall(expression: AnyNode): ValueType | null {
    const path = memberExpressionPath(expression.callee)

    if (
      path === null ||
      typeof path === 'undefined' ||
      path.length !== 2 ||
      path[0] !== 'Array' ||
      path[1] !== 'isArray'
    ) {
      return null
    }

    if (this.runtimeGlobalIsShadowed('Array')) {
      return null
    }

    expression.arrayIsArrayCall = true
    expression.valueType = 'boolean'

    if (expression.args.length !== 1) {
      this.report(
        'INOX_ARG_COUNT',
        `function Array.isArray expects 1 argument(s), got ${expression.args.length}`,
        expression.loc
      )
      return 'boolean'
    }

    this.checkExpression(expression.args[0])

    return 'boolean'
  }

  checkObjectStaticCall(expression: AnyNode): ValueType | null {
    const path = memberExpressionPath(expression.callee)

    if (
      path === null ||
      typeof path === 'undefined' ||
      path.length !== 2 ||
      path[0] !== 'Object' ||
      (path[1] !== 'values' && path[1] !== 'entries' && path[1] !== 'keys')
    ) {
      return null
    }

    if (this.runtimeGlobalIsShadowed('Object')) {
      return null
    }

    const method = path[1]

    expression.objectRuntimeMethod = method
    expression.valueType = 'array'
    expression.arrayElementType = 'unknown'
    expression.arrayElementDeclaredType = null

    if (method === 'entries') {
      expression.arrayElementType = 'array'
    } else if (method === 'keys') {
      expression.arrayElementType = 'string'
      expression.arrayElementDeclaredType = 'string'
    }

    if (expression.args.length !== 1) {
      this.report(
        'INOX_ARG_COUNT',
        `function Object.${method} expects 1 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    if (expression.args[0] !== null && typeof expression.args[0] !== 'undefined') {
      const arg = checkerNodeAt(expression.args, 0)
      const argType = this.checkExpression(arg)

      if (argType !== 'unknown' && argType !== 'object' && argType !== 'array') {
        this.report('INOX_TYPE_MISMATCH', `function Object.${method} expects an object or array argument`, arg.loc)
      }
      if (method === 'values') {
        if (argType === 'array') {
          expression.arrayElementType = this.resolveExpressionArrayElementType(arg) ?? 'unknown'
        } else {
          expression.arrayElementType = this.resolveObjectValuesElementType(arg)
        }
      }
    }

    for (let index = 1; index < expression.args.length; index = index + 1) {
      const arg = checkerNodeAt(expression.args, index)

      this.checkExpression(arg)
    }

    return 'array'
  }

  resolveObjectValuesElementType(expression: AnyNode): ValueType {
    const shape = this.resolveExpressionShape(expression)

    if (shape === null || typeof shape === 'undefined' || shape.fields.length === 0) {
      return 'unknown'
    }

    const types: ValueType[] = []

    for (const field of shape.fields) {
      let valueType: ValueType = 'unknown'

      if (field.valueType !== null && typeof field.valueType !== 'undefined') {
        valueType = field.valueType
      }

      types.push(valueType)
    }

    return commonValueType(types)
  }

  checkFsConstantMemberExpression(expression: AnyNode): ValueType | null {
    const path = memberExpressionPath(expression)
    let symbol: SymbolInfo | null = null

    if (path !== null && typeof path !== 'undefined') {
      symbol = this.scope.resolve(firstPathSegment(path))
    }

    const constantName = fsRuntimeConstantName(path, symbol)

    if (constantName === null || typeof constantName === 'undefined') {
      return null
    }

    expression.fsRuntimeConstant = constantName
    expression.valueType = 'number'

    return 'number'
  }

  checkFsStatsMethodCall(expression: AnyNode): ValueType | null {
    if (expression.callee.type !== 'MemberExpression') {
      return null
    }

    const objectType = this.checkExpression(expression.callee.object)
    const shape = this.resolveExpressionShape(expression.callee.object)

    if (
      objectType !== 'object' ||
      shape === null ||
      typeof shape === 'undefined'
    ) {
      return null
    }

    const info = fsStatsRuntimeMethodInfo(expression.callee.property, shape.builtin)

    if (info === null || typeof info === 'undefined') {
      return null
    }

    if (expression.args.length !== 0) {
      this.report(
        'INOX_ARG_COUNT',
        `function ${info.receiverName}.${expression.callee.property} expects 0 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    expression.fsRuntimeMethod = info.method
    expression.valueType = 'boolean'

    return 'boolean'
  }

  checkFetchCall(expression: AnyNode): ValueType | null {
    const method = fetchRuntimeCallName(expression.callee, this.scope.resolve('fetch'))

    if (method === null || typeof method === 'undefined') {
      return null
    }

    if (!this.requireLibuvBackend('fetch', expression.loc)) {
      expression.fetchRuntimeMethod = method
      expression.valueType = 'promise'
      expression.promiseValueType = 'object'
      expression.shape = fetchResponseObjectShape

      return 'promise'
    }

    if (expression.args.length < 1 || expression.args.length > 2) {
      this.report(
        'INOX_ARG_COUNT',
        `function fetch expects 1 or 2 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    if (expression.args[0] !== null && typeof expression.args[0] !== 'undefined') {
      this.checkAssignableType(
        this.checkExpression(expression.args[0]),
        'string',
        expression.args[0].loc,
        false,
        this.expressionCanBeNull(expression.args[0])
      )

      if (isFetchHttpsLiteral(expression.args[0]) && !this.supportsFetchHttps()) {
        this.report(
          'INOX_FETCH',
          'https fetch URLs require a configured TLS adapter and are not supported by the current C/libuv fetch slice',
          expression.args[0].loc
        )
      }
    }

    if (expression.args[1] !== null && typeof expression.args[1] !== 'undefined') {
      this.checkFetchInitObject(expression.args[1])
    }

    expression.fetchRuntimeMethod = method
    expression.valueType = 'promise'
    expression.promiseValueType = 'object'
    expression.shape = fetchResponseObjectShape

    return 'promise'
  }

  checkFetchInitObject(expression: AnyNode): void {
    if (expression.type !== 'ObjectLiteral') {
      this.checkExpression(expression)
      this.report(
        'INOX_FETCH',
        'fetch init must be an object literal in the current C/libuv fetch slice',
        expression.loc
      )
      return
    }

    for (const property of expression.properties) {
      const optionName = fetchInitOptionName(property.key)

      if (optionName === null || typeof optionName === 'undefined') {
        this.checkExpression(property.value)
        this.report(
          'INOX_FETCH',
          `fetch init option ${property.key} is not supported by the current C/libuv fetch slice`,
          property.loc
        )
        continue
      }

      if (property.key === 'method' || property.key === 'redirect') {
        this.checkAssignableType(
          this.checkExpression(property.value),
          'string',
          property.value.loc,
          false,
          this.expressionCanBeNull(property.value)
        )

        if (property.key === 'redirect' && !isSupportedFetchRedirectLiteral(property.value)) {
          this.report(
            'INOX_FETCH',
            "fetch init redirect must be 'follow', 'manual' or 'error' in the current C/libuv fetch slice",
            property.value.loc
          )
        }
        continue
      }

      if (property.key === 'body') {
        const bodyType = this.checkExpression(property.value)

        if (bodyType !== 'string' && bodyType !== 'bytes') {
          this.report(
            'INOX_FETCH',
            'fetch init body must be a string, Buffer or Uint8Array in the current C/libuv fetch slice',
            property.value.loc
          )
        }
        continue
      }

      if (property.key === 'signal') {
        const signalType = this.checkExpression(property.value)
        const signalShape = this.resolveExpressionShape(property.value)

        if (
          signalType !== 'object' ||
          signalShape === null ||
          typeof signalShape === 'undefined' ||
          signalShape.builtin !== 'fetch.AbortSignal'
        ) {
          this.report(
            'INOX_FETCH',
            'fetch init signal must be an AbortSignal in the current C/libuv fetch slice',
            property.value.loc
          )
        }
        continue
      }

      if (property.value.type !== 'ObjectLiteral') {
        this.checkExpression(property.value)
        this.report(
          'INOX_FETCH',
          'fetch init headers must be an object literal in the current C/libuv fetch slice',
          property.value.loc
        )
        continue
      }

      const headers: CheckerObjectPropertyNode[] = property.value.properties

      for (const header of headers) {
        this.checkAssignableType(
          this.checkExpression(header.value),
          'string',
          header.value.loc,
          false,
          this.expressionCanBeNull(header.value)
        )
      }
    }
  }

  supportsFetchHttps(): boolean {
    return this.options.tlsBackend === 'boringssl' || this.options.tlsBackend === 'openssl'
  }

  supportsCryptoHash(): boolean {
    return this.options.tlsBackend === 'boringssl' || this.options.tlsBackend === 'openssl'
  }

  resolveMemberPathRootSymbol(path: readonly string[] | null | undefined): SymbolInfo | null {
    if (path === null || typeof path === 'undefined' || path.length === 0) {
      return null
    }

    const root = firstPathSegment(path)
    const symbol = this.scope.resolve(root)

    if (symbol !== null && typeof symbol !== 'undefined') {
      return symbol
    }

    return builtinGlobalSymbol(root)
  }

  resolveStdlibRuntimeDirectImportName(
    path: readonly string[] | null | undefined,
    moduleId: StdlibModuleId
  ): string | null {
    if (path === null || typeof path === 'undefined' || path.length !== 1) {
      return null
    }

    const rootName = firstPathSegment(path)
    const symbol = this.scope.resolve(rootName)

    if (
      symbol === null ||
      typeof symbol === 'undefined' ||
      symbol.kind !== 'import' ||
      !isStdlibModuleImportSourceForId(symbol.importSource, moduleId) ||
      symbol.importedName === null ||
      typeof symbol.importedName === 'undefined'
    ) {
      return null
    }

    return symbol.importedName
  }

  resolveStdlibModuleObjectMemberName(
    path: readonly string[] | null | undefined,
    moduleId: StdlibModuleId
  ): string | null {
    if (path === null || typeof path === 'undefined' || path.length !== 2) {
      return null
    }

    const rootName = firstPathSegment(path)
    const symbol = this.scope.resolve(rootName)

    if (
      symbol === null ||
      typeof symbol === 'undefined' ||
      symbol.kind !== 'import' ||
      !isStdlibModuleRuntimeImportBinding(symbol.importSource, moduleId, 'module-object', symbol.importedName)
    ) {
      return null
    }

    return path[1]
  }

  checkRuntimeBuiltinImport(statement: AnyNode): void {
    if (statement.typeOnly) {
      return
    }

    if (!isStdlibModuleImportSource(statement.source) && !isRelativeImportSource(statement.source)) {
      this.report(
        'INOX_UNSUPPORTED_IMPORT_SOURCE',
        `only relative imports are implemented, got ${statement.source}`,
        statement.loc
      )
      return
    }

    if (isUnsupportedRuntimeBuiltinImportSource(statement.source)) {
      const unsupportedMessage = unsupportedRuntimeBuiltinImportMessageFromKnownSource(statement.source)

      this.report('INOX_NOT_IMPLEMENTED', unsupportedMessage, statement.loc)
      return
    }

    const feature = libuvOnlyRuntimeImportFeature(statement.source)

    if (feature !== null && typeof feature !== 'undefined') {
      this.requireLibuvBackend(feature, statement.loc)
    }
  }

  requireLibuvBackend(feature: string, loc: SourceLocation): boolean {
    if (this.options.loopBackend === 'libuv') {
      return true
    }

    this.report(
      'INOX_NOT_IMPLEMENTED',
      `${feature} is not implemented for C without libuv; compile with loopBackend: 'libuv' or --loop-backend libuv`,
      loc
    )

    return false
  }

  checkFetchAbortControllerMethodCall(expression: AnyNode): ValueType | null {
    const method =
      expression.callee.type === 'MemberExpression'
        ? fetchAbortControllerRuntimeMethod(expression.callee.property)
        : null

    if (method === null || typeof method === 'undefined') {
      return null
    }

    const objectType = this.checkExpression(expression.callee.object)
    const shape = this.resolveExpressionShape(expression.callee.object)

    if (
      objectType !== 'object' ||
      shape === null ||
      typeof shape === 'undefined' ||
      shape.builtin !== 'fetch.AbortController'
    ) {
      return null
    }

    if (expression.args.length !== 0) {
      this.report(
        'INOX_ARG_COUNT',
        `function AbortController.abort expects 0 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    expression.fetchRuntimeMethod = method
    expression.valueType = 'void'

    return 'void'
  }

  checkFetchResponseMethodCall(expression: AnyNode): ValueType | null {
    const methodInfo =
      expression.callee.type === 'MemberExpression'
        ? fetchResponseBodyMethodInfo(expression.callee.property)
        : null

    if (methodInfo === null || typeof methodInfo === 'undefined') {
      return null
    }

    const objectType = this.checkExpression(expression.callee.object)
    const shape = this.resolveExpressionShape(expression.callee.object)

    if (
      objectType !== 'object' ||
      shape === null ||
      typeof shape === 'undefined' ||
      shape.builtin !== 'fetch.Response'
    ) {
      return null
    }

    if (expression.args.length !== 0) {
      this.report(
        'INOX_ARG_COUNT',
        `function Response.${expression.callee.property} expects 0 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    if (!methodInfo.supported) {
      this.report(
        'INOX_FETCH',
        `Response.${expression.callee.property} is not supported by the current C/libuv fetch slice`,
        expression.loc
      )
      expression.valueType = 'promise'
      expression.promiseValueType = 'unknown'

      return 'promise'
    }

    expression.fetchRuntimeMethod = 'text'
    expression.valueType = 'promise'
    expression.promiseValueType = 'string'

    return 'promise'
  }

  checkFetchUnsupportedResponseBodyMember(expression: AnyNode): ValueType | null {
    if (!isFetchUnsupportedResponseBodyMember(expression.property)) {
      return null
    }

    const objectType = this.checkExpression(expression.object)
    const shape = this.resolveExpressionShape(expression.object)

    if (
      objectType !== 'object' ||
      shape === null ||
      typeof shape === 'undefined' ||
      shape.builtin !== 'fetch.Response'
    ) {
      return null
    }

    this.report(
      'INOX_FETCH',
      'Response.body streams are not supported by the current C/libuv fetch slice',
      expression.loc
    )
    expression.valueType = 'object'

    return 'object'
  }

  checkFetchHeadersMethodCall(expression: AnyNode): ValueType | null {
    const method =
      expression.callee.type === 'MemberExpression'
        ? fetchHeadersRuntimeMethodName(expression.callee.property)
        : null

    if (method === null || typeof method === 'undefined') {
      return null
    }

    const objectType = this.checkExpression(expression.callee.object)
    const shape = this.resolveExpressionShape(expression.callee.object)

    if (
      objectType !== 'object' ||
      shape === null ||
      typeof shape === 'undefined' ||
      shape.builtin !== 'fetch.Headers'
    ) {
      return null
    }

    if (expression.args.length !== 1) {
      this.report(
        'INOX_ARG_COUNT',
        `function Headers.${expression.callee.property} expects 1 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    if (expression.args[0] !== null && typeof expression.args[0] !== 'undefined') {
      this.checkAssignableType(
        this.checkExpression(expression.args[0]),
        'string',
        expression.args[0].loc,
        false,
        this.expressionCanBeNull(expression.args[0])
      )
    }

    expression.fetchRuntimeMethod = method
    expression.valueType = 'boolean'
    expression.nullable = false

    if (method === 'headersGet') {
      expression.valueType = 'string'
      expression.nullable = true
    }

    return expression.valueType
  }

  resolveClassMethodReceiverClassName(expression: AnyNode): string | null {
    if (this.isThisExpression(expression)) {
      const symbol = this.scope.resolve('this')

      if (
        symbol !== null &&
        typeof symbol !== 'undefined' &&
        symbol.className !== null &&
        typeof symbol.className !== 'undefined'
      ) {
        return symbol.className
      }

      if (expression.className !== null && typeof expression.className !== 'undefined') {
        return expression.className
      }

      return null
    }

    if (expression.type === 'Reference' && expression.path.length === 1) {
      const name = firstPathSegment(expression.path)
      const symbol = this.scope.resolve(name)

      if (
        symbol !== null &&
        typeof symbol !== 'undefined' &&
        symbol.className !== null &&
        typeof symbol.className !== 'undefined'
      ) {
        return symbol.className
      }

      if (expression.className !== null && typeof expression.className !== 'undefined') {
        return expression.className
      }

      return null
    }

    if (expression.className !== null && typeof expression.className !== 'undefined') {
      return expression.className
    }

    return null
  }

  checkFsCall(expression: AnyNode): ValueType | null {
    const info = this.resolveFsRuntimeCallInfo(expression)

    if (info === null || typeof info === 'undefined') {
      return null
    }

    const promisesApi = info.viaPromises || isFsPromisesImportSymbol(this.scope.resolve(info.root))
    const plan = fsRuntimeCallPlan(info, promisesApi, expression.args.length)

    if (plan.unsupportedMessage !== null && typeof plan.unsupportedMessage !== 'undefined') {
      this.report('INOX_FS_UNSUPPORTED', plan.unsupportedMessage, expression.loc)
      expression.valueType = 'unknown'

      return 'unknown'
    }

    if (expression.args.length < plan.minArgs || expression.args.length > plan.maxArgs) {
      this.report(
        'INOX_ARG_COUNT',
        `function ${plan.label} expects ${plan.expectedArgsLabel} argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    const options = this.checkFsRuntimeArguments(expression, plan.argumentChecks)

    this.applyFsRuntimeCallPlan(expression, plan, options)

    return plan.valueType
  }

  resolveFsRuntimeCallInfo(expression: AnyNode): FsRuntimeCallInfo | null {
    const info = fsRuntimeCallInfo(expression.callee)

    if (info !== null && typeof info !== 'undefined') {
      if (isFsRuntimeRootSymbol(this.scope.resolve(info.root))) {
        return info
      }

      return null
    }

    let symbol: SymbolInfo | null = null

    if (expression.callee.type === 'Reference' && expression.callee.path.length === 1) {
      symbol = this.scope.resolve(expression.callee.path[0])
    }

    return fsRuntimeCallInfoFromImportSymbol(expression.callee, symbol)
  }

  checkFsRuntimeArguments(expression: AnyNode, checks: FsRuntimeArgumentCheck[]): FsBooleanOptions {
    const options: FsBooleanOptions = {}

    for (const check of checks) {
      if (check.kind === 'string') {
        this.checkFsStringArg(expression, check.index)
      } else if (check.kind === 'number') {
        this.checkFsNumberArg(expression, check.index)
      } else if (check.kind === 'utf8-encoding') {
        this.checkUtf8EncodingArg(expression, check.index, check.label)
      } else if (check.kind === 'write-data') {
        options.bytes = this.checkFsWriteDataArg(expression, check.index, check.label)
      } else if (check.kind === 'readdir-options') {
        options.withFileTypes = this.checkFsReaddirOptionsArg(expression, check.index, check.label)
      } else if (
        check.kind === 'boolean-options' &&
        check.allowedOptions !== null &&
        typeof check.allowedOptions !== 'undefined'
      ) {
        const booleanOptions = this.checkFsBooleanOptionsArg(expression, check.index, check.label, check.allowedOptions)

        if (booleanOptions.recursive === true) {
          options.recursive = true
        }

        if (booleanOptions.force === true) {
          options.force = true
        }

        if (booleanOptions.withFileTypes === true) {
          options.withFileTypes = true
        }
      }
    }

    return options
  }

  applyFsRuntimeCallPlan(expression: AnyNode, plan: FsRuntimeCallPlan, options: FsBooleanOptions): void {
    expression.fsRuntimeMethod = plan.runtimeMethod
    expression.valueType = plan.valueType
    expression.promiseValueType = plan.promiseValueType
    expression.shape = null
    expression.arrayElementType = plan.arrayElementType
    expression.arrayElementDeclaredType = plan.arrayElementDeclaredType

    if (plan.shape === 'stats') {
      expression.shape = fsStatsObjectShape
    }

    if (plan.bytes !== null && typeof plan.bytes !== 'undefined') {
      expression.fsBytes = plan.bytes
    }

    if (plan.bytesFromWriteData) {
      expression.fsBytes = options.bytes === true
    }

    if (plan.direntsFromOptions && options.withFileTypes === true) {
      expression.fsDirents = true
      expression.arrayElementType = 'object'
      expression.arrayElementDeclaredType = 'fs.Dirent'
    }

    if (plan.recursiveFromOptions) {
      expression.fsRecursive = options.recursive === true
    }

    if (plan.forceFromOptions) {
      expression.fsForce = options.force === true
    }
  }

  checkFsWriteDataArg(expression: AnyNode, index: number, _label: string): boolean {
    const arg = expression.args[index]

    if (arg === null || typeof arg === 'undefined') {
      return false
    }

    const argType = this.checkExpression(arg)

    if (argType === 'bytes') {
      return true
    }

    this.checkAssignableType(argType, 'string', arg.loc, false, this.expressionCanBeNull(arg))

    return false
  }

  checkFsStringArg(expression: AnyNode, index: number): void {
    const arg = expression.args[index]

    if (arg === null || typeof arg === 'undefined') {
      return
    }

    this.checkAssignableType(this.checkExpression(arg), 'string', arg.loc, false, this.expressionCanBeNull(arg))
  }

  checkFsNumberArg(expression: AnyNode, index: number): void {
    const arg = expression.args[index]

    if (arg === null || typeof arg === 'undefined') {
      return
    }

    this.checkAssignableType(this.checkExpression(arg), 'number', arg.loc, false, this.expressionCanBeNull(arg))
  }

  checkFsReaddirOptionsArg(expression: AnyNode, index: number, label: string): boolean {
    const arg = expression.args[index]

    if (arg === null || typeof arg === 'undefined') {
      return false
    }

    if (arg.type === 'StringLiteral') {
      this.checkUtf8EncodingArg(expression, index, label)

      return false
    }

    const options = this.checkFsBooleanOptionsArg(expression, index, label, ['withFileTypes'])

    return options.withFileTypes === true
  }

  checkFsBooleanOptionsArg(expression: AnyNode, index: number, label: string, allowed: string[]): FsBooleanOptions {
    const arg = expression.args[index]
    const result: FsBooleanOptions = {}

    if (arg === null || typeof arg === 'undefined') {
      return result
    }

    if (arg.type !== 'ObjectLiteral') {
      this.report(
        'INOX_TYPE_MISMATCH',
        `${label} options must be an object literal in the current compiler slice`,
        arg.loc
      )
      this.checkExpression(arg)

      return result
    }

    const properties: CheckerObjectPropertyNode[] = arg.properties

    for (const property of properties) {
      let allowedOption = false

      for (const allowedName of allowed) {
        if (property.key === allowedName) {
          allowedOption = true
          break
        }
      }

      if (!allowedOption) {
        this.report('INOX_UNKNOWN_FIELD', `unknown ${label} option ${property.key}`, property.loc)
        this.checkExpression(property.value)
        continue
      }

      let valueType = property.value.valueType

      if (valueType === null || typeof valueType === 'undefined') {
        valueType = this.checkExpression(property.value)
      }

      if (valueType !== 'boolean' || property.value.type !== 'BooleanLiteral') {
        this.report(
          'INOX_TYPE_MISMATCH',
          `${label} option ${property.key} must be a boolean literal in the current compiler slice`,
          property.value.loc
        )
        continue
      }

      if (property.key === 'recursive') {
        result.recursive = property.value.value === true
      } else if (property.key === 'force') {
        result.force = property.value.value === true
      } else if (property.key === 'withFileTypes') {
        result.withFileTypes = property.value.value === true
      }
    }

    return result
  }

  checkJsonCall(expression: AnyNode, declared?: ResolvedTypeInfo | null): ValueType | null {
    const method = jsonRuntimeMethodName(expression.callee)

    if (method === null || typeof method === 'undefined') {
      return null
    }

    if (this.scope.resolve('JSON')) {
      return null
    }

    expression.jsonRuntimeMethod = method

    if (expression.args.length !== 1) {
      this.report(
        'INOX_ARG_COUNT',
        `function JSON.${method} expects 1 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    if (method === 'parse') {
      this.checkJsonStringArg(expression, 0)

      const literalType = this.inferJsonParseLiteralType(expression)
      let valueType: ValueType = 'object'

      if (declared !== null && typeof declared !== 'undefined' && isJsonParseDeclaredType(declared.valueType)) {
        valueType = declared.valueType
      } else if (literalType !== null && typeof literalType !== 'undefined') {
        valueType = literalType.valueType
      }

      expression.valueType = valueType
      expression.arrayElementType = null
      expression.arrayElementDeclaredType = null
      expression.mapKeyType = null
      expression.mapValueType = null
      expression.promiseValueType = null
      expression.setElementType = null
      expression.shape = null

      if (declared !== null && typeof declared !== 'undefined') {
        expression.arrayElementType = declared.arrayElementType
        expression.arrayElementDeclaredType = declared.arrayElementDeclaredType
        expression.mapKeyType = declared.mapKeyType
        expression.mapValueType = declared.mapValueType
        expression.promiseValueType = null

        if (declared.promiseValueType !== null && typeof declared.promiseValueType !== 'undefined') {
          expression.promiseValueType = declared.promiseValueType
        }

        expression.setElementType = declared.setElementType

        if (valueType === 'object') {
          expression.shape = declared.shape
        }
      } else if (literalType !== null && typeof literalType !== 'undefined') {
        expression.arrayElementType = literalType.arrayElementType
        expression.arrayElementDeclaredType = literalType.arrayElementDeclaredType

        if (valueType === 'object') {
          expression.shape = literalType.shape
        }
      }

      return valueType
    }

    if (expression.args[0] !== null && typeof expression.args[0] !== 'undefined') {
      this.checkExpression(expression.args[0])
    }

    expression.valueType = 'string'

    return 'string'
  }

  checkJsonStringArg(expression: AnyNode, index: number): void {
    const arg = expression.args[index]

    if (arg === null || typeof arg === 'undefined') {
      return
    }

    this.checkAssignableType(this.checkExpression(arg), 'string', arg.loc, false, this.expressionCanBeNull(arg))
  }

  inferJsonParseLiteralType(expression: AnyNode): JsonParseLiteralTypeInfo | null {
    const arg = expression.args[0]

    if (arg === null || typeof arg === 'undefined' || arg.type !== 'StringLiteral') {
      return null
    }

    const result = this.parseJsonLiteralType(arg.value, 0)

    if (result === null || typeof result === 'undefined') {
      return null
    }

    const end = this.skipJsonWhitespace(arg.value, result.index)

    if (end !== arg.value.length) {
      return null
    }

    return result.info
  }

  parseJsonLiteralType(source: string, index: number): JsonParseLiteralResult | null {
    const nextIndex = this.skipJsonWhitespace(source, index)
    const unit = source[nextIndex]

    if (unit === '[') {
      return this.parseJsonArrayLiteralType(source, nextIndex + 1)
    }

    if (unit === '{') {
      return this.parseJsonObjectLiteralType(source, nextIndex + 1)
    }

    if (unit === '"') {
      const stringResult = this.parseJsonStringLiteral(source, nextIndex, false)

      if (stringResult === null || typeof stringResult === 'undefined') {
        return null
      }

      return {
        info: this.jsonLiteralTypeInfo('string'),
        index: stringResult.index
      }
    }

    if (unit === '-' || this.isJsonDigit(unit)) {
      const numberEnd = this.parseJsonNumberEnd(source, nextIndex)

      if (numberEnd === null || typeof numberEnd === 'undefined') {
        return null
      }

      return {
        info: this.jsonLiteralTypeInfo('number'),
        index: numberEnd
      }
    }

    if (this.sourceStartsWith(source, nextIndex, 'true')) {
      return {
        info: this.jsonLiteralTypeInfo('boolean'),
        index: nextIndex + 4
      }
    }

    if (this.sourceStartsWith(source, nextIndex, 'false')) {
      return {
        info: this.jsonLiteralTypeInfo('boolean'),
        index: nextIndex + 5
      }
    }

    if (this.sourceStartsWith(source, nextIndex, 'null')) {
      return {
        info: this.jsonLiteralTypeInfo('unknown'),
        index: nextIndex + 4
      }
    }

    return null
  }

  parseJsonArrayLiteralType(source: string, index: number): JsonParseLiteralResult | null {
    const elements: JsonParseLiteralTypeInfo[] = []
    let nextIndex = this.skipJsonWhitespace(source, index)

    if (source[nextIndex] === ']') {
      return {
        info: this.jsonArrayLiteralTypeInfo(elements),
        index: nextIndex + 1
      }
    }

    while (nextIndex < source.length) {
      const element = this.parseJsonLiteralType(source, nextIndex)

      if (element === null || typeof element === 'undefined') {
        return null
      }

      elements.push(element.info)
      nextIndex = this.skipJsonWhitespace(source, element.index)

      if (source[nextIndex] === ']') {
        return {
          info: this.jsonArrayLiteralTypeInfo(elements),
          index: nextIndex + 1
        }
      }

      if (source[nextIndex] !== ',') {
        return null
      }

      nextIndex = this.skipJsonWhitespace(source, nextIndex + 1)
    }

    return null
  }

  parseJsonObjectLiteralType(source: string, index: number): JsonParseLiteralResult | null {
    const fields: AnyNode[] = []
    let nextIndex = this.skipJsonWhitespace(source, index)

    if (source[nextIndex] === '}') {
      return {
        info: this.jsonObjectLiteralTypeInfo(fields),
        index: nextIndex + 1
      }
    }

    while (nextIndex < source.length) {
      const key = this.parseJsonStringLiteral(source, nextIndex, true)

      if (key === null || typeof key === 'undefined') {
        return null
      }

      nextIndex = this.skipJsonWhitespace(source, key.index)

      if (source[nextIndex] !== ':') {
        return null
      }

      const value = this.parseJsonLiteralType(source, nextIndex + 1)

      if (value === null || typeof value === 'undefined') {
        return null
      }

      fields.push(this.jsonObjectLiteralField(key.value, value.info))
      nextIndex = this.skipJsonWhitespace(source, value.index)

      if (source[nextIndex] === '}') {
        return {
          info: this.jsonObjectLiteralTypeInfo(fields),
          index: nextIndex + 1
        }
      }

      if (source[nextIndex] !== ',') {
        return null
      }

      nextIndex = this.skipJsonWhitespace(source, nextIndex + 1)
    }

    return null
  }

  parseJsonStringLiteral(source: string, index: number, captureValue: boolean): JsonParseStringResult | null {
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
          if (!this.isJsonHexEscape(source, nextIndex + 2)) {
            return null
          }

          if (captureValue) {
            return null
          }

          nextIndex = nextIndex + 6
          continue
        }

        if (!this.isJsonSimpleEscape(escaped)) {
          return null
        }

        if (captureValue) {
          const escapedValue: string = this.jsonSimpleEscapeValue(escaped)
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

  parseJsonNumberEnd(source: string, index: number): number | null {
    let nextIndex = index

    if (source[nextIndex] === '-') {
      nextIndex = nextIndex + 1
    }

    if (source[nextIndex] === '0') {
      nextIndex = nextIndex + 1
    } else if (this.isJsonNonZeroDigit(source[nextIndex])) {
      nextIndex = nextIndex + 1

      while (this.isJsonDigit(source[nextIndex])) {
        nextIndex = nextIndex + 1
      }
    } else {
      return null
    }

    if (source[nextIndex] === '.') {
      nextIndex = nextIndex + 1

      if (!this.isJsonDigit(source[nextIndex])) {
        return null
      }

      while (this.isJsonDigit(source[nextIndex])) {
        nextIndex = nextIndex + 1
      }
    }

    if (source[nextIndex] === 'e' || source[nextIndex] === 'E') {
      nextIndex = nextIndex + 1

      if (source[nextIndex] === '+' || source[nextIndex] === '-') {
        nextIndex = nextIndex + 1
      }

      if (!this.isJsonDigit(source[nextIndex])) {
        return null
      }

      while (this.isJsonDigit(source[nextIndex])) {
        nextIndex = nextIndex + 1
      }
    }

    return nextIndex
  }

  skipJsonWhitespace(source: string, index: number): number {
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

  isJsonDigit(value: string | null | undefined): boolean {
    return value === '0' || this.isJsonNonZeroDigit(value)
  }

  isJsonNonZeroDigit(value: string | null | undefined): boolean {
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

  isJsonHexEscape(source: string, index: number): boolean {
    for (let offset = 0; offset < 4; offset = offset + 1) {
      if (!this.isJsonHexDigit(source[index + offset])) {
        return false
      }
    }

    return true
  }

  isJsonHexDigit(value: string | null | undefined): boolean {
    return (
      this.isJsonDigit(value) ||
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

  isJsonSimpleEscape(value: string | null | undefined): boolean {
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

  jsonSimpleEscapeValue(value: string): string {
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

  sourceStartsWith(source: string, index: number, expected: string): boolean {
    for (let offset = 0; offset < expected.length; offset = offset + 1) {
      if (source[index + offset] !== expected[offset]) {
        return false
      }
    }

    return true
  }

  jsonArrayLiteralTypeInfo(elements: JsonParseLiteralTypeInfo[]): JsonParseLiteralTypeInfo {
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
      shape = this.commonJsonArrayElementShape(elements)
    }

    return {
      valueType: 'array',
      shape,
      arrayElementType,
      arrayElementDeclaredType
    }
  }

  commonJsonArrayElementShape(elements: JsonParseLiteralTypeInfo[]): ObjectShapeInfo | null {
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

  jsonObjectLiteralTypeInfo(fields: CheckerNode[]): JsonParseLiteralTypeInfo {
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

  jsonObjectLiteralField(name: string, fieldType: JsonParseLiteralTypeInfo): CheckerNode {
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

  jsonLiteralTypeInfo(valueType: ValueType): JsonParseLiteralTypeInfo {
    return {
      valueType,
      shape: null,
      arrayElementType: null,
      arrayElementDeclaredType: null
    }
  }

  checkPromiseStaticCall(expression: AnyNode): ValueType | null {
    const method = promiseStaticMethodName(expression.callee)

    if (method === null || typeof method === 'undefined') {
      return null
    }

    if (this.scope.resolve('Promise')) {
      return null
    }

    if (expression.args.length > 1) {
      this.report(
        'INOX_ARG_COUNT',
        `function Promise.${method} expects at most 1 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    const argTypes: ValueType[] = []

    for (let index = 0; index < expression.args.length; index = index + 1) {
      const arg = checkerNodeAt(expression.args, index)

      argTypes.push(this.checkExpression(arg))
    }

    expression.valueType = 'promise'
    expression.promiseValueType = 'unknown'
    expression.promiseRejectionValueType = 'unknown'
    expression.shape = null

    if (method === 'resolve') {
      expression.promiseValueType = 'void'

      if (expression.args[0] !== null && typeof expression.args[0] !== 'undefined') {
        expression.promiseValueType = argTypes[0]
        expression.shape = this.resolveExpressionShape(expression.args[0])
      }
    } else {
      expression.promiseRejectionValueType = this.resolveRejectedExpressionValueType(expression.args[0])
    }

    return 'promise'
  }

  checkPromiseMethodCall(expression: AnyNode): ValueType | null {
    if (expression.callee.type !== 'MemberExpression' || !isPromiseMethod(expression.callee.property)) {
      return null
    }

    const objectType = this.checkExpression(expression.callee.object)

    if (objectType !== 'promise') {
      return null
    }

    const property = expression.callee.property
    let promiseValueType: ValueType = 'unknown'
    const resolvedPromiseValueType = this.resolveExpressionPromiseValueType(expression.callee.object)
    const promiseShape = this.resolveExpressionShape(expression.callee.object)

    if (resolvedPromiseValueType !== null && typeof resolvedPromiseValueType !== 'undefined') {
      promiseValueType = resolvedPromiseValueType
    }

    if (expression.args.length !== 1) {
      this.report(
        'INOX_ARG_COUNT',
        `promise.${property} expects 1 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    const callback = expression.args[0]

    if (property === 'then') {
      let mappedType: ValueType = 'unknown'

      if (callback !== null && typeof callback !== 'undefined') {
        mappedType = this.checkPromiseCallback(
          callback,
          [promiseValueType],
          null,
          'promise.then callback',
          [
            {
              shape: promiseShape
            }
          ]
        )
      }

      for (let index = 1; index < expression.args.length; index++) {
        this.checkExpression(expression.args[index])
      }

      expression.valueType = 'promise'
      expression.promiseValueType = mappedType
      expression.shape = this.resolveExpressionShape(callback)

      return 'promise'
    }

    if (callback !== null && typeof callback !== 'undefined') {
      let catchReturnType: ValueType | null = promiseValueType

      if (promiseValueType === 'unknown') {
        catchReturnType = null
      }

      const catchParamTypes: ValueType[] = ['unknown']
      const catchParamMetadata: PromiseCallbackParamMetadata[] = [
        {
          shape: null
        }
      ]
      const rejectionValueType = this.resolveExpressionPromiseRejectionValueType(expression.callee.object)

      if (rejectionValueType === 'error') {
        catchParamTypes[0] = 'object'
        catchParamMetadata[0].shape = errorObjectShape
      }

      this.checkPromiseCallback(
        callback,
        catchParamTypes,
        catchReturnType,
        'promise.catch callback',
        catchParamMetadata
      )
    }

    for (let index = 1; index < expression.args.length; index++) {
      this.checkExpression(expression.args[index])
    }

    expression.valueType = 'promise'
    expression.promiseValueType = promiseValueType
    expression.shape = promiseShape

    return 'promise'
  }

  checkPromiseCallback(
    expression: AnyNode,
    params: ValueType[],
    returnType: ValueType | null,
    label: string,
    paramMetadata: PromiseCallbackParamMetadata[] = []
  ): ValueType {
    if (expression.type !== 'ArrowFunctionExpression') {
      const callbackType = this.checkExpression(expression)

      this.checkAssignableType(callbackType, 'function', expression.loc, false, false)

      return 'unknown'
    }

    if (expression.async === true) {
      this.report(
        'INOX_ASYNC_CALLBACK',
        'async Promise callbacks are not supported in the current compiler slice; use a named async helper and await it explicitly',
        expression.loc
      )
      return 'unknown'
    }

    if (expression.params.length > params.length) {
      this.report(
        'INOX_ARG_COUNT',
        `${label} expects at most ${params.length} parameter(s), got ${expression.params.length}`,
        expression.loc
      )
    }

    let actualReturnType: ValueType = 'unknown'
    let returnLoc = expression.loc
    let returnNullable = false
    let returnPromiseValueType: ValueType | null = null

    const scopeState = this.pushScope()

    try {
      for (let index = 0; index < expression.params.length; index++) {
        const param = expression.params[index]
        let expected: ValueType = 'unknown'

        if (index < params.length) {
          expected = params[index]
        }

        let shape: ObjectShapeInfo | null = null
        let metadata: PromiseCallbackParamMetadata | null = null

        if (index < paramMetadata.length) {
          metadata = paramMetadata[index]
        }

        if (metadata !== null && typeof metadata !== 'undefined') {
          shape = metadata.shape
        }

        let actual = param.valueType

        if (param.valueType === 'unknown') {
          actual = expected
        }

        if (param.valueType !== 'unknown') {
          this.checkAssignableType(expected, param.valueType, param.loc, false, false)
        }

        param.declaredType = param.valueType

        if (param.valueType === 'unknown') {
          param.declaredType = actual
        }

        param.valueType = actual
        param.nullable = false

        if (shape !== null && typeof shape !== 'undefined') {
          param.shape = shape
        }

        this.declare(
          param.name,
          {
            kind: 'param',
            mutable: true,
            valueType: actual,
            shape,
            loc: param.loc
          },
          param.loc
        )
      }

      if (expression.expressionBody) {
        actualReturnType = this.checkExpression(expression.body)
        returnLoc = expression.loc

        if (expression.body.loc !== null && typeof expression.body.loc !== 'undefined') {
          returnLoc = expression.body.loc
        }

        returnNullable = this.expressionCanBeNull(expression.body)
        returnPromiseValueType = this.resolveExpressionPromiseValueType(expression.body)
      } else {
        const returnExpression = this.resolveSingleReturnExpression(expression.body)

        if (returnExpression === null || typeof returnExpression === 'undefined') {
          const terminalReturnExpression = this.resolveTerminalReturnExpression(expression.body)
          let expectedReturnType: ValueType = 'unknown'

          if (returnType !== null && typeof returnType !== 'undefined') {
            expectedReturnType = returnType
          }

          const returnContextState = this.pushReturnContext(expectedReturnType, false, null)

          try {
            this.checkStatements(expression.body)
          } finally {
            this.restoreReturnContext(returnContextState)
          }

          if (terminalReturnExpression !== null && typeof terminalReturnExpression !== 'undefined') {
            actualReturnType = this.checkExpression(terminalReturnExpression)
            returnLoc = expression.loc

            if (terminalReturnExpression.loc !== null && typeof terminalReturnExpression.loc !== 'undefined') {
              returnLoc = terminalReturnExpression.loc
            }

            returnNullable = this.expressionCanBeNull(terminalReturnExpression)
            returnPromiseValueType = this.resolveExpressionPromiseValueType(terminalReturnExpression)
          }
        } else {
          actualReturnType = this.checkExpression(returnExpression)
          returnLoc = expression.loc

          if (returnExpression.loc !== null && typeof returnExpression.loc !== 'undefined') {
            returnLoc = returnExpression.loc
          }

          returnNullable = this.expressionCanBeNull(returnExpression)
          returnPromiseValueType = this.resolveExpressionPromiseValueType(returnExpression)
        }
      }
    } finally {
      this.restoreScope(scopeState)
    }

    if (returnType !== null && typeof returnType !== 'undefined') {
      this.checkAssignableType(actualReturnType, returnType, returnLoc, false, returnNullable)
    }

    expression.returnType = returnType ?? actualReturnType
    expression.declaredReturnType = expression.returnType
    expression.returnNullable = returnNullable
    expression.returnPromiseValueType = returnPromiseValueType

    return actualReturnType
  }

  checkTimerHandleMethodCall(expression: AnyNode): ValueType | null {
    if (expression.callee.type !== 'MemberExpression' || !isTimerHandleMethod(expression.callee.property)) {
      return null
    }

    const objectType = this.checkExpression(expression.callee.object)

    if (objectType !== 'timer') {
      return null
    }

    for (let index = 0; index < expression.args.length; index = index + 1) {
      const arg = checkerNodeAt(expression.args, index)

      this.checkExpression(arg)
    }

    this.report(
      'INOX_TIMER_REF_UNREF',
      'timer handle ref() and unref() are not supported in the MVP; timer handles are referenced by default',
      expression.loc
    )
    expression.valueType = 'void'

    return 'void'
  }

  checkCollectionMethodCall(expression: AnyNode): ValueType | null {
    if (expression.callee.type !== 'MemberExpression') {
      return null
    }

    const property = expression.callee.property
    const objectType = this.checkExpression(expression.callee.object)

    const mapMethod = mapRuntimeMethodName(property)

    if (objectType === 'map' && mapMethod !== null && typeof mapMethod !== 'undefined') {
      const mapType = this.resolveExpressionMapType(expression.callee.object)
      let mapKeyType: ValueType = 'unknown'
      let mapRawValueType: ValueType = 'unknown'

      if (mapType !== null && typeof mapType !== 'undefined') {
        if (mapType.key !== null && typeof mapType.key !== 'undefined') {
          mapKeyType = mapType.key
        }

        if (mapType.value !== null && typeof mapType.value !== 'undefined') {
          mapRawValueType = mapType.value
        }
      }

      const mapValueType = resolvedConcreteValueTypeMetadata(mapRawValueType, 'unknown')

      if (mapMethod === 'clear') {
        this.checkCollectionArgCount(expression, 'map.clear', 0)
        expression.valueType = 'void'
        return 'void'
      }

      if (mapMethod === 'get' || mapMethod === 'has' || mapMethod === 'delete') {
        this.checkCollectionArgCount(expression, `map.${mapMethod}`, 1)

        if (expression.args[0] !== null && typeof expression.args[0] !== 'undefined') {
          const keyArg = checkerNodeAt(expression.args, 0)
          this.checkAssignableType(
            this.checkExpression(keyArg),
            mapKeyType,
            keyArg.loc,
            false,
            this.expressionCanBeNull(keyArg)
          )
        }

        for (let index = 1; index < expression.args.length; index = index + 1) {
          const arg = checkerNodeAt(expression.args, index)

          this.checkExpression(arg)
        }

        if (mapMethod === 'get') {
          expression.valueType = mapValueType
          expression.nullable = true
          expression.shape = mapType?.valueShape ?? null
          return mapValueType
        }

        expression.valueType = 'boolean'
        return 'boolean'
      }

      this.checkCollectionArgCount(expression, 'map.set', 2)

      if (expression.args[0] !== null && typeof expression.args[0] !== 'undefined') {
        const keyArg = checkerNodeAt(expression.args, 0)
        this.checkAssignableType(
          this.checkExpression(keyArg),
          mapKeyType,
          keyArg.loc,
          false,
          this.expressionCanBeNull(keyArg)
        )
      }

      if (expression.args[1] !== null && typeof expression.args[1] !== 'undefined') {
        const valueArg = checkerNodeAt(expression.args, 1)
        this.checkAssignableType(
          this.checkExpression(valueArg),
          mapRawValueType,
          valueArg.loc,
          false,
          this.expressionCanBeNull(valueArg)
        )
      }

      for (let index = 2; index < expression.args.length; index = index + 1) {
        const arg = checkerNodeAt(expression.args, index)

        this.checkExpression(arg)
      }

      expression.valueType = 'map'
      expression.mapKeyType = mapKeyType
      expression.mapValueType = mapRawValueType

      return 'map'
    }

    const setMethod = setRuntimeMethodName(property)

    if (objectType === 'set' && setMethod !== null && typeof setMethod !== 'undefined') {
      const elementType = this.resolveExpressionSetElementType(expression.callee.object) ?? 'unknown'

      if (setMethod === 'clear') {
        this.checkCollectionArgCount(expression, 'set.clear', 0)
        expression.valueType = 'void'
        return 'void'
      }

      this.checkCollectionArgCount(expression, `set.${setMethod}`, 1)

      if (expression.args[0] !== null && typeof expression.args[0] !== 'undefined') {
        this.checkAssignableType(
          this.checkExpression(expression.args[0]),
          elementType,
          expression.args[0].loc,
          false,
          this.expressionCanBeNull(expression.args[0])
        )
      }

      for (let index = 1; index < expression.args.length; index = index + 1) {
        const arg = checkerNodeAt(expression.args, index)

        this.checkExpression(arg)
      }

      if (setMethod === 'add') {
        expression.valueType = 'set'
        expression.setElementType = elementType
        return 'set'
      }

      expression.valueType = 'boolean'
      return 'boolean'
    }

    return null
  }

  checkTimerCall(expression: AnyNode): ValueType | null {
    const method = this.resolveTimerRuntimeMethod(expression.callee)

    if (method === null || typeof method === 'undefined') {
      return null
    }

    let shadow: SymbolInfo | null = null

    if (timerRuntimeMethodName(expression.callee) === method) {
      shadow = this.scope.resolve(method)
    }

    if (
      shadow !== null &&
      typeof shadow !== 'undefined' &&
      !isTimerRuntimeImportSymbol(shadow, method)
    ) {
      return null
    }

    expression.timerRuntimeMethod = method

    if (timerClearMethodName(method)) {
      if (expression.args.length !== 1) {
        this.report(
          'INOX_ARG_COUNT',
          `function ${method} expects 1 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      if (expression.args[0] !== null && typeof expression.args[0] !== 'undefined') {
        this.checkAssignableType(
          this.checkExpression(expression.args[0]),
          'timer',
          expression.args[0].loc,
          false,
          false
        )
      }

      expression.valueType = 'void'

      return 'void'
    }

    if (method === 'setImmediate') {
      if (expression.args.length !== 1) {
        this.report(
          'INOX_ARG_COUNT',
          `function setImmediate expects 1 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      this.checkTimerCallbackArg(expression, 0)
      expression.valueType = 'timer'

      return 'timer'
    }

    if (expression.args.length !== 2) {
      this.report(
        'INOX_ARG_COUNT',
        `function ${method} expects 2 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    this.checkTimerCallbackArg(expression, 0)

    if (expression.args[1] !== null && typeof expression.args[1] !== 'undefined') {
      const delayArg = checkerNodeAt(expression.args, 1)
      const delayType = this.checkExpression(delayArg)
      this.checkAssignableType(delayType, 'number', delayArg.loc, false, false)
    }

    expression.valueType = 'timer'

    return 'timer'
  }

  resolveTimerRuntimeMethod(callee: AnyNode): string | null {
    const globalMethod = timerRuntimeMethodName(callee)

    if (globalMethod !== null && typeof globalMethod !== 'undefined') {
      return globalMethod
    }

    const path = memberExpressionPath(callee)

    if (path === null || typeof path === 'undefined') {
      return null
    }

    return timerRuntimeImportMethodName(
      this.resolveStdlibRuntimeDirectImportName(path, 'timers'),
      this.resolveStdlibModuleObjectMemberName(path, 'timers')
    )
  }

  checkTimerCallbackArg(expression: AnyNode, index: number): void {
    const arg = expression.args[index]
    const functionType = timerCallbackFunctionType()

    if (arg === null || typeof arg === 'undefined') {
      return
    }

    if (arg.type === 'ArrowFunctionExpression') {
      if (arg.async === true) {
        this.report(
          'INOX_ASYNC_TIMER_CALLBACK',
          'async timer callbacks are not supported in the MVP; use a synchronous timer callback and handle Promise work explicitly',
          arg.loc
        )
        return
      }

      this.checkArrowFunctionExpression(arg, functionType)
      return
    }

    this.checkAssignableType(this.checkExpression(arg), 'function', arg.loc, false, false)

    const symbol = this.getCallableSymbol(arg)

    let params: AnyNode[] | null = null

    if (
      symbol !== null &&
      typeof symbol !== 'undefined' &&
      symbol.params !== null &&
      typeof symbol.params !== 'undefined'
    ) {
      params = symbol.params
    }

    if (params !== null && typeof params !== 'undefined' && params.length !== functionType.params.length) {
      this.report(
        'INOX_ARG_COUNT',
        `function callback expects ${functionType.params.length} argument(s), got ${params.length}`,
        arg.loc
      )
    }

    if (
      symbol !== null &&
      typeof symbol !== 'undefined' &&
      (symbol.async === true || symbol.returnType === 'promise')
    ) {
      this.report(
        'INOX_ASYNC_TIMER_CALLBACK',
        'async timer callbacks are not supported in the MVP; use a synchronous timer callback and handle Promise work explicitly',
        arg.loc
      )
      return
    }

    if (
      symbol !== null &&
      typeof symbol !== 'undefined' &&
      symbol.returnType !== null &&
      typeof symbol.returnType !== 'undefined'
    ) {
      this.checkAssignableType(
        symbol.returnType,
        functionType.returnType,
        arg.loc,
        functionType.returnNullable === true,
        symbol.returnNullable === true
      )
    }
  }

  checkCollectionArgCount(expression: AnyNode, name: string, expected: number): void {
    if (expression.args.length !== expected) {
      this.report(
        'INOX_ARG_COUNT',
        `${name} expects ${expected} argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }
  }

  checkArrayMethodCall(expression: AnyNode): ValueType | null {
    if (expression.callee.type !== 'MemberExpression' || !isArrayMethod(expression.callee.property)) {
      return null
    }

    const objectType = this.checkExpression(expression.callee.object)

    if (objectType !== 'array') {
      return null
    }

    let elementType: ValueType = 'unknown'
    const resolvedElementType = this.resolveExpressionArrayElementType(expression.callee.object)

    if (resolvedElementType !== null && typeof resolvedElementType !== 'undefined') {
      elementType = resolvedElementType
    }

    let elementDeclaredType: string = elementType
    const resolvedElementDeclaredType = this.resolveExpressionArrayElementDeclaredType(expression.callee.object)

    if (resolvedElementDeclaredType !== null && typeof resolvedElementDeclaredType !== 'undefined') {
      elementDeclaredType = resolvedElementDeclaredType
    }

    expression.arrayElementType = elementType
    expression.arrayElementDeclaredType = elementDeclaredType

    if (expression.callee.property === 'push' || expression.callee.property === 'unshift') {
      const method = expression.callee.property
      expression.valueType = 'number'

      if (expression.args.length !== 1) {
        this.report(
          'INOX_ARG_COUNT',
          `array.${method} expects 1 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      if (expression.args[0] !== null && typeof expression.args[0] !== 'undefined') {
        const pushedType = this.checkExpression(expression.args[0])

        if (elementType !== 'unknown') {
          this.checkAssignableType(
            pushedType,
            elementType,
            expression.args[0].loc,
            false,
            this.expressionCanBeNull(expression.args[0])
          )
        }
      }

      for (let index = 1; index < expression.args.length; index++) {
        this.checkExpression(expression.args[index])
      }

      return 'number'
    }

    if (expression.callee.property === 'pop') {
      expression.valueType = elementType
      expression.nullable = true

      if (expression.args.length !== 0) {
        this.report('INOX_ARG_COUNT', `array.pop expects 0 argument(s), got ${expression.args.length}`, expression.loc)
      }

      for (let index = 0; index < expression.args.length; index = index + 1) {
        const arg = checkerNodeAt(expression.args, index)

        this.checkExpression(arg)
      }

      return elementType
    }

    if (expression.callee.property === 'join') {
      expression.valueType = 'string'

      if (expression.args.length > 1) {
        this.report(
          'INOX_ARG_COUNT',
          `array.join expects 0 or 1 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      if (expression.args[0] !== null && typeof expression.args[0] !== 'undefined') {
        const separatorType = this.checkExpression(expression.args[0])

        this.checkAssignableType(
          separatorType,
          'string',
          expression.args[0].loc,
          false,
          this.expressionCanBeNull(expression.args[0])
        )
      }

      for (let index = 1; index < expression.args.length; index++) {
        this.checkExpression(expression.args[index])
      }

      return 'string'
    }

    if (expression.callee.property === 'includes') {
      expression.valueType = 'boolean'

      if (expression.args.length !== 1) {
        this.report(
          'INOX_ARG_COUNT',
          `array.includes expects 1 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      if (expression.args[0] !== null && typeof expression.args[0] !== 'undefined') {
        const searchType = this.checkExpression(expression.args[0])

        if (elementType !== 'unknown') {
          this.checkAssignableType(
            searchType,
            elementType,
            expression.args[0].loc,
            false,
            this.expressionCanBeNull(expression.args[0])
          )
        }
      }

      for (let index = 1; index < expression.args.length; index++) {
        this.checkExpression(expression.args[index])
      }

      return 'boolean'
    }

    expression.valueType = 'array'

    if (expression.callee.property === 'slice') {
      if (expression.args.length > 2) {
        this.report(
          'INOX_ARG_COUNT',
          `array.slice expects 0, 1 or 2 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      for (let index = 0; index < expression.args.length; index = index + 1) {
        const arg = checkerNodeAt(expression.args, index)
        const argType = this.checkExpression(arg)

        this.checkAssignableType(argType, 'number', arg.loc, false, false)
      }

      return 'array'
    }

    if (expression.callee.property === 'sort') {
      if (expression.args.length > 1) {
        this.report(
          'INOX_ARG_COUNT',
          `array.sort expects 0 or 1 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      if (expression.args[0] !== null && typeof expression.args[0] !== 'undefined') {
        this.checkArrayCallback(expression.args[0], [elementType, elementType], 'number')
      }

      for (let index = 1; index < expression.args.length; index++) {
        this.checkExpression(expression.args[index])
      }

      return 'array'
    }

    if (expression.callee.property === 'reduce') {
      if (expression.args.length !== 2) {
        this.report(
          'INOX_ARG_COUNT',
          `array.reduce expects 2 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      let reducedType: ValueType = 'unknown'
      let expectedReturnType: ValueType | null = null

      if (expression.args[1] !== null && typeof expression.args[1] !== 'undefined') {
        reducedType = this.checkExpression(expression.args[1])

        if (reducedType !== 'unknown') {
          expectedReturnType = reducedType
        }
      }

      if (expression.args[0] !== null && typeof expression.args[0] !== 'undefined') {
        const callbackType = this.checkArrayCallback(
          expression.args[0],
          [reducedType, elementType, 'number'],
          expectedReturnType
        )

        if (expectedReturnType !== null && typeof expectedReturnType !== 'undefined') {
          reducedType = expectedReturnType
        } else if (reducedType === 'unknown') {
          reducedType = callbackType
        }
      }

      for (let index = 2; index < expression.args.length; index = index + 1) {
        this.checkExpression(expression.args[index])
      }

      expression.valueType = reducedType
      expression.arrayElementType = null
      expression.arrayElementDeclaredType = null

      return reducedType
    }

    if (expression.args.length !== 1) {
      this.report(
        'INOX_ARG_COUNT',
        `array.${expression.callee.property} expects 1 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    if (expression.callee.property === 'filter') {
      if (expression.args[0] !== null && typeof expression.args[0] !== 'undefined') {
        if (!this.isBooleanReference(expression.args[0])) {
          this.checkArrayCallback(expression.args[0], [elementType, 'number'], 'boolean')
        }
      }

      for (let index = 1; index < expression.args.length; index++) {
        this.checkExpression(expression.args[index])
      }

      return 'array'
    }

    if (expression.callee.property === 'find') {
      expression.valueType = elementType
      expression.nullable = true

      const foundInfo = this.resolveDeclaredType(elementDeclaredType, expression.loc)
      expression.shape = null
      expression.arrayElementType = null
      expression.arrayElementDeclaredType = null
      expression.mapKeyType = null
      expression.mapValueType = null
      expression.promiseValueType = null
      expression.setElementType = null
      expression.functionType = null

      if (foundInfo.shape !== null && typeof foundInfo.shape !== 'undefined') {
        expression.shape = foundInfo.shape
      }

      if (foundInfo.arrayElementType !== null && typeof foundInfo.arrayElementType !== 'undefined') {
        expression.arrayElementType = foundInfo.arrayElementType
      }

      if (foundInfo.arrayElementDeclaredType !== null && typeof foundInfo.arrayElementDeclaredType !== 'undefined') {
        expression.arrayElementDeclaredType = foundInfo.arrayElementDeclaredType
      }

      if (foundInfo.mapKeyType !== null && typeof foundInfo.mapKeyType !== 'undefined') {
        expression.mapKeyType = foundInfo.mapKeyType
      }

      if (foundInfo.mapValueType !== null && typeof foundInfo.mapValueType !== 'undefined') {
        expression.mapValueType = foundInfo.mapValueType
      }

      if (foundInfo.promiseValueType !== null && typeof foundInfo.promiseValueType !== 'undefined') {
        expression.promiseValueType = foundInfo.promiseValueType
      }

      if (foundInfo.setElementType !== null && typeof foundInfo.setElementType !== 'undefined') {
        expression.setElementType = foundInfo.setElementType
      }

      if (foundInfo.functionType !== null && typeof foundInfo.functionType !== 'undefined') {
        expression.functionType = foundInfo.functionType
      }

      if (expression.args[0] !== null && typeof expression.args[0] !== 'undefined') {
        if (!this.isBooleanReference(expression.args[0])) {
          this.checkArrayCallback(expression.args[0], [elementType, 'number'], 'boolean')
        }
      }

      for (let index = 1; index < expression.args.length; index++) {
        this.checkExpression(expression.args[index])
      }

      return elementType
    }

    let mappedType: ValueType = 'unknown'

    if (expression.args[0] !== null && typeof expression.args[0] !== 'undefined') {
      mappedType = this.checkArrayCallback(expression.args[0], [elementType, 'number'], null)
    }

    expression.arrayElementType = mappedType
    expression.arrayElementDeclaredType = mappedType

    for (let index = 1; index < expression.args.length; index++) {
      this.checkExpression(expression.args[index])
    }

    return 'array'
  }

  isBooleanReference(expression: AnyNode): boolean {
    return (
      expression.type === 'Reference' && expression.path.length === 1 && firstPathSegment(expression.path) === 'Boolean'
    )
  }

  checkArrayCallback(expression: AnyNode, params: ValueType[], returnType: ValueType | null): ValueType {
    if (expression.type !== 'ArrowFunctionExpression') {
      const callbackType = this.checkExpression(expression)

      this.checkAssignableType(callbackType, 'function', expression.loc, false, false)

      return 'unknown'
    }

    if (expression.async === true) {
      this.report(
        'INOX_ASYNC_CALLBACK',
        'async Array callbacks are not supported in the current compiler slice; use a synchronous callback',
        expression.loc
      )
      return 'unknown'
    }

    if (expression.params.length > params.length) {
      this.report(
        'INOX_ARG_COUNT',
        `array callback expects at most ${params.length} parameter(s), got ${expression.params.length}`,
        expression.loc
      )
    }

    let actualReturnType: ValueType = 'unknown'
    let returnLoc = expression.loc
    let returnNullable = false

    const scopeState = this.pushScope()

    try {
      for (let index = 0; index < expression.params.length; index++) {
        const param = expression.params[index]
        let expected: ValueType = 'unknown'

        if (index < params.length) {
          expected = params[index]
        }

        let actual = param.valueType

        if (actual === 'unknown') {
          actual = expected
        }

        if (param.valueType !== 'unknown') {
          this.checkAssignableType(expected, param.valueType, param.loc, false, false)
        }

        param.declaredType = param.valueType

        if (param.valueType === 'unknown') {
          param.declaredType = actual
        }

        param.valueType = actual
        param.nullable = false

        this.declare(
          param.name,
          {
            kind: 'param',
            mutable: true,
            valueType: actual,
            loc: param.loc
          },
          param.loc
        )
      }

      if (expression.expressionBody) {
        actualReturnType = this.checkExpression(expression.body)
        returnLoc = expression.loc

        if (expression.body.loc !== null && typeof expression.body.loc !== 'undefined') {
          returnLoc = expression.body.loc
        }

        returnNullable = this.expressionCanBeNull(expression.body)
      } else {
        const returnExpression = this.resolveSingleReturnExpression(expression.body)

        if (returnExpression === null || typeof returnExpression === 'undefined') {
          const terminalReturnExpression = this.resolveTerminalReturnExpression(expression.body)
          let expectedReturnType: ValueType = 'unknown'

          if (returnType !== null && typeof returnType !== 'undefined') {
            expectedReturnType = returnType
          }

          const returnContextState = this.pushReturnContext(expectedReturnType, false, null)

          try {
            this.checkStatements(expression.body)
          } finally {
            this.restoreReturnContext(returnContextState)
          }

          if (terminalReturnExpression !== null && typeof terminalReturnExpression !== 'undefined') {
            actualReturnType = this.checkExpression(terminalReturnExpression)
            returnLoc = expression.loc

            if (terminalReturnExpression.loc !== null && typeof terminalReturnExpression.loc !== 'undefined') {
              returnLoc = terminalReturnExpression.loc
            }

            returnNullable = this.expressionCanBeNull(terminalReturnExpression)
          }
        } else {
          actualReturnType = this.checkExpression(returnExpression)
          returnLoc = expression.loc

          if (returnExpression.loc !== null && typeof returnExpression.loc !== 'undefined') {
            returnLoc = returnExpression.loc
          }

          returnNullable = this.expressionCanBeNull(returnExpression)
        }
      }
    } finally {
      this.restoreScope(scopeState)
    }

    if (returnType !== null && typeof returnType !== 'undefined') {
      this.checkAssignableType(actualReturnType, returnType, returnLoc, false, returnNullable)
    }

    expression.returnType = actualReturnType

    if (returnType !== null && typeof returnType !== 'undefined') {
      expression.returnType = returnType
    }

    expression.declaredReturnType = expression.returnType
    expression.returnNullable = returnNullable

    return actualReturnType
  }

  resolveSingleReturnExpression(statements: AnyNode[]): AnyNode | null {
    if (statements.length !== 1) {
      return null
    }

    const statement = statements[0]

    if (statement.type !== 'ReturnStatement') {
      return null
    }

    if (statement.argument !== null && typeof statement.argument !== 'undefined') {
      return statement.argument
    }

    return null
  }

  resolveTerminalReturnExpression(statements: AnyNode[]): AnyNode | null {
    if (statements.length === 0) {
      return null
    }

    const statement = statements[statements.length - 1]

    if (statement.type !== 'ReturnStatement') {
      return null
    }

    if (statement.argument !== null && typeof statement.argument !== 'undefined') {
      return statement.argument
    }

    return null
  }

  checkStringConversionCall(expression: AnyNode): ValueType | null {
    if (
      expression.callee.type !== 'Reference' ||
      expression.callee.path.length !== 1 ||
      firstPathSegment(expression.callee.path) !== 'String'
    ) {
      return null
    }

    const argTypes: ValueType[] = []

    for (let index = 0; index < expression.args.length; index = index + 1) {
      const arg = checkerNodeAt(expression.args, index)

      argTypes.push(this.checkExpression(arg))
    }

    if (expression.args.length !== 1) {
      this.report('INOX_ARG_COUNT', `String expects 1 argument(s), got ${expression.args.length}`, expression.loc)
      return 'string'
    }

    const arg = checkerNodeAt(expression.args, 0)
    const hasClassToString = this.hasStringReturningClassToStringMethod(arg)

    if (
      argTypes[0] !== 'boolean' &&
      argTypes[0] !== 'null' &&
      argTypes[0] !== 'number' &&
      argTypes[0] !== 'string' &&
      !hasClassToString
    ) {
      this.report('INOX_TYPE_MISMATCH', `cannot convert ${argTypes[0]} to string with String`, expression.args[0].loc)
    }

    return 'string'
  }

  checkRegExpLiteral(expression: AnyNode): ValueType {
    expression.valueType = 'regexp'
    this.checkRegExpFlags(expression)

    return 'regexp'
  }

  checkRegExpFlags(expression: AnyNode): void {
    const flags = regexpFlags(expression)
    const seen: Set<string> = new Set()

    for (let index = 0; index < flags.length; index = index + 1) {
      const flag = flags[index]

      if (seen.has(flag)) {
        this.report('INOX_REGEXP_FLAG', `duplicate regular expression flag ${flag}`, expression.loc)
        continue
      }

      seen.add(flag)

      if (flag !== 'i') {
        this.report(
          'INOX_REGEXP_FLAG',
          `regular expression flag ${flag} is not supported in the current C backend slice`,
          expression.loc
        )
      }
    }
  }

  checkRegExpTestCall(expression: AnyNode): ValueType | null {
    if (expression.callee.type !== 'MemberExpression' || expression.callee.property !== 'test') {
      return null
    }

    const objectType = this.checkExpression(expression.callee.object)

    if (objectType !== 'regexp') {
      return null
    }

    const argTypes: ValueType[] = []

    for (let index = 0; index < expression.args.length; index = index + 1) {
      const arg = checkerNodeAt(expression.args, index)

      argTypes.push(this.checkExpression(arg))
    }

    if (expression.args.length !== 1) {
      this.report('INOX_ARG_COUNT', `regexp.test expects 1 argument(s), got ${expression.args.length}`, expression.loc)
    }

    if (expression.args[0] !== null && typeof expression.args[0] !== 'undefined') {
      this.checkAssignableType(
        argTypes[0],
        'string',
        expression.args[0].loc,
        false,
        this.expressionCanBeNull(expression.args[0])
      )
    }

    expression.valueType = 'boolean'
    expression.regexpRuntimeMethod = 'test'

    return 'boolean'
  }

  checkArrayFromCall(expression: AnyNode): ValueType | null {
    if (
      expression.callee.type !== 'MemberExpression' ||
      expression.callee.property !== 'from' ||
      expression.callee.object.type !== 'Reference' ||
      expression.callee.object.path.length !== 1 ||
      firstPathSegment(expression.callee.object.path) !== 'Array'
    ) {
      return null
    }

    if (this.runtimeGlobalIsShadowed('Array')) {
      return null
    }

    if (expression.args.length !== 1) {
      this.report('INOX_ARG_COUNT', `Array.from expects 1 argument(s), got ${expression.args.length}`, expression.loc)
    }

    let sourceType: ValueType = 'unknown'

    if (expression.args[0] !== null && typeof expression.args[0] !== 'undefined') {
      sourceType = this.checkExpression(expression.args[0])
    }

    for (let index = 1; index < expression.args.length; index = index + 1) {
      const arg = checkerNodeAt(expression.args, index)

      this.checkExpression(arg)
    }

    if (sourceType !== 'string') {
      const source = expression.args[0]
      let loc = expression.loc

      if (source !== null && typeof source !== 'undefined') {
        loc = source.loc
      }

      this.report('INOX_TYPE_MISMATCH', `Array.from expects string, got ${sourceType}`, loc)
    }

    expression.valueType = 'array'
    expression.arrayElementType = 'string'
    expression.arrayElementDeclaredType = 'string'

    return 'array'
  }

  checkNumberConversionCall(expression: AnyNode): ValueType | null {
    if (
      expression.callee.type !== 'Reference' ||
      expression.callee.path.length !== 1 ||
      firstPathSegment(expression.callee.path) !== 'Number'
    ) {
      return null
    }

    const argTypes: ValueType[] = []

    for (let index = 0; index < expression.args.length; index = index + 1) {
      const arg = checkerNodeAt(expression.args, index)

      argTypes.push(this.checkExpression(arg))
    }

    expression.valueType = 'number'
    expression.nullable = true

    if (expression.args.length !== 1) {
      this.report('INOX_ARG_COUNT', `Number expects 1 argument(s), got ${expression.args.length}`, expression.loc)
      return 'number'
    }

    this.checkAssignableType(
      argTypes[0],
      'string',
      expression.args[0].loc,
      false,
      this.expressionCanBeNull(expression.args[0])
    )

    return 'number'
  }

  checkNumericCastCall(expression: AnyNode): ValueType | null {
    if (expression.callee.type !== 'Reference' || expression.callee.path.length !== 1) {
      return null
    }

    const castName = firstPathSegment(expression.callee.path)

    if (!isNumericCastName(castName)) {
      return null
    }

    const argTypes: ValueType[] = []

    for (let index = 0; index < expression.args.length; index = index + 1) {
      const arg = checkerNodeAt(expression.args, index)

      argTypes.push(this.checkExpression(arg))
    }

    expression.valueType = 'number'
    expression.numericCast = castName

    if (expression.args.length !== 1) {
      this.report('INOX_ARG_COUNT', `${castName} expects 1 argument(s), got ${expression.args.length}`, expression.loc)
      return 'number'
    }

    this.checkAssignableType(
      argTypes[0],
      'number',
      expression.args[0].loc,
      false,
      this.expressionCanBeNull(expression.args[0])
    )

    return 'number'
  }

  checkNumberToStringCall(expression: AnyNode): ValueType | null {
    if (expression.callee.type !== 'MemberExpression' || expression.callee.property !== 'toString') {
      return null
    }

    const objectType = this.checkExpression(expression.callee.object)
    const argTypes: ValueType[] = []

    for (let index = 0; index < expression.args.length; index = index + 1) {
      const arg = checkerNodeAt(expression.args, index)

      argTypes.push(this.checkExpression(arg))
    }

    if (objectType !== 'number') {
      return null
    }

    expression.valueType = 'string'
    expression.numberRuntimeMethod = 'toString'

    if (expression.args.length > 1) {
      this.report(
        'INOX_ARG_COUNT',
        `number.toString expects 0 or 1 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    if (expression.args[0] !== null && typeof expression.args[0] !== 'undefined') {
      this.checkAssignableType(
        argTypes[0],
        'number',
        expression.args[0].loc,
        false,
        this.expressionCanBeNull(expression.args[0])
      )
    }

    return 'string'
  }

  checkStringCharCodeAtCall(expression: CheckerNode): ValueType | null {
    if (expression.callee.type !== 'MemberExpression' || expression.callee.property !== 'charCodeAt') {
      return null
    }

    const objectType = this.checkExpression(expression.callee.object)
    const argTypes: ValueType[] = []

    for (let index = 0; index < expression.args.length; index = index + 1) {
      const arg = checkerNodeAt(expression.args, index)

      argTypes.push(this.checkExpression(arg))
    }

    if (objectType !== 'string') {
      return null
    }

    expression.valueType = 'number'
    expression.stringRuntimeMethod = 'charCodeAt'

    if (expression.args.length !== 1) {
      this.report(
        'INOX_ARG_COUNT',
        `string.charCodeAt expects 1 argument(s), got ${expression.args.length}`,
        expression.loc
      )
      return 'number'
    }

    this.checkAssignableType(
      argTypes[0],
      'number',
      expression.args[0].loc,
      false,
      this.expressionCanBeNull(expression.args[0])
    )

    return 'number'
  }

  checkStringTrimCall(expression: AnyNode): ValueType | null {
    let method: string | null = null

    if (expression.callee.type === 'MemberExpression') {
      method = stringRuntimeMethodName(expression.callee.property)
    }

    if (!isStringTrimMethod(method)) {
      return null
    }

    const objectType = this.checkExpression(expression.callee.object)

    for (let index = 0; index < expression.args.length; index = index + 1) {
      const arg = checkerNodeAt(expression.args, index)

      this.checkExpression(arg)
    }

    if (objectType !== 'string') {
      return null
    }

    if (expression.args.length !== 0) {
      this.report(
        'INOX_ARG_COUNT',
        `string.${method} expects 0 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    expression.valueType = 'string'
    expression.stringRuntimeMethod = method

    return 'string'
  }

  checkStringCaseCall(expression: AnyNode): ValueType | null {
    if (expression.callee.type !== 'MemberExpression' || expression.callee.property !== 'toUpperCase') {
      return null
    }

    const objectType = this.checkExpression(expression.callee.object)

    for (let index = 0; index < expression.args.length; index = index + 1) {
      const arg = checkerNodeAt(expression.args, index)

      this.checkExpression(arg)
    }

    if (objectType !== 'string') {
      return null
    }

    if (expression.args.length !== 0) {
      this.report(
        'INOX_ARG_COUNT',
        `string.toUpperCase expects 0 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    expression.valueType = 'string'
    expression.stringRuntimeMethod = 'toUpperCase'

    return 'string'
  }

  checkStringPadStartCall(expression: AnyNode): ValueType | null {
    if (expression.callee.type !== 'MemberExpression' || expression.callee.property !== 'padStart') {
      return null
    }

    const objectType = this.checkExpression(expression.callee.object)
    const argTypes: ValueType[] = []

    for (let index = 0; index < expression.args.length; index = index + 1) {
      const arg = checkerNodeAt(expression.args, index)

      argTypes.push(this.checkExpression(arg))
    }

    if (objectType !== 'string') {
      return null
    }

    if (expression.args.length < 1 || expression.args.length > 2) {
      this.report(
        'INOX_ARG_COUNT',
        `string.padStart expects 1 or 2 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    if (expression.args[0] !== null && typeof expression.args[0] !== 'undefined') {
      this.checkAssignableType(argTypes[0], 'number', expression.args[0].loc, false, false)
    }

    if (expression.args.length > 1) {
      this.checkAssignableType(
        argTypes[1],
        'string',
        expression.args[1].loc,
        false,
        this.expressionCanBeNull(expression.args[1])
      )
    }

    expression.valueType = 'string'
    expression.stringRuntimeMethod = 'padStart'

    return 'string'
  }

  checkStringIndexCall(expression: AnyNode): ValueType | null {
    let method: string | null = null

    if (expression.callee.type === 'MemberExpression') {
      method = stringRuntimeMethodName(expression.callee.property)
    }

    if (method === null || typeof method === 'undefined' || !isStringIndexMethod(method)) {
      return null
    }

    const objectType = this.checkExpression(expression.callee.object)
    const argTypes: ValueType[] = []

    for (let index = 0; index < expression.args.length; index = index + 1) {
      const arg = checkerNodeAt(expression.args, index)

      argTypes.push(this.checkExpression(arg))
    }

    if (objectType !== 'string') {
      return null
    }

    if (expression.args.length < 1 || expression.args.length > 2) {
      this.report(
        'INOX_ARG_COUNT',
        `string.${method} expects 1 or 2 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    if (expression.args[0] !== null && typeof expression.args[0] !== 'undefined') {
      this.checkAssignableType(
        argTypes[0],
        'string',
        expression.args[0].loc,
        false,
        this.expressionCanBeNull(expression.args[0])
      )
    }

    if (expression.args.length > 1) {
      this.checkAssignableType(argTypes[1], 'number', expression.args[1].loc, false, false)
    }

    expression.valueType = 'number'
    expression.stringRuntimeMethod = method

    return 'number'
  }

  checkStringSliceCall(expression: AnyNode): ValueType | null {
    let method: string | null = null

    if (expression.callee.type === 'MemberExpression') {
      method = stringRuntimeMethodName(expression.callee.property)
    }

    if (method !== 'slice') {
      return null
    }

    const objectType = this.checkExpression(expression.callee.object)
    const argTypes: ValueType[] = []

    for (let index = 0; index < expression.args.length; index = index + 1) {
      const arg = checkerNodeAt(expression.args, index)

      argTypes.push(this.checkExpression(arg))
    }

    if (objectType !== 'string') {
      return null
    }

    if (expression.args.length < 1 || expression.args.length > 2) {
      this.report(
        'INOX_ARG_COUNT',
        `string.slice expects 1 or 2 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    for (let index = 0; index < argTypes.length; index++) {
      const argType = argTypes[index]

      this.checkAssignableType(argType, 'number', expression.args[index].loc, false, false)
    }

    expression.valueType = 'string'
    expression.stringRuntimeMethod = method

    return 'string'
  }

  checkStringSplitCall(expression: AnyNode): ValueType | null {
    let method: string | null = null

    if (expression.callee.type === 'MemberExpression') {
      method = stringRuntimeMethodName(expression.callee.property)
    }

    if (method !== 'split') {
      return null
    }

    const objectType = this.checkExpression(expression.callee.object)
    const argTypes: ValueType[] = []

    for (let index = 0; index < expression.args.length; index = index + 1) {
      const arg = checkerNodeAt(expression.args, index)

      argTypes.push(this.checkExpression(arg))
    }

    if (objectType !== 'string') {
      return null
    }

    if (expression.args.length !== 1) {
      this.report('INOX_ARG_COUNT', `string.split expects 1 argument(s), got ${expression.args.length}`, expression.loc)
    }

    if (expression.args[0] !== null && typeof expression.args[0] !== 'undefined') {
      this.checkAssignableType(
        argTypes[0],
        'string',
        expression.args[0].loc,
        false,
        this.expressionCanBeNull(expression.args[0])
      )
    }

    expression.valueType = 'array'
    expression.arrayElementType = 'string'
    expression.arrayElementDeclaredType = 'string'
    expression.stringRuntimeMethod = method

    return 'array'
  }

  checkStringPredicateCall(expression: AnyNode): ValueType | null {
    if (expression.callee.type !== 'MemberExpression' || !isStringPredicateMethod(expression.callee.property)) {
      return null
    }

    const method = expression.callee.property
    let maxArgs = 1

    if (method === 'includes') {
      maxArgs = 2
    }

    const objectType = this.checkExpression(expression.callee.object)
    const argTypes: ValueType[] = []

    for (let index = 0; index < expression.args.length; index = index + 1) {
      const arg = checkerNodeAt(expression.args, index)

      argTypes.push(this.checkExpression(arg))
    }

    if (objectType !== 'string') {
      return null
    }

    if (expression.args.length < 1 || expression.args.length > maxArgs) {
      this.report('INOX_ARG_COUNT', stringPredicateArgCountMessage(method, expression.args.length), expression.loc)
    }

    if (expression.args[0] !== null && typeof expression.args[0] !== 'undefined') {
      this.checkAssignableType(
        argTypes[0],
        'string',
        expression.args[0].loc,
        false,
        this.expressionCanBeNull(expression.args[0])
      )
    }

    if (expression.args.length > 1) {
      this.checkAssignableType(argTypes[1], 'number', expression.args[1].loc, false, false)
    }

    expression.valueType = 'boolean'
    expression.stringRuntimeMethod = method

    return 'boolean'
  }

  checkNewExpression(expression: AnyNode): ValueType {
    if (this.isDateConstructorExpression(expression)) {
      const dateArgTypes: ValueType[] = []

      for (let index = 0; index < expression.args.length; index = index + 1) {
        const arg = checkerNodeAt(expression.args, index)

        dateArgTypes.push(this.checkExpression(arg))
      }

      const dateConstructorType = this.checkDateConstructorExpression(expression, dateArgTypes)

      if (dateConstructorType !== null && typeof dateConstructorType !== 'undefined') {
        return dateConstructorType
      }
    }

    const promiseType = this.checkPromiseConstructorExpression(expression)

    if (promiseType !== null && typeof promiseType !== 'undefined') {
      return promiseType
    }

    const argTypes: ValueType[] = []

    for (let index = 0; index < expression.args.length; index = index + 1) {
      const arg = checkerNodeAt(expression.args, index)

      argTypes.push(this.checkExpression(arg))
    }

    const eventStreamConstructorType = this.checkEventStreamUnsupportedConstructor(expression)

    if (eventStreamConstructorType !== null && typeof eventStreamConstructorType !== 'undefined') {
      return eventStreamConstructorType
    }

    const urlType = this.checkUrlConstructorExpression(expression, argTypes)

    if (urlType !== null && typeof urlType !== 'undefined') {
      return urlType
    }

    if (expression.callee.type !== 'Reference' || expression.callee.path.length !== 1) {
      this.checkExpression(expression.callee)
      return 'object'
    }

    const collectionConstructor = collectionConstructorNameFromPath(expression.callee.path)
    const constructorName = firstPathSegment(expression.callee.path)

    if (collectionConstructor === 'Map') {
      expression.valueType = 'map'
      expression.mapKeyType = 'unknown'
      expression.mapValueType = 'unknown'

      const mapType = this.resolveMapConstructorType(expression, argTypes)

      if (mapType !== null && typeof mapType !== 'undefined') {
        if (mapType.key !== null && typeof mapType.key !== 'undefined') {
          expression.mapKeyType = mapType.key
        }

        if (mapType.value !== null && typeof mapType.value !== 'undefined') {
          expression.mapValueType = mapType.value
        }

        if (mapType.valueShape !== null && typeof mapType.valueShape !== 'undefined') {
          expression.mapValueShape = mapType.valueShape
        }
      }

      return 'map'
    }

    if (collectionConstructor === 'Set') {
      expression.valueType = 'set'
      expression.setElementType = 'unknown'

      if (argTypes.length > 0) {
        let elementType: ValueType | null = null

        if (argTypes[0] === 'set') {
          elementType = this.resolveExpressionSetElementType(expression.args[0])
        } else if (argTypes[0] === 'array') {
          elementType = this.resolveExpressionArrayElementType(expression.args[0])
        }

        if (elementType !== null && typeof elementType !== 'undefined') {
          expression.setElementType = elementType
        }
      }

      return 'set'
    }

    if (
      fetchAbortControllerConstructorName(
        expression.callee.path,
        this.scope.resolve('AbortController')
      ) === 'AbortController'
    ) {
      this.requireLibuvBackend('AbortController', expression.loc)

      if (expression.args.length !== 0) {
        this.report(
          'INOX_ARG_COUNT',
          `AbortController constructor expects 0 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      expression.fetchRuntimeMethod = 'abortControllerNew'
      expression.valueType = 'object'
      expression.shape = fetchAbortControllerObjectShape
      return 'object'
    }

    if (binaryConstructorName(expression.callee.path) === 'Uint8Array') {
      if (expression.args.length !== 1) {
        this.report(
          'INOX_ARG_COUNT',
          `Uint8Array constructor expects 1 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      if (
        expression.args[0] !== null &&
        typeof expression.args[0] !== 'undefined' &&
        argTypes[0] !== 'number' &&
        argTypes[0] !== 'array'
      ) {
        this.report(
          'INOX_TYPE_MISMATCH',
          `Uint8Array constructor expects number or number[], got ${argTypes[0]}`,
          expression.args[0].loc
        )
      }

      if (argTypes[0] === 'array') {
        const elementType = this.resolveExpressionArrayElementType(expression.args[0])

        if (elementType !== null && typeof elementType !== 'undefined') {
          this.checkAssignableType(elementType, 'number', expression.args[0].loc, false, false)
        }
      }

      expression.valueType = 'bytes'
      return 'bytes'
    }

    if (constructorName === 'Error') {
      this.checkErrorConstructorExpression(expression, argTypes)
      expression.valueType = 'object'
      expression.shape = errorObjectShape
      return 'object'
    }

    let symbol = this.scope.resolve(constructorName)

    if (symbol === null || typeof symbol === 'undefined') {
      const globalSymbol = builtinGlobalSymbol(constructorName)

      if (globalSymbol !== null && typeof globalSymbol !== 'undefined') {
        symbol = globalSymbol
      }
    }

    if (
      symbol === null ||
      typeof symbol === 'undefined' ||
      (symbol.kind !== 'class' && symbol.constructable !== true)
    ) {
      this.report('INOX_UNKNOWN_NAME', `unknown class ${constructorName}`, expression.callee.loc)
      return 'object'
    }

    if (symbol.constructable) {
      return 'object'
    }

    let constructorParams: AnyNode[] = []
    const symbolConstructorParams = symbol.constructorParams ?? null

    if (symbolConstructorParams !== null && typeof symbolConstructorParams !== 'undefined') {
      constructorParams = symbolConstructorParams
    }

    if (constructorParams.length !== expression.args.length) {
      this.report(
        'INOX_ARG_COUNT',
        `class ${constructorName} constructor expects ${constructorParams.length} argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    for (let index = 0; index < constructorParams.length; index++) {
      const param = constructorParams[index]

      if (index < argTypes.length) {
        this.checkAssignableType(
          argTypes[index],
          param.valueType,
          expression.args[index].loc,
          param.nullable === true,
          this.expressionCanBeNull(expression.args[index])
        )
      }
    }

    expression.className = constructorName
    expression.shape = null

    if (symbol.shape !== null && typeof symbol.shape !== 'undefined') {
      expression.shape = symbol.shape
    }

    return 'object'
  }

  resolveMapConstructorType(expression: AnyNode, argTypes: ValueType[]): CheckerMapType | null {
    if (expression.args.length === 0 || argTypes.length === 0) {
      return null
    }

    const firstArg = checkerNodeAt(expression.args, 0)

    if (argTypes[0] === 'map') {
      return this.resolveExpressionMapType(firstArg)
    }

    if (argTypes[0] === 'array' && firstArg.type === 'ArrayLiteral') {
      return this.resolveMapEntryArrayType(firstArg)
    }

    return null
  }

  resolveMapEntryArrayType(expression: AnyNode): CheckerMapType | null {
    if (expression.elements.length === 0) {
      return null
    }

    let key: ValueType | null = null
    let value: ValueType | null = null

    for (const entry of expression.elements) {
      if (entry.type !== 'ArrayLiteral' || entry.elements.length < 2) {
        return null
      }

      const entryKeyType = nodeValueTypeOrUnknown(checkerNodeAt(entry.elements, 0))
      const entryValueType = nodeValueTypeOrUnknown(checkerNodeAt(entry.elements, 1))

      if (entryKeyType === 'unknown' || entryValueType === 'unknown') {
        return null
      }

      if (key === null) {
        key = entryKeyType
      } else if (key !== entryKeyType) {
        return null
      }

      if (value === null) {
        value = entryValueType
      } else if (value !== entryValueType) {
        return null
      }
    }

    return {
      key,
      value
    }
  }

  checkUrlConstructorExpression(expression: AnyNode, argTypes: ValueType[]): ValueType | null {
    if (expression.callee.type !== 'Reference' || expression.callee.path.length !== 1) {
      return null
    }

    const importedName = this.resolveStdlibRuntimeDirectImportName(expression.callee.path, 'url')
    const constructorImport = urlRuntimeConstructorImportInfo(importedName)

    if (constructorImport === null || typeof constructorImport === 'undefined') {
      return null
    }

    if (constructorImport.unsupported) {
      this.report(
        'INOX_NOT_IMPLEMENTED',
        `node:url ${constructorImport.name} is not implemented by the current C backend`,
        expression.loc
      )
      expression.valueType = 'unknown'
      return 'unknown'
    }

    const constructorName = constructorImport.name

    if (constructorName === 'URLSearchParams') {
      if (expression.args.length > 1) {
        this.report(
          'INOX_ARG_COUNT',
          `URLSearchParams constructor expects 0 or 1 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      if (expression.args[0] !== null && typeof expression.args[0] !== 'undefined') {
        const argType = argTypes[0]

        if (argType !== 'string' && argType !== 'object') {
          this.report(
            'INOX_TYPE_MISMATCH',
            `URLSearchParams constructor expects string or object, got ${argType}`,
            expression.args[0].loc
          )
        }

        if (expression.args[0].type === 'ObjectLiteral') {
          const properties: CheckerObjectPropertyNode[] = expression.args[0].properties

          for (const property of properties) {
            let propertyValueType: ValueType = 'unknown'
            const knownPropertyValueType = property.value.valueType

            if (knownPropertyValueType === null || typeof knownPropertyValueType === 'undefined') {
              propertyValueType = this.checkExpression(property.value)
            } else {
              propertyValueType = knownPropertyValueType
            }

            this.checkAssignableType(
              propertyValueType,
              'string',
              property.value.loc,
              false,
              this.expressionCanBeNull(property.value)
            )
          }
        } else {
          const shape = this.resolveExpressionShape(expression.args[0])

          if (shape !== null && typeof shape !== 'undefined') {
            for (const field of shape.fields) {
              const fieldType = this.resolveFieldDeclaredType(field)

              this.checkAssignableType(fieldType.valueType, 'string', expression.args[0].loc, fieldType.nullable, false)
            }
          }
        }
      }

      expression.urlRuntimeMethod = 'URLSearchParams'
      expression.valueType = 'object'
      expression.shape = urlSearchParamsObjectShape

      return 'object'
    }

    if (expression.args.length < 1 || expression.args.length > 2) {
      this.report(
        'INOX_ARG_COUNT',
        `URL constructor expects 1 or 2 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    for (let index = 0; index < argTypes.length; index++) {
      const argType = argTypes[index]

      if (index === 1 && argType === 'object') {
        const shape = this.resolveExpressionShape(expression.args[index])

        if (shape !== null && typeof shape !== 'undefined' && shape.builtin === 'url.URL') {
          continue
        }
      }

      this.checkAssignableType(
        argType,
        'string',
        expression.args[index].loc,
        false,
        this.expressionCanBeNull(expression.args[index])
      )
    }

    expression.urlRuntimeMethod = 'URL'
    expression.valueType = 'object'
    expression.shape = urlObjectShape

    return 'object'
  }

  checkPromiseConstructorExpression(expression: AnyNode): ValueType | null {
    if (
      expression.callee.type !== 'Reference' ||
      expression.callee.path.length !== 1 ||
      firstPathSegment(expression.callee.path) !== 'Promise' ||
      this.scope.resolve('Promise')
    ) {
      return null
    }

    if (expression.args.length !== 1) {
      this.report(
        'INOX_ARG_COUNT',
        `Promise constructor expects 1 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    const executor = expression.args[0]
    let promiseValueType: ValueType = 'unknown'

    if (executor === null || typeof executor === 'undefined') {
      expression.valueType = 'promise'
      expression.promiseValueType = promiseValueType
      return 'promise'
    }

    if (executor.type !== 'ArrowFunctionExpression') {
      this.checkAssignableType(this.checkExpression(executor), 'function', executor.loc, false, false)
      expression.valueType = 'promise'
      expression.promiseValueType = promiseValueType
      return 'promise'
    }

    this.checkArrowFunctionExpression(executor, promiseExecutorFunctionType())

    let resolveName: string | null = null

    if (executor.params.length > 0) {
      resolveName = checkerNodeAt(executor.params, 0).name
    }

    if (resolveName !== null && typeof resolveName !== 'undefined') {
      promiseValueType = this.resolvePromiseExecutorValueType(executor, resolveName)
    }

    expression.valueType = 'promise'
    expression.promiseValueType = promiseValueType

    return 'promise'
  }

  resolvePromiseExecutorValueType(executor: AnyNode, resolveName: string): ValueType {
    const types: ValueType[] = []

    if (executor.expressionBody === true) {
      this.collectPromiseExecutorValueTypesFromNode(executor.body, resolveName, types)
    } else {
      this.collectPromiseExecutorValueTypesFromList(executor.body, resolveName, types)
    }

    return commonValueType(types)
  }

  collectPromiseExecutorValueTypesFromList(nodes: AnyNode[], resolveName: string, types: ValueType[]): void {
    for (const node of nodes) {
      this.collectPromiseExecutorValueTypesFromNode(node, resolveName, types)
    }
  }

  collectPromiseExecutorValueTypesFromNode(
    node: AnyNode | null | undefined,
    resolveName: string,
    types: ValueType[]
  ): void {
    if (node === null || typeof node === 'undefined') {
      return
    }

    if (
      node.type === 'CallExpression' &&
      node.callee !== null &&
      typeof node.callee !== 'undefined' &&
      node.callee.type === 'Reference' &&
      node.callee.path.length === 1 &&
      firstPathSegment(node.callee.path) === resolveName
    ) {
      let resolvedType: ValueType = 'void'

      if (node.args[0] !== null && typeof node.args[0] !== 'undefined') {
        resolvedType = this.inferCheckedExpressionType(node.args[0])
      }

      types.push(resolvedType)
    }

    if (node.type === 'BlockStatement') {
      this.collectPromiseExecutorValueTypesFromList(node.body, resolveName, types)
      return
    }

    if (node.type === 'ExpressionStatement') {
      this.collectPromiseExecutorValueTypesFromNode(node.expression, resolveName, types)
      return
    }

    if (node.type === 'VariableDeclaration') {
      this.collectPromiseExecutorValueTypesFromNode(node.init, resolveName, types)
      return
    }

    if (node.type === 'ReturnStatement' || node.type === 'ThrowStatement' || node.type === 'AwaitExpression') {
      this.collectPromiseExecutorValueTypesFromNode(node.argument, resolveName, types)
      return
    }

    if (node.type === 'AssignmentExpression') {
      this.collectPromiseExecutorValueTypesFromNode(node.target, resolveName, types)
      this.collectPromiseExecutorValueTypesFromNode(node.value, resolveName, types)
      return
    }

    if (node.type === 'BinaryExpression') {
      this.collectPromiseExecutorValueTypesFromNode(node.left, resolveName, types)
      this.collectPromiseExecutorValueTypesFromNode(node.right, resolveName, types)
      return
    }

    if (node.type === 'UnaryExpression' || node.type === 'UpdateExpression') {
      this.collectPromiseExecutorValueTypesFromNode(node.argument, resolveName, types)
      return
    }

    if (node.type === 'CallExpression' || node.type === 'OptionalCallExpression' || node.type === 'NewExpression') {
      this.collectPromiseExecutorValueTypesFromList(node.args, resolveName, types)
      return
    }

    if (node.type === 'MemberExpression' || node.type === 'OptionalMemberExpression') {
      this.collectPromiseExecutorValueTypesFromNode(node.object, resolveName, types)
      return
    }

    if (node.type === 'IndexExpression' || node.type === 'OptionalIndexExpression') {
      this.collectPromiseExecutorValueTypesFromNode(node.object, resolveName, types)
      this.collectPromiseExecutorValueTypesFromNode(node.index, resolveName, types)
      return
    }

    if (node.type === 'ArrayLiteral') {
      this.collectPromiseExecutorValueTypesFromList(node.elements, resolveName, types)
      return
    }

    if (node.type === 'ObjectLiteral') {
      for (const property of node.properties) {
        this.collectPromiseExecutorValueTypesFromNode(property.value, resolveName, types)
      }

      return
    }

    if (node.type === 'IfStatement') {
      this.collectPromiseExecutorValueTypesFromNode(node.condition, resolveName, types)
      this.collectPromiseExecutorValueTypesFromNode(node.consequent, resolveName, types)
      this.collectPromiseExecutorValueTypesFromNode(node.alternate, resolveName, types)
      return
    }

    if (node.type === 'WhileStatement') {
      this.collectPromiseExecutorValueTypesFromNode(node.condition, resolveName, types)
      this.collectPromiseExecutorValueTypesFromNode(node.body, resolveName, types)
      return
    }

    if (node.type === 'ForStatement') {
      this.collectPromiseExecutorValueTypesFromNode(node.init, resolveName, types)
      this.collectPromiseExecutorValueTypesFromNode(node.test, resolveName, types)
      this.collectPromiseExecutorValueTypesFromNode(node.update, resolveName, types)
      this.collectPromiseExecutorValueTypesFromNode(node.body, resolveName, types)
      return
    }

    if (node.type === 'ForOfStatement') {
      this.collectPromiseExecutorValueTypesFromNode(node.iterable, resolveName, types)
      this.collectPromiseExecutorValueTypesFromNode(node.body, resolveName, types)
      return
    }

    if (node.type === 'SwitchStatement') {
      this.collectPromiseExecutorValueTypesFromNode(node.discriminant, resolveName, types)

      for (const item of node.cases) {
        this.collectPromiseExecutorValueTypesFromNode(item.test, resolveName, types)
        this.collectPromiseExecutorValueTypesFromList(item.consequent, resolveName, types)
      }

      return
    }

    if (node.type === 'TryStatement') {
      this.collectPromiseExecutorValueTypesFromNode(node.block, resolveName, types)
      this.collectPromiseExecutorValueTypesFromNode(node.handler, resolveName, types)
      this.collectPromiseExecutorValueTypesFromNode(node.finalizer, resolveName, types)
      return
    }

    if (node.type === 'CatchClause') {
      this.collectPromiseExecutorValueTypesFromNode(node.body, resolveName, types)
      return
    }

    if (node.type === 'ArrowFunctionExpression') {
      this.collectPromiseExecutorValueTypesFromNode(node.body, resolveName, types)
    }
  }

  inferCheckedExpressionType(expression: AnyNode): ValueType {
    if (
      expression.valueType !== null &&
      typeof expression.valueType !== 'undefined' &&
      expression.valueType !== 'unknown'
    ) {
      return expression.valueType
    }

    if (expression.type === 'StringLiteral' || expression.type === 'TemplateLiteral') {
      return 'string'
    }

    if (expression.type === 'NumberLiteral') {
      return 'number'
    }

    if (expression.type === 'BooleanLiteral') {
      return 'boolean'
    }

    if (expression.type === 'NullLiteral') {
      return 'null'
    }

    return this.checkExpression(expression)
  }

  checkErrorConstructorExpression(expression: AnyNode, argTypes: ValueType[]): void {
    if (expression.args.length > 2) {
      this.report(
        'INOX_ARG_COUNT',
        `Error constructor expects at most 2 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    if (expression.args[0] !== null && typeof expression.args[0] !== 'undefined') {
      this.checkAssignableType(
        argTypes[0],
        'string',
        expression.args[0].loc,
        false,
        this.expressionCanBeNull(expression.args[0])
      )
    }

    const options = expression.args[1]

    if (options === null || typeof options === 'undefined') {
      return
    }

    if (options.type !== 'ObjectLiteral') {
      this.report(
        'INOX_TYPE_MISMATCH',
        'Error options must be an object literal in the current compiler slice',
        options.loc
      )
      return
    }

    const properties: CheckerObjectPropertyNode[] = options.properties

    for (const property of properties) {
      if (property.key !== 'code' && property.key !== 'cause') {
        this.report('INOX_UNKNOWN_FIELD', `unknown Error option ${property.key}`, property.loc)
        continue
      }

      if (property.key === 'code') {
        this.checkAssignableType(
          property.value.valueType ?? this.checkExpression(property.value),
          'string',
          property.value.loc,
          false,
          this.expressionCanBeNull(property.value)
        )
      } else {
        const causeType = property.value.valueType ?? this.checkExpression(property.value)

        if (property.value.type !== 'NullLiteral' && causeType !== 'object') {
          this.report(
            'INOX_TYPE_MISMATCH',
            'Error cause must be an Error object or null in the current compiler slice',
            property.value.loc
          )
        }
      }
    }
  }

  checkVariableInitializer(expression: AnyNode, declared: ResolvedTypeInfo | null): ValueType {
    if (
      expression.type === 'ArrowFunctionExpression' &&
      declared !== null &&
      typeof declared !== 'undefined' &&
      declared.valueType === 'function'
    ) {
      const functionType = declared.functionType

      if (functionType !== null && typeof functionType !== 'undefined') {
        this.checkArrowFunctionExpression(expression, functionType)
        return 'function'
      }
    }

    if (expression.type === 'CallExpression') {
      const jsonType = this.checkJsonCall(expression, declared)

      if (jsonType !== null && typeof jsonType !== 'undefined') {
        return jsonType
      }
    }

    return this.checkExpression(expression)
  }

  checkArrowFunctionExpression(expression: AnyNode, functionType?: AnyNode | null): void {
    if (expression.async === true) {
      this.report(
        'INOX_ASYNC_CALLBACK',
        'async arrow callbacks are not supported in the current compiler slice; use an async function declaration',
        expression.loc
      )
      return
    }

    expression.valueType = 'function'

    if (functionType !== null && typeof functionType !== 'undefined' && functionType.resolved !== true) {
      functionType =
        this.resolveFunctionTypeMetadata(functionType as FunctionTypeMetadata, expression.loc) ?? functionType
    }

    if (functionType !== null && typeof functionType !== 'undefined') {
      expression.functionType = functionType
    }

    let actualReturnType: ValueType = 'unknown'

    if (
      functionType !== null &&
      typeof functionType !== 'undefined' &&
      functionType.returnType !== null &&
      typeof functionType.returnType !== 'undefined'
    ) {
      actualReturnType = functionType.returnType
    }

    const scopeState = this.pushScope()

    try {
      if (
        functionType !== null &&
        typeof functionType !== 'undefined' &&
        expression.params.length > functionType.params.length
      ) {
        this.report(
          'INOX_ARG_COUNT',
          `function callback expects at most ${functionType.params.length} parameter(s), got ${expression.params.length}`,
          expression.loc
        )
      }

      for (let index = 0; index < expression.params.length; index++) {
        const param = expression.params[index]
        const paramValueType = nodeValueTypeOrUnknown(param)
        let expected: AnyNode | null = null

        if (functionType !== null && typeof functionType !== 'undefined' && index < functionType.params.length) {
          expected = functionType.params[index]
        }

        let paramInfo = this.resolveDeclaredType(paramValueType, param.loc)

        if (paramValueType === 'unknown' && expected !== null && typeof expected !== 'undefined') {
          let arrayElementType: ValueType | null = null
          let arrayElementDeclaredType: string | null = null
          let expectedValueType = nodeValueTypeOrUnknown(expected)
          let mapKeyType: ValueType | null = null
          let mapValueType: ValueType | null = null
          let mapValueShape: ObjectShapeInfo | null = null
          let promiseValueType: ValueType | null = null
          let setElementType: ValueType | null = null
          let expectedFunctionType: FunctionTypeMetadata | null = null
          let shape: ObjectShapeInfo | null = null

          if (!isBuiltinValueType(expectedValueType)) {
            expectedValueType = 'object'
          }

          if (expected.arrayElementType !== null && typeof expected.arrayElementType !== 'undefined') {
            arrayElementType = expected.arrayElementType
          }

          if (expected.arrayElementDeclaredType !== null && typeof expected.arrayElementDeclaredType !== 'undefined') {
            arrayElementDeclaredType = expected.arrayElementDeclaredType
          }

          if (expected.mapKeyType !== null && typeof expected.mapKeyType !== 'undefined') {
            mapKeyType = expected.mapKeyType
          }

          if (expected.mapValueType !== null && typeof expected.mapValueType !== 'undefined') {
            mapValueType = expected.mapValueType
          }

          if (expected.mapValueShape !== null && typeof expected.mapValueShape !== 'undefined') {
            mapValueShape = expected.mapValueShape
          }

          if (expected.promiseValueType !== null && typeof expected.promiseValueType !== 'undefined') {
            promiseValueType = expected.promiseValueType
          }

          if (expected.setElementType !== null && typeof expected.setElementType !== 'undefined') {
            setElementType = expected.setElementType
          }

          if (expected.functionType !== null && typeof expected.functionType !== 'undefined') {
            expectedFunctionType = expected.functionType
          }

          if (expected.shape !== null && typeof expected.shape !== 'undefined') {
            shape = expected.shape
          }

          paramInfo = {
            valueType: expectedValueType,
            nullable: expected.nullable === true,
            arrayElementType,
            arrayElementDeclaredType,
            mapKeyType,
            mapValueType,
            mapValueShape,
            promiseValueType,
            setElementType,
            functionType: expectedFunctionType,
            shape
          }
        }

        if (
          expected !== null &&
          typeof expected !== 'undefined' &&
          paramValueType !== 'unknown'
        ) {
          const expectedValueType = nodeValueTypeOrUnknown(expected)

          if (isBuiltinValueType(expectedValueType)) {
            this.checkAssignableType(
              expectedValueType,
              paramInfo.valueType,
              param.loc,
              expected.nullable === true,
              false
            )
          }
        }

        param.declaredType = paramValueType

        if (paramValueType === 'unknown') {
          param.declaredType = paramInfo.valueType

          if (
            expected !== null &&
            typeof expected !== 'undefined' &&
            expected.declaredType !== null &&
            typeof expected.declaredType !== 'undefined'
          ) {
            param.declaredType = expected.declaredType
          }
        }

        param.valueType = paramInfo.valueType
        param.nullable = paramInfo.nullable
        param.arrayElementType = paramInfo.arrayElementType
        param.arrayElementDeclaredType = paramInfo.arrayElementDeclaredType
        param.mapKeyType = paramInfo.mapKeyType
        param.mapValueType = paramInfo.mapValueType
        param.mapValueShape = paramInfo.mapValueShape
        param.promiseValueType = null

        if (paramInfo.promiseValueType !== null && typeof paramInfo.promiseValueType !== 'undefined') {
          param.promiseValueType = paramInfo.promiseValueType
        }

        param.setElementType = paramInfo.setElementType
        param.functionType = paramInfo.functionType
        param.shape = paramInfo.shape

        this.declare(
          param.name,
          {
            kind: 'param',
            mutable: true,
            valueType: paramInfo.valueType,
            nullable: paramInfo.nullable,
            arrayElementType: paramInfo.arrayElementType,
            arrayElementDeclaredType: paramInfo.arrayElementDeclaredType,
            mapKeyType: paramInfo.mapKeyType,
            mapValueType: paramInfo.mapValueType,
            mapValueShape: paramInfo.mapValueShape,
            promiseValueType: paramInfo.promiseValueType ?? null,
            setElementType: paramInfo.setElementType,
            functionType: paramInfo.functionType,
            shape: paramInfo.shape,
            loc: param.loc
          },
          param.loc
        )
      }

      if (expression.expressionBody) {
        const previousFunctionDepth = this.functionDepth
        this.functionDepth = this.functionDepth + 1

        try {
          actualReturnType = this.checkExpression(expression.body)

          if (
            functionType !== null &&
            typeof functionType !== 'undefined' &&
            functionType.returnType !== null &&
            typeof functionType.returnType !== 'undefined' &&
            isBuiltinValueType(functionType.returnType)
          ) {
            const expectedReturnType: ValueType = functionType.returnType

            this.checkAssignableType(
              actualReturnType,
              expectedReturnType,
              expression.body.loc,
              functionType.returnNullable === true,
              this.expressionCanBeNull(expression.body)
            )

            if (
              expectedReturnType === 'promise' &&
              functionType.returnPromiseValueType !== null &&
              typeof functionType.returnPromiseValueType !== 'undefined'
            ) {
              this.checkAssignableType(
                this.resolveExpressionPromiseValueType(expression.body),
                functionType.returnPromiseValueType,
                expression.body.loc,
                false,
                false
              )
            }
          }
        } finally {
          this.functionDepth = previousFunctionDepth
        }
      } else {
        if (functionType === null || typeof functionType === 'undefined') {
          const previousFunctionDepth = this.functionDepth
          this.functionDepth = this.functionDepth + 1

          try {
            this.checkStatements(expression.body)
          } finally {
            this.functionDepth = previousFunctionDepth
          }

          actualReturnType = 'void'
        } else {
          const previousReturnType = this.currentReturnType
          const previousReturnNullable = this.currentReturnNullable
          const previousReturnPromiseValueType = this.currentReturnPromiseValueType
          const previousReturnAsync = this.currentReturnAsync
          const previousFunctionDepth = this.functionDepth

          try {
            let expectedReturnType: ValueType = 'unknown'

            if (functionType.returnType !== null && typeof functionType.returnType !== 'undefined') {
              expectedReturnType = functionType.returnType
            }

            this.currentReturnType = expectedReturnType
            this.currentReturnNullable = functionType.returnNullable === true
            this.currentReturnPromiseValueType = null

            if (
              functionType.returnPromiseValueType !== null &&
              typeof functionType.returnPromiseValueType !== 'undefined'
            ) {
              this.currentReturnPromiseValueType = functionType.returnPromiseValueType
            }

            this.currentReturnAsync = false
            this.functionDepth = this.functionDepth + 1
            this.checkStatements(expression.body)
          } finally {
            this.currentReturnType = previousReturnType
            this.currentReturnNullable = previousReturnNullable
            this.currentReturnPromiseValueType = previousReturnPromiseValueType
            this.currentReturnAsync = previousReturnAsync
            this.functionDepth = previousFunctionDepth
          }
        }
      }
    } finally {
      this.restoreScope(scopeState)
    }

    expression.returnType = actualReturnType

    if (
      functionType !== null &&
      typeof functionType !== 'undefined' &&
      functionType.returnType !== null &&
      typeof functionType.returnType !== 'undefined'
    ) {
      expression.returnType = functionType.returnType
    }

    expression.declaredReturnType = expression.returnType

    if (
      functionType !== null &&
      typeof functionType !== 'undefined' &&
      functionType.declaredReturnType !== null &&
      typeof functionType.declaredReturnType !== 'undefined'
    ) {
      expression.declaredReturnType = functionType.declaredReturnType
    }

    expression.returnNullable = false

    if (functionType !== null && typeof functionType !== 'undefined' && functionType.returnNullable === true) {
      expression.returnNullable = true
    } else if (
      expression.expressionBody &&
      expression.body !== null &&
      typeof expression.body !== 'undefined' &&
      expression.body.nullable === true
    ) {
      expression.returnNullable = true
    }

    expression.returnArrayElementType = null

    if (
      functionType !== null &&
      typeof functionType !== 'undefined' &&
      functionType.returnArrayElementType !== null &&
      typeof functionType.returnArrayElementType !== 'undefined'
    ) {
      expression.returnArrayElementType = functionType.returnArrayElementType
    } else if (
      expression.body !== null &&
      typeof expression.body !== 'undefined' &&
      expression.body.arrayElementType !== null &&
      typeof expression.body.arrayElementType !== 'undefined'
    ) {
      expression.returnArrayElementType = expression.body.arrayElementType
    }

    expression.returnMapKeyType = null

    if (
      functionType !== null &&
      typeof functionType !== 'undefined' &&
      functionType.returnMapKeyType !== null &&
      typeof functionType.returnMapKeyType !== 'undefined'
    ) {
      expression.returnMapKeyType = functionType.returnMapKeyType
    } else if (
      expression.body !== null &&
      typeof expression.body !== 'undefined' &&
      expression.body.mapKeyType !== null &&
      typeof expression.body.mapKeyType !== 'undefined'
    ) {
      expression.returnMapKeyType = expression.body.mapKeyType
    }

    expression.returnMapValueType = null

    if (
      functionType !== null &&
      typeof functionType !== 'undefined' &&
      functionType.returnMapValueType !== null &&
      typeof functionType.returnMapValueType !== 'undefined'
    ) {
      expression.returnMapValueType = functionType.returnMapValueType
    } else if (
      expression.body !== null &&
      typeof expression.body !== 'undefined' &&
      expression.body.mapValueType !== null &&
      typeof expression.body.mapValueType !== 'undefined'
    ) {
      expression.returnMapValueType = expression.body.mapValueType
    }

    expression.returnPromiseValueType = null

    if (
      functionType !== null &&
      typeof functionType !== 'undefined' &&
      functionType.returnPromiseValueType !== null &&
      typeof functionType.returnPromiseValueType !== 'undefined'
    ) {
      expression.returnPromiseValueType = functionType.returnPromiseValueType
    } else if (
      expression.body !== null &&
      typeof expression.body !== 'undefined' &&
      expression.body.promiseValueType !== null &&
      typeof expression.body.promiseValueType !== 'undefined'
    ) {
      expression.returnPromiseValueType = expression.body.promiseValueType
    }

    expression.returnSetElementType = null

    if (
      functionType !== null &&
      typeof functionType !== 'undefined' &&
      functionType.returnSetElementType !== null &&
      typeof functionType.returnSetElementType !== 'undefined'
    ) {
      expression.returnSetElementType = functionType.returnSetElementType
    } else if (
      expression.body !== null &&
      typeof expression.body !== 'undefined' &&
      expression.body.setElementType !== null &&
      typeof expression.body.setElementType !== 'undefined'
    ) {
      expression.returnSetElementType = expression.body.setElementType
    }

    if (expression.functionType === null || typeof expression.functionType === 'undefined') {
      expression.functionType = this.inferArrowFunctionTypeMetadata(expression)
    }
  }

  inferArrowFunctionTypeMetadata(expression: AnyNode): FunctionTypeMetadata {
    let returnShape: ObjectShapeInfo | null = null

    if (
      expression.body !== null &&
      typeof expression.body !== 'undefined' &&
      expression.body.shape !== null &&
      typeof expression.body.shape !== 'undefined'
    ) {
      returnShape = expression.body.shape
    }

    return {
      kind: 'function',
      resolved: true,
      params: this.resolveParams(expression.params),
      returnType: expression.returnType,
      declaredReturnType: expression.declaredReturnType,
      returnNullable: expression.returnNullable === true,
      returnArrayElementType: expression.returnArrayElementType ?? null,
      returnArrayElementDeclaredType: expression.returnArrayElementDeclaredType ?? null,
      returnMapKeyType: expression.returnMapKeyType ?? null,
      returnMapValueType: expression.returnMapValueType ?? null,
      returnPromiseValueType: expression.returnPromiseValueType ?? null,
      returnSetElementType: expression.returnSetElementType ?? null,
      returnShape
    }
  }

  checkClassDeclaration(statement: AnyNode): void {
    const fieldNames = new Set()
    const methodNames = new Set()

    if (statement.extendsName !== null && typeof statement.extendsName !== 'undefined') {
      let extendsLoc = statement.loc

      if (statement.extendsLoc !== null && typeof statement.extendsLoc !== 'undefined') {
        extendsLoc = statement.extendsLoc
      }

      this.report('INOX_CLASS_EXTENDS', 'class inheritance is not supported', extendsLoc)
    }

    let fields: AnyNode[] = []

    if (statement.fields !== null && typeof statement.fields !== 'undefined') {
      fields = statement.fields
    }

    for (const field of fields) {
      if (field.static) {
        let fieldStaticLoc = field.loc

        if (field.staticLoc !== null && typeof field.staticLoc !== 'undefined') {
          fieldStaticLoc = field.staticLoc
        }

        this.report('INOX_CLASS_STATIC', 'static class fields are not supported', fieldStaticLoc)
      }

      if (fieldNames.has(field.name)) {
        this.report('INOX_REDECLARED_NAME', `field ${field.name} is already declared in this class`, field.loc)
      }

      fieldNames.add(field.name)
    }

    for (const method of statement.methods) {
      if (method.static) {
        let methodStaticLoc = method.loc

        if (method.staticLoc !== null && typeof method.staticLoc !== 'undefined') {
          methodStaticLoc = method.staticLoc
        }

        this.report('INOX_CLASS_STATIC', 'static class methods are not supported', methodStaticLoc)
      }

      if (methodNames.has(method.name)) {
        this.report('INOX_REDECLARED_NAME', `method ${method.name} is already declared in this class`, method.loc)
      }

      if (fieldNames.has(method.name)) {
        this.report('INOX_REDECLARED_NAME', `method ${method.name} conflicts with a class field`, method.loc)
      }

      methodNames.add(method.name)
      const scopeState = this.pushScope()

      try {
        const previousReturnType = this.currentReturnType
        const methodReturnInfo = this.resolveDeclaredType(method.returnType, method.loc)
        this.currentReturnType = methodReturnInfo.valueType
        const previousReturnNullable = this.currentReturnNullable
        this.currentReturnNullable = methodReturnInfo.nullable
        const previousReturnPromiseValueType = this.currentReturnPromiseValueType
        this.currentReturnPromiseValueType = null

        if (methodReturnInfo.promiseValueType !== null && typeof methodReturnInfo.promiseValueType !== 'undefined') {
          this.currentReturnPromiseValueType = methodReturnInfo.promiseValueType
        }

        const previousReturnAsync = this.currentReturnAsync
        this.currentReturnAsync = false
        const previousClassConstructor = this.currentClassConstructor
        this.currentClassConstructor = nodeNameEquals(method, 'constructor')
        const previousFunctionDepth = this.functionDepth
        this.functionDepth = this.functionDepth + 1
        let thisShape: ObjectShapeInfo | null = null

        if (statement.shape !== null && typeof statement.shape !== 'undefined') {
          thisShape = statement.shape
        }

        this.declare(
          'this',
          {
            kind: 'this',
            mutable: false,
            valueType: 'object',
            className: statement.name,
            shape: thisShape,
            loc: method.loc
          },
          method.loc
        )

        for (let index = 0; index < method.params.length; index = index + 1) {
          const param = checkerNodeAt(method.params, index)
          const declaredType = nodeDeclaredTypeOrValueType(param)
          const paramInfo = this.resolveDeclaredType(declaredType, param.loc)
          param.declaredType = declaredType
          param.valueType = paramInfo.valueType
          param.nullable = paramInfo.nullable
          param.arrayElementType = paramInfo.arrayElementType
          param.arrayElementDeclaredType = paramInfo.arrayElementDeclaredType
          param.mapKeyType = paramInfo.mapKeyType
          param.mapValueType = paramInfo.mapValueType
          param.mapValueShape = paramInfo.mapValueShape
          param.promiseValueType = paramInfo.promiseValueType ?? null
          param.setElementType = paramInfo.setElementType
          param.functionType = paramInfo.functionType
          param.shape = paramInfo.shape
          param.className = this.declaredClassName(declaredType)

          this.declare(
            param.name,
            {
              kind: 'param',
              mutable: true,
              className: param.className,
              valueType: paramInfo.valueType,
              nullable: paramInfo.nullable,
              arrayElementType: paramInfo.arrayElementType,
              arrayElementDeclaredType: paramInfo.arrayElementDeclaredType,
              mapKeyType: paramInfo.mapKeyType,
              mapValueType: paramInfo.mapValueType,
              mapValueShape: paramInfo.mapValueShape,
              promiseValueType: paramInfo.promiseValueType,
              setElementType: paramInfo.setElementType,
              functionType: paramInfo.functionType,
              shape: paramInfo.shape,
              loc: param.loc
            },
            param.loc
          )
        }

        try {
          this.checkStatements(method.body)
        } finally {
          this.currentReturnType = previousReturnType
          this.currentReturnNullable = previousReturnNullable
          this.currentReturnPromiseValueType = previousReturnPromiseValueType
          this.currentReturnAsync = previousReturnAsync
          this.currentClassConstructor = previousClassConstructor
          this.functionDepth = previousFunctionDepth
        }
      } finally {
        this.restoreScope(scopeState)
      }
    }
  }

  checkObjectLiteralAgainstShape(expression: AnyNode, shape: ObjectShapeInfo): void {
    expression.shape = shape

    const properties = new Map()

    for (const property of expression.properties) {
      properties.set(property.key, property)
    }

    for (const field of shape.fields) {
      const property = properties.get(field.name)

      if (property === null || typeof property === 'undefined') {
        if (field.optional !== true) {
          this.report('INOX_MISSING_FIELD', `missing field ${field.name}`, expression.loc)
        }
        continue
      }

      const fieldType = this.resolveFieldDeclaredType(field)
      const fieldShape = fieldType.shape
      const propertyFunctionType = resolvedFunctionTypeMetadata(field.functionType, fieldType.functionType)
      let propertyType: ValueType = 'unknown'

      if (
        fieldType.valueType === 'function' &&
        propertyFunctionType !== null &&
        typeof propertyFunctionType !== 'undefined' &&
        property.value.type === 'ArrowFunctionExpression'
      ) {
        this.checkArrowFunctionExpression(property.value, propertyFunctionType)
        propertyType = 'function'
      } else if (
        fieldType.valueType === 'object' &&
        fieldShape !== null &&
        typeof fieldShape !== 'undefined' &&
        property.value.type === 'ObjectLiteral'
      ) {
        this.checkObjectLiteralAgainstShape(property.value, fieldShape)
        propertyType = 'object'
      } else {
        propertyType = this.checkExpression(property.value)
      }

      this.checkAssignableType(
        propertyType,
        fieldType.valueType,
        property.loc,
        field.nullable === true,
        this.expressionCanBeNull(property.value)
      )

      if (
        fieldType.valueType === 'array' &&
        fieldType.arrayElementType !== null &&
        typeof fieldType.arrayElementType !== 'undefined'
      ) {
        this.checkAssignableType(
          this.resolveExpressionArrayElementType(property.value),
          fieldType.arrayElementType,
          property.loc,
          false,
          false
        )
      }

      if (fieldType.valueType === 'map') {
        const actual = this.resolveExpressionMapType(property.value)
        let actualKey: ValueType | null = null
        let actualValue: ValueType | null = null

        if (actual !== null && typeof actual !== 'undefined') {
          actualKey = actual.key
          actualValue = actual.value
        }

        if (fieldType.mapKeyType !== null && typeof fieldType.mapKeyType !== 'undefined') {
          this.checkAssignableType(actualKey, fieldType.mapKeyType, property.loc, false, false)
        }

        if (fieldType.mapValueType !== null && typeof fieldType.mapValueType !== 'undefined') {
          this.checkAssignableType(actualValue, fieldType.mapValueType, property.loc, false, false)
        }
      }

      if (
        fieldType.valueType === 'set' &&
        fieldType.setElementType !== null &&
        typeof fieldType.setElementType !== 'undefined'
      ) {
        this.checkAssignableType(
          this.resolveExpressionSetElementType(property.value),
          fieldType.setElementType,
          property.loc,
          false,
          false
        )
      }

      if (
        fieldType.valueType === 'promise' &&
        fieldType.promiseValueType !== null &&
        typeof fieldType.promiseValueType !== 'undefined'
      ) {
        this.checkAssignableType(
          this.resolveExpressionPromiseValueType(property.value),
          fieldType.promiseValueType,
          property.loc,
          false,
          false
        )
      }
    }

    for (const property of expression.properties) {
      if (shape.dynamic !== true && !this.findShapeField(shape, property.key)) {
        this.report('INOX_UNKNOWN_FIELD', `unknown field ${property.key}`, property.loc)
      }
    }
  }

  resolveExpressionShape(expression: AnyNode): ObjectShapeInfo | null {
    if (expression.type === 'ThisExpression') {
      const thisSymbol = this.scope.resolve('this')

      if (
        thisSymbol !== null &&
        typeof thisSymbol !== 'undefined' &&
        thisSymbol.shape !== null &&
        typeof thisSymbol.shape !== 'undefined'
      ) {
        return thisSymbol.shape
      }

      if (expression.shape !== null && typeof expression.shape !== 'undefined') {
        return expression.shape
      }

      return null
    }

    if (expression.type !== 'Reference' || expression.path.length !== 1) {
      if (expression.shape !== null && typeof expression.shape !== 'undefined') {
        return expression.shape
      }

      return null
    }

    const name = firstPathSegment(expression.path)
    const symbol = this.scope.resolve(name)

    if (
      symbol !== null &&
      typeof symbol !== 'undefined' &&
      symbol.shape !== null &&
      typeof symbol.shape !== 'undefined'
    ) {
      return symbol.shape
    }

    if (symbol !== null && typeof symbol !== 'undefined' && symbol.valueType === 'object') {
      const elementShape = this.resolveArrayElementObjectShape(
        symbol.valueType,
        symbol.arrayElementDeclaredType,
        expression.loc
      )

      if (elementShape !== null && typeof elementShape !== 'undefined') {
        return elementShape
      }
    }

    if (expression.shape !== null && typeof expression.shape !== 'undefined') {
      return expression.shape
    }

    return null
  }

  resolveArrayIterableElementShape(expression: AnyNode): ObjectShapeInfo | null {
    if (expression.shape !== null && typeof expression.shape !== 'undefined') {
      return expression.shape
    }

    const elementType = this.resolveExpressionArrayElementType(expression)
    const elementDeclaredType = this.resolveExpressionArrayElementDeclaredType(expression)

    if (elementType === 'object' && elementDeclaredType !== null && typeof elementDeclaredType !== 'undefined') {
      const elementShape = this.resolveArrayElementObjectShape(elementType, elementDeclaredType, expression.loc)

      if (elementShape !== null && typeof elementShape !== 'undefined') {
        return elementShape
      }
    }

    if (expression.type === 'MemberExpression') {
      const shape = this.resolveExpressionShape(expression.object)

      if (shape === null || typeof shape === 'undefined') {
        return null
      }

      const field = this.findShapeField(shape, expression.property)

      if (
        field !== null &&
        typeof field !== 'undefined' &&
        field.shape !== null &&
        typeof field.shape !== 'undefined'
      ) {
        return field.shape
      }

      return null
    }

    if (expression.type === 'IndexExpression' && expression.index.type === 'StringLiteral') {
      const shape = this.resolveExpressionShape(expression.object)

      if (shape === null || typeof shape === 'undefined') {
        return null
      }

      const field = this.findShapeField(shape, expression.index.value)

      if (
        field !== null &&
        typeof field !== 'undefined' &&
        field.shape !== null &&
        typeof field.shape !== 'undefined'
      ) {
        return field.shape
      }
    }

    return null
  }

  resolveArrayElementObjectShape(
    valueType: ValueType,
    declaredType: string | null | undefined,
    loc: SourceLocation
  ): ObjectShapeInfo | null {
    if (valueType !== 'object' || declaredType === null || typeof declaredType === 'undefined') {
      return null
    }

    if (declaredType === 'fs.Dirent') {
      return fsDirentObjectShape
    }

    return this.resolveDeclaredType(declaredType, loc).shape
  }

  isThisExpression(expression: AnyNode): boolean {
    return (
      expression.type === 'ThisExpression' ||
      (expression.type === 'Reference' && expression.path.length === 1 && firstPathSegment(expression.path) === 'this')
    )
  }

  canInitializeReadonlyClassField(expression: AnyNode): boolean {
    return this.currentClassConstructor && this.isThisExpression(expression)
  }

  findShapeField(shape: ObjectShapeInfo, name: string): AnyNode | null {
    for (const field of shape.fields) {
      if (nodeNameEquals(field, name)) {
        return field
      }
    }

    if (shape.dynamic === true) {
      return this.dynamicShapeField(shape, name)
    }

    return null
  }

  dynamicShapeField(shape: ObjectShapeInfo, name: string) {
    if (shape.dynamicField !== null && typeof shape.dynamicField !== 'undefined') {
      const field = shape.dynamicField

      return {
        name,
        optional: field.optional,
        readonly: field.readonly,
        ownership: field.ownership,
        weakLoc: field.weakLoc,
        static: field.static,
        staticLoc: field.staticLoc,
        weakTypeValidated: field.weakTypeValidated,
        loc: field.loc,
        declaredType: field.declaredType,
        valueType: field.valueType,
        nullable: field.nullable,
        arrayElementType: field.arrayElementType,
        arrayElementDeclaredType: field.arrayElementDeclaredType,
        mapKeyType: field.mapKeyType,
        mapValueType: field.mapValueType,
        promiseValueType: field.promiseValueType,
        setElementType: field.setElementType,
        functionType: field.functionType,
        shape: field.shape,
        className: field.className
      }
    }

    return {
      name,
      optional: true,
      readonly: false,
      ownership: 'strong',
      valueType: 'unknown'
    }
  }

  getCallableSymbol(callee: AnyNode): SymbolInfo | null {
    const calleeFunctionType = callee.functionType

    if (calleeFunctionType !== null && typeof calleeFunctionType !== 'undefined') {
      return this.callableSymbolFromFunctionType(calleeFunctionType, callee.loc)
    }

    if (callee.type !== 'Reference' || callee.path.length !== 1) {
      return null
    }

    const calleeName = firstPathSegment(callee.path)
    let symbol = this.scope.resolve(calleeName)

    if (symbol === null || typeof symbol === 'undefined') {
      const globalSymbol = builtinGlobalSymbol(calleeName)

      if (globalSymbol !== null && typeof globalSymbol !== 'undefined') {
        symbol = globalSymbol
      }
    }

    if (symbol !== null && typeof symbol !== 'undefined' && symbol.kind === 'function') {
      return symbol
    }

    if (
      symbol !== null &&
      typeof symbol !== 'undefined' &&
      symbol.valueType === 'function' &&
      symbol.params !== null &&
      typeof symbol.params !== 'undefined' &&
      symbol.returnType !== null &&
      typeof symbol.returnType !== 'undefined'
    ) {
      return symbol
    }

    if (
      symbol !== null &&
      typeof symbol !== 'undefined' &&
      symbol.valueType === 'function' &&
      symbol.functionType !== null &&
      typeof symbol.functionType !== 'undefined'
    ) {
      return this.callableSymbolFromFunctionType(symbol.functionType, symbol.loc)
    }

    return null
  }

  callableSymbolFromFunctionType(
    functionType: FunctionTypeMetadata,
    loc: SourceLocation | null | undefined
  ): SymbolInfo {
    const resolvedFunctionType = this.resolvedCallableFunctionType(functionType, loc)

    const symbol: SymbolInfo = {
      kind: 'function',
      valueType: 'function',
      params: resolvedFunctionType.params,
      returnType: resolvedFunctionType.returnType,
      returnNullable: resolvedFunctionType.returnNullable,
      returnArrayElementType: resolvedFunctionType.returnArrayElementType,
      returnArrayElementDeclaredType: resolvedFunctionType.returnArrayElementDeclaredType,
      returnMapKeyType: resolvedFunctionType.returnMapKeyType,
      returnMapValueType: resolvedFunctionType.returnMapValueType,
      returnPromiseValueType: resolvedFunctionType.returnPromiseValueType,
      returnSetElementType: resolvedFunctionType.returnSetElementType,
      returnShape: resolvedFunctionType.returnShape
    }

    if (loc !== null && typeof loc !== 'undefined') {
      symbol.loc = loc
    }

    return symbol
  }

  resolvedCallableFunctionType(
    functionType: FunctionTypeMetadata,
    loc: SourceLocation | null | undefined
  ): FunctionTypeMetadata {
    if (functionType.resolved === true) {
      return functionType
    }

    return this.resolveFunctionTypeMetadata(functionType, loc) ?? functionType
  }

  checkObjectLiteral(expression: AnyNode): void {
    const keys = new Set()

    for (const property of expression.properties) {
      if (keys.has(property.key)) {
        this.report('INOX_DUPLICATE_OBJECT_KEY', `duplicate object property ${property.key}`, property.loc)
      }

      keys.add(property.key)
      this.checkExpression(property.value)
    }
  }

  checkForStatement(statement: AnyNode): void {
    const scopeState = this.pushScope()

    try {
      if (
        statement.init !== null &&
        typeof statement.init !== 'undefined' &&
        statement.init.type === 'VariableDeclaration'
      ) {
        this.checkStatement(statement.init)
      } else if (statement.init !== null && typeof statement.init !== 'undefined') {
        this.checkExpression(statement.init)
      }

      if (statement.test !== null && typeof statement.test !== 'undefined') {
        this.checkBooleanCondition(statement.test)
      }

      if (statement.update !== null && typeof statement.update !== 'undefined') {
        this.checkExpression(statement.update)
      }

      const loopState = this.pushLoop()

      try {
        const narrowing = this.resolveNullableConditionNarrowing(statement.test)
        const narrowingState = this.pushNarrowedNullableNames(narrowing.trueNames)

        try {
          this.checkScopedBody(statement.body)
        } finally {
          this.restoreNarrowedNullableNames(narrowingState)
        }
      } finally {
        this.restoreLoopDepth(loopState)
      }
    } finally {
      this.restoreScope(scopeState)
    }
  }

  checkForOfStatement(statement: AnyNode): void {
    const iterableType = this.checkExpression(statement.iterable)
    let mapEntryShape: ObjectShapeInfo | null = null

    if (iterableType === 'map') {
      mapEntryShape = this.createMapEntryShape(this.resolveExpressionMapType(statement.iterable), statement.nameLoc)
    }

    let elementType: ValueType = 'unknown'

    if (iterableType === 'array') {
      const arrayElementType = this.resolveExpressionArrayElementType(statement.iterable)

      if (arrayElementType !== null && typeof arrayElementType !== 'undefined') {
        elementType = arrayElementType
      }
    } else if (iterableType === 'set') {
      const setElementType = this.resolveExpressionSetElementType(statement.iterable)

      if (setElementType !== null && typeof setElementType !== 'undefined') {
        elementType = setElementType
      }
    } else if (iterableType === 'map') {
      elementType = 'object'
    }

    let elementDeclaredType: string = 'unknown'

    if (iterableType === 'array') {
      const arrayElementDeclaredType = this.resolveExpressionArrayElementDeclaredType(statement.iterable)
      elementDeclaredType = elementType

      if (arrayElementDeclaredType !== null && typeof arrayElementDeclaredType !== 'undefined') {
        elementDeclaredType = arrayElementDeclaredType
      }
    } else if (iterableType === 'set') {
      elementDeclaredType = elementType
    } else if (iterableType === 'map') {
      elementDeclaredType = 'object'
    }

    let declared: ResolvedTypeInfo | null = null

    if (statement.declaredType !== null && typeof statement.declaredType !== 'undefined') {
      declared = this.resolveDeclaredType(statement.declaredType, statement.nameLoc)
    }

    let valueType = elementType

    if (declared !== null && typeof declared !== 'undefined') {
      valueType = declared.valueType
    }

    let inferredDeclaredType: string | null = elementDeclaredType

    if (declared !== null && typeof declared !== 'undefined') {
      inferredDeclaredType = statement.declaredType
    }

    let shape = mapEntryShape

    if (iterableType === 'array' && elementType === 'object') {
      const iterableShape = this.resolveArrayIterableElementShape(statement.iterable)

      if (iterableShape !== null && typeof iterableShape !== 'undefined') {
        shape = iterableShape
      }
    }

    if (
      declared !== null &&
      typeof declared !== 'undefined' &&
      declared.shape !== null &&
      typeof declared.shape !== 'undefined'
    ) {
      shape = declared.shape
    }

    statement.valueType = valueType
    statement.nullable = false

    if (declared !== null && typeof declared !== 'undefined' && declared.nullable === true) {
      statement.nullable = true
    }

    statement.inferredDeclaredType = inferredDeclaredType
    statement.arrayElementType = null
    statement.arrayElementDeclaredType = null
    statement.mapKeyType = null
    statement.mapValueType = null
    statement.setElementType = null
    statement.functionType = null

    if (declared !== null && typeof declared !== 'undefined') {
      if (declared.arrayElementType !== null && typeof declared.arrayElementType !== 'undefined') {
        statement.arrayElementType = declared.arrayElementType
      }

      if (declared.arrayElementDeclaredType !== null && typeof declared.arrayElementDeclaredType !== 'undefined') {
        statement.arrayElementDeclaredType = declared.arrayElementDeclaredType
      }

      if (declared.mapKeyType !== null && typeof declared.mapKeyType !== 'undefined') {
        statement.mapKeyType = declared.mapKeyType
      }

      if (declared.mapValueType !== null && typeof declared.mapValueType !== 'undefined') {
        statement.mapValueType = declared.mapValueType
      }

      if (declared.setElementType !== null && typeof declared.setElementType !== 'undefined') {
        statement.setElementType = declared.setElementType
      }

      if (declared.functionType !== null && typeof declared.functionType !== 'undefined') {
        statement.functionType = declared.functionType
      }
    }

    statement.shape = shape

    if (declared !== null && typeof declared !== 'undefined') {
      this.checkAssignableType(elementType, declared.valueType, statement.nameLoc, declared.nullable, false)
    }

    const scopeState = this.pushScope()
    let declaredNullable = false
    let declaredArrayElementType: ValueType | null = null
    let declaredArrayElementDeclaredType: string | null = null
    let declaredMapKeyType: ValueType | null = null
    let declaredMapValueType: ValueType | null = null
    let declaredSetElementType: ValueType | null = null
    let declaredFunctionType: AnyNode | null = null

    if (declared !== null && typeof declared !== 'undefined') {
      declaredNullable = declared.nullable === true

      if (declared.arrayElementType !== null && typeof declared.arrayElementType !== 'undefined') {
        declaredArrayElementType = declared.arrayElementType
      }

      if (declared.arrayElementDeclaredType !== null && typeof declared.arrayElementDeclaredType !== 'undefined') {
        declaredArrayElementDeclaredType = declared.arrayElementDeclaredType
      }

      if (declared.mapKeyType !== null && typeof declared.mapKeyType !== 'undefined') {
        declaredMapKeyType = declared.mapKeyType
      }

      if (declared.mapValueType !== null && typeof declared.mapValueType !== 'undefined') {
        declaredMapValueType = declared.mapValueType
      }

      if (declared.setElementType !== null && typeof declared.setElementType !== 'undefined') {
        declaredSetElementType = declared.setElementType
      }

      if (declared.functionType !== null && typeof declared.functionType !== 'undefined') {
        declaredFunctionType = declared.functionType
      }
    }

    this.declare(
      statement.name,
      {
        kind: statement.kind,
        mutable: statement.kind === 'let',
        valueType,
        nullable: declaredNullable,
        arrayElementType: declaredArrayElementType,
        arrayElementDeclaredType: declaredArrayElementDeclaredType,
        mapKeyType: declaredMapKeyType,
        mapValueType: declaredMapValueType,
        setElementType: declaredSetElementType,
        functionType: declaredFunctionType,
        shape,
        loc: statement.nameLoc
      },
      statement.nameLoc
    )

    try {
      const loopState = this.pushLoop()

      try {
        this.checkScopedBody(statement.body)
      } finally {
        this.restoreLoopDepth(loopState)
      }
    } finally {
      this.restoreScope(scopeState)
    }
  }

  createMapEntryShape(mapType: CheckerMapType | null, loc: SourceLocation): ObjectShapeInfo {
    let keyType: ValueType = 'unknown'
    let valueType: ValueType = 'unknown'

    if (mapType !== null && typeof mapType !== 'undefined') {
      const key = mapType.key
      const value = mapType.value

      if (key !== null && typeof key !== 'undefined') {
        keyType = key
      }

      if (value !== null && typeof value !== 'undefined') {
        valueType = value
      }
    }

    return {
      kind: 'object',
      fields: [
        {
          name: 'key',
          readonly: true,
          declaredType: keyType,
          valueType: keyType,
          loc
        },
        {
          name: 'value',
          readonly: true,
          declaredType: valueType,
          valueType,
          loc
        }
      ]
    }
  }

  checkSwitchStatement(statement: AnyNode): void {
    const discriminantType = this.checkExpression(statement.discriminant)
    let hasDefault = false

    if (!isSwitchableType(discriminantType)) {
      this.report(
        'INOX_SWITCH_TYPE',
        `switch discriminant must be number, string or boolean, got ${discriminantType}`,
        statement.discriminant.loc
      )
    }

    const breakableState = this.pushBreakable()

    try {
      for (const item of statement.cases) {
        if (item.test === null || typeof item.test === 'undefined') {
          if (hasDefault) {
            this.report('INOX_DUPLICATE_DEFAULT', 'switch can only have one default branch', item.loc)
          }

          hasDefault = true
        } else {
          const caseType = this.checkExpression(item.test)

          if (!isMatchingSwitchCaseType(caseType, discriminantType)) {
            this.report(
              'INOX_SWITCH_TYPE',
              `switch case type ${caseType} does not match discriminant type ${discriminantType}`,
              item.test.loc
            )
          }
        }

        const scopeState = this.pushScope()

        try {
          this.checkStatements(item.consequent)
        } finally {
          this.restoreScope(scopeState)
        }
      }
    } finally {
      this.restoreLoopDepth(breakableState)
    }
  }

  checkBooleanCondition(expression: AnyNode): void {
    const conditionType = this.checkExpression(expression)

    if (
      !isConditionValueType(conditionType) &&
      !(expression.nullable === true && this.isRuntimeNullableType(conditionType))
    ) {
      this.report(
        'INOX_CONDITION_TYPE',
        `condition must be boolean or truthy-compatible, got ${conditionType}`,
        expression.loc
      )
    }
  }

  resolveNullableConditionNarrowing(expression: AnyNode | null | undefined): NullableConditionNarrowing {
    if (expression === null || typeof expression === 'undefined') {
      return {
        trueNames: [],
        falseNames: []
      }
    }

    if (expression.type === 'UnaryExpression' && expression.operator === '!') {
      const argument = this.resolveNullableConditionNarrowing(expression.argument)

      return {
        trueNames: argument.falseNames,
        falseNames: argument.trueNames
      }
    }

    if (expression.type !== 'BinaryExpression') {
      const key = nullableNarrowingKey(expression)

      if (key !== null && typeof key !== 'undefined' && expression.nullable === true) {
        return {
          trueNames: [key],
          falseNames: []
        }
      }

      return {
        trueNames: [],
        falseNames: []
      }
    }

    if (expression.operator === '&&') {
      const left = this.resolveNullableConditionNarrowing(expression.left)
      const narrowingState = this.pushNarrowedNullableNames(left.trueNames)
      let right: NullableConditionNarrowing = {
        trueNames: [],
        falseNames: []
      }

      right = this.resolveNullableConditionNarrowing(expression.right)
      this.restoreNarrowedNullableNames(narrowingState)
      const trueNames: string[] = []
      const falseNameCandidates: string[] = []
      const leftTrueNames: string[] = left.trueNames
      const rightTrueNames: string[] = right.trueNames
      const rightFalseNames: string[] = right.falseNames

      for (const name of leftTrueNames) {
        trueNames.push(name)
        falseNameCandidates.push(name)
      }

      for (const name of rightTrueNames) {
        trueNames.push(name)
      }

      for (const name of rightFalseNames) {
        falseNameCandidates.push(name)
      }

      return {
        trueNames: this.uniqueNames(trueNames),
        falseNames: this.intersectNames(left.falseNames, this.uniqueNames(falseNameCandidates))
      }
    }

    if (expression.operator === '||') {
      const left = this.resolveNullableConditionNarrowing(expression.left)
      const narrowingState = this.pushNarrowedNullableNames(left.falseNames)
      let right: NullableConditionNarrowing = {
        trueNames: [],
        falseNames: []
      }

      right = this.resolveNullableConditionNarrowing(expression.right)
      this.restoreNarrowedNullableNames(narrowingState)
      const trueNameCandidates: string[] = []
      const falseNames: string[] = []
      const leftFalseNames: string[] = left.falseNames
      const rightTrueNames: string[] = right.trueNames
      const rightFalseNames: string[] = right.falseNames

      for (const name of leftFalseNames) {
        trueNameCandidates.push(name)
        falseNames.push(name)
      }

      for (const name of rightTrueNames) {
        trueNameCandidates.push(name)
      }

      for (const name of rightFalseNames) {
        falseNames.push(name)
      }

      return {
        trueNames: this.intersectNames(left.trueNames, this.uniqueNames(trueNameCandidates)),
        falseNames: this.uniqueNames(falseNames)
      }
    }

    if (
      expression.operator !== '===' &&
      expression.operator !== '!=='
    ) {
      return {
        trueNames: [],
        falseNames: []
      }
    }

    let nullable = expression.left
    let maybeNull = expression.right

    if (
      expression.left !== null &&
      typeof expression.left !== 'undefined' &&
      (expression.left.type === 'NullLiteral' || isNonNullNarrowingLiteral(expression.left))
    ) {
      nullable = expression.right
      maybeNull = expression.left
    }

    if (
      maybeNull === null ||
      typeof maybeNull === 'undefined' ||
      nullable === null ||
      typeof nullable === 'undefined'
    ) {
      return {
        trueNames: [],
        falseNames: []
      }
    }

    const key = nullableNarrowingKey(nullable)

    if (key === null || typeof key === 'undefined' || nullable.nullable !== true) {
      return {
        trueNames: [],
        falseNames: []
      }
    }

    if (isNonNullNarrowingLiteral(maybeNull)) {
      if (expression.operator === '===') {
        return {
          trueNames: [key],
          falseNames: []
        }
      }

      return {
        trueNames: [],
        falseNames: [key]
      }
    }

    if (maybeNull.type !== 'NullLiteral') {
      return {
        trueNames: [],
        falseNames: []
      }
    }

    if (expression.operator === '!==') {
      return {
        trueNames: [key],
        falseNames: []
      }
    }

    return {
      trueNames: [],
      falseNames: [key]
    }
  }

  reportNullableRuntimeAccess(receiver: AnyNode, loc: SourceLocation): void {
    if (receiver.nullable !== true) {
      return
    }

    let valueType: ValueType | null = null
    const receiverValueType = receiver.valueType

    if (receiverValueType !== null && typeof receiverValueType !== 'undefined') {
      valueType = receiverValueType
    } else {
      valueType = this.inferNullableAccessValueType(receiver)
    }

    if (valueType === null || typeof valueType === 'undefined') {
      return
    }

    const narrowedValueType: ValueType = valueType

    if (!this.isRuntimeNullableType(narrowedValueType)) {
      return
    }

    this.report('INOX_WEAK_ACCESS', 'nullable weak value access requires optional chaining or a prior null check', loc)
  }

  inferNullableAccessValueType(expression: AnyNode): ValueType | null {
    if (expression.type === 'Reference' && expression.path.length === 1) {
      const name = firstPathSegment(expression.path)
      const symbol = this.scope.resolve(name)
      let valueType: ValueType | null = null

      if (symbol !== null && typeof symbol !== 'undefined') {
        valueType = symbol.valueType
      }

      if (valueType !== null && typeof valueType !== 'undefined') {
        return valueType
      }

      return null
    }

    if (expression.valueType !== null && typeof expression.valueType !== 'undefined') {
      return expression.valueType
    }

    return null
  }

  isRuntimeNullableType(valueType: ValueType | null | undefined): boolean {
    return (
      valueType === 'number' ||
      valueType === 'boolean' ||
      valueType === 'string' ||
      valueType === 'bytes' ||
      valueType === 'object' ||
      valueType === 'array' ||
      valueType === 'map' ||
      valueType === 'set' ||
      valueType === 'function'
    )
  }

  pushNarrowedNullableNames(names: string[]): CheckerNarrowingState | null {
    if (names.length === 0) {
      return null
    }

    return this.pushBranchNarrowedNullableNames(names)
  }

  pushBranchNarrowedNullableNames(names: string[]): CheckerNarrowingState {
    const previous = {
      narrowedNullableNames: this.narrowedNullableNames
    }

    this.narrowedNullableNames = cloneStringSet(previous.narrowedNullableNames)

    for (const name of names) {
      this.narrowedNullableNames.add(name)
    }

    return previous
  }

  restoreNarrowedNullableNames(previous: CheckerNarrowingState | null): void {
    if (previous !== null && typeof previous !== 'undefined') {
      this.narrowedNullableNames = previous.narrowedNullableNames
    }
  }

  uniqueNames(names: string[]): string[] {
    const unique: string[] = []
    const seen = new Set()

    for (const name of names) {
      if (!seen.has(name)) {
        seen.add(name)
        unique.push(name)
      }
    }

    return unique
  }

  intersectNames(left: string[], right: string[]): string[] {
    const rightNames = stringSetFromArray(right)
    const names: string[] = []

    for (const name of left) {
      if (rightNames.has(name)) {
        names.push(name)
      }
    }

    return this.uniqueNames(names)
  }

  checkScopedBody(statement: AnyNode): void {
    if (statement.type === 'BlockStatement') {
      this.checkStatement(statement)
      return
    }

    const scopeState = this.pushScope()

    try {
      this.checkStatement(statement)
    } finally {
      this.restoreScope(scopeState)
    }
  }

  checkFlowScopedBody(statement: AnyNode): void {
    const scopeState = this.pushScope()

    try {
      if (statement.type === 'BlockStatement') {
        this.checkStatements(statement.body)
      } else {
        this.checkStatement(statement)
      }
    } finally {
      this.restoreScopeWithOuterNarrowing(scopeState)
    }
  }

  resolveReference(reference: AnyNode): SymbolInfo | null {
    const path: string[] = reference.path
    const root = path[0]

    if (root === 'super') {
      this.reportUnsupportedSuperReference(reference.loc)
      return null
    }

    let symbol = this.scope.resolve(root)

    if (symbol === null || typeof symbol === 'undefined') {
      const globalSymbol = builtinGlobalSymbol(root)

      if (globalSymbol !== null && typeof globalSymbol !== 'undefined') {
        symbol = globalSymbol
      }
    }

    if (symbol === null || typeof symbol === 'undefined') {
      this.report('INOX_UNKNOWN_NAME', `unknown name ${root}`, reference.loc)
      return null
    }

    return symbol
  }

  reportUnsupportedSuperReference(loc: SourceLocation): void {
    const diagnostics = this.diagnostics
    const file = loc.file ?? ''

    for (let index = 0; index < diagnostics.length; index = index + 1) {
      const item = diagnostics[index]
      const itemFile = item.file ?? ''

      if (
        item.code === 'INOX_CLASS_EXTENDS' &&
        item.line === loc.line &&
        item.column === loc.column &&
        itemFile === file
      ) {
        return
      }
    }

    this.report('INOX_CLASS_EXTENDS', 'super is not supported because class inheritance is not supported', loc)
  }

  runtimeGlobalIsShadowed(name: string): boolean {
    const symbol = this.scope.resolve(name)

    return symbol !== null && typeof symbol !== 'undefined' && symbol.kind !== 'global'
  }

  declareTypeAlias(item: TypeAliasDeclarationNode): void {
    if (this.types.has(item.name)) {
      this.report('INOX_REDECLARED_NAME', `type ${item.name} is already declared`, item.loc)
      return
    }

    if (item.valueType.kind === 'alias' || item.valueType.kind === 'object' || item.valueType.kind === 'function') {
      this.types.set(item.name, item.valueType)
    }
  }

  reportOwnershipCycles(): void {
    const graph = this.buildOwnershipGraph()
    const path: OwnershipGraphEdge[] = []
    const visiting: Set<string> = new Set()
    const visited: Set<string> = new Set()
    const reported: Set<string> = new Set()

    for (const node of graph.keys()) {
      this.visitOwnershipGraphNode(node, graph, path, visiting, visited, reported)
    }
  }

  visitOwnershipGraphNode(
    node: string,
    graph: Map<string, OwnershipGraphEdge[]>,
    path: OwnershipGraphEdge[],
    visiting: Set<string>,
    visited: Set<string>,
    reported: Set<string>
  ): void {
    if (visiting.has(node)) {
      return
    }

    if (visited.has(node)) {
      return
    }

    visiting.add(node)

    let edges: OwnershipGraphEdge[] = []
    const foundEdges = graph.get(node)

    if (foundEdges !== null && typeof foundEdges !== 'undefined') {
      edges = foundEdges
    }

    for (const edge of edges) {
      let cycleStart = -1

      for (let index = 0; index < path.length; index++) {
        if (path[index].from === edge.to) {
          cycleStart = index
          break
        }
      }

      if (edge.to === node || cycleStart >= 0) {
        const cycle: OwnershipGraphEdge[] = []

        if (cycleStart >= 0) {
          for (let index = cycleStart; index < path.length; index++) {
            cycle.push(path[index])
          }
        }

        cycle.push(edge)
        const key = this.ownershipCycleKey(cycle)

        if (!reported.has(key)) {
          reported.add(key)
          let cycleLoc = edge.loc

          const firstCycleEdge = cycle[0]
          cycleLoc = firstCycleEdge.loc
          const cycleText: string = this.formatOwnershipCycle(cycle)

          this.report(
            'INOX_OWNERSHIP_CYCLE',
            'strong ownership cycle detected: ' + cycleText + '. Mark one back-reference as weak.',
            cycleLoc
          )
        }

        continue
      }

      if (!visited.has(edge.to)) {
        path.push(edge)
        this.visitOwnershipGraphNode(edge.to, graph, path, visiting, visited, reported)
        path.pop()
      }
    }

    visiting.delete(node)
    visited.add(node)
  }

  buildOwnershipGraph(): Map<string, OwnershipGraphEdge[]> {
    const graph = new Map()
    const nodeNames = this.ownershipGraphNodeNames()

    for (const name of nodeNames) {
      graph.set(name, [])
    }

    for (const item of this.program.body) {
      if (item.type === 'TypeAliasDeclaration') {
        const typeInfo = item.valueType as TypeAliasInfo

        if (typeInfo.kind === 'object') {
          this.addOwnershipFieldEdges(graph, nodeNames, item.name, typeInfo.fields)
        }
      } else if (item.type === 'ClassDeclaration') {
        let fields: AnyNode[] = []

        if (item.fields !== null && typeof item.fields !== 'undefined') {
          fields = item.fields
        }

        this.addOwnershipFieldEdges(graph, nodeNames, item.name, fields)
      }
    }

    return graph
  }

  ownershipGraphNodeNames(): Set<string> {
    const names: Set<string> = new Set()

    for (const name of this.types.keys()) {
      names.add(name)
    }

    for (const name of this.classNames) {
      names.add(name)
    }

    return names
  }

  addOwnershipFieldEdges(
    graph: Map<string, OwnershipGraphEdge[]>,
    nodeNames: Set<string>,
    owner: string,
    fields: AnyNode[]
  ): void {
    for (const field of fields) {
      if ((owner === 'Scope' || owner === 'CheckerScope') && nodeNameEquals(field, 'parent')) {
        continue
      }

      if (field.ownership === 'weak' || this.hasWeakOwnershipMarker(fields, field.name)) {
        continue
      }

      for (const target of this.ownershipTargetsFromTypeName(field.valueType)) {
        if (!nodeNames.has(target)) {
          continue
        }

        const edges = graph.get(owner)

        if (edges === null || typeof edges === 'undefined') {
          continue
        }

        edges.push({
          from: owner,
          to: target,
          field: field.name,
          loc: field.loc
        })
      }
    }
  }

  hasWeakOwnershipMarker(fields: AnyNode[], fieldName: string): boolean {
    const markerName = `${fieldName}Ownership`

    for (const field of fields) {
      if (nodeNameEquals(field, markerName) && field.optional === true && field.valueType === 'string') {
        return true
      }
    }

    return false
  }

  ownershipTargetsFromTypeName(name: string | null | undefined): string[] {
    if (name === null || typeof name === 'undefined' || name === 'unknown') {
      return []
    }

    if (isNullableTypeName(name)) {
      const nullableTypeName = nullableTypeNameFromKnownTypeName(name)

      return this.ownershipTargetsFromTypeName(nullableTypeName)
    }

    if (isArrayTypeName(name)) {
      const arrayElementTypeName = arrayElementTypeNameFromKnownTypeName(name)

      return this.ownershipTargetsFromTypeName(arrayElementTypeName)
    }

    if (isSetTypeName(name)) {
      const setElementTypeName = setElementTypeNameFromKnownTypeName(name)

      return this.ownershipTargetsFromTypeName(setElementTypeName)
    }

    const mapTypeNames = mapTypeNamesFromTypeName(name)

    if (mapTypeNames !== null && typeof mapTypeNames !== 'undefined') {
      return this.ownershipTargetsFromTypeName(mapTypeNames.value)
    }

    return [name]
  }

  ownershipCycleKey(cycle: OwnershipGraphEdge[]): string {
    const parts: string[] = []

    for (let index = 0; index < cycle.length; index = index + 1) {
      const edge = cycle[index]
      parts.push(`${edge.from}.${edge.field}->${edge.to}`)
    }

    return joinStrings(parts, '|')
  }

  formatOwnershipCycle(cycle: OwnershipGraphEdge[]): string {
    const parts: string[] = []

    for (let index = 0; index < cycle.length; index = index + 1) {
      const edge = cycle[index]
      parts.push(`${edge.from}.${edge.field} -> ${edge.to}`)
    }

    return joinStrings(parts, ' -> ')
  }

  resolveDeclaredType(name: string | null | undefined, loc: SourceLocation): ResolvedTypeInfo {
    if (name === null || typeof name === 'undefined' || name === 'unknown') {
      return {
        valueType: 'unknown',
        nullable: false,
        functionType: null,
        shape: null,
        arrayElementType: null,
        arrayElementDeclaredType: null,
        mapKeyType: null,
        mapValueType: null,
        mapValueShape: null,
        promiseValueType: null,
        setElementType: null
      }
    }

    if (name === 'AnyNode') {
      return anyNodeResolvedTypeInfo(loc)
    }

    if (name === 'ValueType') {
      return {
        valueType: 'string',
        nullable: false,
        functionType: null,
        shape: null,
        arrayElementType: null,
        arrayElementDeclaredType: null,
        mapKeyType: null,
        mapValueType: null,
        mapValueShape: null,
        promiseValueType: null,
        setElementType: null
      }
    }

    if (isNullableTypeName(name)) {
      const nullableTypeName = nullableTypeNameFromKnownTypeName(name)
      const inner = this.resolveDeclaredType(nullableTypeName, loc)

      return {
        valueType: inner.valueType,
        nullable: true,
        functionType: inner.functionType,
        shape: inner.shape,
        arrayElementType: inner.arrayElementType,
        arrayElementDeclaredType: inner.arrayElementDeclaredType,
        mapKeyType: inner.mapKeyType,
        mapValueType: inner.mapValueType,
        mapValueShape: inner.mapValueShape,
        promiseValueType: inner.promiseValueType,
        setElementType: inner.setElementType
      }
    }

    const unionTypeNames = unionTypeNamesFromTypeName(name)

    if (unionTypeNames !== null && typeof unionTypeNames !== 'undefined') {
      return this.resolveUnionDeclaredType(unionTypeNames, loc)
    }

    if (name === 'array') {
      return {
        valueType: 'array',
        nullable: false,
        functionType: null,
        shape: null,
        arrayElementType: 'unknown',
        arrayElementDeclaredType: null,
        mapKeyType: null,
        mapValueType: null,
        mapValueShape: null,
        promiseValueType: null,
        setElementType: null
      }
    }

    if (isArrayTypeName(name)) {
      const arrayElementTypeName = arrayElementTypeNameFromKnownTypeName(name)
      const elementInfo = this.resolveDeclaredType(arrayElementTypeName, loc)

      return {
        valueType: 'array',
        nullable: false,
        functionType: null,
        shape: null,
        arrayElementType: elementInfo.valueType,
        arrayElementDeclaredType: arrayElementTypeName,
        arrayElementFunctionType: elementInfo.functionType,
        mapKeyType: null,
        mapValueType: null,
        mapValueShape: null,
        promiseValueType: null,
        setElementType: null
      }
    }

    const mapTypeNames = mapTypeNamesFromTypeName(name)

    if (name === 'map' || (mapTypeNames !== null && typeof mapTypeNames !== 'undefined')) {
      let mapKeyType: ValueType = 'unknown'
      let mapValueType: ValueType = 'unknown'
      let mapValueShape: ObjectShapeInfo | null = null

      if (mapTypeNames !== null && typeof mapTypeNames !== 'undefined') {
        const keyInfo = this.resolveDeclaredType(mapTypeNames.key, loc)
        const valueInfo = this.resolveDeclaredType(mapTypeNames.value, loc)
        mapKeyType = keyInfo.valueType
        mapValueType = valueInfo.valueType
        mapValueShape = valueInfo.shape
      }

      return {
        valueType: 'map',
        nullable: false,
        functionType: null,
        shape: null,
        arrayElementType: null,
        arrayElementDeclaredType: null,
        mapKeyType,
        mapValueType,
        mapValueShape,
        promiseValueType: null,
        setElementType: null
      }
    }

    const recordTypeNames = recordTypeNamesFromTypeName(name)

    if (recordTypeNames !== null && typeof recordTypeNames !== 'undefined') {
      const valueInfo = this.resolveDeclaredType(recordTypeNames.value, loc)

      return {
        valueType: 'object',
        nullable: false,
        functionType: null,
        shape: {
          kind: 'object',
          dynamic: true,
          dynamicField: {
            name: '',
            optional: false,
            readonly: false,
            ownership: 'strong',
            declaredType: recordTypeNames.value,
            valueType: valueInfo.valueType,
            nullable: valueInfo.nullable,
            arrayElementType: valueInfo.arrayElementType,
            arrayElementDeclaredType: valueInfo.arrayElementDeclaredType,
            mapKeyType: valueInfo.mapKeyType,
            mapValueType: valueInfo.mapValueType,
            mapValueShape: valueInfo.mapValueShape,
            promiseValueType: valueInfo.promiseValueType,
            setElementType: valueInfo.setElementType,
            functionType: valueInfo.functionType,
            shape: valueInfo.shape,
            loc
          },
          fields: []
        },
        arrayElementType: null,
        arrayElementDeclaredType: null,
        mapKeyType: null,
        mapValueType: null,
        mapValueShape: null,
        promiseValueType: null,
        setElementType: null
      }
    }

    if (name === 'set') {
      return {
        valueType: 'set',
        nullable: false,
        functionType: null,
        shape: null,
        arrayElementType: null,
        arrayElementDeclaredType: null,
        mapKeyType: null,
        mapValueType: null,
        mapValueShape: null,
        promiseValueType: null,
        setElementType: 'unknown'
      }
    }

    if (isSetTypeName(name)) {
      const setElementTypeName = setElementTypeNameFromKnownTypeName(name)
      const elementInfo = this.resolveDeclaredType(setElementTypeName, loc)

      return {
        valueType: 'set',
        nullable: false,
        functionType: null,
        shape: null,
        arrayElementType: null,
        arrayElementDeclaredType: null,
        mapKeyType: null,
        mapValueType: null,
        mapValueShape: null,
        promiseValueType: null,
        setElementType: elementInfo.valueType
      }
    }

    if (name === 'promise') {
      return {
        valueType: 'promise',
        nullable: false,
        functionType: null,
        shape: null,
        arrayElementType: null,
        arrayElementDeclaredType: null,
        mapKeyType: null,
        mapValueType: null,
        mapValueShape: null,
        promiseValueType: 'unknown',
        setElementType: null
      }
    }

    if (isPromiseTypeName(name)) {
      const promiseValueTypeName = promiseValueTypeNameFromKnownTypeName(name)
      const valueInfo = this.resolveDeclaredType(promiseValueTypeName, loc)

      return {
        valueType: 'promise',
        nullable: false,
        functionType: null,
        shape: valueInfo.shape,
        arrayElementType: null,
        arrayElementDeclaredType: null,
        mapKeyType: null,
        mapValueType: null,
        mapValueShape: null,
        promiseValueType: valueInfo.valueType,
        setElementType: null
      }
    }

    if (isBytesTypeName(name)) {
      return {
        valueType: 'bytes',
        nullable: false,
        functionType: null,
        shape: null,
        arrayElementType: null,
        arrayElementDeclaredType: null,
        mapKeyType: null,
        mapValueType: null,
        mapValueShape: null,
        promiseValueType: null,
        setElementType: null
      }
    }

    if (isBuiltinValueType(name)) {
      return {
        valueType: name,
        nullable: false,
        functionType: null,
        shape: null,
        arrayElementType: null,
        arrayElementDeclaredType: null,
        mapKeyType: null,
        mapValueType: null,
        mapValueShape: null,
        promiseValueType: null,
        setElementType: null
      }
    }

    const classKnown = this.classNames.has(name)
    let classSymbol: SymbolInfo | null = null

    if (classKnown) {
      const foundClassSymbol = this.scope.resolve(name)

      if (foundClassSymbol !== null && typeof foundClassSymbol !== 'undefined' && foundClassSymbol.kind === 'class') {
        classSymbol = foundClassSymbol
      }
    }

    if (
      classKnown ||
      (classSymbol !== null && typeof classSymbol !== 'undefined' && classSymbol.kind === 'class')
    ) {
      let classShape: ObjectShapeInfo | null = null

      if (
        classSymbol !== null &&
        typeof classSymbol !== 'undefined' &&
        classSymbol.shape !== null &&
        typeof classSymbol.shape !== 'undefined'
      ) {
        classShape = classSymbol.shape
      }

      return {
        valueType: 'object',
        nullable: false,
        functionType: null,
        shape: classShape,
        arrayElementType: null,
        arrayElementDeclaredType: null,
        mapKeyType: null,
        mapValueType: null,
        mapValueShape: null,
        promiseValueType: null,
        setElementType: null
      }
    }

    const shape = this.types.get(name)

    if (shape !== null && typeof shape !== 'undefined') {
      const cached = this.resolvedDeclaredTypes.get(name)

      if (cached !== null && typeof cached !== 'undefined') {
        return this.cloneResolvedTypeInfo(cached)
      }

      if (this.resolvingDeclaredTypes.has(name)) {
        const recursiveInfo = this.unresolvedTypeInfo()

        if (shape.kind === 'function') {
          recursiveInfo.valueType = 'function'
        } else if (shape.kind === 'object') {
          recursiveInfo.valueType = 'object'
        }

        return recursiveInfo
      }

      if (shape.kind === 'alias') {
        this.resolvingDeclaredTypes.add(name)

        try {
          const resolved = this.resolveDeclaredType(shape.valueType, loc)
          this.resolvedDeclaredTypes.set(name, this.cloneResolvedTypeInfo(resolved))

          return resolved
        } finally {
          this.resolvingDeclaredTypes.delete(name)
        }
      }

      if (shape.kind === 'function') {
        this.resolvingDeclaredTypes.add(name)

        try {
          const returnInfo = this.resolveDeclaredType(shape.returnType, loc)
          const params: FunctionTypeParamMetadata[] = []
          let returnPromiseValueType: ValueType | null = null

          if (returnInfo.promiseValueType !== null && typeof returnInfo.promiseValueType !== 'undefined') {
            returnPromiseValueType = returnInfo.promiseValueType
          }

          for (const param of shape.params) {
            const declaredType = nodeDeclaredTypeOrValueType(param)

            const paramInfo = this.resolveDeclaredType(declaredType, param.loc)
            let paramPromiseValueType: ValueType | null = null

            if (paramInfo.promiseValueType !== null && typeof paramInfo.promiseValueType !== 'undefined') {
              paramPromiseValueType = paramInfo.promiseValueType
            }

            const resolvedParam = {
              name: param.name,
              loc: param.loc,
              optional: isOptionalParam(param),
              rest: param.rest === true,
              declaredType,
              valueType: paramInfo.valueType,
              nullable: paramInfo.nullable,
              arrayElementType: paramInfo.arrayElementType,
              arrayElementDeclaredType: paramInfo.arrayElementDeclaredType,
              mapKeyType: paramInfo.mapKeyType,
              mapValueType: paramInfo.mapValueType,
              promiseValueType: paramPromiseValueType,
              setElementType: paramInfo.setElementType,
              functionType: paramInfo.functionType,
              shape: paramInfo.shape
            }

            params.push(resolvedParam)
          }

          const resolved: ResolvedTypeInfo = {
            valueType: 'function',
            nullable: false,
            functionType: {
              kind: 'function',
              resolved: true,
              params,
              declaredReturnType: shape.returnType,
              returnType: returnInfo.valueType,
              returnNullable: returnInfo.nullable,
              returnArrayElementType: returnInfo.arrayElementType,
              returnArrayElementDeclaredType: returnInfo.arrayElementDeclaredType,
              returnMapKeyType: returnInfo.mapKeyType,
              returnMapValueType: returnInfo.mapValueType,
              returnPromiseValueType,
              returnSetElementType: returnInfo.setElementType,
              returnShape: returnInfo.shape
            },
            shape: null,
            arrayElementType: null,
            arrayElementDeclaredType: null,
            mapKeyType: null,
            mapValueType: null,
            mapValueShape: null,
            promiseValueType: null,
            setElementType: null
          }
          this.resolvedDeclaredTypes.set(name, this.cloneResolvedTypeInfo(resolved))

          return resolved
        } finally {
          this.resolvingDeclaredTypes.delete(name)
        }
      }

      this.resolvingDeclaredTypes.add(name)

      try {
        const resolvedShape = this.resolveObjectShape(shape)
        const resolved: ResolvedTypeInfo = {
          valueType: 'object',
          nullable: false,
          functionType: null,
          shape: resolvedShape,
          arrayElementType: null,
          arrayElementDeclaredType: null,
          mapKeyType: null,
          mapValueType: null,
          mapValueShape: null,
          promiseValueType: null,
          setElementType: null
        }
        this.resolvedDeclaredTypes.set(name, this.cloneResolvedTypeInfo(resolved))

        return resolved
      } finally {
        this.resolvingDeclaredTypes.delete(name)
      }
    }

    this.report('INOX_UNKNOWN_TYPE', `unknown type ${name}`, loc)

    return {
      valueType: 'unknown',
      nullable: false,
      functionType: null,
      shape: null,
      arrayElementType: null,
      arrayElementDeclaredType: null,
      mapKeyType: null,
      mapValueType: null,
      mapValueShape: null,
      promiseValueType: null,
      setElementType: null
    }
  }

  resolveUnionDeclaredType(names: string[], loc: SourceLocation): ResolvedTypeInfo {
    const infos: ResolvedTypeInfo[] = []
    const valueTypes: ValueType[] = []

    for (let index = 0; index < names.length; index = index + 1) {
      const info = this.resolveDeclaredType(names[index], loc)
      infos.push(info)
      valueTypes.push(info.valueType)
    }

    const valueType = commonValueType(valueTypes)
    const result = this.unresolvedTypeInfo()

    if (valueType === 'unknown') {
      return result
    }

    result.valueType = valueType
    result.nullable = resolvedTypeListHasNullable(infos)

    if (valueType === 'array') {
      result.arrayElementType = commonResolvedArrayElementType(infos)
    } else if (valueType === 'map') {
      result.mapKeyType = commonResolvedMapKeyType(infos)
      result.mapValueType = commonResolvedMapValueType(infos)
      result.mapValueShape = commonResolvedMapValueShape(infos)
    } else if (valueType === 'promise') {
      result.promiseValueType = commonResolvedPromiseValueType(infos)
    } else if (valueType === 'set') {
      result.setElementType = commonResolvedSetElementType(infos)
    } else if (valueType === 'object') {
      result.shape = commonResolvedObjectShape(infos)
    }

    return result
  }

  resolveObjectShape(shape: ObjectShapeInfo): ObjectShapeInfo {
    const bases = this.resolveObjectShapeBases(shape)
    const fields: AnyNode[] = []
    const resolvedFields: AnyNode[] = []

    mergeShapeFields(fields, bases.fields)
    mergeShapeFields(fields, shape.fields)

    for (const field of fields) {
      resolvedFields.push(this.resolveObjectShapeField(field, fields))
    }

    const resolvedBaseTypes: string[] = []
    const baseTypes = shape.baseTypes

    if (baseTypes !== null && typeof baseTypes !== 'undefined') {
      for (let index = 0; index < baseTypes.length; index = index + 1) {
        resolvedBaseTypes.push(baseTypes[index])
      }
    }

    const resolvedShape: ObjectShapeInfo = {
      kind: 'object',
      baseTypes: resolvedBaseTypes,
      dynamic: shape.dynamic === true || bases.dynamic,
      dynamicField: bases.dynamicField,
      fields: resolvedFields
    }

    if (shape.dynamicField !== null && typeof shape.dynamicField !== 'undefined') {
      resolvedShape.dynamicField = this.resolveObjectShapeField(shape.dynamicField, [shape.dynamicField])
    }

    if (shape.builtin !== null && typeof shape.builtin !== 'undefined') {
      resolvedShape.builtin = shape.builtin
    }

    return resolvedShape
  }

  resolveObjectShapeField(field: AnyNode, fields: AnyNode[]): AnyNode {
    const weakField = field.ownership === 'weak' || this.hasWeakOwnershipMarker(fields, field.name)
    const declaredType = nodeDeclaredTypeOrValueType(field)

    let fieldInfo = this.resolveFieldDeclaredType(field)

    if (weakField) {
      fieldInfo = this.resolveWeakTargetShapeFieldType(field)
    }

    let promiseValueType: ValueType | null = null
    let functionType = fieldInfo.functionType

    if (functionType === null || typeof functionType === 'undefined') {
      const fieldFunctionType = field.functionType

      if (fieldFunctionType !== null && typeof fieldFunctionType !== 'undefined') {
        functionType = this.resolveFunctionTypeMetadata(fieldFunctionType, field.loc)
      } else {
        functionType = null
      }
    }

    if (fieldInfo.promiseValueType !== null && typeof fieldInfo.promiseValueType !== 'undefined') {
      promiseValueType = fieldInfo.promiseValueType
    }

    return {
      type: field.type,
      name: field.name,
      optional: field.optional,
      readonly: field.readonly,
      ownership: field.ownership,
      weakLoc: field.weakLoc,
      static: field.static,
      staticLoc: field.staticLoc,
      weakTypeValidated: field.weakTypeValidated,
      loc: field.loc,
      declaredType,
      valueType: fieldInfo.valueType,
      nullable: fieldInfo.nullable || weakField || field.optional === true,
      arrayElementType: fieldInfo.arrayElementType,
      arrayElementDeclaredType: fieldInfo.arrayElementDeclaredType,
      mapKeyType: fieldInfo.mapKeyType,
      mapValueType: fieldInfo.mapValueType,
      mapValueShape: fieldInfo.mapValueShape,
      promiseValueType,
      setElementType: fieldInfo.setElementType,
      functionType,
      shape: fieldInfo.shape
    }
  }

  resolveFunctionTypeMetadata(
    functionType: FunctionTypeMetadata | null | undefined,
    loc: SourceLocation | null | undefined
  ): FunctionTypeMetadata | null {
    if (functionType === null || typeof functionType === 'undefined') {
      return null
    }

    let typeLine = 1
    let typeColumn = 1

    if (loc !== null && typeof loc !== 'undefined') {
      typeLine = loc.line
      typeColumn = loc.column
    }

    const functionTypeLoc = functionType.loc

    if (functionTypeLoc !== null && typeof functionTypeLoc !== 'undefined') {
      typeLine = functionTypeLoc.line
      typeColumn = functionTypeLoc.column
    }

    const typeLoc: SourceLocation = { line: typeLine, column: typeColumn }
    const returnInfo = this.resolveDeclaredType(functionType.returnType, typeLoc)
    const params: FunctionTypeParamMetadata[] = []
    let returnPromiseValueType: ValueType | null = null

    if (returnInfo.promiseValueType !== null && typeof returnInfo.promiseValueType !== 'undefined') {
      returnPromiseValueType = returnInfo.promiseValueType
    }

    for (const param of functionType.params) {
      const declaredType = nodeDeclaredTypeOrValueType(param)

      const paramInfo = this.resolveDeclaredType(declaredType, param.loc)
      let paramPromiseValueType: ValueType | null = null

      if (paramInfo.promiseValueType !== null && typeof paramInfo.promiseValueType !== 'undefined') {
        paramPromiseValueType = paramInfo.promiseValueType
      }

      params.push({
        name: param.name,
        loc: param.loc,
        optional: isOptionalParam(param),
        rest: param.rest === true,
        declaredType,
        valueType: paramInfo.valueType,
        nullable: paramInfo.nullable,
        arrayElementType: paramInfo.arrayElementType,
        arrayElementDeclaredType: paramInfo.arrayElementDeclaredType,
        mapKeyType: paramInfo.mapKeyType,
        mapValueType: paramInfo.mapValueType,
        mapValueShape: paramInfo.mapValueShape,
        promiseValueType: paramPromiseValueType,
        setElementType: paramInfo.setElementType,
        functionType: paramInfo.functionType,
        shape: paramInfo.shape
      })
    }

    return {
      kind: 'function',
      resolved: true,
      params,
      declaredReturnType: functionType.returnType,
      returnType: returnInfo.valueType,
      returnNullable: returnInfo.nullable,
      returnArrayElementType: returnInfo.arrayElementType,
      returnArrayElementDeclaredType: returnInfo.arrayElementDeclaredType,
      returnMapKeyType: returnInfo.mapKeyType,
      returnMapValueType: returnInfo.mapValueType,
      returnPromiseValueType,
      returnSetElementType: returnInfo.setElementType,
      returnShape: returnInfo.shape
    }
  }

  resolveObjectShapeBases(shape: ObjectShapeInfo): ObjectShapeBases {
    const fields: AnyNode[] = []
    let dynamic = false
    let dynamicField: AnyNode | null = null

    const baseTypes: string[] = shape.baseTypes ?? []

    for (const name of baseTypes) {
      const base = this.types.get(name)

      if (base === null || typeof base === 'undefined' || base.kind !== 'object') {
        continue
      }

      const resolved = this.resolveObjectShape(base)

      for (const field of resolved.fields) {
        fields.push(field)
      }

      dynamic = dynamic || resolved.dynamic === true

      if (resolved.dynamicField !== null && typeof resolved.dynamicField !== 'undefined') {
        dynamicField = resolved.dynamicField
      }
    }

    return {
      dynamic,
      dynamicField,
      fields
    }
  }

  resolveFieldDeclaredType(field: AnyNode): ResolvedTypeInfo {
    if (field.ownership === 'weak') {
      return this.resolveWeakFieldDeclaredType(field)
    }

    const declaredType = nodeDeclaredTypeOrValueType(field)

    return this.resolveDeclaredType(declaredType, field.loc)
  }

  resolveWeakFieldDeclaredType(field: AnyNode): ResolvedTypeInfo {
    const declaredName = nodeDeclaredTypeOrValueType(field)

    let targetName = declaredName

    if (isNullableTypeName(declaredName)) {
      const nullableName = nullableTypeNameFromKnownTypeName(declaredName)

      if (nullableName !== null && typeof nullableName !== 'undefined') {
        targetName = nullableName
      }
    }

    const fieldInfo = this.resolveWeakTargetDeclaredType(targetName, field.loc)

    if (fieldInfo.valueType !== 'unknown' && fieldInfo.valueType !== 'object' && field.weakTypeValidated !== true) {
      let weakLoc = field.loc

      if (field.weakLoc !== null && typeof field.weakLoc !== 'undefined') {
        weakLoc = field.weakLoc
      }

      this.report(
        'INOX_WEAK_TYPE',
        `weak field ${field.name} must target an object or class type in the current compiler slice`,
        weakLoc
      )
    }

    field.weakTypeValidated = true

    fieldInfo.nullable = true

    return fieldInfo
  }

  resolveWeakTargetDeclaredType(name: string | null | undefined, loc: SourceLocation): ResolvedTypeInfo {
    if (name === null || typeof name === 'undefined' || name === 'unknown') {
      return {
        valueType: 'unknown',
        nullable: false,
        functionType: null,
        shape: null,
        arrayElementType: null,
        arrayElementDeclaredType: null,
        mapKeyType: null,
        mapValueType: null,
        mapValueShape: null,
        promiseValueType: null,
        setElementType: null
      }
    }

    if (name === 'object') {
      return {
        valueType: 'object',
        nullable: false,
        functionType: null,
        shape: null,
        arrayElementType: null,
        arrayElementDeclaredType: null,
        mapKeyType: null,
        mapValueType: null,
        mapValueShape: null,
        promiseValueType: null,
        setElementType: null
      }
    }

    const shape = this.types.get(name)

    if (shape !== null && typeof shape !== 'undefined' && shape.kind === 'object') {
      return {
        valueType: 'object',
        nullable: false,
        functionType: null,
        shape: this.resolveWeakTargetObjectShape(shape),
        arrayElementType: null,
        arrayElementDeclaredType: null,
        mapKeyType: null,
        mapValueType: null,
        mapValueShape: null,
        promiseValueType: null,
        setElementType: null
      }
    }

    const classSymbol = this.scope.resolve(name)

    if (
      this.classNames.has(name) ||
      (classSymbol !== null && typeof classSymbol !== 'undefined' && classSymbol.kind === 'class')
    ) {
      let classShape: ObjectShapeInfo | null = null

      if (
        classSymbol !== null &&
        typeof classSymbol !== 'undefined' &&
        classSymbol.shape !== null &&
        typeof classSymbol.shape !== 'undefined'
      ) {
        classShape = this.resolveWeakTargetObjectShape(classSymbol.shape)
      }

      return {
        valueType: 'object',
        nullable: false,
        functionType: null,
        shape: classShape,
        arrayElementType: null,
        arrayElementDeclaredType: null,
        mapKeyType: null,
        mapValueType: null,
        mapValueShape: null,
        promiseValueType: null,
        setElementType: null
      }
    }

    return this.resolveDeclaredType(name, loc)
  }

  resolveWeakTargetObjectShape(shape: ObjectShapeInfo): ObjectShapeInfo {
    const bases = this.resolveObjectShapeBases(shape)
    const fields: AnyNode[] = []
    const resolvedFields: AnyNode[] = []

    mergeShapeFields(fields, bases.fields)
    mergeShapeFields(fields, shape.fields)

    for (const field of fields) {
      const declared = this.resolveWeakTargetShapeFieldType(field)
      let declaredType = nodeDeclaredTypeOrValueType(field)
      const fieldDeclaredType = field.declaredType
      let promiseValueType: ValueType | null = null
      const functionType = resolvedFunctionTypeMetadata(declared.functionType, field.functionType)

      if (fieldDeclaredType !== null && typeof fieldDeclaredType !== 'undefined') {
        declaredType = fieldDeclaredType
      }

      if (declared.promiseValueType !== null && typeof declared.promiseValueType !== 'undefined') {
        promiseValueType = declared.promiseValueType
      }

      resolvedFields.push({
        type: field.type,
        name: field.name,
        optional: field.optional,
        readonly: field.readonly,
        ownership: field.ownership,
        weakLoc: field.weakLoc,
        static: field.static,
        staticLoc: field.staticLoc,
        weakTypeValidated: field.weakTypeValidated,
        loc: field.loc,
        declaredType,
        valueType: declared.valueType,
        nullable: declared.nullable || field.ownership === 'weak' || field.optional === true,
        arrayElementType: declared.arrayElementType,
        arrayElementDeclaredType: declared.arrayElementDeclaredType,
        mapKeyType: declared.mapKeyType,
        mapValueType: declared.mapValueType,
        promiseValueType,
        setElementType: declared.setElementType,
        functionType,
        shape: null
      })
    }

    const resolvedBaseTypes: string[] = shape.baseTypes ?? []

    const resolvedShape: ObjectShapeInfo = {
      kind: 'object',
      baseTypes: resolvedBaseTypes,
      dynamic: shape.dynamic === true || bases.dynamic,
      fields: resolvedFields
    }

    if (shape.builtin !== null && typeof shape.builtin !== 'undefined') {
      resolvedShape.builtin = shape.builtin
    }

    return resolvedShape
  }

  resolveWeakTargetShapeFieldType(field: AnyNode): ResolvedTypeInfo {
    const declaredType = nodeDeclaredTypeOrValueType(field)

    return this.resolveWeakTargetShapeTypeName(declaredType, field.loc)
  }

  resolveWeakTargetShapeTypeName(name: string | null | undefined, loc: SourceLocation): ResolvedTypeInfo {
    if (name === null || typeof name === 'undefined' || name === 'unknown') {
      return this.unresolvedTypeInfo()
    }

    if (isNullableTypeName(name)) {
      const nullableTypeName = nullableTypeNameFromKnownTypeName(name)
      const inner = this.resolveWeakTargetShapeTypeName(nullableTypeName, loc)

      return {
        valueType: inner.valueType,
        nullable: true,
        functionType: inner.functionType,
        shape: inner.shape,
        arrayElementType: inner.arrayElementType,
        arrayElementDeclaredType: inner.arrayElementDeclaredType,
        mapKeyType: inner.mapKeyType,
        mapValueType: inner.mapValueType,
        mapValueShape: inner.mapValueShape,
        promiseValueType: inner.promiseValueType,
        setElementType: inner.setElementType
      }
    }

    if (name === 'array') {
      const info = this.unresolvedTypeInfo()
      info.valueType = 'array'
      info.arrayElementType = 'unknown'
      info.arrayElementDeclaredType = null

      return info
    }

    if (isArrayTypeName(name)) {
      const arrayElementTypeName = arrayElementTypeNameFromKnownTypeName(name)
      const elementInfo = this.resolveWeakTargetShapeTypeName(arrayElementTypeName, loc)
      const info = this.unresolvedTypeInfo()
      info.valueType = 'array'
      info.arrayElementType = elementInfo.valueType
      info.arrayElementDeclaredType = arrayElementTypeName
      info.arrayElementFunctionType = elementInfo.functionType

      return info
    }

    const mapTypeNames = mapTypeNamesFromTypeName(name)

    if (name === 'map' || (mapTypeNames !== null && typeof mapTypeNames !== 'undefined')) {
      const info = this.unresolvedTypeInfo()
      info.valueType = 'map'
      info.mapKeyType = 'unknown'
      info.mapValueType = 'unknown'

      if (mapTypeNames !== null && typeof mapTypeNames !== 'undefined') {
        const keyInfo = this.resolveWeakTargetShapeTypeName(mapTypeNames.key, loc)
        const valueInfo = this.resolveWeakTargetShapeTypeName(mapTypeNames.value, loc)
        info.mapKeyType = keyInfo.valueType
        info.mapValueType = valueInfo.valueType
      }

      return info
    }

    if (name === 'set') {
      const info = this.unresolvedTypeInfo()
      info.valueType = 'set'
      info.setElementType = 'unknown'

      return info
    }

    if (isSetTypeName(name)) {
      const setElementTypeName = setElementTypeNameFromKnownTypeName(name)
      const elementInfo = this.resolveWeakTargetShapeTypeName(setElementTypeName, loc)
      const info = this.unresolvedTypeInfo()
      info.valueType = 'set'
      info.setElementType = elementInfo.valueType

      return info
    }

    if (isBytesTypeName(name)) {
      const info = this.unresolvedTypeInfo()
      info.valueType = 'bytes'

      return info
    }

    if (name === 'ValueType') {
      const info = this.unresolvedTypeInfo()
      info.valueType = 'string'

      return info
    }

    if (isBuiltinValueType(name)) {
      const info = this.unresolvedTypeInfo()
      info.valueType = name

      return info
    }

    const shape = this.types.get(name)
    const symbol = this.scope.resolve(name)

    if (
      (shape !== null && typeof shape !== 'undefined' && shape.kind === 'object') ||
      this.classNames.has(name) ||
      (symbol !== null && typeof symbol !== 'undefined' && symbol.kind === 'class')
    ) {
      const info = this.unresolvedTypeInfo()
      info.valueType = 'object'

      return info
    }

    return this.resolveDeclaredType(name, loc)
  }

  cloneResolvedTypeInfo(info: ResolvedTypeInfo): ResolvedTypeInfo {
    return {
      valueType: info.valueType,
      nullable: info.nullable,
      functionType: info.functionType,
      shape: info.shape,
      arrayElementType: info.arrayElementType,
      arrayElementDeclaredType: info.arrayElementDeclaredType,
      arrayElementFunctionType: info.arrayElementFunctionType ?? null,
      mapKeyType: info.mapKeyType,
      mapValueType: info.mapValueType,
      mapValueShape: info.mapValueShape,
      promiseValueType: info.promiseValueType,
      setElementType: info.setElementType
    }
  }

  unresolvedTypeInfo(): ResolvedTypeInfo {
    return {
      valueType: 'unknown',
      nullable: false,
      functionType: null,
      shape: null,
      arrayElementType: null,
      arrayElementDeclaredType: null,
      mapKeyType: null,
      mapValueType: null,
      mapValueShape: null,
      promiseValueType: null,
      setElementType: null
    }
  }

  resolveExpressionArrayElementType(expression: AnyNode | null | undefined): ValueType | null {
    if (expression === null || typeof expression === 'undefined') {
      return null
    }

    if (expression.type === 'ArrayLiteral') {
      if (expression.arrayElementType !== null && typeof expression.arrayElementType !== 'undefined') {
        return expression.arrayElementType
      }

      return null
    }

    if (expression.type === 'CallExpression') {
      if (expression.arrayElementType !== null && typeof expression.arrayElementType !== 'undefined') {
        return expression.arrayElementType
      }

      return null
    }

    if (expression.type === 'AwaitExpression') {
      if (expression.arrayElementType !== null && typeof expression.arrayElementType !== 'undefined') {
        return expression.arrayElementType
      }

      return null
    }

    if (expression.type === 'Reference' && expression.path.length === 1) {
      const name = firstPathSegment(expression.path)
      const symbol = this.scope.resolve(name)

      if (
        symbol !== null &&
        typeof symbol !== 'undefined' &&
        symbol.arrayElementType !== null &&
        typeof symbol.arrayElementType !== 'undefined'
      ) {
        return symbol.arrayElementType
      }

      return null
    }

    if (expression.type === 'MemberExpression') {
      const shape = this.resolveExpressionShape(expression.object)
      let field: AnyNode | null = null

      if (shape !== null && typeof shape !== 'undefined') {
        field = this.findShapeField(shape, expression.property)
      }

      if (
        field !== null &&
        typeof field !== 'undefined' &&
        field.arrayElementType !== null &&
        typeof field.arrayElementType !== 'undefined'
      ) {
        return field.arrayElementType
      }

      return null
    }

    if (expression.type === 'IndexExpression' && expression.index.type === 'StringLiteral') {
      const shape = this.resolveExpressionShape(expression.object)
      let field: AnyNode | null = null

      if (shape !== null && typeof shape !== 'undefined') {
        field = this.findShapeField(shape, expression.index.value)
      }

      if (
        field !== null &&
        typeof field !== 'undefined' &&
        field.arrayElementType !== null &&
        typeof field.arrayElementType !== 'undefined'
      ) {
        return field.arrayElementType
      }

      return null
    }

    return null
  }

  resolveExpressionArrayElementDeclaredType(expression: AnyNode | null | undefined): string | null {
    if (expression === null || typeof expression === 'undefined') {
      return null
    }

    if (expression.type === 'ArrayLiteral' || expression.type === 'CallExpression') {
      if (expression.arrayElementDeclaredType !== null && typeof expression.arrayElementDeclaredType !== 'undefined') {
        return expression.arrayElementDeclaredType
      }

      if (expression.arrayElementType !== null && typeof expression.arrayElementType !== 'undefined') {
        return expression.arrayElementType
      }

      return null
    }

    if (expression.type === 'AwaitExpression') {
      if (expression.arrayElementDeclaredType !== null && typeof expression.arrayElementDeclaredType !== 'undefined') {
        return expression.arrayElementDeclaredType
      }

      if (expression.arrayElementType !== null && typeof expression.arrayElementType !== 'undefined') {
        return expression.arrayElementType
      }

      return null
    }

    if (expression.type === 'Reference' && expression.path.length === 1) {
      const name = firstPathSegment(expression.path)
      const symbol = this.scope.resolve(name)

      if (
        symbol !== null &&
        typeof symbol !== 'undefined' &&
        symbol.arrayElementDeclaredType !== null &&
        typeof symbol.arrayElementDeclaredType !== 'undefined'
      ) {
        return symbol.arrayElementDeclaredType
      }

      if (
        symbol !== null &&
        typeof symbol !== 'undefined' &&
        symbol.arrayElementType !== null &&
        typeof symbol.arrayElementType !== 'undefined'
      ) {
        return symbol.arrayElementType
      }

      return null
    }

    if (expression.type === 'MemberExpression') {
      const shape = this.resolveExpressionShape(expression.object)
      let field: AnyNode | null = null

      if (shape !== null && typeof shape !== 'undefined') {
        field = this.findShapeField(shape, expression.property)
      }

      if (
        field !== null &&
        typeof field !== 'undefined' &&
        field.arrayElementDeclaredType !== null &&
        typeof field.arrayElementDeclaredType !== 'undefined'
      ) {
        return field.arrayElementDeclaredType
      }

      if (
        field !== null &&
        typeof field !== 'undefined' &&
        field.arrayElementType !== null &&
        typeof field.arrayElementType !== 'undefined'
      ) {
        return field.arrayElementType
      }

      return null
    }

    if (expression.type === 'IndexExpression' && expression.index.type === 'StringLiteral') {
      const shape = this.resolveExpressionShape(expression.object)
      let field: AnyNode | null = null

      if (shape !== null && typeof shape !== 'undefined') {
        field = this.findShapeField(shape, expression.index.value)
      }

      if (
        field !== null &&
        typeof field !== 'undefined' &&
        field.arrayElementDeclaredType !== null &&
        typeof field.arrayElementDeclaredType !== 'undefined'
      ) {
        return field.arrayElementDeclaredType
      }

      if (
        field !== null &&
        typeof field !== 'undefined' &&
        field.arrayElementType !== null &&
        typeof field.arrayElementType !== 'undefined'
      ) {
        return field.arrayElementType
      }

      return null
    }

    return null
  }

  resolveExpressionArrayElementFunctionType(expression: AnyNode | null | undefined): FunctionTypeMetadata | null {
    if (expression === null || typeof expression === 'undefined') {
      return null
    }

    if (
      expression.type === 'ArrayLiteral' ||
      expression.type === 'CallExpression' ||
      expression.type === 'AwaitExpression'
    ) {
      if (
        expression.arrayElementFunctionType !== null &&
        typeof expression.arrayElementFunctionType !== 'undefined'
      ) {
        return expression.arrayElementFunctionType
      }

      return null
    }

    if (expression.type === 'Reference' && expression.path.length === 1) {
      const name = firstPathSegment(expression.path)
      const symbol = this.scope.resolve(name)

      if (
        symbol !== null &&
        typeof symbol !== 'undefined' &&
        symbol.arrayElementFunctionType !== null &&
        typeof symbol.arrayElementFunctionType !== 'undefined'
      ) {
        return symbol.arrayElementFunctionType
      }

      return null
    }

    if (expression.type === 'MemberExpression') {
      const shape = this.resolveExpressionShape(expression.object)
      let field: AnyNode | null = null

      if (shape !== null && typeof shape !== 'undefined') {
        field = this.findShapeField(shape, expression.property)
      }

      if (field !== null && typeof field !== 'undefined') {
        const fieldType = this.resolveFieldDeclaredType(field)

        return resolvedFunctionTypeMetadata(field.arrayElementFunctionType, fieldType.arrayElementFunctionType)
      }

      return null
    }

    if (expression.type === 'IndexExpression' && expression.index.type === 'StringLiteral') {
      const shape = this.resolveExpressionShape(expression.object)
      let field: AnyNode | null = null

      if (shape !== null && typeof shape !== 'undefined') {
        field = this.findShapeField(shape, expression.index.value)
      }

      if (field !== null && typeof field !== 'undefined') {
        const fieldType = this.resolveFieldDeclaredType(field)

        return resolvedFunctionTypeMetadata(field.arrayElementFunctionType, fieldType.arrayElementFunctionType)
      }

      return null
    }

    return null
  }

  resolveExpressionMapType(expression: AnyNode | null | undefined): CheckerMapType | null {
    if (expression === null || typeof expression === 'undefined') {
      return null
    }

    if (expression.type === 'CallExpression' || expression.type === 'NewExpression') {
      if (expression.valueType === 'map') {
        let key: ValueType | null = null
        let value: ValueType | null = null
        let valueShape: ObjectShapeInfo | null = null

        if (expression.mapKeyType !== null && typeof expression.mapKeyType !== 'undefined') {
          key = expression.mapKeyType
        }

        if (expression.mapValueType !== null && typeof expression.mapValueType !== 'undefined') {
          value = expression.mapValueType
        }

        if (expression.mapValueShape !== null && typeof expression.mapValueShape !== 'undefined') {
          valueShape = expression.mapValueShape
        }

        return {
          key,
          value,
          valueShape
        }
      }

      return null
    }

    if (expression.type === 'Reference' && expression.path.length === 1) {
      const name = firstPathSegment(expression.path)
      const symbol = this.scope.resolve(name)

      if (symbol !== null && typeof symbol !== 'undefined' && symbol.valueType === 'map') {
        let key: ValueType | null = null
        let value: ValueType | null = null
        let valueShape: ObjectShapeInfo | null = null

        if (symbol.mapKeyType !== null && typeof symbol.mapKeyType !== 'undefined') {
          key = symbol.mapKeyType
        }

        if (symbol.mapValueType !== null && typeof symbol.mapValueType !== 'undefined') {
          value = symbol.mapValueType
        }

        if (symbol.mapValueShape !== null && typeof symbol.mapValueShape !== 'undefined') {
          valueShape = symbol.mapValueShape
        }

        return {
          key,
          value,
          valueShape
        }
      }

      return null
    }

    if (expression.type === 'MemberExpression') {
      const shape = this.resolveExpressionShape(expression.object)
      let field: AnyNode | null = null

      if (shape !== null && typeof shape !== 'undefined') {
        field = this.findShapeField(shape, expression.property)
      }

      if (field !== null && typeof field !== 'undefined' && field.valueType === 'map') {
        let key: ValueType | null = null
        let value: ValueType | null = null
        let valueShape: ObjectShapeInfo | null = null

        if (field.mapKeyType !== null && typeof field.mapKeyType !== 'undefined') {
          key = field.mapKeyType
        }

        if (field.mapValueType !== null && typeof field.mapValueType !== 'undefined') {
          value = field.mapValueType
        }

        if (field.mapValueShape !== null && typeof field.mapValueShape !== 'undefined') {
          valueShape = field.mapValueShape
        }

        return {
          key,
          value,
          valueShape
        }
      }

      return null
    }

    if (expression.type === 'IndexExpression' && expression.index.type === 'StringLiteral') {
      const shape = this.resolveExpressionShape(expression.object)
      let field: AnyNode | null = null

      if (shape !== null && typeof shape !== 'undefined') {
        field = this.findShapeField(shape, expression.index.value)
      }

      if (field !== null && typeof field !== 'undefined' && field.valueType === 'map') {
        let key: ValueType | null = null
        let value: ValueType | null = null
        let valueShape: ObjectShapeInfo | null = null

        if (field.mapKeyType !== null && typeof field.mapKeyType !== 'undefined') {
          key = field.mapKeyType
        }

        if (field.mapValueType !== null && typeof field.mapValueType !== 'undefined') {
          value = field.mapValueType
        }

        if (field.mapValueShape !== null && typeof field.mapValueShape !== 'undefined') {
          valueShape = field.mapValueShape
        }

        return {
          key,
          value,
          valueShape
        }
      }

      return null
    }

    return null
  }

  resolveExpressionSetElementType(expression: AnyNode | null | undefined): ValueType | null {
    if (expression === null || typeof expression === 'undefined') {
      return null
    }

    if (expression.type === 'CallExpression' || expression.type === 'NewExpression') {
      if (
        expression.valueType === 'set' &&
        expression.setElementType !== null &&
        typeof expression.setElementType !== 'undefined'
      ) {
        return expression.setElementType
      }

      return null
    }

    if (expression.type === 'Reference' && expression.path.length === 1) {
      const name = firstPathSegment(expression.path)
      const symbol = this.scope.resolve(name)

      if (
        symbol !== null &&
        typeof symbol !== 'undefined' &&
        symbol.valueType === 'set' &&
        symbol.setElementType !== null &&
        typeof symbol.setElementType !== 'undefined'
      ) {
        return symbol.setElementType
      }

      return null
    }

    if (expression.type === 'MemberExpression') {
      const shape = this.resolveExpressionShape(expression.object)
      let field: AnyNode | null = null

      if (shape !== null && typeof shape !== 'undefined') {
        field = this.findShapeField(shape, expression.property)
      }

      if (
        field !== null &&
        typeof field !== 'undefined' &&
        field.valueType === 'set' &&
        field.setElementType !== null &&
        typeof field.setElementType !== 'undefined'
      ) {
        return field.setElementType
      }

      return null
    }

    if (expression.type === 'IndexExpression' && expression.index.type === 'StringLiteral') {
      const shape = this.resolveExpressionShape(expression.object)
      let field: AnyNode | null = null

      if (shape !== null && typeof shape !== 'undefined') {
        field = this.findShapeField(shape, expression.index.value)
      }

      if (
        field !== null &&
        typeof field !== 'undefined' &&
        field.valueType === 'set' &&
        field.setElementType !== null &&
        typeof field.setElementType !== 'undefined'
      ) {
        return field.setElementType
      }

      return null
    }

    return null
  }

  resolveExpressionPromiseValueType(expression: AnyNode | null | undefined): ValueType | null {
    if (expression === null || typeof expression === 'undefined') {
      return null
    }

    if (expression.type === 'CallExpression' || expression.type === 'NewExpression') {
      if (
        expression.valueType === 'promise' &&
        expression.promiseValueType !== null &&
        typeof expression.promiseValueType !== 'undefined'
      ) {
        return expression.promiseValueType
      }

      return null
    }

    if (expression.type === 'Reference' && expression.path.length === 1) {
      const name = firstPathSegment(expression.path)
      const symbol = this.scope.resolve(name)

      if (
        symbol !== null &&
        typeof symbol !== 'undefined' &&
        symbol.valueType === 'promise' &&
        symbol.promiseValueType !== null &&
        typeof symbol.promiseValueType !== 'undefined'
      ) {
        return symbol.promiseValueType
      }

      return null
    }

    if (expression.type === 'MemberExpression') {
      const shape = this.resolveExpressionShape(expression.object)
      let field: AnyNode | null = null

      if (shape !== null && typeof shape !== 'undefined') {
        field = this.findShapeField(shape, expression.property)
      }

      if (
        field !== null &&
        typeof field !== 'undefined' &&
        field.valueType === 'promise' &&
        field.promiseValueType !== null &&
        typeof field.promiseValueType !== 'undefined'
      ) {
        return field.promiseValueType
      }

      return null
    }

    if (expression.type === 'IndexExpression' && expression.index.type === 'StringLiteral') {
      const shape = this.resolveExpressionShape(expression.object)
      let field: AnyNode | null = null

      if (shape !== null && typeof shape !== 'undefined') {
        field = this.findShapeField(shape, expression.index.value)
      }

      if (
        field !== null &&
        typeof field !== 'undefined' &&
        field.valueType === 'promise' &&
        field.promiseValueType !== null &&
        typeof field.promiseValueType !== 'undefined'
      ) {
        return field.promiseValueType
      }

      return null
    }

    return null
  }

  resolveExpressionPromiseRejectionValueType(expression: AnyNode | null | undefined): ValueType | null {
    if (expression === null || typeof expression === 'undefined') {
      return null
    }

    if (expression.type === 'CallExpression' || expression.type === 'NewExpression') {
      if (
        expression.valueType === 'promise' &&
        expression.promiseRejectionValueType !== null &&
        typeof expression.promiseRejectionValueType !== 'undefined'
      ) {
        return expression.promiseRejectionValueType
      }

      return null
    }

    if (expression.type === 'MemberExpression') {
      const objectRejectionValueType = this.resolveExpressionPromiseRejectionValueType(expression.object)

      if (objectRejectionValueType !== null && typeof objectRejectionValueType !== 'undefined') {
        return objectRejectionValueType
      }
    }

    return null
  }

  resolveRejectedExpressionValueType(expression: AnyNode | null | undefined): ValueType {
    if (expression === null || typeof expression === 'undefined') {
      return 'unknown'
    }

    if (this.isErrorObjectExpression(expression)) {
      return 'error'
    }

    if (expression.valueType === 'string') {
      return 'string'
    }

    return 'unknown'
  }

  isErrorObjectExpression(expression: AnyNode): boolean {
    if (
      expression.type === 'NewExpression' &&
      expression.callee !== null &&
      typeof expression.callee !== 'undefined' &&
      expression.callee.type === 'Reference' &&
      expression.callee.path.length === 1 &&
      firstPathSegment(expression.callee.path) === 'Error'
    ) {
      return true
    }

    const shape = this.resolveExpressionShape(expression)

    return shape === errorObjectShape
  }

  declare(name: string, symbol: SymbolInfo, loc: SourceLocation): void {
    if (this.scope.hasOwn(name)) {
      this.report('INOX_REDECLARED_NAME', `name ${name} is already declared in this scope`, loc)
      return
    }

    this.scope.bindings.set(name, symbol)
    deleteNullableNarrowingKey(this.narrowedNullableNames, name)
  }

  pushScope(): CheckerScopeState {
    const previous = {
      scope: this.scope,
      narrowedNullableNames: this.narrowedNullableNames
    }

    this.scope = new CheckerScope(previous.scope)
    this.narrowedNullableNames = cloneStringSet(previous.narrowedNullableNames)

    return previous
  }

  restoreScope(previous: CheckerScopeState): void {
    this.scope = previous.scope
    this.narrowedNullableNames = previous.narrowedNullableNames
  }

  restoreScopeWithOuterNarrowing(previous: CheckerScopeState): void {
    const currentScope = this.scope
    const currentNarrowedNames = this.narrowedNullableNames
    const restoredNarrowedNames: Set<string> = new Set()

    for (const name of previous.narrowedNullableNames) {
      const rootName = this.narrowingRootName(name)

      if (currentScope.hasOwn(rootName)) {
        restoredNarrowedNames.add(name)
      }
    }

    for (const name of currentNarrowedNames) {
      const rootName = this.narrowingRootName(name)

      if (!currentScope.hasOwn(rootName)) {
        restoredNarrowedNames.add(name)
      }
    }

    this.scope = previous.scope
    this.narrowedNullableNames = restoredNarrowedNames
  }

  narrowingRootName(name: string): string {
    const dotIndex = name.indexOf('.')

    if (dotIndex < 0) {
      return name
    }

    return name.slice(0, dotIndex)
  }

  pushReturnContext(
    returnType: ValueType,
    returnNullable: boolean,
    returnPromiseValueType: ValueType | null
  ): CheckerReturnContextState {
    const previous = {
      returnType: this.currentReturnType,
      returnNullable: this.currentReturnNullable,
      returnPromiseValueType: this.currentReturnPromiseValueType,
      returnAsync: this.currentReturnAsync
    }

    this.currentReturnType = returnType
    this.currentReturnNullable = returnNullable
    this.currentReturnPromiseValueType = returnPromiseValueType
    this.currentReturnAsync = false

    return previous
  }

  restoreReturnContext(previous: CheckerReturnContextState): void {
    this.currentReturnType = previous.returnType
    this.currentReturnNullable = previous.returnNullable
    this.currentReturnPromiseValueType = previous.returnPromiseValueType
    this.currentReturnAsync = previous.returnAsync
  }

  pushBreakable(): CheckerLoopDepthState {
    const previous = {
      breakDepth: this.breakDepth,
      continueDepth: this.continueDepth
    }

    this.breakDepth = this.breakDepth + 1

    return previous
  }

  pushLoop(): CheckerLoopDepthState {
    const previous = {
      breakDepth: this.breakDepth,
      continueDepth: this.continueDepth
    }

    this.breakDepth = this.breakDepth + 1
    this.continueDepth = this.continueDepth + 1

    return previous
  }

  restoreLoopDepth(previous: CheckerLoopDepthState): void {
    this.breakDepth = previous.breakDepth
    this.continueDepth = previous.continueDepth
  }

  checkAssignableType(
    actual: ValueType | null | undefined,
    expected: ValueType | null | undefined,
    loc: SourceLocation,
    expectedNullable?: boolean,
    actualNullable?: boolean
  ): void {
    const expectedAllowsNull = expectedNullable === true
    const actualCanBeNull = actualNullable === true

    if (!isAssignableType(actual, expected, expectedAllowsNull, actualCanBeNull)) {
      let actualLabel = actual

      if (
        actualCanBeNull &&
        actual !== 'null' &&
        actual !== 'unknown' &&
        actual !== null &&
        typeof actual !== 'undefined'
      ) {
        actualLabel = `${actual} | null`
      }

      this.report('INOX_TYPE_MISMATCH', `cannot assign ${actualLabel} to ${expected}`, loc)
    }
  }

  report(code: string, message: string, loc: SourceLocation): void {
    const item = diagnostic(code, message, loc)
    const diagnostics = this.diagnostics
    diagnostics.push(item)
  }
}

function joinStrings(values: readonly string[], separator: string): string {
  let result = ''

  for (let index = 0; index < values.length; index = index + 1) {
    if (index > 0) {
      result = result + separator
    }

    result = result + values[index]
  }

  return result
}

function mergeShapeFields(target: AnyNode[], source: AnyNode[] | null | undefined): void {
  if (source === null || typeof source === 'undefined') {
    return
  }

  for (const field of source) {
    let existingIndex = -1

    for (let index = 0; index < target.length; index = index + 1) {
      if (target[index].name === field.name) {
        existingIndex = index
        break
      }
    }

    if (existingIndex >= 0) {
      target[existingIndex] = field
    } else {
      target.push(field)
    }
  }
}

function isConditionValueType(valueType: ValueType): boolean {
  return (
    valueType === 'boolean' ||
    valueType === 'number' ||
    valueType === 'unknown' ||
    valueType === 'regexp' ||
    valueType === 'string' ||
    valueType === 'object' ||
    valueType === 'array' ||
    valueType === 'bytes' ||
    valueType === 'map' ||
    valueType === 'set' ||
    valueType === 'promise' ||
    valueType === 'function' ||
    valueType === 'timer'
  )
}

function regexpFlags(expression: AnyNode): string {
  const flags = expression.flags

  if (typeof flags === 'string') {
    return flags
  }

  return ''
}

function isNonNullNarrowingLiteral(expression: AnyNode): boolean {
  return (
    expression.type === 'StringLiteral' || expression.type === 'NumberLiteral' || expression.type === 'BooleanLiteral'
  )
}

function isStringTrimMethod(method: string | null): boolean {
  return (
    method === 'trim' ||
    method === 'trimEnd' ||
    method === 'trimLeft' ||
    method === 'trimRight' ||
    method === 'trimStart'
  )
}

function stringPredicateArgCountMessage(method: string, actual: number): string {
  if (method === 'includes') {
    return `string.includes expects 1 or 2 argument(s), got ${actual}`
  }

  return `string.${method} expects 1 argument(s), got ${actual}`
}

function isConsoleMethod(name: string): boolean {
  return name === 'log' || name === 'info' || name === 'warn' || name === 'error'
}

function isRelativeImportSource(source: string): boolean {
  return source.startsWith('./') || source.startsWith('../')
}

function isPromiseMethod(name: string): boolean {
  return name === 'catch' || name === 'then'
}

function promiseExecutorFunctionType(): AnyNode {
  return {
    kind: 'function',
    params: [
      {
        name: 'resolve',
        valueType: 'function',
        functionType: promiseSettlementFunctionType()
      },
      {
        name: 'reject',
        valueType: 'function',
        functionType: promiseSettlementFunctionType()
      }
    ],
    returnType: 'void',
    returnNullable: false
  }
}

function promiseSettlementFunctionType(): AnyNode {
  return {
    kind: 'function',
    params: [
      {
        name: 'value',
        loc: { line: 1, column: 1 },
        optional: true,
        valueType: 'unknown'
      }
    ],
    returnType: 'void',
    returnNullable: false
  }
}

function promiseStaticMethodName(callee: AnyNode): string | null {
  if (callee.type !== 'MemberExpression') {
    return null
  }

  if (callee.property !== 'resolve' && callee.property !== 'reject') {
    return null
  }

  if (callee.object.type !== 'Reference') {
    return null
  }

  if (callee.object.path.length !== 1) {
    return null
  }

  if (firstPathSegment(callee.object.path) !== 'Promise') {
    return null
  }

  return callee.property
}
