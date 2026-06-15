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
import { tokenize } from '../lexer.ts'
import { parse } from '../parser.ts'
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
  withNullableScalarNarrowing,
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
  collectionConstructorNameFromPath,
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
  type PromiseChainLoweringDependencies
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
  binaryRuntimeExpressionReturnType,
  binaryRuntimeMethodName,
  isBinaryConstructorExpression,
  isBinaryRuntimeCall,
  isBufferAllocCall,
  isBufferFromCall
} from './stdlib/binary.ts'
import { cChildProcessRuntimeMethodName } from './stdlib/child-process.ts'
import { irProgramsUseConsoleRuntime, isConsoleLog } from './stdlib/console.ts'
import {
  cryptoRuntimeMethodName,
  emitCryptoHashVariableDeclaration,
  emitPreparedCryptoCallExpression,
  emitPreparedCryptoHashCallExpression,
  emitPreparedCryptoHashHandleExpression,
  emitPreparedCryptoHmacCallExpression,
  emitPreparedCryptoHmacHandleExpression,
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
import { cFetchRuntimeExpressionMethod, isAsyncFetchRuntimeCallExpression } from './stdlib/fetch.ts'
import {
  cFsRuntimeConstantExpression,
  cFsRuntimeExpressionMethod,
  isAsyncFsRuntimeCallExpression
} from './stdlib/fs.ts'
import { cJsonRuntimeCallName } from './stdlib/json.ts'
import { cOsRuntimeConstantName, cOsRuntimeConstantValue, cOsRuntimeMethodName } from './stdlib/os.ts'
import { cPathRuntimeConstantName, cPathRuntimeConstantValue, cPathRuntimeMethodName } from './stdlib/path.ts'
import {
  cProcessRuntimeEnvName,
  cProcessRuntimeMethodName,
  cProcessRuntimeNumberPropertyName,
  cProcessRuntimePropertyName,
  cProcessRuntimePropertyValueType,
  cProcessRuntimeStringFunctionName,
  cProcessRuntimeStringPropertyName
} from './stdlib/process.ts'
import { cTimeRuntimeCallName } from './stdlib/time.ts'
import {
  cTimerClearCallName,
  cTimerRuntimeCallName,
  cTimerStartCallName,
  isTimerStartCallExpression,
  timerCallbackFunctionType
} from './stdlib/timers.ts'
import { cUrlRuntimeMethodName } from './stdlib/url.ts'
import {
  cUnsupportedExpressionCode,
  cUnsupportedVariableDeclarationCode,
  containsAwaitExpression,
  emitCOperator,
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
import { urlMutableObjectFields, urlObjectFields, urlSearchParamsObjectFields } from '../stdlib/descriptors/url.ts'
import { pathParseObjectFields } from '../stdlib/descriptors/path.ts'
import { cDebugRuntimeMethodName } from './stdlib/debug.ts'
import {
  canLowerCNullishCoalescingExpression,
  canLowerCScalarNullishCoalescingExpression,
  clearNullableScalarNarrowing,
  isNarrowedNullableScalarReference,
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
  emitObjectValueReference,
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
import {
  emitPreparedCollectionReceiver,
  emitPreparedCollectionSizeExpression,
  resolveRuntimeForOfMap,
  resolveRuntimeForOfSet,
  resolveRuntimeMapType,
  resolveRuntimeSetElementType,
  type CollectionLoweringDependencies
} from './values/collections.ts'
import {
  emitPreparedArrayLengthExpression,
  emitPreparedRuntimeArrayIndexValue,
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
  emitPreparedStringBytesOperand,
  emitPreparedStringCompareExpression,
  emitPreparedStringLengthExpression,
  emitPreparedStringPredicateCall,
  emitStringExpression,
  isBytesToStringCall,
  isCStringRuntimeMethodName,
  isRawStringLiteralExpression,
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
import { emitCConditionClause, emitCNegatedConditionClause } from './values/expressions.ts'
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
  emitForOfStatement,
  emitForStatement,
  emitIfStatement,
  emitReturnStatement,
  emitReturnCleanupStatement,
  emitReturnJump,
  emitRuntimeCallbackRuntimeValueReturnLines,
  emitRuntimeStringVariableDeclaration,
  emitRuntimeValueVariableDeclaration,
  emitStatementBody,
  emitStatementList,
  emitSwitchStatement,
  emitThrowStatement,
  emitTryStatement,
  emitVariableDeclarationStatement,
  emitWhileStatement,
  isRuntimeValueLocalExpression,
  registerRuntimeValueMetadata,
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
  ModuleGraph,
  SourceLocation
} from '../types.ts'
export type { CModuleOutputFile } from './types.ts'

const nullableLoweringDependencies: NullableLoweringDependencies = {
  inferExpressionType,
  isNumberConversionCall,
  resolveRuntimeCallbackCalleeType
}

const statementLoweringDependencies: StatementLoweringDependencies = {
  containsAwaitExpression,
  emitArrayVariableDeclaration,
  emitArrayFilterVariableDeclaration,
  emitArrayMapVariableDeclaration,
  emitArraySortVariableDeclaration,
  emitBoxedObjectVariableDeclaration,
  emitBoxedRuntimeValueVariableDeclaration,
  emitCAwaitValueExpression,
  emitClassObjectVariableDeclaration,
  emitCExpression,
  emitCObjectLiteralValueExpression,
  emitCValueExpression,
  emitCollectionVariableDeclaration,
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
  emitJsonParseVariableDeclaration,
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
  emitNullableRuntimeValueVariableDeclaration,
  emitObjectVariableDeclaration,
  emitOptionalRuntimeCallbackCallExpression,
  emitPreparedArrayFilterCallExpression,
  emitPreparedArrayMapCallExpression,
  emitPreparedArrayPopCallExpression,
  emitPreparedArrayPushCallExpression,
  emitPreparedArraySortCallExpression,
  emitPreparedAsyncFunctionPromiseCallExpression,
  emitPreparedBytesIndexAssignment,
  emitPreparedCallExpression,
  emitPreparedChildProcessCallExpression,
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
  emitPreparedFetchCallExpression,
  emitPreparedFetchHeadersCallExpression,
  emitPreparedFsCallExpression,
  emitPreparedFsSyncStatementExpression,
  emitPreparedMapIndexAssignment,
  emitPreparedNumberExpression,
  emitPreparedPathObjectCallExpression,
  emitPreparedPromiseConstructorExpression,
  emitPreparedPromiseExpression,
  emitPreparedPromiseMethodExpression,
  emitPreparedPromiseReturningCallExpression,
  emitPreparedPromiseStaticExpression,
  emitPreparedTimerCallExpression,
  emitPreparedUpdateExpression,
  emitPreparedUrlObjectExpression,
  emitPreparedUrlSearchParamsObjectExpression,
  emitProcessExitCodeAssignment,
  emitProcessExitStatement,
  emitPromiseConstructorSettlementCall,
  emitReference,
  emitRuntimeCallbackVariableDeclaration,
  emitScalarVariableDeclaration,
  emitStatement,
  emitStringExpression,
  emitUrlObjectFieldAssignment,
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
  isRuntimeFunctionType,
  isRuntimeNullableType,
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

const collectionLoweringDependencies: CollectionLoweringDependencies = {
  emitCValueExpression,
  emitPreparedCollectionCallExpression,
  inferExpressionType,
  isIndexAccessExpression,
  isMemberAccessExpression,
  resolveKnownObjectIndex,
  resolveKnownObjectMember
}

const arrayLoweringDependencies: ArrayLoweringDependencies = {
  emitCValueExpression,
  inferExpressionType,
  resolveKnownObjectIndex,
  resolveKnownObjectMember
}

const stringLoweringDependencies: StringLoweringDependencies = {
  canLowerCNullishCoalescingExpression,
  emitCallExpression,
  emitCTemplateLiteralValueExpression,
  emitCValueExpression,
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
  emitPreparedFetchInitOperand,
  emitPreparedFsAccessModeExpression,
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

function reportCCollectionHashability(valueType, subject, loc, context) {
  if (valueType == null || valueType === 'unknown' || isCCollectionHashableType(valueType)) {
    return
  }

  context.diagnostics.push(
    diagnostic('CCJS_C_COLLECTION', `${subject} must be hashable in the current C backend slice`, loc)
  )
}

function isCCollectionHashableType(valueType) {
  return valueType === 'number' || valueType === 'boolean' || valueType === 'string'
}

function emitCollectionVariableDeclaration(statement, context) {
  const constructor = collectionConstructorName(statement.init)

  if (constructor == null) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_COLLECTION',
        'this collection constructor is not supported by the current C backend slice',
        statement.loc
      )
    )
    return [`double ${statement.name} = 0;`]
  }

  if (statement.init.args.length > 1) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_COLLECTION',
        'C collection constructors currently support at most one array literal iterable',
        statement.init.loc
      )
    )
  }

  registerOwnedValue(context, statement.name)

  if (constructor === 'Map') {
    context.variables.set(statement.name, 'map')
    context.mapTypes.set(statement.name, {
      key: statement.mapKeyType ?? 'unknown',
      value: statement.mapValueType ?? 'unknown'
    })
    reportCCollectionHashability(statement.mapKeyType, 'Map keys', statement.loc, context)

    const lines = [
      ...emitPrepareOwnedValueWrite(statement.name),
      emitStatusCheck(`ccjs_map_new(&ccjs_default_allocator, &${statement.name})`, context)
    ]

    lines.push(...emitMapConstructorEntries(statement.name, statement.init.args[0], context, statement.init.loc))

    return lines
  }

  context.variables.set(statement.name, 'set')
  context.setElementTypes.set(statement.name, statement.setElementType ?? 'unknown')
  reportCCollectionHashability(statement.setElementType, 'Set values', statement.loc, context)

  const lines = [
    ...emitPrepareOwnedValueWrite(statement.name),
    emitStatusCheck(`ccjs_set_new(&ccjs_default_allocator, &${statement.name})`, context)
  ]

  lines.push(...emitSetConstructorValues(statement.name, statement.init.args[0], context, statement.init.loc))

  return lines
}

function emitMapConstructorEntries(name, expression, context, loc) {
  if (expression == null) {
    return []
  }

  if (expression.type !== 'ArrayLiteral') {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_COLLECTION',
        'C Map constructor currently supports only array literal entries',
        expression.loc ?? loc
      )
    )
    return []
  }

  const lines: string[] = []

  for (const entry of expression.elements) {
    if (entry.type !== 'ArrayLiteral' || entry.elements.length !== 2) {
      context.diagnostics.push(
        diagnostic(
          'CCJS_C_COLLECTION',
          'C Map constructor entries must be [key, value] array literals',
          entry.loc ?? loc
        )
      )
      continue
    }

    const key = emitCValueExpression(entry.elements[0], context)
    const value = emitCValueExpression(entry.elements[1], context)
    reportCCollectionHashability(
      inferExpressionType(entry.elements[0], context),
      'Map keys',
      entry.elements[0].loc ?? entry.loc ?? loc,
      context
    )

    lines.push(...key.lines)
    lines.push(...value.lines)
    lines.push(emitStatusCheck(`ccjs_map_set(${name}, ${key.expression}, ${value.expression})`, context))
  }

  return lines
}

function emitSetConstructorValues(name, expression, context, loc) {
  if (expression == null) {
    return []
  }

  if (expression.type !== 'ArrayLiteral') {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_COLLECTION',
        'C Set constructor currently supports only array literal values',
        expression.loc ?? loc
      )
    )
    return []
  }

  const lines: string[] = []

  for (const element of expression.elements) {
    const value = emitCValueExpression(element, context)
    reportCCollectionHashability(inferExpressionType(element, context), 'Set values', element.loc ?? loc, context)

    lines.push(...value.lines)
    lines.push(emitStatusCheck(`ccjs_set_add(${name}, ${value.expression})`, context))
  }

  return lines
}

function emitObjectVariableDeclaration(statement, context) {
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
  registerOwnedValue(context, statement.name)
  lines.push(...emitPrepareOwnedValueWrite(statement.name))
  lines.push(emitStatusCheck(`ccjs_object_new(&ccjs_default_allocator, &${shapeName}, &${statement.name})`, context))

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

  for (const [index, field] of fields.entries()) {
    const property = properties.get(field.name)

    if (property == null) {
      context.diagnostics.push(diagnostic('CCJS_MISSING_FIELD', `missing field ${field.name}`, statement.loc))
      continue
    }

    const value = emitCValueExpression(property.value, context)
    lines.push(...value.lines)
    lines.push(emitStatusCheck(`ccjs_object_init_known(${statement.name}, ${index}, ${value.expression})`, context))
  }

  return lines
}

function emitJsonParseVariableDeclaration(statement, context) {
  if (statement.init?.type !== 'CallExpression' || cJsonRuntimeCallName(statement.init.callee) !== 'parse') {
    return null
  }

  if (statement.valueType !== 'object' || statement.shape?.fields == null) {
    return null
  }

  const fields = statement.shape.fields
  const shapeName = nextCName(context, `ccjs_shape_${statement.name}`)
  const fieldsName = `${shapeName}_fields`
  const parsed = nextCName(context, 'ccjs_json_object')
  const parseCall = emitPreparedJsonCallExpression(statement.init, context, {
    out: parsed
  })
  const lines = [`static const ccjs_field_info ${fieldsName}[] = {`]

  for (const field of fields) {
    lines.push(`  { ${cStringLiteral(field.name)}, ${emitCFieldFlags(field)} },`)
  }

  lines.push('};')
  lines.push(`static const ccjs_shape ${shapeName} = {`)
  lines.push(`  ${fields.length},`)
  lines.push(`  ${fieldsName}`)
  lines.push('};')

  registerOwnedValue(context, statement.name)
  context.variables.set(statement.name, 'object')
  registerObjectShape(context, statement.name, statement.shape)

  lines.push(...parseCall.lines)
  lines.push(...emitPrepareOwnedValueWrite(statement.name))
  lines.push(emitStatusCheck(`ccjs_object_new(&ccjs_default_allocator, &${shapeName}, &${statement.name})`, context))

  for (const [index, field] of fields.entries()) {
    const value = nextCName(context, `ccjs_json_${emitCIdentifier(field.name)}`)
    const tag = cRuntimeValueTag(field.valueType)

    registerOwnedValue(context, value)
    lines.push(...emitPrepareOwnedValueWrite(value))
    lines.push(
      emitStatusCheck(
        `ccjs_object_get(${parsed}, ${cStringLiteral(field.name)}, ${utf8ByteLength(field.name)}, &${value})`,
        context
      )
    )
    lines.push(
      ...(field.nullable === true
        ? emitRuntimeNullableValueCheck(value, tag, context)
        : [emitRuntimeValueCheck(value, tag, context)].filter(Boolean))
    )
    lines.push(emitStatusCheck(`ccjs_object_init_known(${statement.name}, ${index}, ${value})`, context))
  }

  return lines
}

function emitNullableRuntimeValueVariableDeclaration(statement, context) {
  const valueType = statement.valueType
  const expectedTag = cRuntimeValueTag(valueType)

  registerOwnedValue(context, statement.name)
  context.variables.set(statement.name, valueType)
  context.nullableVariables.add(statement.name)

  if (valueType === 'object') {
    registerObjectShape(context, statement.name, statement.shape)
  } else if (valueType === 'array') {
    context.runtimeArrayElementTypes.set(statement.name, statement.arrayElementType ?? 'unknown')
  } else if (valueType === 'map') {
    context.mapTypes.set(statement.name, {
      key: statement.mapKeyType ?? 'unknown',
      value: statement.mapValueType ?? 'unknown'
    })
  } else if (valueType === 'set') {
    context.setElementTypes.set(statement.name, statement.setElementType ?? 'unknown')
  } else if (valueType === 'function') {
    context.functionTypes.set(statement.name, normalizeFunctionType(statement.functionType))
    context.runtimeCallbacks.add(statement.name)
  }

  if (statement.init == null || statement.init.type === 'NullLiteral') {
    return [...emitPrepareOwnedValueWrite(statement.name), `${statement.name} = ccjs_null_value();`]
  }

  const value = isNullableScalarType(valueType)
    ? emitNullableScalarValueExpression(statement.init, context)
    : valueType === 'function'
      ? emitNullableFunctionValueExpression(statement.init, statement.functionType, context)
      : statement.init.type === 'ObjectLiteral'
        ? emitCObjectLiteralValueExpression(statement.init, context, statement.shape)
        : emitCValueExpression(statement.init, context)

  return [
    ...value.lines,
    ...emitPrepareOwnedValueWrite(statement.name),
    `${statement.name} = ${value.expression};`,
    ...emitRuntimeNullableValueCheck(statement.name, expectedTag, context),
    `ccjs_retain(${statement.name});`
  ]
}

function emitVariableDeclaration(statement, context) {
  if (statement.nullable === true && isRuntimeNullableType(statement.valueType)) {
    return emitNullableRuntimeValueVariableDeclaration(statement, context).join('\n')
  }

  if (isErrorConstructorExpression(statement.init)) {
    return emitErrorObjectVariableDeclaration(statement, context).join('\n')
  }

  const cryptoHashDeclaration = emitCryptoHashVariableDeclaration(statement, context, cryptoLoweringDependencies)

  if (cryptoHashDeclaration != null) {
    return cryptoHashDeclaration.join('\n')
  }

  if (
    isRuntimeValueLocalExpression(statement.init, context) &&
    statement.init?.type !== 'ObjectLiteral' &&
    statement.init?.type !== 'ArrayLiteral'
  ) {
    return emitRuntimeValueVariableDeclaration(statement, statement.init, context).join('\n')
  }

  const inferred = inferExpressionType(statement.init, context)
  context.variables.set(statement.name, inferred)

  if (inferred === 'string') {
    if (context.boxedMutableCaptureDeclarations.has(statement)) {
      return emitBoxedRuntimeValueVariableDeclaration(statement, statement.init, context)
    }

    const runtimeString = resolveRuntimeStringReference(statement.init, context)

    if (runtimeString != null) {
      context.runtimeStrings.add(statement.name)
      return `${statement.kind === 'const' ? 'const ' : ''}ccjs_string* ${statement.name} = ${runtimeString}`
    }

    if (isRuntimeProducedStringExpression(statement.init, context)) {
      context.diagnostics.push(
        diagnostic(
          'CCJS_C_STRING_EXPR',
          'runtime string declarations need prepared statement lowering in the current C backend slice',
          statement.loc
        )
      )
      return `char* ${statement.name} = ""`
    }

    return `${statement.kind === 'const' ? 'const ' : ''}char* ${statement.name} = ${emitStringExpression(statement.init, context)}`
  }

  if (inferred === 'function') {
    context.variables.set(statement.name, 'function')
    context.functionTypes.set(statement.name, statement.functionType)

    if (isRuntimeFunctionType(statement.functionType) || isRuntimeArrowCallbackExpression(statement.init, context)) {
      context.diagnostics.push(
        diagnostic(
          'CCJS_C_FUNCTION_VALUE',
          'runtime callback declarations need prepared statement lowering in the current C backend slice',
          statement.loc
        )
      )
      return `ccjs_value ${statement.name} = ccjs_undefined_value()`
    }

    return emitFunctionPointerVariable(
      statement.name,
      statement.init,
      context,
      statement.kind === 'const',
      statement.functionType,
      statement.loc
    )
  }

  if (!['number', 'boolean'].includes(inferred)) {
    context.diagnostics.push(
      diagnostic(
        cUnsupportedExpressionCode(inferred),
        'this expression is not supported by the current C backend slice',
        statement.loc
      )
    )
    return `double ${statement.name} = 0`
  }

  return `${statement.kind === 'const' ? 'const ' : ''}double ${statement.name} = ${emitNumberExpression(statement.init, context)}`
}

function emitScalarVariableDeclaration(statement, context) {
  if (statement.nullable === true && isRuntimeNullableType(statement.valueType)) {
    return emitNullableRuntimeValueVariableDeclaration(statement, context)
  }

  if (isErrorConstructorExpression(statement.init)) {
    return emitErrorObjectVariableDeclaration(statement, context)
  }

  if (statement.init?.type === 'CallExpression' && isTimerStartCallExpression(statement.init)) {
    const timerCall = emitPreparedTimerCallExpression(statement.init, context, {
      out: statement.name
    })

    if (timerCall != null) {
      context.variables.set(statement.name, 'timer')

      return [`ccjs_timer_handle* ${statement.name} = 0;`, ...timerCall.lines]
    }
  }

  if (statement.init?.type === 'CallExpression' && cTimerClearCallName(statement.init.callee) != null) {
    context.diagnostics.push(
      diagnostic('CCJS_C_TIMER_HANDLE', 'timer clear calls return void and cannot initialize a value', statement.loc)
    )
    context.variables.set(statement.name, 'timer')

    return [`ccjs_timer_handle* ${statement.name} = 0;`]
  }

  const cryptoHashDeclaration = emitCryptoHashVariableDeclaration(statement, context, cryptoLoweringDependencies)

  if (cryptoHashDeclaration != null) {
    return cryptoHashDeclaration
  }

  const fetchHeadersCall = emitPreparedFetchHeadersCallExpression(statement.init, context, {
    out: statement.name
  })

  if (fetchHeadersCall != null && statement.valueType === 'boolean') {
    context.variables.set(statement.name, 'boolean')
    return fetchHeadersCall.lines
  }

  const inferred = inferExpressionType(statement.init, context)
  context.variables.set(statement.name, inferred)

  if (inferred === 'string') {
    if (context.boxedMutableCaptureDeclarations.has(statement)) {
      return emitBoxedRuntimeValueVariableDeclaration(statement, statement.init, context)
    }

    const runtimeString = resolveRuntimeStringReference(statement.init, context)

    if (runtimeString != null) {
      context.runtimeStrings.add(statement.name)
      return [`${statement.kind === 'const' ? 'const ' : ''}ccjs_string* ${statement.name} = ${runtimeString};`]
    }

    const runtimeElement = resolveRuntimeArrayIndex(statement.init, context)

    if (context.forceRuntimeStringDeclarations?.has(statement.name) && isRawStringLiteralExpression(statement.init)) {
      return emitRuntimeStringVariableDeclaration(statement, statement.init, context)
    }

    if (isRuntimeProducedStringExpression(statement.init, context) || runtimeElement?.valueType === 'string') {
      return emitRuntimeStringVariableDeclaration(statement, statement.init, context)
    }

    return [
      `${statement.kind === 'const' ? 'const ' : ''}char* ${statement.name} = ${emitStringExpression(statement.init, context)};`
    ]
  }

  if (inferred === 'function') {
    const runtimeFunctionType = isRuntimeArrowCallbackExpression(statement.init, context)
      ? normalizeFunctionType(statement.functionType)
      : null

    context.variables.set(statement.name, 'function')
    context.functionTypes.set(statement.name, runtimeFunctionType ?? statement.functionType)

    if (isRuntimeFunctionType(statement.functionType) || runtimeFunctionType != null) {
      return emitRuntimeCallbackVariableDeclaration(statement, context)
    }

    return [
      `${emitFunctionPointerVariable(statement.name, statement.init, context, statement.kind === 'const', statement.functionType, statement.loc)};`
    ]
  }

  if (isArrayMethodCall(statement.init)) {
    context.diagnostics.push(
      diagnostic('CCJS_C_ARRAY_METHOD', 'array methods are not supported by the current C backend slice', statement.loc)
    )
    return [`double ${statement.name} = 0;`]
  }

  if (inferred === 'timer') {
    const handle = emitPreparedTimerHandleExpression(statement.init, context)

    context.variables.set(statement.name, 'timer')

    return [...handle.lines, `ccjs_timer_handle* ${statement.name} = ${handle.expression};`]
  }

  if (inferred === 'crypto-hash') {
    const handle = emitPreparedCryptoHashHandleExpression(statement.init, context, cryptoLoweringDependencies)

    context.variables.set(statement.name, 'crypto-hash')

    return [...handle.lines, `ccjs_crypto_hash* ${statement.name} = ${handle.expression};`]
  }

  if (inferred === 'crypto-hmac') {
    const handle = emitPreparedCryptoHmacHandleExpression(statement.init, context, cryptoLoweringDependencies)

    context.variables.set(statement.name, 'crypto-hmac')

    return [...handle.lines, `ccjs_crypto_hmac* ${statement.name} = ${handle.expression};`]
  }

  if ((inferred === 'number' || inferred === 'boolean') && context.boxedMutableCaptureDeclarations.has(statement)) {
    return emitBoxedScalarVariableDeclaration(statement, context)
  }

  if (!['number', 'boolean'].includes(inferred)) {
    context.diagnostics.push(
      diagnostic(
        cUnsupportedExpressionCode(inferred),
        'this expression is not supported by the current C backend slice',
        statement.loc
      )
    )
    return [`double ${statement.name} = 0;`]
  }

  const value = emitPreparedNumberExpression(statement.init, context)

  return [
    ...value.lines,
    `${statement.kind === 'const' ? 'const ' : ''}double ${statement.name} = ${value.expression};`
  ]
}

