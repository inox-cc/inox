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
  libuvOnlyRuntimeImportFeature
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
  compilerLibraryHasModuleDeclaration,
  compilerLibraryNativeTypeForId,
  compilerLibraryNativeTypeIsAssignable,
  compilerLibraryOperationForBinding,
  compilerLibraryOperationForGlobal,
  compilerLibraryOperationForImport,
  compilerLibraryOperationForReceiver,
  resolveCompilerLibrarySet
} from './extensions/library-set.ts'
import {
  parseCompilerLibraryGlobalDeclarations,
  type ParsedCompilerLibraryGlobalDeclaration
} from './extensions/global-declarations.ts'
import { compilerLibraryCapabilities } from './extensions/library-options.ts'
import type {
  LibraryOperationDescriptor,
  LibraryOperationKind,
  LibraryArgumentCheckDescriptor,
  LibraryObjectLiteralFieldDescriptor,
  LibraryOperationVariantDescriptor,
  LibraryResultShapeFieldDescriptor
} from './extensions/types.ts'
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
  callExpressionArgumentLabel,
  createArrowFunctionTypeMetadata,
  createMapEntryShape,
  knownCheckedExpressionType,
  resolveExpressionPromiseRejectionValueType,
  resolveMapEntryArrayType
} from './checker/expression-helpers.ts'
import {
  checkCollectionMethodCall as checkCollectionMethodCallInContext,
  isCollectionMethodCandidate
} from './checker/collection-calls.ts'
import type {
  CheckedCollectionArgInfo,
  CheckedCollectionCallInfo,
  CollectionCallCheckerContext
} from './checker/collection-calls.ts'
import {
  checkSimpleArrayMethodCall as checkSimpleArrayMethodCallInContext,
  isSimpleArrayMethod
} from './checker/array-calls.ts'
import type {
  ArrayCallCheckerContext,
  CheckedArrayArgInfo,
  CheckedArrayCallInfo
} from './checker/array-calls.ts'
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
  checkObjectStaticCall as checkObjectStaticCallInContext,
  isObjectStaticCall as isObjectStaticCallInContext
} from './checker/global-calls.ts'
import type {
  CheckedCallArgInfo,
  GlobalCallCheckerContext
} from './checker/global-calls.ts'
import {
  checkDateConstructorExpression as checkDateConstructorExpressionInContext,
  checkDateInstanceMethodCall as checkDateInstanceMethodCallInContext,
  checkTimeCall as checkTimeCallInContext
} from './checker/time-calls.ts'
import type { TimeCallCheckerContext } from './checker/time-calls.ts'
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
  isArrayMethod
} from '../stdlib/global/compiler/descriptor.ts'
import { isStdlibModuleImportSource } from './stdlib/node/modules.ts'
import {
  isUnsupportedRuntimeBuiltinImportSource,
  unsupportedRuntimeBuiltinImportMessageFromKnownSource
} from './stdlib/node/builtins.ts'
import {
  isArrayTypeName,
  isBuiltinValueType,
  isNullableTypeName,
  nullableTypeNameFromKnownTypeName
} from './type-names.ts'
import type {
  AnyNode,
  ArrayBindingElement,
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
  parentBindings: Map<string, SymbolInfo>[]
  bindings: Map<string, SymbolInfo>

  constructor(parent: CheckerScope | null) {
    this.parentBindings = []
    this.bindings = new Map()

    if (parent !== null) {
      this.parentBindings.push(parent.bindings)

      for (let index = 0; index < parent.parentBindings.length; index = index + 1) {
        this.parentBindings.push(parent.parentBindings[index])
      }
    }
  }

  hasOwn(name: string): boolean {
    return this.bindings.has(name)
  }

  resolve(name: string): SymbolInfo | null {
    const local = this.bindings.get(name)

    if (local !== null && typeof local !== 'undefined') {
      return local
    }

    for (let index = 0; index < this.parentBindings.length; index = index + 1) {
      const found = this.parentBindings[index].get(name)

      if (found !== null && typeof found !== 'undefined') {
        return found
      }
    }

    return null
  }

  collectBindings(target: Map<string, SymbolInfo>[]): void {
    target.push(this.bindings)

    for (let index = 0; index < this.parentBindings.length; index = index + 1) {
      target.push(this.parentBindings[index])
    }
  }
}

type CheckerScopeState = {
  scope: CheckerScope
  narrowedNullableNames: Set<string>
}

type CheckerTypeParameterState = {
  name: string
  previousType: TypeAliasInfo | null
  previousResolvedType: ResolvedTypeInfo | null
}

type CheckerNarrowingState = {
  narrowedNullableNames: Set<string>
}

