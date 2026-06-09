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
  arrayElementType?: ValueType | null
  params?: AnyNode[]
  returnType?: ValueType
  returnArrayElementType?: ValueType | null
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
  code: string
}

export type FileCompileResult = {
  target: CompileTarget
  graph: ModuleGraph
  code: string
}

export type CompileResult = SourceCompileResult | FileCompileResult
