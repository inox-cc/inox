import { diagnostic } from '../diagnostics.ts'
import { collectIrLocalThrowValueTypes, collectIrPrograms } from '../ir.ts'
import type { IrLocalThrowValueTypeOptions } from '../ir/effects.ts'
import type { IrModuleRecord } from '../ir/top-level.ts'
import type { DebugMemoryStatsField } from '../stdlib/descriptors/debug.ts'
import { debugMemoryStatsFields } from '../stdlib/descriptors/debug.ts'
import type {
  AnyNode,
  Diagnostic,
  IrFunctionDeclaration,
  IrFunctionEffect,
  IrProgram,
  IrThrowValueType,
  ModuleGraph,
  SourceLocation
} from '../types.ts'
import type { CallbackLoweringDependencies } from './async/callbacks.ts'
import {
  collectArrowCaptures,
  emitFunctionPointerParams,
  emitFunctionPointerReturnType,
  emitRuntimeArrowCallbackContextFinalizerDeclaration,
  emitRuntimeArrowCallbackContextLocals,
  emitRuntimeArrowCaptureField,
  functionUsesExternalEventLoop,
  hasRuntimeArrowCallbackContext,
  isNullableFunctionType,
  isPlainFunctionPointerType,
  isPromiseChainCallbackWrapperWithContext,
  isRetainedRuntimeArrowCapture,
  isRuntimeFunctionType,
  isSupportedMutableRuntimeArrowCapture,
  isSupportedRuntimeCallbackType,
  normalizeFunctionType,
  resolveRuntimeFunctionArgumentType,
  runtimeCallbackWrapperFor
} from './async/callbacks.ts'
import type { PromiseChainLoweringDependencies, PromiseLoweringDependencies } from './async/promises.ts'
import {
  cPromiseRuntimeCallName,
  emitPreparedPromiseConstructorExpression,
  emitPreparedPromiseExpression,
  emitPreparedPromiseMethodExpression,
  emitPreparedPromiseReturningCallExpression,
  emitPreparedPromiseStaticExpression,
  emitPromiseConstructorSettlementCall,
  functionTakesEventLoopParam,
  isAsyncFunctionCallee,
  isExternalEventLoopFunctionCallee,
  isPromiseConstructorExpression,
  isPromiseReturningFunctionCallee,
  knownValueType,
  resolveCAsyncFunctionAwaitValueType,
  resolvePromiseExpressionValueType
} from './async/promises.ts'
import type { AsyncTaskLoweringDependencies } from './async/tasks.ts'
import type { CEmitContext, CFunctionContext } from './context.ts'
import {
  createFunctionContext,
  emitBoxedValueCleanup,
  emitBoxedValueDeclarations,
  emitCleanupReturn,
  emitErrorChannelDeclarations,
  emitEventLoopNextTimeExpression,
  emitEventLoopReference,
  emitEventLoopSleepUntilNextTimerLines,
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
  registerOwnedPromise,
  registerOwnedValue,
  restoreVariableScope,
  shouldEmitCleanupLabel
} from './context.ts'
import {
  emitClassMethodDeclaration as emitClassMethodDeclarationWithDependencies,
  emitClassMethodHead,
  emitFunctionDeclaration as emitFunctionDeclarationWithDependencies,
  emitFunctionHead,
  emitMainReturnExpression,
  emitMainWrapper as emitMainWrapperWithDependencies,
  reportUnsupportedCFunctionType,
  resolveFunctionDeclarationParams
} from './declarations.ts'
import { reportCJsGlobalDiagnostic } from './diagnostics.ts'
import { formatGeneratedC } from './format.ts'
import {
  cStringLiteral,
  emitCFunctionName,
  emitCObjectFunctionFieldName,
  escapeCString,
  utf8ByteLength
} from './identifiers.ts'
import {
  emitCModuleHeader as emitCModuleHeaderWithDependencies,
  emitCModuleSource as emitCModuleSourceWithDependencies
} from './module-emission.ts'
import type { CModuleFileEmitters } from './modules.ts'
import { emitCModuleFilesFromGraph as emitCModuleFilesFromGraphWithEmitters } from './modules.ts'
import { mathRuntimeMethodName } from './runtime-methods.ts'
import { emitRuntimeNullableValueCheck, emitRuntimeValueCheck } from './runtime-values.ts'
import type { BinaryLoweringDependencies } from './stdlib/binary.ts'
import {
  binaryRuntimeExpressionReturnType,
  emitPreparedBinaryNumberCallExpression,
  emitPreparedBinaryValueExpression,
  emitPreparedBytesIndexAssignment,
  emitPreparedBytesIndexExpression,
  emitPreparedBytesLengthExpression,
  isBinaryConstructorExpression,
  isBinaryRuntimeCall
} from './stdlib/binary.ts'
import type { ChildProcessLoweringDependencies } from './stdlib/child-process.ts'
import { cChildProcessRuntimeMethodName, emitPreparedChildProcessCallExpression } from './stdlib/child-process.ts'
import { isConsoleLog } from './stdlib/console.ts'
import type { CryptoLoweringDependencies } from './stdlib/crypto.ts'
import {
  cryptoRuntimeMethodName,
  emitCryptoHandleVariableDeclaration,
  emitCryptoHashVariableDeclaration,
  emitPreparedCryptoCallExpression,
  emitPreparedCryptoHashCallExpression,
  emitPreparedCryptoHmacCallExpression,
  emitPreparedCryptoNumberCallExpression
} from './stdlib/crypto.ts'
import { cDebugRuntimeMethodName } from './stdlib/debug.ts'
import type { DgramLoweringDependencies } from './stdlib/dgram.ts'
import {
  emitDgramAddressVariableDeclaration,
  emitDgramNumberVariableDeclaration,
  emitDgramSocketCallStatement,
  emitDgramSocketVariableDeclaration,
  emitPreparedDgramAddressPortExpression
} from './stdlib/dgram.ts'
import type { FetchLoweringDependencies } from './stdlib/fetch.ts'
import {
  cFetchRuntimeExpressionMethod,
  emitFetchHeadersBooleanVariableDeclaration,
  emitPreparedFetchCallExpression,
  emitPreparedFetchHeadersCallExpression,
  emitPreparedFetchInitOperand
} from './stdlib/fetch.ts'
import type { FsLoweringDependencies } from './stdlib/fs.ts'
import {
  cFsRuntimeConstantExpression,
  cFsRuntimeExpressionMethod,
  emitFsBooleanFlag,
  emitPreparedFsAccessModeExpression,
  emitPreparedFsCallExpression,
  emitPreparedFsStatsMethodExpression,
  emitPreparedFsSyncStatementExpression,
  emitPreparedFsSyncValueExpression
} from './stdlib/fs.ts'
import type { HttpLoweringDependencies } from './stdlib/http.ts'
import { emitHttpServerCallStatement, emitHttpServerVariableDeclaration } from './stdlib/http.ts'
import type { JsonDeclarationDependencies } from './stdlib/json.ts'
import {
  cJsonRuntimeCallName,
  emitJsonParseVariableDeclaration,
  emitPreparedJsonCallExpression,
  emitPreparedJsonScalarParseExpression
} from './stdlib/json.ts'
import type { NetLoweringDependencies } from './stdlib/net.ts'
import {
  emitNetAddressMemberVariableDeclaration,
  emitNetAddressVariableDeclaration,
  emitNetNumberVariableDeclaration,
  emitNetServerCallStatement,
  emitNetServerVariableDeclaration,
  emitNetSocketCallStatement,
  emitNetSocketVariableDeclaration,
  emitPreparedNetAddressPortExpression,
  resolveNetAddressStringMember
} from './stdlib/net.ts'
import {
  cOsRuntimeConstantName,
  cOsRuntimeMethodName,
  emitPreparedOsConstantExpression,
  emitPreparedOsStringCallExpression
} from './stdlib/os.ts'
import type { PathLoweringDependencies } from './stdlib/path.ts'
import {
  cPathRuntimeConstantName,
  cPathRuntimeMethodName,
  emitPreparedPathBooleanCallExpression,
  emitPreparedPathConstantExpression,
  emitPreparedPathObjectCallExpression,
  emitPreparedPathStringCallExpression
} from './stdlib/path.ts'
import type { ProcessLoweringDependencies } from './stdlib/process.ts'
import {
  cProcessRuntimeEnvName,
  cProcessRuntimeMethodName,
  cProcessRuntimePropertyName,
  cProcessRuntimePropertyValueType,
  emitPreparedProcessNumberExpression,
  emitPreparedProcessStringExpression,
  emitProcessExitCodeAssignment,
  emitProcessExitStatement
} from './stdlib/process.ts'
import { cTimeRuntimeCallName } from './stdlib/time.ts'
import type { TimerLoweringDependencies } from './stdlib/timers.ts'
import { emitPreparedTimerCallExpression, emitTimerVariableDeclaration } from './stdlib/timers.ts'
import type { UrlLoweringDependencies } from './stdlib/url.ts'
import {
  cUrlRuntimeMethodName,
  emitPreparedUrlObjectExpression,
  emitPreparedUrlSearchParamsCallExpression,
  emitPreparedUrlSearchParamsObjectExpression,
  emitPreparedUrlStringCallExpression,
  emitUrlObjectFieldAssignment
} from './stdlib/url.ts'
import { cUnsupportedExpressionCode, isCoalesceExpression } from './syntax.ts'
import type {
  CArrayElementInfo,
  CAsyncTaskWrapper,
  CClassInfo,
  CEmitOptions,
  CFunctionParam,
  CFunctionReturnMapType,
  CFunctionType,
  CKnownArrayElement,
  CKnownObjectField,
  CKnownObjectIndexField,
  CModuleEmitOptions,
  CModuleOutputFile,
  CModulePlan,
  CObjectAccessorReturnPath,
  CObjectShape,
  CObjectShapeField,
  CRuntimeArrowCallbackWrapper,
  CRuntimeArrowCapture,
  CPreparedCallArgs as PreparedCallArgs,
  CPreparedCallOptions as PreparedCallOptions,
  CPreparedExpression as PreparedExpression
} from './types.ts'
import { isReadonlyCObjectShapeField } from './types.ts'
import { emitCUnit as emitCUnitWithDependencies } from './unit.ts'
import {
  cRuntimeValueTag,
  isManagedRuntimeReturnType,
  isNullableScalarType,
  isOpaqueRuntimeValueType,
  isRuntimeNullableType
} from './value-types.ts'
import type { ArrayLoweringDependencies } from './values/arrays.ts'
import {
  emitArrayFilterVariableDeclaration,
  emitArrayMapVariableDeclaration,
  emitArraySliceVariableDeclaration,
  emitArraySortVariableDeclaration,
  emitPreparedArrayFilterCallExpression,
  emitPreparedArrayIncludesCallExpression,
  emitPreparedArrayJoinCallExpression,
  emitPreparedArrayLengthExpression,
  emitPreparedArrayMapCallExpression,
  emitPreparedArrayPopCallExpression,
  emitPreparedArrayPushCallExpression,
  emitPreparedArraySliceCallExpression,
  emitPreparedArraySortCallExpression,
  emitPreparedArrayUnshiftCallExpression,
  emitPreparedKnownArrayIndexValueExpression,
  emitPreparedRuntimeArrayIndexValue,
  emitPreparedRuntimeArrayIndexValueExpression,
  isArrayIncludesCall,
  isArrayJoinCall,
  isArrayLengthExpression,
  isArrayMethodCall,
  isArrayUnshiftCall,
  resolveForOfElementType,
  resolveKnownArrayIndex,
  resolveKnownArrayLength,
  resolveKnownForOfArray,
  resolveRuntimeArrayElementType,
  resolveRuntimeArrayIndex,
  resolveRuntimeForOfArray,
  updateKnownArrayElementValueType
} from './values/arrays.ts'
import type { ClassLoweringDependencies } from './values/classes.ts'
import {
  emitCClassObjectValueExpression,
  emitClassObjectVariableDeclaration,
  emitPreparedClassMethodCallExpression,
  isClassConstructorExpression
} from './values/classes.ts'
import type { CollectionLoweringDependencies } from './values/collections.ts'
import {
  collectionConstructorName,
  emitPreparedCollectionCallExpression,
  emitPreparedCollectionConstructorValueExpression,
  emitPreparedCollectionSizeExpression,
  emitPreparedMapIndexAssignment,
  emitPreparedMapIndexGetExpression,
  isCollectionConstructorExpression,
  resolveRuntimeForOfMap,
  resolveRuntimeForOfMapValues,
  resolveRuntimeForOfSet,
  resolveRuntimeMapType,
  resolveRuntimeSetElementType
} from './values/collections.ts'
import {
  emitCExpression as emitCExpressionWithDependencies,
  emitCValueExpression as emitCValueExpressionWithDependencies,
  emitCallExpression as emitCallExpressionWithDependencies,
  emitCallee as emitCalleeFromExpressions,
  emitPreparedCallArgs as emitPreparedCallArgsWithDependencies,
  emitPreparedCallExpression as emitPreparedCallExpressionWithDependencies,
  emitPreparedNumberExpression as emitPreparedNumberExpressionWithDependencies,
  emitPreparedRuntimeTruthinessExpression as emitPreparedRuntimeTruthinessExpressionWithDependencies,
  emitPreparedUpdateExpression as emitPreparedUpdateExpressionWithDependencies,
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
  isNullableRuntimeExpression,
  isNullableScalarRuntimeExpression,
  resolveNullableScalarConditionNarrowing
} from './values/nullable.ts'
import type { ObjectExpressionFieldDependencies, ObjectVariableDeclarationDependencies } from './values/objects.ts'
import {
  emitDynamicObjectFieldAssignment,
  emitObjectValueReference,
  emitObjectVariableDeclaration,
  emitPreparedDynamicObjectIndexValueExpression,
  emitPreparedDynamicObjectMemberValueExpression,
  emitPreparedKnownObjectIndexValueExpression,
  emitPreparedKnownObjectMemberValueExpression,
  emitPreparedObjectExpressionIndexValueExpression,
  emitPreparedObjectExpressionMemberValueExpression,
  emitPreparedObjectExpressionScalarIndexValueExpression,
  emitPreparedObjectExpressionScalarMemberValueExpression,
  isIndexAccessExpression,
  isMemberAccessExpression,
  registerObjectShape,
  resolveCObjectExpressionName,
  resolveKnownObjectIndex,
  resolveKnownObjectMember,
  updateKnownObjectMemberValueType
} from './values/objects.ts'
import type { StatementLoweringDependencies } from './values/statements.ts'
import {
  currentErrorTarget,
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
  registerRuntimeValueMetadata,
  reportCCollectionHashability
} from './values/statements.ts'
import type { StringLoweringDependencies } from './values/strings.ts'
import {
  canEmitStringBytesOperand,
  collectTemplatePlaceholderExpressions,
  cookTemplateLiteralText,
  emitCNumberConversionValueExpression,
  emitCNumberToStringValueExpression,
  emitCStringCaseValueExpression,
  emitCStringConcatValueExpression,
  emitCStringConversionValueExpression,
  emitCStringIndexValueExpression,
  emitCStringPadStartValueExpression,
  emitCStringSliceValueExpression,
  emitCStringSplitValueExpression,
  emitCStringTrimValueExpression,
  emitCTemplateLiteralValueExpression,
  emitPreparedStringBytesOperand,
  emitPreparedStringCharCodeAtExpression,
  emitPreparedStringCompareExpression,
  emitPreparedStringIndexCallExpression,
  emitPreparedStringLengthExpression,
  emitPreparedStringPredicateCall,
  emitStringExpression,
  isNumberConversionCall,
  isNumberToStringCall,
  isRuntimeProducedStringExpression,
  isStringCaseCall,
  isStringConcatExpression,
  isStringConversionCall,
  isStringPadStartCall,
  isStringPredicateCall,
  isStringSliceCall,
  isStringSplitCall,
  isStringTrimCall,
  resolveRuntimeStringReference
} from './values/strings.ts'
import { inferExpressionType as inferExpressionTypeWithDependencies } from './values/types.ts'
export type { CModuleOutputFile } from './types.ts'

type CSourceLocation = SourceLocation | null | undefined
type CDynamicObjectFieldNode = AnyNode
type CAccessorNode = CDynamicObjectFieldNode
type CObjectLiteralPropertyNode = {
  key: string
  loc?: SourceLocation
  value: AnyNode
}
type CStringMap = Map<string, string>
type CNameSet = Set<string>
type CKnownArrayIndexDeclaration = {
  name: string
  kind?: string
  loc?: SourceLocation
  shape?: CObjectShape | null
  arrayElementType?: string | null
  mapKeyType?: string | null
  mapValueType?: string | null
  setElementType?: string | null
}
type TempValueEmitter = (temp: string) => string
type RuntimeLogGetSource =
  | {
      kind: 'known-array'
      element: CKnownArrayElement
    }
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
  throwingFunctions: CNameSet
}

