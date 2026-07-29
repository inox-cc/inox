import {
  commonValueType,
  inferBinaryExpressionType,
  isAssignableType,
  isEqualityComparableType,
  isEqualityOperator,
  isMatchingSwitchCaseType,
  isSwitchableType
} from './checker/assignability.ts'
import { applyCallableSymbolCall as applyCallableSymbolCallInContext } from './checker/callable-symbols.ts'
import type { CallableSymbolCheckerContext } from './checker/callable-symbols.ts'
import { diagnostic, throwDiagnostics } from './diagnostics.ts'
import { parseTemplateLiteralParts, parseTemplatePlaceholderExpression } from './template-literals.ts'
import {
  compilerLibraryHasModuleDeclaration,
  compilerLibraryIntrinsicRoleForBinding,
  compilerLibraryNativeTypeForIntrinsic,
  compilerLibraryNativeTypeForId,
  compilerLibraryNativeTypeIsAssignable,
  compilerLibraryOperationForIntrinsic,
  compilerLibraryOperationForBinding,
  compilerLibraryOperationForImport,
  compilerLibraryOperationForReceiver,
  compilerLibraryPrimitiveReceiverTypeId,
  resolveCompilerLibrarySet
} from './extensions/library-set.ts'
import {
  commonTypeRef,
  refineTypeRefUnknowns,
  typeRefCompatibilityMetadata,
  typeRefDeclaredName,
  typeRefIterableElementDeclaredName,
  typeRefIterableElementValueType,
  typeRefTraitArgument,
  typeRefsEquivalent,
  typeRefTraits
} from './extensions/type-ref-compatibility.ts'
import {
  instantiateLibraryOperationTypeRef,
  type LibraryOperationTypeRefContext
} from './extensions/operation-type-refs.ts'
import { instantiateNativeTypeRef, substituteTypeRef } from './extensions/type-ref-substitution.ts'
import type { TypeRefSubstitution } from './extensions/type-ref-substitution.ts'
import {
  parseCompilerLibraryGlobalDeclarations,
  type ParsedCompilerLibraryGlobalDeclaration
} from './extensions/global-declarations.ts'
import {
  compilerLibraryCapabilities,
  compilerLibraryOptionScalarsEqual,
  resolveCompilerLibraryOptionValue
} from './extensions/library-options.ts'
import type {
  ConcreteTypeRef,
  CompilerLibrarySet,
  CompilerLibraryLiteralTypeInference,
  IntrinsicRole,
  LibraryArgumentNarrowingDescriptor,
  LibraryCResultMappingDescriptor,
  LibraryOperationDescriptor,
  LibraryOperationKind,
  LibraryArgumentCheckDescriptor,
  LibraryObjectMethodCheckDescriptor,
  LibraryObjectLiteralFieldDescriptor,
  LibraryOptionConstraintDescriptor,
  LibraryOperationVariantDescriptor,
  LibraryResultInferenceDescriptor,
  LibraryResultShapeFieldDescriptor,
  TypeRef
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
  typeRefFromResolvedType as typeRefFromResolvedTypeInContext,
  typeAliasInfoFromDeclaration,
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
  createArrowFunctionTypeMetadata,
  knownCheckedExpressionType,
  resolveExpressionAsyncResultRejectionIntrinsicRole
} from './checker/expression-helpers.ts'
import type { CheckedCallArgInfo } from './checker/global-calls.ts'
import {
  applyTypeRefMetadataToExpression,
  findExplicitShapeField as findExplicitShapeFieldInContext,
  findShapeField as findShapeFieldInContext,
  resolveExpressionShapeField as resolveExpressionShapeFieldInContext,
  resolveArrayElementObjectShape as resolveArrayElementObjectShapeInContext,
  resolveArrayIterableElementShape as resolveArrayIterableElementShapeInContext,
  resolveExpressionIterableElementDeclaredName as resolveExpressionIterableElementDeclaredNameInContext,
  resolveExpressionIterableElementFunctionType as resolveExpressionIterableElementFunctionTypeInContext,
  resolveExpressionArrayElementType as resolveExpressionArrayElementTypeInContext,
  resolveExpressionShape as resolveExpressionShapeInContext,
  resolveExpressionAsyncResultValueType as resolveExpressionAsyncResultValueTypeInContext,
  resolveRejectedExpressionValueType as resolveRejectedExpressionValueTypeInContext
} from './checker/expression-metadata.ts'
import {
  acceptsArgumentCount,
  argumentCountMessage,
  argumentParamValueType,
  findClassConstructorMethod,
  intersectNames,
  isConditionValueType,
  isNonNullNarrowingLiteral,
  isRelativeImportSource,
  isRuntimeNullableType,
  isStatementExpressionNode,
  mergeShapeFields,
  paramForArgument,
  statementAlwaysExits,
  uniqueNames
} from './checker/helpers.ts'
import { ownershipCycleDiagnostics } from './checker/ownership.ts'
import { memberExpressionPath } from './member-paths.ts'
import {
  isBuiltinValueType,
  isNullableTypeName,
  nullableTypeNameFromKnownTypeName,
  unionTypeNamesFromTypeName
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
  anyNodeObjectShape,
  checkerNodeAt,
  cloneObjectShapeField,
  cloneStringSet,
  commonResolvedObjectShape,
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
  resolvedValueTypeMetadata
} from './checker/resolved-types.ts'
import type {
  CheckProgramResult,
  CheckerNode,
  CheckerObjectPropertyNode,
  FunctionTypeMetadata,
  FunctionTypeParamMetadata,
  NullableConditionNarrowing,
  ObjectShapeBases,
  OptionalParamInfo,
  ResolvedTypeInfo,
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
  narrowedTypeRefs: Map<string, TypeRef>
  narrowedValueTypes: Map<string, ValueType>
}

type CheckerTypeParameterState = {
  name: string
  previousType: TypeAliasInfo | null
  previousResolvedType: ResolvedTypeInfo | null
}

type CheckerNarrowingState = {
  narrowedNullableNames: Set<string>
  narrowedTypeRefs: Map<string, TypeRef>
  narrowedValueTypes: Map<string, ValueType>
}

type CheckerValueTypeNarrowing = {
  name: string
  typeRef: TypeRef | null
  valueType: ValueType
}

type CheckerValueTypeConditionNarrowing = {
  trueTypes: CheckerValueTypeNarrowing[]
  falseTypes: CheckerValueTypeNarrowing[]
}

type CheckerObjectUnionAlternative = {
  name: string
  shape: ObjectShapeInfo
}

const maxObjectSpreadUnionBranches = 256

function commonExpressionTypeRef(left: AnyNode, right: AnyNode): TypeRef | null {
  const leftTypeRef: TypeRef | null = left.typeRef ?? null
  const rightTypeRef: TypeRef | null = right.typeRef ?? null

  if (
    leftTypeRef === null &&
    left.type !== 'NullLiteral' &&
    nodeValueTypeOrUnknown(left) !== 'null' &&
    left.nullable !== true
  ) {
    return null
  }

  if (
    rightTypeRef === null &&
    right.type !== 'NullLiteral' &&
    nodeValueTypeOrUnknown(right) !== 'null' &&
    right.nullable !== true
  ) {
    return null
  }

  return commonTypeRef(leftTypeRef, rightTypeRef)
}

function mergeCheckerValueTypeNarrowings(
  left: CheckerValueTypeNarrowing[],
  right: CheckerValueTypeNarrowing[]
): CheckerValueTypeNarrowing[] {
  const result: CheckerValueTypeNarrowing[] = []

  for (const narrowing of left) {
    result.push(narrowing)
  }

  for (const narrowing of right) {
    let found = false

    for (const existing of result) {
      if (existing.name === narrowing.name) {
        found = true
        break
      }
    }

    if (!found) {
      result.push(narrowing)
    }
  }

  return result
}

function intersectCheckerValueTypeNarrowings(
  left: CheckerValueTypeNarrowing[],
  right: CheckerValueTypeNarrowing[]
): CheckerValueTypeNarrowing[] {
  const result: CheckerValueTypeNarrowing[] = []

  for (const narrowing of left) {
    for (const candidate of right) {
      if (
        candidate.name === narrowing.name &&
        candidate.valueType === narrowing.valueType &&
        checkerNarrowingTypeRefsEquivalent(candidate.typeRef, narrowing.typeRef)
      ) {
        result.push(narrowing)
        break
      }
    }
  }

  return result
}

function checkerNarrowingTypeRefsEquivalent(left: TypeRef | null, right: TypeRef | null): boolean {
  if (left === null || right === null) {
    return left === right
  }

  return typeRefsEquivalent(left, right)
}

type CheckerReturnContextState = {
  returnType: ValueType
  returnNullable: boolean
  returnAsyncResultValueType: ValueType | null
  returnShape: ObjectShapeInfo | null
  returnAsync: boolean
}

type CheckerLoopDepthState = {
  breakDepth: number
  continueDepth: number
}

type InferredFunctionReturnCandidate = ResolvedTypeInfo

export function checkProgram(
  program: ProgramNode,
  options: CompileOptions = {},
  libraryLiteralTypeInference: CompilerLibraryLiteralTypeInference | null = null
): CheckProgramResult {
  const checker = new Checker(program, options, libraryLiteralTypeInference)
  checker.check()

  return {
    ast: program
  }
}

function importSpecifierValueType(specifier: AnyNode, _source: string): ValueType {
  const valueType = specifier.valueType

  if (typeof valueType !== 'string') {
    return 'unknown'
  }

  if (valueType === '') {
    return 'unknown'
  }

  return valueType.slice(0)
}

class Checker {
  program: ProgramNode
  options: CompileOptions
  diagnostics: Diagnostic[]
  missingIntrinsicProviderExpressions: Set<AnyNode>
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
  currentReturnAsyncResultValueType: ValueType | null
  currentReturnShape: ObjectShapeInfo | null
  currentReturnAsync: boolean
  currentClassConstructor: boolean
  asyncDepth: number
  functionDepth: number
  incompleteDeclaredTypeDependencies: Map<string, Set<string>>
  incompleteDeclaredTypes: Set<string>
  narrowedNullableNames: Set<string>
  narrowedTypeRefs: Map<string, TypeRef>
  narrowedValueTypes: Map<string, ValueType>
  resolvedDeclaredTypes: Map<string, ResolvedTypeInfo>
  resolvingDeclaredTypes: Set<string>
  retriedIncompleteDeclaredTypes: Set<string>
  functionDeclarations: Map<string, AnyNode>
  inferringFunctionReturns: Set<string>
  inferredFunctionReturnCandidates: InferredFunctionReturnCandidate[] | null
  topLevelConstDeclarations: Map<string, AnyNode>
  resolvedTopLevelConstSymbols: Map<string, SymbolInfo>
  libraryLiteralTypeInference: CompilerLibraryLiteralTypeInference | null

  constructor(
    program: ProgramNode,
    options: CompileOptions = {},
    libraryLiteralTypeInference: CompilerLibraryLiteralTypeInference | null = null
  ) {
    this.program = program
    this.options = options
    this.diagnostics = []
    this.missingIntrinsicProviderExpressions = new Set()
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
    this.currentReturnAsyncResultValueType = null
    this.currentReturnShape = null
    this.currentReturnAsync = false
    this.currentClassConstructor = false
    this.asyncDepth = 0
    this.functionDepth = 0
    this.incompleteDeclaredTypeDependencies = new Map()
    this.incompleteDeclaredTypes = new Set()
    this.narrowedNullableNames = new Set()
    this.narrowedTypeRefs = new Map()
    this.narrowedValueTypes = new Map()
    this.resolvedDeclaredTypes = new Map()
    this.resolvingDeclaredTypes = new Set()
    this.retriedIncompleteDeclaredTypes = new Set()
    this.functionDeclarations = new Map()
    this.inferringFunctionReturns = new Set()
    this.inferredFunctionReturnCandidates = null
    this.topLevelConstDeclarations = new Map()
    this.resolvedTopLevelConstSymbols = new Map()
    this.libraryLiteralTypeInference = libraryLiteralTypeInference
  }

  check(): void {
    this.collectLibraryGlobalDeclarations()
    this.collectTopLevelDeclarations()

    for (let index = 0; index < this.program.body.length; index = index + 1) {
      const item = checkerNodeAt(this.program.body, index)

      this.checkTopLevelItem(item)
    }

    this.checkInlineDeclarationDependencies()
    throwDiagnostics(this.diagnostics)
  }

  checkInlineDeclarationDependencies(): void {
    const privateBindings = new Map<SourceLocation, string>()

    for (let index = 0; index < this.program.body.length; index = index + 1) {
      const item = checkerNodeAt(this.program.body, index)

      if (
        item.exported !== true &&
        (item.type === 'FunctionDeclaration' || item.type === 'VariableDeclaration' || item.type === 'ClassDeclaration')
      ) {
        privateBindings.set(nodeSourceLocation(item), item.name)
      }
    }

    for (let index = 0; index < this.program.body.length; index = index + 1) {
      const item = checkerNodeAt(this.program.body, index)

      if (item.exported !== true) {
        continue
      }

      if (item.type === 'FunctionDeclaration' && item.inline === true) {
        this.checkInlineDeclarationReferences(item.name, item, privateBindings)
        continue
      }

      if (item.type === 'VariableDeclaration' && item.inline === true) {
        this.checkInlineDeclarationReferences(item.name, item.init, privateBindings)
        continue
      }

      if (item.type !== 'ClassDeclaration') {
        continue
      }

      for (let methodIndex = 0; methodIndex < item.methods.length; methodIndex = methodIndex + 1) {
        const method = checkerNodeAt(item.methods, methodIndex)

        if (method.inline === true) {
          this.checkInlineDeclarationReferences(`${item.name}.${method.name}`, method, privateBindings)
        }
      }
    }
  }

  checkInlineDeclarationReferences(
    declarationName: string,
    node: AnyNode | AnyNode[] | null | undefined,
    privateBindings: Map<SourceLocation, string>
  ): void {
    if (node === null || typeof node === 'undefined') {
      return
    }

    if (Array.isArray(node)) {
      for (let index = 0; index < node.length; index = index + 1) {
        this.checkInlineDeclarationReferences(declarationName, node[index], privateBindings)
      }

      return
    }

    if (node.type === 'Reference') {
      const bindingLoc = node.bindingLoc

      if (
        bindingLoc !== null &&
        typeof bindingLoc === 'object' &&
        node.bindingKind !== 'global' &&
        node.bindingKind !== 'import'
      ) {
        const privateName = privateBindings.get(bindingLoc as SourceLocation)

        if (privateName !== null && typeof privateName !== 'undefined') {
          this.report(
            'INOX_INLINE_PRIVATE_REFERENCE',
            `exported @inline declaration ${declarationName} cannot reference private module binding ${privateName}`,
            node.loc
          )
        }
      }
    }

    this.checkInlineDeclarationReferences(declarationName, node.body, privateBindings)
    this.checkInlineDeclarationReferences(declarationName, node.params, privateBindings)
    this.checkInlineDeclarationReferences(declarationName, node.fields, privateBindings)
    this.checkInlineDeclarationReferences(declarationName, node.methods, privateBindings)
    this.checkInlineDeclarationReferences(declarationName, node.init, privateBindings)
    this.checkInlineDeclarationReferences(declarationName, node.condition, privateBindings)
    this.checkInlineDeclarationReferences(declarationName, node.consequent, privateBindings)
    this.checkInlineDeclarationReferences(declarationName, node.alternate, privateBindings)
    this.checkInlineDeclarationReferences(declarationName, node.test, privateBindings)
    this.checkInlineDeclarationReferences(declarationName, node.update, privateBindings)
    this.checkInlineDeclarationReferences(declarationName, node.iterable, privateBindings)
    this.checkInlineDeclarationReferences(declarationName, node.discriminant, privateBindings)
    this.checkInlineDeclarationReferences(declarationName, node.cases, privateBindings)
    this.checkInlineDeclarationReferences(declarationName, node.block, privateBindings)
    this.checkInlineDeclarationReferences(declarationName, node.handler, privateBindings)
    this.checkInlineDeclarationReferences(declarationName, node.finalizer, privateBindings)
    this.checkInlineDeclarationReferences(declarationName, node.argument, privateBindings)
    this.checkInlineDeclarationReferences(declarationName, node.args, privateBindings)
    this.checkInlineDeclarationReferences(declarationName, node.callee, privateBindings)
    this.checkInlineDeclarationReferences(declarationName, node.object, privateBindings)
    this.checkInlineDeclarationReferences(declarationName, node.index, privateBindings)
    this.checkInlineDeclarationReferences(declarationName, node.target, privateBindings)
    this.checkInlineDeclarationReferences(declarationName, node.value, privateBindings)
    this.checkInlineDeclarationReferences(declarationName, node.left, privateBindings)
    this.checkInlineDeclarationReferences(declarationName, node.right, privateBindings)
    this.checkInlineDeclarationReferences(declarationName, node.elements, privateBindings)
    this.checkInlineDeclarationReferences(declarationName, node.properties, privateBindings)
    this.checkInlineDeclarationReferences(declarationName, node.expression, privateBindings)
    this.checkInlineDeclarationReferences(declarationName, node.expressions, privateBindings)
    this.checkInlineDeclarationReferences(declarationName, node.defaultValue, privateBindings)
  }

  collectLibraryGlobalDeclarations(): void {
    const parsed = parseCompilerLibraryGlobalDeclarations(
      resolveCompilerLibrarySet(this.options.libraries).declarations
    )

    for (let index = 0; index < parsed.diagnostics.length; index = index + 1) {
      this.diagnostics.push(parsed.diagnostics[index])
    }

    throwDiagnostics(this.diagnostics)

    for (
      let declarationIndex = 0;
      declarationIndex < parsed.declarations.length;
      declarationIndex = declarationIndex + 1
    ) {
      const declaration = parsed.declarations[declarationIndex]

      for (let itemIndex = 0; itemIndex < declaration.program.body.length; itemIndex = itemIndex + 1) {
        const item = checkerNodeAt(declaration.program.body, itemIndex)

        if (item.type === 'TypeAliasDeclaration') {
          this.types.set(item.name, typeAliasInfoFromDeclaration(item as TypeAliasDeclarationNode))
          this.ambientTypeNames.add(item.name)
        } else if (item.type === 'ClassDeclaration') {
          this.classNames.add(item.name)
          this.ambientTypeNames.add(item.name)

          const typeParameters: AnyNode[] = item.typeParameters ?? []

          if (typeParameters.length > 0) {
            this.types.set(item.name, {
              kind: 'object',
              typeParameters,
              fields: item.fields ?? []
            })
          }
        }
      }
    }

    for (
      let declarationIndex = 0;
      declarationIndex < parsed.declarations.length;
      declarationIndex = declarationIndex + 1
    ) {
      this.declareLibraryGlobalProgram(parsed.declarations[declarationIndex])
    }

    const ambientScope = this.scope

    this.scope = new CheckerScope(ambientScope)
    this.incompleteDeclaredTypeDependencies.clear()
    this.incompleteDeclaredTypes.clear()
    this.resolvedDeclaredTypes.clear()
    this.resolvingDeclaredTypes.clear()
    this.retriedIncompleteDeclaredTypes.clear()
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
    const symbol = this.importedFunctionDeclarationSymbol(item, nodeSourceLocation(item))
    symbol.libraryId = libraryId
    symbol.libraryBindingId = `global:${item.name}`
    const existing = this.scope.bindings.get(item.name)

    if (existing !== null && typeof existing !== 'undefined') {
      const overloads = existing.overloads ?? []
      overloads.push(symbol)
      existing.overloads = overloads
      return
    }

    const firstOverload = this.importedFunctionDeclarationSymbol(item, nodeSourceLocation(item))
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

    const typeParameterState = this.pushFunctionTypeParameters(item)

    try {
      const constructorMethod = constructorMethods[0] ?? null
      let constructorParams: AnyNode[] = []

      if (constructorMethod !== null && typeof constructorMethod !== 'undefined') {
        constructorParams = this.resolveParams(constructorMethod.params)
      }

      const shape = this.resolveClassInstanceShape(item, constructorParams)
      const constructorOverloads: SymbolInfo[] = []
      const constructorParamTemplates: AnyNode[][] = []

      if (constructorMethods.length === 0) {
        constructorOverloads.push({
          kind: 'function',
          valueType: 'function',
          params: [],
          returnType: 'object',
          returnShape: shape,
          loc: item.loc
        })
        constructorParamTemplates.push([])
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
        constructorParamTemplates.push(method.params)
      }

      const symbol: SymbolInfo = {
        kind: 'class',
        mutable: false,
        valueType: 'class',
        libraryId,
        libraryBindingId: `global:${item.name}`,
        classMethods: item.methods,
        typeParameters: item.typeParameters ?? [],
        constructorParams,
        constructorParamTemplates,
        constructorOverloads,
        shape,
        loc: item.loc
      }

      item.shape = shape
      this.scope.bindings.set(item.name, symbol)
      this.typeSymbols.set(item.name, symbol)
    } finally {
      this.restoreFunctionTypeParameters(typeParameterState)
    }
  }

  collectTopLevelDeclarations(): void {
    for (let index = 0; index < this.program.body.length; index = index + 1) {
      const item = checkerNodeAt(this.program.body, index)

      if (item.type === 'TypeAliasDeclaration') {
        this.declareTypeAlias(item as TypeAliasDeclarationNode)
      } else if (item.type === 'ClassDeclaration') {
        this.classNames.add(item.name)
      } else if (
        item.type === 'VariableDeclaration' &&
        item.kind === 'const' &&
        !this.topLevelConstDeclarations.has(item.name)
      ) {
        this.topLevelConstDeclarations.set(item.name, item)
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
            symbol.classMethods = specifier.classMethods ?? []
          }

          if (specifier.returnType !== null && typeof specifier.returnType !== 'undefined') {
            symbol.valueType = 'function'
            symbol.params = this.resolveImportedParams(specifier.params ?? [])
            symbol.returnType = specifier.returnType
            symbol.declaredReturnType = specifier.declaredReturnType ?? specifier.returnType
            symbol.returnTypeRef = specifier.returnTypeRef ?? null
            symbol.returnNullable = specifier.returnNullable === true
            symbol.returnAsyncResultValueType = specifier.returnAsyncResultValueType ?? null
            symbol.returnShape = specifier.returnShape ?? null
            symbol.async = specifier.async === true

            const functionOverloads: AnyNode[] = specifier.functionOverloads ?? []

            if (functionOverloads.length > 1) {
              symbol.overloads = []

              for (const overload of functionOverloads) {
                symbol.overloads.push(this.importedFunctionDeclarationSymbol(overload, nodeSourceLocation(specifier)))
              }
            }
          }

          this.declare(specifier.local, symbol, specifier.loc)
        }
      }

      if (item.type === 'FunctionDeclaration') {
        this.functionDeclarations.set(item.name, item)
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
              declaredReturnType: item.declaredReturnType ?? item.returnType ?? null,
              returnTypeRef: returnInfo.typeRef,
              returnNullable: returnInfo.nullable,
              returnAsyncResultValueType: returnInfo.asyncResultValueType ?? null,
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

    const typeRef: TypeRef | null | undefined = specifier.typeRef

    if (typeRef !== null && typeof typeRef !== 'undefined') {
      const metadata = typeRefCompatibilityMetadata(
        typeRef,
        resolveCompilerLibrarySet(this.options.libraries),
        nodeSourceLocation(specifier)
      )

      this.applyResolvedTypeInfoToSymbol(symbol, {
        valueType: metadata.valueType,
        nullable: metadata.nullable,
        typeRef,
        functionType: specifier.functionType ?? null,
        shape: metadata.shape,
        asyncResultValueType: metadata.asyncResultValueType
      })
      return
    }

    symbol.asyncResultValueType = specifier.asyncResultValueType ?? symbol.asyncResultValueType ?? null
    symbol.shape = specifier.shape ?? symbol.shape ?? null
  }

  applyResolvedTypeInfoToSymbol(symbol: SymbolInfo, info: ResolvedTypeInfo): void {
    symbol.valueType = info.valueType
    if (info.typeRef) {
      symbol.typeRef = info.typeRef
    }
    symbol.nullable = info.nullable
    symbol.asyncResultValueType = info.asyncResultValueType
    symbol.functionType = info.functionType
    symbol.shape = info.shape
  }

  applyResolvedTypeInfoMetadataToExpression(expression: AnyNode, info: ResolvedTypeInfo): void {
    if (info.typeRef) {
      expression.typeRef = info.typeRef
    }
    expression.asyncResultValueType = info.asyncResultValueType
    expression.functionType = info.functionType
    expression.shape = info.shape
  }

  resolvedIterableElementDeclaredName(info: ResolvedTypeInfo): string | null {
    return typeRefIterableElementDeclaredName(info.typeRef, resolveCompilerLibrarySet(this.options.libraries))
  }

  resolvedIterableElementValueType(info: ResolvedTypeInfo): ValueType | null {
    return typeRefIterableElementValueType(info.typeRef, resolveCompilerLibrarySet(this.options.libraries))
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

      if ((declaredType !== null && typeof declaredType !== 'undefined') || isBuiltinValueType(valueType)) {
        resolved.push(param as FunctionTypeParamMetadata)
      } else {
        resolved.push(this.resolveParam(param))
      }
    }

