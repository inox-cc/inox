import {
  compilerLibraryAsyncResultOperationForIntrinsic,
  compilerLibraryNativeTypeForId,
  compilerLibraryNativeTypeForIntrinsic,
  compilerLibraryOperationForIntrinsic,
  resolveCompilerLibrarySet
} from '../../extensions/library-set.ts'
import { compilerLibraryIntrinsicResultMetadata } from '../../extensions/intrinsic-metadata.ts'
import {
  typeRefCompatibilityMetadata,
  typeRefDeclaredName,
  typeRefIterableElementDeclaredName,
  typeRefIterableElementValueType,
  typeRefTraitArgument
} from '../../extensions/type-ref-compatibility.ts'
import type {
  CompilerLibrarySet,
  IntrinsicRole,
  LibraryAsyncResultOperationKind,
  LibraryCSequenceMaterializationDescriptor,
  LibraryNativeIterationDescriptor,
  TypeRef
} from '../../extensions/types.ts'
import { genericTypeApplicationFromTypeName } from '../../type-names.ts'
import type { AnyNode, ObjectShapeInfo, SourceLocation } from '../../types.ts'
import { emitCIdentifier } from './identifiers.ts'
import {
  cCompilerLibrarySetValue,
  cOptionalCompilerLibrarySetValue,
  cTypeRefValue
} from './types.ts'
import type { CCompilerLibrarySet, CFunctionParam, CFunctionType, CObjectShape, CTypeRef } from './types.ts'

type CLibraryNativeShape = {
  builtin?: string | null
  libraryCValueAdapter?: string | null
  libraryCppType?: string | null
  libraryTypeId?: string | null
}

export type CValueTypeInput = string | null | undefined

export type CRuntimeValueAdapterInfo = {
  cppType: string
  failureMode: 'thrown' | null
  preservesPendingException: boolean
  valueExpression: string
}

export type CNullableScalarParam = {
  defaultValue?: object | null
  nullable?: boolean
  optional?: boolean
  rest?: boolean
  valueType?: string
}

export type CNullableScalarParamInput = CNullableScalarParam | null | undefined

type CNullableScalarParamRecord = {
  defaultValue?: object | null
  nullable: boolean
  optional?: boolean
  rest?: boolean
  valueType?: string
}

export type CRuntimeValueTag = string | null

export function cCallExpressionReturnsTypeErasedValue(expression: AnyNode | null | undefined): boolean {
  if (
    expression === null ||
    typeof expression === 'undefined' ||
    expression.type !== 'CallExpression' ||
    expression.callee === null ||
    typeof expression.callee === 'undefined'
  ) {
    return false
  }

  const functionType = expression.callee.functionType

  if (expression.callBoundaryReturnType === 'unknown') {
    return true
  }

  return functionType !== null && typeof functionType !== 'undefined' && functionType.returnType === 'unknown'
}

export function compilerLibraryIntrinsicSequenceMaterialization(
  libraries: CCompilerLibrarySet,
  role: IntrinsicRole
): LibraryCSequenceMaterializationDescriptor | null {
  return compilerLibraryOperationForIntrinsic(cCompilerLibrarySetValue(libraries), role, 'construct')
    ?.cSequenceMaterialization ?? null
}

export function cTypeRefDeclaredName(
  typeRef: CTypeRef | null | undefined,
  libraries: CCompilerLibrarySet
): string | null {
  return typeRefDeclaredName(cTypeRefValue(typeRef), cCompilerLibrarySetValue(libraries))
}

export function cIterableElementDeclaredName(
  typeRef: CTypeRef | null | undefined,
  libraries: CCompilerLibrarySet
): string | null {
  return typeRefIterableElementDeclaredName(cTypeRefValue(typeRef), cCompilerLibrarySetValue(libraries))
}

export function cIterableElementValueType(
  typeRef: CTypeRef | null | undefined,
  libraries: CCompilerLibrarySet
): string | null {
  return typeRefIterableElementValueType(cTypeRefValue(typeRef), cCompilerLibrarySetValue(libraries))
}

