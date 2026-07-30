import { commonValueType } from './assignability.ts'
import { compilerAnyNodeSyntaxChildFields } from '../any-node-fields.ts'
import { expressionNarrowingPath } from '../member-paths.ts'
import type { TypeRef } from '../extensions/types.ts'
import type { AnyNode, ObjectShapeInfo, ProgramNode, SourceLocation, TypeAliasInfo, ValueType } from '../types.ts'

export type ResolvedTypeInfo = {
  valueType: ValueType
  nullable: boolean
  typeRef: TypeRef | null
  functionType: FunctionTypeMetadata | null
  shape: ObjectShapeInfo | null
  asyncResultValueType: ValueType | null
}

export type ResolvedTypeInfoValueKind = number

export const resolvedAsyncResultValueTypeKind: ResolvedTypeInfoValueKind = 0

export type OwnershipGraphEdge = {
  from: string
  to: string
  field: string
  loc: SourceLocation
}

export type OptionalParamInfo = {
  optional?: boolean
  rest?: boolean
  [key: string]: unknown
}

export type AsyncResultCallbackParamMetadata = {
  shape: ObjectShapeInfo | null
}

export type CheckerNode = AnyNode
export type NullableNode = AnyNode | null
export type TypeAliasDeclarationNode = AnyNode & {
  name: string
  loc: SourceLocation
  typeParameters?: AnyNode[]
  valueType: TypeAliasInfo
}
export type CheckerObjectPropertyNode = CheckerNode & {
  key: string
  loc: SourceLocation
  value: CheckerNode
}

export type FunctionTypeParamMetadata = {
  name: string
  loc: SourceLocation
  optional?: boolean
  rest?: boolean
  declaredType?: string
  valueType: ValueType
  typeRef?: TypeRef | null
  nullable?: boolean
  asyncResultValueType?: ValueType | null
  functionType?: FunctionTypeMetadata | null
  functionTypeOwnership?: 'weak'
  shape?: ObjectShapeInfo | null
  [key: string]: any
}

export type FunctionTypeMetadata = {
  kind?: string
  resolved: boolean
  params: FunctionTypeParamMetadata[]
  returnType: ValueType
  returnTypeRef?: TypeRef | null
  declaredReturnType?: string
  returnNullable: boolean
  returnAsyncResultValueType?: ValueType | null
  returnShape?: ObjectShapeInfo | null
  loc?: SourceLocation
  [key: string]: any
}

export type NullableConditionNarrowing = {
  trueNames: string[]
  falseNames: string[]
}

export type ObjectShapeBases = {
  builtin: string | null
  dynamic: boolean
  dynamicField: AnyNode | null
  fields: AnyNode[]
}

export type CheckProgramResult = {
  ast: ProgramNode
}

export type RuntimeCallInfo = {
  method: string
  label: string
  unsupported: boolean
}

export type AnyNodeFieldOptions = {
  shape?: ObjectShapeInfo | null
}

export function isAnyNodeChildFieldName(name: string): boolean {
  return compilerAnyNodeSyntaxChildFields.includes(name)
}

export function isUnsupportedEqualityOperator(operator: string): boolean {
  return operator.length === 2 && (operator[0] === '=' || operator[0] === '!') && operator[1] === '='
}

export function anyNodeResolvedTypeInfo(loc: SourceLocation): ResolvedTypeInfo {
  return {
    valueType: 'object',
    nullable: false,
    typeRef: null,
    functionType: null,
    shape: anyNodeObjectShape(loc),
    asyncResultValueType: null
  }
}