function emitBoxedScalarVariableDeclaration(statement, context) {
  const value = emitPreparedNumberExpression(statement.init, context)
  const inferred = inferExpressionType(statement.init, context)

  registerBoxedValue(context, statement.name, inferred)
  context.boxedVariables.add(statement.name)

  return [
    ...value.lines,
    `${statement.name} = ccjs_default_alloc(0, sizeof(double), _Alignof(double));`,
    `if (${statement.name} == 0) ${emitFailureStatement(context)}`,
    `*${statement.name} = ${value.expression};`
  ]
}

function emitBoxedRuntimeValueVariableDeclaration(statement, expression, context) {
  const valueType = inferExpressionType(expression, context)
  const value = emitCValueExpression(expression, context)
  const tag = valueType === 'string' ? 'CCJS_TAG_STRING' : 'CCJS_TAG_OBJECT'

  registerBoxedValue(context, statement.name, valueType)
  context.boxedVariables.add(statement.name)
  context.variables.set(statement.name, valueType)

  return [
    ...value.lines,
    `${statement.name} = ccjs_default_alloc(0, sizeof(ccjs_value), _Alignof(ccjs_value));`,
    `if (${statement.name} == 0) ${emitFailureStatement(context)}`,
    `*${statement.name} = ${value.expression};`,
    emitRuntimeTypeCheck(`(*${statement.name}).tag != ${tag} || (*${statement.name}).as.ref == 0`, context),
    `ccjs_retain(*${statement.name});`
  ]
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
  if (isNullishCoalescingExpression(expression)) {
    return emitCNullishCoalescingValueExpression(expression, context)
  }

  if (expression?.type === 'AwaitExpression') {
    return emitCAwaitValueExpression(expression, context)
  }

  const childProcessCall = emitPreparedChildProcessCallExpression(expression, context)

  if (childProcessCall != null) {
    return childProcessCall
  }

  const osConstant = emitPreparedOsConstantExpression(expression, context)

  if (osConstant != null) {
    return osConstant
  }

  const osStringCall = emitPreparedOsStringCallExpression(expression, context)

  if (osStringCall != null) {
    return osStringCall
  }

  const processString = emitPreparedProcessStringExpression(expression, context)

  if (processString != null) {
    return processString
  }

  const urlStringCall = emitPreparedUrlStringCallExpression(expression, context)

  if (urlStringCall != null) {
    return urlStringCall
  }

  const urlObject = emitPreparedUrlObjectExpression(expression, context)

  if (urlObject != null) {
    return urlObject
  }

  const urlSearchParamsObject = emitPreparedUrlSearchParamsObjectExpression(expression, context)

  if (urlSearchParamsObject != null) {
    return urlSearchParamsObject
  }

  const pathConstant = emitPreparedPathConstantExpression(expression, context)

  if (pathConstant != null) {
    return pathConstant
  }

  const pathObject = emitPreparedPathObjectCallExpression(expression, context)

  if (pathObject != null) {
    return pathObject
  }

  const pathCall = emitPreparedPathStringCallExpression(expression, context)

  if (pathCall != null) {
    return pathCall
  }

  const fsSyncValue = emitPreparedFsSyncValueExpression(expression, context)

  if (fsSyncValue != null) {
    return fsSyncValue
  }

  const fetchHeadersCall = emitPreparedFetchHeadersCallExpression(expression, context)

  if (fetchHeadersCall != null) {
    return fetchHeadersCall
  }

  const urlSearchParamsCall = emitPreparedUrlSearchParamsCallExpression(expression, context)

  if (urlSearchParamsCall != null) {
    return urlSearchParamsCall
  }

  const jsonCall = emitPreparedJsonCallExpression(expression, context)

  if (jsonCall != null) {
    return jsonCall
  }

  const debugMemoryCall = emitPreparedDebugMemoryCallExpression(expression, context)

  if (debugMemoryCall != null) {
    return debugMemoryCall
  }

  const cryptoCall = emitPreparedCryptoCallExpression(expression, context, cryptoLoweringDependencies)

  if (cryptoCall != null) {
    return cryptoCall
  }

  const binaryValue = emitPreparedBinaryValueExpression(expression, context)

  if (binaryValue != null) {
    return binaryValue
  }

  const arrayPopCall = emitPreparedArrayPopCallExpression(expression, context)

  if (arrayPopCall != null) {
    return arrayPopCall
  }

  const mapIndexGet = emitPreparedMapIndexGetExpression(expression, context)

  if (mapIndexGet != null) {
    return mapIndexGet
  }

  if (isErrorConstructorExpression(expression)) {
    return emitCErrorObjectValueExpression(expression, context)
  }

  if (isClassConstructorExpression(expression, context)) {
    return emitCClassObjectValueExpression(expression, context)
  }

  if (expression?.type === 'OptionalCallExpression' && isNullableRuntimeExpression(expression, context)) {
    return emitOptionalRuntimeCallbackCallValueExpression(expression, context)
  }

  const numberConversion = emitCNumberConversionValueExpression(expression, context)

  if (numberConversion != null) {
    return numberConversion
  }

  if (isNullableScalarRuntimeExpression(expression, context)) {
    return emitPreparedNullableScalarRuntimeValueExpression(expression, context)
  }

  if (isStringConversionCall(expression, context)) {
    return emitCStringConversionValueExpression(expression, context)
  }

  if (isStringTrimCall(expression, context)) {
    return emitCStringTrimValueExpression(expression, context)
  }

  if (isStringSliceCall(expression, context)) {
    return emitCStringSliceValueExpression(expression, context)
  }

  if (isStringSplitCall(expression, context)) {
    return emitCStringSplitValueExpression(expression, context)
  }

  if (isStringConcatExpression(expression, context)) {
    return emitCStringConcatValueExpression(expression, context)
  }

  if (expression?.type === 'TemplateLiteral') {
    return emitCTemplateLiteralValueExpression(expression, context)
  }

  if (expression?.type === 'ArrayLiteral') {
    return emitCArrayLiteralValueExpression(expression, context)
  }

  if (expression?.type === 'ObjectLiteral') {
    return emitCObjectLiteralValueExpression(expression, context)
  }

  if (expression?.type === 'StringLiteral') {
    const temp = nextCName(context, 'ccjs_value')
    registerOwnedValue(context, temp)

    return {
      lines: [
        ...emitPrepareOwnedValueWrite(temp),
        emitStatusCheck(
          `ccjs_string_from_literal(&ccjs_default_allocator, ${cStringLiteral(expression.value)}, ${utf8ByteLength(expression.value)}, &${temp})`,
          context
        )
      ],
      expression: temp
    }
  }

  if (expression?.type === 'NumberLiteral') {
    return {
      lines: [],
      expression: `ccjs_number_value(${expression.value})`
    }
  }

  if (expression?.type === 'BooleanLiteral') {
    return {
      lines: [],
      expression: `ccjs_bool_value(${expression.value ? 'true' : 'false'})`
    }
  }

  if (expression?.type === 'NullLiteral') {
    return {
      lines: [],
      expression: 'ccjs_null_value()'
    }
  }

  if (expression?.type === 'Reference') {
    const name = expression.path.join('_')
    const type = context.variables.get(name)

    if (context.nullableVariables.has(name)) {
      return {
        lines: [],
        expression: name
      }
    }

    if (isBoxedRuntimeValueName(name, context)) {
      const tag = type === 'string' ? 'CCJS_TAG_STRING' : 'CCJS_TAG_OBJECT'

      return {
        lines: [emitRuntimeTypeCheck(`(*${name}).tag != ${tag} || (*${name}).as.ref == 0`, context)],
        expression: `(*${name})`
      }
    }

    if (type === 'string' && context.runtimeStrings.has(name)) {
      const temp = nextCName(context, 'ccjs_value')

      return {
        lines: [
          `ccjs_value ${temp};`,
          `${temp}.tag = CCJS_TAG_STRING;`,
          `${temp}.as.ref = (ccjs_ref*)&${name}->header;`
        ],
        expression: temp
      }
    }

    if (type === 'bytes' || type === 'object' || type === 'array') {
      return {
        lines: [],
        expression: name
      }
    }

    if (type === 'map' || type === 'set') {
      return {
        lines: [],
        expression: name
      }
    }

    if (type === 'number') {
      return {
        lines: [],
        expression: `ccjs_number_value(${name})`
      }
    }

    if (type === 'boolean') {
      return {
        lines: [],
        expression: `ccjs_bool_value(${name})`
      }
    }
  }

  if (expression?.type === 'OptionalMemberExpression') {
    return emitCOptionalMemberValueExpression(expression, context)
  }

  if (expression?.type === 'OptionalIndexExpression') {
    return emitCOptionalIndexValueExpression(expression, context)
  }

  if (isMemberAccessExpression(expression)) {
    const member = resolveKnownObjectMember(expression, context)

    if (
      member?.valueType === 'bytes' ||
      member?.valueType === 'array' ||
      member?.valueType === 'map' ||
      member?.valueType === 'set'
    ) {
      const temp = nextCName(context, 'ccjs_value')
      const tag = cRuntimeValueTag(member.valueType)
      registerOwnedValue(context, temp)

      return {
        lines: [
          ...emitPrepareOwnedValueWrite(temp),
          emitStatusCheck(
            `ccjs_object_get_known(${emitObjectValueReference(member.objectName, context)}, ${member.index}, &${temp})`,
            context
          ),
          ...emitRuntimeFieldValueCheck(temp, tag, expression, context)
        ],
        expression: temp
      }
    }

    if (member?.valueType === 'object') {
      const temp = nextCName(context, 'ccjs_value')
      registerOwnedValue(context, temp)

      return {
        lines: [
          ...emitPrepareOwnedValueWrite(temp),
          emitStatusCheck(
            `ccjs_object_get_known(${emitObjectValueReference(member.objectName, context)}, ${member.index}, &${temp})`,
            context
          ),
          ...emitRuntimeFieldValueCheck(temp, 'CCJS_TAG_OBJECT', expression, context)
        ],
        expression: temp
      }
    }

    if (member?.valueType === 'string') {
      const temp = nextCName(context, 'ccjs_value')
      registerOwnedValue(context, temp)

      return {
        lines: [
          ...emitPrepareOwnedValueWrite(temp),
          emitStatusCheck(
            `ccjs_object_get_known(${emitObjectValueReference(member.objectName, context)}, ${member.index}, &${temp})`,
            context
          ),
          ...emitRuntimeFieldValueCheck(temp, 'CCJS_TAG_STRING', expression, context)
        ],
        expression: temp
      }
    }
  }

  if (isIndexAccessExpression(expression)) {
    const element = resolveKnownArrayIndex(expression, context)

    if (element?.valueType === 'array') {
      const temp = nextCName(context, 'ccjs_value')
      registerOwnedValue(context, temp)

      return {
        lines: [
          ...emitPrepareOwnedValueWrite(temp),
          emitStatusCheck(`ccjs_array_get(${element.arrayName}, ${element.index}, &${temp})`, context),
          ...emitRuntimeFieldValueCheck(temp, 'CCJS_TAG_ARRAY', expression, context)
        ],
        expression: temp
      }
    }

    const runtimeElement = resolveRuntimeArrayIndex(expression, context)

    if (runtimeElement != null && ['boolean', 'number', 'string'].includes(runtimeElement.valueType)) {
      const value = emitPreparedRuntimeArrayIndexValue(expression, runtimeElement, context, 'ccjs_value')

      return runtimeElement.valueType === 'string'
        ? {
            lines: [
              ...value.lines,
              ...emitRuntimeFieldValueCheck(value.expression, 'CCJS_TAG_STRING', expression, context)
            ],
            expression: value.expression
          }
        : value
    }

    if (element?.valueType === 'string') {
      const temp = nextCName(context, 'ccjs_value')
      registerOwnedValue(context, temp)

      return {
        lines: [
          ...emitPrepareOwnedValueWrite(temp),
          emitStatusCheck(`ccjs_array_get(${element.arrayName}, ${element.index}, &${temp})`, context),
          ...emitRuntimeFieldValueCheck(temp, 'CCJS_TAG_STRING', expression, context)
        ],
        expression: temp
      }
    }

    const field = resolveKnownObjectIndex(expression, context)

    if (
      field?.valueType === 'bytes' ||
      field?.valueType === 'array' ||
      field?.valueType === 'map' ||
      field?.valueType === 'set'
    ) {
      const temp = nextCName(context, 'ccjs_value')
      const tag = cRuntimeValueTag(field.valueType)
      registerOwnedValue(context, temp)

      return {
        lines: [
          ...emitPrepareOwnedValueWrite(temp),
          emitStatusCheck(
            `ccjs_object_get(${emitObjectValueReference(field.objectName, context)}, ${cStringLiteral(field.key)}, ${utf8ByteLength(field.key)}, &${temp})`,
            context
          ),
          ...emitRuntimeFieldValueCheck(temp, tag, expression, context)
        ],
        expression: temp
      }
    }

    if (field?.valueType === 'object') {
      const temp = nextCName(context, 'ccjs_value')
      registerOwnedValue(context, temp)

      return {
        lines: [
          ...emitPrepareOwnedValueWrite(temp),
          emitStatusCheck(
            `ccjs_object_get(${emitObjectValueReference(field.objectName, context)}, ${cStringLiteral(field.key)}, ${utf8ByteLength(field.key)}, &${temp})`,
            context
          ),
          ...emitRuntimeFieldValueCheck(temp, 'CCJS_TAG_OBJECT', expression, context)
        ],
        expression: temp
      }
    }

    if (field?.valueType === 'string') {
      const temp = nextCName(context, 'ccjs_value')
      registerOwnedValue(context, temp)

      return {
        lines: [
          ...emitPrepareOwnedValueWrite(temp),
          emitStatusCheck(
            `ccjs_object_get(${emitObjectValueReference(field.objectName, context)}, ${cStringLiteral(field.key)}, ${utf8ByteLength(field.key)}, &${temp})`,
            context
          ),
          ...emitRuntimeFieldValueCheck(temp, 'CCJS_TAG_STRING', expression, context)
        ],
        expression: temp
      }
    }
  }

  if (expression?.type === 'CallExpression' && isManagedRuntimeReturnType(inferExpressionType(expression, context))) {
    const valueType = inferExpressionType(expression, context)
    const collectionCall = emitPreparedCollectionCallExpression(expression, context)

    if (collectionCall != null) {
      return collectionCall
    }

    const classMethodCall = emitPreparedClassMethodCallExpression(expression, context)

    if (classMethodCall != null) {
      return classMethodCall
    }

    const temp = nextCName(context, 'ccjs_value')
    const tag = cRuntimeValueTag(valueType)
    registerOwnedValue(context, temp)
    const call = emitPreparedCallExpression(expression, context)

    return {
      lines: [
        ...call.lines,
        ...emitPrepareOwnedValueWrite(temp),
        `${temp} = ${call.expression};`,
        emitRuntimeValueCheck(temp, tag, context)
      ],
      expression: temp
    }
  }

  const unsupportedType = inferExpressionType(expression, context)
  context.diagnostics.push(
    diagnostic(
      cUnsupportedExpressionCode(unsupportedType),
      unsupportedType === 'function'
        ? 'stored callback values need delayed closure lifetime support and are not supported by the current C backend slice'
        : 'this object field expression is not supported by the current C backend slice',
      expression?.loc
    )
  )

  return {
    lines: [],
    expression: 'ccjs_undefined_value()'
  }
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

function emitRuntimeFieldValueCheck(value, expectedTag, expression, context) {
  if (expression?.nullable === true) {
    return emitRuntimeNullableValueCheck(value, expectedTag, context)
  }

  return [emitRuntimeValueCheck(value, expectedTag, context)].filter(Boolean)
}

function emitCOptionalMemberValueExpression(expression, context) {
  const member = resolveKnownObjectMember(expression, context) ?? resolveObjectExpressionMember(expression)

  if (member == null || !isRuntimeNullableType(member.valueType)) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_OPTIONAL_CHAINING',
        'optional member access for this field is not supported by the current C backend slice',
        expression.loc
      )
    )

    return {
      lines: [],
      expression: 'ccjs_undefined_value()'
    }
  }

  return emitCOptionalObjectReadValueExpression(expression.object, member.valueType, context, (temp) =>
    member.key == null
      ? `ccjs_object_get_known(${temp}, ${member.index}, &`
      : `ccjs_object_get(${temp}, ${cStringLiteral(member.key)}, ${utf8ByteLength(member.key)}, &`
  )
}

function emitCOptionalIndexValueExpression(expression, context) {
  const field = resolveKnownObjectIndex(expression, context) ?? resolveObjectExpressionIndex(expression)

  if (field != null) {
    if (!isRuntimeNullableType(field.valueType)) {
      context.diagnostics.push(
        diagnostic(
          'CCJS_C_OPTIONAL_CHAINING',
          'optional object index access for this field is not supported by the current C backend slice',
          expression.loc
        )
      )

      return {
        lines: [],
        expression: 'ccjs_undefined_value()'
      }
    }

    return emitCOptionalObjectReadValueExpression(expression.object, field.valueType, context, (temp) =>
      field.key == null
        ? `ccjs_object_get_known(${temp}, ${field.index}, &`
        : `ccjs_object_get(${temp}, ${cStringLiteral(field.key)}, ${utf8ByteLength(field.key)}, &`
    )
  }

  const element = resolveOptionalRuntimeArrayIndex(expression, context)

  if (element != null) {
    if (!isRuntimeNullableType(element.valueType)) {
      context.diagnostics.push(
        diagnostic(
          'CCJS_C_OPTIONAL_CHAINING',
          'optional array index access for this element type is not supported by the current C backend slice',
          expression.loc
        )
      )

      return {
        lines: [],
        expression: 'ccjs_undefined_value()'
      }
    }

    return emitCOptionalArrayIndexValueExpression(expression.object, element, context)
  }

  context.diagnostics.push(
    diagnostic(
      'CCJS_C_OPTIONAL_CHAINING',
      'optional index access is not supported by the current C backend slice',
      expression.loc
    )
  )

  return {
    lines: [],
    expression: 'ccjs_undefined_value()'
  }
}

function emitCOptionalObjectReadValueExpression(objectExpression, valueType, context, emitGetPrefix) {
  const object = emitCValueExpression(objectExpression, context)
  const temp = nextCName(context, 'ccjs_optional_value')
  const expectedTag = cRuntimeValueTag(valueType)
  registerOwnedValue(context, temp)

  return {
    lines: [
      ...object.lines,
      ...emitPrepareOwnedValueWrite(temp),
      `if (${object.expression}.tag == CCJS_TAG_NULL) {`,
      `  ${temp} = ccjs_null_value();`,
      '} else {',
      `  ${emitRuntimeTypeCheck(`${object.expression}.tag != CCJS_TAG_OBJECT || ${object.expression}.as.ref == 0`, context)}`,
      `  ${emitStatusCheck(`${emitGetPrefix(object.expression)}${temp})`, context)}`,
      ...emitRuntimeNullableValueCheck(temp, expectedTag, context).map((line) => `  ${line}`),
      '}'
    ],
    expression: temp
  }
}

