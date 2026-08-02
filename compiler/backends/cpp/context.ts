import type { AnyNode, Diagnostic, IrFunctionEffect } from '../../types.ts'
import type { RuntimeEntrypointAdapterDescriptor } from '../../extensions/types.ts'
import type {
  CAsyncTaskWrapper,
  CCallbackWrapper,
  CClassInfo,
  CFunctionParam,
  CFunctionPointerAdapter,
  CFunctionPointerRuntimeAdapter,
  CPreparedFunctionCompanion,
  CFunctionType,
  CObjectAccessorReturnPath,
  CObjectShape,
  CObjectShapeField,
  CRuntimeTypeAlternative,
  CAsyncResultChainWrapper,
  CAsyncResultConstructorHandler,
  CCompilerLibrarySet,
  CTypeRefMap
} from './types.ts'
import { emitCIdentifier } from './identifiers.ts'
import {
  emitCReturnType,
  isManagedRuntimeReturnType,
  isNullableScalarType,
  isOpaqueRuntimeValueType,
  libraryNativeCppType,
  compilerLibraryIntrinsicNativeCppType,
  compilerLibraryNativeRuntimeValueExpressionForId,
  requireCompilerLibraryAsyncResultCppType
} from './value-types.ts'

export type CLoopFlowTarget = {
  label: string
  throughFinally: boolean
  used?: boolean
}

export type CAsyncTaskWrapperMap = Map<string, CAsyncTaskWrapper>
export type CBooleanMap = Map<string, boolean>
export type CCallbackWrapperMap = Map<string, CCallbackWrapper>
export type CFunctionTypeMap = Map<string, CFunctionType>
export type CFunctionPointerAdapterMap = Map<string, string>
export type CObjectShapeFieldMap = Map<string, CObjectShapeField[]>
export type CObjectAccessorReturnPathMap = Map<string, CObjectAccessorReturnPath>
export type CAsyncResultChainWrapperMap = Map<string, CAsyncResultChainWrapper>
export type CAsyncResultConstructorHandlerMap = Map<string, CAsyncResultConstructorHandler>
export type CStringMap = Map<string, string>
export type CStringNullableMap = Map<string, string | null>
export type CStringSet = Set<string>

function emitCLocalName(name: string): string {
  return emitCIdentifier(name)
}

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

export function cloneCFunctionTypeMap(values: CFunctionTypeMap | null | undefined): CFunctionTypeMap {
  const result: CFunctionTypeMap = new Map()

  if (values === null || typeof values === 'undefined') {
    return result
  }

  return new Map(values)
}

export function cloneCObjectShapeFieldMap(values: CObjectShapeFieldMap | null | undefined): CObjectShapeFieldMap {
  const result: CObjectShapeFieldMap = new Map()

  if (values === null || typeof values === 'undefined') {
    return result
  }

  return new Map(values)
}

export function cloneCAsyncResultConstructorHandlerMap(
  values: CAsyncResultConstructorHandlerMap | null | undefined
): CAsyncResultConstructorHandlerMap {
  const result: CAsyncResultConstructorHandlerMap = new Map()

  if (values === null || typeof values === 'undefined') {
    return result
  }

  return new Map(values)
}

export type CEmitContextWithDependencies<
  AsyncTaskDependencies,
  ClassDependencies,
  NullableDependencies,
  StatementDependencies,
  StringDependencies