export function anyNodeObjectShape(loc: SourceLocation): ObjectShapeInfo {
  const objectShapeMetadata = objectShapeInfoMetadataShape(loc)

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
      anyNodeField('path', 'unknown', 'array<string>', false, loc),
      anyNodeField('args', 'unknown', 'array<AnyNode>', false, loc),
      anyNodeField('bindingElements', 'unknown', 'array<AnyNode>', false, loc),
      anyNodeField('expressions', 'unknown', 'array<AnyNode>', false, loc),
      anyNodeField('params', 'unknown', 'array<AnyNode>', false, loc),
      anyNodeField('baseTypes', 'unknown', 'array<string>', true, loc),
      anyNodeField('typeArguments', 'unknown', 'array<string>', false, loc),
      anyNodeField('typeParameters', 'unknown', 'array<AnyNode>', false, loc),
      anyNodeField('methods', 'unknown', 'array<AnyNode>', false, loc),
      anyNodeField('classMethods', 'unknown', 'array<AnyNode>', true, loc),
      anyNodeField('constructorParams', 'unknown', 'array<AnyNode>', true, loc),
      anyNodeField('fields', 'unknown', 'array<AnyNode>', false, loc),
      anyNodeField('indexSignatures', 'unknown', 'array<AnyNode>', false, loc),
      anyNodeField('properties', 'unknown', 'array<AnyNode>', false, loc),
      anyNodeField('elements', 'unknown', 'array<AnyNode>', false, loc),
      anyNodeField('cases', 'unknown', 'array<AnyNode>', false, loc),
      anyNodeField('narrowingFalseNames', 'unknown', 'array<string>', false, loc),
      anyNodeField('narrowingTrueNames', 'unknown', 'array<string>', false, loc),
      anyNodeField('specifiers', 'unknown', 'array<AnyNode>', false, loc),
      anyNodeField('body', 'unknown', null, false, loc),
      anyNodeField('callee', 'unknown', null, false, loc),
      anyNodeField('expression', 'unknown', null, false, loc),
      anyNodeField('init', 'unknown', null, false, loc),
      anyNodeField('target', 'unknown', null, false, loc),
      anyNodeField('value', 'unknown', null, false, loc),
      anyNodeField('literalValue', 'unknown', null, true, loc),
      anyNodeField('left', 'unknown', null, false, loc),
      anyNodeField('right', 'unknown', null, false, loc),
      anyNodeField('test', 'object', 'AnyNode', true, loc),
      anyNodeField('consequent', 'unknown', null, false, loc),
      anyNodeField('alternate', 'object', 'AnyNode', true, loc),
      anyNodeField('argument', 'unknown', null, false, loc),
      anyNodeField('block', 'unknown', null, false, loc),
      anyNodeField('object', 'unknown', null, false, loc),
      anyNodeField('index', 'unknown', null, false, loc),
      anyNodeField('handler', 'object', 'AnyNode', true, loc),
      anyNodeField('finalizer', 'object', 'AnyNode', true, loc),
      anyNodeField('param', 'string', null, true, loc),
      anyNodeField('paramLoc', 'object', null, true, loc, { shape: anyNodeLocObjectShape(loc) }),
      anyNodeField('bindingKind', 'string', null, true, loc),
      anyNodeField('bindingLoc', 'object', null, true, loc, { shape: anyNodeLocObjectShape(loc) }),
      anyNodeField('inline', 'boolean', null, true, loc),
      anyNodeField('inlineLoc', 'object', null, true, loc, { shape: anyNodeLocObjectShape(loc) }),
      anyNodeField('expressionBody', 'boolean', null, false, loc),
      anyNodeField('default', 'boolean', null, true, loc),
      anyNodeField('nullable', 'boolean', null, true, loc),
      anyNodeField('typeOnly', 'boolean', null, false, loc),
      anyNodeField('templatePlaceholder', 'boolean', null, true, loc),
      anyNodeField('property', 'string', null, false, loc),
      anyNodeField('operator', 'string', null, false, loc),
      anyNodeField('raw', 'string', null, false, loc),
      anyNodeField('pattern', 'string', null, false, loc),
      anyNodeField('flags', 'string', null, false, loc),
      anyNodeField('declaredType', 'string', null, true, loc),
      anyNodeField('declaredName', 'string', null, true, loc),
      anyNodeField('typeRef', 'object', null, true, loc),
      anyNodeField('runtimeTypeAlternatives', 'unknown', 'array<AnyNode>', true, loc),
      anyNodeField('valueType', 'string', null, true, loc),
      anyNodeField('constraint', 'string', null, true, loc),
      anyNodeField('asyncResultValueType', 'string', null, true, loc),
      anyNodeField('asyncResultRejectionValueType', 'string', null, true, loc),
      anyNodeField('asyncResultRejectionIntrinsicRole', 'string', null, true, loc),
      anyNodeField('propertyValueType', 'string', null, true, loc),
      anyNodeField('returnType', 'string', null, true, loc),
      anyNodeField('returnTypeRef', 'object', null, true, loc),
      anyNodeField('returnRuntimeTypeAlternatives', 'unknown', 'array<AnyNode>', true, loc),
      anyNodeField('declaredReturnType', 'string', null, true, loc),
      anyNodeField('returnAsyncResultValueType', 'string', null, true, loc),
      anyNodeField('returnNullable', 'boolean', null, false, loc),
      anyNodeField('returnShape', 'object', null, true, loc, { shape: objectShapeMetadata }),
      anyNodeField('functionType', 'object', null, true, loc),
      anyNodeField('functionOverloads', 'unknown', 'array<AnyNode>', true, loc),
      anyNodeField('shape', 'object', null, true, loc, { shape: objectShapeMetadata }),
      anyNodeField('rest', 'boolean', null, false, loc),
      anyNodeField('libraryBindingId', 'string', null, true, loc),
      anyNodeField('libraryOperationId', 'string', null, true, loc),
      anyNodeField('libraryAsyncResultOperation', 'string', null, true, loc),
      anyNodeField('libraryReceiverTypeId', 'string', null, true, loc),
      anyNodeField('libraryResultTypeId', 'string', null, true, loc),
      anyNodeField('libraryIntrinsicRole', 'string', null, true, loc),
      anyNodeField('libraryCCallStyle', 'string', null, true, loc),
      anyNodeField('libraryCFailureMode', 'string', null, true, loc),
      anyNodeField('libraryCResultMode', 'string', null, true, loc),
      anyNodeField('libraryCReceiverAdapter', 'string', null, true, loc),
      anyNodeField('libraryCResultAdapter', 'string', null, true, loc),
      anyNodeField('libraryCExpression', 'string', null, true, loc),
      anyNodeField('libraryCAwaitExpression', 'string', null, true, loc),
      anyNodeField('libraryCAsyncFulfillExpression', 'string', null, true, loc),
      anyNodeField('libraryCAsyncRejectExpression', 'string', null, true, loc),
      anyNodeField('libraryCClassFormatExpression', 'string', null, true, loc),
      anyNodeField('libraryCppType', 'string', null, true, loc),
      anyNodeField('libraryConstantValue', 'string', null, true, loc),
      anyNodeField('libraryCallbackLifetime', 'string', null, true, loc),
      anyNodeField('libraryOwned', 'boolean', null, false, loc),
      anyNodeField('libraryCPreservesPendingException', 'boolean', null, false, loc),
      anyNodeField('libraryCapabilities', 'unknown', 'array<string>', false, loc),
      anyNodeField('libraryCArgumentAdapters', 'unknown', 'array<string>', true, loc),
      anyNodeField('libraryCArgumentAdapterTypeIds', 'unknown', 'array<string>', true, loc),
      anyNodeField('libraryCArgumentKinds', 'unknown', 'array<string>', true, loc),
      anyNodeField('libraryCArgumentMethodNames', 'unknown', 'array<string>', true, loc),
      anyNodeField('libraryCArgumentSources', 'unknown', 'array<AnyNode>', true, loc),
      anyNodeField('libraryCResultShapeFields', 'unknown', 'array<string>', false, loc),
      anyNodeField('libraryRuntimeRequirements', 'unknown', 'array<string>', false, loc),
      anyNodeField('builtin', 'string', null, true, loc),
      anyNodeField('kind', 'string', null, true, loc),
      anyNodeField('ownership', 'string', null, true, loc),
      anyNodeField('libraryCIteratorMethod', 'string', null, true, loc),
      anyNodeField('libraryCIteratorNextMethod', 'string', null, true, loc),
      anyNodeField('libraryCIteratorDoneMember', 'string', null, true, loc),
      anyNodeField('libraryCIteratorValueMember', 'string', null, true, loc),
      anyNodeField('libraryCIteratorReceiverAdapter', 'string', null, true, loc),
      anyNodeField('libraryCIteratorValueAdapter', 'string', null, true, loc),
      anyNodeField('libraryCIteratorManagedValue', 'boolean', null, true, loc),
      anyNodeField('libraryCIteratorRangeBased', 'boolean', null, true, loc),
      anyNodeField('libraryCIteratorCreationFailureMode', 'string', null, true, loc),
      anyNodeField('libraryCIteratorNextFailureMode', 'string', null, true, loc),
      anyNodeField('libraryCIteratorPreservesPendingException', 'boolean', null, false, loc),
      anyNodeField('className', 'string', null, true, loc),
      anyNodeField('functionTypeOwnership', 'string', null, true, loc),
      anyNodeField('shapeOwnership', 'string', null, true, loc),
      anyNodeField('syntheticValueImportName', 'string', null, true, loc),
      anyNodeField('async', 'boolean', null, true, loc),
      anyNodeField('constructable', 'boolean', null, true, loc),
      anyNodeField('exported', 'boolean', null, true, loc),
      anyNodeField('optional', 'boolean', null, true, loc),
      anyNodeField('optionalChainProtected', 'boolean', null, true, loc),
      anyNodeField('readonly', 'boolean', null, true, loc),
      anyNodeField('readonlyField', 'boolean', null, true, loc),
      anyNodeField('resolved', 'boolean', null, true, loc),
      anyNodeField('spread', 'boolean', null, true, loc),
      anyNodeField('static', 'boolean', null, true, loc),
      anyNodeField('weakTypeValidated', 'boolean', null, true, loc),
      anyNodeField('condition', 'object', 'AnyNode', false, loc),
      anyNodeField('discriminant', 'object', 'AnyNode', false, loc),
      anyNodeField('defaultValue', 'object', 'AnyNode', true, loc),
      anyNodeField('dynamicField', 'object', 'AnyNode', true, loc),
      anyNodeField('libraryArgumentNarrowing', 'object', null, true, loc),
      anyNodeField('libraryRuntimeCallbackFunctionType', 'object', null, true, loc),
      anyNodeField('iterable', 'object', null, false, loc),
      anyNodeField('mapValueShape', 'object', null, true, loc),
      anyNodeField('staticLoc', 'object', null, false, loc, { shape: anyNodeLocObjectShape(loc) }),
      anyNodeField('update', 'object', 'AnyNode', false, loc)
    ]
  }
}

