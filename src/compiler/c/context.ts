import { isManagedRuntimeReturnType, isNullableScalarType, isOpaqueRuntimeValueType } from './value-types.ts'
import type { AnyNode, Diagnostic, IrFunctionEffect } from '../types.ts'
import type { AsyncTaskLoweringDependencies } from './async/tasks.ts'
import type { ArrayLoweringDependencies } from './values/arrays.ts'
import type { ClassLoweringDependencies } from './values/classes.ts'
import type { CollectionLoweringDependencies } from './values/collections.ts'
import type { NullableLoweringDependencies } from './values/nullable.ts'
import type { StatementLoweringDependencies } from './values/statements.ts'
import type { StringLoweringDependencies } from './values/strings.ts'
import type {
  CArrayElementInfo,
  CAsyncTaskWrapper,
  CCallbackWrapper,
  CClassInfo,
  CDgramMessageHandler,
  CFunctionParam,
  CFunctionReturnMapType,
  CFunctionType,
  CHttpHandler,
  CNetHandler,
  CObjectShape,
  CObjectShapeField,
  CPromiseChainWrapper,
  CPromiseConstructorHandler
} from './types.ts'

export type CLoopFlowTarget = {
  label: string
  throughFinally: boolean
}

export type CArrayShapeMap = Map<string, CArrayElementInfo[]>
export type CBooleanMap = Map<string, boolean>
export type CFunctionReturnMapTypeMap = Map<string, CFunctionReturnMapType>
export type CFunctionTypeMap = Map<string, CFunctionType>
export type CObjectShapeFieldMap = Map<string, CObjectShapeField[]>
export type CPromiseConstructorHandlerMap = Map<string, CPromiseConstructorHandler>
export type CStringMap = Map<string, string>
export type CStringNullableMap = Map<string, string | null>
export type CStringSet = Set<string>

type CDiagnosticContext = {
  diagnostics: Diagnostic[]
}

export function pushDiagnostic(context: CDiagnosticContext, item: Diagnostic): void {
  context.diagnostics.push(item)
}

export function cloneCStringSet(values: CStringSet): CStringSet {
  return new Set(values)
}

export function cloneCStringMap(values: CStringMap): CStringMap {
  return new Map(values)
}

export function cloneCArrayShapeMap(values: CArrayShapeMap | null | undefined): CArrayShapeMap {
  const result: CArrayShapeMap = new Map()

  if (values == null) {
    return result
  }

  return new Map(values)
}

export function cloneCFunctionTypeMap(values: CFunctionTypeMap | null | undefined): CFunctionTypeMap {
  const result: CFunctionTypeMap = new Map()

  if (values == null) {
    return result
  }

  return new Map(values)
}

export function cloneCFunctionReturnMapTypeMap(
  values: CFunctionReturnMapTypeMap | null | undefined
): CFunctionReturnMapTypeMap {
  const result: CFunctionReturnMapTypeMap = new Map()

  if (values == null) {
    return result
  }

  return new Map(values)
}

export function cloneCObjectShapeFieldMap(
  values: CObjectShapeFieldMap | null | undefined
): CObjectShapeFieldMap {
  const result: CObjectShapeFieldMap = new Map()

  if (values == null) {
    return result
  }

  return new Map(values)
}

export function cloneCPromiseConstructorHandlerMap(
  values: CPromiseConstructorHandlerMap | null | undefined
): CPromiseConstructorHandlerMap {
  const result: CPromiseConstructorHandlerMap = new Map()

  if (values == null) {
    return result
  }

  return new Map(values)
}

