import { diagnostic } from '../../diagnostics.ts'
import { collectIrLocalThrowValueTypes, collectIrPrograms } from '../../ir.ts'
import type { IrLocalThrowValueTypeOptions } from '../../ir/effects.ts'
import type { IrModuleRecord } from '../../ir/top-level.ts'
import type {
  AnyNode,
  Diagnostic,
  IrFunctionDeclaration,
  IrFunctionEffect,
  IrProgram,
  IrThrowValueType,
  ModuleGraph,
  SourceLocation
} from '../../types.ts'
import {
  compilerLibraryNativeCppTypeIsAssignableToTypeId,
  compilerLibraryOperationForIntrinsic
} from '../../extensions/library-set.ts'

import type { CallbackLoweringDependencies, RuntimeCallbackArgumentInfo } from './async/callbacks.ts'
import {
  callbackContextWrapperCaptures,
  callbackContextWrapperContextTypeName,
  callbackContextWrapperFinalizerName,
  callbackContextWrapperNeedsEventLoop,
  collectFunctionPointerParamNames,
  emitFunctionPointerParams,
  emitFunctionPointerReturnType,
  emitRuntimeArrowCallbackContextFinalizerDeclaration,
  emitRuntimeArrowCallbackContextLocals,
  emitRuntimeArrowCaptureField,
  functionUsesExternalEventLoop,
  hasRuntimeArrowCallbackContext,
  isNullableFunctionType,
  isPlainObjectFunctionField,
  isAsyncResultChainCallbackWrapperWithContext,
  isRetainedRuntimeArrowCapture,
  isRuntimeObjectFunctionField,
  isRuntimeFunctionType,
  isSupportedMutableRuntimeArrowCapture,
  isSupportedRuntimeCallbackType,
  normalizeFunctionType,
  registerFunctionPointerRuntimeAdapter,
  resolveRuntimeFunctionArgumentType,
  runtimeCallbackWrapperFor
} from './async/callbacks.ts'
import type { AsyncResultChainLoweringDependencies, AsyncResultLoweringDependencies } from './async/async-results.ts'
import {
  cAsyncResultOperationKind,
  emitPreparedAsyncResultConstructorExpression,
  emitPreparedAsyncResultExpression,
  emitPreparedAsyncResultChainExpression,
  emitPreparedAsyncResultReturningCallExpression,
  emitPreparedAsyncResultStaticExpression,
  emitAsyncResultConstructorSettlementCall,
  isAsyncFunctionCallee,
  isExternalEventLoopFunctionCallee,
  isAsyncResultConstructorExpression,
  isAsyncResultReturningFunctionCallee,
  knownValueType,
  resolveCAsyncFunctionAwaitValueType,
  resolveAsyncResultExpressionValueType
} from './async/async-results.ts'
import { collectLocalAwaitRejectionValueTypes, inferRejectedValueType } from './async/rejections.ts'
import type { RejectionValueTypeDependencies } from './async/rejections.ts'
import type { AsyncTaskLoweringDependencies } from './async/tasks.ts'
import type { CEmitContextWithDependencies, CFunctionContextWithDependencies } from './context.ts'
import {
  createFunctionContext,
  emitBoxedValueCleanup,
  emitBoxedValueDeclarations,
  emitCleanupReturn,
  emitErrorChannelDeclarations,
  emitEventLoopReference,
  emitFailureStatement,
  emitLoopFlowDeclarations,
  emitOwnedValueCleanup,
  emitOwnedValueDeclarations,
  emitPrepareOwnedValueWrite,
  emitReturnFlowDeclarations,
  emitReturnValueDeclarations,
  emitRuntimeTypeCheck,
  emitStatusCheck,
  isRuntimeBoxedValueType,
  nextCName,
  pushDiagnostic,
  pushVariableScope,
  registerBoxedValue,
  registerEventLoop,
  registerOwnedAsyncResult,
  registerOwnedValue,
  restoreVariableScope,
  shouldEmitCleanupLabel
} from './context.ts'
import {
  emitClassConstructorDeclaration as emitClassConstructorDeclarationWithDependencies,
  emitClassMethodDeclaration as emitClassMethodDeclarationWithDependencies,
  emitClassMethodHead,
  emitClassMethodPrototype,
  emitFunctionDeclaration as emitFunctionDeclarationWithDependencies,
  emitFunctionHead,
  reportUnsupportedCFunctionType
} from './declarations.ts'
import { reportCJsGlobalDiagnostic } from './diagnostics.ts'
import { formatGeneratedC } from './format.ts'
import {
  cStringLiteral,
  emitCFunctionName,
  emitCIdentifier,
  emitCObjectFunctionFieldName,
  escapeCPrintfFormatText,
  utf8ByteLength
} from './identifiers.ts'
import {
  emitCModuleHeader as emitCModuleHeaderWithDependencies,
  emitCModuleSource as emitCModuleSourceWithDependencies
} from './module-emission.ts'
import type { CppModuleFileEmitters } from './modules.ts'
import { emitCppModuleFilesFromGraph as emitCppModuleFilesFromGraphWithEmitters } from './modules.ts'
import {
  compilerLibraryRuntimeCallbackArgumentInfo,
  compilerLibraryStringConstantValue,
  emitPreparedCompilerLibraryCallExpression as emitPreparedCompilerLibraryCallExpressionWithDependencies,
  emitPreparedCompilerLibraryExpression,
  emitPreparedCompilerLibraryNativeFieldExpression,
  isCompilerLibraryNativeFieldExpression,
  isCompilerLibraryExternalEventLoopCallExpression,
  isCompilerLibraryAsyncResultExpression,
  isCompilerLibraryStringExpression,
  type CompilerLibraryLoweringDependencies
} from './library-operations.ts'
import {
  emitRuntimeNullableValueCheck,
  emitRuntimeValueCheck,
  runtimeObjectLikeValueMismatchCondition
} from './runtime-values.ts'
import { cUnsupportedExpressionCode, isCoalesceExpression } from './syntax.ts'
import type {
  CAsyncTaskWrapper,
  CppEmitOptions,
  CFunctionParam,
  CFunctionType,
  CKnownObjectField,
  CKnownObjectIndexField,
  CppModuleEmitOptions,
  CppModuleOutputFile,
  CModulePlan,
  CObjectAccessorReturnPath,
  CObjectShape,
  CObjectShapeField,
  CRuntimeTypeAlternative,
  CRuntimeArrowCallbackWrapper,
  CRuntimeArrowCapture,
  CPreparedCallArgs as PreparedCallArgs,
  CPreparedCallOptions as PreparedCallOptions,
  CPreparedFunctionCompanion,
  CPreparedExpression as PreparedExpression,
  CTypeRefMap
} from './types.ts'
import { cCompilerLibrarySetValue, cFunctionTypeValue, cTypeRefMapValue, isReadonlyCObjectShapeField } from './types.ts'
import type { CCompilerLibrarySet } from './types.ts'
import { emitCUnit as emitCUnitWithDependencies } from './unit.ts'
import type { CUnitDependencies } from './unit.ts'
import {
  cIterableElementDeclaredName,
  cIterableElementFunctionType,
  cFunctionTypeFromTypeRef,
  cCallExpressionReturnsTypeErasedValue,
  cRuntimeValueAdapterInfo,
  cRuntimeValueTag,
  applyLibraryNativeValueAdapter,
  compilerLibraryIntrinsicAsyncResultCExpression,
  compilerLibraryIntrinsicAsyncResultCValidExpression,
  compilerLibraryIntrinsicNativeCAwaitExpression,
  compilerLibraryIntrinsicNativeCAwaitHandlesInvalidSource,
  compilerLibraryIntrinsicNativeCppType,
  compilerLibraryIntrinsicSequenceMaterialization,
  compilerLibraryNativeRuntimeValueValidExpressionForTypeRef,
  requireCompilerLibraryAsyncResultCppType,
  isManagedRuntimeReturnType,
  isNullableScalarType,
  isOpaqueRuntimeValueType,
  isRuntimeNullableType,
  libraryNativeCppType,
  libraryNativeValueAdapter,
  resolveCCompilerLibrarySet
} from './value-types.ts'
import type { CRuntimeValueAdapterInfo } from './value-types.ts'
import type { ClassLoweringDependencies } from './values/classes.ts'
import {
  cClassNameFromValueType,
  emitCClassInfoDescriptorName,
  emitCClassObjectValueExpression as emitCClassObjectValueExpressionWithDependencies,
  emitClassObjectVariableDeclaration as emitClassObjectVariableDeclarationWithDependencies,
  emitCNativeClassAssignmentLines,
  emitPreparedClassInstanceRefValueExpression,
  emitPreparedNativeClassInstanceExpression,
  emitPreparedNativeClassFieldScalarExpression,
  emitPreparedNativeClassFieldValueExpression,
  emitPreparedClassMethodCallExpression as emitPreparedClassMethodCallExpressionWithDependencies,
  hasNativeClassInstanceMethod,
  isClassConstructorExpression as isClassConstructorExpressionWithDependencies,
  resolveNativeClassFieldMetadata
} from './values/classes.ts'
import {
  emitCExpression as emitCExpressionWithDependencies,
  emitCValueExpression as emitCValueExpressionWithDependencies,
  emitCallExpression as emitCallExpressionWithDependencies,
  emitCallee as emitCalleeFromExpressions,
  emitPreparedCallArgs as emitPreparedCallArgsWithDependencies,
  emitPreparedCallExpression as emitPreparedCallExpressionWithDependencies,
  emitPreparedNumberExpression as emitPreparedNumberExpressionWithDependencies,
  emitPreparedRuntimeStringReferenceValue,
  emitPreparedRuntimeTruthinessExpression as emitPreparedRuntimeTruthinessExpressionWithDependencies,
  emitPreparedUpdateExpression as emitPreparedUpdateExpressionWithDependencies,
  emitObjectFunctionCompanionReference,
  emitCConditionClause,
  isDynamicRuntimeValueExpression as isDynamicRuntimeValueExpressionWithDependencies,
  isThrowingFunctionCallee as isThrowingFunctionCalleeFromExpressions,
  isThrowingFunctionName as isThrowingFunctionNameFromExpressions,
  objectExpressionPathName
} from './values/expressions.ts'
import type { NullableLoweringDependencies } from './values/nullable.ts'
import {
  canLowerCNullishCoalescingExpression,
  clearNullableScalarNarrowing,
  emitCOptionalIndexValueExpression,
  emitCOptionalMemberValueExpression,
  emitNullableRuntimeValueVariableDeclaration,
  isNarrowedNullableScalarExpression,
  isNullableRuntimeExpression,
  isNullableScalarRuntimeExpression,
  resolveNullableScalarConditionNarrowing
} from './values/nullable.ts'
import type { ObjectExpressionFieldDependencies, ObjectVariableDeclarationDependencies } from './values/objects.ts'
import {
  appendCompilerAnyNodeFallbackShapeFields,
  appendCompilerObjectShapeInfoFallbackShapeFields,
  compilerAnyNodeFallbackShapeHasField,
  emitDynamicObjectFieldAssignment,
  emitObjectValueReference,
  emitObjectVariableDeclaration,
  emitPreparedDynamicObjectIndexValueExpression,
  emitPreparedDynamicObjectMemberValueExpression,
  emitPreparedObjectFieldRuntimeValueExpression,
  emitPreparedKnownObjectIndexValueExpression,
  emitPreparedKnownObjectMemberValueExpression,
  emitPreparedObjectExpressionIndexValueExpression,
  emitPreparedObjectExpressionMemberValueExpression,
  emitPreparedObjectExpressionScalarIndexValueExpression,
  emitPreparedObjectExpressionScalarMemberValueExpression,
  isIndexAccessExpression,
  isCompilerObjectShapeInfoShape,
  isMemberAccessExpression,
  registerObjectShape,
  resolveCObjectExpressionName,
  resolveKnownObjectIndex,
  resolveKnownObjectMember,
  resolveObjectExpressionIndex,
  resolveObjectExpressionMember,
  updateKnownObjectMemberValueType
} from './values/objects.ts'
import type { StatementLoweringDependencies } from './values/statements.ts'
import {
  currentErrorTarget,
  currentErrorTargetRequiresActive,
  emitBreakJump,
  emitContinueJump,
  emitExpressionStatement,
  emitForOfStatement,
  emitForStatement,
  emitFunctionScalarVariableDeclaration,
  emitIfStatement,
  emitNumberBooleanScalarVariableDeclaration,
  emitReturnStatement,
  emitRuntimeCallbackRuntimeValueReturnLines,
  emitStatementBody,
  emitStatementList,
  emitStringScalarVariableDeclaration,
  emitSwitchStatement,
  emitThrowStatement,
  emitTryStatement,
  emitVariableDeclarationStatement,
  emitWhileStatement,
  registerErrorChannel,
  registerErrorValue,
  registerRuntimeValueMetadata
} from './values/statements.ts'
import type { StringLoweringDependencies } from './values/strings.ts'
import {
  canEmitStringBytesOperand,
  collectTemplatePlaceholderExpressions,
  emitCStringConcatValueExpression,
  emitCTemplateLiteralFormatExpression,
  emitCTemplateLiteralValueExpression,
  emitPreparedCppStringArgument,
  emitPreparedStringBytesOperand,
  emitPreparedStringCompareExpression,
  emitStringExpression,
  isRuntimeProducedStringExpression,
  isStringConcatExpression,
  resolveRuntimeStringReference
} from './values/strings.ts'
import {
  anyNodeLikeDeclaredObjectFieldValueType,
  inferExpressionType as inferExpressionTypeWithDependencies,
  type CExpressionTypeDependencies
} from './values/types.ts'
export type { CppModuleOutputFile } from './types.ts'

type CEmitContext = CEmitContextWithDependencies<
  AsyncTaskLoweringDependencies,
  ClassLoweringDependencies,
  NullableLoweringDependencies,
  StatementLoweringDependencies,
  StringLoweringDependencies
>
type CFunctionContext = CFunctionContextWithDependencies<
  AsyncTaskLoweringDependencies,
  ClassLoweringDependencies,
  NullableLoweringDependencies,
  StatementLoweringDependencies,
  StringLoweringDependencies
>

type CSourceLocation = SourceLocation | null | undefined
type CDynamicObjectFieldNode = AnyNode
type CAccessorNode = CDynamicObjectFieldNode
type CModuleObjectAssignment = {
  name: string
  value: CAccessorNode
}

function cIndexNodeOrNull(value: AnyNode | AnyNode[] | null | undefined): AnyNode | null {
  if (value === null || typeof value === 'undefined' || Array.isArray(value)) {
    return null
  }

  return value
}

type CObjectLiteralPropertyNode = {
  key: string
  loc?: SourceLocation
  spread?: boolean
  value: AnyNode
}
type CPreparedObjectSpread = {
  functionCompanions: CPreparedFunctionCompanion[]
  name: string
  property: CObjectLiteralPropertyNode
}
type CStringMap = Map<string, string>
type CNameSet = Set<string>
type RuntimeLogGetSource =
  | {
      kind: 'known-object'
      member: CKnownObjectField
    }
  | {
      kind: 'known-object-index'
      field: CKnownObjectIndexField
    }

type CThrowingFunctionInfo = {
  functionThrowValueTypes: Map<string, IrThrowValueType[]>
  pendingExceptionFunctions: CNameSet
  throwingFunctions: CNameSet
}

function firstKnownValueTypeOrUnknown(
  first: string | null | undefined,
  second: string | null | undefined,
  third: string | null | undefined
): string {
  const firstKnown = knownValueType(first)

  if (firstKnown !== null && typeof firstKnown !== 'undefined') {
    return firstKnown
  }

  const secondKnown = knownValueType(second)

  if (secondKnown !== null && typeof secondKnown !== 'undefined') {
    return secondKnown
  }

  const thirdKnown = knownValueType(third)

  if (thirdKnown !== null && typeof thirdKnown !== 'undefined') {
    return thirdKnown
  }

  return 'unknown'
}

let objectVariableDeclarationDependencies = {} as ObjectVariableDeclarationDependencies
let objectExpressionFieldDependencies: ObjectExpressionFieldDependencies = {
  emitCValueExpression,
  emitPreparedStringBytesOperand,
  inferExpressionType
}
let compilerLibraryLoweringDependencies = {} as CompilerLibraryLoweringDependencies
let asyncResultLoweringDependencies = {} as AsyncResultLoweringDependencies

const nullableLoweringDependencies: NullableLoweringDependencies = {
  emitCObjectLiteralValueExpression,
  emitCValueExpression,
  emitNullableFunctionValueExpression,
  emitNullableScalarValueExpression,
  inferExpressionType,
  resolveRuntimeCallbackCalleeType
}

const statementLoweringDependencies = {
  emitArrayVariableDeclaration,
  emitAwaitValueVariableDeclaration,
  emitBoxedObjectVariableDeclaration,
  emitCAwaitValueExpression,
  emitClassObjectVariableDeclaration,
  emitCExpression,
  emitCObjectLiteralValueExpression,
  emitCValueExpression,
  emitPreparedRuntimeValueArgumentExpression,
  emitDynamicObjectMemberVariableDeclaration,
  emitDynamicObjectMemberAssignment,
  emitDynamicObjectFieldAssignment: (expression: CDynamicObjectFieldNode, context: CFunctionContext) =>
    emitDynamicObjectFieldAssignment(expression, context, objectExpressionFieldDependencies),
  emitFailureStatement,
  emitFunctionPointerVariable,
  emitFunctionPointerVariableWithCInitializer,
  emitKnownObjectMemberAssignment,
  emitKnownObjectMemberVariableDeclaration,
  emitNullableScalarValueExpression,
  emitNullableRuntimeValueAssignment,
  emitObjectFunctionCompanionReference,
  emitObjectVariableDeclaration,
  emitOptionalCallbackCallExpression,
  objectVariableDeclarationDependencies,
  emitPreparedAsyncFunctionAsyncResultCallExpression,
  emitPreparedCallExpression,
  emitPreparedClassMethodCallExpression,
  emitPreparedNumberExpression,
  emitPreparedCompilerLibraryCallExpression,
  emitPreparedRuntimeTruthinessExpression: emitPreparedStatementRuntimeTruthinessExpression,
  emitPreparedAsyncResultConstructorExpression: (
    expression: AnyNode,
    context: CFunctionContext,
    options?: PreparedCallOptions
  ) => emitPreparedAsyncResultConstructorExpression(expression, context, asyncResultLoweringDependencies, options),
  emitPreparedAsyncResultExpression: (expression: AnyNode, context: CFunctionContext, options?: PreparedCallOptions) =>
    emitPreparedAsyncResultExpression(expression, context, asyncResultLoweringDependencies, options),
  emitPreparedAsyncResultChainExpression: (
    expression: AnyNode,
    context: CFunctionContext,
    options?: PreparedCallOptions
  ) => emitPreparedAsyncResultChainExpression(expression, context, asyncResultLoweringDependencies, options),
  emitPreparedAsyncResultReturningCallExpression: (
    expression: AnyNode,
    context: CFunctionContext,
    options?: PreparedCallOptions
  ) => emitPreparedAsyncResultReturningCallExpression(expression, context, asyncResultLoweringDependencies, options),
  emitPreparedAsyncResultStaticExpression: (
    expression: AnyNode,
    context: CFunctionContext,
    options?: PreparedCallOptions
  ) => emitPreparedAsyncResultStaticExpression(expression, context, asyncResultLoweringDependencies, options),
  emitPreparedUpdateExpression,
  emitAsyncResultConstructorSettlementCall: (expression: AnyNode, context: CFunctionContext) =>
    emitAsyncResultConstructorSettlementCall(expression, context, asyncResultLoweringDependencies),
  emitReference,
  emitModuleValueVariableAssignment,
  emitRuntimeCallbackVariableDeclaration,
  emitScalarVariableDeclaration,
  emitStatement,
  emitStringExpression,
  inferCatchBindingValueType,
  inferExpressionType,
  isBoxedRuntimeValueAssignment,
  isClassConstructorExpression,
  isExceptionValueExpression,
  isIndexAccessExpression,
  isDynamicRuntimeValueExpression: isStatementDynamicRuntimeValueExpression,
  isMemberAccessExpression,
  isNullableRuntimeValueAssignment,
  isRuntimeProducedStringExpression,
  registerExceptionValueShape,
  resolveKnownObjectIndex,
  resolveKnownObjectMember,
  resolveNullableScalarConditionNarrowing,
  resolveRuntimeStringReference,
  emitBoxedRuntimeValueAssignment
} as StatementLoweringDependencies

const classLoweringDependencies: ClassLoweringDependencies = {
  emitCFieldFlags,
  emitCValueExpression,
  emitPreparedCallArgs,
  emitRuntimeCallbackValue
}

function emitClassObjectVariableDeclaration(statement: AnyNode, context: CFunctionContext): string[] {
  return emitClassObjectVariableDeclarationWithDependencies(statement, context)
}

function emitCClassObjectValueExpression(expression: AnyNode, context: CFunctionContext): PreparedExpression {
  return emitCClassObjectValueExpressionWithDependencies(expression, context)
}

function emitPreparedClassMethodCallExpression(
  expression: AnyNode,
  context: CFunctionContext,
  options: PreparedCallOptions = {}
): PreparedExpression | null {
  return emitPreparedClassMethodCallExpressionWithDependencies(expression, context, options)
}

function isClassConstructorExpression(expression: AnyNode, context: CFunctionContext): boolean {
  return isClassConstructorExpressionWithDependencies(expression, context)
}

objectVariableDeclarationDependencies = {
  emitCFieldFlags,
  emitFunctionPointerVariable: (
    name: string,
    init: AnyNode,
    context,
    isConst: boolean,
    functionType: CFunctionType | null | undefined,
    loc,
    seenTypes: string[] = []
  ) => emitFunctionPointerVariable(name, init, context as CFunctionContext, isConst, functionType, loc, seenTypes),
  emitFunctionPointerVariableWithCInitializer: (
    name: string,
    init: string,
    context,
    isConst: boolean,
    functionType: CFunctionType | null | undefined,
    loc,
    seenTypes: string[] = []
  ) =>
    emitFunctionPointerVariableWithCInitializer(
      name,
      init,
      context as CFunctionContext,
      isConst,
      functionType,
      loc,
      seenTypes
    ),
  emitRuntimeCallbackValueInto: (
    expression: AnyNode,
    functionType: CFunctionType | null | undefined,
    out: string,
    context
  ) => emitRuntimeCallbackValueInto(expression, functionType, out, context as CFunctionContext),
  emitCValueExpression,
  emitObjectFieldValueExpression: (field, value, context) =>
    emitObjectFieldValueExpression(field, value, context as CFunctionContext),
  inferExpressionType,
  resolveFunctionValueType: (expression, context) => resolveFunctionValueType(expression, context as CFunctionContext)
}
statementLoweringDependencies.objectVariableDeclarationDependencies = objectVariableDeclarationDependencies

function emitPreparedIntrinsicStringConversionExpression(
  expression: AnyNode,
  context: CFunctionContext
): PreparedExpression | null {
  const operation = compilerLibraryOperationForIntrinsic(
    cCompilerLibrarySetValue(context.libraries),
    'string-conversion',
    'call'
  )

  if (operation === null) {
    return null
  }

  const variant = operation.variants?.find(
    (candidate) =>
      (candidate.minArgs ?? operation.minArgs ?? 0) <= 1 && (candidate.maxArgs ?? operation.maxArgs ?? 1) >= 1
  )
  const cExpression = variant?.cExpression ?? operation.cExpression

  if (typeof cExpression !== 'string') {
    return null
  }

  const resultMapping = variant?.cResultMapping ?? operation.cResultMapping
  const resultTypeRef = variant?.resultTypeRef ?? operation.resultTypeRef
  const call: AnyNode = {
    type: 'CallExpression',
    callee: { type: 'Reference', path: [], loc: expression.loc },
    args: [expression],
    loc: expression.loc,
    valueType: 'string',
    libraryOperationId: operation.operationId,
    libraryCExpression: cExpression,
    libraryCArgumentKinds: variant?.cArgumentKinds ?? operation.cArgumentKinds,
    libraryCArgumentAdapters: variant?.cArgumentAdapters ?? operation.cArgumentAdapters,
    libraryCArgumentAdapterTypeIds: variant?.cArgumentAdapterTypeIds ?? operation.cArgumentAdapterTypeIds,
    libraryCArgumentMethodNames: variant?.cArgumentMethodNames ?? operation.cArgumentMethodNames,
    libraryCArgumentSources: variant?.cArgumentSources ?? operation.cArgumentSources,
    libraryCCallStyle: operation.cCallStyle,
    libraryCFailureMode: operation.cFailureMode,
    libraryCPreservesPendingException: operation.cPreservesPendingException === true,
    libraryCReceiverAdapter: variant?.cReceiverAdapter ?? operation.cReceiverAdapter,
    libraryCResultAdapter: variant?.cResultAdapter ?? operation.cResultAdapter,
    libraryCResultMode: variant?.cResultMode ?? operation.cResultMode,
    libraryCppType: resultMapping?.cppType ?? null,
    nullable: resultTypeRef?.kind !== 'parameter' && resultTypeRef?.nullable === true,
    libraryOwned: resultTypeRef?.kind !== 'parameter' && resultTypeRef?.ownership === 'owned'
  }

  return emitPreparedCompilerLibraryCallExpression(call, context)
}

function emitPreparedNativeClassStringFieldExpression(
  expression: AnyNode,
  context: CFunctionContext
): PreparedExpression | null {
  const field = emitPreparedNativeClassFieldValueExpression(expression, context)

  if (field === null || typeof field === 'undefined' || field.valueType !== 'string') {
    return null
  }

  return field
}

compilerLibraryLoweringDependencies = {
  emitCValueExpression,
  emitPreparedClassInstanceRefValueExpression,
  emitPreparedClassMethodCallExpression: (expression: AnyNode, context: CFunctionContext) =>
    emitPreparedClassMethodCallExpression(expression, context, {}),
  emitPreparedNumberExpression,
  emitPreparedRuntimeValueArgumentExpression,
  emitPreparedStringBytesOperand,
  emitRuntimeCallbackValue,
  emitThrownCheckLines,
  hasClassInstanceMethod: hasNativeClassInstanceMethod,
  inferExpressionType,
  registerObjectShape
}

const rejectionValueTypeDependencies: RejectionValueTypeDependencies = {
  cAsyncResultOperationKind,
  inferExpressionType,
  isKnownExceptionValueExpression
}

asyncResultLoweringDependencies = {
  emitCValueExpression,
  emitPreparedAsyncFunctionAsyncResultCallExpression,
  emitPreparedCallExpression,
  emitPreparedCompilerLibraryCallExpression,
  emitRuntimeArrowCaptureStoreLines,
  emitStatementList,
  inferExpressionType,
  inferRejectedValueType: (expression: AnyNode, context: CFunctionContext) =>
    inferRejectedValueType(expression, context, rejectionValueTypeDependencies),
  isAsyncResultChainCallbackWrapperWithContext
}

const stringLoweringDependencies = {
  canLowerCNullishCoalescingExpression,
  emitCallExpression,
  emitCValueExpression,
  emitObjectValueReference,
  emitPreparedConfiguredRuntimeStringExpression,
  emitPreparedObjectExpressionIndexValueExpression: (expression: AnyNode, context: CFunctionContext) =>
    emitPreparedObjectExpressionIndexValueExpression(expression, context, objectExpressionFieldDependencies),
  emitPreparedObjectExpressionMemberValueExpression: (expression: AnyNode, context: CFunctionContext) =>
    emitPreparedObjectExpressionMemberValueExpression(expression, context, objectExpressionFieldDependencies),
  emitPreparedNumberExpression,
  emitPreparedNativeClassStringFieldExpression,
  emitPreparedIntrinsicStringConversionExpression,
  emitReference,
  inferExpressionType,
  isBoxedRuntimeStringName,
  isBoxedRuntimeStringReference,
  isMemberAccessExpression,
  isConfiguredRuntimeProducedStringExpression,
  isNullableScalarRuntimeExpression,
  configuredRuntimeStringConstantValue: runtimeStringConstantValue,
  resolveKnownObjectIndex,
  resolveKnownObjectMember
} as StringLoweringDependencies

function emitPreparedConfiguredRuntimeStringExpression(
  expression: AnyNode,
  context: CFunctionContext
): PreparedExpression | null {
  const libraryCall = emitPreparedCompilerLibraryCallExpression(expression, context)

  if (libraryCall !== null && libraryCall.cppType === 'inox::String') {
    return libraryCall
  }

  const libraryExpression = emitPreparedCompilerLibraryExpression(expression)

  if (libraryExpression !== null) {
    return libraryExpression
  }

  return null
}

function emitPreparedCompilerLibraryCallExpression(
  expression: AnyNode,
  context: CFunctionContext,
  options?: PreparedCallOptions | null
): PreparedExpression | null {
  const argumentKinds = expression.libraryCArgumentKinds

  if (
    expression.type === 'CallExpression' &&
    argumentKinds !== null &&
    typeof argumentKinds !== 'undefined' &&
    argumentKinds.length === 1 &&
    argumentKinds[0] === 'variadic-format-values' &&
    typeof expression.libraryCExpression === 'string'
  ) {
    return {
      lines: emitVariadicFormattedLibraryCallStatement(
        expression.libraryCExpression,
        expression.args,
        context,
        typeof expression.libraryCClassFormatExpression === 'string' ? expression.libraryCClassFormatExpression : null
      ),
      expression: '',
      valueType: 'void'
    }
  }

  const inheritedDeferredCheck = context.deferredThrownCheckDepth > 0
  const resultCppType = expression.libraryCppType ?? expression.shape?.libraryCppType
  const directScalarResult =
    (resultCppType === null || typeof resultCppType === 'undefined') &&
    (expression.valueType === 'number' || expression.valueType === 'boolean')
  const directNativeResult =
    typeof resultCppType === 'string' && resultCppType !== 'inox::Value' && resultCppType !== 'inox_value'
  const deferThisCall =
    inheritedDeferredCheck &&
    expression.libraryCPreservesPendingException === true &&
    (directScalarResult || directNativeResult)
  let loweringOptions = options

  if (inheritedDeferredCheck) {
    context.deferredThrownCheckDepth = context.deferredThrownCheckDepth - 1
  }

  if (deferThisCall && options?.deferThrownCheck !== true) {
    if (options === null || typeof options === 'undefined') {
      loweringOptions = {
        deferThrownCheck: true
      }
    } else {
      loweringOptions = {
        ...options,
        deferThrownCheck: true
      }
    }
  }

  const value = emitPreparedCompilerLibraryCallExpressionWithDependencies(
    expression,
    context,
    compilerLibraryLoweringDependencies,
    loweringOptions
  )

  if (value?.pendingExceptionDeferred === true) {
    context.deferredThrownCheckCount = context.deferredThrownCheckCount + 1
  }

  if (inheritedDeferredCheck) {
    context.deferredThrownCheckDepth = context.deferredThrownCheckDepth + 1
  }

  return value
}

function runtimeStringConstantValue(expression: AnyNode | null | undefined): string | null {
  const libraryValue = compilerLibraryStringConstantValue(expression)

  if (libraryValue !== null) {
    return libraryValue
  }

  return null
}

function isConfiguredRuntimeProducedStringExpression(expression: AnyNode | null | undefined): boolean {
  return isCompilerLibraryStringExpression(expression)
}

function runtimeCallbackArgumentInfoForNodeStdlibCall(expression: AnyNode): RuntimeCallbackArgumentInfo | null {
  const libraryCallback = compilerLibraryRuntimeCallbackArgumentInfo(expression)

  if (libraryCallback !== null) {
    return libraryCallback
  }

  return null
}

function isConfiguredExternalEventLoopCallExpression(expression: AnyNode | null | undefined): boolean {
  return (
    isCompilerLibraryExternalEventLoopCallExpression(expression) || isCompilerLibraryAsyncResultExpression(expression)
  )
}

const callbackLoweringDependencies: CallbackLoweringDependencies = {
  collectTemplatePlaceholderExpressions,
  createFunctionContext,
  emitBoxedValueCleanup,
  emitBoxedValueDeclarations,
  emitCleanupReturn,
  emitErrorChannelDeclarations,
  emitLoopFlowDeclarations,
  emitOwnedValueCleanup,
  emitOwnedValueDeclarations,
  emitPreparedNumberExpression,
  emitReturnFlowDeclarations,
  emitReturnValueDeclarations,
  emitRuntimeCallbackRuntimeValueReturnLines,
  emitStatementList,
  isExternalEventLoopCallExpression: isConfiguredExternalEventLoopCallExpression,
  registerObjectShape,
  runtimeCallbackArgumentInfoForCall: runtimeCallbackArgumentInfoForNodeStdlibCall,
  shouldEmitCleanupLabel
}

const asyncResultChainLoweringDependencies: AsyncResultChainLoweringDependencies = {
  callbackLoweringDependencies,
  createFunctionContext,
  emitBoxedValueCleanup,
  emitBoxedValueDeclarations,
  emitErrorChannelDeclarations,
  emitLoopFlowDeclarations,
  emitOwnedValueCleanup,
  emitOwnedValueDeclarations,
  emitPreparedNumberExpression,
  emitReturnFlowDeclarations,
  emitRuntimeArrowCallbackContextFinalizerDeclaration,
  emitRuntimeArrowCallbackContextLocals,
  emitRuntimeCallbackRuntimeValueReturnLines,
  emitStatementList,
  isAsyncResultChainCallbackWrapperWithContext
}