> = {
  asyncTaskLoweringDependencies: AsyncTaskDependencies
  asyncTaskWrappers: CAsyncTaskWrapperMap
  boxedMutableCaptureDeclarations: Set<AnyNode>
  callbackArrowWrappers: Map<AnyNode, CCallbackWrapper>
  callbackWrappers: CCallbackWrapperMap
  classInfos: Map<string, CClassInfo>
  classLoweringDependencies: ClassDependencies
  diagnostics: Diagnostic[]
  explicitEventLoop?: boolean | null
  exceptionValueShape: CObjectShape | null
  externalEventLoopFunctions: CStringSet
  functionAsyncFlags: CBooleanMap
  functionNames: CStringMap
  functionParams: Map<string, CFunctionParam[]>
  functionPointerAdapterNames: CFunctionPointerAdapterMap
  functionPointerAdapters: CFunctionPointerAdapter[]
  functionPointerRuntimeAdapterNames: Map<string, CFunctionPointerRuntimeAdapter>
  functionPointerRuntimeAdapters: CFunctionPointerRuntimeAdapter[]
  functionReturnDeclaredTypes: CStringNullableMap
  functionReturnNullables: CBooleanMap
  functionReturnRuntimeTypeAlternatives: Map<string, CRuntimeTypeAlternative[]>
  functionReturnAsyncResultValueTypes: CStringNullableMap
  functionReturnShapes: Map<string, CObjectShape | null>
  functionReturnTypeRefs: CTypeRefMap
  functionReturnTypes: CStringMap
  functionThrowValueTypes: Map<string, IrFunctionEffect['throwValueTypes']>
  forceRuntimeStringDeclarations?: CStringSet
  jsGlobalRoots: CStringSet
  libraries: CCompilerLibrarySet
  runtimeInitializerDefinitions: string[]
  moduleCompileTimeValueInitializers: CStringMap
  moduleValueNames: CStringMap
  moduleValueCppTypes: CStringMap
  moduleRuntimeValueNames: CStringSet
  objectAccessorReturnPaths: CObjectAccessorReturnPathMap
  moduleObjectShapes: CObjectShapeFieldMap
  moduleValueTypes: CStringMap
  nextId: number
  nullableLoweringDependencies: NullableDependencies
  pendingExceptionFunctions: CStringSet
  runtimeEntryPath: string | null
  runtimeEntrypointAdapter: RuntimeEntrypointAdapterDescriptor | null
  asyncResultChainArrowWrappers: Map<AnyNode, CAsyncResultChainWrapper>
  asyncResultChainWrappers: CAsyncResultChainWrapperMap
  runtimeFunctionParams: CFunctionTypeMap
  statementLoweringDependencies: StatementDependencies
  stringLoweringDependencies: StringDependencies
  throwingFunctions: CStringSet
  unhandledRejectionFlag: string | null
}

export type CEmitContext = CEmitContextWithDependencies<object, object, object, object, object>

export type CFailureContext = {
  cleanupEnabled: boolean
  coroutine?: boolean
  failureStatement?: string | null
  failureStatementUsed?: boolean
  returnNullable?: boolean
  returnShape?: CObjectShape | null
  returnType?: string
  statusReturn: boolean
}

export type CNameContext = {
  nextId: number
}

export type CEventLoopContext = {
  eventLoopUsed: boolean
  explicitEventLoop?: boolean | null
  externalEventLoop: boolean
}

export type COwnedValueContext = {
  ownedValues: string[]
}

export type COwnedAsyncResultContext = {
  ownedAsyncResults: string[]
  asyncResultRejectionValueTypes: CStringMap
  asyncResultValueTypes: CStringMap
  variables: CStringMap
}

type CBoxedValueContext = {
  boxedValueTypes: CStringMap
  boxedValues: string[]
}

type CNullableScalarContext = {
  narrowedNullableScalars: CStringSet
}

type CVariableScopeContext = {
  boxedVariables: CStringSet
  classInstanceTypes: CStringMap
  cppStringValues: CStringSet
  cppValueTypes: CStringMap
  exceptionValueNames: CStringSet
  functionTypes: CFunctionTypeMap
  localValueNames: CStringSet
  moduleValueDeclarationScope: boolean
  narrowedNullableScalars: CStringSet
  nullableVariables: CStringSet
  objectAliases: CStringMap
  objectDeclaredTypes: CStringMap
  objectShapes: CObjectShapeFieldMap
  asyncResultConstructorHandlers: CAsyncResultConstructorHandlerMap
  asyncResultRejectionValueTypes: CStringMap
  asyncResultValueTypes: CStringMap
  runtimeCallbacks: CStringSet
  runtimeStringValues: CStringMap
  runtimeStrings: CStringSet
  runtimeValueStorageNames: CStringSet
  variables: CStringMap
}

export type CFunctionContextWithDependencies<
  AsyncTaskDependencies,
  ClassDependencies,
  NullableDependencies,
  StatementDependencies,
  StringDependencies
> = CEmitContextWithDependencies<
  AsyncTaskDependencies,
  ClassDependencies,
  NullableDependencies,
  StatementDependencies,
  StringDependencies