export type CEmitContext = {
  arrayLoweringDependencies: ArrayLoweringDependencies
  asyncTaskLoweringDependencies: AsyncTaskLoweringDependencies
  asyncTaskWrappers: Map<string, CAsyncTaskWrapper>
  boxedMutableCaptureDeclarations: Set<AnyNode>
  callbackArrowWrappers: Map<AnyNode, CCallbackWrapper>
  callbackWrappers: Map<string, CCallbackWrapper>
  classInfos: Map<string, CClassInfo>
  classLoweringDependencies: ClassLoweringDependencies
  collectionLoweringDependencies: CollectionLoweringDependencies
  cryptoImportNames: CStringSet
  diagnostics: Diagnostic[]
  dgramCreateSocketNames: CStringSet
  dgramImportNames: CStringSet
  dgramMessageHandlers: Map<string, CDgramMessageHandler>
  externalEventLoopFunctions: CStringSet
  functionAsyncFlags: CBooleanMap
  functionNames: CStringMap
  functionParams: Map<string, CFunctionParam[]>
  functionReturnArrayElementDeclaredTypes: CStringNullableMap
  functionReturnArrayElementTypes: CStringNullableMap
  functionReturnMapTypes: CFunctionReturnMapTypeMap
  functionReturnNullables: CBooleanMap
  functionReturnPromiseValueTypes: CStringNullableMap
  functionReturnSetElementTypes: CStringNullableMap
  functionReturnShapes: Map<string, CObjectShape | null>
  functionReturnTypes: CStringMap
  functionThrowValueTypes: Map<string, IrFunctionEffect['throwValueTypes']>
  forceRuntimeStringDeclarations?: CStringSet
  httpCreateServerNames: CStringSet
  httpHandlers: Map<string, CHttpHandler>
  httpImportNames: CStringSet
  jsGlobalRoots: CStringSet
  moduleValueNames: CStringMap
  moduleValueTypes: CStringMap
  netConnectNames: CStringSet
  netCreateServerNames: CStringSet
  netHandlers: Map<string, CNetHandler>
  netImportNames: CStringSet
  nextId: number
  nullableLoweringDependencies: NullableLoweringDependencies
  promiseChainArrowWrappers: Map<AnyNode, CPromiseChainWrapper>
  promiseChainWrappers: Map<string, CPromiseChainWrapper>
  processRuntime: boolean
  runtimeFunctionParams: CFunctionTypeMap
  statementLoweringDependencies: StatementLoweringDependencies
  stringLoweringDependencies: StringLoweringDependencies
  throwingFunctions: CStringSet
  unhandledRejectionFlag: string | null
}

export type CFailureContext = {
  cleanupEnabled: boolean
  failureStatement?: string | null
  failureStatementUsed?: boolean
  returnType?: string
  statusReturn: boolean
  throwingFunction: boolean
  usedCleanupGoto: boolean
}

export type CNameContext = {
  nextId: number
}

export type CEventLoopContext = {
  eventLoopUsed: boolean
  externalEventLoop: boolean
  usedCleanupGoto: boolean
}

export type COwnedValueContext = {
  ownedValues: string[]
}

export type COwnedPromiseContext = {
  ownedPromises: string[]
  promiseRejectionValueTypes: CStringMap
  promiseValueTypes: CStringMap
  variables: CStringMap
}

export type CFunctionContext = CEmitContext & {
  arrayShapes: CArrayShapeMap
  breakFlowUsed: boolean
  breakTargets: CLoopFlowTarget[]
  boxedValueTypes: CStringMap
  boxedValues: string[]
  boxedVariables: CStringSet
  classInstanceTypes: CStringMap
  cleanupEnabled: boolean
  continueFlowUsed: boolean
  continueTargets: CLoopFlowTarget[]
  dgramBoundSockets: CStringSet
  dgramMessageSockets: CStringSet
  dgramReuseAddrSockets: CStringSet
  errorChannelUsed: boolean
  errorObjectNames: CStringSet
  errorTargets: string[]
  eventLoopUsed: boolean
  externalEventLoop: boolean
  failureStatement?: string | null
  failureStatementUsed?: boolean
  functionErrorOut: string | null
  functionReturnOut: string | null
  functionTypes: CFunctionTypeMap
  mapTypes: CFunctionReturnMapTypeMap
  narrowedNullableScalars: CStringSet
  netReadingSockets: CStringSet
  nullableVariables: CStringSet
  ownedCryptoHashes: string[]
  ownedCryptoHmacs: string[]
  ownedPromises: string[]
  ownedValues: string[]
  objectShapes: CObjectShapeFieldMap
  promiseConstructorHandlers: CPromiseConstructorHandlerMap
  promiseRejectionValueTypes: CStringMap
  promiseValueTypes: CStringMap
  returnNullable: boolean
  returnFlowUsed: boolean
  returnShape?: CObjectShape | null
  returnTargets: string[]
  returnType: string
  runtimeCallbackCleanupLabel?: string
  runtimeCallbackReturnOut?: string
  runtimeCallbackReturnShape?: CObjectShape | null
  runtimeCallbackReturnType?: string
  runtimeCallbacks: CStringSet
  runtimeArrayElementTypes: CStringMap
  runtimeStrings: CStringSet
  setElementTypes: CStringMap
  statusReturn: boolean
  throwingFunction: boolean
  usedCleanupGoto: boolean
  usedRuntimeCallbackCleanupGoto?: boolean
  variables: CStringMap
}