function isRuntimeStringReference(expression: AnyNode, context: CFunctionContext): boolean {
  return resolveRuntimeStringReference(expression, context) !== null
}

const asyncTaskLoweringDependencies: AsyncTaskLoweringDependencies = {
  createFunctionContext,
  emitCallee,
  emitCValueExpression,
  emitFunctionHead: (statement, context) => emitFunctionHead(statement, context as CFunctionContext),
  emitOwnedValueCleanup,
  emitOwnedValueDeclarations,
  emitPreparedCallArgs,
  emitPreparedCallExpression,
  emitPreparedCompilerLibraryCallExpression,
  emitPreparedNumberExpression,
  emitPreparedStringBytesOperand,
  emitRuntimeArrowCaptureStoreLines,
  emitStatementList,
  inferExpressionType,
  isCompilerLibraryAsyncResultExpression,
  isIndexAccessExpression,
  isMemberAccessExpression,
  isRuntimeStringReference,
  isRuntimeProducedStringExpression,
  isThrowingFunctionCallee: (callee, context) => isThrowingFunctionCallee(callee, context as CFunctionContext),
  pushVariableScope: (context) => pushVariableScope(context as CFunctionContext) as any,
  registerObjectShape,
  registerRuntimeValueMetadata,
  resolveFunctionParams: (callee, context) => resolveFunctionParams(callee, context as CFunctionContext),
  resolveKnownObjectIndex,
  resolveKnownObjectMember,
  restoreVariableScope: (context, snapshot) => restoreVariableScope(context as CFunctionContext, snapshot as any)
}

const declarationEmissionDependencies = {
  asyncTaskLoweringDependencies,
  emitPreparedNumberExpression,
  emitStatementList
}

const expressionTypeDependencies = {
  cAsyncResultOperationKind,
  isClassConstructorExpression,
  isIndexAccessExpression,
  isMemberAccessExpression,
  isAsyncResultConstructorExpression,
  isAsyncResultReturningFunctionCallee,
  knownValueType,
  resolveKnownObjectIndex,
  resolveKnownObjectMember,
  resolveObjectExpressionIndex,
  resolveObjectExpressionMember,
  resolveAsyncResultExpressionValueType
} as CExpressionTypeDependencies

function currentCExpressionErrorTarget(errorTargets: string[]): string {
  if (errorTargets.length === 0) {
    return ''
  }

  return errorTargets[errorTargets.length - 1] ?? ''
}

const cCallExpressionDependencies = {
  currentErrorTarget: currentCExpressionErrorTarget,
  emitCExpression,
  emitCObjectLiteralValueExpression,
  emitCValueExpression,
  emitObjectValueReference,
  emitFunctionPointerAdapter,
  emitFunctionPointerRuntimeCallbackValue,
  emitFunctionValueExpression,
  emitNullableFunctionValueExpression,
  emitNullableScalarValueExpression,
  emitPreparedCompilerLibraryCallExpression,
  emitPreparedClassMethodCallExpression,
  emitPreparedNumberExpression,
  emitPreparedAsyncResultChainExpression: (expression: AnyNode, context: CFunctionContext) =>
    emitPreparedAsyncResultChainExpression(expression, context, asyncResultLoweringDependencies),
  emitPreparedAsyncResultStaticExpression: (expression: AnyNode, context: CFunctionContext) =>
    emitPreparedAsyncResultStaticExpression(expression, context, asyncResultLoweringDependencies),
  emitRuntimeCallbackCall,
  emitRuntimeCallbackValue,
  inferExpressionType,
  isExternalEventLoopFunctionCallee,
  isNullableFunctionType,
  isAsyncResultReturningFunctionCallee,
  resolveFunctionValueType,
  resolveFunctionParams,
  resolveRuntimeCallbackCalleeType,
  resolveRuntimeFunctionArgumentType
}

const cScalarExpressionDependencies = {
  canEmitStringBytesOperand,
  emitCAwaitValueExpression,
  emitCValueExpression,
  emitObjectValueReference,
  emitPreparedCallExpression,
  emitPreparedClassMethodCallExpression,
  emitNullableScalarValueExpression,
  emitPreparedNullableScalarRuntimeValueExpression,
  emitPreparedObjectExpressionScalarIndexValueExpression: (expression: AnyNode, context: CFunctionContext) =>
    emitPreparedObjectExpressionScalarIndexValueExpression(expression, context, objectExpressionFieldDependencies),
  emitPreparedObjectExpressionScalarMemberValueExpression: (expression: AnyNode, context: CFunctionContext) =>
    emitPreparedObjectExpressionScalarMemberValueExpression(expression, context, objectExpressionFieldDependencies),
  emitPreparedNumberExpression,
  emitPreparedCompilerLibraryCallExpression,
  emitPreparedCompilerLibraryExpression,
  emitPreparedCppStringArgument,
  emitPreparedStringBytesOperand,
  emitPreparedStringCompareExpression,
  emitReference,
  emitStringExpression,
  inferExpressionType,
  isIndexAccessExpression,
  isMemberAccessExpression,
  isNullableRuntimeExpression,
  isNullableScalarRuntimeExpression,
  reportCJsGlobalDiagnostic,
  resolveKnownObjectIndex,
  resolveKnownObjectMember
}

function emitPreparedStatementRuntimeTruthinessExpression(
  expression: CDynamicObjectFieldNode,
  context: CFunctionContext
): PreparedExpression | null {
  return emitPreparedRuntimeTruthinessExpressionWithDependencies(expression, context, cScalarExpressionDependencies)
}

function isStatementDynamicRuntimeValueExpression(
  expression: CDynamicObjectFieldNode,
  context: CFunctionContext
): boolean {
  return isDynamicRuntimeValueExpressionWithDependencies(expression, context, cScalarExpressionDependencies)
}

const cValueExpressionDependencies = {
  emitCArrayLiteralValueExpression,
  emitCAwaitValueExpression,
  emitCClassObjectValueExpression,
  emitCNullishCoalescingValueExpression,
  emitCObjectLiteralValueExpression,
  emitCOptionalIndexValueExpression,
  emitCOptionalMemberValueExpression,
  emitCStringConcatValueExpression,
  emitCTemplateLiteralValueExpression,
  emitCValueExpression,
  emitOptionalCallbackCallValueExpression,
  emitPreparedCallExpression,
  emitPreparedClassMethodCallExpression,
  emitPreparedKnownObjectIndexValueExpression,
  emitPreparedKnownObjectMemberValueExpression,
  emitPreparedNullableScalarRuntimeValueExpression,
  emitPreparedNumberExpression,
  emitPreparedDynamicObjectIndexValueExpression: (expression: CDynamicObjectFieldNode, context: CFunctionContext) =>
    emitPreparedDynamicObjectIndexValueExpression(expression, context, objectExpressionFieldDependencies),
  emitPreparedDynamicObjectMemberValueExpression: (expression: CDynamicObjectFieldNode, context: CFunctionContext) =>
    emitPreparedDynamicObjectMemberValueExpression(expression, context, objectExpressionFieldDependencies),
  emitPreparedObjectExpressionIndexValueExpression: (expression: AnyNode, context: CFunctionContext) =>
    emitPreparedObjectExpressionIndexValueExpression(expression, context, objectExpressionFieldDependencies),
  emitPreparedObjectExpressionMemberValueExpression: (expression: AnyNode, context: CFunctionContext) =>
    emitPreparedObjectExpressionMemberValueExpression(expression, context, objectExpressionFieldDependencies),
  emitPreparedCompilerLibraryCallExpression,
  emitPreparedCompilerLibraryExpression,
  emitPreparedRuntimeTruthinessExpression: emitPreparedStatementRuntimeTruthinessExpression,
  inferExpressionType,
  isBoxedRuntimeValueName,
  isClassConstructorExpression,
  isIndexAccessExpression,
  isMemberAccessExpression,
  isNullableRuntimeExpression,
  isNullableScalarRuntimeExpression,
  isStringConcatExpression
}

const cUnitDependencies: CUnitDependencies = {
  asyncTaskLoweringDependencies,
  callbackLoweringDependencies,
  classLoweringDependencies,
  collectExternalEventLoopFunctions,
  createBaseContext,
  declarationEmissionDependencies,
  nullableLoweringDependencies,
  asyncResultChainLoweringDependencies,
  statementLoweringDependencies,
  stringLoweringDependencies
}

const cModuleEmissionDependencies = {
  asyncTaskLoweringDependencies,
  callbackLoweringDependencies,
  classLoweringDependencies,
  collectExternalEventLoopFunctions,
  createBaseContext,
  declarationEmissionDependencies,
  emitClassConstructorDeclaration: emitClassConstructorDeclarationWithDependencies,
  emitClassMethodDeclaration: emitClassMethodDeclarationWithDependencies,
  emitClassMethodHead,
  emitClassMethodPrototype,
  emitFunctionDeclaration: emitFunctionDeclarationWithDependencies,
  emitFunctionHead,
  emitStatementList,
  nullableLoweringDependencies,
  asyncResultChainLoweringDependencies,
  statementLoweringDependencies,
  stringLoweringDependencies
}

export function emitCppFromIr(ir: IrProgram, options: CppEmitOptions = {}): string {
  const irPrograms = [ir]
  const entryIrPrograms = [ir]
  const unit = emitCUnit(irPrograms, options, entryIrPrograms, null)

  return formatGeneratedC(unit, 'inox.generated.c')
}

export function emitCppBundleFromIrModules(
  irModules: IrModuleRecord[],
  entry: string,
  options: CppEmitOptions = {}
): string {
  const irPrograms = collectIrPrograms(irModules)
  let entryIndex = -1

  for (let index = 0; index < irModules.length; index++) {
    const module = irModules[index]

    if (module.path === entry) {
      entryIndex = index
      break
    }
  }

  const entryModules: IrModuleRecord[] = []
  if (entryIndex < 0) {
    for (const module of irModules) {
      entryModules.push(module)
    }
  } else {
    for (let index = 0; index <= entryIndex && index < irModules.length; index++) {
      entryModules.push(irModules[index])
    }
  }

  const entryIrPrograms = collectIrPrograms(entryModules)

  const unit = emitCUnit(irPrograms, options, entryIrPrograms, entry)
  const code = formatGeneratedC(unit, 'inox.bundle.c')

  return code
}

export function emitCppModuleFilesFromGraph(graph: ModuleGraph, options: CppModuleEmitOptions): CppModuleOutputFile[] {
  const emitters: CppModuleFileEmitters = {
    emitHeader: emitCModuleHeaderForGraph,
    emitSource: emitCModuleSourceForGraph
  }

  return emitCppModuleFilesFromGraphWithEmitters(graph, options, emitters)
}

function emitCModuleHeaderForGraph(
  plan: CModulePlan,
  plans: CModulePlan[],
  emitOptions: CppModuleEmitOptions,
  diagnostics: Diagnostic[]
): string {
  return emitCModuleHeaderWithDependencies(plan, plans, emitOptions, diagnostics, cModuleEmissionDependencies)
}

function emitCModuleSourceForGraph(
  plan: CModulePlan,
  plans: CModulePlan[],
  emitOptions: CppModuleEmitOptions,
  diagnostics: Diagnostic[]
): string {
  return emitCModuleSourceWithDependencies(plan, plans, emitOptions, diagnostics, cModuleEmissionDependencies)
}

function emitCUnit(
  irPrograms: IrProgram[],
  options: CppEmitOptions,
  entryIrPrograms: IrProgram[],
  entryPath: string | null
): string {
  return emitCUnitWithDependencies(irPrograms, options, entryIrPrograms, entryPath, cUnitDependencies)
}

function createThrowingFunctionInfo(
  functionDeclarations: IrFunctionDeclaration[],
  functionEffects: IrFunctionEffect[]
): CThrowingFunctionInfo {
  const functionThrowValueTypes: Map<string, IrThrowValueType[]> = new Map()
  const pendingExceptionFunctions: CNameSet = new Set()
  const throwingFunctions: CNameSet = new Set()

  for (const item of functionDeclarations) {
    functionThrowValueTypes.set(item.name, [])
  }

  for (const effect of functionEffects) {
    if (!functionThrowValueTypes.has(effect.name)) {
      continue
    }

    functionThrowValueTypes.set(effect.name, effect.throwValueTypes)

    if (effect.name !== 'main' && (effect.mayLeavePendingException === true || effect.throws)) {
      pendingExceptionFunctions.add(effect.name)
    }

    if (effect.name !== 'main' && effect.throws) {
      throwingFunctions.add(effect.name)
    }
  }

  return {
    functionThrowValueTypes,
    pendingExceptionFunctions,
    throwingFunctions
  }
}

function joinStrings(values: string[], separator: string): string {
  let result = ''

  for (let index = 0; index < values.length; index = index + 1) {
    if (index > 0) {
      result = result + separator
    }

    result = result + values[index]
  }

  return result
}

function emitCFieldFlags(field: AnyNode): string {
  const flags: string[] = []

  if (isReadonlyCObjectShapeField(field)) {
    flags.push('INOX_FIELD_READONLY')
  }

  if (field.ownership === 'weak') {
    flags.push('INOX_FIELD_WEAK')
  }

  if (flags.length === 0) {
    return '0'
  }

  return joinStrings(flags, ' | ')
}

function createBaseContext(
  diagnostics: Diagnostic[],
  functionDeclarations: IrFunctionDeclaration[],
  functionEffects: IrFunctionEffect[],
  jsGlobalRoots: CNameSet,
  topLevelNodes: CAccessorNode[],
  libraries?: CCompilerLibrarySet
): CEmitContext {
  const throwing = createThrowingFunctionInfo(functionDeclarations, functionEffects)
  const functionNames: CStringMap = new Map()
  const functionParams: Map<string, CFunctionParam[]> = new Map()
  const functionReturnDeclaredTypes: Map<string, any> = new Map()
  const functionReturnNullables: Map<string, boolean> = new Map()
  const functionReturnRuntimeTypeAlternatives: Map<string, CRuntimeTypeAlternative[]> = new Map()
  const functionReturnAsyncResultValueTypes: Map<string, any> = new Map()
  const functionReturnShapes: Map<string, any> = new Map()
  const functionReturnTypeRefs: CTypeRefMap = new Map()
  const functionReturnTypes: CStringMap = new Map()
  const functionAsyncFlags: Map<string, boolean> = new Map()
  const objectAccessorReturnPaths = collectObjectAccessorReturnPaths(topLevelNodes)
  const unhandledRejectionFlag: string | null = null

  for (const item of functionDeclarations) {
    let returnAsyncResultValueType: string | null = null
    let returnShape: CObjectShape | null = null

    if (item.returnAsyncResultValueType !== null && typeof item.returnAsyncResultValueType !== 'undefined') {
      returnAsyncResultValueType = item.returnAsyncResultValueType
    }

    if (item.returnShape !== null && typeof item.returnShape !== 'undefined') {
      returnShape = item.returnShape
    }

    functionNames.set(item.name, emitCFunctionName(item.name))
    functionParams.set(item.name, item.params as CFunctionParam[])
    functionReturnDeclaredTypes.set(item.name, item.declaredReturnType ?? null)
    functionReturnNullables.set(item.name, item.returnNullable === true)
    if (item.returnRuntimeTypeAlternatives !== null && typeof item.returnRuntimeTypeAlternatives !== 'undefined') {
      functionReturnRuntimeTypeAlternatives.set(
        item.name,
        item.returnRuntimeTypeAlternatives as CRuntimeTypeAlternative[]
      )
    }
    functionReturnAsyncResultValueTypes.set(item.name, returnAsyncResultValueType)
    functionReturnShapes.set(item.name, returnShape)
    functionReturnTypeRefs.set(item.name, item.returnTypeRef ?? null)
    functionReturnTypes.set(item.name, item.returnType)
    functionAsyncFlags.set(item.name, item.async === true)
  }

  const moduleObjectShapes = collectModuleObjectShapes(
    topLevelNodes,
    functionParams,
    functionReturnTypeRefs,
    functionReturnNullables,
    functionReturnRuntimeTypeAlternatives,
    functionReturnAsyncResultValueTypes,
    functionReturnShapes,
    functionReturnTypes
  )

  return {
    boxedMutableCaptureDeclarations: new Set(),
    classInfos: new Map(),
    callbackArrowWrappers: new Map(),
    callbackWrappers: new Map(),
    asyncTaskLoweringDependencies,
    statementLoweringDependencies,
    classLoweringDependencies,
    nullableLoweringDependencies,
    pendingExceptionFunctions: throwing.pendingExceptionFunctions,
    stringLoweringDependencies,
    diagnostics,
    exceptionValueShape: null,
    functionThrowValueTypes: throwing.functionThrowValueTypes,
    functionNames,
    functionParams,
    functionPointerAdapterNames: new Map(),
    functionPointerAdapters: [],
    functionPointerRuntimeAdapterNames: new Map(),
    functionPointerRuntimeAdapters: [],
    functionReturnDeclaredTypes,
    functionReturnNullables,
    functionReturnRuntimeTypeAlternatives,
    functionReturnAsyncResultValueTypes,
    functionReturnShapes,
    functionReturnTypeRefs,
    functionReturnTypes,
    functionAsyncFlags,
    asyncTaskWrappers: new Map(),
    jsGlobalRoots,
    libraries: resolveCCompilerLibrarySet(libraries),
    runtimeInitializerDefinitions: [],
    moduleCompileTimeValueInitializers: new Map(),
    moduleValueNames: new Map(),
    moduleValueCppTypes: new Map(),
    moduleRuntimeValueNames: new Set(),
    objectAccessorReturnPaths,
    moduleObjectShapes,
    moduleValueTypes: new Map(),
    asyncResultChainArrowWrappers: new Map(),
    asyncResultChainWrappers: new Map(),
    runtimeEntrypointAdapter: null,
    runtimeFunctionParams: new Map(),
    runtimeEntryPath: null,
    externalEventLoopFunctions: new Set(),
    throwingFunctions: throwing.throwingFunctions,
    unhandledRejectionFlag,
    nextId: 0
  }
}

function collectModuleObjectShapes(
  statements: CAccessorNode[],
  functionParams: Map<string, CFunctionParam[]>,
  functionReturnTypeRefs: CTypeRefMap,
  functionReturnNullables: Map<string, boolean>,
  functionReturnRuntimeTypeAlternatives: Map<string, CRuntimeTypeAlternative[]>,
  functionReturnAsyncResultValueTypes: Map<string, any>,
  functionReturnShapes: Map<string, any>,
  functionReturnTypes: CStringMap
): Map<string, CObjectShapeField[]> {
  const result: Map<string, CObjectShapeField[]> = new Map()

  for (const statement of statements) {
    if (
      statement.type === 'VariableDeclaration' &&
      statement.valueType === 'object' &&
      statement.shape !== null &&
      typeof statement.shape !== 'undefined' &&
      statement.shape.builtin !== 'compiler.AnyNode' &&
      statement.shape.fields !== null &&
      typeof statement.shape.fields !== 'undefined'
    ) {
      registerModuleObjectShape(result, statement.name, statement.shape.fields)
    }
  }

  for (const statement of statements) {
    const init = cIndexNodeOrNull(statement.init)

    if (
      statement.type === 'VariableDeclaration' &&
      statement.valueType === 'object' &&
      statement.shape !== null &&
      typeof statement.shape !== 'undefined' &&
      statement.shape.builtin !== 'compiler.AnyNode' &&
      statement.shape.fields !== null &&
      typeof statement.shape.fields !== 'undefined'
    ) {
      registerModuleObjectShape(result, statement.name, statement.shape.fields)

      if (init !== null && init.type === 'ObjectLiteral') {
        const fields = collectModuleObjectLiteralShapeFields(
          init,
          functionParams,
          functionReturnTypeRefs,
          functionReturnNullables,
          functionReturnRuntimeTypeAlternatives,
          functionReturnAsyncResultValueTypes,
          functionReturnShapes,
          functionReturnTypes,
          result,
          statement.shape.fields
        )

        if (fields.length > 0) {
          registerModuleObjectShape(result, statement.name, fields)
        }
      }

      continue
    }

    if (
      statement.type === 'VariableDeclaration' &&
      statement.valueType === 'object' &&
      init !== null &&
      init.type === 'ObjectLiteral'
    ) {
      const fields = collectModuleObjectLiteralShapeFields(
        init,
        functionParams,
        functionReturnTypeRefs,
        functionReturnNullables,
        functionReturnRuntimeTypeAlternatives,
        functionReturnAsyncResultValueTypes,
        functionReturnShapes,
        functionReturnTypes,
        result
      )

      if (fields.length > 0) {
        registerModuleObjectShape(result, statement.name, fields)
      }

      continue
    }

    const assignment = resolveModuleObjectAssignment(statement)

    if (assignment === null) {
      continue
    }

    const fields = collectModuleObjectLiteralShapeFields(
      assignment.value,
      functionParams,
      functionReturnTypeRefs,
      functionReturnNullables,
      functionReturnRuntimeTypeAlternatives,
      functionReturnAsyncResultValueTypes,
      functionReturnShapes,
      functionReturnTypes,
      result
    )

    if (fields.length > 0) {
      registerModuleObjectShape(result, assignment.name, fields)
    }
  }

  return result
}

function resolveModuleObjectAssignment(statement: CAccessorNode): CModuleObjectAssignment | null {
  const expression = cIndexNodeOrNull(statement.expression)

  if (statement.type !== 'ExpressionStatement' || expression === null || expression.type !== 'AssignmentExpression') {
    return null
  }

  const target = cIndexNodeOrNull(expression.target)
  const value = cIndexNodeOrNull(expression.value)

  if (target === null || target.type !== 'Reference' || target.path.length !== 1) {
    return null
  }

  if (value === null || value.type !== 'ObjectLiteral') {
    return null
  }

  return {
    name: joinStrings(target.path, ''),
    value
  }
}

function registerModuleObjectShape(
  shapes: Map<string, CObjectShapeField[]>,
  name: string,
  fields: CObjectShapeField[]
): void {
  const existing = shapes.get(name)

  if (existing === null || typeof existing === 'undefined') {
    shapes.set(name, fields)
  } else {
    for (const field of fields) {
      const index = moduleObjectShapeFieldIndex(existing, field.name)

      if (index === -1) {
        existing.push(field)
      } else {
        const existingField = existing[index]

        if (existingField === null || typeof existingField === 'undefined') {
          continue
        }

        if (field.functionStorage === 'pointer') {
          existingField.functionStorage = 'pointer'
        }

        if (shouldReplaceModuleObjectShapeField(existingField, field)) {
          existingField.valueType = field.valueType
          existingField.declaredType = field.declaredType
          existingField.functionType = field.functionType
          existingField.functionStorage = field.functionStorage
          existingField.functionTypeOwnership = field.functionTypeOwnership
          existingField.nullable = field.nullable
          existingField.optional = field.optional
          existingField.ownership = field.ownership
          existingField.readonlyField = field.readonlyField
          existingField.shape = field.shape
          existingField.shapeOwnership = field.shapeOwnership
        }
      }
    }
  }

  for (const field of fields) {
    if (
      field.valueType === 'object' &&
      field.shape !== null &&
      typeof field.shape !== 'undefined' &&
      field.shape.fields !== null &&
      typeof field.shape.fields !== 'undefined'
    ) {
      registerModuleObjectShape(shapes, `${name}_${field.name}`, field.shape.fields)
    }
  }
}

function shouldReplaceModuleObjectShapeField(existingField: CObjectShapeField, field: CObjectShapeField): boolean {
  if (
    field.functionTypeOwnership === 'weak' &&
    existingField.functionType !== null &&
    typeof existingField.functionType !== 'undefined' &&
    existingField.functionTypeOwnership !== 'weak'
  ) {
    if (!isSupportedModuleObjectFunctionField(existingField) && isSupportedModuleObjectFunctionField(field)) {
      return true
    }

    return false
  }

  if (
    existingField.functionTypeOwnership === 'weak' &&
    field.functionType !== null &&
    typeof field.functionType !== 'undefined' &&
    field.functionTypeOwnership !== 'weak'
  ) {
    return true
  }

  return moduleObjectShapeFieldScore(field) > moduleObjectShapeFieldScore(existingField)
}

function isSupportedModuleObjectFunctionField(field: CObjectShapeField): boolean {
  return isPlainObjectFunctionField(field) || isRuntimeFunctionType(field.functionType)
}

function moduleObjectShapeFieldScore(field: CObjectShapeField): number {
  let score = 0

  if (field.valueType !== 'unknown') {
    score = score + 1
  }

  if (field.declaredType !== null && typeof field.declaredType !== 'undefined' && field.declaredType !== 'unknown') {
    score = score + 1
  }

  if (field.functionType !== null && typeof field.functionType !== 'undefined') {
    score = score + moduleObjectFunctionTypeScore(field.functionType)
  }

  if (
    field.shape !== null &&
    typeof field.shape !== 'undefined' &&
    field.shape.fields !== null &&
    typeof field.shape.fields !== 'undefined'
  ) {
    score = score + field.shape.fields.length
  }

  return score
}

function moduleObjectFunctionTypeScore(functionType: CFunctionType): number {
  let score = 1

  if (functionType.returnType !== 'unknown') {
    score = score + 1
  }

  for (const param of functionType.params) {
    if (param.valueType !== 'unknown') {
      score = score + 1
    }

    if (param.declaredType !== null && typeof param.declaredType !== 'undefined' && param.declaredType !== 'unknown') {
      score = score + 1
    }
  }

  return score
}

function moduleObjectShapeFieldIndex(fields: CObjectShapeField[], name: string): number {
  for (let index = 0; index < fields.length; index = index + 1) {
    if (fields[index].name === name) {
      return index
    }
  }

  return -1
}

function moduleObjectShapeFieldAt(fields: CObjectShapeField[], name: string): CObjectShapeField | null {
  for (let index = 0; index < fields.length; index = index + 1) {
    const field = fields[index]

    if (field.name === name) {
      return field
    }
  }

  return null
}

function collectModuleObjectLiteralShapeFields(
  expression: CAccessorNode,
  functionParams: Map<string, CFunctionParam[]>,
  functionReturnTypeRefs: CTypeRefMap,
  functionReturnNullables: Map<string, boolean>,
  functionReturnRuntimeTypeAlternatives: Map<string, CRuntimeTypeAlternative[]>,
  functionReturnAsyncResultValueTypes: Map<string, any>,
  functionReturnShapes: Map<string, any>,
  functionReturnTypes: CStringMap,
  knownObjectShapes: Map<string, CObjectShapeField[]>,
  expectedFields: CObjectShapeField[] | null = null
): CObjectShapeField[] {
  const fields: CObjectShapeField[] = []

  if (expression.properties === null || typeof expression.properties === 'undefined') {
    return fields
  }

  const properties: CObjectLiteralPropertyNode[] = expression.properties

  for (const property of properties) {
    if (property.value === null || typeof property.value === 'undefined') {
      continue
    }

    const value = property.value
    const expectedField = expectedFields === null ? null : moduleObjectShapeFieldAt(expectedFields, property.key)

    if (property.spread === true) {
      let spreadFields = moduleObjectReferenceShapeFields(value, knownObjectShapes)

      if (
        (spreadFields === null || typeof spreadFields === 'undefined') &&
        value.shape !== null &&
        typeof value.shape !== 'undefined'
      ) {
        spreadFields = value.shape.fields
      }

      if (spreadFields !== null && typeof spreadFields !== 'undefined') {
        for (const field of spreadFields) {
          const fieldIndex = moduleObjectShapeFieldIndex(fields, field.name)

          if (fieldIndex === -1) {
            fields.push(field)
          } else {
            fields[fieldIndex] = field
          }
        }
      }

      continue
    }

    let functionType = expectedField?.functionType ?? null

    if (functionType === null) {
      functionType = resolveModuleObjectFunctionType(
        value,
        functionParams,
        functionReturnTypeRefs,
        functionReturnNullables,
        functionReturnRuntimeTypeAlternatives,
        functionReturnAsyncResultValueTypes,
        functionReturnShapes,
        functionReturnTypes
      )
    }

    if (functionType !== null && typeof functionType !== 'undefined') {
      let functionStorage: 'pointer' | undefined

      if (value.type === 'Reference' && value.path.length === 1 && functionParams.has(value.path[0])) {
        functionStorage = 'pointer'
        value.functionStorage = 'pointer'
      }

      const field: CObjectShapeField = {
        name: property.key,
        readonlyField: false,
        valueType: 'function',
        functionType,
        functionTypeOwnership: 'weak',
        functionStorage
      }

      fields.push(field)
      continue
    }

    if (value.type === 'ObjectLiteral') {
      const nestedFields = collectModuleObjectLiteralShapeFields(
        value,
        functionParams,
        functionReturnTypeRefs,
        functionReturnNullables,
        functionReturnRuntimeTypeAlternatives,
        functionReturnAsyncResultValueTypes,
        functionReturnShapes,
        functionReturnTypes,
        knownObjectShapes,
        expectedField?.shape?.fields ?? null
      )

      if (nestedFields.length > 0) {
        fields.push({
          name: property.key,
          readonlyField: false,
          valueType: 'object',
          shape: { fields: nestedFields }
        })
      }

      continue
    }

    const referencedFields = moduleObjectReferenceShapeFields(value, knownObjectShapes)

    if (referencedFields !== null && typeof referencedFields !== 'undefined' && referencedFields.length > 0) {
      fields.push({
        name: property.key,
        readonlyField: false,
        valueType: 'object',
        shape: { fields: referencedFields }
      })
    }
  }

  return fields
}

function moduleObjectReferenceShapeFields(
  expression: CAccessorNode,
  knownObjectShapes: Map<string, CObjectShapeField[]>
): CObjectShapeField[] | null {
  if (expression.type !== 'Reference' || expression.path.length !== 1) {
    return null
  }

  const fields = knownObjectShapes.get(expression.path[0])

  if (fields !== null && typeof fields !== 'undefined') {
    return fields
  }

  return null
}

function resolveModuleObjectFunctionType(
  expression: CAccessorNode,
  functionParams: Map<string, CFunctionParam[]>,
  functionReturnTypeRefs: CTypeRefMap,
  functionReturnNullables: Map<string, boolean>,
  functionReturnRuntimeTypeAlternatives: Map<string, CRuntimeTypeAlternative[]>,
  functionReturnAsyncResultValueTypes: Map<string, any>,
  functionReturnShapes: Map<string, any>,
  functionReturnTypes: CStringMap
): CFunctionType | null {
  if (expression.functionType !== null && typeof expression.functionType !== 'undefined') {
    return expression.functionType
  }

  if (expression.type === 'ArrowFunctionExpression') {
    const functionType = moduleObjectArrowFunctionType(expression)

    if (functionType !== null && typeof functionType !== 'undefined') {
      expression.functionType = functionType
      expression.functionTypeOwnership = 'weak'
      return functionType
    }
  }

  if (expression.type !== 'Reference' || expression.path.length !== 1) {
    return null
  }

  const name = expression.path[0]
  const params = functionParams.get(name)
  const returnType = functionReturnTypes.get(name)

  if (params === null || typeof params === 'undefined' || returnType === null || typeof returnType === 'undefined') {
    return null
  }

  return {
    kind: 'function',
    params,
    returnTypeRef: cTypeRefMapValue(functionReturnTypeRefs, name) ?? expression.returnTypeRef ?? null,
    returnNullable: functionReturnNullables.get(name) === true,
    returnRuntimeTypeAlternatives: functionReturnRuntimeTypeAlternatives.get(name) ?? null,
    returnAsyncResultValueType: functionReturnAsyncResultValueTypes.get(name) ?? null,
    returnShape: functionReturnShapes.get(name) ?? null,
    returnType
  }
}

function moduleObjectArrowFunctionType(expression: CAccessorNode): CFunctionType | null {
  if (expression.params === null || typeof expression.params === 'undefined') {
    return null
  }

  const params: CFunctionParam[] = []
  let returnShape = expression.returnShape ?? null

  if (
    returnShape === null &&
    expression.body !== null &&
    typeof expression.body !== 'undefined' &&
    expression.body.shape !== null &&
    typeof expression.body.shape !== 'undefined'
  ) {
    returnShape = expression.body.shape
  }

  for (const param of expression.params as CFunctionParam[]) {
    params.push(param)
  }

  return {
    kind: 'function',
    params,
    returnTypeRef: expression.returnTypeRef ?? null,
    returnNullable: expression.returnNullable === true,
    returnRuntimeTypeAlternatives: expression.returnRuntimeTypeAlternatives ?? null,
    returnAsyncResultValueType: expression.returnAsyncResultValueType ?? null,
    returnShape,
    returnType: expression.returnType ?? 'unknown'
  }
}

function collectObjectAccessorReturnPaths(statements: CAccessorNode[]): Map<string, CObjectAccessorReturnPath> {
  const result: Map<string, CObjectAccessorReturnPath> = new Map()

  for (const statement of statements) {
    const path = objectAccessorReturnPath(statement)

    if (path !== null && typeof path !== 'undefined') {
      result.set(statement.name, path)
    }
  }

  return result
}