function emitCOptionalArrayIndexValueExpression(arrayExpression, element, context) {
  const array = emitCValueExpression(arrayExpression, context)
  const temp = nextCName(context, 'ccjs_optional_value')
  const expectedTag = cRuntimeValueTag(element.valueType)
  registerOwnedValue(context, temp)

  return {
    lines: [
      ...array.lines,
      ...emitPrepareOwnedValueWrite(temp),
      `if (${array.expression}.tag == CCJS_TAG_NULL) {`,
      `  ${temp} = ccjs_null_value();`,
      '} else {',
      `  ${emitRuntimeTypeCheck(`${array.expression}.tag != CCJS_TAG_ARRAY || ${array.expression}.as.ref == 0`, context)}`,
      `  ${emitStatusCheck(`ccjs_array_get(${array.expression}, ${element.index}, &${temp})`, context)}`,
      ...emitRuntimeNullableValueCheck(temp, expectedTag, context).map((line) => `  ${line}`),
      '}'
    ],
    expression: temp
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

function emitCStringConcatValueExpression(expression, context) {
  const left = emitPreparedStringBytesOperand(expression.left, context)
  const right = emitPreparedStringBytesOperand(expression.right, context)
  const temp = nextCName(context, 'ccjs_value')
  registerOwnedValue(context, temp)

  return {
    lines: [
      ...left.lines,
      ...right.lines,
      ...emitPrepareOwnedValueWrite(temp),
      emitStatusCheck(
        `ccjs_string_concat_parts(&ccjs_default_allocator, ${left.bytes}, ${left.length}, ${right.bytes}, ${right.length}, &${temp})`,
        context
      )
    ],
    expression: temp
  }
}

function emitCTemplateLiteralValueExpression(expression, context) {
  const parts = parseTemplateLiteralParts(expression.raw, context, expression.loc)
  const operands = parts
    .map((part) => {
      if (part.type === 'text') {
        return {
          lines: [],
          bytes: cStringLiteral(part.value),
          length: `${utf8ByteLength(part.value)}`
        }
      }

      const placeholder = parseTemplatePlaceholderExpression(part.value, part.loc, context)

      return placeholder == null ? null : emitPreparedTemplatePlaceholderBytesOperand(placeholder, context)
    })
    .filter((operand) => operand != null)

  if (operands.length === 0) {
    const temp = nextCName(context, 'ccjs_value')
    registerOwnedValue(context, temp)

    return {
      lines: [
        ...emitPrepareOwnedValueWrite(temp),
        emitStatusCheck(`ccjs_string_from_literal(&ccjs_default_allocator, "", 0, &${temp})`, context)
      ],
      expression: temp
    }
  }

  const lines = operands.flatMap((operand) => operand.lines)

  if (operands.length === 1) {
    const [operand] = operands
    const temp = nextCName(context, 'ccjs_value')
    registerOwnedValue(context, temp)

    return {
      lines: [
        ...lines,
        ...emitPrepareOwnedValueWrite(temp),
        emitStatusCheck(
          `ccjs_string_from_literal(&ccjs_default_allocator, ${operand.bytes}, ${operand.length}, &${temp})`,
          context
        )
      ],
      expression: temp
    }
  }

  let current = operands[0]
  let currentValue = ''

  for (const operand of operands.slice(1)) {
    const temp = nextCName(context, 'ccjs_value')
    registerOwnedValue(context, temp)

    if (currentValue !== '') {
      const string = nextCName(context, 'ccjs_template_string')

      lines.push(`ccjs_string* ${string} = (ccjs_string*)${currentValue}.as.ref;`)
      current = {
        lines: [],
        bytes: `${string}->bytes`,
        length: `${string}->len`
      }
    }

    lines.push(
      ...emitPrepareOwnedValueWrite(temp),
      emitStatusCheck(
        `ccjs_string_concat_parts(&ccjs_default_allocator, ${current.bytes}, ${current.length}, ${operand.bytes}, ${operand.length}, &${temp})`,
        context
      )
    )

    currentValue = temp
  }

  return {
    lines,
    expression: currentValue
  }
}

function emitPreparedTemplatePlaceholderBytesOperand(expression, context) {
  const type = inferExpressionType(expression, context)

  if (type === 'string') {
    return emitPreparedStringBytesOperand(expression, context, 'ccjs_template_string')
  }

  if (type === 'number' || type === 'boolean' || type === 'null') {
    const value = emitCStringConversionValueExpression(
      {
        type: 'CallExpression',
        callee: {
          type: 'Reference',
          path: ['String'],
          loc: expression.loc
        },
        args: [expression],
        loc: expression.loc
      },
      context
    )
    const string = nextCName(context, 'ccjs_template_string')

    return {
      lines: [...value.lines, `ccjs_string* ${string} = (ccjs_string*)${value.expression}.as.ref;`],
      bytes: `${string}->bytes`,
      length: `${string}->len`
    }
  }

  context.diagnostics.push(
    diagnostic(
      cUnsupportedExpressionCode(type),
      'template placeholders currently support string, number, boolean and null expressions in C',
      expression?.loc
    )
  )

  return {
    lines: [],
    bytes: '""',
    length: '0'
  }
}

function emitCStringConversionValueExpression(expression, context) {
  const [arg] = expression.args
  const type = inferExpressionType(arg, context)
  const temp = nextCName(context, 'ccjs_value')
  registerOwnedValue(context, temp)

  if (type === 'string') {
    const value = emitPreparedStringBytesOperand(arg, context, 'ccjs_string_conversion')

    return {
      lines: [
        ...value.lines,
        ...emitPrepareOwnedValueWrite(temp),
        emitStatusCheck(
          `ccjs_string_from_literal(&ccjs_default_allocator, ${value.bytes}, ${value.length}, &${temp})`,
          context
        )
      ],
      expression: temp
    }
  }

  if (type === 'null') {
    return {
      lines: [
        ...emitPrepareOwnedValueWrite(temp),
        emitStatusCheck(`ccjs_string_from_literal(&ccjs_default_allocator, "null", 4, &${temp})`, context)
      ],
      expression: temp
    }
  }

  const value = emitPreparedNumberExpression(arg, context)
  const helper =
    type === 'boolean'
      ? `ccjs_string_from_bool(&ccjs_default_allocator, (${value.expression}) != 0, &${temp})`
      : `ccjs_string_from_number(&ccjs_default_allocator, ${value.expression}, &${temp})`

  return {
    lines: [...value.lines, ...emitPrepareOwnedValueWrite(temp), emitStatusCheck(helper, context)],
    expression: temp
  }
}

function emitCNumberConversionValueExpression(expression, context) {
  if (!isNumberConversionCall(expression, context)) {
    return null
  }

  const value = emitPreparedStringBytesOperand(expression.args[0], context, 'ccjs_number_conversion')
  const temp = nextCName(context, 'ccjs_value')
  registerOwnedValue(context, temp)

  return {
    lines: [
      ...value.lines,
      ...emitPrepareOwnedValueWrite(temp),
      emitStatusCheck(`ccjs_string_to_number(${value.bytes}, ${value.length}, &${temp})`, context)
    ],
    expression: temp
  }
}

function emitCStringTrimValueExpression(expression, context) {
  const value = emitPreparedStringBytesOperand(expression.callee.object, context, 'ccjs_trim_string')
  const temp = nextCName(context, 'ccjs_value')
  registerOwnedValue(context, temp)

  return {
    lines: [
      ...value.lines,
      ...emitPrepareOwnedValueWrite(temp),
      emitStatusCheck(
        `ccjs_string_trim_parts(&ccjs_default_allocator, ${value.bytes}, ${value.length}, &${temp})`,
        context
      )
    ],
    expression: temp
  }
}

function emitCStringSliceValueExpression(expression, context) {
  const value = emitPreparedStringBytesOperand(expression.callee.object, context, 'ccjs_slice_string')
  const start = emitPreparedNumberExpression(expression.args[0], context)
  const lengthName = nextCName(context, 'ccjs_slice_length')
  const startRaw = nextCName(context, 'ccjs_slice_start_raw')
  const startIndex = nextCName(context, 'ccjs_slice_start')
  const endRaw = nextCName(context, 'ccjs_slice_end_raw')
  const endIndex = nextCName(context, 'ccjs_slice_end')
  const end =
    expression.args[1] == null
      ? {
          lines: [],
          expression: `((double)${lengthName})`
        }
      : emitPreparedNumberExpression(expression.args[1], context)
  const temp = nextCName(context, 'ccjs_value')
  registerOwnedValue(context, temp)

  return {
    lines: [
      ...value.lines,
      ...start.lines,
      `size_t ${lengthName} = ccjs_string_code_point_length_parts(${value.bytes}, ${value.length});`,
      ...end.lines,
      `double ${startRaw} = ${start.expression};`,
      `double ${endRaw} = ${end.expression};`,
      ...emitSliceIndexNormalizationLines(startRaw, lengthName, startIndex, context, 'ccjs_slice_start'),
      ...emitSliceIndexNormalizationLines(endRaw, lengthName, endIndex, context, 'ccjs_slice_end'),
      `if (${endIndex} < ${startIndex}) ${endIndex} = ${startIndex};`,
      ...emitPrepareOwnedValueWrite(temp),
      emitStatusCheck(
        `ccjs_string_slice_parts(&ccjs_default_allocator, ${value.bytes}, ${value.length}, ${startIndex}, ${endIndex}, &${temp})`,
        context
      )
    ],
    expression: temp
  }
}

function emitSliceIndexNormalizationLines(rawName, lengthName, outName, context, prefix) {
  const integerName = nextCName(context, `${prefix}_integer`)
  const fromEndName = nextCName(context, `${prefix}_from_end`)

  return [
    `size_t ${outName} = 0;`,
    `if (${rawName} != ${rawName}) {`,
    `  ${outName} = 0;`,
    `} else if (${rawName} <= -((double)${lengthName})) {`,
    `  ${outName} = 0;`,
    `} else if (${rawName} >= ((double)${lengthName})) {`,
    `  ${outName} = ${lengthName};`,
    '} else {',
    `  long long ${integerName} = (long long)${rawName};`,
    `  if (${integerName} < 0) {`,
    `    long long ${fromEndName} = (long long)${lengthName} + ${integerName};`,
    `    ${outName} = ${fromEndName} < 0 ? 0 : (size_t)${fromEndName};`,
    '  } else {',
    `    ${outName} = (size_t)${integerName};`,
    '  }',
    '}'
  ]
}

function emitCStringSplitValueExpression(expression, context) {
  const value = emitPreparedStringBytesOperand(expression.callee.object, context, 'ccjs_split_string')
  const separator = emitPreparedStringBytesOperand(expression.args[0], context, 'ccjs_split_separator')
  const temp = nextCName(context, 'ccjs_split_array')
  registerOwnedValue(context, temp)

  return {
    lines: [
      ...value.lines,
      ...separator.lines,
      ...emitPrepareOwnedValueWrite(temp),
      emitStatusCheck(
        `ccjs_string_split_parts(&ccjs_default_allocator, ${value.bytes}, ${value.length}, ${separator.bytes}, ${separator.length}, &${temp})`,
        context
      ),
      emitRuntimeValueCheck(temp, 'CCJS_TAG_ARRAY', context)
    ],
    expression: temp,
    elementType: 'string'
  }
}

function emitPreparedBinaryValueExpression(expression, context) {
  if (isBufferFromCall(expression)) {
    return emitCBufferFromValueExpression(expression, context)
  }

  if (isBufferAllocCall(expression) || isBinaryConstructorExpression(expression)) {
    return emitCBytesAllocValueExpression(expression, context)
  }

  if (isBytesSliceCall(expression, context)) {
    return emitCBytesSliceValueExpression(expression, context)
  }

  if (isBytesToStringCall(expression, context)) {
    return emitCBytesToStringValueExpression(expression, context)
  }

  return null
}

function emitCBufferFromValueExpression(expression, context) {
  const value = emitPreparedStringBytesOperand(expression.args[0], context, 'ccjs_buffer_from')
  const temp = nextCName(context, 'ccjs_bytes')
  registerOwnedValue(context, temp)

  return {
    lines: [
      ...value.lines,
      ...emitPrepareOwnedValueWrite(temp),
      emitStatusCheck(
        `ccjs_bytes_from_data(&ccjs_default_allocator, (const uint8_t*)${value.bytes}, ${value.length}, &${temp})`,
        context
      ),
      emitRuntimeValueCheck(temp, 'CCJS_TAG_BYTES', context)
    ],
    expression: temp
  }
}

function emitCBytesAllocValueExpression(expression, context) {
  const temp = nextCName(context, 'ccjs_bytes')
  registerOwnedValue(context, temp)

  if (isBinaryConstructorExpression(expression) && expression.args[0]?.type === 'ArrayLiteral') {
    const elements = expression.args[0].elements
    const lines = [
      ...emitPrepareOwnedValueWrite(temp),
      emitStatusCheck(`ccjs_bytes_new(&ccjs_default_allocator, ${elements.length}, &${temp})`, context)
    ]

    for (const [index, element] of elements.entries()) {
      const value = emitPreparedNumberExpression(element, context)

      lines.push(...value.lines)
      lines.push(emitStatusCheck(`ccjs_bytes_set(${temp}, ${index}, (uint8_t)(${value.expression}))`, context))
    }

    return {
      lines,
      expression: temp
    }
  }

  if (isBinaryConstructorExpression(expression) && inferExpressionType(expression.args[0], context) !== 'number') {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_JS_GLOBAL',
        'Uint8Array constructor currently supports only length or array literals in C',
        expression.loc
      )
    )

    return {
      lines: [],
      expression: 'ccjs_undefined_value()'
    }
  }

  const size = emitPreparedNumberExpression(expression.args[0], context)

  return {
    lines: [
      ...size.lines,
      ...emitPrepareOwnedValueWrite(temp),
      emitStatusCheck(`ccjs_bytes_new(&ccjs_default_allocator, (size_t)(${size.expression}), &${temp})`, context)
    ],
    expression: temp
  }
}

function emitCBytesSliceValueExpression(expression, context) {
  const receiver = emitCValueExpression(expression.callee.object, context)
  const start = emitPreparedNumberExpression(expression.args[0], context)
  const end = expression.args[1] == null ? null : emitPreparedNumberExpression(expression.args[1], context)
  const lengthName = nextCName(context, 'ccjs_bytes_len')
  const startRaw = nextCName(context, 'ccjs_bytes_start_raw')
  const startIndex = nextCName(context, 'ccjs_bytes_start')
  const endRaw = nextCName(context, 'ccjs_bytes_end_raw')
  const endIndex = nextCName(context, 'ccjs_bytes_end')
  const temp = nextCName(context, 'ccjs_bytes_slice')
  registerOwnedValue(context, temp)

  return {
    lines: [
      ...receiver.lines,
      ...start.lines,
      ...(end == null ? [] : end.lines),
      `size_t ${lengthName} = 0;`,
      emitStatusCheck(`ccjs_bytes_len(${receiver.expression}, &${lengthName})`, context),
      `double ${startRaw} = ${start.expression};`,
      `double ${endRaw} = ${end == null ? `((double)${lengthName})` : end.expression};`,
      ...emitSliceIndexNormalizationLines(startRaw, lengthName, startIndex, context, 'ccjs_bytes_start'),
      ...emitSliceIndexNormalizationLines(endRaw, lengthName, endIndex, context, 'ccjs_bytes_end'),
      `if (${endIndex} < ${startIndex}) ${endIndex} = ${startIndex};`,
      ...emitPrepareOwnedValueWrite(temp),
      emitStatusCheck(`ccjs_bytes_slice(${receiver.expression}, ${startIndex}, ${endIndex}, &${temp})`, context),
      emitRuntimeValueCheck(temp, 'CCJS_TAG_BYTES', context)
    ],
    expression: temp
  }
}

function emitCBytesToStringValueExpression(expression, context) {
  const receiver = emitCValueExpression(expression.callee.object, context)
  const temp = nextCName(context, 'ccjs_bytes_string')
  registerOwnedValue(context, temp)

  return {
    lines: [
      ...receiver.lines,
      ...emitPrepareOwnedValueWrite(temp),
      emitStatusCheck(`ccjs_bytes_to_string(&ccjs_default_allocator, ${receiver.expression}, &${temp})`, context),
      emitRuntimeValueCheck(temp, 'CCJS_TAG_STRING', context)
    ],
    expression: temp
  }
}

function emitPreparedBinaryNumberCallExpression(expression, context) {
  if (expression?.type === 'CallExpression' && expression.binaryRuntimeMethod === 'isBuffer') {
    const value = emitCValueExpression(expression.args[0], context)

    return {
      lines: value.lines,
      expression: `(${value.expression}.tag == CCJS_TAG_BYTES ? 1 : 0)`
    }
  }

  return null
}

function emitPreparedBytesLengthExpression(expression, context) {
  if (
    expression?.type !== 'MemberExpression' ||
    expression.property !== 'length' ||
    inferExpressionType(expression.object, context) !== 'bytes'
  ) {
    return null
  }

  const value = emitCValueExpression(expression.object, context)
  const temp = nextCName(context, 'ccjs_bytes_len')

  return {
    lines: [
      ...value.lines,
      `size_t ${temp} = 0;`,
      emitStatusCheck(`ccjs_bytes_len(${value.expression}, &${temp})`, context)
    ],
    expression: `((double)${temp})`
  }
}

function emitPreparedBytesIndexExpression(expression, context) {
  if (expression?.type !== 'IndexExpression' || inferExpressionType(expression.object, context) !== 'bytes') {
    return null
  }

  const value = emitCValueExpression(expression.object, context)
  const index = emitPreparedNumberExpression(expression.index, context)
  const byte = nextCName(context, 'ccjs_byte')

  return {
    lines: [
      ...value.lines,
      ...index.lines,
      `uint8_t ${byte} = 0;`,
      emitStatusCheck(`ccjs_bytes_get(${value.expression}, (size_t)(${index.expression}), &${byte})`, context)
    ],
    expression: `((double)${byte})`
  }
}

function emitPreparedBytesIndexAssignment(expression, context) {
  if (
    expression?.target?.type !== 'IndexExpression' ||
    inferExpressionType(expression.target.object, context) !== 'bytes'
  ) {
    return null
  }

  const value = emitCValueExpression(expression.target.object, context)
  const index = emitPreparedNumberExpression(expression.target.index, context)
  const byte = emitPreparedNumberExpression(expression.value, context)

  return {
    lines: [
      ...value.lines,
      ...index.lines,
      ...byte.lines,
      emitStatusCheck(
        `ccjs_bytes_set(${value.expression}, (size_t)(${index.expression}), (uint8_t)(${byte.expression}))`,
        context
      )
    ]
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

function parseTemplateLiteralParts(raw, context, loc) {
  const parts: { type: string; value: string; loc?: SourceLocation }[] = []
  let text = ''
  let index = 1
  const end = raw.endsWith('`') ? raw.length - 1 : raw.length
  let line = loc?.line ?? 1
  let column = (loc?.column ?? 1) + 1

  while (index < end) {
    const char = raw[index]

    if (char === '\\') {
      text += raw.slice(index, Math.min(index + 2, end))
      advanceTemplateLocation(char)

      if (index + 1 < end) {
        advanceTemplateLocation(raw[index + 1])
      }

      index += 2
      continue
    }

    if (char === '$' && raw[index + 1] === '{') {
      if (text !== '') {
        parts.push({
          type: 'text',
          value: text
        })
        text = ''
      }

      advanceTemplateLocation('$')
      advanceTemplateLocation('{')
      index += 2

      const placeholderStart = index
      const placeholderLoc = currentTemplateLocation()
      let depth = 0
      let quote: string | null = null

      while (index < end) {
        const current = raw[index]

        if (quote != null) {
          advanceTemplateLocation(current)

          if (current === '\\' && index + 1 < end) {
            index += 1
            advanceTemplateLocation(raw[index])
          } else if (current === quote) {
            quote = null
          }

          index += 1
          continue
        }

        if (current === '"' || current === "'" || current === '`') {
          quote = current
          advanceTemplateLocation(current)
          index += 1
          continue
        }

        if (current === '{') {
          depth += 1
          advanceTemplateLocation(current)
          index += 1
          continue
        }

        if (current === '}') {
          if (depth === 0) {
            break
          }

          depth -= 1
          advanceTemplateLocation(current)
          index += 1
          continue
        }

        advanceTemplateLocation(current)
        index += 1
      }

      if (index >= end) {
        context.diagnostics.push(
          diagnostic('CCJS_C_STRING_EXPR', 'unterminated template placeholder in C template literal', loc)
        )
        return parts
      }

      const placeholder = trimTemplatePlaceholder(raw.slice(placeholderStart, index), placeholderLoc)

      parts.push({
        type: 'placeholder',
        value: placeholder.value,
        loc: placeholder.loc
      })
      advanceTemplateLocation('}')
      index += 1
      continue
    }

    text += char
    advanceTemplateLocation(char)
    index += 1
  }

  if (text !== '') {
    parts.push({
      type: 'text',
      value: text
    })
  }

  return parts

  function currentTemplateLocation(): SourceLocation {
    return {
      ...(loc?.file == null ? {} : { file: loc.file }),
      line,
      column
    }
  }

  function advanceTemplateLocation(char: string): void {
    if (char === '\n') {
      line += 1
      column = 1
      return
    }

    column += 1
  }
}

function trimTemplatePlaceholder(value, loc) {
  let index = 0
  let line = loc.line
  let column = loc.column

  while (index < value.length && /\s/.test(value[index])) {
    if (value[index] === '\n') {
      line += 1
      column = 1
    } else {
      column += 1
    }

    index += 1
  }

  return {
    value: value.slice(index).trimEnd(),
    loc: {
      ...(loc.file == null ? {} : { file: loc.file }),
      line,
      column
    }
  }
}

function collectTemplatePlaceholderExpressions(expression) {
  if (expression?.type !== 'TemplateLiteral' || !expression.raw.includes('${')) {
    return []
  }

  const diagnostics: Diagnostic[] = []
  const parts = parseTemplateLiteralParts(expression.raw, { diagnostics }, expression.loc)
  const result: any[] = []

  for (const part of parts) {
    if (part.type !== 'placeholder' || part.value === '') {
      continue
    }

    const parsed = parseTemplatePlaceholderCaptureExpression(part.value, part.loc)

    if (parsed != null) {
      result.push(parsed)
    }
  }

  return result
}

function parseTemplatePlaceholderCaptureExpression(value, loc) {
  const prefix = 'const __ccjs_template = '

  try {
    const program = parse(tokenize(`${prefix}${value}`, loc?.file == null ? {} : { file: loc.file }))
    const statement = program.body[0]
    const expression = statement?.type === 'VariableDeclaration' ? statement.init : null

    if (program.body.length !== 1 || expression == null) {
      return null
    }

    shiftTemplatePlaceholderExpressionLocations(expression, loc, prefix.length)

    return expression
  } catch (error) {
    if (error instanceof CompileError) {
      return null
    }

    throw error
  }
}

function parseTemplatePlaceholderExpression(value, loc, context) {
  if (value === '') {
    context.diagnostics.push(diagnostic('CCJS_C_STRING_EXPR', 'empty template placeholder in C template literal', loc))
    return null
  }

  const prefix = 'const __ccjs_template = '

  try {
    const program = parse(tokenize(`${prefix}${value}`, loc.file == null ? {} : { file: loc.file }))
    const statement = program.body[0]
    const expression = statement?.type === 'VariableDeclaration' ? statement.init : null

    if (program.body.length !== 1 || expression == null) {
      context.diagnostics.push(
        diagnostic('CCJS_C_STRING_EXPR', 'template placeholder must contain exactly one expression', loc)
      )
      return null
    }

    shiftTemplatePlaceholderExpressionLocations(expression, loc, prefix.length)

    return validateTemplatePlaceholderExpressionReferences(expression, context) ? expression : null
  } catch (error) {
    if (error instanceof CompileError) {
      const first = error.diagnostics[0]

      context.diagnostics.push(
        diagnostic(
          first?.code ?? 'CCJS_C_STRING_EXPR',
          first == null
            ? 'invalid template placeholder expression'
            : `invalid template placeholder expression: ${first.message}`,
          loc
        )
      )

      return null
    }

    throw error
  }
}

function validateTemplatePlaceholderExpressionReferences(expression, context) {
  const reported = new Set<string>()
  let valid = true

  visit(expression, null, '')

  return valid

  function visit(value, parent, key) {
    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item, parent, key)
      }

      return
    }

    if (value == null || typeof value !== 'object') {
      return
    }

    if (value.type === 'Reference') {
      const name = value.path[0]

      if (!isKnownTemplatePlaceholderReference(value, parent, key, context)) {
        const reportKey = `${name}:${value.loc?.line ?? 1}:${value.loc?.column ?? 1}`

        if (!reported.has(reportKey)) {
          reported.add(reportKey)
          context.diagnostics.push(diagnostic('CCJS_UNKNOWN_NAME', `unknown name ${name}`, value.loc))
        }

        valid = false
      }
    }

    for (const [childKey, child] of Object.entries(value)) {
      if (childKey === 'loc' || childKey.endsWith('Loc')) {
        continue
      }

      visit(child, value, childKey)
    }
  }
}

function isKnownTemplatePlaceholderReference(expression, parent, key, context) {
  const name = expression.path[0]

  return (
    context.variables.has(expression.path.join('.')) ||
    context.variables.has(name) ||
    context.functionNames.has(name) ||
    isCJsGlobalRoot(name, context) ||
    (key === 'callee' &&
      parent?.type === 'CallExpression' &&
      expression.path.length === 1 &&
      ['Number', 'String'].includes(name))
  )
}