export type CVariableScopeSnapshot = {
  arrayShapes: CArrayShapeMap
  boxedVariables: CStringSet
  classInstanceTypes: CStringMap
  errorObjectNames: CStringSet
  functionTypes: CFunctionTypeMap
  mapTypes: CFunctionReturnMapTypeMap
  narrowedNullableScalars: CStringSet
  nullableVariables: CStringSet
  objectShapes: CObjectShapeFieldMap
  promiseConstructorHandlers: CPromiseConstructorHandlerMap
  promiseRejectionValueTypes: CStringMap
  promiseValueTypes: CStringMap
  runtimeArrayElementTypes: CStringMap
  runtimeCallbacks: CStringSet
  runtimeStrings: CStringSet
  setElementTypes: CStringMap
  variables: CStringMap
}

export type CNullableScalarNarrowingSnapshot = {
  active: boolean
  narrowedNullableScalars: CStringSet
}

export function createFunctionContext(
  baseContext: CEmitContext,
  returnType: string,
  returnNullable: boolean
): CFunctionContext {
  return {
    arrayLoweringDependencies: baseContext.arrayLoweringDependencies,
    asyncTaskLoweringDependencies: baseContext.asyncTaskLoweringDependencies,
    asyncTaskWrappers: baseContext.asyncTaskWrappers,
    boxedMutableCaptureDeclarations: baseContext.boxedMutableCaptureDeclarations,
    callbackArrowWrappers: baseContext.callbackArrowWrappers,
    callbackWrappers: baseContext.callbackWrappers,
    classInfos: baseContext.classInfos,
    classLoweringDependencies: baseContext.classLoweringDependencies,
    collectionLoweringDependencies: baseContext.collectionLoweringDependencies,
    cryptoImportNames: baseContext.cryptoImportNames,
    diagnostics: baseContext.diagnostics,
    dgramCreateSocketNames: baseContext.dgramCreateSocketNames,
    dgramImportNames: baseContext.dgramImportNames,
    dgramMessageHandlers: baseContext.dgramMessageHandlers,
    externalEventLoopFunctions: baseContext.externalEventLoopFunctions,
    forceRuntimeStringDeclarations: baseContext.forceRuntimeStringDeclarations,
    functionAsyncFlags: baseContext.functionAsyncFlags,
    functionNames: baseContext.functionNames,
    functionParams: baseContext.functionParams,
    functionReturnArrayElementDeclaredTypes: baseContext.functionReturnArrayElementDeclaredTypes,
    functionReturnArrayElementTypes: baseContext.functionReturnArrayElementTypes,
    functionReturnMapTypes: baseContext.functionReturnMapTypes,
    functionReturnNullables: baseContext.functionReturnNullables,
    functionReturnPromiseValueTypes: baseContext.functionReturnPromiseValueTypes,
    functionReturnSetElementTypes: baseContext.functionReturnSetElementTypes,
    functionReturnShapes: baseContext.functionReturnShapes,
    functionReturnTypes: baseContext.functionReturnTypes,
    functionThrowValueTypes: baseContext.functionThrowValueTypes,
    httpCreateServerNames: baseContext.httpCreateServerNames,
    httpHandlers: baseContext.httpHandlers,
    httpImportNames: baseContext.httpImportNames,
    jsGlobalRoots: baseContext.jsGlobalRoots,
    moduleValueNames: baseContext.moduleValueNames,
    moduleValueTypes: baseContext.moduleValueTypes,
    netConnectNames: baseContext.netConnectNames,
    netCreateServerNames: baseContext.netCreateServerNames,
    netHandlers: baseContext.netHandlers,
    netImportNames: baseContext.netImportNames,
    nextId: baseContext.nextId,
    nullableLoweringDependencies: baseContext.nullableLoweringDependencies,
    processRuntime: baseContext.processRuntime,
    promiseChainArrowWrappers: baseContext.promiseChainArrowWrappers,
    promiseChainWrappers: baseContext.promiseChainWrappers,
    runtimeFunctionParams: baseContext.runtimeFunctionParams,
    statementLoweringDependencies: baseContext.statementLoweringDependencies,
    stringLoweringDependencies: baseContext.stringLoweringDependencies,
    throwingFunctions: baseContext.throwingFunctions,
    unhandledRejectionFlag: baseContext.unhandledRejectionFlag,
    arrayShapes: new Map(),
    breakFlowUsed: false,
    breakTargets: [],
    boxedValueTypes: new Map(),
    boxedValues: [],
    boxedVariables: new Set(),
    classInstanceTypes: new Map(),
    continueFlowUsed: false,
    continueTargets: [],
    cleanupEnabled: true,
    dgramBoundSockets: new Set(),
    dgramMessageSockets: new Set(),
    dgramReuseAddrSockets: new Set(),
    errorChannelUsed: false,
    errorObjectNames: new Set(),
    errorTargets: [],
    functionErrorOut: null,
    functionReturnOut: null,
    functionTypes: new Map(),
    eventLoopUsed: false,
    externalEventLoop: false,
    mapTypes: new Map(),
    netReadingSockets: new Set(),
    narrowedNullableScalars: new Set(),
    nullableVariables: new Set(),
    objectShapes: new Map(),
    ownedPromises: [],
    ownedCryptoHashes: [],
    ownedCryptoHmacs: [],
    ownedValues: [],
    promiseRejectionValueTypes: new Map(),
    promiseConstructorHandlers: new Map(),
    promiseValueTypes: new Map(),
    returnFlowUsed: false,
    returnTargets: [],
    runtimeCallbacks: new Set(),
    runtimeArrayElementTypes: new Map(),
    setElementTypes: new Map(),
    runtimeStrings: new Set(),
    statusReturn: false,
    throwingFunction: false,
    usedCleanupGoto: false,
    variables: cloneCStringMap(baseContext.moduleValueTypes),
    returnNullable: returnNullable,
    returnType: returnType
  }
}

