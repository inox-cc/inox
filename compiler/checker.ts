import {
  binaryConstructorName,
  binaryInstanceRuntimeMethodName,
  binaryStaticRuntimeMethodName,
  bufferRuntimeConstantName,
  childProcessRuntimeCallInfo,
  checkCryptoCall as checkPackageCryptoCall,
  checkCryptoHashMethodCall as checkPackageCryptoHashMethodCall,
  cryptoRuntimeCallInfo,
  fsRuntimeCallInfo,
  fsRuntimeCallInfoFromImportSymbol,
  fsRuntimeCallPlan,
  fsRuntimeConstantName,
  fsStatsRuntimeMethodInfo,
  isFsPromisesImportSymbol,
  isFsRuntimeRootSymbol,
  isOsRuntimeConstantImport,
  isPathRuntimeConstantImport,
  isTimerHandleMethod,
  isTimerRuntimeImportSymbol,
  isUrlMutableObjectField,
  isUrlSearchParamsRuntimeMethod,
  nodeStdlibRuntimeObjectInfo,
  osRuntimeCallInfo,
  osRuntimeConstantName,
  pathRuntimeCallInfo,
  pathRuntimeConstantName,
  processRuntimeAssignmentProperty,
  processRuntimeCallInfo,
  processRuntimeIndexProperty,
  processRuntimeMemberInfo,
  processRuntimePropertyImportInfo,
  timerCallbackFunctionType,
  timerClearMethodName,
  timerRuntimeImportMethodName,
  timerRuntimeMethodName,
  unsupportedBufferRuntimeExport,
  unsupportedEventsRuntimeExport,
  unsupportedStreamRuntimeExport,
  urlRuntimeCallInfo,
  urlRuntimeConstructorImportInfo
} from './stdlib/node/checker.ts'
import type {
  CryptoCheckerContext,
  CryptoCheckerDiagnostic,
  CryptoHashMethodCheckerContext,
  FsBooleanOptions,
  FsRuntimeArgumentCheck,
  FsRuntimeCallInfo
} from './stdlib/node/checker.ts'
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
  builtinGlobalSymbol,
  errorObjectShape,
  fetchAbortControllerObjectShape,
  fsDirentObjectShape,
  libuvOnlyRuntimeImportFeature,
  urlObjectShape,
  urlSearchParamsObjectShape
} from './checker/builtins.ts'
import {
  fetchAbortControllerConstructorName,
  fetchAbortControllerRuntimeMethod,
  fetchHeadersRuntimeMethodName,
  fetchResponseBodyMethodInfo,
  fetchRuntimeCallName,
  isJsonParseDeclaredType,
  isFetchUnsupportedResponseBodyMember,
  isSupportedFetchRedirectLiteral,
  jsonRuntimeMethodName
} from '../stdlib/global/compiler/checker.ts'
import {
  checkChildProcessCall as checkChildProcessCallInContext
} from './checker/child-process-calls.ts'
import type {
  CheckedChildProcessArgsInfo,
  CheckedChildProcessCallInfo,
  CheckedChildProcessEnvPropertyInfo,
  CheckedChildProcessOptionInfo,
  CheckedChildProcessOptionsInfo,
  CheckedChildProcessValueInfo,
  ChildProcessCallCheckerContext
} from './checker/child-process-calls.ts'
import { applyCallableSymbolCall as applyCallableSymbolCallInContext } from './checker/callable-symbols.ts'
import type { CallableSymbolCheckerContext } from './checker/callable-symbols.ts'
import { runtimeImportValueType } from './stdlib/node/runtime-imports.ts'
import {
  dateInstanceRuntimeMethodInfo,
  isDateConstructorRuntimeExpression,
  timeRuntimeCallInfo
} from '../stdlib/global/compiler/checker.ts'
import { diagnostic, throwDiagnostics } from './diagnostics.ts'
import {
  cloneResolvedTypeInfo as cloneResolvedTypeInfoInContext,
  declareTypeAlias as declareTypeAliasInContext,
  resolveDeclaredType as resolveDeclaredTypeInContext,
  resolveFieldDeclaredType as resolveFieldDeclaredTypeInContext,
  resolveFunctionTypeMetadata as resolveFunctionTypeMetadataInContext,
  resolveObjectShape as resolveObjectShapeInContext,
  resolveObjectShapeBases as resolveObjectShapeBasesInContext,
  resolveObjectShapeField as resolveObjectShapeFieldInContext,
  resolveUnionDeclaredType as resolveUnionDeclaredTypeInContext,
  resolveWeakFieldDeclaredType as resolveWeakFieldDeclaredTypeInContext,
  resolveWeakTargetDeclaredType as resolveWeakTargetDeclaredTypeInContext,
  resolveWeakTargetObjectShape as resolveWeakTargetObjectShapeInContext,
  resolveWeakTargetShapeFieldType as resolveWeakTargetShapeFieldTypeInContext,
  resolveWeakTargetShapeTypeName as resolveWeakTargetShapeTypeNameInContext,
  unresolvedTypeInfo as unresolvedTypeInfoInContext
} from './checker/declared-types.ts'
import type { DeclaredTypeResolverContext } from './checker/declared-types.ts'
import {
  classPrototypeAccessObject,
  collectClassConstructorFieldAssignments,
  isThisExpression as isThisExpressionNode,
  resolveClassConstructorFieldType as resolveClassConstructorFieldInitializerType
} from './checker/class-helpers.ts'
import {
  applyFsRuntimeCallPlan,
  callExpressionArgumentLabel,
  createArrowFunctionTypeMetadata,
  createMapEntryShape,
  knownCheckedExpressionType,
  resolveExpressionPromiseRejectionValueType,
  resolveMapEntryArrayType
} from './checker/expression-helpers.ts'
import { checkFsCall as checkFsCallInContext } from './checker/fs-calls.ts'
import type {
  CheckedFsArgInfo,
  CheckedFsCallInfo,
  CheckedFsIndexedArgInfo,
  CheckedFsObjectPropertyInfo,
  FsCallCheckerContext
} from './checker/fs-calls.ts'
import {
  checkFetchAbortControllerMethodCall as checkFetchAbortControllerMethodCallInContext,
  checkFetchCall as checkFetchCallInContext,
  checkFetchHeadersMethodCall as checkFetchHeadersMethodCallInContext,
  checkFetchResponseMethodCall as checkFetchResponseMethodCallInContext,
  checkFetchUnsupportedResponseBodyMember as checkFetchUnsupportedResponseBodyMemberInContext
} from './checker/fetch-calls.ts'
import type {
  CheckedFetchHeaderInfo,
  CheckedFetchInitInfo,
  CheckedFetchInitPropertyInfo,
  CheckedFetchReceiverInfo,
  FetchCallCheckerContext
} from './checker/fetch-calls.ts'
import {
  checkArrayIsArrayCall as checkArrayIsArrayCallInContext,
  checkConsoleCall as checkConsoleCallInContext,
  checkDebugMemoryCall as checkDebugMemoryCallInContext,
  checkMathCall as checkMathCallInContext,
  checkObjectStaticCall as checkObjectStaticCallInContext,
  isMathCall as isMathCallInContext,
  isObjectStaticCall as isObjectStaticCallInContext
} from './checker/global-calls.ts'
import type {
  CheckedCallArgInfo,
  GlobalCallCheckerContext
} from './checker/global-calls.ts'
import {
  checkOsCall as checkOsCallInContext,
  checkPathCall as checkPathCallInContext,
  checkProcessCall as checkProcessCallInContext,
  checkUrlCall as checkUrlCallInContext,
  checkUrlSearchParamsMethodCall as checkUrlSearchParamsMethodCallInContext
} from './checker/node-runtime-calls.ts'
import type { NodeRuntimeCallCheckerContext } from './checker/node-runtime-calls.ts'
import {
  checkDateConstructorExpression as checkDateConstructorExpressionInContext,
  checkDateInstanceMethodCall as checkDateInstanceMethodCallInContext,
  checkTimeCall as checkTimeCallInContext
} from './checker/time-calls.ts'
import type { TimeCallCheckerContext } from './checker/time-calls.ts'
import { checkTimerCall as checkTimerCallInContext } from './checker/timer-calls.ts'
import type {
  CheckedTimerArgInfo,
  CheckedTimerCallInfo,
  CheckedTimerCallbackInfo,
  TimerCallCheckerContext
} from './checker/timer-calls.ts'
import {
  findShapeField as findShapeFieldInContext,
  isErrorObjectExpression as isErrorObjectExpressionInContext,
  resolveArrayElementObjectShape as resolveArrayElementObjectShapeInContext,
  resolveArrayIterableElementShape as resolveArrayIterableElementShapeInContext,
  resolveExpressionArrayElementDeclaredType as resolveExpressionArrayElementDeclaredTypeInContext,
  resolveExpressionArrayElementFunctionType as resolveExpressionArrayElementFunctionTypeInContext,
  resolveExpressionArrayElementType as resolveExpressionArrayElementTypeInContext,
  resolveExpressionShape as resolveExpressionShapeInContext,
  resolveExpressionMapType as resolveExpressionMapTypeInContext,
  resolveExpressionPromiseValueType as resolveExpressionPromiseValueTypeInContext,
  resolveExpressionSetElementType as resolveExpressionSetElementTypeInContext,
  resolveRejectedExpressionValueType as resolveRejectedExpressionValueTypeInContext
} from './checker/expression-metadata.ts'
import {
  checkArrayFromCall as checkArrayFromCallInContext,
  checkNumberConversionCall as checkNumberConversionCallInContext,
  checkNumberToStringCall as checkNumberToStringCallInContext,
  checkNumericCastCall as checkNumericCastCallInContext,
  checkRegExpFlags as checkRegExpFlagsInContext,
  checkRegExpLiteral as checkRegExpLiteralInContext,
  checkRegExpTestCall as checkRegExpTestCallInContext,
  checkStringCaseCall as checkStringCaseCallInContext,
  checkStringCharCodeAtCall as checkStringCharCodeAtCallInContext,
  checkStringConversionCall as checkStringConversionCallInContext,
  checkStringIndexCall as checkStringIndexCallInContext,
  checkStringPadStartCall as checkStringPadStartCallInContext,
  checkStringPredicateCall as checkStringPredicateCallInContext,
  checkStringSliceCall as checkStringSliceCallInContext,
  checkStringSplitCall as checkStringSplitCallInContext,
  checkStringTrimCall as checkStringTrimCallInContext,
  isArrayFromCall,
  isNumberConversionCall,
  isNumberToStringCall,
  isRegExpTestCall,
  isStringCaseCall,
  isStringCharCodeAtCall,
  isStringConversionCall,
  isStringPadStartCall,
  isStringPredicateCall,
  numericCastName,
  stringIndexMethodName,
  stringSliceMethodName,
  stringSplitMethodName,
  stringTrimMethodName
} from './checker/primitive-calls.ts'
import type { PrimitiveCallCheckerContext } from './checker/primitive-calls.ts'
import {
  acceptsArgumentCount,
  argumentCountMessage,
  argumentParamValueType,
  findClassConstructorMethod,
  intersectNames,
  isConditionValueType,
  isConsoleMethod,
  isNonNullNarrowingLiteral,
  isPromiseMethod,
  isRelativeImportSource,
  isRuntimeNullableType,
  isStatementExpressionNode,
  paramForArgument,
  promiseExecutorFunctionType,
  promiseStaticMethodName,
  resolveSingleReturnExpression,
  resolveTerminalReturnExpression,
  statementAlwaysExits,
  uniqueNames
} from './checker/helpers.ts'
import { inferJsonParseLiteralType } from './checker/json-literals.ts'
import { ownershipCycleDiagnostics } from './checker/ownership.ts'
import { memberExpressionPath } from './member-paths.ts'
import {
  collectionConstructorNameFromPath,
  isArrayMethod,
  mapRuntimeMethodName,
  setRuntimeMethodName
} from '../stdlib/global/compiler/descriptor.ts'
import type { StdlibModuleId } from './stdlib/node/modules.ts'
import {
  isStdlibModuleImportSource,
  isStdlibModuleImportSourceForId,
  isStdlibModuleRuntimeImportBinding
} from './stdlib/node/modules.ts'
import {
  isUnsupportedRuntimeBuiltinImportSource,
  unsupportedRuntimeBuiltinImportMessageFromKnownSource
} from './stdlib/node/builtins.ts'
import {
  isBuiltinValueType,
  isNullableTypeName,
  nullableTypeNameFromKnownTypeName
} from './type-names.ts'
import type {
  AnyNode,
  CompileOptions,
  Diagnostic,
  ObjectShapeInfo,
  ProgramNode,
  SourceLocation,
  SymbolInfo,
  TypeAliasInfo,
  ValueType
} from './types.ts'

import {
  anyNodeLocObjectShape,
  checkerNodeAt,
  cloneStringSet,
  commonExpressionFunctionType,
  conditionalExpressionValueType,
  deleteNullableNarrowingKey,
  firstPathSegment,
  isAnyNodeChildFieldName,
  isOptionalChainProtectedExpression,
  isOptionalParam,
  isUnsupportedEqualityOperator,
  nodeDeclaredTypeOrValueType,
  nodeNameEquals,
  nodeValueTypeOrUnknown,
  nullableNarrowingKey,
  resolvedConcreteValueTypeMetadata,
  resolvedFieldNullableMetadata,
  resolvedFunctionTypeMetadata,
  resolvedObjectShapeMetadata,
  resolvedStringMetadata,
  resolvedValueTypeMetadata
} from './checker/resolved-types.ts'
import type {
  CheckProgramResult,
  CheckerMapType,
  CheckerNode,
  CheckerObjectPropertyNode,
  FunctionTypeMetadata,
  FunctionTypeParamMetadata,
  NullableConditionNarrowing,
  NullableNode,
  ObjectShapeBases,
  OptionalParamInfo,
  PromiseCallbackParamMetadata,
  ResolvedTypeInfo,
  RuntimeCallInfo,
  TypeAliasDeclarationNode
} from './checker/resolved-types.ts'
import type { ExpressionMetadataResolverContext } from './checker/expression-metadata.ts'

class CheckerScope {
  parent: CheckerScope | null
  bindings: Map<string, SymbolInfo>

  constructor(parent: CheckerScope | null) {
    this.parent = parent
    this.bindings = new Map()
  }

  hasOwn(name: string): boolean {
    return this.bindings.has(name)
  }

  resolve(name: string): SymbolInfo | null {
    const local = this.bindings.get(name)

    if (local !== null && typeof local !== 'undefined') {
      return local
    }

    let current = this.parent

    while (current !== null && typeof current !== 'undefined') {
      const found = current.bindings.get(name)

      if (found !== null && typeof found !== 'undefined') {
        return found
      }

      current = current.parent
    }

    return null
  }

  collectBindings(target: Map<string, SymbolInfo>[]): void {
    target.push(this.bindings)

    let current = this.parent

    while (current !== null && typeof current !== 'undefined') {
      target.push(current.bindings)
      current = current.parent
    }
  }
}

type CheckerScopeState = {
  scope: CheckerScope
  narrowedNullableNames: Set<string>
}

type CheckerNarrowingState = {
  narrowedNullableNames: Set<string>
}

type CheckerReturnContextState = {
  returnType: ValueType
  returnNullable: boolean
  returnPromiseValueType: ValueType | null
  returnAsync: boolean
}

type CheckerLoopDepthState = {
  breakDepth: number
  continueDepth: number
}

export function checkProgram(program: ProgramNode, options: CompileOptions = {}): CheckProgramResult {
  const checker = new Checker(program, options)
  checker.check()

  return {
    ast: program
  }
}

function importSpecifierValueType(specifier: AnyNode, source: string): ValueType {
  const valueType = specifier.valueType

  if (typeof valueType !== 'string') {
    return runtimeImportValueType(source, specifier.imported)
  }

  if (valueType === '') {
    return runtimeImportValueType(source, specifier.imported)
  }

  return valueType.slice(0)
}

class Checker {
  program: ProgramNode
  options: CompileOptions
  diagnostics: Diagnostic[]
  scope: CheckerScope
  types: Map<string, TypeAliasInfo>
  typeSymbols: Map<string, SymbolInfo>
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
  resolvedDeclaredTypes: Map<string, ResolvedTypeInfo>
  resolvingDeclaredTypes: Set<string>

