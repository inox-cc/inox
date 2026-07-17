import type { CompilerHost } from '../host.ts'
import type { CompilerLibraryOptionValue, CompilerLibrarySet, TypeRef } from '../extensions/types.ts'
import type { AnyNode, IrProgram, ModuleRecord, ObjectShapeInfo } from '../types.ts'

export type CEmitOptions = {
  libraries?: CCompilerLibrarySet
  libraryOptions?: CompilerLibraryOptionValue[]
}

export type CPreparedExpression = {
  lines: string[]
  expression: string
  nullable?: boolean
  owned?: boolean
  rejectionValueType?: string
  runtimeTypeChecked?: boolean
  scalarType?: string
  valueType?: string
  cppType?: string
  cppDeclaredName?: string
}

export type CPreparedStatement = {
  lines: string[]
}

export type CPreparedStringBytesOperand = {
  lines: string[]
  bytes: string
  length: string
  cppExpression?: string
  literalValue?: string
}

export type CPreparedCallArgs = {
  lines: string[]
  args: string[]
}

export type CPreparedCallOptions = {
  asValue?: boolean
  cppExpression?: boolean
  discard?: boolean
  out?: string
  owned?: boolean
  prepareOut?: boolean
}

/** Opaque storage boundary that keeps recursive TypeRef out of large C context shapes. */
export type CTypeRef = object
export type CTypeRefMap = Map<string, CTypeRef | null>

/** Opaque storage boundary for library descriptors that contain recursive TypeRef values. */
export type CCompilerLibrarySet = object

export function cCompilerLibrarySetValue(value: CCompilerLibrarySet): CompilerLibrarySet {
  return value as CompilerLibrarySet
}

export function cOptionalCompilerLibrarySetValue(
  value: CCompilerLibrarySet | null | undefined
): CompilerLibrarySet | null {
  if (value === null || typeof value === 'undefined') {
    return null
  }

  return cCompilerLibrarySetValue(value)
}

export function cTypeRefValue(value: CTypeRef | null | undefined): TypeRef | null {
  if (value === null || typeof value === 'undefined') {
    return null
  }

  return value as TypeRef
}

export function cTypeRefMapValue(values: CTypeRefMap, name: string): TypeRef | null {
  return cTypeRefValue(values.get(name))
}

export type CShapeValueMetadata = {
  declaredType?: string | null
  nullable?: boolean
  promiseValueType?: string | null
  typeRef?: CTypeRef | null
  valueType: string
}

export type CObjectShapeField = CShapeValueMetadata & {
  functionStorage?: 'pointer'
  functionTypeOwnership?: 'weak'
  functionType?: CFunctionType | null
  loc?: AnyNode['loc']
  name: string
  optional?: boolean
  ownership?: string
  readonlyField?: boolean
  shapeOwnership?: 'weak'
  shape?: CObjectShape | null
  typeRef?: CTypeRef | null
  [key: string]: any
}

export function isReadonlyCObjectShapeField(field: AnyNode): boolean {
  const readonlyField = field.readonlyField

  if (readonlyField === true) {
    return true
  }

  if (readonlyField !== null && typeof readonlyField !== 'undefined') {
    return false
  }

  return field.readonly === true
}

export type CObjectShape = {
  builtin?: string | null
  functionCompanions?: boolean
  libraryCValueAdapter?: string | null
  libraryCppType?: string | null
  libraryTypeId?: string | null
  dynamic?: boolean
  dynamicField?: CObjectShapeField | null
  fields?: CObjectShapeField[] | null
}

export function cObjectShapeFromMetadata(shape: ObjectShapeInfo | null): CObjectShape | null {
  if (shape === null) {
    return null
  }

  const fields: CObjectShapeField[] = []

  for (let index = 0; index < shape.fields.length; index = index + 1) {
    fields.push(shape.fields[index] as CObjectShapeField)
  }

  return {
    builtin: shape.builtin ?? null,
    functionCompanions: shape.functionCompanions === true,
    libraryCValueAdapter: shape.libraryCValueAdapter ?? null,
    libraryCppType: shape.libraryCppType ?? null,
    libraryTypeId: shape.libraryTypeId ?? null,
    dynamic: shape.dynamic === true,
    fields
  }
}

