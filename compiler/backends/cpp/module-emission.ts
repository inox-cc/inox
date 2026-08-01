import {
  collectIrFunctionDeclarations,
  collectIrFunctionEffectsWithExternalEffects,
  collectIrFunctionNodeEntries,
  collectIrGlobalRoots,
  collectIrGlobalUsages,
  collectIrRuntimeRequirements,
  collectIrStoredFunctionEffects,
  collectIrSyntaxFeatureUsages,
  collectIrTopLevelNodes,
  irClassMethodEffectName,
  mergeIrFunctionEffects
} from '../../ir.ts'
import { collectRuntimeRequirements } from '../../ir/features.ts'
import { collectGlobalUsages } from '../../ir/globals.ts'
import { reexportImportAliasName } from '../../modules/synthetic-imports.ts'
import type {
  AnyNode,
  Diagnostic,
  IrFunctionDeclaration,
  IrFunctionEffect,
  IrProgram,
  IrRuntimeRequirement,
  ProgramNode
} from '../../types.ts'
import type { CallbackLoweringDependencies, FunctionPointerParamInfo } from './async/callbacks.ts'
import {
  collectCallbackWrappers,
  collectFunctionPointerParamInfos,
  collectFunctionPointerParamNames,
  emitFunctionPointerNativeBoundaryArgument,
  emitFunctionPointerNamedParams,
  emitFunctionPointerParams,
  emitFunctionPointerReturnType,
  emitFunctionPointerRuntimeAdapterDefinition,
  emitFunctionPointerAdapterResultLines,
  emitPlainArrowCallbackWrapperDeclaration,
  emitPlainArrowCallbackWrapperHead,
  emitRuntimeArrowCallbackContextType,
  emitRuntimeCallbackWrapperDeclaration,
  emitRuntimeCallbackWrapperHead,
  isNullableFunctionType,
  isPlainObjectFunctionField,
  isPlainFunctionPointerType,
  isAsyncResultChainCallbackWrapperWithContext,
  isRuntimeArrowCallbackWrapperWithContext,
  isRuntimeCallbackWrapper,
  isRuntimeFunctionType,
  registerFunctionPointerRuntimeAdapter
} from './async/callbacks.ts'
import type { AsyncResultChainLoweringDependencies } from './async/async-results.ts'
import {
  collectAsyncResultChainWrappers,
  emitAsyncResultChainCallbackWrapperDeclaration,
  emitAsyncResultChainCallbackWrapperHead
} from './async/async-results.ts'
import type { AsyncTaskLoweringDependencies } from './async/tasks.ts'
import {
  collectAsyncTaskWrappers,
  emitAsyncTaskFrameType,
  emitAsyncTaskWrapperDeclaration,
  emitAsyncTaskWrapperPrototypes
} from './async/tasks.ts'
import type { CEmitContextWithDependencies, CFunctionContextWithDependencies } from './context.ts'
import {
  createFunctionContext,
  emitBoxedValueCleanup,
  emitBoxedValueDeclarations,
  emitErrorChannelDeclarations,
  emitEventLoopCleanup,
  emitEventLoopDeclarations,
  emitEventLoopDrain,
  emitEventLoopInit,
  emitLoopFlowDeclarations,
  emitMainReturnValueDeclarations,
  emitOwnedAsyncResultCleanup,
  emitOwnedAsyncResultDeclarations,
  emitOwnedValueCleanup,
  emitOwnedValueDeclarations,
  emitReturnFlowDeclarations,
  emitReturnValueDeclarations,
  replaceCleanupGotosWithReturn,
  shouldEmitCleanupLabel
} from './context.ts'
import { reportUnsupportedCGlobalUsages, reportUnsupportedCSyntaxFeatures } from './diagnostics.ts'
import type { CDeclarationEmissionDependencies } from './declarations.ts'
import { cStringLiteral, emitCFunctionName, emitCIdentifier, emitCObjectFunctionFieldName } from './identifiers.ts'
import { relativeCIncludePath, uniqueCModuleImports } from './modules.ts'
import { emitCompilerLibraryRuntimeInitializerDefinitions } from './library-initializers.ts'
import { emitCPrelude, emitLibraryCPreludeIncludeLines, filterUnusedCPreludeIncludes } from './prelude.ts'
import { collectCReferencedFunctionPrototypeNames } from './prototype-references.ts'
import { resolveCRuntimePreludeRequirements, resolveLibraryRuntimeCPreludeIncludes } from './runtime-plan.ts'
import { cCompilerLibrarySetValue, cObjectShapeFromMetadata, cTypeRefMapValue } from './types.ts'
import type {
  CCallbackWrapper,
  CClassInfo,
  CClassMethod,
  CCompilerLibrarySet,
  CFunctionParam,
  CFunctionPointerAdapter,
  CFunctionType,
  CppModuleEmitOptions,
  CModuleImportPlan,
  CModulePlan,
  CObjectShape,
  CObjectShapeField,
  CAsyncResultChainWrapper,
  CRuntimeArrowCallbackWrapper
} from './types.ts'
import {
  compilerLibraryIntrinsicResultCShape,
  compilerLibraryNativeRuntimeRequirementsForCppType,
  compilerLibraryNativeRuntimeRequirementsForId,
  cCallExpressionReturnsTypeErasedValue,
  emitCType,
  isManagedRuntimeReturnType,
  isOpaqueRuntimeValueType,
  isRuntimeNullableType,
  libraryCppValueStorageType,
  requireCompilerLibraryIntrinsicNativeCppType,
  resolveCCompilerLibrarySet
} from './value-types.ts'
import type {
  CClassInlineDefinitionMap,
  CClassMethodPrototypeMap,
  ClassLoweringDependencies
} from './values/classes.ts'
import {
  cClassInlineMethodDefinitionKey,
  cClassUsesInlineDefinitions,
  cClassNameFromValueType,
  cClassValueTypeName,
  classInfosUseCppValueRuntime,
  collectCClassDescriptorNames,
  collectClassMethods,
  createClassInfos,
  emitCClassDescriptorDeclarationsForNames,
  emitCClassTypeNameForClassName,
  emitCNativeClassDeclarations
} from './values/classes.ts'
import type { NullableLoweringDependencies } from './values/nullable.ts'
import type { StatementLoweringDependencies } from './values/statements.ts'
import type { StringLoweringDependencies } from './values/strings.ts'

type CEmitContext = CEmitContextWithDependencies<
  AsyncTaskLoweringDependencies,
  ClassLoweringDependencies,
  NullableLoweringDependencies,
  StatementLoweringDependencies,
  StringLoweringDependencies
>
type CFunctionContext = CFunctionContextWithDependencies<
  AsyncTaskLoweringDependencies,
  ClassLoweringDependencies,
  NullableLoweringDependencies,
  StatementLoweringDependencies,
  StringLoweringDependencies
>

type CModuleValueDeclaration = {
  compileTimeInitializer?: string | null
  cppType?: string | null
  declaredType?: string | null
  exported: boolean
  functionType?: CFunctionType | null
  name: string
  shape?: CObjectShape | null
  shapeBuiltin?: string | null
  symbolName: string
  valueType: string
}

type CModuleFunctionNodeEntry = {
  declaration: IrFunctionDeclaration
  node: AnyNode
}

type CModuleNode = AnyNode

type CModuleReferenceNode = AnyNode & {
  path?: string[] | null
}

type CModuleFunctionEntry = {
  declaration: IrFunctionDeclaration
  node: CModuleNode
}

type CModuleRuntimeCallbackWrapperContext = {
  callbackWrappers: Map<string, CCallbackWrapper>
}

type CModuleRuntimeTypeContext = {
  functionParams: Map<string, CFunctionParam[]>
  functionReturnTypes: Map<string, string>
  moduleValueTypes: Map<string, string>
}

type CModuleValueFunctionFieldContext = {
  moduleObjectShapes: Map<string, CObjectShapeField[]>
}

function pushCModuleLines(target: string[], source: string[]): void {
  for (let index = 0; index < source.length; index = index + 1) {
    target.push(source[index])
  }
}

function pushIndentedCModuleLines(target: string[], source: string[]): void {
  for (let index = 0; index < source.length; index = index + 1) {
    target.push(`  ${source[index]}`)
  }
}

function pushScopedCModuleBody(target: string[], source: string[]): void {
  target.push('  {')
  pushIndentedCModuleLines(target, source)
  target.push('  }')
}

function pushIrFunctionDeclaration(target: IrFunctionDeclaration[], declaration: IrFunctionDeclaration): void {
  target.push(declaration)
}

function pushIrFunctionEffect(target: IrFunctionEffect[], effect: IrFunctionEffect): void {
  target.push(effect)
}

function pushCModuleClassMethodFunctionDeclarations(target: IrFunctionDeclaration[], programs: IrProgram[]): void {
  for (let programIndex = 0; programIndex < programs.length; programIndex = programIndex + 1) {
    const program = programs[programIndex]
    const classes = collectIrTopLevelNodes(program, 'class')

    for (let classIndex = 0; classIndex < classes.length; classIndex = classIndex + 1) {
      const classNode = classes[classIndex]
      const methods: CModuleNode[] = classNode.methods

      for (let methodIndex = 0; methodIndex < methods.length; methodIndex = methodIndex + 1) {
        const method = methods[methodIndex]

        if (method.name === 'constructor') {
          continue
        }

        const methodEffectName = irClassMethodEffectName(classNode.name, method.name)
        const methodReturnType = cModuleNodeReturnType(method)
        const declaration: IrFunctionDeclaration = {
          name: methodEffectName,
          exported: false,
          async: method.async === true,
          params: method.params,
          returnType: methodReturnType,
          returnTypeRef: method.returnTypeRef ?? null,
          returnNullable: method.returnNullable === true,
          returnAsyncResultValueType: method.returnAsyncResultValueType,
          returnShape: method.returnShape,
          loc: method.loc
        }

        target.push(declaration)
      }
    }
  }
}

function cModuleNodeReturnType(node: CModuleNode): string {
  if (node.returnType !== null && typeof node.returnType !== 'undefined') {
    return node.returnType
  }

  return 'unknown'
}

function runtimeRequirementSetFromArray(values: IrRuntimeRequirement[]): Set<IrRuntimeRequirement> {
  const result: Set<IrRuntimeRequirement> = new Set()

  for (let index = 0; index < values.length; index = index + 1) {
    result.add(values[index])
  }

  return result
}

function stringSetFromArray(values: string[]): Set<string> {
  const result: Set<string> = new Set()

  for (let index = 0; index < values.length; index = index + 1) {
    result.add(values[index])
  }

  return result
}

function cModuleHasRuntimeCallbackWrapper(context: CModuleRuntimeCallbackWrapperContext): boolean {
  for (const wrapper of context.callbackWrappers.values()) {
    if (isRuntimeCallbackWrapper(wrapper)) {
      return true
    }
  }

  return false
}

function collectCModuleClassMethodPrototypes(
  context: CEmitContext,
  deps: CModuleEmissionDependencies
): CClassMethodPrototypeMap {
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

export type CModuleEmissionDependencies = {
  asyncTaskLoweringDependencies: AsyncTaskLoweringDependencies
  callbackLoweringDependencies: CallbackLoweringDependencies
  classLoweringDependencies: ClassLoweringDependencies
  collectExternalEventLoopFunctions(functions: AnyNode[], seedNames?: Set<string>): Set<string>
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
    dependencies: CDeclarationEmissionDependencies,
    inClass?: boolean
  ): string[]
  emitClassMethodDeclaration(
    info: CClassInfo,
    method: AnyNode,
    baseContext: CEmitContext,
    dependencies: CDeclarationEmissionDependencies,
    inClass?: boolean
  ): string[]
  emitClassMethodHead(info: CClassInfo, method: AnyNode, context: CEmitContext): string
  emitClassMethodPrototype(info: CClassInfo, method: AnyNode, context: CEmitContext): string
  emitFunctionDeclaration(
    statement: AnyNode,
    baseContext: CEmitContext,
    dependencies: CDeclarationEmissionDependencies
  ): string[]
  emitFunctionHead(statement: AnyNode, context: CEmitContext): string
  emitStatementList(body: AnyNode[], context: CFunctionContext): string[]
  nullableLoweringDependencies: NullableLoweringDependencies
  asyncResultChainLoweringDependencies: AsyncResultChainLoweringDependencies
  statementLoweringDependencies: StatementLoweringDependencies
  stringLoweringDependencies: StringLoweringDependencies
}