function objectAccessorReturnPath(statement: CAccessorNode): CObjectAccessorReturnPath | null {
  if (statement.type !== 'FunctionDeclaration') {
    return null
  }

  const locals: Map<string, CObjectAccessorReturnPath> = new Map()

  for (let index = 0; index < statement.body.length; index = index + 1) {
    const item = statement.body[index]

    if (item.type === 'VariableDeclaration' && item.init !== null && typeof item.init !== 'undefined') {
      const path = objectAccessorExpressionReturnPath(item.init, statement.params)

      if (path !== null && typeof path !== 'undefined') {
        locals.set(item.name, path)
      }
    }

    const returned = objectAccessorReturnPathFromStatement(item, statement.params, locals)

    if (returned !== null && typeof returned !== 'undefined') {
      return returned
    }
  }

  return null
}

function objectAccessorReturnPathFromStatement(
  statement: CAccessorNode,
  params: CFunctionParam[],
  locals: Map<string, CObjectAccessorReturnPath>
): CObjectAccessorReturnPath | null {
  if (
    statement.type === 'ReturnStatement' &&
    statement.argument !== null &&
    typeof statement.argument !== 'undefined'
  ) {
    return objectAccessorReturnPathFromExpression(statement.argument, params, locals)
  }

  if (statement.type === 'IfStatement') {
    const consequent = objectAccessorReturnPathFromStatementList(statement.consequent, params, locals)

    if (consequent !== null && typeof consequent !== 'undefined') {
      return consequent
    }

    return objectAccessorReturnPathFromStatementList(statement.alternate, params, locals)
  }

  if (statement.type === 'BlockStatement') {
    return objectAccessorReturnPathFromStatementList(statement.body, params, locals)
  }

  return null
}

function objectAccessorReturnPathFromStatementList(
  statements: CAccessorNode | CAccessorNode[] | null | undefined,
  params: CFunctionParam[],
  locals: Map<string, CObjectAccessorReturnPath>
): CObjectAccessorReturnPath | null {
  if (statements === null || typeof statements === 'undefined') {
    return null
  }

  if (!Array.isArray(statements)) {
    return objectAccessorReturnPathFromStatement(statements, params, locals)
  }

  const statementList: CAccessorNode[] = statements

  for (let index = 0; index < statementList.length; index = index + 1) {
    const item: CAccessorNode = statementList[index]
    const path = objectAccessorReturnPathFromStatement(item, params, locals)

    if (path !== null && typeof path !== 'undefined') {
      return path
    }
  }

  return null
}

function objectAccessorReturnPathFromExpression(
  expression: CAccessorNode,
  params: CFunctionParam[],
  locals: Map<string, CObjectAccessorReturnPath>
): CObjectAccessorReturnPath | null {
  if (expression.type === 'Reference' && expression.path.length === 1) {
    const localPath = cloneObjectAccessorReturnPath(locals.get(expression.path[0]))

    if (localPath !== null && typeof localPath !== 'undefined') {
      return localPath
    }
  }

  return objectAccessorExpressionReturnPath(expression, params)
}

function cloneObjectAccessorReturnPath(
  path: CObjectAccessorReturnPath | null | undefined
): CObjectAccessorReturnPath | null {
  if (path === null || typeof path === 'undefined') {
    return null
  }

  const fields: string[] = []

  for (let index = 0; index < path.fields.length; index = index + 1) {
    fields.push(path.fields[index])
  }

  return {
    fields,
    paramIndex: path.paramIndex
  }
}

function objectAccessorExpressionReturnPath(
  expression: CAccessorNode,
  params: CFunctionParam[]
): CObjectAccessorReturnPath | null {
  if (expression.type === 'Reference' && expression.path.length === 1) {
    return objectAccessorExpressionReturnPathPrefix(expression, params)
  }

  if (expression.type === 'CallExpression') {
    return objectAccessorCreateFunctionContextReturnPath(expression, params)
  }

  if (expression.type !== 'MemberExpression') {
    return null
  }

  const path = objectAccessorExpressionReturnPathPrefix(expression.object, params)

  if (path === null || typeof path === 'undefined') {
    return null
  }

  path.fields.push(expression.property)

  return path
}

function objectAccessorCreateFunctionContextReturnPath(
  expression: CAccessorNode,
  params: CFunctionParam[]
): CObjectAccessorReturnPath | null {
  const callee = expression.callee

  if (callee === null || typeof callee === 'undefined') {
    return null
  }

  let isCreateFunctionContext = false

  if (callee.type === 'MemberExpression' && callee.property === 'createFunctionContext') {
    isCreateFunctionContext = true
  } else {
    const calleeName = resolveCObjectExpressionName(callee)

    if (calleeName === 'createFunctionContext') {
      isCreateFunctionContext = true
    }
  }

  if (!isCreateFunctionContext) {
    return null
  }

  const argument = expression.args[0]

  if (argument === null || typeof argument === 'undefined') {
    return null
  }

  return objectAccessorExpressionReturnPathPrefix(argument, params)
}

function objectAccessorExpressionReturnPathPrefix(
  expression: CAccessorNode,
  params: CFunctionParam[]
): CObjectAccessorReturnPath | null {
  if (expression.type === 'Reference' && expression.path.length === 1) {
    const expressionPath: string[] = expression.path

    for (let index = 0; index < params.length; index = index + 1) {
      const param = params[index]

      if (param.name === expressionPath[0]) {
        return {
          fields: [],
          paramIndex: index
        }
      }
    }

    return null
  }

  if (expression.type === 'MemberExpression') {
    const path = objectAccessorExpressionReturnPathPrefix(expression.object, params)

    if (path !== null && typeof path !== 'undefined') {
      path.fields.push(expression.property)
    }

    return path
  }

  return null
}

function collectExternalEventLoopFunctions(functions: AnyNode[], seedNames?: CNameSet): CNameSet {
  const functionsByName: Map<string, AnyNode> = new Map()
  const names: CNameSet = new Set()
  let changed = true

  if (seedNames !== null && typeof seedNames !== 'undefined') {
    for (const name of seedNames) {
      names.add(name)
    }
  }

  for (const item of functions) {
    if (item.name === null || typeof item.name === 'undefined') {
      continue
    }

    functionsByName.set(item.name, item)
  }

  while (changed) {
    changed = false

    for (const name of functionsByName.keys()) {
      const item = functionsByName.get(name)

      if (item === null || typeof item === 'undefined') {
        continue
      }

      if (names.has(name)) {
        continue
      }

      if (functionUsesExternalEventLoop(item, names, callbackLoweringDependencies)) {
        names.add(name)
        changed = true
      }
    }
  }

  return names
}

function findObjectLiteralPropertyValue(expression: AnyNode, key: string): AnyNode | null {
  if (expression.properties === null || typeof expression.properties === 'undefined') {
    return null
  }

  const properties: CObjectLiteralPropertyNode[] = expression.properties

  for (let index = properties.length - 1; index >= 0; index = index - 1) {
    const property = properties[index]

    if (property === null || typeof property === 'undefined') {
      continue
    }

    if (property.spread === true) {
      if (objectSpreadPropertyHasField(property, key)) {
        return null
      }

      continue
    }

    if (property.key === key) {
      if (property.value !== null && typeof property.value !== 'undefined') {
        return property.value
      }

      return null
    }
  }

  return null
}

function emitFunctionPointerAdapter(
  target: string,
  targetFunctionType: CFunctionType,
  functionType: CFunctionType,
  context: CFunctionContext,
  seenTypes: string[],
  targetSeenTypes: string[]
): string {
  const expectedParams = emitFunctionPointerParams(functionType, [], seenTypes)
  const targetParams = emitFunctionPointerParams(targetFunctionType, [], targetSeenTypes)
  const key = `${target}:${emitFunctionPointerReturnType(functionType)}:${expectedParams}:${emitFunctionPointerReturnType(targetFunctionType)}:${targetParams}`
  const existingName = context.functionPointerAdapterNames.get(key)

  if (existingName !== null && typeof existingName !== 'undefined') {
    return existingName
  }

  const name = `inox_function_pointer_adapter_${context.functionPointerAdapters.length}`
  const adapterSeenTypes: string[] = []

  for (const seenType of seenTypes) {
    adapterSeenTypes.push(seenType)
  }

  const adapterTargetSeenTypes: string[] = []

  for (const seenType of targetSeenTypes) {
    adapterTargetSeenTypes.push(seenType)
  }

  context.functionPointerAdapterNames.set(key, name)
  context.functionPointerAdapters.push({
    functionType,
    name,
    seenTypes: adapterSeenTypes,
    target,
    targetFunctionType,
    targetSeenTypes: adapterTargetSeenTypes
  })

  return name
}

function emitFunctionPointerRuntimeCallbackValue(
  target: string,
  functionType: CFunctionType,
  seenTypes: string[],
  context: CFunctionContext,
  loc: SourceLocation | null | undefined
): PreparedExpression {
  const paramNames = collectFunctionPointerParamNames(functionType, seenTypes)

  if (paramNames.length !== functionType.params.length) {
    context.diagnostics.push(
      diagnostic(
        'INOX_C_FUNCTION_VALUE',
        'converting a function pointer with flattened object function fields to a runtime callback is not supported',
        loc
      )
    )

    return {
      lines: [],
      expression: 'inox_undefined_value()'
    }
  }

  const adapter = registerFunctionPointerRuntimeAdapter(functionType, seenTypes, context)
  const adapterContext = nextCName(context, 'inox_function_pointer_callback_context')
  const value = nextCName(context, 'inox_function_pointer_callback')
  const lines: string[] = []

  registerOwnedValue(context, value)
  lines.push(
    `${adapter.contextTypeName}* ${adapterContext} = (${adapter.contextTypeName}*)inox_default_alloc(0, sizeof(${adapter.contextTypeName}), _Alignof(${adapter.contextTypeName}));`
  )
  lines.push(`if (${adapterContext} == 0) ${emitFailureStatement(context)}`)
  lines.push(`${adapterContext}->target = ${target};`)
  lines.push(
    `if (inox_callback_new(&inox_default_allocator, ${adapter.callbackName}, ${adapterContext}, ${adapter.finalizerName}, &${value}) != INOX_OK) {`
  )
  lines.push(`  ${adapter.finalizerName}(${adapterContext});`)
  lines.push(`  ${emitFailureStatement(context)}`)
  lines.push('}')

  return {
    lines,
    expression: value
  }
}

function emitFunctionPointerVariable(
  name: string,
  init: AnyNode,
  context: CFunctionContext,
  isConst: boolean,
  functionType: CFunctionType | null | undefined,
  loc: CSourceLocation,
  seenTypes: string[] = []
): string {
  const target = emitFunctionValueExpression(init, context)
  const targetFunctionType = resolveFunctionValueType(init, context)

  return emitFunctionPointerVariableWithCInitializer(
    name,
    emitAdaptedModuleFunctionPointerExpression(target, targetFunctionType, functionType, context, seenTypes, []),
    context,
    isConst,
    functionType,
    loc,
    seenTypes
  )
}

function emitFunctionPointerVariableWithCInitializer(
  name: string,
  init: string,
  context: CFunctionContext,
  isConst: boolean,
  functionType: CFunctionType | null | undefined,
  loc: CSourceLocation,
  seenTypes: string[] = []
): string {
  reportUnsupportedCFunctionType(functionType, context, loc)
  let constPrefix = ''

  if (isConst) {
    constPrefix = 'const '
  }

  return `${emitFunctionPointerReturnType(functionType)} (*${constPrefix}${name})(${emitFunctionPointerParams(functionType, [], seenTypes)}) = ${init}`
}

function resolveFunctionValueType(expression: AnyNode, context: CFunctionContext): CFunctionType | null {
  if (expression.type === 'CallExpression') {
    const calleeType = resolveFunctionValueType(expression.callee, context)

    return cFunctionTypeFromTypeRef(calleeType?.returnTypeRef, context.libraries, expression.loc)
  }

  if (expression.type === 'Reference' && expression.path.length === 1) {
    const name = expression.path[0]
    const params = context.functionParams.get(name)
    const returnType = context.functionReturnTypes.get(name)

    if (params !== null && typeof params !== 'undefined' && returnType !== null && typeof returnType !== 'undefined') {
      return {
        declaredReturnType: context.functionReturnDeclaredTypes.get(name) ?? null,
        kind: 'function',
        params,
        returnTypeRef: cTypeRefMapValue(context.functionReturnTypeRefs, name),
        returnRuntimeTypeAlternatives: context.functionReturnRuntimeTypeAlternatives.get(name) ?? null,
        returnNullable: context.functionReturnNullables.get(name) === true,
        returnAsyncResultValueType: context.functionReturnAsyncResultValueTypes.get(name) ?? null,
        returnShape: context.functionReturnShapes.get(name) ?? null,
        returnType
      }
    }
  }

  if (expression.type === 'ArrowFunctionExpression') {
    const wrapper = context.callbackArrowWrappers.get(expression)

    if (wrapper !== null && typeof wrapper !== 'undefined' && wrapper.kind === 'plain-arrow') {
      return wrapper.functionType
    }
  }

  if (expression.functionType !== null && typeof expression.functionType !== 'undefined') {
    return expression.functionType
  }

  return null
}

function emitStatement(statement: AnyNode, context: CFunctionContext): string[] {
  if (statement.type === 'BlockStatement') {
    const snapshot = pushVariableScope(context)
    const lines = ['{']
    const bodyLines: string[] = emitStatementBody(statement, context)

    for (const line of bodyLines) {
      lines.push(`  ${line}`)
    }

    lines.push('}')
    restoreVariableScope(context, snapshot)

    return lines
  }

  if (statement.type === 'IfStatement') {
    return emitIfStatement(statement, context)
  }

  if (statement.type === 'WhileStatement') {
    return emitWhileStatement(statement, context)
  }

  if (statement.type === 'ForStatement') {
    return emitForStatement(statement, context)
  }

  if (statement.type === 'ForOfStatement') {
    return emitForOfStatement(statement, context)
  }

  if (statement.type === 'SwitchStatement') {
    return emitSwitchStatement(statement, context)
  }

  if (statement.type === 'TryStatement') {
    return emitTryStatement(statement, context)
  }

  if (statement.type === 'ThrowStatement') {
    return emitThrowStatement(statement, context)
  }

  if (statement.type === 'BreakStatement') {
    return emitBreakJump(context)
  }

  if (statement.type === 'ContinueStatement') {
    return emitContinueJump(context)
  }

  if (statement.type === 'VariableDeclaration') {
    return emitVariableDeclarationStatement(statement, context)
  }

  if (statement.type === 'ExpressionStatement') {
    return emitExpressionStatement(statement, context)
  }

  if (statement.type === 'ReturnStatement') {
    return emitReturnStatement(statement, context)
  }

  return []
}

function inferCatchBindingValueType(statement: AnyNode, context: CFunctionContext): string {
  const types: string[] = []
  const throwOptions: IrLocalThrowValueTypeOptions = {
    exceptionValueNames: context.exceptionValueNames,
    functionThrowValueTypes: context.functionThrowValueTypes
  }
  const localThrowTypes: IrThrowValueType[] = collectIrLocalThrowValueTypes(statement.block, throwOptions)

  for (const throwType of localThrowTypes) {
    types.push(throwType)
  }

  const localAwaitTypes: string[] = collectLocalAwaitRejectionValueTypes(
    statement.block,
    context,
    rejectionValueTypeDependencies
  )

  for (const awaitType of localAwaitTypes) {
    types.push(awaitType)
  }

  if (types.length === 0) {
    return 'unknown'
  }

  let allExceptionObjects = true
  let allStrings = true

  for (const valueType of types) {
    if (valueType !== 'exception-object') {
      allExceptionObjects = false
    }

    if (valueType !== 'string') {
      allStrings = false
    }
  }

  if (allExceptionObjects) {
    return 'object'
  }

  if (allStrings) {
    return 'string'
  }

  return 'unknown'
}

function pushAll(target: string[], values: string[]): void {
  for (const value of values) {
    target.push(value)
  }
}

function pushIndented(target: string[], values: string[], indent: string): void {
  for (const value of values) {
    target.push(`${indent}${value}`)
  }
}

function preparedExpressionOrEmpty(prepared: PreparedExpression | null): PreparedExpression {
  if (prepared !== null && typeof prepared !== 'undefined') {
    return prepared
  }

  return emptyPreparedExpression()
}

function functionParamsOrEmpty(params: CFunctionParam[] | null): CFunctionParam[] {
  if (params !== null && typeof params !== 'undefined') {
    return params
  }

  return []
}

function nodeOrEmpty(node: AnyNode | null): AnyNode {
  if (node !== null && typeof node !== 'undefined') {
    return node
  }

  return {}
}

function asyncTaskWrapperOrEmpty(wrapper: CAsyncTaskWrapper | null): CAsyncTaskWrapper {
  if (wrapper !== null && typeof wrapper !== 'undefined') {
    return wrapper
  }

  return {
    key: '',
    functionName: '',
    frameTypeName: '',
    startName: '',
    resumeName: '',
    rejectName: '',
    finalizerName: '',
    params: [],
    awaits: [],
    frameLocals: [],
    hasTryRegion: false,
    prefixStatements: [],
    returnExpression: null,
    returnType: 'void',
    successPhases: [],
    tryHandler: null,
    tryPhases: []
  }
}

function asyncTaskWrapperFunctionParams(wrapper: CAsyncTaskWrapper | null): CFunctionParam[] {
  const resolvedWrapper = asyncTaskWrapperOrEmpty(wrapper)
  const params: CFunctionParam[] = []

  for (const param of resolvedWrapper.params) {
    params.push(param)
  }

  return params
}

function emitScalarVariableDeclaration(statement: AnyNode, context: CFunctionContext): string[] {
  if (statement.init === null || typeof statement.init === 'undefined') {
    return emitUninitializedScalarVariableDeclaration(statement, context)
  }

  const inferred = inferScalarDeclarationValueType(statement, context)
  const optionalChain =
    statement.init.type === 'OptionalMemberExpression' ||
    statement.init.type === 'OptionalIndexExpression' ||
    statement.init.type === 'OptionalCallExpression'
  const nullableValueType = isRuntimeNullableType(statement.valueType)
    ? statement.valueType
    : optionalChain
      ? inferred
      : 'unknown'

  if (
    (statement.nullable === true || statement.init.nullable === true || optionalChain) &&
    isRuntimeNullableType(nullableValueType)
  ) {
    return emitNullableRuntimeValueVariableDeclaration(statement, context)
  }

  const declared = knownValueType(statement.valueType)
  const variableType = inferred === 'function' ? 'function' : (declared ?? inferred)
  context.variables.set(statement.name, variableType)

  if (variableType === 'function' && statement.init !== null && typeof statement.init !== 'undefined') {
    const functionType = resolveFunctionValueType(statement.init, context)

    if (functionType !== null) {
      statement.functionType = functionType
      statement.init.functionType = functionType
    }
  }

  const functionScalarDeclaration = emitFunctionScalarVariableDeclaration(statement, context, variableType)

  if (functionScalarDeclaration !== null && typeof functionScalarDeclaration !== 'undefined') {
    return functionScalarDeclaration
  }

  const stringScalarDeclaration = emitStringScalarVariableDeclaration(statement, context, inferred)

  if (stringScalarDeclaration !== null && typeof stringScalarDeclaration !== 'undefined') {
    return stringScalarDeclaration
  }

  return emitNumberBooleanScalarVariableDeclaration(statement, context, inferred)
}

function inferScalarDeclarationValueType(statement: CDynamicObjectFieldNode, context: CFunctionContext): string {
  if (
    statement.init !== null &&
    typeof statement.init !== 'undefined' &&
    statement.init.type === 'ArrowFunctionExpression'
  ) {
    return 'function'
  }

  const inferred = inferExpressionType(statement.init, context)
  const declared = knownValueType(statement.valueType)

  if (
    (declared === 'number' || declared === 'boolean') &&
    inferred === 'number' &&
    isDynamicObjectFieldInitializer(statement.init, context)
  ) {
    return declared
  }

  return inferred
}

function inferModuleValueAssignmentType(statement: AnyNode, context: CFunctionContext): string {
  if (isUnionValueTypeName(statement.valueType)) {
    return 'unknown'
  }

  const declared = knownValueType(statement.valueType)

  if (declared !== null && typeof declared !== 'undefined') {
    if (declared === 'void' && statement.init?.type === 'AwaitExpression') {
      return 'unknown'
    }

    return declared
  }

  if (statement.init === null || typeof statement.init === 'undefined') {
    return 'unknown'
  }

  return inferExpressionType(statement.init, context)
}

function isUnionValueTypeName(valueType: string | null | undefined): boolean {
  return valueType !== null && typeof valueType !== 'undefined' && valueType.startsWith('union<')
}

function isDynamicObjectFieldInitializer(expression: CDynamicObjectFieldNode, context: CFunctionContext): boolean {
  if (isMemberAccessExpression(expression)) {
    if (
      !resolveKnownObjectMember(expression, context) &&
      inferExpressionType(expression.object, context) === 'object'
    ) {
      return true
    }

    return isDynamicObjectFieldInitializer(expression.object, context)
  }

  if (isIndexAccessExpression(expression) && expression.index.type === 'StringLiteral') {
    if (!resolveKnownObjectIndex(expression, context) && inferExpressionType(expression.object, context) === 'object') {
      return true
    }

    return isDynamicObjectFieldInitializer(expression.object, context)
  }

  return isStatementDynamicRuntimeValueExpression(expression, context)
}

function emitUninitializedScalarVariableDeclaration(statement: AnyNode, context: CFunctionContext): string[] {
  const inferred = firstKnownValueTypeOrUnknown(statement.valueType, null, null)

  context.variables.set(statement.name, inferred)

  const prefix = uninitializedDeclarationPrefix(statement)

  if (inferred === 'string') {
    return [`${prefix}char* ${emitCIdentifier(statement.name)} = "";`]
  }

  if (isManagedRuntimeReturnType(inferred) || isOpaqueRuntimeValueType(inferred)) {
    registerOwnedValue(context, statement.name)
    return []
  }

  if (inferred === 'async-result') {
    const cppType = requireCompilerLibraryAsyncResultCppType(context.libraries, statement.typeRef)
    return [`${prefix}${cppType} ${emitCIdentifier(statement.name)}{};`]
  }

  if (inferred === 'function') {
    return [`${prefix}void* ${emitCIdentifier(statement.name)} = 0;`]
  }

  return [`${prefix}double ${emitCIdentifier(statement.name)} = 0;`]
}

function emitModuleValueVariableAssignment(statement: AnyNode, context: CFunctionContext): string[] {
  const name = context.moduleValueNames.get(statement.name)

  if (name === null || typeof name === 'undefined') {
    return emitScalarVariableDeclaration(statement, context)
  }

  const inferred = inferModuleValueAssignmentType(statement, context)
  const moduleValueType = context.moduleValueTypes.get(statement.name) ?? inferred

  context.variables.set(statement.name, inferred)

  if (context.moduleCompileTimeValueInitializers.has(statement.name)) {
    return []
  }

  if (statement.nullable === true && isRuntimeNullableType(inferred)) {
    return emitModuleNullableRuntimeValueAssignment(statement, name, inferred, context)
  }

  if (statement.init === null || typeof statement.init === 'undefined') {
    return [`${name} = ${moduleValueDefaultExpression(inferred)};`]
  }

  const libraryObject = emitPreparedCompilerLibraryCallExpression(
    statement.init,
    context,
    statement.init.valueType === 'async-result' ? { out: name, owned: false } : null
  )

  if (libraryObject !== null && statement.init.valueType === 'async-result') {
    const lines: string[] = []
    pushAll(lines, libraryObject.lines)
    lines.push(`${name} = ${libraryObject.expression};`)
    lines.push(emitAsyncResultRuntimeTypeCheck(name, context))
    registerEventLoop(context)
    context.variables.set(statement.name, 'async-result')
    context.moduleValueTypes.set(statement.name, 'async-result')
    context.asyncResultValueTypes.set(statement.name, libraryObject.valueType ?? 'unknown')
    context.asyncResultRejectionValueTypes.set(statement.name, libraryObject.rejectionValueType ?? 'unknown')
    return lines
  }

  if (
    libraryObject !== null &&
    (libraryObject.scalarType === 'double' || libraryObject.scalarType === 'bool') &&
    (context.moduleRuntimeValueNames.has(statement.name) ||
      context.moduleValueCppTypes.get(statement.name) === 'inox::Value' ||
      moduleValueType === 'unknown')
  ) {
    return emitPreparedModuleRuntimeScalarValueAssignment(statement, name, libraryObject, context)
  }

  if (
    libraryObject !== null &&
    libraryObject.cppType !== null &&
    typeof libraryObject.cppType !== 'undefined' &&
    libraryObject.valueType !== null &&
    typeof libraryObject.valueType !== 'undefined' &&
    isManagedRuntimeReturnType(libraryObject.valueType)
  ) {
    const lines: string[] = []
    const targetCppType = context.moduleValueCppTypes.get(statement.name)
    pushAll(lines, libraryObject.lines)
    context.variables.set(statement.name, libraryObject.valueType)
    context.moduleValueTypes.set(statement.name, libraryObject.valueType)

    if (targetCppType !== null && typeof targetCppType !== 'undefined') {
      lines.push(`${name} = ${libraryObject.expression};`)
      context.cppValueTypes.set(statement.name, targetCppType)
    } else {
      pushModuleRuntimeValueAssignment(lines, name, libraryObject, context)
      context.cppValueTypes.delete(statement.name)
    }

    return lines
  }

  const moduleClassName = cClassNameFromValueType(moduleValueType)

  if (moduleClassName !== null && typeof moduleClassName !== 'undefined') {
    const info = context.classInfos.get(moduleClassName)

    if (
      info !== null &&
      typeof info !== 'undefined' &&
      info.native &&
      isClassConstructorExpression(statement.init, context)
    ) {
      context.variables.set(statement.name, moduleValueType)
      context.moduleValueTypes.set(statement.name, moduleValueType)
      context.classInstanceTypes.set(statement.name, moduleClassName)
      return emitCNativeClassAssignmentLines(name, statement.init, info, context)
    }
  }

  if (context.moduleRuntimeValueNames.has(statement.name) && cCallExpressionReturnsTypeErasedValue(statement.init)) {
    const value = emitCValueExpression(statement.init, context)
    const lines: string[] = []

    context.moduleValueTypes.set(statement.name, 'unknown')
    pushAll(lines, value.lines)
    pushModuleRuntimeValueAssignment(lines, name, value, context)
    lines.push(`inox_retain(${name});`)
    return lines
  }

  if (inferred === 'number' || inferred === 'boolean') {
    if (context.moduleRuntimeValueNames.has(statement.name)) {
      return emitModuleRuntimeScalarValueAssignment(statement, name, inferred, context)
    }

    const value = emitPreparedNumberExpression(statement.init, context)
    const lines: string[] = []

    context.moduleValueTypes.set(statement.name, inferred)
    pushAll(lines, value.lines)
    lines.push(`${name} = ${value.expression};`)
    return lines
  }

  if (inferred === 'string') {
    if (context.moduleRuntimeValueNames.has(statement.name)) {
      const value = emitCValueExpression(statement.init, context)
      const lines: string[] = []

      context.variables.set(statement.name, 'string')
      context.moduleValueTypes.set(statement.name, 'unknown')
      pushAll(lines, value.lines)
      pushModuleRuntimeValueAssignment(lines, name, value, context)

      if (value.cppType === null || typeof value.cppType === 'undefined') {
        lines.push(`inox_retain(${name});`)
      }

      return lines
    }

    context.moduleValueTypes.set(statement.name, inferred)
    return [`${name} = ${emitStringExpression(statement.init, context)};`]
  }

  if (inferred === 'async-result') {
    const asyncResult = emitPreparedAsyncResultExpression(statement.init, context, asyncResultLoweringDependencies, {
      out: name,
      owned: false
    })

    if (asyncResult !== null && typeof asyncResult !== 'undefined') {
      registerModuleAsyncResultAssignmentMetadata(statement, asyncResult, context)

      const expression =
        statement.init.type === 'Reference' ? emitReference(statement.init, context) : asyncResult.expression

      if (expression === name) {
        return asyncResult.lines
      }

      const lines: string[] = []
      pushAll(lines, asyncResult.lines)
      lines.push(`${name} = ${expression};`)
      return lines
    }
  }

  if (inferred === 'function') {
    return emitModuleFunctionValueAssignment(statement, name, context)
  }

  const initializerType = inferExpressionType(statement.init, context)

  if (inferred === 'unknown' && (initializerType === 'number' || initializerType === 'boolean')) {
    return emitModuleRuntimeScalarValueAssignment(statement, name, initializerType, context)
  }

  const value =
    statement.init.type === 'ObjectLiteral'
      ? emitCObjectLiteralValueExpression(statement.init, context, statement.shape)
      : emitCValueExpression(statement.init, context)
  const lines: string[] = []

  context.moduleValueTypes.set(statement.name, inferred)
  registerModuleRuntimeValueMetadata(statement, inferred, context)
  pushAll(lines, value.lines)
  pushAll(
    lines,
    emitModuleObjectFunctionFieldAssignments(
      statement.name,
      statement.init,
      statement.declaredType ?? statement.inferredDeclaredType ?? null,
      context,
      value
    )
  )
  const moduleValueCppType = context.moduleValueCppTypes.get(statement.name)
  pushModuleRuntimeValueAssignment(lines, name, value, context, moduleValueCppType)

  if (
    (moduleValueCppType === null || typeof moduleValueCppType === 'undefined') &&
    (inferred === 'unknown' || isManagedRuntimeReturnType(inferred) || isOpaqueRuntimeValueType(inferred))
  ) {
    lines.push(`inox_retain(${name});`)
  }

  return lines
}

function emitModuleRuntimeScalarValueAssignment(
  statement: AnyNode,
  name: string,
  valueType: 'number' | 'boolean',
  context: CFunctionContext
): string[] {
  const value = emitPreparedNumberExpression(statement.init, context)
  return emitPreparedModuleRuntimeScalarValueAssignment(statement, name, value, context, valueType)
}

function emitPreparedModuleRuntimeScalarValueAssignment(
  statement: AnyNode,
  name: string,
  value: PreparedExpression,
  context: CFunctionContext,
  valueType?: 'number' | 'boolean'
): string[] {
  const scalarType = valueType ?? (value.scalarType === 'bool' ? 'boolean' : 'number')
  const boxed =
    scalarType === 'boolean' ? `inox_bool_value((${value.expression}) != 0)` : `inox_number_value(${value.expression})`
  const lines: string[] = []

  context.variables.set(statement.name, 'unknown')
  context.moduleValueTypes.set(statement.name, 'unknown')
  pushAll(lines, value.lines)
  lines.push(`${name} = ${boxed};`)
  return lines
}

function emitModuleFunctionValueAssignment(statement: AnyNode, name: string, context: CFunctionContext): string[] {
  const functionType = normalizeFunctionType(
    resolveFunctionValueType(statement.init, context) ?? moduleFunctionValueType(statement)
  )

  statement.functionType = functionType
  statement.init.functionType = functionType

  context.variables.set(statement.name, 'function')
  context.functionTypes.set(statement.name, functionType)

  if (moduleFunctionValueUsesRuntimeCallback(statement, context)) {
    context.moduleValueTypes.set(statement.name, 'unknown')
    context.runtimeCallbacks.add(statement.name)
    return emitRuntimeCallbackValueInto(statement.init, functionType, name, context)
  }

  context.moduleValueTypes.set(statement.name, 'function')

  const target = emitFunctionValueExpression(statement.init, context)
  const targetFunctionType = resolveFunctionValueType(statement.init, context)
  const expression = emitAdaptedModuleFunctionPointerExpression(
    target,
    targetFunctionType,
    functionType,
    context,
    [],
    []
  )

  return [`${name} = ${expression};`]
}

function moduleFunctionValueType(statement: AnyNode): CFunctionType {
  if (statement.functionType !== null && typeof statement.functionType !== 'undefined') {
    return normalizeFunctionType(statement.functionType)
  }

  if (
    statement.init !== null &&
    typeof statement.init !== 'undefined' &&
    statement.init.functionType !== null &&
    typeof statement.init.functionType !== 'undefined'
  ) {
    return normalizeFunctionType(statement.init.functionType)
  }

  return normalizeFunctionType(null)
}

function moduleFunctionValueUsesRuntimeCallback(statement: AnyNode, context: CFunctionContext): boolean {
  if (moduleValueIsGenericFunctionDeclaration(statement)) {
    return true
  }

  if (statement.init !== null && typeof statement.init !== 'undefined' && statement.init.type === 'CallExpression') {
    return true
  }

  if (
    statement.init !== null &&
    typeof statement.init !== 'undefined' &&
    statement.init.type === 'ArrowFunctionExpression'
  ) {
    const wrapper = context.callbackArrowWrappers.get(statement.init)

    return wrapper !== null && typeof wrapper !== 'undefined' && wrapper.kind === 'arrow'
  }

  return (
    isNullableFunctionType(statement.valueType, statement.nullable) || isRuntimeFunctionType(statement.functionType)
  )
}

function moduleValueIsGenericFunctionDeclaration(statement: AnyNode): boolean {
  return (
    statement.declaredType === 'Function' ||
    statement.declaredType === 'function' ||
    statement.inferredDeclaredType === 'Function' ||
    statement.inferredDeclaredType === 'function'
  )
}

