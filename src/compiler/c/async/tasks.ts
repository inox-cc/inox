import { diagnostic } from '../../diagnostics.ts'
import {
  createFunctionContext,
  emitOwnedValueCleanup,
  emitOwnedValueDeclarations,
  emitPrepareOwnedValueWrite,
  emitRuntimeTypeCheck,
  nextCName,
  withVariableScope,
  type CEmitContext,
  type CFunctionContext
} from '../context.ts'
import { cStringLiteral, emitCIdentifier, utf8ByteLength } from '../identifiers.ts'
import { emitRuntimeValueCheck } from '../runtime-values.ts'
import { cFetchRuntimeExpressionMethod, isAsyncFetchRuntimeCallExpression } from '../stdlib/fetch.ts'
import { cFsRuntimeExpressionMethod, isAsyncFsRuntimeCallExpression } from '../stdlib/fs.ts'
import { cRuntimeValueTag, emitCType, isManagedRuntimeReturnType } from '../value-types.ts'
import {
  cPromiseRuntimeCallName,
  isAsyncFunctionCallee,
  isPromiseReturningFunctionCallee,
  resolveCAsyncFunctionAwaitValueType
} from './promises.ts'
import { isPromiseChainCallbackWrapperWithContext } from './callbacks.ts'
import type { IrFunctionDeclaration } from '../../types.ts'
import type { IrFunctionNodeEntry } from '../../ir.ts'
import type { CPreparedExpression as PreparedExpression } from '../types.ts'


export type AsyncTaskLoweringDependencies = {
  emitCallee: (callee: any, context: CFunctionContext) => string
  emitCValueExpression: (expression: any, context: CFunctionContext) => PreparedExpression
  emitFunctionHead: (statement: any, context: CFunctionContext) => string
  emitFsBooleanFlag: (expression: any, field: string) => string
  emitPreparedCallArgs: (
    expression: any,
    params: any[],
    context: CFunctionContext
  ) => { lines: string[]; args: string[] }
  emitPreparedCallExpression: (expression: any, context: CFunctionContext) => PreparedExpression
  emitPreparedFetchInitOperand: (expression: any, context: CFunctionContext) => PreparedExpression
  emitPreparedFsAccessModeExpression: (expression: any, context: CFunctionContext) => PreparedExpression
  emitPreparedNumberExpression: (expression: any, context: CFunctionContext) => PreparedExpression
  emitPreparedStringBytesOperand: (expression: any, context: CFunctionContext, prefix: string) => {
    lines: string[]
    bytes: string
    length: string
  }
  emitRuntimeArrowCaptureStoreLines: (capture: any, contextName: string, context: CFunctionContext) => string[]
  emitStatementList: (statements: any[], context: CFunctionContext) => string[]
  inferExpressionType: (expression: any, context: CFunctionContext) => string
  isIndexAccessExpression: (expression: any) => boolean
  isMemberAccessExpression: (expression: any) => boolean
  isRuntimeProducedStringExpression: (expression: any, context: CFunctionContext) => boolean
  isThrowingFunctionCallee: (callee: any, context: CFunctionContext) => boolean
  isThrowingFunctionName: (name: string, context: CEmitContext) => boolean
  registerObjectShape: (context: CFunctionContext, name: string, shape: any) => void
  registerRuntimeValueMetadata: (
    name: string,
    valueType: any,
    declaration: any,
    expression: any,
    context: CFunctionContext
  ) => void
  resolveFunctionDeclarationParams: (name: string, fallback: any[], context: CEmitContext) => any[]
  resolveFunctionParams: (callee: any, context: CFunctionContext) => any[] | null
  resolveKnownArrayIndex: (expression: any, context: CFunctionContext) => any | null
  resolveKnownObjectIndex: (expression: any, context: CFunctionContext) => any | null
  resolveKnownObjectMember: (expression: any, context: CFunctionContext) => any | null
  resolveRuntimeArrayElementType: (expression: any, context: CFunctionContext) => string | null
  resolveRuntimeArrayIndex: (expression: any, context: CFunctionContext) => any | null
  resolveRuntimeMapType: (expression: any, context: CFunctionContext) => { key: string; value: string } | null
  resolveRuntimeSetElementType: (expression: any, context: CFunctionContext) => string | null
  resolveRuntimeStringReference: (expression: any, context: CFunctionContext) => string | null
}

function asyncTaskDeps(context: CEmitContext): AsyncTaskLoweringDependencies {
  return context.asyncTaskLoweringDependencies
}

type AsyncTaskSuccessPhaseKind = 'pre-finalizer' | 'prefix-finalizer' | 'body'
type AsyncTaskTryPhaseKind = 'success-finalizer' | 'reject-finalizer' | 'handler-prelude' | 'handler-finalizer'
type AsyncTaskPhaseKind = AsyncTaskSuccessPhaseKind | AsyncTaskTryPhaseKind

type AsyncTaskPhase = {
  kind: AsyncTaskPhaseKind
  statements: any[]
}

type AsyncTaskFrameLocalKind = 'prefix' | 'await'

type AsyncTaskFrameLocal = Record<string, any> & {
  kind: AsyncTaskFrameLocalKind
  name: string | null
  type: string
  fieldName: string
}

type AsyncTaskTryHandlerPlan = {
  param: string | null
  statements: any[]
  returnExpression: any
}

type AsyncTaskTryRegionDraft = {
  handler: AsyncTaskTryHandlerPlan | null
  preHandlerFinalizerStatements: any[]
  successFinalizerStatements: any[]
  handlerFinalizerStatements: any[]
}

type AsyncTaskBodyDraft = {
  awaits: any[]
  prefixStatements: any[]
  prefixLocals: any[]
  successPreFinalizerStatements: any[]
  successPrefixFinalizerStatements: any[]
  successStatements: any[]
  returnExpression: any
  returnType: string
  tryRegion: AsyncTaskTryRegionDraft | null
}

type AsyncTaskBodyPlan = {
  awaits: any[]
  prefixStatements: any[]
  frameLocals: AsyncTaskFrameLocal[]
  successPhases: AsyncTaskPhase[]
  tryPhases: AsyncTaskPhase[]
  returnExpression: any
  returnType: string
  hasTryRegion: boolean
  tryHandler: AsyncTaskTryHandlerPlan | null
}



export function collectAsyncTaskWrappers(
  functions: IrFunctionNodeEntry[],
  context: CEmitContext,
  dependencies: AsyncTaskLoweringDependencies
) {
  context.asyncTaskLoweringDependencies = dependencies
  const wrappers = new Map()

  for (const { declaration, node: item } of functions) {
    const params = resolveAsyncTaskWrapperParams(declaration, context)
    const bodyPlan = params == null ? null : resolveAsyncTaskBodyPlan(item, declaration, context, params)

    if (bodyPlan == null) {
      continue
    }

    const cName = emitCIdentifier(declaration.name)
    const wrapper = {
      key: declaration.name,
      functionName: declaration.name,
      frameTypeName: `ccjs_async_task_${cName}_frame`,
      startName: `ccjs_async_task_${cName}_start`,
      resumeName: `ccjs_async_task_${cName}_resume`,
      rejectName: `ccjs_async_task_${cName}_reject`,
      finalizerName: `ccjs_async_task_${cName}_finalize`,
      params,
      ...bodyPlan
    }

    wrappers.set(declaration.name, wrapper)
  }

  return wrappers
}

function createAsyncTaskBodyPlan(body: AsyncTaskBodyDraft): AsyncTaskBodyPlan {
  const successPhases = createAsyncTaskSuccessPhases(body)
  const tryRegion = body.tryRegion ?? null
  const awaits = body.awaits
  const prefixLocals = body.prefixLocals ?? []
  const tryPhases = createAsyncTaskTryPhases(tryRegion, successPhases)
  const tryHandler = tryRegion?.handler ?? null
  const livePrefixLocalNames = collectAsyncTaskLiveAcrossSuspensionNames({
    awaits,
    successPhases,
    tryPhases,
    returnExpression: body.returnExpression,
    tryHandler
  })

  return {
    awaits,
    prefixStatements: body.prefixStatements ?? [],
    frameLocals: createAsyncTaskFrameLocals(prefixLocals, awaits, livePrefixLocalNames),
    successPhases,
    tryPhases,
    returnExpression: body.returnExpression,
    returnType: body.returnType,
    hasTryRegion: tryRegion != null,
    tryHandler
  }
}

function createAsyncTaskFrameLocals(prefixLocals, awaits, livePrefixLocalNames): AsyncTaskFrameLocal[] {
  return [
    ...prefixLocals
      .filter((local) => livePrefixLocalNames.has(local.name))
      .map((local) => ({
        ...local,
        kind: 'prefix' as const
      })),
    ...awaits
      .filter((item) => item.fieldName != null)
      .map((item) => ({
        ...item,
        kind: 'await' as const
      }))
  ]
}

function collectAsyncTaskLiveAcrossSuspensionNames({ awaits, successPhases, tryPhases, returnExpression, tryHandler }) {
  return collectAsyncTaskReferencedNames([
    ...awaits.slice(1).flatMap((item) => [item.awaitedExpression, item.awaitedPromiseExpression]),
    ...successPhases.flatMap((phase) => phase.statements),
    ...tryPhases.flatMap((phase) => phase.statements),
    returnExpression,
    ...(tryHandler == null ? [] : [...(tryHandler.statements ?? []), tryHandler.returnExpression])
  ])
}

function collectAsyncTaskReferencedNames(nodes) {
  const names = new Set<string>()
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

    if (node.type === 'Reference') {
      if (node.path.length === 1) {
        names.add(node.path[0])
      }

      return
    }

    for (const [key, value] of Object.entries(node)) {
      if (key === 'loc' || key === 'shape' || key === 'functionType') {
        continue
      }

      visit(value)
    }
  }

  visit(nodes)

  return names
}

function createAsyncTaskSuccessPhases(body): AsyncTaskPhase[] {
  const phases: AsyncTaskPhase[] = []

  appendAsyncTaskSuccessPhase(phases, 'pre-finalizer', body.successPreFinalizerStatements)
  appendAsyncTaskSuccessPhase(phases, 'prefix-finalizer', body.successPrefixFinalizerStatements)
  appendAsyncTaskSuccessPhase(phases, 'body', body.successStatements)

  return phases
}

function appendAsyncTaskSuccessPhase(phases: AsyncTaskPhase[], kind: AsyncTaskSuccessPhaseKind, statements) {
  if ((statements?.length ?? 0) === 0) {
    return
  }

  phases.push({
    kind,
    statements
  })
}

function createAsyncTaskTryPhases(
  tryRegion: AsyncTaskTryRegionDraft | null,
  successPhases: AsyncTaskPhase[]
): AsyncTaskPhase[] {
  if (tryRegion == null) {
    return []
  }

  const phases: AsyncTaskPhase[] = []
  const successPrefixFinalizerStatements = successPhases
    .filter((phase) => phase.kind === 'prefix-finalizer')
    .flatMap((phase) => phase.statements)
  const successFinalizerStatements = [
    ...(successPrefixFinalizerStatements.length > 0 ? [] : tryRegion.preHandlerFinalizerStatements),
    ...tryRegion.successFinalizerStatements
  ]
  const rejectFinalizerStatements = [
    ...successPrefixFinalizerStatements,
    ...tryRegion.preHandlerFinalizerStatements,
    ...tryRegion.successFinalizerStatements
  ]

  appendAsyncTaskTryPhase(phases, 'success-finalizer', successFinalizerStatements)
  appendAsyncTaskTryPhase(phases, 'reject-finalizer', rejectFinalizerStatements)
  appendAsyncTaskTryPhase(phases, 'handler-prelude', tryRegion.preHandlerFinalizerStatements)
  appendAsyncTaskTryPhase(phases, 'handler-finalizer', tryRegion.handlerFinalizerStatements)

  return phases
}

