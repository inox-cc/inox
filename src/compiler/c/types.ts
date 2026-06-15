import type { AnyNode, IrProgram, ModuleRecord, RandomOptions } from '../types.ts'
import type { CompilerHost } from '../host.ts'

export type CEmitOptions = {
  random?: RandomOptions
}

export type CPreparedExpression = {
  lines: string[]
  expression: string
  nullable?: boolean
  rejectionValueType?: string
  valueType?: string
}

export type CPreparedStatement = {
  lines: string[]
}

export type CPreparedStringBytesOperand = {
  lines: string[]
  bytes: string
  length: string
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
  mapKeyType?: string | null
  mapValueType?: string | null
  setElementType?: string | null
  valueType: string
}

export type CObjectShapeField = CShapeValueMetadata & {
  name: string
  ownership?: string
  readonly?: boolean
}

export type CObjectFieldInfo = CShapeValueMetadata & {
  index: number
  key: string | null
  objectName?: string
}

export type CObjectIndexFieldInfo = CObjectFieldInfo & {
  key: string
}

export type CObjectMemberFieldInfo = CObjectFieldInfo & {
  key: null
}

export type CKnownObjectField = CObjectFieldInfo & {
  objectName: string
}

export type CKnownObjectIndexField = CKnownObjectField & {
  key: string
}

export type CKnownObjectMemberField = CKnownObjectField & {
  key: null
}

export type CArrayElementInfo = {
  valueType: string
}

export type CKnownArrayElement = CArrayElementInfo & {
  arrayName: string
  index: number
}

export type CRuntimeArrayElement = CArrayElementInfo & {
  index: number
}

export type CFunctionParam = {
  arrayElementType?: string | null
  functionType?: CFunctionType | null
  loc?: AnyNode['loc']
  mapKeyType?: string | null
  mapValueType?: string | null
  name: string
  nullable?: boolean
  promiseValueType?: string | null
  setElementType?: string | null
  shape?: any
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
  returnShape?: any
  returnType: string
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
  promiseSettlementKind?: string | null
  runtimeManaged?: boolean
  shape?: any
  valueType: string
}

export type CClassInfo = {
  name: string
  node: AnyNode
  constructor: AnyNode | null
  assignments: AnyNode[]
  fields: CObjectShapeField[]
  methods: Map<string, AnyNode>
}

export type CCallbackWrapper = {
  kind: 'arrow' | 'named' | 'plain-arrow'
  key: string
  name: string
  captures?: CRuntimeArrowCapture[]
  contextTypeName?: string
  expression?: AnyNode
  finalizerName?: string
  functionType: CFunctionType
  needsEventLoop?: boolean
  target?: string
}

export type CPromiseChainWrapper = {
  kind: 'promise-chain-arrow'
  key: string
  name: string
  captures: CRuntimeArrowCapture[]
  contextTypeName: string
  expression: AnyNode
  finalizerName: string
  needsEventLoop: boolean
  returnShape: any
  returnType: string
}

export type CAsyncTaskWrapper = {
  key: string
  functionName: string
  frameTypeName: string
  startName: string
  resumeName: string
  rejectName: string
  finalizerName: string
  params: CFunctionParam[]
  awaits: any[]
  frameLocals: any[]
  hasTryRegion: boolean
  prefixStatements: any[]
  returnExpression: any
  returnType: string
  successPhases: any[]
  tryHandler: any
  tryPhases: any[]
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
  kind: 'header' | 'source'
  path: string
  sourcePath: string
  code: string
}

export type CModuleEmitOptions = CEmitOptions & {
  host: CompilerHost
  sourceRoot?: string
}

export type CModulePlan = {
  record: ModuleRecord
  ir: IrProgram
  isEntry: boolean
  relativeSourcePath: string
  sourcePath: string
  headerPath: string
  symbolPrefix: string
  headerGuard: string
  initName: string | null
  imports: CModuleImportPlan[]
}

export type CModuleImportPlan = {
  declaration: AnyNode
  module: CModulePlan
}
