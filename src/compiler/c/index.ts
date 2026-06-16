import { CompileError, diagnostic } from '../diagnostics.ts'
import {
  collectIrFunctionDeclarations,
  collectIrFunctionNodeEntries,
  collectIrGlobalRoots,
  collectIrGlobalUsages,
  collectIrLocalThrowValueTypes,
  collectIrPrograms,
  collectIrRuntimeRequirements,
  collectIrStoredFunctionEffects,
  collectIrSyntaxFeatureUsages,
  collectIrTopLevelNodeEntries,
  collectIrTopLevelNodes,
  findIrEntryProgram
} from '../ir.ts'
import {
  createFunctionContext,
  emitEventLoopCurrentTimeExpression,
  emitEventLoopNextTimeExpression,
  emitEventLoopReference,
  emitEventLoopSleepUntilNextTimerLines,
  emitFailureStatement,
  emitPrepareOwnedValueWrite,
  emitRuntimeTypeCheck,
  emitStatusCheck,
  isRuntimeBoxedValueType,
  nextCName,
  registerBoxedValue,
  registerEventLoop,
  registerOwnedPromise,
  registerOwnedValue,
  withVariableScope
} from './context.ts'
import type { CEmitContext, CFunctionContext } from './context.ts'
import {
  reportCJsGlobalDiagnostic,
  reportUnsupportedCGlobalUsages,
  reportUnsupportedCSyntaxFeatures
} from './diagnostics.ts'
import { formatGeneratedC } from './format.ts'
import {
  arrayRuntimeMethodName,
  isStringPredicateMethod,
  isStringRuntimeMethod
} from '../stdlib/descriptors/collections.ts'
import { isCJsGlobalRoot, usesCJsGlobal } from './globals.ts'
import { cStringLiteral, emitCFunctionName, emitCIdentifier, escapeCString, utf8ByteLength } from './identifiers.ts'
import {
  emitCModuleHeader as emitCModuleHeaderWithDependencies,
  emitCModuleSource as emitCModuleSourceWithDependencies
} from './module-emission.ts'
import type { CModuleEmissionDependencies } from './module-emission.ts'
import { emitCModuleFilesFromGraph as emitCModuleFilesFromGraphWithEmitters } from './modules.ts'
import { emitCUnit as emitCUnitWithDependencies } from './unit.ts'
import type { CUnitDependencies } from './unit.ts'
import {
  collectHttpRuntimeCreateServerNames,
  collectHttpRuntimeImportNames,
  collectRuntimeImportNames,
  collectRuntimeNamedImportNames,
  irProgramsUseRuntimeImport
} from './runtime-imports.ts'
import { emitRuntimeNullableValueCheck, emitRuntimeValueCheck } from './runtime-values.ts'
import { mathRuntimeMethodName } from './runtime-methods.ts'
import {
  cPromiseRuntimeCallName,
  collectPromiseChainWrappers,
  emitPreparedPromiseConstructorExpression,
  emitPreparedPromiseExpression,
  emitPreparedPromiseMethodExpression,
  emitPreparedPromiseReturningCallExpression,
  emitPreparedPromiseStaticExpression,
  emitPromiseConstructorSettlementCall,
  emitPromiseChainCallbackWrapperDeclaration,
  emitPromiseChainCallbackWrapperHead,
  functionTakesEventLoopParam,
  isAsyncFunctionCallee,
  isExternalEventLoopFunctionCallee,
  isPromiseConstructorExpression,
  isPromiseMethodAst,
  isPromiseReturningFunctionCallee,
  knownValueType,
  resolveCAsyncFunctionAwaitValueType,
  resolvePromiseChainArrowBody,
  resolvePromiseExpressionValueType,
  resolvePromiseReturningFunctionValueType
} from './async/promises.ts'
import type { PromiseChainLoweringDependencies, PromiseLoweringDependencies } from './async/promises.ts'
import {
  collectAsyncTaskWrappers,
  emitAsyncTaskFrameType,
  emitAsyncTaskWrapperDeclaration,
  emitAsyncTaskWrapperPrototypes
} from './async/tasks.ts'
import type { AsyncTaskLoweringDependencies } from './async/tasks.ts'
import {
  collectArrowCaptures,
  collectCallbackWrappers,
  emitFunctionPointerParams,
  emitFunctionPointerReturnType,
  emitPlainArrowCallbackWrapperDeclaration,
  emitPlainArrowCallbackWrapperHead,
  emitRuntimeArrowCallbackContextFinalizerDeclaration,
  emitRuntimeArrowCallbackContextLocals,
  emitRuntimeArrowCallbackContextType,
  emitRuntimeArrowCaptureField,
  emitRuntimeCallbackWrapperDeclaration,
  emitRuntimeCallbackWrapperHead,
  functionUsesExternalEventLoop,
  hasRuntimeArrowCallbackContext,
  isNullableFunctionType,
  isPromiseChainCallbackWrapperWithContext,
  isRetainedRuntimeArrowCapture,
  isRuntimeArrowCallbackWrapperWithContext,
  isRuntimeCallbackWrapper,
  isSupportedMutableRuntimeArrowCapture,
  isSupportedRuntimeCallbackType,
  markRuntimeFunctionParam,
  normalizeFunctionType,
  resolveRuntimeFunctionArgumentType,
  runtimeCallbackWrapperFor
} from './async/callbacks.ts'
import type { CallbackLoweringDependencies } from './async/callbacks.ts'
import {
  binaryRuntimeExpressionReturnType,
  binaryRuntimeMethodName,
  emitPreparedBinaryNumberCallExpression,
  emitPreparedBinaryValueExpression,
  emitPreparedBytesIndexAssignment,
  emitPreparedBytesIndexExpression,
  emitPreparedBytesLengthExpression,
  isBinaryConstructorExpression,
  isBinaryRuntimeCall
} from './stdlib/binary.ts'
import type { BinaryLoweringDependencies } from './stdlib/binary.ts'
import {
  cChildProcessRuntimeMethodName,
  emitPreparedChildProcessCallExpression
} from './stdlib/child-process.ts'
import type { ChildProcessLoweringDependencies } from './stdlib/child-process.ts'
import { isConsoleLog } from './stdlib/console.ts'
import {
  cryptoRuntimeMethodName,
  emitCryptoHashVariableDeclaration,
  emitCryptoHandleVariableDeclaration,
  emitPreparedCryptoCallExpression,
  emitPreparedCryptoHashCallExpression,
  emitPreparedCryptoHmacCallExpression,
  emitPreparedCryptoNumberCallExpression
} from './stdlib/crypto.ts'
import type { CryptoLoweringDependencies } from './stdlib/crypto.ts'
import {
  collectDgramMessageHandlers,
  emitDgramAddressVariableDeclaration,
  emitDgramMessageHandlerDeclaration,
  emitDgramMessageHandlerHead,
  emitDgramNumberVariableDeclaration,
  emitDgramSocketCallStatement,
  emitDgramSocketVariableDeclaration,
  emitPreparedDgramAddressPortExpression
} from './stdlib/dgram.ts'
import type { DgramLoweringDependencies } from './stdlib/dgram.ts'
import {
  collectHttpHandlers,
  emitHttpHandlerDeclaration,
  emitHttpHandlerHead,
  emitHttpServerCallStatement,
  emitHttpServerVariableDeclaration
} from './stdlib/http.ts'
import type { HttpLoweringDependencies } from './stdlib/http.ts'
import {
  collectNetHandlers,
  emitNetAddressMemberVariableDeclaration,
  emitNetAddressVariableDeclaration,
  emitNetHandlerDeclaration,
  emitNetHandlerHead,
  emitNetNumberVariableDeclaration,
  emitNetServerCallStatement,
  emitNetServerVariableDeclaration,
  emitNetSocketCallStatement,
  emitNetSocketVariableDeclaration,
  emitPreparedNetAddressPortExpression,
  resolveNetAddressStringMember
} from './stdlib/net.ts'
import type { NetLoweringDependencies } from './stdlib/net.ts'
import {
  cFetchRuntimeExpressionMethod,
  emitFetchHeadersBooleanVariableDeclaration,
  emitPreparedFetchCallExpression,
  emitPreparedFetchHeadersCallExpression,
  emitPreparedFetchInitOperand,
  isAsyncFetchRuntimeCallExpression
} from './stdlib/fetch.ts'
import type { FetchLoweringDependencies } from './stdlib/fetch.ts'
import {
  cFsRuntimeConstantExpression,
  cFsRuntimeExpressionMethod,
  emitFsBooleanFlag,
  emitPreparedFsAccessModeExpression,
  emitPreparedFsCallExpression,
  emitPreparedFsStatsMethodExpression,
  emitPreparedFsSyncStatementExpression,
  emitPreparedFsSyncValueExpression,
  isAsyncFsRuntimeCallExpression
} from './stdlib/fs.ts'
import type { FsLoweringDependencies } from './stdlib/fs.ts'
import {
  cJsonRuntimeCallName,
  emitJsonParseVariableDeclaration,
  emitPreparedJsonCallExpression,
  emitPreparedJsonScalarParseExpression
} from './stdlib/json.ts'
import type { JsonDeclarationDependencies } from './stdlib/json.ts'
import {
  cOsRuntimeConstantName,
  cOsRuntimeMethodName,
  emitPreparedOsConstantExpression,
  emitPreparedOsStringCallExpression
} from './stdlib/os.ts'
import {
  cPathRuntimeConstantName,
  cPathRuntimeMethodName,
  emitPreparedPathBooleanCallExpression,
  emitPreparedPathConstantExpression,
  emitPreparedPathObjectCallExpression,
  emitPreparedPathStringCallExpression
} from './stdlib/path.ts'
import type { PathLoweringDependencies } from './stdlib/path.ts'
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
import type { ProcessLoweringDependencies } from './stdlib/process.ts'
import { cTimeRuntimeCallName } from './stdlib/time.ts'
import {
  emitPreparedTimerCallExpression,
  emitTimerVariableDeclaration
} from './stdlib/timers.ts'
import type { TimerLoweringDependencies } from './stdlib/timers.ts'
import {
  cUrlRuntimeMethodName,
  emitPreparedUrlObjectExpression,
  emitPreparedUrlSearchParamsCallExpression,
  emitPreparedUrlSearchParamsObjectExpression,
  emitPreparedUrlStringCallExpression,
  emitUrlObjectFieldAssignment
} from './stdlib/url.ts'
import type { UrlLoweringDependencies } from './stdlib/url.ts'
import {
  cUnsupportedExpressionCode,
  cUnsupportedVariableDeclarationCode,
  isNullishCoalescingExpression,
  isOptionalChainExpression
} from './syntax.ts'
import type { IrFunctionNodeEntry, IrModuleRecord } from '../ir.ts'
import type {
  CArrayElementInfo,
  CAsyncTaskWrapper,
  CCallbackWrapper,
  CClassInfo,
  CDgramMessageHandler,
  CHttpHandler,
  CNetHandler,
  CPromiseChainWrapper,
  CKnownArrayElement,
  CKnownObjectField,
  CKnownObjectIndexField,
  CEmitOptions,
  CFunctionParam,
  CFunctionReturnMapType,
  CFunctionType,
  CModuleEmitOptions,
  CModuleOutputFile,
  CModulePlan,
  CObjectShape,
  CObjectShapeField,
  CPreparedCallOptions as PreparedCallOptions,
  CPreparedCallArgs as PreparedCallArgs,
  CPreparedExpression as PreparedExpression,
  CRuntimeArrowCallbackWrapper,
  CRuntimeArrowCapture
} from './types.ts'
import {
  cRuntimeValueTag,
  isManagedRuntimeReturnType,
  isNullableScalarType,
  isRuntimeNullableType
} from './value-types.ts'
import { debugMemoryStatsFields } from '../stdlib/descriptors/debug.ts'
import { cDebugRuntimeMethodName } from './stdlib/debug.ts'
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
import type { NullableLoweringDependencies } from './values/nullable.ts'
import {
  collectClassMethods,
  createClassInfos,
  emitCClassMethodName,
  emitCClassObjectValueExpression,
  emitClassObjectVariableDeclaration,
  emitPreparedClassMethodCallExpression,
  isClassConstructorExpression,
  registerClassObjectShape
} from './values/classes.ts'
import type { ClassLoweringDependencies } from './values/classes.ts'
import {
  emitObjectVariableDeclaration,
  emitObjectValueReference,
  emitPreparedKnownObjectIndexValueExpression,
  emitPreparedKnownObjectMemberValueExpression,
  isIndexAccessExpression,
  isMemberAccessExpression,
  registerObjectShape,
  resolveCObjectExpressionName,
  resolveKnownObjectIndex,
  resolveKnownObjectMember,
  resolveObjectExpressionIndex,
  resolveObjectExpressionMember,
  updateKnownObjectMemberValueType
} from './values/objects.ts'
import type { ObjectVariableDeclarationDependencies } from './values/objects.ts'
import {
  collectionConstructorName,
  emitPreparedCollectionCallExpression,
  emitPreparedCollectionReceiver,
  emitPreparedCollectionSizeExpression,
  emitPreparedMapIndexAssignment,
  emitPreparedMapIndexGetExpression,
  isCollectionConstructorExpression,
  resolveRuntimeForOfMap,
  resolveRuntimeForOfSet,
  resolveRuntimeMapType,
  resolveRuntimeSetElementType
} from './values/collections.ts'
import type { CollectionLoweringDependencies } from './values/collections.ts'
import {
  emitArrayFilterVariableDeclaration,
  emitArrayMapVariableDeclaration,
  emitArraySortVariableDeclaration,
  emitPreparedKnownArrayIndexValueExpression,
  emitPreparedArrayFilterCallExpression,
  emitPreparedArrayLengthExpression,
  emitPreparedArrayMapCallExpression,
  emitPreparedArrayPopCallExpression,
  emitPreparedArrayPushCallExpression,
  emitPreparedRuntimeArrayIndexValueExpression,
  emitPreparedRuntimeArrayIndexValue,
  emitPreparedArraySortCallExpression,
  isArrayLengthExpression,
  isArrayMethodCall,
  resolveForOfElementType,
  resolveKnownArrayIndex,
  resolveKnownArrayLength,
  resolveKnownForOfArray,
  resolveOptionalRuntimeArrayIndex,
  resolveRuntimeArrayElementType,
  resolveRuntimeArrayIndex,
  resolveRuntimeForOfArray,
  updateKnownArrayElementValueType
} from './values/arrays.ts'
import type { ArrayLoweringDependencies } from './values/arrays.ts'
import {
  collectTemplatePlaceholderExpressions,
  emitCNumberConversionValueExpression,
  emitCStringConcatValueExpression,
  emitCStringConversionValueExpression,
  emitCStringSliceValueExpression,
  emitCStringSplitValueExpression,
  emitCStringTrimValueExpression,
  emitCTemplateLiteralValueExpression,
  emitPreparedStringBytesOperand,
  emitPreparedStringCompareExpression,
  emitPreparedStringLengthExpression,
  emitPreparedStringPredicateCall,
  emitStringExpression,
  isCStringRuntimeMethodName,
  isNumberConversionCall,
  isRuntimeProducedStringExpression,
  isStringConcatExpression,
  isStringConversionCall,
  isStringPredicateCall,
  isStringSliceCall,
  isStringSplitCall,
  isStringTrimCall,
  resolveRuntimeStringReference
} from './values/strings.ts'
import type { StringLoweringDependencies } from './values/strings.ts'
import {
  emitCallExpression as emitCallExpressionWithDependencies,
  emitCallee as emitCalleeFromExpressions,
  emitCConditionClause,
  emitCExpression as emitCExpressionWithDependencies,
  emitCNegatedConditionClause,
  emitCValueExpression as emitCValueExpressionWithDependencies,
  emitPreparedCallArgs as emitPreparedCallArgsWithDependencies,
  emitPreparedCallExpression as emitPreparedCallExpressionWithDependencies,
  emitPreparedNumberExpression as emitPreparedNumberExpressionWithDependencies,
  emitPreparedUpdateExpression as emitPreparedUpdateExpressionWithDependencies,
  isThrowingFunctionCallee as isThrowingFunctionCalleeFromExpressions,
  isThrowingFunctionName as isThrowingFunctionNameFromExpressions
} from './values/expressions.ts'
import type {
  CCallExpressionDependencies,
  CScalarExpressionDependencies,
  CValueExpressionDependencies
} from './values/expressions.ts'
import {
  inferExpressionType as inferExpressionTypeWithDependencies
} from './values/types.ts'
import type { CExpressionTypeDependencies } from './values/types.ts'
import {
  currentBreakTarget,
  currentContinueTarget,
  currentErrorTarget,
  currentReturnTarget,
  emitBreakJump,
  emitBreakTargetLabel,
  emitCatchBindingTypeCheck,
  emitContinueJump,
  emitContinueTargetLabel,
  emitExpressionStatement,
  emitFunctionScalarVariableDeclaration,
  emitForOfStatement,
  emitForStatement,
  emitIfStatement,
  emitReturnStatement,
  emitReturnCleanupStatement,
  emitReturnJump,
  emitRuntimeCallbackRuntimeValueReturnLines,
  emitRuntimeStringVariableDeclaration,
  emitRuntimeValueVariableDeclaration,
  emitNumberBooleanScalarVariableDeclaration,
  emitStringScalarVariableDeclaration,
  emitStatementBody,
  emitStatementList,
  emitSwitchStatement,
  emitThrowStatement,
  emitTryStatement,
  emitVariableDeclarationStatement,
  emitWhileStatement,
  isRuntimeValueLocalExpression,
  registerRuntimeValueMetadata,
  reportCCollectionHashability,
  registerErrorChannel,
  withBreakTarget,
  withContinueTarget,
  withErrorTarget,
  withFinallyFlowTarget,
  withReturnTarget
} from './values/statements.ts'
import type { StatementLoweringDependencies } from './values/statements.ts'
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
import type { CDeclarationEmissionDependencies } from './declarations.ts'
import type {
  AnyNode,
  Diagnostic,
  IrFunctionDeclaration,
  IrFunctionEffect,
  IrThrowValueType,
  IrProgram,
  ModuleGraph,
  SourceLocation
} from '../types.ts'
export type { CModuleOutputFile } from './types.ts'

