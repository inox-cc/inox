import { diagnostic, throwDiagnostics } from './diagnostics.ts'
import {
  commonArrayElementType,
  commonValueType,
  inferBinaryExpressionType,
  isAssignableType,
  isEqualityComparableType,
  isEqualityOperator,
  isMatchingSwitchCaseType,
  isSwitchableType
} from './checker/assignability.ts'
import {
  childProcessSpawnSyncResultShape,
  debugMemoryStatsObjectShape,
  errorObjectShape,
  fetchAbortControllerObjectShape,
  fetchResponseObjectShape,
  fsConstantValues,
  fsDirentObjectShape,
  fsStatsObjectShape,
  globals,
  libuvOnlyRuntimeImports,
  numericCastNames,
  pathParseObjectShape,
  urlObjectShape,
  urlSearchParamsObjectShape
} from './checker/builtins.ts'
import { fsRuntimeCallInfo, isFsRuntimeImportSymbol, removedFsRuntimeMethodInfo } from './checker/std/fs.ts'
import { isJsonParseDeclaredType, jsonRuntimeMethodName } from './checker/std/json.ts'
import { isMathRuntimeMethod } from './checker/std/math.ts'
import { timerCallbackFunctionType, timerClearMethodName, timerRuntimeMethodName } from './checker/std/timers.ts'
import { memberExpressionPath } from './member-paths.ts'
import type { FsRuntimeCallInfo } from './stdlib/descriptors/fs.ts'
import {
  arrayElementTypeNameFromKnownTypeName,
  isArrayTypeName,
  isBuiltinValueType,
  isBytesTypeName,
  isNullableTypeName,
  isPromiseTypeName,
  isSetTypeName,
  mapTypeNamesFromTypeName,
  nullableTypeNameFromKnownTypeName,
  promiseValueTypeNameFromKnownTypeName,
  setElementTypeNameFromKnownTypeName,
  unionTypeNamesFromTypeName
} from './type-names.ts'
import { unsupportedFsRuntimeMethodMessage } from './stdlib/descriptors/fs.ts'
import {
  isUnsupportedRuntimeBuiltinImportSource,
  unsupportedRuntimeBuiltinImportMessageFromKnownSource
} from './stdlib/descriptors/node-builtins.ts'
import {
  fetchHeadersRuntimeMethod,
  isFetchAbortControllerMethod,
  isFetchHeadersMethod,
  isFetchInitOption,
  isFetchRedirectMode,
  isFetchResponseBodyMethod,
  isSupportedFetchResponseBodyMethod
} from './stdlib/descriptors/fetch.ts'
import {
  binaryConstructorNameFromPath,
  binaryInstanceRuntimeMethodName,
  binaryStaticRuntimeMethodNameFromPath,
  isBinaryStaticMethod,
  isBufferRuntimeConstant,
  isNodeBufferImportSource,
  isUnsupportedBufferRuntimeExport
} from './stdlib/descriptors/binary.ts'
import {
  collectionConstructorNameFromPath,
  isArrayMethod,
  isStringIndexMethod,
  isStringPredicateMethod,
  mapRuntimeMethodName,
  setRuntimeMethodName,
  stringRuntimeMethodName
} from './stdlib/descriptors/collections.ts'
import {
  cryptoRuntimeMethodNameFromKnownPath,
  isCryptoRuntimeMethod,
  isCryptoRuntimeMethodPath,
  isNodeCryptoImportSource,
  isUnsupportedNodeCryptoMethod
} from './stdlib/descriptors/crypto.ts'
import { debugRuntimeMethodNameFromKnownPath, isDebugRuntimeMethodPath } from './stdlib/descriptors/debug.ts'
import {
  isNodeEventsImportSource,
  isUnsupportedEventsRuntimeExport,
  unsupportedEventsRuntimeExportReason
} from './stdlib/descriptors/events.ts'
import { knownMathRuntimeArgCount } from './stdlib/descriptors/math.ts'
import {
  isNodeStreamImportSource,
  isUnsupportedStreamRuntimeExport,
  unsupportedStreamRuntimeExportReason
} from './stdlib/descriptors/stream.ts'
import { isNodeTimerImportSource, isTimerHandleMethod, isTimerRuntimeMethod } from './stdlib/descriptors/timers.ts'
import {
  isChildProcessRuntimeMethod,
  isNodeChildProcessImportSource,
  isUnsupportedChildProcessRuntimeMethod
} from './stdlib/descriptors/child-process.ts'
import {
  isNodePathImportSource,
  isPathRuntimeConstant,
  isPathRuntimeMethod,
  isUnsupportedPathRuntimeMethod
} from './stdlib/descriptors/path.ts'
import {
  isNodeOsImportSource,
  isOsRuntimeConstant,
  isOsRuntimeMethod,
  isUnsupportedOsRuntimeMethod
} from './stdlib/descriptors/os.ts'
import {
  isNodeProcessImportSource,
  isProcessRuntimeMethod,
  isProcessRuntimeProperty,
  processRuntimePropertyValueType,
  isUnsupportedProcessRuntimeProperty,
  isUnsupportedProcessRuntimeMethod
} from './stdlib/descriptors/process.ts'
import {
  isNodeUrlImportSource,
  isUnsupportedUrlRuntimeMethod,
  isUrlMutableObjectField,
  isUrlRuntimeConstructor,
  isUrlRuntimeMethod,
  isUrlSearchParamsRuntimeMethod
} from './stdlib/descriptors/url.ts'
import type {
  AnyNode,
  Diagnostic,
  CompileOptions,
  ObjectShapeInfo,
  ProgramNode,
  SourceLocation,
  SymbolInfo,
  TypeAliasInfo,
  ValueType
} from './types.ts'

type ResolvedTypeInfo = {
  valueType: ValueType
  nullable: boolean
  functionType: FunctionTypeMetadata | null
  shape: ObjectShapeInfo | null
  arrayElementType: ValueType | null
  arrayElementDeclaredType: string | null
  mapKeyType: ValueType | null
  mapValueType: ValueType | null
  promiseValueType?: ValueType | null
  setElementType: ValueType | null
}

type ResolvedTypeInfoValueKind = number

const resolvedArrayElementTypeKind: ResolvedTypeInfoValueKind = 0
const resolvedMapKeyTypeKind: ResolvedTypeInfoValueKind = 1
const resolvedMapValueTypeKind: ResolvedTypeInfoValueKind = 2
const resolvedPromiseValueTypeKind: ResolvedTypeInfoValueKind = 3
const resolvedSetElementTypeKind: ResolvedTypeInfoValueKind = 4

type OwnershipGraphEdge = {
  from: string
  to: string
  field: string
  loc: SourceLocation
}

type OptionalParamInfo = {
  optional?: boolean
  [key: string]: unknown
}

type CheckerNode = AnyNode
type NullableNode = AnyNode | null

type FunctionTypeParamMetadata = {
  name: string
  loc: SourceLocation
  optional?: boolean
  declaredType?: string
  valueType: ValueType
  nullable?: boolean
  arrayElementType?: ValueType | null
  arrayElementDeclaredType?: string | null
  mapKeyType?: ValueType | null
  mapValueType?: ValueType | null
  promiseValueType?: ValueType | null
  setElementType?: ValueType | null
  functionType?: FunctionTypeMetadata | null
  functionTypeOwnership?: 'weak'
  shape?: ObjectShapeInfo | null
  [key: string]: any
}

type FunctionTypeMetadata = {
  kind?: string
  resolved: boolean
  params: FunctionTypeParamMetadata[]
  returnType: ValueType
  declaredReturnType?: string
  returnNullable: boolean
  returnArrayElementType?: ValueType | null
  returnArrayElementDeclaredType?: string | null
  returnMapKeyType?: ValueType | null
  returnMapValueType?: ValueType | null
  returnPromiseValueType?: ValueType | null
  returnSetElementType?: ValueType | null
  returnShape?: ObjectShapeInfo | null
  loc?: SourceLocation
  [key: string]: any
}

type CheckerMapType = {
  key: ValueType | null
  value: ValueType | null
}

type JsonParseLiteralTypeInfo = {
  valueType: ValueType
  shape: ObjectShapeInfo | null
  arrayElementType: ValueType | null
  arrayElementDeclaredType: string | null
}

type JsonParseLiteralResult = {
  info: JsonParseLiteralTypeInfo
  index: number
}

type JsonParseStringResult = {
  value: string
  index: number
}

type NullableConditionNarrowing = {
  trueNames: string[]
  falseNames: string[]
}

type ObjectShapeBases = {
  dynamic: boolean
  fields: AnyNode[]
}

type CheckProgramResult = {
  ast: ProgramNode
}

type UnsupportedEventStreamRuntimeExport = {
  source: string
  name: string
  reason: string
}

type RuntimeCallInfo = {
  method: string
  label: string
  unsupported: boolean
}

type FsBooleanOptions = {
  recursive?: boolean
  force?: boolean
  withFileTypes?: boolean
}

function resolvedValueTypeMetadata(
  value: ValueType | null | undefined,
  fallback: ValueType | null | undefined
): ValueType | null {
  if (value != null) {
    return value
  }

  if (fallback != null) {
    return fallback
  }

  return null
}

function resolvedConcreteValueTypeMetadata(
  value: ValueType | null | undefined,
  fallback: ValueType | null | undefined
): ValueType {
  const resolved = resolvedValueTypeMetadata(value, fallback)

  if (resolved != null) {
    return resolved
  }

  return 'unknown'
}

function resolvedStringMetadata(value: string | null | undefined, fallback: string | null | undefined): string | null {
  if (value != null) {
    return value
  }

  if (fallback != null) {
    return fallback
  }

  return null
}

function firstPathSegment(path: readonly string[]): string {
  return path[0]
}

function resolvedObjectShapeMetadata(
  value: ObjectShapeInfo | null | undefined,
  fallback: ObjectShapeInfo | null | undefined
): ObjectShapeInfo | null {
  if (value != null) {
    return value
  }

  if (fallback != null) {
    return fallback
  }

  return null
}

function resolvedFieldNullableMetadata(field: AnyNode, fieldType: ResolvedTypeInfo): boolean {
  if (field.ownership === 'weak') {
    return true
  }

  if (field.nullable === true) {
    return true
  }

  return fieldType.nullable
}

function resolvedFunctionTypeMetadata(
  value: FunctionTypeMetadata | null | undefined,
  fallback: FunctionTypeMetadata | null | undefined
): FunctionTypeMetadata | null {
  if (value != null) {
    return value
  }

  if (fallback != null) {
    return fallback
  }

  return null
}

function stringAt(values: string[], index: number): string {
  return values[index]
}

function checkerNodeAt(values: CheckerNode[], index: number): CheckerNode {
  return values[index]
}

function stringEquals(left: string, right: string): boolean {
  return left === right
}

function stringOrEmpty(value: string | null | undefined): string {
  if (value == null) {
    return ''
  }

  return value
}

function nodeNameEquals(node: AnyNode, name: string): boolean {
  return stringEquals(node.name, name)
}

function optionalParamAt(values: OptionalParamInfo[], index: number): OptionalParamInfo {
  return values[index]
}

function resolvedTypeInfoAt(values: ResolvedTypeInfo[], index: number): ResolvedTypeInfo {
  return values[index]
}

function stringSetFromArray(values: string[]): Set<string> {
  const result: Set<string> = new Set()

  for (let index = 0; index < values.length; index = index + 1) {
    result.add(stringAt(values, index))
  }

  return result
}

function cloneStringSet(values: Set<string>): Set<string> {
  return new Set(values)
}

function resolvedTypeListHasNullable(infos: ResolvedTypeInfo[]): boolean {
  for (let index = 0; index < infos.length; index = index + 1) {
    if (infos[index].nullable) {
      return true
    }
  }

  return false
}

function commonResolvedArrayElementType(infos: ResolvedTypeInfo[]): ValueType | null {
  return commonResolvedOptionalValueType(infos, resolvedArrayElementTypeKind)
}

function commonResolvedMapKeyType(infos: ResolvedTypeInfo[]): ValueType | null {
  return commonResolvedOptionalValueType(infos, resolvedMapKeyTypeKind)
}

function commonResolvedMapValueType(infos: ResolvedTypeInfo[]): ValueType | null {
  return commonResolvedOptionalValueType(infos, resolvedMapValueTypeKind)
}

function commonResolvedPromiseValueType(infos: ResolvedTypeInfo[]): ValueType | null {
  return commonResolvedOptionalValueType(infos, resolvedPromiseValueTypeKind)
}

function commonResolvedSetElementType(infos: ResolvedTypeInfo[]): ValueType | null {
  return commonResolvedOptionalValueType(infos, resolvedSetElementTypeKind)
}

function resolvedTypeInfoValue(info: ResolvedTypeInfo, kind: ResolvedTypeInfoValueKind): ValueType | null {
  if (kind === resolvedArrayElementTypeKind) {
    return info.arrayElementType
  }

  if (kind === resolvedMapKeyTypeKind) {
    return info.mapKeyType
  }

  if (kind === resolvedMapValueTypeKind) {
    return info.mapValueType
  }

  if (kind === resolvedPromiseValueTypeKind) {
    return info.promiseValueType ?? null
  }

  return info.setElementType
}

function commonResolvedOptionalValueType(infos: ResolvedTypeInfo[], kind: ResolvedTypeInfoValueKind): ValueType | null {
  const values: ValueType[] = []

  for (let index = 0; index < infos.length; index = index + 1) {
    const info = resolvedTypeInfoAt(infos, index)
    const value = resolvedTypeInfoValue(info, kind)

    if (value == null) {
      return null
    }

    values.push(value)
  }

  if (values.length === 0) {
    return null
  }

  return commonValueType(values)
}

class Scope {
  parent: Scope | null
  bindings: Map<string, SymbolInfo>

  constructor(parent: Scope | null) {
    this.parent = parent
    this.bindings = new Map()
  }

  hasOwn(name: string): boolean {
    return this.bindings.has(name)
  }

  resolve(name: string): SymbolInfo | null {
    const local = this.bindings.get(name)

    if (local != null) {
      return local
    }

    let current = this.parent

    while (current != null) {
      const found = current.bindings.get(name)

      if (found != null) {
        return found
      }

      current = current.parent
    }

    return null
  }
}

export function checkProgram(program: ProgramNode, options: CompileOptions = {}): CheckProgramResult {
  const checker = new Checker(program, options)
  checker.check()

  return {
    ast: program
  }
}

class Checker {
  program: ProgramNode
  options: CompileOptions
  diagnostics: Diagnostic[]
  scope: Scope
  types: Map<string, TypeAliasInfo>
  classNames: Set<string>
  breakDepth: number
  continueDepth: number
  currentReturnType: ValueType
  currentReturnNullable: boolean
  currentReturnPromiseValueType: ValueType | null
  currentReturnAsync: boolean
  currentClassConstructor: boolean
  asyncDepth: number
  functionDepth: number
  narrowedNullableNames: Set<string>
  resolvingDeclaredTypes: Set<string>

  constructor(program: ProgramNode, options: CompileOptions = {}) {
    this.program = program
    this.options = options
    this.diagnostics = []
    this.scope = new Scope(null)
    this.types = new Map()
    this.classNames = new Set()
    this.breakDepth = 0
    this.continueDepth = 0
    this.currentReturnType = 'void'
    this.currentReturnNullable = false
    this.currentReturnPromiseValueType = null
    this.currentReturnAsync = false
    this.currentClassConstructor = false
    this.asyncDepth = 0
    this.functionDepth = 0
    this.narrowedNullableNames = new Set()
    this.resolvingDeclaredTypes = new Set()
  }

  check(): void {
    this.collectTopLevelDeclarations()

    for (let index = 0; index < this.program.body.length; index = index + 1) {
      const item = checkerNodeAt(this.program.body, index)

      this.checkTopLevelItem(item)
    }

    throwDiagnostics(this.diagnostics)
  }

  collectTopLevelDeclarations(): void {
    for (let index = 0; index < this.program.body.length; index = index + 1) {
      const item = checkerNodeAt(this.program.body, index)

      if (item.type === 'TypeAliasDeclaration') {
        this.declareTypeAlias(item)
      } else if (item.type === 'ClassDeclaration') {
        this.classNames.add(item.name)
      }
    }

    this.reportOwnershipCycles()
    throwDiagnostics(this.diagnostics)

    for (let index = 0; index < this.program.body.length; index = index + 1) {
      const item = checkerNodeAt(this.program.body, index)

      if (item.type === 'ImportDeclaration') {
        if (item.typeOnly) {
          continue
        }

        for (let specifierIndex = 0; specifierIndex < item.specifiers.length; specifierIndex = specifierIndex + 1) {
          const specifier = checkerNodeAt(item.specifiers, specifierIndex)

          this.declare(
            specifier.local,
            {
              kind: 'import',
              mutable: false,
              valueType: this.runtimeImportValueType(item.source, specifier.imported),
              importedName: specifier.imported,
              importSource: item.source,
              loc: specifier.loc
            },
            specifier.loc
          )
        }
      }

      if (item.type === 'FunctionDeclaration') {
        const returnInfo = this.resolveDeclaredType(item.returnType, item.loc)

        this.declare(
          item.name,
          {
            kind: 'function',
            mutable: false,
            valueType: 'function',
            params: this.resolveParams(item.params),
            returnType: returnInfo.valueType,
            returnNullable: returnInfo.nullable,
            returnArrayElementType: returnInfo.arrayElementType,
            returnArrayElementDeclaredType: returnInfo.arrayElementDeclaredType,
            returnMapKeyType: returnInfo.mapKeyType,
            returnMapValueType: returnInfo.mapValueType,
            returnPromiseValueType: returnInfo.promiseValueType ?? null,
            returnSetElementType: returnInfo.setElementType,
            returnShape: returnInfo.shape,
            async: item.async,
            loc: item.loc
          },
          item.loc
        )
      }

      if (item.type === 'ClassDeclaration') {
        const constructorMethod = this.findClassConstructorMethod(item)
        let constructorParams: AnyNode[] = []

        if (constructorMethod != null) {
          constructorParams = this.resolveParams(constructorMethod.params)
        }

        const shape = this.resolveClassInstanceShape(item, constructorParams)

        item.shape = shape

        this.declare(
          item.name,
          {
            kind: 'class',
            mutable: false,
            valueType: 'class',
            classMethods: item.methods,
            constructorParams,
            shape,
            loc: item.loc
          },
          item.loc
        )
      }
    }
  }

  resolveParams(params: AnyNode[]): AnyNode[] {
    const resolved: AnyNode[] = []

    for (let index = 0; index < params.length; index = index + 1) {
      const param = params[index]
      resolved.push(this.resolveParam(param))
    }

    return resolved
  }

  resolveParam(param: AnyNode): AnyNode {
    const paramInfo = this.resolveDeclaredType(param.valueType, param.loc)
    let promiseValueType: ValueType | null = null

    if (paramInfo.promiseValueType != null) {
      promiseValueType = paramInfo.promiseValueType
    }

    return {
      name: param.name,
      loc: param.loc,
      declaredType: param.declaredType,
      optional: param.optional === true,
      valueType: paramInfo.valueType,
      nullable: paramInfo.nullable,
      arrayElementType: paramInfo.arrayElementType,
      arrayElementDeclaredType: paramInfo.arrayElementDeclaredType,
      mapKeyType: paramInfo.mapKeyType,
      mapValueType: paramInfo.mapValueType,
      promiseValueType,
      setElementType: paramInfo.setElementType,
      functionType: paramInfo.functionType,
      shape: paramInfo.shape
    }
  }

  acceptsArgumentCount(params: OptionalParamInfo[], count: number): boolean {
    return count >= this.requiredParamCount(params) && count <= params.length
  }

  argumentCountMessage(label: string, params: OptionalParamInfo[], count: number): string {
    const min = this.requiredParamCount(params)
    const max = params.length
    let expected = `${max}`

    if (min !== max) {
      expected = `${min}-${max}`
    }

    return `${label} expects ${expected} argument(s), got ${count}`
  }

  requiredParamCount(params: OptionalParamInfo[]): number {
    let count = 0

    for (let index = 0; index < params.length; index = index + 1) {
      const param = optionalParamAt(params, index)

      if (param.optional !== true) {
        count = count + 1
      }
    }

    return count
  }

  resolveClassInstanceShape(statement: AnyNode, constructorParams: AnyNode[]): ObjectShapeInfo {
    if (statement.fields != null && statement.fields.length > 0) {
      const resolvedFields: AnyNode[] = []

      for (let index = 0; index < statement.fields.length; index = index + 1) {
        const field = checkerNodeAt(statement.fields, index)

        resolvedFields.push(this.resolveClassField(field))
      }

      return {
        kind: 'object',
        fields: resolvedFields
      }
    }

    const fields: CheckerNode[] = []
    const seen: Set<string> = new Set()
    const constructorMethod = this.findClassConstructorMethod(statement)

    const assignments = this.collectClassConstructorFieldAssignments(constructorMethod)

    for (let index = 0; index < assignments.length; index = index + 1) {
      const assignment = checkerNodeAt(assignments, index)

      if (seen.has(assignment.field)) {
        continue
      }

      seen.add(assignment.field)
      fields.push({
        name: assignment.field,
        readonly: false,
        valueType: this.resolveClassConstructorFieldType(assignment.value, constructorParams),
        loc: assignment.loc
      })
    }

    return {
      kind: 'object',
      fields
    }
  }

  resolveClassField(field: AnyNode): AnyNode {
    const fieldInfo = this.resolveFieldDeclaredType(field)
    const declaredType = field.valueType

    return {
      type: field.type,
      name: field.name,
      optional: field.optional,
      readonly: field.readonly,
      ownership: field.ownership,
      weakLoc: field.weakLoc,
      static: field.static,
      staticLoc: field.staticLoc,
      weakTypeValidated: field.weakTypeValidated,
      loc: field.loc,
      declaredType,
      className: this.declaredClassName(declaredType),
      valueType: fieldInfo.valueType,
      nullable: fieldInfo.nullable,
      arrayElementType: fieldInfo.arrayElementType,
      arrayElementDeclaredType: fieldInfo.arrayElementDeclaredType,
      mapKeyType: fieldInfo.mapKeyType,
      mapValueType: fieldInfo.mapValueType,
      promiseValueType: fieldInfo.promiseValueType ?? null,
      setElementType: fieldInfo.setElementType,
      functionType: fieldInfo.functionType,
      shape: fieldInfo.shape
    }
  }

  declaredClassName(name: string | null | undefined): string | null {
    if (name == null) {
      return null
    }

    let actualName = name

    if (isNullableTypeName(name)) {
      actualName = nullableTypeNameFromKnownTypeName(name)
    }

    if (this.classNames.has(actualName)) {
      return actualName
    }

    const symbol = this.scope.resolve(actualName)

    if (symbol == null) {
      return null
    }

    if (symbol.kind === 'class') {
      return actualName
    }

    return null
  }

  findClassConstructorMethod(statement: AnyNode): NullableNode {
    for (let index = 0; index < statement.methods.length; index = index + 1) {
      const method = checkerNodeAt(statement.methods, index)

      if (nodeNameEquals(method, 'constructor')) {
        return method
      }
    }

    return null
  }

  collectClassConstructorFieldAssignments(constructorMethod: NullableNode): AnyNode[] {
    if (constructorMethod == null) {
      return []
    }

    const assignments: AnyNode[] = []

    for (let index = 0; index < constructorMethod.body.length; index = index + 1) {
      const statement = checkerNodeAt(constructorMethod.body, index)

      let assignment: NullableNode = null

      if (statement.type === 'ExpressionStatement' && statement.expression.type === 'AssignmentExpression') {
        assignment = statement.expression
      }

      if (assignment == null) {
        continue
      }

      const target = assignment.target

      if (target == null || target.type !== 'MemberExpression' || !this.isThisExpression(target.object)) {
        continue
      }

      assignments.push({
        field: target.property,
        value: assignment.value,
        loc: assignment.loc
      })
    }

    return assignments
  }

  resolveClassConstructorFieldType(expression: AnyNode, constructorParams: AnyNode[]): ValueType {
    if (expression.type === 'Reference' && expression.path.length === 1) {
      const param = this.findParamByName(constructorParams, expression.path[0])

      if (param != null) {
        return param.valueType
      }
    }

    if (expression.type === 'StringLiteral' || expression.type === 'TemplateLiteral') {
      return 'string'
    }

    if (expression.type === 'NumberLiteral') {
      return 'number'
    }

    if (expression.type === 'BooleanLiteral') {
      return 'boolean'
    }

    if (expression.type === 'ArrayLiteral') {
      return 'array'
    }

    if (expression.type === 'ObjectLiteral') {
      return 'object'
    }

    if (expression.valueType != null) {
      return expression.valueType
    }

    return 'unknown'
  }

  findParamByName(params: AnyNode[], name: string): NullableNode {
    for (let index = 0; index < params.length; index = index + 1) {
      const param = checkerNodeAt(params, index)

      if (nodeNameEquals(param, name)) {
        return param
      }
    }

    return null
  }

  checkTopLevelItem(item: AnyNode): void {
    if (item.type === 'TypeAliasDeclaration') {
      return
    }

    if (item.type === 'ImportDeclaration') {
      this.checkRuntimeBuiltinImport(item)
      return
    }

    if (item.type === 'ExportDeclaration') {
      return
    }

    if (item.type === 'FunctionDeclaration') {
      this.withScope(() => {
        const previousReturnType = this.currentReturnType
        const returnInfo = this.resolveDeclaredType(item.returnType, item.loc)
        this.currentReturnType = returnInfo.valueType
        const previousReturnNullable = this.currentReturnNullable
        this.currentReturnNullable = returnInfo.nullable
        const previousReturnPromiseValueType = this.currentReturnPromiseValueType
        let returnPromiseValueType: ValueType | null = null

        if (returnInfo.promiseValueType != null) {
          returnPromiseValueType = returnInfo.promiseValueType
        }

        this.currentReturnPromiseValueType = returnPromiseValueType
        const previousReturnAsync = this.currentReturnAsync
        this.currentReturnAsync = item.async === true
        const previousAsyncDepth = this.asyncDepth
        if (item.async) {
          this.asyncDepth = this.asyncDepth + 1
        }
        const previousFunctionDepth = this.functionDepth
        this.functionDepth = this.functionDepth + 1

        for (let paramIndex = 0; paramIndex < item.params.length; paramIndex = paramIndex + 1) {
          const param = checkerNodeAt(item.params, paramIndex)
          const paramInfo = this.resolveDeclaredType(param.valueType, param.loc)

          this.declare(
            param.name,
            {
              kind: 'param',
              mutable: true,
              valueType: paramInfo.valueType,
              nullable: paramInfo.nullable,
              arrayElementType: paramInfo.arrayElementType,
              arrayElementDeclaredType: paramInfo.arrayElementDeclaredType,
              mapKeyType: paramInfo.mapKeyType,
              mapValueType: paramInfo.mapValueType,
              promiseValueType: paramInfo.promiseValueType ?? null,
              setElementType: paramInfo.setElementType,
              functionType: paramInfo.functionType,
              shape: paramInfo.shape,
              loc: param.loc
            },
            param.loc
          )
        }

        try {
          this.checkStatements(item.body)
        } finally {
          this.currentReturnType = previousReturnType
          this.currentReturnNullable = previousReturnNullable
          this.currentReturnPromiseValueType = previousReturnPromiseValueType
          this.currentReturnAsync = previousReturnAsync
          this.asyncDepth = previousAsyncDepth
          this.functionDepth = previousFunctionDepth
        }
      })

      return
    }

    if (item.type === 'ClassDeclaration') {
      this.checkClassDeclaration(item)
      return
    }

    this.checkStatement(item)
  }

  checkStatements(statements: AnyNode[]): void {
    for (let index = 0; index < statements.length; index = index + 1) {
      const statement = checkerNodeAt(statements, index)

      this.checkStatement(statement)
      this.applyStatementExitNarrowing(statement)
    }
  }

  applyStatementExitNarrowing(statement: AnyNode): void {
    if (statement.type !== 'IfStatement') {
      return
    }

    if (statement.alternate != null) {
      return
    }

    if (!this.statementAlwaysExits(statement.consequent)) {
      return
    }

    const narrowing = this.resolveNullableConditionNarrowing(statement.condition)

    for (const name of narrowing.falseNames) {
      this.narrowedNullableNames.add(name)
    }
  }

  statementAlwaysExits(statement: AnyNode): boolean {
    if (
      statement.type === 'ReturnStatement' ||
      statement.type === 'ThrowStatement' ||
      statement.type === 'BreakStatement' ||
      statement.type === 'ContinueStatement'
    ) {
      return true
    }

    if (statement.type === 'BlockStatement') {
      return this.statementListAlwaysExits(statement.body)
    }

    if (statement.type === 'IfStatement') {
      if (statement.alternate == null) {
        return false
      }

      return this.statementAlwaysExits(statement.consequent) && this.statementAlwaysExits(statement.alternate)
    }

    return false
  }

  statementListAlwaysExits(statements: AnyNode[]): boolean {
    for (let index = 0; index < statements.length; index = index + 1) {
      const statement = checkerNodeAt(statements, index)

      if (this.statementAlwaysExits(statement)) {
        return true
      }
    }

    return false
  }

  checkStatement(statement: AnyNode): void {
    if (statement.type === 'BlockStatement') {
      this.withScope(() => {
        this.checkStatements(statement.body)
      })

      return
    }

    if (statement.type === 'IfStatement') {
      this.checkBooleanCondition(statement.condition)
      const narrowing = this.resolveNullableConditionNarrowing(statement.condition)

      this.withNarrowedNullableNames(narrowing.trueNames, () => {
        this.checkScopedBody(statement.consequent)
      })

      if (statement.alternate != null) {
        this.withNarrowedNullableNames(narrowing.falseNames, () => {
          this.checkScopedBody(statement.alternate)
        })
      }

      return
    }

    if (statement.type === 'WhileStatement') {
      this.checkBooleanCondition(statement.condition)
      const narrowing = this.resolveNullableConditionNarrowing(statement.condition)

      this.withLoop(() => {
        this.withNarrowedNullableNames(narrowing.trueNames, () => {
          this.checkScopedBody(statement.body)
        })
      })
      return
    }

    if (statement.type === 'ForStatement') {
      this.checkForStatement(statement)
      return
    }

    if (statement.type === 'ForOfStatement') {
      this.checkForOfStatement(statement)
      return
    }

    if (statement.type === 'SwitchStatement') {
      this.checkSwitchStatement(statement)
      return
    }

    if (statement.type === 'TryStatement') {
      this.checkTryStatement(statement)
      return
    }

    if (statement.type === 'BreakStatement') {
      if (this.breakDepth === 0) {
        this.report('CCJS_BREAK_OUTSIDE', 'break can only be used inside a loop or switch', statement.loc)
      }

      return
    }

    if (statement.type === 'ContinueStatement') {
      if (this.continueDepth === 0) {
        this.report('CCJS_CONTINUE_OUTSIDE', 'continue can only be used inside a loop', statement.loc)
      }

      return
    }

    if (statement.type === 'ThrowStatement') {
      this.checkExpression(statement.argument)
      return
    }

    if (statement.type === 'VariableDeclaration') {
      if (statement.kind === 'const' && statement.init == null) {
        this.report('CCJS_CONST_INIT', 'const declarations must have an initializer', statement.loc)
      }

      let declared: ResolvedTypeInfo | null = null

      if (statement.declaredType != null) {
        declared = this.resolveDeclaredType(statement.declaredType, statement.loc)
      }

      let initType: ValueType = 'unknown'

      if (statement.init != null) {
        initType = this.checkVariableInitializer(statement.init, declared)
      }

      let valueType = initType

      if (declared != null) {
        valueType = declared.valueType
      }

      let arrayElementType = this.resolveExpressionArrayElementType(statement.init)

      if (declared != null && declared.arrayElementType != null) {
        arrayElementType = declared.arrayElementType
      }

      let arrayElementDeclaredType = this.resolveExpressionArrayElementDeclaredType(statement.init)

      if (declared != null && declared.arrayElementDeclaredType != null) {
        arrayElementDeclaredType = declared.arrayElementDeclaredType
      }

      let mapType: CheckerMapType | null = this.resolveExpressionMapType(statement.init)

      if (declared != null && declared.valueType === 'map') {
        mapType = {
          key: declared.mapKeyType,
          value: declared.mapValueType
        }
      }

      let setElementType = this.resolveExpressionSetElementType(statement.init)

      if (declared != null && declared.valueType === 'set') {
        setElementType = declared.setElementType
      }

      let promiseValueType = this.resolveExpressionPromiseValueType(statement.init)

      if (declared != null && declared.valueType === 'promise') {
        promiseValueType = null

        if (declared.promiseValueType != null) {
          promiseValueType = declared.promiseValueType
        }
      }

      let nullable = false

      if (declared != null && declared.nullable === true) {
        nullable = true
      }

      if (statement.init != null && statement.init.nullable === true) {
        nullable = true
      }

      let statementArrayElementDeclaredType = arrayElementDeclaredType

      if (valueType === 'object' && statement.init != null && statement.init.arrayElementDeclaredType === 'fs.Dirent') {
        statementArrayElementDeclaredType = 'fs.Dirent'
      }

      let mapKeyType: ValueType | null = null
      let mapValueType: ValueType | null = null

      if (mapType != null) {
        mapKeyType = mapType.key
        mapValueType = mapType.value
      }

      let functionType: AnyNode | null = null

      if (declared != null && declared.functionType != null) {
        functionType = declared.functionType
      }

      let shape: ObjectShapeInfo | null = null

      if (declared != null && declared.shape != null) {
        shape = declared.shape
      } else if (statement.init != null && statement.init.shape != null) {
        shape = statement.init.shape
      } else if (
        valueType === 'object' &&
        statement.init != null &&
        (statement.init.arrayElementDeclaredType === 'fs.Dirent' ||
          statementArrayElementDeclaredType === 'fs.Dirent')
      ) {
        shape = fsDirentObjectShape
      }

      let className: string | null = null

      if (statement.init != null && statement.init.className != null) {
        className = statement.init.className
      }

      statement.valueType = valueType
      statement.nullable = nullable
      statement.arrayElementType = arrayElementType
      statement.arrayElementDeclaredType = statementArrayElementDeclaredType
      statement.mapKeyType = mapKeyType
      statement.mapValueType = mapValueType
      statement.promiseValueType = promiseValueType
      statement.setElementType = setElementType
      statement.functionType = functionType
      statement.shape = shape
      statement.className = className

      if (declared != null && statement.init != null && statement.init.type === 'ObjectLiteral') {
        const declaredShape = declared.shape

        if (declaredShape != null) {
          this.checkObjectLiteralAgainstShape(statement.init, declaredShape)
        }
      }

      this.declare(
        statement.name,
        {
          kind: statement.kind,
          mutable: statement.kind === 'let',
          valueType,
          nullable,
          arrayElementType,
          arrayElementDeclaredType,
          mapKeyType,
          mapValueType,
          promiseValueType,
          setElementType,
          functionType,
          className: statement.className,
          shape,
          loc: statement.loc
        },
        statement.loc
      )

      if (declared != null && statement.init != null) {
        this.checkAssignableType(
          initType,
          declared.valueType,
          statement.loc,
          declared.nullable,
          this.expressionCanBeNull(statement.init)
        )

        if (declared.valueType === 'array' && declared.arrayElementType != null) {
          this.checkAssignableType(
            this.resolveExpressionArrayElementType(statement.init),
            declared.arrayElementType,
            statement.loc,
            false,
            false
          )
        }

        if (declared.valueType === 'map') {
          const actual = this.resolveExpressionMapType(statement.init)
          let actualKey: ValueType | null = null
          let actualValue: ValueType | null = null

          if (actual != null) {
            actualKey = actual.key
            actualValue = actual.value
          }

          if (declared.mapKeyType != null) {
            this.checkAssignableType(actualKey, declared.mapKeyType, statement.loc, false, false)
          }

          if (declared.mapValueType != null) {
            this.checkAssignableType(actualValue, declared.mapValueType, statement.loc, false, false)
          }
        }

        if (declared.valueType === 'set' && declared.setElementType != null) {
          this.checkAssignableType(
            this.resolveExpressionSetElementType(statement.init),
            declared.setElementType,
            statement.loc,
            false,
            false
          )
        }

        if (declared.valueType === 'promise' && declared.promiseValueType != null) {
          this.checkAssignableType(
            this.resolveExpressionPromiseValueType(statement.init),
            declared.promiseValueType,
            statement.loc,
            false,
            false
          )
        }
      }

      return
    }

    if (statement.type === 'ExpressionStatement') {
      this.checkExpression(statement.expression)
      return
    }

    if (statement.type === 'ReturnStatement') {
      let actual: ValueType = 'void'

      if (statement.argument != null) {
        actual = this.checkExpression(statement.argument)
      }

      if (
        this.currentReturnAsync &&
        this.currentReturnType === 'promise' &&
        this.currentReturnPromiseValueType != null
      ) {
        if (actual === 'promise') {
          this.checkAssignableType(
            this.resolveExpressionPromiseValueType(statement.argument),
            this.currentReturnPromiseValueType,
            statement.loc,
            false,
            false
          )
        } else {
          this.checkAssignableType(
            actual,
            this.currentReturnPromiseValueType,
            statement.loc,
            false,
            this.expressionCanBeNull(statement.argument)
          )
        }

        return
      }

      this.checkAssignableType(
        actual,
        this.currentReturnType,
        statement.loc,
        this.currentReturnNullable,
        this.expressionCanBeNull(statement.argument)
      )

      if (this.currentReturnType === 'promise' && this.currentReturnPromiseValueType != null) {
        this.checkAssignableType(
          this.resolveExpressionPromiseValueType(statement.argument),
          this.currentReturnPromiseValueType,
          statement.loc,
          false,
          false
        )
      }
    }
  }

  checkTryStatement(statement: AnyNode): void {
    this.checkStatement(statement.block)

    if (statement.handler != null) {
      this.withScope(() => {
        if (statement.handler.param != null) {
          this.declare(
            statement.handler.param,
            {
              kind: 'catch',
              mutable: false,
              valueType: 'unknown',
              loc: statement.handler.paramLoc
            },
            statement.handler.paramLoc
          )
        }

        this.checkStatement(statement.handler.body)
      })
    }

    if (statement.finalizer != null) {
      this.checkStatement(statement.finalizer)
    }
  }

