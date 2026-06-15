export type SourceLocation = {
  file?: string
  line: number
  column: number
}

export type Token = SourceLocation & {
  type: string
  value: string
  index: number
}

export type Diagnostic = SourceLocation & {
  code: string
  message: string
  severity: 'error'
}

export type AnyNode = {
  type?: string
  [key: string]: any
}

export type ProgramNode = AnyNode & {
  body: AnyNode[]
}

export type IrFeature =
  | 'array-pop-null'
  | 'async-runtime'
  | 'binary'
  | 'callback-values'
  | 'child-process'
  | 'clocks'
  | 'collections'
  | 'crypto'
  | 'debug-memory'
  | 'fs'
  | 'json'
  | 'map-index-set'
  | 'map-get-null'
  | 'number-from-string-null'
  | 'numeric-casts'
  | 'objects'
  | 'path'
  | 'process'
  | 'runtime-values'
  | 'string-bytes'
  | 'timers'
  | 'url'
  | 'weak-references'

export type IrRuntimeRequirement =
  | 'async-runtime'
  | 'binary'
  | 'callback-values'
  | 'child-process'
  | 'clocks'
  | 'crypto'
  | 'debug-memory'
  | 'collections'
  | 'fs'
  | 'json'
  | 'managed-values'
  | 'objects'
  | 'path'
  | 'process'
  | 'string-bytes'
  | 'timers'
  | 'url'
  | 'weak-references'

export type IrThrowValueType = 'error' | 'other' | 'string'

export type IrFunctionEffect = {
  name: string
  throws: boolean
  throwValueTypes: IrThrowValueType[]
}

export type IrFunctionDeclaration = {
  name: string
  exported: boolean
  async: boolean
  params: AnyNode[]
  returnType: string
  returnNullable: boolean
  returnArrayElementType?: ValueType | null
  returnArrayElementDeclaredType?: string | null
  returnMapKeyType?: ValueType | null
  returnMapValueType?: ValueType | null
  returnPromiseValueType?: ValueType | null
  returnSetElementType?: ValueType | null
  returnShape?: any
  loc?: SourceLocation
}

export type IrSyntaxFeature = 'async-function' | 'class'

export type IrSyntaxFeatureUsage = {
  feature: IrSyntaxFeature
  loc?: SourceLocation
}

export type IrGlobalUsage = {
  root: string
  path: string[]
  loc?: SourceLocation
}

export type IrTopLevelItemKind = 'class' | 'function' | 'import' | 'statement' | 'type'

export type IrTopLevelItem = {
  kind: IrTopLevelItemKind
  index: number
  loc?: SourceLocation
}

export type IrProgram = {
  type: 'IrProgram'
  version: 1
  features: IrFeature[]
  runtimeRequirements: IrRuntimeRequirement[]
  topLevelItems: IrTopLevelItem[]
  functionDeclarations: IrFunctionDeclaration[]
  functionEffects: IrFunctionEffect[]
  syntaxFeatures: IrSyntaxFeatureUsage[]
  globalUsages: IrGlobalUsage[]
  body: AnyNode[]
}

export type ValueType =
  | 'array'
  | 'boolean'
  | 'bytes'
  | 'class'
  | 'function'
  | 'null'
  | 'number'
  | 'object'
  | 'promise'
  | 'string'
  | 'timer'
  | 'unknown'
  | 'void'
  | string

export type FunctionTypeInfo = {
  kind: 'function'
  params: AnyNode[]
  returnType: ValueType
  [key: string]: any
}

export type ObjectShapeInfo = {
  kind: 'object'
  fields: AnyNode[]
  [key: string]: any
}

export type TypeAliasInfo = FunctionTypeInfo | ObjectShapeInfo

export type SymbolInfo = {
  kind: string
  mutable?: boolean
  valueType: ValueType
  importedName?: string
  importSource?: string
  nullable?: boolean
  arrayElementType?: ValueType | null
  arrayElementDeclaredType?: string | null
  mapKeyType?: ValueType | null
  mapValueType?: ValueType | null
  promiseValueType?: ValueType | null
  setElementType?: ValueType | null
  params?: AnyNode[]
  returnType?: ValueType
  returnNullable?: boolean
  returnArrayElementType?: ValueType | null
  returnArrayElementDeclaredType?: string | null
  returnMapKeyType?: ValueType | null
  returnMapValueType?: ValueType | null
  returnPromiseValueType?: ValueType | null
  returnSetElementType?: ValueType | null
  returnShape?: any
  async?: boolean
  className?: string | null
  classMethods?: AnyNode[]
  constructable?: boolean
  constructorParams?: AnyNode[]
  functionType?: any
  shape?: any
  loc?: SourceLocation
}

export type ModuleRecord = {
  path: string
  source: string
  ast: ProgramNode
  hir: ProgramNode | null
  ir: IrProgram | null
  imports: AnyNode[]
  exports: Map<string, AnyNode>
}

export type ModuleGraph = {
  entry: string
  modules: ModuleRecord[]
}

export type CompileTarget = 'c'

export type RandomOptions = {
  backend?: 'simple' | 'xorshift32' | 'os'
  seed?: number
}

export type RuntimeProfile = 'embedded' | 'hosted'
export type RuntimeLoopBackend = 'embedded' | 'libuv'

export type RuntimeCapabilities = {
  entropy?: boolean
  fs?: boolean
  heap?: boolean
  monotonicClock?: boolean
  timers?: boolean
  wallClock?: boolean
}

export type RuntimeBudgets = {
  maxFeatures?: number
  maxRuntimeRequirements?: number
}

export type TlsBackend = 'none' | 'boringssl' | 'openssl'

export type CompileOptions = {
  target?: CompileTarget
  callMain?: boolean
  budgets?: RuntimeBudgets
  capabilities?: RuntimeCapabilities
  loopBackend?: RuntimeLoopBackend
  profile?: RuntimeProfile
  random?: RandomOptions
  tlsBackend?: TlsBackend
}

export type SourceCompileResult = {
  target: CompileTarget
  ast: ProgramNode
  hir: ProgramNode
  ir: IrProgram
  code: string
}

export type FileCompileResult = {
  target: CompileTarget
  graph: ModuleGraph
  irRuntimeRequirements: IrRuntimeRequirement[]
  code: string
}

export type CompileResult = SourceCompileResult | FileCompileResult
