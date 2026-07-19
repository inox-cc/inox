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
import type { CallbackLoweringDependencies, FunctionPointerParamInfo } from './async/callbacks.ts'
import {
  callbackContextWrapperFinalizerName,
  collectCallbackWrappers,
  collectFunctionPointerParamInfos,
  collectFunctionPointerParamNames,
  emitFunctionPointerNativeBoundaryArgument,
  emitFunctionPointerParams,
  emitFunctionPointerNamedParams,
  emitFunctionPointerReturnType,
  emitFunctionPointerRuntimeAdapterDefinition,
  emitPlainArrowCallbackWrapperDeclaration,
  emitPlainArrowCallbackWrapperHead,
  emitRuntimeArrowCallbackContextType,
  emitRuntimeCallbackWrapperDeclaration,
  emitRuntimeCallbackWrapperHead,
  isNullableFunctionType,
  isPlainObjectFunctionField,
  isPlainFunctionPointerType,
  isPromiseChainCallbackWrapperWithContext,
  isRuntimeFunctionType,
  isRuntimeArrowCallbackWrapperWithContext,
  isRuntimeCallbackWrapper,
  registerFunctionPointerRuntimeAdapter
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
  CEmitContextWithDependencies,
  CPromiseChainWrapperMap
} from './context.ts'
import { reportUnsupportedCGlobalUsages, reportUnsupportedCSyntaxFeatures } from './diagnostics.ts'
import type { CDeclarationEmissionDependencies } from './declarations.ts'
import { emitCIdentifier, emitCObjectFunctionFieldName } from './identifiers.ts'
import { emitCompilerLibraryRuntimeInitializerDefinitions } from './library-initializers.ts'
import { emitCPrelude, filterUnusedCPreludeIncludes } from './prelude.ts'
import { collectCReferencedFunctionPrototypeNames } from './prototype-references.ts'
import { resolveCRuntimePreludeRequirements } from './runtime-plan.ts'
import {
  cObjectShapeFromMetadata,
  cTypeRefMapValue
} from './types.ts'
import type {
  CClassInfo,
  CClassMethod,
  CCompilerLibrarySet,
  CEmitOptions,
  CFunctionType,
  CFunctionPointerAdapter,
  CFunctionParam,
  CObjectShapeField,
  CPromiseChainWrapper,
  CRuntimeArrowCallbackWrapper
} from './types.ts'
import {
  compilerLibraryIntrinsicResultCShape,
  compilerLibraryIntrinsicNativeCppType,
  emitCType,
  isManagedRuntimeReturnType,
  isOpaqueRuntimeValueType,
  isRuntimeNullableType,
  libraryCppValueStorageType,
  requireCompilerLibraryIntrinsicNativeCppType,
  resolveCCompilerLibrarySet
} from './value-types.ts'
import type { ArrayLoweringDependencies } from './values/arrays.ts'
import type { CClassMethodPrototypeMap, ClassLoweringDependencies } from './values/classes.ts'
import {
  cClassNameFromValueType,
  cClassValueTypeName,
  classInfosUseCppValueRuntime,
  collectCClassDescriptorNames,
  collectClassMethods,
  createClassInfos,
  emitCClassDescriptorDeclarationsForNames,
  emitCClassTypeName,
  emitCNativeClassDeclarations
} from './values/classes.ts'
import type { NullableLoweringDependencies } from './values/nullable.ts'
import type { StatementLoweringDependencies } from './values/statements.ts'
import type { StringLoweringDependencies } from './values/strings.ts'

type CEmitContext = CEmitContextWithDependencies<
  ArrayLoweringDependencies,
  AsyncTaskLoweringDependencies,
  ClassLoweringDependencies,
  NullableLoweringDependencies,
  StatementLoweringDependencies,
  StringLoweringDependencies
>

export type CUnitDependencies = {
  arrayLoweringDependencies: ArrayLoweringDependencies
  asyncTaskLoweringDependencies: AsyncTaskLoweringDependencies
  callbackLoweringDependencies: CallbackLoweringDependencies
  classLoweringDependencies: ClassLoweringDependencies
  collectExternalEventLoopFunctions: (functions: AnyNode[], seedNames?: Set<string>) => Set<string>
  declarationEmissionDependencies: CDeclarationEmissionDependencies
  createBaseContext(
    diagnostics: Diagnostic[],
    functionDeclarations: IrFunctionDeclaration[],
    functionEffects: IrFunctionEffect[],
    jsGlobalRoots: Set<string>,
    topLevelNodes: AnyNode[],
    libraries?: CCompilerLibrarySet
  ): CEmitContext
  emitClassConstructorDeclaration(
    info: CClassInfo,
    baseContext: CEmitContext,
    dependencies: CDeclarationEmissionDependencies
  ): string[]
  emitClassMethodDeclaration(
    info: CClassInfo,
    method: AnyNode,
    baseContext: CEmitContext,
    dependencies: CDeclarationEmissionDependencies
  ): string[]
  emitClassMethodHead: (info: CClassInfo, method: AnyNode, context: CEmitContext) => string
  emitClassMethodPrototype: (info: CClassInfo, method: AnyNode, context: CEmitContext) => string
  emitFunctionDeclaration(
    statement: AnyNode,
    baseContext: CEmitContext,
    dependencies: CDeclarationEmissionDependencies
  ): string[]
  emitFunctionHead: (statement: AnyNode, context: CEmitContext) => string
  emitMainWrapper(
    irPrograms: IrProgram[],
    baseContext: CEmitContext,
    dependencies: CDeclarationEmissionDependencies
  ): string[]
  nullableLoweringDependencies: NullableLoweringDependencies
  promiseChainLoweringDependencies: PromiseChainLoweringDependencies
  statementLoweringDependencies: StatementLoweringDependencies
  stringLoweringDependencies: StringLoweringDependencies
}

