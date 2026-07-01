import type { CompilerHost } from '../host.ts'
import type { AnyNode, IrProgram, ModuleRecord, RandomOptions } from '../types.ts'

export type CEmitOptions = {
  random?: RandomOptions
}

export type CPreparedExpression = {
  lines: string[]
  expression: string
  nullable?: boolean
  owned?: boolean
  rejectionValueType?: string
  runtimeTypeChecked?: boolean
  valueType?: string
}

export type CPreparedStatement = {
  lines: string[]
}

export type CPreparedStringBytesOperand = {
  lines: string[]
  bytes: string
  length: string
  literalValue?: string
}

export type CPreparedCallArgs = {
  lines: string[]
  args: string[]
}

export type CPreparedCallOptions = {
  asValue?: boolean
  discard?: boolean
  out?: string
  owned?: boolean
}

export type CShapeValueMetadata = {
  arrayElementType?: string | null
  arrayElementDeclaredType?: string | null
  declaredType?: string | null
  mapKeyType?: string | null
  mapValueType?: string | null
  nullable?: boolean
  promiseValueType?: string | null
  setElementType?: string | null
  valueType: string
}

export type CObjectShapeField = CShapeValueMetadata & {
  functionTypeOwnership?: 'weak'
  functionType?: CFunctionType | null
  loc?: AnyNode['loc']
  name: string
  optional?: boolean
  ownership?: string
  readonlyField?: boolean
  shapeOwnership?: 'weak'
  shape?: CObjectShape | null
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
  dynamic?: boolean
  dynamicField?: CObjectShapeField | null
  fields?: CObjectShapeField[] | null
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
  arrayElementType?: string | null
  className?: string | null
  declaredType?: string | null
  defaultValue?: AnyNode | null
  functionTypeOwnership?: 'weak'
  functionType?: CFunctionType | null
  loc?: AnyNode['loc']
  mapKeyType?: string | null
  mapValueType?: string | null
  name: string
  nullable?: boolean
  optional?: boolean
  ownership?: string
  promiseValueType?: string | null
  setElementType?: string | null
  shape?: CObjectShape | null
  valueType: string
}

export type CFunctionType = {
  kind?: 'function'
  params: CFunctionParam[]
  returnArrayElementType?: string | null
  returnMapKeyType?: string | null
  returnMapValueType?: string | null
  returnNullable?: boolean
  returnPromiseValueType?: string | null
  returnSetElementType?: string | null
  returnShape?: CObjectShape | null
  returnType: string
}

export type CFunctionPointerAdapter = {
  functionType: CFunctionType
  name: string
  seenTypes: string[]
  target: string
  targetFunctionType: CFunctionType
  targetSeenTypes: string[]
}

export type CFunctionReturnMapType = {
  key: string | null
  value: string | null
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
  arrayElementType?: string | null
  forceRuntimeStringDeclaration?: boolean
  mapKeyType?: string | null
  mapValueType?: string | null
  setElementType?: string | null
  shape?: CObjectShape | null
}

export type CAsyncTaskPrefixFrameLocal = CAsyncTaskPrefixLocal & {
  kind: 'prefix'
}

export type CAsyncTaskAwaitStep = {
  index: number
  name: string | null
  type: string
  fieldName: string | null
  arrayElementType?: string | null
  awaitedExpression: AnyNode | null
  awaitedPromiseExpression: AnyNode | null
  mapKeyType?: string | null
  mapValueType?: string | null
  setElementType?: string | null
  shape?: CObjectShape | null
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

export type CDgramMessageHandler = {
  name: string
  expression: AnyNode
}

export type CHttpHandler = {
  name: string
  expression: AnyNode
}

export type CNetHandler = {
  kind: string
  name: string
  expression: AnyNode
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
