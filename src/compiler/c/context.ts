import { isManagedRuntimeReturnType, isNullableScalarType } from './value-types.ts'
import type { AnyNode, Diagnostic, IrFunctionEffect } from '../types.ts'
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
  CObjectShapeField,
  CPromiseChainWrapper,
  CPromiseConstructorHandler
} from './types.ts'

export type CEmitContext = {
  asyncTaskLoweringDependencies?: any
  asyncTaskWrappers: Map<string, CAsyncTaskWrapper>
  boxedMutableCaptureDeclarations: Set<AnyNode>
  callbackArrowWrappers: Map<AnyNode, CCallbackWrapper>
  callbackWrappers: Map<string, CCallbackWrapper>
  classInfos: Map<string, CClassInfo>
  classLoweringDependencies: any
  collectionLoweringDependencies: any
  cryptoImportNames: Set<string>
  diagnostics: Diagnostic[]
  dgramCreateSocketNames: Set<string>
  dgramImportNames: Set<string>
  dgramMessageHandlers: Map<AnyNode, CDgramMessageHandler>
  externalEventLoopFunctions: Set<string>
  functionAsyncFlags: Map<string, boolean>
  functionNames: Map<string, string>
  functionParams: Map<string, CFunctionParam[]>
  functionReturnArrayElementDeclaredTypes: Map<string, string | null>
  functionReturnArrayElementTypes: Map<string, string | null>
  functionReturnMapTypes: Map<string, CFunctionReturnMapType>
  functionReturnNullables: Map<string, boolean>
  functionReturnPromiseValueTypes: Map<string, string | null>
  functionReturnSetElementTypes: Map<string, string | null>
  functionReturnShapes: Map<string, any>
  functionReturnTypes: Map<string, string>
  functionThrowValueTypes: Map<string, IrFunctionEffect['throwValueTypes']>
  httpCreateServerNames: Set<string>
  httpHandlers: Map<AnyNode, CHttpHandler>
  httpImportNames: Set<string>
  jsGlobalRoots: Set<string>
  netConnectNames: Set<string>
  netCreateServerNames: Set<string>
  netHandlers: Map<string, CNetHandler>
  netImportNames: Set<string>
  nextId: number
  nullableLoweringDependencies: any
  promiseChainArrowWrappers: Map<AnyNode, CPromiseChainWrapper>
  promiseChainWrappers: Map<string, CPromiseChainWrapper>
  processRuntime: boolean
  runtimeFunctionParams: Map<string, CFunctionType>
  statementLoweringDependencies: any
  stringLoweringDependencies: any
  throwingFunctions: Set<string>
  unhandledRejectionFlag: string | null
  [key: string]: any
}

export type CFunctionContext = CEmitContext & {
  arrayShapes: Map<string, CArrayElementInfo[]>
  boxedValueTypes: Map<string, string>
  boxedValues: string[]
  boxedVariables: Set<string>
  classInstanceTypes: Map<string, string>
  cleanupEnabled: boolean
  dgramBoundSockets: Set<string>
  dgramMessageSockets: Set<string>
  dgramReuseAddrSockets: Set<string>
  errorChannelUsed: boolean
  errorObjectNames: Set<string>
  eventLoopUsed: boolean
  externalEventLoop: boolean
  functionErrorOut: string | null
  functionReturnOut: string | null
  functionTypes: Map<string, CFunctionType>
  mapTypes: Map<string, CFunctionReturnMapType>
  narrowedNullableScalars: Set<string>
  netReadingSockets: Set<string>
  nullableVariables: Set<string>
  ownedCryptoHashes: string[]
  ownedCryptoHmacs: string[]
  ownedPromises: string[]
  ownedValues: string[]
  objectShapes: Map<string, CObjectShapeField[]>
  promiseConstructorHandlers: Map<string, CPromiseConstructorHandler>
  promiseRejectionValueTypes: Map<string, string>
  promiseValueTypes: Map<string, string>
  returnNullable: boolean
  returnType: string
  runtimeCallbacks: Set<string>
  runtimeArrayElementTypes: Map<string, string>
  runtimeStrings: Set<string>
  setElementTypes: Map<string, string>
  statusReturn: boolean
  throwingFunction: boolean
  usedCleanupGoto: boolean
  variables: Map<string, string>
}