type CUnitFunctionNodeEntry = {
  node: AnyNode
}

type CUnitValueDeclaration = {
  cppType?: string | null
  declaredType?: string | null
  functionType?: CFunctionType | null
  name: string
  shapeBuiltin?: string | null
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

    const valueType = cUnitValueType(item, context)

    values.push({
      cppType: cUnitValueLibraryCppType(item),
      declaredType: item.declaredType ?? item.inferredDeclaredType ?? null,
      functionType: cUnitValueFunctionType(item),
      name: item.name,
      shapeBuiltin: cUnitValueShapeBuiltin(item),
      symbolName: emitCIdentifier(item.name),
      valueType
    })
  }

  return values
}

function registerCUnitValueDeclarations(context: CEmitContext, values: CUnitValueDeclaration[]): void {
  for (let index = 0; index < values.length; index = index + 1) {
    const item = unitValueDeclarationAt(values, index)
    context.moduleValueNames.set(item.name, item.symbolName)
    context.moduleValueTypes.set(item.name, item.valueType)

    if (cUnitValueDeclarationCType(item, context) === 'inox_value') {
      context.moduleRuntimeValueNames.add(item.name)
    }

    if (item.cppType !== null && typeof item.cppType !== 'undefined') {
      context.moduleValueCppTypes.set(item.name, item.cppType)
    }
  }
}

function cUnitValueLibraryCppType(node: AnyNode): string | null {
  const valueType = node.valueType ?? node.init?.valueType

  if (valueType === 'number' || valueType === 'boolean') {
    return null
  }

  const initCppType = node.libraryCppType ?? node.init?.libraryCppType

  if (typeof initCppType === 'string') {
    return initCppType
  }

  const shape = node.shape ?? node.init?.shape
  const nullable = node.nullable === true || node.init?.nullable === true

  return libraryCppValueStorageType(nullable, shape)
}

function registerCUnitSyntheticImportNames(context: CEmitContext, programs: IrProgram[]): void {
  for (let programIndex = 0; programIndex < programs.length; programIndex = programIndex + 1) {
    const nodes = programs[programIndex].body

    for (let nodeIndex = 0; nodeIndex < nodes.length; nodeIndex = nodeIndex + 1) {
      const node = unitNodeAt(nodes, nodeIndex)

      if (node.type !== 'ImportDeclaration') {
        continue
      }

      const specifiers = node.specifiers

      if (!Array.isArray(specifiers)) {
        continue
      }

      for (let specifierIndex = 0; specifierIndex < specifiers.length; specifierIndex = specifierIndex + 1) {
        const specifier = unitNodeAt(specifiers, specifierIndex)
        const syntheticName = specifier.syntheticValueImportName

        if (syntheticName === null || typeof syntheticName === 'undefined' || typeof specifier.imported !== 'string') {
          continue
        }

        context.moduleValueNames.set(syntheticName, emitCIdentifier(specifier.imported))

        const valueType = context.moduleValueTypes.get(specifier.imported)

        if (valueType !== null && typeof valueType !== 'undefined') {
          context.moduleValueTypes.set(syntheticName, valueType)
        }
      }
    }
  }
}

function emitCUnitValueDefinitions(
  lines: string[],
  values: CUnitValueDeclaration[],
  context: CEmitContext
): void {
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

    const cType = cUnitValueDeclarationCType(item, context)
    const initializer = cUnitValueDeclarationGlobalInitializer(item)

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

    if (
      emitCUnitObjectFunctionFieldDefinitions(
        lines,
        item.name,
        fields,
        cUnitObjectFunctionFieldSeenTypes(item.declaredType)
      )
    ) {
      emitted = true
    }
  }

  if (emitted) {
    lines.push('')
  }
}