export function cTypeRefNativeShape(
  typeRef: CTypeRef | null | undefined,
  libraries: CCompilerLibrarySet
): CObjectShape | null {
  const resolvedTypeRef = cTypeRefValue(typeRef)

  if (resolvedTypeRef === null || resolvedTypeRef.kind !== 'nominal') {
    return null
  }

  const typeId = resolvedTypeRef.typeId

  if (typeId === null || typeof typeId === 'undefined' || typeId === '') {
    return null
  }

  const nativeType = compilerLibraryNativeTypeForId(cCompilerLibrarySetValue(libraries), typeId)

  if (nativeType === null) {
    return null
  }

  return {
    fields: [],
    libraryCValueAdapter: nativeType.cValueAdapter ?? null,
    libraryCppType: nativeType.cppType,
    libraryTypeId: nativeType.typeId
  }
}

export function cIterableElementFunctionType(
  typeRef: CTypeRef | null | undefined,
  libraries: CCompilerLibrarySet,
  loc: SourceLocation
): CFunctionType | null {
  const resolvedTypeRef = cTypeRefValue(typeRef)
  const resolvedLibraries = cCompilerLibrarySetValue(libraries)
  return cFunctionTypeFromTypeRef(
    typeRefTraitArgument(resolvedTypeRef, 'iterable', 0, resolvedLibraries),
    resolvedLibraries,
    loc
  )
}

export function cFunctionTypeFromTypeRef(
  typeRef: CTypeRef | null | undefined,
  libraries: CCompilerLibrarySet,
  loc: SourceLocation | null | undefined
): CFunctionType | null {
  const resolvedTypeRef = cTypeRefValue(typeRef)
  const resolvedLibraries = cCompilerLibrarySetValue(libraries)
  let sourceLocation: SourceLocation = { line: 1, column: 1 }

  if (loc !== null && typeof loc !== 'undefined') {
    sourceLocation = loc
  }

  if (resolvedTypeRef === null || resolvedTypeRef.kind !== 'function') {
    return null
  }

  const params: CFunctionParam[] = []

  for (let index = 0; index < resolvedTypeRef.params.length; index = index + 1) {
    const paramTypeRef = resolvedTypeRef.params[index]
    const metadata = cTypeRefMetadata(paramTypeRef, resolvedLibraries, sourceLocation)
    params.push({
      name: `arg${index}`,
      valueType: metadata.valueType,
      typeRef: paramTypeRef,
      nullable: metadata.nullable,
      declaredType: null,
      asyncResultValueType: metadata.asyncResultValueType,
      functionType: cFunctionTypeFromTypeRef(paramTypeRef, resolvedLibraries, loc),
      shape: metadata.shape
    })
  }

  const resultTypeRef = cTypeRefValue(resolvedTypeRef.result)

  if (resultTypeRef === null) {
    return null
  }

  const result = cTypeRefMetadata(resultTypeRef, resolvedLibraries, sourceLocation)

  return {
    kind: 'function',
    params,
    returnType: result.valueType,
    returnTypeRef: resultTypeRef,
    returnNullable: result.nullable,
    returnAsyncResultValueType: result.asyncResultValueType,
    returnShape: result.shape
  }
}

function cTypeRefMetadata(typeRef: TypeRef, libraries: CompilerLibrarySet, loc: SourceLocation): {
  valueType: string
  nullable: boolean
  asyncResultValueType: string | null
  shape: CFunctionParam['shape']
} {
  if (typeRef.kind === 'parameter') {
    return {
      valueType: 'unknown',
      nullable: typeRef.nullable === true,
      asyncResultValueType: null,
      shape: null
    }
  }

  const metadata = typeRefCompatibilityMetadata(typeRef, libraries, loc)

  return {
    valueType: metadata.valueType,
    nullable: metadata.nullable,
    asyncResultValueType: metadata.asyncResultValueType,
    shape: metadata.shape as CFunctionParam['shape']
  }
}

function isConcreteManagedRuntimeReturnType(valueType: CValueTypeInput): boolean {
  return (
    valueType === 'bytes' ||
    valueType === 'string' ||
    valueType === 'object'
  )
}

export function isManagedRuntimeReturnType(valueType: CValueTypeInput): boolean {
  return isConcreteManagedRuntimeReturnType(valueType)
}

export function isOpaqueRuntimeValueType(valueType: CValueTypeInput): boolean {
  if (valueType === null || typeof valueType === 'undefined' || valueType === 'unknown') {
    return false
  }

  if (isConcreteManagedRuntimeReturnType(valueType) || isNullableScalarType(valueType)) {
    return false
  }

  return (
    valueType !== 'void' &&
    valueType !== 'function' &&
    valueType !== 'async-result' &&
    valueType !== 'optional' &&
    valueType !== 'js-global'
  )
}