function appendAsyncTaskTryPhase(phases: AsyncTaskPhase[], kind: AsyncTaskTryPhaseKind, statements) {
  if ((statements?.length ?? 0) === 0) {
    return
  }

  phases.push({
    kind,
    statements
  })
}

function resolveAsyncTaskWrapperParams(declaration: IrFunctionDeclaration, context) {
  if (
    declaration.async !== true ||
    declaration.returnType !== 'promise' ||
    asyncTaskDeps(context).isThrowingFunctionName(declaration.name, context)
  ) {
    return null
  }

  const params = asyncTaskDeps(context).resolveFunctionDeclarationParams(declaration.name, declaration.params, context)

  if (params.some((param) => param.nullable === true || !isSupportedAsyncTaskParamType(param.valueType))) {
    return null
  }

  return params.map((param) => ({
    ...param,
    fieldName: `param_${emitCIdentifier(param.name)}`,
    argName: `ccjs_arg_${emitCIdentifier(param.name)}`
  }))
}

function isSupportedAsyncTaskParamType(valueType) {
  return valueType === 'number' || valueType === 'boolean' || valueType === 'string' || valueType === 'bytes'
}

function isSupportedAsyncTaskValueType(valueType) {
  return (
    valueType === 'number' ||
    valueType === 'boolean' ||
    valueType === 'string' ||
    valueType === 'bytes' ||
    valueType === 'object' ||
    valueType === 'array' ||
    valueType === 'map' ||
    valueType === 'set' ||
    valueType === 'void'
  )
}

function resolveAsyncTaskBodyPlan(statement, declaration: IrFunctionDeclaration, context, params) {
  if (
    declaration.async !== true ||
    declaration.returnType !== 'promise' ||
    asyncTaskDeps(context).isThrowingFunctionName(declaration.name, context)
  ) {
    return null
  }

  const returnType =
    declaration.returnPromiseValueType ?? context.functionReturnPromiseValueTypes.get(declaration.name) ?? 'unknown'

  if (!isSupportedAsyncTaskValueType(returnType)) {
    return null
  }

  const tryBody = resolveAsyncTaskTryBodyPlan(statement, context, params, returnType)

  if (tryBody != null) {
    return tryBody
  }

  if (statement.body.length < 2) {
    return null
  }

  const returnStatement = statement.body.at(-1)

  if (returnStatement?.type !== 'ReturnStatement') {
    return null
  }

  const awaits = resolveAsyncTaskAwaitSteps(statement.body.slice(0, -1), context)

  const returnContext = {
    ...context,
    variables: new Map(context.variables ?? [])
  }

  for (const param of params) {
    returnContext.variables.set(param.name, param.valueType)
  }

  for (const item of awaits ?? []) {
    returnContext.variables.set(item.name, item.type)
  }

  const returnExpression = resolveAsyncTaskReturnValueExpression(returnStatement.argument, returnType, returnContext)

  if (awaits == null || (returnType !== 'void' && returnExpression == null)) {
    return null
  }

  return createAsyncTaskBodyPlan({
    awaits,
    prefixStatements: [],
    prefixLocals: [],
    successPreFinalizerStatements: [],
    successPrefixFinalizerStatements: [],
    successStatements: [],
    returnExpression,
    returnType,
    tryRegion: null
  })
}

function resolveAsyncTaskTryBodyPlan(statement, context, params, returnType) {
  if (statement.body.length !== 1 || statement.body[0]?.type !== 'TryStatement') {
    return null
  }

  const tryStatement = statement.body[0]
  const nestedTryFinallyBody = resolveAsyncTaskNestedTryBodyPlan(tryStatement, context, params, returnType)

  if (nestedTryFinallyBody != null) {
    return nestedTryFinallyBody
  }

  const tryStatements = tryStatement.block?.body ?? []
  const returnStatement = tryStatements.at(-1)

  if (returnStatement?.type !== 'ReturnStatement') {
    return null
  }

  if (tryStatement.handler == null && tryStatement.finalizer == null) {
    return null
  }

  const awaits = resolveAsyncTaskAwaitSteps(tryStatements.slice(0, -1), context)

  if (awaits == null) {
    return null
  }

  const returnContext = createAsyncTaskExpressionContext(context, params, awaits)
  const returnExpression = resolveAsyncTaskReturnValueExpression(returnStatement.argument, returnType, returnContext)

  if (returnType !== 'void' && returnExpression == null) {
    return null
  }

  const handler = resolveAsyncTaskTryHandler(tryStatement.handler, context, params, returnType)
  const finalizerStatements = tryStatement.finalizer?.body ?? []

  if ((tryStatement.handler != null && handler == null) || hasUnsupportedAsyncTaskTryControlFlow(finalizerStatements)) {
    return null
  }

  return createAsyncTaskBodyPlan({
    awaits,
    prefixStatements: [],
    prefixLocals: [],
    successPreFinalizerStatements: [],
    successPrefixFinalizerStatements: [],
    successStatements: [],
    returnExpression,
    returnType,
    tryRegion: {
      handler,
      preHandlerFinalizerStatements: [],
      successFinalizerStatements: finalizerStatements,
      handlerFinalizerStatements: finalizerStatements
    }
  })
}

function resolveAsyncTaskNestedTryBodyPlan(tryStatement, context, params, returnType) {
  const tryChainResult = collectAsyncTaskNestedTryChain(tryStatement)

  if (tryChainResult == null || tryChainResult.chain.length < 2) {
    return null
  }

  const tryChain = tryChainResult.chain
  const innerTry = tryChain[tryChain.length - 1]
  const innerTryStatements = innerTry.block?.body ?? []
  const postNestedStatements = tryChainResult.postNestedStatements ?? []
  const hasPostNestedStatements = postNestedStatements.length > 0
  const returnStatement = hasPostNestedStatements ? postNestedStatements.at(-1) : innerTryStatements.at(-1)
  const innerAwaitStatements = hasPostNestedStatements ? innerTryStatements : innerTryStatements.slice(0, -1)
  const innerPrefixResult = splitAsyncTaskLeadingPrefixStatements(innerAwaitStatements)

  if (returnStatement?.type !== 'ReturnStatement' || innerPrefixResult == null) {
    return null
  }

  const prefixStatements = [...tryChainResult.prefixStatements, ...innerPrefixResult.prefixStatements]
  const prefixResult = resolveAsyncTaskPrefixLocals(context, params, prefixStatements)

  if (prefixResult == null) {
    return null
  }

  const prefixContext = prefixResult.context
  const awaitResult = resolveAsyncTaskAwaitStepsAndTrailingStatements(innerPrefixResult.awaitStatements, prefixContext)

  if (awaitResult == null) {
    return null
  }

  const awaits = awaitResult.awaits
  const successPreFinalizerStatements = hasPostNestedStatements ? awaitResult.trailingStatements : []
  const successStatements = hasPostNestedStatements ? postNestedStatements.slice(0, -1) : awaitResult.trailingStatements
  const returnContext = createAsyncTaskExpressionContext(
    context,
    params,
    hasPostNestedStatements ? prefixResult.locals : [...prefixResult.locals, ...awaits]
  )
  const finalizers = collectAsyncTaskTryFinalizers(tryChain)
  const handlerIndex = findAsyncTaskNearestTryHandlerIndex(tryChain)
  const handlerSource = handlerIndex < 0 ? null : tryChain[handlerIndex].handler
  const handler = resolveAsyncTaskTryHandler(handlerSource, context, params, returnType)
  registerAsyncTaskStatementListLocals(returnContext, successStatements)
  const returnExpression = resolveAsyncTaskReturnValueExpression(returnStatement.argument, returnType, returnContext)

  if (returnType !== 'void' && returnExpression == null) {
    return null
  }

  const successFinalizerStatements = hasPostNestedStatements
    ? collectAsyncTaskTryFinalizerStatements(finalizers, tryChainResult.postNestedOwnerIndex, 0)
    : handlerIndex < 0
      ? collectAsyncTaskTryFinalizerStatements(finalizers, finalizers.length - 1, 0)
      : collectAsyncTaskTryFinalizerStatements(finalizers, handlerIndex, 0)
  const handlerFinalizerStatements =
    handlerIndex < 0
      ? []
      : hasPostNestedStatements
        ? collectAsyncTaskTryFinalizerStatements(finalizers, handlerIndex, 0)
        : successFinalizerStatements

  if (
    (handlerSource != null && handler == null) ||
    hasUnsupportedAsyncTaskTryControlFlow(prefixStatements) ||
    hasUnsupportedAsyncTaskTryControlFlow(successPreFinalizerStatements) ||
    hasUnsupportedAsyncTaskTryControlFlow(successStatements) ||
    finalizers.some((statements) => hasUnsupportedAsyncTaskTryControlFlow(statements))
  ) {
    return null
  }

  return createAsyncTaskBodyPlan({
    awaits,
    prefixStatements,
    prefixLocals: prefixResult.locals,
    successPreFinalizerStatements,
    successPrefixFinalizerStatements: hasPostNestedStatements
      ? collectAsyncTaskTryFinalizerStatements(
          finalizers,
          finalizers.length - 1,
          tryChainResult.postNestedOwnerIndex + 1
        )
      : [],
    successStatements,
    returnExpression,
    returnType,
    tryRegion: {
      handler,
      preHandlerFinalizerStatements:
        handlerIndex < 0
          ? []
          : collectAsyncTaskTryFinalizerStatements(finalizers, finalizers.length - 1, handlerIndex + 1),
      successFinalizerStatements,
      handlerFinalizerStatements
    }
  })
}

function splitAsyncTaskLeadingPrefixStatements(statements) {
  const prefixStatements: any[] = []
  let index = 0

  while (index < statements.length) {
    const statement = statements[index]
    const nextStatement = statements[index + 1]

    if (
      isAsyncTaskDirectAwaitStatementShape(statement) ||
      isAsyncTaskStatementAwaitShape(statement) ||
      isAsyncTaskLocalPromiseAwaitShape(statement, nextStatement)
    ) {
      break
    }

    prefixStatements.push(statement)
    index += 1
  }

  return {
    prefixStatements,
    awaitStatements: statements.slice(index)
  }
}

function isAsyncTaskDirectAwaitStatementShape(statement) {
  return statement?.type === 'VariableDeclaration' && statement.init?.type === 'AwaitExpression'
}

function isAsyncTaskStatementAwaitShape(statement) {
  return statement?.type === 'ExpressionStatement' && statement.expression?.type === 'AwaitExpression'
}

function isAsyncTaskLocalPromiseAwaitShape(promiseStatement, awaitStatement) {
  return (
    promiseStatement?.type === 'VariableDeclaration' &&
    promiseStatement.init?.valueType === 'promise' &&
    awaitStatement?.type === 'VariableDeclaration' &&
    awaitStatement.init?.type === 'AwaitExpression'
  )
}