export type CObjectFieldInfo = CShapeValueMetadata & {
  functionType?: CFunctionType | null
  index: number
  key: string | null
  objectName?: string
  optional?: boolean
  shape?: CObjectShape | null
}

export type CObjectAccessorReturnPath = {
  fields: string[]
  paramIndex: number
}

export type CObjectIndexFieldInfo = CObjectFieldInfo & {
  key: string
}

export type CObjectMemberFieldInfo = CObjectFieldInfo & {
  key: string | null
}

export type CKnownObjectField = CObjectFieldInfo & {
  objectName: string
}

export type CKnownObjectIndexField = CKnownObjectField & {
  key: string
}

export type CKnownObjectMemberField = CKnownObjectField & {
  key: string | null
}

export type CArrayElementInfo = {
  functionType?: CFunctionType | null
  valueType: string
}

export type CKnownArrayElement = CArrayElementInfo & {
  arrayName: string
  index: number
}

export type CRuntimeArrayElement = CArrayElementInfo & {
  index: number
  indexExpression?: AnyNode | null
}

export type CFunctionParam = {
  className?: string | null
  declaredType?: string | null
  defaultValue?: AnyNode | null
  functionTypeOwnership?: 'weak'
  functionType?: CFunctionType | null
  loc?: AnyNode['loc']
  name: string
  nullable?: boolean
  optional?: boolean
  ownership?: string
  promiseValueType?: string | null
  rest?: boolean
  shape?: CObjectShape | null
  typeRef?: CTypeRef | null
  valueType: string
}

export type CFunctionType = {
  kind?: 'function'
  params: CFunctionParam[]
  returnNullable?: boolean
  returnPromiseValueType?: string | null
  returnShape?: CObjectShape | null
  returnType: string
  returnTypeRef?: CTypeRef | null
}

export type CFunctionPointerAdapter = {
  functionType: CFunctionType
  name: string
  seenTypes: string[]
  target: string
  targetFunctionType: CFunctionType
  targetSeenTypes: string[]
}

export type CFunctionPointerRuntimeAdapter = {
  callbackName: string
  contextTypeName: string
  finalizerName: string
  functionType: CFunctionType
  seenTypes: string[]
}

export type CRuntimeArrowCapture = {
  declaration?: AnyNode | null
  functionType?: CFunctionType | null
  loc?: AnyNode['loc']
  mutable?: boolean
  name: string
  promiseSettlementKind?: 'reject' | 'resolve' | null
  runtimeManaged?: boolean
  shape?: CObjectShape | null
  valueType: string
}

export type CClassInfo = {
  name: string
  symbolName: string
  node: AnyNode
  constructor: AnyNode | null
  assignments: AnyNode[]
  fields: CObjectShapeField[]
  methods: Map<string, AnyNode>
  native: boolean
}

export type CClassMethod = {
  info: CClassInfo
  method: AnyNode
}

export type CNamedCallbackWrapper = {
  kind: 'named'
  key: string
  name: string
  functionType: CFunctionType
  target: string
  cTarget?: string | null
  targetFunctionType?: CFunctionType | null
}

export type CRuntimeArrowCallbackWrapper = {
  kind: 'arrow'
  key: string
  name: string
  captures: CRuntimeArrowCapture[]
  contextTypeName: string
  expression: AnyNode
  finalizerName: string
  functionType: CFunctionType
  needsEventLoop: boolean
}

export type CPlainArrowCallbackWrapper = {
  kind: 'plain-arrow'
  key: string
  name: string
  expression: AnyNode
  functionType: CFunctionType
}

export type CRuntimeCallbackWrapper = CNamedCallbackWrapper | CRuntimeArrowCallbackWrapper

export type CCallbackWrapper = CRuntimeCallbackWrapper | CPlainArrowCallbackWrapper

