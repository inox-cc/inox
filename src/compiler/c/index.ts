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
  collectIrTopLevelNodesFromPrograms,
  findIrEntryProgram
} from '../ir.ts'
import {
  createFunctionContext,
  emitBoxedValueCleanup,
  emitBoxedValueDeclarations,
  emitCleanupReturn,
  emitErrorChannelDeclarations,
  emitEventLoopCleanup,
  emitEventLoopCurrentTimeExpression,
  emitEventLoopDeclarations,
  emitEventLoopDrain,
  emitEventLoopInit,
  emitEventLoopNextTimeExpression,
  emitEventLoopReference,
  emitEventLoopSleepUntilNextTimerLines,
  emitFailureStatement,
  emitLoopFlowDeclarations,
  emitOwnedPromiseCleanup,
  emitOwnedPromiseDeclarations,
  emitOwnedValueCleanup,
  emitOwnedValueDeclarations,
  emitPrepareOwnedValueWrite,
  emitReturnFlowDeclarations,
  emitReturnValueDeclarations,
  emitRuntimeTypeCheck,
  emitStatusCheck,
  emitStatusResultDeclarations,
  emitThrowingFunctionErrorTransfer,
  isRuntimeBoxedValueType,
  nextCName,
  registerBoxedValue,
  registerEventLoop,
  registerOwnedPromise,
  registerOwnedValue,
  shouldEmitCleanupLabel,
  type CEmitContext,
  type CFunctionContext,
  withVariableScope
} from './context.ts'
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
  emitCModuleSource as emitCModuleSourceWithDependencies,
  type CModuleEmissionDependencies
} from './module-emission.ts'
import { emitCModuleFilesFromGraph as emitCModuleFilesFromGraphWithEmitters } from './modules.ts'
import { emitCUnit as emitCUnitWithDependencies, type CUnitDependencies } from './unit.ts'
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
  resolvePromiseReturningFunctionValueType,
  type PromiseChainLoweringDependencies,
  type PromiseLoweringDependencies
} from './async/promises.ts'
import {
  collectAsyncTaskWrappers,
  emitAsyncTaskFrameType,
  emitAsyncTaskFunctionStubDeclaration,
  emitAsyncTaskWrapperDeclaration,
  emitAsyncTaskWrapperPrototypes,
  type AsyncTaskLoweringDependencies
} from './async/tasks.ts'
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
  isNullableFunctionType,
  isPlainFunctionPointerType,
  isPromiseChainCallbackWrapperWithContext,
  isRetainedRuntimeArrowCapture,
  isRuntimeArrowCallbackWrapperWithContext,
  isRuntimeCallbackWrapper,
  isRuntimeFunctionType,
  isSupportedMutableRuntimeArrowCapture,
  isSupportedRuntimeCallbackType,
  markRuntimeFunctionParam,
  normalizeFunctionType,
  resolveFunctionParameterRuntimeType,
  resolveRuntimeFunctionArgumentType,
  runtimeCallbackWrapperFor,
  type CallbackLoweringDependencies
} from './async/callbacks.ts'
import {
  type BinaryLoweringDependencies,
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
import {
  cChildProcessRuntimeMethodName,
  emitPreparedChildProcessCallExpression,
  type ChildProcessLoweringDependencies
} from './stdlib/child-process.ts'
import { isConsoleLog } from './stdlib/console.ts'
import {
  cryptoRuntimeMethodName,
  emitCryptoHashVariableDeclaration,
  emitCryptoHandleVariableDeclaration,
  emitPreparedCryptoCallExpression,
  emitPreparedCryptoHashCallExpression,
  emitPreparedCryptoHmacCallExpression,
  emitPreparedCryptoNumberCallExpression,
  type CryptoLoweringDependencies
} from './stdlib/crypto.ts'
import {
  collectDgramMessageHandlers,
  emitDgramAddressVariableDeclaration,
  emitDgramMessageHandlerDeclaration,
  emitDgramMessageHandlerHead,
  emitDgramNumberVariableDeclaration,
  emitDgramSocketCallStatement,
  emitDgramSocketVariableDeclaration,
  emitPreparedDgramAddressPortExpression,
  type DgramLoweringDependencies
} from './stdlib/dgram.ts'
import {
  collectHttpHandlers,
  emitHttpHandlerDeclaration,
  emitHttpHandlerHead,
  emitHttpServerCallStatement,
  emitHttpServerVariableDeclaration,
  type HttpLoweringDependencies
} from './stdlib/http.ts'
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
  resolveNetAddressStringMember,
  type NetLoweringDependencies
} from './stdlib/net.ts'
import {
  cFetchRuntimeExpressionMethod,
  emitFetchHeadersBooleanVariableDeclaration,
  emitPreparedFetchCallExpression,
  emitPreparedFetchHeadersCallExpression,
  emitPreparedFetchInitOperand,
  isAsyncFetchRuntimeCallExpression,
  type FetchLoweringDependencies
} from './stdlib/fetch.ts'
import {
  cFsRuntimeConstantExpression,
  cFsRuntimeExpressionMethod,
  emitFsBooleanFlag,
  emitPreparedFsAccessModeExpression,
  emitPreparedFsCallExpression,
  emitPreparedFsStatsMethodExpression,
  emitPreparedFsSyncStatementExpression,
  emitPreparedFsSyncValueExpression,
  isAsyncFsRuntimeCallExpression,
  type FsLoweringDependencies
} from './stdlib/fs.ts'
import {
  cJsonRuntimeCallName,
  emitJsonParseVariableDeclaration,
  emitPreparedJsonCallExpression,
  emitPreparedJsonScalarParseExpression,
  type JsonDeclarationDependencies
} from './stdlib/json.ts'
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
  emitPreparedPathStringCallExpression,
  type PathLoweringDependencies
} from './stdlib/path.ts'
import {
  cProcessRuntimeEnvName,
  cProcessRuntimeMethodName,
  cProcessRuntimePropertyName,
  cProcessRuntimePropertyValueType,
  emitPreparedProcessNumberExpression,
  emitPreparedProcessStringExpression,
  emitProcessExitCodeAssignment,
  emitProcessExitStatement,
  type ProcessLoweringDependencies
} from './stdlib/process.ts'
import { cTimeRuntimeCallName } from './stdlib/time.ts'
import {
  emitPreparedTimerCallExpression,
  emitTimerVariableDeclaration,
  type TimerLoweringDependencies
} from './stdlib/timers.ts'
import {
  cUrlRuntimeMethodName,
  emitPreparedUrlObjectExpression,
  emitPreparedUrlSearchParamsCallExpression,
  emitPreparedUrlSearchParamsObjectExpression,
  emitPreparedUrlStringCallExpression,
  emitUrlObjectFieldAssignment,
  type UrlLoweringDependencies
} from './stdlib/url.ts'
import {
  cUnsupportedExpressionCode,
  cUnsupportedVariableDeclarationCode,
  isNullishCoalescingExpression,
  isOptionalChainExpression
} from './syntax.ts'
import type { IrFunctionNodeEntry, IrModuleRecord } from '../ir.ts'
import type { CEmitOptions, CModuleEmitOptions, CModuleOutputFile, CModulePlan } from './types.ts'
import {
  cRuntimeValueTag,
  emitCObjectParamName,
  emitCReturnType,
  emitCScalarParamName,
  emitCStringParamName,
  emitCType,
  emitThrowingFunctionOutType,
  isManagedRuntimeReturnType,
  isNullableScalarParam,
  isNullableScalarType,
  isRuntimeNullableType,
  isThrowingFunctionRuntimeOut
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
  resolveNullableScalarConditionNarrowing,
  type NullableLoweringDependencies
} from './values/nullable.ts'
import {
  collectClassMethods,
  createClassInfos,
  emitCClassMethodName,
  emitCClassObjectValueExpression,
  emitClassObjectVariableDeclaration,
  emitPreparedClassMethodCallExpression,
  isClassConstructorExpression,
  registerClassObjectShape,
  type ClassLoweringDependencies
} from './values/classes.ts'
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
  updateKnownObjectMemberValueType,
  type ObjectVariableDeclarationDependencies
} from './values/objects.ts'
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
  resolveRuntimeSetElementType,
  type CollectionLoweringDependencies
} from './values/collections.ts'
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
  updateKnownArrayElementValueType,
  type ArrayLoweringDependencies
} from './values/arrays.ts'
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
  resolveRuntimeStringReference,
  type StringLoweringDependencies
} from './values/strings.ts'
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
  isThrowingFunctionName as isThrowingFunctionNameFromExpressions,
  type CCallExpressionDependencies,
  type CScalarExpressionDependencies,
  type CValueExpressionDependencies
} from './values/expressions.ts'
import {
  inferExpressionType as inferExpressionTypeWithDependencies,
  type CExpressionTypeDependencies
} from './values/types.ts'
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
  withReturnTarget,
  type StatementLoweringDependencies
} from './values/statements.ts'
import type {
  AnyNode,
  Diagnostic,
  IrFunctionDeclaration,
  IrFunctionEffect,
  IrProgram,
  ModuleGraph
} from '../types.ts'
export type { CModuleOutputFile } from './types.ts'

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
  emitDgramNumberVariableDeclaration: (statement, context) =>
    emitDgramNumberVariableDeclaration(statement, context, dgramLoweringDependencies),
  emitDgramSocketVariableDeclaration: (statement, context) =>
    emitDgramSocketVariableDeclaration(statement, context, dgramLoweringDependencies),
  emitDgramSocketCallStatement: (expression, context) =>
    emitDgramSocketCallStatement(expression, context, dgramLoweringDependencies),
  emitDynamicObjectMemberVariableDeclaration,
  emitDynamicObjectMemberAssignment,
  emitErrorObjectVariableDeclaration,
  emitFailureStatement,
  emitFetchAbortControllerVariableDeclaration,
  emitFetchAbortControllerAbortStatement,
  emitFunctionPointerVariable,
  emitHttpServerVariableDeclaration,
  emitHttpServerCallStatement: (expression, context) =>
    emitHttpServerCallStatement(expression, context, httpLoweringDependencies),
  emitJsonParseVariableDeclaration: (statement, context) =>
    emitJsonParseVariableDeclaration(statement, context, jsonDeclarationDependencies),
  emitKnownArrayIndexAssignment,
  emitKnownArrayIndexVariableDeclaration,
  emitKnownObjectMemberAssignment,
  emitKnownObjectMemberVariableDeclaration,
  emitNetAddressMemberVariableDeclaration,
  emitNetAddressVariableDeclaration,
  emitNetNumberVariableDeclaration,
  emitNetServerCallStatement: (expression, context) =>
    emitNetServerCallStatement(expression, context, netLoweringDependencies),
  emitNetServerVariableDeclaration: (statement, context) =>
    emitNetServerVariableDeclaration(statement, context, netLoweringDependencies),
  emitNetSocketCallStatement: (expression, context) =>
    emitNetSocketCallStatement(expression, context, netLoweringDependencies),
  emitNetSocketVariableDeclaration: (statement, context) =>
    emitNetSocketVariableDeclaration(statement, context, netLoweringDependencies),
  emitNullableScalarValueExpression,
  emitNullableRuntimeValueAssignment,
  emitObjectVariableDeclaration: (statement, context) =>
    emitObjectVariableDeclaration(statement, context, objectVariableDeclarationDependencies),
  emitOptionalRuntimeCallbackCallExpression,
  emitPreparedArrayFilterCallExpression,
  emitPreparedArrayMapCallExpression,
  emitPreparedArrayPopCallExpression,
  emitPreparedArrayPushCallExpression,
  emitPreparedArraySortCallExpression,
  emitPreparedAsyncFunctionPromiseCallExpression,
  emitPreparedBytesIndexAssignment: (expression, context) =>
    emitPreparedBytesIndexAssignment(expression, context, binaryLoweringDependencies),
  emitPreparedCallExpression,
  emitPreparedChildProcessCallExpression: (expression, context, options) =>
    emitPreparedChildProcessCallExpression(expression, context, childProcessLoweringDependencies, options),
  emitPreparedClassMethodCallExpression,
  emitPreparedCollectionCallExpression,
  emitPreparedCryptoCallExpression: (expression, context, options) =>
    emitPreparedCryptoCallExpression(expression, context, cryptoLoweringDependencies, options),
  emitPreparedCryptoHashCallExpression: (expression, context) =>
    emitPreparedCryptoHashCallExpression(expression, context, cryptoLoweringDependencies),
  emitPreparedCryptoHmacCallExpression: (expression, context) =>
    emitPreparedCryptoHmacCallExpression(expression, context, cryptoLoweringDependencies),
  emitPreparedCryptoNumberCallExpression: (expression, context) =>
    emitPreparedCryptoNumberCallExpression(expression, context, cryptoLoweringDependencies),
  emitPreparedDebugMemoryCallExpression,
  emitPreparedFetchCallExpression: (expression, context, options) =>
    emitPreparedFetchCallExpression(expression, context, fetchLoweringDependencies, options),
  emitPreparedFetchHeadersCallExpression: (expression, context, options) =>
    emitPreparedFetchHeadersCallExpression(expression, context, fetchLoweringDependencies, options),
  emitPreparedFsCallExpression: (expression, context, options) =>
    emitPreparedFsCallExpression(expression, context, fsLoweringDependencies, options),
  emitPreparedFsSyncStatementExpression: (expression, context) =>
    emitPreparedFsSyncStatementExpression(expression, context, fsLoweringDependencies),
  emitPreparedMapIndexAssignment,
  emitPreparedNumberExpression,
  emitPreparedPathObjectCallExpression: (expression, context, options) =>
    emitPreparedPathObjectCallExpression(expression, context, pathLoweringDependencies, options),
  emitPreparedPromiseConstructorExpression: (expression, context, options) =>
    emitPreparedPromiseConstructorExpression(expression, context, promiseLoweringDependencies, options),
  emitPreparedPromiseExpression: (expression, context, options) =>
    emitPreparedPromiseExpression(expression, context, promiseLoweringDependencies, options),
  emitPreparedPromiseMethodExpression: (expression, context, options) =>
    emitPreparedPromiseMethodExpression(expression, context, promiseLoweringDependencies, options),
  emitPreparedPromiseReturningCallExpression: (expression, context, options) =>
    emitPreparedPromiseReturningCallExpression(expression, context, promiseLoweringDependencies, options),
  emitPreparedPromiseStaticExpression: (expression, context, options) =>
    emitPreparedPromiseStaticExpression(expression, context, promiseLoweringDependencies, options),
  emitPreparedTimerCallExpression: (expression, context, options) =>
    emitPreparedTimerCallExpression(expression, context, timerLoweringDependencies, options),
  emitPreparedUpdateExpression,
  emitPreparedUrlObjectExpression: (expression, context, options) =>
    emitPreparedUrlObjectExpression(expression, context, urlLoweringDependencies, options),
  emitPreparedUrlSearchParamsObjectExpression: (expression, context, options) =>
    emitPreparedUrlSearchParamsObjectExpression(expression, context, urlLoweringDependencies, options),
  emitProcessExitCodeAssignment: (expression, context) =>
    emitProcessExitCodeAssignment(expression, context, processLoweringDependencies),
  emitProcessExitStatement: (expression, context) =>
    emitProcessExitStatement(expression, context, processLoweringDependencies),
  emitPromiseConstructorSettlementCall: (expression, context) =>
    emitPromiseConstructorSettlementCall(expression, context, promiseLoweringDependencies),
  emitReference,
  emitRuntimeCallbackVariableDeclaration,
  emitScalarVariableDeclaration,
  emitStatement,
  emitStringExpression,
  emitUrlObjectFieldAssignment: (expression, context) =>
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
  emitPreparedFetchCallExpression: (expression, context, options) =>
    emitPreparedFetchCallExpression(expression, context, fetchLoweringDependencies, options),
  emitPreparedFsCallExpression: (expression, context, options) =>
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
  emitPreparedFetchInitOperand: (expression, context) =>
    emitPreparedFetchInitOperand(expression, context, fetchLoweringDependencies),
  emitPreparedFsAccessModeExpression: (expression, context) =>
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
  emitPreparedCryptoCallExpression: (expression, context) =>
    emitPreparedCryptoCallExpression(expression, context, cryptoLoweringDependencies),
  emitPreparedCryptoHashCallExpression: (expression, context) =>
    emitPreparedCryptoHashCallExpression(expression, context, cryptoLoweringDependencies),
  emitPreparedCryptoHmacCallExpression: (expression, context) =>
    emitPreparedCryptoHmacCallExpression(expression, context, cryptoLoweringDependencies),
  emitPreparedFetchHeadersCallExpression: (expression, context) =>
    emitPreparedFetchHeadersCallExpression(expression, context, fetchLoweringDependencies),
  emitPreparedFsCallExpression: (expression, context) =>
    emitPreparedFsCallExpression(expression, context, fsLoweringDependencies),
  emitPreparedFsStatsMethodExpression: (expression, context) =>
    emitPreparedFsStatsMethodExpression(expression, context, fsLoweringDependencies),
  emitPreparedJsonCallExpression: (expression, context) =>
    emitPreparedJsonCallExpression(expression, context, jsonDeclarationDependencies),
  emitPreparedNumberExpression,
  emitPreparedPathBooleanCallExpression: (expression, context) =>
    emitPreparedPathBooleanCallExpression(expression, context, pathLoweringDependencies),
  emitPreparedPathStringCallExpression: (expression, context) =>
    emitPreparedPathStringCallExpression(expression, context, pathLoweringDependencies),
  emitPreparedPromiseMethodExpression: (expression, context) =>
    emitPreparedPromiseMethodExpression(expression, context, promiseLoweringDependencies),
  emitPreparedPromiseStaticExpression: (expression, context) =>
    emitPreparedPromiseStaticExpression(expression, context, promiseLoweringDependencies),
  emitPreparedTimerCallExpression: (expression, context, options) =>
    emitPreparedTimerCallExpression(expression, context, timerLoweringDependencies, options),
  emitPreparedUrlSearchParamsCallExpression: (expression, context) =>
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
  emitPreparedBinaryNumberCallExpression: (expression, context) =>
    emitPreparedBinaryNumberCallExpression(expression, context, binaryLoweringDependencies),
  emitPreparedBytesIndexExpression: (expression, context) =>
    emitPreparedBytesIndexExpression(expression, context, binaryLoweringDependencies),
  emitPreparedBytesLengthExpression: (expression, context) =>
    emitPreparedBytesLengthExpression(expression, context, binaryLoweringDependencies),
  emitPreparedCallExpression,
  emitPreparedClassMethodCallExpression,
  emitPreparedCollectionCallExpression,
  emitPreparedCollectionSizeExpression,
  emitPreparedCryptoNumberCallExpression: (expression, context) =>
    emitPreparedCryptoNumberCallExpression(expression, context, cryptoLoweringDependencies),
  emitPreparedDgramAddressPortExpression,
  emitPreparedJsonScalarParseExpression: (expression, context) =>
    emitPreparedJsonScalarParseExpression(expression, context, jsonDeclarationDependencies),
  emitPreparedNetAddressPortExpression,
  emitPreparedPathBooleanCallExpression: (expression, context) =>
    emitPreparedPathBooleanCallExpression(expression, context, pathLoweringDependencies),
  emitPreparedProcessNumberExpression,
  emitPreparedRuntimeArrayIndexValue,
  emitPreparedStringCompareExpression,
  emitPreparedStringLengthExpression,
  emitPreparedStringPredicateCall,
  emitPreparedUrlSearchParamsCallExpression: (expression, context) =>
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
  emitPreparedBinaryValueExpression: (expression, context) =>
    emitPreparedBinaryValueExpression(expression, context, binaryLoweringDependencies),
  emitPreparedCallExpression,
  emitPreparedChildProcessCallExpression: (expression, context) =>
    emitPreparedChildProcessCallExpression(expression, context, childProcessLoweringDependencies),
  emitPreparedClassMethodCallExpression,
  emitPreparedCollectionCallExpression,
  emitPreparedCryptoCallExpression: (expression, context) =>
    emitPreparedCryptoCallExpression(expression, context, cryptoLoweringDependencies),
  emitPreparedDebugMemoryCallExpression,
  emitPreparedFetchHeadersCallExpression: (expression, context) =>
    emitPreparedFetchHeadersCallExpression(expression, context, fetchLoweringDependencies),
  emitPreparedFsSyncValueExpression: (expression, context) =>
    emitPreparedFsSyncValueExpression(expression, context, fsLoweringDependencies),
  emitPreparedJsonCallExpression: (expression, context) =>
    emitPreparedJsonCallExpression(expression, context, jsonDeclarationDependencies),
  emitPreparedKnownArrayIndexValueExpression,
  emitPreparedKnownObjectIndexValueExpression,
  emitPreparedKnownObjectMemberValueExpression,
  emitPreparedMapIndexGetExpression,
  emitPreparedNullableScalarRuntimeValueExpression,
  emitPreparedOsConstantExpression,
  emitPreparedOsStringCallExpression,
  emitPreparedPathConstantExpression,
  emitPreparedPathObjectCallExpression: (expression, context) =>
    emitPreparedPathObjectCallExpression(expression, context, pathLoweringDependencies),
  emitPreparedPathStringCallExpression: (expression, context) =>
    emitPreparedPathStringCallExpression(expression, context, pathLoweringDependencies),
  emitPreparedProcessStringExpression: (expression, context) =>
    emitPreparedProcessStringExpression(expression, context, processLoweringDependencies),
  emitPreparedRuntimeArrayIndexValueExpression,
  emitPreparedUrlObjectExpression: (expression, context) =>
    emitPreparedUrlObjectExpression(expression, context, urlLoweringDependencies),
  emitPreparedUrlSearchParamsCallExpression: (expression, context) =>
    emitPreparedUrlSearchParamsCallExpression(expression, context, urlLoweringDependencies),
  emitPreparedUrlSearchParamsObjectExpression: (expression, context) =>
    emitPreparedUrlSearchParamsObjectExpression(expression, context, urlLoweringDependencies),
  emitPreparedUrlStringCallExpression: (expression, context) =>
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
  emitClassMethodDeclaration,
  emitClassMethodHead,
  emitFunctionDeclaration,
  emitFunctionHead,
  emitMainWrapper,
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
  emitClassMethodDeclaration,
  emitClassMethodHead,
  emitFunctionDeclaration,
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
  const entryIndex = irModules.findIndex((module) => module.path === entry)
  const entryIrPrograms = collectIrPrograms(entryIndex < 0 ? irModules : irModules.slice(0, entryIndex + 1))
  const entryIr = findIrEntryProgram(irModules, entry)

  return formatGeneratedC(emitCUnit(irPrograms, entryIr, options, entryIrPrograms), 'ccjs.bundle.c')
}

