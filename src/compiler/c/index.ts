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
  withVariableScope
} from './context.ts'
import {
  isSupportedCCryptoGlobalUsage,
  isSupportedCFetchGlobalUsage,
  isSupportedCMathGlobalUsage,
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
  emitCModuleFilesFromGraph as emitCModuleFilesFromGraphWithEmitters,
  relativeCIncludePath,
  uniqueCModuleImports
} from './modules.ts'
import { emitCPrelude } from './prelude.ts'
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
import { irProgramsUseConsoleRuntime, isConsoleLog } from './stdlib/console.ts'
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
    emitHeader: emitCModuleHeader,
    emitSource: emitCModuleSource
  })
}

function emitCModuleSource(
  plan: CModulePlan,
  plans: CModulePlan[],
  options: CModuleEmitOptions,
  diagnostics: Diagnostic[]
): string {
  const irPrograms = [plan.ir]
  const functionEntries = collectIrFunctionNodeEntries(irPrograms)
  const functions = functionEntries.map((entry) => entry.node)
  const context = createCModuleBaseContext(plan, plans, diagnostics)
  const runtimeRequirements = new Set(collectIrRuntimeRequirements(irPrograms))
  const globalUsages = collectIrGlobalUsages(irPrograms)
  const syntaxFeatures = collectIrSyntaxFeatureUsages(irPrograms)
  const signatureRuntimeTypes = collectCModuleContextRuntimeTypes(context)
  const needsCallbackRuntime =
    [...context.callbackWrappers.values()].some(isRuntimeCallbackWrapper) ||
    runtimeRequirements.has('callback-values') ||
    signatureRuntimeTypes.has('function')
  const needsChildProcessRuntime = runtimeRequirements.has('child-process')
  const needsFsRuntime = runtimeRequirements.has('fs')
  const needsOsRuntime = runtimeRequirements.has('os')
  const needsPathRuntime = runtimeRequirements.has('path')
  const needsUrlRuntime = runtimeRequirements.has('url')
  const needsProcessRuntime = runtimeRequirements.has('process')
  const needsJsonRuntime = runtimeRequirements.has('json')
  const needsTimerRuntime = runtimeRequirements.has('timers')
  const needsDebugMemoryRuntime = runtimeRequirements.has('debug-memory')
  const needsFetchRuntime = globalUsages.some(isSupportedCFetchGlobalUsage)
  const needsAsyncRuntime =
    runtimeRequirements.has('async-runtime') ||
    needsFetchRuntime ||
    needsFsRuntime ||
    needsTimerRuntime ||
    signatureRuntimeTypes.has('promise')
  const needsCollectionRuntime =
    runtimeRequirements.has('collections') ||
    signatureRuntimeTypes.has('array') ||
    signatureRuntimeTypes.has('map') ||
    signatureRuntimeTypes.has('set')
  const needsBinaryRuntime = runtimeRequirements.has('binary') || signatureRuntimeTypes.has('bytes')
  const needsClassRuntime = context.classInfos.size > 0
  const needsDgramRuntime = irProgramsUseRuntimeImport(irPrograms, new Set(['dgram', 'node:dgram']))
  const needsObjectRuntime =
    runtimeRequirements.has('objects') ||
    needsFsRuntime ||
    needsFetchRuntime ||
    needsClassRuntime ||
    needsPathRuntime ||
    needsUrlRuntime ||
    signatureRuntimeTypes.has('object')
  const needsHttpRuntime = irProgramsUseRuntimeImport(irPrograms, new Set(['http', 'node:http']))
  const needsNetRuntime = irProgramsUseRuntimeImport(irPrograms, new Set(['net', 'node:net']))
  const needsRuntime =
    context.throwingFunctions.size > 0 ||
    needsAsyncRuntime ||
    needsDgramRuntime ||
    needsFetchRuntime ||
    needsHttpRuntime ||
    needsNetRuntime ||
    needsCallbackRuntime ||
    needsChildProcessRuntime ||
    needsCollectionRuntime ||
    needsOsRuntime ||
    needsPathRuntime ||
    needsUrlRuntime ||
    needsProcessRuntime ||
    needsObjectRuntime ||
    needsClassRuntime ||
    needsJsonRuntime ||
    signatureRuntimeTypes.size > 0 ||
    runtimeRequirements.has('managed-values')
  const needsTimeRuntime =
    runtimeRequirements.has('clocks') ||
    needsAsyncRuntime ||
    needsDgramRuntime ||
    needsFetchRuntime ||
    needsHttpRuntime ||
    needsNetRuntime
  const needsMathRuntime = globalUsages.some(isSupportedCMathGlobalUsage)
  const needsCryptoRuntime =
    runtimeRequirements.has('crypto') || globalUsages.some((usage) => isSupportedCCryptoGlobalUsage(usage, context))
  const needsConsoleRuntime = irProgramsUseConsoleRuntime(irPrograms)
  const needsStringHeader =
    runtimeRequirements.has('string-bytes') ||
    needsChildProcessRuntime ||
    needsFsRuntime ||
    needsOsRuntime ||
    needsPathRuntime ||
    needsUrlRuntime ||
    needsProcessRuntime ||
    needsDgramRuntime ||
    needsFetchRuntime ||
    needsNetRuntime ||
    signatureRuntimeTypes.has('string')
  const classMethods = collectClassMethods(context)

  context.processRuntime = needsProcessRuntime
  context.unhandledRejectionFlag = needsAsyncRuntime ? `${plan.symbolPrefix}_unhandled_rejection` : null
  reportUnsupportedCSyntaxFeatures(syntaxFeatures, diagnostics)
  reportUnsupportedCGlobalUsages(globalUsages, diagnostics, context)

  const lines = [
    `#include "${relativeCIncludePath(plan.sourcePath, plan.headerPath, options.host)}"`,
    ...uniqueCModuleImports(plan.imports)
      .filter((item) => item.module.headerPath !== plan.headerPath)
      .map((item) => `#include "${relativeCIncludePath(plan.sourcePath, item.module.headerPath, options.host)}"`),
    ''
  ]

  lines.push(
    ...emitCPrelude(
      needsRuntime,
      needsTimeRuntime,
      needsMathRuntime,
      needsCryptoRuntime,
      needsDebugMemoryRuntime,
      needsAsyncRuntime,
      needsCallbackRuntime,
      needsStringHeader,
      needsCollectionRuntime,
      needsBinaryRuntime,
      needsObjectRuntime,
      needsChildProcessRuntime,
      needsFsRuntime,
      needsOsRuntime,
      needsPathRuntime,
      needsUrlRuntime,
      needsProcessRuntime,
      needsJsonRuntime,
      needsTimerRuntime,
      needsConsoleRuntime,
      needsDgramRuntime,
      needsFetchRuntime,
      needsHttpRuntime,
      needsNetRuntime,
      options
    )
  )

  emitCModuleDeclarations(lines, functions, classMethods, context)

  for (const wrapper of context.asyncTaskWrappers.values()) {
    lines.push(...emitAsyncTaskWrapperDeclaration(wrapper, context, asyncTaskLoweringDependencies))
    lines.push('')
  }

  for (const wrapper of context.callbackWrappers.values()) {
    lines.push(
      ...(wrapper.kind === 'plain-arrow'
        ? emitPlainArrowCallbackWrapperDeclaration(wrapper, context, callbackLoweringDependencies)
        : emitRuntimeCallbackWrapperDeclaration(wrapper, context, callbackLoweringDependencies))
    )
    lines.push('')
  }

  for (const wrapper of context.promiseChainWrappers.values()) {
    lines.push(...emitPromiseChainCallbackWrapperDeclaration(wrapper, context, promiseChainLoweringDependencies))
    lines.push('')
  }

  for (const wrapper of context.dgramMessageHandlers.values()) {
    lines.push(...emitDgramMessageHandlerDeclaration(wrapper, context, dgramLoweringDependencies))
    lines.push('')
  }

  for (const wrapper of context.httpHandlers.values()) {
    lines.push(...emitHttpHandlerDeclaration(wrapper, context, httpLoweringDependencies))
    lines.push('')
  }

  for (const wrapper of context.netHandlers.values()) {
    lines.push(...emitNetHandlerDeclaration(wrapper, context, netLoweringDependencies))
    lines.push('')
  }

  for (const item of functions) {
    lines.push(...emitFunctionDeclaration(item, context))
    lines.push('')
  }

  for (const { info, method } of classMethods) {
    lines.push(...emitClassMethodDeclaration(info, method, context))
    lines.push('')
  }

  if (!plan.isEntry && plan.initName != null) {
    lines.push(...emitCModuleInitFunction(plan, context))
  } else {
    lines.push(...emitCModuleMainFunction(plan, context))
  }

  return `${lines.join('\n')}\n`
}