export type CPromiseChainWrapper = {
  kind: 'promise-chain-arrow'
  key: string
  name: string
  captures: CRuntimeArrowCapture[]
  contextTypeName: string
  expression: AnyNode
  finalizerName: string
  inputRejectionValueType: string
  needsEventLoop: boolean
  returnShape: CObjectShape | null
  returnType: string
}

export type CCallbackContextWrapper = CRuntimeArrowCallbackWrapper | CPromiseChainWrapper

export type CAsyncTaskParam = CFunctionParam & {
  argName: string
  fieldName: string
}

export type CAsyncTaskFrameLocalKind = 'prefix' | 'await'

export type CAsyncTaskPrefixLocal = {
  name: string
  type: string
  fieldName: string
  forceRuntimeStringDeclaration?: boolean
  shape?: CObjectShape | null
  typeRef?: CTypeRef | null
}

export type CAsyncTaskPrefixFrameLocal = CAsyncTaskPrefixLocal & {
  kind: 'prefix'
}

export type CAsyncTaskAwaitStep = {
  index: number
  name: string | null
  type: string
  fieldName: string | null
  awaitedExpression: AnyNode | null
  awaitedPromiseExpression: AnyNode | null
  shape?: CObjectShape | null
  typeRef?: CTypeRef | null
}

export type CAsyncTaskAwaitFrameLocal = CAsyncTaskAwaitStep & {
  kind: 'await'
  fieldName: string
  name: string
}

export type CAsyncTaskFrameLocal = CAsyncTaskAwaitFrameLocal | CAsyncTaskPrefixFrameLocal

export type CAsyncTaskSuccessPhaseKind = 'pre-finalizer' | 'prefix-finalizer' | 'body'

export type CAsyncTaskTryPhaseKind = 'success-finalizer' | 'reject-finalizer' | 'handler-prelude' | 'handler-finalizer'

export type CAsyncTaskPhaseKind = CAsyncTaskSuccessPhaseKind | CAsyncTaskTryPhaseKind

export type CAsyncTaskPhase = {
  kind: CAsyncTaskPhaseKind
  statements: AnyNode[]
}

export type CAsyncTaskTryHandlerPlan = {
  param: string | null
  statements: AnyNode[]
  returnExpression: AnyNode | null
}

export type CAsyncTaskWrapper = {
  key: string
  functionName: string
  frameTypeName: string
  startName: string
  resumeName: string
  rejectName: string
  finalizerName: string
  params: CAsyncTaskParam[]
  awaits: CAsyncTaskAwaitStep[]
  frameLocals: CAsyncTaskFrameLocal[]
  hasTryRegion: boolean
  prefixStatements: AnyNode[]
  returnExpression: AnyNode | null
  returnType: string
  successPhases: CAsyncTaskPhase[]
  tryHandler: CAsyncTaskTryHandlerPlan | null
  tryPhases: CAsyncTaskPhase[]
}

export type CPromiseConstructorHandler = {
  kind: 'reject' | 'resolve'
  promise: string
}

export type CModuleOutputFile = {
  kind: 'declaration' | 'header' | 'source'
  path: string
  sourcePath: string
  code: string
}

export type CModuleEmitOptions = CEmitOptions & {
  callMain?: boolean
  host: CompilerHost
  sourceRoot?: string
}

export type CModulePlan = {
  record: ModuleRecord
  ir: IrProgram
  external?: boolean
  isGraphEntry: boolean
  isEntry: boolean
  relativeSourcePath: string
  sourcePath: string
  headerPath: string
  declarationPath: string
  symbolPrefix: string
  classSymbolNames: Map<string, string>
  functionSymbolNames: Map<string, string>
  valueSymbolNames: Map<string, string>
  headerGuard: string
  initName: string | null
  imports: CModuleImportPlan[]
}

export type CModuleImportPlan = {
  declaration: AnyNode
  moduleOwnership?: 'weak'
  module: CModulePlan
}