> & {
  breakFlowUsed: boolean
  breakTargets: CLoopFlowTarget[]
  boxedValueTypes: CStringMap
  boxedValues: string[]
  boxedVariables: CStringSet
  classInstanceTypes: CStringMap
  cleanupEnabled: boolean
  coroutine: boolean
  continueFlowUsed: boolean
  continueTargets: CLoopFlowTarget[]
  cppStringValues: CStringSet
  cppValueTypes: CStringMap
  deferredThrownCheckDepth: number
  deferredThrownCheckCount: number
  errorChannelUsed: boolean
  exceptionValueNames: CStringSet
  errorTargets: string[]
  errorTargetActiveFlags: boolean[]
  eventLoopUsed: boolean
  explicitEventLoop: boolean
  externalEventLoop: boolean
  failureStatement?: string | null
  failureStatementUsed?: boolean
  returnFunctionCompanions: CPreparedFunctionCompanion[]
  returnFunctionType: CFunctionType | null
  functionTypes: CFunctionTypeMap
  localValueNames: CStringSet
  moduleValueDeclarationScope: boolean
  narrowedNullableScalars: CStringSet
  nullableVariables: CStringSet
  objectAliases: CStringMap
  objectDeclaredTypes: CStringMap
  ownedAsyncResults: string[]
  ownedValues: string[]
  objectShapes: CObjectShapeFieldMap
  asyncResultConstructorHandlers: CAsyncResultConstructorHandlerMap
  asyncResultRejectionValueTypes: CStringMap
  asyncResultValueTypes: CStringMap
  returnNullable: boolean
  returnLibraryNative: boolean
  returnFlowUsed: boolean
  returnShape?: CObjectShape | null
  returnTargets: string[]
  returnType: string
  runtimeCallbackCleanupLabel?: string
  runtimeCallbackReturnOut?: string
  runtimeCallbackReturnShape?: CObjectShape | null
  runtimeCallbackReturnType?: string
  runtimeCallbacks: CStringSet
  runtimeStringValues: CStringMap
  runtimeStrings: CStringSet
  runtimeValueStorageNames: CStringSet
  statusReturn: boolean
  usedRuntimeCallbackCleanupGoto?: boolean
  variables: CStringMap
}

export type CFunctionContext = CFunctionContextWithDependencies<object, object, object, object, object>

export type CVariableScopeSnapshot = {
  boxedVariables: CStringSet
  classInstanceTypes: CStringMap
  cppStringValues: CStringSet
  cppValueTypes: CStringMap
  exceptionValueNames: CStringSet
  functionTypes: CFunctionTypeMap
  localValueNames: CStringSet
  narrowedNullableScalars: CStringSet
  nullableVariables: CStringSet
  objectAliases: CStringMap
  objectDeclaredTypes: CStringMap
  objectShapes: CObjectShapeFieldMap
  asyncResultConstructorHandlers: CAsyncResultConstructorHandlerMap
  asyncResultRejectionValueTypes: CStringMap
  asyncResultValueTypes: CStringMap
  runtimeCallbacks: CStringSet
  runtimeStringValues: CStringMap
  runtimeStrings: CStringSet
  runtimeValueStorageNames: CStringSet
  variables: CStringMap
}

export type CNullableScalarNarrowingSnapshot = {
  active: boolean
  narrowedNullableScalars: CStringSet
}

export function createFunctionContext<
  AsyncTaskDependencies,
  ClassDependencies,
  NullableDependencies,
  StatementDependencies,
  StringDependencies
>(
  baseContext: CEmitContextWithDependencies<
    AsyncTaskDependencies,
    ClassDependencies,
    NullableDependencies,
    StatementDependencies,
    StringDependencies
  >,
  returnType: string,
  returnNullable: boolean
): CFunctionContextWithDependencies<
  AsyncTaskDependencies,
  ClassDependencies,
  NullableDependencies,
  StatementDependencies,
  StringDependencies