export function emitStatusCheck(call: string, context: CFailureContext): string {
  return `if (${call} != CCJS_OK) ${emitFailureStatement(context)}`
}

export function emitRuntimeTypeCheck(condition: string, context: CFailureContext): string {
  return `if (${condition}) ${emitFailureStatement(context)}`
}

export function emitFailureStatement(context: CFailureContext): string {
  const failureStatement = context.failureStatement

  if (failureStatement != null) {
    context.failureStatementUsed = true
    return failureStatement
  }

  if (context.throwingFunction && context.cleanupEnabled) {
    context.usedCleanupGoto = true
    return 'do { ccjs_status_result = CCJS_ERR_TYPE; goto ccjs_cleanup; } while (0);'
  }

  if (context.statusReturn) {
    return 'return CCJS_ERR_TYPE;'
  }

  if (context.cleanupEnabled) {
    context.usedCleanupGoto = true
    return 'goto ccjs_cleanup;'
  }

  if (context.returnType === 'void') {
    return 'return;'
  }

  return 'return 0;'
}

export function registerOwnedValue(context: COwnedValueContext, name: string): void {
  if (!stringArrayHas(context.ownedValues, name)) {
    context.ownedValues.push(name)
  }
}

export function registerOwnedPromise(
  context: COwnedPromiseContext,
  name: string,
  valueType: string = 'unknown',
  rejectionValueType: string = 'unknown'
): void {
  if (!stringArrayHas(context.ownedPromises, name)) {
    context.ownedPromises.push(name)
  }

  context.variables.set(name, 'promise')
  context.promiseValueTypes.set(name, valueType)
  context.promiseRejectionValueTypes.set(name, rejectionValueType)
}

export function registerOwnedCryptoHash(context: CFunctionContext, name: string): void {
  if (!stringArrayHas(context.ownedCryptoHashes, name)) {
    context.ownedCryptoHashes.push(name)
  }

  context.variables.set(name, 'crypto-hash')
}