function emitCModuleHeader(plan: CModulePlan, plans: CModulePlan[], diagnostics: Diagnostic[]): string {
  const context = createCModuleBaseContext(plan, plans, diagnostics)
  const exportedFunctions = collectCModuleExportedFunctions(plan)
  const lines = [
    `#ifndef ${plan.headerGuard}`,
    `#define ${plan.headerGuard}`,
    '',
    '#include "ccjs/value.h"',
    '#include "ccjs/loop.h"',
    '#include "ccjs/promise.h"',
    ''
  ]

  if (plan.initName != null) {
    lines.push(`void ${plan.initName}(void);`)
  }

  for (const item of exportedFunctions) {
    lines.push(`${emitFunctionHead(item, context)};`)
  }

  lines.push('')
  lines.push(`#endif`)

  return `${lines.join('\n')}\n`
}

function emitCModuleDeclarations(lines: string[], functions, classMethods, context): void {
  const arrowCallbackWrappers = [...context.callbackWrappers.values()].filter(isRuntimeArrowCallbackWrapperWithContext)
  const promiseChainCallbackWrappers = [...context.promiseChainWrappers.values()].filter(
    isPromiseChainCallbackWrapperWithContext
  )

  for (const wrapper of context.asyncTaskWrappers.values()) {
    lines.push(...emitAsyncTaskFrameType(wrapper))
    lines.push('')
  }

  for (const wrapper of arrowCallbackWrappers) {
    lines.push(...emitRuntimeArrowCallbackContextType(wrapper))
    lines.push('')
  }

  for (const wrapper of promiseChainCallbackWrappers) {
    lines.push(...emitRuntimeArrowCallbackContextType(wrapper))
    lines.push('')
  }

  if (context.unhandledRejectionFlag != null) {
    lines.push(`static int ${context.unhandledRejectionFlag} = 0;`)
    lines.push('')
  }

  for (const item of functions) {
    lines.push(`${emitFunctionHead(item, context)};`)
  }

  for (const { info, method } of classMethods) {
    lines.push(`${emitClassMethodHead(info, method, context)};`)
  }

  for (const wrapper of context.asyncTaskWrappers.values()) {
    lines.push(...emitAsyncTaskWrapperPrototypes(wrapper))
  }

  for (const wrapper of context.callbackWrappers.values()) {
    if (wrapper.kind === 'plain-arrow') {
      lines.push(`${emitPlainArrowCallbackWrapperHead(wrapper)};`)
      continue
    }

    if (isRuntimeArrowCallbackWrapperWithContext(wrapper)) {
      lines.push(`static void ${wrapper.finalizerName}(void* context);`)
    }

    lines.push(`${emitRuntimeCallbackWrapperHead(wrapper)};`)
  }

  for (const wrapper of context.promiseChainWrappers.values()) {
    if (isPromiseChainCallbackWrapperWithContext(wrapper)) {
      lines.push(`static void ${wrapper.finalizerName}(void* context);`)
    }

    lines.push(`${emitPromiseChainCallbackWrapperHead(wrapper)};`)
  }

  for (const wrapper of context.dgramMessageHandlers.values()) {
    lines.push(`${emitDgramMessageHandlerHead(wrapper)};`)
  }

  for (const wrapper of context.httpHandlers.values()) {
    lines.push(`${emitHttpHandlerHead(wrapper)};`)
  }

  for (const wrapper of context.netHandlers.values()) {
    lines.push(`${emitNetHandlerHead(wrapper)};`)
  }

  if (
    functions.length > 0 ||
    classMethods.length > 0 ||
    context.asyncTaskWrappers.size > 0 ||
    context.callbackWrappers.size > 0 ||
    context.promiseChainWrappers.size > 0 ||
    context.dgramMessageHandlers.size > 0 ||
    context.httpHandlers.size > 0 ||
    context.netHandlers.size > 0
  ) {
    lines.push('')
  }
}