function objectShapeInfoMetadataShape(loc: SourceLocation): ObjectShapeInfo {
  return {
    kind: 'object',
    fields: [
      anyNodeField('kind', 'string', null, false, loc),
      anyNodeField('baseTypes', 'unknown', 'array<string>', true, loc),
      anyNodeField('builtin', 'string', null, true, loc),
      anyNodeField('dynamic', 'boolean', null, true, loc),
      anyNodeField('dynamicField', 'object', null, true, loc),
      anyNodeField('fields', 'unknown', 'array<AnyNode>', false, loc),
      anyNodeField('libraryTypeId', 'string', null, true, loc),
      anyNodeField('libraryCppType', 'string', null, true, loc)
    ]
  }
}

export function anyNodeLocObjectShape(loc: SourceLocation): ObjectShapeInfo {
  return {
    kind: 'object',
    fields: [
      anyNodeField('file', 'string', null, true, loc),
      anyNodeField('line', 'number', null, false, loc),
      anyNodeField('column', 'number', null, false, loc)
    ]
  }
}

export function anyNodeField(
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
    asyncResultValueType: null,
    functionType: null,
    shape: options.shape ?? null,
    loc
  }
}

export function cloneObjectShapeField(field: AnyNode): AnyNode {
  return {
    name: field.name,
    optional: field.optional === true,
    readonly: field.readonly === true,
    ownership: field.ownership ?? null,
    weakLoc: field.weakLoc ?? null,
    static: field.static === true,
    staticLoc: field.staticLoc ?? null,
    weakTypeValidated: field.weakTypeValidated === true,
    literalValue: field.literalValue ?? null,
    loc: field.loc,
    declaredType: field.declaredType ?? null,
    typeRef: field.typeRef ?? null,
    valueType: field.valueType ?? 'unknown',
    nullable: field.nullable === true,
    asyncResultValueType: field.asyncResultValueType ?? null,
    asyncResultRejectionValueType: field.asyncResultRejectionValueType ?? null,
    functionType: field.functionType ?? null,
    functionOverloads: field.functionOverloads ?? null,
    className: field.className ?? null,
    shape: field.shape ?? null,
    libraryCMember: field.libraryCMember ?? null,
    libraryCGetter: field.libraryCGetter ?? null,
    libraryCppType: field.libraryCppType ?? null
  }
}