function collectAsyncTaskNestedTryChain(tryStatement) {
  const chain: any[] = []
  const prefixStatements: any[] = []
  const postNestedStatements: any[] = []
  let postNestedOwnerIndex = -1
  let current: any = tryStatement

  while (current?.type === 'TryStatement') {
    if (current.handler == null && current.finalizer == null) {
      return null
    }

    chain.push(current)

    const body = current.block?.body ?? []
    const nestedTryIndexes = body.flatMap((item, index) => (item?.type === 'TryStatement' ? [index] : []))

    if (nestedTryIndexes.length === 1) {
      const nestedTryIndex = nestedTryIndexes[0]
      const suffixStatements = body.slice(nestedTryIndex + 1)

      if (suffixStatements.length > 0) {
        if (postNestedStatements.length > 0) {
          return null
        }

        postNestedStatements.push(...suffixStatements)
        postNestedOwnerIndex = chain.length - 1
      }

      prefixStatements.push(...body.slice(0, nestedTryIndex))
      current = body[nestedTryIndex]
      continue
    }

    return {
      chain,
      prefixStatements,
      postNestedStatements,
      postNestedOwnerIndex
    }
  }

  return null
}

function collectAsyncTaskTryFinalizers(tryChain) {
  return tryChain.map((item) => item.finalizer?.body ?? [])
}

function findAsyncTaskNearestTryHandlerIndex(tryChain) {
  for (let index = tryChain.length - 1; index >= 0; index -= 1) {
    if (tryChain[index].handler != null) {
      return index
    }
  }

  return -1
}

function collectAsyncTaskTryFinalizerStatements(finalizers, fromIndex, toIndex) {
  const statements: any[] = []

  for (let index = fromIndex; index >= toIndex; index -= 1) {
    statements.push(...finalizers[index])
  }

  return statements
}

function resolveAsyncTaskPrefixLocals(context, params, prefixStatements) {
  const result = createAsyncTaskExpressionContext(context, params, [])
  const locals: any[] = []

  for (const statement of prefixStatements) {
    if (statement?.type !== 'VariableDeclaration') {
      continue
    }

    const valueType = statement.valueType ?? asyncTaskDeps(context).inferExpressionType(statement.init, result)

    if (!isSupportedAsyncTaskPrefixLocalType(valueType)) {
      return null
    }

    asyncTaskDeps(context).registerRuntimeValueMetadata(statement.name, valueType, statement, statement.init, result)

    if (valueType === 'string' && isRuntimeStringPrefixLocalDeclaration(statement, result)) {
      result.runtimeStrings.add(statement.name)
    }

    if (isSupportedAsyncTaskFramePrefixLocal(statement, valueType, result)) {
      locals.push({
        name: statement.name,
        type: valueType,
        shape: valueType === 'object' ? (statement.shape ?? statement.init?.shape ?? null) : undefined,
        arrayElementType:
          valueType === 'array'
            ? (statement.arrayElementType ??
              statement.init?.arrayElementType ??
              asyncTaskDeps(context).resolveRuntimeArrayElementType(statement.init, result) ??
              'unknown')
            : undefined,
        mapKeyType:
          valueType === 'map'
            ? (statement.mapKeyType ??
              asyncTaskDeps(context).resolveRuntimeMapType(statement.init, result)?.key ??
              statement.init?.mapKeyType ??
              'unknown')
            : undefined,
        mapValueType:
          valueType === 'map'
            ? (statement.mapValueType ??
              asyncTaskDeps(context).resolveRuntimeMapType(statement.init, result)?.value ??
              statement.init?.mapValueType ??
              'unknown')
            : undefined,
        setElementType:
          valueType === 'set'
            ? (statement.setElementType ??
              asyncTaskDeps(context).resolveRuntimeSetElementType(statement.init, result) ??
              statement.init?.setElementType ??
              'unknown')
            : undefined,
        fieldName: `prefix_${emitCIdentifier(statement.name)}`,
        forceRuntimeStringDeclaration: valueType === 'string' && isRawStringLiteralExpression(statement.init)
      })
    }
  }

  return {
    context: result,
    locals
  }
}

function registerAsyncTaskStatementListLocals(context, statements) {
  for (const statement of statements) {
    if (statement?.type !== 'VariableDeclaration') {
      continue
    }

    const valueType = statement.valueType ?? asyncTaskDeps(context).inferExpressionType(statement.init, context)

    asyncTaskDeps(context).registerRuntimeValueMetadata(statement.name, valueType, statement, statement.init, context)

    if (valueType === 'string' && isRuntimeStringPrefixLocalDeclaration(statement, context)) {
      context.runtimeStrings.add(statement.name)
    }
  }
}

function isSupportedAsyncTaskPrefixLocalType(valueType) {
  return (
    valueType === 'number' ||
    valueType === 'boolean' ||
    valueType === 'string' ||
    valueType === 'bytes' ||
    valueType === 'object' ||
    valueType === 'array' ||
    valueType === 'map' ||
    valueType === 'set'
  )
}

function isSupportedAsyncTaskFramePrefixLocalType(valueType) {
  return (
    valueType === 'number' ||
    valueType === 'boolean' ||
    valueType === 'string' ||
    valueType === 'bytes' ||
    valueType === 'object' ||
    valueType === 'array' ||
    valueType === 'map' ||
    valueType === 'set'
  )
}

function isSupportedAsyncTaskFramePrefixLocal(statement, valueType, context) {
  if (!isSupportedAsyncTaskFramePrefixLocalType(valueType)) {
    return false
  }

  return valueType !== 'string' || isRuntimeStringPrefixLocalDeclaration(statement, context)
}

function isRuntimeStringPrefixLocalDeclaration(statement, context) {
  const expression = statement?.init

  if (
    asyncTaskDeps(context).resolveRuntimeStringReference(expression, context) != null ||
    asyncTaskDeps(context).isRuntimeProducedStringExpression(expression, context) ||
    isRawStringLiteralExpression(expression)
  ) {
    return true
  }

  if (asyncTaskDeps(context).isMemberAccessExpression(expression)) {
    const member = asyncTaskDeps(context).resolveKnownObjectMember(expression, context)

    return member?.valueType === 'string'
  }

  if (asyncTaskDeps(context).isIndexAccessExpression(expression)) {
    const element = asyncTaskDeps(context).resolveKnownArrayIndex(expression, context)
    const field = asyncTaskDeps(context).resolveKnownObjectIndex(expression, context)
    const runtimeElement = asyncTaskDeps(context).resolveRuntimeArrayIndex(expression, context)

    return element?.valueType === 'string' || field?.valueType === 'string' || runtimeElement?.valueType === 'string'
  }

  return false
}

function isRawStringLiteralExpression(expression) {
  return (
    expression?.type === 'StringLiteral' || (expression?.type === 'TemplateLiteral' && !expression.raw.includes('${'))
  )
}

function resolveAsyncTaskTryHandler(handler, context, params, returnType) {
  if (handler == null) {
    return null
  }

  const statements = handler.body?.body ?? []
  const returnStatement = statements.at(-1)
  const handlerStatements = statements.slice(0, -1)

  if (returnStatement?.type !== 'ReturnStatement' || hasUnsupportedAsyncTaskTryControlFlow(handlerStatements)) {
    return null
  }

  const catchContext = createAsyncTaskExpressionContext(context, params, [])

  if (handler.param != null) {
    catchContext.variables.set(handler.param, 'string')
    catchContext.runtimeStrings.add(handler.param)
  }

  registerAsyncTaskStatementListLocals(catchContext, handlerStatements)
  const returnExpression = resolveAsyncTaskReturnValueExpression(returnStatement.argument, returnType, catchContext)

  if (returnExpression == null) {
    return null
  }

  return {
    param: handler.param ?? null,
    statements: handlerStatements,
    returnExpression
  }
}

function createAsyncTaskExpressionContext(context, params, awaits) {
  const result = {
    ...context,
    mapTypes: new Map(context.mapTypes ?? []),
    objectShapes: new Map(context.objectShapes ?? []),
    runtimeArrayElementTypes: new Map(context.runtimeArrayElementTypes ?? []),
    setElementTypes: new Map(context.setElementTypes ?? []),
    variables: new Map(context.variables ?? []),
    runtimeStrings: new Set(context.runtimeStrings ?? [])
  }

  for (const param of params) {
    registerAsyncTaskLocalMetadata(param.name, param.valueType, param, result)
  }

  for (const item of awaits ?? []) {
    if (item.name != null) {
      registerAsyncTaskLocalMetadata(item.name, item.type, item, result)
    }
  }

  return result
}

function hasUnsupportedAsyncTaskTryControlFlow(node) {
  if (node == null) {
    return false
  }

  if (Array.isArray(node)) {
    return node.some((item) => hasUnsupportedAsyncTaskTryControlFlow(item))
  }

  if (typeof node !== 'object') {
    return false
  }

  if (
    [
      'AwaitExpression',
      'ReturnStatement',
      'ThrowStatement',
      'TryStatement',
      'BreakStatement',
      'ContinueStatement'
    ].includes(node.type)
  ) {
    return true
  }

  return Object.values(node).some((value) => hasUnsupportedAsyncTaskTryControlFlow(value))
}

function resolveAsyncTaskAwaitSteps(statements, context) {
  const result = resolveAsyncTaskAwaitStepsAndTrailingStatements(statements, context)

  if (result == null || result.trailingStatements.length > 0) {
    return null
  }

  return result.awaits
}

function resolveAsyncTaskAwaitStepsAndTrailingStatements(statements, context) {
  const awaits: Array<Record<string, any>> = []

  for (let index = 0; index < statements.length; ) {
    const statement = statements[index]
    const nextStatement = statements[index + 1]
    const directAwait = resolveAsyncTaskDirectAwaitStep(statement, context, awaits.length)

    if (directAwait != null) {
      awaits.push(directAwait)
      index += 1
      continue
    }

    const statementAwait = resolveAsyncTaskStatementAwaitStep(statement, context, awaits.length)

    if (statementAwait != null) {
      awaits.push(statementAwait)
      index += 1
      continue
    }

    const localPromiseAwait = resolveAsyncTaskLocalPromiseAwaitStep(statement, nextStatement, context, awaits.length)

    if (localPromiseAwait != null) {
      awaits.push(localPromiseAwait)
      index += 2
      continue
    }

    if (awaits.length === 0) {
      return null
    }

    return {
      awaits,
      trailingStatements: statements.slice(index)
    }
  }

  return awaits.length === 0
    ? null
    : {
        awaits,
        trailingStatements: []
      }
}

function resolveAsyncTaskDirectAwaitStep(statement, context, index) {
  if (statement?.type !== 'VariableDeclaration' || statement.init?.type !== 'AwaitExpression') {
    return null
  }

  const awaitedType = statement.valueType ?? statement.init.valueType ?? 'unknown'
  const awaitedExpression = statement.init.argument
  const awaitedPromiseExpression = isSupportedAsyncTaskDirectAwaitPromiseExpression(awaitedExpression, context)
    ? awaitedExpression
    : null

  if (!isSupportedAsyncTaskValueType(awaitedType) || awaitedType === 'void') {
    return null
  }

  return {
    index,
    name: statement.name,
    type: awaitedType,
    fieldName: `local_${emitCIdentifier(statement.name)}`,
    shape:
      awaitedType === 'object'
        ? (statement.shape ?? statement.init.shape ?? awaitedExpression?.shape ?? null)
        : undefined,
    arrayElementType:
      statement.arrayElementType ?? statement.init.arrayElementType ?? awaitedExpression?.arrayElementType ?? 'unknown',
    mapKeyType:
      awaitedType === 'map'
        ? (statement.mapKeyType ?? statement.init.mapKeyType ?? awaitedExpression?.mapKeyType ?? 'unknown')
        : undefined,
    mapValueType:
      awaitedType === 'map'
        ? (statement.mapValueType ?? statement.init.mapValueType ?? awaitedExpression?.mapValueType ?? 'unknown')
        : undefined,
    setElementType:
      awaitedType === 'set'
        ? (statement.setElementType ?? statement.init.setElementType ?? awaitedExpression?.setElementType ?? 'unknown')
        : undefined,
    awaitedExpression: awaitedPromiseExpression == null ? awaitedExpression : null,
    awaitedPromiseExpression
  }
}