export function registerOwnedCryptoHmac(context: CFunctionContext, name: string): void {
  if (!stringArrayHas(context.ownedCryptoHmacs, name)) {
    context.ownedCryptoHmacs.push(name)
  }

  context.variables.set(name, 'crypto-hmac')
}

export function registerEventLoop(context: CEventLoopContext): void {
  context.eventLoopUsed = true
  context.usedCleanupGoto = true
}

export function registerBoxedValue(context: CFunctionContext, name: string, valueType: string = 'number'): void {
  if (!stringArrayHas(context.boxedValues, name)) {
    context.boxedValues.push(name)
  }

  context.boxedValueTypes.set(name, valueType)
}

function stringArrayHas(values: string[], needle: string): boolean {
  for (let index = 0; index < values.length; index = index + 1) {
    if (values[index] === needle) {
      return true
    }
  }

  return false
}

export function emitPrepareOwnedValueWrite(name: string): string[] {
  return [`ccjs_release(${name});`, `${name} = ccjs_undefined_value();`]
}

export function shouldEmitCleanupLabel(context: CFunctionContext): boolean {
  return (
    context.throwingFunction ||
    context.returnType !== 'void' ||
    (context.returnType === 'void' &&
      (context.ownedValues.length > 0 ||
        context.ownedPromises.length > 0 ||
        context.ownedCryptoHashes.length > 0 ||
        context.ownedCryptoHmacs.length > 0 ||
        context.boxedValues.length > 0 ||
        context.eventLoopUsed ||
        context.usedCleanupGoto))
  )
}

export function emitReturnValueDeclarations(context: CFunctionContext): string[] {
  if (context.returnType === 'promise') {
    return ['ccjs_promise* ccjs_return = 0;']
  }

  if (context.returnNullable === true && isNullableScalarType(context.returnType)) {
    return ['ccjs_value ccjs_return = ccjs_undefined_value();']
  }

  if (
    context.returnType === 'unknown' ||
    isManagedRuntimeReturnType(context.returnType) ||
    isOpaqueRuntimeValueType(context.returnType)
  ) {
    return ['ccjs_value ccjs_return = ccjs_undefined_value();']
  }

  if (context.returnType !== 'void') {
    return ['double ccjs_return = 0;']
  }

  return []
}

export function emitStatusResultDeclarations(context: CFunctionContext): string[] {
  if (context.throwingFunction) {
    return ['ccjs_status ccjs_status_result = CCJS_OK;']
  }

  return []
}

export function emitLoopFlowDeclarations(context: CFunctionContext): string[] {
  const lines: string[] = []

  if (context.breakFlowUsed) {
    lines.push('int ccjs_break_active = 0;')
  }

  if (context.continueFlowUsed) {
    lines.push('int ccjs_continue_active = 0;')
  }

  return lines
}

export function emitReturnFlowDeclarations(context: CFunctionContext): string[] {
  if (context.returnFlowUsed) {
    return ['int ccjs_return_active = 0;']
  }

  return []
}

export function emitOwnedValueDeclarations(context: CFunctionContext): string[] {
  const lines: string[] = []

  for (const name of context.ownedValues) {
    lines.push(`ccjs_value ${name} = ccjs_undefined_value();`)
  }

  for (const name of context.ownedCryptoHashes) {
    lines.push(`ccjs_crypto_hash* ${name} = 0;`)
  }

  for (const name of context.ownedCryptoHmacs) {
    lines.push(`ccjs_crypto_hmac* ${name} = 0;`)
  }

  return lines
}

export function emitOwnedPromiseDeclarations(context: CFunctionContext): string[] {
  const lines: string[] = []

  for (const name of context.ownedPromises) {
    lines.push(`ccjs_promise* ${name} = 0;`)
  }

  return lines
}

export function emitEventLoopDeclarations(context: CFunctionContext): string[] {
  if (context.eventLoopUsed && !context.externalEventLoop) {
    return ['ccjs_loop ccjs_loop;', 'int ccjs_loop_active = 0;']
  }

  return []
}

export function emitErrorChannelDeclarations(context: CFunctionContext): string[] {
  if (context.errorChannelUsed) {
    return ['int ccjs_error_active = 0;']
  }

  return []
}