function shiftTemplatePlaceholderExpressionLocations(value, loc, prefixLength) {
  if (Array.isArray(value)) {
    for (const item of value) {
      shiftTemplatePlaceholderExpressionLocations(item, loc, prefixLength)
    }

    return
  }

  if (value == null || typeof value !== 'object') {
    return
  }

  if (typeof value.line === 'number' && typeof value.column === 'number') {
    const lineOffset = value.line - 1

    value.line = loc.line + lineOffset
    value.column = lineOffset === 0 ? loc.column + value.column - prefixLength - 1 : value.column

    if (loc.file == null) {
      delete value.file
    } else {
      value.file = loc.file
    }
  }

  for (const child of Object.values(value)) {
    shiftTemplatePlaceholderExpressionLocations(child, loc, prefixLength)
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

function emitNumberExpression(expression, context) {
  return emitPreparedNumberExpression(expression, context).expression
}

function emitPreparedNumberExpression(expression, context) {
  const classMethodCall = emitPreparedClassMethodCallExpression(expression, context)

  if (classMethodCall != null && classMethodCall.expression !== '') {
    return classMethodCall
  }

  const fsConstant = cFsRuntimeConstantExpression(expression)

  if (fsConstant != null) {
    return {
      lines: [],
      expression: fsConstant
    }
  }

  if (expression?.bufferRuntimeConstant === 'MAX_LENGTH') {
    return {
      lines: [],
      expression: '((double)((size_t)-1))'
    }
  }

  const pathBooleanCall = emitPreparedPathBooleanCallExpression(expression, context)

  if (pathBooleanCall != null) {
    return pathBooleanCall
  }

  const urlSearchParamsCall = emitPreparedUrlSearchParamsCallExpression(expression, context)

  if (urlSearchParamsCall != null && urlSearchParamsCall.valueType === 'boolean') {
    return urlSearchParamsCall
  }

  const processNumber = emitPreparedProcessNumberExpression(expression, context)

  if (processNumber != null) {
    return processNumber
  }

  if (expression?.type === 'NumberLiteral') {
    return {
      lines: [],
      expression: expression.value
    }
  }

  if (isNarrowedNullableScalarReference(expression, context)) {
    const name = expression.path[0]
    const valueType = context.variables.get(name)

    return {
      lines: [],
      expression: valueType === 'boolean' ? `(${name}.as.boolean ? 1 : 0)` : `${name}.as.number`
    }
  }

  if (isNullableScalarRuntimeExpression(expression, context)) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_NULLISH',
        'nullable scalar values must be narrowed with ?? before scalar use in the current C backend slice',
        expression.loc
      )
    )

    return {
      lines: [],
      expression: '0'
    }
  }

  if (expression?.type === 'Reference') {
    return {
      lines: [],
      expression: emitReference(expression, context)
    }
  }

  if (expression?.type === 'BooleanLiteral') {
    return {
      lines: [],
      expression: expression.value ? '1' : '0'
    }
  }

  if (expression?.type === 'UnaryExpression') {
    const argument = emitPreparedNumberExpression(expression.argument, context)

    return {
      lines: argument.lines,
      expression: `(${expression.operator}${argument.expression})`
    }
  }

  if (expression?.type === 'UpdateExpression') {
    return emitPreparedUpdateExpression(expression, context)
  }

  if (expression?.type === 'BinaryExpression') {
    const scalarNullish = emitPreparedScalarNullishCoalescingExpression(expression, context)

    if (scalarNullish != null) {
      return scalarNullish
    }

    if (isNullishCoalescingExpression(expression)) {
      context.diagnostics.push(
        diagnostic(
          'CCJS_C_NULLISH',
          'nullish coalescing is not supported by the current C backend slice',
          expression.loc
        )
      )

      return {
        lines: [],
        expression: '0'
      }
    }

    const leftType = inferExpressionType(expression.left, context)
    const rightType = inferExpressionType(expression.right, context)
    const nullableNullCompare = emitPreparedNullableNullCompareExpression(expression, context)

    if (nullableNullCompare != null) {
      return nullableNullCompare
    }

    if (['===', '!==', '==', '!='].includes(expression.operator) && leftType === 'string' && rightType === 'string') {
      return emitPreparedStringCompareExpression(expression, context)
    }

    if (leftType === 'string' || rightType === 'string') {
      context.diagnostics.push(
        diagnostic(
          'CCJS_C_STRING_EXPR',
          'string binary expressions are not supported by the current C backend slice',
          expression.loc
        )
      )

      return {
        lines: [],
        expression: '0'
      }
    }

    if (['&&', '||'].includes(expression.operator)) {
      return emitPreparedLogicalExpression(expression, context)
    }

    const left = emitPreparedNumberExpression(expression.left, context)
    const right = emitPreparedNumberExpression(expression.right, context)

    return {
      lines: [...left.lines, ...right.lines],
      expression: `(${left.expression} ${emitCOperator(expression.operator)} ${right.expression})`
    }
  }

  if (expression?.type === 'AssignmentExpression') {
    const value = emitPreparedNumberExpression(expression.value, context)

    return {
      lines: value.lines,
      expression: `(${emitReference(expression.target, context)} = ${value.expression})`
    }
  }

  if (expression?.type === 'CallExpression') {
    const jsonScalarParse = emitPreparedJsonScalarParseExpression(expression, context)

    if (jsonScalarParse != null) {
      return jsonScalarParse
    }

    const binaryCall = emitPreparedBinaryNumberCallExpression(expression, context)

    if (binaryCall != null) {
      return binaryCall
    }

    const cryptoCall = emitPreparedCryptoNumberCallExpression(expression, context, cryptoLoweringDependencies)

    if (cryptoCall != null) {
      return cryptoCall
    }

    const numericCast = emitPreparedNumericCastExpression(expression, context)

    if (numericCast != null) {
      return numericCast
    }

    if (isStringPredicateCall(expression, context)) {
      return emitPreparedStringPredicateCall(expression, context)
    }

    const collectionCall = emitPreparedCollectionCallExpression(expression, context)

    if (collectionCall != null) {
      return collectionCall
    }

    return emitPreparedCallExpression(expression, context)
  }

  if (isMemberAccessExpression(expression)) {
    const dgramAddressPort = emitPreparedDgramAddressPortExpression(expression, context)

    if (dgramAddressPort != null) {
      return dgramAddressPort
    }

    const netAddressPort = emitPreparedNetAddressPortExpression(expression, context)

    if (netAddressPort != null) {
      return netAddressPort
    }

    const stringLength = emitPreparedStringLengthExpression(expression, context)

    if (stringLength != null) {
      return stringLength
    }

    const length = emitPreparedArrayLengthExpression(expression, context)

    if (length != null) {
      return length
    }

    const collectionSize = emitPreparedCollectionSizeExpression(expression, context)

    if (collectionSize != null) {
      return collectionSize
    }

    const bytesLength = emitPreparedBytesLengthExpression(expression, context)

    if (bytesLength != null) {
      return bytesLength
    }

    const member = resolveKnownObjectMember(expression, context)

    if (member != null && ['number', 'boolean'].includes(member.valueType)) {
      return emitPreparedRuntimeNumberValue(
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
      return emitPreparedRuntimeNumberValue(
        element.valueType,
        (temp) => `ccjs_array_get(${element.arrayName}, ${element.index}, &${temp})`,
        context
      )
    }

    const field = resolveKnownObjectIndex(expression, context)

    if (field != null && ['number', 'boolean'].includes(field.valueType)) {
      return emitPreparedRuntimeNumberValue(
        field.valueType,
        (temp) =>
          `ccjs_object_get(${emitObjectValueReference(field.objectName, context)}, ${cStringLiteral(field.key)}, ${utf8ByteLength(field.key)}, &${temp})`,
        context
      )
    }

    const runtimeElement = resolveRuntimeArrayIndex(expression, context)

    if (runtimeElement != null && ['number', 'boolean'].includes(runtimeElement.valueType)) {
      const value = emitPreparedRuntimeArrayIndexValue(expression, runtimeElement, context, 'ccjs_expr_value')

      return {
        lines: value.lines,
        expression:
          runtimeElement.valueType === 'boolean'
            ? `(${value.expression}.as.boolean ? 1 : 0)`
            : `${value.expression}.as.number`
      }
    }

    const bytesIndex = emitPreparedBytesIndexExpression(expression, context)

    if (bytesIndex != null) {
      return bytesIndex
    }
  }

  if (expression?.type === 'AwaitExpression') {
    const valueType = inferExpressionType(expression, context)
    const awaited = emitCAwaitValueExpression(expression, context)

    return {
      lines: awaited.lines,
      expression:
        valueType === 'boolean' ? `(${awaited.expression}.as.boolean ? 1 : 0)` : `${awaited.expression}.as.number`
    }
  }

  if (isOptionalChainExpression(expression)) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_OPTIONAL_CHAINING',
        'optional chaining is not supported by the current C backend slice',
        expression?.loc
      )
    )
    return {
      lines: [],
      expression: '0'
    }
  }

  context.diagnostics.push(
    diagnostic('CCJS_C_NUMBER_EXPR', 'this number expression is not supported by the current C backend slice')
  )

  return {
    lines: [],
    expression: '0'
  }
}

function emitPreparedLogicalExpression(expression, context) {
  const left = emitPreparedNumberExpression(expression.left, context)
  const leftNarrowing = resolveNullableScalarConditionNarrowing(expression.left, context)
  const rightNarrowed = expression.operator === '&&' ? leftNarrowing.trueNames : leftNarrowing.falseNames
  const right = withNullableScalarNarrowing(context, rightNarrowed, () =>
    emitPreparedNumberExpression(expression.right, context)
  )
  const temp = nextCName(context, 'ccjs_logical')

  if (expression.operator === '&&') {
    return {
      lines: [
        ...left.lines,
        `double ${temp} = 0;`,
        `if ${emitCConditionClause(left.expression)} {`,
        ...right.lines.map((line) => `  ${line}`),
        `  ${temp} = ${right.expression};`,
        '}'
      ],
      expression: temp
    }
  }

  return {
    lines: [
      ...left.lines,
      `double ${temp} = 0;`,
      `if ${emitCConditionClause(left.expression)} {`,
      `  ${temp} = 1;`,
      '} else {',
      ...right.lines.map((line) => `  ${line}`),
      `  ${temp} = ${right.expression};`,
      '}'
    ],
    expression: temp
  }
}

function emitPreparedScalarNullishCoalescingExpression(expression, context) {
  if (!canLowerCScalarNullishCoalescingExpression(expression, context)) {
    return null
  }

  const valueType = inferExpressionType(expression, context)
  const expectedTag = cRuntimeValueTag(valueType)
  const left = emitCValueExpression(expression.left, context)
  const right = emitPreparedNumberExpression(expression.right, context)
  const temp = nextCName(context, 'ccjs_nullable_scalar')
  const leftValue = valueType === 'boolean' ? `(${left.expression}.as.boolean ? 1 : 0)` : `${left.expression}.as.number`

  return {
    lines: [
      ...left.lines,
      `double ${temp} = 0;`,
      `if (${left.expression}.tag == CCJS_TAG_NULL) {`,
      ...right.lines.map((line) => `  ${line}`),
      `  ${temp} = ${right.expression};`,
      '} else {',
      `  ${emitRuntimeTypeCheck(`${left.expression}.tag != ${expectedTag}`, context)}`,
      `  ${temp} = ${leftValue};`,
      '}'
    ],
    expression: temp
  }
}

function emitPreparedNullableNullCompareExpression(expression, context) {
  if (!['===', '!==', '==', '!='].includes(expression.operator)) {
    return null
  }

  const nullable = expression.left?.type === 'NullLiteral' ? expression.right : expression.left
  const maybeNull = expression.left?.type === 'NullLiteral' ? expression.left : expression.right

  if (maybeNull?.type !== 'NullLiteral' || !isNullableRuntimeExpression(nullable, context)) {
    return null
  }

  const value = emitCValueExpression(nullable, context)
  const equals = `(${value.expression}.tag == CCJS_TAG_NULL)`

  return {
    lines: value.lines,
    expression: ['===', '=='].includes(expression.operator) ? equals : `(!${equals})`
  }
}

function emitPreparedNumericCastExpression(expression, context) {
  if (!isNumericCastCall(expression, context)) {
    return null
  }

  const cast = expression.callee.path[0]
  const value = emitPreparedNumberExpression(expression.args[0], context)

  if (cast === 'f64') {
    return value
  }

  if (cast === 'f32') {
    const result = nextCName(context, 'ccjs_f32')

    return {
      lines: [...value.lines, `double ${result} = (double)((float)${value.expression});`],
      expression: result
    }
  }

  const limits = numericIntegerCastLimits(cast)

  if (limits == null) {
    return null
  }

  const raw = nextCName(context, `ccjs_${cast}_value`)
  const truncated = nextCName(context, `ccjs_${cast}_truncated`)
  const result = nextCName(context, `ccjs_${cast}`)

  return {
    lines: [
      ...value.lines,
      `double ${raw} = ${value.expression};`,
      emitRuntimeTypeCheck(`${raw} != ${raw} || (${raw} - ${raw}) != 0`, context),
      emitRuntimeTypeCheck(`${raw} <= ${limits.preMin} || ${raw} >= ${limits.preMax}`, context),
      `long long ${truncated} = (long long)${raw};`,
      emitRuntimeTypeCheck(`${truncated} < ${limits.min}LL || ${truncated} > ${limits.max}LL`, context),
      `double ${result} = (double)${truncated};`
    ],
    expression: result
  }
}

function numericIntegerCastLimits(cast) {
  if (cast === 'i32') {
    return {
      preMin: '-2147483649.0',
      preMax: '2147483648.0',
      min: '-2147483648',
      max: '2147483647'
    }
  }

  if (cast === 'u32') {
    return {
      preMin: '-1.0',
      preMax: '4294967296.0',
      min: '0',
      max: '4294967295'
    }
  }

  if (cast === 'u64') {
    return {
      preMin: '-1.0',
      preMax: '9007199254740992.0',
      min: '0',
      max: '9007199254740991'
    }
  }

  return null
}

function emitPreparedUpdateExpression(expression, context) {
  const reference = emitReference(expression.argument, context)
  const operator = expression.operator === '--' ? '--' : '++'

  if (expression.prefix !== false) {
    return {
      lines: [],
      expression: `(${operator}${reference})`
    }
  }

  const previous = nextCName(context, 'ccjs_update_previous')

  return {
    lines: [`double ${previous} = ${reference};`, `${reference}${operator};`],
    expression: previous
  }
}

function emitPreparedRuntimeNumberValue(valueType, emitGetCall, context) {
  const value = nextCName(context, 'ccjs_expr_value')
  registerOwnedValue(context, value)

  return {
    lines: [...emitPrepareOwnedValueWrite(value), emitStatusCheck(emitGetCall(value), context)],
    expression: valueType === 'boolean' ? `(${value}.as.boolean ? 1 : 0)` : `${value}.as.number`
  }
}

function emitCExpression(expression, context) {
  if (isNullishCoalescingExpression(expression)) {
    context.diagnostics.push(
      diagnostic('CCJS_C_NULLISH', 'nullish coalescing is not supported by the current C backend slice', expression.loc)
    )
    return '0'
  }

  const type = inferExpressionType(expression, context)

  if (type === 'string') {
    return emitStringExpression(expression, context)
  }

  if (type === 'function') {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_FUNCTION_VALUE',
        'function values are not supported by the current C backend slice',
        expression?.loc
      )
    )
    return '0'
  }

  if (type === 'timer') {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_TIMER_HANDLE',
        'timer handles can only be stored or passed to clear timer functions in the current C backend slice',
        expression?.loc
      )
    )
    return '0'
  }

  if (type === 'crypto-hash') {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_CRYPTO_HASH',
        'crypto hash handles can only be stored or used through Hash.update() and Hash.digest() in the current C backend slice',
        expression?.loc
      )
    )
    return '0'
  }

  if (type === 'crypto-hmac') {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_CRYPTO_HMAC',
        'crypto hmac handles can only be stored or used through Hmac.update() and Hmac.digest() in the current C backend slice',
        expression?.loc
      )
    )
    return '0'
  }

  if (type === 'optional') {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_OPTIONAL_CHAINING',
        'optional chaining is not supported by the current C backend slice',
        expression?.loc
      )
    )
    return '0'
  }

  if (type === 'js-global') {
    reportCJsGlobalDiagnostic(context.diagnostics, expression?.loc)
    return '0'
  }

  return emitNumberExpression(expression, context)
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
  return `${emitCallee(expression.callee, context)}(${expression.args.map((arg) => emitCExpression(arg, context)).join(', ')})`
}

function emitPreparedCallExpression(expression, context) {
  const mathCall = emitPreparedMathCallExpression(expression, context)

  if (mathCall != null) {
    return mathCall
  }

  const pathStringCall = emitPreparedPathStringCallExpression(expression, context)

  if (pathStringCall != null) {
    return pathStringCall
  }

  const pathBooleanCall = emitPreparedPathBooleanCallExpression(expression, context)

  if (pathBooleanCall != null) {
    return pathBooleanCall
  }

  const fsStatsMethod = emitPreparedFsStatsMethodExpression(expression, context)

  if (fsStatsMethod != null) {
    return fsStatsMethod
  }

  const numberConversion = emitCNumberConversionValueExpression(expression, context)

  if (numberConversion != null) {
    return numberConversion
  }

  const classMethodCall = emitPreparedClassMethodCallExpression(expression, context)

  if (classMethodCall != null) {
    return classMethodCall
  }

  const arrayPopCall = emitPreparedArrayPopCallExpression(expression, context)

  if (arrayPopCall != null) {
    return arrayPopCall
  }

  const arrayMapCall = emitPreparedArrayMapCallExpression(expression, context)

  if (arrayMapCall != null) {
    return arrayMapCall
  }

  const arrayFilterCall = emitPreparedArrayFilterCallExpression(expression, context)

  if (arrayFilterCall != null) {
    return arrayFilterCall
  }

  const arraySortCall = emitPreparedArraySortCallExpression(expression, context)

  if (arraySortCall != null) {
    return arraySortCall
  }

  const collectionCall = emitPreparedCollectionCallExpression(expression, context)

  if (collectionCall != null) {
    return collectionCall
  }

  const cryptoHashCall = emitPreparedCryptoHashCallExpression(expression, context, cryptoLoweringDependencies)

  if (cryptoHashCall != null) {
    return cryptoHashCall
  }

  const cryptoHmacCall = emitPreparedCryptoHmacCallExpression(expression, context, cryptoLoweringDependencies)

  if (cryptoHmacCall != null) {
    return cryptoHmacCall
  }

  const cryptoCall = emitPreparedCryptoCallExpression(expression, context, cryptoLoweringDependencies)

  if (cryptoCall != null) {
    return cryptoCall
  }

  const fsCall = emitPreparedFsCallExpression(expression, context)

  if (fsCall != null) {
    return fsCall
  }

  const fetchHeadersCall = emitPreparedFetchHeadersCallExpression(expression, context)

  if (fetchHeadersCall != null) {
    return fetchHeadersCall
  }

  const urlSearchParamsCall = emitPreparedUrlSearchParamsCallExpression(expression, context)

  if (urlSearchParamsCall != null) {
    return urlSearchParamsCall
  }

  const jsonCall = emitPreparedJsonCallExpression(expression, context)

  if (jsonCall != null) {
    return jsonCall
  }

  const timerCall = emitPreparedTimerCallExpression(expression, context, {
    asValue: true
  })

  if (timerCall != null) {
    return timerCall
  }

  const promise = emitPreparedPromiseStaticExpression(expression, context)

  if (promise != null) {
    return promise
  }

  const promiseMethod = emitPreparedPromiseMethodExpression(expression, context)

  if (promiseMethod != null) {
    return promiseMethod
  }

  const callbackType = resolveRuntimeCallbackCalleeType(expression.callee, context)

  if (callbackType != null) {
    return emitRuntimeCallbackCall(expression, callbackType, context)
  }

  const params = resolveFunctionParams(expression.callee, context)

  if (params == null) {
    return {
      lines: [],
      expression: emitCallExpression(expression, context)
    }
  }

  const prepared = emitPreparedCallArgs(expression, params, context)
  const { lines, args } = prepared

  if (isThrowingFunctionCallee(expression.callee, context)) {
    return emitPreparedThrowingCallExpression(expression, args, lines, context)
  }

  if (isPromiseReturningFunctionCallee(expression.callee, context)) {
    registerEventLoop(context)

    return {
      lines,
      expression: `${emitCallee(expression.callee, context)}(${[emitEventLoopReference(context), ...args].join(', ')})`
    }
  }

  if (isExternalEventLoopFunctionCallee(expression.callee, context)) {
    registerEventLoop(context)

    return {
      lines,
      expression: `${emitCallee(expression.callee, context)}(${[emitEventLoopReference(context), ...args].join(', ')})`
    }
  }

  return {
    lines,
    expression: `${emitCallee(expression.callee, context)}(${args.join(', ')})`
  }
}

function emitPreparedMathCallExpression(expression, context) {
  const method = mathRuntimeMethodName(expression.callee)

  if (method == null) {
    return null
  }

  const args = expression.args.map((arg) => emitPreparedNumberExpression(arg, context))

  return {
    lines: args.flatMap((arg) => arg.lines),
    expression: `ccjs_math_${method}(${args.map((arg) => arg.expression).join(', ')})`
  }
}

function emitPreparedCallArgs(expression, params, context) {
  const lines: string[] = []
  const args: string[] = []

  for (const [index, arg] of expression.args.entries()) {
    if (isNullableScalarParam(params[index])) {
      const value = emitNullableScalarValueExpression(arg, context)

      lines.push(...value.lines)
      args.push(value.expression)
    } else if (isNullableFunctionType(params[index]?.valueType, params[index]?.nullable)) {
      const value = emitNullableFunctionValueExpression(arg, params[index]?.functionType, context)

      lines.push(...value.lines)
      args.push(value.expression)
    } else if (params[index]?.valueType === 'string') {
      const value = emitCValueExpression(arg, context)

      lines.push(...value.lines)
      args.push(value.expression)
    } else if (params[index]?.valueType === 'object') {
      const value = emitCValueExpression(arg, context)

      lines.push(...value.lines)
      args.push(value.expression)
    } else if (
      params[index]?.valueType === 'bytes' ||
      params[index]?.valueType === 'array' ||
      params[index]?.valueType === 'map' ||
      params[index]?.valueType === 'set'
    ) {
      const value = emitCValueExpression(arg, context)

      lines.push(...value.lines)
      args.push(value.expression)
    } else if (params[index]?.valueType === 'function') {
      const runtimeFunctionType = resolveRuntimeFunctionArgumentType(expression.callee, index, params[index], context)

      if (runtimeFunctionType != null) {
        const value = emitRuntimeCallbackValue(arg, runtimeFunctionType, context)

        lines.push(...value.lines)
        args.push(value.expression)
      } else {
        args.push(emitFunctionValueExpression(arg, context))
      }
    } else {
      args.push(emitCExpression(arg, context))
    }
  }

  return {
    lines,
    args
  }
}

function emitPreparedChildProcessCallExpression(expression, context, options: { out?: string; owned?: boolean } = {}) {
  const method = cChildProcessRuntimeMethodName(expression)

  if (method == null) {
    return null
  }

  const command = emitCValueExpression(expression.args[0], context)
  const out = options.out ?? nextCName(context, 'ccjs_child_process_output')
  const lines = [...command.lines, ...emitPrepareOwnedValueWrite(out)]

  if (options.owned !== false) {
    registerOwnedValue(context, out)
  }

  if (method === 'execSync') {
    const childOptions = emitCValueExpression(expression.args[1], context)
    lines.push(...childOptions.lines)
    lines.push(
      emitStatusCheck(
        `ccjs_child_process_exec_sync(&ccjs_default_allocator, ${command.expression}, ${childOptions.expression}, &${out})`,
        context
      )
    )

    return {
      lines,
      expression: out
    }
  }

  const second = expression.args[1]
  const argArray = second?.type === 'ObjectLiteral' ? null : second
  const optionsArg = second?.type === 'ObjectLiteral' ? second : expression.args[2]
  const childOptions =
    optionsArg == null
      ? { lines: [] as string[], expression: 'ccjs_undefined_value()' }
      : emitCValueExpression(optionsArg, context)
  const args =
    argArray?.type === 'ArrayLiteral' ? argArray.elements.map((arg) => emitCValueExpression(arg, context)) : []

  lines.push(...args.flatMap((arg) => arg.lines))
  lines.push(...childOptions.lines)

  if (method === 'spawnSync') {
    const shape = emitChildProcessSpawnSyncResultShape(context)
    context.variables.set(out, 'object')
    registerObjectShape(context, out, expression.shape)
    lines.push(...shape.lines)

    if (args.length === 0) {
      lines.push(
        emitStatusCheck(
          `ccjs_child_process_spawn_sync(&ccjs_default_allocator, ${command.expression}, 0, 0, ${childOptions.expression}, ${shape.expression}, &${out})`,
          context
        )
      )
    } else {
      const argsName = nextCName(context, 'ccjs_child_process_args')

      lines.push(`ccjs_value ${argsName}[] = { ${args.map((arg) => arg.expression).join(', ')} };`)
      lines.push(
        emitStatusCheck(
          `ccjs_child_process_spawn_sync(&ccjs_default_allocator, ${command.expression}, ${argsName}, ${args.length}, ${childOptions.expression}, ${shape.expression}, &${out})`,
          context
        )
      )
    }

    return {
      lines,
      expression: out
    }
  }

  if (args.length === 0) {
    lines.push(
      emitStatusCheck(
        `ccjs_child_process_exec_file_sync(&ccjs_default_allocator, ${command.expression}, 0, 0, ${childOptions.expression}, &${out})`,
        context
      )
    )
  } else {
    const argsName = nextCName(context, 'ccjs_child_process_args')

    lines.push(`ccjs_value ${argsName}[] = { ${args.map((arg) => arg.expression).join(', ')} };`)
    lines.push(
      emitStatusCheck(
        `ccjs_child_process_exec_file_sync(&ccjs_default_allocator, ${command.expression}, ${argsName}, ${args.length}, ${childOptions.expression}, &${out})`,
        context
      )
    )
  }

  return {
    lines,
    expression: out
  }
}