function resolveAsyncTaskStatementAwaitStep(statement, context, index) {
  if (statement?.type !== 'ExpressionStatement' || statement.expression?.type !== 'AwaitExpression') {
    return null
  }

  const awaitedType = statement.expression.valueType ?? 'void'
  const awaitedExpression = statement.expression.argument
  const awaitedPromiseExpression = isSupportedAsyncTaskDirectAwaitPromiseExpression(awaitedExpression, context)
    ? awaitedExpression
    : null

  if (awaitedType !== 'void') {
    return null
  }

  return {
    index,
    name: null,
    type: awaitedType,
    fieldName: null,
    awaitedExpression: awaitedPromiseExpression == null ? awaitedExpression : null,
    awaitedPromiseExpression
  }
}

function resolveAsyncTaskLocalPromiseAwaitStep(promiseStatement, awaitStatement, context, index) {
  if (awaitStatement?.type !== 'VariableDeclaration' || awaitStatement.init?.type !== 'AwaitExpression') {
    return null
  }

  const awaitedPromiseExpression = resolveAsyncTaskAwaitedPromiseExpression(promiseStatement, awaitStatement, context)

  if (awaitedPromiseExpression == null) {
    return null
  }

  const awaitedType = awaitStatement.valueType ?? awaitStatement.init.valueType ?? 'unknown'

  if (!isSupportedAsyncTaskValueType(awaitedType) || awaitedType === 'void') {
    return null
  }

  return {
    index,
    name: awaitStatement.name,
    type: awaitedType,
    fieldName: `local_${emitCIdentifier(awaitStatement.name)}`,
    shape:
      awaitedType === 'object'
        ? (awaitStatement.shape ?? awaitStatement.init.shape ?? awaitedPromiseExpression.shape ?? null)
        : undefined,
    arrayElementType:
      awaitStatement.arrayElementType ??
      awaitStatement.init.arrayElementType ??
      awaitedPromiseExpression.arrayElementType,
    mapKeyType:
      awaitedType === 'map'
        ? (awaitStatement.mapKeyType ??
          awaitStatement.init.mapKeyType ??
          awaitedPromiseExpression.mapKeyType ??
          'unknown')
        : undefined,
    mapValueType:
      awaitedType === 'map'
        ? (awaitStatement.mapValueType ??
          awaitStatement.init.mapValueType ??
          awaitedPromiseExpression.mapValueType ??
          'unknown')
        : undefined,
    setElementType:
      awaitedType === 'set'
        ? (awaitStatement.setElementType ??
          awaitStatement.init.setElementType ??
          awaitedPromiseExpression.setElementType ??
          'unknown')
        : undefined,
    awaitedExpression: null,
    awaitedPromiseExpression
  }
}

function resolveAsyncTaskAwaitedPromiseExpression(promiseStatement, awaitStatement, context) {
  if (promiseStatement == null) {
    return null
  }

  if (
    promiseStatement.type !== 'VariableDeclaration' ||
    promiseStatement.init?.valueType !== 'promise' ||
    !isSupportedAsyncTaskAwaitedPromiseExpression(promiseStatement.init, context)
  ) {
    return null
  }

  const awaited = awaitStatement.init?.argument

  if (awaited?.type !== 'Reference' || awaited.path.length !== 1 || awaited.path[0] !== promiseStatement.name) {
    return null
  }

  return promiseStatement.init
}

function isSupportedAsyncTaskAwaitedPromiseExpression(expression, context) {
  if (expression?.type !== 'CallExpression') {
    return false
  }

  if (isSupportedAsyncTaskDirectAwaitPromiseExpression(expression, context)) {
    return true
  }

  if (cPromiseRuntimeCallName(expression.callee) === 'resolve') {
    return true
  }

  if (expression.callee?.type !== 'MemberExpression' || expression.callee.property !== 'then') {
    return false
  }

  const receiver = expression.callee.object
  const callback = expression.args[0]

  return (
    receiver?.type === 'CallExpression' &&
    cPromiseRuntimeCallName(receiver.callee) === 'resolve' &&
    callback?.type === 'ArrowFunctionExpression' &&
    context.promiseChainArrowWrappers.has(callback)
  )
}

function isSupportedAsyncTaskDirectAwaitPromiseExpression(expression, context) {
  if (expression?.type !== 'CallExpression') {
    return false
  }

  if (cPromiseRuntimeCallName(expression.callee) === 'reject') {
    return true
  }

  if (isAsyncFsRuntimeCallExpression(expression)) {
    return true
  }

  if (isAsyncFetchRuntimeCallExpression(expression)) {
    return true
  }

  if (isPromiseReturningFunctionCallee(expression.callee, context)) {
    return true
  }

  if (!isAsyncFunctionCallee(expression.callee, context) || asyncTaskDeps(context).isThrowingFunctionCallee(expression.callee, context)) {
    return false
  }

  const valueType =
    resolveCAsyncFunctionAwaitValueType(expression.callee, context) ?? expression.promiseValueType ?? 'unknown'

  return isSupportedAsyncTaskValueType(valueType)
}

function resolveAsyncTaskReturnValueExpression(expression, returnType, context) {
  if (returnType === 'void') {
    return expression == null ? null : expression
  }

  if (expression?.type === 'CallExpression' && cPromiseRuntimeCallName(expression.callee) === 'resolve') {
    return expression.args[0] ?? null
  }

  const expressionType =
    expression?.valueType != null && expression.valueType !== 'unknown'
      ? expression.valueType
      : context.variables == null
        ? 'unknown'
        : asyncTaskDeps(context).inferExpressionType(expression, context)

  if (isSupportedAsyncTaskValueType(returnType) && expressionType === returnType) {
    return expression
  }

  return null
}

export function emitAsyncTaskFrameType(wrapper) {
  return [
    `typedef struct ${wrapper.frameTypeName} {`,
    '  ccjs_loop* ccjs_loop;',
    '  ccjs_promise* promise;',
    '  ccjs_promise* awaited;',
    '  int state;',
    ...wrapper.params.map((param) => `  ${emitAsyncTaskStorageCType(param.valueType)} ${param.fieldName};`),
    ...wrapper.frameLocals.map((local) => `  ${emitAsyncTaskStorageCType(local.type)} ${local.fieldName};`),
    `} ${wrapper.frameTypeName};`
  ]
}

function emitAsyncTaskStorageCType(valueType) {
  return isManagedRuntimeReturnType(valueType) ? 'ccjs_value' : emitCType(valueType)
}

function emitAsyncTaskStorageInit(valueType) {
  return isManagedRuntimeReturnType(valueType) ? 'ccjs_undefined_value()' : '0'
}

export function emitAsyncTaskWrapperPrototypes(wrapper) {
  return [
    `static ccjs_status ${wrapper.startName}(${emitAsyncTaskStartParams(wrapper)});`,
    `static ccjs_status ${wrapper.resumeName}(void* context, ccjs_value ccjs_value_input);`,
    `static ccjs_status ${wrapper.rejectName}(void* context, ccjs_value ccjs_error);`,
    `static void ${wrapper.finalizerName}(void* context);`
  ]
}

export function emitAsyncTaskWrapperDeclaration(
  wrapper,
  baseContext: CEmitContext,
  dependencies: AsyncTaskLoweringDependencies
) {
  baseContext.asyncTaskLoweringDependencies = dependencies
  return [
    ...emitAsyncTaskStartDeclaration(wrapper, baseContext),
    '',
    ...emitAsyncTaskResumeDeclaration(wrapper, baseContext),
    '',
    ...emitAsyncTaskRejectDeclaration(wrapper, baseContext),
    '',
    ...emitAsyncTaskFinalizerDeclaration(wrapper)
  ]
}

function emitAsyncTaskStartDeclaration(wrapper, baseContext) {
  const context = createAsyncTaskEmitContext(baseContext, wrapper, 'void', 0)
  context.forceRuntimeStringDeclarations = new Set(
    collectAsyncTaskFrameLocals(wrapper, 'prefix')
      .filter((local) => local.forceRuntimeStringDeclaration === true)
      .map((local) => local.name)
  )
  context.failureStatement = 'goto ccjs_start_error;'
  const prefixAndScheduleLines = withVariableScope(context, () => [
    ...asyncTaskDeps(context).emitStatementList(wrapper.prefixStatements ?? [], context),
    ...emitAsyncTaskStorePrefixLocalLines(wrapper),
    ...emitAsyncTaskScheduleAwaitLines(wrapper, wrapper.awaits[0], context, {
      cleanup: 'start',
      final: wrapper.awaits.length === 1
    })
  ])
  const lines = [
    `static ccjs_status ${wrapper.startName}(${emitAsyncTaskStartParams(wrapper)}) {`,
    '  if (ccjs_loop == 0 || ccjs_loop->allocator == 0 || out == 0) return CCJS_ERR_TYPE;',
    '  *out = 0;',
    `  ${wrapper.frameTypeName}* frame = ccjs_loop->allocator->alloc(ccjs_loop->allocator->user, sizeof(${wrapper.frameTypeName}), _Alignof(${wrapper.frameTypeName}));`,
    '  if (frame == 0) return CCJS_ERR_OOM;',
    '  frame->ccjs_loop = ccjs_loop;',
    '  frame->promise = 0;',
    '  frame->awaited = 0;',
    '  frame->state = 0;',
    ...wrapper.params.map((param) => `  frame->${param.fieldName} = ${param.argName};`),
    ...wrapper.frameLocals.map((local) => `  frame->${local.fieldName} = ${emitAsyncTaskStorageInit(local.type)};`),
    '  ccjs_status status = ccjs_promise_new(ccjs_loop, &frame->promise);',
    ...emitOwnedValueDeclarations(context).map((line) => `  ${line}`),
    '  if (status != CCJS_OK) {',
    '    ccjs_loop->allocator->free(ccjs_loop->allocator->user, frame, sizeof(*frame), _Alignof(*frame));',
    '    return status;',
    '  }',
    ...wrapper.params
      .filter((param) => isManagedRuntimeReturnType(param.valueType))
      .map((param) => `  ccjs_retain(frame->${param.fieldName});`),
    '  ccjs_promise_retain(frame->promise);',
    '  *out = frame->promise;',
    ...emitAsyncTaskVisibleLocalReads(wrapper, 0, { includePrefixLocals: false }).map((line) => `  ${line}`),
    ...prefixAndScheduleLines.map((line) => `  ${line}`),
    ...emitOwnedValueCleanup(context).map((line) => `  ${line}`),
    '  return CCJS_OK;',
    ...(context.failureStatementUsed
      ? [
          'ccjs_start_error:',
          ...emitOwnedValueCleanup(context).map((line) => `  ${line}`),
          '  ccjs_promise_release(*out);',
          '  *out = 0;',
          `  ${wrapper.finalizerName}(frame);`,
          '  return CCJS_ERR_TYPE;'
        ]
      : []),
    '}'
  ]

  return lines
}