function emitModuleNullableRuntimeValueAssignment(
  statement: AnyNode,
  name: string,
  valueType: string,
  context: CFunctionContext
): string[] {
  context.moduleValueTypes.set(statement.name, 'unknown')
  context.nullableVariables.add(statement.name)
  registerModuleNullableRuntimeValueMetadata(statement, valueType, context)

  if (statement.init === null || typeof statement.init === 'undefined') {
    return [`${name} = inox_null_value();`]
  }

  let value = emitCValueExpression(statement.init, context)

  if (isNullableScalarType(valueType)) {
    value = emitNullableScalarValueExpression(statement.init, context)
  }

  const lines: string[] = []
  pushAll(lines, value.lines)
  pushModuleRuntimeValueAssignment(lines, name, value, context)
  lines.push(`inox_retain(${name});`)

  return lines
}

function registerModuleNullableRuntimeValueMetadata(
  statement: AnyNode,
  valueType: string,
  context: CFunctionContext
): void {
  if (valueType === 'object') {
    registerObjectShape(context, statement.name, statement.shape)
  } else if (valueType === 'function') {
    context.functionTypes.set(statement.name, normalizeFunctionType(statement.functionType))
    context.runtimeCallbacks.add(statement.name)
  }
}

function pushModuleRuntimeValueAssignment(
  lines: string[],
  name: string,
  value: PreparedExpression,
  context: CFunctionContext,
  targetCppType?: string | null
): void {
  if (value.cppType !== null && typeof value.cppType !== 'undefined' && isManagedRuntimeReturnType(value.valueType)) {
    const temp = nextCName(context, 'inox_module_value')

    lines.push(`auto ${temp} = ${value.expression};`)

    if (targetCppType !== null && typeof targetCppType !== 'undefined') {
      lines.push(`${name} = ${temp};`)
    } else {
      lines.push(`${name} = ${temp}.release();`)
    }
    return
  }

  lines.push(`${name} = ${value.expression};`)
}

function registerModuleRuntimeValueMetadata(statement: AnyNode, valueType: string, context: CFunctionContext): void {
  if (!isManagedRuntimeReturnType(valueType) && !isOpaqueRuntimeValueType(valueType)) {
    return
  }

  registerRuntimeValueMetadata(statement.name, valueType, statement, statement.init, context)
}

function registerModuleAsyncResultAssignmentMetadata(
  statement: AnyNode,
  prepared: PreparedExpression,
  context: CFunctionContext
): void {
  context.variables.set(statement.name, 'async-result')
  context.moduleValueTypes.set(statement.name, 'async-result')

  if (prepared.valueType !== null && typeof prepared.valueType !== 'undefined' && prepared.valueType !== 'unknown') {
    context.asyncResultValueTypes.set(statement.name, prepared.valueType)
  } else if (
    statement.asyncResultValueType !== null &&
    typeof statement.asyncResultValueType !== 'undefined' &&
    statement.asyncResultValueType !== 'unknown'
  ) {
    context.asyncResultValueTypes.set(statement.name, statement.asyncResultValueType)
  } else if (
    statement.init !== null &&
    typeof statement.init !== 'undefined' &&
    statement.init.asyncResultValueType !== null &&
    typeof statement.init.asyncResultValueType !== 'undefined' &&
    statement.init.asyncResultValueType !== 'unknown'
  ) {
    context.asyncResultValueTypes.set(statement.name, statement.init.asyncResultValueType)
  }

  if (
    prepared.rejectionValueType !== null &&
    typeof prepared.rejectionValueType !== 'undefined' &&
    prepared.rejectionValueType !== '' &&
    prepared.rejectionValueType !== 'unknown'
  ) {
    context.asyncResultRejectionValueTypes.set(statement.name, prepared.rejectionValueType)
  }
}

function emitModuleObjectFunctionFieldAssignments(
  _objectName: string,
  _expression: AnyNode,
  _declaredType: string | null | undefined,
  _context: CFunctionContext,
  _prepared?: PreparedExpression
): string[] {
  return []
}

function emitPreparedModuleObjectFunctionFieldAssignments(
  objectName: string,
  prepared: PreparedExpression | null | undefined,
  declaredType: string | null | undefined,
  context: CFunctionContext
): string[] {
  const lines: string[] = []
  const companions = prepared?.functionCompanions

  if (companions === null || typeof companions === 'undefined') {
    return lines
  }

  const fields = context.moduleObjectShapes.get(objectName) ?? context.objectShapes.get(objectName)
  const seenTypes = ['CFunctionContext']

  if (declaredType !== null && typeof declaredType !== 'undefined' && !seenTypes.includes(declaredType)) {
    seenTypes.push(declaredType)
  }

  for (const companion of companions) {
    const name = moduleObjectFunctionCompanionName(objectName, companion.path)
    const target = moduleObjectFunctionCompanionTarget(fields, companion.path, seenTypes)

    if (name !== null && target !== null) {
      const value = emitAdaptedModuleFunctionPointerExpression(
        companion.expression,
        cFunctionTypeValue(companion.functionType),
        target.functionType,
        context,
        target.seenTypes,
        companion.seenTypes
      )

      lines.push(`${name} = ${value};`)
    }
  }

  return lines
}

type CModuleObjectFunctionCompanionTarget = {
  functionType: CFunctionType | null | undefined
  seenTypes: string[]
}

function moduleObjectFunctionCompanionTarget(
  fields: CObjectShapeField[] | null | undefined,
  path: string[],
  seenTypes: string[]
): CModuleObjectFunctionCompanionTarget | null {
  if (fields === null || typeof fields === 'undefined' || path.length === 0) {
    return null
  }

  const field = objectShapeFieldForName(fields, path[0])

  if (field === null) {
    return null
  }

  if (path.length === 1) {
    if (field.valueType !== 'function') {
      return null
    }

    return { functionType: field.functionType, seenTypes }
  }

  if (field.valueType !== 'object') {
    return null
  }

  const nestedSeenTypes: string[] = []

  for (const seenType of seenTypes) {
    nestedSeenTypes.push(seenType)
  }

  if (
    field.declaredType !== null &&
    typeof field.declaredType !== 'undefined' &&
    !nestedSeenTypes.includes(field.declaredType)
  ) {
    nestedSeenTypes.push(field.declaredType)
  }

  const nestedPath: string[] = []

  for (let index = 1; index < path.length; index = index + 1) {
    nestedPath.push(path[index])
  }

  return moduleObjectFunctionCompanionTarget(field.shape?.fields, nestedPath, nestedSeenTypes)
}

function objectShapeFieldForName(fields: CObjectShapeField[], name: string): CObjectShapeField | null {
  for (const field of fields) {
    if (field.name === name) {
      return field
    }
  }

  return null
}

function moduleObjectFunctionCompanionName(objectName: string, path: string[]): string | null {
  if (path.length === 0) {
    return null
  }

  let nestedName = objectName

  for (let index = 0; index + 1 < path.length; index = index + 1) {
    const segment = path[index]

    if (segment !== null && typeof segment !== 'undefined') {
      nestedName = `${nestedName}_${segment}`
    }
  }

  const fieldName = path[path.length - 1]

  if (fieldName === null || typeof fieldName === 'undefined') {
    return null
  }

  return emitCObjectFunctionFieldName(nestedName, fieldName)
}

function emitModuleObjectFunctionFieldAssignmentsFromShape(
  objectName: string,
  expression: AnyNode,
  fields: CObjectShapeField[],
  context: CFunctionContext,
  seenTypes: string[]
): string[] {
  const lines: string[] = []

  for (const field of fields) {
    if (field.valueType === 'function') {
      const value = findObjectLiteralPropertyValue(expression, field.name)
      const fieldName = emitCObjectFunctionFieldName(objectName, field.name)

      if (isPlainObjectFunctionField(field, seenTypes)) {
        if (value === null || typeof value === 'undefined') {
          lines.push(`${fieldName} = 0;`)
        } else {
          const target = emitFunctionValueExpression(value, context)
          const targetFunctionType = resolveFunctionValueType(value, context)

          lines.push(
            `${fieldName} = ${emitAdaptedModuleFunctionPointerExpression(
              target,
              targetFunctionType,
              field.functionType,
              context,
              seenTypes,
              []
            )};`
          )
        }
      } else if (isRuntimeFunctionType(field.functionType)) {
        if (value === null || typeof value === 'undefined') {
          pushAll(lines, emitUndefinedRuntimeCallbackValueInto(fieldName, context))
        } else {
          pushAll(lines, emitRuntimeCallbackValueInto(value, field.functionType, fieldName, context))
        }
      }
    } else if (field.valueType === 'object') {
      const value = findObjectLiteralPropertyValue(expression, field.name)
      let nestedFields: CObjectShapeField[] | null = null

      if (
        field.shape !== null &&
        typeof field.shape !== 'undefined' &&
        field.shape.fields !== null &&
        typeof field.shape.fields !== 'undefined'
      ) {
        nestedFields = field.shape.fields
      }

      if (nestedFields === null || typeof nestedFields === 'undefined') {
        continue
      }

      let pushedType = false

      if (field.declaredType !== null && typeof field.declaredType !== 'undefined') {
        if (seenTypes.includes(field.declaredType)) {
          continue
        }

        seenTypes.push(field.declaredType)
        pushedType = true
      }

      if (value !== null && typeof value !== 'undefined' && value.type === 'ObjectLiteral') {
        pushAll(
          lines,
          emitModuleObjectFunctionFieldAssignmentsFromShape(
            `${objectName}_${field.name}`,
            value,
            nestedFields,
            context,
            seenTypes
          )
        )
      } else {
        const copied = emitModuleObjectFunctionFieldAssignmentsFromReference(
          `${objectName}_${field.name}`,
          value,
          nestedFields,
          context,
          seenTypes
        )

        if (copied !== null && typeof copied !== 'undefined') {
          pushAll(lines, copied)
        } else {
          pushAll(lines, emitModuleObjectFunctionFieldDefaultAssignments(`${objectName}_${field.name}`, nestedFields))
        }
      }

      if (pushedType) {
        seenTypes.pop()
      }
    }
  }

  return lines
}

function emitModuleObjectFunctionFieldAssignmentsFromReference(
  targetObjectName: string,
  expression: AnyNode | null | undefined,
  targetFields: CObjectShapeField[],
  context: CFunctionContext,
  seenTypes: string[]
): string[] | null {
  if (
    expression === null ||
    typeof expression === 'undefined' ||
    expression.type !== 'Reference' ||
    expression.path.length !== 1
  ) {
    return null
  }

  const sourceObjectName = expression.path[0]
  const sourceFields = moduleObjectFunctionFieldSourceFields(sourceObjectName, context)

  if (sourceFields === null || typeof sourceFields === 'undefined') {
    return null
  }

  return emitModuleObjectFunctionFieldCopyAssignments(
    targetObjectName,
    sourceObjectName,
    targetFields,
    sourceFields,
    context,
    seenTypes
  )
}

function moduleObjectFunctionFieldSourceFields(
  objectName: string,
  context: CFunctionContext
): CObjectShapeField[] | null {
  const fields = context.objectShapes.get(objectName)

  if (fields !== null && typeof fields !== 'undefined') {
    return fields
  }

  const moduleFields = context.moduleObjectShapes.get(objectName)

  if (moduleFields !== null && typeof moduleFields !== 'undefined') {
    return moduleFields
  }

  return null
}

function emitModuleObjectFunctionFieldCopyAssignments(
  targetObjectName: string,
  sourceObjectName: string,
  targetFields: CObjectShapeField[],
  sourceFields: CObjectShapeField[],
  context: CFunctionContext,
  seenTypes: string[]
): string[] {
  const lines: string[] = []

  for (const field of targetFields) {
    const sourceField = moduleObjectShapeFieldAt(sourceFields, field.name)

    if (field.valueType === 'function') {
      pushAll(
        lines,
        emitModuleObjectFunctionFieldCopyAssignment(
          targetObjectName,
          sourceObjectName,
          field,
          sourceField,
          context,
          seenTypes
        )
      )
    } else if (
      field.valueType === 'object' &&
      field.shape !== null &&
      typeof field.shape !== 'undefined' &&
      field.shape.fields !== null &&
      typeof field.shape.fields !== 'undefined'
    ) {
      const targetNestedFields = field.shape.fields
      const sourceNestedFields = moduleObjectFunctionFieldNestedSourceFields(
        sourceObjectName,
        sourceField,
        field,
        context
      )

      if (sourceNestedFields !== null && typeof sourceNestedFields !== 'undefined') {
        pushAll(
          lines,
          emitModuleObjectFunctionFieldCopyAssignments(
            `${targetObjectName}_${field.name}`,
            `${sourceObjectName}_${field.name}`,
            targetNestedFields,
            sourceNestedFields,
            context,
            seenTypes
          )
        )
      } else {
        pushAll(
          lines,
          emitModuleObjectFunctionFieldDefaultAssignments(`${targetObjectName}_${field.name}`, targetNestedFields)
        )
      }
    }
  }

  return lines
}

function emitModuleObjectFunctionFieldCopyAssignment(
  targetObjectName: string,
  sourceObjectName: string,
  targetField: CObjectShapeField,
  sourceField: CObjectShapeField | null,
  context: CFunctionContext,
  seenTypes: string[]
): string[] {
  const targetName = emitCObjectFunctionFieldName(targetObjectName, targetField.name)

  if (
    sourceField === null ||
    typeof sourceField === 'undefined' ||
    sourceField.valueType !== 'function' ||
    !isSupportedModuleObjectFunctionField(sourceField)
  ) {
    if (isPlainObjectFunctionField(targetField)) {
      return [`${targetName} = 0;`]
    }

    if (isRuntimeFunctionType(targetField.functionType)) {
      return emitUndefinedRuntimeCallbackValueInto(targetName, context)
    }

    return []
  }

  const sourceName = emitCObjectFunctionFieldName(sourceObjectName, targetField.name)

  if (isPlainObjectFunctionField(targetField)) {
    return [
      `${targetName} = ${emitAdaptedModuleFunctionPointerExpression(
        sourceName,
        sourceField.functionType,
        targetField.functionType,
        context,
        seenTypes,
        moduleObjectFunctionFieldSeenTypes(sourceObjectName, context)
      )};`
    ]
  }

  if (isRuntimeFunctionType(targetField.functionType)) {
    return emitRuntimeCallbackValueCopyInto(sourceName, targetName)
  }

  return []
}

function moduleObjectFunctionFieldNestedSourceFields(
  sourceObjectName: string,
  sourceField: CObjectShapeField | null,
  targetField: CObjectShapeField,
  context: CFunctionContext
): CObjectShapeField[] | null {
  if (
    sourceField !== null &&
    typeof sourceField !== 'undefined' &&
    sourceField.shape !== null &&
    typeof sourceField.shape !== 'undefined' &&
    sourceField.shape.fields !== null &&
    typeof sourceField.shape.fields !== 'undefined'
  ) {
    return sourceField.shape.fields
  }

  return moduleObjectFunctionFieldSourceFields(`${sourceObjectName}_${targetField.name}`, context)
}

function moduleObjectFunctionFieldSeenTypes(sourceObjectName: string, context: CFunctionContext): string[] {
  const declaredType = context.objectDeclaredTypes.get(sourceObjectName)

  if (declaredType !== null && typeof declaredType !== 'undefined') {
    return [declaredType]
  }

  if (context.moduleObjectShapes.has(sourceObjectName)) {
    return ['CFunctionContext']
  }

  return []
}

function objectFunctionFieldSeenTypes(objectName: string, context: CFunctionContext): string[] {
  const declaredType = context.objectDeclaredTypes.get(objectName)

  if (declaredType !== null && typeof declaredType !== 'undefined') {
    return [declaredType]
  }

  return ['CFunctionContext']
}

function emitRuntimeCallbackValueCopyInto(sourceName: string, out: string): string[] {
  return [`inox_retain(${sourceName});`, `inox_release(${out});`, `${out} = ${sourceName};`]
}

function emitAdaptedModuleFunctionPointerExpression(
  target: string,
  targetFunctionType: CFunctionType | null | undefined,
  functionType: CFunctionType | null | undefined,
  context: CFunctionContext,
  seenTypes: string[],
  targetSeenTypes: string[]
): string {
  if (
    targetFunctionType === null ||
    typeof targetFunctionType === 'undefined' ||
    functionType === null ||
    typeof functionType === 'undefined'
  ) {
    return target
  }

  if (
    !isThrowingFunctionPointerTarget(target, context) &&
    emitFunctionPointerReturnType(targetFunctionType) === emitFunctionPointerReturnType(functionType) &&
    emitFunctionPointerParams(targetFunctionType, [], targetSeenTypes) ===
      emitFunctionPointerParams(functionType, [], seenTypes)
  ) {
    return target
  }

  return emitFunctionPointerAdapter(target, targetFunctionType, functionType, context, seenTypes, targetSeenTypes)
}

function isThrowingFunctionPointerTarget(target: string, context: CFunctionContext): boolean {
  const sourceName = cFunctionPointerTargetSourceName(target, context)

  return sourceName !== null && typeof sourceName !== 'undefined' && isThrowingFunctionName(sourceName, context)
}

function cFunctionPointerTargetSourceName(target: string, context: CFunctionContext): string | null {
  for (const name of context.functionNames.keys()) {
    const cName = context.functionNames.get(name)

    if (cName === target) {
      return name
    }
  }

  return null
}

function emitModuleObjectFunctionFieldDefaultAssignments(objectName: string, fields: CObjectShapeField[]): string[] {
  const lines: string[] = []

  for (const field of fields) {
    if (field.valueType === 'function') {
      if (isPlainObjectFunctionField(field)) {
        lines.push(`${emitCObjectFunctionFieldName(objectName, field.name)} = 0;`)
      } else if (isRuntimeFunctionType(field.functionType)) {
        pushAll(lines, emitUndefinedRawRuntimeCallbackValueInto(emitCObjectFunctionFieldName(objectName, field.name)))
      }
    } else if (
      field.valueType === 'object' &&
      field.shape !== null &&
      typeof field.shape !== 'undefined' &&
      field.shape.fields !== null &&
      typeof field.shape.fields !== 'undefined'
    ) {
      pushAll(lines, emitModuleObjectFunctionFieldDefaultAssignments(`${objectName}_${field.name}`, field.shape.fields))
    }
  }

  return lines
}

function moduleValueDefaultExpression(valueType: string): string {
  if (valueType === 'string') {
    return '""'
  }

  if (valueType === 'unknown' || isManagedRuntimeReturnType(valueType) || isOpaqueRuntimeValueType(valueType)) {
    return 'inox_undefined_value()'
  }

  return '0'
}

function uninitializedDeclarationPrefix(statement: AnyNode): string {
  if (statement.kind === 'const') {
    return 'const '
  }

  return ''
}

function isBoxedRuntimeValueAssignment(expression: AnyNode, context: CFunctionContext): boolean {
  if (
    expression.target === null ||
    typeof expression.target === 'undefined' ||
    expression.target.type !== 'Reference'
  ) {
    return false
  }

  const path: string[] = expression.target.path

  return path.length === 1 && isBoxedRuntimeValueName(path[0], context)
}

function isNullableRuntimeValueAssignment(expression: AnyNode, context: CFunctionContext): boolean {
  if (
    expression.target === null ||
    typeof expression.target === 'undefined' ||
    expression.target.type !== 'Reference'
  ) {
    return false
  }

  const path: string[] = expression.target.path

  return path.length === 1 && context.nullableVariables.has(path[0])
}

function emptyPreparedExpression(): PreparedExpression {
  return {
    lines: [],
    expression: 'inox_undefined_value()'
  }
}

function emitNullableRuntimeValueAssignment(expression: AnyNode, context: CFunctionContext): string[] {
  const path: string[] = expression.target.path
  const name = path[0]

  if (name === null || typeof name === 'undefined') {
    return []
  }

  const targetType = context.variables.get(name)
  let value = emptyPreparedExpression()

  if (isNullableScalarType(targetType)) {
    value = emitNullableScalarValueExpression(expression.value, context)
  } else if (targetType === 'function') {
    value = emitNullableFunctionValueExpression(expression.value, context.functionTypes.get(name), context)
  } else if (expression.value.type === 'ObjectLiteral') {
    let shape: CObjectShape | null = null
    const fields = context.objectShapes.get(name)

    if (fields !== null && typeof fields !== 'undefined') {
      shape = {
        fields
      }
    }

    value = emitCObjectLiteralValueExpression(expression.value, context, shape)
  } else {
    value = emitCValueExpression(expression.value, context)
  }
  const nativeTarget =
    targetType === 'object' &&
    (libraryNativeCppType(expression.target.shape) !== null ||
      (value.cppType !== null && typeof value.cppType !== 'undefined'))
  const expectedTag = nativeTarget ? null : cRuntimeValueTag(targetType)
  const temp = nextCName(context, 'inox_nullable_value')
  const reference = emitCIdentifier(name)
  const lines: string[] = []
  const valueLines: string[] = value.lines

  for (const line of valueLines) {
    lines.push(line)
  }

  lines.push(`auto ${temp} = ${value.expression};`)

  const checkLines: string[] = emitRuntimeNullableValueCheck(temp, expectedTag, context)

  for (const line of checkLines) {
    lines.push(line)
  }

  lines.push(`${reference} = ${temp};`)

  const narrowingLines: string[] = clearNullableScalarNarrowing(name, context)

  for (const line of narrowingLines) {
    lines.push(line)
  }

  return lines
}

function emitBoxedRuntimeValueAssignment(expression: AnyNode, context: CFunctionContext): string[] {
  const path: string[] = expression.target.path
  const name = path[0]

  if (name === null || typeof name === 'undefined') {
    return []
  }

  const reference = emitCIdentifier(name)
  const expected = context.variables.get(name)
  const value = emitCValueExpression(expression.value, context)
  const temp = nextCName(context, 'inox_box_value')
  let tag = 'INOX_TAG_OBJECT'

  if (expected === 'string') {
    tag = 'INOX_TAG_STRING'
  }

  const lines: string[] = []
  const valueLines: string[] = value.lines

  for (const line of valueLines) {
    lines.push(line)
  }

  lines.push(`auto ${temp} = ${value.expression};`)
  lines.push(emitRuntimeTypeCheck(`${temp}.tag != ${tag} || ${temp}.as.ref == 0`, context))
  lines.push(`inox_retain(${temp});`)
  lines.push(`inox_release(${reference}->value);`)
  lines.push(`${reference}->value = ${temp};`)

  return lines
}

function isBoxedRuntimeValueName(name: string, context: CFunctionContext): boolean {
  return context.boxedVariables.has(name) && isRuntimeBoxedValueType(context.variables.get(name))
}

function isBoxedRuntimeStringName(name: string, context: CFunctionContext): boolean {
  return context.boxedVariables.has(name) && context.variables.get(name) === 'string'
}

function isBoxedRuntimeStringReference(expression: AnyNode, context: CFunctionContext): boolean {
  return (
    expression.type === 'Reference' &&
    expression.path.length === 1 &&
    isBoxedRuntimeStringName(expression.path[0], context)
  )
}

function emitBoxedObjectVariableDeclaration(statement: AnyNode, context: CFunctionContext): string[] {
  const shapeName = nextCName(context, `inox_shape_${emitCIdentifier(statement.name)}`)
  const fieldsName = `${shapeName}_fields`
  let fields: CObjectShapeField[] = []
  const shape: CObjectShape | null | undefined = statement.shape

  if (shape !== null && typeof shape !== 'undefined' && shape.fields !== null && typeof shape.fields !== 'undefined') {
    fields = shape.fields
  } else {
    const properties: CObjectLiteralPropertyNode[] = statement.init.properties

    for (const property of properties) {
      if (property.spread === true) {
        continue
      }

      fields.push({
        name: property.key,
        readonlyField: false,
        valueType: inferObjectFieldValueType(property.value, context),
        shape: property.value.shape,
        functionType: resolveFunctionValueType(property.value, context)
      })
    }
  }

  const lines = [`static const inox_field_info ${fieldsName}[] = {`]

  for (const field of fields) {
    lines.push(`  { ${cStringLiteral(field.name)}, ${emitCFieldFlags(field)} },`)
  }

  lines.push('};')
  lines.push(`static const inox_shape ${shapeName} = {`)
  lines.push(`  ${fields.length},`)
  lines.push(`  ${fieldsName}`)
  lines.push('};')
  registerBoxedValue(context, statement.name, 'object')
  context.boxedVariables.add(statement.name)
  context.variables.set(statement.name, 'object')
  const objectShapeFields: CObjectShapeField[] = []

  for (const field of fields) {
    let ownership = field.ownership

    if (ownership === null || typeof ownership === 'undefined') {
      ownership = 'strong'
    }

    const objectShapeField: CObjectShapeField = {
      name: field.name,
      optional: field.optional,
      ownership,
      readonlyField: isReadonlyCObjectShapeField(field),
      declaredType: field.declaredType,
      typeRef: field.typeRef,
      valueType: field.valueType,
      shape: field.shape,
      functionType: field.functionType
    }

    objectShapeFields.push(objectShapeField)
  }

  context.objectShapes.set(statement.name, objectShapeFields)
  lines.push(
    `${emitCIdentifier(statement.name)} = (inox_value*)inox_default_alloc(0, sizeof(inox_value), _Alignof(inox_value));`
  )
  lines.push(`if (${emitCIdentifier(statement.name)} == 0) ${emitFailureStatement(context)}`)
  lines.push(`*${emitCIdentifier(statement.name)} = inox_undefined_value();`)
  lines.push(
    emitStatusCheck(
      `inox_object_new(&inox_default_allocator, &${shapeName}, ${emitCIdentifier(statement.name)})`,
      context
    )
  )
  const spreads = prepareObjectLiteralSpreads(statement.init, context, lines)
  const seenTypes: string[] = []

  if (statement.declaredType !== null && typeof statement.declaredType !== 'undefined') {
    seenTypes.push(statement.declaredType)
  }

  for (let index = 0; index < fields.length; index++) {
    const field = fields[index]
    const propertyValue = findObjectLiteralPropertyValue(statement.init, field.name)

    if (propertyValue === null || typeof propertyValue === 'undefined') {
      const spread = preparedObjectSpreadForField(spreads, statement.init.properties, field.name)

      if (spread !== null && typeof spread !== 'undefined') {
        const spreadValue = nextCName(context, 'inox_spread_value')

        lines.push(`auto ${spreadValue} = inox::get(${spread.name}, ${cStringLiteral(field.name)});`)
        lines.push(emitRuntimeTypeCheck('inox::thrown()', context))
        lines.push(
          emitStatusCheck(
            `inox_object_init_known(*${emitCIdentifier(statement.name)}, ${index}, ${spreadValue})`,
            context
          )
        )
        continue
      }

      if (field.optional !== true) {
        pushDiagnostic(context, diagnostic('INOX_MISSING_FIELD', `missing field ${field.name}`, statement.loc))
      }
      continue
    }

    if (field.valueType === 'function') {
      const fieldName = emitCObjectFunctionFieldName(statement.name, field.name)

      registerOwnedValue(context, fieldName)
      pushAll(lines, emitRuntimeCallbackValueInto(nodeOrEmpty(propertyValue), field.functionType, fieldName, context))
      lines.push(
        emitStatusCheck(`inox_object_init_known(*${emitCIdentifier(statement.name)}, ${index}, ${fieldName})`, context)
      )

      continue
    }

    const value = emitObjectFieldInitializerValue(field, nodeOrEmpty(propertyValue), context)

    for (const line of value.lines) {
      lines.push(line)
    }

    lines.push(
      emitStatusCheck(
        `inox_object_init_known(*${emitCIdentifier(statement.name)}, ${index}, ${value.expression})`,
        context
      )
    )
  }

  return lines
}

function emitKnownObjectMemberVariableDeclaration(
  statement: AnyNode,
  member: CKnownObjectField,
  context: CFunctionContext
): string[] {
  const key = knownObjectMemberKey(member)

  return emitObjectMemberVariableDeclaration(statement, member, context, member.objectName, key)
}

function emitDynamicObjectMemberVariableDeclaration(
  statement: AnyNode,
  member: CKnownObjectIndexField,
  context: CFunctionContext
): string[] {
  return emitObjectMemberVariableDeclaration(statement, member, context, member.objectName, member.key)
}

function emitObjectMemberGetLines(objectName: string, key: string, temp: string, context: CFunctionContext): string[] {
  const object = emitObjectValueReference(objectName, context)
  const lines = [`${temp} = inox::get(${object}, ${cStringLiteral(key)});`]

  pushAll(lines, emitThrownCheckLines(context))

  return lines
}

function emitObjectMemberVariableDeclaration(
  statement: AnyNode,
  member: CKnownObjectField,
  context: CFunctionContext,
  objectName: string,
  key: string
): string[] {
  const declaredFieldType = anyNodeLikeDeclaredObjectFieldValueType(context.objectDeclaredTypes.get(objectName), key)

  if (member.valueType === 'unknown' && declaredFieldType !== null && declaredFieldType !== 'unknown') {
    member.valueType = declaredFieldType
  }

  if (member.valueType === 'bytes') {
    return emitObjectBytesMemberVariableDeclaration(statement, member, context, objectName, key)
  }

  if (member.valueType === 'object') {
    return emitObjectObjectMemberVariableDeclaration(statement, member, context, objectName, key)
  }

  if (member.valueType === 'string') {
    return emitObjectStringMemberVariableDeclaration(statement, context, objectName, key)
  }

  if (member.valueType === 'function') {
    const name = emitCIdentifier(statement.name)
    const lines: string[] = []

    registerOwnedValue(context, name)
    pushAll(lines, emitObjectMemberGetLines(objectName, key, name, context))
    lines.push(emitRuntimeTypeCheck(`${name}.tag != INOX_TAG_FUNCTION || ${name}.as.ref == 0`, context))
    context.variables.set(statement.name, 'function')
    context.functionTypes.set(statement.name, normalizeFunctionType(member.functionType))
    context.runtimeCallbacks.add(statement.name)
    return lines
  }

  if (!isNullableScalarType(member.valueType)) {
    let message = `object field type ${member.valueType} is not supported by the current C++ backend slice`

    pushDiagnostic(context, diagnostic(cUnsupportedExpressionCode(member.valueType), message, statement.loc))
    return [`double ${emitCIdentifier(statement.name)} = 0;`]
  }

  const temp = nextCName(context, 'inox_field')
  registerOwnedValue(context, temp)
  let runtimeValueExpression = `${temp}.as.number`
  const lines: string[] = []

  if (member.valueType === 'boolean') {
    runtimeValueExpression = `${temp}.as.boolean ? 1 : 0`
  }

  pushAll(lines, emitObjectMemberGetLines(objectName, key, temp, context))
  lines.push(`double ${emitCIdentifier(statement.name)} = ${runtimeValueExpression};`)

  context.variables.set(statement.name, member.valueType)

  return lines
}

function emitObjectBytesMemberVariableDeclaration(
  statement: AnyNode,
  member: CKnownObjectField,
  context: CFunctionContext,
  objectName: string,
  key: string
): string[] {
  registerOwnedValue(context, statement.name)
  const lines: string[] = []

  pushAll(lines, emitObjectMemberGetLines(objectName, key, statement.name, context))
  lines.push(
    emitRuntimeTypeCheck(
      `${emitCIdentifier(statement.name)}.tag != INOX_TAG_BYTES || ${emitCIdentifier(statement.name)}.as.ref == 0`,
      context
    )
  )

  context.variables.set(statement.name, member.valueType)

  return lines
}

function emitObjectObjectMemberVariableDeclaration(
  statement: AnyNode,
  member: CKnownObjectField,
  context: CFunctionContext,
  objectName: string,
  key: string
): string[] {
  registerOwnedValue(context, statement.name)
  const lines: string[] = []

  pushAll(lines, emitObjectMemberGetLines(objectName, key, statement.name, context))

  if (libraryNativeCppType(member.shape) === null) {
    lines.push(emitRuntimeTypeCheck(runtimeObjectLikeValueMismatchCondition(emitCIdentifier(statement.name)), context))
  }

  context.variables.set(statement.name, 'object')

  if (statement.shape !== null && typeof statement.shape !== 'undefined') {
    registerObjectShape(context, statement.name, statement.shape)
  }

  if (member.declaredType !== null && typeof member.declaredType !== 'undefined') {
    context.objectDeclaredTypes.set(statement.name, member.declaredType)
  }

  const alias = objectExpressionPathName(statement.init, context)

  if (alias !== null && typeof alias !== 'undefined' && alias !== statement.name) {
    context.objectAliases.set(statement.name, alias)
  } else {
    context.objectAliases.delete(statement.name)
  }

  return lines
}

function emitObjectStringMemberVariableDeclaration(
  statement: AnyNode,
  context: CFunctionContext,
  objectName: string,
  key: string
): string[] {
  const temp = nextCName(context, 'inox_field')
  const lines: string[] = []

  registerOwnedValue(context, temp)

  pushAll(lines, emitObjectMemberGetLines(objectName, key, temp, context))
  lines.push(emitRuntimeTypeCheck(`${temp}.tag != INOX_TAG_STRING || ${temp}.as.ref == 0`, context))
  lines.push(`inox_string* ${emitCIdentifier(statement.name)} = (inox_string*)${temp}.as.ref;`)

  context.variables.set(statement.name, 'string')
  context.runtimeStrings.add(statement.name)

  return lines
}