export function isNullableScalarType(valueType: CValueTypeInput): boolean {
  return valueType === 'number' || valueType === 'boolean' || valueType === 'string'
}

export function emitCType(valueType: CValueTypeInput): string {
  if (valueType === 'void') {
    return 'void'
  }

  if (isManagedRuntimeReturnType(valueType)) {
    return 'inox_value'
  }

  if (valueType === 'unknown') {
    return 'inox_value'
  }

  if (isOpaqueRuntimeValueType(valueType)) {
    return 'inox_value'
  }

  if (valueType === 'function') {
    return 'void*'
  }

  if (valueType === 'async-result') {
    return ''
  }

  if (valueType === 'boolean') {
    return 'bool'
  }

  return 'double'
}

export function libraryNativeCppType(shape: CLibraryNativeShape | null | undefined): string | null {
  const typeId = shape?.libraryTypeId
  const cppType = shape?.libraryCppType

  if (
    typeId === null ||
    typeof typeId === 'undefined' ||
    cppType === null ||
    typeof cppType === 'undefined' ||
    cppType === ''
  ) {
    return null
  }

  return cppType
}

export function libraryCppValueStorageType(
  nullable: boolean,
  shape: CLibraryNativeShape | null | undefined
): string | null {
  const cppType = shape?.libraryCppType

  if (nullable || cppType === null || typeof cppType === 'undefined' || cppType === '') {
    return null
  }

  return cppType
}

export function libraryNativeBoundaryCppType(
  valueType: CValueTypeInput,
  nullable: boolean,
  optional: boolean,
  shape: CLibraryNativeShape | null | undefined
): string | null {
  const adapter = shape?.libraryCValueAdapter
  const hasExplicitAdapter = adapter !== null && typeof adapter !== 'undefined' && adapter.length > 0

  if ((valueType !== 'object' && !hasExplicitAdapter) || nullable || optional) {
    return null
  }

  return libraryNativeCppType(shape)
}

export function libraryNativeValueAdapter(
  shape: CLibraryNativeShape | null | undefined
): string | null {
  return shape?.libraryCValueAdapter ?? null
}

export function applyLibraryNativeValueAdapter(value: string, adapter: string | null): string {
  if (adapter === null || adapter.length === 0) {
    return value
  }

  return adapter.split('$value').join(value)
}

export function cRuntimeValueAdapterInfo(
  valueType: CValueTypeInput,
  shape: CLibraryNativeShape | null | undefined,
  valueExpression: string,
  libraries: CCompilerLibrarySet | null | undefined
): CRuntimeValueAdapterInfo | null {
  if (valueType === 'string') {
    return {
      cppType: 'inox::String',
      failureMode: 'thrown',
      preservesPendingException: true,
      valueExpression: `inox::String(${valueExpression})`
    }
  }

  const cppType = libraryNativeCppType(shape)
  const adapter = libraryNativeValueAdapter(shape)
  const typeId = shape?.libraryTypeId

  if (cppType === null || adapter === null) {
    return null
  }

  return {
    cppType,
    failureMode: compilerLibraryNativeValueAdapterFailureModeForTypeId(libraries, typeId),
    preservesPendingException: compilerLibraryNativeValueAdapterPreservesPendingExceptionForTypeId(
      libraries,
      typeId
    ),
    valueExpression: applyLibraryNativeValueAdapter(valueExpression, adapter)
  }
}

export function compilerLibraryIntrinsicNativeCppType(
  libraries: CCompilerLibrarySet,
  role: IntrinsicRole
): string | null {
  return compilerLibraryNativeTypeForIntrinsic(cCompilerLibrarySetValue(libraries), role, 'construct')?.cppType ?? null
}

export function requireCompilerLibraryIntrinsicNativeCppType(
  libraries: CCompilerLibrarySet,
  role: IntrinsicRole
): string {
  return compilerLibraryIntrinsicNativeCppType(libraries, role) ?? ''
}