function emitAsyncTaskStartParams(wrapper) {
  const params = [
    'ccjs_loop* ccjs_loop',
    ...wrapper.params.map((param) => `${emitCType(param.valueType)} ${param.argName}`),
    'ccjs_promise** out'
  ]

  return params.join(', ')
}

function registerAsyncTaskParams(wrapper, context) {
  for (const param of wrapper.params) {
    registerAsyncTaskLocalMetadata(param.name, param.valueType, param, context)
  }
}

function registerAsyncTaskAwaitLocals(wrapper, context, count) {
  for (const item of collectAsyncTaskVisibleAwaitFrameLocals(wrapper, count)) {
    registerAsyncTaskLocalMetadata(item.name, item.type, item, context)
  }
}

function registerAsyncTaskPrefixLocals(wrapper, context) {
  for (const local of collectAsyncTaskFrameLocals(wrapper, 'prefix')) {
    registerAsyncTaskLocalMetadata(local.name, local.type, local, context)
  }
}

function emitAsyncTaskStorePrefixLocalLines(wrapper) {
  return collectAsyncTaskFrameLocals(wrapper, 'prefix').flatMap((local) => {
    if (local.type === 'string') {
      return [
        ...emitPrepareOwnedValueWrite(`frame->${local.fieldName}`),
        `frame->${local.fieldName}.tag = CCJS_TAG_STRING;`,
        `frame->${local.fieldName}.as.ref = (ccjs_ref*)&${local.name}->header;`,
        `ccjs_retain(frame->${local.fieldName});`
      ]
    }

    if (isManagedRuntimeReturnType(local.type)) {
      return [
        ...emitPrepareOwnedValueWrite(`frame->${local.fieldName}`),
        `frame->${local.fieldName} = ${local.name};`,
        `ccjs_retain(frame->${local.fieldName});`
      ]
    }

    return [`frame->${local.fieldName} = ${local.name};`]
  })
}

function emitAsyncTaskVisibleLocalReads(wrapper, count, options = { includePrefixLocals: true }) {
  return [
    ...wrapper.params.flatMap((param) => emitAsyncTaskVisibleLocalRead(param.name, param.valueType, param.fieldName)),
    ...(options.includePrefixLocals === false
      ? []
      : collectAsyncTaskFrameLocals(wrapper, 'prefix').flatMap((local) =>
          emitAsyncTaskVisibleLocalRead(local.name, local.type, local.fieldName)
        )),
    ...collectAsyncTaskVisibleAwaitFrameLocals(wrapper, count).flatMap((item) =>
      emitAsyncTaskVisibleLocalRead(item.name, item.type, item.fieldName)
    )
  ]
}

function collectAsyncTaskFrameLocals(wrapper, kind: AsyncTaskFrameLocalKind | null = null) {
  return (wrapper.frameLocals ?? []).filter((local) => kind == null || local.kind === kind)
}

function collectAsyncTaskVisibleAwaitFrameLocals(wrapper, count) {
  return collectAsyncTaskFrameLocals(wrapper, 'await').filter((local) => local.index < count && local.name != null)
}

function registerAsyncTaskLocalMetadata(name, valueType, item, context) {
  context.variables.set(name, valueType)

  if (valueType === 'string') {
    context.runtimeStrings.add(name)
  } else if (valueType === 'object') {
    asyncTaskDeps(context).registerObjectShape(context, name, item.shape)
  } else if (valueType === 'array') {
    context.runtimeArrayElementTypes.set(name, item.arrayElementType ?? 'unknown')
  } else if (valueType === 'map') {
    context.mapTypes.set(name, {
      key: item.mapKeyType ?? 'unknown',
      value: item.mapValueType ?? 'unknown'
    })
  } else if (valueType === 'set') {
    context.setElementTypes.set(name, item.setElementType ?? 'unknown')
  }
}

function emitAsyncTaskVisibleLocalRead(name, valueType, fieldName) {
  if (valueType === 'string') {
    return [`ccjs_string* ${name} = (ccjs_string*)frame->${fieldName}.as.ref;`]
  }

  if (isManagedRuntimeReturnType(valueType)) {
    return [`ccjs_value ${name} = frame->${fieldName};`]
  }

  return [`${emitCType(valueType)} ${name} = frame->${fieldName};`]
}

function createAsyncTaskEmitContext(baseContext, wrapper, returnType, visibleAwaitCount) {
  const context = createFunctionContext(baseContext, returnType)
  context.statusReturn = true
  context.externalEventLoop = true
  context.eventLoopUsed = true
  registerAsyncTaskParams(wrapper, context)
  registerAsyncTaskPrefixLocals(wrapper, context)
  registerAsyncTaskAwaitLocals(wrapper, context, visibleAwaitCount)

  return context
}

function emitAsyncTaskScheduleAwaitLines(wrapper, item, context, options) {
  const awaitedPromise = emitPreparedAsyncTaskAwaitedPromiseExpression(wrapper, item, context, options)
  const awaited = awaitedPromise == null ? emitPreparedAsyncTaskAwaitedValueExpression(item, context) : null
  const finalizer = options.final ? wrapper.finalizerName : '0'
  const cleanupLines = options.cleanupLines ?? emitOwnedValueCleanup(context)

  return [
    ...(awaitedPromise == null
      ? [
          'status = ccjs_promise_new(ccjs_loop, &frame->awaited);',
          ...emitAsyncTaskScheduleStatusCheck(wrapper, options, cleanupLines)
        ]
      : awaitedPromise.lines),
    `status = ccjs_promise_then(frame->awaited, ${wrapper.resumeName}, ${wrapper.rejectName}, frame, ${finalizer});`,
    ...emitAsyncTaskScheduleStatusCheck(wrapper, options, cleanupLines),
    ...(awaitedPromise == null
      ? [
          ...(awaited?.lines ?? []),
          `status = ccjs_promise_resolve(frame->awaited, ${awaited?.expression ?? 'ccjs_undefined_value()'});`,
          ...emitAsyncTaskResolveStatusCheck(wrapper, options, cleanupLines)
        ]
      : [])
  ]
}

function emitAsyncTaskScheduleStatusCheck(wrapper, options, cleanupLines: string[] = []) {
  if (options.cleanup === 'start') {
    return [
      'if (status != CCJS_OK) {',
      ...cleanupLines.map((line) => `  ${line}`),
      '  ccjs_promise_release(*out);',
      '  *out = 0;',
      `  ${wrapper.finalizerName}(frame);`,
      '  return status;',
      '}'
    ]
  }

  return [
    'if (status != CCJS_OK) {',
    ...cleanupLines.map((line) => `  ${line}`),
    '  ccjs_status reject_status = ccjs_promise_reject(frame->promise, ccjs_number_value((ccjs_number)status));',
    `  ${wrapper.finalizerName}(frame);`,
    '  return reject_status == CCJS_OK ? status : reject_status;',
    '}'
  ]
}

function emitAsyncTaskResolveStatusCheck(wrapper, options, cleanupLines: string[] = []) {
  if (options.cleanup === 'start') {
    return [
      'if (status != CCJS_OK) {',
      ...cleanupLines.map((line) => `  ${line}`),
      '  ccjs_promise_release(*out);',
      '  *out = 0;',
      ...(options.final ? [] : [`  ${wrapper.finalizerName}(frame);`]),
      '  return status;',
      '}'
    ]
  }

  if (options.final) {
    return ['if (status != CCJS_OK) {', ...cleanupLines.map((line) => `  ${line}`), '  return status;', '}']
  }

  return emitAsyncTaskScheduleStatusCheck(wrapper, options, cleanupLines)
}

function emitPreparedAsyncTaskAwaitedPromiseExpression(wrapper, item, context, options) {
  if (item.awaitedPromiseExpression == null) {
    return null
  }

  const promiseSource = emitPreparedAsyncTaskPromiseSourceExpression(wrapper, item, context, options)

  if (promiseSource != null) {
    return promiseSource
  }

  const chain = emitPreparedAsyncTaskAwaitedPromiseChainExpression(wrapper, item, context, options)

  if (chain != null) {
    return chain
  }

  if (
    item.awaitedPromiseExpression?.type !== 'CallExpression' ||
    cPromiseRuntimeCallName(item.awaitedPromiseExpression.callee) !== 'resolve'
  ) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_ASYNC',
        'async task state-machine slice currently supports local Promise.resolve(...) variables only',
        item.awaitedPromiseExpression?.loc
      )
    )

    return {
      lines: ['status = CCJS_ERR_TYPE;', ...emitAsyncTaskScheduleStatusCheck(wrapper, options)]
    }
  }

  const value = emitPreparedAsyncTaskValueExpression(item.awaitedPromiseExpression.args[0], item.type, context)

  return {
    lines: [
      ...value.lines,
      `status = ccjs_promise_resolved(ccjs_loop, ${value.expression}, &frame->awaited);`,
      ...emitAsyncTaskScheduleStatusCheck(wrapper, options)
    ]
  }
}

function emitPreparedAsyncTaskPromiseSourceExpression(wrapper, item, context, options) {
  const expression = item.awaitedPromiseExpression

  if (expression?.type !== 'CallExpression') {
    return null
  }

  const rejected = emitPreparedAsyncTaskRejectedPromiseSourceExpression(expression, wrapper, context, options)

  if (rejected != null) {
    return rejected
  }

  const fsCall = emitPreparedAsyncTaskFsSourceExpression(expression, wrapper, context, options)

  if (fsCall != null) {
    return fsCall
  }

  const fetchCall = emitPreparedAsyncTaskFetchSourceExpression(expression, wrapper, context, options)

  if (fetchCall != null) {
    return fetchCall
  }

  const taskCall = emitPreparedAsyncTaskSourceCallExpression(expression, wrapper, context, options)

  if (taskCall != null) {
    return taskCall
  }

  const asyncCall = emitPreparedAsyncFunctionSourceCallExpression(expression, wrapper, context, options)

  if (asyncCall != null) {
    return asyncCall
  }

  const promiseCall = emitPreparedPlainPromiseSourceCallExpression(expression, wrapper, context, options)

  if (promiseCall != null) {
    return promiseCall
  }

  return null
}