export function emitCModuleSource(
  plan: CModulePlan,
  plans: CModulePlan[],
  options: CppModuleEmitOptions,
  diagnostics: Diagnostic[],
  deps: CModuleEmissionDependencies
): string {
  const irPrograms = [plan.ir]
  const functionEntries = collectCModuleFunctionNodeEntries(plan, irPrograms)
  const functions: AnyNode[] = []
  const context = createCModuleBaseContext(plan, diagnostics, deps, options.libraries)
  context.exceptionValueShape = cObjectShapeFromMetadata(
    compilerLibraryIntrinsicResultCShape(options.libraries, 'exception-value', { line: 1, column: 1 })
  )
  const runtimeRequirements = runtimeRequirementSetFromArray(collectIrRuntimeRequirements(irPrograms))
  const emitsMain = plan.isEntry || plan.initName === null || typeof plan.initName === 'undefined'
  const ownsProgramRuntime = plan.isGraphEntry

  if (ownsProgramRuntime) {
    for (let planIndex = 0; planIndex < plans.length; planIndex = planIndex + 1) {
      const requirements = collectIrRuntimeRequirements([plans[planIndex].ir])

      for (let requirementIndex = 0; requirementIndex < requirements.length; requirementIndex = requirementIndex + 1) {
        runtimeRequirements.add(requirements[requirementIndex])
      }
    }
  }
  const globalUsages = collectIrGlobalUsages(irPrograms)
  const syntaxFeatures = collectIrSyntaxFeatureUsages(irPrograms)
  const signatureRuntimeTypes = collectCModuleContextRuntimeTypes(context)
  const moduleValues = collectCModuleStaticValueDeclarations(plan, context)
  const compileTimeModuleValues = collectCModuleCompileTimeValueDeclarations(moduleValues)
  const runtimeModuleValues = collectCModuleRuntimeValueDeclarations(moduleValues)
  addCModuleImplementationNativeRuntimeRequirements(runtimeRequirements, context, moduleValues, options.libraries)
  const classDescriptorNames = collectCClassDescriptorNames(irPrograms, context.classInfos)
  const prelude = resolveCRuntimePreludeRequirements({
    classDescriptorCount: classDescriptorNames.size,
    cppValueRuntime: classInfosUseCppValueRuntime(context),
    globalUsages,
    hasRuntimeCallbackWrapper: cModuleHasRuntimeCallbackWrapper(context),
    irPrograms,
    libraries: options.libraries,
    runtimeRequirements,
    signatureRuntimeTypes,
    throwingFunctionCount: context.throwingFunctions.size
  })
  const classMethods = collectClassMethods(context)

  for (let entryIndex = 0; entryIndex < functionEntries.length; entryIndex = entryIndex + 1) {
    const entry = functionEntries[entryIndex]

    functions.push(entry.node)
  }

  context.runtimeEntrypointAdapter = prelude.runtimeEntrypointAdapter
  context.runtimeInitializerDefinitions = ownsProgramRuntime
    ? emitCompilerLibraryRuntimeInitializerDefinitions(
        resolveCCompilerLibrarySet(options.libraries),
        prelude.libraryRuntimeRequirements,
        options.libraryOptions
      )
    : []
  if (prelude.needsAsyncRuntime) {
    context.unhandledRejectionFlag = `${plan.symbolPrefix}_unhandled_rejection`
  } else {
    context.unhandledRejectionFlag = null
  }
  reportUnsupportedCSyntaxFeatures(syntaxFeatures, diagnostics)
  reportUnsupportedCGlobalUsages(globalUsages, diagnostics)

  const lines: string[] = []
  const headerDeclarations = collectCModuleHeaderDeclarationLines(plan, context, deps)
  const headerIncludes = collectCModuleHeaderIncludeLines(
    plan,
    context,
    options.libraries,
    deps,
    headerDeclarations,
    options.host
  )

  if (headerDeclarations.length > 0) {
    lines.push(`#include "${relativeCIncludePath(plan.sourcePath, plan.headerPath, options.host)}"`)
  }

  const imports = uniqueCModuleImports(plan.imports)

  for (let importIndex = 0; importIndex < imports.length; importIndex = importIndex + 1) {
    const item = imports[importIndex]
    const importedModule = item.module

    if (importedModule === null || typeof importedModule === 'undefined') {
      continue
    }

    if (importedModule.headerPath !== plan.headerPath) {
      const includeLine = `#include "${relativeCIncludePath(plan.sourcePath, importedModule.headerPath, options.host)}"`

      if (!cModuleLinesInclude(headerIncludes, includeLine)) {
        lines.push(includeLine)
      }
    }
  }

  pushCModuleLines(
    lines,
    filterCModuleIncludesProvidedByHeader(
      emitCPrelude(
        prelude.needsRuntime,
        emitsMain,
        prelude.needsAsyncRuntime,
        prelude.needsCallbackRuntime,
        prelude.needsClassDescriptorRuntime,
        prelude.needsCppValueRuntime,
        prelude.needsStringHeader,
        prelude.needsObjectRuntime,
        prelude.libraryCPreludeIncludes
      ),
      headerIncludes
    )
  )
  pushCModuleLines(lines, context.runtimeInitializerDefinitions)

  if (context.runtimeInitializerDefinitions.length > 0) {
    lines.push('')
  }

  const bodyLines: string[] = []
  const inlineConstructorDefinitions: CClassInlineDefinitionMap = new Map()
  const inlineMethodDefinitions: CClassInlineDefinitionMap = new Map()

  for (const classInfo of context.classInfos.values()) {
    if (classInfo.imported === true) {
      continue
    }

    const inClass =
      cClassUsesInlineDefinitions(classInfo) ||
      (classInfo.node.exported === true && classInfo.constructor?.inline === true)
    const definition = deps.emitClassConstructorDeclaration(
      classInfo,
      context,
      deps.declarationEmissionDependencies,
      inClass
    )

    if (inClass) {
      if (definition.length > 0) {
        inlineConstructorDefinitions.set(classInfo.name, definition)
      }

      continue
    }

    pushCModuleLines(bodyLines, definition)
    bodyLines.push('')
  }

  for (let methodIndex = 0; methodIndex < classMethods.length; methodIndex = methodIndex + 1) {
    const item = classMethods[methodIndex]
    const info = item.info
    const method = item.method
    const inClass = cClassUsesInlineDefinitions(info) || (info.node.exported === true && method.inline === true)
    const definition = deps.emitClassMethodDeclaration(
      info,
      method,
      context,
      deps.declarationEmissionDependencies,
      inClass
    )

    if (inClass) {
      inlineMethodDefinitions.set(cClassInlineMethodDefinitionKey(info, method), definition)
      continue
    }

    pushCModuleLines(bodyLines, definition)
    bodyLines.push('')
  }

  pushCModuleLines(bodyLines, emitCClassDescriptorDeclarationsForNames(context, classDescriptorNames))
  emitCModuleUnhandledRejectionFlagDefinition(bodyLines, context)
  emitCModuleValueDefinitions(bodyLines, runtimeModuleValues, context)

  for (const wrapper of context.asyncTaskWrappers.values()) {
    pushCModuleLines(bodyLines, emitAsyncTaskWrapperDeclaration(wrapper, context, deps.asyncTaskLoweringDependencies))
    bodyLines.push('')
  }

  for (const wrapper of context.callbackWrappers.values()) {
    if (wrapper.kind === 'plain-arrow') {
      pushCModuleLines(
        bodyLines,
        emitPlainArrowCallbackWrapperDeclaration(wrapper, context, deps.callbackLoweringDependencies)
      )
    } else {
      pushCModuleLines(
        bodyLines,
        emitRuntimeCallbackWrapperDeclaration(wrapper, context, deps.callbackLoweringDependencies)
      )
    }
    bodyLines.push('')
  }

  for (const wrapper of context.asyncResultChainWrappers.values()) {
    pushCModuleLines(
      bodyLines,
      emitAsyncResultChainCallbackWrapperDeclaration(wrapper, context, deps.asyncResultChainLoweringDependencies)
    )
    bodyLines.push('')
  }

  for (let functionIndex = 0; functionIndex < functions.length; functionIndex = functionIndex + 1) {
    const item = functions[functionIndex]

    if (isCModuleExportedInlineFunction(plan, item.name)) {
      continue
    }

    pushCModuleLines(bodyLines, emitCModuleFunctionDeclaration(plan, item, context, deps))
    bodyLines.push('')
  }

  if (!plan.isEntry && plan.initName !== null && typeof plan.initName !== 'undefined') {
    pushCModuleLines(bodyLines, emitCModuleInitFunction(plan, context, deps))
  } else {
    pushCModuleLines(bodyLines, emitCModuleMainFunction(plan, context, deps))
  }

  const declarationLines: string[] = []
  emitCModuleDeclarations(declarationLines, plan, functions, classMethods, context, deps)
  emitCModuleNativeClassForwardDeclarations(lines, context, declarationLines)
  pushCModuleLines(lines, declarationLines)
  emitCModuleValueFunctionFieldDefinitions(lines, moduleValues, context)
  emitCModuleValueDefinitions(lines, compileTimeModuleValues, context)
  const omittedSyntheticDefaultConstructors = collectCModuleOmittedSyntheticDefaultConstructors(
    context,
    classDescriptorNames,
    moduleValues
  )
  pushCModuleLines(
    lines,
    emitCNativeClassDeclarations(
      context,
      collectCModuleClassMethodPrototypes(context, deps),
      classDescriptorNames,
      inlineConstructorDefinitions,
      inlineMethodDefinitions,
      collectCModuleSourceClassNames(context),
      omittedSyntheticDefaultConstructors
    )
  )
  emitCModuleFunctionPointerRuntimeAdapterDefinitions(lines, context)
  emitCModuleFunctionPointerAdapterDefinitions(lines, context)
  pushCModuleLines(lines, bodyLines)

  return filterUnusedCPreludeIncludes(joinCModuleLines(lines))
}

function collectCModuleOmittedSyntheticDefaultConstructors(
  context: CEmitContext,
  descriptorNames: Set<string>,
  moduleValues: CModuleValueDeclaration[]
): Set<string> {
  const omitted: Set<string> = new Set()

  for (const info of context.classInfos.values()) {
    if (
      info.imported === true ||
      info.node.exported === true ||
      descriptorNames.has(info.name) ||
      info.constructor === null ||
      typeof info.constructor === 'undefined' ||
      info.constructor.params.length === 0
    ) {
      continue
    }

    const valueType = cClassValueTypeName(info.name)

    if (cModuleValuesContainType(moduleValues, valueType)) {
      continue
    }

    if (cModuleClassFieldsContainClass(context, info.name)) {
      continue
    }

    omitted.add(info.name)
  }

  return omitted
}

function cModuleValuesContainType(values: CModuleValueDeclaration[], valueType: string): boolean {
  for (let index = 0; index < values.length; index = index + 1) {
    if (values[index].valueType === valueType) {
      return true
    }
  }

  return false
}

function cModuleClassFieldsContainClass(context: CEmitContext, className: string): boolean {
  for (const info of context.classInfos.values()) {
    for (const field of info.fields) {
      if (field.className === className) {
        return true
      }
    }
  }

  return false
}

function emitCModuleFunctionPointerRuntimeAdapterDefinitions(lines: string[], context: CEmitContext): void {
  registerCModuleFunctionPointerAdapterRuntimeBridges(context)

  for (const adapter of context.functionPointerRuntimeAdapters) {
    pushCModuleLines(lines, emitFunctionPointerRuntimeAdapterDefinition(adapter, context.libraries))
    lines.push('')
  }
}

function registerCModuleFunctionPointerAdapterRuntimeBridges(context: CEmitContext): void {
  const moduleObjectFunctionFields: Set<string> = new Set()
  const moduleObjectFunctionFieldInfos: FunctionPointerParamInfo[] = []

  for (const adapter of context.functionPointerAdapters) {
    const targetFunctionType = functionPointerAdapterTargetFunctionType(adapter, context)
    const targetSeenTypes = functionPointerAdapterTargetSeenTypes(adapter, context)
    const expectedInfos = collectFunctionPointerParamInfos(adapter.functionType, adapter.seenTypes)
    const targetInfos = collectFunctionPointerParamInfos(targetFunctionType, targetSeenTypes)

    for (const targetInfo of targetInfos) {
      let expectedInfo = functionPointerParamInfoForName(expectedInfos, targetInfo.name)

      if (expectedInfo === null) {
        const moduleFieldName = emitFunctionPointerAdapterModuleObjectFieldArg(
          targetInfo.name,
          moduleObjectFunctionFields
        )

        if (moduleFieldName !== null) {
          expectedInfo = functionPointerPointerParamInfoForName(moduleObjectFunctionFieldInfos, moduleFieldName)
        }
      }

      if (functionPointerParamNeedsRuntimeBridge(expectedInfo, targetInfo)) {
        if (expectedInfo !== null && expectedInfo.functionType !== null) {
          registerFunctionPointerRuntimeAdapter(expectedInfo.functionType, expectedInfo.seenTypes, context)
        }
      }
    }
  }
}

function emitCModuleNativeClassForwardDeclarations(
  lines: string[],
  context: CEmitContext,
  declarationLines: string[]
): void {
  let emitted = false

  for (const info of context.classInfos.values()) {
    if (!info.native) {
      continue
    }

    const typeName = emitCClassTypeNameForClassName(context, info.name)

    if (!cModuleDeclarationLinesReferenceName(declarationLines, typeName)) {
      continue
    }

    lines.push(`class ${typeName};`)
    emitted = true
  }

  if (emitted) {
    lines.push('')
  }
}

function cModuleDeclarationLinesReferenceName(lines: string[], name: string): boolean {
  for (let index = 0; index < lines.length; index = index + 1) {
    if (cModuleLineReferencesName(lines[index], name)) {
      return true
    }
  }

  return false
}

function cModuleLineReferencesName(line: string, name: string): boolean {
  let offset = 0

  while (offset < line.length) {
    const index = line.indexOf(name, offset)

    if (index < 0) {
      return false
    }

    const before = index > 0 ? line[index - 1] : ''
    const afterIndex = index + name.length
    const after = afterIndex < line.length ? line[afterIndex] : ''

    if (!cModuleIdentifierChar(before) && !cModuleIdentifierChar(after)) {
      return true
    }

    offset = index + name.length
  }

  return false
}

function cModuleIdentifierChar(value: string): boolean {
  return value !== '' && 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_'.indexOf(value) >= 0
}

export function emitCModuleHeader(
  plan: CModulePlan,
  _plans: CModulePlan[],
  options: CppModuleEmitOptions,
  diagnostics: Diagnostic[],
  deps: CModuleEmissionDependencies
): string {
  const context = createCModuleBaseContext(plan, diagnostics, deps, options.libraries)
  const declarationLines = collectCModuleHeaderDeclarationLines(plan, context, deps)
  const includes = collectCModuleHeaderIncludeLines(
    plan,
    context,
    options.libraries,
    deps,
    declarationLines,
    options.host
  )
  const lines: string[] = []

  lines.push(`#ifndef ${plan.headerGuard}`)
  lines.push(`#define ${plan.headerGuard}`)
  lines.push('')

  for (let includeIndex = 0; includeIndex < includes.length; includeIndex = includeIndex + 1) {
    lines.push(includes[includeIndex])
  }

  if (includes.length > 0) {
    lines.push('')
  }

  pushCModuleLines(lines, declarationLines)

  lines.push('')
  lines.push(`#endif`)

  return filterUnusedCPreludeIncludes(joinCModuleLines(lines))
}

function collectCModuleHeaderDeclarationLines(
  plan: CModulePlan,
  context: CEmitContext,
  deps: CModuleEmissionDependencies
): string[] {
  const exportedFunctions = collectCModuleExportedFunctions(plan)
  const exportedValues = collectCModuleExportedValueDeclarations(plan)
  let lines: string[] = []

  if (plan.initName !== null && typeof plan.initName !== 'undefined') {
    lines.push(`void ${plan.initName}();`)
  }

  for (let functionIndex = 0; functionIndex < exportedFunctions.length; functionIndex = functionIndex + 1) {
    const item = exportedFunctions[functionIndex]
    const prefix = isCModuleInlineFunction(plan, item.name) ? 'inline ' : ''

    lines.push(`${prefix}${deps.emitFunctionHead(item, context)};`)
  }

  for (let valueIndex = 0; valueIndex < exportedValues.length; valueIndex = valueIndex + 1) {
    const item = exportedValues[valueIndex]

    lines.push(`extern ${cModuleValueDeclarationCType(item, context)} ${item.symbolName};`)
  }

  const classLines = collectCModuleHeaderClassDeclarationLines(plan, context, deps)

  if (classLines.length > 0) {
    const forwardLines: string[] = []

    emitCModuleNativeClassForwardDeclarations(forwardLines, context, lines)

    if (forwardLines.length > 0) {
      pushCModuleLines(forwardLines, lines)
      lines = forwardLines
    }

    if (lines.length > 0) {
      lines.push('')
    }

    pushCModuleLines(lines, classLines)
  }

  for (let functionIndex = 0; functionIndex < exportedFunctions.length; functionIndex = functionIndex + 1) {
    const item = exportedFunctions[functionIndex]

    if (!isCModuleInlineFunction(plan, item.name)) {
      continue
    }

    if (lines.length > 0) {
      lines.push('')
    }

    pushCModuleLines(
      lines,
      prefixCModuleFunctionDeclaration(
        deps.emitFunctionDeclaration(item, context, deps.declarationEmissionDependencies),
        'inline '
      )
    )
  }

  return lines
}