function emitChildProcessSpawnSyncResultShape(context) {
  const shapeName = nextCName(context, 'ccjs_shape_spawn_sync')
  const fieldsName = `${shapeName}_fields`
  const lines = [
    `static const ccjs_field_info ${fieldsName}[] = {`,
    `  { "status", CCJS_FIELD_READONLY },`,
    `  { "stdout", CCJS_FIELD_READONLY },`,
    `  { "stderr", CCJS_FIELD_READONLY },`,
    '};',
    `static const ccjs_shape ${shapeName} = {`,
    '  3,',
    `  ${fieldsName}`,
    '};'
  ]

  return {
    lines,
    expression: `&${shapeName}`
  }
}

function emitPreparedOsConstantExpression(expression, context) {
  const constant = cOsRuntimeConstantName(expression)
  const value = constant == null ? null : cOsRuntimeConstantValue(constant)

  if (value == null) {
    return null
  }

  const out = nextCName(context, 'ccjs_os_constant')
  registerOwnedValue(context, out)

  return {
    lines: [
      ...emitPrepareOwnedValueWrite(out),
      emitStatusCheck(
        `ccjs_string_from_literal(&ccjs_default_allocator, ${cStringLiteral(value)}, ${utf8ByteLength(value)}, &${out})`,
        context
      )
    ],
    expression: out
  }
}

function emitPreparedOsStringCallExpression(expression, context, options: { out?: string; owned?: boolean } = {}) {
  const method = cOsRuntimeMethodName(expression)

  if (method == null) {
    return null
  }

  const out = options.out ?? nextCName(context, 'ccjs_os_value')
  const lines = emitPrepareOwnedValueWrite(out)

  if (options.owned !== false) {
    registerOwnedValue(context, out)
  }

  lines.push(emitStatusCheck(`ccjs_os_${method}(&ccjs_default_allocator, &${out})`, context))

  return {
    lines,
    expression: out
  }
}

function emitPreparedProcessStringExpression(expression, context, options: { out?: string; owned?: boolean } = {}) {
  const method = cProcessRuntimeMethodName(expression)
  const property = cProcessRuntimePropertyName(expression)
  const stringProperty = cProcessRuntimeStringPropertyName(expression)
  const envName = cProcessRuntimeEnvName(expression)

  if (
    method !== 'cwd' &&
    !(property === 'argv' && expression?.type === 'IndexExpression') &&
    stringProperty == null &&
    envName == null
  ) {
    return null
  }

  const out = options.out ?? nextCName(context, 'ccjs_process_string')
  const lines: string[] = []

  if (options.owned !== false) {
    registerOwnedValue(context, out)
  }

  lines.push(...emitPrepareOwnedValueWrite(out))

  if (method === 'cwd') {
    lines.push(emitStatusCheck(`ccjs_process_cwd(&ccjs_default_allocator, &${out})`, context))
  } else if (property === 'argv') {
    const index = emitPreparedNumberExpression(expression.index, context)

    lines.unshift(...index.lines)
    lines.push(
      emitStatusCheck(`ccjs_process_argv(&ccjs_default_allocator, (int)(${index.expression}), &${out})`, context)
    )
  } else if (stringProperty != null) {
    const functionName = cProcessRuntimeStringFunctionName(stringProperty)

    lines.push(emitStatusCheck(`ccjs_process_${functionName}(&ccjs_default_allocator, &${out})`, context))
  } else {
    const name = envName ?? ''

    lines.push(
      emitStatusCheck(
        `ccjs_process_env(&ccjs_default_allocator, ${cStringLiteral(name)}, ${utf8ByteLength(name)}, &${out})`,
        context
      )
    )
  }

  return {
    lines,
    expression: out
  }
}

function emitPreparedProcessNumberExpression(expression, context) {
  const property = cProcessRuntimeNumberPropertyName(expression)

  if (property == null) {
    return null
  }

  if (property === 'argv.length') {
    return {
      lines: [],
      expression: 'ccjs_process_argv_length()'
    }
  }

  if (property === 'pid') {
    return {
      lines: [],
      expression: 'ccjs_process_pid()'
    }
  }

  return {
    lines: [],
    expression: 'ccjs_process_get_exit_code()'
  }
}

function emitProcessExitStatement(expression, context): string[] | null {
  if (cProcessRuntimeMethodName(expression) !== 'exit') {
    return null
  }

  const code =
    expression.args[0] == null
      ? { lines: [] as string[], expression: '0' }
      : emitPreparedNumberExpression(expression.args[0], context)

  return [...code.lines, `ccjs_process_exit((int)(${code.expression}));`]
}

function emitProcessExitCodeAssignment(expression, context): string[] | null {
  if (expression?.type !== 'AssignmentExpression' || cProcessRuntimePropertyName(expression) !== 'exitCode') {
    return null
  }

  const value = emitPreparedNumberExpression(expression.value, context)

  return [...value.lines, `ccjs_process_set_exit_code((int)(${value.expression}));`]
}

function emitPreparedUrlStringCallExpression(expression, context, options: { out?: string; owned?: boolean } = {}) {
  if (cUrlRuntimeMethodName(expression) !== 'fileURLToPath') {
    return null
  }

  const arg = emitCValueExpression(expression.args[0], context)
  const out = options.out ?? nextCName(context, 'ccjs_url_path')

  if (options.owned !== false) {
    registerOwnedValue(context, out)
  }

  return {
    lines: [
      ...arg.lines,
      ...emitPrepareOwnedValueWrite(out),
      emitStatusCheck(`ccjs_url_file_url_to_path(&ccjs_default_allocator, ${arg.expression}, &${out})`, context)
    ],
    expression: out
  }
}

function emitPreparedUrlObjectExpression(expression, context, options: { out?: string; owned?: boolean } = {}) {
  const method = cUrlRuntimeMethodName(expression)

  if (method !== 'pathToFileURL' && method !== 'URL') {
    return null
  }

  const out = options.out ?? nextCName(context, 'ccjs_url_object')
  const input = emitCValueExpression(expression.args[0], context)
  const shape = emitUrlObjectShape(context)
  const lines = [...input.lines, ...shape.lines, ...emitPrepareOwnedValueWrite(out)]

  if (options.owned !== false) {
    registerOwnedValue(context, out)
  }

  context.variables.set(out, 'object')
  registerObjectShape(context, out, expression.shape)

  if (method === 'pathToFileURL') {
    lines.push(
      emitStatusCheck(
        `ccjs_url_path_to_file_url(&ccjs_default_allocator, ${input.expression}, ${shape.expression}, &${out})`,
        context
      )
    )

    return {
      lines,
      expression: out
    }
  }

  const base =
    expression.args[1] == null
      ? { lines: [] as string[], expression: 'ccjs_undefined_value()' }
      : emitCValueExpression(expression.args[1], context)

  lines.push(...base.lines)
  lines.push(
    emitStatusCheck(
      `ccjs_url_new(&ccjs_default_allocator, ${input.expression}, ${base.expression}, ${expression.args[1] == null ? '0' : '1'}, ${shape.expression}, &${out})`,
      context
    )
  )

  return {
    lines,
    expression: out
  }
}

function emitPreparedUrlSearchParamsObjectExpression(
  expression,
  context,
  options: { out?: string; owned?: boolean } = {}
) {
  if (cUrlRuntimeMethodName(expression) !== 'URLSearchParams') {
    return null
  }

  const out = options.out ?? nextCName(context, 'ccjs_url_search_params')
  const init =
    expression.args[0] == null
      ? { lines: [] as string[], expression: 'ccjs_undefined_value()' }
      : emitCValueExpression(expression.args[0], context)
  const shape = emitUrlSearchParamsObjectShape(context)
  const lines = [...init.lines, ...shape.lines, ...emitPrepareOwnedValueWrite(out)]

  if (options.owned !== false) {
    registerOwnedValue(context, out)
  }

  context.variables.set(out, 'object')
  registerObjectShape(context, out, expression.shape)
  lines.push(
    emitStatusCheck(
      `ccjs_url_search_params_new(&ccjs_default_allocator, ${init.expression}, ${shape.expression}, &${out})`,
      context
    )
  )

  return {
    lines,
    expression: out
  }
}

function emitPreparedUrlSearchParamsCallExpression(
  expression,
  context,
  options: { out?: string; owned?: boolean } = {}
) {
  const method = cUrlRuntimeMethodName(expression)

  if (method == null || !method.startsWith('URLSearchParams.')) {
    return null
  }

  const receiver = emitCValueExpression(expression.callee.object, context)
  const name =
    expression.args[0] == null
      ? null
      : emitPreparedStringBytesOperand(expression.args[0], context, 'ccjs_url_param_name')
  const lines = [
    ...receiver.lines,
    emitRuntimeTypeCheck(`${receiver.expression}.tag != CCJS_TAG_OBJECT || ${receiver.expression}.as.ref == 0`, context)
  ]

  if (name != null) {
    lines.push(...name.lines)
  }

  if (method === 'URLSearchParams.has') {
    const out = options.out ?? nextCName(context, 'ccjs_url_param_has')
    lines.push(`int ${out} = 0;`)
    lines.push(
      emitStatusCheck(
        `ccjs_url_search_params_has(${receiver.expression}, ${name?.bytes ?? '""'}, ${name?.length ?? '0'}, &${out})`,
        context
      )
    )

    return {
      lines,
      expression: out,
      valueType: 'boolean'
    }
  }

  if (method === 'URLSearchParams.get' || method === 'URLSearchParams.toString') {
    const out = options.out ?? nextCName(context, 'ccjs_url_param_value')

    if (options.owned !== false) {
      registerOwnedValue(context, out)
    }

    lines.push(...emitPrepareOwnedValueWrite(out))
    lines.push(
      method === 'URLSearchParams.get'
        ? emitStatusCheck(
            `ccjs_url_search_params_get(&ccjs_default_allocator, ${receiver.expression}, ${name?.bytes ?? '""'}, ${name?.length ?? '0'}, &${out})`,
            context
          )
        : emitStatusCheck(
            `ccjs_url_search_params_to_string(&ccjs_default_allocator, ${receiver.expression}, &${out})`,
            context
          )
    )

    return {
      lines,
      expression: out,
      valueType: 'string',
      nullable: method === 'URLSearchParams.get'
    }
  }

  if (method === 'URLSearchParams.delete') {
    lines.push(
      emitStatusCheck(
        `ccjs_url_search_params_delete(&ccjs_default_allocator, ${receiver.expression}, ${name?.bytes ?? '""'}, ${name?.length ?? '0'})`,
        context
      )
    )

    return {
      lines,
      expression: '',
      valueType: 'void'
    }
  }

  const value = emitPreparedStringBytesOperand(expression.args[1], context, 'ccjs_url_param_value')
  lines.push(...value.lines)
  lines.push(
    emitStatusCheck(
      method === 'URLSearchParams.set'
        ? `ccjs_url_search_params_set(&ccjs_default_allocator, ${receiver.expression}, ${name?.bytes ?? '""'}, ${name?.length ?? '0'}, ${value.bytes}, ${value.length})`
        : `ccjs_url_search_params_append(&ccjs_default_allocator, ${receiver.expression}, ${name?.bytes ?? '""'}, ${name?.length ?? '0'}, ${value.bytes}, ${value.length})`,
      context
    )
  )

  return {
    lines,
    expression: '',
    valueType: 'void'
  }
}

function emitUrlObjectShape(context) {
  const shapeName = nextCName(context, 'ccjs_shape_url')
  const fieldsName = `${shapeName}_fields`
  const lines = [`static const ccjs_field_info ${fieldsName}[] = {`]

  for (const field of urlObjectFields) {
    lines.push(`  { ${cStringLiteral(field)}, CCJS_FIELD_READONLY },`)
  }

  lines.push('};')
  lines.push(`static const ccjs_shape ${shapeName} = {`)
  lines.push(`  ${urlObjectFields.length},`)
  lines.push(`  ${fieldsName}`)
  lines.push('};')

  return {
    lines,
    expression: `&${shapeName}`
  }
}

function emitUrlSearchParamsObjectShape(context) {
  const shapeName = nextCName(context, 'ccjs_shape_url_search_params')
  const fieldsName = `${shapeName}_fields`
  const lines = [`static const ccjs_field_info ${fieldsName}[] = {`]

  for (const field of urlSearchParamsObjectFields) {
    lines.push(`  { ${cStringLiteral(field)}, 0 },`)
  }

  lines.push('};')
  lines.push(`static const ccjs_shape ${shapeName} = {`)
  lines.push(`  ${urlSearchParamsObjectFields.length},`)
  lines.push(`  ${fieldsName}`)
  lines.push('};')

  return {
    lines,
    expression: `&${shapeName}`
  }
}

function emitUrlObjectFieldAssignment(expression, context): string[] | null {
  if (expression?.type !== 'AssignmentExpression' || expression.urlRuntimeMethod !== 'URL.setField') {
    return null
  }

  const field = expression.urlRuntimeField
  const fieldIndex = urlObjectFields.indexOf(field)

  if (fieldIndex === -1 || !urlMutableObjectFields.includes(field)) {
    return null
  }

  const object = emitCValueExpression(expression.target.object, context)
  const value = emitCValueExpression(expression.value, context)

  return [
    ...object.lines,
    ...value.lines,
    emitStatusCheck(
      `ccjs_url_set_field(&ccjs_default_allocator, ${object.expression}, ${fieldIndex}, ${value.expression})`,
      context
    )
  ]
}

function emitPreparedPathConstantExpression(expression, context) {
  const constant = cPathRuntimeConstantName(expression)
  const value = constant == null ? null : cPathRuntimeConstantValue(constant)

  if (value == null) {
    return null
  }

  const out = nextCName(context, 'ccjs_path_constant')
  registerOwnedValue(context, out)

  return {
    lines: [
      ...emitPrepareOwnedValueWrite(out),
      emitStatusCheck(
        `ccjs_string_from_literal(&ccjs_default_allocator, ${cStringLiteral(value)}, ${utf8ByteLength(value)}, &${out})`,
        context
      )
    ],
    expression: out
  }
}

function emitPreparedPathObjectCallExpression(expression, context, options: { out?: string; owned?: boolean } = {}) {
  if (cPathRuntimeMethodName(expression) !== 'parse') {
    return null
  }

  const out = options.out ?? nextCName(context, 'ccjs_path_object')
  const input = emitCValueExpression(expression.args[0], context)
  const shape = emitPathParseObjectShape(context)
  const lines = [...input.lines, ...shape.lines, ...emitPrepareOwnedValueWrite(out)]

  if (options.owned !== false) {
    registerOwnedValue(context, out)
  }

  context.variables.set(out, 'object')
  registerObjectShape(context, out, expression.shape)

  lines.push(
    emitStatusCheck(
      `ccjs_path_parse(&ccjs_default_allocator, ${input.expression}, ${shape.expression}, &${out})`,
      context
    )
  )

  return {
    lines,
    expression: out
  }
}

function emitPathParseObjectShape(context) {
  const shapeName = nextCName(context, 'ccjs_shape_path_parse')
  const fieldsName = `${shapeName}_fields`
  const lines = [`static const ccjs_field_info ${fieldsName}[] = {`]

  for (const field of pathParseObjectFields) {
    lines.push(`  { ${cStringLiteral(field)}, CCJS_FIELD_READONLY },`)
  }

  lines.push('};')
  lines.push(`static const ccjs_shape ${shapeName} = {`)
  lines.push(`  ${pathParseObjectFields.length},`)
  lines.push(`  ${fieldsName}`)
  lines.push('};')

  return {
    lines,
    expression: `&${shapeName}`
  }
}

function emitPreparedPathStringCallExpression(expression, context, options: { out?: string; owned?: boolean } = {}) {
  const method = cPathRuntimeMethodName(expression)

  if (method == null || method === 'isAbsolute' || method === 'parse') {
    return null
  }

  const out = options.out ?? nextCName(context, 'ccjs_path_value')
  const lines: string[] = []

  if (options.owned !== false) {
    registerOwnedValue(context, out)
  }

  if (method === 'join' || method === 'resolve') {
    const args = expression.args.map((arg) => emitCValueExpression(arg, context))

    lines.push(...args.flatMap((arg) => arg.lines))
    lines.push(...emitPrepareOwnedValueWrite(out))

    if (args.length === 0) {
      lines.push(emitStatusCheck(`ccjs_path_${method}(&ccjs_default_allocator, 0, 0, &${out})`, context))
    } else {
      const argArray = nextCName(context, 'ccjs_path_args')

      lines.push(`ccjs_value ${argArray}[] = { ${args.map((arg) => arg.expression).join(', ')} };`)
      lines.push(
        emitStatusCheck(`ccjs_path_${method}(&ccjs_default_allocator, ${argArray}, ${args.length}, &${out})`, context)
      )
    }

    return {
      lines,
      expression: out
    }
  }

  if (method === 'format') {
    const object = emitCValueExpression(expression.args[0], context)

    lines.push(...object.lines)
    lines.push(...emitPrepareOwnedValueWrite(out))
    lines.push(emitStatusCheck(`ccjs_path_format(&ccjs_default_allocator, ${object.expression}, &${out})`, context))

    return {
      lines,
      expression: out
    }
  }

  const first = emitCValueExpression(expression.args[0], context)

  lines.push(...first.lines)
  lines.push(...emitPrepareOwnedValueWrite(out))

  if (method === 'basename') {
    const suffix =
      expression.args[1] == null
        ? { lines: [] as string[], expression: 'ccjs_undefined_value()' }
        : emitCValueExpression(expression.args[1], context)

    lines.push(...suffix.lines)
    lines.push(
      emitStatusCheck(
        `ccjs_path_basename(&ccjs_default_allocator, ${first.expression}, ${suffix.expression}, ${expression.args[1] == null ? '0' : '1'}, &${out})`,
        context
      )
    )

    return {
      lines,
      expression: out
    }
  }

  if (method === 'relative') {
    const to = emitCValueExpression(expression.args[1], context)

    lines.push(...to.lines)
    lines.push(
      emitStatusCheck(
        `ccjs_path_relative(&ccjs_default_allocator, ${first.expression}, ${to.expression}, &${out})`,
        context
      )
    )

    return {
      lines,
      expression: out
    }
  }

  lines.push(emitStatusCheck(`ccjs_path_${method}(&ccjs_default_allocator, ${first.expression}, &${out})`, context))

  return {
    lines,
    expression: out
  }
}

function emitPreparedPathBooleanCallExpression(expression, context) {
  if (cPathRuntimeMethodName(expression) !== 'isAbsolute') {
    return null
  }

  const value = emitCValueExpression(expression.args[0], context)
  const out = nextCName(context, 'ccjs_path_is_absolute')

  return {
    lines: [
      ...value.lines,
      `int ${out} = 0;`,
      emitStatusCheck(`ccjs_path_is_absolute(${value.expression}, &${out})`, context)
    ],
    expression: `(${out} ? 1 : 0)`
  }
}

function emitPreparedFsCallExpression(expression, context, options: { out?: string; owned?: boolean } = {}) {
  const method = cFsRuntimeExpressionMethod(expression)

  if (method == null || expression?.valueType !== 'promise') {
    return null
  }

  registerEventLoop(context)

  const out = options.out ?? nextCName(context, 'ccjs_promise')
  if (options.owned !== false) {
    registerOwnedPromise(
      context,
      out,
      expression.promiseValueType ??
        ([
          'access',
          'appendFile',
          'appendFileBytes',
          'copyFile',
          'mkdir',
          'rename',
          'rm',
          'symlink',
          'unlink',
          'writeFile',
          'writeFileBytes'
        ].includes(method)
          ? 'void'
          : method === 'readDir' || method === 'readDirDirents'
            ? 'array'
            : method === 'stat' || method === 'lstat'
              ? 'object'
              : method === 'realpath' || method === 'readlink'
                ? 'string'
                : method === 'readFileBytes'
                  ? 'bytes'
                  : 'string'),
      'error'
    )
  }
  const path = emitPreparedStringBytesOperand(expression.args[0], context, 'ccjs_fs_path')
  const lines = [...path.lines]

  if (method === 'readFile') {
    lines.push(
      emitStatusCheck(
        `ccjs_fs_read_file(${emitEventLoopReference(context)}, ${path.bytes}, ${path.length}, &${out})`,
        context
      )
    )

    return {
      lines,
      expression: out,
      rejectionValueType: 'error'
    }
  }

  if (method === 'readFileBytes') {
    lines.push(
      emitStatusCheck(
        `ccjs_fs_read_file_bytes(${emitEventLoopReference(context)}, ${path.bytes}, ${path.length}, &${out})`,
        context
      )
    )

    return {
      lines,
      expression: out,
      rejectionValueType: 'error'
    }
  }

  if (method === 'readDir') {
    lines.push(
      emitStatusCheck(
        `ccjs_fs_read_dir(${emitEventLoopReference(context)}, ${path.bytes}, ${path.length}, &${out})`,
        context
      )
    )

    return {
      lines,
      expression: out,
      rejectionValueType: 'error'
    }
  }

  if (method === 'readDirDirents') {
    lines.push(
      emitStatusCheck(
        `ccjs_fs_read_dir_dirents(${emitEventLoopReference(context)}, ${path.bytes}, ${path.length}, &${out})`,
        context
      )
    )

    return {
      lines,
      expression: out,
      rejectionValueType: 'error'
    }
  }

  if (method === 'stat' || method === 'lstat') {
    lines.push(
      emitStatusCheck(
        `ccjs_fs_${method}(${emitEventLoopReference(context)}, ${path.bytes}, ${path.length}, &${out})`,
        context
      )
    )

    return {
      lines,
      expression: out,
      rejectionValueType: 'error'
    }
  }

  if (method === 'realpath' || method === 'readlink') {
    lines.push(
      emitStatusCheck(
        `ccjs_fs_${method}(${emitEventLoopReference(context)}, ${path.bytes}, ${path.length}, &${out})`,
        context
      )
    )

    return {
      lines,
      expression: out,
      rejectionValueType: 'error'
    }
  }

  if (method === 'access') {
    const mode = emitPreparedFsAccessModeExpression(expression, context)

    lines.push(...mode.lines)
    lines.push(
      emitStatusCheck(
        `ccjs_fs_access(${emitEventLoopReference(context)}, ${path.bytes}, ${path.length}, ${mode.expression}, &${out})`,
        context
      )
    )

    return {
      lines,
      expression: out,
      rejectionValueType: 'error'
    }
  }

  if (method === 'appendFileBytes') {
    const bytes = emitCValueExpression(expression.args[1], context)

    lines.push(...bytes.lines)
    lines.push(emitRuntimeValueCheck(bytes.expression, 'CCJS_TAG_BYTES', context))
    lines.push(
      emitStatusCheck(
        `ccjs_fs_append_file_bytes(${emitEventLoopReference(context)}, ${path.bytes}, ${path.length}, ${bytes.expression}, &${out})`,
        context
      )
    )

    return {
      lines,
      expression: out,
      rejectionValueType: 'error'
    }
  }

  if (method === 'appendFile') {
    const bytes = emitPreparedStringBytesOperand(expression.args[1], context, 'ccjs_fs_bytes')

    lines.push(...bytes.lines)
    lines.push(
      emitStatusCheck(
        `ccjs_fs_append_file(${emitEventLoopReference(context)}, ${path.bytes}, ${path.length}, ${bytes.bytes}, ${bytes.length}, &${out})`,
        context
      )
    )

    return {
      lines,
      expression: out,
      rejectionValueType: 'error'
    }
  }

  if (method === 'copyFile') {
    const destPath = emitPreparedStringBytesOperand(expression.args[1], context, 'ccjs_fs_dest_path')

    lines.push(...destPath.lines)
    lines.push(
      emitStatusCheck(
        `ccjs_fs_copy_file(${emitEventLoopReference(context)}, ${path.bytes}, ${path.length}, ${destPath.bytes}, ${destPath.length}, &${out})`,
        context
      )
    )

    return {
      lines,
      expression: out,
      rejectionValueType: 'error'
    }
  }

  if (method === 'symlink') {
    const linkPath = emitPreparedStringBytesOperand(expression.args[1], context, 'ccjs_fs_link_path')

    lines.push(...linkPath.lines)
    lines.push(
      emitStatusCheck(
        `ccjs_fs_symlink(${emitEventLoopReference(context)}, ${path.bytes}, ${path.length}, ${linkPath.bytes}, ${linkPath.length}, &${out})`,
        context
      )
    )

    return {
      lines,
      expression: out,
      rejectionValueType: 'error'
    }
  }

  if (method === 'mkdir') {
    lines.push(
      emitStatusCheck(
        `ccjs_fs_mkdir(${emitEventLoopReference(context)}, ${path.bytes}, ${path.length}, ${emitFsBooleanFlag(expression, 'fsRecursive')}, &${out})`,
        context
      )
    )

    return {
      lines,
      expression: out,
      rejectionValueType: 'error'
    }
  }

  if (method === 'unlink') {
    lines.push(
      emitStatusCheck(
        `ccjs_fs_unlink(${emitEventLoopReference(context)}, ${path.bytes}, ${path.length}, &${out})`,
        context
      )
    )

    return {
      lines,
      expression: out,
      rejectionValueType: 'error'
    }
  }

  if (method === 'rm') {
    lines.push(
      emitStatusCheck(
        `ccjs_fs_rm(${emitEventLoopReference(context)}, ${path.bytes}, ${path.length}, ${emitFsBooleanFlag(expression, 'fsRecursive')}, ${emitFsBooleanFlag(expression, 'fsForce')}, &${out})`,
        context
      )
    )

    return {
      lines,
      expression: out,
      rejectionValueType: 'error'
    }
  }

  if (method === 'rename') {
    const newPath = emitPreparedStringBytesOperand(expression.args[1], context, 'ccjs_fs_new_path')

    lines.push(...newPath.lines)
    lines.push(
      emitStatusCheck(
        `ccjs_fs_rename(${emitEventLoopReference(context)}, ${path.bytes}, ${path.length}, ${newPath.bytes}, ${newPath.length}, &${out})`,
        context
      )
    )

    return {
      lines,
      expression: out,
      rejectionValueType: 'error'
    }
  }

  if (method === 'writeFileBytes') {
    const bytes = emitCValueExpression(expression.args[1], context)

    lines.push(...bytes.lines)
    lines.push(emitRuntimeValueCheck(bytes.expression, 'CCJS_TAG_BYTES', context))
    lines.push(
      emitStatusCheck(
        `ccjs_fs_write_file_bytes(${emitEventLoopReference(context)}, ${path.bytes}, ${path.length}, ${bytes.expression}, &${out})`,
        context
      )
    )

    return {
      lines,
      expression: out,
      rejectionValueType: 'error'
    }
  }

  const bytes = emitPreparedStringBytesOperand(expression.args[1], context, 'ccjs_fs_bytes')

  lines.push(...bytes.lines)
  lines.push(
    emitStatusCheck(
      `ccjs_fs_write_file(${emitEventLoopReference(context)}, ${path.bytes}, ${path.length}, ${bytes.bytes}, ${bytes.length}, &${out})`,
      context
    )
  )

  return {
    lines,
    expression: out,
    rejectionValueType: 'error'
  }
}