function emitPreparedAsyncTaskFsSourceExpression(expression, wrapper, context, options) {
  if (!isAsyncFsRuntimeCallExpression(expression)) {
    return null
  }

  const method = cFsRuntimeExpressionMethod(expression)
  const path = asyncTaskDeps(context).emitPreparedStringBytesOperand(expression.args[0], context, 'ccjs_fs_path')
  const lines = [...path.lines]

  if (method === 'readFile') {
    lines.push(`status = ccjs_fs_read_file(ccjs_loop, ${path.bytes}, ${path.length}, &frame->awaited);`)
  } else if (method === 'readFileBytes') {
    lines.push(`status = ccjs_fs_read_file_bytes(ccjs_loop, ${path.bytes}, ${path.length}, &frame->awaited);`)
  } else if (method === 'readDir') {
    lines.push(`status = ccjs_fs_read_dir(ccjs_loop, ${path.bytes}, ${path.length}, &frame->awaited);`)
  } else if (method === 'readDirDirents') {
    lines.push(`status = ccjs_fs_read_dir_dirents(ccjs_loop, ${path.bytes}, ${path.length}, &frame->awaited);`)
  } else if (method === 'stat') {
    lines.push(`status = ccjs_fs_stat(ccjs_loop, ${path.bytes}, ${path.length}, &frame->awaited);`)
  } else if (method === 'lstat') {
    lines.push(`status = ccjs_fs_lstat(ccjs_loop, ${path.bytes}, ${path.length}, &frame->awaited);`)
  } else if (method === 'realpath') {
    lines.push(`status = ccjs_fs_realpath(ccjs_loop, ${path.bytes}, ${path.length}, &frame->awaited);`)
  } else if (method === 'readlink') {
    lines.push(`status = ccjs_fs_readlink(ccjs_loop, ${path.bytes}, ${path.length}, &frame->awaited);`)
  } else if (method === 'access') {
    const mode = asyncTaskDeps(context).emitPreparedFsAccessModeExpression(expression, context)

    lines.push(...mode.lines)
    lines.push(
      `status = ccjs_fs_access(ccjs_loop, ${path.bytes}, ${path.length}, ${mode.expression}, &frame->awaited);`
    )
  } else if (method === 'appendFileBytes') {
    const bytes = asyncTaskDeps(context).emitCValueExpression(expression.args[1], context)

    lines.push(...bytes.lines)
    lines.push(emitRuntimeValueCheck(bytes.expression, 'CCJS_TAG_BYTES', context))
    lines.push(
      `status = ccjs_fs_append_file_bytes(ccjs_loop, ${path.bytes}, ${path.length}, ${bytes.expression}, &frame->awaited);`
    )
  } else if (method === 'appendFile') {
    const bytes = asyncTaskDeps(context).emitPreparedStringBytesOperand(expression.args[1], context, 'ccjs_fs_bytes')

    lines.push(...bytes.lines)
    lines.push(
      `status = ccjs_fs_append_file(ccjs_loop, ${path.bytes}, ${path.length}, ${bytes.bytes}, ${bytes.length}, &frame->awaited);`
    )
  } else if (method === 'copyFile') {
    const destPath = asyncTaskDeps(context).emitPreparedStringBytesOperand(expression.args[1], context, 'ccjs_fs_dest_path')

    lines.push(...destPath.lines)
    lines.push(
      `status = ccjs_fs_copy_file(ccjs_loop, ${path.bytes}, ${path.length}, ${destPath.bytes}, ${destPath.length}, &frame->awaited);`
    )
  } else if (method === 'symlink') {
    const linkPath = asyncTaskDeps(context).emitPreparedStringBytesOperand(expression.args[1], context, 'ccjs_fs_link_path')

    lines.push(...linkPath.lines)
    lines.push(
      `status = ccjs_fs_symlink(ccjs_loop, ${path.bytes}, ${path.length}, ${linkPath.bytes}, ${linkPath.length}, &frame->awaited);`
    )
  } else if (method === 'mkdir') {
    lines.push(
      `status = ccjs_fs_mkdir(ccjs_loop, ${path.bytes}, ${path.length}, ${asyncTaskDeps(context).emitFsBooleanFlag(expression, 'fsRecursive')}, &frame->awaited);`
    )
  } else if (method === 'unlink') {
    lines.push(`status = ccjs_fs_unlink(ccjs_loop, ${path.bytes}, ${path.length}, &frame->awaited);`)
  } else if (method === 'rm') {
    lines.push(
      `status = ccjs_fs_rm(ccjs_loop, ${path.bytes}, ${path.length}, ${asyncTaskDeps(context).emitFsBooleanFlag(expression, 'fsRecursive')}, ${asyncTaskDeps(context).emitFsBooleanFlag(expression, 'fsForce')}, &frame->awaited);`
    )
  } else if (method === 'rename') {
    const newPath = asyncTaskDeps(context).emitPreparedStringBytesOperand(expression.args[1], context, 'ccjs_fs_new_path')

    lines.push(...newPath.lines)
    lines.push(
      `status = ccjs_fs_rename(ccjs_loop, ${path.bytes}, ${path.length}, ${newPath.bytes}, ${newPath.length}, &frame->awaited);`
    )
  } else if (method === 'writeFileBytes') {
    const bytes = asyncTaskDeps(context).emitCValueExpression(expression.args[1], context)

    lines.push(...bytes.lines)
    lines.push(emitRuntimeValueCheck(bytes.expression, 'CCJS_TAG_BYTES', context))
    lines.push(
      `status = ccjs_fs_write_file_bytes(ccjs_loop, ${path.bytes}, ${path.length}, ${bytes.expression}, &frame->awaited);`
    )
  } else {
    const bytes = asyncTaskDeps(context).emitPreparedStringBytesOperand(expression.args[1], context, 'ccjs_fs_bytes')

    lines.push(...bytes.lines)
    lines.push(
      `status = ccjs_fs_write_file(ccjs_loop, ${path.bytes}, ${path.length}, ${bytes.bytes}, ${bytes.length}, &frame->awaited);`
    )
  }

  return {
    lines: [...lines, ...emitAsyncTaskScheduleStatusCheck(wrapper, options)]
  }
}

function emitPreparedAsyncTaskFetchSourceExpression(expression, wrapper, context, options) {
  if (!isAsyncFetchRuntimeCallExpression(expression)) {
    return null
  }

  const method = cFetchRuntimeExpressionMethod(expression)
  const lines: string[] = []

  if (method === 'fetch') {
    const url = asyncTaskDeps(context).emitPreparedStringBytesOperand(expression.args[0], context, 'ccjs_fetch_url')
    const init = asyncTaskDeps(context).emitPreparedFetchInitOperand(expression, context)

    lines.push(...url.lines)
    lines.push(...init.lines)
    lines.push(
      init.expression === '0'
        ? `status = ccjs_fetch(ccjs_loop, ${url.bytes}, ${url.length}, &frame->awaited);`
        : `status = ccjs_fetch_with_init(ccjs_loop, ${url.bytes}, ${url.length}, ${init.expression}, &frame->awaited);`
    )
  } else {
    const response = asyncTaskDeps(context).emitCValueExpression(expression.callee.object, context)

    lines.push(...response.lines)
    lines.push(
      emitRuntimeTypeCheck(
        `${response.expression}.tag != CCJS_TAG_OBJECT || ${response.expression}.as.ref == 0`,
        context
      )
    )
    lines.push(`status = ccjs_fetch_response_text(ccjs_loop, ${response.expression}, &frame->awaited);`)
  }

  return {
    lines: [...lines, ...emitAsyncTaskScheduleStatusCheck(wrapper, options)]
  }
}

function emitPreparedAsyncTaskRejectedPromiseSourceExpression(expression, wrapper, context, options) {
  if (cPromiseRuntimeCallName(expression.callee) !== 'reject') {
    return null
  }

  if (expression.args[0]?.type === 'StringLiteral') {
    const value = nextCName(context, 'ccjs_reject_value')
    const bytes = cStringLiteral(expression.args[0].value)
    const length = utf8ByteLength(expression.args[0].value)

    return {
      lines: [
        `ccjs_value ${value} = ccjs_undefined_value();`,
        `status = ccjs_string_from_literal(&ccjs_default_allocator, ${bytes}, ${length}, &${value});`,
        ...emitAsyncTaskScheduleStatusCheck(wrapper, options, [`ccjs_release(${value});`]),
        `status = ccjs_promise_rejected(ccjs_loop, ${value}, &frame->awaited);`,
        `ccjs_release(${value});`,
        `${value} = ccjs_undefined_value();`,
        ...emitAsyncTaskScheduleStatusCheck(wrapper, options)
      ]
    }
  }

  if (
    expression.args[0] != null &&
    expression.args[0].type !== 'NumberLiteral' &&
    expression.args[0].type !== 'BooleanLiteral'
  ) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_ASYNC',
        'async task Promise.reject currently supports string, number and boolean rejection values in C',
        expression.loc
      )
    )

    return {
      lines: ['status = CCJS_ERR_TYPE;', ...emitAsyncTaskScheduleStatusCheck(wrapper, options)]
    }
  }

  const value =
    expression.args[0] == null
      ? {
          lines: [],
          expression: 'ccjs_undefined_value()'
        }
      : asyncTaskDeps(context).emitCValueExpression(expression.args[0], context)

  return {
    lines: [
      ...value.lines,
      `status = ccjs_promise_rejected(ccjs_loop, ${value.expression}, &frame->awaited);`,
      ...emitAsyncTaskScheduleStatusCheck(wrapper, options)
    ]
  }
}

function emitPreparedAsyncTaskSourceCallExpression(expression, wrapper, context, options) {
  if (expression.callee?.type !== 'Reference' || expression.callee.path.length !== 1) {
    return null
  }

  const target = context.asyncTaskWrappers.get(expression.callee.path[0])

  if (target == null) {
    return null
  }

  const prepared = asyncTaskDeps(context).emitPreparedCallArgs(expression, target.params, context)
  const args = ['ccjs_loop', ...prepared.args, '&frame->awaited']

  return {
    lines: [
      ...prepared.lines,
      `status = ${target.startName}(${args.join(', ')});`,
      ...emitAsyncTaskScheduleStatusCheck(wrapper, options)
    ]
  }
}

function emitPreparedAsyncFunctionSourceCallExpression(expression, wrapper, context, options) {
  if (!isAsyncFunctionCallee(expression.callee, context) || asyncTaskDeps(context).isThrowingFunctionCallee(expression.callee, context)) {
    return null
  }

  const valueType =
    resolveCAsyncFunctionAwaitValueType(expression.callee, context) ?? expression.promiseValueType ?? 'unknown'

  if (!isSupportedAsyncTaskValueType(valueType)) {
    return null
  }

  const call = asyncTaskDeps(context).emitPreparedCallExpression(expression, context)

  if (valueType === 'void') {
    return {
      lines: [
        ...call.lines,
        `${call.expression};`,
        'status = ccjs_promise_resolved(ccjs_loop, ccjs_undefined_value(), &frame->awaited);',
        ...emitAsyncTaskScheduleStatusCheck(wrapper, options)
      ]
    }
  }

  if (isManagedRuntimeReturnType(valueType)) {
    const value = nextCName(context, 'ccjs_async_value')
    const tag = cRuntimeValueTag(valueType)

    return {
      lines: [
        ...call.lines,
        `ccjs_value ${value} = ${call.expression};`,
        emitRuntimeValueCheck(value, tag, context),
        `status = ccjs_promise_resolved(ccjs_loop, ${value}, &frame->awaited);`,
        ...emitAsyncTaskScheduleStatusCheck(wrapper, options, [`ccjs_release(${value});`]),
        `ccjs_release(${value});`
      ]
    }
  }

  const value =
    valueType === 'boolean' ? `ccjs_bool_value((${call.expression}) != 0)` : `ccjs_number_value(${call.expression})`

  return {
    lines: [
      ...call.lines,
      `status = ccjs_promise_resolved(ccjs_loop, ${value}, &frame->awaited);`,
      ...emitAsyncTaskScheduleStatusCheck(wrapper, options)
    ]
  }
}

function emitPreparedPlainPromiseSourceCallExpression(expression, wrapper, context, options) {
  if (!isPromiseReturningFunctionCallee(expression.callee, context)) {
    return null
  }

  const params = asyncTaskDeps(context).resolveFunctionParams(expression.callee, context)

  if (params == null) {
    return null
  }

  const prepared = asyncTaskDeps(context).emitPreparedCallArgs(expression, params, context)

  return {
    lines: [
      ...prepared.lines,
      `frame->awaited = ${asyncTaskDeps(context).emitCallee(expression.callee, context)}(${['ccjs_loop', ...prepared.args].join(', ')});`,
      'status = frame->awaited == 0 ? CCJS_ERR_TYPE : CCJS_OK;',
      ...emitAsyncTaskScheduleStatusCheck(wrapper, options)
    ]
  }
}