type CSourceLocation = SourceLocation | null | undefined
type TempValueEmitter = (temp: string) => string

type CErrorConstructorParts = {
  message: AnyNode
  code: AnyNode
  cause: AnyNode
}

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
    emitDgramNumberVariableDeclaration(statement, context, dgramLoweringDependencies),
  emitDgramSocketVariableDeclaration: (statement: AnyNode, context: CFunctionContext) =>
    emitDgramSocketVariableDeclaration(statement, context, dgramLoweringDependencies),
  emitDgramSocketCallStatement: (expression: AnyNode, context: CFunctionContext) =>
    emitDgramSocketCallStatement(expression, context, dgramLoweringDependencies),
  emitDynamicObjectMemberVariableDeclaration,
  emitDynamicObjectMemberAssignment,
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
    emitNetServerVariableDeclaration(statement, context, netLoweringDependencies),
  emitNetSocketCallStatement: (expression: AnyNode, context: CFunctionContext) =>
    emitNetSocketCallStatement(expression, context, netLoweringDependencies),
  emitNetSocketVariableDeclaration: (statement: AnyNode, context: CFunctionContext) =>
    emitNetSocketVariableDeclaration(statement, context, netLoweringDependencies),
  emitNullableScalarValueExpression,
  emitNullableRuntimeValueAssignment,
  emitObjectVariableDeclaration: (statement: AnyNode, context: CFunctionContext) =>
    emitObjectVariableDeclaration(statement, context, objectVariableDeclarationDependencies),
  emitOptionalRuntimeCallbackCallExpression,
  emitPreparedArrayFilterCallExpression,
  emitPreparedArrayMapCallExpression,
  emitPreparedArrayPopCallExpression,
  emitPreparedArrayPushCallExpression,
  emitPreparedArraySortCallExpression,
  emitPreparedAsyncFunctionPromiseCallExpression,
  emitPreparedBytesIndexAssignment: (expression: AnyNode, context: CFunctionContext) =>
    emitPreparedBytesIndexAssignment(expression, context, binaryLoweringDependencies),
  emitPreparedCallExpression,
  emitPreparedChildProcessCallExpression: (expression: AnyNode, context: CFunctionContext, options?: PreparedCallOptions) =>
    emitPreparedChildProcessCallExpression(expression, context, childProcessLoweringDependencies, options),
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
  emitPreparedFetchHeadersCallExpression: (expression: AnyNode, context: CFunctionContext, options?: PreparedCallOptions) =>
    emitPreparedFetchHeadersCallExpression(expression, context, fetchLoweringDependencies, options),
  emitPreparedFsCallExpression: (expression: AnyNode, context: CFunctionContext, options?: PreparedCallOptions) =>
    emitPreparedFsCallExpression(expression, context, fsLoweringDependencies, options),
  emitPreparedFsSyncStatementExpression: (expression: AnyNode, context: CFunctionContext) =>
    emitPreparedFsSyncStatementExpression(expression, context, fsLoweringDependencies),
  emitPreparedMapIndexAssignment,
  emitPreparedNumberExpression,
  emitPreparedPathObjectCallExpression: (expression: AnyNode, context: CFunctionContext, options?: PreparedCallOptions) =>
    emitPreparedPathObjectCallExpression(expression, context, pathLoweringDependencies, options),
  emitPreparedPromiseConstructorExpression: (expression: AnyNode, context: CFunctionContext, options?: PreparedCallOptions) =>
    emitPreparedPromiseConstructorExpression(expression, context, promiseLoweringDependencies, options),
  emitPreparedPromiseExpression: (expression: AnyNode, context: CFunctionContext, options?: PreparedCallOptions) =>
    emitPreparedPromiseExpression(expression, context, promiseLoweringDependencies, options),
  emitPreparedPromiseMethodExpression: (expression: AnyNode, context: CFunctionContext, options?: PreparedCallOptions) =>
    emitPreparedPromiseMethodExpression(expression, context, promiseLoweringDependencies, options),
  emitPreparedPromiseReturningCallExpression: (expression: AnyNode, context: CFunctionContext, options?: PreparedCallOptions) =>
    emitPreparedPromiseReturningCallExpression(expression, context, promiseLoweringDependencies, options),
  emitPreparedPromiseStaticExpression: (expression: AnyNode, context: CFunctionContext, options?: PreparedCallOptions) =>
    emitPreparedPromiseStaticExpression(expression, context, promiseLoweringDependencies, options),
  emitPreparedTimerCallExpression: (expression: AnyNode, context: CFunctionContext, options?: PreparedCallOptions) =>
    emitPreparedTimerCallExpression(expression, context, timerLoweringDependencies, options),
  emitPreparedUpdateExpression,
  emitPreparedUrlObjectExpression: (expression: AnyNode, context: CFunctionContext, options?: PreparedCallOptions) =>
    emitPreparedUrlObjectExpression(expression, context, urlLoweringDependencies, options),
  emitPreparedUrlSearchParamsObjectExpression: (expression: AnyNode, context: CFunctionContext, options?: PreparedCallOptions) =>
    emitPreparedUrlSearchParamsObjectExpression(expression, context, urlLoweringDependencies, options),
  emitProcessExitCodeAssignment: (expression: AnyNode, context: CFunctionContext) =>
    emitProcessExitCodeAssignment(expression, context, processLoweringDependencies),
  emitProcessExitStatement: (expression: AnyNode, context: CFunctionContext) =>
    emitProcessExitStatement(expression, context, processLoweringDependencies),
  emitPromiseConstructorSettlementCall: (expression: AnyNode, context: CFunctionContext) =>
    emitPromiseConstructorSettlementCall(expression, context, promiseLoweringDependencies),
  emitReference,
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

const objectVariableDeclarationDependencies: ObjectVariableDeclarationDependencies = {
  emitCFieldFlags,
  emitCValueExpression,
  inferExpressionType
}

const jsonDeclarationDependencies: JsonDeclarationDependencies = {
  emitCFieldFlags,
  emitCValueExpression,
  emitPreparedStringBytesOperand,
  inferExpressionType,
  registerObjectShape
}

const timerLoweringDependencies: TimerLoweringDependencies = {
  emitPreparedNumberExpression,
  emitReference,
  emitRuntimeCallbackValue
}

const fetchLoweringDependencies: FetchLoweringDependencies = {
  emitCValueExpression,
  emitPreparedStringBytesOperand,
  findObjectLiteralPropertyValue,
  inferExpressionType
}

const fsLoweringDependencies: FsLoweringDependencies = {
  emitCValueExpression,
  emitPreparedNumberExpression,
  emitPreparedStringBytesOperand,
  inferExpressionType
}

const binaryLoweringDependencies: BinaryLoweringDependencies = {
  emitCValueExpression,
  emitPreparedNumberExpression,
  emitPreparedStringBytesOperand,
  inferExpressionType
}

const childProcessLoweringDependencies: ChildProcessLoweringDependencies = {
  emitCValueExpression,
  registerObjectShape
}

const pathLoweringDependencies: PathLoweringDependencies = {
  emitCValueExpression,
  registerObjectShape
}

const processLoweringDependencies: ProcessLoweringDependencies = {
  emitPreparedNumberExpression
}

const urlLoweringDependencies: UrlLoweringDependencies = {
  emitCValueExpression,
  emitPreparedStringBytesOperand,
  registerObjectShape
}

const promiseLoweringDependencies: PromiseLoweringDependencies = {
  emitCValueExpression,
  emitPreparedAsyncFunctionPromiseCallExpression,
  emitPreparedCallExpression,
  emitPreparedFetchCallExpression: (expression: AnyNode, context: CFunctionContext, options?: PreparedCallOptions) =>
    emitPreparedFetchCallExpression(expression, context, fetchLoweringDependencies, options),
  emitPreparedFsCallExpression: (expression: AnyNode, context: CFunctionContext, options?: PreparedCallOptions) =>
    emitPreparedFsCallExpression(expression, context, fsLoweringDependencies, options),
  emitRuntimeArrowCaptureStoreLines,
  emitStatementList,
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
  emitPreparedNumberExpression,
  inferExpressionType,
  resolveKnownObjectIndex,
  resolveKnownObjectMember
}

const stringLoweringDependencies: StringLoweringDependencies = {
  canLowerCNullishCoalescingExpression,
  emitCallExpression,
  emitCValueExpression,
  emitPreparedNumberExpression,
  emitReference,
  inferExpressionType,
  isBoxedRuntimeStringName,
  isBoxedRuntimeStringReference,
  isMemberAccessExpression,
  resolveKnownObjectMember,
  resolveNetAddressStringMember
}

const cryptoLoweringDependencies: CryptoLoweringDependencies = {
  cStringLiteralNode,
  emitCValueExpression,
  emitPreparedNumberExpression,
  emitPreparedStringBytesOperand,
  inferExpressionType
}

const dgramLoweringDependencies: DgramLoweringDependencies = {
  emitPreparedNumberExpression,
  emitPreparedStringBytesOperand,
  emitReference,
  emitStatementList,
  findObjectLiteralPropertyValue,
  staticObjectBooleanPropertyValue,
  staticObjectStringPropertyValue
}

const httpLoweringDependencies: HttpLoweringDependencies = {
  emitPreparedNumberExpression,
  emitStatementList
}


const callbackLoweringDependencies: CallbackLoweringDependencies = {
  collectTemplatePlaceholderExpressions,
  emitPreparedNumberExpression,
  emitRuntimeCallbackRuntimeValueReturnLines,
  emitStatementList,
  registerObjectShape
}


const promiseChainLoweringDependencies: PromiseChainLoweringDependencies = {
  callbackLoweringDependencies,
  collectArrowCaptures,
  emitPreparedNumberExpression,
  emitRuntimeArrowCallbackContextFinalizerDeclaration,
  emitRuntimeArrowCallbackContextLocals,
  emitRuntimeCallbackRuntimeValueReturnLines,
  emitStatementList,
  functionUsesExternalEventLoop,
  isPromiseChainCallbackWrapperWithContext
}