function emitPreparedFetchCallExpression(expression, context, options: { out?: string; owned?: boolean } = {}) {
  const method = cFetchRuntimeExpressionMethod(expression)

  if (method == null || expression?.valueType !== 'promise') {
    return null
  }

  registerEventLoop(context)

  const out = options.out ?? nextCName(context, 'ccjs_promise')
  const valueType = expression.promiseValueType ?? (method === 'text' ? 'string' : 'object')

  if (options.owned !== false) {
    registerOwnedPromise(context, out, valueType, 'error')
  }

  if (method === 'fetch') {
    const url = emitPreparedStringBytesOperand(expression.args[0], context, 'ccjs_fetch_url')
    const init = emitPreparedFetchInitOperand(expression, context)
    const call =
      init.expression === '0'
        ? `ccjs_fetch(${emitEventLoopReference(context)}, ${url.bytes}, ${url.length}, &${out})`
        : `ccjs_fetch_with_init(${emitEventLoopReference(context)}, ${url.bytes}, ${url.length}, ${init.expression}, &${out})`

    return {
      lines: [...url.lines, ...init.lines, emitStatusCheck(call, context)],
      expression: out,
      valueType,
      rejectionValueType: 'error'
    }
  }

  const response = emitCValueExpression(expression.callee.object, context)

  return {
    lines: [
      ...response.lines,
      emitRuntimeTypeCheck(
        `${response.expression}.tag != CCJS_TAG_OBJECT || ${response.expression}.as.ref == 0`,
        context
      ),
      emitStatusCheck(
        `ccjs_fetch_response_text(${emitEventLoopReference(context)}, ${response.expression}, &${out})`,
        context
      )
    ],
    expression: out,
    valueType,
    rejectionValueType: 'error'
  }
}

function emitPreparedFetchHeadersCallExpression(expression, context, options: { out?: string; owned?: boolean } = {}) {
  const method = cFetchRuntimeExpressionMethod(expression)

  if (method !== 'headersGet' && method !== 'headersHas') {
    return null
  }

  const headers = emitCValueExpression(expression.callee.object, context)
  const name = emitPreparedStringBytesOperand(expression.args[0], context, 'ccjs_fetch_header_name')
  const lines = [
    ...headers.lines,
    emitRuntimeTypeCheck(`${headers.expression}.tag != CCJS_TAG_OBJECT || ${headers.expression}.as.ref == 0`, context),
    ...name.lines
  ]

  if (method === 'headersHas') {
    const out = options.out ?? nextCName(context, 'ccjs_fetch_header_has')
    lines.push(`int ${out} = 0;`)
    lines.push(
      emitStatusCheck(`ccjs_fetch_headers_has(${headers.expression}, ${name.bytes}, ${name.length}, &${out})`, context)
    )

    return {
      lines,
      expression: out,
      valueType: 'boolean'
    }
  }

  const out = options.out ?? nextCName(context, 'ccjs_fetch_header_value')

  if (options.owned !== false) {
    registerOwnedValue(context, out)
  }

  lines.push(...emitPrepareOwnedValueWrite(out))
  lines.push(
    emitStatusCheck(
      `ccjs_fetch_headers_get(&ccjs_default_allocator, ${headers.expression}, ${name.bytes}, ${name.length}, &${out})`,
      context
    )
  )

  return {
    lines,
    expression: out,
    valueType: 'string',
    nullable: true
  }
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

function emitPreparedFetchInitOperand(expression, context) {
  const init = expression.args[1]

  if (init == null || init.type !== 'ObjectLiteral') {
    return {
      lines: [],
      expression: '0'
    }
  }

  const lines: string[] = []
  const methodValue = findObjectLiteralPropertyValue(init, 'method')
  const headersValue = findObjectLiteralPropertyValue(init, 'headers')
  const bodyValue = findObjectLiteralPropertyValue(init, 'body')
  const signalValue = findObjectLiteralPropertyValue(init, 'signal')
  const redirectValue = findObjectLiteralPropertyValue(init, 'redirect')
  const method =
    methodValue == null
      ? { lines: [] as string[], bytes: '0', length: '0' }
      : emitPreparedStringBytesOperand(methodValue, context, 'ccjs_fetch_method')
  const redirect =
    redirectValue == null
      ? { lines: [] as string[], bytes: '0', length: '0' }
      : emitPreparedStringBytesOperand(redirectValue, context, 'ccjs_fetch_redirect')
  const body =
    bodyValue == null
      ? { lines: [] as string[], bytes: '0', length: '0' }
      : emitPreparedFetchBodyOperand(bodyValue, context)
  const signal =
    signalValue == null
      ? { lines: [] as string[], expression: 'ccjs_undefined_value()' }
      : emitPreparedFetchSignalOperand(signalValue, context)
  let headersExpression = '0'
  let headerCount = '0'

  lines.push(...method.lines)

  if (headersValue?.type === 'ObjectLiteral' && headersValue.properties.length > 0) {
    const headersName = nextCName(context, 'ccjs_fetch_headers')
    const headerInitializers: string[] = []

    for (const property of headersValue.properties) {
      const value = emitPreparedStringBytesOperand(property.value, context, 'ccjs_fetch_header')

      lines.push(...value.lines)
      headerInitializers.push(
        `{ ${cStringLiteral(String(property.key))}, ${utf8ByteLength(String(property.key))}, ${value.bytes}, ${value.length} }`
      )
    }

    lines.push(
      `ccjs_fetch_header ${headersName}[${headersValue.properties.length}] = { ${headerInitializers.join(', ')} };`
    )
    headersExpression = headersName
    headerCount = `${headersValue.properties.length}`
  }

  lines.push(...body.lines)
  lines.push(...signal.lines)
  lines.push(...redirect.lines)

  const initName = nextCName(context, 'ccjs_fetch_init')

  lines.push(
    `ccjs_fetch_init ${initName} = { ${method.bytes}, ${method.length}, ${headersExpression}, ${headerCount}, ${body.bytes}, ${body.length}, ${signal.expression}, ${redirect.bytes}, ${redirect.length} };`
  )

  return {
    lines,
    expression: `&${initName}`
  }
}

function emitPreparedFetchSignalOperand(expression, context) {
  if (expression?.type === 'MemberExpression' && expression.property === 'signal') {
    const controller = emitCValueExpression(expression.object, context)
    const signal = nextCName(context, 'ccjs_fetch_signal')

    registerOwnedValue(context, signal)

    return {
      lines: [
        ...controller.lines,
        emitRuntimeTypeCheck(
          `${controller.expression}.tag != CCJS_TAG_OBJECT || ${controller.expression}.as.ref == 0`,
          context
        ),
        ...emitPrepareOwnedValueWrite(signal),
        emitStatusCheck(`ccjs_fetch_abort_controller_signal(${controller.expression}, &${signal})`, context)
      ],
      expression: signal
    }
  }

  const signal = emitCValueExpression(expression, context)

  return {
    lines: [
      ...signal.lines,
      emitRuntimeTypeCheck(`${signal.expression}.tag != CCJS_TAG_OBJECT || ${signal.expression}.as.ref == 0`, context)
    ],
    expression: signal.expression
  }
}

function emitPreparedFetchBodyOperand(expression, context) {
  if (inferExpressionType(expression, context) === 'bytes') {
    const value = emitCValueExpression(expression, context)
    const bytes = nextCName(context, 'ccjs_fetch_body')

    return {
      lines: [
        ...value.lines,
        emitRuntimeValueCheck(value.expression, 'CCJS_TAG_BYTES', context),
        `ccjs_bytes* ${bytes} = (ccjs_bytes*)${value.expression}.as.ref;`
      ],
      bytes: `(const char*)${bytes}->bytes`,
      length: `${bytes}->len`
    }
  }

  return emitPreparedStringBytesOperand(expression, context, 'ccjs_fetch_body')
}

function emitPreparedFsSyncValueExpression(expression, context) {
  const method = cFsRuntimeExpressionMethod(expression)

  if (
    method == null ||
    ![
      'lstatSync',
      'readFileBytesSync',
      'readFileSync',
      'readDirDirentsSync',
      'readDirSync',
      'readlinkSync',
      'realpathSync',
      'statSync'
    ].includes(method)
  ) {
    return null
  }

  const valueType = inferExpressionType(expression, context)
  const expectedTag = cRuntimeValueTag(valueType)

  if (expectedTag == null) {
    return null
  }

  const path = emitPreparedStringBytesOperand(expression.args[0], context, 'ccjs_fs_path')
  const out = nextCName(context, 'ccjs_fs_value')
  registerOwnedValue(context, out)
  const call =
    method === 'readFileSync'
      ? `ccjs_fs_read_file_sync(&ccjs_default_allocator, ${path.bytes}, ${path.length}, &${out})`
      : method === 'readFileBytesSync'
        ? `ccjs_fs_read_file_bytes_sync(&ccjs_default_allocator, ${path.bytes}, ${path.length}, &${out})`
        : method === 'readDirSync'
          ? `ccjs_fs_read_dir_sync(&ccjs_default_allocator, ${path.bytes}, ${path.length}, &${out})`
          : method === 'readDirDirentsSync'
            ? `ccjs_fs_read_dir_dirents_sync(&ccjs_default_allocator, ${path.bytes}, ${path.length}, &${out})`
            : method === 'realpathSync'
              ? `ccjs_fs_realpath_sync(&ccjs_default_allocator, ${path.bytes}, ${path.length}, &${out})`
              : method === 'readlinkSync'
                ? `ccjs_fs_readlink_sync(&ccjs_default_allocator, ${path.bytes}, ${path.length}, &${out})`
                : method === 'statSync'
                  ? `ccjs_fs_stat_sync(&ccjs_default_allocator, ${path.bytes}, ${path.length}, &${out})`
                  : `ccjs_fs_lstat_sync(&ccjs_default_allocator, ${path.bytes}, ${path.length}, &${out})`

  return {
    lines: [
      ...path.lines,
      ...emitPrepareOwnedValueWrite(out),
      emitStatusCheck(call, context),
      emitRuntimeValueCheck(out, expectedTag, context)
    ],
    expression: out
  }
}

function emitPreparedFsSyncStatementExpression(expression, context) {
  const method = cFsRuntimeExpressionMethod(expression)

  if (
    method == null ||
    ![
      'accessSync',
      'appendFileBytesSync',
      'appendFileSync',
      'copyFileSync',
      'mkdirSync',
      'renameSync',
      'rmSync',
      'symlinkSync',
      'unlinkSync',
      'writeFileBytesSync',
      'writeFileSync'
    ].includes(method)
  ) {
    return null
  }

  const path = emitPreparedStringBytesOperand(expression.args[0], context, 'ccjs_fs_path')
  const lines = [...path.lines]

  if (method === 'accessSync') {
    const mode = emitPreparedFsAccessModeExpression(expression, context)

    lines.push(...mode.lines)
    lines.push(emitStatusCheck(`ccjs_fs_access_sync(${path.bytes}, ${path.length}, ${mode.expression})`, context))

    return {
      lines
    }
  }

  if (method === 'appendFileBytesSync') {
    const bytes = emitCValueExpression(expression.args[1], context)

    lines.push(...bytes.lines)
    lines.push(emitRuntimeValueCheck(bytes.expression, 'CCJS_TAG_BYTES', context))
    lines.push(
      emitStatusCheck(`ccjs_fs_append_file_bytes_sync(${path.bytes}, ${path.length}, ${bytes.expression})`, context)
    )

    return {
      lines
    }
  }

  if (method === 'appendFileSync') {
    const bytes = emitPreparedStringBytesOperand(expression.args[1], context, 'ccjs_fs_bytes')

    lines.push(...bytes.lines)
    lines.push(
      emitStatusCheck(
        `ccjs_fs_append_file_sync(${path.bytes}, ${path.length}, ${bytes.bytes}, ${bytes.length})`,
        context
      )
    )

    return {
      lines
    }
  }

  if (method === 'copyFileSync') {
    const destPath = emitPreparedStringBytesOperand(expression.args[1], context, 'ccjs_fs_dest_path')

    lines.push(...destPath.lines)
    lines.push(
      emitStatusCheck(
        `ccjs_fs_copy_file_sync(${path.bytes}, ${path.length}, ${destPath.bytes}, ${destPath.length})`,
        context
      )
    )

    return {
      lines
    }
  }

  if (method === 'symlinkSync') {
    const linkPath = emitPreparedStringBytesOperand(expression.args[1], context, 'ccjs_fs_link_path')

    lines.push(...linkPath.lines)
    lines.push(
      emitStatusCheck(
        `ccjs_fs_symlink_sync(${path.bytes}, ${path.length}, ${linkPath.bytes}, ${linkPath.length})`,
        context
      )
    )

    return {
      lines
    }
  }

  if (method === 'mkdirSync') {
    lines.push(
      emitStatusCheck(
        `ccjs_fs_mkdir_sync(${path.bytes}, ${path.length}, ${emitFsBooleanFlag(expression, 'fsRecursive')})`,
        context
      )
    )

    return {
      lines
    }
  }

  if (method === 'unlinkSync') {
    lines.push(emitStatusCheck(`ccjs_fs_unlink_sync(${path.bytes}, ${path.length})`, context))

    return {
      lines
    }
  }

  if (method === 'rmSync') {
    lines.push(
      emitStatusCheck(
        `ccjs_fs_rm_sync(${path.bytes}, ${path.length}, ${emitFsBooleanFlag(expression, 'fsRecursive')}, ${emitFsBooleanFlag(expression, 'fsForce')})`,
        context
      )
    )

    return {
      lines
    }
  }

  if (method === 'renameSync') {
    const newPath = emitPreparedStringBytesOperand(expression.args[1], context, 'ccjs_fs_new_path')

    lines.push(...newPath.lines)
    lines.push(
      emitStatusCheck(
        `ccjs_fs_rename_sync(${path.bytes}, ${path.length}, ${newPath.bytes}, ${newPath.length})`,
        context
      )
    )

    return {
      lines
    }
  }

  if (method === 'writeFileBytesSync') {
    const bytes = emitCValueExpression(expression.args[1], context)

    lines.push(...bytes.lines)
    lines.push(emitRuntimeValueCheck(bytes.expression, 'CCJS_TAG_BYTES', context))
    lines.push(
      emitStatusCheck(`ccjs_fs_write_file_bytes_sync(${path.bytes}, ${path.length}, ${bytes.expression})`, context)
    )

    return {
      lines
    }
  }

  const bytes = emitPreparedStringBytesOperand(expression.args[1], context, 'ccjs_fs_bytes')

  lines.push(...bytes.lines)
  lines.push(
    emitStatusCheck(`ccjs_fs_write_file_sync(${path.bytes}, ${path.length}, ${bytes.bytes}, ${bytes.length})`, context)
  )

  return {
    lines
  }
}

function emitPreparedFsAccessModeExpression(expression, context) {
  if (expression.args[1] == null) {
    return {
      lines: [],
      expression: 'CCJS_FS_F_OK'
    }
  }

  const mode = emitPreparedNumberExpression(expression.args[1], context)

  return {
    lines: mode.lines,
    expression: `((int)${mode.expression})`
  }
}

function emitFsBooleanFlag(expression, field: string) {
  return expression?.[field] === true ? 'true' : 'false'
}

function emitPreparedFsStatsMethodExpression(expression, context) {
  const method = cFsRuntimeExpressionMethod(expression)

  if (method == null || !['direntIsDirectory', 'direntIsFile', 'statsIsDirectory', 'statsIsFile'].includes(method)) {
    return null
  }

  const receiver = emitCValueExpression(expression.callee.object, context)
  const helper =
    method === 'statsIsFile'
      ? 'ccjs_fs_stats_is_file'
      : method === 'statsIsDirectory'
        ? 'ccjs_fs_stats_is_directory'
        : method === 'direntIsFile'
          ? 'ccjs_fs_dirent_is_file'
          : 'ccjs_fs_dirent_is_directory'

  return {
    lines: receiver.lines,
    expression: `(${helper}(${receiver.expression}) ? 1 : 0)`
  }
}

function emitPreparedJsonCallExpression(expression, context, options: { out?: string; owned?: boolean } = {}) {
  const method = cJsonRuntimeCallName(expression?.callee)

  if (method == null) {
    return null
  }

  const out = options.out ?? nextCName(context, 'ccjs_json_value')

  if (options.owned !== false) {
    registerOwnedValue(context, out)
  }

  if (method === 'parse') {
    const text = emitPreparedStringBytesOperand(expression.args[0], context, 'ccjs_json_text')
    const expectedTag = cRuntimeValueTag(inferExpressionType(expression, context))

    return {
      lines: [
        ...text.lines,
        ...emitPrepareOwnedValueWrite(out),
        emitStatusCheck(`ccjs_json_parse(&ccjs_default_allocator, ${text.bytes}, ${text.length}, &${out})`, context),
        ...(expectedTag == null ? [] : [emitRuntimeValueCheck(out, expectedTag, context)])
      ],
      expression: out
    }
  }

  const value = emitCValueExpression(expression.args[0], context)

  return {
    lines: [
      ...value.lines,
      ...emitPrepareOwnedValueWrite(out),
      emitStatusCheck(`ccjs_json_stringify(&ccjs_default_allocator, ${value.expression}, &${out})`, context),
      emitRuntimeValueCheck(out, 'CCJS_TAG_STRING', context)
    ],
    expression: out
  }
}

function emitPreparedJsonScalarParseExpression(expression, context) {
  if (expression?.type !== 'CallExpression' || cJsonRuntimeCallName(expression.callee) !== 'parse') {
    return null
  }

  const valueType = inferExpressionType(expression, context)

  if (valueType !== 'number' && valueType !== 'boolean') {
    return null
  }

  const value = emitPreparedJsonCallExpression(expression, context)

  if (value == null) {
    return null
  }

  return {
    lines: value.lines,
    expression: valueType === 'boolean' ? `(${value.expression}.as.boolean ? 1 : 0)` : `${value.expression}.as.number`
  }
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

function emitPreparedTimerCallExpression(expression, context, options: { out?: string; asValue?: boolean } = {}) {
  const method = expression?.timerRuntimeMethod ?? cTimerRuntimeCallName(expression?.callee)

  if (method == null) {
    return null
  }

  const clearMethod = method.startsWith('clear') ? method : cTimerClearCallName(expression.callee)

  if (clearMethod != null) {
    const handle = emitPreparedTimerHandleExpression(expression.args[0], context)

    return {
      lines: [...handle.lines, `ccjs_loop_clear_timer(${handle.expression});`],
      expression: ''
    }
  }

  if (context.statusReturn && !context.externalEventLoop) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_TIMER_CALLBACK',
        'timer calls inside runtime callbacks need callback loop capture and are not supported by the current C backend slice',
        expression.loc
      )
    )

    return {
      lines: [],
      expression: ''
    }
  }

  if (method === 'setInterval' && options.out == null && options.asValue !== true) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_TIMER_HANDLE',
        'setInterval requires a timer handle so it can be cleared by the current C backend slice',
        expression.loc
      )
    )

    return {
      lines: [],
      expression: ''
    }
  }

  registerEventLoop(context)

  const out = options.out ?? (options.asValue === true ? nextCName(context, 'ccjs_timer_handle') : null)
  const callback = emitRuntimeCallbackValue(expression.args[0], timerCallbackFunctionType(), context)
  const callbackContext = nextCName(context, 'ccjs_timer_ctx')
  const lines = [
    ...(out != null && options.out == null ? [`ccjs_timer_handle* ${out} = 0;`] : []),
    ...callback.lines,
    `ccjs_value* ${callbackContext} = ccjs_default_alloc(0, sizeof(ccjs_value), _Alignof(ccjs_value));`,
    `if (${callbackContext} == 0) ${emitFailureStatement(context)}`,
    `*${callbackContext} = ${callback.expression};`,
    `ccjs_retain(*${callbackContext});`
  ]
  const outArgument = out == null ? '0' : `&${out}`

  if (method === 'setImmediate') {
    lines.push(
      `if (ccjs_loop_queue_immediate(${emitEventLoopReference(context)}, ccjs_timer_callback_run, ${callbackContext}, ccjs_timer_callback_finalize, ${outArgument}) != CCJS_OK) {`
    )
    lines.push(`  ccjs_timer_callback_finalize(${callbackContext});`)
    lines.push(`  ${emitFailureStatement(context)}`)
    lines.push('}')

    return {
      lines,
      expression: out ?? ''
    }
  }

  const delay = emitPreparedNumberExpression(expression.args[1], context)
  const runtimeCall = method === 'setInterval' ? 'ccjs_loop_set_interval' : 'ccjs_loop_set_timeout'

  lines.push(...delay.lines)
  lines.push(
    `if (${runtimeCall}(${emitEventLoopReference(context)}, ${delay.expression}, ccjs_timer_callback_run, ${callbackContext}, ccjs_timer_callback_finalize, ${outArgument}) != CCJS_OK) {`
  )
  lines.push(`  ccjs_timer_callback_finalize(${callbackContext});`)
  lines.push(`  ${emitFailureStatement(context)}`)
  lines.push('}')

  return {
    lines,
    expression: out ?? ''
  }
}