  checkExpression(expression: AnyNode): ValueType {
    if (expression.type === 'StringLiteral' || expression.type === 'TemplateLiteral') {
      return 'string'
    }

    if (expression.type === 'NumberLiteral') {
      return 'number'
    }

    if (expression.type === 'BooleanLiteral') {
      return 'boolean'
    }

    if (expression.type === 'NullLiteral') {
      return 'null'
    }

    if (expression.type === 'TypeAssertionExpression') {
      const valueType = this.checkExpression(expression.expression)
      const asserted = expression.expression

      expression.nullable = asserted.nullable === true
      expression.valueType = valueType
      expression.arrayElementType = null
      expression.arrayElementDeclaredType = null
      expression.mapKeyType = null
      expression.mapValueType = null
      expression.promiseValueType = null
      expression.setElementType = null
      expression.functionType = null
      expression.shape = null
      expression.className = null

      if (asserted.arrayElementType != null) {
        expression.arrayElementType = asserted.arrayElementType
      }

      if (asserted.arrayElementDeclaredType != null) {
        expression.arrayElementDeclaredType = asserted.arrayElementDeclaredType
      }

      if (asserted.mapKeyType != null) {
        expression.mapKeyType = asserted.mapKeyType
      }

      if (asserted.mapValueType != null) {
        expression.mapValueType = asserted.mapValueType
      }

      if (asserted.promiseValueType != null) {
        expression.promiseValueType = asserted.promiseValueType
      }

      if (asserted.setElementType != null) {
        expression.setElementType = asserted.setElementType
      }

      if (asserted.functionType != null) {
        expression.functionType = asserted.functionType
      }

      if (asserted.shape != null) {
        expression.shape = asserted.shape
      }

      if (asserted.className != null) {
        expression.className = asserted.className
      }

      return valueType
    }

    if (expression.type === 'ThisExpression') {
      const symbol = this.resolveReference({
        type: 'Reference',
        path: ['this'],
        loc: expression.loc
      })
      let valueType: ValueType = 'unknown'

      expression.nullable = false
      expression.valueType = valueType
      expression.shape = null
      expression.className = null

      if (symbol != null) {
        valueType = symbol.valueType
        expression.nullable = symbol.nullable === true
        expression.valueType = valueType

        if (symbol.shape != null) {
          expression.shape = symbol.shape
        }

        if (symbol.className != null) {
          expression.className = symbol.className
        }
      }

      return valueType
    }

    if (expression.type === 'Reference') {
      const symbol = this.resolveReference(expression)
      let valueType: ValueType = 'unknown'

      expression.nullable = false
      expression.valueType = valueType
      expression.arrayElementType = null
      expression.arrayElementDeclaredType = null
      expression.mapKeyType = null
      expression.mapValueType = null
      expression.promiseValueType = null
      expression.setElementType = null
      expression.functionType = null
      expression.shape = null
      expression.className = null

      if (symbol != null) {
        valueType = symbol.valueType
        expression.nullable = symbol.nullable === true && !this.narrowedNullableNames.has(expression.path[0])
        expression.valueType = valueType

        if (symbol.arrayElementType != null) {
          expression.arrayElementType = symbol.arrayElementType
        }

        if (symbol.arrayElementDeclaredType != null) {
          expression.arrayElementDeclaredType = symbol.arrayElementDeclaredType
        }

        if (symbol.mapKeyType != null) {
          expression.mapKeyType = symbol.mapKeyType
        }

        if (symbol.mapValueType != null) {
          expression.mapValueType = symbol.mapValueType
        }

        if (symbol.promiseValueType != null) {
          expression.promiseValueType = symbol.promiseValueType
        }

        if (symbol.setElementType != null) {
          expression.setElementType = symbol.setElementType
        }

        if (symbol.functionType != null) {
          expression.functionType = symbol.functionType
        }

        if (symbol.shape != null) {
          expression.shape = symbol.shape
        }

        if (symbol.className != null) {
          expression.className = symbol.className
        }
      }

      if (symbol != null && symbol.kind === 'import') {
        const importSource = symbol.importSource
        const importedName = symbol.importedName

        if (importedName != null && isNodeOsImportSource(importSource) && isOsRuntimeConstant(importedName)) {
          expression.osRuntimeConstant = importedName
        }

        if (
          importedName != null &&
          isNodeProcessImportSource(importSource) &&
          isProcessRuntimeProperty(importedName)
        ) {
          expression.processRuntimeProperty = importedName
          expression.valueType = processRuntimePropertyValueType(importedName) ?? 'unknown'
        }

        if (importedName != null && isNodePathImportSource(importSource) && isPathRuntimeConstant(importedName)) {
          expression.pathRuntimeConstant = importedName
        }
      }

      return valueType
    }

    if (expression.type === 'MemberExpression') {
      return this.checkMemberExpression(expression)
    }

    if (expression.type === 'IndexExpression') {
      return this.checkIndexExpression(expression)
    }

    if (expression.type === 'OptionalMemberExpression') {
      return this.checkOptionalMemberExpression(expression)
    }

    if (expression.type === 'OptionalIndexExpression') {
      return this.checkOptionalIndexExpression(expression)
    }

    if (expression.type === 'OptionalCallExpression') {
      this.checkExpression(expression.callee)
      const argTypes: ValueType[] = []

      for (let index = 0; index < expression.args.length; index = index + 1) {
        const arg = checkerNodeAt(expression.args, index)

        argTypes.push(this.checkExpression(arg))
      }

      const symbol = this.getCallableSymbol(expression.callee)

      if (symbol == null) {
        expression.valueType = 'unknown'
        expression.nullable = true

        return expression.valueType
      }

      expression.valueType = 'unknown'
      expression.nullable = true
      expression.arrayElementType = null
      expression.arrayElementDeclaredType = null
      expression.mapKeyType = null
      expression.mapValueType = null
      expression.promiseValueType = null
      expression.setElementType = null
      expression.shape = null

      if (symbol.returnType != null) {
        expression.valueType = symbol.returnType
      }

      if (symbol.returnArrayElementType != null) {
        expression.arrayElementType = symbol.returnArrayElementType
      }

      if (symbol.returnArrayElementDeclaredType != null) {
        expression.arrayElementDeclaredType = symbol.returnArrayElementDeclaredType
      }

      if (symbol.returnMapKeyType != null) {
        expression.mapKeyType = symbol.returnMapKeyType
      }

      if (symbol.returnMapValueType != null) {
        expression.mapValueType = symbol.returnMapValueType
      }

      if (symbol.returnPromiseValueType != null) {
        expression.promiseValueType = symbol.returnPromiseValueType
      }

      if (symbol.returnSetElementType != null) {
        expression.setElementType = symbol.returnSetElementType
      }

      if (symbol.returnShape != null) {
        expression.shape = symbol.returnShape
      }

      const params = symbol.params

      if (params != null) {
        if (!this.acceptsArgumentCount(params, expression.args.length)) {
          let name = 'callable'

          if (expression.callee.type === 'Reference') {
            name = firstPathSegment(expression.callee.path)
          }

          this.report(
            'CCJS_ARG_COUNT',
            this.argumentCountMessage(`function ${name}`, params, expression.args.length),
            expression.loc
          )
        }

        for (let index = 0; index < params.length; index++) {
          const param = params[index]

          if (index < argTypes.length) {
            this.checkAssignableType(
              argTypes[index],
              param.valueType,
              expression.args[index].loc,
              param.nullable === true,
              this.expressionCanBeNull(expression.args[index])
            )
          }
        }
      }

      return expression.valueType
    }

    if (expression.type === 'NewExpression') {
      return this.checkNewExpression(expression)
    }

    if (expression.type === 'AwaitExpression') {
      if (this.asyncDepth === 0 && this.functionDepth > 0) {
        this.report('CCJS_AWAIT_OUTSIDE_ASYNC', 'await can only be used inside async functions', expression.loc)
      }

      const argumentType = this.checkExpression(expression.argument)
      let valueType = argumentType

      if (argumentType === 'promise') {
        valueType = 'unknown'

        const promiseValueType = this.resolveExpressionPromiseValueType(expression.argument)

        if (promiseValueType != null) {
          valueType = promiseValueType
        }
      }

      expression.valueType = valueType

      if (valueType === 'array') {
        expression.arrayElementType = this.resolveExpressionArrayElementType(expression.argument)
        expression.arrayElementDeclaredType = this.resolveExpressionArrayElementDeclaredType(expression.argument)
      }

      if (valueType === 'object') {
        expression.shape = this.resolveExpressionShape(expression.argument)
      }

      return valueType
    }

    if (expression.type === 'ArrowFunctionExpression') {
      this.checkArrowFunctionExpression(expression, null)
      return 'function'
    }

    if (expression.type === 'CallExpression') {
      return this.checkCallExpression(expression)
    }

    if (expression.type === 'AssignmentExpression') {
      return this.checkAssignment(expression)
    }

    if (expression.type === 'UpdateExpression') {
      return this.checkUpdateExpression(expression)
    }

    if (expression.type === 'BinaryExpression') {
      return this.checkBinaryExpression(expression)
    }

    if (expression.type === 'UnaryExpression') {
      this.checkExpression(expression.argument)
      if (expression.operator === 'typeof') {
        expression.valueType = 'string'
        return 'string'
      }

      if (expression.operator === '!') {
        expression.valueType = 'boolean'
        return 'boolean'
      }

      expression.valueType = 'number'
      return 'number'
    }

    if (expression.type === 'ArrayLiteral') {
      const elementTypes: ValueType[] = []

      for (let index = 0; index < expression.elements.length; index = index + 1) {
        const element = checkerNodeAt(expression.elements, index)

        elementTypes.push(this.checkExpression(element))
      }

      expression.arrayElementType = commonArrayElementType(elementTypes)
      expression.arrayElementDeclaredType = expression.arrayElementType

      return 'array'
    }

    if (expression.type === 'ObjectLiteral') {
      this.checkObjectLiteral(expression)
      return 'object'
    }

    return 'unknown'
  }

  checkAssignment(expression: AnyNode): ValueType {
    if (expression.target.type === 'MemberExpression') {
      return this.checkMemberAssignment(expression)
    }

    if (expression.target.type === 'IndexExpression') {
      return this.checkIndexAssignment(expression)
    }

    if (expression.target.type !== 'Reference') {
      this.report('CCJS_INVALID_ASSIGNMENT_TARGET', 'assignment target must be a binding or field', expression.loc)
      return this.checkExpression(expression.value)
    }

    const symbol = this.resolveReference(expression.target)
    const valueType = this.checkExpression(expression.value)

    if (symbol != null) {
      if (expression.target.path.length === 1 && symbol.mutable !== true) {
        this.report(
          'CCJS_ASSIGN_CONST',
          `cannot assign to ${symbol.kind} binding ${expression.target.path[0]}`,
          expression.target.loc
        )
      }
    }

    if (symbol != null) {
      this.checkAssignableType(
        valueType,
        symbol.valueType,
        expression.value.loc,
        symbol.nullable === true,
        this.expressionCanBeNull(expression.value)
      )

      if (symbol.valueType === 'promise' && symbol.promiseValueType != null) {
        this.checkAssignableType(
          this.resolveExpressionPromiseValueType(expression.value),
          symbol.promiseValueType,
          expression.value.loc,
          false,
          false
        )
      }

      if (expression.target.path.length === 1) {
        if (symbol.nullable === true) {
          this.narrowedNullableNames.delete(firstPathSegment(expression.target.path))
        }
      }
    }

    return valueType
  }

  checkUpdateExpression(expression: AnyNode): ValueType {
    const targetType = this.checkExpression(expression.argument)

    this.checkAssignableType(targetType, 'number', expression.argument.loc, false, false)

    if (expression.argument.type === 'Reference') {
      const symbol = this.resolveReference(expression.argument)

      if (symbol != null) {
        if (expression.argument.path.length === 1 && symbol.mutable !== true) {
          this.report(
            'CCJS_ASSIGN_CONST',
            `cannot assign to ${symbol.kind} binding ${expression.argument.path[0]}`,
            expression.argument.loc
          )
        }
      }

      return 'number'
    }

    if (expression.argument.type === 'MemberExpression') {
      return 'number'
    }

    if (expression.argument.type === 'IndexExpression') {
      return 'number'
    }

    this.report('CCJS_INVALID_ASSIGNMENT_TARGET', 'update target must be a binding or field', expression.loc)

    return 'number'
  }

  checkBinaryExpression(expression: AnyNode): ValueType {
    const left = this.checkExpression(expression.left)
    const leftNarrowing = this.resolveNullableConditionNarrowing(expression.left)
    let right = 'unknown'

    if (expression.operator === '&&') {
      right = this.withNarrowedNullableNames(leftNarrowing.trueNames, () => this.checkExpression(expression.right))
    } else if (expression.operator === '||') {
      right = this.withNarrowedNullableNames(leftNarrowing.falseNames, () => this.checkExpression(expression.right))
    } else {
      right = this.checkExpression(expression.right)
    }
    const nullableEquality =
      isEqualityOperator(expression.operator) &&
      ((left === 'null' && this.expressionCanBeNull(expression.right)) ||
        (right === 'null' && this.expressionCanBeNull(expression.left)))

    if (isEqualityOperator(expression.operator) && !nullableEquality && !isEqualityComparableType(left, right)) {
      this.report(
        'CCJS_TYPE_MISMATCH',
        `cannot compare ${left} and ${right} with ${expression.operator}`,
        expression.loc
      )
    }

    const valueType = inferBinaryExpressionType(expression.operator, left, right)
    expression.valueType = valueType
    expression.nullable = expression.operator === '??' && this.expressionCanBeNull(expression.right)

    return valueType
  }

  expressionCanBeNull(expression: AnyNode | null): boolean {
    if (expression == null) {
      return false
    }

    return expression.type === 'NullLiteral' || expression.nullable === true
  }

  checkMemberExpression(expression: AnyNode): ValueType {
    const osConstantType = this.checkOsConstantMemberExpression(expression)

    if (osConstantType != null) {
      return osConstantType
    }

    const processMemberType = this.checkProcessMemberExpression(expression)

    if (processMemberType != null) {
      return processMemberType
    }

    const pathConstantType = this.checkPathConstantMemberExpression(expression)

    if (pathConstantType != null) {
      return pathConstantType
    }

    const bufferConstantType = this.checkBufferConstantMemberExpression(expression)

    if (bufferConstantType != null) {
      return bufferConstantType
    }

    const fsConstantType = this.checkFsConstantMemberExpression(expression)

    if (fsConstantType != null) {
      return fsConstantType
    }

    const unsupportedFetchBodyType = this.checkFetchUnsupportedResponseBodyMember(expression)

    if (unsupportedFetchBodyType != null) {
      return unsupportedFetchBodyType
    }

    const objectType = this.checkExpression(expression.object)

    this.reportNullableRuntimeAccess(expression.object, expression.loc)

    if (objectType === 'bytes' && expression.property === 'length') {
      expression.valueType = 'number'
      return 'number'
    }

    if (objectType === 'string' && expression.property === 'length') {
      expression.valueType = 'number'
      expression.stringRuntimeMethod = 'length'
      return 'number'
    }

    if (objectType === 'array' && expression.property === 'length') {
      return 'number'
    }

    if ((objectType === 'map' || objectType === 'set') && expression.property === 'size') {
      return 'number'
    }

    const shape = this.resolveExpressionShape(expression.object)

    if (shape == null) {
      return 'unknown'
    }

    const field = this.findShapeField(shape, expression.property)

    if (field == null) {
      this.report('CCJS_UNKNOWN_FIELD', `unknown field ${expression.property}`, expression.loc)
      return 'unknown'
    }

    const fieldType = this.resolveFieldDeclaredType(field)
    const valueType = resolvedConcreteValueTypeMetadata(field.valueType, fieldType.valueType)

    expression.nullable = resolvedFieldNullableMetadata(field, fieldType)
    expression.valueType = valueType
    expression.arrayElementType = resolvedValueTypeMetadata(field.arrayElementType, fieldType.arrayElementType)
    expression.arrayElementDeclaredType = resolvedStringMetadata(
      field.arrayElementDeclaredType,
      fieldType.arrayElementDeclaredType
    )
    expression.mapKeyType = resolvedValueTypeMetadata(field.mapKeyType, fieldType.mapKeyType)
    expression.mapValueType = resolvedValueTypeMetadata(field.mapValueType, fieldType.mapValueType)
    expression.promiseValueType = resolvedValueTypeMetadata(field.promiseValueType, fieldType.promiseValueType)
    expression.setElementType = resolvedValueTypeMetadata(field.setElementType, fieldType.setElementType)
    expression.shape = resolvedObjectShapeMetadata(field.shape, fieldType.shape)
    expression.functionType = resolvedFunctionTypeMetadata(field.functionType, fieldType.functionType)
    expression.className = null

    if (field.className != null) {
      expression.className = field.className
    }

    return valueType
  }

  checkOptionalMemberExpression(expression: AnyNode): ValueType {
    this.checkExpression(expression.object)

    const shape = this.resolveExpressionShape(expression.object)

    if (shape == null) {
      expression.nullable = true
      expression.valueType = 'unknown'
      return 'unknown'
    }

    const field = this.findShapeField(shape, expression.property)

    if (field == null) {
      this.report('CCJS_UNKNOWN_FIELD', `unknown field ${expression.property}`, expression.loc)
      expression.nullable = true
      expression.valueType = 'unknown'
      return 'unknown'
    }

    const fieldType = this.resolveFieldDeclaredType(field)
    const valueType = resolvedConcreteValueTypeMetadata(field.valueType, fieldType.valueType)

    expression.nullable = true
    expression.valueType = valueType
    expression.arrayElementType = resolvedValueTypeMetadata(field.arrayElementType, fieldType.arrayElementType)
    expression.arrayElementDeclaredType = resolvedStringMetadata(
      field.arrayElementDeclaredType,
      fieldType.arrayElementDeclaredType
    )
    expression.mapKeyType = resolvedValueTypeMetadata(field.mapKeyType, fieldType.mapKeyType)
    expression.mapValueType = resolvedValueTypeMetadata(field.mapValueType, fieldType.mapValueType)
    expression.promiseValueType = resolvedValueTypeMetadata(field.promiseValueType, fieldType.promiseValueType)
    expression.setElementType = resolvedValueTypeMetadata(field.setElementType, fieldType.setElementType)
    expression.shape = resolvedObjectShapeMetadata(field.shape, fieldType.shape)
    expression.functionType = resolvedFunctionTypeMetadata(field.functionType, fieldType.functionType)
    expression.className = null

    if (field.className != null) {
      expression.className = field.className
    }

    return valueType
  }

  checkMemberAssignment(expression: AnyNode): ValueType {
    const processAssignmentType = this.checkProcessMemberAssignment(expression)

    if (processAssignmentType != null) {
      return processAssignmentType
    }

    const targetType = this.checkExpression(expression.target.object)
    const shape = this.resolveExpressionShape(expression.target.object)
    const valueType = this.checkExpression(expression.value)

    if (targetType === 'string' && expression.target.property === 'length') {
      this.report('CCJS_ASSIGN_READONLY_FIELD', 'cannot assign to readonly field length', expression.target.loc)
      return valueType
    }

    if (targetType === 'array' && expression.target.property === 'length') {
      this.report('CCJS_ASSIGN_READONLY_FIELD', 'cannot assign to readonly field length', expression.target.loc)
      return valueType
    }

    if (targetType === 'map' || targetType === 'set') {
      if (expression.target.property === 'size') {
        this.report('CCJS_ASSIGN_READONLY_FIELD', 'cannot assign to readonly field size', expression.target.loc)
        return valueType
      }
    }

    if (targetType === 'bytes' && expression.target.property === 'length') {
      this.report('CCJS_ASSIGN_READONLY_FIELD', 'cannot assign to readonly field length', expression.target.loc)
      return valueType
    }

    if (shape == null) {
      return valueType
    }

    if (shape.builtin === 'url.URL') {
      if (isUrlMutableObjectField(expression.target.property)) {
        this.checkAssignableType(
          valueType,
          'string',
          expression.value.loc,
          false,
          this.expressionCanBeNull(expression.value)
        )
        expression.urlRuntimeMethod = 'URL.setField'
        expression.urlRuntimeField = expression.target.property
        return valueType
      }
    }

    const field = this.findShapeField(shape, expression.target.property)

    if (field == null) {
      this.report('CCJS_UNKNOWN_FIELD', `unknown field ${expression.target.property}`, expression.target.loc)
      return valueType
    }

    if (field.readonly === true) {
      if (!this.canInitializeReadonlyClassField(expression.target.object)) {
        this.report(
          'CCJS_ASSIGN_READONLY_FIELD',
          `cannot assign to readonly field ${expression.target.property}`,
          expression.target.loc
        )
      }
    }

    const fieldType = this.resolveFieldDeclaredType(field)
    const targetValueType = resolvedConcreteValueTypeMetadata(field.valueType, fieldType.valueType)

    expression.target.nullable = resolvedFieldNullableMetadata(field, fieldType)
    expression.target.valueType = targetValueType
    expression.target.arrayElementType = resolvedValueTypeMetadata(field.arrayElementType, fieldType.arrayElementType)
    expression.target.arrayElementDeclaredType = resolvedStringMetadata(
      field.arrayElementDeclaredType,
      fieldType.arrayElementDeclaredType
    )
    expression.target.mapKeyType = resolvedValueTypeMetadata(field.mapKeyType, fieldType.mapKeyType)
    expression.target.mapValueType = resolvedValueTypeMetadata(field.mapValueType, fieldType.mapValueType)
    expression.target.promiseValueType = resolvedValueTypeMetadata(field.promiseValueType, fieldType.promiseValueType)
    expression.target.setElementType = resolvedValueTypeMetadata(field.setElementType, fieldType.setElementType)
    expression.target.shape = resolvedObjectShapeMetadata(field.shape, fieldType.shape)
    expression.target.functionType = resolvedFunctionTypeMetadata(field.functionType, fieldType.functionType)
    expression.target.className = null

    if (field.className != null) {
      expression.target.className = field.className
    }

    this.checkAssignableType(
      valueType,
      fieldType.valueType,
      expression.value.loc,
      fieldType.nullable,
      this.expressionCanBeNull(expression.value)
    )

    if (fieldType.valueType === 'array' && fieldType.arrayElementType != null) {
      this.checkAssignableType(
        this.resolveExpressionArrayElementType(expression.value),
        fieldType.arrayElementType,
        expression.value.loc,
        false,
        false
      )
    }

    if (fieldType.valueType === 'map') {
      const actual = this.resolveExpressionMapType(expression.value)

      if (fieldType.mapKeyType != null) {
        this.checkAssignableType(actual?.key, fieldType.mapKeyType, expression.value.loc, false, false)
      }

      if (fieldType.mapValueType != null) {
        this.checkAssignableType(actual?.value, fieldType.mapValueType, expression.value.loc, false, false)
      }
    }

    if (fieldType.valueType === 'set' && fieldType.setElementType != null) {
      this.checkAssignableType(
        this.resolveExpressionSetElementType(expression.value),
        fieldType.setElementType,
        expression.value.loc,
        false,
        false
      )
    }

    if (fieldType.valueType === 'promise' && fieldType.promiseValueType != null) {
      this.checkAssignableType(
        this.resolveExpressionPromiseValueType(expression.value),
        fieldType.promiseValueType,
        expression.value.loc,
        false,
        false
      )
    }

    return valueType
  }

  checkIndexExpression(expression: AnyNode): ValueType {
    const processIndexType = this.checkProcessIndexExpression(expression)

    if (processIndexType != null) {
      return processIndexType
    }

    const objectType = this.checkExpression(expression.object)
    const indexType = this.checkExpression(expression.index)

    this.reportNullableRuntimeAccess(expression.object, expression.loc)

    if (objectType === 'map') {
      const mapType = this.resolveExpressionMapType(expression.object) ?? {
        key: 'unknown',
        value: 'unknown'
      }
      const mapValueType = resolvedConcreteValueTypeMetadata(mapType.value, 'unknown')
      const mapKeyType = resolvedStringMetadata(mapType.key, null)
      const mapValueMetadata = resolvedStringMetadata(mapType.value, null)

      this.checkAssignableType(
        indexType,
        mapType.key,
        expression.index.loc,
        false,
        this.expressionCanBeNull(expression.index)
      )

      expression.collectionKind = 'map'
      expression.nullable = true
      expression.valueType = mapValueType
      expression.mapKeyType = mapKeyType
      expression.mapValueType = mapValueMetadata

      return mapValueType
    }

    if (expression.index.type !== 'StringLiteral') {
      if (objectType === 'string') {
        this.checkAssignableType(indexType, 'number', expression.index.loc, false, false)
        expression.valueType = 'string'
        return 'string'
      }

      if (objectType === 'bytes') {
        this.checkAssignableType(indexType, 'number', expression.index.loc, false, false)
        expression.valueType = 'number'
        return 'number'
      }

      if (objectType === 'array') {
        this.checkAssignableType(indexType, 'number', expression.index.loc, false, false)
        const valueType = this.resolveExpressionArrayElementType(expression.object) ?? 'unknown'
        const declaredType = this.resolveExpressionArrayElementDeclaredType(expression.object)
        expression.valueType = valueType
        expression.arrayElementDeclaredType = declaredType
        expression.shape = this.resolveArrayElementObjectShape(valueType, declaredType, expression.loc)

        return valueType
      }

      return 'unknown'
    }

    const shape = this.resolveExpressionShape(expression.object)

    if (shape == null) {
      return 'unknown'
    }

    const field = this.findShapeField(shape, expression.index.value)

    if (field == null) {
      this.report('CCJS_UNKNOWN_FIELD', `unknown field ${expression.index.value}`, expression.index.loc)
      return 'unknown'
    }

    const fieldType = this.resolveFieldDeclaredType(field)
    const valueType = resolvedConcreteValueTypeMetadata(field.valueType, fieldType.valueType)

    expression.nullable = resolvedFieldNullableMetadata(field, fieldType)
    expression.valueType = valueType
    expression.arrayElementType = resolvedValueTypeMetadata(field.arrayElementType, fieldType.arrayElementType)
    expression.arrayElementDeclaredType = resolvedStringMetadata(
      field.arrayElementDeclaredType,
      fieldType.arrayElementDeclaredType
    )
    expression.mapKeyType = resolvedValueTypeMetadata(field.mapKeyType, fieldType.mapKeyType)
    expression.mapValueType = resolvedValueTypeMetadata(field.mapValueType, fieldType.mapValueType)
    expression.promiseValueType = resolvedValueTypeMetadata(field.promiseValueType, fieldType.promiseValueType)
    expression.setElementType = resolvedValueTypeMetadata(field.setElementType, fieldType.setElementType)
    expression.shape = resolvedObjectShapeMetadata(field.shape, fieldType.shape)
    expression.functionType = resolvedFunctionTypeMetadata(field.functionType, fieldType.functionType)
    expression.className = null

    if (field.className != null) {
      expression.className = field.className
    }

    return valueType
  }

  checkOptionalIndexExpression(expression: AnyNode): ValueType {
    const objectType = this.checkExpression(expression.object)
    const indexType = this.checkExpression(expression.index)

    if (expression.index.type !== 'StringLiteral') {
      if (objectType === 'array') {
        this.checkAssignableType(indexType, 'number', expression.index.loc, false, false)
        const valueType = this.resolveExpressionArrayElementType(expression.object) ?? 'unknown'
        const declaredType = this.resolveExpressionArrayElementDeclaredType(expression.object)

        expression.nullable = true
        expression.valueType = valueType
        expression.arrayElementDeclaredType = declaredType
        expression.shape = this.resolveArrayElementObjectShape(valueType, declaredType, expression.loc)

        return valueType
      }

      expression.nullable = true
      expression.valueType = 'unknown'

      return 'unknown'
    }

    const shape = this.resolveExpressionShape(expression.object)

    if (shape == null) {
      expression.nullable = true
      expression.valueType = 'unknown'
      return 'unknown'
    }

    const field = this.findShapeField(shape, expression.index.value)

    if (field == null) {
      this.report('CCJS_UNKNOWN_FIELD', `unknown field ${expression.index.value}`, expression.index.loc)
      expression.nullable = true
      expression.valueType = 'unknown'
      return 'unknown'
    }

    const fieldType = this.resolveFieldDeclaredType(field)
    const valueType = resolvedConcreteValueTypeMetadata(field.valueType, fieldType.valueType)

    expression.nullable = true
    expression.valueType = valueType
    expression.arrayElementType = resolvedValueTypeMetadata(field.arrayElementType, fieldType.arrayElementType)
    expression.arrayElementDeclaredType = resolvedStringMetadata(
      field.arrayElementDeclaredType,
      fieldType.arrayElementDeclaredType
    )
    expression.mapKeyType = resolvedValueTypeMetadata(field.mapKeyType, fieldType.mapKeyType)
    expression.mapValueType = resolvedValueTypeMetadata(field.mapValueType, fieldType.mapValueType)
    expression.promiseValueType = resolvedValueTypeMetadata(field.promiseValueType, fieldType.promiseValueType)
    expression.setElementType = resolvedValueTypeMetadata(field.setElementType, fieldType.setElementType)
    expression.shape = resolvedObjectShapeMetadata(field.shape, fieldType.shape)
    expression.functionType = resolvedFunctionTypeMetadata(field.functionType, fieldType.functionType)
    expression.className = null

    if (field.className != null) {
      expression.className = field.className
    }

    return valueType
  }

  checkIndexAssignment(expression: AnyNode): ValueType {
    const objectType = this.checkExpression(expression.target.object)
    const indexType = this.checkExpression(expression.target.index)
    const valueType = this.checkExpression(expression.value)

    if (objectType === 'map') {
      const mapType = this.resolveExpressionMapType(expression.target.object) ?? {
        key: 'unknown',
        value: 'unknown'
      }
      const mapValueType = resolvedConcreteValueTypeMetadata(mapType.value, 'unknown')
      const mapKeyType = resolvedStringMetadata(mapType.key, null)
      const mapValueMetadata = resolvedStringMetadata(mapType.value, null)

      this.checkAssignableType(
        indexType,
        mapType.key,
        expression.target.index.loc,
        false,
        this.expressionCanBeNull(expression.target.index)
      )
      this.checkAssignableType(
        valueType,
        mapType.value,
        expression.value.loc,
        false,
        this.expressionCanBeNull(expression.value)
      )

      expression.target.collectionKind = 'map'
      expression.target.valueType = mapValueType
      expression.target.mapKeyType = mapKeyType
      expression.target.mapValueType = mapValueMetadata

      return valueType
    }

    if (objectType === 'bytes') {
      if (expression.target.index.type !== 'StringLiteral') {
        this.checkAssignableType(indexType, 'number', expression.target.index.loc, false, false)
        this.checkAssignableType(valueType, 'number', expression.value.loc, false, false)
        expression.target.valueType = 'number'
        return valueType
      }
    }

    if (expression.target.index.type !== 'StringLiteral') {
      return valueType
    }

    const shape = this.resolveExpressionShape(expression.target.object)

    if (shape == null) {
      return valueType
    }

    const field = this.findShapeField(shape, expression.target.index.value)

    if (field == null) {
      this.report('CCJS_UNKNOWN_FIELD', `unknown field ${expression.target.index.value}`, expression.target.index.loc)
      return valueType
    }

    if (field.readonly === true) {
      if (!this.canInitializeReadonlyClassField(expression.target.object)) {
        this.report(
          'CCJS_ASSIGN_READONLY_FIELD',
          `cannot assign to readonly field ${expression.target.index.value}`,
          expression.target.loc
        )
      }
    }

    const fieldType = this.resolveFieldDeclaredType(field)
    const targetValueType = resolvedConcreteValueTypeMetadata(field.valueType, fieldType.valueType)

    expression.target.nullable = resolvedFieldNullableMetadata(field, fieldType)
    expression.target.valueType = targetValueType
    expression.target.arrayElementType = resolvedValueTypeMetadata(field.arrayElementType, fieldType.arrayElementType)
    expression.target.arrayElementDeclaredType = resolvedStringMetadata(
      field.arrayElementDeclaredType,
      fieldType.arrayElementDeclaredType
    )
    expression.target.mapKeyType = resolvedValueTypeMetadata(field.mapKeyType, fieldType.mapKeyType)
    expression.target.mapValueType = resolvedValueTypeMetadata(field.mapValueType, fieldType.mapValueType)
    expression.target.promiseValueType = resolvedValueTypeMetadata(field.promiseValueType, fieldType.promiseValueType)
    expression.target.setElementType = resolvedValueTypeMetadata(field.setElementType, fieldType.setElementType)
    expression.target.shape = resolvedObjectShapeMetadata(field.shape, fieldType.shape)
    expression.target.functionType = resolvedFunctionTypeMetadata(field.functionType, fieldType.functionType)
    expression.target.className = null

    if (field.className != null) {
      expression.target.className = field.className
    }

    this.checkAssignableType(
      valueType,
      fieldType.valueType,
      expression.value.loc,
      fieldType.nullable,
      this.expressionCanBeNull(expression.value)
    )

    if (fieldType.valueType === 'array' && fieldType.arrayElementType != null) {
      this.checkAssignableType(
        this.resolveExpressionArrayElementType(expression.value),
        fieldType.arrayElementType,
        expression.value.loc,
        false,
        false
      )
    }

    if (fieldType.valueType === 'map') {
      const actual = this.resolveExpressionMapType(expression.value)

      if (fieldType.mapKeyType != null) {
        this.checkAssignableType(actual?.key, fieldType.mapKeyType, expression.value.loc, false, false)
      }

      if (fieldType.mapValueType != null) {
        this.checkAssignableType(actual?.value, fieldType.mapValueType, expression.value.loc, false, false)
      }
    }

    if (fieldType.valueType === 'set' && fieldType.setElementType != null) {
      this.checkAssignableType(
        this.resolveExpressionSetElementType(expression.value),
        fieldType.setElementType,
        expression.value.loc,
        false,
        false
      )
    }

    if (fieldType.valueType === 'promise' && fieldType.promiseValueType != null) {
      this.checkAssignableType(
        this.resolveExpressionPromiseValueType(expression.value),
        fieldType.promiseValueType,
        expression.value.loc,
        false,
        false
      )
    }

    return valueType
  }

  checkCallExpression(expression: AnyNode): ValueType {
    const binaryType = this.checkBinaryCall(expression)

    if (binaryType != null) {
      return binaryType
    }

    const bufferUnsupportedType = this.checkBufferUnsupportedCall(expression)

    if (bufferUnsupportedType != null) {
      return bufferUnsupportedType
    }

    const eventStreamUnsupportedType = this.checkEventStreamUnsupportedCall(expression)

    if (eventStreamUnsupportedType != null) {
      return eventStreamUnsupportedType
    }

    const stringConversionType = this.checkStringConversionCall(expression)

    if (stringConversionType != null) {
      return stringConversionType
    }

    const numberConversionType = this.checkNumberConversionCall(expression)

    if (numberConversionType != null) {
      return numberConversionType
    }

    const numericCastType = this.checkNumericCastCall(expression)

    if (numericCastType != null) {
      return numericCastType
    }

    const stringCharCodeAtType = this.checkStringCharCodeAtCall(expression)

    if (stringCharCodeAtType != null) {
      return stringCharCodeAtType
    }

    const stringIndexType = this.checkStringIndexCall(expression)

    if (stringIndexType != null) {
      return stringIndexType
    }

    const stringTrimType = this.checkStringTrimCall(expression)

    if (stringTrimType != null) {
      return stringTrimType
    }

    const stringSliceType = this.checkStringSliceCall(expression)

    if (stringSliceType != null) {
      return stringSliceType
    }

    const stringSplitType = this.checkStringSplitCall(expression)

    if (stringSplitType != null) {
      return stringSplitType
    }

    const stringMethodType = this.checkStringPredicateCall(expression)

    if (stringMethodType != null) {
      return stringMethodType
    }

    const arrayMethodType = this.checkArrayMethodCall(expression)

    if (arrayMethodType != null) {
      return arrayMethodType
    }

    const collectionMethodType = this.checkCollectionMethodCall(expression)

    if (collectionMethodType != null) {
      return collectionMethodType
    }

    const promiseMethodType = this.checkPromiseMethodCall(expression)

    if (promiseMethodType != null) {
      return promiseMethodType
    }

    const timerHandleMethodType = this.checkTimerHandleMethodCall(expression)

    if (timerHandleMethodType != null) {
      return timerHandleMethodType
    }

    const fsStatsMethodType = this.checkFsStatsMethodCall(expression)

    if (fsStatsMethodType != null) {
      return fsStatsMethodType
    }

    const fetchAbortControllerMethodType = this.checkFetchAbortControllerMethodCall(expression)

    if (fetchAbortControllerMethodType != null) {
      return fetchAbortControllerMethodType
    }

    const fetchResponseMethodType = this.checkFetchResponseMethodCall(expression)

    if (fetchResponseMethodType != null) {
      return fetchResponseMethodType
    }

    const fetchHeadersMethodType = this.checkFetchHeadersMethodCall(expression)

    if (fetchHeadersMethodType != null) {
      return fetchHeadersMethodType
    }

    const urlSearchParamsMethodType = this.checkUrlSearchParamsMethodCall(expression)

    if (urlSearchParamsMethodType != null) {
      return urlSearchParamsMethodType
    }

    const cryptoHashMethodType = this.checkCryptoHashMethodCall(expression)

    if (cryptoHashMethodType != null) {
      return cryptoHashMethodType
    }

    const fsType = this.checkFsCall(expression)

    if (fsType != null) {
      return fsType
    }

    const fetchType = this.checkFetchCall(expression)

    if (fetchType != null) {
      return fetchType
    }

    const jsonType = this.checkJsonCall(expression, null)

    if (jsonType != null) {
      return jsonType
    }

    const cryptoType = this.checkCryptoCall(expression)

    if (cryptoType != null) {
      return cryptoType
    }

    const childProcessType = this.checkChildProcessCall(expression)

    if (childProcessType != null) {
      return childProcessType
    }

    const osType = this.checkOsCall(expression)

    if (osType != null) {
      return osType
    }

    const processType = this.checkProcessCall(expression)

    if (processType != null) {
      return processType
    }

    const urlType = this.checkUrlCall(expression)

    if (urlType != null) {
      return urlType
    }

    const pathType = this.checkPathCall(expression)

    if (pathType != null) {
      return pathType
    }

    const debugMemoryType = this.checkDebugMemoryCall(expression)

    if (debugMemoryType != null) {
      return debugMemoryType
    }

    const timerType = this.checkTimerCall(expression)

    if (timerType != null) {
      return timerType
    }

    const promiseStaticType = this.checkPromiseStaticCall(expression)

    if (promiseStaticType != null) {
      return promiseStaticType
    }

    const classMethodType = this.checkClassMethodCall(expression)

    if (classMethodType != null) {
      return classMethodType
    }

    const mathType = this.checkMathCall(expression)

    if (mathType != null) {
      return mathType
    }

    const arrayIsArrayType = this.checkArrayIsArrayCall(expression)

    if (arrayIsArrayType != null) {
      return arrayIsArrayType
    }

    const objectValuesType = this.checkObjectStaticCall(expression)

    if (objectValuesType != null) {
      return objectValuesType
    }

    this.checkExpression(expression.callee)
    const argTypes: ValueType[] = []

    for (let index = 0; index < expression.args.length; index = index + 1) {
      const arg = checkerNodeAt(expression.args, index)

      argTypes.push(this.checkExpression(arg))
    }

    const symbol = this.getCallableSymbol(expression.callee)

    if (symbol == null) {
      return 'unknown'
    }

    let returnType: ValueType = 'unknown'
    const symbolReturnType = symbol.returnType ?? null

    if (symbolReturnType != null) {
      returnType = symbolReturnType
    }

    let returnArrayElementType: ValueType | null = null
    const symbolReturnArrayElementType = symbol.returnArrayElementType ?? null

    if (symbolReturnArrayElementType != null) {
      returnArrayElementType = symbolReturnArrayElementType
    }

    let returnArrayElementDeclaredType: string | null = null
    const symbolReturnArrayElementDeclaredType = symbol.returnArrayElementDeclaredType ?? null

    if (symbolReturnArrayElementDeclaredType != null) {
      returnArrayElementDeclaredType = symbolReturnArrayElementDeclaredType
    }

    let returnMapKeyType: ValueType | null = null
    const symbolReturnMapKeyType = symbol.returnMapKeyType ?? null

    if (symbolReturnMapKeyType != null) {
      returnMapKeyType = symbolReturnMapKeyType
    }

    let returnMapValueType: ValueType | null = null
    const symbolReturnMapValueType = symbol.returnMapValueType ?? null

    if (symbolReturnMapValueType != null) {
      returnMapValueType = symbolReturnMapValueType
    }

    let returnPromiseValueType: ValueType | null = null
    const symbolReturnPromiseValueType = symbol.returnPromiseValueType ?? null

    if (symbolReturnPromiseValueType != null) {
      returnPromiseValueType = symbolReturnPromiseValueType
    }

    let returnSetElementType: ValueType | null = null
    const symbolReturnSetElementType = symbol.returnSetElementType ?? null

    if (symbolReturnSetElementType != null) {
      returnSetElementType = symbolReturnSetElementType
    }

    let returnShape: ObjectShapeInfo | null = null
    const symbolReturnShape = symbol.returnShape

    if (symbolReturnShape != null) {
      returnShape = symbolReturnShape
    }

    expression.valueType = returnType
    expression.nullable = symbol.returnNullable === true
    expression.arrayElementType = returnArrayElementType
    expression.arrayElementDeclaredType = returnArrayElementDeclaredType
    expression.mapKeyType = returnMapKeyType
    expression.mapValueType = returnMapValueType
    expression.promiseValueType = returnPromiseValueType
    expression.setElementType = returnSetElementType
    expression.shape = returnShape

    const params = symbol.params ?? null

    if (params == null) {
      return returnType
    }

    if (!this.acceptsArgumentCount(params, expression.args.length)) {
      this.report(
        'CCJS_ARG_COUNT',
        this.argumentCountMessage(`function ${expression.callee.path[0]}`, params, expression.args.length),
        expression.loc
      )
    }

    for (let index = 0; index < params.length; index++) {
      const param = params[index]

      if (index < argTypes.length) {
        this.checkAssignableType(
          argTypes[index],
          param.valueType,
          expression.args[index].loc,
          param.nullable === true,
          this.expressionCanBeNull(expression.args[index])
        )
      }
    }

    return returnType
  }