const asyncTaskLoweringDependencies: AsyncTaskLoweringDependencies = {
  emitCallee,
  emitCValueExpression,
  emitFunctionHead,
  emitFsBooleanFlag,
  emitPreparedCallArgs,
  emitPreparedCallExpression,
  emitPreparedFetchInitOperand: (expression: AnyNode, context: CFunctionContext) =>
    emitPreparedFetchInitOperand(expression, context, fetchLoweringDependencies),
  emitPreparedFsAccessModeExpression: (expression: AnyNode, context: CFunctionContext) =>
    emitPreparedFsAccessModeExpression(expression, context, fsLoweringDependencies),
  emitPreparedNumberExpression,
  emitPreparedStringBytesOperand,
  emitRuntimeArrowCaptureStoreLines,
  emitStatementList,
  inferExpressionType,
  isIndexAccessExpression,
  isMemberAccessExpression,
  isRuntimeProducedStringExpression,
  isThrowingFunctionCallee,
  isThrowingFunctionName,
  registerObjectShape,
  registerRuntimeValueMetadata,
  resolveFunctionDeclarationParams,
  resolveFunctionParams,
  resolveKnownArrayIndex,
  resolveKnownObjectIndex,
  resolveKnownObjectMember,
  resolveRuntimeArrayElementType,
  resolveRuntimeArrayIndex,
  resolveRuntimeMapType,
  resolveRuntimeSetElementType,
  resolveRuntimeStringReference
}

const declarationEmissionDependencies: CDeclarationEmissionDependencies = {
  asyncTaskLoweringDependencies,
  emitStatementList
}

const netLoweringDependencies: NetLoweringDependencies = {
  createFunctionContext,
  emitConsoleLogStatement,
  emitPreparedNumberExpression,
  emitPreparedStringBytesOperand,
  emitStatementList,
  findObjectLiteralPropertyValue
}