function createCModuleBaseContext(plan: CModulePlan, plans: CModulePlan[], diagnostics: Diagnostic[]) {
  const irPrograms = [plan.ir]
  const importedDeclarations = collectCModuleImportedFunctionDeclarations(plan)
  const functionEntries = collectIrFunctionNodeEntries(irPrograms)
  const functions = functionEntries.map((entry) => entry.node)
  const functionDeclarations = [...collectIrFunctionDeclarations(irPrograms), ...importedDeclarations]
  const functionEffects = [
    ...collectIrStoredFunctionEffects(irPrograms),
    ...collectImportedCModuleFunctionEffects(plan)
  ]
  const globalRoots = collectIrGlobalRoots(irPrograms)
  const jsGlobalRoots = new Set(globalRoots)
  const context = createBaseContext(diagnostics, functionDeclarations, functionEffects, jsGlobalRoots)

  context.dgramImportNames = collectRuntimeImportNames(
    irPrograms,
    new Set(['dgram', 'node:dgram']),
    new Set(['default', 'dgram'])
  )
  context.dgramCreateSocketNames = collectRuntimeNamedImportNames(
    irPrograms,
    new Set(['dgram', 'node:dgram']),
    'createSocket'
  )
  context.cryptoImportNames = collectRuntimeImportNames(
    irPrograms,
    new Set(['node:crypto']),
    new Set(['default', 'crypto'])
  )
  context.httpImportNames = collectHttpRuntimeImportNames(irPrograms)
  context.httpCreateServerNames = collectHttpRuntimeCreateServerNames(irPrograms)
  context.netImportNames = collectRuntimeImportNames(
    irPrograms,
    new Set(['net', 'node:net']),
    new Set(['default', 'net'])
  )
  context.netCreateServerNames = collectRuntimeNamedImportNames(
    irPrograms,
    new Set(['net', 'node:net']),
    'createServer'
  )
  context.netConnectNames = collectRuntimeNamedImportNames(irPrograms, new Set(['net', 'node:net']), 'connect')
  for (const name of collectRuntimeNamedImportNames(irPrograms, new Set(['net', 'node:net']), 'createConnection')) {
    context.netConnectNames.add(name)
  }
  context.functionNames = createCModuleFunctionNames(plan)
  context.classInfos = createClassInfos(collectIrTopLevelNodes(plan.ir, 'class'), diagnostics)
  context.externalEventLoopFunctions = collectExternalEventLoopFunctions(functions)
  context.callbackWrappers = collectCallbackWrappers(irPrograms, context, callbackLoweringDependencies)
  context.promiseChainWrappers = collectPromiseChainWrappers(irPrograms, context, promiseChainLoweringDependencies)
  context.asyncTaskWrappers = collectAsyncTaskWrappers(functionEntries, context, asyncTaskLoweringDependencies)
  context.dgramMessageHandlers = collectDgramMessageHandlers(irPrograms, context)
  context.httpHandlers = collectHttpHandlers(irPrograms, context)
  context.netHandlers = collectNetHandlers(irPrograms, context)

  return context
}

function collectCModuleContextRuntimeTypes(context): Set<string> {
  const types = new Set<string>()

  for (const type of context.functionReturnTypes.values()) {
    if (isManagedRuntimeReturnType(type) || type === 'promise') {
      types.add(type)
    }
  }

  for (const params of context.functionParams.values()) {
    for (const param of params) {
      if (isManagedRuntimeReturnType(param.valueType) || param.valueType === 'promise') {
        types.add(param.valueType)
      }
    }
  }

  return types
}

function emitCModuleInitFunction(plan: CModulePlan, baseContext): string[] {
  const context = createFunctionContext(baseContext, 'void')
  const body = collectIrTopLevelNodes(plan.ir, 'statement')
  const initCalls = emitCModuleImportInitCalls(plan)
  const bodyLines = emitStatementList(body, context)
  const lines = [
    `void ${plan.initName}(void) {`,
    '  static bool ccjs_initialized = false;',
    '  if (ccjs_initialized) return;',
    '  ccjs_initialized = true;',
    ...initCalls.map((line) => `  ${line}`)
  ]

  lines.push(...emitLoopFlowDeclarations(context).map((line) => `  ${line}`))
  lines.push(...emitReturnValueDeclarations(context).map((line) => `  ${line}`))
  lines.push(...emitReturnFlowDeclarations(context).map((line) => `  ${line}`))
  lines.push(...emitEventLoopDeclarations(context).map((line) => `  ${line}`))
  lines.push(...emitOwnedValueDeclarations(context).map((line) => `  ${line}`))
  lines.push(...emitOwnedPromiseDeclarations(context).map((line) => `  ${line}`))
  lines.push(...emitErrorChannelDeclarations(context).map((line) => `  ${line}`))
  lines.push(...emitBoxedValueDeclarations(context).map((line) => `  ${line}`))
  lines.push(...emitEventLoopInit(context).map((line) => `  ${line}`))
  lines.push(...bodyLines.map((line) => `  ${line}`))
  lines.push(...emitEventLoopDrain(context).map((line) => `  ${line}`))

  if (shouldEmitCleanupLabel(context)) {
    lines.push('ccjs_cleanup:')
    lines.push(...emitOwnedValueCleanup(context).map((line) => `  ${line}`))
    lines.push(...emitOwnedPromiseCleanup(context).map((line) => `  ${line}`))
    lines.push(...emitEventLoopCleanup(context).map((line) => `  ${line}`))
    lines.push(...emitBoxedValueCleanup(context).map((line) => `  ${line}`))
  }

  lines.push('  return;')
  lines.push('}')

  return lines
}