function collectCUnitClassMethodPrototypes(context: CEmitContext, deps: CUnitDependencies): CClassMethodPrototypeMap {
  const prototypes: CClassMethodPrototypeMap = new Map()

  for (const classMethod of collectClassMethods(context)) {
    const foundItems = prototypes.get(classMethod.info.name)
    let items: string[] = []

    if (foundItems !== null && typeof foundItems !== 'undefined') {
      items = foundItems
    }

    items.push(deps.emitClassMethodPrototype(classMethod.info, classMethod.method, context))
    prototypes.set(classMethod.info.name, items)
  }

  return prototypes
}

function cUnitObjectFunctionFieldSeenTypes(declaredType: string | null | undefined): string[] {
  const seenTypes = ['CFunctionContext']

  if (declaredType !== null && typeof declaredType !== 'undefined' && !seenTypes.includes(declaredType)) {
    seenTypes.push(declaredType)
  }

  return seenTypes
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

      if (isPlainObjectFunctionField(field, seenTypes)) {
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

      if (
        emitCUnitObjectFunctionFieldDefinitions(lines, `${objectName}_${field.name}`, field.shape.fields, seenTypes)
      ) {
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
  const classValueType = cUnitNativeClassValueType(node, context)

  if (classValueType !== null && typeof classValueType !== 'undefined') {
    return classValueType
  }

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

  if (valueType === 'void' && node.init?.type === 'AwaitExpression') {
    return 'unknown'
  }

  return valueType
}

function cUnitValueShapeBuiltin(node: AnyNode): string | null {
  if (
    node.shape !== null &&
    typeof node.shape !== 'undefined' &&
    node.shape.builtin !== null &&
    typeof node.shape.builtin !== 'undefined'
  ) {
    return node.shape.builtin
  }

  if (
    node.init !== null &&
    typeof node.init !== 'undefined' &&
    node.init.shape !== null &&
    typeof node.init.shape !== 'undefined' &&
    node.init.shape.builtin !== null &&
    typeof node.init.shape.builtin !== 'undefined'
  ) {
    return node.init.shape.builtin
  }

  return null
}

function cUnitNativeClassValueType(node: AnyNode, context: CEmitContext): string | null {
  let className: string | null = null

  if (node.className !== null && typeof node.className !== 'undefined') {
    className = node.className
  } else if (
    node.init !== null &&
    typeof node.init !== 'undefined' &&
    node.init.className !== null &&
    typeof node.init.className !== 'undefined'
  ) {
    className = node.init.className
  }

  if (className === null || typeof className === 'undefined') {
    return null
  }

  const info = context.classInfos.get(className)

  if (info === null || typeof info === 'undefined' || !info.native) {
    return null
  }

  return cClassValueTypeName(className)
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

  if (expression.type === 'CallExpression' && expression.libraryCppType === 'inox::String') {
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

function cUnitValueCType(valueType: string, context: CEmitContext): string {
  const className = cClassNameFromValueType(valueType)

  if (className !== null && typeof className !== 'undefined') {
    return emitCClassTypeName(className)
  }

  if (valueType === 'string') {
    return 'char*'
  }

  if (valueType === 'unknown') {
    return 'inox_value'
  }

  if (valueType === 'promise') {
    return requireCompilerLibraryIntrinsicNativeCppType(context.libraries, 'async-result')
  }

  return emitCType(valueType)
}

function cUnitValueDeclarationCType(item: CUnitValueDeclaration, context: CEmitContext): string {
  if (item.cppType !== null && typeof item.cppType !== 'undefined') {
    return item.cppType
  }

  return cUnitValueCType(item.valueType, context)
}

function cUnitValueGlobalInitializer(valueType: string): string {
  if (cClassNameFromValueType(valueType) !== null) {
    return ''
  }

  if (valueType === 'string') {
    return '""'
  }

  if (valueType === 'promise') {
    return ''
  }

  if (valueType === 'unknown' || isManagedRuntimeReturnType(valueType) || isOpaqueRuntimeValueType(valueType)) {
    return ''
  }

  return '0'
}

function cUnitValueDeclarationGlobalInitializer(item: CUnitValueDeclaration): string {
  if (item.cppType !== null && typeof item.cppType !== 'undefined') {
    return ''
  }

  return cUnitValueGlobalInitializer(item.valueType)
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
      !isPlainObjectFunctionField(field) &&
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

function emitCUnitFunctionPointerAdapterDefinition(adapter: CFunctionPointerAdapter, context: CEmitContext): string[] {
  const lines = [`${emitCUnitFunctionPointerAdapterHead(adapter)} {`]
  const defaultLines: string[] = []
  const cleanupLines: string[] = []
  const expectedNames = collectFunctionPointerParamNames(adapter.functionType, adapter.seenTypes)
  const expectedInfos = collectFunctionPointerParamInfos(adapter.functionType, adapter.seenTypes)
  const targetFunctionType = cUnitFunctionPointerAdapterTargetFunctionType(adapter, context)
  const targetSeenTypes = cUnitFunctionPointerAdapterTargetSeenTypes(adapter, context)
  const targetNames = collectFunctionPointerParamNames(targetFunctionType, targetSeenTypes)
  const targetInfos = collectFunctionPointerParamInfos(targetFunctionType, targetSeenTypes)
  const expectedNameSet = stringSetFromArray(expectedNames)
  const targetNameSet = stringSetFromArray(targetNames)
  const targetArgs = emitCUnitFunctionPointerAdapterTargetArgs(
    adapter,
    expectedNameSet,
    targetNames,
    targetFunctionType,
    emitFunctionPointerReturnType(adapter.functionType),
    expectedInfos,
    targetInfos,
    context,
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
    pushUnitLines(
      lines,
      emitCUnitThrowingFunctionPointerAdapterTargetCall(adapter, targetArgs, targetFunctionType, cleanupLines)
    )
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
  targetFunctionType: CFunctionType | null | undefined,
  adapterReturnType: string,
  expectedInfos: FunctionPointerParamInfo[],
  targetInfos: FunctionPointerParamInfo[],
  context: CEmitContext,
  defaultLines: string[],
  cleanupLines: string[]
): string[] {
  const args: string[] = []

  for (const name of targetNames) {
    if (expectedNameSet.has(name)) {
      const value = emitCUnitFunctionPointerAdapterRuntimeBridgeArg(
        name,
        expectedInfos,
        targetInfos,
        adapterReturnType,
        context,
        defaultLines,
        cleanupLines
      )
      args.push(
        emitFunctionPointerNativeBoundaryArgument(
          name,
          value,
          adapter.functionType,
          targetFunctionType
        )
      )
      continue
    }

    const defaultArg = emitCUnitFunctionPointerAdapterDefaultTargetArg(
      name,
      adapter,
      targetFunctionType,
      adapterReturnType,
      context,
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

function emitCUnitFunctionPointerAdapterRuntimeBridgeArg(
  name: string,
  expectedInfos: FunctionPointerParamInfo[],
  targetInfos: FunctionPointerParamInfo[],
  adapterReturnType: string,
  context: CEmitContext,
  defaultLines: string[],
  cleanupLines: string[]
): string {
  const expectedInfo = cUnitFunctionPointerParamInfoForName(expectedInfos, name)
  const targetInfo = cUnitFunctionPointerParamInfoForName(targetInfos, name)

  if (!cUnitFunctionPointerParamNeedsRuntimeBridge(expectedInfo, targetInfo)) {
    return name
  }

  if (expectedInfo === null || expectedInfo.functionType === null) {
    return name
  }

  const runtimeAdapter = registerFunctionPointerRuntimeAdapter(
    expectedInfo.functionType,
    expectedInfo.seenTypes,
    context
  )
  const bridgeIndex = defaultLines.length
  const bridgeContext = `inox_adapter_callback_context_${bridgeIndex}`
  const bridgeValue = `inox_adapter_callback_${bridgeIndex}`
  const failureReturn =
    adapterReturnType === 'void'
      ? 'return;'
      : `return ${cUnitFunctionPointerAdapterDefaultReturnValue(adapterReturnType)};`

  defaultLines.push(
    `  ${runtimeAdapter.contextTypeName}* ${bridgeContext} = (${runtimeAdapter.contextTypeName}*)inox_default_alloc(0, sizeof(${runtimeAdapter.contextTypeName}), _Alignof(${runtimeAdapter.contextTypeName}));`
  )
  defaultLines.push(`  if (${bridgeContext} == 0) ${failureReturn}`)
  defaultLines.push(`  ${bridgeContext}->target = ${name};`)
  defaultLines.push(`  inox_value ${bridgeValue} = inox_undefined_value();`)
  defaultLines.push(
    `  if (inox_callback_new(&inox_default_allocator, ${runtimeAdapter.callbackName}, ${bridgeContext}, ${runtimeAdapter.finalizerName}, &${bridgeValue}) != INOX_OK) {`
  )
  defaultLines.push(`    ${runtimeAdapter.finalizerName}(${bridgeContext});`)
  defaultLines.push(`    ${failureReturn}`)
  defaultLines.push('  }')
  cleanupLines.push(`  inox_release(${bridgeValue});`)

  return bridgeValue
}

function cUnitFunctionPointerParamNeedsRuntimeBridge(
  expectedInfo: FunctionPointerParamInfo | null,
  targetInfo: FunctionPointerParamInfo | null
): boolean {
  return (
    expectedInfo !== null &&
    targetInfo !== null &&
    expectedInfo.functionType !== null &&
    !expectedInfo.runtimeFunction &&
    targetInfo.runtimeFunction
  )
}

function cUnitFunctionPointerParamInfoForName(
  infos: FunctionPointerParamInfo[],
  name: string
): FunctionPointerParamInfo | null {
  for (const info of infos) {
    if (info.name === name) {
      return info
    }
  }

  return null
}

function emitCUnitFunctionPointerAdapterDefaultTargetArg(
  name: string,
  adapter: CFunctionPointerAdapter,
  targetFunctionType: CFunctionType | null | undefined,
  adapterReturnType: string,
  context: CEmitContext,
  defaultLines: string[],
  cleanupLines: string[]
): string | null {
  if (targetFunctionType === null || typeof targetFunctionType === 'undefined') {
    return null
  }

  for (let index = adapter.functionType.params.length; index < targetFunctionType.params.length; index = index + 1) {
    if (name !== `inox_arg_${index}`) {
      continue
    }

    const param = unitFunctionParamAt(targetFunctionType.params, index)

    if (param.optional !== true && (param.defaultValue === null || typeof param.defaultValue === 'undefined')) {
      return null
    }

    return emitCUnitFunctionPointerAdapterDefaultParamValue(
      param,
      adapterReturnType,
      context,
      defaultLines,
      cleanupLines
    )
  }

  return null
}

function emitCUnitFunctionPointerAdapterDefaultParamValue(
  param: CFunctionParam,
  adapterReturnType: string,
  context: CEmitContext,
  defaultLines: string[],
  cleanupLines: string[]
): string {
  const value = param.defaultValue

  if (value !== null && typeof value !== 'undefined') {
    if (value.type === 'ArrayLiteral' && value.elements.length === 0 && param.valueType === 'array') {
      const name = `inox_adapter_default_${defaultLines.length}`
      const arrayName = `${name}_array`
      const cppType = compilerLibraryIntrinsicNativeCppType(context.libraries, 'array-literal') ?? 'inox::Value'

      defaultLines.push(`  auto ${arrayName} = ${cppType}::create(0);`)
      defaultLines.push('  if (inox::thrown()) {')
      defaultLines.push(`    return ${cUnitFunctionPointerAdapterDefaultReturnValue(adapterReturnType)};`)
      defaultLines.push('  }')
      defaultLines.push(`  inox_value ${name} = ${arrayName}.release();`)
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

function cUnitFunctionPointerAdapterTargetSeenTypes(adapter: CFunctionPointerAdapter, context: CEmitContext): string[] {
  if (isPlainArrowCUnitFunctionPointerAdapterTarget(adapter, context)) {
    return []
  }

  if (adapter.target.startsWith('inox_mod_')) {
    return []
  }

  return adapter.targetSeenTypes
}

function cUnitFunctionPointerAdapterTargetFunctionType(
  adapter: CFunctionPointerAdapter,
  context: CEmitContext
): CFunctionType | null | undefined {
  for (const wrapper of context.callbackWrappers.values()) {
    if (wrapper.kind === 'plain-arrow' && wrapper.name === adapter.target) {
      return wrapper.functionType
    }
  }

  for (const sourceName of cUnitFunctionPointerAdapterTargetSourceNames(adapter, context)) {
    const functionType = cUnitFunctionPointerAdapterContextFunctionType(sourceName, context)

    if (functionType !== null) {
      return functionType
    }
  }

  return adapter.targetFunctionType
}

function cUnitFunctionPointerAdapterContextFunctionType(name: string, context: CEmitContext): CFunctionType | null {
  const params = context.functionParams.get(name)
  const returnType = context.functionReturnTypes.get(name)

  if (params === null || typeof params === 'undefined' || returnType === null || typeof returnType === 'undefined') {
    return null
  }

  return {
    kind: 'function',
    params,
    returnTypeRef: cTypeRefMapValue(context.functionReturnTypeRefs, name),
    returnNullable: context.functionReturnNullables.get(name) === true,
    returnPromiseValueType: context.functionReturnPromiseValueTypes.get(name) ?? null,
    returnShape: context.functionReturnShapes.get(name) ?? null,
    returnType
  }
}

function isPlainArrowCUnitFunctionPointerAdapterTarget(
  adapter: CFunctionPointerAdapter,
  context: CEmitContext
): boolean {
  for (const wrapper of context.callbackWrappers.values()) {
    if (wrapper.kind === 'plain-arrow' && wrapper.name === adapter.target) {
      return true
    }
  }

  if (adapter.target.startsWith('inox_callback_arrow_')) {
    return true
  }

  return false
}

function isThrowingCUnitFunctionPointerAdapterTarget(adapter: CFunctionPointerAdapter, context: CEmitContext): boolean {
  for (const sourceName of cUnitFunctionPointerAdapterTargetSourceNames(adapter, context)) {
    if (context.throwingFunctions.has(sourceName)) {
      return true
    }
  }

  return false
}

function cUnitFunctionPointerAdapterTargetSourceNames(
  adapter: CFunctionPointerAdapter,
  context: CEmitContext
): string[] {
  const names: string[] = []

  for (const name of context.functionNames.keys()) {
    const target = context.functionNames.get(name)

    if (target === adapter.target) {
      names.push(name)
    }
  }

  return names
}

function emitCUnitThrowingFunctionPointerAdapterTargetCall(
  adapter: CFunctionPointerAdapter,
  targetArgs: string[],
  targetFunctionType: CFunctionType | null | undefined,
  cleanupLines: string[]
): string[] {
  const lines: string[] = []
  const callArgs: string[] = []
  const adapterReturnType = emitFunctionPointerReturnType(adapter.functionType)
  const returnType = emitFunctionPointerReturnType(targetFunctionType)

  for (const arg of targetArgs) {
    callArgs.push(arg)
  }

  if (returnType !== 'void') {
    lines.push(`  ${returnType} inox_adapter_result = ${cUnitFunctionPointerAdapterDefaultReturnValue(returnType)};`)
    callArgs.push('std::addressof(inox_adapter_result)')
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
    lines.push(`    return ${cUnitThrowingFunctionPointerAdapterReturnExpression(adapterReturnType, returnType)};`)
  }

  lines.push('  }')
  lines.push('  inox_release(inox_adapter_error);')
  pushUnitLines(lines, cleanupLines)

  if (adapterReturnType !== 'void') {
    lines.push(`  return ${cUnitThrowingFunctionPointerAdapterReturnExpression(adapterReturnType, returnType)};`)
  }

  return lines
}

function cUnitThrowingFunctionPointerAdapterReturnExpression(
  adapterReturnType: string,
  targetReturnType: string
): string {
  if (targetReturnType !== 'void') {
    return 'inox_adapter_result'
  }

  return cUnitFunctionPointerAdapterDefaultReturnValue(adapterReturnType)
}

function cUnitFunctionPointerAdapterDefaultReturnValue(returnType: string): string {
  if (returnType === 'inox_value') {
    return 'inox_undefined_value()'
  }

  return '{}'
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
        returnTypeRef: method.returnTypeRef ?? null,
        returnNullable: method.returnNullable === true,
        returnPromiseValueType: method.returnPromiseValueType,
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
  entryPath: string | null,
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
    topLevelNodes,
    options.libraries
  )
  baseContext.exceptionValueShape = cObjectShapeFromMetadata(
    compilerLibraryIntrinsicResultCShape(
      options.libraries,
      'exception-value',
      { line: 1, column: 1 }
    )
  )
  baseContext.runtimeEntryPath = entryPath
  baseContext.classInfos = createClassInfos(classes, diagnostics)
  const classDescriptorNames = collectCClassDescriptorNames(irPrograms, baseContext.classInfos)
  const valueDeclarations = collectCUnitValueDeclarations(irPrograms, baseContext)
  registerCUnitValueDeclarations(baseContext, valueDeclarations)
  registerCUnitSyntheticImportNames(baseContext, irPrograms)
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
  const classMethods = collectClassMethods(baseContext)
  const signatureRuntimeTypes = collectCUnitContextRuntimeTypes(baseContext)
  const preludeRequirements = resolveCRuntimePreludeRequirements({
    classDescriptorCount: classDescriptorNames.size,
    cppValueRuntime: classInfosUseCppValueRuntime(baseContext),
    globalUsages,
    hasRuntimeCallbackWrapper: hasCUnitRuntimeCallbackWrapper(baseContext),
    irPrograms,
    libraries: options.libraries,
    runtimeRequirements,
    signatureRuntimeTypes,
    throwingFunctionCount: baseContext.throwingFunctions.size
  })
  const needsRuntime: boolean = preludeRequirements.needsRuntime
  const needsAsyncRuntime: boolean = preludeRequirements.needsAsyncRuntime
  const needsCallbackRuntime: boolean = preludeRequirements.needsCallbackRuntime
  const needsClassDescriptorRuntime: boolean = preludeRequirements.needsClassDescriptorRuntime
  const needsCppValueRuntime: boolean = preludeRequirements.needsCppValueRuntime
  const needsStringHeader: boolean = preludeRequirements.needsStringHeader
  const needsCollectionRuntime: boolean = preludeRequirements.needsCollectionRuntime
  const needsObjectRuntime: boolean = preludeRequirements.needsObjectRuntime
  baseContext.runtimeEntrypointAdapter = preludeRequirements.runtimeEntrypointAdapter
  baseContext.runtimeInitializerDefinitions = emitCompilerLibraryRuntimeInitializerDefinitions(
    resolveCCompilerLibrarySet(options.libraries),
    preludeRequirements.libraryRuntimeRequirements,
    options.libraryOptions
  )
  if (needsAsyncRuntime) {
    baseContext.unhandledRejectionFlag = 'inox_unhandled_rejection'
  } else {
    baseContext.unhandledRejectionFlag = null
  }
  reportUnsupportedCSyntaxFeatures(syntaxFeatures, diagnostics)
  reportUnsupportedCGlobalUsages(globalUsages, diagnostics)
  const lines = emitCPrelude(
    needsRuntime,
    true,
    needsAsyncRuntime,
    needsCallbackRuntime,
    needsClassDescriptorRuntime,
    needsCppValueRuntime,
    needsStringHeader,
    needsCollectionRuntime,
    needsObjectRuntime,
    preludeRequirements.libraryCPreludeIncludes
  )
  pushUnitLines(lines, baseContext.runtimeInitializerDefinitions)

  if (baseContext.runtimeInitializerDefinitions.length > 0) {
    lines.push('')
  }
  const declarationLines: string[] = []
  const functionPrototypeNames = collectCUnitNeededFunctionPrototypeNames(functions, classMethods, baseContext)

  for (const item of functions) {
    if (!functionPrototypeNames.has(item.name)) {
      continue
    }

    declarationLines.push(`${deps.emitFunctionHead(item, baseContext)};`)
  }

  if (baseContext.classInfos.size > 0 && functionPrototypeNames.size > 0) {
    declarationLines.push('')
  }

  emitCUnitNativeClassForwardDeclarations(lines, baseContext, declarationLines)
  pushUnitLines(lines, declarationLines)
  pushUnitLines(
    lines,
    emitCNativeClassDeclarations(
      baseContext,
      collectCUnitClassMethodPrototypes(baseContext, deps),
      classDescriptorNames
    )
  )
  const arrowCallbackWrappers: CRuntimeArrowCallbackWrapper[] = []
  const promiseChainCallbackWrappers: CPromiseChainWrapper[] = []
  const callbackWrappers: CCallbackWrapperMap = baseContext.callbackWrappers
  const promiseChainWrappers: CPromiseChainWrapperMap = baseContext.promiseChainWrappers
  const asyncTaskWrappers: CAsyncTaskWrapperMap = baseContext.asyncTaskWrappers

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
      pushUnitLines(lines, emitAsyncTaskFrameType(wrapper, baseContext.libraries))
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

  for (const classMethod of classMethods) {
    if (!classMethod.info.native) {
      lines.push(deps.emitClassMethodPrototype(classMethod.info, classMethod.method, baseContext))
    }
  }

  if (asyncTaskWrappers.size > 0) {
    for (const wrapper of asyncTaskWrappers.values()) {
      pushUnitLines(lines, emitAsyncTaskWrapperPrototypes(wrapper, baseContext.libraries))
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

  if (
    functions.length > 0 ||
    classMethods.length > 0 ||
    asyncTaskWrappers.size > 0 ||
    callbackWrappers.size > 0 ||
    promiseChainWrappers.size > 0
  ) {
    lines.push('')
  }

  for (const classInfo of baseContext.classInfos.values()) {
    pushUnitLines(
      lines,
      deps.emitClassConstructorDeclaration(classInfo, baseContext, deps.declarationEmissionDependencies)
    )
    lines.push('')
  }

  for (const classMethod of classMethods) {
    pushUnitLines(
      lines,
      deps.emitClassMethodDeclaration(
        classMethod.info,
        classMethod.method,
        baseContext,
        deps.declarationEmissionDependencies
      )
    )
    lines.push('')
  }

  pushUnitLines(lines, emitCClassDescriptorDeclarationsForNames(baseContext, classDescriptorNames))
  emitCUnitValueFunctionFieldDefinitions(lines, valueDeclarations, baseContext)
  emitCUnitUnhandledRejectionFlagDefinition(lines, baseContext)
  emitCUnitValueDefinitions(lines, valueDeclarations, baseContext)

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

  for (const item of functions) {
    pushUnitLines(lines, deps.emitFunctionDeclaration(item, baseContext, deps.declarationEmissionDependencies))
    lines.push('')
  }

  const mainLines = deps.emitMainWrapper(entryIrPrograms, baseContext, deps.declarationEmissionDependencies)

  emitCUnitFunctionPointerRuntimeAdapterDefinitions(lines, baseContext)
  emitCUnitFunctionPointerAdapterDefinitions(lines, baseContext)
  pushUnitLines(lines, mainLines)

  throwDiagnostics(diagnostics)

  const code = filterUnusedCPreludeIncludes(joinCUnitLines(lines))

  return code
}

function emitCUnitFunctionPointerRuntimeAdapterDefinitions(lines: string[], context: CEmitContext): void {
  registerCUnitFunctionPointerAdapterRuntimeBridges(context)

  for (const adapter of context.functionPointerRuntimeAdapters) {
    pushUnitLines(lines, emitFunctionPointerRuntimeAdapterDefinition(adapter))
    lines.push('')
  }
}

function registerCUnitFunctionPointerAdapterRuntimeBridges(context: CEmitContext): void {
  for (const adapter of context.functionPointerAdapters) {
    const targetFunctionType = cUnitFunctionPointerAdapterTargetFunctionType(adapter, context)
    const targetSeenTypes = cUnitFunctionPointerAdapterTargetSeenTypes(adapter, context)
    const expectedInfos = collectFunctionPointerParamInfos(adapter.functionType, adapter.seenTypes)
    const targetInfos = collectFunctionPointerParamInfos(targetFunctionType, targetSeenTypes)

    for (const targetInfo of targetInfos) {
      const expectedInfo = cUnitFunctionPointerParamInfoForName(expectedInfos, targetInfo.name)

      if (cUnitFunctionPointerParamNeedsRuntimeBridge(expectedInfo, targetInfo)) {
        if (expectedInfo !== null && expectedInfo.functionType !== null) {
          registerFunctionPointerRuntimeAdapter(expectedInfo.functionType, expectedInfo.seenTypes, context)
        }
      }
    }
  }
}

function emitCUnitUnhandledRejectionFlagDefinition(lines: string[], context: CEmitContext): void {
  if (context.unhandledRejectionFlag === null || typeof context.unhandledRejectionFlag === 'undefined') {
    return
  }
}

function emitCUnitNativeClassForwardDeclarations(
  lines: string[],
  context: CEmitContext,
  declarationLines: string[]
): void {
  let emitted = false

  for (const info of context.classInfos.values()) {
    if (!info.native) {
      continue
    }

    const typeName = emitCClassTypeName(info.symbolName)

    if (!cUnitDeclarationLinesReferenceName(declarationLines, typeName)) {
      continue
    }

    lines.push(`class ${typeName};`)
    emitted = true
  }

  if (emitted) {
    lines.push('')
  }
}

function cUnitDeclarationLinesReferenceName(lines: string[], name: string): boolean {
  for (let index = 0; index < lines.length; index = index + 1) {
    if (cUnitLineReferencesName(lines[index], name)) {
      return true
    }
  }

  return false
}

function cUnitLineReferencesName(line: string, name: string): boolean {
  const index = line.indexOf(name)

  if (index < 0) {
    return false
  }

  const before = index > 0 ? line[index - 1] : ''
  const afterIndex = index + name.length
  const after = afterIndex < line.length ? line[afterIndex] : ''

  return !cUnitIdentifierChar(before) && !cUnitIdentifierChar(after)
}

function cUnitIdentifierChar(value: string): boolean {
  return 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_'.indexOf(value) >= 0
}

function collectCUnitNeededFunctionPrototypeNames(
  functions: AnyNode[],
  classMethods: CClassMethod[],
  context: CEmitContext
): Set<string> {
  const prototypeNames = new Set<string>()
  const functionNames = collectCUnitFunctionNames(functions)
  const functionIndexes = collectCUnitFunctionIndexes(functions)

  for (const wrapper of context.callbackWrappers.values()) {
    if (wrapper.kind === 'named') {
      prototypeNames.add(wrapper.target)
    } else {
      collectCReferencedFunctionPrototypeNames(wrapper.expression, functionNames, prototypeNames)
    }
  }

  for (const info of context.classInfos.values()) {
    if (info.constructor !== null && typeof info.constructor !== 'undefined') {
      collectCReferencedFunctionPrototypeNames(info.constructor, functionNames, prototypeNames)
    }
  }

  for (const method of classMethods) {
    collectCReferencedFunctionPrototypeNames(method.method, functionNames, prototypeNames)
  }

  for (let functionIndex = 0; functionIndex < functions.length; functionIndex = functionIndex + 1) {
    const item = functions[functionIndex]
    const referenced = new Set<string>()

    collectCReferencedFunctionPrototypeNames(item, functionNames, referenced)

    for (const name of referenced) {
      const referencedIndex = functionIndexes.get(name)

      if (referencedIndex !== null && typeof referencedIndex !== 'undefined' && referencedIndex > functionIndex) {
        prototypeNames.add(name)
      }
    }
  }

  return prototypeNames
}

function collectCUnitFunctionNames(functions: AnyNode[]): Set<string> {
  const names = new Set<string>()

  for (let index = 0; index < functions.length; index = index + 1) {
    names.add(functions[index].name)
  }

  return names
}

function collectCUnitFunctionIndexes(functions: AnyNode[]): Map<string, number> {
  const indexes = new Map<string, number>()

  for (let index = 0; index < functions.length; index = index + 1) {
    indexes.set(functions[index].name, index)
  }

  return indexes
}

function emitCallbackFinalizerPrototype(finalizerName: string): string {
  return 'static void ' + finalizerName + '(void* context);'
}