function collectCModuleHeaderClassDeclarationLines(
  plan: CModulePlan,
  context: CEmitContext,
  deps: CModuleEmissionDependencies
): string[] {
  const includedClassNames = collectCModuleHeaderClassNames(context)

  if (includedClassNames.size === 0) {
    return []
  }

  const inlineConstructorDefinitions: CClassInlineDefinitionMap = new Map()
  const inlineMethodDefinitions: CClassInlineDefinitionMap = new Map()
  const classMethods = collectClassMethods(context)

  for (const info of context.classInfos.values()) {
    if (
      !includedClassNames.has(info.name) ||
      info.constructor === null ||
      typeof info.constructor === 'undefined' ||
      info.constructor.inline !== true
    ) {
      continue
    }

    const definition = deps.emitClassConstructorDeclaration(info, context, deps.declarationEmissionDependencies, true)

    if (definition.length > 0) {
      inlineConstructorDefinitions.set(info.name, definition)
    }
  }

  for (let methodIndex = 0; methodIndex < classMethods.length; methodIndex = methodIndex + 1) {
    const item = classMethods[methodIndex]

    if (!includedClassNames.has(item.info.name) || item.method.inline !== true) {
      continue
    }

    inlineMethodDefinitions.set(
      cClassInlineMethodDefinitionKey(item.info, item.method),
      deps.emitClassMethodDeclaration(item.info, item.method, context, deps.declarationEmissionDependencies, true)
    )
  }

  const lines = emitCNativeClassDeclarations(
    context,
    collectCModuleClassMethodPrototypes(context, deps),
    collectCClassDescriptorNames([plan.ir], context.classInfos),
    inlineConstructorDefinitions,
    inlineMethodDefinitions,
    includedClassNames
  )

  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop()
  }

  return lines
}

function collectCModuleHeaderClassNames(context: CEmitContext): Set<string> {
  const names: Set<string> = new Set()

  for (const info of context.classInfos.values()) {
    if (info.imported !== true && cModuleClassIsHeaderVisible(info)) {
      names.add(info.name)
    }
  }

  return names
}

function collectCModuleSourceClassNames(context: CEmitContext): Set<string> {
  const names: Set<string> = new Set()

  for (const info of context.classInfos.values()) {
    if (info.imported !== true && !cModuleClassIsHeaderVisible(info)) {
      names.add(info.name)
    }
  }

  return names
}

function cModuleClassIsHeaderVisible(info: CClassInfo): boolean {
  return info.native && info.node.exported === true
}

function collectCModuleHeaderIncludeLines(
  plan: CModulePlan,
  context: CEmitContext,
  libraries: CCompilerLibrarySet | null | undefined,
  deps: CModuleEmissionDependencies,
  declarationLines: string[],
  host: CppModuleEmitOptions['host']
): string[] {
  const runtimeRequirements: Set<IrRuntimeRequirement> = new Set()
  const includes: string[] = []

  if (cModuleHasHeaderDefinition(plan, context)) {
    const inlineProgram = collectCModuleInlineHeaderProgram(plan)
    const imports = uniqueCModuleImports(plan.imports)

    for (let importIndex = 0; importIndex < imports.length; importIndex = importIndex + 1) {
      const item = imports[importIndex]
      const importedModule = item.module

      if (
        importedModule === null ||
        typeof importedModule === 'undefined' ||
        importedModule.headerPath === plan.headerPath
      ) {
        continue
      }

      pushUniqueCModuleLine(
        includes,
        `#include "${relativeCIncludePath(plan.headerPath, importedModule.headerPath, host)}"`
      )
    }

    const irPrograms = [plan.ir]
    const requirements = collectRuntimeRequirements([], inlineProgram)

    for (let index = 0; index < requirements.length; index = index + 1) {
      runtimeRequirements.add(requirements[index])
    }

    const prelude = resolveCRuntimePreludeRequirements({
      classDescriptorCount: cModuleDeclarationLinesReferenceName(declarationLines, 'inox_class_descriptor') ? 1 : 0,
      cppValueRuntime: false,
      globalUsages: collectGlobalUsages(inlineProgram),
      hasRuntimeCallbackWrapper: false,
      irPrograms,
      libraries: resolveCCompilerLibrarySet(libraries),
      runtimeRequirements,
      signatureRuntimeTypes: new Set(),
      throwingFunctionCount: context.throwingFunctions.size
    })
    const preludeIncludes = emitCPrelude(
      prelude.needsRuntime,
      false,
      prelude.needsAsyncRuntime,
      prelude.needsCallbackRuntime,
      prelude.needsClassDescriptorRuntime,
      prelude.needsCppValueRuntime,
      prelude.needsStringHeader,
      prelude.needsObjectRuntime,
      prelude.libraryCPreludeIncludes
    )

    for (let index = 0; index < preludeIncludes.length; index = index + 1) {
      const line = preludeIncludes[index]

      if (line.startsWith('#include ')) {
        pushUniqueCModuleLine(includes, line)
      }
    }
  }

  addCModuleNativeDeclarationRuntimeRequirements(runtimeRequirements, declarationLines, libraries)

  if (cModuleHeaderDeclarationsNeedValue(declarationLines)) {
    pushUniqueCModuleLine(includes, '#include "inox/value.h"')
  }

  if (cModuleDeclarationLinesReferenceName(declarationLines, 'inox_loop')) {
    pushUniqueCModuleLine(includes, '#include "inox/loop.h"')
  }

  const libraryIncludes = emitLibraryCPreludeIncludeLines(
    resolveLibraryRuntimeCPreludeIncludes(runtimeRequirements, libraries)
  )

  for (let index = 0; index < libraryIncludes.length; index = index + 1) {
    pushUniqueCModuleLine(includes, libraryIncludes[index])
  }

  return filterCModuleHeaderIncludeLines(includes, declarationLines)
}

function filterCModuleHeaderIncludeLines(includes: string[], declarationLines: string[]): string[] {
  const combined: string[] = []

  pushCModuleLines(combined, includes)
  pushCModuleLines(combined, declarationLines)

  const filtered = filterUnusedCPreludeIncludes(joinStrings(combined, '\n')).split('\n')
  const result: string[] = []

  for (let index = 0; index < filtered.length; index = index + 1) {
    const line = filtered[index]

    if (line.startsWith('#include ')) {
      result.push(line)
    }
  }

  return result
}

function collectCModuleInlineHeaderProgram(plan: CModulePlan): ProgramNode {
  const body: AnyNode[] = []
  const functions = collectCModuleExportedFunctions(plan)

  for (let index = 0; index < functions.length; index = index + 1) {
    const item = functions[index]

    if (isCModuleInlineFunction(plan, item.name)) {
      body.push(item)
    }
  }

  const classes = collectIrTopLevelNodes(plan.ir, 'class')

  for (let classIndex = 0; classIndex < classes.length; classIndex = classIndex + 1) {
    const item = classes[classIndex]

    if (item.exported !== true) {
      continue
    }

    const methodNodes: AnyNode[] = []
    for (let methodIndex = 0; methodIndex < item.methods.length; methodIndex = methodIndex + 1) {
      const method = item.methods[methodIndex]

      if (method.inline === true) {
        methodNodes.push(method)
      } else {
        methodNodes.push({
          ...method,
          body: []
        })
      }
    }

    for (let fieldIndex = 0; fieldIndex < item.fields.length; fieldIndex = fieldIndex + 1) {
      body.push(item.fields[fieldIndex])
    }

    for (let methodIndex = 0; methodIndex < methodNodes.length; methodIndex = methodIndex + 1) {
      body.push(methodNodes[methodIndex])
    }
  }

  return {
    type: 'HirProgram',
    body
  }
}

function pushUniqueCModuleLine(lines: string[], line: string): void {
  if (!cModuleLinesInclude(lines, line)) {
    lines.push(line)
  }
}

function cModuleLinesInclude(lines: string[], expected: string): boolean {
  for (let index = 0; index < lines.length; index = index + 1) {
    if (lines[index] === expected) {
      return true
    }
  }

  return false
}

function cModuleHeaderDeclarationsNeedValue(lines: string[]): boolean {
  const valueTypes = [
    'inox_value',
    'inox_status',
    'inox_number',
    'inox_ref',
    'inox_allocator',
    'inox_number_value',
    'inox_boolean_value',
    'inox_undefined_value',
    'inox_null_value'
  ]

  for (let index = 0; index < valueTypes.length; index = index + 1) {
    if (cModuleDeclarationLinesReferenceName(lines, valueTypes[index])) {
      return true
    }
  }

  for (let index = 0; index < lines.length; index = index + 1) {
    if (lines[index].includes('inox::Value')) {
      return true
    }
  }

  return false
}

function filterCModuleIncludesProvidedByHeader(lines: string[], headerIncludes: string[]): string[] {
  const filtered: string[] = []

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex = lineIndex + 1) {
    const line = lines[lineIndex]
    let provided = false

    for (let includeIndex = 0; includeIndex < headerIncludes.length; includeIndex = includeIndex + 1) {
      if (line === headerIncludes[includeIndex]) {
        provided = true
        break
      }
    }

    if (!provided) {
      filtered.push(line)
    }
  }

  return filtered
}

function addCModuleNativeDeclarationRuntimeRequirements(
  requirements: Set<IrRuntimeRequirement>,
  declarationLines: string[],
  libraries: CCompilerLibrarySet | null | undefined
): void {
  if (libraries === null || typeof libraries === 'undefined') {
    return
  }

  const nativeTypes = cCompilerLibrarySetValue(libraries).nativeTypes

  for (let typeIndex = 0; typeIndex < nativeTypes.length; typeIndex = typeIndex + 1) {
    const nativeType = nativeTypes[typeIndex]

    if (!cModuleDeclarationLinesReferenceName(declarationLines, nativeType.cppType)) {
      continue
    }

    for (
      let requirementIndex = 0;
      requirementIndex < nativeType.runtimeRequirements.length;
      requirementIndex = requirementIndex + 1
    ) {
      requirements.add(nativeType.runtimeRequirements[requirementIndex])
    }
  }
}

function addCModuleImplementationNativeRuntimeRequirements(
  requirements: Set<IrRuntimeRequirement>,
  context: CEmitContext,
  moduleValues: CModuleValueDeclaration[],
  libraries: CCompilerLibrarySet | null | undefined
): void {
  if (libraries === null || typeof libraries === 'undefined') {
    return
  }

  const seen: Set<CObjectShape> = new Set()

  for (const shape of context.functionReturnShapes.values()) {
    addCModuleNativeShapeRuntimeRequirements(requirements, shape, libraries, seen)
  }

  for (const params of context.functionParams.values()) {
    for (let paramIndex = 0; paramIndex < params.length; paramIndex = paramIndex + 1) {
      addCModuleNativeShapeRuntimeRequirements(requirements, params[paramIndex].shape, libraries, seen)
    }
  }

  for (let valueIndex = 0; valueIndex < moduleValues.length; valueIndex = valueIndex + 1) {
    const value = moduleValues[valueIndex]

    addCModuleNativeCppTypeRuntimeRequirements(requirements, value.cppType, libraries)
    addCModuleNativeShapeRuntimeRequirements(requirements, value.shape, libraries, seen)
  }
}

function addCModuleNativeCppTypeRuntimeRequirements(
  requirements: Set<IrRuntimeRequirement>,
  cppType: string | null | undefined,
  libraries: CCompilerLibrarySet
): void {
  if (cppType === null || typeof cppType === 'undefined') {
    return
  }

  const nativeRequirements = compilerLibraryNativeRuntimeRequirementsForCppType(libraries, cppType)

  for (let index = 0; index < nativeRequirements.length; index = index + 1) {
    requirements.add(nativeRequirements[index])
  }
}

function addCModuleNativeShapeRuntimeRequirements(
  requirements: Set<IrRuntimeRequirement>,
  shape: CObjectShape | null | undefined,
  libraries: CCompilerLibrarySet,
  seen: Set<CObjectShape>
): void {
  if (shape === null || typeof shape === 'undefined' || seen.has(shape)) {
    return
  }

  seen.add(shape)

  if (shape.libraryTypeId !== null && typeof shape.libraryTypeId !== 'undefined') {
    const nativeRequirements = compilerLibraryNativeRuntimeRequirementsForId(libraries, shape.libraryTypeId)

    for (let index = 0; index < nativeRequirements.length; index = index + 1) {
      requirements.add(nativeRequirements[index])
    }
  }

  const fields: CObjectShapeField[] = shape.fields ?? []

  for (let index = 0; index < fields.length; index = index + 1) {
    addCModuleNativeShapeRuntimeRequirements(requirements, fields[index].shape, libraries, seen)
  }
}