function emitPreparedTimerHandleExpression(expression, context) {
  if (
    expression?.type === 'Reference' &&
    expression.path.length === 1 &&
    context.variables.get(expression.path[0]) === 'timer'
  ) {
    return {
      lines: [],
      expression: emitReference(expression, context)
    }
  }

  if (
    expression?.type === 'CallExpression' &&
    (cTimerStartCallName(expression.callee) != null || expression.timerRuntimeMethod?.startsWith('set'))
  ) {
    return emitPreparedTimerCallExpression(expression, context, {
      asValue: true
    })
  }

  context.diagnostics.push(
    diagnostic('CCJS_C_TIMER_HANDLE', 'timer clear calls require a timer handle value', expression?.loc)
  )

  return {
    lines: [],
    expression: '0'
  }
}

function emitPreparedPromiseStaticExpression(expression, context, options: { out?: string; owned?: boolean } = {}) {
  const method = cPromiseRuntimeCallName(expression?.callee)

  if (method == null || expression?.valueType !== 'promise') {
    return null
  }

  registerEventLoop(context)

  const out = options.out ?? nextCName(context, 'ccjs_promise')
  const rejectionValueType = method === 'reject' ? inferRejectedValueType(expression.args[0], context) : 'unknown'

  if (options.owned !== false) {
    registerOwnedPromise(context, out, expression.promiseValueType ?? 'unknown', rejectionValueType)
  }
  const runtimeCall = method === 'resolve' ? 'ccjs_promise_resolved' : 'ccjs_promise_rejected'
  const value =
    expression.args[0] == null
      ? {
          lines: [],
          expression: 'ccjs_undefined_value()'
        }
      : emitCValueExpression(expression.args[0], context)

  return {
    lines: [
      ...value.lines,
      emitStatusCheck(`${runtimeCall}(${emitEventLoopReference(context)}, ${value.expression}, &${out})`, context)
    ],
    expression: out,
    rejectionValueType
  }
}

function emitPreparedPromiseConstructorExpression(
  expression,
  context,
  options: { out?: string; owned?: boolean } = {}
) {
  if (!isPromiseConstructorExpression(expression) || expression?.valueType !== 'promise') {
    return null
  }

  registerEventLoop(context)

  const out = options.out ?? nextCName(context, 'ccjs_promise')
  const executor = expression.args[0]
  const valueType = expression.promiseValueType ?? 'unknown'
  const rejectionValueType = promiseConstructorRejectionValueType(executor, context)

  if (options.owned !== false) {
    registerOwnedPromise(context, out, valueType, rejectionValueType)
  }

  const lines = [emitStatusCheck(`ccjs_promise_new(${emitEventLoopReference(context)}, &${out})`, context)]

  if (executor?.type !== 'ArrowFunctionExpression') {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_ASYNC',
        'Promise constructor currently supports only arrow-function executors in C',
        expression.loc
      )
    )

    return {
      lines,
      expression: out,
      valueType,
      rejectionValueType
    }
  }

  const resolveName = executor.params[0]?.name ?? null
  const rejectName = executor.params[1]?.name ?? null
  const statements = executor.expressionBody
    ? [
        {
          type: 'ExpressionStatement',
          expression: executor.body,
          loc: executor.body?.loc ?? executor.loc
        }
      ]
    : executor.body

  lines.push(
    ...withPromiseConstructorHandlers(context, resolveName, rejectName, out, () =>
      emitStatementList(statements, context)
    )
  )

  return {
    lines,
    expression: out,
    valueType,
    rejectionValueType
  }
}

function emitPromiseConstructorSettlementCall(expression, context): string[] | null {
  if (
    expression?.type !== 'CallExpression' ||
    expression.callee?.type !== 'Reference' ||
    expression.callee.path.length !== 1
  ) {
    return null
  }

  const handler = context.promiseConstructorHandlers.get(expression.callee.path[0])

  if (handler == null) {
    return null
  }

  if (expression.args.length > 1) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_ASYNC',
        'Promise constructor resolve/reject handlers currently support at most one argument in C',
        expression.loc
      )
    )
  }

  const value =
    expression.args[0] == null
      ? {
          lines: [],
          expression: 'ccjs_undefined_value()'
        }
      : emitCValueExpression(expression.args[0], context)
  const runtimeCall = handler.kind === 'resolve' ? 'ccjs_promise_resolve' : 'ccjs_promise_reject'

  return [...value.lines, emitStatusCheck(`${runtimeCall}(${handler.promise}, ${value.expression})`, context)]
}

function withPromiseConstructorHandlers(context, resolveName, rejectName, promise, callback) {
  const previous = context.promiseConstructorHandlers
  context.promiseConstructorHandlers = new Map(previous)

  if (resolveName != null) {
    context.promiseConstructorHandlers.set(resolveName, {
      kind: 'resolve',
      promise
    })
  }

  if (rejectName != null) {
    context.promiseConstructorHandlers.set(rejectName, {
      kind: 'reject',
      promise
    })
  }

  try {
    return callback()
  } finally {
    context.promiseConstructorHandlers = previous
  }
}

function promiseConstructorRejectionValueType(executor, context) {
  if (executor?.type !== 'ArrowFunctionExpression') {
    return 'unknown'
  }

  const rejectName = executor.params[1]?.name

  if (rejectName == null) {
    return 'unknown'
  }

  const types: string[] = []
  const visit = (node) => {
    if (node == null) {
      return
    }

    if (Array.isArray(node)) {
      node.forEach(visit)
      return
    }

    if (typeof node !== 'object') {
      return
    }

    if (
      node.type === 'CallExpression' &&
      node.callee?.type === 'Reference' &&
      node.callee.path.length === 1 &&
      node.callee.path[0] === rejectName
    ) {
      types.push(inferRejectedValueType(node.args[0], context))
    }

    for (const [key, value] of Object.entries(node)) {
      if (key === 'loc' || key === 'callee') {
        continue
      }

      visit(value)
    }
  }

  visit(executor.expressionBody ? executor.body : executor.body)

  return uniqueValueTypes(types)
}

function uniqueValueTypes(types) {
  const [first] = types

  if (first == null) {
    return 'unknown'
  }

  return types.every((type) => type === first) ? first : 'unknown'
}

function emitPreparedPromiseMethodExpression(expression, context, options: { out?: string; owned?: boolean } = {}) {
  if (!isPromiseMethodCallExpression(expression, context)) {
    return null
  }

  const method = expression.callee.property
  const callback = expression.args[0]
  const wrapper = callback == null ? null : context.promiseChainArrowWrappers.get(callback)

  if (wrapper == null) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_ASYNC',
        'Promise.then/catch currently supports only non-capturing expression-body, single-return block-body, straight-line block-body or simple control-flow block-body arrow callbacks in C',
        expression.loc
      )
    )

    return {
      lines: [],
      expression: '0',
      valueType: expression.promiseValueType ?? 'unknown',
      rejectionValueType: 'unknown'
    }
  }

  const receiver = emitPreparedPromiseExpression(expression.callee.object, context)

  if (receiver == null) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_ASYNC',
        'this Promise chain receiver is not supported by the current C backend slice',
        expression.loc
      )
    )

    return {
      lines: [],
      expression: '0',
      valueType: expression.promiseValueType ?? 'unknown',
      rejectionValueType: 'unknown'
    }
  }

  const out = options.out ?? nextCName(context, 'ccjs_promise')
  const valueType = expression.promiseValueType ?? 'unknown'
  const rejectionValueType = method === 'then' ? (receiver.rejectionValueType ?? 'unknown') : 'unknown'
  const callbackContext = emitPromiseChainCallbackContext(wrapper, context)
  const runtimeCall =
    method === 'then'
      ? `ccjs_promise_chain(${receiver.expression}, ${wrapper.name}, 0, ${callbackContext.expression}, ${callbackContext.finalizer}, &${out})`
      : `ccjs_promise_catch(${receiver.expression}, ${wrapper.name}, ${callbackContext.expression}, ${callbackContext.finalizer}, &${out})`
  const runtimeCallLines =
    callbackContext.expression === '0'
      ? [emitStatusCheck(runtimeCall, context)]
      : [
          `if (${runtimeCall} != CCJS_OK) {`,
          `  ${wrapper.finalizerName}(${callbackContext.expression});`,
          `  ${emitFailureStatement(context)}`,
          '}'
        ]

  if (options.owned !== false) {
    registerOwnedPromise(context, out, valueType, rejectionValueType)
  }

  return {
    lines: [...receiver.lines, ...callbackContext.lines, ...runtimeCallLines],
    expression: out,
    valueType,
    rejectionValueType
  }
}