function emitPreparedAsyncTaskAwaitedPromiseChainExpression(wrapper, item, context, options) {
  const expression = item.awaitedPromiseExpression

  if (
    expression?.type !== 'CallExpression' ||
    expression.callee?.type !== 'MemberExpression' ||
    expression.callee.property !== 'then'
  ) {
    return null
  }

  const receiver = expression.callee.object
  const callback = expression.args[0]
  const chainWrapper = callback == null ? null : context.promiseChainArrowWrappers.get(callback)

  if (
    receiver?.type !== 'CallExpression' ||
    cPromiseRuntimeCallName(receiver.callee) !== 'resolve' ||
    chainWrapper == null
  ) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_ASYNC',
        'async task state-machine slice currently supports local Promise.resolve(...).then(...) variables only',
        expression.loc
      )
    )

    return {
      lines: ['status = CCJS_ERR_TYPE;', ...emitAsyncTaskScheduleStatusCheck(wrapper, options)]
    }
  }

  const source = nextCName(context, 'ccjs_async_task_source')
  const sourceType = receiver.promiseValueType ?? callback.params[0]?.valueType ?? item.type
  const value = emitPreparedAsyncTaskValueExpression(receiver.args[0], sourceType, context)
  const callbackContext = emitAsyncTaskPromiseChainCallbackContext(wrapper, chainWrapper, context, options)
  const cleanupLines =
    callbackContext.expression === '0' ? [] : [`${chainWrapper.finalizerName}(${callbackContext.expression});`]

  return {
    lines: [
      ...callbackContext.lines,
      `ccjs_promise* ${source} = 0;`,
      ...value.lines,
      `status = ccjs_promise_resolved(ccjs_loop, ${value.expression}, &${source});`,
      ...emitAsyncTaskScheduleStatusCheck(wrapper, options, cleanupLines),
      `status = ccjs_promise_chain(${source}, ${chainWrapper.name}, 0, ${callbackContext.expression}, ${callbackContext.finalizer}, &frame->awaited);`,
      `ccjs_promise_release(${source});`,
      `${source} = 0;`,
      ...emitAsyncTaskScheduleStatusCheck(wrapper, options, cleanupLines)
    ]
  }
}

function emitAsyncTaskPromiseChainCallbackContext(asyncWrapper, chainWrapper, context, options) {
  if (!isPromiseChainCallbackWrapperWithContext(chainWrapper)) {
    return {
      lines: [],
      expression: '0',
      finalizer: '0'
    }
  }

  const lines: string[] = []

  for (const capture of chainWrapper.captures) {
    if (capture.mutable) {
      context.diagnostics.push(
        diagnostic(
          'CCJS_C_ASYNC',
          'mutable Promise callback captures are outside the current C backend MVP; use const captures or move mutation outside the Promise callback',
          chainWrapper.expression.loc
        )
      )
    }

    if (!['number', 'boolean', 'string', 'object'].includes(capture.valueType)) {
      context.diagnostics.push(
        diagnostic(
          'CCJS_C_ASYNC',
          'capturing async Promise callbacks currently support only const number/boolean/string/object bindings',
          chainWrapper.expression.loc
        )
      )
    }
  }

  const contextName = nextCName(context, 'ccjs_promise_callback_ctx')

  lines.push(
    `${chainWrapper.contextTypeName}* ${contextName} = ccjs_default_alloc(0, sizeof(${chainWrapper.contextTypeName}), _Alignof(${chainWrapper.contextTypeName}));`
  )
  lines.push('if (' + contextName + ' == 0) {')
  lines.push('  status = CCJS_ERR_OOM;')
  lines.push(...emitAsyncTaskScheduleStatusCheck(asyncWrapper, options).map((line) => `  ${line}`))
  lines.push('}')

  if (chainWrapper.needsEventLoop === true) {
    lines.push(`${contextName}->ccjs_loop = ccjs_loop;`)
  }

  for (const capture of chainWrapper.captures) {
    lines.push(...asyncTaskDeps(context).emitRuntimeArrowCaptureStoreLines(capture, contextName, context))
  }

  return {
    lines,
    expression: contextName,
    finalizer: chainWrapper.finalizerName
  }
}

function emitPreparedAsyncTaskAwaitedValueExpression(item, context) {
  if (
    item.awaitedExpression?.type !== 'CallExpression' ||
    cPromiseRuntimeCallName(item.awaitedExpression.callee) !== 'resolve'
  ) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_ASYNC',
        'async task state-machine slice currently supports await Promise.resolve(...) only',
        item.awaitedExpression?.loc
      )
    )

    return {
      lines: ['status = CCJS_ERR_TYPE;'],
      expression: 'ccjs_undefined_value()'
    }
  }

  return emitPreparedAsyncTaskValueExpression(item.awaitedExpression.args[0], item.type, context)
}

function emitPreparedAsyncTaskValueExpression(expression, valueType, context) {
  if (valueType === 'void') {
    return {
      lines: [],
      expression: 'ccjs_undefined_value()'
    }
  }

  if (isManagedRuntimeReturnType(valueType)) {
    const value = asyncTaskDeps(context).emitCValueExpression(expression, context)
    const expectedTag = cRuntimeValueTag(valueType)

    return {
      lines: [...value.lines, emitRuntimeValueCheck(value.expression, expectedTag, context)],
      expression: value.expression
    }
  }

  if (valueType === 'boolean') {
    const value = asyncTaskDeps(context).emitPreparedNumberExpression(expression, context)

    return {
      lines: value.lines,
      expression: `ccjs_bool_value((${value.expression}) != 0)`
    }
  }

  const value = asyncTaskDeps(context).emitPreparedNumberExpression(expression, context)

  return {
    lines: value.lines,
    expression: `ccjs_number_value(${value.expression})`
  }
}

function emitAsyncTaskResumeDeclaration(wrapper, baseContext) {
  const context = createAsyncTaskEmitContext(baseContext, wrapper, wrapper.returnType, wrapper.awaits.length)
  const returnValue = hasAsyncTaskStatementLocalDeclarations(collectAsyncTaskSuccessPhaseStatements(wrapper, ['body']))
    ? null
    : emitPreparedAsyncTaskValueExpression(wrapper.returnExpression, wrapper.returnType, context)
  const returnValueOwnedValues = returnValue == null ? [] : [...context.ownedValues]
  const cases = wrapper.awaits.flatMap((item) =>
    emitAsyncTaskResumeCase(wrapper, item, baseContext, returnValue, returnValueOwnedValues)
  )

  return [
    `static ccjs_status ${wrapper.resumeName}(void* context, ccjs_value ccjs_value_input) {`,
    `  ${wrapper.frameTypeName}* frame = (${wrapper.frameTypeName}*)context;`,
    '  if (frame == 0 || frame->promise == 0) return CCJS_ERR_TYPE;',
    '  ccjs_status status = CCJS_OK;',
    '  switch (frame->state) {',
    ...cases.map((line) => `  ${line}`),
    '  default:',
    '    return ccjs_promise_reject(frame->promise, ccjs_number_value((ccjs_number)CCJS_ERR_TYPE));',
    '  }',
    '}'
  ]
}

function emitAsyncTaskResumeCase(wrapper, item, baseContext, returnValue, returnValueOwnedValues) {
  const nextItem = wrapper.awaits[item.index + 1] ?? null
  const valueCheck = emitAsyncTaskFulfilledValueCheck(wrapper, item)
  const lines = [
    `case ${item.index}: {`,
    ...valueCheck.map((line) => `  ${line}`),
    ...emitAsyncTaskStoreFulfilledValueLines(item).map((line) => `  ${line}`),
    '  if (frame->awaited != 0) {',
    '    ccjs_promise_release(frame->awaited);',
    '    frame->awaited = 0;',
    '  }'
  ]

  if (nextItem == null) {
    lines.push(...emitAsyncTaskVisibleLocalReads(wrapper, item.index + 1).map((line) => `  ${line}`))
    if (returnValue == null) {
      lines.push(...emitAsyncTaskTrySuccessPreludeAndReturnLines(wrapper, item, baseContext).map((line) => `  ${line}`))
    } else if (returnValueOwnedValues.length > 0) {
      lines.push(...returnValueOwnedValues.map((name) => `  ccjs_value ${name} = ccjs_undefined_value();`))
      lines.push(
        ...emitAsyncTaskTrySuccessPreludeLines(wrapper, baseContext, item.index + 1).map((line) => `  ${line}`)
      )
      lines.push(...returnValue.lines.map((line) => `  ${line}`))
      lines.push(
        ...emitAsyncTaskTrySuccessFinallyLines(wrapper, baseContext, item.index + 1).map((line) => `  ${line}`)
      )
      lines.push(`  status = ccjs_promise_resolve(frame->promise, ${returnValue.expression});`)
      lines.push(...returnValueOwnedValues.toReversed().map((name) => `  ccjs_release(${name});`))
      lines.push('  return status;')
    } else {
      lines.push(
        ...emitAsyncTaskTrySuccessPreludeLines(wrapper, baseContext, item.index + 1).map((line) => `  ${line}`)
      )
      lines.push(...returnValue.lines.map((line) => `  ${line}`))
      lines.push(
        ...emitAsyncTaskTrySuccessFinallyLines(wrapper, baseContext, item.index + 1).map((line) => `  ${line}`)
      )
      lines.push(`  return ccjs_promise_resolve(frame->promise, ${returnValue.expression});`)
    }
    lines.push('}')
    return lines
  }

  const context = createAsyncTaskEmitContext(baseContext, wrapper, 'void', item.index + 1)
  const schedule = emitAsyncTaskScheduleAwaitLines(wrapper, nextItem, context, {
    cleanup: 'resume',
    final: nextItem.index === wrapper.awaits.length - 1
  })

  lines.push(...emitAsyncTaskVisibleLocalReads(wrapper, item.index + 1).map((line) => `  ${line}`))
  lines.push('  ccjs_loop* ccjs_loop = frame->ccjs_loop;')
  lines.push('  if (ccjs_loop == 0) {')
  lines.push(
    ...emitAsyncTaskRejectAndMaybeFinalizeLines(wrapper, item, 'ccjs_number_value((ccjs_number)CCJS_ERR_TYPE)').map(
      (line) => `    ${line}`
    )
  )
  lines.push('  }')
  lines.push(`  frame->state = ${nextItem.index};`)
  lines.push(...schedule.map((line) => `  ${line}`))
  lines.push('  return CCJS_OK;')
  lines.push('}')

  return lines
}

function hasAsyncTaskStatementLocalDeclarations(statements) {
  return statements.some(
    (statement) => statement?.type === 'VariableDeclaration' && isManagedRuntimeReturnType(statement.valueType)
  )
}

function collectAsyncTaskSuccessPhaseStatements(wrapper, kinds: string[] | null = null) {
  const allowedKinds = kinds == null ? null : new Set(kinds)

  return (wrapper.successPhases ?? [])
    .filter((phase) => allowedKinds == null || allowedKinds.has(phase.kind))
    .flatMap((phase) => phase.statements)
}

function collectAsyncTaskTryPhaseStatements(wrapper, kind) {
  return (wrapper.tryPhases ?? []).filter((phase) => phase.kind === kind).flatMap((phase) => phase.statements)
}

