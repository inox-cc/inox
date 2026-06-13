import { CompileError, diagnostic } from './diagnostics.ts'
import { collectIrFunctionDeclarations, collectIrFunctionNodeEntries, collectIrGlobalRoots, collectIrGlobalUsages, collectIrLocalThrowValueTypes, collectIrPrograms, collectIrRuntimeRequirements, collectIrStoredFunctionEffects, collectIrSyntaxFeatureUsages, collectIrTopLevelNodeEntries, collectIrTopLevelNodes, collectIrTopLevelNodesFromPrograms, findIrEntryProgram, hasIrFunctionDeclaration } from './ir.ts'
import type { IrFunctionNodeEntry, IrModuleRecord } from './ir.ts'
import type { AnyNode, Diagnostic, IrFunctionDeclaration, IrFunctionEffect, IrGlobalUsage, IrProgram, IrSyntaxFeatureUsage, RandomOptions, SourceLocation } from './types.ts'

const cStringPredicateMethods = new Set([
  'includes',
  'startsWith',
  'endsWith'
])

const cArrayMethods = new Set([
  'sort',
  'filter',
  'map',
  'push',
  'pop'
])

const cMathNullaryMethods = new Set(['random'])
const cMathUnaryMethods = new Set(['abs', 'ceil', 'cos', 'floor', 'round', 'sin', 'sqrt', 'trunc'])
const cMathBinaryMethods = new Set(['max', 'min'])
const defaultRandomSeed = 0x6d2b79f5

type CEmitOptions = {
  random?: RandomOptions
}

export function emitCFromIr(ir: IrProgram, options: CEmitOptions = {}): string {
  return emitCUnit([ir], ir, options)
}

export function emitCBundleFromIrModules(irModules: IrModuleRecord[], entry: string, options: CEmitOptions = {}): string {
  const irPrograms = collectIrPrograms(irModules)
  const entryIr = findIrEntryProgram(irModules, entry)

  return emitCUnit(irPrograms, entryIr, options)
}

function emitCUnit(irPrograms: IrProgram[], entryIrProgram: IrProgram | null = irPrograms.at(-1) ?? null, options: CEmitOptions = {}) {
  const diagnostics: Diagnostic[] = []
  const functionEntries = collectIrFunctionNodeEntries(irPrograms)
  const functions = functionEntries.map(entry => entry.node)
  const functionDeclarations = collectIrFunctionDeclarations(irPrograms)
  const functionEffects = collectIrStoredFunctionEffects(irPrograms)
  const globalUsages = collectIrGlobalUsages(irPrograms)
  const globalRoots = collectIrGlobalRoots(irPrograms)
  const runtimeRequirements = new Set(collectIrRuntimeRequirements(irPrograms))
  const syntaxFeatures = collectIrSyntaxFeatureUsages(irPrograms)
  const classes = collectIrTopLevelNodesFromPrograms(irPrograms, 'class')
  const jsGlobalRoots = new Set(globalRoots)
  const baseContext = createBaseContext(diagnostics, functionDeclarations, functionEffects, jsGlobalRoots)
  baseContext.classInfos = createClassInfos(classes, diagnostics)
  baseContext.externalEventLoopFunctions = collectExternalEventLoopFunctions(functions)
  baseContext.callbackWrappers = collectCallbackWrappers(irPrograms, baseContext)
  baseContext.promiseChainWrappers = collectPromiseChainWrappers(irPrograms, baseContext)
  baseContext.asyncTaskWrappers = collectAsyncTaskWrappers(functionEntries, baseContext)
  const classMethods = collectClassMethods(baseContext)
  const needsCallbackRuntime = [...baseContext.callbackWrappers.values()].some(isRuntimeCallbackWrapper) || runtimeRequirements.has('callback-values')
  const needsFsRuntime = runtimeRequirements.has('fs')
  const needsJsonRuntime = runtimeRequirements.has('json')
  const needsTimerRuntime = runtimeRequirements.has('timers')
  const needsAsyncRuntime = runtimeRequirements.has('async-runtime') || needsFsRuntime || needsTimerRuntime
  const needsCollectionRuntime = runtimeRequirements.has('collections')
  const needsBinaryRuntime = runtimeRequirements.has('binary')
  const needsClassRuntime = baseContext.classInfos.size > 0
  const needsObjectRuntime = runtimeRequirements.has('objects') || needsFsRuntime || needsClassRuntime
  const needsRuntime = baseContext.throwingFunctions.size > 0 || needsAsyncRuntime || needsCallbackRuntime || needsCollectionRuntime || needsObjectRuntime || needsClassRuntime || needsJsonRuntime || runtimeRequirements.has('managed-values')
  const needsTimeRuntime = runtimeRequirements.has('clocks')
  const needsMathRuntime = globalUsages.some(isSupportedCMathGlobalUsage)
  const needsStringHeader = runtimeRequirements.has('string-bytes') || needsFsRuntime
  baseContext.unhandledRejectionFlag = needsAsyncRuntime ? 'ccjs_unhandled_rejection' : null
  reportUnsupportedCSyntaxFeatures(syntaxFeatures, diagnostics)
  reportUnsupportedCGlobalUsages(globalUsages, diagnostics)
  const lines = emitCPrelude(needsRuntime, needsTimeRuntime, needsMathRuntime, needsAsyncRuntime, needsCallbackRuntime, needsStringHeader, needsCollectionRuntime, needsBinaryRuntime, needsObjectRuntime, needsFsRuntime, needsJsonRuntime, needsTimerRuntime, options)
  const arrowCallbackWrappers = [...baseContext.callbackWrappers.values()].filter(isRuntimeArrowCallbackWrapperWithContext)
  const promiseChainCallbackWrappers = [...baseContext.promiseChainWrappers.values()].filter(isPromiseChainCallbackWrapperWithContext)

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

  if (functions.length > 0 || classMethods.length > 0 || baseContext.asyncTaskWrappers.size > 0 || baseContext.callbackWrappers.size > 0 || baseContext.promiseChainWrappers.size > 0) {
    lines.push('')
  }

  for (const wrapper of baseContext.asyncTaskWrappers.values()) {
    lines.push(...emitAsyncTaskWrapperDeclaration(wrapper, baseContext))
    lines.push('')
  }

  for (const wrapper of baseContext.callbackWrappers.values()) {
    lines.push(...(wrapper.kind === 'plain-arrow'
      ? emitPlainArrowCallbackWrapperDeclaration(wrapper, baseContext)
      : emitRuntimeCallbackWrapperDeclaration(wrapper, baseContext)))
    lines.push('')
  }

  for (const wrapper of baseContext.promiseChainWrappers.values()) {
    lines.push(...emitPromiseChainCallbackWrapperDeclaration(wrapper, baseContext))
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

  lines.push(...emitMainWrapper(entryIrProgram, baseContext))

  if (diagnostics.length > 0) {
    throw new CompileError(diagnostics)
  }

  return `${lines.join('\n')}\n`
}

function emitCPrelude(needsRuntime, needsTimeRuntime, needsMathRuntime, needsAsyncRuntime, needsCallbackRuntime, needsStringHeader, needsCollectionRuntime, needsBinaryRuntime, needsObjectRuntime, needsFsRuntime, needsJsonRuntime, needsTimerRuntime, options: CEmitOptions = {}) {
  const lines = [
    '#include <stdio.h>'
  ]

  if (needsMathRuntime) {
    lines.push('#include <stdint.h>')
  }

  if (needsStringHeader) {
    lines.push('#include <string.h>')
  }

  if (needsRuntime) {
    lines.push('#include <stdlib.h>')
    if (needsCollectionRuntime) {
      lines.push('#include "ccjs/array.h"')
    }
    if (needsAsyncRuntime) {
      lines.push('#include "ccjs/loop.h"')
      lines.push('#include "ccjs/promise.h"')
    }
    if (needsCallbackRuntime) {
      lines.push('#include "ccjs/callback.h"')
    }
    if (needsBinaryRuntime) {
      lines.push('#include "ccjs/binary.h"')
    }
    if (needsFsRuntime) {
      lines.push('#include "ccjs/fs.h"')
    }
    if (needsJsonRuntime) {
      lines.push('#include "ccjs/json.h"')
    }
    if (needsCollectionRuntime) {
      lines.push('#include "ccjs/map.h"')
    }
    if (needsObjectRuntime) {
      lines.push('#include "ccjs/object.h"')
    }
    if (needsCollectionRuntime) {
      lines.push('#include "ccjs/set.h"')
    }
    lines.push('#include "ccjs/string.h"')
  }

  if (needsTimeRuntime) {
    lines.push('#include "ccjs/time.h"')
  }

  lines.push('')

  if (needsMathRuntime) {
    lines.push(...emitMathHelpers(options.random))
    lines.push('')
  }

  if (needsRuntime) {
    lines.push('static void* ccjs_default_alloc(void* user, size_t size, size_t align) {')
    lines.push('  (void)user;')
    lines.push('  (void)align;')
    lines.push('  return calloc(1, size);')
    lines.push('}')
    lines.push('')
    lines.push('static void* ccjs_default_realloc(void* user, void* ptr, size_t old_size, size_t new_size, size_t align) {')
    lines.push('  (void)user;')
    lines.push('  (void)old_size;')
    lines.push('  (void)align;')
    lines.push('  return realloc(ptr, new_size);')
    lines.push('}')
    lines.push('')
    lines.push('static void ccjs_default_free(void* user, void* ptr, size_t size, size_t align) {')
    lines.push('  (void)user;')
    lines.push('  (void)size;')
    lines.push('  (void)align;')
    lines.push('  free(ptr);')
    lines.push('}')
    lines.push('')
    lines.push('static ccjs_allocator ccjs_default_allocator = {')
    lines.push('  0,')
    lines.push('  ccjs_default_alloc,')
    lines.push('  ccjs_default_realloc,')
    lines.push('  ccjs_default_free')
    lines.push('};')
    lines.push('')

    if (needsTimerRuntime) {
      lines.push('static ccjs_status ccjs_timer_callback_run(void* context) {')
      lines.push('  if (context == 0) return CCJS_ERR_TYPE;')
      lines.push('  ccjs_value* callback = (ccjs_value*)context;')
      lines.push('  ccjs_value result = ccjs_undefined_value();')
      lines.push('  ccjs_status status = ccjs_callback_call(*callback, 0, 0, &result);')
      lines.push('  ccjs_release(result);')
      lines.push('  return status;')
      lines.push('}')
      lines.push('')
      lines.push('static void ccjs_timer_callback_finalize(void* context) {')
      lines.push('  if (context == 0) return;')
      lines.push('  ccjs_value* callback = (ccjs_value*)context;')
      lines.push('  ccjs_release(*callback);')
      lines.push('  ccjs_default_free(0, context, sizeof(ccjs_value), _Alignof(ccjs_value));')
      lines.push('}')
      lines.push('')
    }
  }

  return lines
}

function emitMathHelpers(random: RandomOptions = {}) {
  const randomSeed = emitRandomSeedLiteral(random)

  return [
    'static double ccjs_math_abs(double value) {',
    '  return value < 0 ? -value : value;',
    '}',
    '',
    'static double ccjs_math_floor(double value) {',
    '  long long truncated = (long long)value;',
    '  return (double)truncated > value ? (double)(truncated - 1) : (double)truncated;',
    '}',
    '',
    'static double ccjs_math_ceil(double value) {',
    '  long long truncated = (long long)value;',
    '  return (double)truncated < value ? (double)(truncated + 1) : (double)truncated;',
    '}',
    '',
    'static double ccjs_math_round(double value) {',
    '  return ccjs_math_floor(value + 0.5);',
    '}',
    '',
    'static double ccjs_math_trunc(double value) {',
    '  return (double)((long long)value);',
    '}',
    '',
    'static double ccjs_math_min(double left, double right) {',
    '  return left < right ? left : right;',
    '}',
    '',
    'static double ccjs_math_max(double left, double right) {',
    '  return left > right ? left : right;',
    '}',
    '',
    'static double ccjs_math_sqrt(double value) {',
    '  if (value < 0) return 0.0 / 0.0;',
    '  if (value == 0) return 0;',
    '  double estimate = value < 1 ? 1 : value;',
    '  for (int index = 0; index < 24; index += 1) {',
    '    estimate = 0.5 * (estimate + value / estimate);',
    '  }',
    '  return estimate;',
    '}',
    '',
    'static double ccjs_math_reduce_radians(double value) {',
    '  const double pi = 3.14159265358979323846;',
    '  const double tau = 6.28318530717958647692;',
    '  while (value > pi) value -= tau;',
    '  while (value < -pi) value += tau;',
    '  return value;',
    '}',
    '',
    'static double ccjs_math_sin(double value) {',
    '  double x = ccjs_math_reduce_radians(value);',
    '  double x2 = x * x;',
    '  return x * (1 - x2 / 6 + (x2 * x2) / 120 - (x2 * x2 * x2) / 5040 + (x2 * x2 * x2 * x2) / 362880);',
    '}',
    '',
    'static double ccjs_math_cos(double value) {',
    '  double x = ccjs_math_reduce_radians(value);',
    '  double x2 = x * x;',
    '  return 1 - x2 / 2 + (x2 * x2) / 24 - (x2 * x2 * x2) / 720 + (x2 * x2 * x2 * x2) / 40320;',
    '}',
    '',
    `static uint32_t ccjs_math_random_state = ${randomSeed};`,
    '',
    'static double ccjs_math_random(void) {',
    '  ccjs_math_random_state = ccjs_math_random_state * 1664525u + 1013904223u;',
    '  return (double)(ccjs_math_random_state >> 8) / 16777216.0;',
    '}'
  ]
}

function emitRandomSeedLiteral(random: RandomOptions = {}): string {
  if (random.backend != null && random.backend !== 'simple') {
    throw new Error(`unsupported random backend ${JSON.stringify(random.backend)}`)
  }

  const seed = random.seed ?? defaultRandomSeed

  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new Error('random.seed must be an integer from 0 to 4294967295')
  }

  return `0x${seed.toString(16).padStart(8, '0')}u`
}