export function emitBoxedValueDeclarations(context: CFunctionContext): string[] {
  const lines: string[] = []

  for (const name of context.boxedValues) {
    if (isRuntimeBoxedValueType(context.boxedValueTypes.get(name))) {
      lines.push(`ccjs_value* ${name} = 0;`)
    } else {
      lines.push(`double* ${name} = 0;`)
    }
  }

  return lines
}

export function emitOwnedValueCleanup(context: CFunctionContext): string[] {
  const lines: string[] = []

  for (let index = context.ownedCryptoHmacs.length - 1; index >= 0; index--) {
    const name = context.ownedCryptoHmacs[index]
    lines.push(`ccjs_crypto_hmac_free(${name});`)
  }

  for (let index = context.ownedCryptoHashes.length - 1; index >= 0; index--) {
    const name = context.ownedCryptoHashes[index]
    lines.push(`ccjs_crypto_hash_free(${name});`)
  }

  for (let index = context.ownedValues.length - 1; index >= 0; index--) {
    const name = context.ownedValues[index]
    lines.push(`ccjs_release(${name});`)
  }

  return lines
}

export function emitOwnedPromiseCleanup(context: CFunctionContext): string[] {
  const lines: string[] = []

  for (let index = context.ownedPromises.length - 1; index >= 0; index--) {
    const name = context.ownedPromises[index]
    const release = `if (${name} != 0) ccjs_promise_release(${name});`

    if (context.unhandledRejectionFlag == null) {
      lines.push(release)
      continue
    }

    lines.push(`if (${name} != 0 && ccjs_promise_is_unhandled_rejection(${name})) {`)
    lines.push('  fprintf(stderr, "Unhandled Promise rejection\\n");')
    lines.push(`  ${context.unhandledRejectionFlag} = 1;`)
    lines.push('}')
    lines.push(release)
  }

  return lines
}

export function emitEventLoopInit(context: CFunctionContext): string[] {
  if (!context.eventLoopUsed) {
    return []
  }

  if (context.externalEventLoop) {
    return [`if (ccjs_loop == 0) ${emitFailureStatement(context)}`]
  }

  return [
    `if (ccjs_loop_init(&ccjs_loop, &ccjs_default_allocator) != CCJS_OK) ${emitFailureStatement(context)}`,
    'ccjs_loop_active = 1;',
    `ccjs_loop.now_ms = ${emitEventLoopCurrentTimeExpression()};`
  ]
}

export function emitEventLoopDrain(context: CFunctionContext): string[] {
  if (!context.eventLoopUsed || context.externalEventLoop) {
    return []
  }

  const loop = emitEventLoopReference(context)
  const statusCheck = emitStatusCheck(`ccjs_loop_poll(${loop}, ${emitEventLoopCurrentTimeExpression()})`, context)
  const lines: string[] = []

  lines.push(`while (ccjs_loop_has_work(${loop})) {`)

  for (const line of emitEventLoopSleepUntilNextTimerLines(context, '  ')) {
    lines.push(line)
  }

  lines.push(`  ${statusCheck}`)
  lines.push('}')

  return lines
}

export function emitEventLoopCleanup(context: CFunctionContext): string[] {
  if (context.eventLoopUsed && !context.externalEventLoop) {
    return ['if (ccjs_loop_active) ccjs_loop_dispose(&ccjs_loop);']
  }

  return []
}

export function emitEventLoopReference(context: CEventLoopContext): string {
  if (context.externalEventLoop) {
    return 'ccjs_loop'
  }

  return '&ccjs_loop'
}

export function emitEventLoopNextTimeExpression(context: CFunctionContext): string {
  return emitEventLoopCurrentTimeExpression()
}

export function emitEventLoopCurrentTimeExpression(): string {
  return 'ccjs_performance_now()'
}