function emitAsyncTaskFulfilledValueCheck(wrapper, item) {
  const expectedTag = cRuntimeValueTag(item.type)

  if (expectedTag == null) {
    return []
  }

  const refCheck = isManagedRuntimeReturnType(item.type) ? ' || ccjs_value_input.as.ref == 0' : ''

  return [
    `if (ccjs_value_input.tag != ${expectedTag}${refCheck}) {`,
    ...emitAsyncTaskRejectAndMaybeFinalizeLines(wrapper, item, 'ccjs_number_value((ccjs_number)CCJS_ERR_TYPE)').map(
      (line) => `  ${line}`
    ),
    '}'
  ]
}

function emitAsyncTaskStoreFulfilledValueLines(item) {
  if (item.fieldName == null || item.type === 'void') {
    return []
  }

  if (item.type === 'boolean') {
    return [`frame->${item.fieldName} = ccjs_value_input.as.boolean ? 1 : 0;`]
  }

  if (item.type === 'number') {
    return [`frame->${item.fieldName} = ccjs_value_input.as.number;`]
  }

  if (isManagedRuntimeReturnType(item.type)) {
    return [`frame->${item.fieldName} = ccjs_value_input;`, `ccjs_retain(frame->${item.fieldName});`]
  }

  return []
}

function emitAsyncTaskRejectAndMaybeFinalizeLines(wrapper, item, errorExpression) {
  return [
    `ccjs_status reject_status = ccjs_promise_reject(frame->promise, ${errorExpression});`,
    ...(item.index < wrapper.awaits.length - 1 ? [`${wrapper.finalizerName}(frame);`] : []),
    'return reject_status;'
  ]
}

function emitAsyncTaskTrySuccessFinallyLines(wrapper, baseContext, visibleAwaitCount) {
  if (!wrapper.hasTryRegion) {
    return []
  }

  return emitAsyncTaskTryStatementList(
    collectAsyncTaskTryPhaseStatements(wrapper, 'success-finalizer'),
    wrapper,
    baseContext,
    visibleAwaitCount
  )
}

function emitAsyncTaskTrySuccessPreludeLines(wrapper, baseContext, visibleAwaitCount) {
  return emitAsyncTaskTryStatementList(
    collectAsyncTaskSuccessPhaseStatements(wrapper),
    wrapper,
    baseContext,
    visibleAwaitCount
  )
}

function emitAsyncTaskTrySuccessPreludeAndReturnLines(wrapper, item, baseContext) {
  const visibleAwaitCount = item.index + 1
  const context = createAsyncTaskEmitContext(baseContext, wrapper, wrapper.returnType, visibleAwaitCount)
  const result = withVariableScope(context, () => {
    const preludeLines = asyncTaskDeps(context).emitStatementList(collectAsyncTaskSuccessPhaseStatements(wrapper), context)
    const returnValue = emitPreparedAsyncTaskValueExpression(wrapper.returnExpression, wrapper.returnType, context)

    return {
      preludeLines,
      returnValue
    }
  })

  return [
    ...emitOwnedValueDeclarations(context),
    ...result.preludeLines,
    ...result.returnValue.lines,
    ...emitAsyncTaskTrySuccessFinallyLines(wrapper, baseContext, visibleAwaitCount),
    `status = ccjs_promise_resolve(frame->promise, ${result.returnValue.expression});`,
    ...emitOwnedValueCleanup(context),
    'return status;'
  ]
}

function emitAsyncTaskTryRejectFinallyLines(wrapper, baseContext, visibleAwaitCount) {
  if (!wrapper.hasTryRegion) {
    return []
  }

  return emitAsyncTaskTryStatementList(
    collectAsyncTaskTryPhaseStatements(wrapper, 'reject-finalizer'),
    wrapper,
    baseContext,
    visibleAwaitCount
  )
}

function emitAsyncTaskTryHandlerPreludeLines(wrapper, baseContext, visibleAwaitCount) {
  if (!wrapper.hasTryRegion) {
    return []
  }

  return emitAsyncTaskTryStatementList(
    collectAsyncTaskTryPhaseStatements(wrapper, 'handler-prelude'),
    wrapper,
    baseContext,
    visibleAwaitCount
  )
}

function emitAsyncTaskTryFinallyLines(wrapper, baseContext, visibleAwaitCount) {
  if (!wrapper.hasTryRegion) {
    return []
  }

  return emitAsyncTaskTryStatementList(
    collectAsyncTaskTryPhaseStatements(wrapper, 'handler-finalizer'),
    wrapper,
    baseContext,
    visibleAwaitCount
  )
}

function emitAsyncTaskTryStatementList(statements, wrapper, baseContext, visibleAwaitCount) {
  if (statements.length === 0) {
    return []
  }

  const context = createAsyncTaskEmitContext(baseContext, wrapper, 'void', visibleAwaitCount)
  const lines = withVariableScope(context, () => asyncTaskDeps(context).emitStatementList(statements, context))

  return [...emitOwnedValueDeclarations(context), ...lines, ...emitOwnedValueCleanup(context)]
}

function emitAsyncTaskSettleAndMaybeFinalizeLines(wrapper, item, call) {
  return [
    `status = ${call};`,
    ...(item.index < wrapper.awaits.length - 1 ? [`${wrapper.finalizerName}(frame);`] : []),
    'return status;'
  ]
}

function emitAsyncTaskRejectDeclaration(wrapper, baseContext) {
  if (wrapper.hasTryRegion) {
    return emitAsyncTaskTryRejectDeclaration(wrapper, baseContext)
  }

  const lastState = wrapper.awaits.length - 1

  return [
    `static ccjs_status ${wrapper.rejectName}(void* context, ccjs_value ccjs_error) {`,
    `  ${wrapper.frameTypeName}* frame = (${wrapper.frameTypeName}*)context;`,
    '  if (frame == 0 || frame->promise == 0) return CCJS_ERR_TYPE;',
    '  ccjs_status status = ccjs_promise_reject(frame->promise, ccjs_error);',
    ...(lastState > 0 ? [`  if (frame->state < ${lastState}) {`, `    ${wrapper.finalizerName}(frame);`, '  }'] : []),
    '  return status;',
    '}'
  ]
}

function emitAsyncTaskTryRejectDeclaration(wrapper, baseContext) {
  const cases = wrapper.awaits.flatMap((item) => emitAsyncTaskTryRejectCase(wrapper, item, baseContext))

  return [
    `static ccjs_status ${wrapper.rejectName}(void* context, ccjs_value ccjs_error) {`,
    `  ${wrapper.frameTypeName}* frame = (${wrapper.frameTypeName}*)context;`,
    '  if (frame == 0 || frame->promise == 0) return CCJS_ERR_TYPE;',
    '  ccjs_status status = CCJS_OK;',
    '  switch (frame->state) {',
    ...cases.map((line) => `  ${line}`),
    '  default:',
    '    status = ccjs_promise_reject(frame->promise, ccjs_error);',
    '    return status;',
    '  }',
    '}'
  ]
}

function emitAsyncTaskTryRejectCase(wrapper, item, baseContext) {
  const handler = wrapper.tryHandler ?? null
  const lines = [`case ${item.index}: {`]

  if (handler == null) {
    lines.push(...emitAsyncTaskVisibleLocalReads(wrapper, item.index).map((line) => `  ${line}`))
    lines.push(...emitAsyncTaskTryRejectFinallyLines(wrapper, baseContext, item.index).map((line) => `  ${line}`))
    lines.push(
      ...emitAsyncTaskSettleAndMaybeFinalizeLines(wrapper, item, 'ccjs_promise_reject(frame->promise, ccjs_error)').map(
        (line) => `  ${line}`
      )
    )
    lines.push('}')

    return lines
  }

  if (handler.param != null) {
    lines.push('  if (ccjs_error.tag != CCJS_TAG_STRING || ccjs_error.as.ref == 0) {')
    lines.push(
      ...emitAsyncTaskSettleAndMaybeFinalizeLines(
        wrapper,
        item,
        'ccjs_promise_reject(frame->promise, ccjs_number_value((ccjs_number)CCJS_ERR_TYPE))'
      ).map((line) => `    ${line}`)
    )
    lines.push('  }')
  }

  lines.push(...emitAsyncTaskVisibleLocalReads(wrapper, item.index).map((line) => `  ${line}`))
  lines.push(...emitAsyncTaskTryHandlerPreludeLines(wrapper, baseContext, item.index).map((line) => `  ${line}`))

  if (handler.param != null) {
    lines.push(`  ccjs_string* ${handler.param} = (ccjs_string*)ccjs_error.as.ref;`)
  }

  lines.push(
    ...emitAsyncTaskTryHandlerBodyAndReturnLines(wrapper, item, baseContext, handler).map((line) => `  ${line}`)
  )
  lines.push('}')

  return lines
}

function emitAsyncTaskTryHandlerBodyAndReturnLines(wrapper, item, baseContext, handler) {
  const visibleAwaitCount = item.index
  const context = createAsyncTaskEmitContext(baseContext, wrapper, wrapper.returnType, visibleAwaitCount)

  if (handler.param != null) {
    context.variables.set(handler.param, 'string')
    context.runtimeStrings.add(handler.param)
  }

  const result = withVariableScope(context, () => {
    const handlerLines = asyncTaskDeps(context).emitStatementList(handler.statements ?? [], context)
    const returnValue = emitPreparedAsyncTaskValueExpression(handler.returnExpression, wrapper.returnType, context)

    return {
      handlerLines,
      returnValue
    }
  })

  return [
    ...emitOwnedValueDeclarations(context),
    ...result.handlerLines,
    ...result.returnValue.lines,
    ...emitAsyncTaskTryFinallyLines(wrapper, baseContext, visibleAwaitCount),
    `status = ccjs_promise_resolve(frame->promise, ${result.returnValue.expression});`,
    ...emitOwnedValueCleanup(context),
    ...(item.index < wrapper.awaits.length - 1 ? [`${wrapper.finalizerName}(frame);`] : []),
    'return status;'
  ]
}

function emitAsyncTaskFinalizerDeclaration(wrapper) {
  return [
    `static void ${wrapper.finalizerName}(void* context) {`,
    `  ${wrapper.frameTypeName}* frame = (${wrapper.frameTypeName}*)context;`,
    '  if (frame == 0) return;',
    '  if (frame->awaited != 0) ccjs_promise_release(frame->awaited);',
    ...wrapper.params
      .filter((param) => isManagedRuntimeReturnType(param.valueType))
      .map((param) => `  ccjs_release(frame->${param.fieldName});`),
    ...wrapper.frameLocals
      .filter((local) => isManagedRuntimeReturnType(local.type))
      .map((local) => `  ccjs_release(frame->${local.fieldName});`),
    '  if (frame->promise != 0) ccjs_promise_release(frame->promise);',
    '  if (frame->ccjs_loop != 0 && frame->ccjs_loop->allocator != 0) {',
    '    frame->ccjs_loop->allocator->free(frame->ccjs_loop->allocator->user, frame, sizeof(*frame), _Alignof(*frame));',
    '  }',
    '}'
  ]
}


export function emitAsyncTaskFunctionStubDeclaration(
  statement,
  context: CFunctionContext,
  dependencies: AsyncTaskLoweringDependencies
) {
  context.asyncTaskLoweringDependencies = dependencies
  const returnLine =
    context.returnType === 'void'
      ? '  return;'
      : isManagedRuntimeReturnType(context.returnType)
        ? '  return ccjs_undefined_value();'
        : '  return 0;'

  return [`${asyncTaskDeps(context).emitFunctionHead(statement, context)} {`, returnLine, '}']
}