export function requireCompilerLibraryAsyncResultCppType(
  libraries: CCompilerLibrarySet,
  typeRef: CTypeRef | null | undefined
): string {
  const cppType = libraryNativeCppType(cTypeRefNativeShape(typeRef, libraries))

  if (cppType !== null) {
    return cppType
  }

  return requireCompilerLibraryIntrinsicNativeCppType(libraries, 'async-result')
}

export function compilerLibraryIntrinsicAsyncResultCExpression(
  libraries: CCompilerLibrarySet,
  operation: LibraryAsyncResultOperationKind
): string | null {
  return (
    compilerLibraryAsyncResultOperationForIntrinsic(
      cCompilerLibrarySetValue(libraries),
      'async-result',
      operation
    )?.cExpression ?? null
  )
}

export function compilerLibraryIntrinsicNativeCAwaitExpression(
  libraries: CCompilerLibrarySet,
  role: IntrinsicRole
): string | null {
  return (
    compilerLibraryNativeTypeForIntrinsic(cCompilerLibrarySetValue(libraries), role, 'construct')
      ?.cAwaitExpression ?? null
  )
}

export function compilerLibraryIntrinsicNativeCCoroutineAwaitExpression(
  libraries: CCompilerLibrarySet,
  role: IntrinsicRole
): string | null {
  return (
    compilerLibraryNativeTypeForIntrinsic(cCompilerLibrarySetValue(libraries), role, 'construct')
      ?.cCoroutineAwaitExpression ?? null
  )
}

export function compilerLibraryIntrinsicNativeCAwaitHandlesInvalidSource(
  libraries: CCompilerLibrarySet,
  role: IntrinsicRole
): boolean {
  return (
    compilerLibraryNativeTypeForIntrinsic(cCompilerLibrarySetValue(libraries), role, 'construct')
      ?.cAwaitHandlesInvalidSource === true
  )
}

export function compilerLibraryIntrinsicAsyncResultCValidExpression(
  libraries: CCompilerLibrarySet,
  source: string
): string {
  const expression = compilerLibraryNativeTypeForIntrinsic(
    cCompilerLibrarySetValue(libraries),
    'async-result',
    'construct'
  )?.cValidExpression

  if (typeof expression !== 'string' || expression.length === 0) {
    return 'false'
  }

  return expression.split('$value').join(source)
}

export function resolveCCompilerLibrarySet(
  libraries: CCompilerLibrarySet | null | undefined
): CCompilerLibrarySet {
  return resolveCompilerLibrarySet(cOptionalCompilerLibrarySetValue(libraries))
}

export function compilerLibraryIntrinsicResultCShape(
  libraries: CCompilerLibrarySet | null | undefined,
  role: IntrinsicRole,
  loc: SourceLocation
): ObjectShapeInfo | null {
  return compilerLibraryIntrinsicResultMetadata(
    resolveCompilerLibrarySet(cOptionalCompilerLibrarySetValue(libraries)),
    role,
    'construct',
    loc
  )?.shape ?? null
}

export function compilerLibraryIntrinsicNativeValueAdapter(
  libraries: CCompilerLibrarySet,
  role: IntrinsicRole
): string | null {
  return compilerLibraryNativeTypeForIntrinsic(
    cCompilerLibrarySetValue(libraries),
    role,
    'construct'
  )?.cValueAdapter ?? null
}

export function compilerLibraryNativeRuntimeRequirementsForCppType(
  libraries: CCompilerLibrarySet,
  cppType: string
): string[] {
  const nativeTypes = cCompilerLibrarySetValue(libraries).nativeTypes

  for (let index = 0; index < nativeTypes.length; index = index + 1) {
    if (nativeTypes[index].cppType === cppType) {
      return nativeTypes[index].runtimeRequirements
    }
  }

  return []
}

export function compilerLibraryNativeRuntimeRequirementsForId(
  libraries: CCompilerLibrarySet,
  typeId: string
): string[] {
  return compilerLibraryNativeTypeForId(
    cCompilerLibrarySetValue(libraries),
    typeId
  )?.runtimeRequirements ?? []
}

export function compilerLibraryNativeIterationForId(
  libraries: CCompilerLibrarySet,
  typeId: string
): LibraryNativeIterationDescriptor | null {
  return compilerLibraryNativeTypeForId(cCompilerLibrarySetValue(libraries), typeId)?.cIteration ?? null
}