export function emitCModuleFilesFromGraph(graph: ModuleGraph, options: CModuleEmitOptions): CModuleOutputFile[] {
  return emitCModuleFilesFromGraphWithEmitters(graph, options, {
    emitHeader: (plan, plans, diagnostics) =>
      emitCModuleHeaderWithDependencies(plan, plans, diagnostics, cModuleEmissionDependencies),
    emitSource: (plan, plans, emitOptions, diagnostics) =>
      emitCModuleSourceWithDependencies(plan, plans, emitOptions, diagnostics, cModuleEmissionDependencies)
  })
}

function emitCUnit(
  irPrograms: IrProgram[],
  entryIrProgram: IrProgram | null = irPrograms.at(-1) ?? null,
  options: CEmitOptions = {},
  entryIrPrograms: IrProgram[] = entryIrProgram == null ? [] : [entryIrProgram]
) {
  return emitCUnitWithDependencies(irPrograms, entryIrProgram, options, entryIrPrograms, cUnitDependencies)
}

function createThrowingFunctionInfo(
  functionDeclarations: IrFunctionDeclaration[],
  functionEffects: IrFunctionEffect[]
) {
  const functionThrowValueTypes = new Map<string, IrFunctionEffect['throwValueTypes']>(
    functionDeclarations.map((item) => [item.name, []])
  )
  const throwingFunctions = new Set()

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

  return flags.length === 0 ? '0' : flags.join(' | ')
}

