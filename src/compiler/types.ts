export type SourceLocation = {
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
  | 'callback-values'
  | 'clocks'
  | 'runtime-values'
  | 'string-bytes'

export type IrRuntimeRequirement =
  | 'callback-values'
  | 'clocks'
  | 'managed-values'
  | 'string-bytes'

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
  returnShape?: any
  loc?: SourceLocation
}

export type IrSyntaxFeature =
  | 'async-function'
  | 'class'

export type IrSyntaxFeatureUsage = {
  feature: IrSyntaxFeature
  loc?: SourceLocation
}

export type IrGlobalUsage = {
  root: string
  path: string[]
  loc?: SourceLocation
}

export type IrTopLevelItemKind =
  | 'class'
  | 'function'
  | 'import'
  | 'statement'

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
  | 'class'
  | 'function'
  | 'null'
  | 'number'
  | 'object'
  | 'string'
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
  nullable?: boolean
  arrayElementType?: ValueType | null
  arrayElementDeclaredType?: string | null
  mapKeyType?: ValueType | null
  mapValueType?: ValueType | null
  setElementType?: ValueType | null
  params?: AnyNode[]
  returnType?: ValueType
  returnNullable?: boolean
  returnArrayElementType?: ValueType | null
  returnArrayElementDeclaredType?: string | null
  returnMapKeyType?: ValueType | null
  returnMapValueType?: ValueType | null
  returnSetElementType?: ValueType | null
  returnShape?: any
  async?: boolean
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

export type CompileTarget = 'c' | 'js' | 'ts'

export type CompileOptions = {
  target?: CompileTarget
  callMain?: boolean
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
  code: string
}

export type CompileResult = SourceCompileResult | FileCompileResult
