import { throwDiagnostics } from '../diagnostics.ts'
import {
  collectIrFunctionDeclarations,
  collectIrFunctionEffectsWithExternalEffects,
  collectIrFunctionNodeEntries,
  collectIrGlobalRoots,
  collectIrGlobalUsages,
  collectIrRuntimeRequirements,
  collectIrStoredFunctionEffects,
  collectIrSyntaxFeatureUsages,
  collectIrTopLevelNodesFromPrograms,
  irClassMethodEffectName,
  mergeIrFunctionEffects
} from '../ir.ts'
import type {
  AnyNode,
  Diagnostic,
  IrFunctionDeclaration,
  IrFunctionEffect,
  IrProgram,
  IrRuntimeRequirement
} from '../types.ts'
import type { CallbackLoweringDependencies } from './async/callbacks.ts'
import {
  callbackContextWrapperFinalizerName,
  collectCallbackWrappers,
  collectFunctionPointerParamNames,
  emitFunctionPointerParams,
  emitFunctionPointerNamedParams,
  emitFunctionPointerReturnType,
  emitPlainArrowCallbackWrapperDeclaration,
  emitPlainArrowCallbackWrapperHead,
  emitRuntimeArrowCallbackContextType,
  emitRuntimeCallbackWrapperDeclaration,
  emitRuntimeCallbackWrapperHead,
  isNullableFunctionType,
  isPlainFunctionPointerType,
  isPromiseChainCallbackWrapperWithContext,
  isRuntimeFunctionType,
  isRuntimeArrowCallbackWrapperWithContext,
  isRuntimeCallbackWrapper
} from './async/callbacks.ts'
import type { PromiseChainLoweringDependencies } from './async/promises.ts'
import {
  collectPromiseChainWrappers,
  emitPromiseChainCallbackWrapperDeclaration,
  emitPromiseChainCallbackWrapperHead
} from './async/promises.ts'
import type { AsyncTaskLoweringDependencies } from './async/tasks.ts'
import {
  collectAsyncTaskWrappers,
  emitAsyncTaskFrameType,
  emitAsyncTaskWrapperDeclaration,
  emitAsyncTaskWrapperPrototypes
} from './async/tasks.ts'
import type {
  CAsyncTaskWrapperMap,
  CCallbackWrapperMap,
  CDgramMessageHandlerMap,
  CEmitContext,
  CHttpHandlerMap,
  CNetHandlerMap,
  CPromiseChainWrapperMap
} from './context.ts'
import { reportUnsupportedCGlobalUsages, reportUnsupportedCSyntaxFeatures } from './diagnostics.ts'
import { emitCIdentifier, emitCObjectFunctionFieldName } from './identifiers.ts'
import { emitCPrelude } from './prelude.ts'
import {
  collectHttpRuntimeCreateServerNames,
  collectHttpRuntimeImportNames,
  collectRuntimeImportNames,
  collectRuntimeNamedImportNames
} from './runtime-imports.ts'
import { resolveCRuntimePreludeRequirements } from './runtime-plan.ts'
import type { DgramLoweringDependencies } from './stdlib/dgram.ts'
import {
  collectDgramMessageHandlers,
  emitDgramMessageHandlerDeclaration,
  emitDgramMessageHandlerHead
} from './stdlib/dgram.ts'
import type { HttpLoweringDependencies } from './stdlib/http.ts'
import { collectHttpHandlers, emitHttpHandlerDeclaration, emitHttpHandlerHead } from './stdlib/http.ts'
import type { NetLoweringDependencies } from './stdlib/net.ts'
import { collectNetHandlers, emitNetHandlerDeclaration, emitNetHandlerHead } from './stdlib/net.ts'
import type {
  CClassInfo,
  CClassMethod,
  CEmitOptions,
  CFunctionType,
  CFunctionPointerAdapter,
  CFunctionParam,
  CObjectShapeField,
  CPromiseChainWrapper,
  CRuntimeArrowCallbackWrapper
} from './types.ts'
import { emitCType, isManagedRuntimeReturnType, isOpaqueRuntimeValueType, isRuntimeNullableType } from './value-types.ts'
import type { ArrayLoweringDependencies } from './values/arrays.ts'
import type { ClassLoweringDependencies } from './values/classes.ts'
import { collectClassMethods, createClassInfos } from './values/classes.ts'
import type { CollectionLoweringDependencies } from './values/collections.ts'
import type { NullableLoweringDependencies } from './values/nullable.ts'
import type { StatementLoweringDependencies } from './values/statements.ts'
import type { StringLoweringDependencies } from './values/strings.ts'

export type CUnitDependencies = {
  arrayLoweringDependencies: ArrayLoweringDependencies
  asyncTaskLoweringDependencies: AsyncTaskLoweringDependencies
  callbackLoweringDependencies: CallbackLoweringDependencies
  classLoweringDependencies: ClassLoweringDependencies
  collectExternalEventLoopFunctions: (functions: AnyNode[]) => Set<string>
  collectionLoweringDependencies: CollectionLoweringDependencies
  createBaseContext(
    diagnostics: Diagnostic[],
    functionDeclarations: IrFunctionDeclaration[],
    functionEffects: IrFunctionEffect[],
    jsGlobalRoots: Set<string>,
    topLevelNodes: AnyNode[]
  ): CEmitContext
  dgramLoweringDependencies: DgramLoweringDependencies
  emitClassMethodDeclaration: (info: CClassInfo, method: AnyNode, baseContext: CEmitContext) => string[]
  emitClassMethodHead: (info: CClassInfo, method: AnyNode, context: CEmitContext) => string
  emitFunctionDeclaration: (statement: AnyNode, baseContext: CEmitContext) => string[]
  emitFunctionHead: (statement: AnyNode, context: CEmitContext) => string
  emitMainWrapper: (irPrograms: IrProgram[], baseContext: CEmitContext) => string[]
  httpLoweringDependencies: HttpLoweringDependencies
  netLoweringDependencies: NetLoweringDependencies
  nullableLoweringDependencies: NullableLoweringDependencies
  promiseChainLoweringDependencies: PromiseChainLoweringDependencies
  statementLoweringDependencies: StatementLoweringDependencies
  stringLoweringDependencies: StringLoweringDependencies
}