export function createFunctionContext(
  baseContext: CEmitContext,
  returnType: string,
  returnNullable = false
): CFunctionContext {
  return {
    ...baseContext,
    arrayShapes: new Map<string, CArrayElementInfo[]>(),
    breakFlowUsed: false,
    breakTargets: [],
    boxedValueTypes: new Map<string, string>(),
    boxedValues: [],
    boxedVariables: new Set<string>(),
    classInstanceTypes: new Map<string, string>(),
    continueFlowUsed: false,
    continueTargets: [],
    cleanupEnabled: true,
    dgramBoundSockets: new Set<string>(),
    dgramMessageSockets: new Set<string>(),
    dgramReuseAddrSockets: new Set<string>(),
    errorChannelUsed: false,
    errorObjectNames: new Set<string>(),
    errorTargets: [],
    functionErrorOut: null,
    functionReturnOut: null,
    functionTypes: new Map<string, CFunctionType>(),
    eventLoopUsed: false,
    externalEventLoop: false,
    mapTypes: new Map<string, CFunctionReturnMapType>(),
    netReadingSockets: new Set<string>(),
    narrowedNullableScalars: new Set<string>(),
    nullableVariables: new Set<string>(),
    objectShapes: new Map<string, CObjectShapeField[]>(),
    ownedPromises: [],
    ownedCryptoHashes: [],
    ownedCryptoHmacs: [],
    ownedValues: [],
    promiseRejectionValueTypes: new Map<string, string>(),
    promiseConstructorHandlers: new Map<string, CPromiseConstructorHandler>(),
    promiseValueTypes: new Map<string, string>(),
    returnFlowUsed: false,
    returnTargets: [],
    runtimeCallbacks: new Set<string>(),
    runtimeArrayElementTypes: new Map<string, string>(),
    setElementTypes: new Map<string, string>(),
    runtimeStrings: new Set<string>(),
    statusReturn: false,
    throwingFunction: false,
    usedCleanupGoto: false,
    variables: new Map<string, string>(),
    returnNullable,
    returnType
  }
}

export function emitStatusCheck(call: string, context: CFunctionContext): string {
  return `if (${call} != CCJS_OK) ${emitFailureStatement(context)}`
}

export function emitRuntimeTypeCheck(condition: string, context: CFunctionContext): string {
  return `if (${condition}) ${emitFailureStatement(context)}`
}