const expressionTypeDependencies: CExpressionTypeDependencies = {
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
  isArrayLengthExpression,
  isBinaryConstructorExpression,
  isBinaryRuntimeCall,
  isClassConstructorExpression,
  isErrorConstructorExpression,
  isFetchAbortControllerConstructorExpression,
  isIndexAccessExpression,
  isMemberAccessExpression,
  isNumberConversionCall,
  isPromiseConstructorExpression,
  isStringConversionCall,
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

const cCallExpressionDependencies: CCallExpressionDependencies = {
  currentErrorTarget,
  emitCExpression,
  emitCNumberConversionValueExpression,
  emitCValueExpression,
  emitFunctionValueExpression,
  emitNullableFunctionValueExpression,
  emitNullableScalarValueExpression,
  emitPreparedArrayFilterCallExpression,
  emitPreparedArrayMapCallExpression,
  emitPreparedArrayPopCallExpression,
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
    emitPreparedJsonCallExpression(expression, context, jsonDeclarationDependencies),
  emitPreparedNumberExpression,
  emitPreparedPathBooleanCallExpression: (expression: AnyNode, context: CFunctionContext) =>
    emitPreparedPathBooleanCallExpression(expression, context, pathLoweringDependencies),
  emitPreparedPathStringCallExpression: (expression: AnyNode, context: CFunctionContext) =>
    emitPreparedPathStringCallExpression(expression, context, pathLoweringDependencies),
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
  isExternalEventLoopFunctionCallee,
  isNullableFunctionType,
  isPromiseReturningFunctionCallee,
  registerErrorChannel,
  resolveFunctionParams,
  resolveRuntimeCallbackCalleeType,
  resolveRuntimeFunctionArgumentType
}

const cScalarExpressionDependencies: CScalarExpressionDependencies = {
  cFsRuntimeConstantExpression,
  emitCAwaitValueExpression,
  emitCValueExpression,
  emitObjectValueReference,
  emitPreparedArrayLengthExpression,
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
  emitPreparedPathBooleanCallExpression: (expression: AnyNode, context: CFunctionContext) =>
    emitPreparedPathBooleanCallExpression(expression, context, pathLoweringDependencies),
  emitPreparedProcessNumberExpression,
  emitPreparedRuntimeArrayIndexValue,
  emitPreparedStringCompareExpression,
  emitPreparedStringLengthExpression,
  emitPreparedStringPredicateCall,
  emitPreparedUrlSearchParamsCallExpression: (expression: AnyNode, context: CFunctionContext) =>
    emitPreparedUrlSearchParamsCallExpression(expression, context, urlLoweringDependencies),
  emitReference,
  emitStringExpression,
  inferExpressionType,
  isIndexAccessExpression,
  isMemberAccessExpression,
  isStringPredicateCall,
  reportCJsGlobalDiagnostic,
  resolveKnownArrayIndex,
  resolveKnownObjectIndex,
  resolveKnownObjectMember,
  resolveRuntimeArrayIndex
}

const cValueExpressionDependencies: CValueExpressionDependencies = {
  emitCArrayLiteralValueExpression,
  emitCAwaitValueExpression,
  emitCClassObjectValueExpression,
  emitCErrorObjectValueExpression,
  emitCNullishCoalescingValueExpression,
  emitCNumberConversionValueExpression,
  emitCObjectLiteralValueExpression,
  emitCOptionalIndexValueExpression,
  emitCOptionalMemberValueExpression,
  emitCStringConcatValueExpression,
  emitCStringConversionValueExpression,
  emitCStringSliceValueExpression,
  emitCStringSplitValueExpression,
  emitCStringTrimValueExpression,
  emitCTemplateLiteralValueExpression,
  emitOptionalRuntimeCallbackCallValueExpression,
  emitPreparedArrayPopCallExpression,
  emitPreparedBinaryValueExpression: (expression: AnyNode, context: CFunctionContext) =>
    emitPreparedBinaryValueExpression(expression, context, binaryLoweringDependencies),
  emitPreparedCallExpression,
  emitPreparedChildProcessCallExpression: (expression: AnyNode, context: CFunctionContext) =>
    emitPreparedChildProcessCallExpression(expression, context, childProcessLoweringDependencies),
  emitPreparedClassMethodCallExpression,
  emitPreparedCollectionCallExpression,
  emitPreparedCryptoCallExpression: (expression: AnyNode, context: CFunctionContext) =>
    emitPreparedCryptoCallExpression(expression, context, cryptoLoweringDependencies),
  emitPreparedDebugMemoryCallExpression,
  emitPreparedFetchHeadersCallExpression: (expression: AnyNode, context: CFunctionContext) =>
    emitPreparedFetchHeadersCallExpression(expression, context, fetchLoweringDependencies),
  emitPreparedFsSyncValueExpression: (expression: AnyNode, context: CFunctionContext) =>
    emitPreparedFsSyncValueExpression(expression, context, fsLoweringDependencies),
  emitPreparedJsonCallExpression: (expression: AnyNode, context: CFunctionContext) =>
    emitPreparedJsonCallExpression(expression, context, jsonDeclarationDependencies),
  emitPreparedKnownArrayIndexValueExpression,
  emitPreparedKnownObjectIndexValueExpression,
  emitPreparedKnownObjectMemberValueExpression,
  emitPreparedMapIndexGetExpression,
  emitPreparedNullableScalarRuntimeValueExpression,
  emitPreparedOsConstantExpression,
  emitPreparedOsStringCallExpression,
  emitPreparedPathConstantExpression,
  emitPreparedPathObjectCallExpression: (expression: AnyNode, context: CFunctionContext) =>
    emitPreparedPathObjectCallExpression(expression, context, pathLoweringDependencies),
  emitPreparedPathStringCallExpression: (expression: AnyNode, context: CFunctionContext) =>
    emitPreparedPathStringCallExpression(expression, context, pathLoweringDependencies),
  emitPreparedProcessStringExpression: (expression: AnyNode, context: CFunctionContext) =>
    emitPreparedProcessStringExpression(expression, context, processLoweringDependencies),
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
  isStringConcatExpression,
  isStringConversionCall,
  isStringSliceCall,
  isStringSplitCall,
  isStringTrimCall
}

const cUnitDependencies: CUnitDependencies = {
  asyncTaskLoweringDependencies,
  callbackLoweringDependencies,
  collectExternalEventLoopFunctions,
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
  promiseChainLoweringDependencies
}

const cModuleEmissionDependencies: CModuleEmissionDependencies = {
  asyncTaskLoweringDependencies,
  callbackLoweringDependencies,
  collectExternalEventLoopFunctions,
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
  promiseChainLoweringDependencies
}

export function emitCFromIr(ir: IrProgram, options: CEmitOptions = {}): string {
  return formatGeneratedC(emitCUnit([ir], ir, options, [ir]), 'ccjs.generated.c')
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
  const entryIr = findIrEntryProgram(irModules, entry)

  return formatGeneratedC(emitCUnit(irPrograms, entryIr, options, entryIrPrograms), 'ccjs.bundle.c')
}

export function emitCModuleFilesFromGraph(graph: ModuleGraph, options: CModuleEmitOptions): CModuleOutputFile[] {
  return emitCModuleFilesFromGraphWithEmitters(graph, options, {
    emitHeader: (plan: CModulePlan, plans: CModulePlan[], diagnostics: Diagnostic[]) =>
      emitCModuleHeaderWithDependencies(plan, plans, diagnostics, cModuleEmissionDependencies),
    emitSource: (
      plan: CModulePlan,
      plans: CModulePlan[],
      emitOptions: CModuleEmitOptions,
      diagnostics: Diagnostic[]
    ) =>
      emitCModuleSourceWithDependencies(plan, plans, emitOptions, diagnostics, cModuleEmissionDependencies)
  })
}

function emitCUnit(
  irPrograms: IrProgram[],
  entryIrProgram: IrProgram | null,
  options: CEmitOptions,
  entryIrPrograms: IrProgram[]
) {
  return emitCUnitWithDependencies(irPrograms, entryIrProgram, options, entryIrPrograms, cUnitDependencies)
}

function createThrowingFunctionInfo(
  functionDeclarations: IrFunctionDeclaration[],
  functionEffects: IrFunctionEffect[]
) {
  const functionThrowValueTypes: Map<string, IrThrowValueType[]> = new Map()
  const throwingFunctions: Set<string> = new Set()

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

function emitCFieldFlags(field: AnyNode): string {
  const flags: string[] = []

  if (field.readonly === true) {
    flags.push('CCJS_FIELD_READONLY')
  }

  if (field.ownership === 'weak') {
    flags.push('CCJS_FIELD_WEAK')
  }

  if (flags.length === 0) {
    return '0'
  }

  return flags.join(' | ')
}

function createBaseContext(
  diagnostics: Diagnostic[],
  functionDeclarations: IrFunctionDeclaration[],
  functionEffects: IrFunctionEffect[],
  jsGlobalRoots: Set<string>
): CEmitContext {
  const throwing = createThrowingFunctionInfo(functionDeclarations, functionEffects)
  const functionNames: Map<string, string> = new Map()
  const functionParams: Map<string, CFunctionParam[]> = new Map()
  const functionReturnArrayElementTypes: Map<string, string | null> = new Map()
  const functionReturnArrayElementDeclaredTypes: Map<string, string | null> = new Map()
  const functionReturnMapTypes: Map<string, CFunctionReturnMapType> = new Map()
  const functionReturnNullables: Map<string, boolean> = new Map()
  const functionReturnPromiseValueTypes: Map<string, string | null> = new Map()
  const functionReturnShapes: Map<string, CObjectShape | null> = new Map()
  const functionReturnSetElementTypes: Map<string, string | null> = new Map()
  const functionReturnTypes: Map<string, string> = new Map()
  const functionAsyncFlags: Map<string, boolean> = new Map()
  const unhandledRejectionFlag: string | null = null

  for (const item of functionDeclarations) {
    let returnArrayElementType: string | null = null
    let returnArrayElementDeclaredType: string | null = null
    let returnPromiseValueType: string | null = null
    let returnShape: CObjectShape | null = null
    let returnSetElementType: string | null = null

    if (item.returnArrayElementType != null) {
      returnArrayElementType = item.returnArrayElementType
    }

    if (item.returnArrayElementDeclaredType != null) {
      returnArrayElementDeclaredType = item.returnArrayElementDeclaredType
    }

    if (item.returnPromiseValueType != null) {
      returnPromiseValueType = item.returnPromiseValueType
    }

    if (item.returnShape != null) {
      returnShape = item.returnShape
    }

    if (item.returnSetElementType != null) {
      returnSetElementType = item.returnSetElementType
    }

    const returnMapType: CFunctionReturnMapType = {
      key: null,
      value: null
    }

    if (item.returnMapKeyType != null) {
      returnMapType.key = item.returnMapKeyType
    }

    if (item.returnMapValueType != null) {
      returnMapType.value = item.returnMapValueType
    }

    functionNames.set(item.name, emitCFunctionName(item.name))
    functionParams.set(item.name, item.params as CFunctionParam[])
    functionReturnArrayElementTypes.set(item.name, returnArrayElementType)
    functionReturnArrayElementDeclaredTypes.set(item.name, returnArrayElementDeclaredType)
    functionReturnMapTypes.set(item.name, returnMapType)
    functionReturnNullables.set(item.name, item.returnNullable === true)
    functionReturnPromiseValueTypes.set(item.name, returnPromiseValueType)
    functionReturnShapes.set(item.name, returnShape)
    functionReturnSetElementTypes.set(item.name, returnSetElementType)
    functionReturnTypes.set(item.name, item.returnType)
    functionAsyncFlags.set(item.name, item.async === true)
  }

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
    functionReturnArrayElementTypes,
    functionReturnArrayElementDeclaredTypes,
    functionReturnMapTypes,
    functionReturnNullables,
    functionReturnPromiseValueTypes,
    functionReturnShapes,
    functionReturnSetElementTypes,
    functionReturnTypes,
    functionAsyncFlags,
    asyncTaskWrappers: new Map(),
    jsGlobalRoots,
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

function collectExternalEventLoopFunctions(functions: AnyNode[]): Set<string> {
  const functionsByName: Map<string, AnyNode> = new Map()
  const names: Set<string> = new Set()
  let changed = true

  for (const item of functions) {
    if (item.name == null) {
      continue
    }

    functionsByName.set(item.name, item)
  }

  while (changed) {
    changed = false

    for (const entry of functionsByName) {
      const name = entry[0]
      const item = entry[1]

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
  if (expression == null || expression.properties == null) {
    return null
  }

  for (const property of expression.properties) {
    if (property.key === key) {
      if (property.value != null) {
        return property.value
      }

      return null
    }
  }

  return null
}

function staticObjectStringPropertyValue(expression: AnyNode, key: string): string | null {
  const value = findObjectLiteralPropertyValue(expression, key)

  if (value != null && value.type === 'StringLiteral') {
    return value.value
  }

  if (value != null && value.type === 'TemplateLiteral' && !value.raw.includes('${')) {
    return value.raw.slice(1, -1)
  }

  return null
}

function staticObjectBooleanPropertyValue(expression: AnyNode, key: string): boolean | null {
  const value = findObjectLiteralPropertyValue(expression, key)

  if (value != null && value.type === 'BooleanLiteral') {
    return value.value === true
  }

  return null
}

function emitFunctionPointerVariable(
  name: string,
  init: AnyNode,
  context: CFunctionContext,
  isConst: boolean,
  functionType: CFunctionType | null | undefined,
  loc: CSourceLocation
): string {
  reportUnsupportedCFunctionType(functionType, context, loc)

  return `${emitFunctionPointerReturnType(functionType)} (*${isConst ? 'const ' : ''}${name})(${emitFunctionPointerParams(functionType)}) = ${emitFunctionValueExpression(init, context)}`
}

function emitStatement(statement: AnyNode, context: CFunctionContext): string[] {
  if (statement.type === 'BlockStatement') {
    return withVariableScope(context, () => {
      const lines = ['{']

      for (const line of emitStatementBody(statement, context)) {
        lines.push(`  ${line}`)
      }

      lines.push('}')

      return lines
    })
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
  const localThrowTypes = collectIrLocalThrowValueTypes(statement.block, {
    errorObjectNames: context.errorObjectNames,
    functionThrowValueTypes: context.functionThrowValueTypes
  })

  for (const throwType of localThrowTypes) {
    types.push(throwType)
  }

  const localAwaitTypes = collectLocalAwaitRejectionValueTypes(statement.block, context)

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

const LOCAL_AWAIT_REJECTION_CHILD_KEYS = [
  'body',
  'init',
  'argument',
  'args',
  'callee',
  'object',
  'index',
  'properties',
  'value',
  'left',
  'right',
  'consequent',
  'alternate',
  'test',
  'update',
  'iterable',
  'cases',
  'block',
  'handler',
  'finalizer',
  'expression'
]

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

function copyStringSet(source: Set<string>): Set<string> {
  const result: Set<string> = new Set()

  for (const value of source) {
    result.add(value)
  }

  return result
}

function copyStringMap(source: Map<string, string>): Map<string, string> {
  const result: Map<string, string> = new Map()

  for (const entry of source) {
    result.set(entry[0], entry[1])
  }

  return result
}

function collectLocalAwaitRejectionValueTypes(
  node: unknown,
  context: CFunctionContext
): string[] {
  return collectLocalAwaitRejectionValueTypesWithState(
    node,
    context,
    new Map(),
    copyStringSet(context.errorObjectNames)
  )
}

function collectLocalAwaitRejectionValueTypesWithState(
  node: unknown,
  context: CFunctionContext,
  localPromiseRejectionValueTypes: Map<string, string>,
  localErrorObjectNames: Set<string>
): string[] {
  if (node == null) {
    return []
  }

  if (Array.isArray(node)) {
    const types: string[] = []

    for (const item of node) {
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

  for (const key of LOCAL_AWAIT_REJECTION_CHILD_KEYS) {
    const value = current[key]

    if (value == null) {
      continue
    }

    pushAll(
      types,
      collectLocalAwaitRejectionValueTypesWithState(
        value,
        context,
        localPromiseRejectionValueTypes,
        localErrorObjectNames
      )
    )
  }

  return types
}

function inferPromiseRejectionValueType(
  expression: AnyNode,
  context: CFunctionContext,
  localPromiseRejectionValueTypes: Map<string, string>,
  localErrorObjectNames: Set<string>
): string {
  if (expression != null && expression.type === 'CallExpression' && cPromiseRuntimeCallName(expression.callee) === 'reject') {
    return inferRejectedValueTypeWithErrors(expression.args[0], context, localErrorObjectNames)
  }

  if (expression != null && expression.type === 'CallExpression' && cFsRuntimeExpressionMethod(expression) != null) {
    return 'error'
  }

  if (expression != null && expression.type === 'CallExpression' && cFetchRuntimeExpressionMethod(expression) != null) {
    return 'error'
  }

  if (expression != null && expression.type === 'Reference' && expression.path.length === 1) {
    const localValueType = localPromiseRejectionValueTypes.get(expression.path[0])

    if (localValueType != null) {
      return localValueType
    }

    const contextValueType = context.promiseRejectionValueTypes.get(expression.path[0])

    if (contextValueType != null) {
      return contextValueType
    }

    return 'unknown'
  }

  return 'unknown'
}

function inferRejectedValueType(
  expression: AnyNode,
  context: CFunctionContext
): string {
  return inferRejectedValueTypeWithErrors(expression, context, context.errorObjectNames)
}

function inferRejectedValueTypeWithErrors(
  expression: AnyNode,
  context: CFunctionContext,
  localErrorObjectNames: Set<string>
): string {
  if (isKnownErrorValueExpression(expression, context, localErrorObjectNames)) {
    return 'error'
  }

  if (
    (expression != null && expression.type === 'StringLiteral') ||
    (expression != null && expression.type === 'TemplateLiteral') ||
    inferExpressionType(expression, context) === 'string'
  ) {
    return 'string'
  }

  return 'unknown'
}

function emitScalarVariableDeclaration(statement: AnyNode, context: CFunctionContext): string[] {
  if (statement.nullable === true && isRuntimeNullableType(statement.valueType)) {
    return emitNullableRuntimeValueVariableDeclaration(statement, context)
  }

  if (isErrorConstructorExpression(statement.init)) {
    return emitErrorObjectVariableDeclaration(statement, context)
  }

  const timerDeclaration = emitTimerVariableDeclaration(statement, context, timerLoweringDependencies)

  if (timerDeclaration != null) {
    return timerDeclaration
  }

  const cryptoHashDeclaration = emitCryptoHashVariableDeclaration(statement, context, cryptoLoweringDependencies)

  if (cryptoHashDeclaration != null) {
    return cryptoHashDeclaration
  }

  const fetchHeadersBooleanDeclaration = emitFetchHeadersBooleanVariableDeclaration(
    statement,
    context,
    fetchLoweringDependencies
  )

  if (fetchHeadersBooleanDeclaration != null) {
    return fetchHeadersBooleanDeclaration
  }

  const inferred = inferExpressionType(statement.init, context)
  context.variables.set(statement.name, inferred)

  const stringScalarDeclaration = emitStringScalarVariableDeclaration(statement, context, inferred)

  if (stringScalarDeclaration != null) {
    return stringScalarDeclaration
  }

  const functionScalarDeclaration = emitFunctionScalarVariableDeclaration(statement, context, inferred)

  if (functionScalarDeclaration != null) {
    return functionScalarDeclaration
  }

  if (isArrayMethodCall(statement.init)) {
    context.diagnostics.push(
      diagnostic('CCJS_C_ARRAY_METHOD', 'array methods are not supported by the current C backend slice', statement.loc)
    )
    return [`double ${statement.name} = 0;`]
  }

  const timerHandleDeclaration = emitTimerVariableDeclaration(
    statement,
    context,
    timerLoweringDependencies,
    inferred
  )

  if (timerHandleDeclaration != null) {
    return timerHandleDeclaration
  }

  const cryptoHandleDeclaration = emitCryptoHandleVariableDeclaration(
    statement,
    context,
    cryptoLoweringDependencies,
    inferred
  )

  if (cryptoHandleDeclaration != null) {
    return cryptoHandleDeclaration
  }

  return emitNumberBooleanScalarVariableDeclaration(statement, context, inferred)
}

function isBoxedRuntimeValueAssignment(expression: AnyNode, context: CFunctionContext): boolean {
  return (
    expression.target?.type === 'Reference' &&
    expression.target.path.length === 1 &&
    isBoxedRuntimeValueName(expression.target.path[0], context)
  )
}

function isNullableRuntimeValueAssignment(expression: AnyNode, context: CFunctionContext): boolean {
  return (
    expression.target?.type === 'Reference' &&
    expression.target.path.length === 1 &&
    context.nullableVariables.has(expression.target.path[0])
  )
}

function emptyPreparedExpression(): PreparedExpression {
  return {
    lines: [],
    expression: 'ccjs_undefined_value()'
  }
}

function emitNullableRuntimeValueAssignment(expression: AnyNode, context: CFunctionContext): string[] {
  const name = expression.target.path[0]
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

    if (fields != null) {
      shape = {
        fields
      }
    }

    value = emitCObjectLiteralValueExpression(expression.value, context, shape)
  } else {
    value = emitCValueExpression(expression.value, context)
  }
  const temp = nextCName(context, 'ccjs_nullable_value')
  const lines: string[] = []

  for (const line of value.lines) {
    lines.push(line)
  }

  lines.push(`ccjs_value ${temp} = ${value.expression};`)

  for (const line of emitRuntimeNullableValueCheck(temp, expectedTag, context)) {
    lines.push(line)
  }

  lines.push(`ccjs_retain(${temp});`)
  lines.push(`ccjs_release(${name});`)
  lines.push(`${name} = ${temp};`)

  for (const line of clearNullableScalarNarrowing(name, context)) {
    lines.push(line)
  }

  return lines
}

function emitBoxedRuntimeValueAssignment(expression: AnyNode, context: CFunctionContext): string[] {
  const name = expression.target.path[0]
  const expected = context.variables.get(name)
  const value = emitCValueExpression(expression.value, context)
  const temp = nextCName(context, 'ccjs_box_value')
  let tag = 'CCJS_TAG_OBJECT'

  if (expected === 'string') {
    tag = 'CCJS_TAG_STRING'
  }

  const lines: string[] = []

  for (const line of value.lines) {
    lines.push(line)
  }

  lines.push(`ccjs_value ${temp} = ${value.expression};`)
  lines.push(emitRuntimeTypeCheck(`${temp}.tag != ${tag} || ${temp}.as.ref == 0`, context))
  lines.push(`ccjs_retain(${temp});`)
  lines.push(`ccjs_release(*${name});`)
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
    expression?.type === 'Reference' &&
    expression.path.length === 1 &&
    isBoxedRuntimeStringName(expression.path[0], context)
  )
}

function emitBoxedObjectVariableDeclaration(statement: AnyNode, context: CFunctionContext): string[] {
  const shapeName = nextCName(context, `ccjs_shape_${statement.name}`)
  const fieldsName = `${shapeName}_fields`
  const fields =
    statement.shape?.fields ??
    statement.init.properties.map((property: AnyNode) => ({
      name: property.key,
      readonly: false,
      valueType: inferExpressionType(property.value, context)
    }))
  const properties: Map<string, AnyNode> = new Map(
    statement.init.properties.map((property: AnyNode) => [property.key, property])
  )
  const lines = [`static const ccjs_field_info ${fieldsName}[] = {`]

  for (const field of fields) {
    lines.push(`  { ${cStringLiteral(field.name)}, ${emitCFieldFlags(field)} },`)
  }

  lines.push('};')
  lines.push(`static const ccjs_shape ${shapeName} = {`)
  lines.push(`  ${fields.length},`)
  lines.push(`  ${fieldsName}`)
  lines.push('};')
  registerBoxedValue(context, statement.name, 'object')
  context.boxedVariables.add(statement.name)
  context.variables.set(statement.name, 'object')
  context.objectShapes.set(
    statement.name,
    fields.map((field: CObjectShapeField) => ({
      name: field.name,
      optional: field.optional,
      ownership: field.ownership ?? 'strong',
      valueType: field.valueType,
      arrayElementType: field.arrayElementType,
      mapKeyType: field.mapKeyType,
      mapValueType: field.mapValueType,
      setElementType: field.setElementType
    }))
  )
  lines.push(`${statement.name} = ccjs_default_alloc(0, sizeof(ccjs_value), _Alignof(ccjs_value));`)
  lines.push(`if (${statement.name} == 0) ${emitFailureStatement(context)}`)
  lines.push(`*${statement.name} = ccjs_undefined_value();`)
  lines.push(emitStatusCheck(`ccjs_object_new(&ccjs_default_allocator, &${shapeName}, ${statement.name})`, context))

  for (let index = 0; index < fields.length; index++) {
    const field = fields[index]
    const property = properties.get(field.name)

    if (property == null) {
      if (field.optional !== true) {
        context.diagnostics.push(diagnostic('CCJS_MISSING_FIELD', `missing field ${field.name}`, statement.loc))
      }
      continue
    }

    const value = emitCValueExpression(property.value, context)

    for (const line of value.lines) {
      lines.push(line)
    }

    lines.push(emitStatusCheck(`ccjs_object_init_known(*${statement.name}, ${index}, ${value.expression})`, context))
  }

  return lines
}

function emitKnownObjectMemberVariableDeclaration(
  statement: AnyNode,
  member: CKnownObjectField,
  context: CFunctionContext
): string[] {
  return emitObjectMemberVariableDeclaration(
    statement,
    member,
    context,
    (temp: string) =>
      `ccjs_object_get_known(${emitObjectValueReference(member.objectName, context)}, ${member.index}, &${temp})`
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
      `ccjs_object_get(${emitObjectValueReference(member.objectName, context)}, ${cStringLiteral(member.key)}, ${utf8ByteLength(member.key)}, &${temp})`
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
    return emitObjectStringMemberVariableDeclaration(statement, member, context, emitGetCall)
  }

  if (!['number', 'boolean'].includes(member.valueType)) {
    let message = 'this object field type is not supported by the current C backend slice'

    if (member.valueType === 'function') {
      message =
        'stored callback object fields need delayed closure lifetime support and are not supported by the current C backend slice'
    }

    context.diagnostics.push(
      diagnostic(
        cUnsupportedExpressionCode(member.valueType),
        message,
        statement.loc
      )
    )
    return [`double ${statement.name} = 0;`]
  }

  const temp = nextCName(context, 'ccjs_field')
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
  lines.push(emitRuntimeTypeCheck(`${statement.name}.tag != CCJS_TAG_ARRAY || ${statement.name}.as.ref == 0`, context))

  context.variables.set(statement.name, 'array')
  if (member.arrayElementType == null) {
    context.runtimeArrayElementTypes.set(statement.name, 'unknown')
  } else {
    context.runtimeArrayElementTypes.set(statement.name, member.arrayElementType)
  }

  return lines
}

function emitObjectCollectionMemberVariableDeclaration(
  statement: AnyNode,
  member: CKnownObjectField,
  context: CFunctionContext,
  emitGetCall: TempValueEmitter
): string[] {
  registerOwnedValue(context, statement.name)

  let tag = 'CCJS_TAG_SET'
  const lines: string[] = []

  if (member.valueType === 'map') {
    tag = 'CCJS_TAG_MAP'
  }

  pushAll(lines, emitPrepareOwnedValueWrite(statement.name))
  lines.push(emitStatusCheck(emitGetCall(statement.name), context))
  lines.push(emitRuntimeTypeCheck(`${statement.name}.tag != ${tag} || ${statement.name}.as.ref == 0`, context))

  context.variables.set(statement.name, member.valueType)

  if (member.valueType === 'map') {
    let keyType = 'unknown'
    let valueType = 'unknown'

    if (member.mapKeyType != null) {
      keyType = member.mapKeyType
    }

    if (member.mapValueType != null) {
      valueType = member.mapValueType
    }

    context.mapTypes.set(statement.name, {
      key: keyType,
      value: valueType
    })
  } else {
    if (member.setElementType == null) {
      context.setElementTypes.set(statement.name, 'unknown')
    } else {
      context.setElementTypes.set(statement.name, member.setElementType)
    }
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
  lines.push(emitRuntimeTypeCheck(`${statement.name}.tag != CCJS_TAG_BYTES || ${statement.name}.as.ref == 0`, context))

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
  lines.push(emitRuntimeTypeCheck(`${statement.name}.tag != CCJS_TAG_OBJECT || ${statement.name}.as.ref == 0`, context))

  context.variables.set(statement.name, 'object')

  if (statement.shape != null) {
    registerObjectShape(context, statement.name, statement.shape)
  }

  return lines
}

function emitObjectStringMemberVariableDeclaration(
  statement: AnyNode,
  member: CKnownObjectField,
  context: CFunctionContext,
  emitGetCall: TempValueEmitter
): string[] {
  const temp = nextCName(context, 'ccjs_field')
  let constPrefix = ''
  const lines: string[] = []

  registerOwnedValue(context, temp)

  if (statement.kind === 'const') {
    constPrefix = 'const '
  }

  pushAll(lines, emitPrepareOwnedValueWrite(temp))
  lines.push(emitStatusCheck(emitGetCall(temp), context))
  lines.push(emitRuntimeTypeCheck(`${temp}.tag != CCJS_TAG_STRING || ${temp}.as.ref == 0`, context))
  lines.push(`${constPrefix}ccjs_string* ${statement.name} = (ccjs_string*)${temp}.as.ref;`)

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
  lines.push(
    emitStatusCheck(
      `ccjs_object_set_known(${emitObjectValueReference(member.objectName, context)}, ${member.index}, ${value.expression})`,
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
      `ccjs_object_set(${emitObjectValueReference(member.objectName, context)}, ${cStringLiteral(member.key)}, ${utf8ByteLength(member.key)}, ${value.expression})`,
      context
    )
  )

  return lines
}

function emitKnownArrayIndexVariableDeclaration(
  statement: AnyNode,
  element: CKnownArrayElement,
  context: CFunctionContext
): string[] {
  if (element.valueType === 'string') {
    return emitKnownArrayStringIndexVariableDeclaration(statement, element, context)
  }

  if (!['number', 'boolean'].includes(element.valueType)) {
    context.diagnostics.push(
      diagnostic(
        cUnsupportedExpressionCode(element.valueType),
        unsupportedArrayElementMessage(element.valueType),
        statement.loc
      )
    )
    return [`double ${statement.name} = 0;`]
  }

  const temp = nextCName(context, 'ccjs_item')
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
  lines.push(emitStatusCheck(`ccjs_array_get(${element.arrayName}, ${element.index}, &${temp})`, context))
  lines.push(`${constPrefix}double ${statement.name} = ${runtimeValueExpression};`)

  context.variables.set(statement.name, element.valueType)

  return lines
}

function emitKnownArrayStringIndexVariableDeclaration(
  statement: AnyNode,
  element: CKnownArrayElement,
  context: CFunctionContext
): string[] {
  const temp = nextCName(context, 'ccjs_item')
  let constPrefix = ''
  const lines: string[] = []

  registerOwnedValue(context, temp)

  if (statement.kind === 'const') {
    constPrefix = 'const '
  }

  pushAll(lines, emitPrepareOwnedValueWrite(temp))
  lines.push(emitStatusCheck(`ccjs_array_get(${element.arrayName}, ${element.index}, &${temp})`, context))
  lines.push(emitRuntimeTypeCheck(`${temp}.tag != CCJS_TAG_STRING || ${temp}.as.ref == 0`, context))
  lines.push(`${constPrefix}ccjs_string* ${statement.name} = (ccjs_string*)${temp}.as.ref;`)

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
  lines.push(emitStatusCheck(`ccjs_array_set(${element.arrayName}, ${element.index}, ${value.expression})`, context))

  return lines
}

function emitArrayVariableDeclaration(statement: AnyNode, context: CFunctionContext): string[] {
  const lines: string[] = []
  const shapes: CArrayElementInfo[] = []

  pushAll(lines, emitPrepareOwnedValueWrite(statement.name))
  lines.push(
    emitStatusCheck(
      `ccjs_array_new(&ccjs_default_allocator, ${statement.init.elements.length}, &${statement.name})`,
      context
    )
  )

  registerOwnedValue(context, statement.name)
  context.variables.set(statement.name, 'array')
  for (const element of statement.init.elements) {
    shapes.push({
      valueType: inferExpressionType(element, context)
    })
  }
  context.arrayShapes.set(statement.name, shapes)

  for (let index = 0; index < statement.init.elements.length; index++) {
    const element = statement.init.elements[index]
    const value = emitCValueExpression(element, context)

    pushAll(lines, value.lines)
    lines.push(emitStatusCheck(`ccjs_array_set(${statement.name}, ${index}, ${value.expression})`, context))
  }

  return lines
}

function unsupportedArrayElementMessage(valueType: string): string {
  if (valueType === 'function') {
    return 'stored callback array elements need delayed closure lifetime support and are not supported by the current C backend slice'
  }

  return 'this array element type is not supported by the current C backend slice'
}

function emitCValueExpression(expression: AnyNode, context: CFunctionContext): PreparedExpression {
  return emitCValueExpressionWithDependencies(expression, context, cValueExpressionDependencies)
}

function emitNullableScalarValueExpression(expression: AnyNode, context: CFunctionContext): PreparedExpression {
  if (expression?.type === 'NullLiteral') {
    return {
      lines: [],
      expression: 'ccjs_null_value()'
    }
  }

  if (isNullableScalarRuntimeExpression(expression, context)) {
    return emitPreparedNullableScalarRuntimeValueExpression(expression, context)
  }

  const valueType = inferExpressionType(expression, context)

  if (!isNullableScalarType(valueType)) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_NULLISH',
        'nullable scalar values currently support only number, boolean and null values in C',
        expression?.loc
      )
    )

    return {
      lines: [],
      expression: 'ccjs_null_value()'
    }
  }

  const value = emitPreparedNumberExpression(expression, context)
  let runtimeExpression = `ccjs_number_value(${value.expression})`

  if (valueType === 'boolean') {
    runtimeExpression = `ccjs_bool_value((${value.expression}) != 0)`
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
    expression?.type === 'Reference' &&
    expression.path.length === 1 &&
    context.nullableVariables.has(expression.path[0]) &&
    isNullableScalarType(context.variables.get(expression.path[0]))
  ) {
    return {
      lines: [],
      expression: expression.path[0]
    }
  }

  if (expression?.type === 'OptionalMemberExpression') {
    return emitCOptionalMemberValueExpression(expression, context)
  }

  if (expression?.type === 'OptionalIndexExpression') {
    return emitCOptionalIndexValueExpression(expression, context)
  }

  if (expression?.type === 'OptionalCallExpression') {
    return emitOptionalRuntimeCallbackCallValueExpression(expression, context)
  }

  const numberConversion = emitCNumberConversionValueExpression(expression, context)

  if (numberConversion != null) {
    return numberConversion
  }

  const mapIndexGet = emitPreparedMapIndexGetExpression(expression, context)

  if (mapIndexGet != null) {
    return mapIndexGet
  }

  if (expression?.type === 'CallExpression' && isNullableScalarRuntimeExpression(expression, context)) {
    const valueType = inferExpressionType(expression, context)
    const expectedTag = cRuntimeValueTag(valueType)
    const call = emitPreparedCallExpression(expression, context)
    const temp = nextCName(context, 'ccjs_nullable_value')
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

  context.diagnostics.push(
    diagnostic(
      'CCJS_C_NULLISH',
      'this nullable scalar expression is not supported by the current C backend slice',
      expression?.loc
    )
  )

  return {
    lines: [],
    expression: 'ccjs_null_value()'
  }
}

function emitNullableFunctionValueExpression(
  expression: AnyNode,
  functionType: CFunctionType | null | undefined,
  context: CFunctionContext
): PreparedExpression {
  if (expression?.type === 'NullLiteral') {
    return {
      lines: [],
      expression: 'ccjs_null_value()'
    }
  }

  if (
    expression?.type === 'Reference' &&
    expression.path.length === 1 &&
    context.nullableVariables.has(expression.path[0]) &&
    context.variables.get(expression.path[0]) === 'function'
  ) {
    return {
      lines: [],
      expression: expression.path[0]
    }
  }

  return emitRuntimeCallbackValue(expression, normalizeFunctionType(functionType), context)
}

function emitCArrayLiteralValueExpression(expression: AnyNode, context: CFunctionContext): PreparedExpression {
  const temp = nextCName(context, 'ccjs_array')
  const lines: string[] = []

  registerOwnedValue(context, temp)

  pushAll(lines, emitPrepareOwnedValueWrite(temp))
  lines.push(emitStatusCheck(`ccjs_array_new(&ccjs_default_allocator, ${expression.elements.length}, &${temp})`, context))

  for (let index = 0; index < expression.elements.length; index++) {
    const element = expression.elements[index]
    const value = emitCValueExpression(element, context)

    pushAll(lines, value.lines)
    lines.push(emitStatusCheck(`ccjs_array_set(${temp}, ${index}, ${value.expression})`, context))
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
  const temp = nextCName(context, 'ccjs_object')
  const shapeName = nextCName(context, 'ccjs_shape_value')
  const fieldsName = `${shapeName}_fields`
  const fields: CObjectShapeField[] = []
  const properties: Map<string, AnyNode> = new Map()
  const lines = [`static const ccjs_field_info ${fieldsName}[] = {`]

  if (shape != null && shape.fields != null) {
    for (const field of shape.fields) {
      fields.push(field)
    }
  } else {
    for (const property of expression.properties) {
      fields.push({
        name: property.key,
        readonly: false,
        valueType: inferExpressionType(property.value, context)
      })
    }
  }

  for (const property of expression.properties) {
    properties.set(property.key, property)
  }

  for (const field of fields) {
    lines.push(`  { ${cStringLiteral(field.name)}, ${emitCFieldFlags(field)} },`)
  }

  lines.push('};')
  lines.push(`static const ccjs_shape ${shapeName} = {`)
  lines.push(`  ${fields.length},`)
  lines.push(`  ${fieldsName}`)
  lines.push('};')
  registerOwnedValue(context, temp)
  pushAll(lines, emitPrepareOwnedValueWrite(temp))
  lines.push(emitStatusCheck(`ccjs_object_new(&ccjs_default_allocator, &${shapeName}, &${temp})`, context))

  for (let index = 0; index < fields.length; index++) {
    const field = fields[index]
    const property = properties.get(field.name)

    if (property == null) {
      if (field.optional !== true) {
        context.diagnostics.push(diagnostic('CCJS_MISSING_FIELD', `missing field ${field.name}`, expression.loc))
      }
      continue
    }

    const value = emitCValueExpression(property.value, context)

    pushAll(lines, value.lines)
    lines.push(emitStatusCheck(`ccjs_object_init_known(${temp}, ${index}, ${value.expression})`, context))
  }

  return {
    lines,
    expression: temp
  }
}

function emitErrorObjectVariableDeclaration(statement: AnyNode, context: CFunctionContext): string[] {
  registerOwnedValue(context, statement.name)
  context.variables.set(statement.name, 'object')
  registerErrorObjectShape(context, statement.name)

  return emitCErrorObjectInitLines(statement.name, statement.init, context)
}

function emitCErrorObjectValueExpression(expression: AnyNode, context: CFunctionContext): PreparedExpression {
  const temp = nextCName(context, 'ccjs_error_object')
  registerOwnedValue(context, temp)

  return {
    lines: emitCErrorObjectInitLines(temp, expression, context),
    expression: temp
  }
}

function emitCErrorObjectInitLines(target: string, expression: AnyNode, context: CFunctionContext): string[] {
  const shapeName = nextCName(context, 'ccjs_shape_error')
  const fieldsName = `${shapeName}_fields`
  const parts = errorConstructorExpressions(expression, context)
  const name = emitCValueExpression(cStringLiteralNode('Error', expression.loc), context)
  const message = emitCValueExpression(parts.message, context)
  const code = emitCValueExpression(parts.code, context)
  const cause = emitCValueExpression(parts.cause, context)
  const lines: string[] = []

  lines.push(`static const ccjs_field_info ${fieldsName}[] = {`)
  lines.push(`  { ${cStringLiteral('name')}, CCJS_FIELD_READONLY },`)
  lines.push(`  { ${cStringLiteral('message')}, CCJS_FIELD_READONLY },`)
  lines.push(`  { ${cStringLiteral('code')}, CCJS_FIELD_READONLY },`)
  lines.push(`  { ${cStringLiteral('cause')}, CCJS_FIELD_READONLY },`)
  lines.push('};')
  lines.push(`static const ccjs_shape ${shapeName} = {`)
  lines.push('  4,')
  lines.push(`  ${fieldsName}`)
  lines.push('};')
  pushAll(lines, emitPrepareOwnedValueWrite(target))
  lines.push(emitStatusCheck(`ccjs_object_new(&ccjs_default_allocator, &${shapeName}, &${target})`, context))
  pushAll(lines, name.lines)
  lines.push(emitStatusCheck(`ccjs_object_init_known(${target}, 0, ${name.expression})`, context))
  pushAll(lines, message.lines)
  lines.push(emitStatusCheck(`ccjs_object_init_known(${target}, 1, ${message.expression})`, context))
  pushAll(lines, code.lines)
  lines.push(emitStatusCheck(`ccjs_object_init_known(${target}, 2, ${code.expression})`, context))
  pushAll(lines, cause.lines)
  lines.push(emitStatusCheck(`ccjs_object_init_known(${target}, 3, ${cause.expression})`, context))

  return lines
}

function errorConstructorExpressions(
  expression: AnyNode,
  context: CFunctionContext
): CErrorConstructorParts {
  if (expression.args.length > 2) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_ARG_COUNT',
        `Error constructor expects at most 2 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    )
  }

  let message = cStringLiteralNode('', expression.loc)
  const options = expression.args[1]
  let code = cStringLiteralNode('', expression.loc)
  let cause = cNullLiteralNode(expression.loc)

  if (expression.args[0] != null) {
    message = expression.args[0]
  }

  if (inferExpressionType(message, context) !== 'string') {
    let loc = expression.loc

    if (message.loc != null) {
      loc = message.loc
    }

    context.diagnostics.push(
      diagnostic(
        'CCJS_TYPE_MISMATCH',
        'Error message must be a string in the current C backend slice',
        loc
      )
    )

    return {
      message: cStringLiteralNode('', expression.loc),
      code,
      cause
    }
  }

  if (options == null) {
    return {
      message,
      code,
      cause
    }
  }

  if (options.type !== 'ObjectLiteral') {
    let loc = expression.loc

    if (options.loc != null) {
      loc = options.loc
    }

    context.diagnostics.push(
      diagnostic(
        'CCJS_TYPE_MISMATCH',
        'Error options must be an object literal in the current C backend slice',
        loc
      )
    )

    return {
      message,
      code,
      cause
    }
  }

  for (const property of options.properties) {
    if (property.key === 'code') {
      if (inferExpressionType(property.value, context) !== 'string') {
        let loc = property.loc

        if (property.value.loc != null) {
          loc = property.value.loc
        }

        context.diagnostics.push(
          diagnostic(
            'CCJS_TYPE_MISMATCH',
            'Error code must be a string in the current C backend slice',
            loc
          )
        )
      } else {
        code = property.value
      }
    } else if (property.key === 'cause') {
      if (property.value.type === 'NullLiteral' || isErrorValueExpression(property.value, context)) {
        cause = property.value
      } else {
        let loc = property.loc

        if (property.value.loc != null) {
          loc = property.value.loc
        }

        context.diagnostics.push(
          diagnostic(
            'CCJS_TYPE_MISMATCH',
            'Error cause must be an Error object or null in the current C backend slice',
            loc
          )
        )
      }
    } else {
      let loc = options.loc

      if (property.loc != null) {
        loc = property.loc
      }

      context.diagnostics.push(
        diagnostic('CCJS_UNKNOWN_FIELD', `unknown Error option ${property.key}`, loc)
      )
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
    context.diagnostics.push(
      diagnostic('CCJS_C_NULLISH', 'nullish coalescing is not supported by the current C backend slice', expression.loc)
    )

    return {
      lines: [],
      expression: 'ccjs_undefined_value()'
    }
  }

  const left = emitCValueExpression(expression.left, context)
  const right = emitCValueExpression(expression.right, context)
  const temp = nextCName(context, 'ccjs_value')
  const expectedTag = cRuntimeValueTag(inferExpressionType(expression, context))
  const lines: string[] = []
  registerOwnedValue(context, temp)

  pushAll(lines, left.lines)
  pushAll(lines, emitPrepareOwnedValueWrite(temp))
  lines.push(`if (${left.expression}.tag == CCJS_TAG_NULL) {`)
  pushIndented(lines, right.lines, '  ')
  lines.push(`  ${temp} = ${right.expression};`)
  pushIndented(lines, emitRuntimeNullableValueCheck(temp, expectedTag, context), '  ')
  lines.push(`  ccjs_retain(${temp});`)
  lines.push('} else {')
  lines.push(`  ${temp} = ${left.expression};`)
  pushIndented(lines, emitRuntimeNullableValueCheck(temp, expectedTag, context), '  ')
  lines.push(`  ccjs_retain(${temp});`)
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
  let stream = 'CCJS_CONSOLE_STDOUT'

  if (method === 'warn' || method === 'error') {
    stream = 'CCJS_CONSOLE_STDERR'
  }

  const isStdout = stream === 'CCJS_CONSOLE_STDOUT'

  if (args.length === 0) {
    const emptyLines: string[] = []

    if (isStdout) {
      emptyLines.push('printf("\\n");')
    } else {
      emptyLines.push(`if (ccjs_console_printf(${stream}, "\\n") < 0) ${emitFailureStatement(context)}`)
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

  const format = escapeCString(parts.join(' '))

  if (values.length === 0) {
    if (isStdout) {
      lines.push(`printf("${format}\\n");`)
    } else {
      lines.push(`if (ccjs_console_printf(${stream}, "${format}\\n") < 0) ${emitFailureStatement(context)}`)
    }
  } else {
    if (isStdout) {
      lines.push(`printf("${format}\\n", ${values.join(', ')});`)
    } else {
      lines.push(
        `if (ccjs_console_printf(${stream}, "${format}\\n", ${values.join(', ')}) < 0) ${emitFailureStatement(context)}`
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
    return emitNumberLogValue(expression, valueType, context)
  }

  if (valueType === 'object' && isErrorValueExpression(expression, context)) {
    return emitRuntimeErrorLogValue(expression, context)
  }

  context.diagnostics.push(
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

function emitStringLogValue(expression: AnyNode, context: CFunctionContext): ConsoleLogValue {
  if (expression?.type === 'Reference') {
    const name = expression.path.join('_')

    if (isBoxedRuntimeStringName(name, context)) {
      const string = nextCName(context, 'ccjs_log_string')

      return {
        lines: [
          emitRuntimeTypeCheck(`(*${name}).tag != CCJS_TAG_STRING || (*${name}).as.ref == 0`, context),
          `ccjs_string* ${string} = (ccjs_string*)(*${name}).as.ref;`
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
    const netAddressMember = resolveNetAddressStringMember(expression, context)

    if (netAddressMember != null) {
      return {
        lines: [],
        format: '%s',
        values: [netAddressMember]
      }
    }

    const member = resolveKnownObjectMember(expression, context)

    if (member != null && member.valueType === 'string') {
      return emitRuntimeStringLogValue(
        (temp: string) =>
          `ccjs_object_get_known(${emitObjectValueReference(member.objectName, context)}, ${member.index}, &${temp})`,
        context
      )
    }
  }

  if (isIndexAccessExpression(expression)) {
    const element = resolveKnownArrayIndex(expression, context)

    if (element != null && element.valueType === 'string') {
      return emitRuntimeStringLogValue(
        (temp: string) => `ccjs_array_get(${element.arrayName}, ${element.index}, &${temp})`,
        context
      )
    }

    const field = resolveKnownObjectIndex(expression, context)

    if (field != null && field.valueType === 'string') {
      return emitRuntimeStringLogValue(
        (temp: string) =>
          `ccjs_object_get(${emitObjectValueReference(field.objectName, context)}, ${cStringLiteral(field.key)}, ${utf8ByteLength(field.key)}, &${temp})`,
        context
      )
    }

    const runtimeElement = resolveRuntimeArrayIndex(expression, context)

    if (runtimeElement != null && runtimeElement.valueType === 'string') {
      const value = emitPreparedRuntimeArrayIndexValue(expression, runtimeElement, context, 'ccjs_log_value')
      const string = nextCName(context, 'ccjs_log_string')
      const lines: string[] = []

      pushAll(lines, value.lines)
      lines.push(
        emitRuntimeTypeCheck(
          `${value.expression}.tag != CCJS_TAG_STRING || ${value.expression}.as.ref == 0`,
          context
        )
      )
      lines.push(`ccjs_string* ${string} = (ccjs_string*)${value.expression}.as.ref;`)

      return {
        lines,
        format: '%.*s',
        values: [`(int)${string}->len`, `${string}->bytes`]
      }
    }
  }

  if (isRuntimeProducedStringExpression(expression, context)) {
    const value = emitCValueExpression(expression, context)
    const string = nextCName(context, 'ccjs_log_string')
    const lines: string[] = []

    pushAll(lines, value.lines)
    lines.push(`ccjs_string* ${string} = (ccjs_string*)${value.expression}.as.ref;`)

    return {
      lines,
      format: '%.*s',
      values: [`(int)${string}->len`, `${string}->bytes`]
    }
  }

  if (isStringConcatExpression(expression, context)) {
    const value = emitCValueExpression(expression, context)
    const string = nextCName(context, 'ccjs_log_string')
    const lines: string[] = []

    pushAll(lines, value.lines)
    lines.push(`ccjs_string* ${string} = (ccjs_string*)${value.expression}.as.ref;`)

    return {
      lines,
      format: '%.*s',
      values: [`(int)${string}->len`, `${string}->bytes`]
    }
  }

  if (isNullishCoalescingExpression(expression) && canLowerCNullishCoalescingExpression(expression, context)) {
    const value = emitCValueExpression(expression, context)
    const string = nextCName(context, 'ccjs_log_string')
    const lines: string[] = []

    pushAll(lines, value.lines)
    lines.push(emitRuntimeTypeCheck(`${value.expression}.tag != CCJS_TAG_STRING || ${value.expression}.as.ref == 0`, context))
    lines.push(`ccjs_string* ${string} = (ccjs_string*)${value.expression}.as.ref;`)

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

function emitNumberLogValue(expression: AnyNode, valueType: string, context: CFunctionContext): ConsoleLogValue {
  if (isMemberAccessExpression(expression)) {
    const stringLength = emitPreparedStringLengthExpression(expression, context)

    if (stringLength != null) {
      return {
        lines: stringLength.lines,
        format: '%g',
        values: [`((double)${stringLength.expression})`]
      }
    }

    const length = emitPreparedArrayLengthExpression(expression, context)

    if (length != null) {
      return {
        lines: length.lines,
        format: '%g',
        values: [`((double)${length.expression})`]
      }
    }

    const member = resolveKnownObjectMember(expression, context)

    if (member != null && ['number', 'boolean'].includes(member.valueType)) {
      return emitRuntimeNumberLogValue(
        member.valueType,
        (temp: string) =>
          `ccjs_object_get_known(${emitObjectValueReference(member.objectName, context)}, ${member.index}, &${temp})`,
        context
      )
    }
  }

  if (isIndexAccessExpression(expression)) {
    const element = resolveKnownArrayIndex(expression, context)

    if (element != null && ['number', 'boolean'].includes(element.valueType)) {
      return emitRuntimeNumberLogValue(
        element.valueType,
        (temp: string) => `ccjs_array_get(${element.arrayName}, ${element.index}, &${temp})`,
        context
      )
    }

    const field = resolveKnownObjectIndex(expression, context)

    if (field != null && ['number', 'boolean'].includes(field.valueType)) {
      return emitRuntimeNumberLogValue(
        field.valueType,
        (temp: string) =>
          `ccjs_object_get(${emitObjectValueReference(field.objectName, context)}, ${cStringLiteral(field.key)}, ${utf8ByteLength(field.key)}, &${temp})`,
        context
      )
    }

    const runtimeElement = resolveRuntimeArrayIndex(expression, context)

    if (runtimeElement != null && ['number', 'boolean'].includes(runtimeElement.valueType)) {
      const value = emitPreparedRuntimeArrayIndexValue(expression, runtimeElement, context, 'ccjs_log_value')
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

function emitRuntimeStringLogValue(
  emitGetCall: TempValueEmitter,
  context: CFunctionContext
): ConsoleLogValue {
  const value = nextCName(context, 'ccjs_log_value')
  const string = nextCName(context, 'ccjs_log_string')
  const lines: string[] = []

  registerOwnedValue(context, value)

  pushAll(lines, emitPrepareOwnedValueWrite(value))
  lines.push(emitStatusCheck(emitGetCall(value), context))
  lines.push(emitRuntimeTypeCheck(`${value}.tag != CCJS_TAG_STRING || ${value}.as.ref == 0`, context))
  lines.push(`ccjs_string* ${string} = (ccjs_string*)${value}.as.ref;`)

  return {
    lines,
    format: '%.*s',
    values: [`(int)${string}->len`, `${string}->bytes`]
  }
}

function emitRuntimeNumberLogValue(
  valueType: string,
  emitGetCall: TempValueEmitter,
  context: CFunctionContext
): ConsoleLogValue {
  const value = nextCName(context, 'ccjs_log_value')
  const lines: string[] = []
  let formattedValue = `${value}.as.number`

  registerOwnedValue(context, value)

  if (valueType === 'boolean') {
    formattedValue = `((double)(${value}.as.boolean ? 1 : 0))`
  }

  pushAll(lines, emitPrepareOwnedValueWrite(value))
  lines.push(emitStatusCheck(emitGetCall(value), context))

  return {
    lines,
    format: '%g',
    values: [formattedValue]
  }
}

function emitRuntimeErrorLogValue(expression: AnyNode, context: CFunctionContext): ConsoleLogValue {
  const object = emitErrorLogObjectExpression(expression, context)
  const nameValue = nextCName(context, 'ccjs_log_value')
  const messageValue = nextCName(context, 'ccjs_log_value')
  const nameString = nextCName(context, 'ccjs_log_string')
  const messageString = nextCName(context, 'ccjs_log_string')
  const lines: string[] = []

  registerOwnedValue(context, nameValue)
  registerOwnedValue(context, messageValue)

  pushAll(lines, object.lines)
  pushAll(lines, emitPrepareOwnedValueWrite(nameValue))
  pushAll(lines, emitPrepareOwnedValueWrite(messageValue))
  lines.push(emitStatusCheck(`ccjs_object_get_known(${object.expression}, 0, &${nameValue})`, context))
  lines.push(emitStatusCheck(`ccjs_object_get_known(${object.expression}, 1, &${messageValue})`, context))
  lines.push(emitRuntimeTypeCheck(`${nameValue}.tag != CCJS_TAG_STRING || ${nameValue}.as.ref == 0`, context))
  lines.push(emitRuntimeTypeCheck(`${messageValue}.tag != CCJS_TAG_STRING || ${messageValue}.as.ref == 0`, context))
  lines.push(`ccjs_string* ${nameString} = (ccjs_string*)${nameValue}.as.ref;`)
  lines.push(`ccjs_string* ${messageString} = (ccjs_string*)${messageValue}.as.ref;`)

  return {
    lines,
    format: '%.*s: %.*s',
    values: [`(int)${nameString}->len`, `${nameString}->bytes`, `(int)${messageString}->len`, `${messageString}->bytes`]
  }
}

function emitErrorLogObjectExpression(expression: AnyNode, context: CFunctionContext): PreparedExpression {
  if (expression?.type === 'Reference' && expression.path.length === 1) {
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
  if (expression?.type === 'Reference') {
    const name = expression.path.join('_')

    if (context.variables.has(name)) {
      if (context.boxedVariables.has(name)) {
        return `(*${name})`
      }

      return name
    }

    const functionName = context.functionNames.get(name)

    if (functionName != null) {
      return functionName
    }

    return name
  }

  context.diagnostics.push(
    diagnostic(
      'CCJS_C_ASSIGNMENT_TARGET',
      'this assignment target is not supported by the current C backend slice',
      expression?.loc
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
  lines.push(emitStatusCheck(`ccjs_fetch_abort_controller_new(&ccjs_default_allocator, &${statement.name})`, context))

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
      `${controller.expression}.tag != CCJS_TAG_OBJECT || ${controller.expression}.as.ref == 0`,
      context
    )
  )
  lines.push(emitStatusCheck(`ccjs_fetch_abort_controller_abort(${controller.expression})`, context))

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

  const out = nextCName(context, 'ccjs_debug_memory')
  const stats = nextCName(context, 'ccjs_debug_stats')
  const shapeName = nextCName(context, 'ccjs_shape_debug_memory')
  const fieldsName = `${shapeName}_fields`
  const lines = [`static const ccjs_field_info ${fieldsName}[] = {`]

  for (const field of debugMemoryStatsFields) {
    lines.push(`  { ${cStringLiteral(field.name)}, CCJS_FIELD_READONLY },`)
  }

  lines.push('};')
  lines.push(`static const ccjs_shape ${shapeName} = {`)
  lines.push(`  ${debugMemoryStatsFields.length},`)
  lines.push(`  ${fieldsName}`)
  lines.push('};')
  lines.push(`ccjs_debug_memory_stats ${stats};`)
  lines.push('ccjs_debug_memory_ensure_allocator();')
  lines.push(`ccjs_debug_memory_snapshot(&${stats});`)
  registerOwnedValue(context, out)
  pushAll(lines, emitPrepareOwnedValueWrite(out))
  lines.push(emitStatusCheck(`ccjs_object_new(&ccjs_default_allocator, &${shapeName}, &${out})`, context))

  for (let index = 0; index < debugMemoryStatsFields.length; index++) {
    const field = debugMemoryStatsFields[index]

    lines.push(
      emitStatusCheck(
        `ccjs_object_init_known(${out}, ${index}, ccjs_number_value((ccjs_number)${stats}.${field.cField}))`,
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
  expression: AnyNode,
  context: CFunctionContext,
  options: PreparedCallOptions = {}
): PreparedExpression | null {
  if (
    expression == null ||
    expression.type !== 'CallExpression' ||
    !isAsyncFunctionCallee(expression.callee, context) ||
    expression.valueType !== 'promise'
  ) {
    return null
  }

  let valueType = 'unknown'
  const awaitedValueType = resolveCAsyncFunctionAwaitValueType(expression.callee, context)

  if (awaitedValueType != null) {
    valueType = awaitedValueType
  } else if (expression.promiseValueType != null) {
    valueType = expression.promiseValueType
  }

  const taskCall = emitPreparedAsyncTaskPromiseCallExpression(expression, valueType, context, options)

  if (taskCall != null) {
    return taskCall
  }

  if (isThrowingFunctionCallee(expression.callee, context)) {
    return emitPreparedThrowingAsyncFunctionPromiseCallExpression(expression, valueType, context, options)
  }

  if (!isSupportedAsyncFunctionPromiseValueType(valueType)) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_ASYNC',
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

  let out = nextCName(context, 'ccjs_promise')

  if (options.out != null) {
    out = options.out
  }

  const call = emitPreparedCallExpression(expression, context)
  let managedValue: string | null = null
  let value = 'ccjs_undefined_value()'
  let valueCheck = ''
  const lines: string[] = []

  if (isManagedRuntimeReturnType(valueType)) {
    managedValue = nextCName(context, 'ccjs_async_value')
    value = managedValue
  } else if (valueType === 'boolean') {
    value = `ccjs_bool_value((${call.expression}) != 0)`
  } else if (valueType === 'number') {
    value = `ccjs_number_value(${call.expression})`
  }

  if (managedValue != null) {
    valueCheck = emitRuntimeValueCheck(managedValue, cRuntimeValueTag(valueType), context)
  }

  if (managedValue != null) {
    registerOwnedValue(context, managedValue)
  }

  if (options.owned !== false) {
    registerOwnedPromise(context, out, valueType, 'unknown')
  }

  pushAll(lines, call.lines)

  if (managedValue != null) {
    pushAll(lines, emitPrepareOwnedValueWrite(managedValue))
    lines.push(`${managedValue} = ${call.expression};`)

    if (valueCheck !== '') {
      lines.push(valueCheck)
    }

    lines.push(emitStatusCheck(`ccjs_promise_resolved(${emitEventLoopReference(context)}, ${value}, &${out})`, context))
    pushAll(lines, emitPrepareOwnedValueWrite(managedValue))
  } else {
    lines.push(emitStatusCheck(`ccjs_promise_resolved(${emitEventLoopReference(context)}, ${value}, &${out})`, context))
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
  if (expression.callee == null || expression.callee.type !== 'Reference' || expression.callee.path.length !== 1) {
    return null
  }

  const wrapper = context.asyncTaskWrappers.get(expression.callee.path[0])

  if (wrapper == null) {
    return null
  }

  registerEventLoop(context)

  let out = nextCName(context, 'ccjs_promise')

  if (options.out != null) {
    out = options.out
  }

  const prepared = emitPreparedCallArgs(expression, wrapper.params, context)
  const args: string[] = [emitEventLoopReference(context)]
  const lines: string[] = []

  pushAll(args, prepared.args)
  args.push(`&${out}`)

  if (options.owned !== false) {
    registerOwnedPromise(context, out, valueType, 'unknown')
  }

  pushAll(lines, prepared.lines)
  lines.push(emitStatusCheck(`${wrapper.startName}(${args.join(', ')})`, context))

  return {
    lines,
    expression: out,
    valueType,
    rejectionValueType: 'unknown'
  }
}

function emitPreparedThrowingAsyncFunctionPromiseCallExpression(
  expression: AnyNode,
  valueType: string,
  context: CFunctionContext,
  options: PreparedCallOptions = {}
): PreparedExpression | null {
  if (!isSupportedAsyncFunctionPromiseValueType(valueType)) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_ASYNC',
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

  if (params == null) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_ASYNC',
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

  registerEventLoop(context)
  registerErrorChannel(context)

  let out = nextCName(context, 'ccjs_promise')

  if (options.out != null) {
    out = options.out
  }

  const prepared = emitPreparedCallArgs(expression, params, context)
  let result: string | null = null
  if (valueType !== 'void') {
    result = nextCName(context, 'ccjs_async_result')
  }
  const managedResult = result != null && isManagedRuntimeReturnType(valueType)
  const status = nextCName(context, 'ccjs_async_status')
  const args: string[] = []
  const rejectionValueType = resolveCFunctionRejectionValueType(expression.callee, context)
  let fulfilledValue = 'ccjs_undefined_value()'
  let valueCheck = ''

  pushAll(args, prepared.args)

  if (result != null) {
    if (valueType === 'boolean') {
      fulfilledValue = `ccjs_bool_value((${result}) != 0)`
    } else if (valueType === 'number') {
      fulfilledValue = `ccjs_number_value(${result})`
    } else {
      fulfilledValue = result
    }
  }

  if (managedResult && result != null) {
    valueCheck = emitRuntimeValueCheck(result, cRuntimeValueTag(valueType), context)
  }

  if (result != null) {
    args.push(`&${result}`)
  }

  args.push('&ccjs_error')

  if (options.owned !== false) {
    registerOwnedPromise(context, out, valueType, rejectionValueType)
  }

  if (managedResult && result != null) {
    registerOwnedValue(context, result)
  }

  const resultPreparationLines: string[] = []
  if (result != null) {
    if (managedResult) {
      pushAll(resultPreparationLines, emitPrepareOwnedValueWrite(result))
    } else {
      resultPreparationLines.push(`double ${result} = 0;`)
    }
  }

  const managedResultResetLines: string[] = []
  if (managedResult && result != null) {
    for (const line of emitPrepareOwnedValueWrite(result)) {
      managedResultResetLines.push(`  ${line}`)
    }
  }

  const rejectedCall = `ccjs_promise_rejected(${emitEventLoopReference(context)}, ccjs_error, &${out})`
  const resolvedCall = `ccjs_promise_resolved(${emitEventLoopReference(context)}, ${fulfilledValue}, &${out})`
  const lines: string[] = []

  pushAll(lines, prepared.lines)
  pushAll(lines, emitPrepareOwnedValueWrite('ccjs_error'))
  pushAll(lines, resultPreparationLines)
  lines.push(`ccjs_status ${status} = ${emitCallee(expression.callee, context)}(${args.join(', ')});`)
  lines.push(`if (${status} == CCJS_ERR_THROW) {`)
  lines.push(`  ${emitStatusCheck(rejectedCall, context)}`)
  lines.push('  ccjs_release(ccjs_error);')
  lines.push('  ccjs_error = ccjs_undefined_value();')
  lines.push('} else {')
  lines.push(`  if (${status} != CCJS_OK) ${emitFailureStatement(context)}`)

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
  if (callee == null || callee.type !== 'Reference' || callee.path.length !== 1) {
    return 'unknown'
  }

  let types: IrThrowValueType[] = []
  const storedTypes = context.functionThrowValueTypes.get(callee.path[0])

  if (storedTypes != null) {
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

  if (promiseExpression != null) {
    let valueType = 'unknown'
    const promisedValueType = knownValueType(promiseExpression.valueType)
    const expressionPromiseValueType = knownValueType(expression.promiseValueType)
    const resolvedValueType = resolvePromiseExpressionValueType(expression, context)

    if (promisedValueType != null) {
      valueType = promisedValueType
    } else if (expressionPromiseValueType != null) {
      valueType = expressionPromiseValueType
    } else if (resolvedValueType != null) {
      valueType = resolvedValueType
    }

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

  if (asyncCall != null) {
    return asyncCall
  }

  const promise = emitPreparedAwaitPromiseExpression(expression.argument, context)

  if (promise == null) {
    if (inferExpressionType(expression.argument, context) !== 'promise') {
      return emitCValueExpression(expression.argument, context)
    }

    context.diagnostics.push(
      diagnostic(
        'CCJS_C_ASYNC',
        'this awaited promise expression is not supported by the current C backend slice',
        expression.loc
      )
    )

    return {
      lines: [],
      expression: 'ccjs_undefined_value()'
    }
  }

  registerEventLoop(context)

  let valueType = 'unknown'
  const expressionValueType = knownValueType(expression.valueType)
  const promiseValueType = knownValueType(promise.valueType)
  const resolvedValueType = resolvePromiseExpressionValueType(expression.argument, context)

  if (expressionValueType != null) {
    valueType = expressionValueType
  } else if (promiseValueType != null) {
    valueType = promiseValueType
  } else if (resolvedValueType != null) {
    valueType = resolvedValueType
  }

  const value = nextCName(context, 'ccjs_await_value')
  const valueTag = cRuntimeValueTag(valueType)
  const valueCheck = emitRuntimeValueCheck(value, valueTag, context)
  const pollCall = `ccjs_loop_poll(${emitEventLoopReference(context)}, ${emitEventLoopNextTimeExpression(context)})`
  let rejectionValueType = 'unknown'
  const lines: string[] = []

  if (promise.rejectionValueType != null) {
    rejectionValueType = promise.rejectionValueType
  }

  registerOwnedValue(context, value)

  pushAll(lines, promise.lines)
  pushAll(lines, emitPrepareOwnedValueWrite(value))
  lines.push(
    `while (ccjs_promise_get_state(${promise.expression}) == CCJS_PROMISE_PENDING && ccjs_loop_has_work(${emitEventLoopReference(context)})) {`
  )
  pushAll(lines, emitEventLoopSleepUntilNextTimerLines(context, '  '))
  lines.push(`  ${emitStatusCheck(pollCall, context)}`)
  lines.push('}')
  pushAll(lines, emitAwaitRejectedPromiseLines(promise.expression, rejectionValueType, context))
  lines.push(`if (ccjs_promise_get_state(${promise.expression}) != CCJS_PROMISE_FULFILLED) ${emitFailureStatement(context)}`)
  lines.push(emitStatusCheck(`ccjs_promise_get_result(${promise.expression}, &${value})`, context))

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
  const target = currentErrorTarget(context)
  let rejectedTypeCheck = 'ccjs_error.tag != CCJS_TAG_STRING || ccjs_error.as.ref == 0'

  if (rejectionValueType === 'error') {
    rejectedTypeCheck = 'ccjs_error.tag != CCJS_TAG_OBJECT || ccjs_error.as.ref == 0'
  }

  if (target == null && !context.throwingFunction) {
    const failureLines: string[] = []

    failureLines.push(
      `if (ccjs_promise_get_state(${promiseExpression}) == CCJS_PROMISE_REJECTED) ${emitFailureStatement(context)}`
    )

    return failureLines
  }

  registerErrorChannel(context)
  const resultCall = `ccjs_promise_get_result(${promiseExpression}, &ccjs_error)`
  const lines: string[] = []

  lines.push(`if (ccjs_promise_get_state(${promiseExpression}) == CCJS_PROMISE_REJECTED) {`)
  pushIndented(lines, emitPrepareOwnedValueWrite('ccjs_error'), '  ')
  lines.push(`  ${emitStatusCheck(resultCall, context)}`)
  lines.push(`  ${emitRuntimeTypeCheck(rejectedTypeCheck, context)}`)
  lines.push('  ccjs_error_active = 1;')

  if (target == null) {
    lines.push('  ccjs_status_result = CCJS_ERR_THROW;')
    lines.push('  goto ccjs_cleanup;')
  } else {
    lines.push(`  goto ${target};`)
  }

  lines.push('}')

  return lines
}

function emitCAsyncFunctionAwaitExpression(expression: AnyNode, context: CFunctionContext): PreparedExpression | null {
  const callExpression = expression.argument

  if (callExpression == null || callExpression.type !== 'CallExpression' || !isAsyncFunctionCallee(callExpression.callee, context)) {
    return null
  }

  if (callExpression.callee.type === 'Reference' && context.asyncTaskWrappers.has(callExpression.callee.path[0])) {
    return null
  }

  let valueType = 'unknown'
  const expressionValueType = knownValueType(expression.valueType)
  const awaitedValueType = knownValueType(resolveCAsyncFunctionAwaitValueType(callExpression.callee, context))

  if (expressionValueType != null) {
    valueType = expressionValueType
  } else if (awaitedValueType != null) {
    valueType = awaitedValueType
  }

  const call = emitPreparedCallExpression(callExpression, context)

  if (valueType === 'void') {
    const lines: string[] = []

    pushAll(lines, call.lines)
    lines.push(`${call.expression};`)

    return {
      lines,
      expression: 'ccjs_undefined_value()'
    }
  }

  const valueTag = cRuntimeValueTag(valueType)

  if (valueTag == null && valueType !== 'number' && valueType !== 'boolean') {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_ASYNC',
        'this async function return value is not supported by the current C backend slice',
        expression.loc
      )
    )

    return {
      lines: [],
      expression: 'ccjs_undefined_value()'
    }
  }

  const value = nextCName(context, 'ccjs_await_value')
  let resultExpression = call.expression
  const lines: string[] = []

  registerOwnedValue(context, value)

  if (valueType === 'boolean') {
    resultExpression = `ccjs_bool_value((${call.expression}) != 0)`
  } else if (valueType === 'number') {
    resultExpression = `ccjs_number_value(${call.expression})`
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
  if (expression?.type === 'ArrowFunctionExpression') {
    const wrapper = context.callbackArrowWrappers.get(expression)

    if (wrapper?.kind === 'plain-arrow') {
      return wrapper.name
    }

    context.diagnostics.push(
      diagnostic(
        'CCJS_C_FUNCTION_VALUE',
        'capturing or unsupported inline callbacks are not supported by the current C backend slice; use a named function or a non-capturing inline callback with a supported signature',
        expression.loc
      )
    )

    return '0'
  }

  if (expression?.type === 'Reference' && expression.path.length === 1) {
    const name = expression.path[0]

    if (context.variables.get(name) === 'function') {
      return name
    }

    if (context.functionNames.has(name)) {
      return context.functionNames.get(name)!
    }
  }

  context.diagnostics.push(
    diagnostic(
      'CCJS_C_FUNCTION_VALUE',
      'this function value is not supported by the current C backend slice',
      expression?.loc
    )
  )

  return '0'
}

function resolveRuntimeCallbackCalleeType(callee: AnyNode, context: CFunctionContext): CFunctionType | null {
  if (callee?.type !== 'Reference' || callee.path.length !== 1) {
    return null
  }

  const name = callee.path[0]

  if (!context.runtimeCallbacks.has(name)) {
    return null
  }

  const functionType = context.functionTypes.get(name)

  return isSupportedRuntimeCallbackType(functionType) ? normalizeFunctionType(functionType) : null
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
    expression?.type === 'Reference' &&
    expression.path.length === 1 &&
    context.runtimeCallbacks.has(expression.path[0])
  ) {
    return {
      lines: [],
      expression: expression.path[0]
    }
  }

  const temp = nextCName(context, 'ccjs_callback')
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
    expression?.type === 'Reference' &&
    expression.path.length === 1 &&
    context.runtimeCallbacks.has(expression.path[0])
  ) {
    return [...emitPrepareOwnedValueWrite(out), `${out} = ${expression.path[0]};`, `ccjs_retain(${out});`]
  }

  if (expression?.type === 'ArrowFunctionExpression') {
    const wrapper = context.callbackArrowWrappers.get(expression)

    if (wrapper == null || wrapper.kind !== 'arrow') {
      context.diagnostics.push(
        diagnostic(
          'CCJS_C_FUNCTION_VALUE',
          'runtime C callback wrapper was not generated for this arrow function',
          expression.loc
        )
      )
      return [...emitPrepareOwnedValueWrite(out), `${out} = ccjs_undefined_value();`]
    }

    return emitRuntimeArrowCallbackValueInto(wrapper, out, context)
  }

  if (
    expression?.type !== 'Reference' ||
    expression.path.length !== 1 ||
    !context.functionNames.has(expression.path[0])
  ) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_FUNCTION_VALUE',
        'runtime C callbacks currently require a named non-capturing function',
        expression?.loc
      )
    )
    return [...emitPrepareOwnedValueWrite(out), `${out} = ccjs_undefined_value();`]
  }

  const wrapper = runtimeCallbackWrapperFor(expression.path[0], normalizeFunctionType(functionType), context)

  if (wrapper == null) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_FUNCTION_VALUE',
        'runtime C callback wrapper was not generated for this function value',
        expression.loc
      )
    )
    return [...emitPrepareOwnedValueWrite(out), `${out} = ccjs_undefined_value();`]
  }

  const callbackContext = functionTakesEventLoopParam(expression.path[0], context)
    ? emitEventLoopReference(context)
    : '0'

  if (callbackContext !== '0') {
    registerEventLoop(context)
  }

  return [
    ...emitPrepareOwnedValueWrite(out),
    emitStatusCheck(
      `ccjs_callback_new(&ccjs_default_allocator, ${wrapper.name}, ${callbackContext}, 0, &${out})`,
      context
    )
  ]
}

function emitRuntimeArrowCallbackValueInto(
  wrapper: CRuntimeArrowCallbackWrapper,
  out: string,
  context: CFunctionContext
): string[] {
  const lines = [...emitPrepareOwnedValueWrite(out)]

  for (const capture of wrapper.captures) {
    if (capture.mutable && !isSupportedMutableRuntimeArrowCapture(capture, context)) {
      context.diagnostics.push(
        diagnostic(
          'CCJS_C_FUNCTION_VALUE',
          'capturing this mutable binding in C callbacks requires unsupported boxed closure storage',
          wrapper.expression.loc
        )
      )
    }

    if (!['number', 'boolean', 'string', 'object', 'timer', 'promise-settlement'].includes(capture.valueType)) {
      context.diagnostics.push(
        diagnostic(
          'CCJS_C_FUNCTION_VALUE',
          'capturing C callbacks currently support only const number/boolean/string/object/timer bindings and Promise resolve/reject handlers',
          wrapper.expression.loc
        )
      )
    }
  }

  if (!hasRuntimeArrowCallbackContext(wrapper)) {
    lines.push(emitStatusCheck(`ccjs_callback_new(&ccjs_default_allocator, ${wrapper.name}, 0, 0, &${out})`, context))
    return lines
  }

  const contextName = nextCName(context, 'ccjs_callback_ctx')

  lines.push(
    `${wrapper.contextTypeName}* ${contextName} = ccjs_default_alloc(0, sizeof(${wrapper.contextTypeName}), _Alignof(${wrapper.contextTypeName}));`
  )
  lines.push(`if (${contextName} == 0) ${emitFailureStatement(context)}`)

  if (wrapper.needsEventLoop === true) {
    registerEventLoop(context)
    lines.push(`${contextName}->ccjs_loop = ${emitEventLoopReference(context)};`)
  }

  for (const capture of wrapper.captures) {
    lines.push(...emitRuntimeArrowCaptureStoreLines(capture, contextName, context))
  }

  lines.push(
    `if (ccjs_callback_new(&ccjs_default_allocator, ${wrapper.name}, ${contextName}, ${wrapper.finalizerName}, &${out}) != CCJS_OK) {`
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

  if (isSupportedMutableRuntimeArrowCapture(capture, context)) {
    return [`${field} = ${capture.name};`]
  }

  if (isRetainedRuntimeArrowCapture(capture)) {
    if (capture.valueType === 'string') {
      return [
        `${field}.tag = CCJS_TAG_STRING;`,
        `${field}.as.ref = (ccjs_ref*)&${capture.name}->header;`,
        `ccjs_retain(${field});`
      ]
    }

    return [`${field} = ${capture.name};`, `ccjs_retain(${field});`]
  }

  if (capture.valueType === 'promise-settlement') {
    const handler = context.promiseConstructorHandlers.get(capture.name)

    if (handler == null) {
      context.diagnostics.push(
        diagnostic(
          'CCJS_C_FUNCTION_VALUE',
          'Promise resolve/reject handlers can only be captured inside Promise constructor executors',
          capture.loc
        )
      )

      return [`${field} = 0;`]
    }

    return [`${field} = ${handler.promise};`, `if (${field} != 0) ccjs_promise_retain(${field});`]
  }

  return [`${field} = ${capture.name};`]
}

function emitRuntimeCallbackCall(
  expression: AnyNode,
  functionType: CFunctionType,
  context: CFunctionContext
): PreparedExpression {
  const lines: string[] = []
  const args: string[] = []

  for (const arg of expression.args) {
    const value = emitCValueExpression(arg, context)

    lines.push(...value.lines)
    args.push(value.expression)
  }

  const out = nextCName(context, 'ccjs_callback_out')
  registerOwnedValue(context, out)
  lines.push(...emitPrepareOwnedValueWrite(out))

  if (args.length === 0) {
    lines.push(
      emitStatusCheck(`ccjs_callback_call(${emitReference(expression.callee, context)}, 0, 0, &${out})`, context)
    )
  } else {
    const argArray = nextCName(context, 'ccjs_callback_args')

    lines.push(`ccjs_value ${argArray}[] = { ${args.join(', ')} };`)
    lines.push(
      emitStatusCheck(
        `ccjs_callback_call(${emitReference(expression.callee, context)}, ${argArray}, ${args.length}, &${out})`,
        context
      )
    )
  }

  return {
    lines,
    expression: ''
  }
}

function emitOptionalRuntimeCallbackCallExpression(expression: AnyNode, context: CFunctionContext): string[] {
  const functionType = resolveRuntimeCallbackCalleeType(expression.callee, context)

  if (functionType == null) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_OPTIONAL_CHAINING',
        'optional calls currently require a nullable runtime callback value in the C backend',
        expression.loc
      )
    )
    return []
  }

  const callee = emitReference(expression.callee, context)
  const calleeTypeCheck = `${callee}.tag != CCJS_TAG_FUNCTION || ${callee}.as.ref == 0`
  const lines: string[] = [
    `if (${callee}.tag != CCJS_TAG_NULL) {`,
    `  ${emitRuntimeTypeCheck(calleeTypeCheck, context)}`
  ]
  const args: string[] = []

  for (const arg of expression.args) {
    const value = emitCValueExpression(arg, context)

    lines.push(...value.lines.map((line: string) => `  ${line}`))
    args.push(value.expression)
  }

  const out = nextCName(context, 'ccjs_callback_out')
  registerOwnedValue(context, out)
  lines.push(...emitPrepareOwnedValueWrite(out).map((line: string) => `  ${line}`))

  if (args.length === 0) {
    const call = `ccjs_callback_call(${callee}, 0, 0, &${out})`
    lines.push(`  ${emitStatusCheck(call, context)}`)
  } else {
    const argArray = nextCName(context, 'ccjs_callback_args')
    const call = `ccjs_callback_call(${callee}, ${argArray}, ${args.length}, &${out})`

    lines.push(`  ccjs_value ${argArray}[] = { ${args.join(', ')} };`)
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

  if (functionType == null || !isRuntimeNullableType(functionType.returnType) || expectedTag == null) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_OPTIONAL_CHAINING',
        'optional call results currently support nullable runtime callback results in the C backend',
        expression.loc
      )
    )

    return {
      lines: [],
      expression: 'ccjs_null_value()'
    }
  }

  const callee = emitReference(expression.callee, context)
  const out = nextCName(context, 'ccjs_optional_call')
  const calleeTypeCheck = `${callee}.tag != CCJS_TAG_FUNCTION || ${callee}.as.ref == 0`
  const lines: string[] = [
    ...emitPrepareOwnedValueWrite(out),
    `${out} = ccjs_null_value();`,
    `if (${callee}.tag != CCJS_TAG_NULL) {`,
    `  ${emitRuntimeTypeCheck(calleeTypeCheck, context)}`
  ]
  const args: string[] = []

  registerOwnedValue(context, out)

  for (const arg of expression.args) {
    const value = emitCValueExpression(arg, context)

    lines.push(...value.lines.map((line: string) => `  ${line}`))
    args.push(value.expression)
  }

  lines.push(...emitPrepareOwnedValueWrite(out).map((line: string) => `  ${line}`))

  if (args.length === 0) {
    const call = `ccjs_callback_call(${callee}, 0, 0, &${out})`
    lines.push(`  ${emitStatusCheck(call, context)}`)
  } else {
    const argArray = nextCName(context, 'ccjs_callback_args')
    const call = `ccjs_callback_call(${callee}, ${argArray}, ${args.length}, &${out})`

    lines.push(`  ccjs_value ${argArray}[] = { ${args.join(', ')} };`)
    lines.push(`  ${emitStatusCheck(call, context)}`)
  }

  lines.push(`  ${emitRuntimeValueCheck(out, expectedTag, context)}`)
  lines.push('}')

  return {
    lines,
    expression: out
  }
}

function resolveFunctionParams(callee: AnyNode, context: CEmitContext): CFunctionParam[] | null {
  if (callee.type !== 'Reference' || callee.path.length !== 1) {
    return null
  }

  return context.functionParams.get(callee.path[0]) ?? null
}

function inferExpressionType(expression: AnyNode, context: CFunctionContext): string {
  return inferExpressionTypeWithDependencies(expression, context, expressionTypeDependencies)
}

function isErrorConstructorExpression(expression: AnyNode): boolean {
  return (
    expression?.type === 'NewExpression' &&
    expression.callee.type === 'Reference' &&
    expression.callee.path.length === 1 &&
    expression.callee.path[0] === 'Error'
  )
}

function isFetchAbortControllerConstructorExpression(expression: AnyNode): boolean {
  return (
    expression?.type === 'NewExpression' &&
    expression.callee.type === 'Reference' &&
    expression.callee.path.length === 1 &&
    expression.callee.path[0] === 'AbortController'
  )
}

function isErrorValueExpression(expression: AnyNode, context: CFunctionContext): boolean {
  return isKnownErrorValueExpression(expression, context, context.errorObjectNames)
}

function isKnownErrorValueExpression(
  expression: AnyNode,
  context: CFunctionContext,
  errorObjectNames: Set<string>
): boolean {
  if (isErrorConstructorExpression(expression)) {
    return true
  }

  if (expression?.type === 'Reference' && expression.path.length === 1) {
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