export function resolvedValueTypeMetadata(
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

export function resolvedConcreteValueTypeMetadata(
  value: ValueType | null | undefined,
  fallback: ValueType | null | undefined
): ValueType {
  const resolved = resolvedValueTypeMetadata(value, fallback)

  if (resolved !== null && typeof resolved !== 'undefined') {
    return resolved
  }

  return 'unknown'
}

export function resolvedStringMetadata(
  value: string | null | undefined,
  fallback: string | null | undefined
): string | null {
  if (value !== null && typeof value !== 'undefined') {
    return value
  }

  if (fallback !== null && typeof fallback !== 'undefined') {
    return fallback
  }

  return null
}

export function firstPathSegment(path: readonly string[]): string {
  const first = path[0]

  if (typeof first === 'string') {
    return first
  }

  throw new Error('member path must not be empty')
}

export function nullableNarrowingKey(expression: AnyNode | null | undefined): string | null {
  return expressionNarrowingPath(expression)
}

export function isOptionalChainProtectedExpression(expression: AnyNode | null | undefined): boolean {
  if (expression === null || typeof expression === 'undefined') {
    return false
  }

  return expression.optionalChainProtected === true
}

export function resolvedObjectShapeMetadata(
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

export function resolvedFieldNullableMetadata(field: AnyNode, fieldType: ResolvedTypeInfo): boolean {
  if (field.ownership === 'weak') {
    return true
  }

  if (field.nullable === true) {
    return true
  }

  return fieldType.nullable
}

export function resolvedFunctionTypeMetadata(
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

export function nodeNameEquals(node: AnyNode, name: string): boolean {
  return node.name === name
}

export function nodeValueTypeOrUnknown(node: AnyNode): ValueType {
  const valueType = node.valueType

  if (valueType !== null && typeof valueType !== 'undefined') {
    return valueType
  }

  return 'unknown'
}

export function nodeDeclaredTypeOrValueType(node: AnyNode): string {
  const declaredType = node.declaredType

  if (declaredType !== null && typeof declaredType !== 'undefined') {
    return declaredType
  }

  return nodeValueTypeOrUnknown(node)
}

export function isOptionalParam(param: OptionalParamInfo): boolean {
  if (param.rest === true) {
    return true
  }

  if (param.optional === true) {
    return true
  }

  return param.defaultValue !== null && typeof param.defaultValue !== 'undefined'
}

export function conditionalExpressionValueType(consequentType: ValueType, alternateType: ValueType): ValueType {
  if (consequentType === alternateType) {
    return consequentType
  }

  if (consequentType === 'null') {
    return alternateType
  }

  if (alternateType === 'null') {
    return consequentType
  }

  if (consequentType === 'unknown' || alternateType === 'unknown') {
    return 'unknown'
  }

  return 'unknown'
}

export function stringSetFromArray(values: string[]): Set<string> {
  const result: Set<string> = new Set()

  for (let index = 0; index < values.length; index = index + 1) {
    result.add(values[index])
  }

  return result
}

export function cloneStringSet(values: Set<string>): Set<string> {
  return new Set(values)
}

export function deleteNullableNarrowingKey(values: Set<string>, key: string): void {
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

export function resolvedTypeListHasNullable(infos: ResolvedTypeInfo[]): boolean {
  for (let index = 0; index < infos.length; index = index + 1) {
    if (infos[index].nullable) {
      return true
    }
  }

  return false
}

export function commonResolvedAsyncResultValueType(infos: ResolvedTypeInfo[]): ValueType | null {
  return commonResolvedOptionalValueType(infos, resolvedAsyncResultValueTypeKind)
}

export function commonResolvedObjectShape(infos: ResolvedTypeInfo[]): ObjectShapeInfo | null {
  if (infos.length === 0) {
    return null
  }

  const fields: AnyNode[] = []

  for (let infoIndex = 0; infoIndex < infos.length; infoIndex = infoIndex + 1) {
    const info = infos[infoIndex]
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

export function commonResolvedObjectShapeField(name: string, infos: ResolvedTypeInfo[]): AnyNode | null {
  const fields: AnyNode[] = []
  const valueTypes: ValueType[] = []
  let nullable = false
  let optional = false
  let missing = false

  for (let index = 0; index < infos.length; index = index + 1) {
    const info = infos[index]
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

  if (valueTypes.length === 0 || fields.length === 0) {
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
    typeRef: commonResolvedObjectShapeFieldTypeRef(fields),
    valueType,
    nullable,
    asyncResultValueType: commonResolvedObjectShapeFieldAsyncResultValueType(fields),
    functionType: commonResolvedObjectShapeFieldFunctionType(fields),
    shape: commonResolvedObjectShapeFieldShape(fields)
  }
}

export function objectShapeFieldByName(shape: ObjectShapeInfo, name: string): AnyNode | null {
  const fields = shape.fields

  for (let index = 0; index < fields.length; index = index + 1) {
    const field = fields[index]

    if (field.name === name) {
      return field
    }
  }

  return null
}

export function commonResolvedObjectShapeFieldReadonly(fields: AnyNode[]): boolean {
  for (let index = 0; index < fields.length; index = index + 1) {
    if (fields[index].readonly !== true) {
      return false
    }
  }

  return fields.length > 0
}

export function commonResolvedObjectShapeFieldOwnership(fields: AnyNode[]): string | null {
  if (fields.length === 0) {
    return null
  }

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

export function commonResolvedObjectShapeFieldDeclaredType(fields: AnyNode[]): string | null {
  if (fields.length === 0) {
    return null
  }

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

export function commonResolvedObjectShapeFieldTypeRef(fields: AnyNode[]): TypeRef | null {
  if (fields.length === 0) {
    return null
  }

  const first = fields[0]
  const typeRef: TypeRef | null = first.typeRef ?? null

  if (typeRef === null) {
    return null
  }

  for (let index = 1; index < fields.length; index = index + 1) {
    const current: TypeRef | null = fields[index].typeRef ?? null

    if (current === null || !typeRefsEqual(typeRef, current)) {
      return null
    }
  }

  return typeRef
}

export function commonResolvedObjectShapeFieldAsyncResultValueType(fields: AnyNode[]): ValueType | null {
  const values: ValueType[] = []

  for (let index = 0; index < fields.length; index = index + 1) {
    const value = fields[index].asyncResultValueType

    if (value === null || typeof value === 'undefined') {
      return null
    }

    values.push(value)
  }

  return commonValueType(values)
}

export function commonResolvedObjectShapeFieldFunctionType(fields: AnyNode[]): FunctionTypeMetadata | null {
  if (fields.length === 0) {
    return null
  }

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

export function commonResolvedObjectShapeFieldShape(fields: AnyNode[]): ObjectShapeInfo | null {
  if (fields.length === 0) {
    return null
  }

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

export function resolvedTypeInfoValue(info: ResolvedTypeInfo, kind: ResolvedTypeInfoValueKind): ValueType | null {
  if (kind === resolvedAsyncResultValueTypeKind) {
    return info.asyncResultValueType ?? null
  }

  return null
}

export function commonResolvedOptionalValueType(
  infos: ResolvedTypeInfo[],
  kind: ResolvedTypeInfoValueKind
): ValueType | null {
  const values: ValueType[] = []

  for (let index = 0; index < infos.length; index = index + 1) {
    const info = infos[index]
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

function typeRefsEqual(left: TypeRef, right: TypeRef): boolean {
  if (left.kind !== right.kind) {
    return false
  }

  if (left.kind === 'parameter' && right.kind === 'parameter') {
    return left.name === right.name && left.nullable === right.nullable
  }

  if (left.kind === 'primitive' && right.kind === 'primitive') {
    return left.name === right.name && left.nullable === right.nullable && left.ownership === right.ownership
  }

  if (left.kind === 'nominal' && right.kind === 'nominal') {
    return (
      left.typeId === right.typeId &&
      left.nullable === right.nullable &&
      left.ownership === right.ownership &&
      typeRefListsEqual(left.args, right.args)
    )
  }

  if (left.kind === 'function' && right.kind === 'function') {
    return (
      left.nullable === right.nullable &&
      left.ownership === right.ownership &&
      typeRefListsEqual(left.params, right.params) &&
      typeRefsEqual(left.result, right.result)
    )
  }

  if (left.kind === 'object' && right.kind === 'object') {
    if (
      left.nullable !== right.nullable ||
      left.ownership !== right.ownership ||
      left.dynamic !== right.dynamic ||
      left.fields.length !== right.fields.length
    ) {
      return false
    }

    for (let index = 0; index < left.fields.length; index = index + 1) {
      const leftField = left.fields[index]
      const rightField = right.fields[index]

      if (rightField !== undefined) {
        if (
          leftField.name !== rightField.name ||
          leftField.readonly !== rightField.readonly ||
          leftField.optional !== rightField.optional ||
          !typeRefsEqual(leftField.typeRef, rightField.typeRef)
        ) {
          return false
        }

        continue
      }

      return false
    }

    if (left.dynamicField === null || typeof left.dynamicField === 'undefined') {
      return right.dynamicField === null || typeof right.dynamicField === 'undefined'
    }

    return (
      right.dynamicField !== null &&
      typeof right.dynamicField !== 'undefined' &&
      typeRefsEqual(left.dynamicField, right.dynamicField)
    )
  }

  return (
    left.kind === 'unknown' &&
    right.kind === 'unknown' &&
    left.nullable === right.nullable &&
    left.ownership === right.ownership
  )
}

function typeRefListsEqual(left: TypeRef[], right: TypeRef[]): boolean {
  if (left.length !== right.length) {
    return false
  }

  for (let index = 0; index < left.length; index = index + 1) {
    const rightTypeRef = right[index]

    if (rightTypeRef !== undefined) {
      if (!typeRefsEqual(left[index], rightTypeRef)) {
        return false
      }

      continue
    }

    return false
  }

  return true
}