function emitKnownObjectMemberAssignment(
  expression: AnyNode,
  member: CKnownObjectField,
  context: CFunctionContext
): string[] {
  const value = emitRuntimeObjectAssignmentValue(expression.value, context)
  const valueType = inferExpressionType(expression.value, context)
  const lines: string[] = []

  updateKnownObjectMemberValueType(member, valueType, context)

  pushAll(lines, value.lines)
  pushAll(lines, emitKnownObjectMemberFunctionFieldAssignments(expression, member, context))
  const key = knownObjectMemberKey(member)
  lines.push(
    emitStatusCheck(
      `inox_object_set(${emitObjectValueReference(member.objectName, context)}, ${cStringLiteral(key)}, ${utf8ByteLength(key)}, ${value.expression})`,
      context
    )
  )

  return lines
}

function emitKnownObjectMemberFunctionFieldAssignments(
  _expression: AnyNode,
  _member: CKnownObjectField,
  _context: CFunctionContext
): string[] {
  return []
}

function emitDynamicObjectMemberAssignment(
  expression: AnyNode,
  member: CKnownObjectIndexField,
  context: CFunctionContext
): string[] {
  const value = emitRuntimeObjectAssignmentValue(expression.value, context)
  const valueType = inferExpressionType(expression.value, context)
  const lines: string[] = []

  updateKnownObjectMemberValueType(member, valueType, context)

  pushAll(lines, value.lines)
  lines.push(
    emitStatusCheck(
      `inox_object_set(${emitObjectValueReference(member.objectName, context)}, ${cStringLiteral(member.key)}, ${utf8ByteLength(member.key)}, ${value.expression})`,
      context
    )
  )

  return lines
}

function emitRuntimeObjectAssignmentValue(valueExpression: AnyNode, context: CFunctionContext): PreparedExpression {
  const value = emitCValueExpression(valueExpression, context)
  const classInstanceValue = emitPreparedClassInstanceRefValueExpression(value, context)

  if (classInstanceValue !== null && typeof classInstanceValue !== 'undefined') {
    const lines: string[] = []

    pushAll(lines, value.lines)
    pushAll(lines, classInstanceValue.lines)

    return {
      lines,
      expression: classInstanceValue.expression,
      valueType: classInstanceValue.valueType
    }
  }

  if (value.scalarType === 'double' || value.cppType === 'double') {
    return {
      lines: value.lines,
      expression: `inox_number_value(${value.expression})`,
      valueType: value.valueType
    }
  }

  if (value.scalarType === 'bool' || value.cppType === 'bool') {
    return {
      lines: value.lines,
      expression: `inox_bool_value(${value.expression})`,
      valueType: value.valueType
    }
  }

  return value
}

function knownObjectMemberKey(member: CKnownObjectField): string {
  if (member.key !== null && typeof member.key !== 'undefined') {
    return member.key
  }

  return ''
}

function emitArrayVariableDeclaration(statement: AnyNode, context: CFunctionContext): string[] {
  const moduleName = context.moduleValueNames.get(statement.name)
  const name = moduleName ?? emitCIdentifier(statement.name)
  const array = emitCArrayLiteralValueExpression(statement.init, context, {
    declare: moduleName === null || typeof moduleName === 'undefined',
    name
  })
  const lines: string[] = [...array.lines]
  context.variables.set(statement.name, array.valueType ?? 'object')
  context.cppValueTypes.set(statement.name, array.cppType ?? compilerArrayLiteralCppType(statement.init, context))

  return lines
}

function isSupportedObjectFieldStorageType(valueType: string): boolean {
  return (
    valueType === 'unknown' ||
    isManagedRuntimeReturnType(valueType) ||
    isNullableScalarType(valueType) ||
    isOpaqueRuntimeValueType(valueType)
  )
}

function unsupportedObjectFieldStorageMessage(valueType: string): string {
  if (valueType === 'function') {
    return 'stored callback object fields need delayed closure lifetime support and are not supported by the current C++ backend slice'
  }

  return `object field type ${valueType} is not supported by the current C++ backend slice`
}

function unsupportedObjectFieldValueExpression(
  valueType: string,
  loc: CSourceLocation,
  context: CFunctionContext
): PreparedExpression {
  pushDiagnostic(
    context,
    diagnostic(cUnsupportedExpressionCode(valueType), unsupportedObjectFieldStorageMessage(valueType), loc)
  )

  return {
    lines: [],
    expression: 'inox_undefined_value()'
  }
}

function emitObjectFieldInitializerValue(
  field: CObjectShapeField,
  propertyValue: AnyNode,
  context: CFunctionContext
): PreparedExpression {
  if (field.valueType === 'function') {
    return emitRuntimeCallbackValue(propertyValue, field.functionType, context)
  }

  if (!isSupportedObjectFieldStorageType(field.valueType)) {
    return unsupportedObjectFieldValueExpression(field.valueType, propertyValue.loc, context)
  }

  return emitObjectFieldValueExpression(field, propertyValue, context)
}

function emitObjectFieldValueExpression(
  field: CObjectShapeField,
  propertyValue: AnyNode,
  context: CFunctionContext
): PreparedExpression {
  if (field.valueType === 'string') {
    const runtimeString = emitPreparedRuntimeStringReferenceValue(propertyValue, context)

    if (runtimeString !== null) {
      return runtimeString
    }
  }

  const value = emitCValueExpression(propertyValue, context)

  if (field.valueType !== 'object') {
    return value
  }

  const classInstanceValue = emitPreparedClassInstanceRefValueExpression(value, context)

  if (classInstanceValue !== null && typeof classInstanceValue !== 'undefined') {
    const lines: string[] = []

    pushAll(lines, value.lines)
    pushAll(lines, classInstanceValue.lines)

    return {
      lines,
      expression: classInstanceValue.expression,
      valueType: classInstanceValue.valueType
    }
  }

  return value
}

function emitCValueExpression(expression: AnyNode, context: CFunctionContext): PreparedExpression {
  return emitCValueExpressionWithDependencies(expression, context, cValueExpressionDependencies)
}

function emitPreparedRuntimeValueArgumentExpression(
  expression: AnyNode,
  context: CFunctionContext,
  preservePendingException: boolean
): PreparedExpression {
  if (inferExpressionType(expression, context) === 'function') {
    return emitRuntimeCallbackValue(expression, normalizeFunctionType(resolveFunctionValueType(expression, context)), context)
  }

  if (preservePendingException) {
    const libraryCall = emitPreparedCompilerLibraryCallExpression(expression, context, {
      deferThrownCheck: true
    })

    if (libraryCall !== null) {
      return libraryCall
    }
  }

  if (preservePendingException && (isMemberAccessExpression(expression) || isIndexAccessExpression(expression))) {
    const nativeClassField = emitPreparedNativeClassFieldValueExpression(expression, context)

    if (nativeClassField !== null && typeof nativeClassField !== 'undefined') {
      return nativeClassField
    }

    const value = emitPreparedObjectFieldRuntimeValueExpression(expression, context, objectExpressionFieldDependencies)

    if (value !== null) {
      return value
    }
  }

  return emitCValueExpression(expression, context)
}

function emitNullableScalarValueExpression(expression: AnyNode, context: CFunctionContext): PreparedExpression {
  if (expression.type === 'NullLiteral') {
    return {
      lines: [],
      expression: 'inox_null_value()'
    }
  }

  const libraryValue = emitPreparedCompilerLibraryCallExpression(expression, context)

  if (libraryValue !== null && libraryValue.cppType === 'inox::Value') {
    return libraryValue
  }

  if (libraryValue !== null && libraryValue.cppType === 'inox::String') {
    const lines: string[] = []
    const valueName = nextCName(context, 'inox_library_nullable_string')

    pushAll(lines, libraryValue.lines)
    lines.push(`auto ${valueName} = ${libraryValue.expression};`)

    return {
      lines,
      expression: `${valueName}.release()`,
      valueType: 'string'
    }
  }

  if (isNullableScalarRuntimeExpression(expression, context)) {
    return emitPreparedNullableScalarRuntimeValueExpression(expression, context)
  }

  const fieldValue = emitPreparedNullableScalarFieldValueExpression(expression, context)

  if (fieldValue !== null && typeof fieldValue !== 'undefined') {
    return fieldValue
  }

  const valueType = inferExpressionType(expression, context)

  if (
    valueType === 'unknown' &&
    expression.type === 'Reference' &&
    expression.path.length === 1 &&
    expression.path[0] === 'undefined'
  ) {
    return emitCValueExpression(expression, context)
  }

  if (valueType === 'string') {
    return emitCValueExpression(expression, context)
  }

  const runtimeStringReference = emitNullableRuntimeStringReferenceValueExpression(expression, context)

  if (runtimeStringReference !== null && typeof runtimeStringReference !== 'undefined') {
    return runtimeStringReference
  }

  if (!isNullableScalarType(valueType)) {
    pushDiagnostic(
      context,
      diagnostic(
        'INOX_C_NULLISH',
        'nullable scalar values currently support only number, boolean, string and null values in C',
        expression.loc
      )
    )

    return {
      lines: [],
      expression: 'inox_null_value()'
    }
  }

  const value = emitPreparedNumberExpression(expression, context)
  let runtimeExpression = `inox_number_value(${value.expression})`

  if (valueType === 'boolean') {
    runtimeExpression = `inox_bool_value((${value.expression}) != 0)`
  }

  return {
    lines: value.lines,
    expression: runtimeExpression
  }
}

function emitNullableRuntimeStringReferenceValueExpression(
  expression: AnyNode,
  context: CFunctionContext
): PreparedExpression | null {
  if (
    expression === null ||
    typeof expression === 'undefined' ||
    expression.type !== 'Reference' ||
    expression.path.length !== 1
  ) {
    return null
  }

  const name = expression.path[0]
  if (
    context.variables.get(name) === 'string' ||
    context.runtimeStrings.has(name) ||
    isBoxedRuntimeStringName(name, context)
  ) {
    return emitCValueExpression(expression, context)
  }

  return null
}

function emitPreparedNullableScalarRuntimeValueExpression(
  expression: AnyNode,
  context: CFunctionContext
): PreparedExpression {
  if (isCoalesceExpression(expression)) {
    return emitCNullishCoalescingValueExpression(expression, context)
  }

  if (
    expression !== null &&
    typeof expression !== 'undefined' &&
    expression.type === 'Reference' &&
    expression.path.length === 1
  ) {
    const name = expression.path[0]

    if (context.nullableVariables.has(name) && isNullableScalarType(context.variables.get(name))) {
      return {
        lines: [],
        expression: emitCIdentifier(name)
      }
    }
  }

  if (expression !== null && typeof expression !== 'undefined' && expression.type === 'OptionalMemberExpression') {
    return emitCOptionalMemberValueExpression(expression, context)
  }

  if (expression !== null && typeof expression !== 'undefined' && expression.type === 'OptionalIndexExpression') {
    return emitCOptionalIndexValueExpression(expression, context)
  }

  if (expression !== null && typeof expression !== 'undefined' && expression.type === 'OptionalCallExpression') {
    return emitOptionalCallbackCallValueExpression(expression, context)
  }

  const fieldValue = emitPreparedNullableScalarFieldValueExpression(expression, context)

  if (fieldValue !== null && typeof fieldValue !== 'undefined') {
    return fieldValue
  }

  const conditional = emitPreparedNullableConditionalValueExpression(expression, context)

  if (conditional !== null && typeof conditional !== 'undefined') {
    return conditional
  }

  if (
    expression !== null &&
    typeof expression !== 'undefined' &&
    expression.type === 'CallExpression' &&
    isNullableScalarRuntimeExpression(expression, context)
  ) {
    const valueType = inferExpressionType(expression, context)
    const expectedTag = cRuntimeValueTag(valueType)
    const call = emitPreparedCallExpression(expression, context)
    const temp = nextCName(context, 'inox_nullable_value')
    const lines: string[] = []

    registerOwnedValue(context, temp)

    pushAll(lines, call.lines)
    lines.push(`${temp} = ${call.expression};`)

    pushAll(lines, emitRuntimeNullableValueCheck(temp, expectedTag, context))

    return {
      lines,
      expression: temp,
      owned: true
    }
  }

  pushDiagnostic(
    context,
    diagnostic(
      'INOX_C_NULLISH',
      'this nullable scalar expression is not supported by the current C++ backend slice',
      expression.loc
    )
  )

  return {
    lines: [],
    expression: 'inox_null_value()'
  }
}

function emitPreparedNullableConditionalValueExpression(
  expression: AnyNode,
  context: CFunctionContext
): PreparedExpression | null {
  if (expression.type !== 'ConditionalExpression') {
    return null
  }

  const valueType = inferExpressionType(expression, context)

  if (!isNullableScalarType(valueType)) {
    return null
  }

  const testExpression = cIndexNodeOrNull(expression.test)
  const consequentExpression = cIndexNodeOrNull(expression.consequent)
  const alternateExpression = cIndexNodeOrNull(expression.alternate)

  if (testExpression === null || consequentExpression === null || alternateExpression === null) {
    return null
  }

  const test = emitPreparedNullableConditionalTestExpression(testExpression, context)
  const consequent = emitNullableScalarValueExpression(consequentExpression, context)
  const alternate = emitNullableScalarValueExpression(alternateExpression, context)
  const temp = nextCName(context, 'inox_nullable_conditional')
  const expectedTag = cRuntimeValueTag(valueType)
  const lines: string[] = []

  registerOwnedValue(context, temp)
  pushAll(lines, test.lines)
  lines.push(`if ${emitCConditionClause(test.expression)} {`)
  pushIndented(lines, consequent.lines, '  ')
  lines.push(`  ${temp} = ${consequent.expression};`)
  lines.push('} else {')
  pushIndented(lines, alternate.lines, '  ')
  lines.push(`  ${temp} = ${alternate.expression};`)
  lines.push('}')
  pushAll(lines, emitRuntimeNullableValueCheck(temp, expectedTag, context))

  return {
    lines,
    expression: temp,
    owned: true
  }
}

function emitPreparedNullableConditionalTestExpression(
  expression: AnyNode,
  context: CFunctionContext
): PreparedExpression {
  const truthiness = emitPreparedStatementRuntimeTruthinessExpression(expression, context)

  if (truthiness !== null && typeof truthiness !== 'undefined') {
    return truthiness
  }

  return emitPreparedNumberExpression(expression, context)
}

function emitPreparedNullableScalarFieldValueExpression(
  expression: AnyNode,
  context: CFunctionContext
): PreparedExpression | null {
  if (expression.type === 'MemberExpression') {
    const nativeClassField = emitPreparedNativeClassFieldValueExpression(expression, context)

    if (nativeClassField !== null && typeof nativeClassField !== 'undefined') {
      return nativeClassField
    }

    const knownMember = emitPreparedKnownObjectMemberValueExpression(expression, context)

    if (knownMember !== null && typeof knownMember !== 'undefined') {
      return knownMember
    }

    const objectMember = emitPreparedObjectExpressionMemberValueExpression(
      expression,
      context,
      objectExpressionFieldDependencies
    )

    if (objectMember !== null && typeof objectMember !== 'undefined') {
      return objectMember
    }

    return emitPreparedDynamicObjectMemberValueExpression(expression, context, objectExpressionFieldDependencies)
  }

  if (expression.type === 'IndexExpression') {
    const knownIndex = emitPreparedKnownObjectIndexValueExpression(expression, context)

    if (knownIndex !== null && typeof knownIndex !== 'undefined') {
      return knownIndex
    }

    const objectIndex = emitPreparedObjectExpressionIndexValueExpression(
      expression,
      context,
      objectExpressionFieldDependencies
    )

    if (objectIndex !== null && typeof objectIndex !== 'undefined') {
      return objectIndex
    }

    const dynamicIndex = emitPreparedDynamicObjectIndexValueExpression(
      expression,
      context,
      objectExpressionFieldDependencies
    )

    if (dynamicIndex !== null && typeof dynamicIndex !== 'undefined') {
      return dynamicIndex
    }

    return null
  }

  return null
}

function emitNullableFunctionValueExpression(
  expression: AnyNode,
  functionType: CFunctionType | null | undefined,
  context: CFunctionContext
): PreparedExpression {
  if (expression !== null && typeof expression !== 'undefined' && expression.type === 'NullLiteral') {
    return {
      lines: [],
      expression: 'inox_null_value()'
    }
  }

  if (
    expression !== null &&
    typeof expression !== 'undefined' &&
    expression.type === 'Reference' &&
    expression.path.length === 1
  ) {
    const name = expression.path[0]

    if (context.nullableVariables.has(name) && context.variables.get(name) === 'function') {
      return {
        lines: [],
        expression: emitCIdentifier(name)
      }
    }
  }

  return emitRuntimeCallbackValue(expression, normalizeFunctionType(functionType), context)
}

type ArrayLiteralOutputTarget = {
  declare: boolean
  name: string
}

function emitCArrayLiteralValueExpression(
  expression: AnyNode,
  context: CFunctionContext,
  outputTarget?: ArrayLiteralOutputTarget
): PreparedExpression {
  const temp = outputTarget?.name ?? nextCName(context, 'inox_array')
  const lines: string[] = []
  const arrayCppType = compilerArrayLiteralCppType(expression, context)
  const materialization = compilerLibraryIntrinsicSequenceMaterialization(context.libraries, 'array-literal')

  if (materialization === null || typeof materialization === 'undefined') {
    pushDiagnostic(
      context,
      diagnostic(
        'INOX_C_LIBRARY_INTRINSIC',
        'missing C++ sequence materialization for array-literal provider',
        expression.loc
      )
    )
    return {
      lines,
      expression: 'inox::Value()',
      cppType: 'inox::Value',
      valueType: 'unknown'
    }
  }

  const target = outputTarget?.declare === true ? `auto ${temp}` : (outputTarget?.name ?? `${arrayCppType} ${temp}`)
  const literalExpression = materialization.literalExpression

  if (
    typeof literalExpression === 'string' &&
    literalExpression.length > 0 &&
    expression.elements.length > 0 &&
    compilerArrayLiteralCanUseDirectMaterialization(expression)
  ) {
    const values: string[] = []

    for (let index = 0; index < expression.elements.length; index = index + 1) {
      const value = emitCValueExpression(expression.elements[index], context)
      pushAll(lines, value.lines)
      values.push(value.expression)
    }

    lines.push(
      `${target} = ${renderSequenceMaterializationExpression(literalExpression, {
        count: `${expression.elements.length}`,
        cppType: arrayCppType,
        index: '',
        target: temp,
        value: '',
        values: joinStrings(values, ', ')
      })};`
    )
    pushAll(lines, emitThrownCheckLines(context))

    return {
      lines,
      expression: temp,
      cppType: arrayCppType,
      valueType: expression.valueType ?? 'unknown'
    }
  }

  const createExpression = renderSequenceMaterializationExpression(materialization.createExpression, {
    count: `${expression.elements.length}`,
    cppType: arrayCppType,
    index: '',
    target: '',
    value: ''
  })

  lines.push(`${target} = ${createExpression};`)
  pushAll(lines, emitThrownCheckLines(context))

  for (let index = 0; index < expression.elements.length; index++) {
    const element = expression.elements[index]

    if (element.type === 'SpreadElement') {
      const spread = emitCValueExpression(element.argument, context)
      const spreadAdapter = materialization.appendSpreadValueAdapter
      let spreadExpression = spread.expression

      pushAll(lines, spread.lines)

      if (
        typeof spreadAdapter === 'string' &&
        !compilerLibraryNativeCppTypeIsAssignableToTypeId(
          cCompilerLibrarySetValue(context.libraries),
          spread.cppType,
          materialization.appendSpreadValueTypeId
        )
      ) {
        spreadExpression = spreadAdapter.split('$value').join(spreadExpression)
      }

      lines.push(
        `${renderSequenceMaterializationExpression(materialization.appendSpreadExpression, {
          count: `${expression.elements.length}`,
          cppType: arrayCppType,
          index: `${index}`,
          target: temp,
          value: spreadExpression
        })};`
      )
      pushAll(lines, emitThrownCheckLines(context))
      continue
    }

    let value = emitCValueExpression(element, context)
    const elementFunctionType = arrayLiteralElementFunctionType(expression, element, context)

    if (
      (elementFunctionType !== null && typeof elementFunctionType !== 'undefined') ||
      inferExpressionType(element, context) === 'function'
    ) {
      value = emitRuntimeCallbackValue(element, normalizeFunctionType(elementFunctionType), context)
    }

    pushAll(lines, value.lines)
    lines.push(
      `${renderSequenceMaterializationExpression(materialization.appendElementExpression, {
        count: `${expression.elements.length}`,
        cppType: arrayCppType,
        index: `${index}`,
        target: temp,
        value: value.expression
      })};`
    )
    pushAll(lines, emitThrownCheckLines(context))
  }

  return {
    lines,
    expression: temp,
    cppType: arrayCppType,
    valueType: expression.valueType ?? 'unknown'
  }
}

function renderSequenceMaterializationExpression(
  expression: string,
  values: { count: string; cppType: string; index: string; target: string; value: string; values?: string }
): string {
  let rendered = ''
  let index = 0

  while (index < expression.length) {
    if (expression.slice(index, index + 8) === '$cppType') {
      rendered = rendered + values.cppType
      index = index + 8
    } else if (expression.slice(index, index + 7) === '$target') {
      rendered = rendered + values.target
      index = index + 7
    } else if (expression.slice(index, index + 7) === '$values') {
      rendered = rendered + (values.values ?? '')
      index = index + 7
    } else if (expression.slice(index, index + 6) === '$count') {
      rendered = rendered + values.count
      index = index + 6
    } else if (expression.slice(index, index + 6) === '$index') {
      rendered = rendered + values.index
      index = index + 6
    } else if (expression.slice(index, index + 6) === '$value') {
      rendered = rendered + values.value
      index = index + 6
    } else {
      rendered = rendered + expression.slice(index, index + 1)
      index = index + 1
    }
  }

  return rendered
}

function compilerArrayLiteralCanUseDirectMaterialization(expression: AnyNode): boolean {
  for (let index = 0; index < expression.elements.length; index = index + 1) {
    const element = expression.elements[index]

    if (
      element.type !== 'StringLiteral' &&
      element.type !== 'NumberLiteral' &&
      element.type !== 'BooleanLiteral' &&
      element.type !== 'NullLiteral'
    ) {
      return false
    }
  }

  return true
}

function compilerArrayLiteralCppType(expression: AnyNode, context: CFunctionContext): string {
  const direct = expression.libraryCppType

  if (direct !== null && typeof direct !== 'undefined') {
    return direct
  }

  const nested = expression.shape?.libraryCppType

  if (nested !== null && typeof nested !== 'undefined') {
    return nested
  }

  return compilerLibraryIntrinsicNativeCppType(context.libraries, 'array-literal') ?? 'inox::Value'
}

function arrayLiteralElementFunctionType(
  arrayExpression: AnyNode,
  element: AnyNode,
  context: CFunctionContext
): CFunctionType | null {
  if (element.functionType !== null && typeof element.functionType !== 'undefined') {
    return element.functionType
  }

  return cIterableElementFunctionType(arrayExpression.typeRef, context.libraries, cNodeSourceLocation(arrayExpression))
}

function cNodeSourceLocation(node: AnyNode): SourceLocation {
  let loc: SourceLocation = { line: 1, column: 1 }
  const nodeLoc = node.loc

  if (nodeLoc !== null && typeof nodeLoc !== 'undefined') {
    loc = nodeLoc
  }

  return loc
}

function emitCObjectLiteralValueExpression(
  expression: AnyNode,
  context: CFunctionContext,
  shape: CObjectShape | null = null
): PreparedExpression {
  const temp = nextCName(context, 'inox_object')
  const shapeName = nextCName(context, 'inox_shape_value')
  const fieldsName = `${shapeName}_fields`
  let resolvedShape = shape ?? objectLiteralExpressionRuntimeShape(expression)

  if (
    objectLiteralHasSpreadProperty(expression) &&
    expression.shape !== null &&
    typeof expression.shape !== 'undefined'
  ) {
    resolvedShape = expression.shape
  }

  const fields = objectLiteralValueShapeFields(expression, context, resolvedShape)
  const functionCompanions: CPreparedFunctionCompanion[] = []
  const lines = [`static const inox_field_info ${fieldsName}[] = {`]

  for (const field of fields) {
    lines.push(`  { ${cStringLiteral(field.name)}, ${emitCFieldFlags(field)} },`)
  }

  lines.push('};')
  lines.push(`static const inox_shape ${shapeName} = {`)
  lines.push(`  ${fields.length},`)
  lines.push(`  ${fieldsName}`)
  lines.push('};')
  lines.push(`auto ${temp} = inox::ObjectValue::create(&${shapeName});`)
  lines.push(emitRuntimeTypeCheck('inox::thrown()', context))
  const spreads = prepareObjectLiteralSpreads(expression, context, lines)

  for (let index = 0; index < fields.length; index++) {
    const field = fields[index]
    const propertyValue = findObjectLiteralPropertyValue(expression, field.name)

    if (field.valueType === 'function') {
      if (propertyValue === null || typeof propertyValue === 'undefined') {
        const spread = preparedObjectSpreadForField(spreads, expression.properties, field.name)

        if (spread !== null && typeof spread !== 'undefined') {
          const spreadValue = nextCName(context, 'inox_spread_value')
          lines.push(`auto ${spreadValue} = inox::get(${spread.name}, ${cStringLiteral(field.name)});`)
          lines.push(emitRuntimeTypeCheck('inox::thrown()', context))
          lines.push(`${temp}.init(${index}, ${spreadValue});`)
          lines.push(emitRuntimeTypeCheck('inox::thrown()', context))
        }

        continue
      }

      const value = emitRuntimeCallbackValue(propertyValue, field.functionType, context)
      pushAll(lines, value.lines)
      lines.push(`${temp}.init(${index}, ${value.expression});`)
      lines.push(emitRuntimeTypeCheck('inox::thrown()', context))
      continue
    }

    if (propertyValue === null || typeof propertyValue === 'undefined') {
      const spread = preparedObjectSpreadForField(spreads, expression.properties, field.name)

      if (spread !== null && typeof spread !== 'undefined') {
        const spreadValue = nextCName(context, 'inox_spread_value')

        lines.push(`auto ${spreadValue} = inox::get(${spread.name}, ${cStringLiteral(field.name)});`)
        lines.push(emitRuntimeTypeCheck('inox::thrown()', context))
        lines.push(`${temp}.init(${index}, ${spreadValue});`)
        lines.push(emitRuntimeTypeCheck('inox::thrown()', context))
        continue
      }

      if (field.optional !== true) {
        pushDiagnostic(context, diagnostic('INOX_MISSING_FIELD', `missing field ${field.name}`, expression.loc))
      }
      continue
    }

    const value = emitObjectFieldInitializerValue(field, nodeOrEmpty(propertyValue), context)

    pushAll(lines, value.lines)
    pushPreparedFunctionCompanions(functionCompanions, value.functionCompanions, field.name)
    lines.push(`${temp}.init(${index}, ${value.expression});`)
    lines.push(emitRuntimeTypeCheck('inox::thrown()', context))
  }

  return {
    lines,
    expression: temp,
    cppType: 'inox::ObjectValue',
    functionCompanions,
    valueType: 'object'
  }
}

function prepareObjectLiteralSpreads(
  expression: AnyNode,
  context: CFunctionContext,
  lines: string[]
): CPreparedObjectSpread[] {
  const spreads: CPreparedObjectSpread[] = []
  const properties: CObjectLiteralPropertyNode[] = expression.properties

  for (const property of properties) {
    if (property.spread !== true) {
      continue
    }

    const prepared = emitCValueExpression(property.value, context)
    const name = nextCName(context, 'inox_object_spread')

    pushAll(lines, prepared.lines)
    lines.push(`auto ${name} = ${prepared.expression};`)
    lines.push(emitRuntimeTypeCheck('inox::thrown()', context))
    spreads.push({ functionCompanions: prepared.functionCompanions ?? [], name, property })
  }

  return spreads
}

function preparedFunctionCompanionAt(
  companions: CPreparedFunctionCompanion[] | null | undefined,
  path: string[]
): CPreparedFunctionCompanion | null {
  if (companions === null || typeof companions === 'undefined') {
    return null
  }

  for (const companion of companions) {
    if (functionCompanionPathsEqual(companion.path, path)) {
      return companion
    }
  }

  return null
}

function functionCompanionPathsEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false
  }

  for (let index = 0; index < left.length; index = index + 1) {
    if (left[index] !== right[index]) {
      return false
    }
  }

  return true
}

function pushPreparedFunctionCompanions(
  target: CPreparedFunctionCompanion[],
  companions: CPreparedFunctionCompanion[] | null | undefined,
  prefix: string
): void {
  if (companions === null || typeof companions === 'undefined') {
    return
  }

  for (const companion of companions) {
    const path = [prefix]

    for (const segment of companion.path) {
      path.push(segment)
    }

    target.push({
      path,
      expression: companion.expression,
      functionType: companion.functionType,
      seenTypes: companion.seenTypes
    })
  }
}

function preparedObjectSpreadForField(
  spreads: CPreparedObjectSpread[],
  properties: CObjectLiteralPropertyNode[],
  fieldName: string
): CPreparedObjectSpread | null {
  for (let index = properties.length - 1; index >= 0; index = index - 1) {
    const property = properties[index]

    if (property === null || typeof property === 'undefined') {
      continue
    }

    if (property.spread !== true) {
      if (property.key === fieldName) {
        return null
      }

      continue
    }

    if (!objectSpreadPropertyHasField(property, fieldName)) {
      continue
    }

    for (let spreadIndex = spreads.length - 1; spreadIndex >= 0; spreadIndex = spreadIndex - 1) {
      const spread = spreads[spreadIndex]

      if (spread !== null && typeof spread !== 'undefined' && spread.property === property) {
        return spread
      }
    }
  }

  return null
}

function objectSpreadPropertyHasField(property: CObjectLiteralPropertyNode, fieldName: string): boolean {
  const shape = property.value.shape

  if (shape === null || typeof shape === 'undefined') {
    return false
  }

  if (isCompilerAnyNodeObjectShape(shape) && compilerAnyNodeFallbackShapeHasField(fieldName)) {
    return true
  }

  for (const field of shape.fields) {
    if (field.name === fieldName) {
      return true
    }
  }

  return false
}

function objectLiteralExpressionRuntimeShape(expression: AnyNode): CObjectShape | null {
  const shape = expression.shape

  if (shape === null || typeof shape === 'undefined') {
    return null
  }

  if (
    objectLiteralHasSpreadProperty(expression) ||
    shape.dynamic === true ||
    isCompilerAnyNodeObjectShape(shape) ||
    isEmptyObjectShape(shape) ||
    isCompilerObjectShapeInfoShape(shape) ||
    isCompilerAnyNodeLikeObjectLiteral(expression)
  ) {
    return shape
  }

  return null
}

function objectLiteralHasSpreadProperty(expression: AnyNode): boolean {
  const properties: CObjectLiteralPropertyNode[] = expression.properties

  for (const property of properties) {
    if (property.spread === true) {
      return true
    }
  }

  return false
}

function objectLiteralValueShapeFields(
  expression: AnyNode,
  context: CFunctionContext,
  shape: CObjectShape | null | undefined
): CObjectShapeField[] {
  const fields: CObjectShapeField[] = []
  const shouldAppendAnyNodeFallback =
    isCompilerAnyNodeObjectShape(shape) ||
    (isEmptyObjectShape(shape) && expression.properties.length > 0) ||
    isCompilerAnyNodeLikeObjectLiteral(expression)
  const shouldAppendObjectShapeInfoFallback = isCompilerObjectShapeInfoShape(shape)

  if (
    shape !== null &&
    typeof shape !== 'undefined' &&
    shape.builtin !== 'compiler.AnyNode' &&
    shape.fields !== null &&
    typeof shape.fields !== 'undefined' &&
    shape.fields.length > 0
  ) {
    for (const field of shape.fields) {
      const propertyValue = findObjectLiteralPropertyValue(expression, field.name)

      if (propertyValue !== null && typeof propertyValue !== 'undefined') {
        fields.push(objectLiteralShapeFieldWithValueMetadata(field, propertyValue, context))
      } else {
        fields.push(field)
      }
    }

    if (shape.dynamic !== true) {
      if (shouldAppendAnyNodeFallback) {
        appendCompilerAnyNodeFallbackShapeFields(fields)
      }

      if (shouldAppendObjectShapeInfoFallback) {
        appendCompilerObjectShapeInfoFallbackShapeFields(fields)
      }

      return fields
    }
  }

  for (const property of expression.properties) {
    if (property.spread === true) {
      continue
    }

    if (objectLiteralShapeFieldIndex(fields, property.key) !== -1) {
      continue
    }

    fields.push(objectLiteralPropertyShapeField(property, context, shape))
  }

  if (shouldAppendAnyNodeFallback) {
    appendCompilerAnyNodeFallbackShapeFields(fields)
  }

  if (shouldAppendObjectShapeInfoFallback) {
    appendCompilerObjectShapeInfoFallbackShapeFields(fields)
  }

  return fields
}