export function emitEventLoopSleepUntilNextTimerLines(context: CFunctionContext, indent: string): string[] {
  const loop = emitEventLoopReference(context)

  return [
    `${indent}#if !defined(CCJS_LOOP_BACKEND_LIBUV)`,
    `${indent}{`,
    `${indent}  ccjs_number ccjs_next_due_ms = 0;`,
    `${indent}  ccjs_number ccjs_now_ms = ${emitEventLoopCurrentTimeExpression()};`,
    `${indent}  if (ccjs_loop_pending_microtasks(${loop}) == 0 && ccjs_loop_pending_immediates(${loop}) == 0 && ccjs_loop_next_timer_due_ms(${loop}, &ccjs_next_due_ms) && ccjs_next_due_ms > ccjs_now_ms) {`,
    `${indent}    ccjs_time_sleep_ms(ccjs_next_due_ms - ccjs_now_ms);`,
    `${indent}  }`,
    `${indent}}`,
    `${indent}#endif`
  ]
}

export function emitBoxedValueCleanup(context: CFunctionContext): string[] {
  const lines: string[] = []

  for (let index = context.boxedValues.length - 1; index >= 0; index--) {
    const name = context.boxedValues[index]

    if (isRuntimeBoxedValueType(context.boxedValueTypes.get(name))) {
      lines.push(`if (${name} != 0) {`)
      lines.push(`  ccjs_release(*${name});`)
      lines.push(`  ccjs_default_free(0, ${name}, sizeof(ccjs_value), _Alignof(ccjs_value));`)
      lines.push('}')
    } else {
      lines.push(`if (${name} != 0) ccjs_default_free(0, ${name}, sizeof(double), _Alignof(double));`)
    }
  }

  return lines
}

export function isRuntimeBoxedValueType(valueType: string | null | undefined): boolean {
  return valueType === 'string' || valueType === 'object'
}

export function emitCleanupReturn(context: CFunctionContext): string[] {
  if (context.throwingFunction) {
    return emitThrowingFunctionCleanupReturn(context)
  }

  if (isManagedRuntimeReturnType(context.returnType)) {
    return ['return ccjs_return;']
  }

  if (context.returnType !== 'void') {
    return ['return ccjs_return;']
  }

  return ['return;']
}

export function emitThrowingFunctionErrorTransfer(context: CFunctionContext): string[] {
  if (!context.throwingFunction) {
    return []
  }

  return [
    'if (ccjs_error_active) {',
    `  *${context.functionErrorOut} = ccjs_error;`,
    '  ccjs_error = ccjs_undefined_value();',
    '}'
  ]
}

export function emitThrowingFunctionCleanupReturn(context: CFunctionContext): string[] {
  const lines: string[] = ['if (ccjs_status_result != CCJS_OK) return ccjs_status_result;']

  if (context.returnType !== 'void') {
    lines.push(`*${context.functionReturnOut} = ccjs_return;`)
  }

  lines.push('return CCJS_OK;')

  return lines
}

export function nextCName(context: CNameContext, prefix: string): string {
  const name = `${prefix}_${context.nextId}`
  context.nextId = context.nextId + 1

  return name
}