function createBaseContext(
  diagnostics: Diagnostic[],
  functionDeclarations: IrFunctionDeclaration[],
  functionEffects: IrFunctionEffect[],
  jsGlobalRoots: Set<string>
): CEmitContext {
  const throwing = createThrowingFunctionInfo(functionDeclarations, functionEffects)

  return {
    boxedMutableCaptureDeclarations: new Set(),
    classInfos: new Map(),
    callbackArrowWrappers: new Map(),
    callbackWrappers: new Map(),
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
    functionNames: new Map(functionDeclarations.map((item) => [item.name, emitCFunctionName(item.name)])),
    functionParams: new Map(functionDeclarations.map((item) => [item.name, item.params])),
    functionReturnArrayElementTypes: new Map(
      functionDeclarations.map((item) => [item.name, item.returnArrayElementType ?? null])
    ),
    functionReturnArrayElementDeclaredTypes: new Map(
      functionDeclarations.map((item) => [item.name, item.returnArrayElementDeclaredType ?? null])
    ),
    functionReturnMapTypes: new Map(
      functionDeclarations.map((item) => [
        item.name,
        {
          key: item.returnMapKeyType ?? null,
          value: item.returnMapValueType ?? null
        }
      ])
    ),
    functionReturnNullables: new Map(functionDeclarations.map((item) => [item.name, item.returnNullable === true])),
    functionReturnPromiseValueTypes: new Map(
      functionDeclarations.map((item) => [item.name, item.returnPromiseValueType ?? null])
    ),
    functionReturnShapes: new Map(functionDeclarations.map((item) => [item.name, item.returnShape ?? null])),
    functionReturnSetElementTypes: new Map(
      functionDeclarations.map((item) => [item.name, item.returnSetElementType ?? null])
    ),
    functionReturnTypes: new Map(functionDeclarations.map((item) => [item.name, item.returnType])),
    functionAsyncFlags: new Map(functionDeclarations.map((item) => [item.name, item.async === true])),
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
    unhandledRejectionFlag: null as string | null,
    nextId: 0
  }
}

function resolveFunctionReturnType(name: string, fallback: any, context: CEmitContext): any {
  return context.functionReturnTypes.get(name) ?? fallback
}

function resolveFunctionReturnNullable(name: string, fallback: any, context: CEmitContext): boolean {
  return context.functionReturnNullables.has(name)
    ? context.functionReturnNullables.get(name) === true
    : fallback === true
}

function resolveFunctionDeclarationParams(name: string, fallback: any[], context: CEmitContext): any[] {
  return context.functionParams.get(name) ?? fallback
}

function isBoxedFunctionParam(param: any, index: number, statement: AnyNode, context: CEmitContext): boolean {
  return context.boxedMutableCaptureDeclarations.has(statement.params[index] ?? param)
}