function emitCModuleMainFunction(plan: CModulePlan, baseContext): string[] {
  const context = createFunctionContext(baseContext, 'number')
  const body = collectIrTopLevelNodes(plan.ir, 'statement')
  const initCalls = emitCModuleImportInitCalls(plan)
  const bodyLines = emitStatementList(body, context)
  const lines = [context.processRuntime ? 'int main(int argc, char** argv) {' : 'int main(void) {']

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
  lines.push(...initCalls.map((line) => `  ${line}`))
  lines.push(...bodyLines.map((line) => `  ${line}`))
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

function emitCModuleImportInitCalls(plan: CModulePlan): string[] {
  return plan.imports.flatMap((item) => (item.module.initName == null ? [] : [`${item.module.initName}();`]))
}

function collectCModuleExportedFunctions(plan: CModulePlan): AnyNode[] {
  const exportedNames = new Set(
    plan.ir.functionDeclarations.filter((declaration) => declaration.exported).map((declaration) => declaration.name)
  )

  return collectIrTopLevelNodes(plan.ir, 'function').filter((item) => exportedNames.has(item.name))
}

function collectCModuleImportedFunctionDeclarations(plan: CModulePlan): IrFunctionDeclaration[] {
  return plan.imports.flatMap((item) =>
    item.declaration.specifiers.flatMap((specifier) => {
      const declaration = item.module.ir.functionDeclarations.find(
        (candidate) => candidate.name === specifier.imported && candidate.exported
      )

      return declaration == null ? [] : [{ ...declaration, name: specifier.local }]
    })
  )
}

function collectImportedCModuleFunctionEffects(plan: CModulePlan): IrFunctionEffect[] {
  const effects: IrFunctionEffect[] = []

  for (const item of plan.imports) {
    for (const specifier of item.declaration.specifiers) {
      effects.push(
        ...item.module.ir.functionEffects
          .filter((effect) => effect.name === specifier.imported)
          .map((effect) => ({ ...effect, name: specifier.local }))
      )
    }
  }

  return effects
}

function createCModuleFunctionNames(plan: CModulePlan): Map<string, string> {
  const names = new Map<string, string>()
  const localNames = new Set(plan.ir.functionDeclarations.map((declaration) => declaration.name))

  for (const declaration of plan.ir.functionDeclarations) {
    names.set(declaration.name, emitCModuleFunctionName(plan, declaration.name))
  }

  for (const item of plan.imports) {
    for (const specifier of item.declaration.specifiers) {
      names.set(specifier.imported, emitCModuleFunctionName(item.module, specifier.imported))

      if (!localNames.has(specifier.local)) {
        names.set(specifier.local, emitCModuleFunctionName(item.module, specifier.imported))
      }
    }
  }

  return names
}

function emitCModuleFunctionName(plan: CModulePlan, name: string): string {
  return `${plan.symbolPrefix}_${emitCFunctionName(name)}`
}

function emitCUnit(
  irPrograms: IrProgram[],
  entryIrProgram: IrProgram | null = irPrograms.at(-1) ?? null,
  options: CEmitOptions = {},
  entryIrPrograms: IrProgram[] = entryIrProgram == null ? [] : [entryIrProgram]
) {
  const diagnostics: Diagnostic[] = []
  const functionEntries = collectIrFunctionNodeEntries(irPrograms)
  const functions = functionEntries.map((entry) => entry.node)
  const functionDeclarations = collectIrFunctionDeclarations(irPrograms)
  const functionEffects = collectIrStoredFunctionEffects(irPrograms)
  const globalUsages = collectIrGlobalUsages(irPrograms)
  const globalRoots = collectIrGlobalRoots(irPrograms)
  const runtimeRequirements = new Set(collectIrRuntimeRequirements(irPrograms))
  const syntaxFeatures = collectIrSyntaxFeatureUsages(irPrograms)
  const classes = collectIrTopLevelNodesFromPrograms(irPrograms, 'class')
  const jsGlobalRoots = new Set(globalRoots)
  const baseContext = createBaseContext(diagnostics, functionDeclarations, functionEffects, jsGlobalRoots)
  baseContext.dgramImportNames = collectRuntimeImportNames(
    irPrograms,
    new Set(['dgram', 'node:dgram']),
    new Set(['default', 'dgram'])
  )
  baseContext.dgramCreateSocketNames = collectRuntimeNamedImportNames(
    irPrograms,
    new Set(['dgram', 'node:dgram']),
    'createSocket'
  )
  baseContext.cryptoImportNames = collectRuntimeImportNames(
    irPrograms,
    new Set(['node:crypto']),
    new Set(['default', 'crypto'])
  )
  baseContext.httpImportNames = collectHttpRuntimeImportNames(irPrograms)
  baseContext.httpCreateServerNames = collectHttpRuntimeCreateServerNames(irPrograms)
  baseContext.netImportNames = collectRuntimeImportNames(
    irPrograms,
    new Set(['net', 'node:net']),
    new Set(['default', 'net'])
  )
  baseContext.netCreateServerNames = collectRuntimeNamedImportNames(
    irPrograms,
    new Set(['net', 'node:net']),
    'createServer'
  )
  baseContext.netConnectNames = collectRuntimeNamedImportNames(irPrograms, new Set(['net', 'node:net']), 'connect')
  for (const name of collectRuntimeNamedImportNames(irPrograms, new Set(['net', 'node:net']), 'createConnection')) {
    baseContext.netConnectNames.add(name)
  }
  baseContext.classInfos = createClassInfos(classes, diagnostics)
  baseContext.externalEventLoopFunctions = collectExternalEventLoopFunctions(functions)
  baseContext.callbackWrappers = collectCallbackWrappers(irPrograms, baseContext, callbackLoweringDependencies)
  baseContext.promiseChainWrappers = collectPromiseChainWrappers(irPrograms, baseContext, promiseChainLoweringDependencies)
  baseContext.asyncTaskWrappers = collectAsyncTaskWrappers(functionEntries, baseContext, asyncTaskLoweringDependencies)
  baseContext.dgramMessageHandlers = collectDgramMessageHandlers(irPrograms, baseContext)
  baseContext.httpHandlers = collectHttpHandlers(irPrograms, baseContext)
  baseContext.netHandlers = collectNetHandlers(irPrograms, baseContext)
  const classMethods = collectClassMethods(baseContext)
  const needsCallbackRuntime =
    [...baseContext.callbackWrappers.values()].some(isRuntimeCallbackWrapper) ||
    runtimeRequirements.has('callback-values')
  const needsChildProcessRuntime = runtimeRequirements.has('child-process')
  const needsFsRuntime = runtimeRequirements.has('fs')
  const needsOsRuntime = runtimeRequirements.has('os')
  const needsPathRuntime = runtimeRequirements.has('path')
  const needsUrlRuntime = runtimeRequirements.has('url')
  const needsProcessRuntime = runtimeRequirements.has('process')
  const needsJsonRuntime = runtimeRequirements.has('json')
  const needsTimerRuntime = runtimeRequirements.has('timers')
  const needsDebugMemoryRuntime = runtimeRequirements.has('debug-memory')
  const needsFetchRuntime = globalUsages.some(isSupportedCFetchGlobalUsage)
  const needsAsyncRuntime =
    runtimeRequirements.has('async-runtime') || needsFetchRuntime || needsFsRuntime || needsTimerRuntime
  const needsCollectionRuntime = runtimeRequirements.has('collections')
  const needsBinaryRuntime = runtimeRequirements.has('binary')
  const needsClassRuntime = baseContext.classInfos.size > 0
  const needsDgramRuntime = irProgramsUseRuntimeImport(irPrograms, new Set(['dgram', 'node:dgram']))
  const needsObjectRuntime =
    runtimeRequirements.has('objects') ||
    needsFsRuntime ||
    needsFetchRuntime ||
    needsClassRuntime ||
    needsPathRuntime ||
    needsUrlRuntime
  const needsHttpRuntime = irProgramsUseRuntimeImport(irPrograms, new Set(['http', 'node:http']))
  const needsNetRuntime = irProgramsUseRuntimeImport(irPrograms, new Set(['net', 'node:net']))
  const needsRuntime =
    baseContext.throwingFunctions.size > 0 ||
    needsAsyncRuntime ||
    needsDgramRuntime ||
    needsFetchRuntime ||
    needsHttpRuntime ||
    needsNetRuntime ||
    needsCallbackRuntime ||
    needsChildProcessRuntime ||
    needsCollectionRuntime ||
    needsOsRuntime ||
    needsPathRuntime ||
    needsUrlRuntime ||
    needsProcessRuntime ||
    needsObjectRuntime ||
    needsClassRuntime ||
    needsJsonRuntime ||
    runtimeRequirements.has('managed-values')
  const needsTimeRuntime =
    runtimeRequirements.has('clocks') ||
    needsAsyncRuntime ||
    needsDgramRuntime ||
    needsFetchRuntime ||
    needsHttpRuntime ||
    needsNetRuntime
  const needsMathRuntime = globalUsages.some(isSupportedCMathGlobalUsage)
  const needsCryptoRuntime =
    runtimeRequirements.has('crypto') || globalUsages.some((usage) => isSupportedCCryptoGlobalUsage(usage, baseContext))
  const needsConsoleRuntime = irProgramsUseConsoleRuntime(irPrograms)
  const needsStringHeader =
    runtimeRequirements.has('string-bytes') ||
    needsChildProcessRuntime ||
    needsFsRuntime ||
    needsOsRuntime ||
    needsPathRuntime ||
    needsUrlRuntime ||
    needsProcessRuntime ||
    needsDgramRuntime ||
    needsFetchRuntime ||
    needsNetRuntime
  baseContext.processRuntime = needsProcessRuntime
  baseContext.unhandledRejectionFlag = needsAsyncRuntime ? 'ccjs_unhandled_rejection' : null
  reportUnsupportedCSyntaxFeatures(syntaxFeatures, diagnostics)
  reportUnsupportedCGlobalUsages(globalUsages, diagnostics, baseContext)
  const lines = emitCPrelude(
    needsRuntime,
    needsTimeRuntime,
    needsMathRuntime,
    needsCryptoRuntime,
    needsDebugMemoryRuntime,
    needsAsyncRuntime,
    needsCallbackRuntime,
    needsStringHeader,
    needsCollectionRuntime,
    needsBinaryRuntime,
    needsObjectRuntime,
    needsChildProcessRuntime,
    needsFsRuntime,
    needsOsRuntime,
    needsPathRuntime,
    needsUrlRuntime,
    needsProcessRuntime,
    needsJsonRuntime,
    needsTimerRuntime,
    needsConsoleRuntime,
    needsDgramRuntime,
    needsFetchRuntime,
    needsHttpRuntime,
    needsNetRuntime,
    options
  )
  const arrowCallbackWrappers = [...baseContext.callbackWrappers.values()].filter(
    isRuntimeArrowCallbackWrapperWithContext
  )
  const promiseChainCallbackWrappers = [...baseContext.promiseChainWrappers.values()].filter(
    isPromiseChainCallbackWrapperWithContext
  )

  for (const wrapper of baseContext.asyncTaskWrappers.values()) {
    lines.push(...emitAsyncTaskFrameType(wrapper))
    lines.push('')
  }

  for (const wrapper of arrowCallbackWrappers) {
    lines.push(...emitRuntimeArrowCallbackContextType(wrapper))
    lines.push('')
  }

  for (const wrapper of promiseChainCallbackWrappers) {
    lines.push(...emitRuntimeArrowCallbackContextType(wrapper))
    lines.push('')
  }

  if (baseContext.unhandledRejectionFlag != null) {
    lines.push(`static int ${baseContext.unhandledRejectionFlag} = 0;`)
    lines.push('')
  }

  for (const item of functions) {
    lines.push(`${emitFunctionHead(item, baseContext)};`)
  }

  for (const { info, method } of classMethods) {
    lines.push(`${emitClassMethodHead(info, method, baseContext)};`)
  }

  for (const wrapper of baseContext.asyncTaskWrappers.values()) {
    lines.push(...emitAsyncTaskWrapperPrototypes(wrapper))
  }

  for (const wrapper of baseContext.callbackWrappers.values()) {
    if (wrapper.kind === 'plain-arrow') {
      lines.push(`${emitPlainArrowCallbackWrapperHead(wrapper)};`)
      continue
    }

    if (isRuntimeArrowCallbackWrapperWithContext(wrapper)) {
      lines.push(`static void ${wrapper.finalizerName}(void* context);`)
    }

    lines.push(`${emitRuntimeCallbackWrapperHead(wrapper)};`)
  }

  for (const wrapper of baseContext.promiseChainWrappers.values()) {
    if (isPromiseChainCallbackWrapperWithContext(wrapper)) {
      lines.push(`static void ${wrapper.finalizerName}(void* context);`)
    }

    lines.push(`${emitPromiseChainCallbackWrapperHead(wrapper)};`)
  }

  for (const wrapper of baseContext.dgramMessageHandlers.values()) {
    lines.push(`${emitDgramMessageHandlerHead(wrapper)};`)
  }

  for (const wrapper of baseContext.httpHandlers.values()) {
    lines.push(`${emitHttpHandlerHead(wrapper)};`)
  }

  for (const wrapper of baseContext.netHandlers.values()) {
    lines.push(`${emitNetHandlerHead(wrapper)};`)
  }

  if (
    functions.length > 0 ||
    classMethods.length > 0 ||
    baseContext.asyncTaskWrappers.size > 0 ||
    baseContext.callbackWrappers.size > 0 ||
    baseContext.promiseChainWrappers.size > 0 ||
    baseContext.dgramMessageHandlers.size > 0 ||
    baseContext.httpHandlers.size > 0 ||
    baseContext.netHandlers.size > 0
  ) {
    lines.push('')
  }

  for (const wrapper of baseContext.asyncTaskWrappers.values()) {
    lines.push(...emitAsyncTaskWrapperDeclaration(wrapper, baseContext, asyncTaskLoweringDependencies))
    lines.push('')
  }

  for (const wrapper of baseContext.callbackWrappers.values()) {
    lines.push(
      ...(wrapper.kind === 'plain-arrow'
        ? emitPlainArrowCallbackWrapperDeclaration(wrapper, baseContext, callbackLoweringDependencies)
        : emitRuntimeCallbackWrapperDeclaration(wrapper, baseContext, callbackLoweringDependencies))
    )
    lines.push('')
  }

  for (const wrapper of baseContext.promiseChainWrappers.values()) {
    lines.push(...emitPromiseChainCallbackWrapperDeclaration(wrapper, baseContext, promiseChainLoweringDependencies))
    lines.push('')
  }

  for (const wrapper of baseContext.dgramMessageHandlers.values()) {
    lines.push(...emitDgramMessageHandlerDeclaration(wrapper, baseContext, dgramLoweringDependencies))
    lines.push('')
  }

  for (const wrapper of baseContext.httpHandlers.values()) {
    lines.push(...emitHttpHandlerDeclaration(wrapper, baseContext, httpLoweringDependencies))
    lines.push('')
  }

  for (const wrapper of baseContext.netHandlers.values()) {
    lines.push(...emitNetHandlerDeclaration(wrapper, baseContext, netLoweringDependencies))
    lines.push('')
  }

  for (const item of functions) {
    lines.push(...emitFunctionDeclaration(item, baseContext))
    lines.push('')
  }

  for (const { info, method } of classMethods) {
    lines.push(...emitClassMethodDeclaration(info, method, baseContext))
    lines.push('')
  }

  lines.push(...emitMainWrapper(entryIrPrograms, baseContext))

  if (diagnostics.length > 0) {
    throw new CompileError(diagnostics)
  }

  return `${lines.join('\n')}\n`
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
  diagnostics,
  functionDeclarations: IrFunctionDeclaration[],
  functionEffects: IrFunctionEffect[],
  jsGlobalRoots: Set<string>
) {
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

function resolveFunctionReturnType(name, fallback, context) {
  return context.functionReturnTypes.get(name) ?? fallback
}

function resolveFunctionReturnNullable(name, fallback, context) {
  return context.functionReturnNullables.has(name)
    ? context.functionReturnNullables.get(name) === true
    : fallback === true
}

function resolveFunctionDeclarationParams(name, fallback, context) {
  return context.functionParams.get(name) ?? fallback
}

function isBoxedFunctionParam(param, index, statement, context) {
  return context.boxedMutableCaptureDeclarations.has(statement.params[index] ?? param)
}

function collectExternalEventLoopFunctions(functions) {
  const functionsByName = new Map(
    functions.flatMap((item) => (typeof item.name === 'string' ? [[item.name, item]] : []))
  )
  const names = new Set()
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

function emitFunctionDeclaration(statement, baseContext) {
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

function registerFunctionParamsInContext(statement, params, context) {
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

function emitFunctionHead(statement, context) {
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

function emitClassMethodDeclaration(info, method, baseContext) {
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

function emitClassMethodHead(info, method, context) {
  const params = [
    'ccjs_value this',
    ...method.params.map((param, index) => emitClassMethodParam(param, index, method, context))
  ]

  return `static ${emitCReturnType(method.returnType, method.returnNullable)} ${emitCClassMethodName(info.name, method.name)}(${params.join(', ')})`
}

function emitClassMethodParam(param, index, method, context) {
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

function resolveCFunctionReturnInfo(statement, context) {
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

function emitFunctionParameter(name, functionType, context, loc) {
  reportUnsupportedCFunctionType(functionType, context, loc)

  if (isRuntimeFunctionType(functionType)) {
    return `ccjs_value ${name}`
  }

  return emitFunctionPointerParameter(name, functionType)
}

function emitFunctionPointerParameter(name, functionType) {
  return `${emitFunctionPointerReturnType(functionType)} (*${name})(${emitFunctionPointerParams(functionType)})`
}

function emitFunctionPointerVariable(name, init, context, isConst, functionType, loc) {
  reportUnsupportedCFunctionType(functionType, context, loc)

  return `${emitFunctionPointerReturnType(functionType)} (*${isConst ? 'const ' : ''}${name})(${emitFunctionPointerParams(functionType)}) = ${emitFunctionValueExpression(init, context)}`
}

function reportUnsupportedCFunctionType(functionType, context, loc) {
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

function emitMainWrapper(irPrograms, baseContext) {
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

function emitMainReturnExpression(context) {
  const successReturn = context.processRuntime
    ? 'ccjs_process_get_exit_code()'
    : context.returnType === 'number'
      ? '(int)ccjs_return'
      : '0'

  return context.unhandledRejectionFlag == null
    ? successReturn
    : `${context.unhandledRejectionFlag} == 0 ? ${successReturn} : 1`
}

function emitRuntimeParamPrelude(statement, context) {
  const params = resolveFunctionDeclarationParams(statement.name, statement.params, context)

  return emitRuntimeParamPreludeForParams(statement, params, context)
}

function emitRuntimeParamPreludeForParams(statement, params, context) {
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

function emitThrowingFunctionPrelude(context) {
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

function emitStatement(statement, context) {
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

function inferCatchBindingValueType(statement, context) {
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
  const childProcessMethod = cChildProcessRuntimeMethodName(expression)

  if (childProcessMethod != null) {
    return childProcessMethod === 'spawnSync' ? 'object' : 'string'
  }

  if (cOsRuntimeConstantName(expression) != null || cOsRuntimeMethodName(expression) != null) {
    return 'string'
  }

  const processMethod = cProcessRuntimeMethodName(expression)

  if (processMethod != null) {
    return processMethod === 'cwd' ? 'string' : 'void'
  }

  const processProperty = cProcessRuntimePropertyName(expression)

  if (processProperty === 'argv' && expression?.type === 'IndexExpression') {
    return 'string'
  }

  const processPropertyType = cProcessRuntimePropertyValueType(expression)

  if (processPropertyType != null) {
    return processPropertyType
  }

  if (cProcessRuntimeEnvName(expression) != null) {
    return 'string'
  }

  const urlMethod = cUrlRuntimeMethodName(expression)

  if (urlMethod != null) {
    if (
      urlMethod === 'fileURLToPath' ||
      urlMethod === 'URLSearchParams.get' ||
      urlMethod === 'URLSearchParams.toString'
    ) {
      return 'string'
    }

    if (urlMethod === 'URLSearchParams.has') {
      return 'boolean'
    }

    if (
      urlMethod === 'URLSearchParams.append' ||
      urlMethod === 'URLSearchParams.delete' ||
      urlMethod === 'URLSearchParams.set'
    ) {
      return 'void'
    }

    return 'object'
  }

  const pathConstant = cPathRuntimeConstantName(expression)

  if (pathConstant != null) {
    return 'string'
  }

  const pathMethod = cPathRuntimeMethodName(expression)

  if (pathMethod != null) {
    return pathMethod === 'isAbsolute' ? 'boolean' : pathMethod === 'parse' ? 'object' : 'string'
  }

  if (expression?.type === 'CallExpression' && cTimeRuntimeCallName(expression.callee) != null) {
    return 'number'
  }

  if (expression?.type === 'CallExpression' && cFsRuntimeExpressionMethod(expression) != null) {
    return expression.valueType === 'promise' ? 'promise' : (expression.valueType ?? 'unknown')
  }

  if (expression?.type === 'CallExpression' && cFetchRuntimeExpressionMethod(expression) != null) {
    return expression.valueType === 'promise' ? 'promise' : (expression.valueType ?? 'unknown')
  }

  if (expression?.type === 'CallExpression' && cJsonRuntimeCallName(expression.callee) != null) {
    return expression.valueType ?? (cJsonRuntimeCallName(expression.callee) === 'parse' ? 'object' : 'string')
  }

  const cryptoMethod = cryptoRuntimeMethodName(expression)

  if (cryptoMethod === 'createHash' || cryptoMethod === 'Hash.update') {
    return 'crypto-hash'
  }

  if (cryptoMethod === 'createHmac' || cryptoMethod === 'Hmac.update') {
    return 'crypto-hmac'
  }

  if (cryptoMethod === 'Hash.digest' || cryptoMethod === 'Hmac.digest' || cryptoMethod === 'hash') {
    return expression.valueType ?? 'unknown'
  }

  if (cryptoMethod === 'getHashes') {
    return 'array'
  }

  if (cryptoMethod === 'getRandomValues' || cryptoMethod === 'randomBytes' || cryptoMethod === 'randomFillSync') {
    return 'bytes'
  }

  if (cryptoMethod === 'randomInt') {
    return 'number'
  }

  if (cryptoMethod === 'timingSafeEqual') {
    return 'boolean'
  }

  if (cryptoMethod === 'randomUUID') {
    return 'string'
  }

  if (cDebugRuntimeMethodName(expression) === 'memory') {
    return 'object'
  }

  if (
    expression?.type === 'CallExpression' &&
    cPromiseRuntimeCallName(expression.callee) != null &&
    expression.valueType === 'promise'
  ) {
    return 'promise'
  }

  if (isPromiseConstructorExpression(expression)) {
    return 'promise'
  }

  if (expression?.type === 'CallExpression' && mathRuntimeMethodName(expression.callee) != null) {
    return 'number'
  }

  if (isNumberConversionCall(expression, context)) {
    return 'number'
  }

  if (isErrorConstructorExpression(expression)) {
    return 'object'
  }

  if (isFetchAbortControllerConstructorExpression(expression)) {
    return 'object'
  }

  if (expression?.type === 'NewExpression' && collectionConstructorName(expression) === 'Map') {
    return 'map'
  }

  if (expression?.type === 'NewExpression' && collectionConstructorName(expression) === 'Set') {
    return 'set'
  }

  if (isClassConstructorExpression(expression, context)) {
    return 'object'
  }

  if (isStringConversionCall(expression, context)) {
    return 'string'
  }

  if (isStringTrimCall(expression, context)) {
    return 'string'
  }

  if (isStringSliceCall(expression, context)) {
    return 'string'
  }

  if (isStringSplitCall(expression, context)) {
    return 'array'
  }

  if (isStringPredicateCall(expression, context)) {
    return 'boolean'
  }

  if (isBinaryRuntimeCall(expression)) {
    return expression.valueType ?? binaryRuntimeExpressionReturnType(expression) ?? 'bytes'
  }

  if (isBinaryConstructorExpression(expression)) {
    return 'bytes'
  }

  if (expression?.type === 'CallExpression' && usesCJsGlobal(expression.callee, context)) {
    return 'js-global'
  }

  if (expression?.type === 'NewExpression' && usesCJsGlobal(expression.callee, context)) {
    return 'js-global'
  }

  if (expression?.valueType != null && expression.valueType !== 'unknown') {
    return expression.valueType
  }

  if (expression?.type === 'StringLiteral') {
    return 'string'
  }

  if (expression?.type === 'TemplateLiteral') {
    return 'string'
  }

  if (expression?.type === 'Reference') {
    return (
      context.variables.get(expression.path.join('.')) ??
      (context.functionNames.has(expression.path[0])
        ? 'function'
        : isCJsGlobalRoot(expression.path[0], context)
          ? 'js-global'
          : 'number')
    )
  }

  if (expression?.type === 'ArrowFunctionExpression') {
    return 'function'
  }

  if (expression?.type === 'BooleanLiteral') {
    return 'boolean'
  }

  if (expression?.type === 'UnaryExpression') {
    return expression.operator === '!' ? 'boolean' : 'number'
  }

  if (expression?.type === 'UpdateExpression') {
    return 'number'
  }

  if (expression?.type === 'BinaryExpression') {
    if (['===', '!==', '==', '!=', '<', '<=', '>', '>=', '&&', '||'].includes(expression.operator)) {
      return 'boolean'
    }

    if (expression.operator === '??') {
      const left = inferExpressionType(expression.left, context)

      return left === 'null' || left === 'unknown' ? inferExpressionType(expression.right, context) : left
    }

    if (
      expression.operator === '+' &&
      (inferExpressionType(expression.left, context) === 'string' ||
        inferExpressionType(expression.right, context) === 'string')
    ) {
      return 'string'
    }

    return 'number'
  }

  if (expression?.type === 'ArrayLiteral') {
    return 'array'
  }

  if (expression?.type === 'ObjectLiteral') {
    return 'object'
  }

  if (isMemberAccessExpression(expression)) {
    if (emitPreparedNetAddressPortExpression(expression, context) != null) {
      return 'number'
    }

    if (resolveNetAddressStringMember(expression, context) != null) {
      return 'string'
    }

    if (isArrayLengthExpression(expression, context)) {
      return 'number'
    }

    const length = resolveKnownArrayLength(expression, context)

    if (length != null) {
      return 'number'
    }

    const member = resolveKnownObjectMember(expression, context)

    if (member != null) {
      return member.valueType
    }

    return expression.type === 'OptionalMemberExpression' ? 'optional' : 'number'
  }

  if (isIndexAccessExpression(expression)) {
    if (expression.collectionKind === 'map') {
      return expression.valueType ?? 'unknown'
    }

    const element = resolveKnownArrayIndex(expression, context)
    const field = resolveKnownObjectIndex(expression, context)
    const runtimeElement = resolveRuntimeArrayIndex(expression, context)

    if (element != null) {
      return element.valueType
    }

    if (field != null) {
      return field.valueType
    }

    if (runtimeElement != null) {
      return runtimeElement.valueType
    }

    return expression.type === 'OptionalIndexExpression' ? 'optional' : 'number'
  }

  if (expression?.type === 'CallExpression') {
    if (expression.valueType != null && expression.valueType !== 'unknown') {
      return expression.valueType
    }

    if (expression.callee.type === 'Reference') {
      return context.functionReturnTypes.get(expression.callee.path[0]) ?? 'number'
    }

    return 'number'
  }

  if (expression?.type === 'NewExpression') {
    return 'class'
  }

  if (expression?.type === 'AwaitExpression') {
    const valueType =
      knownValueType(expression.valueType) ?? resolvePromiseExpressionValueType(expression.argument, context)

    if (valueType != null) {
      return valueType
    }

    const argumentType = inferExpressionType(expression.argument, context)

    return argumentType === 'promise' ? 'unknown' : argumentType
  }

  if (isOptionalChainExpression(expression)) {
    return 'optional'
  }

  return 'number'
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