  checkBinaryCall(expression: AnyNode): ValueType | null {
    if (expression.callee.type !== 'MemberExpression') {
      return null
    }

    const staticMethod = this.resolveBinaryStaticRuntimeMethod(expression.callee)

    if (staticMethod != null) {
      if (staticMethod === 'from') {
        if (expression.args.length < 1 || expression.args.length > 2) {
          this.report(
            'CCJS_ARG_COUNT',
            `function Buffer.from expects 1 or 2 argument(s), got ${expression.args.length}`,
            expression.loc
          )
        }

        if (expression.args[0] != null) {
          this.checkAssignableType(
            this.checkExpression(expression.args[0]),
            'string',
            expression.args[0].loc,
            false,
            this.expressionCanBeNull(expression.args[0])
          )
        }

        this.checkUtf8EncodingArg(expression, 1, 'Buffer.from')
        expression.binaryRuntimeMethod = staticMethod
        expression.valueType = 'bytes'

        return 'bytes'
      }

      if (staticMethod === 'isBuffer') {
        if (expression.args.length !== 1) {
          this.report(
            'CCJS_ARG_COUNT',
            `function Buffer.isBuffer expects 1 argument(s), got ${expression.args.length}`,
            expression.loc
          )
        }

        if (expression.args[0] != null) {
          this.checkExpression(expression.args[0])
        }

        expression.binaryRuntimeMethod = staticMethod
        expression.valueType = 'boolean'

        return 'boolean'
      }

      if (staticMethod === 'alloc') {
        if (expression.args.length !== 1) {
          this.report(
            'CCJS_ARG_COUNT',
            `function Buffer.alloc expects 1 argument(s), got ${expression.args.length}`,
            expression.loc
          )
        }

        if (expression.args[0] != null) {
          this.checkAssignableType(this.checkExpression(expression.args[0]), 'number', expression.args[0].loc, false, false)
        }

        expression.binaryRuntimeMethod = staticMethod
        expression.valueType = 'bytes'

        return 'bytes'
      }
    }

    const objectType = this.checkExpression(expression.callee.object)

    if (objectType !== 'bytes') {
      return null
    }

    const instanceMethod = binaryInstanceRuntimeMethodName(expression.callee.property)

    if (instanceMethod === 'slice') {
      if (expression.args.length < 1 || expression.args.length > 2) {
        this.report(
          'CCJS_ARG_COUNT',
          `bytes.slice expects 1 or 2 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      for (let index = 0; index < expression.args.length; index = index + 1) {
        const arg = checkerNodeAt(expression.args, index)

        this.checkAssignableType(this.checkExpression(arg), 'number', arg.loc, false, false)
      }

      expression.binaryRuntimeMethod = instanceMethod
      expression.valueType = 'bytes'

      return 'bytes'
    }

    if (instanceMethod === 'toString') {
      if (expression.args.length > 1) {
        this.report(
          'CCJS_ARG_COUNT',
          `bytes.toString expects 0 or 1 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      this.checkUtf8EncodingArg(expression, 0, 'bytes.toString')
      expression.binaryRuntimeMethod = instanceMethod
      expression.valueType = 'string'

      return 'string'
    }

    return null
  }

  resolveBinaryStaticRuntimeMethod(callee: AnyNode): string | null {
    const path = memberExpressionPath(callee)

    if (path == null) {
      return null
    }

    if (path.length === 2 && firstPathSegment(path) === 'Buffer') {
      const symbol = this.scope.resolve('Buffer')

      if (symbol == null) {
        return binaryStaticRuntimeMethodNameFromPath(path)
      }

      if (
        symbol.kind === 'import' &&
        isNodeBufferImportSource(symbol.importSource) &&
        symbol.importedName === 'Buffer'
      ) {
        if (isBinaryStaticMethod(path[1])) {
          return path[1]
        }

        return null
      }

      return null
    }

    if (path.length === 3 && path[1] === 'Buffer') {
      const rootName = firstPathSegment(path)
      const symbol = this.scope.resolve(rootName)

      if (
        symbol != null &&
        symbol.kind === 'import' &&
        isNodeBufferImportSource(symbol.importSource) &&
        (symbol.importedName === 'default' || symbol.importedName === 'buffer')
      ) {
        if (isBinaryStaticMethod(path[2])) {
          return path[2]
        }

        return null
      }
    }

    return null
  }

  checkBufferUnsupportedCall(expression: AnyNode): ValueType | null {
    const path = memberExpressionPath(expression.callee)
    const unsupported = this.resolveUnsupportedBufferRuntimeExport(path)

    if (unsupported == null) {
      return null
    }

    for (let index = 0; index < expression.args.length; index = index + 1) {
      const arg = checkerNodeAt(expression.args, index)

      this.checkExpression(arg)
    }

    this.report(
      'CCJS_NOT_IMPLEMENTED',
      `node:buffer ${unsupported} is not implemented by the current C backend`,
      expression.loc
    )
    expression.valueType = 'unknown'

    return 'unknown'
  }

  resolveUnsupportedBufferRuntimeExport(path: readonly string[] | null | undefined): string | null {
    if (path == null) {
      return null
    }

    if (path.length === 1) {
      const rootName = firstPathSegment(path)
      const symbol = this.scope.resolve(rootName)
      let importedName: string | null = null

      if (symbol != null && symbol.importedName != null) {
        importedName = symbol.importedName
      }

      if (
        symbol != null &&
        symbol.kind === 'import' &&
        isNodeBufferImportSource(symbol.importSource) &&
        importedName != null &&
        isUnsupportedBufferRuntimeExport(importedName)
      ) {
        return importedName
      }
    }

    if (path.length === 2) {
      const rootName = firstPathSegment(path)
      const symbol = this.scope.resolve(rootName)

      if (
        symbol != null &&
        symbol.kind === 'import' &&
        isNodeBufferImportSource(symbol.importSource) &&
        (symbol.importedName === 'default' || symbol.importedName === 'buffer') &&
        isUnsupportedBufferRuntimeExport(path[1])
      ) {
        return path[1]
      }
    }

    return null
  }

  checkEventStreamUnsupportedCall(expression: AnyNode): ValueType | null {
    const usage = this.resolveUnsupportedEventStreamRuntimeExport(memberExpressionPath(expression.callee))

    if (usage == null) {
      return null
    }

    for (let index = 0; index < expression.args.length; index = index + 1) {
      const arg = checkerNodeAt(expression.args, index)

      this.checkExpression(arg)
    }

    this.report(
      'CCJS_NOT_IMPLEMENTED',
      `${usage.source} ${usage.name} is not implemented by the current C backend: ${usage.reason}`,
      expression.loc
    )
    expression.valueType = 'unknown'

    return 'unknown'
  }

  checkEventStreamUnsupportedConstructor(expression: AnyNode): ValueType | null {
    if (expression.callee.type !== 'Reference' || expression.callee.path.length !== 1) {
      return null
    }

    const usage = this.resolveUnsupportedEventStreamRuntimeExport(expression.callee.path)

    if (usage == null) {
      return null
    }

    this.report(
      'CCJS_NOT_IMPLEMENTED',
      `${usage.source} ${usage.name} is not implemented by the current C backend: ${usage.reason}`,
      expression.loc
    )
    expression.valueType = 'unknown'

    return 'unknown'
  }

  resolveUnsupportedEventStreamRuntimeExport(
    path: readonly string[] | null | undefined
  ): UnsupportedEventStreamRuntimeExport | null {
    if (path == null) {
      return null
    }

    if (path.length === 1) {
      const rootName = firstPathSegment(path)
      const symbol = this.scope.resolve(rootName)
      let importedName: string | null = null

      if (symbol != null && symbol.importedName != null) {
        importedName = symbol.importedName
      }

      if (symbol != null && symbol.kind === 'import' && importedName != null) {
        if (isNodeEventsImportSource(symbol.importSource) && isUnsupportedEventsRuntimeExport(importedName)) {
          return {
            source: 'node:events',
            name: importedName,
            reason: unsupportedEventsRuntimeExportReason(importedName)
          }
        }

        if (isNodeStreamImportSource(symbol.importSource) && isUnsupportedStreamRuntimeExport(importedName)) {
          return {
            source: 'node:stream',
            name: importedName,
            reason: unsupportedStreamRuntimeExportReason(importedName)
          }
        }
      }
    }

    if (path.length === 2) {
      const rootName = firstPathSegment(path)
      const symbol = this.scope.resolve(rootName)

      if (
        symbol != null &&
        symbol.kind === 'import' &&
        isNodeEventsImportSource(symbol.importSource) &&
        (symbol.importedName === 'default' || symbol.importedName === 'events') &&
        isUnsupportedEventsRuntimeExport(path[1])
      ) {
        return {
          source: 'node:events',
          name: path[1],
          reason: unsupportedEventsRuntimeExportReason(path[1])
        }
      }

      if (
        symbol != null &&
        symbol.kind === 'import' &&
        isNodeStreamImportSource(symbol.importSource) &&
        (symbol.importedName === 'default' || symbol.importedName === 'stream') &&
        isUnsupportedStreamRuntimeExport(path[1])
      ) {
        return {
          source: 'node:stream',
          name: path[1],
          reason: unsupportedStreamRuntimeExportReason(path[1])
        }
      }
    }

    if (path.length === 3 && path[1] === 'promises') {
      const rootName = firstPathSegment(path)
      const symbol = this.scope.resolve(rootName)
      const exportName = `promises.${path[2]}`

      if (
        symbol != null &&
        symbol.kind === 'import' &&
        isNodeStreamImportSource(symbol.importSource) &&
        (symbol.importedName === 'default' || symbol.importedName === 'stream') &&
        isUnsupportedStreamRuntimeExport(exportName)
      ) {
        return {
          source: 'node:stream',
          name: exportName,
          reason: unsupportedStreamRuntimeExportReason(exportName)
        }
      }
    }

    return null
  }

  checkUtf8EncodingArg(expression: AnyNode, index: number, label: string): void {
    const arg = expression.args[index]

    if (arg == null) {
      return
    }

    const argType = this.checkExpression(arg)

    this.checkAssignableType(argType, 'string', arg.loc, false, this.expressionCanBeNull(arg))

    if (arg.type !== 'StringLiteral' || arg.value !== 'utf8') {
      this.report('CCJS_TYPE_MISMATCH', `${label} encoding must be 'utf8' in the MVP`, arg.loc)
    }
  }

  checkCryptoCall(expression: AnyNode): ValueType | null {
    const call = this.resolveCryptoRuntimeCall(expression)

    if (call == null) {
      return null
    }

    if (call.unsupported) {
      for (let index = 0; index < expression.args.length; index = index + 1) {
        const arg = checkerNodeAt(expression.args, index)

        this.checkExpression(arg)
      }

      this.report(
        'CCJS_NOT_IMPLEMENTED',
        `node:crypto ${call.method} is not implemented by the current C backend`,
        expression.loc
      )
      expression.valueType = 'unknown'
      return 'unknown'
    }

    const method = call.method
    const argTypes: ValueType[] = []

    for (let index = 0; index < expression.args.length; index = index + 1) {
      const arg = checkerNodeAt(expression.args, index)

      argTypes.push(this.checkExpression(arg))
    }

    if (method === 'getHashes') {
      expression.valueType = 'array'
      expression.arrayElementType = 'string'
      expression.cryptoRuntimeMethod = method

      if (expression.args.length !== 0) {
        this.report(
          'CCJS_ARG_COUNT',
          `function ${call.label} expects 0 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      if (!this.supportsCryptoHash()) {
        this.report(
          'CCJS_NOT_IMPLEMENTED',
          "node:crypto getHashes requires tlsBackend: 'boringssl' or 'openssl' in the current C backend",
          expression.loc
        )
      }

      return 'array'
    }

    if (method === 'createHash') {
      expression.valueType = 'crypto-hash'
      expression.cryptoRuntimeMethod = method

      if (expression.args.length !== 1) {
        this.report(
          'CCJS_ARG_COUNT',
          `function ${call.label} expects 1 argument(s), got ${expression.args.length}`,
          expression.loc
        )
        return 'crypto-hash'
      }

      this.checkAssignableType(
        argTypes[0],
        'string',
        expression.args[0].loc,
        false,
        this.expressionCanBeNull(expression.args[0])
      )

      if (!this.supportsCryptoHash()) {
        this.report(
          'CCJS_NOT_IMPLEMENTED',
          "node:crypto createHash requires tlsBackend: 'boringssl' or 'openssl' in the current C backend",
          expression.loc
        )
        return 'crypto-hash'
      }

      if (expression.args[0].type !== 'StringLiteral' || expression.args[0].value !== 'sha256') {
        this.report(
          'CCJS_NOT_IMPLEMENTED',
          "node:crypto createHash only supports the 'sha256' algorithm in the current C backend",
          expression.args[0].loc
        )
      }

      return 'crypto-hash'
    }

    if (method === 'createHmac') {
      expression.valueType = 'crypto-hmac'
      expression.cryptoRuntimeMethod = method

      if (expression.args.length !== 2) {
        this.report(
          'CCJS_ARG_COUNT',
          `function ${call.label} expects 2 argument(s), got ${expression.args.length}`,
          expression.loc
        )
        return 'crypto-hmac'
      }

      this.checkAssignableType(
        argTypes[0],
        'string',
        expression.args[0].loc,
        false,
        this.expressionCanBeNull(expression.args[0])
      )

      if (!this.supportsCryptoHash()) {
        this.report(
          'CCJS_NOT_IMPLEMENTED',
          "node:crypto createHmac requires tlsBackend: 'boringssl' or 'openssl' in the current C backend",
          expression.loc
        )
        return 'crypto-hmac'
      }

      if (expression.args[0].type !== 'StringLiteral' || expression.args[0].value !== 'sha256') {
        this.report(
          'CCJS_NOT_IMPLEMENTED',
          "node:crypto createHmac only supports the 'sha256' algorithm in the current C backend",
          expression.args[0].loc
        )
      }

      if (argTypes[1] !== 'string' && argTypes[1] !== 'bytes') {
        this.report(
          'CCJS_TYPE_MISMATCH',
          'node:crypto createHmac key must be a string or Buffer in the current C backend',
          expression.args[1].loc
        )
      }

      return 'crypto-hmac'
    }

    if (method === 'hash') {
      expression.cryptoRuntimeMethod = method

      if (expression.args.length < 2 || expression.args.length > 3) {
        this.report(
          'CCJS_ARG_COUNT',
          `function ${call.label} expects 2 or 3 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      if (expression.args[0] != null) {
        this.checkAssignableType(
          argTypes[0],
          'string',
          expression.args[0].loc,
          false,
          this.expressionCanBeNull(expression.args[0])
        )

        if (expression.args[0].type !== 'StringLiteral' || expression.args[0].value !== 'sha256') {
          this.report(
            'CCJS_NOT_IMPLEMENTED',
            "node:crypto hash only supports the 'sha256' algorithm in the current C backend",
            expression.args[0].loc
          )
        }
      }

      if (expression.args[1] != null && argTypes[1] !== 'string' && argTypes[1] !== 'bytes') {
        this.report(
          'CCJS_TYPE_MISMATCH',
          'node:crypto hash data must be a string or Buffer in the current C backend',
          expression.args[1].loc
        )
      }

      if (!this.supportsCryptoHash()) {
        this.report(
          'CCJS_NOT_IMPLEMENTED',
          "node:crypto hash requires tlsBackend: 'boringssl' or 'openssl' in the current C backend",
          expression.loc
        )
      }

      if (expression.args[2] == null) {
        expression.cryptoHashDigestEncoding = 'hex'
        expression.valueType = 'string'
        return 'string'
      }

      this.checkAssignableType(
        argTypes[2],
        'string',
        expression.args[2].loc,
        false,
        this.expressionCanBeNull(expression.args[2])
      )

      if (expression.args[2].type === 'StringLiteral' && expression.args[2].value === 'buffer') {
        expression.cryptoHashDigestEncoding = 'bytes'
        expression.valueType = 'bytes'
        return 'bytes'
      }

      if (expression.args[2].type !== 'StringLiteral' || expression.args[2].value !== 'hex') {
        this.report(
          'CCJS_NOT_IMPLEMENTED',
          "node:crypto hash only supports the 'hex' and 'buffer' output encodings in the current C backend",
          expression.args[2].loc
        )
      }

      expression.cryptoHashDigestEncoding = 'hex'
      expression.valueType = 'string'

      return 'string'
    }

    if (method === 'timingSafeEqual') {
      expression.valueType = 'boolean'
      expression.cryptoRuntimeMethod = method

      if (expression.args.length !== 2) {
        this.report(
          'CCJS_ARG_COUNT',
          `function ${call.label} expects 2 argument(s), got ${expression.args.length}`,
          expression.loc
        )
        return 'boolean'
      }

      this.checkAssignableType(
        argTypes[0],
        'bytes',
        expression.args[0].loc,
        false,
        this.expressionCanBeNull(expression.args[0])
      )
      this.checkAssignableType(
        argTypes[1],
        'bytes',
        expression.args[1].loc,
        false,
        this.expressionCanBeNull(expression.args[1])
      )

      return 'boolean'
    }

    expression.valueType = 'bytes'

    if (method === 'randomInt') {
      expression.valueType = 'number'
    } else if (method === 'randomUUID') {
      expression.valueType = 'string'
    }
    expression.cryptoRuntimeMethod = method

    if (method === 'getRandomValues') {
      if (expression.args.length !== 1) {
        this.report(
          'CCJS_ARG_COUNT',
          `function ${call.label} expects 1 argument(s), got ${expression.args.length}`,
          expression.loc
        )
        return 'bytes'
      }

      this.checkAssignableType(
        argTypes[0],
        'bytes',
        expression.args[0].loc,
        false,
        this.expressionCanBeNull(expression.args[0])
      )

      return 'bytes'
    }

    if (method === 'randomBytes') {
      if (expression.args.length !== 1) {
        this.report(
          'CCJS_ARG_COUNT',
          `function ${call.label} expects 1 argument(s), got ${expression.args.length}`,
          expression.loc
        )
        return 'bytes'
      }

      this.checkAssignableType(argTypes[0], 'number', expression.args[0].loc, false, false)
      return 'bytes'
    }

    if (method === 'randomFillSync') {
      if (expression.args.length < 1 || expression.args.length > 3) {
        this.report(
          'CCJS_ARG_COUNT',
          `function ${call.label} expects 1 to 3 argument(s), got ${expression.args.length}`,
          expression.loc
        )
        return 'bytes'
      }

      this.checkAssignableType(
        argTypes[0],
        'bytes',
        expression.args[0].loc,
        false,
        this.expressionCanBeNull(expression.args[0])
      )

      for (let index = 0; index < argTypes.length; index++) {
        const argType = argTypes[index]

        if (index > 0) {
          this.checkAssignableType(argType, 'number', expression.args[index].loc, false, false)
        }
      }

      return 'bytes'
    }

    if (method === 'randomInt') {
      if (expression.args.length < 1 || expression.args.length > 2) {
        this.report(
          'CCJS_ARG_COUNT',
          `function ${call.label} expects 1 or 2 argument(s), got ${expression.args.length}`,
          expression.loc
        )
        return 'number'
      }

      for (let index = 0; index < argTypes.length; index++) {
        const argType = argTypes[index]

        this.checkAssignableType(argType, 'number', expression.args[index].loc, false, false)
      }

      return 'number'
    }

    if (expression.args.length !== 0) {
      this.report(
        'CCJS_NOT_IMPLEMENTED',
        'node:crypto randomUUID options are not implemented by the current C backend',
        expression.loc
      )
    }

    return 'string'
  }

  checkCryptoHashMethodCall(expression: AnyNode): ValueType | null {
    if (expression.callee.type !== 'MemberExpression') {
      return null
    }

    const method = expression.callee.property

    if (method !== 'update' && method !== 'digest') {
      return null
    }

    const objectType = this.checkExpression(expression.callee.object)

    if (objectType !== 'crypto-hash' && objectType !== 'crypto-hmac') {
      return null
    }

    let label = 'Hash'

    if (objectType === 'crypto-hmac') {
      label = 'Hmac'
    }

    expression.cryptoRuntimeMethod = `${label}.${method}`

    if (method === 'update') {
      if (expression.args.length < 1 || expression.args.length > 2) {
        this.report(
          'CCJS_ARG_COUNT',
          `function ${label}.update expects 1 or 2 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      if (expression.args[0] != null) {
        const dataType = this.checkExpression(expression.args[0])

        if (dataType !== 'string' && dataType !== 'bytes') {
          this.report(
            'CCJS_TYPE_MISMATCH',
            `${label}.update data must be a string or Buffer in the current C backend`,
            expression.args[0].loc
          )
        }
      }

      if (expression.args[1] != null) {
        const encodingType = this.checkExpression(expression.args[1])
        this.checkAssignableType(
          encodingType,
          'string',
          expression.args[1].loc,
          false,
          this.expressionCanBeNull(expression.args[1])
        )

        if (expression.args[1].type !== 'StringLiteral' || expression.args[1].value !== 'utf8') {
          this.report(
            'CCJS_NOT_IMPLEMENTED',
            `${label}.update only supports the 'utf8' input encoding in the current C backend`,
            expression.args[1].loc
          )
        }
      }

      expression.valueType = objectType
      return objectType
    }

    if (expression.args.length > 1) {
      this.report(
        'CCJS_ARG_COUNT',
        `function ${label}.digest expects 0 or 1 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    if (expression.args[0] == null) {
      expression.cryptoHashDigestEncoding = 'bytes'
      expression.valueType = 'bytes'
      return 'bytes'
    }

    const encodingType = this.checkExpression(expression.args[0])
    this.checkAssignableType(
      encodingType,
      'string',
      expression.args[0].loc,
      false,
      this.expressionCanBeNull(expression.args[0])
    )

    if (expression.args[0].type !== 'StringLiteral' || expression.args[0].value !== 'hex') {
      this.report(
        'CCJS_NOT_IMPLEMENTED',
        `${label}.digest only supports the 'hex' encoding in the current C backend`,
        expression.args[0].loc
      )
    }

    expression.cryptoHashDigestEncoding = 'hex'
    expression.valueType = 'string'

    return 'string'
  }

  checkChildProcessCall(expression: AnyNode): ValueType | null {
    const call = this.resolveChildProcessRuntimeCall(expression)

    if (call == null) {
      return null
    }

    if (call.unsupported) {
      for (let index = 0; index < expression.args.length; index = index + 1) {
        const arg = checkerNodeAt(expression.args, index)

        this.checkExpression(arg)
      }

      this.report(
        'CCJS_NOT_IMPLEMENTED',
        `node:child_process ${call.method} is not implemented by the current C backend`,
        expression.loc
      )
      expression.valueType = 'unknown'
      return 'unknown'
    }

    if (call.method === 'execSync') {
      if (expression.args.length !== 2) {
        this.report(
          'CCJS_ARG_COUNT',
          `function ${call.label} expects 2 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      if (expression.args[0] != null) {
        this.checkAssignableType(this.checkExpression(expression.args[0]), 'string', expression.args[0].loc, false, false)
      }

      this.checkChildProcessSyncOptions(expression.args[1], expression.loc, true)
      expression.childProcessRuntimeMethod = call.method
      expression.valueType = 'string'

      return 'string'
    }

    if (call.method === 'execFileSync') {
      if (expression.args.length < 2 || expression.args.length > 3) {
        this.report(
          'CCJS_ARG_COUNT',
          `function ${call.label} expects 2 or 3 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      if (expression.args[0] != null) {
        this.checkAssignableType(this.checkExpression(expression.args[0]), 'string', expression.args[0].loc, false, false)
      }

      const second = expression.args[1]
      let args: AnyNode | null = null
      let options: AnyNode | null = null

      if (second != null && second.type === 'ObjectLiteral') {
        options = second
      } else {
        if (second != null) {
          args = second
        }

        if (expression.args[2] != null) {
          options = expression.args[2]
        }
      }

      if (args != null && args.type !== 'ArrayLiteral') {
        this.report(
          'CCJS_NOT_IMPLEMENTED',
          'node:child_process execFileSync currently expects a string[] literal args argument',
          args.loc
        )
      } else if (args != null) {
        for (let index = 0; index < args.elements.length; index = index + 1) {
          const element = checkerNodeAt(args.elements, index)

          this.checkAssignableType(this.checkExpression(element), 'string', element.loc, false, false)
        }
      }

      this.checkChildProcessSyncOptions(options, expression.loc, true)
      expression.childProcessRuntimeMethod = call.method
      expression.valueType = 'string'

      return 'string'
    }

    if (expression.args.length < 1 || expression.args.length > 3) {
      this.report(
        'CCJS_ARG_COUNT',
        `function ${call.label} expects 1 to 3 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    if (expression.args[0] != null) {
      this.checkAssignableType(this.checkExpression(expression.args[0]), 'string', expression.args[0].loc, false, false)
    }

    const second = expression.args[1]
    let args: AnyNode | null = null
    let options: AnyNode | null = null

    if (second != null && second.type === 'ObjectLiteral') {
      options = second
    } else {
      if (second != null) {
        args = second
      }

      if (expression.args[2] != null) {
        options = expression.args[2]
      }
    }

    if (args != null && args.type !== 'ArrayLiteral') {
      this.report(
        'CCJS_NOT_IMPLEMENTED',
        'node:child_process spawnSync currently expects a string[] literal args argument',
        args.loc
      )
    } else if (args != null && args.type === 'ArrayLiteral') {
      for (let index = 0; index < args.elements.length; index = index + 1) {
        const element = checkerNodeAt(args.elements, index)

        this.checkAssignableType(this.checkExpression(element), 'string', element.loc, false, false)
      }
    }

    this.checkChildProcessSyncOptions(options, expression.loc, true)
    expression.childProcessRuntimeMethod = call.method
    expression.valueType = 'object'
    expression.shape = childProcessSpawnSyncResultShape

    return 'object'
  }

  resolveChildProcessRuntimeCall(expression: AnyNode): RuntimeCallInfo | null {
    const path = memberExpressionPath(expression.callee)
    const method = this.resolveChildProcessRuntimeMethod(path)

    if (method == null) {
      return null
    }

    let label = method

    if (path != null) {
      label = joinStrings(path, '.')
    }

    return {
      method,
      label,
      unsupported: !isChildProcessRuntimeMethod(method)
    }
  }

  resolveChildProcessRuntimeMethod(path: readonly string[] | null | undefined): string | null {
    if (path == null) {
      return null
    }

    if (path.length === 1) {
      const rootName = firstPathSegment(path)
      const symbol = this.scope.resolve(rootName)
      let importedName: string | null = null

      if (symbol != null && symbol.importedName != null) {
        importedName = symbol.importedName
      }

      if (symbol != null && symbol.kind === 'import' && isNodeChildProcessImportSource(symbol.importSource) && importedName != null) {
        if (isChildProcessRuntimeMethod(importedName) || isUnsupportedChildProcessRuntimeMethod(importedName)) {
          return importedName
        }

        return null
      }
    }

    if (path.length === 2) {
      const rootName = firstPathSegment(path)
      const symbol = this.scope.resolve(rootName)

      if (
        symbol != null &&
        symbol.kind === 'import' &&
        isNodeChildProcessImportSource(symbol.importSource) &&
        (symbol.importedName === 'default' || symbol.importedName === 'childProcess')
      ) {
        if (isChildProcessRuntimeMethod(path[1]) || isUnsupportedChildProcessRuntimeMethod(path[1])) {
          return path[1]
        }

        return null
      }
    }

    return null
  }

  checkChildProcessSyncOptions(
    options: AnyNode | null | undefined,
    loc: SourceLocation,
    requireEncoding: boolean
  ): void {
    if (options == null || options.type !== 'ObjectLiteral') {
      let reportLoc = loc

      if (options != null) {
        reportLoc = options.loc
      }

      this.report(
        'CCJS_NOT_IMPLEMENTED',
        'node:child_process sync helpers currently require { encoding: "utf8" }',
        reportLoc
      )
      return
    }

    let encoding: AnyNode | null = null

    for (const property of options.properties) {
      if (property.key === 'encoding') {
        encoding = property.value
        break
      }
    }

    if (requireEncoding && (encoding == null || encoding.type !== 'StringLiteral' || encoding.value !== 'utf8')) {
      let reportLoc = options.loc

      if (encoding != null) {
        reportLoc = encoding.loc
      }

      this.report(
        'CCJS_NOT_IMPLEMENTED',
        'node:child_process sync helpers currently support only { encoding: "utf8" }',
        reportLoc
      )
    }

    for (const property of options.properties) {
      if (property.key === 'encoding') {
        continue
      }

      if (property.key === 'cwd') {
        this.checkAssignableType(this.checkExpression(property.value), 'string', property.value.loc, false, false)
        continue
      }

      if (property.key === 'stdio') {
        if (
          property.value.type !== 'StringLiteral' ||
          (property.value.value !== 'pipe' && property.value.value !== 'ignore')
        ) {
          this.report(
            'CCJS_NOT_IMPLEMENTED',
            "node:child_process sync helpers currently support stdio: 'pipe' or 'ignore'",
            property.value.loc
          )
        }
        continue
      }

      if (property.key === 'timeout') {
        this.checkAssignableType(this.checkExpression(property.value), 'number', property.value.loc, false, false)
        continue
      }

      if (property.key === 'env') {
        if (property.value.type !== 'ObjectLiteral') {
          this.checkExpression(property.value)
          this.report(
            'CCJS_NOT_IMPLEMENTED',
            'node:child_process sync helpers currently expect env to be an object literal',
            property.value.loc
          )
          continue
        }

        for (const envProperty of property.value.properties) {
          this.checkAssignableType(this.checkExpression(envProperty.value), 'string', envProperty.value.loc, false, false)
        }
        continue
      }

      this.checkExpression(property.value)
      this.report(
        'CCJS_NOT_IMPLEMENTED',
        `node:child_process sync option ${property.key} is not implemented by the current C backend`,
        property.loc
      )
    }
  }

  checkOsCall(expression: AnyNode): ValueType | null {
    const call = this.resolveOsRuntimeCall(expression)

    if (call == null) {
      return null
    }

    const argTypes: ValueType[] = []

    for (let index = 0; index < expression.args.length; index = index + 1) {
      const arg = checkerNodeAt(expression.args, index)

      argTypes.push(this.checkExpression(arg))
    }

    if (call.unsupported) {
      this.report(
        'CCJS_NOT_IMPLEMENTED',
        `node:os ${call.method} is not implemented by the current C backend`,
        expression.loc
      )
      expression.valueType = 'unknown'
      return 'unknown'
    }

    if (expression.args.length !== 0) {
      this.report(
        'CCJS_ARG_COUNT',
        `function ${call.label} expects 0 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    expression.osRuntimeMethod = call.method
    expression.valueType = 'string'

    return 'string'
  }

  resolveOsRuntimeCall(expression: AnyNode): RuntimeCallInfo | null {
    const path = memberExpressionPath(expression.callee)
    const method = this.resolveOsRuntimeMethod(path)

    if (method == null) {
      return null
    }

    let label = method

    if (path != null) {
      label = joinStrings(path, '.')
    }

    return {
      method,
      label,
      unsupported: !isOsRuntimeMethod(method)
    }
  }

  resolveOsRuntimeMethod(path: readonly string[] | null | undefined): string | null {
    if (path == null) {
      return null
    }

    if (path.length === 1) {
      const rootName = firstPathSegment(path)
      const symbol = this.scope.resolve(rootName)
      let importedName: string | null = null

      if (symbol != null && symbol.importedName != null) {
        importedName = symbol.importedName
      }

      if (symbol != null && symbol.kind === 'import' && isNodeOsImportSource(symbol.importSource) && importedName != null) {
        if (isOsRuntimeMethod(importedName) || isUnsupportedOsRuntimeMethod(importedName)) {
          return importedName
        }

        return null
      }
    }

    if (path.length === 2) {
      const rootName = firstPathSegment(path)
      const symbol = this.scope.resolve(rootName)

      if (
        symbol != null &&
        symbol.kind === 'import' &&
        isNodeOsImportSource(symbol.importSource) &&
        (symbol.importedName === 'default' || symbol.importedName === 'os')
      ) {
        if (isOsRuntimeMethod(path[1]) || isUnsupportedOsRuntimeMethod(path[1])) {
          return path[1]
        }

        return null
      }
    }

    return null
  }

  checkOsConstantMemberExpression(expression: AnyNode): ValueType | null {
    const constant = this.resolveOsRuntimeConstant(memberExpressionPath(expression))

    if (constant == null) {
      return null
    }

    expression.osRuntimeConstant = constant
    expression.valueType = 'string'

    return 'string'
  }

  resolveOsRuntimeConstant(path: readonly string[] | null | undefined): string | null {
    if (path == null) {
      return null
    }

    if (path.length === 1) {
      const rootName = firstPathSegment(path)
      const symbol = this.scope.resolve(rootName)
      let importedName: string | null = null

      if (symbol != null && symbol.importedName != null) {
        importedName = symbol.importedName
      }

      if (
        symbol != null &&
        symbol.kind === 'import' &&
        isNodeOsImportSource(symbol.importSource) &&
        importedName != null &&
        isOsRuntimeConstant(importedName)
      ) {
        return importedName
      }
    }

    if (path.length === 2) {
      const rootName = firstPathSegment(path)
      const symbol = this.scope.resolve(rootName)

      if (
        symbol != null &&
        symbol.kind === 'import' &&
        isNodeOsImportSource(symbol.importSource) &&
        (symbol.importedName === 'default' || symbol.importedName === 'os') &&
        isOsRuntimeConstant(path[1])
      ) {
        return path[1]
      }
    }

    return null
  }

  checkProcessCall(expression: AnyNode): ValueType | null {
    const call = this.resolveProcessRuntimeCall(expression)

    if (call == null) {
      return null
    }

    const argTypes: ValueType[] = []

    for (let index = 0; index < expression.args.length; index = index + 1) {
      const arg = checkerNodeAt(expression.args, index)

      argTypes.push(this.checkExpression(arg))
    }

    if (call.unsupported) {
      this.report(
        'CCJS_NOT_IMPLEMENTED',
        `node:process ${call.method} is not implemented by the current C backend`,
        expression.loc
      )
      expression.valueType = 'unknown'
      return 'unknown'
    }

    expression.processRuntimeMethod = call.method

    if (call.method === 'cwd') {
      if (expression.args.length !== 0) {
        this.report(
          'CCJS_ARG_COUNT',
          `function ${call.label} expects 0 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      expression.valueType = 'string'
      return 'string'
    }

    if (expression.args.length > 1) {
      this.report(
        'CCJS_ARG_COUNT',
        `function ${call.label} expects 0 or 1 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    if (expression.args[0] != null) {
      this.checkAssignableType(argTypes[0], 'number', expression.args[0].loc, false, false)
    }

    expression.valueType = 'void'
    return 'void'
  }

  resolveProcessRuntimeCall(expression: AnyNode): RuntimeCallInfo | null {
    const path = memberExpressionPath(expression.callee)
    const method = this.resolveProcessRuntimeMethod(path)

    if (method == null) {
      return null
    }

    let label = method

    if (path != null) {
      label = joinStrings(path, '.')
    }

    return {
      method,
      label,
      unsupported: !isProcessRuntimeMethod(method)
    }
  }

  resolveProcessRuntimeMethod(path: readonly string[] | null | undefined): string | null {
    if (path == null) {
      return null
    }

    if (path.length === 1) {
      const rootName = firstPathSegment(path)
      const symbol = this.scope.resolve(rootName)
      let importedName: string | null = null

      if (symbol != null && symbol.importedName != null) {
        importedName = symbol.importedName
      }

      if (symbol != null && symbol.kind === 'import' && isNodeProcessImportSource(symbol.importSource) && importedName != null) {
        if (isProcessRuntimeMethod(importedName) || isUnsupportedProcessRuntimeMethod(importedName)) {
          return importedName
        }

        return null
      }
    }

    if (path.length === 2) {
      const rootName = firstPathSegment(path)
      const symbol = this.scope.resolve(rootName)

      if (
        symbol != null &&
        symbol.kind === 'import' &&
        isNodeProcessImportSource(symbol.importSource) &&
        (symbol.importedName === 'default' || symbol.importedName === 'process')
      ) {
        if (isProcessRuntimeMethod(path[1]) || isUnsupportedProcessRuntimeMethod(path[1])) {
          return path[1]
        }

        return null
      }
    }

    return null
  }

  checkProcessMemberExpression(expression: AnyNode): ValueType | null {
    const path = memberExpressionPath(expression)

    if (path == null || path.length < 1) {
      return null
    }

    const rootName = firstPathSegment(path)
    const root = this.scope.resolve(rootName)

    if (root == null || root.kind !== 'import' || !isNodeProcessImportSource(root.importSource)) {
      return null
    }

    if (root.importedName === 'default' || root.importedName === 'process') {
      if (path.length === 2 && isUnsupportedProcessRuntimeProperty(path[1])) {
        this.report(
          'CCJS_NOT_IMPLEMENTED',
          `node:process ${path[1]} is not implemented by the current C backend`,
          expression.loc
        )
        expression.valueType = 'unknown'
        return 'unknown'
      }

      if (path.length === 2 && isProcessRuntimeProperty(path[1])) {
        expression.processRuntimeProperty = path[1]
        const valueType = resolvedConcreteValueTypeMetadata(processRuntimePropertyValueType(path[1]), 'unknown')

        expression.valueType = valueType
        return expression.valueType
      }

      if (path.length === 3 && path[1] === 'env') {
        expression.processRuntimeEnvName = path[2]
        expression.valueType = 'string'
        return 'string'
      }

      if (path.length === 3) {
        const property = `${path[1]}.${path[2]}`

        if (isProcessRuntimeProperty(property)) {
          expression.processRuntimeProperty = property
          const valueType = resolvedConcreteValueTypeMetadata(processRuntimePropertyValueType(property), 'unknown')

          expression.valueType = valueType
          return expression.valueType
        }
      }

      return null
    }

    if (path.length === 2 && root.importedName === 'env') {
      expression.processRuntimeEnvName = path[1]
      expression.valueType = 'string'
      return 'string'
    }

    if (path.length === 2 && root.importedName != null) {
      const property = `${root.importedName}.${path[1]}`

      if (isProcessRuntimeProperty(property)) {
        expression.processRuntimeProperty = property
        const valueType = resolvedConcreteValueTypeMetadata(processRuntimePropertyValueType(property), 'unknown')

        expression.valueType = valueType
        return expression.valueType
      }
    }

    return null
  }

  checkProcessMemberAssignment(expression: AnyNode): ValueType | null {
    const path = memberExpressionPath(expression.target)

    if (path == null || path.length !== 2 || path[1] !== 'exitCode') {
      return null
    }

    const rootName = firstPathSegment(path)
    const root = this.scope.resolve(rootName)

    if (
      root == null ||
      root.kind !== 'import' ||
      !isNodeProcessImportSource(root.importSource) ||
      (root.importedName !== 'default' && root.importedName !== 'process')
    ) {
      return null
    }

    const valueType = this.checkExpression(expression.value)
    this.checkAssignableType(valueType, 'number', expression.value.loc, false, false)
    expression.processRuntimeProperty = 'exitCode'
    expression.valueType = 'number'

    return 'number'
  }

  checkProcessIndexExpression(expression: AnyNode): ValueType | null {
    const path = memberExpressionPath(expression.object)

    if (path == null) {
      return null
    }

    const rootName = firstPathSegment(path)
    const root = this.scope.resolve(rootName)

    if (root == null || root.kind !== 'import' || !isNodeProcessImportSource(root.importSource)) {
      return null
    }

    const isArgv =
      ((root.importedName === 'default' || root.importedName === 'process') &&
        path.length === 2 &&
        path[1] === 'argv') ||
      (root.importedName === 'argv' && path.length === 1)

    if (!isArgv) {
      return null
    }

    const indexType = this.checkExpression(expression.index)
    this.checkAssignableType(indexType, 'number', expression.index.loc, false, false)
    expression.processRuntimeProperty = 'argv'
    expression.valueType = 'string'

    return 'string'
  }

  checkUrlCall(expression: AnyNode): ValueType | null {
    const call = this.resolveUrlRuntimeCall(expression)

    if (call == null) {
      return null
    }

    const argTypes: ValueType[] = []

    for (let index = 0; index < expression.args.length; index = index + 1) {
      const arg = checkerNodeAt(expression.args, index)

      argTypes.push(this.checkExpression(arg))
    }

    if (call.unsupported) {
      this.report(
        'CCJS_NOT_IMPLEMENTED',
        `node:url ${call.method} is not implemented by the current C backend`,
        expression.loc
      )
      expression.valueType = 'unknown'
      return 'unknown'
    }

    if (expression.args.length !== 1) {
      this.report(
        'CCJS_ARG_COUNT',
        `function ${call.label} expects 1 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    if (expression.args[0] != null) {
      let argType: ValueType = 'unknown'

      argType = argTypes[0]

      if (call.method === 'fileURLToPath') {
        const shape = this.resolveExpressionShape(expression.args[0])
        let isUrlObject = false

        if (shape != null && shape.builtin === 'url.URL') {
          isUrlObject = true
        }

        if (argType !== 'string' && !(argType === 'object' && isUrlObject)) {
          this.report(
            'CCJS_TYPE_MISMATCH',
            `function ${call.label} expects string or URL, got ${argType}`,
            expression.args[0].loc
          )
        }
      } else {
        this.checkAssignableType(
          argType,
          'string',
          expression.args[0].loc,
          false,
          this.expressionCanBeNull(expression.args[0])
        )
      }
    }

    expression.urlRuntimeMethod = call.method

    if (call.method === 'pathToFileURL') {
      expression.valueType = 'object'
      expression.shape = urlObjectShape
      return 'object'
    }

    expression.valueType = 'string'
    return 'string'
  }

  checkUrlSearchParamsMethodCall(expression: AnyNode): ValueType | null {
    if (expression.callee.type !== 'MemberExpression' || !isUrlSearchParamsRuntimeMethod(expression.callee.property)) {
      return null
    }

    const objectType = this.checkExpression(expression.callee.object)
    const shape = this.resolveExpressionShape(expression.callee.object)

    if (objectType !== 'object' || shape == null || shape.builtin !== 'url.URLSearchParams') {
      return null
    }

    const method = expression.callee.property
    let expectedArgs = 1

    if (method === 'set' || method === 'append') {
      expectedArgs = 2
    } else if (method === 'toString') {
      expectedArgs = 0
    }

    if (expression.args.length !== expectedArgs) {
      this.report(
        'CCJS_ARG_COUNT',
        `function URLSearchParams.${method} expects ${expectedArgs} argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    for (let index = 0; index < expression.args.length; index = index + 1) {
      const arg = checkerNodeAt(expression.args, index)

      this.checkAssignableType(this.checkExpression(arg), 'string', arg.loc, false, this.expressionCanBeNull(arg))
    }

    expression.urlRuntimeMethod = `URLSearchParams.${method}`

    if (method === 'has') {
      expression.valueType = 'boolean'
      return 'boolean'
    }

    if (method === 'append' || method === 'delete' || method === 'set') {
      expression.valueType = 'void'
      return 'void'
    }

    expression.valueType = 'string'
    expression.nullable = method === 'get'

    return 'string'
  }

  resolveUrlRuntimeCall(expression: AnyNode): RuntimeCallInfo | null {
    const path = memberExpressionPath(expression.callee)
    const method = this.resolveUrlRuntimeMethod(path)

    if (method == null) {
      return null
    }

    let label = method

    if (path != null) {
      label = joinStrings(path, '.')
    }

    return {
      method,
      label,
      unsupported: !isUrlRuntimeMethod(method)
    }
  }

  resolveUrlRuntimeMethod(path: readonly string[] | null | undefined): string | null {
    if (path == null) {
      return null
    }

    if (path.length === 1) {
      const rootName = firstPathSegment(path)
      const symbol = this.scope.resolve(rootName)
      let importedName: string | null = null

      if (symbol != null && symbol.importedName != null) {
        importedName = symbol.importedName
      }

      if (symbol != null && symbol.kind === 'import' && isNodeUrlImportSource(symbol.importSource) && importedName != null) {
        if (isUrlRuntimeMethod(importedName) || isUnsupportedUrlRuntimeMethod(importedName)) {
          return importedName
        }

        return null
      }
    }

    if (path.length === 2) {
      const rootName = firstPathSegment(path)
      const symbol = this.scope.resolve(rootName)

      if (
        symbol != null &&
        symbol.kind === 'import' &&
        isNodeUrlImportSource(symbol.importSource) &&
        (symbol.importedName === 'default' || symbol.importedName === 'url')
      ) {
        if (isUrlRuntimeMethod(path[1]) || isUnsupportedUrlRuntimeMethod(path[1])) {
          return path[1]
        }

        return null
      }
    }

    return null
  }

  resolveCryptoRuntimeCall(expression: AnyNode): RuntimeCallInfo | null {
    const path = memberExpressionPath(expression.callee)
    const method = this.resolveCryptoRuntimeMethod(path)

    if (method == null) {
      return null
    }

    let label = method

    if (path != null) {
      label = joinStrings(path, '.')
    }

    return {
      method,
      label,
      unsupported: !isCryptoRuntimeMethod(method)
    }
  }

  resolveCryptoRuntimeMethod(path: string[] | null | undefined): string | null {
    if (path == null) {
      return null
    }

    if (path.length === 2) {
      if (isCryptoRuntimeMethodPath(path)) {
        return cryptoRuntimeMethodNameFromKnownPath(path)
      }

      const rootName = firstPathSegment(path)
      const symbol = this.scope.resolve(rootName)

      if (
        symbol != null &&
        symbol.kind === 'import' &&
        isNodeCryptoImportSource(symbol.importSource) &&
        (symbol.importedName === 'default' || symbol.importedName === 'crypto')
      ) {
        if (isCryptoRuntimeMethod(path[1]) || isUnsupportedNodeCryptoMethod(path[1])) {
          return path[1]
        }

        return null
      }
    }

    if (path.length === 1) {
      const rootName = firstPathSegment(path)
      const symbol = this.scope.resolve(rootName)
      let importedName: string | null = null

      if (symbol != null && symbol.importedName != null) {
        importedName = symbol.importedName
      }

      if (symbol != null && symbol.kind === 'import' && isNodeCryptoImportSource(symbol.importSource) && importedName != null) {
        if (isCryptoRuntimeMethod(importedName) || isUnsupportedNodeCryptoMethod(importedName)) {
          return importedName
        }

        return null
      }
    }

    return null
  }

  checkPathCall(expression: AnyNode): ValueType | null {
    const call = this.resolvePathRuntimeCall(expression)

    if (call == null) {
      return null
    }

    if (call.unsupported) {
      for (let index = 0; index < expression.args.length; index = index + 1) {
        const arg = checkerNodeAt(expression.args, index)

        this.checkExpression(arg)
      }

      this.report(
        'CCJS_NOT_IMPLEMENTED',
        `node:path ${call.method} is not implemented by the current C backend`,
        expression.loc
      )
      expression.valueType = 'unknown'
      return 'unknown'
    }

    const method = call.method
    const argTypes: ValueType[] = []

    for (let index = 0; index < expression.args.length; index = index + 1) {
      const arg = checkerNodeAt(expression.args, index)

      argTypes.push(this.checkExpression(arg))
    }

    let returnType: ValueType = 'string'

    if (method === 'isAbsolute') {
      returnType = 'boolean'
    } else if (method === 'parse') {
      returnType = 'object'
    }

    expression.valueType = returnType
    expression.pathRuntimeMethod = method

    if (method === 'parse') {
      if (expression.args.length !== 1) {
        this.report(
          'CCJS_ARG_COUNT',
          `function ${call.label} expects 1 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      if (expression.args[0] != null) {
        this.checkAssignableType(
          argTypes[0],
          'string',
          expression.args[0].loc,
          false,
          this.expressionCanBeNull(expression.args[0])
        )
      }

      expression.shape = pathParseObjectShape
      return 'object'
    }

    if (method === 'format') {
      if (expression.args.length !== 1) {
        this.report(
          'CCJS_ARG_COUNT',
          `function ${call.label} expects 1 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      if (expression.args[0] != null) {
        this.checkAssignableType(
          argTypes[0],
          'object',
          expression.args[0].loc,
          false,
          this.expressionCanBeNull(expression.args[0])
        )
      }

      return 'string'
    }

    if (method === 'join' || method === 'resolve') {
      for (let index = 0; index < argTypes.length; index++) {
        const argType = argTypes[index]

        this.checkAssignableType(
          argType,
          'string',
          expression.args[index].loc,
          false,
          this.expressionCanBeNull(expression.args[index])
        )
      }

      return returnType
    }

    if (method === 'basename') {
      if (expression.args.length < 1 || expression.args.length > 2) {
        this.report(
          'CCJS_ARG_COUNT',
          `function ${call.label} expects 1 or 2 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      for (let index = 0; index < argTypes.length; index++) {
        const argType = argTypes[index]

        this.checkAssignableType(
          argType,
          'string',
          expression.args[index].loc,
          false,
          this.expressionCanBeNull(expression.args[index])
        )
      }

      return 'string'
    }

    let expectedArgs = 1

    if (method === 'relative') {
      expectedArgs = 2
    }

    if (expression.args.length !== expectedArgs) {
      this.report(
        'CCJS_ARG_COUNT',
        `function ${call.label} expects ${expectedArgs} argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    for (let index = 0; index < argTypes.length; index++) {
      const argType = argTypes[index]

      this.checkAssignableType(
        argType,
        'string',
        expression.args[index].loc,
        false,
        this.expressionCanBeNull(expression.args[index])
      )
    }

    return returnType
  }

  resolvePathRuntimeCall(expression: AnyNode): RuntimeCallInfo | null {
    const path = memberExpressionPath(expression.callee)
    const method = this.resolvePathRuntimeMethod(path)

    if (method == null) {
      return null
    }

    let label = method

    if (path != null) {
      label = joinStrings(path, '.')
    }

    return {
      method,
      label,
      unsupported: !isPathRuntimeMethod(method)
    }
  }

  resolvePathRuntimeMethod(path: readonly string[] | null | undefined): string | null {
    if (path == null) {
      return null
    }

    if (path.length === 1) {
      const rootName = firstPathSegment(path)
      const symbol = this.scope.resolve(rootName)
      let importedName: string | null = null

      if (symbol != null && symbol.importedName != null) {
        importedName = symbol.importedName
      }

      if (symbol != null && symbol.kind === 'import' && isNodePathImportSource(symbol.importSource) && importedName != null) {
        if (isPathRuntimeMethod(importedName) || isUnsupportedPathRuntimeMethod(importedName)) {
          return importedName
        }

        return null
      }
    }

    if (path.length === 2) {
      const rootName = firstPathSegment(path)
      const symbol = this.scope.resolve(rootName)

      if (
        symbol != null &&
        symbol.kind === 'import' &&
        isNodePathImportSource(symbol.importSource) &&
        (symbol.importedName === 'default' || symbol.importedName === 'path' || symbol.importedName === 'posix')
      ) {
        if (isPathRuntimeMethod(path[1]) || isUnsupportedPathRuntimeMethod(path[1])) {
          return path[1]
        }

        return null
      }
    }

    if (path.length === 3 && path[1] === 'posix') {
      const rootName = firstPathSegment(path)
      const symbol = this.scope.resolve(rootName)

      if (
        symbol != null &&
        symbol.kind === 'import' &&
        isNodePathImportSource(symbol.importSource) &&
        (symbol.importedName === 'default' || symbol.importedName === 'path')
      ) {
        if (isPathRuntimeMethod(path[2]) || isUnsupportedPathRuntimeMethod(path[2])) {
          return path[2]
        }

        return null
      }
    }

    return null
  }

  checkPathConstantMemberExpression(expression: AnyNode): ValueType | null {
    const path = memberExpressionPath(expression)
    const constant = this.resolvePathRuntimeConstant(path)

    if (constant == null) {
      return null
    }

    expression.valueType = 'string'
    expression.pathRuntimeConstant = constant

    return 'string'
  }

  resolvePathRuntimeConstant(path: readonly string[] | null | undefined): string | null {
    if (path == null) {
      return null
    }

    if (path.length === 2) {
      const rootName = firstPathSegment(path)
      const symbol = this.scope.resolve(rootName)

      if (
        symbol != null &&
        symbol.kind === 'import' &&
        isNodePathImportSource(symbol.importSource) &&
        (symbol.importedName === 'default' || symbol.importedName === 'path' || symbol.importedName === 'posix') &&
        isPathRuntimeConstant(path[1])
      ) {
        return path[1]
      }
    }

    if (path.length === 3 && path[1] === 'posix') {
      const rootName = firstPathSegment(path)
      const symbol = this.scope.resolve(rootName)

      if (
        symbol != null &&
        symbol.kind === 'import' &&
        isNodePathImportSource(symbol.importSource) &&
        (symbol.importedName === 'default' || symbol.importedName === 'path') &&
        isPathRuntimeConstant(path[2])
      ) {
        return path[2]
      }
    }

    return null
  }

  checkBufferConstantMemberExpression(expression: AnyNode): ValueType | null {
    const constant = this.resolveBufferRuntimeConstant(memberExpressionPath(expression))

    if (constant == null) {
      return null
    }

    expression.bufferRuntimeConstant = constant
    expression.valueType = 'number'

    return 'number'
  }

  resolveBufferRuntimeConstant(path: readonly string[] | null | undefined): string | null {
    if (path == null) {
      return null
    }

    if (path.length === 2) {
      const rootName = firstPathSegment(path)
      const symbol = this.scope.resolve(rootName)

      if (symbol != null && symbol.kind === 'import') {
        const importSource = symbol.importSource
        const importedName = symbol.importedName

        if (
          isNodeBufferImportSource(importSource) &&
          importedName === 'constants' &&
          isBufferRuntimeConstant(path[1])
        ) {
          return path[1]
        }
      }
    }

    if (path.length === 3 && path[1] === 'constants') {
      const rootName = firstPathSegment(path)
      const symbol = this.scope.resolve(rootName)

      if (symbol != null && symbol.kind === 'import') {
        const importSource = symbol.importSource
        const importedName = symbol.importedName

        if (
          isNodeBufferImportSource(importSource) &&
          (importedName === 'default' || importedName === 'buffer') &&
          isBufferRuntimeConstant(path[2])
        ) {
          return path[2]
        }
      }
    }

    return null
  }

  checkDebugMemoryCall(expression: AnyNode): ValueType | null {
    const path = memberExpressionPath(expression.callee)

    if (!isDebugRuntimeMethodPath(path)) {
      return null
    }

    const method = debugRuntimeMethodNameFromKnownPath(path)

    expression.valueType = 'object'
    expression.shape = debugMemoryStatsObjectShape
    expression.debugRuntimeMethod = method

    if (expression.args.length !== 0) {
      this.report(
        'CCJS_ARG_COUNT',
        `function ccjs.__debug.memory expects 0 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    return 'object'
  }

  checkClassMethodCall(expression: AnyNode): ValueType | null {
    if (expression.callee.type !== 'MemberExpression') {
      return null
    }

    this.checkExpression(expression.callee.object)
    const className = this.resolveClassMethodReceiverClassName(expression.callee.object)

    if (className == null) {
      return null
    }

    const classSymbol = this.scope.resolve(className)
    let method: AnyNode | null = null

    if (classSymbol != null) {
      const classMethods = classSymbol.classMethods

      if (classMethods != null) {
        for (let index = 0; index < classMethods.length; index = index + 1) {
          const item = checkerNodeAt(classMethods, index)

          if (nodeNameEquals(item, expression.callee.property)) {
            method = item
            break
          }
        }
      }
    }

    const argTypes: ValueType[] = []

    for (let index = 0; index < expression.args.length; index = index + 1) {
      const arg = checkerNodeAt(expression.args, index)

      argTypes.push(this.checkExpression(arg))
    }

    if (method == null) {
      this.report('CCJS_UNKNOWN_FIELD', `unknown method ${expression.callee.property}`, expression.callee.loc)
      expression.valueType = 'unknown'
      return 'unknown'
    }

    const params: AnyNode[] = []

    for (let index = 0; index < method.params.length; index = index + 1) {
      const param = checkerNodeAt(method.params, index)

      params.push(this.resolveParam(param))
    }

    const returnInfo = this.resolveDeclaredType(method.returnType, method.loc)

    if (!this.acceptsArgumentCount(params, expression.args.length)) {
      this.report(
        'CCJS_ARG_COUNT',
        this.argumentCountMessage(`method ${expression.callee.property}`, params, expression.args.length),
        expression.loc
      )
    }

    for (let index = 0; index < params.length; index++) {
      const param = params[index]

      if (index < argTypes.length) {
        this.checkAssignableType(
          argTypes[index],
          param.valueType,
          expression.args[index].loc,
          param.nullable === true,
          this.expressionCanBeNull(expression.args[index])
        )
      }
    }

    expression.valueType = returnInfo.valueType
    expression.nullable = returnInfo.nullable
    expression.arrayElementType = returnInfo.arrayElementType
    expression.arrayElementDeclaredType = returnInfo.arrayElementDeclaredType
    expression.mapKeyType = returnInfo.mapKeyType
    expression.mapValueType = returnInfo.mapValueType
    expression.promiseValueType = null

    if (returnInfo.promiseValueType != null) {
      expression.promiseValueType = returnInfo.promiseValueType
    }

    expression.setElementType = returnInfo.setElementType
    expression.shape = returnInfo.shape

    return returnInfo.valueType
  }

  checkMathCall(expression: AnyNode): ValueType | null {
    if (!isMathRuntimeMethod(expression.callee) || this.scope.resolve('Math') != null) {
      return null
    }

    const method = expression.callee.property
    const expectedArgCount = knownMathRuntimeArgCount(method)

    expression.mathRuntimeMethod = method
    expression.valueType = 'number'

    if (expression.args.length !== expectedArgCount) {
      this.report(
        'CCJS_ARG_COUNT',
        `function Math.${method} expects ${expectedArgCount} argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    for (let index = 0; index < expression.args.length; index = index + 1) {
      const arg = checkerNodeAt(expression.args, index)

      this.checkAssignableType(this.checkExpression(arg), 'number', arg.loc, false, false)
    }

    return 'number'
  }

  checkArrayIsArrayCall(expression: AnyNode): ValueType | null {
    const path = memberExpressionPath(expression.callee)

    if (path == null || path.length !== 2 || path[0] !== 'Array' || path[1] !== 'isArray') {
      return null
    }

    if (this.scope.resolve('Array') != null) {
      return null
    }

    expression.arrayIsArrayCall = true
    expression.valueType = 'boolean'

    if (expression.args.length !== 1) {
      this.report(
        'CCJS_ARG_COUNT',
        `function Array.isArray expects 1 argument(s), got ${expression.args.length}`,
        expression.loc
      )
      return 'boolean'
    }

    this.checkExpression(expression.args[0])

    return 'boolean'
  }

  checkObjectStaticCall(expression: AnyNode): ValueType | null {
    const path = memberExpressionPath(expression.callee)

    if (
      path == null ||
      path.length !== 2 ||
      path[0] !== 'Object' ||
      (path[1] !== 'values' && path[1] !== 'entries' && path[1] !== 'keys')
    ) {
      return null
    }

    if (this.scope.resolve('Object') != null) {
      return null
    }

    const method = path[1]

    expression.objectRuntimeMethod = method
    expression.valueType = 'array'
    expression.arrayElementType = 'unknown'
    expression.arrayElementDeclaredType = null

    if (method === 'entries') {
      expression.arrayElementType = 'array'
    } else if (method === 'keys') {
      expression.arrayElementType = 'string'
      expression.arrayElementDeclaredType = 'string'
    }

    if (expression.args.length !== 1) {
      this.report(
        'CCJS_ARG_COUNT',
        `function Object.${method} expects 1 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    if (expression.args[0] != null) {
      const arg = checkerNodeAt(expression.args, 0)
      const argType = this.checkExpression(arg)

      if (argType !== 'unknown' && argType !== 'object' && argType !== 'array') {
        this.report(
          'CCJS_TYPE_MISMATCH',
          `function Object.${method} expects an object or array argument`,
          arg.loc
        )
      }
      if (method === 'values') {
        if (argType === 'array') {
          expression.arrayElementType = this.resolveExpressionArrayElementType(arg) ?? 'unknown'
        } else {
          expression.arrayElementType = this.resolveObjectValuesElementType(arg)
        }
      }
    }

    for (let index = 1; index < expression.args.length; index = index + 1) {
      const arg = checkerNodeAt(expression.args, index)

      this.checkExpression(arg)
    }

    return 'array'
  }

  resolveObjectValuesElementType(expression: AnyNode): ValueType {
    const shape = this.resolveExpressionShape(expression)

    if (shape == null || shape.fields.length === 0) {
      return 'unknown'
    }

    const types: ValueType[] = []

    for (const field of shape.fields) {
      let valueType: ValueType = 'unknown'

      if (field.valueType != null) {
        valueType = field.valueType
      }

      types.push(valueType)
    }

    return commonValueType(types)
  }

  checkFsConstantMemberExpression(expression: AnyNode): ValueType | null {
    const path = memberExpressionPath(expression)

    if (path == null || path.length !== 3 || path[1] !== 'constants' || !fsConstantValues.has(path[2])) {
      return null
    }

    const rootName = firstPathSegment(path)
    const symbol = this.scope.resolve(rootName)

    if (symbol == null || !isFsRuntimeImportSymbol(symbol)) {
      return null
    }

    expression.fsRuntimeConstant = path[2]
    expression.valueType = 'number'

    return 'number'
  }

  checkFsStatsMethodCall(expression: AnyNode): ValueType | null {
    if (
      expression.callee.type !== 'MemberExpression' ||
      expression.callee.property !== 'isFile' &&
      expression.callee.property !== 'isDirectory'
    ) {
      return null
    }

    const objectType = this.checkExpression(expression.callee.object)
    const shape = this.resolveExpressionShape(expression.callee.object)

    if (objectType !== 'object' || shape == null || (shape.builtin !== 'fs.Stats' && shape.builtin !== 'fs.Dirent')) {
      return null
    }

    if (expression.args.length !== 0) {
      let receiverName = 'Stats'

      if (shape.builtin === 'fs.Dirent') {
        receiverName = 'Dirent'
      }

      this.report(
        'CCJS_ARG_COUNT',
        `function ${receiverName}.${expression.callee.property} expects 0 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    if (shape.builtin === 'fs.Dirent') {
      if (expression.callee.property === 'isFile') {
        expression.fsRuntimeMethod = 'direntIsFile'
      } else {
        expression.fsRuntimeMethod = 'direntIsDirectory'
      }
    } else {
      if (expression.callee.property === 'isFile') {
        expression.fsRuntimeMethod = 'statsIsFile'
      } else {
        expression.fsRuntimeMethod = 'statsIsDirectory'
      }
    }
    expression.valueType = 'boolean'

    return 'boolean'
  }

  checkFetchCall(expression: AnyNode): ValueType | null {
    let calleeName = ''

    if (expression.callee.type === 'Reference' && expression.callee.path.length === 1) {
      calleeName = firstPathSegment(expression.callee.path)
    }

    if (
      expression.callee.type !== 'Reference' ||
      expression.callee.path.length !== 1 ||
      calleeName !== 'fetch' ||
      this.scope.resolve('fetch') != null
    ) {
      return null
    }

    if (!this.requireLibuvBackend('fetch', expression.loc)) {
      expression.fetchRuntimeMethod = 'fetch'
      expression.valueType = 'promise'
      expression.promiseValueType = 'object'
      expression.shape = fetchResponseObjectShape

      return 'promise'
    }

    if (expression.args.length < 1 || expression.args.length > 2) {
      this.report(
        'CCJS_ARG_COUNT',
        `function fetch expects 1 or 2 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    if (expression.args[0] != null) {
      this.checkAssignableType(
        this.checkExpression(expression.args[0]),
        'string',
        expression.args[0].loc,
        false,
        this.expressionCanBeNull(expression.args[0])
      )

      if (this.isFetchHttpsLiteral(expression.args[0]) && !this.supportsFetchHttps()) {
        this.report(
          'CCJS_FETCH',
          'https fetch URLs require a configured TLS adapter and are not supported by the current C/libuv fetch slice',
          expression.args[0].loc
        )
      }
    }

    if (expression.args[1] != null) {
      this.checkFetchInitObject(expression.args[1])
    }

    expression.fetchRuntimeMethod = 'fetch'
    expression.valueType = 'promise'
    expression.promiseValueType = 'object'
    expression.shape = fetchResponseObjectShape

    return 'promise'
  }

  checkFetchInitObject(expression: AnyNode): void {
    if (expression.type !== 'ObjectLiteral') {
      this.checkExpression(expression)
      this.report(
        'CCJS_FETCH',
        'fetch init must be an object literal in the current C/libuv fetch slice',
        expression.loc
      )
      return
    }

    for (const property of expression.properties) {
      if (!isFetchInitOption(property.key)) {
        this.checkExpression(property.value)
        this.report(
          'CCJS_FETCH',
          `fetch init option ${property.key} is not supported by the current C/libuv fetch slice`,
          property.loc
        )
        continue
      }

      if (property.key === 'method' || property.key === 'redirect') {
        this.checkAssignableType(
          this.checkExpression(property.value),
          'string',
          property.value.loc,
          false,
          this.expressionCanBeNull(property.value)
        )

        if (property.key === 'redirect' && !this.isSupportedFetchRedirectLiteral(property.value)) {
          this.report(
            'CCJS_FETCH',
            "fetch init redirect must be 'follow', 'manual' or 'error' in the current C/libuv fetch slice",
            property.value.loc
          )
        }
        continue
      }

      if (property.key === 'body') {
        const bodyType = this.checkExpression(property.value)

        if (bodyType !== 'string' && bodyType !== 'bytes') {
          this.report(
            'CCJS_FETCH',
            'fetch init body must be a string, Buffer or Uint8Array in the current C/libuv fetch slice',
            property.value.loc
          )
        }
        continue
      }

      if (property.key === 'signal') {
        const signalType = this.checkExpression(property.value)
        const signalShape = this.resolveExpressionShape(property.value)

        if (signalType !== 'object' || signalShape == null || signalShape.builtin !== 'fetch.AbortSignal') {
          this.report(
            'CCJS_FETCH',
            'fetch init signal must be an AbortSignal in the current C/libuv fetch slice',
            property.value.loc
          )
        }
        continue
      }

      if (property.value.type !== 'ObjectLiteral') {
        this.checkExpression(property.value)
        this.report(
          'CCJS_FETCH',
          'fetch init headers must be an object literal in the current C/libuv fetch slice',
          property.value.loc
        )
        continue
      }

      for (const header of property.value.properties) {
        this.checkAssignableType(
          this.checkExpression(header.value),
          'string',
          header.value.loc,
          false,
          this.expressionCanBeNull(header.value)
        )
      }
    }
  }

  isFetchHttpsLiteral(expression: AnyNode): boolean {
    return expression.type === 'StringLiteral' && startsWithHttpsScheme(expression.value)
  }

  supportsFetchHttps(): boolean {
    return this.options.tlsBackend === 'boringssl' || this.options.tlsBackend === 'openssl'
  }

  supportsCryptoHash(): boolean {
    return this.options.tlsBackend === 'boringssl' || this.options.tlsBackend === 'openssl'
  }

  runtimeImportValueType(source: string, importedName: string): ValueType {
    if (isNodeOsImportSource(source)) {
      if (isOsRuntimeConstant(importedName)) {
        return 'string'
      }

      if (isOsRuntimeMethod(importedName) || isUnsupportedOsRuntimeMethod(importedName)) {
        return 'function'
      }

      if (importedName === 'default' || importedName === 'os') {
        return 'object'
      }
    }

    if (isNodePathImportSource(source)) {
      if (isPathRuntimeConstant(importedName)) {
        return 'string'
      }

      if (isPathRuntimeMethod(importedName) || isUnsupportedPathRuntimeMethod(importedName)) {
        return 'function'
      }

      if (importedName === 'default' || importedName === 'path' || importedName === 'posix') {
        return 'object'
      }
    }

    if (isNodeUrlImportSource(source)) {
      if (
        isUrlRuntimeMethod(importedName) ||
        isUrlRuntimeConstructor(importedName) ||
        isUnsupportedUrlRuntimeMethod(importedName)
      ) {
        return 'function'
      }

      if (importedName === 'default' || importedName === 'url') {
        return 'object'
      }
    }

    if (isNodeProcessImportSource(source)) {
      if (isProcessRuntimeMethod(importedName) || isUnsupportedProcessRuntimeMethod(importedName)) {
        return 'function'
      }

      const propertyType = resolvedConcreteValueTypeMetadata(processRuntimePropertyValueType(importedName), 'unknown')

      if (!stringEquals(propertyType, 'unknown')) {
        return propertyType
      }

      if (importedName === 'default' || importedName === 'process') {
        return 'object'
      }
    }

    if (isNodeChildProcessImportSource(source)) {
      if (isChildProcessRuntimeMethod(importedName) || isUnsupportedChildProcessRuntimeMethod(importedName)) {
        return 'function'
      }

      if (importedName === 'default' || importedName === 'childProcess') {
        return 'object'
      }
    }

    if (isNodeBufferImportSource(source)) {
      if (importedName === 'Buffer' || importedName === 'default' || importedName === 'buffer') {
        return 'object'
      }

      if (importedName === 'constants') {
        return 'object'
      }

      if (isUnsupportedBufferRuntimeExport(importedName)) {
        return 'function'
      }
    }

    if (isNodeEventsImportSource(source)) {
      if (importedName === 'default' || importedName === 'events') {
        return 'object'
      }

      if (isUnsupportedEventsRuntimeExport(importedName)) {
        return 'function'
      }
    }

    if (isNodeStreamImportSource(source)) {
      if (importedName === 'default' || importedName === 'stream' || importedName === 'promises') {
        return 'object'
      }

      if (isUnsupportedStreamRuntimeExport(importedName)) {
        return 'function'
      }
    }

    if (isNodeTimerImportSource(source)) {
      if (isTimerRuntimeMethod(importedName)) {
        return 'function'
      }

      if (importedName === 'default' || importedName === 'timers') {
        return 'object'
      }
    }

    return 'unknown'
  }

  checkRuntimeBuiltinImport(statement: AnyNode): void {
    if (statement.typeOnly) {
      return
    }

    if (isUnsupportedRuntimeBuiltinImportSource(statement.source)) {
      const unsupportedMessage = unsupportedRuntimeBuiltinImportMessageFromKnownSource(statement.source)

      this.report('CCJS_NOT_IMPLEMENTED', unsupportedMessage, statement.loc)
      return
    }

    const feature = libuvOnlyRuntimeImports.get(statement.source)

    if (feature != null) {
      this.requireLibuvBackend(feature, statement.loc)
    }
  }

  requireLibuvBackend(feature: string, loc: SourceLocation): boolean {
    if (this.options.loopBackend === 'libuv') {
      return true
    }

    this.report(
      'CCJS_NOT_IMPLEMENTED',
      `${feature} is not implemented for C without libuv; compile with loopBackend: 'libuv' or --loop-backend libuv`,
      loc
    )

    return false
  }

  isSupportedFetchRedirectLiteral(expression: AnyNode): boolean {
    if (expression.type !== 'StringLiteral') {
      return true
    }

    return isFetchRedirectMode(expression.value)
  }

  checkFetchAbortControllerMethodCall(expression: AnyNode): ValueType | null {
    if (expression.callee.type !== 'MemberExpression' || !isFetchAbortControllerMethod(expression.callee.property)) {
      return null
    }

    const objectType = this.checkExpression(expression.callee.object)
    const shape = this.resolveExpressionShape(expression.callee.object)

    if (objectType !== 'object' || shape == null || shape.builtin !== 'fetch.AbortController') {
      return null
    }

    if (expression.args.length !== 0) {
      this.report(
        'CCJS_ARG_COUNT',
        `function AbortController.abort expects 0 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    expression.fetchRuntimeMethod = 'abort'
    expression.valueType = 'void'

    return 'void'
  }

  checkFetchResponseMethodCall(expression: AnyNode): ValueType | null {
    if (expression.callee.type !== 'MemberExpression' || !isFetchResponseBodyMethod(expression.callee.property)) {
      return null
    }

    const objectType = this.checkExpression(expression.callee.object)
    const shape = this.resolveExpressionShape(expression.callee.object)

    if (objectType !== 'object' || shape == null || shape.builtin !== 'fetch.Response') {
      return null
    }

    if (expression.args.length !== 0) {
      this.report(
        'CCJS_ARG_COUNT',
        `function Response.${expression.callee.property} expects 0 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    if (!isSupportedFetchResponseBodyMethod(expression.callee.property)) {
      this.report(
        'CCJS_FETCH',
        `Response.${expression.callee.property} is not supported by the current C/libuv fetch slice`,
        expression.loc
      )
      expression.valueType = 'promise'
      expression.promiseValueType = 'unknown'

      return 'promise'
    }

    expression.fetchRuntimeMethod = 'text'
    expression.valueType = 'promise'
    expression.promiseValueType = 'string'

    return 'promise'
  }

  checkFetchUnsupportedResponseBodyMember(expression: AnyNode): ValueType | null {
    if (expression.property !== 'body') {
      return null
    }

    const objectType = this.checkExpression(expression.object)
    const shape = this.resolveExpressionShape(expression.object)

    if (objectType !== 'object' || shape == null || shape.builtin !== 'fetch.Response') {
      return null
    }

    this.report(
      'CCJS_FETCH',
      'Response.body streams are not supported by the current C/libuv fetch slice',
      expression.loc
    )
    expression.valueType = 'object'

    return 'object'
  }

  checkFetchHeadersMethodCall(expression: AnyNode): ValueType | null {
    if (expression.callee.type !== 'MemberExpression' || !isFetchHeadersMethod(expression.callee.property)) {
      return null
    }

    const objectType = this.checkExpression(expression.callee.object)
    const shape = this.resolveExpressionShape(expression.callee.object)

    if (objectType !== 'object' || shape == null || shape.builtin !== 'fetch.Headers') {
      return null
    }

    if (expression.args.length !== 1) {
      this.report(
        'CCJS_ARG_COUNT',
        `function Headers.${expression.callee.property} expects 1 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    if (expression.args[0] != null) {
      this.checkAssignableType(
        this.checkExpression(expression.args[0]),
        'string',
        expression.args[0].loc,
        false,
        this.expressionCanBeNull(expression.args[0])
      )
    }

    expression.fetchRuntimeMethod = fetchHeadersRuntimeMethod(expression.callee.property)
    expression.valueType = 'boolean'
    expression.nullable = false

    if (expression.callee.property === 'get') {
      expression.valueType = 'string'
      expression.nullable = true
    }

    return expression.valueType
  }

  resolveClassMethodReceiverClassName(expression: AnyNode): string | null {
    if (this.isThisExpression(expression)) {
      const symbol = this.scope.resolve('this')

      if (symbol != null && symbol.className != null) {
        return symbol.className
      }

      if (expression.className != null) {
        return expression.className
      }

      return null
    }

    if (expression.type === 'Reference' && expression.path.length === 1) {
      const name = firstPathSegment(expression.path)
      const symbol = this.scope.resolve(name)

      if (symbol != null && symbol.className != null) {
        return symbol.className
      }

      if (expression.className != null) {
        return expression.className
      }

      return null
    }

    if (expression.className != null) {
      return expression.className
    }

    return null
  }

  checkFsCall(expression: AnyNode): ValueType | null {
    const removedInfo = removedFsRuntimeMethodInfo(expression.callee)

    if (removedInfo != null && this.isFsRuntimeRootName(removedInfo.root)) {
      this.report('CCJS_FS_UNSUPPORTED', removedInfo.message, expression.loc)
      expression.valueType = 'unknown'

      return 'unknown'
    }

    const info = fsRuntimeCallInfo(expression.callee)

    if (info == null || !this.isFsRuntimeRoot(info)) {
      return null
    }

    const method = info.method
    const promisesApi = info.viaPromises || this.isFsPromisesImportRoot(info.root)
    const label = joinStrings(info.path, '.')
    const unsupportedMessage = stringOrEmpty(unsupportedFsRuntimeMethodMessage(info, promisesApi))

    if (!stringEquals(unsupportedMessage, '')) {
      this.report('CCJS_FS_UNSUPPORTED', unsupportedMessage, expression.loc)
      expression.valueType = 'unknown'

      return 'unknown'
    }

    if (method === 'statSync' || method === 'lstatSync') {
      if (expression.args.length !== 1) {
        this.report(
          'CCJS_ARG_COUNT',
          `function ${label} expects 1 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      this.checkFsStringArg(expression, 0)
      expression.fsRuntimeMethod = method
      expression.valueType = 'object'
      expression.shape = fsStatsObjectShape

      return 'object'
    }

    if (method === 'accessSync') {
      if (expression.args.length < 1 || expression.args.length > 2) {
        this.report(
          'CCJS_ARG_COUNT',
          `function ${label} expects 1 or 2 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      this.checkFsStringArg(expression, 0)
      this.checkFsNumberArg(expression, 1)
      expression.fsRuntimeMethod = 'accessSync'
      expression.valueType = 'void'

      return 'void'
    }

    if (method === 'mkdirSync') {
      if (expression.args.length < 1 || expression.args.length > 2) {
        this.report(
          'CCJS_ARG_COUNT',
          `function ${label} expects 1 or 2 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      this.checkFsStringArg(expression, 0)
      const options = this.checkFsBooleanOptionsArg(expression, 1, label, ['recursive'])
      expression.fsRuntimeMethod = 'mkdirSync'
      expression.fsRecursive = options.recursive === true
      expression.valueType = 'void'

      return 'void'
    }

    if (method === 'unlinkSync') {
      if (expression.args.length !== 1) {
        this.report(
          'CCJS_ARG_COUNT',
          `function ${label} expects 1 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      this.checkFsStringArg(expression, 0)
      expression.fsRuntimeMethod = 'unlinkSync'
      expression.valueType = 'void'

      return 'void'
    }

    if (method === 'rmSync') {
      if (expression.args.length < 1 || expression.args.length > 2) {
        this.report(
          'CCJS_ARG_COUNT',
          `function ${label} expects 1 or 2 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      this.checkFsStringArg(expression, 0)
      const options = this.checkFsBooleanOptionsArg(expression, 1, label, ['recursive', 'force'])
      expression.fsRuntimeMethod = 'rmSync'
      expression.fsRecursive = options.recursive === true
      expression.fsForce = options.force === true
      expression.valueType = 'void'

      return 'void'
    }

    if (method === 'renameSync') {
      if (expression.args.length !== 2) {
        this.report(
          'CCJS_ARG_COUNT',
          `function ${label} expects 2 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      this.checkFsStringArg(expression, 0)
      this.checkFsStringArg(expression, 1)
      expression.fsRuntimeMethod = 'renameSync'
      expression.valueType = 'void'

      return 'void'
    }

    if (method === 'readFileSync') {
      if (expression.args.length < 1 || expression.args.length > 2) {
        this.report(
          'CCJS_ARG_COUNT',
          `function ${label} expects 1 or 2 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      this.checkFsStringArg(expression, 0)

      if (expression.args[1] == null) {
        expression.fsRuntimeMethod = 'readFileBytesSync'
        expression.valueType = 'bytes'

        return 'bytes'
      }

      this.checkUtf8EncodingArg(expression, 1, label)
      expression.fsRuntimeMethod = 'readFileSync'
      expression.valueType = 'string'

      return 'string'
    }

    if (method === 'readDirSync') {
      let maxArgs = 1
      let expectedArgsLabel = '1'

      if (info.nodeName === 'readdirSync') {
        maxArgs = 2
        expectedArgsLabel = '1 or 2'
      }

      if (expression.args.length < 1 || expression.args.length > maxArgs) {
        this.report(
          'CCJS_ARG_COUNT',
          `function ${label} expects ${expectedArgsLabel} argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      this.checkFsStringArg(expression, 0)
      const withFileTypes = this.checkFsReaddirOptionsArg(expression, 1, label)

      expression.fsRuntimeMethod = 'readDirSync'
      expression.valueType = 'array'
      expression.arrayElementType = 'string'
      expression.arrayElementDeclaredType = 'string'

      if (withFileTypes) {
        expression.fsRuntimeMethod = 'readDirDirentsSync'
        expression.arrayElementType = 'object'
        expression.arrayElementDeclaredType = 'fs.Dirent'
      }

      return 'array'
    }

    if (method === 'writeFileSync') {
      if (expression.args.length < 2 || expression.args.length > 3) {
        this.report(
          'CCJS_ARG_COUNT',
          `function ${label} expects 2 or 3 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      this.checkFsStringArg(expression, 0)
      expression.fsRuntimeMethod = this.checkFsWriteDataArg(expression, 1, `${label} data`, 'writeFileSync')
      this.checkUtf8EncodingArg(expression, 2, label)

      expression.valueType = 'void'

      return 'void'
    }

    if (method === 'appendFileSync') {
      if (expression.args.length < 2 || expression.args.length > 3) {
        this.report(
          'CCJS_ARG_COUNT',
          `function ${label} expects 2 or 3 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      this.checkFsStringArg(expression, 0)
      expression.fsRuntimeMethod = this.checkFsWriteDataArg(expression, 1, `${label} data`, 'appendFileSync')
      this.checkUtf8EncodingArg(expression, 2, label)

      expression.valueType = 'void'

      return 'void'
    }

    if (method === 'copyFileSync') {
      if (expression.args.length !== 2) {
        this.report(
          'CCJS_ARG_COUNT',
          `function ${label} expects 2 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      this.checkFsStringArg(expression, 0)
      this.checkFsStringArg(expression, 1)
      expression.fsRuntimeMethod = 'copyFileSync'
      expression.valueType = 'void'

      return 'void'
    }

    if (method === 'realpathSync' || method === 'readlinkSync') {
      if (expression.args.length !== 1) {
        this.report(
          'CCJS_ARG_COUNT',
          `function ${label} expects 1 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      this.checkFsStringArg(expression, 0)
      expression.fsRuntimeMethod = method
      expression.valueType = 'string'

      return 'string'
    }

    if (method === 'symlinkSync') {
      if (expression.args.length !== 2) {
        this.report(
          'CCJS_ARG_COUNT',
          `function ${label} expects 2 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      this.checkFsStringArg(expression, 0)
      this.checkFsStringArg(expression, 1)
      expression.fsRuntimeMethod = 'symlinkSync'
      expression.valueType = 'void'

      return 'void'
    }

    if (method === 'readFile') {
      if (expression.args.length < 1 || expression.args.length > 2) {
        this.report(
          'CCJS_ARG_COUNT',
          `function ${label} expects 1 or 2 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      this.checkFsStringArg(expression, 0)

      if (promisesApi && expression.args[1] == null) {
        expression.fsRuntimeMethod = 'readFileBytes'
        expression.valueType = 'promise'
        expression.promiseValueType = 'bytes'

        return 'promise'
      }

      if (expression.args[1] != null) {
        this.checkUtf8EncodingArg(expression, 1, label)
      }

      expression.fsRuntimeMethod = 'readFile'
      expression.valueType = 'promise'
      expression.promiseValueType = 'string'

      return 'promise'
    }

    if (method === 'stat' || method === 'lstat') {
      if (expression.args.length !== 1) {
        this.report(
          'CCJS_ARG_COUNT',
          `function ${label} expects 1 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      this.checkFsStringArg(expression, 0)
      expression.fsRuntimeMethod = method
      expression.valueType = 'promise'
      expression.promiseValueType = 'object'
      expression.shape = fsStatsObjectShape

      return 'promise'
    }

    if (method === 'access') {
      if (expression.args.length < 1 || expression.args.length > 2) {
        this.report(
          'CCJS_ARG_COUNT',
          `function ${label} expects 1 or 2 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      this.checkFsStringArg(expression, 0)
      this.checkFsNumberArg(expression, 1)
      expression.fsRuntimeMethod = 'access'
      expression.valueType = 'promise'
      expression.promiseValueType = 'void'

      return 'promise'
    }

    if (method === 'mkdir') {
      let maxArgs = 1
      let expectedArgsLabel = '1'

      if (promisesApi) {
        maxArgs = 2
        expectedArgsLabel = '1 or 2'
      }

      if (expression.args.length < 1 || expression.args.length > maxArgs) {
        this.report(
          'CCJS_ARG_COUNT',
          `function ${label} expects ${expectedArgsLabel} argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      this.checkFsStringArg(expression, 0)
      let options: FsBooleanOptions = {}

      if (promisesApi) {
        options = this.checkFsBooleanOptionsArg(expression, 1, label, ['recursive'])
      }

      expression.fsRuntimeMethod = 'mkdir'
      expression.fsRecursive = options.recursive === true
      expression.valueType = 'promise'
      expression.promiseValueType = 'void'

      return 'promise'
    }

    if (method === 'unlink') {
      if (expression.args.length !== 1) {
        this.report(
          'CCJS_ARG_COUNT',
          `function ${label} expects 1 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      this.checkFsStringArg(expression, 0)
      expression.fsRuntimeMethod = 'unlink'
      expression.valueType = 'promise'
      expression.promiseValueType = 'void'

      return 'promise'
    }

    if (method === 'rm') {
      let maxArgs = 1
      let expectedArgsLabel = '1'

      if (promisesApi) {
        maxArgs = 2
        expectedArgsLabel = '1 or 2'
      }

      if (expression.args.length < 1 || expression.args.length > maxArgs) {
        this.report(
          'CCJS_ARG_COUNT',
          `function ${label} expects ${expectedArgsLabel} argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      this.checkFsStringArg(expression, 0)
      let options: FsBooleanOptions = {}

      if (promisesApi) {
        options = this.checkFsBooleanOptionsArg(expression, 1, label, ['recursive', 'force'])
      }

      expression.fsRuntimeMethod = 'rm'
      expression.fsRecursive = options.recursive === true
      expression.fsForce = options.force === true
      expression.valueType = 'promise'
      expression.promiseValueType = 'void'

      return 'promise'
    }

    if (method === 'rename') {
      if (expression.args.length !== 2) {
        this.report(
          'CCJS_ARG_COUNT',
          `function ${label} expects 2 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      this.checkFsStringArg(expression, 0)
      this.checkFsStringArg(expression, 1)
      expression.fsRuntimeMethod = 'rename'
      expression.valueType = 'promise'
      expression.promiseValueType = 'void'

      return 'promise'
    }

    if (method === 'readDir') {
      let maxArgs = 1
      let expectedArgsLabel = '1'

      if (info.nodeName === 'readdir') {
        maxArgs = 2
        expectedArgsLabel = '1 or 2'
      }

      if (expression.args.length < 1 || expression.args.length > maxArgs) {
        this.report(
          'CCJS_ARG_COUNT',
          `function ${label} expects ${expectedArgsLabel} argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      this.checkFsStringArg(expression, 0)
      const withFileTypes = this.checkFsReaddirOptionsArg(expression, 1, label)

      expression.fsRuntimeMethod = 'readDir'
      expression.valueType = 'promise'
      expression.promiseValueType = 'array'
      expression.arrayElementType = 'string'
      expression.arrayElementDeclaredType = 'string'

      if (withFileTypes) {
        expression.fsRuntimeMethod = 'readDirDirents'
        expression.arrayElementType = 'object'
        expression.arrayElementDeclaredType = 'fs.Dirent'
      }

      return 'promise'
    }

    if (method === 'appendFile') {
      let maxArgs = 2
      let expectedArgsLabel = '2'

      if (promisesApi) {
        maxArgs = 3
        expectedArgsLabel = '2 or 3'
      }

      if (expression.args.length < 2 || expression.args.length > maxArgs) {
        this.report(
          'CCJS_ARG_COUNT',
          `function ${label} expects ${expectedArgsLabel} argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      this.checkFsStringArg(expression, 0)
      expression.fsRuntimeMethod = this.checkFsWriteDataArg(expression, 1, `${label} data`, 'appendFile')
      this.checkUtf8EncodingArg(expression, 2, label)

      expression.valueType = 'promise'
      expression.promiseValueType = 'void'

      return 'promise'
    }

    if (method === 'copyFile') {
      if (expression.args.length !== 2) {
        this.report(
          'CCJS_ARG_COUNT',
          `function ${label} expects 2 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      this.checkFsStringArg(expression, 0)
      this.checkFsStringArg(expression, 1)
      expression.fsRuntimeMethod = 'copyFile'
      expression.valueType = 'promise'
      expression.promiseValueType = 'void'

      return 'promise'
    }

    if (method === 'realpath' || method === 'readlink') {
      if (expression.args.length !== 1) {
        this.report(
          'CCJS_ARG_COUNT',
          `function ${label} expects 1 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      this.checkFsStringArg(expression, 0)
      expression.fsRuntimeMethod = method
      expression.valueType = 'promise'
      expression.promiseValueType = 'string'

      return 'promise'
    }

    if (method === 'symlink') {
      if (expression.args.length !== 2) {
        this.report(
          'CCJS_ARG_COUNT',
          `function ${label} expects 2 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      this.checkFsStringArg(expression, 0)
      this.checkFsStringArg(expression, 1)
      expression.fsRuntimeMethod = 'symlink'
      expression.valueType = 'promise'
      expression.promiseValueType = 'void'

      return 'promise'
    }

    let maxArgs = 2
    let expectedArgsLabel = '2'

    if (promisesApi) {
      maxArgs = 3
      expectedArgsLabel = '2 or 3'
    }

    if (expression.args.length < 2 || expression.args.length > maxArgs) {
      this.report(
        'CCJS_ARG_COUNT',
        `function ${label} expects ${expectedArgsLabel} argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    this.checkFsStringArg(expression, 0)
    expression.fsRuntimeMethod = this.checkFsWriteDataArg(expression, 1, `${label} data`, 'writeFile')
    this.checkUtf8EncodingArg(expression, 2, label)

    expression.valueType = 'promise'
    expression.promiseValueType = 'void'

    return 'promise'
  }

  isFsRuntimeRoot(info: FsRuntimeCallInfo): boolean {
    return this.isFsRuntimeRootName(info.root)
  }

  isFsRuntimeRootName(root: string): boolean {
    const symbol = this.scope.resolve(root)

    if (symbol == null) {
      return false
    }

    return isFsRuntimeImportSymbol(symbol)
  }

  isFsPromisesImportRoot(root: string): boolean {
    const symbol = this.scope.resolve(root)

    if (symbol == null || symbol.kind !== 'import') {
      return false
    }

    if (symbol.importSource === 'node:fs/promises') {
      return true
    }

    if (
      (symbol.importSource === 'fs' || symbol.importSource === 'node:fs') &&
      symbol.importedName === 'promises'
    ) {
      return true
    }

    return false
  }

  checkFsWriteDataArg(expression: AnyNode, index: number, label: string, textMethod: string): string {
    const arg = expression.args[index]

    if (arg == null) {
      return textMethod
    }

    const argType = this.checkExpression(arg)

    if (argType === 'bytes') {
      if (textMethod === 'writeFileSync') {
        return 'writeFileBytesSync'
      }

      if (textMethod === 'appendFileSync') {
        return 'appendFileBytesSync'
      }

      if (textMethod === 'appendFile') {
        return 'appendFileBytes'
      }

      return 'writeFileBytes'
    }

    this.checkAssignableType(argType, 'string', arg.loc, false, this.expressionCanBeNull(arg))

    return textMethod
  }

  checkFsStringArg(expression: AnyNode, index: number): void {
    const arg = expression.args[index]

    if (arg == null) {
      return
    }

    this.checkAssignableType(this.checkExpression(arg), 'string', arg.loc, false, this.expressionCanBeNull(arg))
  }

  checkFsNumberArg(expression: AnyNode, index: number): void {
    const arg = expression.args[index]

    if (arg == null) {
      return
    }

    this.checkAssignableType(this.checkExpression(arg), 'number', arg.loc, false, this.expressionCanBeNull(arg))
  }

  checkFsReaddirOptionsArg(expression: AnyNode, index: number, label: string): boolean {
    const arg = expression.args[index]

    if (arg == null) {
      return false
    }

    if (arg.type === 'StringLiteral') {
      this.checkUtf8EncodingArg(expression, index, label)

      return false
    }

    const options = this.checkFsBooleanOptionsArg(expression, index, label, ['withFileTypes'])

    return options.withFileTypes === true
  }

  checkFsBooleanOptionsArg(
    expression: AnyNode,
    index: number,
    label: string,
    allowed: string[]
  ): FsBooleanOptions {
    const arg = expression.args[index]
    const result: FsBooleanOptions = {}

    if (arg == null) {
      return result
    }

    if (arg.type !== 'ObjectLiteral') {
      this.report(
        'CCJS_TYPE_MISMATCH',
        `${label} options must be an object literal in the current compiler slice`,
        arg.loc
      )
      this.checkExpression(arg)

      return result
    }

    for (const property of arg.properties) {
      let allowedOption = false

      for (const allowedName of allowed) {
        if (property.key === allowedName) {
          allowedOption = true
          break
        }
      }

      if (!allowedOption) {
        this.report('CCJS_UNKNOWN_FIELD', `unknown ${label} option ${property.key}`, property.loc)
        this.checkExpression(property.value)
        continue
      }

      let valueType = property.value.valueType

      if (valueType == null) {
        valueType = this.checkExpression(property.value)
      }

      if (valueType !== 'boolean' || property.value.type !== 'BooleanLiteral') {
        this.report(
          'CCJS_TYPE_MISMATCH',
          `${label} option ${property.key} must be a boolean literal in the current compiler slice`,
          property.value.loc
        )
        continue
      }

      if (property.key === 'recursive') {
        result.recursive = property.value.value === true
      } else if (property.key === 'force') {
        result.force = property.value.value === true
      } else if (property.key === 'withFileTypes') {
        result.withFileTypes = property.value.value === true
      }
    }

    return result
  }

  checkJsonCall(expression: AnyNode, declared?: ResolvedTypeInfo | null): ValueType | null {
    const method = stringOrEmpty(jsonRuntimeMethodName(expression.callee))

    if (stringEquals(method, '')) {
      return null
    }

    if (this.scope.resolve('JSON') != null) {
      return null
    }

    expression.jsonRuntimeMethod = method

    if (expression.args.length !== 1) {
      this.report(
        'CCJS_ARG_COUNT',
        `function JSON.${method} expects 1 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    if (method === 'parse') {
      this.checkJsonStringArg(expression, 0)

      const literalType = this.inferJsonParseLiteralType(expression)
      let valueType: ValueType = 'object'

      if (declared != null && isJsonParseDeclaredType(declared.valueType)) {
        valueType = declared.valueType
      } else if (literalType != null) {
        valueType = literalType.valueType
      }

      expression.valueType = valueType
      expression.arrayElementType = null
      expression.arrayElementDeclaredType = null
      expression.mapKeyType = null
      expression.mapValueType = null
      expression.promiseValueType = null
      expression.setElementType = null
      expression.shape = null

      if (declared != null) {
        expression.arrayElementType = declared.arrayElementType
        expression.arrayElementDeclaredType = declared.arrayElementDeclaredType
        expression.mapKeyType = declared.mapKeyType
        expression.mapValueType = declared.mapValueType
        expression.promiseValueType = null

        if (declared.promiseValueType != null) {
          expression.promiseValueType = declared.promiseValueType
        }

        expression.setElementType = declared.setElementType

        if (valueType === 'object') {
          expression.shape = declared.shape
        }
      } else if (literalType != null) {
        expression.arrayElementType = literalType.arrayElementType
        expression.arrayElementDeclaredType = literalType.arrayElementDeclaredType
        expression.shape = literalType.shape
      }

      return valueType
    }

    if (expression.args[0] != null) {
      this.checkExpression(expression.args[0])
    }

    expression.valueType = 'string'

    return 'string'
  }

  checkJsonStringArg(expression: AnyNode, index: number): void {
    const arg = expression.args[index]

    if (arg == null) {
      return
    }

    this.checkAssignableType(this.checkExpression(arg), 'string', arg.loc, false, this.expressionCanBeNull(arg))
  }

  inferJsonParseLiteralType(expression: AnyNode): JsonParseLiteralTypeInfo | null {
    const arg = expression.args[0]

    if (arg == null || arg.type !== 'StringLiteral') {
      return null
    }

    const result = this.parseJsonLiteralType(arg.value, 0)

    if (result == null) {
      return null
    }

    const end = this.skipJsonWhitespace(arg.value, result.index)

    if (end !== arg.value.length) {
      return null
    }

    return result.info
  }

  parseJsonLiteralType(source: string, index: number): JsonParseLiteralResult | null {
    const nextIndex = this.skipJsonWhitespace(source, index)
    const char = source[nextIndex]

    if (char === '[') {
      return this.parseJsonArrayLiteralType(source, nextIndex + 1)
    }

    if (char === '{') {
      return this.parseJsonObjectLiteralType(source, nextIndex + 1)
    }

    if (char === '"') {
      const stringResult = this.parseJsonStringLiteral(source, nextIndex, false)

      if (stringResult == null) {
        return null
      }

      return {
        info: this.jsonLiteralTypeInfo('string'),
        index: stringResult.index
      }
    }

    if (char === '-' || this.isJsonDigit(char)) {
      const numberEnd = this.parseJsonNumberEnd(source, nextIndex)

      if (numberEnd == null) {
        return null
      }

      return {
        info: this.jsonLiteralTypeInfo('number'),
        index: numberEnd
      }
    }

    if (this.sourceStartsWith(source, nextIndex, 'true')) {
      return {
        info: this.jsonLiteralTypeInfo('boolean'),
        index: nextIndex + 4
      }
    }

    if (this.sourceStartsWith(source, nextIndex, 'false')) {
      return {
        info: this.jsonLiteralTypeInfo('boolean'),
        index: nextIndex + 5
      }
    }

    if (this.sourceStartsWith(source, nextIndex, 'null')) {
      return {
        info: this.jsonLiteralTypeInfo('unknown'),
        index: nextIndex + 4
      }
    }

    return null
  }

  parseJsonArrayLiteralType(source: string, index: number): JsonParseLiteralResult | null {
    const elementTypes: ValueType[] = []
    let nextIndex = this.skipJsonWhitespace(source, index)

    if (source[nextIndex] === ']') {
      return {
        info: this.jsonArrayLiteralTypeInfo(elementTypes),
        index: nextIndex + 1
      }
    }

    while (nextIndex < source.length) {
      const element = this.parseJsonLiteralType(source, nextIndex)

      if (element == null) {
        return null
      }

      elementTypes.push(element.info.valueType)
      nextIndex = this.skipJsonWhitespace(source, element.index)

      if (source[nextIndex] === ']') {
        return {
          info: this.jsonArrayLiteralTypeInfo(elementTypes),
          index: nextIndex + 1
        }
      }

      if (source[nextIndex] !== ',') {
        return null
      }

      nextIndex = this.skipJsonWhitespace(source, nextIndex + 1)
    }

    return null
  }

  parseJsonObjectLiteralType(source: string, index: number): JsonParseLiteralResult | null {
    const fields: AnyNode[] = []
    let nextIndex = this.skipJsonWhitespace(source, index)

    if (source[nextIndex] === '}') {
      return {
        info: this.jsonObjectLiteralTypeInfo(fields),
        index: nextIndex + 1
      }
    }

    while (nextIndex < source.length) {
      const key = this.parseJsonStringLiteral(source, nextIndex, true)

      if (key == null) {
        return null
      }

      nextIndex = this.skipJsonWhitespace(source, key.index)

      if (source[nextIndex] !== ':') {
        return null
      }

      const value = this.parseJsonLiteralType(source, nextIndex + 1)

      if (value == null) {
        return null
      }

      fields.push(this.jsonObjectLiteralField(key.value, value.info))
      nextIndex = this.skipJsonWhitespace(source, value.index)

      if (source[nextIndex] === '}') {
        return {
          info: this.jsonObjectLiteralTypeInfo(fields),
          index: nextIndex + 1
        }
      }

      if (source[nextIndex] !== ',') {
        return null
      }

      nextIndex = this.skipJsonWhitespace(source, nextIndex + 1)
    }

    return null
  }

  parseJsonStringLiteral(source: string, index: number, captureValue: boolean): JsonParseStringResult | null {
    if (source[index] !== '"') {
      return null
    }

    let nextIndex = index + 1
    let value = ''

    while (nextIndex < source.length) {
      const char = source[nextIndex]

      if (char === '"') {
        return {
          value,
          index: nextIndex + 1
        }
      }

      if (char === '\\') {
        const escaped = source[nextIndex + 1]

        if (escaped === 'u') {
          if (!this.isJsonHexEscape(source, nextIndex + 2)) {
            return null
          }

          if (captureValue) {
            return null
          }

          nextIndex = nextIndex + 6
          continue
        }

        if (!this.isJsonSimpleEscape(escaped)) {
          return null
        }

        if (captureValue) {
          value = `${value}${this.jsonSimpleEscapeValue(escaped)}`
        }

        nextIndex = nextIndex + 2
        continue
      }

      if (char.charCodeAt(0) < 32) {
        return null
      }

      if (captureValue) {
        value = `${value}${char}`
      }

      nextIndex = nextIndex + 1
    }

    return null
  }

  parseJsonNumberEnd(source: string, index: number): number | null {
    let nextIndex = index

    if (source[nextIndex] === '-') {
      nextIndex = nextIndex + 1
    }

    if (source[nextIndex] === '0') {
      nextIndex = nextIndex + 1
    } else if (this.isJsonNonZeroDigit(source[nextIndex])) {
      nextIndex = nextIndex + 1

      while (this.isJsonDigit(source[nextIndex])) {
        nextIndex = nextIndex + 1
      }
    } else {
      return null
    }

    if (source[nextIndex] === '.') {
      nextIndex = nextIndex + 1

      if (!this.isJsonDigit(source[nextIndex])) {
        return null
      }

      while (this.isJsonDigit(source[nextIndex])) {
        nextIndex = nextIndex + 1
      }
    }

    if (source[nextIndex] === 'e' || source[nextIndex] === 'E') {
      nextIndex = nextIndex + 1

      if (source[nextIndex] === '+' || source[nextIndex] === '-') {
        nextIndex = nextIndex + 1
      }

      if (!this.isJsonDigit(source[nextIndex])) {
        return null
      }

      while (this.isJsonDigit(source[nextIndex])) {
        nextIndex = nextIndex + 1
      }
    }

    return nextIndex
  }

  skipJsonWhitespace(source: string, index: number): number {
    let nextIndex = index

    while (
      source[nextIndex] === ' ' ||
      source[nextIndex] === '\n' ||
      source[nextIndex] === '\r' ||
      source[nextIndex] === '\t'
    ) {
      nextIndex = nextIndex + 1
    }

    return nextIndex
  }

  isJsonDigit(value: string | null | undefined): boolean {
    return value === '0' || this.isJsonNonZeroDigit(value)
  }

  isJsonNonZeroDigit(value: string | null | undefined): boolean {
    return (
      value === '1' ||
      value === '2' ||
      value === '3' ||
      value === '4' ||
      value === '5' ||
      value === '6' ||
      value === '7' ||
      value === '8' ||
      value === '9'
    )
  }

  isJsonHexEscape(source: string, index: number): boolean {
    for (let offset = 0; offset < 4; offset = offset + 1) {
      if (!this.isJsonHexDigit(source[index + offset])) {
        return false
      }
    }

    return true
  }

  isJsonHexDigit(value: string | null | undefined): boolean {
    return (
      this.isJsonDigit(value) ||
      value === 'a' ||
      value === 'b' ||
      value === 'c' ||
      value === 'd' ||
      value === 'e' ||
      value === 'f' ||
      value === 'A' ||
      value === 'B' ||
      value === 'C' ||
      value === 'D' ||
      value === 'E' ||
      value === 'F'
    )
  }

  isJsonSimpleEscape(value: string | null | undefined): boolean {
    return (
      value === '"' ||
      value === '\\' ||
      value === '/' ||
      value === 'b' ||
      value === 'f' ||
      value === 'n' ||
      value === 'r' ||
      value === 't'
    )
  }

  jsonSimpleEscapeValue(value: string): string {
    if (value === 'b') {
      return '\b'
    }

    if (value === 'f') {
      return '\f'
    }

    if (value === 'n') {
      return '\n'
    }

    if (value === 'r') {
      return '\r'
    }

    if (value === 't') {
      return '\t'
    }

    return value
  }

  sourceStartsWith(source: string, index: number, expected: string): boolean {
    for (let offset = 0; offset < expected.length; offset = offset + 1) {
      if (source[index + offset] !== expected[offset]) {
        return false
      }
    }

    return true
  }

  jsonArrayLiteralTypeInfo(elementTypes: ValueType[]): JsonParseLiteralTypeInfo {
    const arrayElementType = commonArrayElementType(elementTypes)
    let arrayElementDeclaredType: string | null = null

    if (arrayElementType !== 'unknown') {
      arrayElementDeclaredType = arrayElementType
    }

    return {
      valueType: 'array',
      shape: null,
      arrayElementType,
      arrayElementDeclaredType
    }
  }

  jsonObjectLiteralTypeInfo(fields: CheckerNode[]): JsonParseLiteralTypeInfo {
    return {
      valueType: 'object',
      shape: {
        kind: 'object',
        dynamic: true,
        fields
      },
      arrayElementType: null,
      arrayElementDeclaredType: null
    }
  }

  jsonObjectLiteralField(name: string, fieldType: JsonParseLiteralTypeInfo): CheckerNode {
    return {
      type: 'Field',
      name,
      valueType: fieldType.valueType,
      nullable: fieldType.valueType === 'unknown',
      arrayElementType: fieldType.arrayElementType,
      arrayElementDeclaredType: fieldType.arrayElementDeclaredType,
      mapKeyType: null,
      mapValueType: null,
      promiseValueType: null,
      setElementType: null,
      shape: fieldType.shape,
      loc: { line: 1, column: 1 }
    }
  }

  jsonLiteralTypeInfo(valueType: ValueType): JsonParseLiteralTypeInfo {
    return {
      valueType,
      shape: null,
      arrayElementType: null,
      arrayElementDeclaredType: null
    }
  }

  checkPromiseStaticCall(expression: AnyNode): ValueType | null {
    const method = promiseStaticMethodName(expression.callee)

    if (method == null) {
      return null
    }

    if (this.scope.resolve('Promise') != null) {
      return null
    }

    if (expression.args.length > 1) {
      this.report(
        'CCJS_ARG_COUNT',
        `function Promise.${method} expects at most 1 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    const argTypes: ValueType[] = []

    for (let index = 0; index < expression.args.length; index = index + 1) {
      const arg = checkerNodeAt(expression.args, index)

      argTypes.push(this.checkExpression(arg))
    }

    expression.valueType = 'promise'
    expression.promiseValueType = 'unknown'

    if (method === 'resolve') {
      expression.promiseValueType = 'void'

      if (expression.args[0] != null) {
        expression.promiseValueType = argTypes[0]
      }
    }

    return 'promise'
  }

  checkPromiseMethodCall(expression: AnyNode): ValueType | null {
    if (expression.callee.type !== 'MemberExpression' || !isPromiseMethod(expression.callee.property)) {
      return null
    }

    const objectType = this.checkExpression(expression.callee.object)

    if (objectType !== 'promise') {
      return null
    }

    const property = expression.callee.property
    let promiseValueType: ValueType = 'unknown'
    const resolvedPromiseValueType = this.resolveExpressionPromiseValueType(expression.callee.object)

    if (resolvedPromiseValueType != null) {
      promiseValueType = resolvedPromiseValueType
    }

    if (expression.args.length !== 1) {
      this.report(
        'CCJS_ARG_COUNT',
        `promise.${property} expects 1 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    const callback = expression.args[0]

    if (property === 'then') {
      let mappedType: ValueType = 'unknown'

      if (callback != null) {
        mappedType = this.checkPromiseCallback(callback, [{ name: 'value', valueType: promiseValueType }], null, 'promise.then callback')
      }

      for (let index = 1; index < expression.args.length; index++) {
        this.checkExpression(expression.args[index])
      }

      expression.valueType = 'promise'
      expression.promiseValueType = mappedType

      return 'promise'
    }

    if (callback != null) {
      let catchReturnType: ValueType | null = promiseValueType

      if (promiseValueType === 'unknown') {
        catchReturnType = null
      }

      this.checkPromiseCallback(
        callback,
        [{ name: 'error', valueType: 'unknown' }],
        catchReturnType,
        'promise.catch callback'
      )
    }

    for (let index = 1; index < expression.args.length; index++) {
      this.checkExpression(expression.args[index])
    }

    expression.valueType = 'promise'
    expression.promiseValueType = promiseValueType

    return 'promise'
  }

  checkPromiseCallback(
    expression: AnyNode,
    params: Array<{ name: string; valueType: ValueType }>,
    returnType: ValueType | null,
    label: string
  ): ValueType {
    if (expression.type !== 'ArrowFunctionExpression') {
      const callbackType = this.checkExpression(expression)

      this.checkAssignableType(callbackType, 'function', expression.loc, false, false)

      return 'unknown'
    }

    if (expression.async === true) {
      this.report(
        'CCJS_ASYNC_CALLBACK',
        'async Promise callbacks are not supported in the current compiler slice; use a named async helper and await it explicitly',
        expression.loc
      )
      return 'unknown'
    }

    if (expression.params.length > params.length) {
      this.report(
        'CCJS_ARG_COUNT',
        `${label} expects at most ${params.length} parameter(s), got ${expression.params.length}`,
        expression.loc
      )
    }

    let actualReturnType: ValueType = 'unknown'
    let returnLoc = expression.loc
    let returnNullable = false
    let returnPromiseValueType: ValueType | null = null

    this.withScope(() => {
      for (let index = 0; index < expression.params.length; index++) {
        const param = expression.params[index]
        let expected: ValueType = 'unknown'

        if (params[index] != null) {
          expected = params[index].valueType
        }

        let actual = param.valueType

        if (param.valueType === 'unknown') {
          actual = expected
        }

        if (param.valueType !== 'unknown') {
          this.checkAssignableType(expected, param.valueType, param.loc, false, false)
        }

        param.declaredType = param.valueType

        if (param.valueType === 'unknown') {
          param.declaredType = actual
        }

        param.valueType = actual
        param.nullable = false

        this.declare(
          param.name,
          {
            kind: 'param',
            mutable: true,
            valueType: actual,
            loc: param.loc
          },
          param.loc
        )
      }

      if (expression.expressionBody) {
        actualReturnType = this.checkExpression(expression.body)
        returnLoc = expression.body.loc ?? expression.loc
        returnNullable = this.expressionCanBeNull(expression.body)
        returnPromiseValueType = this.resolveExpressionPromiseValueType(expression.body)
      } else {
        const returnExpression = this.resolveSingleReturnExpression(expression.body)

        if (returnExpression == null) {
          const terminalReturnExpression = this.resolveTerminalReturnExpression(expression.body)

          this.withReturnContext(returnType ?? 'unknown', false, null, () => {
            this.checkStatements(expression.body)
          })

          if (terminalReturnExpression != null) {
            actualReturnType = this.checkExpression(terminalReturnExpression)
            returnLoc = terminalReturnExpression.loc ?? expression.loc
            returnNullable = this.expressionCanBeNull(terminalReturnExpression)
            returnPromiseValueType = this.resolveExpressionPromiseValueType(terminalReturnExpression)
          }
        } else {
          actualReturnType = this.checkExpression(returnExpression)
          returnLoc = returnExpression.loc ?? expression.loc
          returnNullable = this.expressionCanBeNull(returnExpression)
          returnPromiseValueType = this.resolveExpressionPromiseValueType(returnExpression)
        }
      }
    })

    if (returnType != null) {
      this.checkAssignableType(actualReturnType, returnType, returnLoc, false, returnNullable)
    }

    expression.returnType = returnType ?? actualReturnType
    expression.declaredReturnType = expression.returnType
    expression.returnNullable = returnNullable
    expression.returnPromiseValueType = returnPromiseValueType

    return actualReturnType
  }

  checkTimerHandleMethodCall(expression: AnyNode): ValueType | null {
    if (expression.callee.type !== 'MemberExpression' || !isTimerHandleMethod(expression.callee.property)) {
      return null
    }

    const objectType = this.checkExpression(expression.callee.object)

    if (objectType !== 'timer') {
      return null
    }

    for (let index = 0; index < expression.args.length; index = index + 1) {
      const arg = checkerNodeAt(expression.args, index)

      this.checkExpression(arg)
    }

    this.report(
      'CCJS_TIMER_REF_UNREF',
      'timer handle ref() and unref() are not supported in the MVP; timer handles are referenced by default',
      expression.loc
    )
    expression.valueType = 'void'

    return 'void'
  }

  checkCollectionMethodCall(expression: AnyNode): ValueType | null {
    if (expression.callee.type !== 'MemberExpression') {
      return null
    }

    const property = expression.callee.property
    const objectType = this.checkExpression(expression.callee.object)

    const mapMethod = stringOrEmpty(mapRuntimeMethodName(property))

    if (stringEquals(objectType, 'map') && !stringEquals(mapMethod, '')) {
      const mapType = this.resolveExpressionMapType(expression.callee.object) ?? {
        key: 'unknown',
        value: 'unknown'
      }
      const mapValueType = resolvedConcreteValueTypeMetadata(mapType.value, 'unknown')

      if (mapMethod === 'clear') {
        this.checkCollectionArgCount(expression, 'map.clear', 0)
        expression.valueType = 'void'
        return 'void'
      }

      if (mapMethod === 'get' || mapMethod === 'has' || mapMethod === 'delete') {
        this.checkCollectionArgCount(expression, `map.${mapMethod}`, 1)

        if (expression.args[0] != null) {
          this.checkAssignableType(
            this.checkExpression(expression.args[0]),
            mapType.key,
            expression.args[0].loc,
            false,
            this.expressionCanBeNull(expression.args[0])
          )
        }

        for (let index = 1; index < expression.args.length; index = index + 1) {
          const arg = checkerNodeAt(expression.args, index)

          this.checkExpression(arg)
        }

        if (mapMethod === 'get') {
          expression.valueType = mapValueType
          expression.nullable = true
          return mapValueType
        }

        expression.valueType = 'boolean'
        return 'boolean'
      }

      this.checkCollectionArgCount(expression, 'map.set', 2)

      if (expression.args[0] != null) {
        this.checkAssignableType(
          this.checkExpression(expression.args[0]),
          mapType.key,
          expression.args[0].loc,
          false,
          this.expressionCanBeNull(expression.args[0])
        )
      }

      if (expression.args[1] != null) {
        this.checkAssignableType(
          this.checkExpression(expression.args[1]),
          mapType.value,
          expression.args[1].loc,
          false,
          this.expressionCanBeNull(expression.args[1])
        )
      }

      for (let index = 2; index < expression.args.length; index = index + 1) {
        const arg = checkerNodeAt(expression.args, index)

        this.checkExpression(arg)
      }

      expression.valueType = 'map'
      expression.mapKeyType = mapType.key
      expression.mapValueType = mapType.value

      return 'map'
    }

    const setMethod = stringOrEmpty(setRuntimeMethodName(property))

    if (stringEquals(objectType, 'set') && !stringEquals(setMethod, '')) {
      const elementType = this.resolveExpressionSetElementType(expression.callee.object) ?? 'unknown'

      if (setMethod === 'clear') {
        this.checkCollectionArgCount(expression, 'set.clear', 0)
        expression.valueType = 'void'
        return 'void'
      }

      this.checkCollectionArgCount(expression, `set.${setMethod}`, 1)

      if (expression.args[0] != null) {
        this.checkAssignableType(
          this.checkExpression(expression.args[0]),
          elementType,
          expression.args[0].loc,
          false,
          this.expressionCanBeNull(expression.args[0])
        )
      }

      for (let index = 1; index < expression.args.length; index = index + 1) {
        const arg = checkerNodeAt(expression.args, index)

        this.checkExpression(arg)
      }

      if (setMethod === 'add') {
        expression.valueType = 'set'
        expression.setElementType = elementType
        return 'set'
      }

      expression.valueType = 'boolean'
      return 'boolean'
    }

    return null
  }

  checkTimerCall(expression: AnyNode): ValueType | null {
    const method = this.resolveTimerRuntimeMethod(expression.callee)

    if (method == null) {
      return null
    }

    let shadow: SymbolInfo | null = null

    if (timerRuntimeMethodName(expression.callee) === method) {
      shadow = this.scope.resolve(method)
    }

    if (
      shadow != null &&
      !(
        shadow.kind === 'import' &&
        shadow.importSource != null &&
        isNodeTimerImportSource(shadow.importSource) &&
        shadow.importedName === method
      )
    ) {
      return null
    }

    expression.timerRuntimeMethod = method

    if (timerClearMethodName(method) != null) {
      if (expression.args.length !== 1) {
        this.report(
          'CCJS_ARG_COUNT',
          `function ${method} expects 1 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      if (expression.args[0] != null) {
        this.checkAssignableType(this.checkExpression(expression.args[0]), 'timer', expression.args[0].loc, false, false)
      }

      expression.valueType = 'void'

      return 'void'
    }

    if (method === 'setImmediate') {
      if (expression.args.length !== 1) {
        this.report(
          'CCJS_ARG_COUNT',
          `function setImmediate expects 1 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      this.checkTimerCallbackArg(expression, 0)
      expression.valueType = 'timer'

      return 'timer'
    }

    if (expression.args.length !== 2) {
      this.report(
        'CCJS_ARG_COUNT',
        `function ${method} expects 2 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    this.checkTimerCallbackArg(expression, 0)

    if (expression.args[1] != null) {
      this.checkAssignableType(this.checkExpression(expression.args[1]), 'number', expression.args[1].loc, false, false)
    }

    expression.valueType = 'timer'

    return 'timer'
  }

  resolveTimerRuntimeMethod(callee: AnyNode): string | null {
    const globalMethod = stringOrEmpty(timerRuntimeMethodName(callee))

    if (!stringEquals(globalMethod, '')) {
      return globalMethod
    }

    const path = memberExpressionPath(callee)

    if (path == null) {
      return null
    }

    if (path.length === 1) {
      const rootName = firstPathSegment(path)
      const symbol = this.scope.resolve(rootName)
      let importedName: string | null = null

      if (symbol != null && symbol.importedName != null) {
        importedName = symbol.importedName
      }

      if (symbol != null && symbol.kind === 'import' && symbol.importSource != null) {
        if (isNodeTimerImportSource(symbol.importSource) && importedName != null && isTimerRuntimeMethod(importedName)) {
          return importedName
        }
      }
    }

    if (path.length === 2) {
      const rootName = firstPathSegment(path)
      const methodName = stringAt(path, 1)
      const symbol = this.scope.resolve(rootName)

      if (
        symbol != null &&
        symbol.kind === 'import' &&
        symbol.importSource != null &&
        isNodeTimerImportSource(symbol.importSource) &&
        (symbol.importedName === 'default' || symbol.importedName === 'timers') &&
        isTimerRuntimeMethod(methodName)
      ) {
        return methodName
      }
    }

    return null
  }

  checkTimerCallbackArg(expression: AnyNode, index: number): void {
    const arg = expression.args[index]
    const functionType = timerCallbackFunctionType()

    if (arg == null) {
      return
    }

    if (arg.type === 'ArrowFunctionExpression') {
      if (arg.async === true) {
        this.report(
          'CCJS_ASYNC_TIMER_CALLBACK',
          'async timer callbacks are not supported in the MVP; use a synchronous timer callback and handle Promise work explicitly',
          arg.loc
        )
        return
      }

      this.checkArrowFunctionExpression(arg, functionType)
      return
    }

    this.checkAssignableType(this.checkExpression(arg), 'function', arg.loc, false, false)

    const symbol = this.getCallableSymbol(arg)

    const params = symbol?.params ?? null

    if (params != null && params.length !== functionType.params.length) {
      this.report(
        'CCJS_ARG_COUNT',
        `function callback expects ${functionType.params.length} argument(s), got ${params.length}`,
        arg.loc
      )
    }

    if (symbol != null && (symbol.async === true || symbol.returnType === 'promise')) {
      this.report(
        'CCJS_ASYNC_TIMER_CALLBACK',
        'async timer callbacks are not supported in the MVP; use a synchronous timer callback and handle Promise work explicitly',
        arg.loc
      )
      return
    }

    if (symbol != null && symbol.returnType != null) {
      this.checkAssignableType(
        symbol.returnType,
        functionType.returnType,
        arg.loc,
        functionType.returnNullable === true,
        symbol.returnNullable === true
      )
    }
  }

  checkCollectionArgCount(expression: AnyNode, name: string, expected: number): void {
    if (expression.args.length !== expected) {
      this.report(
        'CCJS_ARG_COUNT',
        `${name} expects ${expected} argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }
  }

  checkArrayMethodCall(expression: AnyNode): ValueType | null {
    if (expression.callee.type !== 'MemberExpression' || !isArrayMethod(expression.callee.property)) {
      return null
    }

    const objectType = this.checkExpression(expression.callee.object)

    if (objectType !== 'array') {
      return null
    }

    let elementType = this.resolveExpressionArrayElementType(expression.callee.object)

    if (elementType == null) {
      elementType = 'unknown'
    }

    let elementDeclaredType = this.resolveExpressionArrayElementDeclaredType(expression.callee.object)

    if (elementDeclaredType == null) {
      elementDeclaredType = elementType
    }

    expression.arrayElementType = elementType
    expression.arrayElementDeclaredType = elementDeclaredType

    if (expression.callee.property === 'push') {
      expression.valueType = 'number'

      if (expression.args.length !== 1) {
        this.report('CCJS_ARG_COUNT', `array.push expects 1 argument(s), got ${expression.args.length}`, expression.loc)
      }

      if (expression.args[0] != null) {
        const pushedType = this.checkExpression(expression.args[0])

        if (elementType !== 'unknown') {
          this.checkAssignableType(
            pushedType,
            elementType,
            expression.args[0].loc,
            false,
            this.expressionCanBeNull(expression.args[0])
          )
        }
      }

      for (let index = 1; index < expression.args.length; index++) {
        this.checkExpression(expression.args[index])
      }

      return 'number'
    }

    if (expression.callee.property === 'pop') {
      expression.valueType = elementType
      expression.nullable = true

      if (expression.args.length !== 0) {
        this.report('CCJS_ARG_COUNT', `array.pop expects 0 argument(s), got ${expression.args.length}`, expression.loc)
      }

      for (let index = 0; index < expression.args.length; index = index + 1) {
        const arg = checkerNodeAt(expression.args, index)

        this.checkExpression(arg)
      }

      return elementType
    }

    expression.valueType = 'array'

    if (expression.callee.property === 'sort') {
      if (expression.args.length > 1) {
        this.report(
          'CCJS_ARG_COUNT',
          `array.sort expects 0 or 1 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      if (expression.args[0] != null) {
        this.checkArrayCallback(
          expression.args[0],
          [
            { name: 'left', valueType: elementType },
            { name: 'right', valueType: elementType }
          ],
          'number'
        )
      }

      for (let index = 1; index < expression.args.length; index++) {
        this.checkExpression(expression.args[index])
      }

      return 'array'
    }

    if (expression.args.length !== 1) {
      this.report(
        'CCJS_ARG_COUNT',
        `array.${expression.callee.property} expects 1 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    if (expression.callee.property === 'filter') {
      if (expression.args[0] != null) {
        if (!this.isBooleanReference(expression.args[0])) {
          this.checkArrayCallback(
            expression.args[0],
            [
              { name: 'value', valueType: elementType },
              { name: 'index', valueType: 'number' }
            ],
            'boolean'
          )
        }
      }

      for (let index = 1; index < expression.args.length; index++) {
        this.checkExpression(expression.args[index])
      }

      return 'array'
    }

    if (expression.callee.property === 'find') {
      expression.valueType = elementType
      expression.nullable = true

      const foundInfo = this.resolveDeclaredType(elementDeclaredType, expression.loc)
      expression.shape = null
      expression.arrayElementType = null
      expression.arrayElementDeclaredType = null
      expression.mapKeyType = null
      expression.mapValueType = null
      expression.promiseValueType = null
      expression.setElementType = null
      expression.functionType = null

      if (foundInfo.shape != null) {
        expression.shape = foundInfo.shape
      }

      if (foundInfo.arrayElementType != null) {
        expression.arrayElementType = foundInfo.arrayElementType
      }

      if (foundInfo.arrayElementDeclaredType != null) {
        expression.arrayElementDeclaredType = foundInfo.arrayElementDeclaredType
      }

      if (foundInfo.mapKeyType != null) {
        expression.mapKeyType = foundInfo.mapKeyType
      }

      if (foundInfo.mapValueType != null) {
        expression.mapValueType = foundInfo.mapValueType
      }

      if (foundInfo.promiseValueType != null) {
        expression.promiseValueType = foundInfo.promiseValueType
      }

      if (foundInfo.setElementType != null) {
        expression.setElementType = foundInfo.setElementType
      }

      if (foundInfo.functionType != null) {
        expression.functionType = foundInfo.functionType
      }

      if (expression.args[0] != null) {
        if (!this.isBooleanReference(expression.args[0])) {
          this.checkArrayCallback(
            expression.args[0],
            [
              { name: 'value', valueType: elementType },
              { name: 'index', valueType: 'number' }
            ],
            'boolean'
          )
        }
      }

      for (let index = 1; index < expression.args.length; index++) {
        this.checkExpression(expression.args[index])
      }

      return elementType
    }

    let mappedType: ValueType = 'unknown'

    if (expression.args[0] != null) {
      mappedType = this.checkArrayCallback(
        expression.args[0],
        [
          { name: 'value', valueType: elementType },
          { name: 'index', valueType: 'number' }
        ],
        null
      )
    }

    expression.arrayElementType = mappedType
    expression.arrayElementDeclaredType = mappedType

    for (let index = 1; index < expression.args.length; index++) {
      this.checkExpression(expression.args[index])
    }

    return 'array'
  }

  isBooleanReference(expression: AnyNode): boolean {
    return (
      expression.type === 'Reference' &&
      expression.path.length === 1 &&
      stringEquals(firstPathSegment(expression.path), 'Boolean')
    )
  }

  checkArrayCallback(
    expression: AnyNode,
    params: Array<{ name: string; valueType: ValueType }>,
    returnType: ValueType | null
  ): ValueType {
    if (expression.type !== 'ArrowFunctionExpression') {
      const callbackType = this.checkExpression(expression)

      this.checkAssignableType(callbackType, 'function', expression.loc, false, false)

      return 'unknown'
    }

    if (expression.async === true) {
      this.report(
        'CCJS_ASYNC_CALLBACK',
        'async Array callbacks are not supported in the current compiler slice; use a synchronous callback',
        expression.loc
      )
      return 'unknown'
    }

    if (expression.params.length > params.length) {
      this.report(
        'CCJS_ARG_COUNT',
        `array callback expects at most ${params.length} parameter(s), got ${expression.params.length}`,
        expression.loc
      )
    }

    let actualReturnType: ValueType = 'unknown'
    let returnLoc = expression.loc
    let returnNullable = false

    this.withScope(() => {
      for (let index = 0; index < expression.params.length; index++) {
        const param = expression.params[index]
        let expected: ValueType = 'unknown'

        if (index < params.length) {
          expected = params[index].valueType
        }

        let actual = param.valueType

        if (actual === 'unknown') {
          actual = expected
        }

        if (param.valueType !== 'unknown') {
          this.checkAssignableType(expected, param.valueType, param.loc, false, false)
        }

        param.declaredType = param.valueType

        if (param.valueType === 'unknown') {
          param.declaredType = actual
        }

        param.valueType = actual
        param.nullable = false

        this.declare(
          param.name,
          {
            kind: 'param',
            mutable: true,
            valueType: actual,
            loc: param.loc
          },
          param.loc
        )
      }

      if (expression.expressionBody) {
        actualReturnType = this.checkExpression(expression.body)
        returnLoc = expression.loc

        if (expression.body.loc != null) {
          returnLoc = expression.body.loc
        }

        returnNullable = this.expressionCanBeNull(expression.body)
      } else {
        const returnExpression = this.resolveSingleReturnExpression(expression.body)

        if (returnExpression == null) {
          const terminalReturnExpression = this.resolveTerminalReturnExpression(expression.body)
          let expectedReturnType: ValueType = 'unknown'

          if (returnType != null) {
            expectedReturnType = returnType
          }

          this.withReturnContext(expectedReturnType, false, null, () => {
            this.checkStatements(expression.body)
          })

          if (terminalReturnExpression != null) {
            actualReturnType = this.checkExpression(terminalReturnExpression)
            returnLoc = expression.loc

            if (terminalReturnExpression.loc != null) {
              returnLoc = terminalReturnExpression.loc
            }

            returnNullable = this.expressionCanBeNull(terminalReturnExpression)
          }
        } else {
          actualReturnType = this.checkExpression(returnExpression)
          returnLoc = expression.loc

          if (returnExpression.loc != null) {
            returnLoc = returnExpression.loc
          }

          returnNullable = this.expressionCanBeNull(returnExpression)
        }
      }
    })

    if (returnType != null) {
      this.checkAssignableType(actualReturnType, returnType, returnLoc, false, returnNullable)
    }

    expression.returnType = actualReturnType

    if (returnType != null) {
      expression.returnType = returnType
    }

    expression.declaredReturnType = expression.returnType
    expression.returnNullable = returnNullable

    return actualReturnType
  }

  resolveSingleReturnExpression(statements: AnyNode[]): AnyNode | null {
    if (statements.length !== 1) {
      return null
    }

    const statement = statements[0]

    if (statement.type !== 'ReturnStatement') {
      return null
    }

    if (statement.argument != null) {
      return statement.argument
    }

    return null
  }

  resolveTerminalReturnExpression(statements: AnyNode[]): AnyNode | null {
    if (statements.length === 0) {
      return null
    }

    const statement = statements[statements.length - 1]

    if (statement.type !== 'ReturnStatement') {
      return null
    }

    if (statement.argument != null) {
      return statement.argument
    }

    return null
  }

  checkStringConversionCall(expression: AnyNode): ValueType | null {
    if (
      expression.callee.type !== 'Reference' ||
      expression.callee.path.length !== 1 ||
      firstPathSegment(expression.callee.path) !== 'String'
    ) {
      return null
    }

    const argTypes: ValueType[] = []

    for (let index = 0; index < expression.args.length; index = index + 1) {
      const arg = checkerNodeAt(expression.args, index)

      argTypes.push(this.checkExpression(arg))
    }

    if (expression.args.length !== 1) {
      this.report('CCJS_ARG_COUNT', `String expects 1 argument(s), got ${expression.args.length}`, expression.loc)
      return 'string'
    }

    if (argTypes[0] !== 'boolean' && argTypes[0] !== 'null' && argTypes[0] !== 'number' && argTypes[0] !== 'string') {
      this.report('CCJS_TYPE_MISMATCH', `cannot convert ${argTypes[0]} to string with String`, expression.args[0].loc)
    }

    return 'string'
  }

  checkNumberConversionCall(expression: AnyNode): ValueType | null {
    if (
      expression.callee.type !== 'Reference' ||
      expression.callee.path.length !== 1 ||
      firstPathSegment(expression.callee.path) !== 'Number'
    ) {
      return null
    }

    const argTypes: ValueType[] = []

    for (let index = 0; index < expression.args.length; index = index + 1) {
      const arg = checkerNodeAt(expression.args, index)

      argTypes.push(this.checkExpression(arg))
    }

    expression.valueType = 'number'
    expression.nullable = true

    if (expression.args.length !== 1) {
      this.report('CCJS_ARG_COUNT', `Number expects 1 argument(s), got ${expression.args.length}`, expression.loc)
      return 'number'
    }

    this.checkAssignableType(
      argTypes[0],
      'string',
      expression.args[0].loc,
      false,
      this.expressionCanBeNull(expression.args[0])
    )

    return 'number'
  }

  checkNumericCastCall(expression: AnyNode): ValueType | null {
    if (expression.callee.type !== 'Reference' || expression.callee.path.length !== 1) {
      return null
    }

    const castName = firstPathSegment(expression.callee.path)

    if (!numericCastNames.has(castName)) {
      return null
    }

    const argTypes: ValueType[] = []

    for (let index = 0; index < expression.args.length; index = index + 1) {
      const arg = checkerNodeAt(expression.args, index)

      argTypes.push(this.checkExpression(arg))
    }

    expression.valueType = 'number'
    expression.numericCast = castName

    if (expression.args.length !== 1) {
      this.report(
        'CCJS_ARG_COUNT',
        `${castName} expects 1 argument(s), got ${expression.args.length}`,
        expression.loc
      )
      return 'number'
    }

    this.checkAssignableType(
      argTypes[0],
      'number',
      expression.args[0].loc,
      false,
      this.expressionCanBeNull(expression.args[0])
    )

    return 'number'
  }

  checkStringCharCodeAtCall(expression: CheckerNode): ValueType | null {
    if (expression.callee.type !== 'MemberExpression' || expression.callee.property !== 'charCodeAt') {
      return null
    }

    const objectType = this.checkExpression(expression.callee.object)
    const argTypes: ValueType[] = []

    for (let index = 0; index < expression.args.length; index = index + 1) {
      const arg = checkerNodeAt(expression.args, index)

      argTypes.push(this.checkExpression(arg))
    }

    if (objectType !== 'string') {
      return null
    }

    expression.valueType = 'number'
    expression.stringRuntimeMethod = 'charCodeAt'

    if (expression.args.length !== 1) {
      this.report('CCJS_ARG_COUNT', `string.charCodeAt expects 1 argument(s), got ${expression.args.length}`, expression.loc)
      return 'number'
    }

    this.checkAssignableType(
      argTypes[0],
      'number',
      expression.args[0].loc,
      false,
      this.expressionCanBeNull(expression.args[0])
    )

    return 'number'
  }

  checkStringTrimCall(expression: AnyNode): ValueType | null {
    let method: string | null = null

    if (expression.callee.type === 'MemberExpression') {
      method = stringRuntimeMethodName(expression.callee.property)
    }

    if (!isStringTrimMethod(method)) {
      return null
    }

    const objectType = this.checkExpression(expression.callee.object)

    for (let index = 0; index < expression.args.length; index = index + 1) {
      const arg = checkerNodeAt(expression.args, index)

      this.checkExpression(arg)
    }

    if (objectType !== 'string') {
      return null
    }

    if (expression.args.length !== 0) {
      this.report('CCJS_ARG_COUNT', `string.${method} expects 0 argument(s), got ${expression.args.length}`, expression.loc)
    }

    expression.valueType = 'string'
    expression.stringRuntimeMethod = method

    return 'string'
  }

  checkStringIndexCall(expression: AnyNode): ValueType | null {
    let method: string | null = null

    if (expression.callee.type === 'MemberExpression') {
      method = stringRuntimeMethodName(expression.callee.property)
    }

    if (method == null || !isStringIndexMethod(method)) {
      return null
    }

    const objectType = this.checkExpression(expression.callee.object)
    const argTypes: ValueType[] = []

    for (let index = 0; index < expression.args.length; index = index + 1) {
      const arg = checkerNodeAt(expression.args, index)

      argTypes.push(this.checkExpression(arg))
    }

    if (objectType !== 'string') {
      return null
    }

    if (expression.args.length < 1 || expression.args.length > 2) {
      this.report(
        'CCJS_ARG_COUNT',
        `string.${method} expects 1 or 2 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    if (expression.args[0] != null) {
      this.checkAssignableType(
        argTypes[0],
        'string',
        expression.args[0].loc,
        false,
        this.expressionCanBeNull(expression.args[0])
      )
    }

    if (expression.args.length > 1) {
      this.checkAssignableType(argTypes[1], 'number', expression.args[1].loc, false, false)
    }

    expression.valueType = 'number'
    expression.stringRuntimeMethod = method

    return 'number'
  }

  checkStringSliceCall(expression: AnyNode): ValueType | null {
    let method: string | null = null

    if (expression.callee.type === 'MemberExpression') {
      method = stringRuntimeMethodName(expression.callee.property)
    }

    if (method !== 'slice') {
      return null
    }

    const objectType = this.checkExpression(expression.callee.object)
    const argTypes: ValueType[] = []

    for (let index = 0; index < expression.args.length; index = index + 1) {
      const arg = checkerNodeAt(expression.args, index)

      argTypes.push(this.checkExpression(arg))
    }

    if (objectType !== 'string') {
      return null
    }

    if (expression.args.length < 1 || expression.args.length > 2) {
      this.report(
        'CCJS_ARG_COUNT',
        `string.slice expects 1 or 2 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    for (let index = 0; index < argTypes.length; index++) {
      const argType = argTypes[index]

      this.checkAssignableType(argType, 'number', expression.args[index].loc, false, false)
    }

    expression.valueType = 'string'
    expression.stringRuntimeMethod = method

    return 'string'
  }

  checkStringSplitCall(expression: AnyNode): ValueType | null {
    let method: string | null = null

    if (expression.callee.type === 'MemberExpression') {
      method = stringRuntimeMethodName(expression.callee.property)
    }

    if (method !== 'split') {
      return null
    }

    const objectType = this.checkExpression(expression.callee.object)
    const argTypes: ValueType[] = []

    for (let index = 0; index < expression.args.length; index = index + 1) {
      const arg = checkerNodeAt(expression.args, index)

      argTypes.push(this.checkExpression(arg))
    }

    if (objectType !== 'string') {
      return null
    }

    if (expression.args.length !== 1) {
      this.report('CCJS_ARG_COUNT', `string.split expects 1 argument(s), got ${expression.args.length}`, expression.loc)
    }

    if (expression.args[0] != null) {
      this.checkAssignableType(
        argTypes[0],
        'string',
        expression.args[0].loc,
        false,
        this.expressionCanBeNull(expression.args[0])
      )
    }

    expression.valueType = 'array'
    expression.arrayElementType = 'string'
    expression.arrayElementDeclaredType = 'string'
    expression.stringRuntimeMethod = method

    return 'array'
  }

  checkStringPredicateCall(expression: AnyNode): ValueType | null {
    if (expression.callee.type !== 'MemberExpression' || !isStringPredicateMethod(expression.callee.property)) {
      return null
    }

    const method = expression.callee.property
    let maxArgs = 1

    if (method === 'includes') {
      maxArgs = 2
    }

    const objectType = this.checkExpression(expression.callee.object)
    const argTypes: ValueType[] = []

    for (let index = 0; index < expression.args.length; index = index + 1) {
      const arg = checkerNodeAt(expression.args, index)

      argTypes.push(this.checkExpression(arg))
    }

    if (objectType !== 'string') {
      return null
    }

    if (expression.args.length < 1 || expression.args.length > maxArgs) {
      this.report(
        'CCJS_ARG_COUNT',
        stringPredicateArgCountMessage(method, expression.args.length),
        expression.loc
      )
    }

    if (expression.args[0] != null) {
      this.checkAssignableType(
        argTypes[0],
        'string',
        expression.args[0].loc,
        false,
        this.expressionCanBeNull(expression.args[0])
      )
    }

    if (expression.args.length > 1) {
      this.checkAssignableType(argTypes[1], 'number', expression.args[1].loc, false, false)
    }

    expression.valueType = 'boolean'
    expression.stringRuntimeMethod = method

    return 'boolean'
  }

  checkNewExpression(expression: AnyNode): ValueType {
    const promiseType = this.checkPromiseConstructorExpression(expression)

    if (promiseType != null) {
      return promiseType
    }

    const argTypes: ValueType[] = []

    for (let index = 0; index < expression.args.length; index = index + 1) {
      const arg = checkerNodeAt(expression.args, index)

      argTypes.push(this.checkExpression(arg))
    }

    const eventStreamConstructorType = this.checkEventStreamUnsupportedConstructor(expression)

    if (eventStreamConstructorType != null) {
      return eventStreamConstructorType
    }

    const urlType = this.checkUrlConstructorExpression(expression, argTypes)

    if (urlType != null) {
      return urlType
    }

    if (expression.callee.type !== 'Reference' || expression.callee.path.length !== 1) {
      this.checkExpression(expression.callee)
      return 'object'
    }

    const collectionConstructor = collectionConstructorNameFromPath(expression.callee.path)
    const constructorName = firstPathSegment(expression.callee.path)

    if (collectionConstructor === 'Map') {
      expression.valueType = 'map'
      expression.mapKeyType = 'unknown'
      expression.mapValueType = 'unknown'

      if (argTypes[0] === 'map') {
        const mapType = this.resolveExpressionMapType(expression.args[0])

        if (mapType != null) {
          if (mapType.key != null) {
            expression.mapKeyType = mapType.key
          }

          if (mapType.value != null) {
            expression.mapValueType = mapType.value
          }
        }
      }

      return 'map'
    }

    if (collectionConstructor === 'Set') {
      expression.valueType = 'set'
      expression.setElementType = 'unknown'

      if (argTypes[0] === 'set') {
        const elementType = this.resolveExpressionSetElementType(expression.args[0])

        if (elementType != null) {
          expression.setElementType = elementType
        }
      }

      return 'set'
    }

    if (constructorName === 'AbortController' && this.scope.resolve('AbortController') == null) {
      this.requireLibuvBackend('AbortController', expression.loc)

      if (expression.args.length !== 0) {
        this.report(
          'CCJS_ARG_COUNT',
          `AbortController constructor expects 0 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      expression.fetchRuntimeMethod = 'abortControllerNew'
      expression.valueType = 'object'
      expression.shape = fetchAbortControllerObjectShape
      return 'object'
    }

    if (binaryConstructorNameFromPath(expression.callee.path) === 'Uint8Array') {
      if (expression.args.length !== 1) {
        this.report(
          'CCJS_ARG_COUNT',
          `Uint8Array constructor expects 1 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      if (expression.args[0] != null && argTypes[0] !== 'number' && argTypes[0] !== 'array') {
        this.report(
          'CCJS_TYPE_MISMATCH',
          `Uint8Array constructor expects number or number[], got ${argTypes[0]}`,
          expression.args[0].loc
        )
      }

      if (argTypes[0] === 'array') {
        const elementType = this.resolveExpressionArrayElementType(expression.args[0])

        if (elementType != null) {
          this.checkAssignableType(elementType, 'number', expression.args[0].loc, false, false)
        }
      }

      expression.valueType = 'bytes'
      return 'bytes'
    }

    if (constructorName === 'Error') {
      this.checkErrorConstructorExpression(expression, argTypes)
      expression.valueType = 'object'
      expression.shape = errorObjectShape
      return 'object'
    }

    let symbol = this.scope.resolve(constructorName)

    if (symbol == null) {
      const globalSymbol = globals.get(constructorName)

      if (globalSymbol != null) {
        symbol = globalSymbol
      }
    }

    if (symbol == null || (symbol.kind !== 'class' && symbol.constructable !== true)) {
      this.report('CCJS_UNKNOWN_NAME', `unknown class ${constructorName}`, expression.callee.loc)
      return 'object'
    }

    if (symbol.constructable) {
      return 'object'
    }

    let constructorParams: AnyNode[] = []
    const symbolConstructorParams = symbol?.constructorParams ?? null

    if (symbolConstructorParams != null) {
      constructorParams = symbolConstructorParams
    }

    if (constructorParams.length !== expression.args.length) {
      this.report(
        'CCJS_ARG_COUNT',
        `class ${constructorName} constructor expects ${constructorParams.length} argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    for (let index = 0; index < constructorParams.length; index++) {
      const param = constructorParams[index]

      if (index < argTypes.length) {
        this.checkAssignableType(
          argTypes[index],
          param.valueType,
          expression.args[index].loc,
          param.nullable === true,
          this.expressionCanBeNull(expression.args[index])
        )
      }
    }

    expression.className = constructorName
    expression.shape = null

    if (symbol.shape != null) {
      expression.shape = symbol.shape
    }

    return 'object'
  }

  checkUrlConstructorExpression(expression: AnyNode, argTypes: ValueType[]): ValueType | null {
    if (expression.callee.type !== 'Reference' || expression.callee.path.length !== 1) {
      return null
    }

    const symbol = this.scope.resolve(firstPathSegment(expression.callee.path))
    let importedName: string | null = null

    if (symbol != null && symbol.importedName != null) {
      importedName = symbol.importedName
    }

    if (
      symbol == null ||
      symbol.kind !== 'import' ||
      symbol.importSource == null ||
      !isNodeUrlImportSource(symbol.importSource) ||
      importedName == null
    ) {
      return null
    }

    if (isUnsupportedUrlRuntimeMethod(importedName)) {
      this.report(
        'CCJS_NOT_IMPLEMENTED',
        `node:url ${importedName} is not implemented by the current C backend`,
        expression.loc
      )
      expression.valueType = 'unknown'
      return 'unknown'
    }

    if (!isUrlRuntimeConstructor(importedName)) {
      return null
    }

    if (importedName === 'URLSearchParams') {
      if (expression.args.length > 1) {
        this.report(
          'CCJS_ARG_COUNT',
          `URLSearchParams constructor expects 0 or 1 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      if (expression.args[0] != null) {
        const argType = argTypes[0]

        if (argType !== 'string' && argType !== 'object') {
          this.report(
            'CCJS_TYPE_MISMATCH',
            `URLSearchParams constructor expects string or object, got ${argType}`,
            expression.args[0].loc
          )
        }

        if (expression.args[0].type === 'ObjectLiteral') {
          for (const property of expression.args[0].properties) {
            let propertyValueType = property.value.valueType

            if (propertyValueType == null) {
              propertyValueType = this.checkExpression(property.value)
            }

            this.checkAssignableType(
              propertyValueType,
              'string',
              property.value.loc,
              false,
              this.expressionCanBeNull(property.value)
            )
          }
        } else {
          const shape = this.resolveExpressionShape(expression.args[0])

          if (shape != null) {
            for (const field of shape.fields) {
              const fieldType = this.resolveFieldDeclaredType(field)

              this.checkAssignableType(fieldType.valueType, 'string', expression.args[0].loc, fieldType.nullable, false)
            }
          }
        }
      }

      expression.urlRuntimeMethod = 'URLSearchParams'
      expression.valueType = 'object'
      expression.shape = urlSearchParamsObjectShape

      return 'object'
    }

    if (expression.args.length < 1 || expression.args.length > 2) {
      this.report(
        'CCJS_ARG_COUNT',
        `URL constructor expects 1 or 2 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    for (let index = 0; index < argTypes.length; index++) {
      const argType = argTypes[index]

      if (index === 1 && argType === 'object') {
        const shape = this.resolveExpressionShape(expression.args[index])

        if (shape != null && shape.builtin === 'url.URL') {
          continue
        }
      }

      this.checkAssignableType(
        argType,
        'string',
        expression.args[index].loc,
        false,
        this.expressionCanBeNull(expression.args[index])
      )
    }

    expression.urlRuntimeMethod = 'URL'
    expression.valueType = 'object'
    expression.shape = urlObjectShape

    return 'object'
  }

  checkPromiseConstructorExpression(expression: AnyNode): ValueType | null {
    if (
      expression.callee.type !== 'Reference' ||
      expression.callee.path.length !== 1 ||
      firstPathSegment(expression.callee.path) !== 'Promise' ||
      this.scope.resolve('Promise') != null
    ) {
      return null
    }

    if (expression.args.length !== 1) {
      this.report(
        'CCJS_ARG_COUNT',
        `Promise constructor expects 1 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    const executor = expression.args[0]
    let promiseValueType: ValueType = 'unknown'

    if (executor == null) {
      expression.valueType = 'promise'
      expression.promiseValueType = promiseValueType
      return 'promise'
    }

    if (executor.type !== 'ArrowFunctionExpression') {
      this.checkAssignableType(this.checkExpression(executor), 'function', executor.loc, false, false)
      expression.valueType = 'promise'
      expression.promiseValueType = promiseValueType
      return 'promise'
    }

    this.checkArrowFunctionExpression(executor, promiseExecutorFunctionType())

    let resolveName: string | null = null

    if (executor.params.length > 0) {
      resolveName = checkerNodeAt(executor.params, 0).name
    }

    if (resolveName != null) {
      promiseValueType = this.resolvePromiseExecutorValueType(executor, resolveName)
    }

    expression.valueType = 'promise'
    expression.promiseValueType = promiseValueType

    return 'promise'
  }

  resolvePromiseExecutorValueType(executor: AnyNode, resolveName: string): ValueType {
    const types: ValueType[] = []

    if (executor.expressionBody === true) {
      this.collectPromiseExecutorValueTypesFromNode(executor.body, resolveName, types)
    } else {
      this.collectPromiseExecutorValueTypesFromList(executor.body, resolveName, types)
    }

    return commonValueType(types)
  }

  collectPromiseExecutorValueTypesFromList(nodes: AnyNode[], resolveName: string, types: ValueType[]): void {
    for (const node of nodes) {
      this.collectPromiseExecutorValueTypesFromNode(node, resolveName, types)
    }
  }

  collectPromiseExecutorValueTypesFromNode(node: AnyNode | null | undefined, resolveName: string, types: ValueType[]): void {
    if (node == null) {
      return
    }

    if (
      node.type === 'CallExpression' &&
      node.callee != null &&
      node.callee.type === 'Reference' &&
      node.callee.path.length === 1 &&
      stringEquals(firstPathSegment(node.callee.path), resolveName)
    ) {
      let resolvedType: ValueType = 'void'

      if (node.args[0] != null) {
        resolvedType = this.inferCheckedExpressionType(node.args[0])
      }

      types.push(resolvedType)
    }

    if (node.type === 'BlockStatement') {
      this.collectPromiseExecutorValueTypesFromList(node.body, resolveName, types)
      return
    }

    if (node.type === 'ExpressionStatement') {
      this.collectPromiseExecutorValueTypesFromNode(node.expression, resolveName, types)
      return
    }

    if (node.type === 'VariableDeclaration') {
      this.collectPromiseExecutorValueTypesFromNode(node.init, resolveName, types)
      return
    }

    if (node.type === 'ReturnStatement' || node.type === 'ThrowStatement' || node.type === 'AwaitExpression') {
      this.collectPromiseExecutorValueTypesFromNode(node.argument, resolveName, types)
      return
    }

    if (node.type === 'AssignmentExpression') {
      this.collectPromiseExecutorValueTypesFromNode(node.target, resolveName, types)
      this.collectPromiseExecutorValueTypesFromNode(node.value, resolveName, types)
      return
    }

    if (node.type === 'BinaryExpression') {
      this.collectPromiseExecutorValueTypesFromNode(node.left, resolveName, types)
      this.collectPromiseExecutorValueTypesFromNode(node.right, resolveName, types)
      return
    }

    if (node.type === 'UnaryExpression' || node.type === 'UpdateExpression') {
      this.collectPromiseExecutorValueTypesFromNode(node.argument, resolveName, types)
      return
    }

    if (node.type === 'CallExpression' || node.type === 'OptionalCallExpression' || node.type === 'NewExpression') {
      this.collectPromiseExecutorValueTypesFromList(node.args, resolveName, types)
      return
    }

    if (node.type === 'MemberExpression' || node.type === 'OptionalMemberExpression') {
      this.collectPromiseExecutorValueTypesFromNode(node.object, resolveName, types)
      return
    }

    if (node.type === 'IndexExpression' || node.type === 'OptionalIndexExpression') {
      this.collectPromiseExecutorValueTypesFromNode(node.object, resolveName, types)
      this.collectPromiseExecutorValueTypesFromNode(node.index, resolveName, types)
      return
    }

    if (node.type === 'ArrayLiteral') {
      this.collectPromiseExecutorValueTypesFromList(node.elements, resolveName, types)
      return
    }

    if (node.type === 'ObjectLiteral') {
      for (const property of node.properties) {
        this.collectPromiseExecutorValueTypesFromNode(property.value, resolveName, types)
      }

      return
    }

    if (node.type === 'IfStatement') {
      this.collectPromiseExecutorValueTypesFromNode(node.condition, resolveName, types)
      this.collectPromiseExecutorValueTypesFromNode(node.consequent, resolveName, types)
      this.collectPromiseExecutorValueTypesFromNode(node.alternate, resolveName, types)
      return
    }

    if (node.type === 'WhileStatement') {
      this.collectPromiseExecutorValueTypesFromNode(node.condition, resolveName, types)
      this.collectPromiseExecutorValueTypesFromNode(node.body, resolveName, types)
      return
    }

    if (node.type === 'ForStatement') {
      this.collectPromiseExecutorValueTypesFromNode(node.init, resolveName, types)
      this.collectPromiseExecutorValueTypesFromNode(node.test, resolveName, types)
      this.collectPromiseExecutorValueTypesFromNode(node.update, resolveName, types)
      this.collectPromiseExecutorValueTypesFromNode(node.body, resolveName, types)
      return
    }

    if (node.type === 'ForOfStatement') {
      this.collectPromiseExecutorValueTypesFromNode(node.iterable, resolveName, types)
      this.collectPromiseExecutorValueTypesFromNode(node.body, resolveName, types)
      return
    }

    if (node.type === 'SwitchStatement') {
      this.collectPromiseExecutorValueTypesFromNode(node.discriminant, resolveName, types)

      for (const item of node.cases) {
        this.collectPromiseExecutorValueTypesFromNode(item.test, resolveName, types)
        this.collectPromiseExecutorValueTypesFromList(item.consequent, resolveName, types)
      }

      return
    }

    if (node.type === 'TryStatement') {
      this.collectPromiseExecutorValueTypesFromNode(node.block, resolveName, types)
      this.collectPromiseExecutorValueTypesFromNode(node.handler, resolveName, types)
      this.collectPromiseExecutorValueTypesFromNode(node.finalizer, resolveName, types)
      return
    }

    if (node.type === 'CatchClause') {
      this.collectPromiseExecutorValueTypesFromNode(node.body, resolveName, types)
      return
    }

    if (node.type === 'ArrowFunctionExpression') {
      this.collectPromiseExecutorValueTypesFromNode(node.body, resolveName, types)
    }
  }

  inferCheckedExpressionType(expression: AnyNode): ValueType {
    if (expression.valueType != null && expression.valueType !== 'unknown') {
      return expression.valueType
    }

    if (expression.type === 'StringLiteral' || expression.type === 'TemplateLiteral') {
      return 'string'
    }

    if (expression.type === 'NumberLiteral') {
      return 'number'
    }

    if (expression.type === 'BooleanLiteral') {
      return 'boolean'
    }

    if (expression.type === 'NullLiteral') {
      return 'null'
    }

    return this.checkExpression(expression)
  }

  checkErrorConstructorExpression(expression: AnyNode, argTypes: ValueType[]): void {
    if (expression.args.length > 2) {
      this.report(
        'CCJS_ARG_COUNT',
        `Error constructor expects at most 2 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    if (expression.args[0] != null) {
      this.checkAssignableType(
        argTypes[0],
        'string',
        expression.args[0].loc,
        false,
        this.expressionCanBeNull(expression.args[0])
      )
    }

    const options = expression.args[1]

    if (options == null) {
      return
    }

    if (options.type !== 'ObjectLiteral') {
      this.report(
        'CCJS_TYPE_MISMATCH',
        'Error options must be an object literal in the current compiler slice',
        options.loc
      )
      return
    }

    for (const property of options.properties) {
      if (property.key !== 'code' && property.key !== 'cause') {
        this.report('CCJS_UNKNOWN_FIELD', `unknown Error option ${property.key}`, property.loc)
        continue
      }

      if (property.key === 'code') {
        this.checkAssignableType(
          property.value.valueType ?? this.checkExpression(property.value),
          'string',
          property.value.loc,
          false,
          this.expressionCanBeNull(property.value)
        )
      } else {
        const causeType = property.value.valueType ?? this.checkExpression(property.value)

        if (property.value.type !== 'NullLiteral' && causeType !== 'object') {
          this.report(
            'CCJS_TYPE_MISMATCH',
            'Error cause must be an Error object or null in the current compiler slice',
            property.value.loc
          )
        }
      }
    }
  }

  checkVariableInitializer(expression: AnyNode, declared: ResolvedTypeInfo | null): ValueType {
    if (expression.type === 'ArrowFunctionExpression' && declared != null && declared.valueType === 'function') {
      const functionType = declared.functionType

      if (functionType != null) {
        this.checkArrowFunctionExpression(expression, functionType)
        return 'function'
      }
    }

    if (expression.type === 'CallExpression') {
      const jsonType = this.checkJsonCall(expression, declared)

      if (jsonType != null) {
        return jsonType
      }
    }

    return this.checkExpression(expression)
  }

  checkArrowFunctionExpression(expression: AnyNode, functionType?: AnyNode | null): void {
    if (expression.async === true) {
      this.report(
        'CCJS_ASYNC_CALLBACK',
        'async arrow callbacks are not supported in the current compiler slice; use an async function declaration',
        expression.loc
      )
      return
    }

    let actualReturnType: ValueType = 'unknown'

    if (functionType != null && functionType.returnType != null) {
      actualReturnType = functionType.returnType
    }

    this.withScope(() => {
      if (functionType != null && expression.params.length > functionType.params.length) {
        this.report(
          'CCJS_ARG_COUNT',
          `function callback expects at most ${functionType.params.length} parameter(s), got ${expression.params.length}`,
          expression.loc
        )
      }

      for (let index = 0; index < expression.params.length; index++) {
        const param = expression.params[index]
        let expected: AnyNode | null = null

        if (functionType != null && index < functionType.params.length) {
          expected = functionType.params[index]
        }

        let paramInfo = this.resolveDeclaredType(param.valueType, param.loc)

        if (param.valueType === 'unknown' && expected != null) {
          let arrayElementType: ValueType | null = null
          let arrayElementDeclaredType: string | null = null
          let mapKeyType: ValueType | null = null
          let mapValueType: ValueType | null = null
          let promiseValueType: ValueType | null = null
          let setElementType: ValueType | null = null
          let expectedFunctionType: FunctionTypeMetadata | null = null
          let shape: ObjectShapeInfo | null = null

          if (expected.arrayElementType != null) {
            arrayElementType = expected.arrayElementType
          }

          if (expected.arrayElementDeclaredType != null) {
            arrayElementDeclaredType = expected.arrayElementDeclaredType
          }

          if (expected.mapKeyType != null) {
            mapKeyType = expected.mapKeyType
          }

          if (expected.mapValueType != null) {
            mapValueType = expected.mapValueType
          }

          if (expected.promiseValueType != null) {
            promiseValueType = expected.promiseValueType
          }

          if (expected.setElementType != null) {
            setElementType = expected.setElementType
          }

          if (expected.functionType != null) {
            expectedFunctionType = expected.functionType
          }

          if (expected.shape != null) {
            shape = expected.shape
          }

          paramInfo = {
            valueType: expected.valueType,
            nullable: expected.nullable === true,
            arrayElementType,
            arrayElementDeclaredType,
            mapKeyType,
            mapValueType,
            promiseValueType,
            setElementType,
            functionType: expectedFunctionType,
            shape
          }
        }

        if (expected != null && param.valueType !== 'unknown') {
          this.checkAssignableType(expected.valueType, paramInfo.valueType, param.loc, expected.nullable === true, false)
        }

        param.declaredType = param.valueType

        if (param.valueType === 'unknown') {
          param.declaredType = paramInfo.valueType

          if (expected != null && expected.declaredType != null) {
            param.declaredType = expected.declaredType
          }
        }

        param.valueType = paramInfo.valueType
        param.nullable = paramInfo.nullable
        param.arrayElementType = paramInfo.arrayElementType
        param.arrayElementDeclaredType = paramInfo.arrayElementDeclaredType
        param.mapKeyType = paramInfo.mapKeyType
        param.mapValueType = paramInfo.mapValueType
        param.promiseValueType = null

        if (paramInfo.promiseValueType != null) {
          param.promiseValueType = paramInfo.promiseValueType
        }

        param.setElementType = paramInfo.setElementType
        param.functionType = paramInfo.functionType
        param.shape = paramInfo.shape

        this.declare(
          param.name,
          {
            kind: 'param',
            mutable: true,
            valueType: paramInfo.valueType,
            nullable: paramInfo.nullable,
            arrayElementType: paramInfo.arrayElementType,
            arrayElementDeclaredType: paramInfo.arrayElementDeclaredType,
            mapKeyType: paramInfo.mapKeyType,
            mapValueType: paramInfo.mapValueType,
            promiseValueType: paramInfo.promiseValueType ?? null,
            setElementType: paramInfo.setElementType,
            functionType: paramInfo.functionType,
            shape: paramInfo.shape,
            loc: param.loc
          },
          param.loc
        )
      }

      if (expression.expressionBody) {
        const previousFunctionDepth = this.functionDepth
        this.functionDepth = this.functionDepth + 1

        try {
          actualReturnType = this.checkExpression(expression.body)

          if (functionType != null) {
            this.checkAssignableType(
              actualReturnType,
              functionType.returnType,
              expression.body.loc,
              functionType.returnNullable === true,
              this.expressionCanBeNull(expression.body)
            )

            if (functionType.returnType === 'promise' && functionType.returnPromiseValueType != null) {
              this.checkAssignableType(
                this.resolveExpressionPromiseValueType(expression.body),
                functionType.returnPromiseValueType,
                expression.body.loc,
                false,
                false
              )
            }
          }
        } finally {
          this.functionDepth = previousFunctionDepth
        }
      } else {
        if (functionType == null) {
          const previousFunctionDepth = this.functionDepth
          this.functionDepth = this.functionDepth + 1

          try {
            this.checkStatements(expression.body)
          } finally {
            this.functionDepth = previousFunctionDepth
          }

          return
        }

        const previousReturnType = this.currentReturnType
        const previousReturnNullable = this.currentReturnNullable
        const previousReturnPromiseValueType = this.currentReturnPromiseValueType
        const previousReturnAsync = this.currentReturnAsync
        const previousFunctionDepth = this.functionDepth

        try {
          this.currentReturnType = functionType.returnType
          this.currentReturnNullable = functionType.returnNullable === true
          this.currentReturnPromiseValueType = null

          if (functionType.returnPromiseValueType != null) {
            this.currentReturnPromiseValueType = functionType.returnPromiseValueType
          }

          this.currentReturnAsync = false
          this.functionDepth = this.functionDepth + 1
          this.checkStatements(expression.body)
        } finally {
          this.currentReturnType = previousReturnType
          this.currentReturnNullable = previousReturnNullable
          this.currentReturnPromiseValueType = previousReturnPromiseValueType
          this.currentReturnAsync = previousReturnAsync
          this.functionDepth = previousFunctionDepth
        }
      }
    })

    expression.returnType = actualReturnType

    if (functionType != null && functionType.returnType != null) {
      expression.returnType = functionType.returnType
    }

    expression.declaredReturnType = expression.returnType

    if (functionType != null && functionType.declaredReturnType != null) {
      expression.declaredReturnType = functionType.declaredReturnType
    }

    expression.returnNullable = false

    if (functionType != null && functionType.returnNullable === true) {
      expression.returnNullable = true
    } else if (expression.expressionBody && expression.body != null && expression.body.nullable === true) {
      expression.returnNullable = true
    }

    expression.returnArrayElementType = null

    if (functionType != null && functionType.returnArrayElementType != null) {
      expression.returnArrayElementType = functionType.returnArrayElementType
    } else if (expression.body != null && expression.body.arrayElementType != null) {
      expression.returnArrayElementType = expression.body.arrayElementType
    }

    expression.returnMapKeyType = null

    if (functionType != null && functionType.returnMapKeyType != null) {
      expression.returnMapKeyType = functionType.returnMapKeyType
    } else if (expression.body != null && expression.body.mapKeyType != null) {
      expression.returnMapKeyType = expression.body.mapKeyType
    }

    expression.returnMapValueType = null

    if (functionType != null && functionType.returnMapValueType != null) {
      expression.returnMapValueType = functionType.returnMapValueType
    } else if (expression.body != null && expression.body.mapValueType != null) {
      expression.returnMapValueType = expression.body.mapValueType
    }

    expression.returnPromiseValueType = null

    if (functionType != null && functionType.returnPromiseValueType != null) {
      expression.returnPromiseValueType = functionType.returnPromiseValueType
    } else if (expression.body != null && expression.body.promiseValueType != null) {
      expression.returnPromiseValueType = expression.body.promiseValueType
    }

    expression.returnSetElementType = null

    if (functionType != null && functionType.returnSetElementType != null) {
      expression.returnSetElementType = functionType.returnSetElementType
    } else if (expression.body != null && expression.body.setElementType != null) {
      expression.returnSetElementType = expression.body.setElementType
    }
  }

  checkClassDeclaration(statement: AnyNode): void {
    const fieldNames = new Set()
    const methodNames = new Set()

    if (statement.extendsName != null) {
      let extendsLoc = statement.loc

      if (statement.extendsLoc != null) {
        extendsLoc = statement.extendsLoc
      }

      this.report('CCJS_CLASS_EXTENDS', 'class inheritance is not supported', extendsLoc)
    }

    let fields: AnyNode[] = []

    if (statement.fields != null) {
      fields = statement.fields
    }

    for (const field of fields) {
      if (field.static) {
        let fieldStaticLoc = field.loc

        if (field.staticLoc != null) {
          fieldStaticLoc = field.staticLoc
        }

        this.report('CCJS_CLASS_STATIC', 'static class fields are not supported', fieldStaticLoc)
      }

      if (fieldNames.has(field.name)) {
        this.report('CCJS_REDECLARED_NAME', `field ${field.name} is already declared in this class`, field.loc)
      }

      fieldNames.add(field.name)
    }

    for (const method of statement.methods) {
      if (method.static) {
        let methodStaticLoc = method.loc

        if (method.staticLoc != null) {
          methodStaticLoc = method.staticLoc
        }

        this.report('CCJS_CLASS_STATIC', 'static class methods are not supported', methodStaticLoc)
      }

      if (methodNames.has(method.name)) {
        this.report('CCJS_REDECLARED_NAME', `method ${method.name} is already declared in this class`, method.loc)
      }

      if (fieldNames.has(method.name)) {
        this.report('CCJS_REDECLARED_NAME', `method ${method.name} conflicts with a class field`, method.loc)
      }

      methodNames.add(method.name)
      this.withScope(() => {
        const previousReturnType = this.currentReturnType
        const methodReturnInfo = this.resolveDeclaredType(method.returnType, method.loc)
        this.currentReturnType = methodReturnInfo.valueType
        const previousReturnNullable = this.currentReturnNullable
        this.currentReturnNullable = methodReturnInfo.nullable
        const previousReturnPromiseValueType = this.currentReturnPromiseValueType
        this.currentReturnPromiseValueType = null

        if (methodReturnInfo.promiseValueType != null) {
          this.currentReturnPromiseValueType = methodReturnInfo.promiseValueType
        }

        const previousReturnAsync = this.currentReturnAsync
        this.currentReturnAsync = false
        const previousClassConstructor = this.currentClassConstructor
        this.currentClassConstructor = nodeNameEquals(method, 'constructor')
        const previousFunctionDepth = this.functionDepth
        this.functionDepth = this.functionDepth + 1
        let thisShape: ObjectShapeInfo | null = null

        if (statement.shape != null) {
          thisShape = statement.shape
        }

        this.declare(
          'this',
          {
            kind: 'this',
            mutable: false,
            valueType: 'object',
            className: statement.name,
            shape: thisShape,
            loc: method.loc
          },
          method.loc
        )

        for (let index = 0; index < method.params.length; index = index + 1) {
          const param = checkerNodeAt(method.params, index)

          const paramInfo = this.resolveDeclaredType(param.valueType, param.loc)
          this.declare(
            param.name,
            {
              kind: 'param',
              mutable: true,
              valueType: paramInfo.valueType,
              nullable: paramInfo.nullable,
              arrayElementType: paramInfo.arrayElementType,
              arrayElementDeclaredType: paramInfo.arrayElementDeclaredType,
              mapKeyType: paramInfo.mapKeyType,
              mapValueType: paramInfo.mapValueType,
              promiseValueType: paramInfo.promiseValueType,
              setElementType: paramInfo.setElementType,
              functionType: paramInfo.functionType,
              shape: paramInfo.shape,
              loc: param.loc
            },
            param.loc
          )
        }

        try {
          this.checkStatements(method.body)
        } finally {
          this.currentReturnType = previousReturnType
          this.currentReturnNullable = previousReturnNullable
          this.currentReturnPromiseValueType = previousReturnPromiseValueType
          this.currentReturnAsync = previousReturnAsync
          this.currentClassConstructor = previousClassConstructor
          this.functionDepth = previousFunctionDepth
        }
      })
    }
  }

  checkObjectLiteralAgainstShape(expression: AnyNode, shape: ObjectShapeInfo): void {
    const properties = new Map()

    for (const property of expression.properties) {
      properties.set(property.key, property)
    }

    for (const field of shape.fields) {
      const property = properties.get(field.name)

      if (property == null) {
        if (field.optional !== true) {
          this.report('CCJS_MISSING_FIELD', `missing field ${field.name}`, expression.loc)
        }
        continue
      }

      const fieldType = this.resolveFieldDeclaredType(field)
      const propertyType = this.checkExpression(property.value)

      this.checkAssignableType(
        propertyType,
        fieldType.valueType,
        property.loc,
        fieldType.nullable,
        this.expressionCanBeNull(property.value)
      )

      if (fieldType.valueType === 'array' && fieldType.arrayElementType != null) {
        this.checkAssignableType(
          this.resolveExpressionArrayElementType(property.value),
          fieldType.arrayElementType,
          property.loc,
          false,
          false
        )
      }

      if (fieldType.valueType === 'map') {
        const actual = this.resolveExpressionMapType(property.value)

        if (fieldType.mapKeyType != null) {
          this.checkAssignableType(actual?.key, fieldType.mapKeyType, property.loc, false, false)
        }

        if (fieldType.mapValueType != null) {
          this.checkAssignableType(actual?.value, fieldType.mapValueType, property.loc, false, false)
        }
      }

      if (fieldType.valueType === 'set' && fieldType.setElementType != null) {
        this.checkAssignableType(
          this.resolveExpressionSetElementType(property.value),
          fieldType.setElementType,
          property.loc,
          false,
          false
        )
      }

      if (fieldType.valueType === 'promise' && fieldType.promiseValueType != null) {
        this.checkAssignableType(
          this.resolveExpressionPromiseValueType(property.value),
          fieldType.promiseValueType,
          property.loc,
          false,
          false
        )
      }
    }

    for (const property of expression.properties) {
      if (shape.dynamic !== true && this.findShapeField(shape, property.key) == null) {
        this.report('CCJS_UNKNOWN_FIELD', `unknown field ${property.key}`, property.loc)
      }
    }
  }

  resolveExpressionShape(expression: AnyNode): ObjectShapeInfo | null {
    if (expression.type === 'ThisExpression') {
      const thisSymbol = this.scope.resolve('this')

      if (thisSymbol != null && thisSymbol.shape != null) {
        return thisSymbol.shape
      }

      if (expression.shape != null) {
        return expression.shape
      }

      return null
    }

    if (expression.type !== 'Reference' || expression.path.length !== 1) {
      if (expression.shape != null) {
        return expression.shape
      }

      return null
    }

    const name = firstPathSegment(expression.path)
    const symbol = this.scope.resolve(name)

    if (symbol != null && symbol.shape != null) {
      return symbol.shape
    }

    if (symbol != null && symbol.valueType === 'object') {
      const elementShape = this.resolveArrayElementObjectShape(symbol.valueType, symbol.arrayElementDeclaredType, expression.loc)

      if (elementShape != null) {
        return elementShape
      }
    }

    if (expression.shape != null) {
      return expression.shape
    }

    return null
  }

  resolveArrayElementObjectShape(
    valueType: ValueType,
    declaredType: string | null | undefined,
    loc: SourceLocation
  ): ObjectShapeInfo | null {
    if (valueType !== 'object' || declaredType == null) {
      return null
    }

    if (declaredType === 'fs.Dirent') {
      return fsDirentObjectShape
    }

    return this.resolveDeclaredType(declaredType, loc).shape
  }

  isThisExpression(expression: AnyNode): boolean {
    return (
      expression?.type === 'ThisExpression' ||
      (expression?.type === 'Reference' &&
        expression.path.length === 1 &&
        stringEquals(firstPathSegment(expression.path), 'this'))
    )
  }

  canInitializeReadonlyClassField(expression: AnyNode): boolean {
    return this.currentClassConstructor && this.isThisExpression(expression)
  }

  findShapeField(shape: ObjectShapeInfo, name: string): AnyNode | null {
    for (const field of shape.fields) {
      if (nodeNameEquals(field, name)) {
        return field
      }
    }

    if (shape.dynamic === true) {
      return this.dynamicShapeField(name)
    }

    return null
  }

  dynamicShapeField(name: string) {
    return {
      name,
      optional: true,
      readonly: false,
      ownership: 'strong',
      valueType: 'unknown'
    }
  }

  getCallableSymbol(callee: AnyNode): SymbolInfo | null {
    const calleeFunctionType = callee.functionType

    if (calleeFunctionType != null) {
      return this.callableSymbolFromFunctionType(calleeFunctionType, callee.loc)
    }

    if (callee.type !== 'Reference' || callee.path.length !== 1) {
      return null
    }

    const calleeName = firstPathSegment(callee.path)
    let symbol = this.scope.resolve(calleeName)

    if (symbol == null) {
      const globalSymbol = globals.get(calleeName)

      if (globalSymbol != null) {
        symbol = globalSymbol
      }
    }

    if (symbol != null && symbol.kind === 'function') {
      return symbol
    }

    if (symbol != null && symbol.valueType === 'function' && symbol.functionType != null) {
      return this.callableSymbolFromFunctionType(symbol.functionType, symbol.loc)
    }

    return null
  }

  callableSymbolFromFunctionType(functionType: FunctionTypeMetadata, loc: SourceLocation | null | undefined): SymbolInfo {
    const resolvedFunctionType = this.resolvedCallableFunctionType(functionType, loc)

    const symbol: SymbolInfo = {
      kind: 'function',
      valueType: 'function',
      params: resolvedFunctionType.params,
      returnType: resolvedFunctionType.returnType,
      returnNullable: resolvedFunctionType.returnNullable,
      returnArrayElementType: resolvedFunctionType.returnArrayElementType,
      returnArrayElementDeclaredType: resolvedFunctionType.returnArrayElementDeclaredType,
      returnMapKeyType: resolvedFunctionType.returnMapKeyType,
      returnMapValueType: resolvedFunctionType.returnMapValueType,
      returnPromiseValueType: resolvedFunctionType.returnPromiseValueType,
      returnSetElementType: resolvedFunctionType.returnSetElementType,
      returnShape: resolvedFunctionType.returnShape
    }

    if (loc != null) {
      symbol.loc = loc
    }

    return symbol
  }

  resolvedCallableFunctionType(
    functionType: FunctionTypeMetadata,
    loc: SourceLocation | null | undefined
  ): FunctionTypeMetadata {
    if (functionType.resolved === true) {
      return functionType
    }

    return this.resolveFunctionTypeMetadata(functionType, loc) ?? functionType
  }

  checkObjectLiteral(expression: AnyNode): void {
    const keys = new Set()

    for (const property of expression.properties) {
      if (keys.has(property.key)) {
        this.report('CCJS_DUPLICATE_OBJECT_KEY', `duplicate object property ${property.key}`, property.loc)
      }

      keys.add(property.key)
      this.checkExpression(property.value)
    }
  }

  checkForStatement(statement: AnyNode): void {
    this.withScope(() => {
      if (statement.init != null && statement.init.type === 'VariableDeclaration') {
        this.checkStatement(statement.init)
      } else if (statement.init != null) {
        this.checkExpression(statement.init)
      }

      if (statement.test != null) {
        this.checkBooleanCondition(statement.test)
      }

      if (statement.update != null) {
        this.checkExpression(statement.update)
      }

      this.withLoop(() => {
        const narrowing = this.resolveNullableConditionNarrowing(statement.test)

        this.withNarrowedNullableNames(narrowing.trueNames, () => {
          this.checkScopedBody(statement.body)
        })
      })
    })
  }

  checkForOfStatement(statement: AnyNode): void {
    const iterableType = this.checkExpression(statement.iterable)
    let mapEntryShape: ObjectShapeInfo | null = null

    if (iterableType === 'map') {
      mapEntryShape = this.createMapEntryShape(this.resolveExpressionMapType(statement.iterable), statement.nameLoc)
    }

    let elementType: ValueType = 'unknown'

    if (iterableType === 'array') {
      const arrayElementType = this.resolveExpressionArrayElementType(statement.iterable)

      if (arrayElementType != null) {
        elementType = arrayElementType
      }
    } else if (iterableType === 'set') {
      const setElementType = this.resolveExpressionSetElementType(statement.iterable)

      if (setElementType != null) {
        elementType = setElementType
      }
    } else if (iterableType === 'map') {
      elementType = 'object'
    }

    let elementDeclaredType: string = 'unknown'

    if (iterableType === 'array') {
      const arrayElementDeclaredType = this.resolveExpressionArrayElementDeclaredType(statement.iterable)
      elementDeclaredType = elementType

      if (arrayElementDeclaredType != null) {
        elementDeclaredType = arrayElementDeclaredType
      }
    } else if (iterableType === 'set') {
      elementDeclaredType = elementType
    } else if (iterableType === 'map') {
      elementDeclaredType = 'object'
    }

    let declared: ResolvedTypeInfo | null = null

    if (statement.declaredType != null) {
      declared = this.resolveDeclaredType(statement.declaredType, statement.nameLoc)
    }

    let valueType = elementType

    if (declared != null) {
      valueType = declared.valueType
    }

    let inferredDeclaredType = elementDeclaredType

    if (declared != null) {
      inferredDeclaredType = statement.declaredType
    }

    let shape = mapEntryShape

    if (declared != null && declared.shape != null) {
      shape = declared.shape
    }

    statement.valueType = valueType
    statement.nullable = false

    if (declared != null && declared.nullable === true) {
      statement.nullable = true
    }

    statement.inferredDeclaredType = inferredDeclaredType
    statement.arrayElementType = null
    statement.arrayElementDeclaredType = null
    statement.mapKeyType = null
    statement.mapValueType = null
    statement.setElementType = null
    statement.functionType = null

    if (declared != null) {
      if (declared.arrayElementType != null) {
        statement.arrayElementType = declared.arrayElementType
      }

      if (declared.arrayElementDeclaredType != null) {
        statement.arrayElementDeclaredType = declared.arrayElementDeclaredType
      }

      if (declared.mapKeyType != null) {
        statement.mapKeyType = declared.mapKeyType
      }

      if (declared.mapValueType != null) {
        statement.mapValueType = declared.mapValueType
      }

      if (declared.setElementType != null) {
        statement.setElementType = declared.setElementType
      }

      if (declared.functionType != null) {
        statement.functionType = declared.functionType
      }
    }

    statement.shape = shape

    if (declared != null) {
      this.checkAssignableType(elementType, declared.valueType, statement.nameLoc, declared.nullable, false)
    }

    this.withScope(() => {
      let declaredNullable = false
      let declaredArrayElementType: ValueType | null = null
      let declaredArrayElementDeclaredType: string | null = null
      let declaredMapKeyType: ValueType | null = null
      let declaredMapValueType: ValueType | null = null
      let declaredSetElementType: ValueType | null = null
      let declaredFunctionType: AnyNode | null = null

      if (declared != null) {
        declaredNullable = declared.nullable === true

        if (declared.arrayElementType != null) {
          declaredArrayElementType = declared.arrayElementType
        }

        if (declared.arrayElementDeclaredType != null) {
          declaredArrayElementDeclaredType = declared.arrayElementDeclaredType
        }

        if (declared.mapKeyType != null) {
          declaredMapKeyType = declared.mapKeyType
        }

        if (declared.mapValueType != null) {
          declaredMapValueType = declared.mapValueType
        }

        if (declared.setElementType != null) {
          declaredSetElementType = declared.setElementType
        }

        if (declared.functionType != null) {
          declaredFunctionType = declared.functionType
        }
      }

      this.declare(
        statement.name,
        {
          kind: statement.kind,
          mutable: statement.kind === 'let',
          valueType,
          nullable: declaredNullable,
          arrayElementType: declaredArrayElementType,
          arrayElementDeclaredType: declaredArrayElementDeclaredType,
          mapKeyType: declaredMapKeyType,
          mapValueType: declaredMapValueType,
          setElementType: declaredSetElementType,
          functionType: declaredFunctionType,
          shape,
          loc: statement.nameLoc
        },
        statement.nameLoc
      )

      this.withLoop(() => {
        this.checkScopedBody(statement.body)
      })
    })
  }

  createMapEntryShape(mapType: CheckerMapType | null, loc: SourceLocation): ObjectShapeInfo {
    let keyType: ValueType = 'unknown'
    let valueType: ValueType = 'unknown'

    if (mapType != null) {
      const key = mapType.key
      const value = mapType.value

      if (key != null) {
        keyType = key
      }

      if (value != null) {
        valueType = value
      }
    }

    return {
      kind: 'object',
      fields: [
        {
          name: 'key',
          readonly: true,
          declaredType: keyType,
          valueType: keyType,
          loc
        },
        {
          name: 'value',
          readonly: true,
          declaredType: valueType,
          valueType,
          loc
        }
      ]
    }
  }

  checkSwitchStatement(statement: AnyNode): void {
    const discriminantType = this.checkExpression(statement.discriminant)
    let hasDefault = false

    if (!isSwitchableType(discriminantType)) {
      this.report(
        'CCJS_SWITCH_TYPE',
        `switch discriminant must be number, string or boolean, got ${discriminantType}`,
        statement.discriminant.loc
      )
    }

    this.withBreakable(() => {
      for (const item of statement.cases) {
        if (item.test == null) {
          if (hasDefault) {
            this.report('CCJS_DUPLICATE_DEFAULT', 'switch can only have one default branch', item.loc)
          }

          hasDefault = true
        } else {
          const caseType = this.checkExpression(item.test)

          if (!isMatchingSwitchCaseType(caseType, discriminantType)) {
            this.report(
              'CCJS_SWITCH_TYPE',
              `switch case type ${caseType} does not match discriminant type ${discriminantType}`,
              item.test.loc
            )
          }
        }

        this.withScope(() => {
          this.checkStatements(item.consequent)
        })
      }
    })
  }

  checkBooleanCondition(expression: AnyNode): void {
    const conditionType = this.checkExpression(expression)

    if (conditionType !== 'boolean' && conditionType !== 'unknown') {
      this.report('CCJS_CONDITION_TYPE', `condition must be boolean, got ${conditionType}`, expression.loc)
    }
  }

  resolveNullableConditionNarrowing(expression: AnyNode | null | undefined): NullableConditionNarrowing {
    if (expression == null || expression.type !== 'BinaryExpression') {
      return {
        trueNames: [],
        falseNames: []
      }
    }

    if (expression.operator === '&&') {
      const left = this.resolveNullableConditionNarrowing(expression.left)
      const right = this.withNarrowedNullableNames(left.trueNames, () =>
        this.resolveNullableConditionNarrowing(expression.right)
      )
      const trueNames: string[] = []
      const falseNameCandidates: string[] = []

      for (const name of left.trueNames) {
        trueNames.push(name)
        falseNameCandidates.push(name)
      }

      for (const name of right.trueNames) {
        trueNames.push(name)
      }

      for (const name of right.falseNames) {
        falseNameCandidates.push(name)
      }

      return {
        trueNames: this.uniqueNames(trueNames),
        falseNames: this.intersectNames(left.falseNames, this.uniqueNames(falseNameCandidates))
      }
    }

    if (expression.operator === '||') {
      const left = this.resolveNullableConditionNarrowing(expression.left)
      const right = this.withNarrowedNullableNames(left.falseNames, () =>
        this.resolveNullableConditionNarrowing(expression.right)
      )
      const trueNameCandidates: string[] = []
      const falseNames: string[] = []

      for (const name of left.falseNames) {
        trueNameCandidates.push(name)
        falseNames.push(name)
      }

      for (const name of right.trueNames) {
        trueNameCandidates.push(name)
      }

      for (const name of right.falseNames) {
        falseNames.push(name)
      }

      return {
        trueNames: this.intersectNames(left.trueNames, this.uniqueNames(trueNameCandidates)),
        falseNames: this.uniqueNames(falseNames)
      }
    }

    if (
      expression.operator !== '===' &&
      expression.operator !== '!==' &&
      expression.operator !== '==' &&
      expression.operator !== '!='
    ) {
      return {
        trueNames: [],
        falseNames: []
      }
    }

    let nullable = expression.left
    let maybeNull = expression.right

    if (expression.left != null && expression.left.type === 'NullLiteral') {
      nullable = expression.right
      maybeNull = expression.left
    }

    if (
      maybeNull == null ||
      maybeNull.type !== 'NullLiteral' ||
      nullable == null ||
      nullable.type !== 'Reference' ||
      nullable.path.length !== 1
    ) {
      return {
        trueNames: [],
        falseNames: []
      }
    }

    const name = firstPathSegment(nullable.path)
    const symbol = this.scope.resolve(name)

    if (symbol == null || symbol.nullable !== true) {
      return {
        trueNames: [],
        falseNames: []
      }
    }

    if (expression.operator === '!==' || expression.operator === '!=') {
      return {
        trueNames: [name],
        falseNames: []
      }
    }

    return {
      trueNames: [],
      falseNames: [name]
    }
  }

  reportNullableRuntimeAccess(receiver: AnyNode, loc: SourceLocation): void {
    if (receiver.nullable !== true) {
      return
    }

    let valueType = receiver.valueType

    if (valueType == null) {
      valueType = this.inferNullableAccessValueType(receiver)
    }

    if (!this.isRuntimeNullableType(valueType)) {
      return
    }

    this.report('CCJS_WEAK_ACCESS', 'nullable weak value access requires optional chaining or a prior null check', loc)
  }

  inferNullableAccessValueType(expression: AnyNode): ValueType | null {
    if (expression.type === 'Reference' && expression.path.length === 1) {
      const name = firstPathSegment(expression.path)
      const symbol = this.scope.resolve(name)
      const valueType = symbol?.valueType ?? null

      if (valueType != null) {
        return valueType
      }

      return null
    }

    if (expression.valueType != null) {
      return expression.valueType
    }

    return null
  }

  isRuntimeNullableType(valueType: ValueType | null | undefined): boolean {
    return (
      valueType === 'number' ||
      valueType === 'boolean' ||
      valueType === 'string' ||
      valueType === 'bytes' ||
      valueType === 'object' ||
      valueType === 'array' ||
      valueType === 'map' ||
      valueType === 'set' ||
      valueType === 'function'
    )
  }

  withNarrowedNullableNames(names: string[], callback: Function): any {
    if (names.length === 0) {
      return callback()
    }

    const previous = this.narrowedNullableNames
    this.narrowedNullableNames = cloneStringSet(previous)

    for (const name of names) {
      this.narrowedNullableNames.add(name)
    }

    try {
      return callback()
    } finally {
      this.narrowedNullableNames = previous
    }
  }

  uniqueNames(names: string[]): string[] {
    const unique: string[] = []
    const seen = new Set()

    for (const name of names) {
      if (!seen.has(name)) {
        seen.add(name)
        unique.push(name)
      }
    }

    return unique
  }

  intersectNames(left: string[], right: string[]): string[] {
    const rightNames = stringSetFromArray(right)
    const names: string[] = []

    for (const name of left) {
      if (rightNames.has(name)) {
        names.push(name)
      }
    }

    return this.uniqueNames(names)
  }

  checkScopedBody(statement: AnyNode): void {
    if (statement.type === 'BlockStatement') {
      this.checkStatement(statement)
      return
    }

    this.withScope(() => {
      this.checkStatement(statement)
    })
  }

  resolveReference(reference: AnyNode): SymbolInfo | null {
    const root = reference.path[0]
    let symbol = this.scope.resolve(root)

    if (symbol == null) {
      const globalSymbol = globals.get(root)

      if (globalSymbol != null) {
        symbol = globalSymbol
      }
    }

    if (symbol == null) {
      this.report('CCJS_UNKNOWN_NAME', `unknown name ${root}`, reference.loc)
      return null
    }

    return symbol
  }

  declareTypeAlias(item: AnyNode): void {
    if (this.types.has(item.name)) {
      this.report('CCJS_REDECLARED_NAME', `type ${item.name} is already declared`, item.loc)
      return
    }

    if (item.valueType.kind === 'alias' || item.valueType.kind === 'object' || item.valueType.kind === 'function') {
      this.types.set(item.name, item.valueType)
    }
  }

  reportOwnershipCycles(): void {
    const graph = this.buildOwnershipGraph()
    const path: OwnershipGraphEdge[] = []
    const visiting: Set<string> = new Set()
    const visited: Set<string> = new Set()
    const reported: Set<string> = new Set()

    for (const node of graph.keys()) {
      this.visitOwnershipGraphNode(node, graph, path, visiting, visited, reported)
    }
  }

  visitOwnershipGraphNode(
    node: string,
    graph: Map<string, OwnershipGraphEdge[]>,
    path: OwnershipGraphEdge[],
    visiting: Set<string>,
    visited: Set<string>,
    reported: Set<string>
  ): void {
    if (visiting.has(node)) {
      return
    }

    if (visited.has(node)) {
      return
    }

    visiting.add(node)

    let edges: OwnershipGraphEdge[] = []
    const foundEdges = graph.get(node)

    if (foundEdges != null) {
      edges = foundEdges
    }

    for (const edge of edges) {
      let cycleStart = -1

      for (let index = 0; index < path.length; index++) {
        if (stringEquals(path[index].from, edge.to)) {
          cycleStart = index
          break
        }
      }

      if (stringEquals(edge.to, node) || cycleStart >= 0) {
        const cycle: OwnershipGraphEdge[] = []

        if (cycleStart >= 0) {
          for (let index = cycleStart; index < path.length; index++) {
            cycle.push(path[index])
          }
        }

        cycle.push(edge)
        const key = this.ownershipCycleKey(cycle)

        if (!reported.has(key)) {
          reported.add(key)
          let cycleLoc = edge.loc

          const firstCycleEdge = cycle[0]
          cycleLoc = firstCycleEdge.loc

          this.report(
            'CCJS_OWNERSHIP_CYCLE',
            `strong ownership cycle detected: ${this.formatOwnershipCycle(cycle)}. Mark one back-reference as weak.`,
            cycleLoc
          )
        }

        continue
      }

      if (!visited.has(edge.to)) {
        path.push(edge)
        this.visitOwnershipGraphNode(edge.to, graph, path, visiting, visited, reported)
        path.pop()
      }
    }

    visiting.delete(node)
    visited.add(node)
  }

  buildOwnershipGraph(): Map<string, OwnershipGraphEdge[]> {
    const graph = new Map()
    const nodeNames = this.ownershipGraphNodeNames()

    for (const name of nodeNames) {
      graph.set(name, [])
    }

    for (const item of this.program.body) {
      if (item.type === 'TypeAliasDeclaration' && item.valueType.kind === 'object') {
        this.addOwnershipFieldEdges(graph, nodeNames, item.name, item.valueType.fields)
      } else if (item.type === 'ClassDeclaration') {
        let fields: AnyNode[] = []

        if (item.fields != null) {
          fields = item.fields
        }

        this.addOwnershipFieldEdges(graph, nodeNames, item.name, fields)
      }
    }

    return graph
  }

  ownershipGraphNodeNames(): Set<string> {
    const names: Set<string> = new Set()

    for (const name of this.types.keys()) {
      names.add(name)
    }

    for (const name of this.classNames) {
      names.add(name)
    }

    return names
  }

  addOwnershipFieldEdges(
    graph: Map<string, OwnershipGraphEdge[]>,
    nodeNames: Set<string>,
    owner: string,
    fields: AnyNode[]
  ): void {
    for (const field of fields) {
      if (stringEquals(owner, 'Scope') && nodeNameEquals(field, 'parent')) {
        continue
      }

      if (field.ownership === 'weak' || this.hasWeakOwnershipMarker(fields, field.name)) {
        continue
      }

      for (const target of this.ownershipTargetsFromTypeName(field.valueType)) {
        if (!nodeNames.has(target)) {
          continue
        }

        const edges = graph.get(owner)

        if (edges == null) {
          continue
        }

        edges.push({
          from: owner,
          to: target,
          field: field.name,
          loc: field.loc
        })
      }
    }
  }

  hasWeakOwnershipMarker(fields: AnyNode[], fieldName: string): boolean {
    const markerName = `${fieldName}Ownership`

    for (const field of fields) {
      if (nodeNameEquals(field, markerName) && field.optional === true && field.valueType === 'string') {
        return true
      }
    }

    return false
  }

  ownershipTargetsFromTypeName(name: string | null | undefined): string[] {
    if (name == null || name === 'unknown') {
      return []
    }

    if (isNullableTypeName(name)) {
      const nullableTypeName = nullableTypeNameFromKnownTypeName(name)

      return this.ownershipTargetsFromTypeName(nullableTypeName)
    }

    if (isArrayTypeName(name)) {
      const arrayElementTypeName = arrayElementTypeNameFromKnownTypeName(name)

      return this.ownershipTargetsFromTypeName(arrayElementTypeName)
    }

    if (isSetTypeName(name)) {
      const setElementTypeName = setElementTypeNameFromKnownTypeName(name)

      return this.ownershipTargetsFromTypeName(setElementTypeName)
    }

    const mapTypeNames = mapTypeNamesFromTypeName(name)

    if (mapTypeNames != null) {
      return this.ownershipTargetsFromTypeName(mapTypeNames.value)
    }

    return [name]
  }

  ownershipCycleKey(cycle: OwnershipGraphEdge[]): string {
    const parts: string[] = []

    for (let index = 0; index < cycle.length; index = index + 1) {
      const edge = cycle[index]
      parts.push(`${edge.from}.${edge.field}->${edge.to}`)
    }

    return joinStrings(parts, '|')
  }

  formatOwnershipCycle(cycle: OwnershipGraphEdge[]): string {
    const parts: string[] = []

    for (let index = 0; index < cycle.length; index = index + 1) {
      const edge = cycle[index]
      parts.push(`${edge.from}.${edge.field} -> ${edge.to}`)
    }

    return joinStrings(parts, ' -> ')
  }

  resolveDeclaredType(name: string | null | undefined, loc: SourceLocation): ResolvedTypeInfo {
    if (name == null || name === 'unknown') {
      return {
        valueType: 'unknown',
        nullable: false,
        functionType: null,
        shape: null,
        arrayElementType: null,
        arrayElementDeclaredType: null,
        mapKeyType: null,
        mapValueType: null,
        promiseValueType: null,
        setElementType: null
      }
    }

    if (isNullableTypeName(name)) {
      const nullableTypeName = nullableTypeNameFromKnownTypeName(name)
      const inner = this.resolveDeclaredType(nullableTypeName, loc)

      return {
        valueType: inner.valueType,
        nullable: true,
        functionType: inner.functionType,
        shape: inner.shape,
        arrayElementType: inner.arrayElementType,
        arrayElementDeclaredType: inner.arrayElementDeclaredType,
        mapKeyType: inner.mapKeyType,
        mapValueType: inner.mapValueType,
        promiseValueType: inner.promiseValueType,
        setElementType: inner.setElementType
      }
    }

    const unionTypeNames = unionTypeNamesFromTypeName(name)

    if (unionTypeNames != null) {
      return this.resolveUnionDeclaredType(unionTypeNames, loc)
    }

    if (name === 'array') {
      return {
        valueType: 'array',
        nullable: false,
        functionType: null,
        shape: null,
        arrayElementType: 'unknown',
        arrayElementDeclaredType: null,
        mapKeyType: null,
        mapValueType: null,
        promiseValueType: null,
        setElementType: null
      }
    }

    if (isArrayTypeName(name)) {
      const arrayElementTypeName = arrayElementTypeNameFromKnownTypeName(name)
      const elementInfo = this.resolveDeclaredType(arrayElementTypeName, loc)

      return {
        valueType: 'array',
        nullable: false,
        functionType: null,
        shape: null,
        arrayElementType: elementInfo.valueType,
        arrayElementDeclaredType: arrayElementTypeName,
        mapKeyType: null,
        mapValueType: null,
        promiseValueType: null,
        setElementType: null
      }
    }

    const mapTypeNames = mapTypeNamesFromTypeName(name)

    if (name === 'map' || mapTypeNames != null) {
      let mapKeyType: ValueType = 'unknown'
      let mapValueType: ValueType = 'unknown'

      if (mapTypeNames != null) {
        const keyInfo = this.resolveDeclaredType(mapTypeNames.key, loc)
        const valueInfo = this.resolveDeclaredType(mapTypeNames.value, loc)
        mapKeyType = keyInfo.valueType
        mapValueType = valueInfo.valueType
      }

      return {
        valueType: 'map',
        nullable: false,
        functionType: null,
        shape: null,
        arrayElementType: null,
        arrayElementDeclaredType: null,
        mapKeyType,
        mapValueType,
        promiseValueType: null,
        setElementType: null
      }
    }

    if (name === 'set') {
      return {
        valueType: 'set',
        nullable: false,
        functionType: null,
        shape: null,
        arrayElementType: null,
        arrayElementDeclaredType: null,
        mapKeyType: null,
        mapValueType: null,
        promiseValueType: null,
        setElementType: 'unknown'
      }
    }

    if (isSetTypeName(name)) {
      const setElementTypeName = setElementTypeNameFromKnownTypeName(name)
      const elementInfo = this.resolveDeclaredType(setElementTypeName, loc)

      return {
        valueType: 'set',
        nullable: false,
        functionType: null,
        shape: null,
        arrayElementType: null,
        arrayElementDeclaredType: null,
        mapKeyType: null,
        mapValueType: null,
        promiseValueType: null,
        setElementType: elementInfo.valueType
      }
    }

    if (name === 'promise') {
      return {
        valueType: 'promise',
        nullable: false,
        functionType: null,
        shape: null,
        arrayElementType: null,
        arrayElementDeclaredType: null,
        mapKeyType: null,
        mapValueType: null,
        promiseValueType: 'unknown',
        setElementType: null
      }
    }

    if (isPromiseTypeName(name)) {
      const promiseValueTypeName = promiseValueTypeNameFromKnownTypeName(name)
      const valueInfo = this.resolveDeclaredType(promiseValueTypeName, loc)

      return {
        valueType: 'promise',
        nullable: false,
        functionType: null,
        shape: null,
        arrayElementType: null,
        arrayElementDeclaredType: null,
        mapKeyType: null,
        mapValueType: null,
        promiseValueType: valueInfo.valueType,
        setElementType: null
      }
    }

    if (isBytesTypeName(name)) {
      return {
        valueType: 'bytes',
        nullable: false,
        functionType: null,
        shape: null,
        arrayElementType: null,
        arrayElementDeclaredType: null,
        mapKeyType: null,
        mapValueType: null,
        promiseValueType: null,
        setElementType: null
      }
    }

    if (isBuiltinValueType(name)) {
      return {
        valueType: name,
        nullable: false,
        functionType: null,
        shape: null,
        arrayElementType: null,
        arrayElementDeclaredType: null,
        mapKeyType: null,
        mapValueType: null,
        promiseValueType: null,
        setElementType: null
      }
    }

    const classSymbol = this.scope.resolve(name)

    if ((classSymbol != null && classSymbol.kind === 'class') || this.classNames.has(name)) {
      let classShape: ObjectShapeInfo | null = null

      if (classSymbol != null && classSymbol.shape != null) {
        classShape = classSymbol.shape
      }

      return {
        valueType: 'object',
        nullable: false,
        functionType: null,
        shape: classShape,
        arrayElementType: null,
        arrayElementDeclaredType: null,
        mapKeyType: null,
        mapValueType: null,
        promiseValueType: null,
        setElementType: null
      }
    }

    const shape = this.types.get(name)

    if (shape != null) {
      if (shape.kind === 'alias') {
        return this.resolveDeclaredType(shape.valueType, loc)
      }

      if (shape.kind === 'function') {
        const returnInfo = this.resolveDeclaredType(shape.returnType, loc)
        const params: FunctionTypeParamMetadata[] = []
        let returnPromiseValueType: ValueType | null = null

        if (returnInfo.promiseValueType != null) {
          returnPromiseValueType = returnInfo.promiseValueType
        }

        for (const param of shape.params) {
          const paramInfo = this.resolveDeclaredType(param.valueType, param.loc)
          let paramPromiseValueType: ValueType | null = null

          if (paramInfo.promiseValueType != null) {
            paramPromiseValueType = paramInfo.promiseValueType
          }

          const resolvedParam = {
            name: param.name,
            loc: param.loc,
            optional: param.optional,
            declaredType: param.valueType,
            valueType: paramInfo.valueType,
            nullable: paramInfo.nullable,
            arrayElementType: paramInfo.arrayElementType,
            arrayElementDeclaredType: paramInfo.arrayElementDeclaredType,
            mapKeyType: paramInfo.mapKeyType,
            mapValueType: paramInfo.mapValueType,
            promiseValueType: paramPromiseValueType,
            setElementType: paramInfo.setElementType,
            functionType: paramInfo.functionType,
            shape: paramInfo.shape
          }

          params.push(resolvedParam)
        }

        return {
          valueType: 'function',
          nullable: false,
          functionType: {
            kind: 'function',
            resolved: true,
            params,
            declaredReturnType: shape.returnType,
            returnType: returnInfo.valueType,
            returnNullable: returnInfo.nullable,
            returnArrayElementType: returnInfo.arrayElementType,
            returnArrayElementDeclaredType: returnInfo.arrayElementDeclaredType,
            returnMapKeyType: returnInfo.mapKeyType,
            returnMapValueType: returnInfo.mapValueType,
            returnPromiseValueType,
            returnSetElementType: returnInfo.setElementType,
            returnShape: returnInfo.shape
          },
          shape: null,
          arrayElementType: null,
          arrayElementDeclaredType: null,
          mapKeyType: null,
          mapValueType: null,
          promiseValueType: null,
          setElementType: null
        }
      }

      if (this.resolvingDeclaredTypes.has(name)) {
        const recursiveInfo = this.unresolvedTypeInfo()
        recursiveInfo.valueType = 'object'

        return recursiveInfo
      }

      this.resolvingDeclaredTypes.add(name)

      try {
        const resolvedShape = this.resolveObjectShape(shape)

        return {
          valueType: 'object',
          nullable: false,
          functionType: null,
          shape: resolvedShape,
          arrayElementType: null,
          arrayElementDeclaredType: null,
          mapKeyType: null,
          mapValueType: null,
          promiseValueType: null,
          setElementType: null
        }
      } finally {
        this.resolvingDeclaredTypes.delete(name)
      }

    }

    this.report('CCJS_UNKNOWN_TYPE', `unknown type ${name}`, loc)

    return {
      valueType: 'unknown',
      nullable: false,
      functionType: null,
      shape: null,
      arrayElementType: null,
      arrayElementDeclaredType: null,
      mapKeyType: null,
      mapValueType: null,
      promiseValueType: null,
      setElementType: null
    }
  }

  resolveUnionDeclaredType(names: string[], loc: SourceLocation): ResolvedTypeInfo {
    const infos: ResolvedTypeInfo[] = []
    const valueTypes: ValueType[] = []

    for (let index = 0; index < names.length; index = index + 1) {
      const info = this.resolveDeclaredType(names[index], loc)
      infos.push(info)
      valueTypes.push(info.valueType)
    }

    const valueType = commonValueType(valueTypes)
    const result = this.unresolvedTypeInfo()

    if (valueType === 'unknown') {
      return result
    }

    result.valueType = valueType
    result.nullable = resolvedTypeListHasNullable(infos)

    if (valueType === 'array') {
      result.arrayElementType = commonResolvedArrayElementType(infos)
    } else if (valueType === 'map') {
      result.mapKeyType = commonResolvedMapKeyType(infos)
      result.mapValueType = commonResolvedMapValueType(infos)
    } else if (valueType === 'promise') {
      result.promiseValueType = commonResolvedPromiseValueType(infos)
    } else if (valueType === 'set') {
      result.setElementType = commonResolvedSetElementType(infos)
    }

    return result
  }

  resolveObjectShape(shape: ObjectShapeInfo): ObjectShapeInfo {
    const bases = this.resolveObjectShapeBases(shape)
    const fields: AnyNode[] = []
    const resolvedFields: AnyNode[] = []

    pushAllNodes(fields, bases.fields)
    pushAllNodes(fields, shape.fields)

    for (const field of fields) {
      const weakField = field.ownership === 'weak' || this.hasWeakOwnershipMarker(fields, field.name)
      let fieldInfo = this.resolveFieldDeclaredType(field)

      if (weakField) {
        fieldInfo = this.resolveWeakTargetShapeFieldType(field)
      }

      let promiseValueType: ValueType | null = null
      const functionType = resolvedFunctionTypeMetadata(fieldInfo.functionType, field.functionType)

      if (fieldInfo.promiseValueType != null) {
        promiseValueType = fieldInfo.promiseValueType
      }

      resolvedFields.push({
        type: field.type,
        name: field.name,
        optional: field.optional,
        readonly: field.readonly,
        ownership: field.ownership,
        weakLoc: field.weakLoc,
        static: field.static,
        staticLoc: field.staticLoc,
        weakTypeValidated: field.weakTypeValidated,
        loc: field.loc,
        declaredType: field.valueType,
        valueType: fieldInfo.valueType,
        nullable: fieldInfo.nullable || weakField || field.optional === true,
        arrayElementType: fieldInfo.arrayElementType,
        arrayElementDeclaredType: fieldInfo.arrayElementDeclaredType,
        mapKeyType: fieldInfo.mapKeyType,
        mapValueType: fieldInfo.mapValueType,
        promiseValueType,
        setElementType: fieldInfo.setElementType,
        functionType,
        shape: fieldInfo.shape
      })
    }

    const resolvedBaseTypes: string[] = []
    const baseTypes = shape.baseTypes

    if (baseTypes != null) {
      for (let index = 0; index < baseTypes.length; index = index + 1) {
        resolvedBaseTypes.push(baseTypes[index])
      }
    }

    const resolvedShape: ObjectShapeInfo = {
      kind: 'object',
      baseTypes: resolvedBaseTypes,
      dynamic: shape.dynamic === true || bases.dynamic,
      fields: resolvedFields
    }

    if (shape.builtin != null) {
      resolvedShape.builtin = shape.builtin
    }

    return resolvedShape
  }

  resolveFunctionTypeMetadata(
    functionType: FunctionTypeMetadata | null | undefined,
    loc: SourceLocation | null | undefined
  ): FunctionTypeMetadata | null {
    if (functionType == null) {
      return null
    }

    let typeLine = 1
    let typeColumn = 1

    if (loc != null) {
      typeLine = loc.line
      typeColumn = loc.column
    }

    const functionTypeLoc = functionType.loc

    if (functionTypeLoc != null) {
      typeLine = functionTypeLoc.line
      typeColumn = functionTypeLoc.column
    }

    const typeLoc: SourceLocation = { line: typeLine, column: typeColumn }
    const returnInfo = this.resolveDeclaredType(functionType.returnType, typeLoc)
    const params: FunctionTypeParamMetadata[] = []
    let returnPromiseValueType: ValueType | null = null

    if (returnInfo.promiseValueType != null) {
      returnPromiseValueType = returnInfo.promiseValueType
    }

    for (const param of functionType.params) {
      const paramInfo = this.resolveDeclaredType(param.valueType, param.loc)
      let paramPromiseValueType: ValueType | null = null

      if (paramInfo.promiseValueType != null) {
        paramPromiseValueType = paramInfo.promiseValueType
      }

      params.push({
        name: param.name,
        loc: param.loc,
        optional: param.optional,
        declaredType: param.valueType,
        valueType: paramInfo.valueType,
        nullable: paramInfo.nullable,
        arrayElementType: paramInfo.arrayElementType,
        arrayElementDeclaredType: paramInfo.arrayElementDeclaredType,
        mapKeyType: paramInfo.mapKeyType,
        mapValueType: paramInfo.mapValueType,
        promiseValueType: paramPromiseValueType,
        setElementType: paramInfo.setElementType,
        functionType: paramInfo.functionType,
        shape: paramInfo.shape
      })
    }

    return {
      kind: 'function',
      resolved: true,
      params,
      declaredReturnType: functionType.returnType,
      returnType: returnInfo.valueType,
      returnNullable: returnInfo.nullable,
      returnArrayElementType: returnInfo.arrayElementType,
      returnArrayElementDeclaredType: returnInfo.arrayElementDeclaredType,
      returnMapKeyType: returnInfo.mapKeyType,
      returnMapValueType: returnInfo.mapValueType,
      returnPromiseValueType,
      returnSetElementType: returnInfo.setElementType,
      returnShape: returnInfo.shape
    }
  }

  resolveObjectShapeBases(shape: ObjectShapeInfo): ObjectShapeBases {
    const fields: AnyNode[] = []
    let dynamic = false

    const baseTypes: string[] = shape?.baseTypes ?? []

    for (const name of baseTypes) {
      const base = this.types.get(name)

      if (base == null || base.kind !== 'object') {
        continue
      }

      const resolved = this.resolveObjectShape(base)

      for (const field of resolved.fields) {
        fields.push(field)
      }

      dynamic = dynamic || resolved.dynamic === true
    }

    return {
      dynamic,
      fields
    }
  }

  resolveFieldDeclaredType(field: AnyNode): ResolvedTypeInfo {
    if (field.ownership === 'weak') {
      return this.resolveWeakFieldDeclaredType(field)
    }

    let declaredType = field.valueType

    if (field.declaredType != null) {
      declaredType = field.declaredType
    }

    return this.resolveDeclaredType(declaredType, field.loc)
  }

  resolveWeakFieldDeclaredType(field: AnyNode): ResolvedTypeInfo {
    let declaredName = field.valueType

    if (field.declaredType != null) {
      declaredName = field.declaredType
    }

    let targetName = declaredName

    if (isNullableTypeName(declaredName)) {
      targetName = nullableTypeNameFromKnownTypeName(declaredName)
    }

    const fieldInfo = this.resolveWeakTargetDeclaredType(targetName, field.loc)

    if (fieldInfo.valueType !== 'unknown' && fieldInfo.valueType !== 'object' && field.weakTypeValidated !== true) {
      let weakLoc = field.loc

      if (field.weakLoc != null) {
        weakLoc = field.weakLoc
      }

      this.report(
        'CCJS_WEAK_TYPE',
        `weak field ${field.name} must target an object or class type in the current compiler slice`,
        weakLoc
      )
    }

    field.weakTypeValidated = true

    fieldInfo.nullable = true

    return fieldInfo
  }

  resolveWeakTargetDeclaredType(name: string | null | undefined, loc: SourceLocation): ResolvedTypeInfo {
    if (name == null || name === 'unknown') {
      return {
        valueType: 'unknown',
        nullable: false,
        functionType: null,
        shape: null,
        arrayElementType: null,
        arrayElementDeclaredType: null,
        mapKeyType: null,
        mapValueType: null,
        promiseValueType: null,
        setElementType: null
      }
    }

    if (name === 'object') {
      return {
        valueType: 'object',
        nullable: false,
        functionType: null,
        shape: null,
        arrayElementType: null,
        arrayElementDeclaredType: null,
        mapKeyType: null,
        mapValueType: null,
        promiseValueType: null,
        setElementType: null
      }
    }

    const shape = this.types.get(name)

    if (shape != null && shape.kind === 'object') {
      return {
        valueType: 'object',
        nullable: false,
        functionType: null,
        shape: this.resolveWeakTargetObjectShape(shape),
        arrayElementType: null,
        arrayElementDeclaredType: null,
        mapKeyType: null,
        mapValueType: null,
        promiseValueType: null,
        setElementType: null
      }
    }

    const classSymbol = this.scope.resolve(name)

    if (this.classNames.has(name) || (classSymbol != null && classSymbol.kind === 'class')) {
      let classShape: ObjectShapeInfo | null = null

      if (classSymbol != null && classSymbol.shape != null) {
        classShape = this.resolveWeakTargetObjectShape(classSymbol.shape)
      }

      return {
        valueType: 'object',
        nullable: false,
        functionType: null,
        shape: classShape,
        arrayElementType: null,
        arrayElementDeclaredType: null,
        mapKeyType: null,
        mapValueType: null,
        promiseValueType: null,
        setElementType: null
      }
    }

    return this.resolveDeclaredType(name, loc)
  }

  resolveWeakTargetObjectShape(shape: ObjectShapeInfo): ObjectShapeInfo {
    const bases = this.resolveObjectShapeBases(shape)
    const fields: AnyNode[] = []
    const resolvedFields: AnyNode[] = []

    pushAllNodes(fields, bases.fields)
    pushAllNodes(fields, shape.fields)

    for (const field of fields) {
      const declared = this.resolveWeakTargetShapeFieldType(field)
      let declaredType = field.valueType
      let promiseValueType: ValueType | null = null
      const functionType = resolvedFunctionTypeMetadata(declared.functionType, field.functionType)

      if (field.declaredType != null) {
        declaredType = field.declaredType
      }

      if (declared.promiseValueType != null) {
        promiseValueType = declared.promiseValueType
      }

      resolvedFields.push({
        type: field.type,
        name: field.name,
        optional: field.optional,
        readonly: field.readonly,
        ownership: field.ownership,
        weakLoc: field.weakLoc,
        static: field.static,
        staticLoc: field.staticLoc,
        weakTypeValidated: field.weakTypeValidated,
        loc: field.loc,
        declaredType,
        valueType: declared.valueType,
        nullable: declared.nullable || field.ownership === 'weak' || field.optional === true,
        arrayElementType: declared.arrayElementType,
        arrayElementDeclaredType: declared.arrayElementDeclaredType,
        mapKeyType: declared.mapKeyType,
        mapValueType: declared.mapValueType,
        promiseValueType,
        setElementType: declared.setElementType,
        functionType,
        shape: null
      })
    }

    const resolvedBaseTypes: string[] = shape?.baseTypes ?? []

    const resolvedShape: ObjectShapeInfo = {
      kind: 'object',
      baseTypes: resolvedBaseTypes,
      dynamic: shape.dynamic === true || bases.dynamic,
      fields: resolvedFields
    }

    if (shape.builtin != null) {
      resolvedShape.builtin = shape.builtin
    }

    return resolvedShape
  }

  resolveWeakTargetShapeFieldType(field: AnyNode): ResolvedTypeInfo {
    let declaredType = field.valueType

    if (field.declaredType != null) {
      declaredType = field.declaredType
    }

    return this.resolveWeakTargetShapeTypeName(declaredType, field.loc)
  }

  resolveWeakTargetShapeTypeName(name: string | null | undefined, loc: SourceLocation): ResolvedTypeInfo {
    if (name == null || name === 'unknown') {
      return this.unresolvedTypeInfo()
    }

    if (isNullableTypeName(name)) {
      const nullableTypeName = nullableTypeNameFromKnownTypeName(name)
      const inner = this.resolveWeakTargetShapeTypeName(nullableTypeName, loc)

      return {
        valueType: inner.valueType,
        nullable: true,
        functionType: inner.functionType,
        shape: inner.shape,
        arrayElementType: inner.arrayElementType,
        arrayElementDeclaredType: inner.arrayElementDeclaredType,
        mapKeyType: inner.mapKeyType,
        mapValueType: inner.mapValueType,
        promiseValueType: inner.promiseValueType,
        setElementType: inner.setElementType
      }
    }

    if (name === 'array') {
      const info = this.unresolvedTypeInfo()
      info.valueType = 'array'
      info.arrayElementType = 'unknown'
      info.arrayElementDeclaredType = null

      return info
    }

    if (isArrayTypeName(name)) {
      const arrayElementTypeName = arrayElementTypeNameFromKnownTypeName(name)
      const elementInfo = this.resolveWeakTargetShapeTypeName(arrayElementTypeName, loc)
      const info = this.unresolvedTypeInfo()
      info.valueType = 'array'
      info.arrayElementType = elementInfo.valueType
      info.arrayElementDeclaredType = arrayElementTypeName

      return info
    }

    const mapTypeNames = mapTypeNamesFromTypeName(name)

    if (name === 'map' || mapTypeNames != null) {
      const info = this.unresolvedTypeInfo()
      info.valueType = 'map'
      info.mapKeyType = 'unknown'
      info.mapValueType = 'unknown'

      if (mapTypeNames != null) {
        const keyInfo = this.resolveWeakTargetShapeTypeName(mapTypeNames.key, loc)
        const valueInfo = this.resolveWeakTargetShapeTypeName(mapTypeNames.value, loc)
        info.mapKeyType = keyInfo.valueType
        info.mapValueType = valueInfo.valueType
      }

      return info
    }

    if (name === 'set') {
      const info = this.unresolvedTypeInfo()
      info.valueType = 'set'
      info.setElementType = 'unknown'

      return info
    }

    if (isSetTypeName(name)) {
      const setElementTypeName = setElementTypeNameFromKnownTypeName(name)
      const elementInfo = this.resolveWeakTargetShapeTypeName(setElementTypeName, loc)
      const info = this.unresolvedTypeInfo()
      info.valueType = 'set'
      info.setElementType = elementInfo.valueType

      return info
    }

    if (isBytesTypeName(name)) {
      const info = this.unresolvedTypeInfo()
      info.valueType = 'bytes'

      return info
    }

    if (isBuiltinValueType(name)) {
      const info = this.unresolvedTypeInfo()
      info.valueType = name

      return info
    }

    const shape = this.types.get(name)
    const symbol = this.scope.resolve(name)

    if (
      (shape != null && shape.kind === 'object') ||
      this.classNames.has(name) ||
      (symbol != null && symbol.kind === 'class')
    ) {
      const info = this.unresolvedTypeInfo()
      info.valueType = 'object'

      return info
    }

    return this.resolveDeclaredType(name, loc)
  }

  unresolvedTypeInfo(): ResolvedTypeInfo {
    return {
      valueType: 'unknown',
      nullable: false,
      functionType: null,
      shape: null,
      arrayElementType: null,
      arrayElementDeclaredType: null,
      mapKeyType: null,
      mapValueType: null,
      promiseValueType: null,
      setElementType: null
    }
  }

  resolveExpressionArrayElementType(expression: AnyNode | null | undefined): ValueType | null {
    if (expression == null) {
      return null
    }

    if (expression.type === 'ArrayLiteral') {
      if (expression.arrayElementType != null) {
        return expression.arrayElementType
      }

      return null
    }

    if (expression.type === 'CallExpression') {
      if (expression.arrayElementType != null) {
        return expression.arrayElementType
      }

      return null
    }

    if (expression.type === 'AwaitExpression') {
      if (expression.arrayElementType != null) {
        return expression.arrayElementType
      }

      return null
    }

    if (expression.type === 'Reference' && expression.path.length === 1) {
      const name = firstPathSegment(expression.path)
      const symbol = this.scope.resolve(name)

      if (symbol != null && symbol.arrayElementType != null) {
        return symbol.arrayElementType
      }

      return null
    }

    if (expression.type === 'MemberExpression') {
      const shape = this.resolveExpressionShape(expression.object)
      let field: AnyNode | null = null

      if (shape != null) {
        field = this.findShapeField(shape, expression.property)
      }

      if (field != null && field.arrayElementType != null) {
        return field.arrayElementType
      }

      return null
    }

    if (expression.type === 'IndexExpression' && expression.index.type === 'StringLiteral') {
      const shape = this.resolveExpressionShape(expression.object)
      let field: AnyNode | null = null

      if (shape != null) {
        field = this.findShapeField(shape, expression.index.value)
      }

      if (field != null && field.arrayElementType != null) {
        return field.arrayElementType
      }

      return null
    }

    return null
  }

  resolveExpressionArrayElementDeclaredType(expression: AnyNode | null | undefined): string | null {
    if (expression == null) {
      return null
    }

    if (expression.type === 'ArrayLiteral' || expression.type === 'CallExpression') {
      if (expression.arrayElementDeclaredType != null) {
        return expression.arrayElementDeclaredType
      }

      if (expression.arrayElementType != null) {
        return expression.arrayElementType
      }

      return null
    }

    if (expression.type === 'AwaitExpression') {
      if (expression.arrayElementDeclaredType != null) {
        return expression.arrayElementDeclaredType
      }

      if (expression.arrayElementType != null) {
        return expression.arrayElementType
      }

      return null
    }

    if (expression.type === 'Reference' && expression.path.length === 1) {
      const name = firstPathSegment(expression.path)
      const symbol = this.scope.resolve(name)

      if (symbol != null && symbol.arrayElementDeclaredType != null) {
        return symbol.arrayElementDeclaredType
      }

      if (symbol != null && symbol.arrayElementType != null) {
        return symbol.arrayElementType
      }

      return null
    }

    if (expression.type === 'MemberExpression') {
      const shape = this.resolveExpressionShape(expression.object)
      let field: AnyNode | null = null

      if (shape != null) {
        field = this.findShapeField(shape, expression.property)
      }

      if (field != null && field.arrayElementDeclaredType != null) {
        return field.arrayElementDeclaredType
      }

      if (field != null && field.arrayElementType != null) {
        return field.arrayElementType
      }

      return null
    }

    if (expression.type === 'IndexExpression' && expression.index.type === 'StringLiteral') {
      const shape = this.resolveExpressionShape(expression.object)
      let field: AnyNode | null = null

      if (shape != null) {
        field = this.findShapeField(shape, expression.index.value)
      }

      if (field != null && field.arrayElementDeclaredType != null) {
        return field.arrayElementDeclaredType
      }

      if (field != null && field.arrayElementType != null) {
        return field.arrayElementType
      }

      return null
    }

    return null
  }

  resolveExpressionMapType(expression: AnyNode | null | undefined): CheckerMapType | null {
    if (expression == null) {
      return null
    }

    if (expression.type === 'CallExpression' || expression.type === 'NewExpression') {
      if (expression.valueType === 'map') {
        let key: ValueType | null = null
        let value: ValueType | null = null

        if (expression.mapKeyType != null) {
          key = expression.mapKeyType
        }

        if (expression.mapValueType != null) {
          value = expression.mapValueType
        }

        return {
          key,
          value
        }
      }

      return null
    }

    if (expression.type === 'Reference' && expression.path.length === 1) {
      const name = firstPathSegment(expression.path)
      const symbol = this.scope.resolve(name)

      if (symbol != null && symbol.valueType === 'map') {
        let key: ValueType | null = null
        let value: ValueType | null = null

        if (symbol.mapKeyType != null) {
          key = symbol.mapKeyType
        }

        if (symbol.mapValueType != null) {
          value = symbol.mapValueType
        }

        return {
          key,
          value
        }
      }

      return null
    }

    if (expression.type === 'MemberExpression') {
      const shape = this.resolveExpressionShape(expression.object)
      let field: AnyNode | null = null

      if (shape != null) {
        field = this.findShapeField(shape, expression.property)
      }

      if (field != null && field.valueType === 'map') {
        let key: ValueType | null = null
        let value: ValueType | null = null

        if (field.mapKeyType != null) {
          key = field.mapKeyType
        }

        if (field.mapValueType != null) {
          value = field.mapValueType
        }

        return {
          key,
          value
        }
      }

      return null
    }

    if (expression.type === 'IndexExpression' && expression.index.type === 'StringLiteral') {
      const shape = this.resolveExpressionShape(expression.object)
      let field: AnyNode | null = null

      if (shape != null) {
        field = this.findShapeField(shape, expression.index.value)
      }

      if (field != null && field.valueType === 'map') {
        let key: ValueType | null = null
        let value: ValueType | null = null

        if (field.mapKeyType != null) {
          key = field.mapKeyType
        }

        if (field.mapValueType != null) {
          value = field.mapValueType
        }

        return {
          key,
          value
        }
      }

      return null
    }

    return null
  }

  resolveExpressionSetElementType(expression: AnyNode | null | undefined): ValueType | null {
    if (expression == null) {
      return null
    }

    if (expression.type === 'CallExpression' || expression.type === 'NewExpression') {
      if (expression.valueType === 'set' && expression.setElementType != null) {
        return expression.setElementType
      }

      return null
    }

    if (expression.type === 'Reference' && expression.path.length === 1) {
      const name = firstPathSegment(expression.path)
      const symbol = this.scope.resolve(name)

      if (symbol != null && symbol.valueType === 'set' && symbol.setElementType != null) {
        return symbol.setElementType
      }

      return null
    }

    if (expression.type === 'MemberExpression') {
      const shape = this.resolveExpressionShape(expression.object)
      let field: AnyNode | null = null

      if (shape != null) {
        field = this.findShapeField(shape, expression.property)
      }

      if (field != null && field.valueType === 'set' && field.setElementType != null) {
        return field.setElementType
      }

      return null
    }

    if (expression.type === 'IndexExpression' && expression.index.type === 'StringLiteral') {
      const shape = this.resolveExpressionShape(expression.object)
      let field: AnyNode | null = null

      if (shape != null) {
        field = this.findShapeField(shape, expression.index.value)
      }

      if (field != null && field.valueType === 'set' && field.setElementType != null) {
        return field.setElementType
      }

      return null
    }

    return null
  }

  resolveExpressionPromiseValueType(expression: AnyNode | null | undefined): ValueType | null {
    if (expression == null) {
      return null
    }

    if (expression.type === 'CallExpression' || expression.type === 'NewExpression') {
      if (expression.valueType === 'promise' && expression.promiseValueType != null) {
        return expression.promiseValueType
      }

      return null
    }

    if (expression.type === 'Reference' && expression.path.length === 1) {
      const name = firstPathSegment(expression.path)
      const symbol = this.scope.resolve(name)

      if (symbol != null && symbol.valueType === 'promise' && symbol.promiseValueType != null) {
        return symbol.promiseValueType
      }

      return null
    }

    if (expression.type === 'MemberExpression') {
      const shape = this.resolveExpressionShape(expression.object)
      let field: AnyNode | null = null

      if (shape != null) {
        field = this.findShapeField(shape, expression.property)
      }

      if (field != null && field.valueType === 'promise' && field.promiseValueType != null) {
        return field.promiseValueType
      }

      return null
    }

    if (expression.type === 'IndexExpression' && expression.index.type === 'StringLiteral') {
      const shape = this.resolveExpressionShape(expression.object)
      let field: AnyNode | null = null

      if (shape != null) {
        field = this.findShapeField(shape, expression.index.value)
      }

      if (field != null && field.valueType === 'promise' && field.promiseValueType != null) {
        return field.promiseValueType
      }

      return null
    }

    return null
  }

  declare(name: string, symbol: SymbolInfo, loc: SourceLocation): void {
    if (this.scope.hasOwn(name)) {
      this.report('CCJS_REDECLARED_NAME', `name ${name} is already declared in this scope`, loc)
      return
    }

    this.scope.bindings.set(name, symbol)
    this.narrowedNullableNames.delete(name)
  }

  withScope(callback: Function): void {
    const previous = this.scope
    const previousNarrowedNullableNames = this.narrowedNullableNames
    this.scope = new Scope(previous)
    this.narrowedNullableNames = cloneStringSet(previousNarrowedNullableNames)

    try {
      callback()
    } finally {
      this.scope = previous
      this.narrowedNullableNames = previousNarrowedNullableNames
    }
  }

  withReturnContext(
    returnType: ValueType,
    returnNullable: boolean,
    returnPromiseValueType: ValueType | null,
    callback: Function
  ): void {
    const previousReturnType = this.currentReturnType
    const previousReturnNullable = this.currentReturnNullable
    const previousReturnPromiseValueType = this.currentReturnPromiseValueType
    const previousReturnAsync = this.currentReturnAsync

    try {
      this.currentReturnType = returnType
      this.currentReturnNullable = returnNullable
      this.currentReturnPromiseValueType = returnPromiseValueType
      this.currentReturnAsync = false
      callback()
    } finally {
      this.currentReturnType = previousReturnType
      this.currentReturnNullable = previousReturnNullable
      this.currentReturnPromiseValueType = previousReturnPromiseValueType
      this.currentReturnAsync = previousReturnAsync
    }
  }

  withBreakable(callback: Function): void {
    this.breakDepth = this.breakDepth + 1

    try {
      callback()
    } finally {
      this.breakDepth = this.breakDepth - 1
    }
  }

  withLoop(callback: Function): void {
    this.breakDepth = this.breakDepth + 1
    this.continueDepth = this.continueDepth + 1

    try {
      callback()
    } finally {
      this.continueDepth = this.continueDepth - 1
      this.breakDepth = this.breakDepth - 1
    }
  }

  checkAssignableType(
    actual: ValueType | null | undefined,
    expected: ValueType | null | undefined,
    loc: SourceLocation,
    expectedNullable?: boolean,
    actualNullable?: boolean
  ): void {
    const expectedAllowsNull = expectedNullable === true
    const actualCanBeNull = actualNullable === true

    if (!isAssignableType(actual, expected, expectedAllowsNull, actualCanBeNull)) {
      let actualLabel = actual

      if (actualCanBeNull && actual !== 'null' && actual !== 'unknown' && actual != null) {
        actualLabel = `${actual} | null`
      }

      this.report('CCJS_TYPE_MISMATCH', `cannot assign ${actualLabel} to ${expected}`, loc)
    }
  }

  report(code: string, message: string, loc: SourceLocation): void {
    this.diagnostics.push(diagnostic(code, message, loc))
  }
}

function joinStrings(values: readonly string[], separator: string): string {
  let result = ''

  for (let index = 0; index < values.length; index = index + 1) {
    if (index > 0) {
      result = result + separator
    }

    result = result + values[index]
  }

  return result
}

function pushAllNodes(target: AnyNode[], source: AnyNode[]): void {
  for (let index = 0; index < source.length; index = index + 1) {
    target.push(source[index])
  }
}

function startsWithHttpsScheme(value: string): boolean {
  if (value.length < 8) {
    return false
  }

  return (
    asciiLowerCharCode(value, 0) === 104 &&
    asciiLowerCharCode(value, 1) === 116 &&
    asciiLowerCharCode(value, 2) === 116 &&
    asciiLowerCharCode(value, 3) === 112 &&
    asciiLowerCharCode(value, 4) === 115 &&
    value.charCodeAt(5) === 58 &&
    value.charCodeAt(6) === 47 &&
    value.charCodeAt(7) === 47
  )
}

function asciiLowerCharCode(value: string, index: number): number {
  const code = value.charCodeAt(index)

  if (code >= 65 && code <= 90) {
    return code + 32
  }

  return code
}

function isStringTrimMethod(method: string | null): boolean {
  return (
    method === 'trim' ||
    method === 'trimEnd' ||
    method === 'trimLeft' ||
    method === 'trimRight' ||
    method === 'trimStart'
  )
}

function stringPredicateArgCountMessage(method: string, actual: number): string {
  if (method === 'includes') {
    return `string.includes expects 1 or 2 argument(s), got ${actual}`
  }

  return `string.${method} expects 1 argument(s), got ${actual}`
}

function isPromiseMethod(name: string): boolean {
  return name === 'catch' || name === 'then'
}

function promiseExecutorFunctionType(): AnyNode {
  return {
    kind: 'function',
    params: [
      {
        name: 'resolve',
        valueType: 'function',
        functionType: promiseSettlementFunctionType()
      },
      {
        name: 'reject',
        valueType: 'function',
        functionType: promiseSettlementFunctionType()
      }
    ],
    returnType: 'void',
    returnNullable: false
  }
}

function promiseSettlementFunctionType(): AnyNode {
  return {
    kind: 'function',
    params: [
      {
        name: 'value',
        loc: { line: 1, column: 1 },
        optional: true,
        valueType: 'unknown'
      }
    ],
    returnType: 'void',
    returnNullable: false
  }
}

function promiseStaticMethodName(callee: AnyNode): string | null {
  if (callee.type !== 'MemberExpression') {
    return null
  }

  if (callee.property !== 'resolve' && callee.property !== 'reject') {
    return null
  }

  if (callee.object.type !== 'Reference') {
    return null
  }

  if (callee.object.path.length !== 1) {
    return null
  }

  if (firstPathSegment(callee.object.path) !== 'Promise') {
    return null
  }

  return callee.property
}