> {
  return {
    asyncTaskLoweringDependencies: baseContext.asyncTaskLoweringDependencies,
    asyncTaskWrappers: baseContext.asyncTaskWrappers,
    boxedMutableCaptureDeclarations: baseContext.boxedMutableCaptureDeclarations,
    callbackArrowWrappers: baseContext.callbackArrowWrappers,
    callbackWrappers: baseContext.callbackWrappers,
    classInfos: baseContext.classInfos,
    classLoweringDependencies: baseContext.classLoweringDependencies,
    diagnostics: baseContext.diagnostics,
    exceptionValueShape: baseContext.exceptionValueShape,
    externalEventLoopFunctions: baseContext.externalEventLoopFunctions,
    forceRuntimeStringDeclarations: baseContext.forceRuntimeStringDeclarations,
    functionAsyncFlags: baseContext.functionAsyncFlags,
    functionNames: baseContext.functionNames,
    functionParams: baseContext.functionParams,
    functionPointerAdapterNames: baseContext.functionPointerAdapterNames,
    functionPointerAdapters: baseContext.functionPointerAdapters,
    functionPointerRuntimeAdapterNames: baseContext.functionPointerRuntimeAdapterNames,
    functionPointerRuntimeAdapters: baseContext.functionPointerRuntimeAdapters,
    functionReturnDeclaredTypes: baseContext.functionReturnDeclaredTypes,
    functionReturnNullables: baseContext.functionReturnNullables,
    functionReturnRuntimeTypeAlternatives: baseContext.functionReturnRuntimeTypeAlternatives,
    functionReturnAsyncResultValueTypes: baseContext.functionReturnAsyncResultValueTypes,
    functionReturnShapes: baseContext.functionReturnShapes,
    functionReturnTypeRefs: baseContext.functionReturnTypeRefs,
    functionReturnTypes: baseContext.functionReturnTypes,
    functionThrowValueTypes: baseContext.functionThrowValueTypes,
    jsGlobalRoots: baseContext.jsGlobalRoots,
    libraries: baseContext.libraries,
    runtimeInitializerDefinitions: baseContext.runtimeInitializerDefinitions,
    moduleCompileTimeValueInitializers: baseContext.moduleCompileTimeValueInitializers,
    moduleValueNames: baseContext.moduleValueNames,
    moduleValueCppTypes: baseContext.moduleValueCppTypes,
    moduleRuntimeValueNames: baseContext.moduleRuntimeValueNames,
    objectAccessorReturnPaths: baseContext.objectAccessorReturnPaths,
    moduleObjectShapes: baseContext.moduleObjectShapes,
    moduleValueTypes: baseContext.moduleValueTypes,
    nextId: baseContext.nextId,
    nullableLoweringDependencies: baseContext.nullableLoweringDependencies,
    pendingExceptionFunctions: baseContext.pendingExceptionFunctions,
    runtimeEntryPath: baseContext.runtimeEntryPath,
    runtimeEntrypointAdapter: baseContext.runtimeEntrypointAdapter,
    asyncResultChainArrowWrappers: baseContext.asyncResultChainArrowWrappers,
    asyncResultChainWrappers: baseContext.asyncResultChainWrappers,
    runtimeFunctionParams: baseContext.runtimeFunctionParams,
    statementLoweringDependencies: baseContext.statementLoweringDependencies,
    stringLoweringDependencies: baseContext.stringLoweringDependencies,
    throwingFunctions: baseContext.throwingFunctions,
    unhandledRejectionFlag: baseContext.unhandledRejectionFlag,
    breakFlowUsed: false,
    breakTargets: [],
    boxedValueTypes: new Map(),
    boxedValues: [],
    boxedVariables: new Set(),
    classInstanceTypes: new Map(),
    cppStringValues: new Set(),
    cppValueTypes: cloneCStringMap(baseContext.moduleValueCppTypes),
    continueFlowUsed: false,
    continueTargets: [],
    deferredThrownCheckDepth: 0,
    deferredThrownCheckCount: 0,
    cleanupEnabled: true,
    coroutine: false,
    errorChannelUsed: false,
    exceptionValueNames: new Set(),
    errorTargets: [],
    errorTargetActiveFlags: [],
    returnFunctionCompanions: [],
    returnFunctionType: null,
    functionTypes: new Map(),
    localValueNames: new Set(),
    eventLoopUsed: false,
    explicitEventLoop: false,
    externalEventLoop: false,
    moduleValueDeclarationScope: false,
    narrowedNullableScalars: new Set(),
    nullableVariables: new Set(),
    objectAliases: new Map(),
    objectDeclaredTypes: new Map(),
    objectShapes: cloneCObjectShapeFieldMap(baseContext.moduleObjectShapes),
    ownedAsyncResults: [],
    ownedValues: [],
    asyncResultRejectionValueTypes: new Map(),
    asyncResultConstructorHandlers: new Map(),
    asyncResultValueTypes: new Map(),
    returnFlowUsed: false,
    returnLibraryNative: false,
    returnTargets: [],
    runtimeCallbacks: new Set(),
    runtimeStringValues: new Map(),
    runtimeStrings: new Set(),
    runtimeValueStorageNames: cloneCStringSet(baseContext.moduleRuntimeValueNames),
    statusReturn: false,
    variables: cloneCStringMap(baseContext.moduleValueTypes),
    returnNullable: returnNullable,
    returnType: returnType
  }
}

export function emitStatusCheck(call: string, context: CFailureContext): string {
  return `if (${call} != INOX_OK) ${emitFailureStatement(context)}`
}

export function emitRuntimeTypeCheck(condition: string, context: CFailureContext): string {
  return `if (${condition}) ${emitFailureStatement(context)}`
}