function objectLiteralShapeFieldWithValueMetadata(
  field: CObjectShapeField,
  value: AnyNode,
  context: CFunctionContext
): CObjectShapeField {
  const declaredType = cIterableElementDeclaredName(value.typeRef, context.libraries) ?? value.declaredType
  const next: CObjectShapeField = {
    name: field.name,
    optional: field.optional,
    ownership: field.ownership,
    readonly: field.readonly,
    readonlyField: field.readonlyField,
    declaredType: field.declaredType,
    typeRef: field.typeRef,
    nullable: field.nullable,
    valueType: field.valueType,
    shapeOwnership: field.shapeOwnership,
    shape: field.shape,
    functionTypeOwnership: field.functionTypeOwnership,
    functionType: field.functionType,
    loc: field.loc
  }

  if (
    next.valueType === 'unknown' ||
    !isSupportedObjectFieldStorageType(next.valueType) ||
    libraryNativeCppType(value.shape) !== null
  ) {
    next.valueType = inferObjectFieldValueType(value, context)
  }

  if (
    (next.typeRef === null || typeof next.typeRef === 'undefined') &&
    value.typeRef !== null &&
    typeof value.typeRef !== 'undefined'
  ) {
    next.typeRef = value.typeRef
  }

  if (
    typeof declaredType === 'string' &&
    declaredType !== 'unknown' &&
    (next.declaredType === null || typeof next.declaredType === 'undefined' || next.declaredType === 'unknown')
  ) {
    next.declaredType = declaredType
  }

  if (next.shape === null || typeof next.shape === 'undefined') {
    next.shape = value.shape
  }

  if (next.functionType === null || typeof next.functionType === 'undefined') {
    next.functionType = resolveFunctionValueType(value, context)
  }

  return next
}

function isCompilerAnyNodeLikeObjectLiteral(expression: AnyNode | null | undefined): boolean {
  if (expression === null || typeof expression === 'undefined' || expression.type !== 'ObjectLiteral') {
    return false
  }

  const typeValue = findObjectLiteralPropertyValue(expression, 'type')

  if (typeValue !== null && typeof typeValue !== 'undefined' && typeValue.type === 'StringLiteral') {
    return true
  }

  const nameValue = findObjectLiteralPropertyValue(expression, 'name')
  const valueTypeValue = findObjectLiteralPropertyValue(expression, 'valueType')

  return (
    nameValue !== null &&
    typeof nameValue !== 'undefined' &&
    valueTypeValue !== null &&
    typeof valueTypeValue !== 'undefined'
  )
}

function isCompilerAnyNodeObjectShape(shape: CObjectShape | null | undefined): boolean {
  return shape !== null && typeof shape !== 'undefined' && shape.builtin === 'compiler.AnyNode'
}

function isEmptyObjectShape(shape: CObjectShape | null | undefined): boolean {
  return (
    shape !== null &&
    typeof shape !== 'undefined' &&
    shape.fields !== null &&
    typeof shape.fields !== 'undefined' &&
    shape.fields.length === 0
  )
}

function objectLiteralPropertyShapeField(
  property: CObjectLiteralPropertyNode,
  context: CFunctionContext,
  shape: CObjectShape | null | undefined
): CObjectShapeField {
  let valueType = inferObjectFieldValueType(property.value, context)
  let propertyShape = property.value.shape
  let functionType = resolveFunctionValueType(property.value, context)

  if (shape !== null && typeof shape !== 'undefined') {
    const dynamicField = shape.dynamicField

    if (dynamicField !== null && typeof dynamicField !== 'undefined') {
      if (dynamicField.valueType !== null && typeof dynamicField.valueType !== 'undefined') {
        valueType = dynamicField.valueType
      }

      if (dynamicField.shape !== null && typeof dynamicField.shape !== 'undefined') {
        propertyShape = dynamicField.shape
      }

      if (dynamicField.functionType !== null && typeof dynamicField.functionType !== 'undefined') {
        functionType = dynamicField.functionType
      }
    }
  }

  return {
    name: property.key,
    readonlyField: false,
    declaredType:
      cIterableElementDeclaredName(property.value.typeRef, context.libraries) ?? property.value.declaredType,
    typeRef: property.value.typeRef ?? null,
    valueType,
    shape: propertyShape,
    functionType
  }
}

function inferObjectFieldValueType(expression: AnyNode, context: CFunctionContext): string {
  if (expression.type === 'NumberLiteral') {
    return 'number'
  }

  if (expression.type === 'BooleanLiteral') {
    return 'boolean'
  }

  if (expression.type === 'StringLiteral' || expression.type === 'TemplateLiteral') {
    return 'string'
  }

  if (expression.type === 'NullLiteral') {
    return 'null'
  }

  const known = knownValueType(expression.valueType)

  if (known !== null && typeof known !== 'undefined') {
    return known
  }

  return inferExpressionType(expression, context)
}

function objectLiteralShapeFieldIndex(fields: CObjectShapeField[], key: string): number {
  for (let index = 0; index < fields.length; index = index + 1) {
    if (fields[index].name === key) {
      return index
    }
  }

  return -1
}

function emitCNullishCoalescingValueExpression(expression: AnyNode, context: CFunctionContext): PreparedExpression {
  if (!canLowerCNullishCoalescingExpression(expression, context)) {
    pushDiagnostic(
      context,
      diagnostic(
        'INOX_C_NULLISH',
        'nullish coalescing is not supported by the current C++ backend slice',
        expression.loc
      )
    )

    return {
      lines: [],
      expression: 'inox_undefined_value()'
    }
  }

  const resultType = inferExpressionType(expression, context)
  let left = emitCValueExpression(expression.left, context)
  let right = emitCValueExpression(expression.right, context)

  if (isNullableScalarType(resultType) && isNullableScalarRuntimeExpression(expression.left, context)) {
    left = emitNullableScalarValueExpression(expression.left, context)
  }

  if (isNullableScalarType(resultType) && isNullableScalarRuntimeExpression(expression.right, context)) {
    right = emitNullableScalarValueExpression(expression.right, context)
  }

  const expectedTag =
    resultType === 'object' && libraryNativeCppType(expression.shape) !== null ? null : cRuntimeValueTag(resultType)
  const inPlaceValue = emitInPlaceCppRaiiNullishCoalescingValueExpression(
    expression,
    left,
    right,
    resultType,
    expectedTag,
    context
  )

  if (inPlaceValue !== null) {
    return inPlaceValue
  }

  const temp = nextCName(context, 'inox_value')
  const lines: string[] = []
  registerOwnedValue(context, temp)

  pushAll(lines, left.lines)
  lines.push(`if (${left.expression}.tag == INOX_TAG_NULL || ${left.expression}.tag == INOX_TAG_UNDEFINED) {`)
  pushIndented(lines, right.lines, '  ')
  lines.push(`  ${temp} = ${right.expression};`)
  pushIndented(lines, emitRuntimeNullableValueCheck(temp, expectedTag, context), '  ')
  lines.push('} else {')
  lines.push(`  ${temp} = ${left.expression};`)
  pushIndented(lines, emitRuntimeNullableValueCheck(temp, expectedTag, context), '  ')
  lines.push('}')

  return {
    lines,
    expression: temp,
    nullable: expression.nullable === true,
    valueType: resultType
  }
}

function emitInPlaceCppRaiiNullishCoalescingValueExpression(
  expression: AnyNode,
  left: PreparedExpression,
  right: PreparedExpression,
  resultType: string,
  expectedTag: string | null,
  context: CFunctionContext
): PreparedExpression | null {
  if (
    left.cppType !== 'inox::Value' ||
    left.cppMutableTemporary !== true ||
    (right.cppType !== 'inox::Value' && right.cppType !== 'inox_value' && right.cppType !== 'inox::String')
  ) {
    return null
  }

  const lines: string[] = []

  pushAll(lines, left.lines)

  if (resultType === 'string' && right.cppType === 'inox::String' && right.lines.length === 0) {
    const result = nextCName(context, 'inox_string')

    lines.push(
      `auto ${result} = ${left.expression}.isNullish() ? ${right.expression} : ` +
        `inox::String(std::move(${left.expression}));`
    )
    pushAll(lines, emitThrownCheckLines(context))

    return {
      lines,
      expression: result,
      cppType: 'inox::String',
      nullable: false,
      runtimeTypeChecked: true,
      valueType: 'string'
    }
  }

  lines.push(`if (${left.expression}.tag == INOX_TAG_NULL || ${left.expression}.tag == INOX_TAG_UNDEFINED) {`)
  pushIndented(lines, right.lines, '  ')
  lines.push(`  ${left.expression} = ${right.expression};`)
  pushIndented(lines, emitThrownCheckLines(context), '  ')
  lines.push('}')

  if (expression.nullable === true) {
    pushAll(lines, emitRuntimeNullableValueCheck(left.expression, expectedTag, context))
  } else {
    const valueCheck = emitRuntimeValueCheck(left.expression, expectedTag, context)

    if (valueCheck !== '') {
      lines.push(valueCheck)
    }
  }

  return {
    lines,
    expression: left.expression,
    cppType: 'inox::Value',
    nullable: expression.nullable === true,
    runtimeTypeChecked: expectedTag !== null,
    valueType: resultType
  }
}

type FormattedOutputValue = {
  lines: string[]
  format: string
  values: string[]
}

const formattedOutputNumberFormat = '%.17g'
const formattedOutputBooleanFormat = '%d'
const formattedOutputStringFormat = '%s'

function emitFormattedOutputStringView(bytes: string, length: string): string {
  return `inox::StringView(${bytes}, ${length})`
}

function emitFormattedOutputRuntimeStringView(name: string): string {
  return emitFormattedOutputStringView(`${name}->bytes`, `${name}->len`)
}

function emitFormattedOutputPreparedStringValue(value: PreparedExpression): string {
  if (value.cppType === 'inox::String') {
    return value.expression
  }

  if (value.cppType === 'inox::Value') {
    return `inox::String(${value.expression})`
  }

  return `inox::String(inox::Value(${value.expression}))`
}

function emitVariadicFormattedLibraryCallStatement(
  target: string,
  args: AnyNode[],
  context: CFunctionContext,
  classFormatExpression: string | null
): string[] {
  if (args.length === 0) {
    return [`${target}();`]
  }

  const directSingleRuntimeValue = emitDirectSingleRuntimeValueFormattedLibraryCallStatement(args, target, context)

  if (directSingleRuntimeValue !== null && typeof directSingleRuntimeValue !== 'undefined') {
    return directSingleRuntimeValue
  }

  const directRuntimeValue = emitDirectRuntimeValueFormattedLibraryCallStatement(args, target, context)

  if (directRuntimeValue !== null && typeof directRuntimeValue !== 'undefined') {
    return directRuntimeValue
  }

  const lines: string[] = []
  const parts: string[] = []
  const values: string[] = []
  let pendingExceptionDeferred = false

  for (const arg of args) {
    const deferredThrownCheckCount = context.deferredThrownCheckCount
    context.deferredThrownCheckDepth = context.deferredThrownCheckDepth + 1
    const value = emitFormattedOutputValue(arg, context, classFormatExpression)
    context.deferredThrownCheckDepth = context.deferredThrownCheckDepth - 1

    pushAll(lines, value.lines)
    parts.push(value.format)
    pushAll(values, value.values)
    pendingExceptionDeferred = pendingExceptionDeferred || context.deferredThrownCheckCount > deferredThrownCheckCount
  }

  const format = joinStrings(parts, ' ')

  pushAll(lines, emitFormattedLibraryCallStatement(target, format, values))

  if (pendingExceptionDeferred) {
    lines.push(emitRuntimeTypeCheck('inox::thrown()', context))
  }

  return lines
}

function emitDirectSingleRuntimeValueFormattedLibraryCallStatement(
  args: AnyNode[],
  target: string,
  context: CFunctionContext
): string[] | null {
  if (args.length !== 1 || !isRuntimeValueLogExpression(args[0], context)) {
    return null
  }

  const value = emitCValueExpression(args[0], context)
  const lines: string[] = []

  pushAll(lines, value.lines)
  lines.push(`${target}(${value.expression});`)

  return lines
}

function emitDirectRuntimeValueFormattedLibraryCallStatement(
  args: AnyNode[],
  target: string,
  context: CFunctionContext
): string[] | null {
  if (!hasDirectRuntimeFormattedArgument(args, context)) {
    return null
  }

  const lines: string[] = []

  if (args.length === 1) {
    const objectExpression = emitDirectFormattedObjectExpression()

    if (objectExpression !== null && typeof objectExpression !== 'undefined') {
      return [`${target}(${objectExpression});`]
    }

    const value = emitCValueExpression(args[0], context)

    pushAll(lines, value.lines)
    lines.push(`${target}(${value.expression});`)

    return lines
  }

  if (args.length === 2 && args[0].type === 'StringLiteral' && isDirectRuntimeFormattedArgument(args[1], context)) {
    const objectExpression = emitDirectFormattedObjectExpression()

    if (objectExpression !== null && typeof objectExpression !== 'undefined') {
      return [`${target}(${cStringLiteral(args[0].value)}, ${objectExpression});`]
    }

    const value = emitCValueExpression(args[1], context)

    pushAll(lines, value.lines)
    lines.push(`${target}(${cStringLiteral(args[0].value)}, ${value.expression});`)

    return lines
  }

  return null
}

function emitDirectFormattedObjectExpression(): string | null {
  return null
}

function hasDirectRuntimeFormattedArgument(args: AnyNode[], context: CFunctionContext): boolean {
  for (const arg of args) {
    if (isDirectRuntimeFormattedArgument(arg, context)) {
      return true
    }
  }

  return false
}

function isDirectRuntimeFormattedArgument(expression: AnyNode, context: CFunctionContext): boolean {
  const valueType = inferExpressionType(expression, context)

  return isDirectRuntimeFormattedValueExpression(expression, valueType, context)
}

function isDirectRuntimeFormattedValueExpression(
  expression: AnyNode,
  valueType: string,
  context: CFunctionContext
): boolean {
  if (valueType === 'boolean' || valueType === 'number' || valueType === 'string') {
    return false
  }

  if (
    valueType === 'unknown' &&
    ((expression.type === 'BinaryExpression' && expression.operator === '??') ||
      (expression.type === 'Reference' &&
        expression.path.length === 1 &&
        expression.path[0] === 'undefined' &&
        !context.variables.has('undefined') &&
        !context.moduleValueNames.has('undefined')))
  ) {
    return true
  }

  const nativeClassInstance = emitPreparedNativeClassInstanceExpression(expression, context)

  if (nativeClassInstance !== null && typeof nativeClassInstance !== 'undefined') {
    return false
  }

  if (isRuntimeValueLogExpression(expression, context)) {
    return true
  }

  return isRuntimeLogValueType(valueType)
}

function emitFormattedLibraryCallStatement(target: string, format: string, values: string[]): string[] {
  const argumentsList = [cStringLiteral(values.length === 0 ? unescapeCPrintfFormatText(format) : format), ...values]
  const singleLine = `${target}(${joinStrings(argumentsList, ', ')});`

  if (singleLine.length <= 100) {
    return [singleLine]
  }

  const lines = [`${target}(`]

  for (let index = 0; index < argumentsList.length; index = index + 1) {
    const suffix = index + 1 < argumentsList.length ? ',' : ''
    lines.push(`  ${argumentsList[index]}${suffix}`)
  }

  lines.push(');')
  return lines
}

function unescapeCPrintfFormatText(value: string): string {
  let result = ''

  for (let index = 0; index < value.length; index = index + 1) {
    const unit = value.slice(index, index + 1)

    if (unit === '%' && index + 1 < value.length && value.slice(index + 1, index + 2) === '%') {
      result = result + '%'
      index = index + 1
    } else {
      result = result + unit
    }
  }

  return result
}

function emitFormattedOutputValue(
  expression: AnyNode,
  context: CFunctionContext,
  classFormatExpression: string | null
): FormattedOutputValue {
  const valueType = inferExpressionType(expression, context)
  const directString = emitDirectStringLogValue(expression, context)

  if (directString !== null && typeof directString !== 'undefined') {
    return directString
  }

  const directObject = emitDirectFormattedObjectValue()

  if (directObject !== null && typeof directObject !== 'undefined') {
    return directObject
  }

  if (
    isNullableScalarRuntimeExpression(expression, context) &&
    !isNarrowedNullableScalarExpression(expression, context)
  ) {
    return emitRuntimeValueLogValue(expression, context)
  }

  if (valueType === 'string') {
    return emitStringLogValue(expression, context)
  }

  if (isRuntimeValueLogExpression(expression, context)) {
    return emitRuntimeValueLogValue(expression, context)
  }

  const nativeClassInstance = emitNativeClassInstanceLogValue(expression, context, classFormatExpression)

  if (nativeClassInstance !== null && typeof nativeClassInstance !== 'undefined') {
    return nativeClassInstance
  }

  if (valueType === 'boolean') {
    return emitBooleanLogValue(expression, context)
  }

  if (valueType === 'number') {
    return emitNumberLogValue(expression, context)
  }

  if (valueType === 'object' && isExceptionValueExpression(expression, context)) {
    return emitRuntimeExceptionValue(expression, context)
  }

  const knownRuntimeString = emitKnownRuntimeStringLogValue(expression, context)

  if (knownRuntimeString !== null && typeof knownRuntimeString !== 'undefined') {
    return knownRuntimeString
  }

  const runtimeObjectMember = emitRuntimeObjectMemberLogValue(expression, context)

  if (runtimeObjectMember !== null && typeof runtimeObjectMember !== 'undefined') {
    return runtimeObjectMember
  }

  const runtimeStringCall = emitRuntimeStringCallLogValue(expression, context)

  if (runtimeStringCall !== null && typeof runtimeStringCall !== 'undefined') {
    return runtimeStringCall
  }

  if (isRuntimeLogValueType(valueType)) {
    return emitRuntimeValueLogValue(expression, context)
  }

  pushDiagnostic(
    context,
    diagnostic(
      cUnsupportedExpressionCode(valueType),
      'this formatted library call argument is not supported by the current C++ backend slice',
      expression.loc
    )
  )

  return {
    lines: [],
    format: formattedOutputNumberFormat,
    values: ['0']
  }
}

function emitDirectFormattedObjectValue(): FormattedOutputValue | null {
  const objectExpression = emitDirectFormattedObjectExpression()

  if (objectExpression === null || typeof objectExpression === 'undefined') {
    return null
  }

  return {
    lines: [],
    format: '%s',
    values: [objectExpression]
  }
}

function emitDirectStringLogValue(expression: AnyNode, context: CFunctionContext): FormattedOutputValue | null {
  if (expression.type === 'StringLiteral') {
    return {
      lines: [],
      format: escapeCPrintfFormatText(expression.value),
      values: []
    }
  }

  if (expression.type !== 'TemplateLiteral') {
    return null
  }

  const formatted = emitCTemplateLiteralFormatExpression(expression, context)

  if (formatted.format.indexOf('%.*s') >= 0) {
    return emitPreparedStringLogValue(emitCTemplateLiteralValueExpression(expression, context))
  }

  return {
    lines: formatted.lines,
    format: formatted.format,
    values: formatted.values
  }
}

function isRuntimeLogValueType(valueType: string): boolean {
  return valueType === 'bytes' || valueType === 'function' || valueType === 'object'
}

function isOwnedRuntimeValueName(name: string, context: CFunctionContext): boolean {
  if (context.ownedValues.includes(name)) {
    return true
  }

  const moduleValueName = context.moduleValueNames.get(name)

  if (moduleValueName !== null && typeof moduleValueName !== 'undefined') {
    return context.ownedValues.includes(moduleValueName)
  }

  return false
}

function isRuntimeValueLogReference(expression: AnyNode, context: CFunctionContext): boolean {
  if (
    expression === null ||
    typeof expression === 'undefined' ||
    expression.type !== 'Reference' ||
    expression.path.length !== 1
  ) {
    return false
  }

  const name = expression.path[0]
  const valueType = context.variables.get(name)

  if (
    valueType !== null &&
    typeof valueType !== 'undefined' &&
    isManagedRuntimeReturnType(valueType) &&
    context.variables.has(name)
  ) {
    return true
  }

  if (valueType !== 'unknown' && !isOpaqueRuntimeValueType(valueType)) {
    return false
  }

  if (context.localValueNames.has(name)) {
    return true
  }

  if (isOwnedRuntimeValueName(name, context)) {
    return true
  }

  return context.moduleValueNames.has(name) && context.moduleValueTypes.get(name) === 'unknown'
}

function isRuntimeValueLogExpression(expression: AnyNode, context: CFunctionContext): boolean {
  if (expression.libraryCppType === 'inox::Value' || expression.libraryCppType === 'inox_value') {
    const valueType = inferExpressionType(expression, context)

    return (
      valueType === 'unknown' ||
      isOpaqueRuntimeValueType(valueType) ||
      (expression.nullable === true && isNullableScalarType(valueType))
    )
  }

  if (isRuntimeValueLogReference(expression, context)) {
    return true
  }

  return false
}

function emitRuntimeValueLogValue(expression: AnyNode, context: CFunctionContext): FormattedOutputValue {
  const value = emitCValueExpression(expression, context)
  const lines: string[] = []

  pushAll(lines, value.lines)

  return {
    lines,
    format: '%s',
    values: [value.expression]
  }
}

function emitKnownRuntimeStringLogValue(expression: AnyNode, context: CFunctionContext): FormattedOutputValue | null {
  if (isMemberAccessExpression(expression)) {
    const member = resolveKnownObjectMember(expression, context)

    if (member !== null && typeof member !== 'undefined' && member.valueType === 'string') {
      return emitRuntimeStringLogValue({ kind: 'known-object', member }, context)
    }
  }

  if (isIndexAccessExpression(expression)) {
    const field = resolveKnownObjectIndex(expression, context)

    if (field !== null && typeof field !== 'undefined' && field.valueType === 'string') {
      return emitRuntimeStringLogValue({ kind: 'known-object-index', field }, context)
    }
  }

  return null
}

function emitRuntimeObjectMemberLogValue(expression: AnyNode, context: CFunctionContext): FormattedOutputValue | null {
  let value: PreparedExpression | null = null

  if (isMemberAccessExpression(expression)) {
    value = emitPreparedObjectExpressionMemberValueExpression(expression, context, objectExpressionFieldDependencies)
  } else if (isIndexAccessExpression(expression)) {
    value = emitPreparedObjectExpressionIndexValueExpression(expression, context, objectExpressionFieldDependencies)
  }

  if (value === null || typeof value === 'undefined') {
    return null
  }

  const lines: string[] = []

  pushAll(lines, value.lines)

  return {
    lines,
    format: '%s',
    values: [value.expression]
  }
}

function emitRuntimeStringCallLogValue(expression: AnyNode, context: CFunctionContext): FormattedOutputValue | null {
  if (
    expression.type !== 'CallExpression' ||
    expression.libraryOperationId === null ||
    typeof expression.libraryOperationId === 'undefined' ||
    expression.valueType !== 'string'
  ) {
    return null
  }

  const value = emitCValueExpression(expression, context)

  if (value.valueType !== 'string') {
    return null
  }

  return emitPreparedStringLogValue(value)
}

function emitPreparedStringLogValue(value: PreparedExpression): FormattedOutputValue {
  const lines: string[] = []

  pushAll(lines, value.lines)

  return {
    lines,
    format: formattedOutputStringFormat,
    values: [emitFormattedOutputPreparedStringValue(value)]
  }
}

function emitNativeClassInstanceLogValue(
  expression: AnyNode,
  context: CFunctionContext,
  classFormatExpression: string | null
): FormattedOutputValue | null {
  if (classFormatExpression === null) {
    return null
  }

  const instance = emitPreparedNativeClassInstanceExpression(expression, context)

  if (instance === null || typeof instance === 'undefined') {
    return null
  }

  const temp = nextCName(context, 'inox_log_string')
  const lines: string[] = []

  pushAll(lines, instance.lines)
  lines.push(
    `auto ${temp} = ${classFormatExpression}(${emitCClassInfoDescriptorName(instance.info)}, ${instance.expression});`
  )
  lines.push(emitRuntimeTypeCheck(`!${temp}.valid()`, context))

  return {
    lines,
    format: formattedOutputStringFormat,
    values: [temp]
  }
}

function emitPreparedCompilerLibraryNativeFieldValueExpression(
  expression: AnyNode,
  context: CFunctionContext
): PreparedExpression | null {
  if (!isCompilerLibraryNativeFieldExpression(expression, context)) {
    return null
  }

  const preparedObject =
    expression.object.type === 'Reference' ? null : emitCValueExpression(expression.object, context)

  return emitPreparedCompilerLibraryNativeFieldExpression(expression, context, preparedObject)
}

function emitStringLogValue(expression: AnyNode, context: CFunctionContext): FormattedOutputValue {
  const libraryValue = emitPreparedCompilerLibraryCallExpression(expression, context)

  if (libraryValue !== null && libraryValue.valueType === 'string') {
    return emitPreparedStringLogValue(libraryValue)
  }

  if (expression !== null && typeof expression !== 'undefined' && expression.type === 'Reference') {
    const name = joinStrings(expression.path, '_')
    const emittedName = emitCIdentifier(name)

    if (isBoxedRuntimeStringName(name, context)) {
      return {
        lines: [
          emitRuntimeTypeCheck(`(*${emittedName}).tag != INOX_TAG_STRING || (*${emittedName}).as.ref == 0`, context)
        ],
        format: formattedOutputStringFormat,
        values: [`inox::String(inox::Value(*${emittedName}))`]
      }
    }

    const moduleRuntimeString = emitModuleRuntimeStringLogValue(expression, context)

    if (moduleRuntimeString !== null && typeof moduleRuntimeString !== 'undefined') {
      return moduleRuntimeString
    }

    const reference = emitReference(expression, context)

    if (context.cppStringValues.has(name)) {
      return {
        lines: [],
        format: formattedOutputStringFormat,
        values: [reference]
      }
    }

    if (context.variables.get(name) === 'string' && context.nullableVariables.has(name)) {
      const lines: string[] = []

      if (!isNarrowedNullableScalarExpression(expression, context)) {
        lines.push(emitRuntimeTypeCheck(`${reference}.tag != INOX_TAG_STRING || ${reference}.as.ref == 0`, context))
      }

      return {
        lines,
        format: formattedOutputStringFormat,
        values: [`inox::String(inox::Value(${reference}))`]
      }
    }

    if (context.runtimeStrings.has(name)) {
      return {
        lines: [],
        format: formattedOutputStringFormat,
        values: [emitFormattedOutputRuntimeStringView(reference)]
      }
    }
  }

  if (isMemberAccessExpression(expression)) {
    const libraryNativeField = emitPreparedCompilerLibraryNativeFieldValueExpression(expression, context)

    if (libraryNativeField !== null && libraryNativeField.valueType === 'string') {
      return {
        lines: libraryNativeField.lines,
        format: formattedOutputStringFormat,
        values: [libraryNativeField.expression]
      }
    }

    const nativeClassStringField = emitNativeClassStringFieldLogValue(expression, context)

    if (nativeClassStringField !== null && typeof nativeClassStringField !== 'undefined') {
      return nativeClassStringField
    }

    const nativeClassField = emitPreparedNativeClassFieldValueExpression(expression, context)

    if (
      nativeClassField !== null &&
      typeof nativeClassField !== 'undefined' &&
      inferExpressionType(expression, context) === 'string'
    ) {
      const lines: string[] = []

      pushAll(lines, nativeClassField.lines)
      lines.push(
        emitRuntimeTypeCheck(
          `${nativeClassField.expression}.tag != INOX_TAG_STRING || ${nativeClassField.expression}.as.ref == 0`,
          context
        )
      )

      return {
        lines,
        format: formattedOutputStringFormat,
        values: [emitFormattedOutputPreparedStringValue(nativeClassField)]
      }
    }

    const member = resolveKnownObjectMember(expression, context)

    if (member !== null && typeof member !== 'undefined' && member.valueType === 'string') {
      return emitRuntimeStringLogValue(
        { kind: 'known-object', member },
        context,
        isNarrowedNullableScalarExpression(expression, context)
      )
    }
  }

  if (isIndexAccessExpression(expression)) {
    const field = resolveKnownObjectIndex(expression, context)

    if (field !== null && typeof field !== 'undefined' && field.valueType === 'string') {
      return emitRuntimeStringLogValue(
        { kind: 'known-object-index', field },
        context,
        isNarrowedNullableScalarExpression(expression, context)
      )
    }
  }

  if (expression.type === 'CallExpression') {
    const classMethodCall = emitPreparedClassMethodCallExpression(expression, context, {})

    if (classMethodCall !== null && typeof classMethodCall !== 'undefined' && classMethodCall.expression !== '') {
      const lines: string[] = []

      pushAll(lines, classMethodCall.lines)

      return {
        lines,
        format: formattedOutputStringFormat,
        values: [emitFormattedOutputPreparedStringValue(classMethodCall)]
      }
    }
  }

  if (isRuntimeProducedStringExpression(expression, context)) {
    const value = emitCValueExpression(expression, context)

    return emitPreparedStringLogValue(value)
  }

  if (isStringConcatExpression(expression, context)) {
    const value = emitCValueExpression(expression, context)
    const lines: string[] = []

    pushAll(lines, value.lines)

    return {
      lines,
      format: formattedOutputStringFormat,
      values: [emitFormattedOutputPreparedStringValue(value)]
    }
  }

  if (isCoalesceExpression(expression) && canLowerCNullishCoalescingExpression(expression, context)) {
    const value = emitCValueExpression(expression, context)
    const lines: string[] = []

    pushAll(lines, value.lines)
    lines.push(
      emitRuntimeTypeCheck(`${value.expression}.tag != INOX_TAG_STRING || ${value.expression}.as.ref == 0`, context)
    )

    return {
      lines,
      format: formattedOutputStringFormat,
      values: [emitFormattedOutputPreparedStringValue(value)]
    }
  }

  return {
    lines: [],
    format: '%s',
    values: [emitStringExpression(expression, context)]
  }
}

function emitNativeClassStringFieldLogValue(
  expression: AnyNode,
  context: CFunctionContext
): FormattedOutputValue | null {
  const field = resolveNativeClassFieldMetadata(expression, context)

  if (field === null || typeof field === 'undefined' || field.valueType !== 'string' || field.nullable === true) {
    return null
  }

  const value = emitPreparedNativeClassFieldValueExpression(expression, context)

  if (value === null || typeof value === 'undefined') {
    return null
  }

  const lines: string[] = []

  pushAll(lines, value.lines)

  if (value.cppType === 'inox::String') {
    return {
      lines,
      format: formattedOutputStringFormat,
      values: [value.expression]
    }
  }

  return {
    lines,
    format: formattedOutputStringFormat,
    values: [emitFormattedOutputPreparedStringValue(value)]
  }
}

function emitModuleRuntimeStringLogValue(expression: AnyNode, context: CFunctionContext): FormattedOutputValue | null {
  if (
    expression === null ||
    typeof expression === 'undefined' ||
    expression.type !== 'Reference' ||
    expression.path.length !== 1
  ) {
    return null
  }

  const name = expression.path[0]

  const narrowedType = context.variables.get(name)

  if (
    context.localValueNames.has(name) ||
    context.moduleValueTypes.get(name) !== 'unknown' ||
    (expression.valueType !== 'string' && narrowedType !== 'string')
  ) {
    return null
  }

  const storage = context.moduleValueNames.get(name)

  if (storage === null || typeof storage === 'undefined') {
    return null
  }

  return {
    lines: [emitRuntimeTypeCheck(`${storage}.tag != INOX_TAG_STRING || ${storage}.as.ref == 0`, context)],
    format: formattedOutputStringFormat,
    values: [`inox::String(inox::Value(${storage}))`]
  }
}

function emitNumberLogValue(expression: AnyNode, context: CFunctionContext): FormattedOutputValue {
  const libraryValue = emitPreparedCompilerLibraryCallExpression(expression, context)

  if (libraryValue !== null && libraryValue.valueType === 'number') {
    return {
      lines: libraryValue.lines,
      format: formattedOutputNumberFormat,
      values: [emitFormattedOutputNumberValue(libraryValue)]
    }
  }

  const moduleRuntimeScalar = emitModuleRuntimeScalarLogValue(expression, context)

  if (moduleRuntimeScalar !== null && typeof moduleRuntimeScalar !== 'undefined') {
    return moduleRuntimeScalar
  }

  if (isMemberAccessExpression(expression)) {
    const libraryNativeField = emitPreparedCompilerLibraryNativeFieldValueExpression(expression, context)

    if (libraryNativeField !== null && libraryNativeField.valueType === 'number') {
      return {
        lines: libraryNativeField.lines,
        format: formattedOutputNumberFormat,
        values: [`static_cast<double>(${libraryNativeField.expression})`]
      }
    }

    const nativeClassField = emitPreparedNativeClassFieldScalarExpression(expression, context)

    if (nativeClassField !== null && typeof nativeClassField !== 'undefined') {
      return {
        lines: nativeClassField.lines,
        format: formattedOutputNumberFormat,
        values: [`static_cast<double>(${nativeClassField.expression})`]
      }
    }

    const member = resolveKnownObjectMember(expression, context)

    if (member !== null && typeof member !== 'undefined' && isNullableScalarType(member.valueType)) {
      return emitRuntimeNumberLogValue(member.valueType, { kind: 'known-object', member }, context)
    }
  }

  if (isIndexAccessExpression(expression)) {
    const field = resolveKnownObjectIndex(expression, context)

    if (field !== null && typeof field !== 'undefined' && isNullableScalarType(field.valueType)) {
      return emitRuntimeNumberLogValue(field.valueType, { kind: 'known-object-index', field }, context)
    }
  }

  const value = emitPreparedNumberExpression(expression, context)

  return {
    lines: value.lines,
    format: formattedOutputNumberFormat,
    values: [emitFormattedOutputNumberValue(value)]
  }
}

