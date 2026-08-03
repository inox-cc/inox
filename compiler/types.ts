import type { CompilerHost } from './host.ts'
import type {
  ArgumentNarrowingDescriptor,
  CompilerLibraryOptionValue,
  CompilerLibrarySet,
  IntrinsicRole,
  TypeRef
} from './extensions/types.ts'

export type SourceLocation = {
  file?: string
  line: number
  column: number
}

export type ArrayBindingElement = {
  name: string
  index: number
  loc: SourceLocation
  declaredType?: string | null
  valueType?: ValueType
  typeRef?: TypeRef | null
  nullable?: boolean
  asyncResultValueType?: ValueType | null
  functionType?: AnyNode | null
  shape?: ObjectShapeInfo | null
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
  | 'async-runtime'
  | 'callback-values'
  | 'objects'
  | 'runtime-values'
  | 'string-bytes'
  | 'weak-references'

export type IrRuntimeRequirement = string

export type IrThrowValueType = 'exception-object' | 'other' | 'string'

export type IrFunctionEffect = {
  mayLeavePendingException?: boolean
  name: string
  throws: boolean
  throwValueTypes: IrThrowValueType[]
}

export type RuntimeTypeAlternative = {
  nullable?: boolean
  shape?: ObjectShapeInfo | null
  typeRef?: TypeRef | null
  valueType: string
}

export type IrFunctionDeclaration = {
  name: string
  exported: boolean
  inline?: boolean
  inlineLoc?: SourceLocation | null
  async: boolean
  params: AnyNode[]
  declaredReturnType?: string | null
  returnType: string
  returnRuntimeTypeAlternatives?: RuntimeTypeAlternative[] | null
  returnTypeRef?: TypeRef | null
  returnNullable: boolean
  returnAsyncResultValueType?: ValueType | null
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
  | 'boolean'
  | 'bytes'
  | 'class'
  | 'function'
  | 'null'
  | 'number'
  | 'object'
  | 'async-result'
  | 'string'
  | 'unknown'
  | 'void'
  | string

export type FunctionTypeInfo = {
  kind: 'function'
  typeParameters?: AnyNode[]
  params: AnyNode[]
  returnType: ValueType
  returnNullable?: boolean
  returnShape?: ObjectShapeInfo | null
  [key: string]: any
}

export type ObjectShapeInfo = {
  kind: 'object'
  typeParameters?: AnyNode[]
  baseTypes?: string[]
  builtin?: string | null
  compilerBuiltin?: string | null
  dynamic?: boolean
  dynamicField?: AnyNode | null
  fields: AnyNode[]
  functionCompanions?: boolean
  libraryTypeId?: string | null
  libraryCppType?: string | null
  libraryCValueAdapter?: string | null
  [key: string]: any
}

export type AliasTypeInfo = {
  kind: 'alias'
  valueType: ValueType
  typeParameters?: AnyNode[]
}

export type TypeAliasInfo = AliasTypeInfo | FunctionTypeInfo | ObjectShapeInfo

export type CallableOverloadInfo = {
  kind: string
  valueType: ValueType
  params?: AnyNode[]
  returnType?: ValueType
  declaredReturnType?: string | null
  returnTypeRef?: TypeRef | null
  returnNullable?: boolean
  returnAsyncResultValueType?: ValueType | null
  returnShape?: ObjectShapeInfo | null
  typePredicateParameterName?: string | null
  typePredicateType?: string | null
  argumentNarrowing?: ArgumentNarrowingDescriptor | null
  async?: boolean
  loc?: SourceLocation
}

export type SymbolInfo = {
  kind: string
  mutable?: boolean
  valueType: ValueType
  declaredType?: string | null
  typeRef?: TypeRef | null
  libraryId?: string | null
  libraryBindingId?: string | null
  libraryIntrinsicRole?: IntrinsicRole | null
  importedName?: string
  importSource?: string
  nullable?: boolean
  narrowingTrueNames?: string[]
  narrowingFalseNames?: string[]
  narrowingDependencyRoots?: string[]
  narrowingDependencyVersions?: number[]
  narrowingCallVersion?: number
  asyncResultValueType?: ValueType | null
  asyncResultRejectionIntrinsicRole?: IntrinsicRole | null
  params?: AnyNode[]
  paramTemplates?: AnyNode[]
  returnType?: ValueType
  declaredReturnType?: string | null
  returnTypeRef?: TypeRef | null
  returnNullable?: boolean
  returnAsyncResultValueType?: ValueType | null
  returnShape?: ObjectShapeInfo | null
  typePredicateParameterName?: string | null
  typePredicateType?: string | null
  argumentNarrowing?: ArgumentNarrowingDescriptor | null
  async?: boolean
  className?: string | null
  classMethods?: AnyNode[]
  constructable?: boolean
  typeParameters?: AnyNode[]
  constructorParams?: AnyNode[]
  constructorParamTemplates?: AnyNode[][]
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
  automaticLibraryOptions: CompilerLibraryOptionValue[]
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

export type RuntimeCapabilities = {
  [key: string]: boolean | undefined
}

export type RuntimeBudgets = {
  maxFeatures?: number
  maxRuntimeRequirements?: number
}

export type ModuleDeclarationImport = {
  sourcePath: string
  declarationPath?: string
  declarationSource?: string
  functionEffects?: IrFunctionEffect[]
  functionEffectsPath?: string
  program?: ProgramNode
  resolvedProgram?: ProgramNode
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
  profile?: RuntimeProfile
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