function createThrowingFunctionInfo(functionDeclarations: IrFunctionDeclaration[], functionEffects: IrFunctionEffect[]) {
  const functionThrowValueTypes = new Map<string, IrFunctionEffect['throwValueTypes']>(functionDeclarations.map(item => [item.name, []]))
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

function reportUnsupportedCSyntaxFeatures(syntaxFeatures: IrSyntaxFeatureUsage[], diagnostics: Diagnostic[]) {
  for (const usage of syntaxFeatures) {
    void usage
  }
}

function createClassInfos(classes: AnyNode[], diagnostics: Diagnostic[]) {
  const infos = new Map<string, AnyNode>()

  for (const item of classes) {
    const constructor = item.methods.find(method => method.name === 'constructor') ?? null
    const assignments = collectClassConstructorAssignments(item, constructor, diagnostics)
    const fields = resolveClassFields(item, constructor, assignments)
    const methods = new Map<string, AnyNode>()

    for (const method of item.methods) {
      if (method.name !== 'constructor') {
        methods.set(method.name, method)
      }
    }

    infos.set(item.name, {
      name: item.name,
      node: item,
      constructor,
      assignments,
      fields,
      methods
    })
  }

  return infos
}

function collectClassMethods(context) {
  return [...context.classInfos.values()].flatMap(info => [...info.methods.values()].map(method => ({
    info,
    method
  })))
}

function collectClassConstructorAssignments(classNode: AnyNode, constructor: AnyNode | null, diagnostics: Diagnostic[]) {
  if (constructor == null) {
    return []
  }

  const assignments: AnyNode[] = []

  for (const statement of constructor.body) {
    const assignment = statement.type === 'ExpressionStatement' && statement.expression.type === 'AssignmentExpression'
      ? statement.expression
      : null

    if (assignment == null || !isThisFieldExpression(assignment.target)) {
      diagnostics.push(diagnostic('CCJS_C_CLASS', `class ${classNode.name} constructor currently supports only this.field assignments in the C backend`, statement.loc ?? constructor.loc))
      continue
    }

    assignments.push({
      field: assignment.target.property,
      value: assignment.value,
      loc: assignment.loc
    })
  }

  return assignments
}

function resolveClassFields(classNode: AnyNode, constructor: AnyNode | null, assignments: AnyNode[]) {
  const shapeFields = classNode.shape?.fields

  if (shapeFields != null) {
    return shapeFields.map(field => ({
      name: field.name,
      readonly: field.readonly === true,
      valueType: field.valueType ?? 'unknown',
      arrayElementType: field.arrayElementType,
      mapKeyType: field.mapKeyType,
      mapValueType: field.mapValueType,
      setElementType: field.setElementType
    }))
  }

  const fields: AnyNode[] = []
  const seen = new Set<string>()

  for (const assignment of assignments) {
    if (seen.has(assignment.field)) {
      continue
    }

    seen.add(assignment.field)
    fields.push({
      name: assignment.field,
      readonly: false,
      valueType: inferClassConstructorFieldType(assignment.value, constructor)
    })
  }

  return fields
}

function inferClassConstructorFieldType(expression: AnyNode, constructor: AnyNode | null) {
  if (expression?.type === 'Reference' && expression.path.length === 1 && constructor != null) {
    const param = constructor.params.find(item => item.name === expression.path[0])

    if (param != null) {
      return param.valueType ?? 'unknown'
    }
  }

  if (expression?.valueType != null) {
    return expression.valueType
  }

  if (expression?.type === 'StringLiteral' || expression?.type === 'TemplateLiteral') {
    return 'string'
  }

  if (expression?.type === 'NumberLiteral') {
    return 'number'
  }

  if (expression?.type === 'BooleanLiteral') {
    return 'boolean'
  }

  if (expression?.type === 'ObjectLiteral') {
    return 'object'
  }

  if (expression?.type === 'ArrayLiteral') {
    return 'array'
  }

  return 'unknown'
}

function isThisFieldExpression(expression: AnyNode) {
  return expression?.type === 'MemberExpression'
    && isThisObjectExpression(expression.object)
    && typeof expression.property === 'string'
}

function isThisObjectExpression(expression: AnyNode) {
  return expression?.type === 'ThisExpression'
    || (expression?.type === 'Reference' && expression.path.length === 1 && expression.path[0] === 'this')
}

function reportUnsupportedCGlobalUsages(globalUsages: IrGlobalUsage[], diagnostics: Diagnostic[]) {
  for (const usage of globalUsages) {
    if (!isSupportedCGlobalUsage(usage)) {
      reportCJsGlobalDiagnostic(diagnostics, usage.loc)
    }
  }
}

function isSupportedCGlobalUsage(usage: IrGlobalUsage): boolean {
  const path = usage.path.join('.')

  return path === 'Date.now'
    || path === 'performance.now'
    || path === 'Error'
    || path === 'Promise.resolve'
    || path === 'Promise.reject'
    || path === 'fs.readFile'
    || path === 'fs.readFileBytes'
    || path === 'fs.readFileBytesSync'
    || path === 'fs.readFileSync'
    || path === 'fs.readDir'
    || path === 'fs.readDirSync'
    || path === 'fs.writeFile'
    || path === 'fs.writeFileBytes'
    || path === 'fs.writeFileBytesSync'
    || path === 'fs.writeFileSync'
    || path === 'JSON.parse'
    || path === 'JSON.stringify'
    || path === 'Buffer.alloc'
    || path === 'Buffer.from'
    || path === 'Uint8Array'
    || path === 'clearImmediate'
    || path === 'clearInterval'
    || path === 'clearTimeout'
    || path === 'setImmediate'
    || path === 'setInterval'
    || path === 'setTimeout'
    || path === 'Map'
    || path === 'Set'
    || isSupportedCMathGlobalUsage(usage)
}

function isSupportedCMathGlobalUsage(usage: IrGlobalUsage): boolean {
  const path = usage.path.join('.')

  return path.startsWith('Math.')
    && (cMathNullaryMethods.has(path.slice('Math.'.length)) || cMathUnaryMethods.has(path.slice('Math.'.length)) || cMathBinaryMethods.has(path.slice('Math.'.length)))
}

function reportCJsGlobalDiagnostic(diagnostics: Diagnostic[], loc?: SourceLocation) {
  if (diagnostics.some(item => item.code === 'CCJS_C_JS_GLOBAL' && sameLocation(item, loc))) {
    return
  }

  diagnostics.push(diagnostic('CCJS_C_JS_GLOBAL', 'this JS global is not supported by the current C backend slice', loc))
}

function sameLocation(left: SourceLocation | undefined, right: SourceLocation | undefined): boolean {
  if (left == null || right == null) {
    return left == null && right == null
  }

  return left.line === right.line && left.column === right.column
}

function createBaseContext(diagnostics, functionDeclarations: IrFunctionDeclaration[], functionEffects: IrFunctionEffect[], jsGlobalRoots: Set<string>) {
  const throwing = createThrowingFunctionInfo(functionDeclarations, functionEffects)

  return {
    boxedMutableCaptureDeclarations: new Set(),
    classInfos: new Map(),
    callbackArrowWrappers: new Map(),
    callbackWrappers: new Map(),
    diagnostics,
    functionThrowValueTypes: throwing.functionThrowValueTypes,
    functionNames: new Map(functionDeclarations.map(item => [item.name, emitCFunctionName(item.name)])),
    functionParams: new Map(functionDeclarations.map(item => [item.name, item.params])),
    functionReturnArrayElementTypes: new Map(functionDeclarations.map(item => [item.name, item.returnArrayElementType ?? null])),
    functionReturnArrayElementDeclaredTypes: new Map(functionDeclarations.map(item => [item.name, item.returnArrayElementDeclaredType ?? null])),
    functionReturnMapTypes: new Map(functionDeclarations.map(item => [item.name, {
      key: item.returnMapKeyType ?? null,
      value: item.returnMapValueType ?? null
    }])),
    functionReturnNullables: new Map(functionDeclarations.map(item => [item.name, item.returnNullable === true])),
    functionReturnPromiseValueTypes: new Map(functionDeclarations.map(item => [item.name, item.returnPromiseValueType ?? null])),
    functionReturnShapes: new Map(functionDeclarations.map(item => [item.name, item.returnShape ?? null])),
    functionReturnSetElementTypes: new Map(functionDeclarations.map(item => [item.name, item.returnSetElementType ?? null])),
    functionReturnTypes: new Map(functionDeclarations.map(item => [item.name, item.returnType])),
    functionAsyncFlags: new Map(functionDeclarations.map(item => [item.name, item.async === true])),
    asyncTaskWrappers: new Map(),
    jsGlobalRoots,
    promiseChainArrowWrappers: new Map(),
    promiseChainWrappers: new Map(),
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
  const functionsByName = new Map(functions.flatMap(item => typeof item.name === 'string' ? [[item.name, item]] : []))
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

function functionUsesExternalEventLoop(node, externalNames) {
  let found = false
  const visit = value => {
    if (found || value == null) {
      return
    }

    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }

    if (typeof value !== 'object') {
      return
    }

    if (cTimerStartCallName(value.callee) != null) {
      found = true
      return
    }

    if (value.type === 'CallExpression' && value.callee?.type === 'Reference' && value.callee.path.length === 1 && externalNames.has(value.callee.path[0])) {
      found = true
      return
    }

    for (const [key, child] of Object.entries(value)) {
      if (key === 'loc' || key === 'shape') {
        continue
      }

      visit(child)
    }
  }

  visit(node)

  return found
}

function collectAsyncTaskWrappers(functions: IrFunctionNodeEntry[], context) {
  const wrappers = new Map()

  for (const { declaration, node: item } of functions) {
    const params = resolveAsyncTaskWrapperParams(declaration, context)
    const body = params == null ? null : resolveAsyncTaskWrapperBody(item, declaration, context, params)

    if (body == null) {
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
      awaits: body.awaits,
      returnExpression: body.returnExpression,
      returnType: body.returnType,
      tryRegion: body.tryRegion ?? null
    }

    wrappers.set(declaration.name, wrapper)
  }

  return wrappers
}

function resolveAsyncTaskWrapperParams(declaration: IrFunctionDeclaration, context) {
  if (declaration.async !== true || declaration.returnType !== 'promise' || isThrowingFunctionName(declaration.name, context)) {
    return null
  }

  const params = resolveFunctionDeclarationParams(declaration.name, declaration.params, context)

  if (params.some(param => param.nullable === true || !isSupportedAsyncTaskParamType(param.valueType))) {
    return null
  }

  return params.map(param => ({
    ...param,
    fieldName: `param_${emitCIdentifier(param.name)}`,
    argName: `ccjs_arg_${emitCIdentifier(param.name)}`
  }))
}

function isSupportedAsyncTaskParamType(valueType) {
  return valueType === 'number'
    || valueType === 'boolean'
    || valueType === 'string'
    || valueType === 'bytes'
}

function isSupportedAsyncTaskValueType(valueType) {
  return valueType === 'number'
    || valueType === 'boolean'
    || valueType === 'string'
    || valueType === 'bytes'
    || valueType === 'array'
    || valueType === 'void'
}

function resolveAsyncTaskWrapperBody(statement, declaration: IrFunctionDeclaration, context, params) {
  if (declaration.async !== true || declaration.returnType !== 'promise' || isThrowingFunctionName(declaration.name, context)) {
    return null
  }

  const returnType = declaration.returnPromiseValueType ?? context.functionReturnPromiseValueTypes.get(declaration.name) ?? 'unknown'

  if (!isSupportedAsyncTaskValueType(returnType)) {
    return null
  }

  const tryBody = resolveAsyncTaskTryWrapperBody(statement, context, params, returnType)

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

  return {
    awaits,
    returnExpression,
    returnType,
    tryRegion: null
  }
}

function resolveAsyncTaskTryWrapperBody(statement, context, params, returnType) {
  if (statement.body.length !== 1 || statement.body[0]?.type !== 'TryStatement') {
    return null
  }

  const tryStatement = statement.body[0]
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

  return {
    awaits,
    returnExpression,
    returnType,
    tryRegion: {
      handler,
      finalizerStatements
    }
  }
}

function resolveAsyncTaskTryHandler(handler, context, params, returnType) {
  if (handler == null) {
    return null
  }

  const statements = handler.body?.body ?? []
  const returnStatement = statements.at(-1)

  if (returnStatement?.type !== 'ReturnStatement' || hasUnsupportedAsyncTaskTryControlFlow(statements.slice(0, -1))) {
    return null
  }

  const catchContext = createAsyncTaskExpressionContext(context, params, [])

  if (handler.param != null) {
    catchContext.variables.set(handler.param, 'string')
    catchContext.runtimeStrings.add(handler.param)
  }

  const returnExpression = resolveAsyncTaskReturnValueExpression(returnStatement.argument, returnType, catchContext)

  if (returnExpression == null) {
    return null
  }

  return {
    param: handler.param,
    statements: statements.slice(0, -1),
    returnExpression
  }
}

function createAsyncTaskExpressionContext(context, params, awaits) {
  const result = {
    ...context,
    variables: new Map(context.variables ?? []),
    runtimeStrings: new Set(context.runtimeStrings ?? [])
  }

  for (const param of params) {
    result.variables.set(param.name, param.valueType)
  }

  for (const item of awaits ?? []) {
    result.variables.set(item.name, item.type)
  }

  return result
}

function hasUnsupportedAsyncTaskTryControlFlow(node) {
  if (node == null) {
    return false
  }

  if (Array.isArray(node)) {
    return node.some(item => hasUnsupportedAsyncTaskTryControlFlow(item))
  }

  if (typeof node !== 'object') {
    return false
  }

  if (['AwaitExpression', 'ReturnStatement', 'ThrowStatement', 'TryStatement', 'BreakStatement', 'ContinueStatement'].includes(node.type)) {
    return true
  }

  return Object.values(node).some(value => hasUnsupportedAsyncTaskTryControlFlow(value))
}

function resolveAsyncTaskAwaitSteps(statements, context) {
  const awaits: Array<Record<string, any>> = []

  for (let index = 0; index < statements.length;) {
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

    return null
  }

  return awaits.length === 0 ? null : awaits
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
    arrayElementType: statement.arrayElementType ?? statement.init.arrayElementType ?? awaitedExpression?.arrayElementType ?? 'unknown',
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
    arrayElementType: awaitStatement.arrayElementType ?? awaitStatement.init.arrayElementType ?? awaitedPromiseExpression.arrayElementType,
    awaitedExpression: null,
    awaitedPromiseExpression
  }
}

function resolveAsyncTaskAwaitedPromiseExpression(promiseStatement, awaitStatement, context) {
  if (promiseStatement == null) {
    return null
  }

  if (
    promiseStatement.type !== 'VariableDeclaration'
    || promiseStatement.init?.valueType !== 'promise'
    || !isSupportedAsyncTaskAwaitedPromiseExpression(promiseStatement.init, context)
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

  return receiver?.type === 'CallExpression'
    && cPromiseRuntimeCallName(receiver.callee) === 'resolve'
    && callback?.type === 'ArrowFunctionExpression'
    && context.promiseChainArrowWrappers.has(callback)
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

  if (isPromiseReturningFunctionCallee(expression.callee, context)) {
    return true
  }

  if (!isAsyncFunctionCallee(expression.callee, context) || isThrowingFunctionCallee(expression.callee, context)) {
    return false
  }

  const valueType = resolveCAsyncFunctionAwaitValueType(expression.callee, context) ?? expression.promiseValueType ?? 'unknown'

  return isSupportedAsyncTaskValueType(valueType)
}

function isAsyncFsRuntimeCallExpression(expression) {
  const method = cFsRuntimeCallName(expression?.callee)

  return expression?.valueType === 'promise'
    && ['readFile', 'readFileBytes', 'readDir', 'writeFile', 'writeFileBytes'].includes(method)
}

function resolveAsyncTaskReturnValueExpression(expression, returnType, context) {
  if (returnType === 'void') {
    return expression == null ? null : expression
  }

  if (expression?.type === 'CallExpression' && cPromiseRuntimeCallName(expression.callee) === 'resolve') {
    return expression.args[0] ?? null
  }

  const expressionType = expression?.valueType != null && expression.valueType !== 'unknown'
    ? expression.valueType
    : context.variables == null ? 'unknown' : inferExpressionType(expression, context)

  if (isSupportedAsyncTaskValueType(returnType) && expressionType === returnType) {
    return expression
  }

  return null
}

function emitAsyncTaskFrameType(wrapper) {
  return [
    `typedef struct ${wrapper.frameTypeName} {`,
    '  ccjs_loop* ccjs_loop;',
    '  ccjs_promise* promise;',
    '  ccjs_promise* awaited;',
    '  int state;',
    ...wrapper.params.map(param => `  ${emitAsyncTaskStorageCType(param.valueType)} ${param.fieldName};`),
    ...wrapper.awaits.filter(item => item.fieldName != null).map(item => `  ${emitAsyncTaskStorageCType(item.type)} ${item.fieldName};`),
    `} ${wrapper.frameTypeName};`
  ]
}

function emitAsyncTaskStorageCType(valueType) {
  return isManagedRuntimeReturnType(valueType) ? 'ccjs_value' : emitCType(valueType)
}

function emitAsyncTaskStorageInit(valueType) {
  return isManagedRuntimeReturnType(valueType) ? 'ccjs_undefined_value()' : '0'
}

function emitAsyncTaskWrapperPrototypes(wrapper) {
  return [
    `static ccjs_status ${wrapper.startName}(${emitAsyncTaskStartParams(wrapper)});`,
    `static ccjs_status ${wrapper.resumeName}(void* context, ccjs_value ccjs_value_input);`,
    `static ccjs_status ${wrapper.rejectName}(void* context, ccjs_value ccjs_error);`,
    `static void ${wrapper.finalizerName}(void* context);`
  ]
}

function emitAsyncTaskWrapperDeclaration(wrapper, baseContext) {
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
  const schedule = emitAsyncTaskScheduleAwaitLines(wrapper, wrapper.awaits[0], context, {
    cleanup: 'start',
    final: wrapper.awaits.length === 1
  })
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
    ...wrapper.params.map(param => `  frame->${param.fieldName} = ${param.argName};`),
    ...wrapper.awaits.filter(item => item.fieldName != null).map(item => `  frame->${item.fieldName} = ${emitAsyncTaskStorageInit(item.type)};`),
    '  ccjs_status status = ccjs_promise_new(ccjs_loop, &frame->promise);',
    '  if (status != CCJS_OK) {',
    '    ccjs_loop->allocator->free(ccjs_loop->allocator->user, frame, sizeof(*frame), _Alignof(*frame));',
    '    return status;',
    '  }',
    ...wrapper.params.filter(param => isManagedRuntimeReturnType(param.valueType)).map(param => `  ccjs_retain(frame->${param.fieldName});`),
    '  ccjs_promise_retain(frame->promise);',
    '  *out = frame->promise;',
    ...emitAsyncTaskVisibleLocalReads(wrapper, 0).map(line => `  ${line}`),
    ...schedule.map(line => `  ${line}`),
    '  return CCJS_OK;',
    '}'
  ]

  return lines
}

function emitAsyncTaskStartParams(wrapper) {
  const params = [
    'ccjs_loop* ccjs_loop',
    ...wrapper.params.map(param => `${emitCType(param.valueType)} ${param.argName}`),
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
  for (const item of wrapper.awaits.slice(0, count)) {
    if (item.name != null) {
      registerAsyncTaskLocalMetadata(item.name, item.type, item, context)
    }
  }
}

function emitAsyncTaskVisibleLocalReads(wrapper, count) {
  return [
    ...wrapper.params.flatMap(param => emitAsyncTaskVisibleLocalRead(param.name, param.valueType, param.fieldName)),
    ...wrapper.awaits.slice(0, count).flatMap(item => item.name == null ? [] : emitAsyncTaskVisibleLocalRead(item.name, item.type, item.fieldName))
  ]
}

function registerAsyncTaskLocalMetadata(name, valueType, item, context) {
  context.variables.set(name, valueType)

  if (valueType === 'string') {
    context.runtimeStrings.add(name)
  } else if (valueType === 'array') {
    context.runtimeArrayElementTypes.set(name, item.arrayElementType ?? 'unknown')
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
  registerAsyncTaskAwaitLocals(wrapper, context, visibleAwaitCount)

  return context
}

function emitAsyncTaskScheduleAwaitLines(wrapper, item, context, options) {
  const awaitedPromise = emitPreparedAsyncTaskAwaitedPromiseExpression(wrapper, item, context, options)
  const awaited = awaitedPromise == null ? emitPreparedAsyncTaskAwaitedValueExpression(item, context) : null
  const finalizer = options.final ? wrapper.finalizerName : '0'

  return [
    ...(awaitedPromise == null
      ? [
          'status = ccjs_promise_new(ccjs_loop, &frame->awaited);',
          ...emitAsyncTaskScheduleStatusCheck(wrapper, options),
        ]
      : awaitedPromise.lines),
    `status = ccjs_promise_then(frame->awaited, ${wrapper.resumeName}, ${wrapper.rejectName}, frame, ${finalizer});`,
    ...emitAsyncTaskScheduleStatusCheck(wrapper, options),
    ...(awaitedPromise == null
      ? [
          ...(awaited?.lines ?? []),
          `status = ccjs_promise_resolve(frame->awaited, ${awaited?.expression ?? 'ccjs_undefined_value()'});`,
          ...emitAsyncTaskResolveStatusCheck(wrapper, options)
        ]
      : [])
  ]
}

function emitAsyncTaskScheduleStatusCheck(wrapper, options, cleanupLines: string[] = []) {
  if (options.cleanup === 'start') {
    return [
      'if (status != CCJS_OK) {',
      ...cleanupLines.map(line => `  ${line}`),
      '  ccjs_promise_release(*out);',
      '  *out = 0;',
      `  ${wrapper.finalizerName}(frame);`,
      '  return status;',
      '}'
    ]
  }

  return [
    'if (status != CCJS_OK) {',
    ...cleanupLines.map(line => `  ${line}`),
    '  ccjs_status reject_status = ccjs_promise_reject(frame->promise, ccjs_number_value((ccjs_number)status));',
    `  ${wrapper.finalizerName}(frame);`,
    '  return reject_status == CCJS_OK ? status : reject_status;',
    '}'
  ]
}

function emitAsyncTaskResolveStatusCheck(wrapper, options) {
  if (options.cleanup === 'start') {
    return [
      'if (status != CCJS_OK) {',
      '  ccjs_promise_release(*out);',
      '  *out = 0;',
      ...(options.final ? [] : [`  ${wrapper.finalizerName}(frame);`]),
      '  return status;',
      '}'
    ]
  }

  if (options.final) {
    return [
      'if (status != CCJS_OK) return status;'
    ]
  }

  return emitAsyncTaskScheduleStatusCheck(wrapper, options)
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

  if (item.awaitedPromiseExpression?.type !== 'CallExpression' || cPromiseRuntimeCallName(item.awaitedPromiseExpression.callee) !== 'resolve') {
    context.diagnostics.push(diagnostic('CCJS_C_ASYNC', 'async task state-machine slice currently supports local Promise.resolve(...) variables only', item.awaitedPromiseExpression?.loc))

    return {
      lines: [
        'status = CCJS_ERR_TYPE;',
        ...emitAsyncTaskScheduleStatusCheck(wrapper, options)
      ]
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

  const method = cFsRuntimeCallName(expression.callee)
  const path = emitPreparedStringBytesOperand(expression.args[0], context, 'ccjs_fs_path')
  const lines = [
    ...path.lines
  ]

  if (method === 'readFile') {
    lines.push(`status = ccjs_fs_read_file(ccjs_loop, ${path.bytes}, ${path.length}, &frame->awaited);`)
  } else if (method === 'readFileBytes') {
    lines.push(`status = ccjs_fs_read_file_bytes(ccjs_loop, ${path.bytes}, ${path.length}, &frame->awaited);`)
  } else if (method === 'readDir') {
    lines.push(`status = ccjs_fs_read_dir(ccjs_loop, ${path.bytes}, ${path.length}, &frame->awaited);`)
  } else if (method === 'writeFileBytes') {
    const bytes = emitCValueExpression(expression.args[1], context)

    lines.push(...bytes.lines)
    lines.push(emitRuntimeValueCheck(bytes.expression, 'CCJS_TAG_BYTES', context))
    lines.push(`status = ccjs_fs_write_file_bytes(ccjs_loop, ${path.bytes}, ${path.length}, ${bytes.expression}, &frame->awaited);`)
  } else {
    const bytes = emitPreparedStringBytesOperand(expression.args[1], context, 'ccjs_fs_bytes')

    lines.push(...bytes.lines)
    lines.push(`status = ccjs_fs_write_file(ccjs_loop, ${path.bytes}, ${path.length}, ${bytes.bytes}, ${bytes.length}, &frame->awaited);`)
  }

  return {
    lines: [
      ...lines,
      ...emitAsyncTaskScheduleStatusCheck(wrapper, options)
    ]
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
    expression.args[0] != null
    && expression.args[0].type !== 'NumberLiteral'
    && expression.args[0].type !== 'BooleanLiteral'
  ) {
    context.diagnostics.push(diagnostic('CCJS_C_ASYNC', 'async task Promise.reject currently supports string, number and boolean rejection values in C', expression.loc))

    return {
      lines: [
        'status = CCJS_ERR_TYPE;',
        ...emitAsyncTaskScheduleStatusCheck(wrapper, options)
      ]
    }
  }

  const value = expression.args[0] == null
    ? {
        lines: [],
        expression: 'ccjs_undefined_value()'
      }
    : emitCValueExpression(expression.args[0], context)

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

  const prepared = emitPreparedCallArgs(expression, target.params, context)
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
  if (!isAsyncFunctionCallee(expression.callee, context) || isThrowingFunctionCallee(expression.callee, context)) {
    return null
  }

  const valueType = resolveCAsyncFunctionAwaitValueType(expression.callee, context) ?? expression.promiseValueType ?? 'unknown'

  if (!isSupportedAsyncTaskValueType(valueType)) {
    return null
  }

  const call = emitPreparedCallExpression(expression, context)

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

  const value = valueType === 'boolean'
    ? `ccjs_bool_value((${call.expression}) != 0)`
    : `ccjs_number_value(${call.expression})`

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

  const params = resolveFunctionParams(expression.callee, context)

  if (params == null) {
    return null
  }

  const prepared = emitPreparedCallArgs(expression, params, context)

  return {
    lines: [
      ...prepared.lines,
      `frame->awaited = ${emitCallee(expression.callee, context)}(${['ccjs_loop', ...prepared.args].join(', ')});`,
      'status = frame->awaited == 0 ? CCJS_ERR_TYPE : CCJS_OK;',
      ...emitAsyncTaskScheduleStatusCheck(wrapper, options)
    ]
  }
}

function emitPreparedAsyncTaskAwaitedPromiseChainExpression(wrapper, item, context, options) {
  const expression = item.awaitedPromiseExpression

  if (expression?.type !== 'CallExpression' || expression.callee?.type !== 'MemberExpression' || expression.callee.property !== 'then') {
    return null
  }

  const receiver = expression.callee.object
  const callback = expression.args[0]
  const chainWrapper = callback == null ? null : context.promiseChainArrowWrappers.get(callback)

  if (receiver?.type !== 'CallExpression' || cPromiseRuntimeCallName(receiver.callee) !== 'resolve' || chainWrapper == null) {
    context.diagnostics.push(diagnostic('CCJS_C_ASYNC', 'async task state-machine slice currently supports local Promise.resolve(...).then(...) variables only', expression.loc))

    return {
      lines: [
        'status = CCJS_ERR_TYPE;',
        ...emitAsyncTaskScheduleStatusCheck(wrapper, options)
      ]
    }
  }

  const source = nextCName(context, 'ccjs_async_task_source')
  const sourceType = receiver.promiseValueType ?? callback.params[0]?.valueType ?? item.type
  const value = emitPreparedAsyncTaskValueExpression(receiver.args[0], sourceType, context)
  const callbackContext = emitAsyncTaskPromiseChainCallbackContext(wrapper, chainWrapper, context, options)
  const cleanupLines = callbackContext.expression === '0'
    ? []
    : [`${chainWrapper.finalizerName}(${callbackContext.expression});`]

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
    if (capture.mutable && !isSupportedMutableRuntimeArrowCapture(capture, context)) {
      context.diagnostics.push(diagnostic('CCJS_C_ASYNC', 'capturing this mutable binding in async Promise callbacks requires unsupported boxed closure storage', chainWrapper.expression.loc))
    }

    if (!['number', 'boolean', 'string', 'object'].includes(capture.valueType)) {
      context.diagnostics.push(diagnostic('CCJS_C_ASYNC', 'capturing async Promise callbacks currently support only const number/boolean/string/object bindings', chainWrapper.expression.loc))
    }
  }

  const contextName = nextCName(context, 'ccjs_promise_callback_ctx')

  lines.push(`${chainWrapper.contextTypeName}* ${contextName} = ccjs_default_alloc(0, sizeof(${chainWrapper.contextTypeName}), _Alignof(${chainWrapper.contextTypeName}));`)
  lines.push('if (' + contextName + ' == 0) {')
  lines.push('  status = CCJS_ERR_OOM;')
  lines.push(...emitAsyncTaskScheduleStatusCheck(asyncWrapper, options).map(line => `  ${line}`))
  lines.push('}')

  if (chainWrapper.needsEventLoop === true) {
    lines.push(`${contextName}->ccjs_loop = ccjs_loop;`)
  }

  for (const capture of chainWrapper.captures) {
    lines.push(...emitRuntimeArrowCaptureStoreLines(capture, contextName, context))
  }

  return {
    lines,
    expression: contextName,
    finalizer: chainWrapper.finalizerName
  }
}

function emitPreparedAsyncTaskAwaitedValueExpression(item, context) {
  if (item.awaitedExpression?.type !== 'CallExpression' || cPromiseRuntimeCallName(item.awaitedExpression.callee) !== 'resolve') {
    context.diagnostics.push(diagnostic('CCJS_C_ASYNC', 'async task state-machine slice currently supports await Promise.resolve(...) only', item.awaitedExpression?.loc))

    return {
      lines: [
        'status = CCJS_ERR_TYPE;'
      ],
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
    const value = emitCValueExpression(expression, context)
    const expectedTag = cRuntimeValueTag(valueType)

    return {
      lines: [
        ...value.lines,
        emitRuntimeValueCheck(value.expression, expectedTag, context)
      ],
      expression: value.expression
    }
  }

  if (valueType === 'boolean') {
    const value = emitPreparedNumberExpression(expression, context)

    return {
      lines: value.lines,
      expression: `ccjs_bool_value((${value.expression}) != 0)`
    }
  }

  const value = emitPreparedNumberExpression(expression, context)

  return {
    lines: value.lines,
    expression: `ccjs_number_value(${value.expression})`
  }
}

function emitAsyncTaskResumeDeclaration(wrapper, baseContext) {
  const context = createAsyncTaskEmitContext(baseContext, wrapper, wrapper.returnType, wrapper.awaits.length)
  const returnValue = emitPreparedAsyncTaskValueExpression(wrapper.returnExpression, wrapper.returnType, context)
  const cases = wrapper.awaits.flatMap(item => emitAsyncTaskResumeCase(wrapper, item, baseContext, returnValue))

  return [
    `static ccjs_status ${wrapper.resumeName}(void* context, ccjs_value ccjs_value_input) {`,
    `  ${wrapper.frameTypeName}* frame = (${wrapper.frameTypeName}*)context;`,
    '  if (frame == 0 || frame->promise == 0) return CCJS_ERR_TYPE;',
    '  ccjs_status status = CCJS_OK;',
    '  switch (frame->state) {',
    ...cases.map(line => `  ${line}`),
    '  default:',
    '    return ccjs_promise_reject(frame->promise, ccjs_number_value((ccjs_number)CCJS_ERR_TYPE));',
    '  }',
    '}'
  ]
}

function emitAsyncTaskResumeCase(wrapper, item, baseContext, returnValue) {
  const nextItem = wrapper.awaits[item.index + 1] ?? null
  const valueCheck = emitAsyncTaskFulfilledValueCheck(wrapper, item)
  const lines = [
    `case ${item.index}: {`,
    ...valueCheck.map(line => `  ${line}`),
    ...emitAsyncTaskStoreFulfilledValueLines(item).map(line => `  ${line}`),
    '  if (frame->awaited != 0) {',
    '    ccjs_promise_release(frame->awaited);',
    '    frame->awaited = 0;',
    '  }'
  ]

  if (nextItem == null) {
    lines.push(...emitAsyncTaskVisibleLocalReads(wrapper, item.index + 1).map(line => `  ${line}`))
    lines.push(...returnValue.lines.map(line => `  ${line}`))
    lines.push(...emitAsyncTaskTryFinallyLines(wrapper, baseContext, item.index + 1).map(line => `  ${line}`))
    lines.push(`  return ccjs_promise_resolve(frame->promise, ${returnValue.expression});`)
    lines.push('}')
    return lines
  }

  const context = createAsyncTaskEmitContext(baseContext, wrapper, 'void', item.index + 1)
  const schedule = emitAsyncTaskScheduleAwaitLines(wrapper, nextItem, context, {
    cleanup: 'resume',
    final: nextItem.index === wrapper.awaits.length - 1
  })

  lines.push(...emitAsyncTaskVisibleLocalReads(wrapper, item.index + 1).map(line => `  ${line}`))
  lines.push('  ccjs_loop* ccjs_loop = frame->ccjs_loop;')
  lines.push('  if (ccjs_loop == 0) {')
  lines.push(...emitAsyncTaskRejectAndMaybeFinalizeLines(wrapper, item, 'ccjs_number_value((ccjs_number)CCJS_ERR_TYPE)').map(line => `    ${line}`))
  lines.push('  }')
  lines.push(`  frame->state = ${nextItem.index};`)
  lines.push(...schedule.map(line => `  ${line}`))
  lines.push('  return CCJS_OK;')
  lines.push('}')

  return lines
}

function emitAsyncTaskFulfilledValueCheck(wrapper, item) {
  const expectedTag = cRuntimeValueTag(item.type)

  if (expectedTag == null) {
    return []
  }

  const refCheck = isManagedRuntimeReturnType(item.type) ? ' || ccjs_value_input.as.ref == 0' : ''

  return [
    `if (ccjs_value_input.tag != ${expectedTag}${refCheck}) {`,
    ...emitAsyncTaskRejectAndMaybeFinalizeLines(wrapper, item, 'ccjs_number_value((ccjs_number)CCJS_ERR_TYPE)').map(line => `  ${line}`),
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
    return [
      `frame->${item.fieldName} = ccjs_value_input;`,
      `ccjs_retain(frame->${item.fieldName});`
    ]
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

function emitAsyncTaskTryFinallyLines(wrapper, baseContext, visibleAwaitCount) {
  if (wrapper.tryRegion == null || wrapper.tryRegion.finalizerStatements.length === 0) {
    return []
  }

  const context = createAsyncTaskEmitContext(baseContext, wrapper, 'void', visibleAwaitCount)

  return withVariableScope(context, () => emitStatementList(wrapper.tryRegion.finalizerStatements, context))
}

function emitAsyncTaskSettleAndMaybeFinalizeLines(wrapper, item, call) {
  return [
    `status = ${call};`,
    ...(item.index < wrapper.awaits.length - 1 ? [`${wrapper.finalizerName}(frame);`] : []),
    'return status;'
  ]
}

function emitAsyncTaskRejectDeclaration(wrapper, baseContext) {
  if (wrapper.tryRegion != null) {
    return emitAsyncTaskTryRejectDeclaration(wrapper, baseContext)
  }

  const lastState = wrapper.awaits.length - 1

  return [
    `static ccjs_status ${wrapper.rejectName}(void* context, ccjs_value ccjs_error) {`,
    `  ${wrapper.frameTypeName}* frame = (${wrapper.frameTypeName}*)context;`,
    '  if (frame == 0 || frame->promise == 0) return CCJS_ERR_TYPE;',
    '  ccjs_status status = ccjs_promise_reject(frame->promise, ccjs_error);',
    ...(lastState > 0
      ? [
          `  if (frame->state < ${lastState}) {`,
          `    ${wrapper.finalizerName}(frame);`,
          '  }'
        ]
      : []),
    '  return status;',
    '}'
  ]
}

function emitAsyncTaskTryRejectDeclaration(wrapper, baseContext) {
  const cases = wrapper.awaits.flatMap(item => emitAsyncTaskTryRejectCase(wrapper, item, baseContext))

  return [
    `static ccjs_status ${wrapper.rejectName}(void* context, ccjs_value ccjs_error) {`,
    `  ${wrapper.frameTypeName}* frame = (${wrapper.frameTypeName}*)context;`,
    '  if (frame == 0 || frame->promise == 0) return CCJS_ERR_TYPE;',
    '  ccjs_status status = CCJS_OK;',
    '  switch (frame->state) {',
    ...cases.map(line => `  ${line}`),
    '  default:',
    '    status = ccjs_promise_reject(frame->promise, ccjs_error);',
    '    return status;',
    '  }',
    '}'
  ]
}

function emitAsyncTaskTryRejectCase(wrapper, item, baseContext) {
  const handler = wrapper.tryRegion?.handler ?? null
  const lines = [
    `case ${item.index}: {`
  ]

  if (handler == null) {
    lines.push(...emitAsyncTaskVisibleLocalReads(wrapper, item.index).map(line => `  ${line}`))
    lines.push(...emitAsyncTaskTryFinallyLines(wrapper, baseContext, item.index).map(line => `  ${line}`))
    lines.push(...emitAsyncTaskSettleAndMaybeFinalizeLines(wrapper, item, 'ccjs_promise_reject(frame->promise, ccjs_error)').map(line => `  ${line}`))
    lines.push('}')

    return lines
  }

  if (handler.param != null) {
    lines.push('  if (ccjs_error.tag != CCJS_TAG_STRING || ccjs_error.as.ref == 0) {')
    lines.push(...emitAsyncTaskSettleAndMaybeFinalizeLines(wrapper, item, 'ccjs_promise_reject(frame->promise, ccjs_number_value((ccjs_number)CCJS_ERR_TYPE))').map(line => `    ${line}`))
    lines.push('  }')
  }

  const context = createAsyncTaskEmitContext(baseContext, wrapper, wrapper.returnType, item.index)

  if (handler.param != null) {
    context.variables.set(handler.param, 'string')
    context.runtimeStrings.add(handler.param)
  }

  lines.push(...emitAsyncTaskVisibleLocalReads(wrapper, item.index).map(line => `  ${line}`))

  if (handler.param != null) {
    lines.push(`  ccjs_string* ${handler.param} = (ccjs_string*)ccjs_error.as.ref;`)
  }

  lines.push(...emitStatementList(handler.statements, context).map(line => `  ${line}`))

  const returnValue = emitPreparedAsyncTaskValueExpression(handler.returnExpression, wrapper.returnType, context)

  lines.push(...returnValue.lines.map(line => `  ${line}`))
  lines.push(...emitAsyncTaskTryFinallyLines(wrapper, baseContext, item.index).map(line => `  ${line}`))
  lines.push(...emitAsyncTaskSettleAndMaybeFinalizeLines(wrapper, item, `ccjs_promise_resolve(frame->promise, ${returnValue.expression})`).map(line => `  ${line}`))
  lines.push('}')

  return lines
}

function emitAsyncTaskFinalizerDeclaration(wrapper) {
  return [
    `static void ${wrapper.finalizerName}(void* context) {`,
    `  ${wrapper.frameTypeName}* frame = (${wrapper.frameTypeName}*)context;`,
    '  if (frame == 0) return;',
    '  if (frame->awaited != 0) ccjs_promise_release(frame->awaited);',
    ...wrapper.params.filter(param => isManagedRuntimeReturnType(param.valueType)).map(param => `  ccjs_release(frame->${param.fieldName});`),
    ...wrapper.awaits.filter(item => item.fieldName != null && isManagedRuntimeReturnType(item.type)).map(item => `  ccjs_release(frame->${item.fieldName});`),
    '  if (frame->promise != 0) ccjs_promise_release(frame->promise);',
    '  if (frame->ccjs_loop != 0 && frame->ccjs_loop->allocator != 0) {',
    '    frame->ccjs_loop->allocator->free(frame->ccjs_loop->allocator->user, frame, sizeof(*frame), _Alignof(*frame));',
    '  }',
    '}'
  ]
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
    return emitAsyncTaskFunctionStubDeclaration(statement, context)
  }

  if (context.throwingFunction) {
    registerErrorChannel(context)
  }

  registerFunctionParamsInContext(statement, params, context)

  const bodyLines: string[] = []

  bodyLines.push(...emitRuntimeParamPreludeForParams(statement, params, context).map(line => `  ${line}`))

  bodyLines.push(...emitStatementList(statement.body, context).map(line => `  ${line}`))

  const lines = [
    `${emitFunctionHead(statement, context)} {`,
    ...emitThrowingFunctionPrelude(context).map(line => `  ${line}`),
    ...emitReturnValueDeclarations(context).map(line => `  ${line}`),
    ...emitStatusResultDeclarations(context).map(line => `  ${line}`),
    ...emitLoopFlowDeclarations(context).map(line => `  ${line}`),
    ...emitReturnFlowDeclarations(context).map(line => `  ${line}`),
    ...emitEventLoopDeclarations(context).map(line => `  ${line}`),
    ...emitOwnedValueDeclarations(context).map(line => `  ${line}`),
    ...emitOwnedPromiseDeclarations(context).map(line => `  ${line}`),
    ...emitErrorChannelDeclarations(context).map(line => `  ${line}`),
    ...emitBoxedValueDeclarations(context).map(line => `  ${line}`),
    ...emitEventLoopInit(context).map(line => `  ${line}`),
    ...bodyLines
  ]

  if (shouldEmitCleanupLabel(context)) {
    lines.push('ccjs_cleanup:')
    lines.push(...emitThrowingFunctionErrorTransfer(context).map(line => `  ${line}`))
    lines.push(...emitOwnedValueCleanup(context).map(line => `  ${line}`))
    lines.push(...emitOwnedPromiseCleanup(context).map(line => `  ${line}`))
    lines.push(...emitEventLoopCleanup(context).map(line => `  ${line}`))
    lines.push(...emitBoxedValueCleanup(context).map(line => `  ${line}`))
    lines.push(...emitCleanupReturn(context).map(line => `  ${line}`))
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
    } else if (isBoxedFunctionParam(param, index, statement, context) && ['number', 'boolean', 'string', 'object'].includes(param.valueType)) {
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

function emitAsyncTaskFunctionStubDeclaration(statement, context) {
  const returnLine = context.returnType === 'void'
    ? '  return;'
    : isManagedRuntimeReturnType(context.returnType)
      ? '  return ccjs_undefined_value();'
      : '  return 0;'

  return [
    `${emitFunctionHead(statement, context)} {`,
    returnLine,
    '}'
  ]
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

  bodyLines.push(...emitRuntimeParamPreludeForParams(method, params, context).map(line => `  ${line}`))
  bodyLines.push(...emitStatementList(method.body, context).map(line => `  ${line}`))

  const lines = [
    `${emitClassMethodHead(info, method, context)} {`,
    ...emitReturnValueDeclarations(context).map(line => `  ${line}`),
    ...emitStatusResultDeclarations(context).map(line => `  ${line}`),
    ...emitLoopFlowDeclarations(context).map(line => `  ${line}`),
    ...emitReturnFlowDeclarations(context).map(line => `  ${line}`),
    ...emitOwnedValueDeclarations(context).map(line => `  ${line}`),
    ...emitOwnedPromiseDeclarations(context).map(line => `  ${line}`),
    ...emitErrorChannelDeclarations(context).map(line => `  ${line}`),
    ...emitBoxedValueDeclarations(context).map(line => `  ${line}`),
    ...bodyLines
  ]

  if (shouldEmitCleanupLabel(context)) {
    lines.push('ccjs_cleanup:')
    lines.push(...emitOwnedValueCleanup(context).map(line => `  ${line}`))
    lines.push(...emitOwnedPromiseCleanup(context).map(line => `  ${line}`))
    lines.push(...emitBoxedValueCleanup(context).map(line => `  ${line}`))
    lines.push(...emitCleanupReturn(context).map(line => `  ${line}`))
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

function emitCClassMethodName(className, methodName) {
  return `ccjs_method_${emitCIdentifier(className)}_${emitCIdentifier(methodName)}`
}

function resolveCFunctionReturnInfo(statement, context) {
  const returnType = resolveFunctionReturnType(statement.name, statement.returnType, context)
  const returnNullable = resolveFunctionReturnNullable(statement.name, statement.returnNullable, context)

  if (context.functionAsyncFlags.get(statement.name) === true && returnType === 'promise') {
    return {
      returnType: context.functionReturnPromiseValueTypes.get(statement.name) ?? statement.returnPromiseValueType ?? 'void',
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

  context.diagnostics.push(diagnostic('CCJS_C_FUNCTION_VALUE', 'typed C callbacks currently support only void callbacks with number/boolean/string/object parameters', loc))
}

const genericFunctionType = {
  kind: 'function',
  params: [],
  returnType: 'void'
}

function normalizeFunctionType(functionType) {
  return functionType ?? genericFunctionType
}

function isPlainFunctionPointerType(functionType) {
  return functionType == null
    || (functionType.returnType === 'void' && functionType.params.every(param => ['number', 'boolean'].includes(param.valueType)))
}

function isRuntimeFunctionType(functionType) {
  return functionType != null
    && isSupportedRuntimeCallbackReturnType(functionType.returnType)
    && functionType.params.some(param => ['string', 'object'].includes(param.valueType))
    && functionType.params.every(param => ['number', 'boolean', 'string', 'object'].includes(param.valueType))
}

function isNullableFunctionType(valueType, nullable) {
  return valueType === 'function' && nullable === true
}

function isSupportedRuntimeCallbackType(functionType) {
  const normalized = normalizeFunctionType(functionType)

  return isSupportedRuntimeCallbackReturnType(normalized.returnType)
    && normalized.params.every(param => ['number', 'boolean', 'string', 'object'].includes(param.valueType))
}

function isSupportedRuntimeCallbackReturnType(returnType) {
  return ['void', 'number', 'boolean', 'string', 'object'].includes(returnType)
}

function runtimeFunctionParamKey(functionName, index) {
  return `${functionName}:${index}`
}

function markRuntimeFunctionParam(callee, index, functionType, context) {
  if (callee?.type !== 'Reference' || callee.path.length !== 1) {
    return
  }

  const name = callee.path[0]

  if (!context.functionParams.has(name) || !isSupportedRuntimeCallbackType(functionType)) {
    return
  }

  context.runtimeFunctionParams.set(runtimeFunctionParamKey(name, index), normalizeFunctionType(functionType))
}

function resolveFunctionParameterRuntimeType(functionName, index, param, context) {
  const promoted = context.runtimeFunctionParams.get(runtimeFunctionParamKey(functionName, index))

  if (promoted != null) {
    return promoted
  }

  if (isNullableFunctionType(param.valueType, param.nullable)) {
    return normalizeFunctionType(param.functionType)
  }

  return isRuntimeFunctionType(param.functionType) ? normalizeFunctionType(param.functionType) : null
}

function resolveRuntimeFunctionArgumentType(callee, index, param, context) {
  if (param?.valueType !== 'function') {
    return null
  }

  if (callee?.type === 'Reference' && callee.path.length === 1) {
    const promoted = context.runtimeFunctionParams.get(runtimeFunctionParamKey(callee.path[0], index))

    if (promoted != null) {
      return promoted
    }
  }

  if (isNullableFunctionType(param.valueType, param.nullable)) {
    return normalizeFunctionType(param.functionType)
  }

  return isRuntimeFunctionType(param.functionType) ? normalizeFunctionType(param.functionType) : null
}

function collectCallbackWrappers(irPrograms: IrProgram[], context) {
  const wrappers = new Map()
  const pendingPlainFunctionArgs: any[] = []
  const register = (expression, functionType, scopes) => {
    const arrowNeedsEventLoop = expression?.type === 'ArrowFunctionExpression'
      && functionUsesExternalEventLoop(expression, context.externalEventLoopFunctions)

    if (isPlainFunctionPointerType(functionType) && expression?.type === 'ArrowFunctionExpression' && !arrowNeedsEventLoop) {
      registerPlainArrow(expression, functionType, scopes)
      return
    }

    if (arrowNeedsEventLoop && isSupportedRuntimeCallbackType(functionType)) {
      registerRuntime(expression, functionType, scopes)
      return
    }

    if (!isRuntimeFunctionType(functionType)) {
      return
    }

    if (expression?.type === 'ArrowFunctionExpression') {
      registerArrow(expression, functionType, scopes)
      return
    }

    registerNamed(expression, functionType)
  }
  const registerRuntime = (expression, functionType, scopes) => {
    const normalized = normalizeFunctionType(functionType)

    if (!isSupportedRuntimeCallbackType(normalized)) {
      return
    }

    if (expression?.type === 'ArrowFunctionExpression') {
      registerArrow(expression, normalized, scopes)
      return
    }

    registerNamed(expression, normalized)
  }
  const registerPlain = (expression, functionType, scopes) => {
    if (expression?.type === 'ArrowFunctionExpression') {
      registerPlainArrow(expression, functionType, scopes)
    }
  }
  const hasCaptures = (expression, scopes) => expression?.type === 'ArrowFunctionExpression'
    && collectArrowCaptures(expression, scopes, context).length > 0
  const shouldPromotePlainFunctionExpression = (expression, functionType, scopes) => isPlainFunctionPointerType(functionType)
    && isSupportedRuntimeCallbackType(functionType)
    && hasCaptures(expression, scopes)
  const registerNamed = (expression, functionType) => {
    if (expression?.type !== 'Reference' || expression.path.length !== 1) {
      return
    }

    const target = expression.path[0]

    if (!context.functionNames.has(target)) {
      return
    }

    const key = runtimeCallbackWrapperKey(target, functionType)

    if (wrappers.has(key)) {
      return
    }

    wrappers.set(key, {
      kind: 'named',
      key,
      name: `ccjs_callback_${emitCIdentifier(target)}_${wrappers.size}`,
      target,
      functionType
    })
  }
  const registerArrow = (expression, functionType, scopes) => {
    if (context.callbackArrowWrappers.has(expression)) {
      return
    }

    const index = wrappers.size
    const key = `arrow:${index}`
    const captures = collectArrowCaptures(expression, scopes, context)

    for (const capture of captures) {
      if (capture.mutable && ['number', 'boolean', 'string', 'object'].includes(capture.valueType) && capture.declaration != null) {
        context.boxedMutableCaptureDeclarations.add(capture.declaration)
      }
    }

    const wrapper = {
      kind: 'arrow',
      key,
      name: `ccjs_callback_arrow_${index}`,
      contextTypeName: `ccjs_callback_context_${index}`,
      finalizerName: `ccjs_callback_context_${index}_finalize`,
      expression,
      functionType,
      needsEventLoop: functionUsesExternalEventLoop(expression, context.externalEventLoopFunctions),
      captures
    }

    wrappers.set(key, wrapper)
    context.callbackArrowWrappers.set(expression, wrapper)
  }
  const registerPlainArrow = (expression, functionType, scopes) => {
    if (context.callbackArrowWrappers.has(expression)) {
      return
    }

    const captures = collectArrowCaptures(expression, scopes, context)

    if (captures.length > 0) {
      return
    }

    const index = wrappers.size
    const key = `plain-arrow:${index}`
    const wrapper = {
      kind: 'plain-arrow',
      key,
      name: `ccjs_callback_arrow_${index}`,
      expression,
      functionType
    }

    wrappers.set(key, wrapper)
    context.callbackArrowWrappers.set(expression, wrapper)
  }
  const declare = (scope, name, info) => {
    scope.set(name, info)
  }
  const declareParams = (scope, params) => {
    for (const param of params) {
      declare(scope, param.name, {
        name: param.name,
        valueType: param.valueType,
        declaration: param,
        functionType: param.functionType,
        nullable: param.nullable === true,
        shape: param.shape,
        runtimeManaged: ['string', 'object'].includes(param.valueType),
        mutable: true
      })
    }
  }
  const declareVariable = (scope, statement, scopes) => {
    const valueType = statement.valueType === 'unknown'
      ? inferCapturedExpressionValueType(statement.init, scopes)
      : statement.valueType

    declare(scope, statement.name, {
      name: statement.name,
      valueType,
      functionType: statement.functionType,
      declaration: statement,
      nullable: statement.nullable === true,
      shape: statement.shape,
      runtimeCallback: isNullableFunctionType(valueType, statement.nullable) || isRuntimeFunctionType(statement.functionType) || shouldPromotePlainFunctionExpression(statement.init, statement.functionType, scopes),
      runtimeManaged: isRuntimeManagedCaptureBinding(statement, scopes, valueType),
      mutable: statement.kind === 'let'
    })
  }
  const lookup = (name, scopes) => {
    for (let index = scopes.length - 1; index >= 0; index -= 1) {
      const entry = scopes[index].get(name)

      if (entry != null) {
        return entry
      }
    }

    return null
  }
  const isRuntimeManagedCaptureBinding = (statement, scopes, valueType) => {
    if (valueType === 'object') {
      return true
    }

    if (valueType !== 'string') {
      return false
    }

    if (statement.init?.type === 'StringLiteral') {
      return false
    }

    if (statement.init?.type === 'TemplateLiteral' && !statement.init.raw.includes('${')) {
      return false
    }

    if (statement.init?.type === 'Reference' && statement.init.path.length === 1) {
      return lookup(statement.init.path[0], scopes)?.runtimeManaged === true
    }

    return true
  }
  const inferCapturedExpressionValueType = (expression, scopes) => {
    if (expression?.valueType != null && expression.valueType !== 'unknown') {
      return expression.valueType
    }

    if (expression?.type === 'Reference' && expression.path.length === 1) {
      return lookup(expression.path[0], scopes)?.valueType ?? 'unknown'
    }

    if (expression?.type === 'MemberExpression') {
      const object = inferCapturedExpressionInfo(expression.object, scopes)
      const field = object.shape?.fields?.find(field => field.name === expression.property)

      return field?.valueType ?? 'unknown'
    }

    if (expression?.type === 'IndexExpression' && expression.index.type === 'StringLiteral') {
      const object = inferCapturedExpressionInfo(expression.object, scopes)
      const field = object.shape?.fields?.find(field => field.name === expression.index.value)

      return field?.valueType ?? 'unknown'
    }

    return 'unknown'
  }
  const inferCapturedExpressionInfo = (expression, scopes) => {
    if (expression?.type === 'Reference' && expression.path.length === 1) {
      const entry = lookup(expression.path[0], scopes)

      if (entry != null) {
        return entry
      }
    }

    return {
      valueType: inferCapturedExpressionValueType(expression, scopes),
      shape: null
    }
  }
  const visitStatement = (statement, scopes) => {
    if (statement?.type === 'VariableDeclaration') {
      if (isNullableFunctionType(statement.valueType, statement.nullable)) {
        registerRuntime(statement.init, statement.functionType, scopes)
      } else if (shouldPromotePlainFunctionExpression(statement.init, statement.functionType, scopes)) {
        registerRuntime(statement.init, statement.functionType, scopes)
      } else {
        register(statement.init, statement.functionType, scopes)
      }

      visitExpression(statement.init, scopes)
      declareVariable(scopes.at(-1), statement, scopes)
      return
    }

    if (statement?.type === 'ExpressionStatement') {
      visitExpression(statement.expression, scopes)
      return
    }

    if (statement?.type === 'ReturnStatement') {
      visitExpression(statement.argument, scopes)
      return
    }

    if (statement?.type === 'ThrowStatement') {
      visitExpression(statement.argument, scopes)
      return
    }

    if (statement?.type === 'BlockStatement') {
      const scope = new Map()
      statement.body.forEach(item => visitStatement(item, [...scopes, scope]))
      return
    }

    if (statement?.type === 'IfStatement') {
      visitExpression(statement.condition, scopes)
      visitStatement(statement.consequent, scopes)
      visitStatement(statement.alternate, scopes)
      return
    }

    if (statement?.type === 'WhileStatement') {
      visitExpression(statement.condition, scopes)
      visitStatement(statement.body, scopes)
      return
    }

    if (statement?.type === 'ForStatement') {
      const scope = new Map()
      const loopScopes = [...scopes, scope]

      if (statement.init?.type === 'VariableDeclaration') {
        visitStatement(statement.init, loopScopes)
      } else {
        visitExpression(statement.init, loopScopes)
      }

      visitExpression(statement.test, loopScopes)
      visitExpression(statement.update, loopScopes)
      visitStatement(statement.body, loopScopes)
      return
    }

    if (statement?.type === 'ForOfStatement') {
      visitExpression(statement.iterable, scopes)
      const scope = new Map()
      declare(scope, statement.name, {
        name: statement.name,
        valueType: 'unknown',
        mutable: statement.kind === 'let'
      })
      visitStatement(statement.body, [...scopes, scope])
      return
    }

    if (statement?.type === 'SwitchStatement') {
      visitExpression(statement.discriminant, scopes)

      for (const item of statement.cases) {
        visitExpression(item.test, scopes)
        const scope = new Map()
        item.consequent.forEach(statement => visitStatement(statement, [...scopes, scope]))
      }
    }

    if (statement?.type === 'TryStatement') {
      visitStatement(statement.block, scopes)
      visitStatement(statement.handler?.body, scopes)
      visitStatement(statement.finalizer, scopes)
    }
  }
  const visitExpression = (expression, scopes) => {
    if (expression == null) {
      return
    }

    if (expression.type === 'CallExpression') {
      if (cTimerStartCallName(expression.callee) != null) {
        registerRuntime(expression.args[0], timerCallbackFunctionType(), scopes)
      }

      const params = resolveStaticFunctionParams(expression.callee, context)

      for (const [index, arg] of expression.args.entries()) {
        const param = params?.[index]

        if (param?.valueType === 'function') {
          if (isNullableFunctionType(param.valueType, param.nullable)) {
            registerRuntime(arg, param.functionType, scopes)
          } else if (isRuntimeFunctionType(param.functionType)) {
            registerRuntime(arg, param.functionType, scopes)
          } else {
            pendingPlainFunctionArgs.push({
              callee: expression.callee,
              index,
              arg,
              functionType: normalizeFunctionType(param.functionType),
              scopes
            })

              const argInfo = arg.type === 'Reference' && arg.path.length === 1
                ? lookup(arg.path[0], scopes)
                : null

              if (hasCaptures(arg, scopes) || argInfo?.runtimeCallback === true) {
                markRuntimeFunctionParam(expression.callee, index, param.functionType, context)
              }
            }
        }

        visitExpression(arg, scopes)
      }

      visitExpression(expression.callee, scopes)
      return
    }

    if (expression.type === 'AssignmentExpression') {
      const targetInfo = expression.target?.type === 'Reference' && expression.target.path.length === 1
        ? lookup(expression.target.path[0], scopes)
        : null

      if (isNullableFunctionType(targetInfo?.valueType, targetInfo?.nullable)) {
        registerRuntime(expression.value, targetInfo.functionType, scopes)
      }

      visitExpression(expression.target, scopes)
      visitExpression(expression.value, scopes)
      return
    }

    if (expression.type === 'BinaryExpression') {
      visitExpression(expression.left, scopes)
      visitExpression(expression.right, scopes)
      return
    }

    if (expression.type === 'UnaryExpression' || expression.type === 'AwaitExpression') {
      visitExpression(expression.argument, scopes)
      return
    }

    if (expression.type === 'MemberExpression' || expression.type === 'OptionalMemberExpression') {
      visitExpression(expression.object, scopes)
      return
    }

    if (expression.type === 'IndexExpression' || expression.type === 'OptionalIndexExpression') {
      visitExpression(expression.object, scopes)
      visitExpression(expression.index, scopes)
      return
    }

    if (expression.type === 'OptionalCallExpression' || expression.type === 'NewExpression') {
      visitExpression(expression.callee, scopes)
      expression.args.forEach(arg => visitExpression(arg, scopes))
      return
    }

    if (expression.type === 'ArrayLiteral') {
      expression.elements.forEach(element => visitExpression(element, scopes))
      return
    }

    if (expression.type === 'ObjectLiteral') {
      expression.properties.forEach(property => visitExpression(property.value, scopes))
      return
    }

    if (expression.type === 'ArrowFunctionExpression') {
      const scope = new Map()

      for (const param of expression.params) {
        declare(scope, param.name, {
          name: param.name,
          valueType: param.valueType,
          declaration: param,
          functionType: param.functionType,
          nullable: param.nullable === true,
          shape: param.shape,
          runtimeManaged: ['string', 'object'].includes(param.valueType),
          mutable: false
        })
      }

      const arrowScopes = [...scopes, scope]

      if (expression.expressionBody) {
        visitExpression(expression.body, arrowScopes)
      } else {
        expression.body.forEach(statement => visitStatement(statement, arrowScopes))
      }

      return
    }
  }

  for (const ir of irPrograms) {
    const topLevelScope = new Map()

    for (const item of collectIrTopLevelNodeEntries(ir)) {
      if (item.kind === 'function') {
        const scope = new Map()
        declareParams(scope, item.node.params)
        item.node.body.forEach(statement => visitStatement(statement, [topLevelScope, scope]))
      } else if (item.kind === 'statement') {
        visitStatement(item.node, [topLevelScope])
      }
    }
  }

  for (const pending of pendingPlainFunctionArgs) {
    if (resolveRuntimeFunctionArgumentType(pending.callee, pending.index, {
      valueType: 'function',
      functionType: pending.functionType
    }, context) != null) {
      registerRuntime(pending.arg, pending.functionType, pending.scopes)
    } else {
      registerPlain(pending.arg, pending.functionType, pending.scopes)
    }
  }

  return wrappers
}

function collectPromiseChainWrappers(irPrograms: IrProgram[], context) {
  const wrappers = new Map()
  const declare = (scope, name, info) => {
    scope.set(name, info)
  }
  const declareParams = (scope, params) => {
    for (const param of params) {
      declare(scope, param.name, {
        name: param.name,
        valueType: param.valueType,
        declaration: param,
        functionType: param.functionType,
        nullable: param.nullable === true,
        shape: param.shape,
        runtimeManaged: ['string', 'object'].includes(param.valueType),
        mutable: false
      })
    }
  }
  const lookup = (name, scopes) => {
    for (let index = scopes.length - 1; index >= 0; index -= 1) {
      const entry = scopes[index].get(name)

      if (entry != null) {
        return entry
      }
    }

    return null
  }
  const isRuntimeManagedCaptureBinding = (statement, scopes, valueType) => {
    if (valueType === 'object') {
      return true
    }

    if (valueType !== 'string') {
      return false
    }

    if (statement.init?.type === 'StringLiteral') {
      return false
    }

    if (statement.init?.type === 'TemplateLiteral' && !statement.init.raw.includes('${')) {
      return false
    }

    if (statement.init?.type === 'Reference' && statement.init.path.length === 1) {
      return lookup(statement.init.path[0], scopes)?.runtimeManaged === true
    }

    return true
  }
  const declareVariable = (scope, statement, scopes) => {
    declare(scope, statement.name, {
      name: statement.name,
      valueType: statement.valueType,
      declaration: statement,
      functionType: statement.functionType,
      nullable: statement.nullable === true,
      shape: statement.shape,
      runtimeManaged: isRuntimeManagedCaptureBinding(statement, scopes, statement.valueType),
      mutable: statement.kind === 'let'
    })
  }
  const register = (expression, scopes) => {
    if (!isPromiseMethodAst(expression)) {
      return
    }

    const callback = expression.args[0]

    if (callback?.type !== 'ArrowFunctionExpression' || callback.params.length > 1 || resolvePromiseChainArrowBody(callback) == null) {
      return
    }

    if (context.promiseChainArrowWrappers.has(callback)) {
      return
    }

    const index = wrappers.size
    const key = `promise-chain-arrow:${index}`
    const captures = collectArrowCaptures(callback, scopes, context)

    for (const capture of captures) {
      if (capture.mutable && ['number', 'boolean', 'string', 'object'].includes(capture.valueType) && capture.declaration != null) {
        context.boxedMutableCaptureDeclarations.add(capture.declaration)
      }
    }

    const wrapper = {
      kind: 'promise-chain-arrow',
      key,
      name: `ccjs_promise_chain_arrow_${index}`,
      contextTypeName: `ccjs_promise_chain_context_${index}`,
      finalizerName: `ccjs_promise_chain_context_${index}_finalize`,
      expression: callback,
      returnType: callback.returnType ?? expression.promiseValueType ?? 'unknown',
      returnShape: callback.returnShape ?? null,
      needsEventLoop: functionUsesExternalEventLoop(callback, context.externalEventLoopFunctions),
      captures
    }

    wrappers.set(key, wrapper)
    context.promiseChainArrowWrappers.set(callback, wrapper)
  }
  const visitStatement = (statement, scopes) => {
    if (statement == null) {
      return
    }

    if (statement.type === 'VariableDeclaration') {
      visitExpression(statement.init, scopes)
      declareVariable(scopes.at(-1), statement, scopes)
      return
    }

    if (statement.type === 'ExpressionStatement') {
      visitExpression(statement.expression, scopes)
      return
    }

    if (statement.type === 'ReturnStatement' || statement.type === 'ThrowStatement') {
      visitExpression(statement.argument, scopes)
      return
    }

    if (statement.type === 'BlockStatement') {
      const scope = new Map()
      statement.body.forEach(item => visitStatement(item, [...scopes, scope]))
      return
    }

    if (statement.type === 'IfStatement') {
      visitExpression(statement.condition, scopes)
      visitStatement(statement.consequent, scopes)
      visitStatement(statement.alternate, scopes)
      return
    }

    if (statement.type === 'WhileStatement') {
      visitExpression(statement.condition, scopes)
      visitStatement(statement.body, scopes)
      return
    }

    if (statement.type === 'ForStatement') {
      const scope = new Map()
      const loopScopes = [...scopes, scope]

      if (statement.init?.type === 'VariableDeclaration') {
        visitStatement(statement.init, loopScopes)
      } else {
        visitExpression(statement.init, loopScopes)
      }

      visitExpression(statement.test, loopScopes)
      visitExpression(statement.update, loopScopes)
      visitStatement(statement.body, loopScopes)
      return
    }

    if (statement.type === 'ForOfStatement') {
      visitExpression(statement.iterable, scopes)
      const scope = new Map()
      declare(scope, statement.name, {
        name: statement.name,
        valueType: 'unknown',
        mutable: statement.kind === 'let'
      })
      visitStatement(statement.body, [...scopes, scope])
      return
    }

    if (statement.type === 'SwitchStatement') {
      visitExpression(statement.discriminant, scopes)

      for (const item of statement.cases) {
        visitExpression(item.test, scopes)
        const scope = new Map()
        item.consequent.forEach(statement => visitStatement(statement, [...scopes, scope]))
      }
      return
    }

    if (statement.type === 'TryStatement') {
      visitStatement(statement.block, scopes)
      visitStatement(statement.handler?.body, scopes)
      visitStatement(statement.finalizer, scopes)
    }
  }
  const visitExpression = (expression, scopes) => {
    if (expression == null) {
      return
    }

    if (expression.type === 'CallExpression') {
      register(expression, scopes)
      visitExpression(expression.callee, scopes)
      expression.args.forEach(arg => visitExpression(arg, scopes))
      return
    }

    if (expression.type === 'OptionalCallExpression' || expression.type === 'NewExpression') {
      visitExpression(expression.callee, scopes)
      expression.args.forEach(arg => visitExpression(arg, scopes))
      return
    }

    if (expression.type === 'AssignmentExpression') {
      visitExpression(expression.target, scopes)
      visitExpression(expression.value, scopes)
      return
    }

    if (expression.type === 'BinaryExpression') {
      visitExpression(expression.left, scopes)
      visitExpression(expression.right, scopes)
      return
    }

    if (expression.type === 'UnaryExpression' || expression.type === 'AwaitExpression') {
      visitExpression(expression.argument, scopes)
      return
    }

    if (expression.type === 'MemberExpression' || expression.type === 'OptionalMemberExpression') {
      visitExpression(expression.object, scopes)
      return
    }

    if (expression.type === 'IndexExpression' || expression.type === 'OptionalIndexExpression') {
      visitExpression(expression.object, scopes)
      visitExpression(expression.index, scopes)
      return
    }

    if (expression.type === 'ArrayLiteral') {
      expression.elements.forEach(element => visitExpression(element, scopes))
      return
    }

    if (expression.type === 'ObjectLiteral') {
      expression.properties.forEach(property => visitExpression(property.value, scopes))
    }
  }

  for (const ir of irPrograms) {
    const topLevelScope = new Map()

    for (const item of collectIrTopLevelNodeEntries(ir)) {
      if (item.kind === 'function') {
        const scope = new Map()
        declareParams(scope, item.node.params)
        item.node.body.forEach(statement => visitStatement(statement, [topLevelScope, scope]))
      } else if (item.kind === 'statement') {
        visitStatement(item.node, [topLevelScope])
      }
    }
  }

  return wrappers
}

function collectArrowCaptures(expression, outerScopes, context) {
  const captures = new Map()
  const localScope = new Map()
  const localScopes = [localScope]

  for (const param of expression.params) {
    localScope.set(param.name, {
      name: param.name,
      valueType: param.valueType,
      mutable: true
    })
  }

  const lookup = (name, scopes) => {
    for (let index = scopes.length - 1; index >= 0; index -= 1) {
      const entry = scopes[index].get(name)

      if (entry != null) {
        return entry
      }
    }

    return null
  }
  const addReference = reference => {
    if (reference.path.length !== 1) {
      return
    }

    const name = reference.path[0]

    if (lookup(name, localScopes) != null || context.functionNames.has(name) || isCJsGlobalRoot(name, context)) {
      return
    }

    const outer = lookup(name, outerScopes)

    if (outer != null && !captures.has(name)) {
      captures.set(name, {
        ...outer,
        name
      })
    }
  }
  const declareLocal = statement => {
    localScopes[localScopes.length - 1].set(statement.name, {
      name: statement.name,
      valueType: statement.valueType,
      functionType: statement.functionType,
      shape: statement.shape,
      mutable: statement.kind === 'let'
    })
  }
  const visitStatement = statement => {
    if (statement == null) {
      return
    }

    if (statement.type === 'VariableDeclaration') {
      visitExpression(statement.init)
      declareLocal(statement)
      return
    }

    if (statement.type === 'ExpressionStatement') {
      visitExpression(statement.expression)
      return
    }

    if (statement.type === 'ReturnStatement' || statement.type === 'ThrowStatement') {
      visitExpression(statement.argument)
      return
    }

    if (statement.type === 'BlockStatement') {
      localScopes.push(new Map())
      statement.body.forEach(visitStatement)
      localScopes.pop()
      return
    }

    if (statement.type === 'IfStatement') {
      visitExpression(statement.condition)
      visitStatement(statement.consequent)
      visitStatement(statement.alternate)
      return
    }

    if (statement.type === 'WhileStatement') {
      visitExpression(statement.condition)
      visitStatement(statement.body)
      return
    }

    if (statement.type === 'ForStatement') {
      localScopes.push(new Map())

      if (statement.init?.type === 'VariableDeclaration') {
        visitStatement(statement.init)
      } else {
        visitExpression(statement.init)
      }

      visitExpression(statement.test)
      visitExpression(statement.update)
      visitStatement(statement.body)
      localScopes.pop()
      return
    }

    if (statement.type === 'ForOfStatement') {
      visitExpression(statement.iterable)
      localScopes.push(new Map([[statement.name, {
        name: statement.name,
        valueType: 'unknown',
        mutable: statement.kind === 'let'
      }]]))
      visitStatement(statement.body)
      localScopes.pop()
      return
    }

    if (statement.type === 'SwitchStatement') {
      visitExpression(statement.discriminant)

      for (const item of statement.cases) {
        visitExpression(item.test)
        localScopes.push(new Map())
        item.consequent.forEach(visitStatement)
        localScopes.pop()
      }
    }

    if (statement.type === 'TryStatement') {
      visitStatement(statement.block)

      if (statement.handler != null) {
        const catchScope = new Map()

        if (statement.handler.param != null) {
          catchScope.set(statement.handler.param, {
            name: statement.handler.param,
            valueType: 'string',
            mutable: true
          })
        }

        localScopes.push(catchScope)
        visitStatement(statement.handler.body)
        localScopes.pop()
      }

      visitStatement(statement.finalizer)
    }
  }
  const visitExpression = node => {
    if (node == null) {
      return
    }

    if (node.type === 'Reference') {
      addReference(node)
      return
    }

    if (node.type === 'MemberExpression' || node.type === 'OptionalMemberExpression') {
      visitExpression(node.object)
      return
    }

    if (node.type === 'IndexExpression' || node.type === 'OptionalIndexExpression') {
      visitExpression(node.object)
      visitExpression(node.index)
      return
    }

    if (node.type === 'CallExpression' || node.type === 'OptionalCallExpression' || node.type === 'NewExpression') {
      visitExpression(node.callee)
      node.args.forEach(visitExpression)
      return
    }

    if (node.type === 'AssignmentExpression') {
      visitExpression(node.target)
      visitExpression(node.value)
      return
    }

    if (node.type === 'BinaryExpression') {
      visitExpression(node.left)
      visitExpression(node.right)
      return
    }

    if (node.type === 'UnaryExpression' || node.type === 'AwaitExpression') {
      visitExpression(node.argument)
      return
    }

    if (node.type === 'ArrayLiteral') {
      node.elements.forEach(visitExpression)
      return
    }

    if (node.type === 'ObjectLiteral') {
      node.properties.forEach(property => visitExpression(property.value))
    }
  }

  if (expression.expressionBody) {
    visitExpression(expression.body)
  } else {
    expression.body.forEach(visitStatement)
  }

  return [...captures.values()]
}

function resolveStaticFunctionParams(callee, context) {
  if (callee?.type !== 'Reference' || callee.path.length !== 1) {
    return null
  }

  return context.functionParams.get(callee.path[0]) ?? null
}

function runtimeCallbackWrapperKey(target, functionType) {
  return `${target}:${functionType.returnType}(${functionType.params.map(param => param.valueType).join(',')})`
}

function runtimeCallbackWrapperFor(target, functionType, context) {
  return context.callbackWrappers.get(runtimeCallbackWrapperKey(target, functionType)) ?? null
}

function emitRuntimeCallbackWrapperHead(wrapper) {
  return `static ccjs_status ${wrapper.name}(void* context, const ccjs_value* args, size_t arg_count, ccjs_value* out)`
}

function emitPromiseChainCallbackWrapperHead(wrapper) {
  return `static ccjs_status ${wrapper.name}(void* context, ccjs_value ccjs_value_input, ccjs_value* out)`
}

function emitPromiseChainCallbackWrapperDeclaration(wrapper, baseContext) {
  const lines: string[] = []

  if (isPromiseChainCallbackWrapperWithContext(wrapper)) {
    lines.push(...emitRuntimeArrowCallbackContextFinalizerDeclaration(wrapper))
    lines.push('')
  }

  const context = createFunctionContext(baseContext, 'void')
  context.cleanupEnabled = false
  context.statusReturn = true
  context.runtimeCallbackReturnType = wrapper.returnType
  context.runtimeCallbackReturnShape = wrapper.returnShape ?? null
  context.runtimeCallbackReturnOut = '(*out)'
  context.runtimeCallbackCleanupLabel = 'ccjs_promise_callback_cleanup'
  const bodyLines = [
    ...emitRuntimeArrowCallbackContextLocals(wrapper, context),
    ...emitPromiseChainCallbackParamPrelude(wrapper, context)
  ]
  const statementLines = emitPromiseChainCallbackStatementLines(wrapper, context)

  lines.push(
    `${emitPromiseChainCallbackWrapperHead(wrapper)} {`,
    isPromiseChainCallbackWrapperWithContext(wrapper) ? '  if (context == 0) return CCJS_ERR_TYPE;' : '  (void)context;',
    '  if (out == 0) return CCJS_ERR_TYPE;',
    '  *out = ccjs_undefined_value();',
    ...bodyLines.map(line => `  ${line}`),
    ...emitLoopFlowDeclarations(context).map(line => `  ${line}`),
    ...emitReturnFlowDeclarations(context).map(line => `  ${line}`),
    ...emitOwnedValueDeclarations(context).map(line => `  ${line}`),
    ...emitErrorChannelDeclarations(context).map(line => `  ${line}`),
    ...emitBoxedValueDeclarations(context).map(line => `  ${line}`),
    ...statementLines.map(line => `  ${line}`),
    ...(context.usedRuntimeCallbackCleanupGoto === true ? [`${context.runtimeCallbackCleanupLabel}:`] : []),
    ...emitOwnedValueCleanup(context).map(line => `  ${line}`),
    ...emitBoxedValueCleanup(context).map(line => `  ${line}`),
    '  return CCJS_OK;',
    '}'
  )

  return lines
}

function emitPromiseChainCallbackParamPrelude(wrapper, context) {
  const param = wrapper.expression.params[0]

  if (param == null) {
    return ['(void)ccjs_value_input;']
  }

  const valueType = param.valueType ?? 'unknown'
  context.variables.set(param.name, valueType)

  if (valueType === 'number') {
    return [
      emitRuntimeTypeCheck('ccjs_value_input.tag != CCJS_TAG_NUMBER', context),
      `double ${param.name} = ccjs_value_input.as.number;`
    ]
  }

  if (valueType === 'boolean') {
    return [
      emitRuntimeTypeCheck('ccjs_value_input.tag != CCJS_TAG_BOOL', context),
      `double ${param.name} = ccjs_value_input.as.boolean ? 1 : 0;`
    ]
  }

  if (valueType === 'string') {
    context.runtimeStrings.add(param.name)

    return [
      emitRuntimeTypeCheck('ccjs_value_input.tag != CCJS_TAG_STRING || ccjs_value_input.as.ref == 0', context),
      `ccjs_string* ${param.name} = (ccjs_string*)ccjs_value_input.as.ref;`
    ]
  }

  if (valueType === 'object') {
    return [
      emitRuntimeTypeCheck('ccjs_value_input.tag != CCJS_TAG_OBJECT || ccjs_value_input.as.ref == 0', context),
      `ccjs_value ${param.name} = ccjs_value_input;`
    ]
  }

  return [
    `ccjs_value ${param.name} = ccjs_value_input;`
  ]
}

function emitPromiseChainCallbackStatementLines(wrapper, context) {
  const body = resolvePromiseChainArrowBody(wrapper.expression)

  if (body == null) {
    return []
  }

  if (body.kind === 'statement-list') {
    return emitStatementList(body.statements, context)
  }

  const prefixLines = emitStatementList(body.prefixStatements, context)

  return [
    ...prefixLines,
    ...emitPromiseChainCallbackReturnLines(body.returnExpression, wrapper, context)
  ]
}

function emitPromiseChainCallbackReturnLines(returnExpression, wrapper, context) {
  if (wrapper.returnType === 'number' || wrapper.returnType === 'boolean') {
    const value = emitPreparedNumberExpression(returnExpression, context)
    const expression = wrapper.returnType === 'number'
      ? `ccjs_number_value(${value.expression})`
      : `ccjs_bool_value((${value.expression}) != 0)`

    return [
      ...value.lines,
      `*out = ${expression};`
    ]
  }

  if (isManagedRuntimeReturnType(wrapper.returnType)) {
    return emitRuntimeCallbackRuntimeValueReturnLines(returnExpression, context)
  }

  return []
}

function isRuntimeCallbackWrapper(wrapper) {
  return wrapper.kind !== 'plain-arrow'
}

function emitPlainArrowCallbackWrapperHead(wrapper) {
  return `static ${emitFunctionPointerReturnType(wrapper.functionType)} ${wrapper.name}(${emitPlainArrowCallbackParams(wrapper)})`
}

function emitPlainArrowCallbackParams(wrapper) {
  const params = wrapper.functionType?.params ?? []

  if (params.length === 0) {
    return 'void'
  }

  return params.map((param, index) => `${emitCType(param.valueType)} ${plainArrowCallbackParamName(wrapper, index)}`).join(', ')
}

function emitPlainArrowCallbackWrapperDeclaration(wrapper, baseContext) {
  const context = createFunctionContext(baseContext, wrapper.functionType?.returnType ?? 'void')
  context.cleanupEnabled = false

  for (const [index, param] of (wrapper.functionType?.params ?? []).entries()) {
    context.variables.set(plainArrowCallbackParamName(wrapper, index), param.valueType)
  }

  const statements = wrapper.expression.expressionBody
    ? [{
        type: 'ExpressionStatement',
        expression: wrapper.expression.body
      }]
    : wrapper.expression.body
  const statementLines = emitStatementList(statements, context)
  const lines = [
    `${emitPlainArrowCallbackWrapperHead(wrapper)} {`,
    ...emitOwnedValueDeclarations(context).map(line => `  ${line}`),
    ...emitBoxedValueDeclarations(context).map(line => `  ${line}`),
    ...statementLines.map(line => `  ${line}`)
  ]

  if (shouldEmitCleanupLabel(context)) {
    lines.push('ccjs_cleanup:')
    lines.push(...emitOwnedValueCleanup(context).map(line => `  ${line}`))
    lines.push(...emitBoxedValueCleanup(context).map(line => `  ${line}`))
    lines.push(`  ${emitCleanupReturn(context)}`)
  }

  lines.push('}')

  return lines
}

function plainArrowCallbackParamName(wrapper, index) {
  return wrapper.expression.params[index]?.name ?? `ccjs_arg_${index}`
}

function emitRuntimeCallbackWrapperDeclaration(wrapper, context) {
  if (wrapper.kind === 'arrow') {
    return emitRuntimeArrowCallbackWrapperDeclaration(wrapper, context)
  }

  const targetTakesEventLoop = functionTakesEventLoopParam(wrapper.target, context)
  const lines = [
    `${emitRuntimeCallbackWrapperHead(wrapper)} {`,
    targetTakesEventLoop ? '  if (context == 0) return CCJS_ERR_TYPE;' : '  (void)context;',
    `  if (out == 0 || arg_count != ${wrapper.functionType.params.length}${wrapper.functionType.params.length === 0 ? '' : ' || args == 0'}) return CCJS_ERR_TYPE;`,
    '  *out = ccjs_undefined_value();'
  ]
  const args: string[] = []

  for (const [index, param] of wrapper.functionType.params.entries()) {
    lines.push(...emitRuntimeCallbackWrapperArgChecks(param, index).map(line => `  ${line}`))
    args.push(emitRuntimeCallbackWrapperArg(param, index))
  }

  const callArgs = targetTakesEventLoop ? ['(ccjs_loop*)context', ...args] : args
  const call = `${context.functionNames.get(wrapper.target) ?? emitCFunctionName(wrapper.target)}(${callArgs.join(', ')})`

  if (wrapper.functionType.returnType === 'number') {
    lines.push(`  *out = ccjs_number_value(${call});`)
  } else if (wrapper.functionType.returnType === 'boolean') {
    lines.push(`  *out = ccjs_bool_value((${call}) != 0);`)
  } else if (isManagedRuntimeReturnType(wrapper.functionType.returnType)) {
    lines.push(`  *out = ${call};`)
  } else {
    lines.push(`  ${call};`)
  }

  lines.push('  return CCJS_OK;')
  lines.push('}')

  return lines
}

function isRuntimeArrowCallbackWrapperWithContext(wrapper) {
  return wrapper.kind === 'arrow' && hasRuntimeArrowCallbackContext(wrapper)
}

function isPromiseChainCallbackWrapperWithContext(wrapper) {
  return wrapper.kind === 'promise-chain-arrow' && hasRuntimeArrowCallbackContext(wrapper)
}

function hasRuntimeArrowCallbackContext(wrapper) {
  return wrapper.captures.length > 0 || wrapper.needsEventLoop === true
}

function emitRuntimeArrowCallbackContextType(wrapper) {
  return [
    `typedef struct ${wrapper.contextTypeName} {`,
    ...(wrapper.needsEventLoop === true ? ['  ccjs_loop* ccjs_loop;'] : []),
    ...wrapper.captures.map(capture => `  ${emitRuntimeArrowCaptureCType(capture)} ${emitRuntimeArrowCaptureField(capture)};`),
    `} ${wrapper.contextTypeName};`
  ]
}

function emitRuntimeArrowCallbackContextFinalizerDeclaration(wrapper) {
  const lines = [
    `static void ${wrapper.finalizerName}(void* context) {`,
    '  if (context == 0) return;',
    `  ${wrapper.contextTypeName}* captured = (${wrapper.contextTypeName}*)context;`
  ]

  for (const capture of wrapper.captures.filter(isRetainedRuntimeArrowCapture)) {
    lines.push(`  ccjs_release(captured->${emitRuntimeArrowCaptureField(capture)});`)
  }

  lines.push(`  ccjs_default_free(0, context, sizeof(${wrapper.contextTypeName}), _Alignof(${wrapper.contextTypeName}));`)
  lines.push('}')

  return lines
}

function emitRuntimeArrowCallbackWrapperDeclaration(wrapper, baseContext) {
  const lines: string[] = []

  if (isRuntimeArrowCallbackWrapperWithContext(wrapper)) {
    lines.push(...emitRuntimeArrowCallbackContextFinalizerDeclaration(wrapper))
    lines.push('')
  }

  const context = createFunctionContext(baseContext, 'void')
  context.cleanupEnabled = false
  context.statusReturn = true
  context.runtimeCallbackReturnType = wrapper.functionType.returnType
  context.runtimeCallbackReturnShape = wrapper.functionType.returnShape ?? null
  context.runtimeCallbackReturnOut = '(*out)'
  context.runtimeCallbackCleanupLabel = 'ccjs_callback_cleanup'
  const bodyLines: string[] = []

  bodyLines.push(...emitRuntimeArrowCallbackContextLocals(wrapper, context))
  bodyLines.push(...emitRuntimeArrowCallbackParamPrelude(wrapper, context))
  const statementLines = emitRuntimeArrowCallbackStatementLines(wrapper, context)

  lines.push(`${emitRuntimeCallbackWrapperHead(wrapper)} {`)

  if (isRuntimeArrowCallbackWrapperWithContext(wrapper)) {
    lines.push('  if (context == 0) return CCJS_ERR_TYPE;')
  } else {
    lines.push('  (void)context;')
  }

  lines.push(`  if (out == 0 || arg_count != ${wrapper.functionType.params.length}${wrapper.functionType.params.length === 0 ? '' : ' || args == 0'}) return CCJS_ERR_TYPE;`)
  lines.push('  *out = ccjs_undefined_value();')
  lines.push(...bodyLines.map(line => `  ${line}`))
  lines.push(...emitLoopFlowDeclarations(context).map(line => `  ${line}`))
  lines.push(...emitReturnFlowDeclarations(context).map(line => `  ${line}`))
  lines.push(...emitOwnedValueDeclarations(context).map(line => `  ${line}`))
  lines.push(...emitErrorChannelDeclarations(context).map(line => `  ${line}`))
  lines.push(...emitBoxedValueDeclarations(context).map(line => `  ${line}`))
  lines.push(...statementLines.map(line => `  ${line}`))
  if (context.usedRuntimeCallbackCleanupGoto === true) {
    lines.push(`${context.runtimeCallbackCleanupLabel}:`)
  }
  lines.push(...emitOwnedValueCleanup(context).map(line => `  ${line}`))
  lines.push(...emitBoxedValueCleanup(context).map(line => `  ${line}`))
  lines.push('  return CCJS_OK;')
  lines.push('}')

  return lines
}

function emitRuntimeArrowCallbackStatementLines(wrapper, context) {
  if (wrapper.functionType.returnType === 'number' || wrapper.functionType.returnType === 'boolean') {
    if (!wrapper.expression.expressionBody) {
      return emitStatementList(wrapper.expression.body, context)
    }

    const value = emitPreparedNumberExpression(wrapper.expression.body, context)
    const expression = wrapper.functionType.returnType === 'number'
      ? `ccjs_number_value(${value.expression})`
      : `ccjs_bool_value((${value.expression}) != 0)`

    return [
      ...value.lines,
      `*out = ${expression};`
    ]
  }

  if (isManagedRuntimeReturnType(wrapper.functionType.returnType)) {
    if (!wrapper.expression.expressionBody) {
      return emitStatementList(wrapper.expression.body, context)
    }

    return emitRuntimeCallbackRuntimeValueReturnLines(wrapper.expression.body, context)
  }

  const statements = wrapper.expression.expressionBody
    ? [{
        type: 'ExpressionStatement',
        expression: wrapper.expression.body
      }]
    : wrapper.expression.body

  return emitStatementList(statements, context)
}

function emitRuntimeArrowCallbackContextLocals(wrapper, context) {
  if (!hasRuntimeArrowCallbackContext(wrapper)) {
    return []
  }

  const lines = [
    `${wrapper.contextTypeName}* captured = (${wrapper.contextTypeName}*)context;`
  ]

  if (wrapper.needsEventLoop === true) {
    context.eventLoopUsed = true
    context.externalEventLoop = true
    lines.push('if (captured->ccjs_loop == 0) return CCJS_ERR_TYPE;')
    lines.push('ccjs_loop* ccjs_loop = captured->ccjs_loop;')
  }

  for (const capture of wrapper.captures) {
    context.variables.set(capture.name, capture.valueType)

    if (isSupportedMutableRuntimeArrowCapture(capture, context)) {
      context.boxedVariables.add(capture.name)

      if (capture.valueType === 'object') {
        registerObjectShape(context, capture.name, capture.shape)
      }

      lines.push(`${emitRuntimeArrowCaptureCType(capture)} ${capture.name} = captured->${emitRuntimeArrowCaptureField(capture)};`)
      continue
    }

    if (isRetainedRuntimeArrowCapture(capture)) {
      if (capture.valueType === 'string') {
        context.runtimeStrings.add(capture.name)
        lines.push(`ccjs_string* ${capture.name} = (ccjs_string*)captured->${emitRuntimeArrowCaptureField(capture)}.as.ref;`)
        continue
      }

      if (capture.valueType === 'object') {
        registerObjectShape(context, capture.name, capture.shape)
        lines.push(`ccjs_value ${capture.name} = captured->${emitRuntimeArrowCaptureField(capture)};`)
        continue
      }
    }

    lines.push(`${emitRuntimeArrowCaptureCType(capture)} ${capture.name} = captured->${emitRuntimeArrowCaptureField(capture)};`)
  }

  return lines
}

function emitRuntimeArrowCallbackParamPrelude(wrapper, context) {
  const lines: string[] = []

  for (const [index, param] of wrapper.functionType.params.entries()) {
    const name = wrapper.expression.params[index]?.name ?? `ccjs_arg_${index}`

    lines.push(...emitRuntimeCallbackWrapperArgChecks(param, index))
    context.variables.set(name, param.valueType)

    if (param.valueType === 'string') {
      context.runtimeStrings.add(name)
      lines.push(`ccjs_string* ${name} = (ccjs_string*)args[${index}].as.ref;`)
      continue
    }

    if (param.valueType === 'object') {
      registerObjectShape(context, name, param.shape)
      lines.push(`ccjs_value ${name} = args[${index}];`)
      continue
    }

    if (param.valueType === 'number') {
      lines.push(`double ${name} = args[${index}].as.number;`)
      continue
    }

    if (param.valueType === 'boolean') {
      lines.push(`double ${name} = args[${index}].as.boolean ? 1 : 0;`)
    }
  }

  return lines
}

function emitRuntimeArrowCaptureCType(capture) {
  if (capture.mutable) {
    if (['number', 'boolean'].includes(capture.valueType)) {
      return 'double*'
    }

    if (['string', 'object'].includes(capture.valueType)) {
      return 'ccjs_value*'
    }
  }

  if (isRetainedRuntimeArrowCapture(capture)) {
    return 'ccjs_value'
  }

  if (capture.valueType === 'string') {
    return 'char*'
  }

  if (capture.valueType === 'timer') {
    return 'ccjs_timer_handle*'
  }

  return 'double'
}

function emitRuntimeArrowCaptureField(capture) {
  return emitCIdentifier(capture.name)
}

function isRetainedRuntimeArrowCapture(capture) {
  return capture.runtimeManaged === true && ['string', 'object'].includes(capture.valueType) && !capture.mutable
}

function isSupportedMutableRuntimeArrowCapture(capture, context) {
  return capture.mutable
    && ['number', 'boolean', 'string', 'object'].includes(capture.valueType)
    && capture.declaration != null
    && context.boxedMutableCaptureDeclarations.has(capture.declaration)
}

function emitRuntimeCallbackWrapperArgChecks(param, index) {
  if (param.valueType === 'string') {
    return [`if (args[${index}].tag != CCJS_TAG_STRING || args[${index}].as.ref == 0) return CCJS_ERR_TYPE;`]
  }

  if (param.valueType === 'object') {
    return [`if (args[${index}].tag != CCJS_TAG_OBJECT || args[${index}].as.ref == 0) return CCJS_ERR_TYPE;`]
  }

  if (param.valueType === 'number') {
    return [`if (args[${index}].tag != CCJS_TAG_NUMBER) return CCJS_ERR_TYPE;`]
  }

  if (param.valueType === 'boolean') {
    return [`if (args[${index}].tag != CCJS_TAG_BOOL) return CCJS_ERR_TYPE;`]
  }

  return []
}

function emitRuntimeCallbackWrapperArg(param, index) {
  if (param.valueType === 'number') {
    return `args[${index}].as.number`
  }

  if (param.valueType === 'boolean') {
    return `(args[${index}].as.boolean ? 1 : 0)`
  }

  return `args[${index}]`
}

function emitFunctionPointerReturnType(functionType) {
  return emitCType(functionType?.returnType ?? 'void')
}

function emitFunctionPointerParams(functionType) {
  if (functionType == null || functionType.params.length === 0) {
    return 'void'
  }

  return functionType.params.map(param => emitCType(param.valueType)).join(', ')
}

function createFunctionContext(baseContext, returnType, returnNullable = false) {
  return {
    ...baseContext,
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
    errorChannelUsed: false,
    errorObjectNames: new Set(),
    errorTargets: [],
    functionErrorOut: null,
    functionReturnOut: null,
    functionTypes: new Map(),
    eventLoopUsed: false,
    externalEventLoop: false,
    mapTypes: new Map(),
    narrowedNullableScalars: new Set(),
    nullableVariables: new Set(),
    objectShapes: new Map(),
    ownedPromises: [],
    ownedValues: [],
    promiseRejectionValueTypes: new Map(),
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
    variables: new Map(),
    returnNullable,
    returnType
  }
}

function emitMainWrapper(entryIrProgram, baseContext) {
  const context = createFunctionContext(baseContext, 'number')

  if (hasIrFunctionDeclaration(entryIrProgram, 'main')) {
    if (!functionTakesEventLoopParam('main', baseContext)) {
      const returnExpression = emitMainReturnExpression(context)

      return [
        'int main(void) {',
        '  ccjs_main();',
        `  return ${returnExpression};`,
        '}'
      ]
    }

    registerEventLoop(context)

    const lines = [
      'int main(void) {',
      ...emitEventLoopDeclarations(context).map(line => `  ${line}`),
      ...emitEventLoopInit(context).map(line => `  ${line}`),
      '  ccjs_main(&ccjs_loop);',
      ...emitEventLoopDrain(context).map(line => `  ${line}`)
    ]

    if (shouldEmitCleanupLabel(context)) {
      lines.push('ccjs_cleanup:')
      lines.push(...emitEventLoopCleanup(context).map(line => `  ${line}`))
    }

    lines.push(`  return ${emitMainReturnExpression(context)};`)
    lines.push('}')

    return lines
  }

  const body = entryIrProgram == null
    ? []
    : collectIrTopLevelNodes(entryIrProgram, 'statement')
  const bodyLines: string[] = []
  const lines = [
    'int main(void) {'
  ]

  bodyLines.push(...emitStatementList(body, context).map(line => `  ${line}`))

  lines.push(...emitLoopFlowDeclarations(context).map(line => `  ${line}`))
  lines.push(...emitReturnFlowDeclarations(context).map(line => `  ${line}`))
  lines.push(...emitEventLoopDeclarations(context).map(line => `  ${line}`))
  lines.push(...emitOwnedValueDeclarations(context).map(line => `  ${line}`))
  lines.push(...emitOwnedPromiseDeclarations(context).map(line => `  ${line}`))
  lines.push(...emitErrorChannelDeclarations(context).map(line => `  ${line}`))
  lines.push(...emitBoxedValueDeclarations(context).map(line => `  ${line}`))
  lines.push(...emitEventLoopInit(context).map(line => `  ${line}`))
  lines.push(...bodyLines)
  lines.push(...emitEventLoopDrain(context).map(line => `  ${line}`))

  if (shouldEmitCleanupLabel(context)) {
    lines.push('ccjs_cleanup:')
    lines.push(...emitOwnedValueCleanup(context).map(line => `  ${line}`))
    lines.push(...emitOwnedPromiseCleanup(context).map(line => `  ${line}`))
    lines.push(...emitEventLoopCleanup(context).map(line => `  ${line}`))
    lines.push(...emitBoxedValueCleanup(context).map(line => `  ${line}`))
  }

  lines.push(`  return ${emitMainReturnExpression(context)};`)
  lines.push('}')

  return lines
}

function emitMainReturnExpression(context) {
  return context.unhandledRejectionFlag == null
    ? '0'
    : `${context.unhandledRejectionFlag} == 0 ? 0 : 1`
}

function emitCFunctionName(name) {
  return name === 'main' ? 'ccjs_main' : name
}

function emitCStringParamName(name) {
  return `ccjs_param_${name}`
}

function emitCScalarParamName(name) {
  return `ccjs_param_${name}`
}

function emitCObjectParamName(name) {
  return `ccjs_param_${name}`
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
      const paramName = param.valueType === 'string' ? emitCStringParamName(param.name) : emitCObjectParamName(param.name)
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
      return [
        emitRuntimeTypeCheck(`${param.name}.tag != CCJS_TAG_OBJECT || ${param.name}.as.ref == 0`, context)
      ]
    }

    if (param.valueType === 'array' || param.valueType === 'map' || param.valueType === 'set') {
      const tag = cRuntimeValueTag(param.valueType)

      return [
        emitRuntimeTypeCheck(`${param.name}.tag != ${tag} || ${param.name}.as.ref == 0`, context)
      ]
    }

    if (param.valueType === 'function' && resolveFunctionParameterRuntimeType(statement.name, index, param, context) != null) {
      if (param.nullable === true) {
        return emitRuntimeNullableValueCheck(param.name, 'CCJS_TAG_FUNCTION', context)
      }

      return [
        emitRuntimeTypeCheck(`${param.name}.tag != CCJS_TAG_FUNCTION || ${param.name}.as.ref == 0`, context)
      ]
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

function emitCType(type) {
  if (type === 'void') {
    return 'void'
  }

  if (isManagedRuntimeReturnType(type)) {
    return 'ccjs_value'
  }

  if (type === 'function') {
    return 'void*'
  }

  if (type === 'promise') {
    return 'ccjs_promise*'
  }

  if (type === 'timer') {
    return 'ccjs_timer_handle*'
  }

  return 'double'
}

function emitCReturnType(type, nullable = false) {
  if (nullable && isNullableScalarType(type)) {
    return 'ccjs_value'
  }

  if (isManagedRuntimeReturnType(type)) {
    return 'ccjs_value'
  }

  return emitCType(type)
}

function emitThrowingFunctionOutType(type, nullable = false) {
  if (nullable && isNullableScalarType(type)) {
    return 'ccjs_value'
  }

  if (isManagedRuntimeReturnType(type)) {
    return 'ccjs_value'
  }

  return emitCType(type)
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

function isThrowingFunctionRuntimeOut(context) {
  return isManagedRuntimeReturnType(context.returnType) || (context.returnNullable === true && isNullableScalarType(context.returnType))
}

function emitStatement(statement, context) {
  if (statement.type === 'BlockStatement') {
    return withVariableScope(context, () => [
      '{',
      ...emitStatementBody(statement, context).map(line => `  ${line}`),
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
    const asyncPromiseCall = emitPreparedAsyncFunctionPromiseCallExpression(statement.init, context, {
      out: statement.name
    })

    if (asyncPromiseCall != null) {
      return asyncPromiseCall.lines
    }

    const promiseMethod = emitPreparedPromiseMethodExpression(statement.init, context, {
      out: statement.name
    })

    if (promiseMethod != null) {
      return promiseMethod.lines
    }

    const fsCall = emitPreparedFsCallExpression(statement.init, context, {
      out: statement.name
    })

    if (fsCall != null) {
      return fsCall.lines
    }

    const promise = emitPreparedPromiseStaticExpression(statement.init, context, {
      out: statement.name
    })

    if (promise != null) {
      return promise.lines
    }

    const promiseCall = emitPreparedPromiseReturningCallExpression(statement.init, context, {
      out: statement.name
    })

    if (promiseCall != null) {
      return promiseCall.lines
    }

    if (isCollectionConstructorExpression(statement.init)) {
      return emitCollectionVariableDeclaration(statement, context)
    }

    const arrayMapCall = emitPreparedArrayMapCallExpression(statement.init, context)

    if (arrayMapCall != null) {
      return emitArrayMapVariableDeclaration(statement, arrayMapCall, context)
    }

    const arrayFilterCall = emitPreparedArrayFilterCallExpression(statement.init, context)

    if (arrayFilterCall != null) {
      return emitArrayFilterVariableDeclaration(statement, arrayFilterCall, context)
    }

    const arraySortCall = emitPreparedArraySortCallExpression(statement.init, context)

    if (arraySortCall != null) {
      return emitArraySortVariableDeclaration(statement, arraySortCall, context)
    }

    if (statement.nullable === true && isRuntimeNullableType(statement.valueType)) {
      return emitNullableRuntimeValueVariableDeclaration(statement, context)
    }

    if (isErrorConstructorExpression(statement.init)) {
      return emitErrorObjectVariableDeclaration(statement, context)
    }

    if (isClassConstructorExpression(statement.init, context)) {
      return emitClassObjectVariableDeclaration(statement, context)
    }

    const jsonParseDeclaration = emitJsonParseVariableDeclaration(statement, context)

    if (jsonParseDeclaration != null) {
      return jsonParseDeclaration
    }

    if (statement.init?.type === 'ObjectLiteral') {
      if (context.boxedMutableCaptureDeclarations.has(statement)) {
        return emitBoxedObjectVariableDeclaration(statement, context)
      }

      return emitObjectVariableDeclaration(statement, context)
    }

    if (statement.init?.type === 'ArrayLiteral') {
      return emitArrayVariableDeclaration(statement, context)
    }

    if (isMemberAccessExpression(statement.init)) {
      const member = resolveKnownObjectMember(statement.init, context)

      if (member != null) {
        return emitKnownObjectMemberVariableDeclaration(statement, member, context)
      }
    }

    if (isIndexAccessExpression(statement.init)) {
      const element = resolveKnownArrayIndex(statement.init, context)

      if (element != null) {
        return emitKnownArrayIndexVariableDeclaration(statement, element, context)
      }

      const field = resolveKnownObjectIndex(statement.init, context)

      if (field != null) {
        return emitDynamicObjectMemberVariableDeclaration(statement, field, context)
      }
    }

    if (isRuntimeValueLocalExpression(statement.init, context)) {
      return emitRuntimeValueVariableDeclaration(statement, statement.init, context)
    }

    if (statement.init?.type === 'CallExpression' && inferExpressionType(statement.init, context) === 'string') {
      return emitRuntimeStringVariableDeclaration(statement, statement.init, context)
    }

    return emitScalarVariableDeclaration(statement, context)
  }

  if (statement.type === 'ExpressionStatement' && isConsoleLog(statement.expression)) {
    return emitConsoleLogStatement(statement.expression.args, context)
  }

  if (statement.type === 'ExpressionStatement' && statement.expression.type === 'CallExpression') {
    const arrayPopCall = emitPreparedArrayPopCallExpression(statement.expression, context, {
      discard: true
    })

    if (arrayPopCall != null) {
      return arrayPopCall.lines
    }

    const arrayPushCall = emitPreparedArrayPushCallExpression(statement.expression, context)

    if (arrayPushCall != null) {
      return arrayPushCall.lines
    }

    const arrayMapCall = emitPreparedArrayMapCallExpression(statement.expression, context)

    if (arrayMapCall != null) {
      return arrayMapCall.lines
    }

    const arrayFilterCall = emitPreparedArrayFilterCallExpression(statement.expression, context)

    if (arrayFilterCall != null) {
      return arrayFilterCall.lines
    }

    const arraySortCall = emitPreparedArraySortCallExpression(statement.expression, context)

    if (arraySortCall != null) {
      return arraySortCall.lines
    }

    const classMethodCall = emitPreparedClassMethodCallExpression(statement.expression, context)

    if (classMethodCall != null) {
      return classMethodCall.expression === ''
        ? classMethodCall.lines
        : [
            ...classMethodCall.lines,
            `${classMethodCall.expression};`
          ]
    }

    if (isArrayMethodCall(statement.expression)) {
      context.diagnostics.push(diagnostic('CCJS_C_ARRAY_METHOD', 'array methods are not supported by the current C backend slice', statement.loc))
      return []
    }

    const collectionCall = emitPreparedCollectionCallExpression(statement.expression, context)

    if (collectionCall != null) {
      return collectionCall.lines
    }

    const fsCall = emitPreparedFsCallExpression(statement.expression, context)

    if (fsCall != null) {
      return fsCall.lines
    }

    const fsSyncCall = emitPreparedFsSyncStatementExpression(statement.expression, context)

    if (fsSyncCall != null) {
      return fsSyncCall.lines
    }

    const timerCall = emitPreparedTimerCallExpression(statement.expression, context)

    if (timerCall != null) {
      return timerCall.lines
    }

    const promise = emitPreparedPromiseStaticExpression(statement.expression, context)

    if (promise != null) {
      return promise.lines
    }

    const call = emitPreparedCallExpression(statement.expression, context)

    return call.expression === ''
      ? call.lines
      : [
          ...call.lines,
          `${call.expression};`
        ]
  }

  if (statement.type === 'ExpressionStatement' && statement.expression.type === 'AwaitExpression') {
    const value = emitCAwaitValueExpression(statement.expression, context)

    return value.lines
  }

  if (statement.type === 'ExpressionStatement' && statement.expression.type === 'AssignmentExpression') {
    const mapIndexAssignment = emitPreparedMapIndexAssignment(statement.expression, context)

    if (mapIndexAssignment != null) {
      return mapIndexAssignment.lines
    }

    if (statement.expression.target.type === 'MemberExpression') {
      const member = resolveKnownObjectMember(statement.expression.target, context)

      if (member != null) {
        return emitKnownObjectMemberAssignment(statement.expression, member, context)
      }
    }

    if (statement.expression.target.type === 'IndexExpression') {
      const bytesIndexAssignment = emitPreparedBytesIndexAssignment(statement.expression, context)

      if (bytesIndexAssignment != null) {
        return bytesIndexAssignment.lines
      }

      const element = resolveKnownArrayIndex(statement.expression.target, context)

      if (element != null) {
        return emitKnownArrayIndexAssignment(statement.expression, element, context)
      }

      const field = resolveKnownObjectIndex(statement.expression.target, context)

      if (field != null) {
        return emitDynamicObjectMemberAssignment(statement.expression, field, context)
      }
    }

    const valueType = inferExpressionType(statement.expression.value, context)

    if (isNullableRuntimeValueAssignment(statement.expression, context)) {
      return emitNullableRuntimeValueAssignment(statement.expression, context)
    }

    if (isBoxedRuntimeValueAssignment(statement.expression, context)) {
      return emitBoxedRuntimeValueAssignment(statement.expression, context)
    }

    if (valueType === 'number' || valueType === 'boolean') {
      const value = emitPreparedNumberExpression(statement.expression.value, context)

      return [
        ...value.lines,
        `${emitReference(statement.expression.target, context)} = ${value.expression};`
      ]
    }

    return [`${emitReference(statement.expression.target, context)} = ${emitCExpression(statement.expression.value, context)};`]
  }

  if (statement.type === 'ReturnStatement') {
    const argument = normalizeCAsyncReturnArgument(statement.argument, context, statement.loc)
    const returnStatement = argument === statement.argument
      ? statement
      : {
          ...statement,
          argument
        }

    if (isRuntimeCallbackReturnContext(context)) {
      return emitRuntimeCallbackReturnStatement(returnStatement, context)
    }

    if (context.returnType === 'promise') {
      return emitPromiseReturnStatement(returnStatement, context)
    }

    if (context.returnNullable === true && isNullableScalarType(context.returnType)) {
      return emitNullableScalarReturnStatement(returnStatement, context)
    }

    if (isManagedRuntimeReturnType(context.returnType)) {
      return emitRuntimeValueReturnStatement(returnStatement, context)
    }

    if (context.returnType !== 'void') {
      const value = argument == null
        ? {
            lines: [],
            expression: '0'
          }
        : emitPreparedNumberExpression(argument, context)

      return [
        ...value.lines,
        `ccjs_return = ${value.expression};`,
        ...emitReturnJump(context)
      ]
    }

    const value = argument?.type === 'AwaitExpression'
      ? emitCAwaitValueExpression(argument, context)
      : null

    if (argument == null || context.returnType === 'void') {
      if (context.cleanupEnabled) {
        return [
          ...(value?.lines ?? []),
          ...emitReturnJump(context)
        ]
      }

      return ['return;']
    }

    return [`return ${emitCExpression(argument, context)};`]
  }

  if (statement.type === 'ExpressionStatement' && statement.expression.type === 'OptionalCallExpression') {
    return emitOptionalRuntimeCallbackCallExpression(statement.expression, context)
  }

  return []
}

function normalizeCAsyncReturnArgument(argument, context, loc) {
  if (argument == null || context.returnType === 'promise' || (argument.valueType !== 'promise' && inferExpressionType(argument, context) !== 'promise')) {
    return argument
  }

  return {
    type: 'AwaitExpression',
    argument,
    valueType: context.returnType,
    loc
  }
}

function emitPromiseReturnStatement(statement, context) {
  const promise = emitPreparedPromiseExpression(statement.argument, context, {
    out: 'ccjs_return',
    owned: false
  })

  if (promise == null) {
    context.diagnostics.push(diagnostic('CCJS_C_ASYNC', 'this Promise return expression is not supported by the current C backend slice', statement.loc))

    return emitReturnJump(context)
  }

  return [
    ...promise.lines,
    ...emitReturnJump(context)
  ]
}

function emitIfStatement(statement, context) {
  const condition = emitPreparedNumberExpression(statement.condition, context)
  const narrowing = resolveNullableScalarConditionNarrowing(statement.condition, context)
  const lines = [
    ...condition.lines,
    `if (${condition.expression}) {`,
    ...withVariableScope(context, () => withNullableScalarNarrowing(context, narrowing.trueNames, () => emitStatementBody(statement.consequent, context))).map(line => `  ${line}`)
  ]

  if (statement.alternate == null) {
    lines.push('}')
    return lines
  }

  lines.push('} else {')
  lines.push(...withVariableScope(context, () => withNullableScalarNarrowing(context, narrowing.falseNames, () => emitStatementBody(statement.alternate, context))).map(line => `  ${line}`))
  lines.push('}')

  return lines
}

function emitWhileStatement(statement, context) {
  const condition = emitPreparedNumberExpression(statement.condition, context)
  const narrowing = resolveNullableScalarConditionNarrowing(statement.condition, context)
  const breakLabel = nextCName(context, 'ccjs_break')
  const continueLabel = nextCName(context, 'ccjs_continue')
  const body = withBreakTarget(context, breakLabel, false, () => withContinueTarget(context, continueLabel, false, () => withVariableScope(context, () => withNullableScalarNarrowing(context, narrowing.trueNames, () => emitStatementBody(statement.body, context)))))

  if (condition.lines.length === 0) {
    return [
      `while (${condition.expression}) {`,
      ...body.map(line => `  ${line}`),
      ...emitContinueTargetLabel(continueLabel, context),
      '}',
      ...emitBreakTargetLabel(breakLabel, context)
    ]
  }

  return [
    'while (1) {',
    ...condition.lines.map(line => `  ${line}`),
    `  if (!(${condition.expression})) break;`,
    ...body.map(line => `  ${line}`),
    ...emitContinueTargetLabel(continueLabel, context),
    '}',
    ...emitBreakTargetLabel(breakLabel, context)
  ]
}

function emitForStatement(statement, context) {
  return withVariableScope(context, () => {
    const init = emitPreparedForInitializer(statement.init, context)
    const test = emitPreparedForExpressionClause(statement.test, context)
    const update = emitPreparedForExpressionClause(statement.update, context)
    const narrowing = resolveNullableScalarConditionNarrowing(statement.test, context)
    const breakLabel = nextCName(context, 'ccjs_break')
    const continueLabel = nextCName(context, 'ccjs_continue')
    const body = withBreakTarget(context, breakLabel, false, () => withContinueTarget(context, continueLabel, false, () => withVariableScope(context, () => withNullableScalarNarrowing(context, narrowing.trueNames, () => emitStatementBody(statement.body, context)))))
    const needsPreparedLowering = init.lines.length > 0 || test.lines.length > 0 || update.lines.length > 0

    if (!needsPreparedLowering) {
      return [
        `for (${init.expression}; ${test.expression}; ${update.expression}) {`,
        ...body.map(line => `  ${line}`),
        ...emitContinueTargetLabel(continueLabel, context),
        '}',
        ...emitBreakTargetLabel(breakLabel, context)
      ]
    }

    const lines = [
      '{'
    ]

    lines.push(...init.lines.map(line => `  ${line}`))

    if (init.expression !== '') {
      lines.push(`  ${init.expression};`)
    }

    lines.push('  for (;;) {')
    lines.push(...test.lines.map(line => `    ${line}`))

    if (test.expression !== '') {
      lines.push(`    if (!(${test.expression})) break;`)
    }

    lines.push(...body.map(line => `    ${line}`))
    lines.push(...emitContinueTargetLabel(continueLabel, context).map(line => `  ${line}`))
    lines.push(...update.lines.map(line => `    ${line}`))

    if (update.expression !== '') {
      lines.push(`    ${update.expression};`)
    }

    lines.push('  }')
    lines.push(...emitBreakTargetLabel(breakLabel, context).map(line => `  ${line}`))
    lines.push('}')

    return lines
  })
}

function emitForOfStatement(statement, context) {
  const setup: string[] = []
  let array: any = resolveKnownForOfArray(statement.iterable, context)
  let runtimeArray: any = null
  let runtimeMap: any = null
  let runtimeSet: any = null

  if (array == null && statement.iterable?.type === 'ArrayLiteral') {
    const name = nextCName(context, 'ccjs_for_array')

    setup.push(...emitArrayVariableDeclaration({
      kind: 'const',
      name,
      init: statement.iterable
    }, context))
    array = resolveKnownForOfArray({
      type: 'Reference',
      path: [name]
    }, context)
  }

  if (array == null) {
    runtimeArray = resolveRuntimeForOfArray(statement.iterable, context)
  }

  if (array == null && runtimeArray == null) {
    runtimeMap = resolveRuntimeForOfMap(statement.iterable, context)
  }

  if (runtimeMap != null) {
    return emitRuntimeMapForOfStatement(statement, runtimeMap, context)
  }

  if (array == null && runtimeArray == null) {
    runtimeSet = resolveRuntimeForOfSet(statement.iterable, context)
  }

  if (runtimeSet != null) {
    return emitRuntimeSetForOfStatement(statement, runtimeSet, context)
  }

  if (array == null && runtimeArray == null) {
    context.diagnostics.push(diagnostic('CCJS_C_FOR_OF', 'C for...of currently supports arrays, Map values and Set values', statement.loc))
    return []
  }

  const elementType = runtimeArray?.elementType ?? resolveForOfElementType(array.elements)

  if (!['number', 'boolean', 'string'].includes(elementType)) {
    context.diagnostics.push(diagnostic('CCJS_C_FOR_OF', 'C for...of currently supports only uniform number/boolean/string arrays', statement.loc))
    return []
  }

  const index = nextCName(context, 'ccjs_for_index')
  const value = nextCName(context, 'ccjs_for_value')
  const length = runtimeArray == null ? `${array.elements.length}` : nextCName(context, 'ccjs_for_length')
  const arrayName = runtimeArray?.name ?? array.name
  const breakLabel = nextCName(context, 'ccjs_break')
  const continueLabel = nextCName(context, 'ccjs_continue')
  const loopValue = elementType === 'boolean'
    ? `((double)(${value}.as.boolean ? 1 : 0))`
    : `${value}.as.number`

  registerOwnedValue(context, value)

  return withVariableScope(context, () => {
    context.variables.set(statement.name, elementType)
    if (elementType === 'string') {
      context.runtimeStrings.add(statement.name)
    }
    const body = withBreakTarget(context, breakLabel, false, () => withContinueTarget(context, continueLabel, false, () => withVariableScope(context, () => emitStatementBody(statement.body, context))))
    const declaration = elementType === 'string'
      ? `ccjs_string* ${statement.name} = (ccjs_string*)${value}.as.ref;`
      : `double ${statement.name} = ${loopValue};`
    const checks = elementType === 'string'
      ? [emitRuntimeTypeCheck(`${value}.tag != CCJS_TAG_STRING || ${value}.as.ref == 0`, context)]
      : []

    return [
      ...setup,
      ...(runtimeArray?.lines ?? []),
      ...(runtimeArray == null
        ? []
        : [
            `size_t ${length} = 0;`,
            emitStatusCheck(`ccjs_array_len(${arrayName}, &${length})`, context)
          ]),
      `for (size_t ${index} = 0; ${index} < ${length}; ${index} += 1) {`,
      ...emitPrepareOwnedValueWrite(value).map(line => `  ${line}`),
      `  ${emitStatusCheck(`ccjs_array_get(${arrayName}, ${index}, &${value})`, context)}`,
      ...checks.map(line => `  ${line}`),
      `  ${declaration}`,
      ...body.map(line => `  ${line}`),
      ...emitContinueTargetLabel(continueLabel, context),
      '}',
      ...emitBreakTargetLabel(breakLabel, context),
      ...emitPrepareOwnedValueWrite(value)
    ]
  })
}

function emitRuntimeMapForOfStatement(statement, runtimeMap, context) {
  const keyType = runtimeMap.keyType ?? 'unknown'
  const valueType = runtimeMap.valueType ?? 'unknown'

  if (!['number', 'boolean', 'string'].includes(keyType) || !['number', 'boolean', 'string'].includes(valueType)) {
    context.diagnostics.push(diagnostic('CCJS_C_FOR_OF', 'C for...of currently supports only Map entries with number/boolean/string keys and values', statement.loc))
    return []
  }

  const index = nextCName(context, 'ccjs_for_map_index')
  const map = nextCName(context, 'ccjs_for_map')
  const shapeName = nextCName(context, 'ccjs_shape_map_entry')
  const fieldsName = `${shapeName}_fields`
  const breakLabel = nextCName(context, 'ccjs_break')
  const continueLabel = nextCName(context, 'ccjs_continue')
  const fields = [
    {
      name: 'key',
      readonly: true,
      valueType: keyType
    },
    {
      name: 'value',
      readonly: true,
      valueType
    }
  ]

  registerOwnedValue(context, statement.name)

  return withVariableScope(context, () => {
    context.variables.set(statement.name, 'object')
    context.objectShapes.set(statement.name, fields)
    const body = withBreakTarget(context, breakLabel, false, () => withContinueTarget(context, continueLabel, false, () => withVariableScope(context, () => emitStatementBody(statement.body, context))))

    return [
      `static const ccjs_field_info ${fieldsName}[] = {`,
      '  { "key", CCJS_FIELD_READONLY },',
      '  { "value", CCJS_FIELD_READONLY },',
      '};',
      `static const ccjs_shape ${shapeName} = {`,
      '  2,',
      `  ${fieldsName}`,
      '};',
      ...runtimeMap.lines,
      `ccjs_map* ${map} = (ccjs_map*)${runtimeMap.name}.as.ref;`,
      `for (size_t ${index} = 0; ${index} < ${map}->cap; ${index} += 1) {`,
      `  if (${map}->entries[${index}].state != CCJS_MAP_SLOT_OCCUPIED) continue;`,
      ...emitPrepareOwnedValueWrite(statement.name).map(line => `  ${line}`),
      `  ${emitStatusCheck(`ccjs_object_new(&ccjs_default_allocator, &${shapeName}, &${statement.name})`, context)}`,
      `  ${emitStatusCheck(`ccjs_object_init_known(${statement.name}, 0, ${map}->entries[${index}].key)`, context)}`,
      `  ${emitStatusCheck(`ccjs_object_init_known(${statement.name}, 1, ${map}->entries[${index}].value)`, context)}`,
      ...body.map(line => `  ${line}`),
      ...emitContinueTargetLabel(continueLabel, context),
      '}',
      ...emitBreakTargetLabel(breakLabel, context),
      ...emitPrepareOwnedValueWrite(statement.name)
    ]
  })
}

function emitRuntimeSetForOfStatement(statement, runtimeSet, context) {
  const elementType = runtimeSet.elementType

  if (!['number', 'boolean', 'string'].includes(elementType)) {
    context.diagnostics.push(diagnostic('CCJS_C_FOR_OF', 'C for...of currently supports only uniform number/boolean/string Set values', statement.loc))
    return []
  }

  const index = nextCName(context, 'ccjs_for_set_index')
  const set = nextCName(context, 'ccjs_for_set')
  const value = nextCName(context, 'ccjs_for_value')
  const breakLabel = nextCName(context, 'ccjs_break')
  const continueLabel = nextCName(context, 'ccjs_continue')
  const loopValue = elementType === 'boolean'
    ? `((double)(${value}.as.boolean ? 1 : 0))`
    : `${value}.as.number`

  registerOwnedValue(context, value)

  return withVariableScope(context, () => {
    context.variables.set(statement.name, elementType)
    if (elementType === 'string') {
      context.runtimeStrings.add(statement.name)
    }
    const body = withBreakTarget(context, breakLabel, false, () => withContinueTarget(context, continueLabel, false, () => withVariableScope(context, () => emitStatementBody(statement.body, context))))
    const declaration = elementType === 'string'
      ? `ccjs_string* ${statement.name} = (ccjs_string*)${value}.as.ref;`
      : `double ${statement.name} = ${loopValue};`
    const checks = elementType === 'string'
      ? [emitRuntimeTypeCheck(`${value}.tag != CCJS_TAG_STRING || ${value}.as.ref == 0`, context)]
      : elementType === 'boolean'
        ? [emitRuntimeTypeCheck(`${value}.tag != CCJS_TAG_BOOL`, context)]
        : [emitRuntimeTypeCheck(`${value}.tag != CCJS_TAG_NUMBER`, context)]

    return [
      ...runtimeSet.lines,
      `ccjs_set* ${set} = (ccjs_set*)${runtimeSet.name}.as.ref;`,
      `for (size_t ${index} = 0; ${index} < ${set}->cap; ${index} += 1) {`,
      `  if (${set}->entries[${index}].state != CCJS_SET_SLOT_OCCUPIED) continue;`,
      ...emitPrepareOwnedValueWrite(value).map(line => `  ${line}`),
      `  ${value} = ${set}->entries[${index}].value;`,
      `  ccjs_retain(${value});`,
      ...checks.map(line => `  ${line}`),
      `  ${declaration}`,
      ...body.map(line => `  ${line}`),
      ...emitContinueTargetLabel(continueLabel, context),
      '}',
      ...emitBreakTargetLabel(breakLabel, context),
      ...emitPrepareOwnedValueWrite(value)
    ]
  })
}

function emitSwitchStatement(statement, context) {
  const discriminant = emitPreparedNumberExpression(statement.discriminant, context)
  const breakLabel = nextCName(context, 'ccjs_break')
  const lines = [
    ...discriminant.lines,
    `switch ((int)${discriminant.expression}) {`
  ]

  for (const item of statement.cases) {
    lines.push(item.test == null ? '  default: {' : `  case ${emitSwitchCaseLabel(item.test, context)}: {`)
    lines.push(...withBreakTarget(context, breakLabel, false, () => withVariableScope(context, () => emitStatementList(item.consequent, context))).map(line => `    ${line}`))
    lines.push('  }')
  }

  lines.push('}')
  lines.push(...emitBreakTargetLabel(breakLabel, context))

  return lines
}

function emitSwitchCaseLabel(expression, context) {
  if (expression?.type === 'NumberLiteral') {
    return `(int)${expression.value}`
  }

  if (expression?.type === 'BooleanLiteral') {
    return `(int)${expression.value ? '1' : '0'}`
  }

  if (expression?.type === 'UnaryExpression' && expression.argument.type === 'NumberLiteral' && ['+', '-'].includes(expression.operator)) {
    return `(int)(${expression.operator}${expression.argument.value})`
  }

  context.diagnostics.push(diagnostic('CCJS_C_SWITCH_CASE', 'C switch case labels must be numeric or boolean literals in the current backend slice', expression?.loc))

  return '0'
}

function emitTryStatement(statement, context) {
  registerErrorChannel(context)

  const id = nextCName(context, 'ccjs_try')
  const catchLabel = statement.handler == null ? null : `${id}_catch`
  const finallyLabel = statement.finalizer == null ? null : `${id}_finally`
  const endLabel = `${id}_end`
  const throwTarget = catchLabel ?? finallyLabel
  const outerReturnTarget = currentReturnTarget(context)
  const outerBreakTarget = currentBreakTarget(context)
  const outerContinueTarget = currentContinueTarget(context)
  const lines = [
    '{'
  ]
  const tryBody = withErrorTarget(context, throwTarget, () => withFinallyFlowTarget(context, finallyLabel, () => withVariableScope(context, () => emitStatementBody(statement.block, context))))

  lines.push(...tryBody.map(line => `  ${line}`))
  lines.push(`  goto ${finallyLabel ?? endLabel};`)

  if (statement.handler != null && catchLabel != null) {
    const catchValueType = inferCatchBindingValueType(statement, context)
    const catchBody = withFinallyFlowTarget(context, finallyLabel, () => withVariableScope(context, () => {
      const body: string[] = []

      if (statement.handler.param != null) {
        if (catchValueType === 'object') {
          context.variables.set(statement.handler.param, 'object')
          registerErrorObjectShape(context, statement.handler.param)
          body.push(`ccjs_value ${statement.handler.param} = ccjs_error;`)
        } else {
          context.variables.set(statement.handler.param, 'string')
          context.runtimeStrings.add(statement.handler.param)
          body.push(`ccjs_string* ${statement.handler.param} = (ccjs_string*)ccjs_error.as.ref;`)
        }
      }

      body.push(...emitStatementBody(statement.handler.body, context))

      return body
    }))

    lines.push(`${catchLabel}:`)
    lines.push(`  if (${emitCatchBindingTypeCheck(catchValueType)}) ${emitFailureStatement(context)}`)
    lines.push('  ccjs_error_active = 0;')
    lines.push('  {')
    lines.push(...catchBody.map(line => `    ${line}`))
    lines.push('  }')
    lines.push('  ccjs_release(ccjs_error);')
    lines.push('  ccjs_error = ccjs_undefined_value();')
  }

  if (statement.finalizer != null && finallyLabel != null) {
    const outerThrowTarget = currentErrorTarget(context)
    const finalizerBody = withErrorTarget(context, outerThrowTarget, () => withReturnTarget(context, outerReturnTarget, () => withBreakTarget(context, outerBreakTarget?.label ?? null, outerBreakTarget?.throughFinally === true, () => withContinueTarget(context, outerContinueTarget?.label ?? null, outerContinueTarget?.throughFinally === true, () => withVariableScope(context, () => emitStatementBody(statement.finalizer, context))))))

    lines.push(`${finallyLabel}:`)
    lines.push(...finalizerBody.map(line => `  ${line}`))

    if (outerThrowTarget != null) {
      lines.push(`  if (ccjs_error_active) goto ${outerThrowTarget};`)
    } else {
      lines.push(`  if (ccjs_error_active) ${emitFailureStatement(context)}`)
    }

    if (context.returnFlowUsed) {
      if (outerReturnTarget != null) {
        lines.push(`  if (ccjs_return_active) goto ${outerReturnTarget};`)
      } else {
        lines.push(`  if (ccjs_return_active) ${emitReturnCleanupStatement(context)}`)
      }
    }

    if (context.breakFlowUsed && outerBreakTarget != null) {
      lines.push(`  if (ccjs_break_active) goto ${outerBreakTarget.label};`)
    }

    if (context.continueFlowUsed && outerContinueTarget != null) {
      lines.push(`  if (ccjs_continue_active) goto ${outerContinueTarget.label};`)
    }
  }

  lines.push(`${endLabel}:`)
  lines.push('  ;')
  lines.push('}')

  return lines
}

function emitThrowStatement(statement, context) {
  const target = currentErrorTarget(context)

  if (target == null && !context.throwingFunction) {
    context.diagnostics.push(diagnostic('CCJS_C_THROW', 'uncaught throw is not supported by the current C backend slice', statement.loc))
    return []
  }

  const isErrorObject = isErrorValueExpression(statement.argument, context)

  if (inferExpressionType(statement.argument, context) !== 'string' && !isErrorObject) {
    context.diagnostics.push(diagnostic('CCJS_C_THROW', 'C throw currently supports only string values and lightweight Error objects in local try/catch regions', statement.loc))
    return []
  }

  registerErrorChannel(context)

  const value = emitCValueExpression(statement.argument, context)

  return [
    ...value.lines,
    ...emitPrepareOwnedValueWrite('ccjs_error'),
    `ccjs_error = ${value.expression};`,
    emitRuntimeTypeCheck(isErrorObject ? 'ccjs_error.tag != CCJS_TAG_OBJECT || ccjs_error.as.ref == 0' : 'ccjs_error.tag != CCJS_TAG_STRING || ccjs_error.as.ref == 0', context),
    'ccjs_retain(ccjs_error);',
    ...(target == null
      ? [
          'ccjs_status_result = CCJS_ERR_THROW;'
        ]
      : []),
    'ccjs_error_active = 1;',
    `goto ${target ?? 'ccjs_cleanup'};`
  ]
}

function inferCatchBindingValueType(statement, context) {
  const types = [
    ...collectIrLocalThrowValueTypes(statement.block, {
      errorObjectNames: context.errorObjectNames,
      functionThrowValueTypes: context.functionThrowValueTypes
    }),
    ...collectLocalAwaitRejectionValueTypes(statement.block, context)
  ]

  return types.length > 0 && types.every(type => type === 'error') ? 'object' : 'string'
}

function collectLocalAwaitRejectionValueTypes(node, context, localPromiseRejectionValueTypes = new Map(), localErrorObjectNames = new Set(context.errorObjectNames)) {
  if (node == null) {
    return []
  }

  if (Array.isArray(node)) {
    const types: string[] = []

    for (const item of node) {
      types.push(...collectLocalAwaitRejectionValueTypes(item, context, localPromiseRejectionValueTypes, localErrorObjectNames))
    }

    return types
  }

  if (typeof node !== 'object') {
    return []
  }

  if (node.type === 'BlockStatement') {
    return collectLocalAwaitRejectionValueTypes(node.body, context, new Map(localPromiseRejectionValueTypes), new Set(localErrorObjectNames))
  }

  if (node.type === 'VariableDeclaration') {
    const types = collectLocalAwaitRejectionValueTypes(node.init, context, localPromiseRejectionValueTypes, localErrorObjectNames)

    if (isErrorConstructorExpression(node.init)) {
      localErrorObjectNames.add(node.name)
    }

    if (node.valueType === 'promise') {
      const rejectionValueType = inferPromiseRejectionValueType(node.init, context, localPromiseRejectionValueTypes, localErrorObjectNames)

      if (rejectionValueType !== 'unknown') {
        localPromiseRejectionValueTypes.set(node.name, rejectionValueType)
      }
    }

    return types
  }

  if (node.type === 'AwaitExpression') {
    const rejectionValueType = inferPromiseRejectionValueType(node.argument, context, localPromiseRejectionValueTypes, localErrorObjectNames)

    return rejectionValueType === 'unknown' ? [] : [rejectionValueType]
  }

  return Object.values(node).flatMap(value => collectLocalAwaitRejectionValueTypes(value, context, localPromiseRejectionValueTypes, localErrorObjectNames))
}

function inferPromiseRejectionValueType(expression, context, localPromiseRejectionValueTypes = context.promiseRejectionValueTypes, localErrorObjectNames = context.errorObjectNames) {
  if (expression?.type === 'CallExpression' && cPromiseRuntimeCallName(expression.callee) === 'reject') {
    return inferRejectedValueType(expression.args[0], context, localErrorObjectNames)
  }

  if (expression?.type === 'CallExpression' && cFsRuntimeCallName(expression.callee) != null) {
    return 'error'
  }

  if (expression?.type === 'Reference' && expression.path.length === 1) {
    return localPromiseRejectionValueTypes.get(expression.path[0]) ?? context.promiseRejectionValueTypes.get(expression.path[0]) ?? 'unknown'
  }

  return 'unknown'
}

function inferRejectedValueType(expression, context, localErrorObjectNames = context.errorObjectNames) {
  if (isKnownErrorValueExpression(expression, context, localErrorObjectNames)) {
    return 'error'
  }

  if (expression?.type === 'StringLiteral' || expression?.type === 'TemplateLiteral' || inferExpressionType(expression, context) === 'string') {
    return 'string'
  }

  return 'unknown'
}

function emitCatchBindingTypeCheck(valueType) {
  return valueType === 'object'
    ? 'ccjs_error.tag != CCJS_TAG_OBJECT || ccjs_error.as.ref == 0'
    : 'ccjs_error.tag != CCJS_TAG_STRING || ccjs_error.as.ref == 0'
}

function registerErrorChannel(context) {
  context.errorChannelUsed = true
  registerOwnedValue(context, 'ccjs_error')
}

function currentErrorTarget(context) {
  return context.errorTargets.at(-1) ?? null
}

function emitBreakJump(context) {
  const target = currentBreakTarget(context)

  if (target == null) {
    return ['break;']
  }

  if (target.throughFinally) {
    registerBreakFlow(context)

    return [
      'ccjs_break_active = 1;',
      `goto ${target.label};`
    ]
  }

  return [`goto ${target.label};`]
}

function emitContinueJump(context) {
  const target = currentContinueTarget(context)

  if (target == null) {
    return ['continue;']
  }

  if (target.throughFinally) {
    registerContinueFlow(context)

    return [
      'ccjs_continue_active = 1;',
      `goto ${target.label};`
    ]
  }

  return [`goto ${target.label};`]
}

function emitBreakTargetLabel(label, context) {
  return [
    `${label}:`,
    ...(context.breakFlowUsed ? ['  if (ccjs_break_active) ccjs_break_active = 0;'] : []),
    ';'
  ]
}

function emitContinueTargetLabel(label, context) {
  return [
    `${label}:`,
    ...(context.continueFlowUsed ? ['  if (ccjs_continue_active) ccjs_continue_active = 0;'] : []),
    '  ;'
  ]
}

function registerBreakFlow(context) {
  context.breakFlowUsed = true
}

function registerContinueFlow(context) {
  context.continueFlowUsed = true
}

function currentBreakTarget(context) {
  return context.breakTargets.at(-1) ?? null
}

function currentContinueTarget(context) {
  return context.continueTargets.at(-1) ?? null
}

function withBreakTarget(context, label, throughFinally, callback) {
  if (label == null) {
    return callback()
  }

  context.breakTargets.push({
    label,
    throughFinally
  })

  try {
    return callback()
  } finally {
    context.breakTargets.pop()
  }
}

function withContinueTarget(context, label, throughFinally, callback) {
  if (label == null) {
    return callback()
  }

  context.continueTargets.push({
    label,
    throughFinally
  })

  try {
    return callback()
  } finally {
    context.continueTargets.pop()
  }
}

function withFinallyFlowTarget(context, label, callback) {
  return withReturnTarget(context, label, () => withBreakTarget(context, label, true, () => withContinueTarget(context, label, true, callback)))
}

function emitReturnJump(context) {
  const target = currentReturnTarget(context)

  if (target != null) {
    registerReturnFlow(context)

    return [
      'ccjs_return_active = 1;',
      `goto ${target};`
    ]
  }

  return [emitReturnCleanupStatement(context)]
}

function emitReturnCleanupStatement(context) {
  if (context.statusReturn && context.runtimeCallbackCleanupLabel != null) {
    context.usedRuntimeCallbackCleanupGoto = true

    return `goto ${context.runtimeCallbackCleanupLabel};`
  }

  if (context.cleanupEnabled) {
    context.usedCleanupGoto = true

    return 'goto ccjs_cleanup;'
  }

  return context.returnType === 'void' ? 'return;' : 'return ccjs_return;'
}

function registerReturnFlow(context) {
  context.returnFlowUsed = true
}

function currentReturnTarget(context) {
  return context.returnTargets.at(-1) ?? null
}

function withReturnTarget(context, target, callback) {
  if (target == null) {
    return callback()
  }

  context.returnTargets.push(target)

  try {
    return callback()
  } finally {
    context.returnTargets.pop()
  }
}

function withErrorTarget(context, target, callback) {
  if (target == null) {
    return callback()
  }

  context.errorTargets.push(target)

  try {
    return callback()
  } finally {
    context.errorTargets.pop()
  }
}

function emitStatementBody(statement, context) {
  if (statement.type === 'BlockStatement') {
    return emitStatementList(statement.body, context)
  }

  return emitStatement(statement, context)
}

function emitStatementList(statements, context) {
  return statements.flatMap(statement => {
    const lines = emitStatement(statement, context)

    applyNullableScalarEarlyReturnNarrowing(statement, context)

    return lines
  })
}

function applyNullableScalarEarlyReturnNarrowing(statement, context) {
  if (statement.type !== 'IfStatement' || statement.alternate != null || !statementDefinitelyReturns(statement.consequent)) {
    return
  }

  const narrowing = resolveNullableScalarConditionNarrowing(statement.condition, context)

  narrowNullableScalars(context, narrowing.falseNames)
}

function statementDefinitelyReturns(statement) {
  if (statement.type === 'ReturnStatement') {
    return true
  }

  if (statement.type === 'BlockStatement') {
    return statement.body.some(statementDefinitelyReturns)
  }

  if (statement.type === 'IfStatement' && statement.alternate != null) {
    return statementDefinitelyReturns(statement.consequent) && statementDefinitelyReturns(statement.alternate)
  }

  return false
}

function emitForInitializer(init, context) {
  if (init == null) {
    return ''
  }

  if (init.type === 'VariableDeclaration') {
    return emitVariableDeclaration(init, context)
  }

  return emitCExpression(init, context)
}

function emitPreparedForInitializer(init, context) {
  if (init == null) {
    return {
      lines: [],
      expression: ''
    }
  }

  if (init.type === 'VariableDeclaration') {
    return emitPreparedForVariableDeclaration(init, context)
  }

  return emitPreparedForExpressionClause(init, context)
}

function emitPreparedForVariableDeclaration(statement, context) {
  const fsCall = emitPreparedFsCallExpression(statement.init, context, {
    out: statement.name
  })

  if (fsCall != null) {
    return {
      lines: fsCall.lines,
      expression: ''
    }
  }

  const promise = emitPreparedPromiseStaticExpression(statement.init, context, {
    out: statement.name
  })

  if (promise != null) {
    return {
      lines: promise.lines,
      expression: ''
    }
  }

  const promiseCall = emitPreparedPromiseReturningCallExpression(statement.init, context, {
    out: statement.name
  })

  if (promiseCall != null) {
    return {
      lines: promiseCall.lines,
      expression: ''
    }
  }

  if (isCollectionConstructorExpression(statement.init)) {
    return {
      lines: emitCollectionVariableDeclaration(statement, context),
      expression: ''
    }
  }

  const arrayMapCall = emitPreparedArrayMapCallExpression(statement.init, context)

  if (arrayMapCall != null) {
    return {
      lines: emitArrayMapVariableDeclaration(statement, arrayMapCall, context),
      expression: ''
    }
  }

  const arrayFilterCall = emitPreparedArrayFilterCallExpression(statement.init, context)

  if (arrayFilterCall != null) {
    return {
      lines: emitArrayFilterVariableDeclaration(statement, arrayFilterCall, context),
      expression: ''
    }
  }

  const arraySortCall = emitPreparedArraySortCallExpression(statement.init, context)

  if (arraySortCall != null) {
    return {
      lines: emitArraySortVariableDeclaration(statement, arraySortCall, context),
      expression: ''
    }
  }

  if (statement.nullable === true && isRuntimeNullableType(statement.valueType)) {
    return {
      lines: emitNullableRuntimeValueVariableDeclaration(statement, context),
      expression: ''
    }
  }

  if (isErrorConstructorExpression(statement.init)) {
    return {
      lines: emitErrorObjectVariableDeclaration(statement, context),
      expression: ''
    }
  }

  if (isClassConstructorExpression(statement.init, context)) {
    return {
      lines: emitClassObjectVariableDeclaration(statement, context),
      expression: ''
    }
  }

  if (statement.init?.type === 'ObjectLiteral') {
    return {
      lines: emitObjectVariableDeclaration(statement, context),
      expression: ''
    }
  }

  if (statement.init?.type === 'ArrayLiteral') {
    return {
      lines: emitArrayVariableDeclaration(statement, context),
      expression: ''
    }
  }

  if (isMemberAccessExpression(statement.init)) {
    const member = resolveKnownObjectMember(statement.init, context)

    if (member != null) {
      return {
        lines: emitKnownObjectMemberVariableDeclaration(statement, member, context),
        expression: ''
      }
    }
  }

  if (isIndexAccessExpression(statement.init)) {
    const element = resolveKnownArrayIndex(statement.init, context)

    if (element != null) {
      return {
        lines: emitKnownArrayIndexVariableDeclaration(statement, element, context),
        expression: ''
      }
    }

    const field = resolveKnownObjectIndex(statement.init, context)

    if (field != null) {
      return {
        lines: emitDynamicObjectMemberVariableDeclaration(statement, field, context),
        expression: ''
      }
    }
  }

  if (isRuntimeProducedStringExpression(statement.init, context)) {
    return {
      lines: emitRuntimeStringVariableDeclaration(statement, statement.init, context),
      expression: ''
    }
  }

  if (isRuntimeValueLocalExpression(statement.init, context)) {
    return {
      lines: emitRuntimeValueVariableDeclaration(statement, statement.init, context),
      expression: ''
    }
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
      return {
        lines: [],
        expression: `${statement.kind === 'const' ? 'const ' : ''}ccjs_string* ${statement.name} = ${runtimeString}`
      }
    }

    if (isRuntimeProducedStringExpression(statement.init, context)) {
      return {
        lines: emitRuntimeStringVariableDeclaration(statement, statement.init, context),
        expression: ''
      }
    }

    return {
      lines: [],
      expression: `${statement.kind === 'const' ? 'const ' : ''}char* ${statement.name} = ${emitStringExpression(statement.init, context)}`
    }
  }

  if (inferred === 'function') {
    context.variables.set(statement.name, 'function')
    context.functionTypes.set(statement.name, statement.functionType)

    if (isRuntimeFunctionType(statement.functionType)) {
      return {
        lines: emitRuntimeCallbackVariableDeclaration(statement, context),
        expression: ''
      }
    }

    return {
      lines: [],
      expression: emitFunctionPointerVariable(statement.name, statement.init, context, statement.kind === 'const', statement.functionType, statement.loc)
    }
  }

  if (!['number', 'boolean'].includes(inferred)) {
    context.diagnostics.push(diagnostic(cUnsupportedExpressionCode(inferred), 'this expression is not supported by the current C backend slice', statement.loc))

    return {
      lines: [],
      expression: `double ${statement.name} = 0`
    }
  }

  const value = emitPreparedNumberExpression(statement.init, context)

  return {
    lines: value.lines,
    expression: `${statement.kind === 'const' ? 'const ' : ''}double ${statement.name} = ${value.expression}`
  }
}

function emitPreparedForExpressionClause(expression, context) {
  if (expression == null) {
    return {
      lines: [],
      expression: ''
    }
  }

  return emitPreparedNumberExpression(expression, context)
}

function isRuntimeCallbackReturnContext(context) {
  return context.statusReturn === true
    && (
      context.runtimeCallbackReturnType === 'void'
      || ['number', 'boolean'].includes(context.runtimeCallbackReturnType)
      || isManagedRuntimeReturnType(context.runtimeCallbackReturnType)
    )
}

function emitRuntimeCallbackReturnStatement(statement, context) {
  if (context.runtimeCallbackReturnType === 'void') {
    return emitReturnJump(context)
  }

  const lines = isManagedRuntimeReturnType(context.runtimeCallbackReturnType)
    ? emitRuntimeCallbackRuntimeValueReturnLines(statement.argument, context)
    : emitRuntimeCallbackScalarReturnLines(statement.argument, context)

  return [
    ...lines,
    ...emitReturnJump(context)
  ]
}

function emitRuntimeCallbackScalarReturnLines(argument, context) {
  const value = argument == null
    ? {
        lines: [],
        expression: '0'
      }
    : emitPreparedNumberExpression(argument, context)
  const expression = context.runtimeCallbackReturnType === 'number'
    ? `ccjs_number_value(${value.expression})`
    : `ccjs_bool_value((${value.expression}) != 0)`

  return [
    ...value.lines,
    `${context.runtimeCallbackReturnOut} = ${expression};`
  ]
}

function emitRuntimeCallbackRuntimeValueReturnLines(argument, context) {
  const expectedTag = cRuntimeValueTag(context.runtimeCallbackReturnType)
  const value = argument == null
    ? {
        lines: [],
        expression: 'ccjs_undefined_value()'
      }
    : emitRuntimeReturnValueExpression(argument, context, context.runtimeCallbackReturnType, context.runtimeCallbackReturnShape)

  return [
    ...value.lines,
    `${context.runtimeCallbackReturnOut} = ${value.expression};`,
    emitRuntimeValueCheck(context.runtimeCallbackReturnOut, expectedTag, context),
    `ccjs_retain(${context.runtimeCallbackReturnOut});`
  ]
}

function isManagedRuntimeReturnType(valueType) {
  return valueType === 'bytes'
    || valueType === 'string'
    || valueType === 'object'
    || valueType === 'array'
    || valueType === 'map'
    || valueType === 'set'
}

function emitRuntimeReturnValueExpression(argument, context, returnType, returnShape) {
  if (returnType === 'object' && argument?.type === 'ObjectLiteral') {
    return emitCObjectLiteralValueExpression(argument, context, returnShape)
  }

  return emitCValueExpression(argument, context)
}

function emitRuntimeValueReturnStatement(statement, context) {
  if (statement.argument == null) {
    return emitReturnJump(context)
  }

  const expectedTag = cRuntimeValueTag(context.returnType)
  const value = emitRuntimeReturnValueExpression(statement.argument, context, context.returnType, context.returnShape)

  return [
    ...value.lines,
    `ccjs_return = ${value.expression};`,
    emitRuntimeValueCheck('ccjs_return', expectedTag, context),
    'ccjs_retain(ccjs_return);',
    ...emitReturnJump(context)
  ]
}

function emitNullableScalarReturnStatement(statement, context) {
  const expectedTag = cRuntimeValueTag(context.returnType)
  const value = statement.argument == null
    ? {
        lines: [],
        expression: 'ccjs_null_value()'
      }
    : emitNullableScalarValueExpression(statement.argument, context)

  return [
    ...value.lines,
    `ccjs_return = ${value.expression};`,
    ...emitRuntimeNullableValueCheck('ccjs_return', expectedTag, context),
    ...emitReturnJump(context)
  ]
}

function emitRuntimeStringVariableDeclaration(statement, expression, context) {
  const value = emitCValueExpression(expression, context)
  const lines = [
    ...value.lines,
    `${statement.kind === 'const' ? 'const ' : ''}ccjs_string* ${statement.name} = (ccjs_string*)${value.expression}.as.ref;`
  ]

  context.variables.set(statement.name, 'string')
  context.runtimeStrings.add(statement.name)

  return lines
}

function emitRuntimeValueVariableDeclaration(statement, expression, context) {
  const valueType = inferExpressionType(expression, context)
  const expectedTag = cRuntimeValueTag(valueType)
  const value = valueType === 'object' && expression?.type === 'ObjectLiteral'
    ? emitCObjectLiteralValueExpression(expression, context, statement.shape)
    : emitCValueExpression(expression, context)

  registerOwnedValue(context, statement.name)
  registerRuntimeValueMetadata(statement.name, valueType, statement, expression, context)

  return [
    ...value.lines,
    ...emitPrepareOwnedValueWrite(statement.name),
    `${statement.name} = ${value.expression};`,
    emitRuntimeValueCheck(statement.name, expectedTag, context),
    `ccjs_retain(${statement.name});`
  ]
}

function registerRuntimeValueMetadata(name, valueType, declaration, expression, context) {
  context.variables.set(name, valueType)

  if (valueType === 'object') {
    registerObjectShape(context, name, declaration.shape ?? expression?.shape ?? null)
  } else if (valueType === 'array') {
    context.runtimeArrayElementTypes.set(name, declaration.arrayElementType ?? resolveRuntimeArrayElementType(expression, context) ?? expression?.arrayElementType ?? 'unknown')
  } else if (valueType === 'map') {
    const mapType = resolveRuntimeMapType(expression, context)

    context.mapTypes.set(name, {
      key: declaration.mapKeyType ?? mapType?.key ?? expression?.mapKeyType ?? 'unknown',
      value: declaration.mapValueType ?? mapType?.value ?? expression?.mapValueType ?? 'unknown'
    })
  } else if (valueType === 'set') {
    context.setElementTypes.set(name, declaration.setElementType ?? resolveRuntimeSetElementType(expression, context) ?? expression?.setElementType ?? 'unknown')
  }
}

function isRuntimeValueLocalExpression(expression, context) {
  const valueType = inferExpressionType(expression, context)

  return valueType === 'bytes'
    || valueType === 'object'
    || valueType === 'array'
    || valueType === 'map'
    || valueType === 'set'
}

function reportCCollectionHashability(valueType, subject, loc, context) {
  if (valueType == null || valueType === 'unknown' || isCCollectionHashableType(valueType)) {
    return
  }

  context.diagnostics.push(diagnostic('CCJS_C_COLLECTION', `${subject} must be hashable in the current C backend slice`, loc))
}

function isCCollectionHashableType(valueType) {
  return valueType === 'number' || valueType === 'boolean' || valueType === 'string'
}

function emitCollectionVariableDeclaration(statement, context) {
  const constructor = collectionConstructorName(statement.init)

  if (constructor == null) {
    context.diagnostics.push(diagnostic('CCJS_C_COLLECTION', 'this collection constructor is not supported by the current C backend slice', statement.loc))
    return [`double ${statement.name} = 0;`]
  }

  if (statement.init.args.length > 1) {
    context.diagnostics.push(diagnostic('CCJS_C_COLLECTION', 'C collection constructors currently support at most one array literal iterable', statement.init.loc))
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
    context.diagnostics.push(diagnostic('CCJS_C_COLLECTION', 'C Map constructor currently supports only array literal entries', expression.loc ?? loc))
    return []
  }

  const lines: string[] = []

  for (const entry of expression.elements) {
    if (entry.type !== 'ArrayLiteral' || entry.elements.length !== 2) {
      context.diagnostics.push(diagnostic('CCJS_C_COLLECTION', 'C Map constructor entries must be [key, value] array literals', entry.loc ?? loc))
      continue
    }

    const key = emitCValueExpression(entry.elements[0], context)
    const value = emitCValueExpression(entry.elements[1], context)
    reportCCollectionHashability(inferExpressionType(entry.elements[0], context), 'Map keys', entry.elements[0].loc ?? entry.loc ?? loc, context)

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
    context.diagnostics.push(diagnostic('CCJS_C_COLLECTION', 'C Set constructor currently supports only array literal values', expression.loc ?? loc))
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
  const fields = statement.shape?.fields ?? statement.init.properties.map(property => ({
    name: property.key,
    readonly: false,
    valueType: inferExpressionType(property.value, context)
  }))
  const properties = new Map<string, AnyNode>(statement.init.properties.map(property => [property.key, property]))
  const lines = [
    `static const ccjs_field_info ${fieldsName}[] = {`
  ]

  for (const field of fields) {
    lines.push(`  { ${cStringLiteral(field.name)}, ${field.readonly ? 'CCJS_FIELD_READONLY' : '0'} },`)
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
  context.objectShapes.set(statement.name, fields.map(field => ({
    name: field.name,
    valueType: field.valueType,
    arrayElementType: field.arrayElementType,
    mapKeyType: field.mapKeyType,
    mapValueType: field.mapValueType,
    setElementType: field.setElementType
  })))

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
  const lines = [
    `static const ccjs_field_info ${fieldsName}[] = {`
  ]

  for (const field of fields) {
    lines.push(`  { ${cStringLiteral(field.name)}, ${field.readonly ? 'CCJS_FIELD_READONLY' : '0'} },`)
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
    lines.push(emitStatusCheck(`ccjs_object_get(${parsed}, ${cStringLiteral(field.name)}, ${utf8ByteLength(field.name)}, &${value})`, context))
    lines.push(...(field.nullable === true ? emitRuntimeNullableValueCheck(value, tag, context) : [emitRuntimeValueCheck(value, tag, context)].filter(Boolean)))
    lines.push(emitStatusCheck(`ccjs_object_init_known(${statement.name}, ${index}, ${value})`, context))
  }

  return lines
}

function emitClassObjectVariableDeclaration(statement, context) {
  const info = resolveClassConstructorInfo(statement.init, context)

  if (info == null) {
    context.diagnostics.push(diagnostic('CCJS_C_CLASS', 'this class constructor is not supported by the current C backend slice', statement.init?.loc ?? statement.loc))
    return [`ccjs_value ${statement.name} = ccjs_undefined_value();`]
  }

  registerOwnedValue(context, statement.name)
  context.variables.set(statement.name, 'object')
  context.classInstanceTypes.set(statement.name, info.name)
  registerClassObjectShape(context, statement.name, info)

  return emitCClassObjectInitLines(statement.name, statement.init, info, context)
}

function emitCClassObjectValueExpression(expression, context) {
  const info = resolveClassConstructorInfo(expression, context)
  const temp = nextCName(context, 'ccjs_class_object')
  registerOwnedValue(context, temp)

  if (info == null) {
    context.diagnostics.push(diagnostic('CCJS_C_CLASS', 'this class constructor is not supported by the current C backend slice', expression?.loc))

    return {
      lines: [
        ...emitPrepareOwnedValueWrite(temp),
        `${temp} = ccjs_undefined_value();`
      ],
      expression: temp
    }
  }

  return {
    lines: emitCClassObjectInitLines(temp, expression, info, context),
    expression: temp
  }
}

function emitCClassObjectInitLines(target, expression, info, context) {
  const shapeName = nextCName(context, `ccjs_shape_${info.name}`)
  const fieldsName = `${shapeName}_fields`
  const lines = [
    `static const ccjs_field_info ${fieldsName}[] = {`
  ]

  for (const field of info.fields) {
    lines.push(`  { ${cStringLiteral(field.name)}, ${field.readonly ? 'CCJS_FIELD_READONLY' : '0'} },`)
  }

  lines.push('};')
  lines.push(`static const ccjs_shape ${shapeName} = {`)
  lines.push(`  ${info.fields.length},`)
  lines.push(`  ${fieldsName}`)
  lines.push('};')
  lines.push(...emitPrepareOwnedValueWrite(target))
  lines.push(emitStatusCheck(`ccjs_object_new(&ccjs_default_allocator, &${shapeName}, &${target})`, context))

  const constructorArgs = mapClassConstructorArgs(expression, info)

  for (const assignment of info.assignments) {
    const fieldIndex = info.fields.findIndex(field => field.name === assignment.field)

    if (fieldIndex === -1) {
      context.diagnostics.push(diagnostic('CCJS_UNKNOWN_FIELD', `unknown class field ${assignment.field}`, assignment.loc ?? expression.loc))
      continue
    }

    const value = emitCValueExpression(substituteClassConstructorParams(assignment.value, constructorArgs), context)
    lines.push(...value.lines)
    lines.push(emitStatusCheck(`ccjs_object_init_known(${target}, ${fieldIndex}, ${value.expression})`, context))
  }

  return lines
}

function registerClassObjectShape(context, name, info) {
  context.objectShapes.set(name, info.fields.map(field => ({
    name: field.name,
    valueType: field.valueType,
    arrayElementType: field.arrayElementType,
    mapKeyType: field.mapKeyType,
    mapValueType: field.mapValueType,
    setElementType: field.setElementType
  })))
}

function mapClassConstructorArgs(expression, info) {
  const args = new Map<string, AnyNode>()
  const params = info.constructor?.params ?? []

  for (const [index, param] of params.entries()) {
    if (expression.args[index] != null) {
      args.set(param.name, expression.args[index])
    }
  }

  return args
}

function substituteClassConstructorParams(node, args) {
  if (node == null || typeof node !== 'object') {
    return node
  }

  if (Array.isArray(node)) {
    return node.map(item => substituteClassConstructorParams(item, args))
  }

  if (node.type === 'Reference' && node.path.length === 1 && args.has(node.path[0])) {
    return args.get(node.path[0])
  }

  const copy = {}

  for (const [key, value] of Object.entries(node)) {
    copy[key] = substituteClassConstructorParams(value, args)
  }

  return copy
}

function resolveClassConstructorInfo(expression, context) {
  if (expression?.type !== 'NewExpression' || expression.callee.type !== 'Reference' || expression.callee.path.length !== 1) {
    return null
  }

  return context.classInfos.get(expression.callee.path[0]) ?? null
}

function isClassConstructorExpression(expression, context) {
  return resolveClassConstructorInfo(expression, context) != null
}

function emitPreparedClassMethodCallExpression(expression, context) {
  const call = resolveClassMethodCallInfo(expression, context)

  if (call == null) {
    return null
  }

  if (call.method == null) {
    context.diagnostics.push(diagnostic('CCJS_UNKNOWN_FIELD', `unknown method ${expression.callee.property}`, expression.callee.loc ?? expression.loc))
    return {
      lines: [],
      expression: ''
    }
  }

  if (call.method.params.length !== expression.args.length) {
    context.diagnostics.push(diagnostic('CCJS_ARG_COUNT', `method ${expression.callee.property} expects ${call.method.params.length} argument(s), got ${expression.args.length}`, expression.loc))
  }

  const prepared = emitPreparedCallArgs(expression, call.method.params, context)
  const callExpression = `${emitCClassMethodName(call.info.name, call.method.name)}(${[call.objectExpression, ...prepared.args].join(', ')})`

  if (isManagedRuntimeReturnType(call.method.returnType)) {
    const value = nextCName(context, 'ccjs_method_value')
    const tag = cRuntimeValueTag(call.method.returnType)
    registerOwnedValue(context, value)

    return {
      lines: [
        ...prepared.lines,
        ...emitPrepareOwnedValueWrite(value),
        `${value} = ${callExpression};`,
        emitRuntimeValueCheck(value, tag, context)
      ],
      expression: value
    }
  }

  return {
    lines: prepared.lines,
    expression: call.method.returnType === 'void' ? `${callExpression}` : callExpression
  }
}

function resolveClassMethodCallInfo(expression, context) {
  if (expression?.type !== 'CallExpression' || expression.callee.type !== 'MemberExpression') {
    return null
  }

  const objectName = resolveCObjectExpressionName(expression.callee.object)

  if (objectName == null) {
    return null
  }

  const className = context.classInstanceTypes.get(objectName)

  if (className == null) {
    return null
  }

  const info = context.classInfos.get(className)

  if (info == null) {
    return null
  }

  return {
    info,
    method: info.methods.get(expression.callee.property) ?? null,
    objectExpression: emitObjectValueReference(objectName, context)
  }
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
    return [
      ...emitPrepareOwnedValueWrite(statement.name),
      `${statement.name} = ccjs_null_value();`
    ]
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

  if (isRuntimeValueLocalExpression(statement.init, context) && statement.init?.type !== 'ObjectLiteral' && statement.init?.type !== 'ArrayLiteral') {
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
      context.diagnostics.push(diagnostic('CCJS_C_STRING_EXPR', 'runtime string declarations need prepared statement lowering in the current C backend slice', statement.loc))
      return `char* ${statement.name} = ""`
    }

    return `${statement.kind === 'const' ? 'const ' : ''}char* ${statement.name} = ${emitStringExpression(statement.init, context)}`
  }

  if (inferred === 'function') {
    context.variables.set(statement.name, 'function')
    context.functionTypes.set(statement.name, statement.functionType)

    if (isRuntimeFunctionType(statement.functionType) || isRuntimeArrowCallbackExpression(statement.init, context)) {
      context.diagnostics.push(diagnostic('CCJS_C_FUNCTION_VALUE', 'runtime callback declarations need prepared statement lowering in the current C backend slice', statement.loc))
      return `ccjs_value ${statement.name} = ccjs_undefined_value()`
    }

    return emitFunctionPointerVariable(statement.name, statement.init, context, statement.kind === 'const', statement.functionType, statement.loc)
  }

  if (!['number', 'boolean'].includes(inferred)) {
    context.diagnostics.push(diagnostic(cUnsupportedExpressionCode(inferred), 'this expression is not supported by the current C backend slice', statement.loc))
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

  if (statement.init?.type === 'CallExpression' && cTimerStartCallName(statement.init.callee) != null) {
    const timerCall = emitPreparedTimerCallExpression(statement.init, context, {
      out: statement.name
    })

    if (timerCall != null) {
      context.variables.set(statement.name, 'timer')

      return [
        `ccjs_timer_handle* ${statement.name} = 0;`,
        ...timerCall.lines
      ]
    }
  }

  if (statement.init?.type === 'CallExpression' && cTimerClearCallName(statement.init.callee) != null) {
    context.diagnostics.push(diagnostic('CCJS_C_TIMER_HANDLE', 'timer clear calls return void and cannot initialize a value', statement.loc))
    context.variables.set(statement.name, 'timer')

    return [`ccjs_timer_handle* ${statement.name} = 0;`]
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

    if (isRuntimeProducedStringExpression(statement.init, context) || runtimeElement?.valueType === 'string') {
      return emitRuntimeStringVariableDeclaration(statement, statement.init, context)
    }

    return [`${statement.kind === 'const' ? 'const ' : ''}char* ${statement.name} = ${emitStringExpression(statement.init, context)};`]
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

    return [`${emitFunctionPointerVariable(statement.name, statement.init, context, statement.kind === 'const', statement.functionType, statement.loc)};`]
  }

  if (isArrayMethodCall(statement.init)) {
    context.diagnostics.push(diagnostic('CCJS_C_ARRAY_METHOD', 'array methods are not supported by the current C backend slice', statement.loc))
    return [`double ${statement.name} = 0;`]
  }

  if (inferred === 'timer') {
    const handle = emitPreparedTimerHandleExpression(statement.init, context)

    context.variables.set(statement.name, 'timer')

    return [
      ...handle.lines,
      `ccjs_timer_handle* ${statement.name} = ${handle.expression};`
    ]
  }

  if ((inferred === 'number' || inferred === 'boolean') && context.boxedMutableCaptureDeclarations.has(statement)) {
    return emitBoxedScalarVariableDeclaration(statement, context)
  }

  if (!['number', 'boolean'].includes(inferred)) {
    context.diagnostics.push(diagnostic(cUnsupportedExpressionCode(inferred), 'this expression is not supported by the current C backend slice', statement.loc))
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
  return expression.target?.type === 'Reference'
    && expression.target.path.length === 1
    && isBoxedRuntimeValueName(expression.target.path[0], context)
}

function isNullableRuntimeValueAssignment(expression, context) {
  return expression.target?.type === 'Reference'
    && expression.target.path.length === 1
    && context.nullableVariables.has(expression.target.path[0])
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
      ? emitCObjectLiteralValueExpression(expression.value, context, context.objectShapes.get(name) == null
          ? null
          : {
              fields: context.objectShapes.get(name)
            })
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

function emitRuntimeNullableValueCheck(name, expectedTag, context) {
  if (expectedTag == null) {
    return []
  }

  if (expectedTag === 'CCJS_TAG_BOOL' || expectedTag === 'CCJS_TAG_NUMBER') {
    return [
      emitRuntimeTypeCheck(`${name}.tag != CCJS_TAG_NULL && ${name}.tag != ${expectedTag}`, context)
    ]
  }

  return [
    emitRuntimeTypeCheck(`${name}.tag != CCJS_TAG_NULL && (${name}.tag != ${expectedTag} || ${name}.as.ref == 0)`, context)
  ]
}

function emitRuntimeValueCheck(name, expectedTag, context) {
  if (expectedTag == null) {
    return ''
  }

  if (expectedTag === 'CCJS_TAG_BOOL' || expectedTag === 'CCJS_TAG_NUMBER') {
    return emitRuntimeTypeCheck(`${name}.tag != ${expectedTag}`, context)
  }

  return emitRuntimeTypeCheck(`${name}.tag != ${expectedTag} || ${name}.as.ref == 0`, context)
}

function cRuntimeValueTag(valueType) {
  if (valueType === 'boolean') {
    return 'CCJS_TAG_BOOL'
  }

  if (valueType === 'number') {
    return 'CCJS_TAG_NUMBER'
  }

  if (valueType === 'string') {
    return 'CCJS_TAG_STRING'
  }

  if (valueType === 'bytes') {
    return 'CCJS_TAG_BYTES'
  }

  if (valueType === 'object') {
    return 'CCJS_TAG_OBJECT'
  }

  if (valueType === 'array') {
    return 'CCJS_TAG_ARRAY'
  }

  if (valueType === 'function') {
    return 'CCJS_TAG_FUNCTION'
  }

  if (valueType === 'map') {
    return 'CCJS_TAG_MAP'
  }

  if (valueType === 'set') {
    return 'CCJS_TAG_SET'
  }

  return null
}

function isRuntimeNullableType(valueType) {
  return cRuntimeValueTag(valueType) != null
}

function isNullableScalarType(valueType) {
  return valueType === 'number' || valueType === 'boolean'
}

function isNullableScalarParam(param) {
  return param?.nullable === true && isNullableScalarType(param.valueType)
}

function isNullableScalarRuntimeExpression(expression, context) {
  return isNullableScalarType(inferExpressionType(expression, context)) && isNullableRuntimeExpression(expression, context)
}

function isBoxedRuntimeValueName(name, context) {
  return context.boxedVariables.has(name) && isRuntimeBoxedValueType(context.variables.get(name))
}

function isBoxedRuntimeStringName(name, context) {
  return context.boxedVariables.has(name) && context.variables.get(name) === 'string'
}

function isBoxedRuntimeStringReference(expression, context) {
  return expression?.type === 'Reference'
    && expression.path.length === 1
    && isBoxedRuntimeStringName(expression.path[0], context)
}

function emitBoxedObjectVariableDeclaration(statement, context) {
  const shapeName = nextCName(context, `ccjs_shape_${statement.name}`)
  const fieldsName = `${shapeName}_fields`
  const fields = statement.shape?.fields ?? statement.init.properties.map(property => ({
    name: property.key,
    readonly: false,
    valueType: inferExpressionType(property.value, context)
  }))
  const properties = new Map<string, AnyNode>(statement.init.properties.map(property => [property.key, property]))
  const lines = [
    `static const ccjs_field_info ${fieldsName}[] = {`
  ]

  for (const field of fields) {
    lines.push(`  { ${cStringLiteral(field.name)}, ${field.readonly ? 'CCJS_FIELD_READONLY' : '0'} },`)
  }

  lines.push('};')
  lines.push(`static const ccjs_shape ${shapeName} = {`)
  lines.push(`  ${fields.length},`)
  lines.push(`  ${fieldsName}`)
  lines.push('};')
  registerBoxedValue(context, statement.name, 'object')
  context.boxedVariables.add(statement.name)
  context.variables.set(statement.name, 'object')
  context.objectShapes.set(statement.name, fields.map(field => ({
    name: field.name,
    valueType: field.valueType,
    arrayElementType: field.arrayElementType,
    mapKeyType: field.mapKeyType,
    mapValueType: field.mapValueType,
    setElementType: field.setElementType
  })))
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
  return emitObjectMemberVariableDeclaration(statement, member, context, temp => `ccjs_object_get_known(${emitObjectValueReference(member.objectName, context)}, ${member.index}, &${temp})`)
}

function emitDynamicObjectMemberVariableDeclaration(statement, member, context) {
  return emitObjectMemberVariableDeclaration(statement, member, context, temp => `ccjs_object_get(${emitObjectValueReference(member.objectName, context)}, ${cStringLiteral(member.key)}, ${utf8ByteLength(member.key)}, &${temp})`)
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

  if (member.valueType === 'string') {
    return emitObjectStringMemberVariableDeclaration(statement, member, context, emitGetCall)
  }

  if (!['number', 'boolean'].includes(member.valueType)) {
    context.diagnostics.push(diagnostic('CCJS_C_UNSUPPORTED_EXPR', 'this object field type is not supported by the current C backend slice', statement.loc))
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
    emitStatusCheck(`ccjs_object_set_known(${emitObjectValueReference(member.objectName, context)}, ${member.index}, ${value.expression})`, context)
  ]
}

function emitDynamicObjectMemberAssignment(expression, member, context) {
  const value = emitCValueExpression(expression.value, context)
  const valueType = inferExpressionType(expression.value, context)

  updateKnownObjectMemberValueType(member, valueType, context)

  return [
    ...value.lines,
    emitStatusCheck(`ccjs_object_set(${emitObjectValueReference(member.objectName, context)}, ${cStringLiteral(member.key)}, ${utf8ByteLength(member.key)}, ${value.expression})`, context)
  ]
}

function emitKnownArrayIndexVariableDeclaration(statement, element, context) {
  if (element.valueType === 'string') {
    return emitKnownArrayStringIndexVariableDeclaration(statement, element, context)
  }

  if (!['number', 'boolean'].includes(element.valueType)) {
    context.diagnostics.push(diagnostic('CCJS_C_UNSUPPORTED_EXPR', 'this array element type is not supported by the current C backend slice', statement.loc))
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
    emitStatusCheck(`ccjs_array_new(&ccjs_default_allocator, ${statement.init.elements.length}, &${statement.name})`, context)
  ]

  registerOwnedValue(context, statement.name)
  context.variables.set(statement.name, 'array')
  context.arrayShapes.set(statement.name, statement.init.elements.map(element => ({
    valueType: inferExpressionType(element, context)
  })))

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

  const fsSyncValue = emitPreparedFsSyncValueExpression(expression, context)

  if (fsSyncValue != null) {
    return fsSyncValue
  }

  const jsonCall = emitPreparedJsonCallExpression(expression, context)

  if (jsonCall != null) {
    return jsonCall
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
        emitStatusCheck(`ccjs_string_from_literal(&ccjs_default_allocator, ${cStringLiteral(expression.value)}, ${utf8ByteLength(expression.value)}, &${temp})`, context)
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
        lines: [
          emitRuntimeTypeCheck(`(*${name}).tag != ${tag} || (*${name}).as.ref == 0`, context)
        ],
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

    if (member?.valueType === 'bytes' || member?.valueType === 'array' || member?.valueType === 'map' || member?.valueType === 'set') {
      const temp = nextCName(context, 'ccjs_value')
      const tag = cRuntimeValueTag(member.valueType)
      registerOwnedValue(context, temp)

      return {
        lines: [
          ...emitPrepareOwnedValueWrite(temp),
          emitStatusCheck(`ccjs_object_get_known(${emitObjectValueReference(member.objectName, context)}, ${member.index}, &${temp})`, context),
          emitRuntimeTypeCheck(`${temp}.tag != ${tag} || ${temp}.as.ref == 0`, context)
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
          emitStatusCheck(`ccjs_object_get_known(${emitObjectValueReference(member.objectName, context)}, ${member.index}, &${temp})`, context),
          emitRuntimeTypeCheck(`${temp}.tag != CCJS_TAG_STRING || ${temp}.as.ref == 0`, context)
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
          emitRuntimeTypeCheck(`${temp}.tag != CCJS_TAG_ARRAY || ${temp}.as.ref == 0`, context)
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
              emitRuntimeTypeCheck(`${value.expression}.tag != CCJS_TAG_STRING || ${value.expression}.as.ref == 0`, context)
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
          emitRuntimeTypeCheck(`${temp}.tag != CCJS_TAG_STRING || ${temp}.as.ref == 0`, context)
        ],
        expression: temp
      }
    }

    const field = resolveKnownObjectIndex(expression, context)

    if (field?.valueType === 'bytes' || field?.valueType === 'array' || field?.valueType === 'map' || field?.valueType === 'set') {
      const temp = nextCName(context, 'ccjs_value')
      const tag = cRuntimeValueTag(field.valueType)
      registerOwnedValue(context, temp)

      return {
        lines: [
          ...emitPrepareOwnedValueWrite(temp),
          emitStatusCheck(`ccjs_object_get(${emitObjectValueReference(field.objectName, context)}, ${cStringLiteral(field.key)}, ${utf8ByteLength(field.key)}, &${temp})`, context),
          emitRuntimeTypeCheck(`${temp}.tag != ${tag} || ${temp}.as.ref == 0`, context)
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
          emitStatusCheck(`ccjs_object_get(${emitObjectValueReference(field.objectName, context)}, ${cStringLiteral(field.key)}, ${utf8ByteLength(field.key)}, &${temp})`, context),
          emitRuntimeTypeCheck(`${temp}.tag != CCJS_TAG_STRING || ${temp}.as.ref == 0`, context)
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

  context.diagnostics.push(diagnostic('CCJS_C_UNSUPPORTED_EXPR', 'this object field expression is not supported by the current C backend slice', expression?.loc))

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
    context.diagnostics.push(diagnostic('CCJS_C_NULLISH', 'nullable scalar values currently support only number, boolean and null values in C', expression?.loc))

    return {
      lines: [],
      expression: 'ccjs_null_value()'
    }
  }

  const value = emitPreparedNumberExpression(expression, context)

  return {
    lines: value.lines,
    expression: valueType === 'boolean'
      ? `ccjs_bool_value((${value.expression}) != 0)`
      : `ccjs_number_value(${value.expression})`
  }
}

function emitPreparedNullableScalarRuntimeValueExpression(expression, context) {
  if (expression?.type === 'Reference' && expression.path.length === 1 && context.nullableVariables.has(expression.path[0]) && isNullableScalarType(context.variables.get(expression.path[0]))) {
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

  context.diagnostics.push(diagnostic('CCJS_C_NULLISH', 'this nullable scalar expression is not supported by the current C backend slice', expression?.loc))

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

  if (expression?.type === 'Reference' && expression.path.length === 1 && context.nullableVariables.has(expression.path[0]) && context.variables.get(expression.path[0]) === 'function') {
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
  const fields = shape?.fields ?? expression.properties.map(property => ({
    name: property.key,
    readonly: false,
    valueType: inferExpressionType(property.value, context)
  }))
  const properties = new Map<string, AnyNode>(expression.properties.map(property => [property.key, property]))
  const lines = [
    `static const ccjs_field_info ${fieldsName}[] = {`
  ]

  for (const field of fields) {
    lines.push(`  { ${cStringLiteral(field.name)}, ${field.readonly ? 'CCJS_FIELD_READONLY' : '0'} },`)
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
    context.diagnostics.push(diagnostic('CCJS_ARG_COUNT', `Error constructor expects at most 2 argument(s), got ${expression.args.length}`, expression.loc))
  }

  const message = expression.args[0] ?? cStringLiteralNode('', expression.loc)
  const options = expression.args[1]
  let code = cStringLiteralNode('', expression.loc)
  let cause = cNullLiteralNode(expression.loc)

  if (inferExpressionType(message, context) !== 'string') {
    context.diagnostics.push(diagnostic('CCJS_TYPE_MISMATCH', 'Error message must be a string in the current C backend slice', message.loc ?? expression.loc))

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
    context.diagnostics.push(diagnostic('CCJS_TYPE_MISMATCH', 'Error options must be an object literal in the current C backend slice', options.loc ?? expression.loc))

    return {
      message,
      code,
      cause
    }
  }

  for (const property of options.properties) {
    if (property.key === 'code') {
      if (inferExpressionType(property.value, context) !== 'string') {
        context.diagnostics.push(diagnostic('CCJS_TYPE_MISMATCH', 'Error code must be a string in the current C backend slice', property.value.loc ?? property.loc))
      } else {
        code = property.value
      }
    } else if (property.key === 'cause') {
      if (property.value.type === 'NullLiteral' || isErrorValueExpression(property.value, context)) {
        cause = property.value
      } else {
        context.diagnostics.push(diagnostic('CCJS_TYPE_MISMATCH', 'Error cause must be an Error object or null in the current C backend slice', property.value.loc ?? property.loc))
      }
    } else {
      context.diagnostics.push(diagnostic('CCJS_UNKNOWN_FIELD', `unknown Error option ${property.key}`, property.loc ?? options.loc))
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

function emitCOptionalMemberValueExpression(expression, context) {
  const member = resolveKnownObjectMember(expression, context)

  if (member == null || !isRuntimeNullableType(member.valueType)) {
    context.diagnostics.push(diagnostic('CCJS_C_OPTIONAL_CHAINING', 'optional member access for this field is not supported by the current C backend slice', expression.loc))

    return {
      lines: [],
      expression: 'ccjs_undefined_value()'
    }
  }

  return emitCOptionalObjectReadValueExpression(expression.object, member.valueType, context, temp => `ccjs_object_get_known(${temp}, ${member.index}, &`)
}

function emitCOptionalIndexValueExpression(expression, context) {
  const field = resolveKnownObjectIndex(expression, context)

  if (field != null) {
    if (!isRuntimeNullableType(field.valueType)) {
      context.diagnostics.push(diagnostic('CCJS_C_OPTIONAL_CHAINING', 'optional object index access for this field is not supported by the current C backend slice', expression.loc))

      return {
        lines: [],
        expression: 'ccjs_undefined_value()'
      }
    }

    return emitCOptionalObjectReadValueExpression(expression.object, field.valueType, context, temp => `ccjs_object_get(${temp}, ${cStringLiteral(field.key)}, ${utf8ByteLength(field.key)}, &`)
  }

  const element = resolveOptionalRuntimeArrayIndex(expression, context)

  if (element != null) {
    if (!isRuntimeNullableType(element.valueType)) {
      context.diagnostics.push(diagnostic('CCJS_C_OPTIONAL_CHAINING', 'optional array index access for this element type is not supported by the current C backend slice', expression.loc))

      return {
        lines: [],
        expression: 'ccjs_undefined_value()'
      }
    }

    return emitCOptionalArrayIndexValueExpression(expression.object, element, context)
  }

  context.diagnostics.push(diagnostic('CCJS_C_OPTIONAL_CHAINING', 'optional index access is not supported by the current C backend slice', expression.loc))

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
      ...emitRuntimeNullableValueCheck(temp, expectedTag, context).map(line => `  ${line}`),
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
      ...emitRuntimeNullableValueCheck(temp, expectedTag, context).map(line => `  ${line}`),
      '}'
    ],
    expression: temp
  }
}

function emitCNullishCoalescingValueExpression(expression, context) {
  if (!canLowerCNullishCoalescingExpression(expression, context)) {
    context.diagnostics.push(diagnostic('CCJS_C_NULLISH', 'nullish coalescing is not supported by the current C backend slice', expression.loc))

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
      ...right.lines.map(line => `  ${line}`),
      `  ${temp} = ${right.expression};`,
      ...emitRuntimeNullableValueCheck(temp, expectedTag, context).map(line => `  ${line}`),
      `  ccjs_retain(${temp});`,
      '} else {',
      `  ${temp} = ${left.expression};`,
      ...emitRuntimeNullableValueCheck(temp, expectedTag, context).map(line => `  ${line}`),
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
      emitStatusCheck(`ccjs_string_concat_parts(&ccjs_default_allocator, ${left.bytes}, ${left.length}, ${right.bytes}, ${right.length}, &${temp})`, context)
    ],
    expression: temp
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
        emitStatusCheck(`ccjs_string_from_literal(&ccjs_default_allocator, ${value.bytes}, ${value.length}, &${temp})`, context)
      ],
      expression: temp
    }
  }

  const value = emitPreparedNumberExpression(arg, context)
  const helper = type === 'boolean'
    ? `ccjs_string_from_bool(&ccjs_default_allocator, (${value.expression}) != 0, &${temp})`
    : `ccjs_string_from_number(&ccjs_default_allocator, ${value.expression}, &${temp})`

  return {
    lines: [
      ...value.lines,
      ...emitPrepareOwnedValueWrite(temp),
      emitStatusCheck(helper, context)
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
      emitStatusCheck(`ccjs_string_trim_parts(&ccjs_default_allocator, ${value.bytes}, ${value.length}, &${temp})`, context)
    ],
    expression: temp
  }
}

function emitCStringSliceValueExpression(expression, context) {
  const value = emitPreparedStringBytesOperand(expression.callee.object, context, 'ccjs_slice_string')
  const start = emitPreparedNumberExpression(expression.args[0], context)
  const end = expression.args[1] == null
    ? {
        lines: [],
        expression: value.length
      }
    : emitPreparedNumberExpression(expression.args[1], context)
  const temp = nextCName(context, 'ccjs_value')
  registerOwnedValue(context, temp)

  return {
    lines: [
      ...value.lines,
      ...start.lines,
      ...end.lines,
      ...emitPrepareOwnedValueWrite(temp),
      emitStatusCheck(`ccjs_string_slice_parts(&ccjs_default_allocator, ${value.bytes}, ${value.length}, (size_t)(${start.expression}), (size_t)(${end.expression}), &${temp})`, context)
    ],
    expression: temp
  }
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
      emitStatusCheck(`ccjs_string_split_parts(&ccjs_default_allocator, ${value.bytes}, ${value.length}, ${separator.bytes}, ${separator.length}, &${temp})`, context),
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
      emitStatusCheck(`ccjs_bytes_from_data(&ccjs_default_allocator, (const uint8_t*)${value.bytes}, ${value.length}, &${temp})`, context),
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
    context.diagnostics.push(diagnostic('CCJS_C_JS_GLOBAL', 'Uint8Array constructor currently supports only length or array literals in C', expression.loc))

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
  const end = expression.args[1] == null
    ? null
    : emitPreparedNumberExpression(expression.args[1], context)
  const endName = end == null ? nextCName(context, 'ccjs_bytes_len') : null
  const temp = nextCName(context, 'ccjs_bytes_slice')
  registerOwnedValue(context, temp)

  return {
    lines: [
      ...receiver.lines,
      ...start.lines,
      ...(end == null
        ? [
            `size_t ${endName} = 0;`,
            emitStatusCheck(`ccjs_bytes_len(${receiver.expression}, &${endName})`, context)
          ]
        : end.lines),
      ...emitPrepareOwnedValueWrite(temp),
      emitStatusCheck(`ccjs_bytes_slice(${receiver.expression}, (size_t)(${start.expression}), ${end == null ? endName : `(size_t)(${end.expression})`}, &${temp})`, context),
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
  return null
}

function emitPreparedBytesLengthExpression(expression, context) {
  if (expression?.type !== 'MemberExpression' || expression.property !== 'length' || inferExpressionType(expression.object, context) !== 'bytes') {
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
  if (expression?.target?.type !== 'IndexExpression' || inferExpressionType(expression.target.object, context) !== 'bytes') {
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
      emitStatusCheck(`ccjs_bytes_set(${value.expression}, (size_t)(${index.expression}), (uint8_t)(${byte.expression}))`, context)
    ]
  }
}

function emitConsoleLogStatement(args, context) {
  if (args.length === 0) {
    return ['printf("\\n");']
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

  if (values.length === 0) {
    lines.push(`printf("${escapeCString(parts.join(' '))}\\n");`)
  } else {
    lines.push(`printf("${escapeCString(parts.join(' '))}\\n", ${values.join(', ')});`)
  }

  return lines
}

function emitConsoleLogValue(expression, context) {
  if (expression?.type === 'TemplateLiteral' && expression.raw.includes('${')) {
    return emitTemplateLogValue(expression, context)
  }

  const type = inferExpressionType(expression, context)

  if (type === 'string') {
    return emitStringLogValue(expression, context)
  }

  if (type === 'number' || type === 'boolean') {
    return emitNumberLogValue(expression, type, context)
  }

  context.diagnostics.push(diagnostic(cUnsupportedExpressionCode(type), 'this console.log argument is not supported by the current C backend slice', expression.loc))

  return {
    lines: [],
    format: '%g',
    values: ['0']
  }
}

function emitTemplateLogValue(expression, context) {
  const lines: string[] = []
  const formats: string[] = []
  const values: string[] = []
  const parts = parseTemplateLogParts(expression.raw, context, expression.loc)

  for (const part of parts) {
    if (part.type === 'text') {
      formats.push(part.value.replaceAll('%', '%%'))
      continue
    }

    const placeholder = parseTemplatePlaceholder(part.value, expression.loc, context)

    if (placeholder == null) {
      continue
    }

    const value = emitConsoleLogValue(placeholder, context)

    lines.push(...value.lines)
    formats.push(value.format)
    values.push(...value.values)
  }

  return {
    lines,
    format: formats.join(''),
    values
  }
}

function parseTemplateLogParts(raw, context, loc) {
  const body = raw.slice(1, -1)
  const parts: { type: string, value: string }[] = []
  let text = ''
  let index = 0

  while (index < body.length) {
    const char = body[index]

    if (char === '\\') {
      text += body.slice(index, index + 2)
      index += 2
      continue
    }

    if (char === '$' && body[index + 1] === '{') {
      if (text !== '') {
        parts.push({
          type: 'text',
          value: text
        })
        text = ''
      }

      const end = body.indexOf('}', index + 2)

      if (end === -1) {
        context.diagnostics.push(diagnostic('CCJS_C_STRING_EXPR', 'unterminated template placeholder in C console.log', loc))
        return parts
      }

      parts.push({
        type: 'placeholder',
        value: body.slice(index + 2, end).trim()
      })
      index = end + 1
      continue
    }

    text += char
    index += 1
  }

  if (text !== '') {
    parts.push({
      type: 'text',
      value: text
    })
  }

  return parts
}

function parseTemplatePlaceholder(value, loc, context) {
  if (value === '') {
    context.diagnostics.push(diagnostic('CCJS_C_STRING_EXPR', 'empty template placeholder in C console.log', loc))
    return null
  }

  if (/^-?\d+(?:\.\d+)?$/.test(value)) {
    return {
      type: 'NumberLiteral',
      value,
      loc
    }
  }

  if (value === 'true' || value === 'false') {
    return {
      type: 'BooleanLiteral',
      value: value === 'true',
      loc
    }
  }

  const names = value.split('.')

  if (!names.every(name => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name))) {
    context.diagnostics.push(diagnostic('CCJS_C_STRING_EXPR', 'C console.log template placeholders currently support only identifiers and dotted members', loc))
    return null
  }

  if (!context.variables.has(names[0])) {
    context.diagnostics.push(diagnostic('CCJS_UNKNOWN_NAME', `unknown name ${names[0]}`, loc))
    return null
  }

  let expression: AnyNode = {
    type: 'Reference',
    path: [names[0]],
    loc
  }

  for (const property of names.slice(1)) {
    expression = {
      type: 'MemberExpression',
      object: expression,
      property,
      loc
    }
  }

  return expression
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
    const member = resolveKnownObjectMember(expression, context)

    if (member?.valueType === 'string') {
      return emitRuntimeStringLogValue(temp => `ccjs_object_get_known(${emitObjectValueReference(member.objectName, context)}, ${member.index}, &${temp})`, context)
    }
  }

  if (isIndexAccessExpression(expression)) {
    const element = resolveKnownArrayIndex(expression, context)

    if (element?.valueType === 'string') {
      return emitRuntimeStringLogValue(temp => `ccjs_array_get(${element.arrayName}, ${element.index}, &${temp})`, context)
    }

    const field = resolveKnownObjectIndex(expression, context)

    if (field?.valueType === 'string') {
      return emitRuntimeStringLogValue(temp => `ccjs_object_get(${emitObjectValueReference(field.objectName, context)}, ${cStringLiteral(field.key)}, ${utf8ByteLength(field.key)}, &${temp})`, context)
    }

    const runtimeElement = resolveRuntimeArrayIndex(expression, context)

    if (runtimeElement?.valueType === 'string') {
      const value = emitPreparedRuntimeArrayIndexValue(expression, runtimeElement, context, 'ccjs_log_value')
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
  }

  if (isRuntimeProducedStringExpression(expression, context)) {
    const value = emitCValueExpression(expression, context)
    const string = nextCName(context, 'ccjs_log_string')

    return {
      lines: [
        ...value.lines,
        `ccjs_string* ${string} = (ccjs_string*)${value.expression}.as.ref;`
      ],
      format: '%.*s',
      values: [`(int)${string}->len`, `${string}->bytes`]
    }
  }

  if (isStringConcatExpression(expression, context)) {
    const value = emitCValueExpression(expression, context)
    const string = nextCName(context, 'ccjs_log_string')

    return {
      lines: [
        ...value.lines,
        `ccjs_string* ${string} = (ccjs_string*)${value.expression}.as.ref;`
      ],
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
      return emitRuntimeNumberLogValue(member.valueType, temp => `ccjs_object_get_known(${emitObjectValueReference(member.objectName, context)}, ${member.index}, &${temp})`, context)
    }
  }

  if (isIndexAccessExpression(expression)) {
    const element = resolveKnownArrayIndex(expression, context)

    if (element != null && ['number', 'boolean'].includes(element.valueType)) {
      return emitRuntimeNumberLogValue(element.valueType, temp => `ccjs_array_get(${element.arrayName}, ${element.index}, &${temp})`, context)
    }

    const field = resolveKnownObjectIndex(expression, context)

    if (field != null && ['number', 'boolean'].includes(field.valueType)) {
      return emitRuntimeNumberLogValue(field.valueType, temp => `ccjs_object_get(${emitObjectValueReference(field.objectName, context)}, ${cStringLiteral(field.key)}, ${utf8ByteLength(field.key)}, &${temp})`, context)
    }

    const runtimeElement = resolveRuntimeArrayIndex(expression, context)

    if (runtimeElement != null && ['number', 'boolean'].includes(runtimeElement.valueType)) {
      const value = emitPreparedRuntimeArrayIndexValue(expression, runtimeElement, context, 'ccjs_log_value')

      return {
        lines: value.lines,
        format: '%g',
        values: [runtimeElement.valueType === 'boolean' ? `((double)(${value.expression}.as.boolean ? 1 : 0))` : `${value.expression}.as.number`]
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
    lines: [
      ...emitPrepareOwnedValueWrite(value),
      emitStatusCheck(emitGetCall(value), context)
    ],
    format: '%g',
    values: [valueType === 'boolean' ? `((double)(${value}.as.boolean ? 1 : 0))` : `${value}.as.number`]
  }
}

function resolveRuntimeStringReference(expression, context) {
  if (expression?.type !== 'Reference' || expression.path.length !== 1) {
    return null
  }

  const name = expression.path[0]

  return context.runtimeStrings.has(name) ? name : null
}

function emitStringExpression(expression, context) {
  if (expression?.type === 'StringLiteral') {
    return JSON.stringify(expression.value)
  }

  if (expression?.type === 'TemplateLiteral' && !expression.raw.includes('${')) {
    return JSON.stringify(expression.raw.slice(1, -1))
  }

  if (expression?.type === 'Reference') {
    return emitReference(expression, context)
  }

  if (expression?.type === 'CallExpression') {
    return emitCallExpression(expression, context)
  }

  if (isNullishCoalescingExpression(expression)) {
    context.diagnostics.push(diagnostic('CCJS_C_NULLISH', 'nullish coalescing is not supported by the current C backend slice', expression.loc))
    return '""'
  }

  if (isMemberAccessExpression(expression)) {
    const member = resolveKnownObjectMember(expression, context)

    if (member != null && ['number', 'boolean'].includes(member.valueType)) {
      context.diagnostics.push(diagnostic('CCJS_C_UNSUPPORTED_EXPR', 'object field access must be assigned before it can be used by the current C backend slice', expression.loc))
      return '""'
    }
  }

  if (expression?.type === 'AwaitExpression') {
    context.diagnostics.push(diagnostic('CCJS_C_ASYNC', 'async/await is not supported by the current C backend slice', expression?.loc))
    return '""'
  }

  if (isOptionalChainExpression(expression)) {
    context.diagnostics.push(diagnostic('CCJS_C_OPTIONAL_CHAINING', 'optional chaining is not supported by the current C backend slice', expression?.loc))
    return '""'
  }

  context.diagnostics.push(diagnostic('CCJS_C_STRING_EXPR', 'this string expression is not supported by the current C backend slice', expression?.loc))
  return '""'
}

function emitNumberExpression(expression, context) {
  return emitPreparedNumberExpression(expression, context).expression
}

function emitPreparedNumberExpression(expression, context) {
  const classMethodCall = emitPreparedClassMethodCallExpression(expression, context)

  if (classMethodCall != null && classMethodCall.expression !== '') {
    return classMethodCall
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
    context.diagnostics.push(diagnostic('CCJS_C_NULLISH', 'nullable scalar values must be narrowed with ?? before scalar use in the current C backend slice', expression.loc))

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

  if (expression?.type === 'BinaryExpression') {
    const scalarNullish = emitPreparedScalarNullishCoalescingExpression(expression, context)

    if (scalarNullish != null) {
      return scalarNullish
    }

    if (isNullishCoalescingExpression(expression)) {
      context.diagnostics.push(diagnostic('CCJS_C_NULLISH', 'nullish coalescing is not supported by the current C backend slice', expression.loc))

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
      context.diagnostics.push(diagnostic('CCJS_C_STRING_EXPR', 'string binary expressions are not supported by the current C backend slice', expression.loc))

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
      lines: [
        ...left.lines,
        ...right.lines
      ],
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
      return emitPreparedRuntimeNumberValue(member.valueType, temp => `ccjs_object_get_known(${emitObjectValueReference(member.objectName, context)}, ${member.index}, &${temp})`, context)
    }
  }

  if (isIndexAccessExpression(expression)) {
    const element = resolveKnownArrayIndex(expression, context)

    if (element != null && ['number', 'boolean'].includes(element.valueType)) {
      return emitPreparedRuntimeNumberValue(element.valueType, temp => `ccjs_array_get(${element.arrayName}, ${element.index}, &${temp})`, context)
    }

    const field = resolveKnownObjectIndex(expression, context)

    if (field != null && ['number', 'boolean'].includes(field.valueType)) {
      return emitPreparedRuntimeNumberValue(field.valueType, temp => `ccjs_object_get(${emitObjectValueReference(field.objectName, context)}, ${cStringLiteral(field.key)}, ${utf8ByteLength(field.key)}, &${temp})`, context)
    }

    const runtimeElement = resolveRuntimeArrayIndex(expression, context)

    if (runtimeElement != null && ['number', 'boolean'].includes(runtimeElement.valueType)) {
      const value = emitPreparedRuntimeArrayIndexValue(expression, runtimeElement, context, 'ccjs_expr_value')

      return {
        lines: value.lines,
        expression: runtimeElement.valueType === 'boolean' ? `(${value.expression}.as.boolean ? 1 : 0)` : `${value.expression}.as.number`
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
      expression: valueType === 'boolean'
        ? `(${awaited.expression}.as.boolean ? 1 : 0)`
        : `${awaited.expression}.as.number`
    }
  }

  if (isOptionalChainExpression(expression)) {
    context.diagnostics.push(diagnostic('CCJS_C_OPTIONAL_CHAINING', 'optional chaining is not supported by the current C backend slice', expression?.loc))
    return {
      lines: [],
      expression: '0'
    }
  }

  context.diagnostics.push(diagnostic('CCJS_C_NUMBER_EXPR', 'this number expression is not supported by the current C backend slice'))

  return {
    lines: [],
    expression: '0'
  }
}

function emitPreparedStringLengthExpression(expression, context) {
  if (expression?.type !== 'MemberExpression' || expression.property !== 'length' || !isStringLengthObject(expression.object, context)) {
    return null
  }

  const operand = emitPreparedStringBytesOperand(expression.object, context, 'ccjs_length_string')

  return {
    lines: operand.lines,
    expression: `((double)${operand.length})`
  }
}

function emitPreparedStringCompareExpression(expression, context) {
  const left = emitPreparedStringBytesOperand(expression.left, context)
  const right = emitPreparedStringBytesOperand(expression.right, context)
  const equals = `(${left.length} == ${right.length} && memcmp(${left.bytes}, ${right.bytes}, ${left.length}) == 0)`

  return {
    lines: [
      ...left.lines,
      ...right.lines
    ],
    expression: ['===', '=='].includes(expression.operator) ? equals : `(!${equals})`
  }
}

function emitPreparedLogicalExpression(expression, context) {
  const left = emitPreparedNumberExpression(expression.left, context)
  const leftNarrowing = resolveNullableScalarConditionNarrowing(expression.left, context)
  const rightNarrowed = expression.operator === '&&'
    ? leftNarrowing.trueNames
    : leftNarrowing.falseNames
  const right = withNullableScalarNarrowing(context, rightNarrowed, () => emitPreparedNumberExpression(expression.right, context))
  const temp = nextCName(context, 'ccjs_logical')

  if (expression.operator === '&&') {
    return {
      lines: [
        ...left.lines,
        `double ${temp} = 0;`,
        `if (${left.expression}) {`,
        ...right.lines.map(line => `  ${line}`),
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
      `if (${left.expression}) {`,
      `  ${temp} = 1;`,
      '} else {',
      ...right.lines.map(line => `  ${line}`),
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
  const leftValue = valueType === 'boolean'
    ? `(${left.expression}.as.boolean ? 1 : 0)`
    : `${left.expression}.as.number`

  return {
    lines: [
      ...left.lines,
      `double ${temp} = 0;`,
      `if (${left.expression}.tag == CCJS_TAG_NULL) {`,
      ...right.lines.map(line => `  ${line}`),
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

function resolveNullableScalarConditionNarrowing(expression, context) {
  if (expression?.type !== 'BinaryExpression') {
    return emptyNullableScalarNarrowing()
  }

  if (expression.operator === '&&') {
    const left = resolveNullableScalarConditionNarrowing(expression.left, context)
    const right = withNullableScalarNarrowing(context, left.trueNames, () => resolveNullableScalarConditionNarrowing(expression.right, context))

    return {
      trueNames: uniqueNames([
        ...left.trueNames,
        ...right.trueNames
      ]),
      falseNames: intersectNames(left.falseNames, uniqueNames([
        ...left.trueNames,
        ...right.falseNames
      ]))
    }
  }

  if (expression.operator === '||') {
    const left = resolveNullableScalarConditionNarrowing(expression.left, context)
    const right = withNullableScalarNarrowing(context, left.falseNames, () => resolveNullableScalarConditionNarrowing(expression.right, context))

    return {
      trueNames: intersectNames(left.trueNames, uniqueNames([
        ...left.falseNames,
        ...right.trueNames
      ])),
      falseNames: uniqueNames([
        ...left.falseNames,
        ...right.falseNames
      ])
    }
  }

  return resolveNullableScalarNullCheckNarrowing(expression, context)
}

function resolveNullableScalarNullCheckNarrowing(expression, context) {
  if (expression?.type !== 'BinaryExpression' || !['===', '!==', '==', '!='].includes(expression.operator)) {
    return emptyNullableScalarNarrowing()
  }

  const nullable = expression.left?.type === 'NullLiteral' ? expression.right : expression.left
  const maybeNull = expression.left?.type === 'NullLiteral' ? expression.left : expression.right

  if (maybeNull?.type !== 'NullLiteral' || nullable?.type !== 'Reference' || nullable.path.length !== 1) {
    return emptyNullableScalarNarrowing()
  }

  const name = nullable.path[0]

  if (!context.nullableVariables.has(name) || !isNullableScalarType(context.variables.get(name))) {
    return emptyNullableScalarNarrowing()
  }

  if (['!==', '!='].includes(expression.operator)) {
    return {
      trueNames: [name],
      falseNames: []
    }
  }

  return {
    trueNames: [],
    falseNames: [name]
  }
}

function emptyNullableScalarNarrowing() {
  return {
    trueNames: [],
    falseNames: []
  }
}

function uniqueNames(names) {
  return [...new Set(names)]
}

function intersectNames(left, right) {
  const rightNames = new Set(right)

  return uniqueNames(left.filter(name => rightNames.has(name)))
}

function isNarrowedNullableScalarReference(expression, context) {
  return expression?.type === 'Reference'
    && expression.path.length === 1
    && context.narrowedNullableScalars.has(expression.path[0])
    && context.nullableVariables.has(expression.path[0])
    && isNullableScalarType(context.variables.get(expression.path[0]))
}

function clearNullableScalarNarrowing(name, context) {
  context.narrowedNullableScalars.delete(name)

  return []
}

function emitPreparedStringPredicateCall(expression, context) {
  const value = emitPreparedStringBytesOperand(expression.callee.object, context, 'ccjs_string_method_value')
  const search = emitPreparedStringBytesOperand(expression.args[0], context, 'ccjs_string_method_search')
  const helper = cStringPredicateHelperName(expression.callee.property)

  return {
    lines: [
      ...value.lines,
      ...search.lines
    ],
    expression: `(${helper}(${value.bytes}, ${value.length}, ${search.bytes}, ${search.length}) ? 1 : 0)`
  }
}

function emitPreparedStringBytesOperand(expression, context, tempPrefix = 'ccjs_cmp_string') {
  if (expression?.type === 'StringLiteral') {
    return {
      lines: [],
      bytes: cStringLiteral(expression.value),
      length: `${utf8ByteLength(expression.value)}`
    }
  }

  if (expression?.type === 'TemplateLiteral' && !expression.raw.includes('${')) {
    const value = expression.raw.slice(1, -1)

    return {
      lines: [],
      bytes: cStringLiteral(value),
      length: `${utf8ByteLength(value)}`
    }
  }

  if (expression?.type === 'TemplateLiteral') {
    context.diagnostics.push(diagnostic('CCJS_C_STRING_EXPR', 'template string comparison operands with placeholders are not supported by the current C backend slice', expression.loc))

    return {
      lines: [],
      bytes: '""',
      length: '0'
    }
  }

  if (expression?.type === 'Reference' && expression.path.length === 1) {
    const name = expression.path[0]

    if (context.variables.get(name) === 'string') {
      if (isBoxedRuntimeStringName(name, context)) {
        const string = nextCName(context, tempPrefix)

        return {
          lines: [
            emitRuntimeTypeCheck(`(*${name}).tag != CCJS_TAG_STRING || (*${name}).as.ref == 0`, context),
            `ccjs_string* ${string} = (ccjs_string*)(*${name}).as.ref;`
          ],
          bytes: `${string}->bytes`,
          length: `${string}->len`
        }
      }

      const reference = emitReference(expression, context)

      if (context.runtimeStrings.has(reference)) {
        return {
          lines: [],
          bytes: `${reference}->bytes`,
          length: `${reference}->len`
        }
      }

      return {
        lines: [],
        bytes: reference,
        length: `strlen(${reference})`
      }
    }
  }

  if (inferExpressionType(expression, context) === 'string') {
    const value = emitCValueExpression(expression, context)
    const string = nextCName(context, tempPrefix)

    return {
      lines: [
        ...value.lines,
        `ccjs_string* ${string} = (ccjs_string*)${value.expression}.as.ref;`
      ],
      bytes: `${string}->bytes`,
      length: `${string}->len`
    }
  }

  context.diagnostics.push(diagnostic('CCJS_C_STRING_EXPR', 'this string operand is not supported by the current C backend slice', expression?.loc))

  return {
    lines: [],
    bytes: '""',
    length: '0'
  }
}

function emitPreparedRuntimeNumberValue(valueType, emitGetCall, context) {
  const value = nextCName(context, 'ccjs_expr_value')
  registerOwnedValue(context, value)

  return {
    lines: [
      ...emitPrepareOwnedValueWrite(value),
      emitStatusCheck(emitGetCall(value), context)
    ],
    expression: valueType === 'boolean' ? `(${value}.as.boolean ? 1 : 0)` : `${value}.as.number`
  }
}

function emitCExpression(expression, context) {
  if (isNullishCoalescingExpression(expression)) {
    context.diagnostics.push(diagnostic('CCJS_C_NULLISH', 'nullish coalescing is not supported by the current C backend slice', expression.loc))
    return '0'
  }

  const type = inferExpressionType(expression, context)

  if (type === 'string') {
    return emitStringExpression(expression, context)
  }

  if (type === 'function') {
    context.diagnostics.push(diagnostic('CCJS_C_FUNCTION_VALUE', 'function values are not supported by the current C backend slice', expression?.loc))
    return '0'
  }

  if (type === 'timer') {
    context.diagnostics.push(diagnostic('CCJS_C_TIMER_HANDLE', 'timer handles can only be stored or passed to clear timer functions in the current C backend slice', expression?.loc))
    return '0'
  }

  if (type === 'optional') {
    context.diagnostics.push(diagnostic('CCJS_C_OPTIONAL_CHAINING', 'optional chaining is not supported by the current C backend slice', expression?.loc))
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

  context.diagnostics.push(diagnostic('CCJS_C_ASSIGNMENT_TARGET', 'this assignment target is not supported by the current C backend slice', expression?.loc))
  return '_'
}

function emitCallExpression(expression, context) {
  return `${emitCallee(expression.callee, context)}(${expression.args.map(arg => emitCExpression(arg, context)).join(', ')})`
}

function emitPreparedCallExpression(expression, context) {
  const mathCall = emitPreparedMathCallExpression(expression, context)

  if (mathCall != null) {
    return mathCall
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

  const fsCall = emitPreparedFsCallExpression(expression, context)

  if (fsCall != null) {
    return fsCall
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

  const args = expression.args.map(arg => emitPreparedNumberExpression(arg, context))

  return {
    lines: args.flatMap(arg => arg.lines),
    expression: `ccjs_math_${method}(${args.map(arg => arg.expression).join(', ')})`
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
    } else if (params[index]?.valueType === 'bytes' || params[index]?.valueType === 'array' || params[index]?.valueType === 'map' || params[index]?.valueType === 'set') {
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

function emitPreparedFsCallExpression(expression, context, options: { out?: string, owned?: boolean } = {}) {
  const method = cFsRuntimeCallName(expression?.callee)

  if (method == null || expression?.valueType !== 'promise') {
    return null
  }

  registerEventLoop(context)

  const out = options.out ?? nextCName(context, 'ccjs_promise')
  if (options.owned !== false) {
    registerOwnedPromise(context, out, expression.promiseValueType ?? (method === 'writeFile' || method === 'writeFileBytes' ? 'void' : method === 'readDir' ? 'array' : method === 'readFileBytes' ? 'bytes' : 'string'), 'error')
  }
  const path = emitPreparedStringBytesOperand(expression.args[0], context, 'ccjs_fs_path')
  const lines = [
    ...path.lines
  ]

  if (method === 'readFile') {
    lines.push(emitStatusCheck(`ccjs_fs_read_file(${emitEventLoopReference(context)}, ${path.bytes}, ${path.length}, &${out})`, context))

    return {
      lines,
      expression: out,
      rejectionValueType: 'error'
    }
  }

  if (method === 'readFileBytes') {
    lines.push(emitStatusCheck(`ccjs_fs_read_file_bytes(${emitEventLoopReference(context)}, ${path.bytes}, ${path.length}, &${out})`, context))

    return {
      lines,
      expression: out,
      rejectionValueType: 'error'
    }
  }

  if (method === 'readDir') {
    lines.push(emitStatusCheck(`ccjs_fs_read_dir(${emitEventLoopReference(context)}, ${path.bytes}, ${path.length}, &${out})`, context))

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
    lines.push(emitStatusCheck(`ccjs_fs_write_file_bytes(${emitEventLoopReference(context)}, ${path.bytes}, ${path.length}, ${bytes.expression}, &${out})`, context))

    return {
      lines,
      expression: out,
      rejectionValueType: 'error'
    }
  }

  const bytes = emitPreparedStringBytesOperand(expression.args[1], context, 'ccjs_fs_bytes')

  lines.push(...bytes.lines)
  lines.push(emitStatusCheck(`ccjs_fs_write_file(${emitEventLoopReference(context)}, ${path.bytes}, ${path.length}, ${bytes.bytes}, ${bytes.length}, &${out})`, context))

  return {
    lines,
    expression: out,
    rejectionValueType: 'error'
  }
}

function emitPreparedFsSyncValueExpression(expression, context) {
  const method = cFsRuntimeCallName(expression?.callee)

  if (method == null || !['readFileBytesSync', 'readFileSync', 'readDirSync'].includes(method)) {
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
  const call = method === 'readFileSync'
    ? `ccjs_fs_read_file_sync(&ccjs_default_allocator, ${path.bytes}, ${path.length}, &${out})`
    : method === 'readFileBytesSync'
      ? `ccjs_fs_read_file_bytes_sync(&ccjs_default_allocator, ${path.bytes}, ${path.length}, &${out})`
      : `ccjs_fs_read_dir_sync(&ccjs_default_allocator, ${path.bytes}, ${path.length}, &${out})`

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
  const method = cFsRuntimeCallName(expression?.callee)

  if (method == null || !['writeFileBytesSync', 'writeFileSync'].includes(method)) {
    return null
  }

  const path = emitPreparedStringBytesOperand(expression.args[0], context, 'ccjs_fs_path')
  const lines = [
    ...path.lines
  ]

  if (method === 'writeFileBytesSync') {
    const bytes = emitCValueExpression(expression.args[1], context)

    lines.push(...bytes.lines)
    lines.push(emitRuntimeValueCheck(bytes.expression, 'CCJS_TAG_BYTES', context))
    lines.push(emitStatusCheck(`ccjs_fs_write_file_bytes_sync(${path.bytes}, ${path.length}, ${bytes.expression})`, context))

    return {
      lines
    }
  }

  const bytes = emitPreparedStringBytesOperand(expression.args[1], context, 'ccjs_fs_bytes')

  lines.push(...bytes.lines)
  lines.push(emitStatusCheck(`ccjs_fs_write_file_sync(${path.bytes}, ${path.length}, ${bytes.bytes}, ${bytes.length})`, context))

  return {
    lines
  }
}

function emitPreparedJsonCallExpression(expression, context, options: { out?: string, owned?: boolean } = {}) {
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

function emitPreparedTimerCallExpression(expression, context, options: { out?: string, asValue?: boolean } = {}) {
  const method = cTimerRuntimeCallName(expression?.callee)

  if (method == null) {
    return null
  }

  const clearMethod = cTimerClearCallName(expression.callee)

  if (clearMethod != null) {
    const handle = emitPreparedTimerHandleExpression(expression.args[0], context)

    return {
      lines: [
        ...handle.lines,
        `ccjs_loop_clear_timer(${handle.expression});`
      ],
      expression: ''
    }
  }

  if (context.statusReturn && !context.externalEventLoop) {
    context.diagnostics.push(diagnostic('CCJS_C_TIMER_CALLBACK', 'timer calls inside runtime callbacks need callback loop capture and are not supported by the current C backend slice', expression.loc))

    return {
      lines: [],
      expression: ''
    }
  }

  if (method === 'setInterval' && options.out == null && options.asValue !== true) {
    context.diagnostics.push(diagnostic('CCJS_C_TIMER_HANDLE', 'setInterval requires a timer handle so it can be cleared by the current C backend slice', expression.loc))

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
    lines.push(`if (ccjs_loop_queue_immediate(${emitEventLoopReference(context)}, ccjs_timer_callback_run, ${callbackContext}, ccjs_timer_callback_finalize, ${outArgument}) != CCJS_OK) {`)
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
  lines.push(`if (${runtimeCall}(${emitEventLoopReference(context)}, ${delay.expression}, ccjs_timer_callback_run, ${callbackContext}, ccjs_timer_callback_finalize, ${outArgument}) != CCJS_OK) {`)
  lines.push(`  ccjs_timer_callback_finalize(${callbackContext});`)
  lines.push(`  ${emitFailureStatement(context)}`)
  lines.push('}')

  return {
    lines,
    expression: out ?? ''
  }
}

function emitPreparedTimerHandleExpression(expression, context) {
  if (expression?.type === 'Reference' && expression.path.length === 1 && context.variables.get(expression.path[0]) === 'timer') {
    return {
      lines: [],
      expression: emitReference(expression, context)
    }
  }

  if (expression?.type === 'CallExpression' && cTimerStartCallName(expression.callee) != null) {
    return emitPreparedTimerCallExpression(expression, context, {
      asValue: true
    })
  }

  context.diagnostics.push(diagnostic('CCJS_C_TIMER_HANDLE', 'timer clear calls require a timer handle value', expression?.loc))

  return {
    lines: [],
    expression: '0'
  }
}

function emitPreparedPromiseStaticExpression(expression, context, options: { out?: string, owned?: boolean } = {}) {
  const method = cPromiseRuntimeCallName(expression?.callee)

  if (method == null || expression?.valueType !== 'promise') {
    return null
  }

  registerEventLoop(context)

  const out = options.out ?? nextCName(context, 'ccjs_promise')
  const rejectionValueType = method === 'reject'
    ? inferRejectedValueType(expression.args[0], context)
    : 'unknown'

  if (options.owned !== false) {
    registerOwnedPromise(context, out, expression.promiseValueType ?? 'unknown', rejectionValueType)
  }
  const runtimeCall = method === 'resolve' ? 'ccjs_promise_resolved' : 'ccjs_promise_rejected'
  const value = expression.args[0] == null
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

function emitPreparedPromiseMethodExpression(expression, context, options: { out?: string, owned?: boolean } = {}) {
  if (!isPromiseMethodCallExpression(expression, context)) {
    return null
  }

  const method = expression.callee.property
  const callback = expression.args[0]
  const wrapper = callback == null ? null : context.promiseChainArrowWrappers.get(callback)

  if (wrapper == null) {
    context.diagnostics.push(diagnostic('CCJS_C_ASYNC', 'Promise.then/catch currently supports only non-capturing expression-body, single-return block-body, straight-line block-body or simple control-flow block-body arrow callbacks in C', expression.loc))

    return {
      lines: [],
      expression: '0',
      valueType: expression.promiseValueType ?? 'unknown',
      rejectionValueType: 'unknown'
    }
  }

  const receiver = emitPreparedPromiseExpression(expression.callee.object, context)

  if (receiver == null) {
    context.diagnostics.push(diagnostic('CCJS_C_ASYNC', 'this Promise chain receiver is not supported by the current C backend slice', expression.loc))

    return {
      lines: [],
      expression: '0',
      valueType: expression.promiseValueType ?? 'unknown',
      rejectionValueType: 'unknown'
    }
  }

  const out = options.out ?? nextCName(context, 'ccjs_promise')
  const valueType = expression.promiseValueType ?? 'unknown'
  const rejectionValueType = method === 'then' ? receiver.rejectionValueType ?? 'unknown' : 'unknown'
  const callbackContext = emitPromiseChainCallbackContext(wrapper, context)
  const runtimeCall = method === 'then'
    ? `ccjs_promise_chain(${receiver.expression}, ${wrapper.name}, 0, ${callbackContext.expression}, ${callbackContext.finalizer}, &${out})`
    : `ccjs_promise_catch(${receiver.expression}, ${wrapper.name}, ${callbackContext.expression}, ${callbackContext.finalizer}, &${out})`
  const runtimeCallLines = callbackContext.expression === '0'
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
    lines: [
      ...receiver.lines,
      ...callbackContext.lines,
      ...runtimeCallLines
    ],
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
    if (capture.mutable && !isSupportedMutableRuntimeArrowCapture(capture, context)) {
      context.diagnostics.push(diagnostic('CCJS_C_ASYNC', 'capturing this mutable binding in Promise callbacks requires unsupported boxed closure storage', wrapper.expression.loc))
    }

    if (!['number', 'boolean', 'string', 'object'].includes(capture.valueType)) {
      context.diagnostics.push(diagnostic('CCJS_C_ASYNC', 'capturing Promise callbacks currently support only const number/boolean/string/object bindings', wrapper.expression.loc))
    }
  }

  const contextName = nextCName(context, 'ccjs_promise_callback_ctx')

  lines.push(`${wrapper.contextTypeName}* ${contextName} = ccjs_default_alloc(0, sizeof(${wrapper.contextTypeName}), _Alignof(${wrapper.contextTypeName}));`)
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

function emitPreparedAsyncFunctionPromiseCallExpression(expression, context, options: { out?: string, owned?: boolean } = {}) {
  if (expression?.type !== 'CallExpression' || !isAsyncFunctionCallee(expression.callee, context) || expression.valueType !== 'promise') {
    return null
  }

  const valueType = resolveCAsyncFunctionAwaitValueType(expression.callee, context) ?? expression.promiseValueType ?? 'unknown'
  const taskCall = emitPreparedAsyncTaskPromiseCallExpression(expression, valueType, context, options)

  if (taskCall != null) {
    return taskCall
  }

  if (isThrowingFunctionCallee(expression.callee, context)) {
    return emitPreparedThrowingAsyncFunctionPromiseCallExpression(expression, valueType, context, options)
  }

  if (!isSupportedAsyncFunctionPromiseValueType(valueType)) {
    context.diagnostics.push(diagnostic('CCJS_C_ASYNC', 'async function calls as Promise values currently support only number, boolean, string, bytes, object, array, map, set and void values in C', expression.loc))

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
  const value = valueType === 'void'
    ? 'ccjs_undefined_value()'
    : valueType === 'boolean'
      ? `ccjs_bool_value((${call.expression}) != 0)`
      : valueType === 'number'
        ? `ccjs_number_value(${call.expression})`
        : managedValue
  const valueCheck = managedValue == null ? '' : emitRuntimeValueCheck(managedValue, cRuntimeValueTag(valueType), context)

  if (managedValue != null) {
    registerOwnedValue(context, managedValue)
  }

  if (options.owned !== false) {
    registerOwnedPromise(context, out, valueType, 'unknown')
  }

  return {
    lines: managedValue == null
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

function emitPreparedAsyncTaskPromiseCallExpression(expression, valueType, context, options: { out?: string, owned?: boolean } = {}) {
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
    lines: [
      ...prepared.lines,
      emitStatusCheck(`${wrapper.startName}(${args.join(', ')})`, context)
    ],
    expression: out,
    valueType,
    rejectionValueType: 'unknown'
  }
}

function emitPreparedThrowingAsyncFunctionPromiseCallExpression(expression, valueType, context, options: { out?: string, owned?: boolean } = {}) {
  if (!isSupportedAsyncFunctionPromiseValueType(valueType)) {
    context.diagnostics.push(diagnostic('CCJS_C_ASYNC', 'throwing async function calls as Promise values currently support only number, boolean, string, bytes, object, array, map, set and void values in C', expression.loc))

    return {
      lines: [],
      expression: '0',
      valueType,
      rejectionValueType: resolveCFunctionRejectionValueType(expression.callee, context)
    }
  }

  const params = resolveFunctionParams(expression.callee, context)

  if (params == null) {
    context.diagnostics.push(diagnostic('CCJS_C_ASYNC', 'this async function call is not supported as a Promise value in the current C backend slice', expression.loc))

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
  const fulfilledValue = valueType === 'void'
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
      ...(result == null
        ? []
        : managedResult
          ? emitPrepareOwnedValueWrite(result)
          : [`double ${result} = 0;`]),
      `ccjs_status ${status} = ${emitCallee(expression.callee, context)}(${args.join(', ')});`,
      `if (${status} == CCJS_ERR_THROW) {`,
      `  ${emitStatusCheck(`ccjs_promise_rejected(${emitEventLoopReference(context)}, ccjs_error, &${out})`, context)}`,
      '  ccjs_release(ccjs_error);',
      '  ccjs_error = ccjs_undefined_value();',
      '} else {',
      `  if (${status} != CCJS_OK) ${emitFailureStatement(context)}`,
      ...(valueCheck === '' ? [] : [`  ${valueCheck}`]),
      `  ${emitStatusCheck(`ccjs_promise_resolved(${emitEventLoopReference(context)}, ${fulfilledValue}, &${out})`, context)}`,
      ...(managedResult ? emitPrepareOwnedValueWrite(result).map(line => `  ${line}`) : []),
      '}'
    ],
    expression: out,
    valueType,
    rejectionValueType
  }
}

function isSupportedAsyncFunctionPromiseValueType(valueType) {
  return valueType === 'void'
    || valueType === 'number'
    || valueType === 'boolean'
    || isManagedRuntimeReturnType(valueType)
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
      valueType: promiseExpression.valueType ?? expression.promiseValueType ?? 'unknown'
    }
  }

  return null
}

function emitPreparedPromiseExpression(expression, context, options: { out?: string, owned?: boolean } = {}) {
  const fsCall = emitPreparedFsCallExpression(expression, context, options)

  if (fsCall != null) {
    return {
      ...fsCall,
      valueType: expression.promiseValueType ?? 'unknown'
    }
  }

  const promiseResolve = emitPreparedPromiseStaticExpression(expression, context, options)

  if (promiseResolve != null) {
    return {
      ...promiseResolve,
      valueType: expression.promiseValueType ?? 'unknown'
    }
  }

  const promiseMethod = emitPreparedPromiseMethodExpression(expression, context, options)

  if (promiseMethod != null) {
    return {
      ...promiseMethod,
      valueType: expression.promiseValueType ?? 'unknown'
    }
  }

  const asyncPromiseCall = emitPreparedAsyncFunctionPromiseCallExpression(expression, context, options)

  if (asyncPromiseCall != null) {
    return {
      ...asyncPromiseCall,
      valueType: expression.promiseValueType ?? 'unknown'
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

    context.diagnostics.push(diagnostic('CCJS_C_ASYNC', 'this awaited promise expression is not supported by the current C backend slice', expression.loc))

    return {
      lines: [],
      expression: 'ccjs_undefined_value()'
    }
  }

  registerEventLoop(context)

  const valueType = expression.valueType ?? promise.valueType ?? 'unknown'
  const value = nextCName(context, 'ccjs_await_value')
  const valueTag = cRuntimeValueTag(valueType)
  const valueCheck = emitRuntimeValueCheck(value, valueTag, context)
  registerOwnedValue(context, value)

  return {
    lines: [
      ...promise.lines,
      ...emitPrepareOwnedValueWrite(value),
      `while (ccjs_promise_get_state(${promise.expression}) == CCJS_PROMISE_PENDING && ccjs_loop_has_work(${emitEventLoopReference(context)})) {`,
      `  ${emitStatusCheck(`ccjs_loop_poll(${emitEventLoopReference(context)}, 0)`, context)}`,
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
  const rejectedTypeCheck = rejectionValueType === 'error'
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
    ...emitPrepareOwnedValueWrite('ccjs_error').map(line => `  ${line}`),
    `  ${emitStatusCheck(`ccjs_promise_get_result(${promiseExpression}, &ccjs_error)`, context)}`,
    `  ${emitRuntimeTypeCheck(rejectedTypeCheck, context)}`,
    '  ccjs_error_active = 1;',
    ...(target == null
      ? [
          '  ccjs_status_result = CCJS_ERR_THROW;',
          '  goto ccjs_cleanup;'
        ]
      : [
          `  goto ${target};`
        ]),
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

  const valueType = expression.valueType ?? resolveCAsyncFunctionAwaitValueType(callExpression.callee, context) ?? 'unknown'
  const call = emitPreparedCallExpression(callExpression, context)

  if (valueType === 'void') {
    return {
      lines: [
        ...call.lines,
        `${call.expression};`
      ],
      expression: 'ccjs_undefined_value()'
    }
  }

  const valueTag = cRuntimeValueTag(valueType)

  if (valueTag == null && valueType !== 'number' && valueType !== 'boolean') {
    context.diagnostics.push(diagnostic('CCJS_C_ASYNC', 'this async function return value is not supported by the current C backend slice', expression.loc))

    return {
      lines: [],
      expression: 'ccjs_undefined_value()'
    }
  }

  const value = nextCName(context, 'ccjs_await_value')
  registerOwnedValue(context, value)

  const resultExpression = valueType === 'boolean'
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
    context.diagnostics.push(diagnostic('CCJS_C_THROW', 'uncaught throwing function calls must be inside try/catch in the current C backend slice', expression.loc))
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

function emitPreparedPromiseReturningCallExpression(expression, context, options: { out?: string, owned?: boolean } = {}) {
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
    lines: [
      ...call.lines,
      `${out} = ${call.expression};`,
      `if (${out} == 0) ${emitFailureStatement(context)}`
    ],
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
  const lines = [
    `if (${status} == CCJS_ERR_THROW) {`,
    '  ccjs_error_active = 1;'
  ]

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

  context.diagnostics.push(diagnostic('CCJS_C_CALL_EXPR', 'this call expression is not supported by the current C backend slice', callee.loc))
  return '_'
}

function emitFunctionValueExpression(expression, context) {
  if (expression?.type === 'ArrowFunctionExpression') {
    const wrapper = context.callbackArrowWrappers.get(expression)

    if (wrapper?.kind === 'plain-arrow') {
      return wrapper.name
    }

    context.diagnostics.push(diagnostic('CCJS_C_FUNCTION_VALUE', 'capturing or unsupported inline callbacks are not supported by the current C backend slice; use a named function or a non-capturing inline callback with a supported signature', expression.loc))

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

  context.diagnostics.push(diagnostic('CCJS_C_FUNCTION_VALUE', 'this function value is not supported by the current C backend slice', expression?.loc))

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
  if (expression?.type === 'Reference' && expression.path.length === 1 && context.runtimeCallbacks.has(expression.path[0])) {
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
  if (expression?.type === 'Reference' && expression.path.length === 1 && context.runtimeCallbacks.has(expression.path[0])) {
    return [
      ...emitPrepareOwnedValueWrite(out),
      `${out} = ${expression.path[0]};`,
      `ccjs_retain(${out});`
    ]
  }

  if (expression?.type === 'ArrowFunctionExpression') {
    const wrapper = context.callbackArrowWrappers.get(expression)

    if (wrapper == null) {
      context.diagnostics.push(diagnostic('CCJS_C_FUNCTION_VALUE', 'runtime C callback wrapper was not generated for this arrow function', expression.loc))
      return [
        ...emitPrepareOwnedValueWrite(out),
        `${out} = ccjs_undefined_value();`
      ]
    }

    return emitRuntimeArrowCallbackValueInto(wrapper, out, context)
  }

  if (expression?.type !== 'Reference' || expression.path.length !== 1 || !context.functionNames.has(expression.path[0])) {
    context.diagnostics.push(diagnostic('CCJS_C_FUNCTION_VALUE', 'runtime C callbacks currently require a named non-capturing function', expression?.loc))
    return [
      ...emitPrepareOwnedValueWrite(out),
      `${out} = ccjs_undefined_value();`
    ]
  }

  const wrapper = runtimeCallbackWrapperFor(expression.path[0], functionType, context)

  if (wrapper == null) {
    context.diagnostics.push(diagnostic('CCJS_C_FUNCTION_VALUE', 'runtime C callback wrapper was not generated for this function value', expression.loc))
    return [
      ...emitPrepareOwnedValueWrite(out),
      `${out} = ccjs_undefined_value();`
    ]
  }

  const callbackContext = functionTakesEventLoopParam(expression.path[0], context)
    ? emitEventLoopReference(context)
    : '0'

  if (callbackContext !== '0') {
    registerEventLoop(context)
  }

  return [
    ...emitPrepareOwnedValueWrite(out),
    emitStatusCheck(`ccjs_callback_new(&ccjs_default_allocator, ${wrapper.name}, ${callbackContext}, 0, &${out})`, context)
  ]
}

function emitRuntimeArrowCallbackValueInto(wrapper, out, context) {
  const lines = [
    ...emitPrepareOwnedValueWrite(out)
  ]

  for (const capture of wrapper.captures) {
    if (capture.mutable && !isSupportedMutableRuntimeArrowCapture(capture, context)) {
      context.diagnostics.push(diagnostic('CCJS_C_FUNCTION_VALUE', 'capturing this mutable binding in C callbacks requires unsupported boxed closure storage', wrapper.expression.loc))
    }

    if (!['number', 'boolean', 'string', 'object', 'timer'].includes(capture.valueType)) {
      context.diagnostics.push(diagnostic('CCJS_C_FUNCTION_VALUE', 'capturing C callbacks currently support only const number/boolean/string/object/timer bindings', wrapper.expression.loc))
    }
  }

  if (!isRuntimeArrowCallbackWrapperWithContext(wrapper)) {
    lines.push(emitStatusCheck(`ccjs_callback_new(&ccjs_default_allocator, ${wrapper.name}, 0, 0, &${out})`, context))
    return lines
  }

  const contextName = nextCName(context, 'ccjs_callback_ctx')

  lines.push(`${wrapper.contextTypeName}* ${contextName} = ccjs_default_alloc(0, sizeof(${wrapper.contextTypeName}), _Alignof(${wrapper.contextTypeName}));`)
  lines.push(`if (${contextName} == 0) ${emitFailureStatement(context)}`)

  if (wrapper.needsEventLoop === true) {
    registerEventLoop(context)
    lines.push(`${contextName}->ccjs_loop = ${emitEventLoopReference(context)};`)
  }

  for (const capture of wrapper.captures) {
    lines.push(...emitRuntimeArrowCaptureStoreLines(capture, contextName, context))
  }

  lines.push(`if (ccjs_callback_new(&ccjs_default_allocator, ${wrapper.name}, ${contextName}, ${wrapper.finalizerName}, &${out}) != CCJS_OK) {`)
  lines.push(`  ${wrapper.finalizerName}(${contextName});`)
  lines.push(`  ${emitFailureStatement(context)}`)
  lines.push('}')

  return lines
}

function emitRuntimeArrowCaptureStoreLines(capture, contextName, context) {
  const field = `${contextName}->${emitRuntimeArrowCaptureField(capture)}`

  if (isSupportedMutableRuntimeArrowCapture(capture, context)) {
    return [
      `${field} = ${capture.name};`
    ]
  }

  if (isRetainedRuntimeArrowCapture(capture)) {
    if (capture.valueType === 'string') {
      return [
        `${field}.tag = CCJS_TAG_STRING;`,
        `${field}.as.ref = (ccjs_ref*)&${capture.name}->header;`,
        `ccjs_retain(${field});`
      ]
    }

    return [
      `${field} = ${capture.name};`,
      `ccjs_retain(${field});`
    ]
  }

  return [
    `${field} = ${capture.name};`
  ]
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
    lines.push(emitStatusCheck(`ccjs_callback_call(${emitReference(expression.callee, context)}, 0, 0, &${out})`, context))
  } else {
    const argArray = nextCName(context, 'ccjs_callback_args')

    lines.push(`ccjs_value ${argArray}[] = { ${args.join(', ')} };`)
    lines.push(emitStatusCheck(`ccjs_callback_call(${emitReference(expression.callee, context)}, ${argArray}, ${args.length}, &${out})`, context))
  }

  return {
    lines,
    expression: ''
  }
}

function emitOptionalRuntimeCallbackCallExpression(expression, context) {
  const functionType = resolveRuntimeCallbackCalleeType(expression.callee, context)

  if (functionType == null) {
    context.diagnostics.push(diagnostic('CCJS_C_OPTIONAL_CHAINING', 'optional calls currently require a nullable runtime callback value in the C backend', expression.loc))
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

    lines.push(...value.lines.map(line => `  ${line}`))
    args.push(value.expression)
  }

  const out = nextCName(context, 'ccjs_callback_out')
  registerOwnedValue(context, out)
  lines.push(...emitPrepareOwnedValueWrite(out).map(line => `  ${line}`))

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
    context.diagnostics.push(diagnostic('CCJS_C_OPTIONAL_CHAINING', 'optional call results currently support nullable runtime callback results in the C backend', expression.loc))

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

    lines.push(...value.lines.map(line => `  ${line}`))
    args.push(value.expression)
  }

  lines.push(...emitPrepareOwnedValueWrite(out).map(line => `  ${line}`))

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
  if (expression?.type === 'CallExpression' && cTimeRuntimeCallName(expression.callee) != null) {
    return 'number'
  }

  if (expression?.type === 'CallExpression' && cFsRuntimeCallName(expression.callee) != null) {
    return expression.valueType === 'promise'
      ? 'promise'
      : expression.valueType ?? 'unknown'
  }

  if (expression?.type === 'CallExpression' && cJsonRuntimeCallName(expression.callee) != null) {
    return expression.valueType ?? (cJsonRuntimeCallName(expression.callee) === 'parse' ? 'object' : 'string')
  }

  if (expression?.type === 'CallExpression' && cPromiseRuntimeCallName(expression.callee) != null && expression.valueType === 'promise') {
    return 'promise'
  }

  if (expression?.type === 'CallExpression' && mathRuntimeMethodName(expression.callee) != null) {
    return 'number'
  }

  if (isErrorConstructorExpression(expression)) {
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
    return expression.valueType ?? (binaryRuntimeMethodName(expression?.callee) === 'toString' ? 'string' : 'bytes')
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
    return context.variables.get(expression.path.join('.')) ?? (context.functionNames.has(expression.path[0]) ? 'function' : (isCJsGlobalRoot(expression.path[0], context) ? 'js-global' : 'number'))
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

  if (expression?.type === 'BinaryExpression') {
    if (['===', '!==', '==', '!=', '<', '<=', '>', '>=', '&&', '||'].includes(expression.operator)) {
      return 'boolean'
    }

    if (expression.operator === '??') {
      const left = inferExpressionType(expression.left, context)

      return left === 'null' || left === 'unknown' ? inferExpressionType(expression.right, context) : left
    }

    if (expression.operator === '+' && (inferExpressionType(expression.left, context) === 'string' || inferExpressionType(expression.right, context) === 'string')) {
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
    return expression.valueType ?? 'unknown'
  }

  if (isOptionalChainExpression(expression)) {
    return 'optional'
  }

  return 'number'
}

function isConsoleLog(expression) {
  return expression?.type === 'CallExpression'
    && expression.callee.type === 'MemberExpression'
    && expression.callee.object.type === 'Reference'
    && expression.callee.object.path.length === 1
    && expression.callee.object.path[0] === 'console'
    && ['log', 'info', 'warn', 'error'].includes(expression.callee.property)
}

function emitCOperator(operator) {
  if (operator === '===' || operator === '==') {
    return '=='
  }

  if (operator === '!==' || operator === '!=') {
    return '!='
  }

  return operator
}

function cUnsupportedExpressionCode(type) {
  if (type === 'function') {
    return 'CCJS_C_FUNCTION_VALUE'
  }

  if (type === 'optional') {
    return 'CCJS_C_OPTIONAL_CHAINING'
  }

  if (type === 'class') {
    return 'CCJS_C_CLASS'
  }

  if (type === 'async' || type === 'promise') {
    return 'CCJS_C_ASYNC'
  }

  if (type === 'js-global') {
    return 'CCJS_C_JS_GLOBAL'
  }

  if (type === 'map' || type === 'set') {
    return 'CCJS_C_COLLECTION'
  }

  return 'CCJS_C_UNSUPPORTED_EXPR'
}

function isOptionalChainExpression(expression) {
  return expression?.type === 'OptionalMemberExpression'
    || expression?.type === 'OptionalIndexExpression'
    || expression?.type === 'OptionalCallExpression'
}

function isNullishCoalescingExpression(expression) {
  return expression?.type === 'BinaryExpression' && expression.operator === '??'
}

function isErrorConstructorExpression(expression) {
  return expression?.type === 'NewExpression'
    && expression.callee.type === 'Reference'
    && expression.callee.path.length === 1
    && expression.callee.path[0] === 'Error'
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

function canLowerCNullishCoalescingExpression(expression, context) {
  if (!isNullishCoalescingExpression(expression)) {
    return false
  }

  const resultType = inferExpressionType(expression, context)

  return isRuntimeNullableType(resultType)
    && (inferExpressionType(expression.left, context) === 'null' || isNullableRuntimeExpression(expression.left, context))
}

function canLowerCScalarNullishCoalescingExpression(expression, context) {
  if (!isNullishCoalescingExpression(expression)) {
    return false
  }

  const resultType = inferExpressionType(expression, context)

  return ['number', 'boolean'].includes(resultType)
    && (inferExpressionType(expression.left, context) === 'null' || isNullableRuntimeExpression(expression.left, context))
}

function isNullableRuntimeExpression(expression, context) {
  if (expression?.type === 'Reference' && expression.path.length === 1) {
    return context.nullableVariables.has(expression.path[0])
  }

  if (expression?.type === 'CallExpression' && expression.callee.type === 'Reference' && expression.callee.path.length === 1) {
    return context.functionReturnNullables.get(expression.callee.path[0]) === true
  }

  if (expression?.type === 'OptionalCallExpression') {
    const functionType = resolveRuntimeCallbackCalleeType(expression.callee, context)

    return functionType != null && isRuntimeNullableType(functionType.returnType)
  }

  if (isNullishCoalescingExpression(expression)) {
    return false
  }

  return expression?.nullable === true && isRuntimeNullableType(inferExpressionType(expression, context))
}

function isStringConcatExpression(expression, context) {
  return expression?.type === 'BinaryExpression'
    && expression.operator === '+'
    && inferExpressionType(expression.left, context) === 'string'
    && inferExpressionType(expression.right, context) === 'string'
}

function isRuntimeProducedStringExpression(expression, context) {
  return (expression?.type === 'CallExpression' && inferExpressionType(expression, context) === 'string')
    || (expression?.type === 'AwaitExpression' && inferExpressionType(expression, context) === 'string')
    || isStringConcatExpression(expression, context)
    || (isNullishCoalescingExpression(expression) && canLowerCNullishCoalescingExpression(expression, context))
    || isBoxedRuntimeStringReference(expression, context)
}

function isStringConversionCall(expression, context) {
  if (expression?.type !== 'CallExpression' || expression.callee.type !== 'Reference' || expression.callee.path.length !== 1 || expression.callee.path[0] !== 'String' || expression.args.length !== 1) {
    return false
  }

  return ['boolean', 'number', 'string'].includes(inferExpressionType(expression.args[0], context))
}

function isStringTrimCall(expression, context) {
  if (expression?.type !== 'CallExpression' || expression.callee.type !== 'MemberExpression' || expression.callee.property !== 'trim' || expression.args.length !== 0) {
    return false
  }

  return isStringLengthObject(expression.callee.object, context)
}

function isStringSliceCall(expression, context) {
  if (expression?.type !== 'CallExpression' || expression.callee.type !== 'MemberExpression' || expression.callee.property !== 'slice' || expression.args.length < 1 || expression.args.length > 2) {
    return false
  }

  return isStringLengthObject(expression.callee.object, context) && expression.args.every(arg => inferExpressionType(arg, context) === 'number')
}

function isStringSplitCall(expression, context) {
  if (expression?.type !== 'CallExpression' || expression.callee.type !== 'MemberExpression' || expression.callee.property !== 'split' || expression.args.length !== 1) {
    return false
  }

  return isStringLengthObject(expression.callee.object, context) && inferExpressionType(expression.args[0], context) === 'string'
}

function isStringPredicateCall(expression, context) {
  if (expression?.type !== 'CallExpression' || expression.callee.type !== 'MemberExpression' || !cStringPredicateMethods.has(expression.callee.property) || expression.args.length !== 1) {
    return false
  }

  return isStringLengthObject(expression.callee.object, context) && inferExpressionType(expression.args[0], context) === 'string'
}

function isArrayMethodCall(expression) {
  return expression?.type === 'CallExpression'
    && expression.callee.type === 'MemberExpression'
    && cArrayMethods.has(expression.callee.property)
}

function emitArraySortVariableDeclaration(statement, sorted, context) {
  registerOwnedValue(context, statement.name)
  context.variables.set(statement.name, 'array')

  const shape = context.arrayShapes.get(sorted.expression)

  if (shape != null) {
    context.arrayShapes.set(statement.name, shape.map(element => ({ ...element })))
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
  if (expression?.type !== 'CallExpression' || expression.callee.type !== 'MemberExpression' || expression.callee.property !== 'sort' || expression.args.length > 1) {
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
    lines: [
      ...receiver.lines,
      emitStatusCheck(`ccjs_array_sort(${receiver.expression})`, context)
    ],
    expression: receiver.expression,
    elementType: receiver.elementType
  }
}

function emitPreparedArrayPushCallExpression(expression, context) {
  if (expression?.type !== 'CallExpression' || expression.callee.type !== 'MemberExpression' || expression.callee.property !== 'push' || expression.args.length !== 1) {
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
  if (expression?.type !== 'CallExpression' || expression.callee.type !== 'MemberExpression' || expression.callee.property !== 'pop' || expression.args.length !== 0) {
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

  if (callback?.type !== 'ArrowFunctionExpression' || returnExpression == null || callback.params.length > 2 || !['number', 'boolean', 'string'].includes(receiver.elementType)) {
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
      ...emitPrepareOwnedValueWrite(left).map(line => `    ${line}`),
      `    ${emitStatusCheck(`ccjs_array_get(${receiver.expression}, ${scan} - 1, &${left})`, context)}`,
      ...emitPrepareOwnedValueWrite(right).map(line => `    ${line}`),
      `    ${emitStatusCheck(`ccjs_array_get(${receiver.expression}, ${scan}, &${right})`, context)}`,
      ...body.map(line => `    ${line}`),
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
  if (expression?.type !== 'CallExpression' || expression.callee.type !== 'MemberExpression' || expression.callee.property !== 'map' || expression.args.length !== 1) {
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

    mappedElementType = mappedElementType === 'unknown'
      ? resolveArrayCallbackReturnType(callbackBody, context)
      : mappedElementType

    if (!['number', 'boolean', 'string'].includes(mappedElementType)) {
      return null
    }

    return [
      ...input,
      ...emitArrayMapCallbackBodyLines(callbackBody, mappedElementType, out, context)
    ]
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
      ...emitPrepareOwnedValueWrite(value).map(line => `  ${line}`),
      `  ${emitStatusCheck(`ccjs_array_get(${receiver.expression}, ${index}, &${value})`, context)}`,
      ...body.map(line => `  ${line}`),
      '}',
      ...emitPrepareOwnedValueWrite(value)
    ],
    expression: out,
    elementType: mappedElementType
  }
}

function emitPreparedArrayFilterCallExpression(expression, context) {
  if (expression?.type !== 'CallExpression' || expression.callee.type !== 'MemberExpression' || expression.callee.property !== 'filter' || expression.args.length !== 1) {
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

    return [
      ...input,
      ...emitArrayFilterCallbackBodyLines(callbackBody, out, value, context)
    ]
  })

  return {
    lines: [
      ...receiver.lines,
      ...emitPrepareOwnedValueWrite(out),
      emitStatusCheck(`ccjs_array_new(&ccjs_default_allocator, 0, &${out})`, context),
      `size_t ${length} = 0;`,
      emitStatusCheck(`ccjs_array_len(${receiver.expression}, &${length})`, context),
      `for (size_t ${index} = 0; ${index} < ${length}; ${index} += 1) {`,
      ...emitPrepareOwnedValueWrite(value).map(line => `  ${line}`),
      `  ${emitStatusCheck(`ccjs_array_get(${receiver.expression}, ${index}, &${value})`, context)}`,
      ...body.map(line => `  ${line}`),
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

  return statement?.type === 'ReturnStatement' ? statement.argument ?? null : null
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

  return canLowerArrayCallbackTerminalStatement(statement.consequent)
    && canLowerArrayCallbackTerminalStatement(statement.alternate)
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

  return canLowerArrayCallbackBranch(statement.consequent)
    && (statement.alternate == null || canLowerArrayCallbackBranch(statement.alternate))
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

  return expressions.every(expression => inferExpressionType(expression, context) === firstType)
    ? firstType
    : 'unknown'
}

function collectArrayCallbackReturnExpressions(body) {
  if (body.kind === 'prepared-return') {
    return [body.returnExpression]
  }

  const expressions: any[] = []
  const visitStatement = statement => {
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
  const emitReturn = expression => emitArrayMapReturnLines(expression, elementType, out, context)

  return emitArrayCallbackBodyLines(body, emitReturn, context)
}

function emitArrayFilterCallbackBodyLines(body, out, value, context) {
  const emitReturn = expression => emitArrayFilterReturnLines(expression, out, value, context)

  return emitArrayCallbackBodyLines(body, emitReturn, context)
}

function emitArrayCallbackBodyLines(body, emitReturn, context) {
  if (body.kind === 'prepared-return') {
    return emitReturn(body.returnExpression)
  }

  const doneLabel = nextCName(context, 'ccjs_array_callback_done')

  return [
    ...emitArrayCallbackStatementListLines(body.statements, doneLabel, emitReturn, context),
    `${doneLabel}:;`
  ]
}

function emitArrayCallbackStatementListLines(statements, doneLabel, emitReturn, context) {
  return statements.flatMap(statement => emitArrayCallbackStatementLines(statement, doneLabel, emitReturn, context))
}

function emitArrayCallbackStatementLines(statement, doneLabel, emitReturn, context) {
  if (statement?.type === 'ReturnStatement') {
    return [
      ...emitReturn(statement.argument),
      `goto ${doneLabel};`
    ]
  }

  if (statement?.type === 'BlockStatement') {
    return [
      '{',
      ...emitArrayCallbackStatementListLines(statement.body, doneLabel, emitReturn, context).map(line => `  ${line}`),
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
    `if (${condition.expression}) {`,
    ...consequent.map(line => `  ${line}`),
    '}'
  ]

  if (statement.alternate != null) {
    lines[lines.length - 1] = '} else {'
    lines.push(...emitArrayCallbackStatementLines(statement.alternate, doneLabel, emitReturn, context).map(line => `  ${line}`))
    lines.push('}')
  }

  return lines
}

function emitArrayMapReturnLines(expression, elementType, out, context) {
  const mappedValue = emitPreparedArrayMapValue(expression, elementType, context)

  return [
    ...mappedValue.lines,
    emitStatusCheck(`ccjs_array_push(${out}, ${mappedValue.expression})`, context)
  ]
}

function emitArrayFilterReturnLines(expression, out, value, context) {
  const predicate = emitPreparedNumberExpression(expression, context)

  return [
    ...predicate.lines,
    `if (${predicate.expression}) {`,
    `  ${emitStatusCheck(`ccjs_array_push(${out}, ${value})`, context)}`,
    '}'
  ]
}

function resolvePromiseChainArrowBody(callback) {
  if (callback?.type !== 'ArrowFunctionExpression') {
    return null
  }

  if (callback.expressionBody) {
    return {
      kind: 'prepared-return',
      prefixStatements: [],
      returnExpression: callback.body
    }
  }

  const statements = Array.isArray(callback.body)
    ? callback.body
    : callback.body?.type === 'BlockStatement'
      ? callback.body.body
      : null

  if (statements == null || statements.length === 0) {
    return null
  }

  const returnStatement = statements.at(-1)

  if (returnStatement?.type !== 'ReturnStatement') {
    return null
  }

  const prefixStatements = statements.slice(0, -1)

  if (prefixStatements.every(isStraightLinePromiseCallbackStatement)) {
    return {
      kind: 'prepared-return',
      prefixStatements,
      returnExpression: returnStatement.argument ?? null
    }
  }

  if (!statements.every(isPromiseChainCallbackStatement)) {
    return null
  }

  return {
    kind: 'statement-list',
    statements
  }
}

function isStraightLinePromiseCallbackStatement(statement) {
  return statement?.type === 'VariableDeclaration' || statement?.type === 'ExpressionStatement'
}

function isPromiseChainCallbackStatement(statement) {
  if (statement == null) {
    return false
  }

  if (isStraightLinePromiseCallbackStatement(statement) || statement.type === 'ReturnStatement' || statement.type === 'ThrowStatement') {
    return true
  }

  if (statement.type === 'BlockStatement') {
    return statement.body.every(isPromiseChainCallbackStatement)
  }

  if (statement.type === 'SwitchStatement') {
    return isPromiseChainCallbackSwitchStatement(statement)
  }

  if (statement.type === 'TryStatement') {
    return isPromiseChainCallbackStatement(statement.block)
      && (statement.handler == null || isPromiseChainCallbackStatement(statement.handler.body))
      && (statement.finalizer == null || isPromiseChainCallbackStatement(statement.finalizer))
  }

  if (statement.type !== 'IfStatement') {
    return false
  }

  return isPromiseChainCallbackStatement(statement.consequent)
    && (statement.alternate == null || isPromiseChainCallbackStatement(statement.alternate))
}

function isPromiseChainCallbackSwitchStatement(statement) {
  return statement.cases.every(item => item.consequent.every(isPromiseChainCallbackStatement))
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

  const nextElements = [
    ...elements,
    { valueType }
  ]
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
    expression: valueType === 'boolean'
      ? `ccjs_bool_value((${value.expression}) != 0)`
      : `ccjs_number_value(${value.expression})`
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

  return [
    emitRuntimeTypeCheck(`${value}.tag != CCJS_TAG_NUMBER`, context),
    `double ${name} = ${value}.as.number;`
  ]
}

function emitPreparedArrayReceiver(expression, context) {
  if (expression?.type === 'ArrayLiteral') {
    const value = emitCArrayLiteralValueExpression(expression, context)

    return {
      lines: value.lines,
      expression: value.expression,
      elementType: resolveForOfElementType(expression.elements.map(element => ({
        valueType: inferExpressionType(element, context)
      })))
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
      elementType: context.runtimeArrayElementTypes.get(name) ?? resolveForOfElementType(context.arrayShapes.get(name) ?? [])
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

    const call = emitPreparedArrayMapCallExpression(expression, context) ?? emitPreparedArrayFilterCallExpression(expression, context) ?? emitPreparedArraySortCallExpression(expression, context) ?? emitCStringSplitValueExpression(expression, context)

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
  if (expression?.type !== 'NewExpression' || expression.callee.type !== 'Reference' || expression.callee.path.length !== 1) {
    return null
  }

  return ['Map', 'Set'].includes(expression.callee.path[0]) ? expression.callee.path[0] : null
}

function emitPreparedCollectionCallExpression(expression, context) {
  if (expression?.type !== 'CallExpression' || expression.callee.type !== 'MemberExpression') {
    return null
  }

  const receiver = emitPreparedCollectionReceiver(expression.callee.object, context)

  if (receiver == null) {
    return null
  }

  const call = receiver.type === 'map'
    ? emitPreparedMapMethodCall(receiver.expression, expression, context)
    : emitPreparedSetMethodCall(receiver.expression, expression, context)

  return {
    lines: [
      ...receiver.lines,
      ...call.lines
    ],
    expression: call.expression
  }
}

function emitPreparedCollectionReceiver(expression, context) {
  if (expression?.type === 'Reference' && expression.path.length === 1) {
    const name = expression.path[0]
    const type = context.variables.get(name)

    return type === 'map' || type === 'set'
      ? {
          type,
          lines: [],
          expression: name
        }
      : null
  }

  if (expression?.type === 'CallExpression') {
    const valueType = inferExpressionType(expression, context)

    if (valueType !== 'map' && valueType !== 'set') {
      return null
    }

    const call = emitPreparedCollectionCallExpression(expression, context)

    if (call != null && call.expression !== '') {
      return {
        type: valueType,
        lines: call.lines,
        expression: call.expression
      }
    }

    const value = emitCValueExpression(expression, context)

    return {
      type: valueType,
      lines: value.lines,
      expression: value.expression
    }
  }

  if (isMemberAccessExpression(expression) || isIndexAccessExpression(expression)) {
    const valueType = inferExpressionType(expression, context)

    if (valueType !== 'map' && valueType !== 'set') {
      return null
    }

    const value = emitCValueExpression(expression, context)

    return {
      type: valueType,
      lines: value.lines,
      expression: value.expression
    }
  }

  return null
}

function emitPreparedMapMethodCall(name, expression, context) {
  const method = expression.callee.property

  if (method === 'clear') {
    return {
      lines: [
        emitStatusCheck(`ccjs_map_clear(${name})`, context)
      ],
      expression: ''
    }
  }

  if (method === 'set') {
    reportCCollectionHashability(inferExpressionType(expression.args[0], context), 'Map keys', expression.args[0]?.loc ?? expression.loc, context)
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
    reportCCollectionHashability(inferExpressionType(expression.args[0], context), 'Map keys', expression.args[0]?.loc ?? expression.loc, context)
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
    reportCCollectionHashability(inferExpressionType(expression.args[0], context), 'Map keys', expression.args[0]?.loc ?? expression.loc, context)
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

  context.diagnostics.push(diagnostic('CCJS_C_COLLECTION', `Map.${method} is not supported by the current C backend slice`, expression.loc))

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

  reportCCollectionHashability(inferExpressionType(mapIndex.key, context), 'Map keys', mapIndex.key.loc ?? expression.loc, context)
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

  reportCCollectionHashability(inferExpressionType(mapIndex.key, context), 'Map keys', mapIndex.key.loc ?? expression.target.loc, context)
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
      lines: [
        emitStatusCheck(`ccjs_set_clear(${name})`, context)
      ],
      expression: ''
    }
  }

  if (method === 'add') {
    reportCCollectionHashability(inferExpressionType(expression.args[0], context), 'Set values', expression.args[0]?.loc ?? expression.loc, context)
    const value = emitCValueExpression(expression.args[0], context)

    return {
      lines: [
        ...value.lines,
        emitStatusCheck(`ccjs_set_add(${name}, ${value.expression})`, context)
      ],
      expression: name
    }
  }

  if (method === 'has' || method === 'delete') {
    reportCCollectionHashability(inferExpressionType(expression.args[0], context), 'Set values', expression.args[0]?.loc ?? expression.loc, context)
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

  context.diagnostics.push(diagnostic('CCJS_C_COLLECTION', `Set.${method} is not supported by the current C backend slice`, expression.loc))

  return {
    lines: [],
    expression: '0'
  }
}

function emitPreparedCollectionSizeExpression(expression, context) {
  if (expression?.type !== 'MemberExpression' || expression.property !== 'size') {
    return null
  }

  const receiver = emitPreparedCollectionReceiver(expression.object, context)

  if (receiver == null) {
    return null
  }

  const out = nextCName(context, `ccjs_${receiver.type}_size`)
  const helper = receiver.type === 'map' ? 'ccjs_map_size' : 'ccjs_set_size'

  return {
    lines: [
      ...receiver.lines,
      `size_t ${out} = 0;`,
      emitStatusCheck(`${helper}(${receiver.expression}, &${out})`, context)
    ],
    expression: out
  }
}

function cStringPredicateHelperName(method) {
  if (method === 'startsWith') {
    return 'ccjs_string_starts_with_parts'
  }

  if (method === 'endsWith') {
    return 'ccjs_string_ends_with_parts'
  }

  return 'ccjs_string_includes_parts'
}

function isStringLengthObject(expression, context) {
  if (expression == null) {
    return false
  }

  if (expression.type === 'StringLiteral') {
    return true
  }

  if (expression.type === 'TemplateLiteral') {
    return true
  }

  if (expression.type === 'Reference' && expression.path.length === 1) {
    const name = expression.path[0]

    return context.variables.get(name) === 'string' || context.runtimeStrings.has(name)
  }

  return inferExpressionType(expression, context) === 'string'
}

function isArrayLengthExpression(expression, context) {
  return expression?.type === 'MemberExpression'
    && expression.property === 'length'
    && inferExpressionType(expression.object, context) === 'array'
}

function isMemberAccessExpression(expression) {
  return expression?.type === 'MemberExpression' || expression?.type === 'OptionalMemberExpression'
}

function isIndexAccessExpression(expression) {
  return expression?.type === 'IndexExpression' || expression?.type === 'OptionalIndexExpression'
}

function resolveKnownObjectMember(expression, context) {
  if (!isMemberAccessExpression(expression)) {
    return null
  }

  const objectName = resolveCObjectExpressionName(expression.object)

  if (objectName == null) {
    return null
  }

  const fields = context.objectShapes.get(objectName)

  if (fields == null) {
    return null
  }

  const index = fields.findIndex(field => field.name === expression.property)

  if (index === -1) {
    return null
  }

  return {
    objectName,
    index,
    valueType: fields[index].valueType,
    arrayElementType: fields[index].arrayElementType,
    mapKeyType: fields[index].mapKeyType,
    mapValueType: fields[index].mapValueType,
    setElementType: fields[index].setElementType
  }
}

function emitObjectValueReference(name, context) {
  return context.boxedVariables.has(name) && context.variables.get(name) === 'object' ? `(*${name})` : name
}

function resolveKnownObjectIndex(expression, context) {
  if (!isIndexAccessExpression(expression) || expression.index.type !== 'StringLiteral') {
    return null
  }

  const objectName = resolveCObjectExpressionName(expression.object)

  if (objectName == null) {
    return null
  }

  const fields = context.objectShapes.get(objectName)

  if (fields == null) {
    return null
  }

  const index = fields.findIndex(field => field.name === expression.index.value)

  if (index === -1) {
    return null
  }

  return {
    objectName,
    key: expression.index.value,
    index,
    valueType: fields[index].valueType,
    arrayElementType: fields[index].arrayElementType,
    mapKeyType: fields[index].mapKeyType,
    mapValueType: fields[index].mapValueType,
    setElementType: fields[index].setElementType
  }
}

function resolveCObjectExpressionName(expression) {
  if (expression?.type === 'Reference' && expression.path.length === 1) {
    return expression.path[0]
  }

  if (expression?.type === 'ThisExpression') {
    return 'this'
  }

  return null
}

function updateKnownObjectMemberValueType(member, valueType, context) {
  if (valueType === 'unknown') {
    return
  }

  const fields = context.objectShapes.get(member.objectName)

  if (fields == null || fields[member.index] == null) {
    return
  }

  fields[member.index] = {
    ...fields[member.index],
    valueType
  }
}

function registerObjectShape(context, name, shape) {
  if (shape?.fields == null) {
    return
  }

  context.objectShapes.set(name, shape.fields.map(field => ({
    name: field.name,
    valueType: field.valueType,
    arrayElementType: field.arrayElementType,
    mapKeyType: field.mapKeyType,
    mapValueType: field.mapValueType,
    setElementType: field.setElementType
  })))
}

function resolveKnownArrayIndex(expression, context) {
  if (expression?.type !== 'IndexExpression' || expression.object.type !== 'Reference' || expression.object.path.length !== 1 || expression.index.type !== 'NumberLiteral') {
    return null
  }

  const arrayName = expression.object.path[0]
  const elements = context.arrayShapes.get(arrayName)

  if (elements == null) {
    return null
  }

  const index = Number.parseInt(expression.index.value, 10)

  if (!Number.isInteger(index) || index < 0 || index >= elements.length) {
    return null
  }

  return {
    arrayName,
    index,
    valueType: elements[index].valueType
  }
}

function resolveRuntimeArrayIndex(expression, context) {
  if (expression?.type !== 'IndexExpression' || expression.index.type !== 'NumberLiteral') {
    return null
  }

  const index = Number.parseInt(expression.index.value, 10)

  if (!Number.isInteger(index) || index < 0) {
    return null
  }

  const valueType = resolveRuntimeArrayElementType(expression.object, context)

  return valueType == null ? null : {
    index,
    valueType
  }
}

function resolveOptionalRuntimeArrayIndex(expression, context) {
  if (expression?.type !== 'OptionalIndexExpression' || expression.index.type !== 'NumberLiteral') {
    return null
  }

  const index = Number.parseInt(expression.index.value, 10)

  if (!Number.isInteger(index) || index < 0) {
    return null
  }

  const valueType = resolveRuntimeArrayElementType(expression.object, context)

  return valueType == null ? null : {
    index,
    valueType
  }
}

function resolveRuntimeArrayElementType(expression, context) {
  if (expression?.type === 'Reference' && expression.path.length === 1) {
    return context.runtimeArrayElementTypes.get(expression.path[0]) ?? null
  }

  if (expression?.type === 'CallExpression') {
    const functionReturn = resolveFunctionReturnNameFromCall(expression)

    return expression.valueType === 'array'
      ? expression.arrayElementType ?? (functionReturn == null ? null : context.functionReturnArrayElementTypes.get(functionReturn)) ?? 'unknown'
      : null
  }

  if (expression?.type === 'MemberExpression') {
    const member = resolveKnownObjectMember(expression, context)

    return member?.valueType === 'array' ? member.arrayElementType ?? 'unknown' : null
  }

  if (expression?.type === 'IndexExpression' && expression.index.type === 'StringLiteral') {
    const field = resolveKnownObjectIndex(expression, context)

    return field?.valueType === 'array' ? field.arrayElementType ?? 'unknown' : null
  }

  return null
}

function resolveRuntimeSetElementType(expression, context) {
  if (expression?.type === 'Reference' && expression.path.length === 1) {
    return context.setElementTypes.get(expression.path[0]) ?? null
  }

  if (expression?.type === 'CallExpression' || expression?.type === 'NewExpression') {
    const functionReturn = expression.type === 'CallExpression' ? resolveFunctionReturnNameFromCall(expression) : null

    return expression.valueType === 'set'
      ? expression.setElementType ?? (functionReturn == null ? null : context.functionReturnSetElementTypes.get(functionReturn)) ?? 'unknown'
      : null
  }

  if (expression?.type === 'MemberExpression') {
    const member = resolveKnownObjectMember(expression, context)

    return member?.valueType === 'set' ? member.setElementType ?? 'unknown' : null
  }

  if (expression?.type === 'IndexExpression' && expression.index.type === 'StringLiteral') {
    const field = resolveKnownObjectIndex(expression, context)

    return field?.valueType === 'set' ? field.setElementType ?? 'unknown' : null
  }

  return null
}

function resolveRuntimeMapType(expression, context) {
  if (expression?.type === 'Reference' && expression.path.length === 1) {
    return context.mapTypes.get(expression.path[0]) ?? null
  }

  if (expression?.type === 'CallExpression' || expression?.type === 'NewExpression') {
    const functionReturn = expression.type === 'CallExpression' ? resolveFunctionReturnNameFromCall(expression) : null
    const functionReturnMap = functionReturn == null ? null : context.functionReturnMapTypes.get(functionReturn) ?? null

    return expression.valueType === 'map'
      ? {
          key: expression.mapKeyType ?? functionReturnMap?.key ?? 'unknown',
          value: expression.mapValueType ?? functionReturnMap?.value ?? 'unknown'
        }
      : null
  }

  if (expression?.type === 'MemberExpression') {
    const member = resolveKnownObjectMember(expression, context)

    return member?.valueType === 'map'
      ? {
          key: member.mapKeyType ?? 'unknown',
          value: member.mapValueType ?? 'unknown'
        }
      : null
  }

  if (expression?.type === 'IndexExpression' && expression.index.type === 'StringLiteral') {
    const field = resolveKnownObjectIndex(expression, context)

    return field?.valueType === 'map'
      ? {
          key: field.mapKeyType ?? 'unknown',
          value: field.mapValueType ?? 'unknown'
        }
      : null
  }

  return null
}

function resolveFunctionReturnNameFromCall(expression) {
  return expression?.type === 'CallExpression' && expression.callee.type === 'Reference' && expression.callee.path.length === 1
    ? expression.callee.path[0]
    : null
}

function emitPreparedRuntimeArrayIndexValue(expression, element, context, prefix = 'ccjs_array_item') {
  const array = emitCValueExpression(expression.object, context)
  const value = nextCName(context, prefix)
  registerOwnedValue(context, value)

  return {
    lines: [
      ...array.lines,
      ...emitPrepareOwnedValueWrite(value),
      emitStatusCheck(`ccjs_array_get(${array.expression}, ${element.index}, &${value})`, context)
    ],
    expression: value
  }
}

function resolveKnownArrayLength(expression, context) {
  if (expression?.type !== 'MemberExpression' || expression.property !== 'length') {
    return null
  }

  if (expression.object.type === 'ArrayLiteral') {
    return `${expression.object.elements.length}`
  }

  if (expression.object.type !== 'Reference' || expression.object.path.length !== 1) {
    return null
  }

  const elements = context.arrayShapes.get(expression.object.path[0])

  return elements == null ? null : `${elements.length}`
}

function emitPreparedArrayLengthExpression(expression, context) {
  if (expression?.type !== 'MemberExpression' || expression.property !== 'length') {
    return null
  }

  const knownLength = resolveKnownArrayLength(expression, context)

  if (knownLength != null) {
    return {
      lines: [],
      expression: knownLength
    }
  }

  if (inferExpressionType(expression.object, context) !== 'array') {
    return null
  }

  const value = emitCValueExpression(expression.object, context)
  const temp = nextCName(context, 'ccjs_array_len')

  return {
    lines: [
      ...value.lines,
      `size_t ${temp} = 0;`,
      emitStatusCheck(`ccjs_array_len(${value.expression}, &${temp})`, context)
    ],
    expression: temp
  }
}

function resolveKnownForOfArray(expression, context) {
  if (expression?.type !== 'Reference' || expression.path.length !== 1) {
    return null
  }

  const name = expression.path[0]
  const elements = context.arrayShapes.get(name)

  return elements == null ? null : {
    name,
    elements
  }
}

function resolveRuntimeForOfArray(expression, context) {
  const elementType = resolveRuntimeArrayElementType(expression, context)

  if (elementType == null) {
    return null
  }

  if (expression?.type === 'Reference' && expression.path.length === 1) {
    return {
      name: expression.path[0],
      elementType,
      lines: []
    }
  }

  const value = emitCValueExpression(expression, context)

  return {
    name: value.expression,
    elementType,
    lines: value.lines
  }
}

function resolveRuntimeForOfSet(expression, context) {
  const elementType = resolveRuntimeSetElementType(expression, context)

  if (elementType == null) {
    return null
  }

  const receiver = emitPreparedCollectionReceiver(expression, context)

  if (receiver == null || receiver.type !== 'set') {
    return null
  }

  return {
    name: receiver.expression,
    elementType,
    lines: receiver.lines
  }
}

function resolveRuntimeForOfMap(expression, context) {
  const mapType = resolveRuntimeMapType(expression, context)

  if (mapType == null) {
    return null
  }

  const receiver = emitPreparedCollectionReceiver(expression, context)

  if (receiver == null || receiver.type !== 'map') {
    return null
  }

  return {
    name: receiver.expression,
    keyType: mapType.key,
    valueType: mapType.value,
    lines: receiver.lines
  }
}

function resolveForOfElementType(elements) {
  if (elements.length === 0) {
    return 'unknown'
  }

  const [first] = elements

  if (first?.valueType == null || first.valueType === 'unknown') {
    return 'unknown'
  }

  return elements.every(element => element.valueType === first.valueType) ? first.valueType : 'unknown'
}

function updateKnownArrayElementValueType(element, valueType, context) {
  if (valueType === 'unknown') {
    return
  }

  const elements = context.arrayShapes.get(element.arrayName)

  if (elements == null || elements[element.index] == null) {
    return
  }

  elements[element.index] = {
    ...elements[element.index],
    valueType
  }
}

function emitStatusCheck(call, context) {
  return `if (${call} != CCJS_OK) ${emitFailureStatement(context)}`
}

function emitRuntimeTypeCheck(condition, context) {
  return `if (${condition}) ${emitFailureStatement(context)}`
}

function emitFailureStatement(context) {
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

function registerOwnedValue(context, name) {
  if (!context.ownedValues.includes(name)) {
    context.ownedValues.push(name)
  }
}

function registerOwnedPromise(context, name, valueType = 'unknown', rejectionValueType = 'unknown') {
  if (!context.ownedPromises.includes(name)) {
    context.ownedPromises.push(name)
  }

  context.variables.set(name, 'promise')
  context.promiseValueTypes.set(name, valueType)
  context.promiseRejectionValueTypes.set(name, rejectionValueType)
}

function registerEventLoop(context) {
  context.eventLoopUsed = true
  context.usedCleanupGoto = true
}

function registerBoxedValue(context, name, valueType = 'number') {
  if (!context.boxedValues.includes(name)) {
    context.boxedValues.push(name)
  }

  context.boxedValueTypes.set(name, valueType)
}

function emitPrepareOwnedValueWrite(name) {
  return [
    `ccjs_release(${name});`,
    `${name} = ccjs_undefined_value();`
  ]
}

function shouldEmitCleanupLabel(context) {
  return context.throwingFunction
    || context.returnType !== 'void'
    || (context.returnType === 'void' && (context.ownedValues.length > 0 || context.ownedPromises.length > 0 || context.boxedValues.length > 0 || context.eventLoopUsed || context.usedCleanupGoto))
}

function emitReturnValueDeclarations(context) {
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

function emitStatusResultDeclarations(context) {
  return context.throwingFunction ? ['ccjs_status ccjs_status_result = CCJS_OK;'] : []
}

function emitLoopFlowDeclarations(context) {
  return [
    ...(context.breakFlowUsed ? ['int ccjs_break_active = 0;'] : []),
    ...(context.continueFlowUsed ? ['int ccjs_continue_active = 0;'] : [])
  ]
}

function emitReturnFlowDeclarations(context) {
  return context.returnFlowUsed ? ['int ccjs_return_active = 0;'] : []
}

function emitOwnedValueDeclarations(context) {
  return context.ownedValues.map(name => `ccjs_value ${name} = ccjs_undefined_value();`)
}

function emitOwnedPromiseDeclarations(context) {
  return context.ownedPromises.map(name => `ccjs_promise* ${name} = 0;`)
}

function emitEventLoopDeclarations(context) {
  return context.eventLoopUsed && !context.externalEventLoop
    ? [
        'ccjs_loop ccjs_loop;',
        'int ccjs_loop_active = 0;'
      ]
    : []
}

function emitErrorChannelDeclarations(context) {
  return context.errorChannelUsed ? ['int ccjs_error_active = 0;'] : []
}

function emitBoxedValueDeclarations(context) {
  return context.boxedValues.map(name => isRuntimeBoxedValueType(context.boxedValueTypes.get(name))
    ? `ccjs_value* ${name} = 0;`
    : `double* ${name} = 0;`)
}

function emitOwnedValueCleanup(context) {
  return context.ownedValues.toReversed().map(name => `ccjs_release(${name});`)
}

function emitOwnedPromiseCleanup(context) {
  return context.ownedPromises.toReversed().flatMap(name => {
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

function emitEventLoopInit(context) {
  if (!context.eventLoopUsed) {
    return []
  }

  if (context.externalEventLoop) {
    return [
      `if (ccjs_loop == 0) ${emitFailureStatement(context)}`
    ]
  }

  return [
    `if (ccjs_loop_init(&ccjs_loop, &ccjs_default_allocator) != CCJS_OK) ${emitFailureStatement(context)}`,
    'ccjs_loop_active = 1;'
  ]
}

function emitEventLoopDrain(context) {
  if (!context.eventLoopUsed || context.externalEventLoop) {
    return []
  }

  const loop = emitEventLoopReference(context)

  return [
    `while (ccjs_loop_has_work(${loop})) {`,
    `  ${emitStatusCheck(`ccjs_loop_poll(${loop}, ccjs_loop.now_ms + 1)`, context)}`,
    '}'
  ]
}

function emitEventLoopCleanup(context) {
  return context.eventLoopUsed && !context.externalEventLoop ? ['if (ccjs_loop_active) ccjs_loop_dispose(&ccjs_loop);'] : []
}

function emitEventLoopReference(context) {
  return context.externalEventLoop ? 'ccjs_loop' : '&ccjs_loop'
}

function emitBoxedValueCleanup(context) {
  return context.boxedValues.toReversed().flatMap(name => isRuntimeBoxedValueType(context.boxedValueTypes.get(name))
    ? [
        `if (${name} != 0) {`,
        `  ccjs_release(*${name});`,
        `  ccjs_default_free(0, ${name}, sizeof(ccjs_value), _Alignof(ccjs_value));`,
        '}'
      ]
    : [`if (${name} != 0) ccjs_default_free(0, ${name}, sizeof(double), _Alignof(double));`])
}

function isRuntimeBoxedValueType(valueType) {
  return ['string', 'object'].includes(valueType)
}

function emitCleanupReturn(context) {
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

function emitThrowingFunctionErrorTransfer(context) {
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

function emitThrowingFunctionCleanupReturn(context) {
  const lines = [
    'if (ccjs_status_result != CCJS_OK) return ccjs_status_result;'
  ]

  if (context.returnType !== 'void') {
    lines.push(`*${context.functionReturnOut} = ccjs_return;`)
  }

  lines.push('return CCJS_OK;')

  return lines
}

function nextCName(context, prefix) {
  const name = `${prefix}_${context.nextId}`
  context.nextId += 1

  return name
}

function cStringLiteral(value) {
  return JSON.stringify(value)
}

function emitCIdentifier(value) {
  return value.replaceAll(/[^A-Za-z0-9_]/g, '_')
}

function utf8ByteLength(value) {
  return Buffer.byteLength(value, 'utf8')
}

function usesCJsGlobal(expression, context) {
  const root = rootReferenceName(expression)

  return root != null && isCJsGlobalRoot(root, context)
}

function cTimeRuntimeCallName(callee) {
  if (callee?.type !== 'MemberExpression' || callee.object.type !== 'Reference' || callee.object.path.length !== 1) {
    return null
  }

  if (callee.object.path[0] === 'Date' && callee.property === 'now') {
    return 'ccjs_date_now'
  }

  if (callee.object.path[0] === 'performance' && callee.property === 'now') {
    return 'ccjs_performance_now'
  }

  return null
}

function cFsRuntimeCallName(callee) {
  if (callee?.type !== 'MemberExpression' || callee.object.type !== 'Reference' || callee.object.path.length !== 1) {
    return null
  }

  if (callee.object.path[0] !== 'fs') {
    return null
  }

  return ['readFile', 'readFileBytes', 'readFileBytesSync', 'readFileSync', 'readDir', 'readDirSync', 'writeFile', 'writeFileBytes', 'writeFileBytesSync', 'writeFileSync'].includes(callee.property) ? callee.property : null
}

function cJsonRuntimeCallName(callee) {
  if (callee?.type !== 'MemberExpression' || callee.object.type !== 'Reference' || callee.object.path.length !== 1) {
    return null
  }

  if (callee.object.path[0] !== 'JSON') {
    return null
  }

  return ['parse', 'stringify'].includes(callee.property) ? callee.property : null
}

function binaryRuntimeMethodName(callee) {
  if (callee?.type !== 'MemberExpression') {
    return null
  }

  if (callee.object?.type === 'Reference' && callee.object.path.length === 1 && callee.object.path[0] === 'Buffer') {
    return ['alloc', 'from'].includes(callee.property) ? callee.property : null
  }

  return ['slice', 'toString'].includes(callee.property) ? callee.property : null
}

function isBinaryRuntimeCall(expression) {
  return expression?.type === 'CallExpression'
    && typeof expression.binaryRuntimeMethod === 'string'
    && binaryRuntimeMethodName(expression.callee) === expression.binaryRuntimeMethod
}

function isBufferFromCall(expression) {
  return isBinaryRuntimeCall(expression) && expression.binaryRuntimeMethod === 'from'
}

function isBufferAllocCall(expression) {
  return isBinaryRuntimeCall(expression) && expression.binaryRuntimeMethod === 'alloc'
}

function isBytesSliceCall(expression, context) {
  return isBinaryRuntimeCall(expression)
    && expression.binaryRuntimeMethod === 'slice'
    && inferExpressionType(expression.callee.object, context) === 'bytes'
}

function isBytesToStringCall(expression, context) {
  return isBinaryRuntimeCall(expression)
    && expression.binaryRuntimeMethod === 'toString'
    && inferExpressionType(expression.callee.object, context) === 'bytes'
}

function isBinaryConstructorExpression(expression) {
  return expression?.type === 'NewExpression'
    && expression.callee.type === 'Reference'
    && expression.callee.path.length === 1
    && expression.callee.path[0] === 'Uint8Array'
    && expression.valueType === 'bytes'
}

function mathRuntimeMethodName(callee) {
  if (callee?.type !== 'MemberExpression' || callee.object.type !== 'Reference' || callee.object.path.length !== 1) {
    return null
  }

  if (callee.object.path[0] !== 'Math') {
    return null
  }

  return cMathNullaryMethods.has(callee.property) || cMathUnaryMethods.has(callee.property) || cMathBinaryMethods.has(callee.property)
    ? callee.property
    : null
}

function cTimerRuntimeCallName(callee) {
  if (callee?.type !== 'Reference' || callee.path.length !== 1) {
    return null
  }

  return cTimerStartCallName(callee) ?? cTimerClearCallName(callee)
}

function cTimerStartCallName(callee) {
  if (callee?.type !== 'Reference' || callee.path.length !== 1) {
    return null
  }

  return ['setImmediate', 'setInterval', 'setTimeout'].includes(callee.path[0]) ? callee.path[0] : null
}

function cTimerClearCallName(callee) {
  if (callee?.type !== 'Reference' || callee.path.length !== 1) {
    return null
  }

  return ['clearImmediate', 'clearInterval', 'clearTimeout'].includes(callee.path[0]) ? callee.path[0] : null
}

function timerCallbackFunctionType() {
  return {
    kind: 'function',
    params: [],
    returnType: 'void',
    returnNullable: false
  }
}

function cPromiseRuntimeCallName(callee) {
  if (callee?.type !== 'MemberExpression' || callee.object.type !== 'Reference' || callee.object.path.length !== 1) {
    return null
  }

  if (callee.object.path[0] !== 'Promise') {
    return null
  }

  return ['resolve', 'reject'].includes(callee.property) ? callee.property : null
}

function isPromiseMethodCallExpression(expression, context) {
  return expression?.type === 'CallExpression'
    && expression.callee?.type === 'MemberExpression'
    && ['catch', 'then'].includes(expression.callee.property)
    && inferExpressionType(expression.callee.object, context) === 'promise'
}

function isPromiseMethodAst(expression) {
  return expression?.type === 'CallExpression'
    && expression.callee?.type === 'MemberExpression'
    && ['catch', 'then'].includes(expression.callee.property)
}

function isPlainPromiseReturningFunctionName(name, context) {
  return context.functionReturnTypes.get(name) === 'promise'
    && context.functionAsyncFlags.get(name) !== true
}

function functionTakesEventLoopParam(name, context) {
  return isPlainPromiseReturningFunctionName(name, context)
    || context.externalEventLoopFunctions.has(name)
}

function isPromiseReturningFunctionCallee(callee, context) {
  return callee?.type === 'Reference'
    && callee.path.length === 1
    && isPlainPromiseReturningFunctionName(callee.path[0], context)
}

function isExternalEventLoopFunctionCallee(callee, context) {
  return callee?.type === 'Reference'
    && callee.path.length === 1
    && context.externalEventLoopFunctions.has(callee.path[0])
}

function resolvePromiseReturningFunctionValueType(callee, context) {
  if (!isPromiseReturningFunctionCallee(callee, context)) {
    return 'unknown'
  }

  return context.functionReturnPromiseValueTypes.get(callee.path[0]) ?? 'unknown'
}

function isAsyncFunctionCallee(callee, context) {
  return callee?.type === 'Reference'
    && callee.path.length === 1
    && context.functionAsyncFlags.get(callee.path[0]) === true
}

function resolveCAsyncFunctionAwaitValueType(callee, context) {
  if (!isAsyncFunctionCallee(callee, context)) {
    return null
  }

  return context.functionReturnPromiseValueTypes.get(callee.path[0]) ?? 'unknown'
}

function isCJsGlobalRoot(name, context) {
  return context.jsGlobalRoots.has(name)
}

function rootReferenceName(expression) {
  if (expression?.type === 'Reference') {
    return expression.path[0]
  }

  if (expression?.type === 'MemberExpression' || expression?.type === 'OptionalMemberExpression') {
    return rootReferenceName(expression.object)
  }

  if (expression?.type === 'IndexExpression' || expression?.type === 'OptionalIndexExpression') {
    return rootReferenceName(expression.object)
  }

  return null
}

function isCStringRuntimeMethodName(name) {
  return name === 'trim' || name === 'slice' || name === 'split' || cStringPredicateMethods.has(name)
}

function withVariableScope(context, callback) {
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
    context.promiseRejectionValueTypes = previousPromiseRejectionValueTypes
    context.promiseValueTypes = previousPromiseValueTypes
    context.runtimeCallbacks = previousRuntimeCallbacks
    context.runtimeArrayElementTypes = previousRuntimeArrayElementTypes
    context.setElementTypes = previousSetElementTypes
    context.runtimeStrings = previousRuntimeStrings
  }
}

function withNullableScalarNarrowing(context, names, callback) {
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

function narrowNullableScalars(context, names) {
  for (const name of names) {
    context.narrowedNullableScalars.add(name)
  }
}

function escapeCString(value) {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replaceAll('\n', '\\n')
    .replaceAll('\r', '\\r')
    .replaceAll('\t', '\\t')
}