export function compilerLibraryNativeRuntimeValueExpressionForId(
  libraries: CCompilerLibrarySet,
  typeId: string
): string | null {
  return compilerLibraryNativeTypeForId(
    cCompilerLibrarySetValue(libraries),
    typeId
  )?.cRuntimeValueExpression ?? null
}

export function compilerLibraryNativeRuntimeValueExpressionForTypeRef(
  libraries: CCompilerLibrarySet | null | undefined,
  typeRef: CTypeRef | null | undefined
): string | null {
  const resolvedLibraries = cOptionalCompilerLibrarySetValue(libraries)
  const resolvedTypeRef = cTypeRefValue(typeRef)

  if (resolvedLibraries === null || resolvedTypeRef === null || resolvedTypeRef.kind !== 'nominal') {
    return null
  }

  const typeId = resolvedTypeRef.typeId

  if (typeId === null || typeof typeId === 'undefined' || typeId === '') {
    return null
  }

  return compilerLibraryNativeTypeForId(resolvedLibraries, typeId)?.cRuntimeValueExpression ?? null
}

export function compilerLibraryNativeRuntimeValueOwnershipForTypeRef(
  libraries: CCompilerLibrarySet | null | undefined,
  typeRef: CTypeRef | null | undefined
): 'borrowed' | 'owned' {
  const resolvedLibraries = cOptionalCompilerLibrarySetValue(libraries)
  const resolvedTypeRef = cTypeRefValue(typeRef)

  if (resolvedLibraries === null || resolvedTypeRef === null || resolvedTypeRef.kind !== 'nominal') {
    return 'borrowed'
  }

  const typeId = resolvedTypeRef.typeId

  if (typeId === null || typeof typeId === 'undefined' || typeId === '') {
    return 'borrowed'
  }

  return compilerLibraryNativeTypeForId(resolvedLibraries, typeId)?.cRuntimeValueOwnership ?? 'borrowed'
}

export function compilerLibraryNativeRuntimeValueValidExpressionForTypeRef(
  libraries: CCompilerLibrarySet | null | undefined,
  typeRef: CTypeRef | null | undefined
): string | null {
  const resolvedLibraries = cOptionalCompilerLibrarySetValue(libraries)
  const resolvedTypeRef = cTypeRefValue(typeRef)

  if (resolvedLibraries === null || resolvedTypeRef === null || resolvedTypeRef.kind !== 'nominal') {
    return null
  }

  const typeId = resolvedTypeRef.typeId

  if (typeId === null || typeof typeId === 'undefined' || typeId === '') {
    return null
  }

  return compilerLibraryNativeRuntimeValueValidExpressionForTypeId(resolvedLibraries, typeId)
}

export function compilerLibraryNativeRuntimeValueValidExpressionForTypeId(
  libraries: CCompilerLibrarySet | null | undefined,
  typeId: string | null | undefined
): string | null {
  const resolvedLibraries = cOptionalCompilerLibrarySetValue(libraries)

  if (resolvedLibraries === null || typeId === null || typeof typeId === 'undefined') {
    return null
  }

  return compilerLibraryNativeTypeForId(resolvedLibraries, typeId)?.cRuntimeValueValidExpression ?? null
}

export function compilerLibraryNativeValueAdapterFailureModeForTypeId(
  libraries: CCompilerLibrarySet | null | undefined,
  typeId: string | null | undefined
): 'thrown' | null {
  const resolvedLibraries = cOptionalCompilerLibrarySetValue(libraries)

  if (resolvedLibraries === null || typeId === null || typeof typeId === 'undefined') {
    return null
  }

  return compilerLibraryNativeTypeForId(resolvedLibraries, typeId)?.cValueAdapterFailureMode ?? null
}

export function compilerLibraryNativeValueAdapterPreservesPendingExceptionForTypeId(
  libraries: CCompilerLibrarySet | null | undefined,
  typeId: string | null | undefined
): boolean {
  const resolvedLibraries = cOptionalCompilerLibrarySetValue(libraries)

  if (resolvedLibraries === null || typeId === null || typeof typeId === 'undefined') {
    return false
  }

  return (
    compilerLibraryNativeTypeForId(resolvedLibraries, typeId)?.cValueAdapterPreservesPendingException === true
  )
}