function emitPromiseChainCallbackContext(wrapper, context) {
  if (!isPromiseChainCallbackWrapperWithContext(wrapper)) {
    return {
      lines: [],
      expression: '0',
      finalizer: '0'
    }
  }

  const lines: string[] = []

  for (const capture of wrapper.captures) {
    if (capture.mutable) {
      context.diagnostics.push(
        diagnostic(
          'CCJS_C_ASYNC',
          'mutable Promise callback captures are outside the current C backend MVP; use const captures or move mutation outside the Promise callback',
          wrapper.expression.loc
        )
      )
    }

    if (!['number', 'boolean', 'string', 'object'].includes(capture.valueType)) {
      context.diagnostics.push(
        diagnostic(
          'CCJS_C_ASYNC',
          'capturing Promise callbacks currently support only const number/boolean/string/object bindings',
          wrapper.expression.loc
        )
      )
    }
  }

  const contextName = nextCName(context, 'ccjs_promise_callback_ctx')

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

  return {
    lines,
    expression: contextName,
    finalizer: wrapper.finalizerName
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
  const promiseExpression = emitPreparedPromiseExpression(expression, context)

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

function emitPreparedPromiseExpression(expression, context, options: { out?: string; owned?: boolean } = {}) {
  const fetchCall = emitPreparedFetchCallExpression(expression, context, options)

  if (fetchCall != null) {
    return {
      ...fetchCall,
      valueType: resolvePromiseExpressionValueType(expression, context) ?? fetchCall.valueType ?? 'unknown'
    }
  }

  const fsCall = emitPreparedFsCallExpression(expression, context, options)

  if (fsCall != null) {
    return {
      ...fsCall,
      valueType: resolvePromiseExpressionValueType(expression, context) ?? 'unknown'
    }
  }

  const promiseConstructor = emitPreparedPromiseConstructorExpression(expression, context, options)

  if (promiseConstructor != null) {
    return {
      ...promiseConstructor,
      valueType: resolvePromiseExpressionValueType(expression, context) ?? promiseConstructor.valueType ?? 'unknown'
    }
  }

  const promiseResolve = emitPreparedPromiseStaticExpression(expression, context, options)

  if (promiseResolve != null) {
    return {
      ...promiseResolve,
      valueType: resolvePromiseExpressionValueType(expression, context) ?? 'unknown'
    }
  }

  const promiseMethod = emitPreparedPromiseMethodExpression(expression, context, options)

  if (promiseMethod != null) {
    return {
      ...promiseMethod,
      valueType: resolvePromiseExpressionValueType(expression, context) ?? 'unknown'
    }
  }

  const asyncPromiseCall = emitPreparedAsyncFunctionPromiseCallExpression(expression, context, options)

  if (asyncPromiseCall != null) {
    return {
      ...asyncPromiseCall,
      valueType: resolvePromiseExpressionValueType(expression, context) ?? 'unknown'
    }
  }

  const promiseCall = emitPreparedPromiseReturningCallExpression(expression, context, options)

  if (promiseCall != null) {
    return promiseCall
  }

  if (expression?.type === 'Reference' && expression.path.length === 1) {
    const name = expression.path[0]

    if (context.variables.get(name) === 'promise') {
      return {
        lines: [],
        expression: name,
        valueType: context.promiseValueTypes.get(name) ?? 'unknown',
        rejectionValueType: context.promiseRejectionValueTypes.get(name) ?? 'unknown'
      }
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

function emitPreparedThrowingCallExpression(expression, args, preparedLines, context) {
  const name = expression.callee.path[0]
  const returnInfo = resolveCFunctionCallReturnInfo(name, context)
  const returnType = returnInfo.returnType
  const returnNullable = returnInfo.returnNullable
  const callArgs = [...args]
  const lines: string[] = [...preparedLines]
  let result = ''

  if (currentErrorTarget(context) == null && !context.throwingFunction) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_THROW',
        'uncaught throwing function calls must be inside try/catch in the current C backend slice',
        expression.loc
      )
    )
  }

  registerErrorChannel(context)
  lines.push(...emitPrepareOwnedValueWrite('ccjs_error'))

  if (returnType !== 'void') {
    if (isManagedRuntimeReturnType(returnType) || (returnNullable && isNullableScalarType(returnType))) {
      result = nextCName(context, 'ccjs_call_result')
      lines.push(`ccjs_value ${result} = ccjs_undefined_value();`)
    } else {
      result = nextCName(context, 'ccjs_call_result')
      lines.push(`double ${result} = 0;`)
    }

    callArgs.push(`&${result}`)
  }

  callArgs.push('&ccjs_error')

  const status = nextCName(context, 'ccjs_call_status')

  lines.push(`ccjs_status ${status} = ${emitCallee(expression.callee, context)}(${callArgs.join(', ')});`)
  lines.push(...emitThrowingCallStatusCheck(status, context))

  return {
    lines,
    expression: result
  }
}

function emitPreparedPromiseReturningCallExpression(
  expression,
  context,
  options: { out?: string; owned?: boolean } = {}
) {
  if (expression?.type !== 'CallExpression' || !isPromiseReturningFunctionCallee(expression.callee, context)) {
    return null
  }

  const out = options.out ?? nextCName(context, 'ccjs_promise')
  const valueType = resolvePromiseReturningFunctionValueType(expression.callee, context)
  const call = emitPreparedCallExpression(expression, context)

  if (options.owned !== false) {
    registerOwnedPromise(context, out, valueType)
  }

  return {
    lines: [...call.lines, `${out} = ${call.expression};`, `if (${out} == 0) ${emitFailureStatement(context)}`],
    expression: out,
    valueType,
    rejectionValueType: 'unknown'
  }
}

function resolveCFunctionCallReturnInfo(name, context) {
  const returnType = context.functionReturnTypes.get(name) ?? 'void'

  if (context.functionAsyncFlags.get(name) === true && returnType === 'promise') {
    return {
      returnType: context.functionReturnPromiseValueTypes.get(name) ?? 'void',
      returnNullable: false
    }
  }

  return {
    returnType,
    returnNullable: context.functionReturnNullables.get(name) === true
  }
}

function emitThrowingCallStatusCheck(status, context) {
  const target = currentErrorTarget(context)
  const lines = [`if (${status} == CCJS_ERR_THROW) {`, '  ccjs_error_active = 1;']

  if (target != null) {
    lines.push(`  goto ${target};`)
  } else if (context.throwingFunction) {
    lines.push('  ccjs_status_result = CCJS_ERR_THROW;')
    lines.push('  goto ccjs_cleanup;')
  } else {
    lines.push(`  ${emitFailureStatement(context)}`)
  }

  lines.push('}')
  lines.push(`if (${status} != CCJS_OK) ${emitFailureStatement(context)}`)

  return lines
}

function isThrowingFunctionCallee(callee, context) {
  return callee?.type === 'Reference' && callee.path.length === 1 && isThrowingFunctionName(callee.path[0], context)
}

function isThrowingFunctionName(name, context) {
  return context.throwingFunctions?.has(name) === true
}

function emitCallee(callee, context) {
  const timeRuntimeCall = cTimeRuntimeCallName(callee)

  if (timeRuntimeCall != null) {
    return timeRuntimeCall
  }

  if (callee.type === 'Reference' && callee.path.length === 1) {
    if (isCJsGlobalRoot(callee.path[0], context)) {
      reportCJsGlobalDiagnostic(context.diagnostics, callee.loc)
      return '_'
    }

    return context.functionNames.get(callee.path[0]) ?? callee.path[0]
  }

  if (usesCJsGlobal(callee, context)) {
    reportCJsGlobalDiagnostic(context.diagnostics, callee.loc)
    return '_'
  }

  context.diagnostics.push(
    diagnostic('CCJS_C_CALL_EXPR', 'this call expression is not supported by the current C backend slice', callee.loc)
  )
  return '_'
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

function isRuntimeArrowCallbackExpression(expression, context) {
  return context.callbackArrowWrappers.get(expression)?.kind === 'arrow'
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

function isNumberConversionCall(expression, context) {
  if (
    expression?.type !== 'CallExpression' ||
    expression.callee.type !== 'Reference' ||
    expression.callee.path.length !== 1 ||
    expression.callee.path[0] !== 'Number' ||
    expression.args.length !== 1
  ) {
    return false
  }

  return inferExpressionType(expression.args[0], context) === 'string'
}

function isNumericCastCall(expression, context) {
  if (
    expression?.type !== 'CallExpression' ||
    expression.callee.type !== 'Reference' ||
    expression.callee.path.length !== 1 ||
    !['i32', 'u32', 'u64', 'f32', 'f64'].includes(expression.callee.path[0]) ||
    expression.args.length !== 1
  ) {
    return false
  }

  return inferExpressionType(expression.args[0], context) === 'number'
}

function emitArraySortVariableDeclaration(statement, sorted, context) {
  registerOwnedValue(context, statement.name)
  context.variables.set(statement.name, 'array')

  const shape = context.arrayShapes.get(sorted.expression)

  if (shape != null) {
    context.arrayShapes.set(
      statement.name,
      shape.map((element) => ({ ...element }))
    )
  } else {
    context.runtimeArrayElementTypes.set(statement.name, statement.arrayElementType ?? sorted.elementType ?? 'unknown')
  }

  return [
    ...sorted.lines,
    ...emitPrepareOwnedValueWrite(statement.name),
    `${statement.name} = ${sorted.expression};`,
    `ccjs_retain(${statement.name});`
  ]
}

function emitArrayFilterVariableDeclaration(statement, filtered, context) {
  registerOwnedValue(context, statement.name)
  context.variables.set(statement.name, 'array')
  context.runtimeArrayElementTypes.set(statement.name, statement.arrayElementType ?? filtered.elementType ?? 'unknown')

  return [
    ...filtered.lines,
    ...emitPrepareOwnedValueWrite(statement.name),
    `${statement.name} = ${filtered.expression};`,
    `ccjs_retain(${statement.name});`
  ]
}

function emitArrayMapVariableDeclaration(statement, mapped, context) {
  registerOwnedValue(context, statement.name)
  context.variables.set(statement.name, 'array')
  context.runtimeArrayElementTypes.set(statement.name, statement.arrayElementType ?? mapped.elementType ?? 'unknown')

  return [
    ...mapped.lines,
    ...emitPrepareOwnedValueWrite(statement.name),
    `${statement.name} = ${mapped.expression};`,
    `ccjs_retain(${statement.name});`
  ]
}

function emitPreparedArraySortCallExpression(expression, context) {
  if (
    expression?.type !== 'CallExpression' ||
    expression.callee.type !== 'MemberExpression' ||
    expression.callee.property !== 'sort' ||
    expression.args.length > 1
  ) {
    return null
  }

  const receiver = emitPreparedArrayReceiver(expression.callee.object, context)

  if (receiver == null) {
    return null
  }

  if (expression.args.length === 1) {
    return emitPreparedArrayComparatorSortCallExpression(expression, receiver, context)
  }

  return {
    lines: [...receiver.lines, emitStatusCheck(`ccjs_array_sort(${receiver.expression})`, context)],
    expression: receiver.expression,
    elementType: receiver.elementType
  }
}

function emitPreparedArrayPushCallExpression(expression, context) {
  if (
    expression?.type !== 'CallExpression' ||
    expression.callee.type !== 'MemberExpression' ||
    expression.callee.property !== 'push' ||
    expression.args.length !== 1
  ) {
    return null
  }

  const receiver = emitPreparedArrayReceiver(expression.callee.object, context)

  if (receiver == null) {
    return null
  }

  const value = emitCValueExpression(expression.args[0], context)

  updatePushedArrayMetadata(expression.callee.object, inferExpressionType(expression.args[0], context), context)

  return {
    lines: [
      ...receiver.lines,
      ...value.lines,
      emitStatusCheck(`ccjs_array_push(${receiver.expression}, ${value.expression})`, context)
    ],
    expression: '',
    elementType: receiver.elementType
  }
}

function emitPreparedArrayPopCallExpression(expression, context, options: { discard?: boolean } = {}) {
  if (
    expression?.type !== 'CallExpression' ||
    expression.callee.type !== 'MemberExpression' ||
    expression.callee.property !== 'pop' ||
    expression.args.length !== 0
  ) {
    return null
  }

  const receiver = emitPreparedArrayReceiver(expression.callee.object, context)

  if (receiver == null) {
    return null
  }

  const value = nextCName(context, 'ccjs_array_pop')
  registerOwnedValue(context, value)
  updatePoppedArrayMetadata(expression.callee.object, context)

  const lines = [
    ...receiver.lines,
    ...emitPrepareOwnedValueWrite(value),
    emitStatusCheck(`ccjs_array_pop(${receiver.expression}, &${value})`, context)
  ]

  if (options.discard === true) {
    lines.push(`ccjs_release(${value});`)
    lines.push(`${value} = ccjs_undefined_value();`)
  }

  return {
    lines,
    expression: value,
    elementType: receiver.elementType
  }
}

function emitPreparedArrayComparatorSortCallExpression(expression, receiver, context) {
  const callback = expression.args[0]
  const returnExpression = resolveArrowReturnExpression(callback)

  if (
    callback?.type !== 'ArrowFunctionExpression' ||
    returnExpression == null ||
    callback.params.length > 2 ||
    !['number', 'boolean', 'string'].includes(receiver.elementType)
  ) {
    return null
  }

  const length = nextCName(context, 'ccjs_sort_length')
  const index = nextCName(context, 'ccjs_sort_index')
  const scan = nextCName(context, 'ccjs_sort_scan')
  const left = nextCName(context, 'ccjs_sort_left')
  const right = nextCName(context, 'ccjs_sort_right')
  const compare = nextCName(context, 'ccjs_sort_compare')

  registerOwnedValue(context, left)
  registerOwnedValue(context, right)

  const body = withVariableScope(context, () => {
    const input = emitPreparedArraySortComparatorInput(callback, receiver, left, right, context)
    const result = emitPreparedNumberExpression(returnExpression, context)

    return [
      ...input,
      ...result.lines,
      `double ${compare} = ${result.expression};`,
      `if (!(${compare} > 0)) break;`,
      emitStatusCheck(`ccjs_array_set(${receiver.expression}, ${scan} - 1, ${right})`, context),
      emitStatusCheck(`ccjs_array_set(${receiver.expression}, ${scan}, ${left})`, context)
    ]
  })

  return {
    lines: [
      ...receiver.lines,
      `size_t ${length} = 0;`,
      emitStatusCheck(`ccjs_array_len(${receiver.expression}, &${length})`, context),
      `for (size_t ${index} = 1; ${index} < ${length}; ${index} += 1) {`,
      `  for (size_t ${scan} = ${index}; ${scan} > 0; ${scan} -= 1) {`,
      ...emitPrepareOwnedValueWrite(left).map((line) => `    ${line}`),
      `    ${emitStatusCheck(`ccjs_array_get(${receiver.expression}, ${scan} - 1, &${left})`, context)}`,
      ...emitPrepareOwnedValueWrite(right).map((line) => `    ${line}`),
      `    ${emitStatusCheck(`ccjs_array_get(${receiver.expression}, ${scan}, &${right})`, context)}`,
      ...body.map((line) => `    ${line}`),
      '  }',
      '}',
      ...emitPrepareOwnedValueWrite(right),
      ...emitPrepareOwnedValueWrite(left)
    ],
    expression: receiver.expression,
    elementType: receiver.elementType
  }
}

function emitPreparedArrayMapCallExpression(expression, context) {
  if (
    expression?.type !== 'CallExpression' ||
    expression.callee.type !== 'MemberExpression' ||
    expression.callee.property !== 'map' ||
    expression.args.length !== 1
  ) {
    return null
  }

  const callback = expression.args[0]
  const callbackBody = resolveArrayCallbackBody(callback)

  if (callback?.type !== 'ArrowFunctionExpression' || callbackBody == null || callback.params.length > 2) {
    return null
  }

  const receiver = emitPreparedArrayReceiver(expression.callee.object, context)

  if (receiver == null || !['number', 'boolean', 'string'].includes(receiver.elementType)) {
    return null
  }

  const out = nextCName(context, 'ccjs_map_array')
  const length = nextCName(context, 'ccjs_map_length')
  const index = nextCName(context, 'ccjs_map_index')
  const value = nextCName(context, 'ccjs_map_value')
  let mappedElementType = expression.arrayElementType ?? 'unknown'

  registerOwnedValue(context, out)
  registerOwnedValue(context, value)

  const body = withVariableScope(context, () => {
    const input = emitPreparedArrayCallbackInput(callback, receiver, value, index, context)

    mappedElementType =
      mappedElementType === 'unknown' ? resolveArrayCallbackReturnType(callbackBody, context) : mappedElementType

    if (!['number', 'boolean', 'string'].includes(mappedElementType)) {
      return null
    }

    return [...input, ...emitArrayMapCallbackBodyLines(callbackBody, mappedElementType, out, context)]
  })

  if (body == null) {
    return null
  }

  return {
    lines: [
      ...receiver.lines,
      ...emitPrepareOwnedValueWrite(out),
      emitStatusCheck(`ccjs_array_new(&ccjs_default_allocator, 0, &${out})`, context),
      `size_t ${length} = 0;`,
      emitStatusCheck(`ccjs_array_len(${receiver.expression}, &${length})`, context),
      `for (size_t ${index} = 0; ${index} < ${length}; ${index} += 1) {`,
      ...emitPrepareOwnedValueWrite(value).map((line) => `  ${line}`),
      `  ${emitStatusCheck(`ccjs_array_get(${receiver.expression}, ${index}, &${value})`, context)}`,
      ...body.map((line) => `  ${line}`),
      '}',
      ...emitPrepareOwnedValueWrite(value)
    ],
    expression: out,
    elementType: mappedElementType
  }
}

function emitPreparedArrayFilterCallExpression(expression, context) {
  if (
    expression?.type !== 'CallExpression' ||
    expression.callee.type !== 'MemberExpression' ||
    expression.callee.property !== 'filter' ||
    expression.args.length !== 1
  ) {
    return null
  }

  const callback = expression.args[0]
  const callbackBody = resolveArrayCallbackBody(callback)

  if (callback?.type !== 'ArrowFunctionExpression' || callbackBody == null || callback.params.length > 2) {
    return null
  }

  const receiver = emitPreparedArrayReceiver(expression.callee.object, context)

  if (receiver == null || !['number', 'boolean', 'string'].includes(receiver.elementType)) {
    return null
  }

  const out = nextCName(context, 'ccjs_filter_array')
  const length = nextCName(context, 'ccjs_filter_length')
  const index = nextCName(context, 'ccjs_filter_index')
  const value = nextCName(context, 'ccjs_filter_value')

  registerOwnedValue(context, out)
  registerOwnedValue(context, value)

  const body = withVariableScope(context, () => {
    const input = emitPreparedArrayCallbackInput(callback, receiver, value, index, context)

    return [...input, ...emitArrayFilterCallbackBodyLines(callbackBody, out, value, context)]
  })

  return {
    lines: [
      ...receiver.lines,
      ...emitPrepareOwnedValueWrite(out),
      emitStatusCheck(`ccjs_array_new(&ccjs_default_allocator, 0, &${out})`, context),
      `size_t ${length} = 0;`,
      emitStatusCheck(`ccjs_array_len(${receiver.expression}, &${length})`, context),
      `for (size_t ${index} = 0; ${index} < ${length}; ${index} += 1) {`,
      ...emitPrepareOwnedValueWrite(value).map((line) => `  ${line}`),
      `  ${emitStatusCheck(`ccjs_array_get(${receiver.expression}, ${index}, &${value})`, context)}`,
      ...body.map((line) => `  ${line}`),
      '}',
      ...emitPrepareOwnedValueWrite(value)
    ],
    expression: out,
    elementType: receiver.elementType
  }
}

function resolveArrowReturnExpression(callback) {
  if (callback?.type !== 'ArrowFunctionExpression') {
    return null
  }

  if (callback.expressionBody) {
    return callback.body
  }

  const statements = Array.isArray(callback.body)
    ? callback.body
    : callback.body?.type === 'BlockStatement'
      ? callback.body.body
      : null

  if (statements == null || statements.length !== 1) {
    return null
  }

  const statement = statements[0]

  return statement?.type === 'ReturnStatement' ? (statement.argument ?? null) : null
}

function resolveArrayCallbackBody(callback) {
  const returnExpression = resolveArrowReturnExpression(callback)

  if (returnExpression != null) {
    return {
      kind: 'prepared-return',
      returnExpression
    }
  }

  if (callback?.type !== 'ArrowFunctionExpression' || callback.expressionBody) {
    return null
  }

  const statements = Array.isArray(callback.body)
    ? callback.body
    : callback.body?.type === 'BlockStatement'
      ? callback.body.body
      : null

  if (!canLowerArrayCallbackStatementList(statements)) {
    return null
  }

  return {
    kind: 'statement-list',
    statements
  }
}

function canLowerArrayCallbackStatementList(statements) {
  if (statements == null || statements.length === 0) {
    return false
  }

  return statements.every((statement, index) => {
    if (index === statements.length - 1) {
      return canLowerArrayCallbackTerminalStatement(statement)
    }

    return canLowerArrayCallbackEarlyReturnStatement(statement)
  })
}

function canLowerArrayCallbackTerminalStatement(statement) {
  if (statement?.type === 'ReturnStatement') {
    return statement.argument != null
  }

  if (statement?.type === 'BlockStatement') {
    return canLowerArrayCallbackStatementList(statement.body)
  }

  if (statement?.type !== 'IfStatement' || statement.alternate == null) {
    return false
  }

  return (
    canLowerArrayCallbackTerminalStatement(statement.consequent) &&
    canLowerArrayCallbackTerminalStatement(statement.alternate)
  )
}

function canLowerArrayCallbackReturnStatement(statement) {
  if (statement?.type === 'ReturnStatement') {
    return statement.argument != null
  }

  return false
}

function canLowerArrayCallbackEarlyReturnStatement(statement) {
  if (statement?.type === 'BlockStatement') {
    return canLowerArrayCallbackStatementList(statement.body)
  }

  if (statement?.type !== 'IfStatement') {
    return false
  }

  return (
    canLowerArrayCallbackBranch(statement.consequent) &&
    (statement.alternate == null || canLowerArrayCallbackBranch(statement.alternate))
  )
}

function canLowerArrayCallbackBranch(statement) {
  if (canLowerArrayCallbackReturnStatement(statement)) {
    return true
  }

  if (statement?.type === 'BlockStatement') {
    return canLowerArrayCallbackStatementList(statement.body)
  }

  return canLowerArrayCallbackEarlyReturnStatement(statement)
}

function resolveArrayCallbackReturnType(body, context) {
  const expressions = collectArrayCallbackReturnExpressions(body)
  const firstType = expressions.length === 0 ? 'unknown' : inferExpressionType(expressions[0], context)

  if (firstType === 'unknown') {
    return 'unknown'
  }

  return expressions.every((expression) => inferExpressionType(expression, context) === firstType)
    ? firstType
    : 'unknown'
}

function collectArrayCallbackReturnExpressions(body) {
  if (body.kind === 'prepared-return') {
    return [body.returnExpression]
  }

  const expressions: any[] = []
  const visitStatement = (statement) => {
    if (statement == null) {
      return
    }

    if (statement.type === 'ReturnStatement') {
      expressions.push(statement.argument)
      return
    }

    if (statement.type === 'BlockStatement') {
      statement.body.forEach(visitStatement)
      return
    }

    if (statement.type === 'IfStatement') {
      visitStatement(statement.consequent)
      visitStatement(statement.alternate)
    }
  }

  body.statements.forEach(visitStatement)

  return expressions.filter(Boolean)
}

function emitArrayMapCallbackBodyLines(body, elementType, out, context) {
  const emitReturn = (expression) => emitArrayMapReturnLines(expression, elementType, out, context)

  return emitArrayCallbackBodyLines(body, emitReturn, context)
}

function emitArrayFilterCallbackBodyLines(body, out, value, context) {
  const emitReturn = (expression) => emitArrayFilterReturnLines(expression, out, value, context)

  return emitArrayCallbackBodyLines(body, emitReturn, context)
}

function emitArrayCallbackBodyLines(body, emitReturn, context) {
  if (body.kind === 'prepared-return') {
    return emitReturn(body.returnExpression)
  }

  const doneLabel = nextCName(context, 'ccjs_array_callback_done')

  return [...emitArrayCallbackStatementListLines(body.statements, doneLabel, emitReturn, context), `${doneLabel}:;`]
}

function emitArrayCallbackStatementListLines(statements, doneLabel, emitReturn, context) {
  return statements.flatMap((statement) => emitArrayCallbackStatementLines(statement, doneLabel, emitReturn, context))
}

function emitArrayCallbackStatementLines(statement, doneLabel, emitReturn, context) {
  if (statement?.type === 'ReturnStatement') {
    return [...emitReturn(statement.argument), `goto ${doneLabel};`]
  }

  if (statement?.type === 'BlockStatement') {
    return [
      '{',
      ...emitArrayCallbackStatementListLines(statement.body, doneLabel, emitReturn, context).map((line) => `  ${line}`),
      '}'
    ]
  }

  if (statement?.type !== 'IfStatement') {
    return []
  }

  const condition = emitPreparedNumberExpression(statement.condition, context)
  const consequent = emitArrayCallbackStatementLines(statement.consequent, doneLabel, emitReturn, context)
  const lines = [
    ...condition.lines,
    `if ${emitCConditionClause(condition.expression)} {`,
    ...consequent.map((line) => `  ${line}`),
    '}'
  ]

  if (statement.alternate != null) {
    lines[lines.length - 1] = '} else {'
    lines.push(
      ...emitArrayCallbackStatementLines(statement.alternate, doneLabel, emitReturn, context).map((line) => `  ${line}`)
    )
    lines.push('}')
  }

  return lines
}

function emitArrayMapReturnLines(expression, elementType, out, context) {
  const mappedValue = emitPreparedArrayMapValue(expression, elementType, context)

  return [...mappedValue.lines, emitStatusCheck(`ccjs_array_push(${out}, ${mappedValue.expression})`, context)]
}

function emitArrayFilterReturnLines(expression, out, value, context) {
  const predicate = emitPreparedNumberExpression(expression, context)

  return [
    ...predicate.lines,
    `if ${emitCConditionClause(predicate.expression)} {`,
    `  ${emitStatusCheck(`ccjs_array_push(${out}, ${value})`, context)}`,
    '}'
  ]
}

function emitPreparedArrayCallbackInput(callback, receiver, value, index, context) {
  const lines: string[] = []
  const valueParam = callback.params[0]
  const indexParam = callback.params[1]

  if (valueParam != null) {
    context.variables.set(valueParam.name, receiver.elementType)

    if (receiver.elementType === 'string') {
      context.runtimeStrings.add(valueParam.name)
      lines.push(emitRuntimeTypeCheck(`${value}.tag != CCJS_TAG_STRING || ${value}.as.ref == 0`, context))
      lines.push(`ccjs_string* ${valueParam.name} = (ccjs_string*)${value}.as.ref;`)
    } else if (receiver.elementType === 'boolean') {
      lines.push(emitRuntimeTypeCheck(`${value}.tag != CCJS_TAG_BOOL`, context))
      lines.push(`double ${valueParam.name} = (${value}.as.boolean ? 1 : 0);`)
    } else {
      lines.push(emitRuntimeTypeCheck(`${value}.tag != CCJS_TAG_NUMBER`, context))
      lines.push(`double ${valueParam.name} = ${value}.as.number;`)
    }
  }

  if (indexParam != null) {
    context.variables.set(indexParam.name, 'number')
    lines.push(`double ${indexParam.name} = (double)${index};`)
  }

  return lines
}

function updatePushedArrayMetadata(receiver, valueType, context) {
  if (receiver?.type !== 'Reference' || receiver.path.length !== 1 || valueType === 'unknown') {
    return
  }

  const name = receiver.path[0]
  const elements = context.arrayShapes.get(name)

  if (elements == null) {
    if (context.variables.get(name) === 'array') {
      context.runtimeArrayElementTypes.set(name, context.runtimeArrayElementTypes.get(name) ?? valueType)
    }

    return
  }

  const nextElements = [...elements, { valueType }]
  const elementType = resolveForOfElementType(nextElements)

  if (elementType === 'unknown') {
    context.arrayShapes.delete(name)
    context.runtimeArrayElementTypes.set(name, 'unknown')
    return
  }

  context.arrayShapes.set(name, nextElements)
}

function updatePoppedArrayMetadata(receiver, context) {
  if (receiver?.type !== 'Reference' || receiver.path.length !== 1) {
    return
  }

  const name = receiver.path[0]
  const elements = context.arrayShapes.get(name)

  if (elements == null) {
    return
  }

  context.arrayShapes.set(name, elements.slice(0, -1))
}

function emitPreparedArrayMapValue(expression, valueType, context) {
  if (valueType === 'string') {
    return emitCValueExpression(expression, context)
  }

  const value = emitPreparedNumberExpression(expression, context)

  return {
    lines: value.lines,
    expression:
      valueType === 'boolean' ? `ccjs_bool_value((${value.expression}) != 0)` : `ccjs_number_value(${value.expression})`
  }
}

function emitPreparedArraySortComparatorInput(callback, receiver, left, right, context) {
  const lines: string[] = []
  const leftParam = callback.params[0]
  const rightParam = callback.params[1]

  if (leftParam != null) {
    lines.push(...emitPreparedArraySortComparatorParam(leftParam.name, receiver.elementType, left, context))
  }

  if (rightParam != null) {
    lines.push(...emitPreparedArraySortComparatorParam(rightParam.name, receiver.elementType, right, context))
  }

  return lines
}

function emitPreparedArraySortComparatorParam(name, elementType, value, context) {
  context.variables.set(name, elementType)

  if (elementType === 'string') {
    context.runtimeStrings.add(name)
    return [
      emitRuntimeTypeCheck(`${value}.tag != CCJS_TAG_STRING || ${value}.as.ref == 0`, context),
      `ccjs_string* ${name} = (ccjs_string*)${value}.as.ref;`
    ]
  }

  if (elementType === 'boolean') {
    return [
      emitRuntimeTypeCheck(`${value}.tag != CCJS_TAG_BOOL`, context),
      `double ${name} = (${value}.as.boolean ? 1 : 0);`
    ]
  }

  return [emitRuntimeTypeCheck(`${value}.tag != CCJS_TAG_NUMBER`, context), `double ${name} = ${value}.as.number;`]
}

function emitPreparedArrayReceiver(expression, context) {
  if (expression?.type === 'ArrayLiteral') {
    const value = emitCArrayLiteralValueExpression(expression, context)

    return {
      lines: value.lines,
      expression: value.expression,
      elementType: resolveForOfElementType(
        expression.elements.map((element) => ({
          valueType: inferExpressionType(element, context)
        }))
      )
    }
  }

  if (expression?.type === 'Reference' && expression.path.length === 1) {
    const name = expression.path[0]

    if (context.variables.get(name) !== 'array') {
      return null
    }

    return {
      lines: [],
      expression: name,
      elementType:
        context.runtimeArrayElementTypes.get(name) ?? resolveForOfElementType(context.arrayShapes.get(name) ?? [])
    }
  }

  if (expression?.type === 'MemberExpression' || expression?.type === 'IndexExpression') {
    const valueType = inferExpressionType(expression, context)

    if (valueType !== 'array') {
      return null
    }

    const value = emitCValueExpression(expression, context)

    return {
      lines: value.lines,
      expression: value.expression,
      elementType: resolveRuntimeArrayElementType(expression, context) ?? expression.arrayElementType ?? 'unknown'
    }
  }

  if (expression?.type === 'CallExpression') {
    const valueType = inferExpressionType(expression, context)

    if (valueType !== 'array') {
      return null
    }

    const call =
      emitPreparedArrayMapCallExpression(expression, context) ??
      emitPreparedArrayFilterCallExpression(expression, context) ??
      emitPreparedArraySortCallExpression(expression, context) ??
      emitCStringSplitValueExpression(expression, context)

    return call == null
      ? null
      : {
          lines: call.lines,
          expression: call.expression,
          elementType: call.elementType
        }
  }

  return null
}

function isCollectionConstructorExpression(expression) {
  return collectionConstructorName(expression) != null
}

function collectionConstructorName(expression) {
  if (
    expression?.type !== 'NewExpression' ||
    expression.callee.type !== 'Reference' ||
    expression.callee.path.length !== 1
  ) {
    return null
  }

  return collectionConstructorNameFromPath(expression.callee.path)
}

function emitPreparedCollectionCallExpression(expression, context) {
  if (expression?.type !== 'CallExpression' || expression.callee.type !== 'MemberExpression') {
    return null
  }

  const receiver = emitPreparedCollectionReceiver(expression.callee.object, context)

  if (receiver == null) {
    return null
  }

  const call =
    receiver.type === 'map'
      ? emitPreparedMapMethodCall(receiver.expression, expression, context)
      : emitPreparedSetMethodCall(receiver.expression, expression, context)

  return {
    lines: [...receiver.lines, ...call.lines],
    expression: call.expression
  }
}

function emitPreparedMapMethodCall(name, expression, context) {
  const method = expression.callee.property

  if (method === 'clear') {
    return {
      lines: [emitStatusCheck(`ccjs_map_clear(${name})`, context)],
      expression: ''
    }
  }

  if (method === 'set') {
    reportCCollectionHashability(
      inferExpressionType(expression.args[0], context),
      'Map keys',
      expression.args[0]?.loc ?? expression.loc,
      context
    )
    const key = emitCValueExpression(expression.args[0], context)
    const value = emitCValueExpression(expression.args[1], context)

    return {
      lines: [
        ...key.lines,
        ...value.lines,
        emitStatusCheck(`ccjs_map_set(${name}, ${key.expression}, ${value.expression})`, context)
      ],
      expression: name
    }
  }

  if (method === 'get') {
    reportCCollectionHashability(
      inferExpressionType(expression.args[0], context),
      'Map keys',
      expression.args[0]?.loc ?? expression.loc,
      context
    )
    const key = emitCValueExpression(expression.args[0], context)
    const valueType = inferExpressionType(expression, context)
    const expectedTag = cRuntimeValueTag(valueType)
    const out = nextCName(context, 'ccjs_map_value')
    registerOwnedValue(context, out)

    const lines = [
      ...key.lines,
      ...emitPrepareOwnedValueWrite(out),
      emitStatusCheck(`ccjs_map_get(${name}, ${key.expression}, &${out})`, context),
      ...emitRuntimeNullableValueCheck(out, expectedTag, context)
    ]

    return {
      lines,
      expression: out
    }
  }

  if (method === 'has' || method === 'delete') {
    reportCCollectionHashability(
      inferExpressionType(expression.args[0], context),
      'Map keys',
      expression.args[0]?.loc ?? expression.loc,
      context
    )
    const key = emitCValueExpression(expression.args[0], context)
    const out = nextCName(context, `ccjs_map_${method}`)
    const helper = method === 'has' ? 'ccjs_map_has' : 'ccjs_map_delete'

    return {
      lines: [
        ...key.lines,
        `bool ${out} = false;`,
        emitStatusCheck(`${helper}(${name}, ${key.expression}, &${out})`, context)
      ],
      expression: `(${out} ? 1 : 0)`
    }
  }

  context.diagnostics.push(
    diagnostic('CCJS_C_COLLECTION', `Map.${method} is not supported by the current C backend slice`, expression.loc)
  )

  return {
    lines: [],
    expression: '0'
  }
}

function emitPreparedMapIndexGetExpression(expression, context) {
  const mapIndex = emitPreparedMapIndexReceiver(expression, context)

  if (mapIndex == null) {
    return null
  }

  reportCCollectionHashability(
    inferExpressionType(mapIndex.key, context),
    'Map keys',
    mapIndex.key.loc ?? expression.loc,
    context
  )
  const key = emitCValueExpression(mapIndex.key, context)
  const valueType = inferExpressionType(expression, context)
  const expectedTag = cRuntimeValueTag(valueType)
  const out = nextCName(context, 'ccjs_map_value')
  registerOwnedValue(context, out)

  return {
    lines: [
      ...mapIndex.receiver.lines,
      ...key.lines,
      ...emitPrepareOwnedValueWrite(out),
      emitStatusCheck(`ccjs_map_get(${mapIndex.receiver.expression}, ${key.expression}, &${out})`, context),
      ...emitRuntimeNullableValueCheck(out, expectedTag, context)
    ],
    expression: out
  }
}

function emitPreparedMapIndexAssignment(expression, context) {
  if (expression?.type !== 'AssignmentExpression') {
    return null
  }

  const mapIndex = emitPreparedMapIndexReceiver(expression.target, context)

  if (mapIndex == null) {
    return null
  }

  reportCCollectionHashability(
    inferExpressionType(mapIndex.key, context),
    'Map keys',
    mapIndex.key.loc ?? expression.target.loc,
    context
  )
  const key = emitCValueExpression(mapIndex.key, context)
  const value = emitCValueExpression(expression.value, context)

  return {
    lines: [
      ...mapIndex.receiver.lines,
      ...key.lines,
      ...value.lines,
      emitStatusCheck(`ccjs_map_set(${mapIndex.receiver.expression}, ${key.expression}, ${value.expression})`, context)
    ],
    expression: ''
  }
}

function emitPreparedMapIndexReceiver(expression, context) {
  if (expression?.type !== 'IndexExpression' || expression.collectionKind !== 'map') {
    return null
  }

  const receiver = emitPreparedCollectionReceiver(expression.object, context)

  if (receiver == null || receiver.type !== 'map') {
    return null
  }

  return {
    receiver,
    key: expression.index
  }
}

function emitPreparedSetMethodCall(name, expression, context) {
  const method = expression.callee.property

  if (method === 'clear') {
    return {
      lines: [emitStatusCheck(`ccjs_set_clear(${name})`, context)],
      expression: ''
    }
  }

  if (method === 'add') {
    reportCCollectionHashability(
      inferExpressionType(expression.args[0], context),
      'Set values',
      expression.args[0]?.loc ?? expression.loc,
      context
    )
    const value = emitCValueExpression(expression.args[0], context)

    return {
      lines: [...value.lines, emitStatusCheck(`ccjs_set_add(${name}, ${value.expression})`, context)],
      expression: name
    }
  }

  if (method === 'has' || method === 'delete') {
    reportCCollectionHashability(
      inferExpressionType(expression.args[0], context),
      'Set values',
      expression.args[0]?.loc ?? expression.loc,
      context
    )
    const value = emitCValueExpression(expression.args[0], context)
    const out = nextCName(context, `ccjs_set_${method}`)
    const helper = method === 'has' ? 'ccjs_set_has' : 'ccjs_set_delete'

    return {
      lines: [
        ...value.lines,
        `bool ${out} = false;`,
        emitStatusCheck(`${helper}(${name}, ${value.expression}, &${out})`, context)
      ],
      expression: `(${out} ? 1 : 0)`
    }
  }

  context.diagnostics.push(
    diagnostic('CCJS_C_COLLECTION', `Set.${method} is not supported by the current C backend slice`, expression.loc)
  )

  return {
    lines: [],
    expression: '0'
  }
}

function isBytesSliceCall(expression, context) {
  return (
    isBinaryRuntimeCall(expression) &&
    expression.binaryRuntimeMethod === 'slice' &&
    inferExpressionType(expression.callee.object, context) === 'bytes'
  )
}

function isPromiseMethodCallExpression(expression, context) {
  return (
    expression?.type === 'CallExpression' &&
    expression.callee?.type === 'MemberExpression' &&
    ['catch', 'then'].includes(expression.callee.property) &&
    inferExpressionType(expression.callee.object, context) === 'promise'
  )
}