export function emitFailureStatement(context: CFailureContext): string {
  const failureStatement = context.failureStatement

  if (failureStatement !== null && typeof failureStatement !== 'undefined') {
    context.failureStatementUsed = true
    return failureStatement
  }

  if (context.statusReturn) {
    return 'return INOX_ERR_TYPE;'
  }

  if (context.cleanupEnabled) {
    return 'goto cleanup;'
  }

  if (context.coroutine === true) {
    return 'co_return inox::Value(inox_undefined_value());'
  }

  if (context.returnType === 'void') {
    return 'return;'
  }

  if (context.returnNullable !== true && libraryNativeCppType(context.returnShape) !== null) {
    return 'return {};'
  }

  if (
    context.returnType === 'unknown' ||
    isManagedRuntimeReturnType(context.returnType) ||
    isOpaqueRuntimeValueType(context.returnType)
  ) {
    return 'return inox_undefined_value();'
  }

  return 'return 0;'
}

export function registerOwnedValue(context: COwnedValueContext, name: string): void {
  if (!stringArrayHas(context.ownedValues, name)) {
    context.ownedValues.push(name)
  }
}

export function registerOwnedAsyncResult(
  context: COwnedAsyncResultContext,
  name: string,
  valueType: string = 'unknown',
  rejectionValueType: string = 'unknown'
): void {
  if (!stringArrayHas(context.ownedAsyncResults, name)) {
    context.ownedAsyncResults.push(name)
  }

  context.variables.set(name, 'async-result')
  context.asyncResultValueTypes.set(name, valueType)
  context.asyncResultRejectionValueTypes.set(name, rejectionValueType)
}

export function registerEventLoop(context: CEventLoopContext): void {
  context.eventLoopUsed = true
}