  constructor(program: ProgramNode, options: CompileOptions = {}) {
    this.program = program
    this.options = options
    this.diagnostics = []
    this.scope = new CheckerScope(null)
    this.types = new Map()
    this.typeSymbols = new Map()
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
    this.resolvedDeclaredTypes = new Map()
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
        this.declareTypeAlias(item as TypeAliasDeclarationNode)
      } else if (item.type === 'ClassDeclaration') {
        this.classNames.add(item.name)
      }
    }

    const ownershipDiagnostics = ownershipCycleDiagnostics(this.classNames, this.program, this.types)

    for (const item of ownershipDiagnostics) {
      this.diagnostics.push(item)
    }

    throwDiagnostics(this.diagnostics)

    for (let index = 0; index < this.program.body.length; index = index + 1) {
      const item = checkerNodeAt(this.program.body, index)

      if (item.type === 'ImportDeclaration') {
        if (item.typeOnly) {
          continue
        }

        for (let specifierIndex = 0; specifierIndex < item.specifiers.length; specifierIndex = specifierIndex + 1) {
          const specifier = checkerNodeAt(item.specifiers, specifierIndex)
          const symbol: SymbolInfo = {
            kind: 'import',
            mutable: false,
            valueType: importSpecifierValueType(specifier, item.source),
            importedName: specifier.imported,
            importSource: item.source,
            loc: specifier.loc
          }

          this.applyImportSpecifierValueMetadata(symbol, specifier)

          if (specifier.returnType !== null && typeof specifier.returnType !== 'undefined') {
            symbol.valueType = 'function'
            symbol.params = specifier.params ?? []
            symbol.returnType = specifier.returnType
            symbol.returnNullable = specifier.returnNullable === true
            symbol.returnArrayElementType = specifier.returnArrayElementType ?? null
            symbol.returnArrayElementDeclaredType = specifier.returnArrayElementDeclaredType ?? null
            symbol.returnMapKeyType = specifier.returnMapKeyType ?? null
            symbol.returnMapValueType = specifier.returnMapValueType ?? null
            symbol.returnPromiseValueType = specifier.returnPromiseValueType ?? null
            symbol.returnSetElementType = specifier.returnSetElementType ?? null
            symbol.returnShape = specifier.returnShape ?? null
            symbol.async = specifier.async === true
          }

          this.declare(specifier.local, symbol, specifier.loc)
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
        const constructorMethod = findClassConstructorMethod(item)
        let constructorParams: AnyNode[] = []

        if (constructorMethod !== null && typeof constructorMethod !== 'undefined') {
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

  applyImportSpecifierValueMetadata(symbol: SymbolInfo, specifier: AnyNode): void {
    const declaredType = specifier.declaredType

    if (typeof declaredType === 'string' && declaredType !== '') {
      this.applyResolvedTypeInfoToSymbol(symbol, this.resolveDeclaredType(declaredType, specifier.loc))
      return
    }

    symbol.arrayElementType = specifier.arrayElementType ?? symbol.arrayElementType ?? null
    symbol.arrayElementDeclaredType = specifier.arrayElementDeclaredType ?? symbol.arrayElementDeclaredType ?? null
    symbol.mapKeyType = specifier.mapKeyType ?? symbol.mapKeyType ?? null
    symbol.mapValueType = specifier.mapValueType ?? symbol.mapValueType ?? null
    symbol.promiseValueType = specifier.promiseValueType ?? symbol.promiseValueType ?? null
    symbol.setElementType = specifier.setElementType ?? symbol.setElementType ?? null
    symbol.shape = specifier.shape ?? symbol.shape ?? null
  }

  applyResolvedTypeInfoToSymbol(symbol: SymbolInfo, info: ResolvedTypeInfo): void {
    symbol.valueType = info.valueType
    symbol.nullable = info.nullable
    symbol.arrayElementType = info.arrayElementType
    symbol.arrayElementDeclaredType = info.arrayElementDeclaredType
    symbol.mapKeyType = info.mapKeyType
    symbol.mapValueType = info.mapValueType
    symbol.mapValueShape = info.mapValueShape
    symbol.promiseValueType = info.promiseValueType
    symbol.setElementType = info.setElementType
    symbol.functionType = info.functionType
    symbol.shape = info.shape
  }

  resolveParams(params: AnyNode[]): FunctionTypeParamMetadata[] {
    const resolved: FunctionTypeParamMetadata[] = []

    for (let index = 0; index < params.length; index = index + 1) {
      const param = params[index]
      resolved.push(this.resolveParam(param))
    }

    return resolved
  }

  resolveParam(param: AnyNode): FunctionTypeParamMetadata {
    const declaredType = nodeDeclaredTypeOrValueType(param)

    const paramInfo = this.resolveDeclaredType(declaredType, param.loc)
    let promiseValueType: ValueType | null = null

    if (paramInfo.promiseValueType !== null && typeof paramInfo.promiseValueType !== 'undefined') {
      promiseValueType = paramInfo.promiseValueType
    }

    const resolvedParam: FunctionTypeParamMetadata = {
      name: param.name,
      loc: param.loc,
      declaredType,
      optional: isOptionalParam(param),
      rest: param.rest === true,
      className: this.declaredClassName(declaredType),
      valueType: paramInfo.valueType,
      nullable: paramInfo.nullable,
      arrayElementType: paramInfo.arrayElementType,
      arrayElementDeclaredType: paramInfo.arrayElementDeclaredType,
      mapKeyType: paramInfo.mapKeyType,
      mapValueType: paramInfo.mapValueType,
      mapValueShape: paramInfo.mapValueShape,
      promiseValueType,
      setElementType: paramInfo.setElementType,
      functionType: paramInfo.functionType,
      shape: paramInfo.shape
    }

    if (param.defaultValue !== null && typeof param.defaultValue !== 'undefined') {
      resolvedParam.defaultValue = param.defaultValue
    }

    return resolvedParam
  }

  resolveClassInstanceShape(statement: AnyNode, constructorParams: AnyNode[]): ObjectShapeInfo {
    if (statement.fields !== null && typeof statement.fields !== 'undefined' && statement.fields.length > 0) {
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
    const constructorMethod = findClassConstructorMethod(statement)

    const assignments = collectClassConstructorFieldAssignments(constructorMethod)

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
    const declaredType = nodeDeclaredTypeOrValueType(field)

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
    if (name === null || typeof name === 'undefined') {
      return null
    }

    if (isNullableTypeName(name)) {
      return this.declaredClassName(nullableTypeNameFromKnownTypeName(name))
    }

    if (this.classNames.has(name)) {
      return name
    }

    const symbol = this.scope.resolve(name)

    if (symbol === null || typeof symbol === 'undefined') {
      return null
    }

    if (symbol.kind === 'class') {
      return name
    }

    return null
  }

  resolveClassConstructorFieldType(expression: AnyNode, constructorParams: AnyNode[]): ValueType {
    if (expression.type === 'RegExpLiteral') {
      return this.checkRegExpLiteral(expression)
    }

    return resolveClassConstructorFieldInitializerType(expression, constructorParams)
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
      const scopeState = this.pushScope()

      try {
        const previousReturnType = this.currentReturnType
        const returnInfo = this.resolveDeclaredType(item.returnType, item.loc)
        this.currentReturnType = returnInfo.valueType
        const previousReturnNullable = this.currentReturnNullable
        this.currentReturnNullable = returnInfo.nullable
        const previousReturnPromiseValueType = this.currentReturnPromiseValueType
        let returnPromiseValueType: ValueType | null = null

        if (returnInfo.promiseValueType !== null && typeof returnInfo.promiseValueType !== 'undefined') {
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
              mapValueShape: paramInfo.mapValueShape,
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
      } finally {
        this.restoreScope(scopeState)
      }

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

    if (statement.alternate !== null && typeof statement.alternate !== 'undefined') {
      return
    }

    if (!statementAlwaysExits(statement.consequent)) {
      return
    }

    const narrowing = this.resolveNullableConditionNarrowing(statement.condition)

    for (const name of narrowing.falseNames) {
      this.narrowedNullableNames.add(name)
    }
  }

  checkStatement(statement: AnyNode): void {
    if (statement.type === 'BlockStatement') {
      const scopeState = this.pushScope()

      try {
        this.checkStatements(statement.body)
      } finally {
        this.restoreScope(scopeState)
      }

      return
    }

    if (statement.type === 'IfStatement') {
      this.checkBooleanCondition(statement.condition)
      const narrowing = this.resolveNullableConditionNarrowing(statement.condition)
      let consequentNarrowedNames: Set<string> | null = null

      const trueNarrowingState = this.pushBranchNarrowedNullableNames(narrowing.trueNames)

      try {
        this.checkFlowScopedBody(statement.consequent)
        consequentNarrowedNames = cloneStringSet(this.narrowedNullableNames)
      } finally {
        this.restoreNarrowedNullableNames(trueNarrowingState)
      }

      if (statement.alternate !== null && typeof statement.alternate !== 'undefined') {
        let alternateNarrowedNames: Set<string> | null = null
        const falseNarrowingState = this.pushBranchNarrowedNullableNames(narrowing.falseNames)

        try {
          this.checkFlowScopedBody(statement.alternate)
          alternateNarrowedNames = cloneStringSet(this.narrowedNullableNames)
        } finally {
          this.restoreNarrowedNullableNames(falseNarrowingState)
        }

        if (
          consequentNarrowedNames !== null &&
          typeof consequentNarrowedNames !== 'undefined' &&
          alternateNarrowedNames !== null &&
          typeof alternateNarrowedNames !== 'undefined'
        ) {
          const consequentNames: string[] = []
          const alternateNames: string[] = []

          for (const name of consequentNarrowedNames) {
            consequentNames.push(name)
          }

          for (const name of alternateNarrowedNames) {
            alternateNames.push(name)
          }

          const commonNames = intersectNames(consequentNames, alternateNames)

          for (const name of commonNames) {
            this.narrowedNullableNames.add(name)
          }
        }
      }

      return
    }

    if (statement.type === 'WhileStatement') {
      this.checkBooleanCondition(statement.condition)
      const narrowing = this.resolveNullableConditionNarrowing(statement.condition)

      const loopState = this.pushLoop()

      try {
        const narrowingState = this.pushNarrowedNullableNames(narrowing.trueNames)

        try {
          this.checkScopedBody(statement.body)
        } finally {
          this.restoreNarrowedNullableNames(narrowingState)
        }
      } finally {
        this.restoreLoopDepth(loopState)
      }
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
        this.report('INOX_BREAK_OUTSIDE', 'break can only be used inside a loop or switch', statement.loc)
      }

      return
    }

    if (statement.type === 'ContinueStatement') {
      if (this.continueDepth === 0) {
        this.report('INOX_CONTINUE_OUTSIDE', 'continue can only be used inside a loop', statement.loc)
      }

      return
    }

    if (statement.type === 'ThrowStatement') {
      this.checkExpression(statement.argument)
      return
    }

    if (statement.type === 'VariableDeclaration') {
      if (
        statement.kind === 'const' &&
        statement.declarationOnly !== true &&
        (statement.init === null || typeof statement.init === 'undefined')
      ) {
        this.report('INOX_CONST_INIT', 'const declarations must have an initializer', statement.loc)
      }

      let declared: ResolvedTypeInfo | null = null

      if (statement.declaredType !== null && typeof statement.declaredType !== 'undefined') {
        declared = this.resolveDeclaredType(statement.declaredType, statement.loc)
      }

      let initType: ValueType = 'unknown'

      if (statement.init !== null && typeof statement.init !== 'undefined') {
        initType = this.checkVariableInitializer(statement.init, declared)
      }

      let valueType = initType

      if (declared !== null && typeof declared !== 'undefined') {
        valueType = declared.valueType
      }

      let arrayElementType = this.resolveExpressionArrayElementType(statement.init)

      if (
        declared !== null &&
        typeof declared !== 'undefined' &&
        declared.arrayElementType !== null &&
        typeof declared.arrayElementType !== 'undefined'
      ) {
        arrayElementType = declared.arrayElementType
      }

      let arrayElementDeclaredType = this.resolveExpressionArrayElementDeclaredType(statement.init)

      if (
        declared !== null &&
        typeof declared !== 'undefined' &&
        declared.arrayElementDeclaredType !== null &&
        typeof declared.arrayElementDeclaredType !== 'undefined'
      ) {
        arrayElementDeclaredType = declared.arrayElementDeclaredType
      }

      let arrayElementFunctionType = this.resolveExpressionArrayElementFunctionType(statement.init)

      if (
        declared !== null &&
        typeof declared !== 'undefined' &&
        declared.arrayElementFunctionType !== null &&
        typeof declared.arrayElementFunctionType !== 'undefined'
      ) {
        arrayElementFunctionType = declared.arrayElementFunctionType
      }

      let mapType: CheckerMapType | null = this.resolveExpressionMapType(statement.init)

      if (declared !== null && typeof declared !== 'undefined' && declared.valueType === 'map') {
        mapType = {
          key: declared.mapKeyType,
          value: declared.mapValueType
        }
      }

      let setElementType = this.resolveExpressionSetElementType(statement.init)

      if (declared !== null && typeof declared !== 'undefined' && declared.valueType === 'set') {
        setElementType = declared.setElementType
      }

      let promiseValueType = this.resolveExpressionPromiseValueType(statement.init)

      if (declared !== null && typeof declared !== 'undefined' && declared.valueType === 'promise') {
        promiseValueType = null

        if (declared.promiseValueType !== null && typeof declared.promiseValueType !== 'undefined') {
          promiseValueType = declared.promiseValueType
        }
      }

      let nullable = false

      if (declared !== null && typeof declared !== 'undefined' && declared.nullable === true) {
        nullable = true
      }

      if (statement.init !== null && typeof statement.init !== 'undefined' && statement.init.nullable === true) {
        nullable = true
      }

      let statementArrayElementDeclaredType = arrayElementDeclaredType

      let mapKeyType: ValueType | null = null
      let mapValueType: ValueType | null = null
      let mapValueShape: ObjectShapeInfo | null = null

      if (mapType !== null && typeof mapType !== 'undefined') {
        mapKeyType = mapType.key
        mapValueType = mapType.value
      }

      if (
        declared !== null &&
        typeof declared !== 'undefined' &&
        declared.mapValueShape !== null &&
        typeof declared.mapValueShape !== 'undefined'
      ) {
        mapValueShape = declared.mapValueShape
      } else if (
        statement.init !== null &&
        typeof statement.init !== 'undefined' &&
        statement.init.mapValueShape !== null &&
        typeof statement.init.mapValueShape !== 'undefined'
      ) {
        mapValueShape = statement.init.mapValueShape
      }

      let functionType: AnyNode | null = null

      if (
        declared !== null &&
        typeof declared !== 'undefined' &&
        declared.functionType !== null &&
        typeof declared.functionType !== 'undefined'
      ) {
        functionType = declared.functionType
      } else if (
        statement.init !== null &&
        typeof statement.init !== 'undefined' &&
        statement.init.functionType !== null &&
        typeof statement.init.functionType !== 'undefined'
      ) {
        functionType = statement.init.functionType
      } else if (
        statement.init !== null &&
        typeof statement.init !== 'undefined' &&
        statement.init.type === 'ArrowFunctionExpression'
      ) {
        functionType = createArrowFunctionTypeMetadata(statement.init, this.resolveParams(statement.init.params))
      }

      let shape: ObjectShapeInfo | null = null

      if (
        declared !== null &&
        typeof declared !== 'undefined' &&
        declared.shape !== null &&
        typeof declared.shape !== 'undefined'
      ) {
        shape = declared.shape
      } else if (
        statement.init !== null &&
        typeof statement.init !== 'undefined' &&
        statement.init.shape !== null &&
        typeof statement.init.shape !== 'undefined'
      ) {
        shape = statement.init.shape
      } else if (
        valueType === 'object' &&
        statementArrayElementDeclaredType !== null &&
        typeof statementArrayElementDeclaredType !== 'undefined' &&
        statementArrayElementDeclaredType === 'fs.Dirent'
      ) {
        shape = fsDirentObjectShape
      }

      let className: string | null = null

      if (
        statement.init !== null &&
        typeof statement.init !== 'undefined' &&
        statement.init.className !== null &&
        typeof statement.init.className !== 'undefined'
      ) {
        className = statement.init.className
      }

      statement.valueType = valueType
      statement.nullable = nullable
      statement.arrayElementType = arrayElementType
      statement.arrayElementDeclaredType = statementArrayElementDeclaredType
      statement.arrayElementFunctionType = arrayElementFunctionType
      statement.mapKeyType = mapKeyType
      statement.mapValueType = mapValueType
      statement.mapValueShape = mapValueShape
      statement.promiseValueType = promiseValueType
      statement.setElementType = setElementType
      statement.functionType = functionType
      statement.shape = shape
      statement.className = className

      if (
        declared !== null &&
        typeof declared !== 'undefined' &&
        statement.init !== null &&
        typeof statement.init !== 'undefined' &&
        statement.init.type === 'ObjectLiteral'
      ) {
        const declaredShape = declared.shape

        if (declaredShape !== null && typeof declaredShape !== 'undefined') {
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
          arrayElementFunctionType,
          mapKeyType,
          mapValueType,
          mapValueShape,
          promiseValueType,
          setElementType,
          functionType,
          className: statement.className,
          shape,
          loc: statement.loc
        },
        statement.loc
      )

      if (
        declared !== null &&
        typeof declared !== 'undefined' &&
        statement.init !== null &&
        typeof statement.init !== 'undefined'
      ) {
        this.checkAssignableType(
          initType,
          declared.valueType,
          statement.loc,
          declared.nullable,
          this.expressionCanBeNull(statement.init)
        )

        if (
          declared.valueType === 'array' &&
          declared.arrayElementType !== null &&
          typeof declared.arrayElementType !== 'undefined'
        ) {
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

          if (actual !== null && typeof actual !== 'undefined') {
            actualKey = actual.key
            actualValue = actual.value
          }

          if (declared.mapKeyType !== null && typeof declared.mapKeyType !== 'undefined') {
            this.checkAssignableType(actualKey, declared.mapKeyType, statement.loc, false, false)
          }

          if (declared.mapValueType !== null && typeof declared.mapValueType !== 'undefined') {
            this.checkAssignableType(actualValue, declared.mapValueType, statement.loc, false, false)
          }
        }

        if (
          declared.valueType === 'set' &&
          declared.setElementType !== null &&
          typeof declared.setElementType !== 'undefined'
        ) {
          this.checkAssignableType(
            this.resolveExpressionSetElementType(statement.init),
            declared.setElementType,
            statement.loc,
            false,
            false
          )
        }

        if (
          declared.valueType === 'promise' &&
          declared.promiseValueType !== null &&
          typeof declared.promiseValueType !== 'undefined'
        ) {
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

      if (statement.argument !== null && typeof statement.argument !== 'undefined') {
        actual = this.checkExpression(statement.argument)
      }

      if (
        this.currentReturnAsync &&
        this.currentReturnType === 'promise' &&
        this.currentReturnPromiseValueType !== null &&
        typeof this.currentReturnPromiseValueType !== 'undefined'
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

      if (
        this.currentReturnType === 'promise' &&
        this.currentReturnPromiseValueType !== null &&
        typeof this.currentReturnPromiseValueType !== 'undefined'
      ) {
        this.checkAssignableType(
          this.resolveExpressionPromiseValueType(statement.argument),
          this.currentReturnPromiseValueType,
          statement.loc,
          false,
          false
        )
      }
    }

    if (isStatementExpressionNode(statement)) {
      this.checkExpression(statement)
    }
  }

  checkTryStatement(statement: AnyNode): void {
    this.checkStatement(statement.block)

    if (statement.handler !== null && typeof statement.handler !== 'undefined') {
      const scopeState = this.pushScope()

      try {
        if (statement.handler.param !== null && typeof statement.handler.param !== 'undefined') {
          let paramLoc = statement.handler.loc

          if (statement.handler.paramLoc !== null && typeof statement.handler.paramLoc !== 'undefined') {
            paramLoc = statement.handler.paramLoc
          }

          this.declare(
            statement.handler.param,
            {
              kind: 'catch',
              mutable: false,
              valueType: 'unknown',
              loc: paramLoc
            },
            paramLoc
          )
        }

        this.checkStatement(statement.handler.body)
      } finally {
        this.restoreScope(scopeState)
      }
    }

    if (statement.finalizer !== null && typeof statement.finalizer !== 'undefined') {
      this.checkStatement(statement.finalizer)
    }
  }

  checkExpression(expression: AnyNode): ValueType {
    if (expression.type === 'StringLiteral' || expression.type === 'TemplateLiteral') {
      return 'string'
    }

    if (expression.type === 'RegExpLiteral') {
      return this.checkRegExpLiteral(expression)
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
      const sourceValueType = this.checkExpression(expression.expression)
      const asserted = expression.expression
      const declaredType = nodeDeclaredTypeOrValueType(expression)

      if (declaredType === 'const') {
        expression.declaredType = declaredType
        expression.nullable = asserted.nullable === true
        expression.valueType = sourceValueType
        expression.arrayElementType = asserted.arrayElementType
        expression.arrayElementDeclaredType = asserted.arrayElementDeclaredType
        expression.arrayElementFunctionType = asserted.arrayElementFunctionType
        expression.mapKeyType = asserted.mapKeyType
        expression.mapValueType = asserted.mapValueType
        expression.promiseValueType = asserted.promiseValueType
        expression.setElementType = asserted.setElementType
        expression.functionType = asserted.functionType
        expression.shape = asserted.shape
        expression.className = asserted.className

        return sourceValueType
      }

      const declared = this.resolveDeclaredType(declaredType, expression.loc as SourceLocation)
      let arrayElementType: ValueType | null = asserted.arrayElementType
      let arrayElementDeclaredType: string | null = asserted.arrayElementDeclaredType
      let arrayElementFunctionType: FunctionTypeMetadata | null = asserted.arrayElementFunctionType
      let mapKeyType: ValueType | null = asserted.mapKeyType
      let mapValueType: ValueType | null = asserted.mapValueType
      let mapValueShape: ObjectShapeInfo | null = asserted.mapValueShape
      let promiseValueType: ValueType | null = asserted.promiseValueType
      let setElementType: ValueType | null = asserted.setElementType
      let functionType: FunctionTypeMetadata | null = asserted.functionType
      let shape: ObjectShapeInfo | null = asserted.shape
      let className: string | null = asserted.className

      if (declared.arrayElementType !== null && typeof declared.arrayElementType !== 'undefined') {
        arrayElementType = declared.arrayElementType
      }

      if (declared.arrayElementDeclaredType !== null && typeof declared.arrayElementDeclaredType !== 'undefined') {
        arrayElementDeclaredType = declared.arrayElementDeclaredType
      }

      if (declared.arrayElementFunctionType !== null && typeof declared.arrayElementFunctionType !== 'undefined') {
        arrayElementFunctionType = declared.arrayElementFunctionType
      }

      if (declared.mapKeyType !== null && typeof declared.mapKeyType !== 'undefined') {
        mapKeyType = declared.mapKeyType
      }

      if (declared.mapValueType !== null && typeof declared.mapValueType !== 'undefined') {
        mapValueType = declared.mapValueType
      }

      if (declared.mapValueShape !== null && typeof declared.mapValueShape !== 'undefined') {
        mapValueShape = declared.mapValueShape
      }

      if (declared.promiseValueType !== null && typeof declared.promiseValueType !== 'undefined') {
        promiseValueType = declared.promiseValueType
      }

      if (declared.setElementType !== null && typeof declared.setElementType !== 'undefined') {
        setElementType = declared.setElementType
      }

      if (declared.functionType !== null && typeof declared.functionType !== 'undefined') {
        functionType = declared.functionType
      }

      if (declared.shape !== null && typeof declared.shape !== 'undefined') {
        shape = declared.shape
      }

      expression.declaredType = declaredType
      expression.nullable = declared.nullable
      expression.valueType = declared.valueType
      expression.arrayElementType = arrayElementType
      expression.arrayElementDeclaredType = arrayElementDeclaredType
      expression.arrayElementFunctionType = arrayElementFunctionType
      expression.mapKeyType = mapKeyType
      expression.mapValueType = mapValueType
      expression.mapValueShape = mapValueShape
      expression.promiseValueType = promiseValueType
      expression.setElementType = setElementType
      expression.functionType = functionType
      expression.shape = shape
      expression.className = className

      return declared.valueType
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

      if (symbol !== null && typeof symbol !== 'undefined') {
        valueType = symbol.valueType
        expression.nullable = symbol.nullable === true
        expression.valueType = valueType

        if (symbol.shape !== null && typeof symbol.shape !== 'undefined') {
          expression.shape = symbol.shape
        }

        if (symbol.className !== null && typeof symbol.className !== 'undefined') {
          expression.className = symbol.className
        }
      }

      return valueType
    }

    if (expression.type === 'Reference') {
      const symbol = this.resolveReference(expression)
      const path: string[] = expression.path
      let valueType: ValueType = 'unknown'

      expression.nullable = false
      expression.valueType = valueType
      expression.arrayElementType = null
      expression.arrayElementDeclaredType = null
      expression.arrayElementFunctionType = null
      expression.mapKeyType = null
      expression.mapValueType = null
      expression.mapValueShape = null
      expression.promiseValueType = null
      expression.setElementType = null
      expression.functionType = null
      expression.shape = null
      expression.className = null

      if (symbol !== null && typeof symbol !== 'undefined') {
        valueType = symbol.valueType
        expression.nullable = symbol.nullable === true && !this.narrowedNullableNames.has(path[0])
        expression.valueType = valueType

        if (symbol.arrayElementType !== null && typeof symbol.arrayElementType !== 'undefined') {
          expression.arrayElementType = symbol.arrayElementType
        }

        if (symbol.arrayElementDeclaredType !== null && typeof symbol.arrayElementDeclaredType !== 'undefined') {
          expression.arrayElementDeclaredType = symbol.arrayElementDeclaredType
        }

        if (symbol.arrayElementFunctionType !== null && typeof symbol.arrayElementFunctionType !== 'undefined') {
          expression.arrayElementFunctionType = symbol.arrayElementFunctionType
        }

        if (symbol.mapKeyType !== null && typeof symbol.mapKeyType !== 'undefined') {
          expression.mapKeyType = symbol.mapKeyType
        }

        if (symbol.mapValueType !== null && typeof symbol.mapValueType !== 'undefined') {
          expression.mapValueType = symbol.mapValueType
        }

        if (symbol.mapValueShape !== null && typeof symbol.mapValueShape !== 'undefined') {
          expression.mapValueShape = symbol.mapValueShape
        }

        if (symbol.promiseValueType !== null && typeof symbol.promiseValueType !== 'undefined') {
          expression.promiseValueType = symbol.promiseValueType
        }

        if (symbol.setElementType !== null && typeof symbol.setElementType !== 'undefined') {
          expression.setElementType = symbol.setElementType
        }

        if (symbol.functionType !== null && typeof symbol.functionType !== 'undefined') {
          expression.functionType = symbol.functionType
        }

        if (symbol.shape !== null && typeof symbol.shape !== 'undefined') {
          expression.shape = symbol.shape
        }

        if (symbol.className !== null && typeof symbol.className !== 'undefined') {
          expression.className = symbol.className
        }
      }

      if (symbol !== null && typeof symbol !== 'undefined' && symbol.kind === 'import') {
        const importSource = symbol.importSource
        const importedName = symbol.importedName

        if (
          importedName !== null &&
          typeof importedName !== 'undefined' &&
          isOsRuntimeConstantImport(importSource, importedName)
        ) {
          expression.osRuntimeConstant = importedName
        }

        const processImportInfo = processRuntimePropertyImportInfo(importSource, importedName)

        if (processImportInfo !== null && typeof processImportInfo !== 'undefined') {
          expression.processRuntimeProperty = processImportInfo.property
          expression.valueType = processImportInfo.valueType
          expression.shape = processImportInfo.shape ?? null
        }

        if (
          importedName !== null &&
          typeof importedName !== 'undefined' &&
          isPathRuntimeConstantImport(importSource, importedName)
        ) {
          expression.pathRuntimeConstant = importedName
        }
      }

      const runtimeObject = nodeStdlibRuntimeObjectInfo(path, symbol)

      if (runtimeObject !== null && typeof runtimeObject !== 'undefined') {
        expression.runtimeObjectSource = runtimeObject.source
        expression.runtimeObjectName = runtimeObject.name
        valueType = runtimeObject.valueType
        expression.valueType = runtimeObject.valueType
        expression.shape = runtimeObject.shape
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

      if (symbol === null || typeof symbol === 'undefined') {
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

      if (symbol.returnType !== null && typeof symbol.returnType !== 'undefined') {
        expression.valueType = symbol.returnType
      }

      if (symbol.returnArrayElementType !== null && typeof symbol.returnArrayElementType !== 'undefined') {
        expression.arrayElementType = symbol.returnArrayElementType
      }

      if (
        symbol.returnArrayElementDeclaredType !== null &&
        typeof symbol.returnArrayElementDeclaredType !== 'undefined'
      ) {
        expression.arrayElementDeclaredType = symbol.returnArrayElementDeclaredType
      }

      if (symbol.returnMapKeyType !== null && typeof symbol.returnMapKeyType !== 'undefined') {
        expression.mapKeyType = symbol.returnMapKeyType
      }

      if (symbol.returnMapValueType !== null && typeof symbol.returnMapValueType !== 'undefined') {
        expression.mapValueType = symbol.returnMapValueType
      }

      if (symbol.returnPromiseValueType !== null && typeof symbol.returnPromiseValueType !== 'undefined') {
        expression.promiseValueType = symbol.returnPromiseValueType
      }

      if (symbol.returnSetElementType !== null && typeof symbol.returnSetElementType !== 'undefined') {
        expression.setElementType = symbol.returnSetElementType
      }

      if (symbol.returnShape !== null && typeof symbol.returnShape !== 'undefined') {
        expression.shape = symbol.returnShape
      }

      const params = symbol.params

      if (params !== null && typeof params !== 'undefined') {
        if (!acceptsArgumentCount(params, expression.args.length)) {
          let name = 'callable'

          if (expression.callee.type === 'Reference') {
            name = firstPathSegment(expression.callee.path)
          }

          this.report(
            'INOX_ARG_COUNT',
            argumentCountMessage(`function ${name}`, params, expression.args.length),
            expression.loc
          )
        }

        for (let index = 0; index < expression.args.length; index = index + 1) {
          const param = paramForArgument(params, index)

          if (param !== null && typeof param !== 'undefined' && index < argTypes.length) {
            this.checkAssignableType(
              argTypes[index],
              argumentParamValueType(param),
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
        this.report('INOX_AWAIT_OUTSIDE_ASYNC', 'await can only be used inside async functions', expression.loc)
      }

      const argumentType = this.checkExpression(expression.argument)
      let valueType = argumentType

      if (argumentType === 'promise') {
        valueType = 'unknown'

        const promiseValueType = this.resolveExpressionPromiseValueType(expression.argument)

        if (promiseValueType !== null && typeof promiseValueType !== 'undefined') {
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

    if (expression.type === 'ConditionalExpression') {
      return this.checkConditionalExpression(expression)
    }

    if (expression.type === 'UnaryExpression') {
      this.checkExpression(expression.argument)
      if (expression.operator === 'delete') {
        if (this.isClassShapeMutationTarget(expression.argument)) {
          this.report('INOX_C_CLASS', 'class fields cannot be deleted', expression.loc)
        }

        expression.valueType = 'boolean'
        return 'boolean'
      }

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
      expression.arrayElementFunctionType = null

      if (expression.arrayElementType === 'function') {
        expression.arrayElementFunctionType = commonExpressionFunctionType(expression.elements)
      }

      return 'array'
    }

    if (expression.type === 'ObjectLiteral') {
      this.checkObjectLiteral(expression)
      return 'object'
    }

    return 'unknown'
  }

  checkConditionalExpression(expression: AnyNode): ValueType {
    this.checkExpression(expression.test)
    const narrowing = this.resolveNullableConditionNarrowing(expression.test)
    let consequentType: ValueType = 'unknown'
    let alternateType: ValueType = 'unknown'

    const consequentNarrowingState = this.pushNarrowedNullableNames(narrowing.trueNames)

    try {
      consequentType = this.checkExpression(expression.consequent)
    } finally {
      this.restoreNarrowedNullableNames(consequentNarrowingState)
    }

    const alternateNarrowingState = this.pushNarrowedNullableNames(narrowing.falseNames)

    try {
      alternateType = this.checkExpression(expression.alternate)
    } finally {
      this.restoreNarrowedNullableNames(alternateNarrowingState)
    }

    const valueType = conditionalExpressionValueType(consequentType, alternateType)

    expression.valueType = valueType
    expression.nullable = this.expressionCanBeNull(expression.consequent) || this.expressionCanBeNull(expression.alternate)
    this.applyConditionalExpressionMetadata(expression, valueType)

    return valueType
  }

  applyConditionalExpressionMetadata(expression: AnyNode, valueType: ValueType): void {
    if (valueType === 'array') {
      expression.arrayElementType =
        this.resolveExpressionArrayElementType(expression.consequent) ??
        this.resolveExpressionArrayElementType(expression.alternate)
      expression.arrayElementDeclaredType =
        this.resolveExpressionArrayElementDeclaredType(expression.consequent) ??
        this.resolveExpressionArrayElementDeclaredType(expression.alternate)
      return
    }

    if (valueType === 'map') {
      const consequentMap = this.resolveExpressionMapType(expression.consequent)
      const alternateMap = this.resolveExpressionMapType(expression.alternate)
      let mapKeyType: ValueType | null = null
      let mapValueType: ValueType | null = null

      if (consequentMap !== null && typeof consequentMap !== 'undefined') {
        mapKeyType = consequentMap.key
        mapValueType = consequentMap.value
      } else if (alternateMap !== null && typeof alternateMap !== 'undefined') {
        mapKeyType = alternateMap.key
        mapValueType = alternateMap.value
      }

      expression.mapKeyType = mapKeyType
      expression.mapValueType = mapValueType
      return
    }

    if (valueType === 'promise') {
      expression.promiseValueType =
        this.resolveExpressionPromiseValueType(expression.consequent) ??
        this.resolveExpressionPromiseValueType(expression.alternate)
      return
    }

    if (valueType === 'set') {
      expression.setElementType =
        this.resolveExpressionSetElementType(expression.consequent) ??
        this.resolveExpressionSetElementType(expression.alternate)
      return
    }

    if (valueType === 'object') {
      expression.shape =
        this.resolveExpressionShape(expression.consequent) ?? this.resolveExpressionShape(expression.alternate)
      return
    }

    if (valueType === 'function') {
      expression.functionType = expression.consequent.functionType ?? expression.alternate.functionType ?? null
    }
  }

  checkAssignment(expression: AnyNode): ValueType {
    if (expression.target.type === 'MemberExpression') {
      return this.checkMemberAssignment(expression)
    }

    if (expression.target.type === 'IndexExpression') {
      return this.checkIndexAssignment(expression)
    }

    if (expression.target.type !== 'Reference') {
      this.report('INOX_INVALID_ASSIGNMENT_TARGET', 'assignment target must be a binding or field', expression.loc)
      return this.checkExpression(expression.value)
    }

    const symbol = this.resolveReference(expression.target)
    const valueType = this.checkExpression(expression.value)

    if (symbol !== null && typeof symbol !== 'undefined') {
      if (expression.target.path.length === 1 && symbol.mutable !== true) {
        const path: string[] = expression.target.path
        this.report('INOX_ASSIGN_CONST', `cannot assign to ${symbol.kind} binding ${path[0]}`, expression.target.loc)
      }
    }

    if (symbol !== null && typeof symbol !== 'undefined') {
      this.checkAssignableType(
        valueType,
        symbol.valueType,
        expression.value.loc,
        symbol.nullable === true,
        this.expressionCanBeNull(expression.value)
      )

      if (
        symbol.valueType === 'promise' &&
        symbol.promiseValueType !== null &&
        typeof symbol.promiseValueType !== 'undefined'
      ) {
        this.checkAssignableType(
          this.resolveExpressionPromiseValueType(expression.value),
          symbol.promiseValueType,
          expression.value.loc,
          false,
          false
        )
      }

      if (expression.target.path.length === 1 && symbol.mutable === true) {
        const targetName = firstPathSegment(expression.target.path)

        deleteNullableNarrowingKey(this.narrowedNullableNames, targetName)

        if (this.expressionCanBeNull(expression.value)) {
          return valueType
        }

        if (symbol.nullable === true) {
          this.narrowedNullableNames.add(targetName)
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

      if (symbol !== null && typeof symbol !== 'undefined') {
        if (expression.argument.path.length === 1 && symbol.mutable !== true) {
          const path: string[] = expression.argument.path
          this.report(
            'INOX_ASSIGN_CONST',
            `cannot assign to ${symbol.kind} binding ${path[0]}`,
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

    this.report('INOX_INVALID_ASSIGNMENT_TARGET', 'update target must be a binding or field', expression.loc)

    return 'number'
  }

  checkBinaryExpression(expression: AnyNode): ValueType {
    const left = this.checkExpression(expression.left)
    const leftNarrowing = this.resolveNullableConditionNarrowing(expression.left)
    let right = 'unknown'

    if (expression.operator === '&&') {
      const narrowingState = this.pushNarrowedNullableNames(leftNarrowing.trueNames)

      right = this.checkExpression(expression.right)
      this.restoreNarrowedNullableNames(narrowingState)
    } else if (expression.operator === '||') {
      const narrowingState = this.pushNarrowedNullableNames(leftNarrowing.falseNames)

      right = this.checkExpression(expression.right)
      this.restoreNarrowedNullableNames(narrowingState)
    } else {
      right = this.checkExpression(expression.right)
    }

    if (isUnsupportedEqualityOperator(expression.operator)) {
      this.report(
        'INOX_UNSUPPORTED_OPERATOR',
        'loose equality operators are not supported; use strict equality operators',
        expression.loc
      )
      expression.valueType = 'boolean'
      expression.nullable = false
      return 'boolean'
    }

    const nullableEquality = isEqualityOperator(expression.operator) && (left === 'null' || right === 'null')

    if (isEqualityOperator(expression.operator) && !nullableEquality && !isEqualityComparableType(left, right)) {
      this.report(
        'INOX_TYPE_MISMATCH',
        `cannot compare ${left} and ${right} with ${expression.operator}`,
        expression.loc
      )
    }

    const valueType = inferBinaryExpressionType(expression.operator, left, right)
    expression.valueType = valueType
    expression.nullable = expression.operator === '??' && this.expressionCanBeNull(expression.right)

    if (expression.operator === '??') {
      this.applyNullishCoalescingMetadata(expression, valueType)
    }

    return valueType
  }

  applyNullishCoalescingMetadata(expression: AnyNode, valueType: ValueType): void {
    if (valueType === 'array') {
      expression.arrayElementType =
        this.resolveExpressionArrayElementType(expression.left) ??
        this.resolveExpressionArrayElementType(expression.right)
      expression.arrayElementDeclaredType =
        this.resolveExpressionArrayElementDeclaredType(expression.left) ??
        this.resolveExpressionArrayElementDeclaredType(expression.right)
      return
    }

    if (valueType === 'map') {
      const leftMap = this.resolveExpressionMapType(expression.left)
      const rightMap = this.resolveExpressionMapType(expression.right)
      let mapKeyType: ValueType | null = null
      let mapValueType: ValueType | null = null

      if (leftMap !== null && typeof leftMap !== 'undefined') {
        mapKeyType = leftMap.key
        mapValueType = leftMap.value
      } else if (rightMap !== null && typeof rightMap !== 'undefined') {
        mapKeyType = rightMap.key
        mapValueType = rightMap.value
      }

      expression.mapKeyType = mapKeyType
      expression.mapValueType = mapValueType
      return
    }

    if (valueType === 'set') {
      expression.setElementType =
        this.resolveExpressionSetElementType(expression.left) ?? this.resolveExpressionSetElementType(expression.right)
      return
    }

    if (valueType === 'promise') {
      expression.promiseValueType =
        this.resolveExpressionPromiseValueType(expression.left) ??
        this.resolveExpressionPromiseValueType(expression.right)
      return
    }

    if (valueType === 'object') {
      expression.shape = this.resolveExpressionShape(expression.left) ?? this.resolveExpressionShape(expression.right)
      return
    }

    if (valueType === 'function') {
      expression.functionType = expression.left.functionType ?? expression.right.functionType ?? null
    }
  }

  expressionCanBeNull(expression: AnyNode | null): boolean {
    if (expression === null || typeof expression === 'undefined') {
      return false
    }

    return expression.type === 'NullLiteral' || expression.nullable === true
  }

  checkMemberExpression(expression: AnyNode): ValueType {
    const osConstantType = this.checkOsConstantMemberExpression(expression)

    if (osConstantType !== null && typeof osConstantType !== 'undefined') {
      return osConstantType
    }

    const processMemberType = this.checkProcessMemberExpression(expression)

    if (processMemberType !== null && typeof processMemberType !== 'undefined') {
      return processMemberType
    }

    const pathConstantType = this.checkPathConstantMemberExpression(expression)

    if (pathConstantType !== null && typeof pathConstantType !== 'undefined') {
      return pathConstantType
    }

    const bufferConstantType = this.checkBufferConstantMemberExpression(expression)

    if (bufferConstantType !== null && typeof bufferConstantType !== 'undefined') {
      return bufferConstantType
    }

    const fsConstantType = this.checkFsConstantMemberExpression(expression)

    if (fsConstantType !== null && typeof fsConstantType !== 'undefined') {
      return fsConstantType
    }

    const unsupportedFetchBodyType = this.checkFetchUnsupportedResponseBodyMember(expression)

    if (unsupportedFetchBodyType !== null && typeof unsupportedFetchBodyType !== 'undefined') {
      return unsupportedFetchBodyType
    }

    const objectType = this.checkExpression(expression.object)

    const optionalChainReceiver = isOptionalChainProtectedExpression(expression.object)

    if (!optionalChainReceiver) {
      this.reportNullableRuntimeAccess(expression.object, expression.loc)
    }

    if (this.reportUnsupportedClassPrototypeAccess(expression, optionalChainReceiver)) {
      return 'unknown'
    }

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
      expression.valueType = 'number'
      return 'number'
    }

    if ((objectType === 'map' || objectType === 'set') && expression.property === 'size') {
      return 'number'
    }

    if (this.hasClassInstanceMethod(expression.object, expression.property)) {
      this.report(
        'INOX_C_CLASS',
        'unbound class method extraction is not supported',
        expression.loc
      )
      expression.valueType = 'unknown'
      return 'unknown'
    }

    const shape = this.resolveExpressionShape(expression.object)
    const anyNodeMetadataType = this.checkAnyNodeMetadataMemberExpression(expression, objectType, shape)

    if (anyNodeMetadataType !== null && typeof anyNodeMetadataType !== 'undefined') {
      return anyNodeMetadataType
    }

    if (shape === null || typeof shape === 'undefined') {
      return 'unknown'
    }

    const field = this.findShapeField(shape, expression.property)

    if (field === null || typeof field === 'undefined') {
      this.report('INOX_UNKNOWN_FIELD', `unknown field ${expression.property}`, expression.loc)
      return 'unknown'
    }

    const fieldType = this.resolveFieldDeclaredType(field)
    const valueType = resolvedConcreteValueTypeMetadata(field.valueType, fieldType.valueType)

    const fieldNullable = resolvedFieldNullableMetadata(field, fieldType)

    expression.nullable = optionalChainReceiver || fieldNullable
    expression.optionalChainProtected = optionalChainReceiver && !fieldNullable

    const narrowedKey = nullableNarrowingKey(expression)

    if (narrowedKey !== null && typeof narrowedKey !== 'undefined' && this.narrowedNullableNames.has(narrowedKey)) {
      expression.nullable = false
    }

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

    if (field.className !== null && typeof field.className !== 'undefined') {
      expression.className = field.className
    }

    return valueType
  }

  checkAnyNodeMetadataMemberExpression(
    expression: AnyNode,
    objectType: ValueType,
    shape: ObjectShapeInfo | null
  ): ValueType | null {
    const directAnyNode =
      objectType === 'object' && shape !== null && typeof shape !== 'undefined' && shape.builtin === 'compiler.AnyNode'
    const childAnyNode = this.isAnyNodeChildExpression(expression.object)

    if (!directAnyNode && !childAnyNode) {
      return null
    }

    if (expression.property === 'path') {
      expression.valueType = 'array'
      expression.nullable = false
      expression.arrayElementType = 'string'
      expression.arrayElementDeclaredType = 'string'
      expression.shape = null
      return 'array'
    }

    if (expression.property === 'loc') {
      expression.valueType = 'object'
      expression.nullable = false
      expression.shape = anyNodeLocObjectShape(expression.loc)
      return 'object'
    }

    return null
  }

  isAnyNodeChildExpression(expression: AnyNode): boolean {
    if (expression.type !== 'MemberExpression') {
      return false
    }

    if (!isAnyNodeChildFieldName(expression.property)) {
      return false
    }

    const parentShape = this.resolveExpressionShape(expression.object)

    if (parentShape !== null && typeof parentShape !== 'undefined' && parentShape.builtin === 'compiler.AnyNode') {
      return true
    }

    return this.isAnyNodeChildExpression(expression.object)
  }

  checkOptionalMemberExpression(expression: AnyNode): ValueType {
    this.checkExpression(expression.object)

    if (this.reportUnsupportedClassPrototypeAccess(expression, true)) {
      return 'unknown'
    }

    const shape = this.resolveExpressionShape(expression.object)

    if (shape === null || typeof shape === 'undefined') {
      expression.nullable = true
      expression.valueType = 'unknown'
      return 'unknown'
    }

    const field = this.findShapeField(shape, expression.property)

    if (field === null || typeof field === 'undefined') {
      this.report('INOX_UNKNOWN_FIELD', `unknown field ${expression.property}`, expression.loc)
      expression.nullable = true
      expression.valueType = 'unknown'
      return 'unknown'
    }

    const fieldType = this.resolveFieldDeclaredType(field)
    const valueType = resolvedConcreteValueTypeMetadata(field.valueType, fieldType.valueType)
    const fieldNullable = resolvedFieldNullableMetadata(field, fieldType)

    expression.nullable = true
    expression.optionalChainProtected = !fieldNullable
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

    if (field.className !== null && typeof field.className !== 'undefined') {
      expression.className = field.className
    }

    return valueType
  }

  checkMemberAssignment(expression: AnyNode): ValueType {
    const processAssignmentType = this.checkProcessMemberAssignment(expression)

    if (processAssignmentType !== null && typeof processAssignmentType !== 'undefined') {
      return processAssignmentType
    }

    const targetType = this.checkExpression(expression.target.object)
    const shape = this.resolveExpressionShape(expression.target.object)
    const valueType = this.checkExpression(expression.value)

    if (this.reportUnsupportedClassPrototypeAccess(expression.target, false)) {
      return valueType
    }

    if (targetType === 'string' && expression.target.property === 'length') {
      this.report('INOX_ASSIGN_READONLY_FIELD', 'cannot assign to readonly field length', expression.target.loc)
      return valueType
    }

    if (targetType === 'array' && expression.target.property === 'length') {
      this.report('INOX_ASSIGN_READONLY_FIELD', 'cannot assign to readonly field length', expression.target.loc)
      return valueType
    }

    if (targetType === 'map' || targetType === 'set') {
      if (expression.target.property === 'size') {
        this.report('INOX_ASSIGN_READONLY_FIELD', 'cannot assign to readonly field size', expression.target.loc)
        return valueType
      }
    }

    if (targetType === 'bytes' && expression.target.property === 'length') {
      this.report('INOX_ASSIGN_READONLY_FIELD', 'cannot assign to readonly field length', expression.target.loc)
      return valueType
    }

    if (shape === null || typeof shape === 'undefined') {
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

    if (field === null || typeof field === 'undefined') {
      this.report('INOX_UNKNOWN_FIELD', `unknown field ${expression.target.property}`, expression.target.loc)
      return valueType
    }

    if (field.readonly === true) {
      if (!this.canInitializeReadonlyClassField(expression.target.object)) {
        this.report(
          'INOX_ASSIGN_READONLY_FIELD',
          `cannot assign to readonly field ${expression.target.property}`,
          expression.target.loc
        )
      }
    }

    const fieldType = this.resolveFieldDeclaredType(field)
    const targetValueType = resolvedConcreteValueTypeMetadata(field.valueType, fieldType.valueType)
    const targetNullable = resolvedFieldNullableMetadata(field, fieldType)

    expression.target.nullable = targetNullable
    const narrowedKey = nullableNarrowingKey(expression.target)

    if (narrowedKey !== null && typeof narrowedKey !== 'undefined') {
      deleteNullableNarrowingKey(this.narrowedNullableNames, narrowedKey)
    }

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

    if (field.className !== null && typeof field.className !== 'undefined') {
      expression.target.className = field.className
    }

    const valueCanBeNull = this.expressionCanBeNull(expression.value)

    this.checkAssignableType(valueType, fieldType.valueType, expression.value.loc, targetNullable, valueCanBeNull)

    if (narrowedKey !== null && typeof narrowedKey !== 'undefined' && targetNullable && !valueCanBeNull) {
      this.narrowedNullableNames.add(narrowedKey)
    }

    if (
      fieldType.valueType === 'array' &&
      fieldType.arrayElementType !== null &&
      typeof fieldType.arrayElementType !== 'undefined'
    ) {
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
      let actualKey: ValueType | null = null
      let actualValue: ValueType | null = null

      if (actual !== null && typeof actual !== 'undefined') {
        actualKey = actual.key
        actualValue = actual.value
      }

      if (fieldType.mapKeyType !== null && typeof fieldType.mapKeyType !== 'undefined') {
        this.checkAssignableType(actualKey, fieldType.mapKeyType, expression.value.loc, false, false)
      }

      if (fieldType.mapValueType !== null && typeof fieldType.mapValueType !== 'undefined') {
        this.checkAssignableType(actualValue, fieldType.mapValueType, expression.value.loc, false, false)
      }
    }

    if (
      fieldType.valueType === 'set' &&
      fieldType.setElementType !== null &&
      typeof fieldType.setElementType !== 'undefined'
    ) {
      this.checkAssignableType(
        this.resolveExpressionSetElementType(expression.value),
        fieldType.setElementType,
        expression.value.loc,
        false,
        false
      )
    }

    if (
      fieldType.valueType === 'promise' &&
      fieldType.promiseValueType !== null &&
      typeof fieldType.promiseValueType !== 'undefined'
    ) {
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

    if (processIndexType !== null && typeof processIndexType !== 'undefined') {
      return processIndexType
    }

    const objectType = this.checkExpression(expression.object)
    const indexType = this.checkExpression(expression.index)

    const optionalChainReceiver = isOptionalChainProtectedExpression(expression.object)

    if (!optionalChainReceiver) {
      this.reportNullableRuntimeAccess(expression.object, expression.loc)
    }

    if (this.reportUnsupportedClassPrototypeAccess(expression, optionalChainReceiver)) {
      return 'unknown'
    }

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
      expression.shape = mapType.valueShape ?? null

      return mapValueType
    }

    if (expression.index.type !== 'StringLiteral') {
      if (objectType === 'string') {
        this.checkAssignableType(indexType, 'number', expression.index.loc, false, false)
        expression.nullable = optionalChainReceiver
        expression.optionalChainProtected = optionalChainReceiver
        expression.valueType = 'string'
        return 'string'
      }

      if (objectType === 'bytes') {
        this.checkAssignableType(indexType, 'number', expression.index.loc, false, false)
        expression.nullable = optionalChainReceiver
        expression.optionalChainProtected = optionalChainReceiver
        expression.valueType = 'number'
        return 'number'
      }

      if (objectType === 'array') {
        this.checkAssignableType(indexType, 'number', expression.index.loc, false, false)
        const valueType = this.resolveExpressionArrayElementType(expression.object) ?? 'unknown'
        const declaredType = this.resolveExpressionArrayElementDeclaredType(expression.object)
        const functionType = this.resolveExpressionArrayElementFunctionType(expression.object)
        expression.nullable = optionalChainReceiver
        expression.optionalChainProtected = optionalChainReceiver
        expression.valueType = valueType
        expression.arrayElementDeclaredType = declaredType
        expression.functionType = functionType
        expression.shape = this.resolveArrayElementObjectShape(valueType, declaredType, expression.loc)

        return valueType
      }

      if (objectType === 'object') {
        const shape = this.resolveExpressionShape(expression.object)

        if (shape !== null && typeof shape !== 'undefined' && shape.dynamic === true) {
          this.checkAssignableType(
            indexType,
            'string',
            expression.index.loc,
            false,
            this.expressionCanBeNull(expression.index)
          )

          const field = this.findShapeField(shape, '')

          if (field !== null && typeof field !== 'undefined') {
            const fieldType = this.resolveFieldDeclaredType(field)
            const valueType = resolvedConcreteValueTypeMetadata(field.valueType, fieldType.valueType)

            const fieldNullable = resolvedFieldNullableMetadata(field, fieldType)

            expression.nullable = optionalChainReceiver || fieldNullable
            expression.optionalChainProtected = optionalChainReceiver && !fieldNullable
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

            if (field.className !== null && typeof field.className !== 'undefined') {
              expression.className = field.className
            }

            return valueType
          }
        }
      }

      return 'unknown'
    }

    const shape = this.resolveExpressionShape(expression.object)

    if (shape === null || typeof shape === 'undefined') {
      return 'unknown'
    }

    const field = this.findShapeField(shape, expression.index.value)

    if (field === null || typeof field === 'undefined') {
      this.report('INOX_UNKNOWN_FIELD', `unknown field ${expression.index.value}`, expression.index.loc)
      return 'unknown'
    }

    const fieldType = this.resolveFieldDeclaredType(field)
    const valueType = resolvedConcreteValueTypeMetadata(field.valueType, fieldType.valueType)

    const fieldNullable = resolvedFieldNullableMetadata(field, fieldType)

    expression.nullable = optionalChainReceiver || fieldNullable
    expression.optionalChainProtected = optionalChainReceiver && !fieldNullable
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

    if (field.className !== null && typeof field.className !== 'undefined') {
      expression.className = field.className
    }

    return valueType
  }

  checkOptionalIndexExpression(expression: AnyNode): ValueType {
    const objectType = this.checkExpression(expression.object)
    const indexType = this.checkExpression(expression.index)

    if (this.reportUnsupportedClassPrototypeAccess(expression, true)) {
      return 'unknown'
    }

    if (expression.index.type !== 'StringLiteral') {
      if (objectType === 'array') {
        this.checkAssignableType(indexType, 'number', expression.index.loc, false, false)
        const valueType = this.resolveExpressionArrayElementType(expression.object) ?? 'unknown'
        const declaredType = this.resolveExpressionArrayElementDeclaredType(expression.object)
        const functionType = this.resolveExpressionArrayElementFunctionType(expression.object)

        expression.nullable = true
        expression.optionalChainProtected = true
        expression.valueType = valueType
        expression.arrayElementDeclaredType = declaredType
        expression.functionType = functionType
        expression.shape = this.resolveArrayElementObjectShape(valueType, declaredType, expression.loc)

        return valueType
      }

      expression.nullable = true
      expression.valueType = 'unknown'

      return 'unknown'
    }

    const shape = this.resolveExpressionShape(expression.object)

    if (shape === null || typeof shape === 'undefined') {
      expression.nullable = true
      expression.valueType = 'unknown'
      return 'unknown'
    }

    const field = this.findShapeField(shape, expression.index.value)

    if (field === null || typeof field === 'undefined') {
      this.report('INOX_UNKNOWN_FIELD', `unknown field ${expression.index.value}`, expression.index.loc)
      expression.nullable = true
      expression.valueType = 'unknown'
      return 'unknown'
    }

    const fieldType = this.resolveFieldDeclaredType(field)
    const valueType = resolvedConcreteValueTypeMetadata(field.valueType, fieldType.valueType)
    const fieldNullable = resolvedFieldNullableMetadata(field, fieldType)

    expression.nullable = true
    expression.optionalChainProtected = !fieldNullable
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

    if (field.className !== null && typeof field.className !== 'undefined') {
      expression.className = field.className
    }

    return valueType
  }

  checkIndexAssignment(expression: AnyNode): ValueType {
    const objectType = this.checkExpression(expression.target.object)
    const indexType = this.checkExpression(expression.target.index)
    const valueType = this.checkExpression(expression.value)

    if (this.reportUnsupportedClassPrototypeAccess(expression.target, false)) {
      return valueType
    }

    if (this.isClassInstanceExpression(expression.target.object)) {
      this.report('INOX_C_CLASS', 'dynamic writes to class fields are not supported', expression.target.loc)
      return valueType
    }

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
      if (objectType === 'object') {
        const shape = this.resolveExpressionShape(expression.target.object)

        if (shape !== null && typeof shape !== 'undefined' && shape.dynamic === true) {
          this.checkAssignableType(
            indexType,
            'string',
            expression.target.index.loc,
            false,
            this.expressionCanBeNull(expression.target.index)
          )

          const field = this.findShapeField(shape, '')

          if (field !== null && typeof field !== 'undefined') {
            const fieldType = this.resolveFieldDeclaredType(field)
            const targetValueType = resolvedConcreteValueTypeMetadata(field.valueType, fieldType.valueType)

            expression.target.nullable = resolvedFieldNullableMetadata(field, fieldType)
            expression.target.valueType = targetValueType
            expression.target.arrayElementType = resolvedValueTypeMetadata(
              field.arrayElementType,
              fieldType.arrayElementType
            )
            expression.target.arrayElementDeclaredType = resolvedStringMetadata(
              field.arrayElementDeclaredType,
              fieldType.arrayElementDeclaredType
            )
            expression.target.mapKeyType = resolvedValueTypeMetadata(field.mapKeyType, fieldType.mapKeyType)
            expression.target.mapValueType = resolvedValueTypeMetadata(field.mapValueType, fieldType.mapValueType)
            expression.target.promiseValueType = resolvedValueTypeMetadata(
              field.promiseValueType,
              fieldType.promiseValueType
            )
            expression.target.setElementType = resolvedValueTypeMetadata(field.setElementType, fieldType.setElementType)
            expression.target.shape = resolvedObjectShapeMetadata(field.shape, fieldType.shape)
            expression.target.functionType = resolvedFunctionTypeMetadata(field.functionType, fieldType.functionType)
            expression.target.className = null

            if (field.className !== null && typeof field.className !== 'undefined') {
              expression.target.className = field.className
            }

            this.checkAssignableType(
              valueType,
              fieldType.valueType,
              expression.value.loc,
              false,
              this.expressionCanBeNull(expression.value)
            )

            return valueType
          }
        }
      }

      return valueType
    }

    const shape = this.resolveExpressionShape(expression.target.object)

    if (shape === null || typeof shape === 'undefined') {
      return valueType
    }

    const field = this.findShapeField(shape, expression.target.index.value)

    if (field === null || typeof field === 'undefined') {
      this.report('INOX_UNKNOWN_FIELD', `unknown field ${expression.target.index.value}`, expression.target.index.loc)
      return valueType
    }

    if (field.readonly === true) {
      if (!this.canInitializeReadonlyClassField(expression.target.object)) {
        this.report(
          'INOX_ASSIGN_READONLY_FIELD',
          `cannot assign to readonly field ${expression.target.index.value}`,
          expression.target.loc
        )
      }
    }

    const fieldType = this.resolveFieldDeclaredType(field)
    const targetValueType = resolvedConcreteValueTypeMetadata(field.valueType, fieldType.valueType)
    const targetNullable = resolvedFieldNullableMetadata(field, fieldType)

    expression.target.nullable = targetNullable
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

    if (field.className !== null && typeof field.className !== 'undefined') {
      expression.target.className = field.className
    }

    this.checkAssignableType(
      valueType,
      fieldType.valueType,
      expression.value.loc,
      targetNullable,
      this.expressionCanBeNull(expression.value)
    )

    if (
      fieldType.valueType === 'array' &&
      fieldType.arrayElementType !== null &&
      typeof fieldType.arrayElementType !== 'undefined'
    ) {
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
      let actualKey: ValueType | null = null
      let actualValue: ValueType | null = null

      if (actual !== null && typeof actual !== 'undefined') {
        actualKey = actual.key
        actualValue = actual.value
      }

      if (fieldType.mapKeyType !== null && typeof fieldType.mapKeyType !== 'undefined') {
        this.checkAssignableType(actualKey, fieldType.mapKeyType, expression.value.loc, false, false)
      }

      if (fieldType.mapValueType !== null && typeof fieldType.mapValueType !== 'undefined') {
        this.checkAssignableType(actualValue, fieldType.mapValueType, expression.value.loc, false, false)
      }
    }

    if (
      fieldType.valueType === 'set' &&
      fieldType.setElementType !== null &&
      typeof fieldType.setElementType !== 'undefined'
    ) {
      this.checkAssignableType(
        this.resolveExpressionSetElementType(expression.value),
        fieldType.setElementType,
        expression.value.loc,
        false,
        false
      )
    }

    if (
      fieldType.valueType === 'promise' &&
      fieldType.promiseValueType !== null &&
      typeof fieldType.promiseValueType !== 'undefined'
    ) {
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

  isClassShapeMutationTarget(expression: AnyNode): boolean {
    if (expression.type === 'MemberExpression') {
      return this.isClassInstanceExpression(expression.object)
    }

    if (expression.type === 'IndexExpression') {
      return this.isClassInstanceExpression(expression.object)
    }

    return false
  }

  isClassInstanceExpression(expression: AnyNode): boolean {
    const className = this.resolveClassMethodReceiverClassName(expression)

    return className !== null && typeof className !== 'undefined'
  }

  hasStringReturningClassToStringMethod(expression: AnyNode): boolean {
    const className = this.resolveClassMethodReceiverClassName(expression)

    if (className === null || typeof className === 'undefined') {
      return false
    }

    const classSymbol = this.scope.resolve(className)

    if (classSymbol === null || typeof classSymbol === 'undefined') {
      return false
    }

    const classMethods = classSymbol.classMethods

    if (classMethods === null || typeof classMethods === 'undefined') {
      return false
    }

    for (let index = 0; index < classMethods.length; index = index + 1) {
      const method = checkerNodeAt(classMethods, index)

      if (!nodeNameEquals(method, 'toString')) {
        continue
      }

      const params: OptionalParamInfo[] = []

      for (let paramIndex = 0; paramIndex < method.params.length; paramIndex = paramIndex + 1) {
        const param = checkerNodeAt(method.params, paramIndex)

        params.push(this.resolveParam(param))
      }

      const returnInfo = this.resolveDeclaredType(method.returnType, method.loc)

      return returnInfo.valueType === 'string' && acceptsArgumentCount(params, 0)
    }

    return false
  }

  hasClassInstanceMethod(expression: AnyNode, methodName: string): boolean {
    const className = this.resolveClassMethodReceiverClassName(expression)

    if (className === null || typeof className === 'undefined') {
      return false
    }

    const classSymbol = this.scope.resolve(className)

    if (classSymbol === null || typeof classSymbol === 'undefined') {
      return false
    }

    const classMethods = classSymbol.classMethods

    if (classMethods === null || typeof classMethods === 'undefined') {
      return false
    }

    for (let index = 0; index < classMethods.length; index = index + 1) {
      const method = checkerNodeAt(classMethods, index)

      if (nodeNameEquals(method, methodName)) {
        return true
      }
    }

    return false
  }

  reportUnsupportedClassPrototypeAccess(expression: AnyNode, nullable: boolean): boolean {
    const object = classPrototypeAccessObject(expression)

    if (object === null || typeof object === 'undefined') {
      return false
    }

    if (!this.isClassConstructorReference(object)) {
      return false
    }

    this.report('INOX_CLASS_PROTOTYPE', 'class prototype access is not supported', expression.loc)
    expression.nullable = nullable
    expression.valueType = 'unknown'

    return true
  }

  isClassConstructorReference(expression: AnyNode): boolean {
    if (expression.type !== 'Reference' || expression.path.length !== 1) {
      return false
    }

    const name = firstPathSegment(expression.path)

    if (this.classNames.has(name)) {
      return true
    }

    const symbol = this.scope.resolve(name)

    return symbol !== null && typeof symbol !== 'undefined' && symbol.kind === 'class'
  }

  checkCallExpression(expression: AnyNode): ValueType {
    const consoleType = this.checkConsoleCall(expression)

    if (consoleType !== null && typeof consoleType !== 'undefined') {
      return consoleType
    }

    const timeType = this.checkTimeCall(expression)

    if (timeType !== null && typeof timeType !== 'undefined') {
      return timeType
    }

    const binaryType = this.checkBinaryCall(expression)

    if (binaryType !== null && typeof binaryType !== 'undefined') {
      return binaryType
    }

    const bufferUnsupportedType = this.checkBufferUnsupportedCall(expression)

    if (bufferUnsupportedType !== null && typeof bufferUnsupportedType !== 'undefined') {
      return bufferUnsupportedType
    }

    const eventStreamUnsupportedType = this.checkEventStreamUnsupportedCall(expression)

    if (eventStreamUnsupportedType !== null && typeof eventStreamUnsupportedType !== 'undefined') {
      return eventStreamUnsupportedType
    }

    const stringConversionType = this.checkStringConversionCall(expression)

    if (stringConversionType !== null && typeof stringConversionType !== 'undefined') {
      return stringConversionType
    }

    const regexpTestType = this.checkRegExpTestCall(expression)

    if (regexpTestType !== null && typeof regexpTestType !== 'undefined') {
      return regexpTestType
    }

    const numberConversionType = this.checkNumberConversionCall(expression)

    if (numberConversionType !== null && typeof numberConversionType !== 'undefined') {
      return numberConversionType
    }

    const numericCastType = this.checkNumericCastCall(expression)

    if (numericCastType !== null && typeof numericCastType !== 'undefined') {
      return numericCastType
    }

    const numberToStringType = this.checkNumberToStringCall(expression)

    if (numberToStringType !== null && typeof numberToStringType !== 'undefined') {
      return numberToStringType
    }

    const stringCharCodeAtType = this.checkStringCharCodeAtCall(expression)

    if (stringCharCodeAtType !== null && typeof stringCharCodeAtType !== 'undefined') {
      return stringCharCodeAtType
    }

    const stringIndexType = this.checkStringIndexCall(expression)

    if (stringIndexType !== null && typeof stringIndexType !== 'undefined') {
      return stringIndexType
    }

    const stringTrimType = this.checkStringTrimCall(expression)

    if (stringTrimType !== null && typeof stringTrimType !== 'undefined') {
      return stringTrimType
    }

    const stringCaseType = this.checkStringCaseCall(expression)

    if (stringCaseType !== null && typeof stringCaseType !== 'undefined') {
      return stringCaseType
    }

    const stringPadStartType = this.checkStringPadStartCall(expression)

    if (stringPadStartType !== null && typeof stringPadStartType !== 'undefined') {
      return stringPadStartType
    }

    const stringSliceType = this.checkStringSliceCall(expression)

    if (stringSliceType !== null && typeof stringSliceType !== 'undefined') {
      return stringSliceType
    }

    const stringSplitType = this.checkStringSplitCall(expression)

    if (stringSplitType !== null && typeof stringSplitType !== 'undefined') {
      return stringSplitType
    }

    const stringMethodType = this.checkStringPredicateCall(expression)

    if (stringMethodType !== null && typeof stringMethodType !== 'undefined') {
      return stringMethodType
    }

    const arrayFromType = this.checkArrayFromCall(expression)

    if (arrayFromType !== null && typeof arrayFromType !== 'undefined') {
      return arrayFromType
    }

    const arrayMethodType = this.checkArrayMethodCall(expression)

    if (arrayMethodType !== null && typeof arrayMethodType !== 'undefined') {
      return arrayMethodType
    }

    const collectionMethodType = this.checkCollectionMethodCall(expression)

    if (collectionMethodType !== null && typeof collectionMethodType !== 'undefined') {
      return collectionMethodType
    }

    const promiseMethodType = this.checkPromiseMethodCall(expression)

    if (promiseMethodType !== null && typeof promiseMethodType !== 'undefined') {
      return promiseMethodType
    }

    const timerHandleMethodType = this.checkTimerHandleMethodCall(expression)

    if (timerHandleMethodType !== null && typeof timerHandleMethodType !== 'undefined') {
      return timerHandleMethodType
    }

    const fsStatsMethodType = this.checkFsStatsMethodCall(expression)

    if (fsStatsMethodType !== null && typeof fsStatsMethodType !== 'undefined') {
      return fsStatsMethodType
    }

    const fetchAbortControllerMethodType = this.checkFetchAbortControllerMethodCall(expression)

    if (fetchAbortControllerMethodType !== null && typeof fetchAbortControllerMethodType !== 'undefined') {
      return fetchAbortControllerMethodType
    }

    const fetchResponseMethodType = this.checkFetchResponseMethodCall(expression)

    if (fetchResponseMethodType !== null && typeof fetchResponseMethodType !== 'undefined') {
      return fetchResponseMethodType
    }

    const fetchHeadersMethodType = this.checkFetchHeadersMethodCall(expression)

    if (fetchHeadersMethodType !== null && typeof fetchHeadersMethodType !== 'undefined') {
      return fetchHeadersMethodType
    }

    const urlSearchParamsMethodType = this.checkUrlSearchParamsMethodCall(expression)

    if (urlSearchParamsMethodType !== null && typeof urlSearchParamsMethodType !== 'undefined') {
      return urlSearchParamsMethodType
    }

    const cryptoHashMethodType = this.checkCryptoHashMethodCall(expression)

    if (cryptoHashMethodType !== null && typeof cryptoHashMethodType !== 'undefined') {
      return cryptoHashMethodType
    }

    const fsType = this.checkFsCall(expression)

    if (fsType !== null && typeof fsType !== 'undefined') {
      return fsType
    }

    const fetchType = this.checkFetchCall(expression)

    if (fetchType !== null && typeof fetchType !== 'undefined') {
      return fetchType
    }

    const jsonType = this.checkJsonCall(expression, null)

    if (jsonType !== null && typeof jsonType !== 'undefined') {
      return jsonType
    }

    const cryptoType = this.checkCryptoCall(expression)

    if (cryptoType !== null && typeof cryptoType !== 'undefined') {
      return cryptoType
    }

    const childProcessType = this.checkChildProcessCall(expression)

    if (childProcessType !== null && typeof childProcessType !== 'undefined') {
      return childProcessType
    }

    const osType = this.checkOsCall(expression)

    if (osType !== null && typeof osType !== 'undefined') {
      return osType
    }

    const processType = this.checkProcessCall(expression)

    if (processType !== null && typeof processType !== 'undefined') {
      return processType
    }

    const urlType = this.checkUrlCall(expression)

    if (urlType !== null && typeof urlType !== 'undefined') {
      return urlType
    }

    const pathType = this.checkPathCall(expression)

    if (pathType !== null && typeof pathType !== 'undefined') {
      return pathType
    }

    const debugMemoryType = this.checkDebugMemoryCall(expression)

    if (debugMemoryType !== null && typeof debugMemoryType !== 'undefined') {
      return debugMemoryType
    }

    const timerType = this.checkTimerCall(expression)

    if (timerType !== null && typeof timerType !== 'undefined') {
      return timerType
    }

    const promiseStaticType = this.checkPromiseStaticCall(expression)

    if (promiseStaticType !== null && typeof promiseStaticType !== 'undefined') {
      return promiseStaticType
    }

    const classMethodType = this.checkClassMethodCall(expression)

    if (classMethodType !== null && typeof classMethodType !== 'undefined') {
      return classMethodType
    }

    const mathType = this.checkMathCall(expression)

    if (mathType !== null && typeof mathType !== 'undefined') {
      return mathType
    }

    const arrayIsArrayType = this.checkArrayIsArrayCall(expression)

    if (arrayIsArrayType !== null && typeof arrayIsArrayType !== 'undefined') {
      return arrayIsArrayType
    }

    const objectValuesType = this.checkObjectStaticCall(expression)

    if (objectValuesType !== null && typeof objectValuesType !== 'undefined') {
      return objectValuesType
    }

    this.checkExpression(expression.callee)
    const argInfos = this.checkedCallArgInfos(expression)

    const symbol = this.getCallableSymbol(expression.callee)

    if (symbol === null || typeof symbol === 'undefined') {
      return 'unknown'
    }

    return applyCallableSymbolCallInContext(this.callableSymbolContext(), expression, symbol, argInfos)
  }

  checkConsoleCall(expression: AnyNode): ValueType | null {
    const valueType = checkConsoleCallInContext(
      this.globalCallContext(),
      expression,
      this.runtimeGlobalIsShadowed('console')
    )

    if (valueType !== null && typeof valueType !== 'undefined') {
      this.checkCallArgumentTypes(expression)
    }

    return valueType
  }

  checkBinaryCall(expression: AnyNode): ValueType | null {
    if (expression.callee.type !== 'MemberExpression') {
      return null
    }

    const path = memberExpressionPath(expression.callee)
    const staticMethod = binaryStaticRuntimeMethodName(path, this.resolveMemberPathRootSymbol(path))

    if (staticMethod !== null && typeof staticMethod !== 'undefined') {
      if (staticMethod === 'from') {
        if (expression.args.length < 1 || expression.args.length > 2) {
          this.report(
            'INOX_ARG_COUNT',
            `function Buffer.from expects 1 or 2 argument(s), got ${expression.args.length}`,
            expression.loc
          )
        }

        if (expression.args[0] !== null && typeof expression.args[0] !== 'undefined') {
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
            'INOX_ARG_COUNT',
            `function Buffer.isBuffer expects 1 argument(s), got ${expression.args.length}`,
            expression.loc
          )
        }

        if (expression.args[0] !== null && typeof expression.args[0] !== 'undefined') {
          this.checkExpression(expression.args[0])
        }

        expression.binaryRuntimeMethod = staticMethod
        expression.valueType = 'boolean'

        return 'boolean'
      }

      if (staticMethod === 'alloc') {
        if (expression.args.length !== 1) {
          this.report(
            'INOX_ARG_COUNT',
            `function Buffer.alloc expects 1 argument(s), got ${expression.args.length}`,
            expression.loc
          )
        }

        if (expression.args[0] !== null && typeof expression.args[0] !== 'undefined') {
          this.checkAssignableType(
            this.checkExpression(expression.args[0]),
            'number',
            expression.args[0].loc,
            false,
            false
          )
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
          'INOX_ARG_COUNT',
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
          'INOX_ARG_COUNT',
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

  checkBufferUnsupportedCall(expression: AnyNode): ValueType | null {
    const path = memberExpressionPath(expression.callee)
    const unsupported = unsupportedBufferRuntimeExport(
      path,
      this.resolveStdlibRuntimeDirectImportName(path, 'buffer'),
      this.resolveMemberPathRootSymbol(path)
    )

    if (unsupported === null || typeof unsupported === 'undefined') {
      return null
    }

    for (let index = 0; index < expression.args.length; index = index + 1) {
      const arg = checkerNodeAt(expression.args, index)

      this.checkExpression(arg)
    }

    this.report(
      'INOX_NOT_IMPLEMENTED',
      `node:buffer ${unsupported} is not implemented by the current C backend`,
      expression.loc
    )
    expression.valueType = 'unknown'

    return 'unknown'
  }

  checkEventStreamUnsupportedCall(expression: AnyNode): ValueType | null {
    const path = memberExpressionPath(expression.callee)
    const rootSymbol = this.resolveMemberPathRootSymbol(path)
    const eventsUsage = unsupportedEventsRuntimeExport(
      path,
      this.resolveStdlibRuntimeDirectImportName(path, 'events'),
      rootSymbol
    )
    const usage =
      eventsUsage ??
      unsupportedStreamRuntimeExport(path, this.resolveStdlibRuntimeDirectImportName(path, 'stream'), rootSymbol)

    if (usage === null || typeof usage === 'undefined') {
      return null
    }

    for (let index = 0; index < expression.args.length; index = index + 1) {
      const arg = checkerNodeAt(expression.args, index)

      this.checkExpression(arg)
    }

    this.report(
      'INOX_NOT_IMPLEMENTED',
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

    const path = expression.callee.path
    const rootSymbol = this.resolveMemberPathRootSymbol(path)
    const eventsUsage = unsupportedEventsRuntimeExport(
      path,
      this.resolveStdlibRuntimeDirectImportName(path, 'events'),
      rootSymbol
    )
    const usage =
      eventsUsage ??
      unsupportedStreamRuntimeExport(path, this.resolveStdlibRuntimeDirectImportName(path, 'stream'), rootSymbol)

    if (usage === null || typeof usage === 'undefined') {
      return null
    }

    this.report(
      'INOX_NOT_IMPLEMENTED',
      `${usage.source} ${usage.name} is not implemented by the current C backend: ${usage.reason}`,
      expression.loc
    )
    expression.valueType = 'unknown'

    return 'unknown'
  }

  checkUtf8EncodingArg(expression: AnyNode, index: number, label: string): void {
    const arg = expression.args[index]

    if (arg === null || typeof arg === 'undefined') {
      return
    }

    const argType = this.checkExpression(arg)

    this.checkAssignableType(argType, 'string', arg.loc, false, this.expressionCanBeNull(arg))

    if (arg.type !== 'StringLiteral' || arg.value !== 'utf8') {
      this.report('INOX_TYPE_MISMATCH', `${label} encoding must be 'utf8' in the MVP`, arg.loc)
    }
  }

  checkCryptoCall(expression: AnyNode): ValueType | null {
    const path = memberExpressionPath(expression.callee)
    const importedName = this.resolveStdlibRuntimeDirectImportName(path, 'crypto')
    const moduleObjectMemberName = this.resolveStdlibModuleObjectMemberName(path, 'crypto')
    const call = cryptoRuntimeCallInfo(path, importedName, moduleObjectMemberName)

    if (call === null || typeof call === 'undefined') {
      return null
    }

    const diagnostics: CryptoCheckerDiagnostic[] = []
    const context: CryptoCheckerContext = {
      argNullables: this.cryptoArgumentNullables(expression),
      argTypes: this.cryptoArgumentTypes(expression),
      diagnostics,
      importedName,
      moduleObjectMemberName,
      supportsCryptoHash: this.supportsCryptoHash()
    }
    const valueType = checkPackageCryptoCall(expression, context)

    this.reportCryptoCheckerDiagnostics(diagnostics)

    return valueType
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

    const diagnostics: CryptoCheckerDiagnostic[] = []
    const context: CryptoHashMethodCheckerContext = {
      argNullables: this.cryptoHashMethodArgumentNullables(expression, method),
      argTypes: this.cryptoHashMethodArgumentTypes(expression, method),
      diagnostics
    }
    const valueType = checkPackageCryptoHashMethodCall(expression, objectType, context)

    this.reportCryptoCheckerDiagnostics(diagnostics)

    return valueType
  }

  cryptoArgumentTypes(expression: AnyNode): ValueType[] {
    const result: ValueType[] = []

    for (let index = 0; index < expression.args.length; index = index + 1) {
      const arg = checkerNodeAt(expression.args, index)

      result.push(this.checkExpression(arg))
    }

    return result
  }

  cryptoArgumentNullables(expression: AnyNode): boolean[] {
    const result: boolean[] = []

    for (let index = 0; index < expression.args.length; index = index + 1) {
      const arg = checkerNodeAt(expression.args, index)

      result.push(this.expressionCanBeNull(arg))
    }

    return result
  }

  cryptoHashMethodArgumentTypes(expression: AnyNode, method: string): ValueType[] {
    const result: ValueType[] = []

    if (expression.args[0] !== null && typeof expression.args[0] !== 'undefined') {
      result.push(this.checkExpression(expression.args[0]))
    }

    if (method === 'update' && expression.args[1] !== null && typeof expression.args[1] !== 'undefined') {
      result.push(this.checkExpression(expression.args[1]))
    }

    return result
  }

  cryptoHashMethodArgumentNullables(expression: AnyNode, method: string): boolean[] {
    const result: boolean[] = []

    if (expression.args[0] !== null && typeof expression.args[0] !== 'undefined') {
      result.push(this.expressionCanBeNull(expression.args[0]))
    }

    if (method === 'update' && expression.args[1] !== null && typeof expression.args[1] !== 'undefined') {
      result.push(this.expressionCanBeNull(expression.args[1]))
    }

    return result
  }

  reportCryptoCheckerDiagnostics(diagnostics: CryptoCheckerDiagnostic[]): void {
    for (let index = 0; index < diagnostics.length; index = index + 1) {
      const item = diagnostics[index]

      this.report(item.code, item.message, item.loc)
    }
  }

  checkChildProcessCall(expression: AnyNode): ValueType | null {
    const path = memberExpressionPath(expression.callee)
    const call = childProcessRuntimeCallInfo(
      path,
      this.resolveStdlibRuntimeDirectImportName(path, 'child-process'),
      this.resolveStdlibModuleObjectMemberName(path, 'child-process')
    )

    if (call === null || typeof call === 'undefined') {
      return null
    }

    return checkChildProcessCallInContext(
      this.childProcessCallContext(),
      expression,
      call,
      this.checkedChildProcessCallInfo(expression, call.method, call.unsupported === true)
    )
  }

  checkedChildProcessCallInfo(
    expression: AnyNode,
    method: string,
    unsupported: boolean
  ): CheckedChildProcessCallInfo {
    if (unsupported) {
      return {
        args: null,
        firstArg: null,
        options: null,
        topLevelArgs: this.checkedChildProcessTopLevelArgs(expression)
      }
    }

    if (method === 'execSync') {
      return {
        args: null,
        firstArg: this.checkedChildProcessArg(expression.args[0]),
        options: this.checkedChildProcessOptionsInfo(expression.args[1]),
        topLevelArgs: []
      }
    }

    const second = expression.args[1]
    let args: AnyNode | null = null
    let options: AnyNode | null = null

    if (second !== null && typeof second !== 'undefined' && second.type === 'ObjectLiteral') {
      options = second
    } else {
      if (second !== null && typeof second !== 'undefined') {
        args = second
      }

      if (expression.args[2] !== null && typeof expression.args[2] !== 'undefined') {
        options = expression.args[2]
      }
    }

    return {
      args: this.checkedChildProcessArgsInfo(args),
      firstArg: this.checkedChildProcessArg(expression.args[0]),
      options: this.checkedChildProcessOptionsInfo(options),
      topLevelArgs: []
    }
  }

  checkedChildProcessTopLevelArgs(expression: AnyNode): CheckedChildProcessValueInfo[] {
    const result: CheckedChildProcessValueInfo[] = []

    for (let index = 0; index < expression.args.length; index = index + 1) {
      const arg = checkerNodeAt(expression.args, index)

      result.push(this.checkedChildProcessValueInfo(arg))
    }

    return result
  }

  checkedChildProcessArg(arg: AnyNode | null | undefined): CheckedChildProcessValueInfo | null {
    if (arg === null || typeof arg === 'undefined') {
      return null
    }

    return this.checkedChildProcessValueInfo(arg)
  }

  checkedChildProcessValueInfo(node: AnyNode): CheckedChildProcessValueInfo {
    return {
      loc: node.loc,
      node,
      valueType: this.checkExpression(node)
    }
  }

  checkedChildProcessArgsInfo(node: AnyNode | null | undefined): CheckedChildProcessArgsInfo | null {
    if (node === null || typeof node === 'undefined') {
      return null
    }

    const elements: CheckedChildProcessValueInfo[] = []

    if (node.type === 'ArrayLiteral') {
      for (let index = 0; index < node.elements.length; index = index + 1) {
        const element = checkerNodeAt(node.elements, index)

        elements.push(this.checkedChildProcessValueInfo(element))
      }
    }

    return {
      elements,
      node
    }
  }

  checkedChildProcessOptionsInfo(node: AnyNode | null | undefined): CheckedChildProcessOptionsInfo | null {
    if (node === null || typeof node === 'undefined') {
      return {
        node: null,
        properties: []
      }
    }

    if (node.type !== 'ObjectLiteral') {
      return {
        node,
        properties: []
      }
    }

    const properties: CheckedChildProcessOptionInfo[] = []
    const optionProperties: CheckerObjectPropertyNode[] = node.properties

    for (const property of optionProperties) {
      properties.push(this.checkedChildProcessOptionInfo(property.key, property.value, property.loc))
    }

    return {
      node,
      properties
    }
  }

  checkedChildProcessOptionInfo(
    key: string,
    value: AnyNode,
    loc: SourceLocation
  ): CheckedChildProcessOptionInfo {
    const envProperties: CheckedChildProcessEnvPropertyInfo[] = []
    let valueType: ValueType = 'unknown'

    if (key === 'env' && value.type === 'ObjectLiteral') {
      const properties: CheckerObjectPropertyNode[] = value.properties

      for (const property of properties) {
        envProperties.push({
          key: property.key,
          loc: property.loc,
          value: property.value,
          valueType: this.checkExpression(property.value)
        })
      }
    } else if (key !== 'encoding' && key !== 'stdio') {
      valueType = this.checkExpression(value)
    }

    return {
      envProperties,
      key,
      loc,
      value,
      valueType
    }
  }

  checkOsCall(expression: AnyNode): ValueType | null {
    const path = memberExpressionPath(expression.callee)
    const call = osRuntimeCallInfo(
      path,
      this.resolveStdlibRuntimeDirectImportName(path, 'os'),
      this.resolveStdlibModuleObjectMemberName(path, 'os')
    )

    if (call === null || typeof call === 'undefined') {
      return null
    }

    this.checkedCallArgInfos(expression)

    return checkOsCallInContext(this.nodeRuntimeCallContext(), expression, call)
  }

  checkOsConstantMemberExpression(expression: AnyNode): ValueType | null {
    const path = memberExpressionPath(expression)
    const constant = osRuntimeConstantName(
      this.resolveStdlibRuntimeDirectImportName(path, 'os'),
      this.resolveStdlibModuleObjectMemberName(path, 'os')
    )

    if (constant === null || typeof constant === 'undefined') {
      return null
    }

    expression.osRuntimeConstant = constant
    expression.valueType = 'string'

    return 'string'
  }

  checkProcessCall(expression: AnyNode): ValueType | null {
    const path = memberExpressionPath(expression.callee)
    const rootSymbol = this.resolveMemberPathRootSymbol(path)
    const call = processRuntimeCallInfo(
      path,
      this.resolveStdlibRuntimeDirectImportName(path, 'process'),
      this.resolveStdlibModuleObjectMemberName(path, 'process'),
      rootSymbol
    )

    if (call === null || typeof call === 'undefined') {
      return null
    }

    return checkProcessCallInContext(this.nodeRuntimeCallContext(), expression, call, this.checkedCallArgInfos(expression))
  }

  checkProcessMemberExpression(expression: AnyNode): ValueType | null {
    const path = memberExpressionPath(expression)
    const info = processRuntimeMemberInfo(path, this.resolveMemberPathRootSymbol(path))

    if (info === null || typeof info === 'undefined') {
      return null
    }

    if (expression.object !== null && typeof expression.object !== 'undefined') {
      this.checkExpression(expression.object)
    }

    if (info.kind === 'unsupported-property') {
      this.report(
        'INOX_NOT_IMPLEMENTED',
        `node:process ${info.property} is not implemented by the current C backend`,
        expression.loc
      )
      expression.valueType = 'unknown'
      return 'unknown'
    }

    if (info.kind === 'env-name') {
      expression.processRuntimeEnvName = info.name
      expression.valueType = 'string'
      return 'string'
    }

    expression.processRuntimeProperty = info.property
    expression.valueType = info.valueType
    expression.shape = info.shape ?? null
    return expression.valueType
  }

  checkProcessMemberAssignment(expression: AnyNode): ValueType | null {
    const path = memberExpressionPath(expression.target)
    const property = processRuntimeAssignmentProperty(path, this.resolveMemberPathRootSymbol(path))

    if (property === null || typeof property === 'undefined') {
      return null
    }

    const valueType = this.checkExpression(expression.value)
    this.checkAssignableType(valueType, 'number', expression.value.loc, false, false)
    expression.processRuntimeProperty = property
    expression.valueType = 'number'

    return 'number'
  }

  checkProcessIndexExpression(expression: AnyNode): ValueType | null {
    const path = memberExpressionPath(expression.object)
    const property = processRuntimeIndexProperty(path, this.resolveMemberPathRootSymbol(path))

    if (property === null || typeof property === 'undefined') {
      return null
    }

    const indexType = this.checkExpression(expression.index)
    this.checkAssignableType(indexType, 'number', expression.index.loc, false, false)
    expression.processRuntimeProperty = property
    expression.valueType = 'string'

    return 'string'
  }

  checkUrlCall(expression: AnyNode): ValueType | null {
    const path = memberExpressionPath(expression.callee)
    const call = urlRuntimeCallInfo(
      path,
      this.resolveStdlibRuntimeDirectImportName(path, 'url'),
      this.resolveStdlibModuleObjectMemberName(path, 'url')
    )

    if (call === null || typeof call === 'undefined') {
      return null
    }

    return checkUrlCallInContext(this.nodeRuntimeCallContext(), expression, call, this.checkedCallArgInfos(expression))
  }

  checkUrlSearchParamsMethodCall(expression: AnyNode): ValueType | null {
    if (expression.callee.type !== 'MemberExpression' || !isUrlSearchParamsRuntimeMethod(expression.callee.property)) {
      return null
    }

    const objectType = this.checkExpression(expression.callee.object)
    const shape = this.resolveExpressionShape(expression.callee.object)

    if (
      objectType !== 'object' ||
      shape === null ||
      typeof shape === 'undefined' ||
      shape.builtin !== 'url.URLSearchParams'
    ) {
      return null
    }

    return checkUrlSearchParamsMethodCallInContext(
      this.nodeRuntimeCallContext(),
      expression,
      expression.callee.property,
      this.checkedCallArgInfos(expression)
    )
  }

  checkPathCall(expression: AnyNode): ValueType | null {
    const path = memberExpressionPath(expression.callee)
    const call = pathRuntimeCallInfo(
      path,
      this.resolveStdlibRuntimeDirectImportName(path, 'path'),
      this.resolveStdlibModuleObjectMemberName(path, 'path'),
      this.resolveMemberPathRootSymbol(path)
    )

    if (call === null || typeof call === 'undefined') {
      return null
    }

    return checkPathCallInContext(this.nodeRuntimeCallContext(), expression, call, this.checkedCallArgInfos(expression))
  }

  checkPathConstantMemberExpression(expression: AnyNode): ValueType | null {
    const path = memberExpressionPath(expression)
    const constant = pathRuntimeConstantName(
      path,
      this.resolveStdlibModuleObjectMemberName(path, 'path'),
      this.resolveMemberPathRootSymbol(path)
    )

    if (constant === null || typeof constant === 'undefined') {
      return null
    }

    expression.valueType = 'string'
    expression.pathRuntimeConstant = constant

    return 'string'
  }

  checkBufferConstantMemberExpression(expression: AnyNode): ValueType | null {
    const path = memberExpressionPath(expression)
    const constant = bufferRuntimeConstantName(path, this.resolveMemberPathRootSymbol(path))

    if (constant === null || typeof constant === 'undefined') {
      return null
    }

    expression.bufferRuntimeConstant = constant
    expression.valueType = 'number'

    return 'number'
  }

  checkDebugMemoryCall(expression: AnyNode): ValueType | null {
    return checkDebugMemoryCallInContext(this.globalCallContext(), expression)
  }

  checkClassMethodCall(expression: AnyNode): ValueType | null {
    if (expression.callee.type !== 'MemberExpression') {
      return null
    }

    this.checkExpression(expression.callee.object)
    const className = this.resolveClassMethodReceiverClassName(expression.callee.object)

    if (className === null || typeof className === 'undefined') {
      return null
    }

    const classSymbol = this.scope.resolve(className)
    let method: AnyNode | null = null

    if (classSymbol !== null && typeof classSymbol !== 'undefined') {
      const classMethods = classSymbol.classMethods

      if (classMethods !== null && typeof classMethods !== 'undefined') {
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

    if (method === null || typeof method === 'undefined') {
      this.report('INOX_UNKNOWN_FIELD', `unknown method ${expression.callee.property}`, expression.callee.loc)
      expression.valueType = 'unknown'
      return 'unknown'
    }

    const params: AnyNode[] = []

    for (let index = 0; index < method.params.length; index = index + 1) {
      const param = checkerNodeAt(method.params, index)

      params.push(this.resolveParam(param))
    }

    const returnInfo = this.resolveDeclaredType(method.returnType, method.loc)

    if (!acceptsArgumentCount(params, expression.args.length)) {
      this.report(
        'INOX_ARG_COUNT',
        argumentCountMessage(`method ${expression.callee.property}`, params, expression.args.length),
        expression.loc
      )
    }

    for (let index = 0; index < expression.args.length; index = index + 1) {
      const param = paramForArgument(params, index)

      if (param !== null && typeof param !== 'undefined' && index < argTypes.length) {
        this.checkAssignableType(
          argTypes[index],
          argumentParamValueType(param),
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

    if (returnInfo.promiseValueType !== null && typeof returnInfo.promiseValueType !== 'undefined') {
      expression.promiseValueType = returnInfo.promiseValueType
    }

    expression.setElementType = returnInfo.setElementType
    expression.shape = returnInfo.shape

    return returnInfo.valueType
  }

  checkMathCall(expression: AnyNode): ValueType | null {
    if (!isMathCallInContext(expression, this.runtimeGlobalIsShadowed('Math'))) {
      return null
    }

    return checkMathCallInContext(this.globalCallContext(), expression, this.checkedCallArgInfos(expression))
  }

  checkTimeCall(expression: AnyNode): ValueType | null {
    const dateInstanceType = this.checkDateInstanceMethodCall(expression)

    if (dateInstanceType !== null && typeof dateInstanceType !== 'undefined') {
      return dateInstanceType
    }

    const path = memberExpressionPath(expression.callee)
    const call = timeRuntimeCallInfo(path, this.resolveMemberPathRootSymbol(path))

    if (call === null || typeof call === 'undefined') {
      return null
    }

    return checkTimeCallInContext(this.timeCallContext(), expression, call, this.checkedCallArgInfos(expression))
  }

  checkDateInstanceMethodCall(expression: AnyNode): ValueType | null {
    if (expression.callee.type !== 'MemberExpression') {
      return null
    }

    const info = dateInstanceRuntimeMethodInfo(expression.callee.property)

    if (info === null || typeof info === 'undefined') {
      return null
    }

    const objectType = this.checkExpression(expression.callee.object)

    if (objectType !== 'date') {
      return null
    }

    return checkDateInstanceMethodCallInContext(
      this.timeCallContext(),
      expression,
      info,
      this.checkedCallArgInfos(expression)
    )
  }

  checkDateConstructorExpression(expression: AnyNode, argTypes: ValueType[]): ValueType | null {
    if (!this.isDateConstructorExpression(expression)) {
      return null
    }

    return checkDateConstructorExpressionInContext(this.timeCallContext(), expression, argTypes)
  }

  isDateConstructorExpression(expression: AnyNode): boolean {
    return isDateConstructorRuntimeExpression(memberExpressionPath(expression.callee), this.scope.resolve('Date'))
  }

  checkArrayIsArrayCall(expression: AnyNode): ValueType | null {
    const valueType = checkArrayIsArrayCallInContext(
      this.globalCallContext(),
      expression,
      this.runtimeGlobalIsShadowed('Array')
    )

    if (
      valueType !== null &&
      typeof valueType !== 'undefined' &&
      expression.args.length === 1 &&
      expression.args[0] !== null &&
      typeof expression.args[0] !== 'undefined'
    ) {
      this.checkExpression(expression.args[0])
    }

    return valueType
  }

  checkObjectStaticCall(expression: AnyNode): ValueType | null {
    if (!isObjectStaticCallInContext(expression, this.runtimeGlobalIsShadowed('Object'))) {
      return null
    }

    return checkObjectStaticCallInContext(this.globalCallContext(), expression, this.checkedCallArgInfos(expression))
  }

  checkFsConstantMemberExpression(expression: AnyNode): ValueType | null {
    const path = memberExpressionPath(expression)
    let symbol: SymbolInfo | null = null

    if (path !== null && typeof path !== 'undefined') {
      symbol = this.scope.resolve(firstPathSegment(path))
    }

    const constantName = fsRuntimeConstantName(path, symbol)

    if (constantName === null || typeof constantName === 'undefined') {
      return null
    }

    expression.fsRuntimeConstant = constantName
    expression.valueType = 'number'

    return 'number'
  }

  checkFsStatsMethodCall(expression: AnyNode): ValueType | null {
    if (expression.callee.type !== 'MemberExpression') {
      return null
    }

    const objectType = this.checkExpression(expression.callee.object)
    const shape = this.resolveExpressionShape(expression.callee.object)

    if (
      objectType !== 'object' ||
      shape === null ||
      typeof shape === 'undefined'
    ) {
      return null
    }

    const info = fsStatsRuntimeMethodInfo(expression.callee.property, shape.builtin)

    if (info === null || typeof info === 'undefined') {
      return null
    }

    if (expression.args.length !== 0) {
      this.report(
        'INOX_ARG_COUNT',
        `function ${info.receiverName}.${expression.callee.property} expects 0 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    expression.fsRuntimeMethod = info.method
    expression.valueType = 'boolean'

    return 'boolean'
  }

  checkFetchCall(expression: AnyNode): ValueType | null {
    const method = fetchRuntimeCallName(expression.callee, this.scope.resolve('fetch'))

    if (method === null || typeof method === 'undefined') {
      return null
    }

    let initInfo: CheckedFetchInitInfo | null = null

    if (expression.args.length > 1) {
      initInfo = this.checkedFetchInitInfo(checkerNodeAt(expression.args, 1))
    }

    return checkFetchCallInContext(
      this.fetchCallContext(),
      expression,
      method,
      this.requireLibuvBackend('fetch', expression.loc),
      this.supportsFetchHttps(),
      this.checkedCallArgInfos(expression),
      initInfo
    )
  }

  checkedFetchInitInfo(expression: AnyNode): CheckedFetchInitInfo {
    if (expression.type !== 'ObjectLiteral') {
      this.checkExpression(expression)

      return {
        loc: expression.loc,
        isObjectLiteral: false,
        properties: []
      }
    }

    const properties: CheckedFetchInitPropertyInfo[] = []
    const nodeProperties: CheckerObjectPropertyNode[] = expression.properties

    for (const property of nodeProperties) {
      properties.push(this.checkedFetchInitPropertyInfo(property, property.key === 'headers'))
    }

    return {
      loc: expression.loc,
      isObjectLiteral: true,
      properties
    }
  }

  checkedFetchInitPropertyInfo(
    property: CheckerObjectPropertyNode,
    inspectHeaders: boolean
  ): CheckedFetchInitPropertyInfo {
    const headers: CheckedFetchHeaderInfo[] = []
    let valueType: ValueType = 'object'
    let shape: ObjectShapeInfo | null = null

    if (inspectHeaders && property.value.type === 'ObjectLiteral') {
      const headerProperties: CheckerObjectPropertyNode[] = property.value.properties

      for (const header of headerProperties) {
        headers.push(this.checkedFetchHeaderInfo(header))
      }
    } else {
      valueType = this.checkExpression(property.value)
      shape = this.resolveExpressionShape(property.value)
    }

    return {
      key: property.key,
      loc: property.loc,
      valueLoc: property.value.loc,
      valueType,
      nullable: this.expressionCanBeNull(property.value),
      shape,
      valueIsObjectLiteral: property.value.type === 'ObjectLiteral',
      supportedRedirectLiteral: isSupportedFetchRedirectLiteral(property.value),
      headers
    }
  }

  checkedFetchHeaderInfo(property: CheckerObjectPropertyNode): CheckedFetchHeaderInfo {
    return {
      key: property.key,
      loc: property.loc,
      nullable: this.expressionCanBeNull(property.value),
      valueLoc: property.value.loc,
      valueType: this.checkExpression(property.value)
    }
  }

  checkedFetchReceiverInfo(expression: AnyNode): CheckedFetchReceiverInfo {
    return {
      valueType: this.checkExpression(expression),
      shape: this.resolveExpressionShape(expression)
    }
  }

  supportsFetchHttps(): boolean {
    return this.options.tlsBackend === 'boringssl' || this.options.tlsBackend === 'openssl'
  }

  supportsCryptoHash(): boolean {
    return this.options.tlsBackend === 'boringssl' || this.options.tlsBackend === 'openssl'
  }

  resolveMemberPathRootSymbol(path: readonly string[] | null | undefined): SymbolInfo | null {
    if (path === null || typeof path === 'undefined' || path.length === 0) {
      return null
    }

    const root = firstPathSegment(path)
    const symbol = this.scope.resolve(root)

    if (symbol !== null && typeof symbol !== 'undefined') {
      return symbol
    }

    return builtinGlobalSymbol(root)
  }

  resolveStdlibRuntimeDirectImportName(
    path: readonly string[] | null | undefined,
    moduleId: StdlibModuleId
  ): string | null {
    if (path === null || typeof path === 'undefined' || path.length !== 1) {
      return null
    }

    const rootName = firstPathSegment(path)
    const symbol = this.scope.resolve(rootName)

    if (
      symbol === null ||
      typeof symbol === 'undefined' ||
      symbol.kind !== 'import' ||
      !isStdlibModuleImportSourceForId(symbol.importSource, moduleId) ||
      symbol.importedName === null ||
      typeof symbol.importedName === 'undefined'
    ) {
      return null
    }

    return symbol.importedName
  }

  resolveStdlibModuleObjectMemberName(
    path: readonly string[] | null | undefined,
    moduleId: StdlibModuleId
  ): string | null {
    if (path === null || typeof path === 'undefined' || path.length !== 2) {
      return null
    }

    const rootName = firstPathSegment(path)
    const symbol = this.scope.resolve(rootName)

    if (
      symbol === null ||
      typeof symbol === 'undefined' ||
      symbol.kind !== 'import' ||
      !isStdlibModuleRuntimeImportBinding(symbol.importSource, moduleId, 'module-object', symbol.importedName)
    ) {
      return null
    }

    return path[1]
  }

  checkRuntimeBuiltinImport(statement: AnyNode): void {
    if (statement.typeOnly) {
      return
    }

    if (!isStdlibModuleImportSource(statement.source) && !isRelativeImportSource(statement.source)) {
      this.report(
        'INOX_UNSUPPORTED_IMPORT_SOURCE',
        `only relative imports are implemented, got ${statement.source}`,
        statement.loc
      )
      return
    }

    if (isUnsupportedRuntimeBuiltinImportSource(statement.source)) {
      const unsupportedMessage = unsupportedRuntimeBuiltinImportMessageFromKnownSource(statement.source)

      this.report('INOX_NOT_IMPLEMENTED', unsupportedMessage, statement.loc)
      return
    }

    const feature = libuvOnlyRuntimeImportFeature(statement.source)

    if (feature !== null && typeof feature !== 'undefined') {
      this.requireLibuvBackend(feature, statement.loc)
    }
  }

  requireLibuvBackend(feature: string, loc: SourceLocation): boolean {
    if (this.options.loopBackend === 'libuv') {
      return true
    }

    this.report(
      'INOX_NOT_IMPLEMENTED',
      `${feature} is not implemented for C without libuv; compile with loopBackend: 'libuv' or --loop-backend libuv`,
      loc
    )

    return false
  }

  checkFetchAbortControllerMethodCall(expression: AnyNode): ValueType | null {
    const method =
      expression.callee.type === 'MemberExpression'
        ? fetchAbortControllerRuntimeMethod(expression.callee.property)
        : null

    if (method === null || typeof method === 'undefined') {
      return null
    }

    return checkFetchAbortControllerMethodCallInContext(
      this.fetchCallContext(),
      expression,
      method,
      this.checkedFetchReceiverInfo(expression.callee.object)
    )
  }

  checkFetchResponseMethodCall(expression: AnyNode): ValueType | null {
    const methodInfo =
      expression.callee.type === 'MemberExpression'
        ? fetchResponseBodyMethodInfo(expression.callee.property)
        : null

    if (methodInfo === null || typeof methodInfo === 'undefined') {
      return null
    }

    return checkFetchResponseMethodCallInContext(
      this.fetchCallContext(),
      expression,
      methodInfo,
      this.checkedFetchReceiverInfo(expression.callee.object)
    )
  }

  checkFetchUnsupportedResponseBodyMember(expression: AnyNode): ValueType | null {
    return checkFetchUnsupportedResponseBodyMemberInContext(
      this.fetchCallContext(),
      expression,
      isFetchUnsupportedResponseBodyMember(expression.property),
      this.checkedFetchReceiverInfo(expression.object)
    )
  }

  checkFetchHeadersMethodCall(expression: AnyNode): ValueType | null {
    const method =
      expression.callee.type === 'MemberExpression'
        ? fetchHeadersRuntimeMethodName(expression.callee.property)
        : null

    if (method === null || typeof method === 'undefined') {
      return null
    }

    return checkFetchHeadersMethodCallInContext(
      this.fetchCallContext(),
      expression,
      method,
      this.checkedFetchReceiverInfo(expression.callee.object),
      this.checkedCallArgInfos(expression)
    )
  }

  resolveClassMethodReceiverClassName(expression: AnyNode): string | null {
    if (this.isThisExpression(expression)) {
      const symbol = this.scope.resolve('this')

      if (
        symbol !== null &&
        typeof symbol !== 'undefined' &&
        symbol.className !== null &&
        typeof symbol.className !== 'undefined'
      ) {
        return symbol.className
      }

      if (expression.className !== null && typeof expression.className !== 'undefined') {
        return expression.className
      }

      return null
    }

    if (expression.type === 'Reference' && expression.path.length === 1) {
      const name = firstPathSegment(expression.path)
      const symbol = this.scope.resolve(name)

      if (
        symbol !== null &&
        typeof symbol !== 'undefined' &&
        symbol.className !== null &&
        typeof symbol.className !== 'undefined'
      ) {
        return symbol.className
      }

      if (expression.className !== null && typeof expression.className !== 'undefined') {
        return expression.className
      }

      return null
    }

    if (expression.className !== null && typeof expression.className !== 'undefined') {
      return expression.className
    }

    return null
  }

  checkFsCall(expression: AnyNode): ValueType | null {
    const info = this.resolveFsRuntimeCallInfo(expression)

    if (info === null || typeof info === 'undefined') {
      return null
    }

    const promisesApi = info.viaPromises || isFsPromisesImportSymbol(this.scope.resolve(info.root))
    const plan = fsRuntimeCallPlan(info, promisesApi, expression.args.length)
    const callInfo = plan.unsupportedMessage !== null && typeof plan.unsupportedMessage !== 'undefined'
      ? { argCount: expression.args.length, args: [] }
      : this.checkedFsCallInfo(expression, plan.argumentChecks)
    const options = this.fsCallOptionsFromInfo(plan.argumentChecks, callInfo)

    checkFsCallInContext(this.fsCallContext(), expression, plan, callInfo)

    if (plan.unsupportedMessage === null || typeof plan.unsupportedMessage === 'undefined') {
      applyFsRuntimeCallPlan(expression, plan, options)

      if (plan.bytesFromWriteData) {
        expression.fsBytes = options.bytes === true
      }

      if (plan.direntsFromOptions && options.withFileTypes === true) {
        expression.fsDirents = true
        expression.arrayElementType = 'object'
        expression.arrayElementDeclaredType = 'fs.Dirent'
      }

      if (plan.recursiveFromOptions) {
        expression.fsRecursive = options.recursive === true
      }

      if (plan.forceFromOptions) {
        expression.fsForce = options.force === true
      }
    }

    expression.fsRuntimeMethod = plan.runtimeMethod
    expression.valueType = plan.valueType
    expression.promiseValueType = plan.promiseValueType

    if (plan.bytes !== null && typeof plan.bytes !== 'undefined') {
      expression.fsBytes = plan.bytes
    }

    if (expression.arrayElementType === null || typeof expression.arrayElementType === 'undefined') {
      expression.arrayElementType = plan.arrayElementType
    }

    if (
      expression.arrayElementDeclaredType === null ||
      typeof expression.arrayElementDeclaredType === 'undefined'
    ) {
      expression.arrayElementDeclaredType = plan.arrayElementDeclaredType
    }

    return plan.valueType
  }

  resolveFsRuntimeCallInfo(expression: AnyNode): FsRuntimeCallInfo | null {
    const info = fsRuntimeCallInfo(expression.callee)

    if (info !== null && typeof info !== 'undefined') {
      if (isFsRuntimeRootSymbol(this.scope.resolve(info.root))) {
        return info
      }

      return null
    }

    let symbol: SymbolInfo | null = null

    if (expression.callee.type === 'Reference' && expression.callee.path.length === 1) {
      symbol = this.scope.resolve(expression.callee.path[0])
    }

    return fsRuntimeCallInfoFromImportSymbol(expression.callee, symbol)
  }

  checkedFsCallInfo(expression: AnyNode, checks: FsRuntimeArgumentCheck[]): CheckedFsCallInfo {
    const args: CheckedFsIndexedArgInfo[] = []

    for (const check of checks) {
      if (
        check.index >= expression.args.length ||
        this.hasCheckedFsIndexedArg(args, check.index)
      ) {
        continue
      }

      const arg = checkerNodeAt(expression.args, check.index)

      args.push({
        arg: this.checkedFsArgInfo(arg, this.fsCheckInspectsObjectLiteral(checks, check.index)),
        index: check.index
      })
    }

    return {
      argCount: expression.args.length,
      args
    }
  }

  hasCheckedFsIndexedArg(args: CheckedFsIndexedArgInfo[], index: number): boolean {
    for (const arg of args) {
      if (arg.index === index) {
        return true
      }
    }

    return false
  }

  fsCheckInspectsObjectLiteral(checks: FsRuntimeArgumentCheck[], index: number): boolean {
    for (const check of checks) {
      if (check.index === index && (check.kind === 'boolean-options' || check.kind === 'readdir-options')) {
        return true
      }
    }

    return false
  }

  checkedFsArgInfo(node: AnyNode, inspectObjectLiteral: boolean): CheckedFsArgInfo {
    if (inspectObjectLiteral && node.type === 'ObjectLiteral') {
      const properties: CheckedFsObjectPropertyInfo[] = []
      const nodeProperties: CheckerObjectPropertyNode[] = node.properties

      for (const property of nodeProperties) {
        properties.push(this.checkedFsObjectPropertyInfo(property))
      }

      let valueType: ValueType = 'object'

      if (node.valueType !== null && typeof node.valueType !== 'undefined') {
        valueType = node.valueType
      }

      return this.checkedFsValueInfoFromType(node, valueType, properties)
    }

    return this.checkedFsValueInfoFromType(node, this.checkExpression(node), [])
  }

  checkedFsObjectPropertyInfo(property: CheckerObjectPropertyNode): CheckedFsObjectPropertyInfo {
    let valueType: ValueType = 'unknown'

    if (property.value.valueType === null || typeof property.value.valueType === 'undefined') {
      valueType = this.checkExpression(property.value)
    } else {
      valueType = property.value.valueType
    }

    return {
      key: property.key,
      loc: property.loc,
      value: this.checkedFsValueInfoFromType(property.value, valueType, [])
    }
  }

  checkedFsValueInfoFromType(
    node: AnyNode,
    valueType: ValueType,
    properties: CheckedFsObjectPropertyInfo[]
  ): CheckedFsArgInfo {
    let stringLiteralValue: string | null = null
    let booleanLiteralValue: boolean | null = null

    if (node.type === 'StringLiteral') {
      stringLiteralValue = node.value
    }

    if (node.type === 'BooleanLiteral') {
      booleanLiteralValue = node.value === true
    }

    return {
      booleanLiteralValue,
      loc: node.loc,
      nullable: this.expressionCanBeNull(node),
      properties,
      stringLiteralValue,
      type: node.type,
      valueType
    }
  }

  fsCallOptionsFromInfo(checks: FsRuntimeArgumentCheck[], info: CheckedFsCallInfo): FsBooleanOptions {
    const options: FsBooleanOptions = {}

    for (const check of checks) {
      if (check.kind === 'write-data') {
        const arg = this.checkedFsArgAt(info, check.index)

        options.bytes = arg !== null && typeof arg !== 'undefined' && arg.valueType === 'bytes'
      } else if (check.kind === 'readdir-options') {
        options.withFileTypes = this.checkedFsBooleanOption(info, check.index, 'withFileTypes')
      } else if (
        check.kind === 'boolean-options' &&
        check.allowedOptions !== null &&
        typeof check.allowedOptions !== 'undefined'
      ) {
        for (const optionName of check.allowedOptions) {
          if (optionName === 'recursive') {
            options.recursive = this.checkedFsBooleanOption(info, check.index, optionName)
          } else if (optionName === 'force') {
            options.force = this.checkedFsBooleanOption(info, check.index, optionName)
          } else if (optionName === 'withFileTypes') {
            options.withFileTypes = this.checkedFsBooleanOption(info, check.index, optionName)
          }
        }
      }
    }

    return options
  }

  checkedFsArgAt(info: CheckedFsCallInfo, index: number): CheckedFsArgInfo | null {
    for (const item of info.args) {
      if (item.index === index) {
        return item.arg
      }
    }

    return null
  }

  checkedFsBooleanOption(info: CheckedFsCallInfo, index: number, key: string): boolean {
    const arg = this.checkedFsArgAt(info, index)

    if (arg === null || typeof arg === 'undefined') {
      return false
    }

    for (const property of arg.properties) {
      if (property.key === key) {
        return property.value.booleanLiteralValue === true
      }
    }

    return false
  }

  checkJsonCall(expression: AnyNode, declared?: ResolvedTypeInfo | null): ValueType | null {
    const method = jsonRuntimeMethodName(expression.callee)

    if (method === null || typeof method === 'undefined') {
      return null
    }

    if (this.scope.resolve('JSON')) {
      return null
    }

    expression.jsonRuntimeMethod = method

    if (expression.args.length !== 1) {
      this.report(
        'INOX_ARG_COUNT',
        `function JSON.${method} expects 1 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    if (method === 'parse') {
      this.checkJsonStringArg(expression, 0)

      const literalType = inferJsonParseLiteralType(expression)
      let valueType: ValueType = 'object'

      if (declared !== null && typeof declared !== 'undefined' && isJsonParseDeclaredType(declared.valueType)) {
        valueType = declared.valueType
      } else if (literalType !== null && typeof literalType !== 'undefined') {
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

      if (declared !== null && typeof declared !== 'undefined') {
        expression.arrayElementType = declared.arrayElementType
        expression.arrayElementDeclaredType = declared.arrayElementDeclaredType
        expression.mapKeyType = declared.mapKeyType
        expression.mapValueType = declared.mapValueType
        expression.promiseValueType = null

        if (declared.promiseValueType !== null && typeof declared.promiseValueType !== 'undefined') {
          expression.promiseValueType = declared.promiseValueType
        }

        expression.setElementType = declared.setElementType

        if (valueType === 'object') {
          expression.shape = declared.shape
        }
      } else if (literalType !== null && typeof literalType !== 'undefined') {
        expression.arrayElementType = literalType.arrayElementType
        expression.arrayElementDeclaredType = literalType.arrayElementDeclaredType

        if (valueType === 'object') {
          expression.shape = literalType.shape
        }
      }

      return valueType
    }

    if (expression.args[0] !== null && typeof expression.args[0] !== 'undefined') {
      this.checkExpression(expression.args[0])
    }

    expression.valueType = 'string'

    return 'string'
  }

  checkJsonStringArg(expression: AnyNode, index: number): void {
    const arg = expression.args[index]

    if (arg === null || typeof arg === 'undefined') {
      return
    }

    this.checkAssignableType(this.checkExpression(arg), 'string', arg.loc, false, this.expressionCanBeNull(arg))
  }

  checkPromiseStaticCall(expression: AnyNode): ValueType | null {
    const method = promiseStaticMethodName(expression.callee)

    if (method === null || typeof method === 'undefined') {
      return null
    }

    if (this.scope.resolve('Promise')) {
      return null
    }

    if (expression.args.length > 1) {
      this.report(
        'INOX_ARG_COUNT',
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
    expression.promiseRejectionValueType = 'unknown'
    expression.shape = null

    if (method === 'resolve') {
      expression.promiseValueType = 'void'

      if (expression.args[0] !== null && typeof expression.args[0] !== 'undefined') {
        expression.promiseValueType = argTypes[0]
        expression.shape = this.resolveExpressionShape(expression.args[0])
      }
    } else {
      expression.promiseRejectionValueType = this.resolveRejectedExpressionValueType(expression.args[0])
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
    const promiseShape = this.resolveExpressionShape(expression.callee.object)

    if (resolvedPromiseValueType !== null && typeof resolvedPromiseValueType !== 'undefined') {
      promiseValueType = resolvedPromiseValueType
    }

    if (expression.args.length !== 1) {
      this.report(
        'INOX_ARG_COUNT',
        `promise.${property} expects 1 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    const callback = expression.args[0]

    if (property === 'then') {
      let mappedType: ValueType = 'unknown'

      if (callback !== null && typeof callback !== 'undefined') {
        mappedType = this.checkPromiseCallback(
          callback,
          [promiseValueType],
          null,
          'promise.then callback',
          [
            {
              shape: promiseShape
            }
          ]
        )
      }

      for (let index = 1; index < expression.args.length; index++) {
        this.checkExpression(expression.args[index])
      }

      expression.valueType = 'promise'
      expression.promiseValueType = mappedType
      expression.shape = this.resolveExpressionShape(callback)

      return 'promise'
    }

    if (callback !== null && typeof callback !== 'undefined') {
      let catchReturnType: ValueType | null = promiseValueType

      if (promiseValueType === 'unknown') {
        catchReturnType = null
      }

      const catchParamTypes: ValueType[] = ['unknown']
      const catchParamMetadata: PromiseCallbackParamMetadata[] = [
        {
          shape: null
        }
      ]
      const rejectionValueType = resolveExpressionPromiseRejectionValueType(expression.callee.object)

      if (rejectionValueType === 'error') {
        catchParamTypes[0] = 'object'
        catchParamMetadata[0].shape = errorObjectShape
      }

      this.checkPromiseCallback(
        callback,
        catchParamTypes,
        catchReturnType,
        'promise.catch callback',
        catchParamMetadata
      )
    }

    for (let index = 1; index < expression.args.length; index++) {
      this.checkExpression(expression.args[index])
    }

    expression.valueType = 'promise'
    expression.promiseValueType = promiseValueType
    expression.shape = promiseShape

    return 'promise'
  }

  checkPromiseCallback(
    expression: AnyNode,
    params: ValueType[],
    returnType: ValueType | null,
    label: string,
    paramMetadata: PromiseCallbackParamMetadata[] = []
  ): ValueType {
    if (expression.type !== 'ArrowFunctionExpression') {
      const callbackType = this.checkExpression(expression)

      this.checkAssignableType(callbackType, 'function', expression.loc, false, false)

      return 'unknown'
    }

    if (expression.async === true) {
      this.report(
        'INOX_ASYNC_CALLBACK',
        'async Promise callbacks are not supported in the current compiler slice; use a named async helper and await it explicitly',
        expression.loc
      )
      return 'unknown'
    }

    if (expression.params.length > params.length) {
      this.report(
        'INOX_ARG_COUNT',
        `${label} expects at most ${params.length} parameter(s), got ${expression.params.length}`,
        expression.loc
      )
    }

    let actualReturnType: ValueType = 'unknown'
    let returnLoc = expression.loc
    let returnNullable = false
    let returnPromiseValueType: ValueType | null = null

    const scopeState = this.pushScope()

    try {
      for (let index = 0; index < expression.params.length; index++) {
        const param = expression.params[index]
        let expected: ValueType = 'unknown'

        if (index < params.length) {
          expected = params[index]
        }

        let shape: ObjectShapeInfo | null = null
        let metadata: PromiseCallbackParamMetadata | null = null

        if (index < paramMetadata.length) {
          metadata = paramMetadata[index]
        }

        if (metadata !== null && typeof metadata !== 'undefined') {
          shape = metadata.shape
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

        if (shape !== null && typeof shape !== 'undefined') {
          param.shape = shape
        }

        this.declare(
          param.name,
          {
            kind: 'param',
            mutable: true,
            valueType: actual,
            shape,
            loc: param.loc
          },
          param.loc
        )
      }

      if (expression.expressionBody) {
        actualReturnType = this.checkExpression(expression.body)
        returnLoc = expression.loc

        if (expression.body.loc !== null && typeof expression.body.loc !== 'undefined') {
          returnLoc = expression.body.loc
        }

        returnNullable = this.expressionCanBeNull(expression.body)
        returnPromiseValueType = this.resolveExpressionPromiseValueType(expression.body)
      } else {
        const returnExpression = resolveSingleReturnExpression(expression.body)

        if (returnExpression === null || typeof returnExpression === 'undefined') {
          const terminalReturnExpression = resolveTerminalReturnExpression(expression.body)
          let expectedReturnType: ValueType = 'unknown'

          if (returnType !== null && typeof returnType !== 'undefined') {
            expectedReturnType = returnType
          }

          const returnContextState = this.pushReturnContext(expectedReturnType, false, null)

          try {
            this.checkStatements(expression.body)
          } finally {
            this.restoreReturnContext(returnContextState)
          }

          if (terminalReturnExpression !== null && typeof terminalReturnExpression !== 'undefined') {
            actualReturnType = this.checkExpression(terminalReturnExpression)
            returnLoc = expression.loc

            if (terminalReturnExpression.loc !== null && typeof terminalReturnExpression.loc !== 'undefined') {
              returnLoc = terminalReturnExpression.loc
            }

            returnNullable = this.expressionCanBeNull(terminalReturnExpression)
            returnPromiseValueType = this.resolveExpressionPromiseValueType(terminalReturnExpression)
          }
        } else {
          actualReturnType = this.checkExpression(returnExpression)
          returnLoc = expression.loc

          if (returnExpression.loc !== null && typeof returnExpression.loc !== 'undefined') {
            returnLoc = returnExpression.loc
          }

          returnNullable = this.expressionCanBeNull(returnExpression)
          returnPromiseValueType = this.resolveExpressionPromiseValueType(returnExpression)
        }
      }
    } finally {
      this.restoreScope(scopeState)
    }

    if (returnType !== null && typeof returnType !== 'undefined') {
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
      'INOX_TIMER_REF_UNREF',
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

    const mapMethod = mapRuntimeMethodName(property)

    if (objectType === 'map' && mapMethod !== null && typeof mapMethod !== 'undefined') {
      const mapType = this.resolveExpressionMapType(expression.callee.object)
      let mapKeyType: ValueType = 'unknown'
      let mapRawValueType: ValueType = 'unknown'

      if (mapType !== null && typeof mapType !== 'undefined') {
        if (mapType.key !== null && typeof mapType.key !== 'undefined') {
          mapKeyType = mapType.key
        }

        if (mapType.value !== null && typeof mapType.value !== 'undefined') {
          mapRawValueType = mapType.value
        }
      }

      const mapValueType = resolvedConcreteValueTypeMetadata(mapRawValueType, 'unknown')

      if (mapMethod === 'clear') {
        this.checkCollectionArgCount(expression, 'map.clear', 0)
        expression.valueType = 'void'
        return 'void'
      }

      if (mapMethod === 'get' || mapMethod === 'has' || mapMethod === 'delete') {
        this.checkCollectionArgCount(expression, `map.${mapMethod}`, 1)

        if (expression.args[0] !== null && typeof expression.args[0] !== 'undefined') {
          const keyArg = checkerNodeAt(expression.args, 0)
          this.checkAssignableType(
            this.checkExpression(keyArg),
            mapKeyType,
            keyArg.loc,
            false,
            this.expressionCanBeNull(keyArg)
          )
        }

        for (let index = 1; index < expression.args.length; index = index + 1) {
          const arg = checkerNodeAt(expression.args, index)

          this.checkExpression(arg)
        }

        if (mapMethod === 'get') {
          expression.valueType = mapValueType
          expression.nullable = true
          expression.shape = mapType?.valueShape ?? null
          return mapValueType
        }

        expression.valueType = 'boolean'
        return 'boolean'
      }

      this.checkCollectionArgCount(expression, 'map.set', 2)

      if (expression.args[0] !== null && typeof expression.args[0] !== 'undefined') {
        const keyArg = checkerNodeAt(expression.args, 0)
        this.checkAssignableType(
          this.checkExpression(keyArg),
          mapKeyType,
          keyArg.loc,
          false,
          this.expressionCanBeNull(keyArg)
        )
      }

      if (expression.args[1] !== null && typeof expression.args[1] !== 'undefined') {
        const valueArg = checkerNodeAt(expression.args, 1)
        this.checkAssignableType(
          this.checkExpression(valueArg),
          mapRawValueType,
          valueArg.loc,
          false,
          this.expressionCanBeNull(valueArg)
        )
      }

      for (let index = 2; index < expression.args.length; index = index + 1) {
        const arg = checkerNodeAt(expression.args, index)

        this.checkExpression(arg)
      }

      expression.valueType = 'map'
      expression.mapKeyType = mapKeyType
      expression.mapValueType = mapRawValueType

      return 'map'
    }

    const setMethod = setRuntimeMethodName(property)

    if (objectType === 'set' && setMethod !== null && typeof setMethod !== 'undefined') {
      const elementType = this.resolveExpressionSetElementType(expression.callee.object) ?? 'unknown'

      if (setMethod === 'clear') {
        this.checkCollectionArgCount(expression, 'set.clear', 0)
        expression.valueType = 'void'
        return 'void'
      }

      this.checkCollectionArgCount(expression, `set.${setMethod}`, 1)

      if (expression.args[0] !== null && typeof expression.args[0] !== 'undefined') {
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

    if (method === null || typeof method === 'undefined') {
      return null
    }

    let shadow: SymbolInfo | null = null

    if (timerRuntimeMethodName(expression.callee) === method) {
      shadow = this.scope.resolve(method)
    }

    if (
      shadow !== null &&
      typeof shadow !== 'undefined' &&
      !isTimerRuntimeImportSymbol(shadow, method)
    ) {
      return null
    }

    return checkTimerCallInContext(
      this.timerCallContext(),
      expression,
      method,
      this.checkedTimerCallInfo(expression, method)
    )
  }

  resolveTimerRuntimeMethod(callee: AnyNode): string | null {
    const globalMethod = timerRuntimeMethodName(callee)

    if (globalMethod !== null && typeof globalMethod !== 'undefined') {
      return globalMethod
    }

    const path = memberExpressionPath(callee)

    if (path === null || typeof path === 'undefined') {
      return null
    }

    return timerRuntimeImportMethodName(
      this.resolveStdlibRuntimeDirectImportName(path, 'timers'),
      this.resolveStdlibModuleObjectMemberName(path, 'timers')
    )
  }

  checkedTimerCallInfo(expression: AnyNode, method: string): CheckedTimerCallInfo {
    const isClearMethod = timerClearMethodName(method) !== null

    return {
      argCount: expression.args.length,
      callback: isClearMethod ? this.missingTimerCallbackInfo(expression.loc) : this.checkedTimerCallbackInfo(expression.args[0]),
      firstArg: isClearMethod ? this.checkedTimerArgInfo(expression.args[0]) : null,
      delayArg: isClearMethod || method === 'setImmediate' ? null : this.checkedTimerArgInfo(expression.args[1])
    }
  }

  checkedTimerArgInfo(arg: AnyNode | null | undefined): CheckedTimerArgInfo | null {
    if (arg === null || typeof arg === 'undefined') {
      return null
    }

    return {
      valueType: this.checkExpression(arg),
      loc: arg.loc
    }
  }

  checkedTimerCallbackInfo(arg: AnyNode | null | undefined): CheckedTimerCallbackInfo {
    if (arg === null || typeof arg === 'undefined') {
      return this.missingTimerCallbackInfo({
        line: 0,
        column: 0
      })
    }

    if (arg.type === 'ArrowFunctionExpression') {
      if (arg.async !== true) {
        this.checkArrowFunctionExpression(arg, timerCallbackFunctionType())
      }

      return {
        async: arg.async === true,
        kind: 'arrow',
        loc: arg.loc,
        paramsLength: null,
        returnNullable: false,
        returnType: null,
        valueType: null
      }
    }

    const valueType = this.checkExpression(arg)
    const symbol = this.getCallableSymbol(arg)
    let paramsLength: number | null = null
    let returnType: ValueType | null = null
    let returnNullable = false
    let isAsync = false

    if (symbol !== null && typeof symbol !== 'undefined') {
      if (symbol.params !== null && typeof symbol.params !== 'undefined') {
        paramsLength = symbol.params.length
      }

      if (symbol.async === true || symbol.returnType === 'promise') {
        isAsync = true
      }

      if (symbol.returnType !== null && typeof symbol.returnType !== 'undefined') {
        returnType = symbol.returnType
        returnNullable = symbol.returnNullable === true
      }
    }

    return {
      async: isAsync,
      kind: 'reference',
      loc: arg.loc,
      paramsLength,
      returnNullable,
      returnType,
      valueType
    }
  }

  missingTimerCallbackInfo(loc: SourceLocation): CheckedTimerCallbackInfo {
    return {
      async: false,
      kind: 'missing',
      loc,
      paramsLength: null,
      returnNullable: false,
      returnType: null,
      valueType: null
    }
  }

  checkCollectionArgCount(expression: AnyNode, name: string, expected: number): void {
    if (expression.args.length !== expected) {
      this.report(
        'INOX_ARG_COUNT',
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

    let elementType: ValueType = 'unknown'
    const resolvedElementType = this.resolveExpressionArrayElementType(expression.callee.object)

    if (resolvedElementType !== null && typeof resolvedElementType !== 'undefined') {
      elementType = resolvedElementType
    }

    let elementDeclaredType: string = elementType
    const resolvedElementDeclaredType = this.resolveExpressionArrayElementDeclaredType(expression.callee.object)

    if (resolvedElementDeclaredType !== null && typeof resolvedElementDeclaredType !== 'undefined') {
      elementDeclaredType = resolvedElementDeclaredType
    }

    expression.arrayElementType = elementType
    expression.arrayElementDeclaredType = elementDeclaredType

    if (expression.callee.property === 'push' || expression.callee.property === 'unshift') {
      const method = expression.callee.property
      expression.valueType = 'number'

      if (expression.args.length !== 1) {
        this.report(
          'INOX_ARG_COUNT',
          `array.${method} expects 1 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      if (expression.args[0] !== null && typeof expression.args[0] !== 'undefined') {
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
        this.report('INOX_ARG_COUNT', `array.pop expects 0 argument(s), got ${expression.args.length}`, expression.loc)
      }

      for (let index = 0; index < expression.args.length; index = index + 1) {
        const arg = checkerNodeAt(expression.args, index)

        this.checkExpression(arg)
      }

      return elementType
    }

    if (expression.callee.property === 'join') {
      expression.valueType = 'string'

      if (expression.args.length > 1) {
        this.report(
          'INOX_ARG_COUNT',
          `array.join expects 0 or 1 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      if (expression.args[0] !== null && typeof expression.args[0] !== 'undefined') {
        const separatorType = this.checkExpression(expression.args[0])

        this.checkAssignableType(
          separatorType,
          'string',
          expression.args[0].loc,
          false,
          this.expressionCanBeNull(expression.args[0])
        )
      }

      for (let index = 1; index < expression.args.length; index++) {
        this.checkExpression(expression.args[index])
      }

      return 'string'
    }

    if (expression.callee.property === 'includes') {
      expression.valueType = 'boolean'

      if (expression.args.length !== 1) {
        this.report(
          'INOX_ARG_COUNT',
          `array.includes expects 1 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      if (expression.args[0] !== null && typeof expression.args[0] !== 'undefined') {
        const searchType = this.checkExpression(expression.args[0])

        if (elementType !== 'unknown') {
          this.checkAssignableType(
            searchType,
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

      return 'boolean'
    }

    expression.valueType = 'array'

    if (expression.callee.property === 'slice') {
      if (expression.args.length > 2) {
        this.report(
          'INOX_ARG_COUNT',
          `array.slice expects 0, 1 or 2 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      for (let index = 0; index < expression.args.length; index = index + 1) {
        const arg = checkerNodeAt(expression.args, index)
        const argType = this.checkExpression(arg)

        this.checkAssignableType(argType, 'number', arg.loc, false, false)
      }

      return 'array'
    }

    if (expression.callee.property === 'sort') {
      if (expression.args.length > 1) {
        this.report(
          'INOX_ARG_COUNT',
          `array.sort expects 0 or 1 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      if (expression.args[0] !== null && typeof expression.args[0] !== 'undefined') {
        this.checkArrayCallback(expression.args[0], [elementType, elementType], 'number')
      }

      for (let index = 1; index < expression.args.length; index++) {
        this.checkExpression(expression.args[index])
      }

      return 'array'
    }

    if (expression.callee.property === 'reduce') {
      if (expression.args.length !== 2) {
        this.report(
          'INOX_ARG_COUNT',
          `array.reduce expects 2 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      let reducedType: ValueType = 'unknown'
      let expectedReturnType: ValueType | null = null

      if (expression.args[1] !== null && typeof expression.args[1] !== 'undefined') {
        reducedType = this.checkExpression(expression.args[1])

        if (reducedType !== 'unknown') {
          expectedReturnType = reducedType
        }
      }

      if (expression.args[0] !== null && typeof expression.args[0] !== 'undefined') {
        const callbackType = this.checkArrayCallback(
          expression.args[0],
          [reducedType, elementType, 'number'],
          expectedReturnType
        )

        if (expectedReturnType !== null && typeof expectedReturnType !== 'undefined') {
          reducedType = expectedReturnType
        } else if (reducedType === 'unknown') {
          reducedType = callbackType
        }
      }

      for (let index = 2; index < expression.args.length; index = index + 1) {
        this.checkExpression(expression.args[index])
      }

      expression.valueType = reducedType
      expression.arrayElementType = null
      expression.arrayElementDeclaredType = null

      return reducedType
    }

    if (expression.args.length !== 1) {
      this.report(
        'INOX_ARG_COUNT',
        `array.${expression.callee.property} expects 1 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    if (expression.callee.property === 'filter') {
      if (expression.args[0] !== null && typeof expression.args[0] !== 'undefined') {
        if (!this.isBooleanReference(expression.args[0])) {
          this.checkArrayCallback(expression.args[0], [elementType, 'number'], 'boolean')
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

      if (foundInfo.shape !== null && typeof foundInfo.shape !== 'undefined') {
        expression.shape = foundInfo.shape
      }

      if (foundInfo.arrayElementType !== null && typeof foundInfo.arrayElementType !== 'undefined') {
        expression.arrayElementType = foundInfo.arrayElementType
      }

      if (foundInfo.arrayElementDeclaredType !== null && typeof foundInfo.arrayElementDeclaredType !== 'undefined') {
        expression.arrayElementDeclaredType = foundInfo.arrayElementDeclaredType
      }

      if (foundInfo.mapKeyType !== null && typeof foundInfo.mapKeyType !== 'undefined') {
        expression.mapKeyType = foundInfo.mapKeyType
      }

      if (foundInfo.mapValueType !== null && typeof foundInfo.mapValueType !== 'undefined') {
        expression.mapValueType = foundInfo.mapValueType
      }

      if (foundInfo.promiseValueType !== null && typeof foundInfo.promiseValueType !== 'undefined') {
        expression.promiseValueType = foundInfo.promiseValueType
      }

      if (foundInfo.setElementType !== null && typeof foundInfo.setElementType !== 'undefined') {
        expression.setElementType = foundInfo.setElementType
      }

      if (foundInfo.functionType !== null && typeof foundInfo.functionType !== 'undefined') {
        expression.functionType = foundInfo.functionType
      }

      if (expression.args[0] !== null && typeof expression.args[0] !== 'undefined') {
        if (!this.isBooleanReference(expression.args[0])) {
          this.checkArrayCallback(expression.args[0], [elementType, 'number'], 'boolean')
        }
      }

      for (let index = 1; index < expression.args.length; index++) {
        this.checkExpression(expression.args[index])
      }

      return elementType
    }

    let mappedType: ValueType = 'unknown'

    if (expression.args[0] !== null && typeof expression.args[0] !== 'undefined') {
      mappedType = this.checkArrayCallback(expression.args[0], [elementType, 'number'], null)
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
      expression.type === 'Reference' && expression.path.length === 1 && firstPathSegment(expression.path) === 'Boolean'
    )
  }

  checkArrayCallback(expression: AnyNode, params: ValueType[], returnType: ValueType | null): ValueType {
    if (expression.type !== 'ArrowFunctionExpression') {
      const callbackType = this.checkExpression(expression)

      this.checkAssignableType(callbackType, 'function', expression.loc, false, false)

      return 'unknown'
    }

    if (expression.async === true) {
      this.report(
        'INOX_ASYNC_CALLBACK',
        'async Array callbacks are not supported in the current compiler slice; use a synchronous callback',
        expression.loc
      )
      return 'unknown'
    }

    if (expression.params.length > params.length) {
      this.report(
        'INOX_ARG_COUNT',
        `array callback expects at most ${params.length} parameter(s), got ${expression.params.length}`,
        expression.loc
      )
    }

    let actualReturnType: ValueType = 'unknown'
    let returnLoc = expression.loc
    let returnNullable = false

    const scopeState = this.pushScope()

    try {
      for (let index = 0; index < expression.params.length; index++) {
        const param = expression.params[index]
        let expected: ValueType = 'unknown'

        if (index < params.length) {
          expected = params[index]
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

        if (expression.body.loc !== null && typeof expression.body.loc !== 'undefined') {
          returnLoc = expression.body.loc
        }

        returnNullable = this.expressionCanBeNull(expression.body)
      } else {
        const returnExpression = resolveSingleReturnExpression(expression.body)

        if (returnExpression === null || typeof returnExpression === 'undefined') {
          const terminalReturnExpression = resolveTerminalReturnExpression(expression.body)
          let expectedReturnType: ValueType = 'unknown'

          if (returnType !== null && typeof returnType !== 'undefined') {
            expectedReturnType = returnType
          }

          const returnContextState = this.pushReturnContext(expectedReturnType, false, null)

          try {
            this.checkStatements(expression.body)
          } finally {
            this.restoreReturnContext(returnContextState)
          }

          if (terminalReturnExpression !== null && typeof terminalReturnExpression !== 'undefined') {
            actualReturnType = this.checkExpression(terminalReturnExpression)
            returnLoc = expression.loc

            if (terminalReturnExpression.loc !== null && typeof terminalReturnExpression.loc !== 'undefined') {
              returnLoc = terminalReturnExpression.loc
            }

            returnNullable = this.expressionCanBeNull(terminalReturnExpression)
          }
        } else {
          actualReturnType = this.checkExpression(returnExpression)
          returnLoc = expression.loc

          if (returnExpression.loc !== null && typeof returnExpression.loc !== 'undefined') {
            returnLoc = returnExpression.loc
          }

          returnNullable = this.expressionCanBeNull(returnExpression)
        }
      }
    } finally {
      this.restoreScope(scopeState)
    }

    if (returnType !== null && typeof returnType !== 'undefined') {
      this.checkAssignableType(actualReturnType, returnType, returnLoc, false, returnNullable)
    }

    expression.returnType = actualReturnType

    if (returnType !== null && typeof returnType !== 'undefined') {
      expression.returnType = returnType
    }

    expression.declaredReturnType = expression.returnType
    expression.returnNullable = returnNullable

    return actualReturnType
  }

  checkCallArgumentTypes(expression: AnyNode): ValueType[] {
    const argTypes: ValueType[] = []

    for (let index = 0; index < expression.args.length; index = index + 1) {
      const arg = checkerNodeAt(expression.args, index)

      argTypes.push(this.checkExpression(arg))
    }

    return argTypes
  }

  checkedCallArgInfos(expression: AnyNode): CheckedCallArgInfo[] {
    const argInfos: CheckedCallArgInfo[] = []

    for (let index = 0; index < expression.args.length; index = index + 1) {
      const arg = checkerNodeAt(expression.args, index)
      const valueType = this.checkExpression(arg)

      argInfos.push({
        valueType,
        nullable: this.expressionCanBeNull(arg),
        loc: arg.loc,
        arrayElementType: this.resolveExpressionArrayElementType(arg),
        shape: this.resolveExpressionShape(arg)
      })
    }

    return argInfos
  }

  checkStringConversionCall(expression: AnyNode): ValueType | null {
    if (!isStringConversionCall(expression)) {
      return null
    }

    const argTypes = this.checkCallArgumentTypes(expression)
    let hasClassToString = false

    if (expression.args[0] !== null && typeof expression.args[0] !== 'undefined') {
      hasClassToString = this.hasStringReturningClassToStringMethod(checkerNodeAt(expression.args, 0))
    }

    return checkStringConversionCallInContext(this.primitiveCallContext(), expression, argTypes, hasClassToString)
  }

  checkRegExpLiteral(expression: AnyNode): ValueType {
    return checkRegExpLiteralInContext(this.primitiveCallContext(), expression)
  }

  checkRegExpFlags(expression: AnyNode): void {
    checkRegExpFlagsInContext(this.primitiveCallContext(), expression)
  }

  checkRegExpTestCall(expression: AnyNode): ValueType | null {
    if (!isRegExpTestCall(expression)) {
      return null
    }

    const objectType = this.checkExpression(expression.callee.object)
    const argTypes = this.checkCallArgumentTypes(expression)

    return checkRegExpTestCallInContext(this.primitiveCallContext(), expression, objectType, argTypes)
  }

  checkArrayFromCall(expression: AnyNode): ValueType | null {
    if (!isArrayFromCall(expression, this.runtimeGlobalIsShadowed('Array'))) {
      return null
    }

    const argTypes = this.checkCallArgumentTypes(expression)
    let sourceType: ValueType = 'unknown'

    if (expression.args[0] !== null && typeof expression.args[0] !== 'undefined') {
      sourceType = argTypes[0]
    }

    return checkArrayFromCallInContext(this.primitiveCallContext(), expression, sourceType)
  }

  checkNumberConversionCall(expression: AnyNode): ValueType | null {
    if (!isNumberConversionCall(expression)) {
      return null
    }

    return checkNumberConversionCallInContext(
      this.primitiveCallContext(),
      expression,
      this.checkCallArgumentTypes(expression)
    )
  }

  checkNumericCastCall(expression: AnyNode): ValueType | null {
    const castName = numericCastName(expression)

    if (castName === null || typeof castName === 'undefined') {
      return null
    }

    return checkNumericCastCallInContext(
      this.primitiveCallContext(),
      expression,
      castName,
      this.checkCallArgumentTypes(expression)
    )
  }

  checkNumberToStringCall(expression: AnyNode): ValueType | null {
    if (!isNumberToStringCall(expression)) {
      return null
    }

    const objectType = this.checkExpression(expression.callee.object)
    const argTypes = this.checkCallArgumentTypes(expression)

    return checkNumberToStringCallInContext(this.primitiveCallContext(), expression, objectType, argTypes)
  }

  checkStringCharCodeAtCall(expression: CheckerNode): ValueType | null {
    if (!isStringCharCodeAtCall(expression)) {
      return null
    }

    const objectType = this.checkExpression(expression.callee.object)
    const argTypes = this.checkCallArgumentTypes(expression)

    return checkStringCharCodeAtCallInContext(this.primitiveCallContext(), expression, objectType, argTypes)
  }

  checkStringTrimCall(expression: AnyNode): ValueType | null {
    const method = stringTrimMethodName(expression)

    if (method === null || typeof method === 'undefined') {
      return null
    }

    const objectType = this.checkExpression(expression.callee.object)
    this.checkCallArgumentTypes(expression)

    return checkStringTrimCallInContext(this.primitiveCallContext(), expression, objectType, method)
  }

  checkStringCaseCall(expression: AnyNode): ValueType | null {
    if (!isStringCaseCall(expression)) {
      return null
    }

    const objectType = this.checkExpression(expression.callee.object)
    this.checkCallArgumentTypes(expression)

    return checkStringCaseCallInContext(this.primitiveCallContext(), expression, objectType)
  }

  checkStringPadStartCall(expression: AnyNode): ValueType | null {
    if (!isStringPadStartCall(expression)) {
      return null
    }

    const objectType = this.checkExpression(expression.callee.object)
    const argTypes = this.checkCallArgumentTypes(expression)

    return checkStringPadStartCallInContext(this.primitiveCallContext(), expression, objectType, argTypes)
  }

  checkStringIndexCall(expression: AnyNode): ValueType | null {
    const method = stringIndexMethodName(expression)

    if (method === null || typeof method === 'undefined') {
      return null
    }

    const objectType = this.checkExpression(expression.callee.object)
    const argTypes = this.checkCallArgumentTypes(expression)

    return checkStringIndexCallInContext(this.primitiveCallContext(), expression, objectType, method, argTypes)
  }

  checkStringSliceCall(expression: AnyNode): ValueType | null {
    const method = stringSliceMethodName(expression)

    if (method === null || typeof method === 'undefined') {
      return null
    }

    const objectType = this.checkExpression(expression.callee.object)
    const argTypes = this.checkCallArgumentTypes(expression)

    return checkStringSliceCallInContext(this.primitiveCallContext(), expression, objectType, method, argTypes)
  }

  checkStringSplitCall(expression: AnyNode): ValueType | null {
    const method = stringSplitMethodName(expression)

    if (method === null || typeof method === 'undefined') {
      return null
    }

    const objectType = this.checkExpression(expression.callee.object)
    const argTypes = this.checkCallArgumentTypes(expression)

    return checkStringSplitCallInContext(this.primitiveCallContext(), expression, objectType, method, argTypes)
  }

  checkStringPredicateCall(expression: AnyNode): ValueType | null {
    if (!isStringPredicateCall(expression)) {
      return null
    }

    const objectType = this.checkExpression(expression.callee.object)
    const argTypes = this.checkCallArgumentTypes(expression)

    return checkStringPredicateCallInContext(this.primitiveCallContext(), expression, objectType, argTypes)
  }

  checkNewExpression(expression: AnyNode): ValueType {
    if (this.isDateConstructorExpression(expression)) {
      const dateArgTypes: ValueType[] = []

      for (let index = 0; index < expression.args.length; index = index + 1) {
        const arg = checkerNodeAt(expression.args, index)

        dateArgTypes.push(this.checkExpression(arg))
      }

      const dateConstructorType = this.checkDateConstructorExpression(expression, dateArgTypes)

      if (dateConstructorType !== null && typeof dateConstructorType !== 'undefined') {
        return dateConstructorType
      }
    }

    const promiseType = this.checkPromiseConstructorExpression(expression)

    if (promiseType !== null && typeof promiseType !== 'undefined') {
      return promiseType
    }

    const argTypes: ValueType[] = []

    for (let index = 0; index < expression.args.length; index = index + 1) {
      const arg = checkerNodeAt(expression.args, index)

      argTypes.push(this.checkExpression(arg))
    }

    const eventStreamConstructorType = this.checkEventStreamUnsupportedConstructor(expression)

    if (eventStreamConstructorType !== null && typeof eventStreamConstructorType !== 'undefined') {
      return eventStreamConstructorType
    }

    const urlType = this.checkUrlConstructorExpression(expression, argTypes)

    if (urlType !== null && typeof urlType !== 'undefined') {
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

      const mapType = this.resolveMapConstructorType(expression, argTypes)

      if (mapType !== null && typeof mapType !== 'undefined') {
        if (mapType.key !== null && typeof mapType.key !== 'undefined') {
          expression.mapKeyType = mapType.key
        }

        if (mapType.value !== null && typeof mapType.value !== 'undefined') {
          expression.mapValueType = mapType.value
        }

        if (mapType.valueShape !== null && typeof mapType.valueShape !== 'undefined') {
          expression.mapValueShape = mapType.valueShape
        }
      }

      return 'map'
    }

    if (collectionConstructor === 'Set') {
      expression.valueType = 'set'
      expression.setElementType = 'unknown'

      if (argTypes.length > 0) {
        let elementType: ValueType | null = null

        if (argTypes[0] === 'set') {
          elementType = this.resolveExpressionSetElementType(expression.args[0])
        } else if (argTypes[0] === 'array') {
          elementType = this.resolveExpressionArrayElementType(expression.args[0])
        }

        if (elementType !== null && typeof elementType !== 'undefined') {
          expression.setElementType = elementType
        }
      }

      return 'set'
    }

    if (
      fetchAbortControllerConstructorName(
        expression.callee.path,
        this.scope.resolve('AbortController')
      ) === 'AbortController'
    ) {
      this.requireLibuvBackend('AbortController', expression.loc)

      if (expression.args.length !== 0) {
        this.report(
          'INOX_ARG_COUNT',
          `AbortController constructor expects 0 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      expression.fetchRuntimeMethod = 'abortControllerNew'
      expression.valueType = 'object'
      expression.shape = fetchAbortControllerObjectShape
      return 'object'
    }

    if (binaryConstructorName(expression.callee.path) === 'Uint8Array') {
      if (expression.args.length !== 1) {
        this.report(
          'INOX_ARG_COUNT',
          `Uint8Array constructor expects 1 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      if (
        expression.args[0] !== null &&
        typeof expression.args[0] !== 'undefined' &&
        argTypes[0] !== 'number' &&
        argTypes[0] !== 'array'
      ) {
        this.report(
          'INOX_TYPE_MISMATCH',
          `Uint8Array constructor expects number or number[], got ${argTypes[0]}`,
          expression.args[0].loc
        )
      }

      if (argTypes[0] === 'array') {
        const elementType = this.resolveExpressionArrayElementType(expression.args[0])

        if (elementType !== null && typeof elementType !== 'undefined') {
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

    if (symbol === null || typeof symbol === 'undefined') {
      const globalSymbol = builtinGlobalSymbol(constructorName)

      if (globalSymbol !== null && typeof globalSymbol !== 'undefined') {
        symbol = globalSymbol
      }
    }

    if (
      symbol === null ||
      typeof symbol === 'undefined' ||
      (symbol.kind !== 'class' && symbol.constructable !== true)
    ) {
      this.report('INOX_UNKNOWN_NAME', `unknown class ${constructorName}`, expression.callee.loc)
      return 'object'
    }

    if (symbol.constructable) {
      return 'object'
    }

    let constructorParams: AnyNode[] = []

    if (symbol.constructorParams !== null && typeof symbol.constructorParams !== 'undefined') {
      constructorParams = symbol.constructorParams as AnyNode[]
    }

    if (constructorParams.length !== expression.args.length) {
      this.report(
        'INOX_ARG_COUNT',
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

    if (symbol.shape !== null && typeof symbol.shape !== 'undefined') {
      expression.shape = symbol.shape
    }

    return 'object'
  }

  resolveMapConstructorType(expression: AnyNode, argTypes: ValueType[]): CheckerMapType | null {
    if (expression.args.length === 0 || argTypes.length === 0) {
      return null
    }

    const firstArg = checkerNodeAt(expression.args, 0)

    if (argTypes[0] === 'map') {
      return this.resolveExpressionMapType(firstArg)
    }

    if (argTypes[0] === 'array' && firstArg.type === 'ArrayLiteral') {
      return resolveMapEntryArrayType(firstArg)
    }

    return null
  }

  checkUrlConstructorExpression(expression: AnyNode, argTypes: ValueType[]): ValueType | null {
    if (expression.callee.type !== 'Reference' || expression.callee.path.length !== 1) {
      return null
    }

    const importedName = this.resolveStdlibRuntimeDirectImportName(expression.callee.path, 'url')
    const constructorImport = urlRuntimeConstructorImportInfo(importedName)

    if (constructorImport === null || typeof constructorImport === 'undefined') {
      return null
    }

    if (constructorImport.unsupported) {
      this.report(
        'INOX_NOT_IMPLEMENTED',
        `node:url ${constructorImport.name} is not implemented by the current C backend`,
        expression.loc
      )
      expression.valueType = 'unknown'
      return 'unknown'
    }

    const constructorName = constructorImport.name

    if (constructorName === 'URLSearchParams') {
      if (expression.args.length > 1) {
        this.report(
          'INOX_ARG_COUNT',
          `URLSearchParams constructor expects 0 or 1 argument(s), got ${expression.args.length}`,
          expression.loc
        )
      }

      if (expression.args[0] !== null && typeof expression.args[0] !== 'undefined') {
        const argType = argTypes[0]

        if (argType !== 'string' && argType !== 'object') {
          this.report(
            'INOX_TYPE_MISMATCH',
            `URLSearchParams constructor expects string or object, got ${argType}`,
            expression.args[0].loc
          )
        }

        if (expression.args[0].type === 'ObjectLiteral') {
          const properties: CheckerObjectPropertyNode[] = expression.args[0].properties

          for (const property of properties) {
            let propertyValueType: ValueType = 'unknown'
            const knownPropertyValueType = property.value.valueType

            if (knownPropertyValueType === null || typeof knownPropertyValueType === 'undefined') {
              propertyValueType = this.checkExpression(property.value)
            } else {
              propertyValueType = knownPropertyValueType
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

          if (shape !== null && typeof shape !== 'undefined') {
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
        'INOX_ARG_COUNT',
        `URL constructor expects 1 or 2 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    for (let index = 0; index < argTypes.length; index++) {
      const argType = argTypes[index]

      if (index === 1 && argType === 'object') {
        const shape = this.resolveExpressionShape(expression.args[index])

        if (shape !== null && typeof shape !== 'undefined' && shape.builtin === 'url.URL') {
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
      this.scope.resolve('Promise')
    ) {
      return null
    }

    if (expression.args.length !== 1) {
      this.report(
        'INOX_ARG_COUNT',
        `Promise constructor expects 1 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    const executor = expression.args[0]
    let promiseValueType: ValueType = 'unknown'

    if (executor === null || typeof executor === 'undefined') {
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

    if (resolveName !== null && typeof resolveName !== 'undefined') {
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

  collectPromiseExecutorValueTypesFromNode(
    node: AnyNode | null | undefined,
    resolveName: string,
    types: ValueType[]
  ): void {
    if (node === null || typeof node === 'undefined') {
      return
    }

    if (
      node.type === 'CallExpression' &&
      node.callee !== null &&
      typeof node.callee !== 'undefined' &&
      node.callee.type === 'Reference' &&
      node.callee.path.length === 1 &&
      firstPathSegment(node.callee.path) === resolveName
    ) {
      let resolvedType: ValueType = 'void'

      if (node.args[0] !== null && typeof node.args[0] !== 'undefined') {
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
    const knownType = knownCheckedExpressionType(expression)

    if (knownType !== null && typeof knownType !== 'undefined') {
      return knownType
    }

    return this.checkExpression(expression)
  }

  checkErrorConstructorExpression(expression: AnyNode, argTypes: ValueType[]): void {
    if (expression.args.length > 2) {
      this.report(
        'INOX_ARG_COUNT',
        `Error constructor expects at most 2 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    if (expression.args[0] !== null && typeof expression.args[0] !== 'undefined') {
      this.checkAssignableType(
        argTypes[0],
        'string',
        expression.args[0].loc,
        false,
        this.expressionCanBeNull(expression.args[0])
      )
    }

    const options = expression.args[1]

    if (options === null || typeof options === 'undefined') {
      return
    }

    if (options.type !== 'ObjectLiteral') {
      this.report(
        'INOX_TYPE_MISMATCH',
        'Error options must be an object literal in the current compiler slice',
        options.loc
      )
      return
    }

    const properties: CheckerObjectPropertyNode[] = options.properties

    for (const property of properties) {
      if (property.key !== 'code' && property.key !== 'cause') {
        this.report('INOX_UNKNOWN_FIELD', `unknown Error option ${property.key}`, property.loc)
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
            'INOX_TYPE_MISMATCH',
            'Error cause must be an Error object or null in the current compiler slice',
            property.value.loc
          )
        }
      }
    }
  }

  checkVariableInitializer(expression: AnyNode, declared: ResolvedTypeInfo | null): ValueType {
    if (
      expression.type === 'ArrowFunctionExpression' &&
      declared !== null &&
      typeof declared !== 'undefined' &&
      declared.valueType === 'function'
    ) {
      const functionType = declared.functionType

      if (functionType !== null && typeof functionType !== 'undefined') {
        this.checkArrowFunctionExpression(expression, functionType)
        return 'function'
      }
    }

    if (expression.type === 'CallExpression') {
      const jsonType = this.checkJsonCall(expression, declared)

      if (jsonType !== null && typeof jsonType !== 'undefined') {
        return jsonType
      }
    }

    return this.checkExpression(expression)
  }

  checkArrowFunctionExpression(expression: AnyNode, functionType?: AnyNode | null): void {
    if (expression.async === true) {
      this.report(
        'INOX_ASYNC_CALLBACK',
        'async arrow callbacks are not supported in the current compiler slice; use an async function declaration',
        expression.loc
      )
      return
    }

    expression.valueType = 'function'

    if (functionType !== null && typeof functionType !== 'undefined' && functionType.resolved !== true) {
      functionType =
        this.resolveFunctionTypeMetadata(functionType as FunctionTypeMetadata, expression.loc) ?? functionType
    }

    if (functionType !== null && typeof functionType !== 'undefined') {
      expression.functionType = functionType
    }

    let actualReturnType: ValueType = 'unknown'

    if (
      functionType !== null &&
      typeof functionType !== 'undefined' &&
      functionType.returnType !== null &&
      typeof functionType.returnType !== 'undefined'
    ) {
      actualReturnType = functionType.returnType
    }

    const scopeState = this.pushScope()

    try {
      if (
        functionType !== null &&
        typeof functionType !== 'undefined' &&
        expression.params.length > functionType.params.length
      ) {
        this.report(
          'INOX_ARG_COUNT',
          `function callback expects at most ${functionType.params.length} parameter(s), got ${expression.params.length}`,
          expression.loc
        )
      }

      for (let index = 0; index < expression.params.length; index++) {
        const param = expression.params[index]
        const paramValueType = nodeValueTypeOrUnknown(param)
        let expected: AnyNode | null = null

        if (functionType !== null && typeof functionType !== 'undefined' && index < functionType.params.length) {
          expected = functionType.params[index]
        }

        let paramInfo = this.resolveDeclaredType(paramValueType, param.loc)

        if (paramValueType === 'unknown' && expected !== null && typeof expected !== 'undefined') {
          let arrayElementType: ValueType | null = null
          let arrayElementDeclaredType: string | null = null
          let expectedValueType = nodeValueTypeOrUnknown(expected)
          let mapKeyType: ValueType | null = null
          let mapValueType: ValueType | null = null
          let mapValueShape: ObjectShapeInfo | null = null
          let promiseValueType: ValueType | null = null
          let setElementType: ValueType | null = null
          let expectedFunctionType: FunctionTypeMetadata | null = null
          let shape: ObjectShapeInfo | null = null

          if (!isBuiltinValueType(expectedValueType)) {
            expectedValueType = 'object'
          }

          if (expected.arrayElementType !== null && typeof expected.arrayElementType !== 'undefined') {
            arrayElementType = expected.arrayElementType
          }

          if (expected.arrayElementDeclaredType !== null && typeof expected.arrayElementDeclaredType !== 'undefined') {
            arrayElementDeclaredType = expected.arrayElementDeclaredType
          }

          if (expected.mapKeyType !== null && typeof expected.mapKeyType !== 'undefined') {
            mapKeyType = expected.mapKeyType
          }

          if (expected.mapValueType !== null && typeof expected.mapValueType !== 'undefined') {
            mapValueType = expected.mapValueType
          }

          if (expected.mapValueShape !== null && typeof expected.mapValueShape !== 'undefined') {
            mapValueShape = expected.mapValueShape
          }

          if (expected.promiseValueType !== null && typeof expected.promiseValueType !== 'undefined') {
            promiseValueType = expected.promiseValueType
          }

          if (expected.setElementType !== null && typeof expected.setElementType !== 'undefined') {
            setElementType = expected.setElementType
          }

          if (expected.functionType !== null && typeof expected.functionType !== 'undefined') {
            expectedFunctionType = expected.functionType
          }

          if (expected.shape !== null && typeof expected.shape !== 'undefined') {
            shape = expected.shape
          }

          paramInfo = {
            valueType: expectedValueType,
            nullable: expected.nullable === true,
            arrayElementType,
            arrayElementDeclaredType,
            mapKeyType,
            mapValueType,
            mapValueShape,
            promiseValueType,
            setElementType,
            functionType: expectedFunctionType,
            shape
          }
        }

        if (
          expected !== null &&
          typeof expected !== 'undefined' &&
          paramValueType !== 'unknown'
        ) {
          const expectedValueType = nodeValueTypeOrUnknown(expected)

          if (isBuiltinValueType(expectedValueType)) {
            this.checkAssignableType(
              expectedValueType,
              paramInfo.valueType,
              param.loc,
              expected.nullable === true,
              false
            )
          }
        }

        param.declaredType = paramValueType

        if (paramValueType === 'unknown') {
          param.declaredType = paramInfo.valueType

          if (
            expected !== null &&
            typeof expected !== 'undefined' &&
            expected.declaredType !== null &&
            typeof expected.declaredType !== 'undefined'
          ) {
            param.declaredType = expected.declaredType
          }
        }

        param.valueType = paramInfo.valueType
        param.nullable = paramInfo.nullable
        param.arrayElementType = paramInfo.arrayElementType
        param.arrayElementDeclaredType = paramInfo.arrayElementDeclaredType
        param.mapKeyType = paramInfo.mapKeyType
        param.mapValueType = paramInfo.mapValueType
        param.mapValueShape = paramInfo.mapValueShape
        param.promiseValueType = null

        if (paramInfo.promiseValueType !== null && typeof paramInfo.promiseValueType !== 'undefined') {
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
            mapValueShape: paramInfo.mapValueShape,
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

          if (
            functionType !== null &&
            typeof functionType !== 'undefined' &&
            functionType.returnType !== null &&
            typeof functionType.returnType !== 'undefined' &&
            isBuiltinValueType(functionType.returnType)
          ) {
            const expectedReturnType: ValueType = functionType.returnType

            this.checkAssignableType(
              actualReturnType,
              expectedReturnType,
              expression.body.loc,
              functionType.returnNullable === true,
              this.expressionCanBeNull(expression.body)
            )

            if (
              expectedReturnType === 'promise' &&
              functionType.returnPromiseValueType !== null &&
              typeof functionType.returnPromiseValueType !== 'undefined'
            ) {
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
        if (functionType === null || typeof functionType === 'undefined') {
          const previousFunctionDepth = this.functionDepth
          this.functionDepth = this.functionDepth + 1

          try {
            this.checkStatements(expression.body)
          } finally {
            this.functionDepth = previousFunctionDepth
          }

          actualReturnType = 'void'
        } else {
          const previousReturnType = this.currentReturnType
          const previousReturnNullable = this.currentReturnNullable
          const previousReturnPromiseValueType = this.currentReturnPromiseValueType
          const previousReturnAsync = this.currentReturnAsync
          const previousFunctionDepth = this.functionDepth

          try {
            let expectedReturnType: ValueType = 'unknown'

            if (functionType.returnType !== null && typeof functionType.returnType !== 'undefined') {
              expectedReturnType = functionType.returnType
            }

            this.currentReturnType = expectedReturnType
            this.currentReturnNullable = functionType.returnNullable === true
            this.currentReturnPromiseValueType = null

            if (
              functionType.returnPromiseValueType !== null &&
              typeof functionType.returnPromiseValueType !== 'undefined'
            ) {
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
      }
    } finally {
      this.restoreScope(scopeState)
    }

    expression.returnType = actualReturnType

    if (
      functionType !== null &&
      typeof functionType !== 'undefined' &&
      functionType.returnType !== null &&
      typeof functionType.returnType !== 'undefined'
    ) {
      expression.returnType = functionType.returnType
    }

    expression.declaredReturnType = expression.returnType

    if (
      functionType !== null &&
      typeof functionType !== 'undefined' &&
      functionType.declaredReturnType !== null &&
      typeof functionType.declaredReturnType !== 'undefined'
    ) {
      expression.declaredReturnType = functionType.declaredReturnType
    }

    expression.returnNullable = false

    if (functionType !== null && typeof functionType !== 'undefined' && functionType.returnNullable === true) {
      expression.returnNullable = true
    } else if (
      expression.expressionBody &&
      expression.body !== null &&
      typeof expression.body !== 'undefined' &&
      expression.body.nullable === true
    ) {
      expression.returnNullable = true
    }

    expression.returnArrayElementType = null

    if (
      functionType !== null &&
      typeof functionType !== 'undefined' &&
      functionType.returnArrayElementType !== null &&
      typeof functionType.returnArrayElementType !== 'undefined'
    ) {
      expression.returnArrayElementType = functionType.returnArrayElementType
    } else if (
      expression.body !== null &&
      typeof expression.body !== 'undefined' &&
      expression.body.arrayElementType !== null &&
      typeof expression.body.arrayElementType !== 'undefined'
    ) {
      expression.returnArrayElementType = expression.body.arrayElementType
    }

    expression.returnMapKeyType = null

    if (
      functionType !== null &&
      typeof functionType !== 'undefined' &&
      functionType.returnMapKeyType !== null &&
      typeof functionType.returnMapKeyType !== 'undefined'
    ) {
      expression.returnMapKeyType = functionType.returnMapKeyType
    } else if (
      expression.body !== null &&
      typeof expression.body !== 'undefined' &&
      expression.body.mapKeyType !== null &&
      typeof expression.body.mapKeyType !== 'undefined'
    ) {
      expression.returnMapKeyType = expression.body.mapKeyType
    }

    expression.returnMapValueType = null

    if (
      functionType !== null &&
      typeof functionType !== 'undefined' &&
      functionType.returnMapValueType !== null &&
      typeof functionType.returnMapValueType !== 'undefined'
    ) {
      expression.returnMapValueType = functionType.returnMapValueType
    } else if (
      expression.body !== null &&
      typeof expression.body !== 'undefined' &&
      expression.body.mapValueType !== null &&
      typeof expression.body.mapValueType !== 'undefined'
    ) {
      expression.returnMapValueType = expression.body.mapValueType
    }

    expression.returnPromiseValueType = null

    if (
      functionType !== null &&
      typeof functionType !== 'undefined' &&
      functionType.returnPromiseValueType !== null &&
      typeof functionType.returnPromiseValueType !== 'undefined'
    ) {
      expression.returnPromiseValueType = functionType.returnPromiseValueType
    } else if (
      expression.body !== null &&
      typeof expression.body !== 'undefined' &&
      expression.body.promiseValueType !== null &&
      typeof expression.body.promiseValueType !== 'undefined'
    ) {
      expression.returnPromiseValueType = expression.body.promiseValueType
    }

    expression.returnSetElementType = null

    if (
      functionType !== null &&
      typeof functionType !== 'undefined' &&
      functionType.returnSetElementType !== null &&
      typeof functionType.returnSetElementType !== 'undefined'
    ) {
      expression.returnSetElementType = functionType.returnSetElementType
    } else if (
      expression.body !== null &&
      typeof expression.body !== 'undefined' &&
      expression.body.setElementType !== null &&
      typeof expression.body.setElementType !== 'undefined'
    ) {
      expression.returnSetElementType = expression.body.setElementType
    }

    if (expression.functionType === null || typeof expression.functionType === 'undefined') {
      expression.functionType = createArrowFunctionTypeMetadata(expression, this.resolveParams(expression.params))
    }
  }

  checkClassDeclaration(statement: AnyNode): void {
    const fieldNames = new Set()
    const methodNames = new Set()

    if (statement.extendsName !== null && typeof statement.extendsName !== 'undefined') {
      let extendsLoc = statement.loc

      if (statement.extendsLoc !== null && typeof statement.extendsLoc !== 'undefined') {
        extendsLoc = statement.extendsLoc
      }

      this.report('INOX_CLASS_EXTENDS', 'class inheritance is not supported', extendsLoc)
    }

    let fields: AnyNode[] = []

    if (statement.fields !== null && typeof statement.fields !== 'undefined') {
      fields = statement.fields
    }

    for (const field of fields) {
      if (field.static) {
        let fieldStaticLoc = field.loc

        if (field.staticLoc !== null && typeof field.staticLoc !== 'undefined') {
          fieldStaticLoc = field.staticLoc
        }

        this.report('INOX_CLASS_STATIC', 'static class fields are not supported', fieldStaticLoc)
      }

      if (fieldNames.has(field.name)) {
        this.report('INOX_REDECLARED_NAME', `field ${field.name} is already declared in this class`, field.loc)
      }

      fieldNames.add(field.name)
    }

    for (const method of statement.methods) {
      if (method.static) {
        let methodStaticLoc = method.loc

        if (method.staticLoc !== null && typeof method.staticLoc !== 'undefined') {
          methodStaticLoc = method.staticLoc
        }

        this.report('INOX_CLASS_STATIC', 'static class methods are not supported', methodStaticLoc)
      }

      if (methodNames.has(method.name)) {
        this.report('INOX_REDECLARED_NAME', `method ${method.name} is already declared in this class`, method.loc)
      }

      if (fieldNames.has(method.name)) {
        this.report('INOX_REDECLARED_NAME', `method ${method.name} conflicts with a class field`, method.loc)
      }

      methodNames.add(method.name)
      const scopeState = this.pushScope()

      try {
        const previousReturnType = this.currentReturnType
        const methodReturnInfo = this.resolveDeclaredType(method.returnType, method.loc)
        this.currentReturnType = methodReturnInfo.valueType
        const previousReturnNullable = this.currentReturnNullable
        this.currentReturnNullable = methodReturnInfo.nullable
        const previousReturnPromiseValueType = this.currentReturnPromiseValueType
        this.currentReturnPromiseValueType = null

        if (methodReturnInfo.promiseValueType !== null && typeof methodReturnInfo.promiseValueType !== 'undefined') {
          this.currentReturnPromiseValueType = methodReturnInfo.promiseValueType
        }

        const previousReturnAsync = this.currentReturnAsync
        this.currentReturnAsync = false
        const previousClassConstructor = this.currentClassConstructor
        this.currentClassConstructor = nodeNameEquals(method, 'constructor')
        const previousFunctionDepth = this.functionDepth
        this.functionDepth = this.functionDepth + 1
        let thisShape: ObjectShapeInfo | null = null

        if (statement.shape !== null && typeof statement.shape !== 'undefined') {
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
          const declaredType = nodeDeclaredTypeOrValueType(param)
          const paramInfo = this.resolveDeclaredType(declaredType, param.loc)
          param.declaredType = declaredType
          param.valueType = paramInfo.valueType
          param.nullable = paramInfo.nullable
          param.arrayElementType = paramInfo.arrayElementType
          param.arrayElementDeclaredType = paramInfo.arrayElementDeclaredType
          param.mapKeyType = paramInfo.mapKeyType
          param.mapValueType = paramInfo.mapValueType
          param.mapValueShape = paramInfo.mapValueShape
          param.promiseValueType = paramInfo.promiseValueType ?? null
          param.setElementType = paramInfo.setElementType
          param.functionType = paramInfo.functionType
          param.shape = paramInfo.shape
          param.className = this.declaredClassName(declaredType)

          this.declare(
            param.name,
            {
              kind: 'param',
              mutable: true,
              className: param.className,
              valueType: paramInfo.valueType,
              nullable: paramInfo.nullable,
              arrayElementType: paramInfo.arrayElementType,
              arrayElementDeclaredType: paramInfo.arrayElementDeclaredType,
              mapKeyType: paramInfo.mapKeyType,
              mapValueType: paramInfo.mapValueType,
              mapValueShape: paramInfo.mapValueShape,
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
      } finally {
        this.restoreScope(scopeState)
      }
    }
  }

  checkObjectLiteralAgainstShape(expression: AnyNode, shape: ObjectShapeInfo): void {
    expression.shape = shape

    const properties = new Map()

    for (const property of expression.properties) {
      properties.set(property.key, property)
    }

    for (const field of shape.fields) {
      const property = properties.get(field.name)

      if (property === null || typeof property === 'undefined') {
        if (field.optional !== true) {
          this.report('INOX_MISSING_FIELD', `missing field ${field.name}`, expression.loc)
        }
        continue
      }

      const fieldType = this.resolveFieldDeclaredType(field)
      const fieldShape = fieldType.shape
      const propertyFunctionType = resolvedFunctionTypeMetadata(field.functionType, fieldType.functionType)
      let propertyType: ValueType = 'unknown'

      if (
        fieldType.valueType === 'function' &&
        propertyFunctionType !== null &&
        typeof propertyFunctionType !== 'undefined' &&
        property.value.type === 'ArrowFunctionExpression'
      ) {
        this.checkArrowFunctionExpression(property.value, propertyFunctionType)
        propertyType = 'function'
      } else if (
        fieldType.valueType === 'object' &&
        fieldShape !== null &&
        typeof fieldShape !== 'undefined' &&
        property.value.type === 'ObjectLiteral'
      ) {
        this.checkObjectLiteralAgainstShape(property.value, fieldShape)
        propertyType = 'object'
      } else {
        propertyType = this.checkExpression(property.value)
      }

      this.checkAssignableType(
        propertyType,
        fieldType.valueType,
        property.loc,
        field.nullable === true,
        this.expressionCanBeNull(property.value)
      )

      if (
        fieldType.valueType === 'array' &&
        fieldType.arrayElementType !== null &&
        typeof fieldType.arrayElementType !== 'undefined'
      ) {
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
        let actualKey: ValueType | null = null
        let actualValue: ValueType | null = null

        if (actual !== null && typeof actual !== 'undefined') {
          actualKey = actual.key
          actualValue = actual.value
        }

        if (fieldType.mapKeyType !== null && typeof fieldType.mapKeyType !== 'undefined') {
          this.checkAssignableType(actualKey, fieldType.mapKeyType, property.loc, false, false)
        }

        if (fieldType.mapValueType !== null && typeof fieldType.mapValueType !== 'undefined') {
          this.checkAssignableType(actualValue, fieldType.mapValueType, property.loc, false, false)
        }
      }

      if (
        fieldType.valueType === 'set' &&
        fieldType.setElementType !== null &&
        typeof fieldType.setElementType !== 'undefined'
      ) {
        this.checkAssignableType(
          this.resolveExpressionSetElementType(property.value),
          fieldType.setElementType,
          property.loc,
          false,
          false
        )
      }

      if (
        fieldType.valueType === 'promise' &&
        fieldType.promiseValueType !== null &&
        typeof fieldType.promiseValueType !== 'undefined'
      ) {
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
      if (shape.dynamic !== true && !this.findShapeField(shape, property.key)) {
        this.report('INOX_UNKNOWN_FIELD', `unknown field ${property.key}`, property.loc)
      }
    }
  }

  resolveExpressionShape(expression: AnyNode): ObjectShapeInfo | null {
    return resolveExpressionShapeInContext(this.expressionMetadataContext(), expression)
  }

  resolveArrayIterableElementShape(expression: AnyNode): ObjectShapeInfo | null {
    return resolveArrayIterableElementShapeInContext(this.expressionMetadataContext(), expression)
  }

  resolveArrayElementObjectShape(
    valueType: ValueType,
    declaredType: string | null | undefined,
    loc: SourceLocation
  ): ObjectShapeInfo | null {
    return resolveArrayElementObjectShapeInContext(this.expressionMetadataContext(), valueType, declaredType, loc)
  }

  isThisExpression(expression: AnyNode): boolean {
    return isThisExpressionNode(expression)
  }

  canInitializeReadonlyClassField(expression: AnyNode): boolean {
    return this.currentClassConstructor && this.isThisExpression(expression)
  }

  findShapeField(shape: ObjectShapeInfo, name: string): AnyNode | null {
    return findShapeFieldInContext(shape, name)
  }

  getCallableSymbol(callee: AnyNode): SymbolInfo | null {
    const calleeFunctionType = callee.functionType

    if (calleeFunctionType !== null && typeof calleeFunctionType !== 'undefined') {
      return this.callableSymbolFromFunctionType(calleeFunctionType, callee.loc)
    }

    if (callee.type !== 'Reference' || callee.path.length !== 1) {
      return null
    }

    const calleeName = firstPathSegment(callee.path)
    let symbol = this.scope.resolve(calleeName)

    if (symbol === null || typeof symbol === 'undefined') {
      const globalSymbol = builtinGlobalSymbol(calleeName)

      if (globalSymbol !== null && typeof globalSymbol !== 'undefined') {
        symbol = globalSymbol
      }
    }

    if (symbol !== null && typeof symbol !== 'undefined' && symbol.kind === 'function') {
      return symbol
    }

    if (
      symbol !== null &&
      typeof symbol !== 'undefined' &&
      symbol.valueType === 'function' &&
      symbol.params !== null &&
      typeof symbol.params !== 'undefined' &&
      symbol.returnType !== null &&
      typeof symbol.returnType !== 'undefined'
    ) {
      return symbol
    }

    if (
      symbol !== null &&
      typeof symbol !== 'undefined' &&
      symbol.valueType === 'function' &&
      symbol.functionType !== null &&
      typeof symbol.functionType !== 'undefined'
    ) {
      return this.callableSymbolFromFunctionType(symbol.functionType, symbol.loc)
    }

    return null
  }

  callableSymbolFromFunctionType(
    functionType: FunctionTypeMetadata,
    loc: SourceLocation | null | undefined
  ): SymbolInfo {
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

    if (loc !== null && typeof loc !== 'undefined') {
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
        this.report('INOX_DUPLICATE_OBJECT_KEY', `duplicate object property ${property.key}`, property.loc)
      }

      keys.add(property.key)
      this.checkExpression(property.value)
    }
  }

  checkForStatement(statement: AnyNode): void {
    const scopeState = this.pushScope()

    try {
      if (
        statement.init !== null &&
        typeof statement.init !== 'undefined' &&
        statement.init.type === 'VariableDeclaration'
      ) {
        this.checkStatement(statement.init)
      } else if (statement.init !== null && typeof statement.init !== 'undefined') {
        this.checkExpression(statement.init)
      }

      if (statement.test !== null && typeof statement.test !== 'undefined') {
        this.checkBooleanCondition(statement.test)
      }

      if (statement.update !== null && typeof statement.update !== 'undefined') {
        this.checkExpression(statement.update)
      }

      const loopState = this.pushLoop()

      try {
        const narrowing = this.resolveNullableConditionNarrowing(statement.test)
        const narrowingState = this.pushNarrowedNullableNames(narrowing.trueNames)

        try {
          this.checkScopedBody(statement.body)
        } finally {
          this.restoreNarrowedNullableNames(narrowingState)
        }
      } finally {
        this.restoreLoopDepth(loopState)
      }
    } finally {
      this.restoreScope(scopeState)
    }
  }

  checkForOfStatement(statement: AnyNode): void {
    const iterableType = this.checkExpression(statement.iterable)
    let mapEntryShape: ObjectShapeInfo | null = null

    if (iterableType === 'map') {
      mapEntryShape = createMapEntryShape(this.resolveExpressionMapType(statement.iterable), statement.nameLoc)
    }

    let elementType: ValueType = 'unknown'

    if (iterableType === 'array') {
      const arrayElementType = this.resolveExpressionArrayElementType(statement.iterable)

      if (arrayElementType !== null && typeof arrayElementType !== 'undefined') {
        elementType = arrayElementType
      }
    } else if (iterableType === 'set') {
      const setElementType = this.resolveExpressionSetElementType(statement.iterable)

      if (setElementType !== null && typeof setElementType !== 'undefined') {
        elementType = setElementType
      }
    } else if (iterableType === 'map') {
      elementType = 'object'
    }

    let elementDeclaredType: string = 'unknown'

    if (iterableType === 'array') {
      const arrayElementDeclaredType = this.resolveExpressionArrayElementDeclaredType(statement.iterable)
      elementDeclaredType = elementType

      if (arrayElementDeclaredType !== null && typeof arrayElementDeclaredType !== 'undefined') {
        elementDeclaredType = arrayElementDeclaredType
      }
    } else if (iterableType === 'set') {
      elementDeclaredType = elementType
    } else if (iterableType === 'map') {
      elementDeclaredType = 'object'
    }

    let declared: ResolvedTypeInfo | null = null

    if (statement.declaredType !== null && typeof statement.declaredType !== 'undefined') {
      declared = this.resolveDeclaredType(statement.declaredType, statement.nameLoc)
    }

    let valueType = elementType

    if (declared !== null && typeof declared !== 'undefined') {
      valueType = declared.valueType
    }

    let inferredDeclaredType: string | null = elementDeclaredType

    if (declared !== null && typeof declared !== 'undefined') {
      inferredDeclaredType = statement.declaredType
    }

    let shape = mapEntryShape

    if (iterableType === 'array' && elementType === 'object') {
      const iterableShape = this.resolveArrayIterableElementShape(statement.iterable)

      if (iterableShape !== null && typeof iterableShape !== 'undefined') {
        shape = iterableShape
      }
    }

    if (
      declared !== null &&
      typeof declared !== 'undefined' &&
      declared.shape !== null &&
      typeof declared.shape !== 'undefined'
    ) {
      shape = declared.shape
    }

    statement.valueType = valueType
    statement.nullable = false

    if (declared !== null && typeof declared !== 'undefined' && declared.nullable === true) {
      statement.nullable = true
    }

    statement.inferredDeclaredType = inferredDeclaredType
    statement.arrayElementType = null
    statement.arrayElementDeclaredType = null
    statement.mapKeyType = null
    statement.mapValueType = null
    statement.setElementType = null
    statement.functionType = null

    if (declared !== null && typeof declared !== 'undefined') {
      if (declared.arrayElementType !== null && typeof declared.arrayElementType !== 'undefined') {
        statement.arrayElementType = declared.arrayElementType
      }

      if (declared.arrayElementDeclaredType !== null && typeof declared.arrayElementDeclaredType !== 'undefined') {
        statement.arrayElementDeclaredType = declared.arrayElementDeclaredType
      }

      if (declared.mapKeyType !== null && typeof declared.mapKeyType !== 'undefined') {
        statement.mapKeyType = declared.mapKeyType
      }

      if (declared.mapValueType !== null && typeof declared.mapValueType !== 'undefined') {
        statement.mapValueType = declared.mapValueType
      }

      if (declared.setElementType !== null && typeof declared.setElementType !== 'undefined') {
        statement.setElementType = declared.setElementType
      }

      if (declared.functionType !== null && typeof declared.functionType !== 'undefined') {
        statement.functionType = declared.functionType
      }
    }

    statement.shape = shape

    if (declared !== null && typeof declared !== 'undefined') {
      this.checkAssignableType(elementType, declared.valueType, statement.nameLoc, declared.nullable, false)
    }

    const scopeState = this.pushScope()
    let declaredNullable = false
    let declaredArrayElementType: ValueType | null = null
    let declaredArrayElementDeclaredType: string | null = null
    let declaredMapKeyType: ValueType | null = null
    let declaredMapValueType: ValueType | null = null
    let declaredSetElementType: ValueType | null = null
    let declaredFunctionType: AnyNode | null = null

    if (declared !== null && typeof declared !== 'undefined') {
      declaredNullable = declared.nullable === true

      if (declared.arrayElementType !== null && typeof declared.arrayElementType !== 'undefined') {
        declaredArrayElementType = declared.arrayElementType
      }

      if (declared.arrayElementDeclaredType !== null && typeof declared.arrayElementDeclaredType !== 'undefined') {
        declaredArrayElementDeclaredType = declared.arrayElementDeclaredType
      }

      if (declared.mapKeyType !== null && typeof declared.mapKeyType !== 'undefined') {
        declaredMapKeyType = declared.mapKeyType
      }

      if (declared.mapValueType !== null && typeof declared.mapValueType !== 'undefined') {
        declaredMapValueType = declared.mapValueType
      }

      if (declared.setElementType !== null && typeof declared.setElementType !== 'undefined') {
        declaredSetElementType = declared.setElementType
      }

      if (declared.functionType !== null && typeof declared.functionType !== 'undefined') {
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

    try {
      const loopState = this.pushLoop()

      try {
        this.checkScopedBody(statement.body)
      } finally {
        this.restoreLoopDepth(loopState)
      }
    } finally {
      this.restoreScope(scopeState)
    }
  }

  checkSwitchStatement(statement: AnyNode): void {
    const discriminantType = this.checkExpression(statement.discriminant)
    let hasDefault = false

    if (!isSwitchableType(discriminantType)) {
      this.report(
        'INOX_SWITCH_TYPE',
        `switch discriminant must be number, string or boolean, got ${discriminantType}`,
        statement.discriminant.loc
      )
    }

    const breakableState = this.pushBreakable()

    try {
      for (const item of statement.cases) {
        if (item.test === null || typeof item.test === 'undefined') {
          if (hasDefault) {
            this.report('INOX_DUPLICATE_DEFAULT', 'switch can only have one default branch', item.loc)
          }

          hasDefault = true
        } else {
          const caseType = this.checkExpression(item.test)

          if (!isMatchingSwitchCaseType(caseType, discriminantType)) {
            this.report(
              'INOX_SWITCH_TYPE',
              `switch case type ${caseType} does not match discriminant type ${discriminantType}`,
              item.test.loc
            )
          }
        }

        const scopeState = this.pushScope()

        try {
          this.checkStatements(item.consequent)
        } finally {
          this.restoreScope(scopeState)
        }
      }
    } finally {
      this.restoreLoopDepth(breakableState)
    }
  }

  checkBooleanCondition(expression: AnyNode): void {
    const conditionType = this.checkExpression(expression)

    if (
      !isConditionValueType(conditionType) &&
      !(expression.nullable === true && isRuntimeNullableType(conditionType))
    ) {
      this.report(
        'INOX_CONDITION_TYPE',
        `condition must be boolean or truthy-compatible, got ${conditionType}`,
        expression.loc
      )
    }
  }

  resolveNullableConditionNarrowing(expression: AnyNode | null | undefined): NullableConditionNarrowing {
    if (expression === null || typeof expression === 'undefined') {
      return {
        trueNames: [],
        falseNames: []
      }
    }

    if (expression.type === 'UnaryExpression' && expression.operator === '!') {
      const argument = this.resolveNullableConditionNarrowing(expression.argument)

      return {
        trueNames: argument.falseNames,
        falseNames: argument.trueNames
      }
    }

    if (expression.type !== 'BinaryExpression') {
      const key = nullableNarrowingKey(expression)

      if (key !== null && typeof key !== 'undefined' && expression.nullable === true) {
        return {
          trueNames: [key],
          falseNames: []
        }
      }

      return {
        trueNames: [],
        falseNames: []
      }
    }

    if (expression.operator === '&&') {
      const left = this.resolveNullableConditionNarrowing(expression.left)
      const narrowingState = this.pushNarrowedNullableNames(left.trueNames)
      let right: NullableConditionNarrowing = {
        trueNames: [],
        falseNames: []
      }

      right = this.resolveNullableConditionNarrowing(expression.right)
      this.restoreNarrowedNullableNames(narrowingState)
      const trueNames: string[] = []
      const falseNameCandidates: string[] = []
      const leftTrueNames: string[] = left.trueNames
      const rightTrueNames: string[] = right.trueNames
      const rightFalseNames: string[] = right.falseNames

      for (const name of leftTrueNames) {
        trueNames.push(name)
        falseNameCandidates.push(name)
      }

      for (const name of rightTrueNames) {
        trueNames.push(name)
      }

      for (const name of rightFalseNames) {
        falseNameCandidates.push(name)
      }

      return {
        trueNames: uniqueNames(trueNames),
        falseNames: intersectNames(left.falseNames, uniqueNames(falseNameCandidates))
      }
    }

    if (expression.operator === '||') {
      const left = this.resolveNullableConditionNarrowing(expression.left)
      const narrowingState = this.pushNarrowedNullableNames(left.falseNames)
      let right: NullableConditionNarrowing = {
        trueNames: [],
        falseNames: []
      }

      right = this.resolveNullableConditionNarrowing(expression.right)
      this.restoreNarrowedNullableNames(narrowingState)
      const trueNameCandidates: string[] = []
      const falseNames: string[] = []
      const leftFalseNames: string[] = left.falseNames
      const rightTrueNames: string[] = right.trueNames
      const rightFalseNames: string[] = right.falseNames

      for (const name of leftFalseNames) {
        trueNameCandidates.push(name)
        falseNames.push(name)
      }

      for (const name of rightTrueNames) {
        trueNameCandidates.push(name)
      }

      for (const name of rightFalseNames) {
        falseNames.push(name)
      }

      return {
        trueNames: intersectNames(left.trueNames, uniqueNames(trueNameCandidates)),
        falseNames: uniqueNames(falseNames)
      }
    }

    if (
      expression.operator !== '===' &&
      expression.operator !== '!=='
    ) {
      return {
        trueNames: [],
        falseNames: []
      }
    }

    let nullable = expression.left
    let maybeNull = expression.right

    if (
      expression.left !== null &&
      typeof expression.left !== 'undefined' &&
      (expression.left.type === 'NullLiteral' || isNonNullNarrowingLiteral(expression.left))
    ) {
      nullable = expression.right
      maybeNull = expression.left
    }

    if (
      maybeNull === null ||
      typeof maybeNull === 'undefined' ||
      nullable === null ||
      typeof nullable === 'undefined'
    ) {
      return {
        trueNames: [],
        falseNames: []
      }
    }

    const key = nullableNarrowingKey(nullable)

    if (key === null || typeof key === 'undefined' || nullable.nullable !== true) {
      return {
        trueNames: [],
        falseNames: []
      }
    }

    if (isNonNullNarrowingLiteral(maybeNull)) {
      if (expression.operator === '===') {
        return {
          trueNames: [key],
          falseNames: []
        }
      }

      return {
        trueNames: [],
        falseNames: [key]
      }
    }

    if (maybeNull.type !== 'NullLiteral') {
      return {
        trueNames: [],
        falseNames: []
      }
    }

    if (expression.operator === '!==') {
      return {
        trueNames: [key],
        falseNames: []
      }
    }

    return {
      trueNames: [],
      falseNames: [key]
    }
  }

  reportNullableRuntimeAccess(receiver: AnyNode, loc: SourceLocation): void {
    if (receiver.nullable !== true) {
      return
    }

    let valueType: ValueType | null = null
    const receiverValueType = receiver.valueType

    if (receiverValueType !== null && typeof receiverValueType !== 'undefined') {
      valueType = receiverValueType
    } else {
      valueType = this.inferNullableAccessValueType(receiver)
    }

    if (valueType === null || typeof valueType === 'undefined') {
      return
    }

    const narrowedValueType: ValueType = valueType

    if (!isRuntimeNullableType(narrowedValueType)) {
      return
    }

    this.report('INOX_WEAK_ACCESS', 'nullable weak value access requires optional chaining or a prior null check', loc)
  }

  inferNullableAccessValueType(expression: AnyNode): ValueType | null {
    if (expression.type === 'Reference' && expression.path.length === 1) {
      const name = firstPathSegment(expression.path)
      const symbol = this.scope.resolve(name)
      let valueType: ValueType | null = null

      if (symbol !== null && typeof symbol !== 'undefined') {
        valueType = symbol.valueType
      }

      if (valueType !== null && typeof valueType !== 'undefined') {
        return valueType
      }

      return null
    }

    if (expression.valueType !== null && typeof expression.valueType !== 'undefined') {
      return expression.valueType
    }

    return null
  }

  pushNarrowedNullableNames(names: string[]): CheckerNarrowingState | null {
    if (names.length === 0) {
      return null
    }

    return this.pushBranchNarrowedNullableNames(names)
  }

  pushBranchNarrowedNullableNames(names: string[]): CheckerNarrowingState {
    const previous = {
      narrowedNullableNames: this.narrowedNullableNames
    }

    this.narrowedNullableNames = cloneStringSet(previous.narrowedNullableNames)

    for (const name of names) {
      this.narrowedNullableNames.add(name)
    }

    return previous
  }

  restoreNarrowedNullableNames(previous: CheckerNarrowingState | null): void {
    if (previous !== null && typeof previous !== 'undefined') {
      this.narrowedNullableNames = previous.narrowedNullableNames
    }
  }

  checkScopedBody(statement: AnyNode): void {
    if (statement.type === 'BlockStatement') {
      this.checkStatement(statement)
      return
    }

    const scopeState = this.pushScope()

    try {
      this.checkStatement(statement)
    } finally {
      this.restoreScope(scopeState)
    }
  }

  checkFlowScopedBody(statement: AnyNode): void {
    const scopeState = this.pushScope()

    try {
      if (statement.type === 'BlockStatement') {
        this.checkStatements(statement.body)
      } else {
        this.checkStatement(statement)
      }
    } finally {
      this.restoreScopeWithOuterNarrowing(scopeState)
    }
  }

  resolveReference(reference: AnyNode): SymbolInfo | null {
    const path: string[] = reference.path
    const root = path[0]

    if (root === 'super') {
      this.reportUnsupportedSuperReference(reference.loc)
      return null
    }

    let symbol = this.scope.resolve(root)

    if (symbol === null || typeof symbol === 'undefined') {
      const globalSymbol = builtinGlobalSymbol(root)

      if (globalSymbol !== null && typeof globalSymbol !== 'undefined') {
        symbol = globalSymbol
      }
    }

    if (symbol === null || typeof symbol === 'undefined') {
      this.report('INOX_UNKNOWN_NAME', `unknown name ${root}`, reference.loc)
      return null
    }

    return symbol
  }

  reportUnsupportedSuperReference(loc: SourceLocation): void {
    const diagnostics = this.diagnostics
    const file = loc.file ?? ''

    for (let index = 0; index < diagnostics.length; index = index + 1) {
      const item = diagnostics[index]
      const itemFile = item.file ?? ''

      if (
        item.code === 'INOX_CLASS_EXTENDS' &&
        item.line === loc.line &&
        item.column === loc.column &&
        itemFile === file
      ) {
        return
      }
    }

    this.report('INOX_CLASS_EXTENDS', 'super is not supported because class inheritance is not supported', loc)
  }

  runtimeGlobalIsShadowed(name: string): boolean {
    const symbol = this.scope.resolve(name)

    return symbol !== null && typeof symbol !== 'undefined' && symbol.kind !== 'global'
  }

  declaredTypeContext(): DeclaredTypeResolverContext {
    return {
      classNames: this.classNames,
      diagnostics: this.diagnostics,
      resolvedDeclaredTypes: this.resolvedDeclaredTypes,
      resolvingDeclaredTypes: this.resolvingDeclaredTypes,
      symbols: this.typeSymbols,
      types: this.types
    }
  }

  expressionMetadataContext(): ExpressionMetadataResolverContext {
    const scopeBindings: Map<string, SymbolInfo>[] = []
    this.scope.collectBindings(scopeBindings)

    return {
      declaredTypes: this.declaredTypeContext(),
      scopeBindings
    }
  }

  primitiveCallContext(): PrimitiveCallCheckerContext {
    return {
      diagnostics: this.diagnostics
    }
  }

  globalCallContext(): GlobalCallCheckerContext {
    return {
      diagnostics: this.diagnostics
    }
  }

  callableSymbolContext(): CallableSymbolCheckerContext {
    return {
      diagnostics: this.diagnostics
    }
  }

  nodeRuntimeCallContext(): NodeRuntimeCallCheckerContext {
    return {
      diagnostics: this.diagnostics
    }
  }

  childProcessCallContext(): ChildProcessCallCheckerContext {
    return {
      diagnostics: this.diagnostics
    }
  }

  fsCallContext(): FsCallCheckerContext {
    return {
      diagnostics: this.diagnostics
    }
  }

  fetchCallContext(): FetchCallCheckerContext {
    return {
      diagnostics: this.diagnostics
    }
  }

  timeCallContext(): TimeCallCheckerContext {
    return {
      diagnostics: this.diagnostics
    }
  }

  timerCallContext(): TimerCallCheckerContext {
    return {
      diagnostics: this.diagnostics
    }
  }

  declareTypeAlias(item: TypeAliasDeclarationNode): void {
    declareTypeAliasInContext(this.declaredTypeContext(), item)
  }

  resolveDeclaredType(name: string | null | undefined, loc: SourceLocation): ResolvedTypeInfo {
    return resolveDeclaredTypeInContext(this.declaredTypeContext(), name, loc)
  }

  resolveUnionDeclaredType(names: string[], loc: SourceLocation): ResolvedTypeInfo {
    return resolveUnionDeclaredTypeInContext(this.declaredTypeContext(), names, loc)
  }

  resolveObjectShape(shape: ObjectShapeInfo): ObjectShapeInfo {
    return resolveObjectShapeInContext(this.declaredTypeContext(), shape)
  }

  resolveObjectShapeField(field: AnyNode, fields: AnyNode[]): AnyNode {
    return resolveObjectShapeFieldInContext(this.declaredTypeContext(), field, fields)
  }

  resolveFunctionTypeMetadata(
    functionType: FunctionTypeMetadata | null | undefined,
    loc: SourceLocation | null | undefined
  ): FunctionTypeMetadata | null {
    return resolveFunctionTypeMetadataInContext(this.declaredTypeContext(), functionType, loc)
  }

  resolveObjectShapeBases(shape: ObjectShapeInfo): ObjectShapeBases {
    return resolveObjectShapeBasesInContext(this.declaredTypeContext(), shape)
  }

  resolveFieldDeclaredType(field: AnyNode): ResolvedTypeInfo {
    return resolveFieldDeclaredTypeInContext(this.declaredTypeContext(), field)
  }

  resolveWeakFieldDeclaredType(field: AnyNode): ResolvedTypeInfo {
    return resolveWeakFieldDeclaredTypeInContext(this.declaredTypeContext(), field)
  }

  resolveWeakTargetDeclaredType(name: string | null | undefined, loc: SourceLocation): ResolvedTypeInfo {
    return resolveWeakTargetDeclaredTypeInContext(this.declaredTypeContext(), name, loc)
  }

  resolveWeakTargetObjectShape(shape: ObjectShapeInfo): ObjectShapeInfo {
    return resolveWeakTargetObjectShapeInContext(this.declaredTypeContext(), shape)
  }

  resolveWeakTargetShapeFieldType(field: AnyNode): ResolvedTypeInfo {
    return resolveWeakTargetShapeFieldTypeInContext(this.declaredTypeContext(), field)
  }

  resolveWeakTargetShapeTypeName(name: string | null | undefined, loc: SourceLocation): ResolvedTypeInfo {
    return resolveWeakTargetShapeTypeNameInContext(this.declaredTypeContext(), name, loc)
  }

  cloneResolvedTypeInfo(info: ResolvedTypeInfo): ResolvedTypeInfo {
    return cloneResolvedTypeInfoInContext(info)
  }

  unresolvedTypeInfo(): ResolvedTypeInfo {
    return unresolvedTypeInfoInContext()
  }

  resolveExpressionArrayElementType(expression: AnyNode | null | undefined): ValueType | null {
    return resolveExpressionArrayElementTypeInContext(this.expressionMetadataContext(), expression)
  }

  resolveExpressionArrayElementDeclaredType(expression: AnyNode | null | undefined): string | null {
    return resolveExpressionArrayElementDeclaredTypeInContext(this.expressionMetadataContext(), expression)
  }

  resolveExpressionArrayElementFunctionType(expression: AnyNode | null | undefined): FunctionTypeMetadata | null {
    return resolveExpressionArrayElementFunctionTypeInContext(this.expressionMetadataContext(), expression)
  }

  resolveExpressionMapType(expression: AnyNode | null | undefined): CheckerMapType | null {
    return resolveExpressionMapTypeInContext(this.expressionMetadataContext(), expression)
  }

  resolveExpressionSetElementType(expression: AnyNode | null | undefined): ValueType | null {
    return resolveExpressionSetElementTypeInContext(this.expressionMetadataContext(), expression)
  }

  resolveExpressionPromiseValueType(expression: AnyNode | null | undefined): ValueType | null {
    return resolveExpressionPromiseValueTypeInContext(this.expressionMetadataContext(), expression)
  }

  resolveRejectedExpressionValueType(expression: AnyNode | null | undefined): ValueType {
    return resolveRejectedExpressionValueTypeInContext(this.expressionMetadataContext(), expression)
  }

  isErrorObjectExpression(expression: AnyNode): boolean {
    return isErrorObjectExpressionInContext(this.expressionMetadataContext(), expression)
  }

  declare(name: string, symbol: SymbolInfo, loc: SourceLocation): void {
    if (this.scope.hasOwn(name)) {
      this.report('INOX_REDECLARED_NAME', `name ${name} is already declared in this scope`, loc)
      return
    }

    this.scope.bindings.set(name, symbol)
    if (symbol.kind === 'class') {
      this.typeSymbols.set(name, symbol)
    }
    deleteNullableNarrowingKey(this.narrowedNullableNames, name)
  }

  pushScope(): CheckerScopeState {
    const previous = {
      scope: this.scope,
      narrowedNullableNames: this.narrowedNullableNames
    }

    this.scope = new CheckerScope(previous.scope)
    this.narrowedNullableNames = cloneStringSet(previous.narrowedNullableNames)

    return previous
  }

  restoreScope(previous: CheckerScopeState): void {
    this.scope = previous.scope
    this.narrowedNullableNames = previous.narrowedNullableNames
  }

  restoreScopeWithOuterNarrowing(previous: CheckerScopeState): void {
    const currentScope = this.scope
    const currentNarrowedNames = this.narrowedNullableNames
    const restoredNarrowedNames: Set<string> = new Set()

    for (const name of previous.narrowedNullableNames) {
      const rootName = this.narrowingRootName(name)

      if (currentScope.hasOwn(rootName)) {
        restoredNarrowedNames.add(name)
      }
    }

    for (const name of currentNarrowedNames) {
      const rootName = this.narrowingRootName(name)

      if (!currentScope.hasOwn(rootName)) {
        restoredNarrowedNames.add(name)
      }
    }

    this.scope = previous.scope
    this.narrowedNullableNames = restoredNarrowedNames
  }

  narrowingRootName(name: string): string {
    const dotIndex = name.indexOf('.')

    if (dotIndex < 0) {
      return name
    }

    return name.slice(0, dotIndex)
  }

  pushReturnContext(
    returnType: ValueType,
    returnNullable: boolean,
    returnPromiseValueType: ValueType | null
  ): CheckerReturnContextState {
    const previous = {
      returnType: this.currentReturnType,
      returnNullable: this.currentReturnNullable,
      returnPromiseValueType: this.currentReturnPromiseValueType,
      returnAsync: this.currentReturnAsync
    }

    this.currentReturnType = returnType
    this.currentReturnNullable = returnNullable
    this.currentReturnPromiseValueType = returnPromiseValueType
    this.currentReturnAsync = false

    return previous
  }

  restoreReturnContext(previous: CheckerReturnContextState): void {
    this.currentReturnType = previous.returnType
    this.currentReturnNullable = previous.returnNullable
    this.currentReturnPromiseValueType = previous.returnPromiseValueType
    this.currentReturnAsync = previous.returnAsync
  }

  pushBreakable(): CheckerLoopDepthState {
    const previous = {
      breakDepth: this.breakDepth,
      continueDepth: this.continueDepth
    }

    this.breakDepth = this.breakDepth + 1

    return previous
  }

  pushLoop(): CheckerLoopDepthState {
    const previous = {
      breakDepth: this.breakDepth,
      continueDepth: this.continueDepth
    }

    this.breakDepth = this.breakDepth + 1
    this.continueDepth = this.continueDepth + 1

    return previous
  }

  restoreLoopDepth(previous: CheckerLoopDepthState): void {
    this.breakDepth = previous.breakDepth
    this.continueDepth = previous.continueDepth
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

      if (
        actualCanBeNull &&
        actual !== 'null' &&
        actual !== 'unknown' &&
        actual !== null &&
        typeof actual !== 'undefined'
      ) {
        actualLabel = `${actual} | null`
      }

      this.report('INOX_TYPE_MISMATCH', `cannot assign ${actualLabel} to ${expected}`, loc)
    }
  }

  report(code: string, message: string, loc: SourceLocation): void {
    const item = diagnostic(code, message, loc)
    const diagnostics = this.diagnostics
    diagnostics.push(item)
  }
}