export function emitFailureStatement(context: CFunctionContext): string {
  if (context.failureStatement != null) {
    context.failureStatementUsed = true
    return context.failureStatement
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

  return context.returnType === 'void' ? 'return;' : 'return 0;'
}

export function registerOwnedValue(context: CFunctionContext, name: string): void {
  if (!context.ownedValues.includes(name)) {
    context.ownedValues.push(name)
  }
}

export function registerOwnedPromise(
  context: CFunctionContext,
  name: string,
  valueType: any = 'unknown',
  rejectionValueType: any = 'unknown'
): void {
  if (!context.ownedPromises.includes(name)) {
    context.ownedPromises.push(name)
  }

  context.variables.set(name, 'promise')
  context.promiseValueTypes.set(name, valueType)
  context.promiseRejectionValueTypes.set(name, rejectionValueType)
}

export function registerOwnedCryptoHash(context: CFunctionContext, name: string): void {
  if (!context.ownedCryptoHashes.includes(name)) {
    context.ownedCryptoHashes.push(name)
  }

  context.variables.set(name, 'crypto-hash')
}

export function registerOwnedCryptoHmac(context: CFunctionContext, name: string): void {
  if (!context.ownedCryptoHmacs.includes(name)) {
    context.ownedCryptoHmacs.push(name)
  }

  context.variables.set(name, 'crypto-hmac')
}

export function registerEventLoop(context: CFunctionContext): void {
  context.eventLoopUsed = true
  context.usedCleanupGoto = true
}

export function registerBoxedValue(context: CFunctionContext, name: string, valueType: any = 'number'): void {
  if (!context.boxedValues.includes(name)) {
    context.boxedValues.push(name)
  }

  context.boxedValueTypes.set(name, valueType)
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

  if (isManagedRuntimeReturnType(context.returnType)) {
    return ['ccjs_value ccjs_return = ccjs_undefined_value();']
  }

  if (context.returnType !== 'void') {
    return ['double ccjs_return = 0;']
  }

  return []
}

export function emitStatusResultDeclarations(context: CFunctionContext): string[] {
  return context.throwingFunction ? ['ccjs_status ccjs_status_result = CCJS_OK;'] : []
}

export function emitLoopFlowDeclarations(context: CFunctionContext): string[] {
  return [
    ...(context.breakFlowUsed ? ['int ccjs_break_active = 0;'] : []),
    ...(context.continueFlowUsed ? ['int ccjs_continue_active = 0;'] : [])
  ]
}

export function emitReturnFlowDeclarations(context: CFunctionContext): string[] {
  return context.returnFlowUsed ? ['int ccjs_return_active = 0;'] : []
}

export function emitOwnedValueDeclarations(context: CFunctionContext): string[] {
  return [
    ...context.ownedValues.map((name: string) => `ccjs_value ${name} = ccjs_undefined_value();`),
    ...context.ownedCryptoHashes.map((name: string) => `ccjs_crypto_hash* ${name} = 0;`),
    ...context.ownedCryptoHmacs.map((name: string) => `ccjs_crypto_hmac* ${name} = 0;`)
  ]
}

export function emitOwnedPromiseDeclarations(context: CFunctionContext): string[] {
  return context.ownedPromises.map((name: string) => `ccjs_promise* ${name} = 0;`)
}

export function emitEventLoopDeclarations(context: CFunctionContext): string[] {
  return context.eventLoopUsed && !context.externalEventLoop
    ? ['ccjs_loop ccjs_loop;', 'int ccjs_loop_active = 0;']
    : []
}

export function emitErrorChannelDeclarations(context: CFunctionContext): string[] {
  return context.errorChannelUsed ? ['int ccjs_error_active = 0;'] : []
}

export function emitBoxedValueDeclarations(context: CFunctionContext): string[] {
  return context.boxedValues.map((name: string) =>
    isRuntimeBoxedValueType(context.boxedValueTypes.get(name)) ? `ccjs_value* ${name} = 0;` : `double* ${name} = 0;`
  )
}

export function emitOwnedValueCleanup(context: CFunctionContext): string[] {
  return [
    ...context.ownedCryptoHmacs.toReversed().map((name: string) => `ccjs_crypto_hmac_free(${name});`),
    ...context.ownedCryptoHashes.toReversed().map((name: string) => `ccjs_crypto_hash_free(${name});`),
    ...context.ownedValues.toReversed().map((name: string) => `ccjs_release(${name});`)
  ]
}

export function emitOwnedPromiseCleanup(context: CFunctionContext): string[] {
  return context.ownedPromises.toReversed().flatMap((name: string) => {
    const release = `if (${name} != 0) ccjs_promise_release(${name});`

    if (context.unhandledRejectionFlag == null) {
      return [release]
    }

    return [
      `if (${name} != 0 && ccjs_promise_is_unhandled_rejection(${name})) {`,
      '  fprintf(stderr, "Unhandled Promise rejection\\n");',
      `  ${context.unhandledRejectionFlag} = 1;`,
      '}',
      release
    ]
  })
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

  return [
    `while (ccjs_loop_has_work(${loop})) {`,
    ...emitEventLoopSleepUntilNextTimerLines(context, '  '),
    `  ${emitStatusCheck(`ccjs_loop_poll(${loop}, ${emitEventLoopCurrentTimeExpression()})`, context)}`,
    '}'
  ]
}

export function emitEventLoopCleanup(context: CFunctionContext): string[] {
  return context.eventLoopUsed && !context.externalEventLoop
    ? ['if (ccjs_loop_active) ccjs_loop_dispose(&ccjs_loop);']
    : []
}

export function emitEventLoopReference(context: CFunctionContext): string {
  return context.externalEventLoop ? 'ccjs_loop' : '&ccjs_loop'
}

export function emitEventLoopNextTimeExpression(context: CFunctionContext): string {
  return emitEventLoopCurrentTimeExpression()
}

export function emitEventLoopCurrentTimeExpression(): string {
  return 'ccjs_performance_now()'
}

export function emitEventLoopSleepUntilNextTimerLines(context: CFunctionContext, indent = ''): string[] {
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
  return context.boxedValues
    .toReversed()
    .flatMap((name: string) =>
      isRuntimeBoxedValueType(context.boxedValueTypes.get(name))
        ? [
            `if (${name} != 0) {`,
            `  ccjs_release(*${name});`,
            `  ccjs_default_free(0, ${name}, sizeof(ccjs_value), _Alignof(ccjs_value));`,
            '}'
          ]
        : [`if (${name} != 0) ccjs_default_free(0, ${name}, sizeof(double), _Alignof(double));`]
    )
}

export function isRuntimeBoxedValueType(valueType: any): boolean {
  return ['string', 'object'].includes(valueType)
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
  const lines = ['if (ccjs_status_result != CCJS_OK) return ccjs_status_result;']

  if (context.returnType !== 'void') {
    lines.push(`*${context.functionReturnOut} = ccjs_return;`)
  }

  lines.push('return CCJS_OK;')

  return lines
}

export function nextCName(context: CFunctionContext, prefix: string): string {
  const name = `${prefix}_${context.nextId}`
  context.nextId += 1

  return name
}

export function withVariableScope(context: CFunctionContext, callback: () => any): any {
  const previous = context.variables
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
  context.variables = new Map(previous)
  context.arrayShapes = new Map(previousArrayShapes)
  context.boxedVariables = new Set(previousBoxedVariables)
  context.classInstanceTypes = new Map(previousClassInstanceTypes)
  context.errorObjectNames = new Set(previousErrorObjectNames)
  context.functionTypes = new Map(previousFunctionTypes)
  context.mapTypes = new Map(previousMapTypes)
  context.narrowedNullableScalars = new Set(previousNarrowedNullableScalars)
  context.nullableVariables = new Set(previousNullableVariables)
  context.objectShapes = new Map(previousObjectShapes)
  context.promiseConstructorHandlers = new Map(previousPromiseConstructorHandlers)
  context.promiseRejectionValueTypes = new Map(previousPromiseRejectionValueTypes)
  context.promiseValueTypes = new Map(previousPromiseValueTypes)
  context.runtimeCallbacks = new Set(previousRuntimeCallbacks)
  context.runtimeArrayElementTypes = new Map(previousRuntimeArrayElementTypes)
  context.setElementTypes = new Map(previousSetElementTypes)
  context.runtimeStrings = new Set(previousRuntimeStrings)

  try {
    return callback()
  } finally {
    context.variables = previous
    context.arrayShapes = previousArrayShapes
    context.boxedVariables = previousBoxedVariables
    context.classInstanceTypes = previousClassInstanceTypes
    context.errorObjectNames = previousErrorObjectNames
    context.functionTypes = previousFunctionTypes
    context.mapTypes = previousMapTypes
    context.narrowedNullableScalars = previousNarrowedNullableScalars
    context.nullableVariables = previousNullableVariables
    context.objectShapes = previousObjectShapes
    context.promiseConstructorHandlers = previousPromiseConstructorHandlers
    context.promiseRejectionValueTypes = previousPromiseRejectionValueTypes
    context.promiseValueTypes = previousPromiseValueTypes
    context.runtimeCallbacks = previousRuntimeCallbacks
    context.runtimeArrayElementTypes = previousRuntimeArrayElementTypes
    context.setElementTypes = previousSetElementTypes
    context.runtimeStrings = previousRuntimeStrings
  }
}

export function withNullableScalarNarrowing(context: CFunctionContext, names: string[], callback: () => any): any {
  if (names.length === 0) {
    return callback()
  }

  const previous = context.narrowedNullableScalars
  context.narrowedNullableScalars = new Set(previous)

  for (const name of names) {
    context.narrowedNullableScalars.add(name)
  }

  try {
    return callback()
  } finally {
    context.narrowedNullableScalars = previous
  }
}

export function narrowNullableScalars(context: CFunctionContext, names: string[]): void {
  for (const name of names) {
    context.narrowedNullableScalars.add(name)
  }
}