export function applyCompilerLibraryIntrinsicNativeValueAdapter(
  value: string,
  cppType: string | null | undefined,
  libraries: CCompilerLibrarySet,
  role: IntrinsicRole
): string {
  if (
    cppType !== null &&
    typeof cppType !== 'undefined' &&
    cppType !== 'inox::Value' &&
    cppType !== 'inox_value'
  ) {
    return value
  }

  const adapter = compilerLibraryNativeTypeForIntrinsic(
    cCompilerLibrarySetValue(libraries),
    role,
    'construct'
  )?.cValueAdapter ?? null

  return applyLibraryNativeValueAdapter(value, adapter)
}

export function emitCReturnType(valueType: CValueTypeInput, nullable: boolean, shape?: CLibraryNativeShape | null): string {
  const libraryCppType = libraryNativeBoundaryCppType(valueType, nullable, false, shape)

  if (libraryCppType !== null) {
    return libraryCppType
  }

  if (nullable && isNullableScalarType(valueType)) {
    return 'inox_value'
  }

  const raiiType = managedRaiiReturnCppType(valueType, nullable, shape)

  if (raiiType !== null) {
    return raiiType
  }

  if (valueType === 'function' || isManagedRuntimeReturnType(valueType)) {
    return 'inox_value'
  }

  return emitCType(valueType)
}

export function managedRaiiReturnCppType(
  valueType: CValueTypeInput,
  nullable: boolean,
  shape?: CLibraryNativeShape | null
): string | null {
  if (nullable) {
    return null
  }

  if (valueType === 'string') {
    return 'inox::String'
  }

  if (isObjectUnionValueType(valueType)) {
    return 'inox::Value'
  }

  if (
    valueType === 'object' &&
    shape !== null &&
    typeof shape !== 'undefined' &&
    shape.builtin !== 'compiler.AnyNode' &&
    libraryNativeCppType(shape) === null
  ) {
    return 'inox::ObjectValue'
  }

  return null
}

function isObjectUnionValueType(valueType: CValueTypeInput): boolean {
  if (valueType === null || typeof valueType === 'undefined') {
    return false
  }

  const application = genericTypeApplicationFromTypeName(valueType)
  return application?.name === 'union' && application.args.every((argument) => argument === 'object')
}

export function cRuntimeValueTag(valueType: CValueTypeInput): CRuntimeValueTag {
  if (valueType !== null && typeof valueType !== 'undefined' && valueType.startsWith('class:')) {
    return 'INOX_TAG_CLASS_INSTANCE'
  }

  if (valueType === 'boolean') {
    return 'INOX_TAG_BOOL'
  }

  if (valueType === 'number') {
    return 'INOX_TAG_NUMBER'
  }

  if (valueType === 'string') {
    return 'INOX_TAG_STRING'
  }

  if (valueType === 'bytes') {
    return 'INOX_TAG_BYTES'
  }

  if (valueType === 'object') {
    return 'INOX_TAG_OBJECT'
  }

  if (valueType === 'function') {
    return 'INOX_TAG_FUNCTION'
  }

  return null
}

export function isRuntimeNullableType(valueType: CValueTypeInput): boolean {
  return !!cRuntimeValueTag(valueType)
}

export function isNullableScalarParam(param: CNullableScalarParamInput): boolean {
  if (param === null || typeof param === 'undefined') {
    return false
  }

  return isNullableScalarParamRecord(param as CNullableScalarParamRecord)
}

export function isBoxedScalarParam(param: CNullableScalarParamInput): boolean {
  if (param === null || typeof param === 'undefined' || !isNullableScalarType(param.valueType)) {
    return false
  }

  return param.nullable === true || (param.optional === true && param.rest !== true)
}

function isNullableScalarParamRecord(param: CNullableScalarParamRecord): boolean {
  const omittedScalarWithoutDefault =
    isNullableScalarType(param.valueType) &&
    param.optional === true &&
    param.rest !== true &&
    typeof param.defaultValue === 'undefined'
  return (param.nullable === true && isNullableScalarType(param.valueType)) || omittedScalarWithoutDefault
}

export function emitCStringParamName(name: string): string {
  return `inox_param_${emitCIdentifier(name)}`
}

export function emitCScalarParamName(name: string): string {
  return `inox_param_${emitCIdentifier(name)}`
}

export function emitCObjectParamName(name: string): string {
  return `inox_param_${emitCIdentifier(name)}`
}