export function pushVariableScope(context: CFunctionContext): CVariableScopeSnapshot {
  const previousVariables = context.variables
  const previousArrayShapes = context.arrayShapes
  const previousBoxedVariables = context.boxedVariables
  const previousClassInstanceTypes = context.classInstanceTypes
  const previousErrorObjectNames = context.errorObjectNames
  const previousFunctionTypes = context.functionTypes
  const previousMapTypes = context.mapTypes
  const previousNarrowedNullableScalars = context.narrowedNullableScalars
  const previousNullableVariables = context.nullableVariables
  const previousObjectShapes = context.objectShapes
  const previousPromiseConstructorHandlers = context.promiseConstructorHandlers
  const previousPromiseRejectionValueTypes = context.promiseRejectionValueTypes
  const previousPromiseValueTypes = context.promiseValueTypes
  const previousRuntimeCallbacks = context.runtimeCallbacks
  const previousRuntimeArrayElementTypes = context.runtimeArrayElementTypes
  const previousSetElementTypes = context.setElementTypes
  const previousRuntimeStrings = context.runtimeStrings

  context.variables = cloneCStringMap(previousVariables)
  context.arrayShapes = cloneCArrayShapeMap(previousArrayShapes)
  context.boxedVariables = cloneCStringSet(previousBoxedVariables)
  context.classInstanceTypes = cloneCStringMap(previousClassInstanceTypes)
  context.errorObjectNames = cloneCStringSet(previousErrorObjectNames)
  context.functionTypes = cloneCFunctionTypeMap(previousFunctionTypes)
  context.mapTypes = cloneCFunctionReturnMapTypeMap(previousMapTypes)
  context.narrowedNullableScalars = cloneCStringSet(previousNarrowedNullableScalars)
  context.nullableVariables = cloneCStringSet(previousNullableVariables)
  context.objectShapes = cloneCObjectShapeFieldMap(previousObjectShapes)
  context.promiseConstructorHandlers = cloneCPromiseConstructorHandlerMap(previousPromiseConstructorHandlers)
  context.promiseRejectionValueTypes = cloneCStringMap(previousPromiseRejectionValueTypes)
  context.promiseValueTypes = cloneCStringMap(previousPromiseValueTypes)
  context.runtimeCallbacks = cloneCStringSet(previousRuntimeCallbacks)
  context.runtimeArrayElementTypes = cloneCStringMap(previousRuntimeArrayElementTypes)
  context.setElementTypes = cloneCStringMap(previousSetElementTypes)
  context.runtimeStrings = cloneCStringSet(previousRuntimeStrings)

  return {
    arrayShapes: previousArrayShapes,
    boxedVariables: previousBoxedVariables,
    classInstanceTypes: previousClassInstanceTypes,
    errorObjectNames: previousErrorObjectNames,
    functionTypes: previousFunctionTypes,
    mapTypes: previousMapTypes,
    narrowedNullableScalars: previousNarrowedNullableScalars,
    nullableVariables: previousNullableVariables,
    objectShapes: previousObjectShapes,
    promiseConstructorHandlers: previousPromiseConstructorHandlers,
    promiseRejectionValueTypes: previousPromiseRejectionValueTypes,
    promiseValueTypes: previousPromiseValueTypes,
    runtimeArrayElementTypes: previousRuntimeArrayElementTypes,
    runtimeCallbacks: previousRuntimeCallbacks,
    runtimeStrings: previousRuntimeStrings,
    setElementTypes: previousSetElementTypes,
    variables: previousVariables
  }
}

export function restoreVariableScope(context: CFunctionContext, snapshot: CVariableScopeSnapshot): void {
  context.variables = snapshot.variables
  context.arrayShapes = snapshot.arrayShapes
  context.boxedVariables = snapshot.boxedVariables
  context.classInstanceTypes = snapshot.classInstanceTypes
  context.errorObjectNames = snapshot.errorObjectNames
  context.functionTypes = snapshot.functionTypes
  context.mapTypes = snapshot.mapTypes
  context.narrowedNullableScalars = snapshot.narrowedNullableScalars
  context.nullableVariables = snapshot.nullableVariables
  context.objectShapes = snapshot.objectShapes
  context.promiseConstructorHandlers = snapshot.promiseConstructorHandlers
  context.promiseRejectionValueTypes = snapshot.promiseRejectionValueTypes
  context.promiseValueTypes = snapshot.promiseValueTypes
  context.runtimeCallbacks = snapshot.runtimeCallbacks
  context.runtimeArrayElementTypes = snapshot.runtimeArrayElementTypes
  context.setElementTypes = snapshot.setElementTypes
  context.runtimeStrings = snapshot.runtimeStrings
}

export function pushNullableScalarNarrowing(
  context: CFunctionContext,
  names: string[]
): CNullableScalarNarrowingSnapshot {
  const previous = context.narrowedNullableScalars

  if (names.length === 0) {
    return {
      active: false,
      narrowedNullableScalars: previous
    }
  }

  context.narrowedNullableScalars = cloneCStringSet(previous)

  for (const name of names) {
    context.narrowedNullableScalars.add(name)
  }

  return {
    active: true,
    narrowedNullableScalars: previous
  }
}

export function restoreNullableScalarNarrowing(
  context: CFunctionContext,
  snapshot: CNullableScalarNarrowingSnapshot
): void {
  if (snapshot.active) {
    context.narrowedNullableScalars = snapshot.narrowedNullableScalars
  }
}

export function narrowNullableScalars(context: CFunctionContext, names: string[]): void {
  for (const name of names) {
    context.narrowedNullableScalars.add(name)
  }
}