function emitFormattedOutputNumberValue(value: PreparedExpression): string {
  if (value.scalarType === 'double') {
    return value.expression
  }

  return `static_cast<double>(${value.expression})`
}

function emitBooleanLogValue(expression: AnyNode, context: CFunctionContext): FormattedOutputValue {
  if (expression.type === 'BooleanLiteral') {
    let value = 'false'

    if (expression.value) {
      value = 'true'
    }

    return {
      lines: [],
      format: formattedOutputBooleanFormat,
      values: [value]
    }
  }

  const libraryValue = emitPreparedCompilerLibraryCallExpression(expression, context)

  if (libraryValue !== null && libraryValue.valueType === 'boolean') {
    return {
      lines: libraryValue.lines,
      format: formattedOutputBooleanFormat,
      values: [libraryValue.expression]
    }
  }

  const moduleRuntimeBoolean = emitModuleRuntimeBooleanLogValue(expression, context)

  if (moduleRuntimeBoolean !== null && typeof moduleRuntimeBoolean !== 'undefined') {
    return moduleRuntimeBoolean
  }

  if (isMemberAccessExpression(expression)) {
    const libraryNativeField = emitPreparedCompilerLibraryNativeFieldValueExpression(expression, context)

    if (libraryNativeField !== null && libraryNativeField.valueType === 'boolean') {
      return {
        lines: libraryNativeField.lines,
        format: formattedOutputBooleanFormat,
        values: [libraryNativeField.expression]
      }
    }

    const nativeClassField = emitPreparedNativeClassFieldScalarExpression(expression, context)

    if (nativeClassField !== null && typeof nativeClassField !== 'undefined') {
      return {
        lines: nativeClassField.lines,
        format: formattedOutputBooleanFormat,
        values: [nativeClassField.expression]
      }
    }

    const member = resolveKnownObjectMember(expression, context)

    if (member !== null && typeof member !== 'undefined' && member.valueType === 'boolean') {
      return emitRuntimeBooleanLogValue({ kind: 'known-object', member }, context)
    }
  }

  if (isIndexAccessExpression(expression)) {
    const field = resolveKnownObjectIndex(expression, context)

    if (field !== null && typeof field !== 'undefined' && field.valueType === 'boolean') {
      return emitRuntimeBooleanLogValue({ kind: 'known-object-index', field }, context)
    }
  }

  const value = emitPreparedNumberExpression(expression, context)

  return {
    lines: value.lines,
    format: formattedOutputBooleanFormat,
    values: [value.expression]
  }
}

function emitModuleRuntimeScalarLogValue(expression: AnyNode, context: CFunctionContext): FormattedOutputValue | null {
  if (
    expression === null ||
    typeof expression === 'undefined' ||
    expression.type !== 'Reference' ||
    expression.path.length !== 1
  ) {
    return null
  }

  const name = expression.path[0]

  if (context.localValueNames.has(name) || context.moduleValueTypes.get(name) !== 'unknown') {
    return null
  }

  const valueType = context.variables.get(name)

  if (valueType !== 'number' && valueType !== 'boolean') {
    return null
  }

  const storage = context.moduleValueNames.get(name)

  if (storage === null || typeof storage === 'undefined') {
    return null
  }

  let tag = 'INOX_TAG_NUMBER'
  let formattedValue = `${storage}.as.number`

  if (valueType === 'boolean') {
    tag = 'INOX_TAG_BOOL'
    formattedValue = `static_cast<double>(${storage}.as.boolean ? 1 : 0)`
  }

  return {
    lines: [emitRuntimeValueCheck(storage, tag, context)],
    format: formattedOutputNumberFormat,
    values: [formattedValue]
  }
}

function emitModuleRuntimeBooleanLogValue(expression: AnyNode, context: CFunctionContext): FormattedOutputValue | null {
  if (
    expression === null ||
    typeof expression === 'undefined' ||
    expression.type !== 'Reference' ||
    expression.path.length !== 1
  ) {
    return null
  }

  const name = expression.path[0]

  if (context.localValueNames.has(name) || context.moduleValueTypes.get(name) !== 'unknown') {
    return null
  }

  if (context.variables.get(name) !== 'boolean') {
    return null
  }

  const storage = context.moduleValueNames.get(name)

  if (storage === null || typeof storage === 'undefined') {
    return null
  }

  return {
    lines: [emitRuntimeValueCheck(storage, 'INOX_TAG_BOOL', context)],
    format: formattedOutputBooleanFormat,
    values: [`${storage}.as.boolean`]
  }
}

function emitRuntimeStringLogValue(
  source: RuntimeLogGetSource,
  context: CFunctionContext,
  narrowed: boolean = false
): FormattedOutputValue {
  const value = nextCName(context, 'inox_log_value')
  const lines: string[] = []

  registerOwnedValue(context, value)

  pushAll(lines, emitRuntimeLogGetLines(source, value, context))

  if (!narrowed) {
    lines.push(emitRuntimeTypeCheck(`${value}.tag != INOX_TAG_STRING || ${value}.as.ref == 0`, context))
  }

  return {
    lines,
    format: formattedOutputStringFormat,
    values: [`inox::String(inox::Value(${value}))`]
  }
}

function emitRuntimeNumberLogValue(
  valueType: string,
  source: RuntimeLogGetSource,
  context: CFunctionContext
): FormattedOutputValue {
  const value = nextCName(context, 'inox_log_value')
  const lines: string[] = []
  let tag = 'INOX_TAG_NUMBER'
  let formattedValue = `${value}.as.number`

  registerOwnedValue(context, value)

  if (valueType === 'boolean') {
    tag = 'INOX_TAG_BOOL'
    formattedValue = `static_cast<double>(${value}.as.boolean ? 1 : 0)`
  }

  pushAll(lines, emitRuntimeLogGetLines(source, value, context))
  lines.push(emitRuntimeValueCheck(value, tag, context))

  return {
    lines,
    format: formattedOutputNumberFormat,
    values: [formattedValue]
  }
}

function emitRuntimeBooleanLogValue(source: RuntimeLogGetSource, context: CFunctionContext): FormattedOutputValue {
  const value = nextCName(context, 'inox_log_value')
  const lines: string[] = []

  registerOwnedValue(context, value)

  pushAll(lines, emitRuntimeLogGetLines(source, value, context))
  lines.push(emitRuntimeValueCheck(value, 'INOX_TAG_BOOL', context))

  return {
    lines,
    format: formattedOutputBooleanFormat,
    values: [`${value}.as.boolean`]
  }
}

function emitRuntimeLogGetLines(source: RuntimeLogGetSource, temp: string, context: CFunctionContext): string[] {
  if (source.kind === 'known-object-index') {
    const field = source.field

    if (field === null || typeof field === 'undefined') {
      return [emitStatusCheck('INOX_ERR_FIELD', context)]
    }

    const object = emitObjectValueReference(field.objectName, context)
    const key = cStringLiteral(field.key)

    const lines = [`${temp} = inox::get(${object}, ${key});`]
    pushAll(lines, emitThrownCheckLines(context))

    return lines
  }

  const member = source.member

  if (member === null || typeof member === 'undefined') {
    return [emitStatusCheck('INOX_ERR_FIELD', context)]
  }

  const object = emitObjectValueReference(member.objectName, context)
  const key = knownObjectMemberKey(member)

  const lines = [`${temp} = inox::get(${object}, ${cStringLiteral(key)});`]
  pushAll(lines, emitThrownCheckLines(context))

  return lines
}

function emitRuntimeExceptionValue(expression: AnyNode, context: CFunctionContext): FormattedOutputValue {
  const object = emitExceptionFormatObjectExpression(expression, context)
  const nameValue = nextCName(context, 'inox_log_value')
  const messageValue = nextCName(context, 'inox_log_value')
  const nameString = nextCName(context, 'inox_log_string')
  const messageString = nextCName(context, 'inox_log_string')
  const lines: string[] = []

  registerOwnedValue(context, nameValue)
  registerOwnedValue(context, messageValue)

  pushAll(lines, object.lines)
  lines.push(emitStatusCheck(`inox_object_get_known(${object.expression}, 0, ${nameValue}.out())`, context))
  lines.push(emitStatusCheck(`inox_object_get_known(${object.expression}, 1, ${messageValue}.out())`, context))
  lines.push(emitRuntimeTypeCheck(`${nameValue}.tag != INOX_TAG_STRING || ${nameValue}.as.ref == 0`, context))
  lines.push(emitRuntimeTypeCheck(`${messageValue}.tag != INOX_TAG_STRING || ${messageValue}.as.ref == 0`, context))
  lines.push(`inox_string* ${nameString} = (inox_string*)${nameValue}.as.ref;`)
  lines.push(`inox_string* ${messageString} = (inox_string*)${messageValue}.as.ref;`)

  return {
    lines,
    format: '%.*s: %.*s',
    values: [emitFormattedOutputRuntimeStringView(nameString), emitFormattedOutputRuntimeStringView(messageString)]
  }
}

function emitExceptionFormatObjectExpression(expression: AnyNode, context: CFunctionContext): PreparedExpression {
  if (
    expression !== null &&
    typeof expression !== 'undefined' &&
    expression.type === 'Reference' &&
    expression.path.length === 1
  ) {
    return {
      lines: [],
      expression: emitObjectValueReference(expression.path[0], context)
    }
  }

  return emitCValueExpression(expression, context)
}

function emitPreparedNumberExpression(expression: AnyNode, context: CFunctionContext): PreparedExpression {
  return emitPreparedNumberExpressionWithDependencies(expression, context, cScalarExpressionDependencies)
}

function emitCExpression(expression: AnyNode, context: CFunctionContext): string {
  return emitCExpressionWithDependencies(expression, context, cScalarExpressionDependencies)
}

function emitPreparedUpdateExpression(expression: AnyNode, context: CFunctionContext): PreparedExpression {
  return emitPreparedUpdateExpressionWithDependencies(expression, context, cScalarExpressionDependencies)
}

function emitReference(expression: AnyNode, context: CFunctionContext): string {
  if (expression !== null && typeof expression !== 'undefined' && expression.type === 'Reference') {
    const name = joinStrings(expression.path, '_')
    const localName = expression.path.length === 1 && context.localValueNames.has(name)

    if (context.variables.has(name)) {
      let moduleValueName = ''

      if (!localName) {
        const resolvedModuleValueName = context.moduleValueNames.get(name)

        if (resolvedModuleValueName !== null && typeof resolvedModuleValueName !== 'undefined') {
          moduleValueName = resolvedModuleValueName
        }
      }

      if (moduleValueName !== '') {
        return moduleValueName
      }

      if (context.boxedVariables.has(name)) {
        return `${emitCIdentifier(name)}->value`
      }

      return emitCIdentifier(name)
    }

    const functionName = context.functionNames.get(name)

    if (functionName !== null && typeof functionName !== 'undefined') {
      return functionName
    }

    return emitCIdentifier(name)
  }

  pushDiagnostic(
    context,
    diagnostic(
      'INOX_C_ASSIGNMENT_TARGET',
      'this assignment target is not supported by the current C++ backend slice',
      expression.loc
    )
  )
  return '_'
}

function emitCallExpression(expression: AnyNode, context: CFunctionContext): string {
  return emitCallExpressionWithDependencies(expression, context, cCallExpressionDependencies)
}

function emitPreparedCallExpression(expression: AnyNode, context: CFunctionContext): PreparedExpression {
  return emitPreparedCallExpressionWithDependencies(expression, context, cCallExpressionDependencies)
}

function emitPreparedCallArgs(
  expression: AnyNode,
  params: CFunctionParam[],
  context: CFunctionContext
): PreparedCallArgs {
  return emitPreparedCallArgsWithDependencies(expression, params, context, cCallExpressionDependencies)
}

function emitPreparedAsyncFunctionAsyncResultCallExpression(
  expression: AnyNode | null | undefined,
  context: CFunctionContext,
  options: PreparedCallOptions = {}
): PreparedExpression | null {
  if (
    expression === null ||
    typeof expression === 'undefined' ||
    expression.type !== 'CallExpression' ||
    !isAsyncFunctionCallee(expression.callee, context) ||
    expression.valueType !== 'async-result'
  ) {
    return null
  }

  let valueType = 'unknown'
  const awaitedValueType = resolveCAsyncFunctionAwaitValueType(expression.callee, context) ?? ''

  if (awaitedValueType !== '') {
    valueType = awaitedValueType
  } else {
    const asyncResultValueType = expression.asyncResultValueType ?? ''

    if (asyncResultValueType !== '') {
      valueType = asyncResultValueType
    }
  }

  const taskCall = emitPreparedAsyncTaskAsyncResultCallExpression(expression, valueType, context, options)

  if (taskCall !== null && typeof taskCall !== 'undefined') {
    return taskCall
  }

  if (isThrowingFunctionCallee(expression.callee, context)) {
    return emitPreparedThrowingAsyncFunctionAsyncResultCallExpression(expression, valueType, context, options)
  }

  if (!isSupportedAsyncFunctionAsyncResultValueType(valueType)) {
    pushDiagnostic(
      context,
      diagnostic(
        'INOX_C_ASYNC',
        'async function calls as AsyncResult values currently support only number, boolean, string, bytes, object, array and void values in C',
        expression.loc
      )
    )

    return {
      lines: [],
      expression: '0',
      valueType,
      rejectionValueType: 'unknown'
    }
  }

  registerEventLoop(context)

  let out = nextCName(context, 'inox_async_result')

  if (options.out !== null && typeof options.out !== 'undefined') {
    out = options.out
  }

  const call = emitPreparedCallExpression(expression, context)
  let managedValue: string | null = null
  let value = 'inox_undefined_value()'
  let valueCheck = ''
  const lines: string[] = []

  if (isManagedRuntimeReturnType(valueType)) {
    const runtimeManagedValue = nextCName(context, 'inox_async_value')

    managedValue = runtimeManagedValue
    value = runtimeManagedValue
  } else if (valueType === 'boolean') {
    value = `inox_bool_value((${call.expression}) != 0)`
  } else if (valueType === 'number') {
    value = `inox_number_value(${call.expression})`
  }

  if (managedValue !== null && typeof managedValue !== 'undefined') {
    valueCheck = emitRuntimeValueCheck(managedValue, cRuntimeValueTag(valueType), context)
  }

  if (managedValue !== null && typeof managedValue !== 'undefined') {
    registerOwnedValue(context, managedValue)
  }

  if (options.owned !== false) {
    registerOwnedAsyncResult(context, out, valueType, 'unknown')
  }

  const resolveExpression = compilerLibraryIntrinsicAsyncResultCExpression(context.libraries, 'fulfill')

  if (resolveExpression === null) {
    pushDiagnostic(
      context,
      diagnostic(
        'INOX_C_ASYNC',
        'the configured async-result provider does not define C++ resolve lowering',
        expression.loc
      )
    )

    return {
      lines: call.lines,
      expression: out,
      valueType,
      rejectionValueType: 'unknown'
    }
  }

  pushAll(lines, call.lines)

  if (managedValue !== null && typeof managedValue !== 'undefined') {
    lines.push(`${managedValue} = ${call.expression};`)

    if (valueCheck !== '') {
      lines.push(valueCheck)
    }

    lines.push(`${out} = ${resolveExpression}(${value});`)
    lines.push(emitAsyncResultRuntimeTypeCheck(out, context))
    pushAll(lines, emitPrepareOwnedValueWrite(managedValue))
  } else {
    lines.push(`${out} = ${resolveExpression}(${value});`)
    lines.push(emitAsyncResultRuntimeTypeCheck(out, context))
  }

  return {
    lines,
    expression: out,
    valueType,
    rejectionValueType: 'unknown'
  }
}

function emitPreparedAsyncTaskAsyncResultCallExpression(
  expression: AnyNode,
  valueType: string,
  context: CFunctionContext,
  options: PreparedCallOptions = {}
): PreparedExpression | null {
  if (
    expression.callee === null ||
    typeof expression.callee === 'undefined' ||
    expression.callee.type !== 'Reference' ||
    expression.callee.path.length !== 1
  ) {
    return null
  }

  const path: string[] = expression.callee.path
  const name = path[0]

  if (name === null || typeof name === 'undefined') {
    return null
  }

  const wrapper = context.asyncTaskWrappers.get(name)

  if (wrapper === null || typeof wrapper === 'undefined') {
    return null
  }

  registerEventLoop(context)

  let out = nextCName(context, 'inox_async_result')

  if (options.out !== null && typeof options.out !== 'undefined') {
    out = options.out
  }

  const prepared = emitPreparedCallArgs(expression, asyncTaskWrapperFunctionParams(wrapper), context)
  const args: string[] = [emitEventLoopReference(context)]
  const rejectionValueType = resolveCFunctionRejectionValueType(expression.callee, context)
  const lines: string[] = []

  pushAll(args, prepared.args)
  args.push(out)

  if (options.owned !== false) {
    registerOwnedAsyncResult(context, out, valueType, rejectionValueType)
  }

  pushAll(lines, prepared.lines)
  lines.push(emitStatusCheck(`${wrapper.startName}(${joinStrings(args, ', ')})`, context))

  return {
    lines,
    expression: out,
    valueType,
    rejectionValueType
  }
}

function emitPreparedThrowingAsyncFunctionAsyncResultCallExpression(
  expression: AnyNode,
  valueType: string,
  context: CFunctionContext,
  options: PreparedCallOptions = {}
): PreparedExpression | null {
  if (!isSupportedAsyncFunctionAsyncResultValueType(valueType)) {
    pushDiagnostic(
      context,
      diagnostic(
        'INOX_C_ASYNC',
        'throwing async function calls as AsyncResult values currently support only number, boolean, string, bytes, object, array and void values in C',
        expression.loc
      )
    )

    return {
      lines: [],
      expression: '0',
      valueType,
      rejectionValueType: resolveCFunctionRejectionValueType(expression.callee, context)
    }
  }

  const params = resolveFunctionParams(expression.callee, context)

  if (params === null || typeof params === 'undefined') {
    pushDiagnostic(
      context,
      diagnostic(
        'INOX_C_ASYNC',
        'this async function call is not supported as a AsyncResult value in the current C++ backend slice',
        expression.loc
      )
    )

    return {
      lines: [],
      expression: '0',
      valueType,
      rejectionValueType: 'unknown'
    }
  }

  const callParams = functionParamsOrEmpty(params)

  registerEventLoop(context)
  registerErrorValue(context)

  let out = nextCName(context, 'inox_async_result')

  if (options.out !== null && typeof options.out !== 'undefined') {
    out = options.out
  }

  const prepared = emitPreparedCallArgs(expression, callParams, context)
  let result: string | null = null
  if (valueType !== 'void') {
    result = nextCName(context, 'inox_async_result')
  }
  const managedResult = result !== null && typeof result !== 'undefined' && isManagedRuntimeReturnType(valueType)
  const rejectionValueType = resolveCFunctionRejectionValueType(expression.callee, context)
  let fulfilledValue = 'inox_undefined_value()'
  let valueCheck = ''

  if (result !== null && typeof result !== 'undefined') {
    if (valueType === 'boolean') {
      fulfilledValue = `inox_bool_value((${result}) != 0)`
    } else if (valueType === 'number') {
      fulfilledValue = `inox_number_value(${result})`
    } else {
      fulfilledValue = result
    }
  }

  if (managedResult && result !== null && typeof result !== 'undefined') {
    valueCheck = emitRuntimeValueCheck(result, cRuntimeValueTag(valueType), context)
  }

  if (options.owned !== false) {
    registerOwnedAsyncResult(context, out, valueType, rejectionValueType)
  }

  if (managedResult && result !== null && typeof result !== 'undefined') {
    registerOwnedValue(context, result)
  }

  const managedResultResetLines: string[] = []
  if (managedResult && result !== null && typeof result !== 'undefined') {
    const resetLines: string[] = emitPrepareOwnedValueWrite(result)

    for (const line of resetLines) {
      managedResultResetLines.push(`  ${line}`)
    }
  }

  const rejectExpression = compilerLibraryIntrinsicAsyncResultCExpression(context.libraries, 'reject')
  const resolveExpression = compilerLibraryIntrinsicAsyncResultCExpression(context.libraries, 'fulfill')

  if (rejectExpression === null || resolveExpression === null) {
    pushDiagnostic(
      context,
      diagnostic(
        'INOX_C_ASYNC',
        'the configured async-result provider does not define C++ settlement lowering',
        expression.loc
      )
    )

    return {
      lines: prepared.lines,
      expression: out,
      valueType,
      rejectionValueType
    }
  }

  const lines: string[] = []
  const call = `${emitCallee(expression.callee, context)}(${joinStrings(prepared.args, ', ')})`

  pushAll(lines, prepared.lines)
  if (result === null || typeof result === 'undefined') {
    lines.push(`${call};`)
  } else if (managedResult) {
    lines.push(`${result} = ${call};`)
  } else {
    lines.push(`auto ${result} = ${call};`)
  }

  lines.push('if (inox::thrown()) {')
  lines.push('  inox_error = inox::take_exception();')
  lines.push(`  ${out} = ${rejectExpression}(inox_error);`)
  lines.push(`  ${emitAsyncResultRuntimeTypeCheck(out, context)}`)
  pushIndented(lines, emitPrepareOwnedValueWrite('inox_error'), '  ')
  lines.push('} else {')

  if (valueCheck !== '') {
    lines.push(`  ${valueCheck}`)
  }

  lines.push(`  ${out} = ${resolveExpression}(${fulfilledValue});`)
  lines.push(`  ${emitAsyncResultRuntimeTypeCheck(out, context)}`)
  pushAll(lines, managedResultResetLines)
  lines.push('}')

  return {
    lines,
    expression: out,
    valueType,
    rejectionValueType
  }
}

function isSupportedAsyncFunctionAsyncResultValueType(valueType: string): boolean {
  return (
    valueType === 'void' || valueType === 'number' || valueType === 'boolean' || isManagedRuntimeReturnType(valueType)
  )
}

function emitAsyncResultRuntimeTypeCheck(source: string, context: CFunctionContext): string {
  return emitRuntimeTypeCheck(
    `!(${compilerLibraryIntrinsicAsyncResultCValidExpression(context.libraries, source)})`,
    context
  )
}

function resolveCFunctionRejectionValueType(callee: AnyNode, context: CFunctionContext): string {
  if (callee.type !== 'Reference' || callee.path.length !== 1) {
    return 'unknown'
  }

  let types: IrThrowValueType[] = []
  const storedTypes = context.functionThrowValueTypes.get(callee.path[0])

  if (storedTypes !== null && typeof storedTypes !== 'undefined') {
    types = storedTypes
  }

  if (types.length === 1 && types[0] === 'exception-object') {
    return 'exception-object'
  }

  if (types.length === 1 && types[0] === 'string') {
    return 'string'
  }

  return 'unknown'
}

function emitPreparedAwaitAsyncResultExpression(
  expression: AnyNode,
  context: CFunctionContext
): PreparedExpression | null {
  const immediateLibraryAsyncResult = emitPreparedImmediateAwaitLibraryAsyncResultExpression(expression, context)

  if (immediateLibraryAsyncResult !== null) {
    return immediateLibraryAsyncResult
  }

  const asyncResultExpression = emitPreparedAsyncResultExpression(expression, context, asyncResultLoweringDependencies)

  if (asyncResultExpression !== null && typeof asyncResultExpression !== 'undefined') {
    const valueType = firstKnownValueTypeOrUnknown(
      asyncResultExpression.valueType,
      expression.asyncResultValueType,
      resolveAsyncResultExpressionValueType(expression, context)
    )

    return {
      lines: asyncResultExpression.lines,
      expression: asyncResultExpression.expression,
      nullable: asyncResultExpression.nullable,
      rejectionValueType: asyncResultExpression.rejectionValueType,
      valueType
    }
  }

  return null
}

function emitPreparedImmediateAwaitLibraryAsyncResultExpression(
  expression: AnyNode,
  context: CFunctionContext
): PreparedExpression | null {
  if (!isCompilerLibraryAsyncResultExpression(expression)) {
    return null
  }

  const asyncResult = emitPreparedCompilerLibraryCallExpression(expression, context, { owned: false })

  if (asyncResult === null) {
    return null
  }

  if (compilerLibraryIntrinsicNativeCAwaitHandlesInvalidSource(context.libraries, 'async-result')) {
    return asyncResult
  }

  const source = nextCName(context, 'inox_await_source')
  const lines: string[] = []

  pushAll(lines, asyncResult.lines)
  lines.push(`auto ${source} = ${asyncResult.expression};`)
  lines.push(
    emitRuntimeTypeCheck(
      `!(${compilerLibraryIntrinsicAsyncResultCValidExpression(context.libraries, source)})`,
      context
    )
  )

  return {
    ...asyncResult,
    lines,
    expression: source
  }
}

function emitPreparedAwaitValueAsyncResultExpression(
  expression: AnyNode,
  context: CFunctionContext
): PreparedExpression | null {
  const asyncResult = emitPreparedAwaitAsyncResultExpression(expression.argument, context)

  if (asyncResult !== null && typeof asyncResult !== 'undefined') {
    return preparedExpressionOrEmpty(asyncResult)
  }

  return null
}

function emitAwaitValueVariableDeclaration(statement: AnyNode, context: CFunctionContext): string[] | null {
  const expression = statement.init

  if (
    expression === null ||
    typeof expression === 'undefined' ||
    expression.type !== 'AwaitExpression' ||
    !shouldAwaitReadRejectedAsyncResult(context)
  ) {
    return null
  }

  const preparedAsyncResult = emitPreparedAwaitValueAsyncResultExpression(expression, context)

  if (preparedAsyncResult === null || typeof preparedAsyncResult === 'undefined') {
    return null
  }

  const valueType = firstKnownValueTypeOrUnknown(
    expression.valueType,
    preparedAsyncResult.valueType,
    resolveAsyncResultExpressionValueType(expression.argument, context)
  )

  if (valueType === 'number' || valueType === 'boolean') {
    return null
  }

  registerEventLoop(context)

  const name = emitCIdentifier(statement.name)
  const valueTag = cRuntimeValueTag(valueType)
  const awaitExpression = emitAsyncResultAwaitExpression(expression.argument, preparedAsyncResult.expression, context)

  if (awaitExpression === null) {
    return null
  }

  const lines: string[] = []
  const adapter = resolveAwaitValueAdapterInfo(expression, awaitExpression, valueType, context)
  let cppType = 'inox::Value'

  pushAll(lines, preparedAsyncResult.lines)

  if (adapter !== null && adapter.failureMode === 'thrown' && adapter.preservesPendingException) {
    lines.push(`auto ${name} = ${adapter.valueExpression};`)
    pushAll(lines, emitThrownCheckLines(context))
    cppType = adapter.cppType
  } else {
    const valueCheckNeeded = emitRuntimeValueCheck('inox_await_value', valueTag, context) !== ''
    const rawValue = nextCName(context, 'inox_await_value')
    const valueInfo = resolveAwaitResultCppValueInfo(
      expression,
      rawValue,
      valueType,
      valueTag,
      valueCheckNeeded,
      context
    )

    lines.push(`auto ${rawValue} = ${awaitExpression};`)
    pushAll(lines, emitThrownCheckLines(context))

    if (valueInfo.valueCheck !== '') {
      lines.push(valueInfo.valueCheck)
    }

    lines.push(`auto ${name} = ${valueInfo.valueExpression};`)
    cppType = valueInfo.cppType
  }

  lines.push('')

  if (cppType === 'inox::String') {
    context.variables.set(statement.name, 'string')
    context.cppStringValues.add(statement.name)
  } else {
    registerRuntimeValueMetadata(statement.name, valueType, statement, expression, context)

    if (cppType !== 'inox::Value') {
      context.cppValueTypes.set(statement.name, cppType)
    }
  }

  return lines
}

function emitCAwaitValueExpression(expression: AnyNode, context: CFunctionContext): PreparedExpression {
  const asyncCall = emitCAsyncFunctionAwaitExpression(expression, context)

  if (asyncCall !== null && typeof asyncCall !== 'undefined') {
    return asyncCall
  }

  const asyncResult = emitPreparedAwaitAsyncResultExpression(expression.argument, context)

  if (asyncResult === null || typeof asyncResult === 'undefined') {
    if (inferExpressionType(expression.argument, context) !== 'async-result') {
      return emitCValueExpression(expression.argument, context)
    }

    pushDiagnostic(
      context,
      diagnostic(
        'INOX_C_ASYNC',
        'this awaited asyncResult expression is not supported by the current C++ backend slice',
        expression.loc
      )
    )

    return {
      lines: [],
      expression: 'inox_undefined_value()'
    }
  }

  return emitPreparedAwaitedAsyncResultValueExpression(expression, asyncResult, context)
}

function emitPreparedAwaitedAsyncResultValueExpression(
  expression: AnyNode,
  asyncResult: PreparedExpression,
  context: CFunctionContext
): PreparedExpression {
  const preparedAsyncResult = preparedExpressionOrEmpty(asyncResult)

  registerEventLoop(context)

  const valueType = firstKnownValueTypeOrUnknown(
    expression.valueType,
    preparedAsyncResult.valueType,
    resolveAsyncResultExpressionValueType(expression.argument, context)
  )

  const valueTag = cRuntimeValueTag(valueType)
  const valueCheckNeeded = emitRuntimeValueCheck('inox_await_value', valueTag, context) !== ''
  let rejectionValueType = 'unknown'
  const asyncResultRejectionValueType = preparedAsyncResult.rejectionValueType ?? ''

  if (asyncResultRejectionValueType !== '') {
    rejectionValueType = asyncResultRejectionValueType
  }

  return emitPreparedAwaitResultExpression(
    expression,
    preparedAsyncResult,
    valueType,
    valueTag,
    valueCheckNeeded,
    rejectionValueType,
    context
  )
}

function emitPreparedAwaitResultExpression(
  expression: AnyNode,
  preparedAsyncResult: PreparedExpression,
  valueType: string,
  valueTag: string | null,
  valueCheckNeeded: boolean,
  rejectionValueType: string,
  context: CFunctionContext
): PreparedExpression {
  const awaitExpression = emitAsyncResultAwaitExpression(expression.argument, preparedAsyncResult.expression, context)
  const lines: string[] = []

  pushAll(lines, preparedAsyncResult.lines)

  if (awaitExpression === null) {
    pushDiagnostic(
      context,
      diagnostic(
        'INOX_C_ASYNC',
        'the configured async-result provider does not define C++ await lowering',
        expression.loc
      )
    )

    return {
      lines,
      expression: 'inox_undefined_value()',
      valueType: 'unknown'
    }
  }

  const adapter = resolveAwaitValueAdapterInfo(expression, awaitExpression, valueType, context)

  if (adapter !== null && adapter.failureMode === 'thrown' && adapter.preservesPendingException) {
    const converted = nextCName(context, 'inox_await')

    lines.push(`auto ${converted} = ${adapter.valueExpression};`)
    pushAll(lines, emitAwaitResultRejectedAsyncResultLines(converted, rejectionValueType, context))

    return {
      lines,
      expression: converted,
      cppDeclaredName: converted,
      cppType: adapter.cppType,
      owned: false,
      runtimeTypeChecked: true,
      valueType
    }
  }

  const result = nextCName(context, 'inox_await')
  const valueInfo = resolveAwaitResultCppValueInfo(expression, result, valueType, valueTag, valueCheckNeeded, context)

  lines.push(`auto ${result} = ${awaitExpression};`)
  pushAll(lines, emitAwaitResultRejectedAsyncResultLines(result, rejectionValueType, context))

  if (valueInfo.valueCheck !== '') {
    lines.push(valueInfo.valueCheck)
  }

  let resolvedExpression = valueInfo.valueExpression
  let cppDeclaredName = result

  if (valueInfo.cppType !== 'inox::Value') {
    const converted = nextCName(context, 'inox_await_converted')
    lines.push(`auto ${converted} = ${valueInfo.valueExpression};`)
    resolvedExpression = converted
    cppDeclaredName = converted
  }

  const preparedExpression: PreparedExpression = {
    lines,
    expression: resolvedExpression,
    cppDeclaredName,
    owned: false,
    runtimeTypeChecked: valueInfo.runtimeTypeChecked,
    valueType
  }

  if (valueInfo.cppType !== 'inox::Value') {
    preparedExpression.cppType = valueInfo.cppType
  }

  return preparedExpression
}

type AwaitResultCppValueInfo = {
  cppType: string
  runtimeTypeChecked: boolean
  valueCheck: string
  valueExpression: string
}

function resolveAwaitValueAdapterInfo(
  expression: AnyNode,
  valueExpression: string,
  valueType: string,
  context: CFunctionContext
): CRuntimeValueAdapterInfo | null {
  const shape = expression.shape ?? expression.argument?.shape
  const adapter = cRuntimeValueAdapterInfo(valueType, shape, valueExpression, context.libraries)
  const asyncResultCppType = compilerLibraryIntrinsicNativeCppType(context.libraries, 'async-result')

  if (adapter === null || adapter.cppType === asyncResultCppType) {
    return null
  }

  return adapter
}