type CErrorConstructorParts = {
  message: AnyNode
  code: AnyNode
  cause: AnyNode
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

function debugMemoryStatsFieldAt(index: number): DebugMemoryStatsField {
  const fields: DebugMemoryStatsField[] = debugMemoryStatsFields

  return fields[index]
}

let objectVariableDeclarationDependencies = {} as ObjectVariableDeclarationDependencies
let objectExpressionFieldDependencies: ObjectExpressionFieldDependencies = {
  emitCValueExpression,
  emitPreparedStringBytesOperand,
  inferExpressionType
}
let jsonDeclarationDependencies = {} as JsonDeclarationDependencies
let timerLoweringDependencies = {} as TimerLoweringDependencies
let fetchLoweringDependencies = {} as FetchLoweringDependencies
let fsLoweringDependencies = {} as FsLoweringDependencies
let binaryLoweringDependencies = {} as BinaryLoweringDependencies
let childProcessLoweringDependencies = {} as ChildProcessLoweringDependencies
let pathLoweringDependencies = {} as PathLoweringDependencies
let processLoweringDependencies = {} as ProcessLoweringDependencies
let urlLoweringDependencies = {} as UrlLoweringDependencies
let promiseLoweringDependencies = {} as PromiseLoweringDependencies
let cryptoLoweringDependencies = {} as CryptoLoweringDependencies
let dgramLoweringDependencies = {} as DgramLoweringDependencies
let httpLoweringDependencies = {} as HttpLoweringDependencies
let netLoweringDependencies = {} as NetLoweringDependencies

const nullableLoweringDependencies: NullableLoweringDependencies = {
  emitCObjectLiteralValueExpression,
  emitCValueExpression,
  emitNullableFunctionValueExpression,
  emitNullableScalarValueExpression,
  inferExpressionType,
  isNumberConversionCall,
  resolveRuntimeCallbackCalleeType
}

const statementLoweringDependencies: StatementLoweringDependencies = {
  collectionConstructorName,
  emitArrayVariableDeclaration,
  emitArrayFilterVariableDeclaration,
  emitArrayMapVariableDeclaration,
  emitArraySortVariableDeclaration,
  emitBoxedObjectVariableDeclaration,
  emitCAwaitValueExpression,
  emitClassObjectVariableDeclaration,
  emitCExpression,
  emitCObjectLiteralValueExpression,
  emitCValueExpression,
  emitDgramAddressVariableDeclaration,
  emitDgramNumberVariableDeclaration: (statement: AnyNode, context: CFunctionContext) =>
    emitDgramNumberVariableDeclaration(statement, context),
  emitDgramSocketVariableDeclaration: (statement: AnyNode, context: CFunctionContext) =>
    emitDgramSocketVariableDeclaration(statement, context, dgramLoweringDependencies),
  emitDgramSocketCallStatement: (expression: AnyNode, context: CFunctionContext) =>
    emitDgramSocketCallStatement(expression, context, dgramLoweringDependencies),
  emitDynamicObjectMemberVariableDeclaration,
  emitDynamicObjectMemberAssignment,
  emitDynamicObjectFieldAssignment: (expression: CDynamicObjectFieldNode, context: CFunctionContext) =>
    emitDynamicObjectFieldAssignment(expression, context, objectExpressionFieldDependencies),
  emitErrorObjectVariableDeclaration,
  emitFailureStatement,
  emitFetchAbortControllerVariableDeclaration,
  emitFetchAbortControllerAbortStatement,
  emitFunctionPointerVariable,
  emitHttpServerVariableDeclaration,
  emitHttpServerCallStatement: (expression: AnyNode, context: CFunctionContext) =>
    emitHttpServerCallStatement(expression, context, httpLoweringDependencies),
  emitJsonParseVariableDeclaration: (statement: AnyNode, context: CFunctionContext) =>
    emitJsonParseVariableDeclaration(statement, context, jsonDeclarationDependencies),
  emitKnownArrayIndexAssignment,
  emitKnownArrayIndexVariableDeclaration,
  emitKnownObjectMemberAssignment,
  emitKnownObjectMemberVariableDeclaration,
  emitNetAddressMemberVariableDeclaration,
  emitNetAddressVariableDeclaration,
  emitNetNumberVariableDeclaration,
  emitNetServerCallStatement: (expression: AnyNode, context: CFunctionContext) =>
    emitNetServerCallStatement(expression, context, netLoweringDependencies),
  emitNetServerVariableDeclaration: (statement: AnyNode, context: CFunctionContext) =>
    emitNetServerVariableDeclaration(statement, context),
  emitNetSocketCallStatement: (expression: AnyNode, context: CFunctionContext) =>
    emitNetSocketCallStatement(expression, context, netLoweringDependencies),
  emitNetSocketVariableDeclaration: (statement: AnyNode, context: CFunctionContext) =>
    emitNetSocketVariableDeclaration(statement, context, netLoweringDependencies),
  emitNullableScalarValueExpression,
  emitNullableRuntimeValueAssignment,
  emitObjectVariableDeclaration: (statement: AnyNode, context: CFunctionContext) =>
    emitObjectVariableDeclaration(statement, context, objectVariableDeclarationDependencies),
  emitOptionalRuntimeCallbackCallExpression,
  emitArraySliceVariableDeclaration,
  emitPreparedArrayFilterCallExpression,
  emitPreparedArrayMapCallExpression,
  emitPreparedArrayPopCallExpression,
  emitPreparedArrayPushCallExpression,
  emitPreparedArraySliceCallExpression,
  emitPreparedArraySortCallExpression,
  emitPreparedArrayUnshiftCallExpression,
  emitPreparedAsyncFunctionPromiseCallExpression,
  emitPreparedBytesIndexAssignment: (expression: AnyNode, context: CFunctionContext) =>
    emitPreparedBytesIndexAssignment(expression, context, binaryLoweringDependencies),
  emitPreparedCallExpression,
  emitPreparedChildProcessCallExpression: (
    expression: AnyNode,
    context: CFunctionContext,
    options?: PreparedCallOptions
  ) => emitPreparedChildProcessCallExpression(expression, context, childProcessLoweringDependencies, options),
  emitPreparedClassMethodCallExpression,
  emitPreparedCollectionCallExpression,
  emitPreparedCryptoCallExpression: (expression: AnyNode, context: CFunctionContext, options?: PreparedCallOptions) =>
    emitPreparedCryptoCallExpression(expression, context, cryptoLoweringDependencies, options),
  emitPreparedCryptoHashCallExpression: (expression: AnyNode, context: CFunctionContext) =>
    emitPreparedCryptoHashCallExpression(expression, context, cryptoLoweringDependencies),
  emitPreparedCryptoHmacCallExpression: (expression: AnyNode, context: CFunctionContext) =>
    emitPreparedCryptoHmacCallExpression(expression, context, cryptoLoweringDependencies),
  emitPreparedCryptoNumberCallExpression: (expression: AnyNode, context: CFunctionContext) =>
    emitPreparedCryptoNumberCallExpression(expression, context, cryptoLoweringDependencies),
  emitPreparedDebugMemoryCallExpression,
  emitPreparedFetchCallExpression: (expression: AnyNode, context: CFunctionContext, options?: PreparedCallOptions) =>
    emitPreparedFetchCallExpression(expression, context, fetchLoweringDependencies, options),
  emitPreparedFetchHeadersCallExpression: (
    expression: AnyNode,
    context: CFunctionContext,
    options?: PreparedCallOptions
  ) => emitPreparedFetchHeadersCallExpression(expression, context, fetchLoweringDependencies, options),
  emitPreparedFsCallExpression: (expression: AnyNode, context: CFunctionContext, options?: PreparedCallOptions) =>
    emitPreparedFsCallExpression(expression, context, fsLoweringDependencies, options),
  emitPreparedFsSyncStatementExpression: (expression: AnyNode, context: CFunctionContext) =>
    emitPreparedFsSyncStatementExpression(expression, context, fsLoweringDependencies),
  emitPreparedMapIndexAssignment,
  emitPreparedNumberExpression,
  emitPreparedRuntimeTruthinessExpression: emitPreparedStatementRuntimeTruthinessExpression,
  emitPreparedPathObjectCallExpression: (
    expression: AnyNode,
    context: CFunctionContext,
    options?: PreparedCallOptions
  ) => emitPreparedPathObjectCallExpression(expression, context, pathLoweringDependencies, options),
  emitPreparedPromiseConstructorExpression: (
    expression: AnyNode,
    context: CFunctionContext,
    options?: PreparedCallOptions
  ) => emitPreparedPromiseConstructorExpression(expression, context, promiseLoweringDependencies, options),
  emitPreparedPromiseExpression: (expression: AnyNode, context: CFunctionContext, options?: PreparedCallOptions) =>
    emitPreparedPromiseExpression(expression, context, promiseLoweringDependencies, options),
  emitPreparedPromiseMethodExpression: (
    expression: AnyNode,
    context: CFunctionContext,
    options?: PreparedCallOptions
  ) => emitPreparedPromiseMethodExpression(expression, context, promiseLoweringDependencies, options),
  emitPreparedPromiseReturningCallExpression: (
    expression: AnyNode,
    context: CFunctionContext,
    options?: PreparedCallOptions
  ) => emitPreparedPromiseReturningCallExpression(expression, context, promiseLoweringDependencies, options),
  emitPreparedPromiseStaticExpression: (
    expression: AnyNode,
    context: CFunctionContext,
    options?: PreparedCallOptions
  ) => emitPreparedPromiseStaticExpression(expression, context, promiseLoweringDependencies, options),
  emitPreparedTimerCallExpression: (expression: AnyNode, context: CFunctionContext, options?: PreparedCallOptions) =>
    emitPreparedTimerCallExpression(expression, context, timerLoweringDependencies, options),
  emitPreparedUpdateExpression,
  emitPreparedUrlObjectExpression: (expression: AnyNode, context: CFunctionContext, options?: PreparedCallOptions) =>
    emitPreparedUrlObjectExpression(expression, context, urlLoweringDependencies, options),
  emitPreparedUrlSearchParamsObjectExpression: (
    expression: AnyNode,
    context: CFunctionContext,
    options?: PreparedCallOptions
  ) => emitPreparedUrlSearchParamsObjectExpression(expression, context, urlLoweringDependencies, options),
  emitProcessExitCodeAssignment: (expression: AnyNode, context: CFunctionContext) =>
    emitProcessExitCodeAssignment(expression, context, processLoweringDependencies),
  emitProcessExitStatement: (expression: AnyNode, context: CFunctionContext) =>
    emitProcessExitStatement(expression, context, processLoweringDependencies),
  emitPromiseConstructorSettlementCall: (expression: AnyNode, context: CFunctionContext) =>
    emitPromiseConstructorSettlementCall(expression, context, promiseLoweringDependencies),
  emitReference,
  emitModuleValueVariableAssignment,
  emitRuntimeCallbackVariableDeclaration,
  emitScalarVariableDeclaration,
  emitStatement,
  emitStringExpression,
  emitUrlObjectFieldAssignment: (expression: AnyNode, context: CFunctionContext) =>
    emitUrlObjectFieldAssignment(expression, context, urlLoweringDependencies),
  inferCatchBindingValueType,
  inferExpressionType,
  isArrayMethodCall,
  isBoxedRuntimeValueAssignment,
  isClassConstructorExpression,
  isConsoleLog,
  isCollectionConstructorExpression,
  isErrorConstructorExpression,
  isErrorValueExpression,
  isIndexAccessExpression,
  isDynamicRuntimeValueExpression: isStatementDynamicRuntimeValueExpression,
  isMemberAccessExpression,
  isNullableRuntimeValueAssignment,
  isRuntimeProducedStringExpression,
  registerErrorObjectShape,
  resolveForOfElementType,
  resolveKnownArrayIndex,
  resolveKnownForOfArray,
  resolveKnownObjectIndex,
  resolveKnownObjectMember,
  resolveNullableScalarConditionNarrowing,
  resolveRuntimeArrayIndex,
  resolveRuntimeForOfArray,
  resolveRuntimeForOfMap,
  resolveRuntimeForOfMapValues,
  resolveRuntimeStringReference,
  resolveRuntimeForOfSet,
  emitBoxedRuntimeValueAssignment,
  emitConsoleLogStatement
}

const classLoweringDependencies: ClassLoweringDependencies = {
  emitCFieldFlags,
  emitCValueExpression,
  emitPreparedCallArgs
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
  inferExpressionType,
  resolveFunctionValueType: (expression, context) => resolveFunctionValueType(expression, context as CFunctionContext)
}

jsonDeclarationDependencies = {
  emitCFieldFlags,
  emitCValueExpression,
  emitPreparedStringBytesOperand,
  inferExpressionType,
  registerObjectShape
}

timerLoweringDependencies = {
  emitPreparedNumberExpression,
  emitReference,
  emitRuntimeCallbackValue
}

fetchLoweringDependencies = {
  emitCValueExpression,
  emitPreparedStringBytesOperand,
  findObjectLiteralPropertyValue,
  inferExpressionType
}

fsLoweringDependencies = {
  emitCValueExpression,
  emitPreparedNumberExpression,
  emitPreparedStringBytesOperand,
  inferExpressionType
}

binaryLoweringDependencies = {
  emitCValueExpression,
  emitPreparedNumberExpression,
  emitPreparedStringBytesOperand,
  inferExpressionType
}

childProcessLoweringDependencies = {
  emitCValueExpression,
  registerObjectShape
}

pathLoweringDependencies = {
  emitCValueExpression,
  registerObjectShape
}

processLoweringDependencies = {
  emitPreparedNumberExpression
}

urlLoweringDependencies = {
  emitCValueExpression,
  emitPreparedStringBytesOperand,
  registerObjectShape
}

promiseLoweringDependencies = {
  emitCValueExpression,
  emitPreparedAsyncFunctionPromiseCallExpression,
  emitPreparedCallExpression,
  emitPreparedFetchCallExpression: (expression: AnyNode, context: CFunctionContext, options?: PreparedCallOptions) =>
    emitPreparedFetchCallExpression(expression, context, fetchLoweringDependencies, options),
  emitPreparedFsCallExpression: (expression: AnyNode, context: CFunctionContext, options?: PreparedCallOptions) =>
    emitPreparedFsCallExpression(expression, context, fsLoweringDependencies, options),
  emitRuntimeArrowCaptureStoreLines,
  emitStatementList: (statements, context) => emitStatementList(statements, context as CFunctionContext),
  inferExpressionType,
  inferRejectedValueType,
  isPromiseChainCallbackWrapperWithContext
}

const collectionLoweringDependencies: CollectionLoweringDependencies = {
  emitCValueExpression,
  inferExpressionType,
  isIndexAccessExpression,
  isMemberAccessExpression,
  reportCCollectionHashability,
  resolveKnownObjectIndex,
  resolveKnownObjectMember
}

const arrayLoweringDependencies: ArrayLoweringDependencies = {
  emitCArrayLiteralValueExpression,
  emitCStringSplitValueExpression,
  emitCValueExpression,
  emitPreparedStringBytesOperand,
  emitPreparedNumberExpression,
  inferExpressionType,
  isStringSplitCall,
  resolveKnownObjectIndex,
  resolveKnownObjectMember
}

const stringLoweringDependencies: StringLoweringDependencies = {
  canLowerCNullishCoalescingExpression,
  emitCallExpression,
  emitCValueExpression,
  emitObjectValueReference,
  emitPreparedObjectExpressionIndexValueExpression: (expression: AnyNode, context: CFunctionContext) =>
    emitPreparedObjectExpressionIndexValueExpression(expression, context, objectExpressionFieldDependencies),
  emitPreparedObjectExpressionMemberValueExpression: (expression: AnyNode, context: CFunctionContext) =>
    emitPreparedObjectExpressionMemberValueExpression(expression, context, objectExpressionFieldDependencies),
  emitPreparedNumberExpression,
  emitReference,
  inferExpressionType,
  isBoxedRuntimeStringName,
  isBoxedRuntimeStringReference,
  isMemberAccessExpression,
  resolveKnownObjectIndex,
  resolveKnownObjectMember,
  resolveNetAddressStringMember
}

cryptoLoweringDependencies = {
  cStringLiteralNode,
  emitCValueExpression,
  emitPreparedNumberExpression,
  emitPreparedStringBytesOperand,
  inferExpressionType
}

dgramLoweringDependencies = {
  emitPreparedNumberExpression,
  emitPreparedStringBytesOperand,
  emitReference,
  emitStatementList,
  findObjectLiteralPropertyValue,
  staticObjectBooleanPropertyValue,
  staticObjectStringPropertyValue
}

httpLoweringDependencies = {
  emitPreparedNumberExpression,
  emitStatementList
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
  emitRuntimeCallbackRuntimeValueReturnLines: (argument, context) =>
    emitRuntimeCallbackRuntimeValueReturnLines(argument, context as CFunctionContext),
  emitStatementList: (statements, context) => emitStatementList(statements, context as CFunctionContext),
  registerObjectShape,
  shouldEmitCleanupLabel
}

const promiseChainLoweringDependencies: PromiseChainLoweringDependencies = {
  callbackLoweringDependencies,
  collectArrowCaptures,
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
  emitRuntimeCallbackRuntimeValueReturnLines: (argument, context) =>
    emitRuntimeCallbackRuntimeValueReturnLines(argument, context as CFunctionContext),
  emitStatementList: (statements, context) => emitStatementList(statements, context as CFunctionContext),
  functionUsesExternalEventLoop,
  isPromiseChainCallbackWrapperWithContext
}

const asyncTaskLoweringDependencies: AsyncTaskLoweringDependencies = {
  createFunctionContext,
  emitCallee,
  emitCValueExpression,
  emitFunctionHead: (statement, context) => emitFunctionHead(statement, context as CFunctionContext),
  emitFsBooleanFlag,
  emitOwnedValueCleanup,
  emitOwnedValueDeclarations,
  emitPreparedCallArgs,
  emitPreparedCallExpression,
  emitPreparedFetchInitOperand: (expression: AnyNode, context: CFunctionContext) =>
    emitPreparedFetchInitOperand(expression, context, fetchLoweringDependencies),
  emitPreparedFsAccessModeExpression: (expression: AnyNode, context: CFunctionContext) =>
    emitPreparedFsAccessModeExpression(expression, context, fsLoweringDependencies),
  emitPreparedNumberExpression,
  emitPreparedStringBytesOperand,
  emitRuntimeArrowCaptureStoreLines,
  emitStatementList: (statements, context) => emitStatementList(statements, context as CFunctionContext),
  inferExpressionType,
  isIndexAccessExpression,
  isMemberAccessExpression,
  isRuntimeProducedStringExpression,
  isThrowingFunctionCallee: (callee, context) => isThrowingFunctionCallee(callee, context as CFunctionContext),
  isThrowingFunctionName,
  pushVariableScope,
  registerObjectShape,
  registerRuntimeValueMetadata: (name, valueType, declaration, expression, context) =>
    registerRuntimeValueMetadata(name, valueType, declaration, expression, context as CFunctionContext),
  resolveFunctionDeclarationParams,
  resolveFunctionParams: (callee, context) => resolveFunctionParams(callee, context as CFunctionContext),
  resolveKnownArrayIndex,
  resolveKnownObjectIndex,
  resolveKnownObjectMember,
  resolveRuntimeArrayElementType,
  resolveRuntimeArrayIndex,
  resolveRuntimeMapType,
  resolveRuntimeSetElementType,
  resolveRuntimeStringReference,
  restoreVariableScope
}

const declarationEmissionDependencies = {
  asyncTaskLoweringDependencies,
  emitStatementList
}

netLoweringDependencies = {
  createFunctionContext,
  emitConsoleLogStatement,
  emitPreparedNumberExpression,
  emitPreparedStringBytesOperand,
  emitStatementList,
  findObjectLiteralPropertyValue
}

const expressionTypeDependencies = {
  binaryRuntimeExpressionReturnType,
  cChildProcessRuntimeMethodName,
  cDebugRuntimeMethodName,
  cFetchRuntimeExpressionMethod,
  cFsRuntimeExpressionMethod,
  cJsonRuntimeCallName,
  cOsRuntimeConstantName,
  cOsRuntimeMethodName,
  cPathRuntimeConstantName,
  cPathRuntimeMethodName,
  cProcessRuntimeEnvName,
  cProcessRuntimeMethodName,
  cProcessRuntimePropertyName,
  cProcessRuntimePropertyValueType,
  cPromiseRuntimeCallName,
  cTimeRuntimeCallName,
  cUrlRuntimeMethodName,
  collectionConstructorName,
  cryptoRuntimeMethodName,
  emitPreparedNetAddressPortExpression,
  isArrayIsArrayCall,
  isArrayJoinCall,
  isArrayLengthExpression,
  isBinaryConstructorExpression,
  isBinaryRuntimeCall,
  isClassConstructorExpression,
  isErrorConstructorExpression,
  isFetchAbortControllerConstructorExpression,
  isIndexAccessExpression,
  isMemberAccessExpression,
  isNumberConversionCall,
  isNumberToStringCall,
  isPromiseConstructorExpression,
  isPromiseReturningFunctionCallee,
  isStringCaseCall,
  isStringConversionCall,
  isStringPadStartCall,
  isStringPredicateCall,
  isStringSliceCall,
  isStringSplitCall,
  isStringTrimCall,
  knownValueType,
  mathRuntimeMethodName,
  resolveKnownArrayIndex,
  resolveKnownArrayLength,
  resolveKnownObjectIndex,
  resolveKnownObjectMember,
  resolveNetAddressStringMember,
  resolvePromiseExpressionValueType,
  resolveRuntimeArrayIndex
}

function currentCExpressionErrorTarget(errorTargets: string[]): string {
  if (errorTargets.length === 0) {
    return ''
  }

  return errorTargets[errorTargets.length - 1]
}

const cCallExpressionDependencies = {
  currentErrorTarget: currentCExpressionErrorTarget,
  emitCExpression,
  emitCNumberConversionValueExpression,
  emitCObjectLiteralValueExpression,
  emitCValueExpression,
  emitFunctionPointerAdapter,
  emitFunctionValueExpression,
  emitNullableFunctionValueExpression,
  emitNullableScalarValueExpression,
  emitPreparedArrayFilterCallExpression,
  emitPreparedArrayJoinCallExpression,
  emitPreparedArrayMapCallExpression,
  emitPreparedArrayPopCallExpression,
  emitPreparedArraySliceCallExpression,
  emitPreparedArraySortCallExpression,
  emitPreparedClassMethodCallExpression,
  emitPreparedCollectionCallExpression,
  emitPreparedCryptoCallExpression: (expression: AnyNode, context: CFunctionContext) =>
    emitPreparedCryptoCallExpression(expression, context, cryptoLoweringDependencies),
  emitPreparedCryptoHashCallExpression: (expression: AnyNode, context: CFunctionContext) =>
    emitPreparedCryptoHashCallExpression(expression, context, cryptoLoweringDependencies),
  emitPreparedCryptoHmacCallExpression: (expression: AnyNode, context: CFunctionContext) =>
    emitPreparedCryptoHmacCallExpression(expression, context, cryptoLoweringDependencies),
  emitPreparedFetchHeadersCallExpression: (expression: AnyNode, context: CFunctionContext) =>
    emitPreparedFetchHeadersCallExpression(expression, context, fetchLoweringDependencies),
  emitPreparedFsCallExpression: (expression: AnyNode, context: CFunctionContext) =>
    emitPreparedFsCallExpression(expression, context, fsLoweringDependencies),
  emitPreparedFsStatsMethodExpression: (expression: AnyNode, context: CFunctionContext) =>
    emitPreparedFsStatsMethodExpression(expression, context, fsLoweringDependencies),
  emitPreparedJsonCallExpression: (expression: AnyNode, context: CFunctionContext) =>
    emitPreparedJsonCallExpression(expression, context, jsonDeclarationDependencies, null),
  emitPreparedNumberExpression,
  emitPreparedPathBooleanCallExpression: (expression: AnyNode, context: CFunctionContext) =>
    emitPreparedPathBooleanCallExpression(expression, context, pathLoweringDependencies),
  emitPreparedPathStringCallExpression: (expression: AnyNode, context: CFunctionContext) =>
    emitPreparedPathStringCallExpression(expression, context, pathLoweringDependencies, null),
  emitPreparedPromiseMethodExpression: (expression: AnyNode, context: CFunctionContext) =>
    emitPreparedPromiseMethodExpression(expression, context, promiseLoweringDependencies),
  emitPreparedPromiseStaticExpression: (expression: AnyNode, context: CFunctionContext) =>
    emitPreparedPromiseStaticExpression(expression, context, promiseLoweringDependencies),
  emitPreparedTimerCallExpression: (expression: AnyNode, context: CFunctionContext, options?: PreparedCallOptions) =>
    emitPreparedTimerCallExpression(expression, context, timerLoweringDependencies, options),
  emitPreparedUrlSearchParamsCallExpression: (expression: AnyNode, context: CFunctionContext) =>
    emitPreparedUrlSearchParamsCallExpression(expression, context, urlLoweringDependencies),
  emitRuntimeCallbackCall,
  emitRuntimeCallbackValue,
  inferExpressionType,
  isExternalEventLoopFunctionCallee,
  isNullableFunctionType,
  isPromiseReturningFunctionCallee,
  registerErrorChannel,
  resolveFunctionValueType,
  resolveFunctionParams,
  resolveRuntimeCallbackCalleeType,
  resolveRuntimeFunctionArgumentType
}

const cScalarExpressionDependencies = {
  canEmitStringBytesOperand,
  cFsRuntimeConstantExpression,
  emitCAwaitValueExpression,
  emitCValueExpression,
  emitObjectValueReference,
  emitPreparedArrayLengthExpression,
  emitPreparedArrayIncludesCallExpression,
  emitPreparedArrayIsArrayCallExpression,
  emitPreparedArrayUnshiftCallExpression,
  emitPreparedBinaryNumberCallExpression: (expression: AnyNode, context: CFunctionContext) =>
    emitPreparedBinaryNumberCallExpression(expression, context, binaryLoweringDependencies),
  emitPreparedBytesIndexExpression: (expression: AnyNode, context: CFunctionContext) =>
    emitPreparedBytesIndexExpression(expression, context, binaryLoweringDependencies),
  emitPreparedBytesLengthExpression: (expression: AnyNode, context: CFunctionContext) =>
    emitPreparedBytesLengthExpression(expression, context, binaryLoweringDependencies),
  emitPreparedCallExpression,
  emitPreparedClassMethodCallExpression,
  emitPreparedCollectionCallExpression,
  emitPreparedCollectionSizeExpression,
  emitPreparedCryptoNumberCallExpression: (expression: AnyNode, context: CFunctionContext) =>
    emitPreparedCryptoNumberCallExpression(expression, context, cryptoLoweringDependencies),
  emitPreparedDgramAddressPortExpression,
  emitPreparedJsonScalarParseExpression: (expression: AnyNode, context: CFunctionContext) =>
    emitPreparedJsonScalarParseExpression(expression, context, jsonDeclarationDependencies),
  emitPreparedNetAddressPortExpression,
  emitPreparedNullableScalarRuntimeValueExpression,
  emitPreparedObjectExpressionScalarIndexValueExpression: (expression: AnyNode, context: CFunctionContext) =>
    emitPreparedObjectExpressionScalarIndexValueExpression(expression, context, objectExpressionFieldDependencies),
  emitPreparedObjectExpressionScalarMemberValueExpression: (expression: AnyNode, context: CFunctionContext) =>
    emitPreparedObjectExpressionScalarMemberValueExpression(expression, context, objectExpressionFieldDependencies),
  emitPreparedPathBooleanCallExpression: (expression: AnyNode, context: CFunctionContext) =>
    emitPreparedPathBooleanCallExpression(expression, context, pathLoweringDependencies),
  emitPreparedNumberExpression,
  emitPreparedProcessNumberExpression,
  emitPreparedRuntimeArrayIndexValue,
  emitPreparedStringCharCodeAtExpression,
  emitPreparedStringBytesOperand,
  emitPreparedStringCompareExpression,
  emitPreparedStringIndexCallExpression,
  emitPreparedStringLengthExpression,
  emitPreparedStringPredicateCall,
  emitPreparedUrlSearchParamsCallExpression: (expression: AnyNode, context: CFunctionContext) =>
    emitPreparedUrlSearchParamsCallExpression(expression, context, urlLoweringDependencies),
  emitReference,
  emitStringExpression,
  inferExpressionType,
  isIndexAccessExpression,
  isMemberAccessExpression,
  isNullableRuntimeExpression,
  isNullableScalarRuntimeExpression,
  isStringPredicateCall,
  reportCJsGlobalDiagnostic,
  resolveKnownArrayIndex,
  resolveKnownObjectIndex,
  resolveKnownObjectMember,
  resolveRuntimeArrayIndex
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
  emitCErrorObjectValueExpression,
  emitCNullishCoalescingValueExpression,
  emitCNumberConversionValueExpression,
  emitCNumberToStringValueExpression,
  emitCObjectLiteralValueExpression,
  emitCOptionalIndexValueExpression,
  emitCOptionalMemberValueExpression,
  emitCStringCaseValueExpression,
  emitCStringConcatValueExpression,
  emitCStringConversionValueExpression,
  emitCStringIndexValueExpression,
  emitCStringPadStartValueExpression,
  emitCStringSliceValueExpression,
  emitCStringSplitValueExpression,
  emitCStringTrimValueExpression,
  emitCTemplateLiteralValueExpression,
  emitCValueExpression,
  emitOptionalRuntimeCallbackCallValueExpression,
  emitPreparedArrayPopCallExpression,
  emitPreparedArrayJoinCallExpression,
  emitPreparedArraySliceCallExpression,
  emitPreparedBinaryValueExpression: (expression: AnyNode, context: CFunctionContext) =>
    emitPreparedBinaryValueExpression(expression, context, binaryLoweringDependencies),
  emitPreparedCallExpression,
  emitPreparedChildProcessCallExpression: (expression: AnyNode, context: CFunctionContext) =>
    emitPreparedChildProcessCallExpression(expression, context, childProcessLoweringDependencies),
  emitPreparedClassMethodCallExpression,
  emitPreparedCollectionCallExpression,
  emitPreparedCollectionConstructorValueExpression,
  emitPreparedCollectionSizeExpression,
  emitPreparedCryptoCallExpression: (expression: AnyNode, context: CFunctionContext) =>
    emitPreparedCryptoCallExpression(expression, context, cryptoLoweringDependencies),
  emitPreparedDebugMemoryCallExpression,
  emitPreparedFetchHeadersCallExpression: (expression: AnyNode, context: CFunctionContext) =>
    emitPreparedFetchHeadersCallExpression(expression, context, fetchLoweringDependencies),
  emitPreparedFsSyncValueExpression: (expression: AnyNode, context: CFunctionContext) =>
    emitPreparedFsSyncValueExpression(expression, context, fsLoweringDependencies),
  emitPreparedJsonCallExpression: (expression: AnyNode, context: CFunctionContext) =>
    emitPreparedJsonCallExpression(expression, context, jsonDeclarationDependencies, null),
  emitPreparedKnownArrayIndexValueExpression,
  emitPreparedKnownObjectIndexValueExpression,
  emitPreparedKnownObjectMemberValueExpression,
  emitPreparedMapIndexGetExpression,
  emitPreparedNullableScalarRuntimeValueExpression,
  emitPreparedObjectValuesCallExpression,
  emitPreparedNumberExpression,
  emitPreparedDynamicObjectIndexValueExpression: (expression: CDynamicObjectFieldNode, context: CFunctionContext) =>
    emitPreparedDynamicObjectIndexValueExpression(expression, context, objectExpressionFieldDependencies),
  emitPreparedDynamicObjectMemberValueExpression: (expression: CDynamicObjectFieldNode, context: CFunctionContext) =>
    emitPreparedDynamicObjectMemberValueExpression(expression, context, objectExpressionFieldDependencies),
  emitPreparedObjectExpressionIndexValueExpression: (expression: AnyNode, context: CFunctionContext) =>
    emitPreparedObjectExpressionIndexValueExpression(expression, context, objectExpressionFieldDependencies),
  emitPreparedObjectExpressionMemberValueExpression: (expression: AnyNode, context: CFunctionContext) =>
    emitPreparedObjectExpressionMemberValueExpression(expression, context, objectExpressionFieldDependencies),
  emitPreparedOsConstantExpression,
  emitPreparedOsStringCallExpression,
  emitPreparedPathConstantExpression,
  emitPreparedPathObjectCallExpression: (expression: AnyNode, context: CFunctionContext) =>
    emitPreparedPathObjectCallExpression(expression, context, pathLoweringDependencies, null),
  emitPreparedPathStringCallExpression: (expression: AnyNode, context: CFunctionContext) =>
    emitPreparedPathStringCallExpression(expression, context, pathLoweringDependencies, null),
  emitPreparedProcessStringExpression: (expression: AnyNode, context: CFunctionContext) =>
    emitPreparedProcessStringExpression(expression, context, processLoweringDependencies, null),
  emitPreparedRuntimeArrayIndexValueExpression,
  emitPreparedUrlObjectExpression: (expression: AnyNode, context: CFunctionContext) =>
    emitPreparedUrlObjectExpression(expression, context, urlLoweringDependencies),
  emitPreparedUrlSearchParamsCallExpression: (expression: AnyNode, context: CFunctionContext) =>
    emitPreparedUrlSearchParamsCallExpression(expression, context, urlLoweringDependencies),
  emitPreparedUrlSearchParamsObjectExpression: (expression: AnyNode, context: CFunctionContext) =>
    emitPreparedUrlSearchParamsObjectExpression(expression, context, urlLoweringDependencies),
  emitPreparedUrlStringCallExpression: (expression: AnyNode, context: CFunctionContext) =>
    emitPreparedUrlStringCallExpression(expression, context, urlLoweringDependencies),
  inferExpressionType,
  isBoxedRuntimeValueName,
  isClassConstructorExpression,
  isErrorConstructorExpression,
  isIndexAccessExpression,
  isMemberAccessExpression,
  isNullableRuntimeExpression,
  isNullableScalarRuntimeExpression,
  isStringCaseCall,
  isStringConcatExpression,
  isNumberToStringCall,
  isStringConversionCall,
  isStringPadStartCall,
  isStringSliceCall,
  isStringSplitCall,
  isStringTrimCall
}

const cUnitDependencies = {
  arrayLoweringDependencies,
  asyncTaskLoweringDependencies,
  callbackLoweringDependencies,
  classLoweringDependencies,
  collectExternalEventLoopFunctions,
  collectionLoweringDependencies,
  createBaseContext,
  dgramLoweringDependencies,
  emitClassMethodDeclaration: (info: CClassInfo, method: AnyNode, baseContext: CEmitContext) =>
    emitClassMethodDeclarationWithDependencies(info, method, baseContext, declarationEmissionDependencies),
  emitClassMethodHead,
  emitFunctionDeclaration: (statement: AnyNode, baseContext: CEmitContext) =>
    emitFunctionDeclarationWithDependencies(statement, baseContext, declarationEmissionDependencies),
  emitFunctionHead,
  emitMainWrapper: (irPrograms: IrProgram[], baseContext: CEmitContext) =>
    emitMainWrapperWithDependencies(irPrograms, baseContext, declarationEmissionDependencies),
  httpLoweringDependencies,
  netLoweringDependencies,
  nullableLoweringDependencies,
  promiseChainLoweringDependencies,
  statementLoweringDependencies,
  stringLoweringDependencies
}

const cModuleEmissionDependencies = {
  arrayLoweringDependencies,
  asyncTaskLoweringDependencies,
  callbackLoweringDependencies,
  classLoweringDependencies,
  collectExternalEventLoopFunctions,
  collectionLoweringDependencies,
  createBaseContext,
  dgramLoweringDependencies,
  emitClassMethodDeclaration: (info: CClassInfo, method: AnyNode, baseContext: CEmitContext) =>
    emitClassMethodDeclarationWithDependencies(info, method, baseContext, declarationEmissionDependencies),
  emitClassMethodHead,
  emitFunctionDeclaration: (statement: AnyNode, baseContext: CEmitContext) =>
    emitFunctionDeclarationWithDependencies(statement, baseContext, declarationEmissionDependencies),
  emitFunctionHead,
  emitMainReturnExpression,
  emitStatementList,
  httpLoweringDependencies,
  netLoweringDependencies,
  nullableLoweringDependencies,
  promiseChainLoweringDependencies,
  statementLoweringDependencies,
  stringLoweringDependencies
}

export function emitCFromIr(ir: IrProgram, options: CEmitOptions = {}): string {
  return formatGeneratedC(emitCUnit([ir], options, [ir]), 'inox.generated.c')
}

export function emitCBundleFromIrModules(
  irModules: IrModuleRecord[],
  entry: string,
  options: CEmitOptions = {}
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
    for (let index = 0; index <= entryIndex; index++) {
      entryModules.push(irModules[index])
    }
  }

  const entryIrPrograms = collectIrPrograms(entryModules)

  return formatGeneratedC(emitCUnit(irPrograms, options, entryIrPrograms), 'inox.bundle.c')
}