    return resolved
  }

  importedFunctionDeclarationSymbol(declaration: AnyNode, loc: SourceLocation): SymbolInfo {
    const typeParameterState = this.pushFunctionTypeParameters(declaration)

    try {
      return {
        kind: 'function',
        valueType: 'function',
        params: this.resolveImportedParams(declaration.params ?? []),
        returnType: declaration.returnType ?? declaration.declaredReturnType ?? 'unknown',
        declaredReturnType: declaration.declaredReturnType ?? declaration.returnType ?? null,
        returnTypeRef: declaration.returnTypeRef ?? null,
        returnNullable: declaration.returnNullable === true,
        returnAsyncResultValueType: declaration.returnAsyncResultValueType ?? null,
        returnShape: declaration.returnShape ?? null,
        async: declaration.async === true,
        loc
      }
    } finally {
      this.restoreFunctionTypeParameters(typeParameterState)
    }
  }

  resolveParam(param: AnyNode): FunctionTypeParamMetadata {
    const declaredType = nodeDeclaredTypeOrValueType(param)

    const paramInfo = this.resolveParamType(param, declaredType)

    let asyncResultValueType: ValueType | null = null

    if (paramInfo.asyncResultValueType !== null && typeof paramInfo.asyncResultValueType !== 'undefined') {
      asyncResultValueType = paramInfo.asyncResultValueType
    }

    const resolvedParam: FunctionTypeParamMetadata = {
      name: param.name,
      loc: nodeSourceLocation(param),
      declaredType,
      optional: isOptionalParam(param),
      rest: param.rest === true,
      className: this.declaredClassName(declaredType),
      valueType: paramInfo.valueType,
      typeRef: paramInfo.typeRef,
      nullable:
        paramInfo.nullable ||
        (param.optional === true && (param.defaultValue === null || typeof param.defaultValue === 'undefined')),
      asyncResultValueType,
      functionType: paramInfo.functionType,
      shape: paramInfo.shape,
      defaultValue: null
    }

    if (param.defaultValue !== null && typeof param.defaultValue !== 'undefined') {
      resolvedParam.defaultValue = param.defaultValue
    }

    return resolvedParam
  }

  resolveParamType(param: AnyNode, declaredType: string): ResolvedTypeInfo {
    const paramInfo = this.resolveDeclaredType(declaredType, param.loc)
    const declaredFunctionType = this.resolveFunctionTypeMetadata(param.functionType, param.loc)

    if (declaredFunctionType !== null) {
      paramInfo.valueType = 'function'
      paramInfo.functionType = declaredFunctionType
    }

    if (param.shape !== null && typeof param.shape !== 'undefined') {
      paramInfo.valueType = 'object'
      paramInfo.shape = this.resolveObjectShape(param.shape)
    }

    return paramInfo
  }

  resolveClassInstanceShape(statement: AnyNode, constructorParams: AnyNode[]): ObjectShapeInfo {
    if (statement.fields !== null && typeof statement.fields !== 'undefined' && statement.fields.length > 0) {
      const resolvedFields: AnyNode[] = []

      for (let index = 0; index < statement.fields.length; index = index + 1) {
        const field = checkerNodeAt(statement.fields, index)
        const resolvedField = this.resolveClassField(field)

        resolvedFields.push(resolvedField)
        statement.fields[index] = resolvedField
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
    const declaredFunctionType = this.resolveFunctionTypeMetadata(field.functionType, field.loc)

    if (declaredFunctionType !== null) {
      fieldInfo.valueType = 'function'
      fieldInfo.functionType = declaredFunctionType
    }

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
      typeRef: fieldInfo.typeRef,
      className: this.declaredClassName(declaredType),
      valueType: fieldInfo.valueType,
      nullable: fieldInfo.nullable,
      asyncResultValueType: fieldInfo.asyncResultValueType ?? null,
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
      this.inferFunctionDeclarationReturn(item)

      if (
        item.async === true &&
        compilerLibraryOperationForIntrinsic(
          resolveCompilerLibrarySet(this.options.libraries),
          'async-result',
          'construct'
        ) === null
      ) {
        this.reportMissingCompilerLibraryIntrinsicProvider(item, 'async-result')
      }

      const scopeState = this.pushScope()
      const typeParameterState = this.pushFunctionTypeParameters(item)

      try {
        const previousReturnType = this.currentReturnType
        const returnInfo = this.resolveFunctionDeclarationReturnType(item)
        item.returnTypeRef = returnInfo.typeRef
        item.returnShape = returnInfo.shape
        this.currentReturnType = returnInfo.valueType
        const previousReturnNullable = this.currentReturnNullable
        this.currentReturnNullable = returnInfo.nullable
        const previousReturnAsyncResultValueType = this.currentReturnAsyncResultValueType
        const previousReturnShape = this.currentReturnShape
        this.currentReturnShape = returnInfo.shape
        let returnAsyncResultValueType: ValueType | null = null

        if (returnInfo.asyncResultValueType !== null && typeof returnInfo.asyncResultValueType !== 'undefined') {
          returnAsyncResultValueType = returnInfo.asyncResultValueType
        }

        this.currentReturnAsyncResultValueType = returnAsyncResultValueType
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
          const declaredType = nodeDeclaredTypeOrValueType(param)
          const paramInfo = this.resolveParamType(param, declaredType)
          param.declaredType = declaredType
          param.valueType = paramInfo.valueType
          param.className = this.declaredClassName(declaredType)
          param.typeRef = paramInfo.typeRef
          param.nullable =
            paramInfo.nullable ||
            (param.optional === true && (param.defaultValue === null || typeof param.defaultValue === 'undefined'))
          param.asyncResultValueType = paramInfo.asyncResultValueType
          param.functionType = paramInfo.functionType
          param.shape = paramInfo.shape

          if (param.defaultValue !== null && typeof param.defaultValue !== 'undefined') {
            const defaultType = this.checkVariableInitializer(param.defaultValue, paramInfo, declaredType)
            this.checkAssignableType(
              defaultType,
              paramInfo.valueType,
              param.defaultValue.loc,
              paramInfo.nullable,
              this.expressionCanBeNull(param.defaultValue)
            )
          }

          this.declare(
            param.name,
            {
              kind: 'param',
              mutable: true,
              className: param.className,
              valueType: paramInfo.valueType,
              declaredType,
              typeRef: paramInfo.typeRef,
              nullable: param.nullable,
              asyncResultValueType: paramInfo.asyncResultValueType ?? null,
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
          this.currentReturnAsyncResultValueType = previousReturnAsyncResultValueType
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

    const consequent: AnyNode | null | undefined = statement.consequent
    const alternate: AnyNode | null | undefined = statement.alternate

    if (alternate !== null && typeof alternate !== 'undefined') {
      return
    }

    if (consequent === null || typeof consequent === 'undefined' || !statementAlwaysExits(consequent)) {
      return
    }

    const narrowing = this.resolveNullableConditionNarrowing(statement.condition)
    const valueTypeNarrowing = this.resolveValueTypeConditionNarrowing(statement.condition)

    for (const name of narrowing.falseNames) {
      this.narrowedNullableNames.add(name)
    }

    for (const narrowed of valueTypeNarrowing.falseTypes) {
      this.narrowedValueTypes.set(narrowed.name, narrowed.valueType)

      if (narrowed.typeRef !== null) {
        this.narrowedTypeRefs.set(narrowed.name, narrowed.typeRef)
      } else {
        this.narrowedTypeRefs.delete(narrowed.name)
      }
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
      const consequent: AnyNode | null | undefined = statement.consequent
      const alternate: AnyNode | null | undefined = statement.alternate

      if (consequent === null || typeof consequent === 'undefined') {
        return
      }

      this.checkBooleanCondition(statement.condition)
      const narrowing = this.resolveNullableConditionNarrowing(statement.condition)
      const valueTypeNarrowing = this.resolveValueTypeConditionNarrowing(statement.condition)
      let consequentNarrowedNames: Set<string> | null = null

      const trueNarrowingState = this.pushBranchNarrowedNullableNames(narrowing.trueNames, valueTypeNarrowing.trueTypes)

      try {
        this.checkFlowScopedBody(consequent)
        consequentNarrowedNames = cloneStringSet(this.narrowedNullableNames)
      } finally {
        this.restoreNarrowedNullableNames(trueNarrowingState)
      }

      if (alternate !== null && typeof alternate !== 'undefined') {
        let alternateNarrowedNames: Set<string> | null = null
        const falseNarrowingState = this.pushBranchNarrowedNullableNames(
          narrowing.falseNames,
          valueTypeNarrowing.falseTypes
        )

        try {
          this.checkFlowScopedBody(alternate)
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
      const valueTypeNarrowing = this.resolveValueTypeConditionNarrowing(statement.condition)

      const loopState = this.pushLoop()

      try {
        const narrowingState = this.pushNarrowedNullableNames(narrowing.trueNames, valueTypeNarrowing.trueTypes)

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
        initType = this.checkVariableInitializer(statement.init, declared, statement.declaredType ?? null)
      }

      let valueType = initType

      if (declared !== null && typeof declared !== 'undefined') {
        valueType = declared.valueType
      }

      let asyncResultValueType = this.resolveExpressionAsyncResultValueType(statement.init)
      let asyncResultRejectionIntrinsicRole = resolveExpressionAsyncResultRejectionIntrinsicRole(statement.init)

      if (declared !== null && typeof declared !== 'undefined' && declared.valueType === 'async-result') {
        asyncResultValueType = null
        asyncResultRejectionIntrinsicRole = null

        if (declared.asyncResultValueType !== null && typeof declared.asyncResultValueType !== 'undefined') {
          asyncResultValueType = declared.asyncResultValueType
        }
      }

      let nullable = declared?.nullable === true

      if (
        (declared === null || typeof declared === 'undefined') &&
        statement.init !== null &&
        typeof statement.init !== 'undefined' &&
        statement.init.nullable === true
      ) {
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
      let libraryIntrinsicRole: IntrinsicRole | null = null
      let typeRef: TypeRef | null = null
      const declaredTypeRef =
        declared === null || typeof declared === 'undefined'
          ? null
          : typeRefFromResolvedTypeInContext(declared, statement.declaredType ?? null)

      if (
        declaredTypeRef !== null &&
        typeof declaredTypeRef !== 'undefined'
      ) {
        typeRef = declaredTypeRef

        if (
          statement.init !== null &&
          typeof statement.init !== 'undefined' &&
          statement.init.typeRef !== null &&
          typeof statement.init.typeRef !== 'undefined' &&
          !isUnknownTypeRef(declaredTypeRef)
        ) {
          typeRef = refineTypeRefUnknowns(declaredTypeRef, statement.init.typeRef)
        }
      } else if (
        statement.init !== null &&
        typeof statement.init !== 'undefined' &&
        statement.init.typeRef !== null &&
        typeof statement.init.typeRef !== 'undefined'
      ) {
        typeRef = statement.init.typeRef
      }

      if (
        statement.init !== null &&
        typeof statement.init !== 'undefined' &&
        typeRef !== null &&
        (statement.init.typeRef === null ||
          typeof statement.init.typeRef === 'undefined' ||
          !isUnknownTypeRef(declaredTypeRef))
      ) {
        statement.init.typeRef = typeRef
      }

      if (
        statement.init !== null &&
        typeof statement.init !== 'undefined' &&
        statement.init.className !== null &&
        typeof statement.init.className !== 'undefined'
      ) {
        className = statement.init.className
      }

      if (
        statement.init !== null &&
        typeof statement.init !== 'undefined' &&
        statement.init.libraryIntrinsicRole !== null &&
        typeof statement.init.libraryIntrinsicRole !== 'undefined'
      ) {
        libraryIntrinsicRole = statement.init.libraryIntrinsicRole
      }

      statement.valueType = valueType
      statement.nullable = nullable
      statement.asyncResultValueType = asyncResultValueType
      statement.asyncResultRejectionIntrinsicRole = asyncResultRejectionIntrinsicRole
      statement.functionType = functionType
      statement.shape = shape
      statement.className = className
      statement.libraryIntrinsicRole = libraryIntrinsicRole
      statement.typeRef = typeRef
      statement.libraryCppType = statement.init?.libraryCppType ?? null
      statement.libraryRuntimeRequirements = statement.init?.libraryRuntimeRequirements ?? []
      statement.inferredDeclaredType =
        statement.declaredType ?? statement.init?.declaredType ?? this.compilerLibraryTypeRefDeclaredName(typeRef)

      if (
        declared !== null &&
        typeof declared !== 'undefined' &&
        statement.init !== null &&
        typeof statement.init !== 'undefined' &&
        statement.init.type === 'ObjectLiteral'
      ) {
        const declaredShape = declared.shape

        if (declaredShape !== null && typeof declaredShape !== 'undefined') {
          this.checkObjectLiteralAgainstShape(statement.init, declaredShape, statement.declaredType ?? null)
        }
      }

      this.declare(
        statement.name,
        {
          kind: statement.kind,
          mutable: statement.kind === 'let',
          valueType,
          declaredType: statement.inferredDeclaredType,
          nullable,
          narrowingTrueNames,
          narrowingFalseNames,
          asyncResultValueType,
          asyncResultRejectionIntrinsicRole,
          functionType,
          className: statement.className,
          libraryIntrinsicRole,
          typeRef,
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
          statement.loc,
          initType
        )

        const declaredArrayElementType = this.resolvedIterableElementValueType(declared)

        if (declaredArrayElementType !== null) {
          this.checkAssignableType(
            this.resolveExpressionArrayElementType(statement.init),
            declaredArrayElementType,
            statement.loc,
            false,
            false
          )
        }

        if (
          declared.valueType === 'async-result' &&
          declared.asyncResultValueType !== null &&
          typeof declared.asyncResultValueType !== 'undefined'
        ) {
          this.checkAssignableType(
            this.resolveExpressionAsyncResultValueType(statement.init),
            declared.asyncResultValueType,
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

      if (this.inferredFunctionReturnCandidates !== null) {
        this.inferredFunctionReturnCandidates.push({
          valueType: actual,
          nullable: this.expressionCanBeNull(statement.argument),
          typeRef: statement.argument?.typeRef ?? null,
          functionType: statement.argument?.functionType ?? null,
          shape: this.resolveExpressionShape(statement.argument),
          asyncResultValueType: this.resolveExpressionAsyncResultValueType(statement.argument)
        })
        return
      }

      if (
        this.currentReturnAsync &&
        this.currentReturnType === 'async-result' &&
        this.currentReturnAsyncResultValueType !== null &&
        typeof this.currentReturnAsyncResultValueType !== 'undefined'
      ) {
        if (actual === 'async-result') {
          this.checkAssignableType(
            this.resolveExpressionAsyncResultValueType(statement.argument),
            this.currentReturnAsyncResultValueType,
            statement.loc,
            false,
            false
          )
        } else {
          this.checkAssignableType(
            actual,
            this.currentReturnAsyncResultValueType,
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
          statement.loc,
          actual
        )
      }

      if (
        this.currentReturnType === 'async-result' &&
        this.currentReturnAsyncResultValueType !== null &&
        typeof this.currentReturnAsyncResultValueType !== 'undefined'
      ) {
        this.checkAssignableType(
          this.resolveExpressionAsyncResultValueType(statement.argument),
          this.currentReturnAsyncResultValueType,
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
          let paramLoc = nodeSourceLocation(statement.handler)
          const handlerParamLoc = statement.handler.paramLoc

          if (handlerParamLoc !== null && typeof handlerParamLoc !== 'undefined') {
            paramLoc = handlerParamLoc
          }

          const exceptionOperation = compilerLibraryOperationForIntrinsic(
            resolveCompilerLibrarySet(this.options.libraries),
            'exception-value',
            'construct'
          )
          const exceptionTypeRef = exceptionOperation?.resultTypeRef ?? null
          const exceptionMetadata =
            exceptionTypeRef === null
              ? null
              : typeRefCompatibilityMetadata(
                  exceptionTypeRef,
                  resolveCompilerLibrarySet(this.options.libraries),
                  paramLoc
                )

          this.declare(
            statement.handler.param,
            {
              kind: 'catch',
              mutable: false,
              valueType: exceptionMetadata?.valueType ?? 'unknown',
              typeRef: exceptionTypeRef,
              shape: exceptionMetadata?.shape ?? null,
              libraryIntrinsicRole: exceptionTypeRef === null ? null : 'exception-value',
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
    if (expression.type === 'StringLiteral') {
      return 'string'
    }

    if (expression.type === 'TemplateLiteral') {
      return this.checkTemplateLiteral(expression)
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
        expression.typeRef = asserted.typeRef ?? null
        expression.asyncResultValueType = asserted.asyncResultValueType
        expression.asyncResultRejectionIntrinsicRole = asserted.asyncResultRejectionIntrinsicRole
        expression.functionType = asserted.functionType
        expression.shape = asserted.shape
        expression.className = asserted.className
        expression.libraryIntrinsicRole = asserted.libraryIntrinsicRole

        return sourceValueType
      }

      const declared = this.resolveDeclaredType(declaredType, expression.loc as SourceLocation)
      let asyncResultValueType: ValueType | null = asserted.asyncResultValueType
      let functionType: FunctionTypeMetadata | null = asserted.functionType
      let shape: ObjectShapeInfo | null = asserted.shape
      let className: string | null = asserted.className

      if (declared.asyncResultValueType !== null && typeof declared.asyncResultValueType !== 'undefined') {
        asyncResultValueType = declared.asyncResultValueType
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
      expression.typeRef = declared.typeRef
      expression.asyncResultValueType = asyncResultValueType
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
      expression.declaredType = null
      expression.typeRef = null
      expression.shape = null
      expression.className = null

      if (symbol !== null && typeof symbol !== 'undefined') {
        valueType = symbol.valueType
        expression.nullable = symbol.nullable === true
        expression.valueType = valueType
        expression.typeRef = symbol.typeRef ?? null

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
      const isUndefinedValue = path.length === 1 && path[0] === 'undefined' && !this.scope.resolve('undefined')
      const symbol = isUndefinedValue ? null : this.resolveReference(expression)
      let valueType: ValueType = 'unknown'

      expression.nullable = false
      expression.valueType = valueType
      expression.typeRef = null
      expression.asyncResultValueType = null
      expression.asyncResultRejectionIntrinsicRole = null
      expression.functionType = null
      expression.shape = null
      expression.className = null
      expression.libraryIntrinsicRole = null
      expression.bindingKind = null
      expression.bindingLoc = null

      if (isUndefinedValue) {
        expression.nullable = true
        return valueType
      }

      if (symbol !== null && typeof symbol !== 'undefined') {
        const narrowedTypeRef = this.narrowedTypeRefs.get(path[0]) ?? null
        const nullableNarrowed = this.narrowedNullableNames.has(path[0])
        expression.bindingKind = symbol.kind
        expression.bindingLoc = symbol.loc ?? null
        valueType = this.narrowedValueTypes.get(path[0]) ?? symbol.valueType
        expression.nullable = symbol.nullable === true && !nullableNarrowed
        expression.valueType = valueType
        expression.declaredType = symbol.declaredType ?? null
        expression.typeRef = nullableNarrowed ? nonNullableTypeRef(symbol.typeRef) : (symbol.typeRef ?? null)
        expression.narrowingTrueNames = symbol.narrowingTrueNames ?? []
        expression.narrowingFalseNames = symbol.narrowingFalseNames ?? []

        if (symbol.asyncResultValueType !== null && typeof symbol.asyncResultValueType !== 'undefined') {
          expression.asyncResultValueType = symbol.asyncResultValueType
        }

        if (
          symbol.asyncResultRejectionIntrinsicRole !== null &&
          typeof symbol.asyncResultRejectionIntrinsicRole !== 'undefined'
        ) {
          expression.asyncResultRejectionIntrinsicRole = symbol.asyncResultRejectionIntrinsicRole
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
            declaredReturnType: symbol.declaredReturnType ?? null,
            returnTypeRef: symbol.returnTypeRef ?? null,
            returnNullable: symbol.returnNullable === true,
            returnAsyncResultValueType: symbol.returnAsyncResultValueType ?? null,
            returnShape: symbol.returnShape ?? null
          }
        }

        if (symbol.shape !== null && typeof symbol.shape !== 'undefined') {
          expression.shape = symbol.shape
        }

        if (symbol.className !== null && typeof symbol.className !== 'undefined') {
          expression.className = symbol.className
        }

        if (symbol.libraryIntrinsicRole !== null && typeof symbol.libraryIntrinsicRole !== 'undefined') {
          expression.libraryIntrinsicRole = symbol.libraryIntrinsicRole
        }

        if (narrowedTypeRef !== null) {
          this.applyCompilerLibraryTypeRef(expression, narrowedTypeRef, null)
          valueType = expression.valueType as ValueType
        }
      }

      if (path.length === 1 && (symbol === null || typeof symbol === 'undefined' || symbol.kind !== 'import')) {
        const globalOperation = this.compilerLibraryOperationForExpression(expression, 'member-read')

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
      expression.asyncResultValueType = null
      expression.shape = null

      if (symbol.returnType !== null && typeof symbol.returnType !== 'undefined') {
        expression.valueType = symbol.returnType
      }

      if (symbol.returnAsyncResultValueType !== null && typeof symbol.returnAsyncResultValueType !== 'undefined') {
        expression.asyncResultValueType = symbol.returnAsyncResultValueType
      }

      if (symbol.returnShape !== null && typeof symbol.returnShape !== 'undefined') {
        expression.shape = symbol.returnShape
      }

      if (symbol.returnTypeRef !== null && typeof symbol.returnTypeRef !== 'undefined') {
        this.applyCompilerLibraryTypeRef(expression, symbol.returnTypeRef, null)
        expression.nullable = true
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
              argumentParamValueType(param, resolveCompilerLibrarySet(this.options.libraries)),
              expression.args[index].loc,
              param.nullable === true,
              this.expressionCanBeNull(expression.args[index])
            )
            this.checkAssignableLibraryNativeType(
              this.resolveExpressionShape(expression.args[index]),
              param.shape as ObjectShapeInfo | null | undefined,
              expression.args[index].loc,
              argTypes[index]
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
      const fulfilledTypeRef = typeRefTraitArgument(
        expression.argument.typeRef,
        'awaitable',
        0,
        resolveCompilerLibrarySet(this.options.libraries)
      )

      if (fulfilledTypeRef !== null) {
        this.applyCompilerLibraryTypeRef(expression, fulfilledTypeRef, null)
        valueType = nodeValueTypeOrUnknown(expression)
      }

      expression.valueType = valueType

      if (valueType === 'object') {
        expression.shape = this.resolveExpressionShape(expression.argument)
      } else {
        const argumentShape = this.resolveExpressionShape(expression.argument)

        if (argumentShape?.libraryTypeId !== null && typeof argumentShape?.libraryTypeId !== 'undefined') {
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
      for (let index = 0; index < expression.elements.length; index = index + 1) {
        const element = checkerNodeAt(expression.elements, index)

        if (element.type === 'SpreadElement') {
          const argumentType = this.checkExpression(element.argument)
          const argumentTypeRef = this.compilerLibraryExpressionTypeRef(element.argument, argumentType)

          if (this.compilerLibraryIterableElementTypeRef(argumentTypeRef) === null) {
            this.report('INOX_TYPE_MISMATCH', 'array spread requires an iterable value', element.argument.loc)
          }

          element.valueType = argumentType
        } else {
          this.checkExpression(element)
        }
      }

      const arrayTypeRef = this.compilerLibraryArrayTypeRef(expression)
      let valueType: ValueType = 'unknown'

      if (arrayTypeRef === null) {
        this.reportMissingCompilerLibraryIntrinsicProvider(expression, 'array-literal')
      } else {
        const arrayNativeType =
          arrayTypeRef.kind === 'nominal'
            ? compilerLibraryNativeTypeForId(resolveCompilerLibrarySet(this.options.libraries), arrayTypeRef.typeId)
            : null
        const metadata = typeRefCompatibilityMetadata(
          arrayTypeRef,
          resolveCompilerLibrarySet(this.options.libraries),
          nodeSourceLocation(expression)
        )

        expression.typeRef = arrayTypeRef
        expression.valueType = metadata.valueType
        expression.shape = metadata.shape
        expression.libraryCppType = metadata.libraryCppType
        expression.libraryResultTypeId = metadata.libraryResultTypeId
        expression.libraryRuntimeRequirements = arrayNativeType?.runtimeRequirements ?? []
        valueType = metadata.valueType
      }

      return valueType
    }

    if (expression.type === 'ObjectLiteral') {
      this.checkObjectLiteral(expression)
      return 'object'
    }

    return 'unknown'
  }

  checkTemplateLiteral(expression: AnyNode): ValueType {
    const parts = parseTemplateLiteralParts(expression.raw, this.diagnostics, expression.loc)
    const expressions: AnyNode[] = []

    for (const part of parts) {
      if (part.kind !== 'placeholder' || part.loc === null || typeof part.loc === 'undefined') {
        continue
      }

      const placeholder = parseTemplatePlaceholderExpression(part.value, part.loc, this.diagnostics)

      if (placeholder === null || typeof placeholder === 'undefined') {
        continue
      }

      markTemplatePlaceholderNodes(placeholder)

      const outerDiagnostics = this.diagnostics
      const placeholderDiagnostics: Diagnostic[] = []

      this.diagnostics = placeholderDiagnostics

      let placeholderType: ValueType = 'unknown'

      try {
        placeholderType = this.checkExpression(placeholder)
      } finally {
        this.diagnostics = outerDiagnostics
      }

      if (templatePlaceholderHasLibraryOperation(placeholder)) {
        for (const item of placeholderDiagnostics) {
          outerDiagnostics.push(item)
        }
      }

      if (
        placeholderType !== 'string' &&
        placeholderType !== 'number' &&
        placeholderType !== 'boolean' &&
        placeholderType !== 'null'
      ) {
        this.requireImplicitStringConversionProvider(expression, placeholder)
      }

      expressions.push(placeholder)
    }

    expression.expressions = expressions
    expression.valueType = 'string'

    return 'string'
  }

  checkConditionalExpression(expression: AnyNode): ValueType {
    const test: AnyNode | null | undefined = expression.test
    const consequent: AnyNode | null | undefined = expression.consequent
    const alternate: AnyNode | null | undefined = expression.alternate

    if (
      test === null ||
      typeof test === 'undefined' ||
      consequent === null ||
      typeof consequent === 'undefined' ||
      alternate === null ||
      typeof alternate === 'undefined'
    ) {
      expression.valueType = 'unknown'
      return 'unknown'
    }

    this.checkExpression(test)
    const narrowing = this.resolveNullableConditionNarrowing(test)
    const valueTypeNarrowing = this.resolveValueTypeConditionNarrowing(test)
    let consequentType: ValueType = 'unknown'
    let alternateType: ValueType = 'unknown'

    const consequentNarrowingState = this.pushNarrowedNullableNames(narrowing.trueNames, valueTypeNarrowing.trueTypes)

    try {
      consequentType = this.checkExpression(consequent)
    } finally {
      this.restoreNarrowedNullableNames(consequentNarrowingState)
    }

    const alternateNarrowingState = this.pushNarrowedNullableNames(narrowing.falseNames, valueTypeNarrowing.falseTypes)

    try {
      alternateType = this.checkExpression(alternate)
    } finally {
      this.restoreNarrowedNullableNames(alternateNarrowingState)
    }

    const valueType = conditionalExpressionValueType(consequentType, alternateType)

    expression.valueType = valueType
    expression.nullable = this.expressionCanBeNull(consequent) || this.expressionCanBeNull(alternate)
    this.applyConditionalExpressionMetadata(expression, valueType, consequent, alternate)

    return valueType
  }

  applyConditionalExpressionMetadata(
    expression: AnyNode,
    valueType: ValueType,
    consequent: AnyNode,
    alternate: AnyNode
  ): void {
    const conditionalNullable = expression.nullable === true
    const typeRef = commonExpressionTypeRef(consequent, alternate)

    if (typeRef !== null && typeRef.kind !== 'parameter') {
      const resultTypeRef: TypeRef = { ...typeRef, nullable: conditionalNullable }

      this.applyCompilerLibraryTypeRef(expression, resultTypeRef, null)
      expression.nullable = conditionalNullable
    }

    if (valueType === 'async-result') {
      expression.asyncResultValueType =
        this.resolveExpressionAsyncResultValueType(consequent) ?? this.resolveExpressionAsyncResultValueType(alternate)
      return
    }

    if (valueType === 'object') {
      if (typeRef === null) {
        expression.shape = this.conditionalExpressionObjectShape(consequent, alternate)
      }
      return
    }

    if (valueType === 'function') {
      expression.functionType = consequent.functionType ?? alternate.functionType ?? null
    }
  }

  conditionalExpressionObjectShape(consequent: AnyNode, alternate: AnyNode): ObjectShapeInfo | null {
    const consequentShape = this.resolveExpressionShape(consequent)
    const alternateShape = this.resolveExpressionShape(alternate)

    if (consequentShape === null || typeof consequentShape === 'undefined') {
      return alternateShape
    }

    if (alternateShape === null || typeof alternateShape === 'undefined') {
      return consequentShape
    }

    const fields: AnyNode[] = []
    const names = new Set()
    const shapes = [consequentShape, alternateShape]

    for (const shape of shapes) {
      for (const sourceField of shape.fields) {
        if (names.has(sourceField.name)) {
          continue
        }

        names.add(sourceField.name)
        const consequentField = this.findShapeField(consequentShape, sourceField.name)
        const alternateField = this.findShapeField(alternateShape, sourceField.name)
        const field = cloneObjectShapeField(sourceField)

        field.optional = sourceField.optional === true || consequentField === null || alternateField === null
        field.nullable = consequentField?.nullable === true || alternateField?.nullable === true

        if (consequentField !== null && alternateField !== null) {
          field.valueType = conditionalExpressionValueType(
            nodeValueTypeOrUnknown(consequentField),
            nodeValueTypeOrUnknown(alternateField)
          )
        }

        fields.push(field)
      }
    }

    return { kind: 'object', fields }
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
        symbol.valueType === 'async-result' &&
        symbol.asyncResultValueType !== null &&
        typeof symbol.asyncResultValueType !== 'undefined'
      ) {
        this.checkAssignableType(
          this.resolveExpressionAsyncResultValueType(expression.value),
          symbol.asyncResultValueType,
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
    const leftValueTypeNarrowing = this.resolveValueTypeConditionNarrowing(expression.left)
    let right = 'unknown'

    if (expression.operator === '&&') {
      const narrowingState = this.pushNarrowedNullableNames(leftNarrowing.trueNames, leftValueTypeNarrowing.trueTypes)

      right = this.checkExpression(expression.right)
      this.restoreNarrowedNullableNames(narrowingState)
    } else if (expression.operator === '||') {
      const narrowingState = this.pushNarrowedNullableNames(leftNarrowing.falseNames, leftValueTypeNarrowing.falseTypes)

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

    if (expression.operator === '+' && valueType === 'string' && (left !== 'string' || right !== 'string')) {
      this.requireImplicitStringConversionProvider(expression, expression)
    }

    if (expression.operator === '??') {
      this.applyNullishCoalescingMetadata(expression, valueType)
    }

    return valueType
  }

  requireImplicitStringConversionProvider(target: AnyNode, diagnosticExpression: AnyNode): void {
    const libraries = resolveCompilerLibrarySet(this.options.libraries)
    const operation = compilerLibraryOperationForIntrinsic(libraries, 'string-conversion', 'call')

    if (operation === null) {
      this.reportMissingCompilerLibraryIntrinsicProvider(diagnosticExpression, 'string-conversion')
      return
    }

    target.libraryRuntimeRequirements = operation.runtimeRequirements
    target.libraryCapabilities = compilerLibraryCapabilities(
      libraries,
      operation.runtimeRequirements,
      this.options.libraryOptions
    )
  }

  applyNullishCoalescingMetadata(expression: AnyNode, valueType: ValueType): void {
    const typeRef = commonExpressionTypeRef(expression.left, expression.right)

    if (typeRef !== null && typeRef.kind !== 'parameter') {
      const declaredType = expression.left.declaredType ?? expression.right.declaredType ?? null
      const resultTypeRef: TypeRef = { ...typeRef, nullable: expression.nullable === true }

      this.applyCompilerLibraryTypeRef(expression, resultTypeRef, null)
      expression.nullable = this.expressionCanBeNull(expression.right)

      if (declaredType !== null) {
        expression.declaredType = declaredType
      }
    }

    if (valueType === 'async-result') {
      expression.asyncResultValueType =
        this.resolveExpressionAsyncResultValueType(expression.left) ??
        this.resolveExpressionAsyncResultValueType(expression.right)
      return
    }

    if (valueType === 'object') {
      if (typeRef === null) {
        expression.shape = this.resolveExpressionShape(expression.left) ?? this.resolveExpressionShape(expression.right)
      }
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
    const valueNarrowingKey = nullableNarrowingKey(expression)

    if (valueNarrowingKey !== null) {
      const narrowedValueType = this.narrowedValueTypes.get(valueNarrowingKey)

      if (narrowedValueType !== null && typeof narrowedValueType !== 'undefined') {
        this.checkExpression(expression.object)
        expression.valueType = narrowedValueType
        expression.declaredType = null
        expression.nullable = false
        expression.shape = null
        expression.functionType = null
        expression.functionOverloads = []
        expression.className = null

        const narrowedTypeRef =
          this.narrowedTypeRefs.get(valueNarrowingKey) ?? this.compilerLibraryTypeRefForValueType(narrowedValueType)

        if (narrowedTypeRef.kind !== 'unknown') {
          this.applyCompilerLibraryTypeRef(expression, narrowedTypeRef, null)
        } else {
          expression.typeRef = null
        }

        return narrowedValueType
      }
    }

    const libraryMemberType = this.applyCompilerLibraryMemberOperation(expression)

    if (libraryMemberType !== null) {
      return libraryMemberType
    }

    const objectType = this.checkExpression(expression.object)

    const optionalChainReceiver = isOptionalChainProtectedExpression(expression.object)

    if (!optionalChainReceiver) {
      this.reportNullableRuntimeAccess(expression.object, nodeSourceLocation(expression))
    }

    if (this.reportUnsupportedClassPrototypeAccess(expression, optionalChainReceiver)) {
      return 'unknown'
    }

    if (this.hasClassInstanceMethod(expression.object, expression.property)) {
      this.report('INOX_C_CLASS', 'unbound class method extraction is not supported', expression.loc)
      expression.valueType = 'unknown'
      return 'unknown'
    }

    const shape = this.resolveExpressionShape(expression.object)
    const anyNodeMetadataType = this.checkAnyNodeMetadataMemberExpression(expression, objectType, shape)

    if (anyNodeMetadataType !== null && typeof anyNodeMetadataType !== 'undefined') {
      return anyNodeMetadataType
    }

    if (shape === null || typeof shape === 'undefined') {
      if (isAnyTypedExpression(expression.object)) {
        expression.valueType = 'unknown'
        expression.declaredType = 'any'
        expression.nullable = true
        expression.typeRef = null
        expression.shape = null
        return 'unknown'
      }

      if (this.shouldReportUnknownPrimitiveAccess(expression.object, objectType)) {
        this.report('INOX_UNKNOWN_FIELD', `unknown field ${expression.property}`, expression.loc)
      }
      return 'unknown'
    }

    const field = this.resolveExpressionShapeField(expression.object, shape, expression.property)

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
    expression.declaredType = field.declaredType ?? null
    expression.typeRef =
      fieldType.typeRef ??
      field.typeRef ??
      this.compilerLibraryObjectFieldTypeRef(expression.object, expression.property) ??
      null
    expression.asyncResultValueType = resolvedValueTypeMetadata(
      field.asyncResultValueType,
      fieldType.asyncResultValueType
    )
    expression.shape = resolvedObjectShapeMetadata(field.shape, fieldType.shape)
    expression.functionType = resolvedFunctionTypeMetadata(field.functionType, fieldType.functionType)
    expression.functionOverloads = field.functionOverloads ?? []
    expression.className = null

    if (field.className !== null && typeof field.className !== 'undefined') {
      expression.className = field.className
    }

    return valueType
  }

  compilerLibraryObjectFieldTypeRef(expression: AnyNode, fieldName: string): TypeRef | null {
    const typeRef: TypeRef | null | undefined = expression.typeRef

    if (typeRef === null || typeof typeRef === 'undefined' || typeRef.kind !== 'object') {
      return null
    }

    for (let index = 0; index < typeRef.fields.length; index = index + 1) {
      const field = typeRef.fields[index]

      if (field.name === fieldName) {
        return field.typeRef
      }
    }

    return null
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

    if (expression.property === 'loc') {
      if (shape !== null && typeof shape !== 'undefined') {
        const field = this.findShapeField(shape, 'loc')

        if (field !== null && field.declaredType !== null && typeof field.declaredType !== 'undefined') {
          return null
        }
      }

      expression.valueType = 'object'
      expression.nullable = false
      expression.shape = anyNodeLocObjectShape(nodeSourceLocation(expression))
      return 'object'
    }

    const compilerNodeChild = isAnyNodeChildFieldName(expression.property)
    const directField = shape === null ? null : findExplicitShapeFieldInContext(shape, expression.property)
    let directFieldValueType: ValueType = 'unknown'

    if (directField !== null) {
      directFieldValueType = resolvedConcreteValueTypeMetadata(
        directField.valueType,
        this.resolveFieldDeclaredType(directField).valueType
      )
    }

    const directCompilerNodeChild = directAnyNode && compilerNodeChild && directFieldValueType === 'unknown'
    const missingDirectAnyNodeField = directAnyNode && directField === null

    if (childAnyNode || directCompilerNodeChild || missingDirectAnyNodeField) {
      const field = this.findShapeField(anyNodeObjectShape(nodeSourceLocation(expression)), expression.property)

      if (field !== null) {
        const fieldType = this.resolveFieldDeclaredType(field)
        const valueType = resolvedConcreteValueTypeMetadata(field.valueType, fieldType.valueType)

        expression.valueType = valueType
        expression.declaredType = field.declaredType ?? null
        expression.typeRef = fieldType.typeRef ?? field.typeRef
        expression.nullable = resolvedFieldNullableMetadata(field, fieldType)
        const narrowedKey = nullableNarrowingKey(expression)

        if (narrowedKey !== null && this.narrowedNullableNames.has(narrowedKey)) {
          expression.nullable = false
        }

        expression.asyncResultValueType = resolvedValueTypeMetadata(
          field.asyncResultValueType,
          fieldType.asyncResultValueType
        )
        expression.shape = resolvedObjectShapeMetadata(field.shape, fieldType.shape)

        if (compilerNodeChild && (expression.shape === null || typeof expression.shape === 'undefined')) {
          expression.shape = anyNodeObjectShape(nodeSourceLocation(expression))
        }

        expression.functionType = resolvedFunctionTypeMetadata(field.functionType, fieldType.functionType)
        expression.functionOverloads = field.functionOverloads ?? []
        expression.className = field.className ?? null
        return valueType
      }
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

  shouldReportUnknownPrimitiveAccess(expression: AnyNode, valueType: ValueType): boolean {
    if (this.missingIntrinsicProviderExpressions.has(expression)) {
      return false
    }

    if (valueType === 'function' || valueType === 'object') {
      return false
    }

    if (expression.type === 'Reference' && firstPathSegment(expression.path) === 'super') {
      return false
    }

    if (expression.type !== 'MemberExpression' && expression.type !== 'OptionalMemberExpression') {
      return true
    }

    const narrowedKey = nullableNarrowingKey(expression)

    if (narrowedKey !== null && this.narrowedValueTypes.has(narrowedKey)) {
      return true
    }

    const parentShape = this.resolveExpressionShape(expression.object)
    return parentShape?.builtin !== 'compiler.AnyNode'
  }

  checkOptionalMemberExpression(expression: AnyNode): ValueType {
    const libraryMemberType = this.applyCompilerLibraryMemberOperation(expression)

    if (libraryMemberType !== null) {
      expression.nullable = true
      expression.optionalChainProtected = true
      return libraryMemberType
    }

    const objectType = this.checkExpression(expression.object)

    if (this.reportUnsupportedClassPrototypeAccess(expression, true)) {
      return 'unknown'
    }

    const shape = this.resolveExpressionShape(expression.object)

    if (shape === null || typeof shape === 'undefined') {
      const anyTypedObject = isAnyTypedExpression(expression.object)

      if (!anyTypedObject && this.shouldReportUnknownPrimitiveAccess(expression.object, objectType)) {
        this.report('INOX_UNKNOWN_FIELD', `unknown field ${expression.property}`, expression.loc)
      }
      expression.nullable = true
      expression.valueType = 'unknown'
      expression.declaredType = anyTypedObject ? 'any' : null
      expression.typeRef = null
      expression.shape = null
      return 'unknown'
    }

    const field = this.resolveExpressionShapeField(expression.object, shape, expression.property)

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
    expression.declaredType = field.declaredType ?? null
    expression.typeRef = fieldType.typeRef ?? field.typeRef
    expression.asyncResultValueType = resolvedValueTypeMetadata(
      field.asyncResultValueType,
      fieldType.asyncResultValueType
    )
    expression.shape = resolvedObjectShapeMetadata(field.shape, fieldType.shape)
    expression.functionType = resolvedFunctionTypeMetadata(field.functionType, fieldType.functionType)
    expression.className = null

    if (field.className !== null && typeof field.className !== 'undefined') {
      expression.className = field.className
    }

    return valueType
  }

  checkMemberAssignment(expression: AnyNode): ValueType {
    const globalLibraryOperation = this.compilerLibraryOperationForExpression(expression.target, 'member-write')

    if (globalLibraryOperation !== null) {
      this.checkExpression(expression.target.object)
      const valueType = this.checkExpression(expression.value)
      const argInfos = [this.checkedCallArgInfo(expression.value, valueType)]
      this.checkCompilerLibrarySingleArgument(
        expression.value,
        valueType,
        globalLibraryOperation,
        0,
        expression,
        argInfos
      )
      this.applyCompilerLibraryOperation(expression, globalLibraryOperation, null, null, argInfos)
      this.reportCompilerLibraryOperationDiagnostic(expression, globalLibraryOperation)
      return valueType
    }

    this.checkExpression(expression.target.object)
    const shape = this.resolveExpressionShape(expression.target.object)
    const valueType = this.checkExpression(expression.value)
    const libraryOperation = this.compilerLibraryReceiverOperation(
      expression.target.object,
      expression.target.property,
      'member-write'
    )

    if (libraryOperation !== null) {
      const argInfos = [this.checkedCallArgInfo(expression.value, valueType)]
      this.checkCompilerLibrarySingleArgument(expression.value, valueType, libraryOperation, 0, expression, argInfos)
      this.applyCompilerLibraryOperation(expression, libraryOperation, null, null, argInfos)
      this.reportCompilerLibraryOperationDiagnostic(expression, libraryOperation)
      return valueType
    }

    const readonlyLibraryOperation = this.compilerLibraryReceiverOperation(
      expression.target.object,
      expression.target.property,
      'member-read'
    )

    if (readonlyLibraryOperation !== null) {
      this.report(
        'INOX_ASSIGN_READONLY_FIELD',
        `cannot assign to readonly field ${expression.target.property}`,
        expression.target.loc
      )
      return valueType
    }

    if (this.reportUnsupportedClassPrototypeAccess(expression.target, false)) {
      return valueType
    }

    if (shape === null || typeof shape === 'undefined') {
      return valueType
    }

    const field = this.resolveExpressionShapeField(expression.target.object, shape, expression.target.property)

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
    expression.target.typeRef = fieldType.typeRef ?? field.typeRef
    expression.target.asyncResultValueType = resolvedValueTypeMetadata(
      field.asyncResultValueType,
      fieldType.asyncResultValueType
    )
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

    const fieldArrayElementType = this.resolvedIterableElementValueType(fieldType)

    if (fieldArrayElementType !== null) {
      this.checkAssignableType(
        this.resolveExpressionArrayElementType(expression.value),
        fieldArrayElementType,
        expression.value.loc,
        false,
        false
      )
    }

    if (
      fieldType.valueType === 'async-result' &&
      fieldType.asyncResultValueType !== null &&
      typeof fieldType.asyncResultValueType !== 'undefined'
    ) {
      this.checkAssignableType(
        this.resolveExpressionAsyncResultValueType(expression.value),
        fieldType.asyncResultValueType,
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
    const receiverShape = this.dynamicOperationReceiverShape(expression.object)
    const libraryOperation = this.compilerLibraryReceiverOperation(expression.object, '', 'index-read')

    if (libraryOperation !== null) {
      const declaredType = this.resolveExpressionIterableElementDeclaredName(expression.object)
      const argInfos = [this.checkedCallArgInfo(expression.index, indexType)]
      this.checkCompilerLibrarySingleArgument(expression.index, indexType, libraryOperation, 0, expression, argInfos)
      this.applyCompilerLibraryOperation(expression, libraryOperation, null, null, argInfos)
      this.refineIndexedArrayElementDeclaredShape(expression, declaredType)
      this.preserveDynamicOperationResultShape(expression, receiverShape)

      if (this.reportCompilerLibraryOperationDiagnostic(expression, libraryOperation)) {
        return 'unknown'
      }

      return (expression.valueType ?? 'unknown') as ValueType
    }

    const optionalChainReceiver = isOptionalChainProtectedExpression(expression.object)

    if (!optionalChainReceiver) {
      this.reportNullableRuntimeAccess(expression.object, nodeSourceLocation(expression))
    }

    if (this.reportUnsupportedClassPrototypeAccess(expression, optionalChainReceiver)) {
      return 'unknown'
    }

    if (expression.index.type !== 'StringLiteral') {
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
            expression.typeRef = fieldType.typeRef ?? field.typeRef
            expression.asyncResultValueType = resolvedValueTypeMetadata(
              field.asyncResultValueType,
              fieldType.asyncResultValueType
            )
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

      if (this.shouldReportUnknownPrimitiveAccess(expression.object, objectType)) {
        this.report('INOX_UNKNOWN_FIELD', 'unknown index operation', expression.loc)
      }
      return 'unknown'
    }

    const shape = this.resolveExpressionShape(expression.object)

    if (shape === null || typeof shape === 'undefined') {
      if (this.shouldReportUnknownPrimitiveAccess(expression.object, objectType)) {
        this.report('INOX_UNKNOWN_FIELD', 'unknown index operation', expression.loc)
      }
      return 'unknown'
    }

    const field = this.resolveExpressionShapeField(expression.object, shape, expression.index.value)

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
    expression.typeRef = fieldType.typeRef ?? field.typeRef
    expression.asyncResultValueType = resolvedValueTypeMetadata(
      field.asyncResultValueType,
      fieldType.asyncResultValueType
    )
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
    const receiverShape = this.dynamicOperationReceiverShape(expression.object)
    const libraryOperation = this.compilerLibraryReceiverOperation(expression.object, '', 'index-read')

    if (libraryOperation !== null) {
      const declaredType = this.resolveExpressionIterableElementDeclaredName(expression.object)
      const argInfos = [this.checkedCallArgInfo(expression.index, indexType)]
      this.checkCompilerLibrarySingleArgument(expression.index, indexType, libraryOperation, 0, expression, argInfos)
      this.applyCompilerLibraryOperation(expression, libraryOperation, null, null, argInfos)
      this.refineIndexedArrayElementDeclaredShape(expression, declaredType)
      this.preserveDynamicOperationResultShape(expression, receiverShape)
      expression.nullable = true
      expression.optionalChainProtected = true

      if (this.reportCompilerLibraryOperationDiagnostic(expression, libraryOperation)) {
        return 'unknown'
      }

      return (expression.valueType ?? 'unknown') as ValueType
    }

    if (this.reportUnsupportedClassPrototypeAccess(expression, true)) {
      return 'unknown'
    }

    if (expression.index.type !== 'StringLiteral') {
      expression.nullable = true
      expression.valueType = 'unknown'

      if (this.shouldReportUnknownPrimitiveAccess(expression.object, objectType)) {
        this.report('INOX_UNKNOWN_FIELD', 'unknown index operation', expression.loc)
      }

      return 'unknown'
    }

    const shape = this.resolveExpressionShape(expression.object)

    if (shape === null || typeof shape === 'undefined') {
      expression.nullable = true
      expression.valueType = 'unknown'
      if (this.shouldReportUnknownPrimitiveAccess(expression.object, objectType)) {
        this.report('INOX_UNKNOWN_FIELD', 'unknown index operation', expression.loc)
      }
      return 'unknown'
    }

    const field = this.resolveExpressionShapeField(expression.object, shape, expression.index.value)

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
    expression.typeRef = fieldType.typeRef ?? field.typeRef
    expression.asyncResultValueType = resolvedValueTypeMetadata(
      field.asyncResultValueType,
      fieldType.asyncResultValueType
    )
    expression.shape = resolvedObjectShapeMetadata(field.shape, fieldType.shape)
    expression.functionType = resolvedFunctionTypeMetadata(field.functionType, fieldType.functionType)
    expression.className = null

    if (field.className !== null && typeof field.className !== 'undefined') {
      expression.className = field.className
    }

    return valueType
  }

  preserveDynamicOperationResultShape(expression: AnyNode, receiverShape: ObjectShapeInfo | null): void {
    if (
      expression.valueType === 'unknown' &&
      (expression.shape === null || typeof expression.shape === 'undefined') &&
      receiverShape?.dynamic === true
    ) {
      expression.shape = receiverShape
    }
  }

  dynamicOperationReceiverShape(receiver: AnyNode): ObjectShapeInfo | null {
    const shape = this.resolveExpressionShape(receiver)

    if (shape?.dynamic === true) {
      return shape
    }

    if (receiver.type !== 'MemberExpression' && receiver.type !== 'OptionalMemberExpression') {
      return null
    }

    const parentShape = this.resolveExpressionShape(receiver.object)

    if (parentShape?.dynamic !== true) {
      return null
    }

    return this.resolveExpressionShapeField(receiver.object, parentShape, receiver.property)?.shape ?? parentShape
  }

  checkIndexAssignment(expression: AnyNode): ValueType {
    const objectType = this.checkExpression(expression.target.object)
    const indexType = this.checkExpression(expression.target.index)
    const valueType = this.checkExpression(expression.value)
    const argInfos = [
      this.checkedCallArgInfo(expression.target.index, indexType),
      this.checkedCallArgInfo(expression.value, valueType)
    ]
    const libraryOperation = this.compilerLibraryReceiverOperation(
      expression.target.object,
      '',
      'index-write',
      argInfos
    )

    if (libraryOperation !== null) {
      this.checkCompilerLibrarySingleArgument(
        expression.target.index,
        indexType,
        libraryOperation,
        0,
        expression,
        argInfos
      )
      this.checkCompilerLibrarySingleArgument(expression.value, valueType, libraryOperation, 1, expression, argInfos)
      this.applyCompilerLibraryOperation(expression, libraryOperation, null, null, argInfos)
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
            expression.target.typeRef = fieldType.typeRef ?? field.typeRef
            expression.target.asyncResultValueType = resolvedValueTypeMetadata(
              field.asyncResultValueType,
              fieldType.asyncResultValueType
            )
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

      if (this.shouldReportUnknownPrimitiveAccess(expression.target.object, objectType)) {
        this.report('INOX_UNKNOWN_FIELD', 'unknown index operation', expression.target.loc)
      }

      return valueType
    }

    const shape = this.resolveExpressionShape(expression.target.object)

    if (shape === null || typeof shape === 'undefined') {
      return valueType
    }

    const field = this.resolveExpressionShapeField(expression.target.object, shape, expression.target.index.value)

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
    expression.target.typeRef = fieldType.typeRef ?? field.typeRef
    expression.target.asyncResultValueType = resolvedValueTypeMetadata(
      field.asyncResultValueType,
      fieldType.asyncResultValueType
    )
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

    const fieldArrayElementType = this.resolvedIterableElementValueType(fieldType)

    if (fieldArrayElementType !== null) {
      this.checkAssignableType(
        this.resolveExpressionArrayElementType(expression.value),
        fieldArrayElementType,
        expression.value.loc,
        false,
        false
      )
    }

    if (
      fieldType.valueType === 'async-result' &&
      fieldType.asyncResultValueType !== null &&
      typeof fieldType.asyncResultValueType !== 'undefined'
    ) {
      this.checkAssignableType(
        this.resolveExpressionAsyncResultValueType(expression.value),
        fieldType.asyncResultValueType,
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

  classMethodMatchesLibraryCheck(expression: AnyNode, check: LibraryObjectMethodCheckDescriptor): boolean {
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

      if (!nodeNameEquals(method, check.name)) {
        continue
      }

      const params: OptionalParamInfo[] = []

      for (let paramIndex = 0; paramIndex < method.params.length; paramIndex = paramIndex + 1) {
        const param = checkerNodeAt(method.params, paramIndex)

        params.push(this.resolveParam(param))
      }

      const returnInfo = this.resolveDeclaredType(method.returnType, method.loc)

      return (
        check.returnValueTypes.includes(returnInfo.valueType) &&
        acceptsArgumentCount(params, check.minArgs) &&
        acceptsArgumentCount(params, check.maxArgs)
      )
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

    const classMethodType = this.checkClassMethodCall(expression)

    if (classMethodType !== null && typeof classMethodType !== 'undefined') {
      return classMethodType
    }

    this.inferCalledFunctionReturn(expression.callee)
    this.checkExpression(expression.callee)
    const symbol = this.getCallableSymbol(expression.callee)
    const argInfos = this.checkedCallArgInfos(expression, symbol)

    if (symbol === null || typeof symbol === 'undefined') {
      return 'unknown'
    }

    const valueType = applyCallableSymbolCallInContext(this.callableSymbolContext(), expression, symbol, argInfos)
    expression.declaredType = symbol.declaredReturnType ?? null
    return valueType
  }

  checkCompilerLibraryCallOperation(
    expression: AnyNode,
    contextualResult: ResolvedTypeInfo | null = null
  ): ValueType | null {
    let operation = this.compilerLibraryOperationForExpression(expression.callee, 'call')

    if (
      operation === null &&
      (expression.callee.type === 'MemberExpression' || expression.callee.type === 'OptionalMemberExpression')
    ) {
      this.checkExpression(expression.callee.object)
      operation = this.compilerLibraryReceiverOperation(expression.callee.object, expression.callee.property, 'call')
    }

    if (operation === null) {
      return null
    }

    const declaredSymbol = this.compilerLibraryDeclarationCallableSymbol(expression.callee, operation)
    const variant = this.compilerLibraryOperationVariant(expression, operation)

    this.checkCompilerLibraryOperationTypeArgumentCount(expression, operation)
    this.applyCompilerLibraryOperation(expression, operation, variant, contextualResult)

    if (this.reportCompilerLibraryOperationDiagnostic(expression, operation)) {
      this.checkedCallArgInfos(expression)
      return 'unknown'
    }

    const argInfos = this.checkCompilerLibraryOperationArguments(expression, operation, variant, null, contextualResult)
    let declaredType: ValueType | null = null

    if (declaredSymbol !== null) {
      declaredType = applyCallableSymbolCallInContext(
        this.callableSymbolContext(),
        expression,
        declaredSymbol,
        argInfos
      )
    }

    this.applyCompilerLibraryOperation(expression, operation, variant, contextualResult, argInfos)

    if (expression.callee.type === 'OptionalMemberExpression') {
      expression.nullable = true
      expression.optionalChainProtected = true
    }

    this.checkCompilerLibraryOptionConstraints(expression, operation)
    this.applyCompilerLibraryResultInference(expression, operation, variant, contextualResult)

    return typeof expression.valueType === 'string' ? (expression.valueType as ValueType) : (declaredType ?? 'unknown')
  }

  applyCompilerLibraryResultInference(
    expression: AnyNode,
    operation: LibraryOperationDescriptor,
    variant: LibraryOperationVariantDescriptor | null,
    contextualResult: ResolvedTypeInfo | null
  ): void {
    const inference = variant?.resultInference ?? operation.resultInference

    if (inference === null || typeof inference === 'undefined') {
      return
    }

    const cResultMapping = variant?.cResultMapping ?? operation.cResultMapping ?? null

    if (contextualResult !== null && inference.contextualValueTypes.includes(contextualResult.valueType)) {
      this.applyCompilerLibraryContextualResult(expression, contextualResult, cResultMapping, inference)
      return
    }

    const argument = compilerLibraryCallArgument(expression, inference.argumentIndex)

    if (argument === null || argument.type !== 'StringLiteral') {
      return
    }

    if (this.libraryLiteralTypeInference === null || typeof this.libraryLiteralTypeInference === 'undefined') {
      return
    }

    const inferredTypeRef = this.libraryLiteralTypeInference(inference.literalProviderId, argument.value)

    if (inferredTypeRef === null) {
      return
    }

    this.applyCompilerLibraryTypeRef(expression, inferredTypeRef, cResultMapping)
    this.applyCompilerLibraryDynamicObjectShapes(expression, inference)
  }

  applyCompilerLibraryContextualResult(
    expression: AnyNode,
    contextualResult: ResolvedTypeInfo,
    cResultMapping: LibraryCResultMappingDescriptor | null,
    inference: LibraryResultInferenceDescriptor
  ): void {
    if (contextualResult.typeRef !== null) {
      this.applyCompilerLibraryTypeRef(expression, contextualResult.typeRef, cResultMapping)
    } else {
      expression.valueType = contextualResult.valueType
      expression.nullable = contextualResult.nullable
      expression.typeRef = null
      expression.shape = contextualResult.shape
      expression.asyncResultValueType = contextualResult.asyncResultValueType
      expression.libraryCppType = cResultMapping?.cppType ?? expression.libraryCppType ?? null
      this.applyCompilerLibraryCResultShapeFields(expression)
    }

    this.applyCompilerLibraryDynamicObjectShapes(expression, inference)
  }

  applyCompilerLibraryDynamicObjectShapes(expression: AnyNode, inference: LibraryResultInferenceDescriptor): void {
    if (inference.dynamicObjectShapes !== true) {
      return
    }

    if (expression.shape === null || typeof expression.shape === 'undefined') {
      expression.shape = {
        kind: 'object',
        dynamic: true,
        fields: []
      }
    } else {
      markObjectShapeDynamic(expression.shape)
    }
  }

  compilerLibraryDeclarationCallableSymbol(callee: AnyNode, operation: LibraryOperationDescriptor): SymbolInfo | null {
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

    if (root.libraryId !== operation.libraryId) {
      return null
    }

    if (root.kind === 'class' && path.length === 2) {
      return this.compilerLibraryDeclaredStaticMethodSymbol(root, path[1])
    }

    if (path.length === 1) {
      return this.getCallableSymbol(callee)
    }

    return this.compilerLibraryDeclaredMemberCallableSymbol(root, path, nodeSourceLocation(callee))
  }

  compilerLibraryDeclaredMemberCallableSymbol(
    root: SymbolInfo,
    path: string[],
    loc: SourceLocation
  ): SymbolInfo | null {
    let shape = root.shape ?? null

    if (shape === null && typeof root.declaredType === 'string') {
      shape = this.resolveDeclaredType(root.declaredType, loc).shape
    }

    for (let index = 1; index < path.length; index = index + 1) {
      if (shape === null) {
        return null
      }

      const field = this.findShapeField(shape, path[index])

      if (field === null) {
        return null
      }

      const fieldType = this.resolveFieldDeclaredType(field)

      if (index < path.length - 1) {
        shape = resolvedObjectShapeMetadata(field.shape, fieldType.shape)
        continue
      }

      const functionOverloads: FunctionTypeMetadata[] = field.functionOverloads ?? []

      if (functionOverloads.length > 0) {
        const overloads: SymbolInfo[] = []

        for (const functionType of functionOverloads) {
          overloads.push(this.callableSymbolFromFunctionType(functionType, field.loc))
        }

        const symbol = overloads[0]
        symbol.overloads = overloads
        return symbol
      }

      const functionType = resolvedFunctionTypeMetadata(field.functionType, fieldType.functionType)

      if (functionType === null) {
        return null
      }

      return this.callableSymbolFromFunctionType(functionType, field.loc)
    }

    return null
  }

  compilerLibraryDeclaredStaticMethodSymbol(root: SymbolInfo, name: string): SymbolInfo | null {
    const methods = root.classMethods ?? []
    const overloads: SymbolInfo[] = []

    for (let index = 0; index < methods.length; index = index + 1) {
      const method = checkerNodeAt(methods, index)

      if (method.static === true && method.name === name) {
        overloads.push(this.importedFunctionDeclarationSymbol(method, nodeSourceLocation(method)))
      }
    }

    const first = overloads[0]

    if (first === null || typeof first === 'undefined') {
      return null
    }

    first.overloads = overloads
    return first
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

  constructorCallableSymbolForExpression(symbol: SymbolInfo, expression: AnyNode): SymbolInfo | null {
    const typeParameters = symbol.typeParameters ?? []

    if (typeParameters.length === 0) {
      return this.constructorCallableSymbol(symbol)
    }

    const typeArguments: string[] = expression.typeArguments ?? []

    if (typeArguments.length !== typeParameters.length) {
      this.report(
        'INOX_TYPE_ARGUMENT_COUNT',
        `generic class ${expression.callee.path[0]} expects ${typeParameters.length} type argument(s), got ${typeArguments.length}`,
        expression.loc
      )
      return null
    }

    const state = this.pushInstantiatedTypeParameters(typeParameters, typeArguments, nodeSourceLocation(expression))

    try {
      const templates = symbol.constructorParamTemplates ?? []
      const overloads: SymbolInfo[] = []

      for (let index = 0; index < templates.length; index = index + 1) {
        overloads.push({
          kind: 'function',
          valueType: 'function',
          params: this.resolveParams(templates[index]),
          returnType: 'object',
          returnShape: symbol.shape ?? null,
          loc: symbol.constructorOverloads?.[index]?.loc ?? expression.loc
        })
      }

      const first = overloads[0]

      if (first === null || typeof first === 'undefined') {
        return null
      }

      return { ...first, overloads }
    } finally {
      this.restoreFunctionTypeParameters(state)
    }
  }

  pushInstantiatedTypeParameters(
    typeParameters: AnyNode[],
    typeArguments: string[],
    loc: SourceLocation
  ): CheckerTypeParameterState[] {
    const resolvedArguments: ResolvedTypeInfo[] = []

    for (let index = 0; index < typeArguments.length; index = index + 1) {
      resolvedArguments.push(this.resolveDeclaredType(typeArguments[index], loc))
    }

    const state: CheckerTypeParameterState[] = []

    for (let index = 0; index < typeParameters.length; index = index + 1) {
      const name: string = typeParameters[index].name
      state.push({
        name,
        previousType: this.types.get(name) ?? null,
        previousResolvedType: this.resolvedDeclaredTypes.get(name) ?? null
      })
      this.types.set(name, { kind: 'alias', valueType: 'unknown' })
      this.resolvedDeclaredTypes.set(name, resolvedArguments[index])
    }

    return state
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

        if (argument === null || typeof argument === 'undefined') {
          continue
        }

        if (literals.length > 0 && (argument.type !== 'StringLiteral' || !literals.includes(argument.value))) {
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

  checkCompilerLibraryOperationTypeArgumentCount(expression: AnyNode, operation: LibraryOperationDescriptor): void {
    const typeArguments: string[] = expression.typeArguments ?? []

    if (typeArguments.length === 0) {
      return
    }

    const expected = operation.typeParameters?.length ?? 0

    if (typeArguments.length !== expected) {
      this.report(
        'INOX_TYPE_ARG_COUNT',
        `library operation ${operation.operationId} expects ${expected} type argument(s), got ${typeArguments.length}`,
        expression.loc
      )
    }
  }

  checkCompilerLibraryOperationArguments(
    expression: AnyNode,
    operation: LibraryOperationDescriptor,
    variant: LibraryOperationVariantDescriptor | null = null,
    knownArgInfos: CheckedCallArgInfo[] | null = null,
    contextualResult: ResolvedTypeInfo | null = null
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
    const argInfos: CheckedCallArgInfo[] = knownArgInfos ?? []

    if (knownArgInfos === null) {
      for (let index = 0; index < expression.args.length; index = index + 1) {
        const argument = expression.args[index]
        const check = checks[index]
        const contextualCallback =
          argument.type === 'ArrowFunctionExpression' &&
          check !== null &&
          typeof check !== 'undefined' &&
          check.functionParameters !== null &&
          typeof check.functionParameters !== 'undefined'

        argInfos.push(this.checkedCallArgInfo(argument, contextualCallback ? 'function' : undefined))
      }
    }

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
          this.compilerLibraryCallbackFunctionType(
            check,
            argument.loc,
            operation,
            expression,
            contextualResult,
            argInfos
          ),
          check.functionAsync === false ? check.functionAsyncDiagnosticCode : null,
          check.functionAsync === false ? check.functionAsyncDiagnosticMessage : null
        )
        argInfos[index] = this.checkedCallArgInfo(argument, 'function')
      }
    }

    for (let index = 0; index < checks.length && index < argInfos.length; index = index + 1) {
      const check = checks[index]
      const info = argInfos[index]
      const argument = expression.args[index]
      const typeRefTemplate = check.typeRef
      let runtimeCallbackFunctionType: AnyNode | null = null

      if (check.functionParameters !== null && typeof check.functionParameters !== 'undefined') {
        runtimeCallbackFunctionType = this.compilerLibraryCallbackFunctionType(
          check,
          argument.loc,
          operation,
          expression,
          contextualResult,
          argInfos
        )
        const actualFunctionType = argument.functionType

        if (
          (runtimeCallbackFunctionType.returnType === null ||
            typeof runtimeCallbackFunctionType.returnType === 'undefined') &&
          actualFunctionType !== null &&
          typeof actualFunctionType !== 'undefined'
        ) {
          runtimeCallbackFunctionType = {
            ...runtimeCallbackFunctionType,
            returnType: actualFunctionType.returnType,
            declaredReturnType: actualFunctionType.declaredReturnType ?? null,
            returnTypeRef: actualFunctionType.returnTypeRef ?? null,
            returnNullable: actualFunctionType.returnNullable === true,
            returnAsyncResultValueType: actualFunctionType.returnAsyncResultValueType ?? null,
            returnShape: actualFunctionType.returnShape ?? null
          }
        }

        argument.libraryRuntimeCallbackFunctionType = runtimeCallbackFunctionType
      }

      if (typeRefTemplate !== null && typeof typeRefTemplate !== 'undefined') {
        const libraries = resolveCompilerLibrarySet(this.options.libraries)
        let expectedTypeRef = typeRefTemplate

        if ((operation.typeParameters ?? []).length > 0) {
          expectedTypeRef = instantiateLibraryOperationTypeRef(
            operation,
            typeRefTemplate,
            this.compilerLibraryOperationTypeRefContext(expression, contextualResult, argInfos),
            libraries
          )
        }
        const expected = typeRefCompatibilityMetadata(expectedTypeRef, libraries, info.loc)

        this.checkAssignableType(info.valueType, expected.valueType, info.loc, expected.nullable, info.nullable)
        this.checkAssignableLibraryNativeType(info.shape, expected.shape, info.loc, info.valueType)
      }

      if (
        argument.type !== 'ArrowFunctionExpression' &&
        check.functionParameters !== null &&
        typeof check.functionParameters !== 'undefined' &&
        this.checkCompilerLibraryNamedCallbackArgument(argument, check, runtimeCallbackFunctionType)
      ) {
        continue
      }

      if (
        (typeRefTemplate === null || typeof typeRefTemplate === 'undefined') &&
        !check.valueTypes.includes(info.valueType)
      ) {
        this.report(
          'INOX_TYPE_MISMATCH',
          `library operation ${operation.operationId} does not accept ${info.valueType}`,
          info.loc
        )
        continue
      }

      if (info.valueType === 'object') {
        const methodChecks = check.objectMethods ?? []

        for (let methodIndex = 0; methodIndex < methodChecks.length; methodIndex = methodIndex + 1) {
          const methodCheck = methodChecks[methodIndex]

          if (!this.classMethodMatchesLibraryCheck(argument, methodCheck)) {
            this.report(
              'INOX_TYPE_MISMATCH',
              `library operation ${operation.operationId} requires object method ${methodCheck.name}`,
              info.loc
            )
          }
        }
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

      this.checkCompilerLibraryStringPrefixOptionConstraints(argument, check)

      if (check.arrayLiteralRequired === true && argument.type !== 'ArrayLiteral') {
        const libraries = resolveCompilerLibrarySet(this.options.libraries)
        const providerType = compilerLibraryNativeTypeForIntrinsic(libraries, 'array-literal', 'construct')
        const argumentTypeId = info.typeRef.kind === 'nominal' ? info.typeRef.typeId : info.shape?.libraryTypeId

        if (
          providerType !== null &&
          compilerLibraryNativeTypeIsAssignable(libraries, argumentTypeId, providerType.typeId)
        ) {
          this.report(
            'INOX_NOT_IMPLEMENTED',
            `library operation ${operation.operationId} currently requires an array literal argument`,
            info.loc
          )
        }
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

      if (fieldValueType !== null && typeof fieldValueType !== 'undefined') {
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
    check: LibraryArgumentCheckDescriptor,
    expectedFunctionType: AnyNode | null
  ): boolean {
    const symbol = this.getCallableSymbol(argument)

    if (symbol === null || typeof symbol === 'undefined') {
      return false
    }

    const actualAsync = symbol.async === true || symbol.returnType === 'async-result'

    if (check.functionAsync === false && actualAsync) {
      this.report(
        check.functionAsyncDiagnosticCode ?? 'INOX_ASYNC_CALLBACK',
        check.functionAsyncDiagnosticMessage ?? 'async callbacks are not supported by this library operation',
        argument.loc
      )
      return true
    }

    const parameters = check.functionParameters ?? []

    if (symbol.params !== null && typeof symbol.params !== 'undefined' && symbol.params.length > parameters.length) {
      this.report(
        'INOX_ARG_COUNT',
        `function callback expects at most ${parameters.length} parameter(s), got ${symbol.params.length}`,
        argument.loc
      )
    }

    const expectedReturnType = expectedFunctionType?.returnType ?? check.functionReturnType

    if (
      expectedReturnType !== null &&
      typeof expectedReturnType !== 'undefined' &&
      symbol.returnType !== null &&
      typeof symbol.returnType !== 'undefined'
    ) {
      this.checkAssignableType(
        symbol.returnType,
        expectedReturnType,
        argument.loc,
        expectedFunctionType?.returnNullable === true,
        symbol.returnNullable === true
      )
    }

    return false
  }

  compilerLibraryCallbackFunctionType(
    check: LibraryArgumentCheckDescriptor,
    loc: SourceLocation | null | undefined,
    operation: LibraryOperationDescriptor,
    expression: AnyNode,
    contextualResult: ResolvedTypeInfo | null,
    argInfos: CheckedCallArgInfo[] | null
  ): AnyNode {
    const parameters = check.functionParameters ?? []
    const params: AnyNode[] = []
    const libraries = resolveCompilerLibrarySet(this.options.libraries)
    const callbackLoc = loc ?? { line: 1, column: 1 }

    for (let index = 0; index < parameters.length; index = index + 1) {
      const parameter = parameters[index]
      const nativeType =
        parameter.resultTypeId === null || typeof parameter.resultTypeId === 'undefined'
          ? null
          : compilerLibraryNativeTypeForId(libraries, parameter.resultTypeId)
      const fields = parameter.shapeFields ?? nativeType?.fields ?? []
      const shapeFields: AnyNode[] = []

      for (let fieldIndex = 0; fieldIndex < fields.length; fieldIndex = fieldIndex + 1) {
        shapeFields.push(this.compilerLibraryResultShapeField(fields[fieldIndex], callbackLoc))
      }

      const param: AnyNode = {
        name: parameter.name,
        valueType: parameter.valueType,
        nullable: parameter.nullable === true,
        loc: callbackLoc
      }
      const parameterTypeRefTemplate = parameter.typeRef

      if (parameterTypeRefTemplate !== null && typeof parameterTypeRefTemplate !== 'undefined') {
        let parameterTypeRef = parameterTypeRefTemplate

        if ((operation.typeParameters ?? []).length > 0) {
          parameterTypeRef = instantiateLibraryOperationTypeRef(
            operation,
            parameterTypeRefTemplate,
            this.compilerLibraryOperationTypeRefContext(expression, contextualResult, argInfos),
            libraries
          )
        }

        this.applyCompilerLibraryTypeRef(param, parameterTypeRef, null)
      }

      if (
        (parameterTypeRefTemplate === null || typeof parameterTypeRefTemplate === 'undefined') &&
        parameter.resultTypeId !== null &&
        typeof parameter.resultTypeId !== 'undefined'
      ) {
        param.shape = {
          kind: 'object',
          fields: shapeFields,
          libraryCValueAdapter: nativeType?.cValueAdapter ?? null,
          libraryTypeId: parameter.resultTypeId,
          libraryCppType: nativeType?.cppType ?? null
        }
      } else if (
        (parameterTypeRefTemplate === null || typeof parameterTypeRefTemplate === 'undefined') &&
        shapeFields.length > 0
      ) {
        param.shape = {
          kind: 'object',
          fields: shapeFields
        }
      }

      params.push(param)
    }

    const functionType: AnyNode = {
      kind: 'function',
      resolved: true,
      params,
      returnType: check.functionReturnType ?? null,
      returnTypeRef: null,
      returnNullable: false,
      returnAsyncResultValueType: null,
      returnShape: null
    }
    const returnTypeRefTemplate = check.functionReturnTypeRef

    if (returnTypeRefTemplate !== null && typeof returnTypeRefTemplate !== 'undefined') {
      let returnTypeRef = returnTypeRefTemplate

      if ((operation.typeParameters ?? []).length > 0) {
        returnTypeRef = instantiateLibraryOperationTypeRef(
          operation,
          returnTypeRefTemplate,
          this.compilerLibraryOperationTypeRefContext(expression, contextualResult, argInfos),
          libraries
        )
      }

      const metadata = typeRefCompatibilityMetadata(returnTypeRef, libraries, callbackLoc)
      functionType.returnType = metadata.valueType
      functionType.returnTypeRef = returnTypeRef
      functionType.returnNullable = metadata.nullable
      functionType.returnAsyncResultValueType = metadata.asyncResultValueType
      functionType.returnShape = metadata.shape
    }

    return functionType
  }

  compilerLibraryObjectFieldMatches(argument: AnyNode, fieldName: string, booleanLiterals: boolean[]): boolean {
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

      if (field.objectLiteralRequired === true && property.value.type !== 'ObjectLiteral') {
        this.report(
          'INOX_NOT_IMPLEMENTED',
          `library operation ${operation.operationId} option ${field.name} currently requires an object literal`,
          property.value.loc
        )
      }

      const objectFieldValueType = field.objectFieldValueType

      if (objectFieldValueType !== null && typeof objectFieldValueType !== 'undefined') {
        this.checkCompilerLibraryObjectFieldValueTypes(property.value, objectFieldValueType)
      }

      const objectTypeIds = field.objectTypeIds ?? []

      if (objectTypeIds.length > 0) {
        const shape = this.resolveExpressionShape(property.value)
        const objectTypeId = shape?.libraryTypeId
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
            `library operation ${operation.operationId} option ${field.name} does not accept this object type`,
            property.value.loc
          )
        }
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

  checkCompilerLibraryObjectFieldValueTypes(argument: AnyNode, expectedValueType: string): void {
    if (argument.type === 'ObjectLiteral') {
      const properties: CheckerObjectPropertyNode[] = argument.properties

      for (let fieldIndex = 0; fieldIndex < properties.length; fieldIndex = fieldIndex + 1) {
        const property = properties[fieldIndex]
        const actual = this.checkExpression(property.value)
        this.checkAssignableType(
          actual,
          expectedValueType,
          property.value.loc,
          false,
          this.expressionCanBeNull(property.value)
        )
      }

      return
    }

    const shape = this.resolveExpressionShape(argument)

    if (shape === null || typeof shape === 'undefined') {
      return
    }

    for (let fieldIndex = 0; fieldIndex < shape.fields.length; fieldIndex = fieldIndex + 1) {
      const field = shape.fields[fieldIndex]
      const resolved = this.resolveFieldDeclaredType(field)
      this.checkAssignableType(resolved.valueType, expectedValueType, argument.loc, false, resolved.nullable)
    }
  }

  checkCompilerLibraryStringPrefixOptionConstraints(argument: AnyNode, check: LibraryArgumentCheckDescriptor): void {
    if (argument.type !== 'StringLiteral') {
      return
    }

    const constraints = check.stringPrefixOptionConstraints ?? []

    for (let constraintIndex = 0; constraintIndex < constraints.length; constraintIndex = constraintIndex + 1) {
      const constraint = constraints[constraintIndex]
      let matches = false

      for (let prefixIndex = 0; prefixIndex < constraint.prefixes.length; prefixIndex = prefixIndex + 1) {
        if (argument.value.slice(0, constraint.prefixes[prefixIndex].length) === constraint.prefixes[prefixIndex]) {
          matches = true
          break
        }
      }

      if (!matches) {
        continue
      }

      if (!this.compilerLibraryOptionConstraintAllows(constraint)) {
        this.report(constraint.diagnosticCode, constraint.diagnosticMessage, argument.loc)
      }
    }
  }

  checkCompilerLibraryOptionConstraints(expression: AnyNode, operation: LibraryOperationDescriptor): void {
    const libraries = resolveCompilerLibrarySet(this.options.libraries)

    for (
      let requirementIndex = 0;
      requirementIndex < operation.runtimeRequirements.length;
      requirementIndex = requirementIndex + 1
    ) {
      const requirementId = operation.runtimeRequirements[requirementIndex]

      for (
        let descriptorIndex = 0;
        descriptorIndex < libraries.runtimeRequirements.length;
        descriptorIndex = descriptorIndex + 1
      ) {
        const requirement = libraries.runtimeRequirements[descriptorIndex]

        if (requirement.id !== requirementId) {
          continue
        }

        const constraints = requirement.optionConstraints ?? []

        for (let constraintIndex = 0; constraintIndex < constraints.length; constraintIndex = constraintIndex + 1) {
          const constraint = constraints[constraintIndex]

          if (!this.compilerLibraryOptionConstraintAllows(constraint)) {
            this.report(constraint.diagnosticCode, constraint.diagnosticMessage, expression.loc)
          }
        }
      }
    }
  }

  compilerLibraryOptionConstraintAllows(constraint: LibraryOptionConstraintDescriptor): boolean {
    const libraries = resolveCompilerLibrarySet(this.options.libraries)
    const actual = resolveCompilerLibraryOptionValue(libraries, this.options.libraryOptions, constraint.optionId)

    if (actual === null) {
      return false
    }

    for (let index = 0; index < constraint.allowedValues.length; index = index + 1) {
      if (compilerLibraryOptionScalarsEqual(actual, constraint.allowedValues[index])) {
        return true
      }
    }

    return false
  }

  checkCompilerLibrarySingleArgument(
    expression: AnyNode,
    valueType: ValueType,
    operation: LibraryOperationDescriptor,
    argumentIndex: number = 0,
    operationExpression: AnyNode = expression,
    argInfos: CheckedCallArgInfo[] | null = null
  ): void {
    const check = operation.argumentChecks?.[argumentIndex]

    if (check === null || typeof check === 'undefined') {
      return
    }

    const info = argInfos?.[argumentIndex] ?? this.checkedCallArgInfo(expression, valueType)
    const typeRefTemplate = check.typeRef

    if (typeRefTemplate !== null && typeof typeRefTemplate !== 'undefined') {
      const libraries = resolveCompilerLibrarySet(this.options.libraries)
      let expectedTypeRef = typeRefTemplate

      if ((operation.typeParameters ?? []).length > 0) {
        expectedTypeRef = instantiateLibraryOperationTypeRef(
          operation,
          typeRefTemplate,
          this.compilerLibraryOperationTypeRefContext(operationExpression, null, argInfos ?? [info]),
          libraries
        )
      }

      const expected = typeRefCompatibilityMetadata(expectedTypeRef, libraries, info.loc)

      this.checkAssignableType(info.valueType, expected.valueType, info.loc, expected.nullable, info.nullable)
      this.checkAssignableLibraryNativeType(info.shape, expected.shape, info.loc, info.valueType)
      return
    }

    if (!check.valueTypes.includes(info.valueType)) {
      this.report(
        'INOX_TYPE_MISMATCH',
        `library operation ${operation.operationId} does not accept ${info.valueType}`,
        expression.loc
      )
    }
  }

  applyCompilerLibraryMemberOperation(expression: AnyNode): ValueType | null {
    let operation = this.compilerLibraryOperationForExpression(expression, 'member-read')

    if (
      operation === null &&
      (expression.type === 'MemberExpression' || expression.type === 'OptionalMemberExpression')
    ) {
      this.checkExpression(expression.object)
      operation = this.compilerLibraryReceiverOperation(expression.object, expression.property, 'member-read')
    }

    if (operation !== null) {
      this.applyCompilerLibraryOperation(expression, operation)

      if (this.reportCompilerLibraryOperationDiagnostic(expression, operation)) {
        return 'unknown'
      }

      const valueType = expression.valueType

      if (typeof valueType === 'string') {
        return valueType as ValueType
      }
    }

    return null
  }

  compilerLibraryReceiverOperation(
    receiver: AnyNode,
    memberName: string,
    kind: LibraryOperationKind,
    unknownReceiverArgInfos: CheckedCallArgInfo[] | null = null
  ): LibraryOperationDescriptor | null {
    const shape = this.resolveExpressionShape(receiver)
    let receiverTypeId = shape?.libraryTypeId ?? null
    let unknownReceiver = false

    if (receiverTypeId === null) {
      const typeRef = this.compilerLibraryExpressionTypeRef(receiver)

      if (typeRef.kind === 'primitive') {
        receiverTypeId = compilerLibraryPrimitiveReceiverTypeId(typeRef.name)
      } else if (typeRef.kind === 'nominal') {
        receiverTypeId = typeRef.typeId
      } else if (typeRef.kind === 'unknown') {
        unknownReceiver = true
      }
    }

    if (receiverTypeId === null && !unknownReceiver) {
      return null
    }

    const libraries = resolveCompilerLibrarySet(this.options.libraries)
    const operation = compilerLibraryOperationForReceiver(libraries, receiverTypeId, memberName, kind)

    if (
      receiverTypeId === null &&
      operation !== null &&
      operation.acceptsUnknownReceiver === true &&
      unknownReceiverArgInfos !== null &&
      !this.compilerLibraryUnknownReceiverOperationAcceptsArguments(operation, unknownReceiverArgInfos, libraries)
    ) {
      return null
    }

    return operation
  }

  compilerLibraryUnknownReceiverOperationAcceptsArguments(
    operation: LibraryOperationDescriptor,
    argInfos: CheckedCallArgInfo[],
    libraries: CompilerLibrarySet
  ): boolean {
    const checks = operation.argumentChecks ?? []

    for (let index = 0; index < checks.length && index < argInfos.length; index = index + 1) {
      const check = checks[index]
      const info = argInfos[index]
      const typeRef = check.typeRef

      if (typeRef !== null && typeof typeRef !== 'undefined') {
        if (typeRef.kind === 'parameter') {
          continue
        }

        const expected = typeRefCompatibilityMetadata(typeRef, libraries, info.loc)

        if (!isAssignableType(info.valueType, expected.valueType, expected.nullable, info.nullable)) {
          return false
        }

        const expectedTypeId = expected.shape?.libraryTypeId
        const actualTypeId = info.shape?.libraryTypeId

        if (
          typeof expectedTypeId === 'string' &&
          typeof actualTypeId === 'string' &&
          !compilerLibraryNativeTypeIsAssignable(libraries, actualTypeId, expectedTypeId)
        ) {
          return false
        }

        continue
      }

      if (check.valueTypes.length > 0 && !check.valueTypes.includes(info.valueType)) {
        return false
      }
    }

    return true
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
      return null
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
    variant: LibraryOperationVariantDescriptor | null = null,
    contextualResult: ResolvedTypeInfo | null = null,
    argInfos: CheckedCallArgInfo[] | null = null
  ): void {
    const libraries = resolveCompilerLibrarySet(this.options.libraries)
    const runtimeRequirements = variant?.runtimeRequirements ?? operation.runtimeRequirements
    const capabilities = compilerLibraryCapabilities(libraries, runtimeRequirements, this.options.libraryOptions)

    if (operation.acceptsUnknownReceiver === true) {
      const receiver = this.compilerLibraryOperationReceiverExpression(expression)
      const receiverTypeId = operation.receiverTypeId
      const currentTypeRef: TypeRef | null = receiver?.typeRef ?? null

      if (
        receiver !== null &&
        typeof receiverTypeId === 'string' &&
        (currentTypeRef === null || currentTypeRef.kind === 'unknown')
      ) {
        const nativeType = compilerLibraryNativeTypeForId(libraries, receiverTypeId)

        if (nativeType !== null) {
          const typeArguments: TypeRef[] = []

          for (let index = 0; index < (nativeType.typeParameters ?? []).length; index = index + 1) {
            typeArguments.push(this.compilerLibraryUnknownTypeRef())
          }

          const receiverTypeRef = instantiateNativeTypeRef(nativeType, typeArguments)
          const narrowingKey = nullableNarrowingKey(receiver)

          this.applyCompilerLibraryTypeRef(receiver, receiverTypeRef, null)

          if (narrowingKey !== null && typeof receiver.valueType === 'string') {
            this.narrowedValueTypes.set(narrowingKey, receiver.valueType as ValueType)
            this.narrowedTypeRefs.set(narrowingKey, receiverTypeRef)
          }
        }
      }
    }

    expression.libraryBindingId = operation.bindingId
    expression.libraryOperationId = operation.operationId
    expression.libraryAsyncResultOperation = operation.asyncResultOperation ?? null
    expression.libraryCAsyncFulfillExpression = operation.cAsyncFulfillExpression ?? null
    expression.libraryCAsyncRejectExpression = operation.cAsyncRejectExpression ?? null
    expression.libraryArgumentNarrowing = operation.argumentNarrowing ?? null
    expression.libraryIntrinsicRole = compilerLibraryIntrinsicRoleForBinding(libraries, operation.bindingId)
    expression.libraryRuntimeRequirements = runtimeRequirements
    expression.libraryCapabilities = capabilities
    expression.libraryCExpression = variant?.cExpression ?? operation.cExpression ?? null
    expression.libraryCClassFormatExpression =
      variant?.cClassFormatExpression ?? operation.cClassFormatExpression ?? null
    const cArgumentKinds = variant?.cArgumentKinds ?? operation.cArgumentKinds

    if (cArgumentKinds !== null && typeof cArgumentKinds !== 'undefined') {
      expression.libraryCArgumentKinds = cArgumentKinds
    }

    const cArgumentAdapters = variant?.cArgumentAdapters ?? operation.cArgumentAdapters

    if (cArgumentAdapters !== null && typeof cArgumentAdapters !== 'undefined') {
      expression.libraryCArgumentAdapters = cArgumentAdapters
    }

    const cArgumentAdapterTypeIds = variant?.cArgumentAdapterTypeIds ?? operation.cArgumentAdapterTypeIds

    if (cArgumentAdapterTypeIds !== null && typeof cArgumentAdapterTypeIds !== 'undefined') {
      expression.libraryCArgumentAdapterTypeIds = cArgumentAdapterTypeIds
    }

    const cArgumentMethodNames = variant?.cArgumentMethodNames ?? operation.cArgumentMethodNames

    if (cArgumentMethodNames !== null && typeof cArgumentMethodNames !== 'undefined') {
      expression.libraryCArgumentMethodNames = cArgumentMethodNames
    }

    const cArgumentSources = variant?.cArgumentSources ?? operation.cArgumentSources

    if (cArgumentSources !== null && typeof cArgumentSources !== 'undefined') {
      expression.libraryCArgumentSources = cArgumentSources
    }

    expression.libraryCResultMode = variant?.cResultMode ?? operation.cResultMode ?? null
    expression.libraryCReceiverAdapter =
      variant?.cReceiverAdapter ?? operation.cReceiverAdapter ?? this.compilerLibraryDefaultReceiverAdapter(operation)
    expression.libraryCResultAdapter = variant?.cResultAdapter ?? operation.cResultAdapter ?? null
    expression.libraryCallbackLifetime = variant?.callbackLifetime ?? operation.callbackLifetime ?? null

    const resultTypeRefTemplate = variant?.resultTypeRef ?? operation.resultTypeRef

    if (resultTypeRefTemplate !== null && typeof resultTypeRefTemplate !== 'undefined') {
      const cResultMapping = variant?.cResultMapping ?? operation.cResultMapping ?? null
      let resultTypeRef = resultTypeRefTemplate

      if ((operation.typeParameters ?? []).length > 0) {
        resultTypeRef = instantiateLibraryOperationTypeRef(
          operation,
          resultTypeRefTemplate,
          this.compilerLibraryOperationTypeRefContext(expression, contextualResult, argInfos),
          libraries
        )
      }
      this.applyCompilerLibraryTypeRef(expression, resultTypeRef, cResultMapping)
    }

    expression.libraryConstantValue = operation.constantValue ?? null
    expression.libraryReceiverTypeId = operation.receiverTypeId ?? null
    expression.libraryCCallStyle = operation.cCallStyle ?? null
    expression.libraryCFailureMode = operation.cFailureMode ?? null
    expression.libraryCPreservesPendingException = operation.cPreservesPendingException === true
  }

  compilerLibraryDefaultReceiverAdapter(operation: LibraryOperationDescriptor): string | null {
    const receiverTypeId = operation.receiverTypeId

    if (receiverTypeId === null || typeof receiverTypeId === 'undefined') {
      return null
    }

    const nativeType = compilerLibraryNativeTypeForId(resolveCompilerLibrarySet(this.options.libraries), receiverTypeId)

    if (
      nativeType === null ||
      nativeType.cppType.length === 0 ||
      nativeType.cppType === 'inox::Value' ||
      nativeType.cppType === 'inox_value'
    ) {
      return null
    }

    return `${nativeType.cppType}($value)`
  }

  applyCompilerLibraryTypeRef(
    expression: AnyNode,
    resultTypeRef: TypeRef,
    cResultMapping: LibraryCResultMappingDescriptor | null
  ): void {
    applyTypeRefMetadataToExpression(this.declaredTypeContext(), expression, resultTypeRef, cResultMapping)
  }

  applyCompilerLibraryCResultShapeFields(expression: AnyNode): void {
    const shapeFields = expression.shape?.fields ?? []
    const cResultShapeFields: string[] = []

    for (let index = 0; index < shapeFields.length; index = index + 1) {
      cResultShapeFields.push(shapeFields[index].name)
    }

    expression.libraryCResultShapeFields = cResultShapeFields
  }

  reportCompilerLibraryOperationDiagnostic(expression: AnyNode, operation: LibraryOperationDescriptor): boolean {
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

  compilerLibraryResultShapeField(field: LibraryResultShapeFieldDescriptor, loc: SourceLocation): AnyNode {
    const result: AnyNode = {
      name: field.name,
      valueType: field.valueType,
      readonly: field.readonly,
      nullable: field.nullable ?? false,
      libraryCMember: field.cMember ?? null,
      libraryCGetter: field.cGetter ?? null,
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

    if (method === null || typeof method === 'undefined') {
      const fieldValueType = this.checkMemberExpression(expression.callee)

      if (fieldValueType === 'function') {
        return null
      }

      if (fieldValueType === 'unknown') {
        expression.valueType = 'unknown'
        return 'unknown'
      }

      this.report('INOX_UNKNOWN_FIELD', `unknown method ${expression.callee.property}`, expression.callee.loc)
      expression.valueType = 'unknown'
      return 'unknown'
    }

    const argTypes: ValueType[] = []

    for (let index = 0; index < expression.args.length; index = index + 1) {
      const arg = checkerNodeAt(expression.args, index)

      argTypes.push(this.checkExpression(arg))
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
          argumentParamValueType(param, resolveCompilerLibrarySet(this.options.libraries)),
          expression.args[index].loc,
          param.nullable === true,
          this.expressionCanBeNull(expression.args[index])
        )
      }
    }

    expression.valueType = returnInfo.valueType
    expression.typeRef = returnInfo.typeRef
    expression.nullable = returnInfo.nullable
    expression.asyncResultValueType = null

    if (returnInfo.asyncResultValueType !== null && typeof returnInfo.asyncResultValueType !== 'undefined') {
      expression.asyncResultValueType = returnInfo.asyncResultValueType
    }

    expression.shape = returnInfo.shape

    return returnInfo.valueType
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

    return null
  }

  checkRuntimeBuiltinImport(statement: AnyNode): void {
    if (statement.typeOnly) {
      return
    }

    const libraryDeclaration = compilerLibraryHasModuleDeclaration(
      resolveCompilerLibrarySet(this.options.libraries),
      statement.source
    )

    if (!isRelativeImportSource(statement.source) && !libraryDeclaration) {
      this.report(
        'INOX_UNSUPPORTED_IMPORT_SOURCE',
        `only relative imports are implemented, got ${statement.source}`,
        statement.loc
      )
    }
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

  declareArrowArrayBindingElements(param: AnyNode): void {
    const bindingElements = param.bindingElements ?? []

    if (bindingElements.length === 0) {
      return
    }

    const libraries = resolveCompilerLibrarySet(this.options.libraries)
    const paramLoc = nodeSourceLocation(param)
    const elementTypeRef = typeRefTraitArgument(param.typeRef ?? null, 'iterable', 0, libraries)

    if (elementTypeRef === null) {
      if (param.valueType !== 'unknown') {
        this.report(
          'INOX_TYPE_MISMATCH',
          `array binding pattern requires an iterable parameter, got ${param.valueType}`,
          paramLoc
        )
      }
      return
    }

    const elementDeclaredType = typeRefDeclaredName(elementTypeRef, libraries) ?? 'unknown'
    const elementInfo = typeRefCompatibilityMetadata(elementTypeRef, libraries, paramLoc)

    for (let index = 0; index < bindingElements.length; index = index + 1) {
      const binding = bindingElements[index]

      binding.declaredType = elementDeclaredType
      binding.valueType = elementInfo.valueType
      binding.typeRef = elementTypeRef
      binding.nullable = elementInfo.nullable
      binding.asyncResultValueType = elementInfo.asyncResultValueType
      binding.functionType = null
      binding.shape = elementInfo.shape

      this.declare(
        binding.name,
        {
          kind: 'param',
          mutable: true,
          valueType: elementInfo.valueType,
          typeRef: elementTypeRef,
          nullable: elementInfo.nullable,
          asyncResultValueType: elementInfo.asyncResultValueType,
          functionType: null,
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

  checkedCallArgInfos(expression: AnyNode, symbol: SymbolInfo | null = null): CheckedCallArgInfo[] {
    const argInfos: CheckedCallArgInfo[] = []
    const params = symbol?.params ?? []

    for (let index = 0; index < expression.args.length; index = index + 1) {
      const arg = checkerNodeAt(expression.args, index)
      const param = paramForArgument(params, index)
      let valueType: ValueType | null = null

      if (
        arg.type === 'ArrowFunctionExpression' &&
        param !== null &&
        typeof param !== 'undefined' &&
        param.functionType !== null &&
        typeof param.functionType !== 'undefined'
      ) {
        this.checkArrowFunctionExpression(arg, param.functionType)
        valueType = 'function'
      } else if (arg.type === 'ObjectLiteral' && param !== null && typeof param !== 'undefined') {
        let shape: ObjectShapeInfo | null = null
        const paramShape = param.shape

        if (paramShape !== null && typeof paramShape === 'object') {
          const candidate = paramShape as ObjectShapeInfo

          if (candidate.kind === 'object' && Array.isArray(candidate.fields)) {
            shape = candidate
          }
        }

        if (shape === null && typeof param.declaredType === 'string') {
          shape = this.resolveDeclaredType(param.declaredType, nodeSourceLocation(param)).shape
        }

        if (shape !== null && shape.dynamic !== true) {
          let paramDeclaredType: string | null = null

          if (typeof param.declaredType === 'string') {
            paramDeclaredType = param.declaredType
          }

          this.checkObjectLiteralAgainstShape(arg, shape, paramDeclaredType)
          valueType = 'object'
        }
      }

      argInfos.push(valueType === null ? this.checkedCallArgInfo(arg) : this.checkedCallArgInfo(arg, valueType))
    }

    return argInfos
  }

  checkedCallArgInfo(argument: AnyNode, knownValueType?: ValueType): CheckedCallArgInfo {
    const valueType = knownValueType ?? this.checkExpression(argument)

    return {
      valueType,
      nullable: this.expressionCanBeNull(argument),
      loc: argument.loc,
      shape: this.resolveExpressionShape(argument),
      typeRef: this.compilerLibraryExpressionTypeRef(argument, valueType)
    }
  }

  compilerLibraryOperationTypeRefContext(
    expression: AnyNode,
    contextualResult: ResolvedTypeInfo | null,
    argInfos: CheckedCallArgInfo[] | null
  ): LibraryOperationTypeRefContext {
    const explicitTypeArguments: TypeRef[] = []
    const typeArgumentNames: string[] = expression.typeArguments ?? []

    for (let index = 0; index < typeArgumentNames.length; index = index + 1) {
      explicitTypeArguments.push(
        typeRefFromResolvedTypeInContext(
          this.resolveDeclaredType(typeArgumentNames[index], expression.loc),
          typeArgumentNames[index]
        )
      )
    }

    const argumentTypeRefs: TypeRef[] = []
    const argumentFunctionReturnTypeRefs: TypeRef[] = []
    const argumentArrayLiteralColumns: TypeRef[][] = []
    const args: AnyNode[] = expression.args ?? []

    for (let index = 0; index < (argInfos ?? []).length; index = index + 1) {
      argumentTypeRefs.push((argInfos ?? [])[index].typeRef)
    }

    for (let index = 0; index < args.length; index = index + 1) {
      argumentFunctionReturnTypeRefs.push(this.compilerLibraryFunctionReturnTypeRef(args[index]))
      argumentArrayLiteralColumns.push(this.compilerLibraryArrayLiteralColumnTypeRefs(args[index]))
    }

    let receiverTypeRef: TypeRef | null = null
    const receiver = this.compilerLibraryOperationReceiverExpression(expression)

    if (receiver !== null) {
      receiverTypeRef = this.compilerLibraryExpressionTypeRef(receiver)
    }

    return {
      explicitTypeArguments,
      receiverTypeRef,
      contextualTypeRef: contextualResult?.typeRef ?? null,
      argumentTypeRefs,
      argumentFunctionReturnTypeRefs,
      argumentArrayLiteralColumns
    }
  }

  compilerLibraryFunctionReturnTypeRef(expression: AnyNode): TypeRef {
    const directReturnTypeRef = expression.returnTypeRef

    if (directReturnTypeRef !== null && typeof directReturnTypeRef !== 'undefined') {
      return directReturnTypeRef
    }

    const directReturnType = expression.returnType

    if (directReturnType !== null && typeof directReturnType !== 'undefined') {
      return (
        this.compilerLibraryPrimitiveTypeRef(directReturnType, expression.returnNullable === true) ??
        this.compilerLibraryUnknownTypeRef()
      )
    }

    const returnTypeRef = expression.functionType?.returnTypeRef

    if (returnTypeRef !== null && typeof returnTypeRef !== 'undefined') {
      return returnTypeRef
    }

    const returnType = expression.functionType?.returnType

    if (returnType !== null && typeof returnType !== 'undefined') {
      return (
        this.compilerLibraryPrimitiveTypeRef(
          returnType,
          expression.returnNullable === true || expression.functionType?.returnNullable === true
        ) ?? this.compilerLibraryUnknownTypeRef()
      )
    }

    return this.compilerLibraryUnknownTypeRef()
  }

  compilerLibraryArrayLiteralColumnTypeRefs(expression: AnyNode): TypeRef[] {
    if (expression.type !== 'ArrayLiteral' || expression.elements.length === 0) {
      return []
    }

    const columns: TypeRef[] = []
    let width = -1

    for (let rowIndex = 0; rowIndex < expression.elements.length; rowIndex = rowIndex + 1) {
      const row = checkerNodeAt(expression.elements, rowIndex)

      if (row.type !== 'ArrayLiteral') {
        return []
      }

      if (width < 0) {
        width = row.elements.length
      } else if (row.elements.length !== width) {
        return []
      }

      for (let elementIndex = 0; elementIndex < row.elements.length; elementIndex = elementIndex + 1) {
        const element = checkerNodeAt(row.elements, elementIndex)

        if (element.type === 'SpreadElement') {
          return []
        }

        const typeRef = this.compilerLibraryExpressionTypeRef(element)

        if (rowIndex === 0) {
          columns.push(typeRef)
        } else if (!compilerLibraryTypeRefsEqual(columns[elementIndex], typeRef)) {
          columns[elementIndex] = this.compilerLibraryUnknownTypeRef()
        }
      }
    }

    return columns
  }

  compilerLibraryOperationReceiverExpression(expression: AnyNode): AnyNode | null {
    if (
      (expression.type === 'CallExpression' || expression.type === 'OptionalCallExpression') &&
      (expression.callee.type === 'MemberExpression' || expression.callee.type === 'OptionalMemberExpression')
    ) {
      return expression.callee.object
    }

    if (
      expression.type === 'MemberExpression' ||
      expression.type === 'OptionalMemberExpression' ||
      expression.type === 'IndexExpression' ||
      expression.type === 'OptionalIndexExpression'
    ) {
      return expression.object
    }

    if (
      expression.type === 'AssignmentExpression' &&
      (expression.target.type === 'MemberExpression' || expression.target.type === 'IndexExpression')
    ) {
      return expression.target.object
    }

    return null
  }

  compilerLibraryExpressionTypeRef(expression: AnyNode, knownValueType?: ValueType): TypeRef {
    const expressionTypeRef = expression.typeRef

    if (expressionTypeRef !== null && typeof expressionTypeRef !== 'undefined') {
      return expressionTypeRef
    }

    const valueType = knownValueType ?? this.inferCheckedExpressionType(expression)
    const primitive = this.compilerLibraryPrimitiveTypeRef(valueType, this.expressionCanBeNull(expression))

    if (primitive !== null) {
      return primitive
    }

    if (valueType === 'function') {
      const functionType = expression.functionType

      if (functionType !== null && typeof functionType !== 'undefined') {
        const info = this.unresolvedTypeInfo()
        info.valueType = 'function'
        info.nullable = this.expressionCanBeNull(expression)
        info.functionType = functionType
        return typeRefFromResolvedTypeInContext(info, expression.declaredType ?? null)
      }
    }

    if (valueType === 'object') {
      const shape = this.resolveExpressionShape(expression)

      if (shape !== null) {
        const info = this.unresolvedTypeInfo()
        info.valueType = 'object'
        info.nullable = this.expressionCanBeNull(expression)
        info.shape = shape
        return typeRefFromResolvedTypeInContext(info, expression.declaredType ?? null)
      }
    }

    return {
      kind: 'unknown',
      nullable: this.expressionCanBeNull(expression),
      ownership: 'value',
      traits: []
    }
  }

  compilerLibraryArrayTypeRef(expression: AnyNode): TypeRef | null {
    const libraries = resolveCompilerLibrarySet(this.options.libraries)
    const providerType = compilerLibraryNativeTypeForIntrinsic(libraries, 'array-literal', 'construct')

    if (providerType === null || (providerType.typeParameters ?? []).length !== 1) {
      return null
    }

    let elementTypeRef: TypeRef | null = null

    for (let index = 0; index < expression.elements.length; index = index + 1) {
      const element = checkerNodeAt(expression.elements, index)
      let candidateTypeRef: TypeRef | null = null

      if (element.type === 'SpreadElement') {
        const spreadTypeRef = this.compilerLibraryExpressionTypeRef(element.argument)

        if (spreadTypeRef.kind !== 'parameter') {
          const traits = typeRefTraits(spreadTypeRef, libraries)

          for (let traitIndex = 0; traitIndex < traits.length; traitIndex = traitIndex + 1) {
            if (traits[traitIndex].traitId === 'iterable' && traits[traitIndex].args.length > 0) {
              candidateTypeRef = traits[traitIndex].args[0]
              break
            }
          }
        }
      } else {
        candidateTypeRef = this.compilerLibraryExpressionTypeRef(element)
      }

      if (candidateTypeRef === null) {
        candidateTypeRef = this.compilerLibraryUnknownTypeRef()
      }

      if (elementTypeRef === null) {
        elementTypeRef = candidateTypeRef
      } else {
        elementTypeRef = commonTypeRef(elementTypeRef, candidateTypeRef) ?? this.compilerLibraryUnknownTypeRef()
      }
    }

    return instantiateNativeTypeRef(providerType, [elementTypeRef ?? this.compilerLibraryUnknownTypeRef()])
  }

  compilerLibraryArrayResultTypeRef(elementTypeRef: TypeRef): TypeRef | null {
    const libraries = resolveCompilerLibrarySet(this.options.libraries)
    const providerType = compilerLibraryNativeTypeForIntrinsic(libraries, 'array-literal', 'construct')

    if (providerType === null || (providerType.typeParameters ?? []).length !== 1) {
      return null
    }

    return instantiateNativeTypeRef(providerType, [elementTypeRef])
  }

  applyCompilerLibraryArrayResultType(expression: AnyNode, elementTypeRef: TypeRef): void {
    const libraries = resolveCompilerLibrarySet(this.options.libraries)
    const providerType = compilerLibraryNativeTypeForIntrinsic(libraries, 'array-literal', 'construct')
    const resultTypeRef = this.compilerLibraryArrayResultTypeRef(elementTypeRef)

    if (providerType === null || resultTypeRef === null) {
      return
    }

    this.applyCompilerLibraryTypeRef(expression, resultTypeRef, null)
    expression.libraryRuntimeRequirements = providerType.runtimeRequirements
  }

  compilerLibraryTypeRefForValueType(valueType: ValueType): TypeRef {
    const primitiveTypeRef = this.compilerLibraryPrimitiveTypeRef(valueType, false)

    if (primitiveTypeRef !== null) {
      return primitiveTypeRef
    }

    return this.compilerLibraryUnknownTypeRef()
  }

  compilerLibraryPrimitiveTypeRef(valueType: ValueType, nullable: boolean): TypeRef | null {
    if (
      valueType !== 'boolean' &&
      valueType !== 'bytes' &&
      valueType !== 'null' &&
      valueType !== 'number' &&
      valueType !== 'string' &&
      valueType !== 'void'
    ) {
      return null
    }

    return {
      kind: 'primitive',
      name: valueType,
      nullable,
      ownership: 'value',
      traits: []
    }
  }

  compilerLibraryUnknownTypeRef(): TypeRef {
    return {
      kind: 'unknown',
      nullable: false,
      ownership: 'value',
      traits: []
    }
  }

  checkRegExpLiteral(expression: AnyNode): ValueType {
    if (Array.isArray(expression.args) && typeof expression.valueType === 'string') {
      return expression.valueType as ValueType
    }

    const pattern = typeof expression.pattern === 'string' ? expression.pattern : ''
    const flags = typeof expression.flags === 'string' ? expression.flags : ''

    expression.args = [
      { type: 'StringLiteral', value: pattern, valueType: 'string', loc: expression.loc },
      { type: 'StringLiteral', value: flags, valueType: 'string', loc: expression.loc }
    ]

    return this.checkCompilerLibraryIntrinsicOperation(expression, 'regexp-literal', 'construct')
  }

  checkCompilerLibraryIntrinsicOperation(
    expression: AnyNode,
    role: IntrinsicRole,
    kind: LibraryOperationKind
  ): ValueType {
    const libraries = resolveCompilerLibrarySet(this.options.libraries)
    const operation = compilerLibraryOperationForIntrinsic(libraries, role, kind)

    if (operation === null) {
      this.reportMissingCompilerLibraryIntrinsicProvider(expression, role)
      expression.valueType = 'unknown'
      return 'unknown'
    }

    const variant = this.compilerLibraryOperationVariant(expression, operation)
    this.applyCompilerLibraryOperation(expression, operation, variant)

    if (this.reportCompilerLibraryOperationDiagnostic(expression, operation)) {
      return 'unknown'
    }

    this.checkCompilerLibraryOperationArguments(expression, operation, variant)
    this.checkCompilerLibraryOptionConstraints(expression, operation)

    return typeof expression.valueType === 'string' ? (expression.valueType as ValueType) : 'unknown'
  }

  reportMissingCompilerLibraryIntrinsicProvider(expression: AnyNode, role: IntrinsicRole): void {
    this.missingIntrinsicProviderExpressions.add(expression)
    this.report(
      'INOX_MISSING_INTRINSIC_PROVIDER',
      `missing compiler library intrinsic provider ${role}`,
      expression.loc
    )
  }

  checkNewExpression(expression: AnyNode, contextualResult: ResolvedTypeInfo | null = null): ValueType {
    const argTypes: ValueType[] = []
    const argInfos: CheckedCallArgInfo[] = []

    for (let index = 0; index < expression.args.length; index = index + 1) {
      const arg = checkerNodeAt(expression.args, index)
      const argType = this.checkExpression(arg)

      argTypes.push(argType)
      argInfos.push(this.checkedCallArgInfo(arg, argType))
    }

    const libraryConstructorType = this.checkCompilerLibraryConstructOperation(expression, argInfos, contextualResult)

    if (libraryConstructorType !== null) {
      return libraryConstructorType
    }

    if (expression.callee.type !== 'Reference' || expression.callee.path.length !== 1) {
      this.checkExpression(expression.callee)
      return 'object'
    }

    const constructorName = firstPathSegment(expression.callee.path)

    const symbol = this.scope.resolve(constructorName)

    if (
      symbol === null ||
      typeof symbol === 'undefined' ||
      (symbol.kind !== 'class' && symbol.constructable !== true)
    ) {
      this.report('INOX_UNKNOWN_NAME', `unknown class ${constructorName}`, expression.callee.loc)
      return 'object'
    }

    const declarationConstructor = this.constructorCallableSymbolForExpression(symbol, expression)

    if (declarationConstructor !== null) {
      applyCallableSymbolCallInContext(this.callableSymbolContext(), expression, declarationConstructor, argInfos)
      expression.className = constructorName
      expression.shape = symbol.shape ?? expression.shape ?? null
      return 'object'
    }

    if (symbol.constructable) {
      this.checkImportedClassConstructorArguments(expression, symbol.constructorParams)
      expression.className = symbol.className ?? constructorName
      expression.shape = symbol.shape ?? null
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
    argInfos: CheckedCallArgInfo[],
    contextualResult: ResolvedTypeInfo | null
  ): ValueType | null {
    const operation = this.compilerLibraryOperationForExpression(expression.callee, 'construct')

    if (operation === null) {
      return null
    }

    const declaredSymbol = this.compilerLibraryDeclarationConstructorSymbol(expression.callee)
    const variant = this.compilerLibraryOperationVariant(expression, operation)

    this.checkCompilerLibraryOperationTypeArgumentCount(expression, operation)
    this.applyCompilerLibraryOperation(expression, operation, variant, contextualResult, argInfos)

    if (this.reportCompilerLibraryOperationDiagnostic(expression, operation)) {
      return 'unknown'
    }

    const checkedArgInfos = this.checkCompilerLibraryOperationArguments(
      expression,
      operation,
      variant,
      argInfos,
      contextualResult
    )

    let declaredType: ValueType | null = null

    if (declaredSymbol !== null) {
      declaredType = applyCallableSymbolCallInContext(
        this.callableSymbolContext(),
        expression,
        declaredSymbol,
        checkedArgInfos
      )
    }

    this.applyCompilerLibraryOperation(expression, operation, variant, contextualResult, checkedArgInfos)

    this.checkCompilerLibraryOptionConstraints(expression, operation)

    return typeof expression.valueType === 'string' ? (expression.valueType as ValueType) : (declaredType ?? 'object')
  }

  checkImportedClassConstructorArguments(expression: AnyNode, rawParams: AnyNode[] | null | undefined): void {
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

  inferCheckedExpressionType(expression: AnyNode): ValueType {
    const knownType = knownCheckedExpressionType(expression)

    if (knownType !== null && typeof knownType !== 'undefined') {
      return knownType
    }

    return this.checkExpression(expression)
  }

  inferCalledFunctionReturn(callee: AnyNode): void {
    if (callee.type !== 'Reference' || callee.path.length !== 1) {
      return
    }

    const name = firstPathSegment(callee.path)
    const declaration = this.functionDeclarations.get(name) ?? null

    if (declaration !== null) {
      this.inferFunctionDeclarationReturn(declaration)
    }
  }

  inferFunctionDeclarationReturn(declaration: AnyNode): void {
    const unannotatedAsync =
      declaration.async === true &&
      (declaration.declaredReturnType === null || typeof declaration.declaredReturnType === 'undefined')

    if (
      (declaration.declaredReturnType !== null && typeof declaration.declaredReturnType !== 'undefined') ||
      (!unannotatedAsync && declaration.returnType !== 'unknown') ||
      this.inferringFunctionReturns.has(declaration.name)
    ) {
      return
    }

    const symbol = this.scope.resolve(declaration.name)

    if (symbol === null || symbol.kind !== 'function') {
      return
    }

    const diagnosticsLength = this.diagnostics.length
    const scopeState = this.pushScope()
    const typeParameterState = this.pushFunctionTypeParameters(declaration)
    const returnContextState = this.pushReturnContext('unknown', true, null)
    const previousFunctionDepth = this.functionDepth
    const previousCandidates = this.inferredFunctionReturnCandidates
    const candidates: InferredFunctionReturnCandidate[] = []
    this.inferringFunctionReturns.add(declaration.name)
    this.inferredFunctionReturnCandidates = candidates
    this.functionDepth = this.functionDepth + 1

    try {
      for (let index = 0; index < declaration.params.length; index = index + 1) {
        const param = checkerNodeAt(declaration.params, index)
        const paramInfo = this.resolveParam(param)
        param.typeRef = paramInfo.typeRef

        this.declare(
          param.name,
          {
            kind: 'param',
            mutable: true,
            valueType: paramInfo.valueType,
            declaredType: param.declaredType,
            typeRef: paramInfo.typeRef,
            nullable: paramInfo.nullable,
            asyncResultValueType: paramInfo.asyncResultValueType,
            functionType: paramInfo.functionType,
            shape: paramInfo.shape,
            loc: param.loc
          },
          param.loc
        )
      }

      this.checkStatements(declaration.body)
      this.applyInferredFunctionReturn(declaration, symbol, candidates)
    } finally {
      while (this.diagnostics.length > diagnosticsLength) {
        this.diagnostics.pop()
      }

      this.functionDepth = previousFunctionDepth
      this.inferredFunctionReturnCandidates = previousCandidates
      this.inferringFunctionReturns.delete(declaration.name)
      this.restoreReturnContext(returnContextState)
      this.restoreFunctionTypeParameters(typeParameterState)
      this.restoreScope(scopeState)
    }
  }

  applyInferredFunctionReturn(
    declaration: AnyNode,
    symbol: SymbolInfo,
    candidates: InferredFunctionReturnCandidate[]
  ): void {
    if (declaration.async === true) {
      const libraries = resolveCompilerLibrarySet(this.options.libraries)
      const fulfilledCandidates = inferredAsyncFulfilledCandidates(
        candidates,
        libraries,
        nodeSourceLocation(declaration)
      )
      this.applyInferredAsyncFunctionReturn(
        declaration,
        symbol,
        commonInferredFunctionReturn(fulfilledCandidates),
        libraries
      )
      return
    }

    const inferred = commonInferredFunctionReturn(candidates)

    declaration.returnType = inferred.valueType
    declaration.returnNullable = inferred.nullable
    declaration.returnAsyncResultValueType = inferred.asyncResultValueType
    declaration.returnShape = inferred.shape
    declaration.returnTypeRef = inferred.typeRef

    symbol.returnType = inferred.valueType
    symbol.returnTypeRef = inferred.typeRef
    symbol.returnNullable = declaration.returnNullable === true
    symbol.returnAsyncResultValueType = declaration.returnAsyncResultValueType
    symbol.returnShape = inferred.shape
  }

  applyInferredAsyncFunctionReturn(
    declaration: AnyNode,
    symbol: SymbolInfo,
    fulfilled: InferredFunctionReturnCandidate,
    libraries: CompilerLibrarySet
  ): void {
    const operation = compilerLibraryOperationForIntrinsic(libraries, 'async-result', 'construct')
    const resultTypeRef =
      operation === null ? null : inferredAsyncResultTypeRef(operation, fulfilled)

    if (resultTypeRef === null) {
      declaration.returnType = 'async-result'
      declaration.returnNullable = false
      declaration.returnAsyncResultValueType = fulfilled.valueType
      declaration.returnShape = null
      declaration.returnTypeRef = null
      symbol.returnType = 'async-result'
      symbol.returnTypeRef = null
      symbol.returnNullable = false
      symbol.returnAsyncResultValueType = fulfilled.valueType
      symbol.returnShape = null
      return
    }

    const metadata = typeRefCompatibilityMetadata(resultTypeRef, libraries, nodeSourceLocation(declaration))

    declaration.returnType = typeRefDeclaredName(resultTypeRef, libraries) ?? metadata.valueType
    declaration.returnNullable = metadata.nullable
    declaration.returnAsyncResultValueType = fulfilled.valueType
    declaration.returnShape = metadata.shape
    declaration.returnTypeRef = resultTypeRef
    symbol.returnType = metadata.valueType
    symbol.returnTypeRef = resultTypeRef
    symbol.returnNullable = metadata.nullable
    symbol.returnAsyncResultValueType = fulfilled.valueType
    symbol.returnShape = metadata.shape
  }

  checkVariableInitializer(
    expression: AnyNode,
    declared: ResolvedTypeInfo | null,
    declaredType: string | null = null
  ): ValueType {
    if (
      expression.type === 'ObjectLiteral' &&
      declared !== null &&
      declared.valueType === 'object' &&
      declared.shape !== null
    ) {
      this.checkObjectLiteralAgainstShape(expression, declared.shape, declaredType)
      this.applyResolvedTypeInfoMetadataToExpression(expression, declared)
      expression.valueType = 'object'
      return 'object'
    }

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
      const libraryType = this.checkCompilerLibraryCallOperation(expression, declared)

      if (libraryType !== null) {
        return libraryType
      }
    }

    if (expression.type === 'NewExpression') {
      return this.checkNewExpression(expression, declared)
    }

    const valueType = this.checkExpression(expression)

    if (
      expression.type === 'ArrayLiteral' &&
      declared !== null &&
      declared.typeRef !== null &&
      this.compilerLibraryIterableElementTypeRef(declared.typeRef) !== null
    ) {
      const observedTypeRef = expression.typeRef
      const contextualTypeRef =
        observedTypeRef === null || typeof observedTypeRef === 'undefined'
          ? declared.typeRef
          : refineTypeRefUnknowns(declared.typeRef, observedTypeRef)

      this.applyCompilerLibraryTypeRef(expression, contextualTypeRef, null)
    }

    return valueType
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

    if (
      (functionType === null || typeof functionType === 'undefined') &&
      expression.functionSyntax === true &&
      typeof expression.declaredReturnType === 'string'
    ) {
      const returnInfo = this.resolveDeclaredType(expression.declaredReturnType, expression.loc)

      functionType = {
        kind: 'function',
        resolved: true,
        params: this.resolveParams(expression.params),
        returnType: returnInfo.valueType,
        declaredReturnType: expression.declaredReturnType,
        returnTypeRef: returnInfo.typeRef,
        returnNullable: returnInfo.nullable,
        returnAsyncResultValueType: returnInfo.asyncResultValueType,
        returnShape: returnInfo.shape
      }
    }

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
    const previousInferredFunctionReturnCandidates = this.inferredFunctionReturnCandidates
    this.inferredFunctionReturnCandidates = null

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
          let expectedValueType = nodeValueTypeOrUnknown(expected)
          let asyncResultValueType: ValueType | null = null
          let expectedFunctionType: FunctionTypeMetadata | null = null
          let shape: ObjectShapeInfo | null = null

          if (!isBuiltinValueType(expectedValueType)) {
            expectedValueType = 'object'
          }

          if (expected.asyncResultValueType !== null && typeof expected.asyncResultValueType !== 'undefined') {
            asyncResultValueType = expected.asyncResultValueType
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
            typeRef: expected.typeRef ?? null,
            asyncResultValueType,
            functionType: expectedFunctionType,
            shape
          }
        }

        if (expected !== null && typeof expected !== 'undefined' && paramValueType !== 'unknown') {
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
        param.typeRef = paramInfo.typeRef
        param.nullable =
          paramInfo.nullable ||
          (param.optional === true && (param.defaultValue === null || typeof param.defaultValue === 'undefined'))
        param.asyncResultValueType = null

        if (paramInfo.asyncResultValueType !== null && typeof paramInfo.asyncResultValueType !== 'undefined') {
          param.asyncResultValueType = paramInfo.asyncResultValueType
        }

        param.functionType = paramInfo.functionType
        param.shape = paramInfo.shape

        this.declare(
          param.name,
          {
            kind: 'param',
            mutable: true,
            valueType: paramInfo.valueType,
            declaredType: param.declaredType,
            typeRef: paramInfo.typeRef,
            nullable: param.nullable,
            asyncResultValueType: paramInfo.asyncResultValueType ?? null,
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
              expectedReturnType === 'async-result' &&
              functionType.returnAsyncResultValueType !== null &&
              typeof functionType.returnAsyncResultValueType !== 'undefined'
            ) {
              this.checkAssignableType(
                this.resolveExpressionAsyncResultValueType(expression.body),
                functionType.returnAsyncResultValueType,
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
          const previousReturnAsyncResultValueType = this.currentReturnAsyncResultValueType
          const previousReturnAsync = this.currentReturnAsync
          const previousFunctionDepth = this.functionDepth

          try {
            let expectedReturnType: ValueType = 'unknown'

            if (functionType.returnType !== null && typeof functionType.returnType !== 'undefined') {
              expectedReturnType = functionType.returnType
            }

            this.currentReturnType = expectedReturnType
            this.currentReturnNullable = functionType.returnNullable === true
            this.currentReturnAsyncResultValueType = null

            if (
              functionType.returnAsyncResultValueType !== null &&
              typeof functionType.returnAsyncResultValueType !== 'undefined'
            ) {
              this.currentReturnAsyncResultValueType = functionType.returnAsyncResultValueType
            }

            this.currentReturnAsync = false
            this.functionDepth = this.functionDepth + 1
            this.checkStatements(expression.body)
          } finally {
            this.currentReturnType = previousReturnType
            this.currentReturnNullable = previousReturnNullable
            this.currentReturnAsyncResultValueType = previousReturnAsyncResultValueType
            this.currentReturnAsync = previousReturnAsync
            this.functionDepth = previousFunctionDepth
          }
        }
      }
    } finally {
      this.inferredFunctionReturnCandidates = previousInferredFunctionReturnCandidates
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

    expression.returnTypeRef = null

    if (
      functionType !== null &&
      typeof functionType !== 'undefined' &&
      functionType.returnTypeRef !== null &&
      typeof functionType.returnTypeRef !== 'undefined'
    ) {
      expression.returnTypeRef = functionType.returnTypeRef
    } else if (
      expression.expressionBody &&
      expression.body !== null &&
      typeof expression.body !== 'undefined' &&
      expression.body.typeRef !== null &&
      typeof expression.body.typeRef !== 'undefined'
    ) {
      expression.returnTypeRef = expression.body.typeRef
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

    expression.returnAsyncResultValueType = null

    if (
      functionType !== null &&
      typeof functionType !== 'undefined' &&
      functionType.returnAsyncResultValueType !== null &&
      typeof functionType.returnAsyncResultValueType !== 'undefined'
    ) {
      expression.returnAsyncResultValueType = functionType.returnAsyncResultValueType
    } else if (
      expression.body !== null &&
      typeof expression.body !== 'undefined' &&
      expression.body.asyncResultValueType !== null &&
      typeof expression.body.asyncResultValueType !== 'undefined'
    ) {
      expression.returnAsyncResultValueType = expression.body.asyncResultValueType
    }

    if (expression.functionType === null || typeof expression.functionType === 'undefined') {
      expression.functionType = createArrowFunctionTypeMetadata(expression, this.resolveParams(expression.params))
    } else if (
      expression.functionType.returnType === null ||
      typeof expression.functionType.returnType === 'undefined'
    ) {
      const currentFunctionType = expression.functionType as FunctionTypeMetadata

      expression.functionType = {
        ...currentFunctionType,
        returnType: expression.returnType,
        declaredReturnType: expression.declaredReturnType,
        returnTypeRef: expression.returnTypeRef,
        returnNullable: expression.returnNullable === true,
        returnAsyncResultValueType: expression.returnAsyncResultValueType,
        returnShape: expression.body?.shape ?? null
      }
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
      let fieldLoc = statement.loc

      if (field.loc !== null && typeof field.loc !== 'undefined') {
        fieldLoc = field.loc
      }

      if (field.static) {
        let fieldStaticLoc = fieldLoc

        if (field.staticLoc !== null && typeof field.staticLoc !== 'undefined') {
          fieldStaticLoc = field.staticLoc
        }

        this.report('INOX_CLASS_STATIC', 'static class fields are not supported', fieldStaticLoc)
      }

      if (fieldNames.has(field.name)) {
        this.report('INOX_REDECLARED_NAME', `field ${field.name} is already declared in this class`, fieldLoc)
      }

      fieldNames.add(field.name)
    }

    for (const method of statement.methods) {
      let methodLoc = statement.loc

      if (method.loc !== null && typeof method.loc !== 'undefined') {
        methodLoc = method.loc
      }

      if (method.static) {
        let methodStaticLoc = methodLoc

        if (method.staticLoc !== null && typeof method.staticLoc !== 'undefined') {
          methodStaticLoc = method.staticLoc
        }

        this.report('INOX_CLASS_STATIC', 'static class methods are not supported', methodStaticLoc)
      }

      if (methodNames.has(method.name)) {
        this.report('INOX_REDECLARED_NAME', `method ${method.name} is already declared in this class`, methodLoc)
      }

      if (fieldNames.has(method.name)) {
        this.report('INOX_REDECLARED_NAME', `method ${method.name} conflicts with a class field`, methodLoc)
      }

      methodNames.add(method.name)
      const scopeState = this.pushScope()

      try {
        const previousReturnType = this.currentReturnType
        const methodReturnInfo = this.resolveDeclaredType(method.returnType, method.loc)
        this.currentReturnType = methodReturnInfo.valueType
        const previousReturnNullable = this.currentReturnNullable
        this.currentReturnNullable = methodReturnInfo.nullable
        const previousReturnAsyncResultValueType = this.currentReturnAsyncResultValueType
        const previousReturnShape = this.currentReturnShape
        this.currentReturnShape = methodReturnInfo.shape
        method.returnTypeRef = methodReturnInfo.typeRef
        method.returnShape = methodReturnInfo.shape
        this.currentReturnAsyncResultValueType = null

        if (
          methodReturnInfo.asyncResultValueType !== null &&
          typeof methodReturnInfo.asyncResultValueType !== 'undefined'
        ) {
          this.currentReturnAsyncResultValueType = methodReturnInfo.asyncResultValueType
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
          const paramInfo = this.resolveParam(param)
          param.declaredType = declaredType
          param.valueType = paramInfo.valueType
          param.typeRef = paramInfo.typeRef
          param.nullable = paramInfo.nullable
          param.asyncResultValueType = paramInfo.asyncResultValueType ?? null
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
              declaredType,
              typeRef: paramInfo.typeRef,
              nullable: paramInfo.nullable,
              asyncResultValueType: paramInfo.asyncResultValueType,
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
          this.currentReturnAsyncResultValueType = previousReturnAsyncResultValueType
          this.currentReturnShape = previousReturnShape
          this.currentReturnAsync = previousReturnAsync
          this.currentClassConstructor = previousClassConstructor
          this.functionDepth = previousFunctionDepth
        }
      } finally {
        this.restoreScope(scopeState)
      }
    }
  }

  checkObjectLiteralAgainstShape(
    expression: AnyNode,
    shape: ObjectShapeInfo,
    declaredType: string | null = null
  ): void {
    if (this.checkObjectLiteralAgainstUnionBranches(expression, shape, declaredType)) {
      return
    }

    expression.shape = shape

    const expressionProperties: CheckerObjectPropertyNode[] = expression.properties
    const properties: Map<string, CheckerObjectPropertyNode> = new Map()
    const spreadFields: Map<string, AnyNode> = new Map()

    for (const property of expressionProperties) {
      if (property.spread === true) {
        const spreadShape = this.checkPlainObjectSpreadProperty(property)

        if (spreadShape !== null && typeof spreadShape !== 'undefined') {
          for (const field of spreadShape.fields) {
            properties.delete(field.name)
            spreadFields.set(field.name, field)
          }
        }

        continue
      }

      spreadFields.delete(property.key)
      properties.set(property.key, property)
    }

    for (const field of shape.fields) {
      const property = properties.get(field.name)

      if (property === null || typeof property === 'undefined') {
        const spreadField = spreadFields.get(field.name)

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
        let fieldDeclaredType: string | null = null

        if (typeof field.declaredType === 'string') {
          fieldDeclaredType = field.declaredType
        }

        this.checkObjectLiteralAgainstShape(property.value, fieldShape, fieldDeclaredType)
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

      const fieldArrayElementType = this.resolvedIterableElementValueType(fieldType)

      if (fieldArrayElementType !== null) {
        this.checkAssignableType(
          this.resolveExpressionArrayElementType(property.value),
          fieldArrayElementType,
          property.loc,
          false,
          false
        )
      }

      if (
        fieldType.valueType === 'async-result' &&
        fieldType.asyncResultValueType !== null &&
        typeof fieldType.asyncResultValueType !== 'undefined'
      ) {
        this.checkAssignableType(
          this.resolveExpressionAsyncResultValueType(property.value),
          fieldType.asyncResultValueType,
          property.loc,
          false,
          false
        )
      }
    }

    for (const property of expressionProperties) {
      if (property.spread === true) {
        continue
      }

      if (shape.dynamic !== true && !this.findShapeField(shape, property.key)) {
        this.report('INOX_UNKNOWN_FIELD', `unknown field ${property.key}`, property.loc)
      }
    }
  }

  checkObjectLiteralAgainstUnionBranches(
    expression: AnyNode,
    targetShape: ObjectShapeInfo,
    targetDeclaredType: string | null
  ): boolean {
    if (targetDeclaredType === null) {
      return false
    }

    const expressionLoc = nodeSourceLocation(expression)
    const targetAlternatives = this.resolveDeclaredObjectUnionAlternatives(targetDeclaredType, expressionLoc)

    if (targetAlternatives.length < 2) {
      return false
    }

    const properties: CheckerObjectPropertyNode[] = expression.properties
    const sourceAlternativesByProperty: Array<CheckerObjectUnionAlternative[] | null> = []
    let unionSpreadCount = 0

    for (let index = 0; index < properties.length; index = index + 1) {
      const property = properties[index]

      if (property.spread !== true) {
        sourceAlternativesByProperty.push(null)
        continue
      }

      const sourceDeclaredType = this.uncheckedExpressionDeclaredType(property.value)
      const alternatives = this.resolveDeclaredObjectUnionAlternatives(sourceDeclaredType, property.loc)

      if (alternatives.length < 2) {
        sourceAlternativesByProperty.push(null)
        continue
      }

      sourceAlternativesByProperty.push(alternatives)
      unionSpreadCount = unionSpreadCount + 1
    }

    if (unionSpreadCount === 0) {
      return false
    }

    this.checkObjectLiteral(expression)
    const inferredShape = this.resolveExpressionShape(expression)
    expression.shape = targetShape

    if (inferredShape === null) {
      return true
    }

    let sourceBranches: CheckerObjectUnionAlternative[] = [
      {
        name: '',
        shape: {
          kind: 'object',
          dynamic: false,
          fields: []
        }
      }
    ]

    for (let propertyIndex = 0; propertyIndex < properties.length; propertyIndex = propertyIndex + 1) {
      const property = properties[propertyIndex]
      const alternatives = sourceAlternativesByProperty[propertyIndex]

      if (property.spread === true && alternatives !== null) {
        if (sourceBranches.length * alternatives.length > maxObjectSpreadUnionBranches) {
          this.report(
            'INOX_TYPE_COMPLEXITY',
            `object spread produces more than ${maxObjectSpreadUnionBranches} structural union branches`,
            property.loc
          )
          return true
        }

        const nextBranches: CheckerObjectUnionAlternative[] = []

        for (const sourceBranch of sourceBranches) {
          for (const alternative of alternatives) {
            nextBranches.push({
              name: this.objectSpreadBranchName(sourceBranch.name, alternative.name),
              shape: this.objectLiteralShapeWithSpread(sourceBranch.shape, alternative.shape)
            })
          }
        }

        sourceBranches = nextBranches
        continue
      }

      if (property.spread === true) {
        const spreadShape = this.objectSpreadShapeFromCheckedExpression(property.value, property.loc)

        if (spreadShape === null) {
          continue
        }

        for (let branchIndex = 0; branchIndex < sourceBranches.length; branchIndex = branchIndex + 1) {
          const branch = sourceBranches[branchIndex]
          branch.shape = this.objectLiteralShapeWithSpread(branch.shape, spreadShape)
        }

        continue
      }

      const field = this.findShapeField(inferredShape, property.key)

      if (field === null) {
        continue
      }

      const fieldShape: ObjectShapeInfo = {
        kind: 'object',
        dynamic: false,
        fields: [field]
      }

      for (let branchIndex = 0; branchIndex < sourceBranches.length; branchIndex = branchIndex + 1) {
        const branch = sourceBranches[branchIndex]
        branch.shape = this.objectLiteralShapeWithSpread(branch.shape, fieldShape)
      }
    }

    for (let sourceIndex = 0; sourceIndex < sourceBranches.length; sourceIndex = sourceIndex + 1) {
      const source = sourceBranches[sourceIndex]
      let assignable = false

      for (let targetIndex = 0; targetIndex < targetAlternatives.length; targetIndex = targetIndex + 1) {
        if (this.objectShapeIsAssignable(source.shape, targetAlternatives[targetIndex].shape)) {
          assignable = true
          break
        }
      }

      if (!assignable) {
        this.report(
          'INOX_TYPE_MISMATCH',
          `object spread branch ${source.name} is not assignable to ${targetDeclaredType}`,
          expressionLoc
        )
      }
    }

    return true
  }

  objectLiteralShapeWithSpread(sourceShape: ObjectShapeInfo, spreadShape: ObjectShapeInfo): ObjectShapeInfo {
    const fields: AnyNode[] = []

    for (let index = 0; index < sourceShape.fields.length; index = index + 1) {
      fields.push(sourceShape.fields[index])
    }

    for (let index = 0; index < spreadShape.fields.length; index = index + 1) {
      this.setObjectLiteralShapeField(fields, spreadShape.fields[index])
    }

    return {
      kind: 'object',
      dynamic: sourceShape.dynamic === true || spreadShape.dynamic === true,
      fields
    }
  }

  objectSpreadBranchName(current: string, next: string): string {
    if (current.length === 0) {
      return next
    }

    return `${current} + ${next}`
  }

  objectShapeIsAssignable(actualShape: ObjectShapeInfo, expectedShape: ObjectShapeInfo): boolean {
    for (let index = 0; index < expectedShape.fields.length; index = index + 1) {
      const expectedField = expectedShape.fields[index]
      const actualField = this.findShapeField(actualShape, expectedField.name)

      if (actualField === null) {
        if (expectedField.optional === true) {
          continue
        }
        return false
      }

      const actualType = this.resolveFieldDeclaredType(actualField)
      const expectedType = this.resolveFieldDeclaredType(expectedField)

      if (!isAssignableType(actualType.valueType, expectedType.valueType, expectedType.nullable, actualType.nullable)) {
        return false
      }
    }

    return true
  }

  uncheckedExpressionDeclaredType(expression: AnyNode): string | null {
    if (typeof expression.declaredType === 'string') {
      return expression.declaredType
    }

    if (expression.type !== 'Reference' || expression.path.length !== 1) {
      return null
    }

    const symbol = this.scope.resolve(firstPathSegment(expression.path))

    if (symbol !== null && typeof symbol.declaredType === 'string') {
      return symbol.declaredType
    }

    return null
  }

  resolveDeclaredObjectUnionAlternatives(
    declaredType: string | null,
    loc: SourceLocation
  ): CheckerObjectUnionAlternative[] {
    const alternatives: CheckerObjectUnionAlternative[] = []

    if (declaredType === null) {
      return alternatives
    }

    this.collectDeclaredObjectUnionAlternatives(declaredType, loc, new Set<string>(), alternatives)
    return alternatives
  }

  collectDeclaredObjectUnionAlternatives(
    declaredType: string,
    loc: SourceLocation,
    seen: Set<string>,
    alternatives: CheckerObjectUnionAlternative[]
  ): void {
    if (seen.has(declaredType)) {
      return
    }

    seen.add(declaredType)

    if (isNullableTypeName(declaredType)) {
      const nonNullableName = nullableTypeNameFromKnownTypeName(declaredType)

      if (nonNullableName !== null) {
        this.collectDeclaredObjectUnionAlternatives(nonNullableName, loc, seen, alternatives)
      }
      return
    }

    const unionNames = unionTypeNamesFromTypeName(declaredType)

    if (unionNames !== null) {
      for (let index = 0; index < unionNames.length; index = index + 1) {
        this.collectDeclaredObjectUnionAlternatives(unionNames[index], loc, seen, alternatives)
      }
      return
    }

    const definition = this.types.get(declaredType) ?? null

    if (definition !== null && definition.kind === 'alias') {
      this.collectDeclaredObjectUnionAlternatives(definition.valueType, loc, seen, alternatives)
      return
    }

    const resolved = this.resolveDeclaredType(declaredType, loc)

    if (resolved.valueType !== 'object' || resolved.shape === null) {
      return
    }

    alternatives.push({ name: declaredType, shape: resolved.shape })
  }

  checkPlainObjectSpreadProperty(property: CheckerObjectPropertyNode): ObjectShapeInfo | null {
    const spreadType = this.checkExpression(property.value)

    this.checkAssignableType(spreadType, 'object', property.loc, false, this.expressionCanBeNull(property.value))
    const spreadShape = this.objectSpreadShapeFromCheckedExpression(property.value, property.loc)

    if (
      spreadShape === null ||
      typeof spreadShape === 'undefined' ||
      (spreadShape.dynamic === true && spreadShape.fields.length === 0)
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
          'object spread of function fields is not supported by the current C++ backend slice',
          property.loc
        )
        return null
      }
    }

    return spreadShape
  }

  objectSpreadShapeFromCheckedExpression(expression: AnyNode, loc: SourceLocation): ObjectShapeInfo | null {
    let spreadShape = this.resolveExpressionShape(expression)

    if (spreadShape?.builtin === 'compiler.AnyNode' || this.isCompilerAnyNodeExpression(expression)) {
      const expandedShape = anyNodeObjectShape(loc)

      if (spreadShape !== null && typeof spreadShape !== 'undefined') {
        mergeShapeFields(expandedShape.fields, spreadShape.fields)
      }
      spreadShape = expandedShape
    }

    return spreadShape
  }

  isCompilerAnyNodeExpression(expression: AnyNode): boolean {
    let declaredType = this.uncheckedExpressionDeclaredType(expression)
    const seen: Set<string> = new Set()

    while (declaredType !== null && !seen.has(declaredType)) {
      if (declaredType === 'AnyNode') {
        return true
      }

      seen.add(declaredType)
      const definition = this.types.get(declaredType) ?? null

      if (definition === null) {
        return false
      }

      if (definition.kind === 'object') {
        return definition.compilerBuiltin === 'compiler.AnyNode'
      }

      if (definition.kind !== 'alias') {
        return false
      }

      declaredType = definition.valueType
    }

    return false
  }

  resolveExpressionShape(expression: AnyNode): ObjectShapeInfo | null {
    return resolveExpressionShapeInContext(this.expressionMetadataContext(), expression)
  }

  resolveArrayIterableElementShape(expression: AnyNode): ObjectShapeInfo | null {
    return resolveArrayIterableElementShapeInContext(this.expressionMetadataContext(), expression)
  }

  refineIndexedArrayElementDeclaredShape(expression: AnyNode, declaredType: string | null): void {
    if (declaredType === null || expression.typeRef?.kind === 'function') {
      return
    }

    expression.declaredType = declaredType
    const shape = expression.shape

    if (shape !== null && typeof shape !== 'undefined' && (shape.dynamic !== true || shape.fields.length > 0)) {
      return
    }

    const resolved = this.resolveDeclaredType(declaredType, expression.loc)

    expression.valueType = resolved.valueType
    this.applyResolvedTypeInfoMetadataToExpression(expression, resolved)
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

  resolveExpressionShapeField(expression: AnyNode, shape: ObjectShapeInfo, name: string): AnyNode | null {
    return resolveExpressionShapeFieldInContext(this.expressionMetadataContext(), expression, shape, name)
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
    const symbol = this.scope.resolve(calleeName)

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
      declaredReturnType: resolvedFunctionType.declaredReturnType ?? null,
      returnTypeRef: resolvedFunctionType.returnTypeRef ?? null,
      returnNullable: resolvedFunctionType.returnNullable,
      returnAsyncResultValueType: resolvedFunctionType.returnAsyncResultValueType,
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
    const properties: CheckerObjectPropertyNode[] = expression.properties
    const keys: Set<string> = new Set()
    const fields: AnyNode[] = []

    for (const property of properties) {
      if (property.spread === true) {
        const spreadShape = this.checkPlainObjectSpreadProperty(property)

        if (spreadShape !== null && typeof spreadShape !== 'undefined') {
          for (const field of spreadShape.fields) {
            this.setObjectLiteralShapeField(fields, field)
          }
        }

        continue
      }

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
        typeRef: property.value.typeRef ?? null,
        asyncResultValueType: this.resolveExpressionAsyncResultValueType(property.value),
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
        const valueTypeNarrowing = this.resolveValueTypeConditionNarrowing(statement.test)
        const narrowingState = this.pushNarrowedNullableNames(narrowing.trueNames, valueTypeNarrowing.trueTypes)

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
    const iterableTypeRef = this.compilerLibraryExpressionTypeRef(statement.iterable, iterableType)
    const iterableElementTypeRef = this.compilerLibraryIterableElementTypeRef(iterableTypeRef)
    const iterableElementMetadata =
      iterableElementTypeRef === null
        ? null
        : typeRefCompatibilityMetadata(
            iterableElementTypeRef,
            resolveCompilerLibrarySet(this.options.libraries),
            statement.nameLoc
          )
    let elementType: ValueType = iterableElementMetadata?.valueType ?? 'unknown'

    let elementDeclaredType =
      this.compilerLibraryTypeRefDeclaredName(iterableElementTypeRef) ?? iterableElementMetadata?.valueType ?? 'unknown'

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

    let shape = iterableElementMetadata?.shape ?? null

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
    statement.asyncResultValueType = iterableElementMetadata?.asyncResultValueType ?? null
    statement.functionType = null
    statement.typeRef = declared?.typeRef ?? iterableElementTypeRef

    this.applyCompilerLibraryForOfIteration(statement, iterableTypeRef)

    if (declared !== null && typeof declared !== 'undefined') {
      if (declared.functionType !== null && typeof declared.functionType !== 'undefined') {
        statement.functionType = declared.functionType
      }
    }

    this.checkForOfBindingElements(statement, elementType, declared?.typeRef ?? iterableElementTypeRef)

    statement.shape = shape

    if (declared !== null && typeof declared !== 'undefined') {
      this.checkAssignableType(elementType, declared.valueType, statement.nameLoc, declared.nullable, false)
    }

    const scopeState = this.pushScope()
    let declaredNullable = false
    let declaredFunctionType: AnyNode | null = null

    if (declared !== null && typeof declared !== 'undefined') {
      declaredNullable = declared.nullable === true

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
        declaredType: inferredDeclaredType,
        typeRef: declared?.typeRef ?? iterableElementTypeRef,
        nullable: declaredNullable,
        functionType: declaredFunctionType,
        shape,
        loc: statement.nameLoc
      },
      statement.nameLoc
    )

    const bindingElements = statement.bindingElements ?? []

    for (const binding of bindingElements) {
      this.declare(
        binding.name,
        {
          kind: statement.kind,
          mutable: statement.kind === 'let',
          valueType: binding.valueType ?? 'unknown',
          typeRef: binding.typeRef ?? null,
          nullable: binding.nullable === true,
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

  compilerLibraryIterableElementTypeRef(typeRef: TypeRef): TypeRef | null {
    if (typeRef.kind === 'parameter') {
      return null
    }

    const traits = typeRefTraits(typeRef, resolveCompilerLibrarySet(this.options.libraries))

    for (let index = 0; index < traits.length; index = index + 1) {
      if (traits[index].traitId === 'iterable' && traits[index].args.length > 0) {
        return traits[index].args[0]
      }
    }

    return null
  }

  compilerLibraryTypeRefDeclaredName(typeRef: TypeRef | null): string | null {
    return typeRefDeclaredName(typeRef, resolveCompilerLibrarySet(this.options.libraries))
  }

  applyCompilerLibraryForOfIteration(statement: AnyNode, iterableTypeRef: TypeRef): void {
    if (iterableTypeRef.kind !== 'nominal') {
      return
    }

    const nativeType = compilerLibraryNativeTypeForId(
      resolveCompilerLibrarySet(this.options.libraries),
      iterableTypeRef.typeId
    )
    const iteration = nativeType?.cIteration

    if (nativeType === null || iteration === null || typeof iteration === 'undefined') {
      return
    }

    statement.libraryCIteratorMethod = iteration.iteratorMethod
    statement.libraryCIteratorNextMethod = iteration.nextMethod
    statement.libraryCIteratorDoneMember = iteration.doneMember
    statement.libraryCIteratorValueMember = iteration.valueMember
    statement.libraryCIteratorReceiverAdapter = iteration.receiverAdapter ?? null
    statement.libraryCIteratorValueAdapter = iteration.valueAdapter ?? null
    statement.libraryCIteratorManagedValue = iteration.managedValue === true
    statement.libraryCIteratorRangeBased = iteration.rangeBased === true
    statement.libraryCIteratorPreservesPendingException = iteration.preservesPendingException === true
    statement.libraryCIteratorCreationFailureMode = iteration.creationFailureMode ?? null
    statement.libraryCIteratorNextFailureMode = iteration.nextFailureMode ?? null
    statement.libraryRuntimeRequirements = nativeType.runtimeRequirements
  }

  checkForOfBindingElements(statement: AnyNode, elementType: ValueType, elementTypeRef: TypeRef | null): void {
    const bindingElements = statement.bindingElements ?? null

    if (bindingElements === null) {
      return
    }

    const nestedElementTypeRef =
      elementTypeRef === null ? null : this.compilerLibraryIterableElementTypeRef(elementTypeRef)

    if (nestedElementTypeRef === null) {
      this.report(
        'INOX_TYPE_MISMATCH',
        `array binding pattern requires an iterable element, got ${elementType}`,
        statement.nameLoc
      )
    }

    for (const binding of bindingElements) {
      const declaredType = this.compilerLibraryTypeRefDeclaredName(nestedElementTypeRef) ?? 'unknown'
      const resolved =
        nestedElementTypeRef === null
          ? this.unresolvedTypeInfo()
          : typeRefCompatibilityMetadata(
              nestedElementTypeRef,
              resolveCompilerLibrarySet(this.options.libraries),
              binding.loc
            )

      binding.declaredType = declaredType
      binding.valueType = resolved.valueType
      binding.typeRef = nestedElementTypeRef
      binding.nullable = resolved.nullable
      binding.functionType = null
      binding.shape = resolved.shape

      if (elementTypeRef !== null) {
        const index = {
          type: 'NumberLiteral',
          value: `${binding.index}`,
          valueType: 'number',
          nullable: false,
          loc: binding.loc
        }
        const receiver = {
          type: 'Reference',
          path: [statement.name],
          valueType: elementType,
          typeRef: elementTypeRef,
          nullable: false,
          shape: typeRefCompatibilityMetadata(
            elementTypeRef,
            resolveCompilerLibrarySet(this.options.libraries),
            binding.loc
          ).shape,
          loc: statement.nameLoc
        }
        const initializer: AnyNode = {
          type: 'IndexExpression',
          object: receiver,
          index,
          valueType: resolved.valueType,
          typeRef: nestedElementTypeRef,
          nullable: resolved.nullable,
          shape: resolved.shape,
          loc: binding.loc
        }
        const operation = this.compilerLibraryReceiverOperation(receiver, '', 'index-read')

        if (operation !== null) {
          const argInfos = [this.checkedCallArgInfo(index, 'number')]
          this.checkCompilerLibrarySingleArgument(index, 'number', operation, 0, initializer, argInfos)
          this.applyCompilerLibraryOperation(initializer, operation, null, null, argInfos)
          binding.init = initializer
        }
      }
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
        const test: AnyNode | null | undefined = item.test

        if (test === null || typeof test === 'undefined') {
          if (hasDefault) {
            this.report('INOX_DUPLICATE_DEFAULT', 'switch can only have one default branch', item.loc)
          }

          hasDefault = true
        } else {
          const caseType = this.checkExpression(test)

          if (!isMatchingSwitchCaseType(caseType, discriminantType)) {
            this.report(
              'INOX_SWITCH_TYPE',
              `switch case type ${caseType} does not match discriminant type ${discriminantType}`,
              nodeSourceLocation(test)
            )
          }
        }

        const scopeState = this.pushScope()

        try {
          this.checkStatements(checkerNodeArrayOrEmpty(item.consequent))
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

    const libraryArgumentNarrowing = this.resolveLibraryArgumentNullableNarrowing(expression)

    if (libraryArgumentNarrowing.trueNames.length > 0 || libraryArgumentNarrowing.falseNames.length > 0) {
      return libraryArgumentNarrowing
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

    if (expression.operator !== '===' && expression.operator !== '!==') {
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
      (expression.left.type === 'NullLiteral' ||
        isNonNullNarrowingLiteral(expression.left) ||
        this.isUndefinedNarrowingLiteral(expression.left))
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
      const optionalNames = optionalChainNarrowingKeys(nullable)
      const narrowingNames = optionalNames.length > 0 ? optionalNames : [key]

      if (expression.operator === '===') {
        return {
          trueNames: narrowingNames,
          falseNames: []
        }
      }

      return {
        trueNames: [],
        falseNames: narrowingNames
      }
    }

    if (maybeNull.type !== 'NullLiteral' && !this.isUndefinedNarrowingLiteral(maybeNull)) {
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

  resolveLibraryArgumentNullableNarrowing(expression: AnyNode): NullableConditionNarrowing {
    const empty: NullableConditionNarrowing = {
      trueNames: [],
      falseNames: []
    }

    if (expression.type !== 'CallExpression') {
      return empty
    }

    const narrowing: LibraryArgumentNarrowingDescriptor | null = expression.libraryArgumentNarrowing ?? null

    if (narrowing === null || typeof narrowing !== 'object') {
      return empty
    }

    const argumentIndex = narrowing.argumentIndex

    if (typeof argumentIndex !== 'number' || argumentIndex < 0 || argumentIndex >= expression.args.length) {
      return empty
    }

    const argument = expression.args[argumentIndex]
    const key = nullableNarrowingKey(argument)

    if (key === null || argument.nullable !== true) {
      return empty
    }

    if (narrowing.trueNonNullable === true) {
      empty.trueNames.push(key)
    }

    if (narrowing.falseNonNullable === true) {
      empty.falseNames.push(key)
    }

    return empty
  }

  isUndefinedNarrowingLiteral(expression: AnyNode): boolean {
    return (
      expression.type === 'Reference' &&
      expression.path.length === 1 &&
      expression.path[0] === 'undefined' &&
      !this.scope.resolve('undefined')
    )
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

  resolveValueTypeConditionNarrowing(expression: AnyNode | null | undefined): CheckerValueTypeConditionNarrowing {
    const empty: CheckerValueTypeConditionNarrowing = {
      trueTypes: [],
      falseTypes: []
    }

    if (expression === null || typeof expression === 'undefined') {
      return empty
    }

    if (expression.type === 'UnaryExpression' && expression.operator === '!') {
      const inner = this.resolveValueTypeConditionNarrowing(expression.argument)

      return {
        trueTypes: inner.falseTypes,
        falseTypes: inner.trueTypes
      }
    }

    const receiverNarrowing = this.resolveCompilerLibraryReceiverConditionNarrowing(expression)

    if (expression.type === 'CallExpression') {
      const narrowing: LibraryArgumentNarrowingDescriptor | null = expression.libraryArgumentNarrowing ?? null

      if (narrowing === null || typeof narrowing !== 'object') {
        return receiverNarrowing
      }

      const argumentIndex = narrowing.argumentIndex

      if (typeof argumentIndex !== 'number' || argumentIndex < 0 || argumentIndex >= expression.args.length) {
        return receiverNarrowing
      }

      const key = nullableNarrowingKey(expression.args[argumentIndex])

      if (key === null) {
        return receiverNarrowing
      }

      const trueTypes: CheckerValueTypeNarrowing[] = []
      const falseTypes: CheckerValueTypeNarrowing[] = []
      const libraries = resolveCompilerLibrarySet(this.options.libraries)
      const trueTypeRef = narrowing.trueTypeRef ?? null
      const falseTypeRef = narrowing.falseTypeRef ?? null
      const expressionLoc = nodeSourceLocation(expression)

      if (trueTypeRef !== null) {
        const refinedTrueTypeRef = this.refineArgumentNarrowingTypeRef(
          expression.args[argumentIndex],
          trueTypeRef,
          expressionLoc
        )
        const metadata = typeRefCompatibilityMetadata(refinedTrueTypeRef, libraries, expressionLoc)

        if (isBuiltinValueType(metadata.valueType)) {
          trueTypes.push({ name: key, typeRef: refinedTrueTypeRef, valueType: metadata.valueType })
        }
      } else if (typeof narrowing.trueValueType === 'string' && isBuiltinValueType(narrowing.trueValueType)) {
        trueTypes.push({ name: key, typeRef: null, valueType: narrowing.trueValueType })
      }

      if (falseTypeRef !== null) {
        const refinedFalseTypeRef = this.refineArgumentNarrowingTypeRef(
          expression.args[argumentIndex],
          falseTypeRef,
          expressionLoc
        )
        const metadata = typeRefCompatibilityMetadata(refinedFalseTypeRef, libraries, expressionLoc)

        if (isBuiltinValueType(metadata.valueType)) {
          falseTypes.push({ name: key, typeRef: refinedFalseTypeRef, valueType: metadata.valueType })
        }
      } else if (typeof narrowing.falseValueType === 'string' && isBuiltinValueType(narrowing.falseValueType)) {
        falseTypes.push({ name: key, typeRef: null, valueType: narrowing.falseValueType })
      }

      return {
        trueTypes: mergeCheckerValueTypeNarrowings(receiverNarrowing.trueTypes, trueTypes),
        falseTypes: mergeCheckerValueTypeNarrowings(receiverNarrowing.falseTypes, falseTypes)
      }
    }

    if (expression.type !== 'BinaryExpression') {
      return receiverNarrowing
    }

    if (expression.operator === '&&' || expression.operator === '||') {
      const left = this.resolveValueTypeConditionNarrowing(expression.left)
      const leftBranchTypes = expression.operator === '&&' ? left.trueTypes : left.falseTypes
      const narrowingState = this.pushNarrowedNullableNames([], leftBranchTypes)
      const right = this.resolveValueTypeConditionNarrowing(expression.right)
      this.restoreNarrowedNullableNames(narrowingState)

      if (expression.operator === '&&') {
        return {
          trueTypes: mergeCheckerValueTypeNarrowings(left.trueTypes, right.trueTypes),
          falseTypes: intersectCheckerValueTypeNarrowings(
            left.falseTypes,
            mergeCheckerValueTypeNarrowings(left.trueTypes, right.falseTypes)
          )
        }
      }

      return {
        trueTypes: intersectCheckerValueTypeNarrowings(
          left.trueTypes,
          mergeCheckerValueTypeNarrowings(left.falseTypes, right.trueTypes)
        ),
        falseTypes: mergeCheckerValueTypeNarrowings(left.falseTypes, right.falseTypes)
      }
    }

    const leftNarrowing = this.resolveValueTypeConditionNarrowing(expression.left)
    const rightNarrowing = this.resolveValueTypeConditionNarrowing(expression.right)
    const evaluatedTypes = mergeCheckerValueTypeNarrowings(
      intersectCheckerValueTypeNarrowings(leftNarrowing.trueTypes, leftNarrowing.falseTypes),
      intersectCheckerValueTypeNarrowings(rightNarrowing.trueTypes, rightNarrowing.falseTypes)
    )

    if (expression.operator !== '===' && expression.operator !== '!==') {
      return {
        trueTypes: evaluatedTypes,
        falseTypes: evaluatedTypes
      }
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
      typeName.type !== 'StringLiteral'
    ) {
      return {
        trueTypes: evaluatedTypes,
        falseTypes: evaluatedTypes
      }
    }

    const narrowedType = typeofValueType(typeName.value)

    if (narrowedType === null) {
      return {
        trueTypes: evaluatedTypes,
        falseTypes: evaluatedTypes
      }
    }

    const narrowingName = nullableNarrowingKey(typeofExpression.argument)

    if (narrowingName === null) {
      return {
        trueTypes: evaluatedTypes,
        falseTypes: evaluatedTypes
      }
    }

    const narrowing = {
      name: narrowingName,
      typeRef: null,
      valueType: narrowedType
    }

    if (expression.operator === '===') {
      return {
        trueTypes: mergeCheckerValueTypeNarrowings(evaluatedTypes, [narrowing]),
        falseTypes: evaluatedTypes
      }
    }

    return {
      trueTypes: evaluatedTypes,
      falseTypes: mergeCheckerValueTypeNarrowings(evaluatedTypes, [narrowing])
    }
  }

  refineArgumentNarrowingTypeRef(argument: AnyNode, narrowingTypeRef: TypeRef, loc: SourceLocation): TypeRef {
    const candidates: TypeRef[] = []

    if (argument.typeRef !== null && typeof argument.typeRef !== 'undefined') {
      candidates.push(argument.typeRef)
    }

    if (typeof argument.declaredType === 'string') {
      this.collectDeclaredTypeRefCandidates(argument.declaredType, loc, candidates)
    }

    let refined: TypeRef | null = null

    for (let index = 0; index < candidates.length; index = index + 1) {
      const candidate = candidates[index]

      if (commonTypeRef(narrowingTypeRef, candidate) === null) {
        continue
      }

      const current = refineTypeRefUnknowns(narrowingTypeRef, candidate)
      refined = refined === null ? current : (commonTypeRef(refined, current) ?? narrowingTypeRef)
    }

    return refined ?? narrowingTypeRef
  }

  collectDeclaredTypeRefCandidates(name: string, loc: SourceLocation, candidates: TypeRef[]): void {
    if (isNullableTypeName(name)) {
      this.collectDeclaredTypeRefCandidates(nullableTypeNameFromKnownTypeName(name), loc, candidates)
      return
    }

    const unionNames = unionTypeNamesFromTypeName(name)

    if (unionNames !== null) {
      for (let index = 0; index < unionNames.length; index = index + 1) {
        this.collectDeclaredTypeRefCandidates(unionNames[index], loc, candidates)
      }

      return
    }

    const resolved = this.resolveDeclaredType(name, loc)

    if (resolved.typeRef !== null) {
      candidates.push(resolved.typeRef)
    }
  }

  resolveCompilerLibraryReceiverConditionNarrowing(expression: AnyNode): CheckerValueTypeConditionNarrowing {
    const empty: CheckerValueTypeConditionNarrowing = {
      trueTypes: [],
      falseTypes: []
    }

    if (typeof expression.libraryOperationId !== 'string' || typeof expression.libraryReceiverTypeId !== 'string') {
      return empty
    }

    const receiver = this.compilerLibraryOperationReceiverExpression(expression)
    const name = nullableNarrowingKey(receiver)
    const typeRef: TypeRef | null = receiver?.typeRef ?? null
    const valueType = receiver?.valueType

    if (name === null || typeRef === null || typeRef.kind === 'unknown' || typeof valueType !== 'string') {
      return empty
    }

    const narrowing: CheckerValueTypeNarrowing = {
      name,
      typeRef,
      valueType: valueType as ValueType
    }

    return {
      trueTypes: [narrowing],
      falseTypes: [narrowing]
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

  pushNarrowedNullableNames(
    names: string[],
    valueTypes: CheckerValueTypeNarrowing[] = []
  ): CheckerNarrowingState | null {
    if (names.length === 0 && valueTypes.length === 0) {
      return null
    }

    return this.pushBranchNarrowedNullableNames(names, valueTypes)
  }

  pushBranchNarrowedNullableNames(
    names: string[],
    valueTypes: CheckerValueTypeNarrowing[] = []
  ): CheckerNarrowingState {
    const previous = {
      narrowedNullableNames: this.narrowedNullableNames,
      narrowedTypeRefs: this.narrowedTypeRefs,
      narrowedValueTypes: this.narrowedValueTypes
    }

    this.narrowedNullableNames = cloneStringSet(previous.narrowedNullableNames)
    this.narrowedTypeRefs = new Map(previous.narrowedTypeRefs)
    this.narrowedValueTypes = new Map(previous.narrowedValueTypes)

    for (const name of names) {
      this.narrowedNullableNames.add(name)
    }

    for (const narrowing of valueTypes) {
      this.narrowedValueTypes.set(narrowing.name, narrowing.valueType)

      if (narrowing.typeRef !== null) {
        this.narrowedTypeRefs.set(narrowing.name, narrowing.typeRef)
      } else {
        this.narrowedTypeRefs.delete(narrowing.name)
      }
    }

    return previous
  }

  restoreNarrowedNullableNames(previous: CheckerNarrowingState | null): void {
    if (previous !== null && typeof previous !== 'undefined') {
      this.narrowedNullableNames = previous.narrowedNullableNames
      this.narrowedTypeRefs = previous.narrowedTypeRefs
      this.narrowedValueTypes = previous.narrowedValueTypes
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
      this.reportUnsupportedSuperReference(nodeSourceLocation(reference))
      return null
    }

    let symbol = this.scope.resolve(root)

    if (
      this.functionDepth > 0 &&
      (symbol === null || typeof symbol === 'undefined' || symbol.kind === 'global') &&
      this.topLevelConstDeclarations.has(root)
    ) {
      const topLevelConst = this.resolveTopLevelConstSymbol(root)

      if (topLevelConst !== null) {
        symbol = topLevelConst
      }
    }

    if (symbol === null || typeof symbol === 'undefined') {
      this.report('INOX_UNKNOWN_NAME', `unknown name ${root}`, reference.loc)
      return null
    }

    return symbol
  }

  resolveTopLevelConstSymbol(name: string): SymbolInfo | null {
    const cached = this.resolvedTopLevelConstSymbols.get(name)

    if (cached !== null && typeof cached !== 'undefined') {
      return cached
    }

    const declaration = this.topLevelConstDeclarations.get(name)

    if (declaration === null || typeof declaration === 'undefined') {
      return null
    }

    const provisional: SymbolInfo = {
      kind: 'const',
      mutable: false,
      valueType: 'unknown',
      nullable: false,
      typeRef: null,
      functionType: null,
      shape: null,
      loc: declaration.loc
    }
    this.resolvedTopLevelConstSymbols.set(name, provisional)

    const scopeState = this.pushScope()

    try {
      this.checkStatement(declaration)
      const resolved = this.scope.bindings.get(name)

      if (resolved !== null && typeof resolved !== 'undefined') {
        this.resolvedTopLevelConstSymbols.set(name, resolved)
        return resolved
      }
    } finally {
      this.restoreScope(scopeState)
    }

    return provisional
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
      incompleteDeclaredTypeDependencies: this.incompleteDeclaredTypeDependencies,
      incompleteDeclaredTypes: this.incompleteDeclaredTypes,
      libraries: resolveCompilerLibrarySet(this.options.libraries),
      resolvedDeclaredTypes: this.resolvedDeclaredTypes,
      resolvingDeclaredTypes: this.resolvingDeclaredTypes,
      retriedIncompleteDeclaredTypes: this.retriedIncompleteDeclaredTypes,
      symbols: this.typeSymbols,
      types: this.types,
      typeSubstitutionNames: new Map(),
      typeSubstitutions: new Map()
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

  callableSymbolContext(): CallableSymbolCheckerContext {
    return {
      declaredTypes: this.declaredTypeContext(),
      diagnostics: this.diagnostics,
      libraries: resolveCompilerLibrarySet(this.options.libraries)
    }
  }

  declareTypeAlias(item: TypeAliasDeclarationNode): void {
    if (this.ambientTypeNames.has(item.name) && !this.localTypeNames.has(item.name)) {
      this.types.delete(item.name)
      this.incompleteDeclaredTypeDependencies.delete(item.name)
      this.incompleteDeclaredTypes.delete(item.name)
      this.resolvedDeclaredTypes.delete(item.name)
    }

    declareTypeAliasInContext(this.declaredTypeContext(), item)
    this.localTypeNames.add(item.name)
  }

  resolveDeclaredType(name: string | null | undefined, loc: SourceLocation | null | undefined): ResolvedTypeInfo {
    const typeLoc = loc ?? { line: 1, column: 1 }
    return resolveDeclaredTypeInContext(this.declaredTypeContext(), name, typeLoc)
  }

  resolveFunctionDeclarationReturnType(item: AnyNode): ResolvedTypeInfo {
    const returnTypeRef = item.returnTypeRef
    let resolved = this.resolveDeclaredType(item.returnType, item.loc)

    if (returnTypeRef !== null && typeof returnTypeRef !== 'undefined') {
      const metadata = typeRefCompatibilityMetadata(
        returnTypeRef,
        resolveCompilerLibrarySet(this.options.libraries),
        nodeSourceLocation(item)
      )

      resolved = {
        valueType: metadata.valueType,
        nullable: metadata.nullable,
        typeRef: returnTypeRef,
        functionType: resolved.functionType,
        shape: metadata.shape,
        asyncResultValueType: metadata.asyncResultValueType
      }
    }

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

  resolveExpressionIterableElementDeclaredName(expression: AnyNode | null | undefined): string | null {
    return resolveExpressionIterableElementDeclaredNameInContext(this.expressionMetadataContext(), expression)
  }

  resolveExpressionIterableElementFunctionType(expression: AnyNode | null | undefined): FunctionTypeMetadata | null {
    return resolveExpressionIterableElementFunctionTypeInContext(this.expressionMetadataContext(), expression)
  }

  resolveExpressionAsyncResultValueType(expression: AnyNode | null | undefined): ValueType | null {
    return resolveExpressionAsyncResultValueTypeInContext(this.expressionMetadataContext(), expression)
  }

  resolveRejectedExpressionValueType(expression: AnyNode | null | undefined): ValueType {
    return resolveRejectedExpressionValueTypeInContext(this.expressionMetadataContext(), expression)
  }

  declare(name: string, symbol: SymbolInfo, loc: SourceLocation | null | undefined): void {
    if (this.scope.hasOwn(name)) {
      this.report('INOX_REDECLARED_NAME', `name ${name} is already declared in this scope`, loc)
      return
    }

    this.scope.bindings.set(name, symbol)
    if (symbol.kind === 'class') {
      this.typeSymbols.set(name, symbol)
    }
    deleteNullableNarrowingKey(this.narrowedNullableNames, name)
    this.narrowedTypeRefs.delete(name)
    this.narrowedValueTypes.delete(name)
  }

  pushScope(): CheckerScopeState {
    const previous = {
      scope: this.scope,
      narrowedNullableNames: this.narrowedNullableNames,
      narrowedTypeRefs: this.narrowedTypeRefs,
      narrowedValueTypes: this.narrowedValueTypes
    }

    this.scope = new CheckerScope(previous.scope)
    this.narrowedNullableNames = cloneStringSet(previous.narrowedNullableNames)
    this.narrowedTypeRefs = new Map(previous.narrowedTypeRefs)
    this.narrowedValueTypes = new Map(previous.narrowedValueTypes)

    return previous
  }

  restoreScope(previous: CheckerScopeState): void {
    this.scope = previous.scope
    this.narrowedNullableNames = previous.narrowedNullableNames
    this.narrowedTypeRefs = previous.narrowedTypeRefs
    this.narrowedValueTypes = previous.narrowedValueTypes
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
    this.narrowedTypeRefs = previous.narrowedTypeRefs
    this.narrowedValueTypes = previous.narrowedValueTypes
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
    returnAsyncResultValueType: ValueType | null,
    returnShape: ObjectShapeInfo | null = null
  ): CheckerReturnContextState {
    const previous = {
      returnType: this.currentReturnType,
      returnNullable: this.currentReturnNullable,
      returnAsyncResultValueType: this.currentReturnAsyncResultValueType,
      returnShape: this.currentReturnShape,
      returnAsync: this.currentReturnAsync
    }

    this.currentReturnType = returnType
    this.currentReturnNullable = returnNullable
    this.currentReturnAsyncResultValueType = returnAsyncResultValueType
    this.currentReturnShape = returnShape
    this.currentReturnAsync = false

    return previous
  }

  restoreReturnContext(previous: CheckerReturnContextState): void {
    this.currentReturnType = previous.returnType
    this.currentReturnNullable = previous.returnNullable
    this.currentReturnAsyncResultValueType = previous.returnAsyncResultValueType
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
    loc: SourceLocation | null | undefined,
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
    loc: SourceLocation | null | undefined,
    actualValueType: ValueType | null | undefined = null
  ): void {
    const expectedTypeId = expectedShape?.libraryTypeId

    if (expectedTypeId === null || typeof expectedTypeId === 'undefined') {
      return
    }

    const actualTypeId = actualShape?.libraryTypeId

    if (actualValueType !== 'object' && (actualTypeId === null || typeof actualTypeId === 'undefined')) {
      return
    }

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

  report(code: string, message: string, loc: SourceLocation | null | undefined): void {
    const item = diagnostic(code, message, loc)
    const diagnostics = this.diagnostics
    diagnostics.push(item)
  }
}

function isUnknownTypeRef(typeRef: TypeRef | null | undefined): boolean {
  return typeRef !== null && typeof typeRef !== 'undefined' && typeRef.kind === 'unknown'
}

function commonInferredFunctionReturn(
  candidates: InferredFunctionReturnCandidate[]
): InferredFunctionReturnCandidate {
  if (candidates.length === 0) {
    return {
      valueType: 'void',
      nullable: false,
      typeRef: null,
      functionType: null,
      shape: null,
      asyncResultValueType: null
    }
  }

  const valueTypes: ValueType[] = []

  for (let index = 0; index < candidates.length; index = index + 1) {
    valueTypes.push(candidates[index].valueType)
  }

  const valueType = commonValueType(valueTypes)
  const typeRef = commonInferredFunctionReturnTypeRef(candidates)

  return {
    valueType,
    nullable: inferredFunctionReturnCanBeNull(candidates),
    typeRef,
    functionType: candidates[0].functionType,
    shape: valueType === 'object' && typeRef === null ? commonResolvedObjectShape(candidates) : null,
    asyncResultValueType: commonInferredFunctionReturnAsyncResultValueType(candidates)
  }
}

function inferredAsyncResultTypeRef(
  operation: LibraryOperationDescriptor,
  fulfilled: InferredFunctionReturnCandidate
): TypeRef | null {
  const resultTypeRef = operation.resultTypeRef

  if (resultTypeRef === null || typeof resultTypeRef === 'undefined') {
    return null
  }

  const fulfilledTypeRef = typeRefFromResolvedTypeInContext(fulfilled)
  const substitutions: TypeRefSubstitution[] = []
  const parameters = operation.typeParameters ?? []
  let fulfilledParameterName: string | null = null

  for (let parameterIndex = 0; parameterIndex < parameters.length; parameterIndex = parameterIndex + 1) {
    const sources = parameters[parameterIndex].sources

    for (let sourceIndex = 0; sourceIndex < sources.length; sourceIndex = sourceIndex + 1) {
      const source = sources[sourceIndex]

      if (source.source === 'contextual-type-argument' && (source.argumentIndex ?? -1) === 0) {
        fulfilledParameterName = parameters[parameterIndex].name
        break
      }
    }

    if (fulfilledParameterName !== null) {
      break
    }
  }

  if (fulfilledParameterName === null) {
    return null
  }

  for (let index = 0; index < parameters.length; index = index + 1) {
    substitutions.push({
      name: parameters[index].name,
      typeRef:
        parameters[index].name === fulfilledParameterName
          ? fulfilledTypeRef
          : {
              kind: 'unknown',
              nullable: false,
              ownership: 'value',
              traits: []
            }
    })
  }

  return substituteTypeRef(resultTypeRef, substitutions)
}

function inferredAsyncFulfilledCandidates(
  candidates: InferredFunctionReturnCandidate[],
  libraries: CompilerLibrarySet,
  loc: SourceLocation
): InferredFunctionReturnCandidate[] {
  const result: InferredFunctionReturnCandidate[] = []

  for (let index = 0; index < candidates.length; index = index + 1) {
    const candidate = candidates[index]

    if (candidate.valueType !== 'async-result') {
      result.push(candidate)
      continue
    }

    const fulfilledTypeRef = typeRefTraitArgument(candidate.typeRef, 'awaitable', 0, libraries)

    if (fulfilledTypeRef !== null) {
      const metadata = typeRefCompatibilityMetadata(fulfilledTypeRef, libraries, loc)

      result.push({
        valueType: metadata.valueType,
        nullable: metadata.nullable,
        typeRef: fulfilledTypeRef,
        functionType: null,
        shape: metadata.shape,
        asyncResultValueType: metadata.asyncResultValueType
      })
      continue
    }

    result.push({
      valueType: candidate.asyncResultValueType ?? 'unknown',
      nullable: false,
      typeRef: null,
      functionType: null,
      shape: null,
      asyncResultValueType: null
    })
  }

  return result
}

function commonInferredFunctionReturnTypeRef(candidates: InferredFunctionReturnCandidate[]): TypeRef | null {
  const first = candidates[0].typeRef

  if (first === null) {
    return null
  }

  let result: TypeRef | null = first

  for (let index = 1; index < candidates.length; index = index + 1) {
    const candidate = candidates[index].typeRef

    if (candidate === null) {
      return null
    }

    result = commonTypeRef(result, candidate)

    if (result === null) {
      return null
    }
  }

  return result
}

function commonInferredFunctionReturnAsyncResultValueType(
  candidates: InferredFunctionReturnCandidate[]
): ValueType | null {
  const valueTypes: ValueType[] = []

  for (let index = 0; index < candidates.length; index = index + 1) {
    const valueType = candidates[index].asyncResultValueType

    if (valueType === null) {
      return null
    }

    valueTypes.push(valueType)
  }

  return commonValueType(valueTypes)
}

function inferredFunctionReturnCanBeNull(candidates: InferredFunctionReturnCandidate[]): boolean {
  for (let index = 0; index < candidates.length; index = index + 1) {
    if (candidates[index].nullable || candidates[index].valueType === 'null') {
      return true
    }
  }

  return false
}

function compilerLibraryTypeRefsEqual(left: TypeRef, right: TypeRef): boolean {
  if (left.kind !== right.kind) {
    return false
  }

  if (left.kind === 'parameter' && right.kind === 'parameter') {
    return left.name === right.name && (left.nullable === true) === (right.nullable === true)
  }

  if (left.kind === 'primitive' && right.kind === 'primitive') {
    return left.name === right.name && compilerLibraryConcreteTypeRefQualifiersEqual(left, right)
  }

  if (left.kind === 'nominal' && right.kind === 'nominal') {
    return (
      left.typeId === right.typeId &&
      compilerLibraryConcreteTypeRefQualifiersEqual(left, right) &&
      compilerLibraryTypeRefListsEqual(left.args, right.args)
    )
  }

  if (left.kind === 'function' && right.kind === 'function') {
    return (
      compilerLibraryConcreteTypeRefQualifiersEqual(left, right) &&
      compilerLibraryTypeRefListsEqual(left.params, right.params) &&
      compilerLibraryTypeRefsEqual(left.result, right.result)
    )
  }

  if (left.kind === 'object' && right.kind === 'object') {
    return false
  }

  return (
    left.kind === 'unknown' && right.kind === 'unknown' && compilerLibraryConcreteTypeRefQualifiersEqual(left, right)
  )
}

function compilerLibraryConcreteTypeRefQualifiersEqual(left: ConcreteTypeRef, right: ConcreteTypeRef): boolean {
  return left.nullable === right.nullable && left.ownership === right.ownership
}

function compilerLibraryTypeRefListsEqual(left: TypeRef[], right: TypeRef[]): boolean {
  if (left.length !== right.length) {
    return false
  }

  for (let index = 0; index < left.length; index = index + 1) {
    if (!compilerLibraryTypeRefsEqual(left[index], right[index])) {
      return false
    }
  }

  return true
}

function compilerLibraryCallArgument(expression: AnyNode, index: number): AnyNode | null {
  if (
    (expression.type !== 'CallExpression' && expression.type !== 'NewExpression') ||
    !Array.isArray(expression.args) ||
    index >= expression.args.length
  ) {
    return null
  }

  return expression.args[index]
}

function markObjectShapeDynamic(shape: ObjectShapeInfo | null | undefined): void {
  if (shape === null || typeof shape === 'undefined') {
    return
  }

  shape.dynamic = true

  for (let index = 0; index < shape.fields.length; index = index + 1) {
    markObjectShapeDynamic(shape.fields[index].shape)
  }
}

function templatePlaceholderHasLibraryOperation(value: AnyNode | AnyNode[] | null | undefined): boolean {
  if (Array.isArray(value)) {
    for (const item of value) {
      if (templatePlaceholderHasLibraryOperation(item)) {
        return true
      }
    }

    return false
  }

  if (value === null || typeof value === 'undefined') {
    return false
  }

  if (typeof value.libraryOperationId === 'string') {
    return true
  }

  return (
    templatePlaceholderHasLibraryOperation(value.args) ||
    templatePlaceholderHasLibraryOperation(value.callee) ||
    templatePlaceholderHasLibraryOperation(value.object) ||
    templatePlaceholderHasLibraryOperation(value.index) ||
    templatePlaceholderHasLibraryOperation(value.argument) ||
    templatePlaceholderHasLibraryOperation(value.expression) ||
    templatePlaceholderHasLibraryOperation(value.left) ||
    templatePlaceholderHasLibraryOperation(value.right) ||
    templatePlaceholderHasLibraryOperation(value.elements) ||
    templatePlaceholderHasLibraryOperation(value.properties) ||
    templatePlaceholderHasLibraryOperation(value.value) ||
    templatePlaceholderHasLibraryOperation(value.target) ||
    templatePlaceholderHasLibraryOperation(value.test) ||
    templatePlaceholderHasLibraryOperation(value.consequent) ||
    templatePlaceholderHasLibraryOperation(value.alternate)
  )
}

function markTemplatePlaceholderNodes(value: AnyNode | AnyNode[] | null | undefined): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      markTemplatePlaceholderNodes(item)
    }

    return
  }

  if (value === null || typeof value === 'undefined' || typeof value !== 'object') {
    return
  }

  value.templatePlaceholder = true
  markTemplatePlaceholderNodes(value.args)
  markTemplatePlaceholderNodes(value.callee)
  markTemplatePlaceholderNodes(value.object)
  markTemplatePlaceholderNodes(value.index)
  markTemplatePlaceholderNodes(value.argument)
  markTemplatePlaceholderNodes(value.expression)
  markTemplatePlaceholderNodes(value.left)
  markTemplatePlaceholderNodes(value.right)
  markTemplatePlaceholderNodes(value.elements)
  markTemplatePlaceholderNodes(value.properties)
  markTemplatePlaceholderNodes(value.value)
  markTemplatePlaceholderNodes(value.target)
  markTemplatePlaceholderNodes(value.test)
  markTemplatePlaceholderNodes(value.consequent)
  markTemplatePlaceholderNodes(value.alternate)
}

function nodeSourceLocation(node: AnyNode): SourceLocation {
  let loc: SourceLocation = { line: 1, column: 1 }
  const nodeLoc = node.loc

  if (nodeLoc !== null && typeof nodeLoc !== 'undefined') {
    loc = nodeLoc
  }

  return loc
}

function checkerNodeArrayOrEmpty(value: AnyNode | AnyNode[] | null | undefined): AnyNode[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
}

function nonNullableTypeRef(typeRef: TypeRef | null | undefined): TypeRef | null {
  if (typeRef === null || typeof typeRef === 'undefined') {
    return null
  }

  return { ...typeRef, nullable: false }
}

function isAnyTypedExpression(expression: AnyNode | null | undefined): boolean {
  if (expression === null || typeof expression === 'undefined') {
    return false
  }

  if (expression.declaredType === 'any') {
    return true
  }

  if (
    expression.type === 'MemberExpression' ||
    expression.type === 'OptionalMemberExpression' ||
    expression.type === 'IndexExpression' ||
    expression.type === 'OptionalIndexExpression'
  ) {
    return isAnyTypedExpression(expression.object)
  }

  return false
}

function isNonNullableTypeofName(value: string): boolean {
  return value === 'string' || value === 'number' || value === 'boolean' || value === 'function'
}

function typeofValueType(value: string): ValueType | null {
  if (value === 'string' || value === 'number' || value === 'boolean' || value === 'function') {
    return value
  }

  return null
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