type CheckerReturnContextState = {
  returnType: ValueType
  returnNullable: boolean
  returnPromiseValueType: ValueType | null
  returnShape: ObjectShapeInfo | null
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
  ambientTypeNames: Set<string>
  localTypeNames: Set<string>
  breakDepth: number
  continueDepth: number
  currentReturnType: ValueType
  currentReturnNullable: boolean
  currentReturnPromiseValueType: ValueType | null
  currentReturnShape: ObjectShapeInfo | null
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
    this.ambientTypeNames = new Set()
    this.localTypeNames = new Set()
    this.breakDepth = 0
    this.continueDepth = 0
    this.currentReturnType = 'void'
    this.currentReturnNullable = false
    this.currentReturnPromiseValueType = null
    this.currentReturnShape = null
    this.currentReturnAsync = false
    this.currentClassConstructor = false
    this.asyncDepth = 0
    this.functionDepth = 0
    this.narrowedNullableNames = new Set()
    this.resolvedDeclaredTypes = new Map()
    this.resolvingDeclaredTypes = new Set()
  }

  check(): void {
    this.collectLibraryGlobalDeclarations()
    this.collectTopLevelDeclarations()

    for (let index = 0; index < this.program.body.length; index = index + 1) {
      const item = checkerNodeAt(this.program.body, index)

      this.checkTopLevelItem(item)
    }

    throwDiagnostics(this.diagnostics)
  }

  collectLibraryGlobalDeclarations(): void {
    const parsed = parseCompilerLibraryGlobalDeclarations(
      resolveCompilerLibrarySet(this.options.libraries).declarations
    )

    for (let index = 0; index < parsed.diagnostics.length; index = index + 1) {
      this.diagnostics.push(parsed.diagnostics[index])
    }

    throwDiagnostics(this.diagnostics)

    for (let declarationIndex = 0; declarationIndex < parsed.declarations.length; declarationIndex = declarationIndex + 1) {
      const declaration = parsed.declarations[declarationIndex]

      for (let itemIndex = 0; itemIndex < declaration.program.body.length; itemIndex = itemIndex + 1) {
        const item = checkerNodeAt(declaration.program.body, itemIndex)

        if (item.type === 'TypeAliasDeclaration') {
          this.types.set(item.name, item.valueType)
          this.ambientTypeNames.add(item.name)
        } else if (item.type === 'ClassDeclaration') {
          this.classNames.add(item.name)
          this.ambientTypeNames.add(item.name)
        }
      }
    }

    for (let declarationIndex = 0; declarationIndex < parsed.declarations.length; declarationIndex = declarationIndex + 1) {
      this.declareLibraryGlobalProgram(parsed.declarations[declarationIndex])
    }

    const ambientScope = this.scope

    this.scope = new CheckerScope(ambientScope)
    this.resolvedDeclaredTypes.clear()
    this.resolvingDeclaredTypes.clear()
  }

  declareLibraryGlobalProgram(declaration: ParsedCompilerLibraryGlobalDeclaration): void {
    for (let index = 0; index < declaration.program.body.length; index = index + 1) {
      const item = checkerNodeAt(declaration.program.body, index)

      if (item.type === 'FunctionDeclaration') {
        this.declareLibraryGlobalFunction(declaration.libraryId, item)
      } else if (item.type === 'VariableDeclaration') {
        this.declareLibraryGlobalVariable(declaration.libraryId, item)
      } else if (item.type === 'ClassDeclaration') {
        this.declareLibraryGlobalClass(declaration.libraryId, item)
      }
    }
  }

  declareLibraryGlobalFunction(libraryId: string, item: AnyNode): void {
    const symbol = this.importedFunctionDeclarationSymbol(item, item.loc)
    symbol.libraryId = libraryId
    symbol.libraryBindingId = `global:${item.name}`
    const existing = this.scope.bindings.get(item.name)

    if (existing !== null && typeof existing !== 'undefined') {
      const overloads = existing.overloads ?? []
      overloads.push(symbol)
      existing.overloads = overloads
      return
    }

    const firstOverload = this.importedFunctionDeclarationSymbol(item, item.loc)
    symbol.overloads = [firstOverload]
    this.scope.bindings.set(item.name, symbol)
  }

  declareLibraryGlobalVariable(libraryId: string, item: AnyNode): void {
    const info = this.resolveDeclaredType(item.declaredType, item.loc)
    const symbol: SymbolInfo = {
      kind: 'global',
      mutable: item.kind !== 'const',
      valueType: info.valueType,
      libraryId,
      libraryBindingId: `global:${item.name}`,
      loc: item.loc
    }

    this.applyResolvedTypeInfoToSymbol(symbol, info)
    this.scope.bindings.set(item.name, symbol)
  }

  declareLibraryGlobalClass(libraryId: string, item: AnyNode): void {
    const constructorMethods: AnyNode[] = []

    for (let index = 0; index < item.methods.length; index = index + 1) {
      const method = checkerNodeAt(item.methods, index)

      if (method.name === 'constructor') {
        constructorMethods.push(method)
      }
    }

    const constructorMethod = constructorMethods[0] ?? null
    let constructorParams: AnyNode[] = []

    if (constructorMethod !== null && typeof constructorMethod !== 'undefined') {
      constructorParams = this.resolveParams(constructorMethod.params)
    }

    const shape = this.resolveClassInstanceShape(item, constructorParams)
    const constructorOverloads: SymbolInfo[] = []

    if (constructorMethods.length === 0) {
      constructorOverloads.push({
        kind: 'function',
        valueType: 'function',
        params: [],
        returnType: 'object',
        returnShape: shape,
        loc: item.loc
      })
    }

    for (let index = 0; index < constructorMethods.length; index = index + 1) {
      const method = constructorMethods[index]

      constructorOverloads.push({
        kind: 'function',
        valueType: 'function',
        params: this.resolveParams(method.params),
        returnType: 'object',
        returnShape: shape,
        loc: method.loc
      })
    }

    const symbol: SymbolInfo = {
      kind: 'class',
      mutable: false,
      valueType: 'class',
      libraryId,
      libraryBindingId: `global:${item.name}`,
      classMethods: item.methods,
      constructorParams,
      constructorOverloads,
      shape,
      loc: item.loc
    }

    item.shape = shape
    this.scope.bindings.set(item.name, symbol)
    this.typeSymbols.set(item.name, symbol)
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

          if (specifier.typeOnly) {
            continue
          }

          const symbol: SymbolInfo = {
            kind: 'import',
            mutable: false,
            valueType: importSpecifierValueType(specifier, item.source),
            importedName: specifier.imported,
            importSource: item.source,
            loc: specifier.loc
          }

          this.applyImportSpecifierValueMetadata(symbol, specifier)

          if (specifier.constructable === true) {
            symbol.constructable = true
            symbol.className = specifier.className ?? null
            symbol.constructorParams = this.resolveImportedParams(specifier.constructorParams ?? [])
          }

          if (specifier.returnType !== null && typeof specifier.returnType !== 'undefined') {
            symbol.valueType = 'function'
            symbol.params = this.resolveImportedParams(specifier.params ?? [])
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

            const functionOverloads: AnyNode[] = specifier.functionOverloads ?? []

            if (functionOverloads.length > 1) {
              symbol.overloads = []

              for (const overload of functionOverloads) {
                symbol.overloads.push(this.importedFunctionDeclarationSymbol(overload, specifier.loc))
              }
            }
          }

          this.declare(specifier.local, symbol, specifier.loc)
        }
      }

      if (item.type === 'FunctionDeclaration') {
        const typeParameterState = this.pushFunctionTypeParameters(item)

        try {
          const returnInfo = this.resolveFunctionDeclarationReturnType(item)

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
        } finally {
          this.restoreFunctionTypeParameters(typeParameterState)
        }
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
    symbol.mapValueArrayElementType = info.mapValueArrayElementType ?? null
    symbol.mapValueArrayElementDeclaredType = info.mapValueArrayElementDeclaredType ?? null
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

  resolveImportedParams(params: AnyNode[]): FunctionTypeParamMetadata[] {
    const resolved: FunctionTypeParamMetadata[] = []

    for (let index = 0; index < params.length; index = index + 1) {
      const param = params[index]
      const declaredType = param.declaredType
      const valueType = nodeValueTypeOrUnknown(param)

      if (
        (declaredType !== null && typeof declaredType !== 'undefined') ||
        isBuiltinValueType(valueType)
      ) {
        resolved.push(param as FunctionTypeParamMetadata)
      } else {
        resolved.push(this.resolveParam(param))
      }
    }

    return resolved
  }

  importedFunctionDeclarationSymbol(declaration: AnyNode, loc: SourceLocation): SymbolInfo {
    return {
      kind: 'function',
      valueType: 'function',
      params: this.resolveImportedParams(declaration.params ?? []),
      returnType: declaration.returnType ?? declaration.declaredReturnType ?? 'unknown',
      returnNullable: declaration.returnNullable === true,
      returnArrayElementType: declaration.returnArrayElementType ?? null,
      returnArrayElementDeclaredType: declaration.returnArrayElementDeclaredType ?? null,
      returnMapKeyType: declaration.returnMapKeyType ?? null,
      returnMapValueType: declaration.returnMapValueType ?? null,
      returnPromiseValueType: declaration.returnPromiseValueType ?? null,
      returnSetElementType: declaration.returnSetElementType ?? null,
      returnShape: declaration.returnShape ?? null,
      async: declaration.async === true,
      loc
    }
  }

  resolveParam(param: AnyNode): FunctionTypeParamMetadata {
    const declaredType = nodeDeclaredTypeOrValueType(param)

    const paramInfo = this.resolveDeclaredType(declaredType, param.loc)
    const declaredFunctionType = this.resolveFunctionTypeMetadata(param.functionType, param.loc)

    if (declaredFunctionType !== null) {
      paramInfo.valueType = 'function'
      paramInfo.functionType = declaredFunctionType
    }

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
      mapValueArrayElementType: paramInfo.mapValueArrayElementType,
      mapValueArrayElementDeclaredType: paramInfo.mapValueArrayElementDeclaredType,
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
      const typeParameterState = this.pushFunctionTypeParameters(item)

      try {
        const previousReturnType = this.currentReturnType
        const returnInfo = this.resolveFunctionDeclarationReturnType(item)
        this.currentReturnType = returnInfo.valueType
        const previousReturnNullable = this.currentReturnNullable
        this.currentReturnNullable = returnInfo.nullable
        const previousReturnPromiseValueType = this.currentReturnPromiseValueType
        const previousReturnShape = this.currentReturnShape
        this.currentReturnShape = returnInfo.shape
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
              mapValueArrayElementType: paramInfo.mapValueArrayElementType,
              mapValueArrayElementDeclaredType: paramInfo.mapValueArrayElementDeclaredType,
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
          this.currentReturnShape = previousReturnShape
          this.currentReturnAsync = previousReturnAsync
          this.asyncDepth = previousAsyncDepth
          this.functionDepth = previousFunctionDepth
        }
      } finally {
        this.restoreFunctionTypeParameters(typeParameterState)
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
      } else if (consequentNarrowedNames !== null && typeof consequentNarrowedNames !== 'undefined') {
        const consequentNames: string[] = []

        for (const name of consequentNarrowedNames) {
          consequentNames.push(name)
        }

        const commonNames = intersectNames(consequentNames, narrowing.falseNames)

        for (const name of commonNames) {
          this.narrowedNullableNames.add(name)
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

      let narrowingTrueNames: string[] = []
      let narrowingFalseNames: string[] = []

      if (
        statement.kind === 'const' &&
        initType === 'boolean' &&
        statement.init !== null &&
        typeof statement.init !== 'undefined'
      ) {
        const narrowing = this.resolveNullableConditionNarrowing(statement.init)

        if (this.nullableAliasNarrowingIsStable(narrowing)) {
          narrowingTrueNames = narrowing.trueNames
          narrowingFalseNames = narrowing.falseNames
        }
      }

      const statementArrayElementDeclaredType = arrayElementDeclaredType

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
          narrowingTrueNames,
          narrowingFalseNames,
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
        this.checkAssignableLibraryNativeType(
          this.resolveExpressionShape(statement.init),
          declared.shape,
          statement.loc
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
      if (statement.argument !== null && typeof statement.argument !== 'undefined') {
        this.checkAssignableLibraryNativeType(
          this.resolveExpressionShape(statement.argument),
          this.currentReturnShape,
          statement.loc
        )
      }

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
      const path: string[] = expression.path
      const isUndefinedValue =
        path.length === 1 && path[0] === 'undefined' && !this.scope.resolve('undefined')
      const symbol = isUndefinedValue ? null : this.resolveReference(expression)
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

      if (isUndefinedValue) {
        expression.nullable = true
        return valueType
      }

      if (symbol !== null && typeof symbol !== 'undefined') {
        valueType = symbol.valueType
        expression.nullable = symbol.nullable === true && !this.narrowedNullableNames.has(path[0])
        expression.valueType = valueType
        expression.narrowingTrueNames = symbol.narrowingTrueNames ?? []
        expression.narrowingFalseNames = symbol.narrowingFalseNames ?? []

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
        } else if (
          symbol.kind === 'function' &&
          symbol.returnType !== null &&
          typeof symbol.returnType !== 'undefined'
        ) {
          let params: AnyNode[] = []

          if (symbol.params !== null && typeof symbol.params !== 'undefined') {
            params = symbol.params
          }

          expression.functionType = {
            kind: 'function',
            resolved: true,
            params,
            returnType: symbol.returnType,
            returnNullable: symbol.returnNullable === true,
            returnArrayElementType: symbol.returnArrayElementType ?? null,
            returnArrayElementDeclaredType: symbol.returnArrayElementDeclaredType ?? null,
            returnMapKeyType: symbol.returnMapKeyType ?? null,
            returnMapValueType: symbol.returnMapValueType ?? null,
            returnPromiseValueType: symbol.returnPromiseValueType ?? null,
            returnSetElementType: symbol.returnSetElementType ?? null,
            returnShape: symbol.returnShape ?? null
          }
        }

        if (symbol.shape !== null && typeof symbol.shape !== 'undefined') {
          expression.shape = symbol.shape
        }

        if (symbol.className !== null && typeof symbol.className !== 'undefined') {
          expression.className = symbol.className
        }
      }

      if (
        path.length === 1 &&
        (symbol === null || typeof symbol === 'undefined' || symbol.kind !== 'import')
      ) {
        const globalOperation = this.compilerLibraryOperationForExpression(
          expression,
          'member-read'
        )

        if (globalOperation !== null) {
          this.applyCompilerLibraryOperation(expression, globalOperation)

          if (this.reportCompilerLibraryOperationDiagnostic(expression, globalOperation)) {
            valueType = 'unknown'
          } else {
            valueType = expression.valueType
          }
        }
      }

      if (symbol !== null && typeof symbol !== 'undefined' && symbol.kind === 'import') {
        const importSource = symbol.importSource
        const importedName = symbol.importedName
        const libraryOperation = compilerLibraryOperationForImport(
          resolveCompilerLibrarySet(this.options.libraries),
          importSource,
          importedName,
          [],
          'member-read'
        )

        if (libraryOperation !== null) {
          this.applyCompilerLibraryOperation(expression, libraryOperation)

          if (this.reportCompilerLibraryOperationDiagnostic(expression, libraryOperation)) {
            valueType = 'unknown'
          }
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
            this.checkAssignableLibraryNativeType(
              this.resolveExpressionShape(expression.args[index]),
              param.shape as ObjectShapeInfo | null | undefined,
              expression.args[index].loc
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
      } else {
        const argumentShape = this.resolveExpressionShape(expression.argument)

        if (
          argumentShape?.libraryTypeId !== null &&
          typeof argumentShape?.libraryTypeId !== 'undefined'
        ) {
          expression.shape = argumentShape
        }
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

        if (element.type === 'SpreadElement') {
          const argumentType = this.checkExpression(element.argument)
          this.checkAssignableType(argumentType, 'array', element.argument.loc, false, false)
          element.valueType = 'array'
          element.arrayElementType = this.resolveExpressionArrayElementType(element.argument)
          elementTypes.push(element.arrayElementType ?? 'unknown')
        } else {
          elementTypes.push(this.checkExpression(element))
        }
      }

      expression.arrayElementType = commonArrayElementType(elementTypes)
      expression.arrayElementDeclaredType = this.arrayLiteralElementDeclaredType(
        expression,
        expression.arrayElementType
      )
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

  arrayLiteralElementDeclaredType(expression: AnyNode, elementType: ValueType): string {
    if (elementType !== 'array') {
      return elementType
    }

    let nestedElementType: string | null = null

    for (let index = 0; index < expression.elements.length; index = index + 1) {
      const element = checkerNodeAt(expression.elements, index)
      let value = element

      if (element.type === 'SpreadElement') {
        value = element.argument
      }

      const declared =
        this.resolveExpressionArrayElementDeclaredType(value) ??
        this.resolveExpressionArrayElementType(value)

      if (declared === null || typeof declared === 'undefined') {
        return 'array'
      }

      if (nestedElementType === null) {
        nestedElementType = declared
      } else if (nestedElementType !== declared) {
        return 'array'
      }
    }

    if (nestedElementType === null) {
      return 'array'
    }

    return `array<${nestedElementType}>`
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
    const libraryMemberType = this.applyCompilerLibraryMemberOperation(expression)

    if (libraryMemberType !== null) {
      return libraryMemberType
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
    expression.mapValueArrayElementType =
      field.mapValueArrayElementType ?? fieldType.mapValueArrayElementType ?? null
    expression.mapValueArrayElementDeclaredType =
      field.mapValueArrayElementDeclaredType ?? fieldType.mapValueArrayElementDeclaredType ?? null
    expression.promiseValueType = resolvedValueTypeMetadata(field.promiseValueType, fieldType.promiseValueType)
    expression.setElementType = resolvedValueTypeMetadata(field.setElementType, fieldType.setElementType)
    expression.shape = resolvedObjectShapeMetadata(field.shape, fieldType.shape)
    expression.functionType = resolvedFunctionTypeMetadata(field.functionType, fieldType.functionType)
    expression.functionOverloads = field.functionOverloads ?? []
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
    expression.mapValueArrayElementType =
      field.mapValueArrayElementType ?? fieldType.mapValueArrayElementType ?? null
    expression.mapValueArrayElementDeclaredType =
      field.mapValueArrayElementDeclaredType ?? fieldType.mapValueArrayElementDeclaredType ?? null
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
    const globalLibraryOperation = this.compilerLibraryOperationForExpression(
      expression.target,
      'member-write'
    )

    if (globalLibraryOperation !== null) {
      this.checkExpression(expression.target.object)
      const valueType = this.checkExpression(expression.value)
      this.checkCompilerLibrarySingleArgument(expression.value, valueType, globalLibraryOperation)
      this.applyCompilerLibraryOperation(expression, globalLibraryOperation)
      this.reportCompilerLibraryOperationDiagnostic(expression, globalLibraryOperation)
      return valueType
    }

    const targetType = this.checkExpression(expression.target.object)
    const shape = this.resolveExpressionShape(expression.target.object)
    const valueType = this.checkExpression(expression.value)
    const libraryOperation = this.compilerLibraryReceiverOperation(
      expression.target.object,
      expression.target.property,
      'member-write'
    )

    if (libraryOperation !== null) {
      this.checkCompilerLibrarySingleArgument(expression.value, valueType, libraryOperation)
      this.applyCompilerLibraryOperation(expression, libraryOperation)
      this.reportCompilerLibraryOperationDiagnostic(expression, libraryOperation)
      return valueType
    }

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
    const objectType = this.checkExpression(expression.object)
    const indexType = this.checkExpression(expression.index)
    const libraryOperation = this.compilerLibraryReceiverOperation(
      expression.object,
      '',
      'index-read'
    )

    if (libraryOperation !== null) {
      this.checkCompilerLibrarySingleArgument(expression.index, indexType, libraryOperation)
      this.applyCompilerLibraryOperation(expression, libraryOperation)

      if (this.reportCompilerLibraryOperationDiagnostic(expression, libraryOperation)) {
        return 'unknown'
      }

      return (libraryOperation.valueType ?? 'unknown') as ValueType
    }

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
        let nullable = optionalChainReceiver

        if (declaredType !== null && typeof declaredType !== 'undefined') {
          nullable = nullable || this.resolveDeclaredType(declaredType, expression.loc).nullable
        }

        expression.nullable = nullable
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
    const libraryOperation = this.compilerLibraryReceiverOperation(
      expression.target.object,
      '',
      'index-write'
    )

    if (libraryOperation !== null) {
      this.checkCompilerLibrarySingleArgument(expression.target.index, indexType, libraryOperation, 0)
      this.checkCompilerLibrarySingleArgument(expression.value, valueType, libraryOperation, 1)
      this.applyCompilerLibraryOperation(expression, libraryOperation)
      this.reportCompilerLibraryOperationDiagnostic(expression, libraryOperation)
      return valueType
    }

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
    const libraryDiagnosticType = this.checkCompilerLibraryCallOperation(expression)

    if (libraryDiagnosticType !== null) {
      return libraryDiagnosticType
    }

    const consoleType = this.checkConsoleCall(expression)

    if (consoleType !== null && typeof consoleType !== 'undefined') {
      return consoleType
    }

    const timeType = this.checkTimeCall(expression)

    if (timeType !== null && typeof timeType !== 'undefined') {
      return timeType
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

    const fetchType = this.checkFetchCall(expression)

    if (fetchType !== null && typeof fetchType !== 'undefined') {
      return fetchType
    }

    const jsonType = this.checkJsonCall(expression, null)

    if (jsonType !== null && typeof jsonType !== 'undefined') {
      return jsonType
    }

    const debugMemoryType = this.checkDebugMemoryCall(expression)

    if (debugMemoryType !== null && typeof debugMemoryType !== 'undefined') {
      return debugMemoryType
    }

    const promiseStaticType = this.checkPromiseStaticCall(expression)

    if (promiseStaticType !== null && typeof promiseStaticType !== 'undefined') {
      return promiseStaticType
    }

    const classMethodType = this.checkClassMethodCall(expression)

    if (classMethodType !== null && typeof classMethodType !== 'undefined') {
      return classMethodType
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

  checkCompilerLibraryCallOperation(expression: AnyNode): ValueType | null {
    let operation = this.compilerLibraryOperationForExpression(expression.callee, 'call')

    if (operation === null && expression.callee.type === 'MemberExpression') {
      this.checkExpression(expression.callee.object)
      operation = this.compilerLibraryReceiverOperation(
        expression.callee.object,
        expression.callee.property,
        'call'
      )
    }

    if (operation === null) {
      return null
    }

    const declaredSymbol = this.compilerLibraryDeclarationCallableSymbol(expression.callee)
    const variant = this.compilerLibraryOperationVariant(expression, operation)

    this.applyCompilerLibraryOperation(expression, operation, variant)

    if (this.reportCompilerLibraryOperationDiagnostic(expression, operation)) {
      this.checkedCallArgInfos(expression)
      return 'unknown'
    }

    const argInfos = this.checkCompilerLibraryOperationArguments(expression, operation, variant)
    let declaredType: ValueType | null = null

    if (declaredSymbol !== null) {
      declaredType = applyCallableSymbolCallInContext(
        this.callableSymbolContext(),
        expression,
        declaredSymbol,
        argInfos
      )
      this.applyCompilerLibraryOperation(expression, operation, variant)
    }

    this.checkCompilerLibraryBackendConstraints(expression, operation)

    return (variant?.valueType ?? declaredType ?? operation.valueType ?? 'unknown') as ValueType
  }

  compilerLibraryDeclarationCallableSymbol(callee: AnyNode): SymbolInfo | null {
    const path = memberExpressionPath(callee)

    if (path.length === 0) {
      return null
    }

    const root = this.scope.resolve(path[0])

    if (
      root === null ||
      typeof root === 'undefined' ||
      root.libraryId === null ||
      typeof root.libraryId === 'undefined' ||
      root.libraryBindingId === null ||
      typeof root.libraryBindingId === 'undefined'
    ) {
      return null
    }

    this.checkExpression(callee)
    return this.getCallableSymbol(callee)
  }

  compilerLibraryDeclarationConstructorSymbol(callee: AnyNode): SymbolInfo | null {
    const path = memberExpressionPath(callee)

    if (path.length !== 1) {
      return null
    }

    const symbol = this.scope.resolve(path[0])

    if (
      symbol === null ||
      typeof symbol === 'undefined' ||
      symbol.libraryId === null ||
      typeof symbol.libraryId === 'undefined' ||
      symbol.libraryBindingId === null ||
      typeof symbol.libraryBindingId === 'undefined'
    ) {
      return null
    }

    return this.constructorCallableSymbol(symbol)
  }

  constructorCallableSymbol(symbol: SymbolInfo): SymbolInfo | null {
    const overloads = symbol.constructorOverloads ?? []
    const first = overloads[0]

    if (first === null || typeof first === 'undefined') {
      return null
    }

    return {
      ...first,
      overloads
    }
  }

  compilerLibraryOperationVariant(
    expression: AnyNode,
    operation: LibraryOperationDescriptor
  ): LibraryOperationVariantDescriptor | null {
    const variants = operation.variants ?? []

    for (let index = 0; index < variants.length; index = index + 1) {
      const variant = variants[index]
      const minArgs = variant.minArgs
      const maxArgs = variant.maxArgs

      if (
        (minArgs !== null && typeof minArgs !== 'undefined' && expression.args.length < minArgs) ||
        (maxArgs !== null && typeof maxArgs !== 'undefined' && expression.args.length > maxArgs)
      ) {
        continue
      }

      const argumentIndex = variant.argumentIndex

      if (argumentIndex !== null && typeof argumentIndex !== 'undefined') {
        const argument = expression.args[argumentIndex]
        const literals = variant.stringLiterals ?? []
        const valueTypes = variant.argumentValueTypes ?? []

        if (
          argument === null ||
          typeof argument === 'undefined'
        ) {
          continue
        }

        if (
          literals.length > 0 &&
          (argument.type !== 'StringLiteral' || !literals.includes(argument.value))
        ) {
          continue
        }

        if (valueTypes.length > 0 && !valueTypes.includes(this.inferCheckedExpressionType(argument))) {
          continue
        }

        const objectFieldName = variant.objectFieldName
        const booleanLiterals = variant.booleanLiterals ?? []

        if (
          objectFieldName !== null &&
          typeof objectFieldName !== 'undefined' &&
          !this.compilerLibraryObjectFieldMatches(argument, objectFieldName, booleanLiterals)
        ) {
          continue
        }
      }

      return variant
    }

    return null
  }

  checkCompilerLibraryOperationArguments(
    expression: AnyNode,
    operation: LibraryOperationDescriptor,
    variant: LibraryOperationVariantDescriptor | null = null,
    knownArgInfos: CheckedCallArgInfo[] | null = null
  ): CheckedCallArgInfo[] {
    const minArgs = operation.minArgs
    const maxArgs = operation.maxArgs

    if (
      (minArgs !== null && typeof minArgs !== 'undefined' && expression.args.length < minArgs) ||
      (maxArgs !== null && typeof maxArgs !== 'undefined' && expression.args.length > maxArgs)
    ) {
      this.report(
        'INOX_ARG_COUNT',
        `library operation ${operation.operationId} expects ${minArgs ?? 0} to ${maxArgs ?? 'many'} argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    const checks = variant?.argumentChecks ?? operation.argumentChecks ?? []
    const contextuallyCheckedCallbacks = new Set<AnyNode>()

    for (let index = 0; index < checks.length && index < expression.args.length; index = index + 1) {
      const argument = expression.args[index]
      const check = checks[index]

      if (
        argument.type === 'ArrowFunctionExpression' &&
        check.functionParameters !== null &&
        typeof check.functionParameters !== 'undefined'
      ) {
        this.checkArrowFunctionExpression(
          argument,
          this.compilerLibraryCallbackFunctionType(check, argument.loc),
          check.functionAsync === false ? check.functionAsyncDiagnosticCode : null,
          check.functionAsync === false ? check.functionAsyncDiagnosticMessage : null
        )
        contextuallyCheckedCallbacks.add(argument)
      }
    }

    const argInfos: CheckedCallArgInfo[] = knownArgInfos ?? []

    if (knownArgInfos === null) {
      for (let index = 0; index < expression.args.length; index = index + 1) {
        const argument = expression.args[index]

        if (contextuallyCheckedCallbacks.has(argument)) {
          argInfos.push(this.checkedCallArgInfo(argument, 'function'))
        } else {
          argInfos.push(this.checkedCallArgInfo(argument))
        }
      }
    }

    for (let index = 0; index < checks.length && index < argInfos.length; index = index + 1) {
      const check = checks[index]
      const info = argInfos[index]
      const argument = expression.args[index]

      if (
        argument.type !== 'ArrowFunctionExpression' &&
        check.functionParameters !== null &&
        typeof check.functionParameters !== 'undefined' &&
        this.checkCompilerLibraryNamedCallbackArgument(argument, check)
      ) {
        continue
      }

      if (!check.valueTypes.includes(info.valueType)) {
        this.report(
          'INOX_TYPE_MISMATCH',
          `library operation ${operation.operationId} does not accept ${info.valueType}`,
          info.loc
        )
        continue
      }

      const arrayElementValueTypes = check.arrayElementValueTypes ?? []

      const stringLiterals = check.stringLiterals ?? []

      if (
        stringLiterals.length > 0 &&
        info.valueType === 'string' &&
        (argument.type !== 'StringLiteral' || !stringLiterals.includes(argument.value))
      ) {
        this.report(
          check.literalDiagnosticCode ?? 'INOX_NOT_IMPLEMENTED',
          check.literalDiagnosticMessage ??
            `library operation ${operation.operationId} does not support this string literal`,
          argument.loc
        )
      }

      if (
        check.arrayLiteralRequired === true &&
        info.arrayElementType !== null &&
        typeof info.arrayElementType !== 'undefined' &&
        argument.type !== 'ArrayLiteral'
      ) {
        this.report(
          'INOX_NOT_IMPLEMENTED',
          `library operation ${operation.operationId} currently requires an array literal argument`,
          info.loc
        )
      }

      if (argument.type === 'ArrayLiteral' && arrayElementValueTypes.length > 0) {
        for (let elementIndex = 0; elementIndex < argument.elements.length; elementIndex = elementIndex + 1) {
          const element = checkerNodeAt(argument.elements, elementIndex)
          const elementValueType = this.checkExpression(element)

          if (!arrayElementValueTypes.includes(elementValueType)) {
            this.report(
              'INOX_TYPE_MISMATCH',
              `library operation ${operation.operationId} does not accept ${elementValueType} array elements`,
              element.loc
            )
          }
        }
      }

      const objectTypeIds = check.objectTypeIds ?? []

      this.checkCompilerLibraryObjectLiteralFields(argument, check, operation)

      if (objectTypeIds.length > 0 && info.valueType === 'object') {
        const objectTypeId = info.shape?.libraryTypeId
        let assignable = false

        for (let typeIndex = 0; typeIndex < objectTypeIds.length; typeIndex = typeIndex + 1) {
          if (
            compilerLibraryNativeTypeIsAssignable(
              resolveCompilerLibrarySet(this.options.libraries),
              objectTypeId,
              objectTypeIds[typeIndex]
            )
          ) {
            assignable = true
            break
          }
        }

        if (!assignable) {
          this.report(
            'INOX_TYPE_MISMATCH',
            `library operation ${operation.operationId} does not accept this object type`,
            info.loc
          )
        }
      }

      const fieldValueType = check.objectFieldValueType

      if (
        fieldValueType !== null &&
        typeof fieldValueType !== 'undefined'
      ) {
        if (argument.type === 'ObjectLiteral') {
          const properties: CheckerObjectPropertyNode[] = argument.properties

          for (let fieldIndex = 0; fieldIndex < properties.length; fieldIndex = fieldIndex + 1) {
            const property = properties[fieldIndex]
            const actual = this.checkExpression(property.value)
            this.checkAssignableType(
              actual,
              fieldValueType,
              property.value.loc,
              false,
              this.expressionCanBeNull(property.value)
            )
          }
        } else if (info.shape !== null && typeof info.shape !== 'undefined') {
          for (let fieldIndex = 0; fieldIndex < info.shape.fields.length; fieldIndex = fieldIndex + 1) {
            const field = info.shape.fields[fieldIndex]
            const resolved = this.resolveFieldDeclaredType(field)
            this.checkAssignableType(resolved.valueType, fieldValueType, info.loc, false, resolved.nullable)
          }
        }
      }
    }

    return argInfos
  }

  checkCompilerLibraryNamedCallbackArgument(
    argument: AnyNode,
    check: LibraryArgumentCheckDescriptor
  ): boolean {
    const symbol = this.getCallableSymbol(argument)

    if (symbol === null || typeof symbol === 'undefined') {
      return false
    }

    const actualAsync = symbol.async === true || symbol.returnType === 'promise'

    if (check.functionAsync === false && actualAsync) {
      this.report(
        check.functionAsyncDiagnosticCode ?? 'INOX_ASYNC_CALLBACK',
        check.functionAsyncDiagnosticMessage ??
          'async callbacks are not supported by this library operation',
        argument.loc
      )
      return true
    }

    const parameters = check.functionParameters ?? []

    if (
      symbol.params !== null &&
      typeof symbol.params !== 'undefined' &&
      symbol.params.length > parameters.length
    ) {
      this.report(
        'INOX_ARG_COUNT',
        `function callback expects at most ${parameters.length} parameter(s), got ${symbol.params.length}`,
        argument.loc
      )
    }

    if (
      check.functionReturnType !== null &&
      typeof check.functionReturnType !== 'undefined' &&
      symbol.returnType !== null &&
      typeof symbol.returnType !== 'undefined'
    ) {
      this.checkAssignableType(
        symbol.returnType,
        check.functionReturnType,
        argument.loc,
        false,
        symbol.returnNullable === true
      )
    }

    return false
  }

  compilerLibraryCallbackFunctionType(
    check: LibraryArgumentCheckDescriptor,
    loc: SourceLocation
  ): AnyNode {
    const parameters = check.functionParameters ?? []
    const params: AnyNode[] = []
    const libraries = resolveCompilerLibrarySet(this.options.libraries)

    for (let index = 0; index < parameters.length; index = index + 1) {
      const parameter = parameters[index]
      const nativeType = parameter.resultTypeId === null || typeof parameter.resultTypeId === 'undefined'
        ? null
        : compilerLibraryNativeTypeForId(libraries, parameter.resultTypeId)
      const fields = parameter.shapeFields ?? nativeType?.fields ?? []
      const shapeFields: AnyNode[] = []

      for (let fieldIndex = 0; fieldIndex < fields.length; fieldIndex = fieldIndex + 1) {
        shapeFields.push(this.compilerLibraryResultShapeField(fields[fieldIndex], loc))
      }

      const param: AnyNode = {
        name: parameter.name,
        valueType: parameter.valueType,
        nullable: parameter.nullable === true,
        loc
      }

      if (
        parameter.resultTypeId !== null &&
        typeof parameter.resultTypeId !== 'undefined'
      ) {
        param.shape = {
          kind: 'object',
          fields: shapeFields,
          libraryTypeId: parameter.resultTypeId,
          libraryCppType: nativeType?.cppType ?? null
        }
      } else if (shapeFields.length > 0) {
        param.shape = {
          kind: 'object',
          fields: shapeFields
        }
      }

      params.push(param)
    }

    return {
      kind: 'function',
      resolved: true,
      params,
      returnType: check.functionReturnType ?? 'void'
    }
  }

  compilerLibraryObjectFieldMatches(
    argument: AnyNode,
    fieldName: string,
    booleanLiterals: boolean[]
  ): boolean {
    if (argument.type !== 'ObjectLiteral') {
      return false
    }

    for (let index = 0; index < argument.properties.length; index = index + 1) {
      const property = argument.properties[index]

      if (property.key !== fieldName) {
        continue
      }

      if (booleanLiterals.length === 0) {
        return true
      }

      return property.value.type === 'BooleanLiteral' && booleanLiterals.includes(property.value.value)
    }

    return false
  }

  checkCompilerLibraryObjectLiteralFields(
    argument: AnyNode,
    check: LibraryArgumentCheckDescriptor,
    operation: LibraryOperationDescriptor
  ): void {
    const fields = check.objectLiteralFields

    if (fields === null || typeof fields === 'undefined') {
      return
    }

    if (this.inferCheckedExpressionType(argument) !== 'object') {
      return
    }

    if (argument.type !== 'ObjectLiteral') {
      this.report(
        'INOX_NOT_IMPLEMENTED',
        `library operation ${operation.operationId} currently requires an object literal argument`,
        argument.loc
      )
      return
    }

    const seen: Set<string> = new Set()

    for (let propertyIndex = 0; propertyIndex < argument.properties.length; propertyIndex = propertyIndex + 1) {
      const property = argument.properties[propertyIndex]
      let field: LibraryObjectLiteralFieldDescriptor | null = null

      for (let fieldIndex = 0; fieldIndex < fields.length; fieldIndex = fieldIndex + 1) {
        if (fields[fieldIndex].name === property.key) {
          field = fields[fieldIndex]
          break
        }
      }

      if (field === null) {
        this.report(
          'INOX_NOT_IMPLEMENTED',
          `library operation ${operation.operationId} does not support option ${property.key}`,
          property.loc
        )
        continue
      }

      seen.add(field.name)
      const valueType = this.inferCheckedExpressionType(property.value)

      if (!field.valueTypes.includes(valueType)) {
        this.report(
          'INOX_TYPE_MISMATCH',
          `library operation ${operation.operationId} option ${field.name} does not accept ${valueType}`,
          property.value.loc
        )
        continue
      }

      const booleanLiterals = field.booleanLiterals ?? []

      if (
        booleanLiterals.length > 0 &&
        (property.value.type !== 'BooleanLiteral' || !booleanLiterals.includes(property.value.value))
      ) {
        this.report(
          'INOX_NOT_IMPLEMENTED',
          `library operation ${operation.operationId} option ${field.name} requires a supported boolean literal`,
          property.value.loc
        )
      }

      const stringLiterals = field.stringLiterals ?? []

      if (
        stringLiterals.length > 0 &&
        (property.value.type !== 'StringLiteral' || !stringLiterals.includes(property.value.value))
      ) {
        this.report(
          'INOX_NOT_IMPLEMENTED',
          `library operation ${operation.operationId} option ${field.name} requires a supported string literal`,
          property.value.loc
        )
      }
    }

    for (let fieldIndex = 0; fieldIndex < fields.length; fieldIndex = fieldIndex + 1) {
      const field = fields[fieldIndex]

      if (field.optional !== true && !seen.has(field.name)) {
        this.report(
          'INOX_TYPE_MISMATCH',
          `library operation ${operation.operationId} requires option ${field.name}`,
          argument.loc
        )
      }
    }
  }

  checkCompilerLibraryBackendConstraints(expression: AnyNode, operation: LibraryOperationDescriptor): void {
    const libraries = resolveCompilerLibrarySet(this.options.libraries)

    for (let requirementIndex = 0; requirementIndex < operation.runtimeRequirements.length; requirementIndex = requirementIndex + 1) {
      const requirementId = operation.runtimeRequirements[requirementIndex]

      for (let descriptorIndex = 0; descriptorIndex < libraries.runtimeRequirements.length; descriptorIndex = descriptorIndex + 1) {
        const requirement = libraries.runtimeRequirements[descriptorIndex]

        if (requirement.id !== requirementId) {
          continue
        }

        const constraints = requirement.backendConstraints ?? []

        for (let constraintIndex = 0; constraintIndex < constraints.length; constraintIndex = constraintIndex + 1) {
          const constraint = constraints[constraintIndex]
          let actual: string = this.options.loopBackend ?? 'embedded'

          if (constraint.option === 'tlsBackend') {
            actual = this.options.tlsBackend ?? 'none'
          }

          if (!constraint.allowedValues.includes(actual)) {
            this.report(
              constraint.diagnosticCode,
              constraint.diagnosticMessage,
              expression.loc
            )
          }
        }
      }
    }

  }

  checkCompilerLibrarySingleArgument(
    expression: AnyNode,
    valueType: ValueType,
    operation: LibraryOperationDescriptor,
    argumentIndex: number = 0
  ): void {
    const check = operation.argumentChecks?.[argumentIndex]

    if (check === null || typeof check === 'undefined') {
      return
    }

    if (!check.valueTypes.includes(valueType)) {
      this.report(
        'INOX_TYPE_MISMATCH',
        `library operation ${operation.operationId} does not accept ${valueType}`,
        expression.loc
      )
    }
  }

  applyCompilerLibraryMemberOperation(expression: AnyNode): ValueType | null {
    let operation = this.compilerLibraryOperationForExpression(expression, 'member-read')

    if (operation === null && expression.type === 'MemberExpression') {
      this.checkExpression(expression.object)
      operation = this.compilerLibraryReceiverOperation(expression.object, expression.property, 'member-read')
    }

    if (operation !== null) {
      this.applyCompilerLibraryOperation(expression, operation)

      if (this.reportCompilerLibraryOperationDiagnostic(expression, operation)) {
        return 'unknown'
      }

      const valueType = operation.valueType

      if (valueType !== null && typeof valueType !== 'undefined') {
        return valueType as ValueType
      }
    }

    return null
  }

  compilerLibraryReceiverOperation(
    receiver: AnyNode,
    memberName: string,
    kind: LibraryOperationKind
  ): LibraryOperationDescriptor | null {
    const shape = this.resolveExpressionShape(receiver)

    if (shape === null || typeof shape === 'undefined') {
      return null
    }

    return compilerLibraryOperationForReceiver(
      resolveCompilerLibrarySet(this.options.libraries),
      shape.libraryTypeId,
      memberName,
      kind
    )
  }

  compilerLibraryOperationForExpression(
    expression: AnyNode,
    kind: LibraryOperationKind
  ): LibraryOperationDescriptor | null {
    const path = memberExpressionPath(expression)

    if (path.length === 0) {
      return null
    }

    const scopedSymbol = this.scope.resolve(path[0])

    if (scopedSymbol === null || typeof scopedSymbol === 'undefined') {
      return compilerLibraryOperationForGlobal(
        resolveCompilerLibrarySet(this.options.libraries),
        path,
        kind
      )
    }

    const symbol = scopedSymbol

    if (
      symbol.libraryId !== null &&
      typeof symbol.libraryId !== 'undefined' &&
      symbol.libraryBindingId !== null &&
      typeof symbol.libraryBindingId !== 'undefined'
    ) {
      let bindingId = symbol.libraryBindingId

      for (let index = 1; index < path.length; index = index + 1) {
        bindingId = `${bindingId}.${path[index]}`
      }

      return compilerLibraryOperationForBinding(
        resolveCompilerLibrarySet(this.options.libraries),
        symbol.libraryId,
        bindingId,
        kind
      )
    }

    if (symbol === null || symbol.kind !== 'import') {
      return null
    }

    const memberPath: string[] = []

    for (let index = 1; index < path.length; index = index + 1) {
      memberPath.push(path[index])
    }

    return compilerLibraryOperationForImport(
      resolveCompilerLibrarySet(this.options.libraries),
      symbol.importSource,
      symbol.importedName,
      memberPath,
      kind
    )
  }

  applyCompilerLibraryOperation(
    expression: AnyNode,
    operation: LibraryOperationDescriptor,
    variant: LibraryOperationVariantDescriptor | null = null
  ): void {
    const libraries = resolveCompilerLibrarySet(this.options.libraries)
    const capabilities = compilerLibraryCapabilities(
      libraries,
      operation.runtimeRequirements,
      this.options.libraryOptions
    )

    expression.libraryBindingId = operation.bindingId
    expression.libraryOperationId = operation.operationId
    expression.libraryRuntimeRequirements = operation.runtimeRequirements
    expression.libraryCapabilities = capabilities
    expression.libraryCExpression = variant?.cExpression ?? operation.cExpression ?? null
    const cArgumentKinds = variant?.cArgumentKinds ?? operation.cArgumentKinds

    if (cArgumentKinds !== null && typeof cArgumentKinds !== 'undefined') {
      expression.libraryCArgumentKinds = cArgumentKinds
    }

    const cArgumentAdapters = variant?.cArgumentAdapters ?? operation.cArgumentAdapters

    if (cArgumentAdapters !== null && typeof cArgumentAdapters !== 'undefined') {
      expression.libraryCArgumentAdapters = cArgumentAdapters
    }

    const cArgumentSources = variant?.cArgumentSources ?? operation.cArgumentSources

    if (cArgumentSources !== null && typeof cArgumentSources !== 'undefined') {
      expression.libraryCArgumentSources = cArgumentSources
    }

    expression.libraryCResultMode = variant?.cResultMode ?? operation.cResultMode ?? null
    expression.libraryCReceiverAdapter = variant?.cReceiverAdapter ?? operation.cReceiverAdapter ?? null
    expression.libraryCallbackLifetime = variant?.callbackLifetime ?? operation.callbackLifetime ?? null

    const resultTypeId = variant?.resultTypeId ?? operation.resultTypeId
    const cppType = variant?.cppType ?? operation.cppType
    const valueType = variant?.valueType ?? operation.valueType
    const nativeResultType = resultTypeId === null || typeof resultTypeId === 'undefined'
      ? null
      : compilerLibraryNativeTypeForId(libraries, resultTypeId)
    const resultShapeFields =
      variant?.resultShapeFields ?? operation.resultShapeFields ?? nativeResultType?.fields
    const resultCppType = valueType === 'promise' && nativeResultType !== null
      ? nativeResultType.cppType
      : cppType

    if (
      (resultShapeFields !== null && typeof resultShapeFields !== 'undefined') ||
      (resultTypeId !== null && typeof resultTypeId !== 'undefined')
    ) {
      const shapeFields: AnyNode[] = []
      const cResultShapeFields: string[] = []

      const fields = resultShapeFields ?? []

      for (let index = 0; index < fields.length; index = index + 1) {
        const field = fields[index]

        shapeFields.push(this.compilerLibraryResultShapeField(field, expression.loc))
        cResultShapeFields.push(field.name)
      }

      expression.shape = {
        kind: 'object',
        fields: shapeFields,
        libraryTypeId: resultTypeId ?? null,
        libraryCppType: resultCppType ?? null
      }
      expression.libraryCResultShapeFields = cResultShapeFields
    }
    expression.libraryCppType = cppType ?? null

    if (valueType !== null && typeof valueType !== 'undefined') {
      expression.valueType = valueType
    }

    expression.arrayElementType = variant?.resultArrayElementType ?? operation.resultArrayElementType ?? null
    const arrayElementTypeId = variant?.resultArrayElementTypeId ?? operation.resultArrayElementTypeId

    if (arrayElementTypeId !== null && typeof arrayElementTypeId !== 'undefined') {
      expression.arrayElementTypeId = arrayElementTypeId
      const nativeArrayElementType = compilerLibraryNativeTypeForId(libraries, arrayElementTypeId)

      if (nativeArrayElementType !== null && nativeArrayElementType.declarationNames.length > 0) {
        expression.arrayElementDeclaredType = nativeArrayElementType.declarationNames[0]
      }
    }

    expression.promiseValueType = variant?.promiseValueType ?? operation.promiseValueType ?? null
    expression.promiseRejectionValueType =
      variant?.promiseRejectionValueType ?? operation.promiseRejectionValueType ?? null

    expression.libraryOwned = (variant?.owned ?? operation.owned) === true
    expression.libraryConstantValue = operation.constantValue ?? null
    expression.libraryReceiverTypeId = operation.receiverTypeId ?? null
    expression.libraryResultTypeId = resultTypeId ?? null
    expression.libraryCCallStyle = operation.cCallStyle ?? null
    expression.libraryCFailureMode = operation.cFailureMode ?? null
    expression.nullable = (variant?.nullable ?? operation.nullable) === true
  }

  reportCompilerLibraryOperationDiagnostic(
    expression: AnyNode,
    operation: LibraryOperationDescriptor
  ): boolean {
    const diagnosticCode = operation.diagnosticCode
    const diagnosticMessage = operation.diagnosticMessage

    if (
      diagnosticCode === null ||
      typeof diagnosticCode === 'undefined' ||
      diagnosticMessage === null ||
      typeof diagnosticMessage === 'undefined'
    ) {
      return false
    }

    this.report(diagnosticCode, diagnosticMessage, expression.loc)
    expression.valueType = 'unknown'
    return true
  }

  compilerLibraryResultShapeField(
    field: LibraryResultShapeFieldDescriptor,
    loc: SourceLocation
  ): AnyNode {
    const result: AnyNode = {
      name: field.name,
      valueType: field.valueType,
      readonly: field.readonly,
      libraryCMember: field.cMember ?? null,
      libraryCppType: field.cppType ?? null,
      loc
    }
    const nestedFields = field.resultShapeFields
    const nestedTypeId = field.resultTypeId

    if (
      (nestedFields !== null && typeof nestedFields !== 'undefined') ||
      (nestedTypeId !== null && typeof nestedTypeId !== 'undefined')
    ) {
      const fields: AnyNode[] = []

      for (let index = 0; index < (nestedFields ?? []).length; index = index + 1) {
        fields.push(this.compilerLibraryResultShapeField((nestedFields ?? [])[index], loc))
      }

      result.shape = {
        kind: 'object',
        fields,
        libraryTypeId: nestedTypeId ?? null,
        libraryCppType: field.cppType ?? null
      }
    }

    return result
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

  resolveMemberPathRootSymbol(path: readonly string[] | null | undefined): SymbolInfo | null {
    if (path === null || typeof path === 'undefined' || path.length === 0) {
      return null
    }

    const root = firstPathSegment(path)
    const symbol = this.scope.resolve(root)

    if (symbol !== null && typeof symbol !== 'undefined') {
      return symbol
    }

    const builtin = builtinGlobalSymbol(root)

    if (builtin !== null) {
      return builtin
    }

    return this.compilerLibraryGlobalSymbol(root)
  }

  checkRuntimeBuiltinImport(statement: AnyNode): void {
    if (statement.typeOnly) {
      return
    }

    const libraryDeclaration = compilerLibraryHasModuleDeclaration(
      resolveCompilerLibrarySet(this.options.libraries),
      statement.source
    )

    if (
      !isStdlibModuleImportSource(statement.source) &&
      !isRelativeImportSource(statement.source) &&
      !libraryDeclaration
    ) {
      this.report(
        'INOX_UNSUPPORTED_IMPORT_SOURCE',
        `only relative imports are implemented, got ${statement.source}`,
        statement.loc
      )
      return
    }

    if (isUnsupportedRuntimeBuiltinImportSource(statement.source) && !libraryDeclaration) {
      const unsupportedMessage = unsupportedRuntimeBuiltinImportMessageFromKnownSource(statement.source)

      this.report('INOX_NOT_IMPLEMENTED', unsupportedMessage, statement.loc)
      return
    }

    if (libraryDeclaration && isUnsupportedRuntimeBuiltinImportSource(statement.source)) {
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
        this.declareArrowArrayBindingElements(param)
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

  checkCollectionMethodCall(expression: AnyNode): ValueType | null {
    if (expression.callee.type !== 'MemberExpression') {
      return null
    }

    const property = expression.callee.property
    const objectType = this.checkExpression(expression.callee.object)

    if (!isCollectionMethodCandidate(objectType, property)) {
      return null
    }

    return checkCollectionMethodCallInContext(
      this.collectionCallContext(),
      expression,
      property,
      this.checkedCollectionCallInfo(expression, objectType)
    )
  }

  checkedCollectionCallInfo(expression: AnyNode, objectType: ValueType): CheckedCollectionCallInfo {
    const args: CheckedCollectionArgInfo[] = []

    for (let index = 0; index < expression.args.length; index = index + 1) {
      args.push(this.checkedCollectionArgInfo(checkerNodeAt(expression.args, index)))
    }

    return {
      argCount: expression.args.length,
      args,
      mapType: objectType === 'map' ? this.resolveExpressionMapType(expression.callee.object) : null,
      objectType,
      setElementType:
        objectType === 'set'
          ? this.resolveExpressionSetElementType(expression.callee.object) ?? 'unknown'
          : 'unknown'
    }
  }

  checkedCollectionArgInfo(arg: AnyNode): CheckedCollectionArgInfo {
    return {
      loc: arg.loc,
      nullable: this.expressionCanBeNull(arg),
      valueType: this.checkExpression(arg)
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

    const method = expression.callee.property

    if (isSimpleArrayMethod(method)) {
      return checkSimpleArrayMethodCallInContext(
        this.arrayCallContext(),
        expression,
        method,
        this.checkedArrayCallInfo(expression, elementType)
      )
    }

    expression.valueType = 'array'

    if (method === 'sort') {
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

    if (method === 'reduce') {
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
        `array.${method} expects 1 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    if (method === 'filter') {
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

    if (method === 'find') {
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
      mappedType = this.checkArrayCallback(
        expression.args[0],
        [elementType, 'number'],
        null,
        [elementDeclaredType, 'number']
      )
    }

    expression.arrayElementType = mappedType
    expression.arrayElementDeclaredType = mappedType

    for (let index = 1; index < expression.args.length; index++) {
      this.checkExpression(expression.args[index])
    }

    return 'array'
  }

  checkedArrayCallInfo(expression: AnyNode, elementType: ValueType): CheckedArrayCallInfo {
    const args: CheckedArrayArgInfo[] = []

    for (let index = 0; index < expression.args.length; index = index + 1) {
      args.push(this.checkedArrayArgInfo(checkerNodeAt(expression.args, index)))
    }

    return {
      argCount: expression.args.length,
      args,
      elementType
    }
  }

  checkedArrayArgInfo(arg: AnyNode): CheckedArrayArgInfo {
    return {
      loc: arg.loc,
      nullable: this.expressionCanBeNull(arg),
      valueType: this.checkExpression(arg)
    }
  }

  isBooleanReference(expression: AnyNode): boolean {
    return (
      expression.type === 'Reference' && expression.path.length === 1 && firstPathSegment(expression.path) === 'Boolean'
    )
  }

  checkArrayCallback(
    expression: AnyNode,
    params: ValueType[],
    returnType: ValueType | null,
    paramDeclaredTypes: string[] = []
  ): ValueType {
    if (expression.type !== 'ArrowFunctionExpression') {
      const callbackType = this.checkExpression(expression)

      this.checkAssignableType(callbackType, 'function', expression.loc, false, false)

      const functionType = expression.functionType

      if (
        functionType !== null &&
        typeof functionType !== 'undefined' &&
        functionType.returnType !== null &&
        typeof functionType.returnType !== 'undefined'
      ) {
        if (returnType !== null) {
          this.checkAssignableType(
            functionType.returnType,
            returnType,
            expression.loc,
            false,
            functionType.returnNullable === true
          )
        }

        return functionType.returnType
      }

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
        let declaredType: string = param.valueType

        if (actual === 'unknown') {
          actual = expected

          if (index < paramDeclaredTypes.length) {
            const candidateDeclaredType = paramDeclaredTypes[index]

            if (candidateDeclaredType !== null && typeof candidateDeclaredType !== 'undefined') {
              declaredType = candidateDeclaredType
            }
          } else {
            declaredType = actual
          }
        }

        if (param.valueType !== 'unknown') {
          this.checkAssignableType(expected, param.valueType, param.loc, false, false)
        }

        const paramInfo = this.resolveDeclaredType(declaredType, param.loc)

        param.declaredType = declaredType

        param.valueType = actual
        param.nullable = false
        param.arrayElementType = paramInfo.arrayElementType
        param.arrayElementDeclaredType = paramInfo.arrayElementDeclaredType
        param.mapKeyType = paramInfo.mapKeyType
        param.mapValueType = paramInfo.mapValueType
        param.promiseValueType = paramInfo.promiseValueType
        param.setElementType = paramInfo.setElementType
        param.functionType = paramInfo.functionType
        param.shape = paramInfo.shape

        this.declare(
          param.name,
          {
            kind: 'param',
            mutable: true,
            valueType: actual,
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
        this.declareArrowArrayBindingElements(param)
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

  declareArrowArrayBindingElements(param: AnyNode): void {
    const bindingElements: ArrayBindingElement[] = param.bindingElements ?? []

    if (bindingElements.length === 0) {
      return
    }

    if (param.valueType !== 'array' && param.valueType !== 'unknown') {
      this.checkAssignableType(param.valueType, 'array', param.loc, false, false)
      return
    }

    const elementDeclaredType =
      param.arrayElementDeclaredType ??
      param.arrayElementType ??
      'unknown'
    const elementInfo = this.resolveDeclaredType(elementDeclaredType, param.loc)

    for (let index = 0; index < bindingElements.length; index = index + 1) {
      const binding = bindingElements[index]

      binding.declaredType = elementDeclaredType
      binding.valueType = elementInfo.valueType
      binding.nullable = elementInfo.nullable
      binding.arrayElementType = elementInfo.arrayElementType
      binding.arrayElementDeclaredType = elementInfo.arrayElementDeclaredType
      binding.mapKeyType = elementInfo.mapKeyType
      binding.mapValueType = elementInfo.mapValueType
      binding.mapValueShape = elementInfo.mapValueShape
      binding.promiseValueType = elementInfo.promiseValueType
      binding.setElementType = elementInfo.setElementType
      binding.functionType = elementInfo.functionType
      binding.shape = elementInfo.shape

      this.declare(
        binding.name,
        {
          kind: 'param',
          mutable: true,
          valueType: elementInfo.valueType,
          nullable: elementInfo.nullable,
          arrayElementType: elementInfo.arrayElementType,
          arrayElementDeclaredType: elementInfo.arrayElementDeclaredType,
          mapKeyType: elementInfo.mapKeyType,
          mapValueType: elementInfo.mapValueType,
          mapValueShape: elementInfo.mapValueShape,
          promiseValueType: elementInfo.promiseValueType,
          setElementType: elementInfo.setElementType,
          functionType: elementInfo.functionType,
          shape: elementInfo.shape,
          loc: binding.loc
        },
        binding.loc
      )
    }
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
      argInfos.push(this.checkedCallArgInfo(arg))
    }

    return argInfos
  }

  checkedCallArgInfo(argument: AnyNode, knownValueType?: ValueType): CheckedCallArgInfo {
    const valueType = knownValueType ?? this.checkExpression(argument)

    return {
      valueType,
      nullable: this.expressionCanBeNull(argument),
      loc: argument.loc,
      arrayElementType: this.resolveExpressionArrayElementType(argument),
      shape: this.resolveExpressionShape(argument)
    }
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
    const argInfos: CheckedCallArgInfo[] = []

    for (let index = 0; index < expression.args.length; index = index + 1) {
      const arg = checkerNodeAt(expression.args, index)
      const argType = this.checkExpression(arg)

      argTypes.push(argType)
      argInfos.push(this.checkedCallArgInfo(arg, argType))
    }

    const libraryConstructorType = this.checkCompilerLibraryConstructOperation(expression, argInfos)

    if (libraryConstructorType !== null) {
      return libraryConstructorType
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

    const declarationConstructor = this.constructorCallableSymbol(symbol)

    if (declarationConstructor !== null) {
      applyCallableSymbolCallInContext(
        this.callableSymbolContext(),
        expression,
        declarationConstructor,
        argInfos
      )
      expression.className = constructorName
      expression.shape = symbol.shape ?? expression.shape ?? null
      return 'object'
    }

    if (symbol.constructable) {
      this.checkImportedClassConstructorArguments(expression, symbol.constructorParams)
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

  checkCompilerLibraryConstructOperation(
    expression: AnyNode,
    argInfos: CheckedCallArgInfo[]
  ): ValueType | null {
    const operation = this.compilerLibraryOperationForExpression(expression.callee, 'construct')

    if (operation === null) {
      return null
    }

    const declaredSymbol = this.compilerLibraryDeclarationConstructorSymbol(expression.callee)
    const variant = this.compilerLibraryOperationVariant(expression, operation)

    this.applyCompilerLibraryOperation(expression, operation, variant)

    if (this.reportCompilerLibraryOperationDiagnostic(expression, operation)) {
      return 'unknown'
    }

    const checkedArgInfos = this.checkCompilerLibraryOperationArguments(
      expression,
      operation,
      variant,
      argInfos
    )

    let declaredType: ValueType | null = null

    if (declaredSymbol !== null) {
      declaredType = applyCallableSymbolCallInContext(
        this.callableSymbolContext(),
        expression,
        declaredSymbol,
        checkedArgInfos
      )
      this.applyCompilerLibraryOperation(expression, operation, variant)
    }

    this.checkCompilerLibraryBackendConstraints(expression, operation)

    return (variant?.valueType ?? declaredType ?? operation.valueType ?? 'object') as ValueType
  }

  checkImportedClassConstructorArguments(
    expression: AnyNode,
    rawParams: AnyNode[] | null | undefined
  ): void {
    const params = rawParams ?? []
    let minimum = params.length

    for (let index = params.length - 1; index >= 0; index = index - 1) {
      if (params[index].optional === true) {
        minimum = index
      } else {
        break
      }
    }

    if (expression.args.length < minimum || expression.args.length > params.length) {
      this.report(
        'INOX_ARG_COUNT',
        `class constructor expects ${minimum} to ${params.length} argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }
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
      if (node.expressionBody === true) {
        this.collectPromiseExecutorValueTypesFromNode(node.body, resolveName, types)
      } else {
        this.collectPromiseExecutorValueTypesFromList(node.body, resolveName, types)
      }
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

  checkArrowFunctionExpression(
    expression: AnyNode,
    functionType?: AnyNode | null,
    asyncDiagnosticCode?: string | null,
    asyncDiagnosticMessage?: string | null
  ): void {
    if (expression.async === true) {
      this.report(
        asyncDiagnosticCode ?? 'INOX_ASYNC_CALLBACK',
        asyncDiagnosticMessage ??
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
        this.declareArrowArrayBindingElements(param)
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
    const spreadShapes: ObjectShapeInfo[] = []
    let hasExplicitProperty = false

    for (const property of expression.properties) {
      if (property.spread === true) {
        if (hasExplicitProperty) {
          this.report(
            'INOX_NOT_IMPLEMENTED',
            'object spread after an explicit property is not supported by the current C backend slice',
            property.loc
          )
        }

        const spreadShape = this.checkPlainObjectSpreadProperty(property)

        if (spreadShape !== null && typeof spreadShape !== 'undefined') {
          spreadShapes.push(spreadShape)
        }

        continue
      }

      hasExplicitProperty = true
      properties.set(property.key, property)
    }

    for (const field of shape.fields) {
      const property = properties.get(field.name)

      if (property === null || typeof property === 'undefined') {
        const spreadField = this.findObjectSpreadShapeField(spreadShapes, field.name)

        if (spreadField !== null && typeof spreadField !== 'undefined') {
          const spreadFieldType = this.resolveFieldDeclaredType(spreadField)
          const fieldType = this.resolveFieldDeclaredType(field)

          this.checkAssignableType(
            spreadFieldType.valueType,
            fieldType.valueType,
            expression.loc,
            field.nullable === true,
            spreadField.nullable === true
          )
        } else if (field.optional !== true) {
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
      if (property.spread === true) {
        continue
      }

      if (shape.dynamic !== true && !this.findShapeField(shape, property.key)) {
        this.report('INOX_UNKNOWN_FIELD', `unknown field ${property.key}`, property.loc)
      }
    }
  }

  findObjectSpreadShapeField(shapes: ObjectShapeInfo[], name: string): AnyNode | null {
    for (let index = shapes.length - 1; index >= 0; index = index - 1) {
      const field = this.findShapeField(shapes[index], name)

      if (field !== null && typeof field !== 'undefined') {
        return field
      }
    }

    return null
  }

  checkPlainObjectSpreadProperty(property: AnyNode): ObjectShapeInfo | null {
    const spreadType = this.checkExpression(property.value)

    this.checkAssignableType(spreadType, 'object', property.loc, false, this.expressionCanBeNull(property.value))
    const spreadShape = this.resolveExpressionShape(property.value)

    if (
      spreadShape === null ||
      typeof spreadShape === 'undefined' ||
      spreadShape.dynamic === true
    ) {
      this.report(
        'INOX_NOT_IMPLEMENTED',
        'object spread requires a plain object with a compiler-known fixed shape',
        property.loc
      )
      return null
    }

    for (const field of spreadShape.fields) {
      const fieldType = this.resolveFieldDeclaredType(field)

      if (fieldType.valueType === 'function') {
        this.report(
          'INOX_NOT_IMPLEMENTED',
          'object spread of function fields is not supported by the current C backend slice',
          property.loc
        )
        return null
      }
    }

    return spreadShape
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
    const functionOverloads: FunctionTypeMetadata[] = callee.functionOverloads ?? []

    if (functionOverloads.length > 0) {
      const overloads: SymbolInfo[] = []

      for (const functionType of functionOverloads) {
        overloads.push(this.callableSymbolFromFunctionType(functionType, callee.loc))
      }

      const symbol = overloads[0]
      symbol.overloads = overloads
      return symbol
    }

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
    const fields: AnyNode[] = []
    let hasExplicitProperty = false

    for (const property of expression.properties) {
      if (property.spread === true) {
        if (hasExplicitProperty) {
          this.report(
            'INOX_NOT_IMPLEMENTED',
            'object spread after an explicit property is not supported by the current C backend slice',
            property.loc
          )
        }

        const spreadShape = this.checkPlainObjectSpreadProperty(property)

        if (spreadShape !== null && typeof spreadShape !== 'undefined') {
          for (const field of spreadShape.fields) {
            this.setObjectLiteralShapeField(fields, field)
          }
        }

        continue
      }

      hasExplicitProperty = true

      if (keys.has(property.key)) {
        this.report('INOX_DUPLICATE_OBJECT_KEY', `duplicate object property ${property.key}`, property.loc)
      }

      keys.add(property.key)
      const valueType = this.checkExpression(property.value)

      this.setObjectLiteralShapeField(fields, {
        name: property.key,
        readonly: false,
        valueType,
        nullable: this.expressionCanBeNull(property.value),
        arrayElementType: this.resolveExpressionArrayElementType(property.value),
        arrayElementDeclaredType: this.resolveExpressionArrayElementDeclaredType(property.value),
        mapKeyType: property.value.mapKeyType ?? null,
        mapValueType: property.value.mapValueType ?? null,
        promiseValueType: this.resolveExpressionPromiseValueType(property.value),
        setElementType: this.resolveExpressionSetElementType(property.value),
        functionType: property.value.functionType ?? null,
        shape: this.resolveExpressionShape(property.value),
        loc: property.loc
      })
    }

    expression.shape = {
      kind: 'object',
      fields
    }
  }

  setObjectLiteralShapeField(fields: AnyNode[], field: AnyNode): void {
    for (let index = 0; index < fields.length; index = index + 1) {
      if (fields[index].name === field.name) {
        fields[index] = field
        return
      }
    }

    fields.push(field)
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
    const iterableMapType = iterableType === 'map' ? this.resolveExpressionMapType(statement.iterable) : null

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

    let iteratedArrayType: ResolvedTypeInfo | null = null

    if (elementType === 'array' && isArrayTypeName(elementDeclaredType)) {
      iteratedArrayType = this.resolveDeclaredType(elementDeclaredType, statement.nameLoc)
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
    statement.arrayElementType = iteratedArrayType?.arrayElementType ?? null
    statement.arrayElementDeclaredType = iteratedArrayType?.arrayElementDeclaredType ?? null
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

    this.checkForOfBindingElements(
      statement,
      elementType,
      declared ?? iteratedArrayType,
      iterableMapType
    )

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

    const bindingElements: ArrayBindingElement[] = statement.bindingElements ?? []

    for (const binding of bindingElements) {
      this.declare(
        binding.name,
        {
          kind: statement.kind,
          mutable: statement.kind === 'let',
          valueType: binding.valueType ?? 'unknown',
          nullable: binding.nullable === true,
          arrayElementType: binding.arrayElementType ?? null,
          arrayElementDeclaredType: binding.arrayElementDeclaredType ?? null,
          mapKeyType: binding.mapKeyType ?? null,
          mapValueType: binding.mapValueType ?? null,
          setElementType: binding.setElementType ?? null,
          functionType: binding.functionType ?? null,
          shape: binding.shape ?? null,
          loc: binding.loc
        },
        binding.loc
      )
    }

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

  checkForOfBindingElements(
    statement: AnyNode,
    elementType: ValueType,
    iteratedArrayType: ResolvedTypeInfo | null,
    iterableMapType: CheckerMapType | null
  ): void {
    const bindingElements: ArrayBindingElement[] | null = statement.bindingElements ?? null

    if (bindingElements === null) {
      return
    }

    if (elementType !== 'array' && iterableMapType === null) {
      this.report(
        'INOX_TYPE_MISMATCH',
        `array binding pattern requires an array element, got ${elementType}`,
        statement.nameLoc
      )
    }

    for (const binding of bindingElements) {
      let declaredType = 'unknown'

      if (iterableMapType !== null) {
        if (binding.index === 0) {
          declaredType = iterableMapType.key ?? 'unknown'
        } else if (binding.index === 1) {
          declaredType = iterableMapType.value ?? 'unknown'
        }
      } else if (
        iteratedArrayType !== null &&
        typeof iteratedArrayType !== 'undefined' &&
        iteratedArrayType.arrayElementDeclaredType !== null &&
        typeof iteratedArrayType.arrayElementDeclaredType !== 'undefined'
      ) {
        declaredType = iteratedArrayType.arrayElementDeclaredType
      } else if (
        iteratedArrayType !== null &&
        typeof iteratedArrayType !== 'undefined' &&
        iteratedArrayType.arrayElementType !== null &&
        typeof iteratedArrayType.arrayElementType !== 'undefined'
      ) {
        declaredType = iteratedArrayType.arrayElementType
      }

      const resolved = this.resolveDeclaredType(declaredType, binding.loc)

      binding.declaredType = declaredType
      binding.valueType = resolved.valueType
      binding.nullable = resolved.nullable
      binding.arrayElementType = resolved.arrayElementType
      binding.arrayElementDeclaredType = resolved.arrayElementDeclaredType
      binding.mapKeyType = resolved.mapKeyType
      binding.mapValueType = resolved.mapValueType
      binding.setElementType = resolved.setElementType
      binding.functionType = resolved.functionType
      binding.shape = resolved.shape
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

    if (expression.type === 'Reference' && expression.path.length === 1) {
      const symbol = this.scope.resolve(firstPathSegment(expression.path))

      if (symbol !== null && typeof symbol !== 'undefined') {
        const trueNames = symbol.narrowingTrueNames ?? []
        const falseNames = symbol.narrowingFalseNames ?? []

        if (trueNames.length > 0 || falseNames.length > 0) {
          return {
            trueNames,
            falseNames
          }
        }
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

    const typeofNarrowing = this.resolveTypeofNarrowing(expression)

    if (typeofNarrowing !== null) {
      return typeofNarrowing
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

  nullableAliasNarrowingIsStable(narrowing: NullableConditionNarrowing): boolean {
    const names: string[] = []

    for (let index = 0; index < narrowing.trueNames.length; index = index + 1) {
      names.push(narrowing.trueNames[index])
    }

    for (let index = 0; index < narrowing.falseNames.length; index = index + 1) {
      names.push(narrowing.falseNames[index])
    }

    if (names.length === 0) {
      return false
    }

    for (let index = 0; index < names.length; index = index + 1) {
      const name = names[index]

      if (name.includes('.')) {
        return false
      }

      const symbol = this.scope.resolve(name)

      if (symbol === null || typeof symbol === 'undefined' || symbol.mutable === true) {
        return false
      }
    }

    return true
  }

  resolveTypeofNarrowing(expression: AnyNode): NullableConditionNarrowing | null {
    if (expression.operator !== '===' && expression.operator !== '!==') {
      return null
    }

    let typeofExpression = expression.left
    let typeName = expression.right

    if (expression.right.type === 'UnaryExpression' && expression.right.operator === 'typeof') {
      typeofExpression = expression.right
      typeName = expression.left
    }

    if (
      typeofExpression.type !== 'UnaryExpression' ||
      typeofExpression.operator !== 'typeof' ||
      typeName.type !== 'StringLiteral' ||
      !isNonNullableTypeofName(typeName.value)
    ) {
      return null
    }

    let names = optionalChainNarrowingKeys(typeofExpression.argument)

    if (names.length === 0) {
      const key = nullableNarrowingKey(typeofExpression.argument)

      if (key !== null) {
        names = [key]
      }
    }

    if (names.length === 0) {
      return null
    }

    if (expression.operator === '===') {
      return {
        trueNames: names,
        falseNames: []
      }
    }

    return {
      trueNames: [],
      falseNames: names
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
      symbol = this.compilerLibraryGlobalSymbol(root, reference.loc)
    }

    if (symbol === null || typeof symbol === 'undefined') {
      this.report('INOX_UNKNOWN_NAME', `unknown name ${root}`, reference.loc)
      return null
    }

    return symbol
  }

  compilerLibraryGlobalSymbol(name: string, loc?: SourceLocation): SymbolInfo | null {
    const operation = compilerLibraryOperationForGlobal(
      resolveCompilerLibrarySet(this.options.libraries),
      [name],
      'member-read'
    )

    if (operation === null) {
      return null
    }

    const fields = operation.resultShapeFields ?? []
    const shapeFields: AnyNode[] = []
    const fieldLoc = loc ?? { line: 1, column: 1 }

    for (let index = 0; index < fields.length; index = index + 1) {
      shapeFields.push(this.compilerLibraryResultShapeField(fields[index], fieldLoc))
    }

    const symbol: SymbolInfo = {
      kind: 'global',
      mutable: false,
      valueType: (operation.valueType ?? 'unknown') as ValueType,
      nullable: operation.nullable === true,
      arrayElementType: (operation.resultArrayElementType ?? null) as ValueType | null
    }

    if (fields.length > 0 || operation.resultTypeId !== null && typeof operation.resultTypeId !== 'undefined') {
      symbol.shape = {
        kind: 'object',
        fields: shapeFields,
        libraryTypeId: operation.resultTypeId ?? null,
        libraryCppType: operation.cppType ?? null
      }
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
      libraries: resolveCompilerLibrarySet(this.options.libraries),
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

  fetchCallContext(): FetchCallCheckerContext {
    return {
      diagnostics: this.diagnostics
    }
  }

  collectionCallContext(): CollectionCallCheckerContext {
    return {
      diagnostics: this.diagnostics
    }
  }

  arrayCallContext(): ArrayCallCheckerContext {
    return {
      diagnostics: this.diagnostics
    }
  }

  timeCallContext(): TimeCallCheckerContext {
    return {
      diagnostics: this.diagnostics
    }
  }

  declareTypeAlias(item: TypeAliasDeclarationNode): void {
    if (this.ambientTypeNames.has(item.name) && !this.localTypeNames.has(item.name)) {
      this.types.delete(item.name)
      this.resolvedDeclaredTypes.delete(item.name)
    }

    declareTypeAliasInContext(this.declaredTypeContext(), item)
    this.localTypeNames.add(item.name)
  }

  resolveDeclaredType(name: string | null | undefined, loc: SourceLocation): ResolvedTypeInfo {
    return resolveDeclaredTypeInContext(this.declaredTypeContext(), name, loc)
  }

  resolveFunctionDeclarationReturnType(item: AnyNode): ResolvedTypeInfo {
    const resolved = this.resolveDeclaredType(item.returnType, item.loc)

    if (item.returnShape !== null && typeof item.returnShape !== 'undefined') {
      resolved.valueType = 'object'
      resolved.shape = this.resolveObjectShape(item.returnShape)
    }

    return resolved
  }

  pushFunctionTypeParameters(item: AnyNode): CheckerTypeParameterState[] {
    const state: CheckerTypeParameterState[] = []
    const typeParameters: AnyNode[] = item.typeParameters ?? []

    for (let index = 0; index < typeParameters.length; index = index + 1) {
      const typeParameter = checkerNodeAt(typeParameters, index)
      const name: string = typeParameter.name
      const previousType = this.types.get(name) ?? null
      const previousResolvedType = this.resolvedDeclaredTypes.get(name) ?? null
      let constraint = 'unknown'

      if (typeof typeParameter.constraint === 'string' && typeParameter.constraint.length > 0) {
        constraint = typeParameter.constraint
      }

      state.push({ name, previousType, previousResolvedType })
      this.types.set(name, { kind: 'alias', valueType: constraint })
      this.resolvedDeclaredTypes.delete(name)
    }

    return state
  }

  restoreFunctionTypeParameters(state: CheckerTypeParameterState[]): void {
    for (let index = state.length - 1; index >= 0; index = index - 1) {
      const item = state[index]

      if (item.previousType !== null) {
        this.types.set(item.name, item.previousType)
      } else {
        this.types.delete(item.name)
      }

      if (item.previousResolvedType !== null) {
        this.resolvedDeclaredTypes.set(item.name, item.previousResolvedType)
      } else {
        this.resolvedDeclaredTypes.delete(item.name)
      }
    }
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
    returnPromiseValueType: ValueType | null,
    returnShape: ObjectShapeInfo | null = null
  ): CheckerReturnContextState {
    const previous = {
      returnType: this.currentReturnType,
      returnNullable: this.currentReturnNullable,
      returnPromiseValueType: this.currentReturnPromiseValueType,
      returnShape: this.currentReturnShape,
      returnAsync: this.currentReturnAsync
    }

    this.currentReturnType = returnType
    this.currentReturnNullable = returnNullable
    this.currentReturnPromiseValueType = returnPromiseValueType
    this.currentReturnShape = returnShape
    this.currentReturnAsync = false

    return previous
  }

  restoreReturnContext(previous: CheckerReturnContextState): void {
    this.currentReturnType = previous.returnType
    this.currentReturnNullable = previous.returnNullable
    this.currentReturnPromiseValueType = previous.returnPromiseValueType
    this.currentReturnShape = previous.returnShape
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

  checkAssignableLibraryNativeType(
    actualShape: ObjectShapeInfo | null | undefined,
    expectedShape: ObjectShapeInfo | null | undefined,
    loc: SourceLocation
  ): void {
    const expectedTypeId = expectedShape?.libraryTypeId

    if (expectedTypeId === null || typeof expectedTypeId === 'undefined') {
      return
    }

    const actualTypeId = actualShape?.libraryTypeId

    if (
      compilerLibraryNativeTypeIsAssignable(
        resolveCompilerLibrarySet(this.options.libraries),
        actualTypeId,
        expectedTypeId
      )
    ) {
      return
    }

    this.report(
      'INOX_TYPE_MISMATCH',
      `cannot assign library type ${actualTypeId ?? 'unknown'} to ${expectedTypeId}`,
      loc
    )
  }

  report(code: string, message: string, loc: SourceLocation): void {
    const item = diagnostic(code, message, loc)
    const diagnostics = this.diagnostics
    diagnostics.push(item)
  }
}

function isNonNullableTypeofName(value: string): boolean {
  return value === 'string' || value === 'number' || value === 'boolean' || value === 'function'
}

function optionalChainNarrowingKeys(expression: AnyNode): string[] {
  if (!containsOptionalMemberExpression(expression)) {
    return []
  }

  const names: string[] = []
  appendMemberNarrowingKeys(expression, names)
  return uniqueNames(names)
}

function containsOptionalMemberExpression(expression: AnyNode): boolean {
  if (expression.type === 'OptionalMemberExpression') {
    return true
  }

  if (expression.type === 'MemberExpression') {
    return containsOptionalMemberExpression(expression.object)
  }

  return false
}

function appendMemberNarrowingKeys(expression: AnyNode, names: string[]): void {
  const path = optionalChainMemberPath(expression)

  if (path.length > 0) {
    names.push(path.join('.'))
  }

  if (expression.type === 'MemberExpression' || expression.type === 'OptionalMemberExpression') {
    appendMemberNarrowingKeys(expression.object, names)
  }
}

function optionalChainMemberPath(expression: AnyNode): string[] {
  if (expression.type === 'Reference') {
    return expression.path
  }

  if (expression.type !== 'MemberExpression' && expression.type !== 'OptionalMemberExpression') {
    return []
  }

  const path = optionalChainMemberPath(expression.object)

  if (path.length === 0) {
    return []
  }

  return [...path, expression.property]
}