export function registerBoxedValue(context: CBoxedValueContext, name: string, valueType: string = 'number'): void {
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

type COwnedValueWriteStorage = 'local' | 'raw'

export function emitPrepareOwnedValueWrite(name: string, storage: COwnedValueWriteStorage = 'local'): string[] {
  const reference = emitOwnedValueReference(name, storage)

  if (storage === 'raw') {
    return [`inox_release(${reference});`, `${reference} = inox_undefined_value();`]
  }

  return [`${reference} = inox_undefined_value();`]
}

function emitOwnedValueReference(name: string, storage: COwnedValueWriteStorage): string {
  if (storage === 'raw') {
    return name
  }

  return emitCIdentifier(name)
}

type CReturnValueDeclarationContext = {
  cleanupEnabled?: boolean | null
  libraries?: CCompilerLibrarySet | null
  returnLibraryNative?: boolean | null
  returnFlowUsed?: boolean | null
  returnNullable?: boolean | null
  returnShape?: CObjectShape | null
  returnType?: string | null
}

type CLoopFlowDeclarationContext = {
  breakFlowUsed?: boolean | null
  cleanupEnabled?: boolean | null
  continueFlowUsed?: boolean | null
}

type CReturnFlowDeclarationContext = {
  cleanupEnabled?: boolean | null
  returnFlowUsed?: boolean | null
}

type COwnedValueDeclarationContext = {
  cleanupEnabled?: boolean | null
  ownedValues?: string[] | null
}

type COwnedAsyncResultDeclarationContext = {
  cleanupEnabled?: boolean | null
  libraries: CCompilerLibrarySet
  ownedAsyncResults?: string[] | null
}

type CEventLoopDeclarationContext = {
  cleanupEnabled?: boolean | null
  explicitEventLoop?: boolean | null
  eventLoopUsed?: boolean | null
  externalEventLoop?: boolean | null
}

type CErrorChannelDeclarationContext = {
  cleanupEnabled?: boolean | null
  errorChannelUsed?: boolean | null
}

type CBoxedValueDeclarationContext = {
  boxedValues?: string[] | null
  boxedValueTypes?: CStringMap | null
  cleanupEnabled?: boolean | null
}

export function shouldEmitCleanupLabel(context: CFunctionContext): boolean {
  if (!context.cleanupEnabled) {
    return false
  }

  return (
    emitOwnedValueCleanup(context).length > 0 ||
    emitOwnedAsyncResultCleanup(context).length > 0 ||
    emitEventLoopCleanup(context).length > 0 ||
    emitBoxedValueCleanup(context).length > 0
  )
}

export function replaceCleanupGotosWithReturn(lines: string[], returnStatement: string): string[] {
  const result: string[] = []
  const conditionalSuffix = ' goto cleanup;'

  for (const line of lines) {
    const trimmed = line.trim()

    if (trimmed === 'goto cleanup;') {
      result.push(`${line.slice(0, line.length - line.trimStart().length)}${returnStatement}`)
    } else if (line.endsWith(conditionalSuffix)) {
      result.push(`${line.slice(0, line.length - conditionalSuffix.length)} ${returnStatement}`)
    } else {
      result.push(line)
    }
  }

  return result
}

export function emitReturnValueDeclarations(context: CReturnValueDeclarationContext): string[] {
  let returnType = 'void'

  if (context.returnType !== null && typeof context.returnType !== 'undefined') {
    returnType = context.returnType
  }

  const libraryCppType = libraryNativeCppType(context.returnShape)

  if (context.returnLibraryNative === true && context.returnNullable !== true && libraryCppType !== null) {
    return [`${emitCReturnType(returnType, false, context.returnShape)} inox_return{};`]
  }

  if (returnType === 'async-result') {
    if (context.libraries === null || typeof context.libraries === 'undefined') {
      throw new Error('C async-result return storage requires compiler libraries')
    }

    return [`${requireCompilerLibraryAsyncResultCppType(context.libraries, null)} inox_return{};`]
  }

  if (context.returnNullable !== true && libraryCppType !== null) {
    return [`${emitCReturnType(returnType, false, context.returnShape)} inox_return{};`]
  }

  if (context.returnNullable === true && isNullableScalarType(returnType)) {
    return ['inox_value inox_return = inox_undefined_value();']
  }

  if (
    returnType === 'function' ||
    returnType === 'unknown' ||
    isManagedRuntimeReturnType(returnType) ||
    isOpaqueRuntimeValueType(returnType)
  ) {
    return ['inox_value inox_return = inox_undefined_value();']
  }

  if (returnType !== 'void') {
    return ['double inox_return = 0;']
  }

  return []
}

export function emitMainReturnValueDeclarations(context: CReturnValueDeclarationContext): string[] {
  if (context.returnFlowUsed === true) {
    return emitReturnValueDeclarations(context)
  }

  return []
}

export function emitLoopFlowDeclarations(context: CLoopFlowDeclarationContext): string[] {
  const lines: string[] = []

  if (context.breakFlowUsed) {
    lines.push('int inox_break_active = 0;')
  }

  if (context.continueFlowUsed) {
    lines.push('int inox_continue_active = 0;')
  }

  return lines
}

export function emitReturnFlowDeclarations(context: CReturnFlowDeclarationContext): string[] {
  if (context.returnFlowUsed) {
    return ['int inox_return_active = 0;']
  }

  return []
}

export function emitOwnedValueDeclarations(context: COwnedValueDeclarationContext): string[] {
  const lines: string[] = []
  let ownedValues: string[] = []

  if (context.ownedValues !== null && typeof context.ownedValues !== 'undefined') {
    ownedValues = context.ownedValues
  }

  for (const name of ownedValues) {
    lines.push(`inox::Value ${emitCLocalName(name)};`)
  }

  return lines
}

export function emitOwnedAsyncResultDeclarations(context: COwnedAsyncResultDeclarationContext): string[] {
  const lines: string[] = []
  let ownedAsyncResults: string[] = []
  const cppType = compilerLibraryIntrinsicNativeCppType(context.libraries, 'async-result')

  if (cppType === null) {
    return lines
  }

  if (context.ownedAsyncResults !== null && typeof context.ownedAsyncResults !== 'undefined') {
    ownedAsyncResults = context.ownedAsyncResults
  }

  for (const name of ownedAsyncResults) {
    lines.push(`${cppType} ${emitCLocalName(name)};`)
  }

  return lines
}

export function emitEventLoopDeclarations(context: CEventLoopDeclarationContext): string[] {
  if (context.eventLoopUsed === true && context.externalEventLoop !== true) {
    return ['inox::RuntimeContext inox_runtime(&inox_default_allocator);']
  }

  return []
}

export function emitErrorChannelDeclarations(context: CErrorChannelDeclarationContext): string[] {
  if (context.errorChannelUsed === true) {
    return ['int inox_error_active = 0;']
  }

  return []
}

export function emitBoxedValueDeclarations(context: CBoxedValueDeclarationContext): string[] {
  const lines: string[] = []
  let boxedValues: string[] = []
  let boxedValueTypes: CStringMap = new Map()

  if (context.boxedValues !== null && typeof context.boxedValues !== 'undefined') {
    boxedValues = context.boxedValues
  }

  if (context.boxedValueTypes !== null && typeof context.boxedValueTypes !== 'undefined') {
    boxedValueTypes = context.boxedValueTypes
  }

  for (const name of boxedValues) {
    if (isRuntimeBoxedValueType(boxedValueTypes.get(name))) {
      lines.push(`inox_shared_value_box* ${emitCLocalName(name)} = 0;`)
    } else {
      lines.push(`inox_shared_number_box* ${emitCLocalName(name)} = 0;`)
    }
  }

  return lines
}

export function emitOwnedValueCleanup(_context: CFunctionContext): string[] {
  return []
}

export function emitOwnedAsyncResultCleanup(_context: CFunctionContext): string[] {
  return []
}

export function emitEventLoopInit(context: CFunctionContext): string[] {
  if (!context.eventLoopUsed) {
    return []
  }

  if (context.externalEventLoop) {
    if (context.explicitEventLoop) {
      return [`if (inox_loop == 0) ${emitFailureStatement(context)}`]
    }

    return []
  }

  return [`if (!inox_runtime) ${emitFailureStatement(context)}`]
}

export function emitEventLoopDrain(context: CFunctionContext): string[] {
  if (!context.eventLoopUsed || context.externalEventLoop) {
    return []
  }

  return [emitStatusCheck('inox::run()', context)]
}

export function emitEventLoopCleanup(_context: CFunctionContext): string[] {
  return []
}

export function emitEventLoopReference(context: CEventLoopContext): string {
  if (context.externalEventLoop) {
    if (!context.explicitEventLoop) {
      return 'inox::loop()'
    }

    return 'inox_loop'
  }

  return 'inox::loop()'
}

export function emitBoxedValueCleanup(context: CFunctionContext): string[] {
  const lines: string[] = []

  for (let index = context.boxedValues.length - 1; index >= 0; index--) {
    const name = context.boxedValues[index]

    if (name === null || typeof name === 'undefined') {
      continue
    }

    const localName = emitCLocalName(name)

    if (isRuntimeBoxedValueType(context.boxedValueTypes.get(name))) {
      lines.push(`inox_shared_value_box_release(${localName});`)
    } else {
      lines.push(`inox_shared_number_box_release(${localName});`)
    }
  }

  return lines
}

export function isRuntimeBoxedValueType(valueType: string | null | undefined): boolean {
  return valueType === 'string' || valueType === 'object'
}

export function emitCleanupReturn(context: CFunctionContext): string[] {
  if (context.coroutine) {
    return [emitCoroutineReturnStatement(context)]
  }

  if (isManagedRuntimeReturnType(context.returnType)) {
    return ['return inox_return;']
  }

  if (context.returnType !== 'void') {
    return ['return inox_return;']
  }

  return ['return;']
}

export function emitCoroutineReturnStatement(context: CFunctionContext): string {
  if (context.returnType === 'void') {
    return 'co_return inox::Value(inox_undefined_value());'
  }

  if (context.returnNullable !== true && context.returnType === 'boolean') {
    return 'co_return inox::Value(inox_bool_value(inox_return != 0));'
  }

  if (context.returnNullable !== true && context.returnType === 'number') {
    return 'co_return inox::Value(inox_number_value(inox_return));'
  }

  const libraryTypeId = context.returnShape?.libraryTypeId

  if (libraryTypeId !== null && typeof libraryTypeId !== 'undefined') {
    const expression = compilerLibraryNativeRuntimeValueExpressionForId(context.libraries, libraryTypeId)

    if (expression !== null) {
      return `co_return inox::Value(${expression.split('$value').join('inox_return')});`
    }

    if (libraryNativeCppType(context.returnShape) !== null) {
      return 'co_return inox::Value(inox_return);'
    }
  }

  return 'co_return inox::adopt(inox_return);'
}

export function nextCName(context: CNameContext, prefix: string): string {
  const name = `${prefix}_${context.nextId}`
  context.nextId = context.nextId + 1

  return name
}

export function pushVariableScope(context: CVariableScopeContext): CVariableScopeSnapshot {
  const previousVariables = context.variables
  const previousBoxedVariables = context.boxedVariables
  const previousClassInstanceTypes = context.classInstanceTypes
  const previousCppStringValues = context.cppStringValues
  const previousCppValueTypes = context.cppValueTypes
  const previousExceptionValueNames = context.exceptionValueNames
  const previousFunctionTypes = context.functionTypes
  const previousLocalValueNames = context.localValueNames
  const previousNarrowedNullableScalars = context.narrowedNullableScalars
  const previousNullableVariables = context.nullableVariables
  const previousObjectAliases = context.objectAliases
  const previousObjectDeclaredTypes = context.objectDeclaredTypes
  const previousObjectShapes = context.objectShapes
  const previousAsyncResultConstructorHandlers = context.asyncResultConstructorHandlers
  const previousAsyncResultRejectionValueTypes = context.asyncResultRejectionValueTypes
  const previousAsyncResultValueTypes = context.asyncResultValueTypes
  const previousRuntimeCallbacks = context.runtimeCallbacks
  const previousRuntimeStringValues = context.runtimeStringValues
  const previousRuntimeStrings = context.runtimeStrings
  const previousRuntimeValueStorageNames = context.runtimeValueStorageNames

  context.variables = cloneCStringMap(previousVariables)
  context.boxedVariables = cloneCStringSet(previousBoxedVariables)
  context.classInstanceTypes = cloneCStringMap(previousClassInstanceTypes)
  context.cppStringValues = cloneCStringSet(previousCppStringValues)
  context.cppValueTypes = cloneCStringMap(previousCppValueTypes)
  context.exceptionValueNames = cloneCStringSet(previousExceptionValueNames)
  context.functionTypes = cloneCFunctionTypeMap(previousFunctionTypes)
  context.localValueNames = cloneCStringSet(previousLocalValueNames)
  context.narrowedNullableScalars = cloneCStringSet(previousNarrowedNullableScalars)
  context.nullableVariables = cloneCStringSet(previousNullableVariables)
  context.objectAliases = cloneCStringMap(previousObjectAliases)
  context.objectDeclaredTypes = new Map(previousObjectDeclaredTypes)
  context.objectShapes = cloneCObjectShapeFieldMap(previousObjectShapes)
  context.asyncResultConstructorHandlers = cloneCAsyncResultConstructorHandlerMap(previousAsyncResultConstructorHandlers)
  context.asyncResultRejectionValueTypes = cloneCStringMap(previousAsyncResultRejectionValueTypes)
  context.asyncResultValueTypes = cloneCStringMap(previousAsyncResultValueTypes)
  context.runtimeCallbacks = cloneCStringSet(previousRuntimeCallbacks)
  context.runtimeStringValues = cloneCStringMap(previousRuntimeStringValues)
  context.runtimeStrings = cloneCStringSet(previousRuntimeStrings)
  context.runtimeValueStorageNames = cloneCStringSet(previousRuntimeValueStorageNames)

  return {
    boxedVariables: previousBoxedVariables,
    classInstanceTypes: previousClassInstanceTypes,
    cppStringValues: previousCppStringValues,
    cppValueTypes: previousCppValueTypes,
    exceptionValueNames: previousExceptionValueNames,
    functionTypes: previousFunctionTypes,
    localValueNames: previousLocalValueNames,
    narrowedNullableScalars: previousNarrowedNullableScalars,
    nullableVariables: previousNullableVariables,
    objectAliases: previousObjectAliases,
    objectDeclaredTypes: previousObjectDeclaredTypes,
    objectShapes: previousObjectShapes,
    asyncResultConstructorHandlers: previousAsyncResultConstructorHandlers,
    asyncResultRejectionValueTypes: previousAsyncResultRejectionValueTypes,
    asyncResultValueTypes: previousAsyncResultValueTypes,
    runtimeCallbacks: previousRuntimeCallbacks,
    runtimeStringValues: previousRuntimeStringValues,
    runtimeStrings: previousRuntimeStrings,
    runtimeValueStorageNames: previousRuntimeValueStorageNames,
    variables: previousVariables
  }
}

export function restoreVariableScope(context: CVariableScopeContext, snapshot: CVariableScopeSnapshot): void {
  context.variables = snapshot.variables
  context.boxedVariables = snapshot.boxedVariables
  context.classInstanceTypes = snapshot.classInstanceTypes
  context.cppStringValues = snapshot.cppStringValues
  context.cppValueTypes = snapshot.cppValueTypes
  context.exceptionValueNames = snapshot.exceptionValueNames
  context.functionTypes = snapshot.functionTypes
  context.localValueNames = snapshot.localValueNames
  context.narrowedNullableScalars = snapshot.narrowedNullableScalars
  context.nullableVariables = snapshot.nullableVariables
  context.objectAliases = snapshot.objectAliases
  context.objectDeclaredTypes = snapshot.objectDeclaredTypes
  context.objectShapes = snapshot.objectShapes
  context.asyncResultConstructorHandlers = snapshot.asyncResultConstructorHandlers
  context.asyncResultRejectionValueTypes = snapshot.asyncResultRejectionValueTypes
  context.asyncResultValueTypes = snapshot.asyncResultValueTypes
  context.runtimeCallbacks = snapshot.runtimeCallbacks
  context.runtimeStringValues = snapshot.runtimeStringValues
  context.runtimeStrings = snapshot.runtimeStrings
  context.runtimeValueStorageNames = snapshot.runtimeValueStorageNames
}

export function pushNullableScalarNarrowing(
  context: CNullableScalarContext,
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
  context: CNullableScalarContext,
  snapshot: CNullableScalarNarrowingSnapshot
): void {
  if (snapshot.active) {
    context.narrowedNullableScalars = snapshot.narrowedNullableScalars
  }
}

export function narrowNullableScalars(context: CNullableScalarContext, names: string[]): void {
  for (const name of names) {
    context.narrowedNullableScalars.add(name)
  }
}