function collectExternalEventLoopFunctions(functions: AnyNode[]): Set<string> {
  const functionsByName = new Map(
    functions.flatMap((item) => (typeof item.name === 'string' ? [[item.name, item]] : []))
  )
  const names = new Set<string>()
  let changed = true

  while (changed) {
    changed = false

    for (const [name, item] of functionsByName) {
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

function findObjectLiteralPropertyValue(expression, key) {
  return expression?.properties?.find((property) => property.key === key)?.value ?? null
}

function staticObjectStringPropertyValue(expression, key) {
  const value = findObjectLiteralPropertyValue(expression, key)

  if (value?.type === 'StringLiteral') {
    return value.value
  }

  if (value?.type === 'TemplateLiteral' && !value.raw.includes('${')) {
    return value.raw.slice(1, -1)
  }

  return null
}

function staticObjectBooleanPropertyValue(expression, key) {
  const value = findObjectLiteralPropertyValue(expression, key)

  if (value?.type === 'BooleanLiteral') {
    return value.value === true
  }

  return null
}

function emitFunctionDeclaration(statement: AnyNode, baseContext: CEmitContext): string[] {
  const returnInfo = resolveCFunctionReturnInfo(statement, baseContext)
  const returnType = returnInfo.returnType
  const returnNullable = returnInfo.returnNullable
  const params = resolveFunctionDeclarationParams(statement.name, statement.params, baseContext)
  const context = createFunctionContext(baseContext, returnType, returnNullable)
  context.returnShape = context.functionReturnShapes.get(statement.name) ?? null
  context.throwingFunction = isThrowingFunctionName(statement.name, context)
  context.externalEventLoop = functionTakesEventLoopParam(statement.name, context)
  context.functionReturnOut = 'ccjs_out'
  context.functionErrorOut = 'ccjs_error_out'

  if (baseContext.asyncTaskWrappers.has(statement.name)) {
    return emitAsyncTaskFunctionStubDeclaration(statement, context, asyncTaskLoweringDependencies)
  }

  if (context.throwingFunction) {
    registerErrorChannel(context)
  }

  registerFunctionParamsInContext(statement, params, context)

  const bodyLines: string[] = []

  bodyLines.push(...emitRuntimeParamPreludeForParams(statement, params, context).map((line) => `  ${line}`))

  bodyLines.push(...emitStatementList(statement.body, context).map((line) => `  ${line}`))

  const lines = [
    `${emitFunctionHead(statement, context)} {`,
    ...emitThrowingFunctionPrelude(context).map((line) => `  ${line}`),
    ...emitReturnValueDeclarations(context).map((line) => `  ${line}`),
    ...emitStatusResultDeclarations(context).map((line) => `  ${line}`),
    ...emitLoopFlowDeclarations(context).map((line) => `  ${line}`),
    ...emitReturnFlowDeclarations(context).map((line) => `  ${line}`),
    ...emitEventLoopDeclarations(context).map((line) => `  ${line}`),
    ...emitOwnedValueDeclarations(context).map((line) => `  ${line}`),
    ...emitOwnedPromiseDeclarations(context).map((line) => `  ${line}`),
    ...emitErrorChannelDeclarations(context).map((line) => `  ${line}`),
    ...emitBoxedValueDeclarations(context).map((line) => `  ${line}`),
    ...emitEventLoopInit(context).map((line) => `  ${line}`),
    ...bodyLines
  ]

  if (shouldEmitCleanupLabel(context)) {
    lines.push('ccjs_cleanup:')
    lines.push(...emitThrowingFunctionErrorTransfer(context).map((line) => `  ${line}`))
    lines.push(...emitOwnedValueCleanup(context).map((line) => `  ${line}`))
    lines.push(...emitOwnedPromiseCleanup(context).map((line) => `  ${line}`))
    lines.push(...emitEventLoopCleanup(context).map((line) => `  ${line}`))
    lines.push(...emitBoxedValueCleanup(context).map((line) => `  ${line}`))
    lines.push(...emitCleanupReturn(context).map((line) => `  ${line}`))
  } else if (context.returnType !== 'void') {
    lines.push(`  return ${context.returnType === 'string' ? '""' : '0'};`)
  }

  lines.push('}')

  return lines
}

function registerFunctionParamsInContext(statement: AnyNode, params: any[], context: CFunctionContext): void {
  for (const [index, param] of params.entries()) {
    if (isNullableScalarParam(param)) {
      context.variables.set(param.name, param.valueType)
      context.nullableVariables.add(param.name)
    } else if (
      isBoxedFunctionParam(param, index, statement, context) &&
      ['number', 'boolean', 'string', 'object'].includes(param.valueType)
    ) {
      context.variables.set(param.name, param.valueType)
      context.boxedVariables.add(param.name)
      registerBoxedValue(context, param.name, param.valueType)

      if (param.valueType === 'object') {
        registerObjectShape(context, param.name, param.shape)
      }
    } else if (param.valueType === 'string') {
      context.variables.set(param.name, 'string')
      context.runtimeStrings.add(param.name)
    } else if (param.valueType === 'object') {
      context.variables.set(param.name, 'object')
      registerObjectShape(context, param.name, param.shape)
    } else if (param.valueType === 'array') {
      context.variables.set(param.name, 'array')
      context.runtimeArrayElementTypes.set(param.name, param.arrayElementType ?? 'unknown')
    } else if (param.valueType === 'map') {
      context.variables.set(param.name, 'map')
      context.mapTypes.set(param.name, {
        key: param.mapKeyType ?? 'unknown',
        value: param.mapValueType ?? 'unknown'
      })
    } else if (param.valueType === 'set') {
      context.variables.set(param.name, 'set')
      context.setElementTypes.set(param.name, param.setElementType ?? 'unknown')
    } else if (param.valueType === 'promise') {
      context.variables.set(param.name, 'promise')
      context.promiseValueTypes.set(param.name, param.promiseValueType ?? 'unknown')
    } else if (param.valueType === 'function') {
      const runtimeFunctionType = resolveFunctionParameterRuntimeType(statement.name, index, param, context)

      context.variables.set(param.name, 'function')
      context.functionTypes.set(param.name, runtimeFunctionType ?? param.functionType)

      if (param.nullable === true) {
        context.nullableVariables.add(param.name)
      }

      if (runtimeFunctionType != null) {
        context.runtimeCallbacks.add(param.name)
      }
    } else {
      context.variables.set(param.name, param.valueType)
    }
  }
}

function emitFunctionHead(statement: AnyNode, context: CEmitContext): string {
  const name = context.functionNames.get(statement.name) ?? emitCFunctionName(statement.name)
  const returnInfo = resolveCFunctionReturnInfo(statement, context)
  const returnType = context.returnType ?? returnInfo.returnType
  const returnNullable = context.returnNullable ?? returnInfo.returnNullable
  const functionParams = resolveFunctionDeclarationParams(statement.name, statement.params, context)
  const params = functionParams.map((param, index) => {
    if (isNullableScalarParam(param)) {
      return `ccjs_value ${emitCScalarParamName(param.name)}`
    }

    if (param.valueType === 'string') {
      return `ccjs_value ${emitCStringParamName(param.name)}`
    }

    if (param.valueType === 'object') {
      if (isBoxedFunctionParam(param, index, statement, context)) {
        return `ccjs_value ${emitCObjectParamName(param.name)}`
      }

      return `ccjs_value ${param.name}`
    }

    if (param.valueType === 'array' || param.valueType === 'map' || param.valueType === 'set') {
      return `ccjs_value ${param.name}`
    }

    if (param.valueType === 'function') {
      if (resolveFunctionParameterRuntimeType(statement.name, index, param, context) != null) {
        return `ccjs_value ${param.name}`
      }

      return emitFunctionParameter(param.name, param.functionType, context, param.loc)
    }

    if (isBoxedFunctionParam(param, index, statement, context) && ['number', 'boolean'].includes(param.valueType)) {
      return `${emitCType(param.valueType)} ${emitCScalarParamName(param.name)}`
    }

    return `${emitCType(param.valueType)} ${param.name}`
  })

  if (functionTakesEventLoopParam(statement.name, context)) {
    params.unshift('ccjs_loop* ccjs_loop')
  }

  if (isThrowingFunctionName(statement.name, context)) {
    if (returnType !== 'void') {
      params.push(`${emitThrowingFunctionOutType(returnType, returnNullable)}* ccjs_out`)
    }

    params.push('ccjs_value* ccjs_error_out')

    return `ccjs_status ${name}(${params.length === 0 ? 'void' : params.join(', ')})`
  }

  return `${emitCReturnType(returnType, returnNullable)} ${name}(${params.length === 0 ? 'void' : params.join(', ')})`
}

function emitClassMethodDeclaration(info: any, method: AnyNode, baseContext: CEmitContext): string[] {
  const context = createFunctionContext(baseContext, method.returnType, method.returnNullable)
  const params = method.params

  context.returnShape = null
  context.functionReturnOut = 'ccjs_out'
  context.functionErrorOut = 'ccjs_error_out'
  context.variables.set('this', 'object')
  context.classInstanceTypes.set('this', info.name)
  registerClassObjectShape(context, 'this', info)
  registerFunctionParamsInContext(method, params, context)

  const bodyLines: string[] = []

  bodyLines.push(...emitRuntimeParamPreludeForParams(method, params, context).map((line) => `  ${line}`))
  bodyLines.push(...emitStatementList(method.body, context).map((line) => `  ${line}`))

  const lines = [
    `${emitClassMethodHead(info, method, context)} {`,
    ...emitReturnValueDeclarations(context).map((line) => `  ${line}`),
    ...emitStatusResultDeclarations(context).map((line) => `  ${line}`),
    ...emitLoopFlowDeclarations(context).map((line) => `  ${line}`),
    ...emitReturnFlowDeclarations(context).map((line) => `  ${line}`),
    ...emitOwnedValueDeclarations(context).map((line) => `  ${line}`),
    ...emitOwnedPromiseDeclarations(context).map((line) => `  ${line}`),
    ...emitErrorChannelDeclarations(context).map((line) => `  ${line}`),
    ...emitBoxedValueDeclarations(context).map((line) => `  ${line}`),
    ...bodyLines
  ]

  if (shouldEmitCleanupLabel(context)) {
    lines.push('ccjs_cleanup:')
    lines.push(...emitOwnedValueCleanup(context).map((line) => `  ${line}`))
    lines.push(...emitOwnedPromiseCleanup(context).map((line) => `  ${line}`))
    lines.push(...emitBoxedValueCleanup(context).map((line) => `  ${line}`))
    lines.push(...emitCleanupReturn(context).map((line) => `  ${line}`))
  } else if (context.returnType !== 'void') {
    lines.push(`  return ${context.returnType === 'string' ? 'ccjs_undefined_value()' : '0'};`)
  }

  lines.push('}')

  return lines
}

function emitClassMethodHead(info: any, method: AnyNode, context: CEmitContext): string {
  const params = [
    'ccjs_value this',
    ...method.params.map((param, index) => emitClassMethodParam(param, index, method, context))
  ]

  return `static ${emitCReturnType(method.returnType, method.returnNullable)} ${emitCClassMethodName(info.name, method.name)}(${params.join(', ')})`
}

function emitClassMethodParam(param: any, index: number, method: AnyNode, context: CEmitContext): string {
  if (isNullableScalarParam(param)) {
    return `ccjs_value ${emitCScalarParamName(param.name)}`
  }

  if (param.valueType === 'string') {
    return `ccjs_value ${emitCStringParamName(param.name)}`
  }

  if (param.valueType === 'object') {
    if (isBoxedFunctionParam(param, index, method, context)) {
      return `ccjs_value ${emitCObjectParamName(param.name)}`
    }

    return `ccjs_value ${param.name}`
  }

  if (param.valueType === 'array' || param.valueType === 'map' || param.valueType === 'set') {
    return `ccjs_value ${param.name}`
  }

  if (param.valueType === 'function') {
    if (resolveFunctionParameterRuntimeType(method.name, index, param, context) != null) {
      return `ccjs_value ${param.name}`
    }

    return emitFunctionParameter(param.name, param.functionType, context, param.loc)
  }

  if (isBoxedFunctionParam(param, index, method, context) && ['number', 'boolean'].includes(param.valueType)) {
    return `${emitCType(param.valueType)} ${emitCScalarParamName(param.name)}`
  }

  return `${emitCType(param.valueType)} ${param.name}`
}

function resolveCFunctionReturnInfo(
  statement: AnyNode,
  context: CEmitContext
): { returnType: any; returnNullable: boolean } {
  const returnType = resolveFunctionReturnType(statement.name, statement.returnType, context)
  const returnNullable = resolveFunctionReturnNullable(statement.name, statement.returnNullable, context)

  if (context.functionAsyncFlags.get(statement.name) === true && returnType === 'promise') {
    return {
      returnType:
        context.functionReturnPromiseValueTypes.get(statement.name) ?? statement.returnPromiseValueType ?? 'void',
      returnNullable: false
    }
  }

  return {
    returnType,
    returnNullable
  }
}

function emitFunctionParameter(name: string, functionType: any, context: CEmitContext, loc: any): string {
  reportUnsupportedCFunctionType(functionType, context, loc)

  if (isRuntimeFunctionType(functionType)) {
    return `ccjs_value ${name}`
  }

  return emitFunctionPointerParameter(name, functionType)
}

function emitFunctionPointerParameter(name, functionType) {
  return `${emitFunctionPointerReturnType(functionType)} (*${name})(${emitFunctionPointerParams(functionType)})`
}

function emitFunctionPointerVariable(
  name: string,
  init: any,
  context: CFunctionContext,
  isConst: boolean,
  functionType: any,
  loc: any
): string {
  reportUnsupportedCFunctionType(functionType, context, loc)

  return `${emitFunctionPointerReturnType(functionType)} (*${isConst ? 'const ' : ''}${name})(${emitFunctionPointerParams(functionType)}) = ${emitFunctionValueExpression(init, context)}`
}

function reportUnsupportedCFunctionType(functionType: any, context: CEmitContext, loc: any): void {
  if (functionType == null) {
    return
  }

  if (isPlainFunctionPointerType(functionType) || isRuntimeFunctionType(functionType)) {
    return
  }

  context.diagnostics.push(
    diagnostic(
      'CCJS_C_FUNCTION_VALUE',
      'typed C callbacks currently support only void callbacks with number/boolean/string/object parameters',
      loc
    )
  )
}

function emitMainWrapper(irPrograms: IrProgram[], baseContext: CEmitContext): string[] {
  const context = createFunctionContext(baseContext, 'number')
  const body = collectIrTopLevelNodesFromPrograms(irPrograms, 'statement')
  const bodyLines: string[] = []
  const lines = [context.processRuntime ? 'int main(int argc, char** argv) {' : 'int main(void) {']

  bodyLines.push(...emitStatementList(body, context).map((line) => `  ${line}`))

  if (context.processRuntime) {
    lines.push('  ccjs_process_init(argc, argv);')
  }
  lines.push(...emitLoopFlowDeclarations(context).map((line) => `  ${line}`))
  lines.push(...emitReturnValueDeclarations(context).map((line) => `  ${line}`))
  lines.push(...emitReturnFlowDeclarations(context).map((line) => `  ${line}`))
  lines.push(...emitEventLoopDeclarations(context).map((line) => `  ${line}`))
  lines.push(...emitOwnedValueDeclarations(context).map((line) => `  ${line}`))
  lines.push(...emitOwnedPromiseDeclarations(context).map((line) => `  ${line}`))
  lines.push(...emitErrorChannelDeclarations(context).map((line) => `  ${line}`))
  lines.push(...emitBoxedValueDeclarations(context).map((line) => `  ${line}`))
  lines.push(...emitEventLoopInit(context).map((line) => `  ${line}`))
  lines.push(...bodyLines)
  lines.push(...emitEventLoopDrain(context).map((line) => `  ${line}`))

  if (shouldEmitCleanupLabel(context)) {
    lines.push('ccjs_cleanup:')
    lines.push(...emitOwnedValueCleanup(context).map((line) => `  ${line}`))
    lines.push(...emitOwnedPromiseCleanup(context).map((line) => `  ${line}`))
    lines.push(...emitEventLoopCleanup(context).map((line) => `  ${line}`))
    lines.push(...emitBoxedValueCleanup(context).map((line) => `  ${line}`))
  }

  lines.push(`  return ${emitMainReturnExpression(context)};`)
  lines.push('}')

  return lines
}

function emitMainReturnExpression(context: CFunctionContext): string {
  const successReturn = context.processRuntime
    ? 'ccjs_process_get_exit_code()'
    : context.returnType === 'number'
      ? '(int)ccjs_return'
      : '0'

  return context.unhandledRejectionFlag == null
    ? successReturn
    : `${context.unhandledRejectionFlag} == 0 ? ${successReturn} : 1`
}

function emitRuntimeParamPrelude(statement: AnyNode, context: CFunctionContext): string[] {
  const params = resolveFunctionDeclarationParams(statement.name, statement.params, context)

  return emitRuntimeParamPreludeForParams(statement, params, context)
}

function emitRuntimeParamPreludeForParams(statement: AnyNode, params: any[], context: CFunctionContext): string[] {
  return params.flatMap((param, index) => {
    if (isNullableScalarParam(param)) {
      const paramName = emitCScalarParamName(param.name)
      const expectedTag = cRuntimeValueTag(param.valueType)

      return [
        ...emitRuntimeNullableValueCheck(paramName, expectedTag, context),
        `ccjs_value ${param.name} = ${paramName};`
      ]
    }

    if (isBoxedFunctionParam(param, index, statement, context) && ['string', 'object'].includes(param.valueType)) {
      const paramName =
        param.valueType === 'string' ? emitCStringParamName(param.name) : emitCObjectParamName(param.name)
      const tag = param.valueType === 'string' ? 'CCJS_TAG_STRING' : 'CCJS_TAG_OBJECT'

      return [
        emitRuntimeTypeCheck(`${paramName}.tag != ${tag} || ${paramName}.as.ref == 0`, context),
        `${param.name} = ccjs_default_alloc(0, sizeof(ccjs_value), _Alignof(ccjs_value));`,
        `if (${param.name} == 0) ${emitFailureStatement(context)}`,
        `*${param.name} = ${paramName};`,
        `ccjs_retain(*${param.name});`
      ]
    }

    if (param.valueType === 'string') {
      const paramName = emitCStringParamName(param.name)

      return [
        emitRuntimeTypeCheck(`${paramName}.tag != CCJS_TAG_STRING || ${paramName}.as.ref == 0`, context),
        `ccjs_string* ${param.name} = (ccjs_string*)${paramName}.as.ref;`
      ]
    }

    if (param.valueType === 'object') {
      return [emitRuntimeTypeCheck(`${param.name}.tag != CCJS_TAG_OBJECT || ${param.name}.as.ref == 0`, context)]
    }

    if (param.valueType === 'array' || param.valueType === 'map' || param.valueType === 'set') {
      const tag = cRuntimeValueTag(param.valueType)

      return [emitRuntimeTypeCheck(`${param.name}.tag != ${tag} || ${param.name}.as.ref == 0`, context)]
    }

    if (
      param.valueType === 'function' &&
      resolveFunctionParameterRuntimeType(statement.name, index, param, context) != null
    ) {
      if (param.nullable === true) {
        return emitRuntimeNullableValueCheck(param.name, 'CCJS_TAG_FUNCTION', context)
      }

      return [emitRuntimeTypeCheck(`${param.name}.tag != CCJS_TAG_FUNCTION || ${param.name}.as.ref == 0`, context)]
    }

    if (isBoxedFunctionParam(param, index, statement, context) && ['number', 'boolean'].includes(param.valueType)) {
      return [
        `${param.name} = ccjs_default_alloc(0, sizeof(double), _Alignof(double));`,
        `if (${param.name} == 0) ${emitFailureStatement(context)}`,
        `*${param.name} = ${emitCScalarParamName(param.name)};`
      ]
    }

    return []
  })
}

function emitThrowingFunctionPrelude(context: CFunctionContext): string[] {
  if (!context.throwingFunction) {
    return []
  }

  return [
    `if (${context.functionErrorOut} == 0${context.returnType === 'void' ? '' : ` || ${context.functionReturnOut} == 0`}) return CCJS_ERR_TYPE;`,
    `*${context.functionErrorOut} = ccjs_undefined_value();`,
    ...(context.returnType === 'void'
      ? []
      : [`*${context.functionReturnOut} = ${isThrowingFunctionRuntimeOut(context) ? 'ccjs_undefined_value()' : '0'};`])
  ]
}

function emitStatement(statement: AnyNode, context: CFunctionContext): string[] {
  if (statement.type === 'BlockStatement') {
    return withVariableScope(context, () => [
      '{',
      ...emitStatementBody(statement, context).map((line) => `  ${line}`),
      '}'
    ])
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
  const types = [
    ...collectIrLocalThrowValueTypes(statement.block, {
      errorObjectNames: context.errorObjectNames,
      functionThrowValueTypes: context.functionThrowValueTypes
    }),
    ...collectLocalAwaitRejectionValueTypes(statement.block, context)
  ]

  return types.length > 0 && types.every((type) => type === 'error') ? 'object' : 'string'
}

function collectLocalAwaitRejectionValueTypes(
  node,
  context,
  localPromiseRejectionValueTypes = new Map(),
  localErrorObjectNames = new Set(context.errorObjectNames)
) {
  if (node == null) {
    return []
  }

  if (Array.isArray(node)) {
    const types: string[] = []

    for (const item of node) {
      types.push(
        ...collectLocalAwaitRejectionValueTypes(item, context, localPromiseRejectionValueTypes, localErrorObjectNames)
      )
    }

    return types
  }

  if (typeof node !== 'object') {
    return []
  }

  if (node.type === 'BlockStatement') {
    return collectLocalAwaitRejectionValueTypes(
      node.body,
      context,
      new Map(localPromiseRejectionValueTypes),
      new Set(localErrorObjectNames)
    )
  }

  if (node.type === 'VariableDeclaration') {
    const types = collectLocalAwaitRejectionValueTypes(
      node.init,
      context,
      localPromiseRejectionValueTypes,
      localErrorObjectNames
    )

    if (isErrorConstructorExpression(node.init)) {
      localErrorObjectNames.add(node.name)
    }

    if (node.valueType === 'promise') {
      const rejectionValueType = inferPromiseRejectionValueType(
        node.init,
        context,
        localPromiseRejectionValueTypes,
        localErrorObjectNames
      )

      if (rejectionValueType !== 'unknown') {
        localPromiseRejectionValueTypes.set(node.name, rejectionValueType)
      }
    }

    return types
  }

  if (node.type === 'AwaitExpression') {
    const rejectionValueType = inferPromiseRejectionValueType(
      node.argument,
      context,
      localPromiseRejectionValueTypes,
      localErrorObjectNames
    )

    return rejectionValueType === 'unknown' ? [] : [rejectionValueType]
  }

  return Object.values(node).flatMap((value) =>
    collectLocalAwaitRejectionValueTypes(value, context, localPromiseRejectionValueTypes, localErrorObjectNames)
  )
}

function inferPromiseRejectionValueType(
  expression,
  context,
  localPromiseRejectionValueTypes = context.promiseRejectionValueTypes,
  localErrorObjectNames = context.errorObjectNames
) {
  if (expression?.type === 'CallExpression' && cPromiseRuntimeCallName(expression.callee) === 'reject') {
    return inferRejectedValueType(expression.args[0], context, localErrorObjectNames)
  }

  if (expression?.type === 'CallExpression' && cFsRuntimeExpressionMethod(expression) != null) {
    return 'error'
  }

  if (expression?.type === 'CallExpression' && cFetchRuntimeExpressionMethod(expression) != null) {
    return 'error'
  }

  if (expression?.type === 'Reference' && expression.path.length === 1) {
    return (
      localPromiseRejectionValueTypes.get(expression.path[0]) ??
      context.promiseRejectionValueTypes.get(expression.path[0]) ??
      'unknown'
    )
  }

  return 'unknown'
}

function inferRejectedValueType(expression, context, localErrorObjectNames = context.errorObjectNames) {
  if (isKnownErrorValueExpression(expression, context, localErrorObjectNames)) {
    return 'error'
  }

  if (
    expression?.type === 'StringLiteral' ||
    expression?.type === 'TemplateLiteral' ||
    inferExpressionType(expression, context) === 'string'
  ) {
    return 'string'
  }

  return 'unknown'
}

function emitScalarVariableDeclaration(statement, context) {
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

function isBoxedRuntimeValueAssignment(expression, context) {
  return (
    expression.target?.type === 'Reference' &&
    expression.target.path.length === 1 &&
    isBoxedRuntimeValueName(expression.target.path[0], context)
  )
}

function isNullableRuntimeValueAssignment(expression, context) {
  return (
    expression.target?.type === 'Reference' &&
    expression.target.path.length === 1 &&
    context.nullableVariables.has(expression.target.path[0])
  )
}

function emitNullableRuntimeValueAssignment(expression, context) {
  const name = expression.target.path[0]
  const expectedTag = cRuntimeValueTag(context.variables.get(name))
  const targetType = context.variables.get(name)
  const value = isNullableScalarType(targetType)
    ? emitNullableScalarValueExpression(expression.value, context)
    : targetType === 'function'
      ? emitNullableFunctionValueExpression(expression.value, context.functionTypes.get(name), context)
      : expression.value.type === 'ObjectLiteral'
        ? emitCObjectLiteralValueExpression(
            expression.value,
            context,
            context.objectShapes.get(name) == null
              ? null
              : {
                  fields: context.objectShapes.get(name)
                }
          )
        : emitCValueExpression(expression.value, context)
  const temp = nextCName(context, 'ccjs_nullable_value')

  return [
    ...value.lines,
    `ccjs_value ${temp} = ${value.expression};`,
    ...emitRuntimeNullableValueCheck(temp, expectedTag, context),
    `ccjs_retain(${temp});`,
    `ccjs_release(${name});`,
    `${name} = ${temp};`,
    ...clearNullableScalarNarrowing(name, context)
  ]
}

function emitBoxedRuntimeValueAssignment(expression, context) {
  const name = expression.target.path[0]
  const expected = context.variables.get(name)
  const value = emitCValueExpression(expression.value, context)
  const temp = nextCName(context, 'ccjs_box_value')
  const tag = expected === 'string' ? 'CCJS_TAG_STRING' : 'CCJS_TAG_OBJECT'

  return [
    ...value.lines,
    `ccjs_value ${temp} = ${value.expression};`,
    emitRuntimeTypeCheck(`${temp}.tag != ${tag} || ${temp}.as.ref == 0`, context),
    `ccjs_retain(${temp});`,
    `ccjs_release(*${name});`,
    `*${name} = ${temp};`
  ]
}

function isBoxedRuntimeValueName(name, context) {
  return context.boxedVariables.has(name) && isRuntimeBoxedValueType(context.variables.get(name))
}

function isBoxedRuntimeStringName(name, context) {
  return context.boxedVariables.has(name) && context.variables.get(name) === 'string'
}

function isBoxedRuntimeStringReference(expression, context) {
  return (
    expression?.type === 'Reference' &&
    expression.path.length === 1 &&
    isBoxedRuntimeStringName(expression.path[0], context)
  )
}

function emitBoxedObjectVariableDeclaration(statement, context) {
  const shapeName = nextCName(context, `ccjs_shape_${statement.name}`)
  const fieldsName = `${shapeName}_fields`
  const fields =
    statement.shape?.fields ??
    statement.init.properties.map((property) => ({
      name: property.key,
      readonly: false,
      valueType: inferExpressionType(property.value, context)
    }))
  const properties = new Map<string, AnyNode>(statement.init.properties.map((property) => [property.key, property]))
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
    fields.map((field) => ({
      name: field.name,
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

  for (const [index, field] of fields.entries()) {
    const property = properties.get(field.name)

    if (property == null) {
      context.diagnostics.push(diagnostic('CCJS_MISSING_FIELD', `missing field ${field.name}`, statement.loc))
      continue
    }

    const value = emitCValueExpression(property.value, context)
    lines.push(...value.lines)
    lines.push(emitStatusCheck(`ccjs_object_init_known(*${statement.name}, ${index}, ${value.expression})`, context))
  }

  return lines
}

function emitKnownObjectMemberVariableDeclaration(statement, member, context) {
  return emitObjectMemberVariableDeclaration(
    statement,
    member,
    context,
    (temp) =>
      `ccjs_object_get_known(${emitObjectValueReference(member.objectName, context)}, ${member.index}, &${temp})`
  )
}

function emitDynamicObjectMemberVariableDeclaration(statement, member, context) {
  return emitObjectMemberVariableDeclaration(
    statement,
    member,
    context,
    (temp) =>
      `ccjs_object_get(${emitObjectValueReference(member.objectName, context)}, ${cStringLiteral(member.key)}, ${utf8ByteLength(member.key)}, &${temp})`
  )
}

function emitObjectMemberVariableDeclaration(statement, member, context, emitGetCall) {
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
    context.diagnostics.push(
      diagnostic(
        cUnsupportedExpressionCode(member.valueType),
        member.valueType === 'function'
          ? 'stored callback object fields need delayed closure lifetime support and are not supported by the current C backend slice'
          : 'this object field type is not supported by the current C backend slice',
        statement.loc
      )
    )
    return [`double ${statement.name} = 0;`]
  }

  const temp = nextCName(context, 'ccjs_field')
  registerOwnedValue(context, temp)
  const lines = [
    ...emitPrepareOwnedValueWrite(temp),
    emitStatusCheck(emitGetCall(temp), context),
    `${statement.kind === 'const' ? 'const ' : ''}double ${statement.name} = ${member.valueType === 'boolean' ? `${temp}.as.boolean ? 1 : 0` : `${temp}.as.number`};`
  ]

  context.variables.set(statement.name, member.valueType)

  return lines
}

function emitObjectArrayMemberVariableDeclaration(statement, member, context, emitGetCall) {
  registerOwnedValue(context, statement.name)

  const lines = [
    ...emitPrepareOwnedValueWrite(statement.name),
    emitStatusCheck(emitGetCall(statement.name), context),
    emitRuntimeTypeCheck(`${statement.name}.tag != CCJS_TAG_ARRAY || ${statement.name}.as.ref == 0`, context)
  ]

  context.variables.set(statement.name, 'array')
  context.runtimeArrayElementTypes.set(statement.name, member.arrayElementType ?? 'unknown')

  return lines
}

function emitObjectCollectionMemberVariableDeclaration(statement, member, context, emitGetCall) {
  registerOwnedValue(context, statement.name)

  const tag = member.valueType === 'map' ? 'CCJS_TAG_MAP' : 'CCJS_TAG_SET'
  const lines = [
    ...emitPrepareOwnedValueWrite(statement.name),
    emitStatusCheck(emitGetCall(statement.name), context),
    emitRuntimeTypeCheck(`${statement.name}.tag != ${tag} || ${statement.name}.as.ref == 0`, context)
  ]

  context.variables.set(statement.name, member.valueType)

  if (member.valueType === 'map') {
    context.mapTypes.set(statement.name, {
      key: member.mapKeyType ?? 'unknown',
      value: member.mapValueType ?? 'unknown'
    })
  } else {
    context.setElementTypes.set(statement.name, member.setElementType ?? 'unknown')
  }

  return lines
}

function emitObjectBytesMemberVariableDeclaration(statement, member, context, emitGetCall) {
  registerOwnedValue(context, statement.name)
  const lines = [
    ...emitPrepareOwnedValueWrite(statement.name),
    emitStatusCheck(emitGetCall(statement.name), context),
    emitRuntimeTypeCheck(`${statement.name}.tag != CCJS_TAG_BYTES || ${statement.name}.as.ref == 0`, context)
  ]

  context.variables.set(statement.name, member.valueType)

  return lines
}

function emitObjectObjectMemberVariableDeclaration(statement, member, context, emitGetCall) {
  registerOwnedValue(context, statement.name)
  const lines = [
    ...emitPrepareOwnedValueWrite(statement.name),
    emitStatusCheck(emitGetCall(statement.name), context),
    emitRuntimeTypeCheck(`${statement.name}.tag != CCJS_TAG_OBJECT || ${statement.name}.as.ref == 0`, context)
  ]

  context.variables.set(statement.name, 'object')

  if (statement.shape != null) {
    registerObjectShape(context, statement.name, statement.shape)
  }

  return lines
}

function emitObjectStringMemberVariableDeclaration(statement, member, context, emitGetCall) {
  const temp = nextCName(context, 'ccjs_field')
  registerOwnedValue(context, temp)
  const lines = [
    ...emitPrepareOwnedValueWrite(temp),
    emitStatusCheck(emitGetCall(temp), context),
    emitRuntimeTypeCheck(`${temp}.tag != CCJS_TAG_STRING || ${temp}.as.ref == 0`, context),
    `${statement.kind === 'const' ? 'const ' : ''}ccjs_string* ${statement.name} = (ccjs_string*)${temp}.as.ref;`
  ]

  context.variables.set(statement.name, 'string')
  context.runtimeStrings.add(statement.name)

  return lines
}

function emitKnownObjectMemberAssignment(expression, member, context) {
  const value = emitCValueExpression(expression.value, context)
  const valueType = inferExpressionType(expression.value, context)

  updateKnownObjectMemberValueType(member, valueType, context)

  return [
    ...value.lines,
    emitStatusCheck(
      `ccjs_object_set_known(${emitObjectValueReference(member.objectName, context)}, ${member.index}, ${value.expression})`,
      context
    )
  ]
}

function emitDynamicObjectMemberAssignment(expression, member, context) {
  const value = emitCValueExpression(expression.value, context)
  const valueType = inferExpressionType(expression.value, context)

  updateKnownObjectMemberValueType(member, valueType, context)

  return [
    ...value.lines,
    emitStatusCheck(
      `ccjs_object_set(${emitObjectValueReference(member.objectName, context)}, ${cStringLiteral(member.key)}, ${utf8ByteLength(member.key)}, ${value.expression})`,
      context
    )
  ]
}

function emitKnownArrayIndexVariableDeclaration(statement, element, context) {
  if (element.valueType === 'string') {
    return emitKnownArrayStringIndexVariableDeclaration(statement, element, context)
  }

  if (!['number', 'boolean'].includes(element.valueType)) {
    context.diagnostics.push(
      diagnostic(
        cUnsupportedExpressionCode(element.valueType),
        element.valueType === 'function'
          ? 'stored callback array elements need delayed closure lifetime support and are not supported by the current C backend slice'
          : 'this array element type is not supported by the current C backend slice',
        statement.loc
      )
    )
    return [`double ${statement.name} = 0;`]
  }

  const temp = nextCName(context, 'ccjs_item')
  registerOwnedValue(context, temp)
  const lines = [
    ...emitPrepareOwnedValueWrite(temp),
    emitStatusCheck(`ccjs_array_get(${element.arrayName}, ${element.index}, &${temp})`, context),
    `${statement.kind === 'const' ? 'const ' : ''}double ${statement.name} = ${element.valueType === 'boolean' ? `${temp}.as.boolean ? 1 : 0` : `${temp}.as.number`};`
  ]

  context.variables.set(statement.name, element.valueType)

  return lines
}

function emitKnownArrayStringIndexVariableDeclaration(statement, element, context) {
  const temp = nextCName(context, 'ccjs_item')
  registerOwnedValue(context, temp)
  const lines = [
    ...emitPrepareOwnedValueWrite(temp),
    emitStatusCheck(`ccjs_array_get(${element.arrayName}, ${element.index}, &${temp})`, context),
    emitRuntimeTypeCheck(`${temp}.tag != CCJS_TAG_STRING || ${temp}.as.ref == 0`, context),
    `${statement.kind === 'const' ? 'const ' : ''}ccjs_string* ${statement.name} = (ccjs_string*)${temp}.as.ref;`
  ]

  context.variables.set(statement.name, 'string')
  context.runtimeStrings.add(statement.name)

  return lines
}

function emitKnownArrayIndexAssignment(expression, element, context) {
  const value = emitCValueExpression(expression.value, context)
  const valueType = inferExpressionType(expression.value, context)

  updateKnownArrayElementValueType(element, valueType, context)

  return [
    ...value.lines,
    emitStatusCheck(`ccjs_array_set(${element.arrayName}, ${element.index}, ${value.expression})`, context)
  ]
}

function emitArrayVariableDeclaration(statement, context) {
  const lines = [
    ...emitPrepareOwnedValueWrite(statement.name),
    emitStatusCheck(
      `ccjs_array_new(&ccjs_default_allocator, ${statement.init.elements.length}, &${statement.name})`,
      context
    )
  ]

  registerOwnedValue(context, statement.name)
  context.variables.set(statement.name, 'array')
  context.arrayShapes.set(
    statement.name,
    statement.init.elements.map((element) => ({
      valueType: inferExpressionType(element, context)
    }))
  )

  for (const [index, element] of statement.init.elements.entries()) {
    const value = emitCValueExpression(element, context)
    lines.push(...value.lines)
    lines.push(emitStatusCheck(`ccjs_array_set(${statement.name}, ${index}, ${value.expression})`, context))
  }

  return lines
}

function emitCValueExpression(expression, context) {
  return emitCValueExpressionWithDependencies(expression, context, cValueExpressionDependencies)
}

function emitNullableScalarValueExpression(expression, context) {
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

  return {
    lines: value.lines,
    expression:
      valueType === 'boolean' ? `ccjs_bool_value((${value.expression}) != 0)` : `ccjs_number_value(${value.expression})`
  }
}

function emitPreparedNullableScalarRuntimeValueExpression(expression, context) {
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
    registerOwnedValue(context, temp)

    return {
      lines: [
        ...call.lines,
        ...emitPrepareOwnedValueWrite(temp),
        `${temp} = ${call.expression};`,
        ...emitRuntimeNullableValueCheck(temp, expectedTag, context)
      ],
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

function emitNullableFunctionValueExpression(expression, functionType, context) {
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

function emitCArrayLiteralValueExpression(expression, context) {
  const temp = nextCName(context, 'ccjs_array')
  registerOwnedValue(context, temp)
  const lines = [
    ...emitPrepareOwnedValueWrite(temp),
    emitStatusCheck(`ccjs_array_new(&ccjs_default_allocator, ${expression.elements.length}, &${temp})`, context)
  ]

  for (const [index, element] of expression.elements.entries()) {
    const value = emitCValueExpression(element, context)
    lines.push(...value.lines)
    lines.push(emitStatusCheck(`ccjs_array_set(${temp}, ${index}, ${value.expression})`, context))
  }

  return {
    lines,
    expression: temp
  }
}

function emitCObjectLiteralValueExpression(expression, context, shape: AnyNode | null = null) {
  const temp = nextCName(context, 'ccjs_object')
  const shapeName = nextCName(context, 'ccjs_shape_value')
  const fieldsName = `${shapeName}_fields`
  const fields =
    shape?.fields ??
    expression.properties.map((property) => ({
      name: property.key,
      readonly: false,
      valueType: inferExpressionType(property.value, context)
    }))
  const properties = new Map<string, AnyNode>(expression.properties.map((property) => [property.key, property]))
  const lines = [`static const ccjs_field_info ${fieldsName}[] = {`]

  for (const field of fields) {
    lines.push(`  { ${cStringLiteral(field.name)}, ${emitCFieldFlags(field)} },`)
  }

  lines.push('};')
  lines.push(`static const ccjs_shape ${shapeName} = {`)
  lines.push(`  ${fields.length},`)
  lines.push(`  ${fieldsName}`)
  lines.push('};')
  registerOwnedValue(context, temp)
  lines.push(...emitPrepareOwnedValueWrite(temp))
  lines.push(emitStatusCheck(`ccjs_object_new(&ccjs_default_allocator, &${shapeName}, &${temp})`, context))

  for (const [index, field] of fields.entries()) {
    const property = properties.get(field.name)

    if (property == null) {
      context.diagnostics.push(diagnostic('CCJS_MISSING_FIELD', `missing field ${field.name}`, expression.loc))
      continue
    }

    const value = emitCValueExpression(property.value, context)
    lines.push(...value.lines)
    lines.push(emitStatusCheck(`ccjs_object_init_known(${temp}, ${index}, ${value.expression})`, context))
  }

  return {
    lines,
    expression: temp
  }
}

function emitErrorObjectVariableDeclaration(statement, context) {
  registerOwnedValue(context, statement.name)
  context.variables.set(statement.name, 'object')
  registerErrorObjectShape(context, statement.name)

  return emitCErrorObjectInitLines(statement.name, statement.init, context)
}

function emitCErrorObjectValueExpression(expression, context) {
  const temp = nextCName(context, 'ccjs_error_object')
  registerOwnedValue(context, temp)

  return {
    lines: emitCErrorObjectInitLines(temp, expression, context),
    expression: temp
  }
}

function emitCErrorObjectInitLines(target, expression, context) {
  const shapeName = nextCName(context, 'ccjs_shape_error')
  const fieldsName = `${shapeName}_fields`
  const parts = errorConstructorExpressions(expression, context)
  const name = emitCValueExpression(cStringLiteralNode('Error', expression.loc), context)
  const message = emitCValueExpression(parts.message, context)
  const code = emitCValueExpression(parts.code, context)
  const cause = emitCValueExpression(parts.cause, context)

  return [
    `static const ccjs_field_info ${fieldsName}[] = {`,
    `  { ${cStringLiteral('name')}, CCJS_FIELD_READONLY },`,
    `  { ${cStringLiteral('message')}, CCJS_FIELD_READONLY },`,
    `  { ${cStringLiteral('code')}, CCJS_FIELD_READONLY },`,
    `  { ${cStringLiteral('cause')}, CCJS_FIELD_READONLY },`,
    '};',
    `static const ccjs_shape ${shapeName} = {`,
    '  4,',
    `  ${fieldsName}`,
    '};',
    ...emitPrepareOwnedValueWrite(target),
    emitStatusCheck(`ccjs_object_new(&ccjs_default_allocator, &${shapeName}, &${target})`, context),
    ...name.lines,
    emitStatusCheck(`ccjs_object_init_known(${target}, 0, ${name.expression})`, context),
    ...message.lines,
    emitStatusCheck(`ccjs_object_init_known(${target}, 1, ${message.expression})`, context),
    ...code.lines,
    emitStatusCheck(`ccjs_object_init_known(${target}, 2, ${code.expression})`, context),
    ...cause.lines,
    emitStatusCheck(`ccjs_object_init_known(${target}, 3, ${cause.expression})`, context)
  ]
}

function errorConstructorExpressions(expression, context) {
  if (expression.args.length > 2) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_ARG_COUNT',
        `Error constructor expects at most 2 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    )
  }

  const message = expression.args[0] ?? cStringLiteralNode('', expression.loc)
  const options = expression.args[1]
  let code = cStringLiteralNode('', expression.loc)
  let cause = cNullLiteralNode(expression.loc)

  if (inferExpressionType(message, context) !== 'string') {
    context.diagnostics.push(
      diagnostic(
        'CCJS_TYPE_MISMATCH',
        'Error message must be a string in the current C backend slice',
        message.loc ?? expression.loc
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
    context.diagnostics.push(
      diagnostic(
        'CCJS_TYPE_MISMATCH',
        'Error options must be an object literal in the current C backend slice',
        options.loc ?? expression.loc
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
        context.diagnostics.push(
          diagnostic(
            'CCJS_TYPE_MISMATCH',
            'Error code must be a string in the current C backend slice',
            property.value.loc ?? property.loc
          )
        )
      } else {
        code = property.value
      }
    } else if (property.key === 'cause') {
      if (property.value.type === 'NullLiteral' || isErrorValueExpression(property.value, context)) {
        cause = property.value
      } else {
        context.diagnostics.push(
          diagnostic(
            'CCJS_TYPE_MISMATCH',
            'Error cause must be an Error object or null in the current C backend slice',
            property.value.loc ?? property.loc
          )
        )
      }
    } else {
      context.diagnostics.push(
        diagnostic('CCJS_UNKNOWN_FIELD', `unknown Error option ${property.key}`, property.loc ?? options.loc)
      )
    }
  }

  return {
    message,
    code,
    cause
  }
}

function cStringLiteralNode(value, loc = null) {
  return {
    type: 'StringLiteral',
    value,
    loc
  }
}

function cNullLiteralNode(loc = null) {
  return {
    type: 'NullLiteral',
    loc
  }
}

function emitCNullishCoalescingValueExpression(expression, context) {
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
  registerOwnedValue(context, temp)

  return {
    lines: [
      ...left.lines,
      ...emitPrepareOwnedValueWrite(temp),
      `if (${left.expression}.tag == CCJS_TAG_NULL) {`,
      ...right.lines.map((line) => `  ${line}`),
      `  ${temp} = ${right.expression};`,
      ...emitRuntimeNullableValueCheck(temp, expectedTag, context).map((line) => `  ${line}`),
      `  ccjs_retain(${temp});`,
      '} else {',
      `  ${temp} = ${left.expression};`,
      ...emitRuntimeNullableValueCheck(temp, expectedTag, context).map((line) => `  ${line}`),
      `  ccjs_retain(${temp});`,
      '}'
    ],
    expression: temp
  }
}

function emitConsoleLogStatement(method, args, context) {
  const stream = method === 'warn' || method === 'error' ? 'CCJS_CONSOLE_STDERR' : 'CCJS_CONSOLE_STDOUT'
  const isStdout = stream === 'CCJS_CONSOLE_STDOUT'

  if (args.length === 0) {
    return isStdout
      ? ['printf("\\n");']
      : [`if (ccjs_console_printf(${stream}, "\\n") < 0) ${emitFailureStatement(context)}`]
  }

  const lines: string[] = []
  const parts: string[] = []
  const values: string[] = []

  for (const arg of args) {
    const value = emitConsoleLogValue(arg, context)

    lines.push(...value.lines)
    parts.push(value.format)
    values.push(...value.values)
  }

  const format = escapeCString(parts.join(' '))

  if (values.length === 0) {
    lines.push(
      isStdout
        ? `printf("${format}\\n");`
        : `if (ccjs_console_printf(${stream}, "${format}\\n") < 0) ${emitFailureStatement(context)}`
    )
  } else {
    lines.push(
      isStdout
        ? `printf("${format}\\n", ${values.join(', ')});`
        : `if (ccjs_console_printf(${stream}, "${format}\\n", ${values.join(', ')}) < 0) ${emitFailureStatement(context)}`
    )
  }

  return lines
}

function emitConsoleLogValue(expression, context) {
  const type = inferExpressionType(expression, context)

  if (type === 'string') {
    return emitStringLogValue(expression, context)
  }

  if (type === 'number' || type === 'boolean') {
    return emitNumberLogValue(expression, type, context)
  }

  if (type === 'object' && isErrorValueExpression(expression, context)) {
    return emitRuntimeErrorLogValue(expression, context)
  }

  context.diagnostics.push(
    diagnostic(
      cUnsupportedExpressionCode(type),
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

function emitStringLogValue(expression, context) {
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

    if (member?.valueType === 'string') {
      return emitRuntimeStringLogValue(
        (temp) =>
          `ccjs_object_get_known(${emitObjectValueReference(member.objectName, context)}, ${member.index}, &${temp})`,
        context
      )
    }
  }

  if (isIndexAccessExpression(expression)) {
    const element = resolveKnownArrayIndex(expression, context)

    if (element?.valueType === 'string') {
      return emitRuntimeStringLogValue(
        (temp) => `ccjs_array_get(${element.arrayName}, ${element.index}, &${temp})`,
        context
      )
    }

    const field = resolveKnownObjectIndex(expression, context)

    if (field?.valueType === 'string') {
      return emitRuntimeStringLogValue(
        (temp) =>
          `ccjs_object_get(${emitObjectValueReference(field.objectName, context)}, ${cStringLiteral(field.key)}, ${utf8ByteLength(field.key)}, &${temp})`,
        context
      )
    }

    const runtimeElement = resolveRuntimeArrayIndex(expression, context)

    if (runtimeElement?.valueType === 'string') {
      const value = emitPreparedRuntimeArrayIndexValue(expression, runtimeElement, context, 'ccjs_log_value')
      const string = nextCName(context, 'ccjs_log_string')

      return {
        lines: [
          ...value.lines,
          emitRuntimeTypeCheck(
            `${value.expression}.tag != CCJS_TAG_STRING || ${value.expression}.as.ref == 0`,
            context
          ),
          `ccjs_string* ${string} = (ccjs_string*)${value.expression}.as.ref;`
        ],
        format: '%.*s',
        values: [`(int)${string}->len`, `${string}->bytes`]
      }
    }
  }

  if (isRuntimeProducedStringExpression(expression, context)) {
    const value = emitCValueExpression(expression, context)
    const string = nextCName(context, 'ccjs_log_string')

    return {
      lines: [...value.lines, `ccjs_string* ${string} = (ccjs_string*)${value.expression}.as.ref;`],
      format: '%.*s',
      values: [`(int)${string}->len`, `${string}->bytes`]
    }
  }

  if (isStringConcatExpression(expression, context)) {
    const value = emitCValueExpression(expression, context)
    const string = nextCName(context, 'ccjs_log_string')

    return {
      lines: [...value.lines, `ccjs_string* ${string} = (ccjs_string*)${value.expression}.as.ref;`],
      format: '%.*s',
      values: [`(int)${string}->len`, `${string}->bytes`]
    }
  }

  if (isNullishCoalescingExpression(expression) && canLowerCNullishCoalescingExpression(expression, context)) {
    const value = emitCValueExpression(expression, context)
    const string = nextCName(context, 'ccjs_log_string')

    return {
      lines: [
        ...value.lines,
        emitRuntimeTypeCheck(`${value.expression}.tag != CCJS_TAG_STRING || ${value.expression}.as.ref == 0`, context),
        `ccjs_string* ${string} = (ccjs_string*)${value.expression}.as.ref;`
      ],
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

function emitNumberLogValue(expression, type, context) {
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
        (temp) =>
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
        (temp) => `ccjs_array_get(${element.arrayName}, ${element.index}, &${temp})`,
        context
      )
    }

    const field = resolveKnownObjectIndex(expression, context)

    if (field != null && ['number', 'boolean'].includes(field.valueType)) {
      return emitRuntimeNumberLogValue(
        field.valueType,
        (temp) =>
          `ccjs_object_get(${emitObjectValueReference(field.objectName, context)}, ${cStringLiteral(field.key)}, ${utf8ByteLength(field.key)}, &${temp})`,
        context
      )
    }

    const runtimeElement = resolveRuntimeArrayIndex(expression, context)

    if (runtimeElement != null && ['number', 'boolean'].includes(runtimeElement.valueType)) {
      const value = emitPreparedRuntimeArrayIndexValue(expression, runtimeElement, context, 'ccjs_log_value')

      return {
        lines: value.lines,
        format: '%g',
        values: [
          runtimeElement.valueType === 'boolean'
            ? `((double)(${value.expression}.as.boolean ? 1 : 0))`
            : `${value.expression}.as.number`
        ]
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

function emitRuntimeStringLogValue(emitGetCall, context) {
  const value = nextCName(context, 'ccjs_log_value')
  const string = nextCName(context, 'ccjs_log_string')
  registerOwnedValue(context, value)

  return {
    lines: [
      ...emitPrepareOwnedValueWrite(value),
      emitStatusCheck(emitGetCall(value), context),
      emitRuntimeTypeCheck(`${value}.tag != CCJS_TAG_STRING || ${value}.as.ref == 0`, context),
      `ccjs_string* ${string} = (ccjs_string*)${value}.as.ref;`
    ],
    format: '%.*s',
    values: [`(int)${string}->len`, `${string}->bytes`]
  }
}

function emitRuntimeNumberLogValue(valueType, emitGetCall, context) {
  const value = nextCName(context, 'ccjs_log_value')
  registerOwnedValue(context, value)

  return {
    lines: [...emitPrepareOwnedValueWrite(value), emitStatusCheck(emitGetCall(value), context)],
    format: '%g',
    values: [valueType === 'boolean' ? `((double)(${value}.as.boolean ? 1 : 0))` : `${value}.as.number`]
  }
}

function emitRuntimeErrorLogValue(expression, context) {
  const object = emitErrorLogObjectExpression(expression, context)
  const nameValue = nextCName(context, 'ccjs_log_value')
  const messageValue = nextCName(context, 'ccjs_log_value')
  const nameString = nextCName(context, 'ccjs_log_string')
  const messageString = nextCName(context, 'ccjs_log_string')
  registerOwnedValue(context, nameValue)
  registerOwnedValue(context, messageValue)

  return {
    lines: [
      ...object.lines,
      ...emitPrepareOwnedValueWrite(nameValue),
      ...emitPrepareOwnedValueWrite(messageValue),
      emitStatusCheck(`ccjs_object_get_known(${object.expression}, 0, &${nameValue})`, context),
      emitStatusCheck(`ccjs_object_get_known(${object.expression}, 1, &${messageValue})`, context),
      emitRuntimeTypeCheck(`${nameValue}.tag != CCJS_TAG_STRING || ${nameValue}.as.ref == 0`, context),
      emitRuntimeTypeCheck(`${messageValue}.tag != CCJS_TAG_STRING || ${messageValue}.as.ref == 0`, context),
      `ccjs_string* ${nameString} = (ccjs_string*)${nameValue}.as.ref;`,
      `ccjs_string* ${messageString} = (ccjs_string*)${messageValue}.as.ref;`
    ],
    format: '%.*s: %.*s',
    values: [`(int)${nameString}->len`, `${nameString}->bytes`, `(int)${messageString}->len`, `${messageString}->bytes`]
  }
}

function emitErrorLogObjectExpression(expression, context) {
  if (expression?.type === 'Reference' && expression.path.length === 1) {
    return {
      lines: [],
      expression: emitObjectValueReference(expression.path[0], context)
    }
  }

  return emitCValueExpression(expression, context)
}

function emitPreparedNumberExpression(expression, context) {
  return emitPreparedNumberExpressionWithDependencies(expression, context, cScalarExpressionDependencies)
}

function emitCExpression(expression, context) {
  return emitCExpressionWithDependencies(expression, context, cScalarExpressionDependencies)
}

function emitPreparedUpdateExpression(expression, context) {
  return emitPreparedUpdateExpressionWithDependencies(expression, context, cScalarExpressionDependencies)
}

function emitReference(expression, context) {
  if (expression?.type === 'Reference') {
    const name = expression.path.join('_')

    if (context.variables.has(name)) {
      return context.boxedVariables.has(name) ? `(*${name})` : name
    }

    return context.functionNames.get(name) ?? name
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

function emitCallExpression(expression, context) {
  return emitCallExpressionWithDependencies(expression, context, cCallExpressionDependencies)
}

function emitPreparedCallExpression(expression, context) {
  return emitPreparedCallExpressionWithDependencies(expression, context, cCallExpressionDependencies)
}

function emitPreparedCallArgs(expression, params, context) {
  return emitPreparedCallArgsWithDependencies(expression, params, context, cCallExpressionDependencies)
}

function emitFetchAbortControllerVariableDeclaration(statement, context) {
  if (!isFetchAbortControllerConstructorExpression(statement.init)) {
    return null
  }

  registerOwnedValue(context, statement.name)
  context.variables.set(statement.name, 'object')
  registerObjectShape(context, statement.name, statement.shape)

  return [
    ...emitPrepareOwnedValueWrite(statement.name),
    emitStatusCheck(`ccjs_fetch_abort_controller_new(&ccjs_default_allocator, &${statement.name})`, context)
  ]
}

function emitFetchAbortControllerAbortStatement(expression, context) {
  if (cFetchRuntimeExpressionMethod(expression) !== 'abort') {
    return null
  }

  const controller = emitCValueExpression(expression.callee.object, context)

  return [
    ...controller.lines,
    emitRuntimeTypeCheck(
      `${controller.expression}.tag != CCJS_TAG_OBJECT || ${controller.expression}.as.ref == 0`,
      context
    ),
    emitStatusCheck(`ccjs_fetch_abort_controller_abort(${controller.expression})`, context)
  ]
}

function emitPreparedDebugMemoryCallExpression(expression, context, options: { discard?: boolean } = {}) {
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
  lines.push(...emitPrepareOwnedValueWrite(out))
  lines.push(emitStatusCheck(`ccjs_object_new(&ccjs_default_allocator, &${shapeName}, &${out})`, context))

  for (const [index, field] of debugMemoryStatsFields.entries()) {
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
  expression,
  context,
  options: { out?: string; owned?: boolean } = {}
) {
  if (
    expression?.type !== 'CallExpression' ||
    !isAsyncFunctionCallee(expression.callee, context) ||
    expression.valueType !== 'promise'
  ) {
    return null
  }

  const valueType =
    resolveCAsyncFunctionAwaitValueType(expression.callee, context) ?? expression.promiseValueType ?? 'unknown'
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

  const out = options.out ?? nextCName(context, 'ccjs_promise')
  const call = emitPreparedCallExpression(expression, context)
  const managedValue = isManagedRuntimeReturnType(valueType) ? nextCName(context, 'ccjs_async_value') : null
  const value =
    valueType === 'void'
      ? 'ccjs_undefined_value()'
      : valueType === 'boolean'
        ? `ccjs_bool_value((${call.expression}) != 0)`
        : valueType === 'number'
          ? `ccjs_number_value(${call.expression})`
          : managedValue
  const valueCheck =
    managedValue == null ? '' : emitRuntimeValueCheck(managedValue, cRuntimeValueTag(valueType), context)

  if (managedValue != null) {
    registerOwnedValue(context, managedValue)
  }

  if (options.owned !== false) {
    registerOwnedPromise(context, out, valueType, 'unknown')
  }

  return {
    lines:
      managedValue == null
        ? [
            ...call.lines,
            emitStatusCheck(`ccjs_promise_resolved(${emitEventLoopReference(context)}, ${value}, &${out})`, context)
          ]
        : [
            ...call.lines,
            ...emitPrepareOwnedValueWrite(managedValue),
            `${managedValue} = ${call.expression};`,
            ...(valueCheck === '' ? [] : [valueCheck]),
            emitStatusCheck(`ccjs_promise_resolved(${emitEventLoopReference(context)}, ${value}, &${out})`, context),
            ...emitPrepareOwnedValueWrite(managedValue)
          ],
    expression: out,
    valueType,
    rejectionValueType: 'unknown'
  }
}

function emitPreparedAsyncTaskPromiseCallExpression(
  expression,
  valueType,
  context,
  options: { out?: string; owned?: boolean } = {}
) {
  if (expression.callee?.type !== 'Reference' || expression.callee.path.length !== 1) {
    return null
  }

  const wrapper = context.asyncTaskWrappers.get(expression.callee.path[0])

  if (wrapper == null) {
    return null
  }

  registerEventLoop(context)

  const out = options.out ?? nextCName(context, 'ccjs_promise')
  const prepared = emitPreparedCallArgs(expression, wrapper.params, context)
  const args = [emitEventLoopReference(context), ...prepared.args, `&${out}`]

  if (options.owned !== false) {
    registerOwnedPromise(context, out, valueType, 'unknown')
  }

  return {
    lines: [...prepared.lines, emitStatusCheck(`${wrapper.startName}(${args.join(', ')})`, context)],
    expression: out,
    valueType,
    rejectionValueType: 'unknown'
  }
}

function emitPreparedThrowingAsyncFunctionPromiseCallExpression(
  expression,
  valueType,
  context,
  options: { out?: string; owned?: boolean } = {}
) {
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

  const out = options.out ?? nextCName(context, 'ccjs_promise')
  const prepared = emitPreparedCallArgs(expression, params, context)
  const result = valueType === 'void' ? null : nextCName(context, 'ccjs_async_result')
  const managedResult = result != null && isManagedRuntimeReturnType(valueType)
  const status = nextCName(context, 'ccjs_async_status')
  const args = [...prepared.args]
  const rejectionValueType = resolveCFunctionRejectionValueType(expression.callee, context)
  const fulfilledValue =
    valueType === 'void'
      ? 'ccjs_undefined_value()'
      : valueType === 'boolean'
        ? `ccjs_bool_value((${result}) != 0)`
        : valueType === 'number'
          ? `ccjs_number_value(${result})`
          : result
  const valueCheck = managedResult ? emitRuntimeValueCheck(result, cRuntimeValueTag(valueType), context) : ''

  if (result != null) {
    args.push(`&${result}`)
  }

  args.push('&ccjs_error')

  if (options.owned !== false) {
    registerOwnedPromise(context, out, valueType, rejectionValueType)
  }

  if (managedResult) {
    registerOwnedValue(context, result)
  }

  return {
    lines: [
      ...prepared.lines,
      ...emitPrepareOwnedValueWrite('ccjs_error'),
      ...(result == null ? [] : managedResult ? emitPrepareOwnedValueWrite(result) : [`double ${result} = 0;`]),
      `ccjs_status ${status} = ${emitCallee(expression.callee, context)}(${args.join(', ')});`,
      `if (${status} == CCJS_ERR_THROW) {`,
      `  ${emitStatusCheck(`ccjs_promise_rejected(${emitEventLoopReference(context)}, ccjs_error, &${out})`, context)}`,
      '  ccjs_release(ccjs_error);',
      '  ccjs_error = ccjs_undefined_value();',
      '} else {',
      `  if (${status} != CCJS_OK) ${emitFailureStatement(context)}`,
      ...(valueCheck === '' ? [] : [`  ${valueCheck}`]),
      `  ${emitStatusCheck(`ccjs_promise_resolved(${emitEventLoopReference(context)}, ${fulfilledValue}, &${out})`, context)}`,
      ...(managedResult ? emitPrepareOwnedValueWrite(result).map((line) => `  ${line}`) : []),
      '}'
    ],
    expression: out,
    valueType,
    rejectionValueType
  }
}

function isSupportedAsyncFunctionPromiseValueType(valueType) {
  return (
    valueType === 'void' || valueType === 'number' || valueType === 'boolean' || isManagedRuntimeReturnType(valueType)
  )
}

function resolveCFunctionRejectionValueType(callee, context) {
  if (callee?.type !== 'Reference' || callee.path.length !== 1) {
    return 'unknown'
  }

  const types = context.functionThrowValueTypes.get(callee.path[0]) ?? []

  if (types.length === 1 && types[0] === 'error') {
    return 'error'
  }

  if (types.length === 1 && types[0] === 'string') {
    return 'string'
  }

  return 'unknown'
}

function emitPreparedAwaitPromiseExpression(expression, context) {
  const promiseExpression = emitPreparedPromiseExpression(expression, context, promiseLoweringDependencies)

  if (promiseExpression != null) {
    return {
      ...promiseExpression,
      valueType:
        knownValueType(promiseExpression.valueType) ??
        knownValueType(expression.promiseValueType) ??
        resolvePromiseExpressionValueType(expression, context) ??
        'unknown'
    }
  }

  return null
}

function emitCAwaitValueExpression(expression, context) {
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

  const valueType =
    knownValueType(expression.valueType) ??
    knownValueType(promise.valueType) ??
    resolvePromiseExpressionValueType(expression.argument, context) ??
    'unknown'
  const value = nextCName(context, 'ccjs_await_value')
  const valueTag = cRuntimeValueTag(valueType)
  const valueCheck = emitRuntimeValueCheck(value, valueTag, context)
  registerOwnedValue(context, value)

  return {
    lines: [
      ...promise.lines,
      ...emitPrepareOwnedValueWrite(value),
      `while (ccjs_promise_get_state(${promise.expression}) == CCJS_PROMISE_PENDING && ccjs_loop_has_work(${emitEventLoopReference(context)})) {`,
      ...emitEventLoopSleepUntilNextTimerLines(context, '  '),
      `  ${emitStatusCheck(`ccjs_loop_poll(${emitEventLoopReference(context)}, ${emitEventLoopNextTimeExpression(context)})`, context)}`,
      '}',
      ...emitAwaitRejectedPromiseLines(promise.expression, promise.rejectionValueType ?? 'unknown', context),
      `if (ccjs_promise_get_state(${promise.expression}) != CCJS_PROMISE_FULFILLED) ${emitFailureStatement(context)}`,
      emitStatusCheck(`ccjs_promise_get_result(${promise.expression}, &${value})`, context),
      ...(valueCheck === '' ? [] : [valueCheck])
    ],
    expression: value
  }
}

function emitAwaitRejectedPromiseLines(promiseExpression, rejectionValueType, context) {
  const target = currentErrorTarget(context)
  const rejectedTypeCheck =
    rejectionValueType === 'error'
      ? 'ccjs_error.tag != CCJS_TAG_OBJECT || ccjs_error.as.ref == 0'
      : 'ccjs_error.tag != CCJS_TAG_STRING || ccjs_error.as.ref == 0'

  if (target == null && !context.throwingFunction) {
    return [
      `if (ccjs_promise_get_state(${promiseExpression}) == CCJS_PROMISE_REJECTED) ${emitFailureStatement(context)}`
    ]
  }

  registerErrorChannel(context)

  return [
    `if (ccjs_promise_get_state(${promiseExpression}) == CCJS_PROMISE_REJECTED) {`,
    ...emitPrepareOwnedValueWrite('ccjs_error').map((line) => `  ${line}`),
    `  ${emitStatusCheck(`ccjs_promise_get_result(${promiseExpression}, &ccjs_error)`, context)}`,
    `  ${emitRuntimeTypeCheck(rejectedTypeCheck, context)}`,
    '  ccjs_error_active = 1;',
    ...(target == null ? ['  ccjs_status_result = CCJS_ERR_THROW;', '  goto ccjs_cleanup;'] : [`  goto ${target};`]),
    '}'
  ]
}

function emitCAsyncFunctionAwaitExpression(expression, context) {
  const callExpression = expression.argument

  if (callExpression?.type !== 'CallExpression' || !isAsyncFunctionCallee(callExpression.callee, context)) {
    return null
  }

  if (callExpression.callee.type === 'Reference' && context.asyncTaskWrappers.has(callExpression.callee.path[0])) {
    return null
  }

  const valueType =
    knownValueType(expression.valueType) ??
    knownValueType(resolveCAsyncFunctionAwaitValueType(callExpression.callee, context)) ??
    'unknown'
  const call = emitPreparedCallExpression(callExpression, context)

  if (valueType === 'void') {
    return {
      lines: [...call.lines, `${call.expression};`],
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
  registerOwnedValue(context, value)

  const resultExpression =
    valueType === 'boolean'
      ? `ccjs_bool_value((${call.expression}) != 0)`
      : valueType === 'number'
        ? `ccjs_number_value(${call.expression})`
        : call.expression
  const valueCheck = emitRuntimeValueCheck(value, valueTag, context)

  return {
    lines: [
      ...call.lines,
      ...emitPrepareOwnedValueWrite(value),
      `${value} = ${resultExpression};`,
      ...(valueCheck === '' ? [] : [valueCheck])
    ],
    expression: value
  }
}

function isThrowingFunctionCallee(callee, context) {
  return isThrowingFunctionCalleeFromExpressions(callee, context)
}

function isThrowingFunctionName(name, context) {
  return isThrowingFunctionNameFromExpressions(name, context)
}

function emitCallee(callee, context) {
  return emitCalleeFromExpressions(callee, context)
}

function emitFunctionValueExpression(expression, context) {
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
      return context.functionNames.get(name)
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

function resolveRuntimeCallbackCalleeType(callee, context) {
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

function emitRuntimeCallbackVariableDeclaration(statement, context) {
  const functionType = normalizeFunctionType(statement.functionType)

  context.variables.set(statement.name, 'function')
  context.functionTypes.set(statement.name, functionType)
  context.runtimeCallbacks.add(statement.name)
  registerOwnedValue(context, statement.name)

  return emitRuntimeCallbackValueInto(statement.init, functionType, statement.name, context)
}

function emitRuntimeCallbackValue(expression, functionType, context) {
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

function emitRuntimeCallbackValueInto(expression, functionType, out, context) {
  if (
    expression?.type === 'Reference' &&
    expression.path.length === 1 &&
    context.runtimeCallbacks.has(expression.path[0])
  ) {
    return [...emitPrepareOwnedValueWrite(out), `${out} = ${expression.path[0]};`, `ccjs_retain(${out});`]
  }

  if (expression?.type === 'ArrowFunctionExpression') {
    const wrapper = context.callbackArrowWrappers.get(expression)

    if (wrapper == null) {
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

  const wrapper = runtimeCallbackWrapperFor(expression.path[0], functionType, context)

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

function emitRuntimeArrowCallbackValueInto(wrapper, out, context) {
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

  if (!isRuntimeArrowCallbackWrapperWithContext(wrapper)) {
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

function emitRuntimeArrowCaptureStoreLines(capture, contextName, context) {
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

function emitRuntimeCallbackCall(expression, functionType, context) {
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

function emitOptionalRuntimeCallbackCallExpression(expression, context) {
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
  const lines: string[] = [
    `if (${callee}.tag != CCJS_TAG_NULL) {`,
    `  ${emitRuntimeTypeCheck(`${callee}.tag != CCJS_TAG_FUNCTION || ${callee}.as.ref == 0`, context)}`
  ]
  const args: string[] = []

  for (const arg of expression.args) {
    const value = emitCValueExpression(arg, context)

    lines.push(...value.lines.map((line) => `  ${line}`))
    args.push(value.expression)
  }

  const out = nextCName(context, 'ccjs_callback_out')
  registerOwnedValue(context, out)
  lines.push(...emitPrepareOwnedValueWrite(out).map((line) => `  ${line}`))

  if (args.length === 0) {
    lines.push(`  ${emitStatusCheck(`ccjs_callback_call(${callee}, 0, 0, &${out})`, context)}`)
  } else {
    const argArray = nextCName(context, 'ccjs_callback_args')

    lines.push(`  ccjs_value ${argArray}[] = { ${args.join(', ')} };`)
    lines.push(`  ${emitStatusCheck(`ccjs_callback_call(${callee}, ${argArray}, ${args.length}, &${out})`, context)}`)
  }

  lines.push('}')

  return lines
}

function emitOptionalRuntimeCallbackCallValueExpression(expression, context) {
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
  const lines: string[] = [
    ...emitPrepareOwnedValueWrite(out),
    `${out} = ccjs_null_value();`,
    `if (${callee}.tag != CCJS_TAG_NULL) {`,
    `  ${emitRuntimeTypeCheck(`${callee}.tag != CCJS_TAG_FUNCTION || ${callee}.as.ref == 0`, context)}`
  ]
  const args: string[] = []

  registerOwnedValue(context, out)

  for (const arg of expression.args) {
    const value = emitCValueExpression(arg, context)

    lines.push(...value.lines.map((line) => `  ${line}`))
    args.push(value.expression)
  }

  lines.push(...emitPrepareOwnedValueWrite(out).map((line) => `  ${line}`))

  if (args.length === 0) {
    lines.push(`  ${emitStatusCheck(`ccjs_callback_call(${callee}, 0, 0, &${out})`, context)}`)
  } else {
    const argArray = nextCName(context, 'ccjs_callback_args')

    lines.push(`  ccjs_value ${argArray}[] = { ${args.join(', ')} };`)
    lines.push(`  ${emitStatusCheck(`ccjs_callback_call(${callee}, ${argArray}, ${args.length}, &${out})`, context)}`)
  }

  lines.push(`  ${emitRuntimeValueCheck(out, expectedTag, context)}`)
  lines.push('}')

  return {
    lines,
    expression: out
  }
}

function resolveFunctionParams(callee, context) {
  if (callee.type !== 'Reference' || callee.path.length !== 1) {
    return null
  }

  return context.functionParams.get(callee.path[0]) ?? null
}

function inferExpressionType(expression, context) {
  return inferExpressionTypeWithDependencies(expression, context, expressionTypeDependencies)
}

function isErrorConstructorExpression(expression) {
  return (
    expression?.type === 'NewExpression' &&
    expression.callee.type === 'Reference' &&
    expression.callee.path.length === 1 &&
    expression.callee.path[0] === 'Error'
  )
}

function isFetchAbortControllerConstructorExpression(expression) {
  return (
    expression?.type === 'NewExpression' &&
    expression.callee.type === 'Reference' &&
    expression.callee.path.length === 1 &&
    expression.callee.path[0] === 'AbortController'
  )
}

function isErrorValueExpression(expression, context) {
  return isKnownErrorValueExpression(expression, context, context.errorObjectNames)
}

function isKnownErrorValueExpression(expression, context, errorObjectNames) {
  if (isErrorConstructorExpression(expression)) {
    return true
  }

  if (expression?.type === 'Reference' && expression.path.length === 1) {
    return errorObjectNames.has(expression.path[0])
  }

  return false
}

function registerErrorObjectShape(context, name) {
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