export function emitCModuleFilesFromGraph(graph: ModuleGraph, options: CModuleEmitOptions): CModuleOutputFile[] {
  const emitters: CModuleFileEmitters = {
    emitHeader: emitCModuleHeaderForGraph,
    emitSource: emitCModuleSourceForGraph
  }

  return emitCModuleFilesFromGraphWithEmitters(graph, options, emitters)
}

function emitCModuleHeaderForGraph(plan: CModulePlan, plans: CModulePlan[], diagnostics: Diagnostic[]): string {
  return emitCModuleHeaderWithDependencies(plan, plans, diagnostics, cModuleEmissionDependencies)
}

function emitCModuleSourceForGraph(
  plan: CModulePlan,
  plans: CModulePlan[],
  emitOptions: CModuleEmitOptions,
  diagnostics: Diagnostic[]
): string {
  return emitCModuleSourceWithDependencies(plan, plans, emitOptions, diagnostics, cModuleEmissionDependencies)
}

function emitCUnit(irPrograms: IrProgram[], options: CEmitOptions, entryIrPrograms: IrProgram[]): string {
  return emitCUnitWithDependencies(irPrograms, options, entryIrPrograms, cUnitDependencies)
}

function createThrowingFunctionInfo(
  functionDeclarations: IrFunctionDeclaration[],
  functionEffects: IrFunctionEffect[]
): CThrowingFunctionInfo {
  const functionThrowValueTypes: Map<string, IrThrowValueType[]> = new Map()
  const throwingFunctions: CNameSet = new Set()

  for (const item of functionDeclarations) {
    functionThrowValueTypes.set(item.name, [])
  }

  for (const effect of functionEffects) {
    if (!functionThrowValueTypes.has(effect.name)) {
      continue
    }

    functionThrowValueTypes.set(effect.name, effect.throwValueTypes)

    if (effect.name !== 'main' && effect.throws) {
      throwingFunctions.add(effect.name)
    }
  }

  return {
    functionThrowValueTypes,
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
  topLevelNodes: CAccessorNode[]
): CEmitContext {
  const throwing = createThrowingFunctionInfo(functionDeclarations, functionEffects)
  const functionNames: CStringMap = new Map()
  const functionParams: Map<string, CFunctionParam[]> = new Map()
  const functionReturnArrayElementTypes: Map<string, any> = new Map()
  const functionReturnArrayElementDeclaredTypes: Map<string, any> = new Map()
  const functionReturnDeclaredTypes: Map<string, any> = new Map()
  const functionReturnMapTypes: Map<string, CFunctionReturnMapType> = new Map()
  const functionReturnNullables: Map<string, boolean> = new Map()
  const functionReturnPromiseValueTypes: Map<string, any> = new Map()
  const functionReturnShapes: Map<string, any> = new Map()
  const functionReturnSetElementTypes: Map<string, any> = new Map()
  const functionReturnTypes: CStringMap = new Map()
  const functionAsyncFlags: Map<string, boolean> = new Map()
  const objectAccessorReturnPaths = collectObjectAccessorReturnPaths(topLevelNodes)
  const unhandledRejectionFlag: string | null = null

  for (const item of functionDeclarations) {
    let returnArrayElementType: string | null = null
    let returnArrayElementDeclaredType: string | null = null
    let returnPromiseValueType: string | null = null
    let returnShape: CObjectShape | null = null
    let returnSetElementType: string | null = null

    if (item.returnArrayElementType !== null && typeof item.returnArrayElementType !== 'undefined') {
      returnArrayElementType = item.returnArrayElementType
    }

    if (item.returnArrayElementDeclaredType !== null && typeof item.returnArrayElementDeclaredType !== 'undefined') {
      returnArrayElementDeclaredType = item.returnArrayElementDeclaredType
    }

    if (item.returnPromiseValueType !== null && typeof item.returnPromiseValueType !== 'undefined') {
      returnPromiseValueType = item.returnPromiseValueType
    }

    if (item.returnShape !== null && typeof item.returnShape !== 'undefined') {
      returnShape = item.returnShape
    }

    if (item.returnSetElementType !== null && typeof item.returnSetElementType !== 'undefined') {
      returnSetElementType = item.returnSetElementType
    }

    const returnMapType: CFunctionReturnMapType = {
      key: null,
      value: null
    }

    if (item.returnMapKeyType !== null && typeof item.returnMapKeyType !== 'undefined') {
      returnMapType.key = item.returnMapKeyType
    }

    if (item.returnMapValueType !== null && typeof item.returnMapValueType !== 'undefined') {
      returnMapType.value = item.returnMapValueType
    }

    functionNames.set(item.name, emitCFunctionName(item.name))
    functionParams.set(item.name, item.params as CFunctionParam[])
    functionReturnArrayElementTypes.set(item.name, returnArrayElementType)
    functionReturnArrayElementDeclaredTypes.set(item.name, returnArrayElementDeclaredType)
    functionReturnDeclaredTypes.set(item.name, item.declaredReturnType ?? null)
    functionReturnMapTypes.set(item.name, returnMapType)
    functionReturnNullables.set(item.name, item.returnNullable === true)
    functionReturnPromiseValueTypes.set(item.name, returnPromiseValueType)
    functionReturnShapes.set(item.name, returnShape)
    functionReturnSetElementTypes.set(item.name, returnSetElementType)
    functionReturnTypes.set(item.name, item.returnType)
    functionAsyncFlags.set(item.name, item.async === true)
  }

  const moduleObjectShapes = collectModuleObjectShapes(
    topLevelNodes,
    functionParams,
    functionReturnArrayElementTypes,
    functionReturnMapTypes,
    functionReturnNullables,
    functionReturnPromiseValueTypes,
    functionReturnSetElementTypes,
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
    collectionLoweringDependencies,
    arrayLoweringDependencies,
    stringLoweringDependencies,
    cryptoImportNames: new Set(),
    diagnostics,
    dgramCreateSocketNames: new Set(),
    dgramImportNames: new Set(),
    dgramMessageHandlers: new Map(),
    functionThrowValueTypes: throwing.functionThrowValueTypes,
    functionNames,
    functionParams,
    functionPointerAdapterNames: new Map(),
    functionPointerAdapters: [],
    functionReturnArrayElementTypes,
    functionReturnArrayElementDeclaredTypes,
    functionReturnDeclaredTypes,
    functionReturnMapTypes,
    functionReturnNullables,
    functionReturnPromiseValueTypes,
    functionReturnShapes,
    functionReturnSetElementTypes,
    functionReturnTypes,
    functionAsyncFlags,
    asyncTaskWrappers: new Map(),
    jsGlobalRoots,
    moduleValueNames: new Map(),
    objectAccessorReturnPaths,
    moduleObjectShapes,
    moduleValueTypes: new Map(),
    promiseChainArrowWrappers: new Map(),
    promiseChainWrappers: new Map(),
    processRuntime: false,
    httpCreateServerNames: new Set(),
    httpHandlers: new Map(),
    httpImportNames: new Set(),
    netConnectNames: new Set(),
    netCreateServerNames: new Set(),
    netHandlers: new Map(),
    netImportNames: new Set(),
    runtimeFunctionParams: new Map(),
    externalEventLoopFunctions: new Set(),
    throwingFunctions: throwing.throwingFunctions,
    unhandledRejectionFlag,
    nextId: 0
  }
}

function collectModuleObjectShapes(
  statements: CAccessorNode[],
  functionParams: Map<string, CFunctionParam[]>,
  functionReturnArrayElementTypes: Map<string, any>,
  functionReturnMapTypes: Map<string, CFunctionReturnMapType>,
  functionReturnNullables: Map<string, boolean>,
  functionReturnPromiseValueTypes: Map<string, any>,
  functionReturnSetElementTypes: Map<string, any>,
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

      if (
        statement.init !== null &&
        typeof statement.init !== 'undefined' &&
        statement.init.type === 'ObjectLiteral'
      ) {
        const fields = collectModuleObjectLiteralShapeFields(
          statement.init,
          functionParams,
          functionReturnArrayElementTypes,
          functionReturnMapTypes,
          functionReturnNullables,
          functionReturnPromiseValueTypes,
          functionReturnSetElementTypes,
          functionReturnShapes,
          functionReturnTypes
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
      statement.init !== null &&
      typeof statement.init !== 'undefined' &&
      statement.init.type === 'ObjectLiteral'
    ) {
      const fields = collectModuleObjectLiteralShapeFields(
        statement.init,
        functionParams,
        functionReturnArrayElementTypes,
        functionReturnMapTypes,
        functionReturnNullables,
        functionReturnPromiseValueTypes,
        functionReturnSetElementTypes,
        functionReturnShapes,
        functionReturnTypes
      )

      if (fields.length > 0) {
        registerModuleObjectShape(result, statement.name, fields)
      }

      continue
    }

    const assignmentName = moduleObjectAssignmentName(statement)

    if (assignmentName === null || typeof assignmentName === 'undefined') {
      continue
    }

    const expression = statement.expression

    if (expression.value.type !== 'ObjectLiteral') {
      continue
    }

    const fields = collectModuleObjectLiteralShapeFields(
      expression.value,
      functionParams,
      functionReturnArrayElementTypes,
      functionReturnMapTypes,
      functionReturnNullables,
      functionReturnPromiseValueTypes,
      functionReturnSetElementTypes,
      functionReturnShapes,
      functionReturnTypes
    )

    if (fields.length > 0) {
      registerModuleObjectShape(result, assignmentName, fields)
    }
  }

  return result
}

function moduleObjectAssignmentName(statement: CAccessorNode): string | null {
  if (
    statement.type !== 'ExpressionStatement' ||
    statement.expression === null ||
    typeof statement.expression === 'undefined'
  ) {
    return null
  }

  const expression = statement.expression

  if (expression.type !== 'AssignmentExpression') {
    return null
  }

  const target = expression.target

  if (target === null || typeof target === 'undefined' || target.type !== 'Reference' || target.path.length !== 1) {
    return null
  }

  if (
    expression.value === null ||
    typeof expression.value === 'undefined' ||
    expression.value.type !== 'ObjectLiteral'
  ) {
    return null
  }

  return joinStrings(target.path, '')
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

        if (shouldReplaceModuleObjectShapeField(existingField, field)) {
          existingField.valueType = field.valueType
          existingField.declaredType = field.declaredType
          existingField.functionType = field.functionType
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
  return isPlainFunctionPointerType(field.functionType) || isRuntimeFunctionType(field.functionType)
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

function collectModuleObjectLiteralShapeFields(
  expression: CAccessorNode,
  functionParams: Map<string, CFunctionParam[]>,
  functionReturnArrayElementTypes: Map<string, any>,
  functionReturnMapTypes: Map<string, CFunctionReturnMapType>,
  functionReturnNullables: Map<string, boolean>,
  functionReturnPromiseValueTypes: Map<string, any>,
  functionReturnSetElementTypes: Map<string, any>,
  functionReturnShapes: Map<string, any>,
  functionReturnTypes: CStringMap
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
    const functionType = resolveModuleObjectFunctionType(
      value,
      functionParams,
      functionReturnArrayElementTypes,
      functionReturnMapTypes,
      functionReturnNullables,
      functionReturnPromiseValueTypes,
      functionReturnSetElementTypes,
      functionReturnShapes,
      functionReturnTypes
    )

    if (functionType !== null && typeof functionType !== 'undefined') {
      const field: CObjectShapeField = {
        name: property.key,
        readonlyField: false,
        valueType: 'function',
        functionType
      }

      field.functionTypeOwnership = 'weak'
      fields.push(field)
      continue
    }

    if (value.type === 'ObjectLiteral') {
      const nestedFields = collectModuleObjectLiteralShapeFields(
        value,
        functionParams,
        functionReturnArrayElementTypes,
        functionReturnMapTypes,
        functionReturnNullables,
        functionReturnPromiseValueTypes,
        functionReturnSetElementTypes,
        functionReturnShapes,
        functionReturnTypes
      )

      if (nestedFields.length > 0) {
        fields.push({
          name: property.key,
          readonlyField: false,
          valueType: 'object',
          shape: { fields: nestedFields }
        })
      }
    }
  }

  return fields
}

function resolveModuleObjectFunctionType(
  expression: CAccessorNode,
  functionParams: Map<string, CFunctionParam[]>,
  functionReturnArrayElementTypes: Map<string, any>,
  functionReturnMapTypes: Map<string, CFunctionReturnMapType>,
  functionReturnNullables: Map<string, boolean>,
  functionReturnPromiseValueTypes: Map<string, any>,
  functionReturnSetElementTypes: Map<string, any>,
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

  const returnMapType = functionReturnMapTypes.get(name)
  let returnMapKeyType: string | null = null
  let returnMapValueType: string | null = null

  if (returnMapType !== null && typeof returnMapType !== 'undefined') {
    returnMapKeyType = returnMapType.key
    returnMapValueType = returnMapType.value
  }

  return {
    kind: 'function',
    params,
    returnArrayElementType: functionReturnArrayElementTypes.get(name) ?? null,
    returnMapKeyType,
    returnMapValueType,
    returnNullable: functionReturnNullables.get(name) === true,
    returnPromiseValueType: functionReturnPromiseValueTypes.get(name) ?? null,
    returnSetElementType: functionReturnSetElementTypes.get(name) ?? null,
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
    returnArrayElementType: expression.returnArrayElementType ?? null,
    returnMapKeyType: expression.returnMapKeyType ?? null,
    returnMapValueType: expression.returnMapValueType ?? null,
    returnNullable: expression.returnNullable === true,
    returnPromiseValueType: expression.returnPromiseValueType ?? null,
    returnSetElementType: expression.returnSetElementType ?? null,
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

function collectExternalEventLoopFunctions(functions: AnyNode[]): CNameSet {
  const functionsByName: Map<string, AnyNode> = new Map()
  const names: CNameSet = new Set()
  let changed = true

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

      if (functionUsesExternalEventLoop(item, names)) {
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

  for (const property of properties) {
    if (property.key === key) {
      if (property.value !== null && typeof property.value !== 'undefined') {
        return property.value
      }

      return null
    }
  }

  return null
}

function staticObjectStringPropertyValue(expression: AnyNode, key: string): string | null {
  const value = findObjectLiteralPropertyValue(expression, key)

  if (value !== null && typeof value !== 'undefined' && value.type === 'StringLiteral') {
    return value.value
  }

  if (value !== null && typeof value !== 'undefined' && value.type === 'TemplateLiteral' && !value.raw.includes('${')) {
    return cookTemplateLiteralText(value.raw.slice(1, -1))
  }

  return null
}

function staticObjectBooleanPropertyValue(expression: AnyNode, key: string): boolean | null {
  const value = findObjectLiteralPropertyValue(expression, key)

  if (value !== null && typeof value !== 'undefined' && value.type === 'BooleanLiteral') {
    return value.value === true
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
  if (expression.type === 'Reference' && expression.path.length === 1) {
    const name = expression.path[0]
    const params = context.functionParams.get(name)
    const returnType = context.functionReturnTypes.get(name)

    if (params !== null && typeof params !== 'undefined' && returnType !== null && typeof returnType !== 'undefined') {
      const returnMapType = context.functionReturnMapTypes.get(name)
      let returnMapKeyType: string | null = null
      let returnMapValueType: string | null = null

      if (returnMapType !== null && typeof returnMapType !== 'undefined') {
        returnMapKeyType = returnMapType.key
        returnMapValueType = returnMapType.value
      }

      return {
        kind: 'function',
        params,
        returnArrayElementType: context.functionReturnArrayElementTypes.get(name) ?? null,
        returnMapKeyType,
        returnMapValueType,
        returnNullable: context.functionReturnNullables.get(name) === true,
        returnPromiseValueType: context.functionReturnPromiseValueTypes.get(name) ?? null,
        returnSetElementType: context.functionReturnSetElementTypes.get(name) ?? null,
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
    errorObjectNames: context.errorObjectNames,
    functionThrowValueTypes: context.functionThrowValueTypes
  }
  const localThrowTypes: IrThrowValueType[] = collectIrLocalThrowValueTypes(statement.block, throwOptions)

  for (const throwType of localThrowTypes) {
    types.push(throwType)
  }

  const localAwaitTypes: string[] = collectLocalAwaitRejectionValueTypes(statement.block, context)

  for (const awaitType of localAwaitTypes) {
    types.push(awaitType)
  }

  if (types.length === 0) {
    return 'string'
  }

  for (const valueType of types) {
    if (valueType !== 'error') {
      return 'string'
    }
  }

  return 'object'
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

function copyStringSet(source: CNameSet): CNameSet {
  return new Set(source)
}

function copyStringMap(source: CStringMap): CStringMap {
  return new Map(source)
}

function collectLocalAwaitRejectionValueTypes(node: unknown, context: CFunctionContext): string[] {
  return collectLocalAwaitRejectionValueTypesWithState(
    node,
    context,
    new Map(),
    copyStringSet(context.errorObjectNames)
  )
}

function pushLocalAwaitRejectionChildValueTypes(
  target: string[],
  value: unknown,
  context: CFunctionContext,
  localPromiseRejectionValueTypes: CStringMap,
  localErrorObjectNames: CNameSet
): void {
  if (value === null || typeof value === 'undefined') {
    return
  }

  pushAll(
    target,
    collectLocalAwaitRejectionValueTypesWithState(
      value,
      context,
      localPromiseRejectionValueTypes,
      localErrorObjectNames
    )
  )
}

function collectLocalAwaitRejectionValueTypesWithState(
  node: unknown,
  context: CFunctionContext,
  localPromiseRejectionValueTypes: CStringMap,
  localErrorObjectNames: CNameSet
): string[] {
  if (node === null || typeof node === 'undefined') {
    return []
  }

  if (typeof node !== 'object') {
    return []
  }

  if (Array.isArray(node)) {
    const types: string[] = []
    const items: AnyNode[] = node

    for (const item of items) {
      pushAll(
        types,
        collectLocalAwaitRejectionValueTypesWithState(
          item,
          context,
          localPromiseRejectionValueTypes,
          localErrorObjectNames
        )
      )
    }

    return types
  }

  const current = node as AnyNode

  if (current.type === 'BlockStatement') {
    return collectLocalAwaitRejectionValueTypesWithState(
      current.body,
      context,
      copyStringMap(localPromiseRejectionValueTypes),
      copyStringSet(localErrorObjectNames)
    )
  }

  if (current.type === 'VariableDeclaration') {
    const types = collectLocalAwaitRejectionValueTypesWithState(
      current.init,
      context,
      localPromiseRejectionValueTypes,
      localErrorObjectNames
    )

    if (isErrorConstructorExpression(current.init)) {
      localErrorObjectNames.add(current.name)
    }

    if (current.valueType === 'promise') {
      const rejectionValueType = inferPromiseRejectionValueType(
        current.init,
        context,
        localPromiseRejectionValueTypes,
        localErrorObjectNames
      )

      if (rejectionValueType !== 'unknown') {
        localPromiseRejectionValueTypes.set(current.name, rejectionValueType)
      }
    }

    return types
  }

  if (current.type === 'AwaitExpression') {
    const rejectionValueType = inferPromiseRejectionValueType(
      current.argument,
      context,
      localPromiseRejectionValueTypes,
      localErrorObjectNames
    )

    if (rejectionValueType === 'unknown') {
      return []
    }

    return [rejectionValueType]
  }

  const types: string[] = []

  pushLocalAwaitRejectionChildValueTypes(
    types,
    current.body,
    context,
    localPromiseRejectionValueTypes,
    localErrorObjectNames
  )
  pushLocalAwaitRejectionChildValueTypes(
    types,
    current.init,
    context,
    localPromiseRejectionValueTypes,
    localErrorObjectNames
  )
  pushLocalAwaitRejectionChildValueTypes(
    types,
    current.argument,
    context,
    localPromiseRejectionValueTypes,
    localErrorObjectNames
  )
  pushLocalAwaitRejectionChildValueTypes(
    types,
    current.args,
    context,
    localPromiseRejectionValueTypes,
    localErrorObjectNames
  )
  pushLocalAwaitRejectionChildValueTypes(
    types,
    current.callee,
    context,
    localPromiseRejectionValueTypes,
    localErrorObjectNames
  )
  pushLocalAwaitRejectionChildValueTypes(
    types,
    current.object,
    context,
    localPromiseRejectionValueTypes,
    localErrorObjectNames
  )
  pushLocalAwaitRejectionChildValueTypes(
    types,
    current.index,
    context,
    localPromiseRejectionValueTypes,
    localErrorObjectNames
  )
  pushLocalAwaitRejectionChildValueTypes(
    types,
    current.properties,
    context,
    localPromiseRejectionValueTypes,
    localErrorObjectNames
  )
  pushLocalAwaitRejectionChildValueTypes(
    types,
    current.value,
    context,
    localPromiseRejectionValueTypes,
    localErrorObjectNames
  )
  pushLocalAwaitRejectionChildValueTypes(
    types,
    current.left,
    context,
    localPromiseRejectionValueTypes,
    localErrorObjectNames
  )
  pushLocalAwaitRejectionChildValueTypes(
    types,
    current.right,
    context,
    localPromiseRejectionValueTypes,
    localErrorObjectNames
  )
  pushLocalAwaitRejectionChildValueTypes(
    types,
    current.consequent,
    context,
    localPromiseRejectionValueTypes,
    localErrorObjectNames
  )
  pushLocalAwaitRejectionChildValueTypes(
    types,
    current.alternate,
    context,
    localPromiseRejectionValueTypes,
    localErrorObjectNames
  )
  pushLocalAwaitRejectionChildValueTypes(
    types,
    current.test,
    context,
    localPromiseRejectionValueTypes,
    localErrorObjectNames
  )
  pushLocalAwaitRejectionChildValueTypes(
    types,
    current.update,
    context,
    localPromiseRejectionValueTypes,
    localErrorObjectNames
  )
  pushLocalAwaitRejectionChildValueTypes(
    types,
    current.iterable,
    context,
    localPromiseRejectionValueTypes,
    localErrorObjectNames
  )
  pushLocalAwaitRejectionChildValueTypes(
    types,
    current.cases,
    context,
    localPromiseRejectionValueTypes,
    localErrorObjectNames
  )
  pushLocalAwaitRejectionChildValueTypes(
    types,
    current.block,
    context,
    localPromiseRejectionValueTypes,
    localErrorObjectNames
  )
  pushLocalAwaitRejectionChildValueTypes(
    types,
    current.handler,
    context,
    localPromiseRejectionValueTypes,
    localErrorObjectNames
  )
  pushLocalAwaitRejectionChildValueTypes(
    types,
    current.finalizer,
    context,
    localPromiseRejectionValueTypes,
    localErrorObjectNames
  )
  pushLocalAwaitRejectionChildValueTypes(
    types,
    current.expression,
    context,
    localPromiseRejectionValueTypes,
    localErrorObjectNames
  )

  return types
}

function inferPromiseRejectionValueType(
  expression: AnyNode,
  context: CFunctionContext,
  localPromiseRejectionValueTypes: CStringMap,
  localErrorObjectNames: CNameSet
): string {
  if (expression.type === 'CallExpression' && cPromiseRuntimeCallName(expression.callee) === 'reject') {
    return inferRejectedValueTypeWithErrors(expression.args[0], context, localErrorObjectNames)
  }

  if (expression.type === 'CallExpression' && cFsRuntimeExpressionMethod(expression)) {
    return 'error'
  }

  if (expression.type === 'CallExpression' && cFetchRuntimeExpressionMethod(expression)) {
    return 'error'
  }

  if (expression.type === 'Reference' && expression.path.length === 1) {
    const name = expression.path[0]
    const localValueType = localPromiseRejectionValueTypes.get(name)

    if (localValueType !== null && typeof localValueType !== 'undefined') {
      return localValueType
    }

    const contextValueType = context.promiseRejectionValueTypes.get(name)

    if (contextValueType !== null && typeof contextValueType !== 'undefined') {
      return contextValueType
    }

    return 'unknown'
  }

  return 'unknown'
}

function inferRejectedValueType(expression: AnyNode, context: CFunctionContext): string {
  return inferRejectedValueTypeWithErrors(expression, context, context.errorObjectNames)
}

function inferRejectedValueTypeWithErrors(
  expression: AnyNode,
  context: CFunctionContext,
  localErrorObjectNames: CNameSet
): string {
  if (isKnownErrorValueExpression(expression, localErrorObjectNames)) {
    return 'error'
  }

  if (
    expression.type === 'StringLiteral' ||
    expression.type === 'TemplateLiteral' ||
    inferExpressionType(expression, context) === 'string'
  ) {
    return 'string'
  }

  return 'unknown'
}

function emitScalarVariableDeclaration(statement: AnyNode, context: CFunctionContext): string[] {
  if (statement.init === null || typeof statement.init === 'undefined') {
    return emitUninitializedScalarVariableDeclaration(statement, context)
  }

  if (statement.nullable === true && isRuntimeNullableType(statement.valueType)) {
    return emitNullableRuntimeValueVariableDeclaration(statement, context)
  }

  if (isErrorConstructorExpression(statement.init)) {
    return emitErrorObjectVariableDeclaration(statement, context)
  }

  const timerDeclaration = emitTimerVariableDeclaration(statement, context, timerLoweringDependencies)

  if (timerDeclaration !== null && typeof timerDeclaration !== 'undefined') {
    return timerDeclaration
  }

  const cryptoHashDeclaration = emitCryptoHashVariableDeclaration(statement, context, cryptoLoweringDependencies)

  if (cryptoHashDeclaration !== null && typeof cryptoHashDeclaration !== 'undefined') {
    return cryptoHashDeclaration
  }

  const fetchHeadersBooleanDeclaration = emitFetchHeadersBooleanVariableDeclaration(
    statement,
    context,
    fetchLoweringDependencies
  )

  if (fetchHeadersBooleanDeclaration !== null && typeof fetchHeadersBooleanDeclaration !== 'undefined') {
    return fetchHeadersBooleanDeclaration
  }

  const inferred = inferScalarDeclarationValueType(statement, context)
  context.variables.set(statement.name, inferred)

  const stringScalarDeclaration = emitStringScalarVariableDeclaration(statement, context, inferred)

  if (stringScalarDeclaration !== null && typeof stringScalarDeclaration !== 'undefined') {
    return stringScalarDeclaration
  }

  const functionScalarDeclaration = emitFunctionScalarVariableDeclaration(statement, context, inferred)

  if (functionScalarDeclaration !== null && typeof functionScalarDeclaration !== 'undefined') {
    return functionScalarDeclaration
  }

  if (
    isArrayMethodCall(statement.init) &&
    !isArrayIncludesCall(statement.init) &&
    !isArrayUnshiftCall(statement.init)
  ) {
    pushDiagnostic(
      context,
      diagnostic('INOX_C_ARRAY_METHOD', 'array methods are not supported by the current C backend slice', statement.loc)
    )
    return [`double ${statement.name} = 0;`]
  }

  const timerHandleDeclaration = emitTimerVariableDeclaration(statement, context, timerLoweringDependencies, inferred)

  if (timerHandleDeclaration !== null && typeof timerHandleDeclaration !== 'undefined') {
    return timerHandleDeclaration
  }

  const cryptoHandleDeclaration = emitCryptoHandleVariableDeclaration(
    statement,
    context,
    cryptoLoweringDependencies,
    inferred
  )

  if (cryptoHandleDeclaration !== null && typeof cryptoHandleDeclaration !== 'undefined') {
    return cryptoHandleDeclaration
  }

  return emitNumberBooleanScalarVariableDeclaration(statement, context, inferred)
}

function inferScalarDeclarationValueType(statement: CDynamicObjectFieldNode, context: CFunctionContext): string {
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
  const declared = knownValueType(statement.valueType)

  if (declared !== null && typeof declared !== 'undefined') {
    return declared
  }

  if (statement.init === null || typeof statement.init === 'undefined') {
    return 'unknown'
  }

  return inferExpressionType(statement.init, context)
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
    return [`${prefix}char* ${statement.name} = "";`]
  }

  if (isManagedRuntimeReturnType(inferred) || isOpaqueRuntimeValueType(inferred)) {
    registerOwnedValue(context, statement.name)
    return [`${prefix}inox_value ${statement.name} = inox_undefined_value();`]
  }

  if (inferred === 'promise') {
    return [`${prefix}inox_promise* ${statement.name} = 0;`]
  }

  if (inferred === 'timer') {
    return [`${prefix}inox_timer_handle* ${statement.name} = 0;`]
  }

  if (inferred === 'crypto-hash') {
    return [`${prefix}inox_crypto_hash* ${statement.name} = 0;`]
  }

  if (inferred === 'crypto-hmac') {
    return [`${prefix}inox_crypto_hmac* ${statement.name} = 0;`]
  }

  if (inferred === 'function') {
    return [`${prefix}void* ${statement.name} = 0;`]
  }

  return [`${prefix}double ${statement.name} = 0;`]
}

function emitModuleValueVariableAssignment(statement: AnyNode, context: CFunctionContext): string[] {
  const name = context.moduleValueNames.get(statement.name)

  if (name === null || typeof name === 'undefined') {
    return emitScalarVariableDeclaration(statement, context)
  }

  const inferred = inferModuleValueAssignmentType(statement, context)
  const moduleValueType = context.moduleValueTypes.get(statement.name) ?? inferred

  context.variables.set(statement.name, inferred)

  if (statement.init === null || typeof statement.init === 'undefined') {
    return [`${name} = ${moduleValueDefaultExpression(inferred)};`]
  }

  if (inferred === 'number' || inferred === 'boolean') {
    const value = emitPreparedNumberExpression(statement.init, context)
    const lines: string[] = []

    pushAll(lines, value.lines)
    lines.push(`${name} = ${value.expression};`)
    return lines
  }

  if (inferred === 'string') {
    if (moduleValueType === 'unknown' && statement.init.type === 'AwaitExpression') {
      const value = emitCValueExpression(statement.init, context)
      const lines: string[] = []

      context.variables.set(statement.name, 'unknown')
      context.moduleValueTypes.set(statement.name, 'unknown')
      registerOwnedValue(context, statement.name)
      pushAll(lines, value.lines)
      lines.push(`${name} = ${value.expression};`)
      lines.push(`inox_retain(${name});`)
      return lines
    }

    context.moduleValueTypes.set(statement.name, inferred)
    return [`${name} = ${emitStringExpression(statement.init, context)};`]
  }

  const value = emitCValueExpression(statement.init, context)
  const lines: string[] = []

  context.moduleValueTypes.set(statement.name, inferred)
  pushAll(lines, value.lines)
  pushAll(lines, emitModuleObjectFunctionFieldAssignments(statement.name, statement.init, context))
  lines.push(`${name} = ${value.expression};`)

  if (inferred === 'unknown' || isManagedRuntimeReturnType(inferred) || isOpaqueRuntimeValueType(inferred)) {
    lines.push(`inox_retain(${name});`)
  }

  return lines
}

function emitModuleObjectFunctionFieldAssignments(
  objectName: string,
  expression: AnyNode,
  context: CFunctionContext
): string[] {
  if (expression.type !== 'ObjectLiteral') {
    return []
  }

  const fields = context.objectShapes.get(objectName)

  if (fields === null || typeof fields === 'undefined') {
    return []
  }

  return emitModuleObjectFunctionFieldAssignmentsFromShape(objectName, expression, fields, context, [
    'CFunctionContext'
  ])
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

      if (isPlainFunctionPointerType(field.functionType)) {
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
          pushAll(lines, emitUndefinedRuntimeCallbackValueInto(fieldName))
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
        pushAll(lines, emitModuleObjectFunctionFieldDefaultAssignments(`${objectName}_${field.name}`, nestedFields))
      }

      if (pushedType) {
        seenTypes.pop()
      }
    }
  }

  return lines
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
      if (isPlainFunctionPointerType(field.functionType)) {
        lines.push(`${emitCObjectFunctionFieldName(objectName, field.name)} = 0;`)
      } else if (isRuntimeFunctionType(field.functionType)) {
        pushAll(lines, emitUndefinedRuntimeCallbackValueInto(emitCObjectFunctionFieldName(objectName, field.name)))
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
  const expectedTag = cRuntimeValueTag(context.variables.get(name))
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
  const temp = nextCName(context, 'inox_nullable_value')
  const lines: string[] = []
  const valueLines: string[] = value.lines

  for (const line of valueLines) {
    lines.push(line)
  }

  lines.push(`inox_value ${temp} = ${value.expression};`)

  const checkLines: string[] = emitRuntimeNullableValueCheck(temp, expectedTag, context)

  for (const line of checkLines) {
    lines.push(line)
  }

  lines.push(`inox_retain(${temp});`)
  lines.push(`inox_release(${name});`)
  lines.push(`${name} = ${temp};`)

  const narrowingLines: string[] = clearNullableScalarNarrowing(name, context)

  for (const line of narrowingLines) {
    lines.push(line)
  }

  return lines
}

function emitBoxedRuntimeValueAssignment(expression: AnyNode, context: CFunctionContext): string[] {
  const path: string[] = expression.target.path
  const name = path[0]
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

  lines.push(`inox_value ${temp} = ${value.expression};`)
  lines.push(emitRuntimeTypeCheck(`${temp}.tag != ${tag} || ${temp}.as.ref == 0`, context))
  lines.push(`inox_retain(${temp});`)
  lines.push(`inox_release(*${name});`)
  lines.push(`*${name} = ${temp};`)

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
  const shapeName = nextCName(context, `inox_shape_${statement.name}`)
  const fieldsName = `${shapeName}_fields`
  let fields: CObjectShapeField[] = []
  const shape: CObjectShape | null | undefined = statement.shape

  if (shape !== null && typeof shape !== 'undefined' && shape.fields !== null && typeof shape.fields !== 'undefined') {
    fields = shape.fields
  } else {
    const properties: CObjectLiteralPropertyNode[] = statement.init.properties

    for (const property of properties) {
      fields.push({
        name: property.key,
        readonlyField: false,
        valueType: inferExpressionType(property.value, context),
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
      valueType: field.valueType,
      arrayElementType: field.arrayElementType,
      mapKeyType: field.mapKeyType,
      mapValueType: field.mapValueType,
      setElementType: field.setElementType,
      shape: field.shape,
      functionType: field.functionType
    }

    objectShapeFields.push(objectShapeField)
  }

  context.objectShapes.set(statement.name, objectShapeFields)
  lines.push(`${statement.name} = inox_default_alloc(0, sizeof(inox_value), _Alignof(inox_value));`)
  lines.push(`if (${statement.name} == 0) ${emitFailureStatement(context)}`)
  lines.push(`*${statement.name} = inox_undefined_value();`)
  lines.push(emitStatusCheck(`inox_object_new(&inox_default_allocator, &${shapeName}, ${statement.name})`, context))
  const seenTypes: string[] = []

  if (statement.declaredType !== null && typeof statement.declaredType !== 'undefined') {
    seenTypes.push(statement.declaredType)
  }

  for (let index = 0; index < fields.length; index++) {
    const field = fields[index]
    const propertyValue = findObjectLiteralPropertyValue(statement.init, field.name)

    if (propertyValue === null || typeof propertyValue === 'undefined') {
      if (field.optional !== true) {
        pushDiagnostic(context, diagnostic('INOX_MISSING_FIELD', `missing field ${field.name}`, statement.loc))
      }
      continue
    }

    if (field.valueType === 'function') {
      const fieldName = emitCObjectFunctionFieldName(statement.name, field.name)

      if (!isPlainFunctionPointerType(field.functionType) && isRuntimeFunctionType(field.functionType)) {
        registerOwnedValue(context, fieldName)
        pushAll(lines, emitRuntimeCallbackValueInto(nodeOrEmpty(propertyValue), field.functionType, fieldName, context))
      } else {
        lines.push(
          `${emitFunctionPointerVariable(
            fieldName,
            nodeOrEmpty(propertyValue),
            context,
            true,
            field.functionType,
            propertyValue.loc,
            seenTypes
          )};`
        )
      }

      continue
    }

    const value = emitObjectFieldInitializerValue(field, nodeOrEmpty(propertyValue), context)

    for (const line of value.lines) {
      lines.push(line)
    }

    lines.push(emitStatusCheck(`inox_object_init_known(*${statement.name}, ${index}, ${value.expression})`, context))
  }

  return lines
}

function emitKnownObjectMemberVariableDeclaration(
  statement: AnyNode,
  member: CKnownObjectField,
  context: CFunctionContext
): string[] {
  const key = knownObjectMemberKey(member)

  return emitObjectMemberVariableDeclaration(
    statement,
    member,
    context,
    (temp: string) =>
      `inox_object_get(${emitObjectValueReference(member.objectName, context)}, ${cStringLiteral(key)}, ${utf8ByteLength(key)}, &${temp})`
  )
}

function emitDynamicObjectMemberVariableDeclaration(
  statement: AnyNode,
  member: CKnownObjectIndexField,
  context: CFunctionContext
): string[] {
  return emitObjectMemberVariableDeclaration(
    statement,
    member,
    context,
    (temp: string) =>
      `inox_object_get(${emitObjectValueReference(member.objectName, context)}, ${cStringLiteral(member.key)}, ${utf8ByteLength(member.key)}, &${temp})`
  )
}

function emitObjectMemberVariableDeclaration(
  statement: AnyNode,
  member: CKnownObjectField,
  context: CFunctionContext,
  emitGetCall: TempValueEmitter
): string[] {
  if (member.valueType === 'array') {
    return emitObjectArrayMemberVariableDeclaration(statement, member, context, emitGetCall)
  }

  if (member.valueType === 'map' || member.valueType === 'set') {
    return emitObjectCollectionMemberVariableDeclaration(statement, member, context, emitGetCall)
  }

  if (member.valueType === 'bytes') {
    return emitObjectBytesMemberVariableDeclaration(statement, member, context, emitGetCall)
  }

  if (member.valueType === 'object') {
    return emitObjectObjectMemberVariableDeclaration(statement, member, context, emitGetCall)
  }

  if (member.valueType === 'string') {
    return emitObjectStringMemberVariableDeclaration(statement, context, emitGetCall)
  }

  if (!isNullableScalarType(member.valueType)) {
    let message = 'this object field type is not supported by the current C backend slice'

    if (member.valueType === 'function') {
      message =
        'stored callback object fields need delayed closure lifetime support and are not supported by the current C backend slice'
    }

    pushDiagnostic(context, diagnostic(cUnsupportedExpressionCode(member.valueType), message, statement.loc))
    return [`double ${statement.name} = 0;`]
  }

  const temp = nextCName(context, 'inox_field')
  registerOwnedValue(context, temp)
  let constPrefix = ''
  let runtimeValueExpression = `${temp}.as.number`
  const lines: string[] = []

  if (statement.kind === 'const') {
    constPrefix = 'const '
  }

  if (member.valueType === 'boolean') {
    runtimeValueExpression = `${temp}.as.boolean ? 1 : 0`
  }

  pushAll(lines, emitPrepareOwnedValueWrite(temp))
  lines.push(emitStatusCheck(emitGetCall(temp), context))
  lines.push(`${constPrefix}double ${statement.name} = ${runtimeValueExpression};`)

  context.variables.set(statement.name, member.valueType)

  return lines
}

function emitObjectArrayMemberVariableDeclaration(
  statement: AnyNode,
  member: CKnownObjectField,
  context: CFunctionContext,
  emitGetCall: TempValueEmitter
): string[] {
  registerOwnedValue(context, statement.name)

  const lines: string[] = []

  pushAll(lines, emitPrepareOwnedValueWrite(statement.name))
  lines.push(emitStatusCheck(emitGetCall(statement.name), context))
  lines.push(emitRuntimeTypeCheck(`${statement.name}.tag != INOX_TAG_ARRAY || ${statement.name}.as.ref == 0`, context))

  context.variables.set(statement.name, 'array')
  let arrayElementType = 'unknown'
  const memberArrayElementType = member.arrayElementType

  if (memberArrayElementType !== null && typeof memberArrayElementType !== 'undefined') {
    arrayElementType = memberArrayElementType
  }

  context.runtimeArrayElementTypes.set(statement.name, arrayElementType)

  return lines
}

function emitObjectCollectionMemberVariableDeclaration(
  statement: AnyNode,
  member: CKnownObjectField,
  context: CFunctionContext,
  emitGetCall: TempValueEmitter
): string[] {
  registerOwnedValue(context, statement.name)

  let tag = 'INOX_TAG_SET'
  const lines: string[] = []

  if (member.valueType === 'map') {
    tag = 'INOX_TAG_MAP'
  }

  pushAll(lines, emitPrepareOwnedValueWrite(statement.name))
  lines.push(emitStatusCheck(emitGetCall(statement.name), context))
  lines.push(emitRuntimeTypeCheck(`${statement.name}.tag != ${tag} || ${statement.name}.as.ref == 0`, context))

  context.variables.set(statement.name, member.valueType)

  if (member.valueType === 'map') {
    let keyType = 'unknown'
    let valueType = 'unknown'

    const memberMapKeyType = member.mapKeyType
    const memberMapValueType = member.mapValueType

    if (memberMapKeyType !== null && typeof memberMapKeyType !== 'undefined') {
      keyType = memberMapKeyType
    }

    if (memberMapValueType !== null && typeof memberMapValueType !== 'undefined') {
      valueType = memberMapValueType
    }

    context.mapTypes.set(statement.name, {
      key: keyType,
      value: valueType
    })
  } else {
    let setElementType = 'unknown'
    const memberSetElementType = member.setElementType

    if (memberSetElementType !== null && typeof memberSetElementType !== 'undefined') {
      setElementType = memberSetElementType
    }

    context.setElementTypes.set(statement.name, setElementType)
  }

  return lines
}

function emitObjectBytesMemberVariableDeclaration(
  statement: AnyNode,
  member: CKnownObjectField,
  context: CFunctionContext,
  emitGetCall: TempValueEmitter
): string[] {
  registerOwnedValue(context, statement.name)
  const lines: string[] = []

  pushAll(lines, emitPrepareOwnedValueWrite(statement.name))
  lines.push(emitStatusCheck(emitGetCall(statement.name), context))
  lines.push(emitRuntimeTypeCheck(`${statement.name}.tag != INOX_TAG_BYTES || ${statement.name}.as.ref == 0`, context))

  context.variables.set(statement.name, member.valueType)

  return lines
}

function emitObjectObjectMemberVariableDeclaration(
  statement: AnyNode,
  member: CKnownObjectField,
  context: CFunctionContext,
  emitGetCall: TempValueEmitter
): string[] {
  registerOwnedValue(context, statement.name)
  const lines: string[] = []

  pushAll(lines, emitPrepareOwnedValueWrite(statement.name))
  lines.push(emitStatusCheck(emitGetCall(statement.name), context))
  lines.push(emitRuntimeTypeCheck(`${statement.name}.tag != INOX_TAG_OBJECT || ${statement.name}.as.ref == 0`, context))

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
  emitGetCall: TempValueEmitter
): string[] {
  const temp = nextCName(context, 'inox_field')
  let constPrefix = ''
  const lines: string[] = []

  registerOwnedValue(context, temp)

  if (statement.kind === 'const') {
    constPrefix = 'const '
  }

  pushAll(lines, emitPrepareOwnedValueWrite(temp))
  lines.push(emitStatusCheck(emitGetCall(temp), context))
  lines.push(emitRuntimeTypeCheck(`${temp}.tag != INOX_TAG_STRING || ${temp}.as.ref == 0`, context))
  lines.push(`${constPrefix}inox_string* ${statement.name} = (inox_string*)${temp}.as.ref;`)

  context.variables.set(statement.name, 'string')
  context.runtimeStrings.add(statement.name)

  return lines
}

function emitKnownObjectMemberAssignment(
  expression: AnyNode,
  member: CKnownObjectField,
  context: CFunctionContext
): string[] {
  const value = emitCValueExpression(expression.value, context)
  const valueType = inferExpressionType(expression.value, context)
  const lines: string[] = []

  updateKnownObjectMemberValueType(member, valueType, context)

  pushAll(lines, value.lines)
  const key = knownObjectMemberKey(member)
  lines.push(
    emitStatusCheck(
      `inox_object_set(${emitObjectValueReference(member.objectName, context)}, ${cStringLiteral(key)}, ${utf8ByteLength(key)}, ${value.expression})`,
      context
    )
  )

  return lines
}

function emitDynamicObjectMemberAssignment(
  expression: AnyNode,
  member: CKnownObjectIndexField,
  context: CFunctionContext
): string[] {
  const value = emitCValueExpression(expression.value, context)
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

function knownObjectMemberKey(member: CKnownObjectField): string {
  if (member.key !== null && typeof member.key !== 'undefined') {
    return member.key
  }

  return ''
}

function emitKnownArrayIndexVariableDeclaration(
  statement: CKnownArrayIndexDeclaration,
  element: CKnownArrayElement,
  context: CFunctionContext
): string[] {
  if (element.valueType === 'string') {
    return emitKnownArrayStringIndexVariableDeclaration(statement, element, context)
  }

  if (isManagedRuntimeReturnType(element.valueType)) {
    return emitKnownArrayRuntimeIndexVariableDeclaration(statement, element, context)
  }

  if (!isNullableScalarType(element.valueType)) {
    pushDiagnostic(
      context,
      diagnostic(
        cUnsupportedExpressionCode(element.valueType),
        unsupportedArrayElementMessage(element.valueType),
        statement.loc
      )
    )
    return [`double ${statement.name} = 0;`]
  }

  const temp = nextCName(context, 'inox_item')
  registerOwnedValue(context, temp)
  let constPrefix = ''
  let runtimeValueExpression = `${temp}.as.number`
  const lines: string[] = []

  if (statement.kind === 'const') {
    constPrefix = 'const '
  }

  if (element.valueType === 'boolean') {
    runtimeValueExpression = `${temp}.as.boolean ? 1 : 0`
  }

  pushAll(lines, emitPrepareOwnedValueWrite(temp))
  lines.push(emitStatusCheck(`inox_array_get(${element.arrayName}, ${element.index}, &${temp})`, context))
  lines.push(`${constPrefix}double ${statement.name} = ${runtimeValueExpression};`)

  context.variables.set(statement.name, element.valueType)

  return lines
}

function emitKnownArrayRuntimeIndexVariableDeclaration(
  statement: CKnownArrayIndexDeclaration,
  element: CKnownArrayElement,
  context: CFunctionContext
): string[] {
  const name = statement.name

  registerOwnedValue(context, name)
  const tag = cRuntimeValueTag(element.valueType)
  const lines: string[] = []

  pushAll(lines, emitPrepareOwnedValueWrite(name))
  lines.push(emitStatusCheck(`inox_array_get(${element.arrayName}, ${element.index}, &${name})`, context))

  if (tag !== null && typeof tag !== 'undefined') {
    lines.push(emitRuntimeTypeCheck(`${name}.tag != ${tag} || ${name}.as.ref == 0`, context))
  }

  context.variables.set(name, element.valueType)

  if (element.valueType === 'object' && statement.shape !== null && typeof statement.shape !== 'undefined') {
    registerObjectShape(context, name, statement.shape)
  } else if (element.valueType === 'array') {
    let arrayElementType = 'unknown'
    const statementArrayElementType = statement.arrayElementType

    if (statementArrayElementType !== null && typeof statementArrayElementType !== 'undefined') {
      arrayElementType = statementArrayElementType
    }

    context.runtimeArrayElementTypes.set(name, arrayElementType)
  } else if (element.valueType === 'map') {
    let keyType = 'unknown'
    let valueType = 'unknown'
    const statementMapKeyType = statement.mapKeyType
    const statementMapValueType = statement.mapValueType

    if (statementMapKeyType !== null && typeof statementMapKeyType !== 'undefined') {
      keyType = statementMapKeyType
    }

    if (statementMapValueType !== null && typeof statementMapValueType !== 'undefined') {
      valueType = statementMapValueType
    }

    context.mapTypes.set(name, {
      key: keyType,
      value: valueType
    })
  } else if (element.valueType === 'set') {
    let elementType = 'unknown'
    const statementSetElementType = statement.setElementType

    if (statementSetElementType !== null && typeof statementSetElementType !== 'undefined') {
      elementType = statementSetElementType
    }

    context.setElementTypes.set(name, elementType)
  }

  return lines
}

function emitKnownArrayStringIndexVariableDeclaration(
  statement: CKnownArrayIndexDeclaration,
  element: CKnownArrayElement,
  context: CFunctionContext
): string[] {
  const temp = nextCName(context, 'inox_item')
  let constPrefix = ''
  const lines: string[] = []

  registerOwnedValue(context, temp)

  if (statement.kind === 'const') {
    constPrefix = 'const '
  }

  pushAll(lines, emitPrepareOwnedValueWrite(temp))
  lines.push(emitStatusCheck(`inox_array_get(${element.arrayName}, ${element.index}, &${temp})`, context))
  lines.push(emitRuntimeTypeCheck(`${temp}.tag != INOX_TAG_STRING || ${temp}.as.ref == 0`, context))
  lines.push(`${constPrefix}inox_string* ${statement.name} = (inox_string*)${temp}.as.ref;`)

  context.variables.set(statement.name, 'string')
  context.runtimeStrings.add(statement.name)

  return lines
}

function emitKnownArrayIndexAssignment(
  expression: AnyNode,
  element: CKnownArrayElement,
  context: CFunctionContext
): string[] {
  const value = emitCValueExpression(expression.value, context)
  const valueType = inferExpressionType(expression.value, context)
  const lines: string[] = []

  updateKnownArrayElementValueType(element, valueType, context)

  pushAll(lines, value.lines)
  lines.push(emitStatusCheck(`inox_array_set(${element.arrayName}, ${element.index}, ${value.expression})`, context))

  return lines
}

function emitArrayVariableDeclaration(statement: AnyNode, context: CFunctionContext): string[] {
  const lines: string[] = []
  const shapes: CArrayElementInfo[] = []

  pushAll(lines, emitPrepareOwnedValueWrite(statement.name))
  lines.push(
    emitStatusCheck(
      `inox_array_new(&inox_default_allocator, ${statement.init.elements.length}, &${statement.name})`,
      context
    )
  )

  registerOwnedValue(context, statement.name)
  context.variables.set(statement.name, 'array')
  const elements: AnyNode[] = statement.init.elements

  for (const element of elements) {
    shapes.push({
      valueType: inferExpressionType(element, context)
    })
  }
  if (
    elements.length === 0 &&
    statement.arrayElementType !== null &&
    typeof statement.arrayElementType !== 'undefined' &&
    statement.arrayElementType !== 'unknown'
  ) {
    context.runtimeArrayElementTypes.set(statement.name, statement.arrayElementType)
  } else {
    context.arrayShapes.set(statement.name, shapes)
  }

  for (let index = 0; index < elements.length; index++) {
    const element: AnyNode = elements[index]
    const value = emitCValueExpression(element, context)

    pushAll(lines, value.lines)
    lines.push(emitStatusCheck(`inox_array_set(${statement.name}, ${index}, ${value.expression})`, context))
  }

  return lines
}

function unsupportedArrayElementMessage(valueType: string): string {
  if (valueType === 'function') {
    return 'stored callback array elements need delayed closure lifetime support and are not supported by the current C backend slice'
  }

  return 'this array element type is not supported by the current C backend slice'
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
    return 'stored callback object fields need delayed closure lifetime support and are not supported by the current C backend slice'
  }

  return 'this object field type is not supported by the current C backend slice'
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
    return {
      lines: [],
      expression: 'inox_undefined_value()'
    }
  }

  if (!isSupportedObjectFieldStorageType(field.valueType)) {
    return unsupportedObjectFieldValueExpression(field.valueType, propertyValue.loc, context)
  }

  return emitCValueExpression(propertyValue, context)
}

function emitCValueExpression(expression: AnyNode, context: CFunctionContext): PreparedExpression {
  return emitCValueExpressionWithDependencies(expression, context, cValueExpressionDependencies)
}

function emitNullableScalarValueExpression(expression: AnyNode, context: CFunctionContext): PreparedExpression {
  if (expression.type === 'NullLiteral') {
    return {
      lines: [],
      expression: 'inox_null_value()'
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

  if (valueType === 'string') {
    return emitCValueExpression(expression, context)
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

function emitPreparedNullableScalarRuntimeValueExpression(
  expression: AnyNode,
  context: CFunctionContext
): PreparedExpression {
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
        expression: name
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
    return emitOptionalRuntimeCallbackCallValueExpression(expression, context)
  }

  const fieldValue = emitPreparedNullableScalarFieldValueExpression(expression, context)

  if (fieldValue !== null && typeof fieldValue !== 'undefined') {
    return fieldValue
  }

  const numberConversion = emitCNumberConversionValueExpression(expression, context)

  if (numberConversion !== null && typeof numberConversion !== 'undefined') {
    return numberConversion
  }

  const mapIndexGet = emitPreparedMapIndexGetExpression(expression, context)

  if (mapIndexGet !== null && typeof mapIndexGet !== 'undefined') {
    return mapIndexGet
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
    pushAll(lines, emitPrepareOwnedValueWrite(temp))
    lines.push(`${temp} = ${call.expression};`)
    pushAll(lines, emitRuntimeNullableValueCheck(temp, expectedTag, context))

    return {
      lines,
      expression: temp
    }
  }

  pushDiagnostic(
    context,
    diagnostic(
      'INOX_C_NULLISH',
      'this nullable scalar expression is not supported by the current C backend slice',
      expression.loc
    )
  )

  return {
    lines: [],
    expression: 'inox_null_value()'
  }
}

function emitPreparedNullableScalarFieldValueExpression(
  expression: AnyNode,
  context: CFunctionContext
): PreparedExpression | null {
  if (expression.type === 'MemberExpression') {
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

    return emitPreparedRuntimeArrayIndexValueExpression(expression, context)
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
        expression: name
      }
    }
  }

  return emitRuntimeCallbackValue(expression, normalizeFunctionType(functionType), context)
}

function emitCArrayLiteralValueExpression(expression: AnyNode, context: CFunctionContext): PreparedExpression {
  const temp = nextCName(context, 'inox_array')
  const lines: string[] = []

  registerOwnedValue(context, temp)

  pushAll(lines, emitPrepareOwnedValueWrite(temp))
  lines.push(
    emitStatusCheck(`inox_array_new(&inox_default_allocator, ${expression.elements.length}, &${temp})`, context)
  )

  for (let index = 0; index < expression.elements.length; index++) {
    const element = expression.elements[index]
    const value = emitCValueExpression(element, context)

    pushAll(lines, value.lines)
    lines.push(emitStatusCheck(`inox_array_set(${temp}, ${index}, ${value.expression})`, context))
  }

  return {
    lines,
    expression: temp
  }
}

function emitCObjectLiteralValueExpression(
  expression: AnyNode,
  context: CFunctionContext,
  shape: CObjectShape | null = null
): PreparedExpression {
  const temp = nextCName(context, 'inox_object')
  const shapeName = nextCName(context, 'inox_shape_value')
  const fieldsName = `${shapeName}_fields`
  const fields = objectLiteralValueShapeFields(expression, context, shape)
  const lines = [`static const inox_field_info ${fieldsName}[] = {`]

  for (const field of fields) {
    lines.push(`  { ${cStringLiteral(field.name)}, ${emitCFieldFlags(field)} },`)
  }

  lines.push('};')
  lines.push(`static const inox_shape ${shapeName} = {`)
  lines.push(`  ${fields.length},`)
  lines.push(`  ${fieldsName}`)
  lines.push('};')
  registerOwnedValue(context, temp)
  pushAll(lines, emitPrepareOwnedValueWrite(temp))
  lines.push(emitStatusCheck(`inox_object_new(&inox_default_allocator, &${shapeName}, &${temp})`, context))

  for (let index = 0; index < fields.length; index++) {
    const field = fields[index]
    const propertyValue = findObjectLiteralPropertyValue(expression, field.name)

    if (propertyValue === null || typeof propertyValue === 'undefined') {
      if (field.optional !== true) {
        pushDiagnostic(context, diagnostic('INOX_MISSING_FIELD', `missing field ${field.name}`, expression.loc))
      }
      continue
    }

    if (field.valueType === 'function') {
      continue
    }

    const value = emitObjectFieldInitializerValue(field, nodeOrEmpty(propertyValue), context)

    pushAll(lines, value.lines)
    lines.push(emitStatusCheck(`inox_object_init_known(${temp}, ${index}, ${value.expression})`, context))
  }

  return {
    lines,
    expression: temp
  }
}

function objectLiteralValueShapeFields(
  expression: AnyNode,
  context: CFunctionContext,
  shape: CObjectShape | null | undefined
): CObjectShapeField[] {
  const fields: CObjectShapeField[] = []
  if (
    shape !== null &&
    typeof shape !== 'undefined' &&
    shape.builtin !== 'compiler.AnyNode' &&
    shape.fields !== null &&
    typeof shape.fields !== 'undefined' &&
    shape.fields.length > 0
  ) {
    for (const field of shape.fields) {
      fields.push(field)
    }

    if (shape.dynamic !== true) {
      return fields
    }
  }

  for (const property of expression.properties) {
    if (objectLiteralShapeFieldIndex(fields, property.key) !== -1) {
      continue
    }

    fields.push(objectLiteralPropertyShapeField(property, context, shape))
  }

  if (isCompilerAnyNodeObjectShape(shape) || isEmptyObjectShape(shape)) {
    appendCompilerAnyNodeFallbackShapeFields(fields)
  }

  return fields
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

function appendCompilerAnyNodeFallbackShapeFields(fields: CObjectShapeField[]): void {
  const stringFields = [
    'type',
    'name',
    'property',
    'operator',
    'declaredType',
    'valueType',
    'arrayElementType',
    'arrayElementDeclaredType',
    'mapKeyType',
    'mapValueType',
    'promiseValueType',
    'setElementType',
    'propertyValueType',
    'pathRuntimeMethod',
    'pathRuntimeConstant',
    'processRuntimeMethod',
    'processRuntimeProperty',
    'processRuntimeEnvName',
    'dgramMessageHandlerName',
    'urlRuntimeMethod',
    'urlRuntimeField',
    'httpHandlerName',
    'binaryRuntimeMethod',
    'bufferRuntimeConstant',
    'childProcessRuntimeMethod',
    'cryptoHashDigestEncoding',
    'cryptoRuntimeMethod',
    'debugRuntimeMethod',
    'fetchRuntimeMethod',
    'fsRuntimeConstant',
    'fsRuntimeMethod',
    'jsonRuntimeMethod',
    'mathRuntimeMethod',
    'osRuntimeConstant',
    'osRuntimeMethod',
    'objectRuntimeMethod',
    'stringRuntimeMethod',
    'timerRuntimeMethod',
    'numericCast',
    'returnType',
    'declaredReturnType',
    'returnArrayElementType',
    'returnMapKeyType',
    'returnMapValueType',
    'returnPromiseValueType',
    'returnSetElementType',
    'className',
    'collectionKind'
  ]
  const booleanFields = [
    'async',
    'exported',
    'expressionBody',
    'fsForce',
    'fsRecursive',
    'nullable',
    'optional',
    'readonly',
    'returnNullable',
    'typeOnly'
  ]
  const arrayFields = [
    'args',
    'cases',
    'elements',
    'fields',
    'methods',
    'params',
    'path',
    'properties',
    'specifiers'
  ]
  const objectFields = [
    'argument',
    'callee',
    'condition',
    'consequent',
    'alternate',
    'expression',
    'functionType',
    'handler',
    'index',
    'init',
    'left',
    'loc',
    'object',
    'right',
    'shape',
    'target'
  ]
  const unknownFields = ['body', 'raw', 'source', 'value']

  appendCompilerAnyNodeFallbackShapeFieldGroup(fields, stringFields, 'string')
  appendCompilerAnyNodeFallbackShapeFieldGroup(fields, booleanFields, 'boolean')
  appendCompilerAnyNodeFallbackShapeFieldGroup(fields, arrayFields, 'array')
  appendCompilerAnyNodeFallbackShapeFieldGroup(fields, objectFields, 'object')
  appendCompilerAnyNodeFallbackShapeFieldGroup(fields, unknownFields, 'unknown')
}

function appendCompilerAnyNodeFallbackShapeFieldGroup(
  fields: CObjectShapeField[],
  names: string[],
  valueType: string
): void {
  for (const name of names) {
    if (objectLiteralShapeFieldIndex(fields, name) !== -1) {
      continue
    }

    fields.push({
      name,
      optional: true,
      readonlyField: false,
      valueType
    })
  }
}

function objectLiteralPropertyShapeField(
  property: CObjectLiteralPropertyNode,
  context: CFunctionContext,
  shape: CObjectShape | null | undefined
): CObjectShapeField {
  let valueType = inferExpressionType(property.value, context)
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
    valueType,
    shape: propertyShape,
    functionType
  }
}

function objectLiteralShapeFieldIndex(fields: CObjectShapeField[], key: string): number {
  for (let index = 0; index < fields.length; index = index + 1) {
    if (fields[index].name === key) {
      return index
    }
  }

  return -1
}

function emitErrorObjectVariableDeclaration(statement: AnyNode, context: CFunctionContext): string[] {
  registerOwnedValue(context, statement.name)
  context.variables.set(statement.name, 'object')
  registerErrorObjectShape(context, statement.name)

  return emitCErrorObjectInitLines(statement.name, statement.init, context)
}

function emitCErrorObjectValueExpression(expression: AnyNode, context: CFunctionContext): PreparedExpression {
  const temp = nextCName(context, 'inox_error_object')
  registerOwnedValue(context, temp)

  return {
    lines: emitCErrorObjectInitLines(temp, expression, context),
    expression: temp
  }
}

function emitCErrorObjectInitLines(target: string, expression: AnyNode, context: CFunctionContext): string[] {
  const shapeName = nextCName(context, 'inox_shape_error')
  const fieldsName = `${shapeName}_fields`
  const parts = errorConstructorExpressions(expression, context)
  const name = emitCValueExpression(cStringLiteralNode('Error', expression.loc), context)
  const message = emitCValueExpression(parts.message, context)
  const code = emitCValueExpression(parts.code, context)
  const cause = emitCValueExpression(parts.cause, context)
  const lines: string[] = []

  lines.push(`static const inox_field_info ${fieldsName}[] = {`)
  lines.push(`  { ${cStringLiteral('name')}, INOX_FIELD_READONLY },`)
  lines.push(`  { ${cStringLiteral('message')}, INOX_FIELD_READONLY },`)
  lines.push(`  { ${cStringLiteral('code')}, INOX_FIELD_READONLY },`)
  lines.push(`  { ${cStringLiteral('cause')}, INOX_FIELD_READONLY },`)
  lines.push('};')
  lines.push(`static const inox_shape ${shapeName} = {`)
  lines.push('  4,')
  lines.push(`  ${fieldsName}`)
  lines.push('};')
  pushAll(lines, emitPrepareOwnedValueWrite(target))
  lines.push(emitStatusCheck(`inox_object_new(&inox_default_allocator, &${shapeName}, &${target})`, context))
  pushAll(lines, name.lines)
  lines.push(emitStatusCheck(`inox_object_init_known(${target}, 0, ${name.expression})`, context))
  pushAll(lines, message.lines)
  lines.push(emitStatusCheck(`inox_object_init_known(${target}, 1, ${message.expression})`, context))
  pushAll(lines, code.lines)
  lines.push(emitStatusCheck(`inox_object_init_known(${target}, 2, ${code.expression})`, context))
  pushAll(lines, cause.lines)
  lines.push(emitStatusCheck(`inox_object_init_known(${target}, 3, ${cause.expression})`, context))

  return lines
}

function errorConstructorExpressions(expression: AnyNode, context: CFunctionContext): CErrorConstructorParts {
  if (expression.args.length > 2) {
    pushDiagnostic(
      context,
      diagnostic(
        'INOX_ARG_COUNT',
        `Error constructor expects at most 2 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    )
  }

  let message: AnyNode = cStringLiteralNode('', expression.loc)
  const options: AnyNode | null | undefined = expression.args[1]
  let code: AnyNode = cStringLiteralNode('', expression.loc)
  let cause: AnyNode = cNullLiteralNode(expression.loc)

  const messageArg: AnyNode | null | undefined = expression.args[0]

  if (messageArg !== null && typeof messageArg !== 'undefined') {
    message = messageArg
  }

  if (inferExpressionType(message, context) !== 'string') {
    let loc: CSourceLocation = expression.loc

    if (message.loc !== null && typeof message.loc !== 'undefined') {
      loc = message.loc
    }

    pushDiagnostic(
      context,
      diagnostic('INOX_TYPE_MISMATCH', 'Error message must be a string in the current C backend slice', loc)
    )

    return {
      message: cStringLiteralNode('', expression.loc),
      code,
      cause
    }
  }

  if (options === null || typeof options === 'undefined') {
    return {
      message,
      code,
      cause
    }
  }

  if (options.type !== 'ObjectLiteral') {
    let loc: CSourceLocation = expression.loc

    if (options.loc !== null && typeof options.loc !== 'undefined') {
      loc = options.loc
    }

    pushDiagnostic(
      context,
      diagnostic('INOX_TYPE_MISMATCH', 'Error options must be an object literal in the current C backend slice', loc)
    )

    return {
      message,
      code,
      cause
    }
  }

  const properties: CObjectLiteralPropertyNode[] = options.properties

  for (const property of properties) {
    const propertyValue: AnyNode = property.value

    if (property.key === 'code') {
      if (inferExpressionType(propertyValue, context) !== 'string') {
        let loc: CSourceLocation = property.loc

        if (propertyValue.loc !== null && typeof propertyValue.loc !== 'undefined') {
          loc = propertyValue.loc
        }

        pushDiagnostic(
          context,
          diagnostic('INOX_TYPE_MISMATCH', 'Error code must be a string in the current C backend slice', loc)
        )
      } else {
        code = propertyValue
      }
    } else if (property.key === 'cause') {
      if (propertyValue.type === 'NullLiteral' || isErrorValueExpression(propertyValue, context)) {
        cause = propertyValue
      } else {
        let loc: CSourceLocation = property.loc

        if (propertyValue.loc !== null && typeof propertyValue.loc !== 'undefined') {
          loc = propertyValue.loc
        }

        pushDiagnostic(
          context,
          diagnostic(
            'INOX_TYPE_MISMATCH',
            'Error cause must be an Error object or null in the current C backend slice',
            loc
          )
        )
      }
    } else {
      let loc: CSourceLocation = options.loc

      if (property.loc !== null && typeof property.loc !== 'undefined') {
        loc = property.loc
      }

      pushDiagnostic(context, diagnostic('INOX_UNKNOWN_FIELD', `unknown Error option ${property.key}`, loc))
    }
  }

  return {
    message,
    code,
    cause
  }
}

function cStringLiteralNode(value: string, loc: CSourceLocation = null): AnyNode {
  return {
    type: 'StringLiteral',
    value,
    loc
  }
}

function cNullLiteralNode(loc: CSourceLocation = null): AnyNode {
  return {
    type: 'NullLiteral',
    loc
  }
}

function emitCNullishCoalescingValueExpression(expression: AnyNode, context: CFunctionContext): PreparedExpression {
  if (!canLowerCNullishCoalescingExpression(expression, context)) {
    pushDiagnostic(
      context,
      diagnostic('INOX_C_NULLISH', 'nullish coalescing is not supported by the current C backend slice', expression.loc)
    )

    return {
      lines: [],
      expression: 'inox_undefined_value()'
    }
  }

  const left = emitCValueExpression(expression.left, context)
  const right = emitCValueExpression(expression.right, context)
  const temp = nextCName(context, 'inox_value')
  const expectedTag = cRuntimeValueTag(inferExpressionType(expression, context))
  const lines: string[] = []
  registerOwnedValue(context, temp)

  pushAll(lines, left.lines)
  pushAll(lines, emitPrepareOwnedValueWrite(temp))
  lines.push(`if (${left.expression}.tag == INOX_TAG_NULL || ${left.expression}.tag == INOX_TAG_UNDEFINED) {`)
  pushIndented(lines, right.lines, '  ')
  lines.push(`  ${temp} = ${right.expression};`)
  pushIndented(lines, emitRuntimeNullableValueCheck(temp, expectedTag, context), '  ')
  lines.push(`  inox_retain(${temp});`)
  lines.push('} else {')
  lines.push(`  ${temp} = ${left.expression};`)
  pushIndented(lines, emitRuntimeNullableValueCheck(temp, expectedTag, context), '  ')
  lines.push(`  inox_retain(${temp});`)
  lines.push('}')

  return {
    lines,
    expression: temp
  }
}

type ConsoleLogValue = {
  lines: string[]
  format: string
  values: string[]
}

function emitConsoleLogStatement(method: string, args: AnyNode[], context: CFunctionContext): string[] {
  let stream = 'INOX_CONSOLE_STDOUT'

  if (method === 'warn' || method === 'error') {
    stream = 'INOX_CONSOLE_STDERR'
  }

  const isStdout = stream === 'INOX_CONSOLE_STDOUT'

  if (args.length === 0) {
    const emptyLines: string[] = []

    if (isStdout) {
      emptyLines.push('printf("\\n");')
    } else {
      emptyLines.push(`if (inox_console_printf(${stream}, "\\n") < 0) ${emitFailureStatement(context)}`)
    }

    return emptyLines
  }

  const lines: string[] = []
  const parts: string[] = []
  const values: string[] = []

  for (const arg of args) {
    const value = emitConsoleLogValue(arg, context)

    pushAll(lines, value.lines)
    parts.push(value.format)
    pushAll(values, value.values)
  }

  const format = escapeCString(joinStrings(parts, ' '))

  if (values.length === 0) {
    if (isStdout) {
      lines.push(`printf("${format}\\n");`)
    } else {
      lines.push(`if (inox_console_printf(${stream}, "${format}\\n") < 0) ${emitFailureStatement(context)}`)
    }
  } else {
    if (isStdout) {
      lines.push(`printf("${format}\\n", ${joinStrings(values, ', ')});`)
    } else {
      lines.push(
        `if (inox_console_printf(${stream}, "${format}\\n", ${joinStrings(values, ', ')}) < 0) ${emitFailureStatement(context)}`
      )
    }
  }

  return lines
}

function emitConsoleLogValue(expression: AnyNode, context: CFunctionContext): ConsoleLogValue {
  const valueType = inferExpressionType(expression, context)

  if (valueType === 'string') {
    return emitStringLogValue(expression, context)
  }

  if (valueType === 'number' || valueType === 'boolean') {
    return emitNumberLogValue(expression, context)
  }

  if (valueType === 'object' && isErrorValueExpression(expression, context)) {
    return emitRuntimeErrorLogValue(expression, context)
  }

  if (isRuntimeLogValueType(valueType)) {
    return emitRuntimeValueLogValue(expression, context)
  }

  if (valueType === 'unknown' && isOwnedRuntimeValueReference(expression, context)) {
    return emitRuntimeValueLogValue(expression, context)
  }

  pushDiagnostic(
    context,
    diagnostic(
      cUnsupportedExpressionCode(valueType),
      'this console.log argument is not supported by the current C backend slice',
      expression.loc
    )
  )

  return {
    lines: [],
    format: '%g',
    values: ['0']
  }
}

function isRuntimeLogValueType(valueType: string): boolean {
  return (
    valueType === 'array' ||
    valueType === 'bytes' ||
    valueType === 'function' ||
    valueType === 'map' ||
    valueType === 'object' ||
    valueType === 'set'
  )
}

function isOwnedRuntimeValueReference(expression: AnyNode, context: CFunctionContext): boolean {
  if (
    expression === null ||
    typeof expression === 'undefined' ||
    expression.type !== 'Reference' ||
    expression.path.length !== 1
  ) {
    return false
  }

  const name = expression.path[0]

  return context.variables.get(name) === 'unknown' && context.ownedValues.includes(name)
}

function emitRuntimeValueLogValue(expression: AnyNode, context: CFunctionContext): ConsoleLogValue {
  const value = emitCValueExpression(expression, context)
  const temp = nextCName(context, 'inox_log_value')
  const string = nextCName(context, 'inox_log_string')
  const lines: string[] = []

  registerOwnedValue(context, temp)
  pushAll(lines, value.lines)
  pushAll(lines, emitPrepareOwnedValueWrite(temp))
  lines.push(
    emitStatusCheck(`inox_console_format_value(&inox_default_allocator, ${value.expression}, &${temp})`, context)
  )
  lines.push(emitRuntimeTypeCheck(`${temp}.tag != INOX_TAG_STRING || ${temp}.as.ref == 0`, context))
  lines.push(`inox_string* ${string} = (inox_string*)${temp}.as.ref;`)

  return {
    lines,
    format: '%.*s',
    values: [`(int)${string}->len`, `${string}->bytes`]
  }
}

function emitStringLogValue(expression: AnyNode, context: CFunctionContext): ConsoleLogValue {
  if (expression !== null && typeof expression !== 'undefined' && expression.type === 'Reference') {
    const name = joinStrings(expression.path, '_')

    if (isBoxedRuntimeStringName(name, context)) {
      const string = nextCName(context, 'inox_log_string')

      return {
        lines: [
          emitRuntimeTypeCheck(`(*${name}).tag != INOX_TAG_STRING || (*${name}).as.ref == 0`, context),
          `inox_string* ${string} = (inox_string*)(*${name}).as.ref;`
        ],
        format: '%.*s',
        values: [`(int)${string}->len`, `${string}->bytes`]
      }
    }

    const reference = emitReference(expression, context)

    if (context.runtimeStrings.has(reference)) {
      return {
        lines: [],
        format: '%.*s',
        values: [`(int)${reference}->len`, `${reference}->bytes`]
      }
    }
  }

  if (isMemberAccessExpression(expression)) {
    const netAddressMember = resolveNetAddressStringMember(expression, context) ?? ''

    if (netAddressMember !== '') {
      return {
        lines: [],
        format: '%s',
        values: [netAddressMember]
      }
    }

    const member = resolveKnownObjectMember(expression, context)

    if (member !== null && typeof member !== 'undefined' && member.valueType === 'string') {
      return emitRuntimeStringLogValue({ kind: 'known-object', member }, context)
    }
  }

  if (isIndexAccessExpression(expression)) {
    const element = resolveKnownArrayIndex(expression, context)

    if (element !== null && typeof element !== 'undefined' && element.valueType === 'string') {
      return emitRuntimeStringLogValue({ kind: 'known-array', element }, context)
    }

    const field = resolveKnownObjectIndex(expression, context)

    if (field !== null && typeof field !== 'undefined' && field.valueType === 'string') {
      return emitRuntimeStringLogValue({ kind: 'known-object-index', field }, context)
    }

    const runtimeElement = resolveRuntimeArrayIndex(expression, context)

    if (runtimeElement !== null && typeof runtimeElement !== 'undefined' && runtimeElement.valueType === 'string') {
      const value = emitPreparedRuntimeArrayIndexValue(expression, runtimeElement, context, 'inox_log_value')
      const string = nextCName(context, 'inox_log_string')
      const lines: string[] = []

      pushAll(lines, value.lines)
      lines.push(
        emitRuntimeTypeCheck(`${value.expression}.tag != INOX_TAG_STRING || ${value.expression}.as.ref == 0`, context)
      )
      lines.push(`inox_string* ${string} = (inox_string*)${value.expression}.as.ref;`)

      return {
        lines,
        format: '%.*s',
        values: [`(int)${string}->len`, `${string}->bytes`]
      }
    }
  }

  if (isRuntimeProducedStringExpression(expression, context)) {
    const value = emitCValueExpression(expression, context)
    const string = nextCName(context, 'inox_log_string')
    const lines: string[] = []

    pushAll(lines, value.lines)
    lines.push(`inox_string* ${string} = (inox_string*)${value.expression}.as.ref;`)

    return {
      lines,
      format: '%.*s',
      values: [`(int)${string}->len`, `${string}->bytes`]
    }
  }

  if (isStringConcatExpression(expression, context)) {
    const value = emitCValueExpression(expression, context)
    const string = nextCName(context, 'inox_log_string')
    const lines: string[] = []

    pushAll(lines, value.lines)
    lines.push(`inox_string* ${string} = (inox_string*)${value.expression}.as.ref;`)

    return {
      lines,
      format: '%.*s',
      values: [`(int)${string}->len`, `${string}->bytes`]
    }
  }

  if (isCoalesceExpression(expression) && canLowerCNullishCoalescingExpression(expression, context)) {
    const value = emitCValueExpression(expression, context)
    const string = nextCName(context, 'inox_log_string')
    const lines: string[] = []

    pushAll(lines, value.lines)
    lines.push(
      emitRuntimeTypeCheck(`${value.expression}.tag != INOX_TAG_STRING || ${value.expression}.as.ref == 0`, context)
    )
    lines.push(`inox_string* ${string} = (inox_string*)${value.expression}.as.ref;`)

    return {
      lines,
      format: '%.*s',
      values: [`(int)${string}->len`, `${string}->bytes`]
    }
  }

  return {
    lines: [],
    format: '%s',
    values: [emitStringExpression(expression, context)]
  }
}

function emitNumberLogValue(expression: AnyNode, context: CFunctionContext): ConsoleLogValue {
  if (isMemberAccessExpression(expression)) {
    const stringLength = emitPreparedStringLengthExpression(expression, context)

    if (stringLength !== null && typeof stringLength !== 'undefined') {
      return {
        lines: stringLength.lines,
        format: '%g',
        values: [`((double)${stringLength.expression})`]
      }
    }

    let length: PreparedExpression | null = null

    if (expression.property === 'length') {
      length = emitPreparedArrayLengthExpression(expression, context)
    }

    if (length !== null && typeof length !== 'undefined') {
      return {
        lines: length.lines,
        format: '%g',
        values: [`((double)${length.expression})`]
      }
    }

    const member = resolveKnownObjectMember(expression, context)

    if (member !== null && typeof member !== 'undefined' && isNullableScalarType(member.valueType)) {
      return emitRuntimeNumberLogValue(member.valueType, { kind: 'known-object', member }, context)
    }
  }

  if (isIndexAccessExpression(expression)) {
    const element = resolveKnownArrayIndex(expression, context)

    if (element !== null && typeof element !== 'undefined' && isNullableScalarType(element.valueType)) {
      return emitRuntimeNumberLogValue(element.valueType, { kind: 'known-array', element }, context)
    }

    const field = resolveKnownObjectIndex(expression, context)

    if (field !== null && typeof field !== 'undefined' && isNullableScalarType(field.valueType)) {
      return emitRuntimeNumberLogValue(field.valueType, { kind: 'known-object-index', field }, context)
    }

    const runtimeElement = resolveRuntimeArrayIndex(expression, context)

    if (
      runtimeElement !== null &&
      typeof runtimeElement !== 'undefined' &&
      isNullableScalarType(runtimeElement.valueType)
    ) {
      const value = emitPreparedRuntimeArrayIndexValue(expression, runtimeElement, context, 'inox_log_value')
      let formattedValue = `${value.expression}.as.number`

      if (runtimeElement.valueType === 'boolean') {
        formattedValue = `((double)(${value.expression}.as.boolean ? 1 : 0))`
      }

      return {
        lines: value.lines,
        format: '%g',
        values: [formattedValue]
      }
    }
  }

  const value = emitPreparedNumberExpression(expression, context)

  return {
    lines: value.lines,
    format: '%g',
    values: [`((double)${value.expression})`]
  }
}

function emitRuntimeStringLogValue(source: RuntimeLogGetSource, context: CFunctionContext): ConsoleLogValue {
  const value = nextCName(context, 'inox_log_value')
  const string = nextCName(context, 'inox_log_string')
  const lines: string[] = []

  registerOwnedValue(context, value)

  pushAll(lines, emitPrepareOwnedValueWrite(value))
  lines.push(emitStatusCheck(emitRuntimeLogGetCall(source, value, context), context))
  lines.push(emitRuntimeTypeCheck(`${value}.tag != INOX_TAG_STRING || ${value}.as.ref == 0`, context))
  lines.push(`inox_string* ${string} = (inox_string*)${value}.as.ref;`)

  return {
    lines,
    format: '%.*s',
    values: [`(int)${string}->len`, `${string}->bytes`]
  }
}

function emitRuntimeNumberLogValue(
  valueType: string,
  source: RuntimeLogGetSource,
  context: CFunctionContext
): ConsoleLogValue {
  const value = nextCName(context, 'inox_log_value')
  const lines: string[] = []
  let formattedValue = `${value}.as.number`

  registerOwnedValue(context, value)

  if (valueType === 'boolean') {
    formattedValue = `((double)(${value}.as.boolean ? 1 : 0))`
  }

  pushAll(lines, emitPrepareOwnedValueWrite(value))
  lines.push(emitStatusCheck(emitRuntimeLogGetCall(source, value, context), context))

  return {
    lines,
    format: '%g',
    values: [formattedValue]
  }
}

function emitRuntimeLogGetCall(source: RuntimeLogGetSource, temp: string, context: CFunctionContext): string {
  if (source.kind === 'known-array') {
    return `inox_array_get(${source.element.arrayName}, ${source.element.index}, &${temp})`
  }

  if (source.kind === 'known-object-index') {
    const object = emitObjectValueReference(source.field.objectName, context)
    const key = cStringLiteral(source.field.key)
    const keyLength = utf8ByteLength(source.field.key)

    return `inox_object_get(${object}, ${key}, ${keyLength}, &${temp})`
  }

  const object = emitObjectValueReference(source.member.objectName, context)
  const key = knownObjectMemberKey(source.member)

  return `inox_object_get(${object}, ${cStringLiteral(key)}, ${utf8ByteLength(key)}, &${temp})`
}

function emitRuntimeErrorLogValue(expression: AnyNode, context: CFunctionContext): ConsoleLogValue {
  const object = emitErrorLogObjectExpression(expression, context)
  const nameValue = nextCName(context, 'inox_log_value')
  const messageValue = nextCName(context, 'inox_log_value')
  const nameString = nextCName(context, 'inox_log_string')
  const messageString = nextCName(context, 'inox_log_string')
  const lines: string[] = []

  registerOwnedValue(context, nameValue)
  registerOwnedValue(context, messageValue)

  pushAll(lines, object.lines)
  pushAll(lines, emitPrepareOwnedValueWrite(nameValue))
  pushAll(lines, emitPrepareOwnedValueWrite(messageValue))
  lines.push(emitStatusCheck(`inox_object_get_known(${object.expression}, 0, &${nameValue})`, context))
  lines.push(emitStatusCheck(`inox_object_get_known(${object.expression}, 1, &${messageValue})`, context))
  lines.push(emitRuntimeTypeCheck(`${nameValue}.tag != INOX_TAG_STRING || ${nameValue}.as.ref == 0`, context))
  lines.push(emitRuntimeTypeCheck(`${messageValue}.tag != INOX_TAG_STRING || ${messageValue}.as.ref == 0`, context))
  lines.push(`inox_string* ${nameString} = (inox_string*)${nameValue}.as.ref;`)
  lines.push(`inox_string* ${messageString} = (inox_string*)${messageValue}.as.ref;`)

  return {
    lines,
    format: '%.*s: %.*s',
    values: [`(int)${nameString}->len`, `${nameString}->bytes`, `(int)${messageString}->len`, `${messageString}->bytes`]
  }
}

function emitErrorLogObjectExpression(expression: AnyNode, context: CFunctionContext): PreparedExpression {
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

    if (context.variables.has(name)) {
      const moduleValueName = context.moduleValueNames.get(name)

      if (moduleValueName !== null && typeof moduleValueName !== 'undefined') {
        return moduleValueName
      }

      if (context.boxedVariables.has(name)) {
        return `(*${name})`
      }

      return name
    }

    const functionName = context.functionNames.get(name)

    if (functionName !== null && typeof functionName !== 'undefined') {
      return functionName
    }

    return name
  }

  pushDiagnostic(
    context,
    diagnostic(
      'INOX_C_ASSIGNMENT_TARGET',
      'this assignment target is not supported by the current C backend slice',
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

function emitFetchAbortControllerVariableDeclaration(statement: AnyNode, context: CFunctionContext): string[] | null {
  if (!isFetchAbortControllerConstructorExpression(statement.init)) {
    return null
  }

  registerOwnedValue(context, statement.name)
  context.variables.set(statement.name, 'object')
  registerObjectShape(context, statement.name, statement.shape)

  const lines: string[] = []

  pushAll(lines, emitPrepareOwnedValueWrite(statement.name))
  lines.push(emitStatusCheck(`inox_fetch_abort_controller_new(&inox_default_allocator, &${statement.name})`, context))

  return lines
}

function emitFetchAbortControllerAbortStatement(expression: AnyNode, context: CFunctionContext): string[] | null {
  if (cFetchRuntimeExpressionMethod(expression) !== 'abort') {
    return null
  }

  const controller = emitCValueExpression(expression.callee.object, context)
  const lines: string[] = []

  pushAll(lines, controller.lines)
  lines.push(
    emitRuntimeTypeCheck(
      `${controller.expression}.tag != INOX_TAG_OBJECT || ${controller.expression}.as.ref == 0`,
      context
    )
  )
  lines.push(emitStatusCheck(`inox_fetch_abort_controller_abort(${controller.expression})`, context))

  return lines
}

function emitPreparedDebugMemoryCallExpression(
  expression: AnyNode,
  context: CFunctionContext,
  options: PreparedCallOptions = {}
): PreparedExpression | null {
  if (cDebugRuntimeMethodName(expression) !== 'memory') {
    return null
  }

  if (options.discard === true) {
    return {
      lines: [],
      expression: ''
    }
  }

  const out = nextCName(context, 'inox_debug_memory')
  const stats = nextCName(context, 'inox_debug_stats')
  const shapeName = nextCName(context, 'inox_shape_debug_memory')
  const fieldsName = `${shapeName}_fields`
  const lines = [`static const inox_field_info ${fieldsName}[] = {`]
  const fields: DebugMemoryStatsField[] = debugMemoryStatsFields

  for (const field of fields) {
    lines.push(`  { ${cStringLiteral(field.name)}, INOX_FIELD_READONLY },`)
  }

  lines.push('};')
  lines.push(`static const inox_shape ${shapeName} = {`)
  lines.push(`  ${debugMemoryStatsFields.length},`)
  lines.push(`  ${fieldsName}`)
  lines.push('};')
  lines.push(`inox_debug_memory_stats ${stats};`)
  lines.push('inox_debug_memory_ensure_allocator();')
  lines.push(`inox_debug_memory_snapshot(&${stats});`)
  registerOwnedValue(context, out)
  pushAll(lines, emitPrepareOwnedValueWrite(out))
  lines.push(emitStatusCheck(`inox_object_new(&inox_default_allocator, &${shapeName}, &${out})`, context))

  for (let index = 0; index < debugMemoryStatsFields.length; index++) {
    const field = debugMemoryStatsFieldAt(index)

    lines.push(
      emitStatusCheck(
        `inox_object_init_known(${out}, ${index}, inox_number_value((inox_number)${stats}.${field.cField}))`,
        context
      )
    )
  }

  return {
    lines,
    expression: out
  }
}

function emitPreparedAsyncFunctionPromiseCallExpression(
  expression: AnyNode | null | undefined,
  context: CFunctionContext,
  options: PreparedCallOptions = {}
): PreparedExpression | null {
  if (
    expression === null ||
    typeof expression === 'undefined' ||
    expression.type !== 'CallExpression' ||
    !isAsyncFunctionCallee(expression.callee, context) ||
    expression.valueType !== 'promise'
  ) {
    return null
  }

  let valueType = 'unknown'
  const awaitedValueType = resolveCAsyncFunctionAwaitValueType(expression.callee, context) ?? ''

  if (awaitedValueType !== '') {
    valueType = awaitedValueType
  } else {
    const promiseValueType = expression.promiseValueType ?? ''

    if (promiseValueType !== '') {
      valueType = promiseValueType
    }
  }

  const taskCall = emitPreparedAsyncTaskPromiseCallExpression(expression, valueType, context, options)

  if (taskCall !== null && typeof taskCall !== 'undefined') {
    return taskCall
  }

  if (isThrowingFunctionCallee(expression.callee, context)) {
    return emitPreparedThrowingAsyncFunctionPromiseCallExpression(expression, valueType, context, options)
  }

  if (!isSupportedAsyncFunctionPromiseValueType(valueType)) {
    pushDiagnostic(
      context,
      diagnostic(
        'INOX_C_ASYNC',
        'async function calls as Promise values currently support only number, boolean, string, bytes, object, array, map, set and void values in C',
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

  let out = nextCName(context, 'inox_promise')

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
    registerOwnedPromise(context, out, valueType, 'unknown')
  }

  pushAll(lines, call.lines)

  if (managedValue !== null && typeof managedValue !== 'undefined') {
    pushAll(lines, emitPrepareOwnedValueWrite(managedValue))
    lines.push(`${managedValue} = ${call.expression};`)

    if (valueCheck !== '') {
      lines.push(valueCheck)
    }

    lines.push(emitStatusCheck(`inox_promise_resolved(${emitEventLoopReference(context)}, ${value}, &${out})`, context))
    pushAll(lines, emitPrepareOwnedValueWrite(managedValue))
  } else {
    lines.push(emitStatusCheck(`inox_promise_resolved(${emitEventLoopReference(context)}, ${value}, &${out})`, context))
  }

  return {
    lines,
    expression: out,
    valueType,
    rejectionValueType: 'unknown'
  }
}

function emitPreparedAsyncTaskPromiseCallExpression(
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
  const wrapper = context.asyncTaskWrappers.get(path[0])

  if (wrapper === null || typeof wrapper === 'undefined') {
    return null
  }

  registerEventLoop(context)

  let out = nextCName(context, 'inox_promise')

  if (options.out !== null && typeof options.out !== 'undefined') {
    out = options.out
  }

  const prepared = emitPreparedCallArgs(expression, asyncTaskWrapperFunctionParams(wrapper), context)
  const args: string[] = [emitEventLoopReference(context)]
  const rejectionValueType = resolveCFunctionRejectionValueType(expression.callee, context)
  const lines: string[] = []

  pushAll(args, prepared.args)
  args.push(`&${out}`)

  if (options.owned !== false) {
    registerOwnedPromise(context, out, valueType, rejectionValueType)
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

function emitPreparedThrowingAsyncFunctionPromiseCallExpression(
  expression: AnyNode,
  valueType: string,
  context: CFunctionContext,
  options: PreparedCallOptions = {}
): PreparedExpression | null {
  if (!isSupportedAsyncFunctionPromiseValueType(valueType)) {
    pushDiagnostic(
      context,
      diagnostic(
        'INOX_C_ASYNC',
        'throwing async function calls as Promise values currently support only number, boolean, string, bytes, object, array, map, set and void values in C',
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
        'this async function call is not supported as a Promise value in the current C backend slice',
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
  registerErrorChannel(context)

  let out = nextCName(context, 'inox_promise')

  if (options.out !== null && typeof options.out !== 'undefined') {
    out = options.out
  }

  const prepared = emitPreparedCallArgs(expression, callParams, context)
  let result: string | null = null
  if (valueType !== 'void') {
    result = nextCName(context, 'inox_async_result')
  }
  const managedResult = result !== null && typeof result !== 'undefined' && isManagedRuntimeReturnType(valueType)
  const status = nextCName(context, 'inox_async_status')
  const args: string[] = []
  const rejectionValueType = resolveCFunctionRejectionValueType(expression.callee, context)
  let fulfilledValue = 'inox_undefined_value()'
  let valueCheck = ''

  pushAll(args, prepared.args)

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

  if (result !== null && typeof result !== 'undefined') {
    args.push(`&${result}`)
  }

  args.push('&inox_error')

  if (options.owned !== false) {
    registerOwnedPromise(context, out, valueType, rejectionValueType)
  }

  if (managedResult && result !== null && typeof result !== 'undefined') {
    registerOwnedValue(context, result)
  }

  const resultPreparationLines: string[] = []
  if (result !== null && typeof result !== 'undefined') {
    if (managedResult) {
      pushAll(resultPreparationLines, emitPrepareOwnedValueWrite(result))
    } else {
      resultPreparationLines.push(`double ${result} = 0;`)
    }
  }

  const managedResultResetLines: string[] = []
  if (managedResult && result !== null && typeof result !== 'undefined') {
    const resetLines: string[] = emitPrepareOwnedValueWrite(result)

    for (const line of resetLines) {
      managedResultResetLines.push(`  ${line}`)
    }
  }

  const rejectedCall = `inox_promise_rejected(${emitEventLoopReference(context)}, inox_error, &${out})`
  const resolvedCall = `inox_promise_resolved(${emitEventLoopReference(context)}, ${fulfilledValue}, &${out})`
  const lines: string[] = []

  pushAll(lines, prepared.lines)
  pushAll(lines, emitPrepareOwnedValueWrite('inox_error'))
  pushAll(lines, resultPreparationLines)
  lines.push(`inox_status ${status} = ${emitCallee(expression.callee, context)}(${joinStrings(args, ', ')});`)
  lines.push(`if (${status} == INOX_ERR_THROW) {`)
  lines.push(`  ${emitStatusCheck(rejectedCall, context)}`)
  lines.push('  inox_release(inox_error);')
  lines.push('  inox_error = inox_undefined_value();')
  lines.push('} else {')
  lines.push(`  if (${status} != INOX_OK) ${emitFailureStatement(context)}`)

  if (valueCheck !== '') {
    lines.push(`  ${valueCheck}`)
  }

  lines.push(`  ${emitStatusCheck(resolvedCall, context)}`)
  pushAll(lines, managedResultResetLines)
  lines.push('}')

  return {
    lines,
    expression: out,
    valueType,
    rejectionValueType
  }
}

function isSupportedAsyncFunctionPromiseValueType(valueType: string): boolean {
  return (
    valueType === 'void' || valueType === 'number' || valueType === 'boolean' || isManagedRuntimeReturnType(valueType)
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

  if (types.length === 1 && types[0] === 'error') {
    return 'error'
  }

  if (types.length === 1 && types[0] === 'string') {
    return 'string'
  }

  return 'unknown'
}

function emitPreparedAwaitPromiseExpression(expression: AnyNode, context: CFunctionContext): PreparedExpression | null {
  const promiseExpression = emitPreparedPromiseExpression(expression, context, promiseLoweringDependencies)

  if (promiseExpression !== null && typeof promiseExpression !== 'undefined') {
    const valueType = firstKnownValueTypeOrUnknown(
      promiseExpression.valueType,
      expression.promiseValueType,
      resolvePromiseExpressionValueType(expression, context)
    )

    return {
      lines: promiseExpression.lines,
      expression: promiseExpression.expression,
      nullable: promiseExpression.nullable,
      rejectionValueType: promiseExpression.rejectionValueType,
      valueType
    }
  }

  return null
}

function emitCAwaitValueExpression(expression: AnyNode, context: CFunctionContext): PreparedExpression {
  const asyncCall = emitCAsyncFunctionAwaitExpression(expression, context)

  if (asyncCall !== null && typeof asyncCall !== 'undefined') {
    return asyncCall
  }

  const promise = emitPreparedAwaitPromiseExpression(expression.argument, context)

  if (promise === null || typeof promise === 'undefined') {
    if (inferExpressionType(expression.argument, context) !== 'promise') {
      return emitCValueExpression(expression.argument, context)
    }

    pushDiagnostic(
      context,
      diagnostic(
        'INOX_C_ASYNC',
        'this awaited promise expression is not supported by the current C backend slice',
        expression.loc
      )
    )

    return {
      lines: [],
      expression: 'inox_undefined_value()'
    }
  }

  const preparedPromise = preparedExpressionOrEmpty(promise)

  registerEventLoop(context)

  const valueType = firstKnownValueTypeOrUnknown(
    expression.valueType,
    preparedPromise.valueType,
    resolvePromiseExpressionValueType(expression.argument, context)
  )

  const value = nextCName(context, 'inox_await_value')
  const valueTag = cRuntimeValueTag(valueType)
  const valueCheck = emitRuntimeValueCheck(value, valueTag, context)
  const pollCall = `inox_loop_poll(${emitEventLoopReference(context)}, ${emitEventLoopNextTimeExpression()})`
  let rejectionValueType = 'unknown'
  const promiseRejectionValueType = preparedPromise.rejectionValueType ?? ''
  const lines: string[] = []

  if (promiseRejectionValueType !== '') {
    rejectionValueType = promiseRejectionValueType
  }

  registerOwnedValue(context, value)

  pushAll(lines, preparedPromise.lines)
  pushAll(lines, emitPrepareOwnedValueWrite(value))
  lines.push(
    `while (inox_promise_get_state(${preparedPromise.expression}) == INOX_PROMISE_PENDING && inox_loop_has_work(${emitEventLoopReference(context)})) {`
  )
  pushAll(lines, emitEventLoopSleepUntilNextTimerLines(context, '  '))
  lines.push(`  ${emitStatusCheck(pollCall, context)}`)
  lines.push('}')
  pushAll(lines, emitAwaitRejectedPromiseLines(preparedPromise.expression, rejectionValueType, context))
  lines.push(
    `if (inox_promise_get_state(${preparedPromise.expression}) != INOX_PROMISE_FULFILLED) ${emitFailureStatement(context)}`
  )
  lines.push(emitStatusCheck(`inox_promise_get_result(${preparedPromise.expression}, &${value})`, context))

  if (valueCheck !== '') {
    lines.push(valueCheck)
  }

  return {
    lines,
    expression: value
  }
}

function emitAwaitRejectedPromiseLines(
  promiseExpression: string,
  rejectionValueType: string,
  context: CFunctionContext
): string[] {
  const target = currentErrorTarget(context) ?? ''
  let rejectedTypeCheck = 'inox_error.tag != INOX_TAG_STRING || inox_error.as.ref == 0'

  if (rejectionValueType === 'error') {
    rejectedTypeCheck = 'inox_error.tag != INOX_TAG_OBJECT || inox_error.as.ref == 0'
  }

  if (target === '' && !context.throwingFunction) {
    const failureLines: string[] = []

    failureLines.push(
      `if (inox_promise_get_state(${promiseExpression}) == INOX_PROMISE_REJECTED) ${emitFailureStatement(context)}`
    )

    return failureLines
  }

  registerErrorChannel(context)
  const resultCall = `inox_promise_get_result(${promiseExpression}, &inox_error)`
  const lines: string[] = []

  lines.push(`if (inox_promise_get_state(${promiseExpression}) == INOX_PROMISE_REJECTED) {`)
  pushIndented(lines, emitPrepareOwnedValueWrite('inox_error'), '  ')
  lines.push(`  ${emitStatusCheck(resultCall, context)}`)
  lines.push(`  ${emitRuntimeTypeCheck(rejectedTypeCheck, context)}`)
  lines.push('  inox_error_active = 1;')

  if (target === '') {
    lines.push('  inox_status_result = INOX_ERR_THROW;')
    lines.push('  goto inox_cleanup;')
  } else {
    lines.push(`  goto ${target};`)
  }

  lines.push('}')

  return lines
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

    if (context.asyncTaskWrappers.has(path[0])) {
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
    lines.push(`${call.expression};`)

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
        'this async function return value is not supported by the current C backend slice',
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
  pushAll(lines, emitPrepareOwnedValueWrite(value))
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
        'capturing or unsupported inline callbacks are not supported by the current C backend slice; use a named function or a non-capturing inline callback with a supported signature',
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
    diagnostic('INOX_C_FUNCTION_VALUE', 'this function value is not supported by the current C backend slice', loc)
  )

  return '0'
}

function resolveRuntimeCallbackCalleeType(callee: AnyNode, context: CFunctionContext): CFunctionType | null {
  if (callee.type !== 'Reference' || callee.path.length !== 1) {
    return null
  }

  const name = callee.path[0]

  if (!context.runtimeCallbacks.has(name)) {
    return null
  }

  const functionType = context.functionTypes.get(name)

  if (isSupportedRuntimeCallbackType(functionType)) {
    return normalizeFunctionType(functionType)
  }

  return null
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
    const name = expression.path[0]
    const lines: string[] = []

    pushAll(lines, emitPrepareOwnedValueWrite(out))
    lines.push(`${out} = ${name};`)
    lines.push(`inox_retain(${out});`)

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
      return emitUndefinedRuntimeCallbackValueInto(out)
    }

    return emitRuntimeArrowCallbackValueInto(wrapper, out, context)
  }

  if (
    expression.type !== 'Reference' ||
    expression.path.length !== 1 ||
    !context.functionNames.has(expression.path[0])
  ) {
    const loc = expression.loc

    pushDiagnostic(
      context,
      diagnostic('INOX_C_FUNCTION_VALUE', 'runtime C callbacks currently require a named non-capturing function', loc)
    )
    return emitUndefinedRuntimeCallbackValueInto(out)
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
    return emitUndefinedRuntimeCallbackValueInto(out)
  }

  let callbackContext = '0'

  if (functionTakesEventLoopParam(functionName, context)) {
    callbackContext = emitEventLoopReference(context)
  }

  if (callbackContext !== '0') {
    registerEventLoop(context)
  }

  const lines: string[] = []

  pushAll(lines, emitPrepareOwnedValueWrite(out))
  lines.push(
    emitStatusCheck(
      `inox_callback_new(&inox_default_allocator, ${wrapper.name}, ${callbackContext}, 0, &${out})`,
      context
    )
  )

  return lines
}

function emitUndefinedRuntimeCallbackValueInto(out: string): string[] {
  const lines: string[] = []

  pushAll(lines, emitPrepareOwnedValueWrite(out))
  lines.push(`${out} = inox_undefined_value();`)

  return lines
}

function isSupportedRuntimeArrowCaptureValueType(valueType: string): boolean {
  return (
    isNullableScalarType(valueType) ||
    valueType === 'string' ||
    valueType === 'object' ||
    valueType === 'timer' ||
    valueType === 'promise-settlement'
  )
}

function emitRuntimeArrowCallbackValueInto(
  wrapper: CRuntimeArrowCallbackWrapper,
  out: string,
  context: CFunctionContext
): string[] {
  const lines: string[] = []

  pushAll(lines, emitPrepareOwnedValueWrite(out))

  for (const capture of wrapper.captures) {
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
          'capturing C callbacks currently support only const number/boolean/string/object/timer bindings and Promise resolve/reject handlers',
          wrapper.expression.loc
        )
      )
    }
  }

  if (!hasRuntimeArrowCallbackContext(wrapper)) {
    lines.push(emitStatusCheck(`inox_callback_new(&inox_default_allocator, ${wrapper.name}, 0, 0, &${out})`, context))
    return lines
  }

  const contextName = nextCName(context, 'inox_callback_ctx')

  lines.push(
    `${wrapper.contextTypeName}* ${contextName} = inox_default_alloc(0, sizeof(${wrapper.contextTypeName}), _Alignof(${wrapper.contextTypeName}));`
  )
  lines.push(`if (${contextName} == 0) ${emitFailureStatement(context)}`)

  if (wrapper.needsEventLoop === true) {
    registerEventLoop(context)
    lines.push(`${contextName}->inox_loop = ${emitEventLoopReference(context)};`)
  }

  for (const capture of wrapper.captures) {
    pushAll(lines, emitRuntimeArrowCaptureStoreLines(capture, contextName, context))
  }

  lines.push(
    `if (inox_callback_new(&inox_default_allocator, ${wrapper.name}, ${contextName}, ${wrapper.finalizerName}, &${out}) != INOX_OK) {`
  )
  lines.push(`  ${wrapper.finalizerName}(${contextName});`)
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
  const lines: string[] = []

  if (isSupportedMutableRuntimeArrowCapture(capture, context)) {
    lines.push(`${field} = ${capture.name};`)
    return lines
  }

  if (isRetainedRuntimeArrowCapture(capture)) {
    if (capture.valueType === 'string') {
      lines.push(`${field}.tag = INOX_TAG_STRING;`)
      lines.push(`${field}.as.ref = (inox_ref*)&${capture.name}->header;`)
      lines.push(`inox_retain(${field});`)
      return lines
    }

    lines.push(`${field} = ${capture.name};`)
    lines.push(`inox_retain(${field});`)
    return lines
  }

  if (capture.valueType === 'promise-settlement') {
    const handler = context.promiseConstructorHandlers.get(capture.name)

    if (handler === null || typeof handler === 'undefined') {
      pushDiagnostic(
        context,
        diagnostic(
          'INOX_C_FUNCTION_VALUE',
          'Promise resolve/reject handlers can only be captured inside Promise constructor executors',
          capture.loc
        )
      )

      lines.push(`${field} = 0;`)
      return lines
    }

    lines.push(`${field} = ${handler.promise};`)
    lines.push(`if (${field} != 0) inox_promise_retain(${field});`)
    return lines
  }

  lines.push(`${field} = ${capture.name};`)
  return lines
}

function emitRuntimeCallbackCall(
  expression: AnyNode,
  _functionType: CFunctionType,
  context: CFunctionContext
): PreparedExpression {
  const lines: string[] = []
  const args: string[] = []

  for (const arg of expression.args) {
    const value = emitCValueExpression(arg, context)

    pushAll(lines, value.lines)
    args.push(value.expression)
  }

  const out = nextCName(context, 'inox_callback_out')
  registerOwnedValue(context, out)
  pushAll(lines, emitPrepareOwnedValueWrite(out))

  if (args.length === 0) {
    lines.push(
      emitStatusCheck(`inox_callback_call(${emitReference(expression.callee, context)}, 0, 0, &${out})`, context)
    )
  } else {
    const argArray = nextCName(context, 'inox_callback_args')

    lines.push(`inox_value ${argArray}[] = { ${joinStrings(args, ', ')} };`)
    lines.push(
      emitStatusCheck(
        `inox_callback_call(${emitReference(expression.callee, context)}, ${argArray}, ${args.length}, &${out})`,
        context
      )
    )
  }

  return {
    lines,
    expression: out
  }
}

function emitOptionalRuntimeCallbackCallExpression(expression: AnyNode, context: CFunctionContext): string[] {
  const functionType = resolveRuntimeCallbackCalleeType(expression.callee, context)

  if (functionType === null || typeof functionType === 'undefined') {
    pushDiagnostic(
      context,
      diagnostic(
        'INOX_C_OPTIONAL_CHAINING',
        'optional calls currently require a nullable runtime callback value in the C backend',
        expression.loc
      )
    )
    return []
  }

  const callee = emitReference(expression.callee, context)
  const calleeTypeCheck = `${callee}.tag != INOX_TAG_FUNCTION || ${callee}.as.ref == 0`
  const lines: string[] = []
  const args: string[] = []

  lines.push(`if (${callee}.tag != INOX_TAG_NULL) {`)
  lines.push(`  ${emitRuntimeTypeCheck(calleeTypeCheck, context)}`)

  for (const arg of expression.args) {
    const value = emitCValueExpression(arg, context)

    pushIndented(lines, value.lines, '  ')
    args.push(value.expression)
  }

  const out = nextCName(context, 'inox_callback_out')
  registerOwnedValue(context, out)
  pushIndented(lines, emitPrepareOwnedValueWrite(out), '  ')

  if (args.length === 0) {
    const call = `inox_callback_call(${callee}, 0, 0, &${out})`
    lines.push(`  ${emitStatusCheck(call, context)}`)
  } else {
    const argArray = nextCName(context, 'inox_callback_args')
    const call = `inox_callback_call(${callee}, ${argArray}, ${args.length}, &${out})`

    lines.push(`  inox_value ${argArray}[] = { ${joinStrings(args, ', ')} };`)
    lines.push(`  ${emitStatusCheck(call, context)}`)
  }

  lines.push('}')

  return lines
}

function emitOptionalRuntimeCallbackCallValueExpression(
  expression: AnyNode,
  context: CFunctionContext
): PreparedExpression {
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
        'optional call results currently support nullable runtime callback results in the C backend',
        expression.loc
      )
    )

    return {
      lines: [],
      expression: 'inox_null_value()'
    }
  }

  const callee = emitReference(expression.callee, context)
  const out = nextCName(context, 'inox_optional_call')
  const calleeTypeCheck = `${callee}.tag != INOX_TAG_FUNCTION || ${callee}.as.ref == 0`
  const lines: string[] = []
  const args: string[] = []

  registerOwnedValue(context, out)
  pushAll(lines, emitPrepareOwnedValueWrite(out))
  lines.push(`${out} = inox_null_value();`)
  lines.push(`if (${callee}.tag != INOX_TAG_NULL) {`)
  lines.push(`  ${emitRuntimeTypeCheck(calleeTypeCheck, context)}`)

  for (const arg of expression.args) {
    const value = emitCValueExpression(arg, context)

    pushIndented(lines, value.lines, '  ')
    args.push(value.expression)
  }

  pushIndented(lines, emitPrepareOwnedValueWrite(out), '  ')

  if (args.length === 0) {
    const call = `inox_callback_call(${callee}, 0, 0, &${out})`
    lines.push(`  ${emitStatusCheck(call, context)}`)
  } else {
    const argArray = nextCName(context, 'inox_callback_args')
    const call = `inox_callback_call(${callee}, ${argArray}, ${args.length}, &${out})`

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

type FunctionParamContext = {
  functionParams: Map<string, CFunctionParam[]>
  functionReturnShapes: Map<string, CObjectShape | null>
  objectAccessorReturnPaths: Map<string, CObjectAccessorReturnPath>
  objectAliases: Map<string, string>
  objectShapes: Map<string, CObjectShapeField[]>
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
    const accessor = context.objectAccessorReturnPaths.get(path[0])

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
    const shape = context.functionReturnShapes.get(path[0])

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

function objectFunctionFieldParams(callee: CAccessorNode, context: FunctionParamContext): CFunctionParam[] | null {
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
      return field.functionType.params
    }
  }

  return null
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

function isErrorConstructorExpression(expression: AnyNode): boolean {
  if (
    expression === null ||
    typeof expression === 'undefined' ||
    expression.type !== 'NewExpression' ||
    expression.callee.type !== 'Reference'
  ) {
    return false
  }

  const path: string[] = expression.callee.path

  return path.length === 1 && path[0] === 'Error'
}

function isFetchAbortControllerConstructorExpression(expression: AnyNode): boolean {
  if (
    expression === null ||
    typeof expression === 'undefined' ||
    expression.type !== 'NewExpression' ||
    expression.callee.type !== 'Reference'
  ) {
    return false
  }

  const path: string[] = expression.callee.path

  return path.length === 1 && path[0] === 'AbortController'
}

function isArrayIsArrayCall(expression: AnyNode): boolean {
  if (expression.type !== 'CallExpression' || expression.args.length !== 1) {
    return false
  }

  const callee = expression.callee

  if (callee.type !== 'MemberExpression' || callee.property !== 'isArray' || callee.object.type !== 'Reference') {
    return false
  }

  const path: string[] = callee.object.path

  return path.length === 1 && path[0] === 'Array'
}

function emitPreparedArrayIsArrayCallExpression(
  expression: AnyNode,
  context: CFunctionContext
): PreparedExpression | null {
  if (!isArrayIsArrayCall(expression)) {
    return null
  }

  const value = emitCValueExpression(expression.args[0], context)

  return {
    lines: value.lines,
    expression: `(${value.expression}.tag == INOX_TAG_ARRAY)`
  }
}

function cObjectRuntimeCallName(expression: AnyNode): string | null {
  if (
    expression === null ||
    typeof expression === 'undefined' ||
    expression.type !== 'CallExpression' ||
    expression.args.length !== 1
  ) {
    return null
  }

  if (expression.objectRuntimeMethod === 'values') {
    return 'values'
  }

  if (expression.objectRuntimeMethod === 'entries') {
    return 'entries'
  }

  if (expression.objectRuntimeMethod === 'keys') {
    return 'keys'
  }

  return null
}

function emitPreparedObjectValuesCallExpression(
  expression: AnyNode,
  context: CFunctionContext
): PreparedExpression | null {
  const method = cObjectRuntimeCallName(expression)

  if (method === null || typeof method === 'undefined') {
    return null
  }

  const object = emitCValueExpression(expression.args[0], context)
  const temp = nextCName(context, `inox_object_${method}`)
  const lines: string[] = []

  registerOwnedValue(context, temp)
  pushAll(lines, object.lines)
  pushAll(lines, emitPrepareOwnedValueWrite(temp))
  lines.push(emitStatusCheck(`inox_object_${method}(&inox_default_allocator, ${object.expression}, &${temp})`, context))

  return {
    lines,
    expression: temp
  }
}

function isErrorValueExpression(expression: AnyNode, context: CFunctionContext): boolean {
  return isKnownErrorValueExpression(expression, context.errorObjectNames)
}

function isKnownErrorValueExpression(expression: AnyNode, errorObjectNames: CNameSet): boolean {
  if (isErrorConstructorExpression(expression)) {
    return true
  }

  if (
    expression !== null &&
    typeof expression !== 'undefined' &&
    expression.type === 'Reference' &&
    expression.path.length === 1
  ) {
    return errorObjectNames.has(expression.path[0])
  }

  return false
}

function registerErrorObjectShape(context: CFunctionContext, name: string): void {
  context.errorObjectNames.add(name)
  context.objectShapes.set(name, [
    {
      name: 'name',
      valueType: 'string'
    },
    {
      name: 'message',
      valueType: 'string'
    },
    {
      name: 'code',
      valueType: 'string'
    },
    {
      name: 'cause',
      valueType: 'object'
    }
  ])
}
