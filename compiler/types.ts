import type { CompilerHost } from './host.ts'
import type { CompilerLibraryOptionValue, CompilerLibrarySet } from './extensions/types.ts'

export type SourceLocation = {
  file?: string
  line: number
  column: number
}

export type ArrayBindingElement = {
  name: string
  index: number
  loc: SourceLocation
  [key: string]: any
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
  | 'callback-values'
  | 'collections'
  | 'json'
  | 'map-index-set'
  | 'map-get-null'
  | 'number-from-string-null'
  | 'numeric-casts'
  | 'objects'
  | 'runtime-values'
  | 'string-bytes'
  | 'weak-references'

export type IrRuntimeRequirement = string

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
  declaredReturnType?: string | null
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
  version: 3
  librarySetFingerprint: string
  libraryOptionsFingerprint: string
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
  | 'unknown'
  | 'void'
  | string

export type FunctionTypeInfo = {
  kind: 'function'
  params: AnyNode[]
  returnType: ValueType
  returnNullable?: boolean
  returnShape?: ObjectShapeInfo | null
  [key: string]: any
}

export type ObjectShapeInfo = {
  kind: 'object'
  baseTypes?: string[]
  builtin?: string | null
  dynamic?: boolean
  dynamicField?: AnyNode | null
  fields: AnyNode[]
  libraryTypeId?: string | null
  libraryCppType?: string | null
  [key: string]: any
}

export type AliasTypeInfo = {
  kind: 'alias'
  valueType: ValueType
}

export type TypeAliasInfo = AliasTypeInfo | FunctionTypeInfo | ObjectShapeInfo

export type CallableOverloadInfo = {
  kind: string
  valueType: ValueType
  params?: AnyNode[]
  returnType?: ValueType
  returnNullable?: boolean
  returnArrayElementType?: ValueType | null
  returnArrayElementDeclaredType?: string | null
  returnMapKeyType?: ValueType | null
  returnMapValueType?: ValueType | null
  returnPromiseValueType?: ValueType | null
  returnSetElementType?: ValueType | null
  returnShape?: ObjectShapeInfo | null
  async?: boolean
  loc?: SourceLocation
}

export type SymbolInfo = {
  kind: string
  mutable?: boolean
  valueType: ValueType
  libraryId?: string | null
  libraryBindingId?: string | null
  importedName?: string
  importSource?: string
  nullable?: boolean
  narrowingTrueNames?: string[]
  narrowingFalseNames?: string[]
  arrayElementType?: ValueType | null
  arrayElementDeclaredType?: string | null
  arrayElementFunctionType?: any
  mapKeyType?: ValueType | null
  mapValueType?: ValueType | null
  mapValueShape?: ObjectShapeInfo | null
  mapValueArrayElementType?: ValueType | null
  mapValueArrayElementDeclaredType?: string | null
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
  returnShape?: ObjectShapeInfo | null
  async?: boolean
  className?: string | null
  classMethods?: AnyNode[]
  constructable?: boolean
  constructorParams?: AnyNode[]
  constructorOverloads?: CallableOverloadInfo[]
  functionType?: any
  overloads?: CallableOverloadInfo[]
  shape?: ObjectShapeInfo | null
  loc?: SourceLocation
}

export type ModuleRecord = {
  path: string
  source: string
  ast: ProgramNode
  declarationProgram: ProgramNode | null
  external?: boolean
  externalFunctionEffects?: IrFunctionEffect[]
  hir: ProgramNode | null
  ir: IrProgram | null
  imports: AnyNode[]
  reexports: AnyNode[]
  exports: Map<string, AnyNode>
  typeImportDeclarations: Map<number, AnyNode[]>
}

export type ModuleGraph = {
  entry: string
  modules: ModuleRecord[]
}

export type CompileTarget = 'cc'

export type RuntimeProfile = 'embedded' | 'hosted'
export type RuntimeLoopBackend = 'embedded' | 'libuv'

export type RuntimeCapabilities = {
  [key: string]: boolean | undefined
  entropy?: boolean
  heap?: boolean
}

export type RuntimeBudgets = {
  maxFeatures?: number
  maxRuntimeRequirements?: number
}

export type TlsBackend = 'none' | 'boringssl' | 'openssl'

export type ModuleDeclarationImport = {
  sourcePath: string
  declarationPath?: string
  declarationSource?: string
  functionEffects?: IrFunctionEffect[]
  functionEffectsPath?: string
  program?: ProgramNode
}

export type CompileOptions = {
  target?: CompileTarget
  callMain?: boolean
  budgets?: RuntimeBudgets
  capabilities?: RuntimeCapabilities
  declarationImports?: ModuleDeclarationImport[]
  host?: CompilerHost
  libraries?: CompilerLibrarySet
  libraryOptions?: CompilerLibraryOptionValue[]
  loopBackend?: RuntimeLoopBackend
  profile?: RuntimeProfile
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