function resolveAwaitResultCppValueInfo(
  expression: AnyNode,
  valueExpression: string,
  valueType: string,
  valueTag: string | null,
  valueCheckNeeded: boolean,
  context: CFunctionContext
): AwaitResultCppValueInfo {
  if (valueType === 'string') {
    return {
      cppType: 'inox::String',
      runtimeTypeChecked: true,
      valueCheck: emitRuntimeValueCheck(valueExpression, 'INOX_TAG_STRING', context),
      valueExpression: `inox::String(${valueExpression})`
    }
  }

  const shape = expression.shape ?? expression.argument?.shape
  const libraryCppType = shape?.libraryCppType
  let nativeValidExpression = compilerLibraryNativeRuntimeValueValidExpressionForTypeRef(
    context.libraries,
    expression.typeRef
  )

  if (nativeValidExpression === null) {
    nativeValidExpression = compilerLibraryNativeRuntimeValueValidExpressionForTypeRef(
      context.libraries,
      expression.argument?.typeRef
    )
  }
  const asyncResultCppType = compilerLibraryIntrinsicNativeCppType(context.libraries, 'async-result')

  if (libraryCppType !== null && typeof libraryCppType !== 'undefined' && libraryCppType !== asyncResultCppType) {
    const adapter = libraryNativeValueAdapter(shape)
    const valueCheck =
      nativeValidExpression === null
        ? emitRuntimeValueCheck(valueExpression, valueTag, context)
        : emitRuntimeTypeCheck(`!(${nativeValidExpression.split('$value').join(valueExpression)})`, context)

    return {
      cppType: libraryCppType,
      runtimeTypeChecked: true,
      valueCheck,
      valueExpression:
        adapter === null
          ? `${libraryCppType}(${valueExpression})`
          : applyLibraryNativeValueAdapter(valueExpression, adapter)
    }
  }

  if (!valueCheckNeeded) {
    return {
      cppType: 'inox::Value',
      runtimeTypeChecked: false,
      valueCheck: '',
      valueExpression
    }
  }

  return {
    cppType: 'inox::Value',
    runtimeTypeChecked: true,
    valueCheck: emitRuntimeValueCheck(valueExpression, valueTag, context),
    valueExpression
  }
}

function emitAsyncResultAwaitExpression(
  expression: AnyNode | null | undefined,
  value: string,
  context: CFunctionContext
): string | null {
  const configuredExpression = expression?.libraryCAwaitExpression
  const template =
    typeof configuredExpression === 'string'
      ? configuredExpression
      : compilerLibraryIntrinsicNativeCAwaitExpression(context.libraries, 'async-result')

  if (template === null || !template.includes('$value')) {
    return null
  }

  return template.split('$value').join(value)
}

function emitAwaitResultRejectedAsyncResultLines(
  _result: string,
  _rejectionValueType: string,
  context: CFunctionContext
): string[] {
  return emitThrownCheckLines(context)
}

function emitThrownCheckLines(context: CFunctionContext): string[] {
  const target = currentErrorTarget(context) ?? ''

  if (target === '') {
    return [`if (inox::thrown()) ${emitFailureStatement(context)}`]
  }

  if (!currentErrorTargetRequiresActive(context)) {
    return [`if (inox::thrown()) goto ${target};`]
  }

  registerErrorChannel(context)
  return ['if (inox::thrown()) {', '  inox_error_active = 1;', `  goto ${target};`, '}']
}

function shouldAwaitReadRejectedAsyncResult(context: CFunctionContext): boolean {
  const target = currentErrorTarget(context) ?? ''

  return target !== ''
}

function emitCAsyncFunctionAwaitExpression(expression: AnyNode, context: CFunctionContext): PreparedExpression | null {
  const callExpression = expression.argument

  if (
    callExpression === null ||
    typeof callExpression === 'undefined' ||
    callExpression.type !== 'CallExpression' ||
    !isAsyncFunctionCallee(callExpression.callee, context)
  ) {
    return null
  }

  if (callExpression.callee.type === 'Reference') {
    const path: string[] = callExpression.callee.path
    const name = path[0]

    if (name !== null && typeof name !== 'undefined' && context.asyncTaskWrappers.has(name)) {
      return null
    }
  }

  const valueType = firstKnownValueTypeOrUnknown(
    expression.valueType,
    resolveCAsyncFunctionAwaitValueType(callExpression.callee, context),
    null
  )

  const call = emitPreparedCallExpression(callExpression, context)

  if (valueType === 'void') {
    const lines: string[] = []

    pushAll(lines, call.lines)
    if (call.expression !== '') {
      lines.push(`${call.expression};`)
    }

    return {
      lines,
      expression: 'inox_undefined_value()'
    }
  }

  const valueTag = cRuntimeValueTag(valueType)
  const valueTagName = valueTag ?? ''

  if (valueTagName === '' && valueType !== 'number' && valueType !== 'boolean') {
    pushDiagnostic(
      context,
      diagnostic(
        'INOX_C_ASYNC',
        'this async function return value is not supported by the current C++ backend slice',
        expression.loc
      )
    )

    return {
      lines: [],
      expression: 'inox_undefined_value()'
    }
  }

  const value = nextCName(context, 'inox_await_value')
  let resultExpression = call.expression
  const lines: string[] = []

  registerOwnedValue(context, value)

  if (valueType === 'boolean') {
    resultExpression = `inox_bool_value((${call.expression}) != 0)`
  } else if (valueType === 'number') {
    resultExpression = `inox_number_value(${call.expression})`
  }

  const valueCheck = emitRuntimeValueCheck(value, valueTag, context)

  pushAll(lines, call.lines)
  lines.push(`${value} = ${resultExpression};`)

  if (valueCheck !== '') {
    lines.push(valueCheck)
  }

  return {
    lines,
    expression: value
  }
}

function isThrowingFunctionCallee(callee: AnyNode, context: CEmitContext): boolean {
  return isThrowingFunctionCalleeFromExpressions(callee, context)
}

function isThrowingFunctionName(name: string, context: CEmitContext): boolean {
  return isThrowingFunctionNameFromExpressions(name, context)
}

function emitCallee(callee: AnyNode, context: CFunctionContext): string {
  return emitCalleeFromExpressions(callee, context)
}

function emitFunctionValueExpression(expression: AnyNode, context: CFunctionContext): string {
  if (expression.type === 'ArrowFunctionExpression') {
    const wrapper = context.callbackArrowWrappers.get(expression)

    if (wrapper !== null && typeof wrapper !== 'undefined' && wrapper.kind === 'plain-arrow') {
      return wrapper.name
    }

    pushDiagnostic(
      context,
      diagnostic(
        'INOX_C_FUNCTION_VALUE',
        'capturing or unsupported inline callbacks are not supported by the current C++ backend slice; use a named function or a non-capturing inline callback with a supported signature',
        expression.loc
      )
    )

    return '0'
  }

  if (expression.type === 'Reference' && expression.path.length === 1) {
    const name = expression.path[0]

    if (context.variables.get(name) === 'function') {
      return name
    }

    if (context.functionNames.has(name)) {
      const functionName = context.functionNames.get(name)

      if (functionName !== null && typeof functionName !== 'undefined') {
        return functionName
      }
    }
  }

  const loc = expression.loc

  pushDiagnostic(
    context,
    diagnostic('INOX_C_FUNCTION_VALUE', 'this function value is not supported by the current C++ backend slice', loc)
  )

  return '0'
}

function resolveRuntimeCallbackCalleeType(callee: AnyNode, context: CFunctionContext): CFunctionType | null {
  if (callee.type === 'Reference' && callee.path.length === 1) {
    const name = callee.path[0]

    if (!context.runtimeCallbacks.has(name)) {
      return null
    }

    const functionType = context.functionTypes.get(name)

    if (isSupportedRuntimeCallbackType(functionType)) {
      return normalizeFunctionType(functionType)
    }
  }

  return null
}

function emitRuntimeCallbackCalleeReference(callee: AnyNode, context: CFunctionContext): string {
  return emitReference(callee, context)
}

function emitRuntimeCallbackVariableDeclaration(statement: AnyNode, context: CFunctionContext): string[] {
  const functionType = normalizeFunctionType(statement.functionType)

  context.variables.set(statement.name, 'function')
  context.functionTypes.set(statement.name, functionType)
  context.runtimeCallbacks.add(statement.name)
  registerOwnedValue(context, statement.name)

  return emitRuntimeCallbackValueInto(statement.init, functionType, statement.name, context)
}

function emitRuntimeCallbackValue(
  expression: AnyNode,
  functionType: CFunctionType | null | undefined,
  context: CFunctionContext
): PreparedExpression {
  if (
    expression.type === 'Reference' &&
    expression.path.length === 1 &&
    context.runtimeCallbacks.has(expression.path[0])
  ) {
    const name = expression.path[0]

    return {
      lines: [],
      expression: name
    }
  }

  const temp = nextCName(context, 'inox_callback')
  registerOwnedValue(context, temp)

  return {
    lines: emitRuntimeCallbackValueInto(expression, functionType, temp, context),
    expression: temp
  }
}

function emitRuntimeCallbackValueInto(
  expression: AnyNode,
  functionType: CFunctionType | null | undefined,
  out: string,
  context: CFunctionContext
): string[] {
  if (
    expression.type === 'Reference' &&
    expression.path.length === 1 &&
    context.runtimeCallbacks.has(expression.path[0])
  ) {
    return emitRuntimeCallbackReferenceValueInto(expression.path[0], out, context)
  }

  const objectField = objectFunctionFieldReference(expression, context)

  if (
    objectField !== null &&
    typeof objectField !== 'undefined' &&
    !context.classInstanceTypes.has(objectField.objectName) &&
    isRuntimeObjectFunctionField(objectField.field, objectFunctionFieldSeenTypes(objectField.objectName, context))
  ) {
    return emitRuntimeCallbackReferenceValueInto(objectField.name, out, context)
  }

  if (expression.type === 'CallExpression') {
    const call = emitPreparedCallExpression(expression, context)
    const lines: string[] = []

    pushAll(lines, call.lines)

    if (context.ownedValues.includes(out)) {
      lines.push(`${out} = inox::adopt(${call.expression});`)
    } else {
      lines.push(`inox_release(${out});`)
      lines.push(`${out} = ${call.expression};`)
    }

    return lines
  }

  if (expression.type === 'ArrowFunctionExpression') {
    const wrapper = context.callbackArrowWrappers.get(expression)

    if (wrapper === null || typeof wrapper === 'undefined' || wrapper.kind !== 'arrow') {
      pushDiagnostic(
        context,
        diagnostic(
          'INOX_C_FUNCTION_VALUE',
          'runtime C callback wrapper was not generated for this arrow function',
          expression.loc
        )
      )
      return emitUndefinedRuntimeCallbackValueInto(out, context)
    }

    return emitRuntimeArrowCallbackValueInto(wrapper, out, context)
  }

  if (
    expression.type !== 'Reference' ||
    expression.path.length !== 1 ||
    (!context.functionNames.has(expression.path[0]) && typeof expression.libraryCExpression !== 'string')
  ) {
    const loc = expression.loc

    pushDiagnostic(
      context,
      diagnostic('INOX_C_FUNCTION_VALUE', 'runtime C callbacks currently require a named non-capturing function', loc)
    )
    return emitUndefinedRuntimeCallbackValueInto(out, context)
  }

  const functionName = expression.path[0]
  const wrapper = runtimeCallbackWrapperFor(functionName, normalizeFunctionType(functionType), context)

  if (wrapper === null || typeof wrapper === 'undefined') {
    pushDiagnostic(
      context,
      diagnostic(
        'INOX_C_FUNCTION_VALUE',
        'runtime C callback wrapper was not generated for this function value',
        expression.loc
      )
    )
    return emitUndefinedRuntimeCallbackValueInto(out, context)
  }

  const callbackContext = '0'

  const lines: string[] = []
  const target = prepareRuntimeCallbackOutTarget(out, context, lines)

  lines.push(
    emitStatusCheck(
      `inox_callback_new(&inox_default_allocator, ${wrapper.name}, ${callbackContext}, 0, ${target})`,
      context
    )
  )

  return lines
}

function emitUndefinedRuntimeCallbackValueInto(out: string, context: CFunctionContext): string[] {
  if (context.ownedValues.includes(out)) {
    return [`${out} = inox_undefined_value();`]
  }

  return emitUndefinedRawRuntimeCallbackValueInto(out)
}

function emitUndefinedRawRuntimeCallbackValueInto(out: string): string[] {
  return [`inox_release(${out});`, `${out} = inox_undefined_value();`]
}

function emitRuntimeCallbackReferenceValueInto(source: string, out: string, context: CFunctionContext): string[] {
  if (context.ownedValues.includes(out)) {
    return [`${out} = ${source};`]
  }

  return [`inox_retain(${source});`, `inox_release(${out});`, `${out} = ${source};`]
}

function prepareRuntimeCallbackOutTarget(out: string, context: CFunctionContext, lines: string[]): string {
  if (context.ownedValues.includes(out)) {
    return `${out}.out()`
  }

  pushAll(lines, emitPrepareOwnedValueWrite(out, 'raw'))
  return `&${out}`
}

function isSupportedRuntimeArrowCaptureValueType(valueType: string): boolean {
  return (
    isNullableScalarType(valueType) || isManagedRuntimeReturnType(valueType) || valueType === 'asyncResult-settlement'
  )
}

function emitRuntimeArrowCallbackValueInto(
  wrapper: CRuntimeArrowCallbackWrapper,
  out: string,
  context: CFunctionContext
): string[] {
  const lines: string[] = []
  const captures = callbackContextWrapperCaptures(wrapper)
  const target = prepareRuntimeCallbackOutTarget(out, context, lines)

  for (const capture of captures) {
    if (capture.mutable && !isSupportedMutableRuntimeArrowCapture(capture, context)) {
      pushDiagnostic(
        context,
        diagnostic(
          'INOX_C_FUNCTION_VALUE',
          'capturing this mutable binding in C callbacks requires unsupported boxed closure storage',
          wrapper.expression.loc
        )
      )
    }

    if (!isSupportedRuntimeArrowCaptureValueType(capture.valueType)) {
      pushDiagnostic(
        context,
        diagnostic(
          'INOX_C_FUNCTION_VALUE',
          'capturing C callbacks currently support only const scalar/runtime-value bindings and async-result settlement handlers',
          wrapper.expression.loc
        )
      )
    }
  }

  if (!hasRuntimeArrowCallbackContext(wrapper)) {
    lines.push(emitStatusCheck(`inox_callback_new(&inox_default_allocator, ${wrapper.name}, 0, 0, ${target})`, context))
    return lines
  }

  const contextName = nextCName(context, 'inox_callback_ctx')
  const contextTypeName = callbackContextWrapperContextTypeName(wrapper)

  lines.push(
    `${contextTypeName}* ${contextName} = (${contextTypeName}*)inox_default_alloc(0, sizeof(${contextTypeName}), _Alignof(${contextTypeName}));`
  )
  lines.push(`if (${contextName} == 0) ${emitFailureStatement(context)}`)

  if (callbackContextWrapperNeedsEventLoop(wrapper)) {
    registerEventLoop(context)
    lines.push(`${contextName}->inox_loop = ${emitEventLoopReference(context)};`)
  }

  for (const capture of captures) {
    pushAll(lines, emitRuntimeArrowCaptureStoreLines(capture, contextName, context))
  }

  const finalizerName = callbackContextWrapperFinalizerName(wrapper)
  lines.push(
    `if (inox_callback_new(&inox_default_allocator, ${wrapper.name}, ${contextName}, ${finalizerName}, ${target}) != INOX_OK) {`
  )
  lines.push(`  ${finalizerName}(${contextName});`)
  lines.push(`  ${emitFailureStatement(context)}`)
  lines.push('}')

  return lines
}

function emitRuntimeArrowCaptureStoreLines(
  capture: CRuntimeArrowCapture,
  contextName: string,
  context: CFunctionContext
): string[] {
  const field = `${contextName}->${emitRuntimeArrowCaptureField(capture)}`
  const captureName = emitCIdentifier(capture.name)
  const moduleCaptureName = context.moduleValueNames.get(capture.name)
  const storedCaptureName = moduleCaptureName ?? captureName
  const lines: string[] = []

  if (isSupportedMutableRuntimeArrowCapture(capture, context)) {
    lines.push(`${field} = ${captureName};`)
    if (capture.valueType === 'number' || capture.valueType === 'boolean') {
      lines.push(`inox_shared_number_box_retain(${field});`)
    } else {
      lines.push(`inox_shared_value_box_retain(${field});`)
    }
    return lines
  }

  if (isRetainedRuntimeArrowCapture(capture)) {
    if (capture.valueType === 'string') {
      if (moduleCaptureName !== null && typeof moduleCaptureName !== 'undefined') {
        lines.push(`${field} = ${storedCaptureName};`)
      } else if (
        context.cppValueTypes.get(capture.name) === 'inox::Value' ||
        context.cppValueTypes.get(capture.name) === 'inox::String'
      ) {
        lines.push(`${field} = ${captureName}.raw();`)
      } else {
        lines.push(`${field}.tag = INOX_TAG_STRING;`)
        lines.push(`${field}.as.ref = (inox_ref*)&${captureName}->header;`)
      }
      lines.push(`inox_retain(${field});`)
      return lines
    }

    lines.push(`${field} = ${storedCaptureName};`)
    lines.push(`inox_retain(${field});`)
    return lines
  }

  if (capture.valueType === 'asyncResult-settlement') {
    const handler = context.asyncResultConstructorHandlers.get(capture.name)

    if (handler === null || typeof handler === 'undefined') {
      pushDiagnostic(
        context,
        diagnostic(
          'INOX_C_FUNCTION_VALUE',
          'async-result settlement handlers can only be captured inside async-result constructor executors',
          capture.loc
        )
      )

      return lines
    }

    const cppType = capture.asyncResultSettlementCppType

    if (typeof cppType !== 'string' || cppType.length === 0) {
      return lines
    }

    lines.push(`new (&${field}) ${cppType}(${handler.asyncResult});`)
    return lines
  }

  lines.push(`${field} = ${capture.name};`)
  return lines
}

function emitRuntimeCallbackCall(
  expression: AnyNode,
  functionType: CFunctionType,
  context: CFunctionContext
): PreparedExpression {
  const lines: string[] = []
  const args: string[] = []
  const callee = emitRuntimeCallbackCalleeReference(expression.callee, context)

  for (const arg of expression.args) {
    const value = emitCValueExpression(arg, context)

    appendRuntimeCallbackArgument(lines, args, value, context)
  }

  for (let index = args.length; index < functionType.params.length; index = index + 1) {
    args.push('inox_undefined_value()')
  }

  const out = nextCName(context, 'inox_callback_out')
  registerOwnedValue(context, out)

  if (args.length === 0) {
    lines.push(emitStatusCheck(`inox_callback_call(${callee}, 0, 0, ${out}.out())`, context))
  } else {
    const argArray = nextCName(context, 'inox_callback_args')

    lines.push(`inox_value ${argArray}[] = { ${joinStrings(args, ', ')} };`)
    lines.push(emitStatusCheck(`inox_callback_call(${callee}, ${argArray}, ${args.length}, ${out}.out())`, context))
  }

  if (functionType.returnType === 'number') {
    lines.push(emitRuntimeTypeCheck(`${out}.raw().tag != INOX_TAG_NUMBER`, context))
    return {
      lines,
      expression: `${out}.raw().as.number`
    }
  }

  if (functionType.returnType === 'boolean') {
    lines.push(emitRuntimeTypeCheck(`${out}.raw().tag != INOX_TAG_BOOL`, context))
    return {
      lines,
      expression: `${out}.raw().as.boolean ? 1 : 0`
    }
  }

  return {
    lines,
    expression: out,
    valueType: functionType.returnType
  }
}

function emitOptionalCallbackCallExpression(expression: AnyNode, context: CFunctionContext): string[] {
  const plainCallee = resolveOptionalPlainObjectFunctionCallee(expression.callee, context)

  if (plainCallee !== null) {
    const call = emitPreparedCallExpression(expression, context)
    const lines: string[] = [`if (${plainCallee.name} != nullptr) {`]

    pushIndented(lines, call.lines, '  ')

    if (call.expression !== '') {
      lines.push(`  ${call.expression};`)
    }

    lines.push('}')
    return lines
  }

  const functionType = resolveRuntimeCallbackCalleeType(expression.callee, context)

  if (functionType === null || typeof functionType === 'undefined') {
    pushDiagnostic(
      context,
      diagnostic(
        'INOX_C_OPTIONAL_CHAINING',
        'optional calls currently require a nullable runtime callback value in the C++ backend',
        expression.loc
      )
    )
    return []
  }

  const callee = emitRuntimeCallbackCalleeReference(expression.callee, context)
  const calleeTypeCheck = `${callee}.tag != INOX_TAG_FUNCTION || ${callee}.as.ref == 0`
  const lines: string[] = []
  const args: string[] = []

  lines.push(`if (${callee}.tag != INOX_TAG_NULL && ${callee}.tag != INOX_TAG_UNDEFINED) {`)
  lines.push(`  ${emitRuntimeTypeCheck(calleeTypeCheck, context)}`)

  for (const arg of expression.args) {
    const value = emitCValueExpression(arg, context)

    appendRuntimeCallbackArgument(lines, args, value, context, '  ')
  }

  const out = nextCName(context, 'inox_callback_out')
  registerOwnedValue(context, out)

  if (args.length === 0) {
    const call = `inox_callback_call(${callee}, 0, 0, ${out}.out())`
    lines.push(`  ${emitStatusCheck(call, context)}`)
  } else {
    const argArray = nextCName(context, 'inox_callback_args')
    const call = `inox_callback_call(${callee}, ${argArray}, ${args.length}, ${out}.out())`

    lines.push(`  inox_value ${argArray}[] = { ${joinStrings(args, ', ')} };`)
    lines.push(`  ${emitStatusCheck(call, context)}`)
  }

  lines.push('}')

  return lines
}

function emitOptionalCallbackCallValueExpression(expression: AnyNode, context: CFunctionContext): PreparedExpression {
  const plainCallee = resolveOptionalPlainObjectFunctionCallee(expression.callee, context)

  if (plainCallee !== null) {
    return emitOptionalPlainObjectFunctionCallValueExpression(expression, plainCallee, context)
  }

  const functionType = resolveRuntimeCallbackCalleeType(expression.callee, context)
  const resultType = inferExpressionType(expression, context)
  const expectedTag = cRuntimeValueTag(resultType)
  const expectedTagName = expectedTag ?? ''

  if (
    functionType === null ||
    typeof functionType === 'undefined' ||
    !isRuntimeNullableType(functionType.returnType) ||
    expectedTagName === ''
  ) {
    pushDiagnostic(
      context,
      diagnostic(
        'INOX_C_OPTIONAL_CHAINING',
        'optional call results currently support nullable runtime callback results in the C++ backend',
        expression.loc
      )
    )

    return {
      lines: [],
      expression: 'inox_null_value()'
    }
  }

  const callee = emitRuntimeCallbackCalleeReference(expression.callee, context)
  const out = nextCName(context, 'inox_optional_call')
  const calleeTypeCheck = `${callee}.tag != INOX_TAG_FUNCTION || ${callee}.as.ref == 0`
  const lines: string[] = []
  const args: string[] = []

  registerOwnedValue(context, out)
  lines.push(`${out} = inox_undefined_value();`)
  lines.push(`if (${callee}.tag != INOX_TAG_NULL && ${callee}.tag != INOX_TAG_UNDEFINED) {`)
  lines.push(`  ${emitRuntimeTypeCheck(calleeTypeCheck, context)}`)

  for (const arg of expression.args) {
    const value = emitCValueExpression(arg, context)

    appendRuntimeCallbackArgument(lines, args, value, context, '  ')
  }

  if (args.length === 0) {
    const call = `inox_callback_call(${callee}, 0, 0, ${out}.out())`
    lines.push(`  ${emitStatusCheck(call, context)}`)
  } else {
    const argArray = nextCName(context, 'inox_callback_args')
    const call = `inox_callback_call(${callee}, ${argArray}, ${args.length}, ${out}.out())`

    lines.push(`  inox_value ${argArray}[] = { ${joinStrings(args, ', ')} };`)
    lines.push(`  ${emitStatusCheck(call, context)}`)
  }

  lines.push(`  ${emitRuntimeValueCheck(out, expectedTag, context)}`)
  lines.push('}')

  return {
    lines,
    expression: out
  }
}

function appendRuntimeCallbackArgument(
  lines: string[],
  args: string[],
  value: PreparedExpression,
  context: CFunctionContext,
  indent = ''
): void {
  pushIndented(lines, value.lines, indent)

  if (value.cppType === null || typeof value.cppType === 'undefined') {
    args.push(value.expression)
    return
  }

  const name = nextCName(context, 'inox_callback_arg')

  lines.push(`${indent}auto ${name} = ${value.expression};`)
  args.push(name)
}

type OptionalPlainObjectFunctionCallee = {
  name: string
}

function resolveOptionalPlainObjectFunctionCallee(
  callee: AnyNode,
  context: CFunctionContext
): OptionalPlainObjectFunctionCallee | null {
  const objectField = objectFunctionFieldReference(callee, context)

  if (
    objectField === null ||
    context.classInstanceTypes.has(objectField.objectName) ||
    objectField.field.functionType === null ||
    typeof objectField.field.functionType === 'undefined' ||
    !isPlainObjectFunctionField(objectField.field, objectFunctionFieldSeenTypes(objectField.objectName, context))
  ) {
    return null
  }

  return {
    name: objectField.name
  }
}

function emitOptionalPlainObjectFunctionCallValueExpression(
  expression: AnyNode,
  callee: OptionalPlainObjectFunctionCallee,
  context: CFunctionContext
): PreparedExpression {
  const valueType = inferExpressionType(expression, context)
  const expectedTag = cRuntimeValueTag(valueType)
  const call = emitPreparedCallExpression(expression, context)

  if (call.expression === '' || (expectedTag === null && valueType !== 'number' && valueType !== 'boolean')) {
    pushDiagnostic(
      context,
      diagnostic(
        'INOX_C_OPTIONAL_CHAINING',
        'this optional function result is not supported by the current C++ backend slice',
        expression.loc
      )
    )

    return {
      lines: call.lines,
      expression: 'inox_undefined_value()'
    }
  }

  const out = nextCName(context, 'inox_optional_call')
  const lines: string[] = []
  let result = call.expression

  if (valueType === 'number') {
    result = `inox_number_value(${result})`
  } else if (valueType === 'boolean') {
    result = `inox_bool_value((${result}) != 0)`
  }

  registerOwnedValue(context, out)
  lines.push(`${out} = inox_undefined_value();`)
  lines.push(`if (${callee.name} != nullptr) {`)
  pushIndented(lines, call.lines, '  ')
  lines.push(`  ${out} = ${result};`)

  if (expectedTag !== null) {
    lines.push(`  ${emitRuntimeValueCheck(out, expectedTag, context)}`)
  }

  lines.push('}')

  return {
    lines,
    expression: out
  }
}

type FunctionParamContext = {
  functionParams: Map<string, CFunctionParam[]>
  functionReturnShapes: Map<string, CObjectShape | null>
  objectAccessorReturnPaths: Map<string, CObjectAccessorReturnPath>
  objectAliases: Map<string, string>
  objectShapes: Map<string, CObjectShapeField[]>
}

type ObjectFunctionFieldReference = {
  field: CObjectShapeField
  fieldName: string
  name: string
  objectName: string
}

function functionParamArgumentAt(args: CAccessorNode[], expectedIndex: number): CAccessorNode | null {
  for (let index = 0; index < args.length; index = index + 1) {
    if (index === expectedIndex) {
      return args[index]
    }
  }

  return null
}

function appendObjectFunctionParamAccessorFields(objectName: string, fields: string[]): string {
  let result = objectName

  for (let index = 0; index < fields.length; index = index + 1) {
    result = `${result}_${fields[index]}`
  }

  return result
}

function resolveObjectFunctionParamExpressionName(
  expression: CAccessorNode,
  context: FunctionParamContext
): string | null {
  const directName = resolveCObjectExpressionName(expression)

  if (directName !== null && typeof directName !== 'undefined') {
    return context.objectAliases.get(directName) ?? directName
  }

  if (expression.type === 'MemberExpression') {
    const objectName = resolveObjectFunctionParamExpressionName(expression.object, context)

    if (objectName !== null && typeof objectName !== 'undefined') {
      const path = `${objectName}_${expression.property}`
      return context.objectAliases.get(path) ?? path
    }
  }

  if (expression.type === 'IndexExpression' && expression.index.type === 'StringLiteral') {
    const objectName = resolveObjectFunctionParamExpressionName(expression.object, context)

    if (objectName !== null && typeof objectName !== 'undefined') {
      const path = `${objectName}_${expression.index.value}`
      return context.objectAliases.get(path) ?? path
    }
  }

  if (
    expression.type === 'CallExpression' &&
    expression.callee.type === 'Reference' &&
    expression.callee.path.length === 1
  ) {
    const path: string[] = expression.callee.path
    const name = path[0]

    if (name === null || typeof name === 'undefined') {
      return null
    }

    const accessor = context.objectAccessorReturnPaths.get(name)

    if (accessor !== null && typeof accessor !== 'undefined') {
      const argument = functionParamArgumentAt(expression.args, accessor.paramIndex)

      if (argument !== null && typeof argument !== 'undefined') {
        const objectName = resolveObjectFunctionParamExpressionName(argument, context)

        if (objectName !== null && typeof objectName !== 'undefined') {
          return appendObjectFunctionParamAccessorFields(objectName, accessor.fields)
        }
      }
    }
  }

  return null
}

function objectFunctionParamFields(
  object: CAccessorNode,
  objectName: string,
  context: FunctionParamContext
): CObjectShapeField[] | null {
  const fields = context.objectShapes.get(objectName)

  if (fields !== null && typeof fields !== 'undefined') {
    return fields
  }

  if (
    object.shape !== null &&
    typeof object.shape !== 'undefined' &&
    object.shape.fields !== null &&
    typeof object.shape.fields !== 'undefined'
  ) {
    return object.shape.fields
  }

  if (object.type === 'CallExpression' && object.callee.type === 'Reference' && object.callee.path.length === 1) {
    const path: string[] = object.callee.path
    const name = path[0]

    if (name === null || typeof name === 'undefined') {
      return null
    }

    const shape = context.functionReturnShapes.get(name)

    if (
      shape !== null &&
      typeof shape !== 'undefined' &&
      shape.fields !== null &&
      typeof shape.fields !== 'undefined'
    ) {
      return shape.fields
    }
  }

  return null
}

function objectFunctionFieldReference(
  callee: CAccessorNode,
  context: FunctionParamContext
): ObjectFunctionFieldReference | null {
  let object: CAccessorNode | null = null
  let fieldName: string | null = null

  if (callee.type === 'MemberExpression') {
    object = callee.object
    fieldName = callee.property
  } else if (callee.type === 'IndexExpression' && callee.index.type === 'StringLiteral') {
    object = callee.object
    fieldName = callee.index.value
  }

  if (object === null || typeof object === 'undefined' || fieldName === null || typeof fieldName === 'undefined') {
    return null
  }

  const objectName = resolveObjectFunctionParamExpressionName(object, context)

  if (objectName === null || typeof objectName === 'undefined') {
    return null
  }

  const fields = objectFunctionParamFields(object, objectName, context)

  if (fields === null || typeof fields === 'undefined') {
    return null
  }

  for (const field of fields) {
    if (
      field.name === fieldName &&
      field.valueType === 'function' &&
      field.functionType !== null &&
      typeof field.functionType !== 'undefined'
    ) {
      return {
        field,
        fieldName,
        name: emitCObjectFunctionFieldName(objectName, fieldName),
        objectName
      }
    }
  }

  return null
}

function objectFunctionFieldParams(callee: CAccessorNode, context: FunctionParamContext): CFunctionParam[] | null {
  const objectField = objectFunctionFieldReference(callee, context)

  return objectField?.field.functionType?.params ?? null
}

function resolveFunctionParams(callee: CAccessorNode, context: FunctionParamContext): CFunctionParam[] | null {
  if (callee.type === 'Reference' && callee.path.length === 1) {
    return context.functionParams.get(callee.path[0]) ?? null
  }

  return objectFunctionFieldParams(callee, context)
}

function inferExpressionType(expression: AnyNode, context: CFunctionContext): string {
  return inferExpressionTypeWithDependencies(expression, context, expressionTypeDependencies)
}

function isExceptionValueExpression(expression: AnyNode, context: CFunctionContext): boolean {
  return isKnownExceptionValueExpression(expression, context.exceptionValueNames)
}

function isKnownExceptionValueExpression(expression: AnyNode, exceptionValueNames: CNameSet): boolean {
  if (
    expression !== null &&
    typeof expression !== 'undefined' &&
    expression.libraryIntrinsicRole === 'exception-value'
  ) {
    return true
  }

  if (
    expression !== null &&
    typeof expression !== 'undefined' &&
    expression.type === 'Reference' &&
    expression.path.length === 1
  ) {
    return exceptionValueNames.has(expression.path[0])
  }

  return false
}

function registerExceptionValueShape(context: CFunctionContext, name: string): void {
  context.exceptionValueNames.add(name)
  const fields = context.exceptionValueShape?.fields

  if (!context.objectShapes.has(name) && fields !== null && typeof fields !== 'undefined') {
    context.objectShapes.set(name, fields)
  }
}