function joinCModuleLines(lines: string[]): string {
  let result = ''

  for (let index = 0; index < lines.length; index = index + 1) {
    if (index > 0) {
      result = `${result}\n`
    }

    result = `${result}${lines[index]}`
  }

  return `${result}\n`
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

function emitCModuleDeclarations(
  lines: string[],
  plan: CModulePlan,
  functions: AnyNode[],
  classMethods: CClassMethod[],
  context: CEmitContext,
  deps: CModuleEmissionDependencies
): void {
  const arrowCallbackWrappers: CRuntimeArrowCallbackWrapper[] = []
  const asyncResultChainCallbackWrappers: CAsyncResultChainWrapper[] = []

  for (const wrapper of context.callbackWrappers.values()) {
    if (wrapper.kind === 'arrow' && isRuntimeArrowCallbackWrapperWithContext(wrapper)) {
      arrowCallbackWrappers.push(wrapper)
    }
  }

  for (const wrapper of context.asyncResultChainWrappers.values()) {
    if (isAsyncResultChainCallbackWrapperWithContext(wrapper)) {
      asyncResultChainCallbackWrappers.push(wrapper)
    }
  }

  for (const wrapper of context.asyncTaskWrappers.values()) {
    pushCModuleLines(lines, emitAsyncTaskFrameType(wrapper, context.libraries))
    lines.push('')
  }

  for (let wrapperIndex = 0; wrapperIndex < arrowCallbackWrappers.length; wrapperIndex = wrapperIndex + 1) {
    const wrapper = arrowCallbackWrappers[wrapperIndex]

    pushCModuleLines(lines, emitRuntimeArrowCallbackContextType(wrapper))
    lines.push('')
  }

  for (let wrapperIndex = 0; wrapperIndex < asyncResultChainCallbackWrappers.length; wrapperIndex = wrapperIndex + 1) {
    const wrapper = asyncResultChainCallbackWrappers[wrapperIndex]

    pushCModuleLines(lines, emitRuntimeArrowCallbackContextType(wrapper))
    lines.push('')
  }

  const functionPrototypeNames = collectCModuleNeededFunctionPrototypeNames(functions, classMethods, context)
  let emittedClassMethodPrototype = false

  for (let functionIndex = 0; functionIndex < functions.length; functionIndex = functionIndex + 1) {
    const item = functions[functionIndex]

    if (!functionPrototypeNames.has(item.name)) {
      continue
    }

    lines.push(emitCModuleFunctionPrototype(plan, item, context, deps))
  }

  for (let methodIndex = 0; methodIndex < classMethods.length; methodIndex = methodIndex + 1) {
    const item = classMethods[methodIndex]

    if (!item.info.native) {
      lines.push(deps.emitClassMethodPrototype(item.info, item.method, context))
      emittedClassMethodPrototype = true
    }
  }

  for (const wrapper of context.asyncTaskWrappers.values()) {
    pushCModuleLines(lines, emitAsyncTaskWrapperPrototypes(wrapper, context.libraries))
  }

  for (const wrapper of context.callbackWrappers.values()) {
    if (wrapper.kind === 'plain-arrow') {
      lines.push(`${emitPlainArrowCallbackWrapperHead(wrapper)};`)
      continue
    }

    if (wrapper.kind === 'arrow' && isRuntimeArrowCallbackWrapperWithContext(wrapper)) {
      lines.push(`static void ${wrapper.finalizerName}(void* context);`)
    }

    lines.push(`${emitRuntimeCallbackWrapperHead(wrapper)};`)
  }

  for (const wrapper of context.asyncResultChainWrappers.values()) {
    if (isAsyncResultChainCallbackWrapperWithContext(wrapper)) {
      lines.push(`static void ${wrapper.finalizerName}(void* context);`)
    }

    lines.push(`${emitAsyncResultChainCallbackWrapperHead(wrapper)};`)
  }

  if (
    functionPrototypeNames.size > 0 ||
    emittedClassMethodPrototype ||
    context.asyncTaskWrappers.size > 0 ||
    context.callbackWrappers.size > 0 ||
    context.asyncResultChainWrappers.size > 0
  ) {
    lines.push('')
  }
}

function collectCModuleNeededFunctionPrototypeNames(
  functions: AnyNode[],
  classMethods: CClassMethod[],
  context: CEmitContext
): Set<string> {
  const prototypeNames = new Set<string>()
  const functionNames = collectCModuleFunctionNames(functions)
  const functionIndexes = collectCModuleFunctionIndexes(functions)

  for (const adapter of context.functionPointerAdapters) {
    for (const name of cFunctionPointerAdapterTargetSourceNames(adapter, context)) {
      if (functionNames.has(name)) {
        prototypeNames.add(name)
      }
    }
  }

  for (const wrapper of context.asyncTaskWrappers.values()) {
    collectCReferencedFunctionPrototypeNames(wrapper, functionNames, prototypeNames)
  }

  for (const wrapper of context.callbackWrappers.values()) {
    if (wrapper.kind === 'named' && functionNames.has(wrapper.target)) {
      prototypeNames.add(wrapper.target)
    }

    collectCReferencedFunctionPrototypeNames(wrapper, functionNames, prototypeNames)
  }

  for (const wrapper of context.asyncResultChainWrappers.values()) {
    collectCReferencedFunctionPrototypeNames(wrapper, functionNames, prototypeNames)
  }

  for (const info of context.classInfos.values()) {
    if (info.constructor !== null && typeof info.constructor !== 'undefined') {
      collectCReferencedFunctionPrototypeNames(info.constructor, functionNames, prototypeNames)
    }
  }

  for (let index = 0; index < classMethods.length; index = index + 1) {
    const method = classMethods[index]

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

function collectCModuleFunctionNames(functions: AnyNode[]): Set<string> {
  const names = new Set<string>()

  for (let index = 0; index < functions.length; index = index + 1) {
    names.add(functions[index].name)
  }

  return names
}

function collectCModuleFunctionIndexes(functions: AnyNode[]): Map<string, number> {
  const indexes = new Map<string, number>()

  for (let index = 0; index < functions.length; index = index + 1) {
    indexes.set(functions[index].name, index)
  }

  return indexes
}

function emitCModuleUnhandledRejectionFlagDefinition(_lines: string[], context: CEmitContext): void {
  if (context.unhandledRejectionFlag === null || typeof context.unhandledRejectionFlag === 'undefined') {
    return
  }
}

function emitCModuleFunctionPrototype(
  plan: CModulePlan,
  statement: AnyNode,
  context: CEmitContext,
  deps: CModuleEmissionDependencies
): string {
  const head = deps.emitFunctionHead(statement, context)

  if (isCModuleExportedFunction(plan, statement.name)) {
    return `${head};`
  }

  const prefix = isCModuleInlineFunction(plan, statement.name) ? 'static inline ' : 'static '

  return `${prefix}${head};`
}

function emitCModuleFunctionDeclaration(
  plan: CModulePlan,
  statement: AnyNode,
  context: CEmitContext,
  deps: CModuleEmissionDependencies
): string[] {
  const lines = deps.emitFunctionDeclaration(statement, context, deps.declarationEmissionDependencies)

  if (isCModuleExportedFunction(plan, statement.name)) {
    return lines
  }

  const prefix = isCModuleInlineFunction(plan, statement.name) ? 'static inline ' : 'static '

  return prefixCModuleFunctionDeclaration(lines, prefix)
}

function prefixCModuleFunctionDeclaration(lines: string[], prefix: string): string[] {
  const prefixed: string[] = []

  for (let index = 0; index < lines.length; index = index + 1) {
    const line = lines[index]

    if (index === 0 && !line.startsWith('static ')) {
      prefixed.push(`${prefix}${line}`)
      continue
    }

    prefixed.push(line)
  }

  return prefixed
}

function cModuleHasExportedInlineFunction(plan: CModulePlan): boolean {
  for (
    let declarationIndex = 0;
    declarationIndex < plan.ir.functionDeclarations.length;
    declarationIndex = declarationIndex + 1
  ) {
    const declaration = plan.ir.functionDeclarations[declarationIndex]

    if (declaration.exported && declaration.inline === true) {
      return true
    }
  }

  return false
}

function cModuleHasHeaderDefinition(plan: CModulePlan, context: CEmitContext): boolean {
  return cModuleHasExportedInlineFunction(plan) || collectCModuleHeaderClassNames(context).size > 0
}

function isCModuleExportedInlineFunction(plan: CModulePlan, name: string): boolean {
  for (
    let declarationIndex = 0;
    declarationIndex < plan.ir.functionDeclarations.length;
    declarationIndex = declarationIndex + 1
  ) {
    const declaration = plan.ir.functionDeclarations[declarationIndex]

    if (declaration.name === name) {
      return declaration.exported && declaration.inline === true
    }
  }

  return false
}

function isCModuleInlineFunction(plan: CModulePlan, name: string): boolean {
  for (
    let declarationIndex = 0;
    declarationIndex < plan.ir.functionDeclarations.length;
    declarationIndex = declarationIndex + 1
  ) {
    const declaration = plan.ir.functionDeclarations[declarationIndex]

    if (declaration.name === name) {
      return declaration.inline === true
    }
  }

  return false
}

function isCModuleExportedFunction(plan: CModulePlan, name: string): boolean {
  for (
    let declarationIndex = 0;
    declarationIndex < plan.ir.functionDeclarations.length;
    declarationIndex = declarationIndex + 1
  ) {
    const declaration = plan.ir.functionDeclarations[declarationIndex]

    if (declaration.name === name) {
      return declaration.exported
    }
  }

  return false
}

function emitCModuleFunctionPointerAdapterDefinitions(lines: string[], context: CEmitContext): void {
  if (context.functionPointerAdapters.length === 0) {
    return
  }

  const moduleObjectFunctionFields: Set<string> = new Set()
  const moduleObjectFunctionFieldInfos: FunctionPointerParamInfo[] = []
  const runtimeModuleObjectFunctionFields: Set<string> = new Set()

  for (const adapter of context.functionPointerAdapters) {
    pushCModuleLines(
      lines,
      emitCModuleFunctionPointerAdapterDefinition(
        adapter,
        context,
        moduleObjectFunctionFields,
        moduleObjectFunctionFieldInfos,
        runtimeModuleObjectFunctionFields
      )
    )
    lines.push('')
  }
}

function emitCModuleFunctionPointerAdapterDefinition(
  adapter: CFunctionPointerAdapter,
  context: CEmitContext,
  moduleObjectFunctionFields: Set<string>,
  moduleObjectFunctionFieldInfos: FunctionPointerParamInfo[],
  runtimeModuleObjectFunctionFields: Set<string>
): string[] {
  const lines = [`${emitCModuleFunctionPointerAdapterHead(adapter)} {`]
  const bridgeLines: string[] = []
  const cleanupLines: string[] = []
  const expectedNames = collectFunctionPointerParamNames(adapter.functionType, adapter.seenTypes)
  const expectedInfos = collectFunctionPointerParamInfos(adapter.functionType, adapter.seenTypes)
  const targetFunctionType = functionPointerAdapterTargetFunctionType(adapter, context)
  const targetSeenTypes = functionPointerAdapterTargetSeenTypes(adapter, context)
  const targetNames = collectFunctionPointerParamNames(targetFunctionType, targetSeenTypes)
  const targetInfos = collectFunctionPointerParamInfos(targetFunctionType, targetSeenTypes)
  const targetNameSet = stringSetFromArray(targetNames)
  const targetArgs = emitFunctionPointerAdapterTargetArgs(
    adapter,
    expectedNames,
    targetNames,
    moduleObjectFunctionFields,
    moduleObjectFunctionFieldInfos,
    targetFunctionType,
    expectedInfos,
    targetInfos,
    context,
    bridgeLines,
    cleanupLines
  )

  for (const name of expectedNames) {
    if (!targetNameSet.has(name)) {
      lines.push(`  (void)${name};`)
    }
  }

  pushCModuleLines(lines, bridgeLines)

  if (runtimeModuleObjectFunctionFields.has(adapter.target)) {
    pushCModuleLines(lines, emitRuntimeFunctionPointerAdapterTargetCall(adapter, targetFunctionType))
    lines.push('}')

    return lines
  }

  if (isThrowingFunctionPointerAdapterTarget(adapter, context)) {
    pushCModuleLines(
      lines,
      emitThrowingFunctionPointerAdapterTargetCall(adapter, targetArgs, targetFunctionType, cleanupLines)
    )
    lines.push('}')

    return lines
  }

  const call = `${adapter.target}(${joinStrings(targetArgs, ', ')})`
  pushCModuleLines(
    lines,
    emitFunctionPointerAdapterResultLines(
      adapter.functionType,
      targetFunctionType,
      context.libraries,
      call,
      cleanupLines,
      context.diagnostics
    )
  )

  lines.push('}')

  return lines
}

function emitRuntimeFunctionPointerAdapterTargetCall(
  adapter: CFunctionPointerAdapter,
  targetFunctionType: CFunctionType | null | undefined
): string[] {
  const lines: string[] = []
  const args = runtimeFunctionPointerAdapterArgs(adapter, targetFunctionType)

  if (args.length > 0) {
    lines.push(`  inox_value inox_adapter_args[] = { ${joinStrings(args, ', ')} };`)
  }

  lines.push('  inox_value inox_adapter_result = inox_undefined_value();')

  if (args.length > 0) {
    lines.push(
      `  inox_status inox_adapter_status = inox_callback_call(${adapter.target}, inox_adapter_args, ${args.length}, &inox_adapter_result);`
    )
  } else {
    lines.push(`  inox_status inox_adapter_status = inox_callback_call(${adapter.target}, 0, 0, &inox_adapter_result);`)
  }

  lines.push('  if (inox_adapter_status != INOX_OK) {')
  lines.push('    inox_release(inox_adapter_result);')

  const returnType = emitFunctionPointerReturnType(adapter.functionType)

  if (returnType === 'void') {
    lines.push('    return;')
  } else {
    lines.push(`    return ${cFunctionPointerAdapterDefaultReturnValue(returnType)};`)
  }

  lines.push('  }')
  pushCModuleLines(lines, emitRuntimeFunctionPointerAdapterReturn(adapter.functionType))

  return lines
}

function runtimeFunctionPointerAdapterArgs(
  adapter: CFunctionPointerAdapter,
  targetFunctionType: CFunctionType | null | undefined
): string[] {
  const args: string[] = []

  if (targetFunctionType === null || typeof targetFunctionType === 'undefined') {
    return args
  }

  for (let index = 0; index < targetFunctionType.params.length; index = index + 1) {
    const targetParam = targetFunctionType.params[index]
    let value: string | null = null
    let sourceParam = targetParam

    if (index < adapter.functionType.params.length) {
      const declaredSourceParam = adapter.functionType.params[index]

      if (declaredSourceParam === null || typeof declaredSourceParam === 'undefined') {
        continue
      }

      value = `inox_arg_${index}`
      sourceParam = declaredSourceParam
    } else {
      value = emitFunctionPointerAdapterDefaultTargetArg(`inox_arg_${index}`, adapter, targetFunctionType)
    }

    if (value === null || typeof value === 'undefined') {
      value = 'inox_undefined_value()'
    }

    args.push(runtimeFunctionPointerAdapterArgValue(value, sourceParam))
  }

  return args
}

function runtimeFunctionPointerAdapterArgValue(value: string, param: CFunctionParam): string {
  if (param.nullable === true) {
    return value
  }

  if (param.valueType === 'number') {
    return `inox_number_value(${value})`
  }

  if (param.valueType === 'boolean') {
    return `inox_bool_value((${value}) != 0)`
  }

  return value
}

function emitRuntimeFunctionPointerAdapterReturn(functionType: CFunctionType): string[] {
  const lines: string[] = []

  if (functionType.returnType === 'void') {
    lines.push('  inox_release(inox_adapter_result);')
    lines.push('  return;')
    return lines
  }

  if (functionType.returnType === 'number') {
    lines.push('  if (inox_adapter_result.tag != INOX_TAG_NUMBER) {')
    lines.push('    inox_release(inox_adapter_result);')
    lines.push('    return 0;')
    lines.push('  }')
    lines.push('  double inox_adapter_number = inox_adapter_result.as.number;')
    lines.push('  inox_release(inox_adapter_result);')
    lines.push('  return inox_adapter_number;')
    return lines
  }

  if (functionType.returnType === 'boolean') {
    lines.push('  if (inox_adapter_result.tag != INOX_TAG_BOOL) {')
    lines.push('    inox_release(inox_adapter_result);')
    lines.push('    return 0;')
    lines.push('  }')
    lines.push('  double inox_adapter_boolean = inox_adapter_result.as.boolean ? 1 : 0;')
    lines.push('  inox_release(inox_adapter_result);')
    lines.push('  return inox_adapter_boolean;')
    return lines
  }

  lines.push('  return inox_adapter_result;')
  return lines
}

function functionPointerAdapterTargetSeenTypes(adapter: CFunctionPointerAdapter, context: CEmitContext): string[] {
  if (isPlainArrowFunctionPointerAdapterTarget(adapter, context)) {
    return []
  }

  if (cFunctionPointerAdapterTargetSourceNames(adapter, context).length > 0) {
    return []
  }

  return adapter.targetSeenTypes
}

function functionPointerAdapterTargetFunctionType(
  adapter: CFunctionPointerAdapter,
  context: CEmitContext
): CFunctionType | null | undefined {
  for (const wrapper of context.callbackWrappers.values()) {
    if (wrapper.kind === 'plain-arrow' && wrapper.name === adapter.target) {
      return wrapper.functionType
    }
  }

  for (const sourceName of cFunctionPointerAdapterTargetSourceNames(adapter, context)) {
    const functionType = functionPointerAdapterContextFunctionType(sourceName, context)

    if (functionType !== null) {
      return functionType
    }
  }

  return adapter.targetFunctionType
}

function functionPointerAdapterContextFunctionType(name: string, context: CEmitContext): CFunctionType | null {
  const params = context.functionParams.get(name)
  const returnType = context.functionReturnTypes.get(name)

  if (params === null || typeof params === 'undefined' || returnType === null || typeof returnType === 'undefined') {
    return null
  }

  return {
    declaredReturnType: context.functionReturnDeclaredTypes.get(name) ?? null,
    kind: 'function',
    params,
    returnTypeRef: cTypeRefMapValue(context.functionReturnTypeRefs, name),
    returnRuntimeTypeAlternatives: context.functionReturnRuntimeTypeAlternatives.get(name) ?? null,
    returnNullable: context.functionReturnNullables.get(name) === true,
    returnAsyncResultValueType: context.functionReturnAsyncResultValueTypes.get(name) ?? null,
    returnShape: context.functionReturnShapes.get(name) ?? null,
    returnType
  }
}

function isPlainArrowFunctionPointerAdapterTarget(adapter: CFunctionPointerAdapter, context: CEmitContext): boolean {
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

function isThrowingFunctionPointerAdapterTarget(adapter: CFunctionPointerAdapter, context: CEmitContext): boolean {
  for (const sourceName of cFunctionPointerAdapterTargetSourceNames(adapter, context)) {
    if (context.throwingFunctions.has(sourceName)) {
      return true
    }
  }

  return false
}

function cFunctionPointerAdapterTargetSourceNames(adapter: CFunctionPointerAdapter, context: CEmitContext): string[] {
  const names: string[] = []

  for (const name of context.functionNames.keys()) {
    const target = context.functionNames.get(name)

    if (target === adapter.target) {
      names.push(name)
    }
  }

  return names
}

function emitThrowingFunctionPointerAdapterTargetCall(
  adapter: CFunctionPointerAdapter,
  targetArgs: string[],
  targetFunctionType: CFunctionType | null | undefined,
  cleanupLines: string[]
): string[] {
  const lines: string[] = []
  const adapterReturnType = emitFunctionPointerReturnType(adapter.functionType)
  const returnType = emitFunctionPointerReturnType(targetFunctionType)
  const call = `${adapter.target}(${joinStrings(targetArgs, ', ')})`

  if (returnType !== 'void') {
    lines.push(`  ${returnType} inox_adapter_result = ${call};`)
  } else {
    lines.push(`  ${call};`)
  }

  pushCModuleLines(lines, cleanupLines)
  lines.push('  if (inox::thrown()) {')

  if (adapterReturnType === 'void') {
    lines.push('    return;')
  } else {
    lines.push(`    return ${cFunctionPointerAdapterDefaultReturnValue(adapterReturnType)};`)
  }

  lines.push('  }')

  if (adapterReturnType !== 'void') {
    lines.push(`  return ${throwingFunctionPointerAdapterReturnExpression(adapterReturnType, returnType)};`)
  }

  return lines
}

function throwingFunctionPointerAdapterReturnExpression(adapterReturnType: string, targetReturnType: string): string {
  if (targetReturnType !== 'void') {
    return 'inox_adapter_result'
  }

  return cFunctionPointerAdapterDefaultReturnValue(adapterReturnType)
}

function cFunctionPointerAdapterDefaultReturnValue(returnType: string): string {
  if (returnType === 'inox_value') {
    return 'inox_undefined_value()'
  }

  return '{}'
}

function emitFunctionPointerAdapterTargetArgs(
  adapter: CFunctionPointerAdapter,
  expectedNames: string[],
  targetNames: string[],
  moduleObjectFunctionFields: Set<string>,
  moduleObjectFunctionFieldInfos: FunctionPointerParamInfo[],
  targetFunctionType: CFunctionType | null | undefined,
  expectedInfos: FunctionPointerParamInfo[],
  targetInfos: FunctionPointerParamInfo[],
  context: CEmitContext,
  bridgeLines: string[],
  cleanupLines: string[]
): string[] {
  const expectedNameSet = stringSetFromArray(expectedNames)
  const args: string[] = []

  for (const name of targetNames) {
    if (expectedNameSet.has(name)) {
      const value = emitFunctionPointerAdapterRuntimeBridgeArg(
        name,
        expectedInfos,
        targetInfos,
        adapter,
        context,
        bridgeLines,
        cleanupLines
      )
      args.push(emitFunctionPointerNativeBoundaryArgument(name, value, adapter.functionType, targetFunctionType))
      continue
    }

    const moduleObjectFunctionField = emitFunctionPointerAdapterModuleObjectFieldArg(name, moduleObjectFunctionFields)

    if (moduleObjectFunctionField !== null && typeof moduleObjectFunctionField !== 'undefined') {
      args.push(
        emitFunctionPointerAdapterRuntimeBridgeForInfos(
          moduleObjectFunctionField,
          functionPointerPointerParamInfoForName(moduleObjectFunctionFieldInfos, moduleObjectFunctionField),
          functionPointerParamInfoForName(targetInfos, name),
          adapter,
          context,
          bridgeLines,
          cleanupLines
        )
      )
      continue
    }

    const defaultArg = emitFunctionPointerAdapterDefaultTargetArg(name, adapter, targetFunctionType)

    if (defaultArg !== null && typeof defaultArg !== 'undefined') {
      args.push(defaultArg)
      continue
    }

    args.push(name)
  }

  return args
}

function emitFunctionPointerAdapterRuntimeBridgeArg(
  name: string,
  expectedInfos: FunctionPointerParamInfo[],
  targetInfos: FunctionPointerParamInfo[],
  adapter: CFunctionPointerAdapter,
  context: CEmitContext,
  bridgeLines: string[],
  cleanupLines: string[]
): string {
  const expectedInfo = functionPointerParamInfoForName(expectedInfos, name)
  const targetInfo = functionPointerParamInfoForName(targetInfos, name)

  return emitFunctionPointerAdapterRuntimeBridgeForInfos(
    name,
    expectedInfo,
    targetInfo,
    adapter,
    context,
    bridgeLines,
    cleanupLines
  )
}

function emitFunctionPointerAdapterRuntimeBridgeForInfos(
  name: string,
  expectedInfo: FunctionPointerParamInfo | null,
  targetInfo: FunctionPointerParamInfo | null,
  adapter: CFunctionPointerAdapter,
  context: CEmitContext,
  bridgeLines: string[],
  cleanupLines: string[]
): string {
  if (!functionPointerParamNeedsRuntimeBridge(expectedInfo, targetInfo)) {
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
  const bridgeIndex = bridgeLines.length
  const bridgeContext = `inox_adapter_callback_context_${bridgeIndex}`
  const bridgeValue = `inox_adapter_callback_${bridgeIndex}`
  const adapterReturnType = emitFunctionPointerReturnType(adapter.functionType)
  const failureReturn =
    adapterReturnType === 'void' ? 'return;' : `return ${cFunctionPointerAdapterDefaultReturnValue(adapterReturnType)};`

  bridgeLines.push(
    `  ${runtimeAdapter.contextTypeName}* ${bridgeContext} = (${runtimeAdapter.contextTypeName}*)inox_default_alloc(0, sizeof(${runtimeAdapter.contextTypeName}), _Alignof(${runtimeAdapter.contextTypeName}));`
  )
  bridgeLines.push(`  if (${bridgeContext} == 0) ${failureReturn}`)
  bridgeLines.push(`  ${bridgeContext}->target = ${name};`)
  bridgeLines.push(`  inox_value ${bridgeValue} = inox_undefined_value();`)
  bridgeLines.push(
    `  if (inox_callback_new(&inox_default_allocator, ${runtimeAdapter.callbackName}, ${bridgeContext}, ${runtimeAdapter.finalizerName}, &${bridgeValue}) != INOX_OK) {`
  )
  bridgeLines.push(`    ${runtimeAdapter.finalizerName}(${bridgeContext});`)
  bridgeLines.push(`    ${failureReturn}`)
  bridgeLines.push('  }')
  cleanupLines.push(`  inox_release(${bridgeValue});`)

  return bridgeValue
}

function functionPointerParamNeedsRuntimeBridge(
  expectedInfo: FunctionPointerParamInfo | null,
  targetInfo: FunctionPointerParamInfo | null
): boolean {
  return (
    expectedInfo !== null &&
    expectedInfo.functionType !== null &&
    !expectedInfo.runtimeFunction &&
    targetInfo !== null &&
    targetInfo.runtimeFunction
  )
}

function functionPointerParamInfoForName(
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

function functionPointerPointerParamInfoForName(
  infos: FunctionPointerParamInfo[],
  name: string
): FunctionPointerParamInfo | null {
  for (const info of infos) {
    if (info.name === name && !info.runtimeFunction) {
      return info
    }
  }

  return null
}

function emitFunctionPointerAdapterModuleObjectFieldArg(
  name: string,
  moduleObjectFunctionFields: Set<string>
): string | null {
  const prefix = 'inox_objfn_inox_arg_'

  if (!name.startsWith(prefix)) {
    return null
  }

  let index = prefix.length

  while (index < name.length) {
    const code = name.charCodeAt(index)

    if (code < 48 || code > 57) {
      break
    }

    index = index + 1
  }

  if (index === prefix.length || name[index] !== '_') {
    return null
  }

  const candidate = `inox_objfn_${name.slice(index + 1)}`

  if (moduleObjectFunctionFields.has(candidate)) {
    return candidate
  }

  return null
}

function emitFunctionPointerAdapterDefaultTargetArg(
  name: string,
  adapter: CFunctionPointerAdapter,
  targetFunctionType: CFunctionType | null | undefined
): string | null {
  if (targetFunctionType === null || typeof targetFunctionType === 'undefined') {
    return null
  }

  for (let index = adapter.functionType.params.length; index < targetFunctionType.params.length; index = index + 1) {
    if (name !== `inox_arg_${index}`) {
      continue
    }

    const param = targetFunctionType.params[index]

    if (param === null || typeof param === 'undefined') {
      continue
    }

    if (param.optional !== true && (param.defaultValue === null || typeof param.defaultValue === 'undefined')) {
      return null
    }

    return emitFunctionPointerAdapterDefaultParamValue(param)
  }

  return null
}

function emitFunctionPointerAdapterDefaultParamValue(param: CFunctionParam): string {
  const value = param.defaultValue

  if (value !== null && typeof value !== 'undefined') {
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

function emitCModuleFunctionPointerAdapterHead(adapter: CFunctionPointerAdapter): string {
  return `static ${emitFunctionPointerReturnType(adapter.functionType)} ${adapter.name}(${emitFunctionPointerNamedParams(
    adapter.functionType,
    adapter.seenTypes
  )})`
}

function createCModuleBaseContext(
  plan: CModulePlan,
  diagnostics: Diagnostic[],
  deps: CModuleEmissionDependencies,
  libraries?: CCompilerLibrarySet
): CEmitContext {
  const ir = plan.ir
  const irPrograms = [ir]
  const importedDeclarations = collectCModuleImportedFunctionDeclarations(plan)
  const functionEntries = collectCModuleFunctionNodeEntries(plan, irPrograms)
  const functions: AnyNode[] = []
  const functionDeclarations = collectIrFunctionDeclarations(irPrograms)
  const globalRoots = collectIrGlobalRoots(irPrograms)
  const jsGlobalRoots = stringSetFromArray(globalRoots)

  for (let entryIndex = 0; entryIndex < functionEntries.length; entryIndex = entryIndex + 1) {
    const entry = functionEntries[entryIndex]

    functions.push(entry.node)
  }

  for (
    let declarationIndex = 0;
    declarationIndex < importedDeclarations.length;
    declarationIndex = declarationIndex + 1
  ) {
    const declaration = importedDeclarations[declarationIndex]

    pushIrFunctionDeclaration(functionDeclarations, declaration)
  }

  pushCModuleClassMethodFunctionDeclarations(functionDeclarations, irPrograms)

  const importedEffects = collectImportedCModuleFunctionEffects(plan)
  const inferredFunctionEffects = collectIrFunctionEffectsWithExternalEffects(irPrograms, importedEffects, true)
  const storedFunctionEffects = collectIrStoredFunctionEffects(irPrograms)
  const functionEffects = mergeIrFunctionEffects(inferredFunctionEffects, storedFunctionEffects)

  for (let effectIndex = 0; effectIndex < importedEffects.length; effectIndex = effectIndex + 1) {
    const effect = importedEffects[effectIndex]

    pushIrFunctionEffect(functionEffects, effect)
  }

  const context = deps.createBaseContext(
    diagnostics,
    functionDeclarations,
    functionEffects,
    jsGlobalRoots,
    ir.body,
    libraries
  )
  context.runtimeEntryPath = plan.relativeSourcePath
  const classNodes = collectIrTopLevelNodes(ir, 'class')

  context.classInfos = createClassInfos(classNodes, diagnostics, plan.classSymbolNames)
  registerImportedCModuleClassInfos(context, plan, diagnostics)

  registerCModuleValueDeclarations(context, plan)
  registerImportedCModuleValueDeclarations(context, plan)

  context.functionNames = createCModuleFunctionNames(plan)
  context.externalEventLoopFunctions = collectCModuleExternalEventLoopFunctionNames(plan, deps, new Map(), new Set())
  context.callbackWrappers = collectCallbackWrappers(irPrograms, context, deps.callbackLoweringDependencies)
  context.asyncResultChainWrappers = collectAsyncResultChainWrappers(
    irPrograms,
    context,
    deps.asyncResultChainLoweringDependencies
  )
  context.asyncTaskWrappers = collectAsyncTaskWrappers(functionEntries, context, deps.asyncTaskLoweringDependencies)

  return context
}

function registerImportedCModuleClassInfos(context: CEmitContext, plan: CModulePlan, diagnostics: Diagnostic[]): void {
  for (let importIndex = 0; importIndex < plan.imports.length; importIndex = importIndex + 1) {
    const item = plan.imports[importIndex]
    const importedModule = item.module
    const declaration = item.declaration

    if (
      importedModule === null ||
      typeof importedModule === 'undefined' ||
      declaration === null ||
      typeof declaration === 'undefined'
    ) {
      continue
    }

    const importedClassNodes = collectIrTopLevelNodes(importedModule.ir, 'class')
    const importedInfos = createClassInfos(importedClassNodes, diagnostics, importedModule.classSymbolNames)
    const specifiers: AnyNode[] = declaration.specifiers ?? []

    for (let specifierIndex = 0; specifierIndex < specifiers.length; specifierIndex = specifierIndex + 1) {
      const specifier = specifiers[specifierIndex]
      const importedInfo = importedInfos.get(specifier.imported)

      if (
        specifier.typeOnly === true ||
        importedInfo === null ||
        typeof importedInfo === 'undefined' ||
        importedInfo.node.exported !== true
      ) {
        continue
      }

      const names: string[] = [specifier.imported, specifier.local, cModuleImportedBindingName(declaration, specifier)]

      if (typeof specifier.className === 'string') {
        names.push(specifier.className)
      }

      for (let nameIndex = 0; nameIndex < names.length; nameIndex = nameIndex + 1) {
        const name = names[nameIndex]

        if (name === '' || context.classInfos.has(name)) {
          continue
        }

        context.classInfos.set(name, {
          ...importedInfo,
          name,
          imported: true
        })
      }
    }
  }
}

function collectCModuleContextRuntimeTypes(context: CModuleRuntimeTypeContext): Set<string> {
  const types: Set<string> = new Set()

  for (const valueType of context.functionReturnTypes.values()) {
    addCModuleRuntimeType(types, valueType)
  }

  for (const valueType of context.moduleValueTypes.values()) {
    addCModuleRuntimeType(types, valueType)
  }

  for (const params of context.functionParams.values()) {
    for (let paramIndex = 0; paramIndex < params.length; paramIndex = paramIndex + 1) {
      const param = params[paramIndex]

      collectCModuleFunctionParamRuntimeTypes(types, param, new Set())
    }
  }

  return types
}

function addCModuleRuntimeType(types: Set<string>, valueType: string): void {
  if (
    valueType === 'unknown' ||
    isManagedRuntimeReturnType(valueType) ||
    isOpaqueRuntimeValueType(valueType) ||
    valueType === 'async-result'
  ) {
    types.add(valueType)
  }
}

function collectCModuleFunctionParamRuntimeTypes(
  types: Set<string>,
  param: CFunctionParam,
  seen: Set<CObjectShapeField[]>
): void {
  addCModuleRuntimeType(types, param.valueType)

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
    collectCModuleObjectShapeRuntimeTypes(types, param.shape.fields, seen)
  }
}

function collectCModuleObjectShapeRuntimeTypes(
  types: Set<string>,
  fields: CObjectShapeField[],
  seen: Set<CObjectShapeField[]>
): void {
  if (seen.has(fields)) {
    return
  }

  seen.add(fields)

  for (let index = 0; index < fields.length; index = index + 1) {
    const field = fields[index]

    addCModuleRuntimeType(types, field.valueType)

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
      collectCModuleObjectShapeRuntimeTypes(types, field.shape.fields, seen)
    }
  }

  seen.delete(fields)
}

function registerCModuleValueDeclarations(context: CEmitContext, plan: CModulePlan): void {
  const values = collectCModuleStaticValueDeclarations(plan, context)

  for (let index = 0; index < values.length; index = index + 1) {
    const item = values[index]
    context.moduleValueNames.set(item.name, item.symbolName)
    context.moduleValueTypes.set(item.name, item.valueType)

    if (item.compileTimeInitializer !== null && typeof item.compileTimeInitializer !== 'undefined') {
      context.moduleCompileTimeValueInitializers.set(item.name, item.compileTimeInitializer)
    }

    if (cModuleValueDeclarationCType(item, context) === 'inox_value') {
      context.moduleRuntimeValueNames.add(item.name)
    }

    if (item.cppType !== null && typeof item.cppType !== 'undefined') {
      context.moduleValueCppTypes.set(item.name, item.cppType)
    }
  }
}

function registerImportedCModuleValueDeclarations(context: CEmitContext, plan: CModulePlan): void {
  for (let importIndex = 0; importIndex < plan.imports.length; importIndex = importIndex + 1) {
    const item = plan.imports[importIndex]
    const importedModule = item.module

    if (importedModule === null || typeof importedModule === 'undefined') {
      continue
    }

    const importDeclaration = item.declaration

    if (importDeclaration === null || typeof importDeclaration === 'undefined') {
      continue
    }

    const specifiersValue = importDeclaration.specifiers

    if (specifiersValue === null || typeof specifiersValue === 'undefined') {
      continue
    }

    const specifiers: CModuleNode[] = specifiersValue

    for (let specifierIndex = 0; specifierIndex < specifiers.length; specifierIndex = specifierIndex + 1) {
      const specifier = specifiers[specifierIndex]
      const exported = importedModule.record.exports.get(specifier.imported)

      if (exported === null || typeof exported === 'undefined' || exported.type !== 'VariableDeclaration') {
        continue
      }

      const localName = cModuleImportedBindingName(importDeclaration, specifier)

      if (specifier.local !== specifier.imported) {
        const syntheticName = specifier.syntheticValueImportName

        if (syntheticName !== null && typeof syntheticName !== 'undefined') {
          context.moduleValueNames.set(syntheticName, emitCModuleValueName(importedModule, specifier.imported))
          const valueType = cModuleValueType(exported)
          context.moduleValueTypes.set(syntheticName, valueType)
          registerImportedCModuleValueCppType(context, syntheticName, exported)

          if (
            valueType === 'unknown' ||
            isOpaqueRuntimeValueType(valueType) ||
            (valueType !== 'string' && isManagedRuntimeReturnType(valueType))
          ) {
            context.moduleRuntimeValueNames.add(syntheticName)
          }
        }

        continue
      }

      if (!context.moduleValueNames.has(localName)) {
        context.moduleValueNames.set(localName, emitCModuleValueName(importedModule, specifier.imported))
        const valueType = cModuleValueType(exported)
        context.moduleValueTypes.set(localName, valueType)
        registerImportedCModuleValueCppType(context, localName, exported)

        if (
          valueType === 'unknown' ||
          isOpaqueRuntimeValueType(valueType) ||
          (valueType !== 'string' && isManagedRuntimeReturnType(valueType))
        ) {
          context.moduleRuntimeValueNames.add(localName)
        }
      }
    }
  }
}

function registerImportedCModuleValueCppType(context: CEmitContext, name: string, exported: CModuleNode): void {
  const cppType = cModuleValueLibraryCppType(exported)

  if (cppType !== null) {
    context.moduleValueCppTypes.set(name, cppType)
  }
}

function collectCModuleExportedValueDeclarations(plan: CModulePlan): CModuleValueDeclaration[] {
  const values = collectCModuleValueDeclarations(plan)
  const exported: CModuleValueDeclaration[] = []

  for (let index = 0; index < values.length; index = index + 1) {
    const item = values[index]

    if (item.exported === true) {
      exported.push(item)
    }
  }

  return exported
}

function collectCModuleValueDeclarations(plan: CModulePlan, context?: CEmitContext): CModuleValueDeclaration[] {
  const values: CModuleValueDeclaration[] = []
  const ir = plan.ir
  const statements = collectIrTopLevelNodes(ir, 'statement')

  for (let index = 0; index < statements.length; index = index + 1) {
    const item = statements[index]

    if (item.type !== 'VariableDeclaration') {
      continue
    }

    const valueType = cModuleValueType(item, context)

    values.push({
      compileTimeInitializer: cModuleValueCompileTimeInitializer(item),
      cppType: cModuleValueLibraryCppType(item),
      declaredType: item.declaredType ?? item.inferredDeclaredType ?? null,
      exported: item.exported === true,
      functionType: cModuleValueFunctionType(item),
      name: item.name,
      shape: cObjectShapeFromMetadata(item.shape ?? item.init?.shape ?? null),
      shapeBuiltin: cModuleValueShapeBuiltin(item),
      symbolName: emitCModuleValueName(plan, item.name),
      valueType
    })
  }

  return values
}

function cModuleValueLibraryCppType(node: AnyNode): string | null {
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

function cModuleValueCompileTimeInitializer(node: AnyNode): string | null {
  if (node.exported === true || node.kind !== 'const') {
    return null
  }

  const init = node.init

  if (init === null || typeof init === 'undefined') {
    return null
  }

  if (init.type === 'NumberLiteral' && node.valueType === 'number') {
    return init.value
  }

  if (init.type === 'BooleanLiteral' && node.valueType === 'boolean') {
    return init.value === true ? 'true' : 'false'
  }

  return null
}

function collectCModuleCompileTimeValueDeclarations(values: CModuleValueDeclaration[]): CModuleValueDeclaration[] {
  const result: CModuleValueDeclaration[] = []

  for (let index = 0; index < values.length; index = index + 1) {
    const item = values[index]

    if (item.compileTimeInitializer !== null && typeof item.compileTimeInitializer !== 'undefined') {
      result.push(item)
    }
  }

  return result
}

function collectCModuleRuntimeValueDeclarations(values: CModuleValueDeclaration[]): CModuleValueDeclaration[] {
  const result: CModuleValueDeclaration[] = []

  for (let index = 0; index < values.length; index = index + 1) {
    const item = values[index]

    if (item.compileTimeInitializer === null || typeof item.compileTimeInitializer === 'undefined') {
      result.push(item)
    }
  }

  return result
}

function collectCModuleStaticValueDeclarations(plan: CModulePlan, context: CEmitContext): CModuleValueDeclaration[] {
  const values = collectCModuleValueDeclarations(plan, context)

  if (!plan.isEntry) {
    return values
  }

  const nestedReferences = collectCModuleNestedReferenceNames(plan.ir)
  const result: CModuleValueDeclaration[] = []

  for (let index = 0; index < values.length; index = index + 1) {
    const item = values[index]

    if (shouldEmitCModuleStaticValueDeclaration(item, nestedReferences, context)) {
      result.push(item)
    }
  }

  return result
}

function shouldEmitCModuleStaticValueDeclaration(
  item: CModuleValueDeclaration,
  nestedReferences: Set<string>,
  context: CEmitContext
): boolean {
  if (item.exported === true) {
    return true
  }

  if (nestedReferences.has(item.name)) {
    return true
  }

  if (!isCModuleEntryLocalValueType(item.valueType)) {
    return true
  }

  const objectShape = context.moduleObjectShapes.get(item.name)

  if (
    objectShape !== null &&
    typeof objectShape !== 'undefined' &&
    cModuleObjectShapeHasFunctionFields(objectShape, new Set())
  ) {
    return true
  }

  return false
}

function isCModuleEntryLocalValueType(valueType: string): boolean {
  return valueType !== 'function' && valueType !== 'async-result'
}

function cModuleObjectShapeHasFunctionFields(fields: CObjectShapeField[], seen: Set<CObjectShapeField[]>): boolean {
  if (seen.has(fields)) {
    return false
  }

  seen.add(fields)

  for (let index = 0; index < fields.length; index = index + 1) {
    const field = fields[index]

    if (field.valueType === 'function') {
      seen.delete(fields)
      return true
    }

    if (
      field.valueType === 'object' &&
      field.shape !== null &&
      typeof field.shape !== 'undefined' &&
      field.shape.fields !== null &&
      typeof field.shape.fields !== 'undefined' &&
      cModuleObjectShapeHasFunctionFields(field.shape.fields, seen)
    ) {
      seen.delete(fields)
      return true
    }
  }

  seen.delete(fields)

  return false
}

function collectCModuleNestedReferenceNames(ir: IrProgram): Set<string> {
  const names: Set<string> = new Set()
  const functions = collectIrTopLevelNodes(ir, 'function')
  const classes = collectIrTopLevelNodes(ir, 'class')
  const statements = collectIrTopLevelNodes(ir, 'statement')

  for (let index = 0; index < functions.length; index = index + 1) {
    addCModuleReferenceNames(names, functions[index])
  }

  for (let index = 0; index < classes.length; index = index + 1) {
    addCModuleReferenceNames(names, classes[index])
  }

  for (let index = 0; index < statements.length; index = index + 1) {
    addCModuleNestedFunctionReferenceNames(names, statements[index])
  }

  return names
}

function addCModuleNestedFunctionReferenceNames(
  names: Set<string>,
  node: AnyNode | AnyNode[] | null | undefined
): void {
  if (node === null || typeof node === 'undefined') {
    return
  }

  if (Array.isArray(node)) {
    for (let index = 0; index < node.length; index = index + 1) {
      addCModuleNestedFunctionReferenceNames(names, node[index])
    }

    return
  }

  if (isCModuleNestedFunctionLikeNode(node)) {
    addCModuleReferenceNames(names, node)
    return
  }

  addCModuleNestedFunctionReferenceChildNames(names, node)
}

function addCModuleReferenceNames(names: Set<string>, node: AnyNode | AnyNode[] | null | undefined): void {
  if (node === null || typeof node === 'undefined') {
    return
  }

  if (Array.isArray(node)) {
    for (let index = 0; index < node.length; index = index + 1) {
      addCModuleReferenceNames(names, node[index])
    }

    return
  }

  if (node.type === 'Reference') {
    const item = node as CModuleReferenceNode
    const root = firstCModuleReferencePathSegment(item.path)

    if (root !== null && typeof root !== 'undefined') {
      names.add(root)
    }
  }

  addCModuleReferenceChildNames(names, node)
}

function firstCModuleReferencePathSegment(path: string[] | null | undefined): string | null {
  if (path === null || typeof path === 'undefined' || path.length === 0) {
    return null
  }

  return path[0]
}

function addCModuleNestedFunctionReferenceChildNames(names: Set<string>, item: AnyNode): void {
  addCModuleNestedFunctionReferenceNames(names, item.body)
  addCModuleNestedFunctionReferenceNames(names, item.params)
  addCModuleNestedFunctionReferenceNames(names, item.fields)
  addCModuleNestedFunctionReferenceNames(names, item.methods)
  addCModuleNestedFunctionReferenceNames(names, item.init)
  addCModuleNestedFunctionReferenceNames(names, item.condition)
  addCModuleNestedFunctionReferenceNames(names, item.consequent)
  addCModuleNestedFunctionReferenceNames(names, item.alternate)
  addCModuleNestedFunctionReferenceNames(names, item.test)
  addCModuleNestedFunctionReferenceNames(names, item.update)
  addCModuleNestedFunctionReferenceNames(names, item.iterable)
  addCModuleNestedFunctionReferenceNames(names, item.discriminant)
  addCModuleNestedFunctionReferenceNames(names, item.cases)
  addCModuleNestedFunctionReferenceNames(names, item.block)
  addCModuleNestedFunctionReferenceNames(names, item.handler)
  addCModuleNestedFunctionReferenceNames(names, item.finalizer)
  addCModuleNestedFunctionReferenceNames(names, item.argument)
  addCModuleNestedFunctionReferenceNames(names, item.args)
  addCModuleNestedFunctionReferenceNames(names, item.callee)
  addCModuleNestedFunctionReferenceNames(names, item.object)
  addCModuleNestedFunctionReferenceNames(names, item.index)
  addCModuleNestedFunctionReferenceNames(names, item.target)
  addCModuleNestedFunctionReferenceNames(names, item.value)
  addCModuleNestedFunctionReferenceNames(names, item.left)
  addCModuleNestedFunctionReferenceNames(names, item.right)
  addCModuleNestedFunctionReferenceNames(names, item.elements)
  addCModuleNestedFunctionReferenceNames(names, item.properties)
  addCModuleNestedFunctionReferenceNames(names, item.expression)
  addCModuleNestedFunctionReferenceNames(names, item.expressions)
}

function addCModuleReferenceChildNames(names: Set<string>, item: AnyNode): void {
  addCModuleReferenceNames(names, item.body)
  addCModuleReferenceNames(names, item.params)
  addCModuleReferenceNames(names, item.fields)
  addCModuleReferenceNames(names, item.methods)
  addCModuleReferenceNames(names, item.init)
  addCModuleReferenceNames(names, item.condition)
  addCModuleReferenceNames(names, item.consequent)
  addCModuleReferenceNames(names, item.alternate)
  addCModuleReferenceNames(names, item.test)
  addCModuleReferenceNames(names, item.update)
  addCModuleReferenceNames(names, item.iterable)
  addCModuleReferenceNames(names, item.discriminant)
  addCModuleReferenceNames(names, item.cases)
  addCModuleReferenceNames(names, item.block)
  addCModuleReferenceNames(names, item.handler)
  addCModuleReferenceNames(names, item.finalizer)
  addCModuleReferenceNames(names, item.argument)
  addCModuleReferenceNames(names, item.args)
  addCModuleReferenceNames(names, item.callee)
  addCModuleReferenceNames(names, item.object)
  addCModuleReferenceNames(names, item.index)
  addCModuleReferenceNames(names, item.target)
  addCModuleReferenceNames(names, item.value)
  addCModuleReferenceNames(names, item.left)
  addCModuleReferenceNames(names, item.right)
  addCModuleReferenceNames(names, item.elements)
  addCModuleReferenceNames(names, item.properties)
  addCModuleReferenceNames(names, item.expression)
  addCModuleReferenceNames(names, item.expressions)
}

function isCModuleNestedFunctionLikeNode(node: AnyNode): boolean {
  const nodeType = node.type

  return nodeType === 'ArrowFunctionExpression' || nodeType === 'FunctionExpression' || nodeType === 'MethodDefinition'
}

function emitCModuleValueDefinitions(lines: string[], values: CModuleValueDeclaration[], context: CEmitContext): void {
  if (values.length === 0) {
    return
  }

  for (let index = 0; index < values.length; index = index + 1) {
    const item = values[index]
    const functionPointerDefinition = cModuleFunctionPointerDefinition(item)

    if (functionPointerDefinition !== null && typeof functionPointerDefinition !== 'undefined') {
      lines.push(functionPointerDefinition)
      continue
    }

    const cType = cModuleValueDeclarationCType(item, context)
    const initializer = cModuleValueDeclarationGlobalInitializer(item)
    let prefix = ''
    let constPrefix = ''

    if (item.exported !== true) {
      prefix = 'static '
    }

    if (item.compileTimeInitializer !== null && typeof item.compileTimeInitializer !== 'undefined') {
      constPrefix = 'const '
    }

    if (initializer === '') {
      lines.push(`${prefix}${constPrefix}${cType} ${item.symbolName};`)
    } else {
      lines.push(`${prefix}${constPrefix}${cType} ${item.symbolName} = ${initializer};`)
    }
  }

  lines.push('')
}

function cModuleFunctionPointerDefinition(item: CModuleValueDeclaration): string | null {
  if (item.valueType !== 'function') {
    return null
  }

  const functionType = item.functionType
  let prefix = ''

  if (item.exported !== true) {
    prefix = 'static '
  }

  return `${prefix}${emitFunctionPointerReturnType(functionType)} (*${item.symbolName})(${emitFunctionPointerParams(
    functionType,
    [],
    []
  )}) = 0;`
}

function emitCModuleValueFunctionFieldDefinitions(
  lines: string[],
  values: CModuleValueDeclaration[],
  context: CModuleValueFunctionFieldContext
): void {
  let emitted = false

  for (let index = 0; index < values.length; index = index + 1) {
    const item = values[index]
    const fields = context.moduleObjectShapes.get(item.name)

    if (fields === null || typeof fields === 'undefined') {
      continue
    }

    if (
      emitCModuleObjectFunctionFieldDefinitions(
        lines,
        item.name,
        fields,
        cModuleObjectFunctionFieldSeenTypes(item.declaredType)
      )
    ) {
      emitted = true
    }
  }

  if (emitted) {
    lines.push('')
  }
}

function cModuleObjectFunctionFieldSeenTypes(declaredType?: string | null): string[] {
  const seenTypes = ['CFunctionContext']

  if (declaredType !== null && typeof declaredType !== 'undefined' && !seenTypes.includes(declaredType)) {
    seenTypes.push(declaredType)
  }

  return seenTypes
}

function emitCModuleObjectFunctionFieldDefinitions(
  _lines: string[],
  _objectName: string,
  _fields: CObjectShapeField[],
  _seenTypes: string[]
): boolean {
  return false
}

function cModuleValueType(node: AnyNode, context?: CEmitContext): string {
  const valueType = node.valueType
  const classValueType = cModuleNativeClassValueType(node, context)

  if (classValueType !== null && typeof classValueType !== 'undefined') {
    return classValueType
  }

  if (valueType === null || typeof valueType === 'undefined' || valueType === '') {
    return 'unknown'
  }

  if (valueType === 'function' && cModuleFunctionValueUsesRuntimeCallback(node, context)) {
    return 'unknown'
  }

  if (isUnionValueTypeName(valueType)) {
    return 'unknown'
  }

  if (node.nullable === true && isRuntimeNullableType(valueType)) {
    return 'unknown'
  }

  if (cCallExpressionReturnsTypeErasedValue(node.init)) {
    return 'unknown'
  }

  if (valueType === 'string' && isCModuleRuntimeStringInitializer(node.init)) {
    return 'unknown'
  }

  if (valueType === 'void' && node.init?.type === 'AwaitExpression') {
    return 'unknown'
  }

  return valueType
}

function cModuleValueShapeBuiltin(node: AnyNode): string | null {
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

function cModuleNativeClassValueType(node: AnyNode, context: CEmitContext | null | undefined): string | null {
  if (context === null || typeof context === 'undefined') {
    return null
  }

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

function cModuleValueFunctionType(node: AnyNode): CFunctionType | null {
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

function cModuleFunctionValueUsesRuntimeCallback(node: AnyNode, context?: CEmitContext): boolean {
  if (cModuleValueIsGenericFunctionDeclaration(node)) {
    return true
  }

  if (node.init !== null && typeof node.init !== 'undefined' && node.init.type === 'CallExpression') {
    return true
  }

  if (
    context !== null &&
    typeof context !== 'undefined' &&
    node.init !== null &&
    typeof node.init !== 'undefined' &&
    node.init.type === 'ArrowFunctionExpression'
  ) {
    const wrapper = context.callbackArrowWrappers.get(node.init)

    return wrapper !== null && typeof wrapper !== 'undefined' && wrapper.kind === 'arrow'
  }

  return isNullableFunctionType(node.valueType, node.nullable) || isRuntimeFunctionType(node.functionType)
}

function cModuleValueIsGenericFunctionDeclaration(node: AnyNode): boolean {
  return (
    node.declaredType === 'Function' ||
    node.declaredType === 'function' ||
    node.inferredDeclaredType === 'Function' ||
    node.inferredDeclaredType === 'function'
  )
}

function isCModuleRuntimeStringInitializer(expression: AnyNode | null | undefined): boolean {
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

function cModuleValueCType(valueType: string, context: CEmitContext): string {
  const className = cClassNameFromValueType(valueType)

  if (className !== null && typeof className !== 'undefined') {
    return emitCClassTypeNameForClassName(context, className)
  }

  if (valueType === 'string') {
    return 'char*'
  }

  if (valueType === 'unknown') {
    return 'inox_value'
  }

  if (valueType === 'async-result') {
    return requireCompilerLibraryIntrinsicNativeCppType(context.libraries, 'async-result')
  }

  return emitCType(valueType)
}

function cModuleValueDeclarationCType(item: CModuleValueDeclaration, context: CEmitContext): string {
  if (item.cppType !== null && typeof item.cppType !== 'undefined') {
    return item.cppType
  }

  return cModuleValueCType(item.valueType, context)
}

function cModuleValueGlobalInitializer(valueType: string): string {
  if (cClassNameFromValueType(valueType) !== null) {
    return ''
  }

  if (valueType === 'string') {
    return '""'
  }

  if (valueType === 'async-result') {
    return ''
  }

  if (valueType === 'unknown' || isManagedRuntimeReturnType(valueType) || isOpaqueRuntimeValueType(valueType)) {
    return ''
  }

  return '0'
}

function cModuleValueDeclarationGlobalInitializer(item: CModuleValueDeclaration): string {
  if (item.compileTimeInitializer !== null && typeof item.compileTimeInitializer !== 'undefined') {
    return item.compileTimeInitializer
  }

  if (item.cppType !== null && typeof item.cppType !== 'undefined') {
    return ''
  }

  return cModuleValueGlobalInitializer(item.valueType)
}

function emitCModuleInitFunction(
  plan: CModulePlan,
  baseContext: CEmitContext,
  deps: CModuleEmissionDependencies
): string[] {
  const context = createFunctionContext(baseContext, 'void', false)
  const ir = plan.ir
  const body = collectIrTopLevelNodes(ir, 'statement')
  const initCalls = emitCModuleImportInitCalls(plan)
  context.moduleValueDeclarationScope = true
  const bodyLines: string[] = []
  pushIndentedCModuleLines(bodyLines, initCalls)
  pushIndentedCModuleLines(bodyLines, deps.emitStatementList(body, context))
  pushIndentedCModuleLines(bodyLines, emitEventLoopDrain(context))
  const lines: string[] = []

  lines.push(`void ${plan.initName}() {`)
  lines.push('  static bool inox_initialized = false;')
  lines.push('  if (inox_initialized) return;')
  lines.push('  inox_initialized = true;')
  pushIndentedCModuleLines(lines, emitLoopFlowDeclarations(context))
  pushIndentedCModuleLines(lines, emitReturnValueDeclarations(context))
  pushIndentedCModuleLines(lines, emitReturnFlowDeclarations(context))
  pushIndentedCModuleLines(lines, emitEventLoopDeclarations(context))
  pushIndentedCModuleLines(lines, emitOwnedValueDeclarations(context))
  pushIndentedCModuleLines(lines, emitOwnedAsyncResultDeclarations(context))
  pushIndentedCModuleLines(lines, emitErrorChannelDeclarations(context))
  pushIndentedCModuleLines(lines, emitBoxedValueDeclarations(context))
  pushIndentedCModuleLines(lines, emitEventLoopInit(context))
  const needsCleanup = shouldEmitCleanupLabel(context)
  pushScopedCModuleBody(lines, needsCleanup ? bodyLines : replaceCleanupGotosWithReturn(bodyLines, 'return;'))

  if (needsCleanup) {
    lines.push('cleanup:')
    pushIndentedCModuleLines(lines, emitOwnedValueCleanup(context))
    pushIndentedCModuleLines(lines, emitOwnedAsyncResultCleanup(context))
    pushIndentedCModuleLines(lines, emitEventLoopCleanup(context))
    pushIndentedCModuleLines(lines, emitBoxedValueCleanup(context))
  }

  lines.push('  return;')
  lines.push('}')

  return lines
}

function emitCModuleMainFunction(
  plan: CModulePlan,
  baseContext: CEmitContext,
  deps: CModuleEmissionDependencies
): string[] {
  const context = createFunctionContext(baseContext, 'void', false)
  const ir = plan.ir
  const body = collectIrTopLevelNodes(ir, 'statement')
  const initCalls = emitCModuleImportInitCalls(plan)
  context.moduleValueDeclarationScope = true
  context.cleanupEnabled = false
  context.externalEventLoop = true
  const bodyLines: string[] = []
  pushIndentedCModuleLines(bodyLines, initCalls)
  pushIndentedCModuleLines(bodyLines, deps.emitStatementList(body, context))
  const lines: string[] = []

  lines.push('static void inox_main() {')
  pushIndentedCModuleLines(lines, emitLoopFlowDeclarations(context))
  pushIndentedCModuleLines(lines, emitMainReturnValueDeclarations(context))
  pushIndentedCModuleLines(lines, emitReturnFlowDeclarations(context))
  pushIndentedCModuleLines(lines, emitOwnedValueDeclarations(context))
  pushIndentedCModuleLines(lines, emitOwnedAsyncResultDeclarations(context))
  pushIndentedCModuleLines(lines, emitErrorChannelDeclarations(context))
  pushIndentedCModuleLines(lines, emitBoxedValueDeclarations(context))
  pushCModuleLines(lines, bodyLines)
  lines.push('}')
  lines.push('')

  if (context.runtimeEntrypointAdapter !== null) {
    lines.push('int main(int argc, char** argv) {')
    if (context.runtimeEntrypointAdapter.acceptsEntryPath) {
      lines.push(
        `  return ${context.runtimeEntrypointAdapter.cFunction}(argc, argv, ${cStringLiteral(plan.relativeSourcePath)}, inox_main);`
      )
    } else {
      lines.push(`  return ${context.runtimeEntrypointAdapter.cFunction}(argc, argv, inox_main);`)
    }
  } else {
    lines.push('int main() {')
    lines.push('  return inox::main(inox_main);')
  }

  lines.push('}')

  return lines
}

function emitCModuleImportInitCalls(plan: CModulePlan): string[] {
  const calls: string[] = []

  for (let index = 0; index < plan.imports.length; index = index + 1) {
    const item = plan.imports[index]
    const importedModule = item.module

    if (importedModule === null || typeof importedModule === 'undefined') {
      continue
    }

    if (importedModule.initName !== null && typeof importedModule.initName !== 'undefined') {
      calls.push(`${importedModule.initName}();`)
    }
  }

  return calls
}

function collectCModuleExternalEventLoopFunctionNames(
  plan: CModulePlan,
  deps: CModuleEmissionDependencies,
  cache: Map<string, Set<string>>,
  visiting: Set<string>
): Set<string> {
  const cached = cache.get(plan.record.path)

  if (cached !== null && typeof cached !== 'undefined') {
    return new Set(cached)
  }

  if (visiting.has(plan.record.path)) {
    return new Set()
  }

  visiting.add(plan.record.path)

  const seedNames = collectCModuleImportedExternalEventLoopFunctionNames(plan, deps, cache, visiting)
  const entries = collectCModuleFunctionNodeEntries(plan, [plan.ir])
  const functions: AnyNode[] = []

  for (let index = 0; index < entries.length; index = index + 1) {
    functions.push(entries[index].node)
  }

  const names = deps.collectExternalEventLoopFunctions(functions, seedNames)

  visiting.delete(plan.record.path)
  cache.set(plan.record.path, names)

  return new Set(names)
}

function collectCModuleImportedExternalEventLoopFunctionNames(
  plan: CModulePlan,
  deps: CModuleEmissionDependencies,
  cache: Map<string, Set<string>>,
  visiting: Set<string>
): Set<string> {
  const names: Set<string> = new Set()

  for (let importIndex = 0; importIndex < plan.imports.length; importIndex = importIndex + 1) {
    const item = plan.imports[importIndex]
    const importedModule = item.module

    if (importedModule === null || typeof importedModule === 'undefined') {
      continue
    }

    const importDeclaration = item.declaration

    if (importDeclaration === null || typeof importDeclaration === 'undefined') {
      continue
    }

    const specifiersValue = importDeclaration.specifiers

    if (specifiersValue === null || typeof specifiersValue === 'undefined') {
      continue
    }

    const importedNames = collectCModuleExternalEventLoopFunctionNames(importedModule, deps, cache, visiting)
    const specifiers: CModuleNode[] = specifiersValue

    for (let specifierIndex = 0; specifierIndex < specifiers.length; specifierIndex = specifierIndex + 1) {
      const specifier = specifiers[specifierIndex]

      if (!importedNames.has(specifier.imported)) {
        continue
      }

      names.add(cModuleImportedBindingName(importDeclaration, specifier))

      if (importDeclaration.type !== 'ExportDeclaration') {
        names.add(specifier.imported)
        names.add(specifier.local)
      }
    }
  }

  return names
}

function collectCModuleFunctionNodeEntries(plan: CModulePlan, programs: IrProgram[]): CModuleFunctionNodeEntry[] {
  const entries = collectIrFunctionNodeEntries(programs)
  const filtered: CModuleFunctionNodeEntry[] = []

  for (let index = 0; index < entries.length; index = index + 1) {
    const entry = entries[index]

    if (!isCModuleImportFunctionWrapper(plan, entry.node)) {
      filtered.push(entry)
    }
  }

  return filtered
}

function isCModuleImportFunctionWrapper(plan: CModulePlan, node: AnyNode): boolean {
  if (node.type !== 'FunctionDeclaration') {
    return false
  }

  for (let importIndex = 0; importIndex < plan.imports.length; importIndex = importIndex + 1) {
    const item = plan.imports[importIndex]
    const importDeclaration = item.declaration

    if (importDeclaration === null || typeof importDeclaration === 'undefined') {
      continue
    }

    const specifiersValue = importDeclaration.specifiers

    if (specifiersValue === null || typeof specifiersValue === 'undefined') {
      continue
    }

    const specifiers: CModuleNode[] = specifiersValue

    for (let specifierIndex = 0; specifierIndex < specifiers.length; specifierIndex = specifierIndex + 1) {
      const specifier = specifiers[specifierIndex]
      const localName = cModuleImportedBindingName(importDeclaration, specifier)

      if (node.name === localName && isCModuleImportFunctionWrapperBody(node, specifier.imported)) {
        return true
      }
    }
  }

  return false
}

function isCModuleImportFunctionWrapperBody(node: AnyNode, importedName: string): boolean {
  if (node.body.length !== 1) {
    return false
  }

  const statement = node.body[0]
  let expression: AnyNode | null = null

  if (statement.type === 'ReturnStatement') {
    expression = statement.argument
  } else if (statement.type === 'ExpressionStatement') {
    expression = statement.expression
  }

  if (expression === null || typeof expression === 'undefined' || expression.type !== 'CallExpression') {
    return false
  }

  const callee = expression.callee

  if (callee.type !== 'Reference' || callee.path.length !== 1) {
    return false
  }

  let calleeName = ''
  const path: string[] = callee.path

  for (const segment of path) {
    const pathSegment: string = segment
    calleeName = pathSegment
    break
  }

  return calleeName === importedName
}

function collectCModuleExportedFunctions(plan: CModulePlan): AnyNode[] {
  const exportedNames: Set<string> = new Set()
  const functions: AnyNode[] = []
  const ir = plan.ir

  for (
    let declarationIndex = 0;
    declarationIndex < ir.functionDeclarations.length;
    declarationIndex = declarationIndex + 1
  ) {
    const declaration = ir.functionDeclarations[declarationIndex]

    if (declaration.exported) {
      exportedNames.add(declaration.name)
    }
  }

  const nodes = collectIrTopLevelNodes(ir, 'function')

  for (let index = 0; index < nodes.length; index = index + 1) {
    const item = nodes[index]

    if (exportedNames.has(item.name)) {
      functions.push(item)
    }
  }

  return functions
}

function collectCModuleImportedFunctionDeclarations(plan: CModulePlan): IrFunctionDeclaration[] {
  const declarations: IrFunctionDeclaration[] = []

  for (let importIndex = 0; importIndex < plan.imports.length; importIndex = importIndex + 1) {
    const item = plan.imports[importIndex]
    const importedModule = item.module

    if (importedModule === null || typeof importedModule === 'undefined') {
      continue
    }

    const importDeclaration = item.declaration

    if (importDeclaration === null || typeof importDeclaration === 'undefined') {
      continue
    }

    const specifiersValue = importDeclaration.specifiers

    if (specifiersValue === null || typeof specifiersValue === 'undefined') {
      continue
    }

    const specifiers: CModuleNode[] = specifiersValue

    for (let specifierIndex = 0; specifierIndex < specifiers.length; specifierIndex = specifierIndex + 1) {
      const specifier = specifiers[specifierIndex]
      const declaration = findCModuleExportedFunctionDeclaration(
        importedModule.ir.functionDeclarations,
        specifier.imported
      )

      if (declaration !== null && typeof declaration !== 'undefined') {
        const localName = cModuleImportedBindingName(importDeclaration, specifier)
        declarations.push(cloneImportedCModuleFunctionDeclaration(declaration, localName))
      }
    }
  }

  return declarations
}

function collectImportedCModuleFunctionEffects(plan: CModulePlan): IrFunctionEffect[] {
  const visiting: Set<string> = new Set()
  const cache: Map<string, IrFunctionEffect[]> = new Map()
  return collectImportedCModuleFunctionEffectsWithVisited(plan, visiting, cache)
}

function collectCModulePlanFunctionEffectsWithVisited(
  plan: CModulePlan,
  visiting: Set<string>,
  cache: Map<string, IrFunctionEffect[]>
): IrFunctionEffect[] {
  const cached = cache.get(plan.record.path)

  if (cached !== null && typeof cached !== 'undefined') {
    return cached
  }

  if (visiting.has(plan.record.path)) {
    return []
  }

  visiting.add(plan.record.path)

  const irPrograms: IrProgram[] = []
  irPrograms.push(plan.ir)

  const importedEffects = collectImportedCModuleFunctionEffectsWithVisited(plan, visiting, cache)
  const inferredEffects = collectIrFunctionEffectsWithExternalEffects(irPrograms, importedEffects, true)
  const storedEffects = collectIrStoredFunctionEffects(irPrograms)
  const effects = mergeIrFunctionEffects(inferredEffects, storedEffects)

  for (let effectIndex = 0; effectIndex < importedEffects.length; effectIndex = effectIndex + 1) {
    const effect = importedEffects[effectIndex]

    pushIrFunctionEffect(effects, effect)
  }

  visiting.delete(plan.record.path)
  cache.set(plan.record.path, effects)

  return effects
}

function collectImportedCModuleFunctionEffectsWithVisited(
  plan: CModulePlan,
  visiting: Set<string>,
  cache: Map<string, IrFunctionEffect[]>
): IrFunctionEffect[] {
  const effects: IrFunctionEffect[] = []

  for (let importIndex = 0; importIndex < plan.imports.length; importIndex = importIndex + 1) {
    const item = plan.imports[importIndex]
    const importedModule = item.module

    if (importedModule === null || typeof importedModule === 'undefined') {
      continue
    }

    const importDeclaration = item.declaration

    if (importDeclaration === null || typeof importDeclaration === 'undefined') {
      continue
    }

    const specifiersValue = importDeclaration.specifiers

    if (specifiersValue === null || typeof specifiersValue === 'undefined') {
      continue
    }

    const specifiers: CModuleNode[] = specifiersValue

    for (let specifierIndex = 0; specifierIndex < specifiers.length; specifierIndex = specifierIndex + 1) {
      const specifier = specifiers[specifierIndex]
      const sourceEffects = collectCModulePlanFunctionEffectsWithVisited(importedModule, visiting, cache)

      for (let effectIndex = 0; effectIndex < sourceEffects.length; effectIndex = effectIndex + 1) {
        const effect = sourceEffects[effectIndex]
        const effectName: string = effect.name
        const importedName: string = specifier.imported

        if (effectName === importedName) {
          const localName = cModuleImportedBindingName(importDeclaration, specifier)
          effects.push(cloneImportedCModuleFunctionEffect(effect, localName))
        }
      }
    }
  }

  return effects
}

function findCModuleExportedFunctionDeclaration(
  declarations: IrFunctionDeclaration[],
  name: string
): IrFunctionDeclaration | null {
  for (let index = 0; index < declarations.length; index = index + 1) {
    const declaration = declarations[index]

    if (declaration.name === name && declaration.exported) {
      return declaration
    }
  }

  return null
}

function cloneImportedCModuleFunctionDeclaration(
  declaration: IrFunctionDeclaration,
  name: string
): IrFunctionDeclaration {
  return {
    name,
    exported: declaration.exported,
    async: declaration.async,
    params: declaration.params,
    returnType: declaration.returnType,
    returnTypeRef: declaration.returnTypeRef ?? null,
    returnRuntimeTypeAlternatives: declaration.returnRuntimeTypeAlternatives ?? null,
    returnNullable: declaration.returnNullable,
    declaredReturnType: declaration.declaredReturnType,
    returnAsyncResultValueType: declaration.returnAsyncResultValueType,
    returnShape: declaration.returnShape,
    loc: declaration.loc
  }
}

function cloneImportedCModuleFunctionEffect(effect: IrFunctionEffect, name: string): IrFunctionEffect {
  return {
    mayLeavePendingException: effect.mayLeavePendingException === true,
    name,
    throws: effect.throws,
    throwValueTypes: effect.throwValueTypes
  }
}

function createCModuleFunctionNames(plan: CModulePlan): Map<string, string> {
  const names: Map<string, string> = new Map()
  const localNames: Set<string> = new Set()
  const localFunctionNodes = collectIrTopLevelNodes(plan.ir, 'function')

  for (let functionIndex = 0; functionIndex < localFunctionNodes.length; functionIndex = functionIndex + 1) {
    const node = localFunctionNodes[functionIndex]

    if (!isCModuleImportFunctionWrapper(plan, node)) {
      localNames.add(node.name)
    }
  }

  for (
    let declarationIndex = 0;
    declarationIndex < plan.ir.functionDeclarations.length;
    declarationIndex = declarationIndex + 1
  ) {
    const declaration = plan.ir.functionDeclarations[declarationIndex]

    names.set(declaration.name, emitCModuleFunctionName(plan, declaration.name))
  }

  for (let importIndex = 0; importIndex < plan.imports.length; importIndex = importIndex + 1) {
    const item = plan.imports[importIndex]
    const importedModule = item.module

    if (importedModule === null || typeof importedModule === 'undefined') {
      continue
    }

    const importDeclaration = item.declaration

    if (importDeclaration === null || typeof importDeclaration === 'undefined') {
      continue
    }

    const specifiersValue = importDeclaration.specifiers

    if (specifiersValue === null || typeof specifiersValue === 'undefined') {
      continue
    }

    const specifiers: CModuleNode[] = specifiersValue

    for (let specifierIndex = 0; specifierIndex < specifiers.length; specifierIndex = specifierIndex + 1) {
      const specifier = specifiers[specifierIndex]
      const importedBindingName = cModuleImportedBindingName(importDeclaration, specifier)
      const importedFunctionName = emitCModuleFunctionName(importedModule, specifier.imported)

      if (!localNames.has(importedBindingName)) {
        names.set(importedBindingName, importedFunctionName)
      }

      if (importDeclaration.type !== 'ExportDeclaration') {
        if (!localNames.has(specifier.imported)) {
          names.set(specifier.imported, importedFunctionName)
        }

        if (!localNames.has(specifier.local)) {
          names.set(specifier.local, importedFunctionName)
        }
      }
    }
  }

  return names
}

function emitCModuleFunctionName(plan: CModulePlan, name: string): string {
  const symbolName = plan.functionSymbolNames.get(name)

  if (symbolName !== null && typeof symbolName !== 'undefined') {
    return symbolName
  }

  return `${plan.symbolPrefix}_${emitCFunctionName(name)}`
}

function cModuleImportedBindingName(declaration: AnyNode, specifier: AnyNode): string {
  if (declaration.type === 'ExportDeclaration') {
    return reexportImportAliasName(specifier.local)
  }

  return specifier.local
}

function emitCModuleValueName(plan: CModulePlan, name: string): string {
  const symbolName = plan.valueSymbolNames.get(name)

  if (symbolName !== null && typeof symbolName !== 'undefined') {
    return symbolName
  }

  return `${plan.symbolPrefix}_${emitCIdentifier(name)}`
}