type CUnitFunctionNodeEntry = {
  node: AnyNode
}

type CUnitValueDeclaration = {
  functionType?: CFunctionType | null
  name: string
  symbolName: string
  valueType: string
}

function pushUnitLines(target: string[], lines: string[]): void {
  for (const line of lines) {
    target.push(line)
  }
}

function pushIndentedUnitLines(target: string[], lines: string[], indent: string): void {
  for (const line of lines) {
    target.push(`${indent}${line}`)
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

function cUnitFunctionEntryAt(values: CUnitFunctionNodeEntry[], index: number): CUnitFunctionNodeEntry {
  return values[index]
}

function collectUnitFunctionNodes(functionEntries: CUnitFunctionNodeEntry[]): AnyNode[] {
  const functions: AnyNode[] = []

  for (let index = 0; index < functionEntries.length; index = index + 1) {
    const entry = cUnitFunctionEntryAt(functionEntries, index)

    functions.push(entry.node)
  }

  return functions
}

function collectCUnitTopLevelNodes(programs: IrProgram[]): AnyNode[] {
  const nodes: AnyNode[] = []

  for (let programIndex = 0; programIndex < programs.length; programIndex = programIndex + 1) {
    const program = programs[programIndex]

    for (let nodeIndex = 0; nodeIndex < program.body.length; nodeIndex = nodeIndex + 1) {
      nodes.push(program.body[nodeIndex])
    }
  }

  return nodes
}

function hasCUnitRuntimeCallbackWrapper(baseContext: CEmitContext): boolean {
  for (const wrapper of baseContext.callbackWrappers.values()) {
    if (isRuntimeCallbackWrapper(wrapper)) {
      return true
    }
  }

  return false
}

function joinCUnitLines(lines: string[]): string {
  let output = ''

  for (const line of lines) {
    output = `${output}${line}\n`
  }

  return output
}

function unitRuntimeRequirementAt(values: IrRuntimeRequirement[], index: number): IrRuntimeRequirement {
  return values[index]
}

function unitNodeAt(values: AnyNode[], index: number): AnyNode {
  return values[index]
}

function unitStringAt(values: string[], index: number): string {
  return values[index]
}

function unitFunctionParamAt(values: CFunctionParam[], index: number): CFunctionParam {
  return values[index]
}

function unitValueDeclarationAt(values: CUnitValueDeclaration[], index: number): CUnitValueDeclaration {
  return values[index]
}

function unitObjectShapeFieldAt(values: CObjectShapeField[], index: number): CObjectShapeField {
  return values[index]
}

function collectCUnitValueDeclarations(programs: IrProgram[], context: CEmitContext): CUnitValueDeclaration[] {
  const values: CUnitValueDeclaration[] = []
  const statements = collectIrTopLevelNodesFromPrograms(programs, 'statement')

  for (let index = 0; index < statements.length; index = index + 1) {
    const item = unitNodeAt(statements, index)

    if (item.type !== 'VariableDeclaration') {
      continue
    }

    values.push({
      functionType: cUnitValueFunctionType(item),
      name: item.name,
      symbolName: emitCIdentifier(item.name),
      valueType: cUnitValueType(item, context)
    })
  }

  return values
}

function registerCUnitValueDeclarations(context: CEmitContext, values: CUnitValueDeclaration[]): void {
  for (let index = 0; index < values.length; index = index + 1) {
    const item = unitValueDeclarationAt(values, index)

    context.moduleValueNames.set(item.name, item.symbolName)
    context.moduleValueTypes.set(item.name, item.valueType)
  }
}

function emitCUnitValueDefinitions(lines: string[], values: CUnitValueDeclaration[]): void {
  if (values.length === 0) {
    return
  }

  for (let index = 0; index < values.length; index = index + 1) {
    const item = unitValueDeclarationAt(values, index)
    const functionPointerDefinition = cUnitFunctionPointerDefinition(item)

    if (functionPointerDefinition !== null && typeof functionPointerDefinition !== 'undefined') {
      lines.push(functionPointerDefinition)
      continue
    }

    const cType = cUnitValueCType(item.valueType)
    const initializer = cUnitValueGlobalInitializer(item.valueType)

    if (initializer === '') {
      lines.push(`static ${cType} ${item.symbolName};`)
    } else {
      lines.push(`static ${cType} ${item.symbolName} = ${initializer};`)
    }
  }

  lines.push('')
}

function cUnitFunctionPointerDefinition(item: CUnitValueDeclaration): string | null {
  if (item.valueType !== 'function') {
    return null
  }

  const functionType = item.functionType

  return `static ${emitFunctionPointerReturnType(functionType)} (*${item.symbolName})(${emitFunctionPointerParams(
    functionType,
    [],
    []
  )}) = 0;`
}

function emitCUnitValueFunctionFieldDefinitions(
  lines: string[],
  values: CUnitValueDeclaration[],
  context: CEmitContext
): void {
  let emitted = false

  for (let index = 0; index < values.length; index = index + 1) {
    const item = unitValueDeclarationAt(values, index)
    const fields = context.moduleObjectShapes.get(item.name)

    if (fields === null || typeof fields === 'undefined') {
      continue
    }

    if (emitCUnitObjectFunctionFieldDefinitions(lines, item.name, fields, cUnitObjectFunctionFieldSeenTypes())) {
      emitted = true
    }
  }

  if (emitted) {
    lines.push('')
  }
}

function cUnitObjectFunctionFieldSeenTypes(): string[] {
  return ['CFunctionContext']
}

function emitCUnitObjectFunctionFieldDefinitions(
  lines: string[],
  objectName: string,
  fields: CObjectShapeField[],
  seenTypes: string[]
): boolean {
  let emitted = false

  for (let index = 0; index < fields.length; index = index + 1) {
    const field = unitObjectShapeFieldAt(fields, index)

    if (field.valueType === 'function') {
      const name = emitCObjectFunctionFieldName(objectName, field.name)

      if (isPlainFunctionPointerType(field.functionType)) {
        lines.push(
          `static ${emitFunctionPointerReturnType(field.functionType)} (*${name})(${emitFunctionPointerParams(
            field.functionType,
            [],
            seenTypes
          )}) = 0;`
        )
        emitted = true
      } else if (isRuntimeFunctionType(field.functionType)) {
        lines.push(`static inox_value ${name};`)
        emitted = true
      }
    } else if (
      field.valueType === 'object' &&
      field.shape !== null &&
      typeof field.shape !== 'undefined' &&
      field.shape.fields !== null &&
      typeof field.shape.fields !== 'undefined'
    ) {
      if (
        field.declaredType !== null &&
        typeof field.declaredType !== 'undefined' &&
        seenTypes.includes(field.declaredType)
      ) {
        continue
      }

      let pushedType = false

      if (field.declaredType !== null && typeof field.declaredType !== 'undefined') {
        seenTypes.push(field.declaredType)
        pushedType = true
      }

      if (emitCUnitObjectFunctionFieldDefinitions(lines, `${objectName}_${field.name}`, field.shape.fields, seenTypes)) {
        emitted = true
      }

      if (pushedType) {
        seenTypes.pop()
      }
    }
  }

  return emitted
}

function cUnitValueType(node: AnyNode, context: CEmitContext): string {
  const valueType = node.valueType

  if (valueType === null || typeof valueType === 'undefined' || valueType === '') {
    return 'unknown'
  }

  if (valueType === 'function' && cUnitFunctionValueUsesRuntimeCallback(node, context)) {
    return 'unknown'
  }

  if (isUnionValueTypeName(valueType)) {
    return 'unknown'
  }

  if (node.nullable === true && isRuntimeNullableType(valueType)) {
    return 'unknown'
  }

  if (valueType === 'string' && isCUnitRuntimeStringInitializer(node.init)) {
    return 'unknown'
  }

  return valueType
}

function cUnitValueFunctionType(node: AnyNode): CFunctionType | null {
  if (node.functionType !== null && typeof node.functionType !== 'undefined') {
    return node.functionType
  }

  if (
    node.init !== null &&
    typeof node.init !== 'undefined' &&
    node.init.functionType !== null &&
    typeof node.init.functionType !== 'undefined'
  ) {
    return node.init.functionType
  }

  return null
}

function cUnitFunctionValueUsesRuntimeCallback(node: AnyNode, context: CEmitContext): boolean {
  if (cUnitValueIsGenericFunctionDeclaration(node)) {
    return true
  }

  if (node.init !== null && typeof node.init !== 'undefined' && node.init.type === 'ArrowFunctionExpression') {
    const wrapper = context.callbackArrowWrappers.get(node.init)

    return wrapper !== null && typeof wrapper !== 'undefined' && wrapper.kind === 'arrow'
  }

  return isNullableFunctionType(node.valueType, node.nullable) || isRuntimeFunctionType(node.functionType)
}

function cUnitValueIsGenericFunctionDeclaration(node: AnyNode): boolean {
  return (
    node.declaredType === 'Function' ||
    node.declaredType === 'function' ||
    node.inferredDeclaredType === 'Function' ||
    node.inferredDeclaredType === 'function'
  )
}

function isCUnitRuntimeStringInitializer(expression: AnyNode | null | undefined): boolean {
  if (expression === null || typeof expression === 'undefined') {
    return false
  }

  if (expression.type === 'AwaitExpression') {
    return true
  }

  if (
    expression.type === 'CallExpression' &&
    expression.fsRuntimeMethod !== null &&
    typeof expression.fsRuntimeMethod !== 'undefined'
  ) {
    return true
  }

  if (
    (expression.type === 'ConditionalExpression' || expression.type === 'BinaryExpression') &&
    expression.valueType === 'string'
  ) {
    return true
  }

  return expression.type === 'TemplateLiteral' && expression.raw.includes('${')
}

function isUnionValueTypeName(valueType: string): boolean {
  return valueType.startsWith('union<')
}

function cUnitValueCType(valueType: string): string {
  if (valueType === 'string') {
    return 'char*'
  }

  if (valueType === 'unknown') {
    return 'inox_value'
  }

  return emitCType(valueType)
}

function cUnitValueGlobalInitializer(valueType: string): string {
  if (valueType === 'string') {
    return '""'
  }

  if (valueType === 'unknown' || isManagedRuntimeReturnType(valueType) || isOpaqueRuntimeValueType(valueType)) {
    return ''
  }

  return '0'
}

function collectCUnitContextRuntimeTypes(context: CEmitContext): Set<string> {
  const types: Set<string> = new Set()

  for (const valueType of context.functionReturnTypes.values()) {
    addCUnitRuntimeType(types, valueType)
  }

  for (const valueType of context.moduleValueTypes.values()) {
    addCUnitRuntimeType(types, valueType)
  }

  for (const params of context.functionParams.values()) {
    for (let paramIndex = 0; paramIndex < params.length; paramIndex = paramIndex + 1) {
      const param = unitFunctionParamAt(params, paramIndex)

      collectCUnitFunctionParamRuntimeTypes(types, param, new Set())
    }
  }

  return types
}

function addCUnitRuntimeType(types: Set<string>, valueType: string): void {
  if (
    valueType === 'unknown' ||
    isManagedRuntimeReturnType(valueType) ||
    isOpaqueRuntimeValueType(valueType) ||
    valueType === 'promise'
  ) {
    types.add(valueType)
  }
}

function collectCUnitFunctionParamRuntimeTypes(
  types: Set<string>,
  param: CFunctionParam,
  seen: Set<CObjectShapeField[]>
): void {
  addCUnitRuntimeType(types, param.valueType)

  if (
    param.valueType === 'function' &&
    !isPlainFunctionPointerType(param.functionType) &&
    isRuntimeFunctionType(param.functionType)
  ) {
    types.add('function')
  }

  if (
    param.valueType === 'object' &&
    param.shape !== null &&
    typeof param.shape !== 'undefined' &&
    param.shape.fields !== null &&
    typeof param.shape.fields !== 'undefined'
  ) {
    collectCUnitObjectShapeRuntimeTypes(types, param.shape.fields, seen)
  }
}

function collectCUnitObjectShapeRuntimeTypes(
  types: Set<string>,
  fields: CObjectShapeField[],
  seen: Set<CObjectShapeField[]>
): void {
  if (seen.has(fields)) {
    return
  }

  seen.add(fields)

  for (let index = 0; index < fields.length; index = index + 1) {
    const field = unitObjectShapeFieldAt(fields, index)

    addCUnitRuntimeType(types, field.valueType)

    if (
      field.valueType === 'function' &&
      !isPlainFunctionPointerType(field.functionType) &&
      isRuntimeFunctionType(field.functionType)
    ) {
      types.add('function')
    }

    if (
      field.valueType === 'object' &&
      field.shape !== null &&
      typeof field.shape !== 'undefined' &&
      field.shape.fields !== null &&
      typeof field.shape.fields !== 'undefined'
    ) {
      collectCUnitObjectShapeRuntimeTypes(types, field.shape.fields, seen)
    }
  }

  seen.delete(fields)
}

function emitCUnitFunctionPointerAdapterDefinitions(lines: string[], context: CEmitContext): void {
  if (context.functionPointerAdapters.length === 0) {
    return
  }

  for (const adapter of context.functionPointerAdapters) {
    pushUnitLines(lines, emitCUnitFunctionPointerAdapterDefinition(adapter, context))
    lines.push('')
  }
}

function emitCUnitFunctionPointerAdapterDefinition(
  adapter: CFunctionPointerAdapter,
  context: CEmitContext
): string[] {
  const lines = [`${emitCUnitFunctionPointerAdapterHead(adapter)} {`]
  const defaultLines: string[] = []
  const cleanupLines: string[] = []
  const expectedNames = collectFunctionPointerParamNames(adapter.functionType, adapter.seenTypes)
  const targetNames = collectFunctionPointerParamNames(adapter.targetFunctionType, adapter.targetSeenTypes)
  const expectedNameSet = stringSetFromArray(expectedNames)
  const targetNameSet = stringSetFromArray(targetNames)
  const targetArgs = emitCUnitFunctionPointerAdapterTargetArgs(
    adapter,
    expectedNameSet,
    targetNames,
    emitFunctionPointerReturnType(adapter.functionType),
    defaultLines,
    cleanupLines
  )

  for (const name of expectedNames) {
    if (!targetNameSet.has(name)) {
      lines.push(`  (void)${name};`)
    }
  }

  pushUnitLines(lines, defaultLines)

  if (isThrowingCUnitFunctionPointerAdapterTarget(adapter, context)) {
    pushUnitLines(lines, emitCUnitThrowingFunctionPointerAdapterTargetCall(adapter, targetArgs, cleanupLines))
    lines.push('}')

    return lines
  }

  const call = `${adapter.target}(${joinStrings(targetArgs, ', ')})`
  const adapterReturnType = emitFunctionPointerReturnType(adapter.functionType)

  if (adapterReturnType === 'void') {
    lines.push(`  ${call};`)
    pushUnitLines(lines, cleanupLines)
  } else {
    lines.push(`  ${adapterReturnType} inox_adapter_result = ${call};`)
    pushUnitLines(lines, cleanupLines)
    lines.push('  return inox_adapter_result;')
  }

  lines.push('}')

  return lines
}

function emitCUnitFunctionPointerAdapterTargetArgs(
  adapter: CFunctionPointerAdapter,
  expectedNameSet: Set<string>,
  targetNames: string[],
  adapterReturnType: string,
  defaultLines: string[],
  cleanupLines: string[]
): string[] {
  const args: string[] = []

  for (const name of targetNames) {
    if (expectedNameSet.has(name)) {
      args.push(name)
      continue
    }

    const defaultArg = emitCUnitFunctionPointerAdapterDefaultTargetArg(
      name,
      adapter,
      adapterReturnType,
      defaultLines,
      cleanupLines
    )

    if (defaultArg !== null && typeof defaultArg !== 'undefined') {
      args.push(defaultArg)
      continue
    }

    args.push(name)
  }

  return args
}

function emitCUnitFunctionPointerAdapterDefaultTargetArg(
  name: string,
  adapter: CFunctionPointerAdapter,
  adapterReturnType: string,
  defaultLines: string[],
  cleanupLines: string[]
): string | null {
  for (
    let index = adapter.functionType.params.length;
    index < adapter.targetFunctionType.params.length;
    index = index + 1
  ) {
    if (name !== `inox_arg_${index}`) {
      continue
    }

    const param = unitFunctionParamAt(adapter.targetFunctionType.params, index)

    if (param.optional !== true && (param.defaultValue === null || typeof param.defaultValue === 'undefined')) {
      return null
    }

    return emitCUnitFunctionPointerAdapterDefaultParamValue(param, adapterReturnType, defaultLines, cleanupLines)
  }

  return null
}

function emitCUnitFunctionPointerAdapterDefaultParamValue(
  param: CFunctionParam,
  adapterReturnType: string,
  defaultLines: string[],
  cleanupLines: string[]
): string {
  const value = param.defaultValue

  if (value !== null && typeof value !== 'undefined') {
    if (value.type === 'ArrayLiteral' && value.elements.length === 0 && param.valueType === 'array') {
      const name = `inox_adapter_default_${defaultLines.length}`

      defaultLines.push(`  inox_value ${name} = inox_undefined_value();`)
      defaultLines.push(`  if (inox_array_new(&inox_default_allocator, 0, &${name}) != INOX_OK) {`)
      defaultLines.push(`    return ${cUnitFunctionPointerAdapterDefaultReturnValue(adapterReturnType)};`)
      defaultLines.push('  }')
      cleanupLines.push(`  inox_release(${name});`)

      return name
    }

    if (value.type === 'NullLiteral') {
      return 'inox_null_value()'
    }

    if (value.type === 'BooleanLiteral') {
      if (value.value === true) {
        return '1'
      }

      return '0'
    }

    if (value.type === 'NumberLiteral') {
      return `${value.value}`
    }
  }

  if (
    param.nullable === true ||
    param.valueType === 'unknown' ||
    isManagedRuntimeReturnType(param.valueType) ||
    isOpaqueRuntimeValueType(param.valueType)
  ) {
    return 'inox_undefined_value()'
  }

  return '0'
}

function isThrowingCUnitFunctionPointerAdapterTarget(
  adapter: CFunctionPointerAdapter,
  context: CEmitContext
): boolean {
  const sourceName = cUnitFunctionPointerAdapterTargetSourceName(adapter, context)

  return sourceName !== null && typeof sourceName !== 'undefined' && context.throwingFunctions.has(sourceName)
}

function cUnitFunctionPointerAdapterTargetSourceName(
  adapter: CFunctionPointerAdapter,
  context: CEmitContext
): string | null {
  for (const name of context.functionNames.keys()) {
    const target = context.functionNames.get(name)

    if (target === adapter.target) {
      return name
    }
  }

  return null
}

function emitCUnitThrowingFunctionPointerAdapterTargetCall(
  adapter: CFunctionPointerAdapter,
  targetArgs: string[],
  cleanupLines: string[]
): string[] {
  const lines: string[] = []
  const callArgs: string[] = []
  const adapterReturnType = emitFunctionPointerReturnType(adapter.functionType)
  const returnType = emitFunctionPointerReturnType(adapter.targetFunctionType)

  for (const arg of targetArgs) {
    callArgs.push(arg)
  }

  if (returnType !== 'void') {
    lines.push(`  ${returnType} inox_adapter_result = ${cUnitFunctionPointerAdapterDefaultReturnValue(returnType)};`)
    callArgs.push('&inox_adapter_result')
  }

  lines.push('  inox_value inox_adapter_error = inox_undefined_value();')
  callArgs.push('&inox_adapter_error')
  lines.push(`  inox_status inox_adapter_status = ${adapter.target}(${joinStrings(callArgs, ', ')});`)
  lines.push('  if (inox_adapter_status != INOX_OK) {')
  lines.push('    inox_release(inox_adapter_error);')
  pushIndentedUnitLines(lines, cleanupLines, '  ')

  if (adapterReturnType === 'void') {
    lines.push('    return;')
  } else {
    lines.push(
      `    return ${cUnitThrowingFunctionPointerAdapterReturnExpression(adapterReturnType, returnType)};`
    )
  }

  lines.push('  }')
  lines.push('  inox_release(inox_adapter_error);')
  pushUnitLines(lines, cleanupLines)

  if (adapterReturnType !== 'void') {
    lines.push(`  return ${cUnitThrowingFunctionPointerAdapterReturnExpression(adapterReturnType, returnType)};`)
  }

  return lines
}

function cUnitThrowingFunctionPointerAdapterReturnExpression(adapterReturnType: string, targetReturnType: string): string {
  if (targetReturnType !== 'void') {
    return 'inox_adapter_result'
  }

  return cUnitFunctionPointerAdapterDefaultReturnValue(adapterReturnType)
}

function cUnitFunctionPointerAdapterDefaultReturnValue(returnType: string): string {
  if (returnType === 'inox_value') {
    return 'inox_undefined_value()'
  }

  if (returnType.includes('*')) {
    return '0'
  }

  return '0'
}

function emitCUnitFunctionPointerAdapterHead(adapter: CFunctionPointerAdapter): string {
  return `static ${emitFunctionPointerReturnType(adapter.functionType)} ${adapter.name}(${emitFunctionPointerNamedParams(
    adapter.functionType,
    adapter.seenTypes
  )})`
}

function pushCUnitClassMethodFunctionDeclarations(target: IrFunctionDeclaration[], classes: AnyNode[]): void {
  for (let classIndex = 0; classIndex < classes.length; classIndex = classIndex + 1) {
    const classNode = unitNodeAt(classes, classIndex)
    const methods: AnyNode[] = classNode.methods

    for (let methodIndex = 0; methodIndex < methods.length; methodIndex = methodIndex + 1) {
      const method = unitNodeAt(methods, methodIndex)

      if (method.name === 'constructor') {
        continue
      }

      const methodEffectName = irClassMethodEffectName(classNode.name, method.name)
      const methodReturnType = unitNodeReturnType(method)
      const declaration: IrFunctionDeclaration = {
        name: methodEffectName,
        exported: false,
        async: method.async === true,
        params: method.params,
        returnType: methodReturnType,
        returnNullable: method.returnNullable === true,
        returnArrayElementType: method.returnArrayElementType,
        returnArrayElementDeclaredType: method.returnArrayElementDeclaredType,
        returnMapKeyType: method.returnMapKeyType,
        returnMapValueType: method.returnMapValueType,
        returnPromiseValueType: method.returnPromiseValueType,
        returnSetElementType: method.returnSetElementType,
        returnShape: method.returnShape,
        loc: method.loc
      }

      target.push(declaration)
    }
  }
}

function unitNodeReturnType(node: AnyNode): string {
  if (node.returnType !== null && typeof node.returnType !== 'undefined') {
    return node.returnType
  }

  return 'unknown'
}

function runtimeRequirementSetFromArray(values: IrRuntimeRequirement[]): Set<IrRuntimeRequirement> {
  const result: Set<IrRuntimeRequirement> = new Set()

  for (let index = 0; index < values.length; index = index + 1) {
    result.add(unitRuntimeRequirementAt(values, index))
  }

  return result
}

function stringSetFromArray(values: string[]): Set<string> {
  const result: Set<string> = new Set()

  for (let index = 0; index < values.length; index = index + 1) {
    result.add(unitStringAt(values, index))
  }

  return result
}

export function emitCUnit(
  irPrograms: IrProgram[],
  options: CEmitOptions,
  entryIrPrograms: IrProgram[],
  deps: CUnitDependencies
): string {
  const diagnostics: Diagnostic[] = []
  const functionEntries = collectIrFunctionNodeEntries(irPrograms)
  const functions = collectUnitFunctionNodes(functionEntries)
  const functionDeclarations = collectIrFunctionDeclarations(irPrograms)
  const globalUsages = collectIrGlobalUsages(irPrograms)
  const globalRoots = collectIrGlobalRoots(irPrograms)
  const runtimeRequirements = runtimeRequirementSetFromArray(collectIrRuntimeRequirements(irPrograms))
  const syntaxFeatures = collectIrSyntaxFeatureUsages(irPrograms)
  const classes = collectIrTopLevelNodesFromPrograms(irPrograms, 'class')
  pushCUnitClassMethodFunctionDeclarations(functionDeclarations, classes)
  const externalFunctionEffects: IrFunctionEffect[] = []
  const inferredFunctionEffects = collectIrFunctionEffectsWithExternalEffects(irPrograms, externalFunctionEffects, true)
  const storedFunctionEffects = collectIrStoredFunctionEffects(irPrograms)
  const functionEffects = mergeIrFunctionEffects(inferredFunctionEffects, storedFunctionEffects)
  const topLevelNodes = collectCUnitTopLevelNodes(irPrograms)
  const jsGlobalRoots = stringSetFromArray(globalRoots)
  const baseContext = deps.createBaseContext(
    diagnostics,
    functionDeclarations,
    functionEffects,
    jsGlobalRoots,
    topLevelNodes
  )
  const valueDeclarations = collectCUnitValueDeclarations(irPrograms, baseContext)
  registerCUnitValueDeclarations(baseContext, valueDeclarations)
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
  baseContext.netConnectNames = collectRuntimeImportNames(
    irPrograms,
    new Set(['net', 'node:net']),
    new Set(['connect', 'createConnection'])
  )
  baseContext.classInfos = createClassInfos(classes, diagnostics)
  baseContext.externalEventLoopFunctions = deps.collectExternalEventLoopFunctions(functions)
  baseContext.callbackWrappers = collectCallbackWrappers(irPrograms, baseContext, deps.callbackLoweringDependencies)
  baseContext.promiseChainWrappers = collectPromiseChainWrappers(
    irPrograms,
    baseContext,
    deps.promiseChainLoweringDependencies
  )
  baseContext.asyncTaskWrappers = collectAsyncTaskWrappers(
    functionEntries,
    baseContext,
    deps.asyncTaskLoweringDependencies
  )
  baseContext.dgramMessageHandlers = collectDgramMessageHandlers(irPrograms, baseContext)
  baseContext.httpHandlers = collectHttpHandlers(irPrograms, baseContext)
  baseContext.netHandlers = collectNetHandlers(irPrograms, baseContext)
  const classMethods = collectClassMethods(baseContext)
  const signatureRuntimeTypes = collectCUnitContextRuntimeTypes(baseContext)
  const preludeRequirements = resolveCRuntimePreludeRequirements({
    classInfoCount: baseContext.classInfos.size,
    cryptoContext: baseContext,
    globalUsages,
    hasRuntimeCallbackWrapper: hasCUnitRuntimeCallbackWrapper(baseContext),
    irPrograms,
    runtimeRequirements,
    signatureRuntimeTypes,
    throwingFunctionCount: baseContext.throwingFunctions.size
  })
  const needsRuntime: boolean = preludeRequirements.needsRuntime
  const needsTimeRuntime: boolean = preludeRequirements.needsTimeRuntime
  const needsMathRuntime: boolean = preludeRequirements.needsMathRuntime
  const needsCryptoRuntime: boolean = preludeRequirements.needsCryptoRuntime
  const needsDebugMemoryRuntime: boolean = preludeRequirements.needsDebugMemoryRuntime
  const needsAsyncRuntime: boolean = preludeRequirements.needsAsyncRuntime
  const needsCallbackRuntime: boolean = preludeRequirements.needsCallbackRuntime
  const needsStringHeader: boolean = preludeRequirements.needsStringHeader
  const needsCollectionRuntime: boolean = preludeRequirements.needsCollectionRuntime
  const needsBinaryRuntime: boolean = preludeRequirements.needsBinaryRuntime
  const needsObjectRuntime: boolean = preludeRequirements.needsObjectRuntime
  const needsChildProcessRuntime: boolean = preludeRequirements.needsChildProcessRuntime
  const needsFsRuntime: boolean = preludeRequirements.needsFsRuntime
  const needsOsRuntime: boolean = preludeRequirements.needsOsRuntime
  const needsPathRuntime: boolean = preludeRequirements.needsPathRuntime
  const needsUrlRuntime: boolean = preludeRequirements.needsUrlRuntime
  const needsProcessRuntime: boolean = preludeRequirements.needsProcessRuntime
  const needsJsonRuntime: boolean = preludeRequirements.needsJsonRuntime
  const needsTimerRuntime: boolean = preludeRequirements.needsTimerRuntime
  const needsConsoleRuntime: boolean = preludeRequirements.needsConsoleRuntime
  const needsDgramRuntime: boolean = preludeRequirements.needsDgramRuntime
  const needsFetchRuntime: boolean = preludeRequirements.needsFetchRuntime
  const needsHttpRuntime: boolean = preludeRequirements.needsHttpRuntime
  const needsNetRuntime: boolean = preludeRequirements.needsNetRuntime
  baseContext.processRuntime = needsProcessRuntime
  if (needsAsyncRuntime) {
    baseContext.unhandledRejectionFlag = 'inox_unhandled_rejection'
  } else {
    baseContext.unhandledRejectionFlag = null
  }
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
  emitCUnitValueDefinitions(lines, valueDeclarations)
  emitCUnitValueFunctionFieldDefinitions(lines, valueDeclarations, baseContext)
  const arrowCallbackWrappers: CRuntimeArrowCallbackWrapper[] = []
  const promiseChainCallbackWrappers: CPromiseChainWrapper[] = []
  const callbackWrappers: CCallbackWrapperMap = baseContext.callbackWrappers
  const promiseChainWrappers: CPromiseChainWrapperMap = baseContext.promiseChainWrappers
  const asyncTaskWrappers: CAsyncTaskWrapperMap = baseContext.asyncTaskWrappers
  const dgramMessageHandlers: CDgramMessageHandlerMap = baseContext.dgramMessageHandlers
  const httpHandlers: CHttpHandlerMap = baseContext.httpHandlers
  const netHandlers: CNetHandlerMap = baseContext.netHandlers

  if (callbackWrappers.size > 0) {
    for (const wrapper of callbackWrappers.values()) {
      if (wrapper.kind === 'arrow' && isRuntimeArrowCallbackWrapperWithContext(wrapper)) {
        arrowCallbackWrappers.push(wrapper)
      }
    }
  }

  if (promiseChainWrappers.size > 0) {
    for (const wrapper of promiseChainWrappers.values()) {
      if (isPromiseChainCallbackWrapperWithContext(wrapper)) {
        promiseChainCallbackWrappers.push(wrapper)
      }
    }
  }

  if (asyncTaskWrappers.size > 0) {
    for (const wrapper of asyncTaskWrappers.values()) {
      pushUnitLines(lines, emitAsyncTaskFrameType(wrapper))
      lines.push('')
    }
  }

  for (const wrapper of arrowCallbackWrappers) {
    pushUnitLines(lines, emitRuntimeArrowCallbackContextType(wrapper))
    lines.push('')
  }

  for (const wrapper of promiseChainCallbackWrappers) {
    pushUnitLines(lines, emitRuntimeArrowCallbackContextType(wrapper))
    lines.push('')
  }

  if (baseContext.unhandledRejectionFlag !== null && typeof baseContext.unhandledRejectionFlag !== 'undefined') {
    lines.push(`static int ${baseContext.unhandledRejectionFlag} = 0;`)
    lines.push('')
  }

  for (const item of functions) {
    lines.push(`${deps.emitFunctionHead(item, baseContext)};`)
  }

  for (const classMethod of classMethods) {
    lines.push(`${deps.emitClassMethodHead(classMethod.info, classMethod.method, baseContext)};`)
  }

  if (asyncTaskWrappers.size > 0) {
    for (const wrapper of asyncTaskWrappers.values()) {
      pushUnitLines(lines, emitAsyncTaskWrapperPrototypes(wrapper))
    }
  }

  if (callbackWrappers.size > 0) {
    for (const wrapper of callbackWrappers.values()) {
      if (wrapper.kind === 'plain-arrow') {
        lines.push(emitPlainArrowCallbackWrapperHead(wrapper) + ';')
        continue
      }

      if (wrapper.kind === 'arrow' && isRuntimeArrowCallbackWrapperWithContext(wrapper)) {
        lines.push(emitCallbackFinalizerPrototype(callbackContextWrapperFinalizerName(wrapper)))
      }

      const runtimeHead = emitRuntimeCallbackWrapperHead(wrapper)
      lines.push(runtimeHead + ';')
    }
  }

  if (promiseChainWrappers.size > 0) {
    for (const wrapper of promiseChainWrappers.values()) {
      if (isPromiseChainCallbackWrapperWithContext(wrapper)) {
        lines.push(emitCallbackFinalizerPrototype(callbackContextWrapperFinalizerName(wrapper)))
      }

      lines.push(emitPromiseChainCallbackWrapperHead(wrapper) + ';')
    }
  }

  if (dgramMessageHandlers.size > 0) {
    for (const wrapper of dgramMessageHandlers.values()) {
      lines.push(`${emitDgramMessageHandlerHead(wrapper)};`)
    }
  }

  if (httpHandlers.size > 0) {
    for (const wrapper of httpHandlers.values()) {
      lines.push(`${emitHttpHandlerHead(wrapper)};`)
    }
  }

  if (netHandlers.size > 0) {
    for (const wrapper of netHandlers.values()) {
      lines.push(`${emitNetHandlerHead(wrapper)};`)
    }
  }

  if (
    functions.length > 0 ||
    classMethods.length > 0 ||
    asyncTaskWrappers.size > 0 ||
    callbackWrappers.size > 0 ||
    promiseChainWrappers.size > 0 ||
    dgramMessageHandlers.size > 0 ||
    httpHandlers.size > 0 ||
    netHandlers.size > 0
  ) {
    lines.push('')
  }

  if (asyncTaskWrappers.size > 0) {
    for (const wrapper of asyncTaskWrappers.values()) {
      pushUnitLines(lines, emitAsyncTaskWrapperDeclaration(wrapper, baseContext, deps.asyncTaskLoweringDependencies))
      lines.push('')
    }
  }

  if (callbackWrappers.size > 0) {
    for (const wrapper of callbackWrappers.values()) {
      if (wrapper.kind === 'plain-arrow') {
        pushUnitLines(
          lines,
          emitPlainArrowCallbackWrapperDeclaration(wrapper, baseContext, deps.callbackLoweringDependencies)
        )
      } else {
        pushUnitLines(
          lines,
          emitRuntimeCallbackWrapperDeclaration(wrapper, baseContext, deps.callbackLoweringDependencies)
        )
      }

      lines.push('')
    }
  }

  if (promiseChainWrappers.size > 0) {
    for (const wrapper of promiseChainWrappers.values()) {
      pushUnitLines(
        lines,
        emitPromiseChainCallbackWrapperDeclaration(wrapper, baseContext, deps.promiseChainLoweringDependencies)
      )
      lines.push('')
    }
  }

  if (dgramMessageHandlers.size > 0) {
    for (const wrapper of dgramMessageHandlers.values()) {
      pushUnitLines(lines, emitDgramMessageHandlerDeclaration(wrapper, baseContext, deps.dgramLoweringDependencies))
      lines.push('')
    }
  }

  if (httpHandlers.size > 0) {
    for (const wrapper of httpHandlers.values()) {
      pushUnitLines(lines, emitHttpHandlerDeclaration(wrapper, baseContext, deps.httpLoweringDependencies))
      lines.push('')
    }
  }

  if (netHandlers.size > 0) {
    for (const wrapper of netHandlers.values()) {
      pushUnitLines(lines, emitNetHandlerDeclaration(wrapper, baseContext, deps.netLoweringDependencies))
      lines.push('')
    }
  }

  for (const item of functions) {
    pushUnitLines(lines, deps.emitFunctionDeclaration(item, baseContext))
    lines.push('')
  }

  for (const classMethod of classMethods) {
    pushUnitLines(lines, deps.emitClassMethodDeclaration(classMethod.info, classMethod.method, baseContext))
    lines.push('')
  }

  const mainLines = deps.emitMainWrapper(entryIrPrograms, baseContext)

  emitCUnitFunctionPointerAdapterDefinitions(lines, baseContext)
  pushUnitLines(lines, mainLines)

  throwDiagnostics(diagnostics)

  const code = joinCUnitLines(lines)

  return code
}

function emitCallbackFinalizerPrototype(finalizerName: string): string {
  return 'static void ' + finalizerName + '(void* context);'
}
